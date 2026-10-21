import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
// load lazy images by walking the real page
for (let y = 0; y < 3500; y += 400) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(180); }
await p.waitForTimeout(3000);
await p.evaluate(() => document.querySelectorAll('.grid .card img, .card .skel-img').forEach(i => i.loading = 'eager'));
await p.waitForTimeout(2000);
const st = await p.evaluate(() => {
  const get = t => [...document.querySelectorAll('section')].filter(s => s.querySelector('h2')?.textContent.trim() === t);
  const b2 = get('Trouvailles à petits prix')[0];
  return {
    nouveauCards: get('Les nouveautés')[0]?.querySelectorAll('.grid .card').length,
    trouvCards: b2 ? b2.querySelectorAll('.grid .card').length : -1,
    trouvHasGrid: !!(b2 && b2.querySelector('.grid')),
    headerPos: getComputedStyle(document.querySelector('header.site')).position,
    headerZ: getComputedStyle(document.querySelector('header.site')).zIndex,
    pageH: document.body.scrollHeight,
  };
});
console.log(JSON.stringify(st));
await p.screenshot({ path: '/tmp/opencode/full.png', fullPage: true });
console.log('PAGE_ERRORS:', errs.length ? errs.slice(0,2) : 'none');
await b.close();
