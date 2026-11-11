import { timingSafeEqual } from 'node:crypto';
import {
    Context, db, DomainModel, Handler, PERM, PRIV, ProblemModel, RecordModel,
    SettingModel, STATUS_SHORT_TEXTS, SystemModel, UserModel,
} from 'hydrooj';
import { lookupEmailAccount } from './email-account.cjs';

const VERSION = '0.3.1';
const coll = db.collection('algospark.bridge.submission');

type BridgeConfig = {
    enabled: boolean;
    siteUrl: string;
    secret: string;
};

function config(): BridgeConfig {
    const envEnabled = process.env.ALGOSPARK_ENABLED;
    return {
        enabled: envEnabled === undefined ? SystemModel.get('algospark.enabled') !== false : envEnabled !== 'false',
        siteUrl: String(process.env.ALGOSPARK_SITE_URL || SystemModel.get('algospark.siteUrl') || '').replace(/\/$/, ''),
        secret: String(process.env.ALGOSPARK_SECRET || SystemModel.get('algospark.secret') || ''),
    };
}

function secureEqual(left: unknown, right: unknown) {
    const a = Buffer.from(String(left || ''));
    const b = Buffer.from(String(right || ''));
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function bearer(handler: Handler) {
    const authorization = String(handler.request.headers.authorization || '');
    return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function html(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setJson(handler: Handler, status: number, body: Record<string, unknown>) {
    handler.response.status = status;
    handler.response.type = 'application/json; charset=utf-8';
    handler.response.body = body;
}

function verifyServiceRequest(handler: Handler) {
    const current = config();
    if (!current.enabled) {
        setJson(handler, 503, { error: 'AlgoSpark bridge is disabled.' });
        return null;
    }
    if (!current.secret || !secureEqual(bearer(handler), current.secret)) {
        setJson(handler, 401, { error: 'Invalid AlgoSpark bridge secret.' });
        return null;
    }
    return current;
}

async function postToSite(path: string, payload: Record<string, unknown>) {
    const current = config();
    if (!current.enabled || !current.siteUrl || !current.secret) throw new Error('AlgoSpark plugin settings are incomplete.');
    const response = await fetch(`${current.siteUrl}${path}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${current.secret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
    });
    let body: any = {};
    try { body = await response.json(); } catch { /* ignore non-JSON proxy errors */ }
    if (!response.ok) throw new Error(body.error || body.message || `AlgoSpark returned HTTP ${response.status}.`);
    return body;
}

class HealthHandler extends Handler {
    async get() {
        const current = config();
        setJson(this, 200, {
            ok: true,
            plugin: '@algospark/hydro-bridge',
            version: VERSION,
            emailBinding: true,
            enabled: current.enabled,
            configured: Boolean(current.siteUrl && current.secret),
        });
    }
}

class EmailAccountHandler extends Handler {
    async post() {
        if (!verifyServiceRequest(this)) return;
        const domainId = String(this.args.domainId || 'system');
        const result = await lookupEmailAccount({
            email: (this.request.body as any)?.email,
            users: db.collection('user'),
            getUser: (uid: number) => UserModel.getById(domainId, uid),
            canUse: (user: any) => user.hasPriv(PRIV.PRIV_USER_PROFILE) && user.hasPerm(PERM.PERM_SUBMIT_PROBLEM),
        });
        setJson(this, result.status, result.body);
    }
}

class SubmitHandler extends Handler {
    async post() {
        if (!verifyServiceRequest(this)) return;
        const body = (this.request.body || {}) as Record<string, any>;
        const domainId = String(this.args.domainId || 'system');
        const requestId = String(body.requestId || '').trim();
        const problemId = String(body.problemId || '').trim();
        const language = String(body.language || '').trim();
        const code = typeof body.code === 'string' ? body.code : '';
        const hydroUserId = Number(body.hydroUserId);
        const websiteUserId = Number(body.websiteUserId);

        if (!/^[a-zA-Z0-9_-]{12,120}$/.test(requestId)) return setJson(this, 400, { error: 'Invalid requestId.' });
        if (!problemId || problemId.length > 80) return setJson(this, 400, { error: 'Invalid problemId.' });
        if (!Number.isSafeInteger(hydroUserId) || hydroUserId <= 1) return setJson(this, 400, { error: 'Invalid Hydro user id.' });
        if (!Number.isSafeInteger(websiteUserId) || websiteUserId <= 0) return setJson(this, 400, { error: 'Invalid website user id.' });
        if (!language || !SettingModel.langs[language]) return setJson(this, 400, { error: `Unsupported language: ${language || '(empty)'}.` });
        if (!code.trim()) return setJson(this, 400, { error: 'Code is empty.' });
        const maxCodeLength = Number(SystemModel.get('limit.codelength') || 128 * 1024);
        if (Buffer.byteLength(code, 'utf8') > maxCodeLength) return setJson(this, 413, { error: `Code exceeds ${maxCodeLength} bytes.` });

        const previous = await coll.findOne({ _id: requestId } as any);
        if (previous?.rid) return setJson(this, 200, { submissionId: previous.rid, verdict: previous.verdict || 'WAITING', duplicate: true });
        if (previous) return setJson(this, 409, { error: 'The same request is already being created.' });

        const [user, problem] = await Promise.all([
            UserModel.getById(domainId, hydroUserId),
            ProblemModel.get(domainId, problemId),
        ]);
        if (!user) return setJson(this, 404, { error: 'Hydro user not found in this domain.' });
        if (!problem) return setJson(this, 404, { error: 'Problem not found in this domain.' });
        if (!user.hasPerm(PERM.PERM_SUBMIT_PROBLEM) || !ProblemModel.canViewBy(problem, user)) {
            return setJson(this, 403, { error: 'This Hydro user cannot submit this problem.' });
        }
        if (!problem.config || typeof problem.config === 'string') return setJson(this, 409, { error: 'Problem judge configuration is invalid.' });
        if (problem.config.langs?.length && !problem.config.langs.includes(language)) {
            return setJson(this, 400, { error: `Language ${language} is disabled for this problem.` });
        }

        try {
            await coll.insertOne({
                _id: requestId,
                domainId,
                pid: problem.docId,
                publicPid: problem.pid || String(problem.docId),
                uid: hydroUserId,
                websiteUserId,
                language,
                verdict: 'WAITING',
                createdAt: new Date(),
            } as any);
        } catch (error: any) {
            if (error?.code === 11000) return setJson(this, 409, { error: 'The same request is already being created.' });
            throw error;
        }

        try {
            const rid = await RecordModel.add(domainId, problem.docId, hydroUserId, language, code, true, { type: 'judge' });
            const submissionId = rid.toHexString();
            await Promise.all([
                ProblemModel.inc(domainId, problem.docId, 'nSubmit', 1),
                DomainModel.incUserInDomain(domainId, hydroUserId, 'nSubmit'),
                coll.updateOne({ _id: requestId } as any, { $set: { rid: submissionId, submittedAt: new Date() } }),
            ]);
            return setJson(this, 202, { submissionId, verdict: 'WAITING' });
        } catch (error) {
            await coll.deleteOne({ _id: requestId } as any);
            throw error;
        }
    }
}

class ProblemInfoHandler extends Handler {
    async post() {
        if (!verifyServiceRequest(this)) return;
        const body = (this.request.body || {}) as Record<string, any>;
        const domainId = String(this.args.domainId || 'system');
        const problemId = String(body.problemId || '').trim();
        if (!problemId || problemId.length > 80) return setJson(this, 400, { error: 'Invalid problemId.' });
        const problem = await ProblemModel.get(domainId, problemId);
        if (!problem) return setJson(this, 404, { error: 'Problem not found in this Hydro domain.' });
        const languages = typeof problem.config === 'object' && problem.config?.langs?.length
            ? problem.config.langs
            : Object.keys(SettingModel.langs).filter((key) => !SettingModel.langs[key].hidden);
        return setJson(this, 200, {
            problemId: problem.pid || String(problem.docId),
            title: problem.title,
            hidden: Boolean(problem.hidden),
            judgeConfigured: Boolean(problem.config && typeof problem.config === 'object'),
            languages,
        });
    }
}

class UpdateStatementHandler extends Handler {
    async post() {
        if (!verifyServiceRequest(this)) return;
        const body = (this.request.body || {}) as Record<string, any>;
        const domainId = String(this.args.domainId || 'system');
        const problemId = String(body.problemId || '').trim();
        const title = String(body.title || '').trim();
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        const tags = Array.isArray(body.tags)
            ? body.tags.filter((tag: unknown) => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean).slice(0, 12)
            : [];
        if (!/^AS10(?:0[1-9]|1[0-4])$/.test(problemId)) return setJson(this, 400, { error: 'Only the AlgoSpark starter pack can be updated.' });
        if (!title || title.length > 200) return setJson(this, 400, { error: 'Invalid problem title.' });
        if (!content || Buffer.byteLength(content, 'utf8') > 256 * 1024) return setJson(this, 400, { error: 'Invalid problem statement.' });
        if (tags.some((tag: string) => tag.length > 40)) return setJson(this, 400, { error: 'Invalid problem tags.' });
        const problem = await ProblemModel.get(domainId, problemId);
        if (!problem) return setJson(this, 404, { error: 'Problem not found in this Hydro domain.' });
        const updated = await ProblemModel.edit(domainId, problem.docId, { title, content, tag: tags });
        return setJson(this, 200, {
            ok: true,
            problemId: updated.pid || problemId,
            title: updated.title,
            samplesUpdated: true,
        });
    }
}

class LinkHandler extends Handler {
    async get() {
        const code = String(this.args.code || '').trim();
        if (!this.user || this.user._id <= 1) {
            this.response.redirect = this.url('user_login', { query: { redirect: this.request.originalPath } });
            return;
        }
        const action = this.url('algospark_link');
        this.response.type = 'text/html; charset=utf-8';
        this.response.body = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>绑定 AlgoSpark</title><style>body{margin:0;background:#eef1f6;color:#26324a;font:16px system-ui}.card{max-width:520px;margin:12vh auto;padding:34px;background:#fff;border-radius:18px;box-shadow:0 20px 60px #35406422}h1{margin-top:0}input,button{box-sizing:border-box;width:100%;padding:13px;margin-top:12px;border-radius:9px}input{border:1px solid #ccd3df}button{border:0;background:#6750b7;color:#fff;font-weight:700}small{color:#69758a}</style><div class="card"><h1>绑定 AlgoSpark</h1><p>当前 Hydro 账号：<b>${html(this.user.uname)}</b></p><small>确认后，该账号的 AlgoSpark 在线提交会使用此 Hydro 身份进行判题。</small><form method="post" action="${html(action)}"><input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" value="${html(code)}" placeholder="6 位绑定码" required><button type="submit">确认绑定</button></form></div></html>`;
    }

    async post() {
        if (!this.user || this.user._id <= 1) return setJson(this, 401, { error: 'Please log in to Hydro first.' });
        const code = String((this.request.body as any)?.code || this.args.code || '').trim();
        if (!/^\d{6}$/.test(code)) return setJson(this, 400, { error: '绑定码必须是 6 位数字。' });
        try {
            const result = await postToSite('/api/integrations/hydro/account', {
                hydroUserId: this.user._id,
                hydroUsername: this.user.uname,
                linkCode: code,
            });
            this.response.type = 'text/html; charset=utf-8';
            this.response.body = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>绑定成功</title><style>body{margin:0;background:#eef1f6;color:#26324a;font:16px system-ui}.card{max-width:520px;margin:12vh auto;padding:34px;background:#fff;border-radius:18px;box-shadow:0 20px 60px #35406422}a{color:#6750b7}</style><div class="card"><h1>✓ 绑定成功</h1><p>${html(result.message || 'Hydro 账号已经绑定到 AlgoSpark。')}</p><p>现在可以回到 AlgoSpark 直接提交代码。</p></div></html>`;
        } catch (error: any) {
            setJson(this, 400, { error: error.message || '绑定失败。' });
        }
    }
}

class SyncProblemHandler extends Handler {
    async post() {
        if (!verifyServiceRequest(this)) return;
        const body = (this.request.body || {}) as Record<string, any>;
        const domainId = String(this.args.domainId || 'system');
        const problemId = String(body.problemId || '').trim();
        const points = Number(body.points);
        const problem = await ProblemModel.get(domainId, problemId);
        if (!problem) return setJson(this, 404, { error: 'Problem not found in this domain.' });
        if (!Number.isInteger(points) || points < 1 || points > 1000) return setJson(this, 400, { error: 'Points must be an integer from 1 to 1000.' });
        const result = await postToSite('/api/integrations/hydro/problem', {
            problemId: problem.pid || String(problem.docId),
            title: problem.title,
            points,
            track: body.track === 'algorithm' ? 'algorithm' : 'grammar',
            active: body.active !== false,
        });
        return setJson(this, 200, { ok: true, ...result });
    }
}

async function deliverJudgeResult(rdoc: any) {
    const submissionId = rdoc._id.toHexString();
    const bridge = await coll.findOne({ rid: submissionId } as any);
    if (!bridge) return;
    const verdict = STATUS_SHORT_TEXTS[rdoc.status] || String(rdoc.status);
    const payload = {
        requestId: bridge._id,
        submissionId,
        websiteUserId: bridge.websiteUserId,
        hydroUserId: bridge.uid,
        problemId: bridge.publicPid,
        verdict,
        score: rdoc.score,
        timeMs: rdoc.time,
        memoryKb: rdoc.memory,
        language: rdoc.lang,
        submittedAt: (rdoc.judgeAt || bridge.submittedAt || new Date()).toISOString(),
    };
    let lastError: any;
    for (const delay of [0, 1000, 5000]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
            await postToSite('/api/integrations/hydro/submission', payload);
            await coll.updateOne({ _id: bridge._id } as any, { $set: { verdict, callbackAt: new Date() }, $unset: { callbackError: '' } });
            return;
        } catch (error) { lastError = error; }
    }
    await coll.updateOne({ _id: bridge._id } as any, { $set: { callbackError: String(lastError?.message || lastError), callbackFailedAt: new Date() } });
}

export async function apply(ctx: Context) {
    ctx.effect(() => SettingModel.SystemSetting(
        SettingModel.Setting('setting_algospark', 'algospark.enabled', true, 'boolean', '启用 AlgoSpark 判题桥', '允许 AlgoSpark 网站提交代码并接收判题结果'),
        SettingModel.Setting('setting_algospark', 'algospark.siteUrl', '', 'text', 'AlgoSpark 网站地址', '例如：https://study.example.edu.cn'),
        SettingModel.Setting('setting_algospark', 'algospark.secret', '', 'password', 'AlgoSpark 共享密钥', '必须与网站 HYDRO_WEBHOOK_SECRET 完全一致', SettingModel.FLAG_SECRET),
    ));
    ctx.Route('algospark_health', '/algospark/health', HealthHandler);
    ctx.Route('algospark_email_account', '/algospark/account-by-email', EmailAccountHandler);
    ctx.Route('algospark_problem', '/algospark/problem', ProblemInfoHandler);
    ctx.Route('algospark_update_statement', '/algospark/update-statement', UpdateStatementHandler);
    ctx.Route('algospark_submit', '/algospark/submit', SubmitHandler);
    ctx.Route('algospark_link', '/algospark/link', LinkHandler);
    ctx.Route('algospark_sync_problem', '/algospark/sync-problem', SyncProblemHandler);
    ctx.on('record/judge', async (rdoc) => deliverJudgeResult(rdoc));
    await db.ensureIndexes(coll,
        { name: 'rid', key: { rid: 1 }, unique: true, sparse: true },
        { name: 'createdAt', key: { createdAt: 1 } },
    );
}
