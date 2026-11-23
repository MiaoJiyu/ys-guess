/* ============================================================
   基础数据与状态
   ============================================================ */
const $ = id => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const ALL_COLS = ["gender", "region", "element", "weapon", "birthday", "version", "rarity"];
const COL_NAMES = {
  gender: "性别", region: "地区", element: "元素", weapon: "武器",
  birthday: "生日", version: "版本", rarity: "星级"
};
const COL_SHORT = {
  gender: "性别", region: "地区", element: "元素", weapon: "武器",
  birthday: "生日", version: "版本", rarity: "星星"
};
const REGION_ORDER = ["蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱", "至冬", "其他"];
const REGION_LORE = {
  "蒙德": "自由之都 · 风与原野",
  "璃月": "契约之港 · 岩与商路",
  "稻妻": "永恒之岛 · 雷与樱",
  "须弥": "智慧之国 · 草与梦",
  "枫丹": "正义之庭 · 水与歌剧",
  "纳塔": "战争之火 · 火与部族",
  "挪德卡莱": "月影边陲 · 岩与霜",
  "至冬": "冰雪王庭 · 寒与誓约",
  "其他": "旅途之外 · 未竟之章"
};
const ELEMENTS = {
  "风": { color: "#74d8b8", soft: "rgba(116,216,184,.28)", desc: "自由的风，会记住每一次相遇。", icon: '<path d="M28 7c-6-5-15-3-17 4-2 6 4 11 10 8 4-2 3-8-1-8-3 0-4 3-2 5 3 4 9 2 9-3 0-5-5-8-10-7-7 2-9 9-5 14 4 6 13 7 18 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M27 26c4-1 6-3 7-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  "岩": { color: "#f1bd58", soft: "rgba(241,189,88,.27)", desc: "岩之契约，亘古不移。", icon: '<path d="M16 3l12 7v12l-12 7L4 22V10l12-7z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M16 9l6.5 3.8v7.4L16 24l-6.5-3.8v-7.4L16 9z" fill="currentColor" opacity=".55"/><path d="M9.5 12.8L16 16.6l6.5-3.8" fill="none" stroke="currentColor" stroke-width="1"/>' },
  "雷": { color: "#b58cff", soft: "rgba(181,140,255,.3)", desc: "雷光一瞬，照见永恒的须臾。", icon: '<path d="M19 2L7 18h7l-3 12 13-18h-8l3-10z" fill="currentColor" opacity=".88"/><path d="M19 2L7 18h7l-3 12 13-18h-8l3-10z" fill="none" stroke="currentColor" stroke-width=".8"/>' },
  "草": { color: "#9bdc55", soft: "rgba(155,220,85,.26)", desc: "草木萌发，智慧在叶脉间生长。", icon: '<path d="M27 4C14 4 5 11 5 22c0 3 2 6 5 6 12 0 17-9 17-24z" fill="currentColor" opacity=".55"/><path d="M9 27C13 18 19 12 26 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 19c2 1 4 1 6-1M17 14c2 1 4 1 6-1" fill="none" stroke="#0c1a0a" stroke-width="1.2" opacity=".5"/>' },
  "水": { color: "#59c9ff", soft: "rgba(89,201,255,.28)", desc: "水无常形，却映照万物本心。", icon: '<path d="M16 3C11 11 6 16 6 22a10 10 0 0020 0c0-6-5-11-10-19z" fill="currentColor" opacity=".5"/><path d="M16 3C11 11 6 16 6 22a10 10 0 0020 0c0-6-5-11-10-19z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 23c2 4 7 5 10 1" fill="none" stroke="#042334" stroke-width="1.4" opacity=".4" stroke-linecap="round"/>' },
  "火": { color: "#ff7a63", soft: "rgba(255,122,99,.28)", desc: "烈焰燃烧，也照亮回家的路。", icon: '<path d="M17 2c2 7-6 9-6 17a6 6 0 0012 0c0-4-3-6-3-10 4 2 8 7 8 12a11 11 0 01-22 0C6 12 13 8 17 2z" fill="currentColor" opacity=".58"/><path d="M17 2c2 7-6 9-6 17a6 6 0 0012 0c0-4-3-6-3-10 4 2 8 7 8 12a11 11 0 01-22 0C6 12 13 8 17 2z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M16 26c-2-3-1-6 2-9 0 3 2 4 2 7 0 2-2 4-4 2z" fill="#fff1cf" opacity=".7"/>' },
  "冰": { color: "#a9edff", soft: "rgba(169,237,255,.27)", desc: "霜雪无言，记录消逝与重逢。", icon: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13"/><path d="M16 7l-3-3M16 7l3-3M16 25l-3 3M16 25l3 3M7.5 12l-4-1M7.5 12l1-4M24.5 20l4 1M24.5 20l-1 4M7.5 20l-4 1M7.5 20l1 4M24.5 12l4-1M24.5 12l-1-4"/></g>' }
};
const ELEMENT_KEYS = Object.keys(ELEMENTS);
const WEAPONS = ["单手剑", "双手剑", "长弓", "弓", "法器", "长柄武器"];
const RARITY_STARS = n => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));

const state = {
  ws: null, myId: null, room: null, chars: [], charMap: new Map(),
  welcome: {}, emotes: {}, pools: [],
  leaderboard: [], myName: "",
  token: "", user: null, sessionId: "", rooms: [], lanRooms: [], lanDownload: null,
  eventCursor: 0, polling: null, hubTimer: null, hubTab: "public",
  activeLetter: null, query: "",
  myGuessed: new Set(), myHints: [], hintRound: null, currentCols: ALL_COLS,
  roundOver: true, clockOffset: 0, soundOn: true,
  codex: { q: "", element: "全部", region: "全部", weapon: "全部", rarity: "全部", focus: null },
  adminPwd: "", currentResult: null, reconnectTimer: null,
  feed: [], lastRoundKey: null, panel: "lobby", lastResultKey: null
};

/* ============================================================
   音效（WebAudio 合成，无外部资源）
   ============================================================ */
let audioCtx = null;
function initAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { audioCtx = null; }
  return audioCtx;
}
function tone(freq, dur = .16, type = "sine", vol = .055, delay = 0, slide = null) {
  if (!state.soundOn) return;
  const ctx = initAudio();
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + .03);
}
const sfx = {
  click() { tone(520, .055, "triangle", .028); },
  select() { tone(640, .06, "triangle", .032); tone(860, .06, "sine", .02, .04); },
  join() { [392, 523, 659].forEach((f, i) => tone(f, .18, "sine", .045, i * .09)); },
  correct() { [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, "sine", .065, i * .08)); tone(1568, .5, "triangle", .025, .34); },
  wrong() { tone(196, .18, "sawtooth", .04, 0, 150); tone(147, .28, "sine", .045, .1, 110); },
  hint() { [880, 1175, 1568].forEach((f, i) => tone(f, .35, "sine", .04, i * .07)); },
  win() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, .45, "sine", .06, i * .1)); tone(784, .7, "triangle", .03, .5); },
  lose() { tone(330, .25, "triangle", .04); tone(247, .4, "sine", .045, .14); },
  emote() { tone(720, .08, "triangle", .04); tone(960, .08, "sine", .03, .06); },
  tick() { tone(980, .035, "square", .015); }
};

/* ============================================================
   星空背景
   ============================================================ */
const canvas = $("starfield");
const ctx2d = canvas.getContext("2d");
let stars = [], shooting = null, starW = 0, starH = 0, dpr = 1;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function initStars() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  starW = window.innerWidth; starH = window.innerHeight;
  canvas.width = Math.floor(starW * dpr); canvas.height = Math.floor(starH * dpr);
  canvas.style.width = starW + "px"; canvas.style.height = starH + "px";
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  const count = Math.floor(Math.min(190, starW * starH / 9000));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * starW, y: Math.random() * starH,
    r: Math.random() * 1.25 + .25, a: Math.random(),
    speed: Math.random() * .015 + .003,
    hue: Math.random() < .18 ? "gold" : (Math.random() < .12 ? "cyan" : "white")
  }));
}
function drawStars(ts) {
  if (!ctx2d) return;
  ctx2d.clearRect(0, 0, starW, starH);
  const t = ts * .001;
  for (const s of stars) {
    s.a += s.speed * .02;
    const alpha = .25 + Math.abs(Math.sin(s.a + t * .25)) * .65;
    ctx2d.beginPath();
    ctx2d.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx2d.fillStyle = s.hue === "gold" ? `rgba(233,211,161,${alpha})`
      : s.hue === "cyan" ? `rgba(125,230,255,${alpha})`
      : `rgba(220,228,255,${alpha})`;
    ctx2d.fill();
    if (s.r > 1.05) {
      ctx2d.fillStyle = `rgba(255,255,255,${alpha * .12})`;
      ctx2d.beginPath(); ctx2d.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2); ctx2d.fill();
    }
  }
  if (!reduceMotion) {
    if (!shooting && Math.random() < .0035) {
      shooting = { x: Math.random() * starW * .8, y: Math.random() * starH * .35, vx: 2.6 + Math.random() * 2.2, vy: 1.1 + Math.random() * 1.1, life: 1 };
    }
    if (shooting) {
      shooting.x += shooting.vx; shooting.y += shooting.vy; shooting.life -= .012;
      const grad = ctx2d.createLinearGradient(shooting.x, shooting.y, shooting.x - 90, shooting.y - 40);
      grad.addColorStop(0, `rgba(255,245,215,${Math.max(0, shooting.life) * .9})`);
      grad.addColorStop(1, "rgba(255,245,215,0)");
      ctx2d.strokeStyle = grad; ctx2d.lineWidth = 1.4; ctx2d.beginPath();
      ctx2d.moveTo(shooting.x, shooting.y); ctx2d.lineTo(shooting.x - 90, shooting.y - 40); ctx2d.stroke();
      if (shooting.life <= 0 || shooting.x > starW + 100) shooting = null;
    }
  }
  requestAnimationFrame(drawStars);
}
window.addEventListener("resize", initStars);
initStars();
requestAnimationFrame(drawStars);

/* ============================================================
   工具：元素图标 / 头像
   ============================================================ */
function sigil(el, extra = "") {
  const e = ELEMENTS[el];
  if (!e) return `<svg ${extra} viewBox="0 0 32 32"></svg>`;
  return `<svg ${extra} viewBox="0 0 32 32" fill="none" aria-hidden="true">${e.icon}</svg>`;
}
function elementStyle(el) {
  const e = ELEMENTS[el] || { color: "#e9d3a1", soft: "rgba(233,211,161,.2)" };
  return `--el:${e.color};--el-soft:${e.soft};`;
}
function charByName(name) { return state.charMap.get(name); }
function avatarColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 56% 48%)`;
}
function avatarHTML(name, cls = "", extraStyle = "") {
  const initial = String(name || "旅").trim().charAt(0) || "旅";
  return `<div class="avatar ${cls}" style="--av:${avatarColor(name)};${extraStyle}">${esc(initial)}</div>`;
}
function starsHTML(rarity) {
  return `<span class="stars ${rarity <= 4 ? "purple" : ""}">${RARITY_STARS(rarity)}</span>`;
}
function tierOf(rating) {
  if (rating >= 1900) return { name: "提瓦特传说", color: "#ffdf8b" };
  if (rating >= 1750) return { name: "深渊满星旅人", color: "#d5b8ff" };
  if (rating >= 1600) return { name: "元素共鸣者", color: "#8ee8ff" };
  if (rating >= 1450) return { name: "风之翼冒险家", color: "#9ce9c7" };
  return { name: "初来乍到的旅行者", color: "#b8bfd4" };
}

/* ============================================================
   连接与消息
   ============================================================ */
function setConn(kind, text) {
  const el = $("connBadge");
  el.className = "conn " + kind;
  el.querySelector("span").textContent = text;
}
function apiFetch(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (state.token) headers["Authorization"] = "Bearer " + state.token;
  if (state.sessionId) headers["X-Session-Id"] = state.sessionId;
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetch(path, { ...options, headers, cache: "no-store" });
}

function applyAccount(user) {
  if (!user) return;
  state.user = user;
  state.myName = user.nickname || user.username;
  const input = $("nameInput");
  if (input) {
    input.value = state.myName;
    input.readOnly = true;
  }
  const avatar = $("myAvatar");
  if (avatar) avatar.textContent = state.myName.slice(0, 1);
  window.dispatchEvent(new CustomEvent("teyvat-account", { detail: user }));
}

async function connect() {
  clearTimeout(state.reconnectTimer);
  setConn("connecting", "同步中");
  try {
    const response = await apiFetch("/api/bootstrap");
    const data = await response.json();
    if (response.status === 401 || data.code === 401) {
      window.dispatchEvent(new Event("teyvat-unauthorized"));
      setConn("offline", "未登录");
      return false;
    }
    if (!data.ok) throw new Error(data.error || "同步失败");
    if (data.user) applyAccount(data.user);
    for (const event of data.events || []) handleMsg(event);
    state.eventCursor = Number(data.cursor || 0);
    setConn("online", "已连接");
    state.soundOn && initAudio();
    startPolling();
    return true;
  } catch (error) {
    setConn("offline", "连接失败");
    toast("连接失败：" + (error.message || "请确认服务已启动"), true);
    state.reconnectTimer = setTimeout(connect, 4000);
    return false;
  }
}

let pollingBusy = false;

function pollDelay() {
  if (document.hidden) return 8000;
  if (state.room) return state.room.state === "playing" ? 1200 : 1800;
  return 4000;
}

function schedulePoll(delay = pollDelay()) {
  if (state.polling) clearTimeout(state.polling);
  state.polling = null;
  if (!state.token) return;
  state.polling = setTimeout(pollEvents, delay);
}

async function pollEvents() {
  if (!state.token || pollingBusy) return;
  if (document.hidden) { schedulePoll(8000); return; }
  pollingBusy = true;
  const params = new URLSearchParams({ since: String(state.eventCursor || 0) });
  if (state.room && state.room.code) params.set("room", state.room.code);
  try {
    const response = await apiFetch("/api/events?" + params.toString());
    const data = await response.json();
    if (data.ok) {
      for (const item of data.events || []) handleMsg(item.event);
      state.eventCursor = Math.max(state.eventCursor || 0, Number(data.cursor || 0));
    }
  } catch (_) { /* 轮询失败时下次重试 */ }
  finally {
    pollingBusy = false;
    schedulePoll();
  }
}

function startPolling() {
  if (state.polling) clearTimeout(state.polling);
  schedulePoll(0);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.token) schedulePoll(0);
});

async function sendMsg(obj) {
  if (!state.token) {
    toast("请先登录账号", true);
    window.dispatchEvent(new Event("teyvat-unauthorized"));
    return false;
  }
  try {
    const response = await apiFetch("/api/action", {
      method: "POST",
      body: JSON.stringify(obj),
    });
    const data = await response.json();
    if (!data.ok && !data.silent && data.error) toast(data.error, true);
    for (const item of data.events || []) handleMsg(item.event);
    pollEvents();
    return !!data.ok;
  } catch (error) {
    toast("操作失败：" + (error.message || "网络异常"), true);
    return false;
  }
}

function handleMsg(msg) {
  switch (msg.type) {
    case "characters":
      state.chars = Array.isArray(msg.list) ? msg.list : [];
      state.charMap = new Map(state.chars.map(c => [c.name, c]));
      if (Array.isArray(msg.columns) && msg.columns.length) {
        // 以服务端列顺序为准
        state.currentCols = msg.columns.slice();
      }
      $("heroCharCount").textContent = state.chars.length;
      if (state.room && state.room.state === "playing") {
        renderCandidates(); renderLetters();
      }
      if ($("modalRoot").classList.contains("hidden") === false && $("codexGrid")) renderCodex();
      if (!state.featuredName) renderFeatured();
      break;
    case "welcome":
      state.welcome = msg;
      state.emotes = msg.emotes || {};
      state.pools = msg.pools || [];
      renderEmoteBars();
      break;
    case "leaderboard":
      state.leaderboard = Array.isArray(msg.list) ? msg.list : [];
      renderLeaderboard();
      updateProfile();
      break;
    case "profile":
      applyAccount(msg.user);
      break;
    case "room_list":
      state.rooms = Array.isArray(msg.list) ? msg.list : [];
      window.dispatchEvent(new CustomEvent("teyvat-rooms", { detail: state.rooms }));
      break;
    case "lan_rooms":
      state.lanRooms = Array.isArray(msg.list) ? msg.list : [];
      window.dispatchEvent(new CustomEvent("teyvat-lan-rooms", { detail: state.lanRooms }));
      break;
    case "room_update":
      handleRoomUpdate(msg);
      break;
    case "game_start":
      handleGameStart(msg);
      break;
    case "guess_result":
      handleGuessResult(msg);
      break;
    case "hint_result":
      handleHintResult(msg);
      break;
    case "game_end":
      renderRoundResult(msg);
      break;
    case "match_end":
      renderMatchResult(msg);
      break;
    case "time_up":
      toast("⌛ " + (msg.message || "时间到！"), false);
      sfx.lose();
      break;
    case "cheat_result":
      toast(msg.message || (msg.success ? "外挂已激活" : "激活失败"), !msg.success);
      break;
    case "focus_loss":
      toast(msg.message || `检测到切屏 ${msg.count || 0} 次`, msg.count >= (msg.limit || 3));
      break;
    case "focus_warning":
    case "focus_forfeit":
    case "focus_appeal_result":
    case "focus_reset":
      window.dispatchEvent(new CustomEvent("teyvat-focus-event", { detail: msg }));
      if (msg.type === "focus_forfeit") { toast(msg.message || "切屏超限，本局判负", true); sfx.lose(); }
      else if (msg.message) toast(msg.message, msg.type === "focus_warning");
      break;
    case "emote":
      showEmote(msg);
      break;
    case "left":
      state.room = null;
      showPanel("hub");
      window.dispatchEvent(new Event("teyvat-left-room"));
      toast("你已离开秘境");
      break;
    case "admin_result":
      handleAdminResult(msg);
      break;
    case "pong":
      break;
    case "error":
      toast(msg.message || "发生了一点意外", true);
      break;
    default:
      break;
  }
}

function handleRoomUpdate(msg) {
  const prev = state.room;
  if (!msg.you && state.user) {
    const mine = (msg.players || []).find(p => p.userId === state.user.id);
    if (mine) msg.you = mine.id;
  }
  state.room = msg;
  if (msg.you) state.myId = msg.you;
  if (typeof msg.serverTime === "number") state.clockOffset = Date.now() - msg.serverTime * 1000;
  if (!msg.enabledCols) msg.enabledCols = ALL_COLS;
  state.currentCols = msg.enabledCols;
  updateProfile();
  if (state.panel === "feedback") return;
  if (msg.state === "round_ended") {
    const key = `${msg.code}:${msg.currentMatchRound}:round:${msg.lastGameEnd?.reason || ""}`;
    if (msg.lastGameEnd && state.lastResultKey !== key) {
      renderRoundResult(msg.lastGameEnd);
    } else if (!msg.lastGameEnd && state.panel !== "result") {
      state.roundOver = true;
      showPanel("result");
      $("resultEyebrow").textContent = "ROUND ENDED";
      $("resultTitle").textContent = "本局已结束";
      $("resultSub").textContent = "结算数据暂不可用，请等待房主开启下一局。";
      $("answerCard").innerHTML = "";
      $("podium").innerHTML = "";
      $("rankingList").innerHTML = '<div class="lb-empty">结算数据正在同步</div>';
      $("nextBtn").classList.add("hidden");
      $("rematchBtn").classList.add("hidden");
      $("waitHostTip").classList.remove("hidden");
      $("waitHostTip").textContent = "等待房主开启下一局…";
    }
    return;
  }
  if (msg.state === "match_ended") {
    if (msg.lastMatchEnd && state.lastResultKey !== `${msg.code}:match`) {
      renderMatchResult(msg.lastMatchEnd);
    } else if (!msg.lastMatchEnd && state.panel !== "result") {
      state.roundOver = true;
      showPanel("result");
      $("resultEyebrow").textContent = "MATCH ENDED";
      $("resultTitle").textContent = "大场已结束";
      $("resultSub").textContent = "结算数据暂不可用，请返回房间或重新加入。";
      $("answerCard").innerHTML = "";
      $("podium").innerHTML = "";
      $("rankingList").innerHTML = '<div class="lb-empty">结算数据正在同步</div>';
      $("nextBtn").classList.add("hidden");
      $("rematchBtn").classList.add("hidden");
      $("waitHostTip").classList.remove("hidden");
      $("waitHostTip").textContent = "等待房主返回房间…";
    }
    return;
  }
  if (msg.state === "waiting") {
    showPanel("wait");
    renderWait();
  } else if (msg.state === "playing") {
    if (!prev || prev.state !== "playing") {
      // 首次进入本局，确保界面就绪
      showPanel("game");
      buildTableHeader(state.currentCols);
      $("guessBody").innerHTML = "";
      $("emptyBoard").classList.remove("hidden");
      renderLetters();
      renderCandidates();
    }
    showPanel("game");
    scheduleGameRender();
  }
}

/* ============================================================
   面板 / 提示
   ============================================================ */
function showPanel(name) {
  const map = { lobby: "lobbyPanel", hub: "hubPanel", feedback: "feedbackPanel", wait: "waitPanel", game: "gamePanel", result: "resultPanel" };
  const target = map[name];
  if (!target) return;
  ["lobbyPanel", "hubPanel", "feedbackPanel", "waitPanel", "gamePanel", "resultPanel"].forEach(id => {
    $(id).classList.toggle("hidden", id !== target);
  });
  if (name === "hub") window.dispatchEvent(new Event("teyvat-hub-open"));
  if (name === "feedback") window.dispatchEvent(new Event("teyvat-feedback-open"));
  if (state.panel !== name) {
    state.panel = name;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.dispatchEvent(new CustomEvent("teyvat-panel-change", { detail: name }));
}

let toastTimer = null;
function toast(text, isError = false) {
  const el = $("toast");
  el.textContent = text;
  el.classList.toggle("err", !!isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

/* ============================================================
   个人资料 / 排行榜
   ============================================================ */
function updateProfile() {
  const input = $("nameInput");
  const name = (state.myName || (input ? input.value : "") || "").trim();
  if (input && document.activeElement !== input && input.value !== name) input.value = name;
  const shown = name || "旅";
  const av = $("myAvatar");
  if (av) {
    av.textContent = shown.charAt(0) || "旅";
    av.style.setProperty("--av", avatarColor(shown || "旅"));
  }
  const entry = state.leaderboard.find(p => p.name === name);
  const meta = $("myMeta");
  const badge = $("myBadge");
  if (entry) {
    const tier = tierOf(entry.rating);
    if (meta) meta.textContent = `Rating ${entry.rating} · ${entry.games} 场 · 最高连击 ${entry.bestStreak || 0}`;
    if (badge) {
      badge.textContent = entry.title || tier.name;
      badge.style.color = tier.color;
      badge.style.borderColor = "color-mix(in srgb, " + tier.color + " 45%, transparent)";
    }
  } else if (name) {
    if (meta) meta.textContent = "尚未留下足迹 · 完成一场大场即可上榜";
    if (badge) { badge.textContent = "未上榜"; badge.style.color = ""; badge.style.borderColor = ""; }
  } else {
    if (meta) meta.textContent = "尚未踏入提瓦特，完成一场大场即可留名";
    if (badge) { badge.textContent = "未上榜"; badge.style.color = ""; badge.style.borderColor = ""; }
  }
}

function renderLeaderboard() {
  const box = $("lbList");
  if (!box) return;
  if (!state.leaderboard.length) {
    box.innerHTML = '<div class="lb-empty"><b>星辰尚未记录</b>完成一场大场，让提瓦特记住你的名字。</div>';
    return;
  }
  box.innerHTML = state.leaderboard.map((p, i) => {
    const medal = ["Ⅰ", "Ⅱ", "Ⅲ"][i] || String(i + 1).padStart(2, "0");
    const isMe = p.name === state.myName;
    return `
      <div class="lb-item${i < 3 ? " top" + (i + 1) : ""}${isMe ? " me" : ""}" style="animation-delay:${i * 25}ms">
        <div class="lb-rank">${medal}</div>
        ${avatarHTML(p.name, "sm")}
        <div class="lb-info">
          <div class="lb-name">${esc(p.name)}${isMe ? " <span style=\"color:var(--gold);font-size:9px;\">（你）</span>" : ""}</div>
          <div class="lb-title">${esc(p.title || tierOf(p.rating).name)} · ${p.wins || 0} 胜</div>
        </div>
        <div class="lb-score">
          <div class="lb-rating">${p.rating}</div>
          <span class="lb-games">${p.games} 场</span>
        </div>
      </div>`;
  }).join("");
}

/* ============================================================
   大厅装饰
   ============================================================ */
function renderFeatured(name) {
  const box = $("featuredCard");
  if (!box) return;
  if (!state.chars.length) {
    box.innerHTML = '<div class="featured-card" style="--el:#e9d3a1;display:grid;place-items:center;color:var(--muted-2);font-size:12px;">正在读取提瓦特档案…</div>';
    return;
  }
  let c = name ? charByName(name) : charByName(state.featuredName);
  if (!c) c = pick(state.chars);
  state.featuredName = c.name;
  const el = ELEMENTS[c.element] || ELEMENTS["风"];
  box.innerHTML = `
    <div class="featured-card" style="${elementStyle(c.element)}">
      <div class="featured-sigil">${sigil(c.element)}</div>
      <div class="featured-top">
        <span class="tiny-tag">✦ 命运签 · DESTINY</span>
        ${starsHTML(c.rarity)}
      </div>
      <div class="featured-body">
        <div class="featured-avatar">${esc(c.name.charAt(0))}</div>
        <div class="featured-name">
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.region)} · ${esc(c.element)}元素 · ${esc(c.weapon)}</p>
        </div>
      </div>
      <div class="featured-quote">「${esc(el.desc)}」</div>
      <div class="featured-meta">
        <span class="meta-pill">地区 <b>${esc(c.region)}</b></span>
        <span class="meta-pill">武器 <b>${esc(c.weapon)}</b></span>
        <span class="meta-pill">生日 <b>${esc(c.birthday)}</b></span>
        <span class="meta-pill">实装 <b>v${esc(c.version)}</b></span>
      </div>
    </div>`;
  box.title = "点击查看角色图鉴";
  box.onclick = () => openCodex(c.name);
}

function renderDaily() {
  const day = Math.floor(Date.now() / 86400000);
  const elName = ELEMENT_KEYS[day % ELEMENT_KEYS.length];
  const el = ELEMENTS[elName];
  const texts = {
    "风": "愿自由的风，指引你的下一次猜测。",
    "岩": "契约已成，答案藏在磐石之下。",
    "雷": "雷光会照亮那些被忽略的线索。",
    "草": "智慧的枝叶，正在线索中生长。",
    "水": "让水面的倒影，映出正确的名字。",
    "火": "带着烈焰般的直觉，先人一步。",
    "冰": "冷静观察，真相会在霜面上显形。"
  };
  const strip = $("dailyStrip");
  if (strip) strip.style.cssText = elementStyle(elName);
  const ds = $("dailySigil");
  if (ds) ds.innerHTML = sigil(elName);
  const dt = $("dailyTitle");
  if (dt) dt.textContent = "今日元素 · " + elName;
  const dx = $("dailyText");
  if (dx) dx.textContent = texts[elName] || el.desc;
  const pulse = $("elementPulse");
  if (pulse) pulse.style.cssText = elementStyle(elName);
  const ps = $("pulseSigil");
  if (ps) ps.innerHTML = sigil(elName);
  const pn = $("pulseName");
  if (pn) pn.textContent = elName;
  const pd = $("pulseDesc");
  if (pd) pd.textContent = texts[elName] || el.desc;
}

/* ============================================================
   等待页 / 房间设置
   ============================================================ */
function renderWait() {
  const room = state.room;
  if (!room) return;
  const isHost = room.hostId === state.myId;
  $("roomCodeText").textContent = room.code;
  $("waitRoomLabel").textContent = "· " + room.code;
  $("playerCount").textContent = room.players.length;
  const box = $("waitPlayers");
  box.innerHTML = room.players.map(p => {
    const entry = state.leaderboard.find(x => x.name === p.name);
    const title = entry ? entry.title : tierOf(p.rating).name;
    return `
      <div class="party-card${p.id === room.hostId ? " host" : ""}">
        ${avatarHTML(p.name)}
        <div class="p-main">
          <div class="p-name">${esc(p.name)}${p.id === state.myId ? '<span style="color:var(--gold-2);font-size:9px;">（你）</span>' : ""}${p.id === room.hostId ? '<span class="crown">♛</span>' : ""}</div>
          <div class="p-sub">${esc(title)}${p.id === room.hostId ? " · 房主" : ""}</div>
        </div>
        <div class="p-rating">${p.rating}</div>
      </div>`;
  }).join("");
  const startBtn = $("startBtn");
  startBtn.classList.toggle("hidden", !isHost);
  startBtn.disabled = false;
  $("startHint").textContent = isHost ? "所有人到齐后，敲响开始之钟。" : "等待房主调整秘仪并开始…";
  $("hostOnlyTip").textContent = isHost ? "你是房主 · 可调整" : "仅房主可调整";
  $("hostOnlyTip").style.color = isHost ? "var(--gold)" : "";
  renderSettings();
}

function renderSettings() {
  const room = state.room;
  if (!room) return;
  const isHost = room.hostId === state.myId;
  const limit = room.maxGuessesLimit || state.chars.length || 1;

  const maxInp = $("maxGuessInput");
  maxInp.min = 1; maxInp.max = limit; maxInp.disabled = !isHost;
  if (document.activeElement !== maxInp) maxInp.value = room.maxGuesses;
  $("guessMinus").disabled = !isHost || room.maxGuesses <= 1;
  $("guessPlus").disabled = !isHost || room.maxGuesses >= limit;
  $("guessLimitTip").textContent = `1 ~ ${limit}`;

  const mrInp = $("matchRoundsInput");
  mrInp.disabled = !isHost;
  if (document.activeElement !== mrInp) mrInp.value = room.matchRounds;
  $("roundsMinus").disabled = !isHost || room.matchRounds <= 1;
  $("roundsPlus").disabled = !isHost || room.matchRounds >= 20;

  const timeWrap = $("timeChips");
  const times = [0, 60, 90, 120, 180, 300];
  timeWrap.innerHTML = times.map(t => {
    const label = t === 0 ? "不限时" : (t >= 60 ? `${t / 60} 分钟` : `${t} 秒`);
    return `<button class="chip${room.timeLimit === t ? " active" : ""}" data-time="${t}" ${isHost ? "" : "disabled"}>${label}</button>`;
  }).join("");
  $("timeLimitTip").textContent = room.timeLimit ? `${room.timeLimit} 秒` : "不限时";

  const df = $("doubleFinalToggle");
  df.classList.toggle("on", !!room.doubleFinal);
  df.disabled = !isHost;
  df.setAttribute("aria-checked", room.doubleFinal ? "true" : "false");

  const ht = $("hintsToggle");
  ht.classList.toggle("on", !!room.hintsEnabled);
  ht.disabled = !isHost;
  ht.setAttribute("aria-checked", room.hintsEnabled ? "true" : "false");
  const hi = $("hintsInput");
  hi.disabled = !isHost; hi.min = 0; hi.max = 5;
  if (document.activeElement !== hi) hi.value = room.hintsPerMatch;
  $("hintsMinus").disabled = !isHost || room.hintsPerMatch <= 0;
  $("hintsPlus").disabled = !isHost || room.hintsPerMatch >= 5;

  const pools = state.pools.length ? state.pools : ["全部", "蒙德", "璃月", "稻妻", "须弥", "枫丹", "纳塔", "挪德卡莱", "至冬", "其他"];
  $("poolRow").innerHTML = pools.map(p => `
    <button class="chip${room.pool === p ? " active" : ""}" data-pool="${esc(p)}" ${isHost ? "" : "disabled"}>${esc(p)}</button>
  `).join("");
  $("poolSizeTip").textContent = `${room.poolSize || 0} 位角色`;

  const enabled = new Set(room.enabledCols || ALL_COLS);
  $("colRow").innerHTML = ALL_COLS.map(c => `
    <button class="col-toggle${enabled.has(c) ? " active" : ""}" data-col="${c}" ${isHost ? "" : "disabled"}>${COL_SHORT[c]}</button>
  `).join("");
  const off = ALL_COLS.length - enabled.size;
  let tip;
  if (off <= 0) tip = "所有提示列开启——适合初次到访的旅行者。";
  else if (enabled.size === 0) tip = "全部提示关闭——纯靠记忆与直觉的盲猜。";
  else tip = `已关闭 ${off} 列提示，推理难度提升。`;
  $("colTip").textContent = tip;
  $$(".preset-row .chip").forEach(btn => {
    let active = false;
    const preset = btn.dataset.colPreset;
    if (preset === "all") active = enabled.size === ALL_COLS.length;
    if (preset === "lean") active = enabled.size === 4 && enabled.has("region") && enabled.has("element") && enabled.has("weapon") && enabled.has("rarity");
    if (preset === "blind") active = enabled.size === 0;
    btn.classList.toggle("active", active);
    btn.disabled = !isHost;
  });
}

function sendOptions(patch) { sendMsg({ type: "set_options", ...patch }); }

/* ============================================================
   游戏主界面
   ============================================================ */
function handleGameStart(msg) {
  if (!$("modalRoot").classList.contains("hidden")) closeModal();
  $("toast").classList.remove("show");
  state.roundOver = false;
  state.myGuessed.clear();
  state.myHints = [];
  state.hintLog = [];
  state.hintRound = Number(
    typeof msg.currentMatchRound === "number"
      ? msg.currentMatchRound
      : (state.room && state.room.currentMatchRound) || 0
  );
  const hintResultsBox = $("hintResults");
  if (hintResultsBox) {
    hintResultsBox.innerHTML = '<div class="hint-empty">本局尚未窥探命运。元素视野会揭示元素、地区、武器、生日等属性之一。</div>';
  }
  state.activeLetter = null;
  state.query = "";
  const search = $("charSearch");
  if (search) search.value = "";
  state.currentCols = msg.enabledCols || (state.room && state.room.enabledCols) || ALL_COLS;
  if (state.room) {
    state.room.state = "playing";
    if (msg.modifier) state.room.modifier = msg.modifier;
    if (typeof msg.roundMaxGuesses === "number") state.room.roundMaxGuesses = msg.roundMaxGuesses;
    if (typeof msg.currentMatchRound === "number") state.room.currentMatchRound = msg.currentMatchRound;
    if (typeof msg.matchRounds === "number") state.room.matchRounds = msg.matchRounds;
    if (typeof msg.roundDeadline === "number") state.room.roundDeadline = msg.roundDeadline;
    if (typeof msg.timeLimit === "number") state.room.timeLimit = msg.timeLimit;
    if (typeof msg.doubleFinal === "boolean") state.room.doubleFinal = msg.doubleFinal;
  }
  if (typeof msg.serverTime === "number") state.clockOffset = Date.now() - msg.serverTime * 1000;
  state.lastTickKey = null;

  $("guessBody").innerHTML = "";
  $("emptyBoard").classList.remove("hidden");
  $("banner").className = "banner hidden";
  $("banner").innerHTML = "";
  buildTableHeader(state.currentCols);
  showPanel("game");
  renderLetters();
  renderCandidates();
  renderGame();
  if (msg.modifier) {
    const strip = $("modifierStrip");
    strip.classList.remove("pop");
    void strip.offsetWidth;
    strip.classList.add("pop");
    if (msg.modifier.id !== "none") toast(`地脉异变 · ${msg.modifier.name}`, false);
    flashRound(msg.modifier.element);
  }
  sfx.join();
}

function syncHintRound(room) {
  // 即使 game_start 因网络/切后台丢失，也强制按小局号清空上一局的元素视野记录
  const roundNo = Number(room.currentMatchRound) || 0;
  if (state.hintRound !== roundNo) {
    state.hintRound = roundNo;
    state.myHints = [];
    state.hintLog = [];
    const box = $("hintResults");
    if (box) {
      box.innerHTML = '<div class="hint-empty">本局尚未窥探命运。元素视野会揭示元素、地区、武器、生日等属性之一。</div>';
    }
  }
}

let gameRenderFrame = 0;

function scheduleGameRender() {
  if (gameRenderFrame) return;
  gameRenderFrame = requestAnimationFrame(() => {
    gameRenderFrame = 0;
    renderGame();
  });
}

function renderGame() {
  const room = state.room;
  if (!room) return;
  syncHintRound(room);
  $("gameRoomCode").textContent = room.code;
  $("matchProgress").textContent = `${room.currentMatchRound + 1} / ${room.matchRounds}`;
  $("poolLabel").textContent = room.pool || "全部";

  const me = room.players.find(p => p.id === state.myId);
  const eff = room.roundMaxGuesses || room.maxGuesses;
  const focusLimit = room.focusLossLimit || 3;
  const focusCount = me ? Number(me.focusLosses || 0) : 0;
  const focusBadge = $("focusCount");
  if (focusBadge) {
    focusBadge.textContent = `${focusCount} / ${focusLimit}`;
    focusBadge.classList.toggle("warn", focusCount === focusLimit);
    focusBadge.classList.toggle("danger", focusCount > focusLimit);
  }
  const cheatCard = $("cheatCard");
  const cheatButton = $("cheatBtn");
  const cheatDesc = $("cheatDesc");
  if (cheatCard && cheatButton && cheatDesc) {
    const active = !!(me && me.cheatActive);
    cheatCard.classList.toggle("active", active);
    cheatButton.textContent = active ? "无限星辉已生效" : "启用外挂";
    cheatButton.disabled = active;
    cheatDesc.textContent = active
      ? "本场已获得无限星辉：元素视野不再消耗次数或积分，并可能直接揭示答案。"
      : "知道密语？本场可无限使用元素视野，并有机会窥见答案。";
  }
  if (me) {
    const remain = Math.max(0, eff - me.guessesCount);
    $("remainGuesses").textContent = remain;
    $("roundMax").textContent = eff;
    const pips = $("remainPips");
    if (eff <= 14) {
      pips.innerHTML = Array.from({ length: eff }, (_, i) =>
        `<i class="${i < (eff - remain) ? "used" : ""}"></i>`).join("");
    } else {
      pips.innerHTML = `<i style="width:22px;background:rgba(233,211,161,.5)"></i><span style="font-size:8px;color:var(--muted-2);margin-left:2px;">剩余 ${remain}</span>`;
    }
  }
  renderModifier(room.modifier);
  renderHints();
  renderPlayers();
  renderEmoteBars();
  updateCandidateDisabled();
  updateClockView();
}

function renderModifier(mod) {
  const strip = $("modifierStrip");
  if (!strip) return;
  const m = mod || { id: "none", name: "风平浪静", element: null, desc: "地脉平稳，本局没有额外变化。" };
  const el = m.element || "风";
  const e = ELEMENTS[el] || ELEMENTS["风"];
  strip.style.cssText = elementStyle(el);
  let badge = "平稳";
  if (m.guess_delta > 0) badge = `+${m.guess_delta} 次`;
  else if (m.guess_delta < 0) badge = `${m.guess_delta} 次`;
  else if (m.score_mult) badge = `×${m.score_mult}`;
  else if (m.flat_bonus) badge = `+${m.flat_bonus} 分`;
  else if (m.remain_extra) badge = `剩余 +${m.remain_extra}`;
  else if (m.free_hint) badge = "视野免费";
  else if (m.hint_refund) badge = "返还星辉";
  strip.innerHTML = `
    <div class="mod-sigil">${m.element ? sigil(m.element) : '<div style="display:grid;place-items:center;height:100%;font-size:25px;color:var(--gold);">✦</div>'}</div>
    <div class="mod-text">
      <div class="mod-kicker">LEY LINE DISORDER · 地脉异变</div>
      <b>${esc(m.name)}</b>
      <p>${esc(m.desc)}</p>
    </div>
    <div class="mod-badge">${esc(badge)}</div>`;
}

function renderHints() {
  const room = state.room;
  if (!room) return;
  const me = room.players.find(p => p.id === state.myId);
  const charges = $("hintCharges");
  const max = room.hintsPerMatch || 0;
  const left = me ? me.hintsLeft : 0;
  const cheat = !!(me && me.cheatActive);
  const box = $("hintResults");
  const btn = $("hintBtn");
  const desc = $("hintDesc");

  charges.innerHTML = cheat
    ? '<span style="font-size:10px;color:#d8c4ff;">∞ 无限星辉</span>'
    : max ? Array.from({ length: max }, (_, i) =>
      `<i class="${i < left ? "on" : ""}"></i>`).join("") : '<span style="font-size:9px;color:var(--muted-2);">已关闭</span>';

  // 先渲染本局记录，任何后续按钮状态分支都不会留下上一局的 DOM
  if (state.myHints.length) {
    box.innerHTML = state.myHints.map(h => `
      <div class="hint-item"><span>${esc(h.label)}</span><b>${esc(h.value)}</b></div>
    `).join("");
  } else {
    box.innerHTML = '<div class="hint-empty">本局尚未窥探命运。元素视野会揭示元素、地区、武器、生日等属性之一。</div>';
  }

  if (cheat) {
    if (state.roundOver || (me && me.done)) {
      desc.textContent = "推演已经结束，等待本局结算。";
      btn.disabled = true;
      btn.innerHTML = "等待结算";
    } else {
      desc.textContent = "无限星辉已生效：不消耗次数与积分，并可能直接揭示答案。";
      btn.disabled = false;
      btn.innerHTML = '开启元素视野 <span id="hintCostLabel">∞</span>';
    }
    return;
  }
  if (!room.hintsEnabled) {
    desc.textContent = "本房间已关闭元素视野。相信自己的直觉吧。";
    btn.disabled = true;
    btn.innerHTML = "元素视野已关闭";
    box.innerHTML = '<div class="hint-empty">房主关闭了这条窥探命运的路径。</div>';
    return;
  }
  if (left <= 0) {
    desc.textContent = "星辉已经耗尽，这份力量本局无法再使用。";
    btn.disabled = true;
    btn.innerHTML = "星辉耗尽";
  } else if (state.roundOver || (me && me.done)) {
    desc.textContent = "推演已经结束，等待本局结算。";
    btn.disabled = true;
    btn.innerHTML = "等待结算";
  } else {
    desc.textContent = "消耗 1 点星辉，随机揭示答案的一项属性；结算时扣除对应积分。";
    btn.disabled = false;
    btn.innerHTML = `开启元素视野 <span id="hintCostLabel">−${room.hintCost || 20}</span>`;
    const free = room.modifier && room.modifier.free_hint;
    if (free) {
      btn.innerHTML = '开启元素视野 <span id="hintCostLabel">本局免费</span>';
    }
    const modalHint = room.modifier && room.modifier.hint_refund && me && (me.roundHints || 0) === 0;
    if (modalHint) btn.innerHTML = '开启元素视野 <span id="hintCostLabel">首次返还</span>';
  }
}

function renderPlayers() {
  const room = state.room;
  if (!room) return;
  const box = $("playersProgress");
  if (!box) return;
  box.innerHTML = room.players.map(p => {
    const isMe = p.id === state.myId;
    let status;
    if (p.winOrder) status = `<span class="p-status win">♛ 第 ${p.winOrder} 位猜中 · +${p.roundScore}</span>`;
    else if (p.done) status = '<span class="p-status">本局已结束 · +0</span>';
    else status = `<span class="p-status">已推演 ${p.guessesCount} 次</span>`;
    const streak = p.streak > 1 ? `<span class="p-streak"> · ${p.streak} 连胜</span>` : "";
    return `
      <div class="p-card${p.done ? " done" : ""}${p.winOrder ? " win" : ""}${isMe ? " me" : ""}" data-pid="${p.id}">
        ${avatarHTML(p.name, "sm")}
        <div class="p-main">
          <div class="p-name">${esc(p.name)}${isMe ? "（你）" : ""}</div>
          ${status}
        </div>
        <div class="p-score"><b>${p.totalScore}</b><span>${p.wins} 胜${streak}</span></div>
      </div>`;
  }).join("");
  const alive = room.players.filter(p => !p.done).length;
  $("aliveCount").textContent = `进行中 ${alive} / ${room.players.length}`;
  box.querySelectorAll(".p-card").forEach(card => {
    card.onclick = () => {
      const p = room.players.find(x => x.id === card.dataset.pid);
      if (p) showPlayerGuesses(p);
    };
  });
}

function renderLetters() {
  const box = $("letters");
  if (!box) return;
  const available = new Set(state.chars.map(c => c.letter).filter(Boolean));
  box.innerHTML = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(L => {
    const empty = !available.has(L);
    const active = state.activeLetter === L;
    return `<button class="letter-btn${empty ? " empty" : ""}${active ? " active" : ""}" data-letter="${L}" ${empty ? "disabled" : ""}>${L}</button>`;
  }).join("");
}

function renderCandidates() {
  const box = $("candidateList");
  if (!box) return;
  if (!state.chars.length) {
    box.innerHTML = '<div class="candidate-empty">正在读取提瓦特角色档案…</div>';
    return;
  }
  const q = state.query.trim().toLowerCase();
  const pool = state.room && state.room.pool;
  const poolChars = (!pool || pool === "全部")
    ? state.chars
    : state.chars.filter(c => c.region === pool);
  let list = poolChars.filter(c => {
    if (state.activeLetter && c.letter !== state.activeLetter) return false;
    if (q) {
      const hay = (c.name + " " + c.letter).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  // 只按姓名排序，避免通过排列顺序泄露地区、星级等任何角色信息
  list.sort((a, b) => {
    if (q) {
      const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (as !== bs) return as - bs;
    }
    return a.name.localeCompare(b.name, "zh");
  });

  const me = state.room && state.room.players.find(p => p.id === state.myId);
  const locked = state.roundOver || !me || me.done;
  $("candidateCount").textContent = `${list.length} / ${poolChars.length}`;
  if (!list.length) {
    box.innerHTML = '<div class="candidate-empty">星图上没有符合条件的名字。<br>试试清空搜索或切换首字母。</div>';
    return;
  }
  box.innerHTML = list.map(c => {
    const guessed = state.myGuessed.has(c.name);
    return `<button class="candidate" data-name="${esc(c.name)}" ${locked || guessed ? "disabled" : ""}>
      <span class="c-name">${esc(c.name)}</span>
    </button>`;
  }).join("");
}

function updateCandidateDisabled() {
  const me = state.room && state.room.players.find(p => p.id === state.myId);
  const locked = state.roundOver || !me || me.done;
  $$("#candidateList .candidate").forEach(btn => {
    btn.disabled = locked || state.myGuessed.has(btn.dataset.name);
  });
}

function buildTableHeader(cols) {
  const tr = $("guessHead");
  if (!tr) return;
  tr.innerHTML = '<th>角色</th>' + cols.map(c => `<th>${COL_NAMES[c] || c}</th>`).join("");
}

function addGuessRow(cells) {
  const tbody = $("guessBody");
  const tr = document.createElement("tr");
  cells.forEach((c, i) => {
    const td = document.createElement("td");
    td.className = c.status;
    td.style.animationDelay = (i * 45) + "ms";
    const icon = c.status === "correct" ? "✓" : (c.status === "similar" ? "≈" : "·");
    td.innerHTML = `<span class="cell-ico">${icon}</span>${esc(c.text)}`;
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
  $("emptyBoard").classList.add("hidden");
  const wrap = document.querySelector("#guessTable")?.closest(".table-wrap");
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function handleGuessResult(msg) {
  addGuessRow(msg.cells || []);
  if (msg.cells && msg.cells[0]) state.myGuessed.add(msg.cells[0].text);
  updateCandidateDisabled();
  const b = $("banner");
  const me = state.room && state.room.players.find(p => p.id === state.myId);
  if (msg.correct) {
    b.className = "banner win";
    b.innerHTML = `✦ 你猜对了！本局 <b>+${msg.roundScore || 0}</b> 分，等待结算…`;
    b.classList.remove("hidden");
    sfx.correct();
    burstConfetti(36);
  } else {
    sfx.wrong();
    const eff = state.room ? (state.room.roundMaxGuesses || state.room.maxGuesses) : 0;
    const used = me ? me.guessesCount : (msg.guessCount || 0);
    if (eff && used >= eff) {
      b.className = "banner lose";
      b.innerHTML = "机会已经用尽，等待同伴或本局结算…";
      b.classList.remove("hidden");
    }
  }
}

function handleHintResult(msg) {
  if (state.room) state.hintRound = Number(state.room.currentMatchRound) || 0;
  state.myHints.push({ label: msg.label, value: msg.value });
  if (msg.directReveal && msg.answerName) {
    state.myHints.push({ label: "命运低语", value: `答案：${msg.answerName}` });
  }
  sfx.hint();
  let text = `元素视野：答案的${msg.label}是「${msg.value}」`;
  if (msg.cheat) text += "（无限星辉）";
  else if (msg.freeHint) text += "（本局视野免费）";
  else if (msg.refunded) text += "（星辉已返还）";
  if (msg.directReveal && msg.answerName) text += ` ✦ ${msg.message || "答案已显现"}`;
  toast(text, false);
  if (state.room) {
    const me = state.room.players.find(p => p.id === state.myId);
    if (me && typeof msg.hintsLeft === "number") me.hintsLeft = msg.hintsLeft;
    if (me && typeof msg.roundHints === "number") me.roundHints = msg.roundHints;
  }
  renderHints();
}

/* ============================================================
   计时器
   ============================================================ */
let clockIdle = false;

function updateClockView() {
  const room = state.room;
  const ring = $("timerRing");
  const text = $("timerText");
  const sub = $("timerSub");
  if (!ring || !text || !sub) return;
  if (!room || room.state !== "playing") {
    if (clockIdle) return;
    clockIdle = true;
    ring.style.setProperty("--p", 100);
    ring.classList.remove("danger");
    text.textContent = "--";
    sub.textContent = "等待开始";
    return;
  }
  clockIdle = false;
  if (!room.roundDeadline || !room.timeLimit) {
    ring.style.setProperty("--p", 100);
    ring.classList.remove("danger");
    text.textContent = "∞";
    sub.textContent = "不限时";
    return;
  }
  const deadline = room.roundDeadline * 1000 + state.clockOffset;
  const remainMs = deadline - Date.now();
  const remain = Math.max(0, remainMs / 1000);
  const pct = clamp(remain / room.timeLimit * 100, 0, 100);
  ring.style.setProperty("--p", pct.toFixed(1));
  const secs = Math.ceil(remain);
  text.textContent = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;
  sub.textContent = secs > 0 ? "地脉时限" : "时间到";
  ring.classList.toggle("danger", secs <= 10);
  if (secs > 0 && secs <= 5 && !state.roundOver) {
    const key = `${room.currentMatchRound}-${secs}`;
    if (state.lastTickKey !== key) {
      state.lastTickKey = key;
      sfx.tick();
    }
  }
}
setInterval(updateClockView, 500);

/* ============================================================
   结算：小局 / 大场
   ============================================================ */
function answerCardHTML(target) {
  if (!target) return "";
  const el = ELEMENTS[target.element] || ELEMENTS["风"];
  return `
    <div class="answer-card" style="${elementStyle(target.element)}">
      <div class="answer-sigil">${sigil(target.element)}</div>
      <div class="answer-avatar-wrap">
        <div class="avatar answer-avatar" style="--av:${el.color};font-family:var(--serif);font-size:27px;">${esc(target.name.charAt(0))}</div>
        ${target.avatar ? `<img class="answer-avatar-img" src="${esc(target.avatar)}" alt="${esc(target.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ""}
      </div>
      <div class="answer-copy">
        <div class="a-kicker">THE ANSWER · 命运揭晓</div>
        <h3>${esc(target.name)}</h3>
        <p>${esc(target.region)} · ${esc(REGION_LORE[target.region] || "")} · ${esc(target.element)}元素 · ${esc(target.weapon)} ${starsHTML(target.rarity)}</p>
        <p style="margin-top:5px; color:var(--muted-2); font-family:var(--serif);">「${esc(el.desc)}」</p>
      </div>
      <div class="answer-attrs">
        <div class="answer-attr"><span>地区</span><b>${esc(target.region)}</b></div>
        <div class="answer-attr"><span>武器</span><b>${esc(target.weapon)}</b></div>
        <div class="answer-attr"><span>生日</span><b>${esc(target.birthday)}</b></div>
        <div class="answer-attr"><span>实装</span><b>v${esc(target.version)}</b></div>
      </div>
    </div>`;
}

function podiumHTML(entries, mode) {
  if (!entries || !entries.length) return "";
  if (mode === "round" && !entries[0].winOrder) {
    return '<div class="podium-none">✦ 本局无人触及真相。地脉归于沉寂，下一位旅行者仍有机会。</div>';
  }
  const top = entries.slice(0, 3);
  const order = [
    { e: top[1], rank: 2, col: 1, cls: "second" },
    { e: top[0], rank: 1, col: 2, cls: "first" },
    { e: top[2], rank: 3, col: 3, cls: "third" }
  ].filter(x => x.e);
  return `<div class="podium">${order.map(({ e, rank, col, cls }) => {
    const score = mode === "match" ? e.totalScore : e.roundScore;
    const sub = mode === "match"
      ? `${e.wins} 胜 · Rating ${e.newRating}`
      : `${e.guesses} 次推演 · 本场 ${e.totalScore} 分`;
    return `
      <div class="podium-item ${cls}" style="grid-column:${col};">
        ${rank === 1 ? '<span class="crown">♛</span>' : ""}
        ${avatarHTML(e.name, "pod-avatar" + (rank === 1 ? " lg" : ""))}
        <div class="pod-name">${esc(e.name)}</div>
        <div class="pod-sub">${esc(sub)}</div>
        <div class="pod-score">${score} 分</div>
        <div class="pod-base">${["Ⅰ", "Ⅱ", "Ⅲ"][rank - 1]}</div>
      </div>`;
  }).join("")}</div>`;
}

function rankingHTML(list, mode) {
  return list.map((r, i) => {
    const isMe = r.name === state.myName;
    let detail = "";
    let score = "";
    let sub = "";
    if (mode === "round") {
      detail = r.focusLossForfeited
        ? `切屏 ${r.focusLosses || 0} 次 · 本局判负`
        : r.winOrder ? `第 ${r.guesses} 次推演命中 · 本局 +${r.roundScore}` : `未猜中 · 共 ${r.guesses} 次推演`;
      if (r.hintsUsed && !r.focusLossForfeited) detail += ` · 元素视野 ${r.hintsUsed} 次`;
      if (r.perfect) detail += " · 一击必杀";
      if (r.streak > 1) detail += ` · ${r.streak} 连胜`;
      score = r.totalScore;
      sub = `${r.wins} 胜 · 大场累计`;
    } else {
      const sign = r.delta > 0 ? `<span class="rating-up">+${r.delta}</span>` : r.delta < 0 ? `<span class="rating-down">${r.delta}</span>` : '<span class="rating-same">±0</span>';
      detail = `${r.wins} 胜 · 最高连击 ${r.bestStreak || 0}${r.perfects ? ` · 一击必杀 ${r.perfects}` : ""}`;
      score = r.totalScore;
      sub = `Rating ${r.oldRating} → ${r.newRating} ${sign}`;
    }
    return `
      <li class="${isMe ? "me" : ""}">
        <div class="rk">${i + 1}</div>
        ${avatarHTML(r.name, "sm")}
        <div class="r-main">
          <div class="r-name">${esc(r.name)}${isMe ? "（你）" : ""} ${r.winOrder === 1 && mode === "round" ? '<span style="color:var(--gold);font-size:10px;">♛</span>' : ""}</div>
          <div class="r-detail">${detail}</div>
        </div>
        <div class="r-score"><b>${score}</b><span>${sub}</span></div>
      </li>`;
  }).join("");
}

function renderRoundResult(msg) {
  state.roundOver = true;
  state.currentResult = msg;
  state.lastResultKey = `${state.room?.code || msg.code || ""}:${msg.currentMatchRound}:round:${msg.reason || ""}`;
  if (state.room) {
    state.room.state = "round_ended";
    state.room.currentMatchRound = msg.currentMatchRound;
    state.room.roundDeadline = 0;
  }
  showPanel("result");
  const reasonLabel = msg.reason === "focus_loss" ? "FOCUS LOST" : msg.reason === "timeout" ? "TIME'S UP" : "SOLVED";
  $("resultEyebrow").textContent = `ROUND ${msg.currentMatchRound} / ${msg.matchRounds} · ${reasonLabel}`;
  $("resultTitle").textContent = `第 ${msg.currentMatchRound} 局 · 命运揭晓`;
  const winner = msg.ranking.find(r => r.winOrder === 1);
  const forfeits = (msg.ranking || []).filter(r => r.focusLossForfeited);
  $("resultSub").textContent = msg.reason === "focus_loss"
    ? `${forfeits.map(r => r.name).join("、")} 因切屏次数超限被判负，本局按失败结算。`
    : msg.reason === "timeout"
      ? "地脉时限已到。答案在沉寂中显形，本局无人获得积分。"
      : (winner ? `${winner.name} 率先揭晓了答案，剩余推演次数化为积分。` : "本局结束。");
  $("answerCard").innerHTML = answerCardHTML(msg.target);
  $("podium").innerHTML = podiumHTML(msg.ranking, "round");
  $("rankingList").innerHTML = rankingHTML(msg.ranking, "round");
  $("matchHistory").classList.add("hidden");
  $("logSection").classList.remove("hidden");
  renderGuessLogs(msg.ranking, msg.enabledCols || state.currentCols);
  $("rematchBtn").classList.add("hidden");
  const isHost = state.room && state.room.hostId === state.myId;
  const last = msg.currentMatchRound >= msg.matchRounds;
  const next = $("nextBtn");
  next.classList.toggle("hidden", !isHost);
  next.disabled = false;
  next.innerHTML = last ? '结算大场 <span>→</span>' : '继续下一局 <span>→</span>';
  $("waitHostTip").classList.toggle("hidden", isHost);
  $("waitHostTip").textContent = isHost ? "" : (last ? "等待房主结算大场…" : "等待房主开启下一局…");
  const me = msg.ranking.find(r => r.name === state.myName);
  if (me && me.winOrder === 1) { sfx.win(); burstConfetti(80); }
  else if (!winner) sfx.lose();
  else sfx.lose();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMvpCard(entry) {
  if (!entry) return "";
  const el = ELEMENTS["风"];
  return `
    <div class="answer-card" style="${elementStyle("风")}">
      <div class="answer-sigil">${sigil("风")}</div>
      <div class="avatar answer-avatar" style="--av:#e9d3a1;font-family:var(--serif);font-size:27px;">♛</div>
      <div class="answer-copy">
        <div class="a-kicker">STAR OF THE MATCH · 本场之星</div>
        <h3>${esc(entry.name)}</h3>
        <p>以 ${entry.wins} 场小局胜利与 ${entry.totalScore} 分，成为今夜最接近星辰的旅行者。</p>
        <p style="margin-top:5px; color:var(--muted-2); font-family:var(--serif);">「风会记住每一次相遇，也会记住你的名字。」</p>
      </div>
      <div class="answer-attrs">
        <div class="answer-attr"><span>小局胜场</span><b>${entry.wins}</b></div>
        <div class="answer-attr"><span>最高连击</span><b>${entry.bestStreak || 0}</b></div>
        <div class="answer-attr"><span>一击必杀</span><b>${entry.perfects || 0}</b></div>
        <div class="answer-attr"><span>最终 Rating</span><b>${entry.newRating}</b></div>
      </div>
    </div>`;
}

function renderMatchResult(msg) {
  state.roundOver = true;
  state.currentResult = msg;
  state.lastResultKey = `${state.room?.code || msg.code || ""}:match`;
  if (state.room) {
    state.room.state = "match_ended";
    state.room.roundDeadline = 0;
  }
  showPanel("result");
  const first = msg.finalRanking[0];
  $("resultEyebrow").textContent = "MATCH COMPLETE · 大场终幕";
  $("resultTitle").textContent = "大场 · 终幕";
  $("resultSub").textContent = first
    ? `${first.name} 以 ${first.wins} 胜、${first.totalScore} 分摘得本场第一。Rating 已更新。`
    : "本场结束。";
  $("answerCard").innerHTML = renderMvpCard(first);
  $("podium").innerHTML = podiumHTML(msg.finalRanking, "match");
  $("rankingList").innerHTML = rankingHTML(msg.finalRanking, "match");
  $("logSection").classList.add("hidden");
  $("matchHistory").classList.remove("hidden");
  $("historyList").innerHTML = (msg.history || []).map(h => `
    <div class="history-item" style="${elementStyle(h.element)}">
      <span>第 ${h.round} 局</span>
      <b>${esc(h.target)}</b>
      <span>${h.winner ? "· " + esc(h.winner) + " 猜中" : "· 无人猜中"}</span>
    </div>`).join("") || '<span class="muted" style="font-size:10px;">本场没有留下回响。</span>';
  const isHost = state.room && state.room.hostId === state.myId;
  $("nextBtn").classList.toggle("hidden", !isHost);
  $("nextBtn").disabled = false;
  $("nextBtn").innerHTML = '回到房间 <span>→</span>';
  $("rematchBtn").classList.toggle("hidden", !isHost);
  $("rematchBtn").disabled = false;
  $("waitHostTip").classList.toggle("hidden", isHost);
  $("waitHostTip").textContent = isHost ? "" : "等待房主开启新的大场…";
  if (first && first.name === state.myName) { sfx.win(); burstConfetti(110); }
  else sfx.lose();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderGuessLogs(ranking, cols) {
  const box = $("guessLogs");
  if (!box) return;
  const head = '<th>角色</th>' + cols.map(c => `<th>${COL_NAMES[c] || c}</th>`).join("");
  box.innerHTML = ranking.map((r, i) => {
    const title = r.winOrder ? `第 ${r.winOrder} 位猜中 · 本局 +${r.roundScore}` : "未猜中 · 本局 +0";
    let body;
    if (!r.guessLog || !r.guessLog.length) {
      body = '<p class="empty-log">本局没有做出推演。</p>';
    } else {
      const rows = r.guessLog.map(entry => {
        const tds = entry.cells.map(c => `<td class="${c.status}">${esc(c.text)}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      body = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }
    return `
      <details class="guess-detail" ${i === 0 ? "open" : ""}>
        <summary>
          <span><span style="color:var(--gold);font-weight:700;">${esc(r.name)}</span> <span class="sum-sub">· ${esc(title)} · 共 ${r.guesses} 次</span></span>
          <span class="sum-score">本场 ${r.wins} 胜 · ${r.totalScore} 分</span>
        </summary>
        <div class="log-body">${body}</div>
      </details>`;
  }).join("");
}

/* ============================================================
   弹窗基础
   ============================================================ */
function modalHeader(title, subtitle) {
  return `<div class="modal-head">
    <div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
    <button class="modal-close" data-close>关闭</button>
  </div>`;
}
function openModal(html, cls = "") {
  const root = $("modalRoot");
  root.classList.remove("hidden");
  $("modalBox").className = "modal glass " + cls;
  $("modalBox").onclick = null;
  $("modalBox").innerHTML = html;
  document.body.classList.add("modal-open");
  $("modalBox").scrollTop = 0;
}
function closeModal() {
  $("modalRoot").classList.add("hidden");
  $("modalBox").innerHTML = "";
  document.body.classList.remove("modal-open");
}
$("modalBackdrop").onclick = closeModal;
$("modalRoot").addEventListener("click", e => {
  if (e.target.closest("[data-close]")) closeModal();
});

function showPlayerGuesses(p) {
  const names = p.guessedNames || [];
  const body = names.length ? `<div class="guess-modal-list">${names.map((name, i) => {
    const c = charByName(name);
    return `<span class="guess-chip" style="${c ? elementStyle(c.element) : ""}"><b>${i + 1}.</b>${esc(name)}</span>`;
  }).join("")}</div>` : '<div class="lb-empty">这位旅行者还没有做出推演。</div>';
  openModal(
    modalHeader(`${p.name} 的推演`, `已推演 ${p.guessesCount || names.length} 次 · 本场 ${p.wins || 0} 胜 · ${p.totalScore || 0} 分`) +
    `<div class="modal-body">${body}</div>`,
    "slim"
  );
}

/* ============================================================
   图鉴
   ============================================================ */
function openCodex(focusName) {
  // 对局进行中封印图鉴，避免查表直接得到答案线索
  if (state.room && state.room.state === "playing") {
    toast("对局进行中，角色图鉴暂时封印；本局结束后可查看", true);
    return;
  }
  if (focusName) state.codex.focus = focusName;
  const elChips = ["全部", ...ELEMENT_KEYS].map(el => {
    if (el === "全部") return `<button class="el-chip${state.codex.element === "全部" ? " active" : ""}" data-codex-el="全部" style="--el:#e9d3a1">全部</button>`;
    return `<button class="el-chip${state.codex.element === el ? " active" : ""}" data-codex-el="${el}" style="--el:${ELEMENTS[el].color}">${sigil(el)}<span>${el}</span></button>`;
  }).join("");
  const regionOpts = ["全部", ...REGION_ORDER].map(r => `<option value="${r}" ${state.codex.region === r ? "selected" : ""}>${r}</option>`).join("");
  const weaponOpts = ["全部", ...Array.from(new Set(state.chars.map(c => c.weapon)))].map(w => `<option value="${esc(w)}" ${state.codex.weapon === w ? "selected" : ""}>${esc(w)}</option>`).join("");
  const rarityOpts = ["全部", "5", "4"].map(r => `<option value="${r}" ${state.codex.rarity === r ? "selected" : ""}>${r === "全部" ? "全部星级" : r + " 星"}</option>`).join("");
  openModal(
    modalHeader("提瓦特角色图鉴", `已收录 ${state.chars.length} 位角色 · 可按元素、地区、武器与星级筛选`) +
    `<div class="modal-body">
      <div class="codex-toolbar">
        <div class="codex-top-row">
          <div class="search-wrap"><input id="codexSearch" type="search" placeholder="搜索角色名或首字母…" value="${esc(state.codex.q)}" autocomplete="off" style="padding-left:12px;"></div>
          <span class="codex-count">显示 <b id="codexCount">0</b> 位</span>
          <button class="btn btn-small btn-ghost" id="codexRandom">命运签 ✦</button>
        </div>
        <div class="codex-filters">
          ${elChips}
          <select id="codexRegion">${regionOpts}</select>
          <select id="codexWeapon">${weaponOpts}</select>
          <select id="codexRarity">${rarityOpts}</select>
        </div>
      </div>
      <div class="codex-grid" id="codexGrid"></div>
    </div>`,
    "wide"
  );
  $("codexSearch").addEventListener("input", e => { state.codex.q = e.target.value; renderCodex(); });
  $("codexRegion").addEventListener("change", e => { state.codex.region = e.target.value; renderCodex(); });
  $("codexWeapon").addEventListener("change", e => { state.codex.weapon = e.target.value; renderCodex(); });
  $("codexRarity").addEventListener("change", e => { state.codex.rarity = e.target.value; renderCodex(); });
  $("modalBox").onclick = e => {
    const chip = e.target.closest("[data-codex-el]");
    if (chip) {
      state.codex.element = chip.dataset.codexEl;
      $$("[data-codex-el]").forEach(b => b.classList.toggle("active", b.dataset.codexEl === state.codex.element));
      renderCodex();
    }
    const card = e.target.closest(".codex-card");
    if (card) {
      const c = charByName(card.dataset.name);
      if (c) {
        state.codex.focus = c.name;
        $$(".codex-card").forEach(x => x.classList.toggle("focus", x.dataset.name === c.name));
        toast(`「${c.name}」 · ${c.region} · ${c.element}元素 · ${c.weapon}`);
      }
    }
  };
  $("codexRandom").onclick = () => {
    if (!state.chars.length) return;
    const c = pick(state.chars);
    state.codex.element = "全部"; state.codex.region = "全部"; state.codex.weapon = "全部"; state.codex.rarity = "全部"; state.codex.q = "";
    $("codexSearch").value = ""; $("codexRegion").value = "全部"; $("codexWeapon").value = "全部"; $("codexRarity").value = "全部";
    $$("[data-codex-el]").forEach(b => b.classList.toggle("active", b.dataset.codexEl === "全部"));
    state.codex.focus = c.name;
    renderCodex();
    toast(`命运签：${c.name} · ${c.region} · ${c.element}元素`);
  };
  renderCodex();
}

function renderCodex() {
  const grid = $("codexGrid");
  if (!grid) return;
  const q = state.codex.q.trim().toLowerCase();
  let list = state.chars.filter(c => {
    if (state.codex.element !== "全部" && c.element !== state.codex.element) return false;
    if (state.codex.region !== "全部" && c.region !== state.codex.region) return false;
    if (state.codex.weapon !== "全部" && c.weapon !== state.codex.weapon) return false;
    if (state.codex.rarity !== "全部" && String(c.rarity) !== state.codex.rarity) return false;
    if (q && !(c.name.toLowerCase().includes(q) || c.letter.toLowerCase() === q)) return false;
    return true;
  });
  const rr = r => { const i = REGION_ORDER.indexOf(r); return i < 0 ? 99 : i; };
  list.sort((a, b) => rr(a.region) - rr(b.region) || b.rarity - a.rarity || a.name.localeCompare(b.name, "zh"));
  const count = $("codexCount");
  if (count) count.textContent = list.length;
  if (!list.length) {
    grid.innerHTML = '<div class="codex-empty">没有找到符合条件的角色。<br>试着放宽筛选条件。</div>';
    return;
  }
  grid.innerHTML = list.map(c => `
    <button class="codex-card${state.codex.focus === c.name ? " focus" : ""}" data-name="${esc(c.name)}" style="${elementStyle(c.element)}">
      <div class="codex-watermark">${sigil(c.element)}</div>
      <div class="codex-card-head">
        <div class="codex-avatar">${esc(c.name.charAt(0))}</div>
        <div class="codex-name"><b>${esc(c.name)}</b><span>${esc(c.region)} · ${esc(c.weapon)}</span></div>
      </div>
      <div class="codex-stars ${c.rarity <= 4 ? "purple" : ""}">${starsHTML(c.rarity)}</div>
      <div class="codex-meta">
        <span><b>${esc(c.element)}</b>元素</span>
        <span>生日 ${esc(c.birthday)}</span>
        <span>v${esc(c.version)}</span>
      </div>
    </button>`).join("");
  if (state.codex.focus) {
    requestAnimationFrame(() => {
      const card = Array.from(grid.querySelectorAll(".codex-card")).find(x => x.dataset.name === state.codex.focus);
      if (card) card.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
}

/* ============================================================
   玩法秘典 / 管理
   ============================================================ */
function openRules() {
  openModal(
    modalHeader("玩法秘典", "提瓦特元素猜谜 · 多人对战规则") +
    `<div class="modal-body">
      <div class="rules-grid">
        <div class="rule-card wide">
          <h4><span class="r-ico">✦</span>核心玩法</h4>
          <p>所有玩家在同一房间中面对同一位隐藏角色。猜测名册<b>只显示姓名</b>，不展示元素、星级、地区或任何属性；线索颜色：<b>绿色＝完全正确</b>，<b>金色＝接近</b>（地区相邻或生日/版本接近），<b>灰色＝不符</b>。生日与版本列会附带 ↑ / ↓ 箭头，提示答案比所猜更大或更小。率先猜中的玩家立即结束本局并获得积分。对局中角色图鉴会被封印，防止查表。</p>
        </div>
        <div class="rule-card">
          <h4><span class="r-ico">◇</span>积分构成</h4>
          <p>基础 <b>100 分</b>；剩余每次猜测 <b>+15 分</b>；第一猜命中 <b>+25 分</b>「一击必杀」；连胜额外 <b>+10 / 层</b>（最高 +30）。元素视野每次在结算时 <b>−20 分</b>。决胜局开启时总分 <b>×2</b>。</p>
        </div>
        <div class="rule-card">
          <h4><span class="r-ico">❖</span>地脉异变</h4>
          <p>每小局开始时会随机出现一条元素规则：额外猜测机会、减少次数换取高分、剩余次数奖励提升、元素视野免费等。开局时留意顶部的地脉异变条，它会直接改变本局策略。</p>
        </div>
        <div class="rule-card">
          <h4><span class="r-ico">◈</span>元素视野</h4>
          <p>每大场拥有若干点「星辉」。消耗 1 点可随机揭示答案的<b>元素、地区、武器、性别、生日、版本、星级</b>之一，但结算时会扣除积分。是稳扎稳打，还是把星辉留到决胜局？</p>
        </div>
        <div class="rule-card">
          <h4><span class="r-ico">♛</span>Rating 与排行</h4>
          <p>起始 <b>1500</b>。大场结束后按小局胜场、总分排名，与每位对手进行 ELO 配对计算（K=32）。击败高分玩家可获得更多 Rating。排行榜会记录胜场、最高连击与一击必杀次数。</p>
        </div>
        <div class="rule-card wide">
          <h4><span class="r-ico">⌘</span>操作与联机</h4>
          <p>点击字母按钮或直接按 <b>A–Z</b> 筛选首字母；<b>/</b> 聚焦搜索；<b>Esc</b> 清空筛选。在名册中直接点击角色即可猜测。房主可调整猜测次数、大场局数、时限、题库、提示列、元素视野与决胜局双倍。公网房间由 EdgeOne Makers 承载，登录后输入 6 位房间号码与房间密码加入；局域网房间请在同一网络运行 <b>npm start</b> 并访问 <b>http://本机IP:8787</b>，大厅会自动发现并免密进入。</p>
        </div>
      </div>
    </div>`,
    "wide"
  );
}

function openAdmin() {
  if (window.__TEYVAT_ADMIN__) window.__TEYVAT_ADMIN__();
  else toast("管理控制台正在加载，请稍候");
}

function handleAdminResult(msg) {
  window.dispatchEvent(new CustomEvent("teyvat-admin-result", { detail: msg }));
}

/* ============================================================
   表情 / 特效
   ============================================================ */
function renderEmoteBars() {
  const emotes = Object.keys(state.emotes).length ? state.emotes : {
    gg: { icon: "✋", text: "GG！" }, wow: { icon: "✨", text: "太强了！" },
    cry: { icon: "💧", text: "就差一点…" }, paimon: { icon: "🍗", text: "派蒙饿了！" },
    again: { icon: "🔁", text: "再来一局！" }, lucky: { icon: "🌟", text: "十连出金！" },
    think: { icon: "🤔", text: "让我想想…" }, clap: { icon: "👏", text: "漂亮！" }
  };
  const key = Object.keys(emotes).join(",");
  $$("[data-emote-bar]").forEach(bar => {
    if (bar.dataset.emoteKey === key) return;
    bar.dataset.emoteKey = key;
    bar.innerHTML = Object.entries(emotes).map(([id, e]) =>
      `<button class="emote-btn" data-emote="${esc(id)}" title="${esc(e.text)}"><span>${e.icon}</span>${esc(e.text)}</button>`).join("");
  });
}

function showEmote(msg) {
  const layer = $("emoteLayer");
  const bubble = document.createElement("div");
  bubble.className = "emote-bubble";
  bubble.innerHTML = `${avatarHTML(msg.name, "sm eb-avatar")}
    <div class="eb-main"><div class="eb-name">${esc(msg.name)}</div><div class="eb-text">${esc(msg.text)}</div></div>
    <span class="eb-icon">${msg.icon}</span>`;
  layer.appendChild(bubble);
  setTimeout(() => bubble.remove(), 3300);
  state.feed.unshift({ name: msg.name, text: msg.text, icon: msg.icon });
  state.feed = state.feed.slice(0, 10);
  const feed = $("emoteFeed");
  if (feed) feed.innerHTML = state.feed.map(f =>
    `<div class="ef-item"><b>${esc(f.name)}</b>${f.icon} ${esc(f.text)}</div>`).join("");
  sfx.emote();
}

function burstConfetti(count = 70) {
  if (reduceMotion) return;
  const layer = $("confettiLayer");
  const colors = ["#e9d3a1", "#f7e7bb", "#74d8b8", "#b58cff", "#59c9ff", "#ff7a63", "#a9edff"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = pick(colors);
    p.style.setProperty("--dx", (Math.random() * 160 - 80).toFixed(0) + "px");
    p.style.setProperty("--rot", (Math.random() * 900 + 180).toFixed(0) + "deg");
    p.style.animationDuration = (2.2 + Math.random() * 2) + "s";
    p.style.animationDelay = (Math.random() * .5) + "s";
    p.style.opacity = (0.55 + Math.random() * .45).toFixed(2);
    layer.appendChild(p);
    setTimeout(() => p.remove(), 4800);
  }
}

function flashRound(element) {
  if (reduceMotion) return;
  const el = document.createElement("div");
  el.className = "round-flash";
  el.style.cssText = elementStyle(element || "风");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

/* ============================================================
   交互事件
   ============================================================ */
function loadName() {
  let name = "";
  try { name = localStorage.getItem("teyvat_name") || ""; } catch (_) {}
  state.myName = name.trim().slice(0, 8);
  $("nameInput").value = state.myName;
  updateProfile();
}

$("nameInput").addEventListener("input", e => {
  state.myName = e.target.value.trim().slice(0, 8);
  try { localStorage.setItem("teyvat_name", state.myName); } catch (_) {}
  updateProfile();
  renderLeaderboard();
});
$("nameInput").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!$("createBtn").disabled) $("createBtn").click();
  }
});

$("createBtn").onclick = () => {
  const name = ($("nameInput").value || "").trim();
  if (!name) { toast("请先输入旅行者之名", true); $("nameInput").focus(); return; }
  if (name.length > 8) { toast("昵称最多 8 个字", true); return; }
  state.myName = name;
  try { localStorage.setItem("teyvat_name", name); } catch (_) {}
  $("createBtn").disabled = true;
  setTimeout(() => { $("createBtn").disabled = false; }, 1200);
  sendMsg({ type: "create", name, maxGuesses: 8 });
  sfx.join();
};
$("joinBtn").onclick = () => {
  const name = ($("nameInput").value || "").trim();
  const code = ($("codeInput").value || "").trim();
  if (!name) { toast("请先输入旅行者之名", true); $("nameInput").focus(); return; }
  if (!/^\d{6}$/.test(code)) { toast("请输入 6 位数字房间码", true); $("codeInput").focus(); return; }
  state.myName = name;
  try { localStorage.setItem("teyvat_name", name); } catch (_) {}
  sendMsg({ type: "join", name, roomCode: code });
  sfx.join();
};
$("codeInput").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});
$("codeInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("joinBtn").click();
});

$("soundBtn").onclick = () => {
  state.soundOn = !state.soundOn;
  try { localStorage.setItem("teyvat_sound", state.soundOn ? "on" : "off"); } catch (_) {}
  $("soundBtn").classList.toggle("muted", !state.soundOn);
  $("soundBtn").title = state.soundOn ? "关闭音效" : "开启音效";
  if (state.soundOn) { initAudio(); sfx.select(); }
  toast(state.soundOn ? "音效已开启" : "音效已关闭");
};

$("openCodexBtn").onclick = () => openCodex();
$("openRulesBtn").onclick = openRules;
$("refreshLbBtn").onclick = () => sendMsg({ type: "get_leaderboard" });
$("adminBtn").onclick = openAdmin;
$("shuffleFeature").onclick = () => {
  if (!state.chars.length) return;
  let c = pick(state.chars);
  for (let i = 0; i < 6 && c.name === state.featuredName; i++) c = pick(state.chars);
  renderFeatured(c.name);
  sfx.select();
};
$("featuredCard").title = "点击查看角色图鉴";

$("copyCodeBtn").onclick = async () => {
  const code = state.room ? state.room.code : $("roomCodeText").textContent;
  try {
    await navigator.clipboard.writeText(code);
    toast("房间码已复制：" + code);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = code; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast("房间码已复制：" + code); }
    catch (e) { toast("复制失败，请手动记下房间码", true); }
    ta.remove();
  }
};

$("leaveWaitBtn").onclick = () => leaveRoom(false);
$("leaveGameBtn").onclick = () => leaveRoom(false);
$("leaveResultBtn").onclick = () => leaveRoom(true);
function leaveRoom(fromResult) {
  if (!state.room) return;
  if (state.room.state === "playing" && !fromResult) {
    if (!confirm("对局仍在进行，确定离开秘境吗？")) return;
  }
  sendMsg({ type: "leave" });
  sfx.click();
}

$("startBtn").onclick = () => {
  $("startBtn").disabled = true;
  sendMsg({ type: "start" });
};
$("nextBtn").onclick = () => {
  $("nextBtn").disabled = true;
  sendMsg({ type: "start" });
};
$("rematchBtn").onclick = () => {
  $("rematchBtn").disabled = true;
  sendMsg({ type: "rematch" });
};
let hintBusy = false;
$("hintBtn").onclick = async () => {
  const btn = $("hintBtn");
  if (hintBusy || btn.disabled) return;
  hintBusy = true;
  btn.disabled = true;
  btn.innerHTML = "窥探中…";
  sfx.click();
  try {
    await sendMsg({ type: "hint" });
  } finally {
    setTimeout(() => {
      hintBusy = false;
      renderHints();
    }, 800);
  }
};

document.addEventListener("click", e => {
  const emote = e.target.closest("[data-emote]");
  if (emote) {
    sendMsg({ type: "emote", id: emote.dataset.emote });
    sfx.click();
    return;
  }
  const letter = e.target.closest("[data-letter]");
  if (letter && !letter.disabled) {
    state.activeLetter = state.activeLetter === letter.dataset.letter ? null : letter.dataset.letter;
    renderLetters(); renderCandidates();
    sfx.click();
    return;
  }
  const cand = e.target.closest(".candidate");
  if (cand && !cand.disabled) {
    const name = cand.dataset.name;
    if (!name || state.myGuessed.has(name) || state.roundOver) return;
    const me = state.room && state.room.players.find(p => p.id === state.myId);
    if (!me || me.done) return;
    state.myGuessed.add(name);
    sendMsg({ type: "guess", name });
    updateCandidateDisabled();
    sfx.select();
  }
});

let candidateSearchTimer = 0;
$("charSearch").addEventListener("input", e => {
  state.query = e.target.value;
  clearTimeout(candidateSearchTimer);
  candidateSearchTimer = setTimeout(renderCandidates, 80);
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (!$("modalRoot").classList.contains("hidden")) { closeModal(); return; }
    if (state.panel === "game") {
      state.activeLetter = null; state.query = "";
      $("charSearch").value = "";
      renderLetters(); renderCandidates();
    }
    return;
  }
  if (!$("modalRoot").classList.contains("hidden")) return;
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
  if (state.panel !== "game") return;
  if (e.key === "/") {
    e.preventDefault(); $("charSearch").focus(); return;
  }
  if (/^[a-zA-Z]$/.test(e.key)) {
    const L = e.key.toUpperCase();
    state.activeLetter = state.activeLetter === L ? null : L;
    renderLetters(); renderCandidates();
    e.preventDefault();
  }
});

/* 房间设置事件 */
$("guessMinus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  const v = clamp(state.room.maxGuesses - 1, 1, state.room.maxGuessesLimit || state.chars.length || 1);
  sendOptions({ maxGuesses: v });
};
$("guessPlus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  const v = clamp(state.room.maxGuesses + 1, 1, state.room.maxGuessesLimit || state.chars.length || 1);
  sendOptions({ maxGuesses: v });
};
$("maxGuessInput").addEventListener("change", e => {
  if (!state.room || state.room.hostId !== state.myId) return;
  const v = clamp(parseInt(e.target.value, 10) || state.room.maxGuesses, 1, state.room.maxGuessesLimit || state.chars.length || 1);
  sendOptions({ maxGuesses: v });
});
$("roundsMinus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ matchRounds: clamp(state.room.matchRounds - 1, 1, 20) });
};
$("roundsPlus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ matchRounds: clamp(state.room.matchRounds + 1, 1, 20) });
};
$("matchRoundsInput").addEventListener("change", e => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ matchRounds: clamp(parseInt(e.target.value, 10) || state.room.matchRounds, 1, 20) });
});
$("hintsMinus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ hintsPerMatch: clamp(state.room.hintsPerMatch - 1, 0, 5) });
};
$("hintsPlus").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ hintsPerMatch: clamp(state.room.hintsPerMatch + 1, 0, 5) });
};
$("hintsInput").addEventListener("change", e => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ hintsPerMatch: clamp(parseInt(e.target.value, 10) || 0, 0, 5) });
});
$("doubleFinalToggle").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ doubleFinal: !state.room.doubleFinal });
  sfx.click();
};
$("hintsToggle").onclick = () => {
  if (!state.room || state.room.hostId !== state.myId) return;
  sendOptions({ hintsEnabled: !state.room.hintsEnabled });
  sfx.click();
};
$("timeChips").addEventListener("click", e => {
  const chip = e.target.closest("[data-time]");
  if (!chip || !state.room || state.room.hostId !== state.myId) return;
  sendOptions({ timeLimit: parseInt(chip.dataset.time, 10) });
  sfx.click();
});
$("poolRow").addEventListener("click", e => {
  const chip = e.target.closest("[data-pool]");
  if (!chip || !state.room || state.room.hostId !== state.myId) return;
  sendOptions({ pool: chip.dataset.pool });
  sfx.click();
});
$("colRow").addEventListener("click", e => {
  const chip = e.target.closest("[data-col]");
  if (!chip || !state.room || state.room.hostId !== state.myId) return;
  const set = new Set(state.room.enabledCols || []);
  if (set.has(chip.dataset.col)) set.delete(chip.dataset.col);
  else set.add(chip.dataset.col);
  sendOptions({ cols: Array.from(set) });
  sfx.click();
});
$$(".preset-row .chip").forEach(btn => {
  btn.addEventListener("click", () => {
    if (!state.room || state.room.hostId !== state.myId) return;
    let cols;
    if (btn.dataset.colPreset === "all") cols = ALL_COLS.slice();
    else if (btn.dataset.colPreset === "lean") cols = ["region", "element", "weapon", "rarity"];
    else cols = [];
    sendOptions({ cols });
    sfx.click();
  });
});

/* ============================================================
   启动
   ============================================================ */
(function init() {
  loadName();
  renderDaily();
  renderEmoteBars();
  try {
    const s = localStorage.getItem("teyvat_sound");
    if (s === "off") {
      state.soundOn = false;
      $("soundBtn").classList.add("muted");
      $("soundBtn").title = "开启音效";
    }
  } catch (_) {}
  window.__TEYVAT__ = {
    state, $, $$, esc, toast, showPanel, handleMsg, connect, sendMsg,
    apiFetch, applyAccount, openModal, closeModal, modalHeader,
  };
  window.__TEYVAT_READY__ = true;
  window.dispatchEvent(new Event("teyvat-ready"));
})();
