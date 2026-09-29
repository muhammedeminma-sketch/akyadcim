/* ==========================================================================
   DCIM Sunum — Otonom Olaylar (NewUICMPEventsComponent)
   Kaynak: new-ui/pages/events/events.component.{html,ts}
           + components/event-sta-modal (EventStaModalComponent)
           + common/pop-ups/report-pop-up/events-report-popup (EventsReportPopupComponent)
   app-data-table davranışı alarms.js ile aynı kalıpta: arama, hızlı filtre (durum), kolon içi
   filtreler (zaman aralığı, kayıt kodu, kaynak, kategori, detay, durum), sıralama, sayfalama,
   seçim, kolon görünürlüğü. doc('CME/S00')/id('CME_List')/item sorgusu → DCIM.data.events.
   Sunum ekleri (kaynakta yok): Şiddet kolonu (Bilgi/Uyarı/Kritik), kaynak grubu seçici,
   CSV indirme düğmesi, canlı olay akışı (4-8 sn'de bir yeni olay) + duraklat/sürdür.

   Derin bağlantılar:
     ?q=1AZ39            genel log araması
     ?src=ups            kaynak grubu (locks | ups | climate | pdu | sensor | user | system)
     ?sev=critical       şiddet filtresi (info | warning | critical)
     ?sta=yeni           hızlı durum filtresi (yeni | bekliyor | isliyor | tamamlandi)
     ?filters=1          kolon içi filtre satırını (tarih aralığı vb.) açık başlat
     ?open=CME_018205    ilgili olayın durum güncelleme penceresini aç (?open=first → ilk satır)
     ?report=1           olay raporu penceresini aç
     ?live=0             canlı akışı kapalı başlat (ekran görüntüsü için)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, statusBadge, button, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'events' });

  const EV = DCIM.data.events;
  const LIST = EV.list;

  // ---------------------------------------------------------------------------
  // Sözlükler (messages.tr.json scadaEvents.*)
  // ---------------------------------------------------------------------------
  const STA_TEXT = ['İPTAL', 'YENİ', 'BEKLİYOR', 'İŞLİYOR', 'TAMAMLANDI', 'DURDU-UYARI', 'BEKLİYOR-UYARI', 'İŞLİYOR-UYARI',
    'BAŞARISIZ-ALARM', 'DURDU-ALARM', 'BEKLİYOR-ALARM', 'İŞLİYOR-ALARM', 'BAŞARISIZ-KRİZ', 'DURDU-KRİZ', 'BEKLİYOR-KRİZ', 'İŞLİYOR-KRİZ'];
  const SEV = {
    info: { label: 'Bilgi', rank: 1 },
    warning: { label: 'Uyarı', rank: 2 },
    critical: { label: 'Kritik', rank: 3 }
  };

  // events.component.ts → getClassNo / getStaText / updateTableRows
  const getClassNo = sta => sta & 0x000F;
  function getStaText(sta) {
    if ((sta & 0x0F00) === 0x0100) return '?';
    if ((sta & 0x0F00) === 0x0300) return STA_TEXT[sta & 0x000F] || '-';
    return '-';
  }
  function badgeLevel(cls) {
    switch (cls) {
      case 0: return 'stopped';
      case 1: return 'info';
      case 2: return 'warning';
      case 3: return 'active';
      case 4: return 'completed';
      case 5: case 6: case 7: return 'warning';
      case 8: case 9: case 10: case 11: return 'alarm';
      case 12: case 13: case 14: case 15: return 'crisis';
      default: return 'info';
    }
  }
  // AppStatusBadgeComponent'te olup shell.js statusBadge'de olmayan durumlar (crisis → mor, stopped → gri)
  const EXTRA_BADGE = {
    crisis: ['bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50', 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'],
    stopped: ['bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40', 'bg-slate-400']
  };
  function badge(status, label) {
    const x = EXTRA_BADGE[status];
    if (!x) return statusBadge(status, label);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + x[0] + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + x[1] + '"></span>' + esc(label) + '</span>';
  }
  const sevBadge = sev => statusBadge(sev === 'critical' ? 'critical' : sev === 'warning' ? 'warning' : 'info', (SEV[sev] || SEV.info).label);

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const QUICK = [
    { label: '-Tümü-', value: 'all' },
    { label: 'YENİ', value: 'yeni' },
    { label: 'BEKLİYOR', value: 'bekliyor' },
    { label: 'İŞLİYOR', value: 'isliyor' },
    { label: 'TAMAMLANDI', value: 'tamamlandi' }
  ];
  const QUICK_CLASS = { yeni: 1, bekliyor: 2, isliyor: 3, tamamlandi: 4 };
  const state = {
    search: params.get('q') || '',
    quick: QUICK_CLASS[params.get('sta')] ? params.get('sta') : 'all',
    src: EV.SOURCES[params.get('src')] ? params.get('src') : '',
    filters: SEV[params.get('sev')] ? { sev: params.get('sev') } : {},
    sortField: 'createdTime',
    sortOrder: -1,
    page: 1,
    pageSize: 15,
    showFilters: params.get('filters') === '1',
    selected: new Set(),
    hiddenCols: {},
    live: params.get('live') !== '0'
  };

  const COLUMNS = [
    { field: 'siraNo', header: 'Sıra No', width: '60px', wrap: false, filterable: false },
    { field: 'createdTime', header: 'Olay Zamanı', sortable: true, width: '190px', wrap: false },
    { field: 'severity', header: 'Şiddet', sortable: true, width: '92px', wrap: false },
    { field: 'rid', header: 'Kayıt Kodu', sortable: true, width: '112px', wrap: false },
    { field: 'source', header: 'Kaynak', sortable: true, minWidth: '210px' },
    { field: 'cat', header: 'Kategori', width: '112px' },
    { field: 'detail', header: 'Detay', minWidth: '320px' },
    { field: 'status', header: 'Durum', sortable: true, width: '190px', wrap: false }
  ];
  const cols = () => COLUMNS.filter(c => !state.hiddenCols[c.field]);

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama (inputFilter + get_qry mantığının istemci tarafı karşılığı)
  // ---------------------------------------------------------------------------
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const has = (v, s) => lc(v).indexOf(s) >= 0;
  const STA_FILTER = { 'İPTAL': 0, 'YENİ': 1, 'BEKLİYOR': 2, 'İŞLİYOR': 3, 'TAMAMLANDI': 4 };

  function filtered() {
    const f = state.filters;
    let list = LIST.slice();
    if (state.quick !== 'all') list = list.filter(e => getClassNo(e.sta) === QUICK_CLASS[state.quick]);
    if (state.src) list = list.filter(e => e.grp === state.src);

    const q = lc(state.search.trim());
    // contains(@id | @cat | @doc | @rid_ | @atr | @txt)
    if (q) list = list.filter(e => [e.id, e.cat, e.doc, e.ref, e.src, e.txt].some(v => has(v, q)));
    if (f.rid && f.rid.trim()) { const s = lc(f.rid.trim()); list = list.filter(e => has(e.id, s)); }
    if (f.cat && f.cat.trim()) { const s = lc(f.cat.trim()); list = list.filter(e => has(e.cat, s)); }
    if (f.src && f.src.trim()) { const s = lc(f.src.trim()); list = list.filter(e => has(e.doc, s) || has(e.ref, s) || has(e.src, s)); }
    if (f.txt && f.txt.trim()) { const s = lc(f.txt.trim()); list = list.filter(e => has(e.txt, s)); }
    // datetime-local: başlangıç ':00', bitiş ':59' saniye ile karşılaştırılır
    if (f.bgn) { const t = new Date(f.bgn).getTime(); if (!isNaN(t)) list = list.filter(e => e.tim.getTime() >= t); }
    if (f.end) { const t = new Date(f.end).getTime() + 59999; if (!isNaN(t)) list = list.filter(e => e.tim.getTime() <= t); }
    if (f.sta && STA_FILTER[f.sta] != null) list = list.filter(e => getClassNo(e.sta) === STA_FILTER[f.sta]);
    if (f.sev) list = list.filter(e => e.sev === f.sev);

    const key = e => {
      switch (state.sortField) {
        case 'createdTime': return e.tim.getTime();
        case 'severity': return SEV[e.sev].rank;
        case 'rid': return e.id;
        case 'source': return lc(e.src);
        case 'status': return getClassNo(e.sta);
        default: return 0;
      }
    };
    list.sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka < kb) return -1 * state.sortOrder;
      if (ka > kb) return 1 * state.sortOrder;
      return b.tim - a.tim;
    });
    return list;
  }

  // ---------------------------------------------------------------------------
  // Sayfa başlığı (app-page-header)
  // ---------------------------------------------------------------------------
  function renderHeader() {
    const host = document.getElementById('ev-header');
    host.innerHTML = kit.pageHeader({
      title: 'OTONOM OLAYLAR',
      breadcrumbs: [{ label: 'Alarmlar-Noktalar' }, { label: 'Otonom Olaylar' }],
      actions: '<div class="flex items-center gap-2">' +
        button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: 'Filtre', attrs: 'data-act="filter" title="Filtreyi Aç/Kapat"' }) +
        button({ variant: 'secondary', icon: 'pi pi-file', label: 'Rapor', attrs: 'data-act="report"' }) +
        '</div>'
    });
    host.querySelector('[data-act="filter"]').onclick = () => { state.showFilters = !state.showFilters; renderHeader(); renderHead(); };
    host.querySelector('[data-act="report"]').onclick = openReportPopup;
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const dateCls = 'w-full px-1 py-0.5 text-[10px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + ((cur || '') === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const txtFilter = (key, ph) => '<input type="text" data-f="' + key + '" value="' + esc(state.filters[key] || '') + '" placeholder="' + esc(ph) + '" class="' + inputCls + '" />';

  function filterCell(col) {
    const f = state.filters;
    switch (col.field) {
      case 'createdTime':
        return '<div class="flex flex-col gap-0.5">' +
          '<input type="datetime-local" data-f="bgn" value="' + esc(f.bgn || '') + '" class="' + dateCls + '" placeholder="Başlangıç Tarihi" title="Başlangıç Tarihi" />' +
          '<input type="datetime-local" data-f="end" value="' + esc(f.end || '') + '" class="' + dateCls + '" placeholder="Bitiş Tarihi" title="Bitiş Tarihi" /></div>';
      case 'severity':
        return '<select data-f="sev" class="' + selectCls + '">' + opt('', '-Tümü-', f.sev) + opt('info', 'Bilgi', f.sev) + opt('warning', 'Uyarı', f.sev) + opt('critical', 'Kritik', f.sev) + '</select>';
      case 'rid': return txtFilter('rid', 'Kayıt Kodu');
      case 'source': return txtFilter('src', 'Kaynak Ara...');
      case 'cat': return txtFilter('cat', 'Kategori Ara...');
      case 'detail': return txtFilter('txt', 'Detay Ara...');
      case 'status':
        return '<select data-f="sta" class="' + selectCls + '">' + opt('', '-Tümü-', f.sta) + opt('YENİ', 'YENİ', f.sta) + opt('BEKLİYOR', 'BEKLİYOR', f.sta) +
          opt('İŞLİYOR', 'İŞLİYOR', f.sta) + opt('TAMAMLANDI', 'TAMAMLANDI', f.sta) + opt('İPTAL', 'İPTAL', f.sta) + '</select>';
      default: return '';
    }
  }

  function cell(col, e, idx) {
    switch (col.field) {
      case 'siraNo': return '<span class="cell-nowrap">' + idx + '</span>';
      case 'createdTime': return '<span class="cell-nowrap font-mono">' + fmtDateTime(e.tim) + '</span>';
      case 'severity': return '<div class="inline-flex items-center min-w-0">' + sevBadge(e.sev) + '</div>';
      case 'rid': return '<span class="cell-nowrap font-mono text-slate-600 dark:text-slate-300" title="' + esc(e.id) + '">' + esc(e.id) + '</span>';
      case 'source': {
        const path = e.doc + (e.ref ? '/' + e.ref : '');
        const isPoint = e.doc.indexOf('CMR/') === 0 && e.ref;
        return '<div class="flex flex-col min-w-0 leading-tight py-0.5">' +
          '<span class="font-bold text-slate-900 dark:text-slate-100">' + esc(e.src) + '</span>' +
          (isPoint
            ? '<a href="telemetry-points.html?q=' + encodeURIComponent(e.ref) + '" data-stop class="font-mono text-[10px] text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 truncate" title="Telemetri noktasını aç: ' + esc(e.ref) + '">' + esc(path) + '</a>'
            : '<span class="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(path) + '">' + esc(path) + '</span>') +
          '</div>';
      }
      case 'cat': return '<span class="cell-wrap">' + esc(e.cat) + '</span>';
      case 'detail': return '<span class="cell-wrap" title="' + esc(e.txt) + '">' + esc(e.txt) + '</span>';
      case 'status':
        // staTemplate: rozet + dişli düğme; tıklama durum güncelleme penceresini açar
        return '<div class="flex items-center gap-2 cursor-pointer group" data-sta="' + esc(e.id) + '" title="Durumu değiştirmek için tıklayın">' +
          badge(badgeLevel(getClassNo(e.sta)), getStaText(e.sta)) +
          '<button type="button" data-sta="' + esc(e.id) + '" title="Olaylar Durum Güncellemesi" class="p-1 rounded text-sky-400 group-hover:text-sky-300 group-hover:bg-sky-500/10 transition-colors cursor-pointer"><i class="pi pi-cog text-xs"></i></button>' +
          '</div>';
      default: return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');
  const $ = sel => document.querySelector('#ev-table ' + sel);

  function renderTableShell() {
    const host = document.getElementById('ev-table');
    const srcOpts = '<option value="">Tüm Kaynaklar</option>' + Object.keys(EV.SOURCES).map(k =>
      '<option value="' + k + '"' + (state.src === k ? ' selected' : '') + '>' + esc(EV.SOURCES[k].label) + '</option>').join('');
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex items-center gap-1" data-quick>' +
            QUICK.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + esc(q.label) + '</button>').join('') +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<div data-bulk class="hidden px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"></div>' +
          // [table-actions] yuvası — sunum ekleri: kaynak seçici, canlı akış, CSV
          '<select data-src title="Kaynak filtresi" class="px-2 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer">' + srcOpts + '</select>' +
          '<button type="button" data-live class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer"></button>' +
          '<button type="button" data-csv title="Filtrelenmiş olayları CSV olarak indir" class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-download text-xs"></i><span>CSV</span></button>' +
          '<div class="relative">' +
            '<button type="button" data-colmenu class="px-2.5 py-1 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
          '</div>' +
          '<button type="button" data-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="Yenile"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0" data-footer></div>';

    let searchTimer = null;
    $('[data-search]').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); }, 120);
    });
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { state.quick = b.getAttribute('data-q'); state.page = 1; renderQuick(); renderBody(); }));
    $('[data-src]').addEventListener('change', e => { state.src = e.target.value; state.page = 1; renderBody(); });
    $('[data-live]').addEventListener('click', () => { state.live = !state.live; renderLive(); scheduleLive(); });
    $('[data-csv]').addEventListener('click', () => exportCsv(lastFiltered, 'otonom_olaylar_' + fmtDateKey(new Date())));
    const colBtn = $('[data-colmenu]');
    const colPanel = $('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    $('[data-refresh]').addEventListener('click', () => {
      const icon = $('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => { icon.className = 'pi pi-refresh text-xs'; renderBody(); toast('Olay listesi CME/S00 kaynağından yenilendi.', 'success'); }, 600);
    });

    // Tablo içi delegasyon
    $('[data-tbody]').addEventListener('click', e => {
      if (e.target.closest('[data-stop]')) { e.stopPropagation(); return; }
      const staEl = e.target.closest('[data-sta]');
      if (staEl) { e.stopPropagation(); const ev = LIST.find(x => x.id === staEl.getAttribute('data-sta')); if (ev) openStaModal(ev); return; }
      const row = e.target.closest('[data-row]');
      if (row) {
        const id = row.getAttribute('data-row');
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        renderBody();
      }
    });
  }

  function renderQuick() {
    document.querySelectorAll('#ev-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === state.quick;
      b.className = 'px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
  }

  function renderLive() {
    const b = $('[data-live]');
    if (state.live) {
      b.className = 'px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20';
      b.title = 'Canlı olay akışını duraklat';
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span><span>Canlı Akış</span>' +
        (liveCount ? '<span class="font-mono text-[10px] px-1 rounded-[2px] bg-sky-500/15">+' + liveCount + '</span>' : '');
    } else {
      b.className = 'px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
      b.title = 'Canlı olay akışını sürdür';
      b.innerHTML = '<i class="pi pi-pause text-[10px]"></i><span>Duraklatıldı</span>';
    }
  }

  function renderColMenu() {
    const panel = $('[data-colmenu-panel]');
    panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
      COLUMNS.map(c =>
        '<label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded cursor-pointer">' +
        '<input type="checkbox" data-col="' + c.field + '"' + (state.hiddenCols[c.field] ? '' : ' checked') + ' class="rounded text-sky-600 focus:ring-sky-500" /><span>' + esc(c.header) + '</span></label>'
      ).join('');
    panel.querySelectorAll('[data-col]').forEach(chk => chk.addEventListener('change', () => {
      state.hiddenCols[chk.getAttribute('data-col')] = !chk.checked;
      renderHead();
      renderBody();
    }));
  }

  function renderHead() {
    const thead = $('[data-thead]');
    const cs = cols();
    let html = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      '<th class="py-2 px-1 text-center bg-slate-100 dark:bg-surface-base" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-check-all class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
      cs.map(c =>
        '<th data-sort="' + (c.sortable ? c.field : '') + '" class="py-2 px-2 text-left font-bold cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap" style="' + styleOf(c) + '" title="' + esc(c.header) + '">' +
          '<div class="flex items-center gap-1 min-w-0"><span>' + esc(c.header) + '</span>' +
          (state.sortField === c.field ? '<i class="' + (state.sortOrder === 1 ? 'pi pi-sort-amount-up' : 'pi pi-sort-amount-down') + ' text-[10px] text-sky-600 dark:text-sky-400 shrink-0"></i>' : '') +
          '</div></th>'
      ).join('') + '</tr>';
    if (state.showFilters) {
      html += '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' +
        '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-[#0b121e]" style="width: 36px; min-width: 36px; max-width: 36px;"><button type="button" data-clear-filters title="Temizle" class="text-slate-400 hover:text-rose-500 text-[10px] p-0.5 transition-colors cursor-pointer"><i class="pi pi-filter-slash"></i></button></th>' +
        cs.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal" style="' + styleOf(c) + '">' + (c.filterable === false ? '' : filterCell(c)) + '</th>').join('') +
        '</tr>';
    }
    thead.innerHTML = html;

    thead.querySelectorAll('[data-sort]').forEach(th => th.addEventListener('click', () => {
      const f = th.getAttribute('data-sort');
      if (!f) return;
      if (state.sortField === f) state.sortOrder *= -1; else { state.sortField = f; state.sortOrder = 1; }
      renderHead();
      renderBody();
    }));
    thead.querySelectorAll('[data-f]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'datetime-local' ? 'change' : 'input';
      inp.addEventListener(ev, () => { state.filters[inp.getAttribute('data-f')] = inp.value; state.page = 1; renderBody(); });
    });
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', clearFilters);
    thead.querySelector('[data-check-all]').addEventListener('change', e => {
      const pageRows = currentPageRows();
      if (e.target.checked) pageRows.forEach(x => state.selected.add(x.id)); else state.selected.clear();
      renderBody();
    });
  }

  // clearFilters(): tüm kolon filtreleri + genel arama + hızlı filtre sıfırlanır
  function clearFilters() {
    state.filters = {};
    state.search = '';
    state.quick = 'all';
    state.src = '';
    state.page = 1;
    $('[data-search]').value = '';
    $('[data-src]').value = '';
    renderQuick();
    renderHead();
    renderBody();
  }

  let lastFiltered = [];
  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return lastFiltered.slice(start, start + state.pageSize);
  }

  const fresh = new Set(); // canlı akışta yeni düşen olaylar (satır vurgusu)

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const rows = currentPageRows();
    const cs = cols();
    const tbody = $('[data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + (cs.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Gösterilecek olay bulunamadı.</span></td></tr>';
    } else {
      const start = (state.page - 1) * state.pageSize;
      tbody.innerHTML = rows.map((e, i) => {
        const sel = state.selected.has(e.id);
        const isNew = fresh.has(e.id);
        return '<tr data-row="' + esc(e.id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' +
          (sel ? ' bg-sky-500/5' : '') + (isNew ? ' ev-new-row' + (e.sev === 'critical' ? ' ev-critical' : '') : '') + '">' +
          '<td class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-row-check' + (sel ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
          cs.map(c => '<td class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cell(c, e, start + i + 1) + '</td>').join('') +
          '</tr>';
      }).join('');
    }
    const checkAll = $('[data-check-all]');
    if (checkAll) checkAll.checked = rows.length > 0 && rows.every(x => state.selected.has(x.id));

    const bulk = $('[data-bulk]');
    if (state.selected.size > 0) {
      bulk.classList.remove('hidden');
      bulk.innerHTML = '<span>' + state.selected.size + ' seçili</span><button type="button" data-bulk-act class="underline hover:text-sky-800 dark:hover:text-sky-300">İşlemler</button>';
      bulk.querySelector('[data-bulk-act]').onclick = () => {
        const sel = LIST.filter(x => state.selected.has(x.id));
        exportCsv(sel, 'otonom_olaylar_secili_' + fmtDateKey(new Date()));
      };
    } else {
      bulk.classList.add('hidden');
    }

    const footer = $('[data-footer]');
    footer.innerHTML =
      '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam <span class="font-bold text-slate-900 dark:text-slate-100">' + lastFiltered.length + '</span> kayıt listeleniyor.</div>' +
      '<div class="flex items-center gap-3 self-end sm:self-auto">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="-1"' + (state.page <= 1 ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + state.page + ' / ' + totalPages + '</span>' +
          '<button type="button" data-page="1"' + (state.page >= totalPages ? ' disabled' : '') + ' class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
    footer.querySelector('[data-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderBody(); });
    footer.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
      state.page += parseInt(b.getAttribute('data-page'), 10);
      renderBody();
      $('[data-scroll]').scrollTop = 0;
    }));
  }

  // ---------------------------------------------------------------------------
  // CSV (DCIM.kit.exportExcel — ';' ayraçlı, Türkçe Excel uyumlu)
  // ---------------------------------------------------------------------------
  function exportCsv(rows, name) {
    if (!rows.length) { toast('Excel oluşturmak için veri bulunmamaktadır.', 'warning', 'Excel'); return; }
    kit.exportExcel(name, [
      { header: 'Sıra No', value: r => rows.indexOf(r) + 1 },
      { header: 'Olay Zamanı', value: r => fmtDateTime(r.tim) },
      { header: 'Şiddet', value: r => SEV[r.sev].label },
      { header: 'Kayıt Kodu', value: r => r.id },
      { header: 'Kaynak', value: r => r.src },
      { header: 'Kaynak Yolu', value: r => r.doc + (r.ref ? '/' + r.ref : '') },
      { header: 'Kategori', value: r => r.cat },
      { header: 'Detay', value: r => r.txt },
      { header: 'Durum', value: r => getStaText(r.sta) }
    ], rows);
  }

  // ---------------------------------------------------------------------------
  // Olay Durum Güncellemesi (EventStaModalComponent)
  // ---------------------------------------------------------------------------
  const STATUS_DEFS = [
    { value: 0, code: '300', category: 'slate' }, { value: 1, code: '301', category: 'sky' },
    { value: 2, code: '302', category: 'amber' }, { value: 3, code: '303', category: 'emerald' },
    { value: 4, code: '304', category: 'emerald' }, { value: 5, code: '305', category: 'amber' },
    { value: 6, code: '306', category: 'amber' }, { value: 7, code: '307', category: 'amber' },
    { value: 8, code: '308', category: 'rose' }, { value: 9, code: '309', category: 'rose' },
    { value: 10, code: '30A', category: 'rose' }, { value: 11, code: '30B', category: 'rose' },
    { value: 12, code: '30C', category: 'purple' }, { value: 13, code: '30D', category: 'purple' },
    { value: 14, code: '30E', category: 'purple' }, { value: 15, code: '30F', category: 'purple' }
  ];
  // statusMap: mevcut durumdan geçişe izin verilen durumlar
  const STATUS_NEXT = {
    0: [0, 2], 1: [2, 0], 2: [3, 5, 9, 13], 3: [4, 8, 12], 4: [2, 0], 5: [2, 3, 7, 11, 15], 6: [7, 11, 15],
    7: [4, 8, 12, 5, 6, 9, 10, 14, 13], 8: [2, 0], 9: [7, 11, 15], 10: [7, 11, 15], 11: [5, 6, 9, 10, 13, 14],
    12: [2, 0], 13: [7, 11, 15], 14: [7, 11, 15], 15: [6, 10, 14, 4, 8, 12]
  };
  const CAT_SEL = {
    emerald: ['bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300', 'bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'],
    rose: ['bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300', 'bg-rose-500/5 border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10'],
    purple: ['bg-purple-500/15 border-purple-500 text-purple-700 dark:text-purple-300', 'bg-purple-500/5 border-purple-500/30 text-purple-700 dark:text-purple-400 hover:bg-purple-500/10'],
    amber: ['bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300', 'bg-amber-500/5 border-amber-500/30 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10'],
    sky: ['bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300', 'bg-sky-500/5 border-sky-500/30 text-sky-700 dark:text-sky-400 hover:bg-sky-500/10'],
    slate: ['bg-slate-500/15 border-slate-500 text-slate-800 dark:text-slate-200', 'bg-slate-500/5 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-500/10']
  };
  const CODE_CLS = {
    sky: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/20',
    slate: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20',
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    rose: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/20',
    purple: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/20'
  };
  const staLabel = v => (v == null || !STATUS_DEFS[v]) ? '-' : '[' + STATUS_DEFS[v].code + '] ' + STA_TEXT[v];

  function openStaModal(ev) {
    const initial = getClassNo(ev.sta);
    let selected = initial;
    const enabled = STATUS_NEXT[initial] || [0, 2];
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-fade-in';

    const option = v => {
      const d = STATUS_DEFS[v];
      return { value: v, code: d.code, category: d.category, text: STA_TEXT[v], disabled: !(enabled.length === 0 || enabled.indexOf(v) >= 0 || v === selected) };
    };
    function optionClasses(o) {
      let base = 'relative flex items-center justify-between p-2.5 rounded-[4px] border text-xs font-semibold transition-all select-none ';
      if (o.disabled) return base + 'opacity-35 grayscale cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/30 text-slate-400 dark:text-slate-600 ';
      const isSel = selected === o.value;
      base += 'cursor-pointer ' + (isSel ? 'ring-2 ring-sky-500 shadow-md transform scale-[1.02] z-10 ' : 'hover:shadow-xs hover:border-slate-400 dark:hover:border-slate-600 ');
      return base + (CAT_SEL[o.category] || CAT_SEL.slate)[isSel ? 0 : 1];
    }
    // codeCat: kod rozetinin rengi (tekil kutularda sabit, gruplarda kategoriye göre)
    const optionHtml = (o, codeCat, checkCls) =>
      '<div data-opt="' + o.value + '"' + (o.disabled ? ' data-disabled' : '') + ' class="' + optionClasses(o) + '">' +
        '<div class="flex items-center gap-2"><span class="font-mono text-[11px] px-1.5 py-0.5 rounded font-bold border ' + CODE_CLS[codeCat] + '">' + o.code + '</span><span>' + esc(o.text) + '</span></div>' +
        (selected === o.value ? '<i class="pi pi-check ' + (checkCls ? checkCls + ' ' : '') + 'text-xs"></i>' : '') +
      '</div>';
    const grpCat = (o, alt) => o.category === 'purple' ? 'purple' : o.category === 'rose' ? 'rose' : alt;
    const finCat = o => o.category === 'emerald' ? 'emerald' : o.category === 'rose' ? 'rose' : 'purple';
    const col = (title, count, body) =>
      '<div class="flex-1 flex flex-col bg-white dark:bg-surface-card p-3 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs">' +
        '<div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800/80">' +
          '<span class="font-bold text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">' + title + '</span>' +
          '<span class="text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded font-mono">' + count + '</span>' +
        '</div>' + body + '</div>';
    const arrow = '<div class="hidden lg:flex items-center justify-center px-1 text-slate-300 dark:text-slate-600"><i class="pi pi-chevron-right text-sm"></i></div>';
    const dash = '<div class="my-1 border-t border-dashed border-slate-200 dark:border-slate-800"></div>';

    function render() {
      host.innerHTML =
        '<div data-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-5xl overflow-hidden transform transition-all flex flex-col max-h-[92vh] animate-modal-pop">' +
          '<div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/75 dark:bg-surface-base/80 shrink-0">' +
            '<div class="flex items-center gap-3">' +
              '<span class="w-9 h-9 rounded-lg flex items-center justify-center text-sm bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"><i class="pi pi-sliders-h"></i></span>' +
              '<div><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><span>Olaylar Durum Güncellemesi</span><span class="font-mono text-[10px] font-semibold text-slate-400">' + esc(ev.id) + '</span></h3>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5"><span>Mevcut Durum:</span><span class="font-semibold text-slate-800 dark:text-slate-200">' + staLabel(initial) + '</span>' +
              '<span class="text-slate-300 dark:text-slate-600">|</span><span class="truncate max-w-[420px]" title="' + esc(ev.txt) + '">' + esc(ev.src) + ': ' + esc(ev.txt) + '</span></p></div>' +
            '</div>' +
            '<button type="button" data-cancel class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><i class="pi pi-times text-sm"></i></button>' +
          '</div>' +
          '<div class="p-5 text-xs text-slate-700 dark:text-slate-300 overflow-y-auto flex-1 bg-slate-50/30 dark:bg-[#070c16]/50">' +
            '<div class="flex flex-col lg:flex-row items-stretch justify-between gap-2.5">' +
              col('1. Giriş', '2 Durum',
                '<div class="flex flex-col justify-between flex-1 gap-2">' +
                  optionHtml(option(1), 'sky', 'text-sky-600 dark:text-sky-400') +
                  '<div class="flex items-center justify-center py-1 text-slate-300 dark:text-slate-600"><i class="pi pi-arrow-down text-xs"></i></div>' +
                  optionHtml(option(0), 'slate', 'text-slate-600 dark:text-slate-300') +
                '</div>') +
              arrow +
              col('2. Bekleme', '4 Durum',
                '<div class="flex flex-col gap-2 flex-1">' + optionHtml(option(2), 'amber', 'text-amber-600 dark:text-amber-400') + dash +
                  [6, 10, 14].map(v => { const o = option(v); return optionHtml(o, grpCat(o, 'amber'), ''); }).join('') + '</div>') +
              arrow +
              col('3. İşleme', '4 Durum',
                '<div class="flex flex-col gap-2 flex-1">' + optionHtml(option(3), 'emerald', 'text-emerald-600 dark:text-emerald-400') + dash +
                  [7, 11, 15].map(v => { const o = option(v); return optionHtml(o, grpCat(o, 'amber'), ''); }).join('') + '</div>') +
              arrow +
              col('4. Bitiş / Hata', '6 Durum',
                '<div class="flex flex-col gap-2 flex-1">' +
                  [4, 8, 12].map(v => { const o = option(v); return optionHtml(o, finCat(o), ''); }).join('') + dash +
                  [5, 9, 13].map(v => { const o = option(v); return optionHtml(o, grpCat(o, 'amber'), ''); }).join('') + '</div>') +
            '</div>' +
            '<div class="mt-4 p-3 rounded-lg border bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3">' +
              '<div class="flex items-center gap-2"><i class="pi pi-info-circle text-sky-500 text-sm"></i><span class="text-[11px] text-slate-500 dark:text-slate-400">Sadece durum makinesinde geçişe izin verilen açık durumlar seçilebilir.</span></div>' +
              '<div class="flex items-center gap-2 text-xs"><span class="text-slate-500 dark:text-slate-400">Seçilen Durum:</span>' +
              '<span class="font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 font-mono">' + staLabel(selected) + '</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex items-center justify-between shrink-0">' +
            '<div class="text-[11px] text-slate-400 dark:text-slate-500">' +
              (selected !== null && selected !== initial ? '<span class="text-amber-600 dark:text-amber-400 font-semibold">* Onaylandığında durum değişikliği uygulanacaktır.</span>' : '') +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', label: 'İptal', attrs: 'data-cancel' }) +
              button({ variant: 'primary', icon: 'pi pi-check', label: 'Uygula', attrs: 'data-confirm' + (selected === null ? ' disabled' : '') }) +
            '</div>' +
          '</div>' +
        '</div>';
    }

    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    host.addEventListener('click', e => {
      if (!e.target.closest('[data-panel]') || e.target.closest('[data-cancel]')) { close(); return; }
      const o = e.target.closest('[data-opt]');
      if (o && !o.hasAttribute('data-disabled')) { selected = parseInt(o.getAttribute('data-opt'), 10); render(); return; }
      if (e.target.closest('[data-confirm]') && selected !== null) {
        // onStaModalConfirmed → XDB_SetValue(doc('CME/S00')/id('CME_List')/@opr, {"cmd":n,"id":"..."})
        const cmd = '{"cmd":' + selected + ',"id":"' + ev.id + '"}';
        ev.sta = 0x0300 | selected;
        close();
        toast(ev.id + ' → ' + staLabel(selected) + ' · CME_List/@opr ' + cmd, 'success', 'Olay Durumu Güncellendi');
        setTimeout(renderBody, 300);
      }
    });
    document.addEventListener('keydown', onKey);
    render();
    document.body.appendChild(host);
  }

  // ---------------------------------------------------------------------------
  // Olay Raporu Oluştur (EventsReportPopupComponent)
  // ---------------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  const toLocalInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const fmtMs = d => fmtDateTime(d) + '.' + String(d.getMilliseconds()).padStart(3, '0');

  function openReportPopup() {
    const rs = { start: toLocalInput(new Date(Date.now() - 86400000)), end: toLocalInput(new Date()), loading: false, searched: false, data: [] };
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-[9999] bg-slate-900/60 flex items-center justify-center p-4 sm:p-6 animate-fade-in';
    const dtCls = 'w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-surface-base border border-slate-300 dark:border-slate-700 rounded text-sm text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 transition-all cursor-pointer';
    const th = t => '<th class="px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + t + '</th>';

    function body() {
      if (rs.loading) {
        return '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10">' +
          '<div class="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 dark:border-t-sky-400 rounded-full animate-spin mb-4"></div>' +
          '<span class="text-sm font-medium text-slate-600 dark:text-slate-300">Veriler yükleniyor...</span></div>';
      }
      if (!rs.searched) {
        return '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
          '<div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-calendar-times text-2xl text-slate-400 dark:text-slate-500"></i></div>' +
          '<p class="text-sm font-medium">Lütfen bir tarih ve saat aralığı seçip arama yapın.</p></div>';
      }
      if (!rs.data.length) {
        return '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
          '<i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">Seçilen kriterlerde veri bulunamadı.</p></div>';
      }
      return '<table class="w-full text-left border-collapse text-xs whitespace-nowrap">' +
        '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' +
          th('Sıra No') + th('Tarih') + th('Kod') + th('Kategori') + th('Kaynak') + th('Açıklama') + th('Durum') + '</tr></thead><tbody>' +
        rs.data.map((e, i) =>
          '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors">' +
            '<td class="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">' + (i + 1) + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">' + fmtMs(e.tim) + '</td>' +
            '<td class="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">' + esc(e.id) + '</td>' +
            '<td class="px-3 py-2 text-slate-700 dark:text-slate-300">' + esc(e.cat) + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">' + esc(e.doc + (e.ref ? '/' + e.ref : '')) + '</td>' +
            '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[400px] truncate" title="' + esc(e.txt) + '">' + esc(e.txt) + '</td>' +
            '<td class="px-3 py-2">' + badge(badgeLevel(getClassNo(e.sta)), getStaText(e.sta)) + '</td>' +
          '</tr>').join('') +
        '</tbody></table>';
    }

    function render() {
      host.innerHTML =
        '<div data-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-[95vw] sm:max-w-7xl flex flex-col max-h-[90vh] transform transition-all animate-modal-pop">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/90 dark:bg-slate-900/90 rounded-t-lg shrink-0">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500"><i class="pi pi-bolt text-lg"></i></div>' +
              '<div><h2 class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">Olay Raporu Oluştur</h2>' +
              '<p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Otonom olay verilerini filtreleyin ve dışa aktarın</p></div>' +
            '</div>' +
            '<button type="button" data-close class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer outline-none"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="p-5 bg-white dark:bg-surface-card border-b border-slate-200 dark:border-slate-800 shrink-0">' +
            '<div class="flex flex-col sm:flex-row gap-4 items-end">' +
              '<div class="w-full sm:w-auto flex-1"><label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Başlangıç Tarihi:</label>' +
                '<div class="relative"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><i class="pi pi-calendar text-sm"></i></span>' +
                '<input type="datetime-local" data-start value="' + esc(rs.start) + '" class="' + dtCls + '"></div></div>' +
              '<div class="w-full sm:w-auto flex-1"><label class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Bitiş Tarihi:</label>' +
                '<div class="relative"><span class="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><i class="pi pi-calendar text-sm"></i></span>' +
                '<input type="datetime-local" data-end value="' + esc(rs.end) + '" class="' + dtCls + '"></div></div>' +
              '<div class="w-full sm:w-auto flex-[0.5]"><button type="button" data-search' + (rs.loading ? ' disabled' : '') + ' class="w-full h-[38px] bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs font-bold rounded transition-colors shadow-sm flex justify-center items-center gap-2 uppercase tracking-wide cursor-pointer">' +
                (rs.loading ? '<i class="pi pi-spinner pi-spin"></i>Aranıyor...' : '<i class="pi pi-search"></i>Ara') + '</button></div>' +
            '</div>' +
          '</div>' +
          (rs.data.length && !rs.loading
            ? '<div class="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center justify-between gap-3">' +
                '<div class="flex gap-2">' +
                  '<button type="button" data-pdf class="px-4 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-pdf"></i>PDF İndir</button>' +
                  '<button type="button" data-excel class="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 text-xs font-semibold rounded transition-colors flex items-center gap-2 cursor-pointer"><i class="pi pi-file-excel"></i>Excel İndir</button>' +
                '</div>' +
                '<div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">Toplam ' + rs.data.length + ' kayıt</div>' +
              '</div>'
            : '') +
          '<div class="flex-1 overflow-auto bg-white dark:bg-[#0f172a] relative min-h-[300px] custom-scrollbar">' + body() + '</div>' +
        '</div>';
    }

    function search() {
      const s = host.querySelector('[data-start]').value;
      const e = host.querySelector('[data-end]').value;
      rs.start = s; rs.end = e;
      if (!s || !e) { toast('Lütfen başlangıç ve bitiş tarihlerini seçiniz.', 'warning'); return; }
      const t0 = new Date(s).getTime(), t1 = new Date(e).getTime() + 59999;
      if (t0 > t1) { toast('Başlangıç tarihi bitiş tarihinden büyük olamaz!', 'warning'); return; }
      rs.loading = true;
      render();
      setTimeout(() => {
        rs.data = LIST.filter(x => x.tim.getTime() >= t0 && x.tim.getTime() <= t1).sort((a, b) => b.tim - a.tim);
        rs.loading = false;
        rs.searched = true;
        render();
      }, 650);
    }

    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    host.addEventListener('click', e => {
      if (!e.target.closest('[data-panel]') || e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-search]')) { search(); return; }
      if (e.target.closest('[data-excel]')) { exportCsv(rs.data, 'otonom_olay_raporu_' + rs.start.slice(0, 10) + '_' + rs.end.slice(0, 10)); return; }
      if (e.target.closest('[data-pdf]')) { close(); kit.exportPdf(); }
    });
    document.addEventListener('keydown', onKey);
    render();
    document.body.appendChild(host);
    return { search };
  }

  // ---------------------------------------------------------------------------
  // Canlı olay akışı (MQTT qry_out güncellemelerinin sunum karşılığı)
  // ---------------------------------------------------------------------------
  let liveSeq = 0;
  let liveCount = 0;
  let liveTimer = null;
  let lastCriticalToast = 0;
  function scheduleLive() {
    clearTimeout(liveTimer);
    if (!state.live) return;
    liveTimer = setTimeout(() => { pushLive(); scheduleLive(); }, 4000 + Math.random() * 4000);
  }
  function pushLive() {
    const ev = EV.next(liveSeq++);
    LIST.unshift(ev);
    liveCount++;
    fresh.add(ev.id);
    setTimeout(() => fresh.delete(ev.id), 2600);
    renderBody();
    renderLive();
    if (ev.sev === 'critical' && Date.now() - lastCriticalToast > 20000) {
      lastCriticalToast = Date.now();
      toast(ev.src + ': ' + ev.txt, 'error', 'Kritik Olay');
    }
  }

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderHeader();
  renderTableShell();
  renderQuick();
  renderLive();
  renderHead();
  renderBody();
  scheduleLive();

  const openId = params.get('open');
  if (openId) {
    const ev = openId === 'first' ? lastFiltered[0] : LIST.find(x => x.id === openId);
    if (ev) openStaModal(ev);
  }
  if (params.get('report') === '1') openReportPopup().search();
})();
