    // INSTRUMENTO DE SONDA (no se empaqueta): deja a la sonda mirar dentro de la celda y simular al usuario.
    if (data === null) {
      var a = m.arg || {};
      var later = null;
      if (m.q === 'estado') {
        var inp = a.sel ? find(a.sel) : null;
        data = {
          boot: boot, url: here(), width: window.innerWidth, util: document.documentElement.clientWidth,
          estrecho: window.matchMedia('(max-width: 500px)').matches, modo: document.compatMode,
          ua: navigator.userAgent, lang: navigator.language, touch: navigator.maxTouchPoints,
          scrollY: root().scrollTop, maxY: root().scrollHeight - root().clientHeight, ry: ratio(root().scrollTop, root().scrollHeight, root().clientHeight),
          valor: inp ? inp.value : null, texto: (document.body ? document.body.innerText : '').slice(0, 4000),
          cookieJs: document.cookie, ws: wsLog.slice(-12), seguro: window.isSecureContext
        };
      } else if (m.q === 'usuarioScroll') {
        root().scrollTo({ top: Math.round(a.ry * (root().scrollHeight - root().clientHeight)), behavior: 'instant' });
        data = true;
      } else if (m.q === 'usuarioClic') {
        var e1 = find(a.sel);
        if (e1) { send({ t: 'gesture' }); send({ t: "click", sel: a.sel, fp: fp(e1), tx: tx(e1) }); withApplying(function () { e1.click(); }); }
        data = !!e1;
      } else if (m.q === 'usuarioEscribe') {
        var e2 = find(a.sel);
        if (e2) {
          withApplying(function () { setNative(e2, 'value', a.value); e2.dispatchEvent(new Event('input', { bubbles: true })); });
          send({ t: 'input', sel: a.sel, kind: 'input', fp: fp(e2), value: a.value });
        }
        data = !!e2;
      } else if (m.q === 'ponCookieJs') {
        document.cookie = a.cookie;
        data = document.cookie;
      } else if (m.q === 'fetch') {
        later = fetch(a.path, { credentials: 'include' }).then(function (r) { return r.text().then(function (t) { return { status: r.status, body: t.slice(0, 2000) }; }); }, function (e) { return { error: String(e) }; });
      } else if (m.q === 'ws') {
        later = new Promise(function (res) {
          var done = false, w;
          try { w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + a.path); } catch (e) { res({ error: String(e) }); return; }
          w.onopen = function () { w.send('ping'); };
          w.onmessage = function (ev) { done = true; res({ eco: String(ev.data) }); w.close(); };
          w.onerror = function () { if (!done) res({ error: 'error de socket' }); };
          setTimeout(function () { if (!done) res({ error: 'sin respuesta' }); }, 4000);
        });
      }
      if (later) { later.then(function (d) { send({ t: 'answer', id: m.id, data: d }); }); return; }
    }
