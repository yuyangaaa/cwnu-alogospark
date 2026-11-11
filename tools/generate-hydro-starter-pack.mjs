import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const workspace = resolve(import.meta.dirname, '..');
const packRoot = resolve(workspace, 'hydro-problems', 'algospark-starter-v1');
if (!packRoot.startsWith(`${workspace}${sep}`)) throw new Error('输出目录必须位于工作区中。');
rmSync(packRoot, { recursive: true, force: true });
mkdirSync(packRoot, { recursive: true });

const problems = [
  {
    pid: 'AS1001', title: '协会签到', tags: ['入门', '输出'], points: 5,
    statement: `## 题目描述

为了确认训练环境已经配置成功，请输出下面两行文字：

\`\`\`
AlgoSpark
Keep Coding!
\`\`\`

## 输入格式

本题没有输入。

## 输出格式

严格按照题目描述输出两行文字。`,
    tests: [''],
    solve: () => 'AlgoSpark\nKeep Coding!',
    solution: `#include <iostream>\nusing namespace std;\nint main(){ cout << "AlgoSpark\\nKeep Coding!\\n"; }`,
  },
  {
    pid: 'AS1002', title: '两间教室', tags: ['入门', '输入输出'], points: 10,
    statement: `## 题目描述

算法协会在两间教室组织训练，第一间有 $a$ 名同学，第二间有 $b$ 名同学。请计算参加训练的总人数。

## 输入格式

一行两个整数 $a,b$。

## 输出格式

输出一个整数，表示总人数。

## 数据范围

$0\\le a,b\\le 10^9$。`,
    tests: ['2 3', '0 0', '100 256', '1000000000 1000000000', '7 19'],
    solve: input => String(input.trim().split(/\s+/).map(Number).reduce((a, b) => a + b, 0)),
    solution: `#include <iostream>\nusing namespace std;\nint main(){ long long a,b; cin>>a>>b; cout<<a+b<<'\\n'; }`,
  },
  {
    pid: 'AS1003', title: '训练手册装箱', tags: ['入门', '乘法'], points: 10,
    statement: `## 题目描述

每个纸箱可以装 $k$ 本训练手册，现在准备了 $n$ 个纸箱。若每个纸箱都装满，一共能装多少本手册？

## 输入格式

一行两个整数 $n,k$。

## 输出格式

输出手册总数。

## 数据范围

$1\\le n,k\\le 10^9$，答案在 64 位有符号整数范围内。`,
    tests: ['4 6', '1 1', '100 25', '1000000000 1000000000', '17 23'],
    solve: input => { const [a, b] = input.trim().split(/\s+/).map(BigInt); return String(a * b); },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ long long n,k; cin>>n>>k; cout<<n*k<<'\\n'; }`,
  },
  {
    pid: 'AS1004', title: '队名字母', tags: ['入门', '字符'], points: 10,
    statement: `## 题目描述

队名缩写由一个小写英文字母表示。为了制作展示牌，请把它转换成对应的大写字母。

## 输入格式

输入一个小写英文字母。

## 输出格式

输出对应的大写英文字母。`,
    tests: ['a', 'z', 'm', 'q', 'b'],
    solve: input => input.trim().toUpperCase(),
    solution: `#include <iostream>\n#include <cctype>\nusing namespace std;\nint main(){ char c; cin>>c; cout<<(char)toupper(c)<<'\\n'; }`,
  },
  {
    pid: 'AS1005', title: '编号镜像', tags: ['入门', '字符串'], points: 10,
    statement: `## 题目描述

器材编号由恰好三个数字组成，且可能以 0 开头。请输出这个编号从右向左读取的结果。

## 输入格式

输入一个长度为 3 的数字字符串。

## 输出格式

输出倒序后的三个数字，保留前导零。`,
    tests: ['123', '120', '007', '999', '405'],
    solve: input => [...input.trim()].reverse().join(''),
    solution: `#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){ string s; cin>>s; reverse(s.begin(),s.end()); cout<<s<<'\\n'; }`,
  },
  {
    pid: 'AS1006', title: '饮料均分', tags: ['入门', '浮点数'], points: 15,
    statement: `## 题目描述

共有 $v$ 升饮料，要平均分给 $n$ 个小组。请计算每个小组能分到多少升。

## 输入格式

输入一个实数 $v$ 和一个正整数 $n$。

## 输出格式

输出每组分到的饮料体积，保留 3 位小数。

## 数据范围

$0<v\\le 10^6$，$1\\le n\\le 10^6$。`,
    tests: ['10 4', '1 3', '25.5 5', '1000000 7', '0.5 2'],
    solve: input => { const [v, n] = input.trim().split(/\s+/).map(Number); return (v / n).toFixed(3); },
    solution: `#include <iostream>\n#include <iomanip>\nusing namespace std;\nint main(){ double v; long long n; cin>>v>>n; cout<<fixed<<setprecision(3)<<v/n<<'\\n'; }`,
  },
  {
    pid: 'AS1007', title: '校园三角花坛', tags: ['入门', '数学公式'], points: 15,
    statement: `## 题目描述

校园里计划修建一个三角形花坛，三条边长分别为 $a,b,c$。请使用海伦公式计算它的面积。

令 $p=(a+b+c)/2$，则面积为 $\\sqrt{p(p-a)(p-b)(p-c)}$。

## 输入格式

输入三个正实数 $a,b,c$，保证能构成非退化三角形。

## 输出格式

输出花坛面积，保留 2 位小数。`,
    tests: ['3 4 5', '5 5 6', '2.5 3.5 4', '100 120 150', '1 1 1'],
    solve: input => { const [a, b, c] = input.trim().split(/\s+/).map(Number); const p = (a + b + c) / 2; return Math.sqrt(p * (p-a) * (p-b) * (p-c)).toFixed(2); },
    solution: `#include <iostream>\n#include <iomanip>\n#include <cmath>\nusing namespace std;\nint main(){ double a,b,c; cin>>a>>b>>c; double p=(a+b+c)/2; cout<<fixed<<setprecision(2)<<sqrt(p*(p-a)*(p-b)*(p-c))<<'\\n'; }`,
  },
  {
    pid: 'AS1008', title: '训练计时', tags: ['入门', '时间计算'], points: 15,
    statement: `## 题目描述

一次训练在当天 $h_1:m_1$ 开始，在当天 $h_2:m_2$ 结束。请计算训练持续了多少小时、多少分钟。

## 输入格式

一行四个整数 $h_1,m_1,h_2,m_2$，保证结束时刻不早于开始时刻。

## 输出格式

输出两个整数，依次表示持续的小时数和不足一小时的分钟数。`,
    tests: ['9 30 11 5', '0 0 0 0', '8 59 9 0', '13 15 20 45', '0 1 23 59'],
    solve: input => { const [h1,m1,h2,m2] = input.trim().split(/\s+/).map(Number); const d=h2*60+m2-h1*60-m1; return `${Math.floor(d/60)} ${d%60}`; },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ int h1,m1,h2,m2; cin>>h1>>m1>>h2>>m2; int d=h2*60+m2-h1*60-m1; cout<<d/60<<' '<<d%60<<'\\n'; }`,
  },
  {
    pid: 'AS1009', title: '综合训练分', tags: ['入门', '表达式'], points: 15,
    statement: `## 题目描述

一名同学的基础练习、专题训练和模拟赛成绩分别为 $a,b,c$。综合成绩按照 20%、30%、50% 计算。

## 输入格式

输入三个 0 到 100 的整数 $a,b,c$。

## 输出格式

输出综合成绩的整数部分。

综合成绩计算式为 $(2a+3b+5c)/10$，使用整数除法。`,
    tests: ['100 100 100', '80 90 70', '0 0 0', '99 88 77', '60 100 80'],
    solve: input => { const [a,b,c] = input.trim().split(/\s+/).map(Number); return String(Math.trunc((2*a+3*b+5*c)/10)); },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ int a,b,c; cin>>a>>b>>c; cout<<(2*a+3*b+5*c)/10<<'\\n'; }`,
  },
  {
    pid: 'AS1010', title: '训练号码性质', tags: ['入门', '逻辑运算'], points: 20,
    statement: `## 题目描述

给定一个非负整数 $x$，定义两个性质：

- 性质 A：$x$ 能被 3 整除；
- 性质 B：$x$ 的个位数字不小于 5。

请依次判断“A 与 B”“A 或 B”“A 与 B 恰好一个成立”“A、B 都不成立”。成立输出 1，否则输出 0。

## 输入格式

输入一个非负整数 $x$。

## 输出格式

一行输出四个用空格分隔的 0 或 1。`,
    tests: ['15', '12', '17', '22', '0', '999999999'],
    solve: input => { const x=Number(input.trim()); const a=x%3===0,b=x%10>=5; return `${+(a&&b)} ${+(a||b)} ${+(a!==b)} ${+(!a&&!b)}`; },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ long long x; cin>>x; bool a=x%3==0,b=x%10>=5; cout<<(a&&b)<<' '<<(a||b)<<' '<<(a!=b)<<' '<<(!a&&!b)<<'\\n'; }`,
  },
  {
    pid: 'AS1011', title: '活动年份', tags: ['入门', '条件判断'], points: 20,
    statement: `## 题目描述

协会计划在闰年举办特别活动。给定一个年份，请判断它是否为闰年。

闰年规则：年份能被 400 整除，或者能被 4 整除但不能被 100 整除。

## 输入格式

输入一个正整数年份 $y$。

## 输出格式

若为闰年输出 \`YES\`，否则输出 \`NO\`。`,
    tests: ['2024', '1900', '2000', '2023', '4', '2100'],
    solve: input => { const y=Number(input.trim()); return y%400===0 || (y%4===0 && y%100!==0) ? 'YES' : 'NO'; },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ int y; cin>>y; cout<<((y%400==0||(y%4==0&&y%100!=0))?"YES":"NO")<<'\\n'; }`,
  },
  {
    pid: 'AS1012', title: '打印方案', tags: ['入门', '方案比较'], points: 20,
    statement: `## 题目描述

需要打印 $n$ 份训练资料。打印店提供两种方案：

- 方案 A：每份 5 元；
- 方案 B：固定服务费 20 元，再加每份 3 元。

请输出价格更低的方案；若价格相同输出 \`Same\`。

## 输入格式

输入正整数 $n$。

## 输出格式

输出 \`A\`、\`B\` 或 \`Same\`。`,
    tests: ['1', '9', '10', '11', '100', '4'],
    solve: input => { const n=Number(input.trim()),a=5*n,b=20+3*n; return a<b?'A':a>b?'B':'Same'; },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ long long n; cin>>n; long long a=5*n,b=20+3*n; cout<<(a<b?"A":a>b?"B":"Same")<<'\\n'; }`,
  },
  {
    pid: 'AS1013', title: '月度训练天数', tags: ['入门', '多分支'], points: 25,
    statement: `## 题目描述

给定年份 $y$ 和月份 $m$，请输出这个月包含的天数。

二月天数需要按照闰年规则判断。

## 输入格式

输入两个整数 $y,m$，其中 $1\\le m\\le 12$。

## 输出格式

输出该月天数。`,
    tests: ['2024 2', '2023 2', '2000 2', '1900 2', '2026 8', '2026 11'],
    solve: input => { const [y,m]=input.trim().split(/\s+/).map(Number); const leap=y%400===0||(y%4===0&&y%100!==0); return String(m===2?(leap?29:28):[4,6,9,11].includes(m)?30:31); },
    solution: `#include <iostream>\nusing namespace std;\nint main(){ int y,m; cin>>y>>m; bool leap=y%400==0||(y%4==0&&y%100!=0); int d=m==2?(leap?29:28):(m==4||m==6||m==9||m==11?30:31); cout<<d<<'\\n'; }`,
  },
  {
    pid: 'AS1014', title: '三人成绩排序', tags: ['入门', '排序'], points: 25,
    statement: `## 题目描述

三名同学的成绩分别为 $a,b,c$。请将它们从小到大输出。

## 输入格式

输入三个整数 $a,b,c$。

## 输出格式

输出排序后的三个整数，用空格分隔。

## 数据范围

$-10^9\\le a,b,c\\le 10^9$。`,
    tests: ['3 1 2', '1 1 1', '-1 0 -2', '1000000000 -1000000000 0', '9 3 9'],
    solve: input => input.trim().split(/\s+/).map(Number).sort((a,b)=>a-b).join(' '),
    solution: `#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){ long long a[3]; cin>>a[0]>>a[1]>>a[2]; sort(a,a+3); cout<<a[0]<<' '<<a[1]<<' '<<a[2]<<'\\n'; }`,
  },
];

function yamlString(value) {
  return JSON.stringify(value);
}

function sampleSections(problem) {
  const sampleIndexes = problem.tests.length > 1 ? [0, 1] : [0];
  return sampleIndexes.map((index, order) => {
    const input = problem.tests[index].trim();
    const output = problem.solve(problem.tests[index]).trim();
    const suffix = sampleIndexes.length > 1 ? ` ${order + 1}` : '';
    return [
      input ? `## 输入样例${suffix}\n\n\`\`\`\n${input}\n\`\`\`` : '',
      `## 输出样例${suffix}\n\n\`\`\`\n${output}\n\`\`\``
    ].filter(Boolean).join('\n\n');
  }).join('\n\n');
}

for (const problem of problems) {
  const root = join(packRoot, problem.pid);
  const testdata = join(root, 'testdata');
  const solution = join(root, 'solution');
  mkdirSync(testdata, { recursive: true });
  mkdirSync(solution, { recursive: true });
  writeFileSync(join(root, 'problem.yaml'), [
    `pid: ${problem.pid}`,
    `title: ${yamlString(problem.title)}`,
    `tag: [${problem.tags.map(yamlString).join(', ')}]`,
    'difficulty: 1',
    '',
  ].join('\n'), 'utf8');
  writeFileSync(join(root, 'problem.md'), `${problem.statement.trim()}\n\n${sampleSections(problem)}\n`, 'utf8');
  writeFileSync(join(solution, 'solution.cc'), `${problem.solution.trim()}\n`, 'utf8');
  const cases = [];
  problem.tests.forEach((input, index) => {
    const id = index + 1;
    const output = problem.solve(input);
    writeFileSync(join(testdata, `${id}.in`), input ? `${input.trim()}\n` : '', 'utf8');
    writeFileSync(join(testdata, `${id}.out`), `${output.trim()}\n`, 'utf8');
    cases.push(`      - input: ${id}.in\n        output: ${id}.out`);
  });
  writeFileSync(join(testdata, 'config.yaml'), [
    'time: 1000ms',
    'memory: 256m',
    'subtasks:',
    '  - score: 100',
    '    type: min',
    '    cases:',
    ...cases,
    '',
  ].join('\n'), 'utf8');
}

const manifest = problems.map(({ pid, title, tags, points }) => ({ pid, title, tags, points, track: 'grammar', active: true }));
writeFileSync(join(packRoot, 'algospark-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(join(packRoot, 'README.md'), `# AlgoSpark 原创入门题包 v1

包含 ${problems.length} 道原创 C++ 入门题（${problems[0].pid}–${problems.at(-1).pid}），每题包含中文题面、标准 C++17 程序、5–6 组确定性测试数据和 Hydro 配置。

在 Hydro 的“题库 → 从 Hydro 导入”页面上传外层 ZIP 即可批量导入。导入后请抽查题面与测试数据，并用标准程序提交一次确认判题机工作正常。

\`algospark-manifest.json\` 是网站题目管理清单，记录建议积分和题单分类。题目导入协会 OJ 后，再在 AlgoSpark 管理后台逐题校验发布。
`, 'utf8');

console.log(`Generated ${problems.length} problems in ${packRoot}`);
