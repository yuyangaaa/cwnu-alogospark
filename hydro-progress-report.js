import ExcelJS from 'exceljs';

export const HYDRO_PROGRESS_SCOPE = '统计本站注册用户在已上架协会 OJ 题目中的完成情况，仅 AC 算完成；同题多次通过只计一次。数据来自本站已同步的评测记录，绑定前未同步的 OJ 历史提交不在统计内。';
const trackNames = { all: '全部题单', grammar: '语法题单', algorithm: '算法题单' };
const bindingNames = { all: '全部用户', verified: '已绑定', unverified: '未完成绑定' };
const stateNames = ['未提交', '已提交未 AC', 'AC'];

export function parseHydroProgressFilters(params) {
  const track = params.get('track') || 'all';
  const binding = params.get('binding') || 'all';
  const search = (params.get('search') || '').trim();
  if (!Object.hasOwn(trackNames, track) || !Object.hasOwn(bindingNames, binding) || search.length > 80) {
    throw Object.assign(new Error('统计筛选条件不正确。'), { status: 400 });
  }
  return { track, binding, search };
}

export function createHydroProgressReport(db, filters) {
  const problems = db.prepare(`
    SELECT problem_id, title, track, url FROM hydro_problems
    WHERE active = 1 AND is_demo = 0 AND (? = 'all' OR track = ?)
    ORDER BY track, problem_id COLLATE NOCASE
  `).all(filters.track, filters.track).map(row => ({
    problemId: row.problem_id, title: row.title, track: row.track, url: row.url,
    acceptedUsers: 0, submittedUsers: 0
  }));
  const users = db.prepare(`
    SELECT u.id, u.real_name, u.nickname, u.school, u.email,
      ha.hydro_username, ha.verified
    FROM users u LEFT JOIN hydro_accounts ha ON ha.user_id = u.id
    ORDER BY u.id
  `).all().filter(row => {
    if (filters.binding === 'verified' && !row.verified) return false;
    if (filters.binding === 'unverified' && row.verified) return false;
    const search = filters.search.toLocaleLowerCase();
    return !search || [row.real_name, row.nickname, row.school, row.email, row.hydro_username]
      .some(value => String(value || '').toLocaleLowerCase().includes(search));
  });
  // Group across the complete history, rather than the recent-record dashboard's 100-row limit.
  const submissions = db.prepare(`
    SELECT hs.user_id, hs.problem_id, MAX(CASE WHEN hs.verdict = 'AC' THEN 1 ELSE 0 END) AS accepted,
      strftime('%Y-%m-%dT%H:%M:%fZ', MAX(julianday(hs.submitted_at))) AS last_submission_at
    FROM hydro_submissions hs JOIN hydro_problems hp ON hp.problem_id = hs.problem_id
    WHERE hp.active = 1 AND hp.is_demo = 0 AND (? = 'all' OR hp.track = ?)
    GROUP BY hs.user_id, hs.problem_id
  `).all(filters.track, filters.track);
  const completions = db.prepare(`
    SELECT pc.user_id, hp.problem_id FROM problem_completions pc
    JOIN hydro_problems hp ON pc.problem_id = 'HYDRO:' || hp.problem_id
    WHERE hp.active = 1 AND hp.is_demo = 0 AND (? = 'all' OR hp.track = ?)
  `).all(filters.track, filters.track);
  const userProgress = new Map(users.map(row => [row.id, { states: new Map(), lastSubmissionAt: null }]));
  for (const row of submissions) {
    const progress = userProgress.get(row.user_id);
    if (!progress) continue;
    progress.states.set(row.problem_id, row.accepted ? 2 : 1);
    if (row.last_submission_at && (!progress.lastSubmissionAt || row.last_submission_at > progress.lastSubmissionAt)) {
      progress.lastSubmissionAt = row.last_submission_at;
    }
  }
  for (const row of completions) userProgress.get(row.user_id)?.states.set(row.problem_id, 2);
  const rows = users.map(user => {
    const progress = userProgress.get(user.id);
    const states = problems.map(problem => progress.states.get(problem.problemId) || 0);
    const completedCount = states.filter(state => state === 2).length;
    return {
      userId: user.id, realName: user.real_name, nickname: user.nickname, school: user.school,
      email: user.email, hydroUsername: user.hydro_username || '', verified: Boolean(user.verified),
      bindingStatus: user.verified ? '已绑定' : user.hydro_username ? '待验证' : '未绑定',
      completedCount, submittedCount: states.filter(Boolean).length,
      remainingCount: problems.length - completedCount,
      completionRate: problems.length ? completedCount / problems.length : 0,
      lastSubmissionAt: progress.lastSubmissionAt, states
    };
  }).sort((a, b) => b.completedCount - a.completedCount || a.realName.localeCompare(b.realName, 'zh-CN') || a.userId - b.userId);
  rows.forEach(row => row.states.forEach((state, index) => {
    if (state) problems[index].submittedUsers++;
    if (state === 2) problems[index].acceptedUsers++;
  }));
  return {
    generatedAt: new Date().toISOString(), scope: HYDRO_PROGRESS_SCOPE, filters, problems, rows,
    stats: { users: rows.length, verifiedUsers: rows.filter(row => row.verified).length,
      participants: rows.filter(row => row.submittedCount).length, problems: problems.length,
      completedPairs: rows.reduce((sum, row) => sum + row.completedCount, 0) }
  };
}

function formatTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .format(new Date(value));
}

function addTable(workbook, name, headers, widths, rows, frozenColumns = 0) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', xSplit: frozenColumns, ySplit: 1 }] });
  sheet.columns = headers.map((header, index) => ({ header, width: widths[index] || 17 }));
  sheet.addRows(rows);
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheet.rowCount, 1), column: headers.length } };
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6750B7' } };
  });
  sheet.eachRow(row => row.eachCell(cell => {
    cell.alignment = { vertical: 'middle', wrapText: true };
  }));
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return sheet;
}

export async function createHydroProgressWorkbook(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AlgoSpark';
  workbook.created = new Date(report.generatedAt);
  const identityHeaders = ['用户编号', '姓名', '昵称', '学校', '邮箱', '协会 OJ 账号', '绑定状态'];
  const identityWidths = [12, 16, 18, 25, 32, 22, 14];
  const identity = row => [row.userId, row.realName, row.nickname, row.school, row.email, row.hydroUsername, row.bindingStatus];
  const summary = addTable(workbook, '学员汇总', [...identityHeaders, '完成题数', '已提交题数', '未完成题数', '题目总数', '完成率', '最近提交（北京时间）'],
    [...identityWidths, 14, 16, 16, 14, 14, 26], report.rows.map(row => [...identity(row), row.completedCount,
      row.submittedCount, row.remainingCount, report.problems.length, row.completionRate, formatTime(row.lastSubmissionAt)]), 2);
  summary.getColumn(12).numFmt = '0.0%';
  const matrix = addTable(workbook, '逐题完成情况', [...identityHeaders, ...report.problems.map(problem => `${problem.problemId}\n${problem.title}`)],
    [...identityWidths, ...report.problems.map(() => 20)], report.rows.map(row => [...identity(row), ...row.states.map(state => stateNames[state])]), 2);
  matrix.getRow(1).height = 60;
  report.rows.forEach((row, rowIndex) => row.states.forEach((state, index) => {
    if (!state) return;
    const cell = matrix.getCell(rowIndex + 2, index + 8);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: state === 2 ? 'FFDDF2E3' : 'FFFFF0CD' } };
  }));
  addTable(workbook, '题目统计', ['题号', '题目名称', '题单', '已完成人数', '已提交人数', '统计人数', '题目链接'],
    [16, 36, 16, 16, 16, 16, 55], report.problems.map(problem => [problem.problemId, problem.title,
      trackNames[problem.track] || problem.track, problem.acceptedUsers, problem.submittedUsers, report.rows.length, problem.url]));
  addTable(workbook, '统计说明', ['项目', '说明'], [24, 100], [
    ['导出时间（北京时间）', formatTime(report.generatedAt)], ['统计范围', report.scope],
    ['题单筛选', trackNames[report.filters.track]], ['绑定筛选', bindingNames[report.filters.binding]],
    ['搜索条件', report.filters.search || '无'], ['状态说明', 'AC：已通过；已提交未 AC：已有提交但尚未通过（含评测中）；未提交：本站没有该题的同步记录。'],
    ['未绑定用户', '保留未绑定、待验证和零完成用户，方便核对培训名单。'],
    ['题目范围', '只包含本站已上架的协会 OJ 题目，演示题和已下架题目不计入。']
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
