/* ==========================================================================
   DCIM Sunum — UPS Raporu (NewUICMPUpsModuleReportComponent)
   Kaynak: new-ui/pages/reporting/ups-module-report/
   - Filtre kartı: kat, UPS ünitesi (aramalı çoklu seçim), bölüm, veri türü (bölüme göre),
     değer türü, rapor modu (tarih aralığı / saatlik), hazır aralıklar
   - "UPS Rapor Verileri" penceresi: parça parça (15 RID) yükleme ilerlemesi, veri tablosu,
     PDF / Excel / ZIP indirme
   Veri: DCIM.data.reports.upsModule (js/mock-data.js) — queryHisUpsandTrafo yerine.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportUps.* / common.*
  const T = {
    title: 'UPS RAPORU',
    reports: 'Raporlar',
    loadingPreparing: 'Veriler hazırlanıyor, lütfen bekleyin...',
    pleaseWait: 'Lütfen bekleyin...',
    floorSelection: 'Kat Seçimi',
    floorPlaceholder: 'Kat seçin',
    selectAll: 'Tümünü Seç',
    unitSelection: 'UPS Seçimi',
    unitPlaceholder: 'UPS ünitesi seçin',
    section: 'Bölüm',
    sectionPlaceholder: 'Bölüm seçin',
    dataType: 'Veri Türü',
    dataTypePlaceholder: 'Veri türü seçin',
    chooseSectionFirst: 'Önce bölüm seçiniz',
    valueType: 'Değer Türü',
    reportMode: 'Rapor Modu',
    daily: 'Tarih Aralığı',
    hourly: 'Saatlik',
    date: 'Tarih',
    start: 'Başlangıç',
    end: 'Bitiş',
    quickSelection: 'Hazır Aralıklar',
    presetsPlaceholder: 'Bir tarih aralığı seçin',
    clear: 'Temizle',
    loading: 'Yükleniyor...',
    generateReport: 'Rapor Oluştur',
    popupTitle: 'UPS Rapor Verileri',
    pdfDownload: 'PDF İndir',
    excelDownload: 'Excel İndir',
    zipDownload: 'ZIP İndir',
    loadingData: 'Veriler yükleniyor...',
    colUps: 'UPS Ünitesi',
    colSection: 'Bölüm',
    colDataType: 'Veri Türü',
    colValue: 'Değer',
    colDate: 'Tarih / Saat',
    noDataMessage: 'Seçilen kriterlere uygun veri bulunamadı.',
    floorsSelected: 'Kat Seçildi',
    allUpsSelected: 'Tüm UPS\'ler Seçildi',
    upsSelectedCount: 'UPS Seçildi',
    allSections: 'Tüm Bölümler',
    sectionsSelected: 'Bölüm Seçildi',
    typesSelected: 'Veri Türü Seçildi',
    progressStarting: '%0 Başlıyor...',
    progressCompleted: 'Tamamlandı',
    unknownUps: 'Bilinmeyen UPS',
    unknownSection: 'Bilinmeyen Bölüm',
    sensorGroup: 'UPS Sensör Grubu',
    fileName: 'ups-gecmis-veri-raporu',
    select: 'Seçiniz',
    alerts: {
      selectUps: 'Lütfen en az bir UPS ünitesi seçiniz.',
      selectSection: 'Lütfen en az bir bölüm seçiniz.',
      selectDataType: 'Lütfen en az bir veri türü seçiniz.',
      noSensors: 'Seçilen kriterlere uygun sensör bulunamadı.'
    }
  };

  const FLOOR_OPTIONS = [
    { value: 'CMR/T00', label: 'IDC1' },
    { value: 'CMR/T04', label: 'IDC4' }
  ];
  const SECTION_OPTIONS = [
    { value: 'BYP', label: 'Bypass' },
    { value: 'INP', label: 'Giriş' },
    { value: 'BAT', label: 'Akü' },
    { value: 'OUT', label: 'Çıkış' }
  ];
  const ALL_DATA_TYPES = [
    { value: 'VLT', label: 'Gerilim (V)' },
    { value: 'CURR', label: 'Akım (A)' },
    { value: 'FREQ', label: 'Frekans (Hz)' },
    { value: 'LNVLT', label: 'Fazlar Arası Gerilim (V)' },
    { value: 'LOAD', label: 'Yük (%)' },
    { value: 'ACTPWR', label: 'Aktif Güç (kW)' },
    { value: 'APPPWR', label: 'Görünen Güç (kVA)' },
    { value: 'PWRF', label: 'Güç Faktörü' },
    { value: 'CAPLEFT', label: 'Kalan Akü Kapasitesi (%)' }
  ];
  const CALC_OPTIONS = [
    { value: 'Average', label: 'Ortalama' },
    { value: 'Minimum', label: 'Minimum' },
    { value: 'Maximum', label: 'Maksimum' }
  ];
  const DATE_PRESETS = [
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
  const CHUNK_SIZE = 15;
  // Pencerede çizilen en fazla satır (tümü Excel'e aktarılır)
  const MAX_RENDER_ROWS = 2000;

  const pad = n => String(n).padStart(2, '0');
  const formatDateForInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  // Angular DatePipe 'dd.MM.yyyy HH:mm'
  const fmtPipeDate = s => { const d = new Date(s); return isNaN(d) ? '' : pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const formatDate = s => { if (!s) return ''; const d = new Date(s); return d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR'); };

  function formatValue(val, type) {
    if (val === null || val === undefined) return '-';
    const num = Number(val);
    if (type === 'VLT' || type === 'LNVLT') return num.toFixed(1) + ' V';
    if (type === 'CURR') return num.toFixed(1) + ' A';
    if (type === 'FREQ') return num.toFixed(2) + ' Hz';
    if (type === 'LOAD' || type === 'CAPLEFT') return num.toFixed(1) + ' %';
    if (type.includes('PWR')) {
      if (num > 1000) return (num / 1000).toFixed(2) + ' k';
      return num.toFixed(2);
    }
    return num.toFixed(2);
  }

  function mount(el) {
    const { esc, buttonClasses, statusBadge, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const MOCK = DCIM.data.reports.upsModule;
    const today = formatDateForInput(new Date());

    // -------------------------------------------------------------------------
    // Durum (bileşen alanları)
    // -------------------------------------------------------------------------
    const state = {
      isLoadingData: false,
      showDataPopup: false,
      chunkProgress: '',
      creationDate: new Date().toLocaleString('tr-TR'),
      reportMode: 'daily',
      selectedFloors: [FLOOR_OPTIONS[0].value],
      filters: { sections: [], dataTypes: [] },
      selectedUps: [],
      selectedValueType: 'Average',
      upsFilterText: '',
      filterDate: today,
      startTime: '00:00:00',
      endTime: '23:59:59',
      startDate: today,
      endDate: today,
      selectedDateRangePreset: 'custom',
      upsList: [],
      filteredUpsList: [],
      availableDataTypeOptions: [],
      dropdownStates: { floor: false, unit: false, section: false, dataType: false, calcType: false, datePreset: false },
      popupData: []
    };
    let runId = 0;
    const timers = [];

    // -------------------------------------------------------------------------
    // Yardımcılar (bileşen metotları)
    // -------------------------------------------------------------------------
    function btn(o) {
      const busy = !!o.loading;
      return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', !!o.iconOnly) + '" data-act="' + o.act + '"' +
        (o.disabled || busy ? ' disabled' : '') + (busy ? ' aria-busy="true"' : '') + '>' +
        (busy ? '<i class="pi pi-spin pi-spinner text-current"></i>' : (o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '')) +
        (o.label ? '<span class="truncate">' + esc(o.label) + '</span>' : '') +
      '</button>';
    }

    function refreshUpsList() {
      state.upsList = state.selectedFloors.flatMap(v => MOCK.UPS_BY_FLOOR[v] || []);
      const ids = new Set(state.upsList.map(u => u.id));
      state.selectedUps = state.selectedUps.filter(id => ids.has(id));
      applyUpsFilter();
    }
    function applyUpsFilter() {
      if (!state.upsFilterText) { state.filteredUpsList = state.upsList.slice(); return; }
      const v = state.upsFilterText.toLowerCase();
      state.filteredUpsList = state.upsList.filter(u => u.label.toLowerCase().includes(v) || u.id.toLowerCase().includes(v));
    }
    const isAllFloorsSelected = () => state.selectedFloors.length === FLOOR_OPTIONS.length;
    function getSelectedFloorsLabel() {
      if (!state.selectedFloors.length) return '';
      if (isAllFloorsSelected()) return T.selectAll;
      const labels = state.selectedFloors.map(v => (FLOOR_OPTIONS.find(f => f.value === v) || { label: v }).label);
      return labels.length <= 2 ? labels.join(', ') : labels.length + ' ' + T.floorsSelected;
    }
    const isAllSelected = () => state.selectedUps.length === state.upsList.length && state.upsList.length > 0;
    function getSelectedUpsDisplayText() {
      if (!state.selectedUps.length) return '';
      if (isAllSelected()) return T.allUpsSelected;
      if (state.selectedUps.length === 1) {
        const f = state.upsList.find(u => u.id === state.selectedUps[0]);
        return f ? f.label : state.selectedUps[0];
      }
      return state.selectedUps.length + ' ' + T.upsSelectedCount;
    }
    function getSelectedSectionLabel() {
      const s = state.filters.sections;
      if (!s.length) return '';
      if (s.length === SECTION_OPTIONS.length) return T.allSections;
      const labels = s.map(v => { const f = SECTION_OPTIONS.find(o => o.value === v); return f ? f.label.replace(' Hattı', '').replace(' Grubu', '') : v; });
      return labels.length <= 2 ? labels.join(', ') : labels.length + ' ' + T.sectionsSelected;
    }
    function getSelectedDataTypeLabel() {
      const d = state.filters.dataTypes;
      if (!d.length) return '';
      if (d.length > 3) return d.length + ' ' + T.typesSelected;
      return d.map(v => { const f = state.availableDataTypeOptions.find(o => o.value === v); return (f ? f.label : v).split(' (')[0]; }).join(', ');
    }
    function updateAvailableDataTypes() {
      const valid = new Set();
      state.filters.sections.forEach(sec => (MOCK.SECTION_CAPS[sec] || []).forEach(t => valid.add(t)));
      state.availableDataTypeOptions = ALL_DATA_TYPES.filter(o => valid.has(o.value));
    }
    const getSelectedCalcTypeLabel = () => { const f = CALC_OPTIONS.find(c => c.value === state.selectedValueType); return f ? f.label : T.select; };
    const getSelectedDatePresetLabel = () => { const f = DATE_PRESETS.find(p => p.value === state.selectedDateRangePreset); return f ? f.label : T.select; };
    const hasData = () => state.popupData.length > 0 && state.popupData[0].result.length > 0;

    // -------------------------------------------------------------------------
    // Görünüm parçaları
    // -------------------------------------------------------------------------
    function renderHeader() {
      const actions =
        btn({ variant: 'primary', icon: 'pi pi-file', label: state.isLoadingData ? T.loading : T.generateReport, act: 'apply', loading: state.isLoadingData, disabled: state.selectedUps.length === 0 || state.isLoadingData });
      hosts.header.innerHTML = kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.reports }, { label: T.title }], actions });
    }

    const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
    const PANEL_CLS = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
    const ALL_ROW_CLS = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
    const ROW_CLS = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
    const CB_CLS = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
    const OPT_CLS = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer transition-colors';

    function cbRow(cls, attr, checked, label) {
      return '<label class="' + cls + '"><input type="checkbox" ' + attr + (checked ? ' checked' : '') + ' class="' + CB_CLS + '" /><span>' + esc(label) + '</span></label>';
    }
    function unitPanelBody() {
      return cbRow(ALL_ROW_CLS, 'data-cb="unit" data-value="ALL"', isAllSelected(), T.selectAll) +
        state.filteredUpsList.map(o => cbRow(ROW_CLS, 'data-cb="unit" data-value="' + esc(o.id) + '"', state.selectedUps.includes(o.id), o.label)).join('');
    }
    function roInput(id, key, value, placeholder, disabled) {
      return '<div class="relative"><input type="text" id="' + id + '" value="' + esc(value) + '" data-dd-toggle="' + key + '"' +
        (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '') + ' class="scada-input pr-8 cursor-pointer" readonly' + (disabled ? ' disabled' : '') + ' />' + CHEVRON + '</div>';
    }

    function renderFilters() {
      const dd = state.dropdownStates;
      const f = state.filters;

      // 1. Kat
      const floorBlock = '<div class="relative" data-dd="floor">' +
        kit.formField({ label: T.floorSelection, control: roInput('floor-filter', 'floor', getSelectedFloorsLabel(), T.floorPlaceholder) }) +
        (dd.floor ? '<div class="' + PANEL_CLS + '">' +
          cbRow(ALL_ROW_CLS, 'data-cb="floor-all"', isAllFloorsSelected(), T.selectAll) +
          FLOOR_OPTIONS.map(o => cbRow(ROW_CLS, 'data-cb="floor" data-value="' + o.value + '"', state.selectedFloors.includes(o.value), o.label)).join('') +
        '</div>' : '') + '</div>';

      // 2. UPS ünitesi (yazarak filtrelenir)
      const unitBlock = '<div class="relative" data-dd="unit">' +
        kit.formField({
          label: T.unitSelection,
          control: '<div class="relative"><input type="text" id="unit-filter" value="' + esc(getSelectedUpsDisplayText()) + '" data-dd-toggle="unit" data-unit-input placeholder="' + esc(T.unitPlaceholder) + '" class="scada-input pr-8 cursor-pointer" autocomplete="off" />' + CHEVRON + '</div>'
        }) +
        (dd.unit ? '<div class="' + PANEL_CLS + '" data-unit-panel>' + unitPanelBody() + '</div>' : '') + '</div>';

      // 3. Bölüm
      const sectionBlock = '<div class="relative" data-dd="section">' +
        kit.formField({ label: T.section, control: roInput('section-filter', 'section', getSelectedSectionLabel(), T.sectionPlaceholder) }) +
        (dd.section ? '<div class="' + PANEL_CLS + '">' +
          SECTION_OPTIONS.map(o => cbRow(ROW_CLS, 'data-cb="section" data-value="' + o.value + '"', f.sections.includes(o.value), o.label)).join('') +
        '</div>' : '') + '</div>';

      // 4. Veri türü (bölüm seçilmeden pasif)
      const dtBlock = '<div class="relative" data-dd="dataType">' +
        kit.formField({ label: T.dataType, control: roInput('data-type-selector', 'dataType', getSelectedDataTypeLabel(), f.sections.length > 0 ? T.dataTypePlaceholder : T.chooseSectionFirst, f.sections.length === 0) }) +
        (dd.dataType ? '<div class="' + PANEL_CLS + '">' +
          state.availableDataTypeOptions.map(o => cbRow(ROW_CLS, 'data-cb="dataType" data-value="' + o.value + '"', f.dataTypes.includes(o.value), o.label)).join('') +
        '</div>' : '') + '</div>';

      // 5. Değer türü
      const calcBlock = '<div class="relative" data-dd="calcType">' +
        kit.formField({ label: T.valueType, control: roInput('calc-type-selector', 'calcType', getSelectedCalcTypeLabel(), '') }) +
        (dd.calcType ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5">' +
          CALC_OPTIONS.map(o => '<div data-act="calc" data-value="' + o.value + '" class="' + OPT_CLS + (state.selectedValueType === o.value ? ' bg-sky-500/10' : '') + '">' + esc(o.label) + '</div>').join('') +
        '</div>' : '') + '</div>';

      // 6. Rapor modu
      const daily = state.reportMode === 'daily';
      const modeBlock = '<div class="space-y-1.5">' +
        '<label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(T.reportMode) + '</label>' +
        '<div class="flex items-center gap-4 pt-2">' +
          '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
            '<input type="radio" id="mode-daily" name="ups-report-mode" value="daily" data-model="reportMode"' + (daily ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.daily) + '</span></label>' +
          '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
            '<input type="radio" id="mode-hourly" name="ups-report-mode" value="hourly" data-model="reportMode"' + (!daily ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.hourly) + '</span></label>' +
        '</div></div>';

      // 7/8. Tarih alanları
      const dateBlocks = daily
        ? '<div class="relative" data-dd="datePreset">' +
            kit.formField({ label: T.quickSelection, control: roInput('date-preset-selector', 'datePreset', getSelectedDatePresetLabel(), T.presetsPlaceholder) }) +
            (dd.datePreset ? '<div class="' + PANEL_CLS + '">' +
              DATE_PRESETS.map(p => '<div data-act="preset" data-value="' + p.value + '" class="' + OPT_CLS + (state.selectedDateRangePreset === p.value ? ' bg-sky-500/10' : '') + '">' + esc(p.label) + '</div>').join('') +
            '</div>' : '') +
          '</div>' +
          kit.formField({ label: T.start, control: '<input type="date" id="start-date" data-model="startDate" value="' + esc(state.startDate) + '" class="scada-input" />' }) +
          kit.formField({ label: T.end, control: '<input type="date" id="end-date" data-model="endDate" value="' + esc(state.endDate) + '" class="scada-input" />' })
        : kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-model="filterDate" value="' + esc(state.filterDate) + '" class="scada-input" />' }) +
          '<div class="grid grid-cols-2 gap-2">' +
            kit.formField({ label: T.start, control: '<input type="time" id="start-time" step="1" data-model="startTime" value="' + esc(state.startTime) + '" class="scada-input" />' }) +
            kit.formField({ label: T.end, control: '<input type="time" id="end-time" step="1" data-model="endTime" value="' + esc(state.endTime) + '" class="scada-input" />' }) +
          '</div>';

      hosts.filters.innerHTML = kit.card({
        title: T.title,
        icon: 'pi pi-filter',
        body: '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
          floorBlock + unitBlock + sectionBlock + dtBlock + calcBlock + modeBlock + dateBlocks + '</div>'
      });
    }

    function renderModal() {
      let html = '';
      // Tam sayfa yükleyici (pencere kapatılıp yükleme sürerken)
      if (state.isLoadingData && !state.showDataPopup) {
        html += '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center">' +
          '<div class="bg-surface-card border border-border-muted p-6 rounded-[2px] shadow-2xl flex flex-col items-center max-w-md w-full mx-4">' +
            '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-white font-medium text-sm mb-2">' + esc(T.loadingPreparing) + '</p>' +
            '<p class="text-slate-400 text-xs">' + esc(T.pleaseWait) + '</p>' +
          '</div></div>';
      }
      if (state.showDataPopup) {
        const has = hasData();
        let body = '';
        if (state.isLoadingData) {
          const pct = parseFloat(String(state.chunkProgress).replace('%', '').split(' ')[0]) || 0;
          body = '<div class="py-16 flex flex-col items-center justify-center text-center">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-slate-700 dark:text-slate-200 text-sm font-medium mb-4">' + esc(T.loadingData) + '</p>' +
            (state.chunkProgress ? '<div class="w-full max-w-md space-y-2">' +
              '<div class="w-full bg-slate-100 dark:bg-surface-panel h-2 rounded-[2px] overflow-hidden border border-slate-200 dark:border-border-subtle">' +
                '<div class="bg-sky-500 h-full transition-all duration-300" style="width: ' + pct + '%"></div>' +
              '</div>' +
              '<p class="text-slate-500 dark:text-slate-400 text-xs font-mono">' + esc(state.chunkProgress) + '</p>' +
            '</div>' : '') +
          '</div>';
        } else if (has) {
          const rows = state.popupData[0].result;
          const shown = rows.length > MAX_RENDER_ROWS ? rows.slice(0, MAX_RENDER_ROWS) : rows;
          body = '<div><div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
            '<table class="w-full text-xs text-left border-collapse"><thead>' +
              '<tr class="bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-border-subtle">' +
                '<th class="p-2.5 border-r border-slate-200 dark:border-border-subtle">' + esc(T.colUps) + '</th>' +
                '<th class="p-2.5 border-r border-slate-200 dark:border-border-subtle">' + esc(T.colSection) + '</th>' +
                '<th class="p-2.5 border-r border-slate-200 dark:border-border-subtle">' + esc(T.colDataType) + '</th>' +
                '<th class="p-2.5 text-right border-r border-slate-200 dark:border-border-subtle">' + esc(T.colValue) + '</th>' +
                '<th class="p-2.5 text-center">' + esc(T.colDate) + '</th>' +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle font-mono text-[11px]">' +
                shown.map(item =>
                  '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors">' +
                    '<td class="p-2.5 font-sans font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-border-subtle">' + esc(item.unit) + '</td>' +
                    '<td class="p-2.5 font-sans text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle">' + esc(item.section) + '</td>' +
                    '<td class="p-2.5 font-sans text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle">' + esc(item.dataType) + '</td>' +
                    '<td class="p-2.5 text-right font-bold text-sky-600 dark:text-sky-400 border-r border-slate-200 dark:border-border-subtle">' + esc(item.value) + '</td>' +
                    '<td class="p-2.5 text-center text-slate-500 dark:text-slate-400 font-mono text-[10px]">' + esc(fmtPipeDate(item.date)) + '</td>' +
                  '</tr>').join('') +
              '</tbody></table></div>' +
            (rows.length > shown.length
              ? '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-2 text-right font-mono">' + shown.length + ' / ' + rows.length + ' satır gösteriliyor — tamamı Excel dosyasında.</p>'
              : '') +
          '</div>';
        } else {
          body = kit.emptyState({ message: T.noDataMessage });
        }

        html += '<div data-modal-backdrop class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4 overflow-y-auto">' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden my-auto">' +
            '<div class="p-4 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-surface-panel/50">' +
              '<div class="flex items-center gap-3">' +
                '<h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">' +
                  '<i class="pi pi-database text-sky-500 dark:text-sky-400"></i><span>' + esc(T.popupTitle) + '</span>' +
                '</h3>' +
                statusBadge('info', getSelectedCalcTypeLabel()) +
              '</div>' +
              '<div class="flex items-center gap-2">' +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.pdfDownload, act: 'pdf', disabled: !has }) +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.excelDownload, act: 'excel', disabled: !has }) +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: T.zipDownload, act: 'zip', disabled: !has }) +
                '<button type="button" data-act="close-modal" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] transition-colors">' +
                  '<i class="pi pi-times"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="p-4 overflow-y-auto flex-1 space-y-6">' + body + '</div>' +
          '</div>' +
        '</div>';
      }
      hosts.modal.innerHTML = html;
    }

    // -------------------------------------------------------------------------
    // Sorgu (applyFilters / sendUpsQuery / processUpsData)
    // -------------------------------------------------------------------------
    function queryPayload(rids) {
      return {
        rids, mode: state.reportMode, calc: state.selectedValueType,
        filterDate: state.filterDate, startTime: state.startTime, endTime: state.endTime,
        startDate: state.startDate, endDate: state.endDate
      };
    }

    function applyFilters() {
      if (!state.selectedUps.length) { toast(T.alerts.selectUps, 'warning', T.title); return; }
      if (!state.filters.sections.length) { toast(T.alerts.selectSection, 'warning', T.title); return; }
      if (!state.filters.dataTypes.length) { toast(T.alerts.selectDataType, 'warning', T.title); return; }

      state.isLoadingData = true;
      state.showDataPopup = true;
      state.popupData = [];
      state.chunkProgress = T.progressStarting;
      renderHeader();
      renderModal();

      const rids = MOCK.generateRids(state.selectedUps, state.filters.sections, state.filters.dataTypes);
      if (!rids.length) {
        toast(T.alerts.noSensors, 'warning', T.title);
        state.isLoadingData = false;
        renderHeader();
        renderModal();
        return;
      }
      // 15'erli parçalar halinde sorgu ilerlemesi
      const chunks = [];
      for (let i = 0; i < rids.length; i += CHUNK_SIZE) chunks.push(rids.slice(i, i + CHUNK_SIZE));
      const step = Math.max(25, Math.min(120, Math.round(1600 / chunks.length)));
      const my = ++runId;
      const all = [];
      chunks.forEach((chunk, i) => {
        timers.push(setTimeout(() => {
          if (my !== runId) return;
          state.chunkProgress = '%' + Math.round(((i + 1) / chunks.length) * 100) + ' ' + T.progressCompleted;
          all.push.apply(all, MOCK.history(queryPayload(chunk)));
          if (i === chunks.length - 1) {
            processUpsData(all);
            state.isLoadingData = false;
            state.chunkProgress = '';
            renderHeader();
          }
          renderModal();
        }, step * (i + 1)));
      });
    }

    function processUpsData(data) {
      if (!data || !data.length) { state.popupData = []; return; }
      const list = data.map(item => {
        const parts = item.rid.split('_');
        const last = parts[parts.length - 1];
        const phase = ['A', 'B', 'C', 'AB', 'BC', 'CA'].includes(last) ? last : '';

        let upsLabel = T.unknownUps;
        for (const u of state.upsList) { if (item.rid.startsWith(u.id)) { upsLabel = u.label; break; } }

        let secLabel = T.unknownSection;
        if (item.rid.includes('_BYP_INP_')) secLabel = 'Bypass';
        else if (item.rid.includes('_INP_')) secLabel = 'Giriş';
        else if (item.rid.includes('_OUT_')) secLabel = 'Çıkış';
        else if (item.rid.includes('_BAT_')) secLabel = 'Akü';

        let typeLabel = 'Değer';
        let typeCode = '';
        for (const t of ['LNVLT', 'VLT', 'CURR', 'FREQ', 'LOAD', 'ACTPWR', 'APPPWR', 'PWRF', 'CAPLEFT']) {
          if (item.rid.includes('_' + t) || item.rid.endsWith('_' + t)) {
            const opt = state.availableDataTypeOptions.find(o => o.value === t);
            typeLabel = (opt ? opt.label : t).split(' (')[0];
            typeCode = t;
            break;
          }
        }
        if (phase) typeLabel += ' (Faz ' + phase + ')';

        return { unit: upsLabel, section: secLabel, dataType: typeLabel, phase, value: formatValue(item.result, typeCode), date: item.tim || item.period || '', rawValue: item.result };
      });
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      state.popupData = [{ sensor_group: T.sensorGroup, result: list }];
    }

    function cancelRun() {
      runId++;
      timers.forEach(clearTimeout);
      timers.length = 0;
    }

    function clearFilters() {
      cancelRun();
      state.selectedFloors = [FLOOR_OPTIONS[0].value];
      refreshUpsList();
      state.upsFilterText = '';
      applyUpsFilter();
      state.selectedUps = [];
      state.filters.sections = [];
      state.filters.dataTypes = [];
      updateAvailableDataTypes();
      state.popupData = [];
      state.showDataPopup = false;
      state.isLoadingData = false;
      renderHeader();
      renderFilters();
      renderModal();
    }

    function selectDatePreset(value) {
      state.selectedDateRangePreset = value;
      state.dropdownStates.datePreset = false;
      if (value === 'custom') return;
      const now = new Date();
      let start = new Date();
      let end = new Date();
      switch (value) {
        case 'yesterday': start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); break;
        case 'past_week': start.setDate(now.getDate() - 7); end.setDate(now.getDate() - 1); break;
        case 'month_to_date': start = new Date(now.getFullYear(), now.getMonth(), 1); end.setDate(now.getDate() - 1); break;
        case 'past_month': start.setDate(now.getDate() - 30); end.setDate(now.getDate() - 1); break;
        case 'last_month': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
        case 'year_to_date': start = new Date(now.getFullYear(), 0, 1); end.setDate(now.getDate() - 1); break;
        case 'past_year': start.setDate(now.getDate() - 365); end.setDate(now.getDate() - 1); break;
        case 'last_year': start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31); break;
      }
      state.startDate = formatDateForInput(start);
      state.endDate = formatDateForInput(end);
    }

    // Dışa aktarım (XLSX / jsPDF / JSZip yerine)
    function downloadExcel(name) {
      if (!hasData()) return;
      kit.exportExcel(name || T.fileName + '_' + Date.now(), [
        { header: T.colUps, value: r => r.unit },
        { header: T.colSection, value: r => r.section },
        { header: T.colDataType, value: r => r.dataType },
        { header: T.colValue, value: r => r.value },
        { header: T.colDate, value: r => formatDate(r.date) }
      ], state.popupData[0].result);
    }

    // -------------------------------------------------------------------------
    // Olaylar
    // -------------------------------------------------------------------------
    function toggleDropdown(key) {
      Object.keys(state.dropdownStates).forEach(k => { if (k !== key) state.dropdownStates[k] = false; });
      state.dropdownStates[key] = !state.dropdownStates[key];
    }
    function closeDropdownsExcept(key) {
      let changed = false;
      Object.keys(state.dropdownStates).forEach(k => {
        if (k !== key && state.dropdownStates[k]) { state.dropdownStates[k] = false; changed = true; }
      });
      return changed;
    }
    // UPS arama kutusu yeniden çizimden sonra odağı korur
    function refocusUnitInput() {
      const inp = el.querySelector('[data-unit-input]');
      if (inp) { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (err) { /* yok say */ } }
    }

    function onClick(e) {
      e.dcimR1Handled = true;
      if (e.target.hasAttribute('data-modal-backdrop')) { state.showDataPopup = false; renderModal(); return; }
      const ddEl = e.target.closest('[data-dd]');
      let rerender = closeDropdownsExcept(ddEl ? ddEl.getAttribute('data-dd') : null);

      const toggle = e.target.closest('[data-dd-toggle]');
      if (toggle) {
        const key = toggle.getAttribute('data-dd-toggle');
        toggleDropdown(key);
        renderFilters();
        if (key === 'unit') refocusUnitInput();
        return;
      }

      const actEl = e.target.closest('[data-act]');
      if (actEl && !actEl.disabled) {
        switch (actEl.getAttribute('data-act')) {
          case 'clear': clearFilters(); return;
          case 'apply': applyFilters(); break;
          case 'calc':
            state.selectedValueType = actEl.getAttribute('data-value');
            state.dropdownStates.calcType = false;
            rerender = true;
            break;
          case 'preset': selectDatePreset(actEl.getAttribute('data-value')); rerender = true; break;
          case 'close-modal': state.showDataPopup = false; renderModal(); break;
          case 'pdf': kit.exportPdf(); break;
          case 'excel': downloadExcel(); break;
          case 'zip': {
            const dateOnly = new Date().toLocaleDateString('tr-TR').replace(/\./g, '_');
            downloadExcel(T.fileName + '_' + state.reportMode + '_' + dateOnly);
            toast('ZIP arşivi sunumda Excel (CSV) dosyası olarak indirilir.', 'info', T.zipDownload);
            break;
          }
        }
      }
      if (rerender) renderFilters();
    }

    function onChange(e) {
      const t = e.target;
      const cb = t.getAttribute('data-cb');
      if (cb) {
        const v = t.getAttribute('data-value');
        if (cb === 'floor-all') {
          state.selectedFloors = t.checked ? FLOOR_OPTIONS.map(f => f.value) : [FLOOR_OPTIONS[0].value];
          refreshUpsList();
        } else if (cb === 'floor') {
          if (t.checked) { if (!state.selectedFloors.includes(v)) state.selectedFloors.push(v); }
          else {
            state.selectedFloors = state.selectedFloors.filter(x => x !== v);
            if (!state.selectedFloors.length) state.selectedFloors = [FLOOR_OPTIONS[0].value];
          }
          // Kat sırası seçenek sırasını izler
          state.selectedFloors = FLOOR_OPTIONS.map(f => f.value).filter(x => state.selectedFloors.includes(x));
          refreshUpsList();
        } else if (cb === 'unit') {
          if (v === 'ALL') state.selectedUps = t.checked ? state.upsList.map(u => u.id) : [];
          else if (t.checked) state.selectedUps.push(v);
          else state.selectedUps = state.selectedUps.filter(x => x !== v);
        } else if (cb === 'section') {
          if (t.checked) { if (!state.filters.sections.includes(v)) state.filters.sections.push(v); }
          else state.filters.sections = state.filters.sections.filter(s => s !== v);
          updateAvailableDataTypes();
        } else if (cb === 'dataType') {
          if (t.checked) { if (!state.filters.dataTypes.includes(v)) state.filters.dataTypes.push(v); }
          else state.filters.dataTypes = state.filters.dataTypes.filter(d => d !== v);
        }
        renderFilters();
        renderHeader();
        return;
      }
      const model = t.getAttribute('data-model');
      if (!model) return;
      state[model] = t.value;
      if (model === 'reportMode') renderFilters();
    }

    function onInput(e) {
      if (!e.target.hasAttribute('data-unit-input')) return;
      state.upsFilterText = e.target.value.toLowerCase();
      applyUpsFilter();
      const panel = el.querySelector('[data-unit-panel]');
      if (panel) panel.innerHTML = unitPanelBody();
    }

    function onDocClick(e) {
      if (e.dcimR1Handled) return;
      if (closeDropdownsExcept(null)) renderFilters();
    }

    // -------------------------------------------------------------------------
    // Kurulum
    // -------------------------------------------------------------------------
    el.innerHTML = '<div class="space-y-4">' +
      '<div data-r="header"></div>' +
      '<div data-r="filters"></div>' +
    '</div>' +
    '<div data-r="modal"></div>';
    const hosts = {
      header: el.querySelector('[data-r="header"]'),
      filters: el.querySelector('[data-r="filters"]'),
      modal: el.querySelector('[data-r="modal"]')
    };
    refreshUpsList();
    renderHeader();
    renderFilters();
    renderModal();

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    document.addEventListener('click', onDocClick);

    return {
      destroy() {
        cancelRun();
        document.removeEventListener('click', onDocClick);
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        el.removeEventListener('input', onInput);
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['ups-module'] = { mount };
})();
