import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const zip = path.join(root, 'release', 'teyvat-lan-host.zip');
const extract = path.join(root, 'release', 'lan-test');
const port = 8892;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let child = null;

try {
  const pack = spawnSync(process.execPath, ['scripts/package-lan.mjs'], { cwd: root, stdio: 'inherit' });
  if (pack.status !== 0) throw new Error('局域网启动包生成失败');

  fs.rmSync(extract, { recursive: true, force: true });
  const unzip = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${extract}' -Force`], { stdio: 'inherit' })
    : spawnSync('unzip', ['-q', zip, '-d', extract], { stdio: 'inherit' });
  if (unzip.status !== 0) throw new Error('局域网启动包解压失败');

  let output = '';
  child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: extract,
    env: { ...process.env, TEYVAT_DATA_DIR: path.join(extract, 'data') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  let health = null;
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) { health = await response.json(); break; }
    } catch {}
    await sleep(200);
  }
  if (!health?.ok) throw new Error(`解压后的服务启动失败：${output}`);
  if (!/局域网访问：http:\/\//.test(output)) throw new Error('启动日志未输出局域网访问地址');
  if (!fs.existsSync(path.join(extract, 'logs', 'lan-server.log'))) throw new Error('未生成运行日志');

  const suffix = Date.now().toString(36);
  const register = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `lan_${suffix}`, password: 'test123456', nickname: '局域网测试' }),
  }).then((response) => response.json());
  if (!register.ok) throw new Error(`局域网注册失败：${register.error}`);

  const avatar = await fetch(`http://127.0.0.1:${port}/assets/avatars/UI_AvatarIcon_Keqing.png`);
  const avatarBytes = new Uint8Array(await avatar.arrayBuffer());
  if (avatar.status !== 200 || avatarBytes[0] !== 0x89 || avatarBytes[1] !== 0x50) {
    throw new Error('局域网启动包未正确提供本地角色头像');
  }

  const headers = { Authorization: `Bearer ${register.token}`, 'X-Session-Id': `lan-${suffix}` };
  const discover = await fetch(`http://127.0.0.1:${port}/api/lan/discover`, { headers }).then((response) => response.json());
  if (!discover.download?.url) throw new Error('局域网接口未返回下载入口');
  const download = await fetch(`http://127.0.0.1:${port}${discover.download.url}`);
  const bytes = new Uint8Array(await download.arrayBuffer());
  if (download.status !== 200 || bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('下载入口返回的不是有效 ZIP');
  }

  console.log('LAN_PACKAGE_TEST_OK');
} finally {
  if (child) child.kill('SIGTERM');
  await sleep(600);
  try {
    fs.rmSync(extract, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    console.warn('局域网测试临时目录稍后清理：' + extract);
  }
}
