// Integration test for the RedactPlus bridge against a running NodeBB (never production).
//
//   FORUM_BRIDGE_URL=http://localhost:4567 FORUM_BRIDGE_KEY_FILE=/path/bridge-key.txt node test/integration.mjs
//   node test/integration.mjs --verify-persisted   (after restarting NodeBB: the saved question survives)
//
// NodeBB's real posting delays stay on, so the run waits between posts (about three minutes).
// Each run uses fresh identities. Results are written to test/integration-result.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const base = (process.env.FORUM_BRIDGE_URL || 'http://localhost:4567').replace(/\/$/, '') + '/redactplus-bridge/v1';
const key = (process.env.FORUM_BRIDGE_KEY || readFileSync(process.env.FORUM_BRIDGE_KEY_FILE || '../../../.nodebb-trial/bridge-key.txt', 'utf8')).trim();
const resultFile = new URL('./integration-result.json', import.meta.url);
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 160) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${String(detail).slice(0, 120)})` : ''}`);
};

const stamp = Date.now().toString(36);
const person = (label, extra = {}) => ({ sub: `it-${label}-${stamp}`, name: `${label[0].toUpperCase()}${label.slice(1)} Tester`, emailVerified: true, roles: [], ip: '127.0.0.1', ...extra });
const alice = person('alice');
const bob = person('bob');
const mod = person('moderator', { roles: ['forum-moderator'] });
const former = person('former', { roles: ['forum-moderator'] });
const stale = person('stale', { roles: ['forum-moderator'] });
const unverified = person('unverified', { emailVerified: false });
const climber = person('climber', { roles: ['administrators', 'admin', 'Global Moderators'] });
const herald = person('herald', { roles: ['forum-moderator'] });

const header = who => Buffer.from(JSON.stringify(who)).toString('base64url');
async function call(who, method, path, body, { rawKey = key, idem, form } = {}) {
  const headers = {};
  if (rawKey !== null) headers['x-redactplus-bridge-key'] = rawKey;
  if (who) headers['x-redactplus-identity'] = typeof who === 'string' ? who : header(who);
  if (idem) headers['idempotency-key'] = idem;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload });
  const type = res.headers.get('content-type') || '';
  const json = type.includes('json') ? await res.json() : null;
  return { status: res.status, json, data: json && json.data, error: json && json.error, headers: res.headers, res };
}

// NodeBB keeps new accounts from posting for initialPostDelay and spaces a newbie's posts.
const lastPost = new Map();
async function paced(who, work, gapMs = 31_000) {
  const wait = (lastPost.get(who.sub) || 0) + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  const out = await work();
  lastPost.set(who.sub, Date.now());
  return out;
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const fileForm = (bytes, name, type) => { const f = new FormData(); f.append('files[]', new Blob([bytes], { type }), name); return f; };

if (process.argv.includes('--verify-persisted')) {
  const saved = JSON.parse(readFileSync(resultFile, 'utf8'));
  const who = saved.persisted.viewer;
  const thread = await call(who, 'GET', `/questions/${saved.persisted.questionId}`);
  check('After a restart: the question, answers and accepted answer are still there', thread.status === 200 && thread.data.answers.length >= 1 && thread.data.answers.some(a => a.accepted), `status ${thread.status}`);
  const image = await fetch(`${base}/uploads/files/${saved.persisted.upload.split('/').pop()}`, { headers: { 'x-redactplus-bridge-key': key } });
  check('After a restart: the uploaded image is still served', image.status === 200, image.status);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}

if (process.argv.includes('--sweep-only')) {
  // Run against a NodeBB started with REDACTPLUS_BRIDGE_MODERATOR_TTL_MINUTES=1 and
  // REDACTPLUS_BRIDGE_SWEEP_SECONDS=15: a moderator who never returns loses the rights.
  const granted = await call(stale, 'GET', '/me');
  const beforeSweep = (await call(null, 'GET', '/health')).data.linkedModerators;
  await sleep(Number(process.env.FORUM_SWEEP_WAIT_SECONDS || 95) * 1000);
  const afterSweep = (await call(null, 'GET', '/health')).data.linkedModerators;
  check('The sweep removes moderator rights nobody re-confirmed within the TTL', granted.data.isModerator && afterSweep < beforeSweep, `${beforeSweep} -> ${afterSweep}`);
  const back = await call({ ...stale, roles: [] }, 'GET', '/me');
  check('The swept account is an ordinary customer', back.data.isModerator === false);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}

// ---------- the bridge itself ----------
check('Refuses a request without the bridge key', (await call(alice, 'GET', '/me', undefined, { rawKey: null })).status === 401);
check('Refuses a wrong bridge key', (await call(alice, 'GET', '/me', undefined, { rawKey: 'x'.repeat(40) })).status === 401);
check('Refuses a missing customer identity', (await call(null, 'GET', '/me')).status === 400);
check('Refuses an identity without a valid subject', (await call(header({ sub: 'bad sub with spaces' }), 'GET', '/me')).status === 400);
const health = await call(null, 'GET', '/health');
check('Health: ready, six categories, accepted answers available', health.status === 200 && health.data.categories === 6 && health.data.acceptedAnswers, JSON.stringify(health.data));
const unknown = await call(alice, 'GET', '/nope');
check('Unknown routes answer 404 in the error shape', unknown.status === 404 && unknown.error && unknown.error.code === 'not_found');

// ---------- provisioning ----------
const first = await Promise.all(Array.from({ length: 6 }, () => call(alice, 'GET', '/me')));
const again = await call(alice, 'GET', '/me');
const uids = new Set([...first, again].filter(r => r.status === 200).map(r => r.data.uid));
check('Concurrent first requests all succeed and create one account (by subject)', uids.size === 1 && [...first, again].every(r => r.status === 200), `uids ${[...uids].join(',')}; statuses ${first.map(r => r.status).join(',')}`);
const twins = Array.from({ length: 4 }, (_, n) => person(`twin${n}`, { name: 'Same Name' }));
const twinResults = await Promise.all(twins.map(who => Promise.all(Array.from({ length: 5 }, () => call(who, 'GET', '/me')))));
const twinUids = twinResults.map(list => new Set(list.map(r => r.data && r.data.uid)));
check('Same-named customers arriving at once each get exactly one account', twinResults.every(list => list.every(r => r.status === 200)) && twinUids.every(set => set.size === 1) && new Set(twinUids.map(set => [...set][0])).size === 4,
  twinUids.map(set => [...set].join('/')).join(' '));
const renamed = await call({ ...alice, name: 'Alice Renamed' }, 'GET', '/me');
check('A changed display name reuses the same account', renamed.data && renamed.data.uid === again.data.uid);
const sameEmailOtherSub = await call({ ...bob }, 'GET', '/me');
check('A different subject is a different account', sameEmailOtherSub.data && sameEmailOtherSub.data.uid !== again.data.uid);
for (const who of [mod, former, stale, unverified]) await call(who, 'GET', '/me');
const modMe = await call(mod, 'GET', '/me');
check('A moderator role from the identity provider grants moderator rights', modMe.data && modMe.data.isModerator === true);
const climb = await call(climber, 'GET', '/me');
check('Role names cannot grant administrator or moderator rights', climb.data && climb.data.isModerator === false, JSON.stringify(climb.data));
await sleep(11_000); // NodeBB's initialPostDelay for new accounts

// ---------- questions ----------
const ask = { category: 'exporting', title: `Exported PDF still shows text under boxes ${stamp}`, body: 'After exporting, **selecting text** under a box still copies it. Which setting burns redactions in?', tags: ['pdf', 'export'] };
const idemKey = `ask-${stamp}-0000000000`;
const q = await paced(alice, () => call(alice, 'POST', '/questions', ask, { idem: idemKey }));
check('A customer asks a question (Markdown, tags, category)', q.status === 201 && q.data.id, `${q.status} ${JSON.stringify(q.error || q.data)}`);
const tid = q.data && q.data.id;
const replay = await call(alice, 'POST', '/questions', ask, { idem: idemKey });
check('Resubmitting with the same request key does not post twice', replay.status === 201 && replay.data.id === tid && replay.data.replayed === true, `${replay.status} ${JSON.stringify(replay.data || replay.error)}`);
const tooSoon = await call(alice, 'POST', '/questions', { ...ask, title: `${ask.title} again` });
check("NodeBB's posting delay applies through the bridge (429)", tooSoon.status === 429 && tooSoon.error.code === 'rate_limited', `${tooSoon.status} ${tooSoon.error && tooSoon.error.message}`);
const badCategory = await call(bob, 'POST', '/questions', { ...ask, category: 'staff-only' });
check('An unknown category is refused (400)', badCategory.status === 400);
const shortTitle = await paced(bob, () => call(bob, 'POST', '/questions', { ...ask, title: 'Too short' }), 0);
check("NodeBB's title rules apply (400 with NodeBB's message)", shortTitle.status === 400 && /title/i.test(shortTitle.error.message), shortTitle.error && shortTitle.error.message);
const unverifiedAsk = await call(unverified, 'POST', '/questions', ask);
check('An unverified email can read but not post (403)', unverifiedAsk.status === 403 && unverifiedAsk.error.code === 'email_unverified');

// ---------- uploads ----------
const up = await call(alice, 'POST', '/uploads', undefined, { form: fileForm(png, 'screenshot.png', 'image/png') });
check('A customer uploads a PNG', up.status === 201 && up.data.files[0].url.startsWith('/assets/uploads/files/'), `${up.status} ${JSON.stringify(up.error || up.data)}`);
const uploadUrl = up.data && up.data.files[0].url;
const disguised = await call(alice, 'POST', '/uploads', undefined, { form: fileForm(Buffer.from('<?php echo 1; ?>'), 'evil.png', 'image/png') });
check('A non-image renamed .png is refused by its bytes (415)', disguised.status === 415, `${disguised.status} ${disguised.error && disguised.error.message}`);
const svg = await call(alice, 'POST', '/uploads', undefined, { form: fileForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml') });
check('SVG is refused (415)', svg.status === 415 || svg.status === 400, svg.status);
const big = await call(alice, 'POST', '/uploads', undefined, { form: fileForm(Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]), 'big.png', 'image/png') });
check('An image over 5 MB is refused (413)', big.status === 413, `${big.status} ${big.error && big.error.code}`);
const served = await fetch(`${base}/uploads/files/${uploadUrl.split('/').pop()}`, { headers: { 'x-redactplus-bridge-key': key } });
check('The upload is served as an image with nosniff', served.status === 200 && served.headers.get('content-type') === 'image/png' && served.headers.get('x-content-type-options') === 'nosniff', served.headers.get('content-type'));
const traversal = await fetch(`${base}/uploads/files/..%2F..%2Fconfig.json`, { headers: { 'x-redactplus-bridge-key': key } });
check('Upload paths cannot escape the uploads folder', traversal.status === 404, traversal.status);

// ---------- answers and comments ----------
const a1 = await paced(bob, () => call(bob, 'POST', `/questions/${tid}/answers`, { body: 'Turn on **Flatten output** in Export settings; it rasterises redacted pages.' }, { idem: `ans-${stamp}-00000000001` }));
check('A second customer answers', a1.status === 201, `${a1.status} ${JSON.stringify(a1.error || a1.data)}`);
const a2 = await paced(mod, () => call(mod, 'POST', `/questions/${tid}/answers`, { body: 'Staff answer: use Export, then *Check output* to verify nothing is selectable.', attachments: [{ url: uploadUrl, name: 'x.png', sizeBytes: 70 }] }));
check("Nobody can attach another customer's upload (403)", a2.status === 403, `${a2.status}`);
const a2b = await paced(mod, () => call(mod, 'POST', `/questions/${tid}/answers`, { body: 'Staff answer: use Export, then *Check output* to verify nothing is selectable.' }), 0);
check('A moderator answers', a2b.status === 201, `${a2b.status} ${JSON.stringify(a2b.error)}`);
const c1 = await paced(alice, () => call(alice, 'POST', `/questions/${tid}/comments`, { parentId: a1.data.id, body: 'Does flatten keep the file searchable?' }));
check('The asker comments on an answer', c1.status === 201, `${c1.status} ${JSON.stringify(c1.error)}`);
const c2 = await paced(bob, () => call(bob, 'POST', `/questions/${tid}/comments`, { parentId: c1.data.id, body: 'Only the unredacted text, via OCR.' }));
check('A reply to a comment nests under it', c2.status === 201, `${c2.status} ${JSON.stringify(c2.error)}`);
const mainPid = (await call(alice, 'GET', `/questions/${tid}`)).data.mainPid;
const qComment = await paced(mod, () => call(mod, 'POST', `/questions/${tid}/comments`, { parentId: mainPid, body: 'Which version of RedactPlus are you using?' }));
check('A comment on the question itself', qComment.status === 201, `${qComment.status} ${JSON.stringify(qComment.error)}`);

const other = await paced(bob, () => call(bob, 'POST', '/questions', { category: 'documents', title: `Unrelated question about scanned files ${stamp}`, body: 'How do I redact a scanned page that has no text layer at all?', tags: ['ocr'] }));
const otherThread = await call(bob, 'GET', `/questions/${other.data.id}`);
const foreignParent = await paced(alice, () => call(alice, 'POST', `/questions/${tid}/comments`, { parentId: otherThread.data.mainPid, body: 'This should not attach across questions.' }));
check("A comment's parent must be in the same question (400)", foreignParent.status === 400, foreignParent.status);

let thread = (await call(alice, 'GET', `/questions/${tid}`)).data;
check('The thread separates answers from comments', thread.answers.length === 2 && thread.comments.length === 1 && thread.answers.find(a => a.id === a1.data.id).comments[0].replies.length === 1, `answers ${thread.answers.length}, question comments ${thread.comments.length}`);
const listed = (await call(alice, 'GET', `/questions?q=${encodeURIComponent(stamp)}&pageSize=50`)).data.items.find(i => i.id === tid);
check('The list counts answers only, not comments', listed && listed.answerCount === 2, listed && listed.answerCount);

// ---------- votes ----------
const v1 = await call(alice, 'PUT', `/posts/${a1.data.id}/vote`, { direction: 'up' });
check('Up-vote an answer', v1.status === 200 && v1.data.score === 1, JSON.stringify(v1.data || v1.error));
const selfVote = await call(bob, 'PUT', `/posts/${a1.data.id}/vote`, { direction: 'up' });
check('Voting on your own post is refused (403)', selfVote.status === 403, `${selfVote.status} ${selfVote.error && selfVote.error.code}`);
const v2 = await call(bob, 'PUT', `/posts/${a2b.data.id}/vote`, { direction: 'down' });
const v3 = await call(bob, 'PUT', `/posts/${a2b.data.id}/vote`, { direction: 'none' });
check('Down-vote, then withdraw the vote', v2.data && v2.data.score === -1 && v3.data && v3.data.score === 0, `${JSON.stringify(v2.data || v2.error)} ${JSON.stringify(v3.data || v3.error)}`);
thread = (await call(alice, 'GET', `/questions/${tid}`)).data;
check("The thread reports the viewer's own vote", thread.answers.find(a => a.id === a1.data.id).viewer.vote === 1);

// ---------- accepted answer ----------
const strangerAccept = await call(bob, 'PUT', `/questions/${tid}/accepted`, { postId: a1.data.id });
check('Only the asker (or a moderator) can accept (403)', strangerAccept.status === 403, strangerAccept.status);
const commentAccept = await call(alice, 'PUT', `/questions/${tid}/accepted`, { postId: c1.data.id });
check('A comment cannot be accepted (400)', commentAccept.status === 400, commentAccept.status);
const foreignAccept = await call(alice, 'PUT', `/questions/${tid}/accepted`, { postId: otherThread.data.mainPid });
check('A post from another question cannot be accepted (400)', foreignAccept.status === 400, foreignAccept.status);
const accepted = await call(alice, 'PUT', `/questions/${tid}/accepted`, { postId: a1.data.id });
const answered = (await call(alice, 'GET', '/questions?filter=answered&pageSize=50')).data.items.some(i => i.id === tid);
check('The asker accepts an answer; the question lists as answered', accepted.status === 200 && answered);
const unaccepted = await call(alice, 'DELETE', `/questions/${tid}/accepted`);
const unansweredNow = (await call(alice, 'GET', '/questions?filter=answered&pageSize=50')).data.items.some(i => i.id === tid);
check('Acceptance can be withdrawn', unaccepted.status === 200 && !unansweredNow);
await call(alice, 'PUT', `/questions/${tid}/accepted`, { postId: a1.data.id });

// ---------- edit and delete ----------
const strangerEdit = await call(bob, 'PUT', `/questions/${tid}`, { ...ask, body: 'hijacked body that is long enough to pass' });
check("A customer cannot edit someone else's question (403)", strangerEdit.status === 403, strangerEdit.status);
const ownEdit = await paced(alice, () => call(alice, 'PUT', `/questions/${tid}`, { ...ask, title: `${ask.title} (edited)`, tags: ['pdf', 'export', 'flatten'], attachments: [{ url: uploadUrl, name: 'screenshot.png', sizeBytes: png.length }] }), 0);
thread = (await call(alice, 'GET', `/questions/${tid}`)).data;
check('The asker edits title, tags and attachments', ownEdit.status === 200 && thread.title.endsWith('(edited)') && thread.tags.includes('flatten') && thread.attachments.length === 1, `${ownEdit.status} ${JSON.stringify(ownEdit.error)}`);
const editAnswer = await call(bob, 'PUT', `/posts/${a1.data.id}`, { body: 'Turn on **Flatten output** in Export settings. (Edited for clarity.)' });
check('An author edits their own answer', editAnswer.status === 200, `${editAnswer.status} ${JSON.stringify(editAnswer.error)}`);
const strangerDelete = await call(bob, 'DELETE', `/posts/${c1.data.id}`);
check("A customer cannot delete someone else's comment (403)", strangerDelete.status === 403, strangerDelete.status);

// ---------- tags, categories, search, pagination, views ----------
const tagList = (await call(alice, 'GET', '/tags?limit=50')).data;
check('Popular tags include the new tag', tagList.some(t => t.tag === 'flatten'));
const byTag = (await call(alice, 'GET', '/questions?tag=flatten&pageSize=50')).data;
const byCategory = (await call(alice, 'GET', '/questions?category=documents&pageSize=50')).data;
check('Filter by tag and by category', byTag.items.some(i => i.id === tid) && byCategory.items.some(i => i.id === other.data.id) && !byCategory.items.some(i => i.id === tid));
const search = (await call(alice, 'GET', '/questions?q=searchable&pageSize=50')).data;
check('Full-text search finds a question by a comment in it', search.items.some(i => i.id === tid), `${search.total} match(es)`);
const page2 = (await call(alice, 'GET', '/questions?pageSize=1&page=2')).data;
const pageFar = (await call(alice, 'GET', '/questions?pageSize=1&page=999')).data;
check('Pagination: page 2 of size 1, and an out-of-range page is clamped', page2.page === 2 && page2.items.length === 1 && pageFar.page === pageFar.pageCount, `${page2.page}/${page2.pageCount}, far ${pageFar.page}`);
const before = (await call(bob, 'GET', `/questions/${tid}`)).data.viewCount;
await call(bob, 'GET', `/questions/${tid}?view=1`);
await call(bob, 'GET', `/questions/${tid}?view=1`);
await call(mod, 'GET', `/questions/${tid}?view=1`);
const after = (await call(bob, 'GET', `/questions/${tid}`)).data.viewCount;
check('Views count once per person per hour', after === before + 2, `${before} -> ${after}`);
check('Invalid ids answer 404', (await call(alice, 'GET', '/questions/abc')).status === 404 && (await call(alice, 'GET', '/questions/99999999')).status === 404);

// ---------- notifications ----------
await sleep(4000);
const notes = (await call(alice, 'GET', '/notifications')).data;
check('The asker is notified of answers, with links to the question', notes.items.length > 0 && notes.items.some(n => n.link && n.link.questionId === tid), `${notes.items.length} item(s), unread ${notes.unread}`);
const cleared = await call(alice, 'POST', '/notifications/read', { all: true });
check('Mark all notifications read', cleared.status === 200 && cleared.data.unread === 0);

// ---------- reporting and moderation ----------
const reported = await call(bob, 'POST', `/posts/${c1.data.id}/reports`, { reason: 'Off-topic (integration test)' });
check('A customer reports a post', reported.status === 201, `${reported.status} ${JSON.stringify(reported.error)}`);
const reportedAgain = await call(bob, 'POST', `/posts/${c1.data.id}/reports`, { reason: 'Again' });
check('Reporting the same post twice is refused (4xx)', reportedAgain.status >= 400 && reportedAgain.status < 500, reportedAgain.status);
check('Customers cannot see the report queue (403)', (await call(alice, 'GET', '/moderation/reports')).status === 403);
const queue = await call(mod, 'GET', '/moderation/reports');
const flag = queue.data && queue.data.items.find(item => item.post && item.post.id === c1.data.id);
check('A moderator sees the report with its reason and a link', Boolean(flag && flag.link && flag.reasons.length), JSON.stringify(flag || queue.error));
const resolved = await call(mod, 'PUT', `/moderation/reports/${flag && flag.id}`, { state: 'resolved' });
check('A moderator resolves the report', resolved.status === 200, `${resolved.status} ${JSON.stringify(resolved.error)}`);
const modDelete = await call(mod, 'DELETE', `/posts/${c2.data.id}`);
thread = (await call(alice, 'GET', `/questions/${tid}`)).data;
const modView = (await call(mod, 'GET', `/questions/${tid}`)).data;
check("A moderator removes someone else's comment; customers no longer see it", modDelete.status === 200 && thread.answers.find(a => a.id === a1.data.id).comments[0].replies.length === 0, modDelete.status);
check('Moderators still see the removed comment, marked, and can restore it', modView.answers.find(a => a.id === a1.data.id).comments[0].replies[0].viewer.canRestore === true);
const restored = await call(mod, 'POST', `/posts/${c2.data.id}/restore`);
check('A moderator restores it', restored.status === 200);
check('Customers cannot restore posts (403)', (await call(alice, 'POST', `/posts/${c2.data.id}/restore`)).status === 403);

// ---------- announcements (the portal's /news) ----------
const healthNow = (await call(alice, 'GET', '/health')).data;
check("NodeBB's own privileges keep Announcements staff-only (members read and reply, moderators create)", healthNow.announcementsStaffOnly === true, JSON.stringify(healthNow));
const custAnnounce = await paced(alice, () => call(alice, 'POST', '/questions', { category: 'announcements', title: `A customer tries to announce ${stamp}`, body: 'Customers must not be able to post announcements.', type: 'news' }));
check('A customer cannot create a topic in Announcements (403 staff_only)', custAnnounce.status === 403 && custAnnounce.error.code === 'staff_only', `${custAnnounce.status} ${JSON.stringify(custAnnounce.error)}`);
await call(herald, 'GET', '/me');
const ann1 = await paced(mod, () => call(mod, 'POST', '/questions', { category: 'announcements', title: `RedactPlus 9.9 is available now ${stamp}`, body: 'The new release improves audio review and adds faster export checks.', type: 'announcement' }));
check('A moderator creates an announcement, and it is not a question', ann1.status === 201 && ann1.data.kind === 'announcement' && ann1.data.type === 'announcement', `${ann1.status} ${JSON.stringify(ann1.error || ann1.data)}`);
const news1 = await paced(herald, () => call(herald, 'POST', '/questions', { category: 'announcements', title: `RedactPlus at the privacy summit ${stamp}`, body: 'The team will present redaction review practice at the summit next month.', type: 'news' }));
check('A second moderator posts news', news1.status === 201 && news1.data.type === 'news', `${news1.status} ${JSON.stringify(news1.error || news1.data)}`);
const annThread = await call(alice, 'GET', `/questions/${ann1.data.id}`);
check('Customers open the announcement thread; no accepted-answer controls, no pin', annThread.status === 200 && annThread.data.kind === 'announcement' && annThread.data.viewer.canAccept === false && annThread.data.viewer.canPin === false && annThread.data.viewer.canAnswer === true, `${annThread.status} ${JSON.stringify(annThread.data && annThread.data.viewer)}`);
const annReply = await paced(alice, () => call(alice, 'POST', `/questions/${ann1.data.id}/answers`, { body: 'Thanks, looking forward to trying the export checks.' }));
check('A customer replies to an announcement', annReply.status === 201, `${annReply.status} ${JSON.stringify(annReply.error)}`);
const annAccept = await call(mod, 'PUT', `/questions/${ann1.data.id}/accepted`, { postId: annReply.data && annReply.data.id });
check('Announcements have no accepted answer (400)', annAccept.status === 400, annAccept.status);
const questionsNow = (await call(alice, 'GET', '/questions?pageSize=50&sort=newest')).data;
check('Announcements are not listed as questions (no unanswered state)', !questionsNow.items.some(i => i.id === ann1.data.id || i.id === news1.data.id));
const custPin = await call(alice, 'PUT', `/announcements/${ann1.data.id}/pinned`, { pinned: true });
check('A customer cannot pin (403)', custPin.status === 403, custPin.status);
const pinNews = await call(mod, 'PUT', `/announcements/${news1.data.id}/pinned`, { pinned: true });
check('A moderator pins an item', pinNews.status === 200 && pinNews.data.pinned === true, `${pinNews.status} ${JSON.stringify(pinNews.error)}`);
let feed = (await call(alice, 'GET', '/announcements')).data.items;
const mine = feed.filter(i => i.id === ann1.data.id || i.id === news1.data.id);
check('/announcements lists the staff posts, pinned first, with type and reply count', mine.length === 2 && feed[0].id === news1.data.id && feed[0].pinned === true && mine.find(i => i.id === ann1.data.id).replyCount === 1, JSON.stringify(feed.slice(0, 3).map(i => [i.id, i.pinned, i.announcementType])));
const onlyNews = (await call(alice, 'GET', '/announcements?type=news')).data.items;
check('/announcements filters by type', onlyNews.some(i => i.id === news1.data.id) && !onlyNews.some(i => i.id === ann1.data.id));
check('Questions never appear in /announcements', !feed.some(i => i.id === tid));
const moveIn = await call(mod, 'PUT', `/questions/${tid}`, { category: 'announcements', title: thread.title, body: 'Trying to move a question into Announcements.', tags: [] });
check('Questions cannot be moved into Announcements (400)', moveIn.status === 400, moveIn.status);
// The author loses the role; their post stays on /news, because authorship was recorded at creation.
const heraldGone = await call({ ...herald, roles: [] }, 'GET', '/me');
feed = (await call(alice, 'GET', '/announcements')).data.items;
check("A post stays on /news after its author loses the moderator role", heraldGone.data.isModerator === false && feed.some(i => i.id === news1.data.id), `isModerator ${heraldGone.data.isModerator}`);
const heraldAgain = await paced(herald, () => call({ ...herald, roles: [] }, 'POST', '/questions', { category: 'announcements', title: `No longer staff, trying again ${stamp}`, body: 'This must be refused now that the role is gone.', type: 'news' }));
check('Without the role, the same person can no longer announce (403)', heraldAgain.status === 403, heraldAgain.status);
const unpin = await call(mod, 'PUT', `/announcements/${news1.data.id}/pinned`, { pinned: false });
check('A moderator unpins it', unpin.status === 200 && unpin.data.pinned === false, unpin.status);

// ---------- former moderator: revoked on the next request ----------
const formerAnswer = await paced(alice, () => call(alice, 'POST', `/questions/${tid}/answers`, { body: 'A third answer that a moderator might remove later on.' }));
check('Set-up: a post the former moderator will try to remove', formerAnswer.status === 201, formerAnswer.status);
const revoked = { ...former, roles: [] };
const formerMe = await call(revoked, 'GET', '/me');
const formerDelete = await call(revoked, 'DELETE', `/posts/${formerAnswer.data.id}`);
const formerQueue = await call(revoked, 'GET', '/moderation/reports');
check('A removed moderator loses rights on their very next request', formerMe.data.isModerator === false && formerDelete.status === 403 && formerQueue.status === 403, `me ${formerMe.data.isModerator}, delete ${formerDelete.status}, queue ${formerQueue.status}`);

// ---------- suspension ----------
const suspend = await call(mod, 'POST', `/moderation/posts/${c2.data.id}/suspend-author`, { days: 1, reason: 'Integration test' });
check('A moderator suspends an author', suspend.status === 200, `${suspend.status} ${JSON.stringify(suspend.error)}`);
const bobPost = await call(bob, 'POST', `/questions/${tid}/answers`, { body: 'Suspended customers cannot post this.' });
const bobRead = await call(bob, 'GET', `/questions/${tid}`);
const bobMe = await call(bob, 'GET', '/me');
check('A suspended customer cannot post or read; the bridge says suspended', bobPost.status === 403 && bobPost.error.code === 'suspended' && bobRead.status === 403 && bobRead.error.code === 'suspended' && bobMe.data.suspended === true, `${bobPost.status} ${bobRead.status} ${bobMe.data && bobMe.data.suspended}`);
check('Customers cannot suspend anyone (403)', (await call(alice, 'POST', `/moderation/posts/${a2b.data.id}/suspend-author`, { days: 1 })).status === 403);

// ---------- delete own question ----------
const deleteOther = await call(bob, 'DELETE', `/posts/${otherThread.data.mainPid}`);
check('Suspended authors cannot delete either (403)', deleteOther.status === 403, deleteOther.status);

writeFileSync(resultFile, JSON.stringify({ stamp, results, persisted: { questionId: tid, upload: uploadUrl, viewer: alice } }, null, 2));
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
