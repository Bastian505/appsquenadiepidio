// ── Fuente única de monedas de DiviCuenta ───────────────────────────────────
// La usan el servidor (api/scan-receipt.js, vía import) y el navegador (index.html,
// vía <script src="/core/currencies.js">). Agregar o corregir una moneda se hace SOLO aquí.
// El chequeo tests/check-currencies.mjs verifica que cada moneda de COUNTRY_RULES exista aquí.
//
// decimals: 0 = la moneda no usa centavos (se redondea a entero); 2 = sí.
// suffix:   true = el símbolo va DESPUÉS del monto ("12,50 kr"); false = antes ("$12,50").
(function (root) {
  var LIST = {
    // América
    CLP: { symbol: '$',   decimals: 0 }, ARS: { symbol: '$',   decimals: 2 },
    MXN: { symbol: '$',   decimals: 2 }, COP: { symbol: '$',   decimals: 0 },
    PEN: { symbol: 'S/',  decimals: 2 }, BRL: { symbol: 'R$',  decimals: 2 },
    UYU: { symbol: '$',   decimals: 2 }, PYG: { symbol: '₲',   decimals: 0 },
    USD: { symbol: '$',   decimals: 2 }, CAD: { symbol: '$',   decimals: 2 },
    // Europa
    EUR: { symbol: '€',   decimals: 2 }, GBP: { symbol: '£',   decimals: 2 },
    CHF: { symbol: 'Fr',  decimals: 2, suffix: true },
    SEK: { symbol: 'kr',  decimals: 2, suffix: true }, NOK: { symbol: 'kr', decimals: 2, suffix: true },
    DKK: { symbol: 'kr',  decimals: 2, suffix: true }, ISK: { symbol: 'kr', decimals: 0, suffix: true },
    PLN: { symbol: 'zł',  decimals: 2, suffix: true }, CZK: { symbol: 'Kč', decimals: 2, suffix: true },
    HUF: { symbol: 'Ft',  decimals: 0, suffix: true }, RON: { symbol: 'lei', decimals: 2, suffix: true },
    ALL: { symbol: 'Lek', decimals: 0, suffix: true }, HRK: { symbol: 'kn', decimals: 2, suffix: true },
    RSD: { symbol: 'RSD', decimals: 2, suffix: true }, TRY: { symbol: '₺',  decimals: 2 },
    // Medio Oriente y África
    ILS: { symbol: '₪',   decimals: 2 }, AED: { symbol: 'AED', decimals: 2, suffix: true },
    SAR: { symbol: 'SAR', decimals: 2, suffix: true }, ZAR: { symbol: 'R', decimals: 2 },
    NAD: { symbol: 'N$',  decimals: 2 },
    NGN: { symbol: '₦',   decimals: 2 },
    LKR: { symbol: 'LKR', decimals: 2, suffix: true },
    // Asia y Oceanía
    JPY: { symbol: '¥',   decimals: 0 }, CNY: { symbol: '¥',   decimals: 2 },
    KRW: { symbol: '₩',   decimals: 0 }, INR: { symbol: '₹',   decimals: 2 },
    PKR: { symbol: 'Rs',  decimals: 2 }, MYR: { symbol: 'RM',  decimals: 2 },
    THB: { symbol: '฿',   decimals: 2 }, VND: { symbol: '₫',   decimals: 0 },
    SGD: { symbol: 'S$',  decimals: 2 }, AUD: { symbol: 'A$',  decimals: 2 },
    NZD: { symbol: 'NZ$', decimals: 2 }, IDR: { symbol: 'Rp',  decimals: 0 },
    TWD: { symbol: 'NT$', decimals: 0 }
  };
  // Monedas sin centavos en la práctica que aún no tienen perfil de país (solo afectan redondeo).
  var EXTRA_NO_DECIMAL = ['KHR','MMK','UGX','RWF','TZS','XOF','XAF','GNF','BIF','MGA','IRR','IQD','LBP','SYP'];

  var codes = Object.keys(LIST);
  var noDecimalCodes = codes.filter(function (c) { return LIST[c].decimals === 0; }).concat(EXTRA_NO_DECIMAL);
  var symbols = {}, suffixSymbols = [];
  codes.forEach(function (c) {
    symbols[c] = LIST[c].symbol;
    if (LIST[c].suffix && suffixSymbols.indexOf(LIST[c].symbol) < 0) suffixSymbols.push(LIST[c].symbol);
  });

  root.DC_CURRENCIES = {
    list: LIST,
    symbols: symbols,               // { EUR: '€', ... }
    noDecimalCodes: noDecimalCodes, // ['CLP','JPY', ...]
    suffixSymbols: suffixSymbols,   // ['kr','Fr', ...]
    // Monedas ofrecidas en el selector "tu moneda local" (orden de aparición)
    localChoices: ['CLP','USD','EUR','GBP','ARS','MXN','BRL','COP','PEN','UYU','CAD','AUD','CHF','JPY'],
    decimals: function (code) { return noDecimalCodes.indexOf(String(code || '').toUpperCase()) > -1 ? 0 : 2; },
    symbol: function (code) { var c = String(code || '').toUpperCase(); return symbols[c] || c; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
