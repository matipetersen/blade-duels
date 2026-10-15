// node tools/build-artifact.js out.html
// Bundles the game into ONE self-contained page fragment (title, styles, markup, scripts) for hosts that wrap
// the page in their own document, such as a claude.ai Artifact. No service worker or manifest is included.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const body = html.slice(html.indexOf('<div id="app">'), html.indexOf('<script src="core.js">')).trim();
const css = read('style.css').replace('body { min-height: 100vh;', 'body { min-height: 100%;');
// the service worker only makes sense when the game is served as its own site
const noSw = (src) => src.replace(/ {2}\/\/ installable web app[\s\S]*?\/\* no service worker \*\/ \}\n/, '');
const js = ['core.js', 'ai.js', 'audio.js', 'render.js', 'guide.js', 'main.js'].map((f) => `/* ${f} */\n` + noSw(read(f)).replace(/<\/script/gi, '<\\/script')).join('\n');

const out = `<title>Blade Duels</title>
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Orbitron:wght@700;800&display=swap" rel="stylesheet">
<style>
:root { color-scheme: dark; }
html { height: 100%; }
${css}
body { padding-left: max(0px, env(safe-area-inset-left, 0px)); padding-right: max(0px, env(safe-area-inset-right, 0px)); }
</style>
${body}
<script>
${js}
</script>
`;
fs.writeFileSync(process.argv[2] || path.join(root, 'blade-duels.artifact.html'), out);
console.log('wrote', process.argv[2], (out.length / 1024).toFixed(0) + ' KB');
