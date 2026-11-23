import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8799;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'smoke');
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root, stdio: 'ignore', env: { ...process.env, TEYVAT_DATA_DIR: testData },
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('本地服务启动超时');
}

async function request(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(`${url}: ${data.error || response.status}`);
  return data;
}

function headers(token, sid) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Id': sid };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await waitForServer();
  const health = await request('/api/health');
  assert(health.characters === 123, '角色数量异常');
  const suffix = Date.now().toString(36);
  const admin = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `admin_${suffix}`, password: 'test123456', nickname: '测试房主' }),
  });
  assert(admin.user.role === 'admin', '首个账号应为管理员');
  const guest = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `guest_${suffix}`, password: 'test123456', nickname: '测试同伴' }),
  });
  assert(guest.user.role === 'user', '第二个账号应为普通用户');

  const sidA = `sid-a-${suffix}`;
  const sidB = `sid-b-${suffix}`;
  const created = await request('/api/action', {
    method: 'POST', headers: headers(admin.token, sidA),
    body: JSON.stringify({ type: 'create', name: '测试房主', visibility: 'public', password: '1234', maxGuesses: 8 }),
  });
  const code = created.roomCode;
  assert(/^\d{6}$/.test(code || ''), '房间号应为 6 位');

  const rooms = await request('/api/rooms');
  assert(rooms.list.some((room) => room.code === code && room.visibility === 'public'), '公网房间未出现在大厅');
  assert(!('lanToken' in rooms.list.find((room) => room.code === code)), '公网房间不应下发局域网令牌');

  const failedJoin = await fetch(`${base}/api/action`, {
    method: 'POST', headers: headers(guest.token, sidB),
    body: JSON.stringify({ type: 'join', name: '测试同伴', roomCode: code, password: 'wrong' }),
  }).then((r) => r.json());
  assert(failedJoin.ok === false, '错误密码不应加入房间');

  const joined = await request('/api/action', {
    method: 'POST', headers: headers(guest.token, sidB),
    body: JSON.stringify({ type: 'join', name: '测试同伴', roomCode: code, password: '1234' }),
  });
  assert(joined.ok && joined.roomCode === code, '正确密码应加入房间');

  const started = await request('/api/action', {
    method: 'POST', headers: headers(admin.token, sidA), body: JSON.stringify({ type: 'start' }),
  });
  assert(started.events.some((item) => item.event.type === 'game_start'), '未开始游戏');

  const state = await request('/api/bootstrap', { headers: headers(admin.token, sidA) });
  const roomUpdate = state.events.find((event) => event.type === 'room_update');
  assert(roomUpdate && roomUpdate.players.length === 2, '房间玩家数异常');
  assert(!roomUpdate.leaderboard.some((entry) => entry.name === '测试房主') === false, '排行榜缺少测试玩家');

  const adminUsers = await request('/api/admin/users', { headers: headers(admin.token, sidA) });
  assert(adminUsers.list.length >= 2, '管理员无法查看用户列表');
  const forbidden = await fetch(`${base}/api/admin/users`, { headers: headers(guest.token, sidB) }).then((r) => r.status);
  assert(forbidden === 403, '普通用户不应访问管理接口');

  const credential = await request('/api/tencent/status', { headers: headers(admin.token, sidA) });
  assert(typeof credential.configured === 'boolean', '密钥状态接口异常');
  assert(!JSON.stringify(credential).includes(admin.token), '状态接口泄露令牌');

  const lanHost = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `lan_${suffix}`, password: 'test123456', nickname: '局域网主' }),
  });
  const lanGuest = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `lang_${suffix}`, password: 'test123456', nickname: '局域网客' }),
  });
  const sidC = `sid-c-${suffix}`;
  const sidD = `sid-d-${suffix}`;
  const lanCreated = await request('/api/action', {
    method: 'POST', headers: headers(lanHost.token, sidC),
    body: JSON.stringify({ type: 'create', name: '局域网主', visibility: 'lan', maxGuesses: 8 }),
  });
  const lanCode = lanCreated.roomCode;
  const lan = await request('/api/lan/discover', { headers: headers(admin.token, sidA) });
  assert(Array.isArray(lan.rooms) && Array.isArray(lan.peers), '局域网发现接口异常');
  const discovered = lan.rooms.find((room) => room.code === lanCode);
  assert(discovered && discovered.lanToken, '局域网房间缺少发现令牌');
  const lanJoin = await request('/api/action', {
    method: 'POST', headers: headers(lanGuest.token, sidD),
    body: JSON.stringify({ type: 'join', name: '局域网客', roomCode: lanCode, lanToken: discovered.lanToken }),
  });
  assert(lanJoin.ok && lanJoin.roomCode === lanCode, '局域网房间应免密直接进入');

  console.log('SMOKE_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
