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

// ── BASE DE CONOCIMIENTO: 26 países ──────────────────────────────────────────
const COUNTRY_RULES = {

  // ── LATAM ─────────────────────────────────────────────────────────────────
  CL: {
    name:'Chile', currency:'CLP', symbol:'$', has_decimals:false,
    complexity:'simple',
    tax_kw:['iva','impuesto'], deposit_kw:[], refund_kw:['devolucion','anulacion'],
    tip_behavior:'none', tip_kw:[], total_kw:['total','a pagar','monto'],
    price_format:'standard', signals:['rut','sii','folio','timbre','giro'],
    format:'$ = CLP. Precios SIN decimales. IVA incluido. Filtrar items precio=0. "Propina sugerida (10%)": si el Total final impreso YA la suma (subtotal + propina = total), inclúyela como ítem "Propina" y total_referencia = ese total final; si el total no la incluye (es solo una sugerencia aparte), NO la incluyas. Decide con la aritmética (R19).'
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
    format:'$ = COP (pesos colombianos). Precios SIN decimales, punto = separador de miles: "$6.700" = 6700 COP. IPC/IVA/impoconsumo = impuestos ya incluidos en los precios, IGNORAR como ítems (si hay una línea "Valor"/"Subtotal antes de IPC" es un desglose informativo). Cargos de vajilla/cristalería = incluir como ítem real. PROPINA / SERVICIO VOLUNTARIO: si el cliente la aceptó y está SUMADA en el total final cobrado ("TOTAL CON PROPINA", "Servicio voluntario 10%" dentro del Total), inclúyela como ítem "Propina" y total_referencia = ese total FINAL (con propina). Si es solo una sugerencia que no está en el total (ej. "ADVERTENCIA PROPINA", "propina sugerida" bajo el total), NO la incluyas y el total es el impreso. Decide con la aritmética (R19): subtotal de ítems + propina = total.'
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

  // ── CROACIA ───────────────────────────────────────────────────────────────
  HR: {
    name:'Croacia', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['pdv','porez'], deposit_kw:[], refund_kw:['storno'],
    tip_behavior:'none', tip_kw:['napojnica'],
    total_kw:['ukupno','za platiti'],
    price_format:'standard',
    signals:['oib','racun','račun','pdv','ukupno','hrvatska','zagreb','split','dubrovnik','trogir','kn','hrk'],
    format:`MONEDA: boletas hasta 2022 → "kn" / HRK (kuna croata); desde 2023 → "€" / EUR.
Si ves "kn" o "HRK", moneda = "HRK"; si ves "€" o "EUR", moneda = "EUR".
Columnas: Naziv (nombre) | Količina (cantidad) | Cijena (precio UNITARIO) | Iznos
(total de línea). precio_unitario = Cijena, cantidad = Količina.
PDV (IVA 13% o 25%), "Osnovica" (base) e "Iznos poreza" son informativos y ya están
incluidos en los precios: IGNORAR como items (R2). "Ukupno" = total.
Pie con "ZKI" / "JIR" / OIB son códigos fiscales, ignorar.`
  },

  // ── SERBIA ────────────────────────────────────────────────────────────────
  RS: {
    name:'Serbia', currency:'RSD', symbol:'RSD', has_decimals:true,
    complexity:'simple',
    tax_kw:['pdv','пдв','porez','порез'], deposit_kw:[], refund_kw:['storno'],
    tip_behavior:'none', tip_kw:['napojnica'],
    total_kw:['za uplatu','за уплату','ukupno','укупно'],
    price_format:'standard',
    signals:['pib','пиб','pfr','пфр','београд','beograd','srbija','србија','novi sad','рачун','racun'],
    format:`RSD = dinar serbio ("din", "дин." o "RSD"). La letra al final de cada línea (Ђ, Е...)
es la CATEGORÍA DE IMPUESTO (Ђ = IVA 20%), NO la moneda: ignórala. Los
precios usan punto para miles y coma para decimales ("1.545,00" = 1545.00).
Boletas fiscales en cirílico: "ЗА УПЛАТУ" = total a pagar, "ГОТОВИНА" = efectivo,
"УПЛАЋЕНО" = pagado, "СБ: 20,00%" = tasa de IVA (PDV) ya incluida: IGNORAR como item.
Layout típico: el NOMBRE va en una línea y la siguiente trae "Nx PRECIO_UNITARIO ...
TOTAL_LÍNEA Ђ". precio_unitario = el precio tras "Nx", cantidad = N; el total de línea
es N × unitario (verifícalo).`
  },

  // ── PAKISTÁN ──────────────────────────────────────────────────────────────
  PK: {
    name:'Pakistán', currency:'PKR', symbol:'Rs', has_decimals:true,
    complexity:'simple',
    tax_kw:['sales tax','gst','pra','fbr'], deposit_kw:[], refund_kw:['refund','void'],
    tip_behavior:'none', tip_kw:['service charges','service charge','tip'],
    total_kw:['total','grand total','net total'],
    price_format:'standard',
    signals:['pkr','rs.','rs ','pakistan','lahore','karachi','islamabad','ntn','strn','pra','fbr'],
    format:`PKR = rupia pakistaní ("Rs", "Rs." o PKR). Formato "1,340.00" (coma = miles,
punto = decimal). Filas "Qty  Nombre  @unitario  Importe". "Add Sales Tax @13%" /
"GST" es impuesto SUMADO encima del subtotal: NO es ítem (R2), el sistema lo agrega
al reconciliar con el total final. La tasa varía (5%, 13%, 15%) según ciudad y forma de pago.
Si hay un subtotal ("Price", "Net Amount", "Sub Total") y más abajo un "Grand Total (Incl. GST)" mayor,
total_referencia = el Grand Total (el monto final), NO el subtotal. Líneas con cantidad negativa son anulaciones (R17).
"Duplicate Receipt" es una copia de la misma boleta: leerla normalmente.`
  },

  // ── IRLANDA ───────────────────────────────────────────────────────────────
  IE: {
    name:'Irlanda', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat'], deposit_kw:['deposit return scheme','drs','deposit'], refund_kw:['refund'],
    tip_behavior:'optional', tip_kw:['service charge','tip','gratuity'],
    total_kw:['total','amount due'],
    price_format:'standard',
    signals:['vat reg','vat no','vat #','deposit return scheme','dublin','cork','galway','ireland','eircode'],
    format:`€ = EUR. VAT (23% general, 13,5% comida, 9%) YA incluido en los precios,
"Sales 23% incl. / VAT @ 23%" son desgloses informativos: IGNORAR (R2).
"Deposit Return Scheme" (DRS, desde 2024, ~0,15-0,45 en envases) SÍ se cobra: incluirlo
como ítem positivo (R3). "Recommended 10% service charge" / "Service charge NOT included"
es solo una sugerencia: no es ítem. Un "TOTAL" escrito a mano con propina es voluntario
(R16): usar el total impreso. Cuando la línea trae solo el importe ("3 x Coke 7.50"),
es el total de la línea: precio_unitario = total ÷ cantidad. Encabezados "===Starter==="
y texto en chino bajo los ítems no son ítems.`
  },

  // ── MALASIA ───────────────────────────────────────────────────────────────
  MY: {
    name:'Malasia', currency:'MYR', symbol:'RM', has_decimals:true,
    complexity:'simple',
    tax_kw:['sst','service tax'], deposit_kw:[], refund_kw:['refund','void'],
    tip_behavior:'mandatory_service_charge', tip_kw:['service charge','service charges'],
    total_kw:['net total','total(rm)','grand total'],
    price_format:'standard',
    signals:['rm','myr','sst#','sdn bhd','kuala lumpur','penang','georgetown','malaysia','rounding adjustment'],
    format:`RM = MYR (ringgit malayo). Filas "Qty @ precio_unitario  Importe" (ej. "2.00 @ 25.00  50.00").
Una línea con qty/importe ilegible o "0.00" (a veces el 0 inicial se corta y queda ".00") cuesta
CERO: excluirla (R1); verifica con "Bill Amount"/"Sub Total", que debe ser la suma de los ítems.
"Service Charges" (10%) es obligatorio: incluirlo como ítem "Service Charges". "SST" (6%/8%) se SUMA encima
(se calcula sobre subtotal + servicio) y NO es ítem: el sistema lo agrega al reconciliar con el total.
"Rounding Adjustment" se ignora. total_referencia = "Net Total(RM)", el monto final.`
  },

  // ── NAMIBIA ───────────────────────────────────────────────────────────────
  NA: {
    name:'Namibia', currency:'NAD', symbol:'N$', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'none', tip_kw:['tip','gratuity'],
    total_kw:['total due','grand total','total'],
    price_format:'standard',
    signals:['namibia','windhoek','swakopmund','nad','n$','vat reg'],
    format:`N$ = NAD (dólar namibio), a la par del rand sudafricano. VAT 15%
incluido en los precios, IGNORAR como item (R2). Filas tipo "NOMBRE / @ precio /
QTY / PRICE": el "@ precio" es el unitario y la última columna el total de línea.
Items con precio 0.00 (ej. pan de cortesía) → excluir (R1). "TIP: ....." en blanco
y un "GRAND TOTAL" escrito a mano es una propina voluntaria: no es ítem, usar el
"TOTAL DUE" impreso como total_referencia (R16).`
  },

  // ── SUDÁFRICA ─────────────────────────────────────────────────────────────
  ZA: {
    name:'Sudáfrica', currency:'ZAR', symbol:'R', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'none', tip_kw:['gratuity','tip','service'],
    total_kw:['total','bill total'],
    price_format:'standard',
    signals:['vat#','tax invoice','pro-forma invoice','covers','rand','south africa','sudafrica','randburg','johannesburg','cape town','durban'],
    format:`R = ZAR (rand sudafricano) — no confundir con otras monedas que
también usan "R" como símbolo. VAT (14-15% según la fecha) normalmente
incluido en los precios, IGNORAR como item (R2).
"n/c" junto a un item (ej. "Fettuccini ... n/c") = "no charge", precio 0 →
excluir (R1).
CASO OBSERVADO: algunas boletas traen una "Gratuity" y un "Total" escritos
A MANO debajo del total impreso (ej. total impreso $769, abajo a mano
"Gratuity: 81 / Total: 850"). Es una propina voluntaria: NO incluirla como
item y usar el total impreso (769) como total_referencia (ver R16).`
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

  // ── ALBANIA ───────────────────────────────────────────────────────────────
  AL: {
    name:'Albania', currency:'ALL', symbol:'Lek', has_decimals:false,
    complexity:'complex',  // punto=miles no decimal, cantidades fraccionarias, ventas por kg
    tax_kw:['tvsh'], deposit_kw:[], refund_kw:[],
    tip_behavior:'optional_explicit', tip_kw:['sherbim','shperblim per stafin','bakshish'],
    total_kw:['total','totali','total lek','vlera me tvsh','paguar','para ne dore'],
    price_format:'standard',
    signals:['nipt','fature tatimore','fature tatimore shitje','kupon tatimor','lek','lekë','tirane','tirana','shqiperia','albania','vlore'],
    format:`ALL = Lekë (lek albanés). SIN decimales reales: el punto es separador
de MILES, no decimal — "1.300" = 1300 Lek, "8.333,33" es la excepción rara
(precio por fracción de kg, ver abajo), no una regla general.
TVSH = IVA albanés (típicamente 20%), IGNORAR siempre.
"Fature Tatimore" / "Fature Tatimore Shitje" / "Kupon Tatimor" son todos
nombres válidos de boleta fiscal (misma función, distintos negocios).
Columnas típicas: Emërtimi/Përshkrimi/Artikulli (nombre) | Sasia (cantidad) |
Çmimi (precio unitario) | Vlera/Totali/Total (total de línea).
Cantidad a veces es fraccionaria: "2.5 X 700,00" = 2.5 unidades (ej. copas
de vino servidas de una botella) — no redondear a 2 o 3.
Ventas por peso ("ME KG" = por kg): la fila trae peso en kg como "cantidad"
(ej. "0,08") y el precio ya corresponde a esa fracción — si la aritmética
no cierra limpio, preferir el precio_unitario que sí reconcilie con el
total de línea antes que inventar un recálculo; marcar confianza baja si
no es claro, no rehusar la boleta por esto.
Servicio/propina ("shperblim per stafin e kamarereve", típicamente ~6%)
es sugerido en algunas boletas — igual que cualquier propina sugerida,
incluir SOLO si quedó sumada al total final cobrado (ver R9).`
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
4. Extrae cada ítem con su precio_unitario, cantidad y confianza (y evidencia solo si confianza < 0.80).
5. Verifica que la suma de tus ítems sea coherente con el total declarado;
   si hay diferencia, refleja eso en confianza_global pero NO inventes ítems
   para cuadrar (el sistema externo se encarga de la reconciliación).

═══════════════════════════════════════════════════════════════════════════════
REGLAS UNIVERSALES (R1-R20)
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
     ese 7280 es el subtotal).

R20. CÓDIGOS DE ÍTEM: no incluyas el código numérico del producto al inicio del
     nombre ("2201 KABULI PULLAO" → nombre "KABULI PULLAO").

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
{"ok":true,"restaurante":"nombre o null","pos_detected":"touchbistro|toast|square|clover|lightspeed|tpv_es|nfe_br|sii_cl|generic|unknown","pais":"ISO_2_o_UNKNOWN","moneda":"ISO_3_o_AMBIGUOUS_DOLLAR_o_AMBIGUOUS_YEN","monedas_candidatas":[],"items":[{"nombre":"Coffee","precio_unitario":4.00,"cantidad":3,"confianza":0.95},{"nombre":"Cake","precio_unitario":6.50,"cantidad":1,"confianza":0.65,"evidencia":"Cke 6.5"}],"items_dudosos":[],"total_referencia":18.50,"razonamiento":"máx. 12 palabras","confianza_global":0.92}
Escribe el JSON compacto en una sola línea, sin espacios ni saltos de línea de más, y sin texto fuera del JSON.

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
  const timeoutId  = setTimeout(() => controller.abort(), 50000);

  // El system prompt (reglas R1-R15 + perfil de país) es idéntico entre llamadas
  // del mismo país: se marca como cacheable para pagar ~10% del input en hits.
  const systemBlocks = [{ type:'text', text: system, cache_control:{ type:'ephemeral' } }];

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
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        temperature: 0,
        system: systemBlocks,
        messages: [{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:mediaType, data:imageBase64 }},
          { type:'text', text:userText }
        ]}]
      })
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
      body: JSON.stringify({
        model, max_tokens: 3000, temperature: 0, system: systemBlocks,
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
        body: JSON.stringify({ model, max_tokens:3000, temperature:0, system: systemBlocks,
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
  if (d.usage) {
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
// Países donde el impuesto se suma ENCIMA del subtotal con tasa alta (ej. PK: 13% sobre ítems)
const TAX_ON_TOP_HIGH           = new Set(['PK','MY']);

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
  if (((ratio >= 0.06 && ratio <= 0.08 && TAX_COUNTRIES.has(countryCode)) || (ratio >= 0.04 && ratio <= 0.15 && TAX_ON_TOP_HIGH.has(countryCode))) && !(TAX_ON_TOP_HIGH.has(countryCode) ? hasTax : hasServicio)) {
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
  const NO_DECIMAL = new Set(['CLP','JPY','KRW','VND','IDR','TWD','KHR','MMK',
    'UGX','RWF','TZS','XOF','XAF','COP','PYG','HUF','ISK','ALL']);
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
export default async function handler(req, res) {
  const startMs = Date.now();

  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) > -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-App-Secret');
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

  // El cliente permite "traer tu propia key" (BYOK) — por eso el fallback a
  // req.body.api_key no se elimina del todo, sería un cambio de producto, no
  // un fix de seguridad. Lo que sí se agrega es: (a) validar el formato acá
  // en el server, ya que la validación del cliente es trivial de saltarse, y
  // (b) las capas de arriba (origin allow-list, secreto compartido, rate
  // limit) para que esto no sea un relay anónimo abierto hacia la API de
  // Anthropic para cualquiera en internet, use la key que use.
  const apiKey = process.env.ANTHROPIC_API_KEY || req.body?.api_key;
  if (!apiKey) return res.status(500).json({ error:'API key no configurada', code:'NO_KEY' });
  if (typeof apiKey !== 'string' || !apiKey.startsWith('sk-ant-')) {
    return res.status(400).json({ error:'Formato de API key inválido', code:'BAD_KEY_FORMAT' });
  }

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
      console.error('OCR call failed:', e);
      return res.status(502).json({ error:'No se pudo procesar la boleta con el servicio de OCR.', code:'OCR_ERROR' });
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
    return res.status(500).json({ error:'Error interno', code:'INTERNAL' });
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
