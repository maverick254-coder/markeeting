'use strict';

/**
 * One-time, idempotent migration of the Announcements category (run by scripts/setup-forum.js on
 * every start; a second run changes nothing).
 *
 * Topics posted there before announcements stopped being questions, by staff, become staff
 * announcements. Staff means an administrator or Global Moderator now, or a portal account the
 * bridge has verified as a moderator at some point (MOD_VERIFIED_FIELD): the bridge removes
 * moderator rights that are not re-confirmed within its TTL, so a moderator who posted and has
 * not used the forum since is no longer in the group when the forum restarts. For each:
 *   - the question flag (and any accepted-answer state) is removed, and the topic leaves the
 *     question lists (the bridge's and the Q&A plugin's);
 *   - the staff mark is set;
 *   - the tag `announcement` is added if the topic has no tags.
 * Topics by anyone else are left alone: without the mark they never appear on /news.
 *
 * NodeBB's modules are passed in, so this runs without NodeBB in the unit tests.
 */

const STAFF_GROUPS = ['administrators', 'Global Moderators'];
const MOD_VERIFIED_FIELD = 'redactplusModVerifiedAt'; // lib/identity.js
// Sorted sets a question belongs to: the bridge's (lib/question-index.js) and the Q&A plugin's.
const QUESTION_SETS = ['redactplus:questions:activity', 'redactplus:questions:created', 'redactplus:questions:unanswered', 'topics:solved', 'topics:unsolved'];

async function migrateAnnouncements({ cid, db, topics, groups, user, staffField }) {
  const report = { examined: 0, migrated: [], leftAlone: [] };
  if (!cid) return report;
  const tids = new Set();
  for (const set of [`cid:${cid}:tids`, `cid:${cid}:tids:pinned`, `cid:${cid}:tids:create`]) {
    for (const tid of await db.getSortedSetRange(set, 0, -1).catch(() => [])) tids.add(Number(tid));
  }
  const ids = [...tids].filter(tid => Number.isSafeInteger(tid) && tid > 0).sort((a, b) => a - b);
  report.examined = ids.length;
  if (!ids.length) return report;

  const rows = await topics.getTopicsFields(ids, ['tid', 'uid', 'title', 'isQuestion', 'isSolved', staffField]);
  const uids = [...new Set(rows.filter(Boolean).map(row => Number(row.uid)).filter(uid => uid > 0))];
  const staff = new Set();
  for (const group of STAFF_GROUPS) {
    const flags = uids.length ? await groups.isMembers(uids, group) : [];
    uids.forEach((uid, i) => { if (flags[i]) staff.add(uid); });
  }
  const verified = uids.length ? await user.getUsersFields(uids, ['uid', MOD_VERIFIED_FIELD]) : [];
  for (const row of verified) if (row && Number(row[MOD_VERIFIED_FIELD]) > 0) staff.add(Number(row.uid));

  for (const row of rows) {
    if (!row || !row.tid) continue;
    const tid = Number(row.tid);
    if (!staff.has(Number(row.uid))) {
      report.leftAlone.push(tid);
      continue;
    }
    const changes = [];
    if (String(row.isQuestion) === '1' || String(row.isSolved) === '1') {
      await topics.setTopicFields(tid, { isQuestion: 0, isSolved: 0 });
      await db.sortedSetsRemove(QUESTION_SETS, tid);
      changes.push('question flag removed');
    }
    if (String(row[staffField]) !== '1') {
      await topics.setTopicField(tid, staffField, 1);
      changes.push('staff mark set');
    }
    const tags = (await topics.getTopicTags(tid)) || [];
    if (!tags.length) {
      if (typeof topics.addTags === 'function') await topics.addTags(['announcement'], [tid]);
      else await topics.updateTopicTags(tid, ['announcement']);
      changes.push('tag announcement added');
    }
    if (changes.length) report.migrated.push({ tid, title: String(row.title || '').slice(0, 120), changes });
  }
  return report;
}

function describe(report) {
  const lines = [`announcements migration: ${report.examined} topic(s) examined, ${report.migrated.length} migrated, ${report.leftAlone.length} by non-staff left alone`];
  for (const item of report.migrated) lines.push(`  migrated tid ${item.tid} "${item.title}": ${item.changes.join(', ')}`);
  if (report.leftAlone.length) lines.push(`  not shown on /news (no staff author): tid ${report.leftAlone.join(', ')}`);
  return lines;
}

module.exports = { migrateAnnouncements, describe, STAFF_GROUPS, QUESTION_SETS, MOD_VERIFIED_FIELD };
