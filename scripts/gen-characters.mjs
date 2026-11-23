import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'server.py'), 'utf8');
const rows = [];

for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^\s*C\((.*)\),\s*$/);
  if (!match) continue;
  const fields = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const rarityMatch = match[1].match(/,\s*(\d+)\s*$/);
  if (fields.length < 8 || !rarityMatch) continue;
  rows.push({
    name: fields[0],
    letter: fields[1],
    gender: fields[2],
    region: fields[3],
    element: fields[4],
    weapon: fields[5],
    birthday: fields[6],
    version: fields[7],
    rarity: Number(rarityMatch[1]),
  });
}

if (rows.length < 100) {
  throw new Error(`角色数据解析异常，仅得到 ${rows.length} 条`);
}

const output = `// 由 scripts/gen-characters.mjs 从 server.py 自动生成，请勿手动编辑。\nexport const CHARACTERS = ${JSON.stringify(rows, null, 2)};\n`;
fs.mkdirSync(path.join(root, 'shared'), { recursive: true });
fs.writeFileSync(path.join(root, 'shared', 'characters.js'), output, 'utf8');
console.log(`已生成 shared/characters.js，共 ${rows.length} 位角色`);
