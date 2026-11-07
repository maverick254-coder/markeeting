// Local trial only: create a NodeBB master API token with NodeBB's own module.
process.chdir(__dirname + '/nodebb');
const path = require('path');
const nconf = require(path.resolve('node_modules/nconf'));
nconf.argv().env({ separator: '__' });
require(path.resolve('src/prestart')).loadConfig(path.resolve('config.json'));
(async () => {
  const db = require(path.resolve('src/database'));
  await db.init();
  const utils = require(path.resolve('src/api/utils'));
  const token = await utils.tokens.generate({ uid: 0, description: 'portal adapter (local trial)' });
  require('fs').writeFileSync(path.resolve('../master-token.txt'), token, { mode: 0o600 });
  console.log('master token created, length', token.length);
  await db.close();
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
