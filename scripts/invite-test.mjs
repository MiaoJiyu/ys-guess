import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8806;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'invite-smoke');
const inviteCode = 'invite-test-2026';
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, TEYVAT_DATA_DIR: testData, ADMIN_BOOTSTRAP_CODE: inviteCode },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function raw(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function register(username, adminCode) {
  return raw('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'test123456', nickname: username, adminCode }),
  });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await raw('/api/health')).response.ok) break; } catch {}
    await sleep(200);
  }
  const suffix = Date.now().toString(36);
  const missing = await register(`invite_a_${suffix}`);
  assert(missing.response.status === 403, '缺少邀请码注册应被拒绝');
  const wrong = await register(`invite_b_${suffix}`, 'wrong-code');
  assert(wrong.response.status === 403, '错误邀请码注册应被拒绝');
  const correct = await register(`invite_c_${suffix}`, inviteCode);
  assert(correct.data.ok && correct.data.user.role === 'admin', '正确邀请码应创建管理员');
  const normal = await register(`invite_d_${suffix}`);
  assert(normal.data.ok && normal.data.user.role === 'user', '已有管理员后普通注册不应要求邀请码');
  console.log('INVITE_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
