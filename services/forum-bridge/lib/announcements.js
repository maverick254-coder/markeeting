'use strict';

const { BridgeError } = require('./errors');
const nb = require('./nodebb');
const index = require('./question-index');

/**
 * Announcements: staff posts that feed the portal's /news page.
 *
 * - Only staff (Global Moderators, which the Keycloak `forum-moderator` role maps to) create
 *   topics here. NodeBB's category privileges refuse everyone else (scripts/setup-forum.js), and
 *   the bridge refuses them first.
 * - They are not questions: no accepted answer, no "unanswered" state.
 * - Authorship is recorded when the topic is created: the bridge sets the topic field STAFF_FIELD
 *   for a verified staff author. Nothing else sets it, so a topic that reaches this category any
 *   other way (moved, or created in NodeBB's own interface) never appears on /news. A post stays
 *   on /news after its author later loses the role.
 * - One tag, `news` or `announcement`, tells the two apart.
 */

const SLUG = 'announcements';
const STAFF_FIELD = 'redactplusStaffPost';
const TYPES = ['announcement', 'news'];
const MAX_LIMIT = 50;

async function categoryId() {
  const { bySlug } = await index.categoryMap();
  return bySlug.get(SLUG) || null;
}

async function isAnnouncementsCid(cid) {
  const own = await categoryId();
  return Boolean(own) && Number(cid) === own;
}

function typeOf(body) {
  const value = String((body && body.type) || 'announcement').toLowerCase();
  if (!TYPES.includes(value)) throw new BridgeError(400, 'invalid', 'Choose News or Announcement.');
  return value;
}

/** The type of a stored topic, from its tags. A topic without either tag is an announcement. */
function typeFromTags(tags) {
  return (tags || []).includes('news') ? 'news' : 'announcement';
}

function requireStaff(viewer) {
  if (!viewer.isModerator) throw new BridgeError(403, 'staff_only', 'Only the RedactPlus team can post in Announcements.');
}

/** Which of these topics carry the staff mark: the only ones /news shows. */
function staffMarked(topics) {
  return topics.filter(topic => topic && topic.tid && String(topic[STAFF_FIELD]) === '1' && !Number(topic.deleted));
}

/** Pinned first (newest pin first), then newest. */
function newsOrder(topics) {
  return [...topics].sort((a, b) => (Number(b.pinned) || 0) - (Number(a.pinned) || 0) || (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
}

function parseListQuery(query) {
  const one = key => (Array.isArray(query[key]) ? query[key][0] : query[key]) || '';
  const type = String(one('type')).toLowerCase();
  return {
    type: TYPES.includes(type) ? type : null,
    limit: Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(one('limit'), 10) || 20)),
  };
}

module.exports = {
  SLUG, STAFF_FIELD, TYPES, categoryId, isAnnouncementsCid, typeOf, typeFromTags, requireStaff, staffMarked, newsOrder, parseListQuery,
};
