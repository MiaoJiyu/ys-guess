import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8807;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'recovery-smoke');
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root, stdio: 'ignore', env: { ...process.env, TEYVAT_DATA_DIR: testData },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(`${url}: ${data.error || response.status}`);
  return data;
}
function auth(token, sid) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Id': sid };
}
function assert(condition, message) { if (!condition) throw new Error(message); }

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch {}
    await sleep(200);
  }
  const suffix = Date.now().toString(36);
  const host = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `rec_${suffix}`, password: 'test123456', nickname: '恢复测试' }),
  });
  const sid = `rec-${suffix}`;
  await request('/api/action', {
    method: 'POST', headers: auth(host.token, sid),
    body: JSON.stringify({ type: 'create', name: '恢复测试', visibility: 'public', password: '1234', maxGuesses: 1 }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(host.token, sid),
    body: JSON.stringify({ type: 'set_options', matchRounds: 1 }),
  });
  await request('/api/action', {
    method: 'POST', headers: auth(host.token, sid), body: JSON.stringify({ type: 'start' }),
  });
  let roundUpdate = null;
  for (const name of ['迪卢克', '琴', '安柏', '丽莎']) {
    await request('/api/action', {
      method: 'POST', headers: auth(host.token, sid),
      body: JSON.stringify({ type: 'guess', name }),
    });
    const afterRound = await request('/api/bootstrap', { headers: auth(host.token, sid) });
    roundUpdate = afterRound.events.find((event) => event.type === 'room_update');
    if (roundUpdate?.state === 'round_ended') break;
  }
  assert(roundUpdate?.state === 'round_ended', '小局结束后房间状态错误');
  assert(roundUpdate.lastGameEnd?.type === 'game_end', '小局结算快照缺失');
  assert(roundUpdate.lastGameEnd.ranking?.length, '小局结算排名缺失');

  await request('/api/action', {
    method: 'POST', headers: auth(host.token, sid), body: JSON.stringify({ type: 'start' }),
  });
  const afterMatch = await request('/api/bootstrap', { headers: auth(host.token, sid) });
  const matchUpdate = afterMatch.events.find((event) => event.type === 'room_update');
  assert(matchUpdate?.state === 'match_ended', '大场结束后房间状态错误');
  assert(matchUpdate.lastMatchEnd?.type === 'match_end', '大场结算快照缺失');
  assert(matchUpdate.lastMatchEnd.finalRanking?.length, '大场结算排名缺失');

  console.log('RECOVERY_TEST_OK');
} finally {
  child.kill('SIGTERM');
  await sleep(400);
  try { fs.rmSync(testData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
