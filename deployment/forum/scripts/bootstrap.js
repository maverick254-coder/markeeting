'use strict';

/**
 * Runs before NodeBB starts (entrypoint.sh), from the NodeBB directory:
 * - an empty database gets NodeBB's own setup (no asset build: assets are in the image), with
 *   the first administrator from FORUM_ADMIN_USERNAME / FORUM_ADMIN_EMAIL /
 *   FORUM_ADMIN_PASSWORD_FILE (used once, then ignored);
 * - an existing database gets NodeBB's schema upgrade (`nodebb upgrade --schema`), so a new
 *   image upgrades its data on start.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MIN_PASSWORD = 12;

/**
 * The first administrator for NodeBB's setup, read only when the database is empty. Throws with a
 * clear reason instead of ever letting setup create an administrator with a blank or weak
 * password. After that administrator has signed in, RUNBOOK.md §4 empties the password file (the
 * file itself must stay: Compose mounts it on every recreate); an empty file is never read again
 * unless the database is empty, and then this refuses to start.
 */
function firstAdmin(env = process.env, readFile = (file) => fs.readFileSync(file, 'utf8')) {
  const username = (env.FORUM_ADMIN_USERNAME || '').trim();
  const email = (env.FORUM_ADMIN_EMAIL || '').trim();
  const file = (env.FORUM_ADMIN_PASSWORD_FILE || '').trim();
  if (!username) throw new Error('first start needs FORUM_ADMIN_USERNAME.');
  if (!email) throw new Error('first start needs FORUM_ADMIN_EMAIL.');
  if (!file) throw new Error('first start needs FORUM_ADMIN_PASSWORD_FILE (the first administrator\'s password).');
  let password;
  try {
    password = readFile(file).trim();
  } catch (err) {
    throw new Error(`first start cannot read the administrator password file ${file} (${err.code || err.message}).`);
  }
  if (!password) {
    throw new Error(`the administrator password file ${file} is empty, but the database is empty too: first start needs a password (${MIN_PASSWORD}+ characters). No administrator was created.`);
  }
  if (password.length < MIN_PASSWORD) {
    throw new Error(`the administrator password in ${file} is shorter than ${MIN_PASSWORD} characters. No administrator was created.`);
  }
  return { username, email, password };
}

module.exports = { firstAdmin, MIN_PASSWORD };

const root = process.cwd();
const configPath = process.env.REDACTPLUS_CONFIG_PATH || '/run/nodebb/config.json';
const run = (args) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status || 1);
};

if (require.main === module) (async () => {
  require(path.join(root, 'node_modules/nconf')).argv().env({ separator: '__' });
  require(path.join(root, 'src/prestart')).loadConfig(configPath);
  const db = require(path.join(root, 'src/database'));
  await db.init();
  const installed = await db.exists('categories:cid');
  await db.close();

  if (!installed) {
    let admin;
    try {
      admin = firstAdmin();
    } catch (err) {
      console.error(`forum bootstrap: ${err.message}`);
      process.exit(1);
    }
    const { username, email, password } = admin;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const setup = {
      url: config.url,
      secret: config.secret,
      database: config.database,
      'postgres:host': config.postgres.host,
      'postgres:port': config.postgres.port,
      'postgres:username': config.postgres.username,
      'postgres:password': config.postgres.password,
      'postgres:database': config.postgres.database,
      'admin:username': username,
      'admin:email': email,
      'admin:password': password,
      'admin:password:confirm': password,
    };
    // NodeBB's first setup sets the default theme, which it refuses while the plugin list is
    // pinned and no theme exists yet. Setup therefore runs from an unpinned copy of the config;
    // NodeBB itself always starts from the pinned one.
    const setupConfigPath = `${configPath}.setup.json`;
    const { plugins: _pinned, ...unpinned } = config;
    fs.writeFileSync(setupConfigPath, JSON.stringify(unpinned), { mode: 0o600 });
    // Last guard before NodeBB creates the administrator: never with a blank or short password.
    if (typeof setup['admin:password'] !== 'string' || setup['admin:password'].length < MIN_PASSWORD) {
      console.error('forum bootstrap: refusing to run NodeBB setup without the administrator password.');
      process.exit(1);
    }
    console.log('forum bootstrap: empty database, running NodeBB setup');
    try {
      run(['app.js', `--setup=${JSON.stringify(setup)}`, '--skip-build', `--config=${setupConfigPath}`]);
    } finally {
      fs.rmSync(setupConfigPath, { force: true });
    }
  } else {
    console.log('forum bootstrap: upgrading the data store schema if needed');
    run(['./nodebb', 'upgrade', '--schema', `--config=${configPath}`]);
  }
})().catch((err) => {
  console.error(`forum bootstrap failed: ${err.message}`);
  process.exit(1);
});
