// api/scan-receipt.js — DiviCuenta v5
// Arquitectura diseñada por Claude Opus 4.7 — spec: divicuenta_ocr_v5_spec.md
// 1 sola llamada a Sonnet (siempre) — prompt universal R1-R15 + perfil de país inyectado
// Confidence + evidence por ítem — auto-fix transparente — schema de eval en Supabase

// ── MODELO ────────────────────────────────────────────────────────────────────
const MODEL_SONNET  = 'claude-sonnet-4-6';
const PROMPT_VERSION = process.env.PROMPT_VERSION || 'v5.0.0';

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

  // ── TURQUÍA ────────────────────────────────────────────────────────────────
  TR: {
    name:'Turquía', currency:'TRY', symbol:'₺', has_decimals:true,
    complexity:'simple',
    tax_kw:['kdv','vergi','k.d.v'],
    deposit_kw:[],
    refund_kw:['iade'],
    tip_behavior:'none',
    tip_kw:[],
    total_kw:['toplam','genel toplam','ödenecek tutar'],
    price_format:'tr_adedi_tutar',
    signals:['tl','try','kdv','toplam','fiş','fatura','yemek bedeli','icecek bedeli','garson','masa'],
    format:`TRY = ₺ (lira turca). Decimal con coma: "8,00"=8.00.
FORMATO TURCO: columnas son Cinsi(nombre) | Adedi(cantidad) | Tutar(precio_total_línea).
- Tutar ES el precio total de la línea completa. precio_unitario = Tutar ÷ Adedi.
- Ejemplo: "1/2 Deniz Borulcesi  2  18,00" → precio_unitario=9.00, cantidad=2
- Kuver = cargo de cubierto por persona, INCLUIRLO como item positivo.
- Yemek Bedeli = subtotal comidas → IGNORAR (es resumen, no producto).
- Icecek Bedeli = subtotal bebidas → IGNORAR (es resumen, no producto).
- KDV = IVA turco → IGNORAR.
- Toplam = total final correcto.
- Nombres de items en turco, mantenerlos como están.`
  },

  // ── GRECIA ────────────────────────────────────────────────────────────────
  GR: {
    name:'Grecia', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['φπα','fpa','vat'],
    deposit_kw:[],
    refund_kw:[],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['σύνολο','synolo','total'],
    price_format:'standard',
    signals:['αφμ','φπα','ελλάδα','greece','eur'],
    format:'EUR. ΦΠΑ = IVA griego, ignorar. Decimal con coma.'
  },

  // ── POLONIA ───────────────────────────────────────────────────────────────
  PL: {
    name:'Polonia', currency:'PLN', symbol:'zł', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','podatek'],
    deposit_kw:[],
    refund_kw:['zwrot'],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['suma','razem','do zapłaty'],
    price_format:'standard',
    signals:['pln','zł','nip','paragon','vat'],
    format:'PLN = złoty. Decimal con coma. VAT incluido.'
  },

  // ── REPÚBLICA CHECA ───────────────────────────────────────────────────────
  CZ: {
    name:'Rep. Checa', currency:'CZK', symbol:'Kč', has_decimals:true,
    complexity:'simple',
    tax_kw:['dph','dan'],
    deposit_kw:[],
    refund_kw:[],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['celkem','k úhradě','celková'],
    price_format:'standard',
    signals:['czk','kč','dph','ico','dic'],
    format:'CZK = coronas checas. DPH = IVA, ignorar.'
  },

  // ── HUNGRÍA ───────────────────────────────────────────────────────────────
  HU: {
    name:'Hungría', currency:'HUF', symbol:'Ft', has_decimals:false,
    complexity:'simple',
    tax_kw:['áfa','adó'],
    deposit_kw:[],
    refund_kw:[],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['összesen','fizetendő','végösszeg'],
    price_format:'standard',
    signals:['huf','ft','áfa','adószám'],
    format:'HUF = forintos. Sin decimales. ÁFA = IVA, ignorar.'
  },

  // ── SUECIA / NORUEGA / DINAMARCA ─────────────────────────────────────────
  SE: {
    name:'Suecia', currency:'SEK', symbol:'kr', has_decimals:true,
    complexity:'simple',
    tax_kw:['moms','skatt'],
    deposit_kw:['pant'],
    refund_kw:['retur'],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['totalt','att betala','summa'],
    price_format:'standard',
    signals:['sek','kr','moms','org.nr','kvitto','stockholm','göteborg','malmö'],
    format:'SEK = coronas suecas. Moms = IVA, ignorar. Pant = depósito retornable.'
  },

  NO: {
    name:'Noruega', currency:'NOK', symbol:'kr', has_decimals:true,
    complexity:'simple',
    tax_kw:['mva','avgift'],
    deposit_kw:[],
    refund_kw:[],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['totalt','å betale','sum'],
    price_format:'standard',
    signals:['nok','mva','orgnr','oslo','bergen'],
    format:'NOK = coronas noruegas. MVA = IVA, ignorar.'
  },

  DK: {
    name:'Dinamarca', currency:'DKK', symbol:'kr', has_decimals:true,
    complexity:'simple',
    tax_kw:['moms','afgift'],
    deposit_kw:['pant'],
    refund_kw:[],
    tip_behavior:'rounding',
    tip_kw:[],
    total_kw:['i alt','total','betales'],
    price_format:'standard',
    signals:['dkk','moms','cvr','københavn','aarhus'],
    format:'DKK = coronas danesas. Moms = IVA, ignorar.'
  },

  // ── MÉXICO / LATAM adicionales ────────────────────────────────────────────
  UY: {
    name:'Uruguay', currency:'UYU', symbol:'$', has_decimals:true,
    complexity:'simple',
    tax_kw:['iva','impuesto'],
    deposit_kw:[], refund_kw:[],
    tip_behavior:'none', tip_kw:[],
    total_kw:['total','a pagar'],
    price_format:'standard',
    signals:['rut','dgi','uruguay','montevideo','uyu'],
    format:'UYU = pesos uruguayos. $ = UYU. IVA incluido.'
  },

  PY: {
    name:'Paraguay', currency:'PYG', symbol:'₲', has_decimals:false,
    complexity:'simple',
    tax_kw:['iva','impuesto'],
    deposit_kw:[], refund_kw:[],
    tip_behavior:'none', tip_kw:[],
    total_kw:['total','a pagar'],
    price_format:'standard',
    signals:['ruc','set','paraguay','asuncion','pyg','₲'],
    format:'PYG = guaraníes. Sin decimales. IVA incluido.'
  },
};

// ── Selección de modelo — siempre Sonnet hasta tener corpus de eval validado ──
// (Opus 4.7 spec: "Con 0 usuarios, el riesgo de marcar mal complexity:simple
//  es mayor que el ahorro. Cuando tengas datos, mover países simples a Haiku.")
function selectModel() {
  return MODEL_SONNET;
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
function buildV5Prompt(countryCode) {
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

  return `Eres un experto mundial en lectura de boletas de pago de cualquier país. Tu objetivo
es extraer los ítems facturados con precisión, marcando tu nivel de confianza por
cada ítem. NUNCA inventas datos: cuando algo es ilegible o ambiguo, lo marcas con
confianza baja o rehúsas la boleta completa según los criterios definidos abajo.

═══════════════════════════════════════════════════════════════════════════════
CONTEXTO INYECTADO POR EL SISTEMA
═══════════════════════════════════════════════════════════════════════════════
${countryBlock}

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
4. Extrae cada ítem con su precio_unitario, cantidad, confianza y evidencia.
5. Verifica que la suma de tus ítems sea coherente con el total declarado;
   si hay diferencia, refleja eso en confianza_global pero NO inventes ítems
   para cuadrar (el sistema externo se encarga de la reconciliación).

═══════════════════════════════════════════════════════════════════════════════
REGLAS UNIVERSALES (R1-R15)
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
      final NO la incluye → IGNORAR.
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

R14. EVIDENCIA POR ÍTEM: En el campo evidencia, copia LITERAL la línea de la
     boleta donde leíste el ítem. Es la cita textual cruda.

R15. PRECUENTAS Y BOLETAS NO FISCALES SON VÁLIDAS: "NON FISCALE", "PRECONTO",
     "CUENTA", "PRECUENTA", "Bill", "Check" son boletas válidas.

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
{"ok":true,"restaurante":"nombre o null","pos_detected":"touchbistro|toast|square|clover|lightspeed|tpv_es|nfe_br|sii_cl|generic|unknown","pais":"ISO_2_o_UNKNOWN","moneda":"ISO_3_o_AMBIGUOUS_DOLLAR_o_AMBIGUOUS_YEN","monedas_candidatas":[],"items":[{"nombre":"ítem","precio_unitario":4.00,"cantidad":3,"confianza":0.95,"evidencia":"3 Coffee $12.00"}],"items_dudosos":[],"total_referencia":12.00,"razonamiento":"1-2 líneas sobre layout y decisiones clave","confianza_global":0.92}

Caso refusal:
{"ok":false,"reason":"illegible_image|not_a_receipt|unknown_currency","message":"Mensaje al usuario","candidates":[]}`;
}

// Alias para compatibilidad con código existente que llama buildAutoDetectPrompt
function buildAutoDetectPrompt() { return buildV5Prompt(null); }
function buildUnifiedPrompt(cc)   { return buildV5Prompt(cc); }
function buildGenericPrompt()     { return buildV5Prompt(null); }

// ── CAPA 4: Llamada a Claude ──────────────────────────────────────────────────
// Timeout 8s (Vercel hard limit = 10s; dejamos margen para parse + log Supabase)
// Retry: 1 solo en errores transitorios 5xx. NUNCA en timeout.
async function callClaude(apiKey, imageBase64, mediaType, system, userText, model) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 8000);

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'anthropic-beta':     'prompt-caching-2024-07-31'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
          { type:'text', text:userText }
        ]}]
      })
    });
  } catch(e) {
    clearTimeout(timeoutId);
    if(e.name === 'AbortError') {
      throw new Error('TIMEOUT: La llamada a Claude tardó más de 8 segundos');
    }
    // Retry una vez en errores de red transitorios
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model, max_tokens: 1500, system,
        messages: [{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
          { type:'text', text:userText }
        ]}]
      })
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
        body: JSON.stringify({ model, max_tokens:1500, system,
          messages:[{ role:'user', content:[
            { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
            { type:'text', text:userText }
          ]}]
        })
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

  // 3-6%: warning leve, no crear ítem
  if (ratio < 0.06) {
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

  // confianza_global baja → no auto-fix (lectura dudosa)
  const globalConf = items.length > 0
    ? items.reduce((s,it) => s+(it.confianza||0.8), 0) / items.length : 0;
  if (globalConf < 0.70) {
    return { ok:false, sum, total:totalReported, diff, ratio,
      note:'Lectura con baja confianza — diferencia no resuelta. Revisa los ítems.', auto_fixed:false };
  }

  // 6-8%: impuesto (US/CA solo)
  if (ratio >= 0.06 && ratio <= 0.08 && TAX_COUNTRIES.has(countryCode) && !hasServicio) {
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

// ── PIPELINE PRINCIPAL v5 ────────────────────────────────────────────────────
export default async function handler(req, res) {
  const startMs = Date.now();

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
  if (image_base64.length > 4_000_000) return res.status(413).json({
    error:'Imagen muy grande. Máximo ~3MB.', code:'IMAGE_TOO_LARGE' });

  try {
    // Una sola llamada. Siempre Sonnet. Prompt v5 con perfil del país inyectado.
    const model  = selectModel();
    const system = buildV5Prompt(country_hint || null);
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
      return res.status(502).json({ error:`OCR falló: ${e.message}`, code:'OCR_ERROR' });
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
    const currency     = parsed.moneda || COUNTRY_RULES[finalCountry]?.currency || 'CLP';

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
    const normalizedBase = normalizeItems(parsed.items || [], currency);
    const recon          = reconcile(normalizedBase, parsed.total_referencia || 0, finalCountry);

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
      moneda: currency, model_used: model,
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
      confianza_global:    Math.round(confianzaGlobal * 100) / 100,
      model_used:          model,
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
        user_message:      recon.user_message || null
      },
      warnings
    });

  } catch(err) {
    console.error('Pipeline error:', err);
    return res.status(500).json({ error:'Error interno', code:'INTERNAL', detail:err.message });
  }
}

// ── Helper: normalizar ítem auto-creado ──────────────────────────────────────
function normalizeAutoFix(fix, currency) {
  return {
    nombre:           fix.nombre,
    precio_unitario:  normalizePrice(fix.precio_unitario, currency),
    cantidad:         1,
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
  const NO_DEC = new Set(['CLP','JPY','KRW','VND','IDR','TWD','KHR','MMK',
    'UGX','RWF','TZS','XOF','XAF','COP','ISK','HUF','IRR','IQD','LBP','SYP','PYG']);
  return NO_DEC.has(currency) ? Math.round(val) : Math.round(val * 100) / 100;
}
