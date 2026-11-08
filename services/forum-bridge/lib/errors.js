'use strict';

/**
 * One error shape for every bridge response: { ok: false, error: { code, message } } with a
 * 4xx status for anything the caller can fix or must accept, and 500 only for real faults.
 * NodeBB reports most refusals as thrown `[[error:key]]` strings; they are classified here
 * rather than passed through, so the portal never sees internals.
 */

class BridgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// First match wins, so the specific keys come before the broad ones.
const rules = [
  [/^user-banned|^user-muted/, 403, 'suspended'],
  [/^(user-too-new|too-many-posts|too-many-posts-newbie|too-many-posts-newbie-minutes|upload-ratelimit-reached|too-many-post-flags-per-day|too-many-user-flags-per-day|post-flagged-too-many-times|too-many-upvotes-today|too-many-upvotes-today-user|too-many-downvotes-today|too-many-downvotes-today-user)$/, 429, 'rate_limited'],
  [/^(already-flagged|post-already-deleted|topic-already-deleted)$/, 409, 'conflict'],
  [/^(file-too-big|LIMIT_FILE_SIZE|LIMIT_FILE_COUNT|LIMIT_PART_COUNT)$/, 413, 'too_large'],
  [/^(invalid-file-type|blocked-file-type|invalid-image|invalid-image-type|invalid-image-extension|invalid-file|uploads-are-disabled|guest-upload-disabled)$/, 415, 'unsupported_type'],
  [/^(no-privileges|not-logged-in|topic-locked|category-disabled|self-vote|reputation-system-disabled|downvoting-disabled|cant-flag-privileged|tag-not-allowed|cant-use-system-tag|cant-remove-system-tag|cant-purge-main-post|cant-delete-topic-has-reply|cant-delete-topic-has-replies|local-login-disabled)$|^post-(edit|delete)-duration-expired|^not-enough-reputation/, 403, 'forbidden'],
  [/^(no-topic|no-post|no-category|no-user|no-flag|post-deleted|invalid-pid|invalid-tid|invalid-cid|invalid-uid|cant-locate-flag-report)$/, 404, 'not_found'],
  [/^(content-too-short|content-too-long|title-too-short|title-too-long|invalid-title|tag-too-short|tag-too-long|not-enough-tags|too-many-tags|invalid-data|invalid-tag|invalid-json|invalid-search-term|cant-move-to-same-topic|cant-move-topic-to-same-category)$/, 400, 'invalid'],
];

function keyOf(message) {
  const match = /\[\[error:([a-z0-9.-]+)/.exec(message);
  return match ? match[1] : message.trim();
}

function classify(err) {
  if (err instanceof BridgeError) return { status: err.status, code: err.code, message: err.message, key: null };
  const raw = String((err && (err.code === 'LIMIT_FILE_SIZE' ? 'LIMIT_FILE_SIZE' : err.message)) || err || '');
  const key = keyOf(raw);
  for (const [pattern, status, code] of rules) {
    if (pattern.test(key)) return { status, code, message: null, key: raw };
  }
  return { status: 500, code: 'internal', message: null, key: raw };
}

/** Plain text, short: NodeBB's English translation of its own message, tags removed. */
function plain(text) {
  return String(text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const fallback = {
  suspended: 'Your forum account is suspended.',
  forbidden: 'You are not allowed to do that.',
  rate_limited: 'You are posting too quickly. Please wait a moment and try again.',
  conflict: 'That has already been done.',
  too_large: 'The file is too large.',
  unsupported_type: 'That file type is not accepted.',
  not_found: 'That question or post no longer exists.',
  invalid: 'Some of the details are not valid.',
  internal: 'The forum could not complete the request.',
};

module.exports = { BridgeError, classify, plain, fallback, keyOf };
