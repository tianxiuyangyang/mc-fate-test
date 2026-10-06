/* 天赋系统校验：核对 index.html 里的天赋参数，并给出每点天赋的强度参考 —— 开发工具
   可达性 / 区分度的完整模拟见 tools/check-talent.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
const grab = (a, b) => { const s = js.indexOf(a); const e = js.indexOf(b, s + 1); if (s < 0 || e < 0) throw new Error('区间未找到: ' + a); return js.slice(s, e); };

globalThis.window = globalThis;
/* 按括号配对提取数组字面量，避免把后面的函数体一起 eval */
function pickArray(code, startMark) {
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
function toJson(lit) {
  return lit.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":').replace(/'([^']*)'/g, '"$1"');
}
const DIMARR = JSON.parse(toJson(pickArray(js, 'var DIMS=')));
const SC = JSON.parse(pickArray(js, 'var SCALE='));
const TALENTS = JSON.parse(toJson(pickArray(js, 'var TALENTS=')));
const UNIT = Number(/var TALENT_UNIT=(\d+)/.exec(js)[1]);
const TOTAL = Number(/var TALENT_TOTAL=(\d+)/.exec(js)[1]);
const CAP = Number(/var TALENT_CAP=(\d+)/.exec(js)[1]);
/* 匹配加成已取消（talentBonus 恒为 0），确认它确实不再参与判定 */
const bonusOff = /function talentBonus\(\)\{\s*return 0;\s*\}/.test(js.replace(/\s+/g, ' ').replace(/\s*\{\s*/g, '{').replace(/\s*\}\s*/g, '}'))
  || /talentBonus\(\)\s*\{\s*return 0;/.test(js);

const problems = [];
if (TALENTS.length !== 5) problems.push('天赋数量 ' + TALENTS.length + '（应为 5）');
if (TOTAL !== 10) problems.push('总点数 ' + TOTAL + '（应为 10）');
if (CAP !== 7) problems.push('单项上限 ' + CAP + '（应为 7）');
if (CAP * 2 < TOTAL) problems.push('单项上限过低，无法分配完 ' + TOTAL + ' 点');
TALENTS.forEach(t => { if (!t.id || !t.name || !t.icon || !t.desc || !t.col || t.v.length !== 5) problems.push('天赋字段异常: ' + (t.id || t.name)); });

console.log('=== 天赋配置 ===');
console.log('  总点数 ' + TOTAL + '   单项上限 ' + CAP + '   强度系数 TALENT_UNIT=' + UNIT);
console.log('  匹配加成: ' + (bonusOff ? '已关闭（天赋只通过五维向量影响匹配）' : '⚠ 仍存在加成函数'));
console.log('\n=== 每点天赋对各维的贡献（归一化 0-100 分）===');
console.log('  ' + '天赋'.padEnd(8) + DIMARR.map(d => d.padStart(7)).join(''));
TALENTS.forEach(t => {
  const row = t.v.map((x, j) => (x * UNIT / SC[j] * 100).toFixed(1).padStart(7)).join('');
  console.log('  ' + (t.name + ' ' + t.icon).padEnd(8) + row);
});
/* 单点总量与满载参考 */
const perPoint = TALENTS.map(t => t.v.reduce((s, x, j) => s + x * UNIT / SC[j] * 100, 0));
console.log('\n=== 强度参考 ===');
TALENTS.forEach((t, i) => console.log('  ' + t.name + '：每点合计 +' + perPoint[i].toFixed(1) + ' 分，满点 ' + CAP + ' 点 → +' + (perPoint[i] * CAP).toFixed(0) + ' 分'));
const maxAll = Math.max(...TALENTS.map(t => t.v.reduce((s, x, j) => s + x * UNIT / SC[j] * 100, 0) * TOTAL));
console.log('  10 点全部集中投入时最高约 +' + maxAll.toFixed(0) + ' 分（五维合计，满值 500）');
console.log('  即天赋约占最终判定的 ' + (maxAll / 500 * 100).toFixed(0) + '% 量级，主体仍由题目与小游戏决定');

if (!bonusOff) problems.push('talentBonus 仍参与判定');
if (problems.length) { console.log('\n❌ 配置问题:'); problems.forEach(p => console.log('   ' + p)); process.exit(1); }
console.log('\n✅ 天赋配置校验通过');
