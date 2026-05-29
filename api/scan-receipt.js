// api/scan-receipt.js
// DiviCuenta — Pipeline de interpretación financiera visual
// Arquitectura: OCR → Clasificación → Parser → Validación → Normalización → Respuesta

// ── BASE DE CONOCIMIENTO ────────────────────────────────────────────────────

const COUNTRY_RULES = {
  CL: { name:'Chile', currency:'CLP', symbol:'$', has_decimals:false, tax_included:true, tax_kw:['iva','impuesto'], deposit_kw:[], refund_kw:['devolucion','anulacion'], tip_behavior:'none', tip_kw:[], total_kw:['total','a pagar','monto'], price_format:'standard', signals:['rut','sii','folio','timbre','giro'], decimal_sep:',', format:'Precios sin decimales. IVA incluido. $ = CLP siempre.' },
  AR: { name:'Argentina', currency:'ARS', symbol:'$', has_decimals:true, tax_included:true, tax_kw:['iva','impuesto','percepciones'], deposit_kw:[], refund_kw:[], tip_behavior:'none', tip_kw:[], total_kw:['total','importe total','a pagar'], price_format:'standard', signals:['cuit','afip','factura a','factura b'], decimal_sep:',', format:'$ = ARS siempre. Precios altos por inflacion son normales.' },
  MX: { name:'México', currency:'MXN', symbol:'$', has_decimals:true, tax_included:false, tax_kw:['iva','ieps'], deposit_kw:[], refund_kw:[], tip_behavior:'optional', tip_kw:['propina','servicio'], total_kw:['total','importe'], price_format:'standard', signals:['rfc','sat','cfdi','folio fiscal'], decimal_sep:'.', format:'$ = MXN. IVA 16% se suma al subtotal.' },
  CO: { name:'Colombia', currency:'COP', symbol:'$', has_decimals:false, tax_included:false, tax_kw:['iva','impoconsumo'], deposit_kw:[], refund_kw:[], tip_behavior:'optional', tip_kw:['propina','servicio'], total_kw:['total','valor total','a pagar'], price_format:'standard', signals:['nit','dian','cufe'], decimal_sep:',', format:'$ = COP. IVA 19% separado.' },
  PE: { name:'Perú', currency:'PEN', symbol:'S/', has_decimals:true, tax_included:true, tax_kw:['igv','tributo'], deposit_kw:[], refund_kw:[], tip_behavior:'none', tip_kw:[], total_kw:['total','precio total'], price_format:'standard', signals:['ruc','sunat','boleta de venta'], decimal_sep:'.', format:'S/ = soles. IGV 18% incluido.' },
  BR: { name:'Brasil', currency:'BRL', symbol:'R$', has_decimals:true, tax_included:false, tax_kw:['icms','pis','cofins','ipi','iss'], deposit_kw:[], refund_kw:['devolucao'], tip_behavior:'optional_10_percent', tip_kw:['gorjeta','servico'], total_kw:['total','valor total','a pagar'], price_format:'standard', signals:['cnpj','cpf','nfe','nota fiscal'], decimal_sep:',', format:'R$ = reales. Decimal con coma. Gorjeta 10% opcional.' },
  DE: { name:'Alemania', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['mwst','ust','steuer'], deposit_kw:['pfand','leergut'], refund_kw:['pfandruckgabe','pfandrückgabe'], tip_behavior:'rounding', tip_kw:['trinkgeld'], total_kw:['zu zahlen','summe','gesamt','brutto'], price_format:'unit_x_qty_equals_total', signals:['mwst','ust-idnr','eur'], decimal_sep:',', format:'EUR. Pfand = depósito (incluir +). Pfandrückgabe = devolución (incluir -). MWST = impuesto (ignorar). Formato "0,29 x 6 = 1,74" → usar 1.74 precio total, cantidad=1.' },
  ES: { name:'España', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['iva','base imponible'], deposit_kw:[], refund_kw:['devolucion'], tip_behavior:'rounding', tip_kw:[], total_kw:['total','importe total','a pagar'], price_format:'two_column', signals:['nif','cif','factura simplificada'], decimal_sep:',', format:'EUR. IVA incluido. Sin propina obligatoria. CRÍTICO: boletas con columnas "Precio" e "Importe" → usar siempre la columna IMPORTE (precio × cantidad = importe). El precio unitario puede estar en la columna izquierda pero el precio correcto del ítem es el IMPORTE de la columna derecha. Nombres de ítem que ocupan dos líneas son UN SOLO ítem.' },
  FR: { name:'Francia', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['tva','taxe'], deposit_kw:['consigne'], refund_kw:['remboursement'], tip_behavior:'included_service', tip_kw:['pourboire','service'], total_kw:['total','a payer','solde'], price_format:'standard', signals:['siret','siren','tva'], decimal_sep:',', format:'EUR. TVA incluida. Service incluido en restaurantes.' },
  GB: { name:'Reino Unido', currency:'GBP', symbol:'£', has_decimals:true, tax_included:true, tax_kw:['vat','tax'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'optional_service_charge', tip_kw:['tip','gratuity','service charge'], total_kw:['total','amount due','to pay'], price_format:'standard', signals:['vat reg','vat no','gbp','£'], decimal_sep:'.', format:'£ = GBP. VAT 20% incluido.' },
  IT: { name:'Italia', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['iva','imposta'], deposit_kw:[], refund_kw:['rimborso'], tip_behavior:'coperto_charge', tip_kw:['mancia','coperto'], total_kw:['totale','da pagare'], price_format:'standard', signals:['p.iva','codice fiscale','scontrino'], decimal_sep:',', format:'EUR. Coperto = cargo cubierto (incluir).' },
  PT: { name:'Portugal', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['iva','imposto'], deposit_kw:[], refund_kw:['devolucao'], tip_behavior:'optional', tip_kw:['gorjeta'], total_kw:['total','a pagar'], price_format:'standard', signals:['nif','nipc','fatura'], decimal_sep:',', format:'EUR. IVA incluido.' },
  NL: { name:'Países Bajos', currency:'EUR', symbol:'€', has_decimals:true, tax_included:true, tax_kw:['btw','belasting'], deposit_kw:['statiegeld'], refund_kw:['retour'], tip_behavior:'rounding', tip_kw:['fooi'], total_kw:['totaal','te betalen'], price_format:'standard', signals:['btw','kvk'], decimal_sep:',', format:'EUR. Statiegeld = depósito retornable.' },
  CH: { name:'Suiza', currency:'CHF', symbol:'Fr', has_decimals:true, tax_included:true, tax_kw:['mwst','tva','iva'], deposit_kw:['pfand'], refund_kw:['ruckgabe'], tip_behavior:'rounding', tip_kw:['trinkgeld'], total_kw:['total','gesamt','summe'], price_format:'standard', signals:['chf','uid'], decimal_sep:'.', format:'CHF = francos suizos.' },
  US: { name:'EE.UU.', currency:'USD', symbol:'$', has_decimals:true, tax_included:false, tax_kw:['tax','sales tax','state tax'], deposit_kw:['deposit','crv'], refund_kw:['refund','void'], tip_behavior:'mandatory_suggestion', tip_kw:['tip','gratuity'], total_kw:['total','amount due','balance','grand total'], price_format:'standard', tip_is_payment:true, signals:['sales tax','gratuity','usd'], decimal_sep:'.', format:'USD. Tax NO incluido. Tip incluirlo si aparece en el total. $ = USD siempre.' },
  CA: { name:'Canadá', currency:'CAD', symbol:'$', has_decimals:true, tax_included:false, tax_kw:['gst','hst','pst','qst'], deposit_kw:['deposit'], refund_kw:['refund'], tip_behavior:'mandatory_suggestion', tip_kw:['tip','gratuity'], total_kw:['total','amount due'], price_format:'standard', tip_is_payment:true, signals:['gst','hst','cad'], decimal_sep:'.', format:'CAD. GST/HST no incluidos. Tip incluirlo si en total.' },
  JP: { name:'Japón', currency:'JPY', symbol:'¥', has_decimals:false, tax_included:true, tax_kw:['消費税','内税','税込'], deposit_kw:[], refund_kw:['返金'], tip_behavior:'none', tip_kw:[], total_kw:['合計','小計','税込合計'], price_format:'standard', signals:['円','消費税','領収書','レシート'], decimal_sep:'.', format:'JPY. Sin decimales. Impuesto 10% incluido. Sin propina.' },
  CN: { name:'China', currency:'CNY', symbol:'¥', has_decimals:true, tax_included:true, tax_kw:['增值税','税'], deposit_kw:['押金'], refund_kw:['退款'], tip_behavior:'none', tip_kw:[], total_kw:['合计','总计','应付'], price_format:'standard', signals:['元','rmb','人民币','发票'], decimal_sep:'.', format:'CNY = yuan. Sin propina.' },
  KR: { name:'Corea del Sur', currency:'KRW', symbol:'₩', has_decimals:false, tax_included:true, tax_kw:['부가세'], deposit_kw:[], refund_kw:['환불'], tip_behavior:'none', tip_kw:[], total_kw:['합계','총액','결제금액'], price_format:'standard', signals:['원','₩','영수증'], decimal_sep:'.', format:'KRW. Sin decimales. IVA incluido. Sin propina.' },
  IN: { name:'India', currency:'INR', symbol:'₹', has_decimals:true, tax_included:false, tax_kw:['sgst','cgst','igst','gst'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'none', tip_kw:[], total_kw:['total','grand total','payable'], price_format:'standard', dual_tax:true, signals:['gstin','gst','hsn','inr','₹'], decimal_sep:'.', format:'INR. SGST + CGST se suman al subtotal. Usar total final.' },
  TH: { name:'Tailandia', currency:'THB', symbol:'฿', has_decimals:true, tax_included:false, tax_kw:['vat','ภาษี'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'service_charge_10', tip_kw:['service charge'], total_kw:['total','รวม'], price_format:'standard', signals:['thb','฿','บาท'], decimal_sep:'.', format:'THB. VAT 7% + service 10%. Usar total.' },
  SG: { name:'Singapur', currency:'SGD', symbol:'S$', has_decimals:true, tax_included:false, tax_kw:['gst','tax'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'service_charge_10', tip_kw:['service charge'], total_kw:['total','amount due'], price_format:'standard', signals:['gst reg','uen','sgd'], decimal_sep:'.', format:'SGD. GST + service 10%. Usar total final.' },
  AU: { name:'Australia', currency:'AUD', symbol:'A$', has_decimals:true, tax_included:true, tax_kw:['gst','tax'], deposit_kw:['deposit'], refund_kw:['refund'], tip_behavior:'optional', tip_kw:['tip'], total_kw:['total','amount due'], price_format:'standard', signals:['abn','gst','aud'], decimal_sep:'.', format:'AUD. GST 10% incluido.' },
  AE: { name:'Emiratos', currency:'AED', symbol:'AED', has_decimals:true, tax_included:false, tax_kw:['vat','tax'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'optional', tip_kw:['service charge'], total_kw:['total','grand total','المجموع'], price_format:'standard', signals:['aed','trn','درهم'], decimal_sep:'.', format:'AED = dirhams. VAT 5%.' },
  SA: { name:'Arabia Saudita', currency:'SAR', symbol:'SAR', has_decimals:true, tax_included:false, tax_kw:['vat','ضريبة'], deposit_kw:[], refund_kw:['refund'], tip_behavior:'none', tip_kw:[], total_kw:['total','المجموع'], price_format:'standard', signals:['sar','ريال'], decimal_sep:'.', format:'SAR = riyales. VAT 15%.' },
};

// ── CAPA 2: Detección de país por heurísticas ─────────────────────────────────
function detectCountry(text) {
  const t = text.toLowerCase();
  const scores = {};
  for (const [code, r] of Object.entries(COUNTRY_RULES)) {
    let s = 0;
    for (const sig of (r.signals || [])) { if (t.includes(sig.toLowerCase())) s += 3; }
    if (t.includes(r.currency.toLowerCase())) s += 2;
    if (!['$','¥'].includes(r.symbol) && t.includes(r.symbol.toLowerCase())) s += 2;
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
    candidates: sorted.slice(0, 4).map(([c, sc]) => ({ country: c, name: COUNTRY_RULES[c]?.name, score: sc }))
  };
}

// ── CAPA 3: Prompt especializado por país ─────────────────────────────────────
function buildPrompt(countryCode) {
  const r = COUNTRY_RULES[countryCode];
  if (!r) return buildGenericPrompt();

  const depositLine = r.deposit_kw?.length
    ? `- "${r.deposit_kw.join('", "')}" = depósito retornable → incluir como item precio POSITIVO.` : '';
  const refundLine = r.refund_kw?.length
    ? `- "${r.refund_kw.join('", "')}" = devolución → incluir como item precio NEGATIVO.` : '';
  const tipLine = (r.tip_is_payment || r.tip_behavior === 'mandatory_suggestion')
    ? `- Propina (${r.tip_kw.join(', ')}): si aparece en el recibo incluirla como item "Propina".`
    : ['service_charge_10','included_service','optional_service_charge'].includes(r.tip_behavior)
    ? `- Service charge: si aparece como línea incluirla como item "Servicio".`
    : r.tip_behavior === 'coperto_charge'
    ? `- Coperto: incluirlo como item "Coperto".`
    : `- Sin propina en ${r.name}. Ignorar cualquier sugerencia de propina.`;
  const priceLine = r.price_format === 'unit_x_qty_equals_total'
    ? `- Formato "PRECIO x CANTIDAD = TOTAL": usar el TOTAL como precio_unitario y 1 como cantidad. Ej: "0,29 x 6 = 1,74" → precio_unitario:1.74, cantidad:1`
    : r.price_format === 'two_column'
    ? `- Formato DOS COLUMNAS "Precio | Importe": usar SIEMPRE el valor de la columna IMPORTE (la última columna, derecha) como precio_unitario. La columna "Precio" es el precio unitario antes de multiplicar — NO usarla. Ej: "2 PAN 1,00 2,00" → precio_unitario:2.00 cantidad:2. IMPORTANTE: si el nombre del ítem ocupa dos líneas, es UN SOLO ítem — no crear dos ítems separados.`
    : `- Decimal con "${r.decimal_sep}". En JSON siempre punto: "1${r.decimal_sep}74" → 1.74`;

  return `Eres experto en boletas de ${r.name}. Moneda: ${r.currency} (${r.symbol}).
CONTEXTO: ${r.format}

REGLAS ESPECÍFICAS:
- IGNORAR impuestos (${r.tax_kw.join(', ')}) — no son productos.
${depositLine}
${refundLine}
${tipLine}
${priceLine}
- Total correcto: línea "${(r.total_kw || []).slice(0,3).join('" o "')}".
- Ignorar: N° transacción, códigos barra, publicidad, fechas, teléfonos, RUT/NIF/RFC/CNPJ.
- Nombres de items en idioma original de la boleta.

RESPONDE SOLO con JSON válido (sin markdown):
{"restaurante":"nombre o null","moneda":"${r.currency}","pais":"${countryCode}","items":[{"nombre":"nombre","precio_unitario":numero,"cantidad":numero}],"total":numero,"confianza":numero_0_a_1}

Si no puedes leer: {"restaurante":null,"moneda":"${r.currency}","pais":"${countryCode}","items":[],"total":0,"confianza":0}`;
}

function buildGenericPrompt() {
  return `Eres experto en boletas de cualquier parte del mundo.

INSTRUCCIONES:
1. Detecta país y moneda por idioma, símbolos y keywords fiscales.
2. Extrae SOLO los productos/items con sus precios reales.
3. IGNORAR: impuestos (VAT,IVA,GST,MWST,Tax,ICMS,SGST,CGST), subtotales, códigos barra, publicidad, métodos pago.
4. Depósitos retornables (Pfand, Statiegeld, CRV): incluir precio POSITIVO.
5. Devoluciones de depósitos: incluir precio NEGATIVO.
6. Propinas/service charge en el total final: incluir como item "Propina" o "Servicio".
7. Formato "precio × cantidad = total": usar TOTAL como precio_unitario, cantidad=1.
8. Precios siempre como número con punto decimal en JSON.

RESPONDE SOLO con JSON válido (sin markdown):
{"restaurante":"nombre o null","moneda":"ISO_3_letras","pais":"ISO_2_letras_o_UNKNOWN","items":[{"nombre":"nombre original","precio_unitario":numero,"cantidad":numero}],"total":numero,"confianza":numero_0_a_1}

Si no puedes leer: {"restaurante":null,"moneda":"CLP","pais":"UNKNOWN","items":[],"total":0,"confianza":0}`;
}

// ── CAPA 4: Llamada a Claude ──────────────────────────────────────────────────
async function callClaude(apiKey, imageBase64, mediaType, system, userText) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system,
      messages: [{ role:'user', content:[
        { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
        { type:'text', text:userText }
      ]}]
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(()=>({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const d = await res.json();
  const block = d.content?.find(b => b.type === 'text');
  if (!block?.text) throw new Error('Sin respuesta de Claude');
  return block.text;
}

// ── Parser robusto de JSON ────────────────────────────────────────────────────
function parseJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch(_) {}
  try { return JSON.parse(raw.replace(/```json|```/gi,'').trim()); } catch(_) {}
  try { const s=raw.indexOf('{'),e=raw.lastIndexOf('}'); if(s>-1&&e>s) return JSON.parse(raw.substring(s,e+1)); } catch(_) {}
  return null;
}

// ── CAPA 5: Reconciliación financiera ─────────────────────────────────────────
function reconcile(items, totalReported) {
  const sum = items.reduce((a,it) => a + (it.precio_unitario * (it.cantidad||1)), 0);
  if (!totalReported) return { ok:true, sum, total:sum, diff:0, ratio:0, note:null };
  const diff = totalReported - sum;
  const ratio = Math.abs(diff) / totalReported;
  let note = null, ok = true;
  if (ratio < 0.03) { ok=true; }
  else if (ratio < 0.06) { note='Pequeña diferencia por redondeo.'; ok=true; }
  else if (diff>0 && ratio>=0.08 && ratio<=0.12) { note=`El total incluye ~${Math.round(ratio*100)}% extra — posible service charge o propina.`; ok=false; }
  else if (diff>0 && ratio>=0.13 && ratio<=0.22) { note=`El total incluye ~${Math.round(ratio*100)}% extra — posible impuesto no incluido.`; ok=false; }
  else if (diff<0) { note='La suma supera el total — posible descuento no capturado.'; ok=false; }
  else if (ratio>0.22) { note=`Discrepancia grande (${Math.round(ratio*100)}%) — algunos items pueden faltar.`; ok=false; }
  return { ok, sum:Math.round(sum*100)/100, total:totalReported, diff:Math.round(diff*100)/100, ratio:parseFloat(ratio.toFixed(3)), note };
}

// ── CAPA 6: Normalización de precios ─────────────────────────────────────────
function normalizeItems(items, countryCode) {
  const r = COUNTRY_RULES[countryCode] || {};
  // Monedas SIN decimales: Claude devuelve enteros (440 para ¥440, 12000 para ₩12000)
  // Monedas CON decimales: Claude devuelve float (7.90 para €7,90, 1.65 para €1,65)
  // NO aplicar factor ×100 — los precios ya vienen en escala correcta desde Claude
  const noDecimal = ['CLP','JPY','KRW','VND','IDR','TWD','KHR','MMK','UGX','RWF','TZS','XOF','XAF'];
  const isNoDecimal = noDecimal.includes(r.currency || '');

  return items.map((it,i) => {
    let raw = it.precio_unitario ?? it.precio ?? 0;

    // Normalizar si viene como string (separadores europeos, etc.)
    if (typeof raw === 'string') {
      const s = raw.trim();
      // Formato europeo miles: "1.234,56"
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) raw = parseFloat(s.replace(/\./g,'').replace(',','.'));
      // Formato europeo simple: "7,90"
      else if (/^\d+,\d{1,2}$/.test(s)) raw = parseFloat(s.replace(',','.'));
      // Formato americano miles: "1,234.56"
      else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) raw = parseFloat(s.replace(/,/g,''));
      else raw = parseFloat(s.replace(',','.'));
    }

    if (isNaN(raw)) raw = 0;

    // Para monedas sin decimales: redondear al entero más cercano
    // Para monedas con decimales: conservar 2 decimales exactos (sin ×100)
    const precioFinal = isNoDecimal
      ? Math.round(raw)
      : Math.round(raw * 100) / 100;  // mantener 2 decimales, NO multiplicar

    return {
      nombre: it.nombre || it.name || `Item ${i+1}`,
      precio_unitario: precioFinal,
      cantidad: Math.max(1, parseInt(it.cantidad)||1)
    };
  }).filter(it => it.precio_unitario !== 0);
}

// ── PIPELINE PRINCIPAL ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error:'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY || req.body?.api_key;
  if (!apiKey) return res.status(500).json({ error:'API key no configurada', code:'NO_KEY' });

  const { image_base64, media_type='image/jpeg', country_hint=null, is_confirmation=false } = req.body || {};

  if (!image_base64) return res.status(400).json({ error:'image_base64 requerido' });
  if (image_base64.length > 4_000_000) return res.status(413).json({ error:'Imagen muy grande. Máximo 3MB.', code:'IMAGE_TOO_LARGE' });

  try {
    // ── PASO 1: OCR ligero + detección de país ─────────────────────────────────
    let detectedCountry = country_hint;
    let detectionConfidence = country_hint ? 1.0 : 0;
    let candidates = [];
    let rawLines = [];

    if (!country_hint) {
      const ocrSystem = `Analiza esta imagen de boleta/recibo. Devuelve SOLO este JSON (sin markdown):
{"raw_lines":["hasta 25 lineas mas relevantes: nombre lugar, items, precios, total, keywords fiscales"],"posible_pais":"codigo_ISO_2_letras_o_null","posible_moneda":"codigo_ISO_3_letras_o_null","idioma":"nombre","tipo":"restaurante|supermercado|tienda|hotel|otro"}`;

      let ocrRaw;
      try {
        ocrRaw = await callClaude(apiKey, image_base64, media_type, ocrSystem,
          'Extrae las líneas más relevantes de esta boleta y detecta su país de origen.');
      } catch(e) {
        return res.status(502).json({ error:`OCR falló: ${e.message}`, code:'OCR_ERROR' });
      }

      const ocr = parseJSON(ocrRaw);
      if (ocr?.raw_lines) rawLines = ocr.raw_lines;

      // Combinar señal del modelo + heurísticas en el texto extraído
      const textForHeuristic = rawLines.join(' ');
      const heuristic = detectCountry(textForHeuristic);

      if (ocr?.posible_pais && COUNTRY_RULES[ocr.posible_pais]) {
        detectedCountry = ocr.posible_pais;
        detectionConfidence = heuristic.country === ocr.posible_pais
          ? Math.min(heuristic.confidence + 0.25, 0.95)
          : 0.65;
      } else if (heuristic.country) {
        detectedCountry = heuristic.country;
        detectionConfidence = heuristic.confidence;
      }
      candidates = heuristic.candidates;

      // Países donde $ es ambiguo → pedir confirmación si confianza baja
      const ambiguous = ['CL','AR','MX','US','CA','CO'];
      const needsConfirm = !is_confirmation && (
        detectionConfidence < 0.60 ||
        (ambiguous.includes(detectedCountry) && detectionConfidence < 0.72)
      );

      if (needsConfirm) {
        return res.status(200).json({
          ok: false,
          needs_confirmation: true,
          detected_country: detectedCountry,
          detected_country_name: COUNTRY_RULES[detectedCountry]?.name || null,
          confidence: detectionConfidence,
          candidates,
          message: detectedCountry
            ? `Parece ser una boleta de ${COUNTRY_RULES[detectedCountry]?.name || detectedCountry} (${Math.round(detectionConfidence*100)}% certeza). ¿Es correcto?`
            : '¿De qué país es esta boleta?',
          available_countries: Object.entries(COUNTRY_RULES).map(([code,r]) => ({
            code, name:r.name, currency:r.currency, symbol:r.symbol
          }))
        });
      }
    }

    // ── PASO 2: Parsing especializado con contexto de país ─────────────────────
    const system = buildPrompt(detectedCountry || 'UNKNOWN');
    const userMsg = rawLines.length
      ? `Líneas clave de la boleta:\n${rawLines.join('\n')}\n\nExtrae todos los items con sus precios.`
      : 'Extrae todos los items/productos con sus precios de esta boleta.';

    let parseRaw;
    try {
      parseRaw = await callClaude(apiKey, image_base64, media_type, system, userMsg);
    } catch(e) {
      return res.status(502).json({ error:`Parsing falló: ${e.message}`, code:'PARSE_ERROR' });
    }

    const parsed = parseJSON(parseRaw);
    if (!parsed?.items) {
      return res.status(422).json({
        error:'No se pudieron extraer items de la boleta',
        code:'PARSE_ERROR',
        raw: parseRaw.substring(0,200)
      });
    }

    // ── CAPA 5: Reconciliación ─────────────────────────────────────────────────
    const finalCountry = parsed.pais || detectedCountry || 'CL';
    const recon = reconcile(parsed.items, parsed.total || 0);

    // ── CAPA 6: Normalización ─────────────────────────────────────────────────
    const normalizedItems = normalizeItems(parsed.items, finalCountry);
    const normalizedTotal = normalizedItems.reduce((a,it) => a + it.precio_unitario * it.cantidad, 0);

    const rules = COUNTRY_RULES[finalCountry] || {};
    const warnings = [];

    if (!recon.ok && recon.note) {
      warnings.push({ type:'financial_discrepancy', message:recon.note, severity: recon.ratio>0.20?'high':'medium' });
    }
    if (detectionConfidence < 0.80 && !country_hint) {
      warnings.push({ type:'country_uncertain', message:`País detectado con ${Math.round(detectionConfidence*100)}% de certeza`, severity:'low' });
    }
    if (!normalizedItems.length) {
      return res.status(422).json({ error:'No se encontraron items válidos', code:'NO_ITEMS' });
    }

    return res.status(200).json({
      ok: true,
      restaurante: parsed.restaurante ?? null,
      moneda: parsed.moneda ?? rules.currency ?? 'CLP',
      pais: finalCountry,
      pais_nombre: rules.name ?? finalCountry,
      items: normalizedItems,
      total: normalizedTotal,
      total_original: parsed.total ?? null,
      confianza_pais: detectionConfidence,
      confianza_extraccion: parsed.confianza ?? 0.8,
      reconciliation: {
        ok: recon.ok,
        note: recon.note,
        sum_items: recon.sum,
        total_boleta: recon.total,
        diff_ratio: recon.ratio
      },
      warnings
    });

  } catch(err) {
    console.error('Pipeline error:', err);
    return res.status(500).json({ error:'Error interno del pipeline', code:'INTERNAL', detail:err.message });
  }
}
