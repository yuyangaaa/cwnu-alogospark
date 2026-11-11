import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const { lookupEmailAccount } = createRequire(import.meta.url)('../hydro-plugin/email-account.cjs');

function fixture(records, { allowed = true, currentMail } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    args: {
      users: { find(query, options) {
        calls++;
        assert.equal(options.maxTimeMS, 2000);
        assert.deepEqual(options.projection, { _id: 1, mail: 1 });
        const regex = new RegExp(query.mail.$regex, query.mail.$options);
        return { limit(limit) { assert.equal(limit, 2); return { toArray: async () => records.filter(r => r._id > query._id.$gt && regex.test(r.mail)).slice(0, limit) }; } };
      } },
      getUser: async uid => ({ ...records.find(record => record._id === uid), ...(currentMail ? { mail: currentMail } : {}) }),
      canUse: () => allowed
    }
  };
}

test('Hydro lookup matches case-insensitively and returns only the exact authenticated email', async () => {
  const f = fixture([{ _id: 24, mail: 'Student.Name+training@Example.COM', uname: 'student24' }]);
  const result = await lookupEmailAccount({ ...f.args, email: ' STUDENT.NAME+training@example.com ' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { found: true, email: 'student.name+training@example.com', hydroUserId: 24, hydroUsername: 'student24' });
});

test('dots, plus aliases and regex syntax never broaden email matching', async () => {
  const f = fixture([{ _id: 24, mail: 'student.name+training@example.com', uname: 'student24' }]);
  for (const email of ['studentname@example.com', 'student.name@example.com', 'student.name+other@example.com', 'studentXname+training@example.com', '.*@example.com']) {
    assert.deepEqual((await lookupEmailAccount({ ...f.args, email })).body, { found: false });
  }
});

test('ambiguous emails, disabled users and guest accounts cannot be automatically selected', async () => {
  const duplicate = fixture([{ _id: 24, mail: 'a@example.com' }, { _id: 25, mail: 'A@EXAMPLE.COM' }]);
  assert.equal((await lookupEmailAccount({ ...duplicate.args, email: 'a@example.com' })).status, 409);
  const banned = fixture([{ _id: 24, mail: 'a@example.com' }], { allowed: false });
  assert.equal((await lookupEmailAccount({ ...banned.args, email: 'a@example.com' })).status, 403);
  const guest = fixture([{ _id: 1, mail: 'a@example.com' }]);
  assert.deepEqual((await lookupEmailAccount({ ...guest.args, email: 'a@example.com' })).body, { found: false });
});

test('invalid or concurrently changed emails are rejected without disclosing another account', async () => {
  const f = fixture([{ _id: 24, mail: 'a@example.com' }], { currentMail: 'someone-else@example.com' });
  assert.equal((await lookupEmailAccount({ ...f.args, email: 'invalid' })).status, 400);
  assert.equal(f.calls, 0);
  assert.deepEqual((await lookupEmailAccount({ ...f.args, email: 'a@example.com' })).body, { found: false });
});

test('plugin handler uses the Hydro collection API and requires service authentication before looking up users', async () => {
  const source = readFileSync(new URL('../hydro-plugin/index.ts', import.meta.url), 'utf8');
  const handlerSource = source.slice(source.indexOf('class EmailAccountHandler extends Handler'), source.indexOf('class SubmitHandler extends Handler'));
  const f = fixture([{ _id: 24, mail: 'student@example.com', uname: 'student24' }]);
  let authenticated = false;
  let actualResult;
  const Handler = runInNewContext(`(() => { ${stripTypeScriptTypes(handlerSource)}; return EmailAccountHandler; })()`, {
    Handler: class {}, lookupEmailAccount,
    verifyServiceRequest: () => authenticated,
    db: { collection(name) { assert.equal(name, 'user'); return f.args.users; } },
    UserModel: { async getById(domain, uid) {
      assert.equal(domain, 'system');
      return { ...await f.args.getUser(uid), hasPriv: () => true, hasPerm: () => true };
    } },
    PRIV: { PRIV_USER_PROFILE: 1 }, PERM: { PERM_SUBMIT_PROBLEM: 2n },
    setJson: (_, status, body) => { actualResult = { status, body }; }
  });
  const handler = new Handler();
  handler.request = { body: { email: 'STUDENT@example.com' } };
  handler.args = { domainId: 'system' };
  await handler.post();
  assert.equal(f.calls, 0);
  authenticated = true;
  await handler.post();
  assert.equal(actualResult.status, 200);
  assert.equal(actualResult.body.hydroUserId, 24);
});
