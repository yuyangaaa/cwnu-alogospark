// Only case and surrounding whitespace are normalized. Dots and '+' aliases stay distinct.
function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

async function lookupEmailAccount({ email: suppliedEmail, users, getUser, canUse }) {
    const email = normalizeEmail(suppliedEmail);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { status: 400, body: { error: 'Invalid email.' } };
    }
    const literal = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = await users.find({ _id: { $gt: 1 }, mail: { $regex: `^\\s*${literal}\\s*$`, $options: 'i' } },
        { projection: { _id: 1, mail: 1 }, maxTimeMS: 2000 }).limit(2).toArray();
    if (!matches.length) return { status: 200, body: { found: false } };
    if (matches.length !== 1) return { status: 409, body: { error: '邮箱对应多个 Hydro 账号，请联系协会管理员核对。' } };
    const user = await getUser(matches[0]._id);
    if (!user || normalizeEmail(user.mail) !== email) return { status: 200, body: { found: false } };
    if (!canUse(user)) return { status: 403, body: { error: '该 Hydro 账号当前无法提交，请联系协会管理员。' } };
    return { status: 200, body: { found: true, email, hydroUserId: user._id, hydroUsername: user.uname } };
}

module.exports = { lookupEmailAccount };
