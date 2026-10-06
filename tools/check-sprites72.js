/* 独立渲染 index.html 里的 9 类精灵模板 → 72 角色校验图 —— 开发工具
   直接从 index.html 抽取 SPRT 渲染器与 HMOBS 表，不依赖浏览器 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
const grab = (a, b) => { const s = js.indexOf(a); const e = js.indexOf(b, s + 1); if (s < 0 || e < 0) throw new Error('找不到区间 ' + a); return js.slice(s, e); };

/* 抽取：颜色工具 + HMOBS + SPRT 渲染器（用 globalThis 承接，避免与本地 const 重名） */
globalThis.window = globalThis;
const spriteCode = grab('function hx2rgb(', 'var spriteCache={}').replace(/window\.__\w+=[^;]*;/g, '');
eval(spriteCode
  .replace('function hx2rgb(', 'globalThis.hx2rgb=function hx2rgb(')
  .replace('function shade(', 'globalThis.shade=function shade(')
  .replace('function newGrid(', 'globalThis.newGrid=function newGrid(')
  .replace('function rc(', 'globalThis.rc=function rc(')
  .replace('function dot(', 'globalThis.dot=function dot(')
  .replace('var SPRT={};', 'globalThis.SPRT={};')
  .replace(/\bSPRT\./g, 'globalThis.SPRT.'));
eval(grab('var HMOBS=[', 'var MOB_BY_ID={};').replace('var HMOBS=', 'globalThis.HMOBS='));
const HMOBS = globalThis.HMOBS;
const SPRT = globalThis.SPRT;

console.log('角色数: ' + HMOBS.length + '  模板: ' + Object.keys(SPRT).join(', '));

/* 逐角色渲染 */
const grid = {};
const problems = [];
HMOBS.forEach(m => {
  const fn = SPRT[m.t];
  if (!fn) { problems.push(m.id + ' 模板缺失 ' + m.t); return; }
  let g;
  try { g = fn(m); } catch (e) { problems.push(m.id + ' 渲染异常 ' + e.message); return; }
  grid[m.id] = g;
  let painted = 0, minX = 16, maxX = -1, minY = 16, maxY = -1;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) {
    painted++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (painted < 70) problems.push(m.id + ' 着色过少 (' + painted + ')');
  if (painted > 250) problems.push(m.id + ' 着色过多 (' + painted + ')');
  const w = maxX - minX + 1, h = maxY - minY + 1;
  if (Math.max(w, h) < 13) problems.push(m.id + ' 构图过小 (' + w + '×' + h + ')');
  if (Math.min(w, h) < 6) problems.push(m.id + ' 构图过窄 (' + w + '×' + h + ')');
});
/* 同模板内不得有完全相同的精灵 */
const sigs = {};
Object.keys(grid).forEach(id => {
  const s = grid[id].map(r => r.map(c => c || '.').join('')).join('|');
  (sigs[s] = sigs[s] || []).push(id);
});
Object.entries(sigs).forEach(([s, arr]) => { if (arr.length > 1) problems.push('精灵完全相同: ' + arr.join(', ')); });

console.log(problems.length ? ('❌ ' + problems.length + ' 处问题:\n  ' + problems.slice(0, 15).join('\n  ')) : '✅ 72 个精灵全部通过');

/* 输出拼图 */
const SCALE = 4, COLS = 12, ROWS = Math.ceil(HMOBS.length / COLS), CELL = 64;
const W = COLS * CELL, H = ROWS * CELL;
const buf = Buffer.alloc(W * H * 3, 0xff);
const hex = h => hx2rgb(h);
function put(x, y, rgb) { const i = (y * W + x) * 3; buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; }
HMOBS.forEach((m, idx) => {
  const g = grid[m.id]; if (!g) return;
  const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const rgb = g[y][x] ? hex(g[y][x]) : [246, 249, 249];
    for (let j = 0; j < SCALE; j++) for (let i = 0; i < SCALE; i++) put(ox + x * SCALE + i, oy + y * SCALE + j, rgb);
  }
  for (let i = 0; i < CELL; i++) { put(ox + i, oy, [196, 210, 210]); put(ox + i, oy + CELL - 1, [196, 210, 210]); put(ox, oy + i, [196, 210, 210]); put(ox + CELL - 1, oy + i, [196, 210, 210]); }
});
let CT = null;
function crc32(b) { if (!CT) { CT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CT[n] = c >>> 0; } } let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CT[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(t, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) buf.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(path.resolve(__dirname, '..', 'screenshots', 'sprites-72.png'),
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
console.log('已输出 screenshots/sprites-72.png (' + W + '×' + H + ')');
process.exit(problems.length ? 1 : 0);
