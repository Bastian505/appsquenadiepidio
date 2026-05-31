// api/scan-receipt.js — DiviCuenta v4
// Optimización de costos: 1 llamada por boleta + modelo inteligente por complejidad
// Haiku 4.5 para boletas simples (~70%) | Sonnet 4.6 para boletas complejas (~30%)
// Ahorro estimado: 61% vs versión anterior

// ── MODELOS ───────────────────────────────────────────────────────────────────
const MODEL_HAIKU   = 'claude-haiku-4-5-20251001';   // $1/$5 por MTok
const MODEL_SONNET  = 'claude-sonnet-4-6';            // $3/$15 por MTok

// complexity: 'simple' → Haiku | 'complex' → Sonnet
// Criterio: países con formatos ambiguos, múltiples variantes, texto no latino,
//           cargos especiales, o moneda con $ compartido de difícil distinción

// ── BASE DE CONOCIMIENTO: 26 países ──────────────────────────────────────────
const COUNTRY_RULES = {

  // ── LATAM ─────────────────────────────────────────────────────────────────
  CL: {
    name:'Chile', currency:'CLP', symbol:'$', has_decimals:false,
    complexity:'simple',
    tax_kw:['iva','impuesto'], deposit_kw:[], refund_kw:['devolucion','anulacion'],
    tip_behavior:'none', tip_kw:[], total_kw:['total','a pagar','monto'],
    price_format:'standard', signals:['rut','sii','folio','timbre','giro'],
    format:'$ = CLP. Precios SIN decimales. IVA incluido. Filtrar items precio=0.'
  },
  AR: {
    name:'Argentina', currency:'ARS', symbol:'$', has_decimals:true,
    complexity:'simple',
    tax_kw:['iva','impuesto','percepciones'], deposit_kw:[], refund_kw:[],
    tip_behavior:'none', tip_kw:[], total_kw:['total','importe total','a pagar'],
    price_format:'standard', signals:['cuit','afip','factura a','factura b'],
    format:'$ = ARS siempre. Precios altos por inflación son normales.'
  },
  MX: {
    name:'México', currency:'MXN', symbol:'$', has_decimals:true,
    complexity:'simple',
    tax_kw:['iva','ieps'], deposit_kw:[], refund_kw:[],
    tip_behavior:'optional', tip_kw:['propina','servicio'], total_kw:['total','importe'],
    price_format:'standard', signals:['rfc','sat','cfdi','folio fiscal'],
    format:'$ = MXN. IVA 16% separado.'
  },
  CO: {
    name:'Colombia', currency:'COP', symbol:'$', has_decimals:false,
    complexity:'complex',  // $ ambiguo + IPC + propina en boleta + precios altos
    tax_kw:['iva','impoconsumo','ipc'], deposit_kw:[], refund_kw:[],
    tip_behavior:'optional_explicit', tip_kw:['propina','servicio voluntario'],
    total_kw:['total','subtotal','valor total','a pagar'],
    price_format:'standard', signals:['nit','dian','cufe','ipc','colombia','bogota','cali','medellin'],
    format:'$ = COP (pesos colombianos). Precios SIN decimales, punto = separador de miles: "$6.700" = 6700 COP. IPC/IVA/impoconsumo = impuestos, ignorar. Propina sugerida 10% incluirla si aparece como línea. Usar SUBTOTAL sin propina como base.'
  },
  PE: {
    name:'Perú', currency:'PEN', symbol:'S/', has_decimals:true,
    complexity:'simple',
    tax_kw:['igv','tributo'], deposit_kw:[], refund_kw:[],
    tip_behavior:'none', tip_kw:[], total_kw:['total','precio total'],
    price_format:'standard', signals:['ruc','sunat','boleta de venta'],
    format:'S/ = soles. IGV 18% incluido.'
  },
  BR: {
    name:'Brasil', currency:'BRL', symbol:'R$', has_decimals:true,
    complexity:'simple',
    tax_kw:['icms','pis','cofins','ipi','iss'], deposit_kw:[], refund_kw:['devolucao'],
    tip_behavior:'optional_10_percent', tip_kw:['gorjeta','servico'],
    total_kw:['total','valor total','a pagar'],
    price_format:'standard', signals:['cnpj','cpf','nfe','nota fiscal'],
    format:'R$ = reales. Decimal con coma: "1,74"=1.74. Gorjeta 10% incluirla si aparece.'
  },

  // ── EUROPA ────────────────────────────────────────────────────────────────
  DE: {
    name:'Alemania', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'complex',  // Pfand, formato especial precio×cantidad=total
    tax_kw:['mwst','ust','steuer'], deposit_kw:['pfand','leergut'],
    refund_kw:['pfandruckgabe','pfandrückgabe'],
    tip_behavior:'rounding', tip_kw:['trinkgeld'],
    total_kw:['zu zahlen','summe','gesamt','brutto'],
    price_format:'unit_x_qty_equals_total', signals:['mwst','ust-idnr'],
    format:'EUR. Pfand = depósito retornable, incluir POSITIVO. Pfandrückgabe = devolución, incluir NEGATIVO. MWST = impuesto, IGNORAR. Formato "0,29 x 6 = 1,74" → precio_unitario=1.74, cantidad=1.'
  },
  ES: {
    name:'España', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'complex',  // 5 formatos distintos de boleta
    tax_kw:['iva','base imponible','base imp'], deposit_kw:[], refund_kw:['devolucion'],
    tip_behavior:'none', tip_kw:[], total_kw:['total','importe total','a pagar','total eur'],
    price_format:'es_multi', signals:['nif','cif','factura simplificada','fact.simplificada'],
    format:`EUR. IVA siempre incluido. Sin propina obligatoria.
DETECTA el formato y aplica la regla correcta:
F1 (Cant|Precio|IVA%|Importe): "2 PAN Y PICOS 1.50 10.0 3.00" → precio_unitario=1.50, cantidad=2
F2 (Cant×Precio|Descripcion|Suma): "2x 2.15 A/SIN 4.30" → precio_unitario=2.15, cantidad=2
F3 (Uds|Producto|Importe_total): "3 MENU DEGUSTACION 210,00€" → precio_unitario=70.00, cantidad=3
F4 (UDS_pegado|PVP|IMPORTE): "6,00PAN MENTIDERO 1,00 6,00€" → nombre="PAN MENTIDERO", precio_unitario=1.00, cantidad=6
F5 (Nombre|Precio — sin cant): "Gambas al Ajillo 24,00" → precio_unitario=24.00, cantidad=1. "N @ precio total" → precio_unitario=precio, cantidad=N
Nombres en 2 líneas = UN SOLO ítem. Decimal con coma: "1,80"→1.80.`
  },
  FR: {
    name:'Francia', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['tva','taxe'], deposit_kw:['consigne'], refund_kw:['remboursement'],
    tip_behavior:'included_service', tip_kw:['pourboire','service'],
    total_kw:['total','a payer','solde'],
    price_format:'standard', signals:['siret','siren','tva'],
    format:'EUR. TVA incluida. Service 10-15% ya incluido en restaurantes.'
  },
  GB: {
    name:'Reino Unido', currency:'GBP', symbol:'£', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','tax'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'mandatory_service_charge', tip_kw:['tip','gratuity','service charge'],
    total_kw:['total','amount due','to pay'],
    price_format:'standard', signals:['vat reg','vat no','gbp','£','amount due'],
    format:'£ = GBP (libras), NO EUR aunque menú sea italiano. Service charge = INCLUIRLO siempre como item "Servicio" (es obligatorio). Amount due = total final.'
  },
  IT: {
    name:'Italia', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['iva','imposta'], deposit_kw:[], refund_kw:['rimborso'],
    tip_behavior:'coperto_charge', tip_kw:['mancia'],
    total_kw:['totale','da pagare','total'],
    price_format:'standard', signals:['p.iva','codice fiscale','scontrino','preconto','non fiscale','coperto','ritirare'],
    format:'EUR. COPERTO = cargo real por cubierto/persona, INCLUIRLO. NON FISCALE/PRECONTO = precuenta válida. Decimal con coma: "6,00"=6.00.'
  },
  PT: {
    name:'Portugal', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['iva','imposto'], deposit_kw:[], refund_kw:['devolucao'],
    tip_behavior:'optional', tip_kw:['gorjeta'], total_kw:['total','a pagar'],
    price_format:'standard', signals:['nif','nipc','fatura'],
    format:'EUR. IVA incluido.'
  },
  NL: {
    name:'Países Bajos', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['btw','belasting'], deposit_kw:['statiegeld'], refund_kw:['retour'],
    tip_behavior:'rounding', tip_kw:['fooi'], total_kw:['totaal','te betalen'],
    price_format:'standard', signals:['btw','kvk','totaal','tafel'],
    format:'EUR. BTW = IVA incluido. CRÍTICO: "2 Singha Beer 11,00" → precio_unitario=5.50, cantidad=2. El precio al final ES el total de la línea, dividir entre cantidad.'
  },
  CH: {
    name:'Suiza', currency:'CHF', symbol:'Fr', has_decimals:true,
    complexity:'simple',
    tax_kw:['mwst','tva','iva'], deposit_kw:['pfand'], refund_kw:['ruckgabe'],
    tip_behavior:'rounding', tip_kw:['trinkgeld'], total_kw:['total','gesamt','summe'],
    price_format:'standard',
    signals:['chf','uid','che-','8902','8001','zürich','zurich','luzern','bern','basel','urdorf','bachstrasse'],
    format:'CHF = francos suizos. "Euro X.XX" = equivalente en EUR del día, IGNORAR. "à X.XX" = precio unitario. "2 Wasser à 8.60 17.20" → precio_unitario=8.60, cantidad=2.'
  },

  // ── NORTEAMÉRICA ──────────────────────────────────────────────────────────
  US: {
    name:'EE.UU.', currency:'USD', symbol:'$', has_decimals:true,
    complexity:'complex',  // formato N..NOMBRE TOTAL, modificadores, Health Ins, tax
    tax_kw:['tax','sales tax','state tax'], deposit_kw:['deposit','crv'],
    refund_kw:['refund','void'], tip_behavior:'mandatory_suggestion',
    tip_kw:['tip','gratuity'], total_kw:['total','amount due','cash total','total due'],
    price_format:'us_qty_total', tip_is_payment:true,
    signals:['sales tax','gratuity','table','server:','check #','guests','usd','austin','boston','san diego','west yarmouth'],
    format:`USD. $ = USD. Tax NO incluido en precios.
FORMATO: "N..NOMBRE TOTAL" → precio_unitario=TOTAL÷N. Ej: "3 Coffee $12.00" → {precio_unitario:4.00, cantidad:3}.
IGNORAR líneas sin precio: "Over Easy,Brown Bread", "Poached Medium", "Any Style", etc.
INCLUIR: "Health Ins (X%)" como item. Service charge como item.
TOTAL: usar "Cash Total" si existe (sin propina). Propina solo si en total real pagado.`
  },
  CA: {
    name:'Canadá', currency:'CAD', symbol:'$', has_decimals:true,
    complexity:'simple',
    tax_kw:['gst','hst','pst','qst'], deposit_kw:['deposit'], refund_kw:['refund'],
    tip_behavior:'mandatory_suggestion', tip_kw:['tip','gratuity'],
    total_kw:['total','amount due'],
    price_format:'standard', tip_is_payment:true, signals:['gst','hst','cad'],
    format:'CAD. $ = CAD. GST/HST no incluidos. Tip incluirlo si en total pagado.'
  },

  // ── ISRAEL ────────────────────────────────────────────────────────────────
  IL: {
    name:'Israel', currency:'ILS', symbol:'₪', has_decimals:true,
    complexity:'complex',  // hebreo RTL, columnas invertidas
    tax_kw:['מע"מ','מעמ','מע״מ'], deposit_kw:[], refund_kw:[],
    tip_behavior:'optional', tip_kw:['טיפ','שירות'],
    total_kw:['סה"כ','סהכ','לתשלום','סה״כ שלם'],
    price_format:'il_rtl',
    signals:['₪','ils','1pos.co.il','מע"מ','מעמ','שקל','nis','לתשלום'],
    format:'ILS = ₪ (shekel). Hebreo RTL. מחיר=precio, כמות=cantidad, לתשלום=total línea. Ignorar מע"מ=IVA, עיגול=redondeo. Total en "סה״כ שלם".'
  },

  // ── ASIA ──────────────────────────────────────────────────────────────────
  JP: {
    name:'Japón', currency:'JPY', symbol:'¥', has_decimals:false,
    complexity:'simple',
    tax_kw:['消費税','内税','税込'], deposit_kw:[], refund_kw:['返金'],
    tip_behavior:'none', tip_kw:[], total_kw:['合計','小計','税込合計'],
    price_format:'standard',
    signals:['円','消費税','領収書','レシート','税込','合計','¥','jpy','japan'],
    format:'JPY = ¥. Sin decimales. Impuesto 10% incluido. Sin propina.'
  },
  CN: {
    name:'China', currency:'CNY', symbol:'¥', has_decimals:true,
    complexity:'simple',
    tax_kw:['增值税','税'], deposit_kw:['押金'], refund_kw:['退款'],
    tip_behavior:'none', tip_kw:[], total_kw:['合计','总计','应付'],
    price_format:'standard', signals:['元','rmb','人民币','发票'],
    format:'CNY = yuan. Sin propina.'
  },
  KR: {
    name:'Corea del Sur', currency:'KRW', symbol:'₩', has_decimals:false,
    complexity:'simple',
    tax_kw:['부가세'], deposit_kw:[], refund_kw:['환불'],
    tip_behavior:'none', tip_kw:[], total_kw:['합계','총액','결제금액'],
    price_format:'standard', signals:['원','₩','영수증'],
    format:'KRW = ₩. Sin decimales. IVA 10% incluido. Sin propina.'
  },
  IN: {
    name:'India', currency:'INR', symbol:'₹', has_decimals:true,
    complexity:'complex',  // SGST + CGST dual, formatos variables
    tax_kw:['sgst','cgst','igst','gst'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'none', tip_kw:[], total_kw:['total','grand total','payable'],
    price_format:'standard', dual_tax:true,
    signals:['gstin','gst','hsn','inr','₹'],
    format:'INR = ₹. SGST+CGST se suman al subtotal. Usar total final.'
  },
  TH: {
    name:'Tailandia', currency:'THB', symbol:'฿', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','ภาษี'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'service_charge_10', tip_kw:['service charge'],
    total_kw:['total','รวม'],
    price_format:'standard', signals:['thb','฿','บาท'],
    format:'THB. VAT 7% + service 10%. Usar total.'
  },
  SG: {
    name:'Singapur', currency:'SGD', symbol:'S$', has_decimals:true,
    complexity:'simple',
    tax_kw:['gst','tax'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'service_charge_10', tip_kw:['service charge'],
    total_kw:['total','amount due'],
    price_format:'standard', signals:['gst reg','uen','sgd'],
    format:'SGD. GST + service 10%. Usar total final.'
  },
  AU: {
    name:'Australia', currency:'AUD', symbol:'A$', has_decimals:true,
    complexity:'simple',
    tax_kw:['gst','tax'], deposit_kw:['deposit'], refund_kw:['refund'],
    tip_behavior:'optional', tip_kw:['tip'], total_kw:['total','amount due'],
    price_format:'standard', signals:['abn','gst','aud'],
    format:'AUD. GST 10% incluido.'
  },

  // ── MEDIO ORIENTE ─────────────────────────────────────────────────────────
  AE: {
    name:'Emiratos', currency:'AED', symbol:'AED', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','tax'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'optional', tip_kw:['service charge'],
    total_kw:['total','grand total','المجموع'],
    price_format:'standard', signals:['aed','trn','درهم'],
    format:'AED = dirhams. VAT 5%.'
  },
  SA: {
    name:'Arabia Saudita', currency:'SAR', symbol:'SAR', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','ضريبة'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'none', tip_kw:[], total_kw:['total','المجموع'],
    price_format:'standard', signals:['sar','ريال'],
    format:'SAR = riyales. VAT 15%.'
  },
};

// ── Selección de modelo por complejidad ───────────────────────────────────────
function selectModel(countryCode) {
  const r = COUNTRY_RULES[countryCode];
  if (!r) return MODEL_SONNET; // desconocido → Sonnet por seguridad
  return r.complexity === 'complex' ? MODEL_SONNET : MODEL_HAIKU;
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

// ── CAPA 3: Prompt unificado (OCR + Parser en 1 sola llamada) ─────────────────
function buildUnifiedPrompt(countryCode) {
  const r = COUNTRY_RULES[countryCode];
  if (!r) return buildGenericPrompt();

  const depositLine = r.deposit_kw?.length
    ? `- "${r.deposit_kw.join('", "')}" = depósito retornable → item precio POSITIVO.` : '';
  const refundLine = r.refund_kw?.length
    ? `- "${r.refund_kw.join('", "')}" = devolución → item precio NEGATIVO.` : '';

  const tipLine =
    (r.tip_is_payment || r.tip_behavior === 'mandatory_suggestion')
      ? `- Propina/tip: si aparece como línea con monto real en el recibo, incluirla como item "Propina".`
    : r.tip_behavior === 'mandatory_service_charge'
      ? `- Service charge: es OBLIGATORIO, incluirlo siempre como item "Servicio".`
    : r.tip_behavior === 'optional_explicit'
      ? `- Propina sugerida: si aparece como línea con monto, incluirla como item.`
    : ['service_charge_10','included_service','optional_service_charge'].includes(r.tip_behavior)
      ? `- Service charge: si aparece como línea, incluirla como item "Servicio".`
    : r.tip_behavior === 'coperto_charge'
      ? `- COPERTO: cargo real por cubierto/persona. Incluirlo siempre como item.`
    : `- Sin propina obligatoria. Ignorar sugerencias de propina.`;

  const priceLine =
    r.price_format === 'unit_x_qty_equals_total'
      ? `- "PRECIO x CANTIDAD = TOTAL": precio_unitario=TOTAL, cantidad=1.`
    : r.price_format === 'us_qty_total'
      ? `- "N NOMBRE TOTAL": precio_unitario=TOTAL÷N, cantidad=N. Ignorar líneas sin precio.`
    : r.price_format === 'il_rtl'
      ? `- Texto hebreo RTL. מחיר=precio, כמות=cantidad, לתשלום=total línea.`
    : r.price_format === 'es_multi'
      ? `- Detecta el formato (F1-F5) según instrucciones en CONTEXTO.`
    : `- Decimal con punto en JSON. "1,80" → 1.80`;

  return `Eres experto en boletas de ${r.name}. Moneda: ${r.currency} (${r.symbol}).

CONTEXTO: ${r.format}

REGLAS:
- IGNORAR: ${r.tax_kw.join(', ')} (impuestos), subtotales, publicidad, fechas, RUT/NIF/RFC/CNPJ/NIT.
- NO incluir items precio=0.
${depositLine}
${refundLine}
${tipLine}
${priceLine}
- Total correcto: "${(r.total_kw || []).slice(0,3).join('" o "')}".
- Nombres en idioma original. precio_unitario siempre número con punto decimal.

RESPONDE SOLO JSON válido (sin markdown):
{"restaurante":"nombre o null","moneda":"${r.currency}","pais":"${countryCode}","items":[{"nombre":"nombre","precio_unitario":numero,"cantidad":numero}],"total":numero,"confianza":numero_0_a_1}

Si no puedes leer: {"restaurante":null,"moneda":"${r.currency}","pais":"${countryCode}","items":[],"total":0,"confianza":0}`;
}

// Prompt para PASO 1 cuando el país es desconocido (detección + extracción en 1)
function buildAutoDetectPrompt() {
  return `Eres experto en boletas de cualquier país del mundo.

PASO 1 — DETECTA el país analizando: idioma, símbolo de moneda, keywords fiscales (IVA, VAT, GST, MWST, BTW, etc.), formato de números, nombre del lugar.

PASO 2 — EXTRAE los items con estas reglas universales:
1. Solo productos/items con precio real. NO incluir precio=0.
2. IGNORAR: impuestos (IVA,VAT,GST,MWST,BTW,Tax,ICMS,SGST,CGST,IPC,מע"מ), subtotales, publicidad, fechas.
3. Depósitos retornables (Pfand, CRV, Statiegeld): incluir precio POSITIVO.
4. Devoluciones: incluir precio NEGATIVO.
5. Coperto italiano / Service charge UK: incluir como item (son cargos reales).
6. "N NOMBRE TOTAL" (EE.UU.): precio_unitario=TOTAL÷N.
7. Modificadores de preparación ("Over Easy", "Brown Bread"): IGNORAR.
8. NON FISCALE/PRECONTO (Italia): precuenta válida, precios correctos.
9. Propinas: incluir SOLO si aparecen en el total final pagado.
10. Precios en JSON siempre con punto decimal.

RESPONDE SOLO JSON (sin markdown):
{"restaurante":"nombre o null","moneda":"ISO_3","pais":"ISO_2_o_UNKNOWN","items":[{"nombre":"nombre original","precio_unitario":numero,"cantidad":numero}],"total":numero,"confianza":numero_0_a_1}

Si no puedes leer: {"restaurante":null,"moneda":"CLP","pais":"UNKNOWN","items":[],"total":0,"confianza":0}`;
}

// ── CAPA 4: Llamada a Claude ──────────────────────────────────────────────────
async function callClaude(apiKey, imageBase64, mediaType, system, userText, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
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

// ── CAPA 5: Reconciliación financiera ─────────────────────────────────────────
function reconcile(items, totalReported) {
  const sum = items.reduce((a,it) => a+(it.precio_unitario*(it.cantidad||1)), 0);
  if (!totalReported) return { ok:true, sum, total:sum, diff:0, ratio:0, note:null };
  const diff = totalReported - sum;
  const ratio = Math.abs(diff) / totalReported;
  let note=null, ok=true;
  if      (ratio < 0.03)                       { ok=true; }
  else if (ratio < 0.06)                       { note='Pequeña diferencia por redondeo.'; ok=true; }
  else if (diff>0&&ratio>=0.08&&ratio<=0.14)   { note=`El total incluye ~${Math.round(ratio*100)}% extra — posible service charge o propina.`; ok=false; }
  else if (diff>0&&ratio>=0.14&&ratio<=0.22)   { note=`El total incluye ~${Math.round(ratio*100)}% extra — posible impuesto no incluido.`; ok=false; }
  else if (diff<0)                              { note='La suma supera el total — posible descuento o devolución no capturada.'; ok=false; }
  else if (ratio>0.22)                          { note=`Discrepancia grande (${Math.round(ratio*100)}%) — algunos items pueden faltar.`; ok=false; }
  return { ok, sum:Math.round(sum*100)/100, total:totalReported, diff:Math.round(diff*100)/100, ratio:parseFloat(ratio.toFixed(3)), note };
}

// ── CAPA 6: Normalización ─────────────────────────────────────────────────────
function normalizeItems(items, countryCode) {
  const r = COUNTRY_RULES[countryCode] || {};
  const noDecimal = ['CLP','JPY','KRW','VND','IDR','TWD','KHR','MMK','UGX','RWF','TZS','XOF','XAF','COP'];
  const isNoDecimal = noDecimal.includes(r.currency || '');

  return items.map((it,i) => {
    let raw = it.precio_unitario ?? it.precio ?? 0;
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))      raw = parseFloat(s.replace(/\./g,'').replace(',','.'));
      else if (/^\d+,\d{1,2}$/.test(s))                raw = parseFloat(s.replace(',','.'));
      else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))  raw = parseFloat(s.replace(/,/g,''));
      else                                               raw = parseFloat(s.replace(',','.'));
    }
    if (isNaN(raw)) raw = 0;
    const precioFinal = isNoDecimal ? Math.round(raw) : Math.round(raw*100)/100;
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

  const {
    image_base64, media_type='image/jpeg',
    country_hint=null, is_confirmation=false
  } = req.body || {};

  if (!image_base64) return res.status(400).json({ error:'image_base64 requerido' });
  if (image_base64.length > 4_000_000) return res.status(413).json({ error:'Imagen muy grande. Máximo ~3MB.', code:'IMAGE_TOO_LARGE' });

  try {

    // ── RUTA A: País ya conocido (hint o confirmación) ─────────────────────
    // 1 sola llamada: imagen + prompt especializado → JSON directo
    if (country_hint) {
      const model = selectModel(country_hint);
      const system = buildUnifiedPrompt(country_hint);
      let raw;
      try {
        raw = await callClaude(apiKey, image_base64, media_type, system,
          'Extrae todos los items con sus precios de esta boleta.', model);
      } catch(e) {
        return res.status(502).json({ error:`Parsing falló: ${e.message}`, code:'PARSE_ERROR' });
      }
      return buildResponse(res, raw, country_hint, 1.0, model);
    }

    // ── RUTA B: País desconocido ───────────────────────────────────────────
    // Intentamos 1 sola llamada con prompt auto-detect (Haiku primero)
    // Si detecta país con confianza suficiente → listo
    // Si no → pedimos confirmación al usuario (sin segunda llamada a Claude)

    let raw;
    try {
      raw = await callClaude(apiKey, image_base64, media_type,
        buildAutoDetectPrompt(),
        'Detecta el país y extrae todos los items con sus precios.', MODEL_HAIKU);
    } catch(e) {
      return res.status(502).json({ error:`OCR falló: ${e.message}`, code:'OCR_ERROR' });
    }

    const parsed = parseJSON(raw);
    if (!parsed) {
      return res.status(422).json({ error:'No se pudo leer la boleta', code:'PARSE_ERROR' });
    }

    const detectedCountry = parsed.pais !== 'UNKNOWN' ? parsed.pais : null;
    const heuristic = detectCountry(
      (parsed.items||[]).map(it=>it.nombre).join(' ') + ' ' + (parsed.restaurante||'')
    );

    // Combinar confianza: lo que reportó Claude + heurísticas
    let detectionConfidence = parsed.confianza || 0.5;
    if (detectedCountry && heuristic.country === detectedCountry) {
      detectionConfidence = Math.min(detectionConfidence + 0.20, 0.95);
    }

    const candidates = heuristic.candidates;
    const dollarAmbiguous = ['CL','AR','MX','US','CA','CO'];
    const needsConfirm = !is_confirmation && (
      !detectedCountry ||
      detectionConfidence < 0.60 ||
      (dollarAmbiguous.includes(detectedCountry) && detectionConfidence < 0.72)
    );

    if (needsConfirm) {
      // No hacemos segunda llamada — devolvemos lo que ya tenemos + pedimos confirmación
      // Si el usuario confirma → RUTA A con 1 llamada Sonnet/Haiku especializada
      return res.status(200).json({
        ok: false,
        needs_confirmation: true,
        detected_country: detectedCountry,
        detected_country_name: COUNTRY_RULES[detectedCountry]?.name || null,
        confidence: detectionConfidence,
        candidates,
        // Incluir items preliminares para que el usuario los vea mientras confirma
        items_preview: parsed.items?.slice(0,3) || [],
        message: detectedCountry
          ? `Parece ser una boleta de ${COUNTRY_RULES[detectedCountry]?.name || detectedCountry} (${Math.round(detectionConfidence*100)}% certeza). ¿Es correcto?`
          : '¿De qué país es esta boleta?',
        available_countries: Object.entries(COUNTRY_RULES).map(([code,r]) => ({
          code, name:r.name, currency:r.currency, symbol:r.symbol
        }))
      });
    }

    // País detectado con suficiente confianza
    // ¿Necesita re-parseo con Sonnet? Solo si el país es complejo
    const finalCountry = detectedCountry || 'CL';
    const needsSonnet = COUNTRY_RULES[finalCountry]?.complexity === 'complex';

    if (needsSonnet) {
      // Re-parsear con Sonnet + prompt especializado para máxima precisión
      let sonnetRaw;
      try {
        sonnetRaw = await callClaude(apiKey, image_base64, media_type,
          buildUnifiedPrompt(finalCountry),
          'Extrae todos los items con sus precios de esta boleta.', MODEL_SONNET);
      } catch(e) {
        // Si Sonnet falla, usar lo que ya tenemos de Haiku
        console.warn('Sonnet falló, usando resultado de Haiku:', e.message);
        return buildResponse(res, raw, finalCountry, detectionConfidence, MODEL_HAIKU);
      }
      return buildResponse(res, sonnetRaw, finalCountry, detectionConfidence, MODEL_SONNET);
    }

    // País simple → usar resultado de Haiku directamente (0 llamadas extra)
    return buildResponse(res, raw, finalCountry, detectionConfidence, MODEL_HAIKU);

  } catch(err) {
    console.error('Pipeline error:', err);
    return res.status(500).json({ error:'Error interno', code:'INTERNAL', detail:err.message });
  }
}

// ── Helper: construir respuesta final ─────────────────────────────────────────
function buildResponse(res, rawJson, countryCode, detectionConfidence, modelUsed) {
  const parsed = parseJSON(rawJson);
  if (!parsed?.items) {
    return res.status(422).json({
      error:'No se pudieron extraer items',
      code:'PARSE_ERROR',
      raw: rawJson?.substring(0,200)
    });
  }

  const finalCountry = parsed.pais || countryCode || 'CL';
  const recon = reconcile(parsed.items, parsed.total || 0);
  const normalizedItems = normalizeItems(parsed.items, finalCountry);
  const normalizedTotal = normalizedItems.reduce((a,it) => a+it.precio_unitario*it.cantidad, 0);

  if (!normalizedItems.length) {
    return res.status(422).json({ error:'No se encontraron items válidos', code:'NO_ITEMS' });
  }

  const rules = COUNTRY_RULES[finalCountry] || {};
  const warnings = [];
  if (!recon.ok && recon.note) {
    warnings.push({ type:'financial_discrepancy', message:recon.note, severity:recon.ratio>0.20?'high':'medium' });
  }
  if (detectionConfidence < 0.80) {
    warnings.push({ type:'country_uncertain', message:`País detectado con ${Math.round(detectionConfidence*100)}% de certeza`, severity:'low' });
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
    model_used: modelUsed,
    raw_lines: (typeof rawLines !== 'undefined' ? rawLines : []),
    layout_detectado: (rules.price_format && rules.price_format !== 'standard' ? rules.price_format : null),
    reconciliation: {
      ok: recon.ok,
      note: recon.note,
      sum_items: recon.sum,
      total_boleta: recon.total,
      diff_ratio: recon.ratio
    },
    warnings
  });
}
