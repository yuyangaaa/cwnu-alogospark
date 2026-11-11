import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function sourceBetween(start, end) {
  const offset = app.indexOf(start);
  assert.ok(offset >= 0, `Missing source: ${start}`);
  const finish = app.indexOf(end, offset);
  assert.ok(finish > offset, `Missing source: ${end}`);
  return app.slice(offset, finish);
}

function harness() {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const timers = new Map();
  const requests = [];
  const submissions = [];
  let timerId = 0;
  let account = { username: 'student01', verified: false };
  let requestError = null;
  let resolveRequest = null;
  const button = { textContent: '绑定后提交', disabled: false };
  const result = { className: 'hydro-submit-result', textContent: '请先绑定' };
  const code = { value: '#include <iostream>\nint main() { std::cout << 42; }' };
  const status = { textContent: '确认链接和绑定码', replaceChildren() {}, append() {} };
  const form = { dataset: { problemId: 'AS1001' }, addEventListener(event, callback) { submissions.push(callback); } };
  const context = createContext({
    currentUser: { id: 1 },
    hydroSubmitDialog: { open: true, close() { this.open = false; } },
    hydroSubmitButton: button,
    hydroSubmitResult: result,
    hydroSubmitCode: code,
    hydroSubmitLanguage: { value: 'cc.cc17' },
    hydroAccountStatus: status,
    hydroAutoBindButton: { hidden: true },
    hydroAccountForm: { scrollIntoView() {} },
    hydroSubmitForm: form,
    hydroCodeDrafts: new Map(),
    hydroDraftKey: id => `${id}:cc.cc17`,
    getRoute: () => 'practice',
    document: { visibilityState: 'visible', addEventListener(event, callback) { documentListeners.set(event, callback); } },
    window: { addEventListener(event, callback) { windowListeners.set(event, callback); } },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    authRequest: async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/hydro/problems') {
        if (requestError) throw requestError;
        if (resolveRequest) await new Promise(resolve => { resolveRequest.resolve = resolve; });
        return { account: account ? { ...account } : null, problems: [] };
      }
      assert.equal(path, '/api/hydro/submit');
      return { submissionId: 'record-1', verdict: 'WAITING' };
    },
    renderHydroJudgeResult: value => { result.className = 'hydro-submit-result judging'; result.textContent = value.verdict; },
    pollHydroSubmission: async () => {},
    openAuth() {},
    setAuthStatus() {}
  });
  runInContext(`
    let hydroState = { account: { username: 'student01', verified: false }, problems: [] };
    let hydroAccountRefreshPromise = null;
    let hydroBindingTimer = 0;
    let hydroBindingExpiresAt = 0;
    let hydroPollToken = 0;
    ${sourceBetween('function updateHydroSubmitAvailability()', 'function appendStatementMath(')}
    ${sourceBetween("hydroSubmitForm.addEventListener('submit'", "hydroSubmitCode.addEventListener('input'")}
  `, context);
  return {
    context, button, result, code, status, requests, timers, windowListeners, documentListeners,
    run: source => runInContext(source, context),
    setAccount: value => { account = value; },
    setError: error => { requestError = error; },
    holdRequest: () => { resolveRequest = {}; return () => resolveRequest.resolve(); },
    submit: () => submissions[0]({ preventDefault() {} })
  };
}

test('returning from OJ confirmation updates an open editor without losing its code', async () => {
  const h = harness();
  const draft = h.code.value;
  h.setAccount({ username: 'student01', userId: '24', verified: true });
  h.windowListeners.get('focus')();
  await h.run('refreshHydroAccount()');
  assert.equal(h.button.textContent, '提交评测');
  assert.match(h.status.textContent, /已验证绑定：student01/);
  assert.equal(h.code.value, draft);
  assert.equal(h.context.hydroSubmitDialog.open, true);
  assert.equal(h.requests.length, 1, 'simultaneous checks share a request');
  assert.equal(h.requests[0].options.cache, 'no-store');
  assert.equal(h.timers.size, 0, 'confirmed accounts stop polling');
});

test('pending binding polls until confirmed and preserves the confirmation link', async () => {
  const h = harness();
  h.run('syncHydroAccount(hydroState.account)');
  assert.equal(h.timers.size, 1);
  await h.run('refreshHydroAccount()');
  assert.equal(h.status.textContent, '确认链接和绑定码');
  h.setAccount({ username: 'student01', verified: true });
  await [...h.timers.values()][0]();
  assert.equal(h.button.textContent, '提交评测');
  assert.equal(h.timers.size, 0);
});

test('hidden pages pause polling and visible pages immediately refresh binding', async () => {
  const h = harness();
  h.run('syncHydroAccount(hydroState.account)');
  h.context.document.visibilityState = 'hidden';
  h.documentListeners.get('visibilitychange')();
  assert.equal(h.timers.size, 0);
  assert.equal(h.requests.length, 0);
  h.setAccount({ username: 'student01', verified: true });
  h.context.document.visibilityState = 'visible';
  h.documentListeners.get('visibilitychange')();
  await h.run('refreshHydroAccount()');
  assert.equal(h.button.textContent, '提交评测');
});

test('clicking a stale binding button checks the server and submits in the same click', async () => {
  const h = harness();
  h.setAccount({ username: 'student01', verified: true });
  await h.submit();
  assert.deepEqual(h.requests.map(request => request.path), ['/api/hydro/problems', '/api/hydro/submit']);
  assert.equal(JSON.parse(h.requests[1].options.body).code, h.code.value);
  assert.equal(h.context.hydroCodeDrafts.get('AS1001:cc.cc17'), h.code.value);
  assert.equal(h.context.hydroSubmitDialog.open, true);
  assert.equal(h.button.disabled, false);
});

test('an unconfirmed account is still blocked and its code draft is kept', async () => {
  const h = harness();
  await h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.context.hydroSubmitDialog.open, false);
  assert.match(h.status.textContent, /代码草稿已保留/);
  assert.equal(h.context.hydroCodeDrafts.get('AS1001:cc.cc17'), h.code.value);
});

test('failed binding checks show a retryable error without posting or losing code', async () => {
  const h = harness();
  const draft = h.code.value;
  h.setError(new Error('网络暂时不可用'));
  await h.submit();
  assert.equal(h.requests.length, 1);
  assert.equal(h.result.textContent, '网络暂时不可用');
  assert.equal(h.context.hydroSubmitDialog.open, true);
  assert.equal(h.button.disabled, false);
  assert.equal(h.code.value, draft);
});

test('binding refresh preserves judge results and ignores responses for a previous user', async () => {
  const h = harness();
  h.result.className = 'hydro-submit-result accepted';
  h.result.textContent = '✓ AC · 得分 100';
  h.setAccount({ username: 'student01', verified: true });
  await h.run('refreshHydroAccount()');
  assert.equal(h.result.textContent, '✓ AC · 得分 100');
  const release = h.holdRequest();
  h.setAccount({ username: 'previous-user', verified: true });
  const request = h.run('refreshHydroAccount()');
  h.context.currentUser = { id: 2 };
  release();
  await request;
  assert.equal(h.run('hydroState.account.username'), 'student01');
});

test('binding polling is bounded and stops after the ten minute confirmation window', () => {
  const h = harness();
  h.run('syncHydroAccount(hydroState.account); hydroBindingExpiresAt = Date.now() - 1; scheduleHydroBindingRefresh();');
  assert.equal(h.timers.size, 0);
});

test('closing the editor during a binding check prevents a delayed submission', async () => {
  const h = harness();
  h.setAccount({ username: 'student01', verified: true });
  const release = h.holdRequest();
  const submission = h.submit();
  h.context.hydroSubmitDialog.open = false;
  h.run('hydroPollToken += 1');
  release();
  await submission;
  assert.equal(h.requests.length, 1);
  assert.equal(h.button.disabled, false);
});
