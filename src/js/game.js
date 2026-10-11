(function(){
'use strict';
const $=id=>document.getElementById(id);
function fail(msg){document.getElementById('app').innerHTML='<p style="padding:28px;font:800 20px Cairo,sans-serif;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.4)">'+msg+'</p>';}
if(typeof THREE==='undefined'){fail('تعذّر تحميل محرك الثلاثي الأبعاد. تحقق من الاتصال ثم أعد التحميل.');return;}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const MAXLV=6, M_PER_PX=1/40, S=0.1, YOFF=2.6;
const Y=alt=>alt*S+YOFF;
const H=(n,k)=>{const s=Math.sin(n*12.9898+k*78.233)*43758.5453;return s-Math.floor(s);};

/* ---------- save ---------- */
const KEY='sling_wing_v1';
let save={coins:200,fuel:1,best:0,lv:{sling:0,plane:0,coin:0}};
try{
  const s=JSON.parse(localStorage.getItem(KEY)||'null');
  if(s){save=Object.assign(save,s);save.lv=Object.assign({sling:0,plane:0,coin:0},s.lv||{});}
}catch(e){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(save));}catch(e){}}
const cost=l=>Math.round(90*Math.pow(1.7,l));

/* ---------- audio ---------- */
let AC;
function beep(f,d,type,v){
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(),g=AC.createGain();
    o.type=type||'sine';o.frequency.value=f;g.gain.value=v||0.05;
    o.connect(g);g.connect(AC.destination);o.start();
    g.gain.exponentialRampToValueAtTime(0.0001,AC.currentTime+(d||0.08));
    o.stop(AC.currentTime+(d||0.08));
  }catch(e){}
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
const PAL=[[0x8bd13a,0x5a9a1c],[0xff6a4a,0xc2381f],[0x4aa8ff,0x2476c9],[0xffc83d,0xd18a00],[0xb46bff,0x7a35c9],[0xf4f4f4,0x2b2b36]];
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
scene.add(planeG);
let appliedLv=-1;
function applyPlaneColors(){
  const l=Math.min(save.lv.plane,PAL.length-1);if(l===appliedLv)return;appliedLv=l;
  bodyMat.color.setHex(PAL[l][0]);accMat.color.setHex(PAL[l][1]);
}

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

/* ---------- state ---------- */
let state='ready';
let routeTargetMeters=500;
let P,run,objs,shake=0,time=0,power=0,powerDir=1,night=0,snapCam=true;
const down=new Set(),ptr=new Map(),keys={left:false,right:false};
const parts=[],floats=[];
const G=560;

function clearObjs(){while(objGroup.children.length)objGroup.remove(objGroup.children[0]);}
function resetRun(){
  P={x:0,alt:85,z:0,vz:0,s:0,a:0.62,roll:0,yaw:0,boostT:0,spin:0,sliding:false,bounces:0};
  routeTargetMeters=500;
  run={coins:0,picked:0,maxAlt:0};
  objs={coins:[],rings:[],birds:[],fuels:[],drafts:[],next:600};
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
function spawn(until){
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
function renderHangar(upgradedKey){
  $('hCoins').textContent=save.coins;
  $('hFuel').textContent=save.fuel;
  $('best').textContent=save.best>0?('أفضل مسافة: '+save.best+' م'):'';
  const box=$('cards');box.innerHTML='';
  ['sling','plane','coin'].forEach(k=>{
    const l=save.lv[k],max=l>=MAXLV,c=cost(l);
    const d=document.createElement('div');d.className='card'+(k===upgradedKey?' just-upgraded':'');
    let pips='';for(let i=0;i<MAXLV;i++)pips+='<b'+(i<l?' class="f"':'')+'></b>';
    d.innerHTML='<div class="ic">'+ICONS[k]+'<span class="lv">'+(l+1)+'</span></div><div class="nm">'+NAMES[k]+(k==='coin'?' ×'+(l+1):'')+'</div><div class="pips">'+pips+'</div>';
    const b=document.createElement('button');
    b.className='btn up'+((!max&&save.coins<c)?' no':'');
    b.innerHTML=max?'<span>الأقصى</span><svg class="max-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 8.6l6.2-.9z" fill="currentColor"/></svg>':'<svg class="upgrade-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>تطوير</span><i class="coin-i"></i><span>'+c+'</span>';
    b.addEventListener('click',()=>{
      if(max)return;
      if(save.coins<c){toast('العملات غير كافية');beep(160,.12,'square');return;}
      save.coins-=c;save.lv[k]++;persist();beep(660,.1,'triangle');beep(880,.14,'triangle');renderHangar(k);toast('تم التطوير! ✨');
    });
    d.appendChild(b);box.appendChild(d);
  });
}
$('buyFuel').addEventListener('click',()=>{
  if(save.coins<120){toast('تحتاج 120 عملة');beep(160,.12,'square');return;}
  save.coins-=120;save.fuel++;persist();beep(520,.1,'triangle');renderHangar();
});
let toastT;
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>e.classList.remove('on'),900);}
function show(id){['hangar','charge','hud','result'].forEach(n=>$(n).classList.toggle('on',n===id));}
function toReady(){state='ready';resetRun();renderHangar();show('hangar');}
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
  if(e.code==='ArrowLeft'||e.code==='KeyA')keys.left=true;
  if(e.code==='ArrowRight'||e.code==='KeyD')keys.right=true;
});
window.addEventListener('keyup',e=>{
  if(e.code==='Space'){down.delete('k');if(state==='charge'&&down.size===0)launch();}
  if(e.code==='ArrowLeft'||e.code==='KeyA')keys.left=false;
  if(e.code==='ArrowRight'||e.code==='KeyD')keys.right=false;
});
$('boost').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();doBoost();});
function steerInput(){
  let v=0;
  const first=ptr.values().next().value;
  if(first){v=(first.x-first.x0)/(W*0.2);}
  if(keys.left)v-=1;if(keys.right)v+=1;
  v=clamp(v,-1,1);
  return Math.abs(v)<0.1?0:v;
}
function doBoost(){
  if(state!=='flight'||P.boostT>0.2)return;
  if(save.fuel<=0){toast('لا يوجد وقود');beep(160,.12,'square');return;}
  save.fuel--;P.boostT=1.6;beep(180,.4,'sawtooth',0.04);shake=Math.max(shake,0.15);
}
function launch(){
  const lv=save.lv.sling;
  const perfect=power>=0.88;
  let s=(560+110*lv)*(0.4+0.6*power);
  const pull=power*80;
  P.x=-pull*Math.cos(0.62);P.alt=85-pull*Math.sin(0.62);P.z=0;P.vz=0;
  if(perfect){s*=1.1;addFloat(P.x+60,P.alt+60,'إطلاق مثالي!','#ffe27a',0);beep(880,.2,'triangle');}
  P.s=s;P.a=0.62;
  state='flight';
  beep(240,.25,'sawtooth',0.05);shake=0.25;
  $('bFuel').textContent=save.fuel;
  $('tapHint').style.opacity=1;
  show('hud');
}

/* ---------- update ---------- */
function updateFlight(dt){
  const holding=down.size>0;
  const lvP=save.lv.plane;
  const maxPitch=clamp((P.s-130)/320,0,0.62);
  let target=holding?Math.min(0.55,maxPitch):-0.6;
  if(P.s<160&&!P.sliding)target=-0.8;
  if(!P.sliding)P.a+=(target-P.a)*Math.min(1,dt*3.2);
  const K=0.00022*(1-0.09*lvP);
  let ds=-G*Math.sin(P.a)-K*P.s*P.s;
  if(P.boostT>0){
    ds+=620;P.boostT-=dt;
    addPart(P.x-60*Math.cos(P.a),P.alt-60*Math.sin(P.a),-140-Math.random()*80,(Math.random()-0.5)*60,0.35,Math.random()<.5?0xffb23d:0xff5a2a,5+Math.random()*4,P.z);
  }
  if(P.sliding){ds=-380;P.a=0;}
  P.s+=ds*dt;
  if(P.alt>0&&!P.sliding)P.s=Math.max(P.s,105);
  // steering
  const steer=P.sliding?0:steerInput();
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
  P.x+=P.s*Math.cos(P.a)*dt;
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
  // pickups
  const mult=1+save.lv.coin;
  for(const c of objs.coins){
    if(!c.on)continue;
    const dx=c.x-P.x,dy=c.alt-P.alt,dz=c.z-P.z;
    if(dx*dx+dy*dy+dz*dz<50*50){
      c.on=false;c.mesh.visible=false;run.coins+=5*mult;run.picked++;
      beep(900+Math.min(run.picked,20)*25,.07,'triangle',0.04);
      for(let i=0;i<5;i++)addPart(c.x,c.alt,(Math.random()-.5)*180,(Math.random()-.5)*180,0.35,0xffd84a,3,c.z);
    }
  }
  for(const r of objs.rings){
    if(!r.on)continue;
    const dx=r.x-P.x,dy=r.alt-P.alt,dz=r.z-P.z;
    if(Math.abs(dx)<30&&dy*dy+dz*dz<r.R*r.R){
      r.on=false;r.mesh.visible=false;P.s+=220;shake=0.2;addFloat(r.x,r.alt+40,'دفعة!','#fff',r.z);beep(520,.2,'sawtooth',0.04);
      for(let i=0;i<14;i++)addPart(r.x,r.alt,(Math.random()-.5)*260,(Math.random()-.5)*260,0.45,0xfff3a8,3,r.z);
    }
  }
  for(const f of objs.fuels){
    if(!f.on)continue;
    const dx=f.x-P.x,dy=f.alt-P.alt,dz=f.z-P.z;
    if(dx*dx+dy*dy+dz*dz<54*54){f.on=false;f.mesh.visible=false;save.fuel++;$('bFuel').textContent=save.fuel;addFloat(f.x,f.alt+40,'+1 وقود','#ffb3a8',f.z);beep(500,.12,'triangle');beep(750,.14,'triangle');}
  }
  for(const b of objs.birds){
    b.x+=b.vx*dt;b.t+=dt*9;
    if(b.hit){b.alt-=180*dt;continue;}
    const dx=b.x-P.x,dy=b.alt-P.alt,dz=b.z-P.z;
    if(dx*dx+dy*dy+dz*dz<46*46){
      b.hit=true;P.s*=0.62;P.a=Math.min(P.a,-0.2);shake=0.5;
      addFloat(P.x,P.alt+50,'اصطدام!','#ff8a7a');beep(110,.25,'square',0.06);
      for(let i=0;i<14;i++)addPart(b.x,b.alt,(Math.random()-.5)*300,(Math.random()-.5)*300,0.6,0xf2f2f2,3,b.z);
    }
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
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;if(f.t>1.1){f.el.remove();floats.splice(i,1);}}
  // cull
  if(state==='flight'&&((time*4|0)%8===0)){
    const lim=P.x-800;
    const keep=o=>{if(o.x<lim&&o.mesh)objGroup.remove(o.mesh);return o.x>=lim;};
    objs.coins=objs.coins.filter(keep);objs.rings=objs.rings.filter(keep);
    objs.birds=objs.birds.filter(keep);objs.fuels=objs.fuels.filter(keep);objs.drafts=objs.drafts.filter(keep);
  }
  shake=Math.max(0,shake-dt);
  // hud
  if(state==='flight'){
    const m=Math.max(0,Math.floor(P.x*M_PER_PX));
    if($('dist').dataset.v!==String(m)){$('dist').dataset.v=m;$('dist').innerHTML=m+'<small>م</small>';}
    $('rCoins').textContent=run.coins;
    $('alt').textContent='الارتفاع '+Math.floor(P.alt/10)+' م';
    $('boost').classList.toggle('off',save.fuel<=0||P.boostT>0.2);
    $('bFuel').textContent=save.fuel;
    if(m>10)$('tapHint').style.opacity=0;
  }
}
const VIEW_AHEAD=14000;

function endRun(){
  state='result';
  const m=Math.max(0,Math.floor(P.x*M_PER_PX));
  const mult=1+save.lv.coin;
  const bonus=Math.floor(m/4)*mult;
  const total=run.coins+bonus;
  save.coins+=total;
  const rec=m>save.best;
  if(rec)save.best=m;
  persist();
  $('rDist').textContent=m;$('rPick').textContent=run.coins;$('rBonus').textContent=bonus;$('rTotal').textContent=total;
  $('rRec').style.display=rec&&m>0?'inline-block':'none';
  show('result');beep(440,.15,'triangle');beep(660,.2,'triangle');
}

/* ---------- render ---------- */
const SKY=[['#4fc3ff','#d9f4ff'],['#ff7e5f','#ffd9a8'],['#0b1245','#3b3a8c'],['#ff8fb0','#ffe3b0']];
const BIOMES=[
  {name:'السهول الخضراء',mountain:0x5b9a7a,leaf:0x2f9a4a,trunk:0x7a4a22,cactus:0x2e8765},
  {name:'الصحراء الذهبية',mountain:0xc18b53,leaf:0x2e8765,trunk:0x8c5b32,cactus:0x347f55},
  {name:'القمم الثلجية',mountain:0x91abc7,leaf:0xeaf3ff,trunk:0x718090,cactus:0x8ca5b8},
  {name:'الساحل الأزرق',mountain:0x468e9a,leaf:0x238b57,trunk:0x765038,cactus:0x2e8765},
  {name:'الوادي الصخري',mountain:0x5a4b50,leaf:0x3f714a,trunk:0x48332c,cactus:0x5b514c}
];
let activeBiome=-1;
function applyBiome(m){
  const index=Math.floor(m/650)%BIOMES.length;
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
    if(state==='flight')addFloat(P.x,P.alt+55,'نقطة وصول جديدة!','#8cf5ff',P.z);
  }
  const px=P.x*S;
  for(let i=0;i<routeSegments.length;i++){
    const x=px+35+i*52,segment=routeSegments[i];
    segment.position.set(x,0,routeCurve(x));
  }
  const targetX=routeTargetMeters*4;
  destination.position.set(targetX,0,routeCurve(targetX));
  const remaining=Math.max(0,Math.ceil(routeTargetMeters-m));
  $('routeInfo').textContent='الوجهة القادمة · '+remaining+' م';
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
  renderer.render(scene,camera);
}

/* ---------- loop ---------- */
let last=performance.now();
function frame(t){
  const dt=Math.min(0.033,(t-last)/1000);last=t;
  update(dt);render(dt);
  requestAnimationFrame(frame);
}
toReady();
requestAnimationFrame(frame);
})();
