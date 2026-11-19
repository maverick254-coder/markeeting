'use strict';

/**
 * Image build only (deployment/forum/Dockerfile, build stage). Removes nodebb-theme-harmony's
 * startup rebuild of every Bootswatch skin. At runtime the root filesystem is read-only: that
 * rebuild copies fonts into build/public and NodeBB crashes with EROFS on hosts with more than
 * 2 CPUs (the only hosts where the theme does it). The skins are built into the image instead
 * (prebuild-skins.js), so a request for any skin is served from build/public.
 *
 * The build fails if the theme no longer contains the call exactly once, so an upgrade cannot
 * silently bring the rebuild back.
 *
 *   node patch-harmony.js [path to nodebb-theme-harmony/library.js]
 */

const fs = require('fs');

const file = process.argv[2] || '/usr/src/app/node_modules/nodebb-theme-harmony/library.js';
const needle = 'setTimeout(buildSkins, 0);';
const replacement = '/* RedactPlus: skins are pre-built into the read-only image (prebuild-skins.js) */';

const source = fs.readFileSync(file, 'utf8');
const count = source.split(needle).length - 1;
if (count !== 1) {
  console.error(`patch-harmony: expected "${needle}" exactly once in ${file}, found ${count}. Review the theme upgrade.`);
  process.exit(1);
}
fs.writeFileSync(file, source.replace(needle, replacement));
console.log('patch-harmony: startup skin rebuild removed');
