'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const exists = (relative) => fs.existsSync(path.resolve(root, relative));

try { new vm.Script(js, { filename: 'js/game.js' }); }
catch (error) { failures.push('JavaScript syntax: ' + error.message); }

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
check(duplicateIds.length === 0, 'Duplicate HTML IDs: ' + [...new Set(duplicateIds)].join(', '));
const idSet = new Set(ids);
const domRefs = [...js.matchAll(/\$\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
const missingIds = [...new Set(domRefs.filter((id) => !idSet.has(id)))];
check(missingIds.length === 0, 'JavaScript references missing HTML IDs: ' + missingIds.join(', '));

for (const match of html.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#|javascript:|mailto:)/i.test(url)) continue;
  check(exists(url), 'Missing local HTML resource: ' + url);
}
const cssOpen = (css.match(/{/g) || []).length;
const cssClose = (css.match(/}/g) || []).length;
check(cssOpen === cssClose, 'CSS brace mismatch: ' + cssOpen + ' opening vs ' + cssClose + ' closing braces.');
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#)/i.test(url)) continue;
  check(exists(url), 'Missing local CSS resource: ' + url);
}

const decodedJs = js.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const assetRefs = [...decodedJs.matchAll(/assets\/[^'"\s)]+?\.(?:png|jpe?g|webp|ogg|mp3|wav|mp4|json|glb|gltf)(?=['"\s)]|$)/gi)].map((match) => match[0]);
for (const url of [...new Set(assetRefs)]) {
  let localPath = url;
  try { localPath = decodeURIComponent(url); } catch {}
  check(exists(localPath), 'Missing local JavaScript asset: ' + localPath);
}

let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/models/asset-catalog.json'), 'utf8'));
  check(catalog.root === 'assets/models', 'Asset catalog root must be assets/models.');
} catch (error) {
  failures.push('Asset catalog JSON: ' + error.message);
}
const expectedModels = [
  'assets/models/bonus/low_poly_ww2_fighter_planes.glb',
  'assets/models/planes-dead/kamikaze_scout.glb',
  'assets/models/planes-dead/dive_attacker.glb',
  'assets/models/bosses/iron_eagle.glb',
  'assets/models/environment/desert_outpost.glb',
  'assets/models/environment/ice_island.glb',
  'assets/models/environment/The_castle_of_boss.glb',
  'assets/models/environment/castle_bar_resaux.glb',
  'assets/models/environment/eagle_tower_boss1.glb',
  'assets/models/environment/searchlight_place.glb',
  'assets/models/assault-defender/fire-turet.glb',
  'assets/models/wildlife/MechaFish.glb'
];
for (const model of expectedModels) {
  check(exists(model), 'Required gameplay model is missing: ' + model);
  check(js.includes(model.split('/').pop()), 'Required gameplay model is not referenced by runtime code: ' + model);
  if (exists(model)) {
    const bytes = fs.readFileSync(path.join(root, model));
    check(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF', 'Invalid or truncated GLB: ' + model);
    if (bytes.length >= 12) {
      check(bytes.readUInt32LE(4) === 2, 'GLB must use glTF binary version 2: ' + model);
      check(bytes.readUInt32LE(8) === bytes.length, 'GLB header length mismatch: ' + model);
    }
  }
}

check(html.indexOf('GLTFLoader.js') >= 0 && html.indexOf('js/game.js') > html.indexOf('GLTFLoader.js'), 'GLTFLoader must load before js/game.js.');
check(js.includes('const squadronSize=3') && js.includes('const coins=10;'), 'Boss reward must spawn a three-plane squadron worth 10 coins per aircraft.');
check(js.includes('reward.hit=true;reward.collected=true;') && js.includes('collectBossRewardPlane(reward);'), 'Bonus aircraft must use one-time collection and a dedicated collision path.');
check(js.includes('r.x=r.originX-r.age*95'), 'Bonus aircraft must drift slowly toward the player.');
const towerSpawns = ["spawnWorldLandmark('eagleTower',x-260,zc(-235),stage)", "spawnWorldLandmark('eagleTower',x-260,zc(235),stage)"];
check(towerSpawns.length === 2 && towerSpawns.some((spawn) => spawn.includes('zc(-235)')) && towerSpawns.some((spawn) => spawn.includes('zc(235)')), 'First boss arena must spawn two widely spaced opposing towers at the entrance.');
check(js.includes("spawnWorldLandmark('searchlight',x,zc(-215),stage)") && js.includes('segment.visible=activeBiome!==1'), 'Desert stage must use the searchlight landmark and hide the normal road.');
check(js.includes("if(stage===3)spawnWorldLandmark('iceIsland'"), 'Ice island must appear in the snow-stage approach zone.');
check(js.includes('if(objs&&Array.isArray(objs.landmarks))objs.landmarks.forEach(item=>{if(item.mixer){item.mixer.stopAllAction();if(item.mesh)item.mixer.uncacheRoot(item.mesh);item.mixer=null;}});'), 'Resetting a run must stop and uncache landmark animation mixers.');
check(js.includes("if(item.kind==='eagleTower'&&item.mesh){item.mesh.rotation.y=-Math.PI/2;}"), 'Eagle tower must face south (+Z in the scene compass), correcting the model forward axis.');
check(js.includes("file:'fire-turet.glb',role:'fire',biome:'general',color:0xff512d,attack:'rocket'"), 'fire-turet.glb must operate as a ground missile turret.');
check(js.includes('old.traverse(node=>{if(node.userData&&node.userData.defenseFallback)node.traverse(fallbackNode=>{if(fallbackNode.geometry)fallbackNode.geometry.dispose();if(fallbackNode.material)(Array.isArray(fallbackNode.material)?fallbackNode.material:[fallbackNode.material]).forEach(material=>material.dispose());});});'), 'Replacing procedural defense fallback models must find and dispose nested owned geometry and materials.');
check(js.includes('g.userData.worldFallback=true;') && js.includes('if(old.userData&&old.userData.worldFallback)old.traverse(node=>{if(node.geometry)node.geometry.dispose();if(node.material)(Array.isArray(node.material)?node.material:[node.material]).forEach(material=>material.dispose());});'), 'Replacing procedural world landmarks must dispose owned fallback geometry and materials.');
check(js.includes("const enemyKind=stage===0?'kamikaze':stage>=1?'dive':null;"), 'Dive attacker must appear as the player progresses beyond the opening stage.');
check(js.includes('if(biomeIndex===2){spawnWorldLandmark(\'serpentWater\'') && js.includes('spawnSeaFishSchool(x-1850,stage)') && js.includes('spawnSeaFishSchool(x-450,stage)'), 'MechaFish schools must be restricted to the Current-serpent boss encounter.');
check(js.includes('if(best)return best;') && js.includes('for(const reward of bossRewardPlanes)'), 'Enemy/boss target priority must be preserved before bonus targeting.');
check(js.includes('function disposeSeaFishMaterials(mesh)') && js.includes('disposeSeaFishMaterials(f.mesh);objs.seaFish.splice(i,1);') && js.includes('objs.seaFish.forEach(f=>disposeSeaFishMaterials(f.mesh))'), 'Sea-fish material clones must be disposed when fish expire and when a run resets.');
check(js.includes('group.userData.seaFishFallback=true;') && js.includes('const ownsFallbackGeometry=!!mesh.userData?.seaFishFallback;') && js.includes('if(ownsFallbackGeometry&&node.geometry)node.geometry.dispose();'), 'Procedural sea-fish geometry must be disposed without disposing shared GLB template geometry.');
if (catalog) {
  const fire = catalog.categories?.['assault-defender']?.models?.['fire-turet.glb'];
  check(fire?.role === 'ground_missile_turret' && fire?.attack === 'homing_rocket', 'Asset catalog must describe fire-turet.glb as a ground missile turret.');
  const searchlight = catalog.categories?.environment?.models?.['searchlight_place.glb'];
  check(Array.isArray(searchlight?.biomes) && searchlight.biomes.includes('desert'), 'Searchlight landmark must be cataloged for the desert biome.');
  const diveAttacker = catalog.categories?.['planes-dead']?.models?.['dive_attacker.glb'];
  check(['desert', 'ocean', 'snow', 'final_boss_arena'].every((biome) => diveAttacker?.biomes?.includes(biome)), 'Dive attacker catalog must match runtime spawning in later biomes.');
}
if (failures.length) {
  console.error('Web game integrity checks FAILED:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Web game integrity checks passed: JavaScript syntax, DOM IDs, local assets, CSS, GLB headers, asset catalog, bonus squadron, boss arena, desert/ice/serpent placements, and ground missile turret.');
