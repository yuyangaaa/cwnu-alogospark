import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packRoot = resolve(import.meta.dirname, '..', 'hydro-problems', 'algospark-grammar-tail-v1');
rmSync(packRoot, { recursive: true, force: true });
mkdirSync(packRoot, { recursive: true });

const problems = [
  {
    pid: 'AS1015', title: '训练积分总计', tags: ['入门', '循环', '累加'], points: 20, topic: 'loop',
    statement: `## 题目描述

一场训练中共有 $n$ 道小题，第 $i$ 道小题带来的积分变化为 $a_i$。积分变化可能为正数，也可能为负数。

请计算完成全部小题后的积分变化总和。

## 输入格式

第一行输入一个整数 $n$。

第二行输入 $n$ 个整数 $a_1,a_2,\\ldots,a_n$。

## 输出格式

输出一个整数，表示积分变化总和。

## 数据范围

$1 \\le n \\le 10^5$，$-10^9 \\le a_i \\le 10^9$。`,
    tests: ['5\n3 4 -2 8 1', '1\n-7', '4\n0 0 0 0', '3\n1000000000 1000000000 1000000000', '6\n-5 2 -4 9 1 -3'],
    solve: input => String(input.trim().split(/\s+/).slice(1).reduce((sum, value) => sum + BigInt(value), 0n)),
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long sum = 0, x;
    for (int i = 0; i < n; i++) {
        cin >> x;
        sum += x;
    }
    cout << sum << '\\n';
}`,
  },
  {
    pid: 'AS1016', title: '星阵演练', tags: ['入门', '循环', '嵌套循环'], points: 25, topic: 'loop',
    statement: `## 题目描述

输入星阵的行数 $n$ 和列数 $m$，请输出一个由星号组成的 $n$ 行 $m$ 列矩形。

## 输入格式

输入两个整数 $n,m$。

## 输出格式

输出 $n$ 行，每行恰好包含 $m$ 个字符 \`*\`。

## 数据范围

$1 \\le n,m \\le 20$。`,
    tests: ['2 3', '1 1', '3 5', '5 2', '4 4'],
    solve: input => { const [n, m] = input.trim().split(/\s+/).map(Number); return Array.from({ length: n }, () => '*'.repeat(m)).join('\n'); },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) cout << '*';
        cout << '\\n';
    }
}`,
  },
  {
    pid: 'AS1017', title: '最高分统计', tags: ['入门', '数组', '统计'], points: 25, topic: 'array-string',
    statement: `## 题目描述

读取 $n$ 名同学的训练分数，请输出最高分、最低分，以及获得最高分的人数。

## 输入格式

第一行输入一个整数 $n$。

第二行输入 $n$ 个整数，表示每名同学的分数。

## 输出格式

在一行中依次输出最高分、最低分和最高分人数，三个整数之间用一个空格分隔。

## 数据范围

$1 \\le n \\le 10^5$，$0 \\le a_i \\le 100$。`,
    tests: ['5\n80 95 72 95 88', '1\n60', '4\n100 100 100 100', '6\n0 20 40 60 80 100', '7\n73 88 91 91 70 91 85'],
    solve: input => { const a = input.trim().split(/\s+/).slice(1).map(Number); const hi = Math.max(...a), lo = Math.min(...a); return `${hi} ${lo} ${a.filter(x => x === hi).length}`; },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int &x : a) cin >> x;
    int highest = a[0], lowest = a[0], countHighest = 0;
    for (int x : a) {
        highest = max(highest, x);
        lowest = min(lowest, x);
    }
    for (int x : a) if (x == highest) countHighest++;
    cout << highest << ' ' << lowest << ' ' << countHighest << '\\n';
}`,
  },
  {
    pid: 'AS1018', title: '每行训练量', tags: ['入门', '二维数组', '循环'], points: 30, topic: 'array-string',
    statement: `## 题目描述

一份训练记录由 $n$ 行 $m$ 列整数构成。请分别计算每一行所有数字的和。

## 输入格式

第一行输入两个整数 $n,m$。

接下来 $n$ 行，每行输入 $m$ 个整数。

## 输出格式

输出一行 $n$ 个整数，第 $i$ 个整数表示第 $i$ 行的元素之和。相邻整数之间用一个空格分隔。

## 数据范围

$1 \\le n,m \\le 100$，$-10^6 \\le a_{i,j} \\le 10^6$。`,
    tests: ['2 3\n1 2 3\n4 5 6', '1 4\n5 -2 7 0', '3 1\n10\n20\n-5', '2 2\n1000000 1000000\n-1000000 -1000000', '3 3\n1 0 1\n2 2 2\n-1 -2 -3'],
    solve: input => { const v = input.trim().split(/\s+/).map(Number); const [n, m] = v; let p = 2; const ans = []; for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < m; j++) sum += v[p++]; ans.push(sum); } return ans.join(' '); },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<long long>> a(n, vector<long long>(m));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) cin >> a[i][j];
    }
    for (int i = 0; i < n; i++) {
        long long sum = 0;
        for (int j = 0; j < m; j++) sum += a[i][j];
        if (i) cout << ' ';
        cout << sum;
    }
    cout << '\\n';
}`,
  },
  {
    pid: 'AS1019', title: '回文口令', tags: ['入门', '字符串', '回文'], points: 25, topic: 'array-string',
    statement: `## 题目描述

如果一个字符串从左向右读与从右向左读完全相同，就称它为回文串。

给定一个只包含英文字母和数字的字符串，请判断它是否为回文串。

## 输入格式

输入一个不含空格的字符串 $s$。

## 输出格式

如果 $s$ 是回文串，输出 \`YES\`；否则输出 \`NO\`。

## 数据范围

$1 \\le |s| \\le 10^5$。字母区分大小写。`,
    tests: ['level', 'AlgoSpark', 'a', '1221', 'Aa'],
    solve: input => { const s = input.trim(); return s === [...s].reverse().join('') ? 'YES' : 'NO'; },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    string s;
    cin >> s;
    bool ok = true;
    for (int i = 0; i < (int)s.size() / 2; i++) {
        if (s[i] != s[s.size() - 1 - i]) ok = false;
    }
    cout << (ok ? "YES" : "NO") << '\\n';
}`,
  },
  {
    pid: 'AS1020', title: '目标字符计数', tags: ['入门', '字符串', '遍历'], points: 25, topic: 'array-string',
    statement: `## 题目描述

给定一个不含空格的字符串 $s$ 和一个目标字符 $c$，请统计 $c$ 在 $s$ 中出现了多少次。

## 输入格式

第一行输入字符串 $s$。

第二行输入一个字符 $c$。

## 输出格式

输出字符 $c$ 在字符串 $s$ 中出现的次数。

## 数据范围

$1 \\le |s| \\le 10^5$。字母区分大小写。`,
    tests: ['algospark\na', 'mississippi\ni', 'ABCABC\nA', 'code\nx', '1110011\n1'],
    solve: input => { const [s, c] = input.trim().split(/\s+/); return String([...s].filter(x => x === c).length); },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    string s;
    char target;
    cin >> s >> target;
    int answer = 0;
    for (char c : s) if (c == target) answer++;
    cout << answer << '\\n';
}`,
  },
  {
    pid: 'AS1021', title: '每组较大值之和', tags: ['入门', '函数', '循环'], points: 25, topic: 'function-struct',
    statement: `## 题目描述

共有 $n$ 组整数，每组包含两个整数 $a_i,b_i$。对每一组取较大的数，再计算这些较大值的总和。

建议编写一个返回两个整数中较大值的函数，并在循环中重复调用。

## 输入格式

第一行输入一个整数 $n$。

接下来 $n$ 行，每行输入两个整数 $a_i,b_i$。

## 输出格式

输出所有较大值的总和。

## 数据范围

$1 \\le n \\le 10^5$，$-10^9 \\le a_i,b_i \\le 10^9$。`,
    tests: ['3\n1 5\n8 2\n4 4', '1\n-3 -7', '4\n0 0\n-1 1\n10 -10\n5 6', '2\n1000000000 999999999\n1000000000 -1000000000', '5\n2 9\n7 3\n-4 -2\n6 6\n1 8'],
    solve: input => { const v = input.trim().split(/\s+/).map(BigInt); const n = Number(v[0]); let sum = 0n; for (let i = 0; i < n; i++) sum += v[1 + i * 2] > v[2 + i * 2] ? v[1 + i * 2] : v[2 + i * 2]; return String(sum); },
    solution: `#include <bits/stdc++.h>
using namespace std;
long long maximum(long long a, long long b) {
    if (a > b) return a;
    return b;
}
int main() {
    int n;
    cin >> n;
    long long answer = 0;
    for (int i = 0; i < n; i++) {
        long long a, b;
        cin >> a >> b;
        answer += maximum(a, b);
    }
    cout << answer << '\\n';
}`,
  },
  {
    pid: 'AS1022', title: '最佳训练队员', tags: ['入门', '结构体', '统计'], points: 35, topic: 'function-struct',
    statement: `## 题目描述

训练队中有 $n$ 名同学。每名同学有姓名和三项训练成绩。

请找出三项成绩总和最高的同学，输出其姓名和总分。如果多人总分相同，输出输入顺序最靠前的同学。

## 输入格式

第一行输入一个整数 $n$。

接下来 $n$ 行，每行包含一个不含空格的姓名，以及三个整数成绩。

## 输出格式

输出最佳队员的姓名和总分，中间用一个空格分隔。

## 数据范围

$1 \\le n \\le 10^4$，每项成绩均为 $0$ 到 $100$ 的整数，姓名长度不超过 30。`,
    tests: ['3\nAlice 90 80 70\nBob 88 92 85\nCarol 100 70 60', '1\nSolo 0 0 0', '3\nFirst 90 90 90\nSecond 100 80 90\nThird 70 100 100', '4\nA 10 20 30\nB 30 40 50\nC 100 100 100\nD 99 100 100', '2\nLongName 100 90 80\nShort 90 90 90'],
    solve: input => { const lines = input.trim().split(/\r?\n/); const n = Number(lines[0]); let bestName = '', best = -1; for (let i = 1; i <= n; i++) { const [name, ...scores] = lines[i].trim().split(/\s+/); const total = scores.reduce((a, b) => a + Number(b), 0); if (total > best) { best = total; bestName = name; } } return `${bestName} ${best}`; },
    solution: `#include <bits/stdc++.h>
using namespace std;
struct Student {
    string name;
    int score[3];
};
int totalScore(const Student &student) {
    return student.score[0] + student.score[1] + student.score[2];
}
int main() {
    int n;
    cin >> n;
    vector<Student> students(n);
    for (Student &student : students) {
        cin >> student.name >> student.score[0] >> student.score[1] >> student.score[2];
    }
    int best = 0;
    for (int i = 1; i < n; i++) {
        if (totalScore(students[i]) > totalScore(students[best])) best = i;
    }
    cout << students[best].name << ' ' << totalScore(students[best]) << '\\n';
}`,
  },
  {
    pid: 'AS1023', title: '训练序列排序', tags: ['入门', 'vector', 'sort'], points: 25, topic: 'function-struct',
    statement: `## 题目描述

给定 $n$ 个整数，请将它们从小到大排序后输出。

## 输入格式

第一行输入一个整数 $n$。

第二行输入 $n$ 个整数。

## 输出格式

输出排序后的 $n$ 个整数，相邻整数之间用一个空格分隔，行末换行。

## 数据范围

$1 \\le n \\le 10^5$，$-10^9 \\le a_i \\le 10^9$。`,
    tests: ['5\n8 3 6 1 9', '1\n42', '6\n3 3 2 1 2 1', '5\n-1 -5 0 8 -3', '7\n1000000000 -1000000000 5 4 3 2 1'],
    solve: input => input.trim().split(/\s+/).slice(1).map(Number).sort((a, b) => a - b).join(' '),
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<long long> a(n);
    for (long long &x : a) cin >> x;
    sort(a.begin(), a.end());
    for (int i = 0; i < n; i++) {
        if (i) cout << ' ';
        cout << a[i];
    }
    cout << '\\n';
}`,
  },
  {
    pid: 'AS1024', title: '训练平均分', tags: ['入门', '浮点数', '输出格式'], points: 20, topic: 'basic',
    statement: `## 题目描述

给定 $n$ 项训练成绩，请计算它们的平均分，并固定保留两位小数输出。

## 输入格式

第一行输入一个整数 $n$。

第二行输入 $n$ 个整数，表示各项训练成绩。

## 输出格式

输出平均分，结果固定保留两位小数。

## 数据范围

$1 \\le n \\le 10^5$，$0 \\le a_i \\le 100$。`,
    tests: ['4\n80 90 70 100', '3\n1 2 2', '1\n0', '5\n100 100 99 98 97', '6\n60 70 80 90 75 85'],
    solve: input => { const a = input.trim().split(/\s+/).slice(1).map(Number); return (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2); },
    solution: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long sum = 0, x;
    for (int i = 0; i < n; i++) {
        cin >> x;
        sum += x;
    }
    cout << fixed << setprecision(2) << 1.0 * sum / n << '\\n';
}`,
  },
];

function yamlString(value) {
  return JSON.stringify(value);
}

function sampleSections(problem) {
  return [0, 1].map((index, order) => {
    const input = problem.tests[index].trim();
    const output = problem.solve(problem.tests[index]).trim();
    const suffix = ` ${order + 1}`;
    return `## 输入样例${suffix}\n\n\`\`\`\n${input}\n\`\`\`\n\n## 输出样例${suffix}\n\n\`\`\`\n${output}\n\`\`\``;
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
    writeFileSync(join(testdata, `${id}.in`), `${input.trim()}\n`, 'utf8');
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

const manifest = problems.map(({ pid, title, tags, points, topic }) => ({
  pid, title, tags, points, track: 'grammar', topic, active: true,
}));
writeFileSync(join(packRoot, 'algospark-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
writeFileSync(join(packRoot, 'README.md'), `# AlgoSpark 语法后半程题包 v1

包含 ${problems.length} 道原创 C++ 语法训练题（${problems[0].pid}–${problems.at(-1).pid}），用于补齐循环、数组、字符串、函数、结构体、STL 与固定小数位数练习。

本题包不包含已经发布的 AS1001–AS1014，可独立导入 Hydro。
`, 'utf8');

console.log(`Generated ${problems.length} problems in ${packRoot}`);
