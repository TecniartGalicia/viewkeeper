  // INSTRUMENTO DE SONDA (no se empaqueta): diario de los WebSocket de la página, para saber cuándo abre el canal de recarga.
  var wsLog = [];
  try {
    var WS0 = window.WebSocket, wsT0 = Date.now();
    var WS1 = function (u, p) {
      var w = p === undefined ? new WS0(u) : new WS0(u, p);
      var tag = String(u).replace(/^wss?:\/\/[^\/]+/, '').slice(0, 40);
      wsLog.push((Date.now() - wsT0) + ' new ' + tag);
      w.addEventListener('open', function () { wsLog.push((Date.now() - wsT0) + ' open ' + tag); });
      w.addEventListener('close', function (e) { wsLog.push((Date.now() - wsT0) + ' close ' + e.code + ' ' + tag); });
      w.addEventListener('error', function () { wsLog.push((Date.now() - wsT0) + ' error ' + tag); });
      return w;
    };
    WS1.prototype = WS0.prototype; WS1.CONNECTING = 0; WS1.OPEN = 1; WS1.CLOSING = 2; WS1.CLOSED = 3;
    window.WebSocket = WS1;
  } catch (e) { /* sin diario */ }
