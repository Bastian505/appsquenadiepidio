// DiviCuenta v2 — idiomas de la interfaz (español e inglés).
// La clave es el texto en español: sin entrada en EN se muestra tal cual, así el español no puede romperse y
// una cadena nueva sin traducir sale en español (tests/check-i18n.mjs avisa si falta). {x} marca un dato que se inserta.
(function () {
  'use strict';
  var KEY = 'dc_lang';
  var LANGS = { es: { name: 'Español', locale: 'es-CL', dec: ',' }, en: { name: 'English', locale: 'en-US', dec: '.' } };
  function detect() {
    try { var s = localStorage.getItem(KEY); if (LANGS[s]) return s; } catch (e) {}
    return /^es\b/i.test(String(navigator.language || 'es')) ? 'es' : 'en';
  }
  var lang = detect();

  var EN = {
    // ── comunes ──
    'Volver': 'Back', 'Nueva cuenta': 'New bill', 'Paso {i} de 4': 'Step {i} of 4', 'Cuenta': 'Bill', 'La cuenta': 'The bill',
    'Cambiar idioma': 'Change language', 'Copiado': 'Copied', 'No se pudo copiar': 'Could not copy', 'Ítem': 'Item', 'Impuesto': 'Tax',
    'Menos': 'Fewer', 'Más': 'More', 'Total': 'Total', 'Propina': 'Tip', 'Consumo': 'Subtotal', 'Impuesto y cargos': 'Tax and charges',
    '{n} ítem': '{n} item', '{n} ítems': '{n} items', 'Sin asignar': 'Unassigned', 'nada asignado aún': 'nothing assigned yet',
    'Reparto: {x}': 'Split: {x}', 'Boleta': 'Receipt', 'Tu cuenta': 'Your bill', 'Tu boleta': 'Your receipt',
    // ── sugerencias de ítems que no cuadran ──
    'Si este ítem no va, la suma cuadra.': 'If this item doesn\'t belong, the total adds up.',
    '¿Es una unidad menos? Con {n} cuadra.': 'One unit fewer? With {n} it adds up.',
    // ── imagen para compartir ──
    'PAGÓ': 'PAID', 'PAGADA': 'PAID IN FULL', 'Hecho con DiviCuenta · saca la foto, nosotros hacemos la matemática': 'Made with DiviCuenta · snap the receipt, we do the math',
    'No pudimos crear la imagen': 'Could not create the image', 'Imagen descargada': 'Image downloaded',
    // ── cobros pendientes ──
    'Cobros pendientes': 'Pending payments', 'Lo que aún te deben de cuentas anteriores.': 'What you are still owed from past bills.',
    'Recordarle a {name} por WhatsApp': 'Remind {name} on WhatsApp', 'Recordar': 'Remind', 'Ya pagó': 'Paid',
    // ── mensajes de WhatsApp ──
    'Hola {name}! 👋 La cuenta{de} fue {total} y tu parte es {part}.': 'Hi {name}! 👋 The bill{de} was {total} and your share is {part}.',
    ' de {r}': ' at {r}', 'Para transferir a {payer}:': 'To transfer to {payer}:', 'Para transferir:': 'To transfer:', '¡Gracias!': 'Thank you!',
    'Dividamos la cuenta: {link}': 'Let\'s split the bill: {link}',
    '— total {x}': '— total {x}', '✓ pagó': '✓ paid', 'Pagó {name}': '{name} paid', '. Para transferir: {x}': '. To transfer: {x}',
    'Impuesto y cargos repartidos según lo que consumió cada uno.': 'Tax and charges are split according to what each person had.',
    'Dividido con DiviCuenta · {url}': 'Split with DiviCuenta · {url}',
    // ── inicio ──
    'Boletas de más de 40 países': 'Receipts from 40+ countries', 'Divide la cuenta en segundos.': 'Split the bill in seconds.',
    'Saca una foto de la boleta, marca quién comió qué y listo: impuesto, servicio y propina repartidos de forma justa.': 'Snap the receipt, tick who had what, done: tax, service and tip shared fairly.',
    'Escanear boleta': 'Scan receipt', 'Foto o imagen de la galería': 'Photo or image from your gallery', 'Ingresar ítems a mano': 'Enter items by hand',
    'Registro del último intento de lectura': 'Log of the last scan attempt', 'Borrar registro': 'Clear log', 'Error técnico: {x}': 'Technical error: {x}',
    'Saca la foto. Nosotros hacemos la matemática.': 'Snap the receipt. We do the math.',
    'Saca la foto: leemos ítems, cantidades y moneda.': 'Take the photo: we read items, quantities and currency.',
    'Agrega a tus amigos y marca qué consumió cada uno.': 'Add your friends and tick what each one had.',
    'Cada uno ve cuánto paga, también en su moneda.': 'Everyone sees what they owe, in their own currency too.',
    // ── lectura ──
    'Subiendo foto': 'Uploading photo', 'Leyendo ítems y precios': 'Reading items and prices', 'Validando con el total impreso': 'Checking against the printed total',
    'Leyendo boleta': 'Reading receipt', 'Las cuentas largas pueden tardar hasta un minuto.': 'Long bills can take up to a minute.',
    '¿De qué país es la boleta?': 'Which country is the receipt from?', 'No pudimos identificar la moneda.': 'We could not identify the currency.',
    // ── revisión ──
    'La suma no coincide con la boleta.': 'The total doesn\'t match the receipt.',
    'Total impreso {printed}, ítems {sum} ({dir} {diff}, {pct}%). ': 'Printed total {printed}, items {sum} ({dir} {diff}, {pct}%). ',
    'faltan': 'missing', 'sobran': 'extra',
    'Marqué en rojo lo que explica la diferencia.': 'I marked in red what explains the difference.',
    'La diferencia es justo el {n} % de los ítems: parece un servicio o propina sumado al total.': 'The difference is exactly {n} % of the items: it looks like a service charge or tip added to the total.',
    'Puede faltar un ítem o el impuesto. Si la foto salió torcida, cortada o con sombra, sacar otra suele resolverlo.': 'An item or the tax may be missing. If the photo is crooked, cropped or shadowed, taking another usually fixes it.',
    'Revisa los precios y las cantidades. Si la foto salió torcida, cortada o con sombra, sacar otra suele resolverlo.': 'Check the prices and quantities. If the photo is crooked, cropped or shadowed, taking another usually fixes it.',
    'Es el servicio del {n} % ({diff})': 'It\'s the {n} % service charge ({diff})', '+ Agregar lo que falta ({diff})': '+ Add what\'s missing ({diff})', 'Sacar otra foto': 'Take another photo',
    'El total impreso ({printed}) incluye un servicio del {n} %. Actívalo en Propina para que la cuenta sume lo mismo.': 'The printed total ({printed}) includes a {n} % service charge. Turn it on under Tip so the bill adds up the same.',
    'Aplicar servicio del {n} %': 'Apply {n} % service charge',
    '✓ Cuadra con el total impreso de la boleta ({printed})': '✓ Matches the printed total on the receipt ({printed})', ': ítems + servicio del {n} %': ': items + {n} % service charge',
    'Corregí la lectura:': 'I corrected the reading:', 'Entendido': 'Got it',
    ' · toca un nombre o precio para corregirlo': ' · tap a name or price to fix it', '+ Agregar ítem': '+ Add item',
    'se reparten según consumo': 'split by what each person had',
    'Sin impuesto ni cargos aparte en esta boleta.': 'No separate tax or charges on this receipt.', '+ Agregar impuesto o cargo': '+ Add tax or charge',
    'Agregar personas →': 'Add people →',
    'Nombre': 'Name', 'traduciendo…': 'translating…', 'Cantidad': 'Quantity', 'Precio unitario': 'Unit price', 'revisar': 'check',
    'Eliminar {name}': 'Delete {name}', 'Dejar en {n}': 'Set to {n}', 'Quitar ítem': 'Remove item',
    'Ej. 12': 'e.g. 12', 'Monto': 'Amount', 'Propina en porcentaje': 'Tip as a percentage', 'Propina en monto': 'Tip as an amount',
    'Monto {x}': 'Amount {x}', 'Otro monto': 'Other amount', 'Otro %': 'Other %', 'Sin propina': 'No tip', ' · sugerida': ' · suggested',
    'En tu moneda:': 'In your currency:', 'Tu moneda': 'Your currency',
    // ── personas ──
    '¿Quiénes están?': 'Who\'s here?', 'Agregar': 'Add', 'Agrega a todos los que comparten la cuenta, incluyéndote.': 'Add everyone sharing the bill, including yourself.',
    'Quitar': 'Remove', 'Que cada uno marque en su teléfono': 'Everyone marks on their own phone',
    'Compartes un link: tus amigos entran sin registrarse y marcan lo suyo.': 'You share a link: your friends join without signing up and mark their own items.',
    'Asignar ítems →': 'Assign items →',
    'Cuenta compartida': 'Shared bill', 'en vivo': 'live', 'Conectados: {x}': 'Connected: {x}', 'Esperando a que entren tus amigos…': 'Waiting for your friends to join…',
    'Copiar link': 'Copy link', 'Ver QR': 'Show QR', 'Compartir la cuenta': 'Share the bill', 'Generando código…': 'Generating code…',
    'Que escaneen este código o abran el link': 'Have them scan this code or open the link', 'Copiar': 'Copy',
    'El link caduca en 24 horas. Cada uno marca lo suyo y tú ves los totales al instante.': 'The link expires in 24 hours. Everyone marks their own and you see the totals instantly.',
    'Seguir →': 'Continue →', 'Usa el link de abajo': 'Use the link below',
    // ── invitado ──
    '¿Quién eres? Toca tu nombre:': 'Who are you? Tap your name:', 'ya entró': 'already in', 'Soy yo →': 'That\'s me →', 'Mi nombre no está en la lista': 'My name isn\'t on the list',
    'Te invitaron a dividir una cuenta': 'You\'ve been invited to split a bill', ' en {r}': ' at {r}',
    'Elige tu nombre y marca lo que consumiste. No necesitas registrarte.': 'Pick your name and mark what you had. No sign-up needed.',
    'Escribe tu nombre y marca lo que consumiste. No necesitas registrarte.': 'Type your name and mark what you had. No sign-up needed.',
    'Cargando la invitación…': 'Loading the invitation…', 'Tu nombre': 'Your name', 'Entrando…': 'Joining…', 'Entrar': 'Join',
    'Ese link ya no sirve: la cuenta se cerró o venció.': 'This link no longer works: the bill was closed or expired.',
    'Demasiados intentos. Espera unos minutos.': 'Too many attempts. Wait a few minutes.', 'Ese nombre ya lo eligió otra persona. Elige otro.': 'Someone else already picked that name. Choose another.',
    'No se pudo entrar. Revisa tu conexión.': 'Could not join. Check your connection.',
    // ── voz ──
    'Asignar hablando': 'Assign by voice', 'prueba': 'beta', 'Deshacer lo último': 'Undo last', 'Cerrar': 'Close',
    'Cuenta quién comió qué. Ej.: «yo el bife, {x} la pizza, la cerveza entre los dos»': 'Say who had what. E.g. “I had the steak, {x} the pizza, the beer is shared”',
    'Habla o escribe aquí…': 'Speak or type here…', '● Escuchando…': '● Listening…', 'Hablar': 'Speak', 'Tip: usa el micrófono del teclado para dictar.': 'Tip: use your keyboard\'s microphone to dictate.',
    'Interpretando…': 'Interpreting…', 'Interpretar': 'Interpret', 'Esto entendí (revísalo antes de aplicar):': 'Here\'s what I understood (check before applying):',
    'No pude emparejar nada. Prueba con los nombres tal como aparecen.': 'I couldn\'t match anything. Try the names exactly as they appear.', 'Aplicar': 'Apply', 'Descartar': 'Discard',
    'Muchos intentos seguidos. Espera un minuto.': 'Too many attempts in a row. Wait a minute.', 'No pude interpretarlo ahora. Puedes marcar a mano.': 'I couldn\'t interpret that now. You can mark by hand.',
    'No hay conexión. Puedes marcar a mano.': 'No connection. You can mark by hand.', 'Listo: revisa y ajusta lo que haga falta': 'Done: review and adjust as needed', 'Deshecho': 'Undone',
    'No pude escuchar. Escribe o usa el micrófono del teclado.': 'I couldn\'t hear you. Type, or use your keyboard\'s microphone.',
    // ── asignar ──
    '¿Quién consumió qué?': 'Who had what?', '{done} de {n} ítems asignados': '{done} of {n} items assigned', 'Compartir todo': 'Split everything', 
    'Ver cuánto paga cada uno →': 'See what everyone pays →', 'Marca lo tuyo': 'Mark yours', 'Lo que llevas': 'Your total', '¿Cuántas tomaste?': 'How many did you have?',
    '✓ Lo consumí': '✓ I had it', 'Marcar': 'Mark', 'También: {x}': 'Also: {x}', 'Nadie más lo marcó': 'Nobody else marked it', 'Ver el total →': 'See the total →',
    'Unidades repartidas ✓': 'Units assigned ✓', 'Se pasaron {n} unidades: ajusten': '{n} units too many: adjust', 'Faltan {n} de {q} unidades': '{n} of {q} units left',
    'Se divide en partes iguales entre {n}': 'Split equally among {n}', 'Lo paga {name}': '{name} pays', 'Repartir por unidades (ej. 2 y 3)': 'Split by units (e.g. 2 and 3)',
    'Quitar todos': 'Remove all', 'Todos': 'Everyone',
    'No se pudo guardar esa marca': 'Could not save that mark', 'Ya se repartieron todas las unidades': 'All units have already been taken',
    // ── cobro y resumen ──
    '✓ Ya le pagaste a {name}': '✓ You already paid {name}', 'Le debes {amt} a {name}': 'You owe {amt} to {name}', 'Cobro': 'Payment', '¿Quién pagó la cuenta?': 'Who paid the bill?',
    'Pagó {name}: a esa persona se le paga.': '{name} paid: that person gets paid back.', '✓ Pagó': '✓ Paid', 'Ya pagué': 'I paid', 'Marcar pagado': 'Mark as paid', 'Pendiente': 'Pending',
    'Falta por pagar {x}': 'Still to be paid: {x}', '✓ Todos pagaron': '✓ Everyone paid',
    'Datos para que te transfieran (opcional) · se recuerdan en este teléfono': 'Details for transfers (optional) · remembered on this phone',
    'Alias, cuenta, RUT, CLABE…': 'Account, IBAN, Venmo, PayPal…', 'Transferir a {name}': 'Transfer to {name}', 'Copiar datos': 'Copy details',
    'No se pudo guardar el pago': 'Could not save the payment',
    'Revisa: las cuentas no suman el total': 'Check: the shares don\'t add up to the total', 'Cuentas + sin asignar = total': 'Shares + unassigned = total',
    '✓ Todo repartido: las cuentas suman el total': '✓ All assigned: the shares add up to the total',
    'Cuánto paga cada uno': 'What everyone pays', 'Pagada': 'Paid', 'Total de la cuenta': 'Bill total', 'Todos pagaron. Cuenta cerrada.': 'Everyone paid. Bill closed.',
    'Compartir como imagen': 'Share as image', 'Falta asignar {x}:': 'Still to assign {x}:', 'Asignar': 'Assign', 'Pagó': 'Paid', 'Ver detalle': 'See details',
    ' (compartido)': ' (shared)', 'Impuesto y cargos ({pct}%)': 'Tax and charges ({pct}%)',
    // ── acciones y avisos ──
    '¿Empezar una cuenta nueva? Se borra la actual.': 'Start a new bill? The current one will be deleted.', 'Ítem 1': 'Item 1', 'Nuevo ítem': 'New item', 'Ítem que faltaba': 'Missing item',
    'Agregué lo que falta. Toca el nombre para corregirlo.': 'I added what\'s missing. Tap the name to fix it.', 'Servicio del {n} % aplicado': '{n} % service charge applied',
    'Todo se divide entre todos': 'Everything is split among everyone',
    // ── lectura de la boleta ──
    'Procesando la foto…': 'Processing the photo…', 'No pudimos procesar esa foto. Prueba con otra o con una captura de pantalla.': 'We couldn\'t process that photo. Try another one or a screenshot.',
    'Demasiados escaneos seguidos. Espera un minuto.': 'Too many scans in a row. Wait a minute.', 'No pudimos leer la boleta. Prueba con otra foto o ingresa los ítems a mano.': 'We couldn\'t read the receipt. Try another photo or enter the items by hand.',
    'No encontramos ítems. Prueba con una foto más nítida y con la boleta completa.': 'We found no items. Try a sharper photo showing the whole receipt.',
    'La lectura tardó demasiado. Intenta de nuevo.': 'Reading took too long. Try again.', 'Sin conexión. Revisa tu internet e intenta de nuevo.': 'No connection. Check your internet and try again.',
    'Boleta leída · te quedan {n} lectura este mes': 'Receipt read · {n} scan left this month', 'Boleta leída · te quedan {n} lecturas este mes': 'Receipt read · {n} scans left this month',
    'Boleta leída · {n} líneas': 'Receipt read · {n} lines',
    'No pudimos abrir esa imagen. Si es una foto HEIC, prueba sacándola de nuevo o con una captura.': 'We couldn\'t open that image. If it\'s a HEIC photo, retake it or use a screenshot.',
    'No pudimos leer el archivo de la foto.': 'We couldn\'t read the photo file.',
    // ── cuentas compartidas ──
    'Creando el link…': 'Creating the link…', 'Listo: comparte el link': 'Ready: share the link', 'No se pudo conectar. Sigue en este teléfono.': 'Could not connect. Keep going on this phone.',
    'No se pudo compartir': 'Could not share'
  };

  function t(es, vars) {
    var s = lang === 'en' && EN[es] != null ? EN[es] : es;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }) : s;
  }
  function set(l) {
    if (!LANGS[l]) return;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l;
  }
  document.documentElement.lang = lang;
  window.DC_I18N = { t: t, set: set, EN: EN, LANGS: LANGS,
    get lang() { return lang; }, get locale() { return LANGS[lang].locale; }, get dec() { return LANGS[lang].dec; } };
})();
