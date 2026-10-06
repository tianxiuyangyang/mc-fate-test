/* 自动微调 5 维坐标：保证 72 个角色全部可被真实答卷命中 —— 开发工具
   策略：先采样真实玩家分布，对「从未被命中」的角色按最小步长整体移向玩家重心，
        每轮只移动 1 格，直到可命中或达到步数上限；同时约束角色之间距离不塌陷。 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
let MOBS = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'mobs5d.json'), 'utf8'));
const DIMS = ['action', 'extra', 'aggro', 'care', 'build'];
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

/* ---- 从 index.html 做题与小游戏 ---- */
const src = fs.readFileSync(path.resolve(DIR, '..', 'index.html'), 'utf8');
const qs = src.indexOf('var QUESTIONS=[');
const qe = src.indexOf('/* =========================================================================\n   5. 状态与流程', qs);
eval(src.slice(qs, qe).replace('var QUESTIONS=', 'globalThis.__Q='));
const Q = globalThis.__Q;

function gsMining(g) { const pure = Math.max(0, g.hits - g.miss * 0.5); return { a: clamp(pure * 1.5, 0, 46), c: clamp(g.acc * 44 - 6, 0, 38), g: clamp(g.miss * 6.5 + g.ore * 1.2, 0, 36) }; }
function gsDodge(g) { return { a: clamp(g.survive * 2.4 + g.travel / 70, 0, 48), e: clamp(g.travel / 62, 0, 40), c: clamp((10 - g.survive) * 2.4 + g.hp * 7 + g.near * 1.2, 0, 44), g: clamp(g.near * 5.5, 0, 26) }; }
function gsBuild(g) { return { b: clamp(g.placed * 1.5 + g.height * 3.6, 0, 46), g: clamp(g.height * 4.4 + g.dirtyRatio * 12 + (g.colorVariety - 2) * 2.2, 0, 40), c: clamp(g.flatRatio * 40, 0, 40), bb: clamp(g.flatRatio * 20 + g.colorVariety * 2.6, 0, 40), e: clamp(g.dirtyRatio * 22 + (g.colorVariety - 2) * 3, 0, 30), en: clamp((g.enclose || 0) * 30, 0, 34) }; }
function playGames(p) {
  const S1 = gsMining(p), S2 = gsDodge(p), S3 = gsBuild(p), V = [0, 0, 0, 0, 0];
  V[0] += S1.a; V[3] += S1.c; V[2] += S1.g;
  V[0] += S2.a; V[1] += S2.e; V[3] += S2.c; V[2] += S2.g;
  V[2] += S3.g; V[3] += S3.c + S3.en * 0.6; V[4] += S3.bb; V[0] += S3.b * 0.5; V[1] += S3.e - S3.en;
  return V;
}
function mkPlayer(kind) {
  const rnd = Math.random, bias = kind === 'normal' ? .5 : kind === 'keen' ? .78 : 1;
  const j = max => Math.floor(rnd() * max * bias + rnd() * max * (1 - bias) * .3);
  return {
    hits: j(16), miss: Math.floor(rnd() * 6 * (1 - bias * .5)), ore: j(5),
    acc: kind === 'normal' ? .4 + rnd() * .6 : kind === 'keen' ? .6 + rnd() * .4 : .85 + rnd() * .15,
    survive: kind === 'normal' ? rnd() * 10 : kind === 'keen' ? 4 + rnd() * 6 : 8.5 + rnd() * 1.5,
    travel: rnd() * 850 * bias, near: j(6), hp: 1 + Math.floor(rnd() * 3),
    placed: j(28), height: j(7), flatRatio: rnd(), colorVariety: 1 + j(7), dirtyRatio: rnd() * .8,
    enclose: kind === 'extreme' ? .1 + rnd() * .3 : rnd() * .45
  };
}
const SCALE = [145, 79, 145, 220, 150];

/* ---------- 开局天赋（与 index.html 保持一致） ---------- */
const TALENTS = [
  { id: 'wisdom', v: [0.29, 0.00, 0.00, 0.62, 0.14] },
  { id: 'body', v: [0.86, 0.03, 0.21, 0.07, 0.00] },
  { id: 'look', v: [0.07, 0.90, 0.00, 0.07, 0.00] },
  { id: 'wealth', v: [0.07, 0.28, 0.00, 0.14, 0.52] },
  { id: 'luck', v: [0.24, 0.17, 0.07, 0.14, 0.24] }
];
const TALENT_UNIT = 6, TALENT_TOTAL = 10, TALENT_CAP = 7;
const TALENT_SAMPLES = true;
function randomTalentPoints() {
  const pts = [0, 0, 0, 0, 0];
  let left = TALENT_TOTAL, guard = 0;
  while (left > 0 && guard++ < 500) {
    const t = Math.floor(Math.random() * 5);
    if (pts[t] >= TALENT_CAP) continue;
    pts[t]++; left--;
  }
  return pts;
}
function talentToRaw(points) {
  const o = [0, 0, 0, 0, 0];
  TALENTS.forEach((t, i) => { for (let j = 0; j < 5; j++) o[j] += t.v[j] * (points[i] || 0) * TALENT_UNIT; });
  return o;
}
let makeRnd = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } h = h >>> 0 || 123456789; return () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; }; };
function rank(V, seed, mobs) {
  const p = V.map((v, i) => Math.round(clamp(v / SCALE[i] * 100, 0, 100)));
  const out = mobs.map(m => {
    let sum = 0;
    for (let j = 0; j < 5; j++) { const d = (p[j] - m.v[DIMS[j]]) / 100; sum += d * d; }
    let raw = Math.exp(-Math.sqrt(sum) * 1.55) * (1 + (makeRnd(seed + m.id)() - 0.5) * 0.03);
    return { id: m.id, raw };
  });
  out.sort((a, b) => b.raw - a.raw);
  return out[0].id;
}

/* ---- 采样玩家答卷 <-> 归一化坐标 的对照表 ---- */
const N = Number(process.env.N || 12000);
const samples = [];
const colSums = [0, 0, 0, 0, 0];
for (let n = 0; n < N; n++) {
  const ans = Q.map(q => Math.floor(Math.random() * q.opts.length));
  const V = [0, 0, 0, 0, 0];
  ans.forEach((oi, qi) => Q[qi].opts[oi].v.forEach((v, k) => V[k] += v));
  const g = playGames(mkPlayer(['normal', 'keen', 'extreme'][n % 3]));
  for (let i = 0; i < 5; i++) V[i] += g[i];
  /* 关键：把「开局天赋」也纳入玩家分布，否则角色坐标会停在无天赋的位置，
     加入天赋后玩家整体偏移，处于角落的角色就再也匹配不到 */
  if (TALENT_SAMPLES) {
    const tp = randomTalentPoints();
    const tr = talentToRaw(tp);
    for (let i = 0; i < 5; i++) V[i] += tr[i];
  }
  const p = V.map((v, i) => Math.round(clamp(v / SCALE[i] * 100, 0, 100)));
  samples.push({ p, key: String(n) });
  p.forEach((v, i) => colSums[i] += v);
}
const centroid = colSums.map(s => Math.round(s / N));
console.log('玩家分布重心: ' + DIMS.map((d, i) => d + '=' + centroid[i]).join('  '));

function hitCounts(mobs) {
  const hits = {};
  mobs.forEach(m => hits[m.id] = 0);
  samples.forEach((s, i) => { hits[rank(s.p.map((v, k) => v * SCALE[k] / 100), s.key, mobs)]++; });
  return hits;
}
function minPairDist(mobs) {
  let mn = 1e9, who = '';
  for (let i = 0; i < mobs.length; i++) for (let j = i + 1; j < mobs.length; j++) {
    let s = 0;
    for (let k = 0; k < 5; k++) s += Math.pow(mobs[i].v[DIMS[k]] - mobs[j].v[DIMS[k]], 2);
    const d = Math.sqrt(s);
    if (d < mn) { mn = d; who = mobs[i].zh + '↔' + mobs[j].zh; }
  }
  return { mn, who };
}

console.log('\n=== 自动微调（爬山：最小化到最近玩家样本的距离）===');
function nearestSampleDist(mob) {
  let best = 1e9;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].p;
    let s = 0;
    for (let k = 0; k < 5; k++) s += Math.pow(p[k] - mob.v[DIMS[k]], 2);
    const d = Math.sqrt(s);
    if (d < best) best = d;
  }
  return best;
}
/* 该点附近的玩家样本密度（越大说明越拥挤，放在这里会抢走很多答卷）
   返回 0~1 的拥挤度：统计有多少比例的样本落在距离 R 以内 */
const DENS_R = 20;
function sampleDensity(mob) {
  let near = 0;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].p;
    let s = 0;
    for (let k = 0; k < 5; k++) s += Math.pow(p[k] - mob.v[DIMS[k]], 2);
    if (s < DENS_R * DENS_R) near++;
  }
  return near / samples.length;
}
function byIdOf(id) { return MOBS.find(m => m.id === id) || { zh: id }; }
function neighbours(mob) {
  const out = [];
  /* 先大步长再小步长，避免卡在局部最优 */
  for (let k = 0; k < 5; k++) for (const step of [6, -6, 3, -3, 1, -1]) {
    const c = { id: mob.id, zh: mob.zh, v: Object.assign({}, mob.v) };
    c.v[DIMS[k]] = clamp(c.v[DIMS[k]] + step, 6, 96);
    out.push(c);
  }
  return out;
}
const MAX_ROUND = Number(process.env.ROUNDS || 200);
for (let round = 1; round <= MAX_ROUND; round++) {
  const hits = hitCounts(MOBS);
  const misses = MOBS.filter(m => hits[m.id] === 0);
  /* 过度集中的角色也要挪动：否则「全高」角落的角色会吃掉大部分答卷 */
  const ranked = Object.entries(hits).sort((a, b) => b[1] - a[1]);
  const CAP_SHARE = 0.16;                    /* 单个角色最多占 16% 的答卷 */
  const tooHot = ranked.filter(([, v]) => v > N * CAP_SHARE).slice(0, 6)
    .map(([id]) => MOBS.find(m => m.id === id)).filter(Boolean);
  if (!misses.length && !tooHot.length) { console.log('第 ' + round + ' 轮：全部可命中且分布均匀 ✅'); break; }
  if (round <= 6 || round % 20 === 0) {
    console.log('第 ' + round + ' 轮：未命中 ' + misses.length + ' 个' +
      (tooHot.length ? '，过度集中 ' + tooHot.length + ' 个（最高 ' + byIdOf(ranked[0][0]).zh + ' ' + (ranked[0][1] / N * 100).toFixed(1) + '%）' : '') +
      (misses.length ? ' → ' + misses.map(m => m.zh).join('、') : ''));
  }
  /* 先处理未命中（必须能命中），再处理过热（分散分布） */
  const toMove = misses.concat(tooHot.filter(m => misses.indexOf(m) < 0));
  toMove.forEach(m => {
    let bestV = null, bestScore = 1e9;
    const cands = [{ v: m.v }].concat(neighbours(m));
    cands.forEach(c => {
      let sep = 1e9;
      for (const o of MOBS) {
        if (o.id === m.id) continue;
        let s = 0;
        for (let k = 0; k < 5; k++) s += Math.pow(o.v[DIMS[k]] - c.v[DIMS[k]], 2);
        sep = Math.min(sep, Math.sqrt(s));
      }
      /* 目标：到最近玩家样本尽量近（保证可命中）+ 与邻居保持间距（避免重合） */
      let score = nearestSampleDist(c) + (sep < 6 ? (6 - sep) * 4 : 0);
      /* 过热角色：强力偏好低密度区域（36 分的距离量级 vs 密度 0~1，系数取 40 才有可比性） */
      if (tooHot.indexOf(m) >= 0) score += sampleDensity(c) * 40;
      if (score < bestScore) { bestScore = score; bestV = c.v; }
    });
    if (bestV) m.v = bestV;
  });
  if (round === MAX_ROUND) { console.log('❌ ' + MAX_ROUND + ' 轮仍未收敛'); process.exit(1); }
}

const hits = hitCounts(MOBS);
const zero = MOBS.filter(m => hits[m.id] === 0);
const dist = minPairDist(MOBS);
console.log('\n最终最小角色间距: ' + dist.mn.toFixed(1) + ' (' + dist.who + ')');
const top = Object.entries(hits).sort((a, b) => b[1] - a[1]);
const byId = {}; MOBS.forEach(m => byId[m.id] = m);
console.log('最常见 5 个: ' + top.slice(0, 5).map(([k, v]) => byId[k].zh + ' ' + (v / N * 100).toFixed(1) + '%').join('  '));
console.log('最稀有 5 个: ' + top.slice(-5).map(([k, v]) => byId[k].zh + ' ' + (v / N * 100).toFixed(2) + '%').join('  '));
if (zero.length) { console.log('❌ 仍有不可命中: ' + zero.map(m => m.zh).join('、')); process.exit(1); }
console.log('✅ 72 个角色全部可命中');

/* 各维分布 */
console.log('\n微调后各维分布:');
DIMS.forEach(d => {
  const vals = MOBS.map(m => m.v[d]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  console.log('  ' + d.padEnd(7) + ' 均值 ' + mean.toFixed(1) + '  标准差 ' + sd.toFixed(1) + '  范围 ' + Math.min.apply(null, vals) + '-' + Math.max.apply(null, vals));
});

fs.writeFileSync(path.join(DIR, 'data', 'mobs5d.json'), JSON.stringify(MOBS, null, 1), 'utf8');
console.log('\n已写回 tools/data/mobs5d.json');
