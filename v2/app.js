// DiviCuenta v2 — interfaz nueva. Sin framework ni build: un estado, funciones render por
// pantalla y delegación de eventos con data-action (sin onclick armados con texto).
// El cálculo vive en core/split.js; monedas en core/currencies.js.
(function () {
  'use strict';
  var C = window.DC_CURRENCIES, S = window.DC_SPLIT, CFG = window.DC_CONFIG;
  var SYNC = window.DC_SYNC || null;   // cuentas compartidas (opcional)
  var COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];
  var STEPS = ['review', 'people', 'assign', 'summary'];
  var DRAFT_KEY = 'dc_v2_draft';

  var BUILD = '2026-10-03.l';
  // El registro técnico solo se muestra si algo falló o si se activa con ?debug=1 (y se apaga con ?debug=0).
  try { var dq = /[?&]debug=([01])/.exec(location.search); if (dq) localStorage.setItem('dc_debug', dq[1]); } catch (e) {}
  function debugOn() { try { return localStorage.getItem('dc_debug') === '1'; } catch (e) { return false; } }
  function traceFailed() { return trace.some(function (l) { return /✗|⚠|HTTP [45]/.test(l); }); }
  // Registro de cada paso de la lectura de la boleta (se guarda: si el teléfono recarga la página a mitad de camino, queda a la vista).
  var TRACE_KEY = 'dc_v2_trace', trace = [];
  try { trace = JSON.parse(localStorage.getItem(TRACE_KEY)) || []; } catch (e) { trace = []; }
  function tlog(msg) {
    var d = new Date(), hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    trace.push(hh + ' ' + msg); trace = trace.slice(-25);
    try { localStorage.setItem(TRACE_KEY, JSON.stringify(trace)); } catch (e) {}
  }
  if (trace.length && /foto elegida/.test(trace[trace.length - 1])) tlog('⚠ la página se recargó después de elegir la foto (el teléfono la cerró)');
  else if (trace.length) tlog('página abierta');
  var state = load() || fresh();
  // Nunca reabrir en medio de una lectura: la foto y la consulta se perdieron al recargar.
  if (state.step === 'scanning') state.step = 'home';
  var ui = { unitsOpen: {}, joinName: '', scanStage: 0, scanTimer: null, photo: null, error: null, customTip: false, confirm: null, fx: null };

  function fresh() {
    return { step: 'home', currency: 'CLP', restaurant: null, country: null, items: [], people: [], assigns: {},
      tip: null, receiptTotal: null, recon: null, nextId: 1,
      // Cuenta compartida: 'host' si la compartí yo, 'guest' si entré por un link.
      share: null, myMemberId: null };
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(DRAFT_KEY)); return s && s.step ? s : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) {} pushIfHost(); }

  // ── utilidades ─────────────────────────────────────────────────────────────
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(v, cur) {
    cur = cur || state.currency; var d = C.decimals(cur), s = C.symbol(cur), info = C.list[cur] || {};
    var n = (Number(v) || 0).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d });
    return info.suffix ? n + ' ' + s : s + n;
  }
  function inputNum(v) { var d = C.decimals(state.currency); return d ? (Number(v) || 0).toFixed(2).replace('.', ',') : String(Math.round(Number(v) || 0)); }
  function pctTxt(r) { return (Math.round(r * 1000) / 10).toString().replace('.', ','); }
  // Nombre del ítem + traducción al idioma del usuario debajo (si existe y es distinta)
  function nameHtml(it) {
    var tr = it.tr && it.tr.toLowerCase() !== String(it.name).toLowerCase() ? it.tr : '';
    return esc(it.name) + (tr ? '<span class="tr">' + esc(tr) + '</span>' : '');
  }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
  function person(id) { return state.people.filter(function (p) { return p.id === id; })[0]; }
  function item(id) { return state.items.filter(function (i) { return i.id === id; })[0]; }
  function baseItems() { return state.items.filter(function (i) { return !S.isExtra(i); }); }
  function extraItems() { return state.items.filter(S.isExtra); }
  function split() { return S.compute({ items: state.items, people: state.people, assigns: state.assigns, tip: state.tip, currency: state.currency }); }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function go(step) { state.step = step; save(); render(); window.scrollTo(0, 0); }
  function avatar(p, cls) { return '<span class="avatar ' + (cls || '') + '" style="background:' + p.color + '">' + esc(initials(p.name)) + '</span>'; }

  // ── pantallas ──────────────────────────────────────────────────────────────
  function render() {
    var app = document.getElementById('app');
    var html = ({ home: home, scanning: scanning, review: review, people: people, assign: assign, summary: summary, join: join, share: shareScreen }[state.step] || home)();
    app.innerHTML = html;
    var ph = document.getElementById('photo');
    if (ph) {
      ph.addEventListener('click', function () { tlog('selector de fotos abierto'); });
      ph.addEventListener('change', function () {
        var pf = ph.files && ph.files[0];
        if (!pf) { tlog('el selector se cerró sin entregar ninguna foto'); return; }
        tlog('foto elegida: ' + (pf.name || 'sin nombre') + ' · ' + (pf.type || 'tipo desconocido') + ' · ' + Math.round(pf.size / 1024) + ' KB');
        startScan(pf);
      });
    }
    var f = app.querySelector('[data-autofocus]'); if (f) f.focus();
  }

  function top(title, back) {
    var i = STEPS.indexOf(state.step);
    return '<header class="top">' + (back ? '<button class="icon-btn" data-action="go" data-to="' + back + '" aria-label="Volver">←</button>' : '') +
      '<h1>' + title + '</h1><button class="icon-btn" data-action="reset" aria-label="Nueva cuenta">✕</button></header>' +
      (i > -1 ? '<div class="steps" aria-label="Paso ' + (i + 1) + ' de 4">' + STEPS.map(function (_, k) { return '<i class="' + (k <= i ? 'on' : '') + '"></i>'; }).join('') + '</div>' : '');
  }
  function footer(inner) { return '<div class="footer"><div class="inner">' + inner + '</div></div>'; }

  function home() {
    return '<header class="top"><h1 class="brand">Divi<b>Cuenta</b></h1></header>' +
      '<section class="hero"><span class="badge accent">Boletas de más de 40 países</span>' +
      '<h1>Divide la cuenta en segundos.</h1><p>Saca una foto de la boleta, marca quién comió qué y listo: impuesto, servicio y propina repartidos de forma justa.</p></section>' +
      '<label class="cta-scan" for="photo"><span class="ic" aria-hidden="true">📷</span><strong>Escanear boleta</strong><span>Foto o imagen de la galería</span></label>' +
      '<input id="photo" class="sr-only" type="file" accept="image/*" data-action="photo">' +
      '<button class="btn block" data-action="manual">Ingresar ítems a mano</button>' +
      (ui.error ? '<div class="banner danger" style="margin-top:12px">' + esc(ui.error) + '</div>' : '') +
      ((trace.length && (debugOn() || traceFailed())) ? '<details class="card" style="margin-top:12px"><summary style="cursor:pointer;font-weight:600">Registro del último intento de lectura</summary><pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;margin:8px 0 0">' + esc(trace.join('\n')) + '</pre><button class="btn sm ghost" data-action="clear-trace" style="margin-top:8px">Borrar registro</button></details>' : '') +
      (window.__errs && window.__errs.length ? '<div class="banner danger" style="margin-top:12px;font-size:12px">Error técnico: ' + esc(window.__errs.slice(-2).join(' | ')) + '</div>' : '') +
      '<div class="how"><div><b>1</b>Saca la foto: leemos ítems, cantidades y moneda.</div><div><b>2</b>Agrega a tus amigos y marca qué consumió cada uno.</div><div><b>3</b>Cada uno ve cuánto paga, también en su moneda.</div></div>' +
      '<p class="small" style="text-align:center;margin:18px 0 6px;opacity:.6">DiviCuenta v2 · ' + BUILD + '</p>';
  }

  function scanning() {
    var labels = ['Subiendo foto', 'Leyendo ítems y precios', 'Validando con el total impreso'];
    return top('Leyendo boleta') +
      '<div class="scan-photo">' + (ui.photo ? '<img alt="Boleta" src="' + ui.photo + '">' : '') + '<div class="beam"></div></div>' +
      '<div class="card"><div class="stages">' + labels.map(function (l, k) {
        var cls = k < ui.scanStage ? 'done' : k === ui.scanStage ? 'active' : '';
        return '<div class="stage ' + cls + '"><span class="dot">' + (k < ui.scanStage ? '✓' : '') + '</span>' + l + '</div>';
      }).join('') + '</div><p class="small" style="margin:12px 0 0">Las cuentas largas pueden tardar hasta un minuto.</p></div>' +
      (debugOn() ? '<pre class="small" style="white-space:pre-wrap;word-break:break-word;margin:10px 4px 0;opacity:.7">' + esc(trace.slice(-5).join('\n')) + '</pre>' : '') +
      (ui.confirm ? confirmCountry() : '');
  }

  function confirmCountry() {
    var c = ui.confirm, list = (c.candidates && c.candidates.length ? c.candidates : []).concat(c.available_countries || []);
    var seen = {}; list = list.filter(function (x) { var k = x.code || x.country; if (!k || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 12);
    return '<div class="card"><h2>¿De qué país es la boleta?</h2><p class="muted">' + esc(c.message || 'No pudimos identificar la moneda.') + '</p>' +
      '<div class="chips" style="margin-top:12px">' + list.map(function (x) {
        var code = x.code || x.country; return '<button class="chip" data-action="country" data-code="' + esc(code) + '">' + esc(x.name || code) + (x.currency ? ' · ' + esc(x.currency) : '') + '</button>';
      }).join('') + '</div></div>';
  }

  function review() {
    var r = split(), base = baseItems(), extras = extraItems();
    var printed = state.receiptTotal, diff = printed ? printed - (r.baseTotal + r.extrasTotal) : 0;
    // Tolerancia: redondeos de centavos ("Round Amt", ajustes de 0,13) no son un error de lectura.
    var tol = C.decimals(state.currency) === 0 ? 1 : Math.max(0.05, (printed || 0) * 0.0015);
    var banner = '';
    if (printed && Math.abs(diff) > tol) banner = '<div class="banner warn"><b>Los ítems no cuadran con la boleta.</b> Total impreso ' + money(printed) + ', ítems ' + money(r.baseTotal + r.extrasTotal) + ' (' + (diff > 0 ? 'faltan ' : 'sobran ') + money(Math.abs(diff)) + '). Revisa los precios marcados o agrega lo que falte.</div>';
    else if (printed) banner = '<div class="banner ok">✓ Cuadra con el total impreso de la boleta (' + money(printed) + ').</div>';

    return top(esc(state.restaurant || 'Tu cuenta'), 'home') +
      '<p class="muted" style="margin:-6px 4px 12px">' + esc(state.country ? state.country + ' · ' : '') + esc(state.currency) + ' · toca un nombre o precio para corregirlo</p>' +
      banner +
      '<div class="list">' + base.map(itemRow).join('') + '</div>' +
      '<button class="btn sm ghost" data-action="add-item">+ Agregar ítem</button>' +
      '<div class="section-title">Impuesto y cargos <span class="badge accent">se reparten según consumo</span></div>' +
      (extras.length ? '<div class="list">' + extras.map(itemRow).join('') + '</div>' : '<p class="small" style="margin:0 4px 8px">Sin impuesto ni cargos aparte en esta boleta.</p>') +
      '<button class="btn sm ghost" data-action="add-extra">+ Agregar impuesto o cargo</button>' +
      '<div class="section-title">Propina</div>' + tipChips() +
      '<div class="card" style="margin-top:14px"><div class="totals">' +
      '<div class="row"><span>Consumo</span><span class="spacer"></span><span>' + money(r.baseTotal) + '</span></div>' +
      (r.extrasTotal ? '<div class="row"><span>Impuesto y cargos</span><span class="spacer"></span><span>' + money(r.extrasTotal) + '</span></div>' : '') +
      (r.tipAmount ? '<div class="row"><span>Propina</span><span class="spacer"></span><span>' + money(r.tipAmount) + '</span></div>' : '') +
      '<div class="row grand"><span>Total</span><span class="spacer"></span><span>' + money(r.grandTotal) + '</span></div>' + fxLine(r.grandTotal, true) +
      '</div></div>' +
      footer('<button class="btn primary" data-action="go" data-to="people"' + (base.length ? '' : ' disabled') + '>Agregar personas →</button>');
  }

  function itemRow(it) {
    var low = it.confidence != null && it.confidence < 0.8;
    return '<div class="item' + (low ? ' low' : '') + '">' +
      '<span class="namebox"><input class="name" value="' + esc(it.name) + '" data-action="edit" data-id="' + it.id + '" data-field="name" aria-label="Nombre">' +
      (it.tr && it.tr.toLowerCase() !== String(it.name).toLowerCase() ? '<span class="tr">' + esc(it.tr) + '</span>' : (ui.translating && it.needsTr ? '<span class="tr muted-tr">traduciendo…</span>' : '')) + '</span>' +
      '<span class="total num">' + money(it.price * it.qty) + '</span>' +
      '<span class="meta"><input class="qty num" inputmode="numeric" value="' + it.qty + '" data-action="edit" data-id="' + it.id + '" data-field="qty" aria-label="Cantidad">×' +
      '<input class="num" inputmode="decimal" value="' + inputNum(it.price) + '" data-action="edit" data-id="' + it.id + '" data-field="price" aria-label="Precio unitario">' +
      (low ? '<span class="badge">revisar</span>' : '') + '</span>' +
      '<button class="del" data-action="del-item" data-id="' + it.id + '" aria-label="Eliminar ' + esc(it.name) + '">✕</button></div>';
  }

  function tipChips() {
    var t = state.tip, on = function (p) { return t && t.pct === p ? ' on' : ''; };
    return '<div class="chips">' +
      '<button class="chip' + (!t ? ' on' : '') + '" data-action="tip" data-pct="0">Sin propina</button>' +
      [10, 15, 20].map(function (p) { return '<button class="chip' + on(p) + '" data-action="tip" data-pct="' + p + '">' + p + '%</button>'; }).join('') +
      (ui.customTip || (t && t.fixed != null)
        ? '<input class="chip-input num" inputmode="decimal" placeholder="Monto" value="' + (t && t.fixed != null ? t.fixed : '') + '" data-action="tip-fixed" data-autofocus aria-label="Propina en monto">'
        : '<button class="chip" data-action="tip-custom">Otro monto</button>') + '</div>';
  }

  function fxLine(amount, withSelect) {
    var pref = prefCurrency();
    if (pref === state.currency) return '';
    var opts = C.localChoices.map(function (c) { return '<option' + (c === pref ? ' selected' : '') + '>' + c + '</option>'; }).join('');
    var rate = ui.fx && ui.fx.key === state.currency + '_' + pref ? ui.fx.rate : null;
    if (!rate) fetchFx();
    if (!withSelect) return rate ? '<div class="fx">≈ ' + money(amount * rate, pref) + '</div>' : '';
    return '<div class="fx">' + (rate ? '≈ ' + money(amount * rate, pref) : 'En tu moneda:') + ' <select data-action="pref" aria-label="Tu moneda">' + opts + '</select></div>';
  }

  function people() {
    return top('¿Quiénes están?', 'review') +
      '<form class="field" data-action="add-person"><input name="name" placeholder="Nombre" maxlength="24" autocomplete="off" data-autofocus aria-label="Nombre"><button class="btn primary" type="submit">Agregar</button></form>' +
      '<p class="small" style="margin:8px 4px 14px">Agrega a todos los que comparten la cuenta, incluyéndote.</p>' +
      (state.people.length ? '<div class="list">' + state.people.map(function (p) {
        return '<div class="person">' + avatar(p) + '<span style="flex:1;font-weight:600">' + esc(p.name) + '</span><button class="btn sm ghost" data-action="del-person" data-id="' + p.id + '">Quitar</button></div>';
      }).join('') + '</div>' : '') +
      (SYNC && !state.share ? '<button class="btn block" data-action="share-bill" style="margin-top:4px">📲 Que cada uno marque en su teléfono</button><p class="small" style="margin:8px 4px 0">Compartes un link: tus amigos entran sin registrarse y marcan lo suyo.</p>' : '') +
      (state.share ? sharePanel() : '') +
      footer('<button class="btn primary" data-action="go" data-to="assign"' + (state.people.length ? '' : ' disabled') + '>Asignar ítems →</button>');
  }

  function shareLink() { return location.origin + '/v2/#' + (state.share && state.share.token || ''); }

  function sharePanel() {
    if (!state.share) return '';
    var joined = state.people.filter(function (p) { return p.memberId; }).length;
    return '<div class="card" style="margin-top:12px"><div class="row"><b style="flex:1">Cuenta compartida</b><span class="badge ok">en vivo</span></div>' +
      '<p class="muted" style="margin:6px 0 10px">' + (joined > 1 ? 'Conectados: ' + esc(state.people.filter(function (p) { return p.memberId; }).map(function (p) { return p.name; }).join(', ')) : 'Esperando a que entren tus amigos…') + '</p>' +
      '<div class="row"><button class="btn sm" data-action="copy-link">Copiar link</button><button class="btn sm" data-action="share-wa-link">WhatsApp</button><button class="btn sm ghost" data-action="go" data-to="share">Ver QR</button></div></div>';
  }

  function shareScreen() {
    var link = shareLink();
    setTimeout(drawQR, 0);
    return top('Compartir la cuenta', 'people') +
      '<div class="card" style="text-align:center"><div id="qr" class="qr"><span class="small">Generando código…</span></div>' +
      '<p class="muted" style="margin:14px 0 4px">Que escaneen este código o abran el link</p>' +
      '<p class="small" style="word-break:break-all">' + esc(link) + '</p>' +
      '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn sm" data-action="copy-link">Copiar</button><button class="btn sm" data-action="share-wa-link">WhatsApp</button></div></div>' +
      '<p class="small" style="margin:0 4px">El link caduca en 24 horas. Cada uno marca lo suyo y tú ves los totales al instante.</p>' +
      footer('<button class="btn primary" data-action="go" data-to="assign">Seguir →</button>');
  }

  // El QR se dibuja con qrcodejs, cargado solo al entrar a esta pantalla.
  function drawQR() {
    var box = document.getElementById('qr'); if (!box) return;
    function draw() {
      if (!window.QRCode) { box.innerHTML = '<span class="small">Usa el link de abajo</span>'; return; }
      box.innerHTML = '';
      new window.QRCode(box, { text: shareLink(), width: 200, height: 200, correctLevel: window.QRCode.CorrectLevel.M });
    }
    if (window.QRCode) return draw();
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    sc.onload = draw; sc.onerror = function () { box.innerHTML = '<span class="small">Usa el link de abajo</span>'; };
    document.head.appendChild(sc);
  }

  function join() {
    var inv = ui.invite, free = !inv || !inv.people.length || ui.joinFree;
    var chips = inv && inv.people.length ? '<p class="small" style="margin:0 4px 8px">¿Quién eres? Toca tu nombre:</p><div class="list">' + inv.people.map(function (p) {
      var taken = inv.taken.indexOf(String(p.id)) > -1;
      return '<button class="person pick" data-action="pick-person" data-key="' + esc(p.id) + '"' + (taken || ui.joining ? ' disabled' : '') + '>' +
        avatar({ name: p.name, color: COLORS[(Number(p.id) || 0) % COLORS.length] }) + '<span style="flex:1;font-weight:600;text-align:left">' + esc(p.name) + '</span>' +
        (taken ? '<span class="small">ya entró</span>' : '<span class="small">Soy yo →</span>') + '</button>';
    }).join('') + '</div>' + (ui.joinFree ? '' : '<button class="linkbtn" data-action="join-free" style="margin-top:10px">Mi nombre no está en la lista</button>') : '';
    return '<header class="top"><h1 class="brand">Divi<b>Cuenta</b></h1></header>' +
      '<section class="hero"><h1 style="font-size:26px">Te invitaron a dividir una cuenta' + (inv && inv.restaurant ? ' en ' + esc(inv.restaurant) : '') + '</h1>' +
      '<p>' + (inv && inv.people.length ? 'Elige tu nombre y marca lo que consumiste. No necesitas registrarte.' : 'Escribe tu nombre y marca lo que consumiste. No necesitas registrarte.') + '</p></section>' +
      (ui.joinError ? '<div class="banner danger">' + esc(ui.joinError) + '</div>' : '') +
      (ui.invalid ? '' : ui.inviteLoading ? '<p class="muted" style="text-align:center">Cargando la invitación…</p>' : chips +
        (free ? '<form class="field" data-action="do-join" style="margin-top:12px"><input name="name" placeholder="Tu nombre" maxlength="24" value="' + esc(ui.joinName) + '" ' + (ui.joinFree || !(inv && inv.people.length) ? 'data-autofocus ' : '') + 'aria-label="Tu nombre"><button class="btn primary" type="submit"' + (ui.joining ? ' disabled' : '') + '>' + (ui.joining ? 'Entrando…' : 'Entrar') + '</button></form>' : ''));
  }

  function assign() {
    var base = baseItems(), done = base.filter(isAssigned).length;
    var guest = state.share && state.share.role === 'guest';
    if (guest) return assignGuest(base);
    return top('¿Quién consumió qué?', 'people') +
      (state.share ? sharePanel() : '') +
      '<div class="card"><div class="row"><b>' + done + ' de ' + base.length + ' ítems asignados</b><span class="spacer"></span><button class="btn sm" data-action="all-everything">Compartir todo</button></div>' +
      '<div class="progress" style="margin-top:10px"><i style="width:' + (base.length ? Math.round(100 * done / base.length) : 0) + '%"></i></div></div>' +
      '<div class="list">' + base.map(assignRow).join('') + '</div>' +
      footer('<button class="btn primary" data-action="go" data-to="summary">Ver cuánto paga cada uno →</button>');
  }

  // Vista del invitado: solo marca lo suyo, no toca a los demás.
  function assignGuest(base) {
    var mine = state.myMemberId;
    var r = split(), me = r.perPerson.filter(function (p) { return p.id === mine; })[0];
    return top('Marca lo tuyo', null) +
      '<div class="card"><div class="row"><div><div class="small">Lo que llevas</div><div style="font-size:26px;font-weight:800" class="num">' + money(me ? me.amount : 0) + '</div></div><span class="spacer"></span><span class="badge ok">en vivo</span></div></div>' +
      '<div class="list">' + base.map(function (it) {
        var a = state.assigns[it.id] || { people: [], units: {} };
        var mineOn = (a.people || []).indexOf(mine) > -1;
        var others = (a.people || []).filter(function (p) { return p !== mine; }).map(function (pid) { var p = person(pid); return p ? p.name + (it.qty > 1 && a.units && a.units[pid] ? ' (' + a.units[pid] + ')' : '') : ''; }).filter(Boolean);
        var myU = (a.units && a.units[mine]) || 0;
        var stepper = it.qty > 1 && mineOn ? '<div class="unit" style="margin-top:8px"><span class="name">¿Cuántas tomaste?</span><div class="stepper"><button data-action="claim-unit" data-item="' + it.id + '" data-d="-1" aria-label="Menos">−</button><span class="num">' + myU + '</span><button data-action="claim-unit" data-item="' + it.id + '" data-d="1" aria-label="Más"' + (myU >= it.qty - othersUnits(it.id, mine) ? ' disabled' : '') + '>+</button></div></div>' : '';
        return '<div class="assign' + (mineOn ? ' done' : '') + '">' +
          '<div class="head"><span class="name">' + nameHtml(it) + (it.qty > 1 ? ' <span class="small">×' + it.qty + '</span>' : '') + '</span><span class="num" style="font-weight:700">' + money(it.price * it.qty) + '</span></div>' +
          '<div class="who"><button class="pbtn' + (mineOn ? ' on' : '') + '" data-action="claim" data-item="' + it.id + '" aria-pressed="' + mineOn + '">' + (mineOn ? '✓ Lo consumí' : 'Marcar') + '</button></div>' + stepper +
          '<div class="state">' + (others.length ? 'También: ' + esc(others.join(', ')) : 'Nadie más lo marcó') + '</div></div>';
      }).join('') + '</div>' +
      footer('<button class="btn primary" data-action="go" data-to="summary">Ver el total →</button>');
  }

  function isAssigned(it) {
    var a = state.assigns[it.id]; if (!a || !a.people || !a.people.length) return false;
    if (it.qty <= 1) return true;
    var u = a.units || {}, s = a.people.reduce(function (t, pid) { return t + (u[pid] || 0); }, 0);
    return s === 0 || s === it.qty;
  }

  function assignRow(it) {
    var a = state.assigns[it.id] || { people: [], units: {} }, who = a.people || [], units = a.units || {};
    var unitSum = who.reduce(function (t, pid) { return t + (units[pid] || 0); }, 0);
    var all = who.length === state.people.length && state.people.length > 0;
    var unitsOpen = ui.unitsOpen[it.id] || unitSum > 0;
    var stateTxt = !who.length ? 'Sin asignar'
      : it.qty > 1 && unitSum > 0 ? (unitSum === it.qty ? 'Unidades repartidas ✓' : unitSum > it.qty ? 'Se pasaron ' + (unitSum - it.qty) + ' unidades: ajusten' : 'Faltan ' + (it.qty - unitSum) + ' de ' + it.qty + ' unidades')
      : who.length > 1 ? 'Se divide en partes iguales entre ' + who.length : 'Lo paga ' + esc(person(who[0]) ? person(who[0]).name : '');
    return '<div class="assign' + (isAssigned(it) ? ' done' : '') + '">' +
      '<div class="head"><span class="name">' + nameHtml(it) + (it.qty > 1 ? ' <span class="small">×' + it.qty + '</span>' : '') + '</span><span class="num" style="font-weight:700">' + money(it.price * it.qty) + '</span></div>' +
      '<div class="who">' + state.people.map(function (p) {
        var on = who.indexOf(p.id) > -1;
        return '<button class="pbtn' + (on ? ' on' : '') + '" style="' + (on ? 'color:' + p.color : '') + '" data-action="toggle" data-item="' + it.id + '" data-person="' + p.id + '" aria-pressed="' + on + '"' + '>' + avatar(p) + '<span style="color:var(--text)">' + esc(p.name) + '</span>' + '</button>';
      }).join('') + '</div>' +
      (it.qty > 1 && who.length > 1 && !unitsOpen ? '<button class="linkbtn" data-action="units-open" data-item="' + it.id + '">Repartir por unidades (ej. 2 y 3)</button>' : '') +
      (it.qty > 1 && who.length > 1 && unitsOpen ? '<div class="units">' + who.map(function (pid) {
        var p = person(pid); if (!p) return '';
        return '<div class="unit">' + avatar(p, 'sm') + '<span class="name">' + esc(p.name) + '</span><div class="stepper"><button data-action="unit" data-item="' + it.id + '" data-person="' + pid + '" data-d="-1" aria-label="Menos">−</button><span class="num">' + (units[pid] || 0) + '</span><button data-action="unit" data-item="' + it.id + '" data-person="' + pid + '" data-d="1" aria-label="Más"' + (unitSum >= it.qty ? ' disabled' : '') + '>+</button></div></div>';
      }).join('') + '</div>' : '') +
      '<div class="state row"><span style="flex:1">' + stateTxt + '</span>' + (state.people.length > 1 ? '<button class="pbtn all' + (all ? ' on' : '') + '" data-action="toggle-all" data-item="' + it.id + '" aria-pressed="' + all + '">' + (all ? 'Quitar todos' : 'Todos') + '</button>' : '') + '</div></div>';
  }

  function summary() {
    var r = split(), paid = r.perPerson.reduce(function (s, p) { return s + p.amount; }, 0) + r.unassigned;
    var cuadra = Math.abs(paid - r.grandTotal) < (C.decimals(state.currency) === 0 ? 1 : 0.01);
    var seal = !cuadra ? '<span class="badge">Revisa: las cuentas no suman el total</span>'
      : r.unassigned ? '<span class="badge accent">Cuentas + sin asignar = total</span>'
      : '<span class="badge ok">✓ Todo repartido: las cuentas suman el total</span>';
    var pct = pctTxt(r.extrasRatio), tiny = C.decimals(state.currency) ? 0.005 : 0.5;
    return top('Cuánto paga cada uno', 'assign') +
      '<div class="card summary-total"><div class="small">Total de la cuenta</div><div class="amount num">' + money(r.grandTotal) + '</div>' + fxLine(r.grandTotal, true).replace('class="fx"', 'class="fx" style="justify-content:center"') +
      '<div style="margin-top:8px">' + seal + '</div></div>' +
      (r.unassigned ? '<div class="banner warn"><b>Falta asignar ' + money(r.unassigned) + ':</b> ' + esc(r.unassignedNames.join(', ')) + '<div class="actions"><button class="btn sm" data-action="go" data-to="assign">Asignar</button></div></div>' : '') +
      r.perPerson.map(function (p) {
        var ppl = person(p.id);
        return '<div class="card pcard"><div class="row">' + avatar(ppl) + '<b style="flex:1">' + esc(p.name) + '</b><div><div class="amount num">' + money(p.amount) + '</div>' + fxLine(p.amount) + '</div></div>' +
          '<details><summary>Ver detalle</summary><div class="lines">' +
          p.lines.map(function (l) { return '<div class="row"><span>' + nameHtml(item(l.itemId) || { name: l.name }) + (l.units ? ' ×' + l.units : '') + (l.shared ? ' (compartido)' : '') + '</span><span class="spacer"></span><span>' + money(l.base) + '</span></div>'; }).join('') +
          (p.extras > tiny ? '<div class="row"><span>Impuesto y cargos (' + pct + '%)</span><span class="spacer"></span><span>' + money(p.extras) + '</span></div>' : '') +
          (p.tip > tiny ? '<div class="row"><span>Propina</span><span class="spacer"></span><span>' + money(p.tip) + '</span></div>' : '') +
          '</div></details></div>';
      }).join('') +
      footer('<button class="btn" data-action="copy">Copiar</button><button class="btn primary" data-action="share">WhatsApp</button>');
  }

  // ── acciones ───────────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'FORM') return;
    var a = el.dataset.action, id = Number(el.dataset.id), itemId = Number(el.dataset.item), pid = Number(el.dataset.person);
    switch (a) {
      case 'go': go(el.dataset.to); break;
      case 'reset': if (confirm('¿Empezar una cuenta nueva? Se borra la actual.')) { state = fresh(); ui.error = null; save(); render(); } break;
      case 'manual': state = fresh(); state.currency = prefCurrency(); state.step = 'review'; addItem('Ítem 1', 0); save(); render(); break;
      case 'add-item': addItem('Nuevo ítem', 0); save(); render(); break;
      case 'add-extra': addItem('Impuesto', 0); save(); render(); break;
      case 'del-item': state.items = state.items.filter(function (i) { return i.id !== id; }); delete state.assigns[id]; save(); render(); break;
      case 'tip': ui.customTip = false; state.tip = Number(el.dataset.pct) ? { pct: Number(el.dataset.pct) } : null; save(); render(); break;
      case 'tip-custom': ui.customTip = true; render(); break;
      case 'del-person': { var gone = person(id); if (gone && gone.memberId && SYNC) SYNC.removeMember(gone.memberId); removePerson(id); save(); render(); break; }
      case 'toggle': togglePerson(itemId, pid); save(); render(); syncHost([itemId], [pid]); break;
      case 'toggle-all': toggleAll(itemId); save(); render(); syncHost([itemId]); break;
      case 'units-open': ui.unitsOpen[itemId] = true; render(); break;
      case 'unit': changeUnit(itemId, pid, Number(el.dataset.d)); save(); render(); syncHost([itemId], [pid]); break;
      case 'all-everything': baseItems().forEach(function (it) { state.assigns[it.id] = { people: state.people.map(function (p) { return p.id; }), units: {} }; }); save(); render(); toast('Todo se divide entre todos'); syncHost(baseItems().map(function (it) { return it.id; })); break;
      case 'country': rescan(el.dataset.code); break;
      case 'share-bill': startSharing(); break;
      case 'pick-person': { var pk = el.dataset.key, pp = ui.invite && ui.invite.people.filter(function (x) { return String(x.id) === pk; })[0]; if (pp) { ui.joinName = pp.name; doJoin(pendingToken, pp.name, pk); } break; }
      case 'join-free': ui.joinFree = true; render(); break;
      case 'clear-trace': trace = []; try { localStorage.removeItem(TRACE_KEY); } catch (x) {} render(); break;
      case 'copy-link': copyText(shareLink()); break;
      case 'share-wa-link': window.open('https://wa.me/?text=' + encodeURIComponent('Dividamos la cuenta: ' + shareLink()), '_blank', 'noopener'); break;
      case 'claim': toggleClaim(itemId); break;
      case 'claim-unit': claimUnits(itemId, Number(el.dataset.d)); break;
      case 'copy': copyText(shareText()); break;
      case 'share': window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank', 'noopener'); break;
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, a = el.dataset.action;
    if (a === 'edit') editItem(Number(el.dataset.id), el.dataset.field, el.value);
    else if (a === 'tip-fixed') { var v = parseNum(el.value); state.tip = v > 0 ? { fixed: v } : null; save(); render(); }
    else if (a === 'pref') { try { localStorage.setItem('dc_preferred_currency', el.value); } catch (x) {} ui.fx = null; render(); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.dataset.action === 'do-join') {
      e.preventDefault(); var n = e.target.elements.name.value.trim();
      if (!n) return; ui.joinName = n; doJoin(pendingToken, n, null); return;
    }
    if (e.target.dataset.action !== 'add-person') return;
    e.preventDefault(); var input = e.target.elements.name, n = input.value.trim(); if (!n) return;
    state.people.push({ id: state.nextId++, name: n, color: COLORS[state.people.length % COLORS.length] }); save(); render();
  });

  // "18,20" → 18.2 · "1.590" → 1590 · "1,590.50" → 1590.5 · en monedas sin decimales solo cuentan los dígitos
  function parseNum(v) {
    var s = String(v).trim().replace(/[^\d.,-]/g, '');
    if (C.decimals(state.currency) === 0) return parseInt(s.replace(/[^\d-]/g, ''), 10) || 0;
    if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    else s = s.replace(/,/g, '');
    return parseFloat(s) || 0;
  }
  function addItem(name, price) { state.items.push({ id: state.nextId++, name: name, price: price, qty: 1 }); }
  function editItem(id, field, value) {
    var it = item(id); if (!it) return;
    if (field === 'name') { var nn = value.trim(); if (nn && nn !== it.name) { it.name = nn; it.tr = null; it.needsTr = false; } }
    if (field === 'price') it.price = Math.max(0, parseNum(value));
    if (field === 'qty') { it.qty = Math.max(1, Math.round(parseNum(value)) || 1); var a = state.assigns[id]; if (a) a.units = {}; }
    it.confidence = null; save(); render();
  }
  // Quien ya entró desde su teléfono marca lo suyo allí; el anfitrión no lo cambia por él.
  function removePerson(id) {
    state.people = state.people.filter(function (p) { return p.id !== id; });
    Object.keys(state.assigns).forEach(function (k) { var a = state.assigns[k]; a.people = a.people.filter(function (p) { return p !== id; }); if (a.units) delete a.units[id]; });
  }
  function togglePerson(itemId, pid) {
    var a = state.assigns[itemId] || (state.assigns[itemId] = { people: [], units: {} });
    var i = a.people.indexOf(pid);
    if (i > -1) { a.people.splice(i, 1); delete a.units[pid]; } else a.people.push(pid);
    var it = item(itemId); if (it && it.qty > 1 && a.people.length === 1) a.units = {};
  }
  function toggleAll(itemId) {
    var ids = state.people.map(function (p) { return p.id; });
    var a = state.assigns[itemId], all = !!(a && ids.length && ids.every(function (id) { return a.people.indexOf(id) > -1; }));
    state.assigns[itemId] = { people: all ? [] : ids, units: {} };
  }
  function changeUnit(itemId, pid, d) {
    var it = item(itemId), a = state.assigns[itemId]; if (!it || !a) return;
    var sum = a.people.reduce(function (t, p) { return t + (a.units[p] || 0); }, 0);
    var cur = a.units[pid] || 0, next = cur + d;
    if (next < 0 || (d > 0 && sum >= it.qty)) return;
    a.units[pid] = next;
  }

  // ── lectura de la boleta ───────────────────────────────────────────────────
  var pending = null;
  function startScan(file) {
    trace = trace.slice(-2);
    ui.error = null; ui.confirm = null; ui.scanStage = 0; ui.photo = null;
    toast('Procesando la foto…');
    var done = false, guard = setTimeout(function () { if (!done) { done = true; tlog('✗ la foto no terminó de procesarse en 25 s'); fail('No pudimos procesar esa foto. Prueba con otra o con una captura de pantalla.'); } }, 25000);
    compress(file, function (b64, dataUrl) {
      if (done) return; done = true; clearTimeout(guard);
      ui.photo = dataUrl; pending = b64; state.step = 'scanning'; render();
      send({ image_base64: b64, media_type: 'image/jpeg' });
    }, function (msg) { if (done) return; done = true; clearTimeout(guard); fail(msg); },
    // El archivo ya está leído en memoria: recién ahí se cambia de pantalla (no antes: el navegador puede soltar el archivo si se quita el campo).
    function () { if (!done) { state.step = 'scanning'; render(); } });
  }
  function rescan(code) { ui.confirm = null; ui.scanStage = 1; render(); send({ image_base64: pending, media_type: 'image/jpeg', country_hint: code, is_confirmation: true }); }

  function send(payload) {
    clearInterval(ui.scanTimer);
    ui.scanStage = Math.max(ui.scanStage, 0);
    var t0 = Date.now(); tlog('enviando al servidor…');
    ui.scanTimer = setInterval(function () { var s = (Date.now() - t0) / 1000; var st = s < 2 ? 0 : s < 14 ? 1 : 2; if (st !== ui.scanStage && state.step === 'scanning' && !ui.confirm) { ui.scanStage = st; render(); } }, 500);
    var ctrl = new AbortController(), timeout = setTimeout(function () { ctrl.abort(); }, 75000);
    fetch(CFG.SCAN_URL, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'X-App-Secret': CFG.APP_SHARED_SECRET }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
      .then(function (x) {
        clearTimeout(timeout); clearInterval(ui.scanTimer);
        var d = x.d; tlog('respuesta del servidor: HTTP ' + x.res.status + ' en ' + Math.round((Date.now() - t0) / 100) / 10 + ' s' + (d && d.code ? ' · ' + d.code : '') + (x.res.ok ? '' : ' · ' + String((d && (d.error || d.message)) || '').slice(0, 80)));
        if (!x.res.ok) return fail(d.error || (x.res.status === 429 ? 'Demasiados escaneos seguidos. Espera un minuto.' : 'No pudimos leer la boleta. Prueba con otra foto o ingresa los ítems a mano.'));
        if (d.needs_confirmation) { ui.confirm = d; render(); return; }
        if (!d.ok || !d.items || !d.items.length) return fail(d.message || d.error || 'No encontramos ítems. Prueba con una foto más nítida y con la boleta completa.');
        loadReceipt(d);
      })
      .catch(function (err) { clearTimeout(timeout); clearInterval(ui.scanTimer); tlog('✗ error de red: ' + (err && (err.name + ' ' + err.message))); fail(err && err.name === 'AbortError' ? 'La lectura tardó demasiado. Intenta de nuevo.' : 'Sin conexión. Revisa tu internet e intenta de nuevo.'); });
  }
  function fail(msg) { ui.error = msg; state.step = 'home'; save(); render(); }

  function loadReceipt(d) {
    var keep = state.people;
    state = fresh(); state.people = keep;
    state.currency = (d.moneda && C.list[d.moneda]) ? d.moneda : (d.moneda || 'CLP');
    state.restaurant = d.restaurante || null; state.country = d.pais_nombre || null; state.countryCode = d.pais || null;
    var rec = d.reconciliation || {};
    state.receiptTotal = rec.total_boleta || d.total_referencia || null;
    (d.items || []).forEach(function (it) {
      state.items.push({ id: state.nextId++, name: it.nombre || 'Ítem', price: Number(it.precio_unitario) || 0, qty: Math.max(1, Number(it.cantidad) || 1), confidence: it.confianza == null ? null : Number(it.confianza) });
    });
    state.nextId = Math.max(state.nextId, 1 + state.people.reduce(function (m, p) { return Math.max(m, p.id); }, 0));
    state.step = 'review'; ui.photo = null; save(); render();
    toast('Boleta leída · ' + state.items.length + ' líneas');
    translateNames();
  }

  // ── traducción de nombres (en segundo plano, no bloquea) ───────────────────
  var LANG_BY_COUNTRY = { es: ['CL','AR','MX','CO','PE','UY','PY','ES','BO','EC','VE','CR','GT','PA','DO','SV','HN','NI'],
                          en: ['US','GB','IE','AU','NZ','ZA','NA','CA'] };
  function userLang() { var l = String(navigator.language || 'es').slice(0, 2).toLowerCase(); return ['es','en','pt','fr','de','it'].indexOf(l) > -1 ? l : 'es'; }
  function translateNames() {
    var lang = userLang(), same = (LANG_BY_COUNTRY[lang] || []).indexOf(state.countryCode) > -1;
    var todo = state.items.filter(function (it) { return !it.tr && it.name && /\p{L}/u.test(it.name) && (!same || /[^\u0000-\u024F\s\d.,()&'\/+\-]/.test(it.name)); }).slice(0, 60);
    if (!todo.length) return;
    todo.forEach(function (it) { it.needsTr = true; }); ui.translating = true; render();
    fetch(CFG.TRANSLATE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Secret': CFG.APP_SHARED_SECRET },
      body: JSON.stringify({ names: todo.map(function (it) { return it.name.slice(0, 80); }), lang: lang }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.translations) todo.forEach(function (it, i) { var cur = item(it.id); if (cur && cur.name === it.name) cur.tr = d.translations[i]; });
      })
      .catch(function () {})
      .then(function () { state.items.forEach(function (it) { it.needsTr = false; }); ui.translating = false; save(); render(); });
  }

  function compress(file, cb, onFail, onRead) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      tlog('archivo leído en memoria'); if (onRead) onRead();
      var img = new Image();
      img.onload = function () {
        var MAX = 1600, w = img.width, h = img.height, r = Math.min(1, MAX / Math.max(w, h));
        tlog('imagen decodificada ' + w + 'x' + h);
        var cv = document.createElement('canvas'); cv.width = Math.round(w * r); cv.height = Math.round(h * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var url = cv.toDataURL('image/jpeg', 0.85); tlog('foto reducida a ' + cv.width + 'x' + cv.height + ' · ' + Math.round(url.length / 1024) + ' KB'); cb(url.split(',')[1], url);
      };
      img.onerror = function () { tlog('✗ no se pudo decodificar la imagen'); (onFail || fail)('No pudimos abrir esa imagen. Si es una foto HEIC, prueba sacándola de nuevo o con una captura.'); };
      img.src = ev.target.result;
    };
    reader.onerror = function () { tlog('✗ no se pudo leer el archivo'); (onFail || fail)('No pudimos leer el archivo de la foto.'); };
    reader.readAsDataURL(file);
  }

  // ── cuentas compartidas ────────────────────────────────────────────────────
  var pendingToken = null;

  function startSharing() {
    if (!SYNC) return;
    var me = state.people[0];
    toast('Creando el link…');
    SYNC.createBill(me ? me.name : 'Yo', state)
      .then(function (st) {
        state.share = { role: 'host', token: st.token, billId: st.billId };
        state.myMemberId = me ? me.id : null;
        if (me) { me.memberId = st.memberId; SYNC.setPersonKey(me.id); }
        // Lo que el anfitrión ya había marcado para sí mismo pasa a la cuenta compartida.
        if (me) state.items.forEach(function (it) {
          var a = state.assigns[it.id];
          if (a && (a.people || []).indexOf(me.id) > -1) SYNC.setClaim(it.id, a.units && a.units[me.id] != null ? a.units[me.id] : null);
        });
        save(); render(); listen();
        toast('Listo: comparte el link');
      })
      .catch(function (e) { toast(e.message === 'SIN_CONEXION' ? 'No se pudo conectar. Sigue en este teléfono.' : 'No se pudo compartir'); });
  }

  function loadInvite(token) {
    ui.inviteLoading = true; ui.invalid = false; render();
    return SYNC.peekBill(token).then(function (inv) { ui.invite = inv; ui.inviteLoading = false; render(); })
      .catch(function (e) {
        ui.inviteLoading = false; ui.invite = null;
        if (e.message === 'LINK_INVALIDO') { ui.invalid = true; ui.joinError = 'Ese link ya no sirve: la cuenta se cerró o venció.'; }
        else if (e.message === 'DEMASIADOS_INTENTOS') { ui.invalid = true; ui.joinError = 'Demasiados intentos. Espera unos minutos.'; }
        render();   // sin conexión a la lista: igual se puede entrar escribiendo el nombre
      });
  }

  function doJoin(token, name, personKey) {
    if (!SYNC || !token) return;
    ui.joining = true; ui.joinError = null; render();
    SYNC.joinBill(token, name, personKey)
      .then(function (st) {
        state = fresh();
        state.share = { role: 'guest', token: token, billId: st.billId };
        state.myMemberId = null; state._pendingMember = st.memberId;
        state.step = 'assign'; save();
        return SYNC.fetchAll().then(applyRemote).then(function () { listen(); render(); });
      })
      .catch(function (e) {
        ui.joining = false;
        if (e.message === 'NOMBRE_TOMADO') { ui.joinError = 'Ese nombre ya lo eligió otra persona. Elige otro.'; loadInvite(token); return; }
        ui.joinError = e.message === 'LINK_INVALIDO' ? 'Ese link ya no sirve: la cuenta se cerró o venció.'
          : e.message === 'DEMASIADOS_INTENTOS' ? 'Demasiados intentos. Espera unos minutos.'
          : 'No se pudo entrar. Revisa tu conexión.';
        render();
      });
  }

  function memberIdOf(localId) { var p = person(localId); return p ? p.memberId : null; }

  // Mantener la cuenta al día. El tiempo real puede cortarse (p. ej. el teléfono suspende la pestaña cuando
  // el anfitrión se va a WhatsApp a mandar el link), así que además se consulta cada pocos segundos y al volver.
  var syncSig = '', pollTimer = null;
  function sigOf(d) {
    return JSON.stringify([d.bill.updated_at, d.members.map(function (m) { return m.id + m.name; }),
      d.claims.map(function (c) { return c.member_id + ':' + c.item_id + ':' + c.units; })]);
  }
  function pull(force) {
    if (!SYNC || !state.share) return Promise.resolve();
    return SYNC.fetchAll().then(function (d) {
      if (!d) return;
      var sg = sigOf(d); if (!force && sg === syncSig) return;
      syncSig = sg; applyRemote(d);
      var a = document.activeElement;   // no pisar lo que la persona está escribiendo
      if (!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value && document.getElementById('app').contains(a))) render();
    }).catch(function () {});
  }
  function listen() {
    if (!SYNC) return;
    SYNC.subscribe(function (d) { syncSig = sigOf(d); applyRemote(d); render(); });
    if (!pollTimer) {
      pollTimer = setInterval(function () { if (!document.hidden) pull(false); }, 4000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(true); });
      window.addEventListener('focus', function () { pull(true); });
      window.addEventListener('online', function () { pull(true); });
    }
  }

  // Traduce lo que hay en la base al estado local (ítems, personas y marcas).
  function applyRemote(d) {
    if (!d) return;
    var mineUser = SYNC.state.memberId;
    state.currency = d.bill.currency || state.currency;
    state.restaurant = d.bill.restaurant || state.restaurant;
    state.countryCode = d.bill.country_code || state.countryCode;
    state.receiptTotal = d.bill.receipt_total != null ? Number(d.bill.receipt_total) : state.receiptTotal;
    if (state.share && state.share.role === 'guest') {
      state.items = (d.bill.items || []).map(function (it) { return { id: it.id, name: it.name, price: Number(it.price) || 0, qty: Number(it.qty) || 1, tr: it.tr || null, confidence: it.confidence }; });
      state.tip = d.bill.tip || null;
    }
    // Une a cada miembro con su persona de la lista del anfitrión (por el nombre que eligió al entrar o por el vínculo previo).
    // Las personas que aún no entran se quedan: la base solo conoce a quienes ya se conectaron.
    var prev = state.people.slice(), linked = [];
    d.members.forEach(function (m, i) {
      var p = prev.filter(function (x) { return x.memberId === m.id; })[0] ||
        prev.filter(function (x) { return x.memberId == null && m.person_key != null && String(x.id) === String(m.person_key); })[0];
      if (p) { p.memberId = m.id; linked.push(p); }
      else linked.push({ id: state.nextId++, name: m.name, color: COLORS[i % COLORS.length], memberId: m.id });
    });
    var localOnly = prev.filter(function (p) { return p.memberId == null && linked.indexOf(p) < 0; });
    var keepAssigns = {};
    Object.keys(state.assigns || {}).forEach(function (iid) {
      var a = state.assigns[iid], lp = (a.people || []).filter(function (pid) { return localOnly.some(function (p) { return p.id === pid; }); });
      if (!lp.length) return;
      var u = {}; lp.forEach(function (pid) { if (a.units && a.units[pid] != null) u[pid] = a.units[pid]; });
      keepAssigns[iid] = { people: lp, units: u };
    });
    state.people = linked;
    localOnly.forEach(function (p) { state.people.push(p); });
    var byMember = {}; state.people.forEach(function (p) { if (p.memberId != null) byMember[p.memberId] = p.id; });
    if (mineUser && byMember[mineUser]) state.myMemberId = byMember[mineUser];
    state.assigns = {};
    d.claims.forEach(function (c) {
      var pid = byMember[c.member_id]; if (pid == null) return;
      var it = state.items.filter(function (x) { return String(x.id) === String(c.item_id); })[0]; if (!it) return;
      var a = state.assigns[it.id] || (state.assigns[it.id] = { people: [], units: {} });
      if (a.people.indexOf(pid) < 0) a.people.push(pid);
      if (c.units != null) a.units[pid] = c.units;
    });
    Object.keys(keepAssigns).forEach(function (iid) {
      var a = state.assigns[iid] || (state.assigns[iid] = { people: [], units: {} });
      keepAssigns[iid].people.forEach(function (pid) { if (a.people.indexOf(pid) < 0) a.people.push(pid); });
      Object.keys(keepAssigns[iid].units).forEach(function (pid) { a.units[pid] = keepAssigns[iid].units[pid]; });
    });
    save();
  }

  // Envía a la base lo que este teléfono marcó y vuelve a leer: así lo ven los demás al instante y lo nuestro no se pisa.
  function pushClaims(promises) {
    if (!SYNC) return;
    Promise.all(promises).then(function () { return SYNC.fetchAll(); }).then(function (d) { applyRemote(d); render(); });
  }
  function claimCall(itemId, pid) {
    var a = state.assigns[itemId], it = item(itemId), mid = memberIdOf(pid);
    if (!mid && pid !== state.myMemberId) return Promise.resolve();   // alguien que aún no entra
    if (!a || (a.people || []).indexOf(pid) < 0) return SYNC.clearClaim(itemId, mid);
    var u = a.units && a.units[pid];
    return SYNC.setClaim(itemId, it && it.qty > 1 && u ? u : null, mid);
  }
  // El anfitrión marca por cualquiera de su cuenta (la base solo se lo permite al dueño). Las personas que aún no entran se quedan solo en su teléfono.
  function syncHost(ids, pids) {
    if (!SYNC || !state.share || state.share.role !== 'host') return;
    var who = pids || state.people.map(function (p) { return p.id; }), calls = [];
    ids.forEach(function (id) { who.forEach(function (pid) { if (memberIdOf(pid)) calls.push(claimCall(id, pid)); }); });
    if (!calls.length) return;
    Promise.all(calls).then(function (rs) { if (rs.some(function (r) { return r && r.error; })) toast('No se pudo guardar esa marca'); });
    pushClaims(calls);
  }

  // Unidades de una línea que ya tomaron los demás (para no pasarse de la cantidad).
  function othersUnits(itemId, me) {
    var a = state.assigns[itemId]; if (!a) return 0;
    return (a.people || []).reduce(function (t, pid) { return pid === me ? t : t + ((a.units && a.units[pid]) || 0); }, 0);
  }

  function toggleClaim(itemId) {
    var mine = state.myMemberId, it = item(itemId), cur = state.assigns[itemId];
    if (it && it.qty > 1 && !(cur && (cur.people || []).indexOf(mine) > -1) && othersUnits(itemId, mine) >= it.qty) { toast('Ya se repartieron todas las unidades'); return; }
    // Optimista: se ve al instante y la base confirma (o corrige) por tiempo real.
    togglePerson(itemId, mine);
    var a = state.assigns[itemId];
    if (it && it.qty > 1 && a && a.people.indexOf(mine) > -1) a.units[mine] = 1;   // en líneas con varias unidades, parte con 1 y ajusta con − / +
    save(); render();
    pushClaims([claimCall(itemId, mine)]);
  }
  function claimUnits(itemId, d) {
    var mine = state.myMemberId, it = item(itemId), a = state.assigns[itemId];
    if (!it || !a || a.people.indexOf(mine) < 0) return;
    var next = Math.max(0, Math.min(it.qty - othersUnits(itemId, mine), (a.units[mine] || 0) + d));
    if (next === 0) { togglePerson(itemId, mine); }
    else a.units[mine] = next;
    save(); render();
    pushClaims([claimCall(itemId, mine)]);
  }

  // El anfitrión publica los cambios de la boleta (ítems, propina) para que los invitados los vean.
  var pushTimer = null;
  function pushIfHost() {
    if (!SYNC || !state.share || state.share.role !== 'host') return;
    clearTimeout(pushTimer); pushTimer = setTimeout(function () { SYNC.pushBill(state); }, 400);
  }

  // ── moneda local y tipo de cambio ──────────────────────────────────────────
  function prefCurrency() { try { return localStorage.getItem('dc_preferred_currency') || 'CLP'; } catch (e) { return 'CLP'; } }
  var fxLoading = null;
  function fetchFx() {
    var from = state.currency, to = prefCurrency(), key = from + '_' + to;
    if (fxLoading === key) return; fxLoading = key;
    try { var c = JSON.parse(localStorage.getItem('dc_fx_' + key)); if (c && c.rate && Date.now() - c.ts < 12 * 3600e3) { ui.fx = { key: key, rate: c.rate }; fxLoading = null; setTimeout(render); return; } } catch (e) {}
    var lf = from.toLowerCase(), lt = to.toLowerCase();
    var sources = [
      function () { return fetch('https://open.er-api.com/v6/latest/' + from).then(function (r) { return r.json(); }).then(function (d) { return d.rates && d.rates[to]; }); },
      function () { return fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/' + lf + '.json').then(function (r) { return r.json(); }).then(function (d) { return d[lf] && d[lf][lt]; }); }
    ];
    (function tryNext(i) {
      if (i >= sources.length) { fxLoading = null; return; }
      sources[i]().then(function (rate) {
        if (!rate) return tryNext(i + 1);
        ui.fx = { key: key, rate: rate }; fxLoading = null;
        try { localStorage.setItem('dc_fx_' + key, JSON.stringify({ rate: rate, ts: Date.now() })); } catch (e) {}
        render();
      }).catch(function () { tryNext(i + 1); });
    })(0);
  }

  // ── compartir ──────────────────────────────────────────────────────────────
  function shareText() {
    var r = split(), lines = ['🧾 ' + (state.restaurant || 'Cuenta') + ' — total ' + money(r.grandTotal), ''];
    r.perPerson.forEach(function (p) { lines.push('• ' + p.name + ': ' + money(p.amount)); });
    if (r.extrasTotal) lines.push('', 'Impuesto y cargos repartidos según lo que consumió cada uno.');
    lines.push('', 'Dividido con DiviCuenta · ' + location.origin + '/v2/');
    return lines.join('\n');
  }
  function copyText(t) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Copiado'); }, function () { toast('No se pudo copiar'); });
  }

  // Pantalla de entrada: se oculta sola a los ~1,6 s; si ya se vio en esta sesión ni aparece.
  (function hideSplash() {
    var el = document.getElementById('splash');
    if (!el || el.className.indexOf('gone') > -1) return;
    try { sessionStorage.setItem('dc_splash', '1'); } catch (e) {}
    setTimeout(function () { el.className += ' hidden'; setTimeout(function () { el.className += ' gone'; }, 450); }, 1600);
  })();

  // ¿Llego por un link compartido? (/v2/#token)
  (function start() {
    var token = (location.hash || '').replace(/^#/, '').trim();
    if (token && /^[A-Za-z0-9_-]{16,64}={0,2}$/.test(token) && window.DC_SYNC) {
      SYNC = window.DC_SYNC; pendingToken = token;
      history.replaceState(null, '', location.pathname);
      state = fresh(); state.step = 'join'; render(); loadInvite(token); return;
    }
    if (!SYNC && window.DC_SYNC) SYNC = window.DC_SYNC;
    render();
    // Si venía de una cuenta compartida, reconectar y traer lo último.
    if (state.share && SYNC) {
      SYNC.resume({ billId: state.share.billId, memberId: memberIdOf(state.myMemberId), token: state.share.token, role: state.share.role })
        .then(function (st) { if (!st) return; return SYNC.fetchAll().then(function (d) { applyRemote(d); listen(); render(); }); });
    }
  })();
})();

