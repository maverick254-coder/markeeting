'use strict';

const { BridgeError } = require('./errors');
const nb = require('./nodebb');
const index = require('./question-index');
const { MODERATORS } = require('./identity');
const announcements = require('./announcements');

/**
 * Read side: question lists, whole threads, related questions and tags, already shaped for the
 * portal (which owns presentation). Every result passes NodeBB's read privileges for the viewer.
 *
 * Thread convention (the bridge also enforces it when posting):
 *   reply without toPid             → answer
 *   reply to the question post      → comment on the question
 *   reply to an answer or comment   → nested comment
 */

const MAX_PAGE_SIZE = 50;
const SEARCH_LIMIT = 200;

function excerptOf(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function attachmentsOf(raw) {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(item => item && typeof item.url === 'string').slice(0, 10) : [];
  } catch {
    return [];
  }
}

const iso = value => new Date(Number(value) || 0).toISOString();

async function authors(uids) {
  const unique = [...new Set(uids.map(Number).filter(uid => uid > 0))];
  const [rows, admins, mods] = await Promise.all([
    nb.user().getUsersFields(unique, ['uid', 'username', 'fullname']),
    nb.groups().isMembers(unique, 'administrators'),
    nb.groups().isMembers(unique, MODERATORS),
  ]);
  const map = new Map();
  rows.forEach((row, i) => {
    if (!row || !row.uid) return;
    map.set(Number(row.uid), { name: String(row.fullname || row.username || 'RedactPlus customer').slice(0, 80), isStaff: Boolean(admins[i] || mods[i]) });
  });
  return uid => map.get(Number(uid)) || { name: 'Former member', isStaff: false };
}

async function summaries(tids, viewer) {
  if (!tids.length) return [];
  const readable = await nb.privileges().topics.filterTids('topics:read', tids, viewer.uid);
  if (!readable.length) return [];
  const [{ byCid }, topics, tags] = await Promise.all([
    index.categoryMap(),
    nb.topics().getTopicsFields(readable, ['tid', 'cid', 'title', 'slug', 'uid', 'mainPid', 'timestamp', 'lastposttime', 'viewcount', 'postcount', 'pinned', 'isSolved', 'isQuestion', 'deleted', 'redactplusAnswers', announcements.STAFF_FIELD]),
    nb.topics().getTopicsTagsObjects(readable),
  ]);
  const mains = await nb.posts().getPostsFields(topics.map(t => t.mainPid), ['content', 'upvotes', 'downvotes']);
  const authorOf = await authors(topics.map(t => t.uid));
  return topics.map((topic, i) => {
    const categorySlug = byCid.get(Number(topic.cid));
    if (!topic || !topic.tid || !categorySlug || Number(topic.deleted)) return null;
    const announcement = categorySlug === announcements.SLUG;
    // Questions everywhere else; in Announcements, only topics marked as written by staff.
    if (announcement ? String(topic[announcements.STAFF_FIELD]) !== '1' : String(topic.isQuestion) !== '1') return null;
    const tagValues = (tags[i] || []).map(tag => tag.value);
    return {
      id: Number(topic.tid),
      slugTitle: String(topic.slug || '').split('/')[1] || 'question',
      kind: announcement ? 'announcement' : 'question',
      announcementType: announcement ? announcements.typeFromTags(tagValues) : null,
      replyCount: Math.max(0, (Number(topic.postcount) || 1) - 1),
      title: topic.title,
      excerpt: excerptOf(mains[i] && mains[i].content),
      categorySlug,
      tags: tagValues,
      author: authorOf(topic.uid),
      createdAt: iso(topic.timestamp),
      lastActivityAt: iso(topic.lastposttime || topic.timestamp),
      answerCount: Number(topic.redactplusAnswers) || 0,
      viewCount: Number(topic.viewcount) || 0,
      score: (Number(mains[i] && mains[i].upvotes) || 0) - (Number(mains[i] && mains[i].downvotes) || 0),
      hasAcceptedAnswer: String(topic.isSolved) === '1',
      pinned: Boolean(Number(topic.pinned)),
    };
  }).filter(Boolean);
}

function pageWindow(total, page, pageSize) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { pageCount, page: current, start: (current - 1) * pageSize };
}

function parseListQuery(query) {
  const one = key => (Array.isArray(query[key]) ? query[key][0] : query[key]) || '';
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(one('pageSize'), 10) || 10));
  const page = Math.min(1000, Math.max(1, Number.parseInt(one('page'), 10) || 1));
  const tag = String(one('tag')).toLowerCase();
  return {
    q: String(one('q')).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100),
    category: /^[a-z0-9-]{1,60}$/.test(one('category')) ? one('category') : null,
    tag: /^[a-z0-9][a-z0-9-]{0,30}$/.test(tag) ? tag : null,
    filter: ['answered', 'unanswered'].includes(one('filter')) ? one('filter') : 'all',
    sort: one('sort') === 'newest' ? 'newest' : 'activity',
    page,
    pageSize,
  };
}

async function list(viewer, rawQuery) {
  const query = parseListQuery(rawQuery);
  const db = nb.db();
  const { bySlug } = await index.categoryMap();
  const sortSet = query.sort === 'newest' ? index.SETS.created : index.SETS.activity;
  const sets = [sortSet];
  if (query.category) {
    if (!bySlug.has(query.category)) return { items: [], total: 0, page: 1, pageCount: 1, pageSize: query.pageSize };
    sets.push(`cid:${bySlug.get(query.category)}:tids`);
  }
  if (query.tag) sets.push(`tag:${query.tag}:topics`);
  if (query.filter === 'answered') sets.push('topics:solved');
  if (query.filter === 'unanswered') sets.push(index.SETS.unanswered);

  let ordered;
  let total;
  if (query.q) {
    // NodeBB's own search (dbsearch) decides which posts match; the filters then narrow it.
    const found = await nb.search().search({
      query: query.q, searchIn: 'titlesposts', matchWords: 'all', uid: viewer.uid,
      categories: [...bySlug.values()].map(String), returnIds: true, sortBy: 'relevance',
    });
    const replyTids = found.pids.length ? (await nb.posts().getPostsFields(found.pids.slice(0, SEARCH_LIMIT), ['tid'])).map(row => row && row.tid) : [];
    let tids = [...new Set([...found.tids, ...replyTids].filter(Boolean).map(Number))].slice(0, SEARCH_LIMIT);
    for (const set of sets) {
      const members = await db.isSortedSetMembers(set, tids);
      tids = tids.filter((_, i) => members[i]);
    }
    const scores = await db.sortedSetScores(sortSet, tids);
    ordered = tids.map((tid, i) => [tid, scores[i] || 0]).sort((a, b) => b[1] - a[1]).map(([tid]) => tid);
    total = ordered.length;
  }

  const unfiltered = !query.q && sets.length === 1;
  let pinned = [];
  if (unfiltered) {
    const pinnedSets = [...bySlug.values()].map(cid => `cid:${cid}:tids:pinned`);
    const candidates = pinnedSets.length ? (await db.getSortedSetRevRange(pinnedSets, 0, -1)).map(Number) : [];
    const scores = await db.sortedSetScores(sortSet, candidates);
    pinned = candidates.map((tid, i) => [tid, scores[i]]).filter(([, score]) => score !== null && score !== undefined).sort((a, b) => b[1] - a[1]).map(([tid]) => tid);
  }

  if (!query.q) total = sets.length === 1 ? await db.sortedSetCard(sortSet) : await db.sortedSetIntersectCard(sets);
  const { page, pageCount, start } = pageWindow(total, query.page, query.pageSize);

  let tids;
  if (query.q) {
    tids = ordered.slice(start, start + query.pageSize);
  } else if (unfiltered) {
    const fromPinned = pinned.slice(start, start + query.pageSize);
    const need = query.pageSize - fromPinned.length;
    const restStart = Math.max(0, start - pinned.length);
    const pinnedSet = new Set(pinned);
    const rest = need > 0 ? (await db.getSortedSetRevRange(sortSet, restStart, restStart + need + pinned.length - 1)).map(Number).filter(tid => !pinnedSet.has(tid)).slice(0, need) : [];
    tids = [...fromPinned, ...rest];
  } else {
    tids = (await db.getSortedSetRevIntersect({ sets, start, stop: start + query.pageSize - 1, weights: sets.map((_, i) => (i === 0 ? 1 : 0)) })).map(Number);
  }
  return { items: await summaries(tids, viewer), total, page, pageCount, pageSize: query.pageSize };
}

async function loadTopic(tid, viewer) {
  if (!Number.isSafeInteger(tid) || tid <= 0) throw new BridgeError(404, 'not_found', 'That question does not exist.');
  const topic = await nb.topics().getTopicFields(tid, ['tid', 'cid', 'uid', 'title', 'slug', 'mainPid', 'deleted', 'isQuestion', 'solvedPid', 'isSolved', 'locked', announcements.STAFF_FIELD]);
  const { byCid } = await index.categoryMap();
  const slug = topic && byCid.get(Number(topic.cid));
  // A question, or a staff-marked announcement; nothing else in the forum is shown.
  const shown = slug === announcements.SLUG ? String(topic[announcements.STAFF_FIELD]) === '1' : String(topic && topic.isQuestion) === '1';
  if (!topic || !topic.tid || !slug || !shown) throw new BridgeError(404, 'not_found', 'That question does not exist.');
  if (!(await nb.privileges().topics.canRead(tid, viewer.uid))) throw new BridgeError(404, 'not_found', 'That question does not exist.');
  if (Number(topic.deleted)) throw new BridgeError(404, 'not_found', 'That question has been removed.');
  return topic;
}

async function countView(tid, viewer) {
  if (!viewer.uid) return;
  const db = nb.db();
  const minutes = Number(nb.meta().config.incrementTopicViewsInterval) || 60;
  const key = `redactplus:views:${tid}`;
  const last = await db.sortedSetScore(key, viewer.uid);
  if (last && Date.now() - last < minutes * 60_000) return;
  await db.sortedSetAdd(key, Date.now(), viewer.uid);
  const cid = await nb.topics().getTopicField(tid, 'cid');
  const value = await db.incrObjectFieldBy(`topic:${tid}`, 'viewcount', 1);
  await db.sortedSetsAdd(['topics:views', `cid:${cid}:tids:views`], value, tid);
}

async function thread(viewer, tid, { view = false } = {}) {
  const topic = await loadTopic(tid, viewer);
  if (view) await countView(tid, viewer);
  const [base] = await summaries([tid], viewer);
  if (!base) throw new BridgeError(404, 'not_found', 'That question does not exist.');

  const posts = nb.posts();
  const privileges = nb.privileges();
  const pids = [...new Set((await nb.topics().getPids(tid)).map(Number))];
  const rows = (await posts.getPostsFields(pids, ['pid', 'uid', 'content', 'timestamp', 'edited', 'toPid', 'deleted', 'upvotes', 'downvotes', 'redactplusAttachments']))
    .filter(row => row && row.pid && (!Number(row.deleted) || viewer.isModerator));
  const visible = rows.map(row => Number(row.pid));
  const [status, topicPrivileges, edits, deletes] = await Promise.all([
    posts.getVoteStatusByPostIDs(visible, viewer.uid),
    privileges.topics.get(tid, viewer.uid),
    Promise.all(visible.map(pid => privileges.posts.canEdit(pid, viewer.uid).catch(() => ({ flag: false })))),
    Promise.all(visible.map(pid => privileges.posts.canDelete(pid, viewer.uid).catch(() => ({ flag: false })))),
  ]);
  const authorOf = await authors(rows.map(row => row.uid));
  const mainPid = Number(topic.mainPid);
  const isAsker = Number(topic.uid) === Number(viewer.uid);
  const write = viewer.canWrite && !Number(topic.locked);

  const shaped = new Map(rows.map((row, i) => {
    const own = Number(row.uid) === Number(viewer.uid);
    return [Number(row.pid), {
      id: String(row.pid),
      author: authorOf(row.uid),
      body: String(row.content || ''),
      createdAt: iso(row.timestamp),
      editedAt: Number(row.edited) ? iso(row.edited) : null,
      score: (Number(row.upvotes) || 0) - (Number(row.downvotes) || 0),
      deleted: Boolean(Number(row.deleted)),
      parent: row.toPid ? Number(row.toPid) : null,
      attachments: attachmentsOf(row.redactplusAttachments),
      viewer: {
        own,
        vote: status.upvotes[i] ? 1 : status.downvotes[i] ? -1 : 0,
        canVote: write && !own && Boolean(topicPrivileges['posts:upvote']),
        canDownvote: write && !own && Boolean(topicPrivileges['posts:downvote']),
        canEdit: viewer.canWrite && Boolean(edits[i] && edits[i].flag) && !Number(row.deleted),
        canDelete: viewer.canWrite && Boolean(deletes[i] && deletes[i].flag) && !Number(row.deleted),
        canRestore: viewer.isModerator && Boolean(Number(row.deleted)),
        canReport: write && !own && !Number(row.deleted),
      },
    }];
  }));

  const main = shaped.get(mainPid);
  if (!main) throw new BridgeError(404, 'not_found', 'That question has been removed.');
  const commentsUnder = (pid, depth = 0) => [...shaped.values()]
    .filter(post => post.parent === pid && Number(post.id) !== mainPid)
    .map(post => ({ ...post, replies: depth < 20 ? commentsUnder(Number(post.id), depth + 1) : [] }));
  const answers = [...shaped.values()]
    .filter(post => post.parent === null && Number(post.id) !== mainPid)
    .map(post => ({ ...post, accepted: String(topic.solvedPid) === post.id && String(topic.isSolved) === '1', comments: commentsUnder(Number(post.id)) }));

  return {
    ...base,
    answerCount: answers.filter(answer => !answer.deleted).length,
    body: main.body,
    attachments: main.attachments,
    editedAt: main.editedAt,
    deleted: Boolean(Number(topic.deleted)),
    locked: Boolean(Number(topic.locked)),
    comments: commentsUnder(mainPid),
    answers,
    viewer: {
      ...main.viewer,
      canAnswer: write && Boolean(topicPrivileges['topics:reply']),
      canComment: write && Boolean(topicPrivileges['topics:reply']),
      canAccept: base.kind === 'question' && viewer.canWrite && (isAsker || viewer.isModerator),
      canPin: base.kind === 'announcement' && viewer.isModerator,
      isModerator: viewer.isModerator,
    },
    mainPid,
  };
}

async function related(viewer, tid, limit) {
  const topic = await loadTopic(tid, viewer);
  const tags = (await nb.topics().getTopicTags(tid)) || [];
  const db = nb.db();
  const candidates = new Set();
  for (const tag of tags.slice(0, 5)) for (const id of await db.getSortedSetRevRange(`tag:${tag}:topics`, 0, 20)) candidates.add(Number(id));
  for (const id of await db.getSortedSetRevRange(`cid:${topic.cid}:tids`, 0, 20)) candidates.add(Number(id));
  candidates.delete(tid);
  const ids = [...candidates];
  const live = await db.isSortedSetMembers(index.SETS.activity, ids);
  const items = await summaries(ids.filter((_, i) => live[i]).slice(0, 30), viewer);
  return items.slice(0, Math.min(10, Math.max(1, limit)));
}

async function popularTags(viewer, limit) {
  const db = nb.db();
  const all = await db.getSortedSetRange(index.SETS.activity, 0, 999);
  const readable = await nb.privileges().topics.filterTids('topics:read', all.map(Number), viewer.uid);
  const tagLists = await nb.topics().getTopicsTagsObjects(readable);
  const counts = new Map();
  for (const list of tagLists) for (const tag of list || []) counts.set(tag.value, (counts.get(tag.value) || 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, Math.min(50, Math.max(1, limit)));
}

/**
 * The portal's /news: staff-marked topics in Announcements, pinned first, then newest, optionally
 * one type. Read privileges apply as for every other read.
 */
async function listAnnouncements(viewer, rawQuery) {
  const query = announcements.parseListQuery(rawQuery || {});
  const cid = await announcements.categoryId();
  if (!cid) return { items: [] };
  const db = nb.db();
  // Every topic in the category, then the mark, type and order decide; the category is small.
  // NodeBB moves a pinned topic out of the category's other sets into cid:X:tids:pinned.
  const pinned = (await db.getSortedSetRevRange(`cid:${cid}:tids:pinned`, 0, 499).catch(() => [])).map(Number);
  const created = (await db.getSortedSetRevRange(`cid:${cid}:tids:create`, 0, 499).catch(() => [])).map(Number);
  const rest = created.length ? created : (await db.getSortedSetRevRange(`cid:${cid}:tids`, 0, 499)).map(Number);
  const all = [...new Set([...pinned, ...rest])];
  const readable = await nb.privileges().topics.filterTids('topics:read', all, viewer.uid);
  const rows = announcements.staffMarked(await nb.topics().getTopicsFields(readable, ['tid', 'pinned', 'timestamp', 'deleted', announcements.STAFF_FIELD]));
  const ordered = announcements.newsOrder(rows).map(row => Number(row.tid));
  const items = (await summaries(ordered, viewer)).filter(item => !query.type || item.announcementType === query.type);
  return { items: items.slice(0, query.limit) };
}

module.exports = { list, thread, related, popularTags, listAnnouncements, parseListQuery, excerptOf, pageWindow, loadTopic };
