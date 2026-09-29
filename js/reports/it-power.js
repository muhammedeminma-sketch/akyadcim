/* ==========================================================================
   DCIM Sunum — IT Güç Tüketim Raporu (NewUICMPItPowerReportComponent)
   Kaynak: new-ui/pages/reporting/it-power-report/
   - Filtre kartı: Kat Seçimi, Rapor Periyodu (Anlık/Günlük/Haftalık/Aylık/Özel), cihaz sayısı, tarih
   - Kat bilgi kartları (seçili / seçili değil)
   - "Rapor Oluştur" → En çok güç harcayan IT cihazları penceresi (sıralama rozeti, PDF/Excel/ZIP)
   Ortak yardımcılar: DCIM.r5 (js/reports/climate.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  (DCIM.reportRegistry = DCIM.reportRegistry || {})['it-power'] = {
    mount(el) {
      const { esc, toast, statusBadge } = DCIM.ui;
      const kit = DCIM.kit;
      const R5 = DCIM.r5;
      const MOCK = DCIM.data.reports.itPower;

      // messages.tr.json → reportItPower.*
      const T = {
        title: 'IT CİHAZLARI GÜÇ TÜKETİM RAPORLAMA', menuReports: 'Raporlar', loadingData: 'Veriler Yükleniyor...',
        katSelection: 'KAT SEÇİMİ:', allFloors: 'Tüm Katlar', floorPlaceholder: 'Kat seçiniz', reportPeriod: 'RAPOR PERİYODU:',
        periods: { instant: 'Anlık', daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık', custom: 'Özel Aralık' },
        showDeviceCount: 'GÖSTERİLECEK CİHAZ SAYISI:', firstN: 'İlk {count}',
        instantInfo: 'Anlık sorgu — Son 15 dakikanın maksimum değerleri alınır',
        date: 'TARİH:', startDate: 'BAŞLANGIÇ TARİHİ:', endDate: 'BİTİŞ TARİHİ:',
        clear: 'Temizle', generateReport: 'Rapor Oluştur', loading: 'Yükleniyor...', selected: 'Seçili', notSelected: 'Seçili Değil',
        popupTitle: 'IT Güç Tüketim Raporu', pdfDownload: 'PDF İndir', excelDownload: 'Excel İndir', zipDownload: 'ZIP İndir',
        processingData: 'Veriler İşleniyor, Lütfen Bekleyiniz...',
        groupLabel: '{period} - En Çok Güç Harcayan IT Cihazları (İlk {count})',
        colRank: '#', colFloor: 'Kat', colDeviceName: 'Cihaz Adı', colMaxPower: 'Maksimum Güç', colDate: 'Tarih / Saat',
        noData: 'Seçilen kriterlere uygun IT güç verisi bulunamadı.', progressCompleted: '%{percent} Tamamlandı',
        alertDate: 'Lütfen geçerli bir tarih aralığı seçin.'
      };
      const fill = (s, p) => Object.keys(p || {}).reduce((a, k) => a.replace('{' + k + '}', p[k]), s);

      const KATS = [
        { value: 'CMR/T01', label: '1.Kat' },
        { value: 'CMR/T02', label: '2.Kat' },
        { value: 'CMR/T03', label: '3.Kat' },
        { value: 'CMR/T04', label: 'IDC4' }
      ];
      const PERIODS = ['instant', 'daily', 'weekly', 'monthly', 'custom'];
      const TOP_N = [5, 10, 20, 50, 100];
      const RID_FLOOR = { K1S1: '1.Kat', K2S1: '2.Kat', K3S1: '3.Kat', IDC4: 'IDC4' };

      const state = {
        selectedKats: KATS.map(k => k.value),
        reportPeriod: 'daily',
        filterDate: '', startDate: '', endDate: '',
        topN: 10,
        dropdown: '',
        showDataPopup: false, isLoadingData: false,
        progressMessage: '', progressPercent: 0,
        popupData: []
      };
      let cancelChunks = null;

      // applyPeriodDates()
      function applyPeriodDates() {
        const now = new Date();
        const today = DCIM.ui.fmtDateKey(now);
        state.filterDate = ''; state.startDate = ''; state.endDate = '';
        if (state.reportPeriod === 'daily') state.filterDate = today;
        else if (state.reportPeriod === 'weekly') { const w = new Date(now); w.setDate(now.getDate() - 7); state.startDate = DCIM.ui.fmtDateKey(w); state.endDate = today; }
        else if (state.reportPeriod === 'monthly') { state.startDate = DCIM.ui.fmtDateKey(new Date(now.getFullYear(), now.getMonth(), 1)); state.endDate = today; }
      }
      const allKats = () => state.selectedKats.length === KATS.length;
      const katLabel = () => {
        if (allKats()) return T.allFloors;
        if (!state.selectedKats.length) return '';
        return state.selectedKats.map(v => (KATS.find(k => k.value === v) || { label: v }).label).join(', ');
      };
      const isFormValid = () => {
        if (!state.selectedKats.length) return false;
        if (state.reportPeriod === 'instant') return true;
        if (state.reportPeriod === 'daily') return !!state.filterDate;
        return !!state.startDate && !!state.endDate;
      };
      const hasData = () => state.popupData.length > 0 && state.popupData.some(g => g.results.length > 0);

      // extractDeviceName() — güç soneklerini at, '_' → boşluk
      function deviceName(rid) {
        if (!rid) return 'N/A';
        let name = rid;
        const suffixes = ['_TOT_POW', '_TOT_RPW', '_TOT_APW', '_PA_POW', '_PB_POW', '_PC_POW', '_IN_POW', '_OUT_POW', '_UNITPOW', '_POW', '_POWER'];
        for (const s of suffixes) { if (name.toUpperCase().endsWith(s)) { name = name.substring(0, name.length - s.length); break; } }
        return name.replace(/_/g, ' ').trim();
      }
      const formatPower = v => isNaN(v) ? '0 W' : v >= 1000 ? (v / 1000).toFixed(2) + ' kW' : v.toFixed(2) + ' W';

      // buildPopupData()
      function buildPopupData(raw) {
        if (!raw.length) { state.popupData = []; return; }
        const map = new Map();
        raw.forEach(it => { const ex = map.get(it.rid); if (!ex || parseFloat(it.max) > parseFloat(ex.max)) map.set(it.rid, it); });
        const items = Array.from(map.values()).map(it => {
          const v = parseFloat(it.max) || 0;
          return {
            // Kaynakta extractKatFromDoc() '-' döndürür; sunumda RID önekinden kat gösterilir
            cmr: RID_FLOOR[String(it.rid).split('_')[0]] || '-',
            deviceId: it.rid, deviceDesc: deviceName(it.rid), value: formatPower(v), numericValue: v,
            date: it.tim ? new Date(it.tim).toLocaleString('tr-TR') : 'N/A'
          };
        }).sort((a, b) => b.numericValue - a.numericValue);
        state.popupData = [{ label: fill(T.groupLabel, { period: T.periods[state.reportPeriod], count: state.topN }), period: state.reportPeriod, results: items.slice(0, state.topN) }];
      }

      // --- Şablon -----------------------------------------------------------------
      const RADIO = 'inline-flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200 cursor-pointer';
      function filtersHtml() {
        const kat = '<div class="relative" data-dd="kat">' +
          kit.formField({ label: T.katSelection, control: '<div class="relative"><input type="text" id="kat-filter" value="' + esc(katLabel()) + '" data-dd-toggle="kat" placeholder="' + esc(T.floorPlaceholder) + '" class="scada-input pr-8 cursor-pointer" autocomplete="off" readonly /><i class="pi pi-chevron-down absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i></div>' }) +
          (state.dropdown === 'kat' ? '<div class="absolute left-0 right-0 mt-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl z-50 max-h-56 overflow-y-auto p-1 space-y-0.5">' +
            '<label class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer">' +
              '<input type="checkbox" data-all-kats' + (allKats() ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /><span>' + esc(T.allFloors) + '</span></label>' +
            KATS.map(k => '<label class="flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-surface-hover rounded-[2px] text-xs text-slate-800 dark:text-slate-200 cursor-pointer">' +
              '<input type="checkbox" data-kat="' + esc(k.value) + '"' + (state.selectedKats.indexOf(k.value) >= 0 ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /><span>' + esc(k.label) + '</span></label>').join('') +
          '</div>' : '') + '</div>';
        const period = '<div class="space-y-1.5 md:col-span-2">' +
          '<label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(T.reportPeriod) + '</label>' +
          '<div class="flex flex-wrap items-center gap-4 pt-1.5">' +
            PERIODS.map(p => '<label class="' + RADIO + '"><input type="radio" name="itp-period" value="' + p + '" data-period' + (state.reportPeriod === p ? ' checked' : '') + ' class="text-sky-600 focus:ring-sky-500" /><span>' + esc(T.periods[p]) + '</span></label>').join('') +
          '</div></div>';
        const topN = kit.formField({
          label: T.showDeviceCount,
          control: '<select class="scada-select" data-topn>' + TOP_N.map(n => '<option value="' + n + '"' + (state.topN === n ? ' selected' : '') + '>' + esc(fill(T.firstN, { count: n })) + '</option>').join('') + '</select>'
        });
        let dates = '';
        if (state.reportPeriod === 'instant') {
          dates = '<div class="md:col-span-2 flex items-center pt-5"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30"><i class="pi pi-info-circle text-sky-400"></i> ' + esc(T.instantInfo) + '</span></div>';
        } else if (state.reportPeriod === 'daily') {
          dates = kit.formField({ label: T.date, control: '<input type="date" id="filter-date" data-field="filterDate" value="' + esc(state.filterDate) + '" class="scada-input" />' });
        } else {
          dates = kit.formField({ label: T.startDate, control: '<input type="date" id="start-date" data-field="startDate" value="' + esc(state.startDate) + '" class="scada-input" />' }) +
            kit.formField({ label: T.endDate, control: '<input type="date" id="end-date" data-field="endDate" value="' + esc(state.endDate) + '" class="scada-input" />' });
        }
        return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' + kat + period + topN + dates + '</div>';
      }

      // app-status-badge 'inactive' sınıfları (DCIM.ui.statusBadge bu durumu ayrıca eşlemiyor)
      const inactiveBadge = label => '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40">' +
        '<span class="w-1.5 h-1.5 rounded-full animate-pulse bg-slate-400"></span>' + esc(label) + '</span>';

      function katCardsHtml() {
        return '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">' + KATS.map(k => {
          const on = state.selectedKats.indexOf(k.value) >= 0;
          return '<div class="bg-white dark:bg-surface-card border rounded-[2px] p-3.5 flex items-center justify-between transition-all shadow-sm ' + (on ? 'border-sky-500/50 bg-sky-500/5 dark:bg-sky-950/20' : 'border-slate-200 dark:border-border-subtle opacity-75') + '">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-9 h-9 rounded-[2px] bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center text-sky-500"><i class="pi pi-building text-base"></i></div>' +
              '<div><div class="text-xs font-semibold text-slate-800 dark:text-slate-200">' + esc(k.label) + '</div>' +
                '<div class="text-[11px] mt-0.5 ' + (on ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400') + '">' + esc(on ? T.selected : T.notSelected) + '</div></div>' +
            '</div>' +
            (on ? statusBadge('active', T.selected) : inactiveBadge(T.notSelected)) +
          '</div>';
        }).join('') + '</div>';
      }

      function mainHtml() {
        const actions =
          R5.button({ variant: 'primary', icon: 'pi pi-file', label: state.isLoadingData ? T.loading : T.generateReport, loading: state.isLoadingData, disabled: !isFormValid() || state.isLoadingData, attrs: 'data-act="report"' });
        return kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.menuReports }, { label: T.title }], actions }) +
          kit.card({ title: T.title, icon: 'pi pi-filter', body: filtersHtml() }) +
          katCardsHtml();
      }

      const RANK_CLS = ['bg-amber-400/20 text-amber-500 border border-amber-400/40', 'bg-slate-300/20 text-slate-400 border border-slate-300/40', 'bg-amber-700/20 text-amber-600 border border-amber-700/40'];
      function popupHtml() {
        if (!state.showDataPopup) return '';
        const off = !hasData() || state.isLoadingData;
        let body;
        if (state.isLoadingData) {
          body = '<div class="flex flex-col items-center justify-center py-12">' +
            '<i class="pi pi-spin pi-spinner text-sky-500 text-3xl mb-3"></i>' +
            '<p class="text-sm text-slate-600 dark:text-slate-300 font-medium">' + esc(T.processingData) + '</p>' +
            (state.progressMessage ? '<div class="w-64 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden mt-3"><div class="bg-sky-500 h-full transition-all duration-300" style="width: ' + state.progressPercent + '%"></div></div>' +
              '<p class="text-xs text-sky-500 font-mono mt-1">' + esc(state.progressMessage) + '</p>' : '') +
          '</div>';
        } else if (hasData()) {
          body = '<div class="space-y-4">' + state.popupData.map(g =>
            '<div class="space-y-2">' +
              '<div class="text-xs font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-2"><i class="pi pi-list"></i><span>' + esc(g.label) + '</span></div>' +
              '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
                '<table class="w-full text-xs text-left text-slate-700 dark:text-slate-300">' +
                  '<thead class="bg-slate-100 dark:bg-surface-panel text-slate-800 dark:text-slate-200 uppercase font-semibold text-[11px] border-b border-slate-200 dark:border-border-subtle"><tr>' +
                    '<th class="px-3 py-2.5 w-16 text-center">' + esc(T.colRank) + '</th>' +
                    [T.colFloor, T.colDeviceName, T.colMaxPower, T.colDate].map(h => '<th class="px-3 py-2.5">' + esc(h) + '</th>').join('') +
                  '</tr></thead>' +
                  '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
                    g.results.map((it, i) =>
                      '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover/50">' +
                        '<td class="px-3 py-2 text-center"><span class="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ' + (RANK_CLS[i] || 'text-slate-400') + '">' + (i + 1) + '</span></td>' +
                        '<td class="px-3 py-2 font-medium">' + esc(it.cmr) + '</td>' +
                        '<td class="px-3 py-2 text-slate-900 dark:text-slate-100 font-medium">' + esc(it.deviceDesc) + '</td>' +
                        '<td class="px-3 py-2 font-mono font-semibold ' + (it.numericValue >= 1000 ? 'text-rose-500 dark:text-rose-400' : 'text-sky-600 dark:text-sky-400') + '">' + esc(it.value) + '</td>' +
                        '<td class="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono">' + esc(it.date) + '</td>' +
                      '</tr>').join('') +
                  '</tbody></table></div>' +
            '</div>').join('') + '</div>';
        } else {
          body = kit.emptyState({ icon: 'pi pi-inbox', message: T.noData });
        }
        return '<div class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100000] flex items-center justify-center p-4" data-popup-backdrop>' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">' +
            '<div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel">' +
              '<h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-desktop text-sky-500"></i><span>' + esc(T.popupTitle + ' - ' + T.periods[state.reportPeriod]) + '</span></h3>' +
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

      el.innerHTML = '<div class="space-y-4" data-main></div><div data-popup></div>';
      const mainEl = el.querySelector('[data-main]');
      const popupEl = el.querySelector('[data-popup]');
      const render = () => { mainEl.innerHTML = mainHtml(); };
      const renderPopup = () => { popupEl.innerHTML = popupHtml(); };

      // --- İş mantığı -------------------------------------------------------------
      function applyFilters() {
        if (!isFormValid()) { toast(T.alertDate, 'warning'); return; }
        if (cancelChunks) cancelChunks();
        state.showDataPopup = true;
        state.isLoadingData = true;
        state.popupData = [];
        state.progressPercent = 0;
        render(); renderPopup();
        // fetchItDeviceIds() + 15'lik parçalar (kabin başına 2 PDU besleme sayacı)
        const total = Math.max(1, Math.ceil(state.selectedKats.length * DCIM.data.cabinets.length * 2 / 15 / 12));
        cancelChunks = R5.simulateChunks(total, pct => {
          state.progressMessage = fill(T.progressCompleted, { percent: pct });
          state.progressPercent = pct;
          renderPopup();
        }, () => {
          cancelChunks = null;
          buildPopupData(MOCK.query({ kats: state.selectedKats, period: state.reportPeriod, filterDate: state.filterDate, startDate: state.startDate, endDate: state.endDate }));
          state.isLoadingData = false;
          state.progressMessage = ''; state.progressPercent = 0;
          render(); renderPopup();
        }, 90);
      }

      function closeDataPopup() {
        if (cancelChunks) { cancelChunks(); cancelChunks = null; }
        state.showDataPopup = false;
        state.popupData = [];
        state.isLoadingData = false;
        state.progressMessage = ''; state.progressPercent = 0;
        render(); renderPopup();
      }

      function clearFilters() {
        state.selectedKats = KATS.map(k => k.value);
        state.reportPeriod = 'daily';
        state.topN = 10;
        state.dropdown = '';
        applyPeriodDates();
        render();
      }

      const rows = () => state.popupData.reduce((a, g) => a.concat(g.results.map((it, i) => Object.assign({ rank: i + 1 }, it))), []);
      const excelColumns = [
        { header: T.colRank, value: r => r.rank },
        { header: T.colFloor, value: r => r.cmr },
        { header: 'Cihaz ID', value: r => r.deviceId },
        { header: T.colDeviceName, value: r => r.deviceDesc },
        { header: T.colMaxPower, value: r => r.value },
        { header: T.colDate, value: r => r.date }
      ];

      // --- Olaylar ----------------------------------------------------------------
      function onClick(e) {
        const t = e.target;
        if (t.hasAttribute('data-popup-backdrop')) { closeDataPopup(); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
          const a = act.getAttribute('data-act');
          if (a === 'clear') clearFilters();
          else if (a === 'report') applyFilters();
          else if (a === 'close-popup') closeDataPopup();
          else if (a === 'pdf') kit.exportPdf();
          else if (a === 'excel') kit.exportExcel('it_guc_tuketim_raporu', excelColumns, rows());
          else if (a === 'zip') { kit.exportExcel('it_guc_tuketim_raporu_' + DCIM.ui.fmtDateKey(new Date()), excelColumns, rows()); kit.exportPdf(); }
          return;
        }
        if (t.closest('[data-dd-toggle]')) { state.dropdown = state.dropdown === 'kat' ? '' : 'kat'; render(); }
      }

      function onChange(e) {
        const t = e.target;
        if (t.hasAttribute('data-all-kats')) { state.selectedKats = t.checked ? KATS.map(k => k.value) : []; render(); return; }
        if (t.hasAttribute('data-kat')) {
          const v = t.getAttribute('data-kat');
          if (t.checked) { if (state.selectedKats.indexOf(v) < 0) state.selectedKats.push(v); } else state.selectedKats = state.selectedKats.filter(x => x !== v);
          state.selectedKats.sort((a, b) => KATS.findIndex(k => k.value === a) - KATS.findIndex(k => k.value === b));
          render(); return;
        }
        if (t.hasAttribute('data-period')) { state.reportPeriod = t.value; applyPeriodDates(); render(); return; }
        if (t.hasAttribute('data-topn')) { state.topN = Number(t.value); return; }
        if (t.hasAttribute('data-field')) { state[t.getAttribute('data-field')] = t.value; render(); }
      }

      function onDocClick(e) {
        if (state.dropdown !== 'kat' || !document.contains(e.target)) return;
        const box = mainEl.querySelector('[data-dd="kat"]');
        if (box && !box.contains(e.target)) { state.dropdown = ''; render(); }
      }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      document.addEventListener('click', onDocClick);

      applyPeriodDates();
      render();
      renderPopup();

      return {
        destroy() {
          if (cancelChunks) cancelChunks();
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          document.removeEventListener('click', onDocClick);
        }
      };
    }
  };
})();
