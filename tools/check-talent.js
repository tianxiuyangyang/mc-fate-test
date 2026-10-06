/* 天赋区分度验证（用真实分布答卷）：同一份答卷下换天赋，结果是否变化 —— 开发工具 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const DIMS = ['action', 'extra', 'aggro', 'care', 'build'];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const MOBS = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'mobs5d.json'), 'utf8'))
  .map(m => Object.assign({}, m, { v: DIMS.map(d => m.v[d]) }));
const src = fs.readFileSync(path.resolve(DIR, '..', 'index.html'), 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
const grab = (a, b) => { const s = js.indexOf(a); const e = js.indexOf(b, s + 1); return js.slice(s, e); };
eval(grab('var QUESTIONS=[', '/* =========================================================================\n   5. 状态与流程').replace('var QUESTIONS=', 'globalThis.Q='));
const Q = globalThis.Q;

const TALENTS = [
  { id: 'wisdom', v: [0.29, 0.00, 0.00, 0.62, 0.14] },
  { id: 'body', v: [0.86, 0.03, 0.21, 0.07, 0.00] },
  { id: 'look', v: [0.07, 0.90, 0.00, 0.07, 0.00] },
  { id: 'wealth', v: [0.07, 0.28, 0.00, 0.14, 0.52] },
  { id: 'luck', v: [0.24, 0.17, 0.07, 0.14, 0.24] }
];
const TALENT_UNIT = 6, SCALE = [145, 79, 145, 220, 150];
function talentToRaw(p) { const o = [0, 0, 0, 0, 0]; TALENTS.forEach((t, i) => { for (let j = 0; j < 5; j++) o[j] += t.v[j] * (p[i] || 0) * TALENT_UNIT; }); return o; }
/* 天赋只通过五维向量影响匹配（index.html 里 talentBonus 恒为 0），这里保持一致 */
function talentBonus() { return 0; }
function makeRnd(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } h = h >>> 0 || 123456789; return () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; }; }
function gsMining(g) { const pure = Math.max(0, g.hits - g.miss * .5); return { a: clamp(pure * 1.5, 0, 46), c: clamp(g.acc * 44 - 6, 0, 38), g: clamp(g.miss * 6.5 + g.ore * 1.2, 0, 36) }; }
function gsDodge(g) { return { a: clamp(g.survive * 2.4 + g.travel / 70, 0, 48), e: clamp(g.travel / 62, 0, 40), c: clamp((10 - g.survive) * 2.4 + g.hp * 7 + g.near * 1.2, 0, 44), g: clamp(g.near * 5.5, 0, 26) }; }
function gsBuild(g) { return { b: clamp(g.placed * 1.5 + g.height * 3.6, 0, 46), g: clamp(g.height * 4.4 + g.dirtyRatio * 12 + (g.colorVariety - 2) * 2.2, 0, 40), c: clamp(g.flatRatio * 40, 0, 40), bb: clamp(g.flatRatio * 20 + g.colorVariety * 2.6, 0, 40), e: clamp(g.dirtyRatio * 22 + (g.colorVariety - 2) * 3, 0, 30), en: clamp((g.enclose || 0) * 30, 0, 34) }; }
function playGames(p) {
  const S1 = gsMining(p), S2 = gsDodge(p), S3 = gsBuild(p), V = [0, 0, 0, 0, 0];
  V[0] += S1.a; V[3] += S1.c; V[2] += S1.g;
  V[0] += S2.a; V[1] += S2.e; V[3] += S2.c; V[2] += S2.g;
  V[2] += S3.g; V[3] += S3.c + S3.en * .6; V[4] += S3.bb; V[0] += S3.b * .5; V[1] += S3.e - S3.en;
  return V;
}
function rank(V, seed, tal) {
  const p = V.map((v, i) => Math.round(clamp(v / SCALE[i] * 100, 0, 100)));
  const out = MOBS.map(m => {
    let sum = 0;
    for (let j = 0; j < 5; j++) { const d = (p[j] - m.v[j]) / 100; sum += d * d; }
    return { id: m.id, raw: Math.exp(-Math.sqrt(sum) * 1.55) * (1 + talentBonus(m, tal)) * (1 + (makeRnd(seed + m.id)() - .5) * .03) };
  });
  out.sort((a, b) => b.raw - a.raw);
  return out[0].id;
}
function mkPlayer() {
  const r = Math.random;
  return { hits: Math.floor(r() * 16), miss: Math.floor(r() * 6), ore: Math.floor(r() * 5), acc: .4 + r() * .6,
    survive: r() * 10, travel: r() * 850, near: Math.floor(r() * 6), hp: 1 + Math.floor(r() * 3),
    placed: Math.floor(r() * 28), height: Math.floor(r() * 7), flatRatio: r(), colorVariety: 1 + Math.floor(r() * 7),
    dirtyRatio: r() * .8, enclose: r() * .45 };
}

/* 对每份答卷：固定答案与游戏表现，只改天赋，看结果是否变化 */
const combos = [[7, 3, 0, 0, 0], [3, 7, 0, 0, 0], [0, 0, 7, 0, 3], [0, 0, 0, 7, 3], [0, 0, 0, 0, 10], [2, 2, 2, 2, 2]];
let changed = 0, total = 0;
const distinctPerSheet = [];
const TRIALS = 400;
for (let t = 0; t < TRIALS; t++) {
  const ans = Q.map(q => Math.floor(Math.random() * q.opts.length));
  const player = mkPlayer();
  const base = playGames(player);
  ans.forEach((oi, qi) => Q[qi].opts[oi].v.forEach((v, k) => base[k] += v));
  const set = new Set();
  combos.forEach(c => {
    const V = base.slice();
    const tr = talentToRaw(c);
    for (let i = 0; i < 5; i++) V[i] += tr[i];
    set.add(rank(V, 'sheet' + t, c));
  });
  distinctPerSheet.push(set.size);
  if (set.size > 1) changed++;
  total++;
}
const mean = distinctPerSheet.reduce((a, b) => a + b, 0) / distinctPerSheet.length;
console.log('=== 天赋区分度（' + TRIALS + ' 份随机答卷，每份测试 ' + combos.length + ' 种天赋分配）===');
console.log('  至少两种天赋给出不同结果的答卷: ' + changed + ' / ' + total + '  (' + (changed / total * 100).toFixed(1) + '%)');
console.log('  平均每份答卷触发的不同角色数: ' + mean.toFixed(2) + ' / ' + combos.length);
const dist = {};
distinctPerSheet.forEach(n => dist[n] = (dist[n] || 0) + 1);
console.log('  分布: ' + Object.entries(dist).sort().map(([k, v]) => k + '种→' + v + '份').join('  '));

/* 全量可达性（随机天赋 + 随机答卷）；同时跑「无天赋」基线做对照 */
function runReach(useTalent, N, seedPrefix) {
  const hits = {}; MOBS.forEach(m => hits[m.id] = 0);
  for (let n = 0; n < N; n++) {
    const pts = [0, 0, 0, 0, 0];
    if (useTalent) { let left = 10; let guard = 0; while (left > 0 && guard++ < 500) { const t = Math.floor(Math.random() * 5); if (pts[t] >= 7) continue; pts[t]++; left--; } }
    const V = playGames(mkPlayer());
    if (useTalent) { const tr = talentToRaw(pts); for (let i = 0; i < 5; i++) V[i] += tr[i]; }
    const ans = Q.map(q => Math.floor(Math.random() * q.opts.length));
    ans.forEach((oi, qi) => Q[qi].opts[oi].v.forEach((v, k) => V[k] += v));
    hits[rank(V, seedPrefix + n, pts)]++;
  }
  return hits;
}
const byId = {}; MOBS.forEach(m => byId[m.id] = m);
const N = Number(process.env.N || 15000);
const ONLY = process.env.ONLY || 'ab';
function report(label, hits) {
  const zero = MOBS.filter(m => hits[m.id] === 0).map(m => m.zh);
  const sorted = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  console.log('\n=== ' + label + '（' + N + ' 次）===');
  console.log('  最常见: ' + sorted.slice(0, 5).map(([k, v]) => byId[k].zh + ' ' + (v / N * 100).toFixed(1) + '%').join('  '));
  console.log('  最稀有: ' + sorted.slice(-5).map(([k, v]) => byId[k].zh + ' ' + (v / N * 100).toFixed(2) + '%').join('  '));
  console.log('  未命中 ' + zero.length + ' 个: ' + (zero.length ? zero.slice(0, 20).join('、') + (zero.length > 20 ? ' …' : '') : '无'));
  return zero.length;
}
const z1 = ONLY.includes('a') ? report('A. 无天赋（基线）', runReach(false, N, 'a')) : 0;
const z2 = ONLY.includes('b') ? report('B. 带天赋（随机分配 10 点）', runReach(true, N, 'b')) : 0;
console.log('\n对照结论: A 未命中 ' + z1 + ' 个 | B 未命中 ' + z2 + ' 个');
console.log(z2 <= z1 + 1 ? '✅ 天赋未使可达性变差（允许 1 个抽样噪声）' : '❌ 天赋影响了可达性');
process.exit(z2 <= z1 + 1 ? 0 : 1);

