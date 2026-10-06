/* 把微调后的 5 维坐标同步回 index.html 的 HMOBS 表（按行替换） —— 开发工具 */
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '..', 'index.html');
const MOBS = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'mobs5d.json'), 'utf8'));
const lines = fs.readFileSync(FILE, 'utf8').split('\n');
let n = 0;
const miss = [];
MOBS.forEach(m => {
  const mark = "{id:'" + m.id + "',";
  const li = lines.findIndex(l => l.indexOf(mark) >= 0);
  if (li < 0) { miss.push(m.id); return; }
  const before = lines[li];
  const after = before.replace(/v:\[[^\]]*\]/, 'v:[' + [m.v.action, m.v.extra, m.v.aggro, m.v.care, m.v.build].join(',') + ']');
  if (after === before && before.indexOf('v:[') >= 0 && !/v:\[.*\]/.test(after)) miss.push(m.id + '(替换无效)');
  else if (after === before && !/v:\[[^\]]*\]/.test(before)) miss.push(m.id + '(无 v 字段)');
  else { lines[li] = after; n++; }
});
if (miss.length) { console.log('❌ 未同步 ' + miss.length + ' 个: ' + miss.slice(0, 8).join(', ')); process.exit(1); }
fs.writeFileSync(FILE, lines.join('\n'), 'utf8');
console.log('✓ 已按行同步 ' + n + ' 个角色的 5 维坐标');
