#!/usr/bin/env node
// Arranque: si la librería de Supabase (CDN) no responde, la app debe verse y funcionar igual, y la pantalla de entrada no puede quedarse tapando.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PWLIB || 'playwright');
const ROOT=process.cwd();
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);if(fs.existsSync(f)&&fs.statSync(f).isFile()){r.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'text/html'});r.end(fs.readFileSync(f));}else{r.writeHead(404);r.end();}}).listen(0);
const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:390,height:844}});
await pg.route(/supabase/,()=>{/* nunca responde: CDN colgada */});
await pg.route(/^https?:\/\/(?!localhost)(?!.*supabase)/,r=>r.abort());
pg.goto(`http://localhost:${srv.address().port}/v2/`,{waitUntil:'commit'}).catch(()=>{});
await pg.waitForTimeout(4000);
const rendered = await pg.evaluate(() => document.querySelector('#app').innerText.length > 0);
console.log(rendered ? '  ✓ la app se ve aunque la CDN de Supabase no responda' : '  ✗ la app no se ve con la CDN colgada');
const blocked = await pg.evaluate(() => { const s = document.getElementById('splash'); return !!s && getComputedStyle(s).visibility !== 'hidden' && getComputedStyle(s).opacity !== '0'; });
console.log(blocked ? '  ✗ la pantalla de entrada sigue tapando' : '  ✓ la pantalla de entrada se va sola');
await b.close(); srv.close(); process.exit(rendered && !blocked ? 0 : 1);
