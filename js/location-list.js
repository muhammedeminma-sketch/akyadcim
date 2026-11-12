/* ==========================================================================
   DCIM Sunum — Lokasyon Şeması / Lokasyon Listesi (NewUICMPLocationListComponent)
   Kaynak: new-ui/pages/assets/location-list/location-list.component.{html,ts}
           + shared/components/data-table (app-data-table: arama, sütun filtre satırı, Online rozeti,
             [table-actions] yuvasında app-report-export-menu, 50 satır/sayfa, mobil kart görünümü)
   Orijinal: düz 3 kolonlu liste (Lokasyon ID / Lokasyon Adı / Tam Lokasyon Adı), mobilde kart
   (rid = başlık, ad = vurgulu satır, tam ad = ikinci satır); rapor: "Lokasyon Listesi Raporu"
   (kapsam "Filtrelenmiş liste", seçenek 'limit', birim 'lokasyon').
   Sunum eklemeleri: kurgusal kampüsün hiyerarşik ağacı (DCA 3 kat + DCB + açık alan > Salon > Pod > Kabin),
   alan / şema / kabin kapasitesi / aktif sensör kolonları + özet kartları, Yeni / Düzenle / Alt Lokasyon formu.
   Arama, sütun filtreleri, filtre satırı, sayfa ve açık düğümler sessionStorage 'dcim_loc_list_state'
   ile tutulur (sayfadan ayrılıp dönünce süzgeçler korunur; URL parametresi verilirse o geçerlidir).
   Veri: DCIM.data.locations (js/mock-data.js) — XDBT LOC_List sorgusunun yerine.
   Derin bağlantılar:
     ?q=<metin>           genel arama (ör. ?q=1DU06, ?q=KGK, ?q=POD-15)
     ?focus=<ID|kabin>    ağacı o düğüme açar ve satırı vurgular (ör. ?focus=L201108, ?focus=2EA05)
     ?expand=all|none     tüm düğümleri aç / kapat
     ?filter=1            sütun filtre satırını açık başlat
     ?edit=<ID>           düzenleme formunu aç (ör. ?edit=L201100)
     ?new=1[&parent=<ID>] yeni lokasyon formunu aç (ör. ?new=1&parent=L202000)
     ?report=1            rapor menüsünü açık başlat
     ?reset=1             kayıtlı süzgeç durumunu temizle
   Eski sunum kimlikleri (L015605, L015675, L015676, L015677, L015799, L015842) yeni kimliklere yönlendirilir.
   Şema bağlantıları: 2d.html?floor=N[&salon=S2] / 3d.html?floor=N (salon), 2d.html?cabinet=<kod> / 3d.html?cabinet=<kod> (pod, kabin)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtNum, toast, dialog, buttonClasses, storage } = DCIM.ui;
  const kit = DCIM.kit;
  const L = DCIM.data.locations;
  DCIM.shell.init({ active: 'locations' });

  const PATH_PREFIX = L.root;
  const STORE_KEY = 'dcim_loc_list_state';
  // Önceki sunum sürümündeki bağlantılar için kimlik eşlemesi
  const LEGACY = { L015605: 'L200000', L015675: 'L201000', L015676: 'L202000', L015677: 'L203000', L015799: 'L201100', L015842: 'L201108' };
  const TYPE_BY = {};
  L.types.forEach(t => { TYPE_BY[t.value] = t; });
  const SCHEMA_BY = {};
  L.schemas.forEach(s => { SCHEMA_BY[s.id] = s; });

  // Tip renkleri (ikon / etiket)
  const TYPE_ICON_CLS = {
    building: 'text-sky-500', floor: 'text-sky-400', hall: 'text-emerald-500', pod: 'text-violet-400', cabinet: 'text-slate-400',
    energy: 'text-amber-500', network: 'text-cyan-500', storage: 'text-slate-400', room: 'text-slate-400', outdoor: 'text-orange-400', virtual: 'text-purple-400'
  };
  const TYPE_CHIP_CLS = {
    building: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
    floor: 'bg-sky-500/5 text-sky-600 dark:text-sky-400 border-sky-500/20',
    hall: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    pod: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
    energy: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    network: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30'
  };
  const CHIP_DEFAULT = 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700';
  const STATUS_DOT = { alarm: 'bg-rose-500', warning: 'bg-amber-500', lost: 'bg-orange-500', normal: 'bg-emerald-500' };
  const STATUS_LABEL = { alarm: 'Alarm', warning: 'Uyarı', lost: 'Veri Alınamıyor', normal: 'Normal' };
  const RANK = { alarm: 3, lost: 2, warning: 1, normal: 0 };

  const lower = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
  const params = new URLSearchParams(window.location.search);
  const legacy = v => (v && LEGACY[String(v).toUpperCase()]) || v;

  // ---------------------------------------------------------------------------
  // Durum (location-list.component.ts alanları + ağaç durumu) — sessionStorage'dan geri yüklenir
  // ---------------------------------------------------------------------------
  const nodes = L.nodes;
  let byId = {};
  let kids = {};
  if (params.get('reset') === '1') storage.sessionRemove(STORE_KEY);
  let saved = null;
  try { saved = JSON.parse(storage.sessionGet(STORE_KEY) || 'null'); } catch (e) { saved = null; }
  const urlDriven = ['q', 'focus', 'filter', 'expand', 'edit', 'new'].some(k => params.has(k));
  if (urlDriven) saved = null;
  const state = {
    cnt1: 0,                 // 0: Online (con1), 1: Yükleniyor (con0), diğer: Bağlantı Hatası (conE)
    showFilters: params.get('filter') === '1' || !!(saved && saved.showFilters),
    filters: Object.assign({ rid: '', name: '', full: '' }, saved && saved.filters),
    q: params.get('q') || (saved && saved.q) || '',
    page_cur: (saved && saved.page_cur) || 0,
    page_rng: (saved && saved.page_rng) || 50,   // orijinal data-table pageSize = 50
    page_total: 0,
    total_records: 0,
    expanded: new Set(saved && saved.expanded ? saved.expanded : L.defaultExpanded),
    collapsed: new Set(saved && saved.collapsed ? saved.collapsed : []),
    highlight: ''
  };
  function saveState() {
    storage.sessionSet(STORE_KEY, JSON.stringify({
      q: state.q, filters: state.filters, showFilters: state.showFilters, page_cur: state.page_cur, page_rng: state.page_rng,
      expanded: Array.from(state.expanded), collapsed: Array.from(state.collapsed)
    }));
  }
  let agg = {};

  function reindex() {
    byId = {};
    kids = {};
    nodes.forEach(n => { byId[n.rid] = n; });
    nodes.forEach(n => { const p = n.parent || ''; (kids[p] = kids[p] || []).push(n); });
    computeAgg();
  }
  const childrenOf = rid => kids[rid || ''] || [];
  const roots = () => childrenOf('');
  const ancestors = n => { const out = []; let p = n.parent ? byId[n.parent] : null; while (p) { out.push(p); p = p.parent ? byId[p.parent] : null; } return out; };

  // Alt lokasyon toplamları (alan, kapasite, kurulu kabin, sensör, en kötü durum, şema sayısı)
  function computeAgg() {
    agg = {};
    const walk = n => {
      const ka = childrenOf(n.rid).map(walk);
      const sum = f => ka.reduce((s, a) => s + a[f], 0);
      const isCab = n.type === 'cabinet';
      const area = n.area != null ? n.area : sum('area') + (n.extraArea || 0);
      const installed = isCab ? 1 : (ka.length ? sum('installed') : (n.installed || 0));
      let capacity = isCab ? 0 : (n.capacity != null ? n.capacity : sum('capacity'));
      if (!isCab) capacity = Math.max(capacity, installed);
      const sensA = (n.sensors ? n.sensors.active : 0) + sum('sensA');
      const sensT = (n.sensors ? n.sensors.total : 0) + sum('sensT');
      let status = n.status || 'normal';
      ka.forEach(a => { if (RANK[a.status] > RANK[status]) status = a.status; });
      const ownSchema = n.schemaId && n.type !== 'pod' && n.type !== 'cabinet' ? 1 : 0;
      const a = { area, installed, capacity, sensA, sensT, status, schemas: ownSchema + sum('schemas'), autoArea: n.area == null && ka.length > 0, autoCap: n.capacity == null && ka.length > 0 };
      agg[n.rid] = a;
      return a;
    };
    roots().forEach(walk);
  }

  // ---------------------------------------------------------------------------
  // Filtre / arama (applySearch + buildTableWhere: rid / name / full_name içerir, VE; büyük-küçük harf duyarsız)
  // ---------------------------------------------------------------------------
  const filterActive = () => !!(state.q.trim() || state.filters.rid || state.filters.name || state.filters.full);
  function matches(n) {
    const f = state.filters;
    if (f.rid && lower(n.rid).indexOf(lower(f.rid.trim())) < 0) return false;
    if (f.name && lower(n.name).indexOf(lower(f.name.trim())) < 0) return false;
    if (f.full && lower(n.full_name).indexOf(lower(f.full.trim())) < 0) return false;
    const q = lower(state.q.trim());
    if (q) {
      const s = SCHEMA_BY[n.schemaId];
      const hay = [n.rid, n.name, n.full_name, n.desc, (TYPE_BY[n.type] || {}).label, s && n.type === 'hall' ? s.name : ''].map(lower).join(' ');
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  // Görünür satırlar (ağaç düzleştirilmiş)
  function visibleRows() {
    const active = filterActive();
    let show = null;
    let matchSet = null;
    if (active) {
      matchSet = new Set();
      show = new Set();
      nodes.forEach(n => {
        if (!matches(n)) return;
        matchSet.add(n.rid);
        show.add(n.rid);
        ancestors(n).forEach(a => show.add(a.rid));
      });
    }
    const rows = [];
    const walk = (n, depth) => {
      if (show && !show.has(n.rid)) return;
      const ch = childrenOf(n.rid);
      // Filtre modunda: eşleşmeye giden atalar zorla açılır; yalnızca eşleşen düğüm elle açılırsa tüm alt öğeleri gösterilir
      const isMatch = !!(matchSet && matchSet.has(n.rid));
      const forced = !!(show && ch.some(c => show.has(c.rid)) && !state.collapsed.has(n.rid));
      const manual = state.expanded.has(n.rid) && (!show || isMatch);
      const open = ch.length > 0 && (manual || forced);
      rows.push({ n, depth, open, hasKids: ch.length > 0, matched: isMatch });
      if (!open) return;
      ch.forEach(c => {
        if (show && !show.has(c.rid)) {
          if (manual) rows.push({ n: c, depth: depth + 1, open: false, hasKids: childrenOf(c.rid).length > 0, matched: false });
          return;
        }
        walk(c, depth + 1);
      });
    };
    roots().forEach(r => walk(r, 0));
    return rows;
  }

  // ---------------------------------------------------------------------------
  // HTML yardımcıları
  // ---------------------------------------------------------------------------
  const TOOL_BTN = 'px-2.5 py-1 max-lg:py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer';
  const FILTER_INPUT = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const M_FILTER_INPUT = 'w-full h-10 px-2.5 text-base font-medium rounded-[3px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0b121e] text-slate-900 dark:text-slate-50 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const PAGE_BTN = 'w-7 h-7 max-lg:w-9 max-lg:h-9 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer';
  const TH = 'py-2 px-2 text-left font-bold bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap';
  const FTH = 'py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal';
  const MARK = 'bg-amber-300/50 dark:bg-amber-400/25 text-inherit rounded-[1px] px-px';

  function hl(text, needles) {
    let s = String(text == null ? '' : text);
    const list = needles.filter(Boolean).map(x => lower(String(x).trim())).filter(Boolean);
    if (!list.length) return esc(s);
    const low = lower(s);
    for (const nd of list) {
      const i = low.indexOf(nd);
      if (i >= 0 && low.length === s.length) {
        return esc(s.slice(0, i)) + '<mark class="' + MARK + '">' + esc(s.slice(i, i + nd.length)) + '</mark>' + esc(s.slice(i + nd.length));
      }
    }
    return esc(s);
  }
  const fmtArea = v => (v >= 100 ? fmtNum(Math.round(v), 0) : fmtNum(v, v % 1 ? (v < 10 ? 2 : 1) : 0));
  const fillCls = pct => (pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500');

  function capacityBar(used, total, unit) {
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return '<div class="flex items-center gap-2 justify-end max-lg:justify-start">' +
      '<span class="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">' + used + '<span class="text-slate-400 font-medium"> / ' + total + (unit || '') + '</span></span>' +
      '<div class="h-1 w-14 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shrink-0" title="Doluluk %' + pct + '"><div class="h-full ' + fillCls(pct) + '" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  // 2D/3D şema düğmeleri: salon → kat (ve salon) görünümü, pod / kabin → kabin odağı
  function schemaChips(s, n, muted) {
    return s.kinds.map(k => {
      let href = k === '2D' ? s.href2d : s.href3d;
      if (href && n && n.schemaFocus && (n.type === 'pod' || n.type === 'cabinet')) href = (k === '2D' ? '2d.html' : '3d.html') + '?cabinet=' + encodeURIComponent(n.schemaFocus);
      else if (href && n && n.schemaSalon && k === '2D') href += '&salon=' + encodeURIComponent(n.schemaSalon);
      if (href) {
        return '<a href="' + esc(href) + '" data-stop class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-extrabold border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors" title="' +
          esc((n && n.schemaFocus && n.type !== 'hall' ? n.schemaFocus + ' konumunu ' : 'Şemayı ') + k + ' dijital ikizde aç') + '"><i class="' + (k === '2D' ? 'pi pi-map' : 'pi pi-box') + ' text-[9px]"></i>' + k + '</a>';
      }
      return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-extrabold border border-slate-300 dark:border-slate-700 text-slate-400' + (muted ? ' opacity-70' : '') +
        '" title="Bu şema sunumda açılamaz (yalnız DCA katları)"><i class="pi pi-map text-[9px]"></i>' + k + '</span>';
    }).join('');
  }

  function schemaCell(n, a) {
    const s = SCHEMA_BY[n.schemaId];
    if (s && (n.type === 'pod' || n.type === 'cabinet')) {
      return '<div class="flex items-center gap-1">' + schemaChips(s, n, true) +
        (n.schemaFocus ? '' : '<span class="text-[10px] text-slate-400 ml-1 truncate">Salon şeması</span>') + '</div>';
    }
    if (s) {
      return '<div class="flex items-center gap-1.5 min-w-0">' +
        '<span class="font-semibold text-slate-800 dark:text-slate-200 truncate" title="' + esc(s.id) + '">' + hl(s.name, [state.q]) + '</span>' +
        '<span class="flex items-center gap-1 shrink-0">' + schemaChips(s, n, false) + '</span></div>';
    }
    if (a.schemas > 0) return '<span class="text-[10px] text-slate-500 dark:text-slate-400">Alt lokasyonlarda ' + a.schemas + ' şema</span>';
    if (n.type === 'cabinet' || n.type === 'pod') return '<span class="text-slate-400">—</span>';
    return '<span class="text-[11px] italic text-slate-400">Atanmadı</span>';
  }

  // ---------------------------------------------------------------------------
  // İskelet (app-page-header + özet kartları + app-data-table düzeni)
  // ---------------------------------------------------------------------------
  const root = document.getElementById('loc-root');
  root.innerHTML =
    kit.pageHeader({
      title: 'LOKASYON LİSTESİ',
      breadcrumbs: [{ label: 'Varlık Yönetimi' }, { label: 'LOKASYON LİSTESİ' }],
      actions: '<button type="button" data-act="new" class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer select-none max-lg:hidden"><i class="pi pi-plus text-xs"></i><span>Yeni Lokasyon</span></button>'
    }).replace('mb-3 pb-2', 'shrink-0 mb-0 pb-2') +
    '<div class="shrink-0 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 select-none max-lg:hidden" id="loc-kpis"></div>' +
    '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden flex-1 min-h-0 flex flex-col w-full">' +
      // Araç çubuğu (data-table üst çubuğu): solda arama, sağda bağlantı rozeti + rapor menüsü + ağaç / filtre / yenile
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 select-none max-lg:flex-col max-lg:items-stretch max-lg:gap-2">' +
        '<div class="flex items-center gap-2 max-lg:w-full">' +
          '<div class="relative w-60 sm:w-72 max-lg:w-full max-lg:flex-1 max-lg:min-w-0">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
            '<input id="loc-q" type="text" autocomplete="off" placeholder="Ara" class="w-full pl-8 pr-7 py-1 max-lg:py-2.5 text-xs max-lg:text-sm bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
            '<button type="button" data-act="clear-q" class="hidden absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[10px] cursor-pointer" title="Temizle"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<span class="text-slate-400 font-normal text-[11px] whitespace-nowrap max-lg:hidden" id="loc-pageinfo"></span>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-1.5 shrink-0 max-lg:w-full">' +
          '<span id="loc-con"></span>' +
          '<div id="loc-report"></div>' +
          '<button type="button" data-act="expand-all" class="' + TOOL_BTN + '" title="Tüm alt lokasyonları aç"><i class="pi pi-angle-double-down text-xs"></i><span>Tümünü Aç</span></button>' +
          '<button type="button" data-act="collapse-all" class="' + TOOL_BTN + '" title="Tüm alt lokasyonları kapat"><i class="pi pi-angle-double-up text-xs"></i><span>Tümünü Kapat</span></button>' +
          '<button type="button" data-act="clear-filters" title="Temizle" class="hidden px-2.5 py-1 text-xs rounded-[2px] border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 items-center transition-all cursor-pointer"><i class="pi pi-filter-slash text-xs"></i></button>' +
          '<button type="button" data-act="filter" title="Filtreyi Aç/Kapat"></button>' +
          '<button type="button" data-act="refresh" class="' + TOOL_BTN + '" title="Yenile"><i class="pi pi-refresh text-xs"></i><span>Yenile</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto max-lg:hidden custom-scrollbar" id="loc-scroll">' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" id="loc-head"></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" id="loc-body"></tbody>' +
        '</table>' +
      '</div>' +
      // Mobil kart görünümü (lg altı): filtre paneli + kartlar
      '<div class="' + kit.CARDS_WRAP_CLS + '" id="loc-cards-wrap"><div id="loc-mfilter"></div><div id="loc-cards" class="space-y-1.5"></div></div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0 select-none" id="loc-footer"></div>' +
    '</div>';

  const $ = id => document.getElementById(id);
  const qInput = $('loc-q');
  qInput.value = state.q;

  // ---------------------------------------------------------------------------
  // Özet kartları (sunum eklemesi)
  // ---------------------------------------------------------------------------
  function renderKpis() {
    const count = t => nodes.filter(n => n.type === t).length;
    const tot = roots().reduce((s, r) => {
      const a = agg[r.rid];
      s.area += a.area; s.inst += a.installed; s.cap += a.capacity; s.sa += a.sensA; s.st += a.sensT;
      return s;
    }, { area: 0, inst: 0, cap: 0, sa: 0, st: 0 });
    const occ = tot.cap ? Math.round((tot.inst / tot.cap) * 100) : 0;
    const card = (icon, iconCls, label, value, sub) =>
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs px-3 py-2 flex items-center gap-2.5 min-w-0">' +
        '<span class="w-8 h-8 rounded-[2px] flex items-center justify-center shrink-0 border ' + iconCls + '"><i class="' + icon + ' text-sm"></i></span>' +
        '<div class="min-w-0">' +
          '<div class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">' + esc(label) + '</div>' +
          '<div class="text-sm font-extrabold font-mono text-slate-900 dark:text-slate-100 leading-tight truncate">' + value + '</div>' +
          (sub ? '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">' + sub + '</div>' : '') +
        '</div>' +
      '</div>';
    $('loc-kpis').innerHTML =
      card('pi pi-building', 'bg-sky-500/10 text-sky-500 border-sky-500/20', 'Bina', count('building'), count('floor') + ' kat') +
      card('pi pi-th-large', 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', 'DC Salonu', count('hall'), nodes.filter(n => n.type === 'hall' && n.schemaId).length + ' salonda şema atanmış') +
      card('pi pi-table', 'bg-violet-500/10 text-violet-400 border-violet-500/20', 'Koridor / Pod', count('pod'), count('cabinet') + ' kabin kayıtlı') +
      card('pi pi-server', 'bg-amber-500/10 text-amber-500 border-amber-500/20', 'Kabin (Kurulu / Kapasite)', fmtNum(tot.inst, 0) + '<span class="text-slate-400 font-medium"> / ' + fmtNum(tot.cap, 0) + '</span>', 'Doluluk %' + occ) +
      card('pi pi-wifi', 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', 'Aktif Sensör', fmtNum(tot.sa, 0) + '<span class="text-slate-400 font-medium"> / ' + fmtNum(tot.st, 0) + '</span>', (tot.st - tot.sa) + ' sensörden veri alınamıyor') +
      card('pi pi-expand', 'bg-slate-500/10 text-slate-400 border-slate-500/20', 'Toplam Alan', fmtNum(Math.round(tot.area), 0) + ' m²', 'Kapalı + açık alan');
  }

  // ---------------------------------------------------------------------------
  // Tablo başlığı + sütun filtre satırı (data-table showFilters)
  // ---------------------------------------------------------------------------
  const FILTER_DEFS = [
    { key: 'rid', label: 'Lokasyon ID', ph: 'Lokasyon ID Ara...' },
    { key: 'name', label: 'Lokasyon Adı', ph: 'Lokasyon Adı Ara...' },
    { key: 'full', label: 'Tam Lokasyon Adı', ph: 'Tam Lokasyon Adı Ara...' }
  ];
  const fInput = (key, ph, cls) => '<input type="text" data-f="' + key + '" value="' + esc(state.filters[key] || '') + '" placeholder="' + esc(ph) + '" autocomplete="off" class="' + cls + '">';

  function renderHead() {
    let h = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      '<th class="' + TH + ' w-[110px]">Lokasyon ID</th>' +
      '<th class="' + TH + ' min-w-[300px]">Lokasyon Adı</th>' +
      '<th class="' + TH + ' loc-full-col">Tam Lokasyon Adı</th>' +
      '<th class="' + TH + '">Tip</th>' +
      '<th class="' + TH + ' text-right">Alan (m²)</th>' +
      '<th class="' + TH + '">2D/3D Şema</th>' +
      '<th class="' + TH + ' text-right">Kabin Kapasitesi</th>' +
      '<th class="' + TH + ' text-right">Aktif Sensör</th>' +
      '<th class="' + TH + ' text-right w-[92px]">İşlem</th>' +
    '</tr>';
    if (state.showFilters) {
      h += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        '<th class="' + FTH + '">' + fInput('rid', 'Filtre', FILTER_INPUT) + '</th>' +
        '<th class="' + FTH + '">' + fInput('name', 'Filtre', FILTER_INPUT) + '</th>' +
        '<th class="' + FTH + ' loc-full-col">' + fInput('full', 'Filtre', FILTER_INPUT) + '</th>' +
        '<th class="' + FTH + '" colspan="6"></th></tr>';
    }
    $('loc-head').innerHTML = h;
    // Mobil filtre paneli (data-table mobil kart görünümü)
    const activeCount = FILTER_DEFS.filter(d => state.filters[d.key]).length;
    $('loc-mfilter').innerHTML = state.showFilters
      ? '<div class="rounded-[3px] border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-surface-card shadow-sm overflow-hidden mb-1.5">' +
          '<div class="h-11 pl-3 pr-1 flex items-center gap-2.5 border-b border-slate-100 dark:border-border-subtle">' +
            '<span class="w-7 h-7 shrink-0 rounded-[2px] flex items-center justify-center bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400"><i class="pi pi-filter text-[11px]"></i></span>' +
            '<span class="flex-1 min-w-0 flex items-center gap-2 text-[13.5px] font-bold text-slate-900 dark:text-slate-100">Filtre' +
              (activeCount ? '<span class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full! bg-sky-600 text-white text-[10px] font-bold tabular-nums">' + activeCount + '</span>' : '') + '</span>' +
            '<button type="button" data-act="filter" aria-label="Kapat" class="w-10 h-10 shrink-0 flex items-center justify-center text-slate-400 dark:text-slate-500 cursor-pointer"><i class="pi pi-times text-[13px]"></i></button>' +
          '</div>' +
          '<div class="grid grid-cols-1 gap-y-3 p-3">' +
            FILTER_DEFS.map(d => '<div class="min-w-0"><label class="block mb-1 text-[10.5px] font-semibold uppercase tracking-wider truncate text-slate-500 dark:text-slate-400">' + esc(d.label) + '</label>' + fInput(d.key, d.ph, M_FILTER_INPUT) + '</div>').join('') +
          '</div>' +
          '<div class="flex gap-2 px-3 pb-3">' +
            '<button type="button" data-act="clear-filters" class="flex-1 h-10 flex items-center justify-center gap-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[13px] font-semibold cursor-pointer"><i class="pi pi-filter-slash text-[11px]"></i>Temizle</button>' +
            '<button type="button" data-act="filter" class="flex-[2] min-w-0 h-10 px-3 flex items-center justify-center gap-1.5 bg-sky-600 text-white text-[13px] font-semibold shadow-xs cursor-pointer"><i class="pi pi-check text-[11px]"></i><span class="truncate" id="loc-mfilter-n"></span></button>' +
          '</div>' +
        '</div>'
      : '';
    // Filtre / Temizle düğmeleri
    const fb = root.querySelector('[data-act="filter"][title]');
    fb.className = 'px-2.5 py-1 max-lg:py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
      (state.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    fb.innerHTML = '<i class="pi pi-filter text-xs"></i><span>Filtre</span>' + (activeCount && !state.showFilters ? '<span class="min-w-[16px] h-[16px] px-1 inline-flex items-center justify-center rounded-full! bg-sky-600 text-white text-[9px] font-bold">' + activeCount + '</span>' : '');
    const cb = root.querySelector('[data-act="clear-filters"][title]');
    cb.classList.toggle('hidden', !state.showFilters);
    cb.classList.toggle('flex', state.showFilters);
  }

  function toggleFilters() {
    state.showFilters = !state.showFilters;
    renderHead();
    saveState();
    if (state.showFilters) {
      const el = root.querySelector(window.matchMedia('(min-width: 64rem)').matches ? '#loc-head [data-f="rid"]' : '#loc-mfilter [data-f="rid"]');
      if (el) el.focus();
    }
  }

  function clearFilters() {
    state.filters = { rid: '', name: '', full: '' };
    state.q = '';
    qInput.value = '';
    state.collapsed.clear();
    state.page_cur = 0;
    renderHead();
    renderTable();
  }

  // ---------------------------------------------------------------------------
  // Tablo + kartlar
  // ---------------------------------------------------------------------------
  function conBadge() {
    if (state.cnt1 === 0) return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 max-lg:hidden" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>';
    if (state.cnt1 === 1) return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1" title="Yükleniyor"><i class="pi pi-spin pi-spinner text-[10px]"></i><span>Yükleniyor</span></span>';
    return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1" title="Bağlantı Hatası"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>Bağlantı Hatası</span></span>';
  }

  function cells(r) {
    const n = r.n;
    const a = agg[n.rid];
    const t = TYPE_BY[n.type] || { label: n.type, icon: 'pi pi-map-marker' };
    const isCab = n.type === 'cabinet';
    const needles = r.matched ? [state.q, state.filters.rid, state.filters.name] : [];
    const dotCls = a.sensT === 0 ? 'bg-slate-400 dark:bg-slate-600' : STATUS_DOT[a.status] || STATUS_DOT.normal;
    const dotTitle = a.sensT === 0 ? 'İzlenen sensör yok' : (STATUS_LABEL[a.status] || 'Normal') + (isCab && n.cabinet.note ? ' — ' + n.cabinet.note : '');
    const childCount = r.hasKids ? childrenOf(n.rid).length : 0;
    const toggle = r.hasKids
      ? '<button type="button" data-toggle="' + esc(n.rid) + '" class="w-4 h-4 max-lg:w-6 max-lg:h-6 flex items-center justify-center rounded-[2px] text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer" title="' + (r.open ? 'Kapat' : 'Aç') + '"><i class="pi ' + (r.open ? 'pi-chevron-down' : 'pi-chevron-right') + ' text-[9px]"></i></button>'
      : '<span class="w-4 h-4 shrink-0"></span>';
    const name =
      '<div class="flex items-center gap-1.5 min-w-0">' +
        '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + dotCls + '" title="' + esc(dotTitle) + '"></span>' +
        '<i class="' + t.icon + ' ' + (TYPE_ICON_CLS[n.type] || 'text-slate-400') + ' text-xs shrink-0"></i>' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="' + (isCab ? 'font-semibold font-mono' : 'font-bold') + ' text-slate-900 dark:text-slate-100 truncate">' + hl(n.name, needles) + '</span>' +
            (childCount ? '<span class="px-1 rounded-[2px] text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">' + childCount + '</span>' : '') +
          '</div>' +
          (n.desc ? '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">' + hl(n.desc, r.matched ? [state.q] : []) + '</div>' : '') +
        '</div>' +
      '</div>';
    const cap = isCab ? capacityBar(n.cabinet.usedU, n.cabinet.totalU, ' U') : a.capacity > 0 ? capacityBar(a.installed, a.capacity, '') : '<span class="text-slate-400">—</span>';
    const sens = a.sensT > 0
      ? '<span class="font-mono font-bold ' + (a.sensA < a.sensT ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200') + '" title="' + (a.sensT - a.sensA) + ' sensörden veri alınamıyor">' + fmtNum(a.sensA, 0) + '<span class="text-slate-400 font-medium"> / ' + fmtNum(a.sensT, 0) + '</span></span>'
      : '<span class="text-slate-400">—</span>';
    const icoBtn = buttonClasses('ghost', 'sm', true);
    const actions = isCab
      ? '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(n.rid) + '" data-stop class="' + icoBtn + '" title="Kabin Yönetimi"><i class="pi pi-external-link text-[11px]"></i></a>'
      : '<button type="button" data-edit="' + esc(n.rid) + '" class="' + icoBtn + '" title="Düzenle"><i class="pi pi-pencil text-[11px]"></i></button>' +
        '<button type="button" data-add-child="' + esc(n.rid) + '" class="' + icoBtn + '" title="Alt Lokasyon Ekle"><i class="pi pi-plus text-[11px]"></i></button>';
    const area = a.area > 0 ? fmtArea(a.area) : '<span class="text-slate-400">—</span>';
    return {
      n, a, t, toggle, name, cap, sens, actions, area,
      rid: hl(n.rid, needles),
      full: hl(n.full_name, r.matched ? [state.filters.full, state.q] : []),
      chip: '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border ' + (TYPE_CHIP_CLS[n.type] || CHIP_DEFAULT) + '">' + esc(t.label) + '</span>'
    };
  }

  function rowHtml(r) {
    const c = cells(r);
    const n = r.n;
    return '<tr data-row="' + esc(n.rid) + '" class="' + (state.highlight === n.rid ? 'bg-sky-50 dark:bg-sky-500/10 ' : '') + 'hover:bg-slate-50 dark:hover:bg-surface-base transition-colors' + (r.hasKids ? ' cursor-pointer' : '') + '">' +
      '<td class="py-1.5 px-2 text-[11px] font-mono font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">' + c.rid + '</td>' +
      '<td class="py-1 px-2 text-[11px]"><div class="flex items-center gap-1.5 min-w-0" style="padding-left:' + (r.depth * 18) + 'px">' + c.toggle + c.name + '</div></td>' +
      '<td class="py-1.5 px-2 text-slate-600 dark:text-slate-300 loc-full-col"><div class="max-w-[360px] truncate text-[11px]" title="' + esc(n.full_name) + '">' + c.full + '</div></td>' +
      '<td class="py-1.5 px-2 whitespace-nowrap">' + c.chip + '</td>' +
      '<td class="py-1.5 px-2 text-[11px] text-right font-mono whitespace-nowrap' + (c.a.autoArea ? ' text-slate-600 dark:text-slate-300' : ' text-slate-800 dark:text-slate-200 font-semibold') + '"' + (c.a.autoArea ? ' title="Alt lokasyonların toplamı' + (n.extraArea ? ' + ' + fmtNum(n.extraArea, 0) + ' m² ortak alan' : '') + '"' : '') + '>' + c.area + '</td>' +
      '<td class="py-1.5 px-2 text-[11px]"><div class="max-w-[300px]">' + schemaCell(n, c.a) + '</div></td>' +
      '<td class="py-1.5 px-2 text-[11px] text-right">' + c.cap + '</td>' +
      '<td class="py-1.5 px-2 text-[11px] text-right whitespace-nowrap">' + c.sens + '</td>' +
      '<td class="py-1 px-2"><div class="flex items-center justify-end gap-0.5">' + c.actions + '</div></td>' +
    '</tr>';
  }

  // Mobil kart sütunları (orijinal columns: rid → primary, name → sub (pi-map-marker), full_name → secondary)
  const CARD_COLS = [
    { field: 'rid', header: 'Lokasyon ID', mobile: 'primary', card: r => { const c = r._c; return '<span class="flex items-center gap-1.5">' + c.toggle + '<span class="font-mono text-sky-600 dark:text-sky-400">' + c.rid + '</span></span>'; } },
    { field: 'type', header: 'Tip', mobile: 'badge', card: r => r._c.chip },
    { field: 'name', header: 'Lokasyon Adı', mobile: 'sub', mobileIcon: 'pi-map-marker', card: r => (r.depth ? '<span class="text-slate-400 font-normal">' + '›'.repeat(Math.min(r.depth, 4)) + ' </span>' : '') + hl(r.n.name, r.matched ? [state.q, state.filters.name] : []) },
    { field: 'full', header: 'Tam Lokasyon Adı', mobile: 'secondary', card: r => r._c.full },
    { field: 'cap', header: 'Kabin', mobile: 'meta', card: r => r._c.cap },
    { field: 'sens', header: 'Sensör', mobile: 'meta', card: r => r._c.sens },
    { field: 'area', header: 'Alan (m²)', mobile: 'meta', card: r => r._c.area },
    { field: 'schema', header: '2D/3D Şema', mobile: 'meta', card: r => schemaCell(r.n, r._c.a) }
  ];
  const TONE = { alarm: 'alarm', warning: 'warning', lost: 'lost' };

  function renderTable() {
    const rows = visibleRows();
    state.total_records = rows.length;
    state.page_total = Math.ceil(rows.length / state.page_rng) || 1;
    if (state.page_cur > state.page_total - 1) state.page_cur = state.page_total - 1;
    if (state.page_cur < 0) state.page_cur = 0;
    const start = state.page_cur * state.page_rng;
    const pageRows = rows.slice(start, start + state.page_rng);

    $('loc-pageinfo').textContent = '[S' + (state.page_cur + 1) + ' / ' + state.page_total + ']';
    $('loc-con').innerHTML = conBadge();
    root.querySelector('[data-act="clear-q"]').classList.toggle('hidden', !state.q);

    const body = $('loc-body');
    const emptyMsg = state.cnt1 === 0 ? 'Gösterilecek veri bulunamadı.' : state.cnt1 === 1 ? 'Veri bulunamadı veya bekleniyor...' : 'Bağlantı hatası! Veri alınamıyor.';
    body.innerHTML = pageRows.length
      ? pageRows.map(rowHtml).join('')
      : '<tr><td colspan="9" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">' + emptyMsg + '</span></td></tr>';

    pageRows.forEach(r => { r._c = cells(r); });
    $('loc-cards').innerHTML = kit.dataCards(pageRows, CARD_COLS, {
      start, empty: emptyMsg,
      rowAttrs: r => 'data-row="' + esc(r.n.rid) + '"',
      cardCls: r => (state.highlight === r.n.rid ? 'ring-1 ring-sky-500' : ''),
      tone: r => (r.n.type === 'cabinet' ? TONE[r.n.status] || '' : '')
    });
    const mn = $('loc-mfilter-n');
    if (mn) mn.textContent = rows.length + ' sonucu göster';
    renderFooter();
    if (reportMenu) reportMenu.update({ total: reportRows().length, disabled: !rows.length });
    saveState();
  }

  function renderFooter() {
    const last = state.page_cur + 1 >= state.page_total;
    const first = state.page_cur === 0;
    const locCount = nodes.filter(n => n.type !== 'cabinet').length;
    const sizes = [5, 10, 15, 20, 50, 100];
    if (sizes.indexOf(state.page_rng) < 0) sizes.push(state.page_rng);
    $('loc-footer').innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + state.total_records + '</span> kayıt listeleniyor.' +
        '<span class="ml-2 text-[11px] text-slate-400 max-lg:hidden">(' + locCount + ' lokasyon · ' + (nodes.length - locCount) + ' kabin' + (filterActive() ? ' · filtre uygulandı' : '') + ')</span>' +
      '</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto max-lg:w-full max-lg:justify-between">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select id="pageSize" class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          sizes.sort((x, y) => x - y).map(v => '<option value="' + v + '"' + (v === state.page_rng ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="prev" class="' + PAGE_BTN + '" title="Önceki Sayfa"' + (first ? ' disabled' : '') + '><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + (state.page_cur + 1) + ' / ' + state.page_total + '</span>' +
          '<button type="button" data-page="next" class="' + PAGE_BTN + '" title="Sonraki Sayfa"' + (last ? ' disabled' : '') + '><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
  }

  function renderAll() {
    renderKpis();
    renderHead();
    renderTable();
  }

  // Düğümü görünür yap: ataları aç, sayfasına git, vurgula ve kaydır
  function focusNode(rid, opts) {
    rid = legacy(rid);
    const n = byId[rid] || nodes.find(x => lower(x.rid) === lower(rid) || lower(x.name) === lower(rid));
    if (!n) return false;
    ancestors(n).forEach(a => { state.expanded.add(a.rid); state.collapsed.delete(a.rid); });
    state.highlight = n.rid;
    const idx = visibleRows().findIndex(r => r.n.rid === n.rid);
    if (idx < 0 && filterActive() && !(opts && opts.keepFilter)) {
      state.q = ''; qInput.value = '';
      state.filters = { rid: '', name: '', full: '' };
      renderHead();
    }
    const idx2 = visibleRows().findIndex(r => r.n.rid === n.rid);
    state.page_cur = Math.max(0, Math.floor(Math.max(0, idx2) / state.page_rng));
    renderTable();
    const tr = root.querySelector('#loc-body [data-row="' + CSS.escape(n.rid) + '"]');
    if (tr) tr.scrollIntoView({ block: 'center' });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Lokasyon ekleme / düzenleme formu (sunum eklemesi)
  // ---------------------------------------------------------------------------
  function nextRid() {
    const max = nodes.reduce((m, n) => { const x = /^L(\d{6})$/.exec(n.rid); return x ? Math.max(m, parseInt(x[1], 10)) : m; }, 0);
    return 'L' + String(max + 1).padStart(6, '0');
  }
  const fullNameFor = (parentRid, name) => (parentRid && byId[parentRid] ? byId[parentRid].full_name : PATH_PREFIX) + name + '/';
  function descendantsOf(rid) {
    const out = new Set();
    const walk = r => childrenOf(r).forEach(c => { out.add(c.rid); walk(c.rid); });
    walk(rid);
    return out;
  }

  function openForm(mode, rid, parentRid) {
    rid = legacy(rid);
    parentRid = legacy(parentRid);
    const editing = mode === 'edit' ? byId[rid] : null;
    if (mode === 'edit' && !editing) return;
    const n = editing || { rid: nextRid(), name: '', type: parentRid && byId[parentRid] ? suggestChildType(byId[parentRid].type) : 'building', parent: parentRid || null, desc: '', area: null, capacity: null, schemaId: '' };
    const blocked = editing ? descendantsOf(editing.rid) : new Set();
    if (editing) blocked.add(editing.rid);
    const a = editing ? agg[editing.rid] : null;

    const parentOpts = [{ value: '', label: '(Üst lokasyon yok — kök)' }];
    const walk = (p, d) => childrenOf(p).forEach(c => {
      if (c.type === 'cabinet' || blocked.has(c.rid)) return;
      parentOpts.push({ value: c.rid, label: '   '.repeat(d) + c.name + ' (' + c.rid + ')' });
      walk(c.rid, d + 1);
    });
    walk('', 0);
    const typeOpts = L.types.filter(t => t.value !== 'cabinet').map(t => ({ value: t.value, label: t.label }));
    const schemaOpts = [{ value: '', label: 'Atanmadı' }].concat(L.schemas.map(s => ({ value: s.id, label: s.name + ' — ' + s.kinds.join(' / ') })));
    const err = k => '<p data-err="' + k + '" class="hidden text-[10px] text-rose-500 font-medium mt-1"></p>';
    const inp = (id, attrs, val) => '<input id="' + id + '" ' + attrs + ' value="' + esc(val == null ? '' : val) + '" class="' + kit.INPUT_CLS + '">';

    const body =
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        kit.formField({ label: 'Üst Lokasyon', icon: 'pi pi-sitemap', control: kit.select('id="lf-parent"', parentOpts, n.parent || '') }) +
        kit.formField({ label: 'Lokasyon Tipi', required: true, icon: 'pi pi-tag', control: kit.select('id="lf-type"', typeOpts, n.type) }) +
        kit.formField({ label: 'Lokasyon ID', required: true, hint: editing ? 'değiştirilemez' : 'otomatik önerildi', control: inp('lf-rid', 'type="text" autocomplete="off"' + (editing ? ' disabled' : ''), n.rid) + err('rid') }) +
        kit.formField({ label: 'Lokasyon Adı', required: true, control: inp('lf-name', 'type="text" autocomplete="off" placeholder="ör. SALON-3"', n.name) + err('name') }) +
        '<div class="md:col-span-2">' + kit.formField({ label: 'Açıklama', control: inp('lf-desc', 'type="text" autocomplete="off" placeholder="ör. 3. Kat 2. Salon"', n.desc) }) + '</div>' +
        kit.formField({ label: 'Alan (m²)', hint: 'boş: alt lokasyon toplamı', control: inp('lf-area', 'type="number" min="0" step="0.1" placeholder="' + (a && a.autoArea ? 'Σ ' + fmtArea(a.area) + ' (otomatik)' : '0') + '"', n.area) + err('area') }) +
        kit.formField({ label: 'Toplam Kabin Kapasitesi', hint: 'boş: alt lokasyon toplamı', control: inp('lf-cap', 'type="number" min="0" step="1" placeholder="' + (a && a.autoCap ? 'Σ ' + a.capacity + ' (otomatik)' : '0') + '"', n.capacity) + err('cap') }) +
        '<div class="md:col-span-2">' + kit.formField({ label: '2D/3D Şema', icon: 'pi pi-map', control: kit.select('id="lf-schema"', schemaOpts, n.schemaId || '') }) + '</div>' +
        '<div class="md:col-span-2">' + kit.formField({ label: 'Tam Lokasyon Adı', hint: 'üst lokasyon + ad', control: '<input id="lf-full" type="text" disabled class="' + kit.INPUT_CLS + ' font-mono text-[11px] opacity-80">' }) + '</div>' +
      '</div>' +
      (editing && a ? '<div class="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">' +
        '<span><i class="pi pi-server text-[10px] mr-1"></i>Kurulu kabin: <b class="text-slate-700 dark:text-slate-200">' + a.installed + '</b></span>' +
        '<span><i class="pi pi-wifi text-[10px] mr-1"></i>Aktif sensör: <b class="text-slate-700 dark:text-slate-200">' + a.sensA + ' / ' + a.sensT + '</b></span>' +
        '<span><i class="pi pi-sitemap text-[10px] mr-1"></i>Alt lokasyon: <b class="text-slate-700 dark:text-slate-200">' + descendantsOf(editing.rid).size + '</b></span>' +
      '</div>' : '');

    const dlg = dialog({
      title: editing ? 'Lokasyonu Düzenle' : 'Yeni Lokasyon',
      subtitle: editing ? editing.rid + ' · ' + editing.full_name : 'LOC_List kaydı oluştur',
      variant: 'info',
      maxWidth: 'max-w-2xl',
      confirmLabel: 'Kaydet',
      confirmIcon: 'pi pi-save',
      body,
      onConfirm: host => save(host, editing)
    });
    const el = id => dlg.el.querySelector('#' + id);
    const syncFull = () => { el('lf-full').value = fullNameFor(el('lf-parent').value, el('lf-name').value.trim() || '…'); };
    el('lf-parent').addEventListener('change', () => {
      const p = byId[el('lf-parent').value];
      if (!editing && p) el('lf-type').value = suggestChildType(p.type);
      syncFull();
    });
    el('lf-name').addEventListener('input', syncFull);
    syncFull();
    setTimeout(() => el('lf-name').focus(), 30);
  }

  function suggestChildType(parentType) {
    return { building: 'floor', floor: 'hall', hall: 'pod', outdoor: 'energy', virtual: 'virtual' }[parentType] || 'room';
  }

  function save(host, editing) {
    const el = id => host.querySelector('#' + id);
    const showErr = (k, msg) => {
      const p = host.querySelector('[data-err="' + k + '"]');
      p.innerHTML = '<i class="pi pi-exclamation-circle text-[10px] mr-1"></i>' + esc(msg);
      p.classList.remove('hidden');
    };
    host.querySelectorAll('[data-err]').forEach(p => p.classList.add('hidden'));
    const rid = editing ? editing.rid : el('lf-rid').value.trim().toUpperCase();
    const name = el('lf-name').value.trim().toLocaleUpperCase('tr-TR');
    const areaRaw = el('lf-area').value.trim();
    const capRaw = el('lf-cap').value.trim();
    let ok = true;
    if (!editing) {
      if (!rid) { showErr('rid', 'Lokasyon ID zorunludur.'); ok = false; }
      else if (byId[rid]) { showErr('rid', rid + ' zaten kayıtlı (' + byId[rid].name + ').'); ok = false; }
    }
    if (!name) { showErr('name', 'Lokasyon adı zorunludur.'); ok = false; }
    const area = areaRaw === '' ? null : Number(areaRaw);
    const cap = capRaw === '' ? null : Number(capRaw);
    if (area != null && (!isFinite(area) || area < 0)) { showErr('area', 'Geçerli bir alan girin.'); ok = false; }
    if (cap != null && (!isFinite(cap) || cap < 0 || Math.round(cap) !== cap)) { showErr('cap', 'Tam sayı bir kapasite girin.'); ok = false; }
    if (!ok) return false;

    const parent = el('lf-parent').value || null;
    const data = {
      name, parent, type: el('lf-type').value, desc: el('lf-desc').value.trim(),
      area, capacity: cap, schemaId: el('lf-schema').value
    };
    let node;
    if (editing) {
      node = editing;
      const pathChanged = node.name !== name || node.parent !== parent;
      const moved = node.parent !== parent;
      Object.assign(node, data);
      if (pathChanged) {
        // Ad / üst lokasyon değiştiyse alt ağacın tam adlarını yeniden üret (taşınan düğüm yeni üstün sonuna)
        if (moved) { nodes.splice(nodes.indexOf(node), 1); nodes.push(node); }
        reindex();
        const rebuild = n => { n.full_name = fullNameFor(n.parent, n.name); childrenOf(n.rid).forEach(rebuild); };
        rebuild(node);
      }
    } else {
      node = Object.assign({ rid, full_name: '', extraArea: 0, installed: null, sensors: { active: 0, total: 0 }, status: 'normal', schemaFocus: '', schemaSalon: '', cabinet: null }, data);
      node.full_name = fullNameFor(parent, name);
      nodes.push(node);
    }
    if (parent) state.expanded.add(parent);
    reindex();
    renderKpis();
    focusNode(node.rid);
    toast((editing ? 'Lokasyon güncellendi: ' : 'Lokasyon eklendi: ') + node.name + ' (' + node.rid + ')', 'success', 'Lokasyon Listesi');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Rapor (app-report-export-menu → exportReport: "Lokasyon Listesi Raporu")
  // Filtre yoksa tüm lokasyonlar (kabinler hariç); arama / filtre varsa eşleşen tüm kayıtlar.
  // ---------------------------------------------------------------------------
  function reportRows() {
    return filterActive() ? nodes.filter(matches) : nodes.filter(n => n.type !== 'cabinet');
  }
  function reportFilterText() {
    const f = state.filters;
    const parts = [];
    if (state.q.trim()) parts.push('arama "' + state.q.trim() + '"');
    if (f.rid) parts.push('Lokasyon ID: ' + f.rid);
    if (f.name) parts.push('Lokasyon Adı: ' + f.name);
    if (f.full) parts.push('Tam Lokasyon Adı: ' + f.full);
    return parts.join(', ');
  }
  function exportReport(req) {
    const fmt = req.format === 'pdf' ? 'PDF' : req.format === 'xlsx' ? 'Excel' : 'CSV';
    const all = reportRows();
    const rows = DCIM.report.applyLimit(all, req);
    const b = DCIM.report.busy(rows.length + ' lokasyon · ' + fmt + ' raporu hazırlanıyor');
    setTimeout(() => {
      b.close();
      const ft = reportFilterText();
      DCIM.report.generate({
        title: 'Lokasyon Listesi Raporu',
        subtitle: [ft ? 'Filtre: ' + ft : 'Tüm lokasyonlar', req.limit ? 'İlk ' + req.limit + ' / ' + all.length + ' lokasyon' : 'Tümü (' + all.length + ' lokasyon)'].join(' · '),
        filename: 'Lokasyon_Listesi',
        kpis: [
          { label: 'Lokasyon', value: rows.length },
          { label: 'DC Salonu', value: rows.filter(n => n.type === 'hall').length },
          { label: 'Koridor / Pod', value: rows.filter(n => n.type === 'pod').length }
        ],
        sections: [{
          title: 'Lokasyon listesi',
          columns: [
            { key: 'rid', label: 'Lokasyon ID' },
            { key: 'name', label: 'Lokasyon Adı' },
            { key: 'full_name', label: 'Tam Lokasyon Adı' },
            { key: 'type', label: 'Tip' },
            { key: 'area', label: 'Alan (m²)', align: 'right' },
            { key: 'cap', label: 'Kabin (Kurulu / Kapasite)', align: 'right' },
            { key: 'sens', label: 'Aktif Sensör', align: 'right' }
          ],
          rows: rows.map(n => {
            const a = agg[n.rid];
            return {
              rid: n.rid, name: n.name, full_name: n.full_name, type: (TYPE_BY[n.type] || {}).label || n.type,
              area: a.area > 0 ? fmtArea(a.area) : '',
              cap: n.type === 'cabinet' ? n.cabinet.usedU + ' / ' + n.cabinet.totalU + ' U' : a.capacity > 0 ? a.installed + ' / ' + a.capacity : '',
              sens: a.sensT > 0 ? a.sensA + ' / ' + a.sensT : '',
              tone: a.status === 'normal' ? '' : a.status
            };
          }),
          toneKey: 'tone'
        }],
        notes: ['Varlık Yönetimi · ' + rows.length + ' lokasyon']
      }, req.format);
      toast('Lokasyon Listesi Raporu (' + fmt + ') oluşturuldu: ' + rows.length + ' kayıt.', 'success', 'Rapor');
    }, 600);
  }

  let reportMenu = null;
  reportMenu = DCIM.report.menu($('loc-report'), {
    scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }],
    options: 'limit', unit: 'lokasyon', total: reportRows().length, inTable: true,
    onExport: exportReport
  });

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  function refresh1() {
    state.cnt1 = 1;
    $('loc-con').innerHTML = conBadge();
    const ic = root.querySelector('[data-act="refresh"] i');
    ic.className = 'pi pi-spin pi-spinner text-xs';
    setTimeout(() => { state.cnt1 = 0; ic.className = 'pi pi-refresh text-xs'; reindex(); renderKpis(); renderTable(); }, 600);
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-stop]')) return;
    const act = e.target.closest('[data-act]');
    if (act) {
      const k = act.getAttribute('data-act');
      if (k === 'filter') toggleFilters();
      else if (k === 'clear-filters') clearFilters();
      else if (k === 'refresh') refresh1();
      else if (k === 'new') openForm('new', '', '');
      else if (k === 'clear-q') { state.q = ''; qInput.value = ''; state.page_cur = 0; renderTable(); qInput.focus(); }
      else if (k === 'expand-all') {
        nodes.forEach(n => { if (childrenOf(n.rid).length) state.expanded.add(n.rid); });
        state.collapsed.clear();
        renderTable();
      } else if (k === 'collapse-all') {
        state.expanded.clear();
        nodes.forEach(n => { if (childrenOf(n.rid).length) state.collapsed.add(n.rid); });
        state.page_cur = 0;
        renderTable();
      }
      return;
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) { openForm('edit', ed.getAttribute('data-edit')); return; }
    const addc = e.target.closest('[data-add-child]');
    if (addc) { openForm('new', '', addc.getAttribute('data-add-child')); return; }
    const pg = e.target.closest('[data-page]');
    if (pg) {
      if (pg.disabled) return;
      state.page_cur = pg.getAttribute('data-page') === 'prev' ? Math.max(0, state.page_cur - 1) : Math.min(state.page_total - 1, state.page_cur + 1);
      renderTable();
      $('loc-scroll').scrollTop = 0;
      $('loc-cards-wrap').scrollTop = 0;
      return;
    }
    if (e.target.closest('#loc-mfilter, details, summary')) return;
    // Satır / kart / ok tıklaması → aç / kapat
    const tg = e.target.closest('[data-toggle]') || e.target.closest('[data-row]');
    if (tg) {
      const rid = tg.getAttribute('data-toggle') || tg.getAttribute('data-row');
      if (!childrenOf(rid).length) return;
      const rowOpen = visibleRows().some(r => r.n.rid === rid && r.open);
      if (rowOpen) { state.expanded.delete(rid); state.collapsed.add(rid); }
      else { state.expanded.add(rid); state.collapsed.delete(rid); }
      state.highlight = rid;
      renderTable();
    }
  });

  // Sütun filtreleri (masaüstü satırı ve mobil panel aynı alanları yazar)
  let fTimer = null;
  root.addEventListener('input', e => {
    const k = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!k) return;
    clearTimeout(fTimer);
    const v = e.target.value;
    fTimer = setTimeout(() => {
      state.filters[k] = v;
      root.querySelectorAll('[data-f="' + k + '"]').forEach(x => { if (x !== e.target) x.value = v; });
      state.collapsed.clear();
      state.page_cur = 0;
      renderTable();
    }, 200);
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'pageSize') {
      state.page_rng = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 50));
      state.page_cur = 0;
      renderTable();
    }
  });
  let qTimer = null;
  qInput.addEventListener('input', () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = qInput.value; state.collapsed.clear(); state.page_cur = 0; state.highlight = ''; renderTable(); }, 150);
  });
  qInput.addEventListener('keydown', e => { if (e.key === 'Escape') { state.q = ''; qInput.value = ''; renderTable(); } });

  // ---------------------------------------------------------------------------
  // Başlat + derin bağlantılar
  // ---------------------------------------------------------------------------
  reindex();
  const expandParam = params.get('expand');
  if (expandParam === 'all') nodes.forEach(n => { if (childrenOf(n.rid).length) state.expanded.add(n.rid); });
  else if (expandParam === 'none') state.expanded.clear();
  renderAll();
  if (params.get('focus')) focusNode(params.get('focus'), { keepFilter: true });
  if (params.get('edit')) openForm('edit', params.get('edit'));
  else if (params.get('new') === '1') openForm('new', '', params.get('parent') || '');
  else if (params.get('report') === '1') setTimeout(() => { const b = $('loc-report').querySelector('[data-rk-btn]'); if (b) b.click(); }, 0);
})();
