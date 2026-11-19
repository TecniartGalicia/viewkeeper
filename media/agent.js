// Agente de ViewKeeper. Lo inyecta el proxy en cada documento HTML y corre DENTRO de la página del usuario.
// Reglas: ES2017 sin dependencias; no toca nada si no está en una celda; solo habla con el origen del panel,
// que el proxy le da incrustado (__VK_PANEL) y que la página no puede cambiar; y al panel solo le manda eventos
// de interacción, métricas y el mensaje de los errores de JavaScript (que el panel no pasa al host).
(function () {
  'use strict';
  var PANEL = typeof __VK_PANEL === 'string' ? __VK_PANEL : '';
  var APIS = typeof __VK_APIS === 'object' && __VK_APIS ? __VK_APIS : [];
  // Los orígenes de la propia app (su dominio con y sin «www», por http y https). Dentro de la celda la app
  // vive en el origen del proxy: lo que la nombre con su dominio completo se convierte en una ruta local.
  var TARGETS = typeof __VK_TARGETS === 'object' && __VK_TARGETS ? __VK_TARGETS : [];
  function base() { try { return document.baseURI || location.href; } catch (e) { return location.href; } }
  // Devuelve la dirección equivalente en el origen de la celda, siempre absoluta (A-1: una ruta «//host/…»
  // devuelta tal cual se leería como otro servidor; A-4: una ruta relativa se resolvería contra un <base>).
  function localPath(u) {
    try {
      var url = new URL(String(u), base());
      if (url.origin === location.origin || TARGETS.indexOf(url.origin) < 0) return null;
      return location.origin + url.pathname + url.search + url.hash;
    } catch (e) { return null; }
  }
  var name = String(window.name || '');
  // Una celda: incrustada, con panel conocido y con el nombre que pone el panel.
  var inCell = window.top !== window && !!PANEL && name.indexOf('vk:') === 0;
  var hintFn = null; // avisar al panel; solo existe dentro de una celda

  // ── API en otro puerto: la página la llama por el proxy, que la reenvía con el origen de la app.
  // Se instala también fuera de una celda (la captura abre la página en primer nivel) (N-5).
  function viaProxy(u) {
    // La propia app llamada con su dominio completo: es una petición local, no una API aparte.
    var own = localPath(u);
    if (own !== null) return own;
    try {
      var url = new URL(String(u), base());
      var i = APIS.indexOf(url.origin);
      return i < 0 ? null : location.origin + '/__viewkeeper/api/' + i + url.pathname + url.search;
    } catch (e) { return null; }
  }
  // Una llamada a otro origen que falla suele ser CORS: la API admite el origen de la app y no el de la celda.
  // De esta máquina, por http o https; de fuera, solo https (lo único que el proxy acepta reenviar).
  function isLocalOther(u) {
    try {
      var url = new URL(String(u), base());
      if (url.origin === location.origin) return false;
      return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) ? /^https?:$/.test(url.protocol) : url.protocol === 'https:';
    } catch (e) { return false; }
  }
  if ((APIS.length || inCell) && !window.__vkApi) {
    window.__vkApi = true;
    if (window.fetch) {
      var realFetch = window.fetch;
      window.fetch = function (input, init) {
        var isReq = typeof Request !== 'undefined' && input instanceof Request;
        var raw = isReq ? input.url : String(input);
        var via = viaProxy(raw);
        if (!via) {
          var p = realFetch.apply(this, arguments);
          // Una llamada a otro puerto de esta máquina que falla suele ser CORS: se avisa al panel (solo el origen).
          if (hintFn && isLocalOther(raw)) p.catch(function () { hintFn(raw); });
          return p;
        }
        if (!isReq) return realFetch.call(this, via, init);
        // Un Request no se puede redirigir: se reconstruye con su método, sus cabeceras y su cuerpo (N-4).
        var base = { method: input.method, headers: input.headers, credentials: input.credentials === 'omit' ? 'omit' : 'include', redirect: input.redirect, signal: input.signal, cache: input.cache };
        if (input.method === 'GET' || input.method === 'HEAD') return realFetch.call(this, new Request(via, base), init);
        var self = this;
        return input.clone().arrayBuffer().then(function (body) { base.body = body; return realFetch.call(self, new Request(via, base), init); });
      };
    }
    var realOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, u) {
      var via = viaProxy(u);
      var args = Array.prototype.slice.call(arguments);
      if (via) args[1] = via;
      else if (hintFn && isLocalOther(u)) this.addEventListener('error', function () { hintFn(u); });
      return realOpen.apply(this, args);
    };
  }

  if (!inCell) return; // abierta en un navegador normal, o iframe de la propia app: nada más que hacer
  if (window.__vk) return;
  window.__vk = true;

  // window.name lo pone quien incrusta: solo se le cree en lo que no hace daño (cómo aparentar un dispositivo).
  var cfg = {};
  try { cfg = JSON.parse(name.slice(3)) || {}; } catch (e) { cfg = {}; }
  var panel = window.parent;
  var boot = Math.random().toString(36).slice(2);
  var applying = 0; // > 0 mientras se reproduce un evento remoto: lo que ocurra entonces no se reenvía
  /*SONDA-INICIO*/

  function send(m) {
    m.vk = 1;
    m.boot = boot;
    // Con el origen del panel como destino, un marco ajeno que incruste esta página no recibe nada.
    try { panel.postMessage(m, PANEL); } catch (e) { /* panel cerrado */ }
  }
  var hinted = {};
  hintFn = function (u) {
    try { var o = new URL(String(u), location.href).origin; if (!hinted[o]) { hinted[o] = true; send({ t: 'hint', kind: 'api', origin: o }); } } catch (e) { /* nada */ }
  };

  // ── la app nombrada con su dominio completo, y las salidas del mosaico.
  // Un enlace o un formulario que apunta al dominio real sacaría a la celda del proxy (y el panel no deja:
  // se quedaría en blanco). Justo antes de que actúe se le pone la ruta local, y el clic sigue su curso
  // normal: el enrutador de una SPA, el menú contextual, todo ve un enlace de la propia página.
  function attr(el, name) { try { return el.getAttribute(name); } catch (e) { return null; } }
  function fixLink(ev) {
    if (ev.button === 1 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.type === 'auxclick') return;
    var t = ev.target;
    var a = t && t.closest ? t.closest('a[href],area[href]') : null;
    if (!a) return;
    var tg = attr(a, 'target');
    if (tg && tg.toLowerCase() !== '_self') return;
    var p = localPath(attr(a, 'href'));
    if (p !== null) a.setAttribute('href', p);
  }
  ['pointerdown', 'click', 'auxclick', 'keydown'].forEach(function (k) { document.addEventListener(k, fixLink, true); });
  function fixForm(f, by) {
    if (by && attr(by, 'formaction')) { var q = localPath(attr(by, 'formaction')); if (q !== null) by.setAttribute('formaction', q); }
    if (f && attr(f, 'action')) { var p = localPath(attr(f, 'action')); if (p !== null) f.setAttribute('action', p); }
  }
  document.addEventListener('submit', function (ev) { fixForm(ev.target, ev.submitter); }, true);
  try {
    var realSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () { fixForm(this, null); return realSubmit.apply(this, arguments); };
  } catch (e) { /* sin permiso */ }
  // Lo que navega por código (location.href = …) no pasa por un enlace: se caza con la API de navegación.
  // A la propia app, se va a la ruta local; a otra web, no se va (la celda quedaría en blanco) y se avisa
  // al panel con el origen, para que diga qué ha pasado.
  var lefts = 0;
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', function (ev) {
      if (!ev.cancelable || ev.hashChange || ev.downloadRequest) return;
      var dest;
      try { dest = new URL(ev.destination.url); } catch (e) { return; }
      if (dest.origin === location.origin || !/^https?:$/.test(dest.protocol)) return;
      var p = localPath(dest.href);
      if (p !== null && !ev.formData) {
        ev.preventDefault();
        if (ev.navigationType === 'replace') location.replace(p); else location.assign(p);
        return;
      }
      // A otra web, o un envío con cuerpo al dominio propio que no pasó por «submit» ni por form.submit():
      // no se puede repetir aquí con su cuerpo, así que no se va y se dice (antes la celda quedaba en blanco).
      ev.preventDefault();
      if (lefts++ < 20) send({ t: 'left', origin: dest.origin });
    });
  }

  // ── errores de la página: para ver de un vistazo que «en el móvil falla y en el escritorio no».
  // El agente se carga antes que los scripts de la página, así que oye también los de arranque. El texto
  // se queda en el panel, que lo enseña en el rótulo de la celda; al host solo llega la cuenta.
  var errs = 0;
  function report(kind, msg) {
    if (errs >= 50) return; // una página en bucle de errores no inunda el panel
    errs++;
    var text = '';
    try { text = String(msg == null ? '' : msg).slice(0, 300); } catch (e) { text = '?'; }
    send({ t: 'error', kind: kind, msg: text });
  }
  window.addEventListener('error', function (ev) {
    // Solo errores de JavaScript: una imagen que no carga llega con otro destino y sin mensaje.
    if (ev.target !== window || typeof ev.message !== 'string') return;
    var where = ev.filename ? ' (' + String(ev.filename).split('/').pop().split('?')[0] + ':' + ev.lineno + ')' : '';
    report('error', ev.message + where);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    report('rejection', r && r.message ? r.message : r);
  });
  if (window.console && typeof console.error === 'function') {
    var realConsoleError = console.error;
    console.error = function () {
      try {
        report('console', Array.prototype.map.call(arguments, function (a) {
          return typeof a === 'string' ? a : a && a.message ? a.message : Object.prototype.toString.call(a);
        }).join(' '));
      } catch (e) { /* un argumento que no se deja leer */ }
      return realConsoleError.apply(console, arguments);
    };
  }

  // ── emulación por celda, del lado del cliente (lo que un iframe sí permite)
  function define(obj, prop, value) {
    try { Object.defineProperty(obj, prop, { get: function () { return value; }, configurable: true }); } catch (e) { /* sin permiso */ }
  }
  if (typeof cfg.ua === 'string') define(navigator, 'userAgent', cfg.ua);
  if (cfg.touch === true) define(navigator, 'maxTouchPoints', 5);
  if (typeof cfg.lang === 'string') { define(navigator, 'language', cfg.lang); define(navigator, 'languages', Object.freeze([cfg.lang])); }

  // Un móvil no reserva sitio para la barra de desplazamiento; un iframe de escritorio sí (15 px menos de ancho útil).
  if (cfg.touch === true) {
    try {
      var st = document.createElement('style');
      st.textContent = 'html{scrollbar-width:none}::-webkit-scrollbar{display:none}';
      (document.head || document.documentElement).appendChild(st);
    } catch (e) { /* sin estilo */ }
  }

  // Las cookies puestas desde JS nacen SameSite=Lax; se igualan a las del servidor (decisión D5).
  if (cfg.fixCookies === true) {
    try {
      var d = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
      if (d && d.set && d.get) {
        Object.defineProperty(document, 'cookie', {
          configurable: true,
          get: function () { return d.get.call(document); },
          set: function (v) {
            var s = String(v).replace(/;\s*samesite=[^;]*/gi, '').replace(/;\s*secure\b/gi, '').replace(/;\s*domain=[^;]*/gi, '');
            d.set.call(document, s + '; SameSite=None; Secure');
          }
        });
      }
    } catch (e) { /* se queda como estaba */ }
  }

  // ── direccionar un elemento de forma que la misma ruta valga en otra celda
  function attrSel(el, attr) {
    var v = el.getAttribute(attr);
    if (!v) return null;
    var sel = '[' + attr + '="' + CSS.escape(v) + '"]';
    try { return document.querySelectorAll(sel).length === 1 ? sel : null; } catch (e) { return null; }
  }
  function path(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el === document.documentElement) return 'html';
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      var uniq = null;
      if (el.id) { try { var s0 = '#' + CSS.escape(el.id); if (document.querySelectorAll(s0).length === 1) uniq = s0; } catch (e) { /* id raro */ } }
      uniq = uniq || attrSel(el, 'data-testid') || attrSel(el, 'data-test') || attrSel(el, 'data-cy');
      if (uniq) { parts.unshift(uniq); return parts.join('>'); }
      var i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.localName === el.localName) i++;
      parts.unshift(el.localName + ':nth-of-type(' + i + ')');
      el = el.parentElement; // el DOM en sombra queda fuera (límite declarado)
    }
    parts.unshift('body');
    return parts.join('>');
  }
  // Huella: lo que hace que dos elementos «sean el mismo» aunque la maquetación cambie con el ancho.
  // Si la ruta lleva a un elemento con otra huella, no se actúa: mejor no pulsar que pulsar otro botón.
  function fp(el) {
    var href = '';
    try { if (el.getAttribute('href')) href = new URL(el.getAttribute('href'), location.href).pathname; } catch (e) { /* nada */ }
    return [el.localName, el.getAttribute('role') || '', el.getAttribute('name') || '', el.getAttribute('type') || '', href].join('|');
  }
  function tx(el) {
    var text = el.localName === 'input' || el.localName === 'textarea' || el.localName === 'select' ? '' : String(el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return (el.getAttribute('aria-label') || '') + '|' + text;
  }
  function find(sel) {
    if (!sel) return root();
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  function findSame(m) {
    var el = find(m.sel);
    if (!el) return null;
    if ((typeof m.fp === 'string' && fp(el) !== m.fp) || (typeof m.tx === 'string' && tx(el) !== m.tx)) { send({ t: 'miss', kind: m.t }); return null; }
    return el;
  }
  function root() { return document.scrollingElement || document.documentElement; }
  function here() { return location.href; }

  // ── gesto: el panel solo reparte una navegación si en esta celda hubo una acción reciente del usuario
  var lastGesture = 0, gestureSent = 0;
  function gesture(ev) {
    if (!ev.isTrusted) return;
    var now = Date.now();
    lastGesture = now;
    if (now - gestureSent > 400) { gestureSent = now; send({ t: 'gesture' }); }
  }
  // Lo lento de una navegación (que el servidor compile la ruta) ocurre ANTES de que este documento se vaya:
  // al irse se renueva el gesto, y así el plazo cuenta desde que la página nueva empieza a cargar.
  window.addEventListener('pagehide', function () { if (Date.now() - lastGesture < 10000) send({ t: 'gesture' }); });

  // ── scroll: se manda como proporción, porque cada celda tiene otra altura de página
  var applied = {};
  var queued = {};
  function ratio(pos, total, view) { var max = total - view; return max > 0 ? Math.min(1, Math.max(0, pos / max)) : 0; }
  function onScroll(ev) {
    if (applying) return;
    var el = ev.target === document || ev.target === window ? root() : ev.target;
    if (!el || el.nodeType !== 1) return;
    var key = el === root() ? '' : path(el);
    if (key === null) return;
    var a = applied[key];
    if (a && Date.now() - a.t < 300 && Math.abs(a.x - el.scrollLeft) < 2 && Math.abs(a.y - el.scrollTop) < 2) return; // eco
    if (queued[key]) return;
    queued[key] = true;
    // Temporizador y no requestAnimationFrame: con la ventana tapada o en segundo plano el navegador
    // deja de pintar, rAF no se llama nunca y la sincronización se quedaría muda.
    setTimeout(function () {
      queued[key] = false;
      send({ t: 'scroll', sel: key, rx: ratio(el.scrollLeft, el.scrollWidth, el.clientWidth), ry: ratio(el.scrollTop, el.scrollHeight, el.clientHeight) });
    }, 16);
  }
  function applyScroll(m) {
    var el = find(m.sel);
    if (!el || typeof m.rx !== 'number' || typeof m.ry !== 'number') return;
    var x = Math.round(m.rx * Math.max(0, el.scrollWidth - el.clientWidth));
    var y = Math.round(m.ry * Math.max(0, el.scrollHeight - el.clientHeight));
    applied[m.sel || ''] = { x: x, y: y, t: Date.now() };
    el.scrollTo({ left: x, top: y, behavior: 'instant' });
  }

  // ── clic: solo los del usuario (isTrusted); lo reproducido no rebota
  function isToggle(el) {
    // Casillas, radios y sus etiquetas: su clic no se reenvía, porque el estado ya viaja por «input». (H-8)
    if (!el || !el.closest) return false;
    if (el.localName === 'input' && (el.type === 'checkbox' || el.type === 'radio')) return true;
    var label = el.closest('label');
    return !!(label && label.control && (label.control.type === 'checkbox' || label.control.type === 'radio'));
  }
  function onClick(ev) {
    if (applying || !ev.isTrusted) return;
    var el = ev.target;
    if (!el || el.nodeType !== 1 || isToggle(el)) return;
    var sel = path(el);
    if (sel) send({ t: 'click', sel: sel, fp: fp(el), tx: tx(el) });
  }
  function withApplying(fn) { applying++; try { fn(); } catch (e) { /* la página decide */ } finally { applying--; } }
  function applyClick(m) {
    var el = findSame(m);
    if (!el) return;
    withApplying(function () {
      // Un <svg> o un <path> dentro de un botón no tienen click(): se despacha el evento, que burbujea igual. (H-5)
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
    });
  }

  // ── escritura: se reproduce el MISMO tipo de evento que hubo (input o change), no los dos. (H-7)
  function onInput(ev) {
    if (applying || !ev.isTrusted) return;
    var el = ev.target;
    if (!el || el.nodeType !== 1 || el.type === 'file') return;
    var sel = path(el);
    if (!sel) return;
    var m = { t: 'input', sel: sel, kind: ev.type === 'change' ? 'change' : 'input', fp: fp(el), tx: tx(el) };
    if (el.type === 'checkbox' || el.type === 'radio') m.checked = !!el.checked;
    else if ('value' in el) m.value = String(el.value);
    else return;
    send(m);
  }
  function setNative(el, prop, value) {
    // React y compañía guardan el valor por su cuenta: hay que pasar por el setter del prototipo.
    var proto = el.localName === 'textarea' ? HTMLTextAreaElement.prototype : el.localName === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc && desc.set) desc.set.call(el, value); else el[prop] = value;
  }
  function applyInput(m) {
    var el = findSame(m);
    if (!el) return;
    withApplying(function () {
      if (typeof m.checked === 'boolean') { if (el.checked !== m.checked) el.click(); return; }
      if (typeof m.value !== 'string') return;
      if (el.value !== m.value) setNative(el, 'value', m.value);
      el.dispatchEvent(new Event(m.kind === 'change' ? 'change' : 'input', { bubbles: true }));
    });
  }

  // ── Enter: en un formulario CON botón de envío, el navegador ya genera un clic sobre ese botón, y ese
  // clic es el que se reparte. Solo se manda «enter» cuando no hay botón que lo represente. (H-4)
  // form.elements incluye los botones que están fuera del formulario y se asocian con form="…".
  function hasSubmitter(form) {
    return Array.prototype.some.call(form.elements, function (e) { return (e.localName === 'button' || e.localName === 'input') && (e.type === 'submit' || e.type === 'image'); });
  }
  var TEXTLIKE = /^(text|search|url|tel|email|password|date|month|week|time|datetime-local|number)$/;
  function textFields(form) {
    return Array.prototype.filter.call(form.elements, function (e) { return e.localName === 'input' && TEXTLIKE.test(e.type); }).length;
  }
  function onKey(ev) {
    if (applying || !ev.isTrusted || ev.key !== 'Enter' || ev.isComposing) return;
    var el = ev.target;
    if (!el || el.localName !== 'input') return;
    if (el.form) {
      // Fase de burbuja: si la app canceló Enter (un autocompletar), no hay envío que repetir.
      if (ev.defaultPrevented) return;
      // Con botón de envío: el navegador lo pulsa (ese clic ya viaja) o, si está deshabilitado, no envía.
      if (hasSubmitter(el.form)) return;
      // Sin botón, el navegador solo envía si el formulario tiene un único campo de texto.
      if (textFields(el.form) !== 1) return;
    }
    var sel = path(el);
    if (sel) send({ t: 'enter', sel: sel, fp: fp(el), tx: tx(el) });
  }
  function applyEnter(m) {
    var el = findSame(m);
    if (!el) return;
    withApplying(function () {
      if (el.form && el.form.requestSubmit) el.form.requestSubmit();
      else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    });
  }

  // ── navegación: aplicaciones de una sola página (History API) y cambios de ancla
  function navChanged() { gestureSent = 0; send({ t: 'nav', url: here() }); }
  ['pushState', 'replaceState'].forEach(function (k) {
    var orig = history[k];
    history[k] = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length > 2 && args[2] != null) { var p = localPath(args[2]); if (p !== null) args[2] = p; }
      var r = orig.apply(this, args);
      navChanged();
      return r;
    };
  });
  window.addEventListener('popstate', navChanged);
  window.addEventListener('hashchange', navChanged);
  function applyNav(m) {
    if (typeof m.path !== 'string') return;
    var u;
    try { u = new URL(m.path, location.origin); } catch (e) { return; }
    if (u.origin !== location.origin) return; // nunca fuera de la celda
    var next = u.pathname + u.search + u.hash;
    if (next !== location.pathname + location.search + location.hash) location.assign(location.origin + next);
  }

  // ── preguntas del panel. Solo métricas; nunca contenido de la página.
  function answer(m) {
    var data = null;
    if (m.q === 'metrics') {
      data = { width: window.innerWidth, height: window.innerHeight, pageHeight: root().scrollHeight, scrollY: root().scrollTop };
    }
    /*SONDA*/
    send({ t: 'answer', id: m.id, data: data });
  }

  window.addEventListener('message', function (ev) {
    // Solo el panel manda: tiene que ser la ventana que nos incrusta Y venir de su origen.
    if (ev.source !== panel || ev.origin !== PANEL) return;
    var m = ev.data;
    if (!m || m.vk !== 1) return;
    if (m.t === 'scroll') applyScroll(m);
    else if (m.t === 'click') applyClick(m);
    else if (m.t === 'input') applyInput(m);
    else if (m.t === 'enter') applyEnter(m);
    else if (m.t === 'nav') applyNav(m);
    else if (m.t === 'reload') location.reload();
    else if (m.t === 'ask') answer(m);
  });

  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onInput, true);
  document.addEventListener('pointerdown', gesture, true);
  document.addEventListener('keydown', gesture, true);
  window.addEventListener('keydown', onKey, false);

  send({ t: 'hello', url: here() });
  function ready() { send({ t: 'ready', url: here(), title: document.title, height: root().scrollHeight }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})();
