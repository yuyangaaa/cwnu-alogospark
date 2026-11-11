import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('algorithm curriculum keeps every progress-compatible lesson id', () => {
  const lessonIds = [...html.matchAll(/<section class="algorithm-lesson(?: [^"]*)?" id="(algo-[^"]+)"/g)]
    .map(match => match[1]);

  for (const id of [
    'algo-format', 'algo-time', 'algo-space', 'algo-simulation', 'algo-greedy',
    'algo-binary', 'algo-prefix', 'algo-difference', 'algo-probability', 'algo-linear-dp', 'algo-knapsack',
    'algo-tree-dp', 'algo-reroot-dp', 'algo-interval-dp'
  ]) assert.ok(lessonIds.includes(id), `missing algorithm lesson id: ${id}`);
});

test('foundation lessons connect constraints to implementation decisions', () => {
  for (const text of [
    '把数据范围翻译成设计约束',
    '样例是证据，不是完整规格',
    '四条推导规则',
    'O(n) + O(m) = O(n + m)',
    '递归调用栈',
    '复杂模拟先做“统一表示”',
    '归纳 / 始终领先'
  ]) assert.ok(html.includes(text), `missing foundation explanation: ${text}`);
});

test('binary search covers exact lookup, boundaries, and binary search on answer', () => {
  assert.match(html, /firstTrue/);
  assert.match(html, /lower_bound/);
  assert.match(html, /upper_bound/);
  assert.match(html, /第一个 <strong>大于等于 x<\/strong>/);
  assert.match(html, /二分答案：把最优化变成判定/);
  assert.match(html, /搜索区间包含答案/);
});

test('prefix sum and DP lessons explain broader models and implementation choices', () => {
  assert.match(html, /前缀思想不只用于求和/);
  assert.match(html, /把状态和转移看成一张有向无环图/);
  assert.match(html, /记忆化搜索/);
  assert.match(html, /还原方案/);
  assert.match(html, /complete_knapsack\.cpp/);
  assert.match(html, /完全背包：同一件物品可以重复使用/);
  assert.match(html, /求方案数时交换循环还可能改变“组合 \/ 排列”的含义/);
  assert.match(html, /先算儿子，再用儿子的答案计算父亲/);
  assert.match(html, /没有上司的舞会/);
  assert.match(html, /“最多选 j 人”和“恰好选 j 人”不要混用/);
  assert.match(html, /程序向下走，答案向上长/);
  assert.match(html, /父亲未来还要询问的条件，必须保留在状态中/);
  assert.match(html, /= ans\[x\] \+ n - 2 × s\[y\]/);
  assert.match(html, /f\[x\] \+= f\[y\] \+ s\[y\]/);
  assert.match(html, /把答案拆成子树内与子树外两部分/);
  assert.match(html, /带权树换根/);
  assert.match(html, /不要从“第一步合并什么”想，要从“最后一步剩什么”想/);
  assert.match(html, /f\[l\]\[r\] = min\(f\[l\]\[k\] \+ f\[k\+1\]\[r\] \+ sum\(l,r\)\)/);
  assert.match(html, /子序列不等于子串/);
  assert.match(html, /初始化不是选择一种 memset，而是代入状态定义/);
  assert.match(html, /不要从第一行硬啃/);
  assert.match(html, /枚举最后一次合并的分界/);
  assert.match(html, /两次 DFS 各负责一件事/);
  assert.ok((html.match(/class="code-reading-map"/g) || []).length >= 6);
  assert.match(html, /\/\/ 枚举最后一次合并的分界/);
  assert.doesNotMatch(html, /class="code-section-comment"/);
  assert.match(html, /按难度完成三次练习/);
});

test('algorithm overview provides traceable authoritative further reading', () => {
  for (const url of [
    'https://oi-wiki.org/basic/complexity/',
    'https://oi-wiki.org/basic/binary/',
    'https://oi-wiki.org/basic/prefix-sum/',
    'https://oi-wiki.org/dp/basic/',
    'https://oi-wiki.org/dp/knapsack/',
    'https://oi-wiki.org/dp/tree/'
  ]) assert.ok(html.includes(`href="${url}"`), `missing source link: ${url}`);
});

test('lesson code uses editor-like C++ syntax highlighting', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');

  assert.match(app, /function highlightCppCode\(\)/);
  assert.match(app, /cppKeywords/);
  assert.match(app, /cppTypes/);
  assert.match(app, /c-function/);
  assert.match(html, /app\.js\?v=\d{8}-[a-z-]+/);
});

test('probability and expectation builds from contributions to first-step analysis', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const probabilityStart = html.indexOf('id="algo-probability"');
  const dataStructureStart = html.indexOf('id="algo-data-structure-overview"');
  const section = html.slice(probabilityStart, dataStructureStart);

  assert.ok(probabilityStart > 0 && dataStructureStart > probabilityStart);
  assert.match(html, /href="#algo-probability"[^>]*><b>09<\/b><span>概率与期望<\/span>/);
  assert.match(section, /统计“多少个”就拆贡献，问“还要多久”就看下一步/);
  assert.match(section, /期望的线性性/);
  assert.match(section, /不要求随机变量彼此独立/);
  assert.match(section, /E\[Σ Iᵢ\] = Σ P\(Iᵢ = 1\)/);
  assert.match(section, /nm\/\(n\+m\)/);
  assert.match(section, /随机排列的逆序对/);
  assert.match(section, /f\[u\] = cost\[u\] \+ Σ P\(u→v\) · f\[v\]/);
  assert.match(section, /f\[0\] = 1\+3\+…\+\(2n-1\) = n²/);
  assert.match(section, /dag_expectation\.cpp/);
  assert.match(section, /mod_inverse\.cpp/);
  assert.ok((section.match(/class="code-reading-map"/g) || []).length >= 3);
  assert.ok((section.match(/\/\/ /g) || []).length >= 6);
  assert.match(app, /'algo-probability'/);
  assert.match(server, /'algo-probability'/);
});
