import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8805;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'cheat-smoke');
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, TEYVAT_DATA_DIR: testData, CHEAT_REVEAL_RATE: '1' },
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
  const admin = await register('cheat_admin');
  const user = await register('cheat_user');
  const other = await register('cheat_other');
  const hostSid = `host-${suffix}`;
  const userSid = `user-${suffix}`;

  const denied = await raw('/api/admin/cheat', { headers: auth(user.token) });
  assert(denied.response.status === 403, '普通用户不应访问外挂管理接口');

  const tooShort = await raw('/api/admin/cheat', {
    method: 'POST', headers: auth(admin.token), body: JSON.stringify({ action: 'set', password: 'short' }),
  });
  assert(tooShort.response.status === 400, '外挂密码长度校验未生效');

  const secretPassword = 'cheat-secret-2026';
  const configured = await request('/api/admin/cheat', {
    method: 'POST', headers: auth(admin.token), body: JSON.stringify({ action: 'set', password: secretPassword }),
  });
  assert(configured.ok && configured.configured, '管理员设置外挂密码失败');
  assert(!JSON.stringify(configured).includes(secretPassword), '外挂密码被明文返回');

  await request('/api/action', {
    method: 'POST', headers: auth(admin.token, hostSid),
    body: JSON.stringify({ type: 'create', name: '房主', visibility: 'public', password: '1234', maxGuesses: 8 }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(admin.token, hostSid),
    body: JSON.stringify({ type: 'set_options', matchRounds: 2, hintsPerMatch: 0 }),
  });
  const code = (await request('/api/bootstrap', { headers: auth(admin.token, hostSid) }))
    .events.find((event) => event.type === 'room_update').code;
  await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid),
    body: JSON.stringify({ type: 'join', name: '作弊者', roomCode: code, password: '1234' }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(admin.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });

  const normalHint = await raw('/api/action', {
    method: 'POST', headers: auth(user.token, userSid), body: JSON.stringify({ type: 'hint' }),
  });
  assert(normalHint.data.ok === false, '未激活时零星辉不应可用');

  const wrong = await raw('/api/action', {
    method: 'POST', headers: auth(user.token, userSid),
    body: JSON.stringify({ type: 'cheat_activate', password: 'wrong-password' }),
  });
  assert(wrong.data.ok === false && /错误/.test(wrong.data.error || ''), '错误密码未提示');

  const activated = await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid),
    body: JSON.stringify({ type: 'cheat_activate', password: secretPassword }),
  });
  assert(activated.ok, '正确密码未激活外挂');
  assert(activated.events.some((item) => item.event.type === 'cheat_result'), '缺少激活成功提示');

  const duplicate = await raw('/api/action', {
    method: 'POST', headers: auth(user.token, userSid),
    body: JSON.stringify({ type: 'cheat_activate', password: secretPassword }),
  });
  assert(duplicate.data.ok === false && /重复/.test(duplicate.data.error || ''), '重复激活未被拦截');

  const hint = await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid), body: JSON.stringify({ type: 'hint' }),
  });
  const hintEvent = hint.events.map((item) => item.event).find((event) => event.type === 'hint_result');
  assert(hintEvent && hintEvent.cheat && hintEvent.cost === 0, '无限星辉未免除消耗');
  assert(hintEvent.directReveal && hintEvent.answerName, '未触发直出答案');
  assert(hintEvent.hintsLeft === 0, '无限星辉不应改变星辉计数');

  await sleep(750);
  const secondHint = await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid), body: JSON.stringify({ type: 'hint' }),
  });
  assert(secondHint.ok, '无限星辉无法重复查看提示');

  const guess = await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid),
    body: JSON.stringify({ type: 'guess', name: hintEvent.answerName }),
  });
  assert(guess.ok, '使用直出答案猜题失败');

  await request('/api/action', {
    method: 'POST', headers: auth(admin.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });
  let state = await request('/api/bootstrap', { headers: auth(user.token, userSid) });
  let room = state.events.find((event) => event.type === 'room_update');
  let me = room.players.find((player) => player.id === userSid);
  assert(me.cheatActive, '外挂状态未跨小局保留');

  await sleep(750);
  const reveal2 = await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid), body: JSON.stringify({ type: 'hint' }),
  });
  const answer2 = reveal2.events.map((item) => item.event).find((event) => event.type === 'hint_result').answerName;
  await request('/api/action', {
    method: 'POST', headers: auth(user.token, userSid), body: JSON.stringify({ type: 'guess', name: answer2 }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(admin.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });
  state = await request('/api/bootstrap', { headers: auth(user.token, userSid) });
  room = state.events.find((event) => event.type === 'room_update');
  me = room.players.find((player) => player.id === userSid);
  assert(!me.cheatActive, '大场结束后外挂状态未失效');

  const cleared = await request('/api/admin/cheat', {
    method: 'POST', headers: auth(admin.token), body: JSON.stringify({ action: 'clear' }),
  });
  assert(cleared.ok && !cleared.configured, '清除外挂密码失败');
  const clearedStatus = await request('/api/admin/cheat', { headers: auth(admin.token) });
  assert(!clearedStatus.configured, '外挂密码状态未同步清除');

  console.log('CHEAT_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
