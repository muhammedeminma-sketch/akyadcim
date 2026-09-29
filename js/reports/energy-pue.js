/* ==========================================================================
   DCIM Sunum — PUE Raporu (NewUICMPEnergyPueReportComponent)
   Kaynak: new-ui/pages/reporting/energy-pue-report/
   - Filtre kartı: kat (çoklu), rapor modu (tarih aralığı / saatlik), değer türü, hazır aralıklar
   - 4 ECharts gösterge (Anlık PUE, Tesis Enerjisi, IT Tüketimi, Soğutma Tüketimi)
   - IT / Tesis güç kaynakları tabloları, "Geçmiş Veriler" penceresi (PDF / Excel / ZIP)
   Veri: DCIM.data.reports.pue (js/mock-data.js) — XDB_GetValue / api.HIS_Pue yerine.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportEnergyPue.*
  const T = {
    title: 'PUE HESAPLAMA',
    reports: 'Raporlar',
    floorSelection: 'Kat Seçimi',
    reportMode: 'Rapor Modu',
    daily: 'Tarih Aralığı',
    hourly: 'Saatlik',
    valueType: 'Değer Türü',
    quickSelection: 'Hazır Aralıklar',
    selectRange: 'Aralık Seç',
    select: 'Seçiniz',
    floorPlaceholder: 'Kat seçiniz',
    selectAll: 'Hepsi',
    dateRange: 'Zaman Aralığı',
    between: 'ile',
    clear: 'Temizle',
    refresh: 'Yenile',
    generateReport: 'Rapor Oluştur',
    instantPUE: 'Anlık PUE Değeri',
    efficiencyIndicator: 'Verimlilik Göstergesi',
    facilityEnergy: 'Tesis Enerjisi',
    itConsumption: 'IT Tüketimi',
    coolingConsumption: 'Soğutma Tüketimi',
    itPowerSources: 'IT Güç Kaynakları',
    facilityPowerSources: 'Tesis Güç Kaynakları',
    deviceName: 'Cihaz Adı',
    power: 'Güç (kW)',
    percentage: 'Yüzde',
    historyData: 'Geçmiş Veriler',
    pdfDownload: 'PDF İndir',
    excelDownload: 'Excel İndir',
    zipDownload: 'ZIP İndir',
    loadingData: 'Veriler Hazırlanıyor...',
    dateTime: 'Tarih / Saat',
    date: 'Tarih',
    floor: 'Kat',
    pueValue: 'PUE Değeri',
    reportPeriod: 'Rapor Periyodu',
    calcType: 'Hesaplama Tipi',
    reportDate: 'Rapor Tarihi',
    notSpecified: 'Belirtilmedi',
    noDataMessage: 'Bu tarih aralığında gösterilecek veri bulunamadı.',
    analyzers: 'Analizör',
    coolingPanels: 'Klima Panosu',
    noSelection: 'Kat seçilmedi',
    unknown: 'Bilinmiyor',
    alerts: {
      hourlyDateRequired: 'Lütfen saatlik rapor için bir tarih seçin.',
      dailyDateRangeRequired: 'Lütfen tarih aralığı için başlangıç ve bitiş tarihi seçin.',
      floorRequired: 'Rapor oluşturmak için lütfen en az bir kat seçin.'
    }
  };

  const FLOOR_OPTIONS = [
    { value: 'CMR/T00', label: '1.Kat' },
    { value: 'CMR/T02', label: '2.Kat' },
    { value: 'CMR/T03', label: '3.Kat' },
    { value: 'CMR/T04', label: 'IDC4' }
  ];
  const AGG_OPTIONS = [
    { value: 'average', label: 'Ortalama' },
    { value: 'minimum', label: 'Minimum' },
    { value: 'maximum', label: 'Maksimum' }
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

  // ECharts gösterge ibresi (bileşendeki path:// ile aynı)
  const POINTER_PATH = 'path://M2090.36389,615.30999 L2090.36389,615.30999 C2091.48372,615.30999 2092.40383,616.194028 2092.44859,617.312956 L2096.90698,728.755929 C2097.05155,732.369577 2094.2393,735.416212 2090.62566,735.56078 C2090.53845,735.564269 2090.45117,735.566014 2090.36389,735.566014 L2090.36389,735.566014 C2086.74736,735.566014 2083.81557,732.63423 2083.81557,729.017692 C2083.81557,728.930412 2083.81732,728.84314 2083.82081,728.755929 L2088.2792,617.312956 C2088.32396,616.194028 2089.24407,615.30999 2090.36389,615.30999 Z';

  // Angular DecimalPipe (varsayılan en-US yerel ayarı) karşılığı
  const fmtDec = (v, min, max) => Number(v).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  const pad = n => String(n).padStart(2, '0');
  const formatDateForInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function mount(el) {
    const { esc, buttonClasses, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const MOCK = DCIM.data.reports.pue;
    const now0 = new Date();
    const creationDate = now0.toLocaleDateString('tr-TR') + ' ' + now0.toLocaleTimeString('tr-TR');

    // -------------------------------------------------------------------------
    // Durum (bileşen alanları)
    // -------------------------------------------------------------------------
    const state = {
      totalFacilityPower: 0,
      totalITPower: 0,
      pueValue: 0,
      facilityPowerData: [],
      itPowerData: [],
      isLoadingReport: false,
      reportMode: 'daily',
      aggregationType: 'average',
      filterDate: '',
      startTime: '00:00:00',
      endTime: '23:59:59',
      startDate: '',
      endDate: '',
      selectedDateRangePreset: 'custom',
      historicalPUEData: [],
      showHistoricalData: false,
      dropdownStates: { aggregation: false, datePreset: false, floor: false },
      selectedFloors: [FLOOR_OPTIONS[0].value],
      tick: 0
    };
    const charts = {};
    let loadTimer = null;

    // -------------------------------------------------------------------------
    // Yardımcılar
    // -------------------------------------------------------------------------
    function btn(o) {
      const busy = !!o.loading;
      return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', !!o.iconOnly) + '" data-act="' + o.act + '"' +
        (o.disabled || busy ? ' disabled' : '') + (busy ? ' aria-busy="true"' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' +
        (busy ? '<i class="pi pi-spin pi-spinner text-current"></i>' : (o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '')) +
        (!o.iconOnly && o.label ? '<span class="truncate">' + esc(o.label) + '</span>' : '') +
      '</button>';
    }
    const areAllFloorsSelected = () => state.selectedFloors.length === FLOOR_OPTIONS.length && FLOOR_OPTIONS.length > 0;
    function getSelectedFloorLabel() {
      if (areAllFloorsSelected()) return T.selectAll;
      if (state.selectedFloors.length === 0) return T.noSelection;
      const f = FLOOR_OPTIONS.find(x => x.value === state.selectedFloors[0]);
      return f ? f.label : T.unknown;
    }
    const getAggregationLabel = () => (AGG_OPTIONS.find(o => o.value === state.aggregationType) || AGG_OPTIONS[0]).label;
    const getSelectedDatePresetLabel = () => (DATE_PRESETS.find(p => p.value === state.selectedDateRangePreset) || DATE_PRESETS[0]).label;
    const isFormValid = () => state.reportMode === 'hourly'
      ? !!state.filterDate && !!state.startTime && !!state.endTime
      : !!state.startDate && !!state.endDate;
    const getPercentage = (value, total) => total > 0 ? (value / total) * 100 : 0;
    const hasPUEData = () => state.historicalPUEData.length > 0;

    // -------------------------------------------------------------------------
    // Görünüm parçaları
    // -------------------------------------------------------------------------
    function renderHeader() {
      const actions =
        btn({ variant: 'secondary', icon: 'pi pi-sync', label: T.refresh, act: 'refresh' }) +
        btn({ variant: 'primary', icon: 'pi pi-file', label: T.generateReport, act: 'generate', loading: state.isLoadingReport, disabled: state.isLoadingReport || !isFormValid() });
      hosts.header.innerHTML = kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.reports }, { label: T.title }], actions });
    }

    function ddInput(key, value, placeholder) {
      return '<div class="relative">' +
        '<input type="text" class="scada-input pr-8 cursor-pointer" readonly value="' + esc(value) + '" data-dd-toggle="' + key + '" placeholder="' + esc(placeholder) + '" />' +
        '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
      '</div>';
    }

    function renderFilters() {
      const dd = state.dropdownStates;
      const daily = state.reportMode === 'daily';

      const floorPanel = dd.floor
        ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-52 overflow-y-auto p-1 space-y-0.5">' +
            '<label class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer">' +
              '<input type="checkbox" data-floor-all' + (areAllFloorsSelected() ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" />' +
              '<span>' + esc(T.selectAll) + '</span>' +
            '</label>' +
            FLOOR_OPTIONS.map(f =>
              '<label class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
                '<input type="checkbox" data-floor="' + esc(f.value) + '"' + (state.selectedFloors.includes(f.value) ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" />' +
                '<span>' + esc(f.label) + '</span>' +
              '</label>').join('') +
          '</div>'
        : '';

      const floorBlock = '<div class="relative" data-dd="floor">' +
        kit.formField({ label: T.floorSelection, control: ddInput('floor', getSelectedFloorLabel(), T.floorPlaceholder) }) + floorPanel + '</div>';

      const modeBlock = kit.formField({
        label: T.reportMode,
        control: '<div class="flex items-center gap-4 h-8">' +
          '<label class="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
            '<input type="radio" name="pue-report-mode" value="daily" data-model="reportMode"' + (daily ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.daily) + '</span></label>' +
          '<label class="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
            '<input type="radio" name="pue-report-mode" value="hourly" data-model="reportMode"' + (!daily ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
            '<span>' + esc(T.hourly) + '</span></label>' +
        '</div>'
      });

      const aggPanel = dd.aggregation
        ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5">' +
            AGG_OPTIONS.map(o => '<div data-act="agg" data-value="' + o.value + '" class="px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' + esc(o.label) + '</div>').join('') +
          '</div>'
        : '';
      const aggBlock = '<div class="relative" data-dd="aggregation">' +
        kit.formField({ label: T.valueType, control: ddInput('aggregation', getAggregationLabel(), T.select) }) + aggPanel + '</div>';

      const presetPanel = dd.datePreset
        ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-52 overflow-y-auto p-1 space-y-0.5">' +
            DATE_PRESETS.map(p => '<div data-act="preset" data-value="' + p.value + '" class="px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' + esc(p.label) + '</div>').join('') +
          '</div>'
        : '';
      const presetBlock = daily
        ? '<div class="relative" data-dd="datePreset">' +
            kit.formField({ label: T.quickSelection, control: ddInput('datePreset', getSelectedDatePresetLabel(), T.selectRange) }) + presetPanel + '</div>'
        : '';

      const rangeBlock = daily
        ? '<div class="col-span-1 md:col-span-2 lg:col-span-4">' +
            kit.formField({
              label: T.dateRange,
              control: '<div class="flex items-center gap-2">' +
                '<input type="date" data-model="startDate" value="' + esc(state.startDate) + '" class="scada-input w-auto min-w-[130px]" />' +
                '<span class="text-slate-400 text-xs font-medium">' + esc(T.between) + '</span>' +
                '<input type="date" data-model="endDate" value="' + esc(state.endDate) + '" class="scada-input w-auto min-w-[130px]" />' +
              '</div>'
            }) +
          '</div>'
        : '<div class="col-span-1 md:col-span-2 lg:col-span-4">' +
            kit.formField({
              label: T.dateRange,
              control: '<div class="flex items-center gap-2">' +
                '<input type="date" data-model="filterDate" value="' + esc(state.filterDate) + '" class="scada-input w-auto min-w-[130px]" />' +
                '<span class="text-slate-400 text-xs">|</span>' +
                '<input type="time" data-model="startTime" step="1" value="' + esc(state.startTime) + '" class="scada-input w-auto min-w-[95px]" />' +
                '<span class="text-slate-400 text-xs">-</span>' +
                '<input type="time" data-model="endTime" step="1" value="' + esc(state.endTime) + '" class="scada-input w-auto min-w-[95px]" />' +
              '</div>'
            }) +
          '</div>';

      hosts.filters.innerHTML = kit.card({
        title: T.title,
        icon: 'pi pi-filter',
        body: '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">' + floorBlock + modeBlock + aggBlock + presetBlock + rangeBlock + '</div>'
      });
    }

    function gaugeCard(key, icon) {
      return kit.card({
        title: ' ',
        icon,
        attrs: 'data-gauge-card="' + key + '"',
        body: '<div data-chart="' + key + '" class="h-50 w-full"></div>' +
          '<div data-gauge-foot="' + key + '" class="text-[11px] text-center font-medium text-slate-500 dark:text-slate-400 mt-1"></div>'
      });
    }

    // Kart başlıkları / alt yazılar (kat etiketi ve kaynak sayıları değişince)
    function updateGaugeLabels() {
      const fl = getSelectedFloorLabel();
      const titles = {
        pue: T.instantPUE,
        facility: fl + ' ' + T.facilityEnergy,
        it: fl + ' ' + T.itConsumption,
        cooling: fl + ' ' + T.coolingConsumption
      };
      const foots = {
        pue: T.efficiencyIndicator,
        facility: state.facilityPowerData.length + ' ' + T.coolingPanels + ', ' + state.itPowerData.length + ' ' + T.analyzers,
        it: state.itPowerData.length + ' ' + T.analyzers,
        cooling: state.facilityPowerData.length + ' ' + T.coolingPanels
      };
      Object.keys(titles).forEach(k => {
        const h = el.querySelector('[data-gauge-card="' + k + '"] h3');
        if (h) h.textContent = titles[k];
        const f = el.querySelector('[data-gauge-foot="' + k + '"]');
        if (f) f.textContent = foots[k];
      });
    }

    function sourceTable(rows, total, pctCls) {
      if (!rows.length) return kit.emptyState({ message: T.noDataMessage, compact: true });
      return '<table class="w-full text-xs text-left border-collapse">' +
        '<thead><tr class="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold bg-slate-50 dark:bg-surface-panel/50">' +
          '<th class="py-2 px-3">' + esc(T.deviceName) + '</th>' +
          '<th class="py-2 px-3 text-center w-1/5">' + esc(T.power) + ' (kW)</th>' +
          '<th class="py-2 px-3 text-center w-1/5">' + esc(T.percentage) + '</th>' +
        '</tr></thead>' +
        '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">' +
          rows.map(item =>
            '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors">' +
              '<td class="py-2 px-3 text-slate-800 dark:text-slate-200 font-medium">' + esc(item.desc) + '</td>' +
              '<td class="py-2 px-3 text-center text-slate-700 dark:text-slate-300 font-mono">' + fmtDec(item.val / 1000, 2, 2) + '</td>' +
              '<td class="py-2 px-3 text-center ' + pctCls + ' font-mono font-semibold">' + fmtDec(getPercentage(item.val, total), 1, 1) + '%</td>' +
            '</tr>').join('') +
        '</tbody></table>';
    }

    function renderTables() {
      hosts.tables.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' +
        kit.card({ title: T.itPowerSources, icon: 'pi pi-list', body: '<div class="overflow-x-auto">' + sourceTable(state.itPowerData, state.totalITPower, 'text-sky-600 dark:text-sky-400') + '</div>' }) +
        kit.card({ title: T.facilityPowerSources, icon: 'pi pi-list', body: '<div class="overflow-x-auto">' + sourceTable(state.facilityPowerData, state.totalFacilityPower, 'text-emerald-600 dark:text-emerald-400') + '</div>' }) +
      '</div>';
    }

    function renderModal() {
      if (!state.showHistoricalData) { hosts.modal.innerHTML = ''; return; }
      const has = hasPUEData();
      let content;
      if (state.isLoadingReport) {
        content = '<div class="flex flex-col items-center justify-center py-12">' +
          '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-slate-600 dark:text-slate-300 text-sm font-medium">' + esc(T.loadingData) + '</p></div>';
      } else if (has) {
        content = '<div class="overflow-x-auto"><table class="w-full text-xs text-left border-collapse">' +
          '<thead><tr class="border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-800/60">' +
            '<th class="py-2.5 px-3.5">' + esc(state.reportMode === 'hourly' ? T.dateTime : T.date) + '</th>' +
            '<th class="py-2.5 px-3.5">' + esc(T.floor) + '</th>' +
            '<th class="py-2.5 px-3.5 text-right">' + esc(T.pueValue) + ' (' + esc(getAggregationLabel()) + ')</th>' +
          '</tr></thead>' +
          '<tbody class="divide-y divide-slate-200 dark:divide-slate-800/80">' +
            state.historicalPUEData.map(item =>
              '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">' +
                '<td class="py-2.5 px-3.5 text-slate-700 dark:text-slate-200 font-mono">' + esc(item.date) + '</td>' +
                '<td class="py-2.5 px-3.5 text-slate-800 dark:text-slate-300">' + esc(item.floorLabel) + '</td>' +
                '<td class="py-2.5 px-3.5 text-right font-mono font-bold text-sky-600 dark:text-sky-400">' + fmtDec(item.pueValue, 3, 3) + '</td>' +
              '</tr>').join('') +
          '</tbody></table></div>';
      } else {
        content = kit.emptyState({ message: T.noDataMessage });
      }
      hosts.modal.innerHTML =
        '<div data-modal-backdrop class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4">' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">' +
            '<div class="p-4 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel/40">' +
              '<h3 class="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">' +
                '<i class="pi pi-history text-sky-500"></i><span>' + esc(T.historyData) + '</span>' +
              '</h3>' +
              '<div class="flex items-center gap-2">' +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.pdfDownload, act: 'pdf', disabled: !has }) +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.excelDownload, act: 'excel', disabled: !has }) +
                btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-folder', label: T.zipDownload, act: 'zip', disabled: !has }) +
                btn({ variant: 'ghost', size: 'sm', icon: 'pi pi-times', iconOnly: true, act: 'close-modal' }) +
              '</div>' +
            '</div>' +
            '<div class="p-4 overflow-y-auto flex-1">' + content + '</div>' +
          '</div>' +
        '</div>';
    }

    // -------------------------------------------------------------------------
    // Grafikler (getGaugeOption / calculateAutoMax / updateAllCharts)
    // -------------------------------------------------------------------------
    function getGaugeOption(val, unit, maxVal, colorRanges) {
      const isDark = DCIM.theme.mode() === 'dark';
      return {
        series: [{
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: maxVal,
          splitNumber: 4,
          radius: '100%',
          center: ['50%', '70%'],
          itemStyle: { color: 'black', shadowColor: 'rgba(0,138,255,0.45)', shadowBlur: 10, shadowOffsetX: 2, shadowOffsetY: 2 },
          progress: { show: false, roundCap: true, width: 18 },
          pointer: { icon: POINTER_PATH, length: '75%', width: 16, offsetCenter: [0, '5%'] },
          axisLine: { roundCap: true, lineStyle: { width: 18, color: colorRanges } },
          axisTick: { splitNumber: 2, lineStyle: { width: 2, color: '#999' } },
          splitLine: { length: 12, lineStyle: { width: 3, color: '#999' } },
          axisLabel: { distance: 25, color: '#999', fontSize: 12 },
          title: { show: false },
          detail: {
            backgroundColor: isDark ? 'transparent' : '#fff',
            borderColor: isDark ? 'transparent' : '#999',
            borderWidth: 0,
            width: '80%',
            lineHeight: 40,
            height: 40,
            borderRadius: 8,
            offsetCenter: [0, '35%'],
            valueAnimation: true,
            formatter: function (value) {
              if (unit === 'PUE') return '{value|' + value.toFixed(3) + '}';
              return '{value|' + value.toFixed(2) + '} {unit|' + unit + '}';
            },
            rich: {
              value: { fontSize: 24, fontWeight: 'bolder', color: isDark ? '#ffffff' : '#333' },
              unit: { fontSize: 14, color: isDark ? '#cbd5e1' : '#999', padding: [0, 0, 0, 5] }
            }
          },
          data: [{ value: val }]
        }]
      };
    }

    function calculateAutoMax(val) {
      if (val <= 0) return 10;
      const target = val * 1.25;
      const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
      return Math.ceil(target / magnitude) * magnitude;
    }

    function updateAllCharts() {
      const pueColors = [[0.333, '#7CFFB2'], [0.667, '#FDDD60'], [1, '#FF6E76']];
      const pueOpt = getGaugeOption(state.pueValue, 'PUE', 4, pueColors);
      pueOpt.series[0].min = 1;

      const totalFacilityKW = (state.totalFacilityPower + state.totalITPower) / 1000;
      const itKW = state.totalITPower / 1000;
      const coolingKW = state.totalFacilityPower / 1000;

      const opts = {
        pue: pueOpt,
        facility: getGaugeOption(totalFacilityKW, 'kW', calculateAutoMax(totalFacilityKW), [[1, '#58D9F9']]),
        it: getGaugeOption(itKW, 'kW', calculateAutoMax(itKW), [[1, '#9858f9']]),
        cooling: getGaugeOption(coolingKW, 'kW', calculateAutoMax(coolingKW), [[1, '#58f9cf']])
      };
      Object.keys(opts).forEach(k => { if (charts[k]) charts[k].setOption(opts[k], true); });
    }

    // -------------------------------------------------------------------------
    // Veri (fetchEnergyData / calculatePUE)
    // -------------------------------------------------------------------------
    function resetData() {
      state.totalFacilityPower = 0;
      state.totalITPower = 0;
      state.pueValue = 0;
      state.facilityPowerData = [];
      state.itPowerData = [];
    }

    function fetchEnergyData() {
      resetData();
      const docIds = Array.from(new Set(state.selectedFloors));
      if (docIds.length) {
        const src = MOCK.live(docIds, state.tick);
        // processFacilityPowerData: DGT içeren noktalar hariç
        state.facilityPowerData = src.facility.filter(i => !(typeof i.id === 'string' && i.id.toUpperCase().includes('DGT')));
        // processITPowerData: açıklamalarda UPS → SDP
        state.itPowerData = src.it.map(i => Object.assign({}, i, { desc: typeof i.desc === 'string' ? i.desc.replace(/UPS/g, 'SDP') : i.desc }));
        state.totalFacilityPower = state.facilityPowerData.reduce((s, i) => s + (parseFloat(i.val) || 0), 0);
        state.totalITPower = state.itPowerData.reduce((s, i) => s + (parseFloat(i.val) || 0), 0);
        state.pueValue = state.totalITPower > 0 ? (state.totalITPower + state.totalFacilityPower) / state.totalITPower : 0;
      }
      updateAllCharts();
      updateGaugeLabels();
      renderTables();
    }

    function refreshData() {
      state.tick++;
      fetchEnergyData();
    }

    function onDateRangePresetChange() {
      const now = new Date();
      let start = new Date();
      let end = new Date();
      if (state.selectedDateRangePreset === 'custom') return;
      switch (state.selectedDateRangePreset) {
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

    function formatDateTime(d) {
      if (state.reportMode === 'hourly') {
        return d.toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString('tr-TR');
    }

    function generatePUEReport() {
      if (state.reportMode === 'hourly' && !state.filterDate) { toast(T.alerts.hourlyDateRequired, 'warning', T.title); return; }
      if (state.reportMode === 'daily' && (!state.startDate || !state.endDate)) { toast(T.alerts.dailyDateRangeRequired, 'warning', T.title); return; }
      if (state.selectedFloors.length === 0) { toast(T.alerts.floorRequired, 'warning', T.title); return; }

      state.isLoadingReport = true;
      state.historicalPUEData = [];
      renderHeader();
      // api.HIS_Pue sorgusu yerine kısa gecikmeli mock yanıt
      loadTimer = setTimeout(() => {
        loadTimer = null;
        const labels = {};
        FLOOR_OPTIONS.forEach(f => { labels[f.value] = f.label; });
        state.historicalPUEData = MOCK.history({
          floors: state.selectedFloors, mode: state.reportMode, agg: state.aggregationType,
          startDate: state.startDate, endDate: state.endDate,
          filterDate: state.filterDate, startTime: state.startTime, endTime: state.endTime, labels
        }).map(r => ({ date: formatDateTime(r.tim), pueValue: r.value, floorLabel: r.floorLabel, floorValue: r.floorValue, timestamp: r.timestamp }));
        state.showHistoricalData = true;
        state.isLoadingReport = false;
        renderHeader();
        renderModal();
      }, 450);
    }

    function closeHistoricalDataPopup() {
      state.showHistoricalData = false;
      state.historicalPUEData = [];
      state.filterDate = '';
      state.startDate = '';
      state.endDate = '';
      state.selectedDateRangePreset = 'custom';
      renderModal();
      renderFilters();
      renderHeader();
    }

    function clearFilters() {
      state.reportMode = 'daily';
      state.aggregationType = 'average';
      state.filterDate = '';
      state.startTime = '00:00:00';
      state.endTime = '23:59:59';
      state.startDate = '';
      state.endDate = '';
      state.selectedDateRangePreset = 'custom';
      state.selectedFloors = [];
      resetData();
      updateAllCharts();
      updateGaugeLabels();
      renderTables();
      renderFilters();
      renderHeader();
    }

    // Dışa aktarım (XLSX / jsPDF / JSZip yerine kit.exportExcel / kit.exportPdf)
    function excelRows() {
      const range = state.reportMode === 'hourly'
        ? (state.filterDate || T.notSpecified) + ' ' + (state.startTime || '00:00') + ' - ' + (state.endTime || '23:59')
        : (state.startDate || T.notSpecified) + ' - ' + (state.endDate || T.notSpecified);
      return [
        ['', T.title, ''],
        ['', T.reportDate + ': ' + creationDate, ''],
        ['', T.reportPeriod + ': ' + (state.reportMode === 'hourly' ? T.hourly : T.daily), T.dateRange + ': ' + range],
        ['', T.calcType + ': ' + getAggregationLabel(), ''],
        ['', '', '']
      ].concat(state.historicalPUEData.map(i => [i.date, i.floorLabel, i.pueValue.toFixed(3)]));
    }
    function downloadExcel(name) {
      const cols = [
        { header: state.reportMode === 'hourly' ? T.dateTime : T.date, value: r => r[0] },
        { header: T.floor, value: r => r[1] },
        { header: T.pueValue + ' (' + getAggregationLabel() + ')', value: r => r[2] }
      ];
      kit.exportExcel(name || 'pue_raporu_' + state.reportMode, cols, excelRows());
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

    function onClick(e) {
      e.dcimR1Handled = true;
      if (e.target.closest('[data-modal-backdrop]') && e.target.hasAttribute('data-modal-backdrop')) { closeHistoricalDataPopup(); return; }
      const ddEl = e.target.closest('[data-dd]');
      let rerender = closeDropdownsExcept(ddEl ? ddEl.getAttribute('data-dd') : null);

      const toggle = e.target.closest('[data-dd-toggle]');
      if (toggle) { toggleDropdown(toggle.getAttribute('data-dd-toggle')); renderFilters(); return; }

      const actEl = e.target.closest('[data-act]');
      if (actEl && !actEl.disabled) {
        const act = actEl.getAttribute('data-act');
        switch (act) {
          case 'clear': clearFilters(); return;
          case 'refresh':
            if (state.selectedFloors.length === 0) { resetData(); updateAllCharts(); updateGaugeLabels(); renderTables(); } else refreshData();
            break;
          case 'generate': generatePUEReport(); break;
          case 'agg': state.aggregationType = actEl.getAttribute('data-value'); state.dropdownStates.aggregation = false; rerender = true; break;
          case 'preset':
            state.selectedDateRangePreset = actEl.getAttribute('data-value');
            onDateRangePresetChange();
            state.dropdownStates.datePreset = false;
            rerender = true;
            renderHeader();
            break;
          case 'close-modal': closeHistoricalDataPopup(); return;
          case 'pdf': kit.exportPdf(); break;
          case 'excel': downloadExcel(); break;
          case 'zip':
            downloadExcel('pue_raporu_' + new Date().toLocaleDateString('tr-TR').replace(/[/:.\s]/g, '_'));
            toast('ZIP arşivi sunumda Excel (CSV) dosyası olarak indirilir.', 'info', T.zipDownload);
            break;
        }
      }
      if (rerender) renderFilters();
    }

    function onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-floor-all')) {
        state.selectedFloors = t.checked ? FLOOR_OPTIONS.map(f => f.value) : [];
        renderFilters();
        refreshData();
        return;
      }
      if (t.hasAttribute('data-floor')) {
        const v = t.getAttribute('data-floor');
        if (t.checked) { if (!state.selectedFloors.includes(v)) state.selectedFloors.push(v); }
        else state.selectedFloors = state.selectedFloors.filter(x => x !== v);
        renderFilters();
        refreshData();
        return;
      }
      const model = t.getAttribute('data-model');
      if (!model) return;
      state[model] = t.value;
      if (model === 'reportMode') renderFilters();
      renderHeader();
    }

    function onDocClick(e) {
      if (e.dcimR1Handled) return;
      if (closeDropdownsExcept(null)) renderFilters();
    }
    function onTheme() { updateAllCharts(); }
    function onResize() { Object.keys(charts).forEach(k => charts[k].resize()); }

    // -------------------------------------------------------------------------
    // Kurulum
    // -------------------------------------------------------------------------
    el.innerHTML = '<div class="space-y-4">' +
      '<div data-r="header"></div>' +
      '<div data-r="filters"></div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">' +
        gaugeCard('pue', 'pi pi-chart-line') +
        gaugeCard('facility', 'pi pi-bolt') +
        gaugeCard('it', 'pi pi-desktop') +
        gaugeCard('cooling', 'pi pi-cog') +
      '</div>' +
      '<div data-r="tables"></div>' +
    '</div>' +
    '<div data-r="modal"></div>';
    const hosts = {
      header: el.querySelector('[data-r="header"]'),
      filters: el.querySelector('[data-r="filters"]'),
      tables: el.querySelector('[data-r="tables"]'),
      modal: el.querySelector('[data-r="modal"]')
    };
    renderHeader();
    renderFilters();
    if (window.echarts) {
      el.querySelectorAll('[data-chart]').forEach(div => { charts[div.getAttribute('data-chart')] = window.echarts.init(div); });
    }
    fetchEnergyData();

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    document.addEventListener('click', onDocClick);
    document.addEventListener('dcim:theme', onTheme);
    window.addEventListener('resize', onResize);
    // Bileşendeki 60 sn'lik periyodik okuma
    const intervalId = setInterval(refreshData, 60000);

    return {
      destroy() {
        clearInterval(intervalId);
        if (loadTimer) clearTimeout(loadTimer);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('dcim:theme', onTheme);
        window.removeEventListener('resize', onResize);
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        Object.keys(charts).forEach(k => { try { charts[k].dispose(); } catch (err) { /* yok say */ } });
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['energy-pue'] = { mount };
})();
