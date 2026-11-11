import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('ranking poetry matches the home dot carousel and contains twelve verses', () => {
  const block = app.slice(app.indexOf('const rankingPoems ='), app.indexOf('const rankingPoetry ='));
  assert.equal((block.match(/\{ text:/g) || []).length, 12);
  assert.match(block, /今日长缨在手/);
  assert.match(app, /timer = setInterval\(\(\) => showRankingPoem\(index \+ 1\), 4500\)/);
  assert.match(app, /showRankingPoem\(0\);\s*startRankingPoems\(\);/);
  assert.match(app, /mouseenter[^\n]+clearInterval\(timer\)/);
  assert.match(app, /mouseleave', startRankingPoems/);
  assert.doesNotMatch(app, /IntersectionObserver\(entries => \{ visible/);
  assert.match(html, /id="ranking-poetry-dots"/);
  assert.match(html, /id="ranking-poetry-total">12/);
  assert.doesNotMatch(html, /ranking-poetry-(?:prev|next|pause)/);
});

test('ranking uses the requested wide and low proportions', () => {
  assert.match(css, /leaderboard-shell\{width:min\(1320px,100%\)\}/);
  assert.match(css, /leaderboard-hero\.ranking-landscape\{min-height:390px/);
  assert.match(css, /ranking-poetry-dots\.quote-dots button\.active/);
});
