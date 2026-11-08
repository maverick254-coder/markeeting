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
