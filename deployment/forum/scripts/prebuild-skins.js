'use strict';

/**
 * Image build only (deployment/forum/Dockerfile, build stage, after `nodebb build`, with the
 * build's throwaway Redis running). Builds client-<skin>.css and client-<skin>-rtl.css for every
 * Bootswatch skin NodeBB supports, the same way nodebb-theme-harmony does at startup.
 *
 * At runtime the root filesystem is read-only. NodeBB serves /assets from build/public first and
 * builds a skin on demand only when its file is missing; that build writes into build/public and
 * crashes NodeBB with EROFS. With every skin present, no skin request reaches it.
 *
 *   node prebuild-skins.js <NodeBB config file>
 */

const fs = require('fs');
const path = require('path');

const APP = '/usr/src/app';
const configFile = process.argv[2];
if (!configFile) {
  console.error('prebuild-skins: usage: node prebuild-skins.js <config file>');
  process.exit(2);
}
process.chdir(APP);

// What NodeBB's CLI loads first (src/cli/index.js): plugins resolve NodeBB modules through these.
require(path.join(APP, 'require-main'));
require(path.join(APP, 'nodebb-global'));

// NodeBB's own nconf instance, configured exactly as `./nodebb build` configures it.
const nconf = require(require.resolve('nconf', { paths: [APP] }));
nconf.argv().env({ separator: '__' });
const prestart = require(path.join(APP, 'src/prestart'));
prestart.setupWinston();
prestart.loadConfig(path.resolve(configFile));

async function main() {
  const db = require(path.join(APP, 'src/database'));
  await db.init();
  const meta = require(path.join(APP, 'src/meta'));
  await meta.themes.setupPaths();
  const plugins = require(path.join(APP, 'src/plugins'));
  await plugins.prepareForBuild(['client side styles']);

  const skins = meta.css.supportedSkins;
  if (!Array.isArray(skins) || skins.length < 20) throw new Error(`unexpected skin list: ${JSON.stringify(skins)}`);
  for (const skin of skins) {
    // In series, without extra processes: the build stage has no reason to fork.
    await meta.css.buildBundle(`client-${skin}`, false); // eslint-disable-line no-await-in-loop
  }
  require(path.join(APP, 'src/meta/minifier')).killAll();

  const missing = [];
  for (const skin of skins) {
    for (const suffix of ['', '-rtl']) {
      const file = path.join(APP, 'build/public', `client-${skin}${suffix}.css`);
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) missing.push(path.basename(file));
    }
  }
  if (missing.length) throw new Error(`skins not built: ${missing.join(', ')}`);
  await db.close();
  console.log(`prebuild-skins: ${skins.length} skins built (LTR and RTL)`);
}

main().then(() => process.exit(0), (err) => {
  console.error(`prebuild-skins: ${err.stack || err}`);
  process.exit(1);
});
