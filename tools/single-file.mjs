// Składa zbudowaną grę (dist/) w jeden samodzielny plik HTML (do publikacji jako strona).
// Użycie: node tools/single-file.mjs <plik-wyjściowy.html>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const out = process.argv[2];
if (!out) throw new Error('Podaj ścieżkę pliku wyjściowego');
const html = readFileSync('dist/index.html', 'utf8');
const assets = readdirSync('dist/assets');
const css = readFileSync(`dist/assets/${assets.find((a) => a.endsWith('.css'))}`, 'utf8');
const js = readFileSync(`dist/assets/${assets.find((a) => a.endsWith('.js'))}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
  .trim();
const page = `<title>Elektrownia wodna</title>
<style>
${css}
</style>
${body}
<script type="module">
${js}
</script>
`;
writeFileSync(out, page);
console.log(`Zapisano ${out} (${(page.length / 1024).toFixed(0)} kB)`);
