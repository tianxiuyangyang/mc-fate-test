/* 精灵数据修正（按镜像规则程序化重写）—— 开发工具，可删
   规则：镜像轴在 7/8 列之间，要求 row[x] === row[15-x]。
   本脚本对指定行做「左半段对称化」：以 x 与 15-x 中更靠内容中心的字符为准（取两者中非空白的那个），
   若两者都是实体字符但不同，则用左半段字符覆盖右半段（left-wins），保证结果必定对称。 */
const fs = require('fs');
const FILE = 'E:/张睿琛文件/本名mc测试网站/index.html';

/* 需要强制对称的行（脸/身体/脚），phantom 翅膀行只做长度校验 */
const TARGETS = {
  steve:    [3, 6],
  alex:     [4],
  enderman: [5],
  zombie:   [3, 4, 6, 15],
  skeleton: [3, 4],
  villager: [3, 5, 6, 10, 11],
  witch:    [8, 9],
  dragon:   [4]
};

let src = fs.readFileSync(FILE, 'utf8');
let fixed = 0;
const log = [];

for (const [id, rowIdxs] of Object.entries(TARGETS)) {
  const start = src.indexOf(id + ':{p:PAL.');
  if (start < 0) { log.push('✗ 找不到 ' + id); continue; }
  const arrStart = src.indexOf('r:[', start) + 2;
  const arrEnd = src.indexOf(']}', arrStart);
  const lines = src.slice(arrStart, arrEnd).split('\n');
  const rowLine = [];
  lines.forEach((l, i) => { if (/^\s*"/.test(l)) rowLine.push(i); });

  for (const y of rowIdxs) {
    const li = rowLine[y];
    if (li === undefined) { log.push('✗ ' + id + ' r' + y + ' 不存在'); continue; }
    const old = lines[li].match(/^\s*"([^"]*)"/)[1];
    if (old.length !== 16) { log.push('✗ ' + id + ' r' + y + ' 宽度 ' + old.length); continue; }
    const a = old.split('');
    for (let x = 0; x < 8; x++) {
      const L = a[x], R = a[15 - x];
      if (L === R) continue;
      /* 左侧是空白而右侧有内容 → 说明整体偏右，把内容放到左侧（左对齐镜像） */
      if (L === '_') a[x] = R;
      else if (R === '_') a[15 - x] = L;
      else a[15 - x] = L;      /* 两侧都是实体但不同 → 以左半段为准 */
    }
    const now = a.join('');
    let ok = true;
    for (let x = 0; x < 8; x++) if (now[x] !== now[15 - x]) ok = false;
    if (!ok) { log.push('✗ ' + id + ' r' + y + ' 仍不对称: ' + now); continue; }
    const indent = lines[li].match(/^\s*/)[0];
    const tail = lines[li].replace(/^\s*"[^"]*"/, '');
    lines[li] = indent + '"' + now + '"' + tail;
    fixed++;
    log.push('· ' + id + ' r' + y + '  ' + old + '  →  ' + now);
  }
  src = src.slice(0, arrStart) + lines.join('\n') + src.slice(arrEnd);
}
log.forEach(l => console.log(l));
fs.writeFileSync(FILE, src, 'utf8');
console.log('\n✓ 已对称化 ' + fixed + ' 行');
