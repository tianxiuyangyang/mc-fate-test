/* ============================================================
   端到端回归测试（开发工具，非站点的一部分）
   用法: node tools/e2e-test.js
   需要本机安装 Microsoft Edge。会真实跑完 3 个小游戏 + 5 道题。
   ============================================================ */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const EDGE = EDGE_CANDIDATES.find(p => fs.existsSync(p));
const INDEX = path.resolve(__dirname, '..', 'index.html');
const PAGE = 'file:///' + INDEX.replace(/\\/g, '/').split('/').map((s, i) => i === 0 ? s : encodeURIComponent(s)).join('/');
const PORT = 9333;
const PROFILE = path.join(__dirname, '_cdpprofile');
const SHOTS = path.resolve(__dirname, '..', 'screenshots');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (ok, label) => { console.log((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) failures++; };

(async () => {
  if (!EDGE) { console.log('跳过：未找到 Edge/Chrome，无法运行端到端测试'); process.exit(0); }
  console.log('浏览器: ' + EDGE);
  console.log('页面:   ' + PAGE + '\n');

  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--window-size=900,1400',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, 'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(300);
    try { wsUrl = (await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json()).webSocketDebuggerUrl; } catch (e) {}
  }
  if (!wsUrl) { console.log('❌ 无法连接浏览器调试端口'); proc.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' '));
  };
  const send = (method, params, sessionId) => new Promise((res) => {
    const msg = { id: ++id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res); ws.send(JSON.stringify(msg));
  });

  const t = await send('Target.createTarget', { url: 'about:blank' });
  const att = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
  const sid = att.result.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Page.enable', {}, sid);
  await send('Page.navigate', { url: PAGE }, sid);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true }, sid);
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      throw new Error('页面内报错: ' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 }, sid);
    await sleep(25);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 }, sid);
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 }, sid);
  };
  const clickSel = async (sel) => {
    await evalJs(`(function(){var n=document.querySelector('${sel}');if(n&&n.scrollIntoView)n.scrollIntoView({block:'center'});return 1;})()`);
    await sleep(220);
    const b = await evalJs(`(function(){var n=document.querySelector('${sel}');if(!n)return null;var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if (!b) throw new Error('找不到元素: ' + sel);
    await clickAt(b.x, b.y);
  };
  /* 点击舞台内的相对位置（用于挖矿/搭建等需要点场地的游戏） */
  const stageClick = async (fx, fy) => {
    const b = await evalJs(`(function(){var n=document.querySelector('.stage');if(!n)return null;var r=n.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
    if (!b) return;
    await clickAt(b.l + b.w * fx, b.t + b.h * fy);
  };
  const key = async (k, code, vk, hold) => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sid);
    await sleep(hold || 160);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sid);
  };
  const shot = async (name, h) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid);
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
  };

  try {
    fs.mkdirSync(SHOTS, { recursive: true });

    /* ---------- 1. 启动 ---------- */
    /* 先等文档与脚本就绪 */
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      await sleep(200);
      try { ready = await evalJs(`!!document.getElementById('view-intro')`); } catch (e) {}
    }
    if (!ready) throw new Error('页面未加载完成');
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { await sleep(300); ok = await evalJs(`!document.getElementById('view-intro').hidden`); }
    check(ok, '启动动画结束后自动进入开场页');
    await sleep(900);
    const spr = await evalJs(`(function(){var i=document.getElementById('introSprite');
      return !!i && !i.hidden && /^data:image\\/png/.test(i.src) && i.src.length>800 && getComputedStyle(i).opacity!=='0';})()`);
    check(spr, '开场页角色像素立绘已渲染（且淡入完成）');
    await shot('01-intro.png');

    /* ---------- 2. 三个小游戏 + 五道题 ---------- */
    await clickSel('#startBtn');
    await sleep(400);
    check(await evalJs(`!document.getElementById('view-quiz').hidden`), '点击「开始测试」进入测评页');

    /* 游戏一：挖方块 */
    await clickSel('#gStart');
    await sleep(250);
    check(await evalJs(`!!document.querySelector('#mStage')`), '挖方块游戏启动');
    const t0 = Date.now();
    while (Date.now() - t0 < 10400) {
      const b = await evalJs(`(function(){var e=document.querySelectorAll('#mStage canvas.pc');if(!e.length)return null;var n=e[Math.floor(Math.random()*e.length)];var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
      if (b) await clickAt(b.x, b.y); else await sleep(60);
      await sleep(20);
    }
    await sleep(500);
    const mScore = Number(await evalJs(`(document.querySelector('#stage .rtitle')||{}).textContent||'-1'`));
    check(mScore > 0, '挖方块有得分（' + mScore + '）');
    await clickSel('#gNext');
    await sleep(350);
    check(await evalJs(`!!document.querySelector('.opt')`), '游戏后进入第 1 题');
    await clickSel('.opt'); await sleep(450);
    check(await evalJs(`!!document.querySelector('.opt')`), '第 2 题出现');
    await clickSel('.opt'); await sleep(500);

    /* 游戏二：躲苦力怕 */
    check(await evalJs(`!!document.querySelector('#gStart')`), '进入躲避游戏说明页');
    await clickSel('#gStart');
    await sleep(300);
    const ds = await evalJs(`(function(){var n=document.querySelector('#dStage');if(!n)return null;var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if (!ds) throw new Error('躲避游戏未启动');
    await clickAt(ds.x, ds.y);
    await sleep(1300);
    const ticked = await evalJs(`(function(){var t=document.getElementById('dTime');return t?parseFloat(t.textContent):-1;})()`);
    check(ticked > 0 && ticked < 10, '躲避游戏倒计时正常推进（剩余 ' + ticked + 's）');
    const t1 = Date.now();
    let flip = 0;
    while (Date.now() - t1 < 9200) {
      flip++;
      await key(flip % 2 ? 'ArrowLeft' : 'ArrowRight', flip % 2 ? 'ArrowLeft' : 'ArrowRight', flip % 2 ? 37 : 39, 170);
    }
    await sleep(900);
    const dScore = Number(await evalJs(`(document.querySelector('#stage .rtitle')||{}).textContent||'-1'`));
    check(dScore > 0, '躲避游戏得分正常（' + dScore + '，存活满 10 秒应为 100）');
    await clickSel('#gNext'); await sleep(350);

    /* 题目 3、4 */
    for (const n of [3, 4]) {
      check(await evalJs(`!!document.querySelector('.opt')`), '第 ' + n + ' 题出现');
      await clickSel('.opt'); await sleep(450);
    }

    /* 游戏三：极速搭建 */
    check(await evalJs(`!!document.querySelector('#gStart')`), '进入搭建游戏说明页');
    await clickSel('#gStart');
    await sleep(250);
    const bs = await evalJs(`(function(){var n=document.querySelector('#bStage');if(!n)return null;var r=n.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
    if (!bs) throw new Error('搭建游戏未启动');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bs.l + bs.w * 0.2, y: bs.t + bs.h * 0.9, buttons: 0 }, sid);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bs.l + bs.w * 0.2, y: bs.t + bs.h * 0.9, button: 'left', clickCount: 1, buttons: 1 }, sid);
    const t2 = Date.now(); let k2 = 0;
    while (Date.now() - t2 < 3400) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1,
        x: bs.l + bs.w * (0.12 + (k2 % 13) * 0.06),
        y: bs.t + bs.h * (0.92 - Math.floor(k2 / 13) * 0.13)
      }, sid);
      k2++; await sleep(45);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bs.l + bs.w * 0.5, y: bs.t + bs.h * 0.5, button: 'left', clickCount: 1, buttons: 0 }, sid);
    await sleep(1000);
    const bScore = Number(await evalJs(`(document.querySelector('#stage .rtitle')||{}).textContent||'-1'`));
    check(bScore > 0, '搭建游戏放置了方块（' + bScore + ' 个）');
    await clickSel('#gNext'); await sleep(350);

    /* 第 5~7 题 → 结果 */
    for (const n of [5, 6, 7]) {
      check(await evalJs(`!!document.querySelector('.opt')`), '第 ' + n + ' 题出现');
      await clickSel('.opt');
      await sleep(600);
    }
    await sleep(2600);

    const res = await evalJs(`(function(){
      var n=document.querySelector('.rname'); if(!n) return null;
      var bars=document.querySelectorAll('.tbar i'), w=[];
      for(var i=0;i<bars.length;i++) w.push(bars[i].style.width);
      var tv=[], e=document.querySelectorAll('.tval');
      for(var j=0;j<e.length;j++) tv.push(Number(e[j].textContent));
      var hero=document.getElementById('heroImg');
      return {name:n.textContent, title:(document.querySelector('.rtitle')||{}).textContent,
        danger:Number((document.querySelector('.dnum')||{}).textContent),
        partner:(document.querySelector('.partner .pn')||{}).textContent,
        heroOk:!!hero && hero.src.length>800, bars:w, tvals:tv,
        desc:(document.querySelector('.rdesc')||{}).textContent||'',
        scores:(document.querySelector('#view-result .small.center')||{}).textContent||''};
    })()`);
    if (!res) { console.log('    调试: ' + JSON.stringify(await evalJs('window.__dbgRes||null'))); throw new Error('未生成结果页'); }
    check(!!res.name, '结果页生成：' + res.name + ' ' + res.title);
    check(res.heroOk, '超大像素立绘已渲染');
    check(res.desc.length > 40, '专属人物解读非空');
    check(res.tvals.length === 5 && res.tvals.every(v => v >= 0 && v <= 100), '性格五维数值合法：' + res.tvals.join('/'));
    check(res.bars.length === 5 && res.bars.every(b => /%$/.test(b)), '五维进度条已渲染');
    check(res.danger > 0 && res.danger <= 100, '危险等级：' + res.danger);
    check(!!res.partner, 'MCCP 搭档：' + res.partner);
    check(/挖矿 \d+/.test(res.scores), '小游戏成绩回显：' + res.scores);
    await shot('02-result.png');
    /* 手机视口（放在复制/重测之前，避免截图里残留 toast） */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);
    await sleep(500);
    const mobRes = await evalJs(`(function(){
      var card=document.getElementById('card').getBoundingClientRect();
      return {ok: card.width<=390 && card.width>300, overflowX: document.documentElement.scrollWidth<=window.innerWidth+1};
    })()`);
    check(mobRes.ok && mobRes.overflowX, '手机 390px 下结果页无横向溢出');
    await shot('05-mobile-result.png');
    await send('Emulation.clearDeviceMetricsOverride', {}, sid);
    await sleep(300);

    /* ---------- 3. 海报 / 复制 / 重测 ---------- */
    await clickSel('#rPoster');
    await sleep(1500);
    const poster = await evalJs(`window.__lastPoster||null`);
    check(!!poster && poster.bytes > 20000, '海报 PNG 生成成功（' + (poster ? poster.w + '×' + poster.h + '，' + Math.round(poster.bytes / 1024) + ' KB' : '失败') + '）');
    check(/>|保存|✅/.test(await evalJs(`document.getElementById('toast').textContent`)), '海报保存有用户反馈');

    await clickSel('#rCopy');
    await sleep(500);
    check(/>|复制|✅/.test(await evalJs(`document.getElementById('toast').textContent`)), '复制结果有用户反馈');
    await clickSel('#rAgain');
    await sleep(600);
    check(await evalJs(`!document.getElementById('view-intro').hidden`), '「重新测试」回到开场页');

    /* ---------- 3. 粒子特效 & 精灵覆盖 ---------- */
    const fx = await evalJs(`(function(){
      var cv=document.getElementById('fx');
      if(!cv) return {ok:false};
      // 采样画布是否有非透明像素（粒子正在飞）
      var c=cv.getContext('2d');
      var d=c.getImageData(0,0,Math.min(cv.width,400),Math.min(cv.height,400)).data;
      var n=0; for(var i=3;i<d.length;i+=4) if(d[i]>0) n++;
      return {ok:true, pix:n, w:cv.width, h:cv.height};
    })()`);
    check(fx.ok, '答题粒子特效画布 #fx 已创建');
    /* 重开一轮，快速跑到第一题，答完立刻采样粒子 */
    await clickSel('#rAgain'); await sleep(700);
    await clickSel('#startBtn'); await sleep(500);
    const onGame1 = await evalJs(`!!document.querySelector('#gStart')`);
    if (onGame1) {                       /* 第一个环节是挖矿，直接开始并跳过 */
      await clickSel('#gStart'); await sleep(300);
      const t9 = Date.now();
      while (Date.now() - t9 < 11200) { if (await evalJs(`!!document.querySelector('#gNext')`)) break; await sleep(400); }
      await clickSel('#gNext'); await sleep(450);
    }
    check(await evalJs(`!!document.querySelector('.opt')`), '重开后进入第 1 题');
    await clickSel('.opt'); await sleep(120);
    const fxLive = await evalJs(`(function(){
      var cv=document.getElementById('fx'); if(!cv) return -1;
      var c=cv.getContext('2d');
      var d=c.getImageData(0,0,Math.min(cv.width,600),Math.min(cv.height,600)).data;
      var n=0; for(var i=3;i<d.length;i+=4) if(d[i]>0) n++;
      return n;
    })()`);
    check(fxLive > 0, '答完一题后右下角有粒子在飞（采样到 ' + fxLive + ' 个像素）');

    /* 精灵覆盖：72 个角色都要能画出立绘（通过站内自检接口） */
    const spriteAudit = await evalJs(`(function(){
      var A=window.__MYCRAFT__;
      if(!A) return {noApi:true};
      var bad=[],empty=[],order=A.order;
      for(var i=0;i<order.length;i++){
        var id=order[i];
        try{
          var url=A.spriteImg(id,6);
          if(!url||url.length<400) empty.push(id);
        }catch(e){ bad.push(id+':'+e.message); }
      }
      var cp=A.copy;
      return {total:order.length, empty:empty, err:bad,
        copy:Object.keys(cp).length,
        copyBad:order.filter(function(id){return !cp[id]||!cp[id].title||!cp[id].desc||cp[id].desc.length!==3;}),
        qLen:A.questions.length,
        qOpts:A.questions.map(function(q){return q.opts.length;}),
        dims:A.dims};
    })()`);
    check(!spriteAudit.noApi, '站内自检接口可用');
    check(spriteAudit.total === 72, '角色库共 72 个（' + spriteAudit.total + '）');
    check(spriteAudit.empty.length === 0 && spriteAudit.err.length === 0,
      '72 个角色精灵全部可绘制' + (spriteAudit.empty.length ? '（异常: ' + spriteAudit.empty.slice(0, 5).join(',') + '）' : ''));
    check(spriteAudit.copy === 72 && spriteAudit.copyBad.length === 0,
      '72 份专属文案全部就位' + (spriteAudit.copyBad.length ? '（缺: ' + spriteAudit.copyBad.slice(0, 5).join(',') + '）' : ''));
    check(spriteAudit.qLen === 7 && spriteAudit.qOpts.every(n => n === 4),
      '共 7 道题、每题 4 个选项（' + spriteAudit.qOpts.join('/') + '）');
    check(spriteAudit.dims.length === 5, '判定维度为 5 项：' + spriteAudit.dims.join('/'));

    /* ---------- 4. 手机视口 ---------- */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sid);
    await sleep(500);
    const mob = await evalJs(`(function(){
      var c=document.getElementById('card').getBoundingClientRect();
      var h1=document.querySelector('.h1').getBoundingClientRect();
      return {cardOk:c.width<=390&&c.width>300, h1Ok:h1.width<c.width,
        overflowX: document.documentElement.scrollWidth<=window.innerWidth+1,
        sw:document.documentElement.scrollWidth, iw:window.innerWidth};
    })()`);
    check(mob.cardOk && mob.overflowX, '手机 390px 视口无横向溢出（scrollWidth=' + mob.sw + '）');
    await shot('03-mobile-intro.png');
    await clickSel('#startBtn');
    await sleep(500);
    const mobStage = await evalJs(`(function(){var n=document.querySelector('.stage')||document.querySelector('#stage');var r=n.getBoundingClientRect();
      return {w:Math.round(r.width), fits: r.right<=window.innerWidth+1 && r.left>=-1};})()`);
    check(mobStage.fits, '手机端游戏舞台自适应（宽 ' + mobStage.w + 'px）');
    await shot('04-mobile-quiz.png');
    await send('Emulation.clearDeviceMetricsOverride', {}, sid);

    /* ---------- 5. 演示直达 ---------- */
    await send('Page.navigate', { url: PAGE + '#demo' }, sid);
    await sleep(2500);
    const demo = await evalJs(`(function(){var n=document.querySelector('.rname');return n?n.textContent:null;})()`);
    check(!!demo, '#demo 直达结果页可用（' + demo + '）');

  } catch (e) {
    console.log('\n❌ 中断: ' + e.message);
    try { console.log('  computeResult 探针: ' + JSON.stringify(await evalJs('window.__dbgC||null'))); } catch (e3) {}
    errors.push('FLOW: ' + e.message);
  }

  console.log('\n== 运行时错误 ==');
  if (!errors.length) console.log('  （无）');
  else errors.slice(0, 15).forEach(e => { console.log('  ✗ ' + String(e).split('\n').slice(0, 6).join('\n     ')); failures++; });

  console.log('\n' + (failures === 0 ? '✅ 全部通过' : '❌ ' + failures + ' 项未通过'));
  try { proc.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(failures ? 1 : 0);
})();
