(function(){
'use strict';
const $=id=>document.getElementById(id);
function fail(msg){document.getElementById('app').innerHTML='<p style="padding:28px;font:800 20px Cairo,sans-serif;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.4)">'+msg+'</p>';}
if(typeof THREE==='undefined'){fail('تعذّر تحميل محرك الثلاثي الأبعاد. تحقق من الاتصال ثم أعد التحميل.');return;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const MAXLV=6, M_PER_PX=1/40, S=0.1, YOFF=2.6;
const BIOME_BASE_METERS=1800,BIOME_GROWTH_METERS=220,BIOME_GROWTH_CAP=1100,BOSS_BUFFER_METERS=300;
function biomeLengthMeters(stage){return BIOME_BASE_METERS+Math.min(Math.max(0,stage)*BIOME_GROWTH_METERS,BIOME_GROWTH_CAP);}
function biomeStartMeters(stage){let total=0;for(let i=0;i<stage;i++)total+=biomeLengthMeters(i);return total;}
function bossDistanceMeters(stage){return biomeStartMeters(stage)+biomeLengthMeters(stage)-BOSS_BUFFER_METERS;}
function biomeStageAtMeters(m){let stage=0,edge=biomeLengthMeters(0);while(m>=edge&&stage<500){stage++;edge+=biomeLengthMeters(stage);}return stage;}
const Y=alt=>alt*S+YOFF;
const H=(n,k)=>{const s=Math.sin(n*12.9898+k*78.233)*43758.5453;return s-Math.floor(s);};

/* ---------- save ---------- */
const KEY='sling_wing_v1';
const LEGACY_KEY='sling_wing_epic_v1';
const DEFAULT_SAVE={coins:200,fuel:1,best:0,model:'trainer',lv:{sling:0,plane:0,coin:0},bosses:0,intro:false,cinematicSeen:false,campaignEndingSeen:false,mute:false,top:[]};
let save=Object.assign({},DEFAULT_SAVE,{lv:Object.assign({},DEFAULT_SAVE.lv)});
let legacyProgress=null;
try{
  const current=JSON.parse(localStorage.getItem(KEY)||'null');
  legacyProgress=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
  if(current&&typeof current==='object'){
    save=Object.assign(save,current);
    save.lv=Object.assign({},DEFAULT_SAVE.lv,current.lv||{});
  }
  if(legacyProgress&&typeof legacyProgress==='object'){
    save.coins=Math.max(Number(save.coins)||0,Number(legacyProgress.coins)||0);
    save.fuel=Math.max(Number(save.fuel)||0,Number(legacyProgress.fuel)||0);
    save.best=Math.max(Number(save.best)||0,Number(legacyProgress.best)||0);
    const oldLv=legacyProgress.lv||{};
    save.lv=Object.assign({},save.lv);
    ['sling','plane','coin','armor','cannon','missile'].forEach(k=>{
      save.lv[k]=Math.max(Number(save.lv[k])||0,Number(oldLv[k])||0);
    });
    save.bosses=Math.max(Number(save.bosses)||0,Number(legacyProgress.bosses)||0);
    save.intro=!!(save.intro||legacyProgress.intro);
    if(!current||typeof current.mute!=='boolean')save.mute=!!legacyProgress.mute;
    if(!Array.isArray(save.top)||!save.top.length)save.top=Array.isArray(legacyProgress.top)?legacyProgress.top:[];
    // Keep the old key untouched; write a merged copy under the current key.
    localStorage.setItem(KEY,JSON.stringify(save));
  }
  save.lv=Object.assign({sling:0,plane:0,coin:0},save.lv||{});
  save.model=typeof save.model==='string'?save.model:'trainer';
  save.coins=Math.max(0,Number(save.coins)||0);
  save.fuel=Math.max(0,Number(save.fuel)||0);
  save.best=Math.max(0,Number(save.best)||0);
  save.bosses=Math.max(0,Number(save.bosses)||0);
  save.top=Array.isArray(save.top)?save.top:[];
}catch(e){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(save));}catch(e){}}
const cost=l=>Math.round(90*Math.pow(1.7,l));
const DAILY_MISSIONS=[
  {id:'distance',metric:'distance',title:'رحلة بعيدة',description:'تجاوز 1000 متر في رحلة واحدة',target:1000,unit:'م',reward:80},
  {id:'coins',metric:'picked',title:'جامع العملات',description:'اجمع 3 عملات ذهبية في رحلة واحدة',target:3,unit:'عملات',reward:60},
  {id:'gates',metric:'gates',title:'خبير البوابات',description:'اجتز 3 بوابات في رحلة واحدة',target:3,unit:'بوابة',reward:100}
];
function dailyDateKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function ensureDaily(){
  const date=dailyDateKey();
  if(!save.daily||save.daily.date!==date){
    save.daily={date,distance:0,picked:0,gates:0,claimed:{distance:false,coins:false,gates:false}};
    persist();
    return;
  }
  const legacyCoinMetric=!Number.isFinite(save.daily.picked);
  save.daily.claimed=Object.assign({distance:false,coins:false,gates:false},save.daily.claimed&&typeof save.daily.claimed==='object'?save.daily.claimed:{});
  ['distance','picked','gates'].forEach(k=>{if(!Number.isFinite(save.daily[k])||save.daily[k]<0)save.daily[k]=0;});
  DAILY_MISSIONS.forEach(m=>{save.daily.claimed[m.id]=save.daily.claimed[m.id]===true;});
  if(legacyCoinMetric){save.daily.claimed.coins=false;persist();}
}
function updateDailyMissions(distance){
  ensureDaily();
  const daily=save.daily;
  daily.distance=Math.max(daily.distance,distance);
  daily.picked=Math.max(daily.picked,run.picked);
  daily.gates=Math.max(daily.gates,run.gates);
  let reward=0;
  const completed=[];
  DAILY_MISSIONS.forEach(m=>{
    if(daily[m.metric]>=m.target&&!daily.claimed[m.id]){
      daily.claimed[m.id]=true;
      reward+=m.reward;
      completed.push(m);
    }
  });
  return {reward,completed};
}

/* ---------- audio ---------- */
let AC;
function beep(f,d,type,v){
  if(save.mute)return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type||'sine';o.frequency.value=f;g.gain.value=v||0.05;
    o.connect(g);g.connect(AC.destination);o.start();
    g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+(d||0.08));
    o.stop(AC.currentTime+(d||0.08));
  }catch(e){}
}

/* ---------- real audio assets ---------- */
const MUSIC_URLS={
  menu:'assets/audio/music/menu-theme.ogg',
  flight:'assets/audio/music/flight-theme.ogg',
  boss:'assets/audio/music/boss-battle.ogg',
  finale:'assets/audio/music/finale-theme.ogg'
};
// Some legacy SFX filenames contain invisible U+200C characters; preserve their exact Git paths.
const SFX_URLS={
  'ui-confirm':'assets/audio/sfx/\u200cui-confirm.ogg',
  launch:'assets/audio/sfx/\u200claunch.ogg',
  'engine-loop':'assets/audio/sfx/\u200cengine-loop.ogg',
  'weapon-fire':'assets/audio/sfx/\u200c\u200cweapon-fire.ogg',
  'missile-launch':'assets/audio/sfx/\u200cmissile-launch.ogg',
  'missile-impact':'assets/audio/sfx/\u200cmissile-impact.ogg',
  'boss-warning':'assets/audio/sfx/\u200cboss-warning.ogg',
  'boss-hit':'assets/audio/sfx/\u200cboss-hit.ogg',
  'boss-defeat':'assets/audio/sfx/\u200cexplosion.ogg',
  'fuel-pickup':'assets/audio/sfx/\u200cfuel-pickup.ogg',
  shield:'assets/audio/sfx/\u200cshield.ogg',
  explosion:'assets/audio/sfx/\u200cexplosion.ogg',
  'victory-stinger':'assets/audio/sfx/\u200cvictory-stinger.ogg',
  coin:'assets/audio/music/coin-collect.ogg',
  laser:'assets/audio/music/laser.ogg'
};
const sfxPools=Object.create(null),sfxCursor=Object.create(null),sfxLastPlayed=Object.create(null);
const SFX_THROTTLE={'weapon-fire':0.065,'boss-hit':0.12,laser:0.08,coin:0.045};
let audioUnlocked=false,currentMusicKey='',musicAudio=null,engineAudio=null;
try{
  if(typeof Audio!=='undefined'){
    musicAudio=new Audio();musicAudio.loop=true;musicAudio.preload='auto';musicAudio.volume=0.34;
    engineAudio=new Audio(SFX_URLS['engine-loop']);engineAudio.loop=true;engineAudio.preload='auto';engineAudio.volume=0.28;
  }
}catch(_){}
function playSfx(key,volume){
  if(save.mute||!audioUnlocked||typeof Audio==='undefined')return;
  const url=SFX_URLS[key];if(!url)return;
  const now=performance.now(),wait=SFX_THROTTLE[key]||0;
  if(now-(sfxLastPlayed[key]||0)<wait)return;
  sfxLastPlayed[key]=now;
  try{
    let pool=sfxPools[key];
    if(!pool){pool=sfxPools[key]=[new Audio(url),new Audio(url),new Audio(url)];pool.forEach(a=>{a.preload='auto';a.volume=volume===undefined?0.78:volume;});}
    const index=sfxCursor[key]||0,a=pool[index%pool.length];sfxCursor[key]=index+1;
    a.pause();a.currentTime=0;a.volume=volume===undefined?0.78:volume;
    const promise=a.play();if(promise&&promise.catch)promise.catch(()=>{});
  }catch(_){}
}
function syncAudioState(){
  if(typeof Audio==='undefined')return;
  const finalReveal=state==='flight'&&paused&&run&&run.bosses>=5&&!save.campaignEndingSeen;
  let desired='menu';
  if(state==='flight')desired=finalReveal?'finale':(run&&run.bossBattle?'boss':'flight');
  else if(state==='result'&&run&&run.bosses>=5)desired='finale';
  const shouldPlayMusic=audioUnlocked&&!save.mute&&(!paused||finalReveal);
  if(musicAudio){
    const url=MUSIC_URLS[desired];
    if(url&&currentMusicKey!==desired){
      musicAudio.pause();musicAudio.src=url;musicAudio.currentTime=0;currentMusicKey=desired;
    }
    if(shouldPlayMusic&&url&&musicAudio.paused){const p=musicAudio.play();if(p&&p.catch)p.catch(()=>{});}
    else if(!shouldPlayMusic&&!musicAudio.paused)musicAudio.pause();
  }
  const engineOn=audioUnlocked&&!save.mute&&state==='flight'&&!paused&&P&&P.fuel>0&&!P.engineOut;
  if(engineAudio){
    if(engineOn&&engineAudio.paused){const p=engineAudio.play();if(p&&p.catch)p.catch(()=>{});}
    else if(!engineOn&&!engineAudio.paused)engineAudio.pause();
  }
}
function unlockAudio(){
  if(audioUnlocked)return;
  audioUnlocked=true;
  if(AC&&AC.state==='suspended'&&AC.resume)AC.resume().catch(()=>{});
  syncAudioState();
}
if(typeof document!=='undefined'){
  document.addEventListener('pointerdown',unlockAudio,{once:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{once:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(musicAudio)musicAudio.pause();if(engineAudio)engineAudio.pause();}else syncAudioState();});
}

/* ---------- three.js setup ---------- */
const cv=$('c'),app=$('app'),fx=$('fx');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});}
catch(e){fail('جهازك أو متصفحك لا يدعم WebGL المطلوب للعبة ثلاثية الأبعاد.');return;}
renderer.setClearColor(0x000000,0);
const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0xd9f4ff,180,3600);
const camera=new THREE.PerspectiveCamera(62,1,0.5,4200);
const hemi=new THREE.HemisphereLight(0xffffff,0x6a8f4a,0.95);scene.add(hemi);
const sunL=new THREE.DirectionalLight(0xffffff,0.8);sunL.position.set(-60,120,40);scene.add(sunL);
let W=400,Hh=800,baseFov=62;
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  W=app.clientWidth;Hh=app.clientHeight;
  renderer.setPixelRatio(dpr);renderer.setSize(W,Hh,false);
  camera.aspect=W/Hh;baseFov=camera.aspect<0.8?74:62;camera.fov=baseFov;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();

/* ---------- materials ---------- */
const mat=(c,o)=>new THREE.MeshLambertMaterial(Object.assign({color:c,flatShading:true},o||{}));
const matS=(c,r,o)=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:r===undefined?0.6:r,metalness:0.05,flatShading:true},o||{}));

/* ground */
function groundTex(base,patch){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  g.fillStyle=base||'#5fbf4a';g.fillRect(0,0,64,64);
  g.fillStyle=patch||'#6ccf55';g.fillRect(0,0,32,64);
  for(let i=0;i<50;i++){g.fillStyle='rgba(30,35,28,.11)';g.fillRect(Math.random()*64,Math.random()*64,3,3);}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(180,80);t.anisotropy=4;return t;
}
const groundMaps=[
  groundTex('#5fbf4a','#6ccf55'),
  groundTex('#d7b36f','#e8cb8d'),
  groundTex('#eaf3fb','#ffffff'),
  groundTex('#3faea9','#78d4c6'),
  groundTex('#655956','#88756b')
];
const ground=new THREE.Mesh(new THREE.PlaneGeometry(6000,2560),new THREE.MeshLambertMaterial({map:groundMaps[0]}));
ground.rotation.x=-Math.PI/2;scene.add(ground);

/* mountains */
const mtGeo=new THREE.ConeGeometry(1,1,5),mtMat=mat(0x5b9a7a);
const MT_N=36,MT_SP=70,mts=[];
for(let i=0;i<MT_N;i++){const m=new THREE.Mesh(mtGeo,mtMat);scene.add(m);mts.push(m);}
/* trees */
const trunkGeo=new THREE.CylinderGeometry(0.5,0.65,3,6),leafGeo1=new THREE.ConeGeometry(2.6,6,7),leafGeo2=new THREE.ConeGeometry(1.9,4.6,7);
const trunkMat=mat(0x7a4a22),leafMat=mat(0x2f9a4a);
const TR_N=60,TR_SP=20,trees=[];
for(let i=0;i<TR_N;i++){
  const g=new THREE.Group();
  const a=new THREE.Mesh(trunkGeo,trunkMat);a.position.y=1.5;
  const b=new THREE.Mesh(leafGeo1,leafMat);b.position.y=5.5;
  const c=new THREE.Mesh(leafGeo2,leafMat);c.position.y=8.6;
  g.add(a,b,c);scene.add(g);trees.push(g);
}
/* Desert props: compact reusable cacti, enabled only in the desert biome. */
const cactusMat=mat(0x2e8765),cactusDarkMat=mat(0x206548);
const cactusStemGeo=new THREE.CylinderGeometry(0.8,1,7,7);
const cactusArmGeo=new THREE.CylinderGeometry(0.42,0.5,3.2,7);
const CACTUS_N=30,cacti=[];
for(let i=0;i<CACTUS_N;i++){
  const g=new THREE.Group();
  const stem=new THREE.Mesh(cactusStemGeo,cactusMat);stem.position.y=3.5;g.add(stem);
  const armA=new THREE.Mesh(cactusArmGeo,cactusDarkMat);armA.position.set(-1.05,3.4,0);armA.rotation.z=-0.72;g.add(armA);
  const armB=new THREE.Mesh(cactusArmGeo,cactusMat);armB.position.set(1.05,4.2,0);armB.rotation.z=0.72;g.add(armB);
  const tipA=new THREE.Mesh(new THREE.SphereGeometry(0.48,7,6),cactusMat);tipA.position.set(-2.15,4.5,0);g.add(tipA);
  const tipB=new THREE.Mesh(new THREE.SphereGeometry(0.48,7,6),cactusMat);tipB.position.set(2.15,5.3,0);g.add(tipB);
  g.visible=false;scene.add(g);cacti.push(g);
}
/* clouds */
const cloudMat=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true,transparent:true,opacity:0.92});
const cloudGeo=new THREE.SphereGeometry(1,8,6);
const CL_N=26,CL_SP=50,clouds=[];
for(let i=0;i<CL_N;i++){
  const g=new THREE.Group();
  [[0,0,0,1],[-1.1,-0.2,0.2,0.75],[1.2,-0.15,-0.1,0.8],[0.2,0.5,0,0.7]].forEach(p=>{
    const m=new THREE.Mesh(cloudGeo,cloudMat);m.position.set(p[0],p[1],p[2]);m.scale.set(p[3]*1.3,p[3]*0.7,p[3]);g.add(m);
  });
  scene.add(g);clouds.push(g);
}
/* signs */
const SG_N=5,SG_SP=200,signs=[];
for(let i=0;i<SG_N;i++){
  const cvs=document.createElement('canvas');cvs.width=160;cvs.height=80;
  const tex=new THREE.CanvasTexture(cvs);
  const board=new THREE.Mesh(new THREE.PlaneGeometry(8,4),new THREE.MeshBasicMaterial({map:tex}));
  board.rotation.y=-Math.PI/2;board.position.set(0,7,0);
  const post=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,6,6),mat(0x8a4b1e));post.position.y=3;
  const g=new THREE.Group();g.add(post,board);scene.add(g);
  signs.push({g,cvs,tex,label:''});
}
function setSign(s,label){
  if(s.label===label)return;s.label=label;
  const c=s.cvs.getContext('2d');
  c.fillStyle='#fff1d6';c.fillRect(0,0,160,80);
  c.strokeStyle='#8a4b1e';c.lineWidth=8;c.strokeRect(4,4,152,72);
  c.fillStyle='#3b2314';c.font='800 44px Cairo,sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.fillText(label,80,42);s.tex.needsUpdate=true;
}
/* Scenic flight route: a curved ground road leads to an illuminated arrival gate. */
const routeGroup=new THREE.Group();scene.add(routeGroup);
const roadMat=new THREE.MeshLambertMaterial({color:0x394451,side:THREE.DoubleSide});
const routeLineMat=new THREE.MeshBasicMaterial({color:0xffd84a});
const routeEdgeMat=new THREE.MeshBasicMaterial({color:0x8cf5ff});
const routeSegments=[];
for(let i=0;i<42;i++){
  const g=new THREE.Group();
  const road=new THREE.Mesh(new THREE.PlaneGeometry(54,18),roadMat);road.rotation.x=-Math.PI/2;road.position.y=0.06;g.add(road);
  const dash=new THREE.Mesh(new THREE.BoxGeometry(26,0.12,0.6),routeLineMat);dash.position.set(0,0.14,0);g.add(dash);
  [-8.35,8.35].forEach(z=>{const edge=new THREE.Mesh(new THREE.BoxGeometry(54,0.1,0.28),routeEdgeMat);edge.position.set(0,0.13,z);g.add(edge);});
  routeGroup.add(g);routeSegments.push(g);
}
const destination=new THREE.Group();scene.add(destination);
const runwayMat=new THREE.MeshLambertMaterial({color:0x59636f,side:THREE.DoubleSide});
const runway=new THREE.Mesh(new THREE.PlaneGeometry(220,100),runwayMat);runway.rotation.x=-Math.PI/2;runway.position.y=0.08;destination.add(runway);
const runwayLineMat=new THREE.MeshBasicMaterial({color:0xffffff});
for(let i=-2;i<=2;i++){const mark=new THREE.Mesh(new THREE.BoxGeometry(8,0.1,3),runwayLineMat);mark.position.set(i*24,0.15,0);destination.add(mark);}
const gateMat=new THREE.MeshStandardMaterial({color:0x23d8e7,emissive:0x07515a,roughness:0.35});
const gatePostA=new THREE.Mesh(new THREE.BoxGeometry(4,32,4),gateMat);gatePostA.position.set(0,16,-42);destination.add(gatePostA);
const gatePostB=new THREE.Mesh(new THREE.BoxGeometry(4,32,4),gateMat);gatePostB.position.set(0,16,42);destination.add(gatePostB);
const gateTop=new THREE.Mesh(new THREE.BoxGeometry(4,4,88),new THREE.MeshStandardMaterial({color:0xffc83d,emissive:0x614000,roughness:0.35}));gateTop.position.set(0,32,0);destination.add(gateTop);
const destinationCanvas=document.createElement('canvas');destinationCanvas.width=320;destinationCanvas.height=96;
const destinationCtx=destinationCanvas.getContext('2d');
destinationCtx.fillStyle='#123a52';destinationCtx.fillRect(0,0,320,96);
destinationCtx.strokeStyle='#ffda63';destinationCtx.lineWidth=8;destinationCtx.strokeRect(4,4,312,88);
destinationCtx.fillStyle='#ffffff';destinationCtx.font='800 42px Cairo,sans-serif';destinationCtx.textAlign='center';destinationCtx.textBaseline='middle';destinationCtx.fillText('وصول  ✈',160,49);
const destinationTexture=new THREE.CanvasTexture(destinationCanvas);
const destinationBoard=new THREE.Mesh(new THREE.PlaneGeometry(32,9.6),new THREE.MeshBasicMaterial({map:destinationTexture,side:THREE.DoubleSide}));
destinationBoard.rotation.y=-Math.PI/2;destinationBoard.position.set(-3,25,0);destination.add(destinationBoard);
function routeCurve(x){return Math.sin(x*0.0011)*18+Math.sin(x*0.0027)*6;}
/* dock + slingshot */
const dock=new THREE.Mesh(new THREE.BoxGeometry(34,0.8,18),mat(0xb9773e));dock.position.set(0,0.4,0);scene.add(dock);
const dockEdge=new THREE.Mesh(new THREE.BoxGeometry(34.4,0.5,18.4),mat(0x8a4b1e));dockEdge.position.set(0,0.1,0);scene.add(dockEdge);
const _Yv=new THREE.Vector3(0,1,0),_d=new THREE.Vector3();
function setCyl(m,a,b){_d.subVectors(b,a);const len=_d.length();m.position.copy(a).addScaledVector(_d,0.5);m.scale.set(1,len,1);m.quaternion.setFromUnitVectors(_Yv,_d.normalize());}
const cylGeo=new THREE.CylinderGeometry(1,1,1,8);
function cyl(a,b,r,m){const me=new THREE.Mesh(cylGeo.clone(),m);me.geometry.scale(r,1,r);setCyl(me,a,b);scene.add(me);return me;}
const woodM=mat(0x8a4b1e);
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const forkL=V(0,9.8,-1.9),forkR=V(0,9.6,1.9);
cyl(V(0,0.8,0),V(0,5.8,0),0.7,woodM);
cyl(V(0,5.8,0),forkL,0.55,woodM);
cyl(V(0,5.8,0),forkR,0.55,woodM);
const bandM=new THREE.MeshBasicMaterial({color:0xe5483a});
const bandL=new THREE.Mesh(cylGeo.clone(),bandM),bandR=new THREE.Mesh(cylGeo.clone(),bandM);
bandL.geometry.scale(0.22,1,0.22);bandR.geometry.scale(0.22,1,0.22);scene.add(bandL,bandR);
/* stars, sun */
const starGeo=new THREE.BufferGeometry();
{const pos=new Float32Array(300*3);for(let i=0;i<300;i++){const th=Math.random()*Math.PI*2,ph=Math.random()*1.3+0.1,r=1200;pos[i*3]=Math.cos(th)*Math.sin(ph)*r;pos[i*3+1]=Math.cos(ph)*r*0.8;pos[i*3+2]=Math.sin(th)*Math.sin(ph)*r;}
starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));}
const starMat=new THREE.PointsMaterial({color:0xffffff,size:3,sizeAttenuation:false,transparent:true,opacity:0,fog:false,depthWrite:false});
const stars=new THREE.Points(starGeo,starMat);stars.frustumCulled=false;scene.add(stars);
const sunMat=new THREE.MeshBasicMaterial({color:0xfff4b8,fog:false});
const sun=new THREE.Mesh(new THREE.SphereGeometry(70,18,12),sunMat);scene.add(sun);
/* shadow */
const shadowMat=new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3,depthWrite:false});
const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,20),shadowMat);shadow.rotation.x=-Math.PI/2;scene.add(shadow);

/* ---------- plane model ---------- */
const PAL=[[0x8bd13a,0x5a9a1c],[0x4aa8ff,0x2476c9],[0xffc83d,0xd18a00],[0xb46bff,0x7a35c9],[0xff6a4a,0xc2381f],[0xf4f4f4,0x2b2b36]];
const AIRCRAFT={
 trainer:{name:'الصقر التدريبي',short:'الصقر',unlock:0,shield:9.5,shot:0.24,boost:1,speed:1,fuelUse:1,upgrade:'خزان وقود موسّع'},
 interceptor:{name:'المعترض السريع',short:'المعترض',unlock:500,shield:9,shot:0.17,boost:1,speed:1.12,fuelUse:1.08,upgrade:'خزان وقود للرحلات الطويلة'},
 phantom:{name:'الشبح النفاث',short:'الشبح',unlock:3000,shield:8.4,shot:0.2,boost:1.35,speed:1.08,fuelUse:1.12,upgrade:'قدرة إمداد الوقود +38٪'},
 guardian:{name:'الحارس المدرع',short:'الحارس',unlock:4000,shield:14.5,shot:0.115,boost:1.2,speed:1.15,fuelUse:0.9,upgrade:'مدفع ثقيل ودرع قتالي للزعيم الأخير'},
};
// Migrate saves from the temporary WWI selectable-aircraft entry back to the original first aircraft.
if(!AIRCRAFT[save.model]){save.model='trainer';persist();}
function aircraft(){return AIRCRAFT[save.model]||AIRCRAFT.trainer;}
const bodyMat=matS(0x8bd13a,0.5),accMat=matS(0x5a9a1c,0.6);
const planeG=new THREE.Group();planeG.rotation.order='ZYX';
(function buildPlane(){
  const fus=new THREE.Mesh(new THREE.SphereGeometry(1,20,14),bodyMat);fus.scale.set(4.8,1.8,1.8);planeG.add(fus);
  const belly=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),matS(0xffffff,0.6));belly.scale.set(3.6,0.5,1.6);belly.position.set(-0.3,-0.9,0);planeG.add(belly);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(3.6,0.35,14),accMat);wing.position.set(0.2,-0.3,0);planeG.add(wing);
  [-7,7].forEach(z=>{const t=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.18,3.6,10),accMat);t.rotation.x=Math.PI/2;t.rotation.z=Math.PI/2;t.position.set(0.2,-0.3,z);
    const tip=new THREE.Mesh(new THREE.CylinderGeometry(1.8,1.8,0.35,16),accMat);tip.position.set(0.2,-0.3,z);planeG.add(tip);});
  const fin=new THREE.Mesh(new THREE.BoxGeometry(2.8,3.2,0.35),accMat);fin.position.set(-4.2,1.9,0);fin.rotation.z=0.35;planeG.add(fin);
  const stab=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.25,5.6),accMat);stab.position.set(-4.3,0.3,0);planeG.add(stab);
  const glass=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),matS(0xbfefff,0.1,{transparent:true,opacity:0.85}));glass.scale.set(1.9,1.2,1.2);glass.position.set(1,1.2,0);planeG.add(glass);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(0.75,12,10),matS(0xd9d9d9,0.3));nose.position.set(4.7,0,0);planeG.add(nose);
  const wheelM=matS(0x222222,0.9);
  [-1.7,1.7].forEach(z=>{
    const strut=new THREE.Mesh(new THREE.BoxGeometry(0.25,1.8,0.25),matS(0x444444));strut.position.set(1.2,-1.8,z*0.8);planeG.add(strut);
    const w=new THREE.Mesh(new THREE.CylinderGeometry(0.75,0.75,0.5,12),wheelM);w.rotation.x=Math.PI/2;w.position.set(1.2,-2.6+0.75,z);planeG.add(w);
  });
  const tw=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6),wheelM);tw.position.set(-4.2,-0.6,0);planeG.add(tw);
})();
const prop=new THREE.Group();prop.position.set(5.2,0,0);
prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.2,6.4,0.5),matS(0x2b2b2b,0.5)));
planeG.add(prop);
const flame=new THREE.Mesh(new THREE.ConeGeometry(1.1,5,8),new THREE.MeshBasicMaterial({color:0xffa83d}));
flame.rotation.z=Math.PI/2;flame.position.set(-7.5,0,0);flame.visible=false;planeG.add(flame);
const planeCoreChildren=planeG.children.slice();
scene.add(planeG);
/* Distinct silhouette kits make every unlocked aircraft visually recognizable. */
const variantKits={};
function addKit(name,color,parts){
  const g=new THREE.Group();
  const m=matS(color,0.38,{metalness:0.24});
  parts.forEach(p=>{const mesh=new THREE.Mesh(p.geo,m);mesh.position.set(...p.pos);if(p.rot)mesh.rotation.set(...p.rot);if(p.scale)mesh.scale.set(...p.scale);g.add(mesh);});
  g.visible=false;planeG.add(g);variantKits[name]=g;
}
addKit('interceptor',0x4aa8ff,[
 {geo:new THREE.BoxGeometry(5,0.32,18),pos:[-0.2,-0.35,0],rot:[0,0.08,0]},
 {geo:new THREE.CylinderGeometry(0.72,0.58,5.4,10),pos:[-1.6,-0.8,-3.7],rot:[0,0,Math.PI/2]},
 {geo:new THREE.CylinderGeometry(0.72,0.58,5.4,10),pos:[-1.6,-0.8,3.7],rot:[0,0,Math.PI/2]}
]);
addKit('guardian',0xffc83d,[
 {geo:new THREE.BoxGeometry(7.2,1.1,3.8),pos:[-0.5,-0.55,-2.8]},
 {geo:new THREE.BoxGeometry(7.2,1.1,3.8),pos:[-0.5,-0.55,2.8]},
 {geo:new THREE.BoxGeometry(3.2,0.5,18),pos:[-0.6,-0.1,0]}
]);
addKit('phantom',0xb46bff,[
 {geo:new THREE.BoxGeometry(6,0.3,19),pos:[-0.5,-0.25,0],rot:[0,0,-0.12]},
 {geo:new THREE.BoxGeometry(4,0.6,2.4),pos:[-4.2,0.1,-2.1]},
 {geo:new THREE.BoxGeometry(4,0.6,2.4),pos:[-4.2,0.1,2.1]}
]);
const shieldMesh=new THREE.Mesh(new THREE.SphereGeometry(9,18,12),new THREE.MeshBasicMaterial({color:0x7ff5ff,wireframe:true,transparent:true,opacity:0.68,depthWrite:false}));
shieldMesh.scale.set(1.15,0.62,0.9);shieldMesh.visible=false;planeG.add(shieldMesh);
const aircraftModelHolder=new THREE.Group();aircraftModelHolder.visible=false;planeG.add(aircraftModelHolder);
const aircraftModelTemplates=Object.create(null);
let aircraftModelLoadStarted=false;
let shieldT=0,shieldCooldown=0,appliedLv=-1,appliedModel='';
function applyPlaneColors(){
  const model=save.model in AIRCRAFT?save.model:'trainer';
  const colorIndex={trainer:0,interceptor:1,phantom:2,guardian:3}[model];
  const l=Math.min(colorIndex+Math.floor(save.lv.plane/3),PAL.length-1);
  if(l!==appliedLv){appliedLv=l;bodyMat.color.setHex(PAL[l][0]);accMat.color.setHex(PAL[l][1]);}
  const customModel=(model==='trainer'||model==='phantom'||model==='guardian')&&!!aircraftModelTemplates[model];
  if(customModel&&aircraftModelHolder.userData.modelKey!==model){
    aircraftModelHolder.clear();
    aircraftModelHolder.add(aircraftModelTemplates[model].clone(true));
    aircraftModelHolder.userData.modelKey=model;
  }
  aircraftModelHolder.visible=customModel;
  planeCoreChildren.forEach(child=>{if(child!==flame)child.visible=!customModel;});
  prop.visible=!customModel;
  Object.keys(variantKits).forEach(k=>{variantKits[k].visible=!customModel&&k===model;});
  if(model!==appliedModel)appliedModel=model;
}

const bossImageLoader=new THREE.TextureLoader(),bossImageTextures=Object.create(null),bossSpriteMaterials=Object.create(null);
let ironEagleModelTemplate=null,ironEagleModelLoadStarted=false;
/* ---------- objects ---------- */
const objGroup=new THREE.Group();scene.add(objGroup);
const coinGeo=new THREE.CylinderGeometry(1.5,1.5,0.35,18);coinGeo.rotateZ(Math.PI/2);
const coinMat=matS(0xffc83d,0.3,{emissive:0x6b4a00});
const ringGeo=new THREE.TorusGeometry(8,0.7,8,28);ringGeo.rotateY(Math.PI/2);
const ringMat=new THREE.MeshBasicMaterial({color:0xffd84a});
const canMat=matS(0xe5483a,0.5),capMat=matS(0x9c2a20,0.5);
const birdBody=matS(0x7a3d2a,0.8),birdWing=matS(0x9a523a,0.8),beakM=matS(0xffb23d,0.6);
const draftMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false});
const draftRingMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.6,depthWrite:false});
const sphG=new THREE.SphereGeometry(1,12,8);
function makeBird(){
  const g=new THREE.Group();
  const b=new THREE.Mesh(sphG,birdBody);b.scale.set(2.2,1.2,1.2);g.add(b);
  const h=new THREE.Mesh(sphG,birdBody);h.scale.set(0.9,0.9,0.9);h.position.set(-2.3,0.5,0);g.add(h);
  const k=new THREE.Mesh(new THREE.ConeGeometry(0.4,1.3,6),beakM);k.rotation.z=Math.PI/2;k.position.set(-3.5,0.4,0);g.add(k);
  [[-0.4,1],[ -0.4,-1]].forEach(([x,s])=>{
    const p=new THREE.Group();p.position.set(0,0.3,s*0.9);
    const w=new THREE.Mesh(new THREE.BoxGeometry(2,0.14,4),birdWing);w.position.z=s*2;p.add(w);g.add(p);
  });
  g.scale.setScalar(1.35);g.userData.wings=[g.children[3],g.children[4]];
  return g;
}
const BOSS_PROFILES=[{name:'النسر الحديدي',hull:0x27333c,armor:0x71818b,glow:0xffc857,glass:0xffedb2,emissive:0x9b5d12},{name:'قاذفة العاصفة',hull:0x252b43,armor:0x596b91,glow:0x78d9ff,glass:0xc9f6ff,emissive:0x245c9b},{name:'أفعى التيارات',hull:0x3c283f,armor:0x87527f,glow:0xff75c8,glass:0xffd1f0,emissive:0x7c245f},{name:'حارس السحاب',hull:0x263c50,armor:0x6f9bb8,glow:0x8feaff,glass:0xe1fbff,emissive:0x286da0},{name:'الحاكم الرمادي · سيد العاصفة',hull:0x292d35,armor:0x666b73,glow:0xff4f66,glass:0xffd6c7,emissive:0x81283b}];
function makeStormBomberBoss(){
  // Boss B: broad, orange Rebel-Flagship-inspired bomber with cyan energy markings.
  // Keep this model isolated so the other four boss silhouettes remain unchanged.
  const g=new THREE.Group();
  const hull=matS(0xf28b18,0.18,{metalness:0.58,roughness:0.3});
  const armor=matS(0xffa72b,0.16,{metalness:0.52,roughness:0.32});
  const panel=matS(0xd96d0b,0.18,{metalness:0.62,roughness:0.3});
  const dark=matS(0x303640,0.12,{metalness:0.78,roughness:0.28});
  const cyan=new THREE.MeshBasicMaterial({color:0x53efff});
  const cyanGlow=new THREE.MeshStandardMaterial({color:0x7beeff,emissive:0x159db8,emissiveIntensity:1.35,metalness:0.3,roughness:0.22});
  const cockpitMat=new THREE.MeshStandardMaterial({color:0x303c4b,emissive:0x142d42,emissiveIntensity:0.55,metalness:0.72,roughness:0.22});

  // Heavy central fuselage and long tapered prow.
  const fuselage=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),hull);
  fuselage.scale.set(5.2,1.08,2.15);fuselage.position.set(0.25,0,0);g.add(fuselage);
  const prow=new THREE.Mesh(new THREE.ConeGeometry(2.35,7.6,8),armor);
  prow.rotation.z=-Math.PI/2;prow.position.set(4.25,0.02,0);g.add(prow);
  const noseArmor=new THREE.Mesh(new THREE.BoxGeometry(2.1,0.18,2.45),panel);
  noseArmor.position.set(3.15,0.93,0);g.add(noseArmor);

  // Wide, nearly symmetric swept wings and reinforced outer wing tips.
  const mainWing=new THREE.Mesh(new THREE.BoxGeometry(5.6,0.38,18.4),armor);
  mainWing.position.set(-0.65,-0.08,0);g.add(mainWing);
  [-1,1].forEach(side=>{
    const outer=new THREE.Mesh(new THREE.BoxGeometry(3.8,0.32,4.3),hull);
    outer.position.set(-1.35,0.02,side*8.25);outer.rotation.y=side*0.22;g.add(outer);
    const edge=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.28,1.35),panel);
    edge.position.set(-2.2,0.02,side*9.05);edge.rotation.y=side*0.22;g.add(edge);
    const wingPlate=new THREE.Mesh(new THREE.BoxGeometry(3.55,0.13,3.9),panel);
    wingPlate.position.set(-0.35,0.24,side*5.85);wingPlate.rotation.y=side*0.1;g.add(wingPlate);
    const wingStripe=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.075,5.6),cyan);
    wingStripe.position.set(1.12,0.255,side*5.65);g.add(wingStripe);
    const wingInnerStripe=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.07,2.3),cyanGlow);
    wingInnerStripe.position.set(-1.1,0.245,side*2.65);g.add(wingInnerStripe);
  });

  // Broad rear stabilizer gives the silhouette the heavy flagship profile.
  const tailWing=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.3,7.4),hull);
  tailWing.position.set(-4.45,-0.05,0);g.add(tailWing);
  [-1,1].forEach(side=>{
    const tailFin=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.26,1.5),armor);
    tailFin.position.set(-4.7,0.12,side*3.0);tailFin.rotation.y=side*0.18;g.add(tailFin);
  });

  // Six visible engine pods (three per side) with dark housings and cyan exhaust cores.
  [-1,1].forEach(side=>{
    [-2.7,-5.15,-7.45].forEach((z,index)=>{
      const engine=new THREE.Mesh(new THREE.CylinderGeometry(0.53,0.68,2.9,10),dark);
      engine.rotation.z=Math.PI/2;engine.position.set(-2.85,-0.48,side*Math.abs(z));g.add(engine);
      const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.44,0.28,10),panel);
      nozzle.rotation.z=Math.PI/2;nozzle.position.set(-4.43,-0.48,side*Math.abs(z));g.add(nozzle);
      const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.3,0.18,10),cyanGlow);
      exhaust.rotation.z=Math.PI/2;exhaust.position.set(-4.64,-0.48,side*Math.abs(z));g.add(exhaust);
      const mount=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.22,0.78),panel);
      mount.position.set(-2.65,-0.25,side*(Math.abs(z)-0.02));g.add(mount);
    });
  });

  // Dark raised cockpit, center energy stripe, and a small cyan insignia.
  const cockpit=new THREE.Mesh(new THREE.BoxGeometry(2.25,0.82,2.15),cockpitMat);
  cockpit.position.set(0.65,1.0,0);g.add(cockpit);
  const cockpitGlass=new THREE.Mesh(new THREE.BoxGeometry(1.5,0.16,1.6),cyanGlow);
  cockpitGlass.position.set(0.82,1.44,0);g.add(cockpitGlass);
  const centerStripe=new THREE.Mesh(new THREE.BoxGeometry(6.8,0.075,0.2),cyan);
  centerStripe.position.set(0.75,1.12,0);g.add(centerStripe);
  const insignia=new THREE.Mesh(new THREE.OctahedronGeometry(0.48,0),cyanGlow);
  insignia.position.set(-0.55,1.18,0);g.add(insignia);

  g.rotation.y=Math.PI;
  g.userData.boss=true;
  g.userData.bossType='storm-bomber';
  return g;
}
function makeGreyRulerBoss(){
  // The campaign's final flagship: a heavy, multi-weapon silhouette unlike the other bosses.
  const g=new THREE.Group();
  const hull=matS(0x252b3b,0.16,{metalness:0.86,roughness:0.24});
  const armor=matS(0x606b7e,0.2,{metalness:0.82,roughness:0.22});
  const dark=matS(0x141b2a,0.18,{metalness:0.72,roughness:0.3});
  const red=new THREE.MeshBasicMaterial({color:0xff365f});
  const cyan=new THREE.MeshBasicMaterial({color:0x67f5ff});
  const coreMat=new THREE.MeshStandardMaterial({color:0xffb4d0,emissive:0xff174f,emissiveIntensity:2.2,metalness:0.45,roughness:0.18});
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),hull);body.scale.set(7.4,1.65,3.15);body.position.set(-0.1,0,0);g.add(body);
  const prow=new THREE.Mesh(new THREE.ConeGeometry(2.9,11,10),armor);prow.rotation.z=-Math.PI/2;prow.position.set(6.7,0.1,0);g.add(prow);
  const keel=new THREE.Mesh(new THREE.BoxGeometry(10,0.55,4.9),dark);keel.position.set(-0.4,-1.35,0);g.add(keel);
  const wing=new THREE.Mesh(new THREE.BoxGeometry(7.8,0.6,29),armor);wing.position.set(-1.25,-0.22,0);g.add(wing);
  const rearWing=new THREE.Mesh(new THREE.BoxGeometry(4.5,0.45,19),dark);rearWing.position.set(-5.1,0.15,0);g.add(rearWing);
  [-1,1].forEach(side=>{
    const tip=new THREE.Mesh(new THREE.BoxGeometry(4.8,0.42,5.4),hull);tip.position.set(-2.1,0.08,side*14);tip.rotation.y=side*0.19;g.add(tip);
    const blade=new THREE.Mesh(new THREE.BoxGeometry(5.6,0.34,2.1),red);blade.position.set(-3.2,0.42,side*12.2);blade.rotation.y=side*0.2;g.add(blade);
    const engine=new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.05,4.5,12),dark);engine.rotation.z=Math.PI/2;engine.position.set(-5.6,-0.65,side*5.7);g.add(engine);
    const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.62,0.28,12),cyan);exhaust.rotation.z=Math.PI/2;exhaust.position.set(-7.95,-0.65,side*5.7);g.add(exhaust);
    [-1,1].forEach(row=>{
      const mount=new THREE.Mesh(new THREE.BoxGeometry(2.5,0.6,1.35),dark);mount.position.set(1.25,0.45,side*(7.1+row*2.5));g.add(mount);
      const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.27,0.34,5.8,10),armor);barrel.rotation.z=Math.PI/2;barrel.position.set(3.85,0.56,side*(7.1+row*2.5));g.add(barrel);
      const muzzle=new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.38,0.35,10),red);muzzle.rotation.z=Math.PI/2;muzzle.position.set(6.78,0.56,side*(7.1+row*2.5));g.add(muzzle);
    });
    const shoulder=new THREE.Mesh(new THREE.BoxGeometry(4.2,1,3.2),armor);shoulder.position.set(-0.25,0.7,side*4);g.add(shoulder);
    const rack=new THREE.Mesh(new THREE.BoxGeometry(3.3,0.65,2.1),dark);rack.position.set(-1.75,0.92,side*8.7);g.add(rack);
    for(let n=0;n<3;n++){const missile=new THREE.Mesh(new THREE.CylinderGeometry(0.19,0.22,2.3,8),red);missile.rotation.z=Math.PI/2;missile.position.set(-0.3-n*0.72,1.22,side*8.7);g.add(missile);}
  });
  const cockpit=new THREE.Mesh(new THREE.BoxGeometry(3.6,1.15,3.4),dark);cockpit.position.set(1.2,1.45,0);g.add(cockpit);
  const core=new THREE.Mesh(new THREE.SphereGeometry(1.25,16,12),coreMat);core.scale.set(1.15,1.2,1.15);core.position.set(-1.05,1.3,0);g.add(core);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.25,4.8,8),red);crown.rotation.z=-Math.PI/2;crown.position.set(0.3,2.35,0);g.add(crown);
  const rings=[];
  [3.5,4.7].forEach((r,i)=>{const ring=new THREE.Mesh(new THREE.TorusGeometry(r,0.14,8,36),i?red:cyan);ring.position.set(-1.05,1.3,0);ring.rotation.y=Math.PI/2;g.add(ring);rings.push(ring);});
  g.userData.energyRings=rings;g.userData.boss=true;g.userData.bossType='grey-ruler';g.rotation.y=Math.PI;return g;
}
function makeProceduralBossPlane(biomeIndex){
  if(biomeIndex===4)return makeGreyRulerBoss();
  if(biomeIndex===1)return makeStormBomberBoss();
  const g=new THREE.Group(),palette=BOSS_PROFILES[biomeIndex%BOSS_PROFILES.length];
  const hull=matS(palette.hull,0.22,{metalness:0.78,roughness:0.24});
  const armor=matS(palette.armor,0.24,{metalness:0.68,roughness:0.28});
  const glow=new THREE.MeshBasicMaterial({color:palette.glow});
  const glass=new THREE.MeshStandardMaterial({color:palette.glass,emissive:palette.emissive,emissiveIntensity:1.6,metalness:0.3,roughness:0.18});
  const body=new THREE.Mesh(new THREE.ConeGeometry(2.5,13,8),hull);body.rotation.z=-Math.PI/2;g.add(body);
  const core=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),armor);core.scale.set(4.4,1.25,1.25);g.add(core);
  const wings=new THREE.Mesh(new THREE.BoxGeometry(5.4,0.35,17),armor);wings.position.set(-0.7,-0.25,0);wings.rotation.x=0.04;g.add(wings);
  const bladeMat=matS(0x252a49,0.25,{metalness:0.75});
  [-1,1].forEach(side=>{const blade=new THREE.Mesh(new THREE.BoxGeometry(5.8,0.22,2.4),bladeMat);blade.position.set(-3.3,0.05,side*7.3);blade.rotation.y=side*0.18;g.add(blade);const engine=new THREE.Mesh(new THREE.CylinderGeometry(0.52,0.72,3.4,10),hull);engine.rotation.z=Math.PI/2;engine.position.set(-3.4,-0.55,side*4.6);g.add(engine);const flame=new THREE.Mesh(new THREE.ConeGeometry(0.55,3.2,10),glow);flame.rotation.z=Math.PI/2;flame.position.set(-5.8,-0.55,side*4.6);g.add(flame);});
  const cockpit=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),glass);cockpit.scale.set(1.45,0.72,0.82);cockpit.position.set(1.05,1.05,0);g.add(cockpit);
  const crest=new THREE.Mesh(new THREE.ConeGeometry(0.65,3.6,6),glow);crest.rotation.z=-Math.PI/2;crest.position.set(3.8,0.5,0);g.add(crest);
  g.rotation.y=Math.PI;g.userData.boss=true;return g;
}
function makeBossPlane(biomeIndex){
  const names=['iron-eagle','storm-bomber','Current-serpent','cloud-warden','grey-ruler'];
  const g=new THREE.Group();
  const fallback=makeProceduralBossPlane(biomeIndex);
  fallback.scale.setScalar(biomeIndex===4?2.85:2.15);
  fallback.visible=true;
  g.add(fallback);
  g.userData.boss=true;
  if(biomeIndex===0){
    // A real GLB takes priority for Iron Eagle; preserve the procedural fallback.
    g.userData.ironEagleBoss=true;
    g.userData.proceduralFallback=fallback;
    g.userData.imageBoss=false;
    if(ironEagleModelTemplate)attachIronEagleModel(g);
    else loadIronEagleBossModel();
    return g;
  }
  const path='assets/images/bosses/'+names[biomeIndex]+'.png';
  const material=bossSpriteMaterials[path]||(bossSpriteMaterials[path]=new THREE.SpriteMaterial({transparent:true,alphaTest:0.015,depthWrite:false,depthTest:true}));
  const image=new THREE.Sprite(material);
  image.center.set(0.5,0.5);
  image.visible=false;
  g.add(image);
  g.userData.imageBoss=true;
  const applyBossTexture=texture=>{
    texture.encoding=THREE.sRGBEncoding;
    texture.generateMipmaps=false;
    texture.minFilter=THREE.LinearFilter;
    texture.magFilter=THREE.LinearFilter;
    material.map=texture;
    material.needsUpdate=true;
    const aspect=(texture.image&&texture.image.width&&texture.image.height)?texture.image.width/texture.image.height:1;
    const maxWidth=biomeIndex===4?52:46;
    const maxHeight=biomeIndex===4?36:33;
    const height=Math.min(maxHeight,maxWidth/Math.max(0.1,aspect));
    image.scale.set(height*aspect,height,1);
    image.visible=true;
    fallback.visible=false;
  };
  const cachedTexture=bossImageTextures[path];
  if(cachedTexture)applyBossTexture(cachedTexture);
  else bossImageLoader.load(path,texture=>{
    bossImageTextures[path]=texture;
    applyBossTexture(texture);
  },undefined,()=>{
    image.visible=false;
    fallback.visible=true;
  });
  return g;
}
function prepareIronEagleBoss(root){
  const normalized=new THREE.Group();
  normalized.add(root);
  normalized.updateMatrixWorld(true);
  let box=new THREE.Box3().setFromObject(normalized);
  if(box.isEmpty())return null;
  const originalSize=box.getSize(new THREE.Vector3());
  // Keep the wingspan on the game's Z axis and the nose on X.
  if(originalSize.x>originalSize.z)normalized.rotation.y=Math.PI/2;
  normalized.updateMatrixWorld(true);
  box=new THREE.Box3().setFromObject(normalized);
  const size=box.getSize(new THREE.Vector3());
  const span=Math.max(size.x,size.z);
  if(!Number.isFinite(span)||span<0.001)return null;
  normalized.scale.setScalar(38/span);
  normalized.updateMatrixWorld(true);
  box=new THREE.Box3().setFromObject(normalized);
  normalized.position.sub(box.getCenter(new THREE.Vector3()));
  normalized.updateMatrixWorld(true);
  normalized.traverse(node=>{
    if(!node.isMesh)return;
    node.castShadow=true;node.receiveShadow=true;
    if(node.material){
      const materials=Array.isArray(node.material)?node.material:[node.material];
      materials.forEach(material=>{material.side=THREE.DoubleSide;material.needsUpdate=true;});
    }
  });
  return normalized;
}
function attachIronEagleModel(group){
  if(!ironEagleModelTemplate||!group||!group.userData.ironEagleBoss||group.userData.ironEagleModelAttached)return;
  const model=ironEagleModelTemplate.clone(true);
  model.rotation.y=Math.PI;
  group.add(model);
  group.userData.ironEagleModel=model;
  group.userData.ironEagleModelAttached=true;
  if(group.userData.proceduralFallback)group.userData.proceduralFallback.visible=false;
  group.userData.imageBoss=false;
}
function loadIronEagleBossModel(){
  if(ironEagleModelLoadStarted)return;
  if(typeof THREE.GLTFLoader!=='function'){
    console.warn('GLTFLoader unavailable; keeping the procedural Iron Eagle boss.');
    return;
  }
  ironEagleModelLoadStarted=true;
  new THREE.GLTFLoader().load('assets/models/bosses/iron_eagle.glb',gltf=>{
    const model=prepareIronEagleBoss(gltf.scene);
    if(!model){console.warn('Iron Eagle GLB has no usable geometry; keeping the procedural boss.');return;}
    ironEagleModelTemplate=model;
    if(typeof objs!=='undefined'&&objs&&Array.isArray(objs.enemies)){
      objs.enemies.forEach(enemy=>{if(enemy.boss&&enemy.bossStage===1&&!enemy.hit)attachIronEagleModel(enemy.mesh);});
    }
    console.info('Iron Eagle GLB loaded successfully.');
  },undefined,error=>console.warn('Iron Eagle GLB failed to load; keeping the procedural boss.',error));
}
let enemyModelTemplate=null;
let enemyModelLoadStarted=false;
function prepareEnemyModel(root){
  // Wrap the imported scene so normalization never changes the GLTF's
  // original hierarchy or relies on its root node being at world origin.
  const normalized=new THREE.Group();
  normalized.add(root);
  normalized.updateMatrixWorld(true);
  const originalBox=new THREE.Box3().setFromObject(normalized);
  if(originalBox.isEmpty()) return null;
  const originalSize=originalBox.getSize(new THREE.Vector3());

  // In this game, aircraft nose points along X and wingspan runs along Z.
  // Common GLB aircraft use Z for nose direction and X for wingspan.
  if(originalSize.x>originalSize.z) normalized.rotation.y=Math.PI/2;
  normalized.updateMatrixWorld(true);

  let fittedBox=new THREE.Box3().setFromObject(normalized);
  const fittedSize=fittedBox.getSize(new THREE.Vector3());
  const span=Math.max(fittedSize.x,fittedSize.z);
  if(!Number.isFinite(span)||span<0.001) return null;
  normalized.scale.setScalar(12/span);
  normalized.updateMatrixWorld(true);
  fittedBox=new THREE.Box3().setFromObject(normalized);
  // Center the scaled model in all three axes so its origin is stable for
  // enemy movement, hit detection, and camera-relative rotations.
  normalized.position.sub(fittedBox.getCenter(new THREE.Vector3()));
  normalized.updateMatrixWorld(true);

  normalized.traverse(node=>{
    if(node.isMesh){
      node.castShadow=true;
      node.receiveShadow=true;
      if(node.material){
        const materials=Array.isArray(node.material)?node.material:[node.material];
        materials.forEach(material=>{
          material.side=THREE.DoubleSide;
          material.needsUpdate=true;
        });
      }
    }
  });
  return normalized;
}
function makeEnemyPlane(){
  const g=new THREE.Group();
  if(enemyModelTemplate){
    g.add(enemyModelTemplate.clone(true));
    g.rotation.y=Math.PI;
    return g;
  }
  // Safe fallback while the GLB loads or if it is not present.
  const hull=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),matS(0x3a4058,0.42,{metalness:0.3}));hull.scale.set(4.5,1.35,1.4);g.add(hull);
  const wings=new THREE.Mesh(new THREE.BoxGeometry(4.8,0.28,12),matS(0xe5483a,0.4,{metalness:0.18}));wings.position.set(-0.4,-0.1,0);g.add(wings);
  const cockpit=new THREE.Mesh(new THREE.SphereGeometry(1,10,7),matS(0xffa4a4,0.2,{transparent:true,opacity:0.85}));cockpit.scale.set(1.25,0.7,0.8);cockpit.position.set(1.1,1.05,0);g.add(cockpit);
  [-3.3,3.3].forEach(z=>{const pod=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.7,3.8,8),matS(0x252a3b,0.5));pod.rotation.z=Math.PI/2;pod.position.set(-1.2,-0.5,z);g.add(pod);});
  g.rotation.y=Math.PI;return g;
}
function loadEnemyPlaneModel(){
  if(enemyModelLoadStarted) return;
  if(typeof THREE.GLTFLoader!=='function'){
    console.warn('GLTFLoader is unavailable; keeping procedural enemy aircraft.');
    return;
  }
  enemyModelLoadStarted=true;
  const loader=new THREE.GLTFLoader();
  loader.load('assets/models/glb/plane_pc.glb',gltf=>{
    const model=prepareEnemyModel(gltf.scene);
    if(!model){console.warn('Enemy GLB has no usable geometry; keeping procedural aircraft.');return;}
    enemyModelTemplate=model;
    if(typeof objs!=='undefined'&&objs&&Array.isArray(objs.enemies)){
      objs.enemies.forEach(enemy=>{
        // Do not replace a boss mesh with a regular enemy aircraft if the GLB finishes loading mid-battle.
        if(enemy.boss||!enemy.mesh||!enemy.mesh.parent) return;
        const old=enemy.mesh;
        const replacement=makeEnemyPlane();
        replacement.position.copy(old.position);
        replacement.rotation.copy(old.rotation);
        replacement.visible=old.visible;
        old.parent.add(replacement);
        old.parent.remove(old);
        enemy.mesh=replacement;
      });
    }
    console.info('Enemy aircraft GLB loaded successfully.');
  },undefined,error=>{
    console.warn('Enemy GLB unavailable; using procedural aircraft until assets/models/glb/plane_pc.glb is added.',error);
  });
}
loadEnemyPlaneModel();
function prepareAircraftModel(root){
  // Keep the imported GLB hierarchy intact and normalize it through a wrapper.
  const normalized=new THREE.Group();
  normalized.add(root);
  normalized.updateMatrixWorld(true);
  const originalBounds=new THREE.Box3().setFromObject(normalized);
  if(originalBounds.isEmpty())return null;
  const originalSize=originalBounds.getSize(new THREE.Vector3());

  // The supplied Falcon GLB has its wingspan on X and nose along +Z.
  // Gameplay uses +X as forward and Z for wingspan, so rotate the wrapper
  // before measuring and fitting the model to the procedural aircraft size.
  if(originalSize.x>originalSize.z)normalized.rotation.y=Math.PI/2;
  normalized.updateMatrixWorld(true);

  let bounds=new THREE.Box3().setFromObject(normalized);
  if(bounds.isEmpty())return null;
  const size=bounds.getSize(new THREE.Vector3());
  const span=Math.max(size.x,size.z);
  if(!Number.isFinite(span)||span<0.001)return null;
  // Match the existing procedural aircraft's approximate 14-unit wingspan.
  normalized.scale.setScalar(14/span);
  normalized.updateMatrixWorld(true);
  bounds=new THREE.Box3().setFromObject(normalized);
  normalized.position.sub(bounds.getCenter(new THREE.Vector3()));
  normalized.updateMatrixWorld(true);
  normalized.traverse(node=>{
    if(!node.isMesh)return;
    node.castShadow=true;node.receiveShadow=true;
    const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
    materials.forEach(material=>{material.side=THREE.DoubleSide;material.needsUpdate=true;});
  });
  return normalized;
}
function loadPlayerAircraftModels(){
  if(aircraftModelLoadStarted)return;
  if(typeof THREE.GLTFLoader!=='function'){console.warn('GLTFLoader unavailable; keeping the procedural aircraft models.');return;}
  aircraftModelLoadStarted=true;
  const loader=new THREE.GLTFLoader();
  [['trainer','assets/models/aircraft/stylized_ww1_plane.glb']].forEach(([key,url])=>{
    loader.load(url,gltf=>{
      const model=prepareAircraftModel(gltf.scene);
      if(!model){console.warn('Invalid '+key+' GLB; keeping procedural fallback.');return;}
      aircraftModelTemplates[key]=model;
      if(save.model===key){
        aircraftModelHolder.clear();
        aircraftModelHolder.add(model.clone(true));
        appliedModel='';
        applyPlaneColors();
      }
      console.info(key+' aircraft GLB loaded successfully.');
    },undefined,error=>console.warn(key+' GLB unavailable; using the procedural fallback.',error));
  });
}
loadPlayerAircraftModels();
function makeCan(){
  const g=new THREE.Group();
  const b=new THREE.Mesh(new THREE.BoxGeometry(2.6,3.2,1.2),canMat);g.add(b);
  const c=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.9,0.9),capMat);c.position.set(0.6,2,0);g.add(c);
  const d=new THREE.Mesh(new THREE.BoxGeometry(0.15,1.5,0.5),matS(0xffc83d,0.4));d.position.set(1.35,0,0);g.add(d);
  return g;
}
function makeDraft(R){
  const g=new THREE.Group();
  const c=new THREE.Mesh(new THREE.CylinderGeometry(R,R,90,16,1,true),draftMat);c.position.y=45;g.add(c);
  g.userData.rings=[];
  for(let i=0;i<3;i++){const t=new THREE.Mesh(new THREE.TorusGeometry(R*0.9,0.35,6,24),draftRingMat);t.rotation.x=Math.PI/2;g.add(t);g.userData.rings.push(t);}
  return g;
}
const stormShellMat=new THREE.MeshBasicMaterial({color:0x725cff,transparent:true,opacity:0.16,side:THREE.DoubleSide,depthWrite:false});
const stormRingMat=new THREE.MeshBasicMaterial({color:0x9c7bff,transparent:true,opacity:0.75,depthWrite:false});
const stormCoreMat=new THREE.MeshBasicMaterial({color:0x372d7d,transparent:true,opacity:0.24,side:THREE.DoubleSide,depthWrite:false});
function makeStorm(){
  const g=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(9.2,11.8,19,18,1,true),stormShellMat);shell.position.y=9.5;g.add(shell);
  const core=new THREE.Mesh(new THREE.CylinderGeometry(2.4,3.6,17,12,1,true),stormCoreMat);core.position.y=9;g.add(core);
  g.userData.rings=[];
  for(let i=0;i<4;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(7.2+i*0.8,0.22,6,28),stormRingMat);ring.position.y=2.2+i*4.2;ring.rotation.x=Math.PI/2;g.add(ring);g.userData.rings.push(ring);}
  return g;
}
function makeStation(){
  const g=new THREE.Group();
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(7.2,8.6,0.8,12),matS(0x253a56,0.4,{metalness:0.35}));platform.position.y=0;g.add(platform);
  const pad=new THREE.Mesh(new THREE.CylinderGeometry(5.2,5.2,0.3,16),matS(0x28d7e5,0.3,{emissive:0x07545b}));pad.position.y=0.6;g.add(pad);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.5,0.3,8,28),new THREE.MeshBasicMaterial({color:0xffd84a}));ring.position.y=0.9;ring.rotation.x=Math.PI/2;g.add(ring);
  for(let i=0;i<4;i++){const post=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.5,3.4,8),matS(0xe8f4ff,0.4,{metalness:0.25}));const a=i*Math.PI/2;post.position.set(Math.cos(a)*5.8,2.2,Math.sin(a)*5.8);g.add(post);}
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(1.2,10,8),new THREE.MeshBasicMaterial({color:0x7ff5ff}));beacon.position.y=4.8;g.add(beacon);g.userData.beacon=beacon;g.userData.ring=ring;
  return g;
}

/* ---------- state ---------- */
let state='ready',paused=false;
let routeTargetMeters=500;
let P,run,objs,shake=0,time=0,power=0,powerDir=1,night=0,snapCam=true;
const down=new Set(),ptr=new Map(),keys={left:false,right:false};
let fireHeld=false;
const parts=[],floats=[],shots=[],missiles=[],bossBlastRings=[];
const shotGeo=new THREE.CylinderGeometry(0.35,0.35,4.5,6);shotGeo.rotateZ(Math.PI/2);
const shotMat=new THREE.MeshBasicMaterial({color:0xfff27a});
const missileGeo=new THREE.ConeGeometry(3.2,18,8);missileGeo.rotateZ(-Math.PI/2);
const missileMat=matS(0xff6248,0.35,{emissive:0x54150c,metalness:0.25});
let missileCooldown=0;
const bossLanceGeo=new THREE.BoxGeometry(22,4.5,4.5);
const bossLanceMat=new THREE.MeshBasicMaterial({color:0xff3e9b});
const bossPulseGeo=new THREE.SphereGeometry(5,10,8);
const bossPulseMat=new THREE.MeshBasicMaterial({color:0xffa64d});
const G=560;

function clearObjs(){while(objGroup.children.length)objGroup.remove(objGroup.children[0]);}
function resetRun(){
  if(objs&&objs.enemyShots)objs.enemyShots.forEach(b=>scene.remove(b.mesh));
  P={x:0,alt:85,z:0,vz:0,s:0,a:0.62,roll:0,yaw:0,boostT:0,spin:0,sliding:false,bounces:0,fuel:100,hp:100,maxHp:100,hitCooldown:0,damageFlash:0,launchT:0,engineOut:false,fuelWarned:false,abilityCooldown:0,magnetT:0,guardianOverdriveT:0};
  routeTargetMeters=500;
  shots.forEach(s=>scene.remove(s.mesh));shots.length=0;
  missiles.forEach(m=>scene.remove(m.mesh));missiles.length=0;missileCooldown=0;
  const cannonLevel=Number(save.lv.cannon)||0;
  run={coins:0,picked:0,maxAlt:0,gateCombo:0,bestCombo:0,gates:0,bosses:0,bossBattle:false,missiles:3,stationCount:0,stormHits:0,firePower:1,stationShield:0,aimMode:'smart',
    tri:false,rate:1,cool:1+0.12*cannonLevel,damage:1+0.25*cannonLevel,perks:[],heat:0,overheat:false,fireCd:0,fireSfxTimer:0};
  objs={coins:[],rings:[],birds:[],enemies:[],enemyShots:[],fuels:[],drafts:[],storms:[],stations:[],next:600,nextEnemy:550/M_PER_PX,nextBoss:bossDistanceMeters(0)/M_PER_PX,nextStorm:600/M_PER_PX,nextStation:(bossDistanceMeters(0)-1100)/M_PER_PX,nextStationStage:0,approachBossX:null};
  shieldT=0;shieldCooldown=0;shieldMesh.visible=false;
  clearObjs();
  parts.forEach(p=>{p.mesh.visible=false;});parts.length=0;
  floats.forEach(f=>f.el.remove());floats.length=0;
  snapCam=true;
}

/* particle pool */
const pGeo=new THREE.SphereGeometry(1,6,4),pPool=[],pMats={};
for(let i=0;i<160;i++){const m=new THREE.Mesh(pGeo,null);m.visible=false;scene.add(m);pPool.push(m);}
function pMat(c){return pMats[c]||(pMats[c]=new THREE.MeshBasicMaterial({color:c}));}
function addPart(x,alt,vx,vy,life,col,r,z,vz){
  const m=pPool.find(q=>!q.visible);if(!m)return;
  m.visible=true;m.material=pMat(col);
  parts.push({mesh:m,x,alt,z:z||0,vx,vy,vz:vz===undefined?(Math.random()-.5)*120:vz,life,max:life,r});
}
function addFloat(x,alt,txt,col,z){
  const el=document.createElement('div');el.className='ft';el.textContent=txt;el.style.color=col;fx.appendChild(el);
  floats.push({x,alt,z:z===undefined?P.z:z,t:0,el});
}

/* ---------- world spawn ---------- */
function addCoin(x,alt,z){
  const m=new THREE.Mesh(coinGeo,coinMat);m.position.set(x*S,Y(alt),z*S);objGroup.add(m);
  objs.coins.push({x,alt,z,on:true,mesh:m});
}
const zc=z=>clamp(z,-320,320);
function spawnBossApproach(x){
  // A deliberate 800 m gauntlet: three fighter waves, storm corridors, and fuel choices.
  [x-32000,x-23000,x-15000].forEach((px,i)=>{if(px<P.x+900)return;const e={x:px,alt:190+i*105,z:zc((Math.random()-.5)*330),phase:Math.random()*6.28,fireT:1.9+i*.25,hit:false,bossApproach:true};e.mesh=makeEnemyPlane();e.mesh.position.set(e.x*S,Y(e.alt),e.z*S);objGroup.add(e.mesh);objs.enemies.push(e);});
  [x-29000,x-19000,x-10500].forEach((px,i)=>{if(px<P.x+900)return;const o={x:px,alt:225+i*90,z:zc((Math.random()-.5)*250),R:118,hitCd:0,phase:Math.random()*6.28,bossApproach:true,mesh:makeStorm()};o.mesh.position.set(o.x*S,Y(o.alt),o.z*S);objGroup.add(o.mesh);objs.storms.push(o);});
  [x-26000,x-15000,x-7000].forEach((px,i)=>{if(px<P.x+900)return;const o={x:px,alt:180+i*120,z:zc((Math.random()-.5)*240),on:true,bossApproach:true};o.mesh=makeCan();o.mesh.position.set(o.x*S,Y(o.alt),o.z*S);objGroup.add(o.mesh);objs.fuels.push(o);addFloat(o.x,o.alt+40,'برميل وقود عائم +24٪','#baf6ff',o.z);});
  addFloat(x-36000,430,'منطقة خطر — استعد للزعيم','#ffcf75',0);
}
function spawn(until){
  if(objs.enemies.some(e=>e.boss&&!e.hit)){
    // Keep the arena isolated without moving the next biome's fixed distance marker.
    // The next boss and its approach must stay scheduled at the biome endpoint.
    objs.next=Math.max(objs.next,until+350);
    objs.nextEnemy=Math.max(objs.nextEnemy,until+400/M_PER_PX);
    objs.nextStorm=Math.max(objs.nextStorm,until+650/M_PER_PX);
    return;
  }
  // Schedule the approach 1 km before the boss, not when the boss is already on screen.
  if(objs.nextBoss<=P.x+40000&&objs.approachBossX!==objs.nextBoss){spawnBossApproach(objs.nextBoss);objs.approachBossX=objs.nextBoss;}
  // Clear routine spawns for the final 350 m so the approach hazards are readable.
  if(objs.approachBossX===objs.nextBoss&&objs.nextBoss<=P.x+14000&&objs.nextBoss>P.x+4000){
    objs.next=Math.max(objs.next,objs.nextBoss+2200);
    objs.nextEnemy=Math.max(objs.nextEnemy,objs.nextBoss+6000);
    objs.nextStorm=Math.max(objs.nextStorm,objs.nextBoss+8000);
    objs.nextStation=Math.max(objs.nextStation,objs.nextBoss+12000);
    // Remove routine clutter from the final runway, but retain uncollected boss-approach storms and fuel.
    objs.enemies.forEach(e=>{if(!e.boss&&!e.hit){e.hit=true;objGroup.remove(e.mesh);}});
    objs.enemies=objs.enemies.filter(e=>e.boss&&!e.hit);
    ['coins','rings','birds','fuels','drafts','storms','stations'].forEach(key=>{
      objs[key]=objs[key].filter(o=>{
        if(o.bossApproach&&o.x>=P.x-500)return true;
        if(o.mesh)objGroup.remove(o.mesh);
        return false;
      });
    });
    return;
  }
  while(objs.nextStorm<until){
    const x=objs.nextStorm,alt=220+Math.random()*260,z=zc((Math.random()-.5)*320);
    const o={x,alt,z,R:118,hitCd:0,phase:Math.random()*6.28,mesh:makeStorm()};
    o.mesh.position.set(x*S,Y(alt),z*S);objGroup.add(o.mesh);objs.storms.push(o);
    addFloat(x,alt+115,'عاصفة جوية!','#c7b7ff',z);
    objs.nextStorm+=650/M_PER_PX;
  }
  while(objs.nextStation<until){
    const x=objs.nextStation,alt=260+Math.random()*180,z=zc((Math.random()-.5)*180);
    const o={x,alt,z,R:96,mesh:makeStation(),claimed:false,biomeStage:objs.nextStationStage||0};
    o.mesh.position.set(x*S,Y(alt),z*S);objGroup.add(o.mesh);objs.stations.push(o);
    addFloat(x,alt+85,'محطة تطوير قادمة — جهّز الطائرة للزعيم','#8cf5ff',z);
    objs.nextStationStage=(objs.nextStationStage||0)+1;
    objs.nextStation=(bossDistanceMeters(objs.nextStationStage)-1100)/M_PER_PX;
  }
  while(objs.nextBoss<until){
    const x=objs.nextBoss,stage=Math.max(0,run.bosses),biomeIndex=stage%BOSS_PROFILES.length;
    // Let the player finish the approach before the boss enters the arena.
    if(x>P.x+4000)return;
    const bossHp=[250,360,490,650,900][biomeIndex]||250;
    objs.enemies.forEach(other=>{if(!other.boss&&!other.hit){other.hit=true;objGroup.remove(other.mesh);}});
    objs.enemies=objs.enemies.filter(other=>other.boss&&!other.hit);
    objs.enemyShots.forEach(b=>scene.remove(b.mesh));objs.enemyShots.length=0;
    ['coins','rings','birds','fuels','drafts','storms','stations'].forEach(key=>{objs[key].forEach(o=>{if(o.mesh)objGroup.remove(o.mesh);});objs[key]=[];});
    const e={x,alt:250+Math.random()*260,z:zc((Math.random()-.5)*260),phase:Math.random()*6.28,fireT:2.3,hit:false,boss:true,hp:bossHp,maxHp:bossHp,contactHit:false,attackState:'ranged',attackTimer:3.2+Math.random()*1.5,diveWarning:0,diveTimer:0,weaponCycle:0,diveTargetAlt:300,diveTargetZ:0,combatPhase:1,biomeIndex,bossName:BOSS_PROFILES[biomeIndex].name,bossStage:stage+1,hitRadiusX:biomeIndex===0?92:82,hitRadiusY:biomeIndex===0?64:72,hitRadiusZ:biomeIndex===0?112:80,bank:0};
    e.finalBoss=biomeIndex===4;e.mesh=makeBossPlane(biomeIndex);e.mesh.position.set(x*S,Y(e.alt),e.z*S);objGroup.add(e.mesh);objs.enemies.push(e);
    const portrait=$('bossPortrait');
    if(portrait){portrait.hidden=true;portrait.onerror=()=>{portrait.hidden=true;};portrait.onload=()=>{portrait.hidden=false;};portrait.src='assets/images/bosses/'+['iron-eagle','storm-bomber','Current-serpent','cloud-warden','grey-ruler'][biomeIndex]+'.png';}
    run.bossBattle=true;playSfx('boss-warning');addFloat(x,e.alt+75,'دخول ساحة '+e.bossName+' — اهزمه للمتابعة!','#ff9b91',e.z);
    objs.nextBoss=bossDistanceMeters(stage+1)/M_PER_PX;return;
  }
  while(objs.nextEnemy<until){
    const x=objs.nextEnemy;
    const e={x,alt:180+Math.random()*390,z:zc((Math.random()-.5)*420),phase:Math.random()*6.28,fireT:1.2+Math.random()*1.4,hit:false};
    e.mesh=makeEnemyPlane();e.mesh.position.set(x*S,Y(e.alt),e.z*S);objGroup.add(e.mesh);objs.enemies.push(e);
    objs.nextEnemy+=400/M_PER_PX;
  }
  while(objs.next<until){
    const x=objs.next,m=x*M_PER_PX,r=Math.random(),z0=(Math.random()-0.5)*440;
    if(r<0.3){
      const n=6+(Math.random()*4|0),base=90+Math.random()*380,h=50+Math.random()*90,wig=(Math.random()-.5)*2;
      for(let i=0;i<n;i++)addCoin(x+i*50,base+Math.sin(i/(n-1)*Math.PI)*h,zc(z0+Math.sin(i*0.55)*60*wig));
      objs.next=x+n*50+220+Math.random()*260;
    }else if(r<0.47){
      const n=1+(Math.random()*2|0);
      for(let i=0;i<n;i++){
        const o={x:x+i*340,alt:140+Math.random()*420,z:zc(z0+i*110*(Math.random()<.5?-1:1)),R:80,on:true};
        o.mesh=new THREE.Mesh(ringGeo,ringMat);o.mesh.position.set(o.x*S,Y(o.alt),o.z*S);objGroup.add(o.mesh);
        objs.rings.push(o);
      }
      objs.next=x+n*340+300+Math.random()*250;
    }else if(r<0.62&&m>18){
      const n=Math.floor(Math.random()*(1+Math.min(3,Math.floor(m/120))));
      for(let i=0;i<=n;i++){
        const o={x:x+i*150,alt:160+Math.random()*460,z:zc(z0+(Math.random()-.5)*200),vx:-60-Math.random()*50,t:Math.random()*6,hit:false};
        o.mesh=makeBird();o.mesh.position.set(o.x*S,Y(o.alt),o.z*S);objGroup.add(o.mesh);objs.birds.push(o);
      }
      objs.next=x+n*150+420+Math.random()*300;
    }else if(r<0.70){
      if(Math.random()<0.65){
        const o={x:x,alt:240+Math.random()*320,z:zc(z0),on:true};
        o.mesh=makeCan();o.mesh.position.set(o.x*S,Y(o.alt),o.z*S);objGroup.add(o.mesh);objs.fuels.push(o);
      }
      objs.next=x+500+Math.random()*300;
    }else if(r<0.84){
      const o={x:x,z:zc(z0),R:150};
      o.mesh=makeDraft(o.R*S);o.mesh.position.set(o.x*S,0,o.z*S);objGroup.add(o.mesh);objs.drafts.push(o);
      objs.next=x+520+Math.random()*320;
    }else{
      const n=5+(Math.random()*4|0),a=40+Math.random()*60;
      for(let i=0;i<n;i++)addCoin(x+i*46,a,zc(z0));
      objs.next=x+n*46+260+Math.random()*200;
    }
  }
}

/* ---------- ui ---------- */
const ICONS={
  sling:'<svg viewBox="0 0 64 64" role="img" aria-label="قوة المقلاع"><defs><linearGradient id="slWood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d99a55"/><stop offset="1" stop-color="#75401f"/></linearGradient><linearGradient id="slBand" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff755c"/><stop offset="1" stop-color="#d92f3c"/></linearGradient><radialGradient id="slGlow"><stop stop-color="#fff2a1"/><stop offset="1" stop-color="#ffb52e"/></radialGradient></defs><ellipse cx="32" cy="55" rx="19" ry="4" fill="#8a4b1e" opacity=".18"/><path d="M29 53 27 29 13 8Q11 5 8 8t0 6l15 21 1 18z" fill="url(#slWood)" stroke="#75401f" stroke-width="2.5" stroke-linejoin="round"/><path d="m34 53 3-24L51 9q2-3 5 0t0 6L41 36l-2 17z" fill="url(#slWood)" stroke="#75401f" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 11Q31 37 53 12" fill="none" stroke="#f8b5a0" stroke-width="7" stroke-linecap="round"/><path d="M11 11Q31 37 53 12" fill="none" stroke="url(#slBand)" stroke-width="4" stroke-linecap="round"/><circle cx="32" cy="31" r="8" fill="url(#slGlow)" stroke="#e58a13" stroke-width="2"/><path d="m32 25 2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff9cf"/></svg>',
  plane:'<svg viewBox="0 0 64 64" role="img" aria-label="تطوير الطائرة"><defs><linearGradient id="plBody" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff7d6"/><stop offset=".45" stop-color="#ff784f"/><stop offset="1" stop-color="#c92d37"/></linearGradient><linearGradient id="plWing" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffb35c"/><stop offset="1" stop-color="#e54a3c"/></linearGradient><linearGradient id="plGlass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8ffff"/><stop offset="1" stop-color="#4cb8ed"/></linearGradient></defs><ellipse cx="32" cy="53" rx="21" ry="4" fill="#8a4b1e" opacity=".16"/><path d="m28 28-19-9-3 3 14 16-6 13 5 2 13-10 13 10 5-2-6-13 14-16-3-3-19 9-2-19-4-3-4 3z" fill="url(#plWing)" stroke="#b52d31" stroke-width="2" stroke-linejoin="round"/><path d="M31 8q-4 1-5 10l-5 30q0 5 4 5h14q4 0 4-5l-5-30q-1-9-5-10z" fill="url(#plBody)" stroke="#b52d31" stroke-width="2"/><path d="M27 23q5-5 10 0l2 8H25z" fill="url(#plGlass)" stroke="#fff2d2" stroke-width="1.5"/><path d="m21 40-8 9 10-4m20-5 8 9-10-4" fill="#fff0bc" opacity=".9"/><path d="M29 37h6" stroke="#fff7dc" stroke-width="2.5" stroke-linecap="round"/></svg>',
  coin:'<svg viewBox="0 0 64 64" role="img" aria-label="مضاعف العملات"><defs><linearGradient id="coEdge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b66b05"/><stop offset=".45" stop-color="#ffe477"/><stop offset="1" stop-color="#c27b08"/></linearGradient><radialGradient id="coFace" cx=".32" cy=".22" r=".9"><stop stop-color="#fff7b0"/><stop offset=".42" stop-color="#ffd84c"/><stop offset=".78" stop-color="#f4a900"/><stop offset="1" stop-color="#d77a00"/></radialGradient></defs><ellipse cx="33" cy="54" rx="20" ry="4" fill="#8a4b1e" opacity=".18"/><g transform="rotate(-10 32 35)"><ellipse cx="31" cy="43" rx="20" ry="10" fill="#c17a08" stroke="#8b4c09" stroke-width="2"/><path d="M11 34v9c0 6 9 11 20 11s20-5 20-11v-9" fill="url(#coEdge)" stroke="#a76108" stroke-width="2"/><ellipse cx="31" cy="34" rx="20" ry="10" fill="url(#coFace)" stroke="#a76108" stroke-width="2.5"/><ellipse cx="31" cy="34" rx="15" ry="6.8" fill="none" stroke="#fff1a0" stroke-width="1.8"/><path d="M35 25 27 37h6l-4 7 11-13h-7l3-6z" fill="#fff8c7" stroke="#d58b0a" stroke-width="1.2" stroke-linejoin="round"/><path d="M17 29q4-4 9-4" fill="none" stroke="#fffbd6" stroke-width="2.5" stroke-linecap="round"/></g><path d="m48 8 2.5 6 6.5 2.5-6.5 2.5-2.5 6-2.5-6-6.5-2.5 6.5-2.5z" fill="#fff4a1" stroke="#f0b51b" stroke-width="1.3"/></svg>'
};
const NAMES={sling:'قوة المقلاع',plane:'الطائرة',coin:'مضاعف العملات'};
function renderDailyMissions(){
  const list=$('missionsList');
  if(!list)return;
  ensureDaily();
  list.innerHTML=DAILY_MISSIONS.map(m=>{
    const progress=Math.min(m.target,Math.floor(save.daily[m.metric]));
    const done=!!save.daily.claimed[m.id];
    const pct=Math.round(progress/m.target*100);
    return '<article class="mission-row'+(done?' completed':'')+'"><div class="mission-row-head"><div><strong>'+m.title+'</strong><small>'+m.description+'</small></div><span class="mission-reward">+'+m.reward+' عملة</span></div><div class="mission-progress"><span style="width:'+pct+'%"></span></div><div class="mission-row-foot"><small>'+progress+' / '+m.target+' '+m.unit+'</small><b>'+(done?'✓ مكتملة':(progress>=m.target?'اكتملت':'قيد الإنجاز'))+'</b></div></article>';
  }).join('');
}
function renderHangar(upgradedKey){
  renderDailyMissions();
  $('hCoins').textContent=save.coins;
  $('hFuel').textContent=save.fuel;
  $('best').textContent=save.best>0?('أفضل مسافة: '+save.best+' م'):'';
  const fleet=$('fleet');fleet.innerHTML='';
  Object.entries(AIRCRAFT).forEach(([key,a])=>{
    const unlocked=save.best>=a.unlock;
    const b=document.createElement('button');b.type='button';
    b.className='fleet-btn'+(save.model===key?' selected':'')+(!unlocked?' locked':'');
    b.innerHTML='<span class="fleet-icon">'+({trainer:'✈',interceptor:'➤',guardian:'⬟',phantom:'✦'}[key])+'</span><span class="fleet-name">'+a.short+'</span><small>'+(unlocked?(save.model===key?'محددة':'اختيار'):(a.unlock+' م'))+'</small>';
    b.addEventListener('click',()=>{if(!unlocked){toast('اقطع '+a.unlock+' م لفتحها');beep(160,.1,'square');return;}save.model=key;persist();appliedModel='';appliedLv=-1;renderHangar();playSfx('ui-confirm');toast(a.name);});
    fleet.appendChild(b);
  });
  const selected=aircraft();
  const stats=$('aircraftStats');
  if(stats){
    const speedPct=Math.round(selected.speed*100);
    const fuelPct=Math.round(100*(1+save.lv.plane*0.14)/(selected.fuelUse||1));
    const shotMs=Math.round(Math.max(0.11,selected.shot-save.lv.plane*0.012)*1000);
    const shieldSec=Math.max(3.8,selected.shield-save.lv.plane*0.38-(save.model==='guardian'?1.1:0));
    const rows=[
      {label:'السرعة',value:speedPct+'%',bar:clamp((speedPct-75)/55*100,0,100),tone:'speed'},
      {label:'مدى الوقود',value:fuelPct+'%',bar:clamp((fuelPct-70)/150*100,0,100),tone:'fuel'},
      {label:'فاصل الإطلاق',value:shotMs+' ms',bar:clamp((260-shotMs)/160*100,0,100),tone:'fire'},
      {label:'عودة الدرع',value:shieldSec.toFixed(1)+' ث',bar:clamp((12-shieldSec)/9*100,0,100),tone:'shield'}
    ];
    stats.innerHTML='<div class="aircraft-stats-head"><span class="aircraft-stats-icon">✈</span><div><strong>'+selected.name+'</strong><small>'+selected.upgrade+' · مستوى الطائرة '+save.lv.plane+'/'+MAXLV+'</small></div><span class="stats-chip">مواصفات فعلية</span></div><div class="aircraft-stat-grid">'+rows.map(r=>'<div class="aircraft-stat '+r.tone+'"><div><span>'+r.label+'</span><strong>'+r.value+'</strong></div><i><b style="width:'+r.bar+'%"></b></i></div>').join('')+'</div>';
  }
  const box=$('cards');box.innerHTML='';
  ['sling','plane','coin'].forEach(k=>{
    const l=save.lv[k],max=l>=MAXLV,c=cost(l);
    const d=document.createElement('div');d.className='card'+(k===upgradedKey?' just-upgraded':'');
    let pips='';for(let i=0;i<MAXLV;i++)pips+='<b'+(i<l?' class="f"':'')+'></b>';
    const cardName=k==='plane'?aircraft().short+' · '+aircraft().upgrade:NAMES[k];
    const descriptions={sling:'إقلاع أقوى واندفاع أولي أفضل',plane:'خزان وقود أكبر مدىً: كل مستوى يضيف 14٪ إلى مدة الطيران الأساسية ويؤخر الهبوط الاضطراري',coin:'مكافآت عملات أكبر من البوابات والخصوم'};
    d.innerHTML='<div class="ic">'+ICONS[k]+'<span class="lv">'+(l+1)+'</span></div><div class="nm">'+cardName+(k==='coin'?' ×'+(l+1):'')+'</div><div class="upgrade-desc">'+descriptions[k]+'</div><div class="pips">'+pips+'</div>';
    const b=document.createElement('button');
    b.className='btn up'+((!max&&save.coins<c)?' no':'');
    b.innerHTML=max?'<span>الأقصى</span><svg class="max-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 8.6l6.2-.9z" fill="currentColor"/></svg>':'<svg class="upgrade-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>تطوير</span><i class="coin-i"></i><span>'+c+'</span>';
    b.addEventListener('click',()=>{
      if(max)return;
      if(save.coins<c){toast('العملات غير كافية');beep(160,.12,'square');return;}
      save.coins-=c;save.lv[k]++;persist();playSfx('ui-confirm');renderHangar(k);toast('تم التطوير! ✨');
    });
    d.appendChild(b);box.appendChild(d);
  });
}
$('buyFuel').addEventListener('click',()=>{
  if(save.coins<120){toast('تحتاج 120 عملة');beep(160,.12,'square');return;}
  save.coins-=120;save.fuel++;persist();playSfx('fuel-pickup');renderHangar();
});
$('missionsToggle').addEventListener('click',()=>{
  renderDailyMissions();
  $('missionsOverlay').classList.add('open');
  $('missionsOverlay').setAttribute('aria-hidden','false');
});
function closeMissions(){
  $('missionsOverlay').classList.remove('open');
  $('missionsOverlay').setAttribute('aria-hidden','true');
}
$('missionsClose').addEventListener('click',closeMissions);
$('missionsOverlay').addEventListener('click',e=>{if(e.target===$('missionsOverlay'))closeMissions();});
let toastT;
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('on'),900);}
function show(id){['hangar','charge','hud','result'].forEach(n=>$(n).classList.toggle('on',n===id));}
const INTRO=[
 ['الملف صفر · قبل 18 عامًا','ليلة انطفأت فيها السماء','في ليلة بلا قمر، انطفأت أبراج الملاحة. لم تكن العواصف قد بدأت بعد، لكن أبراج الحاكم كانت تجمع طاقة الرياح منذ سنوات.'],
 ['النداء الأخير','رسالة من جدّك','ترك جدّك طائرة واحدة في حظيرة مهجورة: «جناح». وعلى مقعدها رسالة قصيرة: لا تصدّق أول رواية تسمعها عن الحاكم الرمادي. انظر إلى ما بُني قبل الكارثة، لا إلى ما قيل بعدها.'],
 ['الأختام الخمسة','خمسة حراس… وحقيقة واحدة','كل ختم متصل بأبراج المراقبة وشبكة تستنزف التيارات الهوائية. السجلات محذوفة، والريح نفسها تبدو وكأنها تحاول تحذيرك.'],
 ['الانطلاق','لا عودة إلى الوراء','المسافة طويلة، والوقود محدود، وكل زعيم يتعلم من أسلوبك. لا تطلق النار بلا حساب؛ راقب تحركاته، اختر سلاحك، واحتفظ بقدرتك للحظة التي تغيّر المعركة.']
];
const CODEX_BOSSES=[
 ['النسر الحديدي','يحرس الختم الأول في وادٍ ضيق تسيطر عليه أبراج المراقبة. بعد هزيمته، يكشف سجل قديم أن نظام السيطرة بُني قبل الكارثة بسنوات.'],
 ['قاذفة العاصفة','تجمع طاقة التيارات الهوائية وتحوّلها إلى سلاح؛ إنها لا تصنع العاصفة، بل تستنزف الرياح التي تغذيها.'],
 ['أفعى التيارات','زعيم المرحلة الثالثة: يطارد الطائرة بين مجاري هواء متقطعة ويجبرك على تغيير الارتفاع والسلاح.'],
 ['حارس السحاب','يحرس الختم الرابع فوق أعلى نقطة في العالم. رسالة الجد تحذّر من أن كسر الأختام سيحرر الرياح، لكنه سيزيل الحاجز الذي يمنع العاصفة القديمة من العودة.'],
 ['الحاكم الرمادي','في القلعة العائمة، يكشف الحاكم أن الأختام جزء من نظام احتواء، ويعترف أنه اختار الاستبداد خوفًا من تكرار أخطاء الماضي.']
];
const ENDING=[
 'انكسرت الأختام الخمسة، واندفعت الرياح عبر السماء. لكن الحاكم الرمادي لم يهرب ولم يطلب الرحمة؛ بل أطفأ سلاحه وقال: «لقد فعلتَ ما لم أستطع منعه… لقد فتحتَ الباب».',
 'تشقّق الغلاف المعدني للطائرة «جناح»، وظهر تحت طبقاتها شعارٌ قديم مطابق لشعار الآلة التي دمّرت السماء قبل 18 عامًا. لم تكن طائرة جدّك الأخيرة سلاحًا لمقاومة الحاكم؛ كانت المفتاح الذي صنعه الحاكم ليبقى الباب مغلقًا.',
 'ثم وصل صوت جدّك من داخل قلب الطائرة: «إذا كنت تسمعني، فهذا يعني أنني فشلت مرة أخرى». لم يكن الحاكم الرمادي هو من سجن الرياح؛ لقد كان يحبس الكيان الذي يعيش داخل العاصفة. والآن، بعد أن حررتَه، صار الكيان يملك جناحًا… ويعرف اسمك.'
];
const FINAL_REVEAL=[
 ['المعركة الأخيرة · الصمت بعد العاصفة','انتهى القتال… ولم تنتهِ الحرب','سقط الحارس الخامس، وتوقفت كل أصوات المحركات في السماء. للحظة واحدة، ظننتَ أن العالم عاد حرًا. ثم انطفأت النجوم واحدةً تلو الأخرى.'],
 ['الوجه الحقيقي للعدو','الحاكم الرمادي لم يكن العدو','ظهر الحاكم الرمادي بلا سلاح. قال إن الأختام لم تكن سجونًا للرياح، بل أقفالًا على كيانٍ يلتهم العوالم عبر العواصف. وكل زعيم هزمته كان يحمي قفلًا من الانهيار.'],
 ['المفتاح','جناح… هو الباب','انفتح جناح الطائرة، وظهر قلبٌ أسود يحمل توقيع جدّك. انطلق صوته من داخل المحرك: «سامحني… لم أستطع إخفاءك عنه إلى الأبد». لم تكن تقود طائرة جدّك؛ كنت تحمل آخر قطعة من السجن.'],
 ['النهاية غير المتوقعة','هناك طائرة أخرى في السماء','ارتفعت الكاميرا فوق الغيوم. ظهرت طائرة ثانية، مطابقة تمامًا لطائرتك، لكن قمرة قيادتها كانت مضاءة من الداخل. وصل صوتٌ مجهول عبر الراديو: «أخيرًا… وصلتَ بي إلى هنا». ثم ظهر اسمك على شاشة العدو. لم تكن الرحلة لإنقاذ السماء فقط؛ لقد كانت اختبارًا لاختيار حامل العاصفة التالي.']
];
let storyCb=null;
function showStory(kick,title,paras,buttonText,cb){
  $('stKick').textContent=kick||'';
  $('stTitle').textContent=title||'';
  const box=$('stText');box.replaceChildren();
  (paras||[]).forEach(p=>{const el=document.createElement('p');el.textContent=p;box.appendChild(el);});
  $('stBtn').textContent=buttonText||'تابع';
  $('story').classList.add('on');paused=true;storyCb=typeof cb==='function'?cb:null;
}
$('stBtn').addEventListener('click',()=>{
  $('story').classList.remove('on');paused=false;
  const cb=storyCb;storyCb=null;if(cb)cb();
});
function finishCinematic(markSeen){
  const layer=$('cinematicIntro'),video=$('cinematicVideo');
  if(layer)layer.hidden=true;
  if(video){video.pause();try{video.currentTime=0;}catch(_){}}
  if(markSeen){save.cinematicSeen=true;persist();}
  if(!save.intro)playSlides(INTRO,0,()=>{save.intro=true;persist();});
  else paused=false;
}
function startOpeningSequence(){
  // Existing saves should still get the new movie once. A missing video does not mark it as seen.
  if(save.cinematicSeen)return;
  const layer=$('cinematicIntro'),video=$('cinematicVideo');
  if(!layer||!video){finishCinematic(false);return;}
  layer.hidden=false;paused=true;
  let completed=false;
  const fallback=markSeen=>{if(completed)return;completed=true;finishCinematic(markSeen);};
  video.addEventListener('error',()=>fallback(false),{once:true});
  video.addEventListener('ended',()=>fallback(true),{once:true});
  $('cinematicSkip').addEventListener('click',()=>fallback(true),{once:true});
  video.load();
  const attempt=video.play();
  if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{video.controls=true;});
  if(video.readyState>=2&&video.error)fallback(false);
}
function playSlides(list,i,done){
  const item=list[i];
  if(!item){if(done)done();return;}
  showStory(item[0],item[1],[item[2]],i===list.length-1?'ابدأ الرحلة':'التالي',()=>{
    if(i+1<list.length)playSlides(list,i+1,done);else if(done)done();
  });
}
function openCodex(){
  const box=$('cxList');box.replaceChildren();
  const add=(title,body,unlocked)=>{
    const page=document.createElement('div');page.className='page'+(unlocked?'':' lock');
    const h=document.createElement('h4'),p=document.createElement('p');
    h.textContent=unlocked?title:'صفحة مقفلة';p.textContent=unlocked?body:'اهزم الزعماء لفتح هذه الصفحة.';
    page.append(h,p);box.appendChild(page);
  };
  add('الحكاية',INTRO.map(x=>x[2]).join(' '),true);
  CODEX_BOSSES.forEach((b,i)=>add(b[0],b[1],(save.bosses||0)>i));
  add('ما بعد الأختام',ENDING.join(' '),(save.bosses||0)>=5);
  $('codex').classList.add('on');paused=true;
}
$('storyBtn').addEventListener('click',openCodex);

// Route Android/system Back to the current game screen instead of leaving the app.
function closeStoryView(){
  if(!$('story').classList.contains('on'))return false;
  $('story').classList.remove('on');storyCb=null;paused=false;last=performance.now();return true;
}
function closeCodexView(){
  if(!$('codex').classList.contains('on'))return false;
  $('codex').classList.remove('on');paused=false;last=performance.now();return true;
}
function handleGameBack(){
  if(!$('cinematicIntro').hidden){$('cinematicSkip').click();return true;}
  if(closeCodexView())return true;
  if(closeStoryView())return true;
  if($('pause').classList.contains('on')){closePause();return true;}
  if($('station').classList.contains('on')){toast('اختر ترقية للعودة إلى الرحلة');return true;}
  if($('missionsOverlay').classList.contains('on')){$('missionsOverlay').classList.remove('on');$('missionsOverlay').setAttribute('aria-hidden','true');return true;}
  if(state==='flight'&&!paused){openPause();return true;}
  if(state==='charge'){state='ready';show('hangar');return true;}
  if(state==='ready'){if(!$('hangar').classList.contains('on'))show('hangar');toast('أنت في القائمة الرئيسية');return true;}
  if(state==='result'){toReady();return true;}
  return true;
}
$('storyBack').addEventListener('click',closeStoryView);
$('cxBack').addEventListener('click',closeCodexView);
document.addEventListener('keydown',e=>{if(e.key==='Escape'||e.key==='Backspace'){e.preventDefault();handleGameBack();}});
window.history.pushState({slingWing:true},'',window.location.href);
window.addEventListener('popstate',()=>{handleGameBack();window.history.pushState({slingWing:true},'',window.location.href);});
function muteLabel(){
  const label=save.mute?'الصوت: متوقف':'الصوت: يعمل';
  $('muteBtn').textContent=label;$('pSound').textContent=label;
}
function toggleMute(){
  save.mute=!save.mute;persist();muteLabel();
  if(!save.mute){playSfx('ui-confirm');syncAudioState();}else syncAudioState();
}
$('muteBtn').addEventListener('click',toggleMute);
$('pSound').addEventListener('click',toggleMute);
function openPause(){
  if(state!=='flight'||paused)return;
  paused=true;fireHeld=false;down.clear();ptr.clear();keys.left=keys.right=false;
  muteLabel();$('pause').classList.add('on');
}
function closePause(){
  $('pause').classList.remove('on');paused=false;last=performance.now();
}
$('pauseBtn').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();openPause();});
$('pResume').addEventListener('click',closePause);
$('pEnd').addEventListener('click',()=>{closePause();endRun();});
$('cxClose').addEventListener('click',closeCodexView);
document.addEventListener('visibilitychange',()=>{if(document.hidden)openPause();});
function toReady(){
  state='ready';paused=false;resetRun();renderHangar();muteLabel();show('hangar');
  ['story','pause','codex','station'].forEach(id=>$(id).classList.remove('on'));
}
$('again').addEventListener('click',toReady);

/* ---------- input ---------- */
const startCharge=()=>{state='charge';power=0;powerDir=1;show('charge');beep(300,.05,'triangle');};
cv.addEventListener('pointerdown',e=>{
  e.preventDefault();
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  down.add(e.pointerId);ptr.set(e.pointerId,{x0:e.clientX,x:e.clientX});
  if(state==='ready')startCharge();
});
cv.addEventListener('pointermove',e=>{const p=ptr.get(e.pointerId);if(p)p.x=e.clientX;});
function up(e){
  down.delete(e.pointerId);ptr.delete(e.pointerId);
  if(state==='charge'&&down.size===0)launch();
}
cv.addEventListener('pointerup',up);
cv.addEventListener('pointercancel',up);
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!e.repeat){e.preventDefault();down.add('k');if(state==='ready')startCharge();}
  if(e.code==='KeyB')doBoost();
  if(e.code==='KeyF'||e.code==='KeyJ')fireHeld=true;
  if(e.code==='KeyR')doMissile();
  if(e.code==='KeyE')doAbility();
  if(e.code==='ArrowLeft'||e.code==='KeyA')keys.left=true;
  if(e.code==='ArrowRight'||e.code==='KeyD')keys.right=true;
});
window.addEventListener('keyup',e=>{
  if(e.code==='KeyF'||e.code==='KeyJ')fireHeld=false;
  if(e.code==='Space'){down.delete('k');if(state==='charge'&&down.size===0)launch();}
  if(e.code==='ArrowLeft'||e.code==='KeyA')keys.left=false;
  if(e.code==='ArrowRight'||e.code==='KeyD')keys.right=false;
});
$('boost').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();doBoost();});
const aimModeBtn=$('aimMode');
if(aimModeBtn)aimModeBtn.addEventListener('pointerdown',e=>e.stopPropagation());
if(aimModeBtn)aimModeBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!run)return;const modes=['smart','precision','spread'];run.aimMode=modes[(modes.indexOf(run.aimMode||'smart')+1)%modes.length];const labels={smart:'تتبع ذكي: الرصاص يلاحق الهدف',precision:'تصويب دقيق: قفل أضيق ومدى أبعد',spread:'انتشار: ثلاث طلقات متباعدة'};toast(labels[run.aimMode]);beep(run.aimMode==='spread'?360:run.aimMode==='precision'?760:560,.08,'triangle');});
const fireBtn=$('fire');
fireBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();try{fireBtn.setPointerCapture(e.pointerId);}catch(_){}fireHeld=true;});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>fireBtn.addEventListener(ev,e=>{e.stopPropagation();fireHeld=false;}));
window.addEventListener('blur',()=>{fireHeld=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)fireHeld=false;});
$('missile').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();doMissile();});
$('specialAbility').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();doAbility();});
const ABILITIES={
  trainer:{name:'درع',icon:'🛡'},
  interceptor:{name:'اندفاع',icon:'⚡'},
  phantom:{name:'وقود',icon:'⛽'},
  guardian:{name:'مدفع ثقيل',icon:'💥'},
};
function updateAbilityUI(){
  const key=save.model||'trainer',a=ABILITIES[key]||ABILITIES.trainer;
  $('abilityIcon').textContent=a.icon;$('abilityName').textContent=a.name;
  const cd=P&&Number.isFinite(P.abilityCooldown)?P.abilityCooldown:0;
  $('abilityCooldown').textContent=P&&P.magnetT>0?'مغناطيس '+Math.ceil(P.magnetT)+'ث':(P&&P.guardianOverdriveT>0?'مدفع ×2.5 '+Math.ceil(P.guardianOverdriveT)+'ث':(cd>0?Math.ceil(cd)+'ث':'جاهزة'));
  $('specialAbility').classList.toggle('cooldown',cd>0);
  $('specialAbility').classList.toggle('ready',cd<=0);
}
function doAbility(){
  if(state!=='flight'||paused||run.dead)return;
  if(P.abilityCooldown>0.01){toast('القدرة بعد '+Math.ceil(P.abilityCooldown)+' ث');return;}
  const key=save.model||'trainer';
  if(key==='phantom'&&P.fuel>=90){toast('الوقود شبه ممتلئ؛ احتفظ بقدرة الإمداد');return;}
  P.abilityCooldown=key==='guardian'?18:12;
  if(key==='trainer'){
    shieldT=Math.max(shieldT,2.4);shieldCooldown=Math.max(shieldCooldown,1.2);shieldMesh.visible=true;
    addFloat(P.x,P.alt+48,'درع الصقر!','#a7f4ff',P.z);playSfx('shield');
  }else if(key==='interceptor'){
    P.boostT=Math.max(P.boostT,2.25);addFloat(P.x,P.alt+48,'اندفاع فائق!','#ffe27a',P.z);shake=Math.max(shake,.18);beep(180,.24,'sawtooth',.04);
  }else if(key==='phantom'){
    P.fuel=Math.min(100,P.fuel+38);P.engineOut=P.fuel<=0;P.fuelWarned=false;updateFuelGauge();
    addFloat(P.x,P.alt+48,'الشبح: إمداد وقود +38٪','#baf6ff',P.z);playSfx('fuel-pickup');
  }else if(key==='guardian'){
    P.guardianOverdriveT=4;
    shieldT=Math.max(shieldT,3.5);shieldCooldown=Math.max(shieldCooldown,1.5);shieldMesh.visible=true;
    addFloat(P.x,P.alt+48,'الحارس: مدفع ثقيل ×2.5!','#ffe27a',P.z);playSfx('shield');shake=Math.max(shake,.28);
  }
  updateAbilityUI();
}
function findShotTarget(cone,maxRange=12000){
  let best=null,score=cone;
  for(const e of objs.enemies){if(e.hit)continue;const dx=e.x-P.x;if(dx<80||dx>maxRange)continue;const ey=(e.alt-P.alt)/dx,ez=(e.z-P.z)/dx,sc=ey*ey+ez*ez+(dx/maxRange)*0.018;if(sc<score){score=sc;best=e;}}
  return best;
}
function doShoot(){
  if(state!=='flight'||paused||run.dead||run.overheat)return;
  const mode=run.aimMode||'smart',f={x:Math.cos(P.a),y:Math.sin(P.a),z:0};
  const target=mode==='spread'?null:findShotTarget(mode==='precision'?0.16:0.72,mode==='precision'?16000:12000);
  const mx=P.x+f.x*70,my=P.alt+f.y*70,mz=P.z;let dx=f.x,dy=f.y,dz=f.z;
  if(target){dx=target.x-mx;dy=target.alt-my;dz=target.z-mz;const L=Math.hypot(dx,dy,dz)||1;dx/=L;dy/=L;dz/=L;}
  const offsets=mode==='spread'?[-0.18,0,0.18]:(run.tri?[-0.06,0,0.06]:[0]);
  for(const off of offsets){const mesh=new THREE.Mesh(shotGeo,shotMat);mesh.position.set(mx*S,Y(my),mz*S);scene.add(mesh);let vx=dx,vy=dy,vz=dz+off;const L=Math.hypot(vx,vy,vz)||1;vx/=L;vy/=L;vz/=L;const speed=1900;shots.push({x:mx,alt:my,z:mz,vx:vx*speed+P.s*Math.cos(P.a)*0.5,vy:vy*speed+P.s*Math.sin(P.a)*0.5,vz:vz*speed+P.vz*0.5,damage:10*run.damage*(P.guardianOverdriveT>0?2.5:1),life:target?clamp((target.x-mx)/speed+0.8,2,7):1.9,mesh,target:target||null,aimMode:mode});}
  if(run.fireSfxTimer<=0){playSfx('weapon-fire',0.56);run.fireSfxTimer=0.07;}
}
function missileTarget(){
  // Use the same forward-cone acquisition as the Claude backup's target lock.
  // This prevents missiles from snapping to a nearer enemy far outside the aiming cone.
  return findShotTarget(0.42,14500);
}
function updateTargetLock(){
  const el=$('targetLock');
  if(!el)return;
  if(state!=='flight'||paused||run.dead){el.hidden=true;return;}
  const aimMode=run.aimMode||'smart';
  const target=aimMode==='spread'?null:findShotTarget(aimMode==='precision'?0.16:0.72,aimMode==='precision'?16000:12000);
  if(!target){el.hidden=true;return;}
  _v.set(target.x*S,Y(target.alt),target.z*S).project(camera);
  // Hide the reticle when the target is behind the camera or outside the viewport.
  if(_v.z>1||_v.z<-1||_v.x < -1.05||_v.x > 1.05||_v.y < -1.05||_v.y > 1.05){
    el.hidden=true;return;
  }
  el.hidden=false;
  el.classList.toggle('boss-lock',!!target.boss);
  const label=$('targetLockLabel');
  if(label)label.textContent=(target.boss?(target.bossName||'زعيم'):'هدف معادٍ')+' · '+(aimMode==='precision'?'تصويب دقيق':aimMode==='spread'?'نمط انتشار':'تتبع ذكي');
  el.style.transform='translate('+((_v.x*0.5+0.5)*W)+'px,'+((-_v.y*0.5+0.5)*Hh)+'px) translate(-50%,-50%)';
}

function triggerBossDestruction(e){
  const finalBoss=!!(e&&e.bossStage>=5);
  const overlay=$('bossBlastOverlay');
  if(overlay){overlay.classList.remove('on','final');void overlay.offsetWidth;overlay.classList.add('on');if(finalBoss)overlay.classList.add('final');}
  const colors=finalBoss?[0xff365f,0xffb347,0x72f6ff,0xf6e8ff]:[0xff9b4a,0xffdf79,0xff5d42];
  const count=finalBoss?96:52;
  for(let n=0;n<count;n++){
    const angle=Math.random()*Math.PI*2,speed=(finalBoss?180:125)+Math.random()*(finalBoss?420:270);
    addPart(e.x,e.alt,Math.cos(angle)*speed+(Math.random()-.5)*100,Math.sin(angle)*speed+(Math.random()-.5)*100,finalBoss?0.95+Math.random()*0.65:0.62+Math.random()*0.42,colors[n%colors.length],finalBoss?5+Math.random()*8:3+Math.random()*5,e.z,(Math.random()-.5)*(finalBoss?520:300));
  }
  for(let i=0;i<(finalBoss?4:2);i++){
    const mat=new THREE.MeshBasicMaterial({color:colors[i%colors.length],transparent:true,opacity:0.88,side:THREE.DoubleSide,depthWrite:false});
    const mesh=new THREE.Mesh(new THREE.TorusGeometry(7+i*3,finalBoss?0.7:0.48,8,36),mat);
    mesh.position.set(e.x*S,Y(e.alt),e.z*S);mesh.rotation.x=Math.PI/2;scene.add(mesh);
    const life=(finalBoss?1.05:0.72)+i*0.08;bossBlastRings.push({mesh,life,maxLife:life,maxScale:(finalBoss?8.5:5.2)+i*1.3});
  }
  shake=Math.max(shake,finalBoss?0.92:0.48);
  addFloat(e.x,e.alt+(finalBoss?150:95),finalBoss?'انهيار عرش العاصفة!':'انفجار الزعيم!','#ffe27a',e.z);
}
function defeatBoss(e,source){
  if(!e||e.hit)return;
  e.hit=true;e.mesh.visible=false;run.bossBattle=false;run.bosses++;
  save.bosses=Math.max(0,Number(save.bosses)||0)+1;persist();
  const reward=150*(1+save.lv.coin);run.coins+=reward;
  addFloat(e.x,e.alt+95,(source==='missile'?'إسقاط صاروخي — هُزم الزعيم! +':'هُزم الزعيم! +')+reward,'#ffe27a',e.z);
  if(run.bosses>=5)playSfx('victory-stinger');else playSfx('boss-defeat');
  triggerBossDestruction(e);
  objs.enemyShots.forEach(b=>scene.remove(b.mesh));objs.enemyShots.length=0;
  const discoveries=[
    ['سجل الوادي','السجل أقدم من العاصفة','يجد الطيار سجلًا يثبت أن أبراج السيطرة بُنيت قبل الكارثة بسنوات.'],
    ['قلب العاصفة','الرياح تُستنزف','تكشف البيانات أن القاذفة تجمع طاقة التيارات وتحولها إلى سلاح بدل أن تصنع العاصفة.'],
    ['ممر التيارات','إشارة خفية','تشير ذاكرة الزعيم إلى أن الأختام الخمسة متصلة بمصدر واحد في القلعة العائمة.'],
    ['رسالة الجد','ثمن التحرير','يحذر الجد من أن كسر الأختام سيحرر الرياح، لكنه قد يزيل الحاجز الذي يمنع العاصفة القديمة من العودة.'],
    ['الختم الخامس','الحقيقة بعد التعطيل','يعترف الحاكم أن الأختام نظام احتواء، لكن تعطيل الختم الأخير وحده سيكشف الحقيقة كاملة.']
  ];
  const chapter=Math.min(4,Math.max(0,run.bosses-1));
  playSlides([[discoveries[chapter][0],discoveries[chapter][1],discoveries[chapter][2]]],0,()=>{
    if(run.bosses>=5&&!save.campaignEndingSeen){
      playSlides(FINAL_REVEAL,0,()=>{save.campaignEndingSeen=true;persist();endRun();});
    }
  });
}
function doMissile(){
  if(state!=='flight'||paused||run.dead)return;
  if(missileCooldown>0){toast('الصاروخ يعاد تجهيزه');return;}
  if(run.missiles<=0){toast('نفدت الصواريخ؛ ابحث عن محطة تطوير');beep(160,.1,'square');return;}
  const target=missileTarget();
  if(!target){toast('لا يوجد هدف أمامك الآن');return;}
  const mesh=new THREE.Mesh(missileGeo,missileMat);mesh.position.set((P.x+24)*S,Y(P.alt),P.z*S);scene.add(mesh);
  missiles.push({x:P.x+24,alt:P.alt,z:P.z,vx:Math.max(850,P.s+650),vy:0,vz:0,life:4.2,smoke:0,target,mesh});
  run.missiles--;missileCooldown=0.7;playSfx('missile-launch');toast('صاروخ موجّه!');
}
function updateFuelGauge(){
  const p=clamp(P&&Number.isFinite(P.fuel)?P.fuel:100,0,100);
  const arc=$('fuelArc'),num=$('fuelPercent'),g=$('fuelGauge');
  if(arc)arc.style.strokeDashoffset=String(182.2*(1-p/100));
  if(num)num.textContent=Math.ceil(p)+'%';
  if(g){g.classList.toggle('low',p<=20&&p>0);g.classList.toggle('empty',p<=0);g.classList.toggle('launching',!!(P&&P.launchT>0));}
}
function steerInput(){
  let v=0;
  const first=ptr.values().next().value;
  if(first){v=(first.x-first.x0)/(W*0.2);}
  if(keys.left)v-=1;if(keys.right)v+=1;
  v=clamp(v,-1,1);
  return Math.abs(v)<0.1?0:v;
}
function doBoost(){
  if(state!=='flight'||paused||run.dead||P.boostT>0.2)return;
  if(save.fuel<=0){toast('لا يوجد وقود');beep(160,.12,'square');return;}
  save.fuel--;P.boostT=(1.6+save.lv.plane*0.08)*aircraft().boost;beep(180,.4,'sawtooth',0.04);shake=Math.max(shake,0.15);
}
function launch(){
  const lv=save.lv.sling;
  const perfect=power>=0.88;
  let s=(560+110*lv)*(0.4+0.6*power);
  const pull=power*80;
  P.x=-pull*Math.cos(0.62);P.alt=110+power*70+(perfect?55:0);P.z=0;P.vz=0;
  P.fuel=100;P.launchT=1.65;P.engineOut=false;P.fuelWarned=false;
  // The slingshot gives the aircraft a strong automatic climb before handing control to the pilot.
  s*=perfect?1.32:1.12;
  if(perfect){addFloat(P.x+60,P.alt+60,'إطلاق ذهبي بكامل القوة!','#ffe27a',0);run.perfectLaunch=true;run.coins+=25*(1+save.lv.coin);playSfx('ui-confirm');}
  else{addFloat(P.x+50,P.alt+45,'إقلاع قوي!','#baf6ff',0);}
  P.s=s;P.a=0.76;
  state='flight';
  playSfx('launch');shake=0.25;
  $('bFuel').textContent=save.fuel;
  $('tapHint').textContent='الإقلاع الآلي جارٍ… بعدها اسحب يمينًا ويسارًا وواصل الضغط للصعود';
  $('tapHint').style.opacity=1;
  updateFuelGauge();updateAbilityUI();
  show('hud');
}

/* ---------- update ---------- */
function updateFlight(dt){
  run.fireCd=Math.max(0,run.fireCd-dt);
  run.fireSfxTimer-=dt;
  P.hitCooldown=Math.max(0,(P.hitCooldown||0)-dt);P.damageFlash=Math.max(0,(P.damageFlash||0)-dt);
  const canFire=fireHeld&&!run.overheat;
  if(canFire&&run.fireCd<=0){
    doShoot();
    run.fireCd=1/(8*run.rate*(run.firePower||1));
    run.heat+=5.5;
    if(run.heat>=100){run.heat=100;run.overheat=true;toast('سخن المدفع!');beep(140,.3,'square',.05);}
  }
  if(!canFire){
    run.heat=Math.max(0,run.heat-(run.overheat?30:38)*run.cool*dt);
    if(run.overheat&&run.heat<35)run.overheat=false;
  }
  P.abilityCooldown=Math.max(0,P.abilityCooldown-dt);
  P.magnetT=Math.max(0,P.magnetT-dt);
  P.guardianOverdriveT=Math.max(0,(P.guardianOverdriveT||0)-dt);
  const holding=down.size>0;
  const lvP=save.lv.plane;
  const wasFueled=P.fuel>0;
  if(wasFueled){const tankEfficiency=1+save.lv.plane*0.14;const bossFuelFactor=objs.enemies.some(e=>e.boss&&!e.hit)?0.38:1;P.fuel=Math.max(0,P.fuel-dt*(100/48)*(aircraft().fuelUse||1)/tankEfficiency*(P.boostT>0?1.55:1)*bossFuelFactor);}
  if(P.fuel<=0&&!P.engineOut){P.engineOut=true;P.fuelWarned=true;toast('نفد الوقود! الطائرة تدخل الهبوط الاضطراري');addFloat(P.x,P.alt+58,'نفد الوقود — هبوط اضطراري','#ff8d7e',P.z);beep(170,.28,'sawtooth',0.05);shake=Math.max(shake,0.18);}
  if(P.fuel>0&&P.fuel<20&&!P.fuelWarned){P.fuelWarned=true;toast('تنبيه: الوقود أقل من 20٪');beep(340,.1,'square');}
  const maxPitch=clamp((P.s-130)/320,0,0.62);
  let target=P.launchT>0?0.78:(P.engineOut?-0.72:(holding?Math.min(0.55,maxPitch):-0.6));
  if(P.s<160&&!P.sliding)target=-0.8;
  if(!P.sliding)P.a+=(target-P.a)*Math.min(1,dt*(P.launchT>0?1.5:3.2));
  const K=0.00022*(1-0.09*lvP)/aircraft().speed;
  let ds=-G*Math.sin(P.a)-K*P.s*P.s;
  if(P.fuel>0)ds+=145*aircraft().speed;
  if(P.launchT>0){ds+=330;P.launchT=Math.max(0,P.launchT-dt);}
  if(P.boostT>0){
    ds+=620;P.boostT-=dt;
    addPart(P.x-60*Math.cos(P.a),P.alt-60*Math.sin(P.a),-140-Math.random()*80,(Math.random()-0.5)*60,0.35,Math.random()<.5?0xffb23d:0xff5a2a,5+Math.random()*4,P.z);
  }
  if(P.sliding){ds=-380;P.a=0;}
  P.s+=ds*dt;
  P.s*=1+(aircraft().speed-1)*dt*0.18;
  shieldCooldown=Math.max(0,shieldCooldown-dt);
  shieldT=Math.max(0,shieldT-dt);
  shieldMesh.visible=shieldT>0;
  if(shieldMesh.visible)shieldMesh.material.opacity=0.45+Math.sin(time*22)*0.2;
  if(P.alt>0&&!P.sliding)P.s=Math.max(P.s,105);
  // steering
  const steer=(P.sliding||P.launchT>0)?0:steerInput();
  P.vz+=(steer*330-P.vz)*Math.min(1,dt*4);
  P.z=clamp(P.z+P.vz*dt,-340,340);
  if(Math.abs(P.z)>=340)P.vz*=0.5;
  P.roll+=(steer*0.65-P.roll)*Math.min(1,dt*5);
  P.yaw+=((-clamp(P.vz/Math.max(P.s,200),-0.5,0.5))-P.yaw)*Math.min(1,dt*6);
  // updrafts
  let lift=0;
  for(const d of objs.drafts){
    const dx=P.x-d.x,dz=P.z-d.z;
    if(dx*dx+dz*dz<d.R*d.R&&P.alt<900)lift=240;
  }
  const bossArena=objs.enemies.some(e=>e.boss&&!e.hit);
  P.x+=P.s*Math.cos(P.a)*dt*(bossArena?0.14:1);
  P.alt+=(P.s*Math.sin(P.a)+lift)*dt;
  P.spin+=dt*(20+P.s*0.03);
  if(P.alt>run.maxAlt)run.maxAlt=P.alt;
  // ground
  if(P.alt<=0){
    P.alt=0;
    if(!P.sliding){
      const vy=P.s*Math.sin(P.a);
      if(vy<-8){
        if(P.s>300){
          P.a=0.3;P.s*=0.72;P.bounces++;shake=0.3;beep(120,.15,'square',0.05);
          for(let i=0;i<10;i++)addPart(P.x,-22,60+Math.random()*120,40+Math.random()*90,0.6,0xc9a36a,4+Math.random()*4,P.z);
        }else{P.sliding=true;P.a=0;}
      }
    }
    if(P.sliding){
      if(Math.random()<0.5)addPart(P.x-20,-22,-40,30+Math.random()*40,0.5,0xc9a36a,3+Math.random()*3,P.z);
      if(P.s<25){endRun();return;}
    }
  }
  // The next service station gently aligns the flight path, but never takes control for long.
  const station=objs.stations.find(s=>!s.claimed&&s.x>=P.x-80&&s.x<P.x+2200);
  if(station){const dx=station.x-P.x;if(dx>0&&dx<1600){P.vz+=(clamp((station.z-P.z)*1.7,-260,260)-P.vz)*Math.min(1,dt*0.65);P.alt+=(station.alt-P.alt)*Math.min(1,dt*0.28);}}
  for(const s of objs.stations){if(s.claimed)continue;s.mesh.userData.beacon.scale.setScalar(1+Math.sin(time*5+s.x)*0.16);s.mesh.userData.ring.rotation.z=time*0.8;const dx=s.x-P.x,dy=s.alt-P.alt,dz=s.z-P.z;if(Math.abs(dx)<78&&dy*dy+dz*dz<s.R*s.R){s.claimed=true;openStation(s);return;}if(dx<-500){s.claimed=true;s.mesh.visible=false;}}
  // storms: entering the vortex produces turbulence, altitude loss, and a short boost lockout.
  for(const st of objs.storms){st.phase+=dt;st.mesh.rotation.y=Math.sin(st.phase)*0.28;st.mesh.userData.rings.forEach((ring,i)=>{ring.rotation.z=st.phase*(i%2?-1:1)*(0.7+i*0.12);});st.hitCd=Math.max(0,st.hitCd-dt);const dx=st.x-P.x,dy=st.alt-P.alt,dz=st.z-P.z;if(dx*dx+dy*dy+dz*dz<st.R*st.R&&st.hitCd<=0){st.hitCd=2.4;P.s*=0.78;P.vz+=Math.sign(P.z-st.z||1)*(120+Math.random()*100);P.alt=Math.max(20,P.alt-45);P.boostT=Math.min(P.boostT,0.15);shake=Math.max(shake,0.42);run.stormHits++;addFloat(P.x,P.alt+55,'اضطراب جوي!','#c7b7ff',P.z);beep(145,.22,'sawtooth',0.045);for(let n=0;n<12;n++)addPart(P.x,P.alt,(Math.random()-.5)*200,(Math.random()-.5)*180,0.45,0x9c7bff,3,P.z);}}
  // pickups
  const mult=1+save.lv.coin;
  for(const c of objs.coins){
    if(!c.on)continue;
    if(P.magnetT>0&&c.x>=P.x&&c.x-P.x<360&&Math.abs(c.alt-P.alt)<300&&Math.abs(c.z-P.z)<300){
      const pull=Math.min(1,dt*4.5);c.alt+=(P.alt-c.alt)*pull;c.z+=(P.z-c.z)*pull;c.mesh.position.y=Y(c.alt);c.mesh.position.z=c.z*S;
    }
    const dx=c.x-P.x,dy=c.alt-P.alt,dz=c.z-P.z;
    const pickupRange=P.magnetT>0?125:50;
    if(Math.abs(dx)<(P.magnetT>0?155:50)&&dy*dy+dz*dz<pickupRange*pickupRange){
      c.on=false;c.mesh.visible=false;run.coins+=5*mult;run.picked++;
      playSfx('coin',0.72);
      for(let i=0;i<5;i++)addPart(c.x,c.alt,(Math.random()-.5)*180,(Math.random()-.5)*180,0.35,0xffd84a,3,c.z);
    }
  }
  for(const r of objs.rings){
    if(!r.on)continue;
    const dx=r.x-P.x,dy=r.alt-P.alt,dz=r.z-P.z;
    if(Math.abs(dx)<30&&dy*dy+dz*dz<r.R*r.R){
      r.on=false;r.mesh.visible=false;P.s+=220;shake=0.2;
      run.gateCombo++;run.gates++;run.bestCombo=Math.max(run.bestCombo,run.gateCombo);
      const gateReward=10*run.gateCombo*(1+save.lv.coin);run.coins+=gateReward;
      addFloat(r.x,r.alt+40,'بوابة +'+gateReward+' · سلسلة ×'+run.gateCombo,'#fff3a8',r.z);beep(520+Math.min(run.gateCombo,8)*45,.2,'sawtooth',0.04);
      for(let i=0;i<14;i++)addPart(r.x,r.alt,(Math.random()-.5)*260,(Math.random()-.5)*260,0.45,0xfff3a8,3,r.z);
    }else if(P.x>r.x+45){
      r.on=false;r.mesh.visible=false;
      if(run.gateCombo>0){run.gateCombo=0;toast('انتهت السلسلة — استهدف البوابة التالية!');}
    }
  }
  for(const f of objs.fuels){
    if(!f.on)continue;
    const dx=f.x-P.x,dy=f.alt-P.alt,dz=f.z-P.z;
    if(dx*dx+dy*dy+dz*dz<54*54){f.on=false;f.mesh.visible=false;P.fuel=Math.min(100,P.fuel+24);P.fuelWarned=false;addFloat(f.x,f.alt+40,'+24٪ وقود','#baf6ff',f.z);playSfx('fuel-pickup');updateFuelGauge();}
  }
  for(const b of objs.birds){
    b.x+=b.vx*dt;b.t+=dt*9;
    if(b.hit){b.alt-=180*dt;continue;}
    const dx=b.x-P.x,dy=b.alt-P.alt,dz=b.z-P.z;
    if(dx*dx+dy*dy+dz*dz<46*46){
      b.hit=true;
      if(shieldCooldown<=0){activateShield(b.x,b.alt,b.z);}
      else{P.s*=0.62;P.a=Math.min(P.a,-0.2);shake=0.5;addFloat(P.x,P.alt+50,'اصطدام!','#ff8a7a');beep(110,.25,'square',0.06);}
      for(let i=0;i<14;i++)addPart(b.x,b.alt,(Math.random()-.5)*300,(Math.random()-.5)*300,0.6,0xf2f2f2,3,b.z);
    }
  }
  for(const e of objs.enemies){
    if(e.hit)continue;
    e.phase+=dt*(e.boss?1.55:2.1);
    if(e.boss){
      const ratio=e.hp/e.maxHp;
      const nextPhase=ratio<=0.28?3:ratio<=0.62?2:1;
      if(e.combatPhase!==nextPhase){
        e.combatPhase=nextPhase;
        const phaseName=nextPhase===3?'المرحلة الأخيرة — هجوم شامل':nextPhase===2?'المرحلة الثانية — أسلحة معززة':'المرحلة الأولى — اشتباك جوي';
        addFloat(e.x,e.alt+120,phaseName,nextPhase===3?'#ff507d':'#ffc06b',e.z);
        toast(phaseName);shake=Math.max(shake,nextPhase===3?0.28:0.14);
      }
      if(e.attackState==='ranged'){
        const duelX=P.x+760+Math.sin(e.phase*0.42)*(e.bossStage===1?155:125);
        const lateralTarget=clamp(P.z+Math.sin(e.phase*(e.bossStage===1?1.12:0.85))*(e.bossStage===1?175:135),-300,300);
        e.x+=(duelX-e.x)*Math.min(1,dt*(e.bossStage===1?1.28:1.15));
        e.alt=clamp(e.alt+(clamp(P.alt+Math.sin(e.phase*(e.bossStage===1?0.92:0.7))*(e.bossStage===1?125:105),130,640)-e.alt)*Math.min(1,dt*(e.bossStage===1?0.86:0.72)),110,660);
        e.z=zc(e.z+(lateralTarget-e.z)*Math.min(1,dt*(e.bossStage===1?1.55:1.35)));
        if(e.bossStage===1)e.bank=clamp((lateralTarget-e.z)*0.0022,-0.34,0.34);
        e.attackTimer-=dt;
        if(e.attackTimer<=0&&e.x>P.x+430){e.attackState='warning';e.diveWarning=1.55;e.diveTargetAlt=P.alt;e.diveTargetZ=P.z;addFloat(e.x,e.alt+95,'تحذير أحمر: انقضاض وشيك!','#ff648e',e.z);playSfx('boss-warning',0.68);e.attackTimer=0;}
      }else if(e.attackState==='warning'){
        const duelX=P.x+740+Math.sin(e.phase*.42)*(e.bossStage===1?125:100);
        e.x+=(duelX-e.x)*Math.min(1,dt*1.1);e.alt+=(P.alt+Math.sin(e.phase)*60-e.alt)*Math.min(1,dt*.5);e.z+=(P.z-e.z)*Math.min(1,dt*.65);if(e.bossStage===1)e.bank=clamp((P.z-e.z)*0.002,-0.3,0.3);
        e.diveWarning-=dt;
        if(e.diveWarning<=0){e.attackState='dive';e.diveTimer=.78;e.contactHit=false;addFloat(e.x,e.alt+85,'انقضاض! غيّر مسارك الآن','#ff3d78',e.z);beep(150,.28,'sawtooth',.055);shake=Math.max(shake,.16);}
      }else if(e.attackState==='dive'){
        e.x+=(P.x+48-e.x)*Math.min(1,dt*(e.bossStage===1?4.0:3.6));
        e.alt+=(e.diveTargetAlt-e.alt)*Math.min(1,dt*(e.bossStage===1?3.0:2.6));
        e.z+=(e.diveTargetZ-e.z)*Math.min(1,dt*(e.bossStage===1?3.1:2.8));
        if(e.bossStage===1)e.bank=clamp((e.diveTargetZ-e.z)*0.002,-0.38,0.38);
        e.mesh.rotation.z=Math.sin(e.phase*1.8)*.3;e.mesh.rotation.x=-.16;
        e.diveTimer-=dt;
        if(e.diveTimer<=0){e.attackState='retreat';e.fireT=1.2;}
      }else{
        const retreatX=P.x+760+Math.sin(e.phase*.42)*100;
        e.x+=(retreatX-e.x)*Math.min(1,dt*2.5);
        e.alt+=(P.alt+Math.sin(e.phase*.7)*100-e.alt)*Math.min(1,dt*.7);
        e.z+=(P.z+Math.sin(e.phase*.85)*110-e.z)*Math.min(1,dt*1.2);
        if(e.x>P.x+480){e.attackState='ranged';e.attackTimer=(e.bossStage===1?4.2:5)+Math.random()*1.6;e.fireT=e.bossStage===1?1.1:1.8;e.bank=0;}
      }
      if(e.attackState!=='dive'){e.mesh.rotation.z=Math.sin(e.phase*.9)*.12;e.mesh.rotation.x=Math.sin(e.phase*.7)*.08;}
    }else{e.x-=180*dt;e.z=zc(e.z+Math.sin(e.phase)*14*dt);}
    e.fireT-=dt;
    if(e.fireT<=0&&e.x>P.x+180&&e.x<P.x+(e.boss?1900:4200)&&(!e.boss||e.attackState==='ranged')){
      if(e.boss){
        const phase=e.combatPhase||1,stageIndex=Math.max(0,(e.bossStage||1)-1);
        const styles=[
          {cycle:4,color:0xffc857,label:'النسر الحديدي',speed:1420},
          {cycle:3,color:0xff8b36,label:'قاذفة العاصفة',speed:940},
          {cycle:4,color:0xff5ed2,label:'أفعى التيارات',speed:1050},
          {cycle:4,color:0x6eeaff,label:'حارس السحاب',speed:1320},
          {cycle:phase===3?6:4,color:0xff365f,label:'الحاكم الرمادي',speed:1450}
        ];
        if(stageIndex===0){
          // Iron Eagle: paired wing cannons, guided missile, burst fire, and flak fan.
          const pattern=e.weaponCycle++%4;
          const count=pattern===0?2:pattern===1?1:pattern===2?5:7;
          const label=pattern===0?'مدفعان جناحيان':pattern===1?'صاروخ النسر الموجّه':pattern===2?'رشقة مدفعية متتابعة':'مروحة شظايا مضادة';
          const speed=pattern===0?1480:pattern===1?900:pattern===2?1190:990;
          const color=pattern===3?0xff8b36:0xffc857;
          e.fireT=(pattern===1?4.4:pattern===0?2.1:pattern===2?2.65:3.15)*(phase===3?0.78:phase===2?0.9:1);
          for(let k=0;k<count;k++){
            const offset=k-(count-1)/2;
            const originZ=e.z+(pattern===0?offset*68:pattern===2?offset*20:pattern===3?offset*26:0);
            const originAlt=e.alt+(pattern===2?offset*7:pattern===3?offset*10:0);
            const geometry=pattern===1?bossLanceGeo:pattern===3?bossPulseGeo:enemyShotGeo;
            const mesh=new THREE.Mesh(geometry,bossWeaponMaterials[0]);
            mesh.position.set((e.x-8)*S,Y(originAlt),originZ*S);scene.add(mesh);
            const spread=pattern===3?offset*46:pattern===2?offset*20:0;
            const tx=(P.x+(pattern===1?Math.min(90,P.s*0.12):0))-(e.x-8);
            const ty=P.alt-originAlt+spread*0.35;
            const tz=P.z-originZ+spread;
            const length=Math.hypot(tx,ty,tz)||1;
            objs.enemyShots.push({x:e.x-8,alt:originAlt,z:originZ,vx:tx/length*speed,vy:ty/length*speed,vz:tz/length*speed,life:4.2,mesh,bossShot:true,bossWeapon:label,damage:pattern===1?14:pattern===3?7:9,ironEagleSeeker:pattern===1,seekerSpeed:speed});
          }
          e.lastWeaponLabel=label;
          addFloat(e.x,e.alt+48,label,'#'+color.toString(16).padStart(6,'0'),e.z);
        }else{
          const style=styles[stageIndex]||styles[0],pattern=e.weaponCycle++%(style.cycle+(stageIndex===4&&phase===3?2:0)),finalBoss=stageIndex===4;
        const aimed=stageIndex===0?pattern===1:stageIndex===1?pattern===2:stageIndex===2?pattern===1||pattern===3:stageIndex===3?pattern===0||pattern===3:pattern===1||pattern===4;
        const radial=stageIndex===2?pattern===0:stageIndex===3?pattern===2:stageIndex===4?(pattern===3||pattern===5):pattern===3;
        const pulse=stageIndex===1||radial||(finalBoss&&pattern===0);
        const count=stageIndex===0?(pattern===0?5:pattern===2?3:pattern===3?7:1):stageIndex===1?(pattern===0?3:pattern===1?5:2):stageIndex===2?(pattern===0?8:pattern===2?5:pattern===3?7:1):stageIndex===3?(pattern===0?2:pattern===1?6:pattern===2?8:pattern===3?3:1):pattern===4?3:pattern===5?9:pattern===3?7:pattern===0?5:aimed?1:6;
        e.fireT=(stageIndex===1?2.5:stageIndex===2?2.15:finalBoss&&phase===3?1.45:2.0)+(count>5?.28:0);
        const projectileMat=bossWeaponMaterials[stageIndex];
        const weaponLabel=stageIndex===0?(pattern===1?'مدفع قنّاص النسر':pattern===2?'رشقة الجناحين':'رشقة النسر الحديدي'):stageIndex===1?(pattern===0?'قنابل العاصفة الثقيلة':pattern===1?'وابل القاذفة':'انفجار حمولة العاصفة'):stageIndex===2?(pattern===0?'لولب أفعى التيارات':pattern===1?'لدغة الطاقة':'حلقة التيارات'):stageIndex===3?(pattern===0?'شفرتا السحاب':pattern===1?'مروحة الرياح':pattern===2?'دوامة السحاب':'رمح البرق'):pattern===4?'ثلاثي مدافع العرش':pattern===5?'عاصفة المقذوفات':pattern===3?'انفجار شعاعي':pattern===0?'وابل البلازما':'مدفع الطاقة الموجّه';
        for(let k=0;k<count;k++){
          const offset=k-(count-1)/2,useLance=aimed&&stageIndex!==1,geo=useLance?bossLanceGeo:(pulse?bossPulseGeo:enemyShotGeo);
          const mesh=new THREE.Mesh(geo,projectileMat);mesh.position.set(e.x*S,Y(e.alt),e.z*S);scene.add(mesh);
          const spread=stageIndex===2?(radial?52:38):stageIndex===1?28:stageIndex===3?44:stageIndex===4?50:32;
          const tx=P.x-e.x,ty=P.alt-e.alt+(aimed?offset*(stageIndex===4?34:stageIndex===3?25:14):offset*(radial?spread:pattern===0?30:spread)),tz=P.z-e.z+(aimed?offset*(stageIndex===4?42:stageIndex===3?32:20):offset*(radial?spread:pattern===0?44:spread)),L=Math.hypot(tx,ty,tz)||1;
          const spd=(stageIndex===1?900:style.speed)*(phase===3?1.12:phase===2?1.05:1);
          objs.enemyShots.push({x:e.x,alt:e.alt,z:e.z,vx:tx/L*spd,vy:ty/L*spd,vz:tz/L*spd,life:3.8,mesh,bossShot:true,bossWeapon:weaponLabel,damage:[9,11,13,15,18][stageIndex]});
        }
        e.lastWeaponLabel=weaponLabel;addFloat(e.x,e.alt+48,weaponLabel,'#'+style.color.toString(16).padStart(6,'0'),e.z);
        }
      }else{
        e.fireT=Math.max(0.75,1.65-save.lv.plane*0.06);
        const mesh=new THREE.Mesh(enemyShotGeo,enemyShotMat);mesh.position.set(e.x*S,Y(e.alt),e.z*S);scene.add(mesh);
        const tx=P.x-e.x,ty=P.alt-e.alt,tz=P.z-e.z,L=Math.hypot(tx,ty,tz)||1,spd=950+P.s*.45;
        objs.enemyShots.push({x:e.x,alt:e.alt,z:e.z,vx:tx/L*spd,vy:ty/L*spd,vz:tz/L*spd,life:2.7,mesh,bossShot:false});
      }
    }
    const dx=e.x-P.x,dy=e.alt-P.alt,dz=e.z-P.z;
    if(dx*dx+dy*dy+dz*dz<(e.boss?(e.bossStage>=5?118*118:92*92):48*48)&&(!e.boss||!e.contactHit)){
      if(e.boss)e.contactHit=true;else{e.hit=true;e.mesh.visible=false;}
      if(shieldT>0||shieldCooldown<=0)activateShield(e.x,e.alt,e.z);
      else{damagePlayer(e.boss?[16,20,24,28,32][Math.max(0,(e.bossStage||1)-1)]:8,e.x,e.alt,e.z,e.boss?'boss':'enemy');P.alt=Math.max(25,P.alt-(e.boss?55:35));beep(120,.18,'square',0.05);}
    }
  }
  for(let i=objs.enemyShots.length-1;i>=0;i--){
    const b=objs.enemyShots[i];
    if(b.ironEagleSeeker){const tx=P.x-b.x,ty=P.alt-b.alt,tz=P.z-b.z,L=Math.hypot(tx,ty,tz)||1,k=Math.min(1,dt*0.72),speed=b.seekerSpeed||900;b.vx=lerp(b.vx,tx/L*speed,k);b.vy=lerp(b.vy,ty/L*speed,k);b.vz=lerp(b.vz,tz/L*speed,k);}
    b.x+=b.vx*dt;b.alt+=(b.vy||0)*dt;b.z+=(b.vz||0)*dt;b.life-=dt;b.mesh.position.set(b.x*S,Y(b.alt),b.z*S);
    if(Math.abs(b.x-P.x)<34&&Math.abs(b.alt-P.alt)<32&&Math.abs(b.z-P.z)<40){
      if(shieldT>0||shieldCooldown<=0)activateShield(b.x,b.alt,b.z);
      else{const stageIndex=Math.max(0,Math.min(4,(objs.enemies.find(e=>e.boss&&!e.hit)?.bossStage||1)-1));damagePlayer(b.bossShot?(b.damage||[9,11,13,15,18][stageIndex]):6,b.x,b.alt,b.z,b.bossShot?'boss':'enemy');P.alt=Math.max(20,P.alt-(b.bossShot?24:12));}
      b.life=0;
    }
    if(b.life<=0){scene.remove(b.mesh);objs.enemyShots.splice(i,1);}
  }
  for(let i=shots.length-1;i>=0;i--){
    const shot=shots[i];
    if(shot.target&&!shot.target.hit&&(shot.aimMode==='smart'||shot.aimMode==='precision')){const tx=shot.target.x-shot.x,ty=shot.target.alt-shot.alt,tz=shot.target.z-shot.z,L=Math.hypot(tx,ty,tz)||1,steer=Math.min(1,dt*(shot.aimMode==='precision'?4.2:2.25));shot.vx=lerp(shot.vx,tx/L*1900,steer);shot.vy=lerp(shot.vy,ty/L*1900,steer);shot.vz=lerp(shot.vz,tz/L*1900,steer);}else if(shot.target&&shot.target.hit)shot.target=null;
    shot.x+=shot.vx*dt;shot.alt+=(shot.vy||0)*dt;shot.z+=(shot.vz||0)*dt;shot.life-=dt;
    shot.mesh.position.set(shot.x*S,Y(shot.alt),shot.z*S);
    let hit=false;
    for(const b of objs.birds){
      if(b.hit)continue;
      if(Math.abs(b.x-shot.x)<28&&Math.abs(b.alt-shot.alt)<32&&Math.abs(b.z-shot.z)<36){
        b.hit=true;hit=true;addFloat(b.x,b.alt+35,'إصابة!','#8cf5ff',b.z);beep(980,.08,'triangle',0.035);
        for(let n=0;n<5;n++)addPart(b.x,b.alt,(Math.random()-.5)*120,(Math.random()-.5)*120,0.25,0x7ff5ff,2.5,b.z);
        break;
      }
    }
    if(!hit){for(const e of objs.enemies){
      if(e.hit)continue;
      const hr=e.boss?(e.hitRadiusX||(e.bossStage>=5?118:82)):38;
      const hitY=e.boss?(e.hitRadiusY||(e.bossStage>=5?94:72)):40;
      const hitZ=e.boss?(e.hitRadiusZ||(e.bossStage>=5?108:80)):45;
      if(Math.abs(e.x-shot.x)<hr&&Math.abs(e.alt-shot.alt)<hitY&&Math.abs(e.z-shot.z)<hitZ){
        hit=true;
        if(e.boss){
          e.hp-=Math.max(1,(shot.damage||10)/10);playSfx('boss-hit',0.7);shake=Math.max(shake,0.08);
          if(e.hp<=0)defeatBoss(e,'cannon');
          else{addFloat(e.x,e.alt+70,'طاقة الزعيم '+Math.ceil(e.hp)+'/'+e.maxHp,'#ffb2a6',e.z);}
        }else{
          e.hit=true;e.mesh.visible=false;run.coins+=18*(1+save.lv.coin);
          addFloat(e.x,e.alt+45,'طائرة معادية +18','#ffe27a',e.z);playSfx('laser',0.7);playSfx('explosion',0.58);shake=Math.max(shake,0.12);
          for(let n=0;n<10;n++)addPart(e.x,e.alt,(Math.random()-.5)*180,(Math.random()-.5)*180,0.35,0xff9b4a,3,e.z);
        }
        break;
      }
    }}
    if(hit||shot.life<=0){scene.remove(shot.mesh);shots.splice(i,1);}
  }
  missileCooldown=Math.max(0,missileCooldown-dt);
  for(let i=missiles.length-1;i>=0;i--){
    const m=missiles[i];m.life-=dt;
    if(!m.target||m.target.hit||m.target.x<P.x-20){m.target=missileTarget();}
    if(m.target){const dx=m.target.x-m.x,dy=m.target.alt-m.alt,dz=m.target.z-m.z,L=Math.hypot(dx,dy,dz)||1,spd=1550,k=Math.min(1,dt*3.6);m.vx=lerp(m.vx,dx/L*spd,k);m.vy=lerp(m.vy,dy/L*spd,k);m.vz=lerp(m.vz,dz/L*spd,k);}
    m.x+=m.vx*dt;m.alt+=m.vy*dt;m.z+=m.vz*dt;m.smoke-=dt;
    if(m.smoke<=0){addPart(m.x,m.alt,0,0,0.34,0xb9c4d4,4,m.z,0);m.smoke=0.045;}
    const v=new THREE.Vector3(m.vx,m.vy,m.vz);m.mesh.position.set(m.x*S,Y(m.alt),m.z*S);m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),v.normalize());
    let hit=m.life<=0||m.alt<0,impacted=false;
    if(!hit){for(const e of objs.enemies){if(e.hit)continue;const dx=e.x-m.x,dy=e.alt-m.alt,dz=e.z-m.z;if(dx*dx+dy*dy+dz*dz<(e.boss?(e.bossStage===1?138:e.bossStage>=5?148:125):70)**2){hit=true;impacted=true;if(e.boss){e.hp=Math.max(0,e.hp-26);playSfx('boss-hit',0.78);addFloat(e.x,e.alt+70,'صاروخ أصاب الزعيم! طاقة '+Math.ceil(e.hp)+'/'+e.maxHp,'#ffe27a',e.z);if(e.hp<=0)defeatBoss(e,'missile');} else{e.hit=true;e.mesh.visible=false;run.coins+=18*(1+save.lv.coin);addFloat(e.x,e.alt+45,'إسقاط صاروخي +18','#ffe27a',e.z);}for(let n=0;n<24;n++)addPart(e.x,e.alt,(Math.random()-.5)*300,(Math.random()-.5)*240,0.55,0xff9b4a,4,e.z);shake=Math.max(shake,0.3);break;}}}
    if(hit){if(impacted){playSfx('missile-impact');playSfx('explosion',0.72);}scene.remove(m.mesh);missiles.splice(i,1);}
  }
}

function update(dt){
  time+=dt;
  if(state==='charge'){
    power+=powerDir*dt*1.25;
    if(power>=1){power=1;powerDir=-1;}
    if(power<=0){power=0;powerDir=1;}
    $('mFill').style.width=(power*100)+'%';
    const pull=power*80;
    P.x=-pull*Math.cos(0.62);P.alt=85-pull*Math.sin(0.62);
  }
  if(state==='flight'){spawn(P.x+VIEW_AHEAD);updateFlight(dt);}
  if(state==='ready'||state==='charge')P.spin+=dt*10;
  // particles
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];p.life-=dt;
    if(p.life<=0){p.mesh.visible=false;parts.splice(i,1);continue;}
    p.x+=p.vx*dt;p.alt+=p.vy*dt;p.z+=p.vz*dt;
  }
  for(let i=bossBlastRings.length-1;i>=0;i--){
    const b=bossBlastRings[i];b.life-=dt;
    const progress=clamp(1-b.life/b.maxLife,0,1);
    b.mesh.scale.setScalar(0.35+progress*b.maxScale);b.mesh.material.opacity=0.88*(1-progress);
    if(b.life<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();bossBlastRings.splice(i,1);}
  }
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;if(f.t>1.1){f.el.remove();floats.splice(i,1);}}
  // cull
  if(state==='flight'&&((time*4|0)%8===0)){
    const lim=P.x-800;
    const keep=o=>{if(o.x<lim&&o.mesh)objGroup.remove(o.mesh);return o.x>=lim;};
    objs.coins=objs.coins.filter(keep);objs.rings=objs.rings.filter(keep);
    objs.birds=objs.birds.filter(keep);objs.enemies=objs.enemies.filter(o=>{if(o.boss&&!o.hit)return true;if(o.x<lim){objGroup.remove(o.mesh);return false;}return true;});objs.fuels=objs.fuels.filter(keep);objs.drafts=objs.drafts.filter(keep);
    objs.storms=objs.storms.filter(o=>{if(o.x<lim){objGroup.remove(o.mesh);return false;}return true;});objs.stations=objs.stations.filter(o=>{if(o.x<lim){objGroup.remove(o.mesh);return false;}return true;});
  }
  shake=Math.max(0,shake-dt);
  // hud
  if(state==='flight'){
    const m=Math.max(0,Math.floor(P.x*M_PER_PX));
    if($('dist').dataset.v!==String(m)){$('dist').dataset.v=m;$('dist').innerHTML=m+'<small>م</small>';}
    $('rCoins').textContent=run.coins;
    updatePlayerHealthUI();
    const comboHud=$('comboHud');if(comboHud){comboHud.classList.toggle('on',run.gateCombo>0);comboHud.classList.toggle('hot',run.gateCombo>=5);comboHud.classList.toggle('ultra',run.gateCombo>=10);$('comboValue').textContent='×'+run.gateCombo;const label=$('comboLabel');if(label)label.textContent=run.gateCombo>=10?'أسطوري · LEGENDARY':run.gateCombo>=5?'سلسلة نارية · ON FIRE':'سلسلة البوابات';}
    const activeBoss=objs.enemies.find(e=>e.boss&&!e.hit);
    const bossHud=$('bossHud');if(bossHud){bossHud.classList.toggle('on',!!activeBoss);if(activeBoss){
      $('bossHp').style.width=(activeBoss.hp/activeBoss.maxHp*100)+'%';
      $('bossHealthText').textContent=Math.ceil(activeBoss.hp)+' / '+activeBoss.maxHp;
      const bossTitle=$('bossTitle');if(bossTitle)bossTitle.textContent=activeBoss.bossName||'زعيم السماء';
      const phaseText=$('bossPhaseText'),weaponText=$('bossWeaponText');
      if(phaseText)phaseText.textContent='المرحلة '+(activeBoss.combatPhase||1)+' من 3';
      if(weaponText)weaponText.textContent=activeBoss.attackState==='warning'?'يحضّر للانقضاض':activeBoss.attackState==='dive'?'هجوم انقضاضي':activeBoss.lastWeaponLabel||'اشتباك جوي';
    }}
    const bossWarning=$('bossWarning');if(bossWarning){const warning=!!activeBoss&&(activeBoss.attackState==='warning'||activeBoss.attackState==='dive');bossWarning.classList.toggle('on',warning);bossWarning.classList.toggle('dive',!!activeBoss&&activeBoss.attackState==='dive');if(warning){$('bossWarningText').textContent=activeBoss.attackState==='warning'?'تحذير: انقضاض خلال '+Math.max(1,Math.ceil(activeBoss.diveWarning))+'…':'انقضاض! انحرف الآن';}}
    $('alt').textContent='الارتفاع '+Math.floor(P.alt/10)+' م';
    $('boost').classList.toggle('off',save.fuel<=0||P.boostT>0.2);
    $('bFuel').textContent=save.fuel;
    $('missileCount').textContent=run.missiles;
    const aimBtn=$('aimMode');if(aimBtn){const modes={smart:'تتبع ذكي',precision:'تصويب دقيق',spread:'انتشار'};aimBtn.textContent=modes[run.aimMode||'smart'];aimBtn.setAttribute('aria-label','نمط إطلاق النار: '+modes[run.aimMode||'smart']+'، اضغط للتغيير');aimBtn.classList.toggle('active',run.aimMode==='smart');}
    $('missile').classList.toggle('off',run.missiles<=0||missileCooldown>0);
    const heatFill=$('heatFill'),heatBox=$('heat');
    if(heatFill)heatFill.style.width=Math.round(run.heat)+'%';
    if(heatBox){heatBox.classList.toggle('hot',run.heat>=65);heatBox.classList.toggle('overheat',run.overheat);}
    $('fire').classList.toggle('off',run.overheat);
    updateFuelGauge();updateAbilityUI();
    if(P.launchT<=0&&$('tapHint').textContent.indexOf('الإقلاع الآلي')===0){$('tapHint').textContent='اضغط مطولًا للصعود واترك للانقضاض. اسحب يمينًا أو يسارًا للتوجيه';}
    if(m>10)$('tapHint').style.opacity=0;
  }
}
const VIEW_AHEAD=14000;

function updatePlayerHealthUI(){
  const el=$('playerHealth');if(!el||!P)return;
  const hp=clamp(Number.isFinite(P.hp)?P.hp:100,0,100),fill=$('playerHealthFill'),label=$('playerHealthText');
  if(fill)fill.style.width=hp+'%';if(label)label.textContent=Math.ceil(hp)+'%';
  el.classList.toggle('low',hp<=35&&hp>0);el.classList.toggle('critical',hp<=18&&hp>0);el.classList.toggle('hit',!!(P.damageFlash&&P.damageFlash>0));el.setAttribute('aria-valuenow',String(Math.ceil(hp)));
}
function damagePlayer(amount,x,alt,z,source){
  if(!P||state!=='flight'||run.dead||P.hitCooldown>0)return false;
  if(shieldT>0){shake=Math.max(shake,.12);playSfx('shield');for(let n=0;n<8;n++)addPart(x===undefined?P.x:x,alt===undefined?P.alt:alt,(Math.random()-.5)*150,(Math.random()-.5)*150,.28,0x7ff5ff,3,z===undefined?P.z:z);return false;}
  if(shieldCooldown<=0){activateShield(x===undefined?P.x:x,alt===undefined?P.alt:alt,z===undefined?P.z:z);return false;}
  P.hp=Math.max(0,(Number.isFinite(P.hp)?P.hp:100)-amount);P.hitCooldown=.48;P.damageFlash=.28;shake=Math.max(shake,source==='boss'?.34:.22);P.s*=source==='boss'?.84:.92;
  addFloat(P.x,P.alt+42,P.hp<=0?'تعطّل نظام الطائرة!':'-'+amount+' صحة',P.hp<=25?'#ff455f':'#ff9b91',P.z);
  for(let n=0;n<(source==='boss'?15:8);n++)addPart(P.x,P.alt,(Math.random()-.5)*160,(Math.random()-.5)*140,.32,source==='boss'?0xff526e:0xff9b4a,3+Math.random()*2,P.z);
  updatePlayerHealthUI();if(P.hp<=0){run.dead=true;addFloat(P.x,P.alt+90,'فشل نظام الطائرة','#ff455f',P.z);endRun();}return true;
}
function activateShield(x,alt,z){
  shieldT=1.15;
  shieldCooldown=Math.max(3.8,aircraft().shield-save.lv.plane*0.38-(save.model==='guardian'?1.1:0));
  shake=Math.max(shake,0.12);playSfx('shield');
  addFloat(x,alt+48,'الدرع التلقائي!','#8cf5ff',z);
  for(let i=0;i<12;i++)addPart(x,alt,(Math.random()-.5)*220,(Math.random()-.5)*220,0.35,0x7ff5ff,3,z);
}
const enemyShotGeo=new THREE.SphereGeometry(1.6,8,6),enemyShotMat=new THREE.MeshBasicMaterial({color:0xff635f}),enemyShotBossMat=new THREE.MeshBasicMaterial({color:0xffb04a,emissive:0x8a2d00});
const bossWeaponMaterials=[0xffc857,0xff8b36,0xff5ed2,0x6eeaff,0xff365f].map(color=>new THREE.MeshBasicMaterial({color}));
function openStation(station){
  paused=true;fireHeld=false;down.clear();ptr.clear();keys.left=keys.right=false;run.stationCount++;
  const root=$('stationPerks');root.replaceChildren();
  const pool=[
    {id:'repair',icon:'🛠️',title:'إصلاح شامل',desc:'استعادة الوقود والحماية المؤقتة',tags:['guardian','lowhp'],weight:3,apply:()=>{P.fuel=100;P.engineOut=false;P.fuelWarned=false;shieldT=Math.max(shieldT,3.2);updateFuelGauge();}},
    {id:'missiles',icon:'🚀',title:'صواريخ إضافية',desc:'إضافة 3 صواريخ وإعادة شحن المخزن',tags:['phantom','lowammo'],weight:3,apply:()=>{run.missiles=Math.min(9,run.missiles+3);}},
    {id:'rapid',icon:'⚡',title:'مدفع سريع',desc:'زيادة سرعة إطلاق النار 35٪',tags:['interceptor','cannon'],weight:3,apply:()=>{run.firePower=Math.min(2.2,(run.firePower||1)+0.35);run.perks.push('rapid');}},
    {id:'triple',icon:'🔫',title:'مدفع ثلاثي',desc:'إطلاق ثلاث رصاصات في كل دفعة',tags:['interceptor','cannon'],weight:2,valid:()=>!run.tri,apply:()=>{run.tri=true;run.perks.push('triple');}},
    {id:'cool',icon:'❄️',title:'مبرد المدفع',desc:'تبريد أسرع وتقليل السخونة',tags:['interceptor','cannon'],weight:2,apply:()=>{run.cool=Math.min(2.5,run.cool*1.5);run.perks.push('cool');}},
    {id:'explosive',icon:'💥',title:'رؤوس متفجرة',desc:'زيادة الضرر 40٪',tags:['guardian','heavy'],weight:2,apply:()=>{run.damage=Math.min(2.8,run.damage*1.4);run.perks.push('explosive');}},
    {id:'armor',icon:'🛡️',title:'درع متقدم',desc:'درع مؤقت وإعادة تجهيز الدرع التلقائي',tags:['guardian','lowhp'],weight:3,apply:()=>{shieldT=Math.max(shieldT,5);shieldCooldown=0;run.stationShield=5;run.perks.push('armor');}},
    {id:'magnet',icon:'🧲',title:'مغناطيس العملات',desc:'جذب العملات لمدة 14 ثانية',tags:['phantom'],weight:2,apply:()=>{P.magnetT=Math.max(P.magnetT,14);run.perks.push('magnet');}},
    {id:'coins',icon:'🪙',title:'مكافأة التموين',desc:'الحصول على 90 عملة إضافية',tags:['surprise'],weight:1,apply:()=>{run.coins+=90*(1+save.lv.coin);run.perks.push('coins');}},
    {id:'cluster',icon:'☄️',title:'صواريخ عنقودية',desc:'ترقية تطورية: صواريخ ذكية ورؤوس متفجرة',tags:['phantom','guardian'],weight:4,valid:()=>run.perks.includes('explosive')&&!run.perks.includes('cluster'),apply:()=>{run.damage=Math.min(3.5,run.damage*1.2);run.perks.push('cluster');}}
  ];
  const plane=save.model||'trainer',hpRatio=(P.maxHp?P.hp/P.maxHp:1),ammoRatio=run.missiles/9;
  const boss=Math.max(0,Number(run.bosses)||0),rarity=boss>=4?'أسطوري':boss>=2?'نادر':'عادي';
  const available=pool.filter(p=>!p.valid||p.valid()).map(p=>{let w=p.weight;
    if(p.tags.includes(plane))w*=2.8;
    if(p.tags.includes('cannon')&&(Number(save.lv.cannon)||0)>=2)w*=2;
    if(p.tags.includes('lowhp')&&hpRatio<0.55)w*=4;
    if(p.tags.includes('lowammo')&&ammoRatio<0.4)w*=4;
    if(p.tags.includes('surprise'))w*=1.5;
    if(P.fuel<30&&p.id==='repair')w*=2.5;
    if(p.id==='cluster'&&rarity!=='عادي')w*=1.5;
    return {...p,weight:w,synergy:p.tags.includes(plane)||p.tags.includes('cannon')&&(Number(save.lv.cannon)||0)>=2,weakness:(hpRatio<0.55&&p.tags.includes('lowhp'))||(ammoRatio<0.4&&p.tags.includes('lowammo'))||P.fuel<30&&p.id==='repair'};
  });
  const pickWeighted=list=>{if(!list.length)return null;let total=list.reduce((n,p)=>n+p.weight,0),r=Math.random()*total;for(const p of list){r-=p.weight;if(r<=0)return p;}return list[list.length-1];};
  const chosen=[];
  const synergy=available.filter(p=>p.synergy),weak=available.filter(p=>p.weakness);
  const first=pickWeighted(synergy.length?synergy:available);if(first)chosen.push(first);
  const second=pickWeighted(weak.filter(p=>!chosen.includes(p)).length?weak.filter(p=>!chosen.includes(p)):available.filter(p=>!chosen.includes(p)));if(second)chosen.push(second);
  while(chosen.length<3){const rest=available.filter(p=>!chosen.includes(p));const next=pickWeighted(rest.length?rest:pool.filter(p=>!chosen.some(q=>q.id===p.id)));if(!next)break;chosen.push(next);}
  while(chosen.length<3){const fallback=pool.find(p=>!chosen.some(q=>q.id===p.id));if(!fallback)break;chosen.push(fallback);}
  $('stationTitle').textContent='مركز التطوير · '+String(run.stationCount).padStart(2,'0');
  $('stationDesc').textContent='اختر ترقية واحدة؛ التوزيع يتكيف مع طائرتك وحالة الرحلة. الندرة: '+rarity;
  chosen.slice(0,3).forEach((p,i)=>{const b=document.createElement('button');b.className='perk rarity-'+(rarity==='أسطوري'?'legendary':rarity==='نادر'?'rare':'common');b.type='button';b.setAttribute('aria-label',p.title+' — '+p.desc);b.innerHTML='<span class="perk-icon">'+p.icon+'</span><span class="perk-copy"><b>'+p.title+'</b><small>'+p.desc+'</small>'+(p.synergy?'<small class="perk-synergy">مناسبة لطائرتك</small>':'')+'</span><span class="perk-index">0'+(i+1)+'</span>';b.addEventListener('click',()=>{p.apply();station.mesh.visible=false;paused=false;last=performance.now();$('station').classList.remove('on');toast('تم تطبيق: '+p.title);addFloat(P.x,P.alt+65,'ترقية مكتملة','#8cf5ff',P.z);beep(740,.1,'triangle');beep(980,.13,'triangle');});root.appendChild(b);});
  $('station').classList.add('on');updateFuelGauge();
}

function endRun(){
  paused=false;$('station').classList.remove('on');
  state='result';
  const m=Math.max(0,Math.floor(P.x*M_PER_PX));
  const mult=1+save.lv.coin;
  const bonus=Math.floor(m/4)*mult;
  const total=run.coins+bonus;
  const dailyResult=updateDailyMissions(m);
  save.coins+=total+dailyResult.reward;
  const rec=m>save.best;
  if(rec)save.best=m;
  persist();
  $('rDist').textContent=m;$('rPick').textContent=run.coins;$('rBonus').textContent=bonus;$('rDaily').textContent=dailyResult.reward;$('rTotal').textContent=total+dailyResult.reward;
  $('rGates').textContent=run.gates;$('rCombo').textContent='×'+run.bestCombo;$('rBosses').textContent=run.bosses;$('rAltitude').textContent=Math.floor(run.maxAlt/10);
  $('rRec').style.display=rec&&m>0?'inline-block':'none';
  show('result');
  if(dailyResult.completed.length)toast('اكتملت مهمة يومية! +'+dailyResult.reward+' عملة');
  beep(440,.15,'triangle');beep(660,.2,'triangle');
}

/* ---------- render ---------- */
const SKY=[['#4fc3ff','#d9f4ff'],['#ff7e5f','#ffd9a8'],['#0b1245','#3b3a8c'],['#ff8fb0','#ffe3b0']];
const BIOMES=[
  {name:'وادي النسر الحديدي',mountain:0x596a72,leaf:0x365b4a,trunk:0x5e4936,cactus:0x426c59},
  {name:'سماء العاصفة',mountain:0x424d6c,leaf:0x3e6570,trunk:0x48465b,cactus:0x3f5b70},
  {name:'ممر التيارات الميتة',mountain:0x625066,leaf:0x4d6558,trunk:0x51404b,cactus:0x65566d},
  {name:'قمة الصمت',mountain:0x9db7cf,leaf:0xd9e7ef,trunk:0x657b8e,cactus:0x8ca5b8},
  {name:'عرش الرياح',mountain:0x494954,leaf:0x515d68,trunk:0x3c3b46,cactus:0x5b514c}
];
let activeBiome=-1;
function applyBiome(m){
  const index=biomeStageAtMeters(m)%BIOMES.length;
  if(index===activeBiome)return;
  activeBiome=index;
  const b=BIOMES[index];
  ground.material.map=groundMaps[index];ground.material.needsUpdate=true;
  mtMat.color.setHex(b.mountain);leafMat.color.setHex(b.leaf);trunkMat.color.setHex(b.trunk);
  cactusMat.color.setHex(b.cactus);
  trees.forEach(t=>{t.visible=index!==1;});
  cacti.forEach(c=>{c.visible=index===1;});
  $('biomeBadge').textContent=b.name;
}
const hexRGB=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const mixC=(a,b,t)=>{const A=hexRGB(a),B=hexRGB(b);return 'rgb('+A.map((v,i)=>Math.round(lerp(v,B[i],t))).join(',')+')';};
const ease=t=>t*t*(3-2*t);
let lastBg='';
const fogCol=new THREE.Color(),cDay=new THREE.Color(0xffffff),cNight=new THREE.Color(0x5d5fa0),cTmp=new THREE.Color();
const hemiDay=new THREE.Color(0xffffff),hemiNight=new THREE.Color(0x7a85d0),sunDay=new THREE.Color(0xffffff),sunDusk=new THREE.Color(0xffb27a);
function updateSky(){
  const m=Math.max(0,P.x*M_PER_PX);
  applyBiome(m);
  const cyc=(m/250)%4,i=Math.floor(cyc),f=ease(cyc-i);
  const a=SKY[i],b=SKY[(i+1)%4];
  const top=mixC(a[0],b[0],f),bot=mixC(a[1],b[1],f);
  const bg='linear-gradient('+top+','+bot+' 58%)';
  if(bg!==lastBg){app.style.background=bg;lastBg=bg;}
  fogCol.set(bot);scene.fog.color.copy(fogCol);
  night=i===1?f:i===2?1:i===3?1-f:0;
  const dusk=(i===1||i===3)?1:0;
  hemi.intensity=lerp(0.95,0.5,night);
  hemi.color.copy(hemiDay).lerp(hemiNight,night);
  sunL.intensity=lerp(0.8,0.25,night);
  sunL.color.copy(sunDay).lerp(sunDusk,dusk*0.6);
  starMat.opacity=clamp((night-0.3)/0.7,0,1);
  cloudMat.color.copy(cDay).lerp(cNight,night*0.8);
  sunMat.color.set(night>0.6?0xf6f1d6:(dusk?0xffb27a:0xfff4b8));
}
function placeScenery(px){
  // mountains
  let n0=Math.floor(px/MT_SP)-3;
  for(let i=0;i<MT_N;i++){
    const n=n0+(((i-n0)%MT_N)+MT_N)%MT_N;
    const m=mts[i],sg=H(n,1)>0.5?1:-1;
    const r=50+H(n,3)*60,h=40+H(n,4)*90;
    m.position.set(n*MT_SP,h/2,sg*(190+H(n,2)*330));m.scale.set(r,h,r);m.rotation.y=H(n,5)*3;
  }
  n0=Math.floor(px/TR_SP)-4;
  for(let i=0;i<TR_N;i++){
    const n=n0+(((i-n0)%TR_N)+TR_N)%TR_N;
    const t=trees[i],sg=H(n,6)>0.5?1:-1,sc=0.8+H(n,8)*0.8;
    t.position.set(n*TR_SP+H(n,9)*10,0,sg*(42+H(n,7)*90));t.scale.setScalar(sc);
  }
  n0=Math.floor(px/65)-3;
  for(let i=0;i<CACTUS_N;i++){
    const n=n0+(((i-n0)%CACTUS_N)+CACTUS_N)%CACTUS_N;
    const c=cacti[i],sg=H(n,16)>0.5?1:-1,sc=0.75+H(n,18)*0.9;
    c.position.set(n*65+H(n,19)*18,0,sg*(50+H(n,17)*105));c.scale.setScalar(sc);
  }
  n0=Math.floor(px/CL_SP)-3;
  for(let i=0;i<CL_N;i++){
    const n=n0+(((i-n0)%CL_N)+CL_N)%CL_N;
    const c=clouds[i];
    c.position.set(n*CL_SP,50+H(n,10)*120,(H(n,11)-0.5)*700);c.scale.setScalar(5+H(n,12)*9);
  }
  n0=Math.floor(px/SG_SP)-1;
  for(let i=0;i<SG_N;i++){
    const n=n0+(((i-n0)%SG_N)+SG_N)%SG_N;
    const s=signs[i];
    s.g.visible=n>=1;
    if(n>=1){s.g.position.set(n*SG_SP,0,-44);setSign(s,(n*50)+'م');}
  }
  // ground follows the plane, snapped to the texture tile
  ground.position.set(Math.floor(px/32)*32,0,Math.floor(P.z*S/32)*32);
}
function updateRoute(m){
  while(m>=routeTargetMeters){
    routeTargetMeters+=500;
    if(state==='flight'){const reward=35*(1+save.lv.coin);run.coins+=reward;addFloat(P.x,P.alt+55,'وصلت للهدف! +'+reward,'#8cf5ff',P.z);beep(720,.12,'triangle',0.035);}
  }
  const px=P.x*S;
  for(let i=0;i<routeSegments.length;i++){
    const x=px+35+i*52,segment=routeSegments[i];
    segment.position.set(x,0,routeCurve(x));
  }
  const targetX=routeTargetMeters*4;
  destination.position.set(targetX,0,routeCurve(targetX));
  const remaining=Math.max(0,Math.ceil(routeTargetMeters-m));
  const progress=Math.max(0,Math.min(100,Math.floor((1-remaining/500)*100)));
  $('routeRemaining').textContent=remaining;
  $('routeProgressFill').style.width=progress+'%';
  $('routeProgressText').textContent=progress+'%';
}
const camPos=new THREE.Vector3(),camLook=new THREE.Vector3(),tP=new THREE.Vector3(),tL=new THREE.Vector3(),_v=new THREE.Vector3();
let curFov=62;
function updateCamera(dt){
  if(state==='flight'||state==='result'){
    const px=P.x*S,py=Y(P.alt),pz=P.z*S;
    tP.set(px-24,Math.max(py*0.9+6.5,7.5),pz*0.7);
    tL.set(px+28,py*0.85+1,pz*0.9);
  }else{
    tP.set(-32,13.5,23);tL.set(1,10,0);
  }
  if(snapCam){camPos.copy(tP);camLook.copy(tL);snapCam=false;}
  else{const k=Math.min(1,dt*(state==='flight'?6:3));camPos.lerp(tP,k);camLook.lerp(tL,k);}
  const sh=shake*1.4;
  camera.position.set(camPos.x+(Math.random()-.5)*sh,camPos.y+(Math.random()-.5)*sh,camPos.z+(Math.random()-.5)*sh);
  camera.lookAt(camLook);
  const tf=baseFov+(state==='flight'?clamp((P.s-500)/70,0,14)+(P.boostT>0?6:0):0);
  curFov=lerp(curFov,tf,Math.min(1,dt*3));
  if(Math.abs(camera.fov-curFov)>0.05){camera.fov=curFov;camera.updateProjectionMatrix();}
}
function render(dt){
  applyPlaneColors();
  updateSky();
  placeScenery(P.x*S);
  updateRoute(Math.max(0,P.x*M_PER_PX));
  // plane
  planeG.position.set(P.x*S,Y(P.alt),P.z*S);
  const healthEl=$('playerHealth');
  if(healthEl){if(state==='flight'){_v.set(P.x*S,Y(P.alt+52),P.z*S).project(camera);const onScreen=_v.z>-1&&_v.z<1&&_v.x>-1.08&&_v.x<1.08&&_v.y>-1.08&&_v.y<1.08;healthEl.style.display=onScreen?'flex':'none';if(onScreen){healthEl.style.left=((_v.x*.5+.5)*W)+'px';healthEl.style.top=((-_v.y*.5+.5)*Hh)+'px';}}else healthEl.style.display='none';}
  planeG.rotation.set(P.roll,P.yaw,P.a);
  prop.rotation.x=P.spin;
  flame.visible=P.boostT>0;if(flame.visible)flame.scale.set(0.8+Math.random()*0.5,1,1);
  // shadow
  const k=clamp(1-P.alt/900,0.2,1);
  shadow.position.set(P.x*S,0.12,P.z*S);shadow.scale.set(6*k,1,3.4*k);shadowMat.opacity=0.32*k;
  // slingshot bands
  const showBand=(state==='ready'||state==='charge');
  bandL.visible=bandR.visible=showBand;
  if(showBand){
    _v.set(P.x*S-4*Math.cos(0.62),Y(P.alt)-4*Math.sin(0.62),0);
    setCyl(bandL,forkL,_v);setCyl(bandR,forkR,_v);
  }
  // objects
  for(const c of objs.coins)if(c.on)c.mesh.rotation.y=time*3+c.x*0.01;
  for(const f of objs.fuels)if(f.on){f.mesh.rotation.y=time*1.5;f.mesh.position.y=Y(f.alt)+Math.sin(time*3)*0.4;}
  for(const r of objs.rings)if(r.on)r.mesh.rotation.x=time*0.8;
  for(const e of objs.enemies){
    e.mesh.position.set(e.x*S,Y(e.alt),e.z*S);
    if(e.mesh.userData.energyRings)e.mesh.userData.energyRings.forEach((ring,i)=>{ring.rotation.z=time*(i?1.8:-1.25);});
    e.mesh.visible=!e.hit;
    e.mesh.rotation.z=e.boss?(e.bossStage===1?clamp(e.bank||0,-0.36,0.36):Math.sin(e.phase*0.9)*0.13):Math.sin(e.phase)*0.06;
    e.mesh.rotation.x=e.boss?(e.bossStage===1&&e.attackState==='dive'?-0.2:Math.sin(e.phase*0.7)*0.08):0;
  }
  for(const b of objs.enemyShots){b.mesh.position.set(b.x*S,Y(b.alt),b.z*S);}
  for(const b of objs.birds){
    b.mesh.position.set(b.x*S,Y(b.alt),b.z*S);
    const w=Math.sin(b.t)*0.9,ws=b.mesh.userData.wings;
    ws[0].rotation.x=w;ws[1].rotation.x=-w;
    if(b.hit)b.mesh.rotation.z+=dt*8;
  }
  for(const d of objs.drafts){
    d.mesh.userData.rings.forEach((t,i)=>{t.position.y=((time*14+i*30)%90);});
  }
  // particles
  for(const p of parts){
    const r=p.r*S*clamp(p.life/p.max,0,1)*1.2;
    p.mesh.position.set(p.x*S,Y(p.alt),p.z*S);p.mesh.scale.setScalar(Math.max(r,0.01));
  }
  // floating texts
  for(const f of floats){
    _v.set(f.x*S,Y(f.alt),f.z*S).project(camera);
    if(_v.z>1||_v.z<-1){f.el.style.opacity=0;continue;}
    const sx=(_v.x*0.5+0.5)*W,sy=(-_v.y*0.5+0.5)*Hh-f.t*50;
    f.el.style.opacity=clamp(1.1-f.t,0,1);
    f.el.style.transform='translate('+sx+'px,'+sy+'px) translate(-50%,-50%)';
  }
  // sky bodies follow camera
  stars.position.copy(camera.position);
  sun.position.set(camera.position.x+1000,camera.position.y+240-night*0,camera.position.z-260);
  updateCamera(dt);
  updateTargetLock();
  renderer.render(scene,camera);
}

/* ---------- loop ---------- */
let last=performance.now();
function frame(t){
  const dt=Math.min(0.033,(t-last)/1000);last=t;
  if(!paused)update(dt);
  syncAudioState();
  render(paused?0:dt);
  requestAnimationFrame(frame);
}
toReady();
requestAnimationFrame(frame);
startOpeningSequence();
})();
