const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  console.log('=== LOGIN PAGE ===');
  await p.goto('http://localhost:5174/#/login', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 5000));

  const data = await p.evaluate(function() {
    const forms = document.querySelectorAll('form');
    const inputs = document.querySelectorAll('input');
    const buttons = document.querySelectorAll('button[type="submit"]');
    const identifierInput = document.querySelector('input[name="identifier"]');
    const passwordInput = document.querySelector('input[name="password"]');
    const submitBtn = document.querySelector('button[type="submit"]');
    
    return {
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      forms: forms.length,
      inputs: inputs.length,
      buttons: buttons.length,
      identifierInput: !!identifierInput,
      passwordInput: !!passwordInput,
      submitBtn: !!submitBtn,
      identifierVisible: identifierInput ? identifierInput.offsetParent !== null : false,
      passwordVisible: passwordInput ? passwordInput.offsetParent !== null : false,
      submitVisible: submitBtn ? submitBtn.offsetParent !== null : false,
    };
  });

  console.log('LOGIN FORM DATA:', JSON.stringify(data, null, 2));
  console.log('\nCONSOLE ERRORS:', consoleMsgs.filter(m => m.includes('error') || m.includes('Error')).slice(-10));
  console.log('PAGE ERRORS:', pageErrors);
}

run().catch(console.error);