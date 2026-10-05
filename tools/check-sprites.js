/* 精灵数据校验：16x16 / 色键合法 / 镜像行对称 —— 开发工具，可删 */
const fs = require('fs');
const src = fs.readFileSync('E:/张睿琛文件/本名mc测试网站/index.html', 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
/* 用最后一次出现，避免命中注释里的同名文本 */
const cut = (a, b) => { const s = js.lastIndexOf(a), e = js.indexOf(b, s + 1); return js.slice(s, e); };
eval(cut('var PAL={', 'var SPR={').replace('var PAL=', 'globalThis.PAL='));
eval(cut('var SPR={', 'var ORDER=').replace('var SPR=', 'globalThis.SPR='));

const SPR = globalThis.SPR;
/* 刻意不对称的行：幻翼翅膀(0-5)、海豚背鳍/尾鳍(0-9)、女巫尖帽(0-3)、末影龙龙尾(15) 等 */
const ASYM_OK = {
  phantom: [0, 1, 2, 3, 4, 5, 14, 15],
  dolphin: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15],
  witch: [0, 1, 2, 3],
  dragon: [0, 1, 2, 3, 8, 9, 14, 15],
  creeper: [],
  wither: []
};
let bad = 0;
const ids = Object.keys(SPR);
for (const id of ids) {
  const d = SPR[id];
  const exempt = ASYM_OK[id] || [];
  if (d.r.length !== 16) { console.log('✗ ' + id + ' 行数=' + d.r.length); bad++; continue; }
  d.r.forEach((r, y) => {
    if (r.length !== 16) { console.log('✗ ' + id + ' 第' + y + '行宽度=' + r.length); bad++; }
    for (const ch of r) if (ch !== '_' && ch !== '*' && !(ch in d.p)) { console.log('✗ ' + id + ' 第' + y + '行未定义色键 "' + ch + '"'); bad++; }
    if (exempt.includes(y)) return;
    if (!r.includes('*')) {
      for (let x = 0; x < 8; x++) {
        if (r[x] !== r[15 - x]) { console.log('✗ ' + id + ' 第' + y + '行左右不对称: ' + r); bad++; break; }
      }
    }
  });
  const painted = d.r.join('').replace(/[_*]/g, '').length;
  if (painted < 60) { console.log('✗ ' + id + ' 着色像素过少 (' + painted + ')'); bad++; }
}
console.log('');
console.log(bad === 0
  ? '✅ 12 个精灵全部通过：16×16、色键合法、对称行左右一致、着色量充足'
  : '❌ 共 ' + bad + ' 处问题');
process.exit(bad ? 1 : 0);
