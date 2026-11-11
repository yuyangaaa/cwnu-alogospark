import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('C++ curriculum keeps all existing progress-compatible lesson ids', () => {
  const lessonIds = [...html.matchAll(/<section class="lesson" id="cpp-[^"]+" data-lesson="([^"]+)">/g)]
    .map(match => match[1]);

  assert.deepEqual(lessonIds, [
    'environment', 'framework', 'output', 'input', 'variable', 'operator', 'condition',
    'for', 'while', 'array', 'string', 'struct', 'function', 'stl'
  ]);
});

test('framework and variables teach comments, naming, and modern constants', () => {
  assert.match(html, /用注释解释“为什么”/);
  assert.match(html, /单行注释从 <code>\/\/<\/code> 开始/);
  assert.match(html, /变量怎样命名？/);
  assert.match(html, /不会改变的数据：const 与 constexpr/);
  assert.match(html, /常量优先于宏/);
});

test('operator lesson includes ternary and safe bit-operation foundations', () => {
  assert.match(html, /三目运算符：在两个值中选择/);
  assert.match(html, /位运算：直接处理二进制位/);
  assert.match(html, /位运算不是逻辑运算/);
  assert.match(html, /mask &amp; \(<span class="c-purple">1<\/span> &lt;&lt; k\)/);
});

test('string lesson covers complete contest text-processing toolkit', () => {
  for (const text of [
    'getline(cin &gt;&gt; ws, name)',
    's.find(t)',
    's.substr(pos, len)',
    's.insert(pos, t)',
    's.erase(pos, len)',
    's.replace(pos, len, t)',
    'string::npos',
    'isdigit(value)',
    'toupper(value)',
    'stoi(text)',
    'to_string(score)'
  ]) assert.ok(html.includes(text), `missing string lesson content: ${text}`);

  assert.match(html, /实现一个迷你文字处理器/);
});

test('struct and STL lessons cover practical contest operations', () => {
  assert.match(html, /初始化与结构体嵌套/);
  assert.match(html, /<span class="c-blue">Student<\/span> members\[<span class="c-purple">2<\/span>\]/);
  assert.match(html, /把结构体传给函数/);
  assert.match(html, /按结构体成员排序/);
  assert.match(html, /比较函数不要使用 <code>&gt;=<\/code> 或 <code>&lt;=<\/code>/);
  assert.match(html, /a\.pop_back\(\)/);
  assert.match(html, /a\.insert\(a\.begin\(\) \+ p, x\)/);
  assert.match(html, /a\.erase\(a\.begin\(\) \+ p\)/);
  assert.match(html, /greater&lt;<span class="c-blue">int<\/span>&gt;\(\)/);
  assert.match(html, /sort\(b, b \+ n\)/);
});
