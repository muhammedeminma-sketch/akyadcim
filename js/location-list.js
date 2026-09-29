/* ==========================================================================
   DCIM Sunum — Lokasyon Listesi (NewUICMPLocationListComponent)
   Kaynak: new-ui/pages/assets/location-list/location-list.component.{html,ts}
           + common/pop-ups/report-pop-up/asset-loc-report-popup (Rapor penceresi)
   Orijinal düzen korunur: app-page-header (Filtre / Yenile / Rapor), açılır filtre paneli
   (Lokasyon ID / Lokasyon Adı / Tam Lokasyon Adı), durum çubuklu tablo kutusu, sayfalama alt çubuğu.
   Sunum eklemeleri (orijinalde düz 3 kolonlu liste vardır):
     - Hiyerarşik ağaç: Bina > Kat > DC Salonu > Koridor / Pod > Kabin (aç / kapat, Tümünü Aç / Kapat)
     - Alan (m²), 2D/3D şema, kabin kapasitesi (kurulu / kapasite), aktif sensör kolonları + özet kartları
     - Hızlı arama, Yeni Lokasyon / Düzenle / Alt Lokasyon Ekle formu (bellek içi kayıt + toast)
   Veri: DCIM.data.locations (js/mock/location-list.data.js) — XDBT LOC_List sorgusunun yerine.
   Derin bağlantılar:
     ?q=<metin>           hızlı arama (ör. ?q=1BJ53, ?q=KGK)
     ?focus=<ID|kabin>    ağacı o düğüme açar ve satırı vurgular (ör. ?focus=L015842, ?focus=1BJ53)
     ?expand=all|none     tüm düğümleri aç / kapat
     ?filter=1            filtre panelini açık başlat
     ?edit=<ID>           düzenleme formunu aç (ör. ?edit=L015799)
     ?new=1[&parent=<ID>] yeni lokasyon formunu aç (ör. ?new=1&parent=L015799)
     ?report=1            Lokasyon Listesi (LOC) Raporu penceresini aç
   Şema bağlantıları: 2d.html / 3d.html (salon), 2d.html?cabinet=<kod> / 3d.html?cabinet=<kod> (pod, kabin)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtNum, toast, dialog, buttonClasses } = DCIM.ui;
  const kit = DCIM.kit;
  const L = DCIM.data.locations;
  DCIM.shell.init({ active: 'locations' });

  const PATH_PREFIX = '/TÜRK TELEKOM/TTVM/ANKARA/';
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

  // ---------------------------------------------------------------------------
  // Durum (location-list.component.ts alanları + ağaç durumu)
  // ---------------------------------------------------------------------------
  const nodes = L.nodes;
  let byId = {};
  let kids = {};
  const state = {
    cnt1: 0,                 // 0: Online (con1), 1: Yükleniyor (con0), diğer: Bağlantı Hatası (conE)
    filter_switch: params.get('filter') === '1' ? 1 : 0,
    filters: { rid: '', name: '', full: '' },
    q: params.get('q') || '',
    page_cur: 0,
    page_rng: 50,            // orijinal 15; ağaçta bir salonun podlarını bölmemek için 50
    page_total: 0,
    total_records: 0,
    expanded: new Set(L.defaultExpanded),
    collapsed: new Set(),    // filtre modunda zorla açılan düğümlerden kullanıcının kapattıkları
    highlight: ''
  };
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
  const depthOf = n => ancestors(n).length;

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
  // Filtre / arama (inputFilter mantığı: rid / name / full_name içerir, VE)
  // ---------------------------------------------------------------------------
  const filterActive = () => !!(state.q.trim() || state.filters.rid || state.filters.name || state.filters.full);
  function matches(n) {
    const f = state.filters;
    if (f.rid && lower(n.rid).indexOf(lower(f.rid)) < 0) return false;
    if (f.name && lower(n.name).indexOf(lower(f.name)) < 0) return false;
    if (f.full && lower(n.full_name).indexOf(lower(f.full)) < 0) return false;
    const q = lower(state.q.trim());
    if (q) {
      const s = SCHEMA_BY[n.schemaId];
      const hay = [n.rid, n.name, n.desc, (TYPE_BY[n.type] || {}).label, s && n.type === 'hall' ? s.name : ''].map(lower).join(' ');
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
  const HEADER_BTN = 'px-2.5 py-1.5 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-all cursor-pointer select-none';
  const FILTER_INPUT = 'w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const PAGE_BTN = 'w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer';
  const TH = 'py-2.5 px-3 bg-slate-100 dark:bg-surface-base whitespace-nowrap';
  const MARK = 'bg-amber-300/50 dark:bg-amber-400/25 text-inherit rounded-[1px] px-px';

  function hl(text, needles) {
    let s = String(text == null ? '' : text);
    const list = needles.filter(Boolean).map(lower);
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
    return '<div class="flex items-center gap-2 justify-end">' +
      '<span class="font-mono font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">' + used + '<span class="text-slate-400 font-medium"> / ' + total + (unit || '') + '</span></span>' +
      '<div class="h-1 w-14 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shrink-0" title="Doluluk %' + pct + '"><div class="h-full ' + fillCls(pct) + '" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  function schemaChips(s, focus, muted) {
    return s.kinds.map(k => {
      const base = k === '2D' ? s.href2d : s.href3d;
      const href = base ? base + (focus ? '?cabinet=' + encodeURIComponent(focus) : '') : '';
      if (href) {
        return '<a href="' + esc(href) + '" data-stop class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-extrabold border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors" title="' +
          esc((focus ? focus + ' konumunu ' : 'Şemayı ') + k + ' dijital ikizde aç') + '"><i class="' + (k === '2D' ? 'pi pi-map' : 'pi pi-box') + ' text-[9px]"></i>' + k + '</a>';
      }
      return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-extrabold border border-slate-300 dark:border-slate-700 text-slate-400' + (muted ? ' opacity-70' : '') +
        '" title="Sunumda yalnızca 1. Kat 1. Salon şeması açılabilir"><i class="pi pi-map text-[9px]"></i>' + k + '</span>';
    }).join('');
  }

  function schemaCell(n, a) {
    const s = SCHEMA_BY[n.schemaId];
    if (s && (n.type === 'pod' || n.type === 'cabinet')) {
      return '<div class="flex items-center gap-1">' + schemaChips(s, n.schemaFocus, true) +
        (n.schemaFocus ? '' : '<span class="text-[10px] text-slate-400 ml-1 truncate">Salon şeması</span>') + '</div>';
    }
    if (s) {
      return '<div class="flex items-center gap-1.5 min-w-0">' +
        '<span class="font-semibold text-slate-800 dark:text-slate-200 truncate" title="' + esc(s.id) + '">' + hl(s.name, [state.q.trim()]) + '</span>' +
        '<span class="flex items-center gap-1 shrink-0">' + schemaChips(s, '', false) + '</span></div>';
    }
    if (a.schemas > 0) return '<span class="text-[10px] text-slate-500 dark:text-slate-400">Alt lokasyonlarda ' + a.schemas + ' şema</span>';
    if (n.type === 'cabinet' || n.type === 'pod') return '<span class="text-slate-400">—</span>';
    return '<span class="text-[11px] italic text-slate-400">Atanmadı</span>';
  }

  // ---------------------------------------------------------------------------
  // İskelet
  // ---------------------------------------------------------------------------
  const root = document.getElementById('loc-root');
  root.innerHTML =
    kit.pageHeader({
      title: 'LOKASYON LİSTESİ',
      breadcrumbs: [{ label: 'Varlık Yönetimi' }, { label: 'LOKASYON LİSTESİ' }],
      actions: '<div class="flex items-center gap-2">' +
        '<button type="button" data-act="filter" class="' + HEADER_BTN + '" title="Filtreyi Aç/Kapat"><i class="pi pi-filter text-xs"></i><span>Filtre</span></button>' +
        '<button type="button" data-act="refresh" class="' + HEADER_BTN + '" title="Yenile"><i class="pi pi-refresh text-xs"></i><span>Yenile</span></button>' +
        '<button type="button" data-act="report" class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer select-none"><i class="pi pi-file-pdf text-xs"></i><span>Rapor</span></button>' +
        '<button type="button" data-act="new" class="px-3 py-1.5 text-xs font-bold rounded-[2px] bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer select-none"><i class="pi pi-plus text-xs"></i><span>Yeni Lokasyon</span></button>' +
      '</div>'
    }).replace('mb-3 pb-2', 'shrink-0 mb-0 pb-2') +
    '<div class="shrink-0 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 select-none" id="loc-kpis"></div>' +
    '<div id="loc-filter" class="shrink-0"></div>' +
    '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden flex-1 min-h-0 flex flex-col">' +
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-surface-base text-xs select-none shrink-0">' +
        '<div class="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">' +
          '<i class="pi pi-building text-sky-600 dark:text-sky-400"></i><span>LOKASYON LİSTESİ</span>' +
          '<span class="text-slate-400 font-normal text-[11px]" id="loc-pageinfo"></span>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none"></i>' +
            '<input id="loc-q" type="text" autocomplete="off" placeholder="Ara: ID, ad, şema, kabin..." class="w-60 pl-7 pr-7 py-1 text-xs bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 font-medium">' +
            '<button type="button" data-act="clear-q" class="hidden absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[10px] cursor-pointer" title="Temizle"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<button type="button" data-act="expand-all" class="' + buttonClasses('ghost', 'sm', false) + '" title="Tüm alt lokasyonları aç"><i class="pi pi-angle-double-down text-current"></i><span>Tümünü Aç</span></button>' +
          '<button type="button" data-act="collapse-all" class="' + buttonClasses('ghost', 'sm', false) + '" title="Tüm alt lokasyonları kapat"><i class="pi pi-angle-double-up text-current"></i><span>Tümünü Kapat</span></button>' +
          '<span id="loc-con"></span>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto" id="loc-scroll">' +
        '<table class="w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-surface-base shadow-2xs">' +
            '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
              '<th class="' + TH + ' w-[110px]">Lokasyon ID</th>' +
              '<th class="' + TH + ' min-w-[300px]">Lokasyon Adı</th>' +
              '<th class="' + TH + ' hidden 2xl:table-cell">Tam Lokasyon Adı</th>' +
              '<th class="' + TH + '">Tip</th>' +
              '<th class="' + TH + ' text-right">Alan (m²)</th>' +
              '<th class="' + TH + '">2D/3D Şema</th>' +
              '<th class="' + TH + ' text-right">Kabin Kapasitesi</th>' +
              '<th class="' + TH + ' text-right">Aktif Sensör</th>' +
              '<th class="' + TH + ' text-right w-[92px]">İşlem</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" id="loc-body"></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="p-2.5 px-3 border-t border-slate-200 dark:border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-50 dark:bg-surface-base select-none shrink-0" id="loc-footer"></div>' +
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
  // Filtre paneli (filter_switch === 1)
  // ---------------------------------------------------------------------------
  function renderFilter() {
    const host = $('loc-filter');
    const btn = root.querySelector('[data-act="filter"]');
    const on = state.filter_switch === 1;
    ['bg-sky-600', 'text-white', 'border-sky-600'].forEach(c => btn.classList.toggle(c, on));
    if (!on) { host.innerHTML = ''; return; }
    const field = (id, label, ph, val) =>
      '<div><label for="' + id + '" class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">' + label + '</label>' +
      '<input id="' + id + '" type="text" value="' + esc(val) + '" placeholder="' + ph + '" class="' + FILTER_INPUT + '"></div>';
    host.innerHTML =
      '<div class="p-3 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs space-y-3 select-none">' +
        '<div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">' +
          '<div class="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200"><i class="pi pi-filter text-sky-600 dark:text-sky-400"></i><span>Filtre</span></div>' +
          '<button type="button" data-act="filter" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer"><i class="pi pi-times"></i></button>' +
        '</div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
          field('filter_rid', 'Lokasyon ID', 'Lokasyon ID Ara...', state.filters.rid) +
          field('filter_name', 'Lokasyon Adı', 'Lokasyon Adı Ara...', state.filters.name) +
          field('filter_full_name', 'Tam Lokasyon Adı', 'Tam Lokasyon Adı Ara...', state.filters.full) +
        '</div>' +
        '<div class="flex justify-end pt-1"><button type="button" data-act="apply" class="px-3 py-1 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-[2px] transition-all cursor-pointer">Uygula</button></div>' +
      '</div>';
  }

  function inputFilter() {
    state.filters = {
      rid: ($('filter_rid') || {}).value ? $('filter_rid').value.trim() : '',
      name: ($('filter_name') || {}).value ? $('filter_name').value.trim() : '',
      full: ($('filter_full_name') || {}).value ? $('filter_full_name').value.trim() : ''
    };
    state.collapsed.clear();
    state.page_cur = 0;
    renderTable();
  }

  function openFilter() {
    state.filter_switch = state.filter_switch === 1 ? 0 : 1;
    if (state.filter_switch === 0) {
      // Filtre kapatıldığında girdileri temizle (orijinal davranış)
      state.filters = { rid: '', name: '', full: '' };
      state.page_cur = 0;
      renderFilter();
      renderTable();
    } else {
      renderFilter();
      const el = $('filter_rid');
      if (el) el.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Tablo
  // ---------------------------------------------------------------------------
  function conBadge() {
    if (state.cnt1 === 0) return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>';
    if (state.cnt1 === 1) return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"><i class="pi pi-spin pi-spinner text-[10px]"></i><span>Yükleniyor</span></span>';
    return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>Bağlantı Hatası</span></span>';
  }

  function rowHtml(r) {
    const n = r.n;
    const a = agg[n.rid];
    const t = TYPE_BY[n.type] || { label: n.type, icon: 'pi pi-map-marker' };
    const isCab = n.type === 'cabinet';
    const needles = r.matched ? [state.q.trim(), state.filters.rid, state.filters.name] : [];
    const hi = state.highlight === n.rid;
    const dotCls = a.sensT === 0 ? 'bg-slate-400 dark:bg-slate-600' : STATUS_DOT[a.status] || STATUS_DOT.normal;
    const dotTitle = a.sensT === 0 ? 'İzlenen sensör yok' : (STATUS_LABEL[a.status] || 'Normal') + (isCab && n.cabinet.note ? ' — ' + n.cabinet.note : '');
    const childCount = r.hasKids ? childrenOf(n.rid).length : 0;

    const toggle = r.hasKids
      ? '<button type="button" data-toggle="' + esc(n.rid) + '" class="w-4 h-4 flex items-center justify-center rounded-[2px] text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer" title="' + (r.open ? 'Kapat' : 'Aç') + '"><i class="pi ' + (r.open ? 'pi-chevron-down' : 'pi-chevron-right') + ' text-[9px]"></i></button>'
      : '<span class="w-4 h-4 shrink-0"></span>';

    const nameCell =
      '<div class="flex items-center gap-1.5 min-w-0" style="padding-left:' + (r.depth * 18) + 'px">' +
        toggle +
        '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + dotCls + '" title="' + esc(dotTitle) + '"></span>' +
        '<i class="' + t.icon + ' ' + (TYPE_ICON_CLS[n.type] || 'text-slate-400') + ' text-xs shrink-0"></i>' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="' + (isCab ? 'font-semibold font-mono' : 'font-bold') + ' text-slate-900 dark:text-slate-100 truncate">' + hl(n.name, needles) + '</span>' +
            (childCount ? '<span class="px-1 rounded-[2px] text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">' + childCount + '</span>' : '') +
          '</div>' +
          (n.desc ? '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">' + hl(n.desc, r.matched ? [state.q.trim()] : []) + '</div>' : '') +
        '</div>' +
      '</div>';

    let capCell;
    if (isCab) capCell = capacityBar(n.cabinet.usedU, n.cabinet.totalU, ' U');
    else if (a.capacity > 0) capCell = capacityBar(a.installed, a.capacity, '');
    else capCell = '<span class="text-slate-400">—</span>';

    const sensCell = a.sensT > 0
      ? '<span class="font-mono font-bold ' + (a.sensA < a.sensT ? 'text-amber-600 dark:text-amber-400' : 'text-slate-800 dark:text-slate-200') + '" title="' + (a.sensT - a.sensA) + ' sensörden veri alınamıyor">' + fmtNum(a.sensA, 0) + '<span class="text-slate-400 font-medium"> / ' + fmtNum(a.sensT, 0) + '</span></span>'
      : '<span class="text-slate-400">—</span>';

    const icoBtn = buttonClasses('ghost', 'sm', true);
    let actions;
    if (isCab) {
      actions = n.cabinet.floorDigit === 1
        ? '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(n.rid) + '" data-stop class="' + icoBtn + '" title="Kabin Yönetimi"><i class="pi pi-external-link text-[11px]"></i></a>'
        : '<span class="text-[10px] text-slate-400" title="Kabin kayıtları Kabin Yönetimi ekranından düzenlenir">—</span>';
    } else {
      actions = '<button type="button" data-edit="' + esc(n.rid) + '" class="' + icoBtn + '" title="Düzenle"><i class="pi pi-pencil text-[11px]"></i></button>' +
        '<button type="button" data-add-child="' + esc(n.rid) + '" class="' + icoBtn + '" title="Alt Lokasyon Ekle"><i class="pi pi-plus text-[11px]"></i></button>';
    }

    return '<tr data-row="' + esc(n.rid) + '" class="' + (hi ? 'bg-sky-50 dark:bg-sky-500/10 ' : '') + 'hover:bg-slate-50 dark:hover:bg-surface-base transition-colors' + (r.hasKids ? ' cursor-pointer' : '') + '">' +
      '<td class="py-2 px-3 font-mono font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">' + hl(n.rid, needles) + '</td>' +
      '<td class="py-1.5 px-3">' + nameCell + '</td>' +
      '<td class="py-2 px-3 text-slate-600 dark:text-slate-300 hidden 2xl:table-cell"><div class="max-w-[360px] truncate text-[11px]" title="' + esc(n.full_name) + '">' + hl(n.full_name, r.matched ? [state.filters.full] : []) + '</div></td>' +
      '<td class="py-2 px-3 whitespace-nowrap"><span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold border ' + (TYPE_CHIP_CLS[n.type] || CHIP_DEFAULT) + '">' + esc(t.label) + '</span></td>' +
      '<td class="py-2 px-3 text-right font-mono whitespace-nowrap' + (a.autoArea ? ' text-slate-600 dark:text-slate-300' : ' text-slate-800 dark:text-slate-200 font-semibold') + '"' + (a.autoArea ? ' title="Alt lokasyonların toplamı' + (n.extraArea ? ' + ' + fmtNum(n.extraArea, 0) + ' m² ortak alan' : '') + '"' : '') + '>' + (a.area > 0 ? fmtArea(a.area) : '<span class="text-slate-400">—</span>') + '</td>' +
      '<td class="py-2 px-3"><div class="max-w-[300px]">' + schemaCell(n, a) + '</div></td>' +
      '<td class="py-2 px-3 text-right">' + capCell + '</td>' +
      '<td class="py-2 px-3 text-right whitespace-nowrap">' + sensCell + '</td>' +
      '<td class="py-1.5 px-3"><div class="flex items-center justify-end gap-0.5">' + actions + '</div></td>' +
    '</tr>';
  }

  function renderTable() {
    const rows = visibleRows();
    state.total_records = rows.length;
    state.page_total = Math.ceil(rows.length / state.page_rng) || 1;
    if (state.page_cur > state.page_total - 1) state.page_cur = state.page_total - 1;
    const start = state.page_cur * state.page_rng;
    const pageRows = rows.slice(start, start + state.page_rng);

    $('loc-pageinfo').textContent = '[S' + (state.page_cur + 1) + (state.page_total > 0 ? ' / ' + state.page_total : '') + ']';
    $('loc-con').innerHTML = conBadge();
    root.querySelector('[data-act="clear-q"]').classList.toggle('hidden', !state.q);

    const body = $('loc-body');
    if (pageRows.length) {
      body.innerHTML = pageRows.map(rowHtml).join('');
    } else {
      const con = state.cnt1 === 0 ? 'con1' : state.cnt1 === 1 ? 'con0' : 'conE';
      body.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-400 dark:text-slate-500"><div class="flex flex-col items-center justify-center gap-2">' +
        (con === 'con0' ? '<i class="pi pi-spin pi-spinner text-2xl text-sky-600 dark:text-sky-400 mb-1"></i>' : con === 'conE' ? '<i class="pi pi-exclamation-circle text-2xl text-rose-500 mb-1"></i>' : '<i class="pi pi-inbox text-2xl opacity-40 mb-1"></i>') +
        '<span class="text-xs font-semibold">' + (con === 'conE' ? 'Bağlantı hatası! Veri alınamıyor.' : con === 'con0' ? 'Veri bulunamadı veya bekleniyor...' : 'Gösterilecek veri bulunamadı.') + '</span>' +
      '</div></td></tr>';
    }
    renderFooter();
  }

  function renderFooter() {
    const last = state.page_total > 0 && state.page_cur + 1 >= state.page_total;
    const first = state.page_cur === 0;
    const locCount = nodes.filter(n => n.type !== 'cabinet').length;
    $('loc-footer').innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam Kayıt:' +
        '<span class="font-bold text-slate-900 dark:text-slate-100 ml-1 px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded-[2px]">' + state.total_records + '</span>' +
        '<span class="ml-2 text-[11px] text-slate-400">(' + locCount + ' lokasyon · ' + (nodes.length - locCount) + ' kabin' + (filterActive() ? ' · filtre uygulandı' : '') + ')</span>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına Kayıt:</span>' +
          '<input id="pageSize" type="number" min="1" max="999" value="' + state.page_rng + '" class="w-14 px-1.5 py-0.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-sky-500"></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="first" class="' + PAGE_BTN + '" title="İlk Sayfa"' + (first ? ' disabled' : '') + '><i class="pi pi-angle-double-left text-xs"></i></button>' +
          '<button type="button" data-page="prev" class="' + PAGE_BTN + '" title="Önceki Sayfa"' + (first ? ' disabled' : '') + '><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<div class="flex items-center gap-1 px-1">' +
            '<input id="pageInput" type="number" min="1" max="' + state.page_total + '" value="' + (state.page_cur + 1) + '" class="w-10 px-1 py-0.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-sky-500">' +
            (state.page_total > 0 ? '<span class="text-slate-500 dark:text-slate-400 font-bold text-xs">/ ' + state.page_total + '</span>' : '') +
          '</div>' +
          '<button type="button" data-page="next" class="' + PAGE_BTN + '" title="Sonraki Sayfa"' + (last ? ' disabled' : '') + '><i class="pi pi-chevron-right text-[10px]"></i></button>' +
          '<button type="button" data-page="last" class="' + PAGE_BTN + '" title="Son Sayfa"' + (last ? ' disabled' : '') + '><i class="pi pi-angle-double-right text-xs"></i></button>' +
        '</div>' +
      '</div>';
  }

  function renderAll() {
    renderKpis();
    renderFilter();
    renderTable();
  }

  // Düğümü görünür yap: ataları aç, sayfasına git, vurgula ve kaydır
  function focusNode(rid, opts) {
    const n = byId[rid] || nodes.find(x => lower(x.rid) === lower(rid) || lower(x.name) === lower(rid));
    if (!n) return false;
    ancestors(n).forEach(a => { state.expanded.add(a.rid); state.collapsed.delete(a.rid); });
    state.highlight = n.rid;
    const idx = visibleRows().findIndex(r => r.n.rid === n.rid);
    if (idx < 0 && filterActive() && !(opts && opts.keepFilter)) {
      state.q = ''; qInput.value = '';
      state.filters = { rid: '', name: '', full: '' };
      renderFilter();
    }
    const idx2 = visibleRows().findIndex(r => r.n.rid === n.rid);
    state.page_cur = Math.max(0, Math.floor(Math.max(0, idx2) / state.page_rng));
    renderTable();
    const tr = root.querySelector('[data-row="' + CSS.escape(n.rid) + '"]');
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
    const editing = mode === 'edit' ? byId[rid] : null;
    if (mode === 'edit' && !editing) return;
    const n = editing || { rid: nextRid(), name: '', type: parentRid && byId[parentRid] ? suggestChildType(byId[parentRid].type) : 'building', parent: parentRid || null, desc: '', area: null, capacity: null, schemaId: '' };
    const blocked = editing ? descendantsOf(editing.rid) : new Set();
    if (editing) blocked.add(editing.rid);
    const a = editing ? agg[editing.rid] : null;

    const parentOpts = [{ value: '', label: '(Üst lokasyon yok — kök)' }];
    const walk = (p, d) => childrenOf(p).forEach(c => {
      if (c.type === 'cabinet' || blocked.has(c.rid)) return;
      parentOpts.push({ value: c.rid, label: '   '.repeat(d) + c.name + ' (' + c.rid + ')' });
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
        kit.formField({ label: 'Lokasyon Adı', required: true, control: inp('lf-name', 'type="text" autocomplete="off" placeholder="ör. SALOON-6"', n.name) + err('name') }) +
        '<div class="md:col-span-2">' + kit.formField({ label: 'Açıklama', control: inp('lf-desc', 'type="text" autocomplete="off" placeholder="ör. 2. Kat 6. Salon"', n.desc) }) + '</div>' +
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
      node = Object.assign({ rid, full_name: '', extraArea: 0, installed: null, sensors: { active: 0, total: 0 }, status: 'normal', schemaFocus: '', cabinet: null }, data);
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
  // Rapor penceresi (asset-loc-report-popup)
  // ---------------------------------------------------------------------------
  function reportRows() {
    return nodes.filter(n => n.type !== 'cabinet');
  }
  function reportColumns() {
    return [
      { header: 'Lokasyon ID', value: n => n.rid },
      { header: 'Lokasyon Adı', value: n => n.name },
      { header: 'Tam Lokasyon Adı', value: n => n.full_name },
      { header: 'Tip', value: n => (TYPE_BY[n.type] || {}).label || n.type },
      { header: 'Alan (m²)', value: n => Math.round(agg[n.rid].area * 10) / 10 },
      { header: '2D/3D Şema', value: n => (SCHEMA_BY[n.schemaId] && n.type !== 'pod' ? SCHEMA_BY[n.schemaId].name : '') },
      { header: 'Kurulu Kabin', value: n => agg[n.rid].installed },
      { header: 'Kabin Kapasitesi', value: n => agg[n.rid].capacity },
      { header: 'Aktif Sensör', value: n => agg[n.rid].sensA },
      { header: 'Toplam Sensör', value: n => agg[n.rid].sensT }
    ];
  }

  function printReport(rows) {
    const cols = reportColumns();
    const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Lokasyon Listesi (LOC) Raporu</title><style>' +
      'body{font-family:Inter,Segoe UI,Arial,sans-serif;font-size:9px;color:#0f172a;margin:16px}h1{font-size:14px;margin:0 0 2px}p{margin:0 0 10px;color:#64748b}' +
      'table{width:100%;border-collapse:collapse}th{background:#e2e8f0;text-align:left;padding:4px;font-size:8px;text-transform:uppercase}td{padding:3px 4px;border-bottom:1px solid #e2e8f0}' +
      '</style></head><body><h1>Lokasyon Listesi (LOC) Raporu</h1><p>Türk Telekom · Veri Merkezi — ' + esc(DCIM.ui.fmtDateTime(new Date())) + ' · Toplam ' + rows.length + ' kayıt</p><table><thead><tr>' +
      cols.map(c => '<th>' + esc(c.header) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map(r => '<tr>' + cols.map(c => '<td>' + esc(c.value(r)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(html);
    frame.contentDocument.close();
    toast('Yazdırma penceresinde "PDF olarak kaydet" seçin.', 'info', 'PDF');
    setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { /* yok say */ } setTimeout(() => frame.remove(), 1000); }, 150);
  }

  function openReport(autoFetch) {
    const rp = { isLoading: false, hasSearched: false, data: [], pdf: false, excel: false };
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 sm:p-6 animate-fade-in';
    document.body.appendChild(host);
    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    const render = () => {
      const rows = rp.data;
      host.innerHTML =
        '<div data-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-[95vw] sm:max-w-7xl flex flex-col max-h-[90vh] transform transition-all animate-modal-pop">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 rounded-t-lg shrink-0">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-md bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500"><i class="pi pi-building text-lg"></i></div>' +
              '<div><h2 class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">Lokasyon Listesi (LOC) Raporu</h2>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Rapor, sistemdeki tüm lokasyon listesini içerecektir.</p></div>' +
            '</div>' +
            '<button type="button" data-rp="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer outline-none"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="p-4 bg-white dark:bg-surface-card border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
            '<p class="text-xs text-slate-600 dark:text-slate-300">Rapor, sistemdeki tüm lokasyon listesini içerecektir.</p>' +
            '<button type="button" data-rp="fetch"' + (rp.isLoading ? ' disabled' : '') + ' class="h-[38px] px-5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors shadow-sm flex items-center gap-2 uppercase tracking-wide cursor-pointer">' +
              '<i class="pi ' + (rp.isLoading ? 'pi-spinner pi-spin' : 'pi-search') + '"></i><span>' + (rp.isLoading ? 'Veri Çekiliyor...' : 'Tüm Veriyi Çek') + '</span></button>' +
          '</div>' +
          (rows.length && !rp.isLoading
            ? '<div class="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
                '<div class="flex gap-2">' +
                  '<button type="button" data-rp="pdf" class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-pdf"></i>PDF İndir</button>' +
                  '<button type="button" data-rp="excel" class="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-excel"></i>Excel İndir</button>' +
                '</div>' +
                '<div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">Toplam ' + rows.length + ' kayıt bulundu.</div>' +
              '</div>'
            : '') +
          '<div class="flex-1 overflow-auto bg-white dark:bg-[#0f172a] relative min-h-[300px]">' +
            (rp.isLoading ? '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10"><div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin mb-4"></div><span class="text-sm font-medium text-slate-600 dark:text-slate-300">Veriler yükleniyor...</span></div>' : '') +
            (!rp.isLoading && !rp.hasSearched ? '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-search text-2xl text-slate-400 dark:text-slate-500"></i></div><p class="text-sm font-medium">Rapor, sistemdeki tüm lokasyon listesini içerecektir.</p></div>' : '') +
            (!rp.isLoading && rp.hasSearched && !rows.length ? '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center"><i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">Sistemde lokasyon kaydı bulunamadı.</p></div>' : '') +
            (!rp.isLoading && rows.length
              ? '<table class="w-full text-left border-collapse text-xs whitespace-nowrap"><thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 shadow-sm"><tr>' +
                  ['Lokasyon ID', 'Lokasyon Adı', 'Tam Lokasyon Adı'].map(h => '<th class="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + h + '</th>').join('') +
                '</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800">' +
                  rows.slice(0, 20).map(it => '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors">' +
                    '<td class="px-4 py-2.5 font-mono text-sky-600 dark:text-sky-400 font-medium">' + esc(it.rid) + '</td>' +
                    '<td class="px-4 py-2.5 text-slate-800 dark:text-slate-200 font-medium">' + esc(it.name) + '</td>' +
                    '<td class="px-4 py-2.5 text-slate-600 dark:text-slate-300">' + esc(it.full_name) + '</td></tr>').join('') +
                  (rows.length > 20 ? '<tr class="bg-slate-50 dark:bg-slate-800/40"><td colspan="3" class="px-4 py-3 text-center text-xs italic text-slate-500 dark:text-slate-400">...ve ' + (rows.length - 20) + ' kayıt daha (PDF veya Excel raporlarında tümü eklenecek).</td></tr>' : '') +
                '</tbody></table>'
              : '') +
          '</div>' +
        '</div>';
    };
    const fetch = () => {
      rp.isLoading = true;
      render();
      setTimeout(() => { rp.isLoading = false; rp.hasSearched = true; rp.data = reportRows(); render(); }, 650);
    };
    host.addEventListener('click', e => {
      if (e.target === host) { close(); return; }
      const b = e.target.closest('[data-rp]');
      if (!b || b.disabled) return;
      const k = b.getAttribute('data-rp');
      if (k === 'close') close();
      else if (k === 'fetch') fetch();
      else if (k === 'excel') kit.exportExcel('Lokasyon_Listesi_Raporu', reportColumns(), rp.data);
      else if (k === 'pdf') printReport(rp.data);
    });
    render();
    if (autoFetch) fetch();
  }

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  function refresh1() {
    state.cnt1 = 1;
    $('loc-con').innerHTML = conBadge();
    setTimeout(() => { state.cnt1 = 0; reindex(); renderKpis(); renderTable(); }, 600);
  }

  root.addEventListener('click', e => {
    if (e.target.closest('[data-stop]')) return;
    const act = e.target.closest('[data-act]');
    if (act) {
      const k = act.getAttribute('data-act');
      if (k === 'filter') openFilter();
      else if (k === 'apply') inputFilter();
      else if (k === 'refresh') refresh1();
      else if (k === 'report') openReport(false);
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
      const k = pg.getAttribute('data-page');
      if (k === 'first') state.page_cur = 0;
      else if (k === 'prev') state.page_cur = Math.max(0, state.page_cur - 1);
      else if (k === 'next') state.page_cur = Math.min(state.page_total - 1, state.page_cur + 1);
      else if (k === 'last') state.page_cur = state.page_total - 1;
      renderTable();
      $('loc-scroll').scrollTop = 0;
      return;
    }
    // Satır / ok tıklaması → aç / kapat
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

  root.addEventListener('keyup', e => {
    if (e.key === 'Enter' && e.target.id && e.target.id.indexOf('filter_') === 0) inputFilter();
    if (e.key === 'Enter' && e.target.id === 'pageInput') onPageInput(e.target);
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'pageSize') {
      let v = parseInt(e.target.value, 10) || 1;
      v = Math.max(1, Math.min(999, v));
      state.page_rng = v;
      state.page_cur = 0;
      renderTable();
    } else if (e.target.id === 'pageInput') onPageInput(e.target);
  });
  function onPageInput(input) {
    let p = Math.round(Number(input.value)) || state.page_cur + 1;
    p = Math.max(1, Math.min(state.page_total, p));
    if (p - 1 !== state.page_cur) { state.page_cur = p - 1; renderTable(); } else input.value = p;
  }
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
  else if (params.get('report') === '1') openReport(true);
})();
