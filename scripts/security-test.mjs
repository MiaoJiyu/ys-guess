import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8804;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'security-smoke');
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root, stdio: 'ignore', env: { ...process.env, TEYVAT_DATA_DIR: testData },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function raw(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}
async function request(url, options = {}) {
  const { response, data } = await raw(url, options);
  if (!response.ok || data.ok === false) throw new Error(`${url}: ${data.error || response.status}`);
  return data;
}
function auth(token, sid = `sid-${Math.random().toString(36).slice(2)}`) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Id': sid };
}
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await raw('/api/health')).response.ok) break; } catch {}
    await sleep(200);
  }
  const suffix = Date.now().toString(36);
  const register = (name) => request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `${name}_${suffix}`, password: 'test123456', nickname: name }),
  });
  const host = await register('sec_host');
  const guest = await register('sec_guest');
  const attacker = await register('sec_attack');
  const hostSid = `host-${suffix}`;

  const bootstrap = await request('/api/bootstrap', { headers: auth(host.token, hostSid) });
  const leaderboard = bootstrap.events.find((event) => event.type === 'leaderboard');
  assert(leaderboard.list.some((item) => item.name === 'BYY'), '历史排行榜未迁移');

  const created = await request('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid),
    body: JSON.stringify({ type: 'create', name: '房主', visibility: 'public', password: '1234' }),
  });
  const code = created.roomCode;
  await request('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });

  const foreignEvents = await request(`/api/events?since=0&room=${code}`, { headers: auth(attacker.token) });
  assert(!foreignEvents.events.some((item) => ['room_update', 'game_end', 'game_start'].includes(item.event.type)), '非房间成员读取到了房间事件');

  const impersonation = await raw('/api/action', {
    method: 'POST', headers: auth(attacker.token, hostSid),
    body: JSON.stringify({ type: 'hint' }),
  });
  assert(impersonation.data.ok === false && /身份/.test(impersonation.data.error || ''), '会话身份冒用未被阻止');

  const duplicateRoom = await raw('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid),
    body: JSON.stringify({ type: 'create', visibility: 'lan', name: '房主' }),
  });
  assert(duplicateRoom.data.ok === false, '同一会话重复创建房间未被阻止');

  const reset = await request('/api/admin/users', {
    method: 'POST', headers: auth(host.token),
    body: JSON.stringify({ id: guest.user.id, action: 'resetPassword', password: 'newpass123' }),
  });
  assert(reset.ok, '重置密码失败');
  const oldToken = await raw('/api/auth/me', { headers: auth(guest.token) });
  assert(oldToken.response.status === 401, '重置密码后旧令牌仍有效');
  const relogin = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username: guest.user.username, password: 'newpass123' }),
  });
  assert(relogin.ok, '新密码无法登录');

  const feedbackBody = { type: 'bug', title: '限流测试', description: '这是一条用于验证限流的反馈内容' };
  const firstFeedback = await request('/api/feedback', { method: 'POST', headers: auth(relogin.token), body: JSON.stringify(feedbackBody) });
  assert(firstFeedback.ok, '首次反馈提交失败');
  const secondFeedback = await raw('/api/feedback', { method: 'POST', headers: auth(relogin.token), body: JSON.stringify(feedbackBody) });
  assert(secondFeedback.response.status === 429, '反馈限流未生效');

  console.log('SECURITY_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
