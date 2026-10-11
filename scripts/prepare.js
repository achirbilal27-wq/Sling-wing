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

const idx = path.join(www, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(
  /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/,
  'js/three.min.js'
);
fs.writeFileSync(idx, html);
console.log('www/ is ready.');
