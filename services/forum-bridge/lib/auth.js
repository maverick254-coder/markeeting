'use strict';

const crypto = require('crypto');
const { BridgeError } = require('./errors');

/**
 * The bridge trusts exactly one caller: the portal's server, which proves itself with a shared
 * key (REDACTPLUS_BRIDGE_KEY, at least 32 characters) and states which verified customer it is
 * acting for. The customer is named by the identity provider's subject (`sub`), never by a
 * NodeBB uid, so the portal cannot address an account it has not authenticated.
 */

const MIN_KEY_LENGTH = 32;

function configuredKey(env = process.env) {
  const key = String(env.REDACTPLUS_BRIDGE_KEY || '');
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

function keyMatches(presented, expected) {
  if (typeof presented !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(presented).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const SUB = /^[A-Za-z0-9._:@|-]{1,255}$/;
const ROLE = /^[A-Za-z0-9._:-]{1,100}$/;

/** Parses the `x-redactplus-identity` header (base64url JSON). Throws 400 on anything odd. */
function parseIdentity(header) {
  if (typeof header !== 'string' || !header || header.length > 4096) throw new BridgeError(400, 'invalid_identity', 'A customer identity is required.');
  let value;
  try {
    value = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
  } catch {
    throw new BridgeError(400, 'invalid_identity', 'The customer identity is not readable.');
  }
  if (!value || typeof value !== 'object' || !SUB.test(String(value.sub || ''))) throw new BridgeError(400, 'invalid_identity', 'The customer identity has no valid subject.');
  const roles = Array.isArray(value.roles) ? value.roles.filter(role => typeof role === 'string' && ROLE.test(role)).slice(0, 50) : [];
  const name = typeof value.name === 'string' ? value.name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : '';
  const ip = typeof value.ip === 'string' && /^[0-9a-fA-F:.]{2,45}$/.test(value.ip) ? value.ip : undefined;
  return {
    sub: value.sub,
    name,
    emailVerified: value.emailVerified === true,
    roles,
    ip,
  };
}

module.exports = { configuredKey, keyMatches, parseIdentity, MIN_KEY_LENGTH };
