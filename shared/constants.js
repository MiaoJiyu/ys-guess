export const SERVER_VERSION = '3.0';
export const STARTING_RATING = 1500;
export const MIN_RATING = 100;
export const K_FACTOR = 52;
export const MAX_MATCH_ROUNDS = 20;
export const MAX_PLAYERS = 8;
export const HINT_SCORE_COST = 20;
export const MAX_TIME_LIMIT = 600;
export const MAX_HINTS_PER_MATCH = 5;
export const FOCUS_LOSS_LIMIT = 3;
export const FOCUS_GRACE_SECONDS = 5;
export const FOCUS_DEDUPE_MS = 1500;
export const CHEAT_REVEAL_RATE = 0.08;
export const CHEAT_MAX_ATTEMPTS = 3;
export const CHEAT_LOCK_SECONDS = 30;

export const REGION_ORDER = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '挪德卡莱', '至冬'];
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const ALL_COLS = ['gender', 'region', 'element', 'weapon', 'birthday', 'version', 'rarity'];
export const COL_LABELS = {
  gender: '性别', region: '地区', element: '元素', weapon: '武器',
  birthday: '生日', version: '版本', rarity: '星级',
};
export const HINT_FIELDS = [
  ['element', '元素'], ['region', '地区'], ['weapon', '武器'],
  ['gender', '性别'], ['birthday', '生日'], ['version', '版本'], ['rarity', '星级'],
];
export const POOLS = ['全部', '蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '挪德卡莱', '至冬', '其他'];

export const EMOTES = {
  gg: { icon: '✋', text: 'GG！' },
  wow: { icon: '✨', text: '太强了！' },
  cry: { icon: '💧', text: '就差一点…' },
  paimon: { icon: '🍗', text: '派蒙饿了！' },
  again: { icon: '🔁', text: '再来一局！' },
  lucky: { icon: '🌟', text: '十连出金！' },
  think: { icon: '🤔', text: '让我想想…' },
  clap: { icon: '👏', text: '漂亮！' },
};

export const MODIFIERS = [
  { id: 'none', name: '风平浪静', element: null, weight: 2, desc: '地脉平稳，本局没有额外变化。' },
  { id: 'geo_shield', name: '岩之庇护', element: '岩', weight: 2, guess_delta: 1, desc: '本局所有玩家额外获得 1 次猜测机会。' },
  { id: 'electro_rush', name: '雷光疾驰', element: '雷', weight: 2, guess_delta: -1, flat_bonus: 30, desc: '本局猜测次数 -1，但猜中额外 +30 分。' },
  { id: 'cryo_grace', name: '冰霜恩泽', element: '冰', weight: 2, remain_extra: 12, desc: '本局剩余次数每点额外 +12 分。' },
  { id: 'pyro_trial', name: '火之试炼', element: '火', weight: 1, score_mult: 1.25, desc: '本局猜中得分 ×1.25。' },
  { id: 'hydro_echo', name: '水之回响', element: '水', weight: 1, flat_bonus: 15, free_hint: true, desc: '本局猜中额外 +15 分，且元素视野不扣分。' },
  { id: 'dendro_bloom', name: '草叶新生', element: '草', weight: 1, hint_refund: true, desc: '本局首次使用元素视野会返还 1 点星辉。' },
  { id: 'anemo_blessing', name: '风行祝福', element: '风', weight: 1, remain_extra: 8, flat_bonus: 10, desc: '本局剩余次数奖励 +8，猜中额外 +10。' },
];
