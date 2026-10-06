/* 72 角色 5 维坐标（手工设定，可微调）—— 开发工具
   5 维: 行动力 a / 外向度 e / 侵略倾向 g / 耐心谨慎 c / 创造守护 b  （0-100）
   设定原则：每维有高有低、同类生物之间刻意拉开差异，保证欧氏距离可区分 */
const fs = require('fs');
const path = require('path');
const MOBS = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data', '_mobs.json'), 'utf8')).mobs;

/* id: [a, e, g, c, b] */
const V = {
  /* 人形 */
  steve:              [58, 46, 38, 82, 92],
  alex:               [74, 52, 46, 64, 78],
  villager:           [30, 62, 10, 88, 95],
  witch:              [48, 26, 62, 84, 56],
  illusioner:         [42, 18, 74, 72, 30],
  pillager:           [72, 34, 78, 44, 26],
  vindicator:         [76, 30, 88, 32, 18],
  evoker:             [38, 22, 86, 78, 34],
  piglin:             [66, 44, 72, 48, 40],
  piglin_brute:       [82, 28, 96, 22, 14],
  snow_golem:         [44, 40, 24, 70, 84],
  iron_golem:         [40, 38, 58, 76, 96],
  wandering_trader:   [46, 56, 12, 68, 62],
  /* 亡灵 */
  zombie:             [38, 30, 56, 54, 24],
  husk:               [24, 22, 58, 72, 20],
  drowned:            [52, 20, 68, 58, 18],
  skeleton:           [50, 16, 62, 76, 22],
  stray:              [30, 12, 60, 80, 20],
  bogged:             [26, 14, 56, 84, 22],
  wither_skeleton:    [68, 18, 94, 34, 12],
  zombified_piglin:   [46, 48, 70, 38, 26],
  /* 四足 */
  pig:                [34, 66, 10, 48, 36],
  cow:                [26, 72, 8, 66, 54],
  sheep:              [30, 88, 6, 56, 42],
  wolf:               [78, 70, 66, 54, 58],
  ocelot:             [70, 22, 34, 78, 28],
  cat:                [42, 28, 30, 62, 32],
  fox:                [84, 34, 44, 52, 30],
  llama:              [36, 40, 52, 68, 60],
  horse:              [88, 54, 26, 46, 34],
  /* 方块怪 */
  creeper:            [72, 40, 92, 10, 16],
  slime:              [66, 72, 34, 24, 22],
  magma_cube:         [70, 32, 94, 14, 10],
  silverfish:         [74, 46, 62, 36, 14],
  endermite:          [68, 30, 58, 32, 16],
  snowman:            [40, 60, 12, 54, 74],
  armadillo:          [20, 18, 14, 88, 46],
  /* 鸟类 */
  chicken:            [46, 56, 10, 30, 32],
  parrot:             [82, 92, 22, 32, 38],
  bat:                [72, 26, 30, 40, 20],
  axolotl:            [58, 62, 8, 64, 58],
  tropical_fish:      [44, 78, 6, 52, 40],
  frog:               [64, 44, 38, 54, 30],
  tadpole:            [36, 84, 4, 42, 26],
  /* 水生 */
  dolphin:            [92, 86, 18, 44, 42],
  squid:              [34, 38, 22, 62, 28],
  glow_squid:         [28, 32, 16, 74, 44],
  cod:                [38, 76, 8, 50, 30],
  salmon:             [60, 72, 22, 66, 32],
  pufferfish:         [32, 34, 48, 70, 36],
  turtle:             [22, 48, 14, 94, 66],
  /* 飞行 */
  bee:                [80, 84, 48, 62, 72],
  allay:              [62, 70, 6, 58, 90],
  vex:                [86, 36, 74, 26, 12],
  breeze:             [88, 30, 64, 42, 24],
  blaze:              [78, 24, 88, 20, 14],
  ghast:              [32, 12, 68, 56, 18],
  phantom:            [90, 24, 72, 28, 16],
  /* 昆虫 */
  spider:             [64, 20, 70, 82, 30],
  cave_spider:        [70, 16, 80, 68, 22],
  enderman:           [76, 8, 60, 74, 26],
  shulker:            [14, 10, 66, 88, 48],
  guardian:           [54, 24, 68, 76, 38],
  camel:              [26, 44, 20, 90, 72],
  mooshroom:          [28, 58, 12, 74, 64],
  /* 巨型 */
  ender_dragon:       [90, 14, 98, 40, 30],
  wither:             [68, 10, 99, 26, 12],
  warden:             [58, 6, 96, 76, 10],
  ravager:            [86, 18, 94, 18, 14],
  elder_guardian:     [30, 26, 82, 86, 52],
  hoglin:             [88, 34, 92, 16, 18],
  sniffer:            [18, 42, 10, 82, 78]
};

const DIMS = ['action', 'extra', 'aggro', 'care', 'build'];
const SHORT = { action: '行动', extra: '外向', aggro: '侵略', care: '耐心', build: '创造' };
const problems = [];

const OUT = MOBS.map(m => {
  const arr = V[m.id];
  if (!arr) { problems.push('缺少坐标: ' + m.id); return null; }
  if (arr.length !== 5) problems.push(m.id + ' 坐标长度 ' + arr.length);
  arr.forEach(v => { if (typeof v !== 'number' || v < 0 || v > 100) problems.push(m.id + ' 坐标越界: ' + v); });
  const v = {};
  DIMS.forEach((d, i) => { v[d] = arr[i]; });
  const tags = [];
  if (v.action >= 72) tags.push('高行动力'); else if (v.action <= 28) tags.push('慢节奏'); else tags.push('中等行动力');
  if (v.extra >= 72) tags.push('外向'); else if (v.extra <= 28) tags.push('内向'); else tags.push('社交中性');
  if (v.aggro >= 72) tags.push('高侵略'); else if (v.aggro <= 26) tags.push('无侵略'); else tags.push('中等侵略');
  if (v.care >= 72) tags.push('高耐心'); else if (v.care <= 30) tags.push('急躁'); else tags.push('中等耐心');
  if (v.build >= 72) tags.push('强创造守护'); else if (v.build <= 26) tags.push('弱创造'); else tags.push('中等创造');
  return { id: m.id, zh: m.zh, en: m.en, t: m.t, d: m.d, tag: m.tag, v: v, profile: tags.join('、') };
}).filter(Boolean);

if (OUT.length !== 72) problems.push('有效角色数 ' + OUT.length);

/* 分布 */
console.log('=== 5 维分布 ===');
const stats = {};
DIMS.forEach(d => {
  const vals = OUT.map(x => x.v[d]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  const uniq = new Set(vals).size;
  stats[d] = { min: Math.min(...vals), max: Math.max(...vals), sd, uniq };
  console.log('  ' + SHORT[d] + '  均值 ' + mean.toFixed(1) + '  标准差 ' + sd.toFixed(1) +
    '  范围 ' + Math.min(...vals) + '-' + Math.max(...vals) + '  不同取值 ' + uniq + ' 种');
  if (uniq < 8) problems.push(SHORT[d] + ' 取值过少（' + uniq + ' 种）');
  if (sd < 15) problems.push(SHORT[d] + ' 分散度不足（标准差 ' + sd.toFixed(1) + '）');
});
/* 每维高/低端都要有角色，避免某端无角色 */
DIMS.forEach(d => {
  const hi = OUT.filter(x => x.v[d] >= 80).length, lo = OUT.filter(x => x.v[d] <= 20).length;
  console.log('  ' + SHORT[d] + '  ≥80 的角色 ' + hi + " 个，≤20 的 " + lo + ' 个');
  if (hi < 2) problems.push(SHORT[d] + ' 高端角色不足');
  if (lo < 2) problems.push(SHORT[d] + ' 低端角色不足');
});

/* 两两距离 */
const pairs = [];
for (let i = 0; i < OUT.length; i++) for (let j = i + 1; j < OUT.length; j++) {
  const a = OUT[i], b = OUT[j];
  pairs.push({ d: Math.sqrt(DIMS.reduce((s, k) => s + (a.v[k] - b.v[k]) ** 2, 0)), a: a.zh, b: b.zh });
}
pairs.sort((x, y) => x.d - y.d);
console.log('\n两两距离: 最小 ' + pairs[0].d.toFixed(1) + '  中位 ' + pairs[Math.floor(pairs.length / 2)].d.toFixed(1) + '  最大 ' + pairs[pairs.length - 1].d.toFixed(1));
const near = pairs.filter(p => p.d < 12);
console.log('距离 < 12 的角色对: ' + near.length + ' 组');
near.slice(0, 10).forEach(p => console.log('   ' + p.a + ' ↔ ' + p.b + '  ' + p.d.toFixed(1)));
if (near.length > 12) problems.push('过近角色对过多（' + near.length + '）');
const identical = pairs.filter(p => p.d === 0);
if (identical.length) problems.push('存在完全相同的坐标: ' + identical.map(p => p.a + '=' + p.b).join(', '));

if (problems.length) { console.log('\n❌ 问题:'); problems.forEach(p => console.log('   ' + p)); process.exit(1); }
console.log('\n✅ 5 维坐标校验通过');

fs.writeFileSync(path.resolve(__dirname, 'data', 'mobs5d.json'), JSON.stringify(OUT, null, 1), 'utf8');
console.log('已输出 tools/data/mobs5d.json');
