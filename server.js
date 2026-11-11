import { createServer } from 'node:http';
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { parseHydroProgressFilters, createHydroProgressReport, createHydroProgressWorkbook } from './hydro-progress-report.js';

const scrypt = promisify(scryptCallback);
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const VP_CATALOG = JSON.parse(readFileSync(join(ROOT, 'vp-contests.json'), 'utf8'));
const VP_CONTEST_IDS = new Set(VP_CATALOG.contests.map(contest => contest.id));
const STATIC_ROOT = resolve(ROOT);
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(ROOT, 'data');
const DB_PATH = process.env.DB_PATH ? resolve(process.env.DB_PATH) : join(DATA_DIR, 'algospark.db');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_COOKIE = 'algospark_session';
const SESSION_AGE = 24 * 60 * 60 * 1000;
const REMEMBER_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_SIZE = 256 * 1024;
const MAX_RESOURCE_PDF_SIZE = 20 * 1024 * 1024;
const RESOURCE_PDF_DIR = join(DATA_DIR, 'resource-pdfs');
const VERIFICATION_AGE = 10 * 60 * 1000;
const VERIFICATION_RESEND_DELAY = 60 * 1000;
const EXTERNAL_CODE_TARGET_HOURLY_LIMIT = positiveIntegerEnv('EXTERNAL_CODE_TARGET_HOURLY_LIMIT', 5);
const EXTERNAL_CODE_TARGET_DAILY_LIMIT = positiveIntegerEnv('EXTERNAL_CODE_TARGET_DAILY_LIMIT', 10);
const EXTERNAL_CODE_IP_15_MINUTE_LIMIT = positiveIntegerEnv('EXTERNAL_CODE_IP_15_MINUTE_LIMIT', 20);
const EXTERNAL_CODE_IP_DAILY_LIMIT = positiveIntegerEnv('EXTERNAL_CODE_IP_DAILY_LIMIT', 50);
const SMTP_HOURLY_LIMIT = positiveIntegerEnv('SMTP_HOURLY_LIMIT', 60);
const SMTP_DAILY_LIMIT = positiveIntegerEnv('SMTP_DAILY_LIMIT', 300);
const loginAttempts = new Map();
const deliveryAttempts = new Map();
const RATE_LIMIT_KEY_CAP = 50000;
const GENERIC_CODE_MESSAGE = '如果该邮箱符合条件，验证码将发送，请检查邮箱。';
const DUMMY_PASSWORD_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
const HYDRO_WEBHOOK_SECRET = process.env.HYDRO_WEBHOOK_SECRET || '';
const HYDRO_BASE_URL = (process.env.HYDRO_BASE_URL || '').replace(/\/$/, '');
const HYDRO_BRIDGE_URL = (process.env.HYDRO_BRIDGE_URL || `${HYDRO_BASE_URL}/algospark`).replace(/\/$/, '');
const HYDRO_DEMO_MODE = process.env.NODE_ENV !== 'production' && process.env.HYDRO_DEMO_MODE !== 'false';
const ADMIN_EMAILS = new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean));
const ASSOCIATION_AUTH_BASE_URL = (process.env.ASSOCIATION_AUTH_BASE_URL || 'https://www.cwnupaa.com/api').replace(/\/$/, '');
const ASSOCIATION_AUTH_APP_KEY = process.env.ASSOCIATION_AUTH_APP_KEY || '';
const TURNSTILE_SITE_KEY = String(process.env.TURNSTILE_SITE_KEY || '').trim();
const TURNSTILE_SECRET_KEY = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
const TURNSTILE_ENABLED = Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
const hydroStatementCache = new Map();
const hydroAutoBindAttempts = new Map();
const STARTER_PACK_DIRECTORIES = ['algospark-starter-v1', 'algospark-grammar-tail-v1'];
let STARTER_PACK_MANIFEST = [];
const STARTER_PACK_SAMPLES = new Map();
const STARTER_PACK_CONTENT = new Map();
for (const directory of STARTER_PACK_DIRECTORIES) {
  try {
    const packRoot = join(ROOT, 'hydro-problems', directory);
    const parsedManifest = JSON.parse(readFileSync(join(packRoot, 'algospark-manifest.json'), 'utf8'));
    if (Array.isArray(parsedManifest)) {
      STARTER_PACK_MANIFEST.push(...parsedManifest);
      for (const item of parsedManifest) {
        const problemId = String(item.pid || '').trim();
        if (!problemId) continue;
        const statement = readFileSync(join(packRoot, problemId, 'problem.md'), 'utf8');
        STARTER_PACK_CONTENT.set(problemId, statement.trim());
        const sampleStart = statement.search(/^##\s+(?:输入|输出)样例/m);
        if (sampleStart >= 0) STARTER_PACK_SAMPLES.set(problemId, statement.slice(sampleStart).trim());
      }
    }
  } catch (error) {
    console.warn(`原创题包 ${directory} 未加载：${error.message}`);
  }
}
const LEARNING_CONTENT = {
  cpp: new Set(['environment', 'framework', 'output', 'input', 'variable', 'operator', 'condition', 'for', 'while', 'array', 'string', 'struct', 'function', 'stl']),
  algorithm: new Set(['algo-simulation', 'algo-greedy', 'algo-format', 'algo-time', 'algo-space', 'algo-binary', 'algo-prefix', 'algo-difference', 'algo-probability', 'algo-linear-dp', 'algo-knapsack', 'algo-tree-dp', 'algo-reroot-dp', 'algo-interval-dp'])
};
const LUOGU_PROBLEM_POINTS = new Map([
  ...['B2002', 'P1000', 'P1001', 'P5703', 'P5704', 'P5705', 'P5706', 'P5708', 'P1425', 'P3954'].map(id => [id, 3]),
  ...['P5710', 'P5711', 'P5713', 'P5716', 'P5717', 'P5718', 'P5720', 'P5721', 'P5722', 'P5723'].map(id => [id, 4]),
  ...['P1427', 'P5727', 'P5728', 'P5730', 'P5733', 'P5734', 'P5735', 'P5736', 'P5737', 'P5738', 'P5740', 'P5715'].map(id => [id, 5]),
  ...['P1042', 'P1328', 'P1540', 'P1980'].map(id => [id, 6]),
  ...['P1090', 'P1208', 'P1223', 'P1803'].map(id => [id, 7]),
  ...['P2249', 'P1873', 'P2440', 'P2678'].map(id => [id, 8]),
  ...['P1614', 'P2004', 'P2367', 'P3397'].map(id => [id, 8])
]);
const LUOGU_MAX_SCORE = [...LUOGU_PROBLEM_POINTS.values()].reduce((total, points) => total + points, 0);
const AVATAR_THEMES = new Map([
  ['aurora', { requiredScore: 0 }],
  ['ocean', { requiredScore: 0 }],
  ['forest', { requiredScore: 50 }],
  ['sunset', { requiredScore: 120 }],
  ['berry', { requiredScore: 250 }],
  ['midnight', { requiredScore: 500 }],
  ['fox', { requiredScore: 0 }],
  ['nailong', { requiredScore: 0 }],
  ['weekflare', { requiredBadges: 5 }],
  ['crownlight', { requiredBadges: 10 }],
  ['royal', { requiredBadges: 15 }]
]);
const DEFAULT_AVATAR_THEME = 'aurora';
const ACHIEVEMENT_BADGES = [
  { id: 'rank-3', name: '赤铜探花', icon: 'Ⅲ', description: '历史总榜首次进入第 3 名', category: '历史总榜', tone: 'bronze', tier: 'epic', metric: null, target: 1 },
  { id: 'rank-2', name: '银月榜眼', icon: 'Ⅱ', description: '历史总榜首次获得第 2 名', category: '历史总榜', tone: 'silver', tier: 'epic', metric: null, target: 1 },
  { id: 'rank-1', name: '星冠·初次登顶', icon: '♛', description: '历史总榜首次登顶第 1 名', category: '历史总榜', tone: 'legendary', tier: 'legendary', metric: null, target: 1 },
  { id: 'week-rank-3', name: '周榜铜星', icon: 'WⅢ', description: '自然周结算时获得周榜第 3 名', category: '周榜荣誉', tone: 'bronze', tier: 'rare', metric: null, target: 1 },
  { id: 'week-rank-2', name: '周榜银辉', icon: 'WⅡ', description: '自然周结算时获得周榜第 2 名', category: '周榜荣誉', tone: 'silver', tier: 'rare', metric: null, target: 1 },
  { id: 'week-rank-1', name: '周曜冠军', icon: 'WⅠ', description: '自然周结算时获得周榜第 1 名', category: '周榜荣誉', tone: 'solar', tier: 'epic', metric: null, target: 1 },
  { id: 'grand-top3-5', name: '五日列星', icon: 'Ⅴ', description: '连续 5 天保持历史总榜前三', category: '连续占榜', tone: 'aurora', tier: 'epic', metric: 'rankTop3Streak', target: 5 },
  { id: 'grand-top2-7', name: '七日双曜', icon: 'Ⅶ', description: '连续 7 天保持历史总榜前二', category: '连续占榜', tone: 'celestial', tier: 'legendary', metric: 'rankTop2Streak', target: 7 },
  { id: 'grand-rank1-10', name: '十日·永恒王座', icon: '♚', description: '连续 10 天稳居历史总榜第一', category: '连续占榜', tone: 'mythic', tier: 'mythic', metric: 'rankFirstStreak', target: 10 },
  { id: 'founding-ten', name: '星火元老', icon: '10', description: 'AlgoSpark 最早注册的 10 位学习者之一', category: '身份荣誉', tone: 'origin', tier: 'legendary', metric: null, target: 1 },
  { id: 'admin-core', name: '星火执掌者', icon: 'A', description: 'AlgoSpark 管理员身份认证', category: '身份荣誉', tone: 'admin', tier: 'mythic', metric: null, target: 1 }
];
const ACHIEVEMENT_BADGE_IDS = new Set(ACHIEVEMENT_BADGES.map(item => item.id));
const AVATAR_FRAMES = new Map([
  ['none', { requiredScore: 0 }], ['frost', { requiredScore: 800 }], ['gold', { requiredScore: 1800 }], ['nebula', { requiredScore: 3500 }],
  ['laurel', { requiredBadges: 4 }], ['solar', { requiredBadges: 8 }], ['sovereign', { requiredBadges: 12 }]
]);
const PROFILE_DECORS = new Map([
  ['none', { requiredScore: 0 }], ['bamboo', { requiredScore: 1200 }], ['starlight', { requiredScore: 3000 }], ['champion', { requiredScore: 6000 }],
  ['podium', { requiredBadges: 6 }], ['weekorbit', { requiredBadges: 12 }], ['throne', { requiredBadges: 18 }]
]);

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(RESOURCE_PDF_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    real_name TEXT NOT NULL,
    school TEXT NOT NULL,
    avatar_theme TEXT NOT NULL DEFAULT 'aurora',
    achievement_badge TEXT NOT NULL DEFAULT '',
    avatar_frame TEXT NOT NULL DEFAULT 'none',
    profile_decor TEXT NOT NULL DEFAULT 'none',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS email_verifications (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    last_sent_at INTEGER NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS verification_rate_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    subject_hash TEXT NOT NULL,
    occurred_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_verification_rate_events_lookup
    ON verification_rate_events(scope, subject_hash, occurred_at);
  CREATE TABLE IF NOT EXISTS association_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    external_user_id TEXT NOT NULL UNIQUE,
    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role)
  );
  CREATE TABLE IF NOT EXISTS problem_completions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, problem_id)
  );
  CREATE INDEX IF NOT EXISTS idx_problem_completions_user ON problem_completions(user_id);
  CREATE TABLE IF NOT EXISTS vp_completions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contest_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, contest_id)
  );
  CREATE TABLE IF NOT EXISTS learning_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    content_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, content_type, content_id)
  );
  CREATE TABLE IF NOT EXISTS learning_activity (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_date TEXT NOT NULL,
    PRIMARY KEY (user_id, activity_date)
  );
  CREATE TABLE IF NOT EXISTS learning_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_content_type TEXT,
    last_content_id TEXT,
    last_active_at TEXT,
    imported_at TEXT
  );
  CREATE TABLE IF NOT EXISTS user_achievements (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, achievement_id)
  );
  CREATE TABLE IF NOT EXISTS user_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    achievement_id TEXT NOT NULL DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, type, achievement_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_read, created_at DESC);
  CREATE TABLE IF NOT EXISTS leaderboard_daily_snapshots (
    snapshot_date TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    score INTEGER NOT NULL,
    completed_count INTEGER NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (snapshot_date, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_leaderboard_daily_user ON leaderboard_daily_snapshots(user_id, snapshot_date);
  CREATE TABLE IF NOT EXISTS leaderboard_weekly_results (
    week_start TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL,
    score INTEGER NOT NULL,
    completed_count INTEGER NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (week_start, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_leaderboard_weekly_user ON leaderboard_weekly_results(user_id, week_start);
  CREATE TABLE IF NOT EXISTS hydro_problems (
    problem_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    points INTEGER NOT NULL CHECK(points > 0 AND points <= 1000),
    url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    track TEXT NOT NULL DEFAULT 'grammar',
    topic TEXT NOT NULL DEFAULT '',
    subtopic TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS hydro_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hydro_user_id TEXT,
    hydro_username TEXT NOT NULL COLLATE NOCASE,
    verified INTEGER NOT NULL DEFAULT 0,
    link_code_hash TEXT,
    link_expires_at INTEGER,
    bound_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_hydro_accounts_uid ON hydro_accounts(hydro_user_id) WHERE hydro_user_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_hydro_accounts_username ON hydro_accounts(hydro_username COLLATE NOCASE);
  CREATE TABLE IF NOT EXISTS hydro_submissions (
    submission_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id TEXT NOT NULL REFERENCES hydro_problems(problem_id),
    verdict TEXT NOT NULL,
    request_id TEXT,
    score INTEGER,
    time_ms INTEGER,
    memory_kb INTEGER,
    language TEXT,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_hydro_submissions_user ON hydro_submissions(user_id, problem_id);
  CREATE TABLE IF NOT EXISTS learning_resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    resource_type TEXT NOT NULL DEFAULT 'link',
    file_name TEXT,
    file_size INTEGER,
    storage_key TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_learning_resources_created ON learning_resources(created_at DESC, id DESC);
`);

db.prepare(`
  INSERT OR IGNORE INTO learning_resources (title, url)
  VALUES (?, ?)
`).run('算法竞赛模板计算几何部分', 'https://www.cnblogs.com/yuyang-/p/22634975');

for (const migration of [
  'ALTER TABLE hydro_accounts ADD COLUMN link_code_hash TEXT',
  'ALTER TABLE hydro_accounts ADD COLUMN link_expires_at INTEGER',
  "ALTER TABLE hydro_problems ADD COLUMN track TEXT NOT NULL DEFAULT 'grammar'",
  "ALTER TABLE hydro_problems ADD COLUMN topic TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE hydro_problems ADD COLUMN subtopic TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE hydro_submissions ADD COLUMN request_id TEXT',
  'ALTER TABLE hydro_submissions ADD COLUMN score INTEGER',
  'ALTER TABLE hydro_submissions ADD COLUMN time_ms INTEGER',
  'ALTER TABLE hydro_submissions ADD COLUMN memory_kb INTEGER',
  'ALTER TABLE hydro_submissions ADD COLUMN language TEXT',
  "ALTER TABLE users ADD COLUMN avatar_theme TEXT NOT NULL DEFAULT 'aurora'",
  "ALTER TABLE users ADD COLUMN achievement_badge TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE users ADD COLUMN avatar_frame TEXT NOT NULL DEFAULT 'none'",
  "ALTER TABLE users ADD COLUMN profile_decor TEXT NOT NULL DEFAULT 'none'",
  'ALTER TABLE learning_resources ADD COLUMN withdrawn_at TEXT',
  "ALTER TABLE learning_resources ADD COLUMN resource_type TEXT NOT NULL DEFAULT 'link'",
  'ALTER TABLE learning_resources ADD COLUMN file_name TEXT',
  'ALTER TABLE learning_resources ADD COLUMN file_size INTEGER',
  'ALTER TABLE learning_resources ADD COLUMN storage_key TEXT'
]) {
  try { db.exec(migration); } catch (error) {
    if (!String(error.message).includes('duplicate column name')) throw error;
  }
}

const activeAchievementIds = [...ACHIEVEMENT_BADGE_IDS];
const activeAchievementPlaceholders = activeAchievementIds.map(() => '?').join(',');
db.prepare(`DELETE FROM user_achievements WHERE achievement_id NOT IN (${activeAchievementPlaceholders})`).run(...activeAchievementIds);
db.prepare(`DELETE FROM user_notifications WHERE type = 'achievement' AND achievement_id NOT IN (${activeAchievementPlaceholders})`).run(...activeAchievementIds);
db.prepare(`UPDATE users SET achievement_badge = '' WHERE achievement_badge <> '' AND achievement_badge NOT IN (${activeAchievementPlaceholders})`).run(...activeAchievementIds);

// AlgoSpark only needs the stable upstream user ID for account linking.
// Remove unused plaintext account/student identifiers from existing databases.
const associationColumns = new Set(db.prepare('PRAGMA table_info(association_accounts)').all().map(column => column.name));
for (const column of ['number_id', 'user_account']) {
  if (associationColumns.has(column)) db.exec(`ALTER TABLE association_accounts DROP COLUMN ${column}`);
}

const schoolOjStarterProblems = [
  ['ACM0022', '欢迎来到cwnu', 5, 'grammar', 'start', ''],
  ['ACM0043', '虾仁的欢迎光临', 5, 'grammar', 'start', ''],
  ['ACM0059', '数位之和', 10, 'grammar', 'loop', ''],
  ['ACM0063', '素数', 10, 'grammar', 'function-struct', ''],
  ['XCPC0001', 'Lovely', 10, 'algorithm', 'foundation', 'simulation'],
  ['ACM0001', '自相残杀', 10, 'algorithm', 'foundation', 'simulation'],
  ['ACM0023', '真昼画水母', 10, 'algorithm', 'foundation', 'simulation'],
  ['ACM0025', '樱花庄的日常', 10, 'algorithm', 'foundation', 'simulation'],
  ['ACM0026', '大道磨灭', 15, 'algorithm', 'foundation', 'greedy'],
  ['ZS0059', '配对', 15, 'algorithm', 'foundation', 'greedy'],
  ['ZS0030', '小夏', 15, 'algorithm', 'foundation', 'greedy'],
  ['ZS0039', 'Cut', 15, 'algorithm', 'foundation', 'greedy'],
  ['ACM0002', '暴躁兔兔', 15, 'algorithm', 'foundation', 'binary'],
  ['ACM0012', '排队问题', 15, 'algorithm', 'foundation', 'binary'],
  ['ACM0017', '山峰数组', 15, 'algorithm', 'foundation', 'binary'],
  ['CTR0009', '切绳子', 15, 'algorithm', 'foundation', 'binary'],
  ['ZS0025', '送分前缀和', 10, 'algorithm', 'foundation', 'prefix-sum'],
  ['PX0004', '【模板】前缀和（求区间和）', 15, 'algorithm', 'foundation', 'prefix-sum'],
  ['PX0005', '【模板】差分', 15, 'algorithm', 'foundation', 'prefix-sum'],
  ['PX0009', '激光炸弹', 20, 'algorithm', 'foundation', 'prefix-sum'],
];
const insertSchoolOjStarter = db.prepare(`
  INSERT OR IGNORE INTO hydro_problems (problem_id, title, points, url, active, is_demo, track, topic, subtopic)
  VALUES (?, ?, ?, ?, 1, 0, ?, ?, ?)
`);
const updateEmptyHydroTopic = db.prepare("UPDATE hydro_problems SET topic = ? WHERE problem_id = ? AND topic = ''");
const updateEmptyHydroSubtopic = db.prepare("UPDATE hydro_problems SET subtopic = ? WHERE problem_id = ? AND subtopic = ''");
for (const [problemId, title, points, track, topic, subtopic] of schoolOjStarterProblems) {
  const url = HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/p/${encodeURIComponent(problemId)}` : '';
  insertSchoolOjStarter.run(problemId, title, points, url, track, topic, subtopic);
  updateEmptyHydroTopic.run(topic, problemId);
  if (subtopic) updateEmptyHydroSubtopic.run(subtopic, problemId);
}
updateEmptyHydroTopic.run('foundation', 'XCPC0001');
updateEmptyHydroSubtopic.run('simulation', 'XCPC0001');
for (const [problemId, topic] of [
  ['AS1001', 'start'], ['AS1002', 'start'],
  ['AS1003', 'basic'], ['AS1004', 'basic'],
  ['AS1005', 'array-string'],
  ['AS1006', 'basic'], ['AS1007', 'basic'], ['AS1008', 'basic'], ['AS1009', 'basic'],
  ['AS1010', 'condition'], ['AS1011', 'condition'], ['AS1012', 'condition'], ['AS1013', 'condition'],
  ['AS1014', 'function-struct'],
  ['AS1015', 'loop'], ['AS1016', 'loop'],
  ['AS1017', 'array-string'], ['AS1018', 'array-string'], ['AS1019', 'array-string'], ['AS1020', 'array-string'],
  ['AS1021', 'function-struct'], ['AS1022', 'function-struct'], ['AS1023', 'function-struct'],
  ['AS1024', 'basic']
]) updateEmptyHydroTopic.run(topic, problemId);

// 算法学习目前只开放基础算法，暂时下架其余专题的旧示例题。
db.prepare("UPDATE hydro_problems SET active = 0 WHERE problem_id IN ('PX0003', 'PX0048', 'ACM0009')").run();

if (HYDRO_DEMO_MODE) {
  db.prepare(`
    INSERT OR IGNORE INTO hydro_problems (problem_id, title, points, url, is_demo)
    VALUES ('DEMO-1001', 'A+B 测试题（Hydro 接入演示）', 10, '', 1)
  `).run();
} else {
  db.prepare('UPDATE hydro_problems SET active = 0 WHERE is_demo = 1').run();
}

const statements = {
  findUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findUserById: db.prepare('SELECT id, email, nickname, real_name, school, avatar_theme, achievement_badge, avatar_frame, profile_decor, created_at FROM users WHERE id = ?'),
  findUserRole: db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?'),
  insertUser: db.prepare('INSERT INTO users (email, password_hash, nickname, real_name, school) VALUES (?, ?, ?, ?, ?)'),
  updateAssociationUserProfile: db.prepare('UPDATE users SET nickname = ?, real_name = ?, school = ? WHERE id = ?'),
  updateAvatarTheme: db.prepare('UPDATE users SET avatar_theme = ? WHERE id = ?'),
  updateAchievementBadge: db.prepare('UPDATE users SET achievement_badge = ? WHERE id = ?'),
  updateAvatarFrame: db.prepare('UPDATE users SET avatar_frame = ? WHERE id = ?'),
  updateProfileDecor: db.prepare('UPDATE users SET profile_decor = ? WHERE id = ?'),
  findAssociationAccount: db.prepare('SELECT * FROM association_accounts WHERE external_user_id = ?'),
  insertAssociationAccount: db.prepare('INSERT INTO association_accounts (user_id, external_user_id) VALUES (?, ?)'),
  updateAssociationAccount: db.prepare('UPDATE association_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE external_user_id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  findSession: db.prepare(`
    SELECT u.id, u.email, u.nickname, u.real_name, u.school, u.avatar_theme,
           u.achievement_badge, u.avatar_frame, u.profile_decor, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  deleteExpiredSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  findVerification: db.prepare('SELECT * FROM email_verifications WHERE email = ?'),
  saveVerification: db.prepare(`
    INSERT INTO email_verifications (email, code_hash, expires_at, last_sent_at, failed_attempts)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(email) DO UPDATE SET
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      last_sent_at = excluded.last_sent_at,
      failed_attempts = 0
  `),
  failVerification: db.prepare('UPDATE email_verifications SET failed_attempts = failed_attempts + 1 WHERE email = ?'),
  deleteVerification: db.prepare('DELETE FROM email_verifications WHERE email = ?'),
  deleteExpiredVerifications: db.prepare('DELETE FROM email_verifications WHERE expires_at <= ?'),
  countVerificationRateEvents: db.prepare('SELECT COUNT(*) AS count FROM verification_rate_events WHERE scope = ? AND subject_hash = ? AND occurred_at > ?'),
  oldestVerificationRateEvent: db.prepare('SELECT occurred_at FROM verification_rate_events WHERE scope = ? AND subject_hash = ? AND occurred_at > ? ORDER BY occurred_at LIMIT 1'),
  insertVerificationRateEvent: db.prepare('INSERT INTO verification_rate_events (scope, subject_hash, occurred_at) VALUES (?, ?, ?)'),
  deleteVerificationRateEvent: db.prepare('DELETE FROM verification_rate_events WHERE id = ?'),
  deleteOldVerificationRateEvents: db.prepare('DELETE FROM verification_rate_events WHERE occurred_at <= ?'),
  listCompletions: db.prepare('SELECT problem_id, points, completed_at FROM problem_completions WHERE user_id = ? ORDER BY completed_at'),
  addCompletion: db.prepare('INSERT OR IGNORE INTO problem_completions (user_id, problem_id, points) VALUES (?, ?, ?)'),
  deleteCompletion: db.prepare('DELETE FROM problem_completions WHERE user_id = ? AND problem_id = ?'),
  updateUserCompletionPoints: db.prepare('UPDATE problem_completions SET points = ? WHERE user_id = ? AND problem_id = ?'),
  updateCompletionPoints: db.prepare('UPDATE problem_completions SET points = ? WHERE problem_id = ?'),
  leaderboard: db.prepare(`
    SELECT u.id, u.nickname, u.real_name, u.school, u.avatar_theme,
           u.achievement_badge, u.avatar_frame,
           COALESCE(SUM(pc.points), 0) AS score,
           COUNT(pc.problem_id) AS completed_count
    FROM users u
    LEFT JOIN problem_completions pc ON pc.user_id = u.id
    GROUP BY u.id
    ORDER BY score DESC, completed_count DESC, u.id ASC
  `),
  leaderboardUsers: db.prepare(`
    SELECT id, email, nickname, real_name, school, avatar_theme, achievement_badge, avatar_frame
    FROM users ORDER BY id
  `),
  firstTenUserIds: db.prepare('SELECT id FROM users ORDER BY created_at, id LIMIT 10'),
  leaderboardCompletionFacts: db.prepare('SELECT user_id, points, completed_at FROM problem_completions ORDER BY completed_at, user_id'),
  deleteDailySnapshots: db.prepare('DELETE FROM leaderboard_daily_snapshots WHERE snapshot_date = ?'),
  insertDailySnapshot: db.prepare('INSERT OR REPLACE INTO leaderboard_daily_snapshots (snapshot_date, user_id, rank, score, completed_count, recorded_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'),
  listUserDailySnapshots: db.prepare('SELECT snapshot_date, rank FROM leaderboard_daily_snapshots WHERE user_id = ? ORDER BY snapshot_date'),
  insertWeeklyResult: db.prepare('INSERT OR REPLACE INTO leaderboard_weekly_results (week_start, user_id, rank, score, completed_count, recorded_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'),
  listLearningProgress: db.prepare('SELECT content_type, content_id, completed_at FROM learning_progress WHERE user_id = ? ORDER BY completed_at'),
  addLearningProgress: db.prepare('INSERT OR IGNORE INTO learning_progress (user_id, content_type, content_id) VALUES (?, ?, ?)'),
  deleteLearningProgress: db.prepare('DELETE FROM learning_progress WHERE user_id = ? AND content_type = ? AND content_id = ?'),
  listLearningDays: db.prepare('SELECT activity_date FROM learning_activity WHERE user_id = ? ORDER BY activity_date'),
  addLearningDay: db.prepare('INSERT OR IGNORE INTO learning_activity (user_id, activity_date) VALUES (?, ?)'),
  findLearningState: db.prepare('SELECT * FROM learning_state WHERE user_id = ?'),
  saveLastContent: db.prepare(`
    INSERT INTO learning_state (user_id, last_content_type, last_content_id, last_active_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      last_content_type = excluded.last_content_type,
      last_content_id = excluded.last_content_id,
      last_active_at = CURRENT_TIMESTAMP
  `),
  markLearningImported: db.prepare(`
    INSERT INTO learning_state (user_id, imported_at) VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET imported_at = COALESCE(learning_state.imported_at, CURRENT_TIMESTAMP)
  `),
  listUserAchievements: db.prepare('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at'),
  unlockAchievement: db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, achievement_id) VALUES (?, ?)'),
  insertAchievementNotification: db.prepare(`
    INSERT OR IGNORE INTO user_notifications (user_id, type, title, message, achievement_id)
    VALUES (?, 'achievement', ?, ?, ?)
  `),
  listNotifications: db.prepare('SELECT id, type, title, message, achievement_id, is_read, created_at FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50'),
  countUnreadNotifications: db.prepare('SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND is_read = 0'),
  markAllNotificationsRead: db.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'),
  listHydroProblems: db.prepare('SELECT problem_id, title, points, url, is_demo, track, topic, subtopic FROM hydro_problems WHERE active = 1 ORDER BY track, topic, subtopic, is_demo DESC, problem_id'),
  listAllHydroProblems: db.prepare('SELECT problem_id, title, points, url, active, is_demo, track, topic, subtopic, updated_at FROM hydro_problems ORDER BY is_demo, track, topic, subtopic, problem_id'),
  countHydroProblems: db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(points), 0) AS points FROM hydro_problems WHERE active = 1'),
  findHydroProblem: db.prepare('SELECT * FROM hydro_problems WHERE problem_id = ?'),
  upsertHydroProblem: db.prepare(`
    INSERT INTO hydro_problems (problem_id, title, points, url, active, is_demo, track, topic, subtopic, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(problem_id) DO UPDATE SET title = excluded.title, points = excluded.points,
      url = excluded.url, active = excluded.active, is_demo = 0, track = excluded.track,
      topic = excluded.topic, subtopic = excluded.subtopic, updated_at = CURRENT_TIMESTAMP
  `),
  findHydroAccountByUser: db.prepare('SELECT hydro_user_id, hydro_username, verified, bound_at FROM hydro_accounts WHERE user_id = ?'),
  findHydroAccountByUid: db.prepare('SELECT user_id FROM hydro_accounts WHERE hydro_user_id = ? AND verified = 1'),
  findHydroAccountByUsername: db.prepare('SELECT user_id FROM hydro_accounts WHERE hydro_username = ? COLLATE NOCASE AND verified = 1'),
  findPendingHydroAccount: db.prepare('SELECT user_id, link_code_hash, link_expires_at FROM hydro_accounts WHERE hydro_username = ? COLLATE NOCASE'),
  bindHydroAccount: db.prepare(`
    INSERT INTO hydro_accounts (user_id, hydro_username, verified, link_code_hash, link_expires_at) VALUES (?, ?, 0, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET hydro_username = excluded.hydro_username,
      hydro_user_id = NULL, verified = 0, link_code_hash = excluded.link_code_hash,
      link_expires_at = excluded.link_expires_at, bound_at = CURRENT_TIMESTAMP
  `),
  verifyHydroAccount: db.prepare('UPDATE hydro_accounts SET hydro_user_id = ?, verified = 1, link_code_hash = NULL, link_expires_at = NULL WHERE user_id = ?'),
  autoBindHydroAccount: db.prepare(`
    INSERT INTO hydro_accounts (user_id, hydro_user_id, hydro_username, verified) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET hydro_user_id = excluded.hydro_user_id,
      hydro_username = excluded.hydro_username, verified = 1,
      link_code_hash = NULL, link_expires_at = NULL, bound_at = CURRENT_TIMESTAMP
    WHERE hydro_accounts.verified = 0
  `),
  findHydroSubmission: db.prepare('SELECT * FROM hydro_submissions WHERE submission_id = ?'),
  findHydroSubmissionForUser: db.prepare('SELECT submission_id, problem_id, verdict, score, time_ms, memory_kb, language, submitted_at, received_at FROM hydro_submissions WHERE submission_id = ? AND user_id = ?'),
  addHydroSubmission: db.prepare('INSERT INTO hydro_submissions (submission_id, user_id, problem_id, verdict, request_id, score, time_ms, memory_kb, language, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  updateHydroSubmission: db.prepare('UPDATE hydro_submissions SET verdict = ?, score = ?, time_ms = ?, memory_kb = ?, language = COALESCE(?, language), submitted_at = ?, received_at = CURRENT_TIMESTAMP WHERE submission_id = ?'),
  findAcceptedHydroSubmission: db.prepare("SELECT 1 FROM hydro_submissions WHERE user_id = ? AND problem_id = ? AND verdict = 'AC' LIMIT 1"),
  adminSubmissionStats: db.prepare(`
    SELECT COUNT(*) AS total,
      COUNT(CASE WHEN verdict = 'AC' THEN 1 END) AS accepted,
      COUNT(DISTINCT user_id) AS participants
    FROM hydro_submissions
  `),
  listRecentHydroSubmissions: db.prepare(`
    SELECT hs.submission_id, hs.problem_id, hp.title, hs.verdict, hs.score,
      hs.time_ms, hs.memory_kb, hs.language, hs.submitted_at, hs.received_at,
      u.nickname, u.real_name, ha.hydro_username
    FROM hydro_submissions hs
    JOIN users u ON u.id = hs.user_id
    JOIN hydro_problems hp ON hp.problem_id = hs.problem_id
    LEFT JOIN hydro_accounts ha ON ha.user_id = hs.user_id
    ORDER BY hs.received_at DESC
    LIMIT ?
  `),
  countUsers: db.prepare('SELECT COUNT(*) AS count FROM users'),
  countVerifiedHydroAccounts: db.prepare('SELECT COUNT(*) AS count FROM hydro_accounts WHERE verified = 1'),
  claimSeedLearningResource: db.prepare(`
    UPDATE learning_resources
    SET created_by = (SELECT id FROM users ORDER BY id LIMIT 1)
    WHERE url = ? AND created_by IS NULL AND withdrawn_at IS NULL AND EXISTS (SELECT 1 FROM users)
  `),
  listLearningResources: db.prepare(`
    SELECT lr.id, lr.title, lr.url, lr.resource_type, lr.file_name, lr.file_size, lr.created_at,
      u.id AS publisher_id, u.nickname AS publisher_nickname, u.real_name AS publisher_real_name
    FROM learning_resources lr
    LEFT JOIN users u ON u.id = lr.created_by
    WHERE lr.withdrawn_at IS NULL
    ORDER BY lr.created_at DESC, lr.id DESC
  `),
  insertLearningResource: db.prepare('INSERT INTO learning_resources (title, url, created_by) VALUES (?, ?, ?)'),
  insertLearningResourcePdf: db.prepare("INSERT INTO learning_resources (title, url, resource_type, file_name, file_size, storage_key, created_by) VALUES (?, ?, 'pdf', ?, ?, ?, ?)"),
  findLearningResourcePdf: db.prepare("SELECT id, file_name, file_size, storage_key FROM learning_resources WHERE id = ? AND resource_type = 'pdf' AND withdrawn_at IS NULL"),
  updateLearningResourceTitle: db.prepare('UPDATE learning_resources SET title = ? WHERE id = ? AND withdrawn_at IS NULL'),
  withdrawLearningResource: db.prepare('UPDATE learning_resources SET withdrawn_at = CURRENT_TIMESTAMP WHERE id = ? AND withdrawn_at IS NULL')
};

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE ?? 'true').toLowerCase() === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

if (Boolean(TURNSTILE_SITE_KEY) !== Boolean(TURNSTILE_SECRET_KEY)) {
  console.warn('Turnstile 配置不完整：需要同时设置 TURNSTILE_SITE_KEY 和 TURNSTILE_SECRET_KEY。');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};
const KATEX_ROOT = 'vendor/katex-0.19.1';
const KATEX_ASSETS = [
  `${KATEX_ROOT}/katex.min.js`, `${KATEX_ROOT}/katex.min.css`,
  ...[...readFileSync(join(STATIC_ROOT, KATEX_ROOT, 'katex.min.css'), 'utf8')
    .matchAll(/url\((fonts\/[A-Za-z0-9_-]+\.woff2)\)/g)].map(([, font]) => `${KATEX_ROOT}/${font}`)
];
const RANKING_ART_ASSETS = new Set(['ranking-mountains-v1.webp', 'avatar-cloud-v1.webp', 'avatar-sea-v1.webp', 'avatar-bamboo-v1.webp', 'avatar-sunset-v1.webp', 'avatar-plum-v1.webp', 'avatar-stars-v1.webp', 'avatar-nailong-v1.webp', 'avatar-sun-fox-v1.webp', 'avatar-week-owl-v1.webp', 'avatar-star-swordsman-v1.webp', 'avatar-royal-dragon-v1.webp']);
const PUBLIC_ASSETS = new Set(['index.html', 'app.js', 'styles.css', 'vp.js', 'vp.css', 'vp-2025-icpc-shanghai-en.pdf', 'beian-icon.png', 'poetry-landscape.png', 'poetry-landscape-v2.webp', ...RANKING_ART_ASSETS, ...KATEX_ASSETS]);

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(body);
}

function publicUser(user) {
  return {
    id: Number(user.id),
    email: user.email,
    nickname: user.nickname,
    realName: user.real_name,
    school: user.school,
    avatarTheme: AVATAR_THEMES.has(user.avatar_theme) ? user.avatar_theme : DEFAULT_AVATAR_THEME,
    achievementBadgeId: ACHIEVEMENT_BADGE_IDS.has(user.achievement_badge) ? user.achievement_badge : '',
    avatarFrame: AVATAR_FRAMES.has(user.avatar_frame) ? user.avatar_frame : 'none',
    profileDecor: PROFILE_DECORS.has(user.profile_decor) ? user.profile_decor : 'none',
    createdAt: user.created_at,
    isAdmin: isAdminUser(user)
  };
}

function isAdminUser(user) {
  return Boolean(user?.id && (
    ADMIN_EMAILS.has(normalizeEmail(user.email)) ||
    statements.findUserRole.get(user.id, 'admin')
  ));
}

function requireAdmin(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    sendJson(res, 401, { error: '请先登录管理员账号。' });
    return null;
  }
  if (!isAdminUser(user)) {
    sendJson(res, 403, { error: '当前账号没有管理权限。' });
    return null;
  }
  return user;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function positiveIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizeLearningResourceUrl(value) {
  if (typeof value !== 'string' || value.trim().length > 2048) return '';
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function normalizeResourcePdfName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim().replace(/[\\/]/g, '-');
  if (!name || name.length > 180 || /[\u0000-\u001f\u007f]/.test(name) || !/\.pdf$/i.test(name)) return '';
  return name;
}

async function readResourcePdf(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/pdf')) {
    const error = new Error('请选择 PDF 格式的文件。');
    error.status = 415;
    throw error;
  }
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESOURCE_PDF_SIZE) {
    const error = new Error(`PDF 文件不能超过 ${MAX_RESOURCE_PDF_SIZE / 1024 / 1024} MB。`);
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_RESOURCE_PDF_SIZE) {
      const error = new Error(`PDF 文件不能超过 ${MAX_RESOURCE_PDF_SIZE / 1024 / 1024} MB。`);
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const file = Buffer.concat(chunks);
  if (!file.length || file.subarray(0, 5).toString('ascii') !== '%PDF-') {
    const error = new Error('文件内容不是有效的 PDF。');
    error.status = 400;
    throw error;
  }
  return file;
}

function resourcePdfUrl(id) {
  return `/api/resources/${Number(id)}/pdf`;
}

function safePdfContentDisposition(fileName) {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'resource.pdf';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function validateRegistration(body) {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  const realName = typeof body.realName === 'string' ? body.realName.trim() : '';
  const school = typeof body.school === 'string' ? body.school.trim() : '';
  if (!validEmail(email)) return '请输入有效的邮箱地址。';
  if (password.length < 8 || password.length > 128) return '密码长度必须为 8 到 128 个字符。';
  if (!nickname || nickname.length > 30) return '昵称不能为空且不能超过 30 个字符。';
  if (!realName || realName.length > 50) return '姓名不能为空且不能超过 50 个字符。';
  if (!school || school.length > 100) return '学校不能为空且不能超过 100 个字符。';
  return null;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [algorithm, saltHex, hashHex] = String(stored).split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function sendVerificationEmail(email, code, purpose = '注册') {
  if (!mailer) {
    if (process.env.NODE_ENV === 'production' || process.env.EXPOSE_DEV_VERIFICATION_CODE !== 'true') {
      const error = new Error('邮件服务尚未配置，请联系管理员。');
      error.status = 503;
      throw error;
    }
    console.log(`[开发验证码] ${purpose}：${code}（10 分钟内有效）`);
    return;
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || `AlgoSpark <${process.env.SMTP_USER}>`,
    to: email,
    subject: `AlgoSpark ${purpose}验证码`,
    text: `你的 AlgoSpark ${purpose}验证码是：${code}。验证码 10 分钟内有效，请勿转发给他人。`,
    html: `<div style="font-family:Arial,sans-serif;color:#273149"><h2>AlgoSpark ${purpose}验证</h2><p>你的${purpose}验证码是：</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#7151d7">${code}</p><p>验证码 10 分钟内有效，请勿转发给他人。</p></div>`
  });
}

async function associationAuthRequest(pathname, payload) {
  if (!ASSOCIATION_AUTH_APP_KEY) {
    const error = new Error('协会官网登录正在等待管理员配置 API Key。');
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${ASSOCIATION_AUTH_BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appKey: ASSOCIATION_AUTH_APP_KEY, ...payload }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (cause) {
    const error = new Error('暂时无法连接协会官网，请稍后重试。');
    error.status = 502;
    error.cause = cause;
    throw error;
  }
  let result;
  try {
    result = await response.json();
  } catch {
    const error = new Error('协会官网返回了无法识别的数据。');
    error.status = 502;
    throw error;
  }
  if (!response.ok || Number(result?.code) !== 200) {
    const remoteMessage = typeof result?.msg === 'string' ? result.msg : '';
    const appKeyRejected = /app\s*key|appkey|密钥/i.test(remoteMessage);
    const error = new Error(appKeyRejected
      ? '协会官网尚未识别新接口密钥，请联系协会官网管理员刷新接口服务。'
      : pathname.endsWith('/login') ? '协会官网账号、密码或验证码不正确。' : (remoteMessage || '协会官网验证码发送失败。'));
    error.status = appKeyRejected ? 503 : response.status >= 500 ? 502 : 401;
    throw error;
  }
  return result.data;
}

function cleanAssociationField(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function syncAssociationUser(info) {
  const externalUserId = String(info?.userId ?? '').trim();
  const email = normalizeEmail(info?.email);
  if (!externalUserId || externalUserId.length > 80 || !validEmail(email)) {
    const error = new Error('协会官网账号缺少有效的用户 ID 或邮箱，请联系协会管理员补全资料。');
    error.status = 502;
    throw error;
  }
  const userAccount = cleanAssociationField(info.userAccount, 80);
  const nickname = cleanAssociationField(info.userName, 30) || userAccount || `协会用户${externalUserId}`;
  const realName = cleanAssociationField(info.realName, 50) || nickname;
  const linked = statements.findAssociationAccount.get(externalUserId);
  let user = linked ? statements.findUserById.get(linked.user_id) : statements.findUserByEmail.get(email);

  if (!user) {
    const passwordHash = await hashPassword(randomBytes(48).toString('base64url'));
    try {
      const created = statements.insertUser.run(email, passwordHash, nickname, realName, '西华师范大学');
      user = statements.findUserById.get(created.lastInsertRowid);
    } catch (dbError) {
      if (!String(dbError.code).startsWith('ERR_SQLITE_CONSTRAINT')) throw dbError;
      user = statements.findUserByEmail.get(email);
    }
  }

  if (!linked) {
    try {
      statements.insertAssociationAccount.run(user.id, externalUserId);
    } catch (dbError) {
      if (String(dbError.code).startsWith('ERR_SQLITE_CONSTRAINT')) {
        const error = new Error('该邮箱已经关联了另一个协会官网账号，请联系管理员处理。');
        error.status = 409;
        throw error;
      }
      throw dbError;
    }
  } else {
    statements.updateAssociationAccount.run(externalUserId);
  }
  statements.updateAssociationUserProfile.run(nickname, realName, '西华师范大学', user.id);
  return statements.findUserById.get(user.id);
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function safeSecretEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function hasHydroWebhookAccess(req) {
  if (!HYDRO_WEBHOOK_SECRET) return false;
  const authorization = String(req.headers.authorization || '');
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return safeSecretEqual(bearer || req.headers['x-hydro-secret'], HYDRO_WEBHOOK_SECRET);
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const age = maxAge ? `; Max-Age=${Math.floor(maxAge / 1000)}` : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}${age}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}

function createSession(userId, remember) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = remember ? REMEMBER_AGE : SESSION_AGE;
  statements.insertSession.run(tokenHash(token), userId, Date.now() + maxAge);
  return { token, cookieAge: remember ? maxAge : null };
}

function getCurrentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  return statements.findSession.get(tokenHash(token), Date.now()) || null;
}

function practiceProgress(userId) {
  const rows = statements.listCompletions.all(userId).filter(row => row.problem_id.startsWith('HYDRO:') || LUOGU_PROBLEM_POINTS.has(row.problem_id));
  const hydro = statements.countHydroProblems.get();
  const score = rows.reduce((total, row) => total + Number(row.points), 0);
  const ojHeatmap = buildOjHeatmap(rows);
  return {
    completed: rows.map(row => row.problem_id),
    score,
    completedCount: rows.length,
    totalCount: Number(hydro.count) + LUOGU_PROBLEM_POINTS.size,
    maxScore: Number(hydro.points) + LUOGU_MAX_SCORE,
    ojHeatmap,
    collection: buildProfileCollection(userId, score, ojHeatmap)
  };
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function completionDateKey(value) {
  const normalized = String(value || '').trim().replace(' ', 'T');
  if (!normalized) return '';
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? '' : appDateKey(date);
}

function buildOjHeatmap(rows) {
  const hydroRows = rows.filter(row => row.problem_id.startsWith('HYDRO:') && !row.problem_id.startsWith('HYDRO:DEMO-'));
  const grouped = new Map();
  for (const row of hydroRows) {
    const date = completionDateKey(row.completed_at);
    if (!date) continue;
    const current = grouped.get(date) || { date, count: 0, points: 0 };
    current.count += 1;
    current.points += Number(row.points) || 0;
    grouped.set(date, current);
  }

  const today = appDateKey();
  const firstVisibleDay = shiftDateKey(today, -370);
  const days = [...grouped.values()].filter(day => day.date >= firstVisibleDay && day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const allActiveDates = [...grouped.keys()].sort();
  let longestStreak = 0;
  let runningStreak = 0;
  let previousDate = '';
  for (const date of allActiveDates) {
    runningStreak = previousDate && shiftDateKey(previousDate, 1) === date ? runningStreak + 1 : 1;
    longestStreak = Math.max(longestStreak, runningStreak);
    previousDate = date;
  }

  const todayDate = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  const weekStart = shiftDateKey(today, -mondayOffset);
  return {
    days,
    today,
    totalAccepted: hydroRows.length,
    activeDays: days.length,
    allTimeActiveDays: allActiveDates.length,
    maxDailyAccepted: Math.max(0, ...[...grouped.values()].map(day => day.count)),
    longestStreak,
    weekAccepted: days.filter(day => day.date >= weekStart).reduce((total, day) => total + day.count, 0)
  };
}

function unlockAchievementForUser(userId, achievementId) {
  const achievement = ACHIEVEMENT_BADGES.find(item => item.id === achievementId);
  if (!achievement) return false;
  const result = statements.unlockAchievement.run(userId, achievementId);
  if (!Number(result.changes)) return false;
  statements.insertAchievementNotification.run(
    userId,
    `获得新徽章 · ${achievement.name}`,
    `你已达成「${achievement.description}」，可以在个人主页选择展示。`,
    achievementId
  );
  return true;
}

function syncIdentityAchievementsForUser(userId, knownUser = null) {
  const foundingIds = new Set(statements.firstTenUserIds.all().map(row => Number(row.id)));
  if (foundingIds.has(Number(userId))) unlockAchievementForUser(Number(userId), 'founding-ten');
  const user = knownUser || statements.findUserById.get(Number(userId));
  if (isAdminUser(user)) unlockAchievementForUser(Number(userId), 'admin-core');
}

function rankingStreakMetrics(userId) {
  const rows = statements.listUserDailySnapshots.all(userId);
  const longestFor = predicate => {
    let longest = 0;
    let running = 0;
    let previousDate = '';
    for (const row of rows) {
      if (!predicate(Number(row.rank))) {
        running = 0;
        previousDate = row.snapshot_date;
        continue;
      }
      running = previousDate && shiftDateKey(previousDate, 1) === row.snapshot_date ? running + 1 : 1;
      longest = Math.max(longest, running);
      previousDate = row.snapshot_date;
    }
    return longest;
  };
  return {
    rankTop3Streak: longestFor(rank => rank <= 3),
    rankTop2Streak: longestFor(rank => rank <= 2),
    rankFirstStreak: longestFor(rank => rank === 1)
  };
}

function cosmeticCollection(items, score, unlockedAchievements) {
  return [...items].map(([id, rule]) => {
    const requiredScore = Number(rule.requiredScore || 0);
    const requiredBadges = Number(rule.requiredBadges || 0);
    return {
      id,
      requiredScore,
      requiredBadges,
      currentBadges: unlockedAchievements.size,
      unlocked: score >= requiredScore && unlockedAchievements.size >= requiredBadges
    };
  });
}

function buildProfileCollection(userId, score, heatmap) {
  syncIdentityAchievementsForUser(userId);
  const metrics = { ...heatmap, score, ...rankingStreakMetrics(userId) };
  for (const achievement of ACHIEVEMENT_BADGES) {
    if (achievement.metric && Number(metrics[achievement.metric] || 0) >= achievement.target) {
      unlockAchievementForUser(userId, achievement.id);
    }
  }
  const unlockedRows = statements.listUserAchievements.all(userId);
  const unlocked = new Map(unlockedRows.map(row => [row.achievement_id, row.unlocked_at]));
  const achievements = ACHIEVEMENT_BADGES.map(item => {
    const progress = item.metric ? Math.min(Number(metrics[item.metric]) || 0, item.target) : 0;
    return {
      id: item.id,
      name: item.name,
      icon: item.icon,
      description: item.description,
      category: item.category,
      tone: item.tone,
      tier: item.tier,
      target: item.target,
      progress: unlocked.has(item.id) ? item.target : progress,
      unlocked: unlocked.has(item.id),
      unlockedAt: unlocked.get(item.id) || null
    };
  });
  const unlockedIds = new Set([...unlocked.keys()]);
  return {
    achievements,
    avatarThemes: cosmeticCollection(AVATAR_THEMES, score, unlockedIds),
    frames: cosmeticCollection(AVATAR_FRAMES, score, unlockedIds),
    decors: cosmeticCollection(PROFILE_DECORS, score, unlockedIds)
  };
}

function weekStartDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return shiftDateKey(dateKey, -mondayOffset);
}

function rankFromState(users, state, includeZero = false) {
  return users.map(user => {
    const value = state.get(Number(user.id)) || { score: 0, completedCount: 0 };
    return { ...user, score: value.score, completed_count: value.completedCount };
  }).filter(entry => includeZero || entry.score > 0).sort((a, b) => (
    Number(b.score) - Number(a.score)
    || Number(b.completed_count) - Number(a.completed_count)
    || Number(a.id) - Number(b.id)
  ));
}

function rankCompletionFacts(users, facts, includeZero = false) {
  const state = new Map(users.map(user => [Number(user.id), { score: 0, completedCount: 0 }]));
  for (const fact of facts) {
    const value = state.get(Number(fact.user_id));
    if (!value) continue;
    value.score += Number(fact.points) || 0;
    value.completedCount += 1;
  }
  return rankFromState(users, state, includeZero);
}

function awardPodium(ranked, prefix = '') {
  for (let index = 0; index < Math.min(3, ranked.length); index += 1) {
    if (Number(ranked[index].score) <= 0) continue;
    unlockAchievementForUser(Number(ranked[index].id), `${prefix}rank-${index + 1}`);
  }
}

function currentWeeklyLeaderboard() {
  const today = appDateKey();
  const weekStart = weekStartDate(today);
  const users = statements.leaderboardUsers.all();
  const facts = statements.leaderboardCompletionFacts.all().map(fact => ({ ...fact, dateKey: completionDateKey(fact.completed_at) }));
  return {
    entries: rankCompletionFacts(users, facts.filter(fact => fact.dateKey >= weekStart && fact.dateKey <= today)),
    weekStart,
    weekEnd: shiftDateKey(weekStart, 6)
  };
}

let leaderboardRecordedDay = '';
function recordLeaderboardAchievements(force = false) {
  const currentRanked = statements.leaderboard.all();
  const today = appDateKey();
  if (!force && leaderboardRecordedDay === today) return currentRanked;

  const users = statements.leaderboardUsers.all();
  users.forEach(user => syncIdentityAchievementsForUser(Number(user.id), user));
  const facts = statements.leaderboardCompletionFacts.all()
    .map(fact => ({ ...fact, dateKey: completionDateKey(fact.completed_at) }))
    .filter(fact => fact.dateKey && fact.dateKey <= today);
  const factsByDate = new Map();
  for (const fact of facts) {
    const group = factsByDate.get(fact.dateKey) || [];
    group.push(fact);
    factsByDate.set(fact.dateKey, group);
  }

  const recentStart = shiftDateKey(today, -30);
  const state = new Map(users.map(user => [Number(user.id), { score: 0, completedCount: 0 }]));
  const applyDay = dateKey => {
    for (const fact of factsByDate.get(dateKey) || []) {
      const value = state.get(Number(fact.user_id));
      if (!value) continue;
      value.score += Number(fact.points) || 0;
      value.completedCount += 1;
    }
  };
  const eventDates = [...factsByDate.keys()].sort();
  for (const dateKey of eventDates.filter(date => date < recentStart)) {
    applyDay(dateKey);
    awardPodium(rankFromState(users, state));
  }
  for (let dateKey = recentStart; dateKey <= today; dateKey = shiftDateKey(dateKey, 1)) {
    applyDay(dateKey);
    const dailyRanked = rankFromState(users, state);
    awardPodium(dailyRanked);
    statements.deleteDailySnapshots.run(dateKey);
    dailyRanked.forEach((entry, index) => statements.insertDailySnapshot.run(
      dateKey, Number(entry.id), index + 1, Number(entry.score), Number(entry.completed_count)
    ));
  }

  const currentWeekStart = weekStartDate(today);
  const factsByWeek = new Map();
  for (const fact of facts) {
    const weekStart = weekStartDate(fact.dateKey);
    if (weekStart >= currentWeekStart) continue;
    const group = factsByWeek.get(weekStart) || [];
    group.push(fact);
    factsByWeek.set(weekStart, group);
  }
  for (const [weekStart, weekFacts] of [...factsByWeek].sort(([a], [b]) => a.localeCompare(b))) {
    const weeklyRanked = rankCompletionFacts(users, weekFacts);
    awardPodium(weeklyRanked, 'week-');
    weeklyRanked.forEach((entry, index) => statements.insertWeeklyResult.run(
      weekStart, Number(entry.id), index + 1, Number(entry.score), Number(entry.completed_count)
    ));
  }

  for (const user of users) {
    const metrics = rankingStreakMetrics(Number(user.id));
    if (metrics.rankTop3Streak >= 5) unlockAchievementForUser(Number(user.id), 'grand-top3-5');
    if (metrics.rankTop2Streak >= 7) unlockAchievementForUser(Number(user.id), 'grand-top2-7');
    if (metrics.rankFirstStreak >= 10) unlockAchievementForUser(Number(user.id), 'grand-rank1-10');
  }
  leaderboardRecordedDay = today;
  return currentRanked;
}

function publicAchievementBadge(id) {
  const badge = ACHIEVEMENT_BADGES.find(item => item.id === id);
  return badge ? { id: badge.id, name: badge.name, icon: badge.icon, description: badge.description, tone: badge.tone, tier: badge.tier, category: badge.category } : null;
}

function normalizeHydroVerdict(value) {
  const verdict = String(value || '').trim().toUpperCase().replace(/[_ -]/g, '');
  return ['AC', 'ACCEPTED', 'STATUSACCEPTED'].includes(verdict) ? 'AC' : String(value || 'UNKNOWN').trim().toUpperCase().slice(0, 40);
}

const HYDRO_RECORD_VERDICTS = new Map([
  [0, 'WAITING'], [1, 'AC'], [2, 'WA'], [3, 'TLE'], [4, 'MLE'], [5, 'OLE'], [6, 'RE'], [7, 'CE'],
  [8, 'SE'], [9, 'IGN'], [10, 'UNKNOWN'], [11, 'HK'], [20, 'JUDGING'], [21, 'COMPILING'], [22, 'FETCHED'],
  [30, 'IGN'], [31, 'FE'], [32, 'AC'], [33, 'WA']
]);
const HYDRO_PENDING_VERDICTS = new Set(['WAITING', 'FETCHED', 'COMPILING', 'JUDGING']);

async function refreshPendingHydroSubmission(submission, userId) {
  if (!submission || !HYDRO_BASE_URL || !HYDRO_PENDING_VERDICTS.has(normalizeHydroVerdict(submission.verdict))) return submission;
  if (!/^[a-f0-9]{24}$/i.test(submission.submission_id)) return submission;
  const account = statements.findHydroAccountByUser.get(userId);
  if (!account?.verified || !account.hydro_user_id) return submission;
  try {
    const response = await fetch(`${HYDRO_BASE_URL}/record/${encodeURIComponent(submission.submission_id)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return submission;
    const result = await response.json();
    const record = result?.rdoc;
    const problem = result?.pdoc;
    if (!record || String(record._id) !== submission.submission_id) return submission;
    if (String(record.uid) !== String(account.hydro_user_id)) return submission;
    if (String(problem?.pid || '') !== submission.problem_id) return submission;
    const verdict = HYDRO_RECORD_VERDICTS.get(Number(record.status));
    if (!verdict) return submission;
    recordHydroSubmission({
      submissionId: submission.submission_id,
      userId,
      problemId: submission.problem_id,
      verdict,
      submittedAt: record.judgeAt || submission.submitted_at || new Date().toISOString(),
      requestId: submission.request_id,
      score: record.score,
      timeMs: record.time,
      memoryKb: record.memory,
      language: record.lang || submission.language
    });
    return statements.findHydroSubmissionForUser.get(submission.submission_id, userId) || submission;
  } catch {
    return submission;
  }
}

function hydroCompletionId(problemId) {
  return `HYDRO:${problemId}`;
}

function normalizeHydroTopic(track, value) {
  const topic = String(value || '').trim().toLowerCase();
  const allowed = track === 'algorithm'
    ? new Set(['foundation', 'data-structure', 'dp', 'graph'])
    : new Set(['start', 'basic', 'condition', 'loop', 'array-string', 'function-struct']);
  if (allowed.has(topic)) return topic;
  return track === 'algorithm' ? 'foundation' : '';
}

function normalizeHydroSubtopic(track, topic, value) {
  if (track !== 'algorithm') return '';
  const subtopic = String(value || '').trim().toLowerCase();
  const allowed = {
    foundation: ['simulation', 'greedy', 'binary', 'prefix-sum'],
    'data-structure': ['linear-structure', 'stack-queue', 'tree'],
    dp: ['linear-dp', 'knapsack', 'interval-dp'],
    graph: ['graph-storage', 'bfs', 'shortest-path', 'mst']
  };
  return allowed[topic]?.includes(subtopic) ? subtopic : allowed[topic]?.[0] || '';
}

function publicHydroProblem(row, completed = false) {
  const problemId = row.problem_id;
  const track = row.track === 'algorithm' ? 'algorithm' : 'grammar';
  const topic = normalizeHydroTopic(track, row.topic);
  return {
    problemId,
    title: row.title,
    points: Number(row.points),
    url: row.url || (HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/p/${encodeURIComponent(problemId)}` : ''),
    demo: Boolean(row.is_demo),
    track,
    topic,
    subtopic: normalizeHydroSubtopic(track, topic, row.subtopic),
    accepted: completed
  };
}

function recordHydroSubmission({ submissionId, userId, problemId, verdict, submittedAt, requestId = null, score = null, timeMs = null, memoryKb = null, language = null }) {
  const problem = statements.findHydroProblem.get(problemId);
  if (!problem || !problem.active) {
    const error = new Error('该 Hydro 题目还没有同步到本站或已停用。');
    error.status = 404;
    throw error;
  }
  const normalizedVerdict = normalizeHydroVerdict(verdict);
  const existing = statements.findHydroSubmission.get(submissionId);
  if (existing && (Number(existing.user_id) !== Number(userId) || existing.problem_id !== problemId)) {
    const error = new Error('提交记录编号发生冲突。');
    error.status = 409;
    throw error;
  }
  const numericScore = Number.isFinite(Number(score)) ? Math.round(Number(score)) : null;
  const numericTime = Number.isFinite(Number(timeMs)) ? Math.max(0, Math.round(Number(timeMs))) : null;
  const numericMemory = Number.isFinite(Number(memoryKb)) ? Math.max(0, Math.round(Number(memoryKb))) : null;
  if (existing) statements.updateHydroSubmission.run(normalizedVerdict, numericScore, numericTime, numericMemory, language, submittedAt, submissionId);
  else statements.addHydroSubmission.run(submissionId, userId, problemId, normalizedVerdict, requestId, numericScore, numericTime, numericMemory, language, submittedAt);
  let awarded = false;
  if (normalizedVerdict === 'AC') {
    const result = statements.addCompletion.run(userId, hydroCompletionId(problemId), Number(problem.points));
    awarded = Number(result.changes) > 0;
  }
  if (awarded) recordLeaderboardAchievements(true);
  const progress = practiceProgress(userId);
  return { problem, verdict: normalizedVerdict, awarded, progress };
}

async function callHydroBridge(path, payload, { timeoutMs = 15000 } = {}) {
  if (!HYDRO_WEBHOOK_SECRET || !HYDRO_BRIDGE_URL) {
    const error = new Error('Hydro 判题桥尚未配置。');
    error.status = 503;
    throw error;
  }
  let response;
  try {
    response = await fetch(`${HYDRO_BRIDGE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HYDRO_WEBHOOK_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (cause) {
    const error = new Error('暂时无法连接协会 OJ，请稍后重试。');
    error.status = 502;
    error.cause = cause;
    throw error;
  }
  let result = {};
  try { result = await response.json(); } catch { /* Hydro may return an empty error response. */ }
  if (!response.ok) {
    const error = new Error(result.error || result.message || `协会 OJ 返回错误（HTTP ${response.status}）。`);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw error;
  }
  return result;
}

function publicHydroAccount(account) {
  return account ? { userId: account.hydro_user_id, username: account.hydro_username, verified: Boolean(account.verified) } : null;
}

async function ensureHydroEmailBinding(user, { force = false, email: trustedEmail = user?.email } = {}) {
  if (!user) return null;
  const existing = statements.findHydroAccountByUser.get(user.id);
  if (existing?.verified && existing.hydro_user_id) return { status: 'bound', message: `已绑定：${existing.hydro_username}，可以直接提交代码。`, account: publicHydroAccount(existing) };
  const email = normalizeEmail(trustedEmail);
  const cached = hydroAutoBindAttempts.get(user.id);
  if (cached?.email === email && (cached.pending || (!force && cached.expiresAt > Date.now()))) return cached.promise;
  if (hydroAutoBindAttempts.size > 10000) {
    for (const [id, attempt] of hydroAutoBindAttempts) if (!attempt.pending && attempt.expiresAt <= Date.now()) hydroAutoBindAttempts.delete(id);
  }
  const attempt = { email, pending: true, expiresAt: Date.now() + 60000, promise: null };
  attempt.promise = (async () => {
    let status = 'unavailable';
    let message = '暂时无法自动匹配协会 OJ 账号，可以稍后重试或手动绑定。';
    try {
      if (!validEmail(email)) throw new Error('No authenticated email.');
      const result = await callHydroBridge('/account-by-email', { email }, { timeoutMs: 3000 });
      if (result.found === false) {
        status = 'not-found';
        message = '未找到与登录邮箱相同的协会 OJ 账号，请核对 OJ 邮箱后重新匹配，或手动绑定。';
      } else {
        const hydroUserId = Number(result.hydroUserId);
        const username = typeof result.hydroUsername === 'string' ? result.hydroUsername.trim() : '';
        if (result.found !== true || normalizeEmail(result.email) !== email || !Number.isSafeInteger(hydroUserId)
          || hydroUserId <= 1 || username.length < 2 || username.length > 64 || /[\u0000-\u001f]/.test(username)) {
          throw new Error('Invalid Hydro email match.');
        }
        statements.autoBindHydroAccount.run(user.id, String(hydroUserId), username);
        status = 'bound';
        message = `已按登录邮箱自动绑定：${username}，可以直接提交代码。`;
      }
    } catch (error) {
      if (String(error.code).startsWith('ERR_SQLITE_CONSTRAINT') || (Number(error.errcode) & 0xff) === 19) {
        status = 'conflict';
        message = '该协会 OJ 账号已关联其他网站账号，请联系管理员核对。';
      } else if (error.status === 409) {
        status = 'ambiguous';
        message = '邮箱对应多个协会 OJ 账号，请联系协会管理员核对，或手动绑定。';
      } else if (error.status === 403) {
        status = 'unavailable';
        message = '该协会 OJ 账号当前无法提交，请联系协会管理员。';
      }
    }
    // A manual confirmation may finish while the remote lookup is in flight.
    const account = statements.findHydroAccountByUser.get(user.id);
    if (account?.verified && account.hydro_user_id) message = `已绑定：${account.hydro_username}，可以直接提交代码。`;
    return { status: account?.verified ? 'bound' : status, message, account: publicHydroAccount(account) };
  })().finally(() => { attempt.pending = false; attempt.expiresAt = Date.now() + 60000; });
  hydroAutoBindAttempts.set(user.id, attempt);
  return attempt.promise;
}

function localizedHydroText(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return value;
    try {
      return localizedHydroText(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

  const entries = Object.entries(value).filter(([, text]) => typeof text === 'string' && text.trim());
  if (!entries.length) return '';
  const normalizedLanguage = language => language.toLowerCase().replace(/_/g, '-');
  const preferredLanguages = ['zh', 'zh-cn', 'zh-hans', 'en'];
  for (const language of preferredLanguages) {
    const match = entries.find(([key]) => normalizedLanguage(key) === language);
    if (match) return match[1];
  }
  return entries[0][1];
}

async function fetchHydroStatement(problem) {
  if (!HYDRO_BASE_URL) {
    const error = new Error('协会 OJ 地址尚未配置。');
    error.status = 503;
    throw error;
  }
  const cached = hydroStatementCache.get(problem.problem_id);
  if (cached && Date.now() - cached.loadedAt < 5 * 60 * 1000) return cached.value;
  let response;
  try {
    response = await fetch(`${HYDRO_BASE_URL}/p/${encodeURIComponent(problem.problem_id)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch (cause) {
    const error = new Error('暂时无法读取协会 OJ 题面，请稍后重试。');
    error.status = 502;
    error.cause = cause;
    throw error;
  }
  let result = {};
  try { result = await response.json(); } catch { /* Hydro may return an HTML error page. */ }
  if (!response.ok || !result?.pdoc) {
    const error = new Error(result.error || result.message || `协会 OJ 题面读取失败（HTTP ${response.status}）。`);
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  const content = localizedHydroText(result.pdoc.content);
  if (!content || Buffer.byteLength(content, 'utf8') > 512 * 1024) {
    const error = new Error(content ? '题面内容过大，请前往协会 OJ 查看。' : '这道题暂时没有可展示的题面。');
    error.status = 422;
    throw error;
  }
  const localSamples = STARTER_PACK_SAMPLES.get(problem.problem_id);
  const displayContent = localSamples && !/^##\s+.*样例/m.test(content)
    ? `${content.trim()}\n\n${localSamples}`
    : content;
  const value = {
    problemId: problem.problem_id,
    title: typeof result.pdoc.title === 'string' && result.pdoc.title.trim() ? result.pdoc.title.trim() : problem.title,
    content: displayContent,
    languages: Array.isArray(result.pdoc.config?.langs)
      ? [...new Set(result.pdoc.config.langs.filter(language => typeof language === 'string' && /^[\w.+#-]{1,40}$/.test(language)))]
      : [],
    tags: Array.isArray(result.pdoc.tag) ? result.pdoc.tag.filter(tag => typeof tag === 'string').slice(0, 12) : [],
    url: problem.url || `${HYDRO_BASE_URL}/p/${encodeURIComponent(problem.problem_id)}`
  };
  hydroStatementCache.set(problem.problem_id, { loadedAt: Date.now(), value });
  return value;
}

function appDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function learningStreak(days) {
  const values = new Set(days);
  const cursor = new Date(`${appDateKey()}T00:00:00Z`);
  let streak = 0;
  while (values.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function recordActivity(userId) {
  statements.addLearningDay.run(userId, appDateKey());
}

function learningProgress(userId) {
  const rows = statements.listLearningProgress.all(userId);
  const days = statements.listLearningDays.all(userId).map(row => row.activity_date);
  const state = statements.findLearningState.get(userId);
  return {
    cppCompleted: rows.filter(row => row.content_type === 'cpp').map(row => row.content_id),
    algorithmCompleted: rows.filter(row => row.content_type === 'algorithm').map(row => row.content_id),
    activityDays: days,
    streak: learningStreak(days),
    lastContent: state?.last_content_id ? { type: state.last_content_type, id: state.last_content_id, at: state.last_active_at } : null,
    imported: Boolean(state?.imported_at)
  };
}

function validLearningContent(type, id) {
  return typeof type === 'string' && typeof id === 'string' && LEARNING_CONTENT[type]?.has(id);
}

async function readJson(req) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    const error = new Error('请求必须使用 JSON 格式。');
    error.status = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      const error = new Error('请求内容过大。');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('JSON 格式不正确。');
    error.status = 400;
    throw error;
  }
}

function clientAddress(req) {
  const peer = String(req.socket.remoteAddress || 'unknown');
  const trustedProxy = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  if (!trustedProxy) return peer.slice(0, 80);
  const forwarded = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || peer).slice(0, 80);
}

function attemptKey(req, account) {
  return `${clientAddress(req)}:${account}`;
}

function isRateLimited(key) {
  const now = Date.now();
  const recent = (loginAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  loginAttempts.set(key, recent);
  return recent.length >= 8;
}

function recordFailedAttempt(key) {
  loginAttempts.set(key, [...(loginAttempts.get(key) || []), Date.now()]);
}

function consumeRateLimit(key, maximum, windowMs) {
  const now = Date.now();
  const recent = (deliveryAttempts.get(key) || []).filter(time => now - time < windowMs);
  if (recent.length >= maximum) {
    deliveryAttempts.set(key, recent);
    return Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
  }
  if (deliveryAttempts.size >= RATE_LIMIT_KEY_CAP && !deliveryAttempts.has(key)) {
    deliveryAttempts.delete(deliveryAttempts.keys().next().value);
  }
  deliveryAttempts.set(key, [...recent, now]);
  return 0;
}

function associationVerificationRateLimit(req, channel, email) {
  const address = clientAddress(req);
  return Math.max(
    consumeRateLimit(`code:${channel}:ip:${address}`, 20, 15 * 60 * 1000),
    consumeRateLimit(`code:${channel}:target:${email}`, 5, 60 * 60 * 1000),
    consumeRateLimit(`code:${channel}:pair:${address}:${email}`, 1, VERIFICATION_RESEND_DELAY)
  );
}

function rateLimitSubjectHash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function persistentRulesRetryAfter(rules, now = Date.now()) {
  let retryAfter = 0;
  for (const rule of rules) {
    const cutoff = now - rule.windowMs;
    const count = Number(statements.countVerificationRateEvents.get(rule.scope, rule.subjectHash, cutoff).count);
    if (count < rule.maximum) continue;
    const oldest = statements.oldestVerificationRateEvent.get(rule.scope, rule.subjectHash, cutoff);
    if (oldest) retryAfter = Math.max(retryAfter, Math.max(1, Math.ceil((rule.windowMs - (now - oldest.occurred_at)) / 1000)));
  }
  return retryAfter;
}

function externalVerificationRateLimit(req, email, channel) {
  const now = Date.now();
  const address = clientAddress(req);
  const addressHash = rateLimitSubjectHash(address);
  const emailHash = rateLimitSubjectHash(email);
  const pairHash = rateLimitSubjectHash(`${channel}\n${address}\n${email}`);
  const rules = [
    { scope: 'external-pair-minute', subjectHash: pairHash, maximum: 1, windowMs: VERIFICATION_RESEND_DELAY },
    { scope: 'external-ip-15-minute', subjectHash: addressHash, maximum: EXTERNAL_CODE_IP_15_MINUTE_LIMIT, windowMs: 15 * 60 * 1000 },
    { scope: 'external-ip-day', subjectHash: addressHash, maximum: EXTERNAL_CODE_IP_DAILY_LIMIT, windowMs: 24 * 60 * 60 * 1000 },
    { scope: 'external-target-hour', subjectHash: emailHash, maximum: EXTERNAL_CODE_TARGET_HOURLY_LIMIT, windowMs: 60 * 60 * 1000 },
    { scope: 'external-target-day', subjectHash: emailHash, maximum: EXTERNAL_CODE_TARGET_DAILY_LIMIT, windowMs: 24 * 60 * 60 * 1000 }
  ];
  const retryAfter = persistentRulesRetryAfter(rules, now);
  if (retryAfter) return retryAfter;
  for (const rule of rules) statements.insertVerificationRateEvent.run(rule.scope, rule.subjectHash, now);
  return 0;
}

function globalDeliveryRules() {
  const subjectHash = rateLimitSubjectHash('algospark-smtp');
  return [
    { scope: 'external-delivery', subjectHash, maximum: SMTP_HOURLY_LIMIT, windowMs: 60 * 60 * 1000 },
    { scope: 'external-delivery', subjectHash, maximum: SMTP_DAILY_LIMIT, windowMs: 24 * 60 * 60 * 1000 }
  ];
}

function globalDeliveryRetryAfter() {
  return persistentRulesRetryAfter(globalDeliveryRules());
}

function reserveGlobalDelivery() {
  const now = Date.now();
  const rules = globalDeliveryRules();
  const retryAfter = persistentRulesRetryAfter(rules, now);
  if (retryAfter) return { retryAfter, eventId: null };
  for (const rule of rules) {
    const current = Number(statements.countVerificationRateEvents.get(rule.scope, rule.subjectHash, now - rule.windowMs).count);
    if (current + 1 === Math.ceil(rule.maximum * 0.8)) {
      const period = rule.windowMs === 60 * 60 * 1000 ? '小时' : '24 小时';
      console.warn(`外校验证码发件量已达到 ${period}额度的 80%（${current + 1}/${rule.maximum}）。`);
    }
  }
  const result = statements.insertVerificationRateEvent.run(rules[0].scope, rules[0].subjectHash, now);
  return { retryAfter: 0, eventId: Number(result.lastInsertRowid) };
}

async function validateTurnstile(req, token) {
  if (!TURNSTILE_ENABLED) return { success: true, retryAfter: 0 };
  const address = clientAddress(req);
  const retryAfter = consumeRateLimit(`turnstile:ip:${address}`, 30, 15 * 60 * 1000);
  if (retryAfter) return { success: false, retryAfter };
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) return { success: false, retryAfter: 0 };
  const form = new URLSearchParams({ secret: TURNSTILE_SECRET_KEY, response: token.trim() });
  if (address && address !== 'unknown') form.set('remoteip', address);
  let response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    const failure = new Error(`人机验证服务暂时不可用：${error.message}`);
    failure.status = 503;
    throw failure;
  }
  if (!response.ok) {
    const failure = new Error('人机验证服务暂时不可用，请稍后重试。');
    failure.status = 503;
    throw failure;
  }
  const result = await response.json().catch(() => ({}));
  return { success: result.success === true && (!result.action || result.action === 'external-code'), retryAfter: 0 };
}

function genericCodePayload() {
  return {
    message: GENERIC_CODE_MESSAGE,
    expiresIn: VERIFICATION_AGE / 1000,
    retryAfter: VERIFICATION_RESEND_DELAY / 1000
  };
}

async function prepareVerification(email, purpose, eligible) {
  if (!eligible) return { sent: false, retryAfter: 0 };
  const reservation = reserveGlobalDelivery();
  if (reservation.retryAfter) return { sent: false, retryAfter: reservation.retryAfter };
  try {
    const code = String(randomInt(100000, 1000000));
    const codeHash = await hashPassword(code);
    await sendVerificationEmail(email, code, purpose);
    const now = Date.now();
    statements.saveVerification.run(email, codeHash, now + VERIFICATION_AGE, now);
    return { sent: true, retryAfter: 0 };
  } catch (error) {
    if (reservation.eventId) statements.deleteVerificationRateEvent.run(reservation.eventId);
    // Keep public responses identical so mailbox/account existence is not exposed.
    console.error(`验证码发送失败（${purpose}）：${error.message}`);
    return { sent: false, retryAfter: 0 };
  }
}

async function enforceExternalCodeSecurity(req, res, body, email, channel) {
  const turnstile = await validateTurnstile(req, body.turnstileToken);
  if (turnstile.retryAfter) {
    sendJson(res, 429, { error: `人机验证请求过于频繁，请 ${turnstile.retryAfter} 秒后再试。`, retryAfter: turnstile.retryAfter });
    return false;
  }
  if (!turnstile.success) {
    sendJson(res, 400, { error: '请先完成人机验证后再获取验证码。' });
    return false;
  }
  const retryAfter = externalVerificationRateLimit(req, email, channel);
  if (retryAfter) {
    sendJson(res, 429, { error: `请求过于频繁，请 ${retryAfter} 秒后再试。`, retryAfter });
    return false;
  }
  const deliveryRetryAfter = globalDeliveryRetryAfter();
  if (deliveryRetryAfter) {
    console.warn(`外校验证码发件额度已触发熔断，${deliveryRetryAfter} 秒后可重试。`);
    sendJson(res, 429, { error: '验证码邮件发送繁忙，请稍后再试。', retryAfter: deliveryRetryAfter });
    return false;
  }
  return true;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/vp/contests') {
    return sendJson(res, 200, VP_CATALOG);
  }
  if (pathname === '/api/vp/progress' || pathname === '/api/vp/completion') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再记录 VP 场次。' });
    if (req.method === 'POST' && pathname === '/api/vp/completion') {
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'VP 状态不正确。' });
      if (!VP_CONTEST_IDS.has(body.contestId)) return sendJson(res, 400, { error: '比赛不在当前 VP 目录中。' });
      if (typeof body.completed !== 'boolean') return sendJson(res, 400, { error: 'VP 状态不正确。' });
      if (body.completed) {
        db.prepare('INSERT OR IGNORE INTO vp_completions (user_id, contest_id) VALUES (?, ?)').run(user.id, body.contestId);
      } else {
        db.prepare('DELETE FROM vp_completions WHERE user_id = ? AND contest_id = ?').run(user.id, body.contestId);
      }
    } else if (!(req.method === 'GET' && pathname === '/api/vp/progress')) {
      return sendJson(res, 405, { error: '请求方法不支持。' });
    }
    return sendJson(res, 200, { completions: db.prepare('SELECT contest_id AS contestId, completed_at AS completedAt FROM vp_completions WHERE user_id = ? ORDER BY completed_at DESC, contest_id').all(user.id) });
  }
  if (req.method === 'GET' && pathname === '/api/auth/code-security-config') {
    return sendJson(res, 200, { turnstileSiteKey: TURNSTILE_ENABLED ? TURNSTILE_SITE_KEY : '' });
  }

  if (req.method === 'GET' && pathname === '/api/resources') {
    statements.claimSeedLearningResource.run('https://www.cnblogs.com/yuyang-/p/22634975');
    const resources = statements.listLearningResources.all().map(row => ({
      id: Number(row.id),
      title: row.title,
      type: row.resource_type === 'pdf' ? 'pdf' : 'link',
      url: row.resource_type === 'pdf' ? resourcePdfUrl(row.id) : row.url,
      fileName: row.resource_type === 'pdf' ? row.file_name : null,
      fileSize: row.resource_type === 'pdf' ? Number(row.file_size || 0) : null,
      createdAt: row.created_at,
      publisher: row.publisher_id ? {
        id: Number(row.publisher_id),
        nickname: row.publisher_nickname,
        realName: row.publisher_real_name
      } : null
    }));
    return sendJson(res, 200, { resources, total: resources.length });
  }

  const resourcePdfMatch = pathname.match(/^\/api\/resources\/(\d+)\/pdf$/);
  if (resourcePdfMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const resource = statements.findLearningResourcePdf.get(Number(resourcePdfMatch[1]));
    if (!resource || !/^[a-f0-9]{48}\.pdf$/.test(resource.storage_key || '')) {
      return sendJson(res, 404, { error: '没有找到这份 PDF 学习资料。' });
    }
    try {
      const file = readFileSync(join(RESOURCE_PDF_DIR, resource.storage_key));
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': file.length,
        'Content-Disposition': safePdfContentDisposition(resource.file_name || 'resource.pdf'),
        'Cache-Control': 'private, no-store',
        'Content-Security-Policy': 'sandbox',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(req.method === 'HEAD' ? undefined : file);
    } catch {
      return sendJson(res, 404, { error: 'PDF 文件已丢失，请联系管理员重新上传。' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/resources/pdf') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const title = String(requestUrl.searchParams.get('title') || '').trim();
    const fileName = normalizeResourcePdfName(requestUrl.searchParams.get('filename'));
    if (!title || title.length > 120 || /[\u0000-\u001f]/.test(title)) {
      return sendJson(res, 400, { error: '资源标题不能为空且不能超过 120 个字符。' });
    }
    if (!fileName) return sendJson(res, 400, { error: '请选择文件名正确的 PDF 文件。' });
    const file = await readResourcePdf(req);
    const storageKey = `${randomBytes(24).toString('hex')}.pdf`;
    const filePath = join(RESOURCE_PDF_DIR, storageKey);
    writeFileSync(filePath, file, { flag: 'wx' });
    try {
      const inserted = statements.insertLearningResourcePdf.run(title, `pdf:${storageKey}`, fileName, file.length, storageKey, admin.id);
      const id = Number(inserted.lastInsertRowid);
      return sendJson(res, 201, {
        message: 'PDF 学习资料上传成功。',
        resource: {
          id,
          title,
          type: 'pdf',
          url: resourcePdfUrl(id),
          fileName,
          fileSize: file.length,
          createdAt: new Date().toISOString(),
          publisher: { id: Number(admin.id), nickname: admin.nickname, realName: admin.real_name }
        }
      });
    } catch (error) {
      try { unlinkSync(filePath); } catch {}
      throw error;
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/resources') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const body = await readJson(req);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const url = normalizeLearningResourceUrl(body.url);
    if (!title || title.length > 120 || /[\u0000-\u001f]/.test(title)) {
      return sendJson(res, 400, { error: '资源标题不能为空且不能超过 120 个字符。' });
    }
    if (!url) return sendJson(res, 400, { error: '请输入正确的 http:// 或 https:// 资源网址。' });
    try {
      const inserted = statements.insertLearningResource.run(title, url, admin.id);
      return sendJson(res, 201, {
        message: '学习资源发布成功。',
        resource: {
          id: Number(inserted.lastInsertRowid),
          title,
          type: 'link',
          url,
          createdAt: new Date().toISOString(),
          publisher: { id: Number(admin.id), nickname: admin.nickname, realName: admin.real_name }
        }
      });
    } catch (error) {
      if (Number(error.errcode) === 2067 || /UNIQUE constraint failed/i.test(String(error.message))) {
        return sendJson(res, 409, { error: '这个资源网址已经发布过了。' });
      }
      throw error;
    }
  }

  const resourceAdminMatch = pathname.match(/^\/api\/admin\/resources\/(\d+)$/);
  if (resourceAdminMatch && req.method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 120 || /[\u0000-\u001f]/.test(title)) {
      return sendJson(res, 400, { error: '资源标题不能为空且不能超过 120 个字符。' });
    }
    const updated = statements.updateLearningResourceTitle.run(title, Number(resourceAdminMatch[1]));
    if (!updated.changes) return sendJson(res, 404, { error: '没有找到这条学习资源。' });
    return sendJson(res, 200, { message: '资源标题修改成功。', resource: { id: Number(resourceAdminMatch[1]), title } });
  }

  if (resourceAdminMatch && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const withdrawn = statements.withdrawLearningResource.run(Number(resourceAdminMatch[1]));
    if (!withdrawn.changes) return sendJson(res, 404, { error: '没有找到这条学习资源。' });
    return sendJson(res, 200, { message: '学习资源已撤回。' });
  }

  if (req.method === 'GET' && ['/api/admin/hydro/progress', '/api/admin/hydro/progress/export'].includes(pathname)) {
    if (!requireAdmin(req, res)) return;
    let filters;
    try {
      filters = parseHydroProgressFilters(new URL(req.url, 'http://localhost').searchParams);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    const report = createHydroProgressReport(db, filters);
    if (pathname.endsWith('/export')) {
      const content = await createHydroProgressWorkbook(report);
      const filename = `algospark-oj-progress-${report.generatedAt.slice(0, 10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': content.length,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(content);
    }
    return sendJson(res, 200, report);
  }

  if (req.method === 'GET' && pathname === '/api/admin/hydro') {
    if (!requireAdmin(req, res)) return;
    const submissionStats = statements.adminSubmissionStats.get();
    const problems = statements.listAllHydroProblems.all().map(row => ({
      problemId: row.problem_id,
      title: row.title,
      points: Number(row.points),
      url: row.url || (HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/p/${encodeURIComponent(row.problem_id)}` : ''),
      active: Boolean(row.active),
      demo: Boolean(row.is_demo),
      track: row.track === 'algorithm' ? 'algorithm' : 'grammar',
      updatedAt: row.updated_at
    }));
    const submissions = statements.listRecentHydroSubmissions.all(100).map(row => ({
      submissionId: row.submission_id,
      problemId: row.problem_id,
      title: row.title,
      verdict: row.verdict,
      score: row.score,
      timeMs: row.time_ms,
      memoryKb: row.memory_kb,
      language: row.language,
      submittedAt: row.submitted_at,
      receivedAt: row.received_at,
      nickname: row.nickname,
      realName: row.real_name,
      hydroUsername: row.hydro_username
    }));
    return sendJson(res, 200, {
      configured: Boolean(HYDRO_WEBHOOK_SECRET && HYDRO_BRIDGE_URL),
      hydroBaseUrl: HYDRO_BASE_URL,
      stats: {
        users: Number(statements.countUsers.get().count),
        verifiedAccounts: Number(statements.countVerifiedHydroAccounts.get().count),
        problems: problems.filter(problem => problem.active && !problem.demo).length,
        submissions: Number(submissionStats.total),
        accepted: Number(submissionStats.accepted),
        participants: Number(submissionStats.participants)
      },
      problems,
      submissions
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/hydro/problems') {
    if (!requireAdmin(req, res)) return;
    const body = await readJson(req);
    const problemId = typeof body.problemId === 'string' ? body.problemId.trim() : '';
    const points = Number(body.points);
    const track = body.track === 'algorithm' ? 'algorithm' : 'grammar';
    const topic = normalizeHydroTopic(track, body.topic);
    const subtopic = normalizeHydroSubtopic(track, topic, body.subtopic);
    if (!problemId || problemId.length > 80 || /[\u0000-\u001f/]/.test(problemId)) return sendJson(res, 400, { error: '请输入正确的 Hydro 题号。' });
    if (!Number.isInteger(points) || points < 1 || points > 1000) return sendJson(res, 400, { error: '积分必须是 1 到 1000 的整数。' });
    let title = typeof body.title === 'string' ? body.title.trim() : '';
    let hydroProblem = null;
    if (body.verifyHydro !== false) {
      hydroProblem = await callHydroBridge('/problem', { problemId });
      title = typeof hydroProblem.title === 'string' ? hydroProblem.title.trim() : title;
    }
    if (!title || title.length > 200) return sendJson(res, 400, { error: '题目名称不能为空且不能超过 200 个字符。' });
    const suppliedUrl = typeof body.url === 'string' ? body.url.trim() : '';
    if (suppliedUrl && !/^https?:\/\//i.test(suppliedUrl)) return sendJson(res, 400, { error: '题目链接必须以 http:// 或 https:// 开头。' });
    const url = suppliedUrl || (HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/p/${encodeURIComponent(problemId)}` : '');
    statements.upsertHydroProblem.run(problemId, title, points, url, body.active === false ? 0 : 1, track, topic, subtopic);
    statements.updateCompletionPoints.run(points, hydroCompletionId(problemId));
    recordLeaderboardAchievements(true);
    const problem = statements.findHydroProblem.get(problemId);
    return sendJson(res, 200, {
      message: hydroProblem ? `已从协会 Hydro 校验并发布题目 ${problemId}。` : `题目 ${problemId} 已保存。`,
      problem: { ...publicHydroProblem(problem), active: Boolean(problem.active), languages: hydroProblem?.languages || [] }
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/hydro/starter-pack') {
    if (!requireAdmin(req, res)) return;
    if (!STARTER_PACK_MANIFEST.length) return sendJson(res, 503, { error: '服务器中没有找到原创入门题包清单。' });
    const results = await Promise.allSettled(STARTER_PACK_MANIFEST.map(async item => {
      const problemId = String(item.pid || '').trim();
      const points = Number(item.points);
      const track = item.track === 'algorithm' ? 'algorithm' : 'grammar';
      const topic = normalizeHydroTopic(track, item.topic);
      const subtopic = normalizeHydroSubtopic(track, topic, item.subtopic);
      if (!problemId || !Number.isInteger(points) || points < 1 || points > 1000) throw new Error('题包清单配置不正确。');
      const hydroProblem = await callHydroBridge('/problem', { problemId });
      const title = typeof hydroProblem.title === 'string' ? hydroProblem.title.trim() : '';
      if (!title) throw new Error('Hydro 没有返回题目名称。');
      const url = HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/p/${encodeURIComponent(problemId)}` : '';
      statements.upsertHydroProblem.run(problemId, title, points, url, 1, track, topic, subtopic);
      statements.updateCompletionPoints.run(points, hydroCompletionId(problemId));
      return { problemId, title, points, track, topic, subtopic, languages: hydroProblem.languages || [] };
    }));
    const published = [];
    const failed = [];
    results.forEach((result, index) => {
      const item = STARTER_PACK_MANIFEST[index];
      if (result.status === 'fulfilled') published.push(result.value);
      else failed.push({ problemId: item.pid, error: result.reason?.message || '发布失败。' });
    });
    return sendJson(res, 200, {
      message: failed.length
        ? `已发布 ${published.length} 道题，${failed.length} 道题未能发布。`
        : `原创入门题包的 ${published.length} 道题已全部发布。`,
      total: STARTER_PACK_MANIFEST.length,
      published,
      failed
    });
  }

  if (req.method === 'POST' && pathname === '/api/admin/hydro/starter-pack/update-statements') {
    if (!requireAdmin(req, res)) return;
    if (!STARTER_PACK_MANIFEST.length) return sendJson(res, 503, { error: '服务器中没有找到原创入门题包清单。' });
    const results = await Promise.allSettled(STARTER_PACK_MANIFEST.map(async item => {
      const problemId = String(item.pid || '').trim();
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const content = STARTER_PACK_CONTENT.get(problemId) || '';
      const tags = Array.isArray(item.tags) ? item.tags.filter(tag => typeof tag === 'string').slice(0, 12) : [];
      if (!/^AS10(?:0[1-9]|1\d|2[0-4])$/.test(problemId) || !title || !content) throw new Error('题包题面配置不完整。');
      const updated = await callHydroBridge('/update-statement', { problemId, title, content, tags });
      hydroStatementCache.delete(problemId);
      return { problemId, title: updated.title || title };
    }));
    const updated = [];
    const failed = [];
    results.forEach((result, index) => {
      const item = STARTER_PACK_MANIFEST[index];
      if (result.status === 'fulfilled') updated.push(result.value);
      else failed.push({ problemId: item.pid, error: result.reason?.message || '更新失败。' });
    });
    return sendJson(res, 200, {
      message: failed.length
        ? `已将 ${updated.length} 道题的样例同步到协会 OJ，${failed.length} 道失败。`
        : `已将 ${updated.length} 道题的样例全部同步到协会 OJ。`,
      total: STARTER_PACK_MANIFEST.length,
      updated,
      failed
    });
  }

  const adminProblemStatusMatch = pathname.match(/^\/api\/admin\/hydro\/problems\/([^/]+)\/status$/);
  if (req.method === 'POST' && adminProblemStatusMatch) {
    if (!requireAdmin(req, res)) return;
    const problemId = decodeURIComponent(adminProblemStatusMatch[1]);
    const problem = statements.findHydroProblem.get(problemId);
    if (!problem || problem.is_demo) return sendJson(res, 404, { error: '找不到可管理的协会 OJ 题目。' });
    const body = await readJson(req);
    if (typeof body.active !== 'boolean') return sendJson(res, 400, { error: '上下架状态不正确。' });
    const topic = normalizeHydroTopic(problem.track, problem.topic);
    statements.upsertHydroProblem.run(problem.problem_id, problem.title, problem.points, problem.url, body.active ? 1 : 0, problem.track, topic, normalizeHydroSubtopic(problem.track, topic, problem.subtopic));
    return sendJson(res, 200, { message: `题目 ${problemId} 已${body.active ? '上架' : '下架'}。`, active: body.active });
  }

  if (req.method === 'POST' && pathname === '/api/integrations/hydro/problem') {
    if (!hasHydroWebhookAccess(req)) return sendJson(res, 401, { error: 'Hydro 同步密钥无效。' });
    const body = await readJson(req);
    const problemId = typeof body.problemId === 'string' ? body.problemId.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const points = Number(body.points);
    const track = body.track === 'algorithm' ? 'algorithm' : 'grammar';
    const topic = normalizeHydroTopic(track, body.topic);
    const subtopic = normalizeHydroSubtopic(track, topic, body.subtopic);
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!problemId || problemId.length > 80 || !title || title.length > 200) return sendJson(res, 400, { error: '题号或题目名称不正确。' });
    if (!Number.isInteger(points) || points < 1 || points > 1000) return sendJson(res, 400, { error: '题目积分必须是 1 到 1000 的整数。' });
    if (url && !/^https?:\/\//i.test(url)) return sendJson(res, 400, { error: '题目链接必须以 http:// 或 https:// 开头。' });
    statements.upsertHydroProblem.run(problemId, title, points, url, body.active === false ? 0 : 1, track, topic, subtopic);
    statements.updateCompletionPoints.run(points, hydroCompletionId(problemId));
    recordLeaderboardAchievements(true);
    return sendJson(res, 200, { message: `题目 ${problemId} 已同步到本站。`, problem: publicHydroProblem(statements.findHydroProblem.get(problemId)) });
  }

  if (req.method === 'POST' && pathname === '/api/integrations/hydro/account') {
    if (!hasHydroWebhookAccess(req)) return sendJson(res, 401, { error: 'Hydro 同步密钥无效。' });
    const body = await readJson(req);
    const username = typeof body.hydroUsername === 'string' ? body.hydroUsername.trim() : '';
    const hydroUserId = body.hydroUserId === undefined || body.hydroUserId === null ? '' : String(body.hydroUserId).trim();
    const linkCode = typeof body.linkCode === 'string' ? body.linkCode.trim() : '';
    const pending = username ? statements.findPendingHydroAccount.get(username) : null;
    if (!pending || !hydroUserId || !/^\d{6}$/.test(linkCode)) return sendJson(res, 400, { error: 'Hydro 账号绑定信息不完整。' });
    if (!pending.link_code_hash || Number(pending.link_expires_at) <= Date.now() || !safeSecretEqual(tokenHash(linkCode), pending.link_code_hash)) {
      return sendJson(res, 400, { error: '绑定码错误或已过期，请回到网站重新生成。' });
    }
    try {
      statements.verifyHydroAccount.run(hydroUserId, pending.user_id);
    } catch (error) {
      if (String(error.code).startsWith('ERR_SQLITE_CONSTRAINT')) return sendJson(res, 409, { error: '该 Hydro 账号已经绑定其他网站账号。' });
      throw error;
    }
    return sendJson(res, 200, { message: `Hydro 账号 ${username} 绑定成功。` });
  }

  if (req.method === 'POST' && pathname === '/api/integrations/hydro/submission') {
    if (!hasHydroWebhookAccess(req)) return sendJson(res, 401, { error: 'Hydro 同步密钥无效。' });
    const body = await readJson(req);
    const submissionId = typeof body.submissionId === 'string' ? body.submissionId.trim() : '';
    const problemId = typeof body.problemId === 'string' ? body.problemId.trim() : '';
    if (!submissionId || submissionId.length > 120 || !problemId) return sendJson(res, 400, { error: '缺少提交编号或题号。' });
    let userId = null;
    if (body.hydroUserId !== undefined && body.hydroUserId !== null) userId = statements.findHydroAccountByUid.get(String(body.hydroUserId))?.user_id;
    if (!userId && typeof body.hydroUsername === 'string') userId = statements.findHydroAccountByUsername.get(body.hydroUsername.trim())?.user_id;
    if (!userId && Number.isInteger(Number(body.websiteUserId))) userId = statements.findUserById.get(Number(body.websiteUserId))?.id;
    if (!userId) return sendJson(res, 404, { error: '找不到与该 Hydro 提交绑定的网站账号。' });
    const parsedTime = typeof body.submittedAt === 'string' && !Number.isNaN(Date.parse(body.submittedAt)) ? new Date(body.submittedAt).toISOString() : new Date().toISOString();
    const result = recordHydroSubmission({
      submissionId,
      userId,
      problemId,
      verdict: body.verdict,
      submittedAt: parsedTime,
      requestId: body.requestId,
      score: body.score,
      timeMs: body.timeMs ?? body.time,
      memoryKb: body.memoryKb ?? body.memory,
      language: typeof body.language === 'string' ? body.language.slice(0, 40) : null
    });
    return sendJson(res, 200, {
      message: result.verdict === 'AC' ? (result.awarded ? `判题通过，已增加 ${result.problem.points} 积分。` : '判题通过，该题积分之前已经发放。') : `已记录判题结果 ${result.verdict}。`,
      verdict: result.verdict,
      awarded: result.awarded,
      ...result.progress
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/association/send-code') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return sendJson(res, 400, { error: '请输入协会官网绑定的有效邮箱。' });
    const retryAfter = associationVerificationRateLimit(req, 'association', email);
    if (retryAfter) return sendJson(res, 429, { error: `请求过于频繁，请 ${retryAfter} 秒后再试。`, retryAfter });
    try {
      await associationAuthRequest('/user/external/send-code', { email });
    } catch (error) {
      console.error(`协会验证码请求失败：${error.message}`);
    }
    return sendJson(res, 202, genericCodePayload());
  }

  if (req.method === 'POST' && pathname === '/api/auth/association/login') {
    const body = await readJson(req);
    const loginType = body.loginType === 'code' ? 'code' : body.loginType === 'password' ? 'password' : '';
    const suppliedAccount = typeof body.account === 'string' ? body.account.trim() : '';
    const account = validEmail(normalizeEmail(suppliedAccount)) ? normalizeEmail(suppliedAccount) : suppliedAccount;
    const credential = typeof body.credential === 'string' ? body.credential : '';
    if (!loginType || !account || account.length > 254) return sendJson(res, 400, { error: '请输入正确的协会官网账号信息。' });
    if (loginType === 'code' && (!validEmail(normalizeEmail(account)) || !/^\d{6}$/.test(credential.trim()))) {
      return sendJson(res, 400, { error: '请输入协会官网绑定邮箱和 6 位验证码。' });
    }
    if (loginType === 'password' && (!credential || credential.length > 256)) return sendJson(res, 400, { error: '请输入协会官网密码。' });
    const key = attemptKey(req, `association:${account.toLowerCase()}`);
    if (isRateLimited(key)) return sendJson(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试。' });
    let info;
    try {
      info = await associationAuthRequest('/user/external/login', { loginType, account, credential: loginType === 'code' ? credential.trim() : credential });
    } catch (error) {
      if (error.status === 401) recordFailedAttempt(key);
      throw error;
    }
    const user = await syncAssociationUser(info);
    const hydroBinding = await ensureHydroEmailBinding(user, { force: true, email: info.email });
    loginAttempts.delete(key);
    const session = createSession(user.id, Boolean(body.remember));
    return sendJson(res, 200, { message: '协会官网账号登录成功。', user: publicUser(user), hydroBinding }, {
      'Set-Cookie': sessionCookie(session.token, session.cookieAge)
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/send-login-code') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return sendJson(res, 400, { error: '请输入有效的邮箱地址。' });
    if (!(await enforceExternalCodeSecurity(req, res, body, email, 'login'))) return;
    const user = statements.findUserByEmail.get(email);
    const existing = statements.findVerification.get(email);
    const now = Date.now();
    const eligible = Boolean(user && (!existing || now - existing.last_sent_at >= VERIFICATION_RESEND_DELAY));
    await prepareVerification(email, '登录', eligible);
    return sendJson(res, 202, genericCodePayload());
  }

  if (req.method === 'POST' && pathname === '/api/auth/code-login') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode.trim() : '';
    if (!validEmail(email) || !/^\d{6}$/.test(verificationCode)) return sendJson(res, 400, { error: '请输入邮箱和 6 位登录验证码。' });
    const key = attemptKey(req, `email-code:${email}`);
    if (isRateLimited(key)) return sendJson(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试。' });
    const user = statements.findUserByEmail.get(email);
    const verification = statements.findVerification.get(email);
    const usableVerification = Boolean(verification && verification.expires_at > Date.now() && verification.failed_attempts < 5);
    const validCode = await verifyPassword(verificationCode, usableVerification ? verification.code_hash : DUMMY_PASSWORD_HASH);
    if (!user || !usableVerification || !validCode) {
      if (verification) statements.failVerification.run(email);
      recordFailedAttempt(key);
      return sendJson(res, 400, { error: '邮箱或验证码不正确，请重新获取后再试。' });
    }
    statements.deleteVerification.run(email);
    loginAttempts.delete(key);
    const hydroBinding = await ensureHydroEmailBinding(user, { force: true });
    const session = createSession(user.id, Boolean(body.remember));
    return sendJson(res, 200, { message: '邮箱验证码登录成功。', user: publicUser(user), hydroBinding }, {
      'Set-Cookie': sessionCookie(session.token, session.cookieAge)
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/send-verification-code') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) return sendJson(res, 400, { error: '请输入有效的邮箱地址。' });
    if (!(await enforceExternalCodeSecurity(req, res, body, email, 'register'))) return;
    const user = statements.findUserByEmail.get(email);
    const existing = statements.findVerification.get(email);
    const now = Date.now();
    const eligible = Boolean(!user && (!existing || now - existing.last_sent_at >= VERIFICATION_RESEND_DELAY));
    await prepareVerification(email, '注册', eligible);
    return sendJson(res, 202, genericCodePayload());
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const body = await readJson(req);
    const error = validateRegistration(body);
    if (error) return sendJson(res, 400, { error });
    const email = normalizeEmail(body.email);
    const existingUser = statements.findUserByEmail.get(email);
    const verificationCode = typeof body.verificationCode === 'string' ? body.verificationCode.trim() : '';
    const verification = statements.findVerification.get(email);
    if (!/^\d{6}$/.test(verificationCode)) return sendJson(res, 400, { error: '请输入 6 位邮箱验证码。' });
    const usableVerification = Boolean(verification && verification.expires_at > Date.now() && verification.failed_attempts < 5);
    const validCode = await verifyPassword(verificationCode, usableVerification ? verification.code_hash : DUMMY_PASSWORD_HASH);
    if (existingUser || !usableVerification || !validCode) {
      if (verification) statements.failVerification.run(email);
      return sendJson(res, 400, { error: '无法完成注册，请检查邮箱和验证码。' });
    }
    const passwordHash = await hashPassword(body.password);
    let result;
    try {
      result = statements.insertUser.run(email, passwordHash, body.nickname.trim(), body.realName.trim(), body.school.trim());
    } catch (dbError) {
      if (String(dbError.code).startsWith('ERR_SQLITE_CONSTRAINT')) return sendJson(res, 400, { error: '无法完成注册，请检查邮箱和验证码。' });
      throw dbError;
    }
    statements.deleteVerification.run(email);
    const user = statements.findUserById.get(result.lastInsertRowid);
    const hydroBinding = await ensureHydroEmailBinding(user, { force: true });
    const session = createSession(user.id, Boolean(body.remember));
    return sendJson(res, 201, { message: '注册成功。', user: publicUser(user), hydroBinding }, {
      'Set-Cookie': sessionCookie(session.token, session.cookieAge)
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) return sendJson(res, 400, { error: '请输入邮箱和密码。' });
    const key = attemptKey(req, email);
    if (isRateLimited(key)) return sendJson(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试。' });
    const user = statements.findUserByEmail.get(email);
    const validPassword = await verifyPassword(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    const valid = Boolean(user && validPassword);
    if (!valid) {
      recordFailedAttempt(key);
      return sendJson(res, 401, { error: '邮箱或密码错误。' });
    }
    loginAttempts.delete(key);
    const hydroBinding = await ensureHydroEmailBinding(user, { force: true });
    const session = createSession(user.id, Boolean(body.remember));
    return sendJson(res, 200, { message: '登录成功。', user: publicUser(user), hydroBinding }, {
      'Set-Cookie': sessionCookie(session.token, session.cookieAge)
    });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) statements.deleteSession.run(tokenHash(token));
    return sendJson(res, 200, { message: '已退出登录。' }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '尚未登录。' });
    const hydroBinding = await ensureHydroEmailBinding(user);
    return sendJson(res, 200, { user: publicUser(user), hydroBinding });
  }

  if (req.method === 'POST' && pathname === '/api/profile/avatar') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再更换头像背景。' });
    const body = await readJson(req);
    const avatarTheme = typeof body.avatarTheme === 'string' ? body.avatarTheme.trim() : '';
    if (!AVATAR_THEMES.has(avatarTheme)) return sendJson(res, 400, { error: '请选择网站提供的头像背景。' });
    const progress = practiceProgress(user.id);
    const option = progress.collection.avatarThemes.find(item => item.id === avatarTheme);
    if (!option?.unlocked) {
      const error = option?.requiredBadges
        ? `该头像背景需要累计获得 ${option.requiredBadges} 枚徽章。`
        : `该头像背景需要达到 ${option?.requiredScore || 0} 积分后解锁。`;
      return sendJson(res, 403, { error, requiredScore: option?.requiredScore || 0, requiredBadges: option?.requiredBadges || 0, currentBadges: option?.currentBadges || 0, currentScore: progress.score });
    }
    statements.updateAvatarTheme.run(avatarTheme, user.id);
    const updatedUser = statements.findUserById.get(user.id);
    return sendJson(res, 200, { message: '头像背景已更新。', user: publicUser(updatedUser) });
  }

  if (req.method === 'POST' && pathname === '/api/profile/collection') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再更换个人装扮。' });
    const body = await readJson(req);
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const value = typeof body.value === 'string' ? body.value.trim() : '';
    const progress = practiceProgress(user.id);

    if (type === 'achievement') {
      if (value && !ACHIEVEMENT_BADGE_IDS.has(value)) return sendJson(res, 400, { error: '请选择网站提供的成就徽章。' });
      const achievement = progress.collection.achievements.find(item => item.id === value);
      if (value && !achievement?.unlocked) return sendJson(res, 403, { error: '这个成就尚未达成。' });
      statements.updateAchievementBadge.run(value, user.id);
    } else if (type === 'frame') {
      if (!AVATAR_FRAMES.has(value)) return sendJson(res, 400, { error: '请选择网站提供的头像边框。' });
      const option = progress.collection.frames.find(item => item.id === value);
      if (!option?.unlocked) {
        const error = option?.requiredBadges ? `该头像边框需要累计获得 ${option.requiredBadges} 枚徽章。` : `该头像边框需要达到 ${option?.requiredScore || 0} 积分后解锁。`;
        return sendJson(res, 403, { error, requiredScore: option?.requiredScore || 0, requiredBadges: option?.requiredBadges || 0, currentBadges: option?.currentBadges || 0, currentScore: progress.score });
      }
      statements.updateAvatarFrame.run(value, user.id);
    } else if (type === 'decor') {
      if (!PROFILE_DECORS.has(value)) return sendJson(res, 400, { error: '请选择网站提供的主页装饰。' });
      const option = progress.collection.decors.find(item => item.id === value);
      if (!option?.unlocked) {
        const error = option?.requiredBadges ? `该主页装饰需要累计获得 ${option.requiredBadges} 枚徽章。` : `该主页装饰需要达到 ${option?.requiredScore || 0} 积分后解锁。`;
        return sendJson(res, 403, { error, requiredScore: option?.requiredScore || 0, requiredBadges: option?.requiredBadges || 0, currentBadges: option?.currentBadges || 0, currentScore: progress.score });
      }
      statements.updateProfileDecor.run(value, user.id);
    } else {
      return sendJson(res, 400, { error: '未知的装扮类型。' });
    }

    const updatedUser = statements.findUserById.get(user.id);
    const messages = { achievement: '排行榜昵称徽记已更新。', frame: '头像边框已更新。', decor: '个人主页装饰已更新。' };
    return sendJson(res, 200, { message: messages[type], user: publicUser(updatedUser), collection: progress.collection });
  }

  if (req.method === 'GET' && pathname === '/api/notifications') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后查看消息。' });
    const notifications = statements.listNotifications.all(user.id).map(row => ({
      id: Number(row.id),
      type: row.type,
      title: row.title,
      message: row.message,
      achievement: publicAchievementBadge(row.achievement_id),
      read: Boolean(row.is_read),
      createdAt: row.created_at
    }));
    const unreadCount = Number(statements.countUnreadNotifications.get(user.id).count);
    return sendJson(res, 200, { notifications, unreadCount });
  }

  if (req.method === 'POST' && pathname === '/api/notifications/read') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后管理消息。' });
    statements.markAllNotificationsRead.run(user.id);
    return sendJson(res, 200, { message: '消息已全部标记为已读。', unreadCount: 0 });
  }

  const publicProfileMatch = pathname.match(/^\/api\/users\/(\d+)\/profile$/);
  if (req.method === 'GET' && publicProfileMatch) {
    const profileUser = statements.findUserById.get(Number(publicProfileMatch[1]));
    if (!profileUser) return sendJson(res, 404, { error: '没有找到这位学习者。' });
    const progress = practiceProgress(profileUser.id);
    const ranked = statements.leaderboard.all().filter(entry => Number(entry.score) > 0);
    const rank = ranked.findIndex(entry => Number(entry.id) === Number(profileUser.id)) + 1;
    return sendJson(res, 200, {
      user: {
        id: Number(profileUser.id),
        nickname: profileUser.nickname,
        realName: profileUser.real_name,
        school: profileUser.school,
        avatarTheme: AVATAR_THEMES.has(profileUser.avatar_theme) ? profileUser.avatar_theme : DEFAULT_AVATAR_THEME,
        avatarFrame: AVATAR_FRAMES.has(profileUser.avatar_frame) ? profileUser.avatar_frame : 'none',
        profileDecor: PROFILE_DECORS.has(profileUser.profile_decor) ? profileUser.profile_decor : 'none',
        achievementBadge: publicAchievementBadge(profileUser.achievement_badge),
        createdAt: profileUser.created_at
      },
      stats: {
        rank,
        score: progress.score,
        completedCount: progress.completedCount,
        ojAccepted: progress.ojHeatmap.totalAccepted,
        activeDays: progress.ojHeatmap.allTimeActiveDays,
        longestStreak: progress.ojHeatmap.longestStreak
      },
      achievements: progress.collection.achievements.filter(item => item.unlocked)
    });
  }

  if (req.method === 'GET' && pathname === '/api/hydro/problems') {
    const user = getCurrentUser(req);
    const hydroBinding = await ensureHydroEmailBinding(user);
    const completed = new Set(user ? statements.listCompletions.all(user.id).map(row => row.problem_id) : []);
    const account = user ? statements.findHydroAccountByUser.get(user.id) : null;
    const problems = statements.listHydroProblems.all().map(row => publicHydroProblem(row, completed.has(hydroCompletionId(row.problem_id))));
    return sendJson(res, 200, {
      problems,
      account: publicHydroAccount(account),
      autoBinding: hydroBinding,
      connected: Boolean(HYDRO_WEBHOOK_SECRET && HYDRO_BASE_URL),
      demoMode: HYDRO_DEMO_MODE
    });
  }

  const hydroStatementMatch = pathname.match(/^\/api\/hydro\/problems\/([^/]+)\/statement$/);
  if (req.method === 'GET' && hydroStatementMatch) {
    const problemId = decodeURIComponent(hydroStatementMatch[1]);
    const problem = statements.findHydroProblem.get(problemId);
    if (!problem?.active || problem.is_demo) return sendJson(res, 404, { error: '该题尚未开放站内题面。' });
    return sendJson(res, 200, await fetchHydroStatement(problem));
  }

  if (req.method === 'POST' && pathname === '/api/hydro/account/auto') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再匹配协会 OJ 账号。' });
    await readJson(req);
    return sendJson(res, 200, await ensureHydroEmailBinding(user, { force: true }));
  }

  if (req.method === 'POST' && pathname === '/api/hydro/account') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再绑定 Hydro 账号。' });
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (username.length < 2 || username.length > 64 || /[\u0000-\u001f]/.test(username)) return sendJson(res, 400, { error: '请输入正确的 Hydro 用户名。' });
    const linkCode = String(randomInt(100000, 1000000));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    try {
      statements.bindHydroAccount.run(user.id, username, tokenHash(linkCode), expiresAt);
    } catch (error) {
      if (String(error.code).startsWith('ERR_SQLITE_CONSTRAINT')) return sendJson(res, 409, { error: '该 Hydro 用户名已经绑定其他网站账号。' });
      throw error;
    }
    return sendJson(res, 200, {
      message: `Hydro 用户名已保存。请在 10 分钟内登录协会 OJ 并确认绑定。`,
      linkCode,
      linkUrl: HYDRO_BASE_URL ? `${HYDRO_BASE_URL}/algospark/link?code=${encodeURIComponent(linkCode)}` : '',
      expiresIn: 600,
      account: { username, userId: null, verified: false }
    });
  }

  if (req.method === 'POST' && pathname === '/api/hydro/submit') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再提交代码。' });
    const hydroBinding = await ensureHydroEmailBinding(user);
    const account = statements.findHydroAccountByUser.get(user.id);
    if (!account?.verified || !account.hydro_user_id) return sendJson(res, 403, { error: hydroBinding?.message || '请先完成协会 Hydro 账号验证绑定。' });
    const body = await readJson(req);
    const problemId = typeof body.problemId === 'string' ? body.problemId.trim() : '';
    const language = typeof body.language === 'string' ? body.language.trim() : '';
    const code = typeof body.code === 'string' ? body.code : '';
    const problem = statements.findHydroProblem.get(problemId);
    if (!problem?.active || problem.is_demo) return sendJson(res, 404, { error: '该题尚未接入协会 OJ 在线判题。' });
    if (!/^[\w.+#-]{1,40}$/.test(language)) return sendJson(res, 400, { error: '请选择正确的编程语言。' });
    if (!code.trim()) return sendJson(res, 400, { error: '代码不能为空。' });
    if (Buffer.byteLength(code, 'utf8') > 128 * 1024) return sendJson(res, 413, { error: '代码不能超过 128 KB。' });
    const statement = await fetchHydroStatement(problem);
    if (!statement.languages.includes(language)) return sendJson(res, 400, { error: '该题不支持所选语言，请重新打开题目并选择可用语言。' });
    const requestId = `algospark-${user.id}-${Date.now()}-${randomBytes(8).toString('hex')}`;
    const result = await callHydroBridge('/submit', {
      requestId,
      websiteUserId: user.id,
      hydroUserId: Number(account.hydro_user_id),
      problemId,
      language,
      code
    });
    const submissionId = String(result.submissionId || result.rid || '').trim();
    if (!submissionId) return sendJson(res, 502, { error: '协会 OJ 没有返回评测编号。' });
    if (!statements.findHydroSubmission.get(submissionId)) {
      recordHydroSubmission({
        submissionId,
        userId: user.id,
        problemId,
        verdict: result.verdict || 'WAITING',
        submittedAt: new Date().toISOString(),
        requestId,
        language
      });
    }
    return sendJson(res, 202, {
      message: '代码已进入协会 OJ 判题队列。',
      submissionId,
      verdict: result.verdict || 'WAITING'
    });
  }

  const submissionMatch = pathname.match(/^\/api\/hydro\/submissions\/([^/]+)$/);
  if (req.method === 'GET' && submissionMatch) {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再查看评测结果。' });
    const submissionId = decodeURIComponent(submissionMatch[1]);
    let submission = statements.findHydroSubmissionForUser.get(submissionId, user.id);
    if (!submission) return sendJson(res, 404, { error: '评测记录不存在。' });
    submission = await refreshPendingHydroSubmission(submission, user.id);
    return sendJson(res, 200, {
      submissionId: submission.submission_id,
      problemId: submission.problem_id,
      verdict: submission.verdict,
      score: submission.score,
      timeMs: submission.time_ms,
      memoryKb: submission.memory_kb,
      language: submission.language,
      submittedAt: submission.submitted_at,
      receivedAt: submission.received_at
    });
  }

  if (req.method === 'POST' && pathname === '/api/hydro/demo-submission') {
    if (!HYDRO_DEMO_MODE) return sendJson(res, 404, { error: '演示接口只在本地开发模式开放。' });
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再测试判题同步。' });
    const body = await readJson(req);
    const problemId = typeof body.problemId === 'string' ? body.problemId.trim() : '';
    const problem = statements.findHydroProblem.get(problemId);
    if (!problem?.is_demo) return sendJson(res, 400, { error: '只能模拟演示题目的判题结果。' });
    const result = recordHydroSubmission({
      submissionId: `demo-${user.id}-${Date.now()}-${randomBytes(4).toString('hex')}`,
      userId: user.id,
      problemId,
      verdict: body.verdict,
      submittedAt: new Date().toISOString()
    });
    return sendJson(res, 200, {
      message: result.verdict === 'AC' ? (result.awarded ? `模拟 AC 成功，已增加 ${result.problem.points} 积分。` : '该题已经通过，不会重复加分。') : `已模拟 ${result.verdict}，不会加分。`,
      verdict: result.verdict,
      awarded: result.awarded,
      ...result.progress
    });
  }

  if (req.method === 'GET' && pathname === '/api/practice/progress') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再记录刷题成绩。' });
    return sendJson(res, 200, practiceProgress(user.id));
  }

  if (req.method === 'POST' && pathname === '/api/practice/completion') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再记录刷题成绩。' });
    const body = await readJson(req);
    const problemId = String(body.problemId || '').trim().toUpperCase();
    const points = LUOGU_PROBLEM_POINTS.get(problemId);
    if (!points) return sendJson(res, 400, { error: '这道题不在当前洛谷训练题单中。' });
    if (typeof body.completed !== 'boolean') return sendJson(res, 400, { error: '完成状态不正确。' });
    if (body.completed) {
      statements.addCompletion.run(user.id, problemId, points);
      statements.updateUserCompletionPoints.run(points, user.id, problemId);
    } else {
      statements.deleteCompletion.run(user.id, problemId);
    }
    recordLeaderboardAchievements(true);
    return sendJson(res, 200, {
      message: body.completed ? `已标记完成，获得 ${points} 积分。` : `已取消完成，扣除 ${points} 积分。`,
      problemId,
      points,
      ...practiceProgress(user.id)
    });
  }

  if (req.method === 'GET' && pathname === '/api/learning/progress') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再同步学习进度。' });
    recordActivity(user.id);
    return sendJson(res, 200, learningProgress(user.id));
  }

  if (req.method === 'POST' && pathname === '/api/learning/progress') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再同步学习进度。' });
    const body = await readJson(req);
    const type = typeof body.type === 'string' ? body.type : '';
    const contentId = typeof body.contentId === 'string' ? body.contentId : '';
    if (!validLearningContent(type, contentId)) return sendJson(res, 400, { error: '学习内容不存在。' });
    if (body.completed === true) statements.addLearningProgress.run(user.id, type, contentId);
    else if (body.completed === false) statements.deleteLearningProgress.run(user.id, type, contentId);
    else return sendJson(res, 400, { error: '完成状态不正确。' });
    statements.saveLastContent.run(user.id, type, contentId);
    recordActivity(user.id);
    return sendJson(res, 200, learningProgress(user.id));
  }

  if (req.method === 'POST' && pathname === '/api/learning/visit') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再同步学习位置。' });
    const body = await readJson(req);
    const type = typeof body.type === 'string' ? body.type : '';
    const contentId = typeof body.contentId === 'string' ? body.contentId : '';
    if (!validLearningContent(type, contentId)) return sendJson(res, 400, { error: '学习内容不存在。' });
    statements.saveLastContent.run(user.id, type, contentId);
    recordActivity(user.id);
    return sendJson(res, 200, { message: '学习位置已同步。' });
  }

  if (req.method === 'POST' && pathname === '/api/learning/import') {
    const user = getCurrentUser(req);
    if (!user) return sendJson(res, 401, { error: '请先登录后再导入学习进度。' });
    const state = statements.findLearningState.get(user.id);
    if (state?.imported_at) return sendJson(res, 200, learningProgress(user.id));
    const body = await readJson(req);
    const cppCompleted = Array.isArray(body.cppCompleted) ? body.cppCompleted : [];
    const algorithmCompleted = Array.isArray(body.algorithmCompleted) ? body.algorithmCompleted : [];
    const activityDays = Array.isArray(body.activityDays) ? body.activityDays : [];
    for (const id of new Set(cppCompleted)) {
      if (LEARNING_CONTENT.cpp.has(id)) statements.addLearningProgress.run(user.id, 'cpp', id);
    }
    for (const id of new Set(algorithmCompleted)) {
      if (LEARNING_CONTENT.algorithm.has(id)) statements.addLearningProgress.run(user.id, 'algorithm', id);
    }
    const today = appDateKey();
    const earliest = new Date(`${today}T00:00:00Z`);
    earliest.setUTCDate(earliest.getUTCDate() - 365);
    const earliestKey = earliest.toISOString().slice(0, 10);
    for (const day of new Set(activityDays)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day >= earliestKey && day <= today) statements.addLearningDay.run(user.id, day);
    }
    statements.markLearningImported.run(user.id);
    recordActivity(user.id);
    return sendJson(res, 200, learningProgress(user.id));
  }

  if (req.method === 'GET' && pathname === '/api/leaderboard') {
    const currentUser = getCurrentUser(req);
    recordLeaderboardAchievements();
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const scope = requestUrl.searchParams.get('scope') === 'weekly' ? 'weekly' : 'all';
    const weekly = scope === 'weekly' ? currentWeeklyLeaderboard() : null;
    const ranked = weekly?.entries || statements.leaderboard.all();
    const entries = ranked.flatMap((entry, index) => {
      const isCurrentUser = Boolean(currentUser && Number(entry.id) === Number(currentUser.id));
      if (index >= 50 && !isCurrentUser) return [];
      return [{
        rank: scope === 'weekly' || Number(entry.score) > 0 ? index + 1 : null,
        id: Number(entry.id),
        nickname: entry.nickname,
        realName: entry.real_name,
        school: entry.school,
        avatarTheme: AVATAR_THEMES.has(entry.avatar_theme) ? entry.avatar_theme : DEFAULT_AVATAR_THEME,
        achievementBadge: publicAchievementBadge(entry.achievement_badge),
        avatarFrame: AVATAR_FRAMES.has(entry.avatar_frame) ? entry.avatar_frame : 'none',
        score: Number(entry.score),
        completedCount: Number(entry.completed_count)
      }];
    });
    return sendJson(res, 200, {
      entries,
      total: ranked.length,
      scope,
      period: weekly ? { start: weekly.weekStart, end: weekly.weekEnd, finalizesAfter: weekly.weekEnd } : null
    });
  }

  return sendJson(res, 404, { error: '接口不存在。' });
}

function serveStatic(res, pathname) {
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!PUBLIC_ASSETS.has(requested)) return sendJson(res, 404, { error: '页面不存在。' });
  const filePath = resolve(STATIC_ROOT, requested);
  const insideStaticRoot = filePath === STATIC_ROOT || filePath.startsWith(STATIC_ROOT + sep);
  const insideDataDirectory = filePath === DATA_DIR || filePath.startsWith(DATA_DIR + sep);
  if (!insideStaticRoot || insideDataDirectory) return sendJson(res, 404, { error: '页面不存在。' });
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': content.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...(requested === 'poetry-landscape-v2.webp' || RANKING_ART_ASSETS.has(requested) ? { 'Cache-Control': 'public, max-age=31536000, immutable' } : {})
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: '页面不存在。' });
  }
}

export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url.pathname);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(res, url.pathname);
    else sendJson(res, 405, { error: '请求方法不支持。' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : '服务器暂时无法处理请求。' });
    else res.end();
  }
});

statements.deleteExpiredSessions.run(Date.now());
statements.deleteExpiredVerifications.run(Date.now());
statements.deleteOldVerificationRateEvents.run(Date.now() - 24 * 60 * 60 * 1000);
recordLeaderboardAchievements(true);
const cleanupTimer = setInterval(() => {
  statements.deleteExpiredSessions.run(Date.now());
  statements.deleteExpiredVerifications.run(Date.now());
  statements.deleteOldVerificationRateEvents.run(Date.now() - 24 * 60 * 60 * 1000);
  const loginCutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, attempt] of hydroAutoBindAttempts) {
    if (!attempt.pending && attempt.expiresAt <= Date.now()) hydroAutoBindAttempts.delete(id);
  }
  for (const [key, attempts] of loginAttempts) {
    const recent = attempts.filter(time => time > loginCutoff);
    if (recent.length) loginAttempts.set(key, recent);
    else loginAttempts.delete(key);
  }
  const deliveryCutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, attempts] of deliveryAttempts) {
    const recent = attempts.filter(time => time > deliveryCutoff);
    if (recent.length) deliveryAttempts.set(key, recent);
    else deliveryAttempts.delete(key);
  }
}, 60 * 60 * 1000);
cleanupTimer.unref();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.once('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用，AlgoSpark 很可能已经启动，请直接打开 http://localhost:${PORT}`);
      process.exitCode = 1;
      return;
    }
    console.error('AlgoSpark 启动失败：', error);
    process.exitCode = 1;
  });
  server.listen(PORT, HOST, () => console.log(`AlgoSpark 已启动：http://${HOST}:${PORT}`));
}

export function closeDatabase() {
  db.close();
}
