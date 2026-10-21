import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
async function run(url, label) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(url, { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(2000);
  for (let y = 0; y < 7000; y += 600) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(200); }
  await p.waitForTimeout(3000);
  const r = await p.evaluate(() => {
    const get = (exact) => {
      const sec = [...document.querySelectorAll('section')].find(s =>
        s.querySelector('h2')?.textContent.trim() === exact);
      return sec ? [...sec.querySelectorAll('.grid .card')].map(c => c.querySelector('.name')?.textContent.trim()) : [];
    };
    const A = get('Les nouveautés'), B = get('Trouvailles à petits prix');
    return { newest: A.length, budget: B.length, overlap: A.filter(x => B.includes(x)) };
  });
  console.log('==', label); console.log('  Les nouvelles   :', r.newest); console.log('  Trouvailles     :', r.budget);
  console.log('  OVERLAP         :', r.overlap.length, r.overlap);
  await p.close();
}
await run('http://127.0.0.1:4180/', 'REVENDS');
await run('file:///home/dioufidriss/Bureau/main/index.html', 'REFERENCE');
await b.close();
