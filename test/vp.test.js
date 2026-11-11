import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { calculateMedalLines, calculateStandings } from '../tools/vp-medals.mjs';

test('VP catalog keeps stable unique IDs, verified links, years, and explicit missing data', () => {
  const data = JSON.parse(readFileSync(new URL('../vp-contests.json', import.meta.url), 'utf8'));
  assert.deepEqual([...new Set(data.contests.map(c => c.year))].sort(), [2024, 2025, 2026]);
  assert.equal(new Set(data.contests.map(c => c.id)).size, data.contests.length);
  for (const c of data.contests) {
    assert.ok(c.tags.some(tag => ['邀请赛', '区域赛'].includes(tag)));
    if (c.cfUrl) assert.match(c.cfUrl, /^https:\/\/codeforces\.com\/gym\/\d+$/);
    assert.ok(c.sourceUrl.startsWith('https://'));
    if (c.date) assert.equal(Number(c.date.slice(0, 4)), c.year);
    for (const pdf of c.statements) {
      assert.ok(['中文', '英文'].includes(pdf.language));
      assert.equal(new URL(pdf.url).protocol, 'https:');
      const url = new URL(pdf.url);
      assert.ok(url.pathname.endsWith('.pdf') || url.pathname.endsWith('/download.php') && url.searchParams.get('type') === 'attachments');
    }
    if (c.medals) {
      assert.ok(c.medalSource);
      assert.ok(c.medals.gold.solved >= c.medals.silver.solved);
      assert.ok(c.medals.silver.solved >= c.medals.bronze.solved);
      for (const line of Object.values(c.medals)) {
        assert.ok(Number.isInteger(line.penaltySeconds) && line.penaltySeconds >= 0);
        assert.equal(line.penaltyMinutes, Math.floor(line.penaltySeconds/60));
        assert.ok(line.teamId);
      }
    }
    if (c.onsiteStatements) {
      assert.ok(c.onsiteStatements.sourceUrl.startsWith('https://'));
      for (const key of ['englishCopies','chineseCopies']) assert.ok(c.onsiteStatements[key] === null || Number.isInteger(c.onsiteStatements[key]) && c.onsiteStatements[key]>=0);
      for (const language of c.onsiteStatements.confirmedLanguages || []) {
        assert.ok(['英文','中文'].includes(language));
        assert.notEqual(c.onsiteStatements[language === '英文' ? 'englishCopies' : 'chineseCopies'],0);
      }
    }
  }
  assert.equal(data.contests.length,32);
  assert.equal(data.contests.filter(c=>c.medals).length,31);
  const nanjing=data.contests.find(c=>c.id==='2024-icpc-nanjing');
  assert.deepEqual(['gold','silver','bronze'].map(key=>[nanjing.medals[key].solved,nanjing.medals[key].penaltyMinutes]),[[5,645],[4,606],[3,406]]);
  const shandong=data.contests.find(c=>c.id==='2024-ccpc-shandong');
  assert.deepEqual(Object.values(shandong.medals).map(line=>[line.solved,line.penaltyMinutes]),[[7,568],[7,1512],[5,758]]);
  const zhengzhou=data.contests.find(c=>c.id==='2024-ccpc-zhengzhou');
  assert.deepEqual([zhengzhou.medals.bronze.rank,zhengzhou.medals.bronze.penaltyMinutes],[166,856]);
  assert.match(zhengzhou.statements[0].sourceLabel,/UCup/);
  assert.equal(zhengzhou.statementPages.length,2);
  assert.ok(zhengzhou.statementPages.every(page=>page.language==='中文' && new URL(page.url).protocol==='https:'));
  assert.equal(zhengzhou.onsiteStatements.sourceKind,'contest-booklet');
  assert.deepEqual([zhengzhou.onsiteStatements.englishCopies,zhengzhou.onsiteStatements.chineseCopies],[null,null]);
  const northeast=data.contests.find(c=>c.id==='2024-ccpc-northeast-invitational');
  assert.equal(northeast.medals,null);
  assert.ok(northeast.boardUrl);
});

test('onsite research preserves unknown counts separately from confirmed absence and PDF languages', () => {
  const {contests}=JSON.parse(readFileSync(new URL('../vp-contests.json', import.meta.url),'utf8'));
  const research=JSON.parse(readFileSync(new URL('../vp-onsite-statements.json', import.meta.url),'utf8'));
  for (const c of contests) assert.deepEqual(c.onsiteStatements,research[c.id] || null);
  const paper=id=>contests.find(c=>c.id===id).onsiteStatements;
  assert.deepEqual([paper('2024-icpc-kunming').englishCopies,paper('2024-icpc-kunming').chineseCopies],[3,1]);
  assert.deepEqual([paper('2026-icpc-shenzhen-invitational').englishCopies,paper('2026-icpc-shenzhen-invitational').chineseCopies],[1,2]);
  assert.deepEqual([paper('2024-icpc-hangzhou').englishCopies,paper('2024-icpc-hangzhou').chineseCopies],[null,0]);
  assert.deepEqual([paper('2025-icpc-wuhan-invitational').englishCopies,paper('2025-icpc-wuhan-invitational').chineseCopies],[null,1]);
  assert.deepEqual(paper('2025-icpc-shenyang').confirmedLanguages,['英文','中文']);
  assert.equal(paper('2025-icpc-shenyang').englishCopies,null);
  // Available PDFs, preparation plans and warm-up reports do not establish a
  // formal contest's paper allocation.
  assert.deepEqual([paper('2024-icpc-nanjing').englishCopies,paper('2024-icpc-nanjing').chineseCopies],[null,1]);
  assert.deepEqual(paper('2025-icpc-nanjing').confirmedLanguages,['英文','中文']);
  assert.deepEqual(paper('2024-icpc-chengdu').confirmedLanguages,['英文']);
  assert.equal(paper('2024-ccpc-shandong').sourceKind,'contest-booklet');
  assert.equal(paper('2026-ccpc-fujian-invitational').sourceKind,'online-contest');
  assert.deepEqual([paper('2024-icpc-xian-invitational').englishCopies,paper('2024-icpc-xian-invitational').chineseCopies],[3,0]);
  assert.equal(paper('2025-ccpc-northeastern').sourceKind,'organizer-report');
  assert.deepEqual([paper('2025-icpc-shanghai').englishCopies,paper('2025-icpc-shanghai').chineseCopies],[null,0]);
  assert.equal(paper('2025-icpc-shanghai').sourceKind,'participant-report');
  assert.deepEqual([paper('2025-icpc-nanjing').englishCopies,paper('2025-icpc-nanjing').chineseCopies],[3,1]);
  assert.equal(paper('2025-icpc-nanjing').sourceKind,'official-manual');
  assert.equal(paper('2025-ccpc-fujian-invitational').sourceKind,'online-contest');
  assert.deepEqual([paper('2025-ccpc-fujian-invitational').englishCopies,paper('2025-ccpc-fujian-invitational').chineseCopies],[null,null]);
});

test('medal lines exclude unofficial teams, duplicates, invalid problems and post-contest submissions', () => {
  const config = { start_time: 100, end_time: 110, problems: [{id:'A'}, {id:'B'}, {id:'C'}], options: { submission_timestamp_unit:'millisecond' }, medal: { official:{gold:1,silver:1,bronze:1} } };
  const teams = ['a','b','c'].map(team_id => ({team_id, group:['official']})).concat({team_id:'star',group:['unofficial']});
  const run = (team_id,problem_id,timestamp=1000,status='ACCEPTED') => ({team_id,problem_id,timestamp,status});
  const runs = [run('a','A'),run('a','B'),run('a','C'),run('b','A'),run('b','B'),run('c','A'),run('a','A'),run('c','C',10000),run('c','X'),run('c','B',-1),run('c','B',500,'WRONG_ANSWER'),run('star','A'),run('star','B'),run('star','C')];
  const lines=calculateMedalLines(config,teams,runs);
  assert.deepEqual(Object.fromEntries(Object.entries(lines).map(([key,line])=>[key,{solved:line.solved,rank:line.rank,penaltyMinutes:line.penaltyMinutes}])), {gold:{solved:3,rank:1,penaltyMinutes:0},silver:{solved:2,rank:2,penaltyMinutes:0},bronze:{solved:1,rank:3,penaltyMinutes:0}});
  const modernConfig = {...config,start_time:1761441000000,end_time:1761441010000};
  assert.deepEqual(calculateMedalLines(modernConfig,teams.map(({team_id,...team})=>({...team,id:team_id})),runs),calculateMedalLines(config,teams,runs));
  assert.equal(calculateMedalLines({...config,medal:'ccpc'},teams,runs),null);
  assert.equal(calculateMedalLines({...config,medal:{official:{gold:5,silver:1,bronze:1}}},teams,runs),null);
});

test('penalty uses only failures before the first AC and follows all three original rounding rules', () => {
  const config={start_time:0,end_time:18000,penalty:1200,problems:[{id:'A'},{id:'B'},{id:'C'}],options:{submission_timestamp_unit:'millisecond'}};
  const teams=[{id:'a',group:['official']}];
  const run=(problem_id,timestamp,status='ACCEPTED',extra={})=>({team_id:'a',problem_id,timestamp,status,...extra});
  // Unordered input, CE/ignored WA, duplicated and post-AC submissions, and
  // an unsolved problem's failures must not inflate the actual score.
  const runs=[run('A',119999),run('B',179999),run('A',5000,'COMPILATION_ERROR'),run('A',10000,'WRONG_ANSWER'),run('A',120000,'WRONG_ANSWER'),run('A',120000),run('B',20000,'WRONG_ANSWER',{is_ignore:true}),run('C',1000,'WRONG_ANSWER'),run('C',18000000)];
  const score=rule=>calculateStandings({...config,options:{...config.options,calculation_of_penalty:rule}},teams,runs)[0];
  assert.equal(score('in_minutes').penaltySeconds,23*60);
  assert.equal(score('in_seconds').penaltySeconds,1498);
  assert.equal(score('accumulate_in_seconds_and_finally_to_the_minute').penaltySeconds,24*60);
  assert.equal(score('in_minutes').solved,2);
});

test('official rank compares penalty then last AC, preserves ties, and applies CCPC preset quotas', () => {
  const config={start_time:0,end_time:18000,problems:[{id:'A'},{id:'B'}],medal:{official:{gold:1,silver:1,bronze:1}}};
  const teams=['a','b','c','d'].map(id=>({id,group:['official']}));
  const run=(team_id,problem_id,timestamp)=>({team_id,problem_id,timestamp,status:'ACCEPTED'});
  const runs=[run('a','A',60),run('a','B',240),run('b','A',120),run('b','B',180),run('c','A',120),run('c','B',180),run('d','A',60),run('d','B',300)];
  assert.deepEqual(calculateStandings(config,teams,runs).map(t=>[t.teamId,t.rank]),[['b',1],['c',1],['a',3],['d',4]]);
  assert.equal(calculateMedalLines(config,teams,runs).gold.penaltyMinutes,5);
  assert.equal(calculateMedalLines(config,teams,runs).silver.rank,1);
  assert.equal(calculateMedalLines(config,teams,runs).bronze.rank,3);
  const ten=Array.from({length:10},(_,i)=>({id:String(i),group:['official']}));
  const preset=calculateMedalLines({...config,medal:'ccpc'},ten,ten.map((t,i)=>run(t.id,'A',(i+1)*60)));
  assert.deepEqual(['gold','silver','bronze'].map(k=>[preset[k].rank,preset[k].penaltyMinutes]),[[1,1],[3,3],[6,6]]);
  assert.equal(calculateMedalLines(config,teams,[...runs,{team_id:'d',problem_id:'X',timestamp:1,status:'PENDING'}]).gold.penaltyMinutes,5);
  assert.equal(calculateMedalLines({...config,problems:[...config.problems,{id:'C'}]},teams,[...runs,{team_id:'d',problem_id:'C',timestamp:1,status:'PENDING'}]),null);
});

test('VP progress is authenticated, persistent, idempotent, account-isolated and does not award points', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'algospark-vp-'));
  process.env.DATA_DIR = dataDir;
  process.env.HYDRO_DEMO_MODE = 'false';
  process.env.NODE_ENV = 'test';
  const module = await import(`../server.js?vp=${Date.now()}`);
  const { server, closeDatabase } = module;
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dbPath = join(dataDir,'algospark.db');
  const fixture = new DatabaseSync(dbPath);
  for (const id of [1,2]) {
    fixture.prepare('INSERT INTO users (id,email,password_hash,nickname,real_name,school) VALUES (?,?,?,?,?,?)').run(id,`vp${id}@example.invalid`,'unused',`VP${id}`,'测试用户','测试学校');
    fixture.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(createHash('sha256').update(`vp-session-${id}`).digest('hex'),id,Date.now()+60000);
  }
  const request = async (path,{user,body,method}={}) => {
    const response = await fetch(base+path,{method:method || (body === undefined ? 'GET':'POST'),headers:{'Content-Type':'application/json',...(user?{Cookie:`algospark_session=vp-session-${user}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  try {
    const catalog = await request('/api/vp/contests');
    assert.equal(catalog.status,200);
    const contestId = '2025-icpc-wuhan';
    const pdf = await fetch(base+'/vp-2025-icpc-shanghai-en.pdf');
    assert.equal(pdf.status,200);
    assert.equal(pdf.headers.get('content-type'),'application/pdf');
    assert.equal(createHash('sha256').update(Buffer.from(await pdf.arrayBuffer())).digest('hex'),'0770071548b6fab00c80ae06bec3bc32607eb1ee851e2a01a71a49ebc7f40da4');
    assert.equal((await request('/api/vp/progress')).status,401);
    assert.equal((await request('/api/vp/completion',{body:{contestId,completed:true}})).status,401);
    for (const body of [{contestId:'unknown',completed:true},{contestId,completed:'yes'},{contestId,completed:1},null]) assert.equal((await request('/api/vp/completion',{user:1,body})).status,400);
    assert.equal((await request('/api/vp/progress',{user:1})).body.completions.length,0);
    const saved = await request('/api/vp/completion',{user:1,body:{contestId,completed:true,userId:2}});
    assert.equal(saved.status,200);
    assert.equal(saved.body.completions[0].contestId,contestId);
    const again = await request('/api/vp/completion',{user:1,body:{contestId,completed:true}});
    assert.deepEqual(again.body,saved.body);
    assert.equal((await request('/api/vp/progress',{user:2})).body.completions.length,0);
    assert.equal((await request('/api/practice/progress',{user:1})).body.score,0);
    const reopened = new DatabaseSync(dbPath,{readOnly:true});
    assert.equal(reopened.prepare('SELECT count(*) AS count FROM vp_completions WHERE user_id=1').get().count,1);
    reopened.close();
    assert.equal((await request('/api/vp/completion',{user:1,method:'DELETE'})).status,405);
    assert.equal((await request('/api/vp/completion',{user:1,body:{contestId,completed:false}})).body.completions.length,0);
    assert.equal((await request('/api/vp/completion',{user:1,body:{contestId,completed:false}})).body.completions.length,0);
    assert.equal((await fetch(base+'/vp.js')).status,200);
    assert.equal((await fetch(base+'/vp.css')).status,200);
    assert.equal((await fetch(base+'/vp-contests.json')).status,404);
  } finally {
    fixture.close();
    await new Promise(resolve => server.close(resolve));
    closeDatabase();
    rmSync(dataDir,{recursive:true,force:true});
  }
});
