const { chromium } = require('@playwright/test');

async function run() {
  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  
  p.on('console', msg => consoleMsgs.push(`${msg.type()}: ${msg.text()}`));
  p.on('pageerror', err => pageErrors.push(err.message));

  const routes = [
    { url: '/', name: 'HOME' },
    { url: '/#/shop', name: 'SHOP' },
    { url: '/#/sell', name: 'SELL' },
    { url: '/vendre', name: 'SELL_REACT' },
    { url: '/#/shop?page=2&q=test', name: 'SHOP_PAGINATED' },
    { url: '/#/favs', name: 'FAVS' },
    { url: '/#/cart', name: 'CART' },
    { url: '/#/checkout', name: 'CHECKOUT' },
    { url: '/#/login', name: 'LOGIN' },
    { url: '/#/account', name: 'ACCOUNT' },
    { url: '/vendre', name: 'SELL_REACT_ROUTE' },
  ];

  const results = [];

  for (const route of routes) {
    console.log(`\n=== ${route.name} (${route.url}) ===`);
    await p.goto('http://localhost:5174' + route.url, { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 3000));

    const data = await p.evaluate(function() {
      return {
        title: document.title,
        hasBureau: !!document.querySelector('html[data-bureau]'),
        header: !!document.querySelector('header.site'),
        footer: !!document.querySelector('footer.site'),
        sprite: !!document.querySelector('svg.symbol-sprite'),
        bureauRoot: !!document.querySelector('.bureau-root'),
        appEl: document.getElementById('app') ? 'EXISTS' : 'MISSING',
        headerUserMenu: !!document.querySelector('[class*="header-user"]'),
        sellWizard: !!document.querySelector('[class*="sell-wizard"], [class*="sell-step"]'),
        productList: !!document.querySelector('.product-list, [class*="product-list"]'),
        productCards: document.querySelectorAll('.card, [class*="product-card"]').length,
        filterSidebar: !!document.querySelector('[class*="filter"], .filter-sidebar'),
        pagination: !!document.querySelector('[class*="pagination"]'),
        stepper: !!document.querySelector('[role="list"] ol'),
        step1: !!document.querySelector('select[name="categoryId"]'),
        appInnerHTML: document.getElementById('app') ? document.getElementById('app').innerHTML.slice(0, 300) : 'NO APP',
      };
    });

    console.log(route.name, JSON.stringify(data, null, 2));
    results.push({ route: route.name, ...data });
  }

  // Test login flow
  console.log('\n=== LOGIN FLOW ===');
  await p.goto('http://localhost:5174/#/login', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));
  
  // Fill login form
  await p.fill('input[name="identifier"]', 'admin@revends.com');
  await p.fill('input[name="password"]', 'DevopsChangeMe123');
  await p.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 3000));

  // Check if logged in
  const loginResult = await p.evaluate(() => {
    return {
      userLogged: !!document.querySelector('[class*="header-user"]'),
      userMenu: !!document.querySelector('[class*="header-user-menu"]'),
      cartBadge: !!document.querySelector('[class*="cart-badge"]'),
      favBadge: !!document.querySelector('[class*="fav-badge"]'),
    };
  });
  console.log('LOGIN RESULT', JSON.stringify(loginResult));

  // Test protected routes after login
  console.log('\n=== PROTECTED ROUTES AFTER LOGIN ===');
  const protectedRoutes = [
    { url: '/#/sell', name: 'SELL_PROTECTED' },
    { url: '/#/cart', name: 'CART_PROTECTED' },
    { url: '/#/checkout', name: 'CHECKOUT_PROTECTED' },
    { url: '/#/favs', name: 'FAVS_PROTECTED' },
    { url: '/#/account', name: 'ACCOUNT_PROTECTED' },
  ];

  for (const route of protectedRoutes) {
    await p.goto('http://localhost:5174' + route.url, { waitUntil: 'networkidle' });
    await new Promise(r => setTimeout(r, 2000));
    const data = await p.evaluate(() => ({
      title: document.title,
      hasBureau: !!document.querySelector('html[data-bureau]'),
      header: !!document.querySelector('header.site'),
      footer: !!document.querySelector('footer.site'),
      sellWizard: !!document.querySelector('[class*="sell-wizard"], [class*="sell-step"]'),
      cartItems: document.querySelectorAll('.cart-item, [class*="cart-item"]').length,
    }));
    console.log(route.name, JSON.stringify(data));
  }

  // Test logout
  console.log('\n=== LOGOUT ===');
  await p.goto('http://localhost:5174/#/account', { waitUntil: 'networkidle' });
  await new Promise(r => setTimeout(r, 2000));
  
  const logoutBtn = await p.$('button:has-text("Déconnexion"), a:has-text("Déconnexion"), [data-logout]');
  if (logoutBtn) {
    await logoutBtn.click();
    await new Promise(r => setTimeout(r, 2000));
    const logoutResult = await p.evaluate(() => ({
      redirected: window.location.hash.includes('login') || window.location.pathname.includes('login'),
      userMenu: !!document.querySelector('[class*="header-user-menu"]'),
      loginLink: !!document.querySelector('a[href="#/login"]'),
    }));
    console.log('LOGOUT RESULT', JSON.stringify(logoutResult));
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log('Errors:', pageErrors.length);
  if (pageErrors.length > 0) {
    pageErrors.forEach(e => console.error('ERROR:', e));
  }
  console.log('Console errors:', consoleMsgs.filter(m => m.includes('error')).length);

  await new Promise(r => setTimeout(r, 300000));
  await b.close();
}

run().catch(console.error);