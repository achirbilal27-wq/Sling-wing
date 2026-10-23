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
const flightHudStart = css.lastIndexOf('/* Flight HUD:');
const flightHudCss = flightHudStart >= 0 ? css.slice(flightHudStart) : '';
check(/#pauseBtn\{[^}]*top:27px !important;[^}]*left:50% !important;[^}]*right:auto !important;[^}]*transform:translateX\(-50%\) !important;/.test(flightHudCss), 'Final flight HUD rules must center the pause button.');
check(/#runCoins\{[^}]*top:12px !important;[^}]*right:12px !important;[^}]*left:auto !important;/.test(flightHudCss), 'Final flight HUD rules must keep the coin counter on the right side.');
check(flightHudCss.includes('#fuelGauge{top:10px !important;right:74px !important;width:56px !important;height:56px !important}'), 'Fuel gauge must fit narrow screens.');
check(flightHudCss.includes('#fuelGauge{top:8px !important;right:72px !important;width:54px !important;height:54px !important}'), 'Fuel gauge must fit short screens.');
check(flightHudCss.includes('#pauseBtn:active{transform:translateX(-50%) scale(.94) !important}'), 'Pause button active styling must preserve its centered position.');
check(/#fuelGauge\{[^}]*top:12px !important;[^}]*right:88px !important;[^}]*width:76px !important;[^}]*height:76px !important;/.test(flightHudCss), 'Final flight HUD rules must position the fuel gauge between the pause button and coin counter.');
check(flightHudCss.includes('@media(max-width:380px){') && /#pauseBtn\{top:21px !important;width:38px !important;height:38px !important\}/.test(flightHudCss), 'Pause button must shrink on narrow screens.');
check(!/#pauseBtn\{[^}]*right:(?:12|8)px/.test(css), 'Legacy right-corner pause positioning must not conflict with the centered HUD button.');
check((css.match(/#pauseBtn\{[^}]*left:50% !important;[^}]*right:auto !important;[^}]*transform:translateX\(-50%\) !important;/g)||[]).length===1, 'Pause button must have exactly one canonical centered positioning rule.');
const playerModelPrep=js.slice(js.indexOf('function prepareAircraftModel(root){'),js.indexOf('function loadPlayerAircraftModels()',js.indexOf('function prepareAircraftModel(root){')));
check(playerModelPrep.includes('if(originalSize.x>originalSize.z)normalized.rotation.y=Math.PI/2;'), 'Falcon GLB must be rotated into the game forward axis when its wingspan lies on X.');
check(playerModelPrep.includes('normalized.scale.setScalar(14/span);'), 'Falcon GLB must be fitted to the procedural aircraft size.');
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const url = match[1];
  if (/^(?:https?:|data:|#)/i.test(url)) continue;
  check(exists(url), 'Missing local CSS resource: src/' + url);
}

const decodedJs = js.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
const assetRefs = [...decodedJs.matchAll(/assets\/[^'"\s)]+?\.(?:png|jpe?g|webp|ogg|mp3|wav|mp4|json|glb|gltf)(?=['"\s)]|$)/gi)]
  .map((match) => match[0]);
for (const url of [...new Set(assetRefs)]) {
  // Browser URLs may encode filesystem characters such as '#' as '%23'.
  // Decode only for the local filesystem check; keep the runtime URL encoded.
  let localPath = url;
  try { localPath = decodeURIComponent(url); } catch {}
  check(exists(localPath), 'Missing local JavaScript asset: src/' + localPath);
}
check(
  js.includes('assets/models/environment/eagle_tower_boss1.glb') && exists('assets/models/environment/eagle_tower_boss1.glb'),
  'First-boss tower runtime URL must point to the renamed local GLB.'
);
check(!js.includes('eagle_tower%231boss.glb') && !js.includes('eagle_tower#1boss.glb'),
  'Legacy eagle tower filename must not remain in runtime code.');
check(js.includes("if(stage===0)spawnWorldLandmark('eagleTower',x-600,0,stage);"),
  'Eagle tower must spawn only before the first boss arena.');
check(js.includes("new THREE.CylinderGeometry(0.65,1.1,1,8)") && js.includes('laserBeam:true'),
  'Laser defenses must render a beam mesh rather than only a spherical projectile.');
check(js.includes("bossRewardPlanes.push({mesh,life:5.5") && js.includes('مكافأة الزعيم: طائرة إضافية!'),
  'Boss reward flyby must remain visible long enough and show a reward notification.');
const rewardSpawnStart = js.indexOf('function spawnBossRewardPlane(boss){');
const rewardSpawnEnd = js.indexOf('\nfunction prepareAircraftModel(root){', rewardSpawnStart);
const rewardSpawn = rewardSpawnStart >= 0 && rewardSpawnEnd > rewardSpawnStart ? js.slice(rewardSpawnStart, rewardSpawnEnd) : '';
const rewardUpdateStart = js.indexOf('for(let i=bossRewardPlanes.length-1;i>=0;i--){');
const rewardUpdateEnd = js.indexOf('for(let i=bossBlastRings.length-1;', rewardUpdateStart);
const rewardUpdate = rewardUpdateStart >= 0 && rewardUpdateEnd > rewardUpdateStart ? js.slice(rewardUpdateStart, rewardUpdateEnd) : '';
check(rewardSpawn.includes('const aircraft=bonusPlaneTemplate?bonusPlaneTemplate.clone(true):makeEnemyPlane();') &&
  rewardSpawn.includes('aircraft.scale.multiplyScalar(1.45);') &&
  rewardSpawn.includes('const mesh=new THREE.Group();') && rewardSpawn.includes('mesh.add(aircraft);'),
  'Boss reward aircraft must keep its fitted scale inside a separate animated wrapper.');
check(rewardUpdate.includes('r.mesh.scale.setScalar(0.75+0.25*Math.min(1,r.life/0.6));') &&
  !rewardUpdate.includes('r.mesh.scale.setScalar(scale)'),
  'Boss reward animation must scale only the wrapper without overwriting aircraft normalization.');
check(js.includes('function defeatBoss(e,source){') && js.includes('if(!e||e.hit)return;') &&
  js.includes('spawnBossRewardPlane(e);'),
  'Boss reward must be spawned only after the first valid boss-defeat transition.');
const glbModels = [
  { path: 'assets/models/aircraft/stylized_ww1_plane.glb', label: 'Falcon player aircraft' },
  { path: 'assets/models/glb/plane_pc.glb', label: 'Enemy aircraft' },
  { path: 'assets/models/bosses/iron_eagle.glb', label: 'Iron Eagle boss' },
  { path: 'assets/models/wildlife/MechaFish.glb', label: 'MechaFish ocean ambusher' },
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
check(js.includes('if(enemy.boss||enemy.enemyKind||!enemy.mesh||!enemy.mesh.parent) return;'), 'Default enemy GLB loading must preserve bosses and stage-specific aircraft.');
check(js.includes('function spawnRocketAmbush()') && js.includes('if(run.bosses===2)spawnRocketAmbush();'), 'Rocket ambush must trigger once after defeating the second boss.');
check(js.includes("e.enemyKind==='rocketAmbush'") && js.includes('homing:rocket'), 'Rocket ambush attackers must fire guided rocket projectiles.');
check(js.includes('three-round burst') && js.includes('fireStageEnemyShot(e,false)'), 'Stage-two dive attackers must fire repeated three-round volleys.');
check(js.includes("phantom:{name:'الشبح النفاث',short:'الشبح',unlock:8149"), 'Phantom must unlock at 8149 m.');
check(js.includes("guardian:{name:'الحارس المدرع',short:'الحارس',unlock:9462"), 'Guardian must unlock at 9462 m.');
check(js.includes("Object.entries(AIRCRAFT).sort(([,a],[,b])=>a.unlock-b.unlock).forEach(([key,a])=>{"), 'Hangar aircraft must be sorted by unlock distance.');
check(js.includes("phantom:{name:'الشبح النفاث',short:'الشبح',unlock:8149") && js.includes("guardian:{name:'الحارس المدرع',short:'الحارس',unlock:9462") && 8149 < 9462, 'Phantom must unlock before Guardian at the configured distances.');
check(js.includes("}else if(key==='phantom'){") && js.includes("'الشبح: إمداد وقود +38٪'"), 'Phantom must own the fuel-supply ability.');
check(js.includes("}else if(key==='guardian'){") && js.includes('P.guardianOverdriveT=6'), 'Guardian must have its six-second temporary heavy-cannon combat ability.');
check(js.includes('P.guardianOverdriveT>0?8:1') && js.includes('shot.heavyShot?2.5:1'), 'Guardian heavy cannon must deal strongly increased damage to bosses.');
check(js.includes('ضربة المدفع الثقيل') && js.includes('0xffc857'), 'Guardian heavy-cannon hits must show visible impact feedback.');
check(js.includes("trainer:{name:'الصقر التدريبي',short:'الصقر',unlock:0"), 'Falcon must remain the first aircraft and be available from the start.');
check(js.includes("['trainer','assets/models/aircraft/stylized_ww1_plane.glb']") && js.includes("model==='trainer'"), 'WWI GLB must replace the original Falcon model rather than appear as a separate aircraft.');
check(js.includes('const modelPending=model===\'trainer\'&&aircraftModelLoadStarted&&!aircraftModelTemplates.trainer&&!aircraftModelLoadFailed;'), 'Procedural Falcon must stay hidden while the replacement GLB is loading to prevent a visible model swap.');
check(js.includes('aircraftModelLoadFailed=true;') && js.includes('applyPlaneColors();'), 'Failed Falcon GLB loading must restore the procedural fallback safely.');
check(js.includes("const customModel=model==='trainer'&&!!aircraftModelTemplates.trainer;"), 'Only the trainer aircraft may use the currently loaded player GLB; Phantom and Guardian use their active procedural kits.');
check(js.includes('prop.visible=!customModel&&!modelPending;'), 'The original procedural propeller must stay hidden while the custom Falcon GLB is loading or active.');
check(js.includes('loadIronEagleBossModel();') && js.includes('Preload the first boss before the player reaches its arena'), 'Iron Eagle boss GLB must preload before its encounter to reduce visible model swapping.');
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

check(js.includes("assets/models/wildlife/MechaFish.glb") && js.includes("function spawnSeaFishSchool") && js.includes("function updateSeaFish"), 'MechaFish must load and use runtime ocean ambush behavior.');

check(js.includes("spawnSeaFishSchool(x-1850,stage)") && js.includes("spawnSeaFishSchool(x-450,stage)"), 'MechaFish schools must spawn at separated locations in the Current-serpent ocean arena.');
check(js.includes("SEA_FISH_COLORS") && js.includes("damagePlayer(8,f.x,f.alt,f.z,'wildlife')"), 'MechaFish must use varied colors and bite damage.');

const defenseCatalogPath = path.join(src, 'assets', 'models', 'asset-catalog.json');
const defenseCatalog = JSON.parse(fs.readFileSync(defenseCatalogPath, 'utf8'));
const expectedEnvironmentModels = {
  'desert_outpost.glb': 'desertOutpost',
  'ice_island.glb': 'iceIsland',
  'The_castle_of_boss.glb': 'finalCastle',
  'castle_bar_resaux.glb': 'lighthouse',
  'eagle_tower_boss1.glb': 'eagleTower',
  'environment_of_fighter.glb': 'fighterDefense',
  'ocean_water_animated.glb': 'serpentWater',
  'searchlight_place.glb': 'searchlight',
};
const environmentCatalog = defenseCatalog.categories.environment;
check(environmentCatalog.runtimeIntegration === 'runtime-integrated', 'Environment catalog must match active landmark loading.');
for (const [filename, kind] of Object.entries(expectedEnvironmentModels)) {
  check(!!environmentCatalog.models?.[filename], 'Environment catalog is missing model mapping: ' + filename);
  check(js.includes(kind), 'Environment model has no runtime landmark integration: ' + kind);
  check(exists('assets/models/environment/' + filename), 'Environment GLB is missing: ' + filename);
}
check(defenseCatalog.categories.bonus.runtimeIntegration === 'runtime-integrated', 'Boss reward aircraft catalog must match runtime loading.');
check(!!defenseCatalog.categories.bonus.models?.['low_poly_ww2_fighter_planes.glb'] && js.includes('function loadBossRewardPlane()') && js.includes('function spawnBossRewardPlane('), 'Boss reward aircraft must be catalogued and connected to the reward flyby.');
check(defenseCatalog.categories['planes-dead'].runtimeIntegration === 'runtime-integrated', 'Stage enemy aircraft catalog must match runtime loading.');
for (const filename of ['kamikaze_scout.glb', 'dive_attacker.glb']) {
  check(!!defenseCatalog.categories['planes-dead'].models?.[filename], 'Stage enemy catalog is missing model mapping: ' + filename);
  check(exists('assets/models/planes-dead/' + filename), 'Stage enemy GLB is missing: ' + filename);
  check(js.includes(filename), 'Stage enemy GLB is not referenced by runtime code: ' + filename);
}
check(!js.includes('using procedural aircraft until assets/models/glb/plane_pc.glb is added'), 'Enemy GLB failure warning must not claim an existing asset is missing.');


const wildlife = defenseCatalog.categories.wildlife;
check(wildlife.runtimeIntegration === 'runtime-integrated', 'Wildlife catalog must mark the MechaFish runtime integration complete.');
check(wildlife.models && wildlife.models['MechaFish.glb'] && wildlife.models['MechaFish.glb'].behavior === 'vertical_breach_then_bite', 'Wildlife catalog must describe MechaFish vertical breach and bite behavior.');
const defenseModels = defenseCatalog.categories['assault-defender'].models;
const expectedDefenseModels = {
  'big_ice_turret.glb': ['ice_anti_air_turret', 'snow', 'ice_projectiles'],
  'fire-turet.glb': ['red_flame_chaser', 'general', 'flame_chase'],
  'interceptor_base.glb': ['guided_laser_interceptor', 'general', 'tracking_laser'],
  'iron_wild_turret_-_free.glb': ['precision_missile_turret', 'general', 'one_side_limited_homing_missiles'],
  'lazer_turret.glb': ['alternate_laser_turret', 'general', 'distinct_color_laser'],
  'sand_slugthrow_trt.glb': ['sandstorm_cannon', 'desert', 'sandstorm_projectile'],
  'raval_turet_animated.glb': ['animated_defense_turret', 'general', 'animated_turret_fire'],
  'rocket_launcher_turret.glb': ['rocket_launcher_turret', 'general', 'rocket_projectile'],
};
for (const [filename, [role, biome, attack]] of Object.entries(expectedDefenseModels)) {
  const model = defenseModels[filename];
  check(!!model, 'Defense asset catalog is missing role mapping: ' + filename);
  if (model) {
    check(model.role === role, 'Incorrect defense model role: ' + filename);
    check(model.biomes.includes(biome), 'Incorrect biome restriction for defense model: ' + filename);
    check(model.attack === attack, 'Incorrect attack mapping for defense model: ' + filename);
    const modelPath = path.join(src, 'assets', 'models', 'assault-defender', filename);
    check(fs.existsSync(modelPath), 'Catalogued defense GLB is missing: ' + modelPath);
    if (fs.existsSync(modelPath)) {
      const bytes = fs.readFileSync(modelPath);
      check(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'glTF', 'Defense GLB has invalid/truncated header: ' + filename);
      if (bytes.length >= 12) {
        check(bytes.readUInt32LE(4) === 2, 'Defense GLB must use binary glTF v2: ' + filename);
        check(bytes.readUInt32LE(8) === bytes.length, 'Defense GLB header length mismatch: ' + filename);
      }
    }
  }
}
check(defenseCatalog.categories['assault-defender'].runtimeIntegration === 'runtime-integrated',
  'Defense catalog must match the active defense runtime.');
check(js.includes('function loadDefenseModels()') && js.includes('loadDefenseModels();'), 'Defense GLB loader must be active.');
check(js.includes('function spawnDefenseTurret(x)') && js.includes('nextDefense:900/M_PER_PX'), 'Defense turrets must be scheduled during flight.');
check(js.includes("assets/models/assault-defender/'+def.file") && js.includes('makeDefenseFallback(def)'), 'Defense models must load locally and preserve a fallback.');
check(js.includes("e.defenseAttack==='chase'") && js.includes('turretShot:true') && js.includes('else if(e.turret)'), 'Defense turrets must have active movement, attacks, and damage handling.');
check(js.includes("function currentDefenseBiome(stage){const n=((stage%5)+5)%5;return n===1?'desert':n===3?'snow':n===4?'boss_arena':'general';}") && js.includes("groundTex('#3faea9','#78d4c6'),\n  groundTex('#eaf3fb','#ffffff'),") && js.includes("trees.forEach(t=>{t.visible=index!==1;});") && js.includes("cacti.forEach(c=>{c.visible=index===1;});") && js.includes("biome==='snow'?(DEFENSE_MODELS.find(d=>d.role==='ice')||general[0])") && js.includes("biome==='desert'?(DEFENSE_MODELS.find(d=>d.role==='sand')||general[0])") && js.includes("biome==='boss_arena'?(DEFENSE_MODELS.find(d=>d.role==='final')||DEFENSE_MODELS.find(d=>d.role==='laser2')||general[0])"), 'Defense selection and ground textures must match the visible desert, water, snow, and boss-arena stages, including missing-model fallbacks.');

const rocketCatalog = defenseCatalog.categories['rocket-attack'];
check(rocketCatalog && rocketCatalog.runtimeIntegration === 'runtime-integrated', 'Rocket attack catalog must match the active runtime loader.');
check(!!rocketCatalog?.models?.['air_interceptor_missile.glb'], 'Custom air-interceptor rocket must be catalogued.');
check(exists('assets/models/rocket-attack/air_interceptor_missile.glb'), 'Custom air-interceptor rocket GLB is missing.');
check(js.includes('function loadRocketAttackModel()') && js.includes('assets/models/rocket-attack/air_interceptor_missile.glb') && js.includes('rocketAttackTemplate.clone(true)'), 'Custom rocket GLB must load and be cloned into gameplay.');
check(js.includes("'missile-launch':'assets/audio/sfx/missile-launch.ogg'"), 'Uploaded missile-launch sound must be mapped in SFX_URLS.');
check(exists('assets/audio/sfx/missile-launch.ogg'), 'Uploaded missile-launch audio file is missing.');
check(js.includes("playSfx('missile-launch')"), 'Player missile launch must play the mapped sound.');
if (failures.length) {
  console.error('Game integrity checks FAILED:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log('Game integrity checks passed: JavaScript syntax, DOM IDs, local assets, CSS structure, aircraft/boss models, environment/reward/stage-enemy integration, defense integration, and local Android preparation.');
