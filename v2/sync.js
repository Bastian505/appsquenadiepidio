// Cuentas compartidas: habla con Supabase (crear, unirse, marcar, tiempo real).
// Se carga solo si hay configuración de Supabase; si no, la app funciona igual en un solo teléfono.
// Las reglas de quién puede hacer qué viven en la base de datos (ver docs/CUENTAS_COMPARTIDAS.md),
// no aquí: este archivo solo pide, y la base acepta o rechaza.
(function (root) {
  'use strict';
  var CFG = root.DC_CONFIG || {};
  var sb = null, channel = null, onChange = null, state = { billId: null, memberId: null, token: null, role: null };

  function ready() { return !!sb; }

  function init() {
    if (sb) return Promise.resolve(sb);
    if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !root.supabase) return Promise.resolve(null);
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
  function pushBill(bill) {
    if (!sb || !state.billId || state.role !== 'host') return Promise.resolve();
    return sb.from('dc_bills').update({
      restaurant: bill.restaurant || null, currency: bill.currency, country_code: bill.countryCode || null,
      items: bill.items || [], tip: bill.tip || null, receipt_total: bill.receiptTotal || null
    }).eq('id', state.billId).then(function (r) { if (r.error) console.warn('pushBill:', r.error.message); });
  }

  function joinBill(token, name) {
    return init().then(function (c) {
      if (!c) throw new Error('SIN_CONEXION');
      return c.rpc('dc_join_bill', { p_token: token, p_name: name });
    }).then(function (r) {
      if (r.error) throw new Error(r.error.message === 'TOO_MANY_ATTEMPTS' ? 'DEMASIADOS_INTENTOS' : r.error.message);
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

  function subscribe(cb) {
    onChange = cb;
    if (!sb || !state.billId || channel) return;
    channel = sb.channel('bill-' + state.billId);
    ['dc_bills', 'dc_bill_members', 'dc_claims'].forEach(function (table) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: table, filter: (table === 'dc_bills' ? 'id=eq.' : 'bill_id=eq.') + state.billId },
        function () { fetchAll().then(function (d) { if (d && onChange) onChange(d); }); });
    });
    channel.subscribe();
  }

  function leave() {
    if (channel && sb) { sb.removeChannel(channel); channel = null; }
    state = { billId: null, memberId: null, token: null, role: null };
  }

  // ── Marcar lo que consumí ──────────────────────────────────────────────────
  // units = null → comparte la línea completa; un número → esas unidades.
  function setClaim(itemId, units) {
    if (!sb || !state.billId || !state.memberId) return Promise.resolve();
    return sb.from('dc_claims').upsert({
      bill_id: state.billId, member_id: state.memberId, item_id: String(itemId), units: units == null ? null : units
    }, { onConflict: 'bill_id,member_id,item_id' }).then(function (r) { if (r.error) console.warn('setClaim:', r.error.message); });
  }
  function clearClaim(itemId) {
    if (!sb || !state.billId || !state.memberId) return Promise.resolve();
    return sb.from('dc_claims').delete()
      .eq('bill_id', state.billId).eq('member_id', state.memberId).eq('item_id', String(itemId))
      .then(function (r) { if (r.error) console.warn('clearClaim:', r.error.message); });
  }
  function closeBill() {
    if (!sb || !state.billId || state.role !== 'host') return Promise.resolve();
    return sb.from('dc_bills').update({ status: 'closed' }).eq('id', state.billId);
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

  root.DC_SYNC = {
    ready: ready, init: init, resume: resume, createBill: createBill, pushBill: pushBill, joinBill: joinBill,
    fetchAll: fetchAll, subscribe: subscribe, leave: leave,
    setClaim: setClaim, clearClaim: clearClaim, closeBill: closeBill,
    get state() { return state; },
    // Para pruebas: permite reemplazar el cliente de Supabase por uno falso.
    _setClient: function (c) { sb = c; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
