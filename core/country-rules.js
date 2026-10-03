// ── Fuente única de reglas por país de DiviCuenta ────────────────────────────
// La usan el servidor (api/scan-receipt.js) y el harness de evals (services/ocr/evals/run.mjs).
// Cada país: moneda, palabras clave (impuesto, propina, total…), señales para detectarlo y
// "format", el bloque de instrucciones que se inyecta en el prompt de lectura.
// Regla: un país nuevo se agrega SOLO con boletas reales de ese país (y su fixture en evals).
// tests/check-currencies.mjs verifica que cada moneda de aquí exista en core/currencies.js.
(function (root) {
  root.DC_COUNTRY_RULES = {

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
    format:`KRW = ₩. Sin decimales. IVA 10% incluido. Sin propina. "과세금액/순매출" + "부가세" son el desglose del IVA ya
incluido: IGNORAR. "소계" / "합계" / "매출합계" = total. "봉사료 0" = sin servicio. Líneas "->차슈 추가" (con flecha) son
extras con su PROPIO precio: ítems aparte (se suman al total). "받을금액/받은금액/신용카드" repiten el total.`
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
    format:`THB. Importe de la derecha = total de la línea (ya incluye extras "+ ไข่ (B10.00)", R21). Service Charge 10%
y VAT 7% suelen venir como líneas aparte SUMADAS al subtotal (หมายเหตุ: ยอดรวม + ค่าบริการ + VAT = รวมสุทธิ);
ábrelas como ítems de cargo. Pero si dice "ราคารวมภาษีมูลค่าเพิ่มแล้ว" / "VATable ... VAT 7.20" bajo el total,
el VAT ya está INCLUIDO: no lo listes. "Rounding / ปัดเศษ" y "Cash / Change" (efectivo y vuelto) NO son ítems.
"Take away", número de mesa y contraseñas de WiFi tampoco. Verifica con la aritmética: ítems + cargos = total.`
  },
  SG: {
    name:'Singapur', currency:'SGD', symbol:'S$', has_decimals:true,
    complexity:'simple',
    tax_kw:['gst','tax'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'service_charge_10', tip_kw:['service charge'],
    total_kw:['total','amount due'],
    price_format:'standard', signals:['gst reg','uen','sgd'],
    format:`SGD. "Ser Chg 10%" / "10% Svc Charge" es cargo de servicio (ábrelo como ítem de cargo). "GST 7%" se SUMA
encima del subtotal + servicio (365.81 = 310.80 + 31.08 + 23.93): ábrelo como cargo. Si imprime "GST 0.00" no hay
GST. "Round Amt" (-0.02) NO es ítem. Líneas "9.00 @ 6.80" bajo un ítem por peso son el cálculo; el importe es el de la derecha.
Un "6 Adult @$38.80 232.80" es cantidad 6 a 38.80 (buffet por persona). Usar el total final.`
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
  NG: {
    name:'Nigeria', currency:'NGN', symbol:'₦', has_decimals:true,
    complexity:'simple',
    tax_kw:['vat','stamp duty'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'mandatory_service_charge', tip_kw:['sc','service charge'],
    total_kw:['total','grand total'],
    price_format:'standard',
    signals:['nigeria','lagos','abuja','kano','port harcourt','ngn','₦','stamp duty'],
    format:`₦ = NGN (naira nigeriano). Formato "₦4,000.00" (coma = miles, punto = decimal).
Filas "N x NOMBRE ... ₦TOTAL": el importe de la derecha es el TOTAL DE LA LÍNEA, no el unitario
("2 x Minnie Burger ₦4,000.00" → precio_unitario=2000, cantidad=2).
"Stamp Duty" (₦50) es un cargo real: inclúyelo como ítem. "SC (7.5%)" es el cargo de servicio:
inclúyelo como ítem con el nombre "SC (7.5%)". El "VAT" (7.5%) se SUMA encima del subtotal y NO es ítem:
el sistema lo agrega al reconciliar con el total. "Beverage Total", "Food Total", "Stamp Duty Total" y
"Sub Total" son subtotales: ignorarlos (R2). total_referencia = "Total" final.`
  },

  LK: {
    name:'Sri Lanka', currency:'LKR', symbol:'LKR', has_decimals:true,
    complexity:'simple',
    tax_kw:['taxes','vat','sscl','nbt','tdl'], deposit_kw:[], refund_kw:['refund'],
    tip_behavior:'mandatory_service_charge', tip_kw:['service charge'],
    total_kw:['payment','total','amount due'],
    price_format:'standard',
    signals:['lkr','rs.','sri lanka','colombo','kandy','galle','cinnamon','vat no','svat','payment'],
    format:`LKR = rupia de Sri Lanka. Formato "LKR49,200.00" (coma = miles, punto = decimal).
Filas "QTY NOMBRE  IMPORTE": el importe de la derecha es el TOTAL DE LA LÍNEA, no el unitario
("2 COCA COLA 1000.00" → precio_unitario=500, cantidad=2).
"Service Charge" (10% del subtotal) es un cargo real: inclúyelo como ítem "Service Charge".
"Taxes" (VAT + otros, ~22% de subtotal + servicio) se SUMAN encima y NO son ítem (R2): el sistema los
agrega al reconciliar con el total. Ignora "Change Due", "Master 4190" y demás líneas de pago.
total_referencia = "Payment" / "Total" final (subtotal + servicio + taxes), NO el "Subtotal".`
  },

  AT: {
    name:'Austria', currency:'EUR', symbol:'€', has_decimals:true,
    complexity:'simple',
    tax_kw:['mwst','ust','netto','brutto'], deposit_kw:[], refund_kw:['storno'],
    tip_behavior:'optional', tip_kw:['trinkgeld','bedienung'],
    total_kw:['summe','gesamt','total'],
    price_format:'standard',
    signals:['uid','atu','mwst','barrechnung','summe','wien','graz','salzburg','innsbruck','klagenfurt','linz'],
    format:`EUR. Columnas "Anz. Artikel | Preis | Total": Preis = unitario, Total = importe de la línea
("2 Hirter 4.00 8.00A" → precio_unitario=4.00, cantidad=2). La LETRA pegada al importe (A, B, D) es la
categoría de IVA, NO es parte del precio. Un "(+1.20)" bajo un ítem son suplementos (Rucola, Parmesan)
YA INCLUIDOS en el Total de esa línea: no los sumes ni los listes (R21). "SUMME" = total. "Netto",
"20% MwSt", "10% MwSt" son el desglose del IVA ya incluido: IGNORAR (R2). "Barrechnung" es una cuenta de
mesa/bar, válida (R15). "Bezahlt mit: Barzahlung" es la forma de pago, no un ítem. "Zwischenrechnung" / "KEINE RECHNUNG" (cuenta
provisoria) es válida: úsala. Con dos columnas de importe iguales, la última es el Total de la línea. "geteilt durch
3 Personen" es informativo: ignóralo.`
  },

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
})(typeof globalThis !== 'undefined' ? globalThis : this);
