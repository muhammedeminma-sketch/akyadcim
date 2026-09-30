/* ==========================================================================
   DCIM Sunum — Kapak Kilitleri Monitörü
   (NewUICMPLockMonitorComponent + monitor-toolbar, summary-cards,
    cabinet-topology-view, cabinet-card-grid, cabinet-table-view, cabinet-inline-detail)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtTime, button, buttonClasses, dialog, toast } = DCIM.ui;
  DCIM.shell.init({ active: 'locks' });

  const params = new URLSearchParams(window.location.search);
  const state = {
    floor: 'T00',
    viewMode: ['top', 'cards', 'table'].indexOf(params.get('view')) >= 0 ? params.get('view') : 'top',
    search: '',
    onlyOpen: false,
    loading: false,
    lastUpdated: null,
    selected: null,
    cabinets: [],
    // Top View viewBox
    vb: null,
    baseVb: null
  };

  const FLOOR_NAMES = { T00: 'Kat-1 (CMR/T00)', T02: 'Kat-2 (CMR/T02)', T03: 'Kat-3 (CMR/T03)', T04: 'Kat-4 (CMR/T04)' };
  // Kabin çiftlerinde ilk kolonun ön yüzü sağa (+X), ikinci kolonun ön yüzü sola bakar (soğuk koridor ortada)
  const FRONT_RIGHT_COLS = ['AS', 'AZ', 'BG', 'BN', 'BU', 'CB'];
  const frontOnRight = c => FRONT_RIGHT_COLS.indexOf(c.cabinetCode.slice(1, 3)) >= 0;

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  const stateLabel = s => (s === 'open' ? 'Açık' : s === 'closed' ? 'Kapalı' : 'Bilinmiyor');
  const doorIcon = s => (s === 'open' ? 'pi pi-lock-open' : s === 'closed' ? 'pi pi-lock' : 'pi pi-question-circle');
  const doorColor = s => (s === 'open' ? '#f43f5e' : s === 'closed' ? '#10b981' : '#64748b');
  const doorBadgeClass = s =>
    s === 'open' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 font-black'
      : s === 'closed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700';
  const lockText = p => {
    if (!p) return 'N/A';
    if (p.lockState === 'unlocked') return p.state === 'open' ? 'AÇIK (Kapak açık)' : 'KİLİT AÇIK';
    if (p.lockState === 'fault') return 'ARIZA';
    if (p.lockState === 'unknown') return 'BİLİNMİYOR';
    return 'KİLİTLİ';
  };
  const secondsLeft = c => (c.unlockUntil ? Math.max(0, Math.ceil((c.unlockUntil - Date.now()) / 1000)) : 0);

  function overallBadge(c) {
    const base = 'px-1.5 py-0.5 rounded-[2px] text-[8.5px] font-black uppercase tracking-wider border flex items-center gap-1';
    if (c.overallState === 'open') return '<span class="' + base + ' bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"><i class="pi pi-exclamation-triangle text-[8px]"></i>KAPAK AÇIK</span>';
    if (c.overallState === 'alarm') return '<span class="' + base + ' bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"><i class="pi pi-bell text-[8px]"></i>ALARM</span>';
    if (c.overallState === 'normal') return '<span class="' + base + ' bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"><i class="pi pi-lock text-[8px]"></i>KİLİTLİ</span>';
    return '<span class="' + base + ' bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700">BİLİNMİYOR</span>';
  }

  // Kart/Tablo görünümlerinde dikkat gerektiren kabinler önce listelenir
  const PRIORITY = { open: 0, alarm: 1, unknown: 2, normal: 3 };
  const byPriority = (a, b) => (PRIORITY[a.overallState] - PRIORITY[b.overallState]) || a.cabinetCode.localeCompare(b.cabinetCode);

  function visibleCabinets() {
    const q = state.search.trim().toLocaleLowerCase('tr-TR');
    return state.cabinets.slice().sort(byPriority).filter(c => {
      if (state.onlyOpen && c.overallState !== 'open') return false;
      if (!q) return true;
      return [c.cabinetCode, c.id, c.description, c.pod, c.room].some(v => String(v || '').toLocaleLowerCase('tr-TR').indexOf(q) >= 0);
    });
  }

  function counts() {
    let open = 0, closed = 0, unknown = 0, alarm = 0;
    state.cabinets.forEach(c => {
      [c.front, c.rear].forEach(p => {
        const s = p ? p.state : 'unknown';
        if (s === 'open') open++; else if (s === 'closed') closed++; else unknown++;
      });
      if (c.overallState === 'alarm' || c.alarmText) alarm++;
    });
    return { open, closed, unknown, alarm };
  }

  function openAlerts() {
    const list = [];
    state.cabinets.forEach(c => {
      if (c.front && c.front.state === 'open') list.push({ cabinet: c, side: 'front', point: c.front });
      if (c.rear && c.rear.state === 'open') list.push({ cabinet: c, side: 'rear', point: c.rear });
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Toolbar (monitor-toolbar.component)
  // ---------------------------------------------------------------------------
  function renderToolbar() {
    const el = document.getElementById('monitor-toolbar');
    const vBtn = (mode, icon, label, title) =>
      '<button type="button" data-view="' + mode + '" title="' + title + '" class="h-7 px-2 sm:px-2.5 text-[10px] font-black rounded-[2px] transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer ' +
      (state.viewMode === mode ? 'bg-white dark:bg-surface-card text-brand-600 dark:text-brand-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white') +
      '"><i class="pi ' + icon + ' text-[10px]"></i><span>' + label + '</span></button>';
    el.innerHTML =
      '<div class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between sm:justify-start">' +
        '<label class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">' +
          '<i class="pi pi-building text-brand-500"></i><span>Kat</span>' +
          '<select data-floor class="h-8 min-w-28 sm:min-w-32 rounded-[2px] border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-100 transition-colors cursor-pointer">' +
            DCIM.data.floors.map(f => '<option value="' + f.id + '"' + (f.id === state.floor ? ' selected' : '') + '>' + f.label + '</option>').join('') +
          '</select>' +
        '</label>' +
        '<span class="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"><i class="pi pi-database text-brand-500 text-[9px]"></i>CMR/' + state.floor + '</span>' +
        '<div class="inline-flex items-center rounded-[2px] p-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">' +
          vBtn('top', 'pi-th-large', 'Top View', 'Kuşbakışı Salon Görünümü (Top View)') +
          vBtn('cards', 'pi-id-card', 'Cards', 'Kart Görünümü') +
          vBtn('table', 'pi-table', 'Table', 'Detaylı Tablo Görünümü') +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">' +
        '<div class="relative min-w-0 flex-1 sm:w-48 lg:w-56">' +
          '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"></i>' +
          '<input type="search" data-search value="' + esc(state.search) + '" placeholder="Kabin, salon veya ID ara..." class="h-8 w-full rounded-[2px] border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-100 transition-colors" />' +
        '</div>' +
        '<button type="button" data-only-open class="h-8 shrink-0 rounded-[2px] border px-2.5 text-[10px] font-black transition-colors flex items-center gap-1.5 cursor-pointer ' +
          (state.onlyOpen ? 'border-rose-500/50 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800') + '">' +
          '<i class="pi pi-lock-open text-[11px]"></i><span class="hidden sm:inline">Sadece açıkları göster</span><span class="sm:hidden">Açık</span>' +
          (state.onlyOpen ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>' : '') +
        '</button>' +
        '<span class="shrink-0 inline-flex"><button type="button" data-refresh class="' + buttonClasses('secondary', 'md', false) + '"' + (state.loading ? ' disabled' : '') + '>' +
          '<i class="' + (state.loading ? 'pi pi-spin pi-spinner' : 'pi pi-refresh') + ' text-current shrink-0"></i><span class="truncate">Yenile</span></button></span>' +
      '</div>';

    el.querySelector('[data-floor]').addEventListener('change', e => { state.floor = e.target.value; state.selected = null; load(); });
    el.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { state.viewMode = b.getAttribute('data-view'); renderToolbar(); renderViews(); }));
    const search = el.querySelector('[data-search]');
    search.addEventListener('input', () => { state.search = search.value; renderViews(); });
    el.querySelector('[data-only-open]').addEventListener('click', () => { state.onlyOpen = !state.onlyOpen; renderToolbar(); renderViews(); });
    el.querySelector('[data-refresh]').addEventListener('click', () => load(true));
  }

  // ---------------------------------------------------------------------------
  // Summary Cards (summary-cards.component)
  // ---------------------------------------------------------------------------
  function renderSummary() {
    const n = counts();
    const el = document.getElementById('summary-cards');
    const total = n.open + n.closed + n.unknown;
    el.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 sm:p-3 shadow-2xs">' +
        '<div class="flex items-center justify-between text-slate-500 dark:text-slate-400"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">Toplam Kabin</span><i class="pi pi-server text-brand-500 text-sm"></i></div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">' + state.cabinets.length + '</span><span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">kabinet</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] text-slate-400 font-mono truncate">Aktif Topoloji İzleme · ' + total + ' kapak sensörü</div>' +
      '</div>' +
      '<div data-open-card title="Açık Kapaklar Güvenlik Uyarısını Aç" class="' + (n.open > 0 ? 'bg-rose-50/50 dark:bg-rose-950/25 border-rose-500/60 hover:border-rose-500 hover:shadow-xs active:scale-[0.99]' : 'bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle hover:border-slate-300') + ' border rounded-[2px] p-2.5 sm:p-3 shadow-2xs transition-all select-none cursor-pointer">' +
        '<div class="flex items-center justify-between ' + (n.open > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400') + '">' +
          '<div class="flex items-center gap-1.5"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">Açık Kapak</span>' + (n.open > 0 ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>' : '') + '</div>' +
          '<div class="flex items-center gap-1"><i class="pi pi-external-link text-[10px] opacity-70"></i><i class="pi pi-lock-open text-sm' + (n.open > 0 ? ' animate-pulse' : '') + '"></i></div>' +
        '</div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black tracking-tight ' + (n.open > 0 ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100') + '">' + n.open + '</span><span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">sensör</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] font-mono flex items-center justify-between gap-1 ' + (n.open > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-400') + '"><span class="truncate">' + (n.open > 0 ? 'Güvenlik Uyarısı' : 'Tüm Kapaklar Kapalı') + '</span>' + (n.open > 0 ? '<span class="text-[8px] sm:text-[8.5px] font-sans underline shrink-0">Gör →</span>' : '') + '</div>' +
      '</div>' +
      '<div class="bg-white dark:bg-surface-card border border-emerald-500/30 dark:border-emerald-500/40 rounded-[2px] p-2.5 sm:p-3 shadow-2xs">' +
        '<div class="flex items-center justify-between text-emerald-600 dark:text-emerald-400"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">Kilitli</span><i class="pi pi-lock text-sm"></i></div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 tracking-tight">' + n.closed + '</span><span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">sensör</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] text-emerald-600/80 dark:text-emerald-400/80 font-mono truncate">Güvenli &amp; Kilitli</div>' +
      '</div>' +
      '<div data-alarm-card class="' + (n.alarm > 0 ? 'bg-orange-50 dark:bg-orange-950/25 border-orange-500/60' : 'bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle') + ' border rounded-[2px] p-2.5 sm:p-3 shadow-2xs cursor-pointer transition-all" title="Alarmlı kabinleri listele">' +
        '<div class="flex items-center justify-between ' + (n.alarm > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400') + '"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">Alarmlı</span><i class="pi pi-bell text-sm' + (n.alarm > 0 ? ' animate-pulse' : '') + '"></i></div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black tracking-tight ' + (n.alarm > 0 ? 'text-orange-600 dark:text-orange-300' : 'text-slate-900 dark:text-slate-100') + '">' + n.alarm + '</span><span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">kabinet</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] text-slate-400 font-mono truncate">Yetkisiz erişim · Kilit arızası · ' + n.unknown + ' veri bekleyen</div>' +
      '</div>';
    el.querySelector('[data-open-card]').addEventListener('click', openDoorsModal);
    el.querySelector('[data-alarm-card]').addEventListener('click', alarmListModal);
  }

  function renderLastUpdated() {
    document.getElementById('last-updated').textContent = state.lastUpdated
      ? 'Son güncelleme: ' + fmtDateTime(state.lastUpdated)
      : 'Canlı veri bağlantısı kuruluyor';
  }

  // ---------------------------------------------------------------------------
  // Görünümler
  // ---------------------------------------------------------------------------
  function renderViews() {
    const host = document.getElementById('views');
    const list = visibleCabinets();
    if (rackCtl) { rackCtl.destroy(); rackCtl = null; }
    if (state.loading && !state.cabinets.length) {
      host.innerHTML = '<div class="h-full min-h-48 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400"><i class="pi pi-spin pi-spinner mr-2 text-brand-500"></i><span>Yükleniyor...</span></div>';
      return;
    }
    if (!list.length) {
      host.innerHTML = '<div class="min-h-48 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400"><i class="pi pi-filter-slash text-3xl mb-2 text-brand-500"></i><span class="text-sm font-semibold">Filtreye uyan kabin bulunamadı</span></div>';
      return;
    }
    if (state.viewMode === 'top') renderTopView(host, list);
    else if (state.viewMode === 'cards') renderCards(host, list);
    else renderTable(host, list);
  }

  // --- 1. Top View (cabinet-topology-view.component) -------------------------
  function computeBounds(list) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    list.forEach(c => { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h); });
    return { x: minX - 35, y: minY - 45, w: maxX - minX + 70, h: maxY - minY + 80 };
  }

  // Açılış ölçeği: tam sığdırmanın %150'si yeni %100 kabul edilir (Sığdır/Sıfırla buraya döner)
  const OPEN_ZOOM = 1.5;
  // Kabine odak: tam sığdırmanın 3.5 katı (orijinal focusOnCabinet)
  const FOCUS_ZOOM = 3.5;

  function renderTopView(host, list) {
    const all = state.cabinets;
    const bounds = computeBounds(all);
    if (!state.baseVb) {
      const w = bounds.w / OPEN_ZOOM, h = bounds.h / OPEN_ZOOM;
      state.fullVb = bounds;
      // Yatayda ortalı, dikeyde üst kenara hizalı (üst sıra POD başlıkları görünür kalsın)
      state.baseVb = { x: bounds.x + (bounds.w - w) / 2, y: bounds.y, w, h };
      state.vb = Object.assign({}, state.baseVb);
    }
    const visibleIds = new Set(list.map(c => c.id));

    // POD bölgeleri
    const pods = {};
    all.forEach(c => { (pods[c.pod] = pods[c.pod] || []).push(c); });
    const zones = Object.keys(pods).map(pod => {
      const b = computeBounds(pods[pod]);
      return { pod, x: b.x + 23, y: b.y + 33, w: b.w - 46, h: b.h - 58, count: pods[pod].length, open: pods[pod].filter(c => c.overallState === 'open').length };
    });

    const zoneSvg = zones.map(z =>
      '<g><rect class="pod-zone-panel" x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="4" stroke-dasharray="4,4" />' +
      '<rect class="pod-zone-header" x="' + z.x + '" y="' + (z.y - 22) + '" width="' + z.w + '" height="20" rx="3" />' +
      '<text class="pod-zone-title" x="' + (z.x + 8) + '" y="' + (z.y - 8) + '" font-size="9.5" font-family="system-ui, -apple-system, sans-serif" font-weight="800">' + esc(z.pod) + '</text>' +
      '<text class="pod-zone-count" x="' + (z.x + z.w - 8) + '" y="' + (z.y - 8) + '" font-size="9" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="end">' + z.count + ' Kabin' + (z.open ? ' · ' + z.open + ' açık' : '') + '</text></g>'
    ).join('');

    const cabSvg = all.map(c => {
      const dim = !visibleIds.has(c.id);
      const right = frontOnRight(c);
      const sel = state.selected && state.selected.id === c.id;
      const fX = right ? c.x + c.w - 10.5 : c.x + 3;
      const rX = right ? c.x + 3 : c.x + c.w - 10.5;
      const stripY = c.y + 5, stripH = c.h - 10;
      const fTextX = right ? fX - 3 : fX + 7.5 + 3;
      const rTextX = right ? rX + 7.5 + 3 : rX - 3;
      const edge = side => {
        const onRight = side === 'front' ? right : !right;
        const x = onRight ? c.x + c.w : c.x;
        return '<line x1="' + x + '" y1="' + (c.y + 2) + '" x2="' + x + '" y2="' + (c.y + c.h - 2) + '" stroke="#f43f5e" stroke-width="4.5" stroke-linecap="round" filter="url(#alarmGlowSvg)" />';
      };
      const fState = c.front ? c.front.state : 'unknown';
      const rState = c.rear ? c.rear.state : 'unknown';
      const glow = s => (s === 'open' ? ' filter="url(#alarmGlowSvg)"' : s === 'closed' ? ' filter="url(#greenGlowSvg)"' : '');
      return '<g class="cabinet-svg-item cursor-pointer' + (sel ? ' is-selected' : '') + '" data-cab="' + esc(c.id) + '"' + (dim ? ' opacity="0.18"' : '') + '>' +
        '<rect class="cabinet-rect" x="' + c.x + '" y="' + c.y + '" width="' + c.w + '" height="' + c.h + '" rx="3" />' +
        (fState === 'open' ? edge('front') : '') + (rState === 'open' ? edge('rear') : '') +
        (c.overallState === 'alarm' ? '<rect x="' + (c.x - 2) + '" y="' + (c.y - 2) + '" width="' + (c.w + 4) + '" height="' + (c.h + 4) + '" rx="4" fill="none" stroke="#f97316" stroke-width="1.6" stroke-dasharray="4 3" class="alarm-pulse" />' : '') +
        '<rect class="door-led-pill' + (fState === 'open' ? ' alarm-pulse' : '') + '" x="' + fX + '" y="' + stripY + '" width="7.5" height="' + stripH + '" rx="3.75" fill="' + doorColor(fState) + '"' + glow(fState) + ' />' +
        '<text class="cabinet-tag-f" x="' + fTextX + '" y="' + (c.y + c.h / 2 + 2.5) + '" font-size="7" font-weight="bold" text-anchor="' + (right ? 'end' : 'start') + '">F</text>' +
        '<text class="cabinet-code-text" x="' + (c.x + c.w / 2) + '" y="' + (c.y + c.h / 2 + 3.5) + '" font-size="9.5" font-weight="800" text-anchor="middle">' + esc(c.cabinetCode) + '</text>' +
        '<rect class="door-led-pill' + (rState === 'open' ? ' alarm-pulse' : '') + '" x="' + rX + '" y="' + stripY + '" width="7.5" height="' + stripH + '" rx="3.75" fill="' + doorColor(rState) + '"' + glow(rState) + ' />' +
        '<text class="cabinet-tag-r" x="' + rTextX + '" y="' + (c.y + c.h / 2 + 2.5) + '" font-size="7" font-weight="bold" text-anchor="' + (right ? 'start' : 'end') + '">R</text>' +
        (sel ? '<g><rect class="pod-active-badge-rect" x="' + (c.x + c.w / 2 - 20) + '" y="' + (c.y - 9) + '" width="40" height="8" rx="2" /><text x="' + (c.x + c.w / 2) + '" y="' + (c.y - 3) + '" font-size="5.5" font-family="system-ui, -apple-system, sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">DETAY AÇIK</text></g>' : '') +
      '</g>';
    }).join('');

    // Seçili kabin varsa sayfa ikiye bölünür: solda salon haritası, sağda inline detay (cabinet-inline-detail)
    const selected = state.selected;
    host.innerHTML =
      '<div class="lock-split w-full h-[70vh] sm:h-[calc(100vh-14rem)] min-h-[480px] sm:min-h-[600px] flex-1 flex flex-col lg:flex-row gap-2.5 sm:gap-3 items-stretch">' +
        '<div class="h-full rounded-[3px] overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 ' +
          (selected ? 'w-full lg:w-1/2 xl:w-[46%] h-[380px] lg:h-full shrink-0 lg:shrink' : 'w-full flex-1') + '">' +
          '<div class="relative w-full h-full min-h-[440px] flex-1 bg-slate-100 dark:bg-[#070c16] rounded-[2px] border border-slate-300 dark:border-slate-800 overflow-hidden select-none" data-topo>' +
            '<div class="absolute inset-0 pointer-events-none topology-grid-pattern"></div>' +
            '<div class="absolute top-2 sm:top-3 left-2 sm:left-3 z-30 flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-auto max-w-[calc(100%-1rem)]">' +
              '<div class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[2px] bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700/80 text-slate-800 dark:text-white text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 sm:gap-2 shadow-md backdrop-blur-xs">' +
                '<span class="w-2 h-2 rounded-full bg-sky-500 dark:bg-sky-400 animate-pulse"></span><span>' + FLOOR_NAMES[state.floor] + '</span><span class="text-slate-500 dark:text-slate-400 font-mono font-normal">(' + list.length + ' Kabinet)</span>' +
              '</div>' +
              '<div class="inline-flex items-center rounded-[2px] bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700/80 p-0.5 shadow-md backdrop-blur-xs">' +
                '<button type="button" data-topo-zoom="out" title="Uzaklaştır (Zoom Out)" class="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-minus text-xs"></i></button>' +
                '<span data-zoom-pct class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 px-2 min-w-11 text-center">100%</span>' +
                '<button type="button" data-topo-zoom="in" title="Yakınlaştır (Zoom In)" class="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-plus text-xs"></i></button>' +
                '<div class="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5"></div>' +
                '<button type="button" data-topo-fit title="Ekrana Sığdır (Fit to Screen)" class="px-2.5 h-7 flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-expand text-[10px]"></i><span>Sığdır</span></button>' +
                '<button type="button" data-topo-fit title="Görünümü Sıfırla (Reset View)" class="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-sync text-[10px]"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="absolute top-3 right-3 z-30 pointer-events-auto hidden md:flex items-center gap-3 px-3 py-1.5 rounded-[2px] bg-white/95 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-700/80 text-[10px] text-slate-700 dark:text-slate-300 shadow-md backdrop-blur-xs">' +
              '<div class="flex items-center gap-1.5"><span class="w-1.5 h-4.5 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]"></span><span>Kapalı</span></div>' +
              '<div class="flex items-center gap-1.5"><span class="w-1.5 h-4.5 rounded-full bg-[#f43f5e] shadow-[0_0_8px_#f43f5e] animate-pulse"></span><span class="text-rose-600 dark:text-rose-400 font-bold">Kapak Açık</span></div>' +
              '<div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-[2px] border border-dashed border-orange-500"></span><span class="text-orange-600 dark:text-orange-400 font-bold">Kilit Alarmı</span></div>' +
              '<div class="flex items-center gap-1.5"><span class="w-1.5 h-4.5 rounded-full bg-slate-400 dark:bg-slate-500"></span><span>Veri Yok</span></div>' +
            '</div>' +
            '<svg data-topo-svg class="w-full h-full cursor-grab active:cursor-grabbing select-none" viewBox="' + vbStr() + '" preserveAspectRatio="xMidYMid meet">' +
              '<defs>' +
                '<filter id="alarmGlowSvg" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#f43f5e" flood-opacity="0.9" /></filter>' +
                '<filter id="greenGlowSvg" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#10b981" flood-opacity="0.8" /></filter>' +
              '</defs>' +
              '<g>' + zoneSvg + '</g><g>' + cabSvg + '</g>' +
            '</svg>' +
            '<div class="absolute bottom-2.5 left-3 z-30 pointer-events-none text-[10px] text-slate-600 dark:text-slate-400 flex items-center gap-2 bg-white/95 dark:bg-slate-950/90 px-3 py-1.5 rounded-[2px] border border-slate-200 dark:border-slate-800 shadow-md"><i class="pi pi-arrows-alt text-brand-500 dark:text-brand-400"></i><span>Sürükle (Pan) · Tekerlek (Zoom) · Kabinete tıkla (Detay)</span></div>' +
          '</div>' +
        '</div>' +
        (selected ? '<div class="w-full lg:w-1/2 xl:w-[54%] h-[560px] lg:h-full flex-1 min-h-0" data-detail-host></div>' : '') +
      '</div>';
    bindTopView(host);
    updateZoomPct(host);
    if (selected) renderInlineDetail(host.querySelector('[data-detail-host]'), selected);
  }

  const vbStr = () => state.vb.x + ' ' + state.vb.y + ' ' + state.vb.w + ' ' + state.vb.h;
  function updateZoomPct(host) {
    const pct = host.querySelector('[data-zoom-pct]');
    if (pct) pct.textContent = Math.round((state.baseVb.w / state.vb.w) * 100) + '%';
  }

  function applyVb() {
    const host = document.getElementById('views');
    const svg = host.querySelector('[data-topo-svg]');
    if (svg) svg.setAttribute('viewBox', vbStr());
    updateZoomPct(host);
  }

  // viewBox animasyonu (orijinal animateViewBoxTo: 350 ms, easeOutCubic)
  let vbAnim = null;
  function stopVbAnim() { if (vbAnim) cancelAnimationFrame(vbAnim); vbAnim = null; }
  function animateVb(target, ms) {
    stopVbAnim();
    const start = Object.assign({}, state.vb), t0 = performance.now(), dur = ms || 350;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      ['x', 'y', 'w', 'h'].forEach(k => { state.vb[k] = start[k] + (target[k] - start[k]) * e; });
      applyVb();
      vbAnim = p < 1 ? requestAnimationFrame(step) : null;
    };
    vbAnim = requestAnimationFrame(step);
  }

  // Seçilen kabini ortalayıp yakınlaştırır; sonrasında pan/zoom serbest kalır
  function focusCabinet(c) {
    if (!c || !state.fullVb) return;
    const w = state.fullVb.w / FOCUS_ZOOM, h = w * (state.baseVb.h / state.baseVb.w);
    animateVb({ x: c.x + c.w / 2 - w / 2, y: c.y + c.h / 2 - h / 2, w, h });
  }

  function bindTopView(host) {
    const svg = host.querySelector('[data-topo-svg]');
    const apply = () => { stopVbAnim(); applyVb(); };
    const zoomAt = (factor, cx, cy) => {
      const nw = Math.max(state.baseVb.w * 0.12, Math.min(state.baseVb.w * 2.5, state.vb.w * factor));
      const nh = nw * (state.vb.h / state.vb.w);
      state.vb.x = cx - (cx - state.vb.x) * (nw / state.vb.w);
      state.vb.y = cy - (cy - state.vb.y) * (nh / state.vb.h);
      state.vb.w = nw; state.vb.h = nh;
      apply();
    };
    const toSvg = (clientX, clientY) => {
      const pt = svg.createSVGPoint();
      pt.x = clientX; pt.y = clientY;
      const m = svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : { x: state.vb.x + state.vb.w / 2, y: state.vb.y + state.vb.h / 2 };
    };
    host.querySelectorAll('[data-topo-zoom]').forEach(b => b.addEventListener('click', () => {
      zoomAt(b.getAttribute('data-topo-zoom') === 'in' ? 0.8 : 1.25, state.vb.x + state.vb.w / 2, state.vb.y + state.vb.h / 2);
    }));
    host.querySelectorAll('[data-topo-fit]').forEach(b => b.addEventListener('click', () => { state.vb = Object.assign({}, state.baseVb); apply(); }));
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y);
    }, { passive: false });

    let drag = null;
    svg.addEventListener('pointerdown', e => {
      stopVbAnim();
      drag ={ x: e.clientX, y: e.clientY, vx: state.vb.x, vy: state.vb.y, moved: false };
    });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          const rect = svg.getBoundingClientRect();
          const scale = Math.max(state.vb.w / rect.width, state.vb.h / rect.height);
          state.vb.x = drag.vx - dx * scale;
          state.vb.y = drag.vy - dy * scale;
          apply();
          hideTooltip();
          return;
        }
      }
      const g = e.target.closest('[data-cab]');
      if (g) showTooltip(state.cabinets.find(c => c.id === g.getAttribute('data-cab')), e);
      else hideTooltip();
    });
    const up = e => {
      if (drag && !drag.moved) {
        const g = e.target.closest('[data-cab]');
        if (g) selectCabinet(state.cabinets.find(c => c.id === g.getAttribute('data-cab')));
      }
      drag = null;
    };
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointerleave', () => { drag = null; hideTooltip(); });
  }

  let tooltipEl = null;
  function showTooltip(c, e) {
    if (!c) return;
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'fixed z-50 pointer-events-none transform -translate-x-1/2 -translate-y-full';
      document.body.appendChild(tooltipEl);
    }
    const doorRow = (label, p) =>
      '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400">' + label + '</span>' +
      '<span class="font-bold flex items-center gap-1 ' + (p && p.state === 'open' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '">' +
      '<span class="w-1.5 h-1.5 rounded-full ' + (p && p.state === 'open' ? 'bg-rose-500' : 'bg-emerald-500') + '"></span>' + stateLabel(p ? p.state : 'unknown') + '</span></div>';
    tooltipEl.innerHTML =
      '<div class="bg-white/95 dark:bg-slate-950/95 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-[3px] p-2.5 shadow-2xl text-xs min-w-[210px] max-w-[280px] backdrop-blur-md animate-popover-in" style="margin-bottom: 12px;">' +
        '<div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800"><div class="font-black text-slate-900 dark:text-white text-xs truncate">' + esc(c.cabinetCode) + '</div>' + overallBadge(c) + '</div>' +
        '<div class="py-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">' + FLOOR_NAMES[state.floor] + ' • ' + esc(c.room) + ' • ' + esc(c.pod) + '</div>' +
        '<div class="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-800/80 text-[11px]">' +
          doorRow('Ön Kapak:', c.front) + doorRow('Arka Kapak:', c.rear) +
          (c.alarmText ? '<div class="flex items-center gap-1 text-[10px] font-bold text-orange-600 dark:text-orange-400"><i class="pi pi-bell text-[9px]"></i>' + esc(c.alarmText) + '</div>' : '') +
          '<div class="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800/60 text-[9.5px] text-slate-500 dark:text-slate-400"><span>Veri Durumu:</span>' +
          '<span class="font-mono flex items-center gap-1 ' + (c.communicationState === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400') + '"><span class="w-1 h-1 rounded-full ' + (c.communicationState === 'online' ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + (c.communicationState === 'online' ? 'Güncel' : 'Veri Yok') + '</span></div>' +
        '</div>' +
      '</div>';
    tooltipEl.style.left = e.clientX + 'px';
    tooltipEl.style.top = e.clientY + 'px';
    tooltipEl.style.display = 'block';
  }
  function hideTooltip() { if (tooltipEl) tooltipEl.style.display = 'none'; }

  // --- 2. Cards (cabinet-card-grid.component) --------------------------------
  function doorBlockClass(s) {
    if (s === 'open') return 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300 font-bold';
    if (s === 'closed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold';
    return 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }

  function lockFooter(c) {
    const left = secondsLeft(c);
    const unlocked = (c.front && c.front.lockState === 'unlocked') || (c.rear && c.rear.lockState === 'unlocked');
    const fault = c.front && c.front.lockState === 'fault';
    let status;
    if (c.pending) status = '<span class="flex items-center gap-1.5 font-bold text-sky-600 dark:text-sky-400"><i class="pi pi-spin pi-spinner text-[10px]"></i>Komut gönderiliyor...</span>';
    else if (fault) status = '<span class="flex items-center gap-1.5 font-bold text-orange-600 dark:text-orange-400"><i class="pi pi-wrench text-[10px]"></i>Kilit motoru arızası</span>';
    else if (unlocked) status = '<span class="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400"><i class="pi pi-lock-open text-[10px]"></i>Kilit açık' + (left ? ' · <span data-countdown="' + esc(c.id) + '" class="font-mono">' + left + ' sn</span>' : '') + '</span>';
    else status = '<span class="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400"><i class="pi pi-lock text-[10px]"></i>Elektronik kilit aktif</span>';
    const canUnlock = !c.pending && !fault && c.communicationState === 'online';
    return '<div class="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-border-subtle bg-slate-50/50 dark:bg-slate-900/40 text-[10px]">' +
      '<div class="min-w-0 flex flex-col gap-0.5">' + status +
        (c.alarmText ? '<span class="flex items-center gap-1 text-[9px] font-bold text-orange-600 dark:text-orange-400 truncate"><i class="pi pi-bell text-[8px]"></i>' + esc(c.alarmText) + '</span>' : '') +
      '</div>' +
      '<button type="button" data-unlock="' + esc(c.id) + '"' + (canUnlock ? '' : ' disabled') + ' class="shrink-0 px-2 py-1 text-[10px] font-bold rounded-[2px] border border-sky-500/30 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">' +
        '<i class="pi pi-lock-open text-[9px]"></i><span>Kilidi Aç</span></button>' +
    '</div>';
  }

  function renderCards(host, list) {
    host.innerHTML = '<div class="pb-4"><div class="cabinet-grid grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5">' +
      list.map((c, i) =>
        '<article data-card="' + esc(c.id) + '" style="animation-delay:' + Math.min(i, 40) * 20 + 'ms" class="lock-card bg-white dark:bg-surface-card border rounded-[2px] overflow-hidden cursor-pointer transition-all ' +
          (state.selected && state.selected.id === c.id ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md' : 'border-slate-200 dark:border-border-subtle hover:border-slate-300 dark:hover:border-slate-600') + '">' +
          '<div class="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-border-subtle bg-slate-50/50 dark:bg-slate-900/40">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="w-7 h-7 flex items-center justify-center rounded-[2px] bg-brand-600 text-white shrink-0 shadow-xs"><i class="pi pi-server text-xs"></i></span>' +
              '<div class="min-w-0">' +
                '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5" title="' + esc(c.description) + '"><span>' + esc(c.cabinetCode) + '</span><span class="text-[10px] font-normal text-slate-500 truncate">' + esc(c.cabinet.customer) + '</span></h2>' +
                '<p class="text-[9px] font-mono text-slate-500 dark:text-slate-400 truncate" title="' + esc(c.id) + '">' + esc(c.id) + '<span class="ml-1 px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-[8px] font-bold text-sky-600 dark:text-sky-400">' + esc(c.pod) + '</span></p>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' + overallBadge(c) + '<i class="pi pi-chevron-right text-[10px] text-slate-400"></i></div>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-2 p-3">' +
            [{ label: 'Ön Kapak', p: c.front }, { label: 'Arka Kapak', p: c.rear }].map(d => {
              const s = d.p ? d.p.state : 'unknown';
              return '<div class="door-state rounded-[2px] border p-2.5 transition-all ' + doorBlockClass(s) + '">' +
                '<div class="flex items-center justify-between gap-1 mb-1.5"><span class="text-[10px] font-bold uppercase tracking-wide truncate">' + d.label + '</span><i class="' + doorIcon(s) + ' text-sm"></i></div>' +
                '<div class="text-sm font-black uppercase">' + stateLabel(s) + '</div>' +
                '<div class="mt-1 text-[8.5px] font-mono opacity-75 truncate" title="' + esc(d.p ? d.p.sourceId : '-') + '">' + esc(d.p ? d.p.sourceId : '-') + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
          lockFooter(c) +
        '</article>'
      ).join('') + '</div></div>';
    host.querySelectorAll('[data-card]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('[data-unlock]')) return;
      selectCabinet(state.cabinets.find(c => c.id === el.getAttribute('data-card')));
    }));
    bindUnlockButtons(host);
  }

  function bindUnlockButtons(scope) {
    scope.querySelectorAll('[data-unlock]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      const c = state.cabinets.find(x => x.id === b.getAttribute('data-unlock'));
      if (c) requestUnlock(c);
    }));
  }

  // --- 3. Table (cabinet-table-view.component) -------------------------------
  function overallStatusCell(c) {
    const map = {
      open: ['bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30', 'pi pi-exclamation-triangle', 'Açık Kapak'],
      alarm: ['bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-500/30', 'pi pi-bell', 'Alarm'],
      normal: ['bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/30', 'pi pi-shield', 'Normal']
    };
    const m = map[c.overallState] || ['bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700', 'pi pi-question-circle', 'Bilinmiyor'];
    return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-black uppercase tracking-wider border ' + m[0] + '"><i class="' + m[1] + ' text-[9px]"></i>' + m[2] + '</span>';
  }

  function renderTable(host, list) {
    const door = p => {
      const s = p ? p.state : 'unknown';
      return '<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-wider ' + doorBadgeClass(s) + '"><i class="' + doorIcon(s) + ' text-[9px]"></i>' + stateLabel(s) + '</span>';
    };
    host.innerHTML = '<div class="pb-4"><div class="w-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden shadow-2xs flex flex-col"><div class="overflow-x-auto">' +
      '<table class="w-full text-left border-collapse text-xs"><thead><tr class="border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">' +
        '<th class="px-3.5 py-2.5">Kabinet (Cabinet)</th><th class="px-3.5 py-2.5">POD / Konum</th><th class="px-3.5 py-2.5 text-center">Ön Kapak (Front)</th><th class="px-3.5 py-2.5 text-center">Arka Kapak (Rear)</th>' +
        '<th class="px-3.5 py-2.5">Elektronik Kilit</th><th class="px-3.5 py-2.5">Veri Akışı</th><th class="px-3.5 py-2.5">Güvenlik Durumu</th><th class="px-3.5 py-2.5 text-right">İşlem</th>' +
      '</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
      list.map(c =>
        '<tr data-row="' + esc(c.id) + '" class="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors' + (state.selected && state.selected.id === c.id ? ' bg-brand-50/50 dark:bg-brand-950/20' : '') + '">' +
          '<td class="px-3.5 py-2.5 font-bold text-slate-900 dark:text-slate-100"><div class="flex items-center gap-2.5">' +
            '<div class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs shrink-0 ' + (c.overallState === 'open' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') + '"><i class="pi pi-server"></i></div>' +
            '<div><div class="font-black text-slate-900 dark:text-slate-100 leading-tight flex items-center gap-1.5"><span>' + esc(c.cabinetCode) + '</span><span class="text-[9px] font-mono text-slate-400 font-normal">(' + esc(c.id) + ')</span></div>' +
            '<div class="text-[10px] font-normal text-slate-500 dark:text-slate-400 truncate max-w-[220px]" title="' + esc(c.description) + '">' + esc(c.cabinet.customer) + '</div></div>' +
          '</div></td>' +
          '<td class="px-3.5 py-2.5 text-[11px] text-slate-600 dark:text-slate-300"><span class="inline-flex items-center gap-1 font-mono text-[10px] bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-[2px] border border-slate-200 dark:border-slate-700"><i class="pi pi-map-marker text-[9px] text-brand-500"></i>' + esc(c.pod) + '</span></td>' +
          '<td class="px-3.5 py-2.5 text-center">' + door(c.front) + '</td>' +
          '<td class="px-3.5 py-2.5 text-center">' + door(c.rear) + '</td>' +
          '<td class="px-3.5 py-2.5 text-[10px] font-mono font-bold ' + (c.front && c.front.lockState === 'unlocked' ? 'text-rose-600 dark:text-rose-400' : c.front && c.front.lockState === 'fault' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300') + '">' + lockText(c.front) + '</td>' +
          '<td class="px-3.5 py-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400"><span class="inline-flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full ' + (c.communicationState === 'online' ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + (c.communicationState === 'online' ? 'Güncel (10s)' : 'Bilinmiyor') + '</span></td>' +
          '<td class="px-3.5 py-2.5">' + overallStatusCell(c) + '</td>' +
          '<td class="px-3.5 py-2.5 text-right whitespace-nowrap">' +
            '<button type="button" data-unlock="' + esc(c.id) + '"' + (c.communicationState === 'online' && !c.pending ? '' : ' disabled') + ' class="px-2.5 py-1 text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 rounded-[2px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"><i class="pi pi-lock-open mr-1 text-[8px]"></i>Kilidi Aç</button>' +
            '<button type="button" data-detail="' + esc(c.id) + '" class="px-2.5 py-1 text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-500/10 rounded-[2px] transition-colors cursor-pointer">Detay<i class="pi pi-arrow-right ml-1 text-[8px]"></i></button>' +
          '</td>' +
        '</tr>'
      ).join('') + '</tbody></table></div></div></div>';
    host.querySelectorAll('[data-row]').forEach(r => r.addEventListener('click', e => {
      if (e.target.closest('[data-unlock]')) return;
      selectCabinet(state.cabinets.find(c => c.id === r.getAttribute('data-row')));
    }));
    bindUnlockButtons(host);
  }

  // ---------------------------------------------------------------------------
  // Açık Kapaklar Modalı (lock-monitor.component.html)
  // ---------------------------------------------------------------------------
  function openDoorsModal() {
    const alerts = openAlerts();
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none animate-fade-in';
    host.innerHTML =
      '<div data-panel class="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 border border-rose-500/50 rounded-[4px] shadow-2xl flex flex-col overflow-hidden animate-popover-in">' +
        '<div class="px-5 py-3.5 bg-rose-500/10 border-b border-rose-500/30 flex items-center justify-between gap-3 shrink-0">' +
          '<div class="flex items-center gap-2.5"><span class="alert-pulse"><i class="pi pi-exclamation-triangle text-rose-600 dark:text-rose-400"></i></span>' +
          '<div><h3 class="text-sm font-black text-rose-700 dark:text-rose-200">Açık Kapaklar (Güvenlik Uyarısı)</h3><p class="text-[10px] text-slate-500 dark:text-slate-400">Fiziksel kilit ve kapak sensörlerinden gelen anlık alarm listesi</p></div></div>' +
          '<div class="flex items-center gap-2"><span class="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10px] font-black text-white shadow-xs">' + alerts.length + ' AÇIK</span>' +
          '<button type="button" data-close title="Kapat" class="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-times text-xs"></i></button></div>' +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-2 bg-slate-50/50 dark:bg-slate-950/40">' +
          (alerts.length === 0
            ? '<div class="py-10 text-center text-slate-500 dark:text-slate-400"><i class="pi pi-shield text-3xl text-emerald-500 mb-2"></i><p class="text-xs font-bold text-slate-800 dark:text-slate-200">Şu anda açık durumda kapak bulunmamaktadır.</p><p class="text-[10px] text-slate-400 mt-0.5">Tüm kabin kapakları güvenli ve kilitli durumdadır.</p></div>'
            : alerts.map(a =>
              '<div data-alert="' + esc(a.cabinet.id) + '" title="Kabin Detayını Aç" class="flex items-center gap-3 rounded-[3px] border border-rose-500/30 bg-white dark:bg-surface-card p-3 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 hover:border-rose-500/60 cursor-pointer transition-all shadow-2xs group">' +
                '<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs group-hover:scale-105 transition-transform"><i class="pi pi-lock-open text-sm animate-pulse"></i></div>' +
                '<div class="min-w-0 flex-1">' +
                  '<div class="flex items-center justify-between gap-2"><div class="truncate text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-2"><span>' + esc(a.cabinet.cabinetCode) + '</span><span class="text-[10px] font-normal text-slate-500 truncate">(' + esc(a.cabinet.cabinet.customer) + ')</span></div>' +
                  '<span class="shrink-0 font-mono text-[9.5px] font-bold text-slate-400">' + esc(a.cabinet.floor) + ' • ' + esc(a.cabinet.room) + ' • ' + esc(a.cabinet.pod) + '</span></div>' +
                  '<div class="mt-1 flex items-center justify-between text-[10px]"><div class="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold">' +
                    '<span class="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 uppercase text-[9px]">' + (a.side === 'front' ? 'Ön Kapak' : 'Arka Kapak') + '</span>' +
                    '<span class="text-[9.5px] font-normal text-slate-400 truncate" title="' + esc(a.point.description) + '">Sensör: ' + esc(a.point.sourceId) + '</span></div>' +
                  '<span class="text-[9.5px] text-sky-600 dark:text-sky-400 font-bold group-hover:underline">Kabin Detayını Gör →</span></div>' +
                  (a.cabinet.alarmText ? '<div class="mt-1 text-[9.5px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1"><i class="pi pi-bell text-[8px]"></i>' + esc(a.cabinet.alarmText) + '</div>' : '') +
                '</div>' +
              '</div>').join('')) +
        '</div>' +
        '<div class="px-5 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">' +
          '<span class="text-[10px] text-slate-500 dark:text-slate-400">Toplam <strong>' + alerts.length + '</strong> açık kapak uyarısı</span>' +
          '<button type="button" data-close class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] rounded-[2px] cursor-pointer transition-colors">Kapat</button>' +
        '</div>' +
      '</div>';
    const close = () => host.remove();
    host.addEventListener('click', e => { if (!e.target.closest('[data-panel]')) close(); });
    host.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    host.querySelectorAll('[data-alert]').forEach(el => el.addEventListener('click', () => {
      close();
      selectCabinet(state.cabinets.find(c => c.id === el.getAttribute('data-alert')));
    }));
    document.body.appendChild(host);
  }

  function alarmListModal() {
    const list = state.cabinets.filter(c => c.overallState === 'alarm' || c.alarmText);
    const d = dialog({
      title: 'Alarmlı Kabinler',
      subtitle: list.length + ' kabinde kilit/erişim alarmı',
      variant: 'warning',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-2xl',
      body: list.length === 0 ? '<p class="text-xs">Alarmlı kabin bulunmuyor.</p>' :
        '<div class="space-y-2">' + list.map(c =>
          '<div data-goto="' + esc(c.id) + '" class="flex items-center justify-between gap-3 p-2.5 rounded-[3px] border border-orange-500/30 bg-orange-500/5 hover:border-orange-500/60 cursor-pointer transition-colors">' +
            '<div class="flex items-center gap-2.5 min-w-0"><span class="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0"><i class="pi pi-bell text-xs"></i></span>' +
            '<div class="min-w-0"><div class="text-xs font-black text-slate-900 dark:text-slate-100">' + esc(c.cabinetCode) + ' <span class="text-[10px] font-normal text-slate-500">' + esc(c.pod) + '</span></div>' +
            '<div class="text-[10px] font-bold text-orange-600 dark:text-orange-400 truncate">' + esc(c.alarmText || 'Haberleşme kaybı') + '</div></div></div>' +
            overallBadge(c) +
          '</div>').join('') + '</div>'
    });
    d.body.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
      d.close();
      selectCabinet(state.cabinets.find(c => c.id === el.getAttribute('data-goto')));
    }));
  }

  // ---------------------------------------------------------------------------
  // Uzaktan kilit açma simülasyonu
  // ---------------------------------------------------------------------------
  function requestUnlock(c, presetSide) {
    const radio = (val, label, checked) =>
      '<label class="flex items-center gap-2 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 cursor-pointer hover:border-sky-500/50">' +
      '<input type="radio" name="unlock-side" value="' + val + '"' + (checked ? ' checked' : '') + ' style="accent-color: #0ea5e9;" /><span class="font-bold text-slate-800 dark:text-slate-200">' + label + '</span></label>';
    dialog({
      title: 'Uzaktan Kilit Açma',
      subtitle: c.cabinetCode + ' · ' + c.pod + ' · Elektronik kilit',
      variant: 'warning',
      confirmLabel: 'Kilidi Aç',
      confirmIcon: 'pi pi-lock-open',
      body:
        '<div class="space-y-3">' +
          '<p class="text-xs text-slate-600 dark:text-slate-300">Kilit, komut sonrası <b>15 saniye</b> açık kalır ve kapak açılmazsa otomatik olarak yeniden kilitlenir. İşlem denetim kaydına (audit log) yazılır.</p>' +
          '<div class="grid grid-cols-3 gap-2 text-[11px]">' + radio('front', 'Ön Kapak', presetSide !== 'rear') + radio('rear', 'Arka Kapak', presetSide === 'rear') + radio('both', 'Her İkisi', false) + '</div>' +
          '<div class="flex flex-col gap-1"><label class="text-xs font-semibold text-slate-700 dark:text-slate-300">Erişim Nedeni</label>' +
            '<select data-reason class="scada-select"><option>Planlı bakım (İş Emri)</option><option>Müşteri ziyareti eşliği</option><option>Donanım değişimi / kurulum</option><option>Acil durum müdahalesi</option></select></div>' +
        '</div>',
      onConfirm: host => {
        const sideEl = host.querySelector('input[name="unlock-side"]:checked');
        const side = sideEl ? sideEl.value : 'front';
        const reason = host.querySelector('[data-reason]').value;
        performUnlock(c, side, reason);
      }
    });
  }

  function performUnlock(c, side, reason) {
    const user = DCIM.session.user();
    const sides = side === 'both' ? ['front', 'rear'] : [side];
    c.pending = true;
    refreshCabinetViews(c);
    toast(c.cabinetCode + ' için kilit açma komutu kilit denetleyicisine gönderildi.', 'info', 'Komut Gönderildi');
    setTimeout(() => {
      c.pending = false;
      sides.forEach(s => { if (c[s]) c[s].lockState = 'unlocked'; });
      c.unlockUntil = Date.now() + 15000;
      sides.forEach(s => c.accessLog.unshift({ tim: new Date(), user: user.fullname || user.usr, card: 'UZAKTAN', dept: 'DCIM Operatör Konsolu', side: s, event: 'Uzaktan kilit açma — ' + reason, result: 'remote' }));
      refreshCabinetViews(c);
      toast(c.cabinetCode + ' ' + (side === 'both' ? 'ön ve arka' : side === 'front' ? 'ön' : 'arka') + ' kilit açıldı. 15 sn içinde otomatik kilitlenecek.', 'success', 'Kilit Açıldı');
      clearTimeout(c.relockTimer);
      c.relockTimer = setTimeout(() => {
        sides.forEach(s => { if (c[s] && c[s].state !== 'open') c[s].lockState = 'locked'; });
        c.unlockUntil = 0;
        sides.forEach(s => c.accessLog.unshift({ tim: new Date(), user: 'Sistem', card: '—', dept: 'Kilit Sistemi', side: s, event: 'Otomatik yeniden kilitleme (kapak açılmadı)', result: 'system' }));
        refreshCabinetViews(c);
        toast(c.cabinetCode + ' kilidi otomatik olarak yeniden kilitlendi.', 'info');
      }, 15000);
    }, 1200);
  }

  function refreshCabinetViews() {
    renderViews();
  }

  // Geri sayım göstergelerini saniyede bir güncelle
  setInterval(() => {
    document.querySelectorAll('[data-countdown]').forEach(el => {
      const c = state.cabinets.find(x => x.id === el.getAttribute('data-countdown'));
      if (c) el.textContent = secondsLeft(c) + ' sn';
    });
  }, 1000);

  // ---------------------------------------------------------------------------
  // Kabin Inline Detay Paneli (cabinet-inline-detail + cabinet-detail-info)
  // Orijinaldeki gibi popup/çekmece değil: Top View sayfayı ikiye böler.
  // ---------------------------------------------------------------------------
  let rackCtl = null;

  function selectCabinet(c) {
    if (!c) return;
    hideTooltip();
    state.selected = c;
    state.viewMode = 'top';
    renderToolbar();
    renderViews();
    focusCabinet(c);
  }

  function closeDetail() {
    state.selected = null;
    renderViews();
    animateVb(state.baseVb);
  }

  function renderInlineDetail(el, c) {
    el.innerHTML =
      '<div class="h-full w-full flex flex-col rounded-[3px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden select-none">' +
        '<header class="shrink-0 px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/90 flex items-center justify-between gap-3">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<div class="w-8 h-8 rounded-[3px] flex items-center justify-center shrink-0 border shadow-xs ' + (c.overallState === 'open' ? 'bg-rose-500/15 border-rose-500/30 text-rose-500 dark:text-rose-400' : 'bg-brand-500/15 border-brand-500/30 text-brand-600 dark:text-brand-400') + '"><i class="pi pi-server text-sm"></i></div>' +
            '<div class="min-w-0">' +
              '<div class="flex items-center gap-2">' +
                '<h2 class="text-xs sm:text-sm font-black text-slate-900 dark:text-white tracking-wide truncate" title="' + esc(c.description || c.id) + '">' + esc(c.description || c.id || 'Kabinet Detayı') + '</h2>' +
                '<span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded-[2px] shrink-0 border uppercase ' + (c.overallState === 'open' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300 border-rose-500/30 animate-pulse' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30') + '">' + (c.overallState === 'open' ? 'Kapak Açık' : 'Güvenli') + '</span>' +
              '</div>' +
              '<p class="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">' +
                '<span class="font-mono font-bold text-slate-700 dark:text-slate-300">' + esc(c.id) + '</span><span>•</span><span>' + esc(c.floor) + '</span>' +
                (c.pod ? '<span>•</span><span class="text-sky-600 dark:text-sky-400 font-semibold">' + esc(c.pod) + '</span>' : '') +
                '<span>•</span><span>' + esc(c.room || 'Ana Salon') + '</span>' +
              '</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-1.5 shrink-0">' +
            '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(c.cabinetCode) + '" title="Kabin Yönetim Ekranını Aç" class="px-2.5 sm:px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white font-bold text-[11px] rounded-[2px] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"><span class="hidden sm:inline">Kabin Ekranı</span><i class="pi pi-arrow-up-right text-[10px]"></i></a>' +
            '<button type="button" data-close-detail title="Detay Panelini Kapat (Tam Ekrana Dön)" class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-[2px] transition-colors cursor-pointer"><i class="pi pi-times text-xs sm:text-sm"></i></button>' +
          '</div>' +
        '</header>' +
        '<div class="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 custom-scrollbar bg-slate-50/70 dark:bg-[#080d16]">' +
          '<div class="grid grid-cols-1 xl:grid-cols-12 gap-3.5 sm:gap-4 items-start">' +
            '<div class="xl:col-span-6 space-y-2">' +
              '<div class="flex items-center justify-between px-1"><span class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-box text-brand-500 dark:text-brand-400 text-[10px]"></i>İzometrik Kabin Görünümü</span><span class="text-[9px] font-mono text-slate-500">Pure 3D DCIM Rack</span></div>' +
              '<div class="relative w-full rounded-[3px] overflow-hidden select-none shadow-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-transparent" data-rack></div>' +
            '</div>' +
            '<div class="xl:col-span-6 space-y-2">' +
              '<div class="flex items-center justify-between px-1"><span class="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-info-circle text-brand-500 dark:text-brand-400 text-[10px]"></i>Kabin &amp; Sensör Detayları</span><span class="text-[9px] font-mono text-slate-500">Canlı XDB Noktaları</span></div>' +
              '<div data-info></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    el.querySelector('[data-close-detail]').addEventListener('click', closeDetail);

    rackCtl = DCIM.components.createRack3d(el.querySelector('[data-rack]'), {
      name: c.cabinetCode,
      frontDoorState: c.front ? c.front.state : 'closed',
      rearDoorState: c.rear ? c.rear.state : 'closed',
      assets: c.assets,
      heightPx: Math.round(560 * DCIM.theme.scale() / 100),
      onAssetClick: a => DCIM.components.assetDetail(a, c.cabinetCode)
    });
    renderDetailInfo(c);
  }

  function renderDetailInfo(c) {
    const info = document.querySelector('#views [data-info]');
    if (!info) return;
    const section = (icon, title, badge, body) =>
      '<section class="bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-[3px] p-3 shadow-2xs space-y-2">' +
        '<div class="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800"><span class="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="' + icon + ' text-[10px]"></i>' + title + '</span>' + badge + '</div>' +
        body +
      '</section>';
    const doorSection = (side, p) => {
      const s = p ? p.state : 'unknown';
      const left = secondsLeft(c);
      return section('pi ' + (side === 'front' ? 'pi-arrow-circle-right' : 'pi-arrow-circle-left') + ' text-sky-500', side === 'front' ? 'Ön Kapak (Front Door)' : 'Arka Kapak (Rear Door)',
        '<span class="px-2 py-0.5 rounded-[2px] text-[9.5px] font-black uppercase tracking-wider flex items-center gap-1 ' + doorBadgeClass(s) + '"><i class="' + doorIcon(s) + ' text-[9px]"></i>' + stateLabel(s) + '</span>',
        '<div class="space-y-1.5 text-[11px]">' +
          '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400">Kapak Durumu:</span><span class="font-black uppercase ' + (s === 'open' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200') + '">' + (s === 'open' ? 'AÇIK (OPEN)' : s === 'closed' ? 'KAPALI (CLOSED)' : 'BİLİNMİYOR') + '</span></div>' +
          '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400">IO Source ID:</span><span class="font-mono text-slate-700 dark:text-slate-300 font-bold">' + esc(p ? p.sourceId : 'N/A') + '</span></div>' +
          '<div class="flex items-start justify-between gap-2"><span class="text-slate-500 dark:text-slate-400 shrink-0">Açıklama:</span><span class="text-right text-slate-600 dark:text-slate-300 truncate">' + esc(p ? p.description : 'N/A') + '</span></div>' +
          '<div class="flex items-center justify-between pt-1 border-t border-dashed border-slate-100 dark:border-slate-800/80 text-[10px]">' +
            '<span class="text-slate-400">Elektronik Kilit Durumu:</span>' +
            '<span class="font-mono font-bold ' + (p && p.lockState === 'unlocked' ? 'text-rose-600 dark:text-rose-400' : p && p.lockState === 'fault' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + lockText(p) + (p && p.lockState === 'unlocked' && left ? ' · <span data-countdown="' + esc(c.id) + '">' + left + ' sn</span>' : '') + '</span>' +
          '</div>' +
          '<div class="pt-1"><button type="button" data-unlock-side="' + side + '"' + (c.pending || (p && (p.lockState === 'unlocked' || p.lockState === 'fault' || p.lockState === 'unknown')) ? ' disabled' : '') + ' class="w-full px-3 py-1.5 text-[11px] font-bold rounded-[2px] border border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-600 hover:text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">' +
            (c.pending ? '<i class="pi pi-spin pi-spinner text-[10px]"></i><span>Komut gönderiliyor...</span>' : '<i class="pi pi-lock-open text-[10px]"></i><span>' + (side === 'front' ? 'Ön' : 'Arka') + ' Kilidi Uzaktan Aç</span>') + '</button></div>' +
        '</div>');
    };
    const resultBadge = r => {
      const m = {
        granted: ['bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', 'Yetkili'],
        denied: ['bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30', 'Reddedildi'],
        remote: ['bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30', 'Uzaktan'],
        system: ['bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700', 'Sistem']
      }[r] || ['', r];
      return '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-black uppercase tracking-wider border ' + m[0] + '">' + m[1] + '</span>';
    };
    const logRows = c.accessLog.slice(0, 40).map(l =>
      '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">' +
        '<td class="py-1.5 px-2 font-mono text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">' + fmtDateTime(l.tim) + '</td>' +
        '<td class="py-1.5 px-2"><div class="font-bold text-[11px] ' + (l.result === 'denied' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200') + '">' + esc(l.user) + '</div><div class="text-[9px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[160px]">' + esc(l.card) + ' · ' + esc(l.dept) + '</div></td>' +
        '<td class="py-1.5 px-2 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 whitespace-nowrap">' + (l.side === 'front' ? 'Ön' : 'Arka') + '</td>' +
        '<td class="py-1.5 px-2 text-[10px] text-slate-600 dark:text-slate-300">' + esc(l.event) + '</td>' +
        '<td class="py-1.5 px-2 text-right">' + resultBadge(l.result) + '</td>' +
      '</tr>').join('');
    const cab = c.cabinet;
    info.innerHTML =
      '<div class="space-y-3 text-xs">' +
        (c.alarmText ? '<div class="p-2 rounded-[3px] bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/30 dark:border-orange-500/40 text-orange-700 dark:text-orange-300 text-xs font-bold flex items-center gap-2"><i class="pi pi-bell text-base text-orange-500 shrink-0"></i><span class="truncate">ALARM: ' + esc(c.alarmText) + '</span></div>' : '') +
        section('pi pi-server text-brand-500', 'Genel Bilgiler', '<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold border border-brand-500/20">42U STANDARD</span>',
          '<div class="grid grid-cols-2 gap-2 text-[11px]">' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Kabin Adı</span><span class="font-black text-slate-900 dark:text-slate-100 truncate block">' + esc(c.cabinetCode) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Kabin Kodu / ID</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200 truncate block">' + esc(c.id) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Kat (Floor)</span><span class="font-bold text-slate-800 dark:text-slate-200">' + esc(c.floor) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Salon / Room</span><span class="font-bold text-slate-800 dark:text-slate-200">' + esc(c.room) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">POD / Koridor (Row)</span><span class="font-bold text-slate-800 dark:text-slate-200">' + esc(c.pod) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Sahip Müşteri</span><span class="font-bold text-slate-800 dark:text-slate-200 truncate block">' + esc(cab.customer) + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">U Doluluk</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200">' + c.usedU + ' / 42 U</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Anlık Güç</span><span class="font-mono font-bold text-emerald-600 dark:text-emerald-400">' + cab.powerKw.toFixed(1) + ' kW</span></div>' +
          '</div>') +
        doorSection('front', c.front) +
        doorSection('rear', c.rear) +
        section('pi pi-id-card text-brand-500', 'Kart Okuma Geçmişi', '<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-600 dark:text-slate-400 font-bold">Son 48 saat · ' + c.accessLog.length + ' olay</span>',
          '<div class="max-h-72 overflow-y-auto custom-scrollbar border border-slate-200 dark:border-slate-800 rounded-[2px]">' +
            '<table class="w-full text-left text-xs"><thead class="sticky top-0 bg-slate-100 dark:bg-slate-800 text-[9.5px] uppercase tracking-wider text-slate-500 dark:text-slate-400"><tr><th class="py-1.5 px-2">Zaman</th><th class="py-1.5 px-2">Personel / Kart</th><th class="py-1.5 px-2">Kapak</th><th class="py-1.5 px-2">Olay</th><th class="py-1.5 px-2 text-right">Sonuç</th></tr></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800">' + logRows + '</tbody></table>' +
          '</div>') +
        section('pi pi-database text-brand-500', 'Veri & Haberleşme', '<span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Canlı Kilit DAS</span>',
          '<div class="grid grid-cols-2 gap-2 text-[11px]">' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Haberleşme Durumu</span><span class="font-black text-slate-900 dark:text-slate-100 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ' + (c.communicationState === 'online' ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + (c.communicationState === 'online' ? 'Çevrimiçi (Online)' : 'Çevrimdışı') + '</span></div>' +
            '<div><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Son Veri Güncelleme</span><span class="font-mono text-slate-800 dark:text-slate-200">' + fmtTime(state.lastUpdated || new Date()) + '</span></div>' +
            '<div class="col-span-2"><span class="block text-[9.5px] font-bold text-slate-400 uppercase">Veri Yaşı (Data Age)</span><span class="font-mono text-slate-700 dark:text-slate-300">' + (c.communicationState === 'online' ? 'Canlı Akış (10s döngü)' : 'Son veri 34 dk önce alındı') + '</span></div>' +
          '</div>') +
      '</div>';
    info.querySelectorAll('[data-unlock-side]').forEach(b => b.addEventListener('click', () => requestUnlock(c, b.getAttribute('data-unlock-side'))));
  }

  // ---------------------------------------------------------------------------
  // Veri yükleme (XDB_GetValue simülasyonu)
  // ---------------------------------------------------------------------------
  function load(manual) {
    state.loading = true;
    if (!manual) { stopVbAnim(); state.cabinets = []; state.baseVb = null; }
    renderToolbar();
    renderViews();
    setTimeout(() => {
      state.cabinets = DCIM.data.getLockFloor(state.floor);
      state.lastUpdated = new Date();
      state.loading = false;
      renderToolbar();
      renderSummary();
      renderLastUpdated();
      renderViews();
      if (manual) toast('Kilit telemetrisi CMR/' + state.floor + ' kaynağından yenilendi.', 'success');
    }, manual ? 450 : 350);
  }

  // 10 sn canlı akış zaman damgası
  setInterval(() => { if (!state.loading && state.cabinets.length) { state.lastUpdated = new Date(); renderLastUpdated(); } }, 10000);

  load(false);
  // Diğer sayfalardan ?cabinet=CODE ile gelinmişse inline detay panelini aç
  const target = params.get('cabinet');
  if (target) setTimeout(() => selectCabinet(state.cabinets.find(c => c.cabinetCode === target)), 450);
})();
