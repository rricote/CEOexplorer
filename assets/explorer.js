/* Explorador de barómetros CEO — lógica compartida por todas las encuestas */
(function () {
  'use strict';
  const D = window.CEO_DATA;
  const I = D.info, N = I.n, ALPH = D.alph, V = D.vars;
  const byName = {}; V.forEach((v, i) => { v.i = i; byName[v.n] = v; });
  const LUT = new Int16Array(128).fill(-1); for (let k = 0; k < ALPH.length; k++) LUT[ALPH.charCodeAt(k)] = k;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '–' : x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

  const ROLE = {
    rec_agrupado: 'Recuerdo agrupado (ponderación)', int_parlament: 'Intención voto Parlament', rec_cens: 'Recuerdo Parlament (sobre censo)',
    int_congres: 'Intención voto Congreso', rec_congres: 'Recuerdo Congreso', simpatia: 'Simpatía de partido', ideologia: 'Ideología 0-10',
    independencia: 'Independencia sí/no', relacion_cat_esp: 'Relación Cataluña-España', sentimiento: 'Sentimiento de pertenencia',
    lengua_propia: 'Lengua propia', sexo: 'Sexo', edad_gr: 'Edad (grupos CEO)', edad5: 'Edad (5 grupos)', edad: 'Edad', provincia: 'Provincia', habitat: 'Tamaño de municipio'
  };
  byName.REC_AGRUPADO.key = 'rec_agrupado';
  if (byName.EDAD_5GR) byName.EDAD_5GR.key = 'edad5';
  const keyOf = r => V.find(v => v.key === r);

  /* ---------- decodificación ---------- */
  function codes(v) {
    if (v._a) return v._a;
    const a = new Uint8Array(N);
    if (v.t === 'num') { v._a = a; return a; }
    for (let i = 0; i < N; i++) { const ch = v.d.charCodeAt(i); a[i] = ch === 32 ? 255 : LUT[ch]; }
    v._a = a; return a;
  }
  // variable numérica → categorías por intervalos (para usarla como columna o fila)
  function numBins(v) {
    if (v._bins) return v._bins;
    const xs = v.v.filter(x => x != null && x < 900).sort((a, b) => a - b);
    const q = p => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
    let cuts = [...new Set([q(.2), q(.4), q(.6), q(.8)])];
    const cats = []; let lo = xs[0];
    cuts.forEach(c => { cats.push([cats.length, `${fmt(lo, 0)}–${fmt(c, 0)}`, 0]); lo = c; });
    cats.push([cats.length, `${fmt(lo, 0)}–${fmt(xs[xs.length - 1], 0)}`, 0]);
    const a = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const x = v.v[i]; if (x == null || x >= 900) { a[i] = 255; continue; } let k = 0; while (k < cuts.length && x > cuts[k]) k++; a[i] = k; }
    v._bins = { cats, a }; return v._bins;
  }
  const catsOf = v => v.t === 'num' ? numBins(v).cats : v.c;
  const arrOf = v => v.t === 'num' ? numBins(v).a : codes(v);
  const numVal = (v, i) => { // valor numérico para medias
    if (v.t === 'num') { const x = v.v[i]; return (x == null || x >= 900) ? null : x; }
    const k = codes(v)[i]; if (k === 255) return null; const c = v.c[k]; if (c[2] || typeof c[0] !== 'number' || c[0] > 10 || c[0] < 0) return null; return c[0];
  };

  /* ---------- colores ---------- */
  const PARTY = [
    [/PSC|PSOE|Socialist/i, '#e3051b'], [/^ERC|Esquerra Republicana/i, '#f2a400'], [/Junts pel S/i, '#2aa197'], [/Junts|JxCat|JuntsxCat/i, '#00b8ab'],
    [/PDeCAT|^CDC|CiU|Converg|Democràcia i Llibertat|Uni[oó]/i, '#22508f'], [/^PPC?$|^PP\b|Partit Popular|Partido Popular/i, '#1d7fd6'],
    [/Vox/i, '#58b02c'], [/^CUP/i, '#d4b400'], [/Comuns|Comú|ECP|CatComú|Sumar|Podem|ICV|Catalunya s[ií] que es pot|CSQEP|Barcelona en Com/i, '#8b2f8f'],
    [/^C's|^Cs\b|Ciutadans|Ciudadanos/i, '#f07d18'], [/Aliança/i, '#3f6e9e'], [/PACMA/i, '#93b85a'],
    [/Abstenci|No va votar|No votaria|No votar|S'abstindria/i, '#8c969e'], [/No podia|No podría|No podía|No tenia dret/i, '#b5bcc2'],
    [/NS\s*\/?\s*NC|No ho sap|No contesta/i, '#c9ced3'], [/blanc|Nul|Otros|Altres/i, '#a89b8c'], [/^Cap$|Cap partit|Ninguno/i, '#bfc4c9']
  ];
  const PAL = ['#23408e', '#c4573a', '#2f8f83', '#b0882a', '#7a4ea3', '#3d7fb8', '#9a3f5f', '#5d8a3a', '#c07a3f', '#4f5d75', '#a26b9a', '#2b6f5c'];
  function colorsFor(cats, v) {
    const scale = v && v.t === 'scale';
    const nonNs = cats.filter(c => !c[2]);
    let pi = 0;
    return cats.map(c => {
      const lab = String(c[1]);
      if (c[2]) return '#c9ced3';
      for (const [re, col] of PARTY) if (re.test(lab)) return col;
      if (scale) { const t = nonNs.length > 1 ? nonNs.indexOf(c) / (nonNs.length - 1) : .5; return `hsl(${220 - t * 200},${55}%,${45 + 8 * Math.sin(t * Math.PI)}%)`; }
      return PAL[pi++ % PAL.length];
    });
  }

  /* ---------- estado ---------- */
  const S = { w: 'rec', row: null, col: null, fvar: null, fcats: null, nsnc: false, base: 'col', chart: 'auto', moe: false, q: '', tf: 'all' };
  const weights = () => S.w === 'rec' ? D.w.rec : S.w === 'ceo' ? D.w.ceo : null;

  function baseMask() {
    const m = new Uint8Array(N).fill(1);
    if (S.fvar && S.fcats) { const fv = byName[S.fvar], a = arrOf(fv); for (let i = 0; i < N; i++) if (!S.fcats.has(a[i])) m[i] = 0; }
    return m;
  }
  function keepCats(v) { const cs = catsOf(v); return cs.map((c, k) => k).filter(k => !(S.nsnc && cs[k][2])); }

  function xtab() {
    const rv = byName[S.row], cv = S.col ? byName[S.col] : null, W = weights(), m = baseMask();
    const ra = arrOf(rv), rk = keepCats(rv), rset = new Set(rk);
    const ca = cv ? arrOf(cv) : null, ck = cv ? keepCats(cv) : [0], cset = new Set(ck);
    const R = rk.length, C = ck.length, rix = {}, cix = {};
    rk.forEach((k, i) => rix[k] = i); ck.forEach((k, i) => cix[k] = i);
    const w = Array.from({ length: R }, () => new Float64Array(C + 1)), u = Array.from({ length: R }, () => new Float64Array(C + 1));
    const cw = new Float64Array(C + 1), cu = new Float64Array(C + 1), cw2 = new Float64Array(C + 1);
    for (let i = 0; i < N; i++) {
      if (!m[i] || !rset.has(ra[i])) continue;
      const c = cv ? ca[i] : 0; if (cv && !cset.has(c)) continue;
      const ri = rix[ra[i]], ci = cv ? cix[c] : 0, wi = W ? W[i] : 1;
      w[ri][ci] += wi; u[ri][ci] += 1; w[ri][C] += wi; u[ri][C] += 1;
      cw[ci] += wi; cu[ci] += 1; cw2[ci] += wi * wi; cw[C] += wi; cu[C] += 1; cw2[C] += wi * wi;
    }
    const rows = rk.map(k => catsOf(rv)[k]), cols = cv ? ck.map(k => catsOf(cv)[k]) : [[0, 'Total', 0]];
    const neff = Array.from(cw, (s, j) => cw2[j] ? s * s / cw2[j] : 0);
    const rtot = w.map(r => r[C]), gtot = cw[C];
    const pct = (r, c) => {
      if (S.base === 'row') return rtot[r] ? 100 * w[r][c] / rtot[r] : null;
      if (S.base === 'total') return gtot ? 100 * w[r][c] / gtot : null;
      return cw[c] ? 100 * w[r][c] / cw[c] : null;
    };
    return { rv, cv, rows, cols, w, u, cw, cu, neff, pct, C, R, rowColors: colorsFor(rows, rv), colColors: cv ? colorsFor(cols, cv) : ['#23408e'] };
  }
  function means(T) {
    // media de la variable de filas (escala/numérica) por columna
    const rv = T.rv, cv = T.cv, W = weights(), m = baseMask(), ca = cv ? arrOf(cv) : null;
    const ck = cv ? keepCats(cv) : [0], cix = {}; ck.forEach((k, i) => cix[k] = i);
    const C = ck.length, sw = new Float64Array(C + 1), sx = new Float64Array(C + 1), sxx = new Float64Array(C + 1), sw2 = new Float64Array(C + 1), n = new Float64Array(C + 1);
    for (let i = 0; i < N; i++) {
      if (!m[i]) continue; const x = numVal(rv, i); if (x == null) continue;
      let ci = 0; if (cv) { if (!(ca[i] in cix)) continue; ci = cix[ca[i]]; }
      const wi = W ? W[i] : 1;
      for (const j of [ci, C]) { sw[j] += wi; sx[j] += wi * x; sxx[j] += wi * x * x; sw2[j] += wi * wi; n[j]++; }
    }
    return Array.from({ length: C + 1 }, (_, j) => {
      if (!sw[j]) return { mean: null, n: 0 };
      const mu = sx[j] / sw[j], vr = Math.max(0, sxx[j] / sw[j] - mu * mu), ne = sw[j] * sw[j] / sw2[j];
      return { mean: mu, sd: Math.sqrt(vr), n: n[j], ne, ci: 1.96 * Math.sqrt(vr / ne) };
    });
  }

  /* ---------- gráficos SVG ---------- */
  const trunc = (s, n) => (s = String(s)).length > n ? s.slice(0, n - 1) + '…' : s;
  function svgWrap(w, h, inner) { inner = inner.replace(/(fill|stroke)="(var\([^)]+\))"/g, 'style="$1:$2"'); return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`; }
  function hbars(T, width) {
    const C = T.C, multi = !!T.cv, lw = Math.min(260, width * .38), bw = width - lw - 60;
    const groups = multi ? [...Array(C).keys()] : [0];
    const bh = multi ? Math.max(6, Math.min(14, 40 / C)) : 20, gap = multi ? 10 : 6;
    let max = 0; T.rows.forEach((r, i) => groups.forEach(j => { const p = T.pct(i, j); if (p > max) max = p; }));
    max = Math.max(5, Math.ceil(max / 10) * 10);
    let y = 6, out = '';
    for (let g = 0; g <= max; g += max > 50 ? 20 : 10) { const x = lw + bw * g / max; out += `<line class="ax" x1="${x}" x2="${x}" y1="0" y2="9999"/>`; }
    T.rows.forEach((r, i) => {
      const gh = groups.length * bh;
      out += `<text x="${lw - 8}" y="${y + gh / 2 + 4}" text-anchor="end" font-size="12">${esc(trunc(r[1], 42))}</text>`;
      groups.forEach((j, k) => {
        const p = T.pct(i, j) || 0, wbar = bw * p / max, col = multi ? T.colColors[j] : T.rowColors[i];
        out += `<rect x="${lw}" y="${y + k * bh}" width="${Math.max(0, wbar)}" height="${bh - 1}" fill="${col}" rx="2"><title>${esc(r[1])}${multi ? ' · ' + esc(T.cols[j][1]) : ''}: ${fmt(p)}% (n=${T.u[i][j]})</title></rect>`;
        if (!multi || bh >= 10) out += `<text x="${lw + wbar + 4}" y="${y + k * bh + bh - 3}" font-size="${multi ? 10 : 12}" class="${multi ? 'lbl' : ''}">${fmt(p)}</text>`;
      });
      y += gh + gap;
    });
    let axis = '';
    for (let g = 0; g <= max; g += max > 50 ? 20 : 10) axis += `<text class="lbl" x="${lw + bw * g / max}" y="${y + 12}" text-anchor="middle">${g}%</text>`;
    return svgWrap(width, y + 18, out.replace(/y2="9999"/g, `y2="${y}"`) + axis);
  }
  function stacked(T, width) {
    const lw = Math.min(220, width * .3), bw = width - lw - 16, bh = 22, gap = 8;
    const bars = T.cv ? [T.C, ...Array(T.C).keys()] : [0];
    let y = 4, out = '';
    bars.forEach(j => {
      const lab = j === T.C ? 'Total' : T.cols[j][1];
      out += `<text x="${lw - 8}" y="${y + bh / 2 + 4}" text-anchor="end" font-size="12" ${j === T.C ? 'font-weight="600"' : ''}>${esc(trunc(lab, 34))}</text>`;
      let x = lw, tot = 0; const ps = T.rows.map((r, i) => { const p = T.cv ? (T.cw[j] ? 100 * T.w[i][j] / T.cw[j] : 0) : T.pct(i, 0); tot += p; return p; });
      ps.forEach((p, i) => {
        const wv = tot ? bw * p / tot : 0;
        out += `<rect x="${x}" y="${y}" width="${Math.max(0, wv)}" height="${bh}" fill="${T.rowColors[i]}"><title>${esc(lab)} · ${esc(T.rows[i][1])}: ${fmt(p)}%</title></rect>`;
        if (wv > 26) out += `<text x="${x + wv / 2}" y="${y + bh / 2 + 4}" text-anchor="middle" font-size="10.5" style="fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px">${fmt(p, 0)}</text>`;
        x += wv;
      });
      y += bh + gap + (j === T.C ? 6 : 0);
    });
    return svgWrap(width, y, out);
  }
  function heat(T, width) {
    const lw = Math.min(220, width * .28), C = T.C, cwid = Math.max(44, (width - lw) / (C + 1)), rh = 24, hh = 70;
    let max = 0; T.rows.forEach((r, i) => { for (let j = 0; j <= C; j++) max = Math.max(max, T.pct(i, j) || 0); });
    let out = '';
    [...T.cols.map(c => c[1]), 'Total'].forEach((lab, j) => {
      const x = lw + j * cwid + cwid / 2;
      out += `<text transform="translate(${x},${hh - 6}) rotate(-35)" font-size="11" class="lbl">${esc(trunc(lab, 18))}</text>`;
    });
    T.rows.forEach((r, i) => {
      const y = hh + i * rh;
      out += `<text x="${lw - 8}" y="${y + rh / 2 + 4}" text-anchor="end" font-size="12">${esc(trunc(r[1], 32))}</text>`;
      for (let j = 0; j <= C; j++) {
        const p = T.pct(i, j) || 0, a = max ? p / max : 0;
        out += `<rect x="${lw + j * cwid + 1}" y="${y + 1}" width="${cwid - 2}" height="${rh - 2}" rx="3" fill="var(--accent)" fill-opacity="${(.06 + .9 * a).toFixed(3)}"><title>${esc(r[1])} · ${esc(j === C ? 'Total' : T.cols[j][1])}: ${fmt(p)}%</title></rect>`;
        out += `<text x="${lw + j * cwid + cwid / 2}" y="${y + rh / 2 + 4}" text-anchor="middle" font-size="11" style="fill:${a > .55 ? 'var(--panel)' : 'var(--ink)'}">${fmt(p, p < 10 ? 1 : 0)}</text>`;
      }
    });
    return svgWrap(Math.max(width, lw + cwid * (C + 1)), hh + T.R * rh + 4, out);
  }
  function lines(T, width) {
    const lm = 40, rm = 150, tm = 12, h = 300, bm = 70, pw = width - lm - rm, ph = h - tm - bm, C = T.C;
    let max = 0; T.rows.forEach((r, i) => { for (let j = 0; j < C; j++) max = Math.max(max, T.pct(i, j) || 0); });
    max = Math.max(10, Math.ceil(max / 10) * 10);
    const X = j => lm + (C === 1 ? pw / 2 : pw * j / (C - 1)), Y = p => tm + ph * (1 - p / max);
    let out = '';
    for (let g = 0; g <= max; g += max > 50 ? 20 : 10) out += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${Y(g)}" y2="${Y(g)}"/><text class="lbl" x="${lm - 6}" y="${Y(g) + 4}" text-anchor="end">${g}</text>`;
    T.cols.forEach((c, j) => out += `<text transform="translate(${X(j)},${tm + ph + 14}) rotate(-30)" text-anchor="end" class="lbl">${esc(trunc(c[1], 18))}</text>`);
    const ends = [];
    T.rows.forEach((r, i) => {
      const pts = T.cols.map((c, j) => [X(j), Y(T.pct(i, j) || 0)]);
      out += `<polyline fill="none" stroke="${T.rowColors[i]}" stroke-width="2.2" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
      pts.forEach((p, j) => out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="${T.rowColors[i]}"><title>${esc(r[1])} · ${esc(T.cols[j][1])}: ${fmt(T.pct(i, j))}%</title></circle>`);
      ends.push([pts[pts.length - 1][1], r[1], T.rowColors[i]]);
    });
    ends.sort((a, b) => a[0] - b[0]); let last = -99;
    ends.forEach(e => { const y = Math.max(e[0] + 4, last + 12); last = y; out += `<text x="${lm + pw + 8}" y="${y}" font-size="11" style="fill:${e[2]}">${esc(trunc(e[1], 22))}</text>`; });
    return svgWrap(width, h, out);
  }
  function meanChart(T, width) {
    const M = means(T), lw = Math.min(240, width * .35), bw = width - lw - 70, bh = 18, gap = 7;
    const isScale = T.rv.t === 'scale';
    const vals = M.filter(m => m.mean != null).map(m => m.mean + (m.ci || 0));
    const max = isScale ? 10 : Math.max(...vals, 1) * 1.05;
    const groups = T.cv ? [T.C, ...Array(T.C).keys()] : [T.C];
    let y = 4, out = '';
    for (let g = 0; g <= 10; g += 2) { const x = lw + bw * (isScale ? g : max * g / 10) / max; out += `<line class="ax" x1="${x}" x2="${x}" y1="0" y2="9999"/>`; }
    groups.forEach(j => {
      const m = M[j], lab = j === T.C ? 'Total' : T.cols[j][1], col = j === T.C ? 'var(--ink)' : T.colColors[j];
      out += `<text x="${lw - 8}" y="${y + bh / 2 + 4}" text-anchor="end" font-size="12" ${j === T.C ? 'font-weight="600"' : ''}>${esc(trunc(lab, 34))}</text>`;
      if (m.mean != null) {
        const x = lw + bw * m.mean / max, x0 = lw + bw * Math.max(0, m.mean - m.ci) / max, x1 = lw + bw * Math.min(max, m.mean + m.ci) / max;
        out += `<rect x="${lw}" y="${y + 3}" width="${x - lw}" height="${bh - 6}" fill="${col}" fill-opacity=".85" rx="2"><title>${esc(lab)}: media ${fmt(m.mean, 2)} ± ${fmt(m.ci, 2)} (n=${m.n})</title></rect>`;
        out += `<line x1="${x0}" x2="${x1}" y1="${y + bh / 2}" y2="${y + bh / 2}" stroke="var(--ink)" stroke-width="1.4"/><line x1="${x0}" x2="${x0}" y1="${y + 4}" y2="${y + bh - 4}" stroke="var(--ink)"/><line x1="${x1}" x2="${x1}" y1="${y + 4}" y2="${y + bh - 4}" stroke="var(--ink)"/>`;
        out += `<text x="${x1 + 5}" y="${y + bh / 2 + 4}" font-size="11.5">${fmt(m.mean, 2)}</text>`;
      }
      y += bh + gap;
    });
    let axis = '';
    for (let g = 0; g <= 10; g += 2) { const val = isScale ? g : max * g / 10; axis += `<text class="lbl" x="${lw + bw * val / max}" y="${y + 12}" text-anchor="middle">${fmt(val, isScale ? 0 : 1)}</text>`; }
    return { svg: svgWrap(width, y + 18, out.replace(/y2="9999"/g, `y2="${y}"`) + axis), M };
  }

  /* ---------- tabla ---------- */
  function table(T) {
    const C = T.C, cols = T.cv ? [...Array(C).keys(), C] : [0];
    const head = `<tr><th>${esc(T.rv.n)}</th>${cols.map(j => `<th class="${j === C ? 'tot' : ''}">${j === C ? 'Total' : esc(T.cols[j][1])}</th>`).join('')}</tr>`;
    const body = T.rows.map((r, i) => `<tr><td><span class="sw" style="background:${T.rowColors[i]}"></span>${esc(r[1])}</td>${cols.map(j => {
      const p = T.pct(i, j); let moe = '';
      if (S.moe && p != null) { const ne = S.base === 'col' ? T.neff[j] : T.neff[C]; if (ne > 0) moe = `<span class="moe">±${fmt(196 * Math.sqrt((p / 100) * (1 - p / 100) / ne) , 1)}</span>`; }
      return `<td class="${j === C ? 'tot' : ''}" title="n sin ponderar = ${T.u[i][j]}">${fmt(p)}${moe}</td>`;
    }).join('')}</tr>`).join('');
    const foot = `<tr><td>n (sin ponderar)</td>${cols.map(j => `<td class="${j === C ? 'tot' : ''}">${T.cu[j]}</td>`).join('')}</tr>` +
      `<tr><td>n efectiva (Kish)</td>${cols.map(j => `<td class="${j === C ? 'tot' : ''}">${fmt(T.neff[j], 0)}</td>`).join('')}</tr>`;
    return `<table id="xt"><thead>${head}</thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table>`;
  }

  /* ---------- render principal ---------- */
  function chartType(T) {
    if (S.chart !== 'auto') return S.chart;
    if (!T.cv) return 'bars';
    if (T.rv.t === 'scale' || T.rv.t === 'num') return 'means';
    return T.C > 6 || T.R > 8 ? 'heat' : 'stacked';
  }
  function render() {
    syncControls();
    const T = xtab(); const out = $('#out'); const width = Math.max(320, Math.min(1000, $('#chart').clientWidth || 800));
    const ct = chartType(T);
    let svg = '', legend = '', extra = '';
    if (ct === 'means' && (T.rv.t === 'scale' || T.rv.t === 'num')) {
      const r = meanChart(T, width); svg = r.svg;
      extra = `<p class="note">Media excluyendo NS/NC y códigos fuera de rango. Barras de error: intervalo de confianza al 95% con n efectiva.</p>`;
    } else if (ct === 'stacked') svg = stacked(T, width);
    else if (ct === 'heat') svg = heat(T, width);
    else if (ct === 'lines' && T.cv) svg = lines(T, width);
    else svg = hbars(T, width);
    if ((ct === 'stacked' || ct === 'lines') ) legend = T.rows.map((r, i) => `<span><i style="background:${T.rowColors[i]}"></i>${esc(r[1])}</span>`).join('');
    if (ct === 'bars' && T.cv) legend = T.cols.map((c, j) => `<span><i style="background:${T.colColors[j]}"></i>${esc(c[1])}</span>`).join('');
    const filt = S.fvar && S.fcats ? ` · Filtro: <b>${esc(S.fvar)}</b> = ${[...S.fcats].map(k => esc(catsOf(byName[S.fvar])[k][1])).join(', ')}` : '';
    $('#qhead').innerHTML = `<span class="eyebrow">${esc(T.rv.n)}${T.cv ? ' × ' + esc(T.cv.n) : ''} · ${S.w === 'rec' ? 'Ponderado por recuerdo de voto' : S.w === 'ceo' ? 'Ponderación CEO' : 'Sin ponderar'}${filt}</span>
      <span class="q">${esc(T.rv.l)}</span>${T.cv ? `<span class="muted">según: ${esc(T.cv.l)}</span>` : ''}`;
    $('#chart').innerHTML = svg;
    $('#legend').innerHTML = legend;
    $('#extra').innerHTML = extra;
    $('#table').innerHTML = table(T);
    $('#basenote').textContent = S.base === 'col' ? 'Porcentajes por columna (cada columna suma 100).' : S.base === 'row' ? 'Porcentajes por fila (cada fila suma 100).' : 'Porcentajes sobre el total de la tabla.';
    highlightList();
  }


  /* ---------- BAI: blanco/nulo, abstención e indecisión agrupados ---------- */
  const BAI = { on: true };
  const TRX = { OTROS: ['Otros partidos', '#6f6874'], BLANC: ['Blanco y nulo', '#b8ada1'], ABST: ['Abstención', '#9aa2aa'], NSNC: ['Indecisos / NS-NC', '#1f3a55'], NOP: ['No podía votar', '#c7ccd1'], BAI: ['BAI', '#4d5866'] };
  const XKEYS = () => BAI.on ? ['BAI'] : ['BLANC', 'ABST', 'NSNC'];
  function npKey(lab, ns) {
    if (/blanc|^Nul|\bnul\b/i.test(lab)) return 'BLANC';
    if (/No votaria|No votar|Abstenci|No va votar|No aniria/i.test(lab)) return 'ABST';
    if (ns || /No ho sap|No contesta|Ns\s*\/?\s*Nc|NS\/NC|Encara no|Indecis/i.test(lab)) return 'NSNC';
    if (/podr[ií]a votar|pod[ií]a votar|No podia/i.test(lab)) return 'NOP';
    return 'OTROS';
  }
  const baiMerge = k => BAI.on && (k === 'BLANC' || k === 'ABST' || k === 'NSNC') ? 'BAI' : k;
  const _ka = {};
  function keyArr(mode) { // por entrevistado: código de partido o categoría no partidista (BAI unida o separada)
    const ck = mode + (BAI.on ? '1' : '0'); if (_ka[ck]) return _ka[ck];
    const out = new Array(N);
    if (mode === 'rec') {
      const rv = byName.REC_AGRUPADO, ra = codes(rv), raw = keyOf('rec_cens'), wa = raw ? codes(raw) : null;
      const rmap = rv.c.map(c => rowcode(c[1]) || (/Abstenci/.test(c[1]) ? 'ABST' : /NS\/NC/.test(c[1]) ? 'NSNC' : /pod[ií]a votar/.test(c[1]) ? 'NOP' : 'MIX'));
      for (let i = 0; i < N; i++) { let k = ra[i] === 255 ? 'NSNC' : rmap[ra[i]]; if (k === 'MIX') k = wa && wa[i] !== 255 && npKey(raw.c[wa[i]][1], 0) === 'BLANC' ? 'BLANC' : 'OTROS'; out[i] = baiMerge(k); }
    } else {
      const iv = keyOf('int_parlament'), ia = codes(iv), imap = iv.c.map(c => rowcode(c[1]) || npKey(c[1], c[2]));
      for (let i = 0; i < N; i++) out[i] = baiMerge(ia[i] === 255 ? 'NSNC' : imap[ia[i]]);
    }
    return (_ka[ck] = out);
  }
  const keyName = k => PN[k] ? (I.ref === '2015' && k === 'JXCAT' ? 'JxSí' : PN[k][0]) : TRX[k][0];
  const keyColor = k => PN[k] ? PN[k][1] : TRX[k][1];
  const BAINOTE = 'BAI = blanco y nulo + abstención + indecisos (NS/NC).';

  /* ---------- Informe detallado (gráficos a medida) ---------- */
  const RP = { nonvote: true, prop: false, ideoNs: false, shape: 'area', dsmooth: false, lab: 'col' };
  const NONPARTY = /(Ns\s*\/?\s*Nc|No votaria|No votar|No ho sap|No contesta|No podria|Nul|blanc|^Altres|^Cap|Abstenci)/i;
  // interpolación cúbica monótona (Fritsch–Carlson): curva suave sin rebasar los valores vecinos
  function monotone(xs, ys) {
    const n = xs.length, d = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    if (n === 1) return () => ys[0];
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return x => {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    };
  }
  const shortName = L => L.key === 'BAI' ? 'BAI' : (PN[rowcode(L.c[1])] ? keyName(rowcode(L.c[1])) : L.c[1].replace(/\s*\(.*\)$/, '').slice(0, 18));
  function repIdeoVote() {
    const box = $('#rep-ideo'); if (!box) return;
    const iv = keyOf('ideologia'), pv = keyOf('int_parlament');
    if (!iv || !pv) { box.innerHTML = '<p class="note">Esta encuesta no incluye autoubicación ideológica o intención de voto al Parlament.</p>'; return; }
    const area = RP.shape === 'area', lines = RP.shape === 'lines';
    const W = weights(), ia = codes(iv), pa = codes(pv);
    const isNum = c => typeof c[0] === 'number' && c[0] >= 0 && c[0] <= 10 && !c[2];
    const ik = iv.c.map((c, k) => k).filter(k => isNum(iv.c[k]) || (RP.shape === 'cols' && RP.ideoNs && iv.c[k][2]));
    const LC = [], pix = {}; // capas del gráfico: partidos, otros y BAI (unida o separada)
    pv.c.forEach((c, k) => {
      const party = rowcode(c[1]), np = party ? null : npKey(c[1], c[2]), nonp = !!(c[2] || NONPARTY.test(c[1]) || (np && np !== 'OTROS'));
      if (!RP.nonvote && nonp) return;
      const key = np ? baiMerge(np) : null;
      if (key === 'BAI') { let j = LC.findIndex(x => x.key === 'BAI'); if (j < 0) { j = LC.length; LC.push({ key: 'BAI', c: [-1, 'BAI (blanco, abstención, indecisos)', 0], np: true }); } pix[k] = j; }
      else { pix[k] = LC.length; LC.push({ key: 'c' + k, c, np: nonp }); }
    });
    const pk = LC.map((x, j) => j);
    const iix = {}; ik.forEach((k, j) => iix[k] = j);
    const J = ik.length;
    let M = pk.map(() => new Float64Array(J)), tot = new Float64Array(J);
    const un = new Float64Array(J), sx = new Float64Array(pk.length), sw = new Float64Array(pk.length);
    for (let i = 0; i < N; i++) {
      const a = ia[i], b = pa[i]; if (!(a in iix) || !(b in pix)) continue;
      const w = W ? W[i] : 1, j = iix[a], p = pix[b];
      M[p][j] += w; tot[j] += w; un[j]++;
      if (isNum(iv.c[a])) { sx[p] += w * iv.c[a][0]; sw[p] += w; }
    }
    const G = tot.reduce((a, b) => a + b, 0), rawTot = tot.slice();
    if (RP.dsmooth) { // promedio 1-2-1 con las posiciones vecinas, ponderado por su tamaño
      const num = ik.map(k => isNum(iv.c[k]));
      const sm = A => A.map((v, j) => !num[j] ? v : (j > 0 && num[j - 1] ? A[j - 1] : 0) + 2 * v + (j < J - 1 && num[j + 1] ? A[j + 1] : 0));
      M = M.map(r => Float64Array.from(sm(Array.from(r)))); tot = Float64Array.from(sm(Array.from(tot)));
    }
    const share = (p, j) => tot[j] ? M[p][j] / tot[j] : 0;
    const rowT = M.map(r => r.reduce((a, b) => a + b, 0));
    const byP = RP.lab === 'party';
    const pshare = (p, j) => rowT[p] ? M[p][j] / rowT[p] : 0; // peso de la posición j dentro del total del partido p
    const shown = (p, j) => byP ? pshare(p, j) : share(p, j);
    const order = pk.map((k, p) => p).sort((x, y) => {
      const nx = LC[x].np, ny = LC[y].np;
      if (nx !== ny) return nx ? 1 : -1;
      if (nx) return x - y;
      return (sx[x] / (sw[x] || 1)) - (sx[y] / (sw[y] || 1));
    });
    const cols = colorsFor(LC.map(x => x.c), pv).map((col, p) => LC[p].key === 'BAI' ? TRX.BAI[1] : col);
    const width = Math.max(340, Math.min(1100, box.clientWidth || 800));
    const lm = 38, rm = lines ? 132 : 8, tm = lines ? 20 : 8, ph = 440, bm = 46, pw = width - lm - rm;
    const xw = ik.map((k, j) => RP.prop ? pw * rawTot[j] / G : pw / J);
    const x0 = []; { let x = lm; xw.forEach(w => { x0.push(x); x += w; }); }
    const xc = x0.map((x, j) => x + xw[j] / 2);
    let svg = '';
    let ymax = 1;
    if (lines) { // eje Y ajustado al valor máximo de las líneas
      let mx = 0; order.forEach(p => ik.forEach((k, j) => { mx = Math.max(mx, shown(p, j)); }));
      const st = mx > .5 ? 10 : 5; ymax = Math.min(1, Math.max(.1, Math.ceil(mx * 100 / st) * st / 100));
      for (let g = 0; g <= ymax * 100 + 1e-9; g += st) { const y = tm + ph * (1 - g / 100 / ymax); svg += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${y}" y2="${y}"/><text class="lbl" x="${lm - 6}" y="${y + 4}" text-anchor="end">${g}%</text>`; }
    } else for (let g = 0; g <= 100; g += 20) { const y = tm + ph * (1 - g / 100); svg += `<text class="lbl" x="${lm - 6}" y="${y + 4}" text-anchor="end">${g}%</text>`; }
    const light = c => { const m = /^#([0-9a-f]{6})$/i.exec(c); if (!m) return false; const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) > 165; };
    const lbl = (x, y, v, fs, c) => light(c) ? `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fs}" style="fill:#16202b;pointer-events:none">${fmt(100 * v, 0)}</text>`
      : `<text x="${x}" y="${y}" text-anchor="middle" font-size="${fs}" style="fill:#fff;paint-order:stroke;stroke:rgba(0,0,0,.35);stroke-width:2px;pointer-events:none">${fmt(100 * v, 0)}</text>`;
    if (lines) {
      // una línea por partido que pasa por el centro de cada posición
      const Yv = v => tm + ph * (1 - v / ymax);
      const ends = [], placed = [];
      order.forEach(p => {
        if (!rowT[p]) return;
        const ys = ik.map((k, j) => shown(p, j));
        let d = '';
        if (RP.lsmooth !== false && J > 2) {
          const f = monotone(xc, ys), STEPS = Math.max(80, Math.round((xc[J - 1] - xc[0]) / 3));
          for (let s2 = 0; s2 <= STEPS; s2++) { const x = xc[0] + (xc[J - 1] - xc[0]) * s2 / STEPS; d += (s2 ? 'L' : 'M') + x.toFixed(2) + ',' + Yv(Math.max(0, f(x))).toFixed(2); }
        } else d = ys.map((v, j) => (j ? 'L' : 'M') + xc[j].toFixed(2) + ',' + Yv(v).toFixed(2)).join('');
        svg += `<g class="ln"><path d="${d}" fill="none" stroke="${cols[p]}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"${LC[p].np ? ' stroke-dasharray="6 4"' : ''}/>`;
        ys.forEach((v, j) => { svg += `<circle cx="${xc[j].toFixed(2)}" cy="${Yv(v).toFixed(2)}" r="3.6" fill="${cols[p]}" stroke="var(--panel)" stroke-width="1.2"><title>${esc(LC[p].c[1])} · posición ${esc(iv.c[ik[j]][0])}: ${fmt(100 * share(p, j))}% de la posición · ${fmt(100 * pshare(p, j))}% del partido</title></circle>`; });
        // valor en el pico de cada línea
        let jm = 0; ys.forEach((v, j) => { if (v > ys[jm]) jm = j; });
        const ly = Yv(ys[jm]) - 8, clash = placed.some(q => Math.abs(q.x - xc[jm]) < 22 && Math.abs(q.y - ly) < 12);
        if (!clash) placed.push({ x: xc[jm], y: ly });
        svg += clash ? '</g>' : `<text x="${xc[jm]}" y="${ly.toFixed(2)}" text-anchor="middle" font-size="10.5" font-weight="600" style="fill:${cols[p]};paint-order:stroke;stroke:var(--panel);stroke-width:3px">${fmt(100 * ys[jm], 0)}</text></g>`;
        ends.push({ p, y: Yv(ys[J - 1]), y0: Yv(ys[J - 1]) });
      });
      // nombres al final de cada línea, sin solaparse
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
      if (ends.length && ends[ends.length - 1].y > tm + ph + 4) { ends[ends.length - 1].y = tm + ph + 4; for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - 13); }
      ends.forEach(e => { if (Math.abs(e.y - e.y0) > 3) svg += `<path d="M${xc[J - 1] + 5},${e.y0.toFixed(2)}L${xc[J - 1] + 15},${e.y.toFixed(2)}" stroke="${cols[e.p]}" fill="none" stroke-width="1"/>`;
        svg += `<text x="${xc[J - 1] + 18}" y="${(e.y + 4).toFixed(2)}" font-size="11" font-weight="600" style="fill:${cols[e.p]}">${esc(shortName(LC[e.p]))}</text>`; });
      ik.forEach((k, j) => { svg += `<line x1="${xc[j]}" x2="${xc[j]}" y1="${tm + ph}" y2="${tm + ph + 4}" stroke="var(--muted)"/>`; });
    } else if (area) {
      // curvas suaves que pasan por el centro de cada posición; los extremos se prolongan en horizontal
      const xs = [lm, ...xc, lm + pw];
      const fns = order.map(p => { const ys = ik.map((k, j) => share(p, j)); return monotone(xs, [ys[0], ...ys, ys[J - 1]]); });
      const STEPS = Math.max(120, Math.round(pw / 3)), X = [], V = [];
      for (let s = 0; s <= STEPS; s++) {
        const x = lm + pw * s / STEPS; X.push(x);
        const v = fns.map(f => Math.max(0, f(x))), t = v.reduce((a, b) => a + b, 0) || 1; V.push(v.map(a => a / t));
      }
      const cum = X.map(() => 0);
      order.forEach((p, o) => {
        const lo = cum.slice(); X.forEach((x, s) => cum[s] += V[s][o]);
        const Y = v => (tm + ph * (1 - v)).toFixed(2);
        const top = X.map((x, s) => `${x.toFixed(2)},${Y(cum[s])}`), bot = X.map((x, s) => `${x.toFixed(2)},${Y(lo[s])}`).reverse();
        svg += `<path d="M${top.join('L')}L${bot.join('L')}Z" fill="${cols[p]}" stroke="${cols[p]}" stroke-width=".6"><title>${esc(LC[p].c[1])}</title></path>`;
      });
      // etiquetas en el centro de cada posición
      ik.forEach((k, j) => {
        let acc = 0;
        order.forEach(p => {
          const v = share(p, j), y1 = tm + ph * (1 - acc - v); acc += v;
          if (ph * v >= 15 && xw[j] >= 24) svg += lbl(xc[j], y1 + ph * v / 2 + 4, shown(p, j), xw[j] > 50 ? 11 : 9.5, cols[p]);
        });
        svg += `<line x1="${xc[j]}" x2="${xc[j]}" y1="${tm + ph}" y2="${tm + ph + 4}" stroke="var(--muted)"/>`;
      });
    } else {
      ik.forEach((k, j) => {
        let y = tm + ph; const cw = xw[j], x = x0[j];
        order.forEach(p => {
          const v = share(p, j), h = ph * v; if (h <= 0) return;
          y -= h;
          svg += `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cw + .4).toFixed(2)}" height="${(h + .4).toFixed(2)}" fill="${cols[p]}"><title>${esc(iv.c[k][1])} · ${esc(LC[p].c[1])}: ${fmt(100 * v)}% de la posición · ${fmt(100 * pshare(p, j))}% del partido</title></rect>`;
          if (h >= 14 && cw >= 24) svg += lbl(x + cw / 2, y + h / 2 + 4, shown(p, j), cw > 50 ? 11 : 9.5, cols[p]);
        });
      });
    }
    ik.forEach((k, j) => {
      const lab = iv.c[k][2] ? 'NS/NC' : String(iv.c[k][0]);
      if (xw[j] >= 14) {
        svg += `<text x="${xc[j]}" y="${tm + ph + 17}" text-anchor="middle" font-size="12" font-weight="600">${esc(lab)}</text>`;
        if (xw[j] >= 30) svg += `<text class="lbl" x="${xc[j]}" y="${tm + ph + 31}" text-anchor="middle" font-size="10">n=${un[j]}</text>`;
      }
    });
    svg += `<text class="lbl" x="${lm}" y="${tm + ph + 45}">← Extrema esquerra</text><text class="lbl" x="${lm + pw}" y="${tm + ph + 45}" text-anchor="end">Extrema dreta →</text>`;
    const legend = order.map(p => `<span><i style="background:${cols[p]}"></i>${esc(LC[p].c[1])}</span>`).join('');
    const thead = `<tr><th>Partido</th>${ik.map(k => `<th>${esc(iv.c[k][2] ? 'NS/NC' : iv.c[k][0])}</th>`).join('')}${byP ? '<th class="tot">Total</th>' : ''}</tr>`;
    const tbody = [...order].reverse().map(p => `<tr><td><span class="sw" style="background:${cols[p]}"></span>${esc(LC[p].c[1])}</td>${ik.map((k, j) => `<td>${fmt(100 * shown(p, j))}</td>`).join('')}${byP ? `<td class="tot">${rowT[p] ? '100,0' : '–'}</td>` : ''}</tr>`).join('');
    const tfoot = `<tr><td>n (sin ponderar)</td>${ik.map((k, j) => `<td>${un[j]}</td>`).join('')}</tr><tr><td>% de la muestra</td>${ik.map((k, j) => `<td>${fmt(100 * rawTot[j] / G)}</td>`).join('')}</tr>`;
    const notes = [lines ? 'Las líneas unen los valores de cada posición con una interpolación suave que no inventa picos; la cifra marca el valor máximo de cada partido.' : area ? 'Las curvas unen los valores de cada posición con una interpolación suave que no inventa picos: entre dos posiciones la franja nunca supera el mayor de sus dos valores.' : '',
      RP.dsmooth ? 'Datos suavizados: cada posición se promedia con sus vecinas (pesos 1-2-1, según el tamaño de cada grupo). Reduce el ruido de los extremos, pero mezcla posiciones contiguas.' : ''].filter(Boolean).join(' ');
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">${esc(iv.n)} × ${esc(pv.n)} · ${S.w === 'rec' ? 'Ponderado por recuerdo de voto' : S.w === 'ceo' ? 'Ponderación CEO' : 'Sin ponderar'}</span>
      <span class="q">Composición del voto en cada punto de la escala ideológica</span>
      <span class="muted">${lines ? (byP ? 'Cada línea es un partido y sus puntos suman 100%: muestra cómo se reparte su electorado a lo largo de la escala ideológica.' : 'Cada línea es un partido: indica qué porcentaje de quienes se ubican en cada posición votaría a ese partido al Parlament.') : byP ? 'La forma sigue mostrando la composición de cada posición, pero las cifras indican qué parte del electorado de cada partido se ubica en esa posición: los números de un mismo color suman 100%.' : 'Cada posición de la escala 0-10 suma 100%: muestra qué parte de quienes se ubican ahí votaría a cada partido al Parlament.'}${BAI.on && RP.nonvote ? ' ' + BAINOTE : ''}</span></div>
      <div class="chart">${svgWrap(width, tm + ph + bm + 4, svg)}</div><div class="legend">${legend}</div>
      ${notes ? `<p class="note">${notes}</p>` : ''}
      <details><summary>Ver tabla</summary><div class="tablewrap"><table>${'<thead>' + thead + '</thead><tbody>' + tbody + '</tbody><tfoot>' + tfoot + '</tfoot>'}</table></div></details>`;
  }
  /* ---------- Polarización afectiva entre electorados ---------- */
  const PN = { CUP: ['CUP', '#d4b400'], CEC: ['Comuns', '#8b2f8f'], ERC: ['ERC', '#f2a400'], PSC: ['PSC', '#e3051b'], JXCAT: ['Junts', '#00b8ab'],
    CS: ['Cs', '#f07d18'], PP: ['PP', '#1d7fd6'], ALIANCA: ['Aliança', '#3f6e9e'], VOX: ['Vox', '#58b02c'] };
  const PORDER = Object.keys(PN);
  const ROWRE = [['PSC', /PSC|PSOE/i], ['ERC', /^ERC/i], ['CEC', /Comuns|Comú|ECP|Sumar|Podem|CatComú|s[ií] que es pot|CSQEP/i], ['JXCAT', /Junts per Cat|JxCat|^Junts|JxS[ií]/i],
    ['CUP', /^CUP/i], ['PP', /^PPC?$|^PP\b/i], ['VOX', /^Vox/i], ['ALIANCA', /Aliança/i], ['CS', /^C's|^Cs\b|Ciutadans/i]];
  const rowcode = l => { for (const [c, re] of ROWRE) if (re.test(l)) return c; return null; };
  const AF = { grp: 'int', thr: 4.5, mode: 'mutua', pairs: null };
  function affTargets() {
    const T = {};
    V.forEach(v => { const m = /^SIMPATIA_VOTANTS_([A-Za-z]+)_0_10$/.exec(v.n); if (m) T[m[1].toUpperCase()] = v; });
    return T;
  }
  function affData() {
    const T = affTargets(); if (!Object.keys(T).length) return null;
    const gv = AF.grp === 'rec' ? byName.REC_AGRUPADO : keyOf('int_parlament'); const ga = codes(gv), W = weights();
    const grp = keyArr(AF.grp === 'rec' ? 'rec' : 'int'), ord = partyOrderByIdeo();
    const tg = ord.filter(c => T[c]), rows = ord.filter(c => grp.includes(c)), xrows = XKEYS().filter(k => grp.includes(k)), all = rows.concat(xrows);
    const M = {}, n = {};
    all.forEach(r => { M[r] = {}; n[r] = grp.filter(g => g === r).length; });
    tg.forEach(t => {
      const v = T[t], a = codes(v), s = {}, sw = {};
      for (let i = 0; i < N; i++) {
        const r = grp[i]; if (!r || a[i] === 255) continue; const c = v.c[a[i]]; if (c[2] || typeof c[0] !== 'number' || c[0] > 10) continue;
        const w = W ? W[i] : 1; s[r] = (s[r] || 0) + w * c[0]; sw[r] = (sw[r] || 0) + w;
      }
      all.forEach(r => { M[r][t] = sw[r] ? s[r] / sw[r] : null; });
    });
    // posición de cada electorado: ideología media e independentismo
    const iv = keyOf('ideologia'), dv = keyOf('independencia'), pos = {};
    all.forEach(r => pos[r] = { ix: 0, iw: 0, ds: 0, dw: 0 });
    if (iv) { const a = codes(iv); for (let i = 0; i < N; i++) { const r = grp[i]; if (!pos[r] || a[i] === 255) continue; const c = iv.c[a[i]]; if (c[2] || c[0] > 10) continue; const w = W ? W[i] : 1; pos[r].ix += w * c[0]; pos[r].iw += w; } }
    if (dv) { const a = codes(dv), si = dv.c.findIndex(c => /^S[ií]/.test(c[1])); for (let i = 0; i < N; i++) { const r = grp[i]; if (!pos[r] || a[i] === 255 || dv.c[a[i]][2]) continue; const w = W ? W[i] : 1; pos[r].dw += w; if (a[i] === si) pos[r].ds += w; } }
    rows.forEach(r => { pos[r].ideo = pos[r].iw ? pos[r].ix / pos[r].iw : 5; pos[r].indep = pos[r].dw ? 100 * pos[r].ds / pos[r].dw : 50; });
    const mutual = (a, b) => (M[a] && M[b] && M[a][b] != null && M[b][a] != null) ? (M[a][b] + M[b][a]) / 2 : null;
    return { T, tg, rows, xrows, M, n, pos, mutual, gv };
  }
  const affColor = v => { const t = Math.max(-1, Math.min(1, (v - 5) / 5)); return { fill: t < 0 ? 'var(--aff-neg)' : 'var(--aff-pos)', op: .1 + .85 * Math.abs(t) }; };
  const noAff = () => {
    const list = (window.CEO_AFECT || []).map(s => `<a href="informe_${s.id}.html">BOP ${s.id}</a>`).join(', ');
    return `<p class="note">Esta encuesta no pregunta la simpatía hacia los votantes de cada partido. Está disponible en: ${list}.</p>`;
  };
  const grpLabel = () => AF.grp === 'rec' ? 'según su recuerdo de voto' : 'según su intención de voto al Parlament';
  const wLabel = () => S.w === 'rec' ? 'Ponderado por recuerdo de voto' : S.w === 'ceo' ? 'Ponderación CEO' : 'Sin ponderar';

  function repAffHeat() {
    const box = $('#rep-aff'); if (!box) return; const A = affData(); if (!A) { box.innerHTML = noAff(); return; }
    const width = Math.max(340, Math.min(900, box.clientWidth || 800)), lw = 120, hh = 64, cw = Math.max(46, Math.min(78, (width - lw - 60) / A.tg.length)), rh = 34;
    let svg = '';
    A.tg.forEach((t, j) => { svg += `<text x="${lw + j * cw + cw / 2}" y="${hh - 26}" text-anchor="middle" font-size="12" font-weight="600" style="fill:${PN[t][1]}">${esc(PN[t][0])}</text>`; });
    svg += `<text x="${lw + A.tg.length * cw / 2}" y="14" text-anchor="middle" class="lbl">Simpatía hacia los votantes de… (0 = mucha antipatía, 10 = mucha simpatía)</text>`;
    svg += `<text x="${lw + A.tg.length * cw + 34}" y="${hh - 26}" text-anchor="middle" class="lbl">n</text>`;
    const SEP = 14, allR = A.rows.concat(A.xrows), yOf = i => hh - 16 + i * rh + (i >= A.rows.length ? SEP : 0);
    if (A.xrows.length) { const ys = hh - 16 + A.rows.length * rh + SEP / 2; svg += `<line x1="8" x2="${lw + A.tg.length * cw}" y1="${ys}" y2="${ys}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 3"/>`; }
    allR.forEach((r, i) => {
      const y = yOf(i);
      svg += `<text x="${lw - 10}" y="${y + rh / 2 + 4}" text-anchor="end" font-size="12.5" font-weight="600" style="fill:${PN[r] ? PN[r][1] : 'var(--muted)'};${PN[r] ? '' : 'font-style:italic'}">${esc(keyName(r))}</text>`;
      A.tg.forEach((t, j) => {
        const v = A.M[r][t]; const x = lw + j * cw;
        if (v == null) return;
        const c = affColor(v), own = r === t;
        svg += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${rh - 3}" rx="4" fill="${c.fill}" fill-opacity="${c.op.toFixed(2)}"><title>${esc(keyName(r))} → votantes de ${PN[t][0]}: ${fmt(v, 2)}</title></rect>`;
        if (own) svg += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${rh - 3}" rx="4" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
        svg += `<text x="${x + cw / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="12.5" style="fill:${c.op > .6 ? '#fff' : 'var(--ink)'};font-variant-numeric:tabular-nums">${fmt(v, 1)}</text>`;
      });
      svg += `<text x="${lw + A.tg.length * cw + 34}" y="${y + rh / 2 + 4}" text-anchor="middle" class="lbl" style="${A.n[r] < 60 ? 'font-style:italic' : ''}">${A.n[r]}</text>`;
    });
    // escala
    const ly = hh - 16 + allR.length * rh + (A.xrows.length ? SEP : 0) + 18;
    for (let k = 0; k <= 10; k++) { const c = affColor(k); svg += `<rect x="${lw + k * 26}" y="${ly}" width="26" height="10" fill="${c.fill}" fill-opacity="${c.op.toFixed(2)}"/><text class="lbl" x="${lw + k * 26 + 13}" y="${ly + 22}" text-anchor="middle" font-size="10">${k}</text>`; }
    svg += `<text class="lbl" x="${lw - 10}" y="${ly + 9}" text-anchor="end" font-size="10">Antipatía</text><text class="lbl" x="${lw + 11 * 26 + 6}" y="${ly + 9}" font-size="10">Simpatía</text>`;
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">SIMPATIA_VOTANTS_*_0_10 × ${esc(A.gv.n)} · ${wLabel()}</span>
      <span class="q">¿Cuánta simpatía sienten los votantes de cada partido (filas) hacia los votantes de los demás (columnas)?</span>
      <span class="muted">Media 0-10. Filas: votantes ${grpLabel()}. La casilla con borde es la simpatía hacia el propio electorado. Bajo la línea discontinua, ${BAI.on ? 'el BAI (blanco y nulo, abstención e indecisos): no votan a ningún partido, es una situación especial' : 'quienes votan en blanco o nulo, se abstienen o están indecisos: no votan a ningún partido'}.</span></div>
      <div class="chart">${svgWrap(Math.max(width, lw + A.tg.length * cw + 60), ly + 30, svg)}</div>
      <p class="note">La matriz no es simétrica: «PSC → ERC» puede diferir de «ERC → PSC». Filas con n en cursiva tienen menos de 60 entrevistas.</p>`;
  }


  const NETY = [['indep', '% a favor de la independencia', 'independencia', c => /^S[ií]/.test(c[1])],
    ['catal', '% que se siente solo o más catalán', 'sentimiento', c => /(Nom[eé]s|M[eé]s) catal/i.test(c[1])],
    ['espan', '% que se siente solo o más español', 'sentimiento', c => /(Nom[eé]s|M[eé]s) espanyol/i.test(c[1])],
    ['tant', '% que se siente tan catalán como español', 'sentimiento', c => /^Tan/i.test(c[1])],
    ['estat', '% que quiere un estado independiente', 'relacion_cat_esp', c => /independent/i.test(c[1])],
    ['autono', '% que prefiere comunidad autónoma o región', 'relacion_cat_esp', c => /(comunitat|regi)/i.test(c[1])],
    ['llcat', '% con el catalán como lengua propia', 'lengua_propia', c => /^Catal/i.test(c[1])],
    ['llcas', '% con el castellano como lengua propia', 'lengua_propia', c => /^Castell/i.test(c[1])],
    ['dona', '% de mujeres', 'sexo', c => /Dona|Mujer|Femen/i.test(c[1])],
    ['gran', '% de 65 años o más', 'edad5', c => /65/.test(c[1])]];
  function netShare(rows, grp) {
    const o = NETY.find(x => x[0] === LS.netY) || NETY[0], v = keyOf(o[2]); if (!v) return null;
    const a = codes(v), W = weights(), hit = v.c.map(o[3]), s = {}, sw = {};
    for (let i = 0; i < N; i++) { const r = grp[i]; if (!r || a[i] === 255 || v.c[a[i]][2]) continue; const w = W ? W[i] : 1; sw[r] = (sw[r] || 0) + w; if (hit[a[i]]) s[r] = (s[r] || 0) + w; }
    const out = {}; rows.forEach(r => out[r] = sw[r] ? 100 * (s[r] || 0) / sw[r] : 50); return { out, label: o[1] };
  }
  function repAffNet() {
    const box = $('#rep-net'); if (!box) return; const A = affData(); if (!A) { box.innerHTML = noAff(); return; }
    const grpA = groupArr(AF.grp), NS = netShare(A.rows, grpA); if (NS) A.rows.forEach(r => A.pos[r].indep = NS.out[r]);
    const ylab = NS ? NS.label : '% a favor de la independencia';
    const width = Math.max(340, Math.min(1000, box.clientWidth || 800)), h = 470, lm = 50, rm = 30, tm = 24, bm = 46, pw = width - lm - rm, ph = h - tm - bm;
    const yv = A.rows.map(r => A.pos[r].indep), ymn = Math.min(...yv), ymx = Math.max(...yv);
    let ylo = Math.max(0, Math.floor((ymn - 6) / 10) * 10), yhi = Math.min(100, Math.ceil((ymx + 6) / 10) * 10); if (yhi - ylo < 20) { ylo = Math.max(0, ylo - 10); yhi = Math.min(100, yhi + 10); }
    const ystep = yhi - ylo > 50 ? 25 : yhi - ylo > 30 ? 10 : 5;
    const X = v => lm + pw * v / 10, Y = v => tm + ph * (1 - (v - ylo) / (yhi - ylo));
    let svg = '';
    for (let g = 0; g <= 10; g += 2) svg += `<line class="ax" x1="${X(g)}" x2="${X(g)}" y1="${tm}" y2="${tm + ph}"/><text class="lbl" x="${X(g)}" y="${tm + ph + 16}" text-anchor="middle">${g}</text>`;
    for (let g = Math.ceil(ylo / ystep) * ystep; g <= yhi; g += ystep) svg += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${Y(g)}" y2="${Y(g)}"/><text class="lbl" x="${lm - 6}" y="${Y(g) + 4}" text-anchor="end">${g}%</text>`;
    svg += `<text class="lbl" x="${lm + pw / 2}" y="${h - 8}" text-anchor="middle">Ideología media de sus votantes (0 izquierda – 10 derecha)</text>`;
    svg += `<text class="lbl" transform="translate(12,${tm + ph / 2}) rotate(-90)" text-anchor="middle">${esc(ylab)} (entre sus votantes)</text>`;
    const pairs = []; A.rows.forEach((a, i) => A.rows.forEach((b, j) => { if (j > i) { const m = A.mutual(a, b); if (m != null) pairs.push([a, b, m]); } }));
    pairs.sort((p, q) => p[2] - q[2]);
    const P = r => [X(A.pos[r].ideo), Y(A.pos[r].indep)];
    pairs.forEach(([a, b, m]) => {
      if (m < AF.thr) return;
      const [x1, y1] = P(a), [x2, y2] = P(b), c = affColor(m), wdt = Math.max(1, (m - 2.5) * 2.4);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, cx = mx - dy / len * 18, cy = my + dx / len * 18;
      svg += `<path d="M${x1},${y1} Q${cx},${cy} ${x2},${y2}" fill="none" stroke="${c.fill}" stroke-opacity="${(.4 + .55 * Math.min(1, Math.abs(m - 5) / 3)).toFixed(2)}" stroke-width="${wdt.toFixed(1)}" stroke-linecap="round"><title>${PN[a][0]} ↔ ${PN[b][0]}: ${fmt(m, 2)} (${PN[a][0]}→${PN[b][0]} ${fmt(A.M[a][b], 1)} · ${PN[b][0]}→${PN[a][0]} ${fmt(A.M[b][a], 1)})</title></path>`;
      svg += `<text x="${(mx + cx) / 2}" y="${(my + cy) / 2 + 4}" text-anchor="middle" font-size="10.5" style="fill:var(--ink);paint-order:stroke;stroke:var(--panel);stroke-width:3px">${fmt(m, 1)}</text>`;
    });
    const maxn = Math.max(...A.rows.map(r => A.n[r]));
    A.rows.forEach(r => {
      const [x, y] = P(r), rad = 9 + 17 * Math.sqrt(A.n[r] / maxn), own = A.M[r][r];
      svg += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${PN[r][1]}" stroke="var(--panel)" stroke-width="2"><title>${PN[r][0]}: n=${A.n[r]} · ideología ${fmt(A.pos[r].ideo, 1)} · independencia ${fmt(A.pos[r].indep, 0)}% · simpatía propia ${fmt(own, 1)}</title></circle>`;
      svg += `<text x="${x}" y="${y - rad - 5}" text-anchor="middle" font-size="12.5" font-weight="600" style="fill:var(--ink);paint-order:stroke;stroke:var(--panel);stroke-width:3px">${esc(PN[r][0])}</text>`;
    });
    const list = [...pairs].reverse().map(([a, b, m]) => { const c = affColor(m); return `<tr><td><span class="sw" style="background:${PN[a][1]}"></span>${PN[a][0]} ↔ <span class="sw" style="background:${PN[b][1]}"></span>${PN[b][0]}</td><td><b>${fmt(m, 1)}</b></td><td>${fmt(A.M[a][b], 1)}</td><td>${fmt(A.M[b][a], 1)}</td><td style="text-align:left"><span style="display:inline-block;height:8px;width:${(m * 8).toFixed(0)}px;background:${c.fill};opacity:${(c.op + .1).toFixed(2)};border-radius:2px"></span></td></tr>`; }).join('');
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Mapa de bloques · ${wLabel()}</span>
      <span class="q">Compatibilidad entre electorados: simpatía mutua y posición en los dos ejes</span>
      <span class="muted">Cada círculo es un electorado (${grpLabel()}), situado por la ideología media de sus votantes (horizontal) y el indicador elegido (vertical); su tamaño es el número de entrevistas. Las líneas unen electorados cuya simpatía mutua (media de los dos sentidos) es ≥ ${fmt(AF.thr, 1)}: más gruesa y más azul, más compatibles.</span></div>
      <div class="row"><label>Eje vertical <select id="netY">${NETY.filter(o => keyOf(o[2])).map(o => `<option value="${o[0]}" ${o[0] === LS.netY ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label></div>
      <div class="chart">${svgWrap(width, h, svg)}</div>
      <details><summary>Ranking de parejas por simpatía mutua</summary><div class="tablewrap"><table><thead><tr><th>Pareja</th><th>Mutua</th><th>A → B</th><th>B → A</th><th></th></tr></thead><tbody>${list}</tbody></table></div></details>`;
    const ny = $('#netY'); if (ny) ny.onchange = e => { LS.netY = e.target.value; repAffNet(); };
  }

  function repAffEvo() {
    const box = $('#rep-evo'); if (!box) return; const E = window.CEO_AFECT || []; if (!E.length) { box.innerHTML = ''; return; }
    const key = `${AF.grp}_${S.w === 'rec' ? 'rec' : 'none'}`;
    const all = []; PORDER.forEach((a, i) => PORDER.forEach((b, j) => { if (j > i && E.some(s => s.mat[key][a] && s.mat[key][b] && s.mat[key][a].m[b] != null)) all.push(a + '-' + b); }));
    if (!AF.pairs) AF.pairs = new Set(['ERC-PSC', 'CEC-PSC', 'CEC-ERC', 'ERC-JXCAT', 'PSC-JXCAT', 'PP-VOX'].map(p => { const [a, b] = p.split('-'); return PORDER.indexOf(a) < PORDER.indexOf(b) ? a + '-' + b : b + '-' + a; }).filter(p => all.includes(p)));
    const PAL2 = ['#23408e', '#c4573a', '#2f8f83', '#b0882a', '#7a4ea3', '#3d7fb8', '#9a3f5f', '#5d8a3a', '#c07a3f', '#4f5d75'];
    const sel = all.filter(p => AF.pairs.has(p));
    const width = Math.max(340, Math.min(1000, box.clientWidth || 800)), h = 360, lm = 40, rm = 150, tm = 14, bm = 50, pw = width - lm - rm, ph = h - tm - bm;
    const vals = []; sel.forEach(p => { const [a, b] = p.split('-'); E.forEach(s => { const A = s.mat[key][a], B = s.mat[key][b]; if (A && A.m[b] != null) vals.push(A.m[b]); if (B && B.m[a] != null) vals.push(B.m[a]); }); });
    const y0 = vals.length ? Math.max(0, Math.floor(Math.min(...vals, 5) - .5)) : 0, y1 = vals.length ? Math.min(10, Math.ceil(Math.max(...vals, 5) + .5)) : 10;
    const X = k => lm + (E.length === 1 ? pw / 2 : pw * k / (E.length - 1)), Y = v => tm + ph * (1 - (v - y0) / (y1 - y0));
    let svg = '';
    for (let g = y0; g <= y1; g += 1) svg += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${Y(g)}" y2="${Y(g)}"/><text class="lbl" x="${lm - 6}" y="${Y(g) + 4}" text-anchor="end">${g}</text>`;
    svg += `<line x1="${lm}" x2="${lm + pw}" y1="${Y(5)}" y2="${Y(5)}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
    E.forEach((s, k) => {
      const cur = s.id === I.id;
      svg += `<text x="${X(k)}" y="${tm + ph + 16}" text-anchor="middle" font-size="11.5" ${cur ? 'font-weight="700"' : ''}>BOP ${s.id}</text><text class="lbl" x="${X(k)}" y="${tm + ph + 30}" text-anchor="middle" font-size="10">${MESC[s.mes]} ${s.anyo}</text>`;
      if (cur) svg += `<rect x="${X(k) - 14}" y="${tm}" width="28" height="${ph}" fill="var(--accent)" fill-opacity=".08"/>`;
    });
    const ends = [];
    sel.forEach((p, idx) => {
      const [a, b] = p.split('-'), col = PAL2[idx % PAL2.length];
      const series = AF.mode === 'mutua' ? [[s => { const A = s.mat[key][a], B = s.mat[key][b]; return A && B && A.m[b] != null && B.m[a] != null ? (A.m[b] + B.m[a]) / 2 : null; }, `${PN[a][0]} ↔ ${PN[b][0]}`, '']]
        : [[s => s.mat[key][a] ? s.mat[key][a].m[b] : null, `${PN[a][0]} → ${PN[b][0]}`, ''], [s => s.mat[key][b] ? s.mat[key][b].m[a] : null, `${PN[b][0]} → ${PN[a][0]}`, '5 4']];
      series.forEach(([f, lab, dash]) => {
        const pts = E.map((s, k) => { const v = f(s); return v == null ? null : [X(k), Y(v), v]; });
        const segs = pts.filter(Boolean);
        if (!segs.length) return;
        svg += `<polyline fill="none" stroke="${col}" stroke-width="2.4" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${segs.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}"/>`;
        segs.forEach(q => svg += `<circle cx="${q[0]}" cy="${q[1]}" r="3.6" fill="${col}"><title>${esc(lab)}: ${fmt(q[2], 2)}</title></circle>`);
        const last = segs[segs.length - 1]; ends.push([last[1], `${lab} ${fmt(last[2], 1)}`, col]);
      });
    });
    ends.sort((p, q) => p[0] - q[0]); let lastY = -99;
    ends.forEach(e => { const y = Math.max(e[0] + 4, lastY + 13); lastY = y; svg += `<text x="${lm + pw + 8}" y="${y}" font-size="11" style="fill:${e[2]}">${esc(e[1])}</text>`; });
    const chips = all.map(p => { const [a, b] = p.split('-'); return `<label><input type="checkbox" data-p="${p}" ${AF.pairs.has(p) ? 'checked' : ''}>${PN[a][0]}–${PN[b][0]}</label>`; }).join('');
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Serie 2022-2025 · ${wLabel()}</span>
      <span class="q">Evolución de la simpatía entre electorados</span>
      <span class="muted">${AF.mode === 'mutua' ? 'Simpatía mutua (media de los dos sentidos).' : 'Línea continua: A → B; discontinua: B → A.'} Votantes ${grpLabel()}. Las cinco encuestas usan la misma pregunta (simpatía hacia «la gent que vota…»). La franja marca esta encuesta.</span></div>
      <div class="fcats" id="evoPairs" style="max-height:none">${chips}</div>
      <div class="chart">${svgWrap(width, h, svg)}</div>`;
    $('#evoPairs').onchange = e => { const p = e.target.dataset.p; if (e.target.checked) AF.pairs.add(p); else AF.pairs.delete(p); repAffEvo(); };
  }
  const MESC = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function initAffect() {
    const c = $('#rep-aff-ctl'); if (!c) return;
    c.innerHTML = `<div class="seg" id="baiSeg" role="group" aria-label="Blanco, abstención e indecisos"><button data-b="1">BAI unido</button><button data-b="0">Blanco, abstención e indecisos por separado</button></div>
      <label>Agrupar votantes por <select id="afGrp"><option value="int">Intención de voto</option><option value="rec">Recuerdo de voto</option></select></label>
      <label>Umbral de enlace en el mapa <input type="range" id="afThr" min="0" max="7" step="0.5" value="${AF.thr}" style="vertical-align:middle"> <b id="afThrV">${fmt(AF.thr, 1)}</b></label>`;
    $('#afGrp').onchange = e => { AF.grp = e.target.value; renderAffect(); repLeadHeat(); };
    const syncB = () => document.querySelectorAll('#baiSeg button').forEach(b => b.setAttribute('aria-pressed', (b.dataset.b === '1') === BAI.on)); syncB();
    $('#baiSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; BAI.on = b.dataset.b === '1'; syncB(); renderReport(); };
    $('#afThr').oninput = e => { AF.thr = +e.target.value; $('#afThrV').textContent = fmt(AF.thr, 1); repAffNet(); };
    const am = $('#afMode'); if (am) am.onchange = e => { AF.mode = e.target.value; repAffEvo(); };
  }
  function renderAffect() { repAffHeat(); repAffNet(); repAffEvo(); }

  /* ---------- Líderes: valoración, ambivalencia y solidez del voto ---------- */
  const LDICT = [['ALBIOL', 'PP'], ['RAJOY', 'PP'], ['FERN', 'PP'], ['FEIJO', 'PP'], ['ROLDAN', null], ['PUIGDEMONT', 'JXCAT'], ['TORRA', 'JXCAT'], ['BORRAS', 'JXCAT'],
    ['NOGUERAS', 'JXCAT'], ['SANCHEZ', null], ['JUNQUERAS', 'ERC'], ['ARAGONES', 'ERC'], ['ROVIRA', 'ERC'], ['RUFIAN', 'ERC'], ['ICETA', 'PSC'], ['BATET', 'PSC'],
    ['ILLA', 'PSC'], ['HEREU', 'PSC'], ['RABELL', 'CEC'], ['DOMENECH', 'CEC'], ['ALBIACH', 'CEC'], ['ASENS', 'CEC'], ['MENA', 'CEC'], ['URTASUN', 'CEC'], ['DIAZ', 'CEC'],
    ['ALAMANY', 'CEC'], ['ARRIMADAS', 'CS'], ['MEJIAS', 'CS'], ['CARRIZOSA', 'CS'], ['CANAS', 'CS'], ['GABRIEL', 'CUP'], ['SALELLAS', 'CUP'], ['RIERA', 'CUP'],
    ['SABATER', 'CUP'], ['REGUANT', 'CUP'], ['ESTRADA', 'CUP'], ['PELLICER', 'CUP'], ['CASTILLEJO', 'CUP'], ['GARRIGA', 'VOX'], ['ABASCAL', 'VOX'], ['ORRIOLS', 'ALIANCA']];
  const deacc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let _leaders = null;
  function leaders() {
    if (_leaders) return _leaders;
    const out = [];
    V.forEach(v => {
      if (v.t !== 'scale' || !/^(val_|VAL_|P\d+B_)/.test(v.n) || /GOV|PAPA|ACTUACIO|_UE_/.test(v.n)) return;
      const nm = deacc(v.n);
      const hit = LDICT.find(([k]) => nm.includes(k)); if (!hit) return;
      let party = hit[1];
      const full = v.l.split(/l[ií]ders:|Valoraci[oó]:?/i).pop().trim().replace(/\s+/g, ' ');
      if (hit[0] === 'SANCHEZ') party = /Pedro/i.test(full) ? 'PSC' : 'JXCAT';
      if (hit[0] === 'ROLDAN') party = I.anyo >= 2021 ? 'PP' : 'CS';
      if (!party || out.some(o => o.v === v)) return;
      out.push({ v, party, name: full || hit[0], short: (full.split(' ').slice(-1)[0] || hit[0]) });
    });
    const gi = groupArr('int'); const has = p => gi.includes(p);
    out.forEach(o => { if (!has(o.party) && o.party === 'ERC' && has('JXCAT')) { o.party = 'JXCAT'; o.note = 'JxSí'; } });
    out.sort((a, b) => PORDER.indexOf(a.party) - PORDER.indexOf(b.party));
    return (_leaders = out);
  }
  function ratingArr(v) {
    if (v._r) return v._r; const a = codes(v), r = new Float64Array(N);
    for (let i = 0; i < N; i++) { const k = a[i]; if (k === 255) { r[i] = NaN; continue; } const c = v.c[k]; r[i] = (c[2] || typeof c[0] !== 'number' || c[0] > 10 || c[0] < 0) ? NaN : c[0]; }
    return (v._r = r);
  }
  function groupArr(mode) {
    const gv = mode === 'rec' ? byName.REC_AGRUPADO : keyOf('int_parlament'); const ga = codes(gv), map = gv.c.map(c => rowcode(c[1]));
    const g = new Array(N); for (let i = 0; i < N; i++) g[i] = ga[i] === 255 ? null : map[ga[i]]; return g;
  }
  const leadName = L => `${L.short} (${PN[L.party][0]})`;
  const LS = { low: 5, a: null, b: null, gmode: 'rec', onlyAB: false, sol: null, cmp: null, yvar: 'ideologia', netY: 'indep' };

  /* 5 · matriz de valoración de líderes */
  function repLeadHeat() {
    const box = $('#rep-lead'); if (!box) return; const Ls = leaders();
    if (!Ls.length) { box.innerHTML = '<p class="note">Esta encuesta no incluye valoración de líderes.</p>'; return; }
    const g = keyArr(AF.grp === 'rec' ? 'rec' : 'int'), W = weights(), ord = partyOrderByIdeo(), prow = ord.filter(c => g.includes(c)), xr = XKEYS().filter(k => g.includes(k)), rows = prow.concat(xr);
    const M = {}, n = {};
    rows.forEach(r => { M[r] = Ls.map(() => [0, 0]); n[r] = 0; });
    for (let i = 0; i < N; i++) { const r = g[i]; if (!r || !M[r]) continue; n[r]++; Ls.forEach((L, j) => { const x = ratingArr(L.v)[i]; if (!isNaN(x)) { const w = W ? W[i] : 1; M[r][j][0] += w * x; M[r][j][1] += w; } }); }
    const width = Math.max(340, box.clientWidth || 800), lw = 110, hh = 96, cw = Math.max(46, Math.min(70, (width - lw - 50) / Ls.length)), rh = 32;
    let svg = '';
    Ls.forEach((L, j) => { const x = lw + j * cw + cw / 2; svg += `<text transform="translate(${x + 4},${hh - 10}) rotate(-40)" font-size="11.5" font-weight="600" style="fill:${PN[L.party][1]}">${esc(L.short)}</text>`; });
    svg += `<text x="${lw + Ls.length * cw + 26}" y="${hh - 10}" text-anchor="middle" class="lbl">n</text>`;
    const SEP = 14; if (xr.length) { const ys = hh + prow.length * rh + SEP / 2; svg += `<line x1="8" x2="${lw + Ls.length * cw}" y1="${ys}" y2="${ys}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 3"/>`; }
    rows.forEach((r, i) => {
      const y = hh + i * rh + (i >= prow.length ? SEP : 0);
      svg += `<text x="${lw - 10}" y="${y + rh / 2 + 4}" text-anchor="end" font-size="12.5" font-weight="600" style="fill:${PN[r] ? PN[r][1] : 'var(--muted)'};${PN[r] ? '' : 'font-style:italic'}">${esc(keyName(r))}</text>`;
      Ls.forEach((L, j) => {
        const [s, sw] = M[r][j]; if (!sw) return; const v = s / sw, c = affColor(v), x = lw + j * cw;
        svg += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${rh - 3}" rx="4" fill="${c.fill}" fill-opacity="${c.op.toFixed(2)}"><title>${esc(keyName(r))} → ${esc(L.name)}: ${fmt(v, 2)}</title></rect>`;
        if (L.party === r) svg += `<rect x="${x + 1.5}" y="${y + 1.5}" width="${cw - 3}" height="${rh - 3}" rx="4" fill="none" stroke="var(--ink)" stroke-width="1.6"/>`;
        svg += `<text x="${x + cw / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="12" style="fill:${c.op > .6 ? '#fff' : 'var(--ink)'}">${fmt(v, 1)}</text>`;
      });
      svg += `<text x="${lw + Ls.length * cw + 26}" y="${y + rh / 2 + 4}" text-anchor="middle" class="lbl">${n[r]}</text>`;
    });
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Valoración de líderes 0-10 × electorados · ${wLabel()}</span>
      <span class="q">¿Cómo valora cada electorado (filas) a cada líder (columnas)?</span>
      <span class="muted">Media 0-10 entre quienes conocen y valoran al líder. Votantes ${grpLabel()}. Con borde: el líder del propio partido. Bajo la línea discontinua, ${BAI.on ? 'el BAI (blanco y nulo, abstención e indecisos)' : 'blanco y nulo, abstención e indecisos'}.</span></div>
      <div class="chart">${svgWrap(Math.max(width, lw + Ls.length * cw + 50), hh + rows.length * rh + (xr.length ? 14 : 0) + 8, svg)}</div>`;
  }

  /* 6 · ambivalencia entre dos líderes */
  function repAmbi() {
    const box = $('#rep-ambi'), ctl = $('#rep-ambi-ctl'); if (!box) return; const Ls = leaders();
    if (Ls.length < 2) { box.innerHTML = '<p class="note">Esta encuesta no tiene valoraciones de líderes suficientes.</p>'; ctl.innerHTML = ''; return; }
    if (LS.a == null) { const ia = Ls.findIndex(L => L.party === 'PSC'); LS.a = ia >= 0 ? ia : 0; const ib = Ls.findIndex(L => L.party === 'ERC'); LS.b = ib >= 0 && ib !== LS.a ? ib : (LS.a === 0 ? 1 : 0); }
    const opt = sel => Ls.map((L, j) => `<option value="${j}" ${j === sel ? 'selected' : ''}>${esc(L.name)} (${PN[L.party][0]})</option>`).join('');
    ctl.innerHTML = `<label>Líder <select id="amA">${opt(LS.a)}</select></label><label>frente a <select id="amB">${opt(LS.b)}</select></label>
      <div class="seg" id="amG"><button data-g="rec">Recuerdo de voto</button><button data-g="int">Intención de voto</button><button data-g="fid">Fieles y resto</button></div>
      <label><input type="checkbox" id="amOnly" ${LS.onlyAB ? 'checked' : ''}> Solo los electorados de los dos partidos</label>
      <label>Separar a quien valora a ambos por debajo de <input type="number" id="amLow" min="0" max="10" step="1" value="${LS.low}" style="width:4em"></label>`;
    document.querySelectorAll('#amG button').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === LS.gmode));
    $('#amA').onchange = e => { LS.a = +e.target.value; repAmbi(); }; $('#amB').onchange = e => { LS.b = +e.target.value; repAmbi(); };
    $('#amG').onclick = e => { const b = e.target.closest('button'); if (!b) return; LS.gmode = b.dataset.g; repAmbi(); };
    $('#amOnly').onchange = e => { LS.onlyAB = e.target.checked; repAmbi(); };
    $('#amLow').onchange = e => { const v = +e.target.value; if (!isNaN(v)) { LS.low = v; repAmbi(); } };
    const A = Ls[LS.a], B = Ls[LS.b], ra = ratingArr(A.v), rb = ratingArr(B.v), W = weights();
    // grupos
    let groups = [];
    if (LS.gmode === 'fid') {
      const gi = groupArr('int'), gr = groupArr('rec');
      PORDER.forEach(p => {
        groups.push({ key: p, lab: 'Fieles', sub: PN[p][0], party: p, f: i => gi[i] === p && gr[i] === p });
        groups.push({ key: p, lab: 'Se van', sub: PN[p][0], party: p, f: i => gr[i] === p && gi[i] !== p, tip: `votaron ${PN[p][0]} y ahora no tienen intención de repetir` });
        groups.push({ key: p, lab: 'Llegan', sub: PN[p][0], party: p, f: i => gi[i] === p && gr[i] !== p, tip: `ahora votarían ${PN[p][0]} sin haberlo votado` });
      });
    } else { const g = keyArr(LS.gmode); partyOrderByIdeo().forEach(p => groups.push({ key: p, lab: PN[p][0], sub: '', party: p, f: i => g[i] === p })); XKEYS().forEach(k => groups.push({ key: k, lab: TRX[k][0], sub: '', party: k, x: true, f: i => g[i] === k })); }
    if (LS.onlyAB) groups = groups.filter(G => G.party === A.party || G.party === B.party);
    if (LS.gmode === 'fid') groups.sort((a, b) => partyOrderByIdeo().indexOf(a.key) - partyOrderByIdeo().indexOf(b.key));
    groups.forEach(G => {
      G.s = [0, 0, 0, 0]; G.n = 0; G.nm = 0;
      for (let i = 0; i < N; i++) { if (!G.f(i)) continue; G.n++; if (isNaN(ra[i]) || isNaN(rb[i])) { G.nm++; continue; } const w = W ? W[i] : 1;
        G.s[(ra[i] < LS.low && rb[i] < LS.low) ? 3 : ra[i] > rb[i] ? 0 : ra[i] === rb[i] ? 1 : 2] += w; }
      G.t = G.s[0] + G.s[1] + G.s[2] + G.s[3]; G.t3 = G.s[0] + G.s[1] + G.s[2];
      G.hl = G.party === A.party || G.party === B.party;
    });
    groups = groups.filter(G => G.n - G.nm >= 15);
    const nBlk = LS.gmode === 'fid' ? new Set(groups.map(G => G.key)).size : 0, width = Math.max(340, box.clientWidth || 900), lm = 34, tm = 10, ph = 300, cw = Math.max(30, Math.min(70, (width - lm - 10 - 14 * Math.max(0, nBlk - 1)) / Math.max(1, groups.length) - 8)), gap = LS.gmode === 'fid' ? 4 : 8;
    const cols = [PN[A.party][1], '#a9b0b7', PN[B.party][1] === PN[A.party][1] ? '#58606a' : PN[B.party][1], '#e4e7ea'];
    const anyHl = groups.some(G => G.hl) && groups.some(G => !G.hl);
    let svg = '', x = lm, prevKey = null;
    for (let g = 0; g <= 100; g += 25) svg += `<line class="ax" x1="${lm}" x2="${width - 6}" y1="${tm + ph * (1 - g / 100)}" y2="${tm + ph * (1 - g / 100)}"/><text class="lbl" x="${lm - 5}" y="${tm + ph * (1 - g / 100) + 4}" text-anchor="end">${g}</text>`;
    const blocks = [];
    groups.forEach(G => {
      if (LS.gmode === 'fid' && prevKey !== null && prevKey !== G.key) { x += 14; }
      if (G.x && !groups[groups.indexOf(G) - 1]?.x) { x += 10; svg += `<line x1="${x - 9}" x2="${x - 9}" y1="${tm}" y2="${tm + ph + 30}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 3"/>`; }
      if (LS.gmode === 'fid' && prevKey !== G.key) blocks.push({ key: G.key, x0: x });
      prevKey = G.key;
      let y = tm + ph;
      const dim = anyHl && !G.hl;
      svg += `<g opacity="${dim ? .32 : 1}">`;
      const order = [2, 1, 0, 3]; // de abajo arriba: mayor valoración rival, igual, mayor valoración líder y, aparte, quienes valoran mal a ambos
      order.forEach(k => {
        const v = G.t ? G.s[k] / G.t : 0, h = ph * v; if (h <= 0) return; y -= h;
        svg += `<rect x="${x}" y="${y}" width="${cw}" height="${h}" fill="${cols[k]}" stroke="var(--panel)" stroke-width="1"><title>${esc(G.sub ? G.sub + ' · ' + G.lab : G.lab)}: ${['Valora más a ' + A.short, 'Igual valoración', 'Valora más a ' + B.short, `Valora a los dos por debajo de ${LS.low}`][k]} ${fmt(100 * v)}%</title></rect>`;
        if (h > 15) svg += `<text x="${x + cw / 2}" y="${y + h / 2 + 4}" text-anchor="middle" font-size="11" style="fill:${k % 2 ? '#16202b' : '#fff'};${k % 2 ? '' : 'paint-order:stroke;stroke:rgba(0,0,0,.3);stroke-width:2px'}">${fmt(100 * v, 0)}%</text>`;
      });
      if (G.hl && anyHl) svg += `<rect x="${x - 1.5}" y="${tm - 1.5}" width="${cw + 3}" height="${ph + 3}" fill="none" stroke="var(--ink)" stroke-width="1.8" rx="2"/>`;
      svg += `</g>`;
      svg += `<text x="${x + cw / 2}" y="${tm + ph + 15}" text-anchor="middle" font-size="11.5" font-weight="${G.hl && anyHl ? 800 : 600}" style="fill:${LS.gmode === 'fid' ? 'var(--ink)' : keyColor(G.party)};opacity:${anyHl && !G.hl ? .5 : 1}">${esc(G.lab)}</text>`;
      svg += `<text class="lbl" x="${x + cw / 2}" y="${tm + ph + 28}" text-anchor="middle" font-size="9.5">n=${G.n - G.nm}</text>`;
      if (LS.gmode === 'fid') blocks[blocks.length - 1].x1 = x + cw;
      x += cw + gap;
    });
    blocks.forEach(b => { svg += `<text x="${(b.x0 + b.x1) / 2}" y="${tm + ph + 46}" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:${PN[b.key][1]}">${esc(PN[b.key][0])}</text><line x1="${b.x0}" x2="${b.x1}" y1="${tm + ph + 34}" y2="${tm + ph + 34}" stroke="${PN[b.key][1]}" stroke-width="2"/>`; });
    const legend = [[cols[0], `Valora más a ${A.short}`], [cols[1], 'Igual valoración'], [cols[2], `Valora más a ${B.short}`], [cols[3], `Valora a los dos por debajo de ${LS.low} (0-${LS.low - 1}; no es ambivalencia)`]].map(([c, l]) => `<span><i style="background:${c}"></i>${esc(l)}</span>`).join('');
    // resumen de riesgo: % ambivalentes (igual o rival mejor) entre electorado propio de A
    const own = groups.find(G => G.party === A.party && (LS.gmode !== 'fid' || G.lab === 'Fieles'));
    const oth = groups.find(G => G.party === B.party && G.party !== A.party && (LS.gmode !== 'fid' || G.lab === 'Fieles'));
    const risk = own && own.t3 ? 100 * (own.s[1] + own.s[2]) / own.t3 : null, riskB = oth && oth.t3 ? 100 * (oth.s[1] + oth.s[0]) / oth.t3 : null;
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Ambivalencia ${esc(A.short)} vs ${esc(B.short)} · ${wLabel()}</span>
      <span class="q">Comparativa de valoración a ${esc(A.name)} frente a ${esc(B.name)}</span>
      <span class="muted">Para cada grupo de votantes: qué parte valora más a ${esc(A.short)}, igual, o más a ${esc(B.short)} (solo quienes valoran a los dos). Igualar o preferir al rival indica ambivalencia: riesgo de fuga.${risk != null ? ` Entre los votantes ${LS.gmode === 'fid' ? 'fieles ' : ''}de ${PN[A.party][0]}, <b>${fmt(risk, 0)}%</b> son ambivalentes respecto a ${esc(B.short)}.` : ''}${riskB != null ? ` Entre los de ${PN[B.party][0]}, <b>${fmt(riskB, 0)}%</b> valoran igual o mejor a ${esc(A.short)}.` : ''} Quienes valoran a los dos por debajo de ${LS.low} se muestran aparte y no cuentan como ambivalentes.</span></div>
      <div class="chart">${svgWrap(Math.max(width, x + 10), tm + ph + (LS.gmode === 'fid' ? 54 : 36), svg)}</div><div class="legend">${legend}</div>
      ${LS.gmode === 'fid' ? '<p class="note">Fieles: recuerdo e intención coinciden. Se van: votaron al partido y ahora no lo votarían (otro partido, abstención o NS/NC). Llegan: lo votarían ahora sin haberlo votado.</p>' : ''}`;
  }

  /* modelo de solidez del voto (El arte de ganar, cap. 8) */
  const SOLCAT = ['Duros', 'Blandos', 'Posibles', 'Difíciles', 'Imposibles'];
  const SOLDEF = { duroR: 7, duroC: 50, tie: true, posC: 55, posR: 6, impR: 2, impC: 35, unkP: .6, base: 'vot', lean: true };
  const SOLT = Object.assign({}, SOLDEF);
  let _sup = null;
  function supportInfo() { // apoyo = intención directa; si no la declara (NS/NC), simpatía de partido
    if (_sup) return _sup;
    const iv = keyOf('int_parlament'), ia = codes(iv), sv = keyOf('simpatia'), sa = sv ? codes(sv) : null;
    const imap = iv.c.map(c => rowcode(c[1])), und = iv.c.map(c => !!c[2] || /No ho sap|No contesta|Encara no|Indecis/i.test(c[1])), abst = iv.c.map(c => /No votaria|No votar|Abstenci|No anir/i.test(c[1]));
    const smap = sv ? sv.c.map(c => rowcode(c[1])) : null;
    const direct = new Array(N), lean = new Array(N), ab = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const k = ia[i]; direct[i] = k === 255 ? null : imap[k]; ab[i] = k !== 255 && abst[k] ? 1 : 0; lean[i] = direct[i]; if ((k === 255 || und[k]) && sa && sa[i] !== 255) lean[i] = smap[sa[i]]; }
    return (_sup = { direct, lean, ab });
  }
  function profileAttrs() {
    if (profileAttrs._c) return profileAttrs._c;
    const out = [], add = (v, lab, f) => { if (!v) return; const a = codes(v), x = new Float64Array(N); const map = v.c.map(f); for (let i = 0; i < N; i++) x[i] = a[i] === 255 ? NaN : map[a[i]]; out.push({ v, lab, x }); };
    const num10 = c => (c[2] || typeof c[0] !== 'number' || c[0] > 10) ? NaN : c[0] / 10;
    add(keyOf('ideologia'), 'Ideología (0-10)', num10);
    add(keyOf('sentimiento'), 'Sentimiento de pertenencia', c => c[2] ? NaN : /Nom[eé]s espanyol/i.test(c[1]) ? 0 : /M[eé]s espanyol/i.test(c[1]) ? .25 : /Tan/i.test(c[1]) ? .5 : /M[eé]s catal/i.test(c[1]) ? .75 : /Nom[eé]s catal/i.test(c[1]) ? 1 : NaN);
    add(keyOf('independencia'), 'Independencia (sí)', c => c[2] ? NaN : /^S[ií]/.test(c[1]) ? 1 : /^No$/i.test(c[1]) ? 0 : NaN);
    add(keyOf('relacion_cat_esp'), 'Relación Cataluña-España', c => c[2] ? NaN : /regi/i.test(c[1]) ? 0 : /comunitat/i.test(c[1]) ? 1 / 3 : /federal/i.test(c[1]) ? 2 / 3 : /independent/i.test(c[1]) ? 1 : NaN);
    add(keyOf('lengua_propia'), 'Lengua propia', c => c[2] ? NaN : /^Catal/i.test(c[1]) ? 1 : /^Castell/i.test(c[1]) ? 0 : /(dues|ambdues|igual)/i.test(c[1]) ? .5 : NaN);
    [['CAT_0_10', 'Catalanismo (0-10)'], ['ESP_0_10', 'Españolismo (0-10)'], ['EU_0_10', 'Europeísmo (0-10)']].forEach(([n, l]) => add(byName[n], l, num10));
    return (profileAttrs._c = out);
  }
  function solidModel(L) {
    const Ls = leaders(), W = weights(), r = ratingArr(L.v), SI = supportInfo(), gi = SOLT.lean ? SI.lean : SI.direct, inBase = i => !(SOLT.base === 'vot' && SI.ab[i]);
    const others = Ls.filter(o => o.party !== L.party).map(o => ratingArr(o.v));
    const T = affTargets(), sv = T[L.party] ? ratingArr(T[L.party]) : null;
    const attrs = profileAttrs();
    // elector ideal: media de cada atributo ponderada por (valoración − 5)², solo quienes valoran al líder por encima de 5
    const ideal = attrs.map(A => { let s = 0, sw = 0; for (let i = 0; i < N; i++) { if (isNaN(A.x[i]) || isNaN(r[i]) || r[i] <= 5) continue; const u = (W ? W[i] : 1) * (r[i] - 5) ** 2; s += u * A.x[i]; sw += u; } return sw ? s / sw : NaN; });
    // peso de cada atributo: |correlación| con la valoración del líder
    const aw = attrs.map(A => { let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < N; i++) { if (isNaN(A.x[i]) || isNaN(r[i])) continue; const w = W ? W[i] : 1; n += w; sx += w * A.x[i]; sy += w * r[i]; sxx += w * A.x[i] ** 2; syy += w * r[i] ** 2; sxy += w * A.x[i] * r[i]; }
      if (!n) return 0; const cov = sxy / n - sx * sy / n / n, vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2; return vx > 0 && vy > 0 ? Math.abs(cov / Math.sqrt(vx * vy)) : 0; });
    const C = new Float64Array(N), cat = new Int8Array(N), prox = new Float64Array(N), rmo = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let d = 0, da = 0; attrs.forEach((A, k) => { if (isNaN(A.x[i]) || isNaN(ideal[k]) || !aw[k]) return; d += aw[k] * (A.x[i] - ideal[k]) ** 2; da += aw[k]; });
      prox[i] = da ? 1 - Math.sqrt(d / da) : .5;
      let mo = NaN; others.forEach(o => { if (!isNaN(o[i]) && (isNaN(mo) || o[i] > mo)) mo = o[i]; }); rmo[i] = mo;
      const ri = r[i], cr = isNaN(ri) ? .4 : ri / 10, crel = isNaN(ri) || isNaN(mo) ? .45 : Math.max(0, Math.min(1, (ri - mo + 5) / 10));
      let num = .45 * cr + .2 * crel + .2 * prox[i], den = .85;
      if (sv && !isNaN(sv[i])) { num += .15 * sv[i] / 10; den += .15; }
      C[i] = 100 * num / den;
      const voter = gi[i] === L.party;
      if (!inBase(i)) cat[i] = -1;
      else if (voter) cat[i] = (!isNaN(ri) && ri >= SOLT.duroR && (isNaN(mo) || (SOLT.tie ? ri >= mo : ri > mo)) && C[i] >= SOLT.duroC) ? 0 : 1;
      else if (isNaN(ri)) cat[i] = prox[i] >= SOLT.unkP ? 2 : 3; // no lo conoce o no lo valora: posible si su perfil se parece al del elector ideal
      else if (ri <= SOLT.impR || (ri < SOLT.posR - 1 && C[i] < SOLT.impC)) cat[i] = 4;
      else if (ri >= SOLT.posR || (ri >= SOLT.posR - 1 && C[i] >= SOLT.posC)) cat[i] = 2;
      else cat[i] = 3;
    }
    const sh = [0, 0, 0, 0, 0]; let tot = 0; for (let i = 0; i < N; i++) { if (cat[i] < 0) continue; const w = W ? W[i] : 1; sh[cat[i]] += w; tot += w; }
    const share = sh.map(s => 100 * s / tot), sup = share[0] + share[1];
    return { L, C, cat, prox, r, rmo, ideal, aw, attrs, share, durOfSup: sup ? 100 * share[0] / sup : 0, gi, hasSym: !!sv };
  }
  function initSol() { const Ls = leaders(); if (LS.sol == null && Ls.length) { const k = Ls.findIndex(L => L.party === 'PSC'); LS.sol = k >= 0 ? k : 0; } if (LS.cmp == null && Ls.length > 1) { const k = Ls.findIndex((L, j) => j !== LS.sol && L.party === 'ERC'); LS.cmp = k >= 0 ? k : (LS.sol === 0 ? 1 : 0); } }
  const SOLCOL = (L, k) => [PN[L.party][1], PN[L.party][1], PN[L.party][1], '#9aa2aa', '#cfd4d9'][k];
  const SOLOP = [1, .62, .3, .8, .8];
  function yOptions() {
    const o = [['ideologia', 'Autoubicación ideológica'], ['sentimiento', 'Sentimiento de pertenencia'], ['independencia', 'Independencia'], ['relacion_cat_esp', 'Relación Cataluña-España'], ['lengua_propia', 'Lengua propia'], ['edad', 'Edad'], ['_C', 'Índice de cercanía al líder'], ['_r', 'Valoración del líder']];
    return o.filter(([k]) => k[0] === '_' || keyOf(k));
  }
  function solScatter(M, yvar, ncat, box) {
    const L = M.L, W = weights();
    // orden horizontal: categoría y, dentro, de más a menos cercano
    const idx = [...Array(N).keys()].filter(i => M.cat[i] >= 0 && M.cat[i] < ncat).sort((a, b) => M.cat[a] - M.cat[b] || M.C[b] - M.C[a]);
    const tot = idx.reduce((s, i) => s + (W ? W[i] : 1), 0); const xpos = new Float64Array(N); let acc = 0;
    idx.forEach(i => { const w = W ? W[i] : 1; xpos[i] = (acc + w / 2) / tot; acc += w; });
    // eje vertical
    let yval, ylabels = null, yr = [0, 10], ytitle = '';
    const jit = i => (((i * 2654435761) >>> 0) % 1000) / 1000 - .5;
    if (yvar === '_C') { yval = i => M.C[i]; yr = [0, 100]; ytitle = 'Índice de cercanía (0-100)'; }
    else if (yvar === '_r') { yval = i => isNaN(M.r[i]) ? null : M.r[i] + jit(i) * .7; yr = [-.5, 10.5]; ytitle = `Valoración de ${L.short}`; }
    else {
      const v = keyOf(yvar); ytitle = ({ ideologia: 'Ideología (0 izquierda – 10 derecha)', sentimiento: 'Sentimiento de pertenencia', independencia: 'Independencia', relacion_cat_esp: 'Relación Cataluña-España', lengua_propia: 'Lengua propia', edad: 'Edad' })[yvar] || v.l;
      if (v.t === 'num') { const xs = v.v.filter(x => x != null && x < 900); yr = [Math.min(...xs) - 1, Math.max(...xs) + 1]; yval = i => (v.v[i] == null || v.v[i] >= 900) ? null : v.v[i] + jit(i) * .8; }
      else if (v.t === 'scale') { yr = [-.5, 10.5]; yval = i => { const k = codes(v)[i]; if (k === 255) return null; const c = v.c[k]; return c[2] || c[0] > 10 ? null : c[0] + jit(i) * .7; }; }
      else { const cs = v.c.map((c, k) => k).filter(k => !v.c[k][2]); const pos = {}; cs.forEach((k, j) => pos[k] = j); ylabels = cs.map(k => v.c[k][1]); yr = [-.5, cs.length - .5];
        yval = i => { const k = codes(v)[i]; return k === 255 || !(k in pos) ? null : pos[k] + jit(i) * .7; }; }
    }
    const width = Math.max(340, Math.min(1100, box.clientWidth || 900)), subT = M.share.slice(0, ncat).reduce((a, b) => a + b, 0), lm = ylabels ? 150 : 44, rm = 10, tm = 40, ph = 420, bm = 40, pw = width - lm - rm;
    const X = f => lm + pw * f, Y = v => tm + ph * (1 - (v - yr[0]) / (yr[1] - yr[0]));
    let svg = ''; let c0 = 0;
    SOLCAT.slice(0, ncat).forEach((nm, k) => {
      const w = M.share[k] / subT, x0 = X(c0), x1 = X(c0 + w);
      svg += `<rect x="${x0}" y="${tm}" width="${Math.max(0, x1 - x0)}" height="${ph}" fill="${SOLCOL(L, k)}" fill-opacity="${(k < 3 ? SOLOP[k] * .14 : .18).toFixed(2)}"/>`;
      if (k) svg += `<line x1="${x0}" x2="${x0}" y1="${tm - 30}" y2="${tm + ph}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
      if (x1 - x0 > 40) svg += `<text x="${(x0 + x1) / 2}" y="${tm - 20}" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:${k < 3 ? PN[L.party][1] : 'var(--muted)'}">${nm}</text><text x="${(x0 + x1) / 2}" y="${tm - 6}" text-anchor="middle" font-size="11" class="lbl">${fmt(M.share[k], 1)}%${ncat < 5 ? ' del total' : ''}</text>`;
      c0 += w;
    });
    if (ylabels) ylabels.forEach((l, j) => svg += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${Y(j)}" y2="${Y(j)}"/><text class="lbl" x="${lm - 6}" y="${Y(j) + 4}" text-anchor="end">${esc(trunc(l, 24))}</text>`);
    else { const st = (yr[1] - yr[0]) > 20 ? 20 : 2; for (let g = Math.ceil(yr[0] / st) * st; g <= yr[1]; g += st) svg += `<line class="ax" x1="${lm}" x2="${lm + pw}" y1="${Y(g)}" y2="${Y(g)}"/><text class="lbl" x="${lm - 6}" y="${Y(g) + 4}" text-anchor="end">${g}</text>`; }
    const pc = p => p ? PN[p][1] : '#9aa2aa';
    let pts = '';
    for (let i = 0; i < N; i++) { if (M.cat[i] < 0 || M.cat[i] >= ncat) continue; const yv = yval(i); if (yv == null) continue; const p = M.gi[i]; pts += `<circle cx="${X(xpos[i]).toFixed(1)}" cy="${Y(yv).toFixed(1)}" r="2.3" fill="${pc(p)}" fill-opacity="${p ? .7 : .35}"/>`; }
    svg += pts;
    // media por grupo
    c0 = 0; SOLCAT.slice(0, ncat).forEach((nm, k) => { let s = 0, sw = 0; for (let i = 0; i < N; i++) { if (M.cat[i] !== k) continue; const yv = yval(i); if (yv == null) continue; const w = W ? W[i] : 1; s += w * yv; sw += w; } const w = M.share[k] / subT; if (sw && w > .02 && !ylabels) { const y = Y(s / sw); svg += `<line x1="${X(c0) + 4}" x2="${X(c0 + w) - 4}" y1="${y}" y2="${y}" stroke="var(--ink)" stroke-width="2.4"/><text x="${X(c0 + w) - 6}" y="${y - 5}" text-anchor="end" font-size="10.5" font-weight="600" style="fill:var(--ink);paint-order:stroke;stroke:var(--panel);stroke-width:3px">${fmt(s / sw, 1)}</text>`; } c0 += w; });
    svg += `<text class="lbl" x="${lm}" y="${tm + ph + 16}">← Más cerca de ${esc(L.short)}</text><text class="lbl" x="${lm + pw}" y="${tm + ph + 16}" text-anchor="end">Más lejos →</text>`;
    svg += `<text class="lbl" x="${lm + pw / 2}" y="${tm + ph + 32}" text-anchor="middle">Electores ordenados por su cercanía al candidato (ancho de cada franja = ${ncat < 5 ? 'su peso dentro de duros + blandos + posibles' : '% del electorado'})</text>`;
    return { svg, ytitle, h: tm + ph + bm, width };
  }
  function repSolMap() {
    const box = $('#rep-sol'), ctl = $('#rep-sol-ctl'); if (!box) return; const Ls = leaders();
    if (!Ls.length) { box.innerHTML = '<p class="note">Esta encuesta no incluye valoración de líderes.</p>'; ctl.innerHTML = ''; return; }
    initSol(); const M = solidModel(Ls[LS.sol]), L = M.L, W = weights();
    ctl.innerHTML = `<label>Candidato <select id="solL">${Ls.map((x, j) => `<option value="${j}" ${j === LS.sol ? 'selected' : ''}>${esc(x.name)} (${PN[x.party][0]})</option>`).join('')}</select></label>
      <label>Eje vertical <select id="solY">${yOptions().map(([k, l]) => `<option value="${k}" ${k === LS.yvar ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Base <select id="solBase"><option value="vot" ${SOLT.base === 'vot' ? 'selected' : ''}>Votantes potenciales (sin quien dice que no votará)</option><option value="all" ${SOLT.base === 'all' ? 'selected' : ''}>Todo el electorado</option></select></label>
      <label><input type="checkbox" id="solLean" ${SOLT.lean ? 'checked' : ''}> Indecisos: contar su simpatía de partido como voto</label>
      <details class="thr"><summary>Umbrales</summary><div class="row">
      <label>Duro: valoración ≥ <input type="number" id="tDR" min="0" max="10" step="1" value="${SOLT.duroR}"></label><label>e índice ≥ <input type="number" id="tDC" min="0" max="100" step="5" value="${SOLT.duroC}"></label>
      <label><input type="checkbox" id="tTie" ${SOLT.tie ? 'checked' : ''}> Empate con un rival cuenta como duro</label>
      <label>Posible: valoración ≥ <input type="number" id="tPR" min="0" max="10" step="1" value="${SOLT.posR}"></label><label>(o 1 punto menos con índice ≥ <input type="number" id="tPC" min="0" max="100" step="5" value="${SOLT.posC}">)</label>
      <label>Imposible: valoración ≤ <input type="number" id="tIR" min="0" max="10" step="1" value="${SOLT.impR}"></label><label>(o valoración baja con índice &lt; <input type="number" id="tIC" min="0" max="100" step="5" value="${SOLT.impC}">)</label>
      <label>No lo conoce: posible si su perfil se parece ≥ <input type="number" id="tUP" min="0" max="1" step="0.05" value="${SOLT.unkP}"></label>
      <button id="tReset">Valores por defecto</button></div></details>`;
    const thrOpen = LS.thrOpen; if (thrOpen) ctl.querySelector('.thr').open = true; ctl.querySelector('.thr').ontoggle = e => { LS.thrOpen = e.target.open; };
    [['tDR', 'duroR'], ['tDC', 'duroC'], ['tPC', 'posC'], ['tPR', 'posR'], ['tIR', 'impR'], ['tIC', 'impC'], ['tUP', 'unkP']].forEach(([id, k]) => { $('#' + id).onchange = e => { const v = +e.target.value; if (!isNaN(v)) { SOLT[k] = v; renderSolid(); } }; });
    $('#tTie').onchange = e => { SOLT.tie = e.target.checked; renderSolid(); };
    $('#solBase').onchange = e => { SOLT.base = e.target.value; renderSolid(); };
    $('#solLean').onchange = e => { SOLT.lean = e.target.checked; renderSolid(); };
    $('#tReset').onclick = () => { Object.assign(SOLT, SOLDEF); renderSolid(); };
    $('#solL').onchange = e => { LS.sol = +e.target.value; renderSolid(); };
    $('#solY').onchange = e => { LS.yvar = e.target.value; repSolMap(); };
    const { svg, ytitle, h: svgH, width } = solScatter(M, LS.yvar, 5, box);
    const legend = PORDER.filter(p => M.gi.includes(p)).map(p => `<span><i style="background:${PN[p][1]}"></i>Vota ${PN[p][0]}</span>`).join('') + `<span><i style="background:#9aa2aa"></i>Otros, abstención, NS/NC</span><span><i style="background:var(--ink);height:3px"></i>Media del grupo</span>`;
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Solidez del voto · ${esc(L.name)} · ${wLabel()}</span>
      <span class="q">¿Dónde está cada elector respecto a ${esc(L.name)}?</span>
      <span class="muted">${esc(ytitle)} en vertical. Cada punto es una entrevista, coloreada por su intención de voto al Parlament.</span></div>
      <div class="chart">${svgWrap(width, svgH, svg)}</div><div class="legend">${legend}</div>`;
    return M;
  }
  function ringSvg(M, size, big) {
    const R = size / 2 - 4, cx = size / 2, cy = size / 2; let cum = 0, svg = '';
    const rad = []; M.share.forEach(s => { cum += s / 100; rad.push(R * Math.sqrt(Math.min(1, cum))); });
    for (let k = 4; k >= 0; k--) svg += `<circle cx="${cx}" cy="${cy}" r="${rad[k].toFixed(1)}" fill="${SOLCOL(M.L, k)}" fill-opacity="${SOLOP[k]}" stroke="var(--panel)" stroke-width="${big ? 2 : 1}"><title>${SOLCAT[k]}: ${fmt(M.share[k], 1)}%</title></circle>`;
    return { svg, rad, cx, cy };
  }
  function repSolRings(M) {
    const box = $('#rep-rings'); if (!box) return; const Ls = leaders(); if (!Ls.length || !M) { box.innerHTML = ''; return; }
    const size = 300, lab = 230, rg = ringSvg(M, size, true); let svg = rg.svg;
    // etiquetas con flecha, como en el libro
    let inner = 0; const ys = [];
    M.share.forEach((s, k) => { const r0 = k ? rg.rad[k - 1] : 0, r1 = rg.rad[k], rm = k ? (r0 + r1) / 2 : r1 * .45; ys.push([k, rm]); });
    ys.forEach(([k, rm], j) => {
      const ty = 30 + j * 52, px = rg.cx + rm * .7, py = rg.cy - rm * .7;
      svg += `<polyline fill="none" stroke="var(--muted)" stroke-width="1" points="${px},${py} ${size + 6},${ty} ${size + 18},${ty}"/><circle cx="${px}" cy="${py}" r="2.5" fill="var(--ink)"/>`;
      svg += `<text x="${size + 22}" y="${ty + 4}" font-size="14" font-weight="600">${SOLCAT[k]} <tspan font-weight="400">${fmt(M.share[k], 1)}%</tspan></text>`;
    });
    const piso = M.share[0], techo = M.share[0] + M.share[1] + M.share[2];
    // modelos integrados: un círculo por líder
    const all = Ls.map((x, j) => [j, solidModel(x)]);
    const mini = all.map(([j, m]) => { const r = ringSvg(m, 96, false); return `<button class="ringcard" data-j="${j}" aria-pressed="${j === LS.sol}"><svg viewBox="0 0 96 96" width="96" height="96">${r.svg.replace(/(fill|stroke)="(var\([^)]+\))"/g, 'style="$1:$2"')}</svg>
      <span><b style="color:${PN[m.L.party][1]}">${esc(m.L.short)}</b><span class="muted">${PN[m.L.party][0]}</span>
      <span>Duros <b>${fmt(m.share[0], 0)}%</b> (${fmt(m.durOfSup, 0)}% de sus votantes)</span><span>Techo <b>${fmt(m.share[0] + m.share[1] + m.share[2], 0)}%</b></span><span>Imposibles <b>${fmt(m.share[4], 0)}%</b></span></span></button>`; }).join('');
    // cruce: categorías del candidato × categorías del rival
    initSol(); const B = all.find(([j]) => j === LS.cmp); const Mb = B ? B[1] : null, W = weights();
    let cross = '';
    if (Mb) {
      const T = SOLCAT.map(() => new Float64Array(5)); let tot = 0; for (let i = 0; i < N; i++) { if (M.cat[i] < 0 || Mb.cat[i] < 0) continue; const w = W ? W[i] : 1; T[M.cat[i]][Mb.cat[i]] += w; tot += w; }
      cross = `<div class="row"><label>Cruzar con <select id="solCmp">${Ls.map((x, j) => `<option value="${j}" ${j === LS.cmp ? 'selected' : ''}>${esc(x.name)} (${PN[x.party][0]})</option>`).join('')}</select></label></div>
      <div class="tablewrap"><table><thead><tr><th>${esc(M.L.short)} ↓ · ${esc(Mb.L.short)} →</th>${SOLCAT.map(c => `<th>${c}</th>`).join('')}<th class="tot">Total</th></tr></thead><tbody>
      ${SOLCAT.map((c, a) => `<tr><td><b>${c}</b> de ${esc(M.L.short)}</td>${SOLCAT.map((d, b) => { const v = 100 * T[a][b] / tot, hl = (a === 1 && b <= 2) || (a === 2 && b <= 1); return `<td style="${hl ? 'background:var(--accent-soft);font-weight:600' : ''}">${fmt(v, 1)}</td>`; }).join('')}<td class="tot">${fmt(M.share[a], 1)}</td></tr>`).join('')}
      </tbody></table></div><p class="note">% sobre todo el electorado. Resaltado: los blandos de ${esc(M.L.short)} que son duros, blandos o posibles de ${esc(Mb.L.short)}, y los posibles de ${esc(M.L.short)} que hoy son duros o blandos de ${esc(Mb.L.short)}: el terreno que se disputan.</p>`;
    }
    const prof = M.attrs.map((A, k) => `<tr><td>${esc(A.lab)}</td><td>${isNaN(M.ideal[k]) ? '–' : fmt(M.ideal[k] * (A.lab.includes('0-10') ? 10 : 1), A.lab.includes('0-10') ? 1 : 2)}</td><td>${fmt(M.aw[k], 2)}</td></tr>`).join('');
    box.innerHTML = `<div class="grid2" style="align-items:center"><div class="chart">${svgWrap(size + lab, size, svg)}</div>
      <div style="display:grid;gap:8px"><div class="qtitle"><span class="eyebrow">Modelo de solidez · ${wLabel()}</span><span class="q">${esc(M.L.name)}</span></div>
      <div class="chips"><span class="chip">Piso (duros): <b>${fmt(piso, 1)}%</b></span><span class="chip">Duros sobre sus votantes: <b>${fmt(M.durOfSup, 0)}%</b></span><span class="chip">Votantes (duros + blandos): <b>${fmt(M.share[0] + M.share[1], 1)}%</b></span><span class="chip">Techo (duros + blandos + posibles): <b>${fmt(techo, 1)}%</b></span><span class="chip">Rechazo (difíciles + imposibles): <b>${fmt(100 - techo, 1)}%</b></span></div>
      <details><summary>Elector ideal de ${esc(M.L.short)} y peso de cada atributo</summary><div class="tablewrap"><table><thead><tr><th>Atributo</th><th>Elector ideal</th><th>Peso (|r|)</th></tr></thead><tbody>${prof}</tbody></table></div>
      <p class="note">Escalas 0-1 salvo las 0-10. Sentimiento: 0 = solo español, 1 = solo catalán. Relación: 0 = región, 1 = estado independiente. Lengua: 0 = castellano, 1 = catalán.</p></details></div></div>
      <h3>Modelos integrados: un círculo por líder</h3><p class="note">Pulsa un líder para verlo en grande y en el mapa de votantes.</p>
      <div class="ringgrid">${mini}</div>
      <h3>¿Quién puede llevarse a quién?</h3>${cross}`;
    box.querySelectorAll('.ringcard').forEach(b => b.onclick = () => { LS.sol = +b.dataset.j; renderSolid(); });
    const sc = $('#solCmp'); if (sc) sc.onchange = e => { LS.cmp = +e.target.value; repSolRings(M); };
  }
  /* ---------- 9 · Trabajar con los posibles ---------- */
  const PS = { yvar: 'ideologia', cmp: 'cl', show: 10 };
  const findVar = (re, t) => V.find(v => (!t || v.t === t) && re.test(v.l));
  function wmean(f, sel) { const W = weights(); let s = 0, sw = 0; for (let i = 0; i < N; i++) { if (!sel(i)) continue; const x = f(i); if (x == null || isNaN(x)) continue; const w = W ? W[i] : 1; s += w * x; sw += w; } return sw ? { m: s / sw, n: sw } : { m: null, n: 0 }; }
  function catFlag(v, re) { if (!v) return null; const a = codes(v), hit = v.c.map(c => !c[2] && re.test(c[1])), ok = v.c.map(c => !c[2]); return i => a[i] === 255 || !ok[a[i]] ? null : hit[a[i]] ? 1 : 0; }
  function scaleF(v) { if (!v) return null; const r = ratingArr(v); return i => isNaN(r[i]) ? null : r[i]; }
  function profileRows(M) {
    const rows = [], add = (lab, f, pct) => { if (f) rows.push({ lab, f, pct }); };
    add(`Valoración de ${M.L.short} (0-10)`, i => isNaN(M.r[i]) ? null : M.r[i], false);
    const T = affTargets(); if (T[M.L.party]) add(`Simpatía hacia votantes de ${PN[M.L.party][0]} (0-10)`, scaleF(T[M.L.party]), false);
    add('Ideología (0-10)', scaleF(keyOf('ideologia')), false);
    add('% a favor de la independencia', catFlag(keyOf('independencia'), /^S[ií]/), true);
    add('% estado independiente (relación Cat-Esp)', catFlag(keyOf('relacion_cat_esp'), /independent/i), true);
    add('% se siente solo o más catalán', catFlag(keyOf('sentimiento'), /(Nom[eé]s|M[eé]s) catal/i), true);
    add('% se siente solo o más español', catFlag(keyOf('sentimiento'), /(Nom[eé]s|M[eé]s) espanyol/i), true);
    add('% tan catalán como español', catFlag(keyOf('sentimiento'), /^Tan/i), true);
    add('% catalán lengua propia', catFlag(keyOf('lengua_propia'), /^Catal/i), true);
    add('% castellano lengua propia', catFlag(keyOf('lengua_propia'), /^Castell/i), true);
    add('% mujeres', catFlag(keyOf('sexo'), /Dona|Femen|Mujer/i), true);
    const ev = keyOf('edad'); if (ev) { add('Edad media', i => (ev.v[i] == null || ev.v[i] >= 900) ? null : ev.v[i], false); add('% 65 años o más', i => (ev.v[i] == null || ev.v[i] >= 900) ? null : ev.v[i] >= 65 ? 1 : 0, true); }
    add('Valoración del Govern de la Generalitat (0-10)', scaleF(findVar(/gesti[oó] del Govern de la Generalitat/i, 'scale')), false);
    add('Valoración del Gobierno español (0-10)', scaleF(findVar(/gesti[oó] del Govern espanyol/i, 'scale')), false);
    add('% muy o bastante interesado en política', catFlag(findVar(/la pol[ií]tica li interessa/i), /^(Molt|Bastant)/i), true);
    return rows;
  }
  // variables que definen la clasificación o el voto: se excluyen del análisis de palancas para no caer en tautologías
  const CIRC = /(votaria|va votar|vot[aà] a les|Record de vot|Intenci[oó]|simpatia de partit|per quin partit sent|partit.*proper|coneix|Grau de coneixement|probabilitat.*votar|segon partit|guanyar[aà] les eleccions|Agrupaci)/i;
  function levers(M, mode) {
    const W = weights(), P = 2;
    const pos = []; for (let i = 0; i < N; i++) if (M.cat[i] === P) pos.push(i);
    let gA, gB, la, lb;
    if (mode === 'cl') { const cs = pos.map(i => M.C[i]).sort((a, b) => a - b), med = cs[Math.floor(cs.length / 2)] || 0; gA = i => M.cat[i] === P && M.C[i] >= med; gB = i => M.cat[i] === P && M.C[i] < med; la = 'Posibles cercanos'; lb = 'Posibles lejanos'; }
    else if (mode === 'du') { gA = i => M.cat[i] === 0 || M.cat[i] === 1; gB = i => M.cat[i] === P; la = 'Sus votantes (duros + blandos)'; lb = 'Posibles'; }
    else { gA = i => M.cat[i] === P; gB = i => M.cat[i] === 3 || M.cat[i] === 4; la = 'Posibles'; lb = 'Difíciles + imposibles'; }
    const T = affTargets(), skip = new Set([M.L.v.n, T[M.L.party] && T[M.L.party].n, 'REC_AGRUPADO'].filter(Boolean));
    Object.values(I.claves || {}).forEach(n => { if (/^(rec_|int_|simpatia)/.test(Object.keys(I.claves).find(k => I.claves[k] === n) || '')) skip.add(n); });
    const out = [];
    V.forEach(v => {
      if (skip.has(v.n) || v.derived || CIRC.test(v.l) || /^(E\d+[A-Z_]*$|CIRCUIT|ENQUEST|LLENGUA_ENQUESTA|LLENGUA_SISTEMA|FORMAT_ENQUESTA)/.test(v.n)) return;
      if (v.t === 'num') return;
      if (v.t === 'scale') {
        const r = ratingArr(v); let a = [0, 0, 0, 0], b = [0, 0, 0, 0];
        for (let i = 0; i < N; i++) { const x = r[i]; if (isNaN(x)) continue; const w = W ? W[i] : 1, t = gA(i) ? a : gB(i) ? b : null; if (!t) continue; t[0] += w; t[1] += w * x; t[2] += w * x * x; t[3]++; }
        if (a[3] < 25 || b[3] < 25) return;
        const ma = a[1] / a[0], mb = b[1] / b[0], va = a[2] / a[0] - ma * ma, vb = b[2] / b[0] - mb * mb, sd = Math.sqrt((va + vb) / 2) || 1;
        out.push({ v, lab: v.l, cat: '', ea: ma, eb: mb, d: (ma - mb) / sd, scale: true, na: a[3], nb: b[3] });
        return;
      }
      if (v.c.length > 25) return;
      const a = codes(v); const tA = new Float64Array(v.c.length), tB = new Float64Array(v.c.length); let sA = 0, sB = 0, nA = 0, nB = 0;
      for (let i = 0; i < N; i++) { const k = a[i]; if (k === 255 || v.c[k][2]) continue; const w = W ? W[i] : 1; if (gA(i)) { tA[k] += w; sA += w; nA++; } else if (gB(i)) { tB[k] += w; sB += w; nB++; } }
      if (nA < 25 || nB < 25) return;
      v.c.forEach((c, k) => {
        if (c[2] || (v.multi && k === 0)) return; const pa = tA[k] / sA, pb = tB[k] / sB, pm = (tA[k] + tB[k]) / (sA + sB);
        if (pm < .03 || pm > .97) return;
        out.push({ v, lab: v.l, cat: c[1], ea: pa, eb: pb, d: (pa - pb) / Math.sqrt(pm * (1 - pm)), scale: false, na: nA, nb: nB });
      });
    });
    out.sort((x, y) => y.d - x.d);
    return { out, la, lb, npos: pos.length };
  }
  function repPos() {
    const box = $('#rep-pos'), ctl = $('#rep-pos-ctl'); if (!box) return; const Ls = leaders();
    if (!Ls.length) { box.innerHTML = '<p class="note">Esta encuesta no incluye valoración de líderes.</p>'; ctl.innerHTML = ''; return; }
    initSol(); const M = solidModel(Ls[LS.sol]), L = M.L, W = weights();
    ctl.innerHTML = `<label>Candidato <select id="psL">${Ls.map((x, j) => `<option value="${j}" ${j === LS.sol ? 'selected' : ''}>${esc(x.name)} (${PN[x.party][0]})</option>`).join('')}</select></label>
      <label>Eje vertical <select id="psY">${yOptions().map(([k, l]) => `<option value="${k}" ${k === PS.yvar ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <span class="note">El candidato y los umbrales se comparten con los gráficos 7 y 8.</span>`;
    $('#psL').onchange = e => { LS.sol = +e.target.value; renderSolid(); };
    $('#psY').onchange = e => { PS.yvar = e.target.value; repPos(); };
    const sc = solScatter(M, PS.yvar, 3, box);
    const isPos = i => M.cat[i] === 2, isDur = i => M.cat[i] === 0, isBla = i => M.cat[i] === 1;
    let nPos = 0, wPos = 0; for (let i = 0; i < N; i++) if (isPos(i)) { nPos++; wPos += W ? W[i] : 1; }
    // origen de los posibles
    const Lsall = leaders(), bestLeader = p => { const c = Lsall.filter(o => o.party === p); return c.length ? c : null; };
    const orig = {}; for (let i = 0; i < N; i++) { if (!isPos(i)) continue; const k = M.gi[i] || '_'; const w = W ? W[i] : 1; orig[k] = (orig[k] || 0) + w; }
    const origRows = Object.entries(orig).sort((a, b) => b[1] - a[1]).map(([p, w]) => {
      const sel = i => isPos(i) && (M.gi[i] || '_') === p;
      const rL = wmean(i => isNaN(M.r[i]) ? null : M.r[i], sel);
      let own = null, ownName = '';
      const cand = p !== '_' && p !== L.party ? bestLeader(p) : null;
      if (cand) { // líder propio = el mejor valorado por su electorado
        let best = null; cand.forEach(o => { const rr = ratingArr(o.v), m = wmean(i => isNaN(rr[i]) ? null : rr[i], sel); if (m.m != null && (!best || m.m > best.m)) best = { m: m.m, o }; }); if (best) { own = best.m; ownName = best.o.short; }
      }
      let tie = null; if (cand) { const rr = ratingArr(cand[0].v); let a = 0, t = 0; for (let i = 0; i < N; i++) { if (!sel(i) || isNaN(M.r[i])) continue; let mx = NaN; cand.forEach(o => { const v = ratingArr(o.v)[i]; if (!isNaN(v) && (isNaN(mx) || v > mx)) mx = v; }); if (isNaN(mx)) continue; const w = W ? W[i] : 1; t += w; if (M.r[i] >= mx) a += w; } tie = t ? 100 * a / t : null; }
      return { p, share: 100 * w / wPos, rL: rL.m, own, ownName, tie };
    });
    const origTable = `<table><thead><tr><th>Votan hoy a…</th><th>% de los posibles</th><th>Valoran a ${esc(L.short)}</th><th>Valoran a su líder</th><th>% que ya valora igual o mejor a ${esc(L.short)}</th></tr></thead><tbody>${origRows.map(o => `<tr><td>${o.p === '_' ? (BAI.on ? 'BAI y otros (blanco, abstención, indecisos sin simpatía, otros partidos)' : 'Otros partidos, en blanco, indecisos sin simpatía') : `<span class="sw" style="background:${PN[o.p][1]}"></span>${PN[o.p][0]}`}</td><td><b>${fmt(o.share, 1)}</b></td><td>${fmt(o.rL, 1)}</td><td>${o.own == null ? '–' : fmt(o.own, 1) + ' <span class="muted">(' + esc(o.ownName) + ')</span>'}</td><td>${o.tie == null ? '–' : fmt(o.tie, 0)}</td></tr>`).join('')}</tbody></table>`;
    // perfil comparado
    const PR = profileRows(M), groupsP = [['Duros', isDur], ['Blandos', isBla], ['Posibles', isPos], ['Difíciles + imposibles', i => M.cat[i] >= 3]];
    const prof = PR.map(r => { const vals = groupsP.map(([, g]) => wmean(r.f, g).m); return { r, vals }; });
    const fv = (x, pct) => x == null ? '–' : pct ? fmt(100 * x, 0) + '%' : fmt(x, 1);
    const profTable = `<table><thead><tr><th>Rasgo</th>${groupsP.map(g => `<th>${g[0]}</th>`).join('')}<th class="tot">Posibles − duros</th></tr></thead><tbody>${prof.map(({ r, vals }) => {
      const gap = vals[2] != null && vals[0] != null ? (vals[2] - vals[0]) * (r.pct ? 100 : 1) : null, big = gap != null && Math.abs(gap) >= (r.pct ? 15 : 1.5);
      return `<tr><td>${esc(r.lab)}</td>${vals.map(v => `<td>${fv(v, r.pct)}</td>`).join('')}<td class="tot" style="${big ? 'color:var(--warn)' : ''}">${gap == null ? '–' : (gap > 0 ? '+' : '') + fmt(gap, r.pct ? 0 : 1) + (r.pct ? ' pp' : '')}</td></tr>`; }).join('')}</tbody></table>`;
    // palancas
    const LV = levers(M, PS.cmp), topPos = LV.out.filter(x => x.d > .15).slice(0, PS.show), topNeg = LV.out.filter(x => x.d < -.15).slice(-PS.show).reverse();
    const lvRow = x => `<tr><td style="text-align:left;white-space:normal"><span class="mono muted" style="font-size:.7rem">${esc(x.v.n)}</span><br>${esc(trunc(x.lab.replace(/^[\dA-Za-z]{1,4}\.\s*/, ''), 110))}${x.cat ? ` → <b>${esc(x.cat)}</b>` : ''}</td><td>${x.scale ? fmt(x.ea, 1) : fmt(100 * x.ea, 0) + '%'}</td><td>${x.scale ? fmt(x.eb, 1) : fmt(100 * x.eb, 0) + '%'}</td><td><span style="display:inline-block;height:8px;width:${Math.min(120, Math.abs(x.d) * 120).toFixed(0)}px;background:${x.d > 0 ? 'var(--aff-pos)' : 'var(--aff-neg)'};border-radius:2px;vertical-align:middle"></span> ${fmt(x.d, 2)}</td></tr>`;
    const lvHead = `<thead><tr><th>Variable y respuesta</th><th>${esc(LV.la)}</th><th>${esc(LV.lb)}</th><th>Efecto</th></tr></thead>`;
    // consejos
    const tips = [];
    const share = M.share, techo = share[0] + share[1] + share[2];
    tips.push(`<b>Tamaño de la oportunidad.</b> Los posibles de ${esc(L.short)} son el <b>${fmt(share[2], 1)}%</b> de la base, ${share[0] ? `${fmt(share[2] / Math.max(share[0], .1), 1)} veces sus duros` : 'muy por encima de sus duros'}. Su techo (duros + blandos + posibles) es del ${fmt(techo, 0)}%. ${share[2] > share[0] + share[1] ? 'Tiene más votos por ganar que votos propios: es un candidato que puede crecer si habla a este grupo.' : 'Tiene pocos votos por ganar en relación con los propios: le conviene consolidar a sus blandos antes que salir a por posibles.'}`);
    const o1 = origRows.filter(o => o.p !== '_').slice(0, 3);
    if (o1.length) tips.push(`<b>De dónde vienen.</b> Hoy votan sobre todo a ${o1.map(o => `${PN[o.p][0]} (${fmt(o.share, 0)}%)`).join(', ')}. Como dice el libro, los posibles de un candidato son a la vez blandos de otro: la campaña de ${esc(L.short)} compite directamente con ${o1.map(o => PN[o.p][0]).join(' y ')}.`);
    const ties = [];
    o1.forEach(o => {
      if (o.own == null || o.rL == null) return;
      if (o.own - o.rL >= 1) tips.push(`<b>No atacar a ${esc(o.ownName)}.</b> Los posibles que hoy votan ${PN[o.p][0]} valoran a ${esc(o.ownName)} con un ${fmt(o.own, 1)}, frente al ${fmt(o.rL, 1)} de ${esc(L.short)}. Un ataque frontal reforzaría su fidelidad («cuando alguien agrede a una persona que apreciamos, tendemos a defenderla»). Mejor una campaña en positivo sobre los temas que comparten.`);
      else if (o.rL - o.own >= .5) tips.push(`<b>Contraste con ${esc(o.ownName)}.</b> Los posibles que vienen de ${PN[o.p][0]} ya valoran mejor a ${esc(L.short)} (${fmt(o.rL, 1)}) que a ${esc(o.ownName)} (${fmt(o.own, 1)}); el ${fmt(o.tie, 0)}% lo valora igual o mejor. Son votantes blandos de ${PN[o.p][0]}: un contraste bien hecho puede moverlos.`);
      else ties.push(o);
    });
    if (ties.length) tips.push(`<b>Empates.</b> Entre los posibles que vienen de ${ties.map(o => `${PN[o.p][0]} (${esc(L.short)} ${fmt(o.rL, 1)} frente a ${esc(o.ownName)} ${fmt(o.own, 1)})`).join(', ')} las valoraciones están casi igualadas. Son votantes ambivalentes: deciden los matices de campaña, y el gráfico 6 permite ver qué subgrupos son más frágiles.`);
    const gaps = prof.filter(({ r, vals }) => vals[0] != null && vals[2] != null && !/Valoraci[oó]n de|Simpat/.test(r.lab)).map(({ r, vals }) => ({ r, g: (vals[2] - vals[0]) * (r.pct ? 100 : 10), vals }));
    const near = gaps.filter(x => Math.abs(x.g) < 8).map(x => x.r.lab.replace(/^% /, '').replace(/ \(0-10\)/, '').toLowerCase());
    const far = gaps.filter(x => Math.abs(x.g) >= 15).sort((a, b) => Math.abs(b.g) - Math.abs(a.g)).slice(0, 3);
    if (near.length) tips.push(`<b>Terreno común.</b> Posibles y duros se parecen en: ${near.slice(0, 5).join(', ')}. En estos ejes el candidato puede mantener su mensaje habitual sin perder a los suyos.`);
    if (far.length) tips.push(`<b>Brechas que cuidar.</b> Donde más se diferencian: ${far.map(x => `${x.r.lab.replace(/ \(0-10\)/, '').toLowerCase()} (duros ${fv(x.vals[0], x.r.pct)}, posibles ${fv(x.vals[2], x.r.pct)})`).join('; ')}. Un mensaje que acerque a los posibles en estos ejes puede alejar a sus duros: hay que medir el coste antes de moverse.`);
    const lvTop = levers(M, 'cl').out.filter(x => x.d > .25).slice(0, 3);
    if (lvTop.length) tips.push(`<b>Palancas.</b> Entre los posibles, los más cercanos a ${esc(L.short)} se distinguen por: ${lvTop.map(x => `«${esc(trunc(x.lab.replace(/^[\dA-Za-z]{1,4}\.\s*/, ''), 70))}${x.cat ? ' → ' + esc(x.cat) : ''}»`).join('; ')}. Son pistas sobre los temas y actitudes por los que se puede tirar de ellos.`);
    // líderes detestados por los posibles → posibles objetivos de ataque
    const hated = Lsall.filter(o => o.party !== L.party).map(o => { const rr = ratingArr(o.v); return { o, m: wmean(i => isNaN(rr[i]) ? null : rr[i], isPos).m, mb: wmean(i => isNaN(rr[i]) ? null : rr[i], isBla).m }; }).filter(x => x.m != null && x.m < 3.5 && x.mb != null && x.mb < 3.5).sort((a, b) => a.m - b.m).slice(0, 2);
    if (hated.length) tips.push(`<b>A quién se puede atacar.</b> Tanto sus posibles como sus blandos valoran muy mal a ${hated.map(x => `${esc(x.o.name)} (${fmt(x.m, 1)} y ${fmt(x.mb, 1)})`).join(' y ')}. Según el libro, atacar a un adversario detestado por los propios blandos puede volverlos duros sin coste entre los posibles.`);
    const unk = wmean(i => isNaN(M.r[i]) ? 1 : 0, isPos).m;
    if (unk != null && unk > .1) tips.push(`<b>Darse a conocer.</b> El ${fmt(100 * unk, 0)}% de los posibles no conoce o no valora a ${esc(L.short)}: son votantes sin prejuicios en contra, el grupo más barato de conquistar con presencia y una buena primera impresión.`);
    box.innerHTML = `
      <div class="qtitle"><span class="eyebrow">Posibles de ${esc(L.name)} · ${wLabel()}</span><span class="q">Duros, blandos y posibles: el territorio en el que ${esc(L.short)} puede crecer</span>
      <span class="muted">Mismo mapa que el gráfico 7, solo con los tres grupos que pueden votarle. Hay ${nPos} entrevistas de posibles.</span></div>
      <div class="chart">${svgWrap(sc.width, sc.h, sc.svg)}</div>
      <div class="callout"><h3>Lectura y consejos para ${esc(L.name)}</h3><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul>
      <p class="note">Consejos generados a partir de los datos de esta encuesta y de los criterios del capítulo 8 de <i>El arte de ganar</i>. Son hipótesis de trabajo: indican asociaciones, no causas, y conviene contrastarlos con otras olas y con investigación cualitativa.</p></div>
      <h3>¿De dónde vienen los posibles?</h3><div class="tablewrap">${origTable}</div>
      <p class="note">«Su líder» es el líder de ese partido mejor valorado por esos mismos posibles. Si lo valoran más que a ${esc(L.short)}, son fieles a su partido y atacarlo es arriesgado; si lo valoran menos, son blandos de ese partido.</p>
      <h3>Perfil comparado</h3><div class="tablewrap">${profTable}</div>
      <p class="note">En naranja, las diferencias grandes entre posibles y duros (≥ 15 puntos porcentuales o ≥ 1,5 en escalas 0-10).</p>
      <h3>Qué acerca y qué aleja a los posibles</h3>
      <div class="row"><label>Comparar <select id="psCmp"><option value="cl" ${PS.cmp === 'cl' ? 'selected' : ''}>Posibles cercanos frente a lejanos (mitad superior e inferior del índice)</option><option value="du" ${PS.cmp === 'du' ? 'selected' : ''}>Votantes del candidato frente a posibles</option><option value="di" ${PS.cmp === 'di' ? 'selected' : ''}>Posibles frente a difíciles e imposibles</option></select></label>
      <label>Mostrar <select id="psShow"><option ${PS.show === 10 ? 'selected' : ''}>10</option><option ${PS.show === 20 ? 'selected' : ''}>20</option></select> por lado</label></div>
      <p class="note">Se revisan todas las preguntas del cuestionario (salvo las de voto, simpatía de partido y conocimiento, que definen los grupos). El efecto es la diferencia estandarizada entre los dos grupos: por encima de 0,2 es apreciable y por encima de 0,5 es grande.</p>
      <div class="grid2"><div><h3 style="color:var(--aff-pos)">Más presente en «${esc(LV.la)}»</h3><div class="tablewrap"><table>${lvHead}<tbody>${topPos.map(lvRow).join('') || '<tr><td>Sin diferencias apreciables</td></tr>'}</tbody></table></div></div>
      <div><h3 style="color:var(--aff-neg)">Más presente en «${esc(LV.lb)}»</h3><div class="tablewrap"><table>${lvHead}<tbody>${topNeg.map(lvRow).join('') || '<tr><td>Sin diferencias apreciables</td></tr>'}</tbody></table></div></div></div>`;
    $('#psCmp').onchange = e => { PS.cmp = e.target.value; repPos(); };
    $('#psShow').onchange = e => { PS.show = +e.target.value; repPos(); };
  }

  function renderSolid() { const M = repSolMap(); repSolRings(M); repPos(); }
  function renderLeaders() { repLeadHeat(); repAmbi(); renderSolid(); }

  /* ---------- Transferencias de voto: recuerdo → intención ---------- */
  const TR = { base: 'row', extra: false };
  function partyOrderByIdeo() { // partidos de izquierda a derecha según la ideología media de sus votantes en esta encuesta
    const iv = keyOf('ideologia'), g = groupArr('int'), W = weights(); if (!iv) return PORDER.slice();
    const a = codes(iv), s = {}, sw = {};
    for (let i = 0; i < N; i++) { const p = g[i]; if (!p || a[i] === 255) continue; const c = iv.c[a[i]]; if (c[2] || c[0] > 10) continue; const w = W ? W[i] : 1; s[p] = (s[p] || 0) + w * c[0]; sw[p] = (sw[p] || 0) + w; }
    return PORDER.slice().sort((x, y) => (sw[x] ? s[x] / sw[x] : PORDER.indexOf(x)) - (sw[y] ? s[y] / sw[y] : PORDER.indexOf(y)));
  }
  function trData() {
    const order = partyOrderByIdeo(), W = weights(), rk = keyArr('rec'), ik = keyArr('int');
    const keys = [...order, 'OTROS', ...XKEYS(), 'NOP'];
    const rows = keys.filter(k => rk.includes(k)), cols = keys.filter(k => ik.includes(k));
    const M = {}, rt = {}, ct = {}, rn = {}; rows.forEach(r => { M[r] = {}; rt[r] = 0; rn[r] = 0; }); cols.forEach(c => ct[c] = 0); let G = 0;
    for (let i = 0; i < N; i++) { const r = rk[i], c = ik[i], w = W ? W[i] : 1; if (!(r in M) || !(c in ct)) continue; M[r][c] = (M[r][c] || 0) + w; rt[r] += w; ct[c] += w; rn[r]++; G += w; }
    return { rows, cols, M, rt, ct, rn, G, name: keyName, color: keyColor };
  }
  function repTrHeat() {
    const box = $('#rep-trm'); if (!box) return; const D2 = trData(), ctl = $('#rep-trm-ctl');
    ctl.innerHTML = `<div class="seg" id="trBase"><button data-b="row">% por fila: a dónde van</button><button data-b="col">% por columna: de dónde vienen</button></div>
      <div class="seg" id="trCol"><button data-c="party">Color del partido</button><button data-c="int">Color por intensidad</button></div>`;
    document.querySelectorAll('#trBase button').forEach(b => b.setAttribute('aria-pressed', b.dataset.b === TR.base));
    document.querySelectorAll('#trCol button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === (TR.col || 'party')));
    $('#trBase').onclick = e => { const b = e.target.closest('button'); if (!b) return; TR.base = b.dataset.b; repTrHeat(); };
    $('#trCol').onclick = e => { const b = e.target.closest('button'); if (!b) return; TR.col = b.dataset.c; repTrHeat(); };
    const byParty = (TR.col || 'party') === 'party';
    const pct = (r, c) => { const v = D2.M[r][c] || 0, t = TR.base === 'row' ? D2.rt[r] : D2.ct[c]; return t ? 100 * v / t : null; };
    const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const width = Math.max(340, box.clientWidth || 900), lw = 128, hh = 46, cw = Math.max(58, Math.min(82, (width - lw - 50) / D2.cols.length)), rh = 32;
    let svg = `<text x="${lw + D2.cols.length * cw / 2}" y="10" text-anchor="middle" class="lbl">Intención de voto al Parlament ahora →</text>`;
    // cabecera: celdas con el color de cada partido
    D2.cols.forEach((c, j) => {
      const x = lw + j * cw, col = D2.color(c), tc = lum(col) < 155 ? '#fff' : '#16202b', nm = D2.name(c), two = nm.length > 10 && nm.includes(' ');
      svg += `<rect x="${x + 1}" y="16" width="${cw - 2}" height="${hh - 18}" rx="3" fill="${col}"/>`;
      if (two) { const k = nm.indexOf(' ', Math.floor(nm.length / 2) - 3); const l1 = k > 0 ? nm.slice(0, k) : nm, l2 = k > 0 ? nm.slice(k + 1) : '';
        svg += `<text x="${x + cw / 2}" y="${29}" text-anchor="middle" font-size="10.5" font-weight="700" style="fill:${tc}">${esc(l1)}</text><text x="${x + cw / 2}" y="${40}" text-anchor="middle" font-size="10.5" font-weight="700" style="fill:${tc}">${esc(l2)}</text>`; }
      else svg += `<text x="${x + cw / 2}" y="${35}" text-anchor="middle" font-size="12" font-weight="700" style="fill:${tc}">${esc(nm)}</text>`;
    });
    svg += `<text x="${lw + D2.cols.length * cw + 24}" y="${hh - 6}" text-anchor="middle" class="lbl">n</text>`;
    D2.rows.forEach((r, i) => {
      const y = hh + 4 + i * rh, rc = D2.color(r), rtc = lum(rc) < 155 ? '#fff' : '#16202b';
      svg += `<rect x="0" y="${y + 1}" width="${lw - 6}" height="${rh - 2}" rx="3" fill="${rc}"/><text x="${(lw - 6) / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="12" font-weight="700" style="fill:${rtc}">${esc(D2.name(r))}</text>`;
      D2.cols.forEach((c, j) => {
        const p = pct(r, c); if (p == null) return; const x = lw + j * cw, diag = r === c;
        let fillA, op;
        if (byParty) { fillA = D2.color(c); op = diag ? .42 : .16; }
        else { fillA = 'var(--accent)'; op = .04 + .9 * Math.min(1, p / 80); }
        svg += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" fill="${fillA}" fill-opacity="${op.toFixed(3)}"><title>Recuerdo ${esc(D2.name(r))} → intención ${esc(D2.name(c))}: ${fmt(p, 2)}%</title></rect>`;
        if (diag) svg += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" fill="none" stroke="var(--ink)" stroke-width="1.4"/>`;
        const txtCol = !byParty && op > .55 ? 'var(--panel)' : 'var(--ink)';
        svg += `<text x="${x + cw / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="${diag ? 13 : 12}" font-weight="${diag ? 800 : 400}" style="fill:${txtCol};font-variant-numeric:tabular-nums">${p < .05 ? '·' : fmt(p, p < 10 ? 2 : 1) + '%'}</text>`;
      });
      svg += `<text x="${lw + D2.cols.length * cw + 24}" y="${y + rh / 2 + 4}" text-anchor="middle" class="lbl" style="${D2.rn[r] < 50 ? 'font-style:italic' : ''}">${D2.rn[r]}</text>`;
    });
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">${esc(byName.REC_AGRUPADO.l.replace(/ \(agrupado.*$/, ''))} × intención de voto · ${wLabel()}</span>
      <span class="q">Fidelidad y transferencia de voto: del voto en ${esc(I.eleccion)} a la intención de voto actual (${esc(MESC[I.mes])} ${I.anyo})</span>
      <span class="muted">Filas: recuerdo de voto. Columnas: intención de voto actual. ${TR.base === 'row' ? 'Cada fila suma 100: qué harían ahora quienes votaron a cada partido.' : 'Cada columna suma 100: de dónde procede el voto actual de cada partido.'} En negrita y con borde, la fidelidad. Partidos de izquierda a derecha según la ideología media de sus votantes.</span></div>
      <div class="chart">${svgWrap(Math.max(width, lw + D2.cols.length * cw + 50), hh + 8 + D2.rows.length * rh, svg)}</div>
      <p class="note">Filas con n en cursiva tienen menos de 50 entrevistas. ${BAI.on ? BAINOTE : ''}</p>`;
  }
  function repTrBars() {
    const box = $('#rep-trb'); if (!box) return; const D2 = trData(), ctl = $('#rep-trb-ctl');
    ctl.innerHTML = `<label><input type="checkbox" id="trX" ${TR.extra ? 'checked' : ''}> Mostrar también ${BAI.on ? '' : 'blanco y nulo, indecisos y '}otros partidos</label>`;
    $('#trX').onchange = e => { TR.extra = e.target.checked; repTrBars(); };
    const rows = D2.rows.filter(r => PN[r] || r === 'BAI' || r === 'ABST' || r === 'NOP' || (TR.extra && D2.rn[r] >= 20));
    const width = Math.max(340, Math.min(1000, box.clientWidth || 800)), lw = 110, rm = 24, bh = 30, gap = 10, tm = 28, pw = width - lw - rm;
    let svg = '';
    const nP = rows.filter(r => PN[r]).length, SEP = nP < rows.length ? 14 : 0, yOf = i => tm + i * (bh + gap) + (i >= nP ? SEP : 0), H = tm + rows.length * (bh + gap) + SEP;
    for (let g = 0; g <= 100; g += 25) { const x = lw + pw * g / 100; svg += `<line class="ax" x1="${x}" x2="${x}" y1="${tm - 6}" y2="${H}"/><text class="lbl" x="${x}" y="${tm - 10}" text-anchor="middle">${g}%</text>`; }
    if (SEP) { const ys = tm + nP * (bh + gap) + SEP / 2 - gap / 2; svg += `<line x1="8" x2="${lw + pw}" y1="${ys}" y2="${ys}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 3"/>`; }
    rows.forEach((r, i) => {
      const y = yOf(i); let x = lw;
      svg += `<text x="${lw - 10}" y="${y + bh / 2 + 4}" text-anchor="end" font-size="13" font-weight="600" style="${PN[r] ? '' : 'font-style:italic'}">${esc(D2.name(r))}</text>`;
      D2.cols.forEach(c => {
        const v = D2.rt[r] ? (D2.M[r][c] || 0) / D2.rt[r] : 0, w = pw * v; if (w <= 0) return;
        const col = D2.color(c), n16 = parseInt(col.slice(1), 16), dark = (0.299 * (n16 >> 16) + 0.587 * ((n16 >> 8) & 255) + 0.114 * (n16 & 255)) < 155;
        svg += `<rect x="${x.toFixed(2)}" y="${y}" width="${(w + .3).toFixed(2)}" height="${bh}" fill="${col}"><title>${esc(D2.name(r))} → ${esc(D2.name(c))}: ${fmt(100 * v, 1)}%</title></rect>`;
        if (w >= 20) svg += `<text x="${x + 5}" y="${y + bh / 2 + 4.5}" font-size="12" font-weight="${r === c ? 700 : 500}" style="fill:${dark ? '#fff' : '#16202b'}">${fmt(100 * v, 0)}</text>`;
        x += w;
      });
      if (i !== nP - 1) svg += `<line x1="${lw}" x2="${lw + pw}" y1="${y + bh + gap / 2}" y2="${y + bh + gap / 2}" class="ax"/>`;
    });
    const legend = D2.cols.map(c => `<span><i style="background:${D2.color(c)}"></i>${esc(D2.name(c))}</span>`).join('');
    const fid = rows.filter(r => PN[r] && D2.rt[r]).map(r => `${PN[r][0]} ${fmt(100 * (D2.M[r][r] || 0) / D2.rt[r], 0)}%`).join(' · ');
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Transferencia de votos · ${wLabel()}</span>
      <span class="q">Votantes que en ${esc(I.eleccion.replace('Parlament ', ''))} votaron una opción y qué votarían ahora, en %</span>
      <span class="muted">Fidelidad: ${fid}.</span></div>
      <div class="legend">${legend}</div>
      <div class="chart">${svgWrap(width, H + 4, svg)}</div>
      <p class="note">Recuerdo de voto en las últimas elecciones al Parlament e intención directa de voto al Parlament. ${BAI.on ? BAINOTE + ' ' : ''}Otros partidos agrupa el resto de candidaturas. Partidos ordenados de izquierda a derecha según la ideología media de sus votantes.</p>`;
  }

  /* 1.3 · Sankey de transferencias */
  const SK = { hideFid: false, min: 0, noX: true };
  function repTrSankey() {
    const box = $('#rep-trs'); if (!box) return; const D2 = trData(), ctl = $('#rep-trs-ctl');
    ctl.innerHTML = `<label><input type="checkbox" id="skFid" ${SK.hideFid ? 'checked' : ''}> Ocultar a los fieles (ver solo los cambios de voto)</label>
      <label><input type="checkbox" id="skX" ${SK.noX ? 'checked' : ''}> Ocultar ${BAI.on ? 'el BAI' : 'blanco y nulo, abstención e indecisos'} (se mantienen otros partidos y nuevos votantes)</label>
      <label>Ocultar flujos menores de <select id="skMin">${[0, .3, .5, 1, 2].map(v => `<option value="${v}" ${v === SK.min ? 'selected' : ''}>${fmt(v, 1)}%</option>`).join('')}</select> del total</label>`;
    $('#skFid').onchange = e => { SK.hideFid = e.target.checked; repTrSankey(); };
    $('#skMin').onchange = e => { SK.min = +e.target.value; repTrSankey(); };
    $('#skX').onchange = e => { SK.noX = e.target.checked; repTrSankey(); };
    const flows = [];
    D2.rows.forEach(r => D2.cols.forEach(c => { const v = D2.M[r][c] || 0; if (!v) return; if (SK.hideFid && r === c) return; if (SK.noX && ((XKEYS().includes(r)) || XKEYS().includes(c))) return; if (100 * v / D2.G < SK.min) return; flows.push({ r, c, v }); }));
    const T = flows.reduce((a, f) => a + f.v, 0); if (!T) { box.innerHTML = '<p class="note">No hay flujos que mostrar con estos filtros.</p>'; return; }
    const L = D2.rows.filter(r => flows.some(f => f.r === r)), R = D2.cols.filter(c => flows.some(f => f.c === c));
    const tl = {}, tr = {}; flows.forEach(f => { tl[f.r] = (tl[f.r] || 0) + f.v; tr[f.c] = (tr[f.c] || 0) + f.v; });
    const width = Math.max(360, Math.min(1100, box.clientWidth || 900)), lw = 150, rw = 150, nw = 14, H = 560, gapN = 8, tm = 24;
    const xL = lw, xR = width - rw - nw;
    const scale = Math.min((H - gapN * (L.length - 1)) / T, (H - gapN * (R.length - 1)) / T);
    const posL = {}, posR = {}; let y = tm; L.forEach(r => { posL[r] = { y, h: tl[r] * scale, off: 0 }; y += tl[r] * scale + gapN; }); const hL = y - gapN;
    y = tm; R.forEach(c => { posR[c] = { y, h: tr[c] * scale, off: 0 }; y += tr[c] * scale + gapN; }); const hR = y - gapN;
    // dentro de cada nodo, los flujos se apilan siguiendo el orden del otro lado para minimizar cruces
    const ordR = c => R.indexOf(c), ordL = r => L.indexOf(r);
    const fl = flows.slice().sort((a, b) => ordL(a.r) - ordL(b.r) || ordR(a.c) - ordR(b.c));
    fl.forEach(f => { f.y0 = posL[f.r].y + posL[f.r].off; posL[f.r].off += f.v * scale; });
    flows.slice().sort((a, b) => ordR(a.c) - ordR(b.c) || ordL(a.r) - ordL(b.r)).forEach(f => { f.y1 = posR[f.c].y + posR[f.c].off; posR[f.c].off += f.v * scale; });
    let svg = `<text x="${xL + nw / 2}" y="12" text-anchor="middle" class="lbl">${esc(I.eleccion)} (recuerdo)</text><text x="${xR + nw / 2}" y="12" text-anchor="middle" class="lbl">Intención actual (${esc(MESC[I.mes])} ${I.anyo})</text>`;
    const mx = (xL + nw + xR) / 2;
    fl.forEach(f => {
      const h = f.v * scale, a0 = f.y0, a1 = f.y1, x0 = xL + nw, x1 = xR, col = D2.color(f.r);
      const d = `M${x0},${a0} C${mx},${a0} ${mx},${a1} ${x1},${a1} L${x1},${a1 + h} C${mx},${a1 + h} ${mx},${a0 + h} ${x0},${a0 + h} Z`;
      svg += `<path class="sk-link" d="${d}" fill="${col}" fill-opacity="${f.r === f.c ? .5 : .38}"><title>${esc(D2.name(f.r))} → ${esc(D2.name(f.c))}: ${fmt(100 * f.v / D2.rt[f.r], 1)}% de los votantes de ${esc(D2.name(f.r))} · ${fmt(100 * f.v / D2.G, 1)}% del total</title></path>`;
    });
    const place = (keys, pos) => { let last = -1e9; const out = {}; keys.forEach(k => { const want = pos[k].y + pos[k].h / 2; const yy = Math.max(want, last + 14); out[k] = yy; last = yy; }); return out; };
    const yLabL = place(L, posL), yLabR = place(R, posR);
    const lab = (k, p, side, tot, base) => {
      const yy = (side === 'L' ? yLabL : yLabR)[k], x = side === 'L' ? xL - 8 : xR + nw + 8, anchor = side === 'L' ? 'end' : 'start';
      return `<rect x="${side === 'L' ? xL : xR}" y="${p.y}" width="${nw}" height="${Math.max(1, p.h)}" fill="${D2.color(k)}"><title>${esc(D2.name(k))}: ${fmt(100 * tot / D2.G, 1)}% del total</title></rect>
        ${true ? `<text x="${x}" y="${yy + 4}" text-anchor="${anchor}" font-size="12.5" font-weight="600" style="${PN[k] ? 'fill:' + PN[k][1] : 'fill:var(--muted);font-style:italic'}">${esc(D2.name(k))} <tspan class="lbl" font-weight="400" style="fill:var(--muted)">${fmt(100 * base / D2.G, 1)}%</tspan></text>` : ''}`;
    };
    L.forEach(r => svg += lab(r, posL[r], 'L', tl[r], D2.rt[r]));
    R.forEach(c => svg += lab(c, posR[c], 'R', tr[c], D2.ct[c]));
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Sankey de transferencias · ${wLabel()}</span>
      <span class="q">Flujos de voto: de ${esc(I.eleccion)} a la intención de voto actual</span>
      <span class="muted">El grosor de cada flujo es proporcional al número de votantes (ponderado). Los porcentajes junto a cada partido son su peso sobre toda la muestra. Pasa el ratón por un flujo para ver el detalle.${BAI.on ? ' ' + BAINOTE : ''}</span></div>
      <div class="chart">${svgWrap(width, Math.max(hL, hR, ...Object.values(yLabL), ...Object.values(yLabR)) + 14, svg)}</div>
      <p class="note">Partidos ordenados de arriba abajo de izquierda a derecha ideológica.${SK.min ? ` No se dibujan los flujos inferiores al ${fmt(SK.min, 1)}% del total.` : ''}${SK.hideFid ? ' Los votantes fieles están ocultos: el gráfico muestra solo a quienes cambian.' : ''}</p>`;
  }

  /* 1.4 · Matriz de transferencias netas */
  const NET = { unit: 'pct', onlyP: true };
  const fint = n => Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const CENSO = { '2015': 5510853, '2017': 5554455, '2021': 5624067, '2024': 5754952 };
  function repTrNet() {
    const box = $('#rep-trn'); if (!box) return; const D2 = trData(), ctl = $('#rep-trn-ctl'), cen = CENSO[I.ref] || 5600000;
    ctl.innerHTML = `<div class="seg" id="netU"><button data-u="pct">% del censo</button><button data-u="vot">Votos</button></div><label><input type="checkbox" id="netP" ${NET.onlyP ? 'checked' : ''}> Ocultar ${BAI.on ? 'el BAI' : 'blanco y nulo, abstención e indecisos'} del saldo (se mantienen otros partidos y nuevos votantes)</label><span class="note">Votos: aplicado al censo de ${esc(I.eleccion)} (${fint(cen)} electores).</span>`;
    document.querySelectorAll('#netU button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === NET.unit));
    $('#netP').onchange = e => { NET.onlyP = e.target.checked; repTrNet(); };
    $('#netU').onclick = e => { const b = e.target.closest('button'); if (!b) return; NET.unit = b.dataset.u; repTrNet(); };
    const keys = []; [...D2.rows, ...D2.cols].forEach(k => { if (!keys.includes(k) && !(NET.onlyP && XKEYS().includes(k))) keys.push(k); });
    const ordK = [...partyOrderByIdeo(), 'OTROS', ...XKEYS(), 'NOP']; keys.sort((a, b) => ordK.indexOf(a) - ordK.indexOf(b));
    const f = (a, b) => (D2.M[a] && D2.M[a][b]) || 0, G = D2.G;
    const net = (a, b) => (f(b, a) - f(a, b)) / G; // lo que la fila gana (+) o pierde (−) frente a la columna, en proporción del censo
    const val = x => NET.unit === 'pct' ? 100 * x : x * cen;
    const show = x => { const v = val(x); if (NET.unit === 'pct') return Math.abs(v) < .005 ? '0' : (v > 0 ? '+' : '−') + fmt(Math.abs(v), 2); const r = Math.round(v / 100) * 100; return r === 0 ? '0' : (r > 0 ? '+' : '−') + fint(r); };
    const showAbs = x => NET.unit === 'pct' ? fmt(100 * x, 2) : fint(Math.round(x * cen / 100) * 100);
    const rowsK = keys.filter(k => k !== 'NOP');
    const S2 = keys.map(a => { let lle = 0, fug = 0; keys.forEach(b => { if (b === a) return; lle += f(b, a); fug += f(a, b); }); const rec = D2.rt[a] || 0; return { k: a, lle: lle / G, fug: fug / G, sal: (lle - fug) / G, fid: rec ? 100 * f(a, a) / rec : null, fieles: f(a, a) / G, rec: rec / G, fin: rec / G + (lle - fug) / G }; });
    const maxN = Math.max(...keys.flatMap(a => keys.filter(b => b !== a).map(b => Math.abs(net(a, b)))), 1e-9);
    const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const width = Math.max(340, box.clientWidth || 1000), lw = 128, hh = 46, K = keys.length;
    const cw = Math.max(52, Math.min(72, (width - lw - 5 * 84 - 20) / K)), rh = 32, sx = lw + K * cw + 14, sw = 84;
    let svg = `<text x="${lw + K * cw / 2}" y="10" text-anchor="middle" class="lbl">… frente a (columna)</text>`;
    keys.forEach((c, j) => {
      const x = lw + j * cw, col = keyColor(c), tc = lum(col) < 155 ? '#fff' : '#16202b', nm = keyName(c), two = nm.length > 9 && nm.includes(' ');
      svg += `<rect x="${x + 1}" y="16" width="${cw - 2}" height="${hh - 18}" rx="3" fill="${col}"/>`;
      if (two) { const sp = nm.indexOf(' '); svg += `<text x="${x + cw / 2}" y="29" text-anchor="middle" font-size="10" font-weight="700" style="fill:${tc}">${esc(nm.slice(0, sp))}</text><text x="${x + cw / 2}" y="40" text-anchor="middle" font-size="10" font-weight="700" style="fill:${tc}">${esc(nm.slice(sp + 1))}</text>`; }
      else svg += `<text x="${x + cw / 2}" y="35" text-anchor="middle" font-size="11.5" font-weight="700" style="fill:${tc}">${esc(nm)}</text>`;
    });
    ['Fieles', 'Llegadas', 'Fugas', 'Saldo neto', 'Total final'].forEach((t, j) => svg += `<text x="${sx + j * sw + sw / 2}" y="35" text-anchor="middle" font-size="11.5" font-weight="700" style="fill:var(--ink)">${t}</text>`);
    rowsK.forEach((r, i) => {
      const y = hh + 4 + i * rh, rc = keyColor(r), rtc = lum(rc) < 155 ? '#fff' : '#16202b';
      svg += `<rect x="0" y="${y + 1}" width="${lw - 6}" height="${rh - 2}" rx="3" fill="${rc}"/><text x="${(lw - 6) / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="12" font-weight="700" style="fill:${rtc}">${esc(keyName(r))}</text>`;
      keys.forEach((c, j) => {
        const x = lw + j * cw;
        if (r === c) {
          const s = S2[keys.indexOf(r)];
          svg += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" fill="${keyColor(r)}" fill-opacity=".35" stroke="var(--ink)" stroke-width="1.4"><title>Fieles a ${esc(keyName(r))}: ${showAbs(s.fieles)}${NET.unit === 'pct' ? '% del censo' : ' votantes'} (${s.fid == null ? '–' : fmt(s.fid, 1) + '%'} de quienes lo votaron)</title></rect>`;
          svg += `<text x="${x + cw / 2}" y="${y + 13}" text-anchor="middle" font-size="${NET.unit === 'pct' ? 11.5 : 10.5}" font-weight="800" style="fill:var(--ink);font-variant-numeric:tabular-nums">${showAbs(s.fieles)}</text><text x="${x + cw / 2}" y="${y + 25}" text-anchor="middle" font-size="9.5" class="lbl">${s.fid == null ? '' : fmt(s.fid, 0) + '% fiel'}</text>`;
          return;
        }
        const n = net(r, c), a = Math.min(1, Math.abs(n) / maxN), pos = n > 0;
        svg += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" fill="${pos ? 'var(--gain)' : 'var(--loss)'}" fill-opacity="${(Math.abs(n) * G < 1e-9 ? 0 : .08 + .8 * a).toFixed(3)}"><title>${esc(keyName(r))} frente a ${esc(keyName(c))}: recibe ${showAbs(f(c, r) / G)} y cede ${showAbs(f(r, c) / G)} → saldo ${show(n)}${NET.unit === 'pct' ? ' pp' : ' votos'}</title></rect>`;
        svg += `<text x="${x + cw / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="${NET.unit === 'pct' ? 11.5 : 10.5}" style="fill:${a > .6 ? '#fff' : 'var(--ink)'};font-variant-numeric:tabular-nums">${show(n)}</text>`;
      });
      const s = S2[keys.indexOf(r)], cells = [[`${showAbs(s.fieles)}${s.fid == null ? '' : ` (${fmt(s.fid, 0)}%)`}`, null], [showAbs(s.lle), null], [showAbs(s.fug), null], [show(s.sal), s.sal], [showAbs(s.fin), 'fin']];
      cells.forEach(([t, v], j) => {
        const x = sx + j * sw;
        if (v === 'fin') { svg += `<rect x="${x + 1}" y="${y + 1}" width="${sw - 2}" height="${rh - 2}" rx="3" fill="${keyColor(s.k)}" fill-opacity=".22" stroke="${keyColor(s.k)}" stroke-width="1"><title>${esc(keyName(s.k))}: partía de ${showAbs(s.rec)} ${show(s.sal)} de saldo = ${showAbs(s.fin)}${NET.unit === 'pct' ? '% del censo' : ' votantes'}</title></rect>`; }
        else if (v != null) svg += `<rect x="${x + 1}" y="${y + 1}" width="${sw - 2}" height="${rh - 2}" rx="3" fill="${v > 0 ? 'var(--gain)' : 'var(--loss)'}" fill-opacity=".22"/>`;
        svg += `<text x="${x + sw / 2}" y="${y + rh / 2 + 4.5}" text-anchor="middle" font-size="12" font-weight="${v != null ? 800 : 500}" style="fill:var(--ink);font-variant-numeric:tabular-nums">${t}</text>`;
      });
    });
    const Hm = hh + 8 + rowsK.length * rh;
    // barras de saldo neto
    const parts = S2.filter(s => s.k !== 'NOP'), mx = Math.max(...parts.map(s => Math.abs(s.sal)), 1e-9), bw2 = Math.min(820, width - 20), cx = 150 + (bw2 - 150) / 2, half = (bw2 - 150) / 2 - 80, bh = 20;
    let bars = `<line x1="${cx}" x2="${cx}" y1="0" y2="${parts.length * (bh + 6)}" stroke="var(--muted)"/>`;
    parts.slice().sort((a, b) => b.sal - a.sal).forEach((s, i) => {
      const y = i * (bh + 6), w = half * Math.abs(s.sal) / mx, x = s.sal >= 0 ? cx : cx - w;
      bars += `<text x="140" y="${y + bh / 2 + 4}" text-anchor="end" font-size="12.5" font-weight="600" style="fill:${PN[s.k] ? PN[s.k][1] : 'var(--muted)'}">${esc(keyName(s.k))}</text>`;
      bars += `<rect x="${x}" y="${y}" width="${Math.max(1, w)}" height="${bh}" rx="2" fill="${keyColor(s.k)}"><title>Llegadas ${showAbs(s.lle)} − fugas ${showAbs(s.fug)} = ${show(s.sal)}</title></rect>`;
      bars += `<text x="${s.sal >= 0 ? x + w + 5 : x - 5}" y="${y + bh / 2 + 4}" text-anchor="${s.sal >= 0 ? 'start' : 'end'}" font-size="12" font-weight="700" style="fill:var(--ink)">${show(s.sal)}</text>`;
    });
    const unitTxt = NET.unit === 'pct' ? 'puntos porcentuales del censo' : `votos sobre un censo de ${fint(cen)} electores`;
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Transferencias netas · ${wLabel()}</span>
      <span class="q">¿Quién gana y quién pierde en el intercambio de votantes?</span>
      <span class="muted">Cada casilla es el saldo entre dos opciones: lo que la fila recibe de la columna menos lo que le cede. Verde = la fila gana votantes; rojo = los pierde. La diagonal y la columna «Fieles» muestran a quienes repiten voto, en la misma unidad que el resto (entre paréntesis, el % de sus votantes que repite). «Total final» es lo que tendría cada opción tras aplicar el saldo neto a su recuerdo de voto${NET.onlyP ? ' sin contar los intercambios con el BAI' : ', es decir, su intención de voto actual'}. Cifras en ${unitTxt}.${BAI.on ? ' ' + BAINOTE : ''}</span></div>
      <div class="chart">${svgWrap(Math.max(width, sx + 5 * sw + 4), Hm, svg)}</div>
      <h3>Saldo neto: llegadas menos fugas</h3>
      <div class="chart">${svgWrap(bw2, parts.length * (bh + 6), bars)}</div>
      <p class="note">${NET.onlyP ? `Saldo calculado sin ${BAI.on ? 'el BAI' : 'blanco, abstención e indecisos'}: no incluye lo que cada partido gana o pierde hacia la abstención, el blanco o la indecisión, pero sí lo que recibe de los nuevos votantes.` : `El saldo neto de cada opción es la diferencia entre su intención de voto actual y su recuerdo de voto. Ojo con el ${BAI.on ? 'BAI' : 'bloque de blanco, abstención e indecisos'}: la ponderación ajusta el recuerdo de abstención al dato real, mientras que en la intención de voto la gente siempre dice que irá a votar más de lo que luego va; por eso ese bloque «pierde» mucho y los partidos «ganan» de él. Para comparar a los partidos sin ese efecto, marca «Ocultar el BAI del saldo».`} «No podía votar» (nuevos electores) solo aparece como columna: siempre aporta votantes a los demás. Los flujos pequeños entre dos partidos se basan en pocas entrevistas: ${NET.unit === 'vot' ? 'las cifras en votos son una extrapolación orientativa, redondeada a centenas, y tienen el mismo margen de error que la encuesta' : 'conviene leerlos con cautela'}.</p>`;
  }

  /* 1.5 · Sankey de transferencias netas */
  const SKN = { fid: false, noX: true, min: 0, unit: 'pct' };
  function repTrSankeyNet() {
    const box = $('#rep-trsn'); if (!box) return; const D2 = trData(), ctl = $('#rep-trsn-ctl'), cen = CENSO[I.ref] || 5600000;
    ctl.innerHTML = `<div class="seg" id="sknU"><button data-u="pct">% del censo</button><button data-u="vot">Votos</button></div>
      <label><input type="checkbox" id="sknF" ${SKN.fid ? 'checked' : ''}> Mostrar también a los fieles</label>
      <label><input type="checkbox" id="sknX" ${SKN.noX ? 'checked' : ''}> Ocultar ${BAI.on ? 'el BAI' : 'blanco y nulo, abstención e indecisos'} (se mantienen otros partidos y nuevos votantes)</label>
      <label>Ocultar saldos menores de <select id="sknMin">${[0, .1, .3, .5, 1].map(v => `<option value="${v}" ${v === SKN.min ? 'selected' : ''}>${fmt(v, 1)}%</option>`).join('')}</select> del censo</label>`;
    document.querySelectorAll('#sknU button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === SKN.unit));
    $('#sknU').onclick = e => { const b = e.target.closest('button'); if (!b) return; SKN.unit = b.dataset.u; repTrSankeyNet(); };
    $('#sknF').onchange = e => { SKN.fid = e.target.checked; repTrSankeyNet(); };
    $('#sknX').onchange = e => { SKN.noX = e.target.checked; repTrSankeyNet(); };
    $('#sknMin').onchange = e => { SKN.min = +e.target.value; repTrSankeyNet(); };
    const keys = []; [...D2.rows, ...D2.cols].forEach(k => { if (!keys.includes(k) && !(SKN.noX && XKEYS().includes(k))) keys.push(k); });
    const ordK = [...partyOrderByIdeo(), 'OTROS', ...XKEYS(), 'NOP']; keys.sort((a, b) => ordK.indexOf(a) - ordK.indexOf(b));
    const f = (a, b) => (D2.M[a] && D2.M[a][b]) || 0, G = D2.G;
    const u = x => SKN.unit === 'pct' ? fmt(100 * x / G, 2) + '%' : fint(Math.round(x / G * cen / 100) * 100);
    const flows = [];
    keys.forEach((a, i) => keys.forEach((b, j) => {
      if (a === b) { if (SKN.fid && f(a, a)) flows.push({ r: a, c: a, v: f(a, a), fid: true }); return; }
      if (j <= i) return;
      const n = f(a, b) - f(b, a); if (!n || 100 * Math.abs(n) / G < SKN.min) return;
      flows.push(n > 0 ? { r: a, c: b, v: n, ab: f(a, b), ba: f(b, a) } : { r: b, c: a, v: -n, ab: f(b, a), ba: f(a, b) });
    }));
    const T = flows.reduce((a, x) => a + x.v, 0); if (!T) { box.innerHTML = '<p class="note">No hay saldos que mostrar con estos filtros.</p>'; return; }
    const L = keys.filter(k => flows.some(x => x.r === k)), R = keys.filter(k => flows.some(x => x.c === k));
    const tl = {}, tr = {}; flows.forEach(x => { tl[x.r] = (tl[x.r] || 0) + x.v; tr[x.c] = (tr[x.c] || 0) + x.v; });
    const width = Math.max(360, Math.min(1100, box.clientWidth || 900)), lw = 170, rw = 170, nw = 14, H = 520, gapN = 8, tm = 24;
    const xL = lw, xR = width - rw - nw;
    const scale = Math.min((H - gapN * (L.length - 1)) / T, (H - gapN * (R.length - 1)) / T);
    const posL = {}, posR = {}; let y = tm; L.forEach(r => { posL[r] = { y, h: tl[r] * scale, off: 0 }; y += tl[r] * scale + gapN; }); const hL = y - gapN;
    y = tm; R.forEach(c => { posR[c] = { y, h: tr[c] * scale, off: 0 }; y += tr[c] * scale + gapN; }); const hR = y - gapN;
    const ordR = c => R.indexOf(c), ordL = r => L.indexOf(r);
    const fl = flows.slice().sort((a, b) => ordL(a.r) - ordL(b.r) || ordR(a.c) - ordR(b.c));
    fl.forEach(x => { x.y0 = posL[x.r].y + posL[x.r].off; posL[x.r].off += x.v * scale; });
    flows.slice().sort((a, b) => ordR(a.c) - ordR(b.c) || ordL(a.r) - ordL(b.r)).forEach(x => { x.y1 = posR[x.c].y + posR[x.c].off; posR[x.c].off += x.v * scale; });
    let svg = `<text x="${xL + nw / 2}" y="12" text-anchor="middle" class="lbl">Ceden votantes (saldo negativo)</text><text x="${xR + nw / 2}" y="12" text-anchor="middle" class="lbl">Reciben votantes (saldo positivo)</text>`;
    const mx = (xL + nw + xR) / 2;
    fl.forEach(x => {
      const h = x.v * scale, a0 = x.y0, a1 = x.y1, x0 = xL + nw, x1 = xR, col = x.fid ? keyColor(x.r) : keyColor(x.c);
      const d = `M${x0},${a0} C${mx},${a0} ${mx},${a1} ${x1},${a1} L${x1},${a1 + h} C${mx},${a1 + h} ${mx},${a0 + h} ${x0},${a0 + h} Z`;
      const tip = x.fid ? `Fieles a ${keyName(x.r)}: ${u(x.v)}` : `${keyName(x.c)} gana en neto ${u(x.v)} frente a ${keyName(x.r)} (recibe ${u(x.ab)} y le devuelve ${u(x.ba)})`;
      svg += `<path class="sk-link" d="${d}" fill="${col}" fill-opacity="${x.fid ? .18 : .45}"><title>${esc(tip)}</title></path>`;
    });
    const place = (ks, pos) => { let last = -1e9; const out = {}; ks.forEach(k => { const yy = Math.max(pos[k].y + pos[k].h / 2, last + 14); out[k] = yy; last = yy; }); return out; };
    const yLabL = place(L, posL), yLabR = place(R, posR);
    const lab = (k, p, side, tot) => {
      const yy = (side === 'L' ? yLabL : yLabR)[k], x = side === 'L' ? xL - 8 : xR + nw + 8, anchor = side === 'L' ? 'end' : 'start', net = tot - (SKN.fid ? f(k, k) : 0);
      return `<rect x="${side === 'L' ? xL : xR}" y="${p.y}" width="${nw}" height="${Math.max(1, p.h)}" fill="${keyColor(k)}"/>
        <text x="${x}" y="${yy + 4}" text-anchor="${anchor}" font-size="12.5" font-weight="600" style="${PN[k] ? 'fill:' + PN[k][1] : 'fill:var(--muted);font-style:italic'}">${esc(keyName(k))} <tspan font-weight="700" style="fill:${side === 'L' ? 'var(--loss)' : 'var(--gain)'}">${side === 'L' ? '−' : '+'}${u(net)}</tspan></text>`;
    };
    L.forEach(r => svg += lab(r, posL[r], 'L', tl[r]));
    R.forEach(c => svg += lab(c, posR[c], 'R', tr[c]));
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Sankey de transferencias netas · ${wLabel()}</span>
      <span class="q">Saldos netos de voto entre opciones: quién cede votantes a quién</span>
      <span class="muted">Para cada pareja solo se dibuja el saldo: si ERC da 4 votantes al PSC y el PSC da 3 a ERC, aparece un flujo de 1 de ERC al PSC. A la izquierda, la suma de lo que cada opción cede en neto; a la derecha, lo que recibe. Cada flujo lleva el color de quien gana. Cifras en ${SKN.unit === 'pct' ? '% del censo' : `votos sobre un censo de ${fint(cen)} electores`}.${BAI.on ? ' ' + BAINOTE : ''}</span></div>
      <div class="chart">${svgWrap(width, Math.max(hL, hR, ...Object.values(yLabL), ...Object.values(yLabR)) + 14, svg)}</div>
      <p class="note">Una misma opción puede aparecer a los dos lados: cede en neto frente a unas y gana frente a otras. Los nuevos votantes («No podía votar») solo pueden ceder. ${SKN.fid ? 'Los fieles se muestran como flujos claros de cada opción hacia sí misma. ' : ''}Pasa el ratón por un flujo para ver el intercambio en los dos sentidos.</p>`;
  }

  /* 1.5 · Transferencia de votos netas (barras divergentes) */
  const NB = { noX: true, unit: 'pct' };
  function repTrNetBars() {
    const box = $('#rep-trnb'); if (!box) return; const D2 = trData(), ctl = $('#rep-trnb-ctl'), cen = CENSO[I.ref] || 5600000;
    ctl.innerHTML = `<div class="seg" id="nbU"><button data-u="pct">% del censo</button><button data-u="vot">Votos</button></div>
      <label><input type="checkbox" id="nbX" ${NB.noX ? 'checked' : ''}> Ocultar ${BAI.on ? 'el BAI' : 'blanco y nulo, abstención e indecisos'} (se mantienen otros partidos y nuevos votantes)</label>`;
    document.querySelectorAll('#nbU button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === NB.unit));
    $('#nbU').onclick = e => { const b = e.target.closest('button'); if (!b) return; NB.unit = b.dataset.u; repTrNetBars(); };
    $('#nbX').onchange = e => { NB.noX = e.target.checked; repTrNetBars(); };
    const keys = []; [...D2.rows, ...D2.cols].forEach(k => { if (!keys.includes(k) && !(NB.noX && XKEYS().includes(k))) keys.push(k); });
    const ordK = [...partyOrderByIdeo(), 'OTROS', ...XKEYS(), 'NOP']; keys.sort((a, b) => ordK.indexOf(a) - ordK.indexOf(b));
    const rows = keys.filter(k => k !== 'NOP');
    const f = (a, b) => (D2.M[a] && D2.M[a][b]) || 0, G = D2.G;
    const val = x => NB.unit === 'pct' ? 100 * x : x * cen;
    const lab = x => { const v = val(x); if (NB.unit === 'pct') return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), Math.abs(v) < 1 ? 2 : 1); const r = Math.round(v / 100) * 100; return (r > 0 ? '+' : r < 0 ? '−' : '') + fint(r); };
    const data = rows.map(a => { const segs = keys.filter(b => b !== a).map(b => ({ b, n: (f(b, a) - f(a, b)) / G })).filter(s => s.n); return { a, segs, neg: segs.filter(s => s.n < 0).reduce((t, s) => t + s.n, 0), pos: segs.filter(s => s.n > 0).reduce((t, s) => t + s.n, 0) }; });
    const mx = Math.max(...data.map(d => Math.max(-d.neg, d.pos)), 1e-9);
    const width = Math.max(360, Math.min(1100, box.clientWidth || 900)), lw = 120, rm = 90, bh = 28, gap = 12, tm = 46, pw = width - lw - rm, cx = lw + pw / 2, half = pw / 2;
    const nP = rows.filter(r => PN[r]).length, SEP = nP < rows.length ? 14 : 0, yOf = i => tm + i * (bh + gap) + (i >= nP ? SEP : 0), H = tm + rows.length * (bh + gap) + SEP;
    let svg = `<text x="${cx - half / 2}" y="14" text-anchor="middle" class="lbl">← Pierde votantes frente a…</text><text x="${cx + half / 2}" y="14" text-anchor="middle" class="lbl">Gana votantes de… →</text>`;
    // escala
    const step = (() => { const t = val(mx) / 3, p = Math.pow(10, Math.floor(Math.log10(t))), m = t / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; })();
    for (let g = -Math.floor(val(mx) / step) * step; g <= val(mx) + 1e-9; g += step) { const x = cx + half * (g / val(mx)); svg += `<line class="ax" x1="${x}" x2="${x}" y1="${tm - 8}" y2="${H}"/><text class="lbl" x="${x}" y="${tm - 12}" text-anchor="middle" font-size="10">${g === 0 ? '0' : (g > 0 ? '+' : '−') + (NB.unit === 'pct' ? fmt(Math.abs(g), step < 1 ? 1 : 0) : fint(Math.abs(g)))}</text>`; }
    if (SEP) { const ys = tm + nP * (bh + gap) + SEP / 2 - gap / 2; svg += `<line x1="8" x2="${lw + pw + rm - 8}" y1="${ys}" y2="${ys}" stroke="var(--ink)" stroke-width="1.4" stroke-dasharray="5 3"/>`; }
    const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    data.forEach((d, i) => {
      const y = yOf(i);
      svg += `<text x="${lw - 10}" y="${y + bh / 2 + 4.5}" text-anchor="end" font-size="13" font-weight="600" style="${PN[d.a] ? 'fill:' + PN[d.a][1] : 'fill:var(--muted);font-style:italic'}">${esc(keyName(d.a))}</text>`;
      let xn = cx, xp = cx;
      const seg = (s, x, w) => { const col = keyColor(s.b), tc = lum(col) < 155 ? '#fff' : '#16202b';
        let t = `<rect x="${x.toFixed(2)}" y="${y}" width="${Math.max(.5, w).toFixed(2)}" height="${bh}" fill="${col}" stroke="var(--panel)" stroke-width=".6"><title>${esc(keyName(d.a))} ${s.n > 0 ? 'gana' : 'pierde'} en neto ${lab(Math.abs(s.n)).replace(/^[+−]/, '')} ${s.n > 0 ? 'de' : 'frente a'} ${esc(keyName(s.b))} (recibe ${lab(f(s.b, d.a) / G).replace(/^[+−]/, '')}, cede ${lab(f(d.a, s.b) / G).replace(/^[+−]/, '')})</title></rect>`;
        if (w >= (NB.unit === 'pct' ? 34 : 52)) t += `<text x="${x + w / 2}" y="${y + bh / 2 + 4}" text-anchor="middle" font-size="10.5" style="fill:${tc};pointer-events:none">${lab(s.n)}</text>`; return t; };
      d.segs.filter(s => s.n < 0).forEach(s => { const w = half * (-s.n) / mx; xn -= w; svg += seg(s, xn, w); });
      d.segs.filter(s => s.n > 0).forEach(s => { const w = half * s.n / mx; svg += seg(s, xp, w); xp += w; });
      const sal = d.pos + d.neg, xs = cx + half * sal / mx;
      svg += `<line x1="${xs}" x2="${xs}" y1="${y - 4}" y2="${y + bh + 4}" stroke="var(--ink)" stroke-width="2.6"/><circle cx="${xs}" cy="${y - 4}" r="2.6" fill="var(--ink)"/>`;
      svg += `<text x="${lw + pw + 8}" y="${y + bh / 2 + 4.5}" font-size="13" font-weight="800" style="fill:${sal >= 0 ? 'var(--gain)' : 'var(--loss)'}">${lab(sal)}</text>`;
    });
    svg += `<text x="${lw + pw + 8}" y="${tm - 12}" font-size="10.5" font-weight="700" style="fill:var(--ink)">Saldo</text>`;
    const legend = keys.filter(k => data.some(d => d.segs.some(s => s.b === k))).map(k => `<span><i style="background:${keyColor(k)}"></i>${esc(keyName(k))}</span>`).join('') + `<span><i style="background:var(--ink);width:3px"></i>Saldo neto</span>`;
    box.innerHTML = `<div class="qtitle"><span class="eyebrow">Transferencia de votos netas · ${wLabel()}</span>
      <span class="q">Saldo de votantes de cada opción frente a las demás, de ${esc(I.eleccion)} a ${esc(MESC[I.mes])} ${I.anyo}</span>
      <span class="muted">A la derecha del cero, lo que cada fila gana en neto de cada opción (color de la opción de la que procede); a la izquierda, lo que pierde frente a cada una. La raya negra marca el saldo neto: llegadas menos fugas. Cifras en ${NB.unit === 'pct' ? 'puntos del censo' : `votos sobre un censo de ${fint(cen)} electores`}.${BAI.on && !NB.noX ? ' ' + BAINOTE : ''}</span></div>
      <div class="legend">${legend}</div>
      <div class="chart">${svgWrap(width, H + 4, svg)}</div>
      <p class="note">Los nuevos votantes («No podía votar») solo aportan votantes, por eso aparecen como ganancias para todos y no tienen barra propia.${NB.noX ? ` ${BAI.on ? 'El BAI está oculto' : 'Blanco, abstención e indecisos están ocultos'}: el saldo no incluye lo que cada partido gana o pierde hacia ese bloque.` : ' Ojo: el BAI «pierde» mucho porque la ponderación ajusta la abstención recordada al dato real, mientras que en la intención la gente siempre declara que votará más de lo que luego vota.'}</p>`;
  }

  function renderReport() { repIdeoVote(); repTrHeat(); repTrBars(); repTrSankey(); repTrNet(); repTrNetBars(); repTrSankeyNet(); renderAffect(); renderLeaders(); }
  function initReport() {
    const c = $('#rep-ideo-ctl'); if (!c) return;
    c.innerHTML = `<div class="seg" id="rpShape" role="group" aria-label="Forma del gráfico"><button data-s="area">Área suavizada</button><button data-s="cols">Columnas</button><button data-s="lines">Líneas</button></div>
      <div class="seg" id="rpLab" role="group" aria-label="Qué indican las cifras"><button data-l="col">% de cada posición</button><button data-l="party">% sobre el total del partido</button></div>
      <label><input type="checkbox" id="rpNon" ${RP.nonvote ? 'checked' : ''}> Incluir BAI (blanco, abstención, indecisos) y otros</label>
      <label><input type="checkbox" id="rpProp" ${RP.prop ? 'checked' : ''}> Ancho según el peso de cada posición</label>
      <label><input type="checkbox" id="rpDs" ${RP.dsmooth ? 'checked' : ''}> Suavizar también los datos</label>
      <label id="rpNsL"><input type="checkbox" id="rpNs" ${RP.ideoNs ? 'checked' : ''}> Columna NS/NC de ideología</label>`;
    const sync = () => { document.querySelectorAll('#rpShape button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === RP.shape)); $('#rpNsL').hidden = RP.shape !== 'cols'; document.querySelectorAll('#rpLab button').forEach(b => b.setAttribute('aria-pressed', b.dataset.l === RP.lab)); };
    $('#rpLab').onclick = e => { const b = e.target.closest('button'); if (!b) return; RP.lab = b.dataset.l; sync(); renderReport(); };
    $('#rpShape').onclick = e => { const b = e.target.closest('button'); if (!b) return; RP.shape = b.dataset.s; sync(); renderReport(); };
    $('#rpNon').onchange = e => { RP.nonvote = e.target.checked; renderReport(); };
    $('#rpProp').onchange = e => { RP.prop = e.target.checked; renderReport(); };
    $('#rpDs').onchange = e => { RP.dsmooth = e.target.checked; renderReport(); };
    $('#rpNs').onchange = e => { RP.ideoNs = e.target.checked; renderReport(); };
    sync();
  }
  function initReportPage() {
    window.CEO_DEBUG = { solidModel, leaders, SOLT, groupArr, ratingArr, weights };
    if (I.pondera_constante) { const b = $('#wseg button[data-w=ceo]'); if (b) b.remove(); }
    const syncW = () => document.querySelectorAll('#wseg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.w === S.w));
    $('#wseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.w = b.dataset.w; syncW(); renderReport(); };
    syncW(); initReport(); initAffect(); renderReport();
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderReport, 150); });
  }

  /* ---------- controles ---------- */
  function optHtml(sel, allowNone) {
    const RO = Object.keys(ROLE), keys = V.filter(v => v.key).sort((a, b) => RO.indexOf(a.key) - RO.indexOf(b.key)), rest = V.filter(v => !v.key);
    const o = v => `<option value="${esc(v.n)}" ${v.n === sel ? 'selected' : ''}>${esc(v.n)} — ${esc(trunc(v.l, 70))}</option>`;
    return (allowNone ? `<option value="">(ninguna)</option>` : '') + `<optgroup label="Variables clave">${keys.map(o).join('')}</optgroup><optgroup label="Todas (orden del fichero)">${rest.map(o).join('')}</optgroup>`;
  }
  function syncControls() {
    $('#selRow').value = S.row; $('#selCol').value = S.col || ''; $('#selF').value = S.fvar || '';
    $('#selChart').value = S.chart; $('#selBase').value = S.base;
    $('#chkNs').checked = S.nsnc; $('#chkMoe').checked = S.moe;
    document.querySelectorAll('#wseg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.w === S.w));
    const fc = $('#fcats');
    if (S.fvar) {
      const cs = catsOf(byName[S.fvar]);
      fc.innerHTML = cs.map((c, k) => `<label><input type="checkbox" data-k="${k}" ${S.fcats && S.fcats.has(k) ? 'checked' : ''}>${esc(trunc(c[1], 30))}</label>`).join('');
      fc.hidden = false;
    } else { fc.innerHTML = ''; fc.hidden = true; }
  }
  const TYPES = { all: 'Todas', key: 'Clave', cat: 'Categóricas', scale: 'Escalas 0-10', multi: 'Multirrespuesta', num: 'Numéricas' };
  const typeLabel = v => v.multi ? 'multi' : v.t === 'scale' ? '0-10' : v.t === 'num' ? 'num' : `${v.c.length} cat`;
  function renderList() {
    const q = S.q.trim().toLowerCase();
    const match = v => (!q || (v.n + ' ' + v.l).toLowerCase().includes(q)) &&
      (S.tf === 'all' || (S.tf === 'key' && v.key) || (S.tf === 'multi' && v.multi) || (S.tf === v.t && !v.multi));
    const item = v => `<div class="vitem" data-n="${esc(v.n)}"><div><div class="vn">${esc(v.n)} <span class="badge">${typeLabel(v)}</span>${v.key ? `<span class="badge key">${esc(ROLE[v.key] || v.key)}</span>` : ''}</div><div class="vl">${esc(v.l)}</div></div>
      <div class="vbtns"><button data-a="row" title="Usar en filas">F</button><button data-a="col" title="Usar en columnas">C</button><button data-a="fil" title="Usar como filtro">▽</button></div></div>`;
    const RO = Object.keys(ROLE), ko = v => RO.indexOf(v.key);
    const keys = V.filter(v => v.key && match(v)).sort((a, b) => ko(a) - ko(b)), rest = V.filter(v => !v.key && match(v));
    $('#vlist').innerHTML = (keys.length ? `<div class="vgroup">Variables clave (${keys.length})</div>` + keys.map(item).join('') : '') +
      (rest.length ? `<div class="vgroup">Cuestionario (${rest.length})</div>` + rest.map(item).join('') : '') ||
      `<p class="muted">Ninguna variable coincide con «${esc(S.q)}».</p>`;
    $('#vcount').textContent = `${keys.length + rest.length} de ${V.length}`;
    highlightList();
  }
  function highlightList() {
    document.querySelectorAll('.vitem').forEach(el => { el.classList.toggle('sel-r', el.dataset.n === S.row); el.classList.toggle('sel-c', el.dataset.n === S.col); });
  }
  function toast(t) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = t; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); }

  function presets() {
    const k = r => (keyOf(r) || {}).n, P = [];
    if (k('int_parlament')) P.push(['Intención directa Parlament', { row: k('int_parlament'), col: null, chart: 'auto' }]);
    if (k('int_parlament')) P.push(['Transferencias: recuerdo → intención', { row: k('int_parlament'), col: 'REC_AGRUPADO', chart: 'heat' }]);
    if (k('int_congres')) P.push(['Intención directa Congreso', { row: k('int_congres'), col: null, chart: 'auto' }]);
    if (k('independencia')) P.push(['Independencia × recuerdo', { row: k('independencia'), col: 'REC_AGRUPADO', chart: 'stacked' }]);
    if (k('ideologia') && k('int_parlament')) P.push(['Ideología media × intención', { row: k('ideologia'), col: k('int_parlament'), chart: 'means' }]);
    if (k('sentimiento') && k('edad_gr')) P.push(['Pertenencia × edad', { row: k('sentimiento'), col: k('edad_gr'), chart: 'stacked' }]);
    if (k('relacion_cat_esp') && k('lengua_propia')) P.push(['Relación Cat-Esp × lengua', { row: k('relacion_cat_esp'), col: k('lengua_propia'), chart: 'stacked' }]);
    $('#presets').innerHTML = P.map((p, i) => `<button data-p="${i}">${esc(p[0])}</button>`).join('');
    $('#presets').onclick = e => { const b = e.target.closest('button'); if (!b) return; Object.assign(S, P[+b.dataset.p][1]); render(); };
  }

  function diagPanel() {
    const rows = I.diag.filter(r => r.n > 0 || r.objetivo > 0);
    const max = Math.max(...rows.map(r => Math.max(r.muestra, r.objetivo)));
    const w = 520, lw = 150, bw = w - lw - 40, rh = 22;
    let svg = '';
    rows.forEach((r, i) => {
      const y = 8 + i * rh, xa = lw + bw * r.muestra / max, xb = lw + bw * r.objetivo / max;
      const col = colorsFor([[0, r.cat, r.cat === 'NS/NC' ? 1 : 0]])[0];
      svg += `<text x="${lw - 8}" y="${y + 4}" text-anchor="end" font-size="11.5">${esc(r.cat)}</text>
        <line x1="${xa}" x2="${xb}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="5" stroke-linecap="round"/>
        <circle cx="${xa}" cy="${y}" r="5" fill="var(--panel)" stroke="${col}" stroke-width="2"><title>Muestra ${fmt(r.muestra)}%</title></circle>
        <circle cx="${xb}" cy="${y}" r="5" fill="${col}"><title>Objetivo ${fmt(r.objetivo)}%</title></circle>`;
    });
    $('#diagchart').innerHTML = svgWrap(w, rows.length * rh + 12, svg);
    $('#diagtable').innerHTML = `<table><thead><tr><th>Recuerdo (${esc(I.eleccion)})</th><th>n</th><th>Muestra %</th><th>Resultado s/ censo %</th><th>Objetivo %</th><th>Ponderado %</th><th>Peso medio</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.cat)}</td><td>${r.n}</td><td>${fmt(r.muestra)}</td><td>${r.oficial_censo == null ? '–' : fmt(r.oficial_censo)}</td><td>${fmt(r.objetivo)}</td><td>${fmt(r.ponderado)}</td><td>${r.peso_medio == null ? '–' : fmt(r.peso_medio, 2)}</td></tr>`).join('')}</tbody></table>`;
  }

  function catalog() {
    // listado completo de variables en una tabla plegable
    $('#catalog').innerHTML = `<table><thead><tr><th>Variable</th><th>Tipo</th><th>Pregunta / etiqueta</th><th>Categorías</th></tr></thead><tbody>${V.map(v => `<tr><td class="mono">${esc(v.n)}</td><td>${typeLabel(v)}</td><td style="text-align:left;white-space:normal">${esc(v.l)}${v.key ? ` <span class="badge key">${esc(ROLE[v.key] || v.key)}</span>` : ''}</td><td style="text-align:left;white-space:normal" class="muted">${v.t === 'num' ? 'numérica' : esc(trunc(v.c.map(c => c[1]).join(' · '), 160))}</td></tr>`).join('')}</tbody></table>`;
  }

  function init() {
    document.title = `BOP ${I.id} · ${I.titulo}`;
    const rowDefault = (keyOf('int_parlament') || keyOf('rec_agrupado')).n;
    S.row = rowDefault;
    $('#selRow').innerHTML = optHtml(S.row, false);
    $('#selCol').innerHTML = optHtml(null, true);
    $('#selF').innerHTML = optHtml(null, true);
    if (I.pondera_constante) { const b = $('#wseg button[data-w=ceo]'); if (b) b.remove(); }
    $('#selRow').onchange = e => { S.row = e.target.value; render(); };
    $('#selCol').onchange = e => { S.col = e.target.value || null; render(); };
    $('#selF').onchange = e => { S.fvar = e.target.value || null; S.fcats = S.fvar ? new Set(catsOf(byName[S.fvar]).map((c, k) => k).filter(k => !catsOf(byName[S.fvar])[k][2])) : null; render(); };
    $('#fcats').onchange = e => { const k = +e.target.dataset.k; if (e.target.checked) S.fcats.add(k); else S.fcats.delete(k); render(); };
    $('#selChart').onchange = e => { S.chart = e.target.value; render(); };
    $('#selBase').onchange = e => { S.base = e.target.value; render(); };
    $('#chkNs').onchange = e => { S.nsnc = e.target.checked; render(); };
    $('#chkMoe').onchange = e => { S.moe = e.target.checked; render(); };
    $('#swap').onclick = () => { if (!S.col) return; [S.row, S.col] = [S.col, S.row]; render(); };
    $('#wseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.w = b.dataset.w; render(); };
    $('#q').oninput = e => { S.q = e.target.value; renderList(); };
    $('#tf').innerHTML = Object.entries(TYPES).map(([k, l]) => `<button data-t="${k}" aria-pressed="${k === S.tf}">${l}</button>`).join('');
    $('#tf').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.tf = b.dataset.t; document.querySelectorAll('#tf button').forEach(x => x.setAttribute('aria-pressed', x === b)); renderList(); };
    $('#vlist').onclick = e => {
      const b = e.target.closest('button'), it = e.target.closest('.vitem'); if (!it) return;
      const n = it.dataset.n, a = b ? b.dataset.a : 'row';
      if (a === 'row') S.row = n; else if (a === 'col') S.col = n === S.row ? null : n;
      else { S.fvar = n; const cs = catsOf(byName[n]); S.fcats = new Set(cs.map((c, k) => k).filter(k => !cs[k][2])); }
      render(); if (window.innerWidth < 900) $('#analysis').scrollIntoView({ behavior: 'smooth' });
    };
    $('#copy').onclick = () => {
      const t = $('#xt'); if (!t) return;
      const tsv = [...t.rows].map(r => [...r.cells].map(c => c.innerText.replace(/\s*±.*$/, '').replace(/\n/g, ' ')).join('\t')).join('\n');
      navigator.clipboard.writeText(tsv).then(() => toast('Tabla copiada: pégala en Excel'), () => { const r = document.createRange(); r.selectNode(t); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Tabla seleccionada: pulsa Ctrl+C'); });
    };
    presets(); renderList(); diagPanel(); catalog(); render();
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 150); });
  }
  document.addEventListener('DOMContentLoaded', () => document.body.dataset.mode === 'informe' ? initReportPage() : init());
})();
