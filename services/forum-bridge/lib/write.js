'use strict';

const fs = require('fs');
const path = require('path');
const { BridgeError } = require('./errors');
const nb = require('./nodebb');
const index = require('./question-index');
const { loadTopic } = require('./read');

/**
 * Write side. Each action calls NodeBB's own API module (src/api) with the mapped customer as
 * the caller, so NodeBB's privilege checks, posting delays, flood limits, length rules, tag
 * rules and the post queue all apply exactly as they do in NodeBB's own UI. The bridge adds
 * only the RedactPlus conventions (questions, answers versus comments) and checks NodeBB lacks
 * (a reply's parent and an accepted answer must belong to the same question).
 */

const ALLOWED_IMAGES = new Map([['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/gif', '.gif'], ['image/webp', '.webp']]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const IDEMPOTENCY_TTL_MS = 10 * 60_000;

const caller = viewer => ({ uid: viewer.uid, ip: viewer.ip || '127.0.0.1' });

function requireWrite(viewer) {
  if (viewer.banned) throw new BridgeError(403, 'suspended', 'Your forum account is suspended.');
  if (!viewer.canWrite) throw new BridgeError(403, 'email_unverified', 'Verify your email address with RedactPlus before posting.');
}

function text(value, field, max) {
  if (typeof value !== 'string') throw new BridgeError(400, 'invalid', `${field} is required.`);
  const trimmed = value.replace(/\r\n/g, '\n').trim();
  if (!trimmed) throw new BridgeError(400, 'invalid', `${field} is required.`);
  if (trimmed.length > max) throw new BridgeError(400, 'invalid', `${field} is too long.`);
  return trimmed;
}

function tagList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(tag => /^[a-z0-9][a-z0-9-]{0,29}$/.test(tag)))].slice(0, 5);
}

/** Attachments must be images this customer uploaded through the bridge. */
async function attachmentList(viewer, value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new BridgeError(400, 'invalid', `Attach up to ${MAX_ATTACHMENTS} images.`);
  const items = value.map((item) => {
    const url = item && typeof item.url === 'string' ? item.url : '';
    if (!/^\/assets\/uploads\/files\/[A-Za-z0-9._-]{1,200}$/.test(url)) throw new BridgeError(400, 'invalid', 'An attachment is not a forum upload.');
    return {
      url,
      name: String((item && item.name) || 'image').replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 120) || 'image',
      sizeBytes: Math.max(0, Math.min(MAX_IMAGE_BYTES, Number.parseInt(item && item.sizeBytes, 10) || 0)),
      kind: 'image',
    };
  });
  if (!items.length) return [];
  const owned = await nb.db().isSortedSetMembers(`uid:${viewer.uid}:uploads`, items.map(item => item.url.replace(/^\/assets\/uploads/, '')));
  if (owned.some(ok => !ok)) throw new BridgeError(403, 'forbidden', 'You can only attach images you uploaded.');
  return items;
}

/**
 * Duplicate-submission guard: the same Idempotency-Key from the same customer returns the first
 * result instead of posting twice (double clicks, retries after a timeout).
 */
async function idempotent(viewer, key, work) {
  if (!key) return work();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) throw new BridgeError(400, 'invalid', 'The request key is not valid.');
  const db = nb.db();
  const slot = `redactplus:idem:${viewer.uid}:${key}`;
  const claimed = await db.incrObjectField(slot, 'claims');
  if (claimed === 1) await db.pexpire(slot, IDEMPOTENCY_TTL_MS);
  if (claimed > 1) {
    const stored = await db.getObjectField(slot, 'result');
    if (stored) return { ...JSON.parse(stored), replayed: true };
    throw new BridgeError(409, 'duplicate', 'This was already submitted and is still being processed.');
  }
  try {
    const result = await work();
    await db.setObjectField(slot, 'result', JSON.stringify(result));
    return result;
  } catch (err) {
    await db.delete(slot);
    throw err;
  }
}

function queued(result) {
  return result && result.queued ? { queued: true, message: 'Your post is waiting for a moderator to review it.' } : null;
}

async function createQuestion(viewer, body, key) {
  requireWrite(viewer);
  const { bySlug } = await index.categoryMap();
  const cid = bySlug.get(String(body.category || ''));
  if (!cid) throw new BridgeError(400, 'invalid', 'Choose a category.');
  const title = text(body.title, 'A title', 255);
  const content = text(body.body, 'The question', 20_000);
  const tags = tagList(body.tags);
  const attachments = await attachmentList(viewer, body.attachments);
  return idempotent(viewer, key, async () => {
    const result = await nb.api().topics.create(caller(viewer), { cid, title, content, tags, isQuestion: 1 });
    const wait = queued(result);
    if (wait) return wait;
    if (attachments.length) await nb.posts().setPostField(result.mainPid, 'redactplusAttachments', JSON.stringify(attachments));
    await index.refresh(result.tid);
    return { id: Number(result.tid), slugTitle: String(result.slug || '').split('/')[1] || 'question' };
  });
}

async function editQuestion(viewer, tid, body) {
  requireWrite(viewer);
  const topic = await loadTopic(tid, viewer);
  const { bySlug } = await index.categoryMap();
  // isQuestion must be restated: the Q&A plugin turns a question into a plain topic otherwise.
  const payload = { pid: Number(topic.mainPid), content: text(body.body, 'The question', 20_000), title: text(body.title, 'A title', 255), tags: tagList(body.tags), isQuestion: 1 };
  const attachments = body.attachments === undefined ? null : await attachmentList(viewer, body.attachments);
  await nb.api().posts.edit(caller(viewer), payload);
  if (attachments) await nb.posts().setPostField(topic.mainPid, 'redactplusAttachments', JSON.stringify(attachments));
  const cid = body.category ? bySlug.get(String(body.category)) : null;
  if (cid && cid !== Number(topic.cid)) await nb.api().topics.move(caller(viewer), { tid, cid });
  await index.refresh(tid);
  return { id: tid };
}

async function reply(viewer, tid, body, key, { parentPid = null } = {}) {
  requireWrite(viewer);
  const topic = await loadTopic(tid, viewer);
  const content = text(body.body, parentPid ? 'The comment' : 'The answer', parentPid ? 5_000 : 20_000);
  const attachments = parentPid ? [] : await attachmentList(viewer, body.attachments);
  let toPid;
  if (parentPid) {
    const parent = await nb.posts().getPostFields(parentPid, ['tid', 'deleted']);
    if (!parent || Number(parent.tid) !== tid || Number(parent.deleted)) throw new BridgeError(400, 'invalid', 'You can only comment on a post in this question.');
    toPid = parentPid;
  }
  return idempotent(viewer, key, async () => {
    const result = await nb.api().topics.reply(caller(viewer), { tid, content, ...(toPid ? { toPid } : {}) });
    const wait = queued(result);
    if (wait) return wait;
    if (attachments.length) await nb.posts().setPostField(result.pid, 'redactplusAttachments', JSON.stringify(attachments));
    await index.refresh(tid);
    return { id: String(result.pid), questionId: Number(topic.tid) };
  });
}

async function postInQuestion(viewer, pid) {
  const post = await nb.posts().getPostFields(pid, ['pid', 'tid', 'uid', 'toPid', 'deleted']);
  if (!post || !post.pid) throw new BridgeError(404, 'not_found', 'That post no longer exists.');
  const topic = await loadTopic(Number(post.tid), viewer);
  return { post, topic };
}

async function editPost(viewer, pid, body) {
  requireWrite(viewer);
  const { post, topic } = await postInQuestion(viewer, pid);
  if (Number(topic.mainPid) === pid) throw new BridgeError(400, 'invalid', 'Edit the question itself instead.');
  const content = text(body.body, 'The post', post.toPid ? 5_000 : 20_000);
  await nb.api().posts.edit(caller(viewer), { pid, content });
  if (!post.toPid && body.attachments !== undefined) await nb.posts().setPostField(pid, 'redactplusAttachments', JSON.stringify(await attachmentList(viewer, body.attachments)));
  return { id: String(pid) };
}

async function deletePost(viewer, pid) {
  requireWrite(viewer);
  const { topic } = await postInQuestion(viewer, pid);
  if (Number(topic.mainPid) === pid) {
    await nb.api().topics.delete(caller(viewer), { tids: [Number(topic.tid)] });
  } else {
    await nb.api().posts.delete(caller(viewer), { pid });
  }
  await index.refresh(Number(topic.tid));
  return { id: String(pid), questionDeleted: Number(topic.mainPid) === pid };
}

async function restorePost(viewer, pid) {
  if (!viewer.isModerator) throw new BridgeError(403, 'forbidden', 'Only moderators can restore posts.');
  const post = await nb.posts().getPostFields(pid, ['pid', 'tid']);
  if (!post || !post.pid) throw new BridgeError(404, 'not_found', 'That post no longer exists.');
  await nb.api().posts.restore(caller(viewer), { pid });
  await index.refresh(Number(post.tid));
  return { id: String(pid) };
}

async function vote(viewer, pid, direction) {
  requireWrite(viewer);
  await postInQuestion(viewer, pid);
  const api = nb.api().posts;
  if (direction === 'up') await api.upvote(caller(viewer), { pid });
  else if (direction === 'down') await api.downvote(caller(viewer), { pid });
  else if (direction === 'none') await api.unvote(caller(viewer), { pid });
  else throw new BridgeError(400, 'invalid', 'Choose up, down or none.');
  const fields = await nb.posts().getPostFields(pid, ['upvotes', 'downvotes']);
  return { id: String(pid), score: (Number(fields.upvotes) || 0) - (Number(fields.downvotes) || 0) };
}

function qanda() {
  const handlers = nb.socketPlugins().QandA;
  if (!handlers) throw new BridgeError(503, 'unavailable', 'Accepted answers are not available right now.');
  return handlers;
}

/** The question's author or a moderator; checked again by the Q&A plugin itself. */
async function accept(viewer, tid, pid) {
  requireWrite(viewer);
  const topic = await loadTopic(tid, viewer);
  const post = await nb.posts().getPostFields(pid, ['pid', 'tid', 'toPid', 'deleted']);
  if (!post || Number(post.tid) !== tid || Number(post.deleted) || pid === Number(topic.mainPid)) throw new BridgeError(400, 'invalid', 'That answer is not part of this question.');
  if (post.toPid) throw new BridgeError(400, 'invalid', 'Only an answer can be accepted, not a comment.');
  await qanda().markPostAsAnswer({ uid: viewer.uid }, { tid, pid });
  return { id: tid, acceptedId: String(pid) };
}

async function unaccept(viewer, tid) {
  requireWrite(viewer);
  const topic = await loadTopic(tid, viewer);
  if (String(topic.isSolved) === '1') await qanda().toggleSolved({ uid: viewer.uid }, { tid });
  return { id: tid, acceptedId: null };
}

async function report(viewer, pid, reason) {
  requireWrite(viewer);
  await postInQuestion(viewer, pid);
  const why = text(reason, 'A reason', 250);
  const flag = await nb.api().flags.create(caller(viewer), { type: 'post', id: pid, reason: why });
  return { reported: true, id: flag && flag.flagId ? String(flag.flagId) : null };
}

/** Moderators suspend a post's author; NodeBB checks the ban privilege and refuses admins. */
async function suspendAuthor(viewer, pid, body) {
  if (!viewer.isModerator) throw new BridgeError(403, 'forbidden', 'Only moderators can suspend accounts.');
  const { post } = await postInQuestion(viewer, pid);
  if (Number(post.uid) === Number(viewer.uid)) throw new BridgeError(400, 'invalid', 'You cannot suspend yourself.');
  const days = Number.parseInt(body && body.days, 10);
  const until = Number.isInteger(days) && days > 0 ? Date.now() + Math.min(days, 3650) * 86_400_000 : 0;
  const reason = body && typeof body.reason === 'string' ? body.reason.trim().slice(0, 250) : '';
  await nb.api().users.ban(caller(viewer), { uid: Number(post.uid), until, reason });
  return { suspended: true, until: until ? new Date(until).toISOString() : null };
}

async function upload(viewer, files) {
  requireWrite(viewer);
  if (!Array.isArray(files) || !files.length) throw new BridgeError(400, 'invalid', 'Choose an image to upload.');
  if (files.length > MAX_ATTACHMENTS) throw new BridgeError(400, 'invalid', `Upload up to ${MAX_ATTACHMENTS} images at a time.`);
  const out = [];
  try {
    if (!(await nb.privileges().global.can('upload:post:image', viewer.uid))) throw new BridgeError(403, 'forbidden', 'You are not allowed to upload images.');
    const maxBytes = Math.min(MAX_IMAGE_BYTES, (Number(nb.meta().config.maximumFileSize) || 2048) * 1024);
    for (const file of files) {
      if (file.size > maxBytes) throw new BridgeError(413, 'too_large', `Images must be ${Math.floor(maxBytes / 1024 / 1024) || 1} MB or smaller.`);
      // The type is decided from the file's bytes, never from its name or the declared type.
      const detected = await nb.fileType().fileTypeFromFile(file.path);
      if (!detected || !ALLOWED_IMAGES.has(detected.mime)) throw new BridgeError(415, 'unsupported_type', 'Use a PNG, JPEG, GIF or WebP image.');
      const image = nb.image();
      await image.checkDimensions(file.path);
      await image.stripEXIF({ path: file.path, type: detected.mime });
      const base = path.basename(String(file.originalname || 'image')).replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 60) || 'image';
      const stored = await nb.uploads().uploadFile(viewer.uid, {
        ...file,
        name: `${base}${ALLOWED_IMAGES.get(detected.mime)}`,
        type: detected.mime,
      });
      out.push({ url: stored.url, name: String(file.originalname || stored.name).slice(0, 120), sizeBytes: file.size, kind: 'image' });
    }
    return { files: out };
  } catch (err) {
    if (err && /invalid-image|unsupported|Input buffer/i.test(String(err.message))) throw new BridgeError(415, 'unsupported_type', 'That image could not be read.');
    throw err;
  } finally {
    for (const file of files) fs.promises.unlink(file.path).catch(() => {});
  }
}

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

/** Resolves a stored upload for streaming back through the portal. Only images in files/. */
function uploadFile(name) {
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(name) || name.startsWith('.')) throw new BridgeError(404, 'not_found', 'No such image.');
  const type = IMAGE_TYPES[path.extname(name).toLowerCase()];
  if (!type) throw new BridgeError(404, 'not_found', 'No such image.');
  const root = path.resolve(nb.nconf().get('upload_path'), 'files');
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) throw new BridgeError(404, 'not_found', 'No such image.');
  return { full, type };
}

module.exports = { createQuestion, editQuestion, reply, editPost, deletePost, restorePost, vote, accept, unaccept, report, suspendAuthor, upload, uploadFile, tagList, MAX_IMAGE_BYTES };
