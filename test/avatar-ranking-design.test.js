import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('character avatars include freely available Nailong alongside the existing collection', () => {
  for (const id of ['aurora', 'ocean', 'forest', 'sunset', 'berry', 'midnight', 'weekflare', 'crownlight', 'royal', 'fox', 'nailong']) {
    assert.match(html, new RegExp(`data-avatar-choice="${id}"`));
  }
  assert.match(html, /data-avatar-choice="fox" data-required-score="0"/);
  assert.match(app, /fox: 'sun-fox'/);
  assert.match(server, /\['fox', \{ requiredScore: 0 \}\]/);
  assert.match(server, /avatar-sun-fox-v1\.webp/);
  assert.ok(readFileSync(new URL('../avatar-sun-fox-v1.webp', import.meta.url)).length > 1000);
  assert.match(html, /data-avatar-choice="nailong" data-required-score="0"/);
  assert.match(app, /nailong: 'nailong'/);
  assert.match(server, /\['nailong', \{ requiredScore: 0 \}\]/);
  assert.match(server, /avatar-nailong-v1\.webp/);
  assert.ok(readFileSync(new URL('../avatar-nailong-v1.webp', import.meta.url)).length > 1000);
  const rareArtwork = {
    weekflare: 'week-owl',
    crownlight: 'star-swordsman',
    royal: 'royal-dragon'
  };
  assert.equal(new Set(Object.values(rareArtwork)).size, 3);
  for (const [rare, artwork] of Object.entries(rareArtwork)) {
    assert.match(app, new RegExp(`${rare}: '${artwork}'`));
    assert.match(server, new RegExp(`avatar-${artwork}-v1\\.webp`));
    assert.ok(readFileSync(new URL(`../avatar-${artwork}-v1.webp`, import.meta.url)).length > 1000);
    assert.match(css, new RegExp(`data-avatar-theme="${rare}"\\]::before`));
  }
});

test('avatar collection includes illustrated bamboo and galaxy themes', () => {
  assert.match(html, /data-avatar-choice="forest"[^>]+竹影主题/);
  assert.match(html, /data-avatar-choice="midnight"[^>]+星河主题/);
  assert.match(css, /data-avatar-theme="forest"\]::before/);
  assert.match(css, /data-avatar-theme="forest"\]::after/);
  assert.match(css, /data-avatar-theme="midnight"\]::before/);
  assert.match(css, /data-avatar-theme="midnight"\]::after/);
  assert.match(app, /letter\.className = 'avatar-letter'/);
});

test('leaderboard keeps the original light page with restrained rank accents', () => {
  assert.match(html, /ALGOSPARK RANKING/);
  assert.match(html, /<h1>学习排行榜<\/h1>/);
  assert.doesNotMatch(html, /HALL OF FAME|leaderboard-total/);
  assert.match(app, /row\.dataset\.rank = String\(entry\.rank\)/);
  assert.match(css, /Cohesive light leaderboard/);
  assert.match(css, /background:linear-gradient\(145deg,#e6e2f0,#dce7f0 48%,#e3e9ef\)/);
  assert.match(css, /Admin-inspired accent/);
  assert.match(css, /leaderboard-hero\{[^}]+background:linear-gradient\(135deg,#28253c,#41356b 58%,#31536a\)/);
  assert.match(css, /leaderboard-podium-card\.rank-1/);
  assert.match(css, /leaderboard-row\[data-rank="1"\]/);
});

test('learning resources uses a compact database-backed admin publisher', () => {
  assert.match(html, /data-route="resources"[^>]*>学习资源/);
  assert.match(html, /id="resources-page"[^>]+data-page="resources"/);
  assert.match(html, /id="resources-list"/);
  assert.match(html, /id="resource-publish-button"[^>]+hidden/);
  assert.match(html, /id="resource-publish-form"/);
  assert.match(html, /name="sourceType"[^>]+value="pdf"/);
  assert.match(html, /name="pdf"[^>]+accept="application\/pdf,\.pdf"/);
  assert.match(html, /id="resource-manage-form"/);
  assert.match(html, /id="resource-withdraw-button"/);
  assert.match(css, /\.resources-compact-header/);
  assert.match(css, /\.resource-list-card/);
  assert.match(css, /\.resource-list-publisher/);
  assert.match(css, /\.resource-publish-card/);
  assert.match(css, /\.resource-source-switch/);
  assert.match(css, /\.resource-manage-button/);
  assert.match(app, /'leaderboard', 'resources', 'admin'/);
  assert.match(app, /function loadResources\(\)/);
  assert.match(app, /发布者：\$\{resource\.publisher\.nickname\} · \$\{resource\.publisher\.realName\}/);
  assert.match(app, /\/api\/admin\/resources/);
  assert.match(app, /\/api\/admin\/resources\/pdf/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /method: 'DELETE'/);
});

test('profile heatmap explicitly tracks association OJ first accepts only', () => {
  assert.match(html, /id="profile-heatmap-title">刷题热力图/);
  assert.match(html, /仅统计协会 OJ 中每道题的首次 AC/);
  assert.match(html, /id="profile-heatmap-grid"/);
  assert.match(css, /profile-heatmap-cell\[data-level="4"\]/);
  assert.match(app, /function renderOjHeatmap\(\)/);
  assert.match(app, /currentOjHeatmap = result\.ojHeatmap/);
});

test('profile collection connects ranked achievements and achievement-exclusive cosmetics', () => {
  assert.match(html, /id="profile-collection-title">荣誉与装扮/);
  assert.match(html, /data-collection-value="frost"[^>]+data-required-score="800"/);
  assert.match(html, /data-collection-value="champion"[^>]+data-required-score="6000"/);
  assert.match(css, /data-avatar-frame="nebula"/);
  assert.match(css, /data-profile-decor="bamboo"/);
  assert.match(css, /leaderboard-achievement-badge/);
  assert.match(app, /function renderProfileCollection\(\)/);
  assert.match(app, /\/api\/profile\/collection/);
  assert.match(html, /id="achievement-inbox-button"/);
  assert.match(html, /id="public-profile-modal"/);
  assert.match(css, /leaderboard-avatar-medal/);
  assert.match(app, /function openPublicProfile\(userId\)/);
  assert.match(app, /function loadNotifications\(\)/);
  assert.match(html, /data-leaderboard-scope="weekly"/);
  assert.match(html, /data-avatar-choice="royal"/);
  assert.match(html, /data-collection-value="sovereign"/);
  assert.match(html, /data-collection-value="throne"/);
  assert.match(css, /data-tone="mythic"/);
  assert.match(css, /leaderboard-scope-switch/);
  assert.match(css, /profile-welcome::before/);
  assert.match(css, /public-profile-hero\[data-profile-decor/);
  assert.match(css, /leaderboard-score-track/);
  assert.match(css, /leaderboard-period-chip/);
  assert.match(app, /dataset\.leaderboardScope = result\.scope/);
  assert.match(app, /dataset\.profileDecor = normalizeProfileDecor\(user\.profileDecor\)/);
  assert.match(html, /data-collection-value="sovereign"[^>]*>[\s\S]*?12 枚徽章/);
});
