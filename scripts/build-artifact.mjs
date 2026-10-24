// dist/（vite build の出力）から、アーティファクト用の 1 ファイルのページを作る。
// アーティファクトは <!doctype>/<html>/<head>/<body> を自動で付けるので、中身だけを書き出す。
// usage: node scripts/build-artifact.mjs <out.html> [dist-dir] [page.html]
//   3D 再現：node scripts/build-artifact.mjs out.html
//   ゲーム  ：node scripts/build-artifact.mjs out.html dist/game game.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const out = process.argv[2] ?? 'dist/artifact.html';
const dir = process.argv[3] ?? 'dist';
const page = process.argv[4] ?? 'index.html';
const html = readFileSync(`${dir}/${page}`, 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '').trim();
const jsFiles = readdirSync(`${dir}/assets`).filter((f) => f.endsWith('.js'));
if (jsFiles.length !== 1) throw new Error(`${dir}/assets に JS が ${jsFiles.length} 個あります（1 個の前提）`);
let js = readFileSync(`${dir}/assets/${jsFiles[0]}`, 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');
writeFileSync(out, `${title}\n${styles}\n${body}\n<script type="module">\n${js}\n</script>\n`);
console.log('wrote', out, Math.round((title.length + styles.length + body.length + js.length) / 1024), 'KiB');
