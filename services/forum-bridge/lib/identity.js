'use strict';

const { BridgeError } = require('./errors');
const nb = require('./nodebb');

/**
 * Maps the portal's verified customer (identity provider `sub`) to one NodeBB account, creating
 * it on first use, and reconciles the moderator role on every request.
 *
 * - The link is `sub` → uid, stored in the `redactplusId:uid` hash and the user's `redactplusId`
 *   field. Email is never used to find or link an account, and is not stored in NodeBB.
 * - Creation is idempotent: a database lock per subject plus a re-check means concurrent first
 *   requests create one account.
 * - The account has no password, and NodeBB's own sign-in is not offered to customers.
 * - Moderator rights follow the identity provider's current roles. They are granted or removed
 *   on every request, and a sweep removes any that have not been re-confirmed within the TTL,
 *   so a removed moderator loses access even if they never return.
 * - The bridge never acts as a NodeBB administrator, and never grants administrator rights.
 */

const LINK_HASH = 'redactplusId:uid';
// The source of truth for sub -> uid. A sorted set (score = uid) because NodeBB caches hash
// reads in memory, and a cached "no account yet" read during a burst of first requests could
// otherwise create a second account. The hash is still written, for NodeBB's SSO plugin.
const LINK_SET = 'redactplus:sub:uid';
const LINK_FIELD = 'redactplusId';
const VERIFIED_FIELD = 'redactplusModVerifiedAt';
const MODERATORS = 'Global Moderators';

function settings(env = process.env) {
  const ttl = Number.parseInt(env.REDACTPLUS_BRIDGE_MODERATOR_TTL_MINUTES || '15', 10);
  return {
    moderatorRole: String(env.REDACTPLUS_BRIDGE_MODERATOR_ROLE || 'forum-moderator'),
    moderatorTtlMs: (Number.isFinite(ttl) && ttl > 0 ? Math.min(ttl, 24 * 60) : 15) * 60_000,
    requireVerifiedEmail: env.REDACTPLUS_BRIDGE_REQUIRE_VERIFIED_EMAIL !== 'false',
  };
}

/** A username NodeBB accepts, from the display name; never from the email address. */
function baseUsername(name) {
  const cleaned = String(name || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ').slice(0, 20);
  return cleaned.length >= 2 ? cleaned : 'customer';
}

async function lookup(sub) {
  const db = nb.db();
  const score = await db.sortedSetScore(LINK_SET, sub);
  if (score) return Number(score);
  // Accounts linked before the sorted set existed (the hash only): adopt them once.
  const legacy = Number.parseInt(await db.getObjectField(LINK_HASH, sub), 10);
  if (legacy > 0) {
    await db.sortedSetAdd(LINK_SET, legacy, sub);
    return legacy;
  }
  return null;
}

// The bridge's own lock hash. Never NodeBB's shared "locks" hash: user.create clears entries in
// that hash, which would release another request's lock mid-creation.
const LOCKS = 'redactplus:provision:locks';
const LOCK_STARTED = 'redactplus:provision:started-at';
const LOCK_STALE_MS = 15_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Creates the NodeBB account; another customer may take the same username at the same moment. */
async function createAccount(identity) {
  const user = nb.user();
  const wanted = baseUsername(identity.name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? wanted : `${wanted.slice(0, 14)} ${Math.random().toString(36).slice(2, 7)}`;
    const username = (await user.uniqueUsername({ username: candidate })) || candidate;
    try {
      return await user.create({ username, fullname: identity.name || '' }, { emailVerification: 'skip' });
    } catch (err) {
      if (!/username-taken/.test(String(err && err.message))) throw err;
    }
  }
  throw new BridgeError(503, 'provisioning', 'Your forum account could not be set up. Try again in a moment.');
}

/**
 * One account per subject, however many requests arrive at once: the first takes a database
 * lock (an atomic increment) and creates it; the others wait for it (a page makes several
 * calls in parallel). A lock left by a crashed process is taken over after LOCK_STALE_MS.
 */
async function create(identity) {
  const db = nb.db();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const existing = await lookup(identity.sub);
    if (existing) return existing;
    const count = await db.incrObjectField(LOCKS, identity.sub);
    if (count === 1) {
      await db.sortedSetAdd(LOCK_STARTED, Date.now(), identity.sub);
      try {
        const again = await lookup(identity.sub);
        if (again) return again;
        const uid = await createAccount(identity);
        await nb.user().setUserField(uid, LINK_FIELD, identity.sub);
        await db.sortedSetAdd(LINK_SET, uid, identity.sub);
        await db.setObjectField(LINK_HASH, identity.sub, uid);
        nb.winston().info(`[redactplus-bridge] provisioned uid ${uid} for a portal customer`);
        return uid;
      } finally {
        await db.deleteObjectField(LOCKS, identity.sub);
        await db.sortedSetRemove(LOCK_STARTED, identity.sub);
      }
    }
    // Someone else holds the lock; it is deleted (not counted down) when they finish.
    const started = Number(await db.sortedSetScore(LOCK_STARTED, identity.sub)) || 0;
    if (started && Date.now() - started > LOCK_STALE_MS) {
      await db.deleteObjectField(LOCKS, identity.sub);
      await db.sortedSetRemove(LOCK_STARTED, identity.sub);
    }
    await sleep(100);
  }
  throw new BridgeError(503, 'provisioning', 'Your forum account is still being set up. Try again in a moment.');
}

async function setModerator(uid, wanted, ttlMs) {
  const groups = nb.groups();
  const user = nb.user();
  const isMember = await groups.isMember(uid, MODERATORS);
  if (wanted) {
    if (!isMember) await groups.join(MODERATORS, uid);
    const last = Number.parseInt(await user.getUserField(uid, VERIFIED_FIELD), 10) || 0;
    if (Date.now() - last > Math.min(60_000, ttlMs / 2)) await user.setUserField(uid, VERIFIED_FIELD, Date.now());
    return true;
  }
  if (isMember) {
    await groups.leave(MODERATORS, uid);
    // Any NodeBB web session the person had (staff UI) ends with the role.
    await user.auth.revokeAllSessions(uid);
    nb.winston().info(`[redactplus-bridge] moderator rights removed from uid ${uid}`);
  }
  return false;
}

/**
 * The NodeBB account for this request, provisioned and reconciled. Throws for administrators
 * (never acted for) and for missing or unverifiable identities.
 */
async function resolve(identity, env = process.env) {
  const config = settings(env);
  let uid = await lookup(identity.sub);
  if (!uid) uid = await create(identity);
  const exists = await nb.user().exists(uid);
  if (!exists) {
    // The account was deleted in NodeBB: drop the stale link and create a fresh one.
    await nb.db().sortedSetRemove(LINK_SET, identity.sub);
    await nb.db().deleteObjectField(LINK_HASH, identity.sub);
    uid = await create(identity);
  }
  if (await nb.user().isAdministrator(uid)) throw new BridgeError(403, 'account_not_allowed', 'This account cannot be used through the portal.');

  const isModerator = await setModerator(uid, identity.roles.includes(config.moderatorRole), config.moderatorTtlMs);

  if (identity.name) {
    const current = await nb.user().getUserField(uid, 'fullname');
    if (current !== identity.name) await nb.user().setUserField(uid, 'fullname', identity.name);
  }
  const banned = await nb.user().bans.isBanned(uid);
  return {
    uid,
    ip: identity.ip,
    isModerator,
    banned: Boolean(banned),
    canWrite: !banned && (identity.emailVerified || !config.requireVerifiedEmail),
  };
}

/** Removes moderator rights not re-confirmed within the TTL. Only accounts linked to the portal. */
async function sweepModerators(env = process.env) {
  const { moderatorTtlMs } = settings(env);
  const groups = nb.groups();
  const user = nb.user();
  const members = await groups.getMembers(MODERATORS, 0, -1);
  if (!members.length) return 0;
  const rows = await user.getUsersFields(members, ['uid', LINK_FIELD, VERIFIED_FIELD]);
  let removed = 0;
  for (const row of rows) {
    if (!row || !row[LINK_FIELD]) continue;
    const verifiedAt = Number.parseInt(row[VERIFIED_FIELD], 10) || 0;
    if (Date.now() - verifiedAt > moderatorTtlMs) {
      await setModerator(row.uid, false, moderatorTtlMs);
      removed += 1;
    }
  }
  return removed;
}

module.exports = { resolve, sweepModerators, baseUsername, settings, LINK_HASH, LINK_SET, MODERATORS };
