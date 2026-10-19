'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'src', 'assets', 'models', 'aircraft');

function box(cx, cy, cz, sx, sy, sz, material) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  return {
    vertices: [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
    faces: [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],
    material
  };
}
function wing(points, thickness, material) {
  const n = points.length;
  const vertices = points.map(([x,z]) => [x,-thickness/2,z]).concat(points.map(([x,z]) => [x,thickness/2,z]));
  const faces = [];
  for (let i=1;i<n-1;i++) faces.push([0,i,i+1],[n,n+i+1,n+i]);
  for (let i=0;i<n;i++) {
    const j=(i+1)%n;
    faces.push([i,j,n+j],[i,n+j,n+i]);
  }
  return {vertices,faces,material};
}
function octa(cx,cy,cz,rx,ry,rz,material) {
  return {
    vertices:[[cx+rx,cy,cz],[cx-rx,cy,cz],[cx,cy+ry,cz],[cx,cy-ry,cz],[cx,cy,cz+rz],[cx,cy,cz-rz]],
    faces:[[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]],
    material
  };
}
function makeGlb(parts, colors) {
  const bin = [];
  let byteLength = 0;
  const views = [], accessors = [], primitives = [];
  const append = buffer => {
    while (byteLength % 4) { bin.push(0); byteLength++; }
    const offset = byteLength;
    for (const value of buffer) bin.push(value);
    byteLength += buffer.length;
    return {offset,length:buffer.length};
  };
  for (const part of parts) {
    const pos = Buffer.alloc(part.vertices.length * 12);
    part.vertices.forEach((v,i)=>v.forEach((n,j)=>pos.writeFloatLE(n,(i*3+j)*4)));
    const pview=append(pos);
    views.push({buffer:0,byteOffset:pview.offset,byteLength:pview.length,target:34962});
    const pAccessor=accessors.length;
    const mins=[0,1,2].map(axis=>Math.min(...part.vertices.map(v=>v[axis])));
    const maxs=[0,1,2].map(axis=>Math.max(...part.vertices.map(v=>v[axis])));
    accessors.push({bufferView:views.length-1,componentType:5126,count:part.vertices.length,type:'VEC3',min:mins,max:maxs});
    const flat=part.faces.flat();
    const ibuf=Buffer.alloc(flat.length*2);
    flat.forEach((n,i)=>ibuf.writeUInt16LE(n,i*2));
    const iview=append(ibuf);
    views.push({buffer:0,byteOffset:iview.offset,byteLength:iview.length,target:34963});
    const iAccessor=accessors.length;
    accessors.push({bufferView:views.length-1,componentType:5123,count:flat.length,type:'SCALAR'});
    primitives.push({attributes:{POSITION:pAccessor},indices:iAccessor,material:part.material,mode:4});
  }
  while (byteLength % 4) { bin.push(0); byteLength++; }
  const json = {
    asset:{version:'2.0',generator:'Sling Wing distinct aircraft generator'},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives}],
    materials:colors.map(color=>({pbrMetallicRoughness:{baseColorFactor:color,metallicFactor:0.45,roughnessFactor:0.32}})),
    buffers:[{byteLength}],bufferViews:views,accessors
  };
  let jsonBuffer=Buffer.from(JSON.stringify(json),'utf8');
  while(jsonBuffer.length%4)jsonBuffer=Buffer.concat([jsonBuffer,Buffer.from([0x20])]);
  const binBuffer=Buffer.from(bin);
  const total=12+8+jsonBuffer.length+8+binBuffer.length;
  const header=Buffer.alloc(12);header.write('glTF',0,'ascii');header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
  const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonBuffer.length,0);jh.write('JSON',4,'ascii');
  const bh=Buffer.alloc(8);bh.writeUInt32LE(binBuffer.length,0);bh.write('BIN\0',4,'ascii');
  return Buffer.concat([header,jh,jsonBuffer,bh,binBuffer]);
}
const phantom = [
  box(0,0,0,16,1.8,2,0),
  wing([[-5,-1],[0,-2],[3.5,-8.5],[5,-8],[4,-3],[7,-1.5],[7,1.5],[4,3],[5,8],[3.5,8.5],[0,2],[-5,1]],0.35,1),
  wing([[-6,-0.5],[-2,-0.8],[2,-4.5],[3,-4],[1,-1],[2,0],[1,1],[3,4],[2,4.5],[-2,0.8]],0.22,2),
  octa(3,0.75,0,2,0.8,0.8,3),
  box(-5.8,-0.25,-2.4,4.2,1.1,1.1,0),box(-5.8,-0.25,2.4,4.2,1.1,1.1,0),
  octa(-8,-0.25,-2.4,1.2,0.45,0.45,2),octa(-8,-0.25,2.4,1.2,0.45,0.45,2)
];
const guardian = [
  box(0,0,0,16.5,2.3,3,0),
  wing([[-6,-1.2],[-3,-2],[-2,-8.8],[0.8,-8],[2.2,-5],[4.8,-3],[6.2,-2],[6.2,2],[4.8,3],[2.2,5],[0.8,8],[-2,8.8],[-3,2],[-6,1.2]],0.9,1),
  wing([[-4,-1.3],[-2,-2],[-0.5,-6.8],[0.8,-6],[2,-3],[4,-2],[4,2],[2,3],[0.8,6],[-0.5,6.8],[-2,2],[-4,1.3]],0.25,2),
  octa(3,1,0,2.1,1,1,3),
  box(-4.8,-0.55,-3.2,5,1.8,1.8,0),box(-4.8,-0.55,3.2,5,1.8,1.8,0),
  octa(-7.5,-0.55,-3.2,1.3,0.7,0.7,2),octa(-7.5,-0.55,3.2,1.3,0.7,0.7,2),
  box(-4.7,0.1,0,2.8,0.7,3.2,2)
];
fs.mkdirSync(outDir,{recursive:true});
const models = [
  ['phantom.glb',makeGlb(phantom,[[0.14,0.17,0.25,1],[0.49,0.28,0.86,1],[0.25,0.92,1,1],[0.45,0.82,1,1]])],
  ['guardian.glb',makeGlb(guardian,[[0.16,0.22,0.27,1],[0.6,0.69,0.75,1],[1,0.65,0.15,1],[0.65,0.92,1,1]])]
];
for(const [name,data] of models){
  if(data.toString('ascii',0,4)!=='glTF'||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length)throw new Error('Generated invalid GLB: '+name);
  fs.writeFileSync(path.join(outDir,name),data);
  console.log('Generated '+name+' ('+data.length+' bytes)');
}
