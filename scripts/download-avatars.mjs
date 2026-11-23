import fs from 'node:fs';
import path from 'node:path';
import { AVATAR_ICONS } from '../shared/avatars.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'assets', 'avatars');
fs.mkdirSync(output, { recursive: true });

const icons = [...new Set(Object.values(AVATAR_ICONS))];
const missing = icons.filter((icon) => !fs.existsSync(path.join(output, `${icon}.png`)));
console.log(`头像总数 ${icons.length}，待下载 ${missing.length}`);

let cursor = 0;
let downloaded = 0;
let failed = 0;

async function download(icon) {
  const file = path.join(output, `${icon}.png`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`https://enka.network/ui/${icon}.png`, { redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000 || buffer[0] !== 0x89 || buffer[1] !== 0x50) throw new Error('不是有效 PNG');
      fs.writeFileSync(file, buffer);
      downloaded += 1;
      return;
    } catch (error) {
      if (attempt === 3) {
        failed += 1;
        console.warn(`下载失败 ${icon}: ${error.message}`);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
}

async function worker() {
  while (cursor < missing.length) {
    const icon = missing[cursor];
    cursor += 1;
    await download(icon);
  }
}

await Promise.all(Array.from({ length: Math.min(6, missing.length || 1) }, () => worker()));
console.log(`下载完成 ${downloaded}，失败 ${failed}`);
if (failed) process.exitCode = 1;
