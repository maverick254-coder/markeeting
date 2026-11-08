'use strict';

/** NodeBB's own modules, loaded on first use so the pure parts of the bridge test without NodeBB. */
const cache = {};
function nb(name) {
  if (!cache[name]) cache[name] = require.main.require(name);
  return cache[name];
}

module.exports = {
  db: () => nb('./src/database'),
  user: () => nb('./src/user'),
  groups: () => nb('./src/groups'),
  topics: () => nb('./src/topics'),
  posts: () => nb('./src/posts'),
  privileges: () => nb('./src/privileges'),
  categories: () => nb('./src/categories'),
  meta: () => nb('./src/meta'),
  api: () => nb('./src/api'),
  flags: () => nb('./src/flags'),
  search: () => nb('./src/search'),
  notifications: () => nb('./src/notifications'),
  translator: () => nb('./src/translator'),
  image: () => nb('./src/image'),
  uploads: () => nb('./src/controllers/uploads'),
  file: () => nb('./src/file'),
  nconf: () => nb('nconf'),
  winston: () => nb('winston'),
  socketPlugins: () => nb('./src/socket.io/plugins'),
  fileType: () => nb('file-type'),
};
