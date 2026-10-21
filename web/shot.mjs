import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await p.waitForTimeout(2500);
// force load all lazy images then screenshot the 2 product sections
for (let y = 0; y < 4000; y += 500) { await p.evaluate(v => scrollTo(0, v), y); await p.waitForTimeout(150); }
await p.evaluate(() => {
  const secs = [...document.querySelectorAll('section')].filter(s => {
    const t = s.querySelector('h2')?.textContent.trim();
    return t === 'Les nouveautés' || t === 'Trouvailles à petits prix';
  });
  secs.forEach(s => s.querySelectorAll('img').forEach(i => i.loading = 'eager'));
});
await p.waitForTimeout(3000);
const el = await p.evaluateHandle(() => {
  const secs = [...document.querySelectorAll('section')].filter(s => {
    const t = s.querySelector('h2')?.textContent.trim();
    return t === 'Les nouveautés' || t === 'Trouvailles à petits prix';
  });
  const wrap = document.createElement('div');
  wrap.style.background = getComputedStyle(document.body).backgroundColor;
  secs.forEach(s => wrap.appendChild(s.cloneNode(true)));
  wrap.setAttribute('id', 'shotwrap');
  document.body.appendChild(wrap);
  return wrap;
});
await el.screenshot({ path: '/tmp/opencode/revends-card-pair.png' });
console.log('PAGE_ERRORS:', errs.length ? errs.slice(0,2) : 'none');
await b.close();
