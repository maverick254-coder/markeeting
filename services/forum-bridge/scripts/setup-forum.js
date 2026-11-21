'use strict';

/**
 * Configures a NodeBB install as the RedactPlus forum backend. Idempotent: run it after every
 * install or upgrade (the container entrypoint does). Run from the NodeBB directory:
 *
 *   node /path/to/nodebb-plugin-redactplus-bridge/scripts/setup-forum.js
 *
 * What it enforces:
 * - the six portal categories (categories.json), created once and mapped by slug, with every
 *   new topic in them a question (Q&A plugin), except Announcements;
 * - Announcements: staff posts for the portal's /news. Members read and reply; only Global
 *   Moderators (Keycloak forum-moderator) and administrators create topics. A one-time,
 *   idempotent migration turns earlier staff topics there into announcements
 *   (lib/announcement-migration.js) and prints what it changed;
 * - no guest, crawler or fediverse access, and ActivityPub federation off;
 * - no NodeBB self-registration and no NodeBB password sign-in for customers (they use the
 *   portal; local administrators keep their own sign-in on the private network);
 * - images only (PNG, JPEG, GIF, WebP, 5 MB), no chat, no signatures, no profile uploads;
 * - posting delays and flood limits kept on, the post queue off (customers are verified
 *   RedactPlus accounts), and the length and tag rules the portal shows.
 */

const path = require('path');

process.chdir(process.env.NODEBB_DIR || process.cwd());
const root = process.cwd();
const req = name => require(path.join(root, name));
req('node_modules/nconf').argv().env({ separator: '__' });
req('src/prestart').loadConfig(path.resolve(root, process.env.NODEBB_CONFIG || 'config.json'));

const CATEGORY_HASH = 'redactplus:categories';
const planned = require('../categories.json');
const { migrateAnnouncements, describe } = require('../lib/announcement-migration');
const ANNOUNCEMENTS = 'announcements';
const STAFF_FIELD = 'redactplusStaffPost'; // lib/announcements.js
const STAFF_CREATORS = ['Global Moderators', 'administrators'];

const CONFIG = {
  registrationType: 'disabled',
  registrationApprovalType: 'normal',
  gdpr_enabled: 0,
  activitypubEnabled: 0,
  disableChat: 1,
  disableSignatures: 1,
  allowProfileImageUploads: 0,
  allowTopicsThumbnail: 0,
  allowPrivateGroups: 0,
  hideEmail: 1,
  hideFullname: 1,
  requireEmailAddress: 0,
  sendEmailToBanned: 0,
  'email:disableEdit': 1,
  maximumFileSize: 5120,
  allowedFileExtensions: 'png,jpg,jpeg,gif,webp',
  rejectImageWidth: 10000,
  rejectImageHeight: 10000,
  resizeImageWidthThreshold: 2000,
  resizeImageWidth: 1600,
  postQueue: 0,
  initialPostDelay: 10,
  postDelay: 10,
  newbiePostDelay: 30,
  newbieReputationThreshold: 3,
  minimumTitleLength: 15,
  maximumTitleLength: 150,
  minimumPostLength: 8,
  maximumPostLength: 20000,
  minimumTagsPerTopic: 0,
  maximumTagsPerTopic: 5,
  minimumTagLength: 2,
  maximumTagLength: 30,
  guestsIncrementTopicViews: 0,
  incrementTopicViewsInterval: 60,
  'downvote:disabled': 0,
  'reputation:disabled': 0,
  'min:rep:downvote': 0,
  'min:rep:flag': 0,
  'flags:limitPerTarget': 1,
  allowGuestHandles: 0,
  useOutgoingLinksPage: 0,
};

(async () => {
  const db = req('src/database');
  await db.init();
  const meta = req('src/meta');
  await meta.configs.init();
  const categories = req('src/categories');
  const privileges = req('src/privileges');

  await meta.configs.setMultiple(CONFIG);

  const mapping = (await db.getObject(CATEGORY_HASH)) || {};
  const qanda = {};
  for (const [order, category] of planned.entries()) {
    let cid = Number.parseInt(mapping[category.slug], 10);
    if (!cid || !(await categories.exists(cid))) {
      const created = await categories.create({ name: category.name, description: category.description, order: order + 1 });
      cid = created.cid;
      await db.setObjectField(CATEGORY_HASH, category.slug, cid);
      console.log(`created category ${category.slug} (cid ${cid})`);
    } else {
      await categories.update({ [cid]: { name: category.name, description: category.description, order: order + 1 } });
    }
    await categories.setCategoryField(cid, 'disabled', 0);
    // No one outside signed-in customers: not guests, not crawlers, not other servers.
    await privileges.categories.rescind(privileges.categories.getGroupPrivilegeList(), cid, ['guests', 'spiders', 'fediverse']);
    qanda[`defaultCid_${cid}`] = category.slug === ANNOUNCEMENTS ? 'off' : 'on';
    if (category.slug === ANNOUNCEMENTS) {
      // Members read and reply; only staff start topics.
      await privileges.categories.rescind(['groups:topics:create'], cid, ['registered-users']);
      await privileges.categories.give(['groups:find', 'groups:read', 'groups:topics:read', 'groups:topics:reply'], cid, ['registered-users']);
      await privileges.categories.give(['groups:find', 'groups:read', 'groups:topics:read', 'groups:topics:create', 'groups:topics:reply'], cid, STAFF_CREATORS);
    }
  }
  // Retire categories NodeBB made at install (for example "General Discussion").
  const mapped = new Set(Object.values((await db.getObject(CATEGORY_HASH)) || {}).map(Number));
  for (const cid of await db.getSortedSetRange('categories:cid', 0, -1)) {
    if (!mapped.has(Number(cid))) await categories.setCategoryField(Number(cid), 'disabled', 1);
  }

  // Q&A: every topic in a mapped category is a question; the asker or a moderator accepts.
  await meta.settings.set('question-and-answer', { ...((await meta.settings.get('question-and-answer')) || {}), ...qanda, onlyAdmins: 'off', toggleLock: 'off' });

  const announcementsCid = Number.parseInt(((await db.getObject(CATEGORY_HASH)) || {})[ANNOUNCEMENTS], 10) || null;
  const migration = await migrateAnnouncements({ cid: announcementsCid, db, topics: req('src/topics'), groups: req('src/groups'), user: req('src/user'), staffField: STAFF_FIELD });
  for (const line of describe(migration)) console.log(line);

  // Global privileges for ordinary members: images only, no NodeBB password sign-in, no chat.
  await privileges.global.rescind(['groups:local:login', 'groups:chat', 'groups:chat:privileged', 'groups:upload:post:file', 'groups:signature', 'groups:invite', 'groups:group:create', 'groups:search:users', 'groups:view:users', 'groups:view:groups'], 'registered-users');
  await privileges.global.give(['groups:upload:post:image', 'groups:search:content', 'groups:search:tags', 'groups:view:tags'], 'registered-users');
  await privileges.global.rescind(privileges.global.getGroupPrivilegeList ? privileges.global.getGroupPrivilegeList() : ['groups:search:content', 'groups:view:users', 'groups:view:tags', 'groups:view:groups'], 'guests');
  // Administrators keep NodeBB's own sign-in for the private staff UI.
  await privileges.global.give(['groups:local:login'], 'administrators');

  console.log(`forum configured: ${planned.length} categories mapped`);
  await db.close();
  process.exit(0);
})().catch((err) => {
  console.error(`forum setup failed: ${err.message}`);
  process.exit(1);
});
