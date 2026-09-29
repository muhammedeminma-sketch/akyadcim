/* ==========================================================================
   DCIM Sunum — Maksimum Güç Raporu (NewUICMPMaxpowReportComponent / maxpow-report)
   Filtre kartı (kat, kategori, periyot, tarih/saat) + "Rapor Oluştur" ile açılan
   sonuç penceresi: kategori bazlı en yüksek güç tüketimleri ve zirve anları.
   Veri: DCIM.data.reports.maxpow (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // ---------------------------------------------------------------------------
  // Çeviriler (messages.tr.json → reportMaxpow.*)
  // ---------------------------------------------------------------------------
  const T = {
    title: 'MAKSİMUM GÜÇ VERİLERİ RAPORLAMA',
    menuReports: 'Raporlar',
    floorSelection: 'Kat Seçimi:',
    category: 'Kategori:',
    categoryPlaceholder: 'Kategori seçin...',
    reportPeriod: 'Rapor Periyodu:',
    dateRange: 'Tarih Aralığı',
    hourly: 'Saatlik',
    date: 'Tarih:',
    startTime: 'Başlangıç Saati:',
    endTime: 'Bitiş Saati:',
    quickSelection: 'Hazır Aralıklar:',
    presetsPlaceholder: 'Aralık seçin...',
    startDate: 'Başlangıç Tarihi:',
    endDate: 'Bitiş Tarihi:',
    clear: 'Temizle',
    generating: 'Oluşturuluyor...',
    generateReport: 'Rapor Oluştur',
    all: 'Hepsi',
    select: 'Seçiniz',
    selectFloor: 'Lütfen en az bir kat seçin.',
    selectCategory: 'Lütfen en az bir kategori seçin.',
    selectDateHourly: 'Lütfen saatlik rapor için bir tarih seçin.',
    selectDateDaily: 'Lütfen tarih aralığı için başlangıç ve bitiş tarihi seçin.',
    noDevicesFound: 'Seçilen kriterlere uygun cihaz (Watt, kW veya mtr_pow=1) bulunamadı.',
    popupTitle: 'Maksimum Güç Verileri',
    pdfDownload: 'PDF İndir',
    excelDownload: 'Excel İndir',
    zipDownload: 'ZIP İndir',
    loadingPreparing: 'Veriler İşleniyor Lütfen Bekleyiniz...',
    region: 'Bölge',
    categoryCol: 'Kategori',
    device: 'Cihaz',
    maxPower: 'Maksimum Güç',
    dateCol: 'Tarih',
    noData: 'Seçilen kriterlere uygun veri bulunamadı veya işlem iptal edildi.',
    regionFormat: 'Kat {floor} Salon {room}'
  };
  const CATEGORY_LABEL = { 'SDP': 'SDP', 'TRAFO': 'TRAFO', 'PDU': 'PDU', 'KLİMA': 'KLİMA', 'DİĞER': 'DİĞER', 'BİLİNMEYEN': 'BİLİNMEYEN' };
  const catLabel = c => CATEGORY_LABEL[c] || c;

  const CATEGORY_LIST = ['SDP', 'TRAFO', 'PDU', 'KLİMA'];
  const FLOORS = [
    { value: 'F1', label: '1. Kat' },
    { value: 'F2', label: '2. Kat' },
    { value: 'F3', label: '3. Kat' },
    { value: 'IDC4', label: 'IDC4' }
  ];
  const PRESETS = [
    { value: 'custom', label: 'Özel Aralık Seç' },
    { value: 'yesterday', label: 'Dün' },
    { value: 'past_week', label: 'Geçen Hafta (Son 7 Gün)' },
    { value: 'month_to_date', label: 'Bu Ay' },
    { value: 'past_month', label: 'Son Bir Ay (Son 30 Gün)' },
    { value: 'last_month', label: 'Geçen Ay (Takvim Ayı)' },
    { value: 'year_to_date', label: 'Bu Yıl' },
    { value: 'past_year', label: 'Son Bir Yıl (Son 365 Gün)' },
    { value: 'last_year', label: 'Geçen Yıl (Takvim Yılı)' }
  ];

  // ---------------------------------------------------------------------------
  // Şablon sınıfları (maxpow-report.component.html'den birebir)
  // ---------------------------------------------------------------------------
  const MENU = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-52 overflow-y-auto p-1 space-y-0.5';
  const ALL_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const ITEM_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const OPT = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const TH = 'px-3.5 py-2.5 border-r border-slate-200 dark:border-border-subtle last:border-r-0';
  const TD = 'px-3.5 py-2 border-r border-slate-200 dark:border-border-subtle last:border-r-0 font-mono text-[11px]';

  // ---------------------------------------------------------------------------
  // RID çözümleyiciler (ts'den birebir)
  // ---------------------------------------------------------------------------
  function extractCategoryFromRid(rid) {
    if (!rid) return 'BİLİNMEYEN';
    const r = rid.toUpperCase();
    if (r.includes('UPS') || r.includes('KGK')) return 'SDP';
    if (r.includes('TRAFO') || r.includes('TRF') || r.includes('TRANSFORMER')) return 'TRAFO';
    if (r.includes('PDU')) return 'PDU';
    if (r.includes('KLM') || r.includes('KLIMA') || r.includes('CLIMA') || r.includes('CRAC')) return 'KLİMA';
    return 'DİĞER';
  }

  function extractRegionFromRid(rid) {
    if (!rid) return 'Bölge Bilinmiyor';
    const id = rid.trim().toUpperCase();
    const rm = id.match(/KAT\d+_SAL\d+/);
    if (rm && rm[0]) return rm[0];
    if (id.startsWith('K1')) return 'KAT1_SAL1';
    if (id.startsWith('K2')) {
      const nm = id.match(/K2[A-Z]+(\d+)/);
      const n = nm ? parseInt(nm[1], 10) : 0;
      if (id.startsWith('K2A')) {
        if (id.startsWith('K2AD65')) return 'KAT2_SAL4';
        if (id.startsWith('K2AD67')) return (id.includes('_PDU_A') || id.includes('_A_')) ? 'KAT2_SAL4' : 'KAT2_SAL1';
        return n >= 67 ? 'KAT2_SAL4' : 'KAT2_SAL1';
      }
      if (id.startsWith('K2B') || id.startsWith('K2C')) {
        if (id.startsWith('K2BZ')) return 'KAT2_SAL1';
        if (id.startsWith('K2BA') || id.startsWith('K2BB') || id.startsWith('K2C')) return 'KAT2_SAL3';
        if (id.startsWith('K2BI') || id.startsWith('K2BQ')) return 'KAT2_SAL2';
        if (id.startsWith('K2BX') || id.startsWith('K2BY')) return 'KAT2_SAL4';
        if (id.startsWith('K2BN')) return n >= 75 ? 'KAT2_SAL5' : 'KAT2_SAL2';
        return 'KAT2_SAL5';
      }
    }
    if (id.startsWith('K3')) {
      const nm = id.match(/K3[A-Z]+(\d+)/);
      const n = nm ? parseInt(nm[1], 10) : 0;
      if (n >= 1 && n <= 19) return 'KAT3_SAL6';
      if (n >= 20 && n <= 33) return id.startsWith('K3AX') ? 'KAT3_SAL4' : 'KAT3_SAL5';
      if (n >= 34) {
        if (id.startsWith('K3AT') || id.startsWith('K3BC') || id.startsWith('K3AX')) return 'KAT3_SAL1';
        if (id.startsWith('K3BJ') || id.startsWith('K3BM') || id.startsWith('K3BR')) return 'KAT3_SAL2';
        return 'KAT3_SAL3';
      }
    }
    if (id.startsWith('K4') || id.includes('IDC4')) return 'IDC4';
    if (id.includes('IDC3')) return 'IDC3';
    if (id.includes('IDC2')) return 'IDC2';
    if (id.includes('IDC1')) return 'IDC1';
    return 'Bölge Bilinmiyor';
  }

  function extractDeviceFromRid(rid) {
    if (!rid) return 'N/A';
    let n = rid;
    const suffixes = ['_TOT_POW', '_TOT_RPW', '_TOT_APW', '_PA_POW', '_PB_POW', '_PC_POW', '_IN_POW', '_OUT_POW', '_UNITPOW', '_POW'];
    for (const s of suffixes) { if (n.endsWith(s)) { n = n.substring(0, n.length - s.length); break; } }
    const prefixes = ['KAT1_SAL1_', 'IDC1_', 'POD1_', 'POD2_', 'POD3_', 'POD4_', 'POD5_', 'POD6_', 'POD7_', 'POD8_', 'POD9_', 'POD10_', 'DEV_'];
    for (const p of prefixes) { if (n.startsWith(p)) { n = n.substring(p.length); break; } }
    n = n.replace(/_/g, ' ').trim();
    n = n.replace(/KLM/g, 'KLİMA').replace(/UPS/g, 'SDP').replace(/GIR1/g, 'GİRİŞ 1').replace(/GIR2/g, 'GİRİŞ 2').replace(/Q1/g, '(Q1)').replace(/Q2/g, '(Q2)');
    return n;
  }

  function formatRegionDisplay(regionId) {
    if (!regionId) return '';
    const m = regionId.match(/KAT(\d+)_SAL(\d+)/);
    if (m) return T.regionFormat.replace('{floor}', m[1]).replace('{room}', m[2]);
    return regionId.replace(/_/g, ' ');
  }
  function formatPowerValue(v) {
    if (isNaN(v)) return '0 W';
    return v >= 1000 ? (v / 1000).toFixed(2) + ' kW' : v.toFixed(2) + ' W';
  }
  const formatDateTime = s => { if (!s) return 'N/A'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString('tr-TR'); };
  const pad = n => String(n).padStart(2, '0');
  const formatDateForInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  const registry = (DCIM.reportRegistry = DCIM.reportRegistry || {});
  registry['maxpow'] = {
    mount(el) {
      const { esc, button, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const MOCK = DCIM.data.reports.maxpow;

      const st = {
        dd: { floor: false, category: false, preset: false },
        selectedFloors: ['F1'],
        selectedCategories: [],
        reportMode: 'daily',
        filterDate: '', startTime: '00:00:00', endTime: '23:59:59',
        startDate: '', endDate: '', selectedDateRangePreset: 'custom',
        showPopup: false, isLoadingData: false, progressMessage: '',
        popupData: []
      };
      let timer = null;

      // ---------------------------------------------------------------- durum
      const allFloors = () => st.selectedFloors.length === FLOORS.length;
      const allCats = () => st.selectedCategories.length === CATEGORY_LIST.length;
      function floorLabel() {
        if (allFloors()) return T.all;
        return FLOORS.filter(f => st.selectedFloors.includes(f.value)).map(f => f.label).join(', ');
      }
      function categoriesLabel() {
        if (allCats()) return T.all;
        return st.selectedCategories.map(catLabel).join(', ');
      }
      function presetLabel() { const p = PRESETS.find(x => x.value === st.selectedDateRangePreset); return p ? p.label : T.select; }
      function isFormValid() {
        if (!st.selectedFloors.length || !st.selectedCategories.length) return false;
        if (st.reportMode === 'hourly') return !!st.filterDate && !!st.startTime && !!st.endTime;
        return !!st.startDate && !!st.endDate;
      }
      const hasData = () => st.popupData.length > 0 && st.popupData.some(g => g.result.length > 0);
      function progressPct() {
        if (!st.progressMessage || st.progressMessage.indexOf('%') < 0) return '0%';
        const v = st.progressMessage.split('%')[1].split(' ')[0];
        return v ? v + '%' : '0%';
      }

      function applyPreset() {
        if (st.selectedDateRangePreset === 'custom') return;
        const now = new Date();
        let start = new Date();
        let end = new Date();
        switch (st.selectedDateRangePreset) {
          case 'yesterday': start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); break;
          case 'past_week': start.setDate(now.getDate() - 7); end.setDate(now.getDate() - 1); break;
          case 'month_to_date': start = new Date(now.getFullYear(), now.getMonth(), 1); end.setDate(now.getDate() - 1); break;
          case 'past_month': start.setDate(now.getDate() - 30); end.setDate(now.getDate() - 1); break;
          case 'last_month': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
          case 'year_to_date': start = new Date(now.getFullYear(), 0, 1); end.setDate(now.getDate() - 1); break;
          case 'past_year': start.setDate(now.getDate() - 365); end.setDate(now.getDate() - 1); break;
          case 'last_year': start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31); break;
          default: break;
        }
        st.startDate = formatDateForInput(start);
        st.endDate = formatDateForInput(end);
      }

      function clearFilters() {
        st.selectedCategories = [];
        st.selectedFloors = ['F1'];
        st.reportMode = 'daily';
        st.filterDate = ''; st.startTime = '00:00:00'; st.endTime = '23:59:59';
        st.startDate = ''; st.endDate = ''; st.selectedDateRangePreset = 'custom';
        Object.keys(st.dd).forEach(k => { st.dd[k] = false; });
      }

      function toggleDropdown(key) {
        const cur = st.dd[key];
        Object.keys(st.dd).forEach(k => { st.dd[k] = false; });
        if (!cur) st.dd[key] = true;
      }

      // fetchAllCategoryIds: seçili katlar × seçili kategoriler (sıra korunur)
      function fetchAllIds() {
        const ids = [];
        FLOORS.forEach(f => {
          if (!st.selectedFloors.includes(f.value)) return;
          st.selectedCategories.forEach(c => MOCK.devices(f.value, c).forEach(id => ids.push(id)));
        });
        return Array.from(new Set(ids));
      }

      // processAndFindWinners
      function processAndFindWinners(raw) {
        if (!raw.length) { st.popupData = []; return; }
        const map = new Map();
        raw.forEach(it => { const ex = map.get(it.rid); if (!ex || parseFloat(it.max) > parseFloat(ex.max)) map.set(it.rid, it); });
        const byCat = new Map();
        map.forEach(it => {
          const cat = extractCategoryFromRid(it.rid);
          const val = parseFloat(it.max) || 0;
          const rec = { region: extractRegionFromRid(it.rid), category: cat, device: extractDeviceFromRid(it.rid), value: formatPowerValue(val), numericValue: val, date: it.tim ? formatDateTime(it.tim) : 'N/A' };
          if (!byCat.has(cat)) byCat.set(cat, []);
          byCat.get(cat).push(rec);
        });
        const result = [];
        byCat.forEach(list => { list.sort((a, b) => b.numericValue - a.numericValue); result.push.apply(result, list); });
        st.popupData = [{ sensor_group: 'Kategori Bazlı Güç Tüketimleri', result }];
      }

      function applyFilters() {
        if (!st.selectedFloors.length) { toast(T.selectFloor, 'warning'); return; }
        if (!st.selectedCategories.length) { toast(T.selectCategory, 'warning'); return; }
        if (st.reportMode === 'hourly' && !st.filterDate) { toast(T.selectDateHourly, 'warning'); return; }
        if (st.reportMode === 'daily' && (!st.startDate || !st.endDate)) { toast(T.selectDateDaily, 'warning'); return; }
        if (timer) { clearInterval(timer); timer = null; }
        const ids = fetchAllIds();
        if (!ids.length) { toast(T.noDevicesFound, 'warning'); return; }
        st.showPopup = true; st.isLoadingData = true; st.popupData = [];
        const q = { mode: st.reportMode, startDate: st.startDate, endDate: st.endDate, filterDate: st.filterDate, startTime: st.startTime, endTime: st.endTime };
        // CHUNK_SIZE = 15 — parça parça sorgu simülasyonu
        const chunks = [];
        for (let i = 0; i < ids.length; i += 15) chunks.push(ids.slice(i, i + 15));
        const stepMs = Math.max(20, Math.min(120, Math.round(1500 / chunks.length)));
        const raw = [];
        let i = 0;
        renderMain();
        renderPopup();
        timer = setInterval(() => {
          raw.push.apply(raw, MOCK.query(chunks[i], q));
          i++;
          st.progressMessage = '%' + Math.round((i / chunks.length) * 100) + ' Tamamlandı';
          if (i >= chunks.length) {
            clearInterval(timer); timer = null;
            processAndFindWinners(raw);
            st.isLoadingData = false; st.progressMessage = '';
            renderMain();
          }
          renderPopup();
        }, stepMs);
      }

      function closePopup() {
        if (timer) { clearInterval(timer); timer = null; }
        st.showPopup = false; st.popupData = []; st.isLoadingData = false; st.progressMessage = '';
        renderMain();
        renderPopup();
      }

      function downloadExcel() {
        const rows = [];
        st.popupData.forEach(g => g.result.forEach(r => rows.push(r)));
        kit.exportExcel('maksimum_guc_raporu', [
          { header: T.region, value: r => formatRegionDisplay(r.region) },
          { header: T.categoryCol, value: r => catLabel(r.category) },
          { header: T.device, value: r => r.device },
          { header: T.maxPower, value: r => r.value },
          { header: T.dateCol, value: r => r.date }
        ], rows);
      }

      // ------------------------------------------------------------------ HTML
      function dropdownInput(value, key, placeholder) {
        return '<div class="relative"><input type="text" class="scada-input pr-8 cursor-pointer" readonly value="' + esc(value) + '" data-dd-toggle="' + key + '" placeholder="' + esc(placeholder) + '" />' + CHEVRON + '</div>';
      }
      const chkRow = (cls, kind, value, checked, label) =>
        '<label class="' + cls + '"><input type="checkbox" data-chk="' + kind + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + ' class="' + CHK + '" /><span>' + esc(label) + '</span></label>';

      function filtersHtml() {
        let h = '';
        // 1. Kat
        h += '<div class="relative" data-dd-wrap="floor">' +
          kit.formField({ label: T.floorSelection, control: dropdownInput(floorLabel(), 'floor', T.select) }) +
          (st.dd.floor ? '<div class="' + MENU + '">' +
            chkRow(ALL_ROW, 'floor', '__all__', allFloors(), T.all) +
            FLOORS.map(f => chkRow(ITEM_ROW, 'floor', f.value, st.selectedFloors.includes(f.value), f.label)).join('') +
          '</div>' : '') +
        '</div>';
        // 2. Kategori
        h += '<div class="relative"><div data-dd-wrap="category">' +
          kit.formField({ label: T.category, control: dropdownInput(categoriesLabel(), 'category', T.categoryPlaceholder) }) +
          (st.dd.category ? '<div class="' + MENU + '">' +
            chkRow(ALL_ROW, 'category', '__all__', allCats(), T.all) +
            CATEGORY_LIST.map(c => chkRow(ITEM_ROW, 'category', c, st.selectedCategories.includes(c), catLabel(c))).join('') +
          '</div>' : '') +
        '</div></div>';
        // 3. Periyot
        h += kit.formField({
          label: T.reportPeriod,
          control: '<div class="flex items-center gap-4 py-2">' +
            '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-800 dark:text-slate-200"><input type="radio" id="mode-daily" name="mp-mode" value="daily" data-mode' + (st.reportMode === 'daily' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.dateRange) + '</span></label>' +
            '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-800 dark:text-slate-200"><input type="radio" id="mode-hourly" name="mp-mode" value="hourly" data-mode' + (st.reportMode === 'hourly' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.hourly) + '</span></label>' +
          '</div>'
        });
        if (st.reportMode === 'hourly') {
          h += kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-model="filterDate" value="' + esc(st.filterDate) + '" class="scada-input" />' });
          h += kit.formField({ label: T.startTime, control: '<input type="time" id="start-time" step="1" data-model="startTime" value="' + esc(st.startTime) + '" class="scada-input" />' });
          h += kit.formField({ label: T.endTime, control: '<input type="time" id="end-time" step="1" data-model="endTime" value="' + esc(st.endTime) + '" class="scada-input" />' });
        } else {
          h += '<div class="relative" data-dd-wrap="preset">' +
            kit.formField({ label: T.quickSelection, control: dropdownInput(presetLabel(), 'preset', T.presetsPlaceholder) }) +
            (st.dd.preset ? '<div class="' + MENU + '">' + PRESETS.map((p, i) => '<div data-dp-opt="' + i + '" class="' + OPT + '">' + esc(p.label) + '</div>').join('') + '</div>' : '') +
          '</div>';
          h += kit.formField({ label: T.startDate, control: '<input type="date" id="start-date" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input" />' });
          h += kit.formField({ label: T.endDate, control: '<input type="date" id="end-date" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input" />' });
        }
        return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">' + h + '</div>';
      }

      function renderMain() {
        const loading = st.isLoadingData;
        const disabled = loading || !isFormValid();
        const genBtn = loading
          ? '<button type="button" class="' + DCIM.ui.buttonClasses('primary', 'md', false) + '" data-act="generate" disabled aria-busy="true"><i class="pi pi-spin pi-spinner text-current"></i><span class="truncate">' + esc(T.generating) + '</span></button>'
          : button({ variant: 'primary', icon: 'pi pi-chart-bar', label: T.generateReport, attrs: 'data-act="generate"' + (disabled ? ' disabled' : '') });
        mainEl.innerHTML =
          kit.pageHeader({
            title: T.title,
            breadcrumbs: [{ label: T.menuReports }, { label: T.title }],
            actions: genBtn
          }) +
          kit.card({ title: T.title, icon: 'pi pi-filter', body: filtersHtml() });
      }

      function renderPopup() {
        if (!st.showPopup) { popupEl.innerHTML = ''; return; }
        const dis = (!hasData() || st.isLoadingData) ? ' disabled' : '';
        let body = '';
        if (st.isLoadingData) {
          body = '<div class="py-12 flex flex-col items-center justify-center gap-3">' +
            '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl"></i>' +
            '<p class="text-slate-300 text-sm font-medium">' + esc(T.loadingPreparing) + '</p>' +
            (st.progressMessage ? '<div class="w-64 bg-slate-800 rounded-full h-2 overflow-hidden mt-2"><div class="bg-sky-500 h-full transition-all duration-300" style="width:' + progressPct() + '"></div></div>' +
              '<p class="text-xs text-sky-300 font-mono">' + esc(st.progressMessage) + '</p>' : '') +
          '</div>';
        } else if (hasData()) {
          body = '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
            '<table class="w-full text-left text-xs border-collapse"><thead>' +
              '<tr class="bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider">' +
                [T.region, T.categoryCol, T.device, T.maxPower, T.dateCol].map(c => '<th class="' + TH + '">' + esc(c) + '</th>').join('') +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' +
                st.popupData.map(g => g.result.map(it =>
                  '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
                    '<td class="' + TD + '">' + esc(formatRegionDisplay(it.region)) + '</td>' +
                    '<td class="' + TD + '">' + esc(catLabel(it.category)) + '</td>' +
                    '<td class="' + TD + '">' + esc(it.device) + '</td>' +
                    '<td class="' + TD + ' font-bold text-sky-400">' + esc(it.value) + '</td>' +
                    '<td class="' + TD + '">' + esc(it.date) + '</td>' +
                  '</tr>').join('')).join('') +
              '</tbody></table></div>';
        } else {
          body = kit.emptyState({ message: T.noData, icon: 'pi pi-inbox' });
        }
        popupEl.innerHTML =
          '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4" data-popup-backdrop>' +
            '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">' +
              '<div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel">' +
                '<h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-table text-sky-400"></i>' + esc(T.popupTitle) + '</h3>' +
                '<div class="flex items-center gap-2">' +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.pdfDownload, attrs: 'data-act="pdf"' + dis }) +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.excelDownload, attrs: 'data-act="excel"' + dis }) +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-folder', label: T.zipDownload, attrs: 'data-act="zip"' + dis }) +
                  '<button type="button" data-act="close" class="text-slate-400 hover:text-white text-lg font-bold px-2 py-0.5 rounded-[2px] transition-colors">×</button>' +
                '</div>' +
              '</div>' +
              '<div class="p-5 overflow-y-auto flex-1 space-y-4">' + body + '</div>' +
            '</div>' +
          '</div>';
      }

      // ------------------------------------------------------------------ olaylar
      el.innerHTML = '<div class="space-y-4"><div class="space-y-4" data-mp-main></div><div data-mp-popup></div></div>';
      const mainEl = el.querySelector('[data-mp-main]');
      const popupEl = el.querySelector('[data-mp-popup]');

      function onClick(e) {
        const t = e.target;
        if (t.matches('[data-popup-backdrop]')) { closePopup(); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
          const a = act.getAttribute('data-act');
          if (a === 'reset') { clearFilters(); renderMain(); }
          else if (a === 'generate') applyFilters();
          else if (a === 'close') closePopup();
          else if (a === 'excel') downloadExcel();
          else if (a === 'pdf') kit.exportPdf();
          else if (a === 'zip') { downloadExcel(); kit.exportPdf(); }
          return;
        }
        const opt = t.closest('[data-dp-opt]');
        if (opt) {
          st.selectedDateRangePreset = PRESETS[+opt.getAttribute('data-dp-opt')].value;
          applyPreset();
          Object.keys(st.dd).forEach(k => { st.dd[k] = false; });
          renderMain();
          return;
        }
        const tog = t.closest('[data-dd-toggle]');
        if (tog) { toggleDropdown(tog.getAttribute('data-dd-toggle')); renderMain(); }
      }

      function onChange(e) {
        const t = e.target;
        if (t.matches('[data-chk]')) {
          const kind = t.getAttribute('data-chk');
          const v = t.value;
          const on = t.checked;
          if (kind === 'floor') {
            if (v === '__all__') st.selectedFloors = on ? FLOORS.map(f => f.value) : [];
            else if (on && !st.selectedFloors.includes(v)) st.selectedFloors.push(v);
            else if (!on) st.selectedFloors = st.selectedFloors.filter(x => x !== v);
          } else {
            if (v === '__all__') st.selectedCategories = on ? CATEGORY_LIST.slice() : [];
            else if (on && !st.selectedCategories.includes(v)) st.selectedCategories.push(v);
            else if (!on) st.selectedCategories = st.selectedCategories.filter(x => x !== v);
          }
          renderMain();
          return;
        }
        if (t.matches('[data-mode]')) { st.reportMode = t.value; renderMain(); return; }
        if (t.matches('[data-model]')) { st[t.getAttribute('data-model')] = t.value; renderMain(); }
      }

      // Tarih/saat yazılırken yalnızca durumu güncelle; buton durumu change'de yenilenir
      function onInput(e) {
        const t = e.target;
        if (t.matches('[data-model]')) st[t.getAttribute('data-model')] = t.value;
      }

      function onDocClick(e) {
        if (!e.target.isConnected) return;
        let changed = false;
        Object.keys(st.dd).forEach(k => {
          if (!st.dd[k]) return;
          const wrap = mainEl.querySelector('[data-dd-wrap="' + k + '"]');
          if (!wrap || !wrap.contains(e.target)) { st.dd[k] = false; changed = true; }
        });
        if (changed) renderMain();
      }
      function onKey(e) { if (e.key === 'Escape' && st.showPopup) closePopup(); }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);

      // Sunum için hazır seçim: tüm kategoriler + son 7 gün (Temizle → Angular varsayılanı)
      st.selectedCategories = CATEGORY_LIST.slice();
      st.selectedDateRangePreset = 'past_week';
      applyPreset();
      renderMain();

      return {
        destroy() {
          if (timer) clearInterval(timer);
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          el.removeEventListener('input', onInput);
          document.removeEventListener('click', onDocClick);
          document.removeEventListener('keydown', onKey);
          el.innerHTML = '';
        }
      };
    }
  };
})();
