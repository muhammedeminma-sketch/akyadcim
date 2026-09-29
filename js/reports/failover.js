/* ==========================================================================
   DCIM Sunum — PDU Yük Raporu (ReportFailoverComponent / failover-report)
   Filtre kartı (rapor tipi, kat/kabin veya müşteri/kabin, periyot, değer türü,
   tarih/saat) + "Rapor Oluştur" ile açılan sonuç penceresi: kabin başına
   PDU A / PDU B / Yük Devretme Simülasyonu tabloları (Inlet + OCP satırları).
   Veri: DCIM.data.reports.failover (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // ---------------------------------------------------------------------------
  // Çeviriler (messages.tr.json → reportFailover.*)
  // ---------------------------------------------------------------------------
  const T = {
    title: 'PDU YÜK DURUM RAPORLAMA',
    menuReports: 'Raporlar',
    select: 'Seçiniz',
    selectDots: 'Seçiniz...',
    reportSelection: 'Rapor Seçimi:',
    floorSelection: 'Kat Seçimi:',
    cabinetSelection: 'Kabin Seçimi:',
    customerSelection: 'Müşteri Seçimi:',
    companyCustomer: 'Şirket/Müşteri:',
    reportPeriod: 'Rapor Periyodu:',
    valueType: 'Değer Türü:',
    date: 'Tarih:',
    startTime: 'Başlangıç Saati:',
    endTime: 'Bitiş Saati:',
    startDate: 'Başlangıç Tarihi:',
    endDate: 'Bitiş Tarihi:',
    quickSelection: 'Hazır Aralıklar:',
    presetsPlaceholder: 'Aralık seçin...',
    allFloors: 'Tüm Katlar',
    allCabinets: 'Tüm Kabinler',
    allCustomers: 'Tüm Müşteriler',
    internalCustomers: 'İç Müşteriler',
    externalCustomers: 'Dış Müşteriler',
    internalCustomerSelected: 'İç Müşteriler Seçildi',
    externalCustomerSelected: 'Dış Müşteriler Seçildi',
    selectCustomer: 'Müşteri seçin...',
    cabinetPlaceholder: 'Kabin seçin veya yazın...',
    loadingCabinets: 'Kabinler yükleniyor...',
    noResults: 'Sonuç bulunamadı',
    clear: 'Temizle',
    generateReport: 'Rapor Oluştur',
    generating: 'Oluşturuluyor...',
    dateRange: 'Tarih Aralığı',
    hourly: 'Saatlik',
    selectedCustomers: '{count} Müşteri Seçildi',
    selectedCabinets: '{count} Kabin Seçildi',
    selectedFloors: '{count} Kat Seçildi',
    selectCustomerFirst: 'Lütfen önce bir müşteri seçin.',
    selectCabinetFirst: 'Lütfen önce bir kabin seçin ve IO ID\'lerinin yüklenmesini bekleyin.',
    popupTitle: 'Kabin Bazlı PDU Yük Raporu',
    pdfDownload: 'PDF İndir',
    excelDownload: 'Excel İndir',
    zipDownload: 'ZIP İndir',
    loadingPreparing: 'Veriler İşleniyor Lütfen Bekleyiniz...',
    cabinet: 'Kabin',
    simulationFailover: 'Simülasyon (Failover)',
    capacity: 'Kapasite',
    load: 'Yük',
    utilization: 'Kullanım (%)',
    simLoad: 'Sim. Yükü',
    disclaimerTitle: 'Yasal Uyarı:',
    disclaimerText: 'Bu rapor, yalnızca iki adet birbirinin aynı, tek girişli Rack PDU’su bulunan ve her iki Rack PDU’da da aynı priz numaralarından beslenen cihazlara sahip rack’ler için tasarlanmıştır. 3 fazlı Rack PDU’ları için, bir cihazın her iki PDU’da da aynı faz bacaklarına bağlı olduğu varsayılmaktadır. Bu rapor, rapor için seçilen zaman aralığında bağlantısını kaybetmiş, enerjisi kesilmiş veya kullanım dışı bırakılmış Rack PDU’ları bulunan rack’ler için doğru olmayabilir. Zaman aralığı belirtilen raporlar ortalama amper okumalarını kullanırken, “Son Tam Anket” raporları en güncel okumayı kullanır. Rapor, en yüksek yükleri bildirmez; bu nedenle rapor, ortalama olarak rack’inizin bir failover durumunu geçebileceğini gösterse bile, her zaman geçeceğini garanti edemez. Genel olarak bu rapor, geçmişte belirli koşullar altında toplanan verilere dayanır. Bu koşullar değişirse rapor artık doğru olmayacaktır. Bu rapor, etkili bir failover planı tasarlamak için tek başına temel alınmamalıdır.',
    noData: 'Gösterilecek analiz verisi bulunamadı.',
    peakTimeTable: '{date} {time} Tablosu'
  };
  const tp = (s, p) => Object.keys(p).reduce((a, k) => a.replace('{' + k + '}', p[k]), s);

  const REPORT_TYPES = [
    { value: true, label: 'Müşteri Bazlı Rapor' },
    { value: false, label: 'Kabin Bazlı Rapor' }
  ];
  const VALUE_TYPES = [
    { value: 'Maximum', label: 'Maksimum' },
    { value: 'Average', label: 'Ortalama' },
    { value: 'Minimum', label: 'Minimum' }
  ];
  const FLOORS = [
    { id: 'T01', label: '1. Kat' },
    { id: 'T02', label: '2. Kat' },
    { id: 'T03', label: '3. Kat' },
    { id: 'T04', label: 'IDC4' }
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
  const INTERNAL = 'İç Müşteriler';
  const EXTERNAL = 'Dış Müşteriler';
  // Sunum için hazır seçim: senaryo kabinleri (1AV42 PDU-B faz kaybı, 1CB52 yüksek akım) ve komşuları
  const DEMO_CABINETS = ['1AV40', '1AV41', '1AV42', '1AV43', '1CB51', '1CB52', '1CB53'];

  // ---------------------------------------------------------------------------
  // Şablon sınıfları (failover-report.component.html'den birebir)
  // ---------------------------------------------------------------------------
  const MENU = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 p-1 space-y-0.5';
  const MENU_SCROLL = 'absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5';
  const OPT = 'px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer transition-colors';
  const ALL_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer';
  const ITEM_ROW = 'flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
  const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500';
  const NORES = 'px-2.5 py-2 text-xs text-slate-400 italic';
  const CHEVRON = '<i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>';
  const TH_SUB = 'p-1.5 text-right border-r border-slate-200 dark:border-border-subtle';
  const TD_NUM = 'p-2 text-right text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-border-subtle';
  const UTIL_WARN = 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/20';
  const UTIL_OK = 'text-slate-700 dark:text-slate-300';
  const SIM_CRIT = 'text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/30 font-extrabold';

  // ---------------------------------------------------------------------------
  // Yardımcılar (ts'deki biçimlendiriciler)
  // ---------------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  // Angular DecimalPipe number:'1.0-2' (en-US)
  const num = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const formatDateForInput = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const dmy = d => pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const formatDateForDisplay = s => s ? dmy(new Date(s)) : 'Belirtilmedi';
  const formatFullTimestamp = z => z ? dmy(new Date(z)) + ' ' + hm(new Date(z)) : 'Bilinmiyor';
  const formatPeakTimeAsTitle = z => z ? tp(T.peakTimeTable, { date: dmy(new Date(z)), time: hm(new Date(z)) }) : '';
  const calcUtil = (load, cap) => cap <= 0 ? 0 : Number(((load / cap) * 100).toFixed(2));

  function parseCabinetName(dev) {
    if (!dev) return null;
    const parts = dev.split('_');
    const first = parts[0] || '';
    const second = parts[1] || '';
    if (/^K\w+/i.test(first)) return first;
    if (second.toUpperCase() === 'PDU') return first || null;
    if (parts.length > 1 && second) return second;
    return first || null;
  }
  function displayCabinetName(cab) {
    if (!cab) return null;
    if (/^K(?=[A-Za-z0-9])/i.test(cab)) return cab.replace(/^K/i, '');
    return cab;
  }
  const extractCabinetNameFromRid = rid => displayCabinetName(parseCabinetName(rid)) || 'Bilinmiyor';
  function extractInletKey(rid) {
    const m = rid.match(/_IN(\d*)_CURR(\d*)$/);
    if (!m) return null;
    return m[1] || m[2] || '1';
  }
  function extractOcpKey(rid) {
    const m = rid.match(/_OCP_C(\d+)_CURR$/);
    return m ? m[1] : null;
  }
  function getCapacityRid(rid) {
    if (/_IN(\d*)_CURR(\d*)$/.test(rid)) return rid.replace(/_IN\d*_CURR\d*$/, '_RTD_CURR');
    const m = rid.match(/_OCP_C(\d+)_CURR$/);
    if (m) return rid.replace('_OCP_C' + m[1] + '_CURR', '_RTD_OCP' + m[1] + '_CURR');
    return '';
  }
  function getPduName(rid) {
    const parts = rid.split('_');
    if (parts.length >= 4) {
      const cab = displayCabinetName(parseCabinetName(rid)) || parts[0];
      const side = parts[2].replace('PDU', '').replace(/[^A-Z0-9]/gi, '') || parts[2];
      return cab + ' PDU ' + side;
    }
    const m = rid.match(/PDU_[A-Z0-9_]+/);
    return m ? m[0] : rid;
  }

  const registry = (DCIM.reportRegistry = DCIM.reportRegistry || {});
  registry['failover'] = {
    mount(el) {
      const { esc, button, statusBadge, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const MOCK = DCIM.data.reports.failover;

      const st = {
        dd: { cabinet: false, valueType: false, datePreset: false, floor: false, reportType: false, customer: false, customerSelect: false, customerCabinet: false },
        isCustomerBasedReport: false,
        customerList: [], filteredCustomerList: [], selectedCompanies: [],
        selectedCustomerSelect: INTERNAL,
        allCabinetsList: [], filteredCabinetsList: [], selectedCabinets: [],
        cabinetFilterText: '',
        reportMode: 'daily', selectedValueType: 'Maximum',
        filterDate: '', startTime: '00:00:00', endTime: '23:59:59',
        startDate: '', endDate: '', selectedDateRangePreset: 'custom',
        selectedFloorIds: ['T01'],
        showPopup: false, isPopupLoading: false, chunkProgress: '', chunkProgressValue: 0,
        grouped: [],
        capacityMap: {}
      };
      let timer = null;

      // ---------------------------------------------------------------- durum
      function loadAllCabinets() {
        if (st.isCustomerBasedReport) { st.allCabinetsList = []; st.filteredCabinetsList = []; return; }
        const list = MOCK.cabinetsOnFloors(st.selectedFloorIds);
        st.allCabinetsList = list;
        st.selectedCabinets = st.selectedCabinets.filter(c => list.includes(c));
        st.filteredCabinetsList = list.slice();
      }
      function loadCabinetsForSelectedCustomers() {
        st.allCabinetsList = []; st.filteredCabinetsList = []; st.selectedCabinets = [];
        if (!st.selectedCompanies.length) return;
        st.allCabinetsList = MOCK.cabinetsForCustomers(st.selectedCompanies);
        st.filteredCabinetsList = st.allCabinetsList.slice();
      }
      function loadCustomers(type) {
        st.customerList = MOCK.customers(type);
        st.filteredCustomerList = st.customerList.slice();
        loadCabinetsForSelectedCustomers();
      }
      const isAllSelected = () => st.allCabinetsList.length > 0 && st.selectedCabinets.length === st.allCabinetsList.length;

      function reportTypeLabel() { const s = REPORT_TYPES.find(o => o.value === st.isCustomerBasedReport); return s ? s.label : T.selectDots; }
      function valueTypeLabel() { const s = VALUE_TYPES.find(o => o.value === st.selectedValueType); return s ? s.label : T.selectDots; }
      function presetLabel() { const s = PRESETS.find(p => p.value === st.selectedDateRangePreset); return s ? s.label : PRESETS[0].label; }
      function floorLabel() {
        const ids = st.selectedFloorIds;
        if (!ids.length) return T.selectDots;
        if (ids.length === FLOORS.length) return T.allFloors;
        if (ids.length === 1) { const f = FLOORS.find(x => x.id === ids[0]); return f ? f.label : T.selectDots; }
        return tp(T.selectedFloors, { count: ids.length });
      }
      function cabinetsLabel() {
        if (!st.selectedCabinets.length) return st.cabinetFilterText || T.selectDots;
        if (isAllSelected()) return T.allCabinets;
        if (st.selectedCabinets.length === 1) return st.selectedCabinets[0];
        return tp(T.selectedCabinets, { count: st.selectedCabinets.length });
      }
      function customersLabel() {
        if (!st.selectedCompanies.length) return T.selectDots;
        if (st.selectedCompanies.length === st.customerList.length) return T.allCustomers;
        if (st.selectedCompanies.length === 1) return st.selectedCompanies[0];
        return tp(T.selectedCustomers, { count: st.selectedCompanies.length });
      }

      function applyPreset() {
        const now = new Date();
        let start = new Date();
        let end = new Date();
        const range = (s, e) => { s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999); st.startDate = formatDateForInput(s); st.endDate = formatDateForInput(e); };
        const back = days => { start = new Date(); start.setDate(now.getDate() - days); end = new Date(); end.setDate(now.getDate() - 1); range(start, end); };
        switch (st.selectedDateRangePreset) {
          case 'yesterday': start.setDate(now.getDate() - 1); end.setDate(now.getDate() - 1); range(start, end); break;
          case 'past_week': back(7); break;
          case 'month_to_date': start = new Date(now.getFullYear(), now.getMonth(), 1); end.setDate(now.getDate() - 1); range(start, end); break;
          case 'past_month': back(30); break;
          case 'last_month': range(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0)); break;
          case 'year_to_date': start = new Date(now.getFullYear(), 0, 1); end.setDate(now.getDate() - 1); range(start, end); break;
          case 'past_year': back(365); break;
          case 'last_year': range(new Date(now.getFullYear() - 1, 0, 1), new Date(now.getFullYear() - 1, 11, 31)); break;
          default: break;
        }
      }

      function resetFilters() {
        st.selectedCabinets = []; st.cabinetFilterText = '';
        st.filteredCabinetsList = st.allCabinetsList.slice();
        st.selectedCustomerSelect = ''; st.customerList = []; st.selectedCompanies = []; st.filteredCustomerList = [];
        st.selectedFloorIds = ['T01'];
        st.reportMode = 'hourly'; st.selectedValueType = 'Maximum';
        st.filterDate = ''; st.startTime = '00:00:00'; st.endTime = '23:59:59';
        st.startDate = ''; st.endDate = ''; st.selectedDateRangePreset = 'custom';
        st.grouped = []; st.isPopupLoading = false;
        if (st.isCustomerBasedReport) loadCabinetsForSelectedCustomers(); else loadAllCabinets();
      }

      function toggleDropdown(key) {
        const cur = st.dd[key];
        Object.keys(st.dd).forEach(k => { st.dd[k] = false; });
        if (!cur) st.dd[key] = true;
      }

      // ------------------------------------------------ rapor gruplama (groupedReport)
      function buildLoadRows(aRows, bRows, type) {
        const keyOf = rid => type === 'inlet' ? extractInletKey(rid) : extractOcpKey(rid);
        const keys = new Set();
        aRows.concat(bRows).forEach(r => { const k = keyOf(r.rid); if (k) keys.add(k); });
        const sorted = Array.from(keys).sort((a, b) => {
          const na = Number(a), nb = Number(b);
          return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
        });
        const capOf = rid => {
          const c = st.capacityMap[getCapacityRid(rid)];
          return c && c > 0 ? c : 16;
        };
        return sorted.map(key => {
          const rowA = aRows.find(r => keyOf(r.rid) === key);
          const rowB = bRows.find(r => keyOf(r.rid) === key);
          const loadA = rowA && rowA.result != null ? Number(rowA.result) : 0;
          const loadB = rowB && rowB.result != null ? Number(rowB.result) : 0;
          const capA = rowA ? capOf(rowA.rid) : 0;
          const capB = rowB ? capOf(rowB.rid) : 0;
          const simCap = capA && capB ? Math.min(capA, capB) : Math.max(capA, capB);
          const simLoad = loadA + loadB;
          return {
            label: type === 'inlet' ? 'Inlet ' + key : 'C' + key,
            aLoad: Number(loadA.toFixed(2)), aCapacity: capA, aUtil: calcUtil(loadA, capA),
            bLoad: Number(loadB.toFixed(2)), bCapacity: capB, bUtil: calcUtil(loadB, capB),
            simulationLoad: Number(simLoad.toFixed(2)), simulationCapacity: simCap, simulationUtil: calcUtil(simLoad, simCap)
          };
        });
      }

      function groupReport(raw) {
        const byCab = new Map();
        raw.forEach(r => { if (!byCab.has(r.kabin_ismi)) byCab.set(r.kabin_ismi, []); byCab.get(r.kabin_ismi).push(r); });
        const out = [];
        byCab.forEach(rows => {
          const kabin = extractCabinetNameFromRid(rows[0].rid || rows[0].kabin_ismi);
          const ids = new Set();
          rows.forEach(r => { const m = r.rid.match(/_PDU_([AB]\d*)_/); if (m) ids.add(m[1]); });
          const groups = new Map();
          ids.forEach(id => {
            const g = id.substring(1);
            if (!groups.has(g)) groups.set(g, {});
            if (id[0] === 'A') groups.get(g).a = id; else groups.get(g).b = id;
          });
          groups.forEach(g => {
            if (!g.a || !g.b) return;
            const rx = id => /^[AB]$/.test(id) ? new RegExp('_PDU_' + id + '(?:_|$)') : new RegExp('_PDU_' + id + '_');
            const ra = rx(g.a), rb = rx(g.b);
            const aRows = rows.filter(r => ra.test(r.rid));
            const bRows = rows.filter(r => rb.test(r.rid));
            if (!aRows.length || !bRows.length) return;
            const inletRows = buildLoadRows(aRows, bRows, 'inlet');
            const ocpRows = buildLoadRows(aRows, bRows, 'ocp');
            if (!inletRows.length) return;
            const ref = aRows.find(r => extractInletKey(r.rid)) || bRows.find(r => extractInletKey(r.rid)) || rows[0];
            const zaman = st.reportMode === 'daily' ? (ref.zaman || rows[0].zaman || '') : (rows[0].zaman || '');
            out.push({
              kabin_ismi: kabin,
              pduPairIdentifier: g.a + '/' + g.b,
              zaman,
              dateRange: st.reportMode === 'daily'
                ? formatDateForDisplay(st.startDate) + ' - ' + formatDateForDisplay(st.endDate) + ' (Zirve Anı: ' + formatFullTimestamp(zaman) + ')'
                : (zaman ? dmy(new Date(zaman)) + ' ' + hm(new Date(zaman)) : 'Bilinmiyor'),
              pduAName: getPduName(aRows[0].rid),
              pduBName: getPduName(bRows[0].rid),
              inletRows, ocpRows
            });
          });
        });
        const maxUtil = it => Math.max(0, ...it.inletRows.map(r => r.simulationUtil || 0), ...it.ocpRows.map(r => r.simulationUtil || 0));
        out.sort((a, b) => maxUtil(b) - maxUtil(a));
        return out;
      }

      function generateCabinetReport() {
        if (st.isCustomerBasedReport && !st.selectedCompanies.length) { toast(T.selectCustomerFirst, 'warning'); return; }
        if (!st.selectedCabinets.length) { toast(T.selectCabinetFirst, 'warning'); return; }
        if (timer) { clearInterval(timer); timer = null; }
        st.showPopup = true; st.isPopupLoading = true; st.grouped = [];
        st.chunkProgress = '%0 Başlıyor...'; st.chunkProgressValue = 0;
        // 18 IO / kabin, 20'lik parçalar (CHUNK_SIZE) — ilerleme çubuğu simülasyonu
        const total = Math.max(1, Math.ceil(st.selectedCabinets.length * 18 / 20));
        const stepMs = Math.max(25, Math.min(120, Math.round(1400 / total)));
        let i = 0;
        renderPopup();
        timer = setInterval(() => {
          i++;
          const pct = Math.round((i / total) * 100);
          st.chunkProgress = '%' + pct + ' Tamamlandı'; st.chunkProgressValue = pct;
          if (i >= total) {
            clearInterval(timer); timer = null;
            const res = MOCK.query({
              cabinets: st.selectedCabinets, mode: st.reportMode, valueType: st.selectedValueType,
              startDate: st.startDate, endDate: st.endDate, filterDate: st.filterDate, startTime: st.startTime, endTime: st.endTime
            });
            st.capacityMap = res.capacityMap;
            st.grouped = groupReport(res.rows);
            st.isPopupLoading = false; st.chunkProgress = ''; st.chunkProgressValue = 0;
          }
          renderPopup();
        }, stepMs);
      }

      function closePopup() {
        if (timer) { clearInterval(timer); timer = null; }
        st.showPopup = false; st.isPopupLoading = false;
        renderPopup();
      }

      // ------------------------------------------------------------ dışa aktarım
      function exportRows() {
        const out = [];
        st.grouped.forEach(it => it.inletRows.concat(it.ocpRows).forEach(r => out.push(Object.assign({ date: it.dateRange, cab: it.kabin_ismi }, r))));
        return out;
      }
      function downloadExcel() {
        const stamp = new Date().toISOString().slice(0, 10);
        kit.exportExcel('yuk-devretme-simulasyonu-' + stamp, [
          { header: 'Tarih', value: r => r.date },
          { header: 'Kabin Adı', value: r => r.cab },
          { header: 'Tip (Inlet/OCP)', value: r => r.label },
          { header: 'PDU A Kapasite (A)', value: r => r.aCapacity },
          { header: 'PDU A Yük (A)', value: r => r.aLoad },
          { header: 'PDU A Kullanım (%)', value: r => r.aUtil.toFixed(2) },
          { header: 'PDU B Kapasite (A)', value: r => r.bCapacity },
          { header: 'PDU B Yük (A)', value: r => r.bLoad },
          { header: 'PDU B Kullanım (%)', value: r => r.bUtil.toFixed(2) },
          { header: 'Sim. Yükü (A)', value: r => r.simulationLoad },
          { header: 'Sim. Kullanım (%)', value: r => r.simulationUtil.toFixed(2) }
        ], exportRows());
      }

      // ------------------------------------------------------------------ HTML
      function dropdownInput(id, value, ddKey, placeholder, extraCls, attrs) {
        return '<div class="relative">' +
          '<input type="text" id="' + id + '" value="' + esc(value) + '" data-dd-toggle="' + ddKey + '" class="scada-input pr-8 ' + extraCls + '" ' + attrs + ' placeholder="' + esc(placeholder) + '" />' +
          CHEVRON + '</div>';
      }
      const chkRow = (cls, kind, value, checked, label) =>
        '<label class="' + cls + '"><input type="checkbox" data-chk="' + kind + '" value="' + esc(value) + '"' + (checked ? ' checked' : '') + ' class="' + CHK + '" /><span>' + esc(label) + '</span></label>';

      function cabinetMenu(ddKey) {
        return '<div class="' + MENU_SCROLL + '" data-dd-menu="' + ddKey + '">' +
          chkRow(ALL_ROW, 'cabinet', '__all__', isAllSelected(), T.allCabinets) +
          st.filteredCabinetsList.map(c => chkRow(ITEM_ROW, 'cabinet', c, st.selectedCabinets.includes(c), c)).join('') +
          (st.allCabinetsList.length > 0 && st.filteredCabinetsList.length === 0 ? '<div class="' + NORES + '">' + esc(T.noResults) + '</div>' : '') +
        '</div>';
      }

      function filtersHtml() {
        let h = '';
        // 1. Rapor tipi
        h += '<div class="relative" data-dd-wrap="reportType">' +
          kit.formField({ label: T.reportSelection, control: dropdownInput('report-selector', reportTypeLabel(), 'reportType', 'Seçiniz', 'cursor-pointer', 'readonly') }) +
          (st.dd.reportType ? '<div class="' + MENU + '">' + REPORT_TYPES.map((o, i) => '<div data-rt-opt="' + i + '" class="' + OPT + '">' + esc(o.label) + '</div>').join('') + '</div>' : '') +
        '</div>';

        if (!st.isCustomerBasedReport) {
          // 2a. Kat
          h += '<div class="relative" data-dd-wrap="floor">' +
            kit.formField({ label: T.floorSelection, control: dropdownInput('floor-selector', floorLabel(), 'floor', 'Seçiniz', 'cursor-pointer', 'readonly') }) +
            (st.dd.floor ? '<div class="' + MENU_SCROLL + '">' +
              chkRow(ALL_ROW, 'floor', '__all__', st.selectedFloorIds.length === FLOORS.length, T.allFloors) +
              FLOORS.map(f => chkRow(ITEM_ROW, 'floor', f.id, st.selectedFloorIds.includes(f.id), f.label)).join('') +
            '</div>' : '') +
          '</div>';
          // 2b. Kabin
          h += '<div class="relative" data-dd-wrap="cabinet">' +
            kit.formField({ label: T.cabinetSelection, control: '<div class="relative"><input type="text" id="cabinet-filter" value="' + esc(cabinetsLabel()) + '" data-dd-toggle="cabinet" data-filter-input="cabinet" placeholder="' + esc(T.cabinetPlaceholder) + '" class="scada-input pr-8" autocomplete="off" />' + CHEVRON + '</div>' }) +
            (st.dd.cabinet ? cabinetMenu('cabinet') : '') +
          '</div>';
        } else {
          // 3a. Müşteri tipi
          const csVal = st.selectedCustomerSelect === INTERNAL ? T.internalCustomerSelected : st.selectedCustomerSelect === EXTERNAL ? T.externalCustomerSelected : T.selectCustomer;
          h += '<div class="relative" data-dd-wrap="customerSelect">' +
            kit.formField({ label: T.customerSelection, control: dropdownInput('customer-select', csVal, 'customerSelect', T.selectCustomer, 'cursor-pointer', 'readonly') }) +
            (st.dd.customerSelect ? '<div class="' + MENU + '">' +
              chkRow(ITEM_ROW, 'custsel', INTERNAL, st.selectedCustomerSelect === INTERNAL, T.internalCustomers) +
              chkRow(ITEM_ROW, 'custsel', EXTERNAL, st.selectedCustomerSelect === EXTERNAL, T.externalCustomers) +
            '</div>' : '') +
          '</div>';
          // 3b. Şirket / müşteri
          const on = !!st.selectedCustomerSelect;
          h += '<div class="relative" data-dd-wrap="customer">' +
            kit.formField({ label: T.companyCustomer, control: dropdownInput('customer-filter', customersLabel(), on ? 'customer' : '', T.selectCustomer, on ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed', 'readonly') }) +
            (st.dd.customer && on ? '<div class="' + MENU_SCROLL + '">' +
              chkRow(ALL_ROW, 'customer', '__all__', st.customerList.length > 0 && st.selectedCompanies.length === st.customerList.length, T.allCustomers) +
              st.filteredCustomerList.map(c => chkRow(ITEM_ROW, 'customer', c, st.selectedCompanies.includes(c), c)).join('') +
              (st.customerList.length > 0 && st.filteredCustomerList.length === 0 ? '<div class="' + NORES + '">' + esc(T.noResults) + '</div>' : '') +
            '</div>' : '') +
          '</div>';
          // 3c. Müşteri kabinleri
          h += '<div class="relative" data-dd-wrap="customerCabinet">' +
            kit.formField({ label: T.cabinetSelection, control: '<div class="relative"><input type="text" id="customer-cabinet-filter" value="' + esc(cabinetsLabel()) + '" data-dd-toggle="customerCabinet" data-filter-input="customerCabinet" placeholder="' + esc(T.cabinetPlaceholder) + '" class="scada-input pr-8"' + (st.selectedCompanies.length === 0 ? ' disabled' : '') + ' autocomplete="off" />' + CHEVRON + '</div>' }) +
            (st.dd.customerCabinet ? cabinetMenu('customerCabinet') : '') +
          '</div>';
        }

        // 4. Rapor periyodu
        h += '<div class="space-y-1.5">' +
          '<label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(T.reportPeriod) + '</label>' +
          '<div class="flex items-center gap-4 pt-2">' +
            '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"><input type="radio" id="mode-daily" name="fo-mode" value="daily" data-mode' + (st.reportMode === 'daily' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.dateRange) + '</span></label>' +
            '<label class="inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"><input type="radio" id="mode-hourly" name="fo-mode" value="hourly" data-mode' + (st.reportMode === 'hourly' ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.hourly) + '</span></label>' +
          '</div>' +
        '</div>';

        // 5. Değer türü
        h += '<div class="relative" data-dd-wrap="valueType">' +
          kit.formField({ label: T.valueType, control: dropdownInput('value-type', valueTypeLabel(), 'valueType', 'Seçiniz', 'cursor-pointer', 'readonly') }) +
          (st.dd.valueType ? '<div class="' + MENU + '">' + VALUE_TYPES.map((o, i) => '<div data-vt-opt="' + i + '" class="' + OPT + '">' + esc(o.label) + '</div>').join('') + '</div>' : '') +
        '</div>';

        if (st.reportMode === 'hourly') {
          h += kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-model="filterDate" value="' + esc(st.filterDate) + '" class="scada-input" />' });
          h += '<div class="grid grid-cols-2 gap-2">' +
            kit.formField({ label: T.startTime, control: '<input type="time" id="start-time" step="1" data-model="startTime" value="' + esc(st.startTime) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endTime, control: '<input type="time" id="end-time" step="1" data-model="endTime" value="' + esc(st.endTime) + '" class="scada-input" />' }) +
          '</div>';
        } else {
          h += '<div class="relative" data-dd-wrap="datePreset">' +
            kit.formField({ label: T.quickSelection, control: dropdownInput('date-preset', presetLabel(), 'datePreset', T.presetsPlaceholder, 'cursor-pointer', 'readonly') }) +
            (st.dd.datePreset ? '<div class="' + MENU_SCROLL + '">' + PRESETS.map((p, i) => '<div data-dp-opt="' + i + '" class="' + OPT + '">' + esc(p.label) + '</div>').join('') + '</div>' : '') +
          '</div>';
          h += kit.formField({ label: T.startDate, control: '<input type="datetime-local" id="start-datetime" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input" />' });
          h += kit.formField({ label: T.endDate, control: '<input type="datetime-local" id="end-datetime" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input" />' });
        }
        return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + h + '</div>';
      }

      function renderMain() {
        const genDisabled = st.selectedCabinets.length === 0;
        const actions =
          button({ variant: 'primary', icon: 'pi pi-file', label: T.generateReport, attrs: 'data-act="generate"' + (genDisabled ? ' disabled' : '') });
        mainEl.innerHTML =
          kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.menuReports }, { label: T.title }], actions }) +
          kit.card({ title: T.title, icon: 'pi pi-filter', body: filtersHtml() });
      }

      function utilCell(v, last) {
        return '<td class="p-2 text-right' + (last ? '' : ' border-r border-slate-200 dark:border-border-subtle') + ' font-bold ' + (v > 80 ? UTIL_WARN : UTIL_OK) + '">' + num(v) + '%</td>';
      }
      function rowHtml(r) {
        return '<tr class="hover:bg-slate-100/50 dark:hover:bg-surface-hover/50 transition-colors">' +
          '<td class="p-2 font-sans font-semibold text-slate-800 dark:text-slate-200 bg-slate-100/50 dark:bg-surface-panel/30 border-r border-slate-200 dark:border-border-subtle">' + esc(r.label) + '</td>' +
          '<td class="' + TD_NUM + '">' + num(r.aCapacity) + '</td>' +
          '<td class="' + TD_NUM + '">' + num(r.aLoad) + '</td>' +
          utilCell(r.aUtil) +
          '<td class="' + TD_NUM + '">' + num(r.bCapacity) + '</td>' +
          '<td class="' + TD_NUM + '">' + num(r.bLoad) + '</td>' +
          utilCell(r.bUtil) +
          '<td class="p-2 text-right text-sky-700 dark:text-sky-300 font-semibold border-r border-slate-200 dark:border-border-subtle bg-sky-50 dark:bg-sky-950/20">' + num(r.simulationLoad) + '</td>' +
          '<td class="p-2 text-right font-bold ' + (r.simulationUtil > 80 ? SIM_CRIT : UTIL_OK) + '"><span>' + num(r.simulationUtil) + '%</span>' + (r.simulationUtil > 80 ? '<span class="ml-1">⚠️</span>' : '') + '</td>' +
        '</tr>';
      }
      function pairHtml(p) {
        return '<div class="bg-slate-50/70 dark:bg-surface-panel/40 border border-slate-200 dark:border-border-subtle rounded-[2px] p-4 space-y-3">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-border-subtle pb-2">' +
            '<h4 class="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="pi pi-box text-sky-500 dark:text-sky-400"></i><span>' + esc(T.cabinet) + ': ' + esc(p.kabin_ismi) + '</span></h4>' +
            '<span class="text-xs text-slate-500 dark:text-slate-400 font-mono">' + esc(p.dateRange) + ' (' + esc(st.selectedValueType) + ')</span>' +
          '</div>' +
          (st.reportMode === 'daily' ? '<h5 class="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><i class="pi pi-clock text-amber-600 dark:text-amber-400"></i><span>' + esc(formatPeakTimeAsTitle(p.zaman)) + '</span></h5>' : '') +
          '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
            '<table class="w-full text-xs text-left border-collapse"><thead>' +
              '<tr class="bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-border-subtle">' +
                '<th rowspan="2" class="p-2 border-r border-slate-200 dark:border-border-subtle min-w-[120px]"></th>' +
                '<th colspan="3" class="p-2 text-center border-r border-slate-200 dark:border-border-subtle bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold border-b border-slate-200 dark:border-border-subtle">' + esc(p.pduAName) + ' (PDU A)</th>' +
                '<th colspan="3" class="p-2 text-center border-r border-slate-200 dark:border-border-subtle bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 font-bold border-b border-slate-200 dark:border-border-subtle">' + esc(p.pduBName) + ' (PDU B)</th>' +
                '<th colspan="2" class="p-2 text-center bg-purple-100 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 font-bold border-b border-slate-200 dark:border-border-subtle">' + esc(T.simulationFailover) + '</th>' +
              '</tr>' +
              '<tr class="bg-slate-50 dark:bg-surface-panel/80 text-slate-600 dark:text-slate-400 font-medium text-[11px] border-b border-slate-200 dark:border-border-subtle">' +
                [T.capacity, T.load, T.utilization, T.capacity, T.load, T.utilization, T.simLoad].map(t => '<th class="' + TH_SUB + '">' + esc(t) + '</th>').join('') +
                '<th class="p-1.5 text-right">' + esc(T.utilization) + '</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody class="divide-y divide-slate-200 dark:divide-border-subtle font-mono text-[11px]">' +
              p.inletRows.map(rowHtml).join('') + p.ocpRows.map(rowHtml).join('') +
            '</tbody></table>' +
          '</div>' +
        '</div>';
      }

      function renderPopup() {
        if (!st.showPopup) { popupEl.innerHTML = ''; return; }
        const noData = st.grouped.length === 0;
        const dis = noData ? ' disabled' : '';
        let body = '';
        if (st.isPopupLoading) {
          body = '<div class="py-16 flex flex-col items-center justify-center text-center">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 dark:text-sky-400 text-3xl mb-3"></i>' +
            '<p class="text-slate-700 dark:text-slate-200 text-sm font-medium mb-4">' + esc(T.loadingPreparing) + '</p>' +
            (st.chunkProgress ? '<div class="w-full max-w-md space-y-2">' +
              '<div class="w-full bg-slate-100 dark:bg-surface-panel h-2 rounded-[2px] overflow-hidden border border-slate-200 dark:border-border-subtle">' +
                '<div class="bg-sky-500 h-full transition-all duration-300" style="width:' + st.chunkProgressValue + '%"></div>' +
              '</div>' +
              '<p class="text-slate-500 dark:text-slate-400 text-xs font-mono">' + esc(st.chunkProgress) + '</p>' +
            '</div>' : '') +
          '</div>';
        } else if (!noData) {
          body = '<div class="space-y-8">' + st.grouped.map(pairHtml).join('') +
            '<div class="p-3 bg-slate-100 dark:bg-surface-panel/60 border border-slate-200 dark:border-border-subtle rounded-[2px] text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">' +
              '<i class="pi pi-info-circle text-sky-500 dark:text-sky-400 text-sm mt-0.5"></i>' +
              '<p><strong class="text-slate-800 dark:text-slate-200">' + esc(T.disclaimerTitle) + '</strong><span> ' + esc(T.disclaimerText) + '</span></p>' +
            '</div>' +
          '</div>';
        } else {
          body = kit.emptyState({ message: T.noData });
        }
        const scroll = popupEl.querySelector('[data-popup-body]');
        const keepTop = scroll ? scroll.scrollTop : 0;
        popupEl.innerHTML =
          '<div class="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-md z-[100000] flex items-center justify-center p-4 overflow-y-auto" data-popup-backdrop>' +
            '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden my-auto">' +
              '<div class="p-4 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-surface-panel/50">' +
                '<div class="flex items-center gap-3">' +
                  '<h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><i class="pi pi-sliders-h text-sky-500 dark:text-sky-400"></i><span>' + esc(T.popupTitle) + '</span></h3>' +
                  statusBadge('info', valueTypeLabel()) +
                '</div>' +
                '<div class="flex items-center gap-2">' +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-pdf', label: T.pdfDownload, attrs: 'data-act="pdf"' + dis }) +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-excel', label: T.excelDownload, attrs: 'data-act="excel"' + dis }) +
                  button({ variant: 'secondary', size: 'sm', icon: 'pi pi-file-archive', label: T.zipDownload, attrs: 'data-act="zip"' + dis }) +
                  '<button type="button" data-act="close" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] transition-colors"><i class="pi pi-times"></i></button>' +
                '</div>' +
              '</div>' +
              '<div class="p-4 overflow-y-auto flex-1 space-y-6" data-popup-body>' + body + '</div>' +
            '</div>' +
          '</div>';
        const nb = popupEl.querySelector('[data-popup-body]');
        if (nb && st.isPopupLoading === false && keepTop) nb.scrollTop = keepTop;
      }

      // ------------------------------------------------------------------ olaylar
      el.innerHTML = '<div class="space-y-4"><div class="space-y-4" data-fo-main></div><div data-fo-popup></div></div>';
      const mainEl = el.querySelector('[data-fo-main]');
      const popupEl = el.querySelector('[data-fo-popup]');

      function onClick(e) {
        const t = e.target;
        if (t.closest('[data-popup-backdrop]') && t.matches('[data-popup-backdrop]')) { closePopup(); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
          const a = act.getAttribute('data-act');
          if (a === 'reset') { resetFilters(); renderMain(); }
          else if (a === 'generate') generateCabinetReport();
          else if (a === 'close') closePopup();
          else if (a === 'excel') downloadExcel();
          else if (a === 'pdf') kit.exportPdf();
          else if (a === 'zip') { downloadExcel(); kit.exportPdf(); }
          return;
        }
        const opt = t.closest('[data-rt-opt],[data-vt-opt],[data-dp-opt]');
        if (opt) {
          if (opt.hasAttribute('data-rt-opt')) {
            st.isCustomerBasedReport = REPORT_TYPES[+opt.getAttribute('data-rt-opt')].value;
            resetFilters();
            st.dd.reportType = false;
          } else if (opt.hasAttribute('data-vt-opt')) {
            st.selectedValueType = VALUE_TYPES[+opt.getAttribute('data-vt-opt')].value;
            st.dd.valueType = false;
          } else {
            st.selectedDateRangePreset = PRESETS[+opt.getAttribute('data-dp-opt')].value;
            applyPreset();
            st.dd.datePreset = false;
          }
          renderMain();
          return;
        }
        const tog = t.closest('[data-dd-toggle]');
        if (tog && tog.getAttribute('data-dd-toggle')) {
          const key = tog.getAttribute('data-dd-toggle');
          // Yazılabilir kabin kutusu: zaten açıksa tıklama kapatmasın, odağı koru
          if (tog.hasAttribute('data-filter-input') && st.dd[key]) return;
          toggleDropdown(key);
          renderMain();
          if (tog.hasAttribute('data-filter-input')) {
            const inp = mainEl.querySelector('[data-filter-input="' + key + '"]');
            if (inp) inp.focus();
          }
        }
      }

      function onChange(e) {
        const t = e.target;
        if (t.matches('[data-chk]')) {
          const kind = t.getAttribute('data-chk');
          const v = t.value;
          const on = t.checked;
          if (kind === 'floor') {
            if (v === '__all__') st.selectedFloorIds = on ? FLOORS.map(f => f.id) : [];
            else if (on && !st.selectedFloorIds.includes(v)) st.selectedFloorIds.push(v);
            else if (!on) st.selectedFloorIds = st.selectedFloorIds.filter(x => x !== v);
            loadAllCabinets();
          } else if (kind === 'cabinet') {
            if (v === '__all__') st.selectedCabinets = on ? st.allCabinetsList.slice() : [];
            else if (on && !st.selectedCabinets.includes(v)) st.selectedCabinets.push(v);
            else if (!on) st.selectedCabinets = st.selectedCabinets.filter(x => x !== v);
          } else if (kind === 'custsel') {
            st.selectedCompanies = [];
            if (on) { st.selectedCustomerSelect = v; st.isCustomerBasedReport = true; loadCustomers(v === INTERNAL ? '1' : '0'); }
            else { st.selectedCustomerSelect = ''; st.customerList = []; st.filteredCustomerList = []; loadCabinetsForSelectedCustomers(); }
          } else if (kind === 'customer') {
            if (v === '__all__') st.selectedCompanies = on ? st.customerList.slice() : [];
            else if (on && !st.selectedCompanies.includes(v)) st.selectedCompanies.push(v);
            else if (!on) st.selectedCompanies = st.selectedCompanies.filter(x => x !== v);
            loadCabinetsForSelectedCustomers();
          }
          renderMain();
          return;
        }
        if (t.matches('[data-mode]')) { st.reportMode = t.value; renderMain(); return; }
        if (t.matches('[data-model]')) st[t.getAttribute('data-model')] = t.value;
      }

      function onInput(e) {
        const t = e.target;
        if (t.matches('[data-model]')) { st[t.getAttribute('data-model')] = t.value; return; }
        if (!t.matches('[data-filter-input]')) return;
        // onFilterInput('cabinet'): yalnızca açılır listeyi güncelle (yazılan metin korunur)
        const key = t.getAttribute('data-filter-input');
        const q = t.value.toLowerCase();
        st.filteredCabinetsList = q ? st.allCabinetsList.filter(c => c.toLowerCase().includes(q)) : st.allCabinetsList.slice();
        Object.keys(st.dd).forEach(k => { st.dd[k] = k === key; });
        const wrap = t.closest('[data-dd-wrap]');
        const old = wrap.querySelector('[data-dd-menu]');
        const tmp = document.createElement('div');
        tmp.innerHTML = cabinetMenu(key);
        if (old) old.replaceWith(tmp.firstChild); else wrap.appendChild(tmp.firstChild);
      }

      // Açılır liste dışına tıklanınca kapat (HostListener document:click)
      function onDocClick(e) {
        if (!e.target.isConnected) return; // yeniden çizim sırasında ayrılmış hedef
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

      // İlk durum (ngOnInit) + sunum için hazır seçim: son 7 gün, senaryo kabinleri
      loadAllCabinets();
      st.selectedDateRangePreset = 'past_week';
      applyPreset();
      st.selectedCabinets = DEMO_CABINETS.filter(c => st.allCabinetsList.includes(c));
      renderMain();
      renderPopup();

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
