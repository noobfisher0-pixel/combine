// dist/（vite build の出力）から、アーティファクト用の 1 ファイルのページを作る。
// アーティファクトは <!doctype>/<html>/<head>/<body> を自動で付けるので、中身だけを書き出す。
// usage: node scripts/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const out = process.argv[2] ?? 'dist/artifact.html';
const html = readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '').trim();
const jsFile = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
let js = readFileSync(`dist/assets/${jsFile}`, 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');
writeFileSync(out, `${title}\n${styles}\n${body}\n<script type="module">\n${js}\n</script>\n`);
console.log('wrote', out, Math.round((title.length + styles.length + body.length + js.length) / 1024), 'KiB');
