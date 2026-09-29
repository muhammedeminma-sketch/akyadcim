/* ==========================================================================
   DCIM Sunum — PDU Envanter Raporu (NewUICMPPduInventoryReportComponent)
   Kaynak: new-ui/pages/reporting/pdu-inventory-report/
   Kat → Salon → POD/Sıra → Kabin → Sütun seçimi; "Rapor Oluştur" sonuç penceresini açar.
   Veri: DCIM.data.reports.pduInventory (api.HIS_PDU_Inventory karşılığı)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportPduInventory.* / reportSwitchRedundancy.floorLabels.*
  const T = {
    title: 'ENVANTER RAPORLAMA',
    menuReports: 'Raporlar',
    floorSelection: 'Kat Seçimi:',
    floorPlaceholder: 'Kat seçin...',
    allFloors: 'Tüm Katlar',
    salonSelection: 'Salon Seçimi:',
    salonPlaceholder: 'Salon seçin...',
    allSalons: 'Tüm Salonlar',
    noSalonsFound: 'Salon bulunamadı',
    podSelection: 'POD / Sıra Seçimi:',
    podPlaceholder: 'Pod/Sıra seçin...',
    allPods: 'Tüm POD/Sıra',
    noPodsFound: 'Pod/Sıra bulunamadı',
    cabinetSelection: 'Kabin Seçimi:',
    cabinetPlaceholder: 'Kabin seçin...',
    allCabinets: 'Tüm Kabinler',
    columnSelection: 'Sütun Seçimi',
    columnPlaceholder: 'Sütunları Seç...',
    itemsSelected: 'Adet Seçili',
    clear: 'Temizle',
    generateReport: 'Rapor Oluştur',
    loading: 'Yükleniyor...',
    noResults: 'Sonuç bulunamadı',
    resultsTitle: 'Envanter Sonuçları',
    records: 'Kayıt',
    downloadExcel: 'Excel İndir',
    downloadZip: 'ZIP İndir',
    downloadPdf: 'PDF İndir',
    preparingReport: 'Envanter raporu hazırlanıyor... Lütfen bekleyiniz.',
    noDataFound: 'Kriterlere uygun veri bulunamadı.',
    room: 'Salon',
    roomUnspecified: 'Salon Belirtilmedi'
  };

  const FLOOR_OPTIONS = [
    { id: 'T01', label: '1.Kat' },
    { id: 'T02', label: '2.Kat' },
    { id: 'T03', label: '3.Kat' },
    { id: 'T04', label: 'IDC4' }
  ];

  const COLUMNS = [
    { key: 'id', label: 'Cihaz ID' },
    { key: 'host', label: 'Cihaz IP' },
    { key: 'tim', label: 'Son Güncelleme' },
    { key: 'PDUMANUF', label: 'Marka' },
    { key: 'PDUMODEL', label: 'Model' },
    { key: 'PDUSERNO', label: 'Seri No' },
    { key: 'PDUNAME', label: 'PDU Adı' },
    { key: 'PDUINCNT', label: 'Inlet Sayısı' },
    { key: 'PDUOUTCNT', label: 'Outlet Sayısı' },
    { key: 'PDUFWVER', label: 'Firmware' },
    { key: 'RTD_VOLT', label: 'Anma Gerilimi' },
    { key: 'RTD_CURR', label: 'Anma Akımı' },
    { key: 'RTD_VA', label: 'Anma Gücü (kVA)' },
    { key: 'CALC_KW', label: 'Anma Gücü (kW)' }
  ];

  // Ortak sınıf dizeleri (şablondan birebir)
  const DD_PANEL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const DD_ALL = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const DD_ITEM = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const CHECK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const EMPTY_ITEM = 'px-2.5 py-2 text-xs text-slate-400 italic';

  // ---------------------------------------------------------------------------
  // Yardımcılar (bileşendeki parse/format fonksiyonlarının karşılıkları)
  // ---------------------------------------------------------------------------
  const extractNumber = s => { const m = String(s || '').match(/\d+/); return m ? m[0] : null; };
  const normalizeKey = v => String(v || '').trim().normalize('NFD').replace(/[.\s]/g, '').replace(/[`´^~]/g, '').replace(/[\u0000-\u001F]/g, '').toUpperCase();
  const normalizeCabinetCode = devId => {
    if (!devId) return null;
    const tok = devId.split('_')[0] || '';
    const n = tok.startsWith('K') ? tok.substring(1) : tok;
    return n || null;
  };
  const normalizePduId = raw => {
    if (!raw) return raw;
    let c = raw;
    if (c.startsWith('K')) c = c.substring(1);
    if (c.endsWith('_DV')) c = c.substring(0, c.length - 3);
    return c;
  };
  function formatTimestamp(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    const parts = raw.split(' ');
    if (parts.length < 3) return raw;
    const time = parts[1].split('.')[0];
    const dp = parts[0].split('-');
    if (dp.length !== 3) return parts[0] + ' ' + time + ' ' + parts[2];
    return dp[2] + '.' + dp[1] + '.' + dp[0] + ' ' + time + ' ' + parts[2];
  }
  // Anma gücü (kW) = V × A × 0.8 / 1000 — aralıklı değerlerde min-max
  function calculateKwRange(rawVolt, rawCurr) {
    if (!rawVolt || !rawCurr || rawVolt === '-' || rawCurr === '-') return '-';
    const clean = v => String(v).replace(/[^\d.-]/g, '');
    const vt = clean(rawVolt).split('-').map(parseFloat).filter(v => !isNaN(v));
    const ct = clean(rawCurr).split('-').map(parseFloat).filter(v => !isNaN(v));
    if (!vt.length || !ct.length) return '-';
    let min = Infinity, max = -Infinity;
    vt.forEach(v => ct.forEach(c => { const kw = (v * c * 0.8) / 1000; if (kw < min) min = kw; if (kw > max) max = kw; }));
    const f = n => parseFloat(n.toFixed(3));
    return min === max ? f(min) + ' kW' : f(min) + '-' + f(max) + ' kW';
  }
  function convertTurkishChars(text) {
    const map = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
    return String(text || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, m => map[m] || m);
  }

  function parseDevLoc(devLoc, floorId) {
    const segs = String(devLoc || '').split('/').map(s => s.trim()).filter(s => s && s !== '_');
    let salonSeg = '', podSeg = '';
    if (floorId === 'T04') {
      podSeg = segs.find(s => normalizeKey(s).startsWith('POD')) || segs[1] || '';
    } else {
      salonSeg = segs[1] || '';
      podSeg = segs[2] || '';
    }
    return { salonSeg, podSeg };
  }
  function mapCabinetInfo(item, floorId) {
    const cabinet = normalizeCabinetCode(item && item.id);
    if (!cabinet) return null;
    const { salonSeg, podSeg } = parseDevLoc(item.dev_loc, floorId);
    const salonKey = salonSeg ? floorId + '|' + normalizeKey(salonSeg) : floorId + '|GENEL';
    const podKey = podSeg ? floorId + '|' + salonKey + '|' + normalizeKey(podSeg) : undefined;
    return { cabinet, floorId, salonKey, podKey, salonSeg, podSeg };
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

  // ---------------------------------------------------------------------------
  // Rapor modülü
  // ---------------------------------------------------------------------------
  function mount(el) {
    const { esc, button, toast } = DCIM.ui;
    const kit = DCIM.kit;
    const src = DCIM.data.reports.pduInventory;
    const timers = [];

    const state = {
      selectedFloorIds: ['T01'],
      floorCache: {},
      salonOptions: [],
      selectedSalonKeys: [],
      podOptions: [],
      selectedPodKeys: [],
      allCabinetsList: [],
      filteredCabinetsList: [],
      selectedCabinets: [],
      cabinetInputText: '',
      columns: COLUMNS.map(c => Object.assign({ selected: true }, c)),
      dd: { floor: false, salon: false, pod: false, cabinet: false, columns: false },
      isLoading: false,
      showPopup: false,
      displayData: []
    };

    const selectedColumns = () => state.columns.filter(c => c.selected);
    const isAllSelected = () => state.allCabinetsList.length > 0 && state.selectedCabinets.length === state.allCabinetsList.length;
    const areAllSalonsSelected = () => state.salonOptions.length > 0 && state.selectedSalonKeys.length === state.salonOptions.length;
    const areAllPodsSelected = () => state.podOptions.length > 0 && state.selectedPodKeys.length === state.podOptions.length;

    // --- Seçim listelerini yeniden kur -----------------------------------------
    function loadCabinetsForSelectedFloors() {
      if (!state.selectedFloorIds.length) {
        Object.assign(state, { allCabinetsList: [], filteredCabinetsList: [], selectedCabinets: [], cabinetInputText: '', salonOptions: [], selectedSalonKeys: [], podOptions: [], selectedPodKeys: [] });
        return;
      }
      state.selectedFloorIds.forEach(fid => {
        if (!state.floorCache[fid]) state.floorCache[fid] = src.cmr(fid).map(it => mapCabinetInfo(it, fid)).filter(Boolean);
      });
      rebuildSalonOptions();
      rebuildPodOptions();
      rebuildCabinetLists();
    }

    function rebuildSalonOptions() {
      const prevAll = areAllSalonsSelected();
      const map = new Map();
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (!map.has(info.salonKey)) map.set(info.salonKey, { key: info.salonKey, floorId: fid, rawSalonSeg: info.salonSeg });
      }));
      state.salonOptions = Array.from(map.values()).sort((a, b) => {
        if (a.floorId !== b.floorId) return a.floorId.localeCompare(b.floorId);
        const na = parseInt(extractNumber(a.rawSalonSeg) || '0', 10), nb = parseInt(extractNumber(b.rawSalonSeg) || '0', 10);
        return na !== nb ? na - nb : a.rawSalonSeg.localeCompare(b.rawSalonSeg);
      });
      const keys = new Set(state.salonOptions.map(s => s.key));
      state.selectedSalonKeys = prevAll ? Array.from(keys) : state.selectedSalonKeys.filter(k => keys.has(k));
    }

    function rebuildPodOptions() {
      const prevAll = areAllPodsSelected();
      const map = new Map();
      const allowed = state.selectedSalonKeys.length && state.selectedSalonKeys.length !== state.salonOptions.length ? new Set(state.selectedSalonKeys) : null;
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (!info.podKey) return;
        if (allowed && !allowed.has(info.salonKey)) return;
        if (!map.has(info.podKey)) map.set(info.podKey, { key: info.podKey, floorId: fid, salonKey: info.salonKey, rawSalonSeg: info.salonSeg, rawPodSeg: info.podSeg });
      }));
      state.podOptions = Array.from(map.values()).sort((a, b) => {
        if (a.floorId !== b.floorId) return a.floorId.localeCompare(b.floorId);
        if (a.salonKey !== b.salonKey) return a.salonKey.localeCompare(b.salonKey);
        const na = parseInt(extractNumber(a.rawPodSeg) || '0', 10), nb = parseInt(extractNumber(b.rawPodSeg) || '0', 10);
        return na !== nb ? na - nb : a.rawPodSeg.localeCompare(b.rawPodSeg);
      });
      const keys = new Set(state.podOptions.map(p => p.key));
      state.selectedPodKeys = prevAll ? Array.from(keys) : state.selectedPodKeys.filter(k => keys.has(k));
    }

    function rebuildCabinetLists() {
      const keepAll = isAllSelected();
      const salons = state.selectedSalonKeys.length ? new Set(state.selectedSalonKeys) : null;
      const pods = state.selectedPodKeys.length ? new Set(state.selectedPodKeys) : null;
      const union = new Set();
      state.selectedFloorIds.forEach(fid => (state.floorCache[fid] || []).forEach(info => {
        if (salons && !salons.has(info.salonKey)) return;
        if (pods && (!info.podKey || !pods.has(info.podKey))) return;
        union.add(info.cabinet);
      }));
      if (!union.size) {
        Object.assign(state, { allCabinetsList: [], filteredCabinetsList: [], selectedCabinets: [], cabinetInputText: '' });
        return;
      }
      state.allCabinetsList = Array.from(union).sort();
      state.filteredCabinetsList = state.allCabinetsList.slice();
      state.selectedCabinets = keepAll ? state.allCabinetsList.slice() : state.selectedCabinets.filter(c => union.has(c));
      updateCabinetInputText();
    }

    function updateCabinetInputText() {
      state.cabinetInputText = state.selectedCabinets.length ? state.selectedCabinets.join(', ') : '';
    }

    // --- Etiketler ---------------------------------------------------------------
    function floorLabel() {
      const ids = state.selectedFloorIds;
      if (!ids.length) return T.floorPlaceholder;
      if (ids.length === FLOOR_OPTIONS.length) return T.allFloors;
      if (ids.length === 1) return localizedFloor(ids[0]);
      return ids.length + ' ' + T.itemsSelected;
    }
    function salonLabel() {
      if (!state.salonOptions.length || !state.selectedSalonKeys.length) return T.salonPlaceholder;
      if (areAllSalonsSelected()) return T.allSalons;
      if (state.selectedSalonKeys.length === 1) {
        const m = state.salonOptions.find(s => s.key === state.selectedSalonKeys[0]);
        return m ? salonOptionLabel(m) : T.salonPlaceholder;
      }
      return state.selectedSalonKeys.length + ' ' + T.itemsSelected;
    }
    function podLabel() {
      if (!state.podOptions.length || !state.selectedPodKeys.length) return T.podPlaceholder;
      if (areAllPodsSelected()) return T.allPods;
      if (state.selectedPodKeys.length === 1) {
        const m = state.podOptions.find(p => p.key === state.selectedPodKeys[0]);
        return m ? podOptionLabel(m) : T.podPlaceholder;
      }
      return state.selectedPodKeys.length + ' ' + T.itemsSelected;
    }

    // --- HTML parçaları ----------------------------------------------------------
    const checkRow = (cls, kind, val, checked, label, disabled) =>
      '<label class="' + cls + '"><input type="checkbox" data-check="' + kind + '" data-val="' + esc(val) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') +
      ' class="' + CHECK + '" /><span>' + esc(label) + '</span></label>';

    function panelHtml(name) {
      if (name === 'floor') {
        return checkRow(DD_ALL, 'floor', '*', state.selectedFloorIds.length === FLOOR_OPTIONS.length, T.allFloors) +
          FLOOR_OPTIONS.map(f => checkRow(DD_ITEM, 'floor', f.id, state.selectedFloorIds.includes(f.id), f.label)).join('');
      }
      if (name === 'salon') {
        return checkRow(DD_ALL, 'salon', '*', areAllSalonsSelected(), T.allSalons, !state.salonOptions.length) +
          state.salonOptions.map(s => checkRow(DD_ITEM, 'salon', s.key, state.selectedSalonKeys.includes(s.key), salonOptionLabel(s))).join('') +
          (!state.salonOptions.length ? '<div class="' + EMPTY_ITEM + '">' + esc(T.noSalonsFound) + '</div>' : '');
      }
      if (name === 'pod') {
        return checkRow(DD_ALL, 'pod', '*', areAllPodsSelected(), T.allPods, !state.podOptions.length) +
          state.podOptions.map(p => checkRow(DD_ITEM, 'pod', p.key, state.selectedPodKeys.includes(p.key), podOptionLabel(p))).join('') +
          (!state.podOptions.length ? '<div class="' + EMPTY_ITEM + '">' + esc(T.noPodsFound) + '</div>' : '');
      }
      if (name === 'cabinet') {
        return checkRow(DD_ALL, 'cabinet', '*', isAllSelected(), T.allCabinets) +
          state.filteredCabinetsList.map(c => checkRow(DD_ITEM, 'cabinet', c, state.selectedCabinets.includes(c), c)).join('') +
          (!state.filteredCabinetsList.length ? '<div class="' + EMPTY_ITEM + '">' + esc(T.noResults) + '</div>' : '');
      }
      return state.columns.map((c, i) => checkRow(DD_ITEM, 'column', String(i), c.selected, c.label)).join('');
    }

    function dropdown(name, label, inputHtml) {
      return '<div class="relative" data-dd-root="' + name + '">' +
        kit.formField({ label, control: '<div class="relative">' + inputHtml + '</div>' }) +
        (state.dd[name] ? '<div class="' + DD_PANEL + '" data-dd-panel="' + name + '">' + panelHtml(name) + '</div>' : '') +
      '</div>';
    }

    function filtersHtml() {
      return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">' +
        dropdown('floor', T.floorSelection,
          '<input type="text" value="' + esc(floorLabel()) + '" data-dd-toggle="floor" placeholder="' + esc(T.floorPlaceholder) + '" class="scada-input pr-8 cursor-pointer" readonly />' + CHEVRON) +
        dropdown('salon', T.salonSelection,
          '<input type="text" value="' + esc(salonLabel()) + '" data-dd-toggle="salon" placeholder="' + esc(T.salonPlaceholder) + '" class="scada-input pr-8 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" readonly />' + CHEVRON) +
        dropdown('pod', T.podSelection,
          '<input type="text" value="' + esc(podLabel()) + '" data-dd-toggle="pod" placeholder="' + esc(T.podPlaceholder) + '"' + (!state.podOptions.length ? ' disabled' : '') +
          ' class="scada-input pr-8 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" readonly />' + CHEVRON) +
        dropdown('cabinet', T.cabinetSelection,
          '<input type="text" value="' + esc(state.cabinetInputText) + '" data-dd-toggle="cabinet" data-cabinet-input placeholder="' + esc(T.cabinetPlaceholder) + '" class="scada-input pr-8 disabled:opacity-50 disabled:cursor-not-allowed" autocomplete="off" />' +
          '<i class="pi pi-search absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>') +
        dropdown('columns', T.columnSelection,
          '<input type="text" value="' + esc(selectedColumns().length + ' ' + T.itemsSelected) + '" data-dd-toggle="columns" placeholder="' + esc(T.columnPlaceholder) + '" class="scada-input pr-8 cursor-pointer" readonly />' + CHEVRON) +
      '</div>';
    }

    function headerHtml() {
      const disabled = state.isLoading || state.selectedCabinets.length === 0;
      return kit.pageHeader({
        title: T.title,
        breadcrumbs: [{ label: T.menuReports }, { label: T.title }],
        actions:
          button({ variant: 'primary', icon: state.isLoading ? 'pi pi-spin pi-spinner' : 'pi pi-file', label: state.isLoading ? T.loading : T.generateReport, attrs: 'data-act="generate"' + (disabled ? ' disabled' : '') })
      });
    }

    function popupHtml() {
      if (!state.showPopup) return '';
      const cols = selectedColumns();
      const noData = state.isLoading || state.displayData.length === 0;
      const dis = noData ? ' disabled' : '';
      let body;
      if (state.isLoading) {
        body = '<div class="py-16 flex flex-col items-center justify-center gap-3">' +
          '<i class="pi pi-spin pi-spinner text-sky-400 text-3xl"></i>' +
          '<p class="text-slate-300 text-sm font-medium">' + esc(T.preparingReport) + '</p></div>';
      } else if (state.displayData.length) {
        body = '<div class="flex-1 overflow-auto border border-slate-200 dark:border-border-subtle rounded-[2px] min-h-0">' +
          '<table class="w-full text-left text-xs border-collapse min-w-max"><thead>' +
            '<tr class="sticky top-0 bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 font-semibold tracking-wider uppercase z-10 shadow-sm">' +
              cols.map(c => '<th class="px-3.5 py-2.5 whitespace-nowrap border-r border-slate-200 dark:border-border-subtle last:border-r-0 bg-slate-100 dark:bg-surface-panel">' + esc(c.label) + '</th>').join('') +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' +
              state.displayData.map(row => '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
                cols.map(c => '<td class="px-3.5 py-2 whitespace-nowrap border-r border-slate-200 dark:border-border-subtle last:border-r-0 font-mono text-[11px]">' + esc(row[c.key] || '-') + '</td>').join('') +
              '</tr>').join('') +
            '</tbody></table></div>';
      } else {
        body = kit.emptyState({ icon: 'pi pi-inbox', message: T.noDataFound });
      }
      return '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200000] flex items-center justify-center p-4" data-popup-overlay>' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl flex flex-col w-full max-w-[95vw] xl:max-w-7xl max-h-[85vh] overflow-hidden">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel flex-shrink-0">' +
            '<div class="flex items-center gap-3">' +
              '<i class="pi pi-list text-sky-600 dark:text-sky-400 text-lg"></i>' +
              '<h3 class="text-base font-bold text-slate-800 dark:text-white tracking-wide">' + esc(T.resultsTitle) +
                '<span class="text-xs font-normal text-slate-500 dark:text-slate-400 ml-2">(' + state.displayData.length + ' ' + esc(T.records) + ')</span></h3>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.downloadExcel, attrs: 'data-act="excel"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: T.downloadZip, attrs: 'data-act="zip"' + dis }) +
              button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.downloadPdf, attrs: 'data-act="pdf"' + dis }) +
              '<button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 ml-2 transition-colors" data-act="close"><i class="pi pi-times text-lg"></i></button>' +
            '</div>' +
          '</div>' +
          '<div class="p-5 flex-1 flex flex-col min-h-0 overflow-hidden">' + body + '</div>' +
        '</div>' +
      '</div>';
    }

    el.innerHTML = '<div class="space-y-4">' +
      '<div data-part="header"></div>' +
      '<div data-part="card"></div>' +
      '<div data-part="popup"></div>' +
    '</div>';
    const parts = { header: el.querySelector('[data-part="header"]'), card: el.querySelector('[data-part="card"]'), popup: el.querySelector('[data-part="popup"]') };

    function renderHeader() { parts.header.innerHTML = headerHtml(); }
    function renderFilters() {
      // Açık listenin kaydırma konumunu koru
      const openPanel = parts.card.querySelector('[data-dd-panel]');
      const scroll = openPanel ? { name: openPanel.getAttribute('data-dd-panel'), top: openPanel.scrollTop } : null;
      if (!parts.card.firstChild) {
        parts.card.innerHTML = kit.card({ title: T.title, icon: 'pi pi-filter', body: '<div data-part="filters"></div>' });
      }
      parts.card.querySelector('[data-part="filters"]').innerHTML = filtersHtml();
      if (scroll) {
        const p = parts.card.querySelector('[data-dd-panel="' + scroll.name + '"]');
        if (p) p.scrollTop = scroll.top;
      }
    }
    function renderPopup() { parts.popup.innerHTML = popupHtml(); }
    function renderAll() { renderHeader(); renderFilters(); renderPopup(); }

    // --- Eylemler ------------------------------------------------------------------
    function toggleDropdown(name) {
      const cur = state.dd[name];
      Object.keys(state.dd).forEach(k => { state.dd[k] = false; });
      if (!cur) state.dd[name] = true;
    }

    function clearSelections() {
      Object.assign(state, { selectedSalonKeys: [], selectedPodKeys: [], selectedCabinets: [], cabinetInputText: '', displayData: [] });
      rebuildPodOptions();
      rebuildCabinetLists();
    }

    function generateReport() {
      if (!state.selectedCabinets.length) return;
      state.isLoading = true;
      state.showPopup = true;
      state.displayData = [];
      renderHeader();
      renderPopup();
      const filter = new Set(state.selectedCabinets.map(c => c.toUpperCase()));
      timers.push(setTimeout(() => {
        const raw = [];
        state.selectedFloorIds.forEach(fid => raw.push.apply(raw, src.inventory(fid)));
        state.displayData = raw
          .filter(row => { const cab = (normalizeCabinetCode(row.id) || '').toUpperCase(); return filter.has(cab); })
          .map(row => ({
            id: normalizePduId(row.id),
            host: row.host,
            tim: formatTimestamp(row.tim),
            PDUMANUF: row.PDUMANUF || '-',
            PDUMODEL: row.PDUMODEL || '-',
            PDUSERNO: row.PDUSERNO || '-',
            PDUNAME: row.PDUNAME || '-',
            PDUINCNT: row.PDUINCNT || '-',
            PDUOUTCNT: row.PDUOUTCNT || '-',
            PDUFWVER: row.PDUFWVER || '-',
            RTD_VOLT: row.RTD_VOLT || '-',
            RTD_CURR: row.RTD_CURR || '-',
            RTD_VA: row.RTD_VA || '-',
            CALC_KW: calculateKwRange(row.RTD_VOLT, row.RTD_CURR)
          }));
        state.isLoading = false;
        renderHeader();
        renderPopup();
      }, 650));
    }

    function baseFileName() {
      if (isAllSelected()) return 'tumkabinler.pdu-envanter';
      if (state.selectedCabinets.length === 1) return convertTurkishChars(state.selectedCabinets[0]) + '.pdu-envanter';
      if (state.selectedCabinets.length > 1) return 'kabin_toplu.pdu-envanter';
      return 'PDU_Envanter_Raporu';
    }
    function exportColumns() { return selectedColumns().map(c => ({ header: c.label, value: r => r[c.key] || '-' })); }

    // --- Olaylar -------------------------------------------------------------------
    function onClick(e) {
      const overlay = e.target.closest('[data-popup-overlay]');
      if (overlay && e.target === overlay) { state.showPopup = false; renderPopup(); return; }
      const tog = e.target.closest('[data-dd-toggle]');
      if (tog && !tog.disabled) {
        const name = tog.getAttribute('data-dd-toggle');
        // Kabin arama kutusu: açıkken tıklamak listeyi kapatmasın (yazmaya devam edilebilsin)
        if (name === 'cabinet' && state.dd.cabinet) return;
        toggleDropdown(name);
        renderFilters();
        if (name === 'cabinet') {
          const inp = parts.card.querySelector('[data-cabinet-input]');
          if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act || act.disabled) return;
      switch (act.getAttribute('data-act')) {
        case 'clear': clearSelections(); renderAll(); break;
        case 'generate': generateReport(); break;
        case 'close': state.showPopup = false; renderPopup(); break;
        case 'excel': kit.exportExcel(T.resultsTitle.replace(/ /g, '_'), exportColumns(), state.displayData); break;
        case 'zip':
          kit.exportExcel(baseFileName(), exportColumns(), state.displayData);
          toast('Sunumda ZIP yerine Excel (CSV) dosyası indirildi.', 'info', 'ZIP');
          break;
        case 'pdf': kit.exportPdf(); break;
      }
    }

    function onChange(e) {
      const cb = e.target.closest('[data-check]');
      if (!cb) return;
      const kind = cb.getAttribute('data-check');
      const val = cb.getAttribute('data-val');
      const on = cb.checked;
      const toggleIn = (arr, v) => on ? (arr.includes(v) ? arr : arr.concat(v)) : arr.filter(x => x !== v);
      if (kind === 'floor') {
        state.selectedFloorIds = val === '*' ? (on ? FLOOR_OPTIONS.map(f => f.id) : []) : toggleIn(state.selectedFloorIds, val);
        loadCabinetsForSelectedFloors();
      } else if (kind === 'salon') {
        state.selectedSalonKeys = val === '*' ? (on ? state.salonOptions.map(s => s.key) : []) : toggleIn(state.selectedSalonKeys, val);
        rebuildPodOptions();
        rebuildCabinetLists();
      } else if (kind === 'pod') {
        state.selectedPodKeys = val === '*' ? (on ? state.podOptions.map(p => p.key) : []) : toggleIn(state.selectedPodKeys, val);
        rebuildCabinetLists();
      } else if (kind === 'cabinet') {
        state.selectedCabinets = val === '*' ? (on ? state.allCabinetsList.slice() : []) : toggleIn(state.selectedCabinets, val);
        updateCabinetInputText();
      } else if (kind === 'column') {
        state.columns[parseInt(val, 10)].selected = on;
      }
      renderHeader();
      renderFilters();
    }

    function onInput(e) {
      const inp = e.target.closest('[data-cabinet-input]');
      if (!inp) return;
      state.cabinetInputText = inp.value;
      const q = inp.value.toLowerCase();
      state.filteredCabinetsList = q ? state.allCabinetsList.filter(c => c.toLowerCase().includes(q)) : state.allCabinetsList.slice();
      if (!state.dd.cabinet) { toggleDropdown('cabinet'); renderFilters(); const n = parts.card.querySelector('[data-cabinet-input]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } return; }
      const panel = parts.card.querySelector('[data-dd-panel="cabinet"]');
      if (panel) panel.innerHTML = panelHtml('cabinet');
    }

    // Dışarı tıklanınca açık listeyi kapat (composedPath: yeniden çizimde kopan düğümleri de içerir)
    function onDocClick(e) {
      const path = e.composedPath ? e.composedPath() : [];
      const inside = name => path.some(n => n && n.getAttribute && n.getAttribute('data-dd-root') === name);
      let changed = false;
      Object.keys(state.dd).forEach(k => { if (state.dd[k] && !inside(k)) { state.dd[k] = false; changed = true; } });
      if (changed) renderFilters();
    }
    function onKey(e) {
      if (e.key === 'Escape' && state.showPopup) { state.showPopup = false; renderPopup(); }
    }

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);

    loadCabinetsForSelectedFloors();
    renderAll();

    return {
      destroy() {
        timers.forEach(clearTimeout);
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        el.removeEventListener('input', onInput);
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onKey);
        el.innerHTML = '';
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['pdu-inventory'] = { mount };
})();
