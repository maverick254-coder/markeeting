'use strict';

const nb = require('./nodebb');

/**
 * Sorted sets the portal's question list reads, kept current by NodeBB hooks:
 *   redactplus:questions:activity    every live question, scored by last activity
 *   redactplus:questions:created     every live question, scored by creation time
 *   redactplus:questions:unanswered  live questions with no answer yet
 * plus the topic field `redactplusAnswers`: top-level answers only (NodeBB's postcount also
 * counts comments). "Answered" uses the Q&A plugin's own `topics:solved` set.
 *
 * Only questions (Q&A plugin `isQuestion`) in a category mapped to a portal section count.
 */

const SETS = {
  activity: 'redactplus:questions:activity',
  created: 'redactplus:questions:created',
  unanswered: 'redactplus:questions:unanswered',
};
const CATEGORY_HASH = 'redactplus:categories';
const INDEX_VERSION_KEY = 'redactplus:index:version';
const INDEX_VERSION = '1';

async function categoryMap() {
  const map = (await nb.db().getObject(CATEGORY_HASH)) || {};
  const bySlug = new Map();
  const byCid = new Map();
  for (const [slug, cid] of Object.entries(map)) {
    const id = Number.parseInt(cid, 10);
    if (!Number.isInteger(id)) continue;
    bySlug.set(slug, id);
    byCid.set(id, slug);
  }
  return { bySlug, byCid };
}

async function countAnswers(tid) {
  const topics = nb.topics();
  const posts = nb.posts();
  const mainPid = Number.parseInt(await topics.getTopicField(tid, 'mainPid'), 10);
  const pids = (await topics.getPids(tid)).map(Number).filter(pid => pid !== mainPid);
  if (!pids.length) return 0;
  const rows = await posts.getPostsFields(pids, ['toPid', 'deleted']);
  return rows.filter(row => row && !row.toPid && !Number(row.deleted)).length;
}

/** Brings one topic's set membership and answer count in line with its current state. */
async function refresh(tid) {
  const db = nb.db();
  const topic = await nb.topics().getTopicFields(tid, ['tid', 'cid', 'timestamp', 'lastposttime', 'deleted', 'isQuestion', 'scheduled']);
  const { byCid } = await categoryMap();
  const live = topic && topic.tid && String(topic.isQuestion) === '1' && !Number(topic.deleted) && !Number(topic.scheduled) && byCid.has(Number(topic.cid));
  if (!live) {
    await db.sortedSetsRemove(Object.values(SETS), tid);
    return;
  }
  const answers = await countAnswers(tid);
  await nb.topics().setTopicField(tid, 'redactplusAnswers', answers);
  await db.sortedSetAdd(SETS.activity, topic.lastposttime || topic.timestamp, tid);
  await db.sortedSetAdd(SETS.created, topic.timestamp, tid);
  if (answers === 0) await db.sortedSetAdd(SETS.unanswered, topic.timestamp, tid);
  else await db.sortedSetRemove(SETS.unanswered, tid);
}

async function remove(tids) {
  if (!tids.length) return;
  await nb.db().sortedSetsRemove(Object.values(SETS), tids);
}

/** Rebuilds every set from the mapped categories. Runs once per index version, at start-up. */
async function rebuildIfNeeded(force = false) {
  const db = nb.db();
  if (!force && (await db.get(INDEX_VERSION_KEY)) === INDEX_VERSION) return false;
  await db.deleteAll(Object.values(SETS));
  const { byCid } = await categoryMap();
  for (const cid of byCid.keys()) {
    const tids = await db.getSortedSetRange(`cid:${cid}:tids:create`, 0, -1).catch(() => []);
    const all = tids.length ? tids : await db.getSortedSetRange(`cid:${cid}:tids`, 0, -1);
    for (const tid of all) await refresh(Number(tid));
  }
  await db.set(INDEX_VERSION_KEY, INDEX_VERSION);
  return true;
}

module.exports = { SETS, CATEGORY_HASH, categoryMap, countAnswers, refresh, remove, rebuildIfNeeded };
