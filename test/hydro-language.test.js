import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function hydroLanguageTemplate('), source.indexOf('async function loadHydroStatement('));

function harness({ language = '', draft } = {}) {
  const select = {
    value: language, dataset: {}, disabled: true, options: [],
    replaceChildren() { this.options = []; this.value = ''; },
    append(option) { this.options.push(option); }
  };
  const button = { disabled: true };
  const code = { value: draft ?? '' };
  const result = { className: 'hydro-submit-result', textContent: '' };
  const drafts = new Map();
  const context = createContext({
    hydroSubmitLanguage: select, hydroSubmitButton: button, hydroSubmitCode: code, hydroSubmitResult: result,
    hydroSubmitForm: { dataset: { problemId: 'AS1001' } }, hydroCodeDrafts: drafts,
    document: { createElement() { return {}; } }, updateHydroSubmitAvailability() {}
  });
  runInContext(functions, context);
  return { select, button, code, result, drafts, run: expression => runInContext(expression, context) };
}

test('language dropdown uses the OJ domain IDs and defaults to an available C++ compiler', () => {
  const h = harness();
  h.run("renderHydroLanguages(['c', 'cc', 'cc.cc20o2', 'py', 'py.pypy3', 'java'])");
  assert.deepEqual(h.select.options.map(option => option.value), ['c', 'cc', 'cc.cc20o2', 'py', 'py.pypy3', 'java']);
  assert.equal(h.select.value, 'cc');
  assert.equal(h.select.options[2].textContent, 'C++20 (O2)');
  assert.equal(h.button.disabled, false);
  assert.equal(h.select.disabled, false);
  assert.equal(h.select.options.some(option => option.value === 'cc.cc17'), false);
});

test('per-problem restrictions are kept and a still-allowed language stays selected', () => {
  const h = harness({ language: 'c', draft: '#include <stdio.h>\nint main() { puts("hi"); }' });
  h.run("renderHydroLanguages(['c', 'cc'])");
  assert.equal(h.select.value, 'c');
  assert.equal(h.select.options.length, 2);
  assert.match(h.code.value, /puts/);
});

test('refreshing language metadata keeps edited code when a legacy compiler ID is unavailable', () => {
  const draft = '#include <iostream>\nint main() { std::cout << 42; }';
  const h = harness({ language: 'cc.cc17', draft });
  h.run("renderHydroLanguages(['cc', 'cc.cc20o2'])");
  assert.equal(h.select.value, 'cc');
  assert.equal(h.code.value, draft);
  assert.equal(h.drafts.get('AS1001:cc.cc17'), draft);
});

test('language changes restore a saved draft for that problem and language', () => {
  const h = harness({ language: 'cc.cc17', draft: 'current draft' });
  h.drafts.set('AS1001:cc', 'saved C++ draft');
  h.drafts.set('AS1002:cc', 'another problem draft');
  h.run("renderHydroLanguages(['cc'])");
  assert.equal(h.code.value, 'saved C++ draft');
  assert.equal(h.drafts.get('AS1001:cc.cc17'), 'current draft');
});

test('new editors use the correct template if the problem only allows Python', () => {
  const h = harness();
  h.code.value = h.run("hydroLanguageTemplate('')");
  h.run("renderHydroLanguages(['py.pypy3'])");
  assert.equal(h.select.value, 'py.pypy3');
  assert.match(h.code.value, /import sys/);
  assert.doesNotMatch(h.code.value, /#include/);
  for (const id of ['py', 'py.py3', 'py.pypy3']) assert.match(h.run(`hydroLanguageTemplate('${id}')`), /def solve/);
});

test('empty or invalid language lists block submission with a clear configuration message', () => {
  const h = harness({ draft: 'keep this code' });
  h.run("renderHydroLanguages(['', null, 1, 'bad language', 'cc', 'cc'])");
  assert.deepEqual(h.select.options.map(option => option.value), ['cc']);
  h.run('renderHydroLanguages([])');
  assert.equal(h.button.disabled, true);
  assert.equal(h.select.disabled, true);
  assert.match(h.result.textContent, /暂无可用提交语言/);
  assert.equal(h.code.value, 'keep this code');
});

test('original packs leave allowed languages to the association OJ configuration', () => {
  for (const generator of ['generate-hydro-starter-pack.mjs', 'generate-hydro-grammar-tail.mjs']) {
    const text = readFileSync(new URL(`../tools/${generator}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /['"]langs:/);
  }
  let count = 0;
  for (const pack of ['algospark-starter-v1', 'algospark-grammar-tail-v1']) {
    const root = new URL(`../hydro-problems/${pack}/`, import.meta.url);
    for (const dir of readdirSync(root)) {
      if (!/^AS\d+$/.test(dir)) continue;
      const config = readFileSync(new URL(`${dir}/testdata/config.yaml`, root), 'utf8');
      assert.doesNotMatch(config, /^langs:/m, `${dir} must not reintroduce problem language restrictions`);
      count += 1;
    }
  }
  assert.equal(count, 24);
});
