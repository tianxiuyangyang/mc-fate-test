/* 导出海报 PNG 以肉眼验收 —— 开发工具，可删 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const INDEX = path.resolve(__dirname, '..', 'index.html');
const PAGE = 'file:///' + INDEX.replace(/\\/g, '/').split('/').map((s, i) => i === 0 ? s : encodeURIComponent(s)).join('/') + '#demo';
const PORT = 9334;
const PROFILE = path.join(__dirname, '_posterprofile');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
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
  const evalJs = async (expr, awaitPromise) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise, userGesture: true }, sid);
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  for (let i = 0; i < 40; i++) { await sleep(250); if (await evalJs(`!!document.querySelector('#rPoster')`)) break; }
  /* 直接调用海报生成，并把 canvas 内容取回 */
  await evalJs(`(function(){ window.__poster='';
    var orig=HTMLCanvasElement.prototype.toBlob, target=null;
    HTMLCanvasElement.prototype.toBlob=function(cb,type){ window.__posterCanvas=this;
      return orig.call(this, function(b){ window.__posterBlob=b; cb(b); }, type); };
    document.getElementById('rPoster').click(); return 1; })()`);
  await sleep(2000);
  const dataUrl = await evalJs(`(function(){ var c=window.__posterCanvas; return c? c.toDataURL('image/png') : null; })()`);
  const info = await evalJs(`(function(){ var c=window.__posterCanvas; return c? {w:c.width,h:c.height,blob:window.__posterBlob?window.__posterBlob.size:0} : null; })()`);
  if (!dataUrl) { console.log('❌ 无法取回海报'); proc.kill(); process.exit(1); }
  const out = path.resolve(__dirname, '..', 'screenshots', 'poster-preview.png');
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('✓ 海报已导出: ' + out + '  ' + JSON.stringify(info));
  try { proc.kill(); } catch (e) {}
  await sleep(300);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
