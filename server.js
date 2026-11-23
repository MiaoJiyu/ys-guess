import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import { handleApi } from './shared/api.js';
import { appendEvent, createStore } from './shared/store.js';
import { performAction, roomPayload } from './shared/engine.js';
import { getUser } from './shared/user-store.js';
import { verifyToken, randomId } from './shared/crypto.js';
import { credentialStatus, credentialsFromEnv } from './shared/tencent.js';
import { SERVER_VERSION } from './shared/constants.js';

const root = import.meta.dirname;
const logsDir = path.join(root, 'logs');
fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, 'lan-server.log');

function logLine(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  console.log(line);
  try { fs.appendFileSync(logFile, line + '\n', 'utf8'); } catch { /* 日志不可写时不影响主服务 */ }
}

function getLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

async function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
}

async function pickPort(start) {
  for (let port = start; port < start + 20; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`端口 ${start}-${start + 19} 均被占用，请关闭占用程序后重试`);
}

const dataDir = process.env.TEYVAT_DATA_DIR || path.join(root, 'data');
const kvFile = path.join(dataDir, 'local-kv.json');
try {
  fs.mkdirSync(dataDir, { recursive: true });
} catch (error) {
  logLine('ERROR', `无法创建数据目录 ${dataDir}: ${error.message}`);
  process.exit(1);
}

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
let lanPort = Number(process.argv[2] || process.env.PORT || 8787);

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
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
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
  if (url.pathname === '/download/teyvat-lan-host.zip') {
    const download = getLanDownload();
    if (!download) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('启动包尚未生成，请联系房主。');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="teyvat-lan-host.zip"',
      'Content-Length': String(download.size),
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(download.path).pipe(res);
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    const assetsRoot = path.resolve(root, 'assets');
    const file = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(assetsRoot + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404);
      res.end('Asset not found');
      return;
    }
    const content = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(content);
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

function getLanDownload() {
  const candidates = [
    path.join(root, 'download', 'teyvat-lan-host.zip'),
    path.join(root, 'release', 'teyvat-lan-host.zip'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    return {
      url: '/download/teyvat-lan-host.zip',
      filename: 'teyvat-lan-host.zip',
      path: file,
      size: fs.statSync(file).size,
    };
  }
  return null;
}

let shuttingDown = false;
function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(persistTimer);
  try {
    fs.writeFileSync(kvFile, JSON.stringify(Object.fromEntries(memory), null, 2), 'utf8');
    logLine('INFO', `收到 ${reason}，本地数据已保存`);
  } catch (error) {
    logLine('ERROR', `退出时保存数据失败：${error.message}`);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logLine('ERROR', `未捕获异常：${error.stack || error.message}`);
});
process.on('unhandledRejection', (error) => {
  logLine('ERROR', `未处理 Promise 异常：${error?.stack || error}`);
});

try {
  udp.bind(41234, () => {
    lanReady = true;
    udp.setBroadcast(true);
    logLine('INFO', 'UDP 局域网发现已启动，端口 41234');
  });
  udp.on('error', (error) => logLine('WARN', `UDP 局域网发现不可用：${error.message}`));
} catch (error) {
  logLine('WARN', `UDP 初始化失败：${error.message}`);
}

const explicitPort = process.argv[2] || process.env.PORT;
const requestedPort = Number(explicitPort || 8787);
const actualPort = explicitPort ? requestedPort : await pickPort(requestedPort);
lanPort = actualPort;
const credentials = credentialStatus(env);
const download = getLanDownload();
if (download) {
  env.__lanDownload = {
    url: download.url,
    filename: download.filename,
    size: download.size,
  };
}

await seedLegacy();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(actualPort, '0.0.0.0', resolve);
}).catch((error) => {
  logLine('ERROR', `服务启动失败：${error.message}`);
  process.exit(1);
});

const lanAddresses = getLanAddresses();
logLine('INFO', '='.repeat(64));
logLine('INFO', `提瓦特 · 元素猜谜 · Node.js 联机服务 ${SERVER_VERSION} 已启动`);
logLine('INFO', `Node.js ${process.version} · ${os.type()} ${os.release()}`);
logLine('INFO', `本地访问：http://localhost:${actualPort}`);
if (lanAddresses.length) {
  for (const address of lanAddresses) logLine('INFO', `局域网访问：http://${address}:${actualPort}`);
} else {
  logLine('WARN', `未检测到局域网 IPv4 地址，请使用 http://<本机IP>:${actualPort}`);
}
logLine('INFO', `数据文件：${kvFile}`);
logLine('INFO', `日志文件：${logFile}`);
logLine('INFO', `腾讯云密钥：${credentials.configured ? '已读取（值未输出）' : '未配置'}`);
logLine('INFO', download ? `启动包下载：${download.url}` : '启动包下载：未找到 teyvat-lan-host.zip');
logLine('INFO', '按 Ctrl+C 停止');
logLine('INFO', '='.repeat(64));
