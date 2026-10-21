import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{ width:1440, height:1000 } });
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const apiCalls=[];
p.on('response', r => { const u=r.url(); if (u.includes('/api/')) apiCalls.push(`${r.status()} ${u.replace(/^.*\/api/,'/api')}`); });
const RUN=Date.now();
await p.goto('http://127.0.0.1:4173/', {waitUntil:'load'});
await p.waitForTimeout(3500);

// 1. Accueil
await p.click('a[href="#/shop"]').catch(()=>{});
await p.waitForTimeout(2500);
const cards=await p.$$eval('.grid .card', e=>e.length);
console.log('ACCUEIL/SHOP cards:', cards);

// 2. Connexion
await p.goto('http://127.0.0.1:4173/#/login');
await p.waitForTimeout(2500);
console.log('form auth présent:', await p.$('#authForm') ? 'oui':'non');

// 3. Navigation compte sans session
await p.goto('http://127.0.0.1:4173/#/account');
await p.waitForTimeout(1500);
const hash=await p.evaluate(()=>location.hash);
console.log('accès #/account non connecté ->', hash, (hash.startsWith('#/login'))?'(protégé OK)':'(NON protégé)');

// 4. Panier
await p.goto('http://127.0.0.1:4173/#/cart');
await p.waitForTimeout(2000);
console.log('panier affiché:', await p.$('.cart-page, [data-cart], h1') ? 'oui' : '?');

// 5. Favoris
await p.goto('http://127.0.0.1:4173/#/favorites');
await p.waitForTimeout(2000);

console.log('\nAPPELS API (statuts):');
apiCalls.filter(c=>/\/api\/(me|c|f|c[a-z]*)/.test(c)||/cart|fav|me/.test(c)).slice(-10).forEach(c=>console.log('  '+c));
console.log('\nERREURS JS:', errs.length? errs.slice(0,3):'aucune');
await b.close();
