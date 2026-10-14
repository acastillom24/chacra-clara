/* Lógica de cálculo: sin DOM, se puede probar con Node. */
(function (root) {
  'use strict';

  var MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }

  function costoPorHa(costs) {
    return costs.reduce(function (s, c) { return s + num(c.monto); }, 0);
  }

  function equilibrio(costHa, rend) { return rend > 0 ? costHa / rend : 0; }
  function utilidadHa(precio, rend, costHa) { return precio * rend - costHa; }
  function rendEquilibrio(precio, costHa) { return precio > 0 ? costHa / precio : Infinity; }
  function precioMeta(costHa, rend, margenPct) { return rend > 0 ? (costHa * (1 + margenPct / 100)) / rend : 0; }

  function percentile(arr, p) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var idx = (a.length - 1) * p;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  /* Acepta AAAA-MM-DD o DD/MM/AAAA. Devuelve AAAA-MM-DD o null. */
  function parseDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    var y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else {
      m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
      if (!m) return null;
      d = +m[1]; mo = +m[2]; y = +m[3];
    }
    var t = new Date(y, mo - 1, d);
    if (t.getFullYear() !== y || t.getMonth() !== mo - 1 || t.getDate() !== d) return null;
    return y + '-' + pad(mo) + '-' + pad(d);
  }

  function ultimoPrecio(prices, tipo) {
    var best = null;
    prices.forEach(function (p) {
      if (tipo && p.tipo !== tipo) return;
      if (num(p.precio) <= 0) return;
      if (!best || p.fecha > best.fecha) best = p;
    });
    return best;
  }

  /* Promedia dentro de cada año-mes para que un mes con muchos registros no pese más. */
  function monthlyPoints(prices, tipo) {
    var g = {};
    prices.forEach(function (p) {
      if (tipo && p.tipo !== tipo) return;
      var v = num(p.precio);
      if (v <= 0 || !p.fecha) return;
      var k = p.fecha.slice(0, 7);
      (g[k] = g[k] || []).push(v);
    });
    return Object.keys(g).sort().map(function (k) {
      var arr = g[k];
      return {
        key: k, year: +k.slice(0, 4), month: +k.slice(5, 7) - 1,
        value: arr.reduce(function (a, b) { return a + b; }, 0) / arr.length
      };
    });
  }

  function yearsOfData(prices, tipo) {
    var set = {};
    monthlyPoints(prices, tipo).forEach(function (p) { set[p.year] = 1; });
    return Object.keys(set).length;
  }

  function seasonality(prices, tipo, eq) {
    var pts = monthlyPoints(prices, tipo);
    var out = [];
    for (var m = 0; m < 12; m++) {
      var vals = pts.filter(function (p) { return p.month === m; }).map(function (p) { return p.value; });
      if (!vals.length) { out.push({ month: m, n: 0 }); continue; }
      var sum = vals.reduce(function (a, b) { return a + b; }, 0);
      out.push({
        month: m, n: vals.length,
        min: Math.min.apply(null, vals), max: Math.max.apply(null, vals),
        p25: percentile(vals, 0.25), med: percentile(vals, 0.5), p75: percentile(vals, 0.75),
        mean: sum / vals.length,
        probOk: eq > 0 ? vals.filter(function (v) { return v >= eq; }).length / vals.length : null
      });
    }
    return out;
  }

  function harvestMonth(sowMonth, ciclo) {
    var d = new Date(2021, sowMonth, 15);
    d.setDate(d.getDate() + Math.round(ciclo));
    return d.getMonth();
  }

  var PEN_AGUA = { na: 0, buena: 0, media: 1, baja: 2 };
  var PEN_LLUVIA = { na: 0, bajo: 0, medio: 1, alto: 2 };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Para cada mes de siembra: ¿cuándo cosecho y qué precio histórico hubo en ese mes? */
  function planSiembra(seas, o) {
    var plan = MESES.map(function (_, m) {
      var hm = harvestMonth(m, o.ciclo);
      var s = seas[hm];
      var r = o.riesgos || [];
      var agua = (r[m] && r[m].agua) || 'na';
      var lluvia = (r[hm] && r[hm].lluvia) || 'na';
      var base = { siembra: m, cosecha: hm, agua: agua, lluvia: lluvia };
      if (!s || !s.n) { base.sinDatos = true; return base; }
      var useQ = s.n >= 4;
      var pes = useQ ? s.p25 : s.min;
      var opt = useQ ? s.p75 : s.max;
      var uBase = utilidadHa(s.med, o.rend, o.costHa);
      var margenPct = o.costHa > 0 ? (s.med * o.rend / o.costHa - 1) * 100 : 0;
      var pen = PEN_AGUA[agua] + PEN_LLUVIA[lluvia];
      base.n = s.n;
      base.pocosDatos = s.n < 3;
      base.usaPercentiles = useQ;
      base.pPes = pes; base.pBase = s.med; base.pOpt = opt;
      base.uPes = utilidadHa(pes, o.rend, o.costHa);
      base.uBase = uBase;
      base.uOpt = utilidadHa(opt, o.rend, o.costHa);
      base.totalBase = uBase * o.ha;
      base.margenPct = margenPct;
      base.probOk = s.probOk;
      base.score = clamp(margenPct, -50, 100) * 0.5 + (s.probOk || 0) * 50 - pen * 10;
      return base;
    });
    var ranked = plan.filter(function (p) { return !p.sinDatos; })
      .sort(function (a, b) { return b.score - a.score; });
    ranked.forEach(function (p, i) { p.rank = i + 1; });
    return plan;
  }

  /* 'verde' | 'amarillo' | 'rojo' | 'sin' */
  function semaforo(precio, eq, metaPct) {
    if (!precio || !eq) return 'sin';
    if (precio < eq) return 'rojo';
    if (precio < eq * (1 + metaPct / 100)) return 'amarillo';
    return 'verde';
  }

  function normTipo(t) {
    t = String(t || '').toLowerCase();
    if (t.indexOf('may') === 0) return 'mayorista';
    return 'chacra';
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Columnas: fecha, precio, tipo, fuente. Separador: coma, punto y coma o tabulación. */
  function parseCSV(text) {
    var rows = [], errors = [];
    String(text || '').split(/\r?\n/).forEach(function (line, i) {
      line = line.trim();
      if (!line) return;
      var sep = line.indexOf(';') >= 0 ? ';' : (line.indexOf('\t') >= 0 ? '\t' : ',');
      var c = line.split(sep).map(function (x) { return x.trim().replace(/^"|"$/g, ''); });
      var f = parseDate(c[0]);
      if (!f) { if (i > 0 || !/fecha/i.test(c[0])) errors.push('Línea ' + (i + 1) + ': fecha no válida'); return; }
      var p = num(c[1]);
      if (p <= 0 || p > 50) { errors.push('Línea ' + (i + 1) + ': precio no válido'); return; }
      rows.push({ id: uid(), fecha: f, precio: Math.round(p * 1000) / 1000, tipo: normTipo(c[2]), fuente: c[3] || 'Importado' });
    });
    return { rows: rows, errors: errors };
  }

  function toCSV(prices) {
    var lines = ['fecha,precio,tipo,fuente'];
    prices.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; }).forEach(function (p) {
      lines.push([p.fecha, p.precio, p.tipo, '"' + String(p.fuente || '').replace(/"/g, '""') + '"'].join(','));
    });
    return lines.join('\n');
  }

  var api = {
    MESES: MESES, MESES_LARGO: MESES_LARGO, num: num, costoPorHa: costoPorHa, equilibrio: equilibrio,
    utilidadHa: utilidadHa, rendEquilibrio: rendEquilibrio, precioMeta: precioMeta, percentile: percentile,
    parseDate: parseDate, ultimoPrecio: ultimoPrecio, monthlyPoints: monthlyPoints, yearsOfData: yearsOfData,
    seasonality: seasonality, harvestMonth: harvestMonth, planSiembra: planSiembra, semaforo: semaforo,
    parseCSV: parseCSV, toCSV: toCSV, uid: uid
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== 'undefined' ? window : this);
