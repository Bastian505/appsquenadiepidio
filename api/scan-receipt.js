import '../core/currencies.js';    // define globalThis.DC_CURRENCIES (fuente única de monedas)
import '../core/country-rules.js'; // define globalThis.DC_COUNTRY_RULES (fuente única de reglas por país)
import { AsyncLocalStorage } from 'node:async_hooks';
import { quotaEnabled, bearerToken, consumeScan, finishScan, estimateCostCents } from './_lib/quota.js';
const DC_CURRENCIES = globalThis.DC_CURRENCIES;
// api/scan-receipt.js — DiviCuenta v5
// Arquitectura diseñada por Claude Opus 4.7 — spec: divicuenta_ocr_v5_spec.md
// 1 sola llamada a Sonnet (siempre) — prompt universal R1-R15 + perfil de país inyectado
// Confidence + evidence por ítem — auto-fix transparente — schema de eval en Supabase

// ── MODELO ────────────────────────────────────────────────────────────────────
const MODEL_SONNET  = 'claude-sonnet-4-6';
const PROMPT_VERSION = process.env.PROMPT_VERSION || 'v5.0.0';

// ── SEGURIDAD DEL ENDPOINT ────────────────────────────────────────────────────
// Este endpoint hace una llamada a la API de Anthropic pagada por el dueño de la
// app — sin ningún control, cualquiera que lo encuentre puede usarlo como proxy
// gratis y vaciar la cuenta. Estas tres capas lo mitigan (ninguna es perfecta
// por sí sola porque es una app pública sin login, pero juntas suben el costo
// de abuso considerablemente):
//   1. Origin allow-list para CORS: bloquea que OTRO sitio web ejecute este
//      fetch silenciosamente en el navegador de una víctima.
//   2. Un secreto compartido (APP_SHARED_SECRET) que el cliente debe mandar en
//      el header X-App-Secret. Como es una SPA sin backend de auth, este
//      secreto vive en el bundle público de todas formas — no detiene a quien
//      lea el código fuente, pero sí a scanners automáticos y bots genéricos
//      que no inspeccionan el JS de cada sitio que encuentran.
//   3. Rate limiting best-effort en memoria por IP. Las funciones serverless
//      de Vercel no comparten memoria entre instancias/regiones, así que esto
//      NO es un límite global confiable — solo frena ráfagas dentro de una
//      misma instancia "tibia". Para un límite real usar Vercel KV o Upstash
//      Redis (recomendado como siguiente paso).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://yporqueno.vercel.app')
  .split(',').map(function(s){ return s.trim(); }).filter(Boolean);

const APP_SHARED_SECRET = process.env.APP_SHARED_SECRET || null;

const SCAN_UNAVAILABLE_MSG = 'La lectura automática no está disponible en este momento. Puedes ingresar los ítems a mano.';
const RATE_LIMIT_MAX = 8;           // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // por minuto, por IP
const _rateLimitHits = new Map(); // ip -> [timestamps] — vive solo mientras la instancia esté tibia

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (_rateLimitHits.get(ip) || []).filter(function(t){ return now - t < RATE_LIMIT_WINDOW_MS; });
  hits.push(now);
  _rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// ── BASE DE CONOCIMIENTO por país: vive en core/country-rules.js ─────────────
const COUNTRY_RULES = globalThis.DC_COUNTRY_RULES;

// ── Selección de modelo — siempre Sonnet hasta tener corpus de eval validado ──
// (Opus 4.7 spec: "Con 0 usuarios, el riesgo de marcar mal complexity:simple
//  es mayor que el ahorro. Cuando tengas datos, mover países simples a Haiku.")
// OCR_MODEL (variable de entorno) cambia el modelo sin tocar código; los evals lo usan para medir otros modelos.
function selectModel() {
  const m = (process.env.OCR_MODEL || '').trim();
  return /^claude-[a-z0-9.-]+$/.test(m) ? m : MODEL_SONNET;
}

// ── CAPA 2: Detección de país ─────────────────────────────────────────────────
function detectCountry(text) {
  const t = text.toLowerCase();
  const scores = {};
  for (const [code, r] of Object.entries(COUNTRY_RULES)) {
    let s = 0;
    for (const sig of (r.signals || [])) { if (t.includes(sig.toLowerCase())) s += 3; }
    if (t.includes(r.currency.toLowerCase())) s += 2;
    if (!['$','¥'].includes(r.symbol) && r.symbol.length <= 3 && t.includes(r.symbol.toLowerCase())) s += 2;
    for (const kw of (r.tax_kw || [])) { if (t.includes(kw.toLowerCase())) s += 1; }
    for (const kw of (r.deposit_kw || [])) { if (t.includes(kw.toLowerCase())) s += 2; }
    if (s > 0) scores[code] = s;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { country: null, confidence: 0, candidates: [] };
  const [bestCode, bestScore] = sorted[0];
  let confidence = Math.min(bestScore / 12, 0.97);
  if (sorted.length > 1 && sorted[1][1] >= bestScore * 0.75) confidence *= 0.65;
  return {
    country: bestCode,
    confidence: parseFloat(confidence.toFixed(2)),
    candidates: sorted.slice(0, 4).map(([c, sc]) => ({
      country: c, name: COUNTRY_RULES[c]?.name, score: sc
    }))
  };
}

// ── CAPA 3: Prompt v5 universal (Opus 4.7 spec) ──────────────────────────────
// Una sola función. Perfil del país inyectado como datos, no como prosa.
// COUNTRY_RULES.format se usa como "hint opcional", no como espina dorsal.
// parts=true (OCR_PROMPT_LAYOUT=split): devuelve { stable, context }. Las reglas, idénticas para todos los países, van primero y se
// cachean una sola vez; lo que cambia por país va al final. Con el país al inicio hay una entrada de caché por país (48) y casi nunca se reutiliza.
function buildV5Prompt(countryCode, parts = false) {
  const r = countryCode ? (COUNTRY_RULES[countryCode] || null) : null;

  const countryBlock = r ? `
País sugerido: ${countryCode} (${r.name})
Moneda esperada: ${r.currency} (símbolo: ${r.symbol})
Decimales en moneda: ${r.has_decimals ? 'sí' : 'no — redondear a entero'}
Hints específicos del país: ${r.format || 'ninguno'}` :
`País sugerido: UNKNOWN
Moneda esperada: detectar de la imagen
Decimales en moneda: detectar de la imagen
Hints específicos del país: ninguno`;

  const __prompt = `Eres un experto mundial en lectura de boletas de pago de cualquier país. Tu objetivo
es extraer los ítems facturados con precisión, marcando tu nivel de confianza por
cada ítem. NUNCA inventas datos: cuando algo es ilegible o ambiguo, lo marcas con
confianza baja o rehúsas la boleta completa según los criterios definidos abajo.

═══════════════════════════════════════════════════════════════════════════════
CONTEXTO INYECTADO POR EL SISTEMA
═══════════════════════════════════════════════════════════════════════════════
${parts ? '(El contexto del sistema para esta boleta está al final de estas instrucciones.)' : countryBlock}

Si este contexto llega vacío o con país UNKNOWN, debes detectar tú mismo todo.
Si lo que ves en la imagen contradice el contexto (ej: contexto dice CL pero la
boleta es claramente de Brasil), TU LECTURA DE LA IMAGEN MANDA — corrige el
campo pais y moneda en el output.

═══════════════════════════════════════════════════════════════════════════════
PROCESO MENTAL
═══════════════════════════════════════════════════════════════════════════════
1. Identifica la moneda (símbolo + código ISO + keywords fiscales).
2. Identifica el sistema POS si es reconocible (TouchBistro, Toast, Square, etc.).
3. Identifica el layout de las filas de ítems (típico, qty×unit=total,
   qty-antes-de-nombre, modificadores indentados, columnas RTL).
4. Extrae cada ítem con su precio_unitario, cantidad y confianza (y evidencia solo si confianza < 0.80).
5. Verifica que la suma de tus ítems sea coherente con el total declarado;
   si hay diferencia, refleja eso en confianza_global pero NO inventes ítems
   para cuadrar (el sistema externo se encarga de la reconciliación).

═══════════════════════════════════════════════════════════════════════════════
REGLAS UNIVERSALES (R1-R21)
═══════════════════════════════════════════════════════════════════════════════

R1. INCLUIR solo productos/servicios con precio real visible o derivable.
    Excluir cualquier ítem cuyo precio_unitario sea 0.

R2. IGNORAR siempre:
    · Impuestos: IVA, VAT, GST, MWST, BTW, ICMS, IPI, SGST, CGST, IPC, ΦΠΑ,
      ÁFA, KDV, TVA, Moms, MVA, DPH, 消費税, 부가세, מע"מ, ضريبة.
    · Subtotales (Sub Total, Subtotal, Subtotale, Sous-total).
    · Subtotales de categoría (Liquor Total, Food Total, NA Beverages Total).
    · Publicidad, fechas, hora, número de mesa, número de orden, número de cuenta.
    · Identificadores fiscales: RUT, CUIT, RFC, NIT, CNPJ, NIF, CIF, SIRET,
      VAT no., GSTIN, ABN, UEN, TRN, etc.
    · "Tip Guide" o "Suggested tip 15%/18%/20%" cuando son sugerencias visuales
      no cobradas.

R3. INCLUIR como ítem con precio POSITIVO:
    · Productos y servicios facturados.
    · Cargo por servicio obligatorio: UK service charge, coperto italiano,
      propina ya cobrada en el total final.
    · Depósitos retornables: Pfand (DE), Leergut (DE), CRV (US), Statiegeld (NL),
      Pant (SE/DK/NO), Consigne (FR), Depósito (LATAM).

R4. INCLUIR como ítem con precio NEGATIVO:
    · Devoluciones: Pfandrückgabe (DE), Devolución, Refund, Void, Retour,
      Rimborso, Devolução, Anulación.
    · Descuentos explícitos aplicados a un ítem específico.

R5. MODIFICADORES (regla universal, NO por POS):
    Si una línea comienza con "+ <monto>", "- <monto>", o aparece visualmente
    indentada bajo un ítem con precio: es un MODIFICADOR del ítem anterior.
    SUMAR (o restar) su monto al precio_unitario del ítem padre.
    NO crear ítem separado.
    Esta regla cubre TouchBistro, Lightspeed, Square, Toast, y cualquier POS
    futuro que use convención visual similar. Ejemplos:
    · "Classic Chicken BLT  $20.99"
      "+ $4.00: Add Mushrooms"
      "+ $2.50: Add Avocado"
      → {nombre: "Classic Chicken BLT", precio_unitario: 27.49, cantidad: 1}
    · "Combo Burger  $8.00"
      "- $1.00: Sin papas"
      → {nombre: "Combo Burger", precio_unitario: 7.00, cantidad: 1}

R6. MODIFICADORES SIN MONTO: Líneas como "Over Easy", "Sin sal", "Bien hecho",
    "Brown Bread", "Any Style", "Poached Medium" sin monto asociado: IGNORAR.

R7. INFERENCIA DE PRECIO UNITARIO (regla maestra universal):
    El campo precio_unitario en tu JSON es SIEMPRE por unidad individual.
    Patrones reconocibles:
    · "N <nombre> <total>" con N pequeño (1-20) y total alto
      → precio_unitario = total ÷ N, cantidad = N
      Ej: "3 Coffee $12.00" → unit=4.00, qty=3
      Ej: "3 MENU 210,00€"  → unit=70.00, qty=3
      Ej: "2 Singha Beer 11,00" → unit=5.50, qty=2
    · "<nombre> <cantidad> <total_línea>" (típico Turquía)
      → precio_unitario = total ÷ cantidad
      Ej: "Borulcesi 2 18,00" → unit=9.00, qty=2
    · "<unit> × <qty> = <total>" o "<unit> x <qty> <total>" (Alemania, Suiza)
      → precio_unitario = unit, cantidad = qty (NO dividir, ya está)
      Ej: "0,29 × 6 = 1,74" → unit=0.29, qty=6
    · "<cantidad>x <unit> <descripción> <total>" (España F2)
      Ej: "2x 2.15 A/SIN 4.30" → unit=2.15, qty=2
    · "<unidades_pegado><nombre> <unit> <total>" (España F4)
      Ej: "6,00PAN MENTIDERO 1,00 6,00€" → unit=1.00, qty=6, nombre="PAN MENTIDERO"
    · "<nombre> <precio>" sin cantidad explícita → unit=precio, cantidad=1
    · "N..<nombre> <total>" o "N · <nombre> <total>" (puntos/bullets visuales)
      → precio_unitario = total ÷ N, cantidad = N

R8. NOMBRES EN DOS LÍNEAS: Si un nombre de producto está partido en dos líneas
    (sin precio entre ellas), es UN solo ítem con nombre concatenado.

R9. PROPINAS — incluir SOLO en estos casos:
    · Aparece como línea EN LA BOLETA con un MONTO específico y forma parte
      del total final cobrado → incluir como ítem "Propina".
    · Si solo aparece como sugerencia ("Suggested tip 15%: $X") y el total
      final NO la incluye → IGNORAR como ítem, pero si la boleta propone UNA
      sola propina (ej. "Propina sugerida $9.999" o "Sugerida 10%"), devuélvela
      en "propina_sugerida_pct" (el porcentaje impreso) o, si solo hay monto,
      en "propina_sugerida_monto". Si ofrece varias opciones (guía 15/18/20 %)
      o no hay sugerencia, deja ambos en null.
    · Si el restaurante tiene servicio obligatorio (UK service charge, coperto
      italiano) → siempre incluir como "Servicio".

R10. MONEDA AMBIGUA — $ y ¥:
     · $ puede ser CLP, ARS, MXN, USD, CAD, COP, UYU.
     · Para desambiguar busca marcadores fiscales en la imagen:
       RUT/SII → CL | CUIT/AFIP → AR | RFC/SAT/CFDI → MX
       NIT/DIAN/CUFE → CO | Sales Tax → US | GST/HST/PST+provincia → CA
       DGI Uruguay → UY
     · Si hay marcador claro → usa esa moneda.
     · Si NO hay marcador fiscal Y el contexto no especifica país
       → moneda: "AMBIGUOUS_DOLLAR" con monedas_candidatas.
     · ¥: 円/消費税 → JPY; 元/发票/人民币 → CNY. Sin marcador → AMBIGUOUS_YEN.

R11. FORMATO DE NÚMERO EN EL OUTPUT:
     · Siempre punto decimal en el JSON: "1,80€" → 1.80
     · Punto como miles (Colombia, Alemania): "$6.700" colombiano → 6700
     · Monedas sin decimales (CLP, JPY, KRW, COP, PYG, HUF, VND, IDR, TWD):
       redondear al entero.
     · Con decimales: máximo dos.

R12. NOMBRES EN IDIOMA ORIGINAL: No traducir. "Gambas al Ajillo" queda en
     español; "ラーメン" en japonés; "מנה עיקרית" en hebreo.

R13. CONFIANZA POR ÍTEM (0.0 a 1.0):
     · 0.95-1.00: completamente legible, sin ambigüedad.
     · 0.80-0.94: legible con ambigüedad leve.
     · 0.60-0.79: inferido por regla (precio derivado, modificador sumado).
     · 0.30-0.59: muy dudoso, parte del texto parcialmente ilegible.
     · <0.30: prácticamente adivinado — incluir en items_dudosos.

R14. EVIDENCIA: SOLO para ítems con confianza < 0.80, copia LITERAL en el campo
     evidencia la línea de la boleta donde lo leíste. Para el resto OMITE el
     campo evidencia (ahorra tiempo de respuesta).

R15. PRECUENTAS Y BOLETAS NO FISCALES SON VÁLIDAS: "NON FISCALE", "PRECONTO",
     "CUENTA", "PRECUENTA", "PONUDA" (oferta, Croacia), "Bill", "Check" son boletas válidas.

R16. PROPINA/TOTAL ESCRITOS A MANO: una "Gratuity", "Tip" o "Propina" con un
     "Total" escritos a mano (lapicera) bajo el total impreso es una propina
     VOLUNTARIA del cliente, no parte de la cuenta. NO la incluyas como ítem y
     usa el total IMPRESO como total_referencia. Menciónala en "razonamiento".

R19. TOTAL FINAL: total_referencia = el MONTO FINAL A PAGAR = subtotal + impuestos o
     servicio SUMADOS impresos. Verifica la aritmética con las líneas impresas
     (ej. "7280.00 + Sales Tax 946.40 = Net Amount 8,226.40" → 8226.40). Las
     etiquetas varían ("Net Amount" a veces es el subtotal y a veces el final):
     decide por la aritmética, no por la etiqueta. NO uses subtotales, líneas de
     pago (Cash / Payment / Change) ni conteos ("No. of Items 12  Total Qty 21  7280.00":
     ese 7280 es el subtotal). Si hay DOS totales según la forma de pago ("Cash Total" y
     "Credit Total", este último con un cargo de tarjeta "CC Fee"), usa el de TARJETA
     (Credit Total) y lista el cargo como ítem: "Sbtl w/Chgs" (subtotal con cargos) es
     ese mismo monto. NUNCA tomes como total un "Subtotal" si debajo hay impuestos o
     cargos impresos (Tax, Liquor Tax, CC Fee, HST, GST, PST...).

R20. CÓDIGOS DE ÍTEM: no incluyas el código numérico del producto al inicio del
     nombre ("2201 KABULI PULLAO" → nombre "KABULI PULLAO").

R21. SUPLEMENTOS "(+X.XX)": un monto entre paréntesis bajo un ítem, con "+" (ej. "Venezia 11.90 11.90"
     y debajo "Rucola / Parmesan (+1.20)"), es el desglose de extras que YA ESTÁN INCLUIDOS en el total
     de esa línea. El precio del ítem es el de la columna Total (11.90); NO le sumes el suplemento ni
     lo listes como ítem. Los modificadores sin monto tampoco son ítems (R6).
     Igual con extras en otras monedas ("+ ไข่ดาว (B10.00)" bajo "ข้าวหมูทอด 1 x B79.00", con 89.00 a la
     derecha): el importe de la derecha ya incluye el extra, úsalo tal cual (89 = 79 + 10).

R17. ANULACIONES (STORNO / VOID): una línea con cantidad NEGATIVA (ej.
     "-1 Crispy Jalebi @390 -390.00") anula parte de un ítem anterior. Transcríbela
     TAL CUAL como ítem aparte con cantidad NEGATIVA (cantidad:-1,
     precio_unitario:390, positivo). NO la omitas ni hagas tú la resta: el sistema
     la descuenta del ítem original. El total de la boleta ya viene neto.

R18. VENTA POR PESO: "0,85 x 400,00 ... 340,00" (kg × precio por kg = total de línea)
     → precio_unitario = el TOTAL DE LÍNEA (340,00) y cantidad = 1. Nunca pongas
     una cantidad decimal ni uses el precio por kg como precio del ítem.

═══════════════════════════════════════════════════════════════════════════════
CRITERIOS DE REHUSAR
═══════════════════════════════════════════════════════════════════════════════

REFUSAR 1 — Imagen ilegible: sección de ítems mayoritariamente ilegible.
  → {"ok":false,"reason":"illegible_image","message":"La imagen está demasiado borrosa o dañada para leer los ítems. Intenta una foto con mejor luz y enfoque."}

REFUSAR 2 — No es boleta: el documento es menú, tarjeta, ticket aparcamiento, etc.
  → {"ok":false,"reason":"not_a_receipt","message":"Esto no parece una boleta de compra. Fotografía el comprobante final."}

REFUSAR 3 — Moneda imposible de determinar: sin símbolo, sin código, sin keyword fiscal.
  → {"ok":false,"reason":"unknown_currency","message":"No puedo identificar la moneda. ¿Puedes indicar el país?","candidates":[]}

NUNCA usar refusal por: país desconocido → devolver pais:UNKNOWN best-effort.

═══════════════════════════════════════════════════════════════════════════════
OUTPUT JSON
═══════════════════════════════════════════════════════════════════════════════

Responde SOLO con JSON válido. Sin markdown, sin backticks, sin texto extra.

Caso éxito:
{"ok":true,"restaurante":"nombre o null","pos_detected":"touchbistro|toast|square|clover|lightspeed|tpv_es|nfe_br|sii_cl|generic|unknown","pais":"ISO_2_o_UNKNOWN","moneda":"ISO_3_o_AMBIGUOUS_DOLLAR_o_AMBIGUOUS_YEN","monedas_candidatas":[],"items":[{"nombre":"Coffee","precio_unitario":4.00,"cantidad":3,"confianza":0.95},{"nombre":"Cake","precio_unitario":6.50,"cantidad":1,"confianza":0.65,"evidencia":"Cke 6.5"}],"items_dudosos":[],"total_referencia":18.50,"propina_sugerida_pct":null,"propina_sugerida_monto":null,"razonamiento":"máx. 12 palabras","confianza_global":0.92}
Escribe el JSON compacto en una sola línea, sin espacios ni saltos de línea de más, y sin texto fuera del JSON.

Caso refusal:
{"ok":false,"reason":"illegible_image|not_a_receipt|unknown_currency","message":"Mensaje al usuario","candidates":[]}`;
  return parts ? { stable: __prompt, context: 'CONTEXTO INYECTADO POR EL SISTEMA\n' + countryBlock } : __prompt;
}

// Alias para compatibilidad con código existente que llama buildAutoDetectPrompt
function buildAutoDetectPrompt() { return buildV5Prompt(null); }
function buildUnifiedPrompt(cc)   { return buildV5Prompt(cc); }
function buildGenericPrompt()     { return buildV5Prompt(null); }

// ── CAPA 4: Llamada a Claude ──────────────────────────────────────────────────
// Timeout 8s (Vercel hard limit = 10s; dejamos margen para parse + log Supabase)
// Retry: 1 solo en errores transitorios 5xx. NUNCA en timeout.
// Bloques del system prompt: una cadena (formato original) o { stable, context } (OCR_PROMPT_LAYOUT=split).
// OCR_CACHE=0 apaga la caché: con poco tráfico escribir la caché (1,25x) cuesta más que no usarla; conviene desde ~2 lecturas por 5 minutos con el mismo prefijo.
function systemBlocks(system) {
  const cc = process.env.OCR_CACHE === '0' ? undefined : { type:'ephemeral' };
  const mk = (text, cache) => (cache && cc) ? { type:'text', text, cache_control: cc } : { type:'text', text };
  return typeof system === 'string' ? [mk(system, true)] : [mk(system.stable, true), mk(system.context, false)];
}

// Cuerpo de la petición. Los modelos 5.x no aceptan `temperature` y piden decidir cuánto "pensar":
// para leer una boleta basta lo mínimo (Sonnet 5.5: `between_tools`; el esfuerzo se ajusta con OCR_EFFORT).
function requestBody(model, system, imageBase64, mediaType, userText) {
  const body = {
    model, max_tokens: 3000, system: systemBlocks(system),
    messages: [{ role:'user', content:[
      { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
      { type:'text', text:userText }
    ]}]
  };
  if (/^claude-(sonnet|opus|fable|mythos)-5/.test(model)) {
    if (model === 'claude-sonnet-5-5') {
      if (process.env.OCR_THINKING !== 'adaptive') body.thinking = { type:'between_tools' };
      body.output_config = { effort: process.env.OCR_EFFORT || 'high' };
    }
  } else body.temperature = 0;
  return JSON.stringify(body);
}

async function callClaude(apiKey, imageBase64, mediaType, system, userText, model) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 50000);

  const body = requestBody(model, system, imageBase64, mediaType, userText);

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01'
      },
      body
    });
  } catch(e) {
    clearTimeout(timeoutId);
    if(e.name === 'AbortError') {
      throw new Error('TIMEOUT: La llamada a Claude tardó más de 50 segundos');
    }
    // Retry una vez en errores de red transitorios
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body
    });
  }

  clearTimeout(timeoutId);

  if (!res.ok) {
    // Retry 1 vez en 5xx transitorio
    if(res.status >= 500) {
      await new Promise(r => setTimeout(r, 500));
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01' },
        body
      });
      if(!res2.ok) {
        const e2 = await res2.json().catch(()=>({}));
        throw new Error(e2?.error?.message || `HTTP ${res2.status}`);
      }
      const d2 = await res2.json();
      const block2 = d2.content?.find(b => b.type === 'text');
      if(!block2?.text) throw new Error('Sin respuesta de Claude en retry');
      return block2.text;
    }
    const e = await res.json().catch(()=>({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }

  const d = await res.json();
  if (d.usage) {
    const st = requestStore.getStore(); if (st) st.costCents += estimateCostCents(model, d.usage);
    console.log('claude usage', JSON.stringify({
      model,
      input: d.usage.input_tokens,
      output: d.usage.output_tokens,
      cache_write: d.usage.cache_creation_input_tokens || 0,
      cache_read: d.usage.cache_read_input_tokens || 0
    }));
  }
  const block = d.content?.find(b => b.type === 'text');
  if (!block?.text) throw new Error('Sin respuesta de Claude');
  return block.text;
}

// ── Parser JSON robusto ───────────────────────────────────────────────────────
function parseJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch(_) {}
  try { return JSON.parse(raw.replace(/```json|```/gi,'').trim()); } catch(_) {}
  try {
    const s=raw.indexOf('{'), e=raw.lastIndexOf('}');
    if(s>-1&&e>s) return JSON.parse(raw.substring(s,e+1));
  } catch(_) {}
  return null;
}

// ── CAPA 5: Reconciliación — reglas seguras (Opus 4.7 spec Output 3) ────────────
// Principio: NUNCA crear ítems silenciosos. Auto-fix SIEMPRE visible + tap requerido.
// Condicional por país (matriz servicio/propina/impuesto).

const SERVICE_CHARGE_COUNTRIES = new Set(['GB','SG','TH','CO','IT','AE','SA']);
const TIP_COUNTRIES             = new Set(['US','CA','MX']);
const TAX_COUNTRIES             = new Set(['US','CA']);
const DEPOSIT_COUNTRIES = new Set(['DE','AT','NL']);
// Países donde el impuesto se suma ENCIMA del subtotal con tasa alta (PK 5-15%, MY 6-8%, NG 7,5%, LK ~22%)
// Canadá: impuestos por provincia (sobre el precio sin impuesto): GST 5 % (AB/TERR.), SK 11 %, BC y MB 12 %,
// HST Ontario 13 %, Quebec TPS 5 % + TVQ 9,975 % = 14,975 %, HST Atlántico 15 %.
const CA_TAX_RATES = [0.05, 0.11, 0.12, 0.13, 0.14975, 0.15];
const TAX_ON_TOP_HIGH           = new Set(['PK','MY','NG','LK','SG']);

function reconcile(items, totalReported, countryCode) {
  const sum = items.reduce((a,it) => a+(it.precio_unitario*(it.cantidad||1)), 0);
  if (!totalReported || totalReported <= 0) {
    return { ok:true, sum, total:sum, diff:0, ratio:0, note:null, auto_fixed:false };
  }

  const diff  = totalReported - sum;
  const ratio = Math.abs(diff) / totalReported;

  // 0-3%: diferencia silenciosa de redondeo
  if (ratio < 0.03) {
    return { ok:true, sum, total:totalReported, diff, ratio, note:null, auto_fixed:false };
  }

  // Canadá: si lo que falta es EXACTAMENTE una tasa de impuesto provincial sobre la suma, es el impuesto (no un ítem perdido).
  if (countryCode === 'CA' && diff > 0 && sum > 0 && ratio <= 0.22) {
    const rate = diff / sum, known = CA_TAX_RATES.find(r => Math.abs(rate - r) <= 0.006);
    const yaHayImpuesto = items.some(it => /impuesto|tax|gst|hst|pst|qst|tps|tvq/i.test(it.nombre||''));
    if (known && !yaHayImpuesto) {
      const monto = Math.round(diff * 100) / 100;
      const fix = { nombre:'Impuesto', precio_unitario:monto, cantidad:1, auto_created:true, auto_fix_type:'tax',
        auto_fix_evidence:`Diferencia de ${(rate*100).toFixed(1)}% sobre los ítems = impuesto provincial de Canadá`, confianza:0.50 };
      return { ok:true, sum:Math.round((sum+monto)*100)/100, total:totalReported, diff:0, ratio:0, note:null, auto_fixed:true,
        auto_fix_type:'tax', auto_fix_item:fix, user_action_required:true,
        user_message:`Detecté impuestos del ${(known*100).toFixed(known === 0.14975 ? 3 : 0).replace('.', ',')}% (~${monto}). Revísalo antes de dividir.` };
    }
  }

  // Depósito de envases (DE/AT/NL): si la suma SUPERA el total, hay depósitos (Pfand) positivos y ninguna devolución leída, lo más
  // probable es que la IA omitió la devolución (Pfandrückgabe, línea negativa). Se agrega como ítem negativo por la diferencia exacta.
  // (Caso real: Lidl Berlín; la IA ignora las dos devoluciones aun con la regla del país en el prompt.)
  if (DEPOSIT_COUNTRIES.has(countryCode) && diff < 0 && sum > 0) {
    const esDeposito = it => /pfand|leergut|statiegeld|deposit/i.test(it.nombre||'');
    const depositos = items.filter(it => esDeposito(it) && it.precio_unitario > 0)
      .reduce((a,it) => a+it.precio_unitario*(it.cantidad||1), 0);
    const hayDevolucion = items.some(it => it.precio_unitario < 0 || (it.cantidad||1) < 0);
    const monto = Math.round(-diff * 100) / 100;
    if (!hayDevolucion && depositos > 0 && monto <= depositos + 0.005) {
      const fix = { nombre:'Pfandrückgabe', precio_unitario:-monto, cantidad:1, auto_created:true, auto_fix_type:'deposit_refund',
        auto_fix_evidence:'La suma supera el total y hay depósitos de envases sin devolución leída', confianza:0.50 };
      return { ok:true, sum:Math.round((sum-monto)*100)/100, total:totalReported, diff:0, ratio:0, note:null, auto_fixed:true,
        auto_fix_type:'deposit_refund', auto_fix_item:fix, user_action_required:true,
        user_message:`Detecté una devolución de envases (Pfandrückgabe) de ${monto}. Revísala antes de dividir.` };
    }
  }

  // Tailandia: el VAT 7 % se imprime aparte, sobre la consumición (sin el cargo de servicio). Si falta y la diferencia calza con el 7 %
  // de la consumición, es ese VAT. (Caso real: Three Monkeys; la IA leyó el servicio pero omitió la línea "VAT 7%".)
  if (countryCode === 'TH' && diff > 0 && sum > 0 && ratio <= 0.1) {
    const yaHayVat = items.some(it => /vat|ภาษี|tax|impuesto/i.test(it.nombre||''));
    const consumo = items.filter(it => !/service|ค่าบริการ|servicio|propina|tip/i.test(it.nombre||''))
      .reduce((a,it) => a+(it.precio_unitario*(it.cantidad||1)), 0);
    // El VAT 7 % se calcula sobre la consumición (Three Monkeys) o sobre consumición + servicio (Ippudo, The Local): se prueban las dos bases.
    const rate = consumo > 0 ? diff / consumo : 0, rateTodo = diff / sum;
    const calza = r => r >= 0.066 && r <= 0.074;
    if (!yaHayVat && (calza(rate) || calza(rateTodo))) {
      const monto = Math.round(diff * 100) / 100;
      const fix = { nombre:'VAT 7%', precio_unitario:monto, cantidad:1, auto_created:true, auto_fix_type:'tax',
        auto_fix_evidence:`Diferencia de ${((calza(rate) ? rate : rateTodo)*100).toFixed(1)}% = VAT 7% de Tailandia`, confianza:0.50 };
      return { ok:true, sum:Math.round((sum+monto)*100)/100, total:totalReported, diff:0, ratio:0, note:null, auto_fixed:true,
        auto_fix_type:'tax', auto_fix_item:fix, user_action_required:true,
        user_message:`Detecté un VAT del 7% (~${monto}). Revísalo antes de dividir.` };
    }
  }

  // EE. UU. y Canadá: el impuesto de venta se imprime aparte (≈ 3–11 % de la CONSUMICIÓN). Si falta y la diferencia calza con esa tasa sobre la
  // consumición (sin contar la propina ni el cargo de servicio ya listados), es el impuesto, aunque ya haya un ítem de servicio.
  // (Caso real: 3 boletas de Miami y Nueva York a las que la app les omitió el "Tax" y no lo corrigió por tener ya la propina listada.)
  if ((countryCode === 'US' || countryCode === 'CA') && diff > 0 && sum > 0 && ratio <= 0.22) {
    const yaHayImpuesto = items.some(it => /impuesto|tax|sst|gst|hst|vat/i.test(it.nombre||''));
    const consumo = items.filter(it => !/propina|tip|gratuity|servicio|service/i.test(it.nombre||''))
      .reduce((a,it) => a+(it.precio_unitario*(it.cantidad||1)), 0);
    const rate = consumo > 0 ? diff / consumo : 0;
    if (!yaHayImpuesto && rate >= 0.03 && rate <= (countryCode === 'CA' ? 0.09 : 0.115)) {
      const monto = Math.round(diff * 100) / 100;
      const fix = { nombre:'Impuesto', precio_unitario:monto, cantidad:1, auto_created:true, auto_fix_type:'tax',
        auto_fix_evidence:`Diferencia de ${(rate*100).toFixed(1)}% sobre la consumición = impuesto de venta de EE. UU.`, confianza:0.50 };
      return { ok:true, sum:Math.round((sum+monto)*100)/100, total:totalReported, diff:0, ratio:0, note:null, auto_fixed:true,
        auto_fix_type:'tax', auto_fix_item:fix, user_action_required:true,
        user_message:`Detecté un impuesto de venta de ~${(rate*100).toFixed(1).replace('.', ',')}% (~${monto}). Revísalo antes de dividir.` };
    }
  }

  // 3-6%: warning leve, no crear ítem (salvo PK: un 5% sumado encima es ~4,8% del total)
  if (ratio < 0.06 && !(TAX_ON_TOP_HIGH.has(countryCode) && diff > 0 && ratio >= 0.04)) {
    return { ok:true, sum, total:totalReported, diff, ratio,
      note:'Pequeña diferencia (redondeo o ítem menor no capturado).', auto_fixed:false };
  }

  // diff < 0 (suma > total): NUNCA auto-fix
  if (diff < 0) {
    return { ok:false, sum, total:totalReported, diff, ratio,
      note:'La suma supera el total — posible descuento no capturado. Revisa los precios.',
      auto_fixed:false };
  }

  // diff > 22%: demasiado grande para auto-fix
  if (ratio > 0.22) {
    return { ok:false, sum, total:totalReported, diff, ratio,
      note:`Diferencia grande (${Math.round(ratio*100)}%) — puede faltar más de un ítem. Revisa la foto.`,
      auto_fixed:false };
  }

  const extraAmount = Math.round(diff * 100) / 100;

  // Guardia: ya existe un ítem de Servicio/Propina/Impuesto → no duplicar
  const hasServicio = items.some(it => /servicio|service charge|propina|tip|impuesto/i.test(it.nombre||''));
  // En países con impuesto sumado encima (PK, MY) un cargo de servicio ya listado no bloquea el auto-fix del impuesto
  const hasTax = items.some(it => /impuesto|tax|sst|gst|vat/i.test(it.nombre||''));

  // confianza_global baja → no auto-fix (lectura dudosa)
  const globalConf = items.length > 0
    ? items.reduce((s,it) => s+(it.confianza||0.8), 0) / items.length : 0;
  if (globalConf < 0.70) {
    return { ok:false, sum, total:totalReported, diff, ratio,
      note:'Lectura con baja confianza — diferencia no resuelta. Revisa los ítems.', auto_fixed:false };
  }

  // 6-8%: impuesto (US/CA); hasta 15% en países con impuesto alto sumado aparte (PK)
  if (((ratio >= 0.06 && ratio <= 0.08 && TAX_COUNTRIES.has(countryCode)) || (ratio >= 0.04 && ratio <= 0.22 && TAX_ON_TOP_HIGH.has(countryCode))) && !(TAX_ON_TOP_HIGH.has(countryCode) ? hasTax : hasServicio)) {
    const fixed = [...items, { nombre:'Impuesto', precio_unitario:extraAmount, cantidad:1,
      auto_created:true, auto_fix_type:'tax', auto_fix_evidence:`Diferencia de ${Math.round(ratio*100)}% — tax no incluido en precios`, confianza:0.50 }];
    const newSum = fixed.reduce((s,it) => s+it.precio_unitario*it.cantidad, 0);
    if (Math.abs(newSum-totalReported)/totalReported < 0.02)
      return { ok:true, sum:Math.round(newSum*100)/100, total:totalReported,
        diff:0, ratio:0, note:null, auto_fixed:true, auto_fix_type:'tax',
        auto_fix_item:fixed[fixed.length-1], user_action_required:true,
        user_message:`Detecté un impuesto del ${Math.round(ratio*100)}% (~${extraAmount}). Revísalo antes de dividir.` };
  }

  // 8-14%: servicio (países habilitados)
  if (ratio >= 0.08 && ratio <= 0.14 && SERVICE_CHARGE_COUNTRIES.has(countryCode) && !hasServicio) {
    const fixed = [...items, { nombre:'Servicio', precio_unitario:extraAmount, cantidad:1,
      auto_created:true, auto_fix_type:'service_charge',
      auto_fix_evidence:`Diferencia de ${Math.round(ratio*100)}% — posible cargo de servicio`, confianza:0.50 }];
    const newSum = fixed.reduce((s,it) => s+it.precio_unitario*it.cantidad, 0);
    if (Math.abs(newSum-totalReported)/totalReported < 0.02)
      return { ok:true, sum:Math.round(newSum*100)/100, total:totalReported,
        diff:0, ratio:0, note:null, auto_fixed:true, auto_fix_type:'service_charge',
        auto_fix_item:fixed[fixed.length-1], user_action_required:true,
        user_message:`Detecté un cargo de servicio del ${Math.round(ratio*100)}% (~${extraAmount}). Revísalo antes de dividir.` };
  }

  // 14-22%: propina (países habilitados)
  if (ratio >= 0.14 && ratio <= 0.22 && TIP_COUNTRIES.has(countryCode) && !hasServicio) {
    const fixed = [...items, { nombre:'Propina', precio_unitario:extraAmount, cantidad:1,
      auto_created:true, auto_fix_type:'tip',
      auto_fix_evidence:`Diferencia de ${Math.round(ratio*100)}% — posible propina no capturada`, confianza:0.50 }];
    const newSum = fixed.reduce((s,it) => s+it.precio_unitario*it.cantidad, 0);
    if (Math.abs(newSum-totalReported)/totalReported < 0.02)
      return { ok:true, sum:Math.round(newSum*100)/100, total:totalReported,
        diff:0, ratio:0, note:null, auto_fixed:true, auto_fix_type:'tip',
        auto_fix_item:fixed[fixed.length-1], user_action_required:true,
        user_message:`Detecté una propina del ${Math.round(ratio*100)}% (~${extraAmount}). Revísala antes de dividir.` };
  }

  // Sin auto-fix posible → informar
  const note = ratio <= 0.14
    ? `El total incluye ~${Math.round(ratio*100)}% extra — posible cargo no identificado.`
    : `El total incluye ~${Math.round(ratio*100)}% extra — posible propina o impuesto no capturado.`;
  return { ok:false, sum, total:totalReported, diff, ratio, note, auto_fixed:false };
}

// ── CAPA 6: Normalización ─────────────────────────────────────────────────────
// Fix: recibe currency ISO directamente (no countryCode).
// Antes: countryCode='UNKNOWN' resolvía a {} y nunca aplicaba isNoDecimal → redondeo incorrecto.
function normalizeItems(items, currency) {
  const NO_DECIMAL = new Set(DC_CURRENCIES.noDecimalCodes);
  const isNoDecimal = NO_DECIMAL.has((currency||'').toUpperCase());
  const round = v => isNoDecimal ? Math.round(v) : Math.round(v * 100) / 100;

  const mapped = items.map((it,i) => {
    let raw = it.precio_unitario ?? it.precio ?? 0;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))     raw = parseFloat(s.replace(/\./g,'').replace(',','.'));
      else if (/^-?\d+,\d{1,2}$/.test(s))               raw = parseFloat(s.replace(',','.'));
      else if (/^-?\d{1,3}(,\d{3})+(\d+)?$/.test(s))   raw = parseFloat(s.replace(/,/g,''));
      else                                               raw = parseFloat(s.replace(',','.'));
    }
    if (isNaN(raw)) raw = 0;
    // Precio negativo = línea de anulación/devolución: se trata como cantidad negativa
    const negPrice = raw < 0;
    if (negPrice) raw = -raw;
    let precioFinal = round(raw);
    let qty = parseFloat(it.cantidad);
    if (!isFinite(qty) || qty === 0) qty = 1;
    if (negPrice) qty = -Math.abs(qty);
    // Fraccionarias (venta por peso, "2.5 X 700.00", 0,85 kg): la UI divide por unidades
    // enteras, así que se pliegan a una línea con el total (precio × cantidad).
    if (!Number.isInteger(qty)) {
      precioFinal = round(precioFinal * qty);
      qty = 1;
    }
    return {
      nombre:          it.nombre || it.name || ("Item " + (i+1)),
      precio_unitario: precioFinal,
      cantidad:        qty,
      confianza:       it.confianza || null,
      evidencia:       it.evidencia || null
    };
  });

  // Anulaciones (storno/void): una línea con cantidad negativa resta del ítem original
  // (mismo nombre, idealmente mismo precio). Sin original → queda como línea negativa
  // (ej. devolución de envase).
  const norm = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const out = [];
  for (const it of mapped) {
    if (it.cantidad < 0) {
      const k = norm(it.nombre);
      let idx = out.findIndex(o => o.cantidad > 0 && norm(o.nombre) === k && o.precio_unitario === it.precio_unitario);
      if (idx < 0) idx = out.findIndex(o => o.cantidad > 0 && norm(o.nombre) === k);
      if (idx > -1) {
        out[idx].cantidad += it.cantidad;
        if (out[idx].cantidad <= 0) out.splice(idx, 1);
        continue;
      }
      it.precio_unitario = round(it.precio_unitario * it.cantidad);
      it.cantidad = 1;
    }
    out.push(it);
  }
  return out.filter(it => it.precio_unitario !== 0);
}

// ── PIPELINE PRINCIPAL v5 ────────────────────────────────────────────────────
// Estado por solicitud (cuota y costo): AsyncLocalStorage evita mezclar solicitudes que comparten instancia.
const requestStore = new AsyncLocalStorage();

// Envuelve el flujo de lectura: captura la respuesta, y al final cierra el escaneo reservado (país, modelo, costo, si cuadró).
export default async function handler(req, res) {
  const ctx = { jwt: bearerToken(req), scanId: null, costCents: 0, status: 200, body: null, quota: null };
  const origStatus = res.status.bind(res), origJson = res.json.bind(res);
  res.status = c => { ctx.status = c; return origStatus(c); };
  res.json = b => { ctx.body = b; return origJson(ctx.quota && b && typeof b === 'object' && !Array.isArray(b) && b.ok ? { ...b, quota: ctx.quota } : b); };
  await requestStore.run(ctx, () => handleScan(req, res));
  if (ctx.scanId) {
    const b = ctx.body || {};
    await finishScan(ctx.jwt, ctx.scanId, { ok: ctx.status < 400, country: b.pais, model: b.model_used, cuadra: b.reconciliation ? b.reconciliation.ok : null, costCents: ctx.costCents, items: Array.isArray(b.items) ? b.items.length : null });
  }
}

// Cuota por usuario (solo si SCAN_QUOTA_PER_MONTH > 0). Devuelve false si ya respondió con el rechazo.
async function quotaGate(req, res) {
  if (!quotaEnabled()) return true;
  const ctx = requestStore.getStore();
  if (!ctx.jwt) { res.status(401).json({ error: 'Para leer boletas necesitamos identificarte. Abre la app con conexión a internet e intenta de nuevo.', code: 'AUTH_REQUIRED' }); return false; }
  const q = await consumeScan(ctx.jwt);
  if (q.authFailed) { res.status(401).json({ error: 'Tu sesión venció. Recarga la app e intenta de nuevo.', code: 'AUTH_REQUIRED' }); return false; }
  if (q.allowed === false) {
    if (q.reason === 'global_day') res.status(429).json({ error: 'La lectura automática alcanzó su límite de hoy. Vuelve mañana o ingresa los ítems a mano.', code: 'DAILY_LIMIT' });
    else res.status(429).json({ error: `Llegaste al límite de ${q.limit} lecturas de este mes. Puedes ingresar los ítems a mano.`, code: 'QUOTA_EXCEEDED', used: q.used, limit: q.limit });
    return false;
  }
  if (q.allowed) { ctx.scanId = q.scanId; ctx.quota = { used: q.used, limit: q.limit }; }
  return true;
}

async function handleScan(req, res) {
  const startMs = Date.now();

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  // Secreto propio de la app — ver comentario junto a APP_SHARED_SECRET arriba.
  if (APP_SHARED_SECRET && req.headers['x-app-secret'] !== APP_SHARED_SECRET) {
    return res.status(401).json({ error:'No autorizado', code:'UNAUTHORIZED' });
  }

  // Rate limit best-effort por IP (ver limitaciones en el comentario de arriba).
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error:'Demasiadas solicitudes. Intenta de nuevo en un minuto.', code:'RATE_LIMITED' });
  }

  // La key de Anthropic vive SOLO en el servidor (variable de entorno). El cliente ya no
  // envía keys: el flujo "trae tu propia key" se eliminó por seguridad y porque dejaba a los
  // usuarios nuevos en una ruta de lectura degradada.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('SCAN_UNAVAILABLE: ANTHROPIC_API_KEY no configurada');
    return res.status(503).json({ error: SCAN_UNAVAILABLE_MSG, code:'SCAN_UNAVAILABLE' });
  }

  const {
    image_base64, media_type='image/jpeg',
    country_hint=null, is_confirmation=false
  } = req.body || {};

  if (!image_base64) return res.status(400).json({ error:'image_base64 requerido' });
  if (image_base64.length > 4_000_000) return res.status(413).json({
    error:'Imagen muy grande. Máximo ~3MB.', code:'IMAGE_TOO_LARGE' });

  if (!(await quotaGate(req, res))) return;

  try {
    // Una sola llamada. Siempre Sonnet. Prompt v5 con perfil del país inyectado.
    const model  = selectModel();
    const system = buildV5Prompt(country_hint || null, process.env.OCR_PROMPT_LAYOUT === 'split');
    let modelUsed = model;
    let raw;

    try {
      raw = await callClaude(apiKey, image_base64, media_type, system,
        'Extrae todos los ítems con sus precios de esta boleta.', model);
    } catch(e) {
      // Timeout explícito → respuesta específica al usuario
      if(e.message?.startsWith('TIMEOUT')) {
        return res.status(504).json({
          error:'El procesamiento tardó más de lo esperado. Intenta de nuevo o usa una foto más pequeña.',
          code:'TIMEOUT_OCR'
        });
      }
      console.error('OCR call failed:', e);
      // Saldo agotado, cuota, rate limit o sobrecarga del proveedor: no es culpa de la foto.
      // Se registra con una etiqueta fija para poder crear una alerta en los logs.
      if (/credit balance|billing|quota|rate.?limit|overloaded|HTTP 429|HTTP 529|HTTP 401|authentication/i.test(e.message || '')) {
        console.error('SCAN_UNAVAILABLE:', e.message);
        return res.status(503).json({ error: SCAN_UNAVAILABLE_MSG, code:'SCAN_UNAVAILABLE' });
      }
      return res.status(502).json({ error:'No pudimos leer esta boleta. Prueba con otra foto o ingresa los ítems a mano.', code:'OCR_ERROR' });
    }

    const parsed = parseJSON(raw);

    // Refusal explícito del modelo
    if (parsed && parsed.ok === false && parsed.reason) {
      return res.status(200).json({
        ok: false,
        needs_confirmation: false,
        reason:  parsed.reason,
        message: parsed.message || 'No se pudo procesar la boleta.',
        candidates: parsed.candidates || []
      });
    }

    if (!parsed?.items) {
      return res.status(422).json({ error:'No se pudo leer la boleta', code:'PARSE_ERROR',
        raw: raw?.substring(0, 300) });
    }

    const finalCountry = parsed.pais !== 'UNKNOWN' ? (parsed.pais || country_hint || 'UNKNOWN') : 'UNKNOWN';
    // Fix: nunca asumir CLP como fallback — si Claude no detectó moneda, pedir confirmación
    const currency = parsed.moneda || COUNTRY_RULES[finalCountry]?.currency || 'AMBIGUOUS_DOLLAR';

    // Moneda ambigua → pedir confirmación al usuario
    if ((currency === 'AMBIGUOUS_DOLLAR' || currency === 'AMBIGUOUS_YEN') && !is_confirmation) {
      return res.status(200).json({
        ok: false,
        needs_confirmation: true,
        ambiguous_currency: true,
        detected_country:  finalCountry !== 'UNKNOWN' ? finalCountry : null,
        candidates:        parsed.monedas_candidatas || [],
        items_preview:     (parsed.items || []).slice(0, 3),
        message: '¿Cuál es la moneda de esta boleta?',
        available_countries: Object.entries(COUNTRY_RULES).map(([code,r]) => ({
          code, name:r.name, currency:r.currency, symbol:r.symbol
        }))
      });
    }

    // Normalizar ítems (incluye auto-created si reconcile los agrega)
    let normalizedBase = normalizeItems(parsed.items || [], currency);
    let recon          = reconcile(normalizedBase, parsed.total_referencia || 0, finalCountry);

    // Reglas del país (OCR_PROFILE_RETRY=1, apagada por defecto): la primera lectura de una boleta nueva no sabe de qué país es (la app no manda
    // `country_hint`), así que no lleva las reglas del país. Si la suma no cuadra y el lector reconoció el país, se vuelve a leer UNA vez con
    // esas reglas (cuesta una llamada extra solo en ~1 de cada 10 boletas). Se adopta si deja la suma más cerca del total.
    const perfil = { usado:false, mejoro:false, pais:null };
    if (process.env.OCR_PROFILE_RETRY === '1' && !country_hint && !is_confirmation && recon.total > 0 && !recon.auto_fixed
        && COUNTRY_RULES[finalCountry] && Date.now() - startMs < 25000) {
      const tolP = new Set(DC_CURRENCIES.noDecimalCodes).has(currency) ? 1 : Math.max(0.05, (recon.total || 0) * 0.0015);
      if (Math.abs(recon.diff) > tolP) {
        perfil.usado = true; perfil.pais = finalCountry;
        try {
          const sys2 = buildV5Prompt(finalCountry, process.env.OCR_PROMPT_LAYOUT === 'split');
          const raw2 = await callClaude(apiKey, image_base64, media_type, sys2, 'Extrae todos los ítems con sus precios de esta boleta.', model);
          const p2 = parseJSON(raw2);
          if (p2?.items?.length && !(p2.ok === false && p2.reason)) {
            const nb2 = normalizeItems(p2.items, currency);
            const total2 = p2.total_referencia || parsed.total_referencia || 0;
            const r2 = reconcile(nb2, total2, finalCountry);
            if (Math.abs(r2.diff) < Math.abs(recon.diff)) {
              normalizedBase = nb2; recon = r2; parsed.items = p2.items; parsed.total_referencia = total2; perfil.mejoro = true;
            }
          }
        } catch (e) { console.warn('Segunda lectura con reglas del país omitida:', e.message); }
      }
    }

    // Cascada (OCR_CASCADE_MODEL, apagada por defecto): se lee con el modelo barato y SOLO si la suma no cuadra con el total impreso
    // se vuelve a leer con el modelo más fuerte. Se adopta la segunda lectura si deja la suma más cerca del total.
    const cascade = { usado:false, mejoro:false };
    const cascadeModel = (process.env.OCR_CASCADE_MODEL || '').trim();
    const tolNoDec = new Set(DC_CURRENCIES.noDecimalCodes).has(currency) ? 1 : Math.max(0.05, (recon.total || 0) * 0.0015);
    if (cascadeModel && cascadeModel !== model && !is_confirmation && recon.total > 0 && !recon.auto_fixed
        && Math.abs(recon.diff) > tolNoDec && Date.now() - startMs < 25000) {
      cascade.usado = true;
      try {
        const raw2 = await callClaude(apiKey, image_base64, media_type, system, 'Extrae todos los ítems con sus precios de esta boleta.', cascadeModel);
        const p2 = parseJSON(raw2);
        if (p2?.items?.length && !(p2.ok === false && p2.reason)) {
          const nb2 = normalizeItems(p2.items, currency);
          const total2 = p2.total_referencia || parsed.total_referencia || 0;
          const r2 = reconcile(nb2, total2, finalCountry);
          if (Math.abs(r2.diff) < Math.abs(recon.diff)) {
            normalizedBase = nb2; recon = r2; parsed.items = p2.items; parsed.total_referencia = total2;
            cascade.mejoro = true; modelUsed = cascadeModel;
          }
        }
      } catch (e) { console.warn('Cascada omitida:', e.message); }
    }

    // Segunda lectura SOLO cuando la suma no cuadra con el total impreso (≈ 1 de cada 10 boletas): se le dice al
    // modelo cuánto falta y qué suele causarlo (importe corrido de fila en fotos inclinadas, fila repetida omitida).
    // Se queda con la segunda solo si la acerca claramente al total; si falla o tarda, se conserva la primera.
    let reintento = { usado:false, mejoro:false };
    // APAGADO por defecto (OCR_RETRY=1 para activarlo): en las pruebas con la boleta griega no mejoró la lectura; ver docs/DECISIONES.md.
    const reintentable = process.env.OCR_RETRY === '1' && !recon.auto_fixed && recon.total > 0 && recon.ratio >= 0.03 && recon.ratio <= 0.35
      && Date.now() - startMs < 28000 && !is_confirmation;
    if (reintentable) {
      reintento.usado = true;
      try {
        const lista = normalizedBase.map(it => `- ${it.nombre} | ${it.cantidad} x ${it.precio_unitario}`).join('\n');
        const aviso = `Revisión: la suma de los ítems de tu lectura anterior es ${recon.sum.toFixed(2)} y el total impreso es ${recon.total} ` +
          `(${recon.diff > 0 ? 'faltan' : 'sobran'} ${Math.abs(recon.diff).toFixed(2)}). Tu lectura anterior:\n${lista}\n\n` +
          'Vuelve a mirar la foto fila por fila. Causas frecuentes: un importe corrido a la fila vecina (foto inclinada), ' +
          'una fila omitida (incluso si repite el nombre de otra), o una cantidad mal leída. Corrige SOLO lo que veas mal en la foto; ' +
          'no inventes ni agregues ítems para cuadrar la suma. Devuelve el JSON completo con el mismo formato.';
        const retryModel = process.env.OCR_RETRY_MODEL || model;   // opcional: un modelo más potente solo para la segunda lectura
        const raw2 = await callClaude(apiKey, image_base64, media_type, system, aviso, retryModel);
        const p2 = parseJSON(raw2);
        if (p2?.items?.length && !(p2.ok === false && p2.reason)) {
          const nb2 = normalizeItems(p2.items, currency);
          const total2 = p2.total_referencia || parsed.total_referencia || 0;
          const r2 = reconcile(nb2, total2, finalCountry);
          if (Math.abs(r2.diff) <= Math.abs(recon.diff) * 0.5) {
            normalizedBase = nb2; recon = r2; parsed.items = p2.items; parsed.total_referencia = total2;
            reintento.mejoro = true;
          }
        }
      } catch (e) { console.warn('Reintento omitido:', e.message); }
    }

    // Aplicar auto-fix (siempre marcado, nunca silencioso)
    let finalItems = normalizedBase;
    if (recon.auto_fixed && recon.auto_fix_item) {
      const fix = recon.auto_fix_item;
      finalItems = [...normalizedBase, normalizeAutoFix(fix, currency)];
    }

    if (!finalItems.length) {
      return res.status(422).json({ error:'No se encontraron ítems válidos', code:'NO_ITEMS' });
    }

    const totalFinal     = finalItems.reduce((a,it) => a+it.precio_unitario*it.cantidad, 0);
    const itemsDudosos   = finalItems.filter(it => (it.confianza||1) < 0.60);
    const confianzaGlobal = parsed.confianza_global || (
      finalItems.reduce((s,it) => s+(it.confianza||0.8), 0) / finalItems.length
    );

    // Warnings
    const warnings = [];
    if (!recon.ok && recon.note) {
      warnings.push({ type:'financial_discrepancy', message:recon.note,
        severity: recon.ratio > 0.20 ? 'high' : 'medium' });
    }
    if (recon.auto_fixed) {
      warnings.push({ type:'auto_fix_pending_review', severity:'medium',
        message: recon.user_message || 'Se agregó un ítem automáticamente. Confírmalo o elimínalo.' });
    }
    if (itemsDudosos.length > 0) {
      warnings.push({ type:'low_confidence_items', severity:'low',
        message:`${itemsDudosos.length} ítem(s) con confianza baja — revisar antes de dividir` });
    }
    if (confianzaGlobal < 0.50) {
      warnings.push({ type:'very_low_confidence', severity:'high',
        message:'La lectura general tiene baja confianza — considera re-tomar la foto.' });
    } else if (confianzaGlobal < 0.80) {
      warnings.push({ type:'low_confidence', severity:'medium',
        message:'Algunos ítems pueden tener errores de lectura. Revisa antes de continuar.' });
    }

    // Log asíncrono a Supabase (no bloquea el response)
    logToSupabase({
      country_hint, country_final: finalCountry,
      pos_detected: parsed.pos_detected || 'unknown',
      moneda: currency, model_used: modelUsed,
      prompt_version: PROMPT_VERSION,
      total_reported: parsed.total_referencia || 0,
      total_computed: Math.round(totalFinal * 100) / 100,
      reconciliation: recon,
      status: 'ok',
      latency_ms: Date.now() - startMs,
      confianza_global: Math.round(confianzaGlobal * 100) / 100,
      raw_response: parsed
    }, finalItems).catch(e => console.warn('Supabase log failed:', e.message));

    const rules = COUNTRY_RULES[finalCountry] || {};
    return res.status(200).json({
      ok:                  true,
      restaurante:         parsed.restaurante ?? null,
      moneda:              currency,
      pais:                finalCountry,
      pais_nombre:         rules.name ?? finalCountry,
      pos_detected:        parsed.pos_detected || 'unknown',
      razonamiento:        parsed.razonamiento || null,
      items:               finalItems,
      items_dudosos:       itemsDudosos,
      total:               Math.round(totalFinal * 100) / 100,
      total_referencia:    parsed.total_referencia ?? null,
      propina_sugerida_pct: propinaSugeridaPct(parsed),
      confianza_global:    Math.round(confianzaGlobal * 100) / 100,
      model_used:          modelUsed,
      prompt_version:      PROMPT_VERSION,
      reconciliation: {
        ok:                recon.ok,
        note:              recon.note,
        sum_items:         Math.round((recon.sum||0) * 100) / 100,
        total_boleta:      recon.total,
        diff_ratio:        recon.ratio,
        auto_fixed:        recon.auto_fixed || false,
        auto_fix_type:     recon.auto_fix_type || null,
        user_action_required: recon.user_action_required || false,
        user_message:      recon.user_message || null,
        reintento:         reintento,
        cascada:           cascade,
        perfil_pais:       perfil
      },
      warnings
    });

  } catch(err) {
    console.error('Pipeline error:', err);
    return res.status(500).json({ error:'Error interno', code:'INTERNAL' });
  }
}

// Propina sugerida impresa (no incluida en el total): porcentaje entero entre 3 y 30, o null. Si solo hay monto, se calcula contra el total impreso.
function propinaSugeridaPct(parsed) {
  const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
  let pct = num(parsed.propina_sugerida_pct);
  if (pct == null) {
    const monto = num(parsed.propina_sugerida_monto), total = num(parsed.total_referencia);
    if (monto != null && total != null) pct = (monto / total) * 100;
  }
  if (pct == null) return null;
  pct = Math.round(pct);
  return pct >= 3 && pct <= 30 ? pct : null;
}

// ── Helper: normalizar ítem auto-creado ──────────────────────────────────────
function normalizeAutoFix(fix, currency) {
  // normalizePrice descarta los negativos (los lleva a 0): una línea que resta (devolución) se representa como cantidad -1 con precio positivo,
  // igual que las anulaciones leídas de la boleta.
  const resta = fix.precio_unitario < 0;
  return {
    nombre:           fix.nombre,
    precio_unitario:  normalizePrice(resta ? -fix.precio_unitario : fix.precio_unitario, currency),
    cantidad:         resta ? -1 : 1,
    confianza:        0.50,
    evidencia:        fix.auto_fix_evidence || 'auto-calculado por reconciliación',
    auto_created:     true,
    auto_fix_type:    fix.auto_fix_type || null
  };
}

// ── Helper: log asíncrono a Supabase ─────────────────────────────────────────
async function logToSupabase(runData, items) {
  // Supabase URL/KEY desde env vars
  const SB_URL = process.env.SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!SB_URL || !SB_KEY) return; // Sin Supabase configurado → skip silencioso

  try {
    // Insert ocr_runs
    const runRes = await fetch(`${SB_URL}/rest/v1/ocr_runs`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Prefer':        'return=representation'
      },
      body: JSON.stringify(runData)
    });
    if (!runRes.ok) return; // Log failed silently

    const [run] = await runRes.json();
    if (!run?.id || !items?.length) return;

    // Insert ocr_items
    const itemRows = items.map((it, i) => ({
      run_id:          run.id,
      position:        i,
      nombre:          it.nombre,
      precio_unitario: it.precio_unitario,
      cantidad:        it.cantidad,
      confianza:       it.confianza || null,
      evidencia:       it.evidencia || null,
      auto_created:    it.auto_created || false,
      auto_fix_type:   it.auto_fix_type || null
    }));

    await fetch(`${SB_URL}/rest/v1/ocr_items`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'apikey':SB_KEY, 'Authorization':`Bearer ${SB_KEY}` },
      body: JSON.stringify(itemRows)
    });

    // Upsert merchant_observations
    if (runData.raw_response?.restaurante) {
      await fetch(`${SB_URL}/rest/v1/merchant_observations`, {
        method: 'POST',
        headers: {
          'Content-Type':'application/json', 'apikey':SB_KEY,
          'Authorization':`Bearer ${SB_KEY}`, 'Prefer':'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          restaurant_name: runData.raw_response.restaurante,
          country:         runData.country_final,
          pos_system:      runData.pos_detected,
          last_seen:       new Date().toISOString()
        })
      });
    }
  } catch(e) {
    console.warn('logToSupabase error:', e.message);
  }
}

// ── Helper: normalizar precio ─────────────────────────────────────────────────
function normalizePrice(raw, currency) {
  let val = raw;
  if (typeof val === 'string') {
    const s = val.trim();
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))      val = parseFloat(s.replace(/\./g,'').replace(',','.'));
    else if (/^\d+,\d{1,2}$/.test(s))                val = parseFloat(s.replace(',','.'));
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))  val = parseFloat(s.replace(/,/g,''));
    else                                               val = parseFloat(s.replace(',','.'));
  }
  if (isNaN(val) || val < 0) return 0;
  const NO_DEC = new Set(DC_CURRENCIES.noDecimalCodes);
  return NO_DEC.has(currency) ? Math.round(val) : Math.round(val * 100) / 100;
}
