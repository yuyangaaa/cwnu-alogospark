import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

test('Hydro AC sync awards points once and updates progress', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'algospark-hydro-'));
  let bridgePayload = null;
  const statementUpdates = [];
  const associationPayloads = [];
  const bridge = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/record/64b000000000000000001001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        udoc: { _id: 24, uname: 'student01' },
        rdoc: { _id: '64b000000000000000001001', status: 7, uid: 24, lang: 'cc.cc17', score: 0, time: 0, memory: 0, judgeAt: new Date().toISOString() },
        pdoc: { pid: 'A1001', title: '原创求和题' }
      }));
    }
    if (req.method === 'GET' && req.url === '/p/A1001') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        pdoc: {
          title: '原创求和题',
          config: { langs: ['cc.cc17'] },
          content: JSON.stringify({
            en: '## Description\n\nAdd two integers.',
            zh: '## 题目描述\n\n计算两个整数的和。\n\n## 输入格式\n\n两个整数。'
          }),
          tag: ['入门', '输入输出']
        }
      }));
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (req.url === '/algospark/account-by-email') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ found: false }));
    }
    if (req.url === '/user/external/send-code') {
      associationPayloads.push({ path: req.url, payload });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ code: 200, msg: '验证码已发送', data: '验证码已发送' }));
    }
    if (req.url === '/user/external/login') {
      associationPayloads.push({ path: req.url, payload });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        code: 200,
        msg: 'success',
        data: {
          userId: 20240001,
          userAccount: 'campus-user',
          userName: '校内昵称',
          realName: '校内同学',
          numberId: '20240001',
          email: 'campus@example.com'
        }
      }));
    }
    bridgePayload = payload;
    if (req.url === '/algospark/update-statement') {
      statementUpdates.push(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, problemId: payload.problemId, title: payload.title, samplesUpdated: true }));
    }
    res.writeHead(req.url.endsWith('/problem') ? 200 : 202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(req.url.endsWith('/problem')
      ? { problemId: bridgePayload.problemId, title: 'Hydro 校验题', judgeConfigured: true, languages: ['cc.cc17'] }
      : { submissionId: '64b000000000000000001001', verdict: 'WAITING' }));
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  const bridgePort = bridge.address().port;
  process.env.DATA_DIR = dataDir;
  process.env.HYDRO_DEMO_MODE = 'true';
  process.env.HYDRO_BASE_URL = `http://127.0.0.1:${bridgePort}`;
  process.env.HYDRO_BRIDGE_URL = `http://127.0.0.1:${bridgePort}/algospark`;
  process.env.HYDRO_WEBHOOK_SECRET = 'test-secret-with-enough-random-characters';
  process.env.ADMIN_EMAILS = 'student@example.com';
  process.env.ASSOCIATION_AUTH_BASE_URL = `http://127.0.0.1:${bridgePort}`;
  process.env.ASSOCIATION_AUTH_APP_KEY = 'association-test-key';
  process.env.NODE_ENV = 'test';
  process.env.EXPOSE_DEV_VERIFICATION_CODE = 'true';

  let verificationCode = '';
  let loginVerificationCode = '';
  const originalLog = console.log;
  console.log = (...values) => {
    const match = values.join(' ').match(/注册：(\d{6})/);
    if (match) verificationCode = match[1];
    const loginMatch = values.join(' ').match(/登录：(\d{6})/);
    if (loginMatch) loginVerificationCode = loginMatch[1];
  };

  const module = await import(`../server.js?test=${Date.now()}`);
  const { server, closeDatabase } = module;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  async function json(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
    });
    const body = await response.json();
    return { response, body };
  }

  try {
    for (const [path, type] of [
      ['/vendor/katex-0.19.1/katex.min.js', 'text/javascript'],
      ['/vendor/katex-0.19.1/katex.min.css', 'text/css'],
      ['/vendor/katex-0.19.1/fonts/KaTeX_Math-Italic.woff2', 'font/woff2']
    ]) {
      const asset = await fetch(base + path);
      assert.equal(asset.status, 200, path);
      assert.ok(asset.headers.get('content-type').startsWith(type), path);
      assert.ok((await asset.arrayBuffer()).byteLength > 0, path);
    }
    assert.equal((await fetch(base + '/node_modules/katex/package.json')).status, 404);
    assert.equal((await fetch(base + '/vendor/katex-0.19.1/LICENSE')).status, 404);
    await json('/api/auth/send-verification-code', { method: 'POST', body: JSON.stringify({ email: 'student@example.com' }) });
    assert.match(verificationCode, /^\d{6}$/);
    const registered = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'student@example.com', password: 'password123', verificationCode,
        nickname: 'Student', realName: '测试同学', school: 'AlgoSpark'
      })
    });
    assert.equal(registered.response.status, 201);
    const cookie = registered.response.headers.get('set-cookie').split(';')[0];
    const sessionHeaders = { Cookie: cookie };
    assert.equal(registered.body.user.isAdmin, true);
    assert.equal(registered.body.user.avatarTheme, 'aurora');
    assert.equal(registered.body.user.achievementBadgeId, '');
    assert.equal(registered.body.user.avatarFrame, 'none');
    assert.equal(registered.body.user.profileDecor, 'none');

    const initialResources = await json('/api/resources');
    assert.equal(initialResources.response.status, 200);
    assert.equal(initialResources.body.total, 1);
    assert.equal(initialResources.body.resources[0].title, '算法竞赛模板计算几何部分');
    assert.equal(initialResources.body.resources[0].url, 'https://www.cnblogs.com/yuyang-/p/22634975');
    assert.equal(initialResources.body.resources[0].publisher.nickname, 'Student');
    assert.equal(initialResources.body.resources[0].publisher.realName, '测试同学');
    const unauthenticatedResourcePublish = await json('/api/admin/resources', {
      method: 'POST', body: JSON.stringify({ title: '未授权资源', url: 'https://example.com/unauthorized' })
    });
    assert.equal(unauthenticatedResourcePublish.response.status, 401);
    const publishedResource = await json('/api/admin/resources', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ title: '前缀和学习笔记', url: 'https://example.com/prefix-sum' })
    });
    assert.equal(publishedResource.response.status, 201);
    assert.equal(publishedResource.body.resource.title, '前缀和学习笔记');
    assert.equal(publishedResource.body.resource.publisher.nickname, 'Student');
    assert.equal(publishedResource.body.resource.publisher.realName, '测试同学');
    const duplicateResource = await json('/api/admin/resources', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ title: '重复网址', url: 'https://example.com/prefix-sum' })
    });
    assert.equal(duplicateResource.response.status, 409);
    const invalidResource = await json('/api/admin/resources', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ title: '非法网址', url: 'javascript:alert(1)' })
    });
    assert.equal(invalidResource.response.status, 400);
    const refreshedResources = await json('/api/resources');
    assert.equal(refreshedResources.body.total, 2);
    assert.equal(refreshedResources.body.resources[0].url, 'https://example.com/prefix-sum');
    const publishedResourceId = publishedResource.body.resource.id;
    const unauthenticatedResourceEdit = await json(`/api/admin/resources/${publishedResourceId}`, {
      method: 'PATCH', body: JSON.stringify({ title: '未授权修改' })
    });
    assert.equal(unauthenticatedResourceEdit.response.status, 401);
    const invalidResourceEdit = await json(`/api/admin/resources/${publishedResourceId}`, {
      method: 'PATCH', headers: sessionHeaders, body: JSON.stringify({ title: '' })
    });
    assert.equal(invalidResourceEdit.response.status, 400);
    const editedResource = await json(`/api/admin/resources/${publishedResourceId}`, {
      method: 'PATCH', headers: sessionHeaders, body: JSON.stringify({ title: '前缀和进阶笔记' })
    });
    assert.equal(editedResource.response.status, 200);
    assert.equal(editedResource.body.resource.title, '前缀和进阶笔记');
    const resourcesAfterEdit = await json('/api/resources');
    assert.equal(resourcesAfterEdit.body.resources[0].title, '前缀和进阶笔记');
    const withdrawnResource = await json(`/api/admin/resources/${publishedResourceId}`, {
      method: 'DELETE', headers: sessionHeaders
    });
    assert.equal(withdrawnResource.response.status, 200);
    const resourcesAfterWithdrawal = await json('/api/resources');
    assert.equal(resourcesAfterWithdrawal.body.total, 1);
    assert.equal(resourcesAfterWithdrawal.body.resources.some(resource => resource.id === publishedResourceId), false);
    const repeatedWithdrawal = await json(`/api/admin/resources/${publishedResourceId}`, {
      method: 'DELETE', headers: sessionHeaders
    });
    assert.equal(repeatedWithdrawal.response.status, 404);

    const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    const unauthenticatedPdfUpload = await fetch(`${base}/api/admin/resources/pdf?title=${encodeURIComponent('未授权 PDF')}&filename=notes.pdf`, {
      method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: pdfBytes
    });
    assert.equal(unauthenticatedPdfUpload.status, 401);
    const invalidPdfUpload = await fetch(`${base}/api/admin/resources/pdf?title=${encodeURIComponent('伪造 PDF')}&filename=fake.pdf`, {
      method: 'POST', headers: { ...sessionHeaders, 'Content-Type': 'application/pdf' }, body: Buffer.from('not a pdf')
    });
    assert.equal(invalidPdfUpload.status, 400);
    const pdfUploadResponse = await fetch(`${base}/api/admin/resources/pdf?title=${encodeURIComponent('动态规划讲义')}&filename=${encodeURIComponent('动态规划讲义.pdf')}`, {
      method: 'POST', headers: { ...sessionHeaders, 'Content-Type': 'application/pdf' }, body: pdfBytes
    });
    assert.equal(pdfUploadResponse.status, 201);
    const pdfUpload = await pdfUploadResponse.json();
    assert.equal(pdfUpload.resource.type, 'pdf');
    assert.equal(pdfUpload.resource.fileName, '动态规划讲义.pdf');
    assert.equal(pdfUpload.resource.fileSize, pdfBytes.length);
    const listedPdfResources = await json('/api/resources');
    assert.equal(listedPdfResources.body.total, 2);
    assert.equal(listedPdfResources.body.resources[0].type, 'pdf');
    assert.equal(listedPdfResources.body.resources[0].url, `/api/resources/${pdfUpload.resource.id}/pdf`);
    const openedPdf = await fetch(base + pdfUpload.resource.url);
    assert.equal(openedPdf.status, 200);
    assert.equal(openedPdf.headers.get('content-type'), 'application/pdf');
    assert.deepEqual(Buffer.from(await openedPdf.arrayBuffer()), pdfBytes);
    const withdrawnPdf = await json(`/api/admin/resources/${pdfUpload.resource.id}`, {
      method: 'DELETE', headers: sessionHeaders
    });
    assert.equal(withdrawnPdf.response.status, 200);
    const unavailablePdf = await fetch(base + pdfUpload.resource.url);
    assert.equal(unavailablePdf.status, 404);

    const unauthenticatedAvatarUpdate = await json('/api/profile/avatar', {
      method: 'POST', body: JSON.stringify({ avatarTheme: 'ocean' })
    });
    assert.equal(unauthenticatedAvatarUpdate.response.status, 401);
    const invalidAvatarUpdate = await json('/api/profile/avatar', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ avatarTheme: 'custom-css' })
    });
    assert.equal(invalidAvatarUpdate.response.status, 400);
    const lockedAvatarUpdate = await json('/api/profile/avatar', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ avatarTheme: 'forest' })
    });
    assert.equal(lockedAvatarUpdate.response.status, 403);
    assert.equal(lockedAvatarUpdate.body.requiredScore, 50);
    const avatarUpdate = await json('/api/profile/avatar', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ avatarTheme: 'ocean' })
    });
    assert.equal(avatarUpdate.response.status, 200);
    assert.equal(avatarUpdate.body.user.avatarTheme, 'ocean');
    const refreshedUser = await json('/api/auth/me', { headers: sessionHeaders });
    assert.equal(refreshedUser.body.user.avatarTheme, 'ocean');

    const existingRegistration = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'student@example.com', password: 'password123', verificationCode: '000000',
        nickname: 'Existing', realName: 'Existing', school: 'AlgoSpark'
      })
    });
    const unknownRegistration = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'never-seen@example.com', password: 'password123', verificationCode: '000000',
        nickname: 'Unknown', realName: 'Unknown', school: 'AlgoSpark'
      })
    });
    assert.equal(existingRegistration.response.status, unknownRegistration.response.status);
    assert.equal(existingRegistration.body.error, unknownRegistration.body.error);

    const adminOverview = await json('/api/admin/hydro', { headers: sessionHeaders });
    assert.equal(adminOverview.response.status, 200);
    const adminPublished = await json('/api/admin/hydro/problems', {
      method: 'POST', headers: sessionHeaders,
      body: JSON.stringify({ problemId: 'A2000', points: 30, track: 'grammar', verifyHydro: true, active: true })
    });
    assert.equal(adminPublished.response.status, 200);
    assert.equal(adminPublished.body.problem.title, 'Hydro 校验题');
    const adminDisabled = await json('/api/admin/hydro/problems/A2000/status', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ active: false })
    });
    assert.equal(adminDisabled.body.active, false);
    const starterPack = await json('/api/admin/hydro/starter-pack', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({})
    });
    assert.equal(starterPack.response.status, 200);
    assert.equal(starterPack.body.published.length, 24);
    assert.equal(starterPack.body.failed.length, 0);
    const updatedStatements = await json('/api/admin/hydro/starter-pack/update-statements', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({})
    });
    assert.equal(updatedStatements.response.status, 200);
    assert.equal(updatedStatements.body.updated.length, 24);
    assert.equal(updatedStatements.body.failed.length, 0);
    assert.equal(statementUpdates.length, 24);
    assert.match(statementUpdates.find(item => item.problemId === 'AS1002').content, /## 输入样例 1/);
    const overviewAfterPack = await json('/api/admin/hydro', { headers: sessionHeaders });
    assert.equal(overviewAfterPack.body.problems.filter(problem => /^AS10/.test(problem.problemId)).length, 24);

    await json('/api/auth/send-verification-code', { method: 'POST', body: JSON.stringify({ email: 'member@example.com' }) });
    const member = await json('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'member@example.com', password: 'password123', verificationCode,
        nickname: 'Member', realName: '普通同学', school: 'AlgoSpark'
      })
    });
    const memberHeaders = { Cookie: member.response.headers.get('set-cookie').split(';')[0] };
    const forbiddenAdmin = await json('/api/admin/hydro', { headers: memberHeaders });
    assert.equal(forbiddenAdmin.response.status, 403);
    const forbiddenResourcePublish = await json('/api/admin/resources', {
      method: 'POST', headers: memberHeaders, body: JSON.stringify({ title: '普通用户资源', url: 'https://example.com/member' })
    });
    assert.equal(forbiddenResourcePublish.response.status, 403);
    const forbiddenResourceEdit = await json(`/api/admin/resources/${initialResources.body.resources[0].id}`, {
      method: 'PATCH', headers: memberHeaders, body: JSON.stringify({ title: '普通用户修改' })
    });
    assert.equal(forbiddenResourceEdit.response.status, 403);

    const sentLoginCode = await json('/api/auth/send-login-code', {
      method: 'POST', body: JSON.stringify({ email: 'member@example.com' })
    });
    assert.equal(sentLoginCode.response.status, 202);
    const unknownLoginCode = await json('/api/auth/send-login-code', {
      method: 'POST', body: JSON.stringify({ email: 'unknown@example.com' })
    });
    assert.equal(unknownLoginCode.response.status, 202);
    assert.equal(unknownLoginCode.body.message, sentLoginCode.body.message);
    const repeatedUnknownLoginCode = await json('/api/auth/send-login-code', {
      method: 'POST', body: JSON.stringify({ email: 'unknown@example.com' })
    });
    assert.equal(repeatedUnknownLoginCode.response.status, 429);
    assert.ok(repeatedUnknownLoginCode.body.retryAfter > 0);
    assert.match(loginVerificationCode, /^\d{6}$/);
    const codeLogin = await json('/api/auth/code-login', {
      method: 'POST', body: JSON.stringify({ email: 'member@example.com', verificationCode: loginVerificationCode })
    });
    assert.equal(codeLogin.response.status, 200);
    assert.equal(codeLogin.body.user.email, 'member@example.com');

    const associationCode = await json('/api/auth/association/send-code', {
      method: 'POST', body: JSON.stringify({ email: 'campus@example.com' })
    });
    assert.equal(associationCode.response.status, 202);
    const associationLogin = await json('/api/auth/association/login', {
      method: 'POST',
      body: JSON.stringify({ loginType: 'password', account: '20240001', credential: 'association-password' })
    });
    assert.equal(associationLogin.response.status, 200);
    assert.equal(associationLogin.body.user.school, '西华师范大学');
    assert.equal(associationLogin.body.user.realName, '校内同学');
    const repeatedAssociationLogin = await json('/api/auth/association/login', {
      method: 'POST',
      body: JSON.stringify({ loginType: 'code', account: 'campus@example.com', credential: '123456' })
    });
    assert.equal(repeatedAssociationLogin.body.user.id, associationLogin.body.user.id);
    assert.equal(associationPayloads[0].payload.appKey, 'association-test-key');
    assert.equal(associationPayloads[1].payload.credential, 'association-password');

    const bound = await json('/api/hydro/account', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ username: 'student01' })
    });
    assert.equal(bound.response.status, 200);

    const firstDemo = await json('/api/hydro/demo-submission', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'DEMO-1001', verdict: 'AC' })
    });
    assert.equal(firstDemo.body.awarded, true);
    assert.equal(firstDemo.body.score, 10);
    const secondDemo = await json('/api/hydro/demo-submission', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'DEMO-1001', verdict: 'AC' })
    });
    assert.equal(secondDemo.body.awarded, false);
    assert.equal(secondDemo.body.score, 10);

    const webhookHeaders = { Authorization: `Bearer ${process.env.HYDRO_WEBHOOK_SECRET}` };
    const verified = await json('/api/integrations/hydro/account', {
      method: 'POST', headers: webhookHeaders,
      body: JSON.stringify({ hydroUserId: '24', hydroUsername: 'student01', linkCode: bound.body.linkCode })
    });
    assert.equal(verified.response.status, 200);
    const syncedProblem = await json('/api/integrations/hydro/problem', {
      method: 'POST', headers: webhookHeaders,
      body: JSON.stringify({ problemId: 'A1001', title: '原创求和题', points: 25, track: 'algorithm', topic: 'graph', subtopic: 'shortest-path', active: true })
    });
    assert.equal(syncedProblem.response.status, 200);
    const bridgeBeforeInvalidLanguage = bridgePayload;
    const invalidLanguage = await json('/api/hydro/submit', {
      method: 'POST', headers: sessionHeaders,
      body: JSON.stringify({ problemId: 'A1001', language: 'cc.cc20', code: 'int main() { return 0; }' })
    });
    assert.equal(invalidLanguage.response.status, 400);
    assert.match(invalidLanguage.body.error, /不支持所选语言/);
    assert.equal(bridgePayload, bridgeBeforeInvalidLanguage, 'disallowed languages never reach the judge bridge');
    const submitted = await json('/api/hydro/submit', {
      method: 'POST', headers: sessionHeaders,
      body: JSON.stringify({ problemId: 'A1001', language: 'cc.cc17', code: 'int main() { return 0; }' })
    });
    assert.equal(submitted.response.status, 202);
    assert.equal(submitted.body.submissionId, '64b000000000000000001001');
    assert.equal(bridgePayload.hydroUserId, 24);
    assert.equal(bridgePayload.websiteUserId, 1);
    assert.equal(bridgePayload.problemId, 'A1001');
    const pending = await json('/api/hydro/submissions/64b000000000000000001001', { headers: sessionHeaders });
    assert.equal(pending.body.verdict, 'CE');

    const submissionPayload = {
      submissionId: 'submission-9001', problemId: 'A1001', hydroUserId: '24',
      hydroUsername: 'student01', verdict: 'Accepted'
    };
    const accepted = await json('/api/integrations/hydro/submission', {
      method: 'POST', headers: webhookHeaders, body: JSON.stringify(submissionPayload)
    });
    assert.equal(accepted.body.awarded, true);
    assert.equal(accepted.body.score, 35);
    assert.equal(accepted.body.ojHeatmap.totalAccepted, 1);
    assert.equal(accepted.body.ojHeatmap.activeDays, 1);
    assert.equal(accepted.body.ojHeatmap.days.length, 1);
    assert.equal(accepted.body.ojHeatmap.days[0].count, 1);
    assert.equal(accepted.body.ojHeatmap.days[0].points, 25);
    assert.equal(accepted.body.collection.achievements.length, 11);
    assert.equal(accepted.body.collection.achievements.find(item => item.id === 'rank-1').unlocked, true);
    assert.equal(accepted.body.collection.achievements.find(item => item.id === 'founding-ten').unlocked, true);
    assert.equal(accepted.body.collection.achievements.find(item => item.id === 'admin-core').unlocked, true);
    assert.equal(accepted.body.collection.achievements.find(item => item.id === 'grand-rank1-10').unlocked, false);
    assert.equal(accepted.body.collection.frames.find(item => item.id === 'frost').requiredScore, 800);
    assert.equal(accepted.body.collection.frames.find(item => item.id === 'sovereign').requiredBadges, 12);
    assert.equal(accepted.body.collection.frames.find(item => item.id === 'sovereign').currentBadges, 3);
    const lockedBadge = await json('/api/profile/collection', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ type: 'achievement', value: 'grand-rank1-10' })
    });
    assert.equal(lockedBadge.response.status, 403);
    const equippedBadge = await json('/api/profile/collection', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ type: 'achievement', value: 'rank-1' })
    });
    assert.equal(equippedBadge.response.status, 200);
    assert.equal(equippedBadge.body.user.achievementBadgeId, 'rank-1');
    const lockedFrame = await json('/api/profile/collection', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ type: 'frame', value: 'frost' })
    });
    assert.equal(lockedFrame.response.status, 403);
    assert.equal(lockedFrame.body.requiredScore, 800);
    const badgeLockedFrame = await json('/api/profile/collection', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ type: 'frame', value: 'sovereign' })
    });
    assert.equal(badgeLockedFrame.response.status, 403);
    assert.equal(badgeLockedFrame.body.requiredBadges, 12);
    const notifications = await json('/api/notifications', { headers: sessionHeaders });
    assert.equal(notifications.response.status, 200);
    assert.ok(notifications.body.unreadCount >= 1);
    assert.ok(notifications.body.notifications.some(item => item.achievement?.id === 'rank-1'));
    const markedRead = await json('/api/notifications/read', { method: 'POST', headers: sessionHeaders, body: '{}' });
    assert.equal(markedRead.body.unreadCount, 0);
    const publicProfile = await json(`/api/users/${registered.body.user.id}/profile`);
    assert.equal(publicProfile.response.status, 200);
    assert.equal(publicProfile.body.user.nickname, 'Student');
    assert.equal('email' in publicProfile.body.user, false);
    assert.ok(publicProfile.body.achievements.some(item => item.id === 'rank-1'));
    const duplicate = await json('/api/integrations/hydro/submission', {
      method: 'POST', headers: webhookHeaders, body: JSON.stringify(submissionPayload)
    });
    assert.equal(duplicate.body.awarded, false);
    assert.equal(duplicate.body.score, 35);

    const problems = await json('/api/hydro/problems', { headers: sessionHeaders });
    assert.equal(problems.body.account.verified, true);
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'A1001').accepted, true);
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'A1001').track, 'algorithm');
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'A1001').topic, 'graph');
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'A1001').subtopic, 'shortest-path');
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'ACM0022').topic, 'start');
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'ACM0059').topic, 'loop');
    assert.equal(problems.body.problems.find(problem => problem.problemId === 'ACM0063').topic, 'function-struct');
    assert.equal(problems.body.problems.some(problem => problem.problemId === 'PX0048'), false);
    const statement = await json('/api/hydro/problems/A1001/statement');
    assert.equal(statement.response.status, 200);
    assert.equal(statement.body.title, '原创求和题');
    assert.match(statement.body.content, /计算两个整数的和/);
    assert.doesNotMatch(statement.body.content, /^\s*\{\s*"zh"/);
    assert.doesNotMatch(statement.body.content, /Add two integers/);
    assert.deepEqual(statement.body.tags, ['入门', '输入输出']);
    assert.equal('data' in statement.body, false);
    assert.deepEqual(statement.body.languages, ['cc.cc17']);

    const manualLuogu = await json('/api/practice/completion', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'P1001', completed: true })
    });
    assert.equal(manualLuogu.response.status, 200);
    assert.equal(manualLuogu.body.score, 38);
    assert.equal(manualLuogu.body.completedCount, 3);
    assert.ok(manualLuogu.body.completed.includes('P1001'));
    assert.equal(manualLuogu.body.ojHeatmap.totalAccepted, 1);
    assert.equal(manualLuogu.body.ojHeatmap.days[0].count, 1);
    const repeatedManualLuogu = await json('/api/practice/completion', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'P1001', completed: true })
    });
    assert.equal(repeatedManualLuogu.body.score, 38);
    const invalidManualLuogu = await json('/api/practice/completion', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'P9999', completed: true })
    });
    assert.equal(invalidManualLuogu.response.status, 400);
    const ranking = await json('/api/leaderboard');
    assert.equal(ranking.body.entries[0].score, 38);
    assert.equal(ranking.body.entries[0].completedCount, 3);
    assert.equal(ranking.body.entries[0].id, registered.body.user.id);
    assert.equal(ranking.body.entries[0].realName, '测试同学');
    assert.equal(ranking.body.entries[0].school, 'AlgoSpark');
    assert.equal(ranking.body.entries[0].avatarTheme, 'ocean');
    assert.equal(ranking.body.entries[0].achievementBadge.name, '星冠·初次登顶');
    assert.equal(ranking.body.entries[0].achievementBadge.description, '历史总榜首次登顶第 1 名');
    assert.equal(ranking.body.entries[0].avatarFrame, 'none');
    assert.ok(ranking.body.entries.some(entry => entry.score === 0 && entry.rank === null));
    const weeklyRanking = await json('/api/leaderboard?scope=weekly');
    assert.equal(weeklyRanking.body.scope, 'weekly');
    assert.equal(weeklyRanking.body.entries[0].id, registered.body.user.id);
    assert.equal(weeklyRanking.body.entries[0].score, 38);
    assert.match(weeklyRanking.body.period.start, /^\d{4}-\d{2}-\d{2}$/);
    const privateRanking = await json('/api/leaderboard', { headers: sessionHeaders });
    const ownEntry = privateRanking.body.entries.find(entry => entry.id === registered.body.user.id);
    assert.equal(ownEntry.realName, '测试同学');
    assert.equal(ownEntry.school, 'AlgoSpark');

    const auditDb = new DatabaseSync(join(dataDir, 'algospark.db'));
    const userColumns = auditDb.prepare("PRAGMA table_info('users')").all().map(column => column.name);
    assert.equal(userColumns.includes('achievement_badge'), true);
    assert.equal(userColumns.includes('avatar_frame'), true);
    assert.equal(userColumns.includes('profile_decor'), true);
    const rankingTables = auditDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('leaderboard_daily_snapshots', 'leaderboard_weekly_results') ORDER BY name").all().map(row => row.name);
    assert.deepEqual(rankingTables, ['leaderboard_daily_snapshots', 'leaderboard_weekly_results']);
    const resourceTables = auditDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learning_resources'").all().map(row => row.name);
    assert.deepEqual(resourceTables, ['learning_resources']);
    const resourceColumns = auditDb.prepare("PRAGMA table_info('learning_resources')").all().map(column => column.name);
    assert.equal(resourceColumns.includes('withdrawn_at'), true);
    const insertSnapshot = auditDb.prepare("INSERT OR REPLACE INTO leaderboard_daily_snapshots (snapshot_date, user_id, rank, score, completed_count) VALUES (?, ?, 1, 38, 3)");
    const shanghaiToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const todayDate = new Date(`${shanghaiToday}T00:00:00Z`);
    for (let offset = 1; offset <= 9; offset += 1) {
      const snapshotDate = new Date(todayDate);
      snapshotDate.setUTCDate(snapshotDate.getUTCDate() - offset);
      insertSnapshot.run(snapshotDate.toISOString().slice(0, 10), registered.body.user.id);
    }
    const streakProgress = await json('/api/practice/progress', { headers: sessionHeaders });
    assert.equal(streakProgress.body.collection.achievements.find(item => item.id === 'grand-rank1-10').unlocked, true);
    const royalAvatar = await json('/api/profile/avatar', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ avatarTheme: 'royal' })
    });
    assert.equal(royalAvatar.response.status, 403);
    assert.equal(royalAvatar.body.requiredBadges, 15);
    const weekflareAvatar = await json('/api/profile/avatar', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ avatarTheme: 'weekflare' })
    });
    assert.equal(weekflareAvatar.response.status, 200);
    assert.equal(weekflareAvatar.body.user.avatarTheme, 'weekflare');
    const associationColumns = auditDb.prepare("PRAGMA table_info('association_accounts')").all().map(column => column.name);
    assert.equal(associationColumns.includes('number_id'), false);
    assert.equal(associationColumns.includes('user_account'), false);
    const insertRankUser = auditDb.prepare("INSERT INTO users (email, password_hash, nickname, real_name, school) VALUES (?, 'test-hash', ?, '隐私测试', '测试学校')");
    const insertRankScore = auditDb.prepare("INSERT INTO problem_completions (user_id, problem_id, points) VALUES (?, 'RANK-TEST', 1000)");
    auditDb.exec('BEGIN');
    for (let index = 1; index <= 50; index += 1) {
      const inserted = insertRankUser.run(`rank-${index}@example.com`, `Rank ${index}`);
      insertRankScore.run(inserted.lastInsertRowid);
    }
    auditDb.exec('COMMIT');
    auditDb.close();

    const publicTopFifty = await json('/api/leaderboard');
    assert.equal(publicTopFifty.body.entries.length, 50);
    assert.equal(publicTopFifty.body.entries.some(entry => entry.id === registered.body.user.id), false);
    const topFiftyAndSelf = await json('/api/leaderboard', { headers: sessionHeaders });
    const rankedSelf = topFiftyAndSelf.body.entries.find(entry => entry.id === registered.body.user.id);
    assert.equal(topFiftyAndSelf.body.entries.length, 51);
    assert.equal(rankedSelf.rank, 51);
    const unmarkedLuogu = await json('/api/practice/completion', {
      method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId: 'P1001', completed: false })
    });
    assert.equal(unmarkedLuogu.body.score, 35);
    assert.equal(unmarkedLuogu.body.completedCount, 2);

    // New topic completion must award exactly once and reverse cleanly.
    for (const problemId of ['P1614', 'P2004', 'P2367', 'P3397']) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const completed = await json('/api/practice/completion', {
          method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId, completed: true })
        });
        assert.equal(completed.response.status, 200);
        assert.equal(completed.body.score, 43);
        assert.equal(completed.body.completedCount, 3);
        assert.ok(completed.body.completed.includes(problemId));
      }
      const cancelled = await json('/api/practice/completion', {
        method: 'POST', headers: sessionHeaders, body: JSON.stringify({ problemId, completed: false })
      });
      assert.equal(cancelled.body.score, 35);
      assert.equal(cancelled.body.completedCount, 2);
    }
    const prefixProblems = (await json('/api/hydro/problems')).body.problems
      .filter(problem => problem.track === 'algorithm' && problem.topic === 'foundation' && problem.subtopic === 'prefix-sum');
    assert.deepEqual(prefixProblems.map(problem => problem.problemId).sort(), ['PX0004', 'PX0005', 'PX0009', 'ZS0025']);
    for (const problem of prefixProblems) {
      const payload = { submissionId: `prefix-${problem.problemId}`, problemId: problem.problemId, hydroUserId: '24', verdict: 'AC' };
      const before = (await json('/api/practice/progress', { headers: sessionHeaders })).body;
      const first = await json('/api/integrations/hydro/submission', {
        method: 'POST', headers: { Authorization: 'Bearer test-secret-with-enough-random-characters' }, body: JSON.stringify(payload)
      });
      assert.equal(first.response.status, 200);
      assert.equal(first.body.awarded, true);
      assert.equal(first.body.score, before.score + problem.points);
      const repeat = await json('/api/integrations/hydro/submission', {
        method: 'POST', headers: { Authorization: 'Bearer test-secret-with-enough-random-characters' },
        body: JSON.stringify({ ...payload, submissionId: `${payload.submissionId}-repeat` })
      });
      assert.equal(repeat.body.awarded, false);
      assert.equal(repeat.body.score, first.body.score);
    }
  } finally {
    console.log = originalLog;
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => bridge.close(resolve));
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
