/* ==========================================================================
   DCIM Sunum — Trafo Raporu (NewUICMPTransformerReportComponent)
   Filtre kartı (bölge, trafo ünitesi, veri tipi, değer türü, rapor periyodu, hazır aralıklar)
   + "Rapor Oluştur" ile açılan sonuç penceresi (tablo, PDF/Excel/ZIP).
   Veri: DCIM.data.reports.trafo (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportTransformer.*
  const DATA_TYPE_OPTIONS = [
    { value: 'PA_CURR,PB_CURR,PC_CURR', label: 'Akım' },
    { value: 'P1VLT,P2VLT,P3VLT', label: 'Voltaj' },
    { value: 'TOT_POW', label: 'Güç' },
    { value: 'TOT_PF', label: 'Toplam Güç Faktörü' },
    { value: 'TOT_APW', label: 'Toplam Görünür Güç' }
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
  const SENSOR_LABEL = {
    TOT_POW: 'Toplam Güç', PA_CURR: 'Faz A Akımı', PB_CURR: 'Faz B Akımı', PC_CURR: 'Faz C Akımı',
    P1VLT: 'Faz1 Voltaj', P2VLT: 'Faz2 Voltaj', P3VLT: 'Faz3 Voltaj', TOT_PF: 'Toplam Güç Faktörü', TOT_APW: 'Toplam Görünür Güç'
  };
  const VALUE_TYPE_LABEL = { Average: 'Ortalama Deger', Minimum: 'Minimum Deger', Maximum: 'Maksimum Deger' };
  const MAX_RENDER_ROWS = 3000;

  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const PANEL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const PANEL_FIT = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5';
  const ROW_ALL = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const ROW_OPT = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const ROW_PICK = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer transition-colors';
  const ROW_EMPTY = 'px-2.5 py-2 text-xs text-slate-400 italic';
  const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const TH = 'p-2.5 border-r border-slate-200 dark:border-border-subtle';

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fmtDM = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

  // onDateRangePresetChange() birebir
  function presetRange(value) {
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
      default: return null;
    }
    return { start: ymd(start), end: ymd(end) };
  }

  // A_TRAFO3_Q1 → "A Trafo3 Q1"
  const formatTrafoDisplay = id => id ? id.replace(/_/g, ' ').replace(/TRAFO/g, 'Trafo') : '';

  // formatValue() birebir (trafo sürümü: kW/W, VA)
  function formatValue(num, sensor) {
    if (!num && num !== 0) return '0';
    if (sensor.indexOf('POW') >= 0) return num >= 1000 ? (num / 1000).toFixed(2) + ' kW' : num.toFixed(2) + ' W';
    if (sensor.indexOf('CURR') >= 0) return num.toFixed(2) + ' A';
    if (sensor.indexOf('VLT') >= 0) return num.toFixed(2) + ' V';
    if (sensor.indexOf('PF') >= 0) return num.toFixed(3);
    if (sensor.indexOf('APW') >= 0) return num.toFixed(2) + ' VA';
    return num.toFixed(2);
  }

  function mount(el) {
    const { esc, button, statusBadge, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.reports.trafo;
    const ALL_TRAFOS = M.units.map(u => u.id).sort();
    const REGION_MAP = {};
    M.units.forEach(u => { REGION_MAP[u.id] = u.region; });
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    // Sunum için hazır seçim: IDC1, A-Trafo3 + B-Trafo1, Akım, Son 7 Gün
    const initialRange = presetRange('past_week');
    const st = {
      region: 'IDC1',
      regionFilter: M.regions.slice(),
      trafos: ['A_TRAFO3_Q1', 'B_TRAFO1_Q3'],
      trafoText: '',
      dataTypes: ['PA_CURR,PB_CURR,PC_CURR'],
      calc: 'Average',
      mode: 'daily',
      filterDate: '',
      startTime: '00:00:00',
      endTime: '23:59:59',
      preset: 'past_week',
      startDate: initialRange.start,
      endDate: initialRange.end,
      open: '',
      loading: false,
      progress: '',
      popup: false,
      rows: []
    };

    // applyRegionFilter + onFilterInput('unit')
    const regionTrafos = () => st.region ? ALL_TRAFOS.filter(t => REGION_MAP[t] === st.region) : [];
    function filteredTrafos() {
      const q = st.trafoText.toLowerCase();
      return regionTrafos().filter(t => !q || t.toLowerCase().indexOf(q) >= 0 || formatTrafoDisplay(t).toLowerCase().indexOf(q) >= 0);
    }
    const isAllSelected = () => { const l = filteredTrafos(); return l.length > 0 && st.trafos.length === l.length; };
    const dataTypeStr = () => st.dataTypes.join(',');

    function trafoLabel() {
      if (!st.trafos.length) return st.trafoText;
      if (isAllSelected()) return 'Tüm Trafolar';
      if (st.trafos.length === 1) return formatTrafoDisplay(st.trafos[0]);
      return st.trafos.length + ' Trafo Seçildi';
    }
    function dataTypeLabel() {
      if (!st.dataTypes.length) return 'Seçiniz...';
      if (st.dataTypes.length === DATA_TYPE_OPTIONS.length) return 'Tümü Seçildi';
      if (st.dataTypes.length === 1) return (DATA_TYPE_OPTIONS.find(o => o.value === st.dataTypes[0]) || { label: 'Seçiniz...' }).label;
      return st.dataTypes.length + ' Veri Tipi Seçildi';
    }
    const calcLabel = () => (CALC_OPTIONS.find(o => o.value === st.calc) || CALC_OPTIONS[0]).label;
    const presetLabel = () => (DATE_PRESETS.find(p => p.value === st.preset) || DATE_PRESETS[0]).label;
    const valueTypeLabel = () => VALUE_TYPE_LABEL[st.calc] || 'Değer';

    // HTML parçaları
    const checkRow = (group, value, label, checked, all) =>
      '<label class="' + (all ? ROW_ALL : ROW_OPT) + '">' +
        '<input type="checkbox" data-check="' + group + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + ' class="' + CHK + '" />' +
        '<span>' + esc(label) + '</span></label>';
    const pickRow = (group, value, label, active) =>
      '<div data-pick="' + group + '" data-value="' + esc(value) + '" class="' + ROW_PICK + (active ? ' bg-sky-500/10' : '') + '">' + esc(label) + '</div>';
    function dropdown(key, label, input, panel) {
      return '<div class="relative" data-dd="' + key + '">' +
        kit.formField({ label, control: '<div class="relative">' + input + CHEVRON + '</div>' }) +
        (st.open === key ? panel : '') + '</div>';
    }

    function renderHeader() {
      const dis = !st.trafos.length || st.loading || !st.region || !dataTypeStr();
      return kit.pageHeader({
        title: 'TRAFO DURUM RAPORLAMA',
        breadcrumbs: [{ label: 'Raporlar' }, { label: 'TRAFO DURUM RAPORLAMA' }],
        actions:
          button({ variant: 'primary', icon: st.loading ? 'pi pi-spin pi-spinner' : 'pi pi-file', label: st.loading ? 'Yükleniyor...' : 'Rapor Oluştur', attrs: 'data-action="generate"' + (dis ? ' disabled' : '') })
      });
    }

    function renderFilters() {
      const regionDd = dropdown('region', 'Bölge Bilgisi:',
        '<input type="text" id="region-filter" data-toggle="region" data-filter-input="region" value="' + esc(st.region) + '" placeholder="Bölge seçin veya yazın..." class="scada-input pr-8 cursor-pointer" autocomplete="off" />',
        '<div class="' + PANEL + '">' +
          st.regionFilter.map(r => pickRow('region', r, r)).join('') +
          (st.regionFilter.length === 0 ? '<div class="' + ROW_EMPTY + '">Sonuç bulunamadı</div>' : '') +
        '</div>');

      const list = filteredTrafos();
      const unitPanel = '<div class="' + PANEL + '">' +
        (!st.region ? '<div class="' + ROW_EMPTY + '">Trafo üniteleri için önce bölge seçin</div>'
          : checkRow('unit', 'ALL', 'Tüm Trafolar', isAllSelected(), true) +
            (ALL_TRAFOS.length === 0 ? '<div class="' + ROW_EMPTY + '">Trafo üniteleri yükleniyor...</div>' : '') +
            list.map(t => checkRow('unit', t, formatTrafoDisplay(t), st.trafos.indexOf(t) >= 0)).join('') +
            (ALL_TRAFOS.length > 0 && list.length === 0 ? '<div class="' + ROW_EMPTY + '">Sonuç bulunamadı</div>' : '')) +
        '</div>';
      const unitDd = dropdown('unit', 'Trafo Ünitesi:',
        '<input type="text" id="unit-filter" data-toggle="unit" data-filter-input="unit" value="' + esc(trafoLabel()) + '" placeholder="' +
          (st.region ? 'Trafo ünitesi seçin veya yazın...' : 'Önce bölge seçin') + '" class="scada-input pr-8 cursor-pointer" autocomplete="off"' + (st.region ? '' : ' disabled') + ' />',
        unitPanel);

      const dataTypeDd = dropdown('dataType', 'Veri Tipi:',
        '<input type="text" id="data-type-selector" data-toggle="dataType" value="' + esc(dataTypeLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly placeholder="Seçiniz..." />',
        '<div class="' + PANEL + '">' + checkRow('dataType', 'ALL', 'Tümü', st.dataTypes.length === DATA_TYPE_OPTIONS.length, true) +
          DATA_TYPE_OPTIONS.map(o => checkRow('dataType', o.value, o.label, st.dataTypes.indexOf(o.value) >= 0)).join('') + '</div>');

      const calcDd = dropdown('calcType', 'Değer Türü:',
        '<input type="text" id="calc-type-selector" data-toggle="calcType" value="' + esc(calcLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly />',
        '<div class="' + PANEL_FIT + '">' + CALC_OPTIONS.map(o => pickRow('calc', o.value, o.label, st.calc === o.value)).join('') + '</div>');

      const radio = (value, label) =>
        '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
          '<input type="radio" name="trafo-mode" data-mode value="' + value + '"' + (st.mode === value ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
          '<span>' + label + '</span></label>';
      const periodBlock =
        '<div class="space-y-1.5">' +
          '<label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">Rapor Periyodu:</label>' +
          '<div class="flex items-center gap-4 pt-2">' + radio('daily', 'Tarih Aralığı') + radio('hourly', 'Saatlik') + '</div>' +
        '</div>';

      let modeBlock;
      if (st.mode === 'hourly') {
        modeBlock =
          kit.formField({ label: 'Tarih:', control: '<input type="date" id="filter-date" data-model="filterDate" value="' + esc(st.filterDate) + '" class="scada-input" />' }) +
          '<div class="grid grid-cols-2 gap-2">' +
            kit.formField({ label: 'Başlangıç Saati:', control: '<input type="time" id="start-time" step="1" data-model="startTime" value="' + esc(st.startTime) + '" class="scada-input" />' }) +
            kit.formField({ label: 'Bitiş Saati:', control: '<input type="time" id="end-time" step="1" data-model="endTime" value="' + esc(st.endTime) + '" class="scada-input" />' }) +
          '</div>';
      } else {
        modeBlock =
          dropdown('preset', 'Hazır Aralıklar:',
            '<input type="text" id="date-preset-selector" data-toggle="preset" value="' + esc(presetLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly />',
            '<div class="' + PANEL + '">' + DATE_PRESETS.map(p => pickRow('preset', p.value, p.label, st.preset === p.value)).join('') + '</div>') +
          kit.formField({ label: 'Başlangıç Tarihi:', control: '<input type="date" id="start-date" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input" />' }) +
          kit.formField({ label: 'Bitiş Tarihi:', control: '<input type="date" id="end-date" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input" />' });
      }

      return kit.card({
        title: 'TRAFO DURUM RAPORLAMA',
        icon: 'pi pi-filter',
        body: '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
          regionDd + unitDd + dataTypeDd + calcDd + periodBlock + modeBlock + '</div>'
      });
    }

    function renderPopup() {
      if (!st.popup) return '';
      const has = st.rows.length > 0;
      const dis = has ? '' : ' disabled';
      let body;
      if (st.loading) {
        const pct = parseInt(String(st.progress).replace('%', ''), 10) || 0;
        body = '<div class="py-16 flex flex-col items-center justify-center text-center">' +
          '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-slate-700 dark:text-slate-200 text-sm font-medium mb-4">Veriler İşleniyor Lütfen Bekleyiniz...</p>' +
          (st.progress ? '<div class="w-full max-w-md space-y-2">' +
            '<div class="w-full bg-slate-100 dark:bg-surface-panel h-2 rounded-[2px] overflow-hidden border border-slate-200 dark:border-border-subtle">' +
              '<div class="bg-sky-500 h-full transition-all duration-300" style="width:' + pct + '%"></div></div>' +
            '<p class="text-slate-500 dark:text-slate-400 text-xs font-mono">' + esc(st.progress) + '</p></div>' : '') +
        '</div>';
      } else if (has) {
        const shown = st.rows.slice(0, MAX_RENDER_ROWS);
        body = '<div><div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
          '<table class="w-full text-xs text-left border-collapse"><thead>' +
            '<tr class="bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-border-subtle">' +
              '<th class="' + TH + '">Bölge</th><th class="' + TH + '">Trafo Ünitesi</th><th class="' + TH + '">Veri Tipi</th>' +
              '<th class="p-2.5 text-right border-r border-slate-200 dark:border-border-subtle">' + esc(valueTypeLabel()) + '</th>' +
              '<th class="p-2.5 text-center">Tarih</th>' +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle font-mono text-[11px]">' +
            shown.map(r =>
              '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors">' +
                '<td class="p-2.5 font-sans font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-border-subtle">' + esc(r.region) + '</td>' +
                '<td class="p-2.5 font-sans text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle">' + esc(formatTrafoDisplay(r.unit)) + '</td>' +
                '<td class="p-2.5 font-sans text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle">' + esc(r.dataType) + '</td>' +
                '<td class="p-2.5 text-right font-bold text-sky-600 dark:text-sky-400 border-r border-slate-200 dark:border-border-subtle">' + esc(r.value) + '</td>' +
                '<td class="p-2.5 text-center text-slate-500 dark:text-slate-400 font-mono text-[10px]">' + esc(fmtDM(r.date)) + '</td>' +
              '</tr>').join('') +
            (st.rows.length > shown.length
              ? '<tr><td colspan="5" class="p-2.5 font-sans text-center text-slate-500 dark:text-slate-400">İlk ' + MAX_RENDER_ROWS + ' / ' + st.rows.length + ' satır gösteriliyor — tamamı için Excel İndir.</td></tr>'
              : '') +
            '</tbody></table></div></div>';
      } else {
        body = kit.emptyState({ message: 'Seçilen kriterlere uygun veri bulunamadı.' });
      }
      return '<div data-popup-backdrop class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4 overflow-y-auto">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden my-auto">' +
          '<div class="p-4 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-surface-panel/50">' +
            '<div class="flex items-center gap-3">' +
              '<h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="pi pi-database text-sky-500 dark:text-sky-400"></i><span>Trafo Rapor Sonucu</span></h3>' +
              statusBadge('info', valueTypeLabel()) +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: 'PDF İndir', attrs: 'data-action="pdf"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: 'Excel İndir', attrs: 'data-action="excel"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: 'ZIP İndir', attrs: 'data-action="zip"' + dis }) +
              '<button type="button" data-action="close" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] transition-colors"><i class="pi pi-times"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="p-4 overflow-y-auto flex-1 space-y-6">' + body + '</div>' +
        '</div></div>';
    }

    // İskelet + render
    el.innerHTML = '<div class="space-y-4"><div data-tr-header></div><div data-tr-filters></div></div><div data-tr-popup></div>';
    const hostHeader = el.querySelector('[data-tr-header]');
    const hostFilters = el.querySelector('[data-tr-filters]');
    const hostPopup = el.querySelector('[data-tr-popup]');

    function render(focusKey) {
      const keys = regionTrafos();
      st.trafos = st.trafos.filter(t => keys.indexOf(t) >= 0);
      hostHeader.innerHTML = renderHeader();
      hostFilters.innerHTML = renderFilters();
      if (focusKey) {
        const inp = hostFilters.querySelector('[data-filter-input="' + focusKey + '"]');
        if (inp && !inp.disabled) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
      }
    }
    function renderLayers() { hostPopup.innerHTML = renderPopup(); }

    // Eylemler
    function toggleGroup(list, value, checked, allValues) {
      if (value === 'ALL') return checked ? allValues.slice() : [];
      if (checked) return list.indexOf(value) >= 0 ? list : list.concat([value]);
      return list.filter(v => v !== value);
    }

    // clearFilters(): varsayılan veri tipi Akım'a döner, bölge/trafo boşalır
    function clearFilters() {
      Object.assign(st, {
        region: '', regionFilter: M.regions.slice(), trafos: [], trafoText: '', dataTypes: ['PA_CURR,PB_CURR,PC_CURR'],
        calc: 'Average', mode: 'daily', filterDate: '', startTime: '00:00:00', endTime: '23:59:59',
        startDate: '', endDate: '', preset: 'custom', open: ''
      });
      render();
    }

    function applyFilters() {
      if (!st.region) { toast('Lütfen önce bir bölge seçin.', 'warning', 'Trafo Raporu'); return; }
      if (!st.trafos.length || !dataTypeStr()) { toast('Lütfen en az bir Trafo ünitesi ve veri tipi seçin.', 'warning', 'Trafo Raporu'); return; }
      if (st.mode === 'hourly' && !st.filterDate) { toast('Lütfen saatlik rapor için bir tarih seçin.', 'warning', 'Trafo Raporu'); return; }
      if (st.mode === 'daily' && (!st.startDate || !st.endDate)) { toast('Lütfen tarih aralığı için başlangıç ve bitiş tarihi seçin.', 'warning', 'Trafo Raporu'); return; }

      const units = st.trafos.map(id => ({ id, region: REGION_MAP[id] || st.region }));
      const sensors = dataTypeStr().split(',').map(s => s.trim()).filter(Boolean);
      const filter = { mode: st.mode, startDate: st.startDate, endDate: st.endDate, filterDate: st.filterDate, startTime: st.startTime, endTime: st.endTime, calc: st.calc };

      st.open = '';
      st.loading = true;
      st.popup = true;
      st.rows = [];
      st.progress = '%0 Başlıyor...';
      render();
      renderLayers();

      const steps = Math.min(5, Math.max(1, Math.ceil(units.length * sensors.length / 15)));
      for (let i = 1; i <= steps; i++) {
        later(() => { st.progress = '%' + Math.round(i / steps * 100) + ' Tamamlandı'; renderLayers(); }, i * 140);
      }
      later(() => {
        st.rows = M.query(units, sensors, filter).map(r => ({
          region: r.region, unit: r.unit, dataType: SENSOR_LABEL[r.sensor] || r.sensor,
          value: formatValue(r.result, r.sensor), date: r.tim
        }));
        st.loading = false;
        st.progress = '';
        render();
        renderLayers();
      }, steps * 140 + 180);
    }

    // closeDataPopup() birebir
    function closePopup() {
      st.popup = false;
      st.rows = [];
      st.filterDate = '';
      st.startDate = '';
      st.endDate = '';
      st.preset = 'custom';
      render();
      renderLayers();
    }

    function excelColumns() {
      return [
        { header: 'Bölge', value: r => r.region },
        { header: 'Trafo Ünitesi', value: r => formatTrafoDisplay(r.unit) },
        { header: 'Veri Tipi', value: r => r.dataType },
        { header: valueTypeLabel(), value: r => r.value },
        { header: 'Tarih', value: r => fmtDM(r.date) }
      ];
    }

    // Olaylar
    function onClick(e) {
      const t = e.target;
      const act = t.closest('[data-action]');
      if (act && !act.disabled) {
        const a = act.getAttribute('data-action');
        if (a === 'clear') clearFilters();
        else if (a === 'generate') applyFilters();
        else if (a === 'close') closePopup();
        else if (a === 'excel') kit.exportExcel('trafo_veri_raporu', excelColumns(), st.rows);
        else if (a === 'pdf') kit.exportPdf();
        else if (a === 'zip') { kit.exportExcel('trafo_veri_raporu', excelColumns(), st.rows); kit.exportPdf(); }
        return;
      }
      if (t.hasAttribute('data-popup-backdrop')) { closePopup(); return; }
      const pick = t.closest('[data-pick]');
      if (pick) {
        const g = pick.getAttribute('data-pick');
        const v = pick.getAttribute('data-value');
        if (g === 'region') { st.region = v; st.regionFilter = M.regions.slice(); }
        if (g === 'calc') st.calc = v;
        if (g === 'preset') {
          st.preset = v;
          const r = presetRange(v);
          if (r) { st.startDate = r.start; st.endDate = r.end; }
        }
        st.open = '';
        render();
        return;
      }
      const tog = t.closest('[data-toggle]');
      if (tog) {
        const key = tog.getAttribute('data-toggle');
        if (key === 'unit' && !st.region) { toast('Trafo üniteleri için önce bölge seçin', 'warning', 'Trafo Raporu'); return; }
        st.open = st.open === key ? '' : key;
        render(st.open === 'region' || st.open === 'unit' ? st.open : '');
      }
    }

    function onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-check')) {
        const g = t.getAttribute('data-check');
        if (g === 'unit') st.trafos = toggleGroup(st.trafos, t.value, t.checked, filteredTrafos());
        else if (g === 'dataType') st.dataTypes = toggleGroup(st.dataTypes, t.value, t.checked, DATA_TYPE_OPTIONS.map(o => o.value));
        render();
        return;
      }
      if (t.hasAttribute('data-mode')) { st.mode = t.value; st.open = ''; render(); return; }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }

    function onInput(e) {
      const t = e.target;
      const key = t.getAttribute('data-filter-input');
      if (key === 'region') {
        st.region = t.value;
        const q = t.value.toLowerCase();
        st.regionFilter = M.regions.filter(r => r.toLowerCase().indexOf(q) >= 0);
        st.open = 'region';
        render('region');
        return;
      }
      if (key === 'unit') {
        if (!st.region) return;
        st.trafoText = st.trafos.length ? t.value.replace(trafoLabel(), '') : t.value;
        st.open = 'unit';
        render('unit');
        return;
      }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }

    function onDocClick(e) {
      if (!st.open) return;
      const box = hostFilters.querySelector('[data-dd="' + st.open + '"]');
      if (box && !box.contains(e.target)) { st.open = ''; render(); }
    }
    function onKey(e) { if (e.key === 'Escape' && st.popup && !st.loading) closePopup(); }

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);

    render();
    renderLayers();

    return {
      destroy() {
        timers.forEach(id => clearTimeout(id));
        timers.clear();
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        el.removeEventListener('input', onInput);
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {}).transformer = { mount };
})();
