import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';

test('training report counts unique ACs across all history, exports filtered workbooks, and requires admin', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'algospark-progress-'));
  process.env.DATA_DIR = dataDir;
  process.env.NODE_ENV = 'test';
  process.env.HYDRO_DEMO_MODE = 'false';
  process.env.ADMIN_EMAILS = '';
  const { server, closeDatabase } = await import(`../server.js?report=${Date.now()}`);
  const db = new DatabaseSync(join(dataDir, 'algospark.db'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const adminToken = 'report-test-admin-session';
  const studentToken = 'report-test-student-session';
  const adminHeaders = { Cookie: `algospark_session=${adminToken}` };
  try {
    db.exec('DELETE FROM hydro_problems;');
    const addUser = db.prepare('INSERT INTO users (email,password_hash,nickname,real_name,school) VALUES (?,?,?,?,?)');
    addUser.run('teacher@example.com', 'unused', '培训老师', '老师', '测试学校');
    addUser.run('student@example.com', 'unused', '学员甲', '=1+1', '测试学校');
    addUser.run('pending@example.com', 'unused', '学员乙', '小乙', '另一学校');
    addUser.run('zero@example.com', 'unused', '学员丙', '小丙', '测试学校');
    db.prepare('INSERT INTO user_roles (user_id,role) VALUES (?,?)').run(1, 'admin');
    const addSession = db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)');
    addSession.run(createHash('sha256').update(adminToken).digest('hex'), 1, Date.now() + 3600000);
    addSession.run(createHash('sha256').update(studentToken).digest('hex'), 2, Date.now() + 3600000);
    const addProblem = db.prepare('INSERT INTO hydro_problems (problem_id,title,points,track,active,is_demo,url) VALUES (?,?,10,?,?,?,?)');
    addProblem.run('AS1001', '语法一', 'grammar', 1, 0, 'https://oj.example/p/AS1001');
    addProblem.run('AS1002', '语法二', 'grammar', 1, 0, '');
    addProblem.run('AL2001', '算法一', 'algorithm', 1, 0, '');
    addProblem.run('DEMO1', '演示题', 'grammar', 1, 1, '');
    addProblem.run('HIDDEN1', '下架题', 'grammar', 0, 0, '');
    db.prepare('INSERT INTO hydro_accounts (user_id,hydro_username,hydro_user_id,verified) VALUES (?,?,?,?)').run(2, 'oj-student', '24', 1);
    db.prepare('INSERT INTO hydro_accounts (user_id,hydro_username,verified) VALUES (?,?,?)').run(3, 'oj-pending', 0);
    const addSubmission = db.prepare('INSERT INTO hydro_submissions (submission_id,user_id,problem_id,verdict,submitted_at) VALUES (?,?,?,?,?)');
    addSubmission.run('old-ac', 2, 'AS1001', 'AC', '2026-10-01T00:00:00Z');
    addSubmission.run('duplicate-ac', 2, 'AS1001', 'AC', '2026-10-01T00:00:01Z');
    addSubmission.run('algorithm-wa', 2, 'AL2001', 'WA', '2026-10-02T00:00:00Z');
    addSubmission.run('pending-wait', 3, 'AS1002', 'WAITING', '2026-10-02 00:00:01');
    addSubmission.run('demo-ac', 2, 'DEMO1', 'AC', '2026-10-03T00:00:00Z');
    addSubmission.run('hidden-ac', 2, 'HIDDEN1', 'AC', '2026-10-03T00:00:00Z');
    // More than 100 recent wrong submissions must not hide an older accepted record.
    for (let i = 0; i < 105; i++) addSubmission.run(`recent-wa-${i}`, 2, 'AS1001', 'WA', '2026-10-02T08:00:00Z');
    const addCompletion = db.prepare('INSERT INTO problem_completions (user_id,problem_id,points) VALUES (?,?,10)');
    addCompletion.run(2, 'HYDRO:AS1001');
    addCompletion.run(2, 'HYDRO:AS1002'); // canonical AC retained even if the original record is no longer available
    addCompletion.run(2, 'HYDRO:DEMO1');
    addCompletion.run(2, 'HYDRO:HIDDEN1');
    addCompletion.run(2, 'B2002'); // manually marked Luogu progress must not count

    for (const path of ['/api/admin/hydro/progress', '/api/admin/hydro/progress/export']) {
      assert.equal((await fetch(base + path)).status, 401);
      assert.equal((await fetch(base + path, { headers: { Cookie: `algospark_session=${studentToken}` } })).status, 403);
    }
    const response = await fetch(base + '/api/admin/hydro/progress', { headers: adminHeaders });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const report = await response.json();
    assert.deepEqual(report.stats, { users: 4, verifiedUsers: 1, participants: 2, problems: 3, completedPairs: 2 });
    const student = report.rows.find(row => row.userId === 2);
    assert.equal(student.completedCount, 2);
    assert.equal(student.submittedCount, 3);
    assert.equal(student.remainingCount, 1);
    assert.equal(student.completionRate, 2 / 3);
    assert.equal(student.lastSubmissionAt, '2026-10-02T08:00:00.000Z');
    assert.deepEqual(student.states, [1, 2, 2]); // algorithm first, then grammar
    assert.equal(report.rows.find(row => row.userId === 3).bindingStatus, '待验证');
    assert.deepEqual(report.rows.find(row => row.userId === 4).states, [0, 0, 0]);
    assert.equal(report.problems.find(problem => problem.problemId === 'AS1001').acceptedUsers, 1);

    const filter = '?track=grammar&binding=verified&search=OJ-STUDENT';
    const filtered = await (await fetch(base + '/api/admin/hydro/progress' + filter, { headers: adminHeaders })).json();
    assert.equal(filtered.rows.length, 1);
    assert.equal(filtered.stats.problems, 2);
    assert.equal(filtered.rows[0].completionRate, 1);
    const exported = await fetch(base + '/api/admin/hydro/progress/export' + filter, { headers: adminHeaders });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get('cache-control'), 'private, no-store');
    assert.match(exported.headers.get('content-disposition'), /attachment; filename=".*\.xlsx"/);
    assert.match(exported.headers.get('content-type'), /spreadsheetml.sheet/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await exported.arrayBuffer()));
    assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['学员汇总', '逐题完成情况', '题目统计', '统计说明']);
    const summary = workbook.getWorksheet('学员汇总');
    assert.equal(summary.rowCount, 2);
    assert.equal(summary.getCell('B2').value, '=1+1'); // a name starting '=' remains text, never a formula
    assert.equal(summary.getCell('B2').type, ExcelJS.ValueType.String);
    assert.equal(summary.getCell('H2').value, 2);
    assert.equal(summary.getCell('K2').value, 2);
    assert.equal(summary.getCell('L2').value, 1);
    assert.equal(summary.getCell('L2').numFmt, '0.0%');
    assert.equal(summary.getCell('M2').value, '2026/10/02 16:00:00');
    assert.equal(workbook.getWorksheet('逐题完成情况').getCell('H2').value, 'AC');
    assert.equal(workbook.getWorksheet('逐题完成情况').getCell('I2').value, 'AC');
    assert.equal(workbook.getWorksheet('题目统计').getCell('D2').value, 1);
    assert.equal(workbook.getWorksheet('题目统计').getCell('F2').value, 1);
    assert.match(workbook.getWorksheet('统计说明').getCell('B3').value, /绑定前未同步/);

    const unbound = await (await fetch(base + '/api/admin/hydro/progress?binding=unverified', { headers: adminHeaders })).json();
    assert.equal(unbound.rows.length, 3);
    const empty = await fetch(base + '/api/admin/hydro/progress/export?search=nobody', { headers: adminHeaders });
    const emptyWorkbook = new ExcelJS.Workbook();
    await emptyWorkbook.xlsx.load(Buffer.from(await empty.arrayBuffer()));
    assert.equal(emptyWorkbook.getWorksheet('学员汇总').rowCount, 1);
    for (const query of ['?track=bad', '?binding=bad', `?search=${'x'.repeat(81)}`]) {
      assert.equal((await fetch(base + '/api/admin/hydro/progress' + query, { headers: adminHeaders })).status, 400);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
