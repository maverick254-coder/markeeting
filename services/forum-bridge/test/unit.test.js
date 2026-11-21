'use strict';

// The bridge's pure logic, without NodeBB: node --test test/unit.test.js
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { configuredKey, keyMatches, parseIdentity } = require('../lib/auth');
const { BridgeError, classify, plain } = require('../lib/errors');
const { baseUsername, settings } = require('../lib/identity');
const { parseListQuery, excerptOf, pageWindow } = require('../lib/read');
const { tagList } = require('../lib/write');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('the bridge key must be long and must match exactly', () => {
  assert.equal(configuredKey({ REDACTPLUS_BRIDGE_KEY: 'short' }), null);
  assert.equal(configuredKey({}), null);
  const key = 'x'.repeat(40);
  assert.equal(configuredKey({ REDACTPLUS_BRIDGE_KEY: key }), key);
  assert.equal(keyMatches(key, key), true);
  assert.equal(keyMatches(`${key}y`, key), false);
  assert.equal(keyMatches(undefined, key), false);
  assert.equal(keyMatches(key, null), false);
});

test('the identity header is parsed strictly', () => {
  const id = parseIdentity(encode({ sub: 'f:abc-123', name: ' Ada <b>Lovelace</b> ', emailVerified: true, roles: ['forum-moderator', 'bad role', 5], ip: '203.0.113.9' }));
  assert.deepEqual(id, { sub: 'f:abc-123', name: 'Ada bLovelace/b', emailVerified: true, roles: ['forum-moderator'], ip: '203.0.113.9' });
  assert.equal(parseIdentity(encode({ sub: 'x', emailVerified: 'true' })).emailVerified, false, 'only a real boolean counts');
  assert.equal(parseIdentity(encode({ sub: 'x', ip: 'not an ip' })).ip, undefined);
  for (const bad of [undefined, '', 'not-base64!!', encode({}), encode({ sub: 'has space' }), encode({ sub: 'x'.repeat(256) }), 'a'.repeat(5000)]) {
    assert.throws(() => parseIdentity(bad), err => err instanceof BridgeError && err.status === 400, String(bad).slice(0, 20));
  }
});

test("NodeBB's refusals become clear 4xx codes; unknown faults are 500", () => {
  const cases = {
    '[[error:no-privileges]]': [403, 'forbidden'],
    '[[error:self-vote]]': [403, 'forbidden'],
    '[[error:user-banned]]': [403, 'suspended'],
    '[[error:user-banned-reason, spam]]': [403, 'suspended'],
    '[[error:user-too-new, 10]]': [429, 'rate_limited'],
    '[[error:too-many-posts, 10]]': [429, 'rate_limited'],
    '[[error:already-flagged]]': [409, 'conflict'],
    '[[error:title-too-short, 15]]': [400, 'invalid'],
    '[[error:content-too-long, 20000]]': [400, 'invalid'],
    '[[error:no-topic]]': [404, 'not_found'],
    '[[error:invalid-file-type, .php]]': [415, 'unsupported_type'],
    '[[error:file-too-big, 5120]]': [413, 'too_large'],
    'connect ECONNREFUSED': [500, 'internal'],
  };
  for (const [message, [status, code]] of Object.entries(cases)) {
    const result = classify(new Error(message));
    assert.deepEqual([result.status, result.code], [status, code], message);
  }
  assert.deepEqual([classify({ code: 'LIMIT_FILE_SIZE', message: 'File too large' }).status], [413]);
  assert.equal(classify(new BridgeError(418, 'teapot', 'short and stout')).message, 'short and stout');
  assert.equal(plain('<strong>Too</strong> &amp; many'), 'Too & many');
});

test('list queries are bounded and validated', () => {
  assert.deepEqual(parseListQuery({}), { q: '', category: null, tag: null, filter: 'all', sort: 'activity', page: 1, pageSize: 10 });
  const q = parseListQuery({ q: 'a\u0000b', category: 'Exporting!', tag: 'PDF', filter: 'answered', sort: 'newest', page: '99999', pageSize: '500' });
  assert.equal(q.q, 'a b');
  assert.equal(q.category, null);
  assert.equal(q.tag, 'pdf');
  assert.equal(q.page, 1000);
  assert.equal(q.pageSize, 50);
  assert.deepEqual(pageWindow(25, 9, 10), { pageCount: 3, page: 3, start: 20 });
  assert.deepEqual(pageWindow(0, 1, 10), { pageCount: 1, page: 1, start: 0 });
  assert.equal(excerptOf('# Title\n\n```\ncode\n```\nSee [docs](https://x) ![img](y)'), 'Title See docs');
});

test('tags, usernames and settings', () => {
  assert.deepEqual(tagList([' PDF ', 'pdf', 'export', 'bad tag', '<x>', 'a', 1, 'b'.repeat(31), 'one', 'two', 'three', 'four']), ['pdf', 'export', 'a', 'one', 'two']);
  assert.equal(baseUsername('Ada Lovelace'), 'Ada Lovelace');
  assert.equal(baseUsername(''), 'customer');
  assert.equal(baseUsername('<>'), 'customer');
  assert.equal(settings({}).moderatorRole, 'forum-moderator');
  assert.equal(settings({}).moderatorTtlMs, 15 * 60_000);
  assert.equal(settings({ REDACTPLUS_BRIDGE_MODERATOR_TTL_MINUTES: '-3' }).moderatorTtlMs, 15 * 60_000);
  assert.equal(settings({ REDACTPLUS_BRIDGE_REQUIRE_VERIFIED_EMAIL: 'false' }).requireVerifiedEmail, false);
});

// --- Announcements ------------------------------------------------------------------------------
const announcements = require('../lib/announcements');
const { migrateAnnouncements, describe: describeMigration } = require('../lib/announcement-migration');

test('only staff-marked, live topics reach /news, pinned first then newest', () => {
  const { STAFF_FIELD } = announcements;
  const rows = [
    { tid: 1, pinned: 0, timestamp: 100, [STAFF_FIELD]: '1' },
    { tid: 2, pinned: 1, timestamp: 50, [STAFF_FIELD]: '1' },
    { tid: 3, pinned: 0, timestamp: 300 },                       // in the category without the mark
    { tid: 4, pinned: 0, timestamp: 200, [STAFF_FIELD]: '1', deleted: 1 },
    { tid: 5, pinned: 0, timestamp: 400, [STAFF_FIELD]: '0' },
    { tid: 6, pinned: 0, timestamp: 250, [STAFF_FIELD]: '1' },
  ];
  assert.deepEqual(announcements.newsOrder(announcements.staffMarked(rows)).map(r => r.tid), [2, 6, 1]);
});

test('announcement types, staff check and list query', () => {
  assert.equal(announcements.typeOf({ type: 'news' }), 'news');
  assert.equal(announcements.typeOf({}), 'announcement');
  assert.throws(() => announcements.typeOf({ type: 'release' }), /News or Announcement/);
  assert.equal(announcements.typeFromTags(['news', 'pdf']), 'news');
  assert.equal(announcements.typeFromTags([]), 'announcement');
  assert.throws(() => announcements.requireStaff({ isModerator: false }), err => err.status === 403 && err.code === 'staff_only');
  assert.doesNotThrow(() => announcements.requireStaff({ isModerator: true }));
  assert.deepEqual(announcements.parseListQuery({ type: 'NEWS', limit: '500' }), { type: 'news', limit: 50 });
  assert.deepEqual(announcements.parseListQuery({ type: 'other' }), { type: null, limit: 20 });
});

/** An in-memory NodeBB just large enough for the migration. */
function fakeForum({ topics, tags = {}, members = {}, verified = {} }) {
  const state = { topics: new Map(topics.map(t => [t.tid, { ...t }])), tags: { ...tags }, sets: new Map(), removed: [] };
  for (const set of ['redactplus:questions:activity', 'redactplus:questions:unanswered', 'topics:unsolved']) state.sets.set(set, new Set(topics.map(t => t.tid)));
  const db = {
    getSortedSetRange: async (set) => (set === 'cid:1:tids' ? topics.filter(t => !t.pinned).map(t => String(t.tid)) : set === 'cid:1:tids:pinned' ? topics.filter(t => t.pinned).map(t => String(t.tid)) : []),
    sortedSetsRemove: async (sets, tid) => { for (const s of sets) state.sets.get(s)?.delete(tid); state.removed.push(tid); },
  };
  const api = {
    getTopicsFields: async (tids, fields) => tids.map(tid => { const t = state.topics.get(tid); return t ? Object.fromEntries(fields.map(f => [f, t[f]])) : null; }),
    setTopicFields: async (tid, data) => Object.assign(state.topics.get(tid), data),
    setTopicField: async (tid, field, value) => { state.topics.get(tid)[field] = value; },
    getTopicTags: async tid => state.tags[tid] || [],
    addTags: async (list, tids) => { for (const tid of tids) state.tags[tid] = [...(state.tags[tid] || []), ...list]; },
  };
  const groups = { isMembers: async (uids, group) => uids.map(uid => (members[group] || []).includes(uid)) };
  const user = { getUsersFields: async uids => uids.map(uid => ({ uid, redactplusModVerifiedAt: verified[uid] || 0 })) };
  return { state, deps: { cid: 1, db, topics: api, groups, user, staffField: announcements.STAFF_FIELD } };
}

test('the Announcements migration converts staff topics once and leaves the rest alone', async () => {
  const { state, deps } = fakeForum({
    topics: [
      { tid: 10, uid: 7, title: 'Welcome to the RedactPlus community', isQuestion: '1', isSolved: '0', pinned: 1 },
      { tid: 11, uid: 8, title: 'Admin notice', isQuestion: '1', isSolved: '1' },
      { tid: 12, uid: 9, title: 'A customer wrote here before', isQuestion: '1' },
      { tid: 13, uid: 7, title: 'Already migrated', isQuestion: '0', [announcements.STAFF_FIELD]: '1' },
    ],
    tags: { 11: ['release'], 13: ['news'] },
    members: { administrators: [8] },
    // uid 7 lost the group to the moderator sweep but was verified as a moderator before.
    verified: { 7: 1_700_000_000_000 },
  });

  const first = await migrateAnnouncements(deps);
  assert.equal(first.examined, 4);
  assert.deepEqual(first.migrated.map(m => [m.tid, m.changes]), [
    [10, ['question flag removed', 'staff mark set', 'tag announcement added']],
    [11, ['question flag removed', 'staff mark set']],
  ]);
  assert.deepEqual(first.leftAlone, [12]);
  const welcome = state.topics.get(10);
  assert.equal(welcome.isQuestion, 0);
  assert.equal(welcome[announcements.STAFF_FIELD], 1);
  assert.deepEqual(state.tags[10], ['announcement']);
  assert.deepEqual(state.tags[11], ['release'], 'existing tags are kept');
  assert.equal(state.sets.get('redactplus:questions:activity').has(10), false, 'it leaves the question lists');
  assert.equal(state.topics.get(12).isQuestion, '1', "a customer's topic is not touched");
  assert.equal(state.topics.get(12)[announcements.STAFF_FIELD], undefined);
  assert.match(describeMigration(first).join('\n'), /migrated tid 10 "Welcome to the RedactPlus community"/);

  const second = await migrateAnnouncements(deps);
  assert.deepEqual(second.migrated, [], 'a second run changes nothing');
  assert.deepEqual(second.leftAlone, [12]);
});

test('the migration does nothing without an Announcements category', async () => {
  assert.deepEqual(await migrateAnnouncements({ cid: null }), { examined: 0, migrated: [], leftAlone: [] });
});
