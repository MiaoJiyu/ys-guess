import { calculateRatingDeltas, pickTarget } from '../shared/engine.js';
import { AVATAR_ICONS, avatarIconUrl } from '../shared/avatars.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const equalPlayers = [
  { id: 'a', rating: 1500, wins: 2, totalScore: 260 },
  { id: 'b', rating: 1500, wins: 0, totalScore: 80 },
];
const deltas = calculateRatingDeltas(equalPlayers);
assert(deltas.a >= 35, `胜者 Rating 增幅过小：${deltas.a}`);
assert(deltas.b <= -20, `败者 Rating 降幅过小：${deltas.b}`);
assert(deltas.a > Math.abs(deltas.b) * 0.8, '胜者应获得明显正向收益');

const noWinner = calculateRatingDeltas([
  { id: 'a', rating: 1500, wins: 0, totalScore: 100 },
  { id: 'b', rating: 1500, wins: 0, totalScore: 90 },
]);
assert(noWinner.a === 0 && noWinner.b === 0, '无人获胜时不应调整 Rating');

const room = { pool: '全部', targetBag: [], recentTargets: [] };
const seen = new Set();
for (let i = 0; i < 40; i += 1) {
  const target = pickTarget(room);
  assert(!seen.has(target.name), `连续选角重复：${target.name}`);
  seen.add(target.name);
  room.recentTargets.push(target.name);
}
assert(seen.size === 40, '洗牌袋选角数量异常');

assert(Object.keys(AVATAR_ICONS).length >= 100, '头像映射覆盖不足');
assert(/^\/assets\/avatars\/UI_AvatarIcon_.+\.png$/.test(avatarIconUrl('迪卢克')), '头像本地路径格式异常');

console.log('ALGORITHM_TEST_OK');
