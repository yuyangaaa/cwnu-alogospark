import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function createLeaderboardIdentity('), source.indexOf('async function loadLeaderboard('));
class Element {
  children = []; dataset = {}; attributes = {}; textContent = ''; className = '';
  classList = { add: value => { this.className += ` ${value}`; } };
  style = { setProperty() {} };
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this.attributes[name] = value; }
}
function setup() {
  const elements = Object.fromEntries(['leaderboard-podium', 'leaderboard-list', 'ranking-reader-count'].map(id => [id, new Element()]));
  const context = vm.createContext({
    document: { createElement: () => new Element(), getElementById: id => elements[id] },
    avatarInitial: name => name[0], applyAvatarTheme: (el, theme) => { el.dataset.avatarTheme = theme; },
    // A frame application in the ranking render path is a regression.
    applyAvatarFrame: () => { throw new Error('Ranking must show unobstructed art'); },
    currentUser: null, leaderboardScope: 'all'
  });
  vm.runInContext(renderer, context);
  return { elements, render: context.renderLeaderboard };
}
const entry = (id, rank, score) => ({ id, rank, score, nickname: `学习者${id}`, realName: '测试姓名', school: '测试学校', completedCount: 3, avatarTheme: 'royal', avatarFrame: 'gold', achievementBadge: { name: '十日·永恒王座', icon: '♚', description: '连续 10 天稳居历史总榜第一' } });
const walk = el => [el, ...el.children.flatMap(walk)];
test('ranking removes frames and overlaid medals without removing identity or scores', () => {
  const { elements, render } = setup();
  render([entry(1, 1, 30), entry(2, null, 0)]);
  assert.equal(elements['leaderboard-podium'].dataset.count, '1');
  assert.equal(elements['ranking-reader-count'].textContent, '2 位学习者 · 1 位上榜');
  assert.equal(elements['leaderboard-list'].children[0].children.length, 6);
  const nodes = [...walk(elements['leaderboard-list']), ...walk(elements['leaderboard-podium'])];
  assert.ok(!nodes.some(el => el.className.includes('medal')));
  assert.ok(nodes.some(el => el.dataset.publicProfile === '1'));
  assert.ok(nodes.some(el => el.attributes['aria-label'] === '30 积分'));
  assert.ok(nodes.some(el => el.textContent === '测试学校'));
  assert.ok(nodes.some(el => el.className === 'ranking-badge-description' && el.textContent === '连续 10 天稳居历史总榜第一'));
});
test('ranking omits the badge description when nothing is equipped', () => {
  const { elements, render } = setup();
  render([{ ...entry(1, 1, 30), achievementBadge: null }]);
  const description = elements['leaderboard-list'].children[0].children[2];
  assert.equal(description.hidden, true);
  assert.equal(description.textContent, '');
});
test('ranking handles three podium places and a subsequent empty weekly board', () => {
  const { elements, render } = setup();
  render([entry(1, 1, 30), entry(2, 2, 20), entry(3, 3, 10)]);
  assert.equal(elements['leaderboard-podium'].dataset.count, '3');
  assert.equal(elements['leaderboard-podium'].children[0].dataset.rankLabel, '02');
  render([], 'weekly');
  assert.equal(elements['leaderboard-podium'].dataset.count, '0');
  assert.equal(elements['leaderboard-podium'].children.length, 0);
  assert.match(elements['leaderboard-list'].children[0].textContent, /本周还没有/);
});
