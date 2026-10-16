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

const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'icons', f)).toString('base64');
const icons = { 32: uri('favicon-32.png'), 180: uri('apple-touch-icon.png'), 192: uri('icon-192.png'), 512: uri('icon-512.png'), maskable: uri('icon-maskable-512.png') };
// like the real web manifest, but made on the fly: a data: page has no manifest file to point to
const installable = `(function () {
  try {
    var m = { name: 'Blade Duels', short_name: 'Blade Duels', display: 'standalone', orientation: 'any', background_color: '#07040f', theme_color: '#07040f',
      start_url: location.href.split('#')[0],
      icons: [{ src: window.BD_ICON, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: ${JSON.stringify(icons[512])}, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: ${JSON.stringify(icons.maskable)}, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] };
    var l = document.createElement('link'); l.rel = 'manifest';
    l.href = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }));
    document.head.appendChild(l);
  } catch (e) { /* the page works without it */ }
})();`;

const out = `<title>Blade Duels</title>
<link rel="icon" type="image/png" sizes="32x32" href="${icons[32]}">
<link rel="apple-touch-icon" sizes="180x180" href="${icons[180]}">
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Orbitron:wght@700;800&display=swap" rel="stylesheet">
<style>
:root { color-scheme: dark; }
html { height: 100%; }
${css}
body { padding-left: max(0px, env(safe-area-inset-left, 0px)); padding-right: max(0px, env(safe-area-inset-right, 0px)); }
</style>
${body}
<script>
window.BD_ICON = ${JSON.stringify(icons[192])};
${js}
${installable}
</script>
`;
fs.writeFileSync(process.argv[2] || path.join(root, 'blade-duels.artifact.html'), out);
console.log('wrote', process.argv[2], (out.length / 1024).toFixed(0) + ' KB');
