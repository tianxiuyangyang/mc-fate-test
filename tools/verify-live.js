/* 线上站点最终检查：核对部署内容是否为新版（72 角色 / 7 题 / 5 维 / 粒子特效） —— 开发工具 */
const URL = 'https://tianxiuyangyang.github.io/mc-fate-test/';

(async () => {
  const res = await fetch(URL);
  const html = await res.text();
  console.log('URL: ' + URL);
  console.log('HTTP ' + res.status + '   ' + (html.length / 1024).toFixed(1) + ' KB\n');
  const count = (re) => (html.match(re) || []).length;
  const checks = [
    ['72 位角色数据（含末影龙 / 监守者 / 嗅探兽）', /末影龙/.test(html) && /监守者/.test(html) && /嗅探兽/.test(html)],
    ['9 类精灵模板渲染器', /SPRT\.humanoid/.test(html) && /SPRT\.huge/.test(html) && /SPRT\.fish/.test(html)],
    ['共 7 道性格题', count(/\{q:'/g) === 7],
    ['每题 4 个选项（28 个选项）', count(/\{t:'/g) === 28],
    ['性格五维定义 action/extra/aggro/care/build', /DIMS=\['action','extra','aggro','care','build'\]/.test(html)],
    ['72 份专属文案（dangerNote ×72）', count(/dangerNote:'/g) === 72],
    ['称号唯一：72 条 title（含 ・ 分隔）', count(/title:'.{4}・.{4}'/g) === 72],
    ['小游戏新维度映射 gameScoreMinning/Dodge/Build', /gameScoreMinning/.test(html) && /gameScoreDodge/.test(html) && /gameScoreBuild/.test(html)],
    ['搭建围合检测 encloseRatio', /encloseRatio/.test(html)],
    ['答题粒子特效画布', /FX=\(function\(\)/.test(html) && /#fx\{/.test(html)],
    ['海报性格五维排版', /性格五维/.test(html)],
    ['浅色主题变量', /--bg:#eef4f3/.test(html)],
    ['旧 6 维体系已移除', !/'activity','patience','risk'/.test(html)],
    ['旧 12 角色表已移除', !/var CHARS=\{/.test(html)]
  ];
  let fail = 0;
  checks.forEach(([name, ok]) => { if (!ok) fail++; console.log('  ' + (ok ? '✓' : '✗') + ' ' + name); });
  console.log('\n' + (fail === 0 ? '✅ 线上版本全部检查通过（' + checks.length + ' 项）' : '⚠ ' + fail + ' 项未通过'));
  process.exit(fail ? 1 : 0);
})();
