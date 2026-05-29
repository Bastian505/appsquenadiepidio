// country-rules.js
// Base de conocimiento fiscal por país
// Datos puros — no prompts gigantes, no lógica de negocio aquí

export const COUNTRY_RULES = {

  // ── LATAM ──────────────────────────────────────────────────────────────────

  CL: {
    name: 'Chile',
    currency: 'CLP',
    symbol: '$',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: false,
    tax_included: true,
    tax_keywords: ['iva', 'impuesto'],
    discount_keywords: ['descuento', 'dcto', 'promo', 'oferta'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: ['devolucion', 'anulacion'],
    total_keywords: ['total', 'a pagar', 'monto'],
    subtotal_keywords: ['subtotal', 'neto'],
    tip_behavior: 'none',
    // Señales de identificación en la boleta
    signals: ['rut', 'sii', 'folio', 'timbre', 'giro'],
    format_notes: 'Precios sin decimales. Punto como separador de miles. IVA incluido en precio.'
  },

  AR: {
    name: 'Argentina',
    currency: 'ARS',
    symbol: '$',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['iva', 'impuesto', 'percepciones'],
    discount_keywords: ['descuento', 'dcto', 'bonificacion'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: [],
    total_keywords: ['total', 'importe total', 'a pagar'],
    subtotal_keywords: ['subtotal', 'subtotales'],
    tip_behavior: 'none',
    signals: ['cuit', 'afip', 'factura a', 'factura b', 'ticket', 'pos'],
    format_notes: 'Precios con 2 decimales. $ = ARS siempre, nunca USD. Precios altos por inflacion son normales.'
  },

  MX: {
    name: 'México',
    currency: 'MXN',
    symbol: '$',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['iva', 'impuesto', 'ieps'],
    discount_keywords: ['descuento', 'promo'],
    tip_keywords: ['propina', 'servicio'],
    deposit_keywords: [],
    refund_keywords: [],
    total_keywords: ['total', 'importe'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'optional',
    signals: ['rfc', 'sat', 'cfdi', 'uuid', 'folio fiscal'],
    format_notes: '$ = MXN. IVA del 16% se suma al subtotal. Propina opcional no incluida.'
  },

  CO: {
    name: 'Colombia',
    currency: 'COP',
    symbol: '$',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: false,
    tax_included: false,
    tax_keywords: ['iva', 'impuesto', 'impoconsumo'],
    discount_keywords: ['descuento', 'dcto'],
    tip_keywords: ['propina', 'servicio'],
    deposit_keywords: [],
    refund_keywords: [],
    total_keywords: ['total', 'valor total', 'a pagar'],
    subtotal_keywords: ['subtotal', 'subtotales'],
    tip_behavior: 'optional',
    signals: ['nit', 'dian', 'cufe'],
    format_notes: '$ = COP. Precios altos normales. IVA 19% separado del subtotal.'
  },

  PE: {
    name: 'Perú',
    currency: 'PEN',
    symbol: 'S/',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['igv', 'impuesto', 'tributo'],
    discount_keywords: ['descuento', 'dscto'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: [],
    total_keywords: ['total', 'importe total', 'precio total'],
    subtotal_keywords: ['sub total', 'subtotal', 'op. gravada'],
    tip_behavior: 'none',
    signals: ['ruc', 'sunat', 'boleta de venta', 'factura electronica'],
    format_notes: 'S/ = soles. IGV (18%) incluido en precio. Sin propina.'
  },

  BR: {
    name: 'Brasil',
    currency: 'BRL',
    symbol: 'R$',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['icms', 'pis', 'cofins', 'ipi', 'iss', 'impostos'],
    discount_keywords: ['desconto', 'descto', 'promocao'],
    tip_keywords: ['gorjeta', 'servico'],
    deposit_keywords: [],
    refund_keywords: ['devolucao', 'cancelamento'],
    total_keywords: ['total', 'valor total', 'a pagar'],
    subtotal_keywords: ['subtotal', 'sub total'],
    tip_behavior: 'optional_10_percent',
    signals: ['cnpj', 'cpf', 'nfe', 'danfe', 'nota fiscal', 'cfop'],
    format_notes: 'R$ = reales. Decimal con coma: "28,50" = 28.50. Gorjeta 10% opcional frecuente en restaurantes.'
  },

  // ── EUROPA ─────────────────────────────────────────────────────────────────

  DE: {
    name: 'Alemania',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['mwst', 'ust', 'steuer', 'mehrwertsteuer'],
    discount_keywords: ['rabatt', 'rabat', 'ermaessigung'],
    tip_keywords: ['trinkgeld'],
    deposit_keywords: ['pfand', 'leergut'],
    refund_keywords: ['pfandruckgabe', 'pfandrückgabe', 'rueckgabe'],
    total_keywords: ['zu zahlen', 'summe', 'gesamt', 'total', 'brutto'],
    subtotal_keywords: ['netto', 'zwischensumme'],
    tip_behavior: 'rounding',
    signals: ['mwst', 'ust-idnr', 'steuernummer', 'eur'],
    // Regla especial: formato "precio x cantidad = total"
    // Siempre usar el total (último número de la línea)
    price_format: 'unit_x_qty_equals_total',
    format_notes: 'EUR. Decimal con coma. Pfand = deposito retornable (incluir). Pfandrückgabe = devolucion (precio NEGATIVO). MWST = impuesto (ignorar). Formato: "0,29 x 6 = 1,74" → usar 1.74 como precio total, cantidad=1.'
  },

  ES: {
    name: 'España',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['iva', 'impuesto', 'base imponible'],
    discount_keywords: ['descuento', 'dto', 'promo'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: ['devolucion', 'abono'],
    total_keywords: ['total', 'importe total', 'a pagar'],
    subtotal_keywords: ['subtotal', 'base'],
    tip_behavior: 'rounding',
    signals: ['nif', 'cif', 'ticket', 'factura simplificada', 'iva'],
    format_notes: 'EUR. IVA incluido. Sin propina obligatoria.'
  },

  FR: {
    name: 'Francia',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: ' ',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['tva', 'taxe', 'taxes'],
    discount_keywords: ['remise', 'reduction', 'promo'],
    tip_keywords: ['pourboire', 'service'],
    deposit_keywords: ['consigne'],
    refund_keywords: ['remboursement'],
    total_keywords: ['total', 'montant total', 'a payer', 'solde'],
    subtotal_keywords: ['sous-total', 'ht', 'hors taxe'],
    tip_behavior: 'included_service',
    signals: ['siret', 'siren', 'tva', 'tpe'],
    format_notes: 'EUR. TVA incluida. Servicio 10-15% ya incluido en restaurantes.'
  },

  GB: {
    name: 'Reino Unido',
    currency: 'GBP',
    symbol: '£',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['vat', 'tax'],
    discount_keywords: ['discount', 'offer', 'promo', 'sale'],
    tip_keywords: ['tip', 'gratuity', 'service charge'],
    deposit_keywords: [],
    refund_keywords: ['refund', 'return'],
    total_keywords: ['total', 'amount due', 'balance due', 'to pay'],
    subtotal_keywords: ['subtotal', 'net', 'ex vat'],
    tip_behavior: 'optional_service_charge',
    signals: ['vat reg', 'vat no', 'company no', 'gbp', '£'],
    format_notes: '£ = GBP. VAT 20% incluido. Service charge opcional 10-12.5%.'
  },

  IT: {
    name: 'Italia',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['iva', 'imposta', 'tassa'],
    discount_keywords: ['sconto', 'sconti', 'offerta'],
    tip_keywords: ['mancia', 'coperto'],
    deposit_keywords: [],
    refund_keywords: ['rimborso', 'reso'],
    total_keywords: ['totale', 'importo totale', 'da pagare'],
    subtotal_keywords: ['subtotale', 'imponibile'],
    tip_behavior: 'coperto_charge',
    signals: ['p.iva', 'codice fiscale', 'scontrino', 'ricevuta fiscale'],
    format_notes: 'EUR. IVA incluida. "Coperto" = cargo por cubierto (incluir).'
  },

  PT: {
    name: 'Portugal',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['iva', 'imposto'],
    discount_keywords: ['desconto', 'promocao'],
    tip_keywords: ['gorjeta'],
    deposit_keywords: [],
    refund_keywords: ['devolucao'],
    total_keywords: ['total', 'a pagar', 'valor total'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'optional',
    signals: ['nif', 'nipc', 'fatura', 'recibo'],
    format_notes: 'EUR. IVA incluido.'
  },

  NL: {
    name: 'Países Bajos',
    currency: 'EUR',
    symbol: '€',
    decimal_separator: ',',
    thousand_separator: '.',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['btw', 'belasting'],
    discount_keywords: ['korting', 'aanbieding'],
    tip_keywords: ['fooi'],
    deposit_keywords: ['statiegeld'],
    refund_keywords: ['retour', 'terugbetaling'],
    total_keywords: ['totaal', 'te betalen', 'subtotaal'],
    subtotal_keywords: ['subtotaal', 'excl btw'],
    tip_behavior: 'rounding',
    signals: ['btw', 'kvk', 'eur'],
    format_notes: 'EUR. BTW = IVA holandés (incluido). Statiegeld = deposito retornable.'
  },

  CH: {
    name: 'Suiza',
    currency: 'CHF',
    symbol: 'Fr',
    decimal_separator: '.',
    thousand_separator: "'",
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['mwst', 'tva', 'iva', 'usp'],
    discount_keywords: ['rabatt', 'remise', 'sconto'],
    tip_keywords: ['trinkgeld', 'pourboire'],
    deposit_keywords: ['depot', 'pfand'],
    refund_keywords: ['ruckgabe', 'retour'],
    total_keywords: ['total', 'gesamt', 'summe', 'a payer'],
    subtotal_keywords: ['zwischensumme', 'sous-total'],
    tip_behavior: 'rounding',
    signals: ['chf', 'mwst', 'uid', 'mehrwertsteuer'],
    format_notes: 'CHF = francos suizos. Decimal con punto. Separador de miles con apostrofe.'
  },

  // ── NORTEAMÉRICA ───────────────────────────────────────────────────────────

  US: {
    name: 'Estados Unidos',
    currency: 'USD',
    symbol: '$',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['tax', 'sales tax', 'state tax', 'local tax'],
    discount_keywords: ['discount', 'coupon', 'promo', 'deal', 'off'],
    tip_keywords: ['tip', 'gratuity', 'suggested tip'],
    deposit_keywords: ['deposit', 'bottle deposit', 'crv'],
    refund_keywords: ['refund', 'void', 'comp'],
    total_keywords: ['total', 'amount due', 'balance', 'grand total'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'mandatory_suggestion',
    // CRÍTICO: En EE.UU el tip es PARTE del pago real, incluirlo si está en la boleta
    tip_is_payment: true,
    signals: ['sales tax', 'gratuity', 'usd', 'server:', 'table:'],
    format_notes: 'USD. Tax NO incluido en precios, se suma al subtotal. Tip sugerido 15-20-25% — incluirlo si está en el total final. $ = USD siempre.'
  },

  CA: {
    name: 'Canadá',
    currency: 'CAD',
    symbol: '$',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['gst', 'hst', 'pst', 'qst', 'tax'],
    discount_keywords: ['discount', 'sale', 'promo'],
    tip_keywords: ['tip', 'gratuity'],
    deposit_keywords: ['deposit', 'enviro fee'],
    refund_keywords: ['refund', 'return'],
    total_keywords: ['total', 'amount due', 'balance due'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'mandatory_suggestion',
    tip_is_payment: true,
    signals: ['gst', 'hst', 'reg no', 'cad'],
    format_notes: 'CAD. GST/HST/PST no incluidos. $ = CAD. Tip obligatorio en práctica 15-20%.'
  },

  // ── ASIA ───────────────────────────────────────────────────────────────────

  JP: {
    name: 'Japón',
    currency: 'JPY',
    symbol: '¥',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: false,
    tax_included: true,
    tax_keywords: ['消費税', '内税', '税込', '標準税率', '軽減税率', 'zei'],
    discount_keywords: ['割引', '値引', '特価', 'sale'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: ['返金', '払戻'],
    total_keywords: ['合計', '合計金額', '小計', '税込合計', 'total', 'お支払'],
    subtotal_keywords: ['小計'],
    tip_behavior: 'none',
    signals: ['円', '¥', '消費税', '領収書', 'レシート'],
    format_notes: 'JPY. Sin decimales. Impuesto 10% ya incluido (税込). Propina es ofensiva culturalmente. Separador de miles con coma pero precios son enteros.'
  },

  CN: {
    name: 'China',
    currency: 'CNY',
    symbol: '¥',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['增值税', '税', 'vat'],
    discount_keywords: ['折扣', '优惠', '特价', '打折'],
    tip_keywords: [],
    deposit_keywords: ['押金'],
    refund_keywords: ['退款', '退货'],
    total_keywords: ['合计', '总计', '应付', '实付', 'total'],
    subtotal_keywords: ['小计'],
    tip_behavior: 'none',
    signals: ['元', 'rmb', 'cny', '人民币', '发票'],
    format_notes: 'CNY = yuan. ¥ = CNY en China (distinto a JPY). Impuesto incluido. Sin propina.'
  },

  KR: {
    name: 'Corea del Sur',
    currency: 'KRW',
    symbol: '₩',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: false,
    tax_included: true,
    tax_keywords: ['부가세', '부가가치세', 'vat'],
    discount_keywords: ['할인', '할인금액', '특가'],
    tip_keywords: [],
    deposit_keywords: ['보증금'],
    refund_keywords: ['환불', '반품'],
    total_keywords: ['합계', '총액', '결제금액', '총합계', 'total'],
    subtotal_keywords: ['소계', '공급가액'],
    tip_behavior: 'none',
    signals: ['원', '₩', '사업자등록번호', '영수증'],
    format_notes: 'KRW. Sin decimales. IVA 10% incluido. Sin propina.'
  },

  IN: {
    name: 'India',
    currency: 'INR',
    symbol: '₹',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    // India tiene sistema dual de impuestos por estado
    tax_keywords: ['sgst', 'cgst', 'igst', 'gst', 'tax'],
    discount_keywords: ['discount', 'offer', 'promo'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: ['refund'],
    total_keywords: ['total', 'grand total', 'net amount', 'payable'],
    subtotal_keywords: ['subtotal', 'taxable value', 'basic amount'],
    tip_behavior: 'none',
    signals: ['gstin', 'gst', 'hsn', 'sac', 'inr', '₹'],
    // CRÍTICO: India suma SGST + CGST al subtotal
    dual_tax: true,
    format_notes: 'INR. SGST + CGST (cada uno generalmente 9%) se suman al subtotal. El total final los incluye. Usar total final siempre.'
  },

  TH: {
    name: 'Tailandia',
    currency: 'THB',
    symbol: '฿',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['vat', 'tax', 'ภาษี'],
    discount_keywords: ['discount', 'ส่วนลด'],
    tip_keywords: ['service charge', 'service'],
    deposit_keywords: [],
    refund_keywords: ['refund', 'คืนเงิน'],
    total_keywords: ['total', 'grand total', 'รวม', 'ยอดรวม'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'service_charge_10',
    signals: ['thb', '฿', 'บาท', 'tax id', 'branch'],
    format_notes: 'THB = baht. VAT 7% y service charge 10% se suman al subtotal. Usar total final.'
  },

  SG: {
    name: 'Singapur',
    currency: 'SGD',
    symbol: 'S$',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['gst', 'tax'],
    discount_keywords: ['discount', 'promo', 'offer'],
    tip_keywords: ['service charge'],
    deposit_keywords: [],
    refund_keywords: ['refund'],
    total_keywords: ['total', 'amount due', 'grand total'],
    subtotal_keywords: ['subtotal', 'nett'],
    tip_behavior: 'service_charge_10',
    signals: ['gst reg', 'uen', 'sgd', 's$'],
    format_notes: 'SGD. GST + 10% service charge se suman al subtotal en restaurantes. Usar total final.'
  },

  AU: {
    name: 'Australia',
    currency: 'AUD',
    symbol: 'A$',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: true,
    tax_keywords: ['gst', 'tax'],
    discount_keywords: ['discount', 'special', 'offer'],
    tip_keywords: ['tip', 'gratuity'],
    deposit_keywords: ['deposit', 'container deposit'],
    refund_keywords: ['refund'],
    total_keywords: ['total', 'amount due', 'total due'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'optional',
    signals: ['abn', 'gst', 'aud', 'a$'],
    format_notes: 'AUD. GST 10% incluido en todos los precios. Sin propina obligatoria.'
  },

  // ── MEDIO ORIENTE ──────────────────────────────────────────────────────────

  AE: {
    name: 'Emiratos Árabes',
    currency: 'AED',
    symbol: 'AED',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['vat', 'tax'],
    discount_keywords: ['discount', 'خصم'],
    tip_keywords: ['service charge', 'tip'],
    deposit_keywords: [],
    refund_keywords: ['refund'],
    total_keywords: ['total', 'grand total', 'amount due', 'المجموع'],
    subtotal_keywords: ['subtotal'],
    tip_behavior: 'service_charge_optional',
    signals: ['aed', 'trn', 'vat', 'درهم'],
    format_notes: 'AED = dirhams. VAT 5% se suma al subtotal. Texto puede ser árabe y/o inglés.'
  },

  SA: {
    name: 'Arabia Saudita',
    currency: 'SAR',
    symbol: 'SAR',
    decimal_separator: '.',
    thousand_separator: ',',
    has_decimals: true,
    tax_included: false,
    tax_keywords: ['vat', 'ضريبة', 'ضريبة القيمة المضافة'],
    discount_keywords: ['discount', 'خصم'],
    tip_keywords: [],
    deposit_keywords: [],
    refund_keywords: ['refund', 'استرداد'],
    total_keywords: ['total', 'المجموع', 'المبلغ الإجمالي'],
    subtotal_keywords: ['subtotal', 'المجموع الفرعي'],
    tip_behavior: 'none',
    signals: ['sar', 'vat no', 'ريال', 'cr no'],
    format_notes: 'SAR = riyales. VAT 15% se suma. Texto en árabe de derecha a izquierda.'
  },

};

// ── HELPER: detectar país a partir de señales en el texto ───────────────────
export function detectCountryFromText(rawText) {
  const text = rawText.toLowerCase();
  const scores = {};

  for (const [code, rules] of Object.entries(COUNTRY_RULES)) {
    let score = 0;

    // Señales directas
    for (const signal of rules.signals) {
      if (text.includes(signal.toLowerCase())) {
        score += 3;
      }
    }

    // Moneda en texto
    if (text.includes(rules.currency.toLowerCase())) score += 2;
    if (rules.symbol !== '$' && text.includes(rules.symbol)) score += 2;

    // Keywords fiscales
    for (const kw of rules.tax_keywords) {
      if (text.includes(kw.toLowerCase())) score += 1;
    }
    for (const kw of rules.deposit_keywords) {
      if (text.includes(kw.toLowerCase())) score += 2;
    }

    if (score > 0) scores[code] = score;
  }

  // Ordenar por score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return { country: null, confidence: 0, candidates: [] };

  const best = sorted[0];
  const maxPossible = 15;
  const confidence = Math.min(best[1] / maxPossible, 1.0);

  // Si hay empate o segundo muy cerca, la confianza baja
  const adjustedConfidence = sorted.length > 1 && sorted[1][1] >= best[1] * 0.8
    ? confidence * 0.7
    : confidence;

  return {
    country: best[0],
    confidence: adjustedConfidence,
    score: best[1],
    candidates: sorted.slice(0, 3).map(([c, s]) => ({ country: c, score: s, name: COUNTRY_RULES[c]?.name }))
  };
}

// ── HELPER: construir prompt especializado ──────────────────────────────────
export function buildSystemPrompt(countryCode) {
  const rules = COUNTRY_RULES[countryCode];

  if (!rules) {
    return buildGenericPrompt();
  }

  const depositInstr = rules.deposit_keywords.length > 0
    ? `- "${rules.deposit_keywords.join('", "')}" = depósito retornable. Incluirlo como item con precio POSITIVO.`
    : '';

  const refundInstr = rules.refund_keywords.length > 0
    ? `- "${rules.refund_keywords.join('", "')}" = devolución. Incluirlo como item con precio NEGATIVO.`
    : '';

  const tipInstr = rules.tip_behavior === 'mandatory_suggestion' || rules.tip_behavior === 'optional'
    ? `- Propina/tip (${rules.tip_keywords.join(', ')}): si aparece en el total final, inclúyela como item "Propina".`
    : rules.tip_behavior === 'included_service' || rules.tip_behavior === 'service_charge_10'
    ? `- Service charge: si aparece como línea separada, inclúyela como item "Servicio".`
    : rules.tip_behavior === 'coperto_charge'
    ? `- Coperto: si aparece, inclúyelo como item "Coperto".`
    : `- No hay propina en este país. Ignora cualquier sugerencia de propina.`;

  const priceFormatInstr = rules.price_format === 'unit_x_qty_equals_total'
    ? `- Formato de precios: "PRECIO x CANTIDAD = TOTAL" → usar el TOTAL como precio_unitario y 1 como cantidad. Ejemplo: "0,29 x 6 = 1,74" → precio_unitario: 1.74, cantidad: 1.`
    : `- Decimal con "${rules.decimal_separator}". Ejemplo: "1${rules.decimal_separator}74" = 1.74 en JSON.`;

  const taxInstr = `- IGNORAR COMPLETAMENTE: ${rules.tax_keywords.join(', ')} (son impuestos, no productos).`;

  const totalInstr = `- El total correcto está en la línea: "${rules.total_keywords.slice(0, 3).join('" o "')}".`;

  return `Eres un experto en boletas de ${rules.name}. Moneda: ${rules.currency} (símbolo: ${rules.symbol}).
${rules.format_notes}

REGLAS ESPECÍFICAS PARA ${rules.name.toUpperCase()}:
${taxInstr}
${depositInstr}
${refundInstr}
${tipInstr}
${priceFormatInstr}
${totalInstr}
- Ignora: números de transacción, códigos de barra, publicidad, fechas, teléfonos, RUT/NIF/RFC/CNPJ.
- Mantén los nombres de items en el idioma original de la boleta.
- Precios en JSON siempre como número con punto decimal (1.74, nunca "1,74").

RESPONDE SOLO con JSON válido sin markdown:
{"restaurante":"nombre o null","moneda":"${rules.currency}","items":[{"nombre":"nombre original","precio_unitario":numero,"cantidad":numero_entero}],"total":numero,"confianza":0.0_a_1.0}

Si no puedes leer la boleta: {"restaurante":null,"moneda":"${rules.currency}","items":[],"total":0,"confianza":0}`;
}

export function buildGenericPrompt() {
  return `Eres un experto en boletas y recibos de cualquier parte del mundo.

INSTRUCCIONES:
1. Detecta el país y la moneda automáticamente.
2. Extrae SOLO los productos/items comprados con sus precios reales.
3. IGNORA: impuestos (VAT, IVA, GST, MWST, Tax, ICMS, SGST, CGST), números de transacción, subtotales intermedios, códigos de barra, publicidad, métodos de pago.
4. Depósitos retornables (Pfand, Statiegeld, CRV): inclúyelos como items con precio POSITIVO.
5. Devoluciones de depósitos: inclúyelas con precio NEGATIVO.
6. Propinas o service charge que aparezcan en el total final: inclúyelas como item "Propina" o "Servicio".
7. Precios como números con punto decimal (1.74, nunca "1,74").
8. Para formato "precio × cantidad = total": usar el TOTAL como precio_unitario y 1 como cantidad.

RESPONDE SOLO con JSON válido sin markdown:
{"restaurante":"nombre o null","moneda":"codigo_ISO_3_letras","pais_detectado":"codigo_2_letras_o_null","items":[{"nombre":"nombre en idioma original","precio_unitario":numero,"cantidad":numero}],"total":numero,"confianza":0.0_a_1.0}

Si no puedes leer: {"restaurante":null,"moneda":"CLP","pais_detectado":null,"items":[],"total":0,"confianza":0}`;
}

// ── HELPER: reconciliación financiera ──────────────────────────────────────
export function reconcile(items, totalReported, countryCode) {
  const rules = COUNTRY_RULES[countryCode] || {};
  const sumItems = items.reduce((a, it) => a + it.precio_unitario * it.cantidad, 0);
  const diff = totalReported - sumItems;
  const diffRatio = Math.abs(diff) / (totalReported || 1);

  // Clasificar la diferencia
  let classification = 'ok';
  let explanation = null;

  if (diffRatio < 0.02) {
    classification = 'ok'; // Dentro del 2% — redondeo normal
  } else if (diff > 0) {
    // El total es mayor que la suma de items
    if (diffRatio >= 0.08 && diffRatio <= 0.12) {
      classification = 'probable_tip_10';
      explanation = 'Posible propina o service charge del 10%';
    } else if (diffRatio >= 0.14 && diffRatio <= 0.22) {
      classification = 'probable_tax';
      explanation = `Posible impuesto (${Math.round(diffRatio * 100)}%)`;
    } else if (diffRatio >= 0.18 && diffRatio <= 0.21) {
      classification = 'probable_iva_19';
      explanation = 'Posible IVA del 19% (Alemania, Colombia)';
    } else if (diffRatio >= 0.08 && diffRatio <= 0.11) {
      classification = 'probable_gst_10';
      explanation = 'Posible GST/VAT del 10%';
    } else {
      classification = 'discrepancy';
      explanation = `La suma de items (${sumItems}) no coincide con el total (${totalReported})`;
    }
  } else {
    // El total es menor — descuentos o items con precio negativo
    classification = 'probable_discount';
    explanation = `Posible descuento o devolución aplicada`;
  }

  return {
    sum_items: sumItems,
    total_reported: totalReported,
    difference: diff,
    diff_ratio: diffRatio,
    classification,
    explanation,
    is_ok: classification === 'ok',
    needs_user_confirmation: diffRatio > 0.05 && classification !== 'ok',
  };
}
