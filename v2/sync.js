// Cuentas compartidas: habla con Supabase (crear, unirse, marcar, tiempo real).
// Se carga solo si hay configuración de Supabase; si no, la app funciona igual en un solo teléfono.
// Las reglas de quién puede hacer qué viven en la base de datos (ver docs/CUENTAS_COMPARTIDAS.md),
// no aquí: este archivo solo pide, y la base acepta o rechaza.
(function (root) {
  'use strict';
  var CFG = root.DC_CONFIG || {};
  var sb = null, channel = null, onChange = null, state = { billId: null, memberId: null, token: null, role: null };

  function ready() { return !!sb; }

  // La librería de Supabase carga aparte (async) para no frenar la app: aquí se espera a que llegue (máx. 10 s).
  function whenLibrary() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function check() {
        if (root.supabase) return resolve(true);
        if (++tries > 100) return resolve(false);
        setTimeout(check, 100);
      })();
    });
  }

  function init() {
    if (sb) return Promise.resolve(sb);
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return Promise.resolve(null);
    return whenLibrary().then(function (ok) { return ok ? connect() : null; });
  }

  function connect() {
    if (sb) return Promise.resolve(sb);
    sb = root.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dc_v2_auth' }
    });
    // Identidad anónima: el invitado no se registra, pero la base sabe quién es.
    return sb.auth.getSession().then(function (r) {
      if (r.data && r.data.session) return sb;
      return sb.auth.signInAnonymously().then(function (res) {
        if (res.error) { console.warn('auth anónima falló:', res.error.message); sb = null; }
        return sb;
      });
    }).catch(function () { sb = null; return null; });
  }

  // ── Crear y compartir ──────────────────────────────────────────────────────
  function createBill(hostName, bill) {
    return init().then(function (c) {
      if (!c) throw new Error('SIN_CONEXION');
      return c.rpc('dc_create_bill', { p_name: hostName || 'Yo', p_currency: bill.currency || 'CLP' });
    }).then(function (r) {
      if (r.error || !r.data || !r.data.length) throw new Error(r.error ? r.error.message : 'NO_CREADA');
      var row = r.data[0];
      state = { billId: row.out_bill_id, memberId: row.out_member_id, token: row.out_share_token, role: 'host' };
      return pushBill(bill).then(function () { return state; });
    });
  }

  // El anfitrión manda la boleta completa (ítems, propina, moneda). Los invitados no pueden.
  // Si la base aún no tiene las columnas nuevas (migración 20261004 sin correr), se publica sin ellas y todo sigue funcionando.
  var extrasOk = true;
  function pushBill(bill) {
    if (!sb || !state.billId || state.role !== 'host') return Promise.resolve();
    var base = {
      restaurant: bill.restaurant || null, currency: bill.currency, country_code: bill.countryCode || null,
      items: bill.items || [], tip: bill.tip || null, receipt_total: bill.receiptTotal || null
    };
    function send(withExtras) {
      var row = base;
      if (withExtras) row = Object.assign({}, base, {
        // La lista de nombres (para que el invitado elija el suyo) y lo que ya se marcó a quienes aún no entran.
        people: (bill.people || []).map(function (p) { return { id: String(p.id), name: p.name }; }),
        pre_assigns: preAssigns(bill),
        pay_info: bill.payInfo ? String(bill.payInfo).slice(0, 400) : null
      });
      return sb.from('dc_bills').update(row).eq('id', state.billId);
    }
    return send(extrasOk).then(function (r) {
      if (r.error && extrasOk && /people|pre_assigns|pay_info|column/i.test(r.error.message)) { extrasOk = false; return send(false); }
      return r;
    }).then(function (r) { if (r && r.error) console.warn('pushBill:', r.error.message); else ping(); });
  }

  // Marcas del anfitrión para personas que todavía no entran: {idPersona: {idÍtem: unidades|null}}.
  function preAssigns(bill) {
    var out = {};
    (bill.people || []).forEach(function (p) {
      if (p.memberId) return;
      var m = {};
      Object.keys(bill.assigns || {}).forEach(function (iid) {
        var a = bill.assigns[iid];
        if ((a.people || []).indexOf(p.id) > -1) m[iid] = (a.units && a.units[p.id] != null) ? a.units[p.id] : null;
      });
      if (Object.keys(m).length) out[String(p.id)] = m;
    });
    return out;
  }

  // Antes de entrar: con solo el link, trae el nombre del lugar y la lista de nombres (y cuáles ya están tomados).
  function peekBill(token) {
    return init().then(function (c) {
      if (!c) throw new Error('SIN_CONEXION');
      return c.rpc('dc_peek_bill', { p_token: token });
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message === 'TOO_MANY_ATTEMPTS' ? 'DEMASIADOS_INTENTOS' : r.error.message);
      if (!r.data || !r.data.length) throw new Error('LINK_INVALIDO');
      var row = r.data[0];
      return { restaurant: row.out_restaurant, currency: row.out_currency, people: row.out_people || [], taken: row.out_taken || [] };
    });
  }

  function joinBill(token, name, personId) {
    return init().then(function (c) {
      if (!c) throw new Error('SIN_CONEXION');
      var args = { p_token: token, p_name: name };
      if (personId != null) args.p_person = String(personId);   // sin persona elegida se usa la firma de siempre
      return c.rpc('dc_join_bill', args);
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message === 'TOO_MANY_ATTEMPTS' ? 'DEMASIADOS_INTENTOS'
        : /NAME_TAKEN/.test(r.error.message) ? 'NOMBRE_TOMADO' : r.error.message);
      if (!r.data || !r.data.length) throw new Error('LINK_INVALIDO');   // token malo, cuenta cerrada o expirada
      state = { billId: r.data[0].out_bill_id, memberId: r.data[0].out_member_id, token: token, role: 'guest' };
      return state;
    });
  }

  // ── Leer y escuchar ────────────────────────────────────────────────────────
  function fetchAll() {
    if (!sb || !state.billId) return Promise.resolve(null);
    return Promise.all([
      sb.from('dc_bills').select('*').eq('id', state.billId).maybeSingle(),
      sb.from('dc_bill_members').select('*').eq('bill_id', state.billId).order('joined_at'),
      sb.from('dc_claims').select('*').eq('bill_id', state.billId)
    ]).then(function (res) {
      if (res[0].error || !res[0].data) return null;
      return { bill: res[0].data, members: res[1].data || [], claims: res[2].data || [] };
    });
  }

  // Tiempo real: cada cambio que hace un teléfono avisa por el canal de la cuenta ("cambió algo", sin datos) y los demás releen
  // con sus propios permisos. Así se ve en una fracción de segundo; la consulta periódica de la app queda como respaldo.
  var live = false, refetchTimer = null;
  function isLive() { return live; }
  function ping() {
    try { if (channel && live) channel.send({ type: 'broadcast', event: 'changed', payload: {} }); } catch (e) {}
  }
  function refetchSoon() {   // junta varios avisos seguidos en una sola lectura
    clearTimeout(refetchTimer);
    refetchTimer = setTimeout(function () { fetchAll().then(function (d) { if (d && onChange) onChange(d); }); }, 80);
  }

  function subscribe(cb) {
    onChange = cb;
    if (!sb || !state.billId || channel) return;
    channel = sb.channel('bill-' + state.billId, { config: { broadcast: { self: false } } });
    ['dc_bills', 'dc_bill_members', 'dc_claims'].forEach(function (table) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: table, filter: (table === 'dc_bills' ? 'id=eq.' : 'bill_id=eq.') + state.billId },
        refetchSoon);
    });
    channel.on('broadcast', { event: 'changed' }, refetchSoon);
    channel.subscribe(function (status) {
      live = status === 'SUBSCRIBED';
      if (live) ping();   // "acabo de entrar": el anfitrión me ve al instante
    });
  }

  function leave() {
    if (channel && sb) { sb.removeChannel(channel); channel = null; }
    live = false;
    state = { billId: null, memberId: null, token: null, role: null };
  }

  // ── Marcar lo que consumí ──────────────────────────────────────────────────
  // units = null → comparte la línea completa; un número → esas unidades.
  // memberId opcional: el anfitrión marca por otro miembro de su cuenta (la base lo permite solo al dueño).
  function setClaim(itemId, units, memberId) {
    var mid = memberId || state.memberId;
    if (!sb || !state.billId || !mid) return Promise.resolve();
    return sb.from('dc_claims').upsert({
      bill_id: state.billId, member_id: mid, item_id: String(itemId), units: units == null ? null : units
    }, { onConflict: 'bill_id,member_id,item_id' }).then(function (r) { if (r.error) { console.warn('setClaim:', r.error.message); return { error: r.error }; } ping(); });
  }
  function clearClaim(itemId, memberId) {
    var mid = memberId || state.memberId;
    if (!sb || !state.billId || !mid) return Promise.resolve();
    return sb.from('dc_claims').delete()
      .eq('bill_id', state.billId).eq('member_id', mid).eq('item_id', String(itemId))
      .then(function (r) { if (r.error) { console.warn('clearClaim:', r.error.message); return { error: r.error }; } ping(); });
  }
  // El anfitrión marca cuál de la lista es él; y puede sacar a alguien de la cuenta.
  function setPersonKey(key) {
    if (!sb || !state.memberId) return Promise.resolve();
    // OJO: las consultas de supabase-js no se envían hasta el .then().
    return sb.from('dc_bill_members').update({ person_key: String(key) }).eq('id', state.memberId)
      .then(function (r) { if (r.error) console.warn('setPersonKey:', r.error.message); else ping(); });
  }
  function removeMember(memberId) {
    if (!sb || !memberId || state.role !== 'host') return Promise.resolve();
    return sb.from('dc_bill_members').delete().eq('id', memberId)
      .then(function (r) { if (r.error) console.warn('removeMember:', r.error.message); else ping(); });
  }
  function closeBill() {
    if (!sb || !state.billId || state.role !== 'host') return Promise.resolve();
    return sb.from('dc_bills').update({ status: 'closed' }).eq('id', state.billId).then(function () {});
  }

  // Al recargar la página se pierde el estado de este módulo: lo restauramos desde el borrador.
  function resume(saved) {
    if (!saved || !saved.billId) return Promise.resolve(null);
    return init().then(function (c) {
      if (!c) return null;
      return c.auth.getSession().then(function (u) {
        var uid = u && u.data && u.data.session && u.data.session.user && u.data.session.user.id;
        state = { billId: saved.billId, memberId: saved.memberId || null, token: saved.token || null, role: saved.role || null };
        if (state.memberId) return state;
        // Recuperar mi member_id a partir de mi usuario
        return c.from('dc_bill_members').select('id').eq('bill_id', state.billId).eq('user_id', uid)
          .maybeSingle().then(function (r) { if (r.data) state.memberId = r.data.id; return state; });
      });
    }).catch(function () { return null; });
  }

  // Marcar que alguien ya pagó (él mismo, o el anfitrión por él). Devuelve { error } si la base lo rechaza.
  function setPaid(memberId, paid) {
    if (!sb || !memberId) return Promise.resolve({ error: { message: 'SIN_CONEXION' } });
    return sb.rpc('dc_set_paid', { p_member: memberId, p_paid: !!paid }).then(function (r) { if (r.error) return { error: r.error }; ping(); return {}; });
  }

  // Quiénes ya pagaron en una cuenta (para "Cobros pendientes"). Devuelve [] si no hay conexión o permiso.
  function fetchMembers(billId) {
    return init().then(function (c) {
      if (!c || !billId) return [];
      return c.from('dc_bill_members').select('id,name,paid_at').eq('bill_id', billId).then(function (r) { return r.error ? [] : (r.data || []); });
    }).catch(function () { return []; });
  }

  // Sesión anónima del usuario (jwt) para identificarlo ante /api/scan-receipt (cuota de lecturas). null si no hay conexión; nunca rechaza.
  function accessToken() {
    return init().then(function (c) {
      if (!c) return null;
      return c.auth.getSession().then(function (r) { return (r.data && r.data.session && r.data.session.access_token) || null; });
    }).catch(function () { return null; });
  }

  // Métricas de uso sin contenido (ver supabase/migrations/20261009_events.sql). Silencioso: nunca interrumpe ni muestra errores.
  function track(ev, props) {
    (sb ? Promise.resolve(sb) : init()).then(function (c) { return c && c.rpc('dc_track_event', { p_event: ev, p_props: props || {} }); }).catch(function () {});
  }

  root.DC_SYNC = {
    track: track, accessToken: accessToken,
    ready: ready, init: init, resume: resume, createBill: createBill, pushBill: pushBill, peekBill: peekBill, joinBill: joinBill, setPersonKey: setPersonKey, removeMember: removeMember,
    fetchAll: fetchAll, subscribe: subscribe, leave: leave,
    setClaim: setClaim, clearClaim: clearClaim, closeBill: closeBill, setPaid: setPaid, fetchMembers: fetchMembers, isLive: isLive,
    get state() { return state; },
    // Para pruebas: permite reemplazar el cliente de Supabase por uno falso.
    _setClient: function (c) { sb = c; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
