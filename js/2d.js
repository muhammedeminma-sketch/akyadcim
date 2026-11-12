/* ==========================================================================
   DCIM Sunum — 2D Dijital İkiz (NewUICMPDigitalTwin2DComponent, 11 Kas 2026)
   - Sol panel: kat / salon ağacı (Türk Telekom › Ankara › Veri Merkezi kilitli açık; 3 kat, 2. katta 2 salon),
     görünüm modu, alarm renklendirme filtreleri, mini harita; daraltılabilir. Başlık "N. Kat M. Salon".
   - Kroki (schematic-viewer): kat yerleşimi (DCIM_FLOOR_LAYOUTS), POD düğmeleri (POD detay penceresi),
     POD koridor ve klima dönüş sıcaklığı hapları, ağ katmanları (Tel Tava / Fiber Runner, varsayılan kapalı),
     arama / POD odak işareti, sağ altta canlı izlenen telemetri noktası kutusu.
   - Tuval üstü: arama ("Kabin, klima, UPS veya POD ara"), Kategori menüsü + kaydırılabilir öğe şeridi
     (orijinalde lg altı; sunumda masaüstünde de), sol üstte Görünüm Ayarları filtresi.
   - Kabin tıklanınca sağda bölünmüş panel (app-cabinet-inline-detail, powerSensorMode): Babylon 3D raf,
     kabin alarmları, PDU + sensörler; raftaki cihaz panel içinde sağdan kayarak açılır.
   - 2D'de Acil kırmızı çizilir (etiket "Acil"). Başlıkta "PDF Raporu" (KPI şeridi + kroki görüntüsü).
   Derin bağlantılar: ?cabinet=1DU06 · ?focus=KLIMA%20109 · ?floor=2 (ya da T02) · ?floor=2&salon=S2 ·
     sessionStorage dt2d_focus_item = {sch, id, devId, label, ts} (3D "2D Krokide Göster")
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtTime, toast } = DCIM.ui;
  const D = DCIM.data;
  const T = DCIM.twin2d;
  DCIM.shell.init({ active: '2d' });

  const svgNS = 'http://www.w3.org/2000/svg';
  const parseVb = s => { const p = String(s).trim().split(/\s+/).map(Number); return { x: p[0], y: p[1], w: p[2], h: p[3] }; };
  const fmtInt = n => Number(n).toLocaleString('tr-TR');

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const state = {
    floorId: 'T00',
    salonId: '',
    vb: null,
    mode: 'default', // default | temp_mid | temp_map | humidity
    layers: { showAllMap: false, showGrids: true, showLivePoints: true },
    expandAllLabels: false,
    filters: { whiteSpace: true, energy: true, cooling: true, cabinetDoors: true },
    hiddenObj: new Set(),
    netOn: new Set(),
    leftOpen: true,
    viewFilterOpen: false,
    meteoOpen: false,
    selectedId: null,
    focusRects: null,
    pinnedFocus: false,
    activeMapId: null,
    mapGroup: 'pod',
    mapGroupMenuOpen: false,
    mapQuery: '',
    mapSearchOpen: false,
    treeExpanded: { 'floor:T02': true }
  };
  let F = null;       // açık katın modeli (DCIM.twin2d.floor)
  let FIT = null;     // katın sığdırma görünümü
  let items = [];
  let byId = {};
  let focusTimer = null;

  // ---------------------------------------------------------------------------
  // Renk / durum kuralları (digital-twin-2d.component.ts)
  // ---------------------------------------------------------------------------
  // 2D ikizde Acil mor çizilmez: alarm kırmızısı, etiket "Acil"
  const STATUS_FILL = {
    normal: 'var(--schema-status-normal)',
    warning: 'var(--schema-status-warning)',
    alarm: 'var(--schema-status-alarm)',
    acil: 'var(--schema-status-alarm)',
    lost: 'var(--schema-status-lost)'
  };
  const STATUS_TEXT = { normal: 'Normal', warning: 'Uyarı', alarm: 'Alarm', acil: 'Acil', lost: 'Veri Alınamıyor' };
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
  // Acil = aktif alarmlarda 'critical' seviyeli alarm kaydı olan hedef
  const acilTargets = new Set(D.activeAlarms.filter(a => a.level === 'alarm' && a.severity === 'critical' && a.target).map(a => a.target.toUpperCase()));
  function statusOf(it) {
    const s = it.ref.status || 'normal';
    if (s === 'alarm' && acilTargets.has(String(it.label).toUpperCase())) return 'acil';
    return s;
  }
  const isAlarmish = s => s === 'alarm' || s === 'acil';
  const OBJ_LAYER = { cabinet: 'kabin', climate: 'klima', panel: 'klima-panosu', ups: 'sdp-ups' };
  const filteredOut = it => !state.filters[it.group];

  // ---------------------------------------------------------------------------
  // Kat modeli → kroki öğeleri
  // ---------------------------------------------------------------------------
  function buildItems() {
    const salonKey = F.salonKey;
    items = []
      .concat(F.cabinets.map(c => ({ kind: 'cabinet', group: 'whiteSpace', ref: c, id: c.id, label: c.code, x: c.x, y: c.y, w: c.w, h: c.h, salon: c.salonId })))
      .concat(F.climates.map(e => ({ kind: 'climate', group: 'cooling', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo, salon: salonKey(e.salon), inRow: e.inRow })))
      .concat(F.panels.map(e => ({ kind: 'panel', group: 'cooling', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo, salon: salonKey(e.salon) })))
      .concat(F.ups.map(e => ({ kind: 'ups', group: 'energy', ref: e, id: e.id, label: e.label, x: e.x, y: e.y, w: e.w, h: e.h, lo: e.lo, salon: salonKey(e.salon) })));
    byId = {};
    items.forEach(i => { byId[i.id] = i; });
    resolveLabelOffsets();
  }

  /** Dışarıdaki etiket (lo) bir öğenin üstüne düşüyorsa öğenin üstüne / altına ya da karşı tarafa alınır */
  function resolveLabelOffsets() {
    const boxes = items.map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h, id: i.id }));
    const hit = (r, id) => boxes.some(b => b.id !== id && b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y);
    items.forEach(it => {
      if (!it.lo || it.kind === 'cabinet') return;
      const w = Math.min(String(it.label).length * 14 * 0.62 + 6, Math.max(it.w * 2.2, 74)), h = 28;
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      const cands = [it.lo, [0, -(it.h / 2 + h / 2 + 4)], [0, it.h / 2 + h / 2 + 4], [-it.lo[0], it.lo[1]], [it.lo[0], -it.lo[1]]];
      it.lo = cands.find(c => !hit({ x: cx + c[0] - w / 2, y: cy + c[1] - h / 2, w, h }, it.id)) || it.lo;
    });
  }

  // ---------------------------------------------------------------------------
  // Etiket yerleşimi: etiket kutudan taşmaz. Kabin/sıra içi klima etiketi kutu genişliğine sığacak kadar
  // küçültülür; dikey (dar, uzun) kutuda iki satıra bölmek daha büyük yazı veriyorsa iki satır kullanılır
  // ("1DA" / "01", "32.4" / "°C"). Dışarıdaki etiketler (UPS, pano, duvar klimaları) makul genişliğe sığdırılır.
  // "Etiketleri genişlet" açıkken tam boy, tek satır (orijinal davranış).
  // ---------------------------------------------------------------------------
  function splitLabel(t) {
    const s = String(t);
    const sp = s.indexOf(' ');
    if (sp > 0) {
      let best = sp, mid = s.length / 2;
      for (let i = 0; i < s.length; i++) if (s[i] === ' ' && Math.abs(i - mid) < Math.abs(best - mid)) best = i;
      return [s.slice(0, best), s.slice(best + 1)];
    }
    const m = s.match(/^(\d[A-ZÇĞİÖŞÜ]+)(\d+)$/);
    return m ? [m[1], m[2]] : null;
  }
  function fitLabel(text, it, base) {
    const t = String(text == null ? '' : text);
    if (state.expandAllLabels) return { lines: [t], fs: base };
    const inside = it.kind === 'cabinet' || !it.lo;
    const availW = inside ? it.w - 6 : Math.max(it.w * 2.2, 74) - 6;
    const availH = inside ? it.h - 4 : 999;
    const one = Math.min(base, availW / Math.max(1, t.length * 0.62), availH / 1.6);
    let res = { lines: [t], fs: one };
    if (inside && it.h > it.w * 1.15) {
      const parts = splitLabel(t);
      if (parts) {
        const maxLen = Math.max(parts[0].length, parts[1].length);
        const fs2 = Math.min(base, availW / (maxLen * 0.62), availH / (parts.length * 1.25 + 0.3));
        if (fs2 > one * 1.12) res = { lines: parts, fs: fs2 };
      }
    }
    res.fs = Math.max(5.5, Math.round(res.fs * 10) / 10);
    return res;
  }
  function labelPos(it) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    if (it.kind === 'cabinet' || !it.lo) return { x: cx, y: cy };
    return { x: cx + it.lo[0], y: cy + it.lo[1] };
  }
  function labelSvg(text, it, base, pos) {
    const f = fitLabel(text, it, base);
    const n = f.lines.length;
    const maxLen = Math.max.apply(null, f.lines.map(l => l.length));
    const w = Math.max(16, maxLen * f.fs * 0.62 + 6);
    const lh = f.fs * 1.2;
    const h = n === 1 ? Math.min(f.fs * 2, it.kind === 'cabinet' || !it.lo ? Math.max(f.fs * 1.4, it.h - 2) : f.fs * 2) : n * lh + f.fs * 0.45;
    let s = '<g pointer-events="none"><rect class="dt-label-plate" x="' + (pos.x - w / 2) + '" y="' + (pos.y - h / 2) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(6, h / 3) + '" />';
    f.lines.forEach((ln, i) => {
      s += '<text class="dt-label-text schematic-label font-sans select-none" x="' + pos.x + '" y="' + (pos.y + (i - (n - 1) / 2) * lh) + '" text-anchor="middle" dominant-baseline="central" font-size="' + f.fs + '">' + esc(ln) + '</text>';
    });
    return s + '</g>';
  }

  function visual(it) {
    const st = statusOf(it);
    const stale = st === 'lost';
    if (filteredOut(it)) return { fill: '#868686', label: it.label, blink: '' };
    let fill = STATUS_FILL[st] || STATUS_FILL.normal;
    let label = it.label;
    if (it.kind === 'cabinet' && state.mode !== 'default') {
      const c = it.ref;
      if (state.mode === 'temp_mid') label = stale ? '-' : c.tempLow.toFixed(1) + ' °C';
      else if (state.mode === 'temp_map') { label = stale ? '-' : c.tempLow.toFixed(1) + ' °C'; fill = tempColor(c.tempLow, stale); }
      else if (state.mode === 'humidity') label = stale ? '-' : '%' + c.humidity;
    }
    let blink = '';
    if (state.mode !== 'temp_map' || it.kind !== 'cabinet') {
      if (isAlarmish(st)) blink = 'scada-blink-alarm';
      else if (st === 'warning') blink = 'scada-blink-warning';
      else if (st === 'lost') blink = 'scada-blink-lost';
    }
    return { fill, label, blink };
  }

  // ---------------------------------------------------------------------------
  // Şematik SVG (schematic-viewer.component.html)
  // ---------------------------------------------------------------------------
  const host = document.getElementById('schematic-host');
  host.innerHTML =
    '<svg id="schematic-svg" class="schematic-canvas w-full h-full block select-none cursor-grab active:cursor-grabbing touch-none bg-slate-50 dark:bg-surface-base" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><pattern id="grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="transparent" /><path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--schema-grid)" stroke-width="1" /></pattern></defs>' +
      '<rect data-grid x="-10000" y="-10000" width="30000" height="30000" fill="url(#grid)" class="pointer-events-none" />' +
      '<g class="dxf-background-layer pointer-events-none"><path data-bg d="" fill="none" stroke="var(--schema-text-muted)" stroke-width="1.2" /></g>' +
      '<g data-layer1-rects></g>' +
      '<g data-texts></g>' +
      '<g data-items></g>' +
      '<g data-pills class="pointer-events-none"></g>' +
      '<g data-network></g>' +
      '<g data-focus pointer-events="none"></g>' +
    '</svg>';
  const svg = document.getElementById('schematic-svg');
  const G = sel => svg.querySelector(sel);

  function renderStatic() {
    const L = F.layout;
    const bgOn = !state.hiddenObj.has('kapi-duvar');
    G('[data-bg]').setAttribute('d', L.bgPath);
    G('.dxf-background-layer').style.display = bgOn ? '' : 'none';
    const l1 = G('[data-layer1-rects]');
    l1.innerHTML = state.layers.showAllMap && bgOn ? (L.layer1Rects || []).map(r =>
      '<g id="' + esc(r.id) + '"><rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" fill="rgba(148, 163, 184, 0.08)" stroke="var(--schema-text-muted)" stroke-width="1.2">' +
      (r.text ? '<title>' + esc(r.text) + '</title>' : '') + '</rect></g>').join('') : '';
    renderTexts();
    G('[data-grid]').style.display = state.layers.showGrids ? '' : 'none';
  }

  const isPodText = t => /^(POD|NW)-\d+$/.test(t);
  function podButtonRect(t) {
    const fs = 15;
    const w = Math.max(20, t.length * fs * 0.62 + 8) + 8;
    return { w, h: fs * 2.2, fs };
  }
  function renderTexts() {
    const metinOn = !state.hiddenObj.has('metin');
    G('[data-texts]').innerHTML = !metinOn ? '' : F.layout.texts
      .filter(t => state.layers.showAllMap || isPodText(t.text))
      .map(t => {
        if (isPodText(t.text)) {
          const r = podButtonRect(t.text);
          return '<g class="pod-button" data-pod="' + esc(t.text) + '"><title>' + esc(t.text) + ' · POD detayı</title>' +
            '<rect class="pod-button-bg" x="' + (t.x - r.w / 2) + '" y="' + (t.y - r.h / 2) + '" width="' + r.w + '" height="' + r.h + '" rx="5" ry="5" />' +
            '<text x="' + t.x + '" y="' + t.y + '" text-anchor="middle" dominant-baseline="central" class="fill-slate-900 dark:fill-slate-100 font-sans font-bold select-none pointer-events-none" style="font-size:15px">' + esc(t.text) + '</text></g>';
        }
        return '<text x="' + t.x + '" y="' + t.y + '" text-anchor="middle" dominant-baseline="central" class="fill-slate-900 dark:fill-slate-100 font-sans font-bold select-none pointer-events-none" style="font-size:11px">' + esc(t.text) + '</text>';
      }).join('');
    renderPills();
  }

  function itemSvg(it) {
    const v = visual(it);
    const st = statusOf(it);
    const sel = state.selectedId === it.id;
    const base = it.kind === 'cabinet' ? 15 : 14;
    const title = it.label + (st !== 'normal' ? ' — ' + STATUS_TEXT[st] : '') + (it.ref.note ? ' · ' + it.ref.note : '');
    let s = '<g class="schematic-item' + (sel ? ' is-selected' : '') + '" data-item="' + esc(it.id) + '">' +
      '<rect class="item-body ' + v.blink + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="' + v.fill + '" stroke="#797979" stroke-width="1" rx="2" ry="2"><title>' + esc(title) + '</title></rect>';
    if (v.blink === 'scada-blink-alarm' || v.blink === 'scada-blink-warning') {
      s += '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.h + '" fill="none" rx="2" ry="2" pointer-events="none" class="' + (v.blink === 'scada-blink-alarm' ? 'scada-pulse-radar-alarm' : 'scada-pulse-radar-warning') + '"></rect>';
    }
    if (it.kind === 'cabinet' && state.filters.cabinetDoors && (it.ref.frontDoor === 'open' || it.ref.rearDoor === 'open')) {
      const k = Math.min(1, it.w / 44);
      s += '<g pointer-events="none" transform="translate(' + (it.x + it.w - 8 * k) + ' ' + (it.y + 8 * k) + ') scale(' + k + ')"><svg x="-11" y="-11" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
        '<path d="M8 9V6.5A4.5 4.5 0 0 1 16.7 5" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" /><rect x="5" y="8" width="12" height="10" rx="2" fill="#dc2626" />' +
        '<circle cx="11" cy="12.5" r="1.2" fill="#ffffff" /><path d="M11 13.7V16" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" /></svg><title>Kabin kapısı açık</title></g>';
    }
    if (v.label) s += labelSvg(v.label, it, base, labelPos(it));
    return s + '</g>';
  }
  function renderItems() {
    G('[data-items]').innerHTML = items.filter(it => !state.hiddenObj.has(OBJ_LAYER[it.kind])).map(itemSvg).join('');
  }

  // Tek değerli haplar: POD koridor sıcaklığı (POD düğmesinin sağında) ve klima dönüş sıcaklığı
  const PILL_FS = 13;
  const pillSize = (value, unit) => ({ w: String(value).length * PILL_FS * 0.6 + (unit ? unit.length * PILL_FS * 0.5 + 3 : 0) + 16, h: PILL_FS + 9 });
  function pillSvg(x0, yc, value, unit, status, title) {
    const fs = PILL_FS;
    const sz = pillSize(value, unit);
    return '<g><title>' + esc(title) + '</title><rect class="dt-pill-bg" x="' + x0 + '" y="' + (yc - sz.h / 2) + '" width="' + sz.w + '" height="' + sz.h + '" rx="' + sz.h / 2 + '" />' +
      '<text x="' + (x0 + 8) + '" y="' + yc + '" dominant-baseline="central" class="font-sans" style="font-size:' + fs + 'px;font-weight:800"><tspan class="dt-pill-' + status + '">' + esc(value) + '</tspan>' +
      (unit ? '<tspan class="dt-pill-unit" dx="3" style="font-size:' + Math.round(fs * 0.75) + 'px;font-weight:700">' + esc(unit) + '</tspan>' : '') + '</text></g>';
  }
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  /** Hap yerleşimi: adaylardan öğelere, etiketlere ve diğer haplara çakışmayan ilki (smart label gibi) */
  function placePill(cands, sz, occupied) {
    const rectOf = c => ({ x: c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - sz.w : c.x - sz.w / 2, y: c.y - sz.h / 2, w: sz.w, h: sz.h });
    let pick = rectOf(cands[0]);
    for (const c of cands) {
      const r = rectOf(c);
      if (!occupied.some(o => overlaps(o, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }))) { pick = r; break; }
    }
    occupied.push(pick);
    return pick;
  }
  function renderPills() {
    const host = G('[data-pills]');
    if (state.hiddenObj.has('metin')) { host.innerHTML = ''; return; }
    // Dolu alanlar: öğe gövdeleri, dışarıdaki etiket plakaları, POD düğmeleri
    const occupied = items.map(i => ({ x: i.x, y: i.y, w: i.w, h: i.h }));
    items.forEach(i => {
      if (!i.lo) return;
      const lp = labelPos(i);
      const f = fitLabel(i.label, i, 14);
      const w = Math.max.apply(null, f.lines.map(l => l.length)) * f.fs * 0.62 + 6;
      occupied.push({ x: lp.x - w / 2, y: lp.y - f.fs, w, h: f.fs * 2 });
    });
    F.pods.forEach(p => { const r = podButtonRect(p.name); occupied.push({ x: p.x - r.w / 2, y: p.y - r.h / 2, w: r.w, h: r.h }); });
    let s = '';
    F.pods.forEach(p => {
      if (!p.cabinets.length) return;
      const r = podButtonRect(p.name);
      const v = p.temp.toFixed(1), sz = pillSize(v, '°C');
      const at = placePill([
        { x: p.x + r.w / 2 + 6, y: p.y, anchor: 'start' }, { x: p.x - r.w / 2 - 6, y: p.y, anchor: 'end' },
        { x: p.x, y: p.y + r.h / 2 + sz.h / 2 + 4 }, { x: p.x, y: p.y - r.h / 2 - sz.h / 2 - 4 },
        // Dar koridorlu (dikey sıralı) POD'da hap bloğun üstüne / altına
        { x: p.box.cx, y: p.box.y - sz.h / 2 - 5 }, { x: p.box.cx, y: p.box.y1 + sz.h / 2 + 5 }
      ], sz, occupied);
      s += pillSvg(at.x, at.y + sz.h / 2, v, '°C', p.tempStatus, p.name + ' koridor sıcaklığı');
    });
    if (!state.hiddenObj.has('klima')) {
      F.climates.forEach(c => {
        if (c.returnTemp == null) return;
        const it = byId[c.id];
        if (!it) return;
        const lp = labelPos(it);
        const st = c.status === 'lost' ? 'lost' : c.returnTemp > 28 ? 'warning' : 'normal';
        const v = c.returnTemp.toFixed(1), sz = pillSize(v, '°C');
        const f = fitLabel(it.label, it, 14);
        const lw = Math.max.apply(null, f.lines.map(l => l.length)) * f.fs * 0.62 + 6;
        const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
        const cands = it.lo
          ? [{ x: lp.x, y: lp.y + f.fs + sz.h / 2 + 3 }, { x: lp.x + lw / 2 + 4, y: lp.y, anchor: 'start' }, { x: lp.x - lw / 2 - 4, y: lp.y, anchor: 'end' }, { x: lp.x, y: lp.y - f.fs - sz.h / 2 - 3 }]
          : [{ x: cx, y: it.y - sz.h / 2 - 3 }, { x: cx, y: it.y + it.h + sz.h / 2 + 3 }, { x: it.x + it.w + 4, y: cy, anchor: 'start' }, { x: it.x - 4, y: cy, anchor: 'end' }];
        const at = placePill(cands, sz, occupied);
        s += pillSvg(at.x, at.y + sz.h / 2, v, '°C', st, c.label + ' dönüş sıcaklığı');
      });
    }
    host.innerHTML = s;
  }

  // Ağ katmanları: tel tava objelerin, fiber runner tel tavanın üstünde
  function riserArrow(r, s) {
    return r.up
      ? (r.x) + ',' + (r.y - s * 0.55) + ' ' + (r.x - s * 0.5) + ',' + (r.y + s * 0.35) + ' ' + (r.x + s * 0.5) + ',' + (r.y + s * 0.35)
      : (r.x) + ',' + (r.y + s * 0.55) + ' ' + (r.x - s * 0.5) + ',' + (r.y - s * 0.35) + ' ' + (r.x + s * 0.5) + ',' + (r.y - s * 0.35);
  }
  function renderNetwork() {
    G('[data-network]').innerHTML = F.network.filter(n => state.netOn.has(n.id)).map(n => {
      const sw = n.strokeWidth;
      let s = '<g class="network-layer" data-layer="' + n.id + '" style="pointer-events:none">';
      if (n.kind === 'cable-tray') {
        s += '<path d="' + n.d + '" fill="none" stroke="' + n.color + '" stroke-width="' + sw + '" stroke-linecap="square" stroke-opacity="0.55" />' +
          '<path d="' + n.d + '" fill="none" stroke="#ffffff" stroke-width="' + sw * 0.55 + '" stroke-linecap="square" stroke-opacity="0.45" stroke-dasharray="' + sw * 0.15 + ' ' + sw * 0.35 + '" />';
      } else {
        s += '<path d="' + n.d + '" fill="none" stroke="' + n.color + '" stroke-width="' + sw + '" stroke-linecap="square" stroke-opacity="0.85" />';
      }
      n.risers.forEach(r => {
        const rr = sw * 0.9 + 4;
        s += '<g class="network-riser"><title>' + esc(n.name) + ' · ' + (r.up ? 'Üst kata geçiş' : 'Alt kata geçiş') + '</title>' +
          '<circle cx="' + r.x + '" cy="' + r.y + '" r="' + rr + '" fill="#ea580c" stroke="#ffffff" stroke-width="1.5" /><polygon points="' + riserArrow(r, rr) + '" fill="#ffffff" /></g>';
      });
      return s + '</g>';
    }).join('');
  }

  function renderFocus() {
    G('[data-focus]').innerHTML = (state.focusRects || []).map(r =>
      '<rect class="dt-focus-marker" x="' + (r.x - 4) + '" y="' + (r.y - 4) + '" width="' + (r.w + 8) + '" height="' + (r.h + 8) + '" rx="4" fill="rgba(14, 165, 233, 0.16)" stroke="#0ea5e9" stroke-width="2.5" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" />').join('');
  }

  function renderMap() {
    renderStatic();
    renderItems();
    renderNetwork();
    renderFocus();
  }

  // --- ViewBox / pan / zoom ---------------------------------------------------
  function applyVb() {
    const v = state.vb;
    svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
    renderMinimapRect();
  }
  function zoomAt(factor, cx, cy) {
    const nw = Math.max(FIT.w * 0.05, Math.min(FIT.w * 3, state.vb.w * factor));
    const nh = nw * (state.vb.h / state.vb.w);
    state.vb.x = cx - (cx - state.vb.x) * (nw / state.vb.w);
    state.vb.y = cy - (cy - state.vb.y) * (nh / state.vb.h);
    state.vb.w = nw; state.vb.h = nh;
    applyVb();
  }
  const zoomIn = () => zoomAt(0.8, state.vb.x + state.vb.w / 2, state.vb.y + state.vb.h / 2);
  const zoomOut = () => zoomAt(1.25, state.vb.x + state.vb.w / 2, state.vb.y + state.vb.h / 2);
  let anim = null;
  function animateVb(target, instant) {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    if (instant) { state.vb = Object.assign({}, target); applyVb(); return; }
    const from = Object.assign({}, state.vb);
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 380);
      const e = 1 - Math.pow(1 - k, 3);
      ['x', 'y', 'w', 'h'].forEach(p => { state.vb[p] = from[p] + (target[p] - from[p]) * e; });
      applyVb();
      anim = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }
  const resetView = () => animateVb(Object.assign({}, FIT));
  /** Dikdörtgene yakınlaştır (görünüm tuvalin en-boy oranında) */
  function zoomToRect(b, opts) {
    const o = Object.assign({ padding: 0.08, minWidth: 0 }, opts);
    const r = svg.getBoundingClientRect();
    const aspect = r.width && r.height ? r.height / r.width : FIT.h / FIT.w;
    let w = Math.max(b.w * (1 + 2 * o.padding), o.minWidth || 0);
    let h = w * aspect;
    const needH = b.h * (1 + 2 * o.padding);
    if (h < needH) { h = needH; w = h / aspect; }
    animateVb({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h }, o.instant);
  }
  const unionRect = list => {
    const b = T.bbox(list);
    return { x: b.x, y: b.y, w: b.w, h: b.h };
  };

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
  svg.addEventListener('pointerdown', e => {
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    drag = { x: e.clientX, y: e.clientY, vx: state.vb.x, vy: state.vb.y, moved: false };
  });
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
      const pod = e.target.closest('[data-pod]');
      const g = e.target.closest('[data-item]');
      if (pod) openPodDetails(pod.getAttribute('data-pod'));
      else if (g) onItemClick(byId[g.getAttribute('data-item')]);
    }
    drag = null;
  });
  svg.addEventListener('pointerleave', () => { drag = null; });

  function onItemClick(it) {
    if (!it) return;
    if (state.pinnedFocus) { state.pinnedFocus = false; state.focusRects = null; state.activeMapId = null; renderFocus(); renderStrip(); }
    state.selectedId = it.id;
    renderItems();
    if (it.kind === 'cabinet') openCabinetDetail(it.ref);
    else openEquipmentModal(it);
  }

  // ---------------------------------------------------------------------------
  // Başlık telemetri & aksiyon grupları (digital-twin-2d.component.html)
  // ---------------------------------------------------------------------------
  const countWhere = fn => items.filter(i => fn(statusOf(i))).length;
  const counts = () => ({ alarm: countWhere(isAlarmish), warning: countWhere(s => s === 'warning'), lost: countWhere(s => s === 'lost') });

  function renderHeader() {
    const site = D.site;
    const n = counts();
    const tickets = site.tickets.newTickets + site.tickets.newMessages;
    const btn = (key, cnt, icon, on, off, title) =>
      '<button type="button" data-level="' + key + '" title="' + title + ': ' + cnt + ' adet" class="h-7.5 px-2.5 rounded-[2px] border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ' + (cnt > 0 ? on : off) + '">' +
      '<i class="pi ' + icon + ' text-xs"></i><span class="font-mono font-black text-xs">' + cnt + '</span></button>';
    const outdoor = site.outdoor;
    const gauge = (c1, c2, c3, lx, ly) => '<div class="relative w-6 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-6 h-4">' +
      '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="' + c1 + '" fill="none" stroke="' + c2 + '" stroke-width="4" stroke-linecap="round" />' +
      '<path d="' + c3[0] + '" fill="none" stroke="' + c3[1] + '" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="' + lx + '" y2="' + ly + '" stroke="' + c2 + '" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="' + c2 + '" /></svg></div>';
    document.getElementById('header-slot').innerHTML =
      '<div class="h-9 flex items-center gap-2 bg-slate-50 dark:bg-[#0b121e] border border-slate-200 dark:border-border-subtle rounded-[2px] px-2.5 shadow-2xs">' +
        '<div class="relative h-full flex items-center">' +
          '<button type="button" data-meteo aria-expanded="' + state.meteoOpen + '" class="h-full flex items-center gap-2 px-1.5 rounded-[2px] text-xs text-left transition-colors enabled:cursor-pointer enabled:hover:bg-white dark:enabled:hover:bg-slate-800 ' + (state.meteoOpen ? 'bg-white dark:bg-slate-800 ring-1 ring-brand-500/40' : '') + '">' +
            '<i class="pi pi-sun text-amber-500 font-bold text-sm"></i>' +
            '<span><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Dış Ortam</span>' +
            '<span class="font-mono font-black text-slate-900 dark:text-slate-100 text-xs leading-tight">' + outdoor[0].val + ' °C</span></span>' +
            '<i class="pi text-[9px] text-slate-400 opacity-80 ' + (state.meteoOpen ? 'pi-chevron-up' : 'pi-chevron-down') + '"></i>' +
          '</button>' +
          (state.meteoOpen ?
            '<div data-meteo-close class="fixed inset-0 z-40"></div>' +
            '<div class="absolute top-full right-0 mt-1 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs p-2 rounded-[2px] shadow-xl border border-slate-200 dark:border-slate-700 z-50 min-w-48">' +
              '<table class="w-full text-left text-[11px]"><thead><tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"><th class="py-1">Parametre</th><th class="py-1 text-right">Değer</th></tr></thead><tbody>' +
              outdoor.map(o => '<tr class="border-b border-slate-100 dark:border-slate-800 last:border-b-0"><td class="py-1 pr-3 text-slate-600 dark:text-slate-300">' + esc(o.desc) + '</td><td class="py-1 text-right font-bold whitespace-nowrap text-slate-900 dark:text-slate-100">' + esc(o.val) + (o.unit ? ' ' + o.unit : '') + '</td></tr>').join('') +
              '</tbody></table></div>' : '') +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="h-full flex items-center gap-2 px-1 rounded-[2px] text-xs">' +
          gauge('M 4 20 A 16 16 0 0 1 24 6', '#10b981', ['M 24 6 A 16 16 0 0 1 36 20', '#f59e0b'], 13, 9) +
          '<div><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Anlık PUE</span><span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs leading-tight" data-pue>' + site.pue.toFixed(2) + '</span></div>' +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="h-full flex items-center gap-2 px-1 rounded-[2px] text-xs">' +
          gauge('M 4 20 A 16 16 0 0 1 20 4', '#0284c7', ['M 20 4 A 16 16 0 0 1 36 20', '#64748b'], 11, 11) +
          '<div><span class="text-[9.5px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none tracking-tight">Anlık CUE</span><span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs leading-tight">' + site.cue.toFixed(2) + '</span></div>' +
        '</div>' +
        '<div class="h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>' +
        '<div class="flex items-center gap-1.5">' +
          btn('alarm', n.alarm, 'pi-exclamation-circle', 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/40 hover:bg-rose-500/25 scada-btn-alarm-pulse', 'bg-transparent text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 border-transparent', 'Aktif alarmlar') +
          btn('warning', n.warning, 'pi-exclamation-triangle', 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 hover:bg-amber-500/25 scada-btn-warning-pulse', 'bg-transparent text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 border-transparent', 'Aktif uyarılar') +
          btn('lost', n.lost, 'pi-question-circle', 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40 hover:bg-orange-500/25 scada-btn-loss-pulse', 'bg-transparent text-slate-400 hover:text-orange-500 hover:bg-orange-500/10 border-transparent', 'İletişim kayıpları') +
          '<button type="button" data-tickets title="' + site.tickets.newTickets + ' Yeni Ticket ve ' + site.tickets.newMessages + ' Yeni Mesaj" class="h-7.5 px-2.5 rounded-[2px] border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ' +
            (tickets > 0 ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/40 hover:bg-indigo-500/25 scada-btn-ticket-pulse' : 'bg-transparent text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 border-transparent') + '"><i class="pi pi-envelope text-xs"></i><span class="font-mono font-black text-xs">' + tickets + '</span></button>' +
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
    const filterOf = { alarm: 'alarm', warning: 'uyarı', lost: 'kayıp' };
    // Sayaçlar alarm listesini aynı kümeyle açar (orijinal: /dcim/active-alarms?filter=…&floor=…)
    slot.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
      window.location.href = 'alarms.html?filter=' + encodeURIComponent(filterOf[b.getAttribute('data-level')]) + '&floor=' + encodeURIComponent(F.id);
    }));
    slot.querySelector('[data-tickets]').addEventListener('click', () => { window.location.href = 'engineering.html#ticket-management'; });
    slot.querySelector('[data-meteo]').addEventListener('click', e => { e.stopPropagation(); state.meteoOpen = !state.meteoOpen; renderHeader(); });
    const mc = slot.querySelector('[data-meteo-close]');
    if (mc) mc.addEventListener('click', e => { e.stopPropagation(); state.meteoOpen = false; renderHeader(); });
    slot.querySelector('[data-zoom="in"]').addEventListener('click', zoomIn);
    slot.querySelector('[data-zoom="out"]').addEventListener('click', zoomOut);
    slot.querySelector('[data-fit]').addEventListener('click', resetView);
    slot.querySelector('[data-refresh]').addEventListener('click', e => {
      const i = e.currentTarget.querySelector('i');
      i.className = 'pi pi-spin pi-spinner text-sm';
      setTimeout(() => { i.className = 'pi pi-refresh text-sm'; jitter(); toast('Kroki telemetrisi yenilendi (' + F.name + ').', 'success'); }, 600);
    });
  }

  // ---------------------------------------------------------------------------
  // Sol Panel — kat / salon ağacı (app-location-tree), görünüm modu, filtreler, mini harita
  // ---------------------------------------------------------------------------
  const floorModels = () => D.floors.map(f => T.floor(f.id));
  function treeNodes() {
    const floors = floorModels().map(m => ({
      id: 'floor:' + m.id, name: m.name, type: 'floor',
      // Tek salonlu katta salon düğümü gösterilmez (başlık yine "1. Kat 1. Salon")
      children: m.salons.length > 1 ? m.salons.map(s => ({ id: 'salon:' + m.id + ':' + s.id, name: s.name, type: 'salon' })) : []
    }));
    return [{ id: 'tt', name: 'Türk Telekom', type: 'company', locked: true, children: [
      { id: 'ank', name: 'Ankara', type: 'city', locked: true, children: [
        { id: 'dc', name: 'Veri Merkezi', type: 'dc', locked: true, children: floors }] }] }];
  }
  const NODE_ICON = { company: 'pi pi-globe text-sky-500', city: 'pi pi-map-marker text-sky-500', dc: 'pi pi-building text-sky-500', floor: 'pi pi-clone text-sky-500', salon: 'pi pi-th-large text-sky-500' };
  const selectedTreeId = () => (state.salonId ? 'salon:' + F.id + ':' + state.salonId : 'floor:' + F.id);
  function treeHtml(nodes) {
    const selId = selectedTreeId();
    return '<div class="space-y-1 text-xs select-none">' + nodes.map(n => {
      const hasKids = n.children && n.children.length;
      const open = n.locked || state.treeExpanded[n.id];
      const sel = n.id === selId;
      return '<div><div data-node="' + esc(n.id) + '" class="flex items-center gap-1.5 px-2 py-1 rounded-[2px] cursor-pointer transition-colors justify-between ' +
        (sel ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300') + '">' +
        '<div class="flex items-center gap-1.5 min-w-0 flex-1">' +
          (hasKids && !n.locked ? '<button type="button" data-toggle="' + esc(n.id) + '" class="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"><i class="' + (open ? 'pi pi-chevron-down' : 'pi pi-chevron-right') + ' text-[9px]"></i></button>' : '<span class="w-4 shrink-0"></span>') +
          '<i class="' + (NODE_ICON[n.type] || 'pi pi-folder text-sky-500') + ' text-xs shrink-0"></i><span class="truncate flex-1 font-medium">' + esc(n.name) + '</span>' +
        '</div></div>' +
      (hasKids && open ? '<div class="pl-3.5 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">' + treeHtml(n.children) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  /** Sol panel başlığı: "<kat> <salon>"; çok salonlu katta salon seçilmediyse yalnız kat */
  function panelTitle() {
    const salon = state.salonId ? F.salons.find(s => s.id === state.salonId) : (F.salons.length === 1 ? F.salons[0] : null);
    return salon ? F.name + ' ' + salon.name : F.name;
  }

  function toggleSwitch(attr, checked) {
    return '<label class="relative inline-flex items-center cursor-pointer select-none"><input type="checkbox" ' + attr + (checked ? ' checked' : '') + ' class="sr-only peer" />' +
      '<div class="w-7 h-4 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[\'\'] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-500"></div></label>';
  }
  function toggleRow(attr, icon, label, checked) {
    return '<div class="flex items-center justify-between gap-2 p-1.5 px-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">' +
      '<span class="flex items-center gap-2 min-w-0 text-[11px] text-slate-700 dark:text-slate-300 font-medium"><i class="pi ' + icon + ' text-[12px] w-4 text-center opacity-70 shrink-0"></i><span class="truncate">' + label + '</span></span>' +
      toggleSwitch(attr, checked) + '</div>';
  }
  function modeBtn(mode, icon, label) {
    const on = state.mode === mode;
    return '<button type="button" role="radio" aria-checked="' + on + '" data-mode="' + mode + '" class="min-h-7 px-1.5 py-1 rounded-[2px] border flex items-center justify-center gap-1.5 text-[11px] leading-tight text-center cursor-pointer select-none transition-colors ' +
      (on ? 'bg-brand-500/10 border-brand-500/50 text-brand-700 dark:text-brand-300 font-semibold' : 'bg-slate-100/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:border-slate-300 dark:hover:border-slate-700') +
      '"><i class="pi ' + icon + ' text-[12px] opacity-70 shrink-0"></i><span>' + label + '</span></button>';
  }

  function renderLeftPanel() {
    const panel = document.getElementById('left-panel');
    panel.classList.toggle('hidden', !state.leftOpen);
    renderCanvasTools();
    if (!state.leftOpen) return;
    panel.innerHTML =
      '<div class="flex-1 min-h-0 flex flex-col gap-2">' +
        '<div class="shrink-0 flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">' +
          '<div class="min-w-0 flex-1 pr-1.5"><div data-panel-title class="text-xs font-extrabold text-slate-800 dark:text-slate-200 leading-snug break-words" title="' + esc(panelTitle()) + '">' + esc(panelTitle()) + '</div></div>' +
          '<div class="flex items-center gap-1.5 shrink-0">' +
            '<span class="h-6 inline-flex items-center gap-1 px-2 rounded-full text-[9px] leading-none font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 shrink-0 rounded-full bg-emerald-500 animate-pulse"></span><span>CANLI</span></span>' +
            '<button type="button" data-collapse title="Sol paneli kapat" class="w-6 h-6 flex items-center justify-center leading-none text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-chevron-left text-[10px] leading-none"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="flex-1 min-h-[7rem] flex flex-col">' +
          '<div data-tree class="flex-1 min-h-0 overflow-y-auto pr-1 border border-slate-200 dark:border-slate-800/80 rounded-[2px] bg-slate-50/70 dark:bg-slate-900/50 p-1.5 custom-scrollbar">' + treeHtml(treeNodes()) + '</div>' +
        '</div>' +
        '<div class="shrink-0 border-t border-slate-200 dark:border-slate-800 pt-2">' +
          '<h4 class="text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><i class="pi pi-eye text-[10px]"></i><span>Görünüm Modu</span></h4>' +
          '<div class="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Görünüm Modu">' +
            modeBtn('default', 'pi-tag', 'Varsayılan Etiketler') + modeBtn('temp_mid', 'pi-sun', 'Sıcaklık Değerleri') +
            modeBtn('temp_map', 'pi-th-large', 'Sıcaklık Isı Haritası') + modeBtn('humidity', 'pi-percentage', 'Nem Değerleri') +
          '</div>' +
        '</div>' +
        '<div class="shrink-0 border-t border-slate-200 dark:border-slate-800 pt-2">' +
          '<h4 class="text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><i class="pi pi-filter text-[10px]"></i><span>Alarm renklendirme filtreleri</span></h4>' +
          '<div class="space-y-1.5">' +
            toggleRow('data-filter="whiteSpace"', 'pi-server', 'Beyaz Alan', state.filters.whiteSpace) +
            toggleRow('data-filter="energy"', 'pi-bolt', 'Enerji Grubu', state.filters.energy) +
            toggleRow('data-filter="cooling"', 'pi-cloud', 'Soğutma', state.filters.cooling) +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="border-t border-slate-200 dark:border-slate-800 pt-2 mt-2 shrink-0">' +
        '<div class="w-full h-32 [@media(max-height:820px)]:h-20 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded p-1 overflow-hidden relative shadow-inner">' +
          '<svg data-minimap class="w-full h-full bg-transparent cursor-pointer" viewBox="' + F.layout.fitViewBox + '" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="' + F.layout.bgPath + '" fill="none" stroke="currentColor" class="text-slate-400 dark:text-slate-600" stroke-width="1.5" />' +
            '<rect data-mm-rect fill="rgba(2, 132, 199, 0.2)" stroke="#0284c7" stroke-width="4" stroke-dasharray="8 4" rx="2" ry="2" />' +
          '</svg>' +
        '</div>' +
      '</div>';

    panel.querySelector('[data-collapse]').addEventListener('click', () => { state.leftOpen = false; renderLeftPanel(); });
    panel.querySelectorAll('[data-filter]').forEach(inp => inp.addEventListener('change', () => { state.filters[inp.getAttribute('data-filter')] = inp.checked; renderItems(); }));
    panel.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { state.mode = b.getAttribute('data-mode'); renderItems(); renderLeftPanel(); }));
    panel.querySelector('[data-tree]').addEventListener('click', e => {
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
    const t = document.querySelector('#left-panel [data-panel-title]');
    if (t) { t.textContent = panelTitle(); t.title = panelTitle(); }
    renderCanvasTools();
  }

  function onTreeSelect(id) {
    if (id === 'tt' || id === 'ank' || id === 'dc') return; // kapatılamaz üst düğümler şema açmaz
    if (id.startsWith('floor:')) {
      const fid = id.slice(6);
      if (fid !== F.id) { selectFloor(fid); return; }
      // Aynı kat: salondan bütün kata dön
      state.salonId = '';
      resetView();
      refreshTree();
    } else if (id.startsWith('salon:')) {
      const parts = id.split(':');
      if (parts[1] !== F.id) selectFloor(parts[1], { keepView: true });
      state.salonId = parts[2];
      refreshTree();
      setTimeout(() => zoomToSalon(parts[2]), 30);
    }
  }

  /** Salonun öğelerinin (kabin, klima, UPS, pano) birleşik kutusuna yakınlaşır */
  function zoomToSalon(sid) {
    const sl = F.salons.find(s => s.id === sid);
    // Salonun öğeleri; UPS / pano odası gibi salon dışındaki odalarda duranlar alana katılmaz
    const inside = i => !sl || (i.x + i.w / 2 >= sl.x - 20 && i.x + i.w / 2 <= sl.x + sl.w + 20 && i.y + i.h / 2 >= sl.y - 20 && i.y + i.h / 2 <= sl.y + sl.h + 20);
    const its = items.filter(i => i.salon === sid && inside(i));
    const rect = its.length ? unionRect(its) : (sl ? { x: sl.x, y: sl.y, w: sl.w, h: sl.h } : null);
    if (rect) zoomToRect(rect, { padding: 0.08 });
  }

  function renderMinimapRect() {
    const r = document.querySelector('#left-panel [data-mm-rect]');
    if (!r || !state.vb) return;
    r.setAttribute('x', state.vb.x); r.setAttribute('y', state.vb.y);
    r.setAttribute('width', state.vb.w); r.setAttribute('height', state.vb.h);
  }

  // ---------------------------------------------------------------------------
  // Tuval üstü: Görünüm Ayarları filtresi + sol panel açma rozeti; canlı nokta kutusu
  // ---------------------------------------------------------------------------
  const OBJECT_LAYERS = [
    { id: 'kabin', name: 'Kabin' }, { id: 'klima', name: 'Klima' }, { id: 'klima-panosu', name: 'Klima Panosu' },
    { id: 'sdp-ups', name: 'SDP/UPS' }, { id: 'kapi-duvar', name: 'Kapı/Duvar' }, { id: 'metin', name: 'Metin' }
  ];
  function viewFilterPanel() {
    const netRow = n => '<div class="flex items-center justify-between gap-2 p-1.5 px-2 rounded-[2px] bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">' +
      '<span class="flex items-center gap-2 min-w-0 text-[11px] text-slate-700 dark:text-slate-300 font-medium"><i class="pi pi-share-alt text-[12px] w-4 text-center opacity-70 shrink-0"></i><span class="truncate">' + esc(n.name) + '</span>' +
      '<span class="w-3 h-1.5 rounded-full shrink-0" style="background:' + n.color + '"></span></span>' + toggleSwitch('data-net="' + n.id + '"', state.netOn.has(n.id)) + '</div>';
    return '<div class="space-y-1.5">' +
      toggleRow('data-vf="showAllMap"', 'pi-map', 'Tüm kat planını göster', state.layers.showAllMap) +
      toggleRow('data-vf="showGrids"', 'pi-th-large', 'Yükseltilmiş döşeme karoları', state.layers.showGrids) +
      toggleRow('data-vf="expandAllLabels"', 'pi-tags', 'Etiketleri genişlet', state.expandAllLabels) +
      toggleRow('data-vf="cabinetDoors"', 'pi-lock', 'Kabin Kapı Durumları', state.filters.cabinetDoors) +
      toggleRow('data-vf="showLivePoints"', 'pi-wave-pulse', 'Canlı izlenen telemetri noktası', state.layers.showLivePoints) +
      '<div class="pt-1 px-0.5 text-[9.5px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider flex items-center gap-1"><i class="pi pi-clone text-[10px]"></i><span>Katmanlar</span></div>' +
      OBJECT_LAYERS.map(l => toggleRow('data-obj="' + l.id + '"', 'pi-clone', l.name, !state.hiddenObj.has(l.id))).join('') +
      F.network.map(netRow).join('') +
    '</div>';
  }
  function renderCanvasTools() {
    const el = document.getElementById('canvas-tools');
    el.innerHTML =
      '<div class="relative">' +
        '<button type="button" data-vf-toggle aria-expanded="' + state.viewFilterOpen + '" class="px-2.5 py-1 bg-white/95 dark:bg-[#0b1320]/95 border rounded-[2px] shadow-sm flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer backdrop-blur-sm ' +
          (state.viewFilterOpen ? 'border-brand-400 dark:border-brand-500/60 ring-1 ring-brand-500/40' : 'border-slate-200 dark:border-border-subtle') + '">' +
          '<i class="pi pi-filter text-xs text-brand-500 shrink-0"></i><span>Görünüm Ayarları</span><i class="pi text-[9px] opacity-70 ' + (state.viewFilterOpen ? 'pi-chevron-up' : 'pi-chevron-down') + '"></i></button>' +
        (state.viewFilterOpen ? '<div data-vf-close class="fixed inset-0 z-30"></div>' +
          '<div class="absolute left-0 top-full mt-1 z-40 w-64 max-h-[70vh] overflow-y-auto overscroll-contain custom-scrollbar p-1.5 bg-white/95 dark:bg-[#0b1320]/95 border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl backdrop-blur-sm">' + viewFilterPanel() + '</div>' : '') +
      '</div>' +
      (!state.leftOpen ? '<button type="button" data-open-left title="Sol paneli aç" class="px-2.5 py-1 bg-white/95 dark:bg-[#0b1320]/95 border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-sm flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer backdrop-blur-sm pointer-events-auto">' +
        '<i class="pi pi-bars text-xs text-sky-600 dark:text-sky-400 shrink-0"></i><span class="truncate min-w-0">' + esc(panelTitle()) + '</span></button>' : '');
    el.querySelector('[data-vf-toggle]').addEventListener('click', () => { state.viewFilterOpen = !state.viewFilterOpen; renderCanvasTools(); });
    const vc = el.querySelector('[data-vf-close]');
    if (vc) vc.addEventListener('click', () => { state.viewFilterOpen = false; renderCanvasTools(); });
    const ol = el.querySelector('[data-open-left]');
    if (ol) ol.addEventListener('click', () => { state.leftOpen = true; renderLeftPanel(); });
    el.querySelectorAll('[data-vf]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.getAttribute('data-vf');
      if (k === 'showAllMap' || k === 'showGrids') { state.layers[k] = inp.checked; renderStatic(); }
      else if (k === 'showLivePoints') { state.layers.showLivePoints = inp.checked; renderLivePoints(); }
      else if (k === 'expandAllLabels') { state.expandAllLabels = inp.checked; renderItems(); }
      else { state.filters.cabinetDoors = inp.checked; renderItems(); }
    }));
    el.querySelectorAll('[data-obj]').forEach(inp => inp.addEventListener('change', () => {
      const id = inp.getAttribute('data-obj');
      if (inp.checked) state.hiddenObj.delete(id); else state.hiddenObj.add(id);
      renderMap();
    }));
    el.querySelectorAll('[data-net]').forEach(inp => inp.addEventListener('change', () => {
      const id = inp.getAttribute('data-net');
      if (inp.checked) state.netOn.add(id); else state.netOn.delete(id);
      renderNetwork();
    }));
  }

  function renderLivePoints() {
    const el = document.getElementById('live-points');
    el.classList.toggle('hidden', !state.layers.showLivePoints);
    el.innerHTML =
      '<div class="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"><span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Canlı izlenen telemetri noktası</span></div>' +
      '<div class="text-lg font-extrabold font-mono leading-tight text-slate-900 dark:text-white">' + fmtInt(F.livePoints) + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Krokide arama ve hızlı seçim (POD, Klima, Klima Panosu, UPS)
  // ---------------------------------------------------------------------------
  const MAP_KIND_ORDER = ['pod', 'cabinet', 'climate', 'climate-panel', 'sdp', 'ups', 'other'];
  const MAP_GROUP_KINDS = ['pod', 'climate', 'climate-panel', 'sdp', 'ups', 'other'];
  const KIND_LABEL = { pod: 'POD', cabinet: 'Kabin', climate: 'Klima', 'climate-panel': 'Klima Panosu', sdp: 'SDP', ups: 'UPS', other: 'Diğer' };
  const KIND_ICON = { pod: 'pi-th-large', cabinet: 'pi-server', climate: 'pi-cloud', 'climate-panel': 'pi-table', sdp: 'pi-sitemap', ups: 'pi-bolt', other: 'pi-microchip' };
  const KIND_CLASS = {
    pod: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    cabinet: 'bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-400',
    climate: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400',
    'climate-panel': 'bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400',
    sdp: 'bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400',
    ups: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
    other: 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-300'
  };
  const KIND_TEXT = { pod: 'text-emerald-700 dark:text-emerald-300', cabinet: 'text-sky-700 dark:text-sky-300', climate: 'text-cyan-700 dark:text-cyan-300', 'climate-panel': 'text-teal-700 dark:text-teal-300', sdp: 'text-orange-700 dark:text-orange-300', ups: 'text-amber-700 dark:text-amber-300', other: 'text-slate-800 dark:text-slate-100' };
  const KIND_DOT = { pod: 'bg-emerald-500', cabinet: 'bg-sky-500', climate: 'bg-cyan-500', 'climate-panel': 'bg-teal-500', sdp: 'bg-orange-500', ups: 'bg-amber-500', other: 'bg-slate-500' };
  /** Büyük/küçük harf, Türkçe karakter, boşluk ve tire farkını yok sayar ("klima 109" = "KLIMA-109") */
  const normKey = v => String(v == null ? '' : v).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  let mapIndex = [];
  let mapGroups = {};
  function buildMapIndex() {
    const prefix = { pod: 'pod', cabinet: 'kabin', climate: 'klima', 'climate-panel': 'klimapano', ups: 'ups' };
    const entries = [];
    F.pods.filter(p => p.cabinets.length).forEach(p => {
      const r = podButtonRect(p.name);
      const label = { x: p.x - r.w / 2, y: p.y - r.h / 2, w: r.w, h: r.h };
      entries.push({ id: 'pod:' + p.name, kind: 'pod', label: p.name, count: p.cabinets.length, rect: unionRect([p.box, label]), highlight: [{ x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h }] });
    });
    items.forEach(it => {
      const kind = it.kind === 'cabinet' ? 'cabinet' : it.kind === 'panel' ? 'climate-panel' : it.kind;
      entries.push({ id: it.id, kind, label: it.label, item: it, rect: { x: it.x, y: it.y, w: it.w, h: it.h }, highlight: [{ x: it.x, y: it.y, w: it.w, h: it.h }] });
    });
    entries.forEach(e => {
      const l = normKey(e.label), d = e.item ? normKey(e.item.ref.devId) : '';
      e.keys = [l, d, prefix[e.kind] ? prefix[e.kind] + l : ''].filter(Boolean);
    });
    const natural = (a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true, sensitivity: 'base' });
    mapGroups = {};
    MAP_GROUP_KINDS.forEach(k => {
      const list = entries.filter(e => e.kind === k).sort(k === 'pod' ? (a, b) => (/^POD/.test(a.label) ? 0 : 1) - (/^POD/.test(b.label) ? 0 : 1) || natural(a, b) : natural);
      if (list.length) mapGroups[k] = list;
    });
    mapIndex = entries;
  }
  const currentGroup = () => (mapGroups[state.mapGroup] ? state.mapGroup : (Object.keys(mapGroups)[0] || 'pod'));
  function searchResults() {
    const q = normKey(state.mapQuery);
    if (!q) return [];
    const scored = [];
    mapIndex.forEach(e => {
      let score = 0;
      e.keys.forEach(k => {
        if (k === q) score = Math.max(score, 3);
        else if (k.startsWith(q)) score = Math.max(score, 2);
        else if (k.includes(q)) score = Math.max(score, 1);
      });
      if (score) scored.push({ e, score });
    });
    scored.sort((a, b) => b.score - a.score || MAP_KIND_ORDER.indexOf(a.e.kind) - MAP_KIND_ORDER.indexOf(b.e.kind) ||
      a.e.label.localeCompare(b.e.label, 'tr', { numeric: true, sensitivity: 'base' }));
    return scored.slice(0, 8).map(s => s.e);
  }

  function renderStrip() {
    const el = document.getElementById('map-strip');
    const g = currentGroup();
    const res = state.mapSearchOpen && state.mapQuery ? searchResults() : null;
    const groupKeys = MAP_GROUP_KINDS.filter(k => mapGroups[k]);
    el.innerHTML =
      // Arama
      '<div class="relative w-72 min-w-[9rem] shrink">' +
        '<i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
        '<input type="search" data-map-q value="' + esc(state.mapQuery) + '" autocomplete="off" spellcheck="false" placeholder="Kabin, klima, UPS veya POD ara" class="w-full h-9 pl-9 pr-9 text-xs font-medium bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 [&::-webkit-search-cancel-button]:hidden" />' +
        (state.mapQuery ? '<button type="button" data-map-clear aria-label="Temizle" class="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-rose-500 cursor-pointer"><i class="pi pi-times-circle text-xs"></i></button>' : '') +
        (res ? '<div class="absolute left-0 right-0 top-full mt-1 z-40 max-h-[50vh] overflow-y-auto overscroll-contain bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl divide-y divide-slate-100 dark:divide-border-subtle">' +
          res.map(r => '<button type="button" data-map-result="' + esc(r.id) + '" class="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">' +
            '<span class="w-8 h-8 shrink-0 flex items-center justify-center border rounded-[2px] ' + KIND_CLASS[r.kind] + '"><i class="pi text-sm ' + KIND_ICON[r.kind] + '"></i></span>' +
            '<span class="min-w-0 flex-1"><span class="block text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate">' + esc(r.label) + '</span><span class="block text-[11px] text-slate-500 dark:text-slate-400">' + KIND_LABEL[r.kind] + '</span></span>' +
            '<i class="pi pi-search-plus text-xs text-slate-400 shrink-0"></i></button>').join('') +
          (res.length === 0 ? '<div class="px-3 py-3 flex items-center gap-2 text-xs italic text-slate-400 dark:text-slate-500"><i class="pi pi-info-circle text-xs not-italic"></i>Eşleşen öğe bulunamadı</div>' : '') +
        '</div>' : '') +
      '</div>' +
      // Kategori seçici
      (groupKeys.length ?
      '<div class="relative shrink-0">' +
        '<button type="button" data-map-group-toggle aria-expanded="' + state.mapGroupMenuOpen + '" class="h-9 pl-2.5 pr-2 flex items-center gap-1.5 border rounded-[3px] text-[12px] font-bold cursor-pointer hover:opacity-90 ' + KIND_CLASS[g] + '">' +
          '<i class="pi text-[12px] ' + KIND_ICON[g] + '"></i><span class="max-w-[6.5rem] truncate">' + KIND_LABEL[g] + '</span><i class="pi text-[9px] opacity-70 ' + (state.mapGroupMenuOpen ? 'pi-chevron-up' : 'pi-chevron-down') + '"></i></button>' +
        (state.mapGroupMenuOpen ? '<div data-map-group-close class="fixed inset-0 z-30"></div>' +
          '<div class="absolute left-0 top-full mt-1 z-40 w-60 py-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl">' +
            '<div class="px-3 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">Kategori</div>' +
            groupKeys.map(k => '<button type="button" data-map-group="' + k + '" class="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ' + (k === g ? 'bg-slate-50 dark:bg-slate-800/60' : '') + '">' +
              '<span class="w-7 h-7 shrink-0 flex items-center justify-center border rounded-[2px] ' + KIND_CLASS[k] + '"><i class="pi text-xs ' + KIND_ICON[k] + '"></i></span>' +
              '<span class="min-w-0 flex-1 text-[13px] font-semibold text-slate-800 dark:text-slate-100 truncate">' + KIND_LABEL[k] + '</span>' +
              '<span class="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500">' + mapGroups[k].length + '</span>' +
              '<i class="pi pi-check text-[11px] w-3 text-sky-600 dark:text-sky-400 ' + (k === g ? '' : 'invisible') + '"></i></button>').join('') +
          '</div>' : '') +
      '</div>' +
      // Öğeler (segment) + kaydırma okları
      '<div class="relative flex-1 min-w-0">' +
        '<div data-chip-track id="dt-map-chips" class="dt-chip-track h-9 flex items-center gap-0.5 p-0.5 overflow-x-auto overscroll-x-contain bg-slate-200/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[3px]">' +
          '<button type="button" data-map-all class="h-full px-2.5 shrink-0 flex items-center gap-1.5 rounded-[2px] text-[12px] font-bold whitespace-nowrap cursor-pointer transition-colors ' +
            (!state.activeMapId ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800') + '"><i class="pi pi-expand text-[11px]"></i>Tümü</button>' +
          '<span class="w-px h-4 mx-0.5 shrink-0 bg-slate-300 dark:bg-slate-700"></span>' +
          (mapGroups[g] || []).map(p => {
            const on = state.activeMapId === p.id;
            return '<button type="button" id="dt-map-chip-' + esc(p.id) + '" data-map-chip="' + esc(p.id) + '" class="h-full px-2.5 shrink-0 flex items-center gap-1.5 rounded-[2px] text-[12px] font-bold whitespace-nowrap cursor-pointer transition-colors ' +
              (on ? 'bg-white dark:bg-slate-700 shadow-sm ' + KIND_TEXT[p.kind] : 'text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800') + '">' +
              '<span class="w-1.5 h-1.5 shrink-0 rounded-full ' + (on ? KIND_DOT[p.kind] : 'bg-slate-400 dark:bg-slate-600') + '"></span><span>' + esc(p.label) + '</span>' +
              (p.kind === 'pod' && p.count ? '<span class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-[2px] text-[10px] font-bold font-mono leading-none ' + (on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-slate-300/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400') + '">' + p.count + '</span>' : '') +
            '</button>';
          }).join('') +
        '</div>' +
        '<button type="button" data-chip-left aria-label="‹" class="hidden absolute inset-y-px left-px w-10 flex items-center justify-start pl-1.5 rounded-l-[3px] bg-linear-to-r from-slate-200 via-slate-200/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 text-slate-700 dark:text-slate-200 cursor-pointer"><span class="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-slate-700 shadow-sm"><i class="pi pi-chevron-left text-[10px]"></i></span></button>' +
        '<button type="button" data-chip-right aria-label="›" class="hidden absolute inset-y-px right-px w-10 flex items-center justify-end pr-1.5 rounded-r-[3px] bg-linear-to-l from-slate-200 via-slate-200/95 to-transparent dark:from-slate-900 dark:via-slate-900/95 text-slate-700 dark:text-slate-200 cursor-pointer"><span class="w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-slate-700 shadow-sm"><i class="pi pi-chevron-right text-[10px]"></i></span></button>' +
      '</div>' : '');

    const input = el.querySelector('[data-map-q]');
    input.addEventListener('input', () => {
      state.mapQuery = input.value; state.mapSearchOpen = true;
      const pos = input.selectionStart;
      renderStrip();
      const ni = document.querySelector('#map-strip [data-map-q]');
      ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (e) { /* yok say */ }
    });
    input.addEventListener('focus', () => { if (!state.mapSearchOpen && state.mapQuery) { state.mapSearchOpen = true; renderStrip(); const ni = document.querySelector('#map-strip [data-map-q]'); ni.focus(); } });
    input.addEventListener('blur', () => setTimeout(() => { if (state.mapSearchOpen && !el.contains(document.activeElement)) { state.mapSearchOpen = false; renderStrip(); } }, 150));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = searchResults()[0]; if (f) focusMapEntry(f); } else if (e.key === 'Escape') { state.mapSearchOpen = false; renderStrip(); } });
    const clr = el.querySelector('[data-map-clear]');
    if (clr) clr.addEventListener('click', () => { state.mapQuery = ''; state.mapSearchOpen = false; renderStrip(); });
    el.querySelectorAll('[data-map-result]').forEach(b => {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => focusMapEntry(mapIndex.find(x => x.id === b.getAttribute('data-map-result'))));
    });
    const gt = el.querySelector('[data-map-group-toggle]');
    if (gt) gt.addEventListener('click', () => { state.mapGroupMenuOpen = !state.mapGroupMenuOpen; renderStrip(); });
    const gc = el.querySelector('[data-map-group-close]');
    if (gc) gc.addEventListener('click', () => { state.mapGroupMenuOpen = false; renderStrip(); });
    el.querySelectorAll('[data-map-group]').forEach(b => b.addEventListener('click', () => { state.mapGroup = b.getAttribute('data-map-group'); state.mapGroupMenuOpen = false; renderStrip(); }));
    const all = el.querySelector('[data-map-all]');
    if (all) all.addEventListener('click', showWholeMap);
    el.querySelectorAll('[data-map-chip]').forEach(b => b.addEventListener('click', () => focusMapEntry(mapIndex.find(x => x.id === b.getAttribute('data-map-chip')))));
    const track = el.querySelector('[data-chip-track]');
    if (track) {
      const upd = () => {
        el.querySelector('[data-chip-left]').classList.toggle('hidden', !(track.scrollLeft > 4));
        el.querySelector('[data-chip-right]').classList.toggle('hidden', !(track.scrollLeft + track.clientWidth < track.scrollWidth - 4));
      };
      track.addEventListener('scroll', upd);
      el.querySelector('[data-chip-left]').addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.7, behavior: 'smooth' }));
      el.querySelector('[data-chip-right]').addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.7, behavior: 'smooth' }));
      if (stripScroll != null) track.scrollLeft = stripScroll;
      requestAnimationFrame(upd);
    }
  }
  let stripScroll = null;
  window.addEventListener('resize', () => { const t = document.querySelector('#map-strip [data-chip-track]'); if (t) t.dispatchEvent(new Event('scroll')); });

  /** Seçilen öğeye ya da POD'un kabinlerine yakınlaştırır ve kısa süre vurgular (3D'den gelen odak kalıcı) */
  function focusMapEntry(entry, pinned) {
    if (!entry) return;
    state.mapSearchOpen = false;
    state.mapGroupMenuOpen = false;
    state.pinnedFocus = !!pinned;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (MAP_GROUP_KINDS.indexOf(entry.kind) >= 0) { state.mapGroup = entry.kind; state.activeMapId = entry.id; }
    else state.activeMapId = null;
    zoomToRect(entry.rect, { minWidth: entry.kind === 'pod' ? 640 : 420, padding: 0.1 });
    state.focusRects = entry.highlight;
    renderFocus();
    if (focusTimer) clearTimeout(focusTimer);
    focusTimer = pinned ? null : setTimeout(() => { state.focusRects = null; renderFocus(); }, 5000);
    stripScroll = null;
    renderStrip();
    setTimeout(() => { const c = document.getElementById('dt-map-chip-' + entry.id); if (c) c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }, 0);
  }
  function showWholeMap() {
    state.pinnedFocus = false;
    state.activeMapId = null;
    state.focusRects = null;
    renderFocus();
    resetView();
    stripScroll = 0;
    renderStrip();
  }

  // ---------------------------------------------------------------------------
  // POD detay penceresi (pod-details.component.ts)
  // ---------------------------------------------------------------------------
  function fillBarClass(pct) {
    if (pct === null) return 'bg-slate-300 dark:bg-slate-700';
    if (pct >= 80) return 'bg-rose-500';
    if (pct >= 70) return 'bg-amber-400';
    return 'bg-brand-500';
  }
  function openPodDetails(name) {
    const p = F.pods.find(x => x.name === name);
    if (!p) return;
    const fills = p.cabinets.slice().sort((a, b) => a.code.localeCompare(b.code, 'tr', { numeric: true }))
      .map(c => ({ id: c.code, usedU: c.usedU, totalU: 42, pct: Math.min(100, (c.usedU / 42) * 100) }));
    const hostEl = document.createElement('div');
    hostEl.className = 'fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
    hostEl.innerHTML =
      '<section data-panel class="w-[min(100vw-2rem,42rem)] max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden rounded-[2px] border border-slate-200 bg-white shadow-2xl dark:border-border-subtle dark:bg-surface-card animate-modal-pop">' +
        '<header class="shrink-0 flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-border-subtle dark:bg-surface-base">' +
          '<div class="min-w-0"><h2 class="text-sm font-black text-slate-900 dark:text-slate-100">' + esc(p.name) + '</h2><p class="text-[10px] text-slate-500">POD canlı durum ve kabin doluluğu</p></div>' +
          '<button type="button" data-close class="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer" aria-label="Kapat"><i class="pi pi-times"></i></button>' +
        '</header>' +
        '<div class="shrink-0 grid grid-cols-3 gap-px bg-slate-200 dark:bg-slate-800">' +
          '<div class="bg-white p-3 text-center dark:bg-surface-card min-w-0"><p class="text-[10px] font-bold tracking-wide text-slate-500 truncate">POD SICAKLIĞI</p><b class="block mt-0.5 font-mono text-sky-600">' + p.temp.toFixed(1) + ' °C</b></div>' +
          '<div class="bg-white p-3 text-center dark:bg-surface-card min-w-0"><p class="text-[10px] font-bold tracking-wide text-slate-500 truncate">TOPLAM GÜÇ</p><b class="block mt-0.5 font-mono text-amber-600">' + p.powerKw.toFixed(2) + ' kW</b></div>' +
          '<div class="bg-white p-3 text-center dark:bg-surface-card min-w-0"><p class="text-[10px] font-bold tracking-wide text-slate-500 truncate">KABİN</p><b class="block mt-0.5 font-mono text-emerald-600">' + p.cabinets.length + '</b></div>' +
        '</div>' +
        '<div class="shrink-0 flex items-center justify-between gap-2 px-4 pt-3 pb-1.5"><p class="text-[10px] font-bold tracking-wide text-slate-500">KABİN DOLULUK</p>' +
          '<span class="text-[10px] text-slate-400 flex items-center gap-2"><span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-400"></span>≥ %70</span><span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-rose-500"></span>≥ %80</span></span></div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 custom-scrollbar">' +
          (fills.length ? '<ul class="divide-y divide-slate-100 dark:divide-slate-800">' + fills.map(c =>
            '<li class="py-2 grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-xs">' +
              '<button type="button" data-pod-cab="' + esc(c.id) + '" class="text-left font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer" title="' + esc(c.id) + '">' + esc(c.id) + '</button>' +
              '<span class="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><span class="block h-full rounded-full transition-all duration-300 ' + fillBarClass(c.pct) + '" style="width:' + c.pct.toFixed(1) + '%"></span></span>' +
              '<span class="font-mono text-[11px] text-right whitespace-nowrap min-w-[6.5rem]"><b class="text-slate-800 dark:text-slate-100">%' + Math.round(c.pct) + '</b><span class="text-slate-500"> · ' + c.usedU + '/' + c.totalU + ' U</span></span>' +
            '</li>').join('') + '</ul>'
            : '<div class="py-8 text-center text-xs text-slate-400">Bu POD için eşleşen kabin verisi yok.</div>') +
        '</div>' +
      '</section>';
    const close = () => { hostEl.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    hostEl.addEventListener('click', ev => { if (!ev.target.closest('[data-panel]')) close(); });
    hostEl.querySelector('[data-close]').addEventListener('click', close);
    hostEl.querySelectorAll('[data-pod-cab]').forEach(b => b.addEventListener('click', () => {
      const it = items.find(i => i.kind === 'cabinet' && i.label === b.getAttribute('data-pod-cab'));
      close();
      if (it) { zoomToRect(it, { minWidth: 420, padding: 0.1 }); onItemClick(it); }
    }));
    document.body.appendChild(hostEl);
  }

  // ---------------------------------------------------------------------------
  // Ekipman penceresi (ups-table / climate-table / climate-panel-table)
  // ---------------------------------------------------------------------------
  function openEquipmentModal(it) {
    const e = it.ref;
    const st = statusOf(it);
    const group = { climate: 'Hassas Klima · Soğutma', ups: 'UPS · Enerji Grubu', panel: 'Klima Panosu · Soğutma' }[it.kind];
    const statusText = s => ({ normal: 'NORMAL', warning: 'UYARI', alarm: 'ALARM', lost: 'VERİ ALINAMIYOR' }[s] || s);
    const statusCls = s => ({ normal: 'text-emerald-600 dark:text-emerald-400', warning: 'text-amber-600 dark:text-amber-400', alarm: 'text-rose-600 dark:text-rose-400', lost: 'text-orange-600 dark:text-orange-400' }[s]);
    const hostEl = document.createElement('div');
    hostEl.className = 'fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
    hostEl.innerHTML =
      '<section data-panel class="box-border flex max-h-[calc(100vh-1rem)] w-[min(100vw-1rem,56.25rem)] flex-col overflow-hidden rounded-[2px] border border-slate-200 bg-white shadow-2xl dark:border-border-subtle dark:bg-surface-card animate-modal-pop">' +
        '<header class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-border-subtle dark:bg-surface-base">' +
          '<div class="min-w-0"><h2 class="truncate text-sm font-black flex items-center gap-2">' + esc(e.label) + ' ' + (st === 'acil' ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-black border bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/40">ACİL</span>' : DCIM.ui.statusBadge(st === 'lost' ? 'kayıp' : st)) + '</h2><p class="text-[10px] text-slate-500">' + group + ' · ' + esc(F.name) + ' · ' + esc(e.devId) + '</p></div>' +
          '<div class="flex shrink-0 gap-2">' +
            '<a href="3d.html?focus=' + encodeURIComponent(e.label) + '" class="inline-flex h-8 items-center rounded-[2px] border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-border-subtle dark:bg-surface-card dark:text-slate-200">3D\'de Göster</a>' +
            '<button type="button" data-close class="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-slate-50 dark:border-border-subtle dark:bg-surface-card dark:text-slate-200"><i class="pi pi-times"></i></button>' +
          '</div>' +
        '</header>' +
        (e.note ? '<div class="px-4 pt-3"><div class="p-2 rounded-[2px] border text-xs font-bold flex items-center gap-2 ' + (isAlarmish(st) ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300') + '"><i class="pi pi-exclamation-triangle"></i>' + esc(e.note) + '</div></div>' : '') +
        '<div class="min-h-0 flex-1 overflow-auto p-4">' +
          '<table class="w-full text-xs"><thead class="text-[10px] uppercase text-slate-500"><tr><th class="pb-2 text-left">Parametre</th><th class="pb-2 text-right">Değer</th><th class="pb-2 text-right">Durum</th></tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
          e.points.map(p => '<tr><td class="py-2 font-semibold">' + esc(p.label) + '</td><td class="py-2 text-right font-mono font-bold text-amber-600">' + esc(p.value) + ' ' + esc(p.unit) + '</td><td class="py-2 text-right text-[10px] font-bold ' + statusCls(p.status) + '">' + statusText(p.status) + '</td></tr>').join('') +
          '</tbody></table>' +
        '</div>' +
      '</section>';
    const close = () => { hostEl.remove(); state.selectedId = null; renderItems(); };
    hostEl.addEventListener('click', ev => { if (!ev.target.closest('[data-panel]')) close(); });
    hostEl.querySelector('[data-close]').addEventListener('click', close);
    document.body.appendChild(hostEl);
  }

  // ---------------------------------------------------------------------------
  // Kabin bölünmüş paneli (app-cabinet-inline-detail, powerSensorMode + inlineDeviceDetail)
  // ---------------------------------------------------------------------------
  const detailHost = document.getElementById('detail-host');
  const det = { cab: null, rack: null, asset: null, isoH: 0 };
  const SEV_COLOR = { acil: '#DC2626', alarm: '#DC2626', uyari: '#D97706', kayip: '#EA580C' }; // 2D: Acil kırmızı
  const SEV_LABEL = { acil: 'Acil', alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Veri Alınamıyor' };
  function cabinetAlarms(c) {
    return D.activeAlarms.filter(a => a.target === c.code).map(a => {
      const sev = a.level === 'lost' ? 'kayip' : a.level === 'warning' ? 'uyari' : (a.severity === 'critical' ? 'acil' : 'alarm');
      return { id: a.id, text: a.txt, sev, color: SEV_COLOR[sev], time: DCIM.ui.fmtDateTime(a.tim), source: a.rid, acked: !!a.ack };
    });
  }
  const TONE_BADGE = {
    normal: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-700 border-amber-500/40 dark:text-amber-300',
    alarm: 'bg-rose-500/10 text-rose-600 border-rose-500/40 dark:text-rose-400',
    lost: 'bg-orange-500/10 text-orange-600 border-orange-500/40 dark:text-orange-400',
    off: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
  };
  const TONE_DOT = { normal: 'bg-emerald-500', warning: 'bg-amber-400', alarm: 'bg-rose-600', lost: 'bg-orange-500', off: 'bg-slate-400' };
  const TONE_LABEL = { normal: 'NORMAL', warning: 'UYARI', alarm: 'ALARM', lost: 'VERİ ALINAMIYOR', off: 'DEVRE DIŞI' };
  const TONE_CARD = {
    normal: 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800',
    warning: 'bg-amber-500/5 border-amber-500/40',
    alarm: 'bg-rose-500/5 border-rose-500/40',
    lost: 'bg-orange-500/5 border-orange-500/40',
    off: 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800'
  };
  const TONE_VALUE = { normal: 'text-slate-900 dark:text-slate-100', warning: 'text-amber-600 dark:text-amber-400', alarm: 'text-rose-600 dark:text-rose-400', lost: 'text-orange-600 dark:text-orange-400', off: 'text-slate-500' };

  function powerSensorHtml(c) {
    const pdus = T.cabinetPdus(c);
    let sumA = 0, sumW = 0, vSum = 0, vN = 0, anyA = false;
    pdus.forEach(p => { if (p.current !== null) { sumA += p.current; anyA = true; } if (p.power !== null) sumW += p.power; if (p.voltage) { vSum += p.voltage; vN++; } });
    const kpis = [
      ['Ort. Giriş Voltajı', vN ? (vSum / vN).toFixed(1) + ' V' : '-'],
      ['Toplam Akım', anyA ? sumA.toFixed(1) + ' A' : '-'],
      ['Kabin Toplam Güç Tüketimi', anyA ? (sumW / 1000).toFixed(2) + ' kW' : '-']
    ];
    const lost = c.status === 'lost';
    const tTone = (t, lo) => (lost ? 'lost' : t >= 30 ? 'alarm' : t >= 27 ? 'warning' : (lo && t < 18) ? 'warning' : 'normal');
    const sensors = [
      { label: 'Üst Sıcaklık', value: c.tempTop.toFixed(1) + ' °C', tone: tTone(c.tempTop) },
      { label: 'Orta Sıcaklık', value: c.tempMid.toFixed(1) + ' °C', tone: tTone(c.tempMid, true) },
      { label: 'Alt Sıcaklık', value: c.tempLow.toFixed(1) + ' °C', tone: tTone(c.tempLow, true) },
      { label: 'Nem Oranı', value: c.humidity.toFixed(1) + ' %RH', tone: lost ? 'lost' : c.humidity > 60 ? 'warning' : 'normal' },
      { label: 'Ön Kapak Durumu', door: c.frontDoor, tone: lost ? 'lost' : c.frontDoor === 'open' ? 'alarm' : 'normal' },
      { label: 'Arka Kapak Durumu', door: c.rearDoor, tone: lost ? 'lost' : c.rearDoor === 'open' ? 'alarm' : 'normal' }
    ];
    return '<div class="space-y-3 text-xs">' +
      '<section class="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-[3px] p-3 shadow-2xs space-y-2">' +
        '<div class="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800"><span class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-bolt text-brand-500 text-[10px]"></i>PDU Üniteleri</span>' +
          '<span class="text-[9px] font-mono text-slate-400">' + fmtTime(new Date()) + '</span></div>' +
        '<div class="grid grid-cols-3 gap-1.5">' + kpis.map(k => '<div class="p-1.5 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-[2px] min-w-0"><span class="text-[9px] text-slate-500 dark:text-slate-400 block font-medium truncate" title="' + k[0] + '">' + k[0] + '</span><span class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate block font-mono">' + k[1] + '</span></div>').join('') + '</div>' +
        '<div class="border border-slate-200 dark:border-slate-800 rounded-[2px] overflow-x-auto"><table class="w-full text-left border-collapse text-[10px]">' +
          '<thead class="bg-slate-100 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800"><tr><th class="py-1 px-1.5 whitespace-nowrap">PDU Adı</th><th class="py-1 px-1.5 whitespace-nowrap">IP Adresi</th><th class="py-1 px-1.5 text-right whitespace-nowrap">A</th><th class="py-1 px-1.5 text-right whitespace-nowrap">kW</th><th class="py-1 px-1.5 text-center whitespace-nowrap">Durum</th></tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + pdus.map(p =>
            '<tr><td class="py-1 px-1.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap"><a class="hover:text-sky-600 dark:hover:text-sky-400 hover:underline" href="pdu-detail.html?cabinet=' + encodeURIComponent(c.code) + '&pdu=' + p.name.slice(-1) + '">' + esc(p.name) + '</a></td>' +
            '<td class="py-1 px-1.5 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">' + esc(p.ip) + '</td>' +
            '<td class="py-1 px-1.5 font-mono text-right whitespace-nowrap">' + (p.current === null ? '-' : p.current.toFixed(1)) + '</td>' +
            '<td class="py-1 px-1.5 font-mono text-right whitespace-nowrap">' + (p.power === null ? '-' : (p.power / 1000).toFixed(2)) + '</td>' +
            '<td class="py-1 px-1.5 text-center whitespace-nowrap"><span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold border leading-none ' + TONE_BADGE[p.tone] + '"><span class="w-1.5 h-1.5 rounded-full shrink-0 ' + TONE_DOT[p.tone] + '"></span>' + TONE_LABEL[p.tone] + '</span></td></tr>').join('') +
          '</tbody></table></div>' +
      '</section>' +
      '<section class="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-[3px] p-3 shadow-2xs space-y-2">' +
        '<div class="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800"><span class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-wave-pulse text-brand-500 text-[10px]"></i>Sensörler</span></div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">' + sensors.map(s =>
          '<div class="p-1.5 rounded-[2px] border flex items-center justify-between gap-2 min-w-0 ' + TONE_CARD[s.tone] + '">' +
            '<span class="font-bold text-slate-700 dark:text-slate-300 text-[11px] truncate min-w-0" title="' + s.label + '">' + s.label + ':</span>' +
            '<span class="flex items-center gap-1.5 shrink-0"><span class="font-extrabold text-xs flex items-center gap-1 ' + TONE_VALUE[s.tone] + '">' +
              (s.door ? '<i class="text-xs ' + (s.door === 'open' ? 'pi pi-lock-open' : 'pi pi-lock') + '"></i><span>' + (lost ? '-' : s.door === 'open' ? 'Açık' : 'Kapalı') + '</span>' : '<span>' + (lost ? '-' : s.value) + '</span>') +
            '</span>' + (s.tone !== 'normal' ? '<span class="inline-flex items-center px-1 py-0.5 rounded-[2px] text-[8px] font-bold border leading-none ' + TONE_BADGE[s.tone] + '">' + TONE_LABEL[s.tone] + '</span>' : '') + '</span>' +
          '</div>').join('') + '</div>' +
      '</section>' +
    '</div>';
  }

  function alarmsHtml(c) {
    const alarms = cabinetAlarms(c);
    return '<section class="bg-white dark:bg-slate-900/70 border rounded-[3px] p-3 shadow-2xs space-y-2 text-xs ' + (alarms.length ? 'border-rose-500/40' : 'border-slate-200 dark:border-slate-800') + '">' +
      '<div class="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800"><span class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-bell text-rose-500 text-[10px]"></i>Kabin Alarmları</span>' +
        '<span class="px-2 py-0.5 rounded-[2px] text-[9.5px] font-black border ' + (alarms.length ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30') + '">' + alarms.length + '</span></div>' +
      (!alarms.length ? '<div class="py-2 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><i class="pi pi-check-circle text-emerald-500 text-xs"></i><span>Bu kabinde aktif alarm yok</span></div>'
        : '<div class="space-y-1.5 max-h-[260px] overflow-y-auto custom-scrollbar pr-0.5">' + alarms.map(a =>
          '<div class="flex items-start gap-2 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">' +
            '<span class="mt-0.5 w-1 self-stretch rounded-full shrink-0" style="background:' + a.color + '"></span>' +
            '<div class="min-w-0 flex-1"><div class="font-bold text-[11px] text-slate-800 dark:text-slate-100 break-words leading-snug">' + esc(a.text) + '</div>' +
              '<div class="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-slate-500 dark:text-slate-400"><span class="font-black uppercase" style="color:' + a.color + '">' + SEV_LABEL[a.sev] + '</span><span>• ' + esc(a.time) + '</span>' +
              '<span class="font-mono truncate" title="' + esc(a.source) + '">• ' + esc(a.source) + '</span>' + (a.acked ? '<i class="pi pi-eye text-[9px] ml-auto shrink-0" title="Görüldü"></i>' : '') + '</div></div>' +
          '</div>').join('') + '</div>') +
    '</section>';
  }

  function openCabinetDetail(c) {
    if (det.rack) { det.rack.destroy(); det.rack = null; }
    det.cab = c;
    det.asset = null;
    const anyOpen = c.frontDoor === 'open' || c.rearDoor === 'open';
    detailHost.classList.remove('hidden');
    detailHost.innerHTML =
      '<div data-inline class="relative h-full w-full flex flex-col rounded-[3px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden select-none">' +
        '<header class="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/90 flex items-center justify-between gap-3">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<div class="w-8 h-8 rounded-[3px] flex items-center justify-center shrink-0 border shadow-xs ' + (anyOpen ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 dark:text-rose-400' : 'bg-brand-500/15 border-brand-500/30 text-brand-600 dark:text-brand-400') + '"><i class="pi pi-server text-sm"></i></div>' +
            '<div class="min-w-0">' +
              '<div class="flex items-center gap-2"><h2 class="text-sm font-black text-slate-900 dark:text-white tracking-wide truncate" title="' + esc(c.code + ' — ' + c.customer) + '">' + esc(c.code + ' — ' + c.customer) + '</h2></div>' +
              '<p class="text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5"><span class="font-mono font-bold text-slate-700 dark:text-slate-300">' + esc(c.code) + '</span><span>•</span><span>' + esc(F.name) + '</span><span>•</span><span class="text-sky-600 dark:text-sky-400 font-semibold">' + esc(c.pod) + '</span><span>•</span><span>' + esc(c.salon || '1. Salon') + '</span></p>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 shrink-0">' +
            '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(c.code) + '" title="Kabin Yönetim Ekranını Aç" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-[11px] rounded-[2px] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"><span>Kabin Ekranı</span><i class="pi pi-arrow-up-right text-[10px]"></i></a>' +
            '<button type="button" data-close title="Detay Panelini Kapat (Tam Ekrana Dön)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-times text-sm"></i></button>' +
          '</div>' +
        '</header>' +
        '<div data-body class="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-4 custom-scrollbar bg-slate-50/70 dark:bg-[#080d16]">' +
          '<div class="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start xl:h-full">' +
            '<div class="xl:col-span-6 space-y-2">' +
              '<div class="flex items-center justify-between px-1"><span class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-box text-brand-500 dark:text-brand-400 text-[10px]"></i>İzometrik Kabin Görünümü</span></div>' +
              '<div data-rack-host></div>' +
            '</div>' +
            '<div class="xl:col-span-6 space-y-2 xl:h-full xl:min-h-0 xl:overflow-y-auto custom-scrollbar xl:pr-0.5">' +
              '<div class="flex items-center justify-between px-1"><span class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-info-circle text-brand-500 dark:text-brand-400 text-[10px]"></i>Kabin &amp; Sensör Detayları</span></div>' +
              alarmsHtml(c) +
              '<div data-power-sensor>' + powerSensorHtml(c) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div data-device class="hidden absolute inset-0 z-40 isolate"></div>' +
      '</div>';
    detailHost.querySelector('[data-close]').addEventListener('click', closeCabinetDetail);
    requestAnimationFrame(() => mountRack(true));
  }

  /** 3D kabin yüksekliği: gövdenin görünen yüksekliği (xl'de tek sayfa: alt sınır 240, üst 1100) */
  function mountRack(force) {
    const c = det.cab;
    if (!c) return;
    const body = detailHost.querySelector('[data-body]');
    if (!body || !body.clientHeight) return;
    const singlePage = window.innerWidth >= 1280;
    const h = Math.round(Math.max(singlePage ? 240 : 380, Math.min(1100, body.clientHeight - 64)));
    if (!force && h === det.isoH) return;
    det.isoH = h;
    if (det.rack) det.rack.destroy();
    det.rack = DCIM.components.createRack3d(detailHost.querySelector('[data-rack-host]'), {
      name: c.code, frontDoorState: c.frontDoor, rearDoorState: c.rearDoor, assets: c.assets, heightPx: h,
      onAssetClick: a => openDeviceInline(a)
    });
    if (det.asset) det.rack.select(det.asset.id);
  }
  let rackResizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(rackResizeTimer); rackResizeTimer = setTimeout(() => mountRack(false), 200); });

  function closeCabinetDetail() {
    if (det.rack) det.rack.destroy();
    det.rack = null;
    det.cab = null;
    det.asset = null;
    detailHost.classList.add('hidden');
    detailHost.innerHTML = '';
    state.selectedId = null;
    renderItems();
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !det.cab || document.querySelector('.fixed.inset-0.z-50')) return;
    if (det.asset) closeDeviceInline(); else closeCabinetDetail();
  });

  // Cihaz detayı: kabin panelinin yerinde sağdan kayarak açılır; kapatınca kabine dönülür
  function openDeviceInline(a) {
    const c = det.cab;
    if (!c || !a) return;
    det.asset = a;
    const range = 'U' + a.startU + (a.uSize > 1 ? '–U' + (a.startU + a.uSize - 1) : '');
    const cell = (label, value, mono) =>
      '<div class="p-2.5 rounded-[2px] bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 min-w-0">' +
        '<small class="text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400 block font-bold">' + label + '</small>' +
        '<strong class="' + (mono ? 'font-mono ' : '') + 'text-xs text-slate-900 dark:text-white block mt-0.5 truncate" title="' + esc(value || '-') + '">' + esc(value || '-') + '</strong></div>';
    const el = detailHost.querySelector('[data-device]');
    el.className = 'absolute inset-0 z-40 isolate device-slide-in';
    el.innerHTML =
      '<div class="h-full w-full flex flex-col bg-white dark:bg-slate-900">' +
        '<header class="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/90 flex items-center justify-between gap-3">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<button type="button" data-dev-back title="Kabine dön" class="w-8 h-8 flex items-center justify-center rounded-[2px] border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"><i class="pi pi-arrow-left text-xs"></i></button>' +
            '<div class="min-w-0"><h2 class="text-sm font-black text-slate-900 dark:text-white truncate">' + esc(a.displayName) + '</h2>' +
              '<p class="text-[10px] text-slate-500 dark:text-slate-400 truncate">Cihaz Detayları · ' + esc(c.code) + ' · ' + range + ' · ' + esc(a.assetType) + '</p></div>' +
          '</div>' +
          '<button type="button" data-dev-close title="Kapat" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-times text-sm"></i></button>' +
        '</header>' +
        '<div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar bg-slate-50/70 dark:bg-[#080d16] space-y-3">' +
          '<section class="space-y-1.5"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-id-card text-brand-500 text-[10px]"></i>Varlık Takip Bilgileri</div>' +
            '<div class="grid grid-cols-2 xl:grid-cols-3 gap-2">' +
              cell('Üretici', a.manufacturer) + cell('Model', a.model) + cell('Hostname', a.hostname, true) +
              cell('Tip', a.assetType) + cell('Seri Numarası', a.serial, true) + cell('IP Adresi', a.primaryIP || '—', true) +
              cell('Sahiplik', a.customer) + cell('Müşteri Tipi', a.customerType === 'internal' ? 'İç Müşteri' : 'Dış Müşteri') + cell('Atama Durumu', 'Kullanımda') +
            '</div></section>' +
          '<section class="space-y-1.5"><div class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-server text-brand-500 text-[10px]"></i>Fiziksel Altyapı Bilgileri</div>' +
            '<div class="grid grid-cols-2 xl:grid-cols-3 gap-2">' +
              cell('Lokasyon', F.name + ' · ' + (c.salon || '1. Salon') + ' · ' + c.pod) + cell('Kabin', c.code, true) + cell('Kabin İçi Pozisyon (U)', range, true) +
              cell('U Kapasitesi', a.uSize + 'U', true) + cell('Güç (Watt)', a.powerKw ? Math.round(a.powerKw * 1000) + ' W' : '—', true) + cell('Ağırlık (kg)', a.weight + ' kg', true) +
            '</div></section>' +
        '</div>' +
      '</div>';
    el.querySelector('[data-dev-back]').addEventListener('click', closeDeviceInline);
    el.querySelector('[data-dev-close]').addEventListener('click', closeDeviceInline);
  }
  function closeDeviceInline() {
    det.asset = null;
    const el = detailHost.querySelector('[data-device]');
    if (el) { el.className = 'hidden absolute inset-0 z-40 isolate'; el.innerHTML = ''; }
  }

  // ---------------------------------------------------------------------------
  // Kat seçimi
  // ---------------------------------------------------------------------------
  function selectFloor(fid, opts) {
    const o = opts || {};
    closeCabinetDetailSilently();
    F = T.floor(fid);
    state.floorId = F.id;
    state.salonId = '';
    state.selectedId = null;
    state.focusRects = null;
    state.pinnedFocus = false;
    state.activeMapId = null;
    state.mapQuery = '';
    stripScroll = 0;
    FIT = parseVb(F.layout.fitViewBox);
    if (!o.keepView || !state.vb) state.vb = Object.assign({}, FIT);
    else state.vb = Object.assign({}, FIT);
    try { sessionStorage.setItem('selectedSchemaId', F.schId); } catch (e) { /* yok say */ }
    buildItems();
    buildMapIndex();
    renderMap();
    applyVb();
    renderHeader();
    renderLeftPanel();
    renderStrip();
    renderLivePoints();
  }
  function closeCabinetDetailSilently() {
    if (det.rack) det.rack.destroy();
    det.rack = null; det.cab = null; det.asset = null;
    detailHost.classList.add('hidden');
    detailHost.innerHTML = '';
  }

  // ---------------------------------------------------------------------------
  // Sayfa raporu (başlıkta "PDF Raporu"): KPI şeridi + bütün kat sığdırılmış kroki görüntüsü
  // ---------------------------------------------------------------------------
  function exportReport() {
    const prev = Object.assign({}, state.vb);
    state.vb = Object.assign({}, FIT);
    applyVb();
    return DCIM.report.captureSvg(svg, 1800).then(img => {
      state.vb = prev;
      applyVb();
      const n = counts();
      const site = D.site;
      const tickets = site.tickets.newTickets + site.tickets.newMessages;
      const openDoors = F.cabinets.reduce((s, c) => s + (c.frontDoor === 'open' ? 1 : 0) + (c.rearDoor === 'open' ? 1 : 0), 0);
      const floorName = panelTitle();
      DCIM.report.generate({
        title: '2D Dijital İkiz',
        subtitle: floorName,
        filename: '2D_Dijital_Ikiz_' + F.id,
        kpis: [
          { label: 'Dış ortam', value: site.outdoor[0].val + ' °C' },
          { label: 'Anlık PUE', value: site.pue.toFixed(2), tone: 'info' },
          { label: 'Anlık CUE', value: site.cue.toFixed(2), tone: 'info' },
          { label: 'Alarm', value: n.alarm, tone: n.alarm ? 'alarm' : 'normal' },
          { label: 'Uyarı', value: n.warning, tone: n.warning ? 'warning' : 'normal' },
          { label: 'Haberleşme kaybı', value: n.lost, tone: n.lost ? 'lost' : 'normal' },
          { label: 'Ticket / mesaj', value: tickets, tone: tickets ? 'info' : 'normal' },
          { label: 'Açık kabin kapağı', value: openDoors, tone: openDoors ? 'alarm' : 'normal' }
        ],
        images: img ? [{ src: img, caption: 'Salon Şeması · ' + floorName }] : [],
        sections: [],
        notes: ['Krokinin raporun alındığı andaki canlı durumu; bütün kat sığdırıldı. Alarm sayaçları açık katın kayıtlarıdır.' + (img ? '' : ' Salon şeması görüntüsü alınamadı.')]
      }, 'pdf');
    });
  }
  DCIM.shell.setPageReport({ scopes: [{ id: 'page', label: 'Açık kat (salon şeması)' }], formats: ['pdf'], export: exportReport });

  // ---------------------------------------------------------------------------
  // Canlı veri hissi: 5 sn'de bir küçük sıcaklık dalgalanması (açık kat)
  // ---------------------------------------------------------------------------
  const jrnd = D.rng(98765);
  function jitter() {
    F.cabinets.forEach(c => {
      if (c.status !== 'normal') return;
      const d = (jrnd() - 0.5) * 0.2;
      c.tempLow = Math.round((c.tempLow + d) * 10) / 10;
      c.tempMid = Math.round((c.tempMid + d) * 10) / 10;
      c.tempTop = Math.round((c.tempTop + d) * 10) / 10;
    });
    const pue = document.querySelector('[data-pue]');
    if (pue) pue.textContent = (D.site.pue + (jrnd() - 0.5) * 0.02).toFixed(2);
    if (state.mode !== 'default') renderItems();
    if (det.cab && !det.asset) { const ps = detailHost.querySelector('[data-power-sensor]'); if (ps) ps.innerHTML = powerSensorHtml(det.cab); }
  }
  setInterval(jitter, 5000);

  // ---------------------------------------------------------------------------
  // Başlat: derin bağlantılar ve 3D'den gelen odak isteği
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const floorOfDigit = d => (D.floors.find(f => f.digit === d) || D.floors[0]).id;
  const floorParam = params.get('floor');
  let startFloor = 'T00';
  if (floorParam) {
    const byId = D.floors.find(f => f.id.toUpperCase() === floorParam.toUpperCase());
    startFloor = byId ? byId.id : floorOfDigit(parseInt(floorParam, 10) || 1);
  } else {
    try {
      const saved = sessionStorage.getItem('selectedSchemaId');
      const m = saved && D.floors.find(f => T.floor(f.id).schId === saved);
      if (m) startFloor = m.id;
    } catch (e) { /* yok say */ }
  }

  // 3D "2D Krokide Göster": tek seferlik hedef (2 dk'dan eski olan yok sayılır)
  let focusReq = null;
  try {
    const raw = sessionStorage.getItem('dt2d_focus_item');
    if (raw) {
      sessionStorage.removeItem('dt2d_focus_item');
      const r = JSON.parse(raw);
      if (r && r.sch && Date.now() - Number(r.ts || 0) <= 120000) focusReq = r;
    }
  } catch (e) { focusReq = null; }

  const cabParam = params.get('cabinet');
  const focusParam = params.get('focus');
  if (focusReq) {
    const m = D.floors.find(f => T.floor(f.id).schId === String(focusReq.sch));
    if (m) startFloor = m.id;
  } else if (cabParam && /^\d/.test(cabParam)) {
    startFloor = floorOfDigit(parseInt(cabParam.charAt(0), 10));
  } else if (focusParam) {
    const hit = D.floors.find(f => { const fm = T.floor(f.id); return [].concat(fm.climates, fm.ups, fm.panels).some(e => e.label.toUpperCase() === focusParam.toUpperCase()); });
    if (hit) startFloor = hit.id;
  }

  selectFloor(startFloor);
  const salonParam = params.get('salon');
  if (salonParam && F.salons.some(s => s.id === salonParam.toUpperCase())) {
    state.salonId = salonParam.toUpperCase();
    refreshTree();
    setTimeout(() => zoomToSalon(state.salonId), 250);
  }

  const up = v => String(v == null ? '' : v).trim().toUpperCase();
  const findItem = (id, devId, label) => (id && byId[id]) || items.find(i => devId && up(i.ref.devId) === up(devId)) || items.find(i => label && up(i.label) === up(label));
  function focusAndOpen(it, pinned) {
    if (!it) return;
    const entry = mapIndex.find(e => e.id === it.id);
    setTimeout(() => {
      // Kabin paneli önce açılır (kroki daralır), yakınlaştırma daralmış tuvale göre yapılır
      if (it.kind === 'cabinet') { state.selectedId = it.id; renderItems(); openCabinetDetail(it.ref); }
      requestAnimationFrame(() => {
        focusMapEntry(entry, pinned);
        if (it.kind !== 'cabinet' && !pinned) onItemClick(it);
      });
    }, 300);
  }
  if (focusReq) {
    const it = findItem(focusReq.id, focusReq.devId, focusReq.label);
    if (it) focusAndOpen(it, true); else console.warn('[2D] 3D\'den gelen öğe krokide bulunamadı:', focusReq);
  } else if (cabParam) {
    focusAndOpen(findItem(null, cabParam, cabParam), false);
  } else if (focusParam) {
    focusAndOpen(findItem(null, null, focusParam), false);
  }
})();
