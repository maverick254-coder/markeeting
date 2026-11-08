'use strict';

/**
 * Writes NodeBB's config.json from the environment at container start, to a tmpfs path
 * (REDACTPLUS_CONFIG_PATH), so the image holds no settings or secrets and the root filesystem
 * stays read-only. Secrets can come from files (*_FILE, for Docker secrets) or the env file.
 *
 *   FORUM_URL                 the address staff use for the private admin UI (SSH tunnel), e.g.
 *                             http://localhost:6097; customers never see NodeBB
 *   FORUM_SECRET(_FILE)       NodeBB's session secret (32+ characters)
 *   FORUM_DATABASE            postgres (production) or redis (the image build only)
 *   FORUM_DB_HOST, FORUM_DB_PORT, FORUM_DB_NAME, FORUM_DB_USER, FORUM_DB_PASSWORD(_FILE)
 */

const fs = require('fs');
const path = require('path');

const read = (name) => {
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return (process.env[name] || '').trim();
};
const fail = (message) => {
  console.error(`forum config: ${message}`);
  process.exit(1);
};

// The plugins NodeBB may load. Pinned here, so the admin UI cannot add or remove any.
const PLUGINS = [
  'nodebb-theme-harmony',
  'nodebb-plugin-composer-default',
  'nodebb-plugin-markdown',
  'nodebb-plugin-mentions',
  'nodebb-plugin-dbsearch',
  'nodebb-plugin-question-and-answer',
  'nodebb-plugin-2factor',
  'nodebb-plugin-redactplus-bridge',
];

const url = read('FORUM_URL');
if (!/^https?:\/\/[^/\s]+$/.test(url)) fail('FORUM_URL must be an origin such as http://localhost:6097.');
const secret = read('FORUM_SECRET');
if (secret.length < 8) fail('FORUM_SECRET is required.');
const database = read('FORUM_DATABASE') || 'postgres';

const config = {
  url,
  secret,
  database,
  port: 4567,
  bind_address: '0.0.0.0',
  isCluster: false,
  plugins: { active: PLUGINS },
  // Uploads live on the mounted volume (compose.yaml), not in the image.
  upload_path: '/usr/src/app/public/uploads',
};

if (database === 'postgres') {
  const password = read('FORUM_DB_PASSWORD');
  const required = { host: read('FORUM_DB_HOST'), database: read('FORUM_DB_NAME'), username: read('FORUM_DB_USER') };
  for (const [key, value] of Object.entries(required)) if (!value) fail(`FORUM_DB_${key === 'username' ? 'USER' : key === 'database' ? 'NAME' : 'HOST'} is required.`);
  if (!password) fail('FORUM_DB_PASSWORD (or FORUM_DB_PASSWORD_FILE) is required.');
  config.postgres = { ...required, password, port: Number(read('FORUM_DB_PORT') || 5432), ssl: false };
} else if (database === 'redis') {
  config.redis = { host: read('FORUM_REDIS_HOST') || '127.0.0.1', port: Number(read('FORUM_REDIS_PORT') || 6379), database: 0 };
} else {
  fail('FORUM_DATABASE must be postgres.');
}

const target = process.env.REDACTPLUS_CONFIG_PATH || '/run/nodebb/config.json';
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(config, null, 2), { mode: 0o600 });
console.log(`forum config: written for ${database}`);
