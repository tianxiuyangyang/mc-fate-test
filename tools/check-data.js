/* 角色库完整性核对（HMOBS 部分，纯 Node） —— 开发工具
   CHAR_COPY 的文案字段校验在浏览器端完成（见 tools/e2e-test.js 的「文案审计」断言） */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
const grab = (a, b) => { const s = js.indexOf(a); const e = js.indexOf(b, s + 1); if (s < 0 || e < 0) throw new Error('区间未找到: ' + a); return js.slice(s, e); };

globalThis.window = globalThis;
/* 按括号配对取出数组字面量（HMOBS 数据内不含方括号，安全） */
function extractArray(code, startMark) {
  const at = code.indexOf(startMark);
  if (at < 0) throw new Error('未找到 ' + startMark);
  const open = code.indexOf('[', at);
  let depth = 0, i = open;
  for (; i < code.length; i++) {
    const ch = code[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) break; }
  }
  return code.slice(open, i + 1);
}
function jsToJson(literal) {
  return literal
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'([^']*)'/g, '"$1"');
}
const H = JSON.parse(jsToJson(extractArray(js, 'var HMOBS=')));
eval(grab('var DIMS=[', 'var V=null;').replace('var DIMS=', 'globalThis.DIMARR='));
eval(grab('var QUESTIONS=[', '/* =========================================================================\n   5. 状态与流程').replace('var QUESTIONS=', 'globalThis.Q='));
const DIMARR = globalThis.DIMARR, Q = globalThis.Q;
const TEMPLATES = ['humanoid', 'zombie', 'quadruped', 'blob', 'bird', 'fish', 'flyer', 'bug', 'huge'];
const problems = [];

if (H.length !== 72) problems.push('角色数 ' + H.length + '（应为 72）');
if (Q.length !== 7) problems.push('题目数 ' + Q.length + '（应为 7）');
if (DIMARR.length !== 5) problems.push('维度数 ' + DIMARR.length + '（应为 5）');
const ids = H.map(m => m.id);
if (new Set(ids).size !== ids.length) problems.push('角色 id 有重复');

H.forEach(m => {
  if (!Array.isArray(m.v) || m.v.length !== 5) problems.push(m.id + ' 5 维坐标异常');
  else if (m.v.some(x => typeof x !== 'number' || isNaN(x) || x < 0 || x > 100)) problems.push(m.id + ' 坐标越界: ' + m.v.join(','));
  ['zh', 'en', 't', 'tag', 'c1', 'c2', 'eye'].forEach(k => { if (m[k] === undefined) problems.push(m.id + ' 缺字段 ' + k); });
  if (typeof m.d !== 'number') problems.push(m.id + ' 缺危险度');
  if (TEMPLATES.indexOf(m.t) < 0) problems.push(m.id + ' 模板非法: ' + m.t);
});

Q.forEach((q, qi) => {
  if (!q.q || !q.ice) problems.push('第' + (qi + 1) + '题缺题干');
  if (q.opts.length !== 4) problems.push('第' + (qi + 1) + '题选项数 ' + q.opts.length + '（应为 4）');
  q.opts.forEach((o, oi) => {
    if (!o.t) problems.push('第' + (qi + 1) + '题第' + (oi + 1) + '项缺文案');
    if (!Array.isArray(o.v) || o.v.length !== 5) problems.push('第' + (qi + 1) + '题第' + (oi + 1) + '项向量长度异常');
    else if (o.v.some(x => typeof x !== 'number' || isNaN(x))) problems.push('第' + (qi + 1) + '题第' + (oi + 1) + '项含 NaN');
  });
});

const byT = {}; H.forEach(m => byT[m.t] = (byT[m.t] || 0) + 1);
TEMPLATES.forEach(t => { if (!byT[t]) problems.push('模板 ' + t + ' 没有角色'); });

console.log('=== 5 维坐标分布 ===');
DIMARR.forEach((d, i) => {
  const vals = H.map(m => m.v[i]);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  console.log('  ' + d.padEnd(7) + ' 均值 ' + mean.toFixed(1) + '  标准差 ' + sd.toFixed(1) +
    '  范围 ' + Math.min(...vals) + '-' + Math.max(...vals) + '  不同取值 ' + new Set(vals).size + ' 种');
  if (sd < 15) problems.push(d + ' 分散度不足');
});
console.log('\n=== 覆盖情况 ===');
console.log('  角色 ' + H.length + ' 位   模板 ' + TEMPLATES.length + ' 类: ' + TEMPLATES.map(t => t + '×' + byT[t]).join('  '));
console.log('  题目 ' + Q.length + ' 道 × 4 选项 = ' + Q.reduce((s, q) => s + q.opts.length, 0) + ' 个选项');
console.log('  维度 ' + DIMARR.join(' / '));

if (problems.length) { console.log('\n❌ 问题 ' + problems.length + ' 处:'); problems.slice(0, 25).forEach(p => console.log('   ' + p)); process.exit(1); }
console.log('\n✅ 角色库核对通过：72 角色 / 9 类模板 / 5 维坐标合法 / 7 题 × 4 选项');
