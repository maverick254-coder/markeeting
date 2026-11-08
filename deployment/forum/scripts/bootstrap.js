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

const root = process.cwd();
const configPath = process.env.REDACTPLUS_CONFIG_PATH || '/run/nodebb/config.json';
const run = (args) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (result.status !== 0) process.exit(result.status || 1);
};

(async () => {
  require(path.join(root, 'node_modules/nconf')).argv().env({ separator: '__' });
  require(path.join(root, 'src/prestart')).loadConfig(configPath);
  const db = require(path.join(root, 'src/database'));
  await db.init();
  const installed = await db.exists('categories:cid');
  await db.close();

  if (!installed) {
    const password = process.env.FORUM_ADMIN_PASSWORD_FILE ? fs.readFileSync(process.env.FORUM_ADMIN_PASSWORD_FILE, 'utf8').trim() : '';
    const username = (process.env.FORUM_ADMIN_USERNAME || '').trim();
    const email = (process.env.FORUM_ADMIN_EMAIL || '').trim();
    if (!username || !email || password.length < 12) {
      console.error('forum bootstrap: first start needs FORUM_ADMIN_USERNAME, FORUM_ADMIN_EMAIL and FORUM_ADMIN_PASSWORD_FILE (12+ characters).');
      process.exit(1);
    }
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
