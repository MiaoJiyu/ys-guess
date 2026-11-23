import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(root, 'tencent_api.env');
if (!fs.existsSync(file)) {
  console.error('未找到 tencent_api.env，已中止同步。');
  process.exit(1);
}

const values = {};
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
  if (!match) continue;
  values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

for (const key of ['SecretId', 'SecretKey']) {
  if (!values[key]) {
    console.error(`tencent_api.env 缺少 ${key}，已中止同步。`);
    process.exit(1);
  }
}

const cli = process.platform === 'win32' ? 'edgeone.cmd' : 'edgeone';
let failed = false;
for (const key of ['SecretId', 'SecretKey']) {
  const result = spawnSync(cli, ['makers', 'env', 'set', key, values[key]], {
    cwd: root,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) failed = true;
}

if (failed) {
  console.error('环境变量同步失败，请确认已安装并登录 EdgeOne CLI，且已执行 edgeone makers link。');
  process.exit(1);
}

console.log('已将 tencent_api.env 中的 SecretId / SecretKey 同步到 EdgeOne 项目环境变量（值未回显）。');
