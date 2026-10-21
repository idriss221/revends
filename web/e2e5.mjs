import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{ width:1440, height:1000 }, baseURL:'http://127.0.0.1:4173' });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
const bad=[]; p.on('response', r=>{ if(r.status()>=400 && r.url().includes('/api/')) bad.push(r.status()+' '+r.url().replace(/^.*\/api/,'/api')); });
const RUN=Date.now();
const PH='+22507'+String(10000000+(RUN%1000000)+95).slice(-8);

// Session créée côté API (déjà prouvée fonctionnelle), puis injectée dans le navigateur
const reg = await fetch('http://127.0.0.1:8080/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({displayName:'E2E UI',name:'E2E UI',email:`e2eui.${RUN}@test.local`,phone:PH,password:'Motdepasse1!',acceptedCgu:true})});
const cookie = (reg.headers.getSetCookie?.()??[]).map(c=>c.split(';')[0]).join('; ');
console.log('register:', reg.status, '| cookie:', cookie ? 'oui' : 'NON');

for (const [label, pid] of [['panier',29],['favoris',31]]) {
  const path = label==='panier' ? '/api/cart' : '/api/favorites';
  const r = await fetch('http://127.0.0.1:8080'+path,{method:'POST',headers:{'Content-Type':'application/json','Cookie':cookie},body:JSON.stringify({productId:pid})});
  console.log(`ajout ${label}:`, r.status);
}
await ctx.addCookies([{name:'connect.sid', value:decodeURIComponent(cookie.split('=')[1]), domain:'127.0.0.1', path:'/'}]);

for (const [hash, label] of [['#/cart','PANIER'],['#/favorites','FAVORIS'],['#/account','COMPTE'],['#/','ACCUEIL']]) {
  await p.goto('http://127.0.0.1:4173/'+hash);
  await p.waitForTimeout(3000);
  const t = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').slice(0,400));
  console.log(`${label}: ${t}`);
}
console.log('\nAPPELS API EN ERREUR:', bad.length? bad.slice(0,6).join('\n  ') : 'aucun');
console.log('ERREURS JS:', errs.length? errs.slice(0,3):'aucune');
await b.close();
