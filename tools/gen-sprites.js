/* 像素精灵模板渲染器 + 拼图校验 —— 开发工具
   输出: tools/_sheet.png（72 个精灵拼图，供肉眼校验） */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const DATA = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data', 'mobs.json'), 'utf8'));
const MOBS = DATA.mobs;

/* ---------- 像素画布 ---------- */
function makeGrid() { const g = []; for (let y = 0; y < 16; y++) { const r = []; for (let x = 0; x < 16; x++) r.push(null); g.push(r); } return g; }
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function shade(c, f) {
  const [r, g, b] = hex(c);
  const cl = v => Math.max(0, Math.min(255, Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1))));
  return '#' + [cl(r), cl(g), cl(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const rect = (g, x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && i >= 0 && i < 16 && j >= 0 && j < 16) g[j][i] = c; };
const px = (g, x, y, c) => { if (g[y] && x >= 0 && x < 16) g[y][x] = c; };
/* 镜像右半到左半（画右半即可） */
function mirror(g) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) g[y][x] = g[y][15 - x];
  return g;
}
/* 自动描边：给所有透明但与实体相邻的像素上描边色 */
function outline(g, col) {
  const add = [];
  const N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (g[y][x]) continue;
    for (const [dx, dy] of N) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && g[ny][nx]) { add.push([x, y]); break; }
    }
  }
  add.forEach(([x, y]) => { g[y][x] = col; });
  return g;
}

/* ---------- 通用部件 ---------- */
function eyes(g, y, xs, col, size) {
  size = size || 2;
  xs.forEach(x => rect(g, x, y, size, size, col));
}
function headBlock(g, x, y, w, h, c, face) {
  rect(g, x, y, w, h, c);
  rect(g, x + 1, y + h - 2, w - 2, 1, shade(c, .82));   /* 下颚阴影 */
  if (face) rect(g, x - 1, y + 1, 1, h - 2, face), rect(g, x + w, y + 1, 1, h - 2, face);
}

/* ---------- 9 类模板 ---------- */
const T = {};

/* 人形：头 + 躯干 + 双臂 + 双腿 */
T.humanoid = function (m) {
  const g = makeGrid();
  const body = m.c1, skin = m.c2, eye = m.eye;
  const leg = shade(body, .62), arm = shade(body, .9), hair = shade(skin, .55);
  /* 腿 */
  rect(g, 4, 12, 3, 4, leg); rect(g, 9, 12, 3, 4, leg);
  rect(g, 4, 15, 3, 1, shade(leg, .7)); rect(g, 9, 15, 3, 1, shade(leg, .7));
  /* 躯干 + 臂 */
  rect(g, 4, 8, 8, 4, body);
  rect(g, 2, 8, 2, 4, arm); rect(g, 12, 8, 2, 4, arm);
  rect(g, 2, 11, 2, 1, skin); rect(g, 12, 11, 2, 1, skin);   /* 手 */
  /* 头 */
  headBlock(g, 3, 1, 10, 7, skin, hair);
  rect(g, 3, 1, 10, 2, hair);                                 /* 头发 */
  rect(g, 4, 0, 8, 1, hair);
  /* 特征装饰 */
  if (m.deco === 'witch_hat') { rect(g, 5, -0, 6, 1, shade(body, .8)); rect(g, 6, 0, 4, 1, shade(body, .8)); }
  if (m.deco === 'helmet') rect(g, 3, 1, 10, 2, shade(body, .75));
  if (m.deco === 'horns') { rect(g, 3, 0, 2, 2, shade(body, .8)); rect(g, 11, 0, 2, 2, shade(body, .8)); }
  if (m.deco === 'ears') { rect(g, 2, 3, 1, 3, body); rect(g, 13, 3, 1, 3, body); }
  /* 眼睛 */
  eyes(g, 4, [6, 8], eye, 1);
  /* 嘴 */
  rect(g, 7, 6, 2, 1, shade(skin, .62));
  return g;
};

/* 亡灵：方块头 + 细长肢体 */
T.zombie = function (m) {
  const g = makeGrid();
  const bone = m.c1, cloth = m.c2, eye = m.eye;
  /* 腿 */
  rect(g, 4, 12, 3, 4, shade(cloth, .8)); rect(g, 9, 12, 3, 4, shade(cloth, .8));
  /* 躯干 */
  rect(g, 4, 8, 8, 4, cloth);
  rect(g, 7, 9, 2, 3, shade(cloth, .78));                    /* 胸骨/阴影 */
  /* 手臂 */
  rect(g, 2, 8, 2, 5, bone); rect(g, 12, 8, 2, 5, bone);
  /* 头骨 */
  headBlock(g, 3, 1, 10, 7, bone, shade(bone, .85));
  rect(g, 6, 6, 4, 1, eye);                                   /* 牙列 */
  eyes(g, 4, [6, 8], eye, 2);
  if (m.deco === 'wither') { rect(g, 3, 1, 10, 2, shade(bone, .8)); rect(g, 5, 0, 6, 1, shade(bone, .8)); }
  return g;
};

/* 四足：偏长的身体 + 四条腿 + 头在左上 */
T.quadruped = function (m) {
  const g = makeGrid();
  const body = m.c1, patch = m.c2, eye = m.eye;
  /* 腿 */
  rect(g, 3, 12, 2, 4, shade(body, .78)); rect(g, 6, 12, 2, 4, shade(body, .78));
  rect(g, 9, 12, 2, 4, shade(body, .78)); rect(g, 12, 12, 2, 4, shade(body, .78));
  /* 身体 */
  rect(g, 2, 8, 12, 4, body);
  rect(g, 3, 10, 10, 2, patch);                                /* 腹部/花纹 */
  /* 头 */
  headBlock(g, 2, 4, 6, 5, body, shade(body, .85));
  rect(g, 2, 4, 6, 2, shade(body, 1.12));
  /* 耳 */
  rect(g, 2, 3, 2, 1, shade(body, .8)); rect(g, 6, 3, 2, 1, shade(body, .8));
  /* 尾 */
  rect(g, 14, 8, 1, 2, shade(body, .85));
  eyes(g, 6, [3, 6], eye, 1);
  if (m.deco === 'snout') rect(g, 1, 7, 1, 2, shade(body, .9));
  return g;
};

/* 方块怪：方头方身 + 四条小短腿 */
T.blob = function (m) {
  const g = makeGrid();
  const body = m.c1, dark = m.c2, eye = m.eye;
  /* 腿 */
  rect(g, 2, 13, 3, 3, shade(body, .72)); rect(g, 11, 13, 3, 3, shade(body, .72));
  /* 身体 */
  rect(g, 1, 6, 14, 7, body);
  rect(g, 1, 6, 14, 1, shade(body, 1.15));
  rect(g, 1, 12, 14, 1, shade(body, .82));
  /* 头 */
  rect(g, 2, 0, 12, 6, body);
  rect(g, 2, 0, 12, 1, shade(body, 1.15));
  /* 脸：空洞眼 + 嘴 */
  rect(g, 4, 2, 3, 3, dark); rect(g, 9, 2, 3, 3, dark);
  rect(g, 6, 5, 4, 1, dark);
  rect(g, 6, 5, 2, 2, dark); rect(g, 8, 5, 2, 2, dark);
  rect(g, 7, 5, 2, 2, dark);
  if (m.deco === 'speck') { px(g, 4, 10, dark); px(g, 10, 9, dark); px(g, 7, 11, dark); }
  return g;
};

/* 鸟类：椭圆身 + 喙 + 翅 */
T.bird = function (m) {
  const g = makeGrid();
  const body = m.c1, wing = m.c2, eye = m.eye;
  rect(g, 4, 12, 2, 3, shade(body, .75)); rect(g, 9, 12, 2, 3, shade(body, .75));
  rect(g, 3, 6, 10, 7, body);
  rect(g, 3, 6, 10, 1, shade(body, 1.12));
  rect(g, 1, 8, 3, 4, wing); rect(g, 12, 8, 3, 4, wing);       /* 翅 */
  rect(g, 2, 9, 2, 3, shade(wing, .88)); rect(g, 12, 9, 2, 3, shade(wing, .88));
  /* 头 */
  rect(g, 4, 2, 7, 5, body);
  rect(g, 4, 2, 7, 1, shade(body, 1.12));
  rect(g, 3, 5, 1, 2, shade(body, .9));                        /* 喙 */
  eyes(g, 4, [5, 8], eye, 1);
  if (m.deco === 'bige ye') eyes(g, 4, [5, 8], eye, 2);
  if (m.deco === 'bigeye') eyes(g, 4, [4, 7], eye, 2);
  return g;
};

/* 水生：横向流线身体 + 背鳍 + 尾 */
T.fish = function (m) {
  const g = makeGrid();
  const body = m.c1, belly = m.c2, eye = m.eye;
  rect(g, 2, 6, 12, 5, body);
  rect(g, 2, 9, 12, 2, belly);                                 /* 腹部 */
  rect(g, 2, 6, 12, 1, shade(body, 1.12));
  /* 背鳍 */
  rect(g, 6, 4, 4, 2, shade(body, .85));
  /* 尾鳍 */
  rect(g, 14, 5, 2, 7, shade(body, .88));
  /* 胸鳍 */
  rect(g, 5, 10, 3, 2, shade(body, .8));
  /* 头 */
  rect(g, 1, 5, 4, 6, body);
  rect(g, 1, 5, 3, 1, shade(body, 1.12));
  eyes(g, 7, [3], eye, 2);
  if (m.deco === 'tentacle') { rect(g, 3, 11, 1, 5, shade(body, .8)); rect(g, 6, 11, 1, 5, shade(body, .8)); rect(g, 9, 11, 1, 5, shade(body, .8)); rect(g, 12, 11, 1, 5, shade(body, .8)); }
  if (m.deco === 'shell') { rect(g, 4, 4, 8, 8, shade(body, .92)); rect(g, 3, 6, 1, 4, shade(body, .8)); rect(g, 12, 6, 1, 4, shade(body, .8)); }
  return g;
};

/* 飞行：展开双翼 + 小身体 */
T.flyer = function (m) {
  const g = makeGrid();
  const body = m.c1, wing = m.c2, eye = m.eye;
  /* 双翼（内侧为副色） */
  rect(g, 0, 5, 16, 3, wing);
  rect(g, 0, 4, 4, 1, shade(wing, 1.1)); rect(g, 12, 4, 4, 1, shade(wing, 1.1));
  rect(g, 0, 7, 4, 3, shade(wing, .85)); rect(g, 12, 7, 4, 3, shade(wing, .85));
  /* 身体 */
  rect(g, 5, 6, 6, 6, body);
  rect(g, 5, 6, 6, 1, shade(body, 1.15));
  /* 头 */
  rect(g, 5, 2, 6, 5, body);
  rect(g, 5, 2, 6, 1, shade(body, 1.15));
  /* 触须/角 */
  rect(g, 4, 3, 1, 2, shade(body, .8)); rect(g, 11, 3, 1, 2, shade(body, .8));
  eyes(g, 4, [6, 8], eye, 2);
  if (m.deco === 'twin') { rect(g, 3, 1, 3, 3, body); rect(g, 10, 1, 3, 3, body); eyes(g, 2, [4, 11], eye, 1); }
  if (m.deco === 'tentacles') { for (let x = 5; x < 11; x += 2) rect(g, x, 12, 1, 4, shade(body, .85)); }
  return g;
};

/* 昆虫：圆身 + 多条腿 + 大眼 */
T.bug = function (m) {
  const g = makeGrid();
  const body = m.c1, mark = m.c2, eye = m.eye;
  /* 腿（两侧各三对） */
  for (const y of [7, 10, 13]) { rect(g, 1, y, 3, 1, shade(body, .72)); rect(g, 12, y, 3, 1, shade(body, .72)); }
  /* 身体 */
  rect(g, 3, 4, 10, 11, body);
  rect(g, 3, 4, 10, 1, shade(body, 1.12));
  rect(g, 5, 7, 6, 6, mark);                                   /* 背部花纹 */
  /* 头 */
  rect(g, 5, 1, 6, 4, body);
  eyes(g, 2, [5, 9], eye, 2);
  /* 獠牙/触角 */
  rect(g, 5, 5, 1, 2, shade(body, .8)); rect(g, 10, 5, 1, 2, shade(body, .8));
  if (m.deco === 'shell2') { rect(g, 3, 12, 10, 3, shade(body, .85)); rect(g, 4, 13, 8, 1, mark); }
  if (m.deco === 'hump') { rect(g, 5, 2, 6, 3, shade(body, 1.08)); }
  return g;
};

/* 巨型：占满画面的大体型 */
T.huge = function (m) {
  const g = makeGrid();
  const body = m.c1, mark = m.c2, eye = m.eye;
  rect(g, 2, 11, 4, 5, shade(body, .72)); rect(g, 10, 11, 4, 5, shade(body, .72));
  rect(g, 0, 5, 16, 7, body);
  rect(g, 0, 5, 16, 1, shade(body, 1.15));
  rect(g, 2, 8, 12, 3, mark);                                  /* 躯干花纹 */
  /* 头 */
  rect(g, 2, 0, 12, 6, body);
  rect(g, 2, 0, 12, 1, shade(body, 1.15));
  /* 角 */
  rect(g, 1, 0, 2, 3, mark); rect(g, 13, 0, 2, 3, mark);
  eyes(g, 2, [4, 10], eye, 2);
  rect(g, 6, 5, 4, 1, shade(body, .7));
  if (m.deco === 'three_head') { rect(g, 0, 3, 3, 3, body); rect(g, 13, 3, 3, 3, body); eyes(g, 4, [1, 14], eye, 1); }
  if (m.deco === 'tusks') { rect(g, 4, 6, 1, 2, '#e8e4dc'); rect(g, 11, 6, 1, 2, '#e8e4dc'); }
  return g;
};

/* ---------- 逐角色生成 ---------- */
const DECO = {
  witch: 'witch_hat', vindicator: 'helmet', pillager: 'helmet', evoker: 'helmet', illusioner: 'helmet',
  piglin: 'ears', piglin_brute: 'ears', wandering_trader: 'helmet', iron_golem: 'helmet',
  wither_skeleton: 'wither', wither: 'three_head', ravager: 'tusks', hoglin: 'tusks',
  parrot: 'bigeye', frog: 'bigeye', axolotl: 'bigeye', bat: 'bigeye', tadpole: 'bigeye',
  tropical_fish: 'bigeye', chicken: 'bigeye',
  squid: 'tentacle', glow_squid: 'tentacle', turtle: 'shell', pufferfish: 'shell',
  shulker: 'shell2', camel: 'hump', mooshroom: 'hump',
  ghast: 'tentacles', phantom: 'twin', vex: 'twin',
  creeper: 'speck', slime: 'speck', magma_cube: 'speck', silverfish: 'speck', endermite: 'speck',
  snowman: 'speck', armadillo: 'speck'
};

const RIM_DARK = 'rgba(0,0,0,0)';   /* 描边由页面按主题决定，这里不烧进精灵 */
const sprites = {};
MOBS.forEach(m => {
  const spec = Object.assign({}, m, { deco: DECO[m.id] });
  const g = T[m.t](spec);
  sprites[m.id] = g;
});

/* ---------- 校验 ---------- */
const problems = [];
MOBS.forEach(m => {
  const g = sprites[m.id];
  if (!g) { problems.push(m.id + ' 无精灵'); return; }
  let painted = 0, minX = 16, maxX = -1, minY = 16, maxY = -1;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x]) {
    painted++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (painted < 70) problems.push(m.id + ' 着色过少 (' + painted + ')');
  if (painted > 250) problems.push(m.id + ' 着色过多 (' + painted + ')');
  /* 构图饱满度：横向或纵向必须有一边接近满幅，另一边也不能太窄 */
  const w = maxX - minX + 1, h = maxY - minY + 1;
  if (Math.max(w, h) < 13) problems.push(m.id + ' 构图过小 (' + w + '×' + h + ')');
  if (Math.min(w, h) < 6) problems.push(m.id + ' 构图过窄 (' + w + '×' + h + ')');
  if (minX > 2 || maxX < 13 || minY > 2 || maxY < 13) problems.push(m.id + ' 位置偏移 (x ' + minX + '-' + maxX + ', y ' + minY + '-' + maxY + ')');
});
/* 相似度检查：同模板内的角色不能长得一样 */
const sig = m => sprites[m.id].map(r => r.map(c => c || '.').join('')).join('|');
const dupSig = {};
MOBS.forEach(m => { const s = sig(m); (dupSig[s] = dupSig[s] || []).push(m.id); });
Object.entries(dupSig).forEach(([s, arr]) => { if (arr.length > 1) problems.push('精灵完全相同: ' + arr.join(', ')); });

console.log('生成精灵: ' + Object.keys(sprites).length + ' / ' + MOBS.length);
if (problems.length) { console.log('❌ 问题:'); problems.forEach(p => console.log('   ' + p)); }
else console.log('✅ 72 个精灵全部通过：着色量适中、构图饱满、无重复');

/* ---------- 输出拼图 PNG（12 列 × 6 行，每格放大 4 倍） ---------- */
const SCALE = 4, COLS = 12, ROWS = Math.ceil(MOBS.length / COLS), CELL = 16 * SCALE;
const W = COLS * CELL, H = ROWS * CELL;
const canvas = Buffer.alloc(W * H * 3, 0xff);   /* 白底 */
function putPx(x, y, rgb) { const i = (y * W + x) * 3; canvas[i] = rgb[0]; canvas[i + 1] = rgb[1]; canvas[i + 2] = rgb[2]; }
MOBS.forEach((m, idx) => {
  const g = sprites[m.id];
  const ox = (idx % COLS) * CELL, oy = Math.floor(idx / COLS) * CELL;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = g[y][x];
    const rgb = c ? hex(c) : [246, 249, 249];
    for (let j = 0; j < SCALE; j++) for (let i = 0; i < SCALE; i++) putPx(ox + x * SCALE + i, oy + y * SCALE + j, rgb);
  }
  /* 格子边框 */
  for (let i = 0; i < CELL; i++) { putPx(ox + i, oy, [200, 212, 212]); putPx(ox + i, oy + CELL - 1, [200, 212, 212]); putPx(ox, oy + i, [200, 212, 212]); putPx(ox + CELL - 1, oy + i, [200, 212, 212]); }
});
/* 写 PNG */
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
let CRC_T = null;
function crc32(buf) {
  if (!CRC_T) { CRC_T = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
fs.writeFileSync(path.resolve(__dirname, '_sheet.png'), png(W, H, canvas));
console.log('已输出拼图 tools/_sheet.png (' + W + '×' + H + ')');
/* 同时导出精灵数据，供注入 index.html */
fs.writeFileSync(path.resolve(__dirname, '_sprites.json'), JSON.stringify(sprites), 'utf8');
console.log('已输出 tools/_sprites.json');
