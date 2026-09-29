/* ==========================================================================
   DCIM Sunum — PDU Güç Raporu (ReportEnergyComponent / NewUICMPEnergyReportComponent)
   Kaynak: new-ui/pages/reporting/energy-report/  +  common/pop-ups/graph-pop-up (GraphPopupComponent)
   + common/graphs/line-graph (LineGraphComponent, Chart.js line).
   Müşteri bazlı / Kabin bazlı rapor; "Rapor Oluştur" → Tarihsel Analiz Sonuçları penceresi,
   "Grafik Rapor" → Chart.js çizgi grafik penceresi.
   Veri: DCIM.data.reports.pduEnergy (HIS_Energy_HSD / HSH karşılığı, kW)
   Stil: css/reports-r3.css (grafik penceresi .scss karşılıkları)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportEnergy.* / graphPopup.* / reportPduInventory.room*
  const T = {
    title: 'PDU GÜÇ RAPORLAMA',
    menuReports: 'Raporlar',
    filtersCardTitle: 'PDU Güç Raporlama Filtreleri',
    reportSelection: 'Rapor Seçimi:',
    floorSelection: 'Kat Seçimi:',
    salonSelection: 'Salon Seçimi:',
    podSelection: 'POD / Sıra Seçimi:',
    customerSelection: 'Müşteri Seçimi:',
    companyCustomer: 'Şirket/Müşteri:',
    cabinetSelection: 'Kabin Seçimi:',
    pduSelection: 'PDU Seçimi:',
    reportPeriod: 'Rapor Periyodu:',
    valueType: 'Değer Türü(kW):',
    summaryFunction: 'Özet Fonksiyon:',
    date: 'Tarih:',
    startTime: 'Başlangıç Saati:',
    endTime: 'Bitiş Saati:',
    readyRanges: 'Hazır Aralıklar:',
    startDate: 'Başlangıç Tarihi:',
    endDate: 'Bitiş Tarihi:',
    allFloors: 'Tüm Katlar',
    allSalons: 'Tüm Salonlar',
    salonNotFound: 'Salon bulunamadı',
    allPods: 'Tüm POD/Sıra',
    podNotFound: 'Pod/Sıra bulunamadı',
    allCustomers: 'Tüm Müşteriler',
    noResults: 'Sonuç bulunamadı',
    allCabinets: 'Tüm Kabinler',
    cabinetFilterPlaceholder: 'Kabin seçin veya yazın...',
    customerCabinetPlaceholder: 'Kabin seçin...',
    pduFilterPlaceholder: 'Kabin / PDU seçin...',
    hourly: 'Saatlik',
    dateRange: 'Tarih Aralığı',
    valueTypePlaceholder: 'Seçiniz...',
    datePresetPlaceholder: 'Aralık seçin...',
    clear: 'Temizle',
    generateReport: 'Rapor Oluştur',
    generatingReport: 'Rapor Oluşturuluyor...',
    graphReport: 'Grafik Rapor',
    allPdus: 'Hepsi',
    internalCustomers: 'İç Müşteriler',
    externalCustomers: 'Dış Müşteriler',
    internalCustomerSelected: 'İç Müşteri Seçildi',
    externalCustomerSelected: 'Dış Müşteri Seçildi',
    selectCustomer: 'Müşteri Seçiniz',
    salonPlaceholder: 'Salon seçin...',
    podPlaceholder: 'Pod/Sıra seçin...',
    customerPlaceholder: 'Müşteri seçin...',
    select: 'Seçiniz',
    valueTypesAll: 'Tümü',
    selectedTypes: '{count} tür seçildi',
    selectedCustomers: '{count} Müşteri Seçildi',
    selectedCabinets: '{count} Kabin Seçildi',
    selectedSalons: '{count} Salon Seçildi',
    selectedPods: '{count} POD/Sıra Seçildi',
    selectedFloors: '{count} Kat Seçildi',
    popupTitle: 'Tarihsel Analiz Sonuçları',
    downloadPdf: 'PDF İndir',
    downloadExcel: 'Excel İndir',
    downloadZip: 'ZIP İndir',
    processingData: 'Veriler İşleniyor Lütfen Bekleyiniz...',
    progress: '%{progress} Tamamlandı',
    progressStart: '%0 Başlıyor...',
    noData: 'Gösterilecek analiz verisi bulunamadı.',
    tableDate: 'Tarih',
    tableCustomer: 'Müşteri',
    tableCabinetName: 'Kabin Adı',
    tablePdu: 'PDU',
    tableValue: 'Değer',
    cabinet: 'Kabin',
    pleaseWait: 'Lütfen bekleyiniz.',
    room: 'Salon',
    roomUnspecified: 'Salon Belirtilmedi',
    alertSelectCabinetOrCustomerReport: 'Lütfen önce IO tanımlı bir müşteri veya kabin seçin.',
    alertSelectDateHourly: 'Lütfen Saatlik Rapor için bir tarih seçin.',
    alertSelectDateRange: 'Lütfen Tarih Aralığı için geçerli bir Başlangıç ve Bitiş Tarihi seçin.',
    alertNoIoFound: 'Seçili kriterlere ait veri noktası (IO) bulunamadı.',
    alertSelectCustomerOrCabinet: 'Lütfen en az bir müşteri veya kabin seçiniz.',
    alertSelectValidDateRange: 'Lütfen geçerli bir tarih/tarih aralığı seçin.',
    alertNoGraphDataReceived: 'Sorgu tamamlandı ancak grafik verisi alınamadı.',
    // graphPopup.*
    gDisplayOptions: 'GÖSTERİM SEÇENEKLERİ',
    gDownloadPdf: 'PDF İNDİR',
    gDownloadExcel: 'EXCEL İNDİR',
    gPowerConsumption: 'Güç Tüketimi',
    gPowerAxisLabel: 'Güç (kW)',
    gTimePeriodAxisLabel: 'Zaman Periyodu',
    gExcelSheetName: 'Grafik Raporu'
  };
  const tr = (s, p) => { let v = s; Object.keys(p || {}).forEach(k => { v = v.replace('{' + k + '}', p[k]); }); return v; };

  const REPORT_TYPES = [
    { value: true, label: 'Müşteri Bazlı Rapor' },
    { value: false, label: 'Kabin Bazlı Rapor' }
  ];
  const VALUE_TYPES = [
    { value: 'Average', label: 'Ortalama' },
    { value: 'Minimum', label: 'Minimum' },
    { value: 'Maximum', label: 'Maksimum' }
  ];
  const SUMMARY_TYPES = [
    { value: 'Maksimum', label: 'Maksimum' },
    { value: 'Minimum', label: 'Minimum' },
    { value: 'Ortalama', label: 'Ortalama' },
    { value: 'Toplam', label: 'Toplam' }
  ];
  const PDU_SCOPES = [
    { value: 'total', label: 'Kabin (Toplam)' },
    { value: 'A', label: 'PDU A' },
    { value: 'B', label: 'PDU B' }
  ];
  const FLOOR_OPTIONS = [
    { id: 'T01', label: '1. Kat' },
    { id: 'T02', label: '2. Kat' },
    { id: 'T03', label: '3. Kat' },
    { id: 'T04', label: 'IDC4' }
  ];
  const DATE_PRESETS = [
    { value: 'custom', label: 'Özel Aralık Seç' },
    { value: 'past_24_hours', label: 'Son 24 Saat' },
    { value: 'yesterday', label: 'Dün' },
    { value: 'past_week', label: 'Geçen Hafta (Son 7 Gün)' },
    { value: 'month_to_date', label: 'Bu Ay' },
    { value: 'past_month', label: 'Son Bir Ay (Son 30 Gün)' },
    { value: 'last_month', label: 'Geçen Ay (Takvim Ayı)' },
    { value: 'year_to_date', label: 'Bu Yıl' },
    { value: 'past_year', label: 'Son Bir Yıl (Son 365 Gün)' },
    { value: 'last_year', label: 'Geçen Yıl (Takvim Yılı)' }
  ];
  const INTERNAL = 'İç Müşteriler';
  const EXTERNAL = 'Dış Müşteriler';
  const MAX_TABLE_ROWS = 2000;

  // Şablondaki sınıf dizeleri (birebir)
  const DD_PANEL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5';
  const DD_PANEL_SCROLL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const DD_ITEM = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const DD_OPTION = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const CHECK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const EMPTY_ITEM = 'px-2.5 py-2 text-xs text-slate-400 italic';
  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const TH = 'px-3.5 py-2.5 border-r border-slate-200 dark:border-border-subtle last:border-r-0';
  const TD = 'px-3.5 py-2 border-r border-slate-200 dark:border-border-subtle last:border-r-0 font-mono text-[11px]';

  // ---------------------------------------------------------------------------
  // Yardımcılar (bileşendeki parse/format fonksiyonlarının karşılıkları)
  // ---------------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  const extractNumber = s => { const m = String(s || '').match(/\d+/); return m ? m[0] : null; };
  const normalizeKey = v => String(v || '').trim().normalize('NFD').replace(/[.\s]/g, '').replace(/[`´^~]/g, '').replace(/[\u0000-\u001F]/g, '').toUpperCase();
  function parseCabinetName(dev) {
    if (!dev) return null;
    const parts = dev.split('_');
    const first = parts[0] || '', second = parts[1] || '';
    if (/^K\w+/i.test(first)) return first;
    if (second.toUpperCase() === 'PDU') return first || null;
    if (parts.length > 1 && second) return second;
    return first || null;
  }
  const displayCabinetName = c => (!c ? null : /^K(?=[A-Za-z0-9])/i.test(c) ? c.replace(/^K/i, '') : c);
  const normalizeCabinetCode = id => { const p = parseCabinetName(id || ''); return p ? displayCabinetName(p) || p : null; };
  function parseDevLoc(devLoc, floorId) {
    const segs = String(devLoc || '').split('/').map(s => s.trim()).filter(s => s && s !== '_');
    if (floorId === 'T04') return { salonSeg: '', podSeg: segs.find(s => normalizeKey(s).startsWith('POD')) || segs[1] || '' };
    return { salonSeg: segs[1] || '', podSeg: segs[2] || '' };
  }
  function mapCabinetInfo(item, floorId) {
    const cabinet = normalizeCabinetCode(item && item.id);
    if (!cabinet) return null;
    const { salonSeg, podSeg } = parseDevLoc(item.dev_loc, floorId);
    const salonKey = salonSeg ? floorId + '|' + normalizeKey(salonSeg || 'SALON') : floorId + '|GENEL';
    const podKey = podSeg ? floorId + '|' + salonKey + '|' + normalizeKey(podSeg || 'POD') : undefined;
    return { cabinet, floorId, salonKey, podKey, devId: item.id, salonSeg, podSeg };
  }
  const localizedFloor = id => (FLOOR_OPTIONS.find(f => f.id === id) || { label: id }).label;
  function localizedSalonName(seg) {
    const v = String(seg || '').trim();
    if (!v) return T.roomUnspecified;
    if (v === 'GENEL') return '';
    const n = extractNumber(v);
    return n ? n + '. ' + T.room : v;
  }
  function salonOptionLabel(o) {
    const floor = localizedFloor(o.floorId);
    if (!o.rawSalonSeg || o.rawSalonSeg === 'GENEL') return floor;
    return (floor + ' ' + localizedSalonName(o.rawSalonSeg)).trim();
  }
  function podOptionLabel(o) {
    const floor = localizedFloor(o.floorId);
    const salon = o.rawSalonSeg ? localizedSalonName(o.rawSalonSeg) : '';
    const num = extractNumber(o.rawPodSeg);
    // Sunum: NS1/NS2 ağ sıraları "POD n" etiketine dönüştürülmez (POD-1/POD-2 ile karışmasın)
    const pod = num && /^POD/i.test(o.rawPodSeg) ? 'POD ' + num : (o.rawPodSeg || 'POD');
    return salon ? (floor + ' ' + salon + ' - ' + pod).trim() : (floor + ' ' + pod).trim();
  }
  const valueTypeLabel = v => (VALUE_TYPES.find(o => o.value === v) || { label: v }).label;
  const pduTranslatedLabel = n => !n ? '-' : n === 'Toplam' ? T.cabinet : n;
  function convertTurkishChars(text) {
    const map = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
    return String(text || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, m => map[m] || m);
  }
  const formatDateForInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const fmtDay = d => pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
  const fmtDayTime = d => fmtDay(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const fmtAxisDay = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  const fmtAxisHour = d => fmtAxisDay(d) + ' ' + pad(d.getHours()) + ':00';
  const cmpCab = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

  // ---------------------------------------------------------------------------
  // Rapor modülü
  // ---------------------------------------------------------------------------
  function mount(el) {
    const { esc, button, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const src = DCIM.data.reports.pduEnergy;
    const timers = [];
    let progressTimer = null;
    let chart = null;
    let drag = null;

    const state = {
      isCustomer: true,
      customerSelect: INTERNAL,
      customerType: '1',
      customerData: [],
      customerList: [],
      filteredCustomerList: [],
      selectedCompanies: [],
      cabinetList: [],
      filteredCabinetList: [],
      cabinetOwnerMap: {},
      selectedFloorIds: ['T01'],
      floorCache: {},
      salonOptions: [],
      selectedSalonKeys: [],
      podOptions: [],
      selectedPodKeys: [],
      allCabinetsList: [],
      filteredCabinetsList: [],
      cabinetFilterText: '',
      selectedCabinets: [],
      selectedPduScopes: ['total'],
      reportMode: 'daily',
      selectedValueTypes: ['Average'],
      selectedSummaryType: 'Maksimum',
      filterDate: DCIM.ui.fmtDateKey(new Date()),
      startTime: '00:00:00',
      endTime: '23:59:59',
      preset: 'past_week',
      startDate: '',
      endDate: '',
      dd: { reportType: false, floor: false, salon: false, pod: false, cabinet: false, pduScope: false, customerSelect: false, customer: false, customerCabinet: false, valueType: false, summaryType: false, datePreset: false },
      showCmr: false,
      isPopupLoading: false,
      progressPercent: 0,
      progressMessage: '',
      rows: [],
      graphLoading: false,
      graph: null
    };

    const sourceCabinets = () => state.isCustomer ? state.cabinetList : state.allCabinetsList;
    const isAllSelected = () => { const s = sourceCabinets(); return s.length > 0 && state.selectedCabinets.length === s.length; };
    const areAllSalonsSelected = () => state.salonOptions.length > 0 && state.selectedSalonKeys.length === state.salonOptions.length;
    const areAllPodsSelected = () => state.podOptions.length > 0 && state.selectedPodKeys.length === state.podOptions.length;
    const calcTypes = () => state.selectedValueTypes.length ? state.selectedValueTypes.slice() : ['Average'];

    // --- Müşteri akışı -------------------------------------------------------------
    function loadCustomers(type) {
      state.customerType = type;
      state.customerData = src.customers(type);
      state.customerList = state.customerData.map(c => c.name);
      state.filteredCustomerList = state.customerList.slice();
      loadCabinetsForSelectedCustomers();
    }
    function loadCabinetsForSelectedCustomers() {
      Object.assign(state, { cabinetList: [], filteredCabinetList: [], cabinetOwnerMap: {}, selectedCabinets: [] });
      if (!state.selectedCompanies.length) return;
      const names = new Set();
      state.selectedCompanies.forEach(company => {
        const c = state.customerData.find(x => x.name === company);
        (c ? c.cabinets : []).forEach(cab => { names.add(cab); if (!state.cabinetOwnerMap[cab]) state.cabinetOwnerMap[cab] = company; });
      });
      state.cabinetList = Array.from(names).sort();
      state.filteredCabinetList = state.cabinetList.slice();
      if (state.cabinetList.length) state.selectedCabinets = state.cabinetList.slice();
    }
    function toggleCustomerSelect(option, checked) {
      if (checked) {
        state.customerSelect = option;
        state.selectedCompanies = [];
        state.isCustomer = true;
        loadCustomers(option === INTERNAL ? '1' : '0');
      } else {
        Object.assign(state, { customerSelect: '', customerType: '', selectedCompanies: [], customerList: [], filteredCustomerList: [], customerData: [] });
        loadCabinetsForSelectedCustomers();
      }
    }

    // --- Kabin bazlı akış ------------------------------------------------------------
    function loadAllPduDetails() {
      if (!state.selectedFloorIds.length) {
        Object.assign(state, { allCabinetsList: [], filteredCabinetsList: [], salonOptions: [], podOptions: [], selectedSalonKeys: [], selectedPodKeys: [], selectedCabinets: [] });
        return;
      }
      state.floorCache = {};
      state.selectedFloorIds.forEach(fid => { state.floorCache[fid] = src.cmr(fid).map(it => mapCabinetInfo(it, fid)).filter(Boolean); });
      rebuildSalonOptions();
      if (!state.selectedSalonKeys.length && state.salonOptions.length === 1) state.selectedSalonKeys = [state.salonOptions[0].key];
      rebuildPodOptions();
      if (!state.selectedPodKeys.length && state.podOptions.length === 1) state.selectedPodKeys = [state.podOptions[0].key];
      rebuildCabinetLists();
    }
    function rebuildSalonOptions() {
      const map = new Map();
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (info.salonKey && !map.has(info.salonKey)) map.set(info.salonKey, { key: info.salonKey, floorId: fid, rawSalonSeg: info.salonSeg });
      }));
      state.salonOptions = Array.from(map.values()).sort((a, b) => {
        if (a.floorId !== b.floorId) return a.floorId.localeCompare(b.floorId);
        const na = parseInt(extractNumber(a.rawSalonSeg) || '0', 10), nb = parseInt(extractNumber(b.rawSalonSeg) || '0', 10);
        return na !== nb ? na - nb : a.rawSalonSeg.localeCompare(b.rawSalonSeg);
      });
      const keys = new Set(state.salonOptions.map(s => s.key));
      state.selectedSalonKeys = state.selectedSalonKeys.filter(k => keys.has(k));
    }
    function rebuildPodOptions() {
      // POD seçenekleri ancak salon seçimi varsa oluşur
      if (!state.selectedSalonKeys.length) { state.podOptions = []; state.selectedPodKeys = []; return; }
      const wasAll = areAllPodsSelected();
      const wasEmpty = state.selectedPodKeys.length === 0;
      const allowed = new Set(state.selectedSalonKeys);
      const map = new Map();
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (!info.podKey || !info.podSeg || !allowed.has(info.salonKey)) return;
        if (!map.has(info.podKey)) map.set(info.podKey, { key: info.podKey, floorId: fid, salonKey: info.salonKey, rawSalonSeg: info.salonSeg, rawPodSeg: info.podSeg });
      }));
      state.podOptions = Array.from(map.values()).sort((a, b) => {
        if (a.floorId !== b.floorId) return a.floorId.localeCompare(b.floorId);
        if (a.salonKey !== b.salonKey) return a.salonKey.localeCompare(b.salonKey);
        const na = parseInt(extractNumber(a.rawPodSeg) || '0', 10), nb = parseInt(extractNumber(b.rawPodSeg) || '0', 10);
        return na !== nb ? na - nb : a.rawPodSeg.localeCompare(b.rawPodSeg);
      });
      const keys = new Set(state.podOptions.map(p => p.key));
      state.selectedPodKeys = wasAll || wasEmpty ? Array.from(keys) : state.selectedPodKeys.filter(k => keys.has(k));
    }
    function rebuildCabinetLists() {
      const keepAll = state.allCabinetsList.length > 0 && state.selectedCabinets.length === state.allCabinetsList.length;
      const salons = state.selectedSalonKeys.length ? new Set(state.selectedSalonKeys) : null;
      const pods = state.selectedPodKeys.length ? new Set(state.selectedPodKeys) : null;
      if (!pods) { Object.assign(state, { allCabinetsList: [], filteredCabinetsList: [], selectedCabinets: [] }); return; }
      const union = new Set();
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (!info.cabinet) return;
        if (salons && !salons.has(info.salonKey)) return;
        if (!info.podKey || !pods.has(info.podKey)) return;
        union.add(info.cabinet);
      }));
      state.allCabinetsList = Array.from(union).sort();
      state.filteredCabinetsList = state.allCabinetsList.slice();
      state.selectedCabinets = keepAll && state.allCabinetsList.length ? state.allCabinetsList.slice() : state.selectedCabinets.filter(c => union.has(c));
    }

    // --- Tarih aralığı -----------------------------------------------------------------
    function onDateRangePresetChange() {
      const now = new Date();
      let start = new Date(), end = new Date();
      const dayRange = (s, e) => { s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999); state.startDate = formatDateForInput(s); state.endDate = formatDateForInput(e); };
      const back = days => { start = new Date(); start.setDate(now.getDate() - days); end = new Date(); end.setDate(now.getDate() - 1); dayRange(start, end); };
      switch (state.preset) {
        case 'past_24_hours':
          start.setTime(now.getTime() - 24 * 3600000);
          state.startDate = formatDateForInput(start);
          state.endDate = formatDateForInput(now);
          break;
        case 'yesterday': start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); dayRange(start, end); break;
        case 'past_week': back(7); break;
        case 'month_to_date': start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(); end.setDate(now.getDate() - 1); dayRange(start, end); break;
        case 'past_month': back(30); break;
        case 'last_month': dayRange(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)); break;
        case 'year_to_date': start = new Date(now.getFullYear(), 0, 1); end = new Date(); end.setDate(now.getDate() - 1); dayRange(start, end); break;
        case 'past_year': back(365); break;
        case 'last_year': dayRange(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31)); break;
        default: break;
      }
    }

    // Seçili döneme göre periyotlar: [{ ts, g: 'day'|'hour' }] — hata varsa { error }
    function buckets() {
      let start, end, g;
      if (state.reportMode === 'hourly') {
        if (!state.filterDate) return { error: T.alertSelectDateHourly };
        start = new Date(state.filterDate + 'T' + (state.startTime || '00:00:00'));
        end = new Date(state.filterDate + 'T' + (state.endTime || '23:59:59'));
        g = 'hour';
      } else {
        if (!state.startDate || !state.endDate) return { error: T.alertSelectDateRange };
        start = new Date(state.startDate);
        end = new Date(state.endDate);
        g = state.preset === 'past_24_hours' ? 'hour' : 'day';
      }
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return { error: T.alertSelectValidDateRange };
      const list = [];
      const cur = new Date(start);
      if (g === 'hour') cur.setMinutes(0, 0, 0); else cur.setHours(0, 0, 0, 0);
      while (cur <= end && list.length < 800) {
        list.push(cur.getTime());
        if (g === 'hour') cur.setHours(cur.getHours() + 1); else cur.setDate(cur.getDate() + 1);
      }
      return { list, g };
    }

    // --- Rapor satırları (displayData getter karşılığı) ---------------------------------
    // Her kabin × periyot için PDU A / PDU B ve Toplam (A+B) satırları; kW
    function buildRows(bk) {
      const types = calcTypes();
      const cabs = state.selectedCabinets.slice().sort(cmpCab);
      const showTime = bk.g === 'hour';
      const rows = [];
      cabs.forEach(cab => {
        bk.list.forEach(ts => {
          const a = src.point(cab, 'A', ts, bk.g);
          const b = src.point(cab, 'B', ts, bk.g);
          if (!a && !b) return; // haberleşme kaybı: veri yok
          const d = new Date(ts);
          const date = showTime ? fmtDayTime(d) : fmtDay(d);
          const pick = p => { const o = {}; types.forEach(t => { o[t] = p ? p[t] : null; }); return o; };
          const total = {};
          types.forEach(t => { total[t] = (a ? a[t] : 0) + (b ? b[t] : 0); });
          const customerAdi = state.isCustomer ? (state.cabinetOwnerMap[cab] || state.selectedCompanies[0] || null) : null;
          const base = { date, kabinAdi: cab, _timestamp: ts, customerAdi };
          if (state.isCustomer || state.selectedPduScopes.includes('total')) rows.push(Object.assign({ pduAdi: 'Toplam', values: total }, base));
          if (!state.isCustomer) {
            if (a && state.selectedPduScopes.includes('A')) rows.push(Object.assign({ pduAdi: 'PDU A', values: pick(a) }, base));
            if (b && state.selectedPduScopes.includes('B')) rows.push(Object.assign({ pduAdi: 'PDU B', values: pick(b) }, base));
          }
        });
      });
      return rows;
    }

    function summaryResults() {
      const data = state.rows;
      if (!data.length) return [];
      return calcTypes().map(type => {
        const totals = data.filter(r => r.pduAdi === 'Toplam');
        const vals = (totals.length ? totals : data).map(r => r.values[type]).filter(v => v != null && !isNaN(v));
        if (!vals.length) return { type, label: valueTypeLabel(type), value: '0.00' };
        let res = 0;
        switch (state.selectedSummaryType) {
          case 'Maksimum': res = Math.max.apply(null, vals); break;
          case 'Minimum': res = Math.min.apply(null, vals); break;
          case 'Toplam': res = vals.reduce((s, v) => s + v, 0); break;
          case 'Ortalama': res = vals.reduce((s, v) => s + v, 0) / vals.length; break;
          default: res = 0;
        }
        return { type, label: valueTypeLabel(type), value: res.toFixed(2) };
      });
    }

    // --- Etiketler ------------------------------------------------------------------------
    const reportTypeLabel = () => (REPORT_TYPES.find(o => o.value === state.isCustomer) || { label: T.select }).label;
    function valueTypesLabel() {
      const v = state.selectedValueTypes;
      if (!v.length) return T.select;
      if (v.length === VALUE_TYPES.length) return T.valueTypesAll;
      if (v.length === 1) return valueTypeLabel(v[0]);
      return tr(T.selectedTypes, { count: v.length });
    }
    const summaryTypeLabel = () => (SUMMARY_TYPES.find(o => o.value === state.selectedSummaryType) || { label: T.select }).label;
    const datePresetLabel = () => (DATE_PRESETS.find(p => p.value === state.preset) || DATE_PRESETS[0]).label;
    function pduScopesLabel() {
      const s = state.selectedPduScopes;
      if (!s.length) return PDU_SCOPES[0].label;
      if (s.length === PDU_SCOPES.length) return PDU_SCOPES.map(o => o.label).join(' + ');
      return PDU_SCOPES.filter(o => s.includes(o.value)).map(o => o.label).join(', ');
    }
    function customersLabel() {
      const s = state.selectedCompanies;
      if (!s.length) return T.selectCustomer;
      if (s.length === state.customerList.length && state.customerList.length) return T.allCustomers;
      if (s.length === 1) return s[0];
      return tr(T.selectedCustomers, { count: s.length });
    }
    function floorLabel() {
      const ids = state.selectedFloorIds;
      if (!ids.length) return T.select;
      if (ids.length === FLOOR_OPTIONS.length) return T.allFloors;
      if (ids.length === 1) return localizedFloor(ids[0]);
      return tr(T.selectedFloors, { count: ids.length });
    }
    function salonLabel() {
      if (!state.selectedSalonKeys.length) return T.select;
      if (areAllSalonsSelected()) return T.allSalons;
      if (state.selectedSalonKeys.length === 1) { const m = state.salonOptions.find(s => s.key === state.selectedSalonKeys[0]); return m ? salonOptionLabel(m) : T.select; }
      return tr(T.selectedSalons, { count: state.selectedSalonKeys.length });
    }
    function podLabel() {
      if (!state.selectedPodKeys.length) return T.select;
      if (areAllPodsSelected()) return T.allPods;
      if (state.selectedPodKeys.length === 1) { const m = state.podOptions.find(p => p.key === state.selectedPodKeys[0]); return m ? podOptionLabel(m) : T.select; }
      return tr(T.selectedPods, { count: state.selectedPodKeys.length });
    }
    function cabinetsLabel() {
      if (!state.selectedCabinets.length) return state.cabinetFilterText;
      if (isAllSelected()) return T.allCabinets;
      if (state.selectedCabinets.length === 1) return state.selectedCabinets[0];
      return tr(T.selectedCabinets, { count: state.selectedCabinets.length });
    }

    // --- HTML parçaları -------------------------------------------------------------------
    const checkRow = (kind, val, checked, label, disabled) =>
      '<label class="' + DD_ITEM + '"><input type="checkbox" data-check="' + kind + '" data-val="' + esc(val) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
      ' class="' + CHECK + '" /><span>' + esc(label) + '</span></label>';
    const optionRow = (kind, val, label) => '<div class="' + DD_OPTION + '" data-pick="' + kind + '" data-val="' + esc(val) + '">' + esc(label) + '</div>';
    const emptyRow = text => '<div class="' + EMPTY_ITEM + '">' + esc(text) + '</div>';

    function panelHtml(name) {
      switch (name) {
        case 'reportType': return REPORT_TYPES.map(o => optionRow('reportType', String(o.value), o.label)).join('');
        case 'floor':
          return checkRow('floor', '*', state.selectedFloorIds.length === FLOOR_OPTIONS.length, T.allFloors) +
            FLOOR_OPTIONS.map(f => checkRow('floor', f.id, state.selectedFloorIds.includes(f.id), f.label)).join('');
        case 'salon':
          return checkRow('salon', '*', areAllSalonsSelected(), T.allSalons, !state.salonOptions.length) +
            state.salonOptions.map(s => checkRow('salon', s.key, state.selectedSalonKeys.includes(s.key), salonOptionLabel(s))).join('') +
            (!state.salonOptions.length ? emptyRow(T.salonNotFound) : '');
        case 'pod':
          return checkRow('pod', '*', areAllPodsSelected(), T.allPods, !state.podOptions.length) +
            state.podOptions.map(p => checkRow('pod', p.key, state.selectedPodKeys.includes(p.key), podOptionLabel(p))).join('') +
            (!state.podOptions.length ? emptyRow(T.podNotFound) : '');
        case 'cabinet':
          return checkRow('cabinet', '*', isAllSelected(), T.allCabinets) +
            state.filteredCabinetsList.map(c => checkRow('cabinet', c, state.selectedCabinets.includes(c), c)).join('') +
            (state.allCabinetsList.length > 0 && !state.filteredCabinetsList.length ? emptyRow(T.noResults) : '');
        case 'pduScope':
          return checkRow('pduScope', 'all', state.selectedPduScopes.length === PDU_SCOPES.length, T.allPdus) +
            PDU_SCOPES.map(o => checkRow('pduScope', o.value, state.selectedPduScopes.includes(o.value), o.label)).join('');
        case 'customerSelect':
          return checkRow('customerSelect', INTERNAL, state.customerSelect === INTERNAL, T.internalCustomers) +
            checkRow('customerSelect', EXTERNAL, state.customerSelect === EXTERNAL, T.externalCustomers);
        case 'customer':
          return (state.customerList.length ? checkRow('customer', '*', state.selectedCompanies.length === state.customerList.length, T.allCustomers) : '') +
            state.filteredCustomerList.map(c => checkRow('customer', c, state.selectedCompanies.includes(c), c)).join('') +
            (!state.filteredCustomerList.length ? emptyRow(T.noResults) : '');
        case 'customerCabinet':
          return checkRow('cabinet', '*', isAllSelected(), T.allCabinets) +
            state.filteredCabinetList.map(c => checkRow('cabinet', c, state.selectedCabinets.includes(c), c)).join('') +
            (state.cabinetList.length > 0 && !state.filteredCabinetList.length ? emptyRow(T.noResults) : '');
        case 'valueType': return VALUE_TYPES.map(o => checkRow('valueType', o.value, state.selectedValueTypes.includes(o.value), o.label)).join('');
        case 'summaryType': return SUMMARY_TYPES.map(o => optionRow('summaryType', o.value, o.label)).join('');
        case 'datePreset': return DATE_PRESETS.map(p => optionRow('datePreset', p.value, p.label)).join('');
        default: return '';
      }
    }
    const SCROLL_PANELS = { floor: 1, salon: 1, pod: 1, cabinet: 1, customer: 1, customerCabinet: 1, datePreset: 1 };

    // app-form-field > div.relative (#xDropdown) > input + ikon + açılır liste
    function dropdownField(name, label, inputHtml) {
      return kit.formField({
        label,
        control: '<div class="relative" data-dd-root="' + name + '">' + inputHtml + CHEVRON +
          (state.dd[name] ? '<div class="' + (SCROLL_PANELS[name] ? DD_PANEL_SCROLL : DD_PANEL) + '" data-dd-panel="' + name + '">' + panelHtml(name) + '</div>' : '') +
        '</div>'
      });
    }
    const roInput = (name, value, placeholder, extraCls, disabled) =>
      '<input type="text" value="' + esc(value) + '" data-dd-toggle="' + name + '" class="scada-input ' + (extraCls || 'cursor-pointer pr-8') + '" readonly placeholder="' + esc(placeholder) + '"' + (disabled ? ' disabled' : '') + ' />';
    const DIS_CLS = 'cursor-pointer pr-8 disabled:opacity-50 disabled:cursor-not-allowed';

    function filtersHtml() {
      let html = dropdownField('reportType', T.reportSelection, roInput('reportType', reportTypeLabel(), T.valueTypePlaceholder));
      if (!state.isCustomer) {
        html += dropdownField('floor', T.floorSelection, roInput('floor', floorLabel(), T.valueTypePlaceholder)) +
          dropdownField('salon', T.salonSelection, roInput('salon', salonLabel(), T.salonPlaceholder, DIS_CLS)) +
          dropdownField('pod', T.podSelection, roInput('pod', podLabel(), T.podPlaceholder, DIS_CLS, !state.selectedSalonKeys.length || !state.podOptions.length)) +
          dropdownField('cabinet', T.cabinetSelection,
            '<input type="text" value="' + esc(cabinetsLabel()) + '" data-dd-toggle="cabinet" data-filter-input="cabinet" placeholder="' + esc(T.cabinetFilterPlaceholder) + '"' +
            ' class="scada-input pr-8 disabled:opacity-50 disabled:cursor-not-allowed" autocomplete="off"' + (!state.selectedPodKeys.length ? ' disabled' : '') + ' />') +
          dropdownField('pduScope', T.pduSelection, roInput('pduScope', pduScopesLabel(), T.pduFilterPlaceholder));
      } else {
        const csLabel = state.customerSelect === INTERNAL ? T.internalCustomerSelected : state.customerSelect === EXTERNAL ? T.externalCustomerSelected : T.selectCustomer;
        html += dropdownField('customerSelect', T.customerSelection, roInput('customerSelect', csLabel, T.customerPlaceholder)) +
          dropdownField('customer', T.companyCustomer,
            '<input type="text" value="' + esc(customersLabel()) + '" data-dd-toggle="customer" class="scada-input pr-8 disabled:opacity-50 disabled:cursor-not-allowed" readonly' +
            (!state.customerSelect ? ' disabled' : '') + ' placeholder="' + esc(T.customerPlaceholder) + '" />') +
          dropdownField('customerCabinet', T.cabinetSelection,
            '<input type="text" value="' + esc(cabinetsLabel()) + '" data-dd-toggle="customerCabinet" placeholder="' + esc(T.customerCabinetPlaceholder) + '"' +
            ' class="scada-input pr-8 disabled:opacity-50 disabled:cursor-not-allowed"' + (!state.selectedCompanies.length ? ' disabled' : '') + ' autocomplete="off" />');
      }
      html += kit.formField({
        label: T.reportPeriod,
        control: '<div class="flex items-center gap-4 py-1.5">' +
          '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-800 dark:text-slate-200">' +
            '<input type="radio" name="r3-energy-mode" value="daily" data-mode' + (state.reportMode === 'daily' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.dateRange) + '</span></label>' +
          '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-800 dark:text-slate-200">' +
            '<input type="radio" name="r3-energy-mode" value="hourly" data-mode' + (state.reportMode === 'hourly' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.hourly) + '</span></label>' +
        '</div>'
      });
      html += dropdownField('valueType', T.valueType, roInput('valueType', valueTypesLabel(), T.valueTypePlaceholder)) +
        dropdownField('summaryType', T.summaryFunction, roInput('summaryType', summaryTypeLabel(), T.valueTypePlaceholder));
      if (state.reportMode === 'hourly') {
        html += kit.formField({ label: T.date, control: '<input type="date" data-field="filterDate" value="' + esc(state.filterDate) + '" class="scada-input" />' }) +
          kit.formField({ label: T.startTime, control: '<input type="time" step="1" data-field="startTime" value="' + esc(state.startTime) + '" class="scada-input" />' }) +
          kit.formField({ label: T.endTime, control: '<input type="time" step="1" data-field="endTime" value="' + esc(state.endTime) + '" class="scada-input" />' });
      } else {
        html += dropdownField('datePreset', T.readyRanges, roInput('datePreset', datePresetLabel(), T.datePresetPlaceholder)) +
          kit.formField({ label: T.startDate, control: '<input type="datetime-local" data-field="startDate" value="' + esc(state.startDate) + '" class="scada-input" />' }) +
          kit.formField({ label: T.endDate, control: '<input type="datetime-local" data-field="endDate" value="' + esc(state.endDate) + '" class="scada-input" />' });
      }
      return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">' + html + '</div>';
    }

    function headerHtml() {
      const noCab = state.selectedCabinets.length === 0;
      const graphDis = state.isCustomer ? (state.selectedCompanies.length === 0 || noCab) : noCab;
      return kit.pageHeader({
        title: T.title,
        breadcrumbs: [{ label: T.menuReports }, { label: T.title }],
        actions:
          button({ variant: 'primary', icon: 'pi pi-file-excel', label: T.generateReport, attrs: 'data-act="generate"' + (noCab ? ' disabled' : '') }) +
          button({ variant: 'secondary', icon: 'pi pi-chart-line', label: T.graphReport, attrs: 'data-act="graph"' + (graphDis ? ' disabled' : '') })
      });
    }

    function cmrPopupHtml() {
      if (!state.showCmr) return '';
      const types = calcTypes();
      let body = '';
      if (state.isPopupLoading) {
        body += '<div class="py-12 flex flex-col items-center justify-center gap-3">' +
          '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl"></i>' +
          '<p class="text-slate-300 text-sm font-medium">' + esc(T.processingData) + '</p>' +
          (state.progressMessage ? '<div class="w-64 h-2 bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-sky-500 transition-all duration-300" style="width:' + state.progressPercent + '%"></div></div>' +
            '<p class="text-xs text-slate-400 font-mono">' + esc(state.progressMessage) + '</p>' : '') +
        '</div>';
      } else if (state.rows.length) {
        const shown = state.rows.slice(0, MAX_TABLE_ROWS);
        body += '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
          '<table class="w-full text-left text-xs border-collapse"><thead>' +
            '<tr class="bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider">' +
              '<th class="' + TH + '">' + esc(T.tableDate) + '</th>' +
              (state.isCustomer ? '<th class="' + TH + '">' + esc(T.tableCustomer) + '</th>' : '') +
              '<th class="' + TH + '">' + esc(T.tableCabinetName) + '</th>' +
              (!state.isCustomer ? '<th class="' + TH + '">' + esc(T.tablePdu) + '</th>' : '') +
              types.map(vt => '<th class="' + TH + '">' + esc(T.tableValue + ' (' + valueTypeLabel(vt) + ') kW') + '</th>').join('') +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' +
              shown.map(r => '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
                '<td class="' + TD + '">' + esc(r.date) + '</td>' +
                (state.isCustomer ? '<td class="' + TD + '">' + esc(r.customerAdi || '—') + '</td>' : '') +
                '<td class="' + TD + '">' + esc(r.kabinAdi) + '</td>' +
                (!state.isCustomer ? '<td class="' + TD + '">' + esc(pduTranslatedLabel(r.pduAdi)) + '</td>' : '') +
                types.map(vt => '<td class="' + TD + '">' + (r.values[vt] != null && r.values[vt] !== 0 ? r.values[vt].toFixed(2) : '0.00') + ' kW</td>').join('') +
              '</tr>').join('') +
            '</tbody></table></div>' +
          (state.rows.length > shown.length
            ? '<p class="text-[11px] text-slate-400 font-mono">İlk ' + shown.length + ' satır gösteriliyor (toplam ' + state.rows.length + '). Tüm satırlar Excel çıktısında yer alır.</p>'
            : '');
      } else {
        body += kit.emptyState({ icon: 'pi pi-inbox', message: T.noData });
      }
      if (!state.isPopupLoading && state.rows.length) {
        const sl = summaryTypeLabel().toUpperCase();
        body += '<div class="mt-4 p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] flex flex-wrap items-center gap-4 text-xs">' +
          summaryResults().map(s => '<div class="flex items-center gap-1.5">' +
            '<span class="text-slate-400 font-medium">' + esc(s.label + ' (' + sl + '):') + '</span>' +
            '<span class="text-sky-400 font-bold font-mono">' + esc(s.value) + ' kW</span></div>').join('') +
        '</div>';
      }
      return '<div class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-cmr-overlay>' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">' +
          '<div class="px-4 py-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel">' +
            '<div class="flex items-center gap-3">' +
              '<h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">' + esc(T.popupTitle) + '</h3>' +
              '<span class="px-2 py-0.5 text-[11px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-[2px]">' + esc(valueTypesLabel()) + '</span>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.downloadPdf, attrs: 'data-act="pdf"' }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.downloadExcel, attrs: 'data-act="excel"' }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: T.downloadZip, attrs: 'data-act="zip"' }) +
              '<button type="button" class="text-slate-400 hover:text-slate-200 text-lg px-2" data-act="close-cmr">×</button>' +
            '</div>' +
          '</div>' +
          '<div class="p-4 overflow-y-auto flex-1 space-y-4">' + body + '</div>' +
        '</div>' +
      '</div>';
    }

    function loadingOverlayHtml() {
      if (!state.graphLoading) return '';
      return '<div class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3 text-white">' +
        '<i class="pi pi-spin pi-spinner text-sky-400 text-4xl"></i>' +
        '<p class="text-sm font-semibold">' + esc(T.generatingReport) + '</p>' +
        '<p class="text-xs text-slate-400">' + esc(T.pleaseWait) + '</p>' +
      '</div>';
    }

    // --- Grafik penceresi (GraphPopupComponent + LineGraphComponent) -------------------
    function legendHtml() {
      const g = state.graph;
      return '<button class="btn-legend-toggle" data-g="legend">' + esc(T.gDisplayOptions) + ' <span class="arrow' + (g.legendOpen ? ' open' : '') + '">▼</span></button>' +
        (g.legendOpen
          ? '<div class="legend-dropdown-content">' + g.datasets.map((ds, i) =>
              '<div class="legend-item" data-g-series="' + i + '">' +
                '<span class="color-dot" style="background-color:' + esc(ds.borderColor) + '"></span>' +
                '<span class="item-label' + (g.hidden[i] ? ' disabled' : '') + '">' + esc(ds.label) + '</span>' +
                (!g.hidden[i] ? '<span class="check-mark">✓</span>' : '') +
              '</div>').join('') + '</div>'
          : '');
    }
    function graphHtml() {
      const g = state.graph;
      if (!g) return '';
      return '<div class="r3-graph"><div class="popup-overlay"><div class="popup-container" data-g-container>' +
        '<div class="popup-header" data-g-drag>' +
          '<h3 class="truncate-text">' + esc(g.title) + '</h3>' +
          '<div class="legend-dropdown-wrapper" data-g-legend>' + legendHtml() + '</div>' +
          '<div class="popup-actions">' +
            '<button class="btn btn-pdf" data-g="pdf">' + esc(T.gDownloadPdf) + '</button>' +
            '<button class="btn btn-excel" data-g="excel">' + esc(T.gDownloadExcel) + '</button>' +
            '<button class="close-button" data-g="close">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="popup-content"><div class="graph-wrapper"><div style="height: 100%; width: 100%;">' +
          '<div class="chart-container"><div class="chart-area"><canvas data-g-canvas></canvas></div></div>' +
        '</div></div></div>' +
      '</div></div></div>';
    }

    // formatDataForChart karşılığı: seri başına { x: periyot, y: kW }; 0 → null (boşluk)
    function formatDataForChart(bk) {
      const types = calcTypes();
      const cabs = state.selectedCabinets.slice().sort(cmpCab);
      const fmt = bk.g === 'hour' ? fmtAxisHour : fmtAxisDay;
      const labels = bk.list.map(ts => fmt(new Date(ts)));
      const series = [];
      const allValues = [];
      const push = (label, pts) => { if (pts.some(p => p.y !== undefined)) series.push({ label, pts }); };
      // Önce PDU A/B satırları, ardından kabin toplamları (orijinal birleştirme sırası)
      types.forEach(type => cabs.forEach(cab => ['A', 'B'].forEach(side => {
        if (!state.selectedPduScopes.includes(side)) return;
        const pts = [];
        bk.list.forEach((ts, i) => { const p = src.point(cab, side, ts, bk.g); if (p) { pts.push({ x: labels[i], y: p[type] }); allValues.push(p[type]); } });
        push(cab + ' - PDU ' + side + ' (' + valueTypeLabel(type) + ')', pts);
      })));
      if (state.selectedPduScopes.includes('total')) {
        types.forEach(type => cabs.forEach(cab => {
          const pts = [];
          bk.list.forEach((ts, i) => {
            const a = src.point(cab, 'A', ts, bk.g), b = src.point(cab, 'B', ts, bk.g);
            if (!a && !b) return;
            const v = (a ? a[type] : 0) + (b ? b[type] : 0);
            pts.push({ x: labels[i], y: v });
            allValues.push(v);
          });
          push(cab + ' - Toplam (' + valueTypeLabel(type) + ')', pts);
        }));
      }
      const datasets = series.map((s, index) => {
        const color = 'hsl(' + ((index * 137.508) % 360) + ', 70%, 50%)';
        return {
          label: s.label,
          data: s.pts.map(p => ({ x: p.x, y: p.y === 0 ? null : p.y })),
          borderColor: color,
          backgroundColor: color,
          pointBackgroundColor: color,
          pointHoverBackgroundColor: color,
          pointBorderColor: '#fff',
          pointHoverBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: false,
          tension: 0.10,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 8
        };
      });
      const minVal = allValues.length ? Math.min.apply(null, allValues) : 0;
      const maxVal = allValues.length ? Math.max.apply(null, allValues) : 100;
      const padding = (maxVal - minVal) * 0.1 || 1;
      const yMin = Math.max(0, Math.floor(minVal - padding));
      const yMax = Math.ceil(maxVal + padding);
      const stepSize = parseFloat(((Math.ceil(maxVal + padding) - Math.floor(minVal - padding)) / 10).toPrecision(2)) || 1;
      return { datasets, labels, yMin, yMax, stepSize };
    }

    function createChart() {
      const g = state.graph;
      const canvas = el.querySelector('[data-g-canvas]');
      if (!g || !canvas || !window.Chart) return;
      if (chart) { chart.destroy(); chart = null; }
      // Grafik penceresi temadan bağımsız beyaz zeminlidir (orijinal .scss); Chart.js açık tema renkleri
      const text = '#666666', grid = 'rgba(0, 0, 0, 0.1)';
      const fmtVal = v => { const n = Number(v); return (n % 1 === 0 ? String(n) : n.toFixed(2)); };
      chart = new window.Chart(canvas, {
        type: 'line',
        data: { labels: g.labels, datasets: g.datasets.map((d, i) => Object.assign({}, d, { hidden: !!g.hidden[i] })) },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          color: text,
          plugins: {
            legend: { display: false },
            title: { display: true, text: g.title, color: text },
            tooltip: {
              enabled: true, mode: 'nearest', intersect: true,
              backgroundColor: 'rgba(0, 0, 0, 0.8)', titleColor: '#fff', bodyColor: '#fff', borderWidth: 0, cornerRadius: 6,
              callbacks: { label: ctx => (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + (ctx.parsed.y !== null ? fmtVal(ctx.parsed.y) + ' kW' : '') }
            }
          },
          scales: {
            y: {
              min: g.yMin, max: g.yMax,
              title: { display: true, text: T.gPowerAxisLabel, font: { weight: 'bold' }, color: text },
              ticks: { stepSize: g.stepSize, color: text, callback: v => fmtVal(v) + ' kW' },
              grid: { color: grid }, border: { color: grid }
            },
            x: {
              title: { display: true, text: T.gTimePeriodAxisLabel, font: { weight: 'bold' }, color: text },
              ticks: { maxRotation: 45, color: text },
              grid: { color: grid }, border: { color: grid }
            }
          }
        }
      });
    }

    function graphTitle() {
      const types = calcTypes();
      const typeLabel = types.length === 1 ? valueTypeLabel(types[0]) : types.map(valueTypeLabel).join(' + ');
      let reportTitle;
      if (state.isCustomer) {
        const company = state.selectedCompanies.length === 1 ? state.selectedCompanies[0] : customersLabel();
        reportTitle = company + ' - ' + (state.selectedCabinets.length === 1 ? state.selectedCabinets[0] : T.allCabinets);
      } else if (state.selectedCabinets.length > 3) {
        reportTitle = tr(T.selectedCabinets, { count: state.selectedCabinets.length });
      } else {
        reportTitle = state.selectedCabinets.join(', ');
      }
      return typeLabel + ' ' + T.gPowerConsumption + ' - ' + reportTitle;
    }

    // --- Çizim ------------------------------------------------------------------------------
    el.innerHTML = '<div class="space-y-4">' +
      '<div data-part="loading"></div>' +
      '<div data-part="header"></div>' +
      '<div data-part="card"></div>' +
      '<div data-part="cmr"></div>' +
      '<div data-part="graph"></div>' +
    '</div>';
    const parts = {};
    ['loading', 'header', 'card', 'cmr', 'graph'].forEach(k => { parts[k] = el.querySelector('[data-part="' + k + '"]'); });

    function renderHeader() { parts.header.innerHTML = headerHtml(); }
    function renderFilters() {
      const openPanel = parts.card.querySelector('[data-dd-panel]');
      const scroll = openPanel ? { name: openPanel.getAttribute('data-dd-panel'), top: openPanel.scrollTop } : null;
      if (!parts.card.firstChild) parts.card.innerHTML = kit.card({ title: T.filtersCardTitle, icon: 'pi pi-filter', body: '<div data-part="filters"></div>' });
      parts.card.querySelector('[data-part="filters"]').innerHTML = filtersHtml();
      if (scroll) { const p = parts.card.querySelector('[data-dd-panel="' + scroll.name + '"]'); if (p) p.scrollTop = scroll.top; }
    }
    function renderCmr() { parts.cmr.innerHTML = cmrPopupHtml(); }
    function renderLoading() { parts.loading.innerHTML = loadingOverlayHtml(); }
    function renderGraph() {
      if (chart) { chart.destroy(); chart = null; }
      parts.graph.innerHTML = graphHtml();
      if (state.graph) createChart();
    }
    function renderAll() { renderLoading(); renderHeader(); renderFilters(); renderCmr(); }

    // --- Eylemler -----------------------------------------------------------------------------
    function toggleDropdown(name) {
      const cur = state.dd[name];
      Object.keys(state.dd).forEach(k => { state.dd[k] = false; });
      if (!cur) state.dd[name] = true;
    }

    function resetFilters(keepDates) {
      Object.assign(state, {
        selectedCompanies: [], selectedCabinets: [], cabinetList: [], filteredCabinetList: [], cabinetOwnerMap: {},
        selectedPduScopes: ['total'], selectedSalonKeys: [], selectedPodKeys: [], salonOptions: [], podOptions: [], floorCache: {},
        allCabinetsList: [], filteredCabinetsList: [], cabinetFilterText: ''
      });
      if (!keepDates) Object.assign(state, { filterDate: '', startDate: '', endDate: '', preset: 'custom' });
      // Sunum: kabin bazlı modda kat verisi hemen yeniden yüklenir (salon listesi boş kalmasın)
      if (!state.isCustomer) loadAllPduDetails();
    }

    function stopProgress() { if (progressTimer) { clearInterval(progressTimer); progressTimer = null; } }

    // openCmrDataPopup / generateCabinetReport karşılığı: parça parça sorgu ilerlemesi simüle edilir
    function openReport() {
      if (!state.selectedCabinets.length) { toast(T.alertSelectCabinetOrCustomerReport, 'warning'); return; }
      if (state.isCustomer && !state.selectedCompanies.length) { toast(T.alertSelectCustomerOrCabinet, 'warning'); return; }
      const bk = buckets();
      if (bk.error) { toast(bk.error, 'warning'); return; }
      Object.assign(state, { showCmr: true, isPopupLoading: true, progressPercent: 0, progressMessage: T.progressStart, rows: [] });
      renderCmr();
      stopProgress();
      const chunks = Math.max(2, Math.min(8, Math.ceil(state.selectedCabinets.length / 15) * calcTypes().length + 1));
      let done = 0;
      progressTimer = setInterval(() => {
        done++;
        state.progressPercent = Math.round((done / chunks) * 100);
        state.progressMessage = tr(T.progress, { progress: state.progressPercent });
        if (done >= chunks) {
          stopProgress();
          state.rows = buildRows(bk);
          state.isPopupLoading = false;
          state.progressMessage = '';
        }
        renderCmr();
      }, 160);
    }

    function openGraph() {
      if (!state.selectedCabinets.length) { toast(T.alertSelectCabinetOrCustomerReport, 'warning'); return; }
      const bk = buckets();
      if (bk.error) { toast(T.alertSelectValidDateRange, 'warning'); return; }
      state.graphLoading = true;
      renderLoading();
      timers.push(setTimeout(() => {
        state.graphLoading = false;
        renderLoading();
        const f = formatDataForChart(bk);
        if (!f.datasets.length) { toast(T.alertNoGraphDataReceived, 'warning'); return; }
        state.graph = Object.assign({ title: graphTitle(), legendOpen: false, hidden: f.datasets.map(() => false) }, f);
        renderGraph();
      }, 700));
    }

    function closeGraph() { state.graph = null; renderGraph(); }

    function exportRows() {
      const types = calcTypes();
      const cols = [{ header: 'Tarih', value: r => r.date }];
      if (state.isCustomer) cols.push({ header: 'Müşteri', value: r => r.customerAdi || '-' });
      cols.push({ header: 'Kabin Adı', value: r => r.kabinAdi });
      if (!state.isCustomer) cols.push({ header: T.tablePdu, value: r => pduTranslatedLabel(r.pduAdi) });
      types.forEach(t => cols.push({ header: 'Değer (' + valueTypeLabel(t) + ') kW', value: r => (r.values[t] != null ? r.values[t].toFixed(2) : '0') + ' kW' }));
      return cols;
    }
    function exportBaseName(kind) {
      if (state.isCustomer) {
        const name = convertTurkishChars(state.selectedCompanies.length === 1 ? state.selectedCompanies[0] : T.allCustomers);
        return kind === 'zip' ? name + '_pduguc-raporu' : name + '_rapor';
      }
      if (state.selectedCabinets.length > 1) return kind === 'zip' ? 'kabin_toplu_pduguc-raporlama' : 'kabin_toplu_rapor';
      const cab = state.rows.length ? convertTurkishChars(state.rows[0].kabinAdi) : 'enerji_raporu';
      return kind === 'zip' ? cab + '_pduguc-raporlama' : cab + '_rapor';
    }

    function exportGraphExcel() {
      const g = state.graph;
      const cols = [{ header: T.gTimePeriodAxisLabel, value: r => r.label }].concat(g.datasets.map((ds, i) => ({
        header: ds.label + ' (kW)',
        value: r => { const p = ds.data.find(pt => pt.x === r.label); return p && p.y != null ? Number(p.y.toFixed(2)) : ''; }
      })).filter((c, i) => !g.hidden[i]));
      const file = convertTurkishChars(g.title).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      kit.exportExcel(file, cols, g.labels.map(label => ({ label })));
    }

    // Kabin derin bağlantısı: reports.html?cabinet=1AV42#energy → kabin bazlı mod, ilgili kat/salon/POD seçili
    function applyCabinetParam(code) {
      const hit = src.findCabinetAnyFloor(code) || src.findCabinetAnyFloor(code.replace(/^K/, ''));
      if (!hit) return;
      state.isCustomer = false;
      state.selectedFloorIds = [hit.floorId];
      loadAllPduDetails();
      const info = (state.floorCache[hit.floorId] || []).find(i => i.cabinet === hit.cabinet.code);
      if (!info) return;
      state.selectedSalonKeys = [info.salonKey];
      state.selectedPodKeys = [];
      rebuildPodOptions();
      state.selectedPodKeys = info.podKey ? [info.podKey] : state.selectedPodKeys;
      rebuildCabinetLists();
      state.selectedCabinets = [hit.cabinet.code];
    }

    // --- Olaylar --------------------------------------------------------------------------------
    function onClick(e) {
      // Grafik penceresi
      const g = e.target.closest('[data-g]');
      if (g) {
        const k = g.getAttribute('data-g');
        if (k === 'close') closeGraph();
        else if (k === 'legend') { state.graph.legendOpen = !state.graph.legendOpen; el.querySelector('[data-g-legend]').innerHTML = legendHtml(); }
        else if (k === 'pdf') kit.exportPdf();
        else if (k === 'excel') exportGraphExcel();
        return;
      }
      const series = e.target.closest('[data-g-series]');
      if (series && state.graph) {
        const i = parseInt(series.getAttribute('data-g-series'), 10);
        state.graph.hidden[i] = !state.graph.hidden[i];
        if (chart) { chart.setDatasetVisibility(i, !state.graph.hidden[i]); chart.update(); }
        el.querySelector('[data-g-legend]').innerHTML = legendHtml();
        return;
      }
      if (e.target.matches('[data-cmr-overlay]')) { closeCmr(); return; }

      const pick = e.target.closest('[data-pick]');
      if (pick) {
        const kind = pick.getAttribute('data-pick'), val = pick.getAttribute('data-val');
        if (kind === 'reportType') {
          state.isCustomer = val === 'true';
          resetFilters(true); // Sunum: tarih seçimi korunur
        } else if (kind === 'summaryType') {
          state.selectedSummaryType = val;
        } else if (kind === 'datePreset') {
          state.preset = val;
          onDateRangePresetChange();
        }
        state.dd[kind] = false;
        renderAll();
        return;
      }

      const tog = e.target.closest('[data-dd-toggle]');
      if (tog && !tog.disabled) {
        const name = tog.getAttribute('data-dd-toggle');
        if (name === 'customer' && !state.customerSelect) return;
        if (name === 'cabinet' && state.dd.cabinet) return; // arama kutusu açıkken yazmaya devam
        toggleDropdown(name);
        renderFilters();
        if (name === 'cabinet') focusFilterInput();
        return;
      }

      const act = e.target.closest('[data-act]');
      if (!act || act.disabled) return;
      switch (act.getAttribute('data-act')) {
        case 'reset': resetFilters(false); renderAll(); break;
        case 'generate': openReport(); break;
        case 'graph': openGraph(); break;
        case 'close-cmr': closeCmr(); break;
        case 'pdf': kit.exportPdf(); break;
        case 'excel': kit.exportExcel(exportBaseName('excel'), exportRows(), state.rows); break;
        case 'zip':
          kit.exportExcel(exportBaseName('zip'), exportRows(), state.rows);
          toast('Sunumda ZIP yerine Excel (CSV) dosyası indirildi.', 'info', 'ZIP');
          break;
      }
    }
    function closeCmr() { stopProgress(); state.showCmr = false; state.isPopupLoading = false; renderCmr(); }
    function focusFilterInput() {
      const inp = parts.card.querySelector('[data-filter-input]');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }

    function onChange(e) {
      const t = e.target;
      if (t.matches('[data-mode]')) { state.reportMode = t.value; renderAll(); return; }
      if (t.matches('[data-field]')) { state[t.getAttribute('data-field')] = t.value; return; }
      const cb = t.closest('[data-check]');
      if (!cb) return;
      const kind = cb.getAttribute('data-check'), val = cb.getAttribute('data-val'), on = cb.checked;
      const toggleIn = (arr, v) => on ? (arr.includes(v) ? arr : arr.concat(v)) : arr.filter(x => x !== v);
      switch (kind) {
        case 'floor':
          state.selectedFloorIds = val === '*' ? (on ? FLOOR_OPTIONS.map(f => f.id) : []) : toggleIn(state.selectedFloorIds, val);
          if (!state.isCustomer) { state.selectedSalonKeys = []; state.selectedPodKeys = []; loadAllPduDetails(); }
          break;
        case 'salon':
          state.selectedSalonKeys = val === '*' ? (on ? state.salonOptions.map(s => s.key) : []) : toggleIn(state.selectedSalonKeys, val);
          state.selectedPodKeys = [];
          rebuildPodOptions();
          rebuildCabinetLists();
          break;
        case 'pod':
          state.selectedPodKeys = val === '*' ? (on ? state.podOptions.map(p => p.key) : []) : toggleIn(state.selectedPodKeys, val);
          rebuildCabinetLists();
          break;
        case 'cabinet':
          state.selectedCabinets = val === '*' ? (on ? sourceCabinets().slice() : []) : toggleIn(state.selectedCabinets, val);
          break;
        case 'pduScope':
          if (val === 'all') {
            state.selectedPduScopes = on ? PDU_SCOPES.map(o => o.value) : ['total'];
          } else {
            let s = state.selectedPduScopes.slice();
            if (on) {
              // Yalnız "toplam" seçiliyken belirli bir PDU seçilirse toplam kaldırılır
              if (val !== 'total' && s.length === 1 && s[0] === 'total') s = [val];
              else if (!s.includes(val)) s.push(val);
            } else s = s.filter(v => v !== val);
            state.selectedPduScopes = s.length ? s : ['total'];
          }
          break;
        case 'customerSelect': toggleCustomerSelect(val, on); break;
        case 'customer':
          state.selectedCompanies = val === '*' ? (on ? state.customerList.slice() : []) : toggleIn(state.selectedCompanies, val);
          loadCabinetsForSelectedCustomers();
          break;
        case 'valueType': {
          const next = toggleIn(state.selectedValueTypes, val);
          state.selectedValueTypes = next.length ? VALUE_TYPES.map(o => o.value).filter(v => next.includes(v)) : ['Average'];
          break;
        }
      }
      renderHeader();
      renderFilters();
    }

    function onInput(e) {
      const inp = e.target.closest('[data-filter-input]');
      if (!inp) return;
      const v = inp.value;
      state.cabinetFilterText = v;
      state.filteredCabinetsList = v ? state.allCabinetsList.filter(o => o.toLowerCase().includes(v.toLowerCase())) : state.allCabinetsList.slice();
      if (!state.dd.cabinet) { toggleDropdown('cabinet'); renderFilters(); focusFilterInput(); return; }
      const panel = parts.card.querySelector('[data-dd-panel="cabinet"]');
      if (panel) panel.innerHTML = panelHtml('cabinet');
    }

    function onDocClick(e) {
      const path = e.composedPath ? e.composedPath() : [];
      const inside = name => path.some(n => n && n.getAttribute && n.getAttribute('data-dd-root') === name);
      let changed = false;
      Object.keys(state.dd).forEach(k => { if (state.dd[k] && !inside(k)) { state.dd[k] = false; changed = true; } });
      if (changed) renderFilters();
      if (state.graph && state.graph.legendOpen && !path.some(n => n && n.hasAttribute && n.hasAttribute('data-g-legend'))) {
        state.graph.legendOpen = false;
        const w = el.querySelector('[data-g-legend]');
        if (w) w.innerHTML = legendHtml();
      }
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (state.graph) closeGraph();
      else if (state.showCmr) closeCmr();
    }

    // cdkDrag karşılığı: başlıktan sürüklenebilir grafik penceresi
    function onMouseDown(e) {
      const head = e.target.closest('[data-g-drag]');
      if (!head || e.button !== 0 || e.target.closest('button, [data-g-legend]')) return;
      const box = el.querySelector('[data-g-container]');
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(box.style.transform || '');
      drag = { box, sx: e.clientX, sy: e.clientY, ox: m ? parseFloat(m[1]) : 0, oy: m ? parseFloat(m[2]) : 0 };
      e.preventDefault();
    }
    function onMouseMove(e) {
      if (!drag) return;
      const r = drag.box.getBoundingClientRect();
      const maxX = (window.innerWidth - r.width) / 2, maxY = (window.innerHeight - r.height) / 2;
      const x = Math.max(-maxX, Math.min(maxX, drag.ox + e.clientX - drag.sx));
      const y = Math.max(-maxY, Math.min(maxY, drag.oy + e.clientY - drag.sy));
      drag.box.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }
    function onMouseUp() { drag = null; }
    function onTheme() { if (state.graph) createChart(); }

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('dcim:theme', onTheme);

    // Başlangıç: iç müşteriler yüklü, hazır aralık "Geçen Hafta" (sunum için dolu gelir)
    loadCustomers('1');
    onDateRangePresetChange();
    const cabParam = new URLSearchParams(window.location.search).get('cabinet') || new URLSearchParams(window.location.search).get('pdu');
    if (cabParam) applyCabinetParam(String(cabParam).toUpperCase());
    renderAll();

    return {
      destroy() {
        stopProgress();
        timers.forEach(clearTimeout);
        if (chart) { chart.destroy(); chart = null; }
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        el.removeEventListener('input', onInput);
        el.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('dcim:theme', onTheme);
        el.innerHTML = '';
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {}).energy = { mount };
})();
