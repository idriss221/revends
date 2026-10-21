import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:4180/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
await p.evaluate(() => document.querySelectorAll('img').forEach(i => i.loading='eager'));
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const get = t => [...document.querySelectorAll('section')].filter(s => s.querySelector('h2')?.textContent.trim() === t);
  const secs = { 'Les nouveautés': get('Les nouveautés')[0], 'Trouvailles à petits prix': get('Trouvailles à petits prix')[0] };
  const out = {};
  for (const [k, s] of Object.entries(secs)) {
    const cards = [...s.querySelectorAll('.grid .card')];
    const first = cards[0].getBoundingClientRect();
    out[k] = {
      cards: cards.length,
      cardSize: `${Math.round(first.width)}x${Math.round(first.height)}`,
      skeleton: cards.filter(c => c.classList.contains('skeleton')).length,
      sellers: [...new Set(cards.map(c => c.querySelector('.by')?.textContent.replace('Vendu par ','').trim()))],
      allPriced: cards.every(c => c.querySelector('.price')?.textContent.trim()),
    };
  }
  const A = get('Les nouveautés')[0], B = get('Trouvailles à petits prix')[0];
  const an = [...A.querySelectorAll('.name')].map(x=>x.textContent.trim());
  const bn = [...B.querySelectorAll('.name')].map(x=>x.textContent.trim());
  out.overlap = an.filter(x => bn.includes(x)).length;
  out.maxOverlap = an.filter(x => bn.includes(x));
  return out;
});
console.log(JSON.stringify(r, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs.slice(0,2) : 'none');
await b.close();
