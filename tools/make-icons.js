/* Generates the app icons from one SVG definition.
 *   node tools/make-icons.js
 * Needs Playwright with Chromium (only for rasterizing; the game itself has no dependencies). */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'icons');

// shape: 'rounded' (transparent corners, "any" purpose) | 'full' (full-bleed square, for iOS and maskable)
// inner: scale of the artwork, to keep it inside the safe zone when the OS crops it
function svg({ shape = 'rounded', inner = 1 } = {}) {
  const star = (cx, cy, ro, ri, n, rot) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2, r = i % 2 ? ri : ro * (0.94 + 0.06 * Math.sin(i * 2.7));
      pts.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1));
    }
    return pts.join(' ');
  };
  const sword = (deg) => `
    <g transform="rotate(${deg} 256 256)">
      <polygon points="256,56 273,98 277,334 235,334 239,98" fill="url(#blade)" stroke="#0b0b0b" stroke-width="10" stroke-linejoin="round"/>
      <line x1="256" y1="96" x2="256" y2="322" stroke="#7a8aa0" stroke-width="4" stroke-linecap="round" opacity=".7"/>
      <rect x="243" y="340" width="26" height="104" rx="9" fill="#1d1236" stroke="#0b0b0b" stroke-width="9"/>
      <path d="M243 360 L269 372 M243 384 L269 396 M243 408 L269 420" stroke="#ff2d95" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="256" cy="338" rx="40" ry="12" fill="#ffc300" stroke="#0b0b0b" stroke-width="9"/>
      <circle cx="256" cy="452" r="14" fill="#ffc300" stroke="#0b0b0b" stroke-width="8"/>
    </g>`;
  const bg = shape === 'rounded' ? '<rect width="512" height="512" rx="112" fill="url(#bg)"/>' : '<rect width="512" height="512" fill="url(#bg)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0a5e"/><stop offset=".55" stop-color="#12042e"/><stop offset="1" stop-color="#06020f"/></linearGradient>
    <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8defff"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#5fc9ea"/></linearGradient>
    <linearGradient id="burst" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14d"/><stop offset="1" stop-color="#ff5a1f"/></linearGradient>
    <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="10" cy="10" r="3.2" fill="#ff2d95" opacity=".38"/></pattern>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="disc"><circle cx="256" cy="256" r="206"/></clipPath>
  </defs>
  ${bg}
  <g transform="translate(256 256) scale(${inner}) translate(-256 -256)">
    <g clip-path="url(#disc)"><rect width="512" height="512" fill="url(#dots)"/></g>
    <circle cx="256" cy="256" r="214" fill="none" stroke="#ff2d95" stroke-width="16" filter="url(#glow)"/>
    <circle cx="256" cy="256" r="195" fill="none" stroke="#19e6ff" stroke-width="4" opacity=".85"/>
    <polygon points="${star(264, 266, 172, 108, 14, -0.2)}" fill="#0b0b0b"/>
    <polygon points="${star(256, 256, 172, 108, 14, -0.2)}" fill="url(#burst)" stroke="#0b0b0b" stroke-width="10" stroke-linejoin="round"/>
    <g filter="url(#glow)" style="filter:drop-shadow(0 0 6px #19e6ff)">${sword(-38)}${sword(38)}</g>
  </g>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.svg'), svg({ shape: 'rounded' }));
  const jobs = [
    ['icon-192.png', 192, { shape: 'rounded' }],
    ['icon-512.png', 512, { shape: 'rounded' }],
    ['icon-maskable-512.png', 512, { shape: 'full', inner: 0.78 }],   // content inside the 80% safe zone
    ['apple-touch-icon.png', 180, { shape: 'full', inner: 0.92 }],    // iOS adds its own rounded mask
    ['favicon-32.png', 32, { shape: 'rounded' }],
  ];
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
  const browser = await chromium.launch();
  for (const [file, size, opt] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0;background:transparent">${svg(opt).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('wrote', file);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
