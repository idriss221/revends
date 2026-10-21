import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{ width:1440, height:1000 } });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const bad=[]; p.on('response', r=>{ if(r.status()>=400 && r.url().includes('/api/')) bad.push(r.status()+' '+r.url().replace(/^.*\/api/,'/api')); });
const RUN=Date.now();
const PH='+22507'+String(10000000+(RUN%1000000)+95).slice(-8);

await p.goto('http://127.0.0.1:4173/#/login',{waitUntil:'load'});
await p.waitForTimeout(2500);
// remplir le formulaire d'inscription
await p.evaluate(()=>{ const b=window.__RV_BUREAU__; if(b) b.switchMode&&b.switchMode('register'); });
await p.waitForTimeout(300);
await p.fill('#authForm input[name="displayName"], #displayName', `E2E ${RUN}`);
await p.fill('#name, #authForm input[name="name"]', 'E2E Testeur');
await p.fill('#email, #authForm input[name="email"]', `e2e.${RUN}@test.local`);
await p.fill('#phone', PH);
await p.fill('#password, #authForm input[name="password"]', 'Motdepasse1!');
await p.click('#authForm button[type="submit"], #authSubmit');
await p.waitForTimeout(4000);
console.log('après inscription → hash =', await p.evaluate(()=>location.hash));
const me = await p.evaluate(async()=>{ const r=await fetch('/api/auth/me',{credentials:'include'}); return r.status; });
console.log('session serveur (GET /auth/me):', me);

// Ajouter au panier via l'API avec le cookie du navigateur
const addRes = await p.evaluate(async()=>{
  const r=await fetch('/api/cart',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:29,qty:1})});
  return r.status;
});
console.log('POST /api/cart (add panier):', addRes);
const favRes = await p.evaluate(async()=>{
  const r=await fetch('/api/favorites',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:31})});
  return r.status;
});
console.log('POST /api/favorites (add favori):', favRes);

// Visiter les pages panier/favoris
await p.goto('http://127.0.0.1:4173/#/cart'); await p.waitForTimeout(2500);
await p.goto('http://127.0.0.1:4173/#/favorites'); await p.waitForTimeout(2500);
console.log('\nAPPELS API EN ERREUR:', bad.length? bad.slice(0,6).join('\n  ') : 'aucun');
console.log('ERREURS JS:', errs.length? errs.slice(0,3):'aucune');
await b.close();
