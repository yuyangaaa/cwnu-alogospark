import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import katex from 'katex';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function appendStatementMath('), source.indexOf('function hydroLanguageTemplate('));
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.className = ''; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this.innerHTML = ''; }
  classList = { add: name => { this.className += ` ${name}`; } };
  get textContent() { return this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this.children = [{ textContent: value }]; }
}
function harness(available = true) {
  const content = new Element('article');
  const context = createContext({
    hydroStatementContent: content,
    window: { katex: available ? { render(tex, element, options) { element.innerHTML = katex.renderToString(tex, options); } } : undefined },
    document: { createElement: tag => new Element(tag), createTextNode: textContent => ({ textContent }) }
  });
  runInContext(renderer, context);
  return { content, render: markdown => { context.markdown = markdown; runInContext('renderStatementMarkdown(markdown)', context); } };
}
function all(element) { return [element, ...(element.children || []).flatMap(all)]; }

test('prefix-sum statement typesets ellipses, subscripts and constraint superscripts', () => {
  const h = harness();
  h.render(String.raw`给定 $a_1, a_2, \cdots, a_n$ 和区间 $[l_i,r_i]$，满足 $1\le l_i\le r_i\le n$、$n,m\le10^5$。`);
  const math = all(h.content).filter(node => node.className === 'statement-math');
  assert.equal(math.length, 4);
  for (const node of math) {
    assert.match(node.innerHTML, /class="katex"/);
    assert.doesNotMatch(node.innerHTML, /katex-error/);
  }
  assert.match(math[0].innerHTML, /⋯/);
  assert.match(math[1].innerHTML, /<msub>/);
  assert.match(math[3].innerHTML, /<msup>/);
});

test('display delimiters preserve entire multiline fractions and cases', () => {
  const h = harness();
  h.render(String.raw`\[\frac{1}{n}\]

$$
f(x)=\begin{cases}
x^2 & x>0\\
0 & x\le0
\end{cases}
$$

## 输出格式
输出答案。`);
  const math = all(h.content).filter(node => node.className === 'statement-math-block');
  assert.equal(math.length, 2);
  assert.match(math[0].innerHTML, /<mfrac>/);
  assert.match(math[1].innerHTML, /<mtable/);
  assert.equal(h.content.children.at(-1).textContent, '输出答案。');
});

test('code stays literal and every supported inline math delimiter renders', () => {
  const h = harness();
  h.render('`$a_i$`、\\(a_i\\)、\\[a_i\\]、$$a_i$$、价格 \\$5。\n\n```cpp\ncout << "$a_i$";\n```');
  assert.equal(all(h.content).filter(node => node.className === 'statement-math').length, 3);
  const code = all(h.content).filter(node => node.tag === 'code');
  assert.equal(code[0].textContent, '$a_i$');
  assert.equal(code[1].textContent, 'cout << "$a_i$";');
});

test('malformed math, missing renderer and untrusted commands safely preserve source', () => {
  for (const available of [true, false]) {
    const h = harness(available);
    h.render(String.raw`$\frac{1}{<img src=x onerror=alert(1)>$`);
    const fallback = all(h.content).find(node => node.className.includes('statement-math-fallback'));
    assert.equal(fallback.textContent, String.raw`\frac{1}{<img src=x onerror=alert(1)>`);
    assert.equal(fallback.innerHTML, '');
  }
  const h = harness();
  h.render(String.raw`$\href{javascript:alert(1)}{click}$`);
  assert.doesNotMatch(h.content.children[0].children[0].innerHTML, /<a\b|href="javascript:/);
  h.render('$$\n未闭合的公式\n\n## 输出格式\n仍显示正文。');
  assert.equal(h.content.children.at(-1).textContent, '仍显示正文。');
});
