/* ==========================================================================
   DCIM Sunum — Sensör Raporu (NewUICMPCabinReportComponent)
   Kaynak: new-ui/pages/reporting/cabin-report/ (+ cabin-chart-popup/)
   - Filtre kartı: Kat, Kabinet, Sensör Tipi, Hesaplama Tipi, Rapor Periyodu, Hazır Aralıklar, tarih/saat
   - "Rapor Oluştur" → Filtrelenmiş Kabin Verileri penceresi (tablo + PDF/Excel/ZIP)
   - "Grafik Rapor"  → GraphPopupComponent (DCIM.r5.graphPopup, climate.js)
   - Tablodaki kabin adına tıklanınca → Kabin Sensör Grafikleri (CabinChartPopupComponent)
   Ortak yardımcılar: DCIM.r5 (js/reports/climate.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['cabin'] = {
    mount(el) {
      const { esc, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const R5 = DCIM.r5;
      const MOCK = DCIM.data.reports.cabin;
      R5.ensureCss();

      // messages.tr.json → reportCabin.* / reportEnergyPue.floorLabels / cabinetSensorDetail
      const T = {
        title: 'KABİN BAZLI SENSÖR VERİLERİ', menuReports: 'Raporlar', pleaseWait: 'Lütfen bekleyiniz.',
        floorInfo: 'Kat Bilgisi:', floorPlaceholder: 'Kat seçin...', cabinetInfo: 'Kabinet Bilgisi:',
        allCabinets: 'Tüm Kabinler', cabinetsLoading: 'Kabinler yükleniyor...', noCabinetsFound: 'Kabin bulunamadı', noResults: 'Sonuç yok',
        sensorType: 'Sensör Tipi:', select: 'Seçiniz...', all: 'Hepsi', calcType: 'Hesaplama Tipi:',
        reportPeriod: 'Rapor Periyodu:', dateRange: 'Tarih Aralığı', hourly: 'Saatlik', date: 'Tarih:',
        startTime: 'Başlangıç Saati:', endTime: 'Bitiş Saati:', presetRanges: 'Hazır Aralıklar:', presetPlaceholder: 'Aralık seçin...',
        startDate: 'Başlangıç Tarihi:', endDate: 'Bitiş Tarihi:', clear: 'Temizle', generateReport: 'Rapor Oluştur', loading: 'Yükleniyor...',
        generateChart: 'Grafik Rapor', chartLoading: 'Grafik Yükleniyor...', allFloors: 'Tüm Katlar',
        floorsCountSelected: '{count} Kat Seçili', cabinetsCountSelected: '{count} Kabin Seçili', cabinPlaceholder: 'Kabin Seçiniz...',
        popupTitle: 'Filtrelenmiş Kabin Verileri', pdfDownload: 'PDF İndir', excelDownload: 'Excel İndir', zipDownload: 'ZIP İndir',
        processingData: 'Veriler İşleniyor Lütfen Bekleyiniz...', colFloor: 'Kat', colCabinetName: 'Kabin Adı', colSensorName: 'Sensör Adı', colDate: 'Tarih',
        noData: 'Seçilen kriterlere uygun veri bulunamadı.', progressStarting: '%0 Başlıyor...', progressCompleted: '%{percent} Tamamlandı',
        chartTitleSuffixSeries: 'Zaman Serisi Grafiği', chartTitleSuffixCabin: 'Adet Kabin', pdfTitlePrefix: 'Sensör ',
        notSpecified: 'Belirtilmedi', xAxisLabel: 'Zaman', value: 'Değer',
        tempAndHum: 'Sıcaklık ve Nem', temp: 'Sıcaklık', sensor: 'Sensör',
        closed: 'Kapalı', open: 'Açık',
        alertSelect: 'Lütfen en az bir kabin ve sensör tipi seçin.', alertSelectFilter: 'Lütfen kabin ve sensör tipi seçin.',
        alertDate: 'Lütfen geçerli bir tarih aralığı seçin.', alertNoSensor: 'Seçilen kriterlere uygun sensör bulunamadı.',
        alertNoChart: 'Seçilen kriterlere uygun grafik verisi bulunamadı.',
        // cabin-chart-popup
        cpTitle: 'Kabin Sensör Grafikleri', cpSubtitle: 'Kabin bazlı sıcaklık ve nem analizi', cpSelectCabin: 'Kabin Seçin:', cpSelectedCabin: 'Seçili Kabin:',
        cpUpperSensors: 'Üst Sıcaklık Sensörleri', cpMiddleSensors: 'Orta Sıcaklık Sensörleri', cpLowerSensors: 'Alt Sıcaklık Sensörleri', cpHumValues: 'Nem Oranı Değerleri',
        cpUpper: 'Üst Sıcaklık', cpMiddle: 'Orta Sıcaklık', cpLower: 'Alt Sıcaklık', cpHum: 'Nem Oranı',
        cpTempUnit: 'Sıcaklık (°C)', cpHumUnit: 'Nem (%)', cpNoSensorData: '{cabin} kabini için sensör verisi bulunamadı.',
        cpRefresh: 'Grafikleri Yenile', close: 'Kapat'
      };
      const fill = (s, p) => Object.keys(p || {}).reduce((a, k) => a.replace('{' + k + '}', p[k]), s);

      const FLOORS = [
        { value: 'CMR/T00', label: '1.Kat', ridPrefixes: ['K1'] },
        { value: 'CMR/T02', label: '2.Kat', ridPrefixes: ['K2'] },
        { value: 'CMR/T03', label: '3.Kat', ridPrefixes: ['K3'] },
        { value: 'CMR/T04', label: 'IDC4', ridPrefixes: ['4', 'IDC4'] }
      ];
      const SENSOR_TYPES = [
        { value: 'TEMP_BOT', label: 'Sıcaklık Alt' },
        { value: 'TEMP_MID', label: 'Sıcaklık Orta' },
        { value: 'TEMP_TOP', label: 'Sıcaklık Üst' },
        { value: 'HUM', label: 'Nem' },
        { value: 'FDOOR', label: 'Ön Kapak' },
        { value: 'RDOOR', label: 'Arka Kapak' }
      ];
      const CALC_TYPES = [{ value: 'Average', label: 'Ortalama' }, { value: 'Minimum', label: 'Minimum' }, { value: 'Maximum', label: 'Maksimum' }];
      const COLORS = ['#36a2eb', '#ff6384', '#4bc0c0', '#ff9f40', '#9966ff', '#ffcd56', '#c9cbcf', '#2ecc71', '#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c'];

      // Sunum açılışı: ?cabinet=1BJ53 derin bağlantısıyla aynı (yüksek sıcaklık alarmı olan kabin) + "Geçen Hafta"
      const initRange = R5.presetRange('past_week');
      const state = {
        selectedFloors: [FLOORS[0]],
        moduleOptions: [], filteredModuleOptions: [], moduleSearchText: '',
        module: ['CMR/T00::1BJ53'],
        sensorTypes: ['TEMP_BOT', 'TEMP_MID', 'TEMP_TOP'],
        selectedValueType: 'Average',
        reportMode: 'daily',
        filterDate: DCIM.ui.fmtDateKey(new Date()), startTime: '00:00:00', endTime: '23:59:59',
        startDate: initRange.start, endDate: initRange.end,
        preset: 'past_week',
        dropdown: '',
        isLoadingPopupData: false, isLoadingChartData: false,
        chunkProgress: '', chunkProgressPercent: 0, loadingMessage: 'İşlem yapılıyor...',
        showDataPopup: false, popupData: []
      };
      let cancelChunks = null;
      let graph = null;
      let cabinPopup = null;

      // --- RID yardımcıları -----------------------------------------------------
      const floorOfRid = rid => {
        const prefix = (String(rid).split('_')[0] || '').toUpperCase();
        return FLOORS.find(f => f.ridPrefixes.some(p => prefix.indexOf(p.toUpperCase()) === 0)) || null;
      };
      const katOfRid = rid => { const f = floorOfRid(rid); return f ? f.label : 'N/A'; };
      const kabinOfRid = rid => { const p = String(rid || '').split('_'); return p.length >= 3 ? p[2] : p.length === 2 ? p[1] : 'N/A'; };
      const sensorOfRid = rid => { const p = String(rid || '').split('_'); return p.length >= 4 ? p.slice(3).join('_') : 'N/A'; };
      const sensorName = s => ({ TEMP_BOT: 'Sıcaklık Alt', TEMP_MID: 'Sıcaklık Orta', TEMP_TOP: 'Sıcaklık Üst', HUM_MID: 'Nem Orta', FDOOR: 'Ön Kapak', RDOOR: 'Arka Kapak' }[s] || (s ? s.replace(/_/g, ' ') : s));
      const unitOfRid = rid => { const u = String(rid || '').toUpperCase(); return u.indexOf('TEMP') >= 0 ? '°C' : u.indexOf('HUM') >= 0 ? '%rH' : ''; };
      const isDoor = rid => /FDOOR|RDOOR/i.test(String(rid || ''));
      const sensorOrder = s => { s = (s || '').toUpperCase(); return s.indexOf('TEMP_BOT') >= 0 ? 1 : s.indexOf('TEMP_MID') >= 0 ? 2 : s.indexOf('TEMP_TOP') >= 0 ? 3 : s.indexOf('HUM') >= 0 ? 4 : s.indexOf('FDOOR') >= 0 ? 5 : s.indexOf('RDOOR') >= 0 ? 6 : 99; };
      const formatValue = (val, rid) => {
        const n = parseFloat(val);
        if (isDoor(rid)) return isNaN(n) ? String(val) : (Math.round(n) === 1 ? T.closed : T.open);
        return isNaN(n) ? String(val) : n.toFixed(3);
      };
      const itemDate = item => {
        if (!item || !item.tim) return '';
        if (state.reportMode === 'hourly') return new Date(item.tim).toLocaleString('tr-TR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return item.tim; // YYYY-MM-DD
      };

      // --- Seçim yardımcıları ---------------------------------------------------
      function loadCabinOptions() {
        const opts = [];
        state.selectedFloors.forEach(f => MOCK.modules(f.value).forEach(m => opts.push({ key: f.value + '::' + m.module, module: m.module, floorValue: f.value, label: f.label + ' - ' + m.module })));
        state.moduleOptions = opts.sort((a, b) => a.label.localeCompare(b.label, 'tr'));
        state.moduleSearchText = '';
        state.filteredModuleOptions = state.moduleOptions.slice();
        const keys = new Set(state.moduleOptions.map(m => m.key));
        state.module = state.module.filter(k => keys.has(k));
      }
      const isAllModules = () => state.moduleOptions.length > 0 && state.module.length === state.moduleOptions.length;
      const modulesLabel = () => {
        if (!state.module.length) return T.cabinPlaceholder;
        if (isAllModules()) return T.allCabinets;
        if (state.module.length === 1) { const o = state.moduleOptions.find(x => x.key === state.module[0]); return o ? o.label : fill(T.cabinetsCountSelected, { count: 1 }); }
        return fill(T.cabinetsCountSelected, { count: state.module.length });
      };
      const floorsLabel = () => {
        if (!state.selectedFloors.length) return T.floorPlaceholder;
        if (state.selectedFloors.length === FLOORS.length) return T.allFloors;
        if (state.selectedFloors.length === 1) return state.selectedFloors[0].label;
        return fill(T.floorsCountSelected, { count: state.selectedFloors.length });
      };
      const allSensorTypes = () => state.sensorTypes.length === SENSOR_TYPES.length;
      const sensorTypesLabel = () => {
        if (!state.sensorTypes.length) return T.select;
        if (allSensorTypes()) return T.all;
        return SENSOR_TYPES.filter(o => state.sensorTypes.indexOf(o.value) >= 0).map(o => o.label).join(', ');
      };
      const calcLabel = () => { const c = CALC_TYPES.find(x => x.value === state.selectedValueType); return c ? c.label : T.select; };
      const valueTypeLabel = () => calcLabel() + ' ' + T.value;
      const presetLabel = () => { const p = R5.DATE_PRESETS.find(x => x.value === state.preset); return p ? p.label : 'Özel Aralık Seç'; };
      const sensorTypeText = () => {
        const sel = state.sensorTypes;
        const temps = sel.filter(t => t.indexOf('TEMP') === 0);
        const hasHum = sel.indexOf('HUM') >= 0;
        if (!sel.length) return T.sensor;
        if (temps.length && hasHum) return T.tempAndHum;
        if (temps.length === 1) return (SENSOR_TYPES.find(o => o.value === temps[0]) || {}).label || T.temp;
        if (temps.length > 1) return T.temp;
        if (hasHum) return 'Nem';
        return T.sensor;
      };
      const sensorUnit = () => {
        const hasTemp = state.sensorTypes.some(t => t.indexOf('TEMP') === 0);
        const hasHum = state.sensorTypes.indexOf('HUM') >= 0;
        if (hasTemp && !hasHum) return '°C';
        if (!hasTemp && hasHum) return '%rH';
        if (hasTemp && hasHum) return T.notSpecified;
        return '';
      };
      const isFormValid = () => {
        if (!state.module.length || !state.sensorTypes.length) return false;
        if (state.reportMode === 'hourly') return !!state.filterDate && !!state.startTime && !!state.endTime;
        return !!state.startDate && !!state.endDate;
      };

      // fetchRelevantSensorIds() — kat, kabin ve sensör tipi filtresi
      function relevantSensorIds() {
        const floorSet = new Set(state.selectedFloors.map(f => f.value));
        const modSet = new Set(state.module);
        const ids = [];
        state.selectedFloors.forEach(f => MOCK.sensorIds(f.value).forEach(id => ids.push(id)));
        return ids.filter(id => {
          const f = floorOfRid(id);
          if (!f || !floorSet.has(f.value)) return false;
          if (modSet.size > 0 && !modSet.has(f.value + '::' + kabinOfRid(id))) return false;
          const u = id.toUpperCase();
          return state.sensorTypes.some(type => {
            if (type.indexOf('TEMP') === 0) return u.indexOf('_' + type) >= 0;
            if (type === 'HUM') return u.indexOf('HUM') >= 0;
            if (type === 'FDOOR') return u.indexOf('_FDOOR') >= 0;
            if (type === 'RDOOR') return u.indexOf('_RDOOR') >= 0;
            return false;
          });
        });
      }
      const queryRids = rids => MOCK.query({ rids, calc: state.selectedValueType, mode: state.reportMode, filterDate: state.filterDate, startTime: state.startTime, endTime: state.endTime, startDate: state.startDate, endDate: state.endDate });

      // --- Şablon ---------------------------------------------------------------
      const DD = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded shadow-xl z-50 max-h-52 overflow-y-auto p-1 space-y-0.5';
      const DD56 = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
      const ALL_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
      const ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
      const OPT = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
      const CHK = 'rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
      const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
      const chk = (on, attrs) => '<input type="checkbox"' + (on ? ' checked' : '') + ' ' + attrs + ' class="' + CHK + '" />';
      const ddInput = (key, value, placeholder, extra) =>
        '<div class="relative"><input type="text" value="' + esc(value) + '" data-dd-toggle="' + key + '" placeholder="' + esc(placeholder) + '" class="scada-input pr-8 cursor-pointer" ' + (extra || 'readonly') + ' />' + CHEVRON + '</div>';

      function moduleListHtml() {
        return state.filteredModuleOptions.map(o =>
          '<label class="' + ROW + '">' + chk(state.module.indexOf(o.key) >= 0, 'data-module="' + esc(o.key) + '"') + '<span>' + esc(o.label) + '</span></label>').join('') +
          (!state.filteredModuleOptions.length ? '<div class="p-2 text-center text-xs text-slate-400">' + esc(T.noCabinetsFound) + '</div>' : '');
      }

      function filtersHtml() {
        const dd = state.dropdown;
        const region = '<div class="relative" data-dd="region">' +
          kit.formField({ label: T.floorInfo, control: ddInput('region', floorsLabel(), T.floorPlaceholder, 'id="region-filter" autocomplete="off" readonly') }) +
          (dd === 'region' ? '<div class="' + DD + '">' +
            FLOORS.map(f => '<label class="' + ROW + '">' + chk(state.selectedFloors.some(s => s.value === f.value), 'data-floor="' + esc(f.value) + '"') + '<span>' + esc(f.label) + '</span></label>').join('') +
          '</div>' : '') + '</div>';
        const module = '<div class="relative" data-dd="module">' +
          kit.formField({ label: T.cabinetInfo, control: '<div class="relative"><input type="text" value="' + esc(state.moduleSearchText) + '" data-dd-toggle="module" data-module-search placeholder="' + esc(modulesLabel()) + '" class="scada-input pr-8 cursor-pointer" autocomplete="off" />' + CHEVRON + '</div>' }) +
          (dd === 'module' ? '<div class="' + DD56 + '">' +
            '<label class="' + ALL_ROW + '">' + chk(isAllModules(), 'data-all-modules') + '<span>' + esc(T.allCabinets) + '</span></label>' +
            '<div data-module-list>' + moduleListHtml() + '</div>' +
          '</div>' : '') + '</div>';
        const sensor = '<div class="relative" data-dd="sensorType">' +
          kit.formField({ label: T.sensorType, control: ddInput('sensorType', sensorTypesLabel(), T.select, 'id="sensor-type-filter" readonly') }) +
          (dd === 'sensorType' ? '<div class="' + DD + '">' +
            '<label class="' + ALL_ROW + '">' + chk(allSensorTypes(), 'data-all-sensors') + '<span>' + esc(T.all) + '</span></label>' +
            SENSOR_TYPES.map(o => '<label class="' + ROW + '">' + chk(state.sensorTypes.indexOf(o.value) >= 0, 'data-stype="' + o.value + '"') + '<span>' + esc(o.label) + '</span></label>').join('') +
          '</div>' : '') + '</div>';
        const calc = '<div class="relative" data-dd="calcType">' +
          kit.formField({ label: T.calcType, control: ddInput('calcType', calcLabel(), T.select, 'id="calc-type" readonly') }) +
          (dd === 'calcType' ? '<div class="' + DD + '">' +
            CALC_TYPES.map(c => '<div data-calc="' + c.value + '" class="' + OPT + '">' + esc(c.label) + '</div>').join('') +
          '</div>' : '') + '</div>';

        const period = kit.formField({
          label: T.reportPeriod,
          control: '<div class="flex items-center gap-4 py-1.5">' +
            '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300"><input type="radio" name="cab-mode" id="mode-daily" value="daily" data-mode' + (state.reportMode === 'daily' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.dateRange) + '</span></label>' +
            '<label class="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300"><input type="radio" name="cab-mode" id="mode-hourly" value="hourly" data-mode' + (state.reportMode === 'hourly' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.hourly) + '</span></label>' +
          '</div>'
        });
        let dates;
        if (state.reportMode === 'hourly') {
          dates = kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-field="filterDate" value="' + esc(state.filterDate) + '" class="scada-input" />' }) +
            kit.formField({ label: T.startTime, control: '<input type="time" id="start-time" step="1" data-field="startTime" value="' + esc(state.startTime) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endTime, control: '<input type="time" id="end-time" step="1" data-field="endTime" value="' + esc(state.endTime) + '" class="scada-input" />' });
        } else {
          dates = '<div class="relative" data-dd="datePreset">' +
              kit.formField({ label: T.presetRanges, control: ddInput('datePreset', presetLabel(), T.presetPlaceholder, 'id="date-preset" readonly') }) +
              (dd === 'datePreset' ? '<div class="' + DD + '">' +
                R5.DATE_PRESETS.map(p => '<div data-preset="' + p.value + '" class="' + OPT + '">' + esc(p.label) + '</div>').join('') +
              '</div>' : '') +
            '</div>' +
            kit.formField({ label: T.startDate, control: '<input type="date" id="start-date" data-field="startDate" value="' + esc(state.startDate) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endDate, control: '<input type="date" id="end-date" data-field="endDate" value="' + esc(state.endDate) + '" class="scada-input" />' });
        }
        return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">' + region + module + sensor + calc +
          '<div class="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">' + period + dates + '</div>' +
        '</div>';
      }

      function mainHtml() {
        const valid = isFormValid();
        const actions =
          R5.button({ variant: 'primary', icon: 'pi pi-file', label: state.isLoadingPopupData ? T.loading : T.generateReport, loading: state.isLoadingPopupData, disabled: state.isLoadingPopupData || !valid, attrs: 'data-act="report"' }) +
          R5.button({ variant: 'primary', icon: 'pi pi-chart-line', label: state.isLoadingChartData ? T.chartLoading : T.generateChart, loading: state.isLoadingChartData, disabled: state.isLoadingChartData || !valid, attrs: 'data-act="chart"' });
        return kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.menuReports }, { label: T.title }], actions }) +
          kit.card({ title: T.title, icon: 'pi pi-filter', body: filtersHtml() });
      }

      const bar = cls => '<div class="' + cls + '"><div class="bg-sky-500 h-full transition-all duration-300" style="width: ' + state.chunkProgressPercent + '%"></div></div>';

      function overlayHtml() {
        if (!state.isLoadingChartData) return '';
        return '<div class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center">' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted p-6 rounded shadow-2xl flex flex-col items-center max-w-md w-full mx-4 text-center">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-slate-800 dark:text-slate-100 font-medium text-sm mb-2">' + esc(state.loadingMessage) + '</p>' +
            (state.chunkProgress ? bar('w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden mb-2') + '<span class="text-xs text-sky-600 dark:text-sky-300 font-mono mb-1">' + esc(state.chunkProgress) + '</span>' : '') +
            '<p class="text-slate-500 dark:text-slate-400 text-xs mt-1">' + esc(T.pleaseWait) + '</p>' +
          '</div></div>';
      }

      function popupHtml() {
        if (!state.showDataPopup) return '';
        const off = state.popupData.length === 0;
        let body;
        if (state.isLoadingPopupData) {
          body = '<div class="flex flex-col items-center justify-center py-12 text-center">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-slate-700 dark:text-slate-300 text-sm font-medium">' + esc(T.processingData) + '</p>' +
            (state.chunkProgress ? bar('w-64 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden mt-3 mb-1') + '<p class="text-xs text-sky-600 dark:text-sky-300 font-mono mt-1">' + esc(state.chunkProgress) + '</p>' : '') +
          '</div>';
        } else if (!off) {
          body = '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded">' +
            '<table class="w-full text-xs text-left text-slate-700 dark:text-slate-300">' +
              '<thead class="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-border-subtle uppercase tracking-wider"><tr>' +
                [T.colFloor, T.colCabinetName, T.colSensorName, valueTypeLabel(), T.colDate].map(h => '<th class="px-4 py-3">' + esc(h) + '</th>').join('') +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle">' +
                state.popupData.map(g => g.result.map(it =>
                  '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">' +
                    '<td class="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">' + esc(katOfRid(it.rid)) + '</td>' +
                    '<td class="px-4 py-2.5 text-sky-600 dark:text-sky-400 font-semibold" data-cabin-chart="' + esc(it.rid) + '" title="' + esc(T.cpTitle) + '" style="cursor: pointer">' + esc(kabinOfRid(it.rid)) + '</td>' +
                    '<td class="px-4 py-2.5 text-slate-700 dark:text-slate-300">' + esc(sensorName(sensorOfRid(it.rid))) + '</td>' +
                    '<td class="px-4 py-2.5 font-mono text-slate-900 dark:text-slate-100">' + esc(formatValue(it.val, it.rid)) +
                      (!isDoor(it.rid) ? ' <span class="text-slate-500 dark:text-slate-400 text-[11px] ml-1">' + esc(it.measureUnit) + '</span>' : '') + '</td>' +
                    '<td class="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-mono">' + esc(itemDate(it)) + '</td>' +
                  '</tr>').join('')).join('') +
              '</tbody></table></div>';
        } else {
          body = kit.emptyState({ message: T.noData });
        }
        return '<div class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4" data-popup-backdrop>' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">' +
            '<div class="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/50">' +
              '<div class="flex items-center gap-3">' +
                '<div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400"><i class="pi pi-table text-lg"></i></div>' +
                '<h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">' + esc(T.popupTitle) + '</h3>' +
              '</div>' +
              '<div class="flex items-center gap-2">' +
                R5.button({ variant: 'secondary', icon: 'pi pi-file-pdf', label: T.pdfDownload, disabled: off, attrs: 'data-act="pdf"' }) +
                R5.button({ variant: 'secondary', icon: 'pi pi-file-excel', label: T.excelDownload, disabled: off, attrs: 'data-act="excel"' }) +
                R5.button({ variant: 'secondary', icon: 'pi pi-file-archive', label: T.zipDownload, disabled: off, attrs: 'data-act="zip"' }) +
                '<button type="button" data-act="close-popup" class="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-lg font-bold ml-2">×</button>' +
              '</div>' +
            '</div>' +
            '<div class="p-6 overflow-y-auto flex-1 custom-scrollbar">' + body + '</div>' +
          '</div></div>';
      }

      el.innerHTML = '<div class="space-y-4" data-main></div><div data-overlay></div><div data-popup></div>';
      const mainEl = el.querySelector('[data-main]');
      const overlayEl = el.querySelector('[data-overlay]');
      const popupEl = el.querySelector('[data-popup]');
      const render = () => { mainEl.innerHTML = mainHtml(); };
      const renderPopup = () => { popupEl.innerHTML = popupHtml(); overlayEl.innerHTML = overlayHtml(); };

      // --- İş mantığı -------------------------------------------------------------
      function processFinalResults(raw) {
        if (!raw.length) { state.popupData = []; return; }
        const rows = raw.map(it => ({
          rid: it.rid, val: it.result_value || it.val || 0, tim: it.tim, measureUnit: unitOfRid(it.rid),
          k: kabinOfRid(it.rid), s: sensorOrder(sensorOfRid(it.rid)), ts: R5.toDate(it.tim).getTime()
        }));
        rows.sort((a, b) => a.k.localeCompare(b.k, undefined, { numeric: true, sensitivity: 'base' }) || a.ts - b.ts || a.s - b.s);
        state.popupData = [{ sensor_group: sensorTypeText() + ' ' + T.generateReport, result: rows }];
      }

      function startChunks(isChart, done) {
        const ids = relevantSensorIds();
        if (!ids.length) return false;
        state.chunkProgress = T.progressStarting;
        state.chunkProgressPercent = 0;
        const total = Math.ceil(ids.length / 20);
        cancelChunks = R5.simulateChunks(total, pct => {
          state.chunkProgress = fill(T.progressCompleted, { percent: pct });
          state.chunkProgressPercent = pct;
          if (isChart) state.loadingMessage = T.chartLoading + ' (' + state.chunkProgress + ')';
          renderPopup();
        }, () => { cancelChunks = null; done(queryRids(ids)); }, 120);
        return true;
      }

      function applyFilters() {
        if (!state.module.length || !state.sensorTypes.length) { toast(T.alertSelectFilter, 'warning'); return; }
        if (cancelChunks) cancelChunks();
        state.isLoadingPopupData = true;
        state.popupData = [];
        state.showDataPopup = true;
        const ok = startChunks(false, raw => {
          processFinalResults(raw);
          state.isLoadingPopupData = false;
          state.chunkProgress = ''; state.chunkProgressPercent = 0;
          render(); renderPopup();
        });
        if (!ok) { state.isLoadingPopupData = false; state.chunkProgress = ''; toast(T.alertNoSensor, 'warning'); }
        render(); renderPopup();
      }

      // generateChartReport() + processChartData()
      function generateChart() {
        if (!state.module.length || !state.sensorTypes.length) { toast(T.alertSelect, 'warning'); return; }
        if ((state.reportMode === 'hourly' && !state.filterDate) || (state.reportMode === 'daily' && (!state.startDate || !state.endDate))) { toast(T.alertDate, 'warning'); return; }
        if (cancelChunks) cancelChunks();
        state.loadingMessage = T.chartLoading;
        state.isLoadingChartData = true;
        const ok = startChunks(true, data => {
          state.isLoadingChartData = false;
          state.chunkProgress = ''; state.chunkProgressPercent = 0;
          state.loadingMessage = 'İşlem yapılıyor...';
          render(); renderPopup();
          if (!data.length) { toast(T.alertNoChart, 'warning'); return; }
          const units = new Set(data.map(d => unitOfRid(d.rid)).filter(Boolean));
          let unit = units.size === 1 ? Array.from(units)[0] : units.size > 1 ? T.notSpecified : '';
          if (!unit) unit = sensorUnit();
          const rids = Array.from(new Set(data.map(d => d.rid)));
          const labelSet = new Set();
          const datasets = rids.map((rid, i) => {
            const pts = data.filter(d => d.rid === rid).map(d => {
              const v = parseFloat(d.result_value);
              labelSet.add(d.tim);
              return { x: d.tim, y: isNaN(v) ? null : v };
            });
            const c = COLORS[i % COLORS.length];
            return { label: kabinOfRid(rid) + ' - ' + sensorName(sensorOfRid(rid)), data: pts, borderColor: c, backgroundColor: c, spanGaps: false };
          });
          const vals = datasets.reduce((a, d) => a.concat(d.data.map(p => p.y)), []).filter(v => v !== null && v !== undefined);
          const minV = vals.length ? Math.min.apply(null, vals) : 0;
          const maxV = vals.length ? Math.max.apply(null, vals) : 100;
          const padding = (maxV - minV) * 0.1 || 5;
          let title = sensorTypeText() + ' ' + T.chartTitleSuffixSeries;
          if (state.module.length > 3) title += ' - ' + state.module.length + ' ' + T.chartTitleSuffixCabin;
          if (graph) graph.close();
          graph = R5.graphPopup({
            chartData: datasets,
            timeLabels: Array.from(labelSet).sort((a, b) => R5.toDate(a).getTime() - R5.toDate(b).getTime()),
            chartTitle: title, pdfTitlePrefix: T.pdfTitlePrefix,
            yAxisLabel: valueTypeLabel() + ' (' + unit + ')', xAxisLabel: T.xAxisLabel,
            yMin: Math.floor(minV - padding), yMax: Math.ceil(maxV + padding),
            stepSize: parseFloat(((maxV - minV) / 10).toFixed(1)) || 1,
            decimalPlaces: 2, tooltipUnit: unit,
            xFormat: state.reportMode === 'hourly' ? 'datetime' : 'date',
            fileName: 'kabin_sensor_grafik_raporu',
            onClose: () => { graph = null; }
          });
        });
        if (!ok) { state.isLoadingChartData = false; toast(T.alertNoSensor, 'warning'); }
        render(); renderPopup();
      }

      function closeDataPopup() {
        if (cancelChunks) { cancelChunks(); cancelChunks = null; }
        state.showDataPopup = false;
        state.isLoadingPopupData = false;
        state.popupData = [];
        state.chunkProgress = ''; state.chunkProgressPercent = 0;
        // Orijinal davranış: pencere kapanınca tarih filtreleri sıfırlanır
        state.filterDate = ''; state.startDate = ''; state.endDate = ''; state.preset = 'custom';
        render(); renderPopup();
      }

      function clearFilters() {
        state.module = [];
        state.sensorTypes = [];
        state.selectedFloors = [FLOORS[0]];
        state.popupData = [];
        state.showDataPopup = false;
        state.dropdown = '';
        state.preset = 'custom';
        loadCabinOptions();
        render(); renderPopup();
      }

      const excelColumns = () => [
        { header: T.colFloor, value: r => katOfRid(r.rid) },
        { header: T.colCabinetName, value: r => kabinOfRid(r.rid) },
        { header: T.colSensorName, value: r => sensorName(sensorOfRid(r.rid)) },
        { header: valueTypeLabel(), value: r => formatValue(r.val, r.rid) + (isDoor(r.rid) ? '' : ' ' + r.measureUnit) },
        { header: T.colDate, value: r => itemDate(r) }
      ];
      const allRows = () => state.popupData.reduce((a, g) => a.concat(g.result), []);

      // ---------------------------------------------------------------------------
      // CabinChartPopupComponent — Üst/Orta/Alt sıcaklık ve nem grafikleri (Chart.js)
      // ---------------------------------------------------------------------------
      function openCabinChartPopup(focusRid) {
        if (cabinPopup) cabinPopup.close();
        // Seçili kabinlerin son 24 saatlik ham verisi (SubscribeHistoricalDataService karşılığı)
        const rids = [];
        state.module.forEach(key => {
          const floorValue = key.split('::')[0];
          const mod = key.split('::').slice(1).join('::');
          MOCK.sensorIds(floorValue).forEach(id => { if (kabinOfRid(id) === mod && /TEMP_|HUM_/.test(id)) rids.push(id); });
        });
        const cabinData = MOCK.history(rids);
        const cabinKey = rid => { const p = String(rid || '').split('_'); return p.length >= 3 ? p.slice(0, 3).join('_') : ''; };
        const available = Array.from(new Set(cabinData.map(d => cabinKey(d.rid)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
        let selected = focusRid && available.indexOf(cabinKey(focusRid)) >= 0 ? cabinKey(focusRid) : (available[0] || '');
        const charts = {};

        const SECTIONS = [
          { key: 'upper', dot: 'bg-[#ff6b6b]', color: '#ff6b6b', title: T.cpUpperSensors, series: T.cpUpper, unit: T.cpTempUnit, match: s => s === 'TEMP_TOP' },
          { key: 'middle', dot: 'bg-[#45b7d1]', color: '#45b7d1', title: T.cpMiddleSensors, series: T.cpMiddle, unit: T.cpTempUnit, match: s => s === 'TEMP_MID' },
          { key: 'lower', dot: 'bg-[#4ecdc4]', color: '#4ecdc4', title: T.cpLowerSensors, series: T.cpLower, unit: T.cpTempUnit, match: s => s === 'TEMP_BOT' },
          { key: 'hum', dot: 'bg-[#95d5b2]', color: '#95d5b2', title: T.cpHumValues, series: T.cpHum, unit: T.cpHumUnit, match: s => s.indexOf('HUM') === 0 }
        ];

        const host = document.createElement('div');
        host.className = 'fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4 overflow-y-auto';
        const filtered = () => cabinData.filter(d => cabinKey(d.rid) === selected);
        const bodyHtml = () =>
          '<div class="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">' +
            '<div class="flex items-center gap-3">' +
              '<label for="cabinSelect" class="text-xs font-medium text-slate-700 dark:text-slate-300">' + esc(T.cpSelectCabin) + '</label>' +
              '<select id="cabinSelect" data-cp-select class="scada-input min-w-[200px] text-xs bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded px-3 py-1.5 focus:border-sky-500 focus:outline-none">' +
                available.map(c => '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>').join('') +
              '</select>' +
            '</div>' +
            (selected ? '<div class="text-xs text-slate-500 dark:text-slate-400">' + esc(T.cpSelectedCabin) + ' <strong class="text-sky-600 dark:text-sky-400 font-semibold">' + esc(selected) + '</strong></div>' : '') +
          '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">' +
            SECTIONS.map(s =>
              '<div class="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-lg p-4 flex flex-col">' +
                '<div class="flex items-center gap-2 mb-3"><span class="w-2.5 h-2.5 rounded-full ' + s.dot + '"></span>' +
                  '<h3 class="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wider">' + esc(s.title) + '</h3></div>' +
                '<div class="relative w-full h-[260px] flex items-center justify-center"><canvas data-cp-chart="' + s.key + '" class="w-full h-full"></canvas></div>' +
              '</div>').join('') +
          '</div>' +
          (selected && filtered().length === 0 ? '<div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-center"><div class="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-medium"><i class="pi pi-exclamation-triangle"></i><span>' + esc(fill(T.cpNoSensorData, { cabin: selected })) + '</span></div></div>' : '') +
          '<div class="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/50 rounded-lg p-3">' +
            '<div class="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 dark:text-slate-400">' +
              SECTIONS.map(s => '<div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full ' + s.dot + '"></span><span>' + esc(s.series) + '</span></div>').join('') +
            '</div>' +
          '</div>';

        host.innerHTML =
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100" data-cp-panel>' +
            '<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/50">' +
              '<div class="flex items-center gap-3">' +
                '<div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400"><i class="pi pi-chart-line text-lg"></i></div>' +
                '<div><h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">' + esc(T.cpTitle) + '</h2><p class="text-xs text-slate-500 dark:text-slate-400">' + esc(T.cpSubtitle) + '</p></div>' +
              '</div>' +
              '<button type="button" data-cp-close class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-center text-lg font-bold">×</button>' +
            '</div>' +
            '<div class="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar" data-cp-body></div>' +
            '<div class="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/50">' +
              '<button type="button" data-cp-refresh class="px-4 py-2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors border border-slate-300 dark:border-slate-700 cursor-pointer"><i class="pi pi-refresh mr-1.5"></i> ' + esc(T.cpRefresh) + '</button>' +
              '<button type="button" data-cp-close class="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-sm cursor-pointer">' + esc(T.close) + '</button>' +
            '</div>' +
          '</div>';
        document.body.appendChild(host);
        const bodyEl = host.querySelector('[data-cp-body]');

        const destroyCharts = () => Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
        // prepareTimeSeriesChartData() + getTimeSeriesChartOptions()
        function buildCharts() {
          destroyCharts();
          const c = kit.chartColors();
          const dark = DCIM.theme.mode() === 'dark';
          const grid = dark ? c.grid : 'rgba(0, 0, 0, 0.1)';
          SECTIONS.forEach(s => {
            const canvas = bodyEl.querySelector('[data-cp-chart="' + s.key + '"]');
            if (!canvas) return;
            const rows = filtered().filter(d => s.match(sensorOfRid(d.rid))).sort((a, b) => new Date(a.qry_doc).getTime() - new Date(b.qry_doc).getTime());
            const groups = new Map();
            rows.forEach(d => { const k = selected ? d.desc : cabinKey(d.rid) + ' - ' + d.desc; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
            const variations = [s.color, s.color + 'CC', s.color + '99', s.color + '66', s.color + '33'];
            let idx = 0;
            const datasets = [];
            groups.forEach((list, name) => {
              const col = variations[idx++ % variations.length];
              datasets.push({ label: name, data: list.map(d => { const n = parseFloat(d.val); return isNaN(n) ? 0 : n; }), borderColor: col, backgroundColor: col + '20', borderWidth: 2, fill: false, tension: 0.1, pointRadius: 3, pointHoverRadius: 5 });
            });
            const longest = Array.from(groups.values()).reduce((a, b) => (a.length > b.length ? a : b), []);
            const labels = longest.map(d => new Date(d.qry_doc).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }));
            charts[s.key] = new window.Chart(canvas, {
              type: 'line',
              data: { labels, datasets },
              options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  title: { display: true, text: s.title + ' - ' + (selected || T.allCabinets), color: c.text, font: R5.font(16, 'bold') },
                  legend: { display: true, position: 'top', labels: { color: c.text, font: R5.font(12) } },
                  tooltip: { titleFont: R5.font(12, 'bold'), bodyFont: R5.font(12) }
                },
                scales: {
                  y: { beginAtZero: true, title: { display: true, text: s.unit, color: c.text, font: R5.font(12) }, grid: { color: grid }, ticks: { color: c.text, font: R5.font(12) } },
                  x: { title: { display: true, text: T.xAxisLabel, color: c.text, font: R5.font(12) }, grid: { color: grid }, ticks: { color: c.text, font: R5.font(12), maxRotation: 45, minRotation: 0 } }
                },
                interaction: { intersect: false, mode: 'index' }
              }
            });
          });
        }
        const renderBody = () => { destroyCharts(); bodyEl.innerHTML = bodyHtml(); buildCharts(); };
        renderBody();

        let refreshTimer = null;
        let closed = false;
        const onTheme = () => buildCharts();
        function close() {
          if (closed) return;
          closed = true;
          clearTimeout(refreshTimer);
          document.removeEventListener('dcim:theme', onTheme);
          destroyCharts();
          host.remove();
          cabinPopup = null;
        }
        document.addEventListener('dcim:theme', onTheme);
        host.addEventListener('click', e => {
          if (e.target === host || e.target.closest('[data-cp-close]')) { close(); return; }
          if (e.target.closest('[data-cp-refresh]')) { destroyCharts(); refreshTimer = setTimeout(buildCharts, 100); }
        });
        host.addEventListener('change', e => {
          if (e.target.hasAttribute('data-cp-select')) { selected = e.target.value; renderBody(); }
        });
        cabinPopup = { close };
      }

      // --- Olaylar ----------------------------------------------------------------
      function onClick(e) {
        const t = e.target;
        if (t.hasAttribute('data-popup-backdrop')) { closeDataPopup(); return; }
        const cc = t.closest('[data-cabin-chart]');
        if (cc) { openCabinChartPopup(cc.getAttribute('data-cabin-chart')); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
          const a = act.getAttribute('data-act');
          if (a === 'clear') clearFilters();
          else if (a === 'report') applyFilters();
          else if (a === 'chart') generateChart();
          else if (a === 'close-popup') closeDataPopup();
          else if (a === 'pdf') kit.exportPdf();
          else if (a === 'excel') kit.exportExcel('kabin_sensor_raporu', excelColumns(), allRows());
          else if (a === 'zip') { kit.exportExcel('kabin_sensor_raporu_' + DCIM.ui.fmtDateKey(new Date()), excelColumns(), allRows()); kit.exportPdf(); }
          return;
        }
        const tog = t.closest('[data-dd-toggle]');
        if (tog) {
          const key = tog.getAttribute('data-dd-toggle');
          if (key === 'module' && state.dropdown === 'module') return; // aramaya devam
          state.dropdown = state.dropdown === key ? '' : key;
          render();
          if (key === 'module' && state.dropdown === 'module') { const inp = mainEl.querySelector('[data-module-search]'); if (inp) inp.focus(); }
          return;
        }
        const calc = t.closest('[data-calc]');
        if (calc) { state.selectedValueType = calc.getAttribute('data-calc'); state.dropdown = ''; render(); return; }
        const preset = t.closest('[data-preset]');
        if (preset) {
          state.preset = preset.getAttribute('data-preset');
          const r = R5.presetRange(state.preset);
          if (r) { state.startDate = r.start; state.endDate = r.end; }
          state.dropdown = '';
          render();
        }
      }

      function onChange(e) {
        const t = e.target;
        if (t.hasAttribute('data-floor')) {
          const v = t.getAttribute('data-floor');
          if (t.checked) { if (!state.selectedFloors.some(f => f.value === v)) state.selectedFloors = state.selectedFloors.concat([FLOORS.find(f => f.value === v)]); }
          else { state.selectedFloors = state.selectedFloors.filter(f => f.value !== v); if (!state.selectedFloors.length) state.selectedFloors = [FLOORS[0]]; }
          state.selectedFloors.sort((a, b) => FLOORS.indexOf(a) - FLOORS.indexOf(b));
          const set = new Set(state.selectedFloors.map(f => f.value));
          state.module = state.module.filter(k => set.has(k.split('::')[0]));
          loadCabinOptions(); render(); return;
        }
        if (t.hasAttribute('data-all-modules')) {
          state.module = t.checked ? (state.moduleSearchText ? state.filteredModuleOptions : state.moduleOptions).map(o => o.key) : [];
          render(); return;
        }
        if (t.hasAttribute('data-module')) {
          const k = t.getAttribute('data-module');
          if (t.checked) { if (state.module.indexOf(k) < 0) state.module.push(k); } else state.module = state.module.filter(x => x !== k);
          // Arama metni korunur; yalnızca liste ve buton durumları yenilenir
          const search = state.moduleSearchText;
          render();
          const inp = mainEl.querySelector('[data-module-search]');
          if (inp) inp.value = search;
          return;
        }
        if (t.hasAttribute('data-all-sensors')) { state.sensorTypes = t.checked ? SENSOR_TYPES.map(o => o.value) : []; render(); return; }
        if (t.hasAttribute('data-stype')) {
          const v = t.getAttribute('data-stype');
          if (t.checked) { if (state.sensorTypes.indexOf(v) < 0) state.sensorTypes.push(v); } else state.sensorTypes = state.sensorTypes.filter(x => x !== v);
          render(); return;
        }
        if (t.hasAttribute('data-mode')) { state.reportMode = t.value; state.dropdown = ''; render(); return; }
        if (t.hasAttribute('data-field')) { state[t.getAttribute('data-field')] = t.value; render(); }
      }

      // onModuleSearchInput()
      function onInput(e) {
        const t = e.target;
        if (!t.hasAttribute('data-module-search')) return;
        state.moduleSearchText = t.value;
        const q = t.value.toLowerCase();
        state.filteredModuleOptions = state.moduleOptions.filter(o => o.label.toLowerCase().indexOf(q) >= 0 || o.module.toLowerCase().indexOf(q) >= 0);
        const list = mainEl.querySelector('[data-module-list]');
        if (list) list.innerHTML = moduleListHtml();
      }

      function onDocClick(e) {
        if (!state.dropdown || !document.contains(e.target)) return;
        const box = mainEl.querySelector('[data-dd="' + state.dropdown + '"]');
        if (box && !box.contains(e.target)) { state.dropdown = ''; render(); }
      }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
      document.addEventListener('click', onDocClick);

      loadCabinOptions();
      render();
      renderPopup();

      return {
        destroy() {
          if (cancelChunks) cancelChunks();
          if (graph) graph.close();
          if (cabinPopup) cabinPopup.close();
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          el.removeEventListener('input', onInput);
          document.removeEventListener('click', onDocClick);
        }
      };
    }
  };
})();
