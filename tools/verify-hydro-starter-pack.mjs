import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packRoots = ['algospark-starter-v1', 'algospark-grammar-tail-v1']
  .map(directory => resolve(import.meta.dirname, '..', 'hydro-problems', directory));
const buildRoot = mkdtempSync(join(tmpdir(), 'algospark-hydro-verify-'));

function normalized(value) {
  return String(value).replace(/\r\n/g, '\n').trimEnd();
}

try {
  let verified = 0;
  for (const packRoot of packRoots) {
    const problems = readdirSync(packRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^AS\d+$/.test(entry.name))
      .map(entry => entry.name).sort();
    for (const pid of problems) {
      const executable = join(buildRoot, `${pid}.exe`);
      execFileSync('g++.exe', ['-std=c++17', '-O2', '-Wall', '-Wextra', join(packRoot, pid, 'solution', 'solution.cc'), '-o', executable], { stdio: 'pipe' });
      const testdata = join(packRoot, pid, 'testdata');
      const inputs = readdirSync(testdata).filter(name => /^\d+\.in$/.test(name)).sort((a, b) => Number(a) - Number(b));
      for (const inputName of inputs) {
        const input = readFileSync(join(testdata, inputName));
        const expected = readFileSync(join(testdata, inputName.replace(/\.in$/, '.out')), 'utf8');
        const result = spawnSync(executable, { input, encoding: 'utf8', timeout: 3000 });
        if (result.error || result.status !== 0) throw new Error(`${pid}/${inputName} 运行失败：${result.error?.message || result.stderr}`);
        if (normalized(result.stdout) !== normalized(expected)) {
          throw new Error(`${pid}/${inputName} 答案不一致\nexpected: ${expected}\nactual: ${result.stdout}`);
        }
      }
      verified++;
      console.log(`PASS ${pid}: ${inputs.length} cases`);
    }
  }
  console.log(`Verified ${verified} Hydro problems.`);
} finally {
  rmSync(buildRoot, { recursive: true, force: true });
}
