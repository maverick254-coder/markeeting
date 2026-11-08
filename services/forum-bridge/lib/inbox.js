'use strict';

const { BridgeError, plain } = require('./errors');
const nb = require('./nodebb');
const index = require('./question-index');
const { excerptOf } = require('./read');

/** Notifications for the customer, and the report queue for moderators. */

async function translate(value) {
  try {
    return plain(await nb.translator().translate(String(value || '')));
  } catch {
    return plain(value);
  }
}

async function questionLinks(pids) {
  const rows = pids.length ? await nb.posts().getPostsFields(pids, ['pid', 'tid']) : [];
  const tids = [...new Set(rows.map(row => row && Number(row.tid)).filter(Boolean))];
  const topics = tids.length ? await nb.topics().getTopicsFields(tids, ['tid', 'slug', 'mainPid']) : [];
  const byTid = new Map(topics.map(topic => [Number(topic.tid), topic]));
  const links = new Map();
  for (const row of rows) {
    if (!row || !row.tid) continue;
    const topic = byTid.get(Number(row.tid));
    if (!topic) continue;
    links.set(Number(row.pid), {
      questionId: Number(topic.tid),
      slugTitle: String(topic.slug || '').split('/')[1] || 'question',
      postId: Number(topic.mainPid) === Number(row.pid) ? null : String(row.pid),
    });
  }
  return links;
}

async function notifications(viewer) {
  const { read, unread } = await nb.user().notifications.get(viewer.uid);
  const all = [...unread, ...read].slice(0, 50);
  const pids = [...new Set(all.map(n => Number(n.pid)).filter(Boolean))];
  const links = await questionLinks(pids);
  const items = [];
  for (const n of all) {
    const link = n.pid ? links.get(Number(n.pid)) : null;
    if (n.pid && !link) continue; // a removed post, or one the customer can no longer read
    items.push({
      id: String(n.nid),
      text: await translate(n.bodyShort),
      createdAt: new Date(Number(n.datetime) || Date.now()).toISOString(),
      read: Boolean(n.read),
      link,
    });
  }
  return { items, unread: await nb.user().notifications.getUnreadCount(viewer.uid) };
}

async function markRead(viewer, body) {
  const notifications = nb.notifications();
  if (body && body.all === true) {
    await notifications.markAllRead(viewer.uid);
  } else {
    const id = body && typeof body.id === 'string' ? body.id : '';
    if (!id || id.length > 300) throw new BridgeError(400, 'invalid', 'Choose a notification.');
    await notifications.markRead(id, viewer.uid);
  }
  return { unread: await nb.user().notifications.getUnreadCount(viewer.uid) };
}

function requireModerator(viewer) {
  if (!viewer.isModerator) throw new BridgeError(403, 'forbidden', 'Only moderators can see reports.');
}

async function reports(viewer, rawPage) {
  requireModerator(viewer);
  const page = Math.min(1000, Math.max(1, Number.parseInt(rawPage, 10) || 1));
  const result = await nb.flags().list({ filters: { state: 'open', type: 'post', page, perPage: 20 }, uid: viewer.uid, sort: 'newest' });
  const flags = result.flags || [];
  const pids = flags.map(flag => Number(flag.targetId)).filter(Boolean);
  const [links, posts] = await Promise.all([
    questionLinks(pids),
    pids.length ? nb.posts().getPostsFields(pids, ['pid', 'content', 'deleted', 'uid']) : [],
  ]);
  const byPid = new Map(posts.filter(Boolean).map(post => [Number(post.pid), post]));
  const items = [];
  for (const flag of flags) {
    const pid = Number(flag.targetId);
    const post = byPid.get(pid);
    const details = await nb.api().flags.get({ uid: viewer.uid }, { flagId: flag.flagId }).catch(() => null);
    const reasons = details && Array.isArray(details.reports) ? details.reports.map(r => plain(r.value)).filter(Boolean).slice(0, 5) : [];
    items.push({
      id: String(flag.flagId),
      createdAt: new Date(Number(flag.datetime) || Date.now()).toISOString(),
      reasons,
      reportCount: Number(flag.heat) || reasons.length || 1,
      post: post ? { id: String(pid), excerpt: excerptOf(post.content), deleted: Boolean(Number(post.deleted)) } : null,
      link: links.get(pid) || null,
    });
  }
  return { items, page: result.page || page, pageCount: result.pageCount || 1 };
}

async function resolveReport(viewer, flagId, state) {
  requireModerator(viewer);
  if (!/^\d{1,12}$/.test(String(flagId))) throw new BridgeError(404, 'not_found', 'No such report.');
  if (!['resolved', 'rejected'].includes(state)) throw new BridgeError(400, 'invalid', 'Choose resolved or rejected.');
  await nb.api().flags.update({ uid: viewer.uid }, { flagId: Number(flagId), state });
  return { id: String(flagId), state };
}

async function categories() {
  const { bySlug } = await index.categoryMap();
  return { categories: [...bySlug.keys()] };
}

module.exports = { notifications, markRead, reports, resolveReport, categories };
