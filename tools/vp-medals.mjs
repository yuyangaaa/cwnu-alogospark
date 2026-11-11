// Scoring semantics verified against XCPCIO's contest-options.ts, problem.ts,
// team.ts and rank.ts: https://github.com/xcpcio/xcpcio/tree/main/packages/libs/core/src
const ACCEPTED = new Set(['ACCEPTED', 'CORRECT']);
const REJECTED = new Set(['RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'OUTPUT_LIMIT_EXCEEDED', 'IDLENESS_LIMIT_EXCEEDED', 'WRONG_ANSWER', 'REJECTED', 'NO_OUTPUT', 'JUDGEMENT_FAILED', 'HACKED']);
const IGNORED = new Set(['COMPILATION_ERROR', 'PRESENTATION_ERROR', 'CONFIGURATION_ERROR', 'SYSTEM_ERROR', 'CANCELED', 'SKIPPED', 'UNKNOWN', 'UNDEFINED']);
const PENDING = new Set(['PENDING', 'WAITING', 'COMPILING', 'JUDGING', 'FROZEN']);
const RULES = new Set(['in_minutes', 'in_seconds', 'accumulate_in_seconds_and_finally_to_the_minute']);

export function calculateStandings(config, teams, runs) {
  const epochDivisor = config.start_time > 100_000_000_000 ? 1000 : 1;
  const duration = (config.end_time - config.start_time) / epochDivisor;
  const unit = config.options?.submission_timestamp_unit ?? 'second';
  const rule = config.options?.calculation_of_penalty ?? 'in_minutes';
  const wrongPenalty = config.penalty ?? 1200;
  if (!(duration > 0) || !['second', 'millisecond'].includes(unit) || !RULES.has(rule) || !(wrongPenalty >= 0)) return null;
  const divisor = unit === 'millisecond' ? 1000 : 1;
  const scores = new Map(teams.filter(team => (team.group?.includes('official') || team.official === true) && !team.group?.includes('unofficial') && !team.unofficial).map(team => [String(team.id ?? team.team_id), { teamId:String(team.id ?? team.team_id), problems:new Map(), solved:0, penaltySeconds:0, lastAcceptedMinute:-1 }]));
  if (!scores.size) return null;
  const knownProblems = new Set(config.problems.map(problem => String(problem.id)));
  const ordered = runs.map((run,index) => ({...run,index})).sort((a,b) => a.timestamp-b.timestamp || (String(a.team_id) === String(b.team_id) ? Number(ACCEPTED.has(b.status))-Number(ACCEPTED.has(a.status)) : 0) || String(a.id ?? a.submission_id ?? a.index).localeCompare(String(b.id ?? b.submission_id ?? b.index)));
  for (const run of ordered) {
    const score = scores.get(String(run.team_id));
    const problemId = String(run.problem_id);
    if (!score || !knownProblems.has(problemId) || !Number.isFinite(run.timestamp) || run.timestamp < 0 || run.timestamp/divisor >= duration || run.is_ignore || IGNORED.has(run.status)) continue;
    let problem = score.problems.get(problemId);
    if (!problem) { problem={wrong:0, accepted:false, pending:false}; score.problems.set(problemId,problem); }
    if (problem.accepted) continue;
    if (PENDING.has(run.status)) { problem.pending=true; continue; }
    if (REJECTED.has(run.status)) { problem.wrong++; continue; }
    if (!ACCEPTED.has(run.status)) return null;
    problem.accepted=true;
    const seconds=Math.floor(run.timestamp/divisor);
    score.solved++;
    score.lastAcceptedMinute=Math.max(score.lastAcceptedMinute,Math.floor(seconds/60));
    score.penaltySeconds+=(rule === 'in_minutes' ? Math.floor(seconds/60)*60 : seconds)+problem.wrong*wrongPenalty;
  }
  const sorted=[...scores.values()];
  if (sorted.some(score => [...score.problems.values()].some(problem => problem.pending && !problem.accepted))) return null;
  for (const score of sorted) if (rule === 'accumulate_in_seconds_and_finally_to_the_minute') score.penaltySeconds=Math.floor(score.penaltySeconds/60)*60;
  sorted.sort((a,b)=>b.solved-a.solved || a.penaltySeconds-b.penaltySeconds || a.lastAcceptedMinute-b.lastAcceptedMinute || a.teamId.localeCompare(b.teamId));
  sorted.forEach((score,index)=>{
    const previous=sorted[index-1];
    score.rank=previous && score.solved===previous.solved && score.penaltySeconds===previous.penaltySeconds && score.lastAcceptedMinute===previous.lastAcceptedMinute ? previous.rank : index+1;
    delete score.problems;
  });
  return sorted;
}

export function calculateMedalLines(config, teams, runs) {
  const sorted=calculateStandings(config,teams,runs);
  if (!sorted) return null;
  let boundaries;
  if (config.medal === 'ccpc') {
    const effective=sorted.filter(team=>team.solved>0).length;
    boundaries={gold:Math.ceil(effective*.1),silver:Math.ceil(effective*.3),bronze:Math.ceil(effective*.6)};
  } else {
    const quota=config.medal?.official;
    if (!quota || !['gold','silver','bronze'].every(key=>Number.isInteger(quota[key]) && quota[key]>0)) return null;
    boundaries={gold:quota.gold,silver:quota.gold+quota.silver,bronze:quota.gold+quota.silver+quota.bronze};
  }
  if (!(boundaries.gold < boundaries.silver && boundaries.silver < boundaries.bronze)) return null;
  const result={};
  for (const key of ['gold','silver','bronze']) {
    const boundary=boundaries[key];
    if (!boundary || boundary>sorted.length) return null;
    const team=sorted[boundary-1];
    if (!team.solved) return null;
    result[key]={solved:team.solved,penaltySeconds:team.penaltySeconds,penaltyMinutes:Math.floor(team.penaltySeconds/60),rank:team.rank,lastAcceptedMinute:team.lastAcceptedMinute,teamId:team.teamId};
  }
  return result;
}
