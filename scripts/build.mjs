import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const allowedFiles = ['index.html', 'app.css', 'game.js', 'makers.css', 'makers.js', 'package.json'];
const allowedDirs = ['shared', 'cloud-functions', 'assets'];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of allowedFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(dist, file));
}

for (const dir of allowedDirs) {
  const source = path.join(root, dir);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(dist, dir), { recursive: true, filter: (entry) => !entry.includes('tencent_api.env') });
}

const denied = ['tencent_api.env', 'server.py', 'server.js', 'players.json', 'data'];
for (const name of denied) {
  const target = path.join(dist, name);
  fs.rmSync(target, { recursive: true, force: true });
}

console.log('构建完成：dist 仅包含前端静态文件、共享模块与函数，未包含 tencent_api.env');
