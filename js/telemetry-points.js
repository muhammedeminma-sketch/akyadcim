/* ==========================================================================
   DCIM Sunum — Telemetri Noktaları (NewUICMPTelemetryPointsComponent)
   Kaynak: new-ui/pages/telemetry-points/telemetry-points.component.{html,ts,scss}
           + components/properties-change (PropertiesChangeComponent, "AYARLAR PANELİ")
           + common/pop-ups/historical-graph-popup (HistoricalGraphPopupComponent, Chart.js — yalnız ?graph=)
           + shared/components/report-export-menu (app-report-export-menu, [table-actions] yuvasında)
   doc('<kat dokümanı | CMR/*>')/descendant::io sorgusu → DCIM.data.telemetry.points
   (kat dokümanları: js/mock/telemetry-points.data.js). app-data-table davranışı alarms.js ile aynı
   kalıpta (arama, hızlı filtre, kolon içi filtreler, sıralama, sayfalama [varsayılan 50], seçim, kolon
   görünürlüğü, lg altında mobil kartlar). Durum mantığı (getClassNo / getStaText / getStaBadgeStatus /
   getValColorClass / is_out / durum filtresi son nibble eşlemesi) TS'ten birebir port edildi.
   Kat seçici (SITE_Floors): Tüm Katlar | 1. Kat · Tesis (CMR/T00) | 1. Kat · Beyaz Alan (CMR/T01) | 2. Kat | 3. Kat;
   DOC sütun süzgeci kat seçiminden önceliklidir; DOC/arama büyük-küçük harf duyarsızdır (tr-TR).
   Grafik sütunu orijinaldeki gibi kaldırıldı (eski pop-up veri çekmiyordu); tarih süzgeci kaldırıldı.
   Mobilde (lg altı) kartlar salt okunurdur: değer yazma ve ayarlar paneli yok; Filtre tablo başlığında.
   Sunum ekleri (kaynakta yok): Nokta ID, Bağlı Cihaz, Protokol, İletişim (Online/Offline),
   Son Güncelleme kolonları; canlı simülasyon (3-5 sn'de bir rastgele noktalar güncellenir,
   değişen hücreler kısa süre yanıp söner) + duraklat/sürdür.

   Derin bağlantılar:
     ?filter=OLD            kaynaktaki gibi: filtre satırı açık + "Veri Alınamıyor" (Offline) noktalar
     ?filter=ALARM|WARNING  hızlı durum filtresi
     ?q=1DM03               genel arama (events.html kaynak bağlantıları bunu kullanır)
     ?floor=T00|T01|T02|T03 kat seçici (CMR/T00 = 1. Kat · Tesis, CMR/T01 = 1. Kat · Beyaz Alan, CMR/T02 = 2. Kat, CMR/T03 = 3. Kat)
     ?doc=T02               DOC sütun süzgeci (CMR/T02; filtre satırı açılır)
     ?proto=MQTT            protokol filtresi (Modbus TCP | Modbus RTU | SNMP v3 | SNMP v2c | MQTT | BACnet/IP)
     ?graph=<tag>           nokta grafiğini aç     ?props=<tag>  ayarlar panelini aç
     ?report=1              rapor menüsünü açık başlat
     ?live=0                canlı simülasyonu kapalı başlat
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, fmtTime, statusBadge, button, dialog, toast } = DCIM.ui;
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
  // Kat seçimi (floorDocOptions / selectedFloorDoc): boş = bütün dokümanlar
  const FLOOR_DOCS = DCIM.data.telemetryFloors || [];
  const pFloor = String(params.get('floor') || '').trim().toUpperCase();
  const pFloorDoc = pFloor ? (FLOOR_DOCS.find(o => o.value === pFloor || o.value === 'CMR/' + pFloor) || {}).value || '' : '';
  // Mobil görünüm (isMobileViewport): lg altı
  const isMobile = () => window.matchMedia('(max-width: 1023.98px)').matches;
  const state = {
    floorDoc: pFloorDoc,
    search: params.get('q') || '',
    filters: Object.assign({}, ['OLD', 'ALARM', 'WARNING', 'NORMAL', 'EMERGENCY'].indexOf(pFilter) >= 0 ? { sta: pFilter } : {},
      params.get('doc') ? { doc: params.get('doc') } : {}, pProto ? { proto: pProto } : {}),
    sortField: '',
    sortOrder: 1,
    page: 1,
    pageSize: 50,
    // kaynak: ?filter=OLD → filter_switch = 1
    showFilters: pFilter === 'OLD' || !!params.get('doc') || !!pProto,
    selected: new Set(),
    hiddenCols: {},
    live: params.get('live') !== '0'
  };

  // mobile: orijinal pointColumns (siraNo hide, DOC meta, Nokta primary, Ham meta, Değer sub, Birim meta, Tanım secondary, Durum badge);
  // sunum ekleri (Nokta ID, Bağlı Cihaz, Protokol, İletişim, Son Güncelleme) kartta "Detayları Göster" altında.
  // Grafik sütunu (actions) orijinaldeki gibi kaldırıldı; ?graph=<tag> derin bağlantısı çalışır.
  const COLUMNS = [
    { field: 'siraNo', header: 'Sıra', width: '56px', wrap: false, filterable: false, mobile: 'hide' },
    { field: 'pid', header: 'Nokta ID', sortable: true, width: '72px', wrap: false, filterable: false, mobile: 'extra' },
    { field: 'qry_doc', header: 'DOC', sortable: true, width: '78px', wrap: false, mobile: 'meta' },
    { field: 'rid', header: 'Tag Adı', sortable: true, minWidth: '190px', wrap: false, mobile: 'primary' },
    { field: 'dev', header: 'Bağlı Cihaz', sortable: true, minWidth: '170px', mobile: 'extra', mobileBlock: true },
    { field: 'pro', header: 'Ham Değer', width: '92px', wrap: false, mobile: 'meta' },
    { field: 'val', header: 'Değer', sortable: true, width: '96px', wrap: false, mobile: 'sub', mobileIcon: 'pi-gauge' },
    { field: 'unit', header: 'Birim', width: '56px', wrap: false, mobile: 'meta' },
    { field: 'desc', header: 'Tanım', minWidth: '200px', mobile: 'secondary' },
    { field: 'proto', header: 'Protokol', sortable: true, width: '96px', wrap: false, mobile: 'extra' },
    { field: 'comm', header: 'İletişim', sortable: true, width: '96px', wrap: false, mobile: 'extra' },
    { field: 'tim', header: 'Son Güncelleme', sortable: true, width: '140px', wrap: false, filterable: false, mobile: 'extra' },
    { field: 'sta', header: 'Durum', sortable: true, width: '150px', wrap: false, mobile: 'badge' }
  ];
  const cols = () => COLUMNS.filter(c => !state.hiddenCols[c.field]);
  // Mobil kart hücreleri (cardCellTemplates): salt okunur
  const CARD_CELL = {
    rid: p => '<span class="block whitespace-normal break-all leading-snug" title="' + esc(p.rid) + '">' + esc(p.rid) + '</span>',
    val: p => '<span class="font-mono font-extrabold text-base tracking-tight ' + getValColorClass(p.sta) + '">' + esc(p.val) + '</span>',
    pro: p => '<span class="font-mono">' + esc(p.pro) + '</span>'
  };
  const cardCols = () => cols().filter(c => c.mobile !== 'hide').map(c => Object.assign({}, c, {
    card: (p, i) => (CARD_CELL[c.field] ? CARD_CELL[c.field](p) : cellHtml(c.field, p, i))
  }));
  const cardTone = p => {
    const v = getClassNo(p.sta);
    return v === 1 || v === 6 || v === 7 ? 'alarm' : v === 5 ? 'warning' : v === 2 ? 'lost' : '';
  };

  // ---------------------------------------------------------------------------
  // Filtreleme / sıralama (inputFilter + getDocPath + get_qry mantığı)
  // ---------------------------------------------------------------------------
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  // Büyük/küçük harf duyarsız (QA #90): Türkçe ve İngilizce kurallarla (KLIMA / KLİMA / klima ikisi de bulunur)
  const lcEn = v => String(v == null ? '' : v).toLowerCase();
  const has = (v, s) => lc(v).indexOf(lc(s)) >= 0 || lcEn(v).indexOf(lcEn(s)) >= 0;
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
    const q = state.search.trim();
    // contains(@id | @doc | @pro | @val | @unit | @desc) (+ sunum: cihaz, protokol)
    if (q) list = list.filter(p => [p.rid, p.qry_doc, p.pro, p.val, p.unit, p.desc, p.dev, p.proto].some(v => has(v, q)));
    // getDocPath: sütundaki DOC süzgeci önceliklidir; yoksa başlıktaki kat seçimi, o da yoksa bütün dokümanlar
    if (f.doc && f.doc.trim()) { const d = docPath(f.doc); list = list.filter(p => p.qry_doc.toUpperCase().indexOf(d) === 0); }
    else if (state.floorDoc) list = list.filter(p => p.qry_doc === state.floorDoc);
    [['rid', 'rid'], ['pro', 'pro'], ['val', 'val'], ['unit', 'unit'], ['desc', 'desc'], ['dev', 'dev']].forEach(([k, field]) => {
      if (f[k] && f[k].trim()) { const s = f[k].trim(); list = list.filter(p => has(p[field], s)); }
    });
    if (f.proto) list = list.filter(p => p.proto === f.proto);
    if (f.comm) list = list.filter(p => commOf(p.sta) === f.comm);
    if (f.sta) list = list.filter(p => staMatch(p.sta, f.sta));

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
    // Kat seçimi (SITE_Floors) + Filtre (mobilde Filtre tablo başlığındadır)
    host.innerHTML = kit.pageHeader({
      title: 'NOKTALAR',
      breadcrumbs: [{ label: 'İzleme' }, { label: 'Telemetri Noktaları' }],
      actions: '<div class="flex items-center gap-2 max-lg:w-[calc(100vw-1.5rem)]">' +
        (FLOOR_DOCS.length > 1
          ? '<select data-floor aria-label="Kat" class="h-8 px-2 text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-card text-slate-700 dark:text-slate-200 rounded-[2px] max-lg:w-full max-lg:h-10 max-lg:text-[13px] max-lg:rounded-[3px]">' +
              opt('', 'Tüm Katlar', state.floorDoc) + FLOOR_DOCS.map(o => opt(o.value, o.label, state.floorDoc)).join('') + '</select>'
          : '') +
        '<span class="max-lg:hidden">' + button({ variant: state.showFilters ? 'primary' : 'secondary', icon: 'pi pi-filter', label: 'Filtre', attrs: 'data-act="filter" title="Filtreyi Aç/Kapat"' }) + '</span>' +
        '</div>'
    });
    host.querySelector('[data-act="filter"]').onclick = toggleFilters;
    const fl = host.querySelector('[data-floor]');
    if (fl) fl.addEventListener('change', () => { state.floorDoc = fl.value; state.page = 1; renderBody(); });
  }

  function toggleFilters() {
    state.showFilters = !state.showFilters;
    renderHeader(); renderTools(); renderHead(); renderMobileFilters();
  }

  // ---------------------------------------------------------------------------
  // Tablo (app-data-table)
  // ---------------------------------------------------------------------------
  const inputCls = 'w-full px-1.5 py-0.5 text-[11px] max-lg:h-10 max-lg:px-2.5 max-lg:text-base max-lg:font-medium max-lg:rounded-[3px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const selectCls = 'w-full px-1 py-0.5 text-[11px] max-lg:h-10 max-lg:px-2.5 max-lg:text-base max-lg:font-medium max-lg:rounded-[3px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500';
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
      default: return '';
    }
  }

  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + ((c.minWidth || c.width) ? 'min-width:' + (c.minWidth || c.width) + ';' : '');
  const $ = sel => document.querySelector('#tp-table ' + sel);

  const TOOL_BTN = 'px-2.5 py-1 max-lg:py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer';

  function renderTableShell() {
    const host = document.getElementById('tp-table');
    host.innerHTML =
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 max-lg:flex-col max-lg:items-stretch max-lg:gap-2">' +
        '<div class="flex flex-wrap items-center gap-2 max-lg:w-full max-lg:flex-col max-lg:items-stretch">' +
          '<div class="relative w-60 sm:w-72 max-lg:w-full">' +
            '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-search placeholder="Ara" value="' + esc(state.search) + '" class="w-full pl-8 pr-3 py-1 max-lg:py-2.5 text-xs max-lg:text-sm bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '</div>' +
          '<div class="flex items-center gap-1 max-lg:max-w-full max-lg:overflow-x-auto max-lg:pb-0.5" data-quick>' +
            QUICK.map(q => '<button type="button" data-q="' + q.value + '" class="px-2 py-1 max-lg:px-3 max-lg:py-1.5 max-lg:whitespace-nowrap max-lg:shrink-0 text-[11px] rounded-[2px] border transition-all cursor-pointer">' + esc(q.label) + '</button>').join('') +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0 max-lg:w-full max-lg:flex-wrap">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0 max-lg:hidden" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          '<div data-bulk class="hidden px-2 py-1 bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px] text-[11px] font-bold flex items-center gap-1.5"></div>' +
          // [table-actions] yuvası — rapor menüsü + sunum eki: canlı simülasyon
          '<div data-report-menu></div>' +
          '<span data-live-info class="hidden md:inline font-mono text-[10px] text-slate-500 dark:text-slate-400"></span>' +
          '<button type="button" data-live class="px-2.5 py-1 text-xs font-semibold border rounded-[2px] flex items-center gap-1.5 transition-all cursor-pointer"></button>' +
          // Mobilde Filtre tablo başlığında (Ara / Filtre / Yenile)
          '<button type="button" data-mfilter title="Filtre" class="lg:hidden px-2.5 py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer"><i class="pi pi-filter text-xs"></i><span>Filtre</span></button>' +
          '<div class="relative max-lg:hidden">' +
            '<button type="button" data-colmenu class="' + TOOL_BTN + '"><i class="pi pi-sliders-h text-xs"></i><span>Kolonlar</span></button>' +
            '<div data-colmenu-panel class="hidden absolute right-0 mt-1 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-2 text-xs space-y-1"></div>' +
          '</div>' +
          '<button type="button" data-refresh class="' + TOOL_BTN + '" title="Yenile"><i class="pi pi-refresh text-xs"></i><span class="lg:hidden">Yenile</span></button>' +
        '</div>' +
      '</div>' +
      '<div data-mfilters class="hidden"></div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto overflow-x-auto w-full custom-scrollbar max-lg:hidden" data-scroll>' +
        '<table class="scada-table w-full text-left border-collapse text-xs">' +
          '<thead class="sticky top-0 z-10 shadow-2xs" data-thead></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200" data-tbody></tbody>' +
        '</table>' +
      '</div>' +
      '<div data-cards class="' + kit.CARDS_WRAP_CLS + '"></div>' +
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
      renderQuick(); renderHead(); renderMobileFilters(); renderBody();
    }));
    $('[data-live]').addEventListener('click', () => { state.live = !state.live; renderLive(); scheduleLive(); });
    $('[data-mfilter]').addEventListener('click', toggleFilters);
    const colBtn = $('[data-colmenu]');
    const colPanel = $('[data-colmenu-panel]');
    colBtn.addEventListener('click', e => { e.stopPropagation(); colPanel.classList.toggle('hidden'); renderColMenu(); });
    colPanel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => colPanel.classList.add('hidden'));
    $('[data-refresh]').addEventListener('click', () => {
      const icon = $('[data-refresh] i');
      icon.className = 'pi pi-spin pi-spinner text-xs';
      setTimeout(() => { icon.className = 'pi pi-refresh text-xs'; renderBody(); toast("Noktalar doc('" + (state.floorDoc || 'CMR/*') + "') kaynağından yenilendi.", 'success'); }, 600);
    });

    // Rapor (app-report-export-menu, table-actions): Filtrelenmiş liste, "İlk N nokta"
    reportMenu = DCIM.report.menu($('[data-report-menu]'), {
      label: 'Rapor al', inTable: true, options: 'limit', unit: 'nokta', total: 0,
      scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }],
      onExport: exportReport
    });

    const onRowClick = e => {
      const pr = e.target.closest('[data-props]');
      if (pr) { e.stopPropagation(); openPropertiesChange(pr.getAttribute('data-props')); return; }
      if (e.target.closest('[data-set]') || e.target.closest('summary')) { e.stopPropagation(); return; }
      const row = e.target.closest('[data-row]');
      if (row) {
        const id = row.getAttribute('data-row');
        if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
        renderBody();
      }
    };
    const tbody = $('[data-tbody]');
    tbody.addEventListener('click', onRowClick);
    $('[data-cards]').addEventListener('click', onRowClick);
    // Çıkış noktası: Enter → setvalue(doc, id, val) → <doc>/<id>/pro/set
    tbody.addEventListener('keyup', e => {
      const inp = e.target.closest('[data-set]');
      if (!inp || e.key !== 'Enter') return;
      setvalue(byRid[inp.getAttribute('data-set')], inp.value.trim());
    });
  }

  // Filtre düğmesi durumu (mobil tablo başlığı)
  function renderTools() {
    const b = $('[data-mfilter]');
    if (!b) return;
    b.className = 'lg:hidden px-2.5 py-1.5 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
      (state.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700');
  }

  // Mobil süzgeç paneli: masaüstündeki kolon içi süzgeçlerin alt alta hâli (kart görünümünde thead gizli)
  function renderMobileFilters() {
    const host = $('[data-mfilters]');
    if (!host) return;
    if (!state.showFilters) { host.className = 'hidden'; host.innerHTML = ''; return; }
    host.className = 'lg:hidden shrink-0 max-h-[45vh] overflow-y-auto grid grid-cols-2 gap-2 p-2.5 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-[#0b121e]';
    host.innerHTML = cols().filter(c => c.filterable !== false && filterCell(c)).map(c =>
      '<label class="flex flex-col gap-1 min-w-0' + (c.field === 'desc' || c.field === 'rid' ? ' col-span-2' : '') + '"><span class="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">' + esc(c.header) + '</span>' + filterCell(c) + '</label>').join('') +
      '<button type="button" data-clear-filters class="col-span-2 h-9 rounded-[3px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5"><i class="pi pi-filter-slash text-xs"></i>Temizle</button>';
    bindFilterInputs(host);
    host.querySelector('[data-clear-filters]').addEventListener('click', clearFilters);
  }

  function bindFilterInputs(scope) {
    scope.querySelectorAll('[data-f]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        state.filters[inp.getAttribute('data-f')] = inp.value;
        state.page = 1;
        if (inp.getAttribute('data-f') === 'sta') renderQuick();
        renderBody();
      });
    });
  }

  function setvalue(p, raw) {
    // Mobilde çıkış noktasına değer yazma yok (yalnızca görüntüleme)
    if (isMobile()) return;
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
      b.className = 'px-2 py-1 max-lg:px-3 max-lg:py-1.5 max-lg:whitespace-nowrap max-lg:shrink-0 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
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
    bindFilterInputs(thead);
    const clr = thead.querySelector('[data-clear-filters]');
    if (clr) clr.addEventListener('click', clearFilters);
    thead.querySelector('[data-check-all]').addEventListener('change', e => {
      const pageRows = currentPageRows();
      if (e.target.checked) pageRows.forEach(p => state.selected.add(p.rid)); else state.selected.clear();
      renderBody();
    });
  }

  function clearFilters() {
    state.floorDoc = '';
    state.filters = {};
    state.search = '';
    state.page = 1;
    $('[data-search]').value = '';
    renderHeader();
    renderQuick();
    renderHead();
    renderMobileFilters();
    renderBody();
  }

  let lastFiltered = [];
  let reportMenu = null;
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
    // Mobil kartlar (lg altı)
    $('[data-cards]').innerHTML = kit.dataCards(rows, cardCols(), {
      start: (state.page - 1) * state.pageSize, tone: cardTone,
      rowAttrs: p => 'data-row="' + esc(p.rid) + '"',
      cardCls: p => (state.selected.has(p.rid) ? 'ring-1 ring-sky-500/60' : '')
    });
    if (reportMenu) reportMenu.update({ total: lastFiltered.length, disabled: !lastFiltered.length });
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
      '<div class="flex items-center gap-3 self-end sm:self-auto max-lg:w-full max-lg:justify-between">' +
        '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa Başına:</span>' +
          '<select data-pagesize class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === state.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-page="-1"' + (state.page <= 1 ? ' disabled' : '') + ' class="w-7 h-7 max-lg:w-9 max-lg:h-9 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-left text-[10px]"></i></button>' +
          '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + state.page + ' / ' + totalPages + '</span>' +
          '<button type="button" data-page="1"' + (state.page >= totalPages ? ' disabled' : '') + ' class="w-7 h-7 max-lg:w-9 max-lg:h-9 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="pi pi-chevron-right text-[10px]"></i></button>' +
        '</div>' +
      '</div>';
    footer.querySelector('[data-pagesize]').addEventListener('change', e => { state.pageSize = parseInt(e.target.value, 10); state.page = 1; renderBody(); });
    footer.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => {
      state.page += parseInt(b.getAttribute('data-page'), 10);
      renderBody();
      $('[data-scroll]').scrollTop = 0;
      $('[data-cards]').scrollTop = 0;
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
    // Mobilde nokta özelliği düzenleme yok (yalnızca görüntüleme)
    if (isMobile()) return;
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
  // Rapor (exportReport): kat/DOC, arama, sütun ve durum süzgeçleriyle eşleşen noktaların tamamı
  // (tablo yalnız bir sayfa gösterir); "İlk N nokta" seçilirse ilk N.
  // ---------------------------------------------------------------------------
  function pointReportTone(sta) {
    const v = getClassNo(sta);
    if (v === 0) return '';
    if (v === 1 || v === 6 || v === 7) return 'critical';
    if (v === 2 || v === 5) return 'warning';
    return 'normal';
  }

  function exportReport(req) {
    const total = lastFiltered.length;
    const rows = DCIM.report.applyLimit(lastFiltered, req).map((p, i) => ({
      no: i + 1, doc: p.qry_doc, rid: p.rid, pro: p.pro, val: p.val, unit: p.unit, desc: p.desc, sta: getStaText(p.sta), tone: pointReportTone(p.sta), cls: getClassNo(p.sta)
    }));
    const count = classes => rows.filter(r => classes.indexOf(r.cls) >= 0).length;
    const f = state.filters;
    const floorLabel = state.floorDoc ? ((FLOOR_DOCS.find(o => o.value === state.floorDoc) || {}).label || state.floorDoc) : '';
    const staLabel = { NORMAL: 'Normal', OLD: 'Veri Alınamıyor', WARNING: 'Uyarı', ALARM: 'Alarm', EMERGENCY: 'Acil' };
    const filters = [
      floorLabel ? 'kat: ' + floorLabel : '',
      state.search.trim() ? 'arama "' + state.search.trim() + '"' : '',
      (f.doc || '').trim() ? 'DOC: ' + f.doc.trim() : '',
      (f.rid || '').trim() ? 'nokta: ' + f.rid.trim() : '',
      (f.dev || '').trim() ? 'cihaz: ' + f.dev.trim() : '',
      (f.pro || '').trim() ? 'ham değer: ' + f.pro.trim() : '',
      (f.val || '').trim() ? 'değer: ' + f.val.trim() : '',
      (f.unit || '').trim() ? 'birim: ' + f.unit.trim() : '',
      (f.desc || '').trim() ? 'açıklama: ' + f.desc.trim() : '',
      f.proto ? 'protokol: ' + f.proto : '',
      f.comm ? 'iletişim: ' + f.comm : '',
      f.sta ? 'durum: ' + (staLabel[f.sta] || f.sta) : ''
    ].filter(Boolean);
    const scopeText = req.limit && req.limit < total ? 'ilk ' + req.limit + ' / ' + total + ' nokta' : 'tüm ' + total + ' nokta';
    DCIM.report.generate({
      title: 'Telemetri Noktaları Raporu',
      subtitle: (filters.length ? 'Filtre: ' + filters.join(', ') : 'Tüm noktalar') + ' · İzleme · ' + scopeText + ' · veri ' + new Date().toLocaleString('tr-TR'),
      filename: 'Telemetri_Noktalari',
      kpis: [
        { label: 'Nokta', value: rows.length },
        { label: 'Normal', value: count([3, 4]), tone: 'normal' },
        { label: 'Uyarı', value: count([5]), tone: count([5]) ? 'warning' : 'normal' },
        { label: 'Alarm / Tehlike', value: count([6, 7]), tone: count([6, 7]) ? 'critical' : 'normal' },
        { label: 'Veri hatası / Arıza', value: count([1, 2]), tone: count([1, 2]) ? 'warning' : 'normal' }
      ],
      sections: [{
        title: 'Telemetri noktaları', toneKey: 'tone', rows,
        columns: [
          { key: 'no', label: 'No', align: 'right' }, { key: 'doc', label: 'DOC' }, { key: 'rid', label: 'Nokta' },
          { key: 'pro', label: 'Ham değer', align: 'right' }, { key: 'val', label: 'Değer', align: 'right' }, { key: 'unit', label: 'Birim' },
          { key: 'desc', label: 'Açıklama' }, { key: 'sta', label: 'Durum' }
        ]
      }],
      notes: ['Değerler raporun alındığı andaki AyXDB okumasıdır.']
    }, req.format);
  }

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderHeader();
  renderTableShell();
  renderTools();
  renderQuick();
  renderLive();
  renderHead();
  renderMobileFilters();
  renderBody();
  scheduleLive();

  if (params.get('graph')) showGraph(params.get('graph'));
  else if (params.get('props')) openPropertiesChange(params.get('props'));
  else if (params.get('report') === '1') { const b = document.querySelector('#tp-table [data-report-menu] [data-rk-btn]'); if (b) b.click(); }
})();
