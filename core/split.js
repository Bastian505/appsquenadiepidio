// ── Núcleo de reparto de cuentas de DiviCuenta ───────────────────────────────
// Funciones puras (sin DOM): las usa la app v2 y las pruebas. Requiere core/currencies.js.
//
// Modelo:
//   items:   [{ id, name, price, qty }]          precio unitario en la moneda de la boleta
//   people:  [{ id, name }]
//   assigns: { [itemId]: { people: [pid], units: { [pid]: n } } }
//            qty 1  → se divide en partes iguales entre `people`
//            qty >1 → `units` por persona; si nadie tiene unidades pero hay `people`,
//                     la línea completa se divide en partes iguales ("Todos")
//   tip:     { pct: 10 } | { fixed: 43 } | null
//
// Impuesto, servicio y cargos ("extras") se detectan por nombre: no se asignan a nadie,
// se reparten proporcionalmente al consumo de cada persona, igual que la propina.
// La suma de lo que paga cada persona + lo no asignado = total, exacto (método del mayor resto).
(function (root) {
  var EXTRA_RE = /^\s*(impuesto(\s*\([^()]{1,40}\))?|servicio|propina|sales tax|taxes|service charges?|service fee|gratuity|tax|gst|vat|iva|sst|fbr pos charges?|sc|stamp duty|card surcharge|credit card (fee|surcharge)|card fee|cargo (por )?servicio|servi[cç]o|taxa( de)? servi[cç]o|gorjeta|impostos?|servizio|bedienung|service compris|pourboire|trinkgeld|bediening|auto[\s-]?round(ing)?|round(ing)?( adjustment| off)?|redondeo|ajuste( por)? redondeo)(\s*[@(]?\s*\d+([.,]\d+)?\s*%\)?)?\s*$/i;
  function isExtra(item) { return EXTRA_RE.test((item && item.name) || ''); }

  // Descuentos: una línea con importe NEGATIVO y nombre de descuento. Dos casos, que se distinguen por aritmética (sin IA):
  //   · global:   es el X % de todo el consumo (ej. 'Discount 20%' = 1.179 de 5.895) → se reparte proporcional, como el servicio.
  //   · de plato: es el X % de UN plato (ej. '(Discount) 30 %' = 25.800 de 86.000) → lo paga quien consumió ese plato.
  // Si no calza con ninguno, queda como una línea normal (se asigna a mano), igual que antes.
  var DISCOUNT_RE = /^\s*\(?\s*(descuento|desconto|desc\b\.?|dto\b\.?|discount|disc\b\.?|rebate|remise|rabatt|sconto|promo(ci[oó]n)?|cup[oó]n|coupon)/i;
  function classifyDiscounts(items) {
    var out = {}, list = items || [];
    var cand = list.filter(function (i) { return !isExtra(i) && lineTotal(i) < 0 && DISCOUNT_RE.test(i.name || ''); });
    if (!cand.length) return out;
    var pos = list.filter(function (i) { return !isExtra(i) && lineTotal(i) > 0; });
    var P = sum(pos.map(lineTotal));
    cand.forEach(function (d) {
      var amt = -lineTotal(d), m = /(\d+(?:[.,]\d+)?)\s*%/.exec(d.name || ''), pct = m ? parseFloat(m[1].replace(',', '.')) : null;
      var tol = Math.max(0.011, amt * 0.002);
      if (pct) {
        if (P > 0 && Math.abs(amt - P * pct / 100) <= tol) { out[d.id] = { kind: 'global' }; return; }
        var idx = list.indexOf(d), parent = null;
        for (var k = idx - 1; k >= 0 && !parent; k--) if (lineTotal(list[k]) > 0 && !isExtra(list[k]) && Math.abs(amt - lineTotal(list[k]) * pct / 100) <= tol) parent = list[k];
        for (var j = idx + 1; j < list.length && !parent; j++) if (lineTotal(list[j]) > 0 && !isExtra(list[j]) && Math.abs(amt - lineTotal(list[j]) * pct / 100) <= tol) parent = list[j];
        if (parent) out[d.id] = { kind: 'item', parentId: parent.id };
      } else if (P > 0) {
        var r = amt / P * 100;
        if (r >= 5 && r <= 50 && Math.abs(r - 5 * Math.round(r / 5)) <= 0.05) out[d.id] = { kind: 'global' };   // sin % en el nombre: solo porcentajes redondos (5, 10, 15, 20…)
      }
    });
    return out;
  }
  // base: lo que se asigna a personas · extras: cargos y descuentos globales · linked: descuentos de un plato (se aplican solos)
  function classify(items) {
    var disc = classifyDiscounts(items), base = [], extras = [], linked = [];
    (items || []).forEach(function (i) {
      var d = disc[i.id];
      if (d && d.kind === 'global') extras.push(i);
      else if (d && d.kind === 'item') linked.push(i);
      else if (isExtra(i)) extras.push(i);
      else base.push(i);
    });
    return { base: base, extras: extras, linked: linked, discounts: disc };
  }

  function cents(currency) { return root.DC_CURRENCIES.decimals(currency) === 0 ? 1 : 100; }

  function compute(input) {
    var items = input.items || [], people = input.people || [], assigns = input.assigns || {};
    var factor = cents(input.currency);
    var cl = classify(items), base = cl.base, extras = cl.extras, linked = cl.linked;
    var baseTotal = sum(base.map(lineTotal)) + sum(linked.map(lineTotal));
    var extrasTotal = sum(extras.map(lineTotal));
    var extrasRatio = baseTotal > 0 ? extrasTotal / baseTotal : 0;
    var tip = input.tip || null, subtotal = baseTotal + extrasTotal;
    var tipAmount = !tip ? 0 : tip.fixed != null ? Number(tip.fixed) || 0 : subtotal * (Number(tip.pct) || 0) / 100;
    var mul = baseTotal > 0 ? (subtotal + tipAmount) / baseTotal : 1;   // cuánto paga cada unidad de consumo

    // Consumo base (sin extras ni propina) por persona y por línea
    var byPerson = {}; people.forEach(function (p) { byPerson[p.id] = { base: 0, lines: [] }; });
    var unassignedBase = 0, unassignedNames = [], itemShares = {};
    base.forEach(function (it) {
      var a = assigns[it.id] || {}, who = (a.people || []).filter(function (pid) { return byPerson[pid]; });
      var units = a.units || {};
      var unitSum = who.reduce(function (s, pid) { return s + (units[pid] || 0); }, 0);
      if (it.qty > 1 && unitSum > 0) {
        who.forEach(function (pid) {
          var u = units[pid] || 0; if (!u) return;
          add(pid, it, it.price * u, u);
        });
        var left = it.qty - unitSum;
        if (left > 0) { unassignedBase += it.price * left; unassignedNames.push(it.name + ' (' + left + ')'); }
      } else if (who.length) {
        var share = lineTotal(it) / who.length;
        who.forEach(function (pid) { add(pid, it, share, it.qty > 1 ? it.qty : null, who.length > 1); });
      } else {
        unassignedBase += lineTotal(it); unassignedNames.push(it.name);
      }
    });
    function add(pid, it, amount, units, shared) {
      byPerson[pid].base += amount;
      (itemShares[it.id] = itemShares[it.id] || {})[pid] = ((itemShares[it.id] || {})[pid] || 0) + amount;
      byPerson[pid].lines.push({ itemId: it.id, name: it.name, units: units, shared: !!shared, base: amount });
    }

    // Descuento de un plato: lo absorben quienes consumieron ese plato, en proporción a lo que consumió cada uno
    linked.forEach(function (d) {
      var parent = items.filter(function (i) { return i.id === cl.discounts[d.id].parentId; })[0], sh = itemShares[parent.id] || {};
      var pt = lineTotal(parent), dt = lineTotal(d), assigned = 0;
      Object.keys(sh).forEach(function (pid) { assigned += sh[pid]; add(pid, d, dt * sh[pid] / pt, null, true); });
      if (pt - assigned > 1e-9) { unassignedBase += dt * (pt - assigned) / pt; unassignedNames.push(d.name); }
    });

    // Montos exactos: se redondea el total de cada persona y se reparten los centavos sobrantes
    var grandTotal = round(subtotal + tipAmount, factor);
    var raw = people.map(function (p) { return byPerson[p.id].base * mul; });
    var unassigned = round(unassignedBase * mul, factor);
    var target = round(grandTotal - unassigned, factor);
    var amounts = largestRemainder(raw, target, factor);
    var perPerson = people.map(function (p, i) {
      return {
        id: p.id, name: p.name, amount: amounts[i],
        base: byPerson[p.id].base,
        extras: byPerson[p.id].base * extrasRatio,
        tip: byPerson[p.id].base * (mul - 1 - extrasRatio),
        lines: byPerson[p.id].lines.map(function (l) { return Object.assign({}, l, { amount: l.base * mul }); })
      };
    });
    return {
      perPerson: perPerson, unassigned: unassigned, unassignedNames: unassignedNames,
      grandTotal: grandTotal, baseTotal: baseTotal, extrasTotal: extrasTotal, extrasRatio: extrasRatio,
      tipAmount: tipAmount, extras: extras
    };
  }

  function lineTotal(it) { return (Number(it.price) || 0) * (Number(it.qty) || 1); }
  function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
  function round(v, factor) { return Math.round(v * factor) / factor; }
  function largestRemainder(values, target, factor) {
    if (!values.length) return [];
    var units = values.map(function (v) { return v * factor; });
    var floors = units.map(Math.floor);
    var left = Math.round(target * factor) - sum(floors);
    var order = units.map(function (u, i) { return [u - floors[i], i]; })
      .sort(function (a, b) { return b[0] - a[0]; });
    for (var k = 0; k < order.length && left > 0; k++, left--) floors[order[k][1]]++;
    for (var k2 = order.length - 1; k2 >= 0 && left < 0; k2--, left++) floors[order[k2][1]]--;
    return floors.map(function (f) { return f / factor; });
  }

  root.DC_SPLIT = { compute: compute, isExtra: isExtra, classify: classify };
})(typeof globalThis !== 'undefined' ? globalThis : this);
