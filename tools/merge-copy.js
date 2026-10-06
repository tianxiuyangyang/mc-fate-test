/* 合并 4 批文案 → CHAR_COPY，并接入小游戏 5 维计分 —— 开发工具 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const FILE = path.resolve(DIR, '..', 'index.html');
const MOBS = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'mobs5d.json'), 'utf8'));

/* ══ 1. 合并文案 ══ */
const COPY = {};
const problems = [];
for (const n of [1, 2, 3, 4]) {
  const f = path.join(DIR, 'data', `_copy_out_${n}.json`);
  if (!fs.existsSync(f)) { problems.push('缺文件 _copy_out_' + n + '.json'); continue; }
  let obj;
  try { obj = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { problems.push('_copy_out_' + n + '.json 解析失败: ' + e.message); continue; }
  Object.keys(obj).forEach(k => {
    if (COPY[k]) problems.push('重复 key: ' + k);
    COPY[k] = obj[k];
  });
  console.log('批 ' + n + ': ' + Object.keys(obj).length + ' 个角色');
}
const ids = MOBS.map(m => m.id);
const missing = ids.filter(id => !COPY[id]);
const extra = Object.keys(COPY).filter(id => ids.indexOf(id) < 0);
if (missing.length) problems.push('缺文案: ' + missing.join(', '));
if (extra.length) problems.push('多余 key: ' + extra.join(', '));

/* 逐条校验文案结构 */
const titles = {};
ids.forEach(id => {
  const c = COPY[id];
  if (!c) return;
  if (!c.title || typeof c.title !== 'string') problems.push(id + ' 缺 title');
  if (!c.quote || typeof c.quote !== 'string') problems.push(id + ' 缺 quote');
  if (!Array.isArray(c.desc) || c.desc.length !== 3) problems.push(id + ' desc 不是 3 段');
  if (!c.dangerNote) problems.push(id + ' 缺 dangerNote');
  if (c.title) {
    if (titles[c.title]) problems.push('称号重复: ' + c.title + ' (' + titles[c.title] + ' / ' + id + ')');
    titles[c.title] = id;
    if (!/^.{4}・.{4}$/.test(c.title)) problems.push(id + ' 称号格式异常: ' + c.title);
  }
  (c.desc || []).forEach((p, i) => {
    if (typeof p !== 'string' || p.length < 30) problems.push(id + ' desc[' + i + '] 过短 (' + (p || '').length + ')');
  });
});

/* ══ 2. 组装 CHAR_COPY 代码块 ══ */
function q(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
const copyLines = ids.map(id => {
  const c = COPY[id];
  if (!c) return `  ${id}:{}`;
  const desc = (c.desc || []).map(q).join(',\n      ');
  return `  ${id}:{title:${q(c.title)},\n    quote:${q(c.quote)},\n    desc:[\n      ${desc}],\n    dangerNote:${q(c.dangerNote)}}`;
});
const COPY_BLOCK = `/* 72 位角色的专属文案：称号 / 台词 / 三段人物解读 / 危险等级说明 */
var CHAR_COPY={
${copyLines.join(',\n')}
};`;

if (problems.length) {
  console.log('\n❌ 文案问题:');
  problems.slice(0, 30).forEach(p => console.log('   ' + p));
  process.exit(1);
}
console.log('✅ 72 份文案全部通过：' + Object.keys(titles).length + ' 个称号唯一、结构完整\n');

/* ══ 3. 注入 CHAR_COPY（放在 HMOBS 之后） ══ */
let src = fs.readFileSync(FILE, 'utf8');
if (src.indexOf('var CHAR_COPY=') >= 0) {
  const s0 = src.indexOf('/* 72 位角色的专属文案');
  const e0 = src.indexOf('/* ---------- 像素精灵：9 类模板 ---------- */');
  src = src.slice(0, s0) + COPY_BLOCK + '\n\n' + src.slice(e0);
  console.log('· 已替换原有 CHAR_COPY');
} else {
  const anchor = 'var MOB_BY_ID={};';
  const at = src.indexOf(anchor);
  if (at < 0) { console.log('❌ 找不到注入锚点'); process.exit(1); }
  src = src.slice(0, at) + COPY_BLOCK + '\n\n' + src.slice(at);
  console.log('· 已注入 CHAR_COPY');
}

/* ══ 4. 小游戏结算接入 5 维 ══ */
function replaceRange(text, startMark, endMark, repl, label) {
  const s = text.indexOf(startMark);
  if (s < 0) { console.log('⚠ 找不到起点: ' + label); return text; }
  const e = text.indexOf(endMark, s + 1);
  if (e < 0) { console.log('⚠ 找不到终点: ' + label); return text; }
  console.log('· ' + label + '  ' + s + ' → ' + e);
  return text.slice(0, s) + repl + text.slice(e);
}

/* 挖矿 */
const MINE_END = `    var total=hits+miss;
    var eff=hits>0?score/hits:0;
    var acc2=total>0?hits/total:0.55;
    S.mining={score:score,hits:hits,miss:miss,ore:ore,spawnMiss:spawnMiss,eff:eff,acc:acc2};
    var g=gameScoreMinning({hits:hits,miss:miss,ore:ore,acc:acc2});
    S.mining.gain=g;
    Sfx.win();`;
src = replaceRange(src,
  '    var total=hits+miss;',
  '    var comment;\n    if(score>=26)',
  MINE_END + '\n    var comment;\n    if(score>=26)', '挖矿结算');

/* 躲避 */
const DODGE_END = `    var surviveMs=startAt?(nowMs()-startAt):0;
    var survive=clamp(surviveMs/1000,0,10);
    S.dodge={survive:survive,hp:p.hp,travel:travel,near:near};
    var g2=gameScoreDodge({survive:survive,travel:travel,near:near,hp:p.hp});
    S.dodge.gain=g2;
    Sfx.win();`;
src = replaceRange(src,
  '    var surviveMs=startAt?(nowMs()-startAt):0;',
  '    var comment;\n    if(p.hp===3',
  DODGE_END + '\n    var comment;\n    if(p.hp===3', '躲避结算');

fs.writeFileSync(FILE, src, 'utf8');
console.log('\n✓ CHAR_COPY 与小游戏计分已接入');
