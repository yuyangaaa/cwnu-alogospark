// Keep browser math assets local so rendering does not depend on a CDN.
import { readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/katex/', root);
const { version } = JSON.parse(readFileSync(new URL('package.json', source), 'utf8'));
const target = new URL(`vendor/katex-${version}/`, root);
mkdirSync(new URL('fonts/', target), { recursive: true });
copyFileSync(new URL('dist/katex.min.js', source), new URL('katex.min.js', target));
copyFileSync(new URL('LICENSE', source), new URL('LICENSE', target));
const css = readFileSync(new URL('dist/katex.min.css', source), 'utf8')
  .replace(/src:[^;]+;/g, value => {
    const woff2 = value.match(/url\([^)]+\.woff2\) format\("woff2"\)/);
    return woff2 ? `src:${woff2[0]};` : value;
  });
writeFileSync(new URL('katex.min.css', target), css);
for (const [, path] of css.matchAll(/url\((fonts\/[^)]+)\)/g)) {
  copyFileSync(new URL(`dist/${path}`, source), new URL(path, target));
}
console.log(`Vendored KaTeX ${version}`);
