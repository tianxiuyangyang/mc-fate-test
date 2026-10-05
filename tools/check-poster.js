/* 海报压测：用每个角色的文案各画一张海报，检查是否有内容溢出 1180px 画布 —— 开发工具，可删 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const INDEX = path.resolve(__dirname, '..', 'index.html');
const PAGE = 'file:///' + INDEX.replace(/\\/g, '/').split('/').map((s, i) => i === 0 ? s : encodeURIComponent(s)).join('/') + '#demo';
const PORT = 9335;
const PROFILE = path.join(__dirname, '_posterprofile2');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
    '--window-size=900,1600', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
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
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  for (let i = 0; i < 40; i++) { await sleep(250); if (await evalJs(`!!window.__makePosterFor`)) break; }
  const ok = await evalJs(`typeof window.__makePosterFor`);
  if (ok !== 'function') { console.log('需要在 index.html 中临时暴露 __makePosterFor 才能压测'); proc.kill(); process.exit(2); }
  const n = await evalJs(`window.__makePosterFor()`);
  console.log('压测角色数: ' + n);
  let results = null;
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    results = await evalJs(`window.__posterLogDone?window.__posterResults:null`);
    if (results) break;
  }
  if (!results) {
    const dbg = await evalJs(`({n:(window.__posterResults||[]).length,err:window.__lastError||null,hasLog:typeof window.__posterLog})`);
    console.log('❌ 未取得压测结果 ' + JSON.stringify(dbg));
    proc.kill(); process.exit(1);
  }
  let bad = 0;
  const nm0 = await evalJs(`(function(){var n=document.querySelector('.rname');return n?n.textContent:null;})()`);
  console.log('角色        内容高度 / 画布高度   状态    文件大小');
  for (const r of results) {
    const over = r.contentH > r.canvasH;
    const nm = (r.id === 'steve' && nm0) ? nm0 : r.id;
    if (over) bad++;
    console.log('  ' + String(nm).padEnd(6, '　') + String(r.contentH).padStart(6) + ' / ' + r.canvasH +
      '   ' + (over ? '⚠ 溢出 ' + (r.contentH - r.canvasH) + 'px' : '  ✓ 正常') + '   ' + Math.round(r.bytes / 1024) + 'KB');
  }
  console.log(bad === 0 ? '\n✅ 12 张海报全部无溢出' : '\n❌ ' + bad + ' 张海报超出画布高度');
  try { proc.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(bad ? 1 : 0);
})();
