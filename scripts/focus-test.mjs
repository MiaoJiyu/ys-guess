import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8802;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'focus-smoke');
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

function auth(token, sid) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Id': sid };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function me(roomUpdate, myId) {
  return (roomUpdate.players || []).find((player) => player.id === myId);
}

async function roomState(token, sid) {
  const data = await request('/api/bootstrap', { headers: auth(token, sid) });
  return data.events.find((event) => event.type === 'room_update');
}

let nonce = 0;
function focusAction(token, sid, extra = {}) {
  nonce += 1;
  return request('/api/action', {
    method: 'POST', headers: auth(token, sid),
    body: JSON.stringify({ type: 'focus_loss', nonce: `focus-${nonce}`, reason: 'blur', ...extra }),
  });
}

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await raw('/api/health')).response.ok) break; } catch {}
    await sleep(200);
  }
  const suffix = Date.now().toString(36);
  const host = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `fhost_${suffix}`, password: 'test123456', nickname: '切屏房主' }),
  });
  const guest = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `fguest_${suffix}`, password: 'test123456', nickname: '切屏玩家' }),
  });
  const hostSid = `fhost-${suffix}`;
  const guestSid = `fguest-${suffix}`;
  const created = await request('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid),
    body: JSON.stringify({ type: 'create', name: '切屏房主', visibility: 'public', password: '1234', maxGuesses: 8 }),
  });
  const code = created.roomCode;
  await request('/api/action', {
    method: 'POST', headers: auth(guest.token, guestSid),
    body: JSON.stringify({ type: 'join', name: '切屏玩家', roomCode: code, password: '1234' }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });

  await focusAction(guest.token, guestSid);
  await sleep(1650);
  await focusAction(guest.token, guestSid, { reason: 'visibility' });
  const afterReconnect = await roomState(guest.token, guestSid);
  assert(me(afterReconnect, guestSid).focusLosses === 2, '重连后切屏计数未保留');

  await sleep(1650);
  await focusAction(guest.token, guestSid);
  await sleep(1650);
  const fourth = await focusAction(guest.token, guestSid);
  const pendingState = await roomState(guest.token, guestSid);
  const pendingPlayer = me(pendingState, guestSid);
  assert(pendingPlayer.focusLosses === 4, '第 4 次切屏未计数');
  assert(pendingPlayer.focusLossPendingUntil > Date.now() / 1000, '超阈值后未进入宽限期');
  assert(fourth.events.some((item) => item.event.type === 'focus_warning'), '未发送宽限提示事件');

  const appeal = await request('/api/action', {
    method: 'POST', headers: auth(guest.token, guestSid), body: JSON.stringify({ type: 'focus_appeal' }),
  });
  assert(appeal.events.some((item) => item.event.type === 'focus_appeal_result'), '撤销未返回结果');
  const appealedState = await roomState(guest.token, guestSid);
  assert(me(appealedState, guestSid).focusLosses === 3, '撤销后计数未回退到 3');
  assert(me(appealedState, guestSid).focusAppealUsed, '撤销标记未记录');

  await sleep(1650);
  await focusAction(guest.token, guestSid);
  const secondAppeal = await raw('/api/action', {
    method: 'POST', headers: auth(guest.token, guestSid), body: JSON.stringify({ type: 'focus_appeal' }),
  });
  assert(secondAppeal.data.ok === false, '本局第二次撤销应被拒绝');

  await sleep(5400);
  const events = await request(`/api/events?since=0&room=${code}`, { headers: auth(host.token, hostSid) });
  const end = [...events.events].reverse().find((item) => item.event.type === 'game_end' && item.event.reason === 'focus_loss');
  assert(end, '宽限期结束后未判负结算');
  const loser = end.event.ranking.find((row) => row.name === '切屏玩家');
  assert(loser && loser.focusLossForfeited, '结算中未标记切屏判负');

  await request('/api/action', {
    method: 'POST', headers: auth(host.token, hostSid), body: JSON.stringify({ type: 'start' }),
  });
  const nextRound = await roomState(guest.token, guestSid);
  const nextPlayer = me(nextRound, guestSid);
  assert(nextPlayer.focusLosses === 0 && !nextPlayer.focusAppealUsed && !nextPlayer.focusLossForfeited, '新小局未重置切屏状态');

  console.log('FOCUS_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
