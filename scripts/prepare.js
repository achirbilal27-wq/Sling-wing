// Copies src/ to www/ and makes the game fully local (three.js bundled, no CDN script).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const www = path.join(root, 'www');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name), b = path.join(to, f.name);
    f.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

fs.rmSync(www, { recursive: true, force: true });
copyDir(src, www);

const threeFile = path.join(root, 'node_modules', 'three', 'build', 'three.min.js');
if (!fs.existsSync(threeFile)) {
  console.error('three.min.js not found. Run: npm install');
  process.exit(1);
}
fs.copyFileSync(threeFile, path.join(www, 'js', 'three.min.js'));

const gltfLoaderFile = path.join(root, 'node_modules', 'three', 'examples', 'js', 'loaders', 'GLTFLoader.js');
if (!fs.existsSync(gltfLoaderFile)) {
  console.error('GLTFLoader.js not found in the installed Three.js package.');
  process.exit(1);
}
fs.copyFileSync(gltfLoaderFile, path.join(www, 'js', 'GLTFLoader.js'));

const idx = path.join(www, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const threeCdnPattern = /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/;
const gltfCdnPattern = /https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/examples\/js\/loaders\/GLTFLoader\.js/;
if (!threeCdnPattern.test(html)) {
  console.error('Expected Three.js CDN script was not found in src/index.html.');
  process.exit(1);
}
html = html.replace(threeCdnPattern, 'js/three.min.js');
if (!gltfCdnPattern.test(html)) {
  console.error('Expected GLTFLoader script was not found in src/index.html.');
  process.exit(1);
}
html = html.replace(gltfCdnPattern, 'js/GLTFLoader.js');
if (/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/.test(html) || gltfCdnPattern.test(html)) {
  console.error('A Three.js CDN reference remained in www/index.html; APK would depend on the network.');
  process.exit(1);
}
fs.writeFileSync(idx, html);
console.log('www/ is ready.');
