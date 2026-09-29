/* ==========================================================================
   DCIM Sunum — SDP Raporu (ReportUpsComponent / ups-report.component)
   Filtre kartı (kat, bölge, SDP, veri tipi, değer türü, rapor periyodu, hazır aralıklar)
   + "Rapor Oluştur" ile açılan sonuç penceresi (tablo, PDF/Excel/ZIP).
   Veri: DCIM.data.reports.sdp (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // ---------------------------------------------------------------------------
  // Sabitler (messages.tr.json → reportSdp.*)
  // ---------------------------------------------------------------------------
  const FLOOR_OPTIONS = [
    { value: 'CMR/T00', label: '1.Kat' },
    { value: 'CMR/T02', label: '2.Kat' },
    { value: 'CMR/T03', label: '3.Kat' },
    { value: 'CMR/T04', label: 'IDC4' }
  ];
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

  // Şablondaki sınıf dizeleri (birebir)
  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const PANEL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const PANEL_FIT = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5';
  const ROW_ALL = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const ROW_OPT = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const ROW_PICK = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer transition-colors';
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

  // KAT1_SAL1 → "Kat 1 Salon 1"
  function formatRegionDisplay(regionId) {
    if (!regionId) return '';
    const m = regionId.match(/KAT(\d+)_SAL(\d+)/);
    if (m) return 'Kat ' + m[1] + ' Salon ' + m[2];
    return regionId.replace(/_/g, ' ');
  }
  // A1_UPS_GIR1 → "Kat 1 Salon 1 - A1 SDP Giriş 1"
  function formatUpsDisplay(region, upsId) {
    if (!upsId) return '';
    const f = upsId.replace(/UPS/g, 'SDP').replace(/_/g, ' ').replace(/GIR(\d+)/g, 'Giriş $1').replace(/CIK(\d+)/g, 'Çıkış $1');
    return region ? formatRegionDisplay(region) + ' - ' + f : f;
  }
  // formatValue() birebir
  function formatValue(num, sensor) {
    if (!num && num !== 0) return '0';
    if (sensor.indexOf('POW') >= 0) return num >= 1000 ? (num / 1000).toFixed(2) : num.toFixed(2);
    if (sensor.indexOf('CURR') >= 0) return num.toFixed(2) + ' A';
    if (sensor.indexOf('VLT') >= 0) return num.toFixed(2) + ' V';
    if (sensor.indexOf('PF') >= 0) return num.toFixed(3);
    if (sensor.indexOf('APW') >= 0) return num >= 1000 ? (num / 1000).toFixed(2) + ' kVA' : num.toFixed(2) + ' VA';
    return num.toFixed(2);
  }

  function mount(el) {
    const { esc, button, statusBadge, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.reports.sdp;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    // Sunum için hazır seçim (URL ?unit=&region= akışı gibi: bölge + SDP + Bu Ay yerine Son 7 Gün)
    const initialRange = presetRange('past_week');
    const st = {
      floors: ['CMR/T00'],
      regions: ['KAT1_SAL1'],
      units: ['KAT1_SAL1|A5_UPS_GIR1', 'KAT1_SAL1|B5_UPS_GIR1'],
      unitText: '',
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

    // ---------------------------------------------------------------------
    // Türetilmiş listeler (loadUpsOptions / applyRegionFilter)
    // ---------------------------------------------------------------------
    function allUnits() {
      const floors = st.floors.length ? st.floors : [FLOOR_OPTIONS[0].value];
      const out = [];
      floors.forEach(f => M.units(f).forEach(u => out.push({ key: u.region + '|' + u.id, id: u.id, region: u.region })));
      return out.sort((a, b) => a.key.localeCompare(b.key, 'tr', { numeric: true }));
    }
    function regionOptions() { return Array.from(new Set(allUnits().map(u => u.region))).sort(); }
    function regionUnits() { return allUnits().filter(u => st.regions.indexOf(u.region) >= 0); }
    function filteredUnits() {
      const q = st.unitText.toLocaleLowerCase('tr-TR');
      return regionUnits().filter(u => !q || formatUpsDisplay(u.region, u.id).toLocaleLowerCase('tr-TR').indexOf(q) >= 0 || u.id.toLowerCase().indexOf(q) >= 0);
    }
    function syncSelections() {
      const regs = regionOptions();
      st.regions = st.regions.filter(r => regs.indexOf(r) >= 0);
      const keys = regionUnits().map(u => u.key);
      st.units = st.units.filter(k => keys.indexOf(k) >= 0);
    }
    const isAllUnits = () => { const l = regionUnits(); return l.length > 0 && st.units.length === l.length; };
    const unitByKey = key => { const p = key.split('|'); return { region: p[0], id: p[1] }; };

    // Etiketler
    function floorLabel() {
      if (st.floors.length === FLOOR_OPTIONS.length) return 'Tümü';
      if (!st.floors.length) return 'Kat seçiniz';
      return st.floors.map(v => (FLOOR_OPTIONS.find(o => o.value === v) || { label: v }).label).join(', ');
    }
    function regionLabel() {
      const regs = regionOptions();
      if (regs.length && st.regions.length === regs.length) return 'Tüm Bölgeler';
      if (!st.regions.length) return 'Bölge seçin';
      if (st.regions.length === 1) return formatRegionDisplay(st.regions[0]);
      return st.regions.length + ' Bölge Seçildi';
    }
    function unitLabel() {
      if (!st.units.length) return st.unitText;
      if (isAllUnits()) return 'Tüm SDPler';
      if (st.units.length === 1) { const u = unitByKey(st.units[0]); return formatUpsDisplay(u.region, u.id); }
      return st.units.length + ' SDP Seçildi';
    }
    function dataTypeLabel() {
      if (!st.dataTypes.length) return 'Seçiniz';
      if (st.dataTypes.length === DATA_TYPE_OPTIONS.length) return 'Tümü Seçildi';
      if (st.dataTypes.length === 1) return (DATA_TYPE_OPTIONS.find(o => o.value === st.dataTypes[0]) || { label: st.dataTypes[0] }).label;
      return st.dataTypes.length + ' Veri Tipi Seçildi';
    }
    const calcLabel = () => (CALC_OPTIONS.find(o => o.value === st.calc) || { label: 'Seçiniz' }).label;
    const presetLabel = () => (DATE_PRESETS.find(p => p.value === st.preset) || DATE_PRESETS[0]).label;

    // ---------------------------------------------------------------------
    // HTML parçaları
    // ---------------------------------------------------------------------
    const checkRow = (group, value, label, checked, all) =>
      '<label class="' + (all ? ROW_ALL : ROW_OPT) + '">' +
        '<input type="checkbox" data-check="' + group + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + ' class="' + CHK + '" />' +
        '<span>' + esc(label) + '</span></label>';
    const pickRow = (group, value, label) => '<div data-pick="' + group + '" data-value="' + esc(value) + '" class="' + ROW_PICK + '">' + esc(label) + '</div>';

    function dropdown(key, label, input, panel) {
      return '<div class="relative" data-dd="' + key + '">' +
        kit.formField({ label, control: '<div class="relative">' + input + CHEVRON + '</div>' }) +
        (st.open === key ? panel : '') + '</div>';
    }
    const roInput = (key, value, placeholder, extra) =>
      '<input type="text" data-toggle="' + key + '" class="scada-input pr-8 cursor-pointer" readonly value="' + esc(value) + '" placeholder="' + esc(placeholder) + '"' + (extra || '') + ' />';

    function renderHeader() {
      const genLabel = st.loading ? 'Yükleniyor...' : 'Rapor Oluştur';
      return kit.pageHeader({
        title: 'SDP DURUM RAPORLAMA',
        breadcrumbs: [{ label: 'Raporlar' }, { label: 'SDP DURUM RAPORLAMA' }],
        actions:
          button({ variant: 'primary', icon: st.loading ? 'pi pi-spin pi-spinner' : 'pi pi-file', label: genLabel, attrs: 'data-action="generate"' + (!st.units.length || st.loading ? ' disabled' : '') })
      });
    }

    function renderFilters() {
      const regs = regionOptions();
      const units = filteredUnits();
      const noRegion = st.regions.length === 0;

      const floorDd = dropdown('floor', 'Kat Seçimi:', roInput('floor', floorLabel(), 'Kat seçiniz'),
        '<div class="' + PANEL + '">' + checkRow('floor', 'ALL', 'Tümü', st.floors.length === FLOOR_OPTIONS.length, true) +
          FLOOR_OPTIONS.map(f => checkRow('floor', f.value, f.label, st.floors.indexOf(f.value) >= 0)).join('') + '</div>');

      const regionDd = dropdown('region', 'Bölge Bilgisi:', roInput('region', regionLabel(), 'Bölge seçin', ' id="region-filter" autocomplete="off"'),
        '<div class="' + PANEL + '">' + checkRow('region', 'ALL', 'Tümü', regs.length > 0 && st.regions.length === regs.length, true) +
          regs.map(r => checkRow('region', r, formatRegionDisplay(r), st.regions.indexOf(r) >= 0)).join('') + '</div>');

      const unitInput = '<input type="text" id="unit-filter" data-toggle="unit" data-filter-input="unit" value="' + esc(unitLabel()) + '"' +
        ' placeholder="' + (noRegion ? 'Önce bölge seçin' : 'SDP seçin veya yazın...') + '" class="scada-input pr-8" autocomplete="off"' + (noRegion ? ' disabled' : '') + ' />';
      const unitDd = dropdown('unit', 'SDP:', unitInput,
        '<div class="' + PANEL + '">' + checkRow('unit', 'ALL', 'Tüm SDPler', isAllUnits(), true) +
          units.map(u => checkRow('unit', u.key, formatUpsDisplay(u.region, u.id), st.units.indexOf(u.key) >= 0)).join('') + '</div>');

      const dataTypeDd = dropdown('dataType', 'Veri Tipi:', roInput('dataType', dataTypeLabel(), 'Veri tipi seçin...', ' id="data-type-filter"'),
        '<div class="' + PANEL + '">' + checkRow('dataType', 'ALL', 'Tümü', st.dataTypes.length === DATA_TYPE_OPTIONS.length, true) +
          DATA_TYPE_OPTIONS.map(o => checkRow('dataType', o.value, o.label, st.dataTypes.indexOf(o.value) >= 0)).join('') + '</div>');

      const calcDd = dropdown('calcType', 'Değer Türü:', roInput('calcType', calcLabel(), 'Hesaplama tipi seçin...', ' id="calc-type"'),
        '<div class="' + PANEL_FIT + '">' + CALC_OPTIONS.map(o => pickRow('calc', o.value, o.label)).join('') + '</div>');

      const radio = (value, label) =>
        '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
          '<input type="radio" name="sdp-mode" data-mode value="' + value + '"' + (st.mode === value ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
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
          dropdown('datePreset', 'Hazır Aralıklar:', roInput('datePreset', presetLabel(), 'Aralık seçin...', ' id="date-preset"'),
            '<div class="' + PANEL + '">' + DATE_PRESETS.map(p => pickRow('preset', p.value, p.label)).join('') + '</div>') +
          '<div class="grid grid-cols-2 gap-2">' +
            kit.formField({ label: 'Başlangıç Tarihi:', control: '<input type="date" id="start-date" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input" />' }) +
            kit.formField({ label: 'Bitiş Tarihi:', control: '<input type="date" id="end-date" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input" />' }) +
          '</div>';
      }

      return kit.card({
        title: 'SDP DURUM RAPORLAMA',
        icon: 'pi pi-filter',
        body: '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
          floorDd + regionDd + unitDd + dataTypeDd + calcDd + periodBlock + modeBlock + '</div>'
      });
    }

    function renderOverlay() {
      if (!st.loading) return '';
      return '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center">' +
        '<div class="bg-surface-card border border-border-muted p-6 rounded-[2px] shadow-2xl flex flex-col items-center max-w-md w-full mx-4 text-center">' +
          '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-white font-medium text-sm mb-1">SDP Raporu Hazırlanıyor...</p>' +
          '<p class="text-slate-400 text-xs">Lütfen bekleyin...</p>' +
        '</div></div>';
    }

    function renderPopup() {
      if (!st.popup) return '';
      const has = st.rows.length > 0;
      const dis = has ? '' : ' disabled';
      let body;
      if (st.loading) {
        const pct = parseInt(String(st.progress).replace('%', ''), 10) || 0;
        body = '<div class="py-12 flex flex-col items-center justify-center text-center">' +
          '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-slate-700 dark:text-slate-200 text-sm font-medium mb-3">Veriler İşleniyor Lütfen Bekleyiniz...</p>' +
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
              '<th class="' + TH + '">Bölge</th><th class="' + TH + '">SDP</th><th class="' + TH + '">Veri Tipi</th>' +
              '<th class="' + TH + '">' + esc(calcLabel()) + '</th><th class="p-2.5">Tarih</th>' +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle font-mono text-[11px]">' +
            shown.map(r =>
              '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors text-slate-800 dark:text-slate-200">' +
                '<td class="p-2.5 font-sans border-r border-slate-200 dark:border-border-subtle">' + esc(formatRegionDisplay(r.region)) + '</td>' +
                '<td class="p-2.5 font-sans border-r border-slate-200 dark:border-border-subtle">' + esc(formatUpsDisplay(r.region, r.unit)) + '</td>' +
                '<td class="p-2.5 border-r border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300">' + esc(r.dataType) + '</td>' +
                '<td class="p-2.5 border-r border-slate-200 dark:border-border-subtle font-bold text-sky-600 dark:text-sky-400">' + esc(r.value) + '</td>' +
                '<td class="p-2.5 text-slate-500 dark:text-slate-400">' + esc(fmtDM(r.date)) + '</td>' +
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
              '<h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="pi pi-server text-sky-500 dark:text-sky-400"></i><span>Filtrelenmiş SDP Verileri</span></h3>' +
              statusBadge('info', calcLabel()) +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: 'PDF İndir', attrs: 'data-action="pdf"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: 'Excel İndir', attrs: 'data-action="excel"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: 'ZIP İndir', attrs: 'data-action="zip"' + dis }) +
              '<button type="button" data-action="close" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] transition-colors"><i class="pi pi-times"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="p-4 overflow-y-auto flex-1 space-y-4">' + body + '</div>' +
        '</div></div>';
    }

    // ---------------------------------------------------------------------
    // İskelet + render
    // ---------------------------------------------------------------------
    el.innerHTML = '<div class="space-y-4"><div data-sdp-header></div><div data-sdp-filters></div></div><div data-sdp-overlay></div><div data-sdp-popup></div>';
    const hostHeader = el.querySelector('[data-sdp-header]');
    const hostFilters = el.querySelector('[data-sdp-filters]');
    const hostOverlay = el.querySelector('[data-sdp-overlay]');
    const hostPopup = el.querySelector('[data-sdp-popup]');

    function render(focusUnit) {
      syncSelections();
      hostHeader.innerHTML = renderHeader();
      hostFilters.innerHTML = renderFilters();
      if (focusUnit) {
        const inp = hostFilters.querySelector('[data-filter-input="unit"]');
        if (inp && !inp.disabled) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
      }
    }
    function renderLayers() {
      hostOverlay.innerHTML = renderOverlay();
      hostPopup.innerHTML = renderPopup();
      const scroller = hostPopup.querySelector('.overflow-y-auto.flex-1');
      if (scroller) scroller.scrollTop = 0;
    }

    // ---------------------------------------------------------------------
    // Eylemler
    // ---------------------------------------------------------------------
    function toggleGroup(list, value, checked, allValues) {
      if (value === 'ALL') return checked ? allValues.slice() : [];
      if (checked) return list.indexOf(value) >= 0 ? list : list.concat([value]);
      return list.filter(v => v !== value);
    }

    function clearFilters() {
      Object.assign(st, {
        floors: [FLOOR_OPTIONS[0].value], regions: [], units: [], unitText: '', dataTypes: [], calc: 'Average', mode: 'daily',
        filterDate: '', startTime: '00:00:00', endTime: '23:59:59', startDate: '', endDate: '', preset: 'custom', open: ''
      });
      render();
    }

    function applyFilters() {
      if (!st.regions.length) { toast('Lütfen en az bir bölge seçin.', 'warning', 'SDP Raporu'); return; }
      if (!st.units.length || !st.dataTypes.length) { toast('Lütfen en az bir UPS ve veri tipi seçin.', 'warning', 'SDP Raporu'); return; }
      if (st.mode === 'hourly' && !st.filterDate) { toast('Lütfen saatlik rapor için bir tarih seçin.', 'warning', 'SDP Raporu'); return; }
      if (st.mode === 'daily' && (!st.startDate || !st.endDate)) { toast('Lütfen tarih aralığı için başlangıç ve bitiş tarihi seçin.', 'warning', 'SDP Raporu'); return; }

      const units = st.units.map(unitByKey);
      const sensors = st.dataTypes.join(',').split(',').map(s => s.trim()).filter(Boolean);
      const filter = { mode: st.mode, startDate: st.startDate, endDate: st.endDate, filterDate: st.filterDate, startTime: st.startTime, endTime: st.endTime, calc: st.calc };

      st.open = '';
      st.loading = true;
      st.popup = true;
      st.rows = [];
      st.progress = '%0 Başlıyor...';
      render();
      renderLayers();

      // 15'lik RID parçaları halinde sorgulanıyormuş gibi ilerleme
      const chunks = Math.max(1, Math.ceil(units.length * sensors.length / 15));
      const steps = Math.min(chunks, 5);
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

    // closeDataPopup() birebir: tarih alanları ve hazır aralık sıfırlanır
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
        { header: 'Bölge', value: r => formatRegionDisplay(r.region) },
        { header: 'SDP', value: r => formatUpsDisplay(r.region, r.unit) },
        { header: 'Veri Tipi', value: r => r.dataType },
        { header: VALUE_TYPE_LABEL[st.calc] || 'Değer', value: r => r.value },
        { header: 'Tarih', value: r => fmtDM(r.date) }
      ];
    }

    // ---------------------------------------------------------------------
    // Olaylar
    // ---------------------------------------------------------------------
    function onClick(e) {
      const t = e.target;
      const act = t.closest('[data-action]');
      if (act && !act.disabled) {
        const a = act.getAttribute('data-action');
        if (a === 'clear') clearFilters();
        else if (a === 'generate') applyFilters();
        else if (a === 'close') closePopup();
        else if (a === 'excel') kit.exportExcel('ups_veri_raporu', excelColumns(), st.rows);
        else if (a === 'pdf') kit.exportPdf();
        else if (a === 'zip') { kit.exportExcel('sdp_veri_raporu', excelColumns(), st.rows); kit.exportPdf(); }
        return;
      }
      if (t.hasAttribute('data-popup-backdrop')) { closePopup(); return; }
      const pick = t.closest('[data-pick]');
      if (pick) {
        const g = pick.getAttribute('data-pick');
        const v = pick.getAttribute('data-value');
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
        if (key === 'unit' && !st.regions.length) { toast('SDP seçmeden önce bölge seçin.', 'warning', 'SDP Raporu'); return; }
        st.open = st.open === key ? '' : key;
        render(st.open === 'unit');
      }
    }

    function onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-check')) {
        const g = t.getAttribute('data-check');
        const v = t.value;
        if (g === 'floor') { st.floors = toggleGroup(st.floors, v, t.checked, FLOOR_OPTIONS.map(f => f.value)); }
        else if (g === 'region') { st.regions = toggleGroup(st.regions, v, t.checked, regionOptions()); }
        else if (g === 'unit') { st.units = toggleGroup(st.units, v, t.checked, filteredUnits().map(u => u.key)); }
        else if (g === 'dataType') { st.dataTypes = toggleGroup(st.dataTypes, v, t.checked, DATA_TYPE_OPTIONS.map(o => o.value)); }
        render();
        return;
      }
      if (t.hasAttribute('data-mode')) { st.mode = t.value; st.open = ''; render(); return; }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }

    function onInput(e) {
      const t = e.target;
      if (t.getAttribute('data-filter-input') === 'unit') {
        if (!st.regions.length) return;
        st.unitText = st.units.length ? '' : t.value;
        if (st.units.length) st.unitText = t.value.replace(unitLabel(), '');
        st.open = 'unit';
        render(true);
        return;
      }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }

    // Dış tıklama: açık açılır listeyi kapat (yakalama aşamasında, DOM yeniden çizilmeden önce)
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

  (DCIM.reportRegistry = DCIM.reportRegistry || {}).ups = { mount };
})();
