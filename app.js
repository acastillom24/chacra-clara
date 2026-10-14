(function () {
  'use strict';
  var C = window.Calc;
  var KEY = 'arroz-decision-v1';
  var ui = { tab: 'inicio', tipo: 'chacra', escMes: null, editP: null };

  /* ---------- Utilidades ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n, d) {
    d = d == null ? 2 : d;
    var a = Math.abs(n);
    var s = 'S/ ' + a.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (n < 0 && Math.round(a * Math.pow(10, d)) > 0 ? '−' : '') + s;
  }
  function int(n) { return Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 }); }
  function pct(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(0) + '%'; }
  function cls(n) { return n >= 0 ? 'pos' : 'neg'; }
  function fmtFecha(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    return +p[2] + ' ' + C.MESES[+p[1] - 1].toLowerCase() + ' ' + p[0];
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- Estado (en Neon vía /api; copia local para trabajar sin señal) ---------- */
  var CACHE_KEY = 'chacra-clara-cache-v2';
  var auth = { ok: false, user: null, offline: false, mode: 'login' };
  var dirty = false, pushTimer;

  function emptyRiesgos() {
    var r = [];
    for (var i = 0; i < 12; i++) r.push({ agua: 'na', lluvia: 'na' });
    return r;
  }
  function emptyState() {
    return {
      finca: { nombre: 'Mi finca', lugar: '', region: 'Amazonas', ha: 0, rend: 0, ciclo: 135, meta: 20 },
      costs: [], parcelas: [], prices: [], riesgos: emptyRiesgos(), esc: null
    };
  }
  function normalize(o) {
    var s = emptyState();
    o = o && typeof o === 'object' ? o : {};
    s.finca = Object.assign(s.finca, o.finca || {});
    s.costs = Array.isArray(o.costs) ? o.costs.map(function (c) { return { id: c.id || C.uid(), nombre: String(c.nombre || ''), monto: C.num(c.monto) }; }) : [];
    s.parcelas = Array.isArray(o.parcelas) ? o.parcelas : [];
    s.prices = Array.isArray(o.prices) ? o.prices.filter(function (p) { return C.parseDate(p.fecha) && C.num(p.precio) > 0; })
      .map(function (p) { return { id: p.id || C.uid(), fecha: C.parseDate(p.fecha), precio: C.num(p.precio), tipo: p.tipo === 'mayorista' ? 'mayorista' : 'chacra', fuente: String(p.fuente || ''), shared: !!p.shared }; }) : [];
    if (Array.isArray(o.riesgos)) for (var i = 0; i < 12; i++) if (o.riesgos[i]) s.riesgos[i] = Object.assign({ agua: 'na', lluvia: 'na' }, o.riesgos[i]);
    s.esc = o.esc || null;
    return s;
  }
  var S = emptyState();

  function cacheWrite() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ email: auth.user && auth.user.email, state: S, dirty: dirty })); } catch (e) { /* ignorar */ }
  }
  function cacheRead() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }
  function cacheClear() { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignorar */ } }

  // Guarda finca, costos, riesgos y escenarios (con espera corta para no enviar en cada tecla).
  function save() {
    dirty = true; cacheWrite(); updateHead();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 700);
  }
  function push() {
    if (!auth.ok) return;
    Api.saveFinca({ finca: S.finca, costs: S.costs, riesgos: S.riesgos, esc: S.esc }).then(function () {
      dirty = false; auth.offline = false; cacheWrite(); updateHead();
    }, function (e) {
      if (e.status === 401) { sessionLost(); return; }
      auth.offline = e.status === 0; updateHead();
      toast(e.status === 0 ? 'Sin conexión: se guardará cuando vuelvas a tener señal.' : 'No se pudo guardar: ' + e.message);
    });
  }
  window.addEventListener('online', function () { if (dirty) push(); });

  function sessionLost() {
    auth.ok = false; auth.user = null; S = emptyState(); cacheClear();
    toast('Tu sesión terminó. Ingresa de nuevo.');
    render();
  }
  function setState(o) {
    S = normalize(o);
    auth.ok = true; auth.user = o.user || auth.user; auth.offline = false; dirty = false;
    cacheWrite();
  }
  function boot() {
    Api.state().then(function (o) {
      var c = cacheRead();
      if (c && c.dirty && c.email === o.user.email) { // quedaron cambios sin enviar: gana lo local
        S = normalize(c.state); auth.ok = true; auth.user = o.user; dirty = true; push();
      } else setState(o);
      render();
    }, function (e) {
      var c = cacheRead();
      if (e.status === 0 && c && c.state) { S = normalize(c.state); auth.ok = true; auth.offline = true; auth.user = { email: c.email }; dirty = !!c.dirty; }
      render();
    });
  }

  function derived() {
    var f = S.finca;
    f.ha = C.num(f.ha); f.rend = C.num(f.rend); f.ciclo = C.num(f.ciclo) || 135; f.meta = C.num(f.meta);
    var costHa = C.costoPorHa(S.costs);
    var eq = C.equilibrio(costHa, f.rend);
    var seas = C.seasonality(S.prices, 'chacra', eq);
    var plan = C.planSiembra(seas, { costHa: costHa, rend: f.rend, ciclo: f.ciclo, ha: f.ha, riesgos: S.riesgos });
    var last = C.ultimoPrecio(S.prices, 'chacra');
    return { f: f, costHa: costHa, eq: eq, seas: seas, plan: plan, last: last, metaPrice: C.precioMeta(costHa, f.rend, f.meta) };
  }

  /* ---------- Gráficos SVG ---------- */
  function niceTicks(min, max, n) {
    var step0 = (max - min) / n;
    var mag = Math.pow(10, Math.floor(Math.log10(step0)));
    var norm = step0 / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var t = [], start = Math.floor(min / step) * step;
    for (var v = start; v <= max + step * 0.001; v += step) t.push(+v.toFixed(6));
    return t;
  }
  function lineChart(pts, ref) {
    var W = 640, H = 260, L = 46, R = 14, T = 14, B = 30;
    var ys = pts.map(function (p) { return p.y; });
    if (ref) ys.push(ref);
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (hi - lo < 0.1) { hi += 0.05; lo -= 0.05; }
    var ticks = niceTicks(lo, hi, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t, span = Math.max(t1 - t0, 1);
    function X(t) { return L + (t - t0) / span * (W - L - R); }
    function Y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución del precio">';
    ticks.forEach(function (v) {
      s += '<line class="grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v.toFixed(2) + '</text>';
    });
    for (var i = 0; i <= 4; i++) {
      var tt = t0 + span * i / 4, d = new Date(tt);
      s += '<text x="' + X(tt) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === 4 ? 'end' : 'middle') + '">' + C.MESES[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) + '</text>';
    }
    s += '<path class="ln" d="' + pts.map(function (p, k) { return (k ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join('') + '"/>';
    if (pts.length <= 60) pts.forEach(function (p) { s += '<circle class="dot" cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="3"/>'; });
    if (ref) s += '<line class="ref" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(ref) + '" y2="' + Y(ref) + '"/><text class="ref-t" x="' + (W - R) + '" y="' + (Y(ref) - 6) + '" text-anchor="end">Tu equilibrio ' + ref.toFixed(2) + '</text>';
    return s + '</svg>';
  }
  function rangeChart(seas, eq) {
    var W = 640, H = 280, L = 46, R = 10, T = 14, B = 30;
    var vals = [];
    seas.forEach(function (m) { if (m.n) { vals.push(m.min, m.max); } });
    if (eq > 0) vals.push(eq);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 0.1) { hi += 0.05; lo -= 0.05; }
    var ticks = niceTicks(lo, hi, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
    var cw = (W - L - R) / 12;
    function X(i) { return L + cw * (i + 0.5); }
    function Y(v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); }
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Precio típico por mes">';
    ticks.forEach(function (v) {
      s += '<line class="grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + v.toFixed(2) + '</text>';
    });
    seas.forEach(function (m, i) {
      s += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + C.MESES[i] + '</text>';
      if (!m.n) return;
      var bad = eq > 0 && m.med < eq ? ' bad' : '';
      s += '<line class="rng" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + Y(m.max) + '" y2="' + Y(m.min) + '"/>';
      if (m.n >= 4) s += '<line class="iqr' + bad + '" x1="' + X(i) + '" x2="' + X(i) + '" y1="' + Y(m.p75) + '" y2="' + Y(m.p25) + '"/>';
      s += '<circle class="mdot' + bad + '" cx="' + X(i) + '" cy="' + Y(m.med) + '" r="6"/>';
    });
    if (eq > 0) s += '<line class="ref" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(eq) + '" y2="' + Y(eq) + '"/><text class="ref-t" x="' + (W - R) + '" y="' + (Y(eq) - 6) + '" text-anchor="end">Tu equilibrio ' + eq.toFixed(2) + '</text>';
    return s + '</svg>';
  }

  /* ---------- Piezas reutilizables ---------- */
  function empty(title, text, href, label) {
    return '<div class="card empty"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><a class="btn" href="' + href + '">' + esc(label) + '</a></div>';
  }
  function demoBanner() {
    var sim = S.prices.some(function (p) { return p.shared && /SIMULADO/i.test(p.fuente); });
    if (!sim) return '';
    return '<div class="banner"><b>Hay precios simulados.</b> Los precios marcados SIMULADO son de ejemplo para la región ' + esc(S.finca.region) + '. Registra los tuyos en Precios para decidir con datos reales.</div>';
  }
  function levelBadge(kind, val) {
    if (val === 'na') return '';
    var label = kind === 'agua' ? 'Agua ' + val : 'Lluvia ' + val;
    var bad = (kind === 'agua' && val === 'baja') || (kind === 'lluvia' && val === 'alto');
    var mid = val === 'media' || val === 'medio';
    return '<span class="badge ' + (bad ? 'r' : mid ? 'a' : 'g') + '">' + label + '</span>';
  }

  /* ---------- Vistas ---------- */
  function viewInicio() {
    var d = derived(), f = d.f;
    if (!d.eq) {
      return demoBanner() + empty('Empieza por tus costos', 'Con lo que gastas por hectárea y lo que cosechas, la herramienta calcula desde qué precio ganas.', '#costos', 'Ir a Costos');
    }
    var price = d.last ? C.num(d.last.precio) : 0;
    var sem = C.semaforo(price, d.eq, f.meta);
    var uHa = price * f.rend - d.costHa;
    var msg = {
      verde: ['Precio favorable', 'Está ' + pct((price / d.eq - 1) * 100) + ' sobre tu equilibrio y supera tu meta de ' + f.meta + '%.'],
      amarillo: ['Gana poco', 'Cubre tus costos, pero no llega a tu meta de ' + f.meta + '%. Te faltan ' + money(d.metaPrice - price) + ' por kilo.'],
      rojo: ['Por debajo del equilibrio', 'A este precio perderías ' + money(-uHa, 0) + ' por hectárea. Evalúa cuándo y a quién vender antes de comprometer la cosecha.'],
      sin: ['Falta el precio en chacra', 'Registra lo que te pagan hoy por el arroz cáscara para ver si conviene vender.']
    }[sem];
    var h = demoBanner();
    h += '<section class="hero ' + (sem === 'sin' ? '' : sem) + '">';
    if (price) {
      h += '<div class="muted">Último precio en chacra · ' + fmtFecha(d.last.fecha) + (d.last.fuente ? ' · ' + esc(d.last.fuente) : '') + '</div>';
      h += '<div class="big">' + money(price) + '<small>por kg</small></div>';
    }
    h += '<h2>' + msg[0] + '</h2><p>' + msg[1] + '</p>';
    if (price) {
      var min = d.eq * 0.7, max = Math.max(d.eq * 1.6, d.metaPrice * 1.15, price * 1.05);
      var P = function (v) { return Math.max(0, Math.min(100, (v - min) / (max - min) * 100)); };
      h += '<div class="gauge" aria-hidden="true">' +
        '<i class="z-r" style="width:' + P(d.eq) + '%"></i><i class="z-a" style="width:' + (P(d.metaPrice) - P(d.eq)) + '%"></i><i class="z-v" style="width:' + (100 - P(d.metaPrice)) + '%"></i>' +
        '<span class="tick t-eq" style="left:' + P(d.eq) + '%"><em>Equilibrio ' + d.eq.toFixed(2) + '</em></span>' +
        '<span class="tick" style="left:' + P(d.metaPrice) + '%"><em>Meta ' + d.metaPrice.toFixed(2) + '</em></span>' +
        '<span class="pin" style="left:' + P(price) + '%"></span></div>';
      h += '<div class="grid g3">' +
        '<div class="stat"><div class="l">Margen sobre costo</div><div class="v ' + cls(uHa) + '">' + pct((price * f.rend / d.costHa - 1) * 100) + '</div></div>' +
        '<div class="stat"><div class="l">Utilidad por hectárea</div><div class="v ' + cls(uHa) + '">' + money(uHa, 0) + '</div></div>' +
        '<div class="stat"><div class="l">Utilidad total (' + f.ha + ' ha)</div><div class="v ' + cls(uHa) + '">' + money(uHa * f.ha, 0) + '</div></div></div>';
      var txt = '🌾 ' + f.nombre + '\nMi equilibrio: ' + money(d.eq) + '/kg\nPrecio en chacra (' + fmtFecha(d.last.fecha) + '): ' + money(price) + '/kg → ' + pct((price / d.eq - 1) * 100) + '\nUtilidad estimada ' + f.ha + ' ha: ' + money(uHa * f.ha, 0) + '\n(Chacra Clara)';
      h += '<div class="row" style="margin-top:.9rem"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(txt) + '">Compartir por WhatsApp</a><a class="btn sec" href="#precios">Registrar precio</a></div>';
    } else {
      h += '<a class="btn" href="#precios">Registrar precio</a>';
    }
    h += '</section>';

    h += '<div class="grid g4">' +
      '<div class="stat"><div class="l">Costo por hectárea</div><div class="v">' + money(d.costHa, 0) + '</div></div>' +
      '<div class="stat"><div class="l">Precio de equilibrio</div><div class="v">' + money(d.eq) + '</div><div class="s">por kg · ' + money(d.eq * 1000, 0) + ' por tonelada</div></div>' +
      '<div class="stat"><div class="l">Producción esperada</div><div class="v">' + int(f.rend * f.ha / 1000) + ' t</div><div class="s">' + int(f.rend) + ' kg/ha × ' + f.ha + ' ha</div></div>' +
      '<div class="stat"><div class="l">Precio para tu meta</div><div class="v">' + money(d.metaPrice) + '</div><div class="s">margen de ' + f.meta + '%</div></div></div>';

    var top = d.plan.filter(function (p) { return p.rank && p.rank <= 3; }).sort(function (a, b) { return a.rank - b.rank; });
    h += '<section class="card"><h2>Meses que mejor le fueron al precio</h2>';
    if (top.length) {
      var yrs = C.yearsOfData(S.prices, 'chacra');
      h += '<div class="grid g3">' + top.map(function (p) {
        return '<div class="stat"><div class="l">Sembrar en</div><div class="v">' + C.MESES_LARGO[p.siembra] + '</div><div class="s">Cosecha ' + C.MESES_LARGO[p.cosecha] + ' · precio típico ' + money(p.pBase) + ' · ganó en ' + Math.round(p.probOk * 100) + '% de los años</div></div>';
      }).join('') + '</div>';
      h += '<p class="muted small" style="margin-top:.6rem">Según ' + yrs + ' año' + (yrs === 1 ? '' : 's') + ' de precios registrados. ' + (yrs < 3 ? 'Son pocos años: tómalo como una pista, no como una regla. ' : '') + 'Mira el detalle y los riesgos en <a href="#siembra">Siembra</a>.</p>';
    } else {
      h += '<p class="muted">Registra precios en chacra de varios meses para ver cuándo suele convenir sembrar.</p><a class="btn sec" href="#precios">Ir a Precios</a>';
    }
    return h + '</section>';
  }

  function viewCostos() {
    var f = S.finca;
    var h = demoBanner();
    h += '<section class="card"><h2>Tu finca</h2><div class="grid g2" style="margin-top:.5rem">' +
      field('Nombre', '<input data-f="nombre" value="' + esc(f.nombre) + '" autocomplete="off">') +
      field('Lugar', '<input data-f="lugar" value="' + esc(f.lugar) + '" autocomplete="off">') +
      field('Hectáreas sembradas', num('ha', f.ha)) +
      field('Rendimiento (kg de cáscara por ha)', num('rend', f.rend)) +
      field('Días de siembra a cosecha', num('ciclo', f.ciclo)) +
      field('Meta de ganancia (% sobre costo)', num('meta', f.meta)) + '</div>' +
      '<p class="muted small" style="margin-top:.6rem">Usa un rendimiento prudente, por ejemplo el promedio de tus últimas campañas, no tu mejor cosecha.</p></section>';

    h += '<section class="card"><h2>Costos por hectárea (S/)</h2><p class="muted small">Pon lo que gastaste en una campaña completa. Si algo es por las 30 ha, divídelo entre las hectáreas.</p><div id="cost-list" style="margin-top:.6rem">' +
      S.costs.map(costRow).join('') + '</div>' +
      '<div class="row" style="margin-top:.75rem"><button class="btn sec" data-act="add-cost">+ Agregar costo</button></div>' +
      '<div class="total-line"><span>Costo total por ha</span><span id="s-costha"></span></div></section>';

    h += '<section class="card"><h2>Precio de equilibrio</h2><div class="grid g3" style="margin-top:.5rem">' +
      '<div class="stat"><div class="l">Por kilo</div><div class="v" id="s-eq"></div></div>' +
      '<div class="stat"><div class="l">Por tonelada</div><div class="v" id="s-eqt"></div></div>' +
      '<div class="stat"><div class="l">Costo total (<span id="s-ha"></span> ha)</div><div class="v" id="s-tot"></div></div></div>' +
      '<p class="muted small" style="margin-top:.6rem">Por debajo de este precio, cada kilo vendido te hace perder dinero.</p></section>';

    h += '<section class="card"><h2>¿Y si cambia el precio o la cosecha?</h2><p class="muted small">Utilidad por hectárea (S/). Verde gana, rojo pierde.</p><div class="scroll" id="matrix" style="margin-top:.5rem"></div></section>';
    return h;
  }
  function field(label, input) { return '<div class="field"><label>' + label + '</label>' + input + '</div>'; }
  function num(key, v) { return '<input data-f="' + key + '" inputmode="decimal" value="' + (v ? esc(v) : '') + '" placeholder="0">'; }
  function costRow(c, i) {
    return '<div class="cost-row"><input data-cost="' + i + '" data-k="nombre" value="' + esc(c.nombre) + '" placeholder="Concepto" aria-label="Concepto">' +
      '<input data-cost="' + i + '" data-k="monto" inputmode="decimal" value="' + (c.monto ? esc(c.monto) : '') + '" placeholder="0" aria-label="Monto por hectárea">' +
      '<button class="btn sec icon" data-act="del-cost" data-i="' + i + '" aria-label="Quitar costo">✕</button></div>';
  }
  function refreshCostos() {
    var d = derived(), f = d.f;
    function set(id, v) { var el = $('#' + id); if (el) el.textContent = v; }
    set('s-costha', money(d.costHa, 0));
    set('s-eq', d.eq ? money(d.eq) : '—');
    set('s-eqt', d.eq ? money(d.eq * 1000, 0) : '—');
    set('s-tot', money(d.costHa * f.ha, 0));
    set('s-ha', f.ha);
    var m = $('#matrix');
    if (!m) return;
    if (!d.eq) { m.innerHTML = '<p class="muted">Completa costos y rendimiento para ver la tabla.</p>'; return; }
    var step = d.eq >= 2 ? 0.2 : 0.1, start = Math.max(step, Math.floor(d.eq * 0.8 / step) * step);
    var prices = [], i;
    for (i = 0; i < 8; i++) prices.push(Math.round((start + i * step) * 100) / 100);
    var fac = [0.7, 0.85, 1, 1.1];
    var t = '<table class="matrix"><thead><tr><th>Precio S/ kg</th>' + fac.map(function (x) { return '<th>' + int(f.rend * x) + ' kg/ha</th>'; }).join('') + '</tr></thead><tbody>';
    prices.forEach(function (p) {
      t += '<tr><td><b>' + p.toFixed(2) + '</b></td>' + fac.map(function (x) {
        var u = p * f.rend * x - d.costHa, a = Math.min(0.5, Math.abs(u) / d.costHa * 1.1 + 0.05);
        var bg = u >= 0 ? 'rgba(46,112,80,' + a + ')' : 'rgba(179,55,43,' + a + ')';
        return '<td style="background:' + bg + '" title="Total ' + f.ha + ' ha: ' + money(u * f.ha, 0) + '">' + money(u, 0) + '</td>';
      }).join('') + '</tr>';
    });
    m.innerHTML = t + '</tbody></table>';
  }

  function viewPrecios() {
    var tipo = ui.tipo, d = derived();
    var list = S.prices.filter(function (p) { return p.tipo === tipo; }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var h = demoBanner();
    h += '<section class="card"><h2>Registrar un precio</h2><p class="muted small">Anota lo que te ofrecen o pagan en el molino. El precio <b>en chacra</b> es el que importa para tu ganancia; el mayorista (el de los boletines del MIDAGRI) sirve de referencia.</p>' +
      '<form id="f-precio" style="margin-top:.6rem"><div class="row">' +
      field('Fecha', '<input type="date" name="fecha" value="' + todayISO() + '" required>') +
      field('Precio S/ por kg', '<input name="precio" inputmode="decimal" placeholder="1.45" required>') +
      field('Tipo', '<select name="tipo"><option value="chacra"' + (tipo === 'chacra' ? ' selected' : '') + '>En chacra (cáscara)</option><option value="mayorista"' + (tipo === 'mayorista' ? ' selected' : '') + '>Mayorista (referencia)</option></select>') +
      field('Fuente', '<input name="fuente" placeholder="Molino, vecino, boletín…" autocomplete="off">') +
      '<button class="btn" type="submit">Guardar</button></div></form></section>';

    h += '<section class="card"><div class="row"><div class="field"><h2>Evolución</h2></div><div class="field" style="flex:0 1 220px"><label for="sel-tipo">Ver</label><select id="sel-tipo" data-act="tipo"><option value="chacra"' + (tipo === 'chacra' ? ' selected' : '') + '>Precio en chacra</option><option value="mayorista"' + (tipo === 'mayorista' ? ' selected' : '') + '>Precio mayorista</option></select></div></div>';
    if (list.length >= 2) {
      h += lineChart(list.map(function (p) { return { t: new Date(p.fecha + 'T12:00:00').getTime(), y: C.num(p.precio) }; }), tipo === 'chacra' && d.eq ? d.eq : 0);
      h += '<div class="legend"><span>● Precio registrado</span>' + (tipo === 'chacra' && d.eq ? '<span style="color:var(--gold)">- - Tu precio de equilibrio</span>' : '') + '</div>';
    } else {
      h += '<p class="empty">Registra al menos 2 precios para ver la curva.</p>';
    }
    h += '</section>';

    var recent = list.slice().reverse().slice(0, 25);
    h += '<section class="card"><h2>Últimos registros</h2>';
    if (recent.length) {
      h += '<div class="scroll"><table><thead><tr><th>Fecha</th><th>S/ por kg</th><th>Fuente</th><th></th></tr></thead><tbody>' + recent.map(function (p) {
        var below = tipo === 'chacra' && d.eq && C.num(p.precio) < d.eq;
        return '<tr><td>' + fmtFecha(p.fecha) + '</td><td class="' + (below ? 'neg' : '') + '"><b>' + C.num(p.precio).toFixed(2) + '</b></td><td style="text-align:left;max-width:150px;overflow:hidden;text-overflow:ellipsis">' + esc(p.fuente) + '</td><td>' + (p.shared ? '' : '<button class="btn sec icon" data-act="del-price" data-id="' + esc(p.id) + '" aria-label="Borrar registro">✕</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      if (list.length > 25) h += '<p class="muted small">Se muestran los 25 más recientes de ' + list.length + '.</p>';
    } else h += '<p class="muted">Todavía no hay registros de este tipo.</p>';
    h += '</section>';

    h += '<section class="card"><details><summary>Importar varios precios (pegar o archivo CSV)</summary>' +
      '<p class="muted small">Una línea por precio: <code>fecha, precio, tipo, fuente</code>. Ejemplo: <code>2026-09-10, 1.52, chacra, Molino Bagua Grande</code>. Acepta coma, punto y coma o tabulación, y fechas AAAA-MM-DD o DD/MM/AAAA. Sirve para copiar datos desde Excel.</p>' +
      '<div class="field" style="margin-top:.5rem"><textarea id="csv-text" placeholder="fecha,precio,tipo,fuente"></textarea></div>' +
      '<div class="row" style="margin-top:.6rem"><div class="field"><label for="csv-file">O elige un archivo</label><input id="csv-file" type="file" accept=".csv,.txt,text/csv,text/plain" data-act="file-csv"></div><button class="btn" data-act="import-csv">Importar</button></div></details></section>';
    return h;
  }

  function viewSiembra() {
    var d = derived(), f = d.f;
    var h = demoBanner();
    var hasData = d.seas.some(function (m) { return m.n; });
    h += '<section class="card"><h2>¿Cuándo sembrar?</h2><p class="muted">La idea: si siembro en cierto mes, cosecho unos <b>' + f.ciclo + ' días</b> después. ¿Qué precio hubo en ese mes de cosecha en años anteriores, y habría ganado con mis costos?</p></section>';
    if (!d.eq) return h + empty('Faltan tus costos', 'Necesito tu precio de equilibrio para comparar.', '#costos', 'Ir a Costos');
    if (!hasData) return h + empty('Faltan precios en chacra', 'Registra precios de varios meses (idealmente de 3 años o más).', '#precios', 'Ir a Precios');

    var yrs = C.yearsOfData(S.prices, 'chacra');
    h += '<section class="card"><h3>Precio en chacra según el mes de cosecha</h3>' + rangeChart(d.seas, d.eq) +
      '<div class="legend"><span>● Precio típico (mediana)</span><span>▮ Rango habitual (25–75%, con 4+ años)</span><span>│ Mínimo a máximo</span><span style="color:var(--gold)">- - Tu equilibrio</span><span style="color:var(--red)">● Rojo: el precio típico queda bajo tu equilibrio</span></div>' +
      '<p class="muted small" style="margin-top:.5rem">Base: ' + yrs + ' año' + (yrs === 1 ? '' : 's') + ' de datos. ' + (yrs < 3 ? '<b>Son pocos años: úsalo como pista, no como regla.</b> ' : '') + 'El precio del pasado no garantiza el del futuro.</p></section>';

    h += '<section><h3 style="margin-bottom:.6rem">Mes de siembra → resultado esperado</h3><div class="months">' + d.plan.map(function (p) {
      var head = '<header><b>Sembrar en ' + C.MESES_LARGO[p.siembra] + '</b>' + (p.rank && p.rank <= 3 ? '<span class="badge g">Opción ' + p.rank + '</span>' : '') + '</header><div class="muted small">Cosecha estimada: ' + C.MESES_LARGO[p.cosecha] + '</div>';
      if (p.sinDatos) return '<article class="mcard nodata">' + head + '<p class="muted small">Sin precios registrados para ' + C.MESES_LARGO[p.cosecha] + '.</p></article>';
      var badges = levelBadge('agua', p.agua) + levelBadge('lluvia', p.lluvia);
      return '<article class="mcard' + (p.rank && p.rank <= 3 ? ' top3' : '') + '">' + head +
        '<div class="kv"><span>Precio típico</span><b>' + money(p.pBase) + '</b></div>' +
        '<div class="kv"><span>' + (p.usaPercentiles ? 'Rango habitual' : 'Mín. a máx.') + '</span><span>' + p.pPes.toFixed(2) + ' – ' + p.pOpt.toFixed(2) + '</span></div>' +
        '<div class="kv"><span>Utilidad por ha</span><b class="' + cls(p.uBase) + '">' + money(p.uBase, 0) + '</b></div>' +
        '<div class="kv"><span>Utilidad ' + f.ha + ' ha</span><b class="' + cls(p.uBase) + '">' + money(p.totalBase, 0) + '</b></div>' +
        '<div class="kv"><span>Años que superó tu equilibrio</span><b>' + Math.round(p.probOk * 100) + '% de ' + p.n + '</b></div>' +
        (p.pocosDatos ? '<span class="badge a">Pocos datos</span>' : '') + (badges ? '<div>' + badges + '</div>' : '') + '</article>';
    }).join('') + '</div></section>';

    h += '<section class="card"><details><summary>Agua y lluvia: agrega lo que sabes de tu zona</summary>' +
      '<p class="muted small">El precio no lo es todo. Marca cómo suele estar el <b>agua para sembrar</b> en cada mes (turnos de riego, caudal del río) y el <b>riesgo de lluvia al cosechar</b> en ese mes (el grano mojado cuesta secar y baja el precio). Puedes consultar a SENAMHI y a la junta de usuarios. Esto ajusta el orden de las opciones.</p>' +
      '<div class="risk-grid" style="margin-top:.6rem"><b></b><b class="small">Agua para sembrar</b><b class="small">Lluvia al cosechar</b>' +
      S.riesgos.map(function (r, i) {
        return '<span>' + C.MESES[i] + '</span>' +
          '<select data-ri="' + i + '" data-k="agua" aria-label="Agua en ' + C.MESES_LARGO[i] + '">' + opts(r.agua, [['na', 'Sin dato'], ['buena', 'Buena'], ['media', 'Media'], ['baja', 'Baja']]) + '</select>' +
          '<select data-ri="' + i + '" data-k="lluvia" aria-label="Lluvia en ' + C.MESES_LARGO[i] + '">' + opts(r.lluvia, [['na', 'Sin dato'], ['bajo', 'Bajo'], ['medio', 'Medio'], ['alto', 'Alto']]) + '</select>';
      }).join('') + '</div></details></section>';
    h += '<p class="muted small">Las opciones son un puntaje orientativo (margen típico, frecuencia de ganancia y riesgos). No incluyen plagas, inundaciones ni cambios de política. Decide con tu experiencia y con asesoría técnica.</p>';
    return h;
  }
  function opts(sel, arr) { return arr.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }

  function ensureEsc(d) {
    if (S.esc) return;
    function r5(v) { return Math.round(v * 20) / 20; }
    S.esc = {
      pes: { p: r5(d.eq * 0.95), r: Math.round(d.f.rend * 0.8) },
      base: { p: r5(d.eq * 1.2), r: Math.round(d.f.rend) },
      opt: { p: r5(d.eq * 1.45), r: Math.round(d.f.rend * 1.05) }
    };
    save();
  }
  function viewEscenarios() {
    var d = derived();
    var h = demoBanner();
    if (!d.eq) return h + empty('Faltan tus costos', 'Ingresa costos y rendimiento para comparar escenarios.', '#costos', 'Ir a Costos');
    ensureEsc(d);
    var best = d.plan.filter(function (p) { return p.rank === 1; })[0];
    if (ui.escMes == null) ui.escMes = best ? best.cosecha : new Date().getMonth();
    h += '<section class="card"><h2>Compara escenarios</h2><p class="muted small">Cambia el precio y el rendimiento de cada caso. Los costos se toman de la pestaña Costos y se asumen fijos por hectárea.</p>' +
      '<div class="row" style="margin-top:.6rem"><div class="field"><label for="esc-mes">Traer precios históricos del mes de cosecha</label><select id="esc-mes" data-act="esc-mes">' +
      C.MESES_LARGO.map(function (m, i) { return '<option value="' + i + '"' + (ui.escMes === i ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>' +
      '<button class="btn sec" data-act="esc-hist">Usar precios históricos</button></div></section>';
    var defs = [['pes', 'Pesimista'], ['base', 'Base'], ['opt', 'Optimista']];
    h += '<div class="grid g3" id="esc-grid">' + defs.map(function (x) {
      var e = S.esc[x[0]];
      return '<section class="card esc ' + x[0] + '"><h3>' + x[1] + '</h3>' +
        '<div class="grid g2" style="margin:.5rem 0"><div class="field"><label>Precio S/ kg</label><input data-esc="' + x[0] + '" data-k="p" inputmode="decimal" value="' + esc(e.p) + '"></div>' +
        '<div class="field"><label>Rinde kg/ha</label><input data-esc="' + x[0] + '" data-k="r" inputmode="decimal" value="' + esc(e.r) + '"></div></div>' +
        '<div id="out-' + x[0] + '"></div></section>';
    }).join('') + '</div>';
    h += '<p class="muted small">Pesimista y optimista deben ser casos posibles, no extremos imposibles: pregúntate qué pasaría si una enfermedad baja tu rendimiento y a la vez el precio cae.</p>';
    return h;
  }
  function refreshEsc() {
    var d = derived(), f = d.f;
    ['pes', 'base', 'opt'].forEach(function (k) {
      var el = $('#out-' + k);
      if (!el || !S.esc) return;
      var p = C.num(S.esc[k].p), r = C.num(S.esc[k].r);
      var ing = p * r * f.ha, cost = d.costHa * f.ha, u = ing - cost;
      el.innerHTML =
        kv('Ingreso total', money(ing, 0)) + kv('Costo total', money(cost, 0)) +
        '<div class="kv res"><span>Utilidad total</span><span class="' + cls(u) + '">' + money(u, 0) + '</span></div>' +
        kv('Utilidad por ha', '<span class="' + cls(u) + '">' + money(u / f.ha, 0) + '</span>') +
        kv('Margen sobre costo', '<span class="' + cls(u) + '">' + (cost ? pct(u / cost * 100) : '—') + '</span>') +
        kv('Rinde mínimo para no perder', p > 0 ? int(C.rendEquilibrio(p, d.costHa)) + ' kg/ha' : '—') +
        kv('Precio para tu meta (' + f.meta + '%)', money(C.precioMeta(d.costHa, r, f.meta)));
    });
  }
  function kv(a, b) { return '<div class="kv"><span>' + a + '</span><span>' + b + '</span></div>'; }

  function viewParcelas() {
    var d = derived(), f = d.f;
    var asign = S.parcelas.reduce(function (s, p) { return s + C.num(p.ha); }, 0);
    var libres = Math.max(f.ha - asign, 0), pctA = f.ha > 0 ? Math.min(asign / f.ha * 100, 100) : 0;
    var price = d.last ? C.num(d.last.precio) : 0;
    var edit = null;
    S.parcelas.forEach(function (p) { if (p.id === ui.editP) edit = p; });
    var h = demoBanner();

    h += '<section class="card"><h2>Parcelas de ' + esc(f.nombre || 'tu finca') + '</h2>' +
      '<p class="muted small">Divide las <b>' + f.ha + ' ha</b> de tu finca en parcelas, cada una con su código (P-01, P-02…). Las hectáreas totales se cambian en <a href="#costos">Costos</a>.</p>' +
      '<div class="barra" aria-hidden="true"><i style="width:' + pctA.toFixed(0) + '%"></i></div>' +
      '<div class="kv"><span>Asignadas a parcelas</span><b>' + Math.round(asign * 100) / 100 + ' de ' + f.ha + ' ha</b></div>' +
      '<div class="kv"><span>Sin asignar</span><b>' + (Math.round(libres * 100) / 100) + ' ha</b></div>' +
      (asign > f.ha + 0.001 ? '<span class="badge r">Las parcelas suman más que la finca: corrige las hectáreas</span>' : '') + '</section>';

    if (!S.parcelas.length) {
      h += '<section class="card empty"><h3>Aún no tienes parcelas</h3><p>' + (f.ha > 0 ? 'Agrega la primera abajo.' : 'Primero indica las hectáreas de tu finca en Costos.') + '</p></section>';
    } else {
      var tot = 0;
      h += '<div class="months">' + S.parcelas.map(function (p) {
        var rend = p.rend != null ? C.num(p.rend) : f.rend, u = price * rend - d.costHa, utot = u * p.ha;
        if (p.estado === 'activa' && price && d.costHa) tot += utot;
        var cos = '';
        if (p.fecha_siembra && p.estado === 'activa') {
          var c = new Date(p.fecha_siembra + 'T12:00:00'); c.setDate(c.getDate() + f.ciclo);
          cos = c.getFullYear() + '-' + ('0' + (c.getMonth() + 1)).slice(-2) + '-' + ('0' + c.getDate()).slice(-2);
        }
        return '<article class="mcard"><header><b>' + esc(p.codigo) + (p.nombre ? ' · ' + esc(p.nombre) : '') + '</b><span class="badge ' + (p.estado === 'activa' ? 'g' : p.estado === 'barbecho' ? 'a' : '') + '">' + esc(p.estado) + '</span></header>' +
          '<div class="kv"><span>Hectáreas</span><b>' + p.ha + '</b></div>' +
          '<div class="kv"><span>Cultivo / variedad</span><span>' + esc(p.cultivo) + (p.variedad ? ' · ' + esc(p.variedad) : '') + '</span></div>' +
          (p.fecha_siembra ? '<div class="kv"><span>Siembra</span><span>' + fmtFecha(p.fecha_siembra) + '</span></div>' : '') +
          (cos ? '<div class="kv"><span>Cosecha estimada</span><span>' + fmtFecha(cos) + '</span></div>' : '') +
          '<div class="kv"><span>Rinde</span><span>' + int(rend) + ' kg/ha' + (p.rend == null ? ' (el de la finca)' : '') + '</span></div>' +
          (price && d.costHa && rend ? '<div class="kv"><span>Utilidad estimada</span><b class="' + cls(utot) + '">' + money(utot, 0) + '</b></div>' : '') +
          '<div class="row" style="margin-top:.5rem"><button class="btn sec" data-act="edit-parcela" data-id="' + esc(p.id) + '">Editar</button>' +
          '<button class="btn sec icon" data-act="del-parcela" data-id="' + esc(p.id) + '" aria-label="Borrar parcela ' + esc(p.codigo) + '">✕</button></div></article>';
      }).join('') + '</div>';
      if (price && d.costHa) h += '<section class="card"><div class="kv res"><span>Utilidad estimada de parcelas activas (precio chacra de ' + fmtFecha(d.last.fecha) + ')</span><b class="' + cls(tot) + '">' + money(tot, 0) + '</b></div></section>';
    }

    var e = edit || { id: '', codigo: '', nombre: '', ha: '', rend: null, variedad: '', fecha_siembra: '', estado: 'activa' };
    h += '<section class="card" id="parcela-form"><h2>' + (edit ? 'Editar ' + esc(edit.codigo) : 'Agregar parcela') + '</h2>' +
      '<form id="f-parcela" style="margin-top:.5rem"><input type="hidden" name="id" value="' + esc(e.id) + '"><div class="grid g2">' +
      field('Código (déjalo vacío para automático)', '<input name="codigo" value="' + esc(e.codigo) + '" placeholder="P-0' + (S.parcelas.length + 1) + '" maxlength="20" autocomplete="off">') +
      field('Nombre (opcional)', '<input name="nombre" value="' + esc(e.nombre) + '" placeholder="Pampa alta" maxlength="80" autocomplete="off">') +
      field('Hectáreas', '<input name="ha" inputmode="decimal" value="' + esc(e.ha) + '" placeholder="' + (Math.round(libres * 100) / 100 || '0') + '" required>') +
      field('Rendimiento kg/ha (vacío = el de la finca)', '<input name="rend" inputmode="decimal" value="' + (e.rend == null ? '' : esc(e.rend)) + '" placeholder="' + esc(f.rend || 0) + '">') +
      field('Variedad', '<input name="variedad" value="' + esc(e.variedad) + '" placeholder="IR-43, Capoteña…" maxlength="60" autocomplete="off">') +
      field('Fecha de siembra', '<input type="date" name="fecha_siembra" value="' + esc(e.fecha_siembra || '') + '">') +
      field('Estado', '<select name="estado">' + opts(e.estado, [['activa', 'Activa'], ['barbecho', 'En barbecho'], ['cosechada', 'Cosechada']]) + '</select>') +
      '</div><div class="row" style="margin-top:.7rem"><button class="btn" type="submit">' + (edit ? 'Guardar cambios' : 'Agregar parcela') + '</button>' +
      (edit ? '<button class="btn sec" type="button" data-act="cancel-parcela">Cancelar</button>' : '') + '</div></form></section>';
    return h;
  }

  var EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19C5 19 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>';

  function viewAuth() {
    var reg = auth.mode === 'register';
    return '<section class="card"><h2>' + (reg ? 'Crear tu cuenta' : 'Ingresar') + '</h2>' +
      '<p class="muted small">' + (reg ? 'Cada cuenta tiene su propia finca, parcelas, costos y precios.' : 'Entra con tu correo y contraseña para ver tu finca.') + '</p>' +
      '<form id="f-auth" style="margin-top:.6rem"><div class="grid g2">' +
      (reg ? field('Tu nombre', '<input name="nombre" autocomplete="name" maxlength="80">') + field('Nombre de la finca', '<input name="finca" placeholder="Mi finca" maxlength="80">') + field('Lugar', '<input name="lugar" placeholder="Distrito, provincia" maxlength="120">') : '') +
      field('Correo', '<input type="email" name="email" autocomplete="email" required>') +
      field('Contraseña' + (reg ? ' (mínimo 8 caracteres)' : ''),
        '<div class="pw"><input type="password" name="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" minlength="' + (reg ? 8 : 1) + '" required>' +
        '<button type="button" class="pw-btn" data-act="toggle-pw" aria-pressed="false" aria-label="Mostrar contraseña" title="Mostrar contraseña">' + EYE + '</button></div>') +
      '</div><div class="row" style="margin-top:.7rem"><button class="btn" type="submit">' + (reg ? 'Crear cuenta' : 'Ingresar') + '</button>' +
      '<button class="btn sec" type="button" data-act="auth-mode">' + (reg ? 'Ya tengo cuenta' : 'Crear una cuenta') + '</button></div></form></section>';
  }

  function viewDatos() {
    return demoBanner() +
      '<section class="card"><h2>Tu cuenta</h2><p class="muted">Sesión iniciada como <b>' + esc((auth.user && auth.user.email) || '') + '</b>. Tus datos se guardan en tu cuenta y solo tú los ves; puedes abrirlos desde otro teléfono o computadora. Sin señal puedes seguir editando costos: se envían al volver la conexión.</p>' +
      '<div class="row" style="margin-top:.7rem"><button class="btn sec" data-act="logout">Cerrar sesión</button></div></section>' +
      '<section class="card"><h2>Copia de tus datos</h2><div class="row" style="margin-top:.4rem"><button class="btn" data-act="export-json">Descargar copia (JSON)</button><button class="btn sec" data-act="export-csv">Descargar precios (CSV)</button></div></section>' +
      '<section class="card"><h2>Limitaciones</h2><ul class="muted" style="margin:.2rem 0 0;padding-left:1.2rem">' +
      '<li>Es una ayuda para pensar, no una predicción. Nadie puede asegurar el precio futuro.</li>' +
      '<li>Los resultados valen tanto como los datos que ingreses: costos reales y precios en chacra de tu zona.</li>' +
      '<li>Los precios del pasado no están ajustados por inflación.</li>' +
      '<li>No considera plagas, inundaciones, sequía, humedad del grano ni cambios de política (aranceles, importaciones).</li>' +
      '<li>Con menos de 3 años de precios, la estacionalidad es solo una pista.</li></ul></section>';
  }

  /* ---------- Router y render ---------- */
  var VIEWS = { inicio: viewInicio, costos: viewCostos, parcelas: viewParcelas, precios: viewPrecios, siembra: viewSiembra, escenarios: viewEscenarios, datos: viewDatos };

  function updateHead() {
    var f = S.finca;
    $('#subtitulo').textContent = auth.ok
      ? (f.nombre || 'Mi finca') + ' · ' + (C.num(f.ha) || 0) + ' ha' + (auth.offline ? ' · sin conexión' : dirty ? ' · guardando…' : '')
      : 'Arroz · decide con tus números';
  }
  function render() {
    $('#tabs').style.display = auth.ok ? '' : 'none';
    $('#view').innerHTML = auth.ok ? VIEWS[ui.tab]() : viewAuth();
    $$('#tabs a').forEach(function (a) {
      var on = a.dataset.tab === ui.tab;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateHead();
    if (!auth.ok) return;
    if (ui.tab === 'costos') refreshCostos();
    if (ui.tab === 'escenarios') refreshEsc();
  }
  function route() {
    var t = (location.hash || '#inicio').slice(1);
    ui.tab = VIEWS[t] ? t : 'inicio';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Eventos ---------- */
  var view = $('#view');

  view.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.f) {
      var k = el.dataset.f;
      S.finca[k] = (k === 'nombre' || k === 'lugar') ? el.value : C.num(el.value);
      save();
      if (ui.tab === 'costos') refreshCostos();
      updateHead();
    } else if (el.dataset.cost != null && el.dataset.cost !== '') {
      var c = S.costs[+el.dataset.cost];
      if (!c) return;
      c[el.dataset.k] = el.dataset.k === 'monto' ? C.num(el.value) : el.value;
      save(); refreshCostos();
    } else if (el.dataset.esc) {
      S.esc[el.dataset.esc][el.dataset.k] = C.num(el.value);
      save(); refreshEsc();
    }
  });

  view.addEventListener('change', function (e) {
    var el = e.target, act = el.dataset.act;
    if (el.dataset.ri != null && el.dataset.ri !== '') {
      S.riesgos[+el.dataset.ri][el.dataset.k] = el.value;
      save();
    } else if (act === 'tipo') { ui.tipo = el.value; render(); }
    else if (act === 'esc-mes') { ui.escMes = +el.value; }
    else if (act === 'file-csv' && el.files[0]) {
      var r = new FileReader();
      r.onload = function () { $('#csv-text').value = String(r.result); toast('Archivo cargado. Pulsa Importar.'); };
      r.readAsText(el.files[0]);
    }
  });

  // Errores de la API: 401 = sesión terminada; 0 = sin conexión (estas acciones necesitan internet).
  function apiFail(e) {
    if (e.status === 401) return sessionLost();
    toast(e.status === 0 ? 'Sin conexión: esta acción necesita internet.' : e.message);
  }

  view.addEventListener('submit', function (e) {
    var id = e.target.id;
    if (id !== 'f-precio' && id !== 'f-parcela' && id !== 'f-auth') return;
    e.preventDefault();
    var fd = new FormData(e.target);

    if (id === 'f-auth') {
      var reg = auth.mode === 'register';
      var p = reg
        ? Api.register({ email: fd.get('email'), password: fd.get('password'), nombre: fd.get('nombre'), finca: fd.get('finca'), lugar: fd.get('lugar') })
        : Api.login(fd.get('email'), fd.get('password'));
      p.then(function () { return Api.state(); }).then(function (o) {
        setState(o); location.hash = reg ? '#costos' : '#inicio'; ui.tab = reg ? 'costos' : 'inicio'; render();
        toast(reg ? 'Cuenta creada. Empieza por tus costos y tus hectáreas.' : 'Bienvenido.');
      }, function (err) { toast(err.status === 0 ? 'Sin conexión.' : err.message); });
      return;
    }

    if (id === 'f-parcela') {
      var body = {
        id: fd.get('id'), codigo: fd.get('codigo'), nombre: fd.get('nombre'), ha: C.num(fd.get('ha')),
        rend: String(fd.get('rend') || '').trim() === '' ? null : C.num(fd.get('rend')),
        variedad: fd.get('variedad'), fecha_siembra: fd.get('fecha_siembra') || null, estado: fd.get('estado')
      };
      var editing = !!body.id;
      (editing ? Api.editParcela(body) : Api.addParcela(body)).then(function (r) {
        if (editing) S.parcelas = S.parcelas.map(function (x) { return x.id === r.parcela.id ? r.parcela : x; });
        else S.parcelas.push(r.parcela);
        S.parcelas.sort(function (a, b) { return a.codigo < b.codigo ? -1 : 1; });
        ui.editP = null; cacheWrite(); render(); toast(editing ? 'Parcela actualizada.' : 'Parcela ' + r.parcela.codigo + ' agregada.');
      }, apiFail);
      return;
    }

    var fecha = C.parseDate(fd.get('fecha')), precio = C.num(fd.get('precio'));
    if (!fecha || precio <= 0 || precio > 50) { toast('Revisa la fecha y el precio.'); return; }
    var tipo = fd.get('tipo') === 'mayorista' ? 'mayorista' : 'chacra';
    Api.addPrecios([{ fecha: fecha, precio: precio, tipo: tipo, fuente: String(fd.get('fuente') || '').trim() }]).then(function (r) {
      S.prices = S.prices.concat(r.prices); ui.tipo = tipo; cacheWrite(); render(); toast('Precio guardado.');
    }, apiFail);
  });

  view.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    var act = b.dataset.act;
    if (act === 'add-cost') {
      S.costs.push({ id: C.uid(), nombre: '', monto: 0 }); save(); render();
      var rows = $$('#cost-list .cost-row input[data-k="nombre"]'); if (rows.length) rows[rows.length - 1].focus();
    } else if (act === 'del-cost') {
      S.costs.splice(+b.dataset.i, 1); save(); render();
    } else if (act === 'del-price') {
      Api.delPrecio(b.dataset.id).then(function () {
        S.prices = S.prices.filter(function (p) { return p.id !== b.dataset.id; }); cacheWrite(); render();
      }, apiFail);
    } else if (act === 'import-csv') {
      var res = C.parseCSV($('#csv-text').value);
      var seen = {};
      S.prices.forEach(function (p) { seen[p.fecha + '|' + p.tipo + '|' + p.precio] = 1; });
      var nuevos = res.rows.filter(function (p) { var k = p.fecha + '|' + p.tipo + '|' + p.precio; if (seen[k]) return false; seen[k] = 1; return true; });
      if (!nuevos.length) { toast('No hay precios nuevos para importar' + (res.errors.length ? ' · ' + res.errors.length + ' línea(s) con error' : '') + '.'); return; }
      Api.addPrecios(nuevos.slice(0, 500)).then(function (r) {
        S.prices = S.prices.concat(r.prices); cacheWrite(); render();
        toast(r.prices.length + ' precio(s) importado(s)' + (res.errors.length ? ' · ' + res.errors.length + ' línea(s) con error' : '') + '.');
      }, apiFail);
    } else if (act === 'export-csv') {
      download('precios-arroz.csv', C.toCSV(S.prices), 'text/csv');
    } else if (act === 'export-json') {
      download('chacra-clara-copia-' + todayISO() + '.json', JSON.stringify(S, null, 2), 'application/json');
    } else if (act === 'toggle-pw') {
      var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.innerHTML = show ? EYE_OFF : EYE;
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
      b.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
      b.title = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
      inp.focus();
    } else if (act === 'auth-mode') {
      auth.mode = auth.mode === 'register' ? 'login' : 'register'; render();
    } else if (act === 'logout') {
      Api.logout().then(function () {
        auth.ok = false; auth.user = null; S = emptyState(); dirty = false; cacheClear(); location.hash = '#inicio'; render();
      }, apiFail);
    } else if (act === 'edit-parcela') {
      ui.editP = b.dataset.id; render();
      var form = $('#parcela-form'); if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'cancel-parcela') {
      ui.editP = null; render();
    } else if (act === 'del-parcela') {
      var pc = S.parcelas.filter(function (x) { return x.id === b.dataset.id; })[0];
      if (!pc || !confirm('¿Borrar la parcela ' + pc.codigo + '? No se puede deshacer.')) return;
      Api.delParcela(pc.id).then(function () {
        S.parcelas = S.parcelas.filter(function (x) { return x.id !== pc.id; }); cacheWrite(); render(); toast('Parcela borrada.');
      }, apiFail);
    } else if (act === 'esc-hist') {
      var s = derived().seas[ui.escMes];
      if (!s || !s.n) { toast('No hay precios registrados para ese mes.'); return; }
      var q = s.n >= 4;
      S.esc.pes.p = +(q ? s.p25 : s.min).toFixed(2); S.esc.base.p = +s.med.toFixed(2); S.esc.opt.p = +(q ? s.p75 : s.max).toFixed(2);
      save(); render(); toast('Precios cargados desde el historial.');
    }
  });

  window.addEventListener('hashchange', route);
  route();
  boot();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
