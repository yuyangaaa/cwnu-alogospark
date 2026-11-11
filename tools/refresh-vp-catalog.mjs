import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { calculateMedalLines } from './vp-medals.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, 'backups', 'vp-research-20261101');
mkdirSync(cache, { recursive: true });
async function json(url, cacheName) {
  const path = join(cache, cacheName);
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch {}
  const response = await fetch(url, { signal: AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const value = await response.json();
  writeFileSync(path, JSON.stringify(value));
  return value;
}
const gyms = await json('https://codeforces.com/api/contest.list?gym=true', 'cf-api.json');
const gymMap = new Map(gyms.result.map(contest => [contest.id, contest]));
const onsiteStatements = JSON.parse(readFileSync(join(root, 'vp-onsite-statements.json'), 'utf8'));
const medalOverrides = JSON.parse(readFileSync(join(root, 'vp-medal-overrides.json'), 'utf8'));
// Original contest years are used, not the date of a later Gym/Universal Cup replay.
// [year, series, city, type, CF Gym ID, XCPC Board path, optional SUA slug]
const seeds = [
  [2024,'ICPC','武汉','邀请赛',105143,'icpc/49th/wuhan-invitational'],
  [2024,'CCPC','郑州','邀请赛',105158,'ccpc/10th/zhengzhou-invitational'],
  [2024,'CCPC','长春','邀请赛',105170,'ccpc/10th/changchun-invitational'],
  [2024,'CCPC','东北','邀请赛',105173,'ccpc/10th/northeast-invitational'],
  [2024,'CCPC','山东','邀请赛',105385,'provincial-contest/2024/shandong','2024-ccpc-invitational-shandong'],
  [2024,'ICPC','昆明','邀请赛',105386,'icpc/49th/kunming-invitational','2024-icpc-invitational-kunming'],
  [2024,'CCPC','哈尔滨','区域赛',105459,'ccpc/10th/harbin'],
  [2024,'ICPC','南京','区域赛',105484,'icpc/49th/nanjing','2024-icpc-nanjing'],
  [2024,'ICPC','成都','区域赛',105486,'icpc/49th/chengdu'],
  [2024,'CCPC','济南','区域赛',105540,'ccpc/10th/jinan'],
  [2024,'ICPC','沈阳','区域赛',105578,'icpc/49th/shenyang'],
  [2024,'ICPC','昆明','区域赛',105588,'icpc/49th/kunming'],
  [2024,'CCPC','郑州','区域赛',105632,'ccpc/10th/zhengzhou'],
  [2024,'ICPC','杭州','区域赛',105657,'icpc/49th/hangzhou'],
  [2024,'CCPC','重庆','区域赛',106030,'ccpc/10th/chongqing'],
  [2025,'ICPC','武汉','邀请赛',105901,'icpc/50th/wuhan-invitational','2025-icpc-invitational-wuhan'],
  [2025,'ICPC','南昌','邀请赛',105911,'icpc/50th/nanchang-invitational'],
  [2025,'CCPC','东北','邀请赛',105924,'ccpc/11th/northeastern'],
  [2025,'CCPC','郑州','邀请赛',105941,'ccpc/11th/zhengzhou-invitational'],
  [2025,'CCPC','福建','邀请赛',105977,'ccpc/11th/fujian-invitational'],
  [2025,'ICPC','成都','区域赛',106161,'icpc/50th/chengdu'],
  [2025,'ICPC','沈阳','区域赛',106252,'icpc/50th/shenyang'],
  [2025,'ICPC','南京','区域赛',null,'icpc/50th/nanjing','2025-icpc-nanjing'],
  [2026,'ICPC','深圳','邀请赛',null,'icpc/51st/shenzhen-invitational','2026-icpc-invitational-shenzhen'],
  [2026,'ICPC','南昌','邀请赛',106551,'icpc/51st/jiangxi-invitational'],
  [2026,'CCPC','福建','邀请赛',106565,'ccpc/12th/fujian-invitational'],
  [2026,'CCPC','秦皇岛','邀请赛',106695,'ccpc/12th/qinhuangdao-invitational'],
  [2026,'CCPC','南昌','邀请赛',106696,'ccpc/12th/nanchang-invitational'],
];
const qoj = { '2024-ccpc-invitational-shandong':1801, '2024-icpc-invitational-kunming':1802, '2024-icpc-nanjing':1828, '2025-icpc-invitational-wuhan':2025, '2025-icpc-nanjing':2581, '2026-icpc-invitational-shenzhen':3588 };
const dates = { '2024-ccpc-invitational-shandong':'2024-05-26', '2024-icpc-invitational-kunming':'2024-05-26', '2024-icpc-nanjing':'2024-11-03', '2025-icpc-invitational-wuhan':'2025-04-27', '2025-icpc-nanjing':'2025-11-09', '2026-icpc-invitational-shenzhen':'2026-04-11' };
const pdfs = {
  105143:[['中文','25359/contest-wuhan-zh.pdf'],['英文','25360/contest-wuhan-en.pdf']],
  105158:[['中文','25503/problemset_codeforces.pdf']],
  105170:[['英文','25590/statements.pdf']],
  105173:[['中文','25613/statement.pdf']],
  105459:[['英文','27940/statement(harbin)-en.pdf'],['中文','27944/ccpc-statement-final.pdf']],
  105486:[['英文','28065/contest-45695-en.pdf']],
  105578:[['英文','28637/2024-shenyang-statement-en.pdf'],['中文','28638/2024-shenyang-statement-zh.pdf']],
  105588:[['英文','28813/1-statement-english.pdf'],['中文','28814/2-statement-chinese.pdf']],
  105540:[['中文','28380/jinan-zh-cn-fix1.pdf']],
  105632:[['英文','29065/contest-46935-en.pdf']],
  105657:[['英文','29538/contest-43074-en.pdf']],
  106030:[['中文','32796/day1.pdf']],
  105911:[['英文','31649/2025%20ICPC%20Nanchang%20Invitational%20Statement.pdf']],
  105924:[['中文','31726/final.pdf']],
  105941:[['中文','31813/%E6%AD%A3%E5%BC%8F%E8%B5%9B%E9%A2%98%E9%9D%A2.pdf']],
  105977:[['中文','32243/statements.pdf']],
  106161:[['英文','34102/contest.en-cf.pdf']],
  106252:[['英文','34720/contest_en.pdf'],['中文','34721/contest_zh.pdf']],
  106551:[['中文','37847/statements-zh.pdf'],['英文','37848/statements-en.pdf']],
  106565:[['中文','37939/official.pdf']],
};
async function build(seed) {
  const [year, series, city, type, gymId, boardPath, sua] = seed;
  const gym = gymId ? gymMap.get(gymId) : null;
  if (gymId && !gym) throw new Error(`Unverified Gym ${gymId}`);
  const contest = {
    id: `${year}-${series.toLowerCase()}-${boardPath.split('/').at(-1)}`,
    year, series, title:`${year} ${series} ${type === '区域赛' ? (series === 'ICPC' ? '亚洲区域赛' : '区域赛') : '全国邀请赛'} · ${city}`,
    englishTitle:gym?.name || '', tags:[type], date: dates[sua] || null,
    durationMinutes:300, problemCount:null,
    cfUrl:gymId ? `https://codeforces.com/gym/${gymId}` : null,
    qojUrl:qoj[sua] ? `https://qoj.ac/contest/${qoj[sua]}` : null,
    statements:sua ? [['英文','en'],['中文','zh']].map(([language,code]) => ({language,url:`https://sua.ac/wiki/${sua}/contest-${code}.pdf`})) : (pdfs[gymId] || []).map(([language,path]) => ({language,url:`https://codeforces.com/gym/${gymId}/attachments/download/${path}`})),
    boardUrl:null, medals:null,
    sourceUrl:sua ? `https://sua.ac/wiki/${sua}/` : `https://codeforces.com/gym/${gymId}/attachments?locale=en`,
    verifiedAt:'2026-11-01'
  };
  contest.onsiteStatements = onsiteStatements[contest.id] || null;
  if (contest.onsiteStatements) contest.verifiedAt = contest.onsiteStatements.verifiedAt;
  // Same original contest, archived by an unofficial CF mirror; retain the
  // established primary Gym and stable ID while exposing the missing PDF.
  if (contest.id === '2026-ccpc-nanchang-invitational') contest.statements.push({
    language:'中文',
    url:'https://codeforces.com/gym/106554/attachments/download/37873/statements.pdf',
    sourceLabel:'同场比赛的非官方镜像附件'
  });
  try {
    const base = `https://board.xcpcio.com/data/${boardPath}/`;
    const key = boardPath.replaceAll('/','-');
    const config = await json(`${base}config.json`,`${key}-config.json`);
    // A successful matching original-event config is required before using a board.
    if (!config.contest_name.includes(city) && !(city === '福建' && config.contest_name.includes('福州'))) throw new Error('Board title mismatch');
    contest.boardUrl = `https://board.xcpcio.com/${boardPath}`;
    const epochDivisor = config.start_time > 100_000_000_000 ? 1000 : 1;
    const date = new Date(config.start_time / epochDivisor * 1000 + 8 * 3600 * 1000).toISOString().slice(0,10);
    if (Number(date.slice(0,4)) !== year) throw new Error('Original-event year mismatch');
    contest.date = date;
    contest.durationMinutes = (config.end_time-config.start_time)/epochDivisor/60;
    contest.problemCount = config.problem_quantity ?? config.problems.length;
    if (config.medal?.official || config.medal === 'ccpc') {
      const [teams,runs] = await Promise.all([json(`${base}team.json`,`${key}-team.json`),json(`${base}run.json`,`${key}-run.json`)]);
      contest.medals = calculateMedalLines(config,teams,runs);
      if (contest.medals) contest.medalSource = { configUrl:`${base}config.json`, teamsUrl:`${base}team.json`, runsUrl:`${base}run.json`, group:'official', penaltyRule:config.options?.calculation_of_penalty || 'in_minutes', method:config.medal === 'ccpc' ? 'board-ccpc-preset-final-cutoff' : 'official-quota-final-cutoff' };
    }
  } catch (error) { console.log(`Board unavailable for ${year} ${series} ${city} ${type}: ${error.message}`); }
  return Object.assign(contest, medalOverrides[contest.id]);
}
const contests = [];
// Keep requests bounded. Cached verified source files are reused.
for (let i=0;i<seeds.length;i+=4) contests.push(...await Promise.all(seeds.slice(i,i+4).map(build)));
// Complete reviewed entries also cover events archived outside CF/XCPCIO.
for (const reviewed of Object.values(medalOverrides)) {
  if (reviewed.id && !contests.some(contest => contest.id === reviewed.id)) {
    contests.push({ ...reviewed, onsiteStatements: onsiteStatements[reviewed.id] || null });
  }
}
contests.sort((a,b) => a.year-b.year || (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id));
const output = { verifiedAt:'2026-11-06', years:[2026,2025,2024], contests };
writeFileSync(join(root,'vp-contests.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({ contests:contests.length, pdf:contests.filter(c=>c.statements.length).length, medals:contests.filter(c=>c.medals).length, boards:contests.filter(c=>c.boardUrl).length }));
