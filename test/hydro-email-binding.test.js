import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('authenticated logins auto-bind by email, preserve ownership, and remain usable when matching fails', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'algospark-email-bind-'));
  const lookups = [];
  const submissions = [];
  const associationLogins = [];
  const codes = new Map();
  let releaseLookup;
  let raceRequested;
  const raceStarted = new Promise(resolve => { raceRequested = resolve; });
  const bridge = createServer(async (req, res) => {
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/p/AUTO1') return send(200, { pdoc: { title: '自动绑定测试题', config: { langs: ['cc'] }, content: '## 题目描述\n输出答案。' } });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (req.url === '/user/external/login') {
      associationLogins.push(body);
      return send(200, { code: 200, data: { userId: 501, email: 'Trusted.Association@Example.COM', userName: '协会同学', realName: '协会同学' } });
    }
    assert.equal(req.headers.authorization, 'Bearer email-binding-test-secret');
    if (req.url === '/algospark/account-by-email') {
      lookups.push(body.email);
      if (body.email === 'ambiguous@example.com') return send(409, { error: 'Duplicate email' });
      if (body.email === 'outage@example.com') return send(500, { error: 'Remote unavailable' });
      if (body.email === 'tampered@example.com') return send(200, { found: true, email: 'other@example.com', hydroUserId: 60, hydroUsername: 'other' });
      if (body.email === 'race@example.com') {
        raceRequested();
        await new Promise(resolve => { releaseLookup = resolve; });
        return send(200, { found: true, email: body.email, hydroUserId: 90, hydroUsername: 'late-match' });
      }
      const uid = { 'mixed@example.com': 40, 'conflict@example.com': 40, 'trusted.association@example.com': 55 }[body.email];
      return send(200, uid ? { found: true, email: body.email.toUpperCase(), hydroUserId: uid, hydroUsername: `hydro${uid}` } : { found: false });
    }
    if (req.url === '/algospark/submit') {
      submissions.push(body);
      return send(202, { submissionId: '65b000000000000000001001', verdict: 'WAITING' });
    }
    return send(404, { error: 'Unknown fixture path' });
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  const bridgeBase = `http://127.0.0.1:${bridge.address().port}`;
  Object.assign(process.env, { DATA_DIR: dir, NODE_ENV: 'test', HYDRO_DEMO_MODE: 'false',
    HYDRO_BASE_URL: bridgeBase, HYDRO_BRIDGE_URL: `${bridgeBase}/algospark`, HYDRO_WEBHOOK_SECRET: 'email-binding-test-secret',
    ASSOCIATION_AUTH_BASE_URL: bridgeBase, ASSOCIATION_AUTH_APP_KEY: 'test-association-key', EXPOSE_DEV_VERIFICATION_CODE: 'true' });
  const originalLog = console.log;
  console.log = (...args) => {
    const match = args.join(' ').match(/(注册|登录)：(\d{6})/);
    if (match) codes.set(match[1], match[2]);
  };
  const { server, closeDatabase } = await import(`../server.js?emailbinding=${Date.now()}`);
  const db = new DatabaseSync(join(dir, 'algospark.db'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body, cookie) {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function register(email) {
    await request('/api/auth/send-verification-code', { email });
    const code = codes.get('注册');
    assert.match(code || '', /^\d{6}$/);
    const result = await request('/api/auth/register', { email, password: 'password123', verificationCode: code, nickname: email.split('@')[0], realName: '测试同学', school: '测试学校' });
    assert.equal(result.response.status, 201);
    return result;
  }
  try {
    assert.equal((await request('/api/hydro/account/auto', {})).response.status, 401);
    assert.equal(lookups.length, 0);
    const mixed = await register('MiXeD@EXAMPLE.COM');
    assert.equal(mixed.body.hydroBinding.status, 'bound');
    assert.equal(mixed.body.hydroBinding.account.userId, '40');
    assert.equal(mixed.body.user.email, 'mixed@example.com');
    assert.deepEqual(lookups, ['mixed@example.com']);
    const account = db.prepare('SELECT * FROM hydro_accounts WHERE user_id=?').get(mixed.body.user.id);
    assert.equal(account.verified, 1);
    assert.equal(account.link_code_hash, null);
    const practice = await request('/api/hydro/problems', null, mixed.cookie);
    assert.equal(practice.body.account.verified, true);
    assert.equal(lookups.length, 1, 'verified accounts do not make repeated lookups');
    db.prepare('INSERT INTO hydro_problems(problem_id,title,points,active,is_demo) VALUES (?,?,10,1,0)').run('AUTO1', '自动绑定测试题');
    const submitted = await request('/api/hydro/submit', { problemId: 'AUTO1', language: 'cc', code: 'int main(){}' }, mixed.cookie);
    assert.equal(submitted.response.status, 202, 'no manual binding or page refresh is required');
    assert.equal(submissions[0].hydroUserId, 40);
    db.prepare('UPDATE hydro_accounts SET hydro_user_id=?,hydro_username=? WHERE user_id=?').run('77', 'manual-existing', mixed.body.user.id);
    const signedIn = await request('/api/auth/login', { email: 'MIXED@example.com', password: 'password123' });
    assert.equal(signedIn.body.hydroBinding.account.userId, '77');
    assert.equal(lookups.length, 1, 'an existing manual binding is preserved');
    const failedLogin = await request('/api/auth/login', { email: 'mixed@example.com', password: 'wrong-password' });
    assert.equal(failedLogin.response.status, 401);
    assert.equal(lookups.length, 1, 'a failed login cannot query or bind Hydro');
    const conflict = await register('conflict@example.com'); // UID 40 was released by the previous manual binding update
    assert.equal(conflict.body.hydroBinding.status, 'bound');
    db.prepare('UPDATE hydro_accounts SET hydro_user_id=?,hydro_username=? WHERE user_id=?').run('40', 'hydro40', conflict.body.user.id);
    db.prepare('DELETE FROM hydro_accounts WHERE user_id=?').run(mixed.body.user.id);
    const blocked = await request('/api/auth/login', { email: 'mixed@example.com', password: 'password123' });
    assert.equal(blocked.response.status, 200);
    assert.equal(blocked.body.hydroBinding.status, 'conflict');
    assert.equal(blocked.body.hydroBinding.account, null);
    for (const [email, expected] of [['unmatched@example.com', 'not-found'], ['ambiguous@example.com', 'ambiguous'], ['outage@example.com', 'unavailable'], ['tampered@example.com', 'unavailable']]) {
      const result = await register(email);
      assert.equal(result.body.hydroBinding.status, expected);
      assert.equal(result.body.hydroBinding.account, null);
      const last = lookups.length;
      await request('/api/auth/me', null, result.cookie);
      await request('/api/hydro/problems', null, result.cookie);
      assert.equal(lookups.length, last, 'negative results are briefly cached');
      const retry = await request('/api/hydro/account/auto', { email: 'trusted.association@example.com', hydroUserId: 55 }, result.cookie);
      assert.equal(retry.body.status, expected);
      assert.equal(lookups.at(-1), email, 'a client cannot choose another user email or Hydro UID');
    }
    const association = await request('/api/auth/association/login', { loginType: 'code', account: 'UNTRUSTED@EXAMPLE.COM', credential: '123456' });
    assert.equal(association.response.status, 200);
    assert.equal(association.body.hydroBinding.account.userId, '55');
    assert.equal(lookups.at(-1), 'trusted.association@example.com', 'association auto-binding uses authenticated server-returned email');
    assert.equal(associationLogins[0].account, 'untrusted@example.com');
    const associationByAccount = await request('/api/auth/association/login', { loginType: 'password', account: 'SchoolAccount', credential: 'test-password' });
    assert.equal(associationByAccount.body.user.id, association.body.user.id);
    assert.equal(associationLogins[1].account, 'SchoolAccount', 'non-email account spelling is preserved');
    const codeUser = await register('code-login@example.com');
    await request('/api/auth/send-login-code', { email: 'CODE-LOGIN@EXAMPLE.COM' });
    const codeLogin = await request('/api/auth/code-login', { email: 'CODE-LOGIN@example.com', verificationCode: codes.get('登录') });
    assert.equal(codeLogin.response.status, 200);
    assert.equal(codeLogin.body.hydroBinding.status, 'not-found');
    assert.equal(codeLogin.body.user.id, codeUser.body.user.id);

    // Manual verification finishing during an automatic lookup must win.
    const created = db.prepare('INSERT INTO users(email,password_hash,nickname,real_name,school) VALUES (?,?,?,?,?)').run('race@example.com', 'unused', 'race', '测试竞态', '测试学校');
    const raceId = Number(created.lastInsertRowid);
    const { createHash } = await import('node:crypto');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(createHash('sha256').update('race-token').digest('hex'), raceId, Date.now() + 60000);
    const raceResponse = request('/api/hydro/account/auto', {}, 'algospark_session=race-token');
    await raceStarted;
    db.prepare('INSERT INTO hydro_accounts(user_id,hydro_user_id,hydro_username,verified) VALUES (?,?,?,1)').run(raceId, '99', 'manual-winner');
    releaseLookup();
    const raceResult = await raceResponse;
    assert.equal(raceResult.body.account.userId, '99');
    assert.match(raceResult.body.message, /manual-winner/);
  } finally {
    console.log = originalLog;
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => bridge.close(resolve));
    db.close(); closeDatabase(); rmSync(dir, { recursive: true, force: true });
  }
});
