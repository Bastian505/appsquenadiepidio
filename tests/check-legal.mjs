#!/usr/bin/env node
// La política de privacidad tiene que decir la verdad. Comprueba que:
//  · cada servicio externo que usa el código (hosts https) esté declarado en la política;
//  · los plazos de la política (24 h, 30 días, 12 meses) coincidan con la base de datos;
//  · estén las secciones obligatorias y los enlaces entre páginas.
// Con LEGAL_FINAL=1 además exige que no queden marcadores {{...}} sin completar (se corre antes de publicar de verdad).
import fs from 'node:fs'; import path from 'node:path';
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('✗ ' + m); } };
const read = f => fs.readFileSync(f, 'utf8');
const priv = read('v2/privacidad.html'), terms = read('v2/terminos.html');
const text = priv.replace(/<[^>]+>/g, ' ');

// 1) Servicios externos del código ↔ política
const files = ['api', 'core', 'v2'].flatMap(d => fs.readdirSync(d).filter(f => /\.(js|html)$/.test(f) && !/^(sw|diag)/.test(f)).map(f => path.join(d, f)))
  .filter(f => !/privacidad|terminos/.test(f));
const hosts = new Set();
for (const f of files) for (const m of read(f).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(m[1].toLowerCase());
const IGNORAR = new Set(['www.w3.org', 'yporqueno.vercel.app', 'github.com', 'wa.me', 'api.whatsapp.com', 'code.claude.com', 'claude.ai', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const DECLARADOS = { 'api.anthropic.com': 'Anthropic', 'cdn.jsdelivr.net': 'jsDelivr', 'open.er-api.com': 'open.er-api.com', 'cdnjs.cloudflare.com': 'Cloudflare', 'kozakmufitkepgpxctxu.supabase.co': 'Supabase' };
for (const h of hosts) {
  if (IGNORAR.has(h)) continue;
  ok(DECLARADOS[h] && text.includes(DECLARADOS[h]), `servicio externo "${h}" declarado en la política de privacidad`);
}
ok(/Vercel/.test(text), 'la política declara el alojamiento (Vercel)');

// 2) Plazos ↔ base de datos
const purge = read('supabase/migrations/20261008_purge_old_data.sql'), shared = read('supabase/migrations/20261002_shared_bills.sql');
ok(/p_bill_days integer default 30/.test(purge) && /30 días/.test(text), 'cuentas compartidas: 30 días en la base y en la política');
ok(/p_scan_months integer default 12/.test(purge) && /12 meses/.test(text), 'registro de uso: 12 meses en la base y en la política');
ok(/default now\(\) \+ interval '24 hours'/.test(shared) && /24 horas/.test(text), 'acceso por enlace: 24 horas en la base y en la política');
ok(/cron\.schedule\('dc_purge_old'/.test(purge), 'el borrado automático queda programado (pg_cron)');

// 3) Estructura
for (const [t, re] of [['responsable', /Quién es el responsable/], ['datos', /Qué datos usamos/], ['terceros', /Con quién los compartimos/], ['plazos', /Cuánto tiempo/], ['derechos', /Tus derechos/], ['cookies', /Cookies y almacenamiento/], ['transferencias', /Transferencias internacionales/]])
  ok(re.test(text), `sección obligatoria: ${t}`);
ok(/privacidad\.html/.test(terms) && /terminos\.html/.test(priv), 'las dos páginas se enlazan entre sí');
ok(/privacidad\.html/.test(read('v2/app.js')) && /terminos\.html/.test(read('v2/app.js')), 'la app enlaza a privacidad y términos');
ok(/lang="es"/.test(priv) && /viewport/.test(priv), 'páginas legibles en el celular (idioma y viewport)');

// 4) Marcadores sin completar (solo antes de publicar)
if (process.env.LEGAL_FINAL === '1') {
  const left = [...new Set((priv + terms).match(/\{\{[A-Z_]+\}\}/g) || [])];
  ok(left.length === 0, 'sin marcadores pendientes' + (left.length ? ': ' + left.join(', ') : ''));
}
console.log(fails ? `\n${fails} fallo(s) de ${n}` : `✓ ${n} comprobaciones legales OK`);
process.exit(fails ? 1 : 0);
