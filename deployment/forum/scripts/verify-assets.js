'use strict';

/**
 * Image build only (deployment/forum/Dockerfile, the last step of the build stage). Fails the
 * build unless the image already holds everything NodeBB would otherwise copy or build into
 * build/public at runtime, where the root filesystem is read-only (any such write is EROFS and
 * stops NodeBB):
 *
 *   - the Font Awesome webfonts and scss, as copyFontAwesomeFiles() in src/meta/css.js copies them;
 *   - client.css, admin.css and client-<skin>.css for every Bootswatch skin, each with its -rtl twin,
 *     so /assets/client-<skin>.css never falls through to NodeBB's on-demand build;
 *   - nodebb-theme-harmony without its startup rebuild of every skin (patch-harmony.js).
 *
 *   node verify-assets.js [NodeBB directory]
 */

const fs = require('fs');
const path = require('path');

const APP = process.argv[2] || '/usr/src/app';
const problems = [];
const nonEmpty = (file) => fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0;

// Font Awesome: the same source folder and file filter as copyFontAwesomeFiles() (free edition;
// write-config.js never sets fontawesome:pro).
const fontawesome = path.dirname(path.dirname(require.resolve('@fortawesome/fontawesome-free', { paths: [APP] })));
const copied = [
  ['webfonts', (name) => /\.(woff2|ttf|eot)?$/.test(name)],
  ['scss', () => true],
];
let fontFiles = 0;
for (const [dir, wanted] of copied) {
  const source = path.join(fontawesome, dir);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isFile() || !wanted(entry.name)) continue;
    fontFiles += 1;
    const shipped = path.join(APP, 'build/public/fontawesome', dir, entry.name);
    if (!fs.existsSync(shipped)) problems.push(`missing build/public/fontawesome/${dir}/${entry.name}`);
    else if (fs.statSync(shipped).size !== fs.statSync(path.join(source, entry.name)).size) problems.push(`differs: build/public/fontawesome/${dir}/${entry.name}`);
  }
}
if (fontFiles === 0) problems.push(`no Font Awesome files found in ${fontawesome}`);

// Stylesheets: NodeBB's own skin list, read from its source.
const css = fs.readFileSync(path.join(APP, 'src/meta/css.js'), 'utf8');
const list = css.match(/supportedSkins = \[([^\]]*)\]/);
const skins = list ? list[1].match(/[a-z]+/g) : [];
if (skins.length < 20) problems.push(`unexpected skin list in src/meta/css.js (${skins.length} skins)`);
const sheets = ['client', 'admin', ...skins.map((skin) => `client-${skin}`)];
for (const sheet of sheets) {
  for (const suffix of ['', '-rtl']) {
    if (!nonEmpty(path.join(APP, 'build/public', `${sheet}${suffix}.css`))) problems.push(`missing or empty build/public/${sheet}${suffix}.css`);
  }
}

// The theme's startup rebuild.
const harmony = fs.readFileSync(path.join(APP, 'node_modules/nodebb-theme-harmony/library.js'), 'utf8');
if (harmony.includes('setTimeout(buildSkins')) problems.push('nodebb-theme-harmony still rebuilds every skin at startup (patch-harmony.js did not apply)');
if (!harmony.includes('RedactPlus: skins are pre-built')) problems.push('nodebb-theme-harmony is not the patched version');

if (problems.length) {
  console.error(`verify-assets: the image would write into its read-only filesystem at runtime:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`verify-assets: ${fontFiles} Font Awesome files, ${sheets.length * 2} stylesheets (${skins.length} skins), Harmony patched`);
