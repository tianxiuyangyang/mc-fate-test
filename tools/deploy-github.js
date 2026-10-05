/* GitHub 部署脚本：建仓 → 初始化 → 推送 → 开启 Pages
   令牌通过环境变量 GH_TOKEN 传入，只在内存中用于推送地址，不落盘。
   用法: node tools/deploy-github.js   （需先在项目根目录） */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OWNER = 'tianxiuyangyang';
const REPO = 'mc-fate-test';
const BRANCH = 'main';
const ROOT = path.resolve(__dirname, '..');
const TOKEN = process.env.GH_TOKEN;
const GIT = process.env.GIT_EXE || 'git';

if (!TOKEN) { console.log('缺少 GH_TOKEN'); process.exit(1); }

const API = 'https://api.github.com';
const H = {
  Authorization: 'Bearer ' + TOKEN,
  'User-Agent': 'dsh-deploy',
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json'
};

function git(args, opts) {
  const o = Object.assign({ cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, opts || {});
  return execFileSync(GIT, args, o);
}
function say(s) { console.log(s); }

(async () => {
  /* ---------- 1. 创建仓库 ---------- */
  const chk = await fetch(`${API}/repos/${OWNER}/${REPO}`, { headers: H });
  if (chk.status === 200) {
    say('· 仓库已存在，跳过创建');
  } else if (chk.status === 404) {
    const res = await fetch(`${API}/user/repos`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        name: REPO,
        description: '你的本命 MC 角色测试 —— 3 个小游戏 + 5 道性格题，测出你的本命 MC 角色与专属称号',
        homepage: `https://${OWNER}.github.io/${REPO}/`,
        private: false, has_issues: true, has_wiki: false, has_projects: false, auto_init: false
      })
    });
    const body = await res.json();
    if (res.status !== 201) { say('✗ 建仓失败 HTTP ' + res.status + ' ' + JSON.stringify(body).slice(0, 300)); process.exit(1); }
    say('✓ 仓库已创建: ' + body.full_name);
  } else {
    say('✗ 无法确认仓库状态 HTTP ' + chk.status); process.exit(1);
  }

  /* ---------- 2. 本地仓库初始化 ---------- */
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    git(['init', '-b', BRANCH]);
    say('✓ git init (' + BRANCH + ')');
  } else {
    say('· 本地仓库已存在');
  }
  git(['config', 'user.name', OWNER]);
  git(['config', 'user.email', '2467548120@qq.com']);
  /* 避免被系统级凭据助手接管（该助手在本机不可用） */
  git(['config', 'credential.helper', '']);

  /* ---------- 3. 提交 ---------- */
  const GITIGNORE = [
    '# 构建/测试临时文件',
    'tools/_cdpprofile/', 'tools/_shotprofile/', 'tools/_probeprofile/',
    'tools/_posterprofile/', 'tools/_syntax.js', 'tools/_*.js',
    '', 'Thumbs.db', 'desktop.ini', '.DS_Store', ''
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, '.gitignore'), GITIGNORE, 'utf8');
  fs.writeFileSync(path.join(ROOT, '.nojekyll'), '', 'utf8');

  git(['add', '-A']);
  const status = git(['status', '--porcelain']);
  if (status.trim()) {
    git(['commit', '-m', '你的本命 MC 角色测试：3 个小游戏 + 5 道性格题（浅色像素风）']);
    say('✓ 已提交');
  } else {
    say('· 无新变更，跳过提交');
  }
  git(['branch', '-M', BRANCH]);

  /* ---------- 4. 推送（令牌仅在内存的 URL 中） ---------- */
  const authUrl = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${REPO}.git`;
  try { git(['remote', 'remove', 'origin'], { stdio: 'ignore' }); } catch (e) { /* 首次没有 origin */ }
  try { git(['remote', 'add', 'origin', `https://github.com/${OWNER}/${REPO}.git`], { stdio: 'ignore' }); }
  catch (e) { git(['remote', 'set-url', 'origin', `https://github.com/${OWNER}/${REPO}.git`], { stdio: 'ignore' }); }
  try {
    git(['push', '-u', authUrl, `${BRANCH}:${BRANCH}`, '--force'], { stdio: ['ignore', 'pipe', 'pipe'] });
    say('✓ 推送成功');
  } catch (e) {
    const err = (e.stderr || '') + (e.stdout || '');
    say('✗ 推送失败: ' + String(err).replace(TOKEN, '***').slice(0, 500));
    process.exit(1);
  }

  /* ---------- 5. 开启 GitHub Pages ---------- */
  const pages = await fetch(`${API}/repos/${OWNER}/${REPO}/pages`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ source: { branch: BRANCH, path: '/' } })
  });
  if (pages.status === 201) say('✓ GitHub Pages 已开启（分支 ' + BRANCH + ' / 根目录）');
  else if (pages.status === 409) say('· Pages 已开启，跳过');
  else say('· Pages 状态 HTTP ' + pages.status + ' ' + (await pages.text()).slice(0, 200));

  say('');
  say('仓库地址: https://github.com/' + OWNER + '/' + REPO);
  say('访问地址: https://' + OWNER + '.github.io/' + REPO + '/');
})().catch(e => { say('错误: ' + String(e.message).replace(TOKEN, '***')); process.exit(1); });
