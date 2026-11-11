import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('algorithm lesson containers remain inside their own sections', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const lessons = [...html.matchAll(/<section class="algorithm-lesson(?: [^"]*)?" id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
  assert.ok(lessons.length >= 14);
  for (const [, id, body] of lessons) {
    let depth = 0;
    for (const [tag] of body.matchAll(/<\/?div\b[^>]*>/g)) {
      depth += tag.startsWith('</') ? -1 : 1;
      assert.ok(depth >= 0, `${id}: a div closes outside the lesson`);
    }
    assert.equal(depth, 0, `${id}: a div remains open at the end of the lesson`);
  }
});

test('algorithm learning exposes data structure as a major category', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

  assert.match(html, /data-algorithm-tab="data-structure"[^>]*><span>02<\/span><b>数据结构<\/b>/);
  assert.match(html, /data-algorithm-nav="data-structure"/);
  assert.match(html, /id="algo-data-structure-overview" data-algorithm-category="data-structure"/);
  assert.match(html, /<span>02 · DATA STRUCTURE<\/span><h2>数据结构学习路线<\/h2>/);
  assert.match(app, /'data-structure': 'algo-data-structure-overview'/);
  assert.match(app, /firstAlgorithmRoadmap = document\.getElementById\('algo-data-structure-overview'\)/);
});

test('simulation and greedy lessons include worked examples, reasoning, and pitfalls', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /id="algo-simulation"/);
  assert.match(html, /UURRDDDRU/);
  assert.match(html, /能模拟，不代表逐步模拟一定来得及/);
  assert.match(html, /候选状态把“尝试移动”和“正式更新”分开/);

  assert.match(html, /id="algo-greedy"/);
  assert.match(html, /为什么“最早结束”一定正确？/);
  assert.match(html, /交换论证/);
  assert.match(html, /LLONG_MIN/);
  assert.match(html, /硬币面值为 1、3、4/);
});

test('foundation practice mixes four Luogu problems with each association OJ topic', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  for (const [topic, luoguIds] of [
    ['simulation', ['P1980', 'P1042', 'P1328', 'P1540']],
    ['greedy', ['P1208', 'P1223', 'P1090', 'P1803']],
    ['binary', ['P2249', 'P1873', 'P2440', 'P2678']],
    ['prefix-sum', ['P1614', 'P2004', 'P2367', 'P3397']]
  ]) {
    const section = html.match(new RegExp(`<section class="problem-group algorithm-problem-group"[^>]*data-algorithm-subtopic-group="${topic}"[\\s\\S]*?<div class="hydro-problem-list" data-algorithm-problem-list="foundation:${topic}"></div>`))?.[0] || '';
    assert.ok(section, `${topic} practice section should exist`);
    assert.equal((section.match(/class="problem-card"/g) || []).length, 4);
    luoguIds.forEach(id => assert.match(section, new RegExp(`data-problem="${id}"`)));
  }

  assert.match(html, /模拟、贪心、二分、前缀和与差分各配置 4 道洛谷题和 4 道协会 OJ 现有题/);
  assert.match(html, /data-algorithm-heading-count="foundation:simulation"/);
  assert.match(html, /data-algorithm-heading-count="foundation:greedy"/);
  assert.match(html, /data-algorithm-heading-count="foundation:binary"/);
});

test('linear, knapsack, tree, reroot, and interval DP lessons are detailed, independent, navigable, and tracked', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

  assert.match(html, /href="#algo-linear-dp"[^>]*><b>01<\/b><span>线性 DP<\/span>/);
  assert.match(html, /href="#algo-knapsack"[^>]*><b>02<\/b><span>背包 DP<\/span>/);
  assert.match(html, /id="algo-linear-dp" data-algorithm-category="dp"/);
  assert.match(html, /DP 五步法/);
  assert.match(html, /不相邻元素最大和/);
  assert.match(html, /空间为什么可以优化到 O\(1\)/);
  assert.match(html, /id="algo-knapsack" data-algorithm-category="dp"/);
  assert.match(html, /0\/1 背包倒序，完全背包正序/);
  assert.match(html, /“不超过容量”与“恰好装满”初始化不同/);
  assert.match(html, /n × m 的复杂度能否通过数据范围/);
  assert.match(html, /href="#algo-tree-dp"[^>]*><b>03<\/b><span>树形 DP<\/span>/);
  assert.match(html, /id="algo-tree-dp" data-algorithm-category="dp"/);
  assert.match(html, /subtree_size\.cpp/);
  assert.match(html, /party_tree_dp\.cpp/);
  assert.match(html, /tree_knapsack_merge\.cpp/);
  assert.match(html, /退化成链的树/);
  assert.match(html, /class="tree-dp-hero-card"/);
  assert.match(html, /快乐值为 <code>5 \+ 6 \+ 2 = 13<\/code>/);
  assert.match(html, /初学时先用 ndp 数组/);
  assert.match(html, /舞会模型阅读顺序/);
  assert.match(html, /无向边会通回父亲，必须跳过/);

  assert.match(html, /href="#algo-reroot-dp"[^>]*><b>04<\/b><span>换根 DP<\/span>/);
  assert.match(html, /id="algo-reroot-dp" data-algorithm-category="dp"/);
  assert.match(html, /reroot_distance_sum\.cpp/);
  assert.match(html, /换根转移：先理解，再记住/);
  assert.match(html, /ans\[y\] = ans\[x\] \+ n - 2 × s\[y\]/);
  assert.match(html, /v\[y\] = ans\[x\] - \(f\[y\] \+ s\[y\]\)/);
  assert.match(html, /为什么第二次 DFS 不需要恢复状态/);
  assert.match(html, /up.*叶子 → 根/s);
  assert.match(html, /y 子树内的节点全部近 1，其余节点全部远 1/);

  assert.match(html, /href="#algo-interval-dp"[^>]*><b>05<\/b><span>区间 DP<\/span>/);
  assert.match(html, /id="algo-interval-dp" data-algorithm-category="dp"/);
  assert.match(html, /stone_merge\.cpp/);
  assert.match(html, /bracket_subsequence\.cpp/);
  assert.match(html, /r = l \+ len - 1/);
  assert.match(html, /最后一次切成两堆/);
  assert.match(html, /端点配对或切成两段/);
  assert.match(html, /四堆石子 <code>1、2、10、4<\/code> 的完整填表/);
  assert.match(html, /0 \+ 28 \+ 17/);
  assert.match(html, /括号题只分两种来源/);

  const treeStart = html.indexOf('id="algo-tree-dp"');
  const rerootStart = html.indexOf('id="algo-reroot-dp"');
  const intervalStart = html.indexOf('id="algo-interval-dp"');
  const graphStart = html.indexOf('id="algo-graph-overview"');
  assert.ok(treeStart !== -1 && rerootStart > treeStart && intervalStart > rerootStart && graphStart > intervalStart);
  const treeSection = html.slice(treeStart, rerootStart);
  const rerootSection = html.slice(rerootStart, intervalStart);
  const intervalSection = html.slice(intervalStart, graphStart);
  assert.doesNotMatch(treeSection, /reroot_distance_sum\.cpp/);
  assert.match(treeSection, /下一节：换根 DP/);
  assert.match(rerootSection, /reroot_distance_sum\.cpp/);
  assert.doesNotMatch(rerootSection, /stone_merge\.cpp/);
  assert.match(rerootSection, /下一节：区间 DP/);
  assert.match(intervalSection, /stone_merge\.cpp/);
  assert.match(intervalSection, /bracket_subsequence\.cpp/);

  assert.match(app, /'algo-linear-dp', 'algo-knapsack', 'algo-tree-dp', 'algo-reroot-dp', 'algo-interval-dp'/);
  assert.match(server, /'algo-linear-dp', 'algo-knapsack', 'algo-tree-dp', 'algo-reroot-dp', 'algo-interval-dp'/);
});

test('probability lesson is the ninth tracked foundation chapter', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

  assert.match(html, /基础算法九章与动态规划前五章已经开放/);
  assert.match(html, /<b id="algorithm-progress-text">0 \/ 14<\/b>/);
  assert.match(html, /data-algorithm-tab="foundation"[^>]*>[\s\S]*?<small>9 节<\/small>/);
  assert.match(app, /'algo-difference',\s*'algo-probability'/);
});
