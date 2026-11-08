'use strict';
// Local trial bridge. The Q&A plugin's "accept answer" exists only as a socket.io call; the portal
// talks to NodeBB server-side over the Write API (master token acting as the customer via _uid).
// These routes call the Q&A plugin's own handlers, so its permission check (the question's author
// or a moderator) and side effects are reused, not reimplemented.
const SocketPlugins = require.main.require('./src/socket.io/plugins');
const posts = require.main.require('./src/posts');
const routeHelpers = require.main.require('./src/routes/helpers');
const uploadsController = require.main.require('./src/controllers/uploads');

module.exports.addRoutes = async ({ router, middleware, helpers }) => {
  const qanda = () => {
    if (!SocketPlugins.QandA) throw Object.assign(new Error('The question-and-answer plugin is not active.'), { status: 503 });
    return SocketPlugins.QandA;
  };
  const send = (res, promise) => promise
    .then((result) => helpers.formatApiResponse(200, res, result))
    .catch((err) => helpers.formatApiResponse(err.status || (/no-privileges/.test(err.message) ? 403 : 400), res, err));

  // Accept an answer. The plugin itself does not check that the post belongs to the question.
  routeHelpers.setupApiRoute(router, 'put', '/redactplus/topics/:tid/accepted', [middleware.ensureLoggedIn], (req, res) => send(res, (async () => {
    const tid = parseInt(req.params.tid, 10);
    const pid = parseInt(req.body && req.body.pid, 10);
    if (!Number.isInteger(pid) || parseInt(await posts.getPostField(pid, 'tid'), 10) !== tid) {
      throw Object.assign(new Error('That answer is not part of this question.'), { status: 400 });
    }
    return qanda().markPostAsAnswer({ uid: req.uid }, { tid, pid });
  })()));

  // Withdraw acceptance (the question becomes unsolved).
  routeHelpers.setupApiRoute(router, 'delete', '/redactplus/topics/:tid/accepted', [middleware.ensureLoggedIn], (req, res) => send(res, (async () => {
    const tid = parseInt(req.params.tid, 10);
    const state = await require.main.require('./src/topics').getTopicFields(tid, ['isSolved']);
    if (parseInt(state.isSolved, 10) !== 1) return { isSolved: false };
    return qanda().toggleSolved({ uid: req.uid }, { tid });
  })()));

  // Upload an image or file for a post. NodeBB's own /api/post/upload is session-only (it
  // enforces CSRF even for API tokens), so a server-side caller needs this route. It runs the same
  // controller, so upload privileges, EXIF stripping, resizing and the upload rate limit still apply.
  routeHelpers.setupApiRoute(router, 'post', '/redactplus/uploads', [
    middleware.ensureLoggedIn, middleware.validateFiles, middleware.uploads.ratelimit,
  ], (req, res) => uploadsController.uploadPost(req, res));
};
