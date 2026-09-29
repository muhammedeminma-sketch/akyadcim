/* ==========================================================================
   DCIM Sunum — 2D Dijital İkiz (NewUICMPDigitalTwin2DComponent)
   schematic-viewer (SVG kroki, pan/zoom), schematic-toolbar (telemetri, zoom),
   sol panel (lokasyon ağacı, katmanlar, görünüm modu, filtreler, mini harita),
   cabinet-isometric-drawer (kabin çekmecesi), ups/climate-panel tabloları.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtTime, toast, dialog } = DCIM.ui;
  const D = DCIM.data;
  const L = D.layout;
  DCIM.shell.init({ active: '2d' });

  // ---------------------------------------------------------------------------
  // Öğeler
  // ---------------------------------------------------------------------------
  const items = []
    .concat(D.cabinets.map(c => Object.assign({ kind: 'cabinet', group: 'whiteSpace' }, { ref: c, id: c.id, label: c.code, x: c.x, y: c.y, w: c.w, h: c.h })))
    .concat(D.climates.map(e => ({ kind: 'climate', group: 'cooling', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo })))
    .concat(D.panels.map(e => ({ kind: 'panel', group: 'cooling', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo })))
    .concat(D.ups.map(e => ({ kind: 'ups', group: 'energy', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo })));
  const byId = {};
  items.forEach(i => { byId[i.id] = i; });

  const parseVb = s => { const p = s.split(/\s+/).map(Number); return { x: p[0], y: p[1], w: p[2], h: p[3] }; };
  const FIT = parseVb(L.fitViewBox);

  const state = {
    vb: Object.assign({}, FIT),
    mode: 'default', // default | temp_mid | temp_map | humidity
    layers: { showAllMap: false, showGrids: true },
    expandAllLabels: true,
    filters: { whiteSpace: true, energy: true, cooling: true, cabinetDoors: true },
    leftOpen: true,
    selectedId: null,
    highlight: null, // 'alarm' | 'warning' | 'lost' | null
    treeSelected: 's1',
    treeExpanded: { tt: true, ank: true, umk: true, k1: true, s1: true }
  };

  // ---------------------------------------------------------------------------
  // Renk / etiket kuralları (digital-twin-2d.component.ts)
  // ---------------------------------------------------------------------------
  const STATUS_FILL = {
    normal: 'var(--schema-status-normal)',
    warning: 'var(--schema-status-warning)',
    alarm: 'var(--schema-status-alarm)',
    lost: 'var(--schema-status-lost)'
  };
  function tempColor(t, stale) {
    if (stale || t === null || isNaN(t) || t === 0) return '#868686';
    if (t < 12) return '#f0f9e8';
    if (t < 15) return '#ccebc5';
    if (t < 18) return '#a8ddb5';
    if (t < 21) return '#7bccc4';
    if (t < 23) return '#61bb61';
    if (t < 25) return '#ffeda0';
    if (t < 27) return '#fed976';
    if (t < 30) return '#fd8d3c';
    if (t < 32) return '#f03b20';
    return '#bd0026';
  }
  const filteredOut = it => !state.filters[it.group];
  const statusOf = it => it.ref.status || 'normal';

  function visual(it) {
    const st = statusOf(it);
    const stale = st === 'lost';
    if (filteredOut(it)) return { fill: '#868686', label: it.label, blink: '', labelOn: false };
    let fill = STATUS_FILL[st] || STATUS_FILL.normal;
    let label = it.label;
    const labelOn = state.expandAllLabels !== false;
    if (it.kind === 'cabinet' && state.mode !== 'default') {
      const c = it.ref;
      if (state.mode === 'temp_mid') label = stale ? '-' : c.tempLow.toFixed(1) + ' °C';
      else if (state.mode === 'temp_map') { label = stale ? '-' : c.tempLow.toFixed(1) + ' °C'; fill = tempColor(c.tempLow, stale); }
      else if (state.mode === 'humidity') label = stale ? '-' : '%' + c.humidity;
    }
    let blink = '';
    if (state.mode !== 'temp_map' || it.kind !== 'cabinet') {
      if (st === 'alarm') blink = 'scada-blink-alarm';
      else if (st === 'warning') blink = 'scada-blink-warning';
      else if (st === 'lost') blink = 'scada-blink-lost';
    }
    return { fill, label, blink, labelOn: labelOn || (state.mode !== 'default' && it.kind === 'cabinet') };
  }

  const labelWidth = (label, fs) => Math.max(20, String(label || '').length * fs * 0.62 + 8);
  function labelPos(it) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    if (it.kind === 'cabinet' || (it.kind === 'climate' && !it.lo) || !it.lo) return { x: cx, y: cy };
    return { x: cx + it.lo[0], y: cy + it.lo[1] };
  }

  // ---------------------------------------------------------------------------
  // Şematik SVG (schematic-viewer.component.html)
  // ---------------------------------------------------------------------------
  const host = document.getElementById('schematic-host');
  host.innerHTML =
    '<svg id="schematic-svg" class="schematic-canvas w-full h-full block select-none cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-surface-base" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="transparent" /><path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--schema-grid)" stroke-width="1" /></pattern>' +
      '</defs>' +
      '<rect data-grid x="-10000" y="-10000" width="30000" height="30000" fill="url(#grid)" class="pointer-events-none" />' +
      '<g class="dxf-background-layer pointer-events-none"><path data-bg d="' + L.bgPath + '" fill="none" stroke="var(--schema-text-muted)" stroke-width="1.2" /></g>' +
      '<g data-layer1-rects></g>' +
      '<g data-texts class="pointer-events-none"></g>' +
      '<g data-items></g>' +
    '</svg>';
  const svg = document.getElementById('schematic-svg');
  const itemsG = svg.querySelector('[data-items]');
  const textsG = svg.querySelector('[data-texts]');
  const layer1G = svg.querySelector('[data-layer1-rects]');

  function renderTexts() {
    const bgLayer = svg.querySelector('.dxf-background-layer');
    if (bgLayer) bgLayer.style.display = '';

    if (layer1G) {
      layer1G.style.display = state.layers.showAllMap ? '' : 'none';
      if (state.layers.showAllMap && L.layer1Rects) {
        layer1G.innerHTML = L.layer1Rects.map(r =>
          '<g id="' + esc(r.id) + '">' +
            '<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="rgba(148, 163, 184, 0.08)" stroke="var(--schema-text-muted)" stroke-width="1.2">' +
              (r.text ? '<title>' + esc(r.text) + '</title>' : '') +
            '</rect>' +
          '</g>'
        ).join('');
      } else {
        layer1G.innerHTML = '';
      }
    }

    const always = /^POD-/;
    textsG.innerHTML = L.texts
      .filter(t => state.layers.showAllMap || always.test(t.text))
      .map(t =>
        '<text x="' + t.x + '" y="' + t.y + '" text-anchor="middle" dominant-baseline="central" class="fill-slate-900 dark:fill-slate-100 font-sans font-bold select-none pointer-events-none" style="font-size:' + (/^POD-/.test(t.text) ? '15px' : '11px') + '">' +
          esc(t.text) +
        '</text>'
      )
      .join('');
    const gridEl = svg.querySelector('[data-grid]');
    if (gridEl) gridEl.style.display = state.layers.showGrids ? '' : 'none';
  }

  function itemSvg(it) {
    const v = visual(it);
    const dim = state.highlight && statusOf(it) !== state.highlight;
    const sel = state.selectedId === it.id;
    const fs = it.kind === 'cabinet' ? 15 : 14;
    const lp = labelPos(it);
    let s = '<g class="schematic-item' + (dim ? ' is-dimmed' : '') + (sel ? ' is-selected' : '') + '" data-item="' + esc(it.id) + '">' +
      '<rect class="item-body ' + v.blink + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="' + v.fill + '" stroke="#797979" stroke-width="1" rx="2" ry="2"><title>' + esc(it.label + (it.ref.note ? ' — ' + it.ref.note : '')) + '</title></rect>';
    if (v.blink === 'scada-blink-alarm' || v.blink === 'scada-blink-warning') {
      s += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="none" rx="2" ry="2" pointer-events="none" class="' + (v.blink === 'scada-blink-alarm' ? 'scada-pulse-radar-alarm' : 'scada-pulse-radar-warning') + '"></rect>';
    }
    if (it.kind === 'cabinet' && state.filters.cabinetDoors && (it.ref.frontDoor === 'open' || it.ref.rearDoor === 'open')) {
      s += '<g pointer-events="none" transform="translate(' + (it.x + it.w - 8) + ' ' + (it.y + 8) + ')"><svg x="-11" y="-11" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
        '<path d="M8 9V6.5A4.5 4.5 0 0 1 16.7 5" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" /><rect x="5" y="8" width="12" height="10" rx="2" fill="#dc2626" />' +
        '<circle cx="11" cy="12.5" r="1.2" fill="#ffffff" /><path d="M11 13.7V16" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" /></svg><title>Kabin kapısı açık</title></g>';
    }
    if (v.labelOn) {
      const lw = labelWidth(v.label, fs);
      s += '<g pointer-events="none"><rect x="' + (lp.x - lw / 2) + '" y="' + (lp.y - fs) + '" width="' + lw + '" height="' + fs * 2 + '" fill="rgba(255, 255, 255, 0.70)" stroke="rgba(194, 194, 194, 0.85)" stroke-width="0.6" rx="6" />' +
        '<text class="schematic-label font-sans font-bold select-none fill-slate-900" x="' + lp.x + '" y="' + lp.y + '" text-anchor="middle" dominant-baseline="central" font-size="' + fs + '">' + esc(v.label) + '</text></g>';
    }
    return s + '</g>';
  }

  function renderItems() { itemsG.innerHTML = items.map(itemSvg).join(''); }

  // --- ViewBox / pan / zoom ---------------------------------------------------
  function applyVb() {
    svg.setAttribute('viewBox', state.vb.x + ' ' + state.vb.y + ' ' + state.vb.w + ' ' + state.vb.h);
    renderMinimapRect();
  }
  function zoomAt(factor, cx, cy) {
    const nw = Math.max(FIT.w * 0.06, Math.min(FIT.w * 3, state.vb.w * factor));
    const nh = nw * (state.vb.h / state.vb.w);
    state.vb.x = cx - (cx - state.vb.x) * (nw / state.vb.w);
    state.vb.y = cy - (cy - state.vb.y) * (nh / state.vb.h);
    state.vb.w = nw; state.vb.h = nh;
    applyVb();
  }
  const zoomIn = () => zoomAt(0.8, state.vb.x + state.vb.w / 2, state.vb.y + state.vb.h / 2);
  const zoomOut = () => zoomAt(1.25, state.vb.x + state.vb.w / 2, state.vb.y + state.vb.h / 2);
  let anim = null;
  function animateVb(target) {
    if (anim) cancelAnimationFrame(anim);
    const from = Object.assign({}, state.vb);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 380);
      const e = 1 - Math.pow(1 - k, 3);
      ['x', 'y', 'w', 'h'].forEach(p => { state.vb[p] = from[p] + (target[p] - from[p]) * e; });
      applyVb();
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  const resetView = () => animateVb(Object.assign({}, FIT));
  function focusBounds(b, pad) {
    const aspect = FIT.h / FIT.w;
    let w = Math.max(b.w + pad * 2, 360);
    let h = w * aspect;
    if (h < b.h + pad * 2) { h = b.h + pad * 2; w = h / aspect; }
    animateVb({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h });
  }
  const focusItem = it => focusBounds({ x: it.x, y: it.y, w: it.w, h: it.h }, 220);

  function toSvg(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: state.vb.x, y: state.vb.y };
  }
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    zoomAt(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y);
  }, { passive: false });
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: state.vb.x, vy: state.vb.y, moved: false }; });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const r = svg.getBoundingClientRect();
    const scale = Math.max(state.vb.w / r.width, state.vb.h / r.height);
    state.vb.x = drag.vx - dx * scale;
    state.vb.y = drag.vy - dy * scale;
    applyVb();
  });
  svg.addEventListener('pointerup', e => {
    if (drag && !drag.moved) {
      const g = e.target.closest('[data-item]');
      if (g) onItemClick(byId[g.getAttribute('data-item')]);
      else if (state.highlight) { state.highlight = null; renderItems(); renderHeader(); }
    }
    drag = null;
  });
  svg.addEventListener('pointerleave', () => { drag = null; });

  function onItemClick(it) {
    if (!it) return;
    state.selectedId = it.id;
    renderItems();
    if (it.kind === 'cabinet') openDrawer(it.ref);
    else openEquipmentModal(it);
  }

  // ---------------------------------------------------------------------------
  // Başlık telemetri & aksiyon grupları (digital-twin-2d.component.html)
  // ---------------------------------------------------------------------------
  const countStatus = s => items.filter(i => statusOf(i) === s).length;

  function renderHeader() {
    const site = D.site;
    const nA = countStatus('alarm'), nW = countStatus('warning'), nL = countStatus('lost');
    const tickets = site.tickets.newTickets + site.tickets.newMessages;
    const btn = (key, n, icon, on, off, title) =>
      '<button type="button" data-level="' + key + '" title="' + title + ': ' + n + ' adet" class="h-7.5 px-2.5 rounded-[2px] border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ' + (n > 0 ? on : off) + (state.highlight === key ? ' ring-2 ring-sky-500/40' : '') + '">' +
      '<i class="pi ' + icon + ' text-xs"></i><span class="font-mono font-black text-xs">' + n + '</span></button>';
    const outdoor = site.outdoor;
    document.getElementById('header-slot').innerHTML =
      '<div class="h-9 flex items-center gap-2 bg-slate-50 dark:bg-[#0b121e] border border-slate-200 dark:border-border-subtle rounded-[2px] px-2.5 shadow-2xs">' +
        '<div class="relative group h-full flex items-center gap-2 px-1 rounded-[2px] text-xs">' +
          '<i class="pi pi-sun text-amber-500 font-bold text-sm"></i>' +
          '<div><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Dış Ortam</span>' +
          '<span class="font-mono font-black text-slate-900 dark:text-slate-100 text-xs leading-tight">' + outdoor[0].val + ' °C</span></div>' +
          '<div class="absolute top-full right-0 mt-1 hidden group-hover:block bg-slate-900 text-slate-100 text-xs p-2 rounded-[2px] shadow-xl border border-slate-700 z-50 min-w-48">' +
            '<table class="w-full text-left text-[11px]"><thead><tr class="border-b border-slate-700 text-slate-400"><th class="py-1">Parametre</th><th class="py-1 text-right">Değer</th></tr></thead><tbody>' +
            outdoor.map(o => '<tr class="border-b border-slate-800"><td class="py-1">' + esc(o.desc) + '</td><td class="py-1 text-right font-bold">' + esc(o.val) + (o.unit ? ' ' + o.unit : '') + '</td></tr>').join('') +
            '</tbody></table></div>' +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="h-full flex items-center gap-2 px-1 rounded-[2px] text-xs">' +
          '<div class="relative w-6 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-6 h-4">' +
            '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 24 6" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" />' +
            '<path d="M 24 6 A 16 16 0 0 1 36 20" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="13" y2="9" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#10b981" /></svg></div>' +
          '<div><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Anlık PUE</span><span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs leading-tight" data-pue>' + site.pue.toFixed(2) + '</span></div>' +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="h-full flex items-center gap-2 px-1 rounded-[2px] text-xs">' +
          '<div class="relative w-6 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-6 h-4">' +
            '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="#0284c7" stroke-width="4" stroke-linecap="round" />' +
            '<path d="M 20 4 A 16 16 0 0 1 36 20" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="11" y2="11" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#0284c7" /></svg></div>' +
          '<div><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Anlık CUE</span><span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs leading-tight">' + site.cue.toFixed(2) + '</span></div>' +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="flex items-center gap-1.5">' +
          btn('alarm', nA, 'pi-exclamation-circle', 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/25 scada-btn-alarm-pulse', 'bg-transparent text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 border-transparent', 'Aktif alarmlar') +
          btn('warning', nW, 'pi-exclamation-triangle', 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/25 scada-btn-warning-pulse', 'bg-transparent text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 border-transparent', 'Aktif uyarılar') +
          btn('lost', nL, 'pi-question-circle', 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40 hover:bg-orange-500/25 scada-btn-loss-pulse', 'bg-transparent text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 border-transparent', 'İletişim kayıpları') +
          '<button type="button" data-tickets title="Destek Talepleri: ' + site.tickets.newTickets + ' Yeni Ticket ve ' + site.tickets.newMessages + ' Yeni Mesaj" class="h-7.5 px-2.5 rounded-[2px] border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ' +
            (tickets > 0 ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/25 scada-btn-ticket-pulse' : 'bg-transparent text-slate-400 border-transparent') + '"><i class="pi pi-envelope text-xs"></i><span class="font-mono font-black text-xs">' + tickets + '</span></button>' +
        '</div>' +
      '</div>' +
      '<div data-report-hide class="h-9 inline-flex items-center bg-slate-50 dark:bg-[#0b121e] border border-slate-200 dark:border-border-subtle rounded-[2px] p-0.5 shadow-2xs gap-0.5">' +
        '<button type="button" data-zoom="in" title="Yakınlaştır" class="h-8 w-8 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-plus text-xs"></i></button>' +
        '<button type="button" data-zoom="out" title="Uzaklaştır" class="h-8 w-8 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-minus text-xs"></i></button>' +
        '<div class="w-[1px] h-5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>' +
        '<button type="button" data-fit title="Ekrana Sığdır" class="h-8 px-3 flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-arrows-alt text-xs"></i><span>Ekrana Sığdır</span></button>' +
      '</div>' +
      '<div data-report-hide class="h-9 inline-flex items-center bg-slate-50 dark:bg-[#0b121e] p-0.5 rounded-[2px] border border-slate-200 dark:border-border-subtle shadow-2xs gap-0.5">' +
        '<button type="button" class="h-8 px-3 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center justify-center bg-sky-600 text-white">2D</button>' +
        '<a href="3d.html" class="h-8 px-3 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">3D</a>' +
        '<div class="w-[1px] h-5 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>' +
        '<button type="button" data-refresh title="Yenile" class="h-8 w-8 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 hover:text-sky-600 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-refresh text-sm"></i></button>' +
      '</div>';

    const slot = document.getElementById('header-slot');
    slot.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => openLevelList(b.getAttribute('data-level'))));
    slot.querySelector('[data-tickets]').addEventListener('click', () => toast(site.tickets.newTickets + ' yeni destek talebi ve ' + site.tickets.newMessages + ' yeni mesaj var.', 'info', 'Destek Talepleri'));
    slot.querySelector('[data-zoom="in"]').addEventListener('click', zoomIn);
    slot.querySelector('[data-zoom="out"]').addEventListener('click', zoomOut);
    slot.querySelector('[data-fit]').addEventListener('click', resetView);
    slot.querySelector('[data-refresh]').addEventListener('click', e => {
      const i = e.currentTarget.querySelector('i');
      i.className = 'pi pi-spin pi-spinner text-sm';
      setTimeout(() => { i.className = 'pi pi-refresh text-sm'; jitter(); toast('Kroki telemetrisi CMR/T00 · CMR/T01 kaynaklarından yenilendi.', 'success'); }, 600);
    });
  }

  function renderLegend() {
    const el = document.getElementById('legend');
    const chip = (color, label) => '<div class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-[2px]" style="background:' + color + '"></span><span>' + label + '</span></div>';
    if (state.mode === 'temp_map') {
      el.innerHTML = '<span class="font-bold text-slate-500 dark:text-slate-400">Sıcaklık (Alt):</span>' +
        [['#7bccc4', '<21'], ['#61bb61', '21–23'], ['#ffeda0', '23–25'], ['#fed976', '25–27'], ['#fd8d3c', '27–30'], ['#f03b20', '30–32'], ['#bd0026', '≥32']].map(c => chip(c[0], c[1] + '°')).join('');
    } else {
      el.innerHTML = chip('var(--schema-status-normal)', 'Normal') + chip('var(--schema-status-warning)', 'Uyarı') + chip('var(--schema-status-alarm)', 'Alarm') + chip('var(--schema-status-lost)', 'Veri Alınamıyor') + chip('#868686', 'Filtre dışı');
    }
  }

  // ---------------------------------------------------------------------------
  // Sol Panel
  // ---------------------------------------------------------------------------
  const PODS = ['NS2', 'POD-10', 'POD-9', 'POD-8', 'POD-7', 'POD-6', 'NS1', 'POD-1', 'POD-2', 'POD-3', 'POD-4', 'POD-5'];
  const STATUS_COLOR = { alarm: '#f43f5e', warning: '#f59e0b', lost: '#f97316' };
  const worst = list => ['alarm', 'lost', 'warning'].find(s => list.some(c => c.status === s)) || null;
  function treeNodes() {
    const pods = PODS.map(p => {
      const cabs = D.cabinets.filter(c => c.pod === p);
      const w = worst(cabs);
      return {
        id: 'pod:' + p, name: p + ' (' + cabs.length + ' kabin)', type: 'pod', status: w ? { alarm: 'ALARM', warning: 'UYARI', lost: 'KAYIP' }[w] : '', statusColor: STATUS_COLOR[w],
        children: cabs.slice().sort((a, b) => a.code.localeCompare(b.code)).map(c => ({ id: 'cab:' + c.code, name: c.code, type: 'cabinet', status: c.status !== 'normal' ? { alarm: 'ALARM', warning: 'UYARI', lost: 'KAYIP' }[c.status] : '', statusColor: STATUS_COLOR[c.status] }))
      };
    });
    const eq = [
      { id: 'grp:climate', name: 'Hassas Klimalar (' + D.climates.length + ')', type: 'salon', children: D.climates.map(e => ({ id: 'eq:' + e.id, name: e.label, type: 'climate', status: e.status !== 'normal' ? e.status.toUpperCase().replace('LOST', 'KAYIP').replace('WARNING', 'UYARI') : '', statusColor: STATUS_COLOR[e.status] })) },
      { id: 'grp:ups', name: 'UPS Sistemleri (' + D.ups.length + ')', type: 'salon', children: D.ups.map(e => ({ id: 'eq:' + e.id, name: e.label, type: 'pdu', status: e.status !== 'normal' ? e.status.toUpperCase().replace('LOST', 'KAYIP').replace('WARNING', 'UYARI') : '', statusColor: STATUS_COLOR[e.status] })) }
    ];
    return [{ id: 'tt', name: 'Türk Telekom', type: 'company', children: [{ id: 'ank', name: 'Ankara', type: 'city', children: [{ id: 'umk', name: 'Veri Merkezi', type: 'dc', children: [{ id: 'k1', name: '1. Kat', type: 'floor', children: [{ id: 's1', name: 'Salon 1 Sistem Odası', type: 'salon', children: pods.concat(eq) }] }] }] }] }];
  }
  const NODE_ICON = { company: 'pi pi-globe text-sky-500', city: 'pi pi-map-marker text-sky-500', dc: 'pi pi-building text-sky-500', floor: 'pi pi-clone text-sky-500', salon: 'pi pi-th-large text-sky-500', pod: 'pi pi-server text-sky-500', cabinet: 'pi pi-box text-sky-500', pdu: 'pi pi-bolt text-amber-500', climate: 'pi pi-sun text-emerald-500' };
  function treeHtml(nodes) {
    return '<div class="space-y-1 text-xs select-none">' + nodes.map(n => {
      const hasKids = n.children && n.children.length;
      const open = state.treeExpanded[n.id];
      const sel = n.id === state.treeSelected;
      return '<div><div data-node="' + esc(n.id) + '" class="flex items-center gap-1.5 px-2 py-1 rounded-[2px] cursor-pointer transition-colors justify-between ' +
        (sel ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300') + '">' +
        '<div class="flex items-center gap-1.5 min-w-0 flex-1">' +
          (hasKids ? '<button type="button" data-toggle="' + esc(n.id) + '" class="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"><i class="' + (open ? 'pi pi-chevron-down' : 'pi pi-chevron-right') + ' text-[9px]"></i></button>' : '<span class="w-4 shrink-0"></span>') +
          '<i class="' + (NODE_ICON[n.type] || 'pi pi-folder text-sky-500') + ' text-xs shrink-0"></i><span class="truncate flex-1 font-medium">' + esc(n.name) + '</span>' +
        '</div>' +
        (n.status ? '<div class="flex items-center gap-1 shrink-0 ml-1"><span class="w-1.5 h-1.5 rounded-full" style="background-color:' + (n.statusColor || '#868686') + '"></span><span class="text-[8px] font-extrabold uppercase" style="color:' + (n.statusColor || '#868686') + '">' + n.status + '</span></div>' : '') +
      '</div>' +
      (hasKids && open ? '<div class="pl-3.5 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">' + treeHtml(n.children) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function toggleRow(key, label, checked, color) {
    return '<div class="flex items-center justify-between gap-2 p-1.5 px-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">' +
      '<span class="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-medium"><i class="w-2 h-2 rounded-[1px] ' + color + ' inline-block shrink-0"></i><span>' + label + '</span></span>' +
      '<label class="relative inline-flex items-center cursor-pointer select-none"><input type="checkbox" data-toggle-key="' + key + '"' + (checked ? ' checked' : '') + ' class="sr-only peer" />' +
      '<div class="w-7 h-4 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div></label></div>';
  }
  function modeBtn(mode, icon, label) {
    const on = state.mode === mode;
    return '<button type="button" data-mode="' + mode + '" class="p-1.5 rounded-[2px] border flex items-center gap-1.5 transition-all cursor-pointer text-left ' +
      (on ? 'bg-brand-600/15 border-brand-500/60 text-brand-600 dark:text-brand-400 font-bold shadow-2xs' : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700') +
      '"><i class="pi ' + icon + ' text-[10px]"></i><span class="truncate">' + label + '</span></button>';
  }
  const MODE_NAME = { default: 'Standart', temp_mid: 'Sıcaklık', temp_map: 'Isı Haritası', humidity: 'Nem' };

  function renderLeftPanel() {
    const panel = document.getElementById('left-panel');
    panel.classList.toggle('hidden', !state.leftOpen);
    document.getElementById('open-left-panel').classList.toggle('hidden', state.leftOpen);
    if (!state.leftOpen) return;
    panel.innerHTML =
      '<div class="space-y-2">' +
        '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">' +
          '<div><div class="text-[9.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[155px]" title="' + esc(D.site.title) + '">' + esc(D.site.title) + '</div>' +
          '<h2 class="text-xs font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5"><i class="pi pi-sitemap text-brand-600 dark:text-brand-400 text-xs"></i><span>Lokasyon Ağacı</span></h2></div>' +
          '<div class="flex items-center gap-1.5"><span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>CANLI</span>' +
          '<button type="button" data-collapse title="Sol paneli kapat" class="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-chevron-left text-xs"></i></button></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-1.5">' +
          '<div class="p-1.5 px-2 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><span class="text-[8.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Öğe Sayısı</span><strong class="text-xs font-mono text-slate-900 dark:text-white block mt-0.5">' + items.length + '</strong></div>' +
          '<div class="p-1.5 px-2 rounded-[2px] bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800"><span class="text-[8.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-bold">Görünüm Modu</span><strong class="text-xs font-mono text-brand-600 dark:text-brand-400 block mt-0.5 truncate">' + MODE_NAME[state.mode] + '</strong></div>' +
        '</div>' +
        '<div><div class="flex items-center justify-between mb-1"><h4 class="text-[9.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><i class="pi pi-building text-[10px] text-brand-500"></i><span>Veri Merkezi Hiyerarşisi</span></h4></div>' +
          '<div data-tree class="max-h-40 overflow-y-auto pr-1 border border-slate-200 dark:border-slate-800/80 rounded-[2px] bg-slate-50/70 dark:bg-slate-900/50 p-1.5 custom-scrollbar">' + treeHtml(treeNodes()) + '</div></div>' +
        '<div class="border-t border-slate-200 dark:border-slate-800 pt-2"><h4 class="text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><i class="pi pi-clone text-[10px]"></i><span>Görünüm Ayarları</span></h4>' +
          '<div class="space-y-1.5">' +
            toggleRow('showAllMap', 'Tüm kat planını göster', state.layers.showAllMap, 'bg-brand-500') +
            toggleRow('showGrids', 'Yükseltilmiş döşeme karoları', state.layers.showGrids, 'bg-brand-400') +
            toggleRow('expandAllLabels', 'Tüm etiketleri göster', state.expandAllLabels, 'bg-brand-500') +
            toggleRow('cabinetDoors', 'Kabin Kapı Durumları', state.filters.cabinetDoors, 'bg-brand-600') +
          '</div></div>' +
        '<div class="border-t border-slate-200 dark:border-slate-800 pt-2"><h4 class="text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><i class="pi pi-eye text-[10px]"></i><span>Görünüm Modu</span></h4>' +
          '<div class="grid grid-cols-2 gap-1 text-[11px]">' + modeBtn('default', 'pi-tag', 'Varsayılan Etiketler') + modeBtn('temp_mid', 'pi-info-circle', 'Sıcaklık Değerleri') + modeBtn('temp_map', 'pi-palette', 'Sıcaklık Isı Haritası') + modeBtn('humidity', 'pi-percentage', 'Nem Değerleri') + '</div></div>' +
        '<div class="border-t border-slate-200 dark:border-slate-800 pt-2"><h4 class="text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><i class="pi pi-filter text-[10px]"></i><span>Alarm renklendirme filtreleri</span></h4>' +
          '<div class="space-y-1.5">' + toggleRow('whiteSpace', 'Beyaz Alan', state.filters.whiteSpace, 'bg-brand-400') + toggleRow('energy', 'Enerji Grubu', state.filters.energy, 'bg-brand-500') + toggleRow('cooling', 'Soğutma', state.filters.cooling, 'bg-brand-300') + '</div></div>' +
      '</div>' +
      '<div class="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 shrink-0">' +
        '<div class="flex items-center justify-between mb-1.5 px-0.5"><span class="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate">' + esc(D.site.title) + '</span></div>' +
        '<div class="w-full h-32 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1 overflow-hidden relative shadow-inner">' +
          '<svg data-minimap class="w-full h-full bg-transparent cursor-pointer" viewBox="' + L.fitViewBox + '" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="' + L.bgPath + '" fill="none" stroke="currentColor" class="text-slate-400 dark:text-slate-600" stroke-width="1.5" />' +
            items.filter(i => statusOf(i) !== 'normal').map(i => '<rect x="' + i.x + '" y="' + i.y + '" width="' + i.w + '" height="' + i.h + '" fill="' + STATUS_FILL[statusOf(i)] + '" />').join('') +
            '<rect data-mm-rect fill="rgba(2, 132, 199, 0.2)" stroke="#0284c7" stroke-width="4" stroke-dasharray="8 4" rx="2" ry="2" />' +
          '</svg>' +
        '</div>' +
      '</div>';

    panel.querySelector('[data-collapse]').addEventListener('click', () => { state.leftOpen = false; renderLeftPanel(); });
    panel.querySelectorAll('[data-toggle-key]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-toggle-key');
      if (k === 'showAllMap' || k === 'showGrids') { state.layers[k] = inp.checked; renderTexts(); }
      else if (k === 'expandAllLabels') { state.expandAllLabels = inp.checked; renderItems(); }
      else { state.filters[k] = inp.checked; renderItems(); }
    }));
    panel.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      state.mode = b.getAttribute('data-mode');
      renderItems(); renderLeftPanel(); renderLegend();
    }));
    const tree = panel.querySelector('[data-tree]');
    tree.addEventListener('click', e => {
      const tg = e.target.closest('[data-toggle]');
      if (tg) { e.stopPropagation(); const id = tg.getAttribute('data-toggle'); state.treeExpanded[id] = !state.treeExpanded[id]; refreshTree(); return; }
      const node = e.target.closest('[data-node]');
      if (node) onTreeSelect(node.getAttribute('data-node'));
    });
    const mm = panel.querySelector('[data-minimap]');
    mm.addEventListener('click', e => {
      const pt = mm.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(mm.getScreenCTM().inverse());
      animateVb({ x: p.x - state.vb.w / 2, y: p.y - state.vb.h / 2, w: state.vb.w, h: state.vb.h });
    });
    renderMinimapRect();
  }

  function refreshTree() {
    const tree = document.querySelector('#left-panel [data-tree]');
    if (!tree) return;
    const st = tree.scrollTop;
    tree.innerHTML = treeHtml(treeNodes());
    tree.scrollTop = st;
  }

  function onTreeSelect(id) {
    state.treeSelected = id;
    if (id.startsWith('pod:')) {
      const pod = id.slice(4);
      state.treeExpanded[id] = true;
      const cabs = D.cabinets.filter(c => c.pod === pod);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      cabs.forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); });
      focusBounds({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 60);
    } else if (id.startsWith('cab:')) {
      const c = D.findCabinet(id.slice(4));
      const it = c && byId[c.id];
      if (it) { focusItem(it); onItemClick(it); }
    } else if (id.startsWith('eq:')) {
      const it = byId[id.slice(3)];
      if (it) { focusItem(it); onItemClick(it); }
    } else {
      state.treeExpanded[id] = true;
      resetView();
    }
    refreshTree();
  }

  function renderMinimapRect() {
    const r = document.querySelector('#left-panel [data-mm-rect]');
    if (!r) return;
    r.setAttribute('x', state.vb.x); r.setAttribute('y', state.vb.y);
    r.setAttribute('width', state.vb.w); r.setAttribute('height', state.vb.h);
  }

  document.getElementById('open-left-panel').addEventListener('click', () => { state.leftOpen = true; renderLeftPanel(); });

  // ---------------------------------------------------------------------------
  // Seviye listesi (alarm / uyarı / kayıp butonları)
  // ---------------------------------------------------------------------------
  function openLevelList(level) {
    const title = { alarm: 'Aktif Alarmlar', warning: 'Aktif Uyarılar', lost: 'İletişim Kayıpları' }[level];
    const list = items.filter(i => statusOf(i) === level);
    const rowCls = { alarm: 'border-rose-500/30 bg-rose-500/10 hover:border-rose-500/60', warning: 'border-amber-500/30 bg-amber-500/10 hover:border-amber-500/60', lost: 'border-orange-500/30 bg-orange-500/10 hover:border-orange-500/60' }[level];
    const kindName = { cabinet: 'Kabin', climate: 'Hassas Klima', ups: 'UPS', panel: 'Pano' };
    const d = dialog({
      title: title,
      subtitle: list.length + ' öğe · Kroki üzerinde vurgulanıyor',
      variant: level === 'alarm' ? 'danger' : 'warning',
      confirmLabel: 'Alarm Listesine Git',
      confirmIcon: 'pi pi-arrow-right',
      cancelLabel: 'Kapat',
      maxWidth: 'max-w-2xl',
      body: '<div class="space-y-1.5">' + list.map(i =>
        '<div data-goto="' + esc(i.id) + '" class="flex items-center justify-between gap-3 p-2.5 rounded-[2px] border ' + rowCls + ' cursor-pointer transition-colors">' +
          '<div class="flex items-center gap-2.5 min-w-0"><span class="w-2.5 h-2.5 rounded-[2px] shrink-0" style="background:' + STATUS_FILL[level] + '"></span>' +
          '<div class="min-w-0"><div class="text-xs font-black text-slate-900 dark:text-slate-100">' + esc(i.label) + ' <span class="text-[10px] font-normal text-slate-500">' + kindName[i.kind] + (i.ref.pod ? ' · ' + i.ref.pod : '') + '</span></div>' +
          '<div class="text-[10px] text-slate-600 dark:text-slate-300 truncate">' + esc(i.ref.note || '-') + '</div></div></div>' +
          '<span class="text-[10px] font-bold text-sky-600 dark:text-sky-400 shrink-0">Krokide Göster →</span>' +
        '</div>').join('') + '</div>',
      onConfirm: () => { window.location.href = 'alarms.html?filter=' + encodeURIComponent({ alarm: 'alarm', warning: 'uyarı', lost: 'kayıp' }[level]); }
    });
    state.highlight = level;
    renderItems();
    renderHeader();
    d.body.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
      const it = byId[el.getAttribute('data-goto')];
      d.close();
      state.highlight = null;
      renderHeader();
      focusItem(it);
      setTimeout(() => onItemClick(it), 400);
    }));
  }

  // ---------------------------------------------------------------------------
  // Ekipman penceresi (ups-table / climate-panel-table)
  // ---------------------------------------------------------------------------
  function openEquipmentModal(it) {
    const e = it.ref;
    const group = { climate: 'Hassas Klima · Soğutma', ups: 'UPS · Enerji Grubu', panel: 'Klima Panosu · Soğutma' }[it.kind];
    const statusText = s => ({ normal: 'NORMAL', warning: 'UYARI', alarm: 'ALARM', lost: 'VERİ ALINAMIYOR' }[s] || s);
    const statusCls = s => ({ normal: 'text-emerald-600 dark:text-emerald-400', warning: 'text-amber-600 dark:text-amber-400', alarm: 'text-rose-600 dark:text-rose-400', lost: 'text-orange-600 dark:text-orange-400' }[s]);
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
    host.innerHTML =
      '<section data-panel class="box-border flex max-h-[calc(100vh-1rem)] w-[min(100vw-1rem,56.25rem)] flex-col overflow-hidden rounded-[2px] border border-slate-200 bg-white shadow-2xl dark:border-border-subtle dark:bg-surface-card animate-modal-pop">' +
        '<header class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-border-subtle dark:bg-surface-base">' +
          '<div class="min-w-0"><h2 class="truncate text-sm font-black flex items-center gap-2">' + esc(e.label) + ' ' + DCIM.ui.statusBadge(e.status === 'lost' ? 'kayıp' : e.status) + '</h2><p class="text-[10px] text-slate-500">' + group + ' · ' + esc(e.devId) + '</p></div>' +
          '<div class="flex shrink-0 gap-2">' +
            '<a href="3d.html?focus=' + encodeURIComponent(e.label) + '" class="inline-flex h-8 items-center rounded-[2px] border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-border-subtle dark:bg-surface-card dark:text-slate-200">3D\'de Göster</a>' +
            '<button type="button" data-close class="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-border-subtle dark:bg-surface-card dark:text-slate-200"><i class="pi pi-times"></i></button>' +
          '</div>' +
        '</header>' +
        (e.note ? '<div class="px-4 pt-3"><div class="p-2 rounded-[2px] border text-xs font-bold flex items-center gap-2 ' + (e.status === 'alarm' ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300') + '"><i class="pi pi-exclamation-triangle"></i>' + esc(e.note) + '</div></div>' : '') +
        '<div class="min-h-0 flex-1 overflow-auto p-4">' +
          '<table class="w-full text-xs"><thead class="text-[10px] uppercase text-slate-500"><tr><th class="pb-2 text-left">Parametre</th><th class="pb-2 text-right">Değer</th><th class="pb-2 text-right">Durum</th></tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
          e.points.map(p => '<tr><td class="py-2 font-semibold">' + esc(p.label) + '</td><td class="py-2 text-right font-mono font-bold text-amber-600">' + esc(p.value) + ' ' + esc(p.unit) + '</td><td class="py-2 text-right text-[10px] font-bold ' + statusCls(p.status) + '">' + statusText(p.status) + '</td></tr>').join('') +
          '</tbody></table>' +
        '</div>' +
      '</section>';
    const close = () => { host.remove(); state.selectedId = null; renderItems(); };
    host.addEventListener('click', ev => { if (!ev.target.closest('[data-panel]')) close(); });
    host.querySelector('[data-close]').addEventListener('click', close);
    document.body.appendChild(host);
  }

  // ---------------------------------------------------------------------------
  // Kabin çekmecesi (cabinet-isometric-drawer)
  // ---------------------------------------------------------------------------
  const drawer = document.getElementById('cabinet-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const dstate = { cab: null, rackMode: 'chassis', viewMode: 'front', tab: 'assets', selectedAsset: null, rack: null };

  function closeDrawer() {
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    if (dstate.rack) dstate.rack.destroy();
    dstate.rack = null;
    dstate.cab = null;
    state.selectedId = null;
    renderItems();
  }
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer(); });

  function lockCard(side, c) {
    const st = side === 'front' ? c.frontDoor : c.rearDoor;
    const lost = c.status === 'lost';
    const s = lost ? 'unknown' : st;
    const src = c.pod.replace('-', '') + '_' + c.code + (side === 'front' ? '_FDOOR' : '_RDOOR');
    return '<div class="p-2.5 rounded-[3px] border transition-colors relative overflow-hidden ' +
      (s === 'open' ? 'border-rose-500/60 bg-rose-50/80 dark:bg-rose-950/30' : s === 'closed' ? 'border-emerald-500/50 bg-emerald-50/60 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60') + '">' +
      '<div class="flex items-center justify-between mb-1"><span class="text-[10px] font-extrabold uppercase text-slate-600 dark:text-slate-300 tracking-wide">' + (side === 'front' ? 'ÖN KİLİT' : 'ARKA KİLİT') + '</span>' +
        '<div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] ' + (s === 'open' ? 'bg-rose-500 text-white' : s === 'closed' ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300') + '"><i class="' + (s === 'open' ? 'pi pi-lock-open' : s === 'closed' ? 'pi pi-lock' : 'pi pi-question') + '"></i></div></div>' +
      '<div class="flex items-baseline gap-1.5"><span class="text-xs font-black tracking-wide uppercase ' + (s === 'open' ? 'text-rose-600 dark:text-rose-400' : s === 'closed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400') + '">' + (s === 'open' ? 'KİLİT AÇIK' : s === 'closed' ? 'KİLİTLİ' : 'BEKLENİYOR') + '</span></div>' +
      '<div class="mt-1 flex items-center justify-between text-[9px] font-mono text-slate-400 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/80 pt-1"><span class="truncate" title="' + src + '">#' + src + '</span><span class="font-sans text-[8.5px] opacity-80">' + (s === 'closed' ? 'Kilitli' : s === 'open' ? 'Açık' : '-') + '</span></div>' +
    '</div>';
  }

  function openDrawer(c) {
    dstate.cab = c;
    dstate.selectedAsset = null;
    dstate.tab = 'assets';
    const anyOpen = c.frontDoor === 'open' || c.rearDoor === 'open';
    drawer.innerHTML =
      '<header class="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/90 flex items-center justify-between gap-3">' +
        '<div class="flex items-center gap-2.5 min-w-0">' +
          '<div class="w-8 h-8 rounded-[3px] bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/30 dark:border-sky-500/40 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(56,189,248,0.15)] dark:shadow-[0_0_12px_rgba(56,189,248,0.25)]"><i class="pi pi-server text-base"></i></div>' +
          '<div class="min-w-0">' +
            '<div class="flex items-center gap-2"><h2 class="text-sm font-black text-slate-900 dark:text-white tracking-wide truncate">' + esc(c.code) + ' <span class="font-semibold text-slate-500 dark:text-slate-400">· ' + esc(c.customer) + '</span></h2>' +
            '<span class="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-[2px] shrink-0">42U RACK</span>' + DCIM.ui.statusBadge(c.status === 'lost' ? 'kayıp' : c.status) + '</div>' +
            '<p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></span><span>Kapak Kilidi &amp; Donanım Gözlemi · 1. Kat · Salon 1 · ' + esc(c.pod) + '</span></p>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<a href="3d.html?cabinet=' + encodeURIComponent(c.code) + '" title="3D Dijital İkizde Göster" class="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-bold text-xs rounded-[2px] transition-all flex items-center gap-1.5 cursor-pointer"><i class="pi pi-box text-xs"></i><span class="hidden sm:inline">3D\'de Göster</span></a>' +
          '<a href="locks.html?view=cards&cabinet=' + encodeURIComponent(c.code) + '" title="Kapak Kilitleri Monitörü" class="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-[2px] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"><span class="hidden sm:inline">Kilit Monitörü</span><i class="pi pi-arrow-up-right text-xs"></i></a>' +
          '<button type="button" data-close title="Kapat" class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-times text-sm"></i></button>' +
        '</div>' +
      '</header>' +
      '<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5 bg-slate-50 dark:bg-[#0b1320]">' +
        '<div class="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-start">' +
          '<div class="md:col-span-6 lg:col-span-5 space-y-3">' +
            '<section class="space-y-1.5">' +
              '<div class="flex items-center justify-between px-0.5"><span class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-shield text-sky-600 dark:text-sky-400 text-xs"></i><span>Elektronik Kilit Sistemi</span></span><span class="text-[9px] font-mono text-slate-400 dark:text-slate-500">' + fmtTime(new Date()) + '</span></div>' +
              (anyOpen ? '<div class="p-2 rounded-[3px] bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2 shadow-[0_0_12px_rgba(244,63,94,0.15)] dark:shadow-[0_0_12px_rgba(244,63,94,0.2)]"><i class="pi pi-exclamation-triangle text-base text-rose-500 shrink-0"></i><span class="truncate">DİKKAT: Kabin kapısı açık!' + (c.lockAlarm ? ' — ' + esc(c.lockAlarm) : '') + '</span></div>' : '') +
              '<div class="grid grid-cols-2 gap-2">' + lockCard('front', c) + lockCard('rear', c) + '</div>' +
            '</section>' +
            '<section class="space-y-1.5">' +
              '<div class="flex items-center justify-between px-0.5">' +
                '<div class="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800/80 p-0.5 rounded-[3px] border border-slate-300 dark:border-slate-700" data-rack-mode></div>' +
                '<span class="text-[9px] font-mono text-slate-500 dark:text-slate-400" data-rack-tag></span>' +
              '</div>' +
              '<div data-rack-host></div>' +
            '</section>' +
          '</div>' +
          '<div class="md:col-span-6 lg:col-span-7 space-y-3">' +
            '<div class="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1" data-tabs></div>' +
            '<div data-tab-body></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    drawer.querySelector('[data-close]').addEventListener('click', closeDrawer);
    renderRack();
    renderTabs();
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
  }

  function renderRack() {
    const c = dstate.cab;
    const anyOpen = c.frontDoor === 'open' || c.rearDoor === 'open';
    const modeHost = drawer.querySelector('[data-rack-mode]');
    const mb = (m, icon, label) => '<button type="button" data-rm="' + m + '" class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] transition-all cursor-pointer flex items-center gap-1 ' +
      (dstate.rackMode === m ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white') + '"><i class="pi ' + icon + ' text-[9px]"></i><span>' + label + '</span></button>';
    modeHost.innerHTML = mb('chassis', 'pi-server', 'Kabin İçi (2D)') + mb('isometric3d', 'pi-box', '3D İzometrik');
    drawer.querySelector('[data-rack-tag]').textContent = dstate.rackMode === 'chassis' ? '19" EIA-310 • 42U' : 'CSS 3D • 60 FPS';
    modeHost.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { dstate.rackMode = b.getAttribute('data-rm'); renderRack(); }));
    const rh = drawer.querySelector('[data-rack-host]');
    if (dstate.rack) { dstate.rack.destroy(); dstate.rack = null; }
    if (dstate.rackMode === 'chassis') {
      rh.innerHTML = DCIM.components.chassisHtml(c.assets, dstate.viewMode, anyOpen, dstate.selectedAsset);
      rh.querySelectorAll('[data-chassis-view]').forEach(b => b.addEventListener('click', () => { dstate.viewMode = b.getAttribute('data-chassis-view'); renderRack(); }));
      rh.querySelectorAll('[data-slot-asset]').forEach(el => el.addEventListener('click', () => selectAsset(el.getAttribute('data-slot-asset'), true)));
    } else {
      dstate.rack = DCIM.components.createRack3d(rh, {
        name: c.code, frontDoorState: c.frontDoor, rearDoorState: c.rearDoor, assets: c.assets, heightPx: 520,
        onAssetClick: a => selectAsset(a.id, true)
      });
    }
  }

  function selectAsset(id, openDetail) {
    dstate.selectedAsset = id;
    const a = dstate.cab.assets.find(x => x.id === id);
    if (dstate.rackMode === 'chassis') renderRack();
    renderTabs();
    if (openDetail && a) DCIM.components.assetDetail(a, dstate.cab.code);
  }

  function renderTabs() {
    const c = dstate.cab;
    const tabs = drawer.querySelector('[data-tabs]');
    const tb = (t, icon, label) => '<button type="button" data-tab="' + t + '" class="px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 ' +
      (dstate.tab === t ? 'bg-sky-500/10 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 dark:border-sky-500/40' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200') + '"><i class="pi ' + icon + ' text-xs"></i><span>' + label + '</span></button>';
    const alarms = D.activeAlarms.filter(a => a.target === c.code);
    tabs.innerHTML = tb('assets', 'pi-list', 'Kabin Varlıkları (' + c.assets.length + ')') + tb('telemetry', 'pi-wave-pulse', 'Ortam & Telemetri') + tb('alarms', 'pi-bell', 'Alarmlar (' + alarms.length + ')');
    tabs.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { dstate.tab = b.getAttribute('data-tab'); renderTabs(); }));
    const body = drawer.querySelector('[data-tab-body]');
    const pct = Math.round((c.usedU / 42) * 100);
    if (dstate.tab === 'assets') {
      body.innerHTML = '<div class="space-y-2.5">' +
        '<div class="p-2.5 rounded-[3px] bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 shadow-2xs">' +
          '<div class="flex items-center justify-between text-[11px]"><span class="text-slate-500 dark:text-slate-400 font-bold">42U Doluluk Oranı</span><span class="font-mono font-bold text-slate-800 dark:text-white">' + c.usedU + ' / 42 U (%' + pct + ')</span></div>' +
          '<div class="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all duration-300" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="space-y-1.5 max-h-[520px] overflow-y-auto custom-scrollbar pr-0.5">' +
        c.assets.slice().sort((a, b) => b.startU - a.startU).map(a =>
          '<div data-asset-row="' + esc(a.id) + '" class="p-2.5 rounded-[3px] border bg-white dark:bg-slate-950/60 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2 text-xs group cursor-pointer shadow-2xs ' + (dstate.selectedAsset === a.id ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/30' : 'border-slate-200 dark:border-slate-800/80') + '">' +
            '<div class="flex items-center gap-2.5 min-w-0"><span class="font-mono text-[9.5px] font-bold px-1.5 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">U' + a.startU + (a.uSize > 1 ? '-U' + (a.startU + a.uSize - 1) : '') + '</span>' +
              '<div class="min-w-0 flex-1"><div class="font-bold text-slate-800 dark:text-slate-200 truncate hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors text-xs cursor-pointer flex items-center gap-1.5"><span>' + esc(a.displayName) + '</span><i class="pi pi-external-link text-[8.5px] text-sky-500 opacity-60 hover:opacity-100"></i></div>' +
              '<div class="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate mt-0.5"><span class="font-semibold text-sky-600 dark:text-sky-400 truncate max-w-[140px]">' + esc(a.hostname) + ' •</span><span>' + esc(a.assetType) + '</span>' + (a.primaryIP ? '<span class="font-mono text-slate-500 dark:text-slate-400">• ' + esc(a.primaryIP) + '</span>' : '') + '</div></div></div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
              (a.uSize > 1 ? '<span class="text-[9.5px] font-mono text-amber-600 dark:text-amber-400 font-bold px-1 py-0.5 rounded-[2px] bg-amber-500/10">' + a.uSize + 'U</span>' : '') +
              '<span class="text-[8.5px] font-bold px-1.5 py-0.5 rounded-[2px] uppercase ' + (a.customerType === 'internal' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30') + '">' + (a.customerType === 'internal' ? 'Dahili' : 'Harici') + '</span>' +
              '<span class="px-2 py-0.5 text-[9px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/15 rounded-[2px] border border-sky-500/30 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"><i class="pi pi-info-circle text-[8.5px]"></i><span>Detay</span></span>' +
            '</div>' +
          '</div>').join('') +
        '</div></div>';
      body.querySelectorAll('[data-asset-row]').forEach(el => el.addEventListener('click', () => selectAsset(el.getAttribute('data-asset-row'), true)));
    } else if (dstate.tab === 'telemetry') {
      const lost = c.status === 'lost';
      const box = (label, value, cls) => '<div class="p-2.5 rounded-[3px] bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-2xs"><span class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">' + label + '</span><span class="text-xs font-mono font-bold ' + (cls || 'text-slate-800 dark:text-slate-100') + '">' + (lost ? '-' : value) + '</span></div>';
      const tCls = t => (t >= 30 ? 'text-rose-600 dark:text-rose-400' : t >= 27 ? 'text-amber-600 dark:text-amber-400' : t < 18 ? 'text-sky-600 dark:text-sky-400' : '');
      const weight = c.assets.reduce((s, a) => s + a.weight, 0) + 115;
      body.innerHTML = '<div class="space-y-2.5">' +
        '<div class="grid grid-cols-2 gap-2">' +
          box('Üst Sıcaklık:', c.tempTop.toFixed(1) + ' °C', tCls(c.tempTop)) + box('Orta Sıcaklık:', c.tempMid.toFixed(1) + ' °C', tCls(c.tempMid)) +
          box('Alt Sıcaklık:', c.tempLow.toFixed(1) + ' °C', tCls(c.tempLow)) + box('Ortam Nemi:', '%' + c.humidity, c.humidity > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-sky-600 dark:text-sky-400') +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2 pt-1">' +
          '<div class="p-2.5 rounded-[3px] bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 shadow-2xs"><div class="text-[9.5px] text-slate-500 font-bold uppercase">Toplam Anlık Güç</div><div class="text-base font-mono font-black text-emerald-600 dark:text-emerald-400 mt-0.5">' + (lost ? '-' : c.powerKw.toFixed(1) + ' kW') + '</div></div>' +
          '<div class="p-2.5 rounded-[3px] bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 shadow-2xs"><div class="text-[9.5px] text-slate-500 font-bold uppercase">Tahmini Ağırlık</div><div class="text-base font-mono font-black text-slate-800 dark:text-slate-200 mt-0.5">' + weight + ' kg</div></div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-2">' +
          box('PDU-A (Besleme A):', c.pduA.toFixed(1) + ' A') +
          box('PDU-B (Besleme B):', c.pduFault ? '0.0 A · FAZ KAYBI' : c.pduB.toFixed(1) + ' A', c.pduFault ? 'text-rose-600 dark:text-rose-400' : '') +
        '</div>' +
        '<div class="p-2.5 rounded-[3px] bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 shadow-2xs text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between"><span>Termal Pay (27 °C limit):</span><span class="font-mono font-bold ' + (27 - c.tempMid < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + (lost ? '-' : (27 - c.tempMid).toFixed(1) + ' °C') + '</span></div>' +
      '</div>';
    } else {
      body.innerHTML = alarms.length === 0
        ? '<div class="p-8 flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 text-xs"><i class="pi pi-check-circle text-3xl mb-2 text-emerald-500 block"></i><span class="font-medium text-slate-600 dark:text-slate-400">Bu kabine ait aktif alarm bulunmuyor</span></div>'
        : '<div class="space-y-1.5">' + alarms.map(a =>
          '<div class="p-2.5 rounded-[3px] border bg-white dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2">' +
            '<div class="min-w-0"><div class="font-bold text-slate-900 dark:text-slate-100 truncate">' + esc(a.desc) + '</div><div class="text-[10px] text-amber-600 dark:text-amber-400 font-bold truncate">' + esc(a.txt) + '</div>' +
            '<div class="text-[9.5px] font-mono text-slate-500 dark:text-slate-400">' + DCIM.ui.fmtDateTime(a.tim) + '</div></div>' +
            DCIM.ui.statusBadge(a.level === 'lost' ? 'kayıp' : a.level) +
          '</div>').join('') +
          '<a href="alarms.html" class="block text-center text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline pt-1">Tüm aktif alarmlar →</a></div>';
    }
  }

  // ---------------------------------------------------------------------------
  // Canlı veri hissi: 5 sn'de bir küçük sıcaklık dalgalanması
  // ---------------------------------------------------------------------------
  const jrnd = D.rng(98765);
  function jitter() {
    D.cabinets.forEach(c => {
      if (c.status !== 'normal') return;
      const d = (jrnd() - 0.5) * 0.2;
      c.tempLow = Math.round((c.tempLow + d) * 10) / 10;
      c.tempMid = Math.round((c.tempMid + d) * 10) / 10;
      c.tempTop = Math.round((c.tempTop + d) * 10) / 10;
    });
    const pue = document.querySelector('[data-pue]');
    if (pue) pue.textContent = (D.site.pue + (jrnd() - 0.5) * 0.02).toFixed(2);
    if (state.mode !== 'default') renderItems();
    if (dstate.cab && dstate.tab === 'telemetry') renderTabs();
  }
  setInterval(jitter, 5000);

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderHeader();
  renderLeftPanel();
  renderLegend();
  renderTexts();
  renderItems();
  applyVb();

  const params = new URLSearchParams(window.location.search);
  const target = params.get('cabinet');
  const focus = params.get('focus');
  if (target) {
    const c = D.findCabinet(target);
    const it = c && byId[c.id];
    if (it) setTimeout(() => { focusItem(it); onItemClick(it); }, 250);
  } else if (focus) {
    const e = D.findEquipment(focus);
    const it = e && byId[e.id];
    if (it) setTimeout(() => { focusItem(it); onItemClick(it); }, 250);
  }
})();
