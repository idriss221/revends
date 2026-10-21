import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function run(url, label) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(url, { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(2000);
  for (let y = 0; y < 7000; y += 600) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(200); }
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const secs = {};
    document.querySelectorAll('section').forEach(sec => {
      const h2 = sec.querySelector('h2'); if (!h2) return;
      const t = h2.textContent.trim(); if (!/nouveaut|Trouvailles/i.test(t)) return;
      secs[t] = [...sec.querySelectorAll('.grid .card')].map(c => c.querySelector('.name')?.textContent.trim());
    });
    const k = Object.keys(secs);
    const A = secs[k[0]] || [], B = secs[k[1]] || [];
    const overlap = A.filter(x => B.includes(x));
    // image health after scroll
    let loaded = 0, tot = 0;
    document.querySelectorAll('.grid .card .im img').forEach(i => { tot++; if (i.complete && i.naturalWidth > 0) loaded++; });
    return { a: A.length, b: B.length, overlapCount: overlap.length, overlap, imgLoaded: loaded, imgTotal: tot };
  });
  console.log('==', label, JSON.stringify(r, null, 1));
  await p.close();
}
await run('http://127.0.0.1:4173/', 'REVENDS');
await run('file:///home/dioufidriss/Bureau/main/index.html', 'REFERENCE');
await b.close();
