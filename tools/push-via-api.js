/* 通过 GitHub REST API（api.github.com）推送本地提交到远程，绕开被网络阻断的 github.com
   流程：本地 HEAD 与远程 HEAD 逐文件对比 → 创建 blob → 建 tree → 建 commit → 移动 ref
   用法：GH_TOKEN=xxx node tools/push-via-api.js [--test]
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER = process.env.GH_OWNER || 'tianxiuyangyang';
const REPO = process.env.GH_REPO || 'mc-fate-test';
const BRANCH = process.env.GH_BRANCH || 'main';
const TOKEN = process.env.GH_TOKEN;
const ROOT = path.resolve(__dirname, '..');
const TEST = process.argv.includes('--test');

if (!TOKEN) { console.error('缺少 GH_TOKEN'); process.exit(1); }
const API = 'https://api.github.com';
const H = {
  'Authorization': 'Bearer ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'mc-fate-deploy'
};

async function api(method, url, body) {
  const res = await fetch(API + url, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, H),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = (data && (data.message || data.raw)) || res.statusText;
    const err = new Error(method + ' ' + url + ' → ' + res.status + ' ' + msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* 本地 HEAD 的完整文件清单（排除 .git 与被忽略的文件） */
function gitExe() {
  if (process.env.GIT_EXE && fs.existsSync(process.env.GIT_EXE)) return process.env.GIT_EXE;
  const cand = path.join(process.env.LOCALAPPDATA || '', 'GitHubDesktop', 'app-3.6.6', 'resources', 'app', 'git', 'cmd', 'git.exe');
  if (fs.existsSync(cand)) return cand;
  return 'git';
}
const GIT = gitExe();
function git(args) {
  return execFileSync(GIT, ['-C', ROOT].concat(args), { encoding: 'buffer', maxBuffer: 1 << 28 });
}
const tracked = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);

/* 我们只推送这些「站点内容」目录/文件，工具与数据也一并同步（保持仓库完整） */
const FILES = tracked.filter(f => !f.startsWith('.git/'));
console.log('本地待推送文件: ' + FILES.length + ' 个');

const GITIGNORE_EXTRA = null;   /* 保留仓库已有 .gitignore */

(async () => {
  const ref = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const remoteSha = ref.object.sha;
  const remoteCommit = await api('GET', `/repos/${OWNER}/${REPO}/git/commits/${remoteSha}`);
  const baseTree = remoteCommit.tree.sha;
  console.log('远程 HEAD: ' + remoteSha.slice(0, 7));

  /* 列出远程已有文件（递归），用于跳过未变化的二进制大文件 */
  const remoteTree = await api('GET', `/repos/${OWNER}/${REPO}/git/trees/${baseTree}?recursive=1`);
  const remoteMap = {};
  (remoteTree.tree || []).forEach(t => { if (t.type === 'blob') remoteMap[t.path] = t.sha; });
  console.log('远程已有文件: ' + Object.keys(remoteMap).length + ' 个');

  /* 逐个文件算 blob（内容变了才创建） */
  const tree = [];
  let created = 0, skipped = 0;
  for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const buf = fs.readFileSync(abs);
    /* 用本地 git hash-object 算 sha，和远程对比，省掉无谓上传 */
    const localSha = git(['hash-object', rel]).toString('utf8').trim();
    if (remoteMap[rel] === localSha) { skipped++; continue; }
    if (TEST) { console.log('  [test] 需上传 ' + rel + ' (' + buf.length + 'B)'); created++; continue; }
    const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64'
    });
    tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
    created++;
    if (created % 10 === 0) console.log('  已上传 ' + created + ' 个…');
  }
  console.log('需更新 ' + created + ' 个文件，未变化 ' + skipped + ' 个');

  if (TEST) { console.log('（--test 模式，未真正提交）'); return; }
  if (!created) { console.log('✅ 远程已是最新，无需提交'); return; }

  /* 删除远程有、本地没有的文件 */
  const localSet = new Set(FILES);
  Object.keys(remoteMap).forEach(p => {
    if (!localSet.has(p) && !p.startsWith('.')) {
      tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
      console.log('  删除远程多余文件 ' + p);
    }
  });

  const newTree = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { base_tree: baseTree, tree });
  const msg = process.env.COMMIT_MSG || (remoteCommit.message + '');
  const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: msg,
    tree: newTree.sha,
    parents: [remoteSha]
  });
  await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { sha: commit.sha });
  console.log('✓ 已通过 API 推送提交 ' + commit.sha.slice(0, 7));
  console.log('  提交信息: ' + msg.split('\n')[0]);
})().catch(e => {
  console.error('✗ ' + e.message);
  if (e.data) console.error('  ' + JSON.stringify(e.data).slice(0, 400));
  process.exit(1);
});
