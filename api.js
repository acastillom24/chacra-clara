/* Cliente de la API (/api/*). Errores con .status (0 = sin conexión). */
(function (root) {
  'use strict';
  function req(method, url, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (method !== 'GET') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'Error ' + r.status); e.status = r.status; throw e; }
        return j;
      });
    }, function () { var e = new Error('Sin conexión'); e.status = 0; throw e; });
  }
  root.Api = {
    state: function () { return req('GET', '/api/state'); },
    login: function (email, password) { return req('POST', '/api/auth', { action: 'login', email: email, password: password }); },
    register: function (d) { return req('POST', '/api/auth', Object.assign({ action: 'register' }, d)); },
    logout: function () { return req('POST', '/api/auth', { action: 'logout' }); },
    saveFinca: function (d) { return req('PUT', '/api/finca', d); },
    addParcela: function (p) { return req('POST', '/api/parcelas', p); },
    editParcela: function (p) { return req('PUT', '/api/parcelas', p); },
    delParcela: function (id) { return req('DELETE', '/api/parcelas?id=' + encodeURIComponent(id)); },
    addPrecios: function (rows) { return req('POST', '/api/precios', { rows: rows }); },
    delPrecio: function (id) { return req('DELETE', '/api/precios?id=' + encodeURIComponent(id)); }
  };
})(window);
