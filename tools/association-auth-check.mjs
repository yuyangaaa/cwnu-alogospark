import { randomBytes } from 'node:crypto';
import process from 'node:process';

const DEFAULT_BASE_URL = 'https://www.cwnupaa.com/api';
const args = process.argv.slice(2);
try {
  process.loadEnvFile?.('.env');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
let runtimeAppKey = String(process.env.ASSOCIATION_AUTH_APP_KEY || '').trim();

function argument(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function hasArgument(name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`
协会官网外部登录接口独立测试脚本

用法：
  npm.cmd run test:association
      使用虚构账号探测 API Key 是否被接口识别（不会登录任何账号）

  npm.cmd run test:association -- --account <协会账号/邮箱/学号>
      测试账号密码登录；密码会在终端中隐藏输入

  npm.cmd run test:association -- --code-login <协会绑定邮箱>
      测试邮箱验证码登录；验证码会在终端中隐藏输入

  npm.cmd run test:association -- --send-code <协会绑定邮箱>
      请求协会官网发送登录验证码

环境变量：
  ASSOCIATION_AUTH_BASE_URL   默认 https://www.cwnupaa.com/api
  ASSOCIATION_AUTH_APP_KEY    可从当前目录 .env 自动加载；未配置时会隐藏输入

安全说明：脚本不会打印 API Key 或登录凭证，用户资料值默认脱敏。
`);
}

function mask(value) {
  const text = String(value ?? '').trim();
  if (!text) return '(空)';
  if (text.includes('@')) {
    const [name, domain] = text.split('@');
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (text.length <= 2) return '*'.repeat(text.length);
  if (text.length <= 6) return `${text[0]}***${text.at(-1)}`;
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('当前终端不支持隐藏输入，请在 PowerShell 中直接运行该命令。');
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  let value = '';
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') return finish(new Error('操作已取消。'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          process.stdout.write('*');
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function post(pathname, payload) {
  const baseUrl = (process.env.ASSOCIATION_AUTH_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  if (!runtimeAppKey) runtimeAppKey = (await hiddenPrompt('请输入 API Key（输入内容将隐藏）：')).trim();
  if (!/^ak_[A-Za-z0-9]{20,}$/.test(runtimeAppKey)) {
    throw new Error('API Key 未配置或格式不正确。');
  }

  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ appKey: runtimeAppKey, ...payload }),
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new Error(`无法连接协会官网：${error.message}`);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`接口返回的不是 JSON（HTTP ${response.status}）。`);
  }
  return { httpStatus: response.status, body };
}

function printResponse(result) {
  const { httpStatus, body } = result;
  console.log(`HTTP 状态：${httpStatus}`);
  console.log(`业务状态：${body?.code ?? '(缺失)'}`);
  console.log(`接口消息：${body?.msg || '(空)'}`);

  if (!body?.data || typeof body.data !== 'object') {
    console.log('返回资料：无');
    return;
  }

  const fields = Object.keys(body.data);
  console.log(`返回字段：${fields.join(', ') || '(无)'}`);
  const aliases = {
    userId: '用户ID', userAccount: '用户名', userName: '昵称', realName: '姓名',
    numberId: '学号/工号', phone: '手机号', phoneNumber: '手机号', mobile: '手机号', email: '邮箱'
  };
  for (const [field, label] of Object.entries(aliases)) {
    if (Object.hasOwn(body.data, field)) console.log(`${label} [${field}]：${mask(body.data[field])}`);
  }
  const known = new Set(Object.keys(aliases));
  const extra = fields.filter(field => !known.has(field));
  if (extra.length) console.log(`其他字段：${extra.join(', ')}`);
}

async function main() {
  if (hasArgument('--help') || hasArgument('-h')) return printHelp();

  const sendCodeEmail = argument('--send-code');
  if (sendCodeEmail) {
    console.log('测试模式：发送协会官网邮箱验证码');
    const result = await post('/user/external/send-code', { email: sendCodeEmail.trim() });
    printResponse(result);
    process.exitCode = Number(result.body?.code) === 200 ? 0 : 2;
    return;
  }

  const codeLoginEmail = argument('--code-login');
  if (codeLoginEmail) {
    console.log('测试模式：协会邮箱验证码登录');
    const credential = await hiddenPrompt('请输入 6 位邮箱验证码：');
    const result = await post('/user/external/login', {
      loginType: 'code', account: codeLoginEmail.trim(), credential: credential.trim()
    });
    printResponse(result);
    process.exitCode = Number(result.body?.code) === 200 ? 0 : 2;
    return;
  }

  const account = argument('--account');
  if (account) {
    console.log('测试模式：协会账号密码登录');
    const credential = await hiddenPrompt('请输入协会官网密码：');
    const result = await post('/user/external/login', {
      loginType: 'password', account: account.trim(), credential
    });
    printResponse(result);
    process.exitCode = Number(result.body?.code) === 200 ? 0 : 2;
    return;
  }

  console.log('测试模式：仅探测 API Key（使用虚构账号，不会登录真实用户）');
  const result = await post('/user/external/login', {
    loginType: 'password',
    account: `__algospark_probe_${Date.now()}__`,
    credential: randomBytes(24).toString('hex')
  });
  printResponse(result);
  const message = String(result.body?.msg || '');
  if (/app\s*key|appkey|密钥/i.test(message)) {
    console.error('结论：协会接口没有识别当前 API Key。');
    process.exitCode = 2;
  } else if (Number(result.body?.code) === 200) {
    console.error('结论：虚构账号意外登录成功，请立即联系接口管理员检查安全问题。');
    process.exitCode = 3;
  } else {
    console.log('结论：API Key 已被识别；虚构账号被拒绝是预期结果。');
  }
}

main().catch((error) => {
  console.error(`测试失败：${error.message}`);
  process.exitCode = 1;
});
