// Local trial only: role-to-group table for nodebb-plugin-sso-oauth2-multiple.
process.chdir(__dirname + '/nodebb');
const path = require('path');
const nconf = require(path.resolve('node_modules/nconf'));
nconf.argv().env({ separator: '__' });
require(path.resolve('src/prestart')).loadConfig(path.resolve('config.json'));
(async () => {
  const db = require(path.resolve('src/database'));
  await db.init();
  const meta = require(path.resolve('src/meta'));
  await meta.settings.set('sso-oauth2-multiple', { roles: 'forum-moderator', groups: 'Global Moderators' });
  console.log('role mapping saved:', JSON.stringify(await meta.settings.get('sso-oauth2-multiple')));
  await db.close(); process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
