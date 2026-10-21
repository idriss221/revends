const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== TEST: CLICK VENDRE -> LOGIN REDIRECT ===');
  
  // 1. Start at home
  await p.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));
  
  // 2. Click "Vendre" in header (should be in the bureau shell)
  console.log('Clicking "Vendre" link...');
  await p.click('a[href="#/sell"]:visible, a:has-text("Vendre"):visible');
  await new Promise(r => setTimeout(r, 3000));
  
  // Check where we ended up
  const data1 = await p.evaluate(() => ({
    url: window.location.href,
    hash: window.location.hash,
    hasBureau: !!document.querySelector('html[data-bureau]'),
    header: !!document.querySelector('header.site'),
    title: document.title,
    sellWizard: !!document.querySelector('[class*="sell-wizard"], [class*="sell-step"]'),
    loginForm: !!document.querySelector('form input[name="identifier"]'),
    headerVisible: !!document.querySelector('header.site'),
  }));
  console.log('AFTER CLICK VENDRE:', JSON.stringify(data1, null, 2));
  
  // If we're on login page, check if it has bureau shell
  if (window.location.hash.includes('login')) {
    console.log('\n=== ON LOGIN PAGE AFTER VENDRE CLICK ===');
    const loginData = await p.evaluate(() => ({
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      title: document.title,
      formVisible: !!document.querySelector('form input[name="identifier"]'),
    }));
    console.log('LOGIN PAGE DATA:', JSON.stringify(data1, null, 2));
  }
  
  // Screenshot
  await p.screenshot({ path: '/tmp/opencode/sell-click-result.png' });
  
  console.log('\nCONSOLE ERRORS:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error')));
  console.log('PAGE ERRORS:', pageErrors);
  
  await new Promise(r => setTimeout(r, 60000));
  await b.close();
}

run().catch(console.error);