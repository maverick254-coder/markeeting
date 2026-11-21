'use strict';

/**
 * RedactPlus portal bridge for NodeBB.
 *
 * A private, server-to-server API under /redactplus-bridge/v1. Only the portal calls it, from
 * its server, with the shared key in `x-redactplus-bridge-key` and the verified customer in
 * `x-redactplus-identity`. NodeBB itself is never published: customers use the portal, and the
 * NodeBB web UI is reachable only by administrators on the private network.
 *
 * Every route answers { ok: true, data } or { ok: false, error: { code, message } }.
 */

const { configuredKey, keyMatches, parseIdentity } = require('./lib/auth');
const { BridgeError, classify, fallback, plain } = require('./lib/errors');
const identity = require('./lib/identity');
const index = require('./lib/question-index');
const read = require('./lib/read');
const write = require('./lib/write');
const inbox = require('./lib/inbox');
const nb = require('./lib/nodebb');
const announcements = require('./lib/announcements');

const BASE = '/redactplus-bridge/v1';
const sweepSeconds = Number.parseInt(process.env.REDACTPLUS_BRIDGE_SWEEP_SECONDS || '300', 10);
const SWEEP_INTERVAL_MS = (Number.isFinite(sweepSeconds) && sweepSeconds >= 10 ? Math.min(sweepSeconds, 3600) : 300) * 1000;

function send(res, status, data) {
  res.set('cache-control', 'no-store');
  res.status(status).json({ ok: true, data });
}

async function fail(res, err) {
  const { status, code, message, key } = classify(err);
  let text = message;
  if (!text && status < 500 && key) {
    text = plain(await nb.translator().translate(key).catch(() => '')) || null;
    if (text && /^\[\[/.test(text)) text = null;
  }
  if (status >= 500) nb.winston().error(`[redactplus-bridge] ${code}: ${String(key || (err && err.message) || err).slice(0, 300)}`);
  res.set('cache-control', 'no-store');
  res.status(status).json({ ok: false, error: { code, message: text || fallback[code] || fallback.internal } });
}

function authenticate(req, res, next) {
  const expected = configuredKey();
  if (!expected) return fail(res, new BridgeError(503, 'not_configured', 'The forum bridge is not configured.'));
  if (!keyMatches(req.get('x-redactplus-bridge-key'), expected)) return fail(res, new BridgeError(401, 'unauthorized', 'The bridge key is missing or wrong.'));
  return next();
}

/** Route handler that resolves the customer first (provision + role reconciliation). */
function asViewer(handler, status = 200, { allowSuspended = false } = {}) {
  return async (req, res) => {
    try {
      const viewer = await identity.resolve(parseIdentity(req.get('x-redactplus-identity')));
      // NodeBB gives suspended (banned) accounts no read rights; say so instead of "not found".
      if (viewer.banned && !allowSuspended) throw new BridgeError(403, 'suspended', 'Your forum account is suspended.');
      const result = await handler(viewer, req);
      send(res, result && result.queued ? 202 : status, result);
    } catch (err) {
      await fail(res, err);
    }
  };
}

/**
 * Whether NodeBB itself keeps Announcements staff-only: ordinary members may read and reply but
 * not create topics, and Global Moderators may (scripts/setup-forum.js). Reported by /health so
 * the forum's own privilege, not only the bridge's check, can be verified.
 */
async function announcementsStaffOnly(bySlug) {
  const cid = bySlug.get(announcements.SLUG);
  if (!cid) return false;
  const [members, mods] = await Promise.all([
    nb.privileges().categories.groupPrivileges(cid, 'registered-users'),
    nb.privileges().categories.groupPrivileges(cid, identity.MODERATORS),
  ]);
  return !members['groups:topics:create'] && Boolean(members['groups:topics:read']) && Boolean(members['groups:topics:reply']) && Boolean(mods['groups:topics:create']);
}

const id = value => {
  const n = Number.parseInt(value, 10);
  if (!/^\d{1,12}$/.test(String(value)) || !Number.isSafeInteger(n) || n <= 0) throw new BridgeError(404, 'not_found', 'That question or post does not exist.');
  return n;
};
const idem = req => req.get('idempotency-key') || null;

exports.init = async function ({ router }) {
  const multer = require.main.require('./src/middleware/multer');
  const r = (method, route, ...handlers) => router[method](`${BASE}${route}`, authenticate, ...handlers);

  r('get', '/health', async (req, res) => {
    try {
      const { bySlug } = await index.categoryMap();
      const moderators = await nb.groups().getMembers(identity.MODERATORS, 0, -1);
      const linked = moderators.length ? (await nb.user().getUsersFields(moderators, ['redactplusId'])).filter(row => row && row.redactplusId).length : 0;
      send(res, 200, { status: 'ready', categories: bySlug.size, acceptedAnswers: Boolean(nb.socketPlugins().QandA), linkedModerators: linked, announcementsStaffOnly: await announcementsStaffOnly(bySlug) });
    } catch (err) {
      await fail(res, err);
    }
  });

  r('get', '/me', asViewer(async viewer => ({
    uid: viewer.uid,
    isModerator: viewer.isModerator,
    canWrite: viewer.canWrite,
    suspended: viewer.banned,
    unreadNotifications: await nb.user().notifications.getUnreadCount(viewer.uid),
  }), 200, { allowSuspended: true }));
  r('get', '/categories', asViewer(() => inbox.categories()));
  r('get', '/questions', asViewer((viewer, req) => read.list(viewer, req.query || {})));
  r('get', '/tags', asViewer((viewer, req) => read.popularTags(viewer, Number.parseInt(req.query.limit, 10) || 12)));
  r('get', '/questions/:tid', asViewer((viewer, req) => read.thread(viewer, id(req.params.tid), { view: req.query.view === '1' })));
  r('get', '/announcements', asViewer((viewer, req) => read.listAnnouncements(viewer, req.query || {})));
  r('put', '/announcements/:tid/pinned', asViewer((viewer, req) => write.pinAnnouncement(viewer, id(req.params.tid), (req.body || {}).pinned)));
  r('get', '/questions/:tid/related', asViewer((viewer, req) => read.related(viewer, id(req.params.tid), Number.parseInt(req.query.limit, 10) || 5)));

  r('post', '/questions', asViewer((viewer, req) => write.createQuestion(viewer, req.body || {}, idem(req)), 201));
  r('put', '/questions/:tid', asViewer((viewer, req) => write.editQuestion(viewer, id(req.params.tid), req.body || {})));
  r('post', '/questions/:tid/answers', asViewer((viewer, req) => write.reply(viewer, id(req.params.tid), req.body || {}, idem(req)), 201));
  r('post', '/questions/:tid/comments', asViewer((viewer, req) => write.reply(viewer, id(req.params.tid), req.body || {}, idem(req), { parentPid: id((req.body || {}).parentId) }), 201));
  r('put', '/questions/:tid/accepted', asViewer((viewer, req) => write.accept(viewer, id(req.params.tid), id((req.body || {}).postId))));
  r('delete', '/questions/:tid/accepted', asViewer((viewer, req) => write.unaccept(viewer, id(req.params.tid))));

  r('put', '/posts/:pid', asViewer((viewer, req) => write.editPost(viewer, id(req.params.pid), req.body || {})));
  r('delete', '/posts/:pid', asViewer((viewer, req) => write.deletePost(viewer, id(req.params.pid))));
  r('post', '/posts/:pid/restore', asViewer((viewer, req) => write.restorePost(viewer, id(req.params.pid))));
  r('put', '/posts/:pid/vote', asViewer((viewer, req) => write.vote(viewer, id(req.params.pid), String((req.body || {}).direction || ''))));
  r('post', '/posts/:pid/reports', asViewer((viewer, req) => write.report(viewer, id(req.params.pid), (req.body || {}).reason), 201));

  r('get', '/notifications', asViewer(viewer => inbox.notifications(viewer)));
  r('post', '/notifications/read', asViewer((viewer, req) => inbox.markRead(viewer, req.body || {})));

  r('post', '/moderation/posts/:pid/suspend-author', asViewer((viewer, req) => write.suspendAuthor(viewer, id(req.params.pid), req.body || {})));
  r('get', '/moderation/reports', asViewer((viewer, req) => inbox.reports(viewer, req.query.page)));
  r('put', '/moderation/reports/:flagId', asViewer((viewer, req) => inbox.resolveReport(viewer, req.params.flagId, String((req.body || {}).state || ''))));

  // Multipart parsing first (NodeBB's own limits apply), then the customer.
  r('post', '/uploads', (req, res, next) => multer.array('files[]', 5)(req, res, err => (err ? fail(res, err) : next())),
    asViewer((viewer, req) => write.upload(viewer, req.files || []), 201));

  // Images stored by the bridge, streamed back through the portal (which requires a session).
  r('get', '/uploads/files/:name', (req, res) => {
    try {
      const { full, type } = write.uploadFile(String(req.params.name));
      res.set({ 'content-type': type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=3600', 'content-security-policy': "default-src 'none'; sandbox" });
      res.sendFile(full);
    } catch (err) {
      fail(res, err);
    }
  });

  r('all', '/*', (req, res) => fail(res, new BridgeError(404, 'not_found', 'No such bridge route.')));

  const primary = nb.nconf().get('isPrimary') !== false && nb.nconf().get('isPrimary') !== 'false';
  if (primary) {
    index.rebuildIfNeeded().catch(err => nb.winston().error(`[redactplus-bridge] index rebuild failed: ${err.message}`));
    const timer = setInterval(() => {
      identity.sweepModerators().catch(err => nb.winston().error(`[redactplus-bridge] moderator sweep failed: ${err.message}`));
    }, SWEEP_INTERVAL_MS);
    timer.unref();
  }
  if (!configuredKey()) nb.winston().warn('[redactplus-bridge] REDACTPLUS_BRIDGE_KEY is not set (32+ characters); the bridge answers 503.');
};

const quietly = work => Promise.resolve().then(work).catch(err => nb.winston().error(`[redactplus-bridge] index update failed: ${err.message}`));

// Only the bridge marks a topic as a staff announcement, after NodeBB has created it. Whatever
// reaches NodeBB's own topic creation (its UI, its API, another plugin) never carries the mark.
exports.filterTopicCreate = (data) => {
  if (data && data.topic) delete data.topic[announcements.STAFF_FIELD];
  return data;
};

exports.onTopicSave = ({ topic }) => quietly(() => index.refresh(Number(topic.tid)));
exports.onPostSave = ({ post }) => quietly(() => index.refresh(Number(post.tid)));
exports.onPostChange = ({ post }) => quietly(async () => index.refresh(Number(post.tid || await nb.posts().getPostField(post.pid, 'tid'))));
exports.onPostsPurge = ({ posts }) => quietly(async () => {
  for (const tid of new Set((posts || []).map(post => Number(post.tid)).filter(Boolean))) await index.refresh(tid);
});
exports.onTopicChange = data => quietly(() => index.refresh(Number((data.topic && data.topic.tid) || data.tid)));
exports.onTopicsPurge = ({ topics }) => quietly(() => index.remove((topics || []).map(topic => Number(topic.tid)).filter(Boolean)));

// For tests of the pure parts.
exports._internals = { BASE };
