import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [], failed = [];
p.on('pageerror', e => errs.push(String(e)));
p.on('requestfailed', r => failed.push(r.url().slice(0,90)));
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(2500);

const data = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('section').forEach(sec => {
    const h2 = sec.querySelector('h2');
    if (!h2) return;
    const title = h2.textContent.trim();
    if (!/nouveaut|Trouvailles/i.test(title)) return;
    const cards = [...sec.querySelectorAll('.grid .card')].map(c => {
      const img = c.querySelector('.im img');
      const r = c.getBoundingClientRect();
      return {
        name: c.querySelector('.name')?.textContent.trim().slice(0,34) || null,
        price: c.querySelector('.price')?.textContent.trim().slice(0,22) || null,
        imgOk: img ? (img.complete && img.naturalWidth > 0) : false,
        w: Math.round(r.width), h: Math.round(r.height),
        skeleton: c.classList.contains('skeleton'),
      };
    });
    out.push({ title, count: cards.length, cards });
  });
  return out;
});
console.log(JSON.stringify(data, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs.slice(0,3) : 'none');
console.log('FAILED_REQ:', failed.length ? failed.slice(0,3) : 'none');
await p.screenshot({ path: '/tmp/opencode/home.png', fullPage: false });
await b.close();
