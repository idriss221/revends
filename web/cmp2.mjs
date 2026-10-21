import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const out = {};
  document.querySelectorAll('section').forEach(sec => {
    const h2 = sec.querySelector('h2'); if (!h2) return;
    const t = h2.textContent.trim(); if (!/nouveaut|Trouvailles/i.test(t)) return;
    out[t] = [...sec.querySelectorAll('.grid .card')].map(c => ({
      n: c.querySelector('.name')?.textContent.trim(),
      img: (c.querySelector('.im img')?.currentSrc || '').match(/photo-([\w-]+)/)?.[1] || 'NONE',
      imgh: Math.round(c.querySelector('.im')?.getBoundingClientRect().height || 0),
    }));
  });
  return out;
});
for (const [k, v] of Object.entries(r)) {
  console.log('\n### ' + k + ' (' + v.length + ' cards)');
  v.forEach((c, i) => console.log(`  ${i+1}. ${String(c.n).slice(0,40).padEnd(42)} ${c.img.slice(0,26)} imgh=${c.imgh}`));
  const uniq = new Set(v.map(c => c.img)).size;
  console.log('  -> images uniques: ' + uniq + '/' + v.length);
}
await b.close();
