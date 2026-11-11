import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const manifestPath = resolve(import.meta.dirname, '..', 'hydro-problems', 'algospark-grammar-tail-v1', 'algospark-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const secret = process.env.HYDRO_WEBHOOK_SECRET || '';
const hydroBridgeUrl = (process.env.HYDRO_BRIDGE_URL || '').replace(/\/$/, '');
const hydroBaseUrl = (process.env.HYDRO_BASE_URL || '').replace(/\/$/, '');
const siteUrl = (process.env.SYNC_SITE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

if (!secret || !hydroBridgeUrl || !hydroBaseUrl) {
  throw new Error('缺少 Hydro 正式环境配置。');
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} 返回 ${response.status}：${result.error || '请求失败'}`);
  return result;
}

for (const item of manifest) {
  const problemId = String(item.pid || '').trim();
  const hydroProblem = await post(`${hydroBridgeUrl}/problem`, { problemId });
  if (!hydroProblem.title || hydroProblem.title.trim() !== item.title) {
    throw new Error(`${problemId} 的 Hydro 标题与题包清单不一致。`);
  }
  await post(`${siteUrl}/api/integrations/hydro/problem`, {
    problemId,
    title: hydroProblem.title,
    points: item.points,
    track: item.track,
    topic: item.topic,
    active: item.active,
    url: `${hydroBaseUrl}/p/${encodeURIComponent(problemId)}`,
  });
  console.log(`SYNCED ${problemId}: ${hydroProblem.title}`);
}

console.log(`Synced ${manifest.length} new grammar problems.`);
