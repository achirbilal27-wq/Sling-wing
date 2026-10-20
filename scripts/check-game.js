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
check(css.includes('left:calc(50% + 42px)') && css.includes('left:calc(50% + 38px)'), 'Pause button must sit beside the right edge of the centered fuel gauge on desktop and narrow screens.');
check(css.includes('#pauseBtn:active{transform:scale(.94)}'), 'Pause button active styling must not restore the overlapping centered transform.');
check(css.includes('#fuelGauge{') && css.includes('left:50%') && css.includes('transform:translateX(-50%)'), 'Fuel gauge must remain centered so the pause control can be positioned beside it.');
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#)/i.test(url)) continue;
  check(exists(url), 'Missing local CSS resource: src/' + url);
}

const decodedJs = js.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const assetRefs = [...decodedJs.matchAll(/assets\/[^'"\s)]+?\.(?:png|jpe?g|webp|ogg|mp3|wav|mp4|json|glb|gltf)(?=['"\s)]|$)/gi)]
  .map((match) => match[0]);
// Phantom and Guardian are user-supplied optional GLB models. Their absence is
// expected until the developer adds their own files; game.js keeps a procedural fallback.
const optionalCustomAircraft = new Set([
  'assets/models/aircraft/phantom.glb',
  'assets/models/aircraft/guardian.glb',
]);
for (const url of [...new Set(assetRefs)]) {
  if (optionalCustomAircraft.has(url)) continue;
  check(exists(url), 'Missing local JavaScript asset: src/' + url);
}
const glbModels = [
  { path: 'assets/models/aircraft/stylized_ww1_plane.glb', label: 'Falcon player aircraft' },
  { path: 'assets/models/glb/plane_pc.glb', label: 'Enemy aircraft' },
  { path: 'assets/models/bosses/iron_eagle.glb', label: 'Iron Eagle boss' },
];
for (const model of glbModels) {
  check(exists(model.path), model.label + ' GLB model is missing: src/' + model.path);
  const modelPath = path.join(src, model.path);
  if (!fs.existsSync(modelPath)) continue;
  const glb = fs.readFileSync(modelPath);
  check(glb.length >= 20, model.label + ' GLB is unexpectedly small or truncated.');
  if (glb.length >= 12) {
    check(glb.toString('ascii', 0, 4) === 'glTF', model.label + ' model is not a valid binary glTF file.');
    check(glb.readUInt32LE(4) === 2, model.label + ' GLB must use glTF binary version 2.');
    check(glb.readUInt32LE(8) === glb.length, model.label + ' GLB header length does not match the actual file size.');
  }
}
const loaderScriptIndex = html.indexOf('GLTFLoader.js');
const gameScriptIndex = html.indexOf('js/game.js');
check(loaderScriptIndex >= 0 && gameScriptIndex > loaderScriptIndex, 'GLTFLoader must be loaded before game.js.');

const bosses = ['iron-eagle.png', 'storm-bomber.png', 'Current-serpent.png', 'cloud-warden.png', 'grey-ruler.png'];
for (const name of bosses) check(exists('assets/images/bosses/' + name), 'Missing boss portrait: ' + name);
check(bosses.every((name) => js.includes(name.replace(/\.png$/, ''))), 'The boss image name array does not reference every boss portrait.');

const threeCdn = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
check(html.includes(threeCdn), 'Expected Three.js source URL is missing from src/index.html.');
check(prep.includes('threeCdnPattern') && prep.includes("'js/three.min.js'"), 'prepare.js does not validate and replace the Three.js CDN reference.');
check(html.includes('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'), 'GLTFLoader script is missing from src/index.html.');
check(prep.includes('GLTFLoader.js') && prep.includes("'js/GLTFLoader.js'"), 'prepare.js does not bundle GLTFLoader for offline Android use.');
check(js.includes("assets/models/glb/plane_pc.glb") && js.includes('loadEnemyPlaneModel'), 'Enemy GLB loading is not configured.');
check(js.includes('if(enemy.boss||!enemy.mesh||!enemy.mesh.parent) return;'), 'Enemy GLB loading must preserve active boss meshes.');
check(js.includes("phantom:{name:'الشبح النفاث',short:'الشبح',unlock:3000"), 'Phantom must unlock at 3000 m and before Guardian.');
check(js.includes("guardian:{name:'الحارس المدرع',short:'الحارس',unlock:4000"), 'Guardian must be the final aircraft unlocked at 4000 m.');
check(js.includes("}else if(key==='phantom'){") && js.includes("'الشبح: إمداد وقود +38٪'"), 'Phantom must own the fuel-supply ability.');
check(js.includes("}else if(key==='guardian'){") && js.includes('P.guardianOverdriveT=4'), 'Guardian must have its temporary heavy-cannon combat ability.');
check(js.includes("trainer:{name:'الصقر التدريبي',short:'الصقر',unlock:0"), 'Falcon must remain the first aircraft and be available from the start.');
check(js.includes("['trainer','assets/models/aircraft/stylized_ww1_plane.glb']") && js.includes("model==='trainer'"), 'WWI GLB must replace the original Falcon model rather than appear as a separate aircraft.');
check(js.includes("if(!AIRCRAFT[save.model]){save.model='trainer';persist();}"), 'Legacy saves must migrate removed aircraft selections back to Falcon.');
const preparedHtmlPath = path.join(root, 'www', 'index.html');
if (fs.existsSync(preparedHtmlPath)) {
  const preparedHtml = fs.readFileSync(preparedHtmlPath, 'utf8');
  check(preparedHtml.includes('src="js/three.min.js"'), 'Prepared Android HTML does not load local Three.js.');
  check(preparedHtml.includes('src="js/GLTFLoader.js"'), 'Prepared Android HTML does not load local GLTFLoader.');
  check(!preparedHtml.includes(threeCdn), 'Prepared Android HTML still references the Three.js CDN.');
  check(fs.existsSync(path.join(root, 'www', 'js', 'three.min.js')), 'Prepared Android build is missing www/js/three.min.js.');
  check(fs.existsSync(path.join(root, 'www', 'js', 'GLTFLoader.js')), 'Prepared Android build is missing www/js/GLTFLoader.js.');
  for (const model of glbModels) {
    check(fs.existsSync(path.join(root, 'www', model.path)), 'Prepared Android build is missing GLB asset: www/' + model.path);
  }
}
check(fs.existsSync(path.join(root, 'package.json')), 'package.json is missing.');

if (failures.length) {
  console.error('Game integrity checks FAILED:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Game integrity checks passed: JS syntax, DOM IDs, local assets, CSS structure, boss portraits, and local Three.js preparation.');
