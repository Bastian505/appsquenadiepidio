// DiviCuenta v2 — interfaz nueva. Sin framework ni build: un estado, funciones render por
// pantalla y delegación de eventos con data-action (sin onclick armados con texto).
// El cálculo vive en core/split.js; monedas en core/currencies.js.
(function () {
  'use strict';
  var C = window.DC_CURRENCIES, S = window.DC_SPLIT, CFG = window.DC_CONFIG;
  var COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];
  var STEPS = ['review', 'people', 'assign', 'summary'];
  var DRAFT_KEY = 'dc_v2_draft';

  var state = load() || fresh();
  var ui = { unitsOpen: {}, scanStage: 0, scanTimer: null, photo: null, error: null, customTip: false, confirm: null, fx: null };

  function fresh() {
    return { step: 'home', currency: 'CLP', restaurant: null, country: null, items: [], people: [], assigns: {},
      tip: null, receiptTotal: null, recon: null, nextId: 1 };
  }
  function load() { try { var s = JSON.parse(localStorage.getItem(DRAFT_KEY)); return s && s.step ? s : null; } catch (e) { return null; } }
  function save() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) {} }

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
    var html = ({ home: home, scanning: scanning, review: review, people: people, assign: assign, summary: summary }[state.step] || home)();
    app.innerHTML = html;
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
      '<div class="how"><div><b>1</b>Saca la foto: leemos ítems, cantidades y moneda.</div><div><b>2</b>Agrega a tus amigos y marca qué consumió cada uno.</div><div><b>3</b>Cada uno ve cuánto paga, también en su moneda.</div></div>';
  }

  function scanning() {
    var labels = ['Subiendo foto', 'Leyendo ítems y precios', 'Validando con el total impreso'];
    return top('Leyendo boleta') +
      '<div class="scan-photo">' + (ui.photo ? '<img alt="Boleta" src="' + ui.photo + '">' : '') + '<div class="beam"></div></div>' +
      '<div class="card"><div class="stages">' + labels.map(function (l, k) {
        var cls = k < ui.scanStage ? 'done' : k === ui.scanStage ? 'active' : '';
        return '<div class="stage ' + cls + '"><span class="dot">' + (k < ui.scanStage ? '✓' : '') + '</span>' + l + '</div>';
      }).join('') + '</div><p class="small" style="margin:12px 0 0">Las cuentas largas pueden tardar hasta un minuto.</p></div>' +
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
    var tol = C.decimals(state.currency) === 0 ? 1 : 0.05;
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
      footer('<button class="btn primary" data-action="go" data-to="assign"' + (state.people.length ? '' : ' disabled') + '>Asignar ítems →</button>');
  }

  function assign() {
    var base = baseItems(), done = base.filter(isAssigned).length;
    return top('¿Quién consumió qué?', 'people') +
      '<div class="card"><div class="row"><b>' + done + ' de ' + base.length + ' ítems asignados</b><span class="spacer"></span><button class="btn sm" data-action="all-everything">Compartir todo</button></div>' +
      '<div class="progress" style="margin-top:10px"><i style="width:' + (base.length ? Math.round(100 * done / base.length) : 0) + '%"></i></div></div>' +
      '<div class="list">' + base.map(assignRow).join('') + '</div>' +
      footer('<button class="btn primary" data-action="go" data-to="summary">Ver cuánto paga cada uno →</button>');
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
      : it.qty > 1 && unitSum > 0 ? (unitSum === it.qty ? 'Unidades repartidas ✓' : 'Faltan ' + (it.qty - unitSum) + ' de ' + it.qty + ' unidades')
      : who.length > 1 ? 'Se divide en partes iguales entre ' + who.length : 'Lo paga ' + esc(person(who[0]) ? person(who[0]).name : '');
    return '<div class="assign' + (isAssigned(it) ? ' done' : '') + '">' +
      '<div class="head"><span class="name">' + nameHtml(it) + (it.qty > 1 ? ' <span class="small">×' + it.qty + '</span>' : '') + '</span><span class="num" style="font-weight:700">' + money(it.price * it.qty) + '</span></div>' +
      '<div class="who">' + state.people.map(function (p) {
        var on = who.indexOf(p.id) > -1;
        return '<button class="pbtn' + (on ? ' on' : '') + '" style="' + (on ? 'color:' + p.color : '') + '" data-action="toggle" data-item="' + it.id + '" data-person="' + p.id + '" aria-pressed="' + on + '">' + avatar(p) + '<span style="color:var(--text)">' + esc(p.name) + '</span></button>';
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
      case 'del-person': removePerson(id); save(); render(); break;
      case 'toggle': togglePerson(itemId, pid); save(); render(); break;
      case 'toggle-all': toggleAll(itemId); save(); render(); break;
      case 'units-open': ui.unitsOpen[itemId] = true; render(); break;
      case 'unit': changeUnit(itemId, pid, Number(el.dataset.d)); save(); render(); break;
      case 'all-everything': baseItems().forEach(function (it) { state.assigns[it.id] = { people: state.people.map(function (p) { return p.id; }), units: {} }; }); save(); render(); toast('Todo se divide entre todos'); break;
      case 'country': rescan(el.dataset.code); break;
      case 'copy': copyText(shareText()); break;
      case 'share': window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank', 'noopener'); break;
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, a = el.dataset.action;
    if (a === 'photo' && el.files && el.files[0]) startScan(el.files[0]);
    else if (a === 'edit') editItem(Number(el.dataset.id), el.dataset.field, el.value);
    else if (a === 'tip-fixed') { var v = parseNum(el.value); state.tip = v > 0 ? { fixed: v } : null; save(); render(); }
    else if (a === 'pref') { try { localStorage.setItem('dc_preferred_currency', el.value); } catch (x) {} ui.fx = null; render(); }
  });
  document.addEventListener('submit', function (e) {
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
    var a = state.assigns[itemId], all = a && a.people.length === state.people.length;
    state.assigns[itemId] = { people: all ? [] : state.people.map(function (p) { return p.id; }), units: {} };
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
    ui.error = null; ui.confirm = null; ui.scanStage = 0;
    compress(file, function (b64, dataUrl) {
      ui.photo = dataUrl; pending = b64; state.step = 'scanning'; render();
      send({ image_base64: b64, media_type: 'image/jpeg' });
    });
  }
  function rescan(code) { ui.confirm = null; ui.scanStage = 1; render(); send({ image_base64: pending, media_type: 'image/jpeg', country_hint: code, is_confirmation: true }); }

  function send(payload) {
    clearInterval(ui.scanTimer);
    ui.scanStage = Math.max(ui.scanStage, 0);
    var t0 = Date.now();
    ui.scanTimer = setInterval(function () { var s = (Date.now() - t0) / 1000; var st = s < 2 ? 0 : s < 14 ? 1 : 2; if (st !== ui.scanStage && state.step === 'scanning' && !ui.confirm) { ui.scanStage = st; render(); } }, 500);
    var ctrl = new AbortController(), timeout = setTimeout(function () { ctrl.abort(); }, 75000);
    fetch(CFG.SCAN_URL, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'X-App-Secret': CFG.APP_SHARED_SECRET }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (d) { return { res: res, d: d }; }); })
      .then(function (x) {
        clearTimeout(timeout); clearInterval(ui.scanTimer);
        var d = x.d;
        if (!x.res.ok) return fail(d.error || (x.res.status === 429 ? 'Demasiados escaneos seguidos. Espera un minuto.' : 'No pudimos leer la boleta. Prueba con otra foto o ingresa los ítems a mano.'));
        if (d.needs_confirmation) { ui.confirm = d; render(); return; }
        if (!d.ok || !d.items || !d.items.length) return fail(d.message || d.error || 'No encontramos ítems. Prueba con una foto más nítida y con la boleta completa.');
        loadReceipt(d);
      })
      .catch(function (err) { clearTimeout(timeout); clearInterval(ui.scanTimer); fail(err && err.name === 'AbortError' ? 'La lectura tardó demasiado. Intenta de nuevo.' : 'Sin conexión. Revisa tu internet e intenta de nuevo.'); });
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

  function compress(file, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var MAX = 1600, w = img.width, h = img.height, r = Math.min(1, MAX / Math.max(w, h));
        var cv = document.createElement('canvas'); cv.width = Math.round(w * r); cv.height = Math.round(h * r);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        var url = cv.toDataURL('image/jpeg', 0.85); cb(url.split(',')[1], url);
      };
      img.onerror = function () { fail('No pudimos abrir esa imagen.'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
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

  render();
})();
