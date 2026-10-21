import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function measure(url, label) {
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(url, { waitUntil: 'load', timeout: 45000 });
  await p.waitForTimeout(2500);
  // scroll through to trigger lazy images
  for (let y = 0; y < 6000; y += 700) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(250); }
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('section').forEach(sec => {
      const h2 = sec.querySelector('h2'); if (!h2) return;
      const t = h2.textContent.trim(); if (!/nouveaut|Trouvailles/i.test(t)) return;
      const cards = [...sec.querySelectorAll('.grid .card')];
      const first = cards[0]; const box = first?.getBoundingClientRect();
      const img = first?.querySelector('.im img');
      out.push({ title: t, cards: cards.length,
        cardW: box ? Math.round(box.width) : null, cardH: box ? Math.round(box.height) : null,
        imgW: img ? Math.round(img.getBoundingClientRect().width) : null,
        imgH: img ? Math.round(img.getBoundingClientRect().height) : null,
        imgLoaded: img ? (img.complete && img.naturalWidth > 0) : false,
        src: img ? img.currentSrc.slice(0, 70) : null });
    });
    const g = document.querySelector('.grid');
    out.push({ gridCols: g ? getComputedStyle(g).gridTemplateColumns.split(' ').length : null });
    return out;
  });
  console.log('==', label); console.log(JSON.stringify(r, null, 1));
  await p.close(); return r;
}

await measure('http://127.0.0.1:4173/', 'REVENDS (actuel)');
await measure('file:///home/dioufidriss/Bureau/main/index.html', 'MAQUETTE REFERENCE');
await b.close();
