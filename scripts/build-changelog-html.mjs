// 把 apps/web/release-history.json 渲染成一份可离线浏览的更新日志 HTML。
// 用法：node scripts/build-changelog-html.mjs [输出路径]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
/*
  两个数据源，顺序与 `scripts/release-manifest.mjs` 保持一致
  （`releases = [...preparedReleases, ...historicalReleases]`）：
  - release-notes.json  = 近期版本（2.8.0 之后，随每次发版写入）
  - release-history.json = 历史归档（2.0.0 ~ 2.8.0，到 historyCutoffSha 为止）
  只看 history 会漏掉后半段。
*/
const notesPath = resolve(repoRoot, 'apps/web/release-notes.json');
const historyPath = resolve(repoRoot, 'apps/web/release-history.json');
const outPath = process.argv[2] ?? resolve(repoRoot, 'artifacts/changelog.html');

const notes = JSON.parse(readFileSync(notesPath, 'utf8'));
const history = JSON.parse(readFileSync(historyPath, 'utf8'));
const releases = [...(notes.releases ?? []), ...(history.releases ?? [])];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const categoryLabel = { feat: '新功能', fix: '修复', perf: '性能', style: '样式' };

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const bumpLabel = { major: '重大', minor: '次要', patch: '补丁' };

const releaseCards = releases
  .map((release, index) => {
    const open = index < 3 ? ' open' : '';
    const themes = (release.themes ?? [])
      .map((t) => `<span class="theme">${esc(t)}</span>`)
      .join('');
    const changes = (release.changes ?? [])
      .map((c) => {
        const cat = c.category ?? 'feat';
        const breaking = c.breaking ? '<span class="breaking">Breaking</span>' : '';
        const scope = c.scope ? `<span class="scope">${esc(c.scope)}</span>` : '';
        return `<li class="change cat-${esc(cat)}">
          <span class="badge">${esc(categoryLabel[cat] ?? cat)}</span>
          ${scope}${breaking}
          <span class="summary">${esc(c.summary)}</span>
        </li>`;
      })
      .join('\n');
    const bump = release.bump ? `<span class="bump bump-${esc(release.bump)}">${esc(bumpLabel[release.bump] ?? release.bump)}</span>` : '';
    return `<details class="release"${open}>
      <summary>
        <span class="version">${esc(release.version)}</span>
        ${bump}
        <time>${fmtDate(release.releasedAt)}</time>
        <span class="count">${release.changeCount ?? (release.changes ?? []).length} 项</span>
        <span class="themes">${themes}</span>
      </summary>
      <ul class="changes">${changes}</ul>
    </details>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>更新日志 · yct-v2</title>
<style>
  :root {
    --surface: #f7f8f8;
    --panel: #ffffff;
    --border: #e2e5e8;
    --text: #1c1f22;
    --text-2: #5d646b;
    --text-3: #8b9298;
    --feat: #1f7a4d;
    --feat-bg: #e8f5ee;
    --fix: #b8541c;
    --fix-bg: #fdeee4;
    --perf: #5a48c4;
    --perf-bg: #eeebfb;
    --style: #2c6b8f;
    --style-bg: #e7f1f7;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px 20px 64px;
    background: var(--surface);
    color: var(--text);
    font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  header.page { margin-bottom: 24px; }
  h1 { margin: 0 0 6px; font-size: 24px; font-weight: 650; letter-spacing: -0.01em; }
  .meta { color: var(--text-3); font-size: 12px; }
  .meta span + span::before { content: " · "; }
  .release {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    margin-bottom: 10px;
    overflow: hidden;
  }
  .release > summary {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    cursor: pointer;
    list-style: none;
    flex-wrap: wrap;
  }
  .release > summary::-webkit-details-marker { display: none; }
  .release > summary::before {
    content: "›";
    color: var(--text-3);
    font-size: 16px;
    transition: transform 0.15s;
    display: inline-block;
  }
  .release[open] > summary::before { transform: rotate(90deg); }
  .version { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; }
  time { color: var(--text-3); font-size: 12px; font-variant-numeric: tabular-nums; }
  .count { color: var(--text-2); font-size: 12px; }
  .bump {
    font-size: 11px; padding: 1px 6px; border-radius: 999px;
    background: var(--surface); color: var(--text-2); border: 1px solid var(--border);
  }
  .bump-major { background: #fdeaea; color: #a32727; border-color: #f4cccc; }
  .bump-minor { background: var(--feat-bg); color: var(--feat); border-color: #c6e6d4; }
  .themes { margin-left: auto; display: flex; gap: 4px; flex-wrap: wrap; }
  .theme {
    font-size: 11px; padding: 1px 7px; border-radius: 999px;
    background: var(--surface); color: var(--text-3); border: 1px solid var(--border);
  }
  .changes { list-style: none; margin: 0; padding: 0 16px 14px 16px; border-top: 1px solid var(--border); }
  .change {
    display: flex; align-items: baseline; gap: 8px;
    padding: 9px 0; border-bottom: 1px dashed var(--border);
  }
  .change:last-child { border-bottom: 0; }
  .badge {
    flex: none; font-size: 11px; line-height: 18px; padding: 0 7px; border-radius: 5px;
    background: var(--surface); color: var(--text-2);
  }
  .cat-feat .badge { background: var(--feat-bg); color: var(--feat); }
  .cat-fix .badge { background: var(--fix-bg); color: var(--fix); }
  .cat-perf .badge { background: var(--perf-bg); color: var(--perf); }
  .cat-style .badge { background: var(--style-bg); color: var(--style); }
  .scope { flex: none; font-size: 12px; color: var(--text-2); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .scope::after { content: ":"; }
  .breaking {
    flex: none; font-size: 11px; padding: 0 6px; border-radius: 5px;
    background: #fdeaea; color: #a32727;
  }
  .summary { flex: 1 1 auto; }
  footer { margin-top: 28px; color: var(--text-3); font-size: 12px; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <header class="page">
    <h1>更新日志</h1>
    <div class="meta">
      <span>共 ${releases.length} 个版本</span>
      <span>当前 ${esc(releases[0]?.version ?? '—')}</span>
      <span>数据截止 ${fmtDate(releases[0]?.releasedAt ?? '')}</span>
      <span>来源 release-notes.json（近 ${(notes.releases ?? []).length} 版）+ release-history.json（归档 ${(history.releases ?? []).length} 版）</span>
    </div>
  </header>
  ${releaseCards}
  <footer>最近 3 个版本默认展开，点击任意版本标题可展开/收起。</footer>
</div>
</body>
</html>
`;

writeFileSync(outPath, html, 'utf8');
console.log(`已生成 ${outPath}（${releases.length} 个版本）`);
