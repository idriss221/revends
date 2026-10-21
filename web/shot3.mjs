import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await p.waitForTimeout(2000);
for (let y = 0; y < 5000; y += 400) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(150); }
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelectorAll('img').forEach(i => i.loading='eager'));
await p.waitForTimeout(1500);
const h = await p.evaluate(() => {
  const s = [...document.querySelectorAll('section')].find(x => x.querySelector('h2')?.textContent.trim()==='Trouvailles à petits prix');
  s.scrollIntoView(false);
  return { top: s.getBoundingClientRect().top + scrollY, h: s.getBoundingClientRect().height };
});
await p.waitForTimeout(1200);
await p.screenshot({ path: '/tmp/opencode/trouv.png' });
console.log(JSON.stringify(h));
await b.close();
