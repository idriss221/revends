import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{ width:1440, height:1000 } });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const bad=[]; p.on('response', r=>{ if(r.status()>=400 && r.url().includes('/api/')) bad.push(r.status()+' '+r.url().replace(/^.*\/api/,'/api')); });
const RUN=Date.now();
const PH='+22507'+String(10000000+(RUN%1000000)+95).slice(-8);

await p.goto('http://127.0.0.1:4173/#/login',{waitUntil:'load'});
await p.waitForTimeout(3000);
// basculer en mode inscription
// pas de switch : le form est déjà en mode inscription
await p.waitForTimeout(600);
const mode = await p.$eval('#authTitle', e=>e.textContent);
await p.fill('#aName', `E2E ${RUN}`);
await p.fill('#aMail', `e2e.${RUN}@test.local`);
await p.fill('#aPhone', PH);
await p.fill('#aPass', 'Motdepasse1!');
await p.fill('#aPass2', 'Motdepasse1!');
await p.check('#aTos').catch(()=>{});
await p.click('#authSubmit');
await p.waitForTimeout(5000);
console.log('titre form avant soumission:', JSON.stringify(mode));
console.log('après inscription → hash =', await p.evaluate(()=>location.hash));
const me = await p.evaluate(async()=>{ const r=await fetch('/api/auth/me',{credentials:'include'}); return r.status; });
console.log('session serveur /auth/me:', me);

const addCart = await p.evaluate(async()=>{ const r=await fetch('/api/cart',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:29,qty:1})}); return r.status; });
console.log('POST /api/cart:', addCart);
const addFav = await p.evaluate(async()=>{ const r=await fetch('/api/favorites',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:31})}); return r.status; });
console.log('POST /api/favorites:', addFav);

await p.goto('http://127.0.0.1:4173/#/cart'); await p.waitForTimeout(2500);
const cartTxt = await p.evaluate(()=>document.body.innerText.slice(0,140).replace(/\n/g,' | '));
console.log('page panier:', cartTxt);
await p.goto('http://127.0.0.1:4173/#/favorites'); await p.waitForTimeout(2500);
const favTxt = await p.evaluate(()=>document.body.innerText.slice(0,140).replace(/\n/g,' | '));
console.log('page favoris:', favTxt);
console.log('\nAPPELS API EN ERREUR:', bad.length? bad.slice(0,6).join('\n  ') : 'aucun');
console.log('ERREURS JS:', errs.length? errs.slice(0,3):'aucune');
await b.close();
