/* ==========================================================================
   DCIM Sunum — Klima Raporu (NewUICMPClimateReportComponent)
   Kaynak: new-ui/pages/reporting/climate-report/
   - Filtre kartı: Kat, Klima Ünitesi, Veri Tipi, Değer Türü, Rapor Periyodu, Hazır Aralıklar, tarih/saat
   - "Rapor Oluştur" → Filtrelenmiş Klima Verileri penceresi (tablo + PDF/Excel/ZIP)
   - "Grafik Rapor"  → GraphPopupComponent (Chart.js çizgi grafik, lejant/gösterim seçenekleri)
   Bu dosya ayrıca R5 raporlarının (klima, sensör, IT güç) ortak yardımcılarını DCIM.r5 altında tanımlar.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // ===========================================================================
  // DCIM.r5 — R5 raporlarının ortak yardımcıları (cabin.js ve it-power.js mount anında kullanır)
  // ===========================================================================
  const R5 = (DCIM.r5 = DCIM.r5 || {});

  // css/reports-r5.css sayfada bağlı değilse ekle (GraphPopup stilleri). Yol bu betiğin konumuna göre çözülür.
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  const CSS_HREF = SCRIPT_SRC ? SCRIPT_SRC.replace(/js\/reports\/[^/]*$/, 'css/reports-r5.css') : 'css/reports-r5.css';
  R5.ensureCss = function () {
    if (document.querySelector('link[href$="reports-r5.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    document.head.appendChild(link);
  };

  // app-button — disabled / loading destekli (AppButtonComponent şablonu)
  R5.button = function (o) {
    const esc = DCIM.ui.esc;
    const off = o.disabled || o.loading;
    return '<button type="button" class="' + DCIM.ui.buttonClasses(o.variant || 'primary', o.size || 'md', false) + '" ' + (o.attrs || '') + (off ? ' disabled aria-disabled="true"' : '') + (o.loading ? ' aria-busy="true"' : '') + '>' +
      (o.loading ? '<i class="pi pi-spin pi-spinner text-current"></i>' : '') +
      (!o.loading && o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '') +
      (o.label ? '<span class="truncate">' + esc(o.label) + '</span>' : '') +
    '</button>';
  };

  // onDateRangePresetChange() — hazır tarih aralıkları
  R5.DATE_PRESETS = [
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
  R5.presetRange = function (preset) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    switch (preset) {
      case 'yesterday': start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); break;
      case 'past_week': start.setDate(now.getDate() - 7); end.setDate(now.getDate() - 1); break;
      case 'month_to_date': start = new Date(now.getFullYear(), now.getMonth(), 1); end.setDate(now.getDate() - 1); break;
      case 'past_month': start.setDate(now.getDate() - 30); end.setDate(now.getDate() - 1); break;
      case 'last_month': start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break;
      case 'year_to_date': start = new Date(now.getFullYear(), 0, 1); end.setDate(now.getDate() - 1); break;
      case 'past_year': start.setDate(now.getDate() - 365); end.setDate(now.getDate() - 1); break;
      case 'last_year': start = new Date(now.getFullYear() - 1, 0, 1); end = new Date(now.getFullYear() - 1, 11, 31); break;
      default: return null;
    }
    return { start: DCIM.ui.fmtDateKey(start), end: DCIM.ui.fmtDateKey(end) };
  };

  const p2 = n => String(n).padStart(2, '0');
  // 'YYYY-MM-DD' yerel gün olarak, diğerleri Date ile çözülür
  R5.toDate = function (v) {
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(v);
  };
  // dd.MM.yyyy HH:mm
  R5.fmtDT = function (v) {
    const d = R5.toDate(v);
    if (isNaN(d.getTime())) return String(v || '');
    return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  };
  R5.fmtD = function (v) {
    const d = R5.toDate(v);
    if (isNaN(d.getTime())) return String(v || '');
    return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear();
  };

  // Chart.js yazı tipi: kit varsayılanı 'inherit' canvas'ta geçersiz olduğundan gövde fontu açıkça verilir
  R5.font = function (size, weight) {
    const f = { family: window.getComputedStyle(document.body).fontFamily || 'sans-serif' };
    if (size) f.size = size;
    if (weight) f.weight = weight;
    return f;
  };

  // Parça parça (chunk) sorgu ilerlemesini taklit eder. onStep(yüzde) her parçada, onDone sonda çağrılır.
  R5.simulateChunks = function (total, onStep, onDone, stepMs) {
    let i = 0;
    let timer = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (i >= total) { onDone(); return; }
      i++;
      onStep(Math.round((i / total) * 100));
      timer = setTimeout(tick, stepMs || 140);
    };
    timer = setTimeout(tick, 60);
    return () => { cancelled = true; clearTimeout(timer); };
  };

  // ---------------------------------------------------------------------------
  // GraphPopupComponent + LineGraphComponent (common/pop-ups/graph-pop-up, common/graphs/line-graph)
  // data: { chartData: [{label, data:[{x,y}], borderColor, backgroundColor}], timeLabels, chartTitle,
  //         pdfTitlePrefix, yAxisLabel, xAxisLabel, yMin, yMax, stepSize, decimalPlaces, tooltipUnit,
  //         xFormat: 'date'|'datetime', fileName }
  // ---------------------------------------------------------------------------
  R5.graphPopup = function (data) {
    const esc = DCIM.ui.esc;
    const kit = DCIM.kit;
    R5.ensureCss();
    const decimals = data.decimalPlaces || 2;
    const unit = data.tooltipUnit || '';
    const fmtX = data.xFormat === 'date' ? R5.fmtD : R5.fmtDT;

    // updateChartData(): etiket yoksa x değerlerini topla ve zamana göre sırala
    let raw = (data.timeLabels || []).slice();
    if (!raw.length) {
      const set = new Set();
      data.chartData.forEach(ds => ds.data.forEach(pt => { if (pt && pt.x != null) set.add(pt.x); }));
      raw = Array.from(set);
    }
    raw.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const labels = raw.map(fmtX);
    const datasets = data.chartData.map(ds => {
      const pts = ds.data.slice().sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime()).map(pt => ({ x: fmtX(pt.x), y: pt.y }));
      return {
        data: pts,
        label: ds.label,
        tension: 0.10,
        borderColor: ds.borderColor,
        backgroundColor: ds.backgroundColor,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 8,
        pointBackgroundColor: ds.borderColor,
        pointHoverBackgroundColor: ds.borderColor,
        pointBorderColor: '#fff',
        pointHoverBorderColor: '#fff',
        pointBorderWidth: 2,
        fill: false,
        spanGaps: ds.spanGaps
      };
    });
    const legendItems = datasets.map(ds => ({ label: ds.label, color: ds.borderColor, hidden: false }));
    const fmtVal = v => { const n = Number(v); return n % 1 === 0 ? String(n) : n.toFixed(decimals); };

    const host = document.createElement('div');
    host.className = 'r5-graph-popup popup-overlay';
    host.innerHTML =
      '<div class="popup-container">' +
        '<div class="popup-header">' +
          '<h3 class="truncate-text">' + esc(data.chartTitle) + '</h3>' +
          '<div class="legend-dropdown-wrapper" data-legend-wrap>' +
            '<button type="button" class="btn-legend-toggle" data-legend-toggle>GÖSTERİM SEÇENEKLERİ <span class="arrow" data-legend-arrow>▼</span></button>' +
            '<div class="legend-dropdown-content" data-legend-list hidden></div>' +
          '</div>' +
          '<div class="popup-actions">' +
            '<button type="button" class="btn btn-pdf" data-gp-pdf>PDF İNDİR</button>' +
            '<button type="button" class="btn btn-excel" data-gp-excel>EXCEL İNDİR</button>' +
            '<button type="button" class="close-button" data-gp-close>×</button>' +
          '</div>' +
        '</div>' +
        '<div class="popup-content"><div class="graph-wrapper"><div style="height: 100%; width: 100%;">' +
          '<div class="chart-container"><div class="chart-area"><canvas></canvas></div></div>' +
        '</div></div></div>' +
      '</div>';
    document.body.appendChild(host);

    const listEl = host.querySelector('[data-legend-list]');
    const renderLegend = () => {
      listEl.innerHTML = legendItems.map((it, i) =>
        '<div class="legend-item" data-legend-idx="' + i + '">' +
          '<span class="color-dot" style="background-color: ' + esc(it.color) + '"></span>' +
          '<span class="item-label' + (it.hidden ? ' disabled' : '') + '">' + esc(it.label) + '</span>' +
          (!it.hidden ? '<span class="check-mark">✓</span>' : '') +
        '</div>').join('');
    };
    renderLegend();

    // Popup beyaz zeminlidir (tema bağımsız) — Chart.js varsayılan #666 metin rengi
    let chart = null;
    const build = () => {
      if (chart) chart.destroy();
      chart = new window.Chart(host.querySelector('canvas'), {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          color: '#666',
          plugins: {
            legend: { display: false },
            title: { display: true, text: data.chartTitle, color: '#666', font: R5.font(12, 'bold') },
            tooltip: {
              enabled: true, mode: 'nearest', intersect: true, titleFont: R5.font(12, 'bold'), bodyFont: R5.font(12),
              callbacks: {
                label: ctx => {
                  let l = ctx.dataset.label ? ctx.dataset.label + ': ' : '';
                  if (ctx.parsed.y !== null) l += fmtVal(ctx.parsed.y) + (unit ? ' ' + unit : '');
                  return l;
                }
              }
            }
          },
          scales: {
            y: {
              min: data.yMin, max: data.yMax,
              title: { display: !!data.yAxisLabel, text: data.yAxisLabel, color: '#666', font: R5.font(12, 'bold') },
              grid: { color: 'rgba(0, 0, 0, 0.1)' },
              ticks: { color: '#666', font: R5.font(12), stepSize: data.stepSize, callback: v => unit ? fmtVal(v) + ' ' + unit : fmtVal(v) }
            },
            x: {
              title: { display: !!data.xAxisLabel, text: data.xAxisLabel, color: '#666', font: R5.font(12, 'bold') },
              grid: { color: 'rgba(0, 0, 0, 0.1)' },
              ticks: { color: '#666', font: R5.font(12), maxRotation: 45 }
            }
          }
        }
      });
      legendItems.forEach((it, i) => { if (it.hidden) chart.setDatasetVisibility(i, false); });
      chart.update();
    };
    build();

    let closed = false;
    const onKey = e => { if (e.key === 'Escape') close(); };
    const onTheme = () => build();
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('dcim:theme', onTheme);
      if (chart) chart.destroy();
      chart = null;
      host.remove();
      if (data.onClose) data.onClose();
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('dcim:theme', onTheme);

    host.addEventListener('click', e => {
      if (e.target === host) { close(); return; }
      const t = e.target;
      if (!t.closest('[data-legend-wrap]') && !listEl.hidden) {
        listEl.hidden = true;
        host.querySelector('[data-legend-arrow]').classList.remove('open');
      }
      if (t.closest('[data-gp-close]')) { close(); return; }
      if (t.closest('[data-legend-toggle]')) {
        listEl.hidden = !listEl.hidden;
        host.querySelector('[data-legend-arrow]').classList.toggle('open', !listEl.hidden);
        return;
      }
      const item = t.closest('[data-legend-idx]');
      if (item) {
        const i = Number(item.getAttribute('data-legend-idx'));
        legendItems[i].hidden = !legendItems[i].hidden;
        chart.setDatasetVisibility(i, !legendItems[i].hidden);
        chart.update();
        renderLegend();
        return;
      }
      if (t.closest('[data-gp-pdf]')) { kit.exportPdf(); return; }
      if (t.closest('[data-gp-excel]')) {
        const cols = [{ header: data.xAxisLabel || 'Zaman', value: r => r.label }].concat(datasets.map((ds, i) => ({
          header: ds.label + (unit ? ' (' + unit + ')' : ''),
          value: r => { const pt = datasets[i].data.find(p => p.x === r.label); return pt && pt.y != null ? pt.y : ''; }
        })));
        const name = String((data.pdfTitlePrefix || '') + data.chartTitle).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9ğüşöçı]+/g, '_');
        kit.exportExcel(data.fileName || name, cols, labels.map(l => ({ label: l })));
      }
    });

    return { close };
  };

  // ===========================================================================
  // KLİMA RAPORU
  // ===========================================================================
  (DCIM.reportRegistry = DCIM.reportRegistry || {})['climate'] = {
    mount(el) {
      const { esc, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const MOCK = DCIM.data.reports.climate;
      R5.ensureCss();

      // messages.tr.json → reportClimate.*
      const T = {
        title: 'KLİMA VERİLERİ RAPORLAMA',
        menuReports: 'Raporlar',
        floorSelection: 'Kat Seçimi:', floorPlaceholder: 'Kat seçin veya yazın...', allFloors: 'Tüm Katlar',
        klimaUnit: 'Klima Ünitesi:', klimaPlaceholder: 'Klima ünitesi seçin...', allKlimas: 'Tüm Klimalar',
        loadingKlimas: 'Klima üniteleri yükleniyor...', noResults: 'Sonuç bulunamadı',
        dataType: 'Veri Tipi:', all: 'Hepsi', select: 'Seçiniz', valueType: 'Değer Türü:',
        reportPeriod: 'Rapor Periyodu:', dateRange: 'Tarih Aralığı', hourly: 'Saatlik',
        date: 'Tarih:', startTime: 'Başlangıç Saati:', endTime: 'Bitiş Saati:',
        quickSelection: 'Hazır Aralıklar:', presetsPlaceholder: 'Aralık seçin...',
        startDate: 'Başlangıç Tarihi:', endDate: 'Bitiş Tarihi:',
        clear: 'Temizle', generating: 'Yükleniyor...', generateReport: 'Rapor Oluştur',
        chartLoading: 'Grafik Yükleniyor...', generateChart: 'Grafik Rapor',
        selectedFloors: '{count} Kat Seçili', selectedKlimas: '{count} Klima Seçildi',
        loadingPleaseWait: 'Lütfen bekleyiniz.',
        popupTitle: 'Filtrelenmiş Klima Verileri', pdfDownload: 'PDF İndir', excelDownload: 'Excel İndir', zipDownload: 'ZIP İndir',
        loadingPreparing: 'Veriler İşleniyor Lütfen Bekleyiniz...',
        colRegion: 'Bölge Adı', colModule: 'Modül Adı', colSensor: 'Sensör Adı', colValue: 'Sensör Değeri', colDate: 'Tarih',
        noData: 'Seçilen kriterlere uygun veri bulunamadı.',
        alertFloor: 'Lütfen en az bir kat seçin.',
        alertUnitType: 'Lütfen en az bir klima ünitesi ve veri tipi seçin.',
        alertHourly: 'Lütfen saatlik rapor için bir tarih seçin.',
        alertDaily: 'Lütfen tarih aralığı için başlangıç ve bitiş tarihi seçin.',
        alertNoChart: 'Grafik için veri bulunamadı.',
        chartX: 'Zaman', chartY: '{type} Değer ({unit})', chartSuffix: 'Grafiği', unitPrefix: 'Klima'
      };
      const fill = (s, p) => Object.keys(p || {}).reduce((a, k) => a.replace('{' + k + '}', p[k]), s);

      const FLOORS = [
        { value: 'CMR/T00', label: '1.Kat', prefix: 'IDC1', floorNo: 1 },
        { value: 'CMR/T02', label: '2.Kat', prefix: 'IDC1', floorNo: 2 },
        { value: 'CMR/T03', label: '3.Kat', prefix: 'IDC1', floorNo: 3 },
        { value: 'CMR/T04', label: 'IDC4', prefix: 'IDC4' }
      ];
      const DATA_TYPES = [
        { value: 'ROOM_AIR_RET_TEMP', label: 'Return Air Temperature' },
        { value: 'SUP_AIR_TEMP', label: 'Supply Air Temperature' },
        { value: 'TEMP_SETTING_POINT', label: 'Temperature Set Point' },
        { value: 'ROOM_AIR_RET_HUMD', label: 'Return Humidity' },
        { value: 'SUP_HUMD', label: 'Supply Humidity' },
        { value: 'HUMD_SETTING_POINT', label: 'Humidity Set Point' }
      ];
      const DT_LABEL = DATA_TYPES.reduce((m, d) => (m[d.value] = d.label, m), {});
      const CALC_TYPES = [{ value: 'Average', label: 'Ortalama' }, { value: 'Minimum', label: 'Minimum' }, { value: 'Maximum', label: 'Maksimum' }];
      const SORT_KEY = { ROOM_AIR_RET_TEMP: 1, SUP_AIR_TEMP: 2, TEMP_SETTING_POINT: 3, ROOM_AIR_RET_HUMD: 4, SUP_HUMD: 5, HUMD_SETTING_POINT: 6 };

      // Sunum açılışı: ?unit=KLM109 derin bağlantısıyla aynı davranış (KLIMA 109 + "Bu Ay")
      const initRange = R5.presetRange('month_to_date');
      const state = {
        selectedFloors: [FLOORS[0]],
        allKlimaList: [], filteredKlimaList: [], selectedKlimas: ['KLM109'],
        selectedDataTypes: DATA_TYPES.map(d => d.value),
        selectedValueType: 'Average',
        reportMode: 'daily',
        filterDate: '', startTime: '00:00:00', endTime: '23:59:59',
        startDate: initRange.start, endDate: initRange.end,
        preset: 'month_to_date',
        dropdown: '',
        isLoadingData: false, isGraphLoading: false, chunkProgress: '', loadingMessage: 'İşlem yapılıyor...',
        showDataPopup: false, popupData: []
      };
      let cancelChunks = null;
      let graph = null;

      // --- Seçim yardımcıları -------------------------------------------------
      const formatUnit = u => u ? u.replace(/KLM/i, T.unitPrefix + ' ') : '';
      const loadClimateOptions = () => {
        const set = new Set();
        state.selectedFloors.forEach(f => MOCK.units(f.value).forEach(u => set.add(u)));
        state.allKlimaList = Array.from(set).sort();
        state.filteredKlimaList = state.allKlimaList.slice();
      };
      const isAllKlimas = () => state.allKlimaList.length > 0 && state.selectedKlimas.length === state.allKlimaList.length;
      const isAllFloors = () => state.selectedFloors.length === FLOORS.length;
      const isAllTypes = () => state.selectedDataTypes.length === DATA_TYPES.length;
      const floorsLabel = () => {
        if (!state.selectedFloors.length) return '';
        if (isAllFloors()) return T.allFloors;
        if (state.selectedFloors.length === 1) return state.selectedFloors[0].label;
        return fill(T.selectedFloors, { count: state.selectedFloors.length });
      };
      const klimasLabel = () => {
        if (!state.selectedKlimas.length) return '';
        if (isAllKlimas()) return T.allKlimas;
        if (state.selectedKlimas.length === 1) return formatUnit(state.selectedKlimas[0]);
        return fill(T.selectedKlimas, { count: state.selectedKlimas.length });
      };
      const dataTypeLabel = () => {
        if (isAllTypes()) return T.all;
        return state.selectedDataTypes.map(v => DT_LABEL[v]).join(', ');
      };
      const calcLabel = () => (CALC_TYPES.find(c => c.value === state.selectedValueType) || {}).label || '';
      const presetLabel = () => (R5.DATE_PRESETS.find(p => p.value === state.preset) || {}).label || '';
      const measureUnit = type => type.indexOf('TEMP') >= 0 ? '°C' : type.indexOf('HUMD') >= 0 ? '%rH' : '';

      // --- Şablon parçaları ---------------------------------------------------
      const DD_CLS = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
      const ALL_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
      const ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
      const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
      const OPT = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
      const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
      const chk = (checked, attrs) => '<input type="checkbox"' + (checked ? ' checked' : '') + ' ' + attrs + ' class="' + CHK + '" />';
      const ddInput = (key, value, placeholder, extra) =>
        '<div class="relative"><input type="text" value="' + esc(value) + '" data-dd-toggle="' + key + '" placeholder="' + esc(placeholder) + '" class="scada-input pr-8 cursor-pointer" autocomplete="off" ' + (extra || 'readonly') + ' />' + CHEVRON + '</div>';

      function unitListHtml() {
        return state.filteredKlimaList.map(u =>
          '<label class="' + ROW + '">' + chk(state.selectedKlimas.indexOf(u) >= 0, 'data-klima="' + esc(u) + '"') + '<span>' + esc(formatUnit(u)) + '</span></label>').join('') +
          (state.allKlimaList.length > 0 && state.filteredKlimaList.length === 0 ? '<div class="p-2 text-center text-xs text-slate-400">' + esc(T.noResults) + '</div>' : '');
      }

      function filtersHtml() {
        const dd = state.dropdown;
        const region =
          '<div class="relative" data-dd="region">' +
            kit.formField({ label: T.floorSelection, control: ddInput('region', floorsLabel(), T.floorPlaceholder, 'id="region-filter" readonly') }) +
            (dd === 'region' ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-52 overflow-y-auto p-1 space-y-0.5">' +
              '<label class="' + ALL_ROW + '">' + chk(isAllFloors(), 'data-all-floors') + '<span>' + esc(T.allFloors) + '</span></label>' +
              FLOORS.map(f => '<label class="' + ROW + '">' + chk(state.selectedFloors.some(s => s.value === f.value), 'data-floor="' + esc(f.value) + '"') + '<span>' + esc(f.label) + '</span></label>').join('') +
            '</div>' : '') +
          '</div>';
        const unit =
          '<div class="relative" data-dd="unit">' +
            kit.formField({ label: T.klimaUnit, control: ddInput('unit', klimasLabel(), T.klimaPlaceholder, 'id="unit-filter" data-unit-search') }) +
            (dd === 'unit' ? '<div class="' + DD_CLS + '">' +
              '<label class="' + ALL_ROW + '">' + chk(isAllKlimas(), 'data-all-klimas') + '<span>' + esc(T.allKlimas) + '</span></label>' +
              '<div data-unit-list>' + unitListHtml() + '</div>' +
            '</div>' : '') +
          '</div>';
        const dataType =
          '<div class="relative" data-dd="dataType">' +
            kit.formField({ label: T.dataType, control: ddInput('dataType', dataTypeLabel(), T.select) }) +
            (dd === 'dataType' ? '<div class="' + DD_CLS + '">' +
              '<label class="' + ALL_ROW + '">' + chk(isAllTypes(), 'data-all-types') + '<span>' + esc(T.all) + '</span></label>' +
              DATA_TYPES.map(t => '<label class="' + ROW + '">' + chk(state.selectedDataTypes.indexOf(t.value) >= 0, 'data-dtype="' + t.value + '"') + '<span>' + esc(t.label) + '</span></label>').join('') +
            '</div>' : '') +
          '</div>';
        const calc =
          '<div class="relative" data-dd="calcType">' +
            kit.formField({ label: T.valueType, control: ddInput('calcType', calcLabel(), T.select) }) +
            (dd === 'calcType' ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5">' +
              CALC_TYPES.map(c => '<div data-calc="' + c.value + '" class="' + OPT + '">' + esc(c.label) + '</div>').join('') +
            '</div>' : '') +
          '</div>';
        const period =
          '<div class="space-y-1.5">' +
            '<label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(T.reportPeriod) + '</label>' +
            '<div class="flex items-center gap-4 pt-1.5">' +
              '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"><input type="radio" name="clm-mode" id="mode-daily" value="daily" data-mode' + (state.reportMode === 'daily' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.dateRange) + '</span></label>' +
              '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"><input type="radio" name="clm-mode" id="mode-hourly" value="hourly" data-mode' + (state.reportMode === 'hourly' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.hourly) + '</span></label>' +
            '</div>' +
          '</div>';
        let dates;
        if (state.reportMode === 'hourly') {
          dates =
            kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-field="filterDate" value="' + esc(state.filterDate) + '" class="scada-input" />' }) +
            kit.formField({ label: T.startTime, control: '<input type="time" id="start-time" step="1" data-field="startTime" value="' + esc(state.startTime) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endTime, control: '<input type="time" id="end-time" step="1" data-field="endTime" value="' + esc(state.endTime) + '" class="scada-input" />' });
        } else {
          dates =
            '<div class="relative" data-dd="preset">' +
              kit.formField({ label: T.quickSelection, control: ddInput('preset', presetLabel(), T.presetsPlaceholder) }) +
              (dd === 'preset' ? '<div class="' + DD_CLS + '">' +
                R5.DATE_PRESETS.map(p => '<div data-preset="' + p.value + '" class="' + OPT + '">' + esc(p.label) + '</div>').join('') +
              '</div>' : '') +
            '</div>' +
            kit.formField({ label: T.startDate, control: '<input type="date" id="start-date" data-field="startDate" value="' + esc(state.startDate) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endDate, control: '<input type="date" id="end-date" data-field="endDate" value="' + esc(state.endDate) + '" class="scada-input" />' });
        }
        return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">' + region + unit + dataType + calc + period + dates + '</div>';
      }

      function mainHtml() {
        const noKlima = state.selectedKlimas.length === 0;
        const actions =
          R5.button({ variant: 'primary', icon: 'pi pi-file', label: state.isLoadingData ? T.generating : T.generateReport, loading: state.isLoadingData, disabled: noKlima || state.isLoadingData, attrs: 'data-act="report"' }) +
          R5.button({ variant: 'primary', icon: 'pi pi-chart-line', label: state.isGraphLoading ? T.chartLoading : T.generateChart, loading: state.isGraphLoading, disabled: noKlima || state.isLoadingData || state.isGraphLoading, attrs: 'data-act="chart"' });
        return kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.menuReports }, { label: T.title }], actions }) +
          kit.card({ title: T.title, icon: 'pi pi-filter', body: filtersHtml() });
      }

      function progressBar(wrapCls) {
        return '<div class="' + wrapCls + '"><div class="bg-sky-500 h-full transition-all duration-300" style="width: ' + parseInt(state.chunkProgress.replace('%', ''), 10) + '%"></div></div>';
      }

      function overlayHtml() {
        if (!state.isGraphLoading) return '';
        return '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center">' +
          '<div class="bg-surface-card border border-border-muted p-6 rounded-[2px] shadow-2xl flex flex-col items-center max-w-md w-full mx-4">' +
            '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-white font-medium text-sm mb-2">' + esc(state.loadingMessage) + '</p>' +
            (state.chunkProgress ? progressBar('w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-2') + '<span class="text-xs text-sky-300 font-mono">' + esc(state.chunkProgress) + '</span>' : '') +
            '<p class="text-slate-400 text-xs mt-2">' + esc(T.loadingPleaseWait) + '</p>' +
          '</div></div>';
      }

      const hasData = () => state.popupData.length > 0 && state.popupData.some(g => g.result && g.result.length > 0);

      function popupHtml() {
        if (!state.showDataPopup) return '';
        const off = !hasData();
        let body;
        if (state.isLoadingData) {
          body = '<div class="flex flex-col items-center justify-center py-12">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 text-3xl mb-3"></i>' +
            '<p class="text-sm text-slate-600 dark:text-slate-300 font-medium">' + esc(T.loadingPreparing) + '</p>' +
            (state.chunkProgress ? progressBar('w-64 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden mt-3') + '<p class="text-xs text-sky-500 font-mono mt-1">' + esc(state.chunkProgress) + '</p>' : '') +
          '</div>';
        } else if (!off) {
          body = '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
            '<table class="w-full text-xs text-left text-slate-700 dark:text-slate-300">' +
              '<thead class="bg-slate-100 dark:bg-surface-panel text-slate-800 dark:text-slate-200 uppercase font-semibold text-[11px] border-b border-slate-200 dark:border-border-subtle"><tr>' +
                [T.colRegion, T.colModule, T.colSensor, T.colValue, T.colDate].map(h => '<th class="px-3 py-2.5">' + esc(h) + '</th>').join('') +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
                state.popupData.map(g => g.result.map(it =>
                  '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50">' +
                    '<td class="px-3 py-2 font-medium">' + esc(it.region) + '</td>' +
                    '<td class="px-3 py-2">' + esc(it.unit) + '</td>' +
                    '<td class="px-3 py-2">' + esc(DT_LABEL[it.dataTypeKey] || it.dataTypeKey) + '</td>' +
                    '<td class="px-3 py-2 font-mono font-semibold text-sky-600 dark:text-sky-400">' + esc(it.value) + ' ' + esc(it.measureUnit) + '</td>' +
                    '<td class="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono">' + esc(R5.fmtDT(it.date)) + '</td>' +
                  '</tr>').join('')).join('') +
              '</tbody></table></div>';
        } else {
          body = kit.emptyState({ icon: 'pi pi-inbox', message: T.noData });
        }
        return '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4" data-popup-backdrop>' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">' +
            '<div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel">' +
              '<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-table text-sky-500"></i><span>' + esc(T.popupTitle) + '</span></h3>' +
              '<div class="flex items-center gap-2">' +
                R5.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.pdfDownload, disabled: off, attrs: 'data-act="pdf"' }) +
                R5.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.excelDownload, disabled: off, attrs: 'data-act="excel"' }) +
                R5.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: T.zipDownload, disabled: off, attrs: 'data-act="zip"' }) +
                '<button type="button" data-act="close-popup" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded transition-colors"><i class="pi pi-times text-base"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="p-4 overflow-y-auto flex-1 space-y-4">' + body + '</div>' +
          '</div></div>';
      }

      // Kök: <div class="space-y-4"> (başlık + filtre kartı); yükleme katmanı ve pencere sabit konumludur
      el.innerHTML = '<div class="space-y-4" data-main></div><div data-overlay></div><div data-popup></div>';
      const mainEl = el.querySelector('[data-main]');
      const overlayEl = el.querySelector('[data-overlay]');
      const popupEl = el.querySelector('[data-popup]');
      const render = () => { mainEl.innerHTML = mainHtml(); };
      const renderPopup = () => { popupEl.innerHTML = popupHtml(); overlayEl.innerHTML = overlayHtml(); };

      // --- İş mantığı ----------------------------------------------------------
      function validate() {
        if (!state.selectedFloors.length) { toast(T.alertFloor, 'warning'); return false; }
        if (!state.selectedKlimas.length || !state.selectedDataTypes.length) { toast(T.alertUnitType, 'warning'); return false; }
        if (state.reportMode === 'hourly' && !state.filterDate) { toast(T.alertHourly, 'warning'); return false; }
        if (state.reportMode === 'daily' && (!state.startDate || !state.endDate)) { toast(T.alertDaily, 'warning'); return false; }
        return true;
      }
      const floorOfUnit = unit => {
        const d = (unit.match(/KLM[A-Z]?(\d)/i) || [])[1];
        return FLOORS.find(f => f.floorNo === Number(d)) || (d === '4' ? FLOORS[3] : null);
      };
      function query() {
        return MOCK.query({
          floors: state.selectedFloors.map(f => f.value), units: state.selectedKlimas, dataTypes: state.selectedDataTypes,
          calc: state.selectedValueType, mode: state.reportMode, filterDate: state.filterDate, startTime: state.startTime,
          endTime: state.endTime, startDate: state.startDate, endDate: state.endDate
        });
      }
      const ridCount = () => new Set(state.selectedFloors.map(f => f.prefix)).size * state.selectedKlimas.length * state.selectedDataTypes.length;

      // processClimateData()
      function processClimateData(raw) {
        const rows = raw.map(item => {
          const parts = item.rid.split('_');
          const klima = parts.find(p => p.indexOf('KLM') === 0) || '';
          const type = parts.slice(2).join('_');
          const fl = floorOfUnit(klima);
          const date = item.tim || item.period;
          return {
            region: fl ? fl.label : floorsLabel(), unit: formatUnit(klima) || 'N/A', dataTypeKey: type,
            value: Number(item.result).toFixed(2), measureUnit: measureUnit(type), date,
            k: klima, s: SORT_KEY[type] || 8, ts: new Date(date).getTime()
          };
        });
        rows.sort((a, b) => a.k.localeCompare(b.k, undefined, { numeric: true, sensitivity: 'base' }) || a.ts - b.ts || a.s - b.s);
        state.popupData = [{ sensor_group: dataTypeLabel(), result: rows }];
      }

      function applyFilters() {
        if (!validate()) return;
        if (cancelChunks) cancelChunks();
        state.isLoadingData = true;
        state.showDataPopup = true;
        state.popupData = [];
        state.chunkProgress = '%0';
        render(); renderPopup();
        const total = Math.max(1, Math.ceil(ridCount() / 15));
        cancelChunks = R5.simulateChunks(total, pct => {
          state.chunkProgress = '%' + pct;
          state.loadingMessage = T.loadingPreparing + ' (%' + pct + ')';
          renderPopup();
        }, () => {
          cancelChunks = null;
          processClimateData(query());
          state.isLoadingData = false;
          state.chunkProgress = '';
          render(); renderPopup();
        });
      }

      // generateChartReport() + formatDataForChart()
      function generateChart() {
        if (!validate()) return;
        if (cancelChunks) cancelChunks();
        state.isGraphLoading = true;
        state.loadingMessage = T.chartLoading;
        render(); renderPopup();
        const total = Math.max(1, Math.ceil(ridCount() / 15));
        cancelChunks = R5.simulateChunks(total, () => {}, () => {
          cancelChunks = null;
          state.isGraphLoading = false;
          state.loadingMessage = 'İşlem yapılıyor...';
          render(); renderPopup();
          const raw = query();
          if (!raw.length) { toast(T.alertNoChart, 'warning'); return; }
          const groups = {};
          raw.forEach(it => {
            const v = parseFloat(it.result);
            (groups[it.rid] = groups[it.rid] || []).push({ x: it.tim || it.period, y: v === 0 ? null : v });
          });
          const keys = Object.keys(groups);
          const datasets = keys.map((rid, i) => {
            const parts = rid.split('_');
            const klima = parts.find(p => p.indexOf('KLM') === 0) || rid;
            const color = 'hsl(' + ((i * 137.508) % 360) + ', 70%, 50%)';
            return { label: formatUnit(klima) + ' - ' + (DT_LABEL[parts.slice(2).join('_')] || parts.slice(2).join('_')), data: groups[rid], borderColor: color, backgroundColor: color, spanGaps: false };
          });
          const vals = raw.map(d => parseFloat(d.result)).filter(v => !isNaN(v) && v !== 0);
          const minV = vals.length ? Math.min.apply(null, vals) : 0;
          const maxV = vals.length ? Math.max.apply(null, vals) : 100;
          const padding = (maxV - minV) * 0.1 || 5;
          const units = new Set(raw.map(d => measureUnit(d.rid.split('_').slice(2).join('_'))).filter(Boolean));
          const unit = units.size === 1 ? Array.from(units)[0] : 'Çoklu';
          if (graph) graph.close();
          graph = R5.graphPopup({
            chartData: datasets, timeLabels: [],
            chartTitle: dataTypeLabel() + ' ' + T.chartSuffix,
            pdfTitlePrefix: T.unitPrefix + ' ',
            yAxisLabel: fill(T.chartY, { type: calcLabel(), unit }),
            xAxisLabel: T.chartX,
            yMin: Math.floor(minV - padding), yMax: Math.ceil(maxV + padding),
            stepSize: parseFloat(((maxV - minV) / 10).toFixed(1)) || 1,
            decimalPlaces: 2, tooltipUnit: unit,
            xFormat: state.reportMode === 'hourly' ? 'datetime' : 'date',
            fileName: 'klima_grafik_raporu',
            onClose: () => { graph = null; }
          });
        }, 110);
      }

      function closeDataPopup() {
        if (cancelChunks) { cancelChunks(); cancelChunks = null; }
        state.showDataPopup = false;
        state.isLoadingData = false;
        state.chunkProgress = '';
        state.popupData = [];
        // Orijinal davranış: pencere kapanınca tarih filtreleri sıfırlanır
        state.filterDate = ''; state.startDate = ''; state.endDate = ''; state.preset = 'custom';
        render(); renderPopup();
      }

      function clearFilters() {
        state.selectedFloors = [FLOORS[0]];
        state.selectedDataTypes = DATA_TYPES.map(d => d.value);
        state.selectedValueType = 'Average';
        state.reportMode = 'daily';
        state.filterDate = ''; state.startTime = '00:00:00'; state.endTime = '23:59:59';
        state.startDate = ''; state.endDate = '';
        state.selectedKlimas = [];
        state.preset = 'custom';
        state.dropdown = '';
        loadClimateOptions();
        render();
      }

      const excelColumns = [
        { header: T.colRegion, value: r => r.region },
        { header: T.colModule, value: r => r.unit },
        { header: T.colSensor, value: r => DT_LABEL[r.dataTypeKey] || r.dataTypeKey },
        { header: T.colValue, value: r => r.value + ' ' + r.measureUnit },
        { header: T.colDate, value: r => R5.fmtDT(r.date) }
      ];
      const allRows = () => state.popupData.reduce((a, g) => a.concat(g.result), []);

      // --- Olaylar ------------------------------------------------------------
      function onClick(e) {
        const t = e.target;
        if (t.hasAttribute('data-popup-backdrop')) { closeDataPopup(); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
          const a = act.getAttribute('data-act');
          if (a === 'clear') clearFilters();
          else if (a === 'report') applyFilters();
          else if (a === 'chart') generateChart();
          else if (a === 'close-popup') closeDataPopup();
          else if (a === 'pdf') kit.exportPdf();
          else if (a === 'excel') kit.exportExcel('klima_veri_raporu', excelColumns, allRows());
          else if (a === 'zip') { kit.exportExcel('klima_veri_raporu_' + DCIM.ui.fmtDateKey(new Date()), excelColumns, allRows()); kit.exportPdf(); }
          return;
        }
        const tog = t.closest('[data-dd-toggle]');
        if (tog) {
          const key = tog.getAttribute('data-dd-toggle');
          // Klima arama kutusu açıkken tıklama kapatmasın (yazmaya devam edilebilsin)
          if (key === 'unit' && state.dropdown === 'unit') return;
          state.dropdown = state.dropdown === key ? '' : key;
          render();
          if (key === 'unit' && state.dropdown === 'unit') {
            const inp = mainEl.querySelector('[data-unit-search]');
            if (inp) { inp.focus(); inp.select(); }
          }
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
        if (t.hasAttribute('data-all-floors')) {
          state.selectedFloors = t.checked ? FLOORS.slice() : [FLOORS[0]];
          loadClimateOptions(); render(); return;
        }
        if (t.hasAttribute('data-floor')) {
          const v = t.getAttribute('data-floor');
          const f = FLOORS.find(x => x.value === v);
          state.selectedFloors = state.selectedFloors.some(s => s.value === v) ? state.selectedFloors.filter(s => s.value !== v) : state.selectedFloors.concat([f]);
          if (!state.selectedFloors.length) state.selectedFloors = [FLOORS[0]];
          state.selectedFloors.sort((a, b) => FLOORS.indexOf(a) - FLOORS.indexOf(b));
          loadClimateOptions(); render(); return;
        }
        if (t.hasAttribute('data-all-klimas')) { state.selectedKlimas = t.checked ? state.allKlimaList.slice() : []; render(); return; }
        if (t.hasAttribute('data-klima')) {
          const u = t.getAttribute('data-klima');
          if (t.checked) { if (state.selectedKlimas.indexOf(u) < 0) state.selectedKlimas.push(u); } else state.selectedKlimas = state.selectedKlimas.filter(x => x !== u);
          render(); return;
        }
        if (t.hasAttribute('data-all-types')) { state.selectedDataTypes = t.checked ? DATA_TYPES.map(d => d.value) : []; render(); return; }
        if (t.hasAttribute('data-dtype')) {
          const v = t.getAttribute('data-dtype');
          if (t.checked) { if (state.selectedDataTypes.indexOf(v) < 0) state.selectedDataTypes.push(v); } else state.selectedDataTypes = state.selectedDataTypes.filter(x => x !== v);
          render(); return;
        }
        if (t.hasAttribute('data-mode')) { state.reportMode = t.value; state.dropdown = ''; render(); return; }
        if (t.hasAttribute('data-field')) { state[t.getAttribute('data-field')] = t.value; render(); }
      }

      // onFilterInput('unit') — yalnızca liste güncellenir (odak korunur)
      function onInput(e) {
        const t = e.target;
        if (!t.hasAttribute('data-unit-search')) return;
        const q = t.value.toLowerCase();
        state.filteredKlimaList = state.allKlimaList.filter(u => u.toLowerCase().indexOf(q) >= 0 || formatUnit(u).toLowerCase().indexOf(q) >= 0);
        const list = mainEl.querySelector('[data-unit-list]');
        if (list) list.innerHTML = unitListHtml();
      }

      // @HostListener('document:click') — açılır menü dışına tıklanınca kapat
      function onDocClick(e) {
        if (!state.dropdown || !document.contains(e.target)) return;
        const box = mainEl.querySelector('[data-dd="' + state.dropdown + '"]');
        if (box && !box.contains(e.target)) {
          state.dropdown = '';
          state.filteredKlimaList = state.allKlimaList.slice();
          render();
        }
      }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);
      document.addEventListener('click', onDocClick);

      loadClimateOptions();
      render();
      renderPopup();

      return {
        destroy() {
          if (cancelChunks) cancelChunks();
          if (graph) graph.close();
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          el.removeEventListener('input', onInput);
          document.removeEventListener('click', onDocClick);
        }
      };
    }
  };
})();
