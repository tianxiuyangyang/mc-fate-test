/* 抓取小游戏进行中的画面，用于浅色主题可见性验收 —— 开发工具，可删 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const INDEX = path.resolve(__dirname, '..', 'index.html');
const PAGE = 'file:///' + INDEX.replace(/\\/g, '/').split('/').map((s, i) => i === 0 ? s : encodeURIComponent(s)).join('/');
const PORT = 9336;
const PROFILE = path.join(__dirname, '_shotprofile');
const OUT = path.resolve(__dirname, '..', 'screenshots');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
    '--hide-scrollbars', '--window-size=900,1300', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(300);
    try { wsUrl = (await (await fetch('http://127.0.0.1:' + PORT + '/json/version')).json()).webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params, sessionId) => new Promise((res) => {
    const msg = { id: ++id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, res); ws.send(JSON.stringify(msg));
  });
  const t = await send('Target.createTarget', { url: 'about:blank' });
  const att = await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true });
  const sid = att.result.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Page.navigate', { url: PAGE }, sid);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true }, sid);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
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
    if (!b) throw new Error('找不到 ' + sel);
    await clickAt(b.x, b.y);
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sid);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
    console.log('  ✓ ' + name);
  };

  for (let i = 0; i < 40; i++) { await sleep(300); if (await evalJs(`!!document.getElementById('view-intro') && !document.getElementById('view-intro').hidden`)) break; }

  /* 开局天赋：随意分配 10 点后继续 */
  await clickSel('#startBtn');
  await sleep(400);
  if (await evalJs(`!!document.querySelector('.talent')`)) {
    for (let k = 0; k < 5; k++) { await clickSel(`.t-btn[data-act="+"][data-i="${k}"]`); await sleep(60); }
    for (let k = 0; k < 5; k++) { await clickSel(`.t-btn[data-act="+"][data-i="${k}"]`); await sleep(60); }
    await clickSel('#tGo');
    await sleep(450);
  }

  /* 挖矿进行中 */
  await clickSel('#gStart');
  await sleep(2500);
  for (let i = 0; i < 6; i++) {
    const b = await evalJs(`(function(){var e=document.querySelectorAll('#mStage canvas.pc');if(!e.length)return null;var n=e[0];var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    if (b) await clickAt(b.x, b.y);
    await sleep(150);
  }
  await shot('06-mining-play.png');

  /* 躲苦力怕进行中 */
  const t0 = Date.now();
  while (Date.now() - t0 < 11000) { await sleep(400); if (await evalJs(`!!document.querySelector('#gNext')`)) break; }
  await clickSel('#gNext'); await sleep(400);
  await clickSel('.opt'); await sleep(500);
  await clickSel('.opt'); await sleep(700);
  await clickSel('#gStart'); await sleep(200);
  const ds = await evalJs(`(function(){var n=document.querySelector('#dStage');var r=n.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await clickAt(ds.x, ds.y);
  await sleep(3200);
  await shot('07-dodge-play.png');

  /* 搭建进行中 */
  const t1 = Date.now();
  while (Date.now() - t1 < 11000) { await sleep(400); if (await evalJs(`!!document.querySelector('#gNext')`)) break; }
  await clickSel('#gNext'); await sleep(400);
  for (let i = 0; i < 2; i++) { await clickSel('.opt'); await sleep(450); }
  await clickSel('#gStart'); await sleep(200);
  const bs = await evalJs(`(function(){var n=document.querySelector('#bStage');var r=n.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bs.l + bs.w * 0.2, y: bs.t + bs.h * 0.9, buttons: 0 }, sid);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bs.l + bs.w * 0.2, y: bs.t + bs.h * 0.9, button: 'left', clickCount: 1, buttons: 1 }, sid);
  for (let k = 0; k < 30; k++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1,
      x: bs.l + bs.w * (0.14 + (k % 12) * 0.06), y: bs.t + bs.h * (0.9 - Math.floor(k / 12) * 0.14) }, sid);
    await sleep(60);
  }
  await shot('08-build-play.png');

  try { proc.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
