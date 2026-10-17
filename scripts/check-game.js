'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(src, 'js', 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(src, 'css', 'style.css'), 'utf8');
const prep = fs.readFileSync(path.join(root, 'scripts', 'prepare.js'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const exists = (relative) => fs.existsSync(path.join(src, relative));

try { new vm.Script(js, { filename: 'src/js/game.js' }); }
catch (error) { failures.push('JavaScript syntax: ' + error.message); }

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const idSet = new Set(ids);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, 'Duplicate HTML IDs: ' + [...new Set(duplicateIds)].join(', '));
const domRefs = [...js.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
const missingIds = [...new Set(domRefs.filter((id) => !idSet.has(id)))];
check(missingIds.length === 0, 'JavaScript references missing HTML IDs: ' + missingIds.join(', '));

for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#|javascript:)/i.test(url)) continue;
  check(exists(url), 'Missing local HTML resource: src/' + url);
}
const cssOpen = (css.match(/{/g) || []).length;
const cssClose = (css.match(/}/g) || []).length;
check(cssOpen === cssClose, 'CSS brace mismatch: ' + cssOpen + ' opening vs ' + cssClose + ' closing braces.');
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#)/i.test(url)) continue;
  check(exists(url), 'Missing local CSS resource: src/' + url);
}

const decodedJs = js.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const assetRefs = [...decodedJs.matchAll(/assets\/[^'"\s)]+?\.(?:png|jpe?g|webp|ogg|mp3|wav|mp4|json|glb|gltf)(?=['"\s)]|$)/gi)]
  .map((match) => match[0]);
for (const url of [...new Set(assetRefs)]) {
  check(exists(url), 'Missing local JavaScript asset: src/' + url);
}

const bosses = ['iron-eagle.png', 'storm-bomber.png', 'Current-serpent.png', 'cloud-warden.png', 'grey-ruler.png'];
for (const name of bosses) check(exists('assets/images/bosses/' + name), 'Missing boss portrait: ' + name);
check(bosses.every((name) => js.includes(name.replace(/\.png$/, ''))), 'The boss image name array does not reference every boss portrait.');

const threeCdn = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
check(html.includes(threeCdn), 'Expected Three.js source URL is missing from src/index.html.');
check(prep.includes('threeCdnPattern') && prep.includes("'js/three.min.js'"), 'prepare.js does not validate and replace the Three.js CDN reference.');
check(fs.existsSync(path.join(root, 'package.json')), 'package.json is missing.');

if (failures.length) {
  console.error('Game integrity checks FAILED:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Game integrity checks passed: JS syntax, DOM IDs, local assets, CSS structure, boss portraits, and local Three.js preparation.');
