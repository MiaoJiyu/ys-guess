import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import { handleApi } from './shared/api.js';
import { appendEvent, createStore } from './shared/store.js';
import { performAction, roomPayload } from './shared/engine.js';
import { getUser } from './shared/user-store.js';
import { verifyToken, randomId } from './shared/crypto.js';
import { credentialStatus, credentialsFromEnv } from './shared/tencent.js';
import { SERVER_VERSION } from './shared/constants.js';

const root = import.meta.dirname;
const dataDir = process.env.TEYVAT_DATA_DIR || path.join(root, 'data');
const kvFile = path.join(dataDir, 'local-kv.json');
fs.mkdirSync(dataDir, { recursive: true });

function readTencentEnv() {
  const file = path.join(root, 'tencent_api.env');
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const tencentEnv = readTencentEnv();
const fileCredentials = credentialsFromEnv(tencentEnv);
const runtimeCredentials = credentialsFromEnv(process.env);
const tencentCredentials = {
  secretId: runtimeCredentials.secretId || fileCredentials.secretId,
  secretKey: runtimeCredentials.secretKey || fileCredentials.secretKey,
};
const env = {
  ...process.env,
  ...tencentCredentials,
  __credentialSource: tencentCredentials.secretId && tencentCredentials.secretKey ? 'tencent_api.env' : 'unconfigured',
  AUTH_SECRET: process.env.AUTH_SECRET || 'teyvat-local-development-secret',
  __runtime: 'node-local',
};

let memory = new Map();
if (fs.existsSync(kvFile)) {
  try { memory = new Map(Object.entries(JSON.parse(fs.readFileSync(kvFile, 'utf8')))); } catch { memory = new Map(); }
}
let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    fs.writeFile(kvFile, JSON.stringify(Object.fromEntries(memory), null, 2), () => {});
  }, 150);
}
const binding = {
  async get(key) { return memory.has(key) ? memory.get(key) : null; },
  async put(key, value) { memory.set(key, String(value)); persist(); },
  async delete(key) { memory.delete(key); persist(); },
};
env.__store = createStore({ __storeBinding: binding });

const store = env.__store;
const port = Number(process.argv[2] || process.env.PORT || 8787);
const lanPort = port;

async function seedLegacy() {
  const file = path.join(root, 'players.json');
  if (!fs.existsSync(file)) return;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [name, stats] of Object.entries(data || {})) {
      if (typeof name === 'string' && stats && typeof stats === 'object') {
        const { seedLegacyPlayer } = await import('./shared/user-store.js');
        await seedLegacyPlayer(store, name, {
          rating: Number(stats.rating || 1500),
          games: Number(stats.games || 0),
          wins: Number(stats.wins || 0),
          bestStreak: Number(stats.best_streak || 0),
          perfects: Number(stats.perfects || 0),
          hintsUsed: Number(stats.hints_used || 0),
        });
      }
    }
  } catch { /* 忽略旧数据格式异常 */ }
}

const staticFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/makers.css', 'makers.css'],
  ['/makers.js', 'makers.js'],
]);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function webRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const options = { method: req.method, headers: req.headers };
  if (!['GET', 'HEAD'].includes(req.method)) options.body = Buffer.concat(chunks);
  return new Request(url, options);
}

async function sendWebResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

const udp = dgram.createSocket('udp4');
const pendingDiscoveries = new Map();
let lanReady = false;

udp.on('message', (message, remote) => {
  const text = message.toString('utf8');
  if (!text.includes('TEYVAT_DISCOVERY_V1')) return;
  const reply = JSON.stringify({
    protocol: 'TEYVAT_DISCOVERY_V1',
    httpPort: lanPort,
    version: SERVER_VERSION,
    time: Date.now(),
  });
  udp.send(reply, remote.port, remote.address, () => {});
  try {
    const data = JSON.parse(text);
    if (data.protocol !== 'TEYVAT_DISCOVERY_V1' || !data.httpPort) return;
    for (const found of pendingDiscoveries.values()) {
      found.set(`${remote.address}:${data.httpPort}`, {
        ip: remote.address, httpPort: Number(data.httpPort), version: data.version,
      });
    }
  } catch { /* 查询报文无需解析 */ }
});

udp.on('error', (error) => {
  console.warn(`[lan] UDP 广播不可用：${error.message}`);
});

function discoverLan() {
  return new Promise((resolve) => {
    if (!lanReady) { resolve([]); return; }
    const id = randomId(8);
    const found = new Map();
    pendingDiscoveries.set(id, found);
    const message = Buffer.from(`TEYVAT_DISCOVERY_V1|${id}`);
    udp.send(message, 41234, '255.255.255.255', () => {});
    setTimeout(() => {
      pendingDiscoveries.delete(id);
      resolve([...found.values()]);
    }, 900);
  });
}

env.__discoverLan = discoverLan;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    try {
      const request = await webRequest(req);
      const response = await handleApi({ request, env });
      await sendWebResponse(res, response);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = staticFiles.get(url.pathname);
  if (!file || !fs.existsSync(path.join(root, file))) { res.writeHead(404); res.end('Not found'); return; }
  const content = fs.readFileSync(path.join(root, file));
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(content);
});

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const sockets = new Map();

function wsSendFrame(sock, opcode, payload = Buffer.alloc(0)) {
  if (!sock.writable || sock.destroyed) return;
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const length = data.length;
  let header;
  if (length < 126) header = Buffer.from([0x80 | opcode, length]);
  else if (length < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(length, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2); }
  sock.write(Buffer.concat([header, data]));
}

function send(sock, payload) {
  wsSendFrame(sock, 0x1, JSON.stringify(payload));
}

function parseWsFrames(buffer) {
  const frames = [];
  while (buffer.length >= 2) {
    const first = buffer[0];
    const second = buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    if ((first & 0x70) !== 0 || !masked) throw new Error('非法 WebSocket 帧头');
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) { if (buffer.length < 4) break; length = buffer.readUInt16BE(2); offset = 4; }
    else if (length === 127) { if (buffer.length < 10) break; length = Number(buffer.readBigUInt64BE(2)); offset = 10; }
    if (length > 1024 * 1024 || (opcode >= 0x8 && length > 125)) throw new Error('WebSocket 帧过大');
    let mask = buffer.subarray(offset, offset + 4);
    if (buffer.length < offset + 4) break;
    offset += 4;
    if (buffer.length < offset + length) break;
    let payload = Buffer.from(buffer.subarray(offset, offset + length));
    if (mask) payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    frames.push({ opcode, payload });
    buffer = buffer.subarray(offset + length);
  }
  return { frames, buffer };
}

async function bootstrapEvents(user, sid) {
  const { CHARACTERS, ALL_COLS, COL_LABELS, EMOTES, POOLS } = await import('./shared/engine.js');
  const { getLeaderboard } = await import('./shared/user-store.js');
  const events = [
    { type: 'characters', list: CHARACTERS, total: CHARACTERS.length, version: SERVER_VERSION, columns: ALL_COLS, columnLabels: COL_LABELS },
    { type: 'welcome', version: SERVER_VERSION, emotes: EMOTES, pools: POOLS, columns: ALL_COLS, hintCost: 20, maxPlayers: 8, serverTime: Date.now() / 1000 },
    { type: 'leaderboard', list: await getLeaderboard(store) },
    { type: 'profile', user: { id: user.id, nickname: user.nickname, username: user.username, role: user.role, stats: user.stats } },
  ];
  const code = await store.get(`session-room:${sid}`);
  const room = code ? await (await import('./shared/engine.js')).getRoom(store, code) : null;
  if (room && room.players[sid]) events.push(roomPayload(room, sid, await getLeaderboard(store)));
  return events;
}

function dispatch(scope, event) {
  const targetRoom = scope.startsWith('room:') ? scope.slice(5) : null;
  const targetUser = scope.startsWith('user:') ? scope.slice(5) : null;
  for (const [sid, client] of sockets) {
    if (targetRoom && client.roomCode !== targetRoom) continue;
    if (targetUser && client.user.id !== targetUser) continue;
    send(client.sock, event.type === 'room_update' ? { ...event, you: sid } : event);
  }
}

async function handleWsConnection(sock, request, head) {
  const key = request.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`, '', '',
  ].join('\r\n'));

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const claims = await verifyToken(url.searchParams.get('token') || '', env.AUTH_SECRET);
  const user = claims ? await getUser(store, claims.sub) : null;
  if (!user || user.disabled) {
    send(sock, { type: 'error', message: '登录状态无效，请重新登录' });
    sock.end();
    return;
  }
  const sid = url.searchParams.get('sid') || randomId(12);
  const client = { sock, user, roomCode: await store.get(`session-room:${sid}`) || null };
  sockets.set(sid, client);
  for (const event of await bootstrapEvents(user, sid)) send(sock, event);

  let buffer = head ? Buffer.from(head) : Buffer.alloc(0);
  let closed = false;
  const leave = async () => {
    if (closed) return;
    closed = true;
    sockets.delete(sid);
    const collected = [];
    const append = async (scope, event) => { await appendEvent(store, scope, event); collected.push({ scope, event }); };
    await performAction({ store, user, sessionId: sid, append }, { type: 'leave' }).catch(() => {});
    for (const item of collected) dispatch(item.scope, item.event);
  };

  sock.on('data', async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let parsed;
    try {
      parsed = parseWsFrames(buffer);
    } catch {
      await leave();
      sock.destroy();
      return;
    }
    buffer = parsed.buffer;
    for (const frame of parsed.frames) {
      if (frame.opcode === 0x8) { await leave(); sock.end(); return; }
      if (frame.opcode === 0x9) { wsSendFrame(sock, 0xa, frame.payload); continue; }
      if (frame.opcode !== 0x1) continue;
      let msg;
      try { msg = JSON.parse(frame.payload.toString('utf8')); } catch { continue; }
      const collected = [];
      const append = async (scope, event) => { await appendEvent(store, scope, event); collected.push({ scope, event }); };
      try {
        const result = await performAction({ store, user, sessionId: sid, append, env }, msg);
        if (result.roomCode) client.roomCode = result.roomCode;
        if (!result.ok && !result.silent && result.error) send(sock, { type: 'error', message: result.error });
        for (const item of collected) dispatch(item.scope, item.event);
      } catch (error) {
        send(sock, { type: 'error', message: error.message });
      }
    }
  });
  sock.on('close', leave);
  sock.on('error', leave);
}

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }
  handleWsConnection(socket, request, head).catch(() => socket.destroy());
});

try {
  udp.bind(41234, () => {
    lanReady = true;
    udp.setBroadcast(true);
  });
} catch (error) {
  console.warn(`[lan] UDP 初始化失败：${error.message}`);
}

await seedLegacy();
server.listen(port, '0.0.0.0', () => {
  const status = credentialStatus(env);
  console.log('='.repeat(64));
  console.log(`提瓦特 · 元素猜谜 · Node.js 联机服务 ${SERVER_VERSION} 已启动`);
  console.log(`本地访问：http://localhost:${port}`);
  console.log(`局域网访问：http://<本机IP>:${port}（UDP 发现端口 41234）`);
  console.log(`腾讯云密钥：${status.configured ? '已读取（值未输出）' : '未配置'}`);
  console.log('按 Ctrl+C 停止');
  console.log('='.repeat(64));
});
