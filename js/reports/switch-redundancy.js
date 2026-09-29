/* ==========================================================================
   DCIM Sunum — Şalter Yük Yedeklilik Raporu (ReportSwitchRedundancyComponent)
   Filtre kartı (kat, SDP girişi, değer türü, rapor periyodu, hazır aralıklar)
   + sonuç penceresi: A/B tarafı eşlenmiş SDP şalterleri, faz akımları, faz kontrolü (%),
   toplam doluluk (%) ve renk eşikleri (getUtilizationClass birebir).
   Veri: DCIM.data.reports.switchRedundancy (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportSwitchRedundancy.*
  const FLOOR_OPTIONS = [
    { value: 'CMR/T00', label: '1.Kat' },
    { value: 'CMR/T02', label: '2.Kat' },
    { value: 'CMR/T03', label: '3.Kat' },
    { value: 'CMR/T04', label: 'IDC4' }
  ];
  const VALUE_TYPE_OPTIONS = [
    { value: 'Maximum', label: 'Maksimum' },
    { value: 'Average', label: 'Ortalama' }
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
  const ALL_UPS = ['Giriş 1', 'Giriş 2'];

  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const PANEL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const PANEL_FIT = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5';
  const ROW_ALL = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const ROW_OPT = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const ROW_PICK = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer transition-colors';
  const ROW_EMPTY = 'px-2.5 py-2 text-xs text-slate-400 italic';
  const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const BR = 'border-r border-slate-200 dark:border-border-subtle';
  const TD_SANS = 'p-2 font-sans text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle';
  const TD_NUM = 'p-2 text-right text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle';
  const TD_IP = 'p-2 text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-border-subtle font-mono text-[10px]';

  const pad = n => String(n).padStart(2, '0');
  const dtLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const trDate = (d, withTime) => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + (withTime ? ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) : '');
  const num2 = v => v == null || isNaN(v) ? '' : Number(v).toFixed(2);

  // onDateRangePresetChange() + setDateTimeRange() birebir
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
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start: dtLocal(start), end: dtLocal(end) };
  }

  // getUtilizationClass() birebir: taraf başına >30 kırmızı; toplamda >160 / >140 / >120
  function utilClass(value, isTotal) {
    if (value === null || value === undefined) return '';
    let danger = 30, high = 80, warning = 70;
    if (isTotal) { danger = 160; high = 140; warning = 120; }
    if (value > danger) return 'util-danger';
    if (value > high) return 'util-high';
    if (value > warning) return 'util-warning';
    return 'util-normal';
  }
  function utilTone(value, isTotal) {
    const c = utilClass(value, isTotal);
    if (c === 'util-danger') return isTotal ? ' text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40' : ' text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30';
    if (c === 'util-high' || c === 'util-warning') return isTotal ? ' text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40' : ' text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30';
    if (c === 'util-normal') return ' text-emerald-600 dark:text-emerald-400';
    return '';
  }

  // parseDevNfo() birebir: LOKASYON/PANO İSMİ/SALON/BULUNDUĞU PANO/ŞALTER ADI
  function parseDevNfo(dev) {
    if (!dev || !dev.dev_nfo) return { lokasyon: '', panoIsmi: '', salon: '', panoRaw: '', salterAdi: '', side: '', groupKey: dev ? dev.id : '' };
    const p = dev.dev_nfo.split('/');
    const lokasyon = p[0] || '', panoIsmi = p[1] || '', salon = p[2] || '', panoRaw = p[3] || '', salterAdi = p[4] || '';
    const idc4 = lokasyon.toUpperCase() === 'IDC4' ? panoRaw.match(/UPS\s*([MK])\s*(\d+)/i) : null;
    const std = panoRaw.match(/UPS\s*([AB])[- ]?(\d+)/i);
    const side = idc4 ? (idc4[1].toLowerCase() === 'm' ? 'a' : 'b') : (std ? std[1].toLowerCase() : '');
    const groupNo = idc4 ? idc4[2] : (std ? std[2] : panoRaw);
    const gm = salterAdi.match(/(\d+)/);
    const groupKey = [salon, groupNo, gm ? gm[1] : salterAdi].filter(Boolean).join('|');
    return { lokasyon, panoIsmi, salon, panoRaw, salterAdi, side, groupKey };
  }
  function groupDevices(devices) {
    const groups = new Map();
    devices.forEach(dev => {
      const n = parseDevNfo(dev);
      const side = n.side || (dev.dev_bcu ? dev.dev_bcu.charAt(0).toLowerCase() : '') || 'a';
      const key = n.groupKey || (dev.dev_bcu ? dev.dev_bcu.substring(1) : dev.id);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key });
      const g = groups.get(key);
      if (side === 'a') g.a = dev;
      if (side === 'b') g.b = dev;
    });
    return Array.from(groups.values()).filter(g => g.a || g.b).sort((a, b) => a.key.localeCompare(b.key));
  }
  const phaseControl = (phases, cap) => cap && cap > 0 ? Math.max.apply(null, phases.filter(p => p !== null && p > 0).concat([0])) / cap * 100 : null;

  function buildReportData(pairs, map) {
    return pairs.map(pair => {
      const A = pair.a, B = pair.b;
      const nA = parseDevNfo(A), nB = parseDevNfo(B);
      const ph = (dev, k) => dev ? (map.has(dev[k + '_rid']) ? map.get(dev[k + '_rid']) : null) : null;
      const a = [ph(A, 'pa'), ph(A, 'pb'), ph(A, 'pc')];
      const b = [ph(B, 'pa'), ph(B, 'pb'), ph(B, 'pc')];
      const aK = phaseControl(a, A && A.dev_cap);
      const bK = phaseControl(b, B && B.dev_cap);
      const total = (aK || 0) + (bK || 0);
      return {
        lokasyon: nA.lokasyon || nB.lokasyon, pano_ismi: nA.panoIsmi || nB.panoIsmi, salon: nA.salon || nB.salon,
        a_pano: nA.panoRaw.replace('UPS', 'SDP'), a_salter_adi: nA.salterAdi, a_kapasite: A ? A.dev_cap : 0, a_ip: A ? A.ip : '',
        a_l1: a[0], a_l2: a[1], a_l3: a[2], a_faz_kontrol: aK,
        b_pano: nB.panoRaw.replace('UPS', 'SDP'), b_salter_adi: nB.salterAdi, b_kapasite: B ? B.dev_cap : 0, b_ip: B ? B.ip : '',
        b_l1: b[0], b_l2: b[1], b_l3: b[2], b_faz_kontrol: bK,
        total_doluluk: total > 0 ? total : null
      };
    });
  }

  function mount(el) {
    const { esc, button, statusBadge, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.reports.switchRedundancy;
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };

    const now = new Date();
    const initialRange = presetRange('past_week');
    // Sunum için hazır seçim: 1.Kat, Tüm SDPler (Giriş 1 + 2), Maksimum, Son 7 Gün
    const st = {
      floors: ['CMR/T00'],
      ups: ALL_UPS.slice(),
      upsText: '',
      upsFilter: ALL_UPS.slice(),
      calc: 'Maximum',
      mode: 'daily',
      filterDate: now.toISOString().slice(0, 10),
      startTime: '00:00:00',
      endTime: '23:59:59',
      preset: 'past_week',
      startDate: initialRange.start,
      endDate: initialRange.end,
      open: '',
      loadingUps: true,
      loading: false,
      progress: '',
      popup: false,
      rows: [],
      devices: []
    };

    // loadAllSwitchMetadata() karşılığı (kısa yükleme katmanı)
    function loadMetadata() {
      st.loadingUps = true;
      renderAll();
      later(() => {
        const floors = st.floors.length ? st.floors : FLOOR_OPTIONS.map(f => f.value);
        st.devices = M.devices(floors);
        st.upsFilter = ALL_UPS.slice();
        st.loadingUps = false;
        renderAll();
      }, 350);
    }

    const isAllUps = () => st.ups.length === ALL_UPS.length;
    const matchesEntrance = nfo => {
      const u = String(nfo || '').toLocaleUpperCase('tr-TR');
      return (st.ups.indexOf('Giriş 1') >= 0 && u.indexOf('GİRİŞ 1') >= 0) || (st.ups.indexOf('Giriş 2') >= 0 && u.indexOf('GİRİŞ 2') >= 0);
    };
    function floorLabel() {
      if (st.floors.length === FLOOR_OPTIONS.length) return 'Tüm Katlar';
      return st.floors.map(v => (FLOOR_OPTIONS.find(f => f.value === v) || { label: v }).label).join(', ');
    }
    function upsLabel() {
      if (isAllUps()) return 'Tüm SDPler';
      if (!st.ups.length) return st.upsText;
      return st.ups.join(', ');
    }
    const valueTypeLabel = () => (VALUE_TYPE_OPTIONS.find(o => o.value === st.calc) || { label: 'Seçiniz' }).label;
    const presetLabel = () => (DATE_PRESETS.find(p => p.value === st.preset) || DATE_PRESETS[0]).label;
    function periodDisplay() {
      if (st.mode === 'hourly') {
        if (!st.filterDate) return 'Tarih Belirtilmedi';
        return trDate(new Date(st.filterDate + 'T' + (st.startTime || '00:00:00')), false) + ' (' + st.startTime.slice(0, 5) + ' - ' + st.endTime.slice(0, 5) + ')';
      }
      if (!st.startDate || !st.endDate) return 'Tarih Aralığı Belirtilmedi';
      return trDate(new Date(st.startDate), true) + ' - ' + trDate(new Date(st.endDate), true);
    }

    // HTML parçaları
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

    function renderHeader() {
      const dis = !st.ups.length || st.loading || st.loadingUps;
      return kit.pageHeader({
        title: 'ŞALTER YÜK YEDEKLİLİK RAPORU',
        breadcrumbs: [{ label: 'Raporlar' }, { label: 'ŞALTER YÜK YEDEKLİLİK RAPORU' }],
        actions:
          button({ variant: 'primary', icon: st.loading ? 'pi pi-spin pi-spinner' : 'pi pi-file', label: st.loading ? 'Oluşturuluyor...' : 'Rapor Oluştur', attrs: 'data-action="generate"' + (dis ? ' disabled' : '') })
      });
    }

    function renderFilters() {
      const floorDd = dropdown('floor', 'Kat Seçimi:',
        '<input type="text" id="floor-selector" data-toggle="floor" value="' + esc(floorLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly placeholder="Kat seçiniz" />',
        '<div class="' + PANEL + '">' + checkRow('floor', 'all', 'Tüm Katlar', st.floors.length === FLOOR_OPTIONS.length, true) +
          FLOOR_OPTIONS.map(f => checkRow('floor', f.value, f.label, st.floors.indexOf(f.value) >= 0)).join('') + '</div>');

      const upsDd = dropdown('ups', 'SDP Seçimi:',
        '<input type="text" id="ups-filter" data-toggle="ups" data-filter-input="ups" value="' + esc(upsLabel()) + '" placeholder="SDP seçin veya yazın..." class="scada-input pr-8" autocomplete="off" />',
        '<div class="' + PANEL + '">' + checkRow('ups', 'Tüm SDPler', 'Tüm SDPler', isAllUps(), true) +
          (st.loadingUps ? '<div class="' + ROW_EMPTY + '">SDP listesi yükleniyor...</div>' : '') +
          st.upsFilter.map(o => checkRow('ups', o, o, st.ups.indexOf(o) >= 0)).join('') +
          (!st.loadingUps && st.upsFilter.length === 0 ? '<div class="' + ROW_EMPTY + '">Sonuç bulunamadı</div>' : '') +
        '</div>');

      const valueDd = dropdown('valueType', 'Değer Türü:',
        '<input type="text" id="value-type-selector" data-toggle="valueType" value="' + esc(valueTypeLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly placeholder="Tür seçin..." />',
        '<div class="' + PANEL_FIT + '">' + VALUE_TYPE_OPTIONS.map(o => pickRow('valueType', o.value, o.label)).join('') + '</div>');

      const radio = (value, label) =>
        '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
          '<input type="radio" name="sw-mode" data-mode value="' + value + '"' + (st.mode === value ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" />' +
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
          dropdown('datePreset', 'Hazır Aralıklar:',
            '<input type="text" id="date-preset-selector" data-toggle="datePreset" value="' + esc(presetLabel()) + '" class="scada-input pr-8 cursor-pointer" readonly placeholder="Aralık seçin..." />',
            '<div class="' + PANEL + '">' + DATE_PRESETS.map(p => pickRow('preset', p.value, p.label)).join('') + '</div>') +
          kit.formField({ label: 'Başlangıç Tarihi:', control: '<input type="datetime-local" id="start-datetime" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input" />' }) +
          kit.formField({ label: 'Bitiş Tarihi:', control: '<input type="datetime-local" id="end-datetime" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input" />' });
      }

      return kit.card({
        title: 'ŞALTER YÜK YEDEKLİLİK RAPORU',
        icon: 'pi pi-filter',
        body: '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + floorDd + upsDd + valueDd + periodBlock + modeBlock + '</div>'
      });
    }

    function renderOverlay() {
      if (!st.loadingUps) return '';
      return '<div class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted p-6 rounded-[2px] shadow-2xl flex flex-col items-center max-w-md w-full mx-4">' +
          '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-slate-900 dark:text-white font-medium text-sm mb-2">SDP Listesi Yükleniyor...</p>' +
        '</div></div>';
    }

    function sideCells(r, s) {
      const k = r[s + '_faz_kontrol'];
      return '<td class="' + TD_SANS + '">' + esc(r[s + '_pano']) + '</td>' +
        '<td class="' + TD_SANS + '">' + esc(r[s + '_salter_adi']) + '</td>' +
        '<td class="' + TD_NUM + '">' + esc(r[s + '_kapasite']) + '</td>' +
        '<td class="' + TD_IP + '">' + esc(r[s + '_ip']) + '</td>' +
        '<td class="' + TD_NUM + '">' + num2(r[s + '_l1']) + '</td>' +
        '<td class="' + TD_NUM + '">' + num2(r[s + '_l2']) + '</td>' +
        '<td class="' + TD_NUM + '">' + num2(r[s + '_l3']) + '</td>' +
        '<td class="p-2 text-right border-r border-slate-200 dark:border-border-subtle font-bold' + utilTone(k, false) + '">' + (num2(k) || '0.00') + '%</td>';
    }

    function renderPopup() {
      if (!st.popup) return '';
      const has = st.rows.length > 0;
      const dis = st.loading || !has ? ' disabled' : '';
      let body;
      if (st.loading) {
        const pct = parseInt(String(st.progress).replace('%', ''), 10) || 0;
        body = '<div class="py-16 flex flex-col items-center justify-center text-center">' +
          '<i class="pi pi-spin pi-spinner text-sky-600 dark:text-sky-400 text-3xl mb-3"></i>' +
          '<p class="text-slate-800 dark:text-slate-200 text-sm font-medium mb-4">Veriler İşleniyor Lütfen Bekleyiniz...</p>' +
          (st.progress ? '<div class="w-full max-w-md space-y-2">' +
            '<div class="w-full bg-slate-100 dark:bg-surface-panel h-2 rounded-[2px] overflow-hidden border border-slate-200 dark:border-border-subtle">' +
              '<div class="bg-sky-500 h-full transition-all duration-300" style="width:' + pct + '%"></div></div>' +
            '<p class="text-slate-500 dark:text-slate-400 text-xs font-mono">' + esc(st.progress) + '</p></div>' : '') +
        '</div>';
      } else if (has) {
        const sub = s => '<th class="p-2 ' + BR + '">BULUNDUĞU PANO</th><th class="p-2 ' + BR + '">ŞALTER ADI</th>' +
          '<th class="p-2 text-right ' + BR + '">KAPASİTE</th><th class="p-2 ' + BR + '">ANALİZÖR IP</th>' +
          '<th class="p-2 text-right ' + BR + ' font-mono">L1 (A)</th><th class="p-2 text-right ' + BR + ' font-mono">L2 (A)</th>' +
          '<th class="p-2 text-right ' + BR + ' font-mono">L3 (A)</th><th class="p-2 text-right ' + BR + ' font-semibold">FAZ KONTROLÜ (%)</th>';
        body = '<div><div class="border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
          '<table class="w-full text-xs text-left border-collapse min-w-max"><thead>' +
            '<tr class="bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-border-subtle">' +
              '<th colspan="3" class="p-2 text-center border-r border-slate-200 dark:border-border-subtle bg-slate-200/60 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle">Genel Bilgiler</th>' +
              '<th colspan="8" class="p-2 text-center border-r border-slate-200 dark:border-border-subtle bg-sky-100/60 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold border-b border-slate-200 dark:border-border-subtle">A Tarafı</th>' +
              '<th colspan="8" class="p-2 text-center border-r border-slate-200 dark:border-border-subtle bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 font-bold border-b border-slate-200 dark:border-border-subtle">B Tarafı</th>' +
              '<th rowspan="2" class="p-2 text-center bg-purple-100/60 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-bold border-b border-slate-200 dark:border-border-subtle align-middle">Total Doluluk (%)</th>' +
            '</tr>' +
            '<tr class="bg-slate-50 dark:bg-surface-panel/80 text-slate-700 dark:text-slate-300 font-medium text-[11px] border-b border-slate-200 dark:border-border-subtle">' +
              '<th class="p-2 ' + BR + '">LOKASYON</th><th class="p-2 ' + BR + '">PANO İSMİ</th><th class="p-2 ' + BR + '">SALON</th>' +
              sub('a') + sub('b') +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle font-mono text-[11px]">' +
            st.rows.map(r =>
              '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50 transition-colors">' +
                '<td class="p-2 font-sans font-medium text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-border-subtle">' + esc(r.lokasyon) + '</td>' +
                '<td class="' + TD_SANS + '">' + esc(r.pano_ismi) + '</td>' +
                '<td class="' + TD_SANS + '">' + esc(r.salon) + '</td>' +
                sideCells(r, 'a') + sideCells(r, 'b') +
                '<td class="p-2 text-right font-extrabold' + utilTone(r.total_doluluk, true) + '">' + (num2(r.total_doluluk) || '0.00') + '%</td>' +
              '</tr>').join('') +
            '</tbody></table></div></div>';
      } else {
        body = kit.emptyState({ message: 'Raporlanacak veri bulunamadı.' });
      }
      return '<div data-popup-backdrop class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4 overflow-y-auto">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden my-auto">' +
          '<div class="p-4 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-surface-panel/50">' +
            '<div class="flex items-center gap-3">' +
              '<h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="pi pi-power-off text-sky-600 dark:text-sky-400"></i><span>Şalter Yük Yedeklilik Raporu</span></h3>' +
              statusBadge('info', valueTypeLabel()) +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: 'PDF İndir', attrs: 'data-action="pdf"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: 'Excel İndir', attrs: 'data-action="excel"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: 'ZIP İndir', attrs: 'data-action="zip"' + dis }) +
              '<button type="button" data-action="close" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] transition-colors"><i class="pi pi-times"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="p-4 overflow-auto flex-1 space-y-6">' + body + '</div>' +
        '</div></div>';
    }

    // İskelet + render
    el.innerHTML = '<div class="space-y-4"><div data-sw-header></div><div data-sw-filters></div></div><div data-sw-overlay></div><div data-sw-popup></div>';
    const hostHeader = el.querySelector('[data-sw-header]');
    const hostFilters = el.querySelector('[data-sw-filters]');
    const hostOverlay = el.querySelector('[data-sw-overlay]');
    const hostPopup = el.querySelector('[data-sw-popup]');

    function render(focusUps) {
      hostHeader.innerHTML = renderHeader();
      hostFilters.innerHTML = renderFilters();
      if (focusUps) {
        const inp = hostFilters.querySelector('[data-filter-input="ups"]');
        if (inp) { inp.focus(); const n = inp.value.length; inp.setSelectionRange(n, n); }
      }
    }
    function renderLayers() {
      hostOverlay.innerHTML = renderOverlay();
      hostPopup.innerHTML = renderPopup();
    }
    function renderAll() { render(); renderLayers(); }

    // Eylemler
    function clearFilters() {
      Object.assign(st, {
        floors: ['CMR/T00'], ups: [], upsText: '', upsFilter: ALL_UPS.slice(), calc: 'Maximum', mode: 'hourly', preset: 'custom',
        filterDate: new Date().toISOString().slice(0, 10), startTime: '00:00:00', endTime: '23:59:59', startDate: '', endDate: '', open: ''
      });
      loadMetadata();
    }

    function generateReport() {
      if (!st.ups.length) { toast('Lütfen bir SDP seçin.', 'warning', 'Şalter Yük Yedeklilik'); return; }
      const relevant = st.devices.filter(d => matchesEntrance(d.dev_nfo));
      const pairs = groupDevices(relevant);
      const filter = { mode: st.mode, startDate: st.startDate, endDate: st.endDate, filterDate: st.filterDate, startTime: st.startTime, endTime: st.endTime, calc: st.calc };
      st.open = '';
      st.loading = true;
      st.popup = true;
      st.rows = buildReportData(pairs, new Map());
      st.progress = '%0 Başlıyor...';
      renderAll();
      if (!relevant.length) { st.loading = false; st.progress = ''; renderAll(); return; }
      // 15'lik RID parçaları (her cihaz 3 faz)
      const chunks = Math.max(1, Math.ceil(relevant.length * 3 / 15));
      const steps = Math.min(chunks, 6);
      for (let i = 1; i <= steps; i++) {
        later(() => { st.progress = '%' + Math.round(i / steps * 100) + ' Tamamlandı'; renderLayers(); }, i * 130);
      }
      later(() => {
        st.rows = buildReportData(pairs, M.currents(relevant, filter));
        st.loading = false;
        st.progress = '';
        renderAll();
      }, steps * 130 + 160);
    }

    function closePopup() { st.popup = false; renderAll(); }

    function excelColumns() {
      const u = v => v == null ? '-' : Number(v).toFixed(2) + '%';
      const cols = [
        { header: 'LOKASYON', value: r => r.lokasyon },
        { header: 'PANO İSMİ', value: r => r.pano_ismi },
        { header: 'SALON', value: r => r.salon }
      ];
      ['a', 'b'].forEach(s => {
        const p = s === 'a' ? 'A Tarafı - ' : 'B Tarafı - ';
        cols.push(
          { header: p + 'BULUNDUĞU PANO', value: r => r[s + '_pano'] },
          { header: p + 'ŞALTER ADI', value: r => r[s + '_salter_adi'] },
          { header: p + 'KAPASİTE', value: r => r[s + '_kapasite'] },
          { header: p + 'ANALİZÖR IP', value: r => r[s + '_ip'] },
          { header: p + 'L1 (A)', value: r => r[s + '_l1'] == null ? '-' : Number(r[s + '_l1'].toFixed(2)) },
          { header: p + 'L2 (A)', value: r => r[s + '_l2'] == null ? '-' : Number(r[s + '_l2'].toFixed(2)) },
          { header: p + 'L3 (A)', value: r => r[s + '_l3'] == null ? '-' : Number(r[s + '_l3'].toFixed(2)) },
          { header: p + 'FAZ KONTROLÜ (%)', value: r => u(r[s + '_faz_kontrol']) }
        );
      });
      cols.push({ header: 'Total Doluluk (%)', value: r => u(r.total_doluluk) });
      cols.push({ header: 'Rapor Periyodu:', value: () => periodDisplay() });
      return cols;
    }

    function toggleGroup(list, value, checked, allValues, allKey) {
      if (value === allKey) return checked ? allValues.slice() : [];
      if (checked) return list.indexOf(value) >= 0 ? list : list.concat([value]);
      return list.filter(v => v !== value);
    }

    // Olaylar
    function onClick(e) {
      const t = e.target;
      const act = t.closest('[data-action]');
      if (act && !act.disabled) {
        const a = act.getAttribute('data-action');
        if (a === 'clear') clearFilters();
        else if (a === 'generate') generateReport();
        else if (a === 'close') closePopup();
        else if (a === 'excel') kit.exportExcel('salter_yuk_yedeklilik_raporu', excelColumns(), st.rows);
        else if (a === 'pdf') kit.exportPdf();
        else if (a === 'zip') { kit.exportExcel('salter_yuk_yedeklilik_raporu', excelColumns(), st.rows); kit.exportPdf(); }
        return;
      }
      if (t.hasAttribute('data-popup-backdrop')) { closePopup(); return; }
      const pick = t.closest('[data-pick]');
      if (pick) {
        const g = pick.getAttribute('data-pick');
        const v = pick.getAttribute('data-value');
        if (g === 'valueType') st.calc = v;
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
        st.open = st.open === key ? '' : key;
        render(st.open === 'ups');
      }
    }

    function onChange(e) {
      const t = e.target;
      if (t.hasAttribute('data-check')) {
        const g = t.getAttribute('data-check');
        if (g === 'floor') {
          st.floors = toggleGroup(st.floors, t.value, t.checked, FLOOR_OPTIONS.map(f => f.value), 'all');
          st.ups = [];
          st.upsText = '';
          loadMetadata();
          return;
        }
        if (g === 'ups') st.ups = toggleGroup(st.ups, t.value, t.checked, ALL_UPS, 'Tüm SDPler');
        render();
        return;
      }
      if (t.hasAttribute('data-mode')) { st.mode = t.value; st.open = ''; render(); return; }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }

    function onInput(e) {
      const t = e.target;
      if (t.getAttribute('data-filter-input') === 'ups') {
        const v = (st.ups.length ? t.value.replace(upsLabel(), '') : t.value).toLowerCase();
        st.upsText = v;
        st.upsFilter = ALL_UPS.filter(o => o.toLowerCase().indexOf(v) >= 0);
        st.open = 'ups';
        render(true);
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

    loadMetadata();

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

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['switch-redundancy'] = { mount };
})();
