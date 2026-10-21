import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{ width:1440, height:1000 } });
await p.goto('http://127.0.0.1:4173/#/login',{waitUntil:'load'});
await p.waitForTimeout(3000);
const info = await p.evaluate(()=>{
  const f = document.getElementById('authForm') || document.querySelector('form');
  if (!f) return {form:false};
  return {
    form:true,
    id: f.id,
    inputs: [...f.querySelectorAll('input')].map(i=>({id:i.id,name:i.name,type:i.type,hidden:i.hidden})),
    submitBtn: (f.querySelector('button[type=submit]')||{}).id || null,
  };
});
console.log(JSON.stringify(info,null,1));
await b.close();
