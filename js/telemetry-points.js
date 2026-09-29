/* ==========================================================================
   DCIM Sunum — Telemetri Noktaları (NewUICMPTelemetryPointsComponent)
   Kaynak: new-ui/pages/telemetry-points/telemetry-points.component.{html,ts,scss}
           + common/pop-ups/report-pop-up/points-report-popup (PointsReportPopupComponent)
           + components/properties-change (PropertiesChangeComponent, "AYARLAR PANELİ")
           + common/pop-ups/historical-graph-popup (HistoricalGraphPopupComponent, Chart.js)
   doc('CMR/*')/descendant::io sorgusu → DCIM.data.telemetry.points. app-data-table davranışı
   alarms.js ile aynı kalıpta (arama, hızlı filtre, kolon içi filtreler, sıralama, sayfalama,
   seçim, kolon görünürlüğü). Durum mantığı (getClassNo / getStaText / getStaBadgeStatus /
   getValColorClass / is_out / durum filtresi son nibble eşlemesi) TS'ten birebir port edildi.
   Sunum ekleri (kaynakta yok): Nokta ID, Bağlı Cihaz, Protokol, İletişim (Online/Offline),
   Son Güncelleme kolonları; canlı simülasyon (3-5 sn'de bir rastgele noktalar güncellenir,
   değişen hücreler kısa süre yanıp söner) + duraklat/sürdür.

   Derin bağlantılar:
     ?filter=OLD            kaynaktaki gibi: filtre satırı açık + "Veri Alınamıyor" (Offline) noktalar
     ?filter=ALARM|WARNING  hızlı durum filtresi
     ?q=1CE51               genel arama (events.html kaynak bağlantıları bunu kullanır)
     ?doc=T02               DOC filtresi (CMR/T02)
     ?proto=MQTT            protokol filtresi (Modbus TCP | Modbus RTU | SNMP v3 | SNMP v2c | MQTT | BACnet/IP)
     ?graph=<tag>           nokta grafiğini aç     ?props=<tag>  ayarlar panelini aç
     ?report=1              gerçek zamanlı veri raporu penceresini aç
     ?live=0                canlı simülasyonu kapalı başlat
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtDateKey, fmtTime, statusBadge, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'telemetry' });

  const T = DCIM.data.telemetry;
  const POINTS = T.points;
  const byRid = {};
  POINTS.forEach(p => { byRid[p.rid] = p; });

  // ---------------------------------------------------------------------------
  // Durum bitleri (telemetry-points.component.ts)
  // ---------------------------------------------------------------------------
  const STA_ENG_RUNNING = 0x0003, STA_MSK_ENG = 0x0003;
  const STA_VAL_NORMAL = 0x0000, STA_VAL_WARNING = 0x0004, STA_VAL_ALARM = 0x0008, STA_VAL_EMERGENCY = 0x000C, STA_MSK_VAL = 0x000C;

  function getClassNo(sta) {
    if ((sta & STA_MSK_ENG) !== STA_ENG_RUNNING) return sta & 0x0003;
    return 4 + ((sta >> 2) & 0x0003);
  }
  function getStaText(sta) {
    const val = getClassNo(sta);
    if (val === 0) return 'DEVREDİŞI';
    if (val === 1) return 'BAĞLANAMADI';
    if (val === 2) {
      if ((sta & STA_MSK_VAL) === STA_VAL_NORMAL) return 'VERİ ALINAMIYOR';
      if ((sta & STA_MSK_VAL) === STA_VAL_WARNING) return 'VERİ ALINAMIYOR-UYARI';
      if ((sta & STA_MSK_VAL) === STA_VAL_ALARM) return 'VERİ ALINAMIYOR-ALARM';
      if ((sta & STA_MSK_VAL) === STA_VAL_EMERGENCY) return 'VERİ ALINAMIYOR-ACİL';
    }
    if (val === 3 || val === 4) return 'NORMAL';
    if (val === 5) return 'UYARI';
    if (val === 6) return 'ALARM';
    if (val === 7) return 'ACİL';
    return '';
  }
  function getStaBadgeStatus(sta) {
    const val = getClassNo(sta);
    if (val === 0) return 'inactive';
    if (val === 1) return 'critical';
    if (val === 2) return 'lost';
    if (val === 3 || val === 4) return 'normal';
    if (val === 5) return 'warning';
    if (val === 6) return 'alarm';
    if (val === 7) return 'critical';
    return 'info';
  }
  function getValColorClass(sta) {
    const val = getClassNo(sta);
    if (val === 0) return 'text-slate-400 dark:text-slate-500';
    if (val === 1) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (val === 2) return 'text-orange-600 dark:text-orange-400 font-semibold';
    if (val === 3 || val === 4) return 'text-emerald-600 dark:text-emerald-400 font-medium';
    if (val === 5) return 'text-amber-600 dark:text-amber-400 font-semibold';
    if (val === 6 || val === 7) return 'text-rose-600 dark:text-rose-400 font-semibold';
    return 'text-sky-400 hover:text-sky-300';
  }
  const is_out = sta => ((sta & 0x30) > 0 ? 1 : 0);
  // İletişim durumu (sunum eki): motor çalışıyor → Online, devre dışı → Devre Dışı, diğer → Offline
  const commOf = sta => ((sta & STA_MSK_ENG) === STA_ENG_RUNNING ? 'online' : (sta & STA_MSK_ENG) === 0 ? 'disabled' : 'offline');

  // AppStatusBadgeComponent'te olup shell.js statusBadge'de olmayan 'inactive' (gri)
  function badge(status, label) {
    if (status !== 'inactive') return statusBadge(status, label);
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse bg-slate-400"></span>' + esc(label) + '</span>';
  }
  function commBadge(sta) {
    const c = commOf(sta);
    if (c === 'online') return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>';
    if (c === 'offline') return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 inline-flex items-center gap-1"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>Offline</span></span>';
    return '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30 inline-flex items-center gap-1"><i class="pi pi-ban text-[10px]"></i><span>Devre Dışı</span></span>';
  }

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const PROTOS = Object.keys(T.PROTO).map(k => T.PROTO[k]);
  const QUICK = [
    { label: '-Tümü-', value: 'all' },
    { label: 'Alarm', value: 'ALARM' },
    { label: 'Uyarı', value: 'WARNING' },
    { label: 'Veri Alınamıyor', value: 'OLD' }
  ];
  const pFilter = (params.get('filter') || '').toUpperCase();
  const pProto = PROTOS.find(p => p.toLowerCase() === String(params.get('proto') || '').toLowerCase());
  const state = {
    search: params.get('q') || '',
    filters: Object.assign({}, ['OLD', 'ALARM', 'WARNING', 'NORMAL', 'EMERGENCY'].indexOf(pFilter) >= 0 ? { sta: pFilter } : {},
      params.get('doc') ? { doc: params.get('doc') } : {}, pProto ? { proto: pProto } : {}),
    sortField: '',
    sortOrder: 1,
    page: 1,
    pageSize: 15,
    // kaynak: ?filter=OLD → filter_switch = 1
    showFilters: pFilter === 'OLD' || !!params.get('doc') || !!pProto,
    selected: new Set(),
    hiddenCols: {},
    live: params.get('live') !== '0'
  };

  const COLUMNS = [
    { field: 'siraNo', header: 'Sıra', width: '56px', wrap: false, filterable: false },
    { field: 'pid', header: 'Nokta ID', sortable: true, width: '72px', wrap: false, filterable: false },
    { field: 'qry_doc', header: 'DOC', sortable: true, width: '78px', wrap: false },
    { field: 'rid', header: 'Tag Adı', sortable: true, minWidth: '190px', wrap: false },
    { field: 'dev', header: 'Bağlı Cihaz', sortable: true, minWidth: '170px' },
    { field: 'pro', header: 'Ham Değer', width: '92px', wrap: false },
    { field: 'val', header: 'Değer', sortable: true, width: '96px', wrap: false },
    { field: 'unit', header: 'Birim', width: '56px', wrap: false },
    { field: 'desc', header: 'Tanım', minWidth: '200px' },
    { field: 'proto', header: 'Protokol', sortable: true, width: '96px', wrap: false },
    { field: 'comm', header: 'İletişim', sortable: true, width: '96px', wrap: false },
    { field: 'tim', header: 'Son Güncelleme', sortable: true, width: '140px', wrap: false, filterable: false },
    { field: 'sta', header: 'Durum', sortable: true, width: '150px', wrap: false },
    { field: 'actions', header: '', width: '44px', wrap: false, filterable: false }
  ];
  const cols = () => COLUMNS.filter(c => !state.hiddenCols[c.field]);

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama (inputFilter + getDocPath + get_qry mantığı)
  // ---------------------------------------------------------------------------
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const has = (v, s) => lc(v).indexOf(s) >= 0;
  function docPath(v) {
    const s = String(v || '').trim();
    if (!s) return 'CMR/';
    return s.toUpperCase().indexOf('CMR/') === 0 ? s.toUpperCase() : 'CMR/' + s.toUpperCase();
  }
  // Durum filtresi: @sta son hex hanesi (NORMAL 3, OLD 0/1/2, WARNING 7, ALARM B, EMERGENCY F)
  function staMatch(sta, opt) {
    const n = sta & 0x000F;
    switch (opt) {
      case 'NORMAL': return n === 0x3;
      case 'OLD': return n === 0x0 || n === 0x1 || n === 0x2;
      case 'WARNING': return n === 0x7;
      case 'ALARM': return n === 0xB;
      case 'EMERGENCY': return n === 0xF;
      default: return true;
    }
  }

  function filtered() {
    const f = state.filters;
    let list = POINTS.slice();
    const q = lc(state.search.trim());
    // contains(@id | @doc | @pro | @val | @unit | @desc) (+ sunum: cihaz, protokol)
    if (q) list = list.filter(p => [p.rid, p.qry_doc, p.pro, p.val, p.unit, p.desc, p.dev, p.proto].some(v => has(v, q)));
    if (f.doc && f.doc.trim()) { const d = docPath(f.doc); list = list.filter(p => p.qry_doc.toUpperCase().indexOf(d) === 0); }
    [['rid', 'rid'], ['pro', 'pro'], ['val', 'val'], ['unit', 'unit'], ['desc', 'desc'], ['dev', 'dev']].forEach(([k, field]) => {
      if (f[k] && f[k].trim()) { const s = lc(f[k].trim()); list = list.filter(p => has(p[field], s)); }
    });
    if (f.proto) list = list.filter(p => p.proto === f.proto);
    if (f.comm) list = list.filter(p => commOf(p.sta) === f.comm);
    if (f.sta) list = list.filter(p => staMatch(p.sta, f.sta));
    if (f.bgn) list = list.filter(p => fmtDateKey(p.tim) >= f.bgn);
    if (f.end) list = list.filter(p => fmtDateKey(p.tim) <= f.end);

    if (state.sortField) {
      const key = p => {
        switch (state.sortField) {
          case 'pid': return p.pid;
          case 'qry_doc': return p.qry_doc;
          case 'rid': return p.rid;
          case 'dev': return lc(p.dev);
          case 'val': return p.isNum && p.val !== '-' ? p.num : -Infinity;
          case 'proto': return p.proto;
          case 'comm': return commOf(p.sta);
          case 'tim': return p.tim.getTime();
          case 'sta': return getClassNo(p.sta);
          default: return 0;
        }
      };
      list.sort((a, b) => {
        const ka = key(a), kb = key(b);
        if (ka < kb) return -1 * state.sortOrder;
        if (ka > kb) return 1 * state.sortOrder;
        return a.pid - b.pid;
      });
    }
    return list;
  }

  // ---------------------------------------------------------------------------
  // Sayfa başlığı + tarih filtre çubuğu
  // ---------------------------------------------------------------------------
  function renderHeader() {
    const host = document.getElementById('tp-header');
    host.innerHTML = kit.pageHeader({
      title: 'NOKTALAR',
      breadcrumbs: [{ label: 'İzleme' }, { label: 'Telemetri Noktaları' }],
      actions: '<div class="flex items-center gap-2">' +
        button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: 'Filtre', attrs: 'data-act="filter" title="Filtreyi Aç/Kapat"' }) +
        button({ variant: 'secondary', icon: 'pi pi-file', label: 'Rapor', attrs: 'data-act="report"' }) +
        '</div>'
    });
    host.querySelector('[data-act="filter"]').onclick = () => { state.showFilters = !state.showFilters; renderHeader(); renderDateBar(); renderHead(); };
    host.querySelector('[data-act="report"]').onclick = openReportPopup;
  }

  function renderDateBar() {
    const host = document.getElementById('tp-datebar');
    if (!state.showFilters) { host.className = 'hidden'; host.innerHTML = ''; return; }
    host.className = 'shrink-0 flex flex-wrap items-end gap-2 px-2.5 py-2 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px]';
    host.innerHTML =
      '<div class="flex flex-col gap-1"><label class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Başlangıç Tarihi</label>' +
        '<input type="date" data-d="bgn" value="' + esc(state.filters.bgn || '') + '" class="scada-input h-7 text-xs" aria-label="Başlangıç Tarihi" /></div>' +
      '<div class="flex flex-col gap-1"><label class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bitiş Tarihi</label>' +
        '<input type="date" data-d="end" value="' + esc(state.filters.end || '') + '" class="scada-input h-7 text-xs" aria-label="Bitiş Tarihi" /></div>';
    host.querySelectorAll('[data-d]').forEach(inp => inp.addEventListener('change', () => {
      state.filters[inp.getAttribute('data-d')] = inp.value; state.page = 1; renderBody();
    }));
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + ((cur || '') === v ? ' selected' : '') + '>' + esc(l) + '</option>';
  const txtFilter = (key, ph) => '<input type="text" data-f="' + key + '" value="' + esc(state.filters[key] || '') + '" placeholder="' + esc(ph) + '" class="' + inputCls + '" />';

  function filterCell(col) {
    const f = state.filters;
    switch (col.field) {
      case 'qry_doc': return txtFilter('doc', 'DOC Ara... (ör: T00, T01)');
      case 'rid': return txtFilter('rid', 'Nokta Ara...');
      case 'dev': return txtFilter('dev', 'Cihaz Ara...');
      case 'pro': return txtFilter('pro', 'Ham Değer...');
      case 'val': return txtFilter('val', 'Değer Ara...');
      case 'unit': return txtFilter('unit', 'Birim Ara...');
      case 'desc': return txtFilter('desc', 'Tanım Ara...');
      case 'proto': return '<select data-f="proto" class="' + selectCls + '">' + opt('', '-Tümü-', f.proto) + PROTOS.map(p => opt(p, p, f.proto)).join('') + '</select>';
      case 'comm': return '<select data-f="comm" class="' + selectCls + '">' + opt('', '-Tümü-', f.comm) + opt('online', 'Online', f.comm) + opt('offline', 'Offline', f.comm) + opt('disabled', 'Devre Dışı', f.comm) + '</select>';
      case 'sta':
        return '<select data-f="sta" class="' + selectCls + '">' + opt('', '-Tümü-', f.sta) + opt('NORMAL', 'Normal', f.sta) + opt('OLD', 'Veri Alınamıyor', f.sta) +
          opt('WARNING', 'Uyarı', f.sta) + opt('ALARM', 'Alarm', f.sta) + opt('EMERGENCY', 'Acil', f.sta) + '</select>';
      default: return '';
    }
  }

  function cellHtml(field, p, idx) {
    switch (field) {
      case 'siraNo': return '<span class="font-mono text-slate-500 dark:text-slate-400 text-xs">' + idx + '</span>';
      case 'pid': return '<span class="font-mono text-slate-500 dark:text-slate-400">' + p.pid + '</span>';
      case 'qry_doc': return '<span class="font-mono">' + esc(p.qry_doc) + '</span>';
      case 'rid': return '<span class="font-mono font-bold text-slate-900 dark:text-slate-100" title="' + esc(p.rid) + '">' + esc(p.rid) + '</span>';
      case 'dev': return '<span class="cell-wrap">' + esc(p.dev) + '</span>';
      case 'pro':
        if (!is_out(p.sta)) return '<span class="font-mono text-xs">' + esc(p.pro) + '</span>';
        return '<input type="text" data-set="' + esc(p.rid) + '" value="' + esc(p.pro) + '" title="Enter: pro/set gönder" class="scada-input max-w-[100px] py-0.5 px-1.5 text-xs font-mono" />';
      case 'val':
        return '<button type="button" data-props="' + esc(p.rid) + '" class="hover:underline font-mono text-xs text-left cursor-pointer ' + getValColorClass(p.sta) + '" title="' + esc(p.val) + '">' + esc(p.val) + '</button>';
      case 'unit': return '<span class="text-slate-600 dark:text-slate-300">' + esc(p.unit) + '</span>';
      case 'desc': return '<span class="cell-wrap" title="' + esc(p.desc) + '">' + esc(p.desc) + '</span>';
      case 'proto': return '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">' + esc(p.proto) + '</span>';
      case 'comm': return commBadge(p.sta);
      case 'tim': return '<span class="font-mono ' + (commOf(p.sta) === 'online' ? '' : 'text-orange-600 dark:text-orange-400') + '">' + fmtDateTime(p.tim) + '</span>';
      case 'sta': return badge(getStaBadgeStatus(p.sta), getStaText(p.sta));
      case 'actions':
        return '<button type="button" data-graph="' + esc(p.rid) + '" title="Grafik Görüntüle" class="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer"><i class="pi pi-chart-line text-xs"></i></button>';
      default: return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');
  const $ = sel => document.querySelector('#tp-table ' + sel);

  function renderTableShell() {
    const host = document.getElementById('tp-table');
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
          // [table-actions] yuvası — sunum eki: canlı simülasyon
          '<span data-live-info class="hidden md:inline font-mono text-[10px] text-slate-500 dark:text-slate-400"></span>' +
          '<button type="button" data-live class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer"></button>' +
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
      searchTimer = setTimeout(() => { state.search = e.target.value; state.page = 1; renderBody(); }, 150);
    });
    // onQuickFilterChange: filterSta'yı ayarlar (kolon içi durum filtresiyle ortak)
    host.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      const v = b.getAttribute('data-q');
      state.filters.sta = v === 'all' ? '' : v;
      state.page = 1;
      renderQuick(); renderHead(); renderBody();
    }));
    $('[data-live]').addEventListener('click', () => { state.live = !state.live; renderLive(); scheduleLive(); });
    const colBtn = $('[data-colmenu]');
    const colPanel = $('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    $('[data-refresh]').addEventListener('click', () => {
      const icon = $('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => { icon.className = 'pi pi-refresh text-xs'; renderBody(); toast("Noktalar doc('CMR/*') kaynağından yenilendi.", 'success'); }, 600);
    });

    const tbody = $('[data-tbody]');
    tbody.addEventListener('click', e => {
      const g = e.target.closest('[data-graph]');
      if (g) { e.stopPropagation(); showGraph(g.getAttribute('data-graph')); return; }
      const pr = e.target.closest('[data-props]');
      if (pr) { e.stopPropagation(); openPropertiesChange(pr.getAttribute('data-props')); return; }
      if (e.target.closest('[data-set]')) { e.stopPropagation(); return; }
      const row = e.target.closest('[data-row]');
      if (row) {
        const id = row.getAttribute('data-row');
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        renderBody();
      }
    });
    // Çıkış noktası: Enter → setvalue(doc, id, val) → <doc>/<id>/pro/set
    tbody.addEventListener('keyup', e => {
      const inp = e.target.closest('[data-set]');
      if (!inp || e.key !== 'Enter') return;
      setvalue(byRid[inp.getAttribute('data-set')], inp.value.trim());
    });
  }

  function setvalue(p, raw) {
    if (!p || !raw) return;
    const n = parseFloat(raw.replace(',', '.'));
    if (isNaN(n)) { toast('Geçersiz değer: ' + raw, 'warning'); return; }
    const v = p.proto === T.PROTO.bacnet || p.proto === T.PROTO.mqtt ? n : n / p.scale;
    T.setValue(p, v);
    p.tim = new Date();
    toast(p.qry_doc + '/' + p.rid + '/pro/set ← ' + raw + ' (' + p.val + ' ' + p.unit + ')', 'success', 'Değer Gönderildi');
    patchRow(p, true);
  }

  function renderQuick() {
    const cur = state.filters.sta || 'all';
    document.querySelectorAll('#tp-table [data-q]').forEach(b => {
      const on = b.getAttribute('data-q') === cur;
      b.className = 'px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
        (on ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
    });
  }

  function renderColMenu() {
    const panel = $('[data-colmenu-panel]');
    panel.innerHTML = '<span class="font-bold text-slate-400 text-[10px] uppercase block mb-1">Kolonlar</span>' +
      COLUMNS.filter(c => c.header).map(c =>
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
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        state.filters[inp.getAttribute('data-f')] = inp.value;
        state.page = 1;
        if (inp.getAttribute('data-f') === 'sta') renderQuick();
        renderBody();
      });
    });
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', clearFilters);
    thead.querySelector('[data-check-all]').addEventListener('change', e => {
      const pageRows = currentPageRows();
      if (e.target.checked) pageRows.forEach(p => state.selected.add(p.rid)); else state.selected.clear();
      renderBody();
    });
  }

  function clearFilters() {
    state.filters = {};
    state.search = '';
    state.page = 1;
    $('[data-search]').value = '';
    renderQuick();
    renderDateBar();
    renderHead();
    renderBody();
  }

  let lastFiltered = [];
  function currentPageRows() {
    const start = (state.page - 1) * state.pageSize;
    return lastFiltered.slice(start, start + state.pageSize);
  }

  function renderBody() {
    lastFiltered = filtered();
    const totalPages = Math.max(1, Math.ceil(lastFiltered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const rows = currentPageRows();
    const cs = cols();
    const tbody = $('[data-tbody]');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="' + (cs.length + 1) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">Veri bulunamadı</span></td></tr>';
    } else {
      const start = (state.page - 1) * state.pageSize;
      tbody.innerHTML = rows.map((p, i) => {
        const sel = state.selected.has(p.rid);
        return '<tr data-row="' + esc(p.rid) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (sel ? ' bg-sky-500/5' : '') + '">' +
          '<td class="py-1.5 px-1 text-center" style="width: 36px; min-width: 36px; max-width: 36px;"><input type="checkbox" data-row-check' + (sel ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
          cs.map(c => '<td data-c="' + c.field + '" class="py-1.5 px-2 text-[11px] ' + (c.wrap === false ? 'cell-nowrap' : 'cell-wrap') + '" style="' + styleOf(c) + '">' + cellHtml(c.field, p, start + i + 1) + '</td>').join('') +
          '</tr>';
      }).join('');
    }
    const checkAll = $('[data-check-all]');
    if (checkAll) checkAll.checked = rows.length > 0 && rows.every(p => state.selected.has(p.rid));

    const bulk = $('[data-bulk]');
    if (state.selected.size > 0) {
      bulk.classList.remove('hidden');
      bulk.innerHTML = '<span>' + state.selected.size + ' seçili</span><button type="button" data-bulk-act class="underline hover:text-sky-800 dark:hover:text-sky-300">İşlemler</button>';
      bulk.querySelector('[data-bulk-act]').onclick = () => toast(state.selected.size + ' nokta seçili — toplu işlem sunumda devre dışı.', 'info');
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

  // Tek satırdaki değişen hücreleri yerinde güncelle (odak / kaydırma bozulmaz) + vurgu
  function patchRow(p, flash) {
    const tr = document.querySelector('#tp-table tr[data-row="' + (window.CSS && CSS.escape ? CSS.escape(p.rid) : p.rid) + '"]');
    if (!tr) return false;
    ['pro', 'val', 'tim'].forEach(f => {
      const td = tr.querySelector('td[data-c="' + f + '"]');
      if (!td) return;
      if (f === 'pro' && document.activeElement && td.contains(document.activeElement)) return; // yazılan değeri ezme
      td.innerHTML = cellHtml(f, p, 0);
      if (flash && f !== 'tim') {
        td.classList.remove('tp-flash');
        void td.offsetWidth; // animasyonu yeniden başlat
        td.classList.add('tp-flash');
      }
    });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Canlı simülasyon (MQTT item[n].val / pro güncellemelerinin karşılığı)
  // ---------------------------------------------------------------------------
  const LIVE_POOL = POINTS.filter(p => p.noise > 0 && commOf(p.sta) === 'online' && !is_out(p.sta));
  let liveTimer = null;
  let lastTick = null;
  let lastCount = 0;
  const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

  function jitter(p) {
    // ortalamaya dönen küçük dalgalanma — durum eşiği aşılmaz (sta sabit)
    const cur = p.num;
    let next = cur + (Math.random() - 0.5) * 2 * p.noise;
    const maxDev = p.noise * 3;
    next = Math.min(p.base + maxDev, Math.max(p.base - maxDev, next));
    next = round(next, p.dec);
    if (next === round(cur, p.dec)) next = round(cur + (Math.random() < 0.5 ? -1 : 1) * Math.pow(10, -p.dec), p.dec);
    if (p.unit !== '°C' && next < 0) next = 0;
    return next;
  }

  function tick() {
    const visible = currentPageRows().filter(p => LIVE_POOL.indexOf(p) >= 0);
    const picks = new Set();
    // görünen sayfadan 2-5 nokta (vurgu görünsün) + arka planda 8-20 nokta
    const nVis = Math.min(visible.length, 2 + Math.floor(Math.random() * 4));
    while (picks.size < nVis) picks.add(visible[Math.floor(Math.random() * visible.length)]);
    const nBg = 8 + Math.floor(Math.random() * 13);
    for (let i = 0; i < nBg; i++) picks.add(LIVE_POOL[Math.floor(Math.random() * LIVE_POOL.length)]);
    const now = new Date();
    picks.forEach(p => {
      T.setValue(p, jitter(p));
      p.tim = now;
      patchRow(p, true);
    });
    lastTick = now;
    lastCount = picks.size;
    renderLive();
  }

  function scheduleLive() {
    clearTimeout(liveTimer);
    if (!state.live) return;
    liveTimer = setTimeout(() => { tick(); scheduleLive(); }, 3000 + Math.random() * 2000);
  }

  function renderLive() {
    const b = $('[data-live]');
    const info = $('[data-live-info]');
    info.textContent = lastTick ? 'Son tarama ' + fmtTime(lastTick) + ' · ' + lastCount + ' nokta' : POINTS.length + ' nokta';
    if (state.live) {
      b.className = 'px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-500/20';
      b.title = 'Canlı güncellemeyi duraklat';
      b.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span><span>Canlı</span>';
    } else {
      b.className = 'px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
      b.title = 'Canlı güncellemeyi sürdür';
      b.innerHTML = '<i class="pi pi-pause text-[10px]"></i><span>Duraklatıldı</span>';
    }
  }

  // ---------------------------------------------------------------------------
  // Grafik Görüntüle (HistoricalGraphPopupComponent → app-line-graph, Chart.js)
  // ---------------------------------------------------------------------------
  function showGraph(rid) {
    const p = byRid[rid];
    if (!p) { toast('RID "' + rid + '" için veri bulunamadı!', 'error'); return; }
    let chart = null;
    const d = dialog({
      title: p.desc,
      subtitle: p.qry_doc + ' / ' + p.rid + ' · Son 24 saat',
      variant: 'info',
      showCancel: false,
      confirmLabel: 'Kapat',
      maxWidth: 'max-w-3xl',
      body: p.isNum
        ? '<div class="h-72 relative"><canvas data-graph-canvas></canvas></div>' +
          (commOf(p.sta) !== 'online' ? '<p class="mt-2 text-[11px] text-orange-600 dark:text-orange-400 font-semibold"><i class="pi pi-exclamation-triangle text-[10px] mr-1"></i>Son ' + Math.round((Date.now() - p.tim) / 60000) + ' dakikadır veri alınamıyor.</p>' : '')
        : kit.emptyState({ message: 'Bu nokta sayısal değer üretmiyor', description: 'Durum tipi nokta: ' + p.val, icon: 'pi pi-chart-line' }),
      onClose: () => { if (chart) chart.destroy(); }
    });
    const canvas = d.body.querySelector('[data-graph-canvas]');
    if (!canvas || !window.Chart) return;
    const base = p.base != null && !isNaN(p.base) ? p.base : 0;
    const amp = Math.max(p.noise || 0, Math.abs(base) * 0.004, 0.05);
    const lostFrom = commOf(p.sta) === 'online' ? Infinity : p.tim.getTime();
    const series = kit.series('graph:' + rid, 97, 15, (i, r) => round(base + Math.sin(i / 9) * amp * 2 + (r() - 0.5) * amp * 2, p.dec));
    const labels = series.map(s => fmtTime(s.t).slice(0, 5));
    const data = series.map(s => (s.t.getTime() > lostFrom ? null : s.v));
    const c = kit.chartColors();
    chart = new window.Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets: [{ label: p.desc + (p.unit ? ' (' + p.unit + ')' : ''), data, borderColor: kit.PALETTE.sky, backgroundColor: 'rgba(14,165,233,0.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 1.6, spanGaps: false }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true }, tooltip: { callbacks: { label: ctx => (ctx.parsed.y == null ? '-' : ctx.parsed.y.toFixed(p.dec)) + ' ' + p.unit } } },
        scales: { x: { ticks: { maxTicksLimit: 12, color: c.text }, grid: { color: c.grid }, title: { display: true, text: 'Zaman', color: c.text } },
          y: { ticks: { color: c.text }, grid: { color: c.grid }, title: { display: true, text: p.unit || 'Değer', color: c.text } } }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // AYARLAR PANELİ (PropertiesChangeComponent) — Sınıf / Cihaz / Nokta ayarları
  // ---------------------------------------------------------------------------
  const LABELS = {
    pro_typ: 'Ham Değer Tipi', sta_fnc: 'Durum Fonksiyonu', pro_fnc: 'Ham Değer Fonksiyonu', val_typ: 'Değer Tipi', his_tim_typ: 'Tarihsel Zaman Tipi',
    pro_swp: 'Bağlantı Çeşidi', val_alm_onlhi_wrn: 'Uyarı Üst Limit Değeri', val_alm_onlhi_alm: 'Alarm Üst Limit Değeri',
    pro_con: 'Ham Değer Bağlantısı', con_host: "Bağlantı IP'si", pro_pol_snd: 'Gönderilen Paket Sayacı', pro_pol_rcv: 'Alınan Paket Sayacı',
    pro_pol_dur: 'Haberleşme Gecikmesi', con_ses: 'Kurulacak Bağlantı Sayısı',
    desc: 'Tanım', unit: 'Birim', pro: 'Ham Değer', val: 'Değer', his: 'Tarihsel', his_tim: 'Tarihsel Zaman', pro_adr: 'Ham Değer Adresi', xdb_cls: 'Sınıf', sta: 'Durum'
  };
  const CON_OF = { 'Modbus TCP': 'con_mb_gw', 'Modbus RTU': 'con_rtu', 'SNMP v3': 'con_snmp', 'SNMP v2c': 'con_snmp', 'MQTT': 'con_mqtt', 'BACnet/IP': 'con_bacnet' };

  function openPropertiesChange(rid) {
    const p = byRid[rid];
    if (!p) return;
    const r = DCIM.data.rng(DCIM.data.hash('props:' + rid));
    const cls = p.cls || 'IO';
    const tabs = {
      nokta: { label: 'Sınıf Ayarları', data: { id: 'CLS_' + cls, pro_typ: p.isNum ? 'float' : 'string', sta_fnc: 'onlhi', pro_fnc: p.scale !== 1 ? 'div(' + p.scale + ')' : 'none', val_typ: p.isNum ? 'float' : 'enum', his_tim_typ: '15m', pro_swp: '0', val_alm_onlhi_wrn: p.hi != null ? String(p.hi) : '', val_alm_onlhi_alm: p.hiA != null ? String(p.hiA) : '' } },
      cihaz: { label: 'Cihaz Ayarları', data: { id: p.dev, xdb_cls: 'DEV_' + cls, pro_con: CON_OF[p.proto] || 'con', con_host: p.conHost || '-', pro_pol_snd: String(Math.floor(180000 + r() * 90000)), pro_pol_rcv: commOf(p.sta) === 'online' ? String(Math.floor(179000 + r() * 90000)) : '0', pro_pol_dur: commOf(p.sta) === 'online' ? Math.floor(8 + r() * 40) + ' ms' : 'zaman aşımı', con_ses: String(1 + Math.floor(r() * 4)) } },
      sinif: { label: 'Nokta Ayarları', data: { id: p.rid, xdb_cls: cls, desc: p.desc, unit: p.unit, pro: p.pro, val: p.val, his: '1', his_tim: '900', pro_adr: p.proto.indexOf('Modbus') === 0 ? '4' + String(10000 + (p.pid % 5000)) : p.proto.indexOf('SNMP') === 0 ? '1.3.6.1.4.1.318.1.1.' + (p.pid % 97) : p.proto === 'MQTT' ? 'locks/' + p.rid.toLowerCase() : 'AI:' + (p.pid % 400) } }
    };
    let active = 'nokta';
    const READONLY = { nokta: ['id'], cihaz: ['id', 'xdb_cls'], sinif: ['id', 'xdb_cls'] };
    const tabBtn = (k, on) => '<button type="button" data-tab="' + k + '" class="px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer border ' +
      (on ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 shadow-xs border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-transparent') + '">' + tabs[k].label + '</button>';
    const rowsHtml = k => Object.keys(tabs[k].data).map(key => {
      const ro = READONLY[k].indexOf(key) >= 0;
      return '<div class="grid grid-cols-5 gap-2 items-center py-1.5 border-b border-slate-100 dark:border-slate-800/80">' +
        '<label class="col-span-2 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">' + esc(key) +
          (LABELS[key] ? '<br><small class="font-sans font-normal text-[10px] text-slate-500 dark:text-slate-400">' + esc(LABELS[key]) + '</small>' : '') + '</label>' +
        '<div class="col-span-3">' + (ro
          ? '<div class="px-2 py-1 rounded-[2px] bg-slate-100 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-mono text-[11px]">' + esc(tabs[k].data[key]) + '</div>'
          : '<input type="text" data-key="' + key + '" value="' + esc(tabs[k].data[key]) + '" class="' + kit.INPUT_CLS + ' font-mono" />') + '</div>' +
      '</div>';
    }).join('');

    const d = dialog({
      title: 'AYARLAR PANELİ',
      subtitle: p.desc,
      variant: 'info',
      maxWidth: 'max-w-xl',
      confirmLabel: 'Güncelle',
      cancelLabel: 'İptal',
      body: '<div data-props-body></div>',
      onConfirm: () => {
        const dt = tabs.sinif.data;
        p.desc = dt.desc || p.desc;
        p.unit = dt.unit;
        renderBody();
        toast(p.qry_doc + '/' + p.rid + ' ayarları güncellendi.', 'success', 'Ayarlar Paneli');
      }
    });
    const host = d.body.querySelector('[data-props-body]');
    function render() {
      host.innerHTML =
        '<div class="p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between gap-3 mb-3">' +
          '<div class="space-y-1 min-w-0">' +
            '<div class="flex gap-3"><span class="text-slate-500 w-12">DOC</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200">' + esc(p.qry_doc) + '</span></div>' +
            '<div class="flex gap-3"><span class="text-slate-500 w-12">Nokta</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">' + esc(p.rid) + '</span></div>' +
          '</div>' +
          button({ variant: 'secondary', size: 'sm', icon: 'pi pi-save', label: 'Kalıcı Kaydet', attrs: 'data-save title="Değişiklikleri Kalıcı Olarak Kaydet"' }) +
        '</div>' +
        '<div class="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900/70 p-0.5 rounded-[2px] border border-slate-200 dark:border-border-subtle mb-2">' + Object.keys(tabs).map(k => tabBtn(k, k === active)).join('') + '</div>' +
        '<div>' + rowsHtml(active) + '</div>';
    }
    host.addEventListener('click', e => {
      const t = e.target.closest('[data-tab]');
      if (t) { active = t.getAttribute('data-tab'); render(); return; }
      if (e.target.closest('[data-save]')) toast(p.rid + ' ayarları kalıcı olarak kaydedildi (' + p.qry_doc + ').', 'success', 'Kalıcı Kaydet');
    });
    host.addEventListener('input', e => {
      const inp = e.target.closest('[data-key]');
      if (inp) tabs[active].data[inp.getAttribute('data-key')] = inp.value;
    });
    render();
  }

  // ---------------------------------------------------------------------------
  // Gerçek Zamanlı Veri Raporu (PointsReportPopupComponent)
  // ---------------------------------------------------------------------------
  function openReportPopup() {
    const rs = { loading: false, searched: false, data: [], page: 0 };
    const host = document.createElement('div');
    host.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-hidden animate-fade-in';
    const th = t => '<th class="px-3 py-3 font-bold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider text-[10px]">' + t + '</th>';
    function content() {
      if (rs.loading) {
        return '<div class="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-20">' +
          '<div class="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-sky-500 animate-spin mb-4"></div>' +
          '<p class="text-sm font-medium text-slate-600 dark:text-slate-400">Tüm veriler yükleniyor (Sayfa ' + (rs.page + 1) + ')...</p>' +
          (rs.data.length ? '<span class="text-xs text-slate-400 mt-1">Şu ana kadar ' + rs.data.length + ' kayıt çekildi...</span>' : '') + '</div>';
      }
      if (!rs.searched) {
        return '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8 text-center">' +
          '<div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4"><i class="pi pi-database text-2xl text-slate-400 dark:text-slate-500"></i></div>' +
          '<p class="text-sm font-medium">Verileri listelemek için yukarıdaki butona tıklayın.</p></div>';
      }
      if (!rs.data.length) return '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-8 text-center"><i class="pi pi-inbox text-5xl mb-4 text-slate-300 dark:text-slate-600"></i><p class="text-sm font-medium">Sistemde veri noktası bulunamadı.</p></div>';
      return '<table class="w-full text-left border-collapse text-xs whitespace-nowrap">' +
        '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/80 backdrop-blur-md shadow-sm"><tr>' + th('#') + th('DOC') + th('Tanım') + th('Değer') + th('Birim') + th('Nokta') + th('Durum') + '</tr></thead><tbody>' +
        rs.data.slice(0, 20).map((p, i) =>
          '<tr class="border-b border-slate-100 dark:border-slate-800/50 hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors">' +
            '<td class="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">' + (i + 1) + '</td>' +
            '<td class="px-3 py-2 font-mono font-medium text-slate-800 dark:text-slate-200">' + esc(p.qry_doc) + '</td>' +
            '<td class="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-[320px] truncate" title="' + esc(p.desc) + '">' + esc(p.desc) + '</td>' +
            '<td class="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-100">' + esc(p.val) + '</td>' +
            '<td class="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">' + esc(p.unit) + '</td>' +
            '<td class="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">' + esc(p.rid) + '</td>' +
            '<td class="px-3 py-2">' + badge(getStaBadgeStatus(p.sta), getStaText(p.sta)) + '</td></tr>').join('') +
        (rs.data.length > 20 ? '<tr class="bg-amber-50/70 dark:bg-amber-950/30"><td colspan="7" class="px-4 py-3 text-center text-xs font-semibold text-amber-700 dark:text-amber-400"><i class="pi pi-info-circle mr-1"></i>...ve ' + (rs.data.length - 20) + " kayıt daha (PDF'e tümü eklenecek).</td></tr>" : '') +
        '</tbody></table>';
    }
    function render() {
      host.innerHTML =
        '<div data-panel class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-modal-pop">' +
          '<div class="px-6 py-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between select-none">' +
            '<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400"><i class="pi pi-database text-lg"></i></div>' +
            '<div><h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">Gerçek Zamanlı Veri Raporu</h3><p class="text-xs text-slate-500 dark:text-slate-400">Canlı SCADA veri noktaları ve anlık durum raporu</p></div></div>' +
            '<button type="button" data-close class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><i class="pi pi-times text-sm"></i></button>' +
          '</div>' +
          '<div class="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">' +
            '<div class="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">' +
              '<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-sky-100/50 dark:bg-sky-900/30 flex items-center justify-center text-sky-600 dark:text-sky-400 flex-shrink-0"><i class="pi pi-info-circle text-sm"></i></div>' +
              '<span class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">Rapor, sistemdeki tüm gerçek zamanlı veri noktalarını içerecektir.</span></div>' +
              '<button type="button" data-fetch' + (rs.loading ? ' disabled' : '') + ' class="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 flex items-center justify-center gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">' +
                '<i class="pi ' + (rs.loading ? 'pi-spin pi-spinner' : 'pi-cloud-download') + '"></i><span>' + (rs.loading ? 'Veri Çekiliyor...' : 'Tüm Veriyi Getir') + '</span></button>' +
            '</div>' +
          '</div>' +
          (rs.data.length && !rs.loading
            ? '<div class="px-6 py-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">' +
                '<button type="button" data-pdf class="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/40 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"><i class="pi pi-file-pdf"></i><span>PDF İndir</span></button>' +
                '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">Toplam ' + rs.data.length + ' kayıt bulundu.</span>' +
              '</div>'
            : '') +
          '<div class="flex-1 overflow-auto relative min-h-[320px] max-h-[60vh] bg-white dark:bg-slate-900 custom-scrollbar">' + content() + '</div>' +
        '</div>';
    }
    function fetchAll() {
      rs.loading = true; rs.searched = false; rs.data = []; rs.page = 0;
      const chunk = 500;
      render();
      const step = () => {
        rs.data = rs.data.concat(POINTS.slice(rs.page * chunk, (rs.page + 1) * chunk));
        rs.page++;
        if (rs.page * chunk < POINTS.length) { render(); setTimeout(step, 120); return; }
        rs.loading = false; rs.searched = true; render();
      };
      setTimeout(step, 200);
    }
    const close = () => { document.removeEventListener('keydown', onKey); host.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    host.addEventListener('click', e => {
      if (!e.target.closest('[data-panel]') || e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-fetch]') && !rs.loading) { fetchAll(); return; }
      if (e.target.closest('[data-pdf]')) { close(); kit.exportPdf(); }
    });
    document.addEventListener('keydown', onKey);
    render();
    document.body.appendChild(host);
    return { fetchAll };
  }

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderHeader();
  renderDateBar();
  renderTableShell();
  renderQuick();
  renderLive();
  renderHead();
  renderBody();
  scheduleLive();

  if (params.get('graph')) showGraph(params.get('graph'));
  else if (params.get('props')) openPropertiesChange(params.get('props'));
  else if (params.get('report') === '1') openReportPopup().fetchAll();
})();
