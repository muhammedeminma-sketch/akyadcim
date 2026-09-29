/* ==========================================================================
   DCIM Sunum — Kapasite Raporu (NewUICMPCapacityReportComponent)
   Kapsam filtresi (Genel/Salon/Pod/Kabin), periyot sekmeleri, 4 KPI kartı (UPS, Trafo,
   Soğutma, Kabin Doluluk), detay tablosu, rapor penceresi ve eşik ayarları penceresi.
   Anlık değerler 30 sn'de bir yenilenir (startPolling).
   Veri: DCIM.data.reports.capacity (js/mock-data.js)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;

  // messages.tr.json → reportCapacity.*
  const COMPONENT_LABEL = { ups: 'UPS Yükü', trafo: 'Trafo Yükü', klima: 'Soğutma Kapasitesi', kabin: 'Kabin Doluluk' };
  const PERIODS = [
    { value: 'instant', label: 'Anlık' },
    { value: 'daily', label: 'Günlük' },
    { value: 'weekly', label: 'Haftalık' },
    { value: 'monthly', label: 'Aylık' }
  ];
  const TH = 'py-2.5 px-3.5';
  const THEAD_TR = 'bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle text-[11px] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300';
  const TBODY = 'divide-y divide-slate-200 dark:divide-border-subtle text-xs text-slate-700 dark:text-slate-200';

  const statusOf = it => it.currentPct >= it.threshold + 10 ? 'alarm' : (it.currentPct >= it.threshold ? 'warning' : 'normal');
  const statusLabel = it => it.currentPct >= it.threshold + 10 ? 'Kritik' : (it.currentPct >= it.threshold ? 'Uyarı' : 'Normal');
  const progressColor = it => it.currentPct >= it.threshold + 10 ? '#ef4444' : (it.currentPct >= it.threshold ? '#f59e0b' : '#22c55e');
  const fmtIso = d => d.toISOString().slice(0, 10);

  function mount(el) {
    const { esc, button, statusBadge } = DCIM.ui;
    const kit = DCIM.kit;
    const M = DCIM.data.reports.capacity;
    const now0 = new Date();

    // Kabin kayıtları + salon/pod/kabin haritaları (fetchCabinData)
    const dbCabinets = M.cabinets();
    const salonsList = Array.from(new Set(dbCabinets.map(c => c.salon))).sort();
    const podsMap = {};
    const cabinetsMap = {};
    dbCabinets.forEach(c => {
      (podsMap[c.salon] = podsMap[c.salon] || []);
      if (c.pod && podsMap[c.salon].indexOf(c.pod) < 0) podsMap[c.salon].push(c.pod);
      (cabinetsMap[c.salon] = cabinetsMap[c.salon] || []).push(c.cabin_name);
      if (c.pod) (cabinetsMap[c.salon + ' / ' + c.pod] = cabinetsMap[c.salon + ' / ' + c.pod] || []).push(c.cabin_name);
    });
    const natural = (a, b) => a.localeCompare(b, 'tr', { numeric: true });
    Object.keys(podsMap).forEach(k => podsMap[k].sort(natural));
    Object.keys(cabinetsMap).forEach(k => cabinetsMap[k].sort(natural));

    // loadSettings(): doc('ASM/S00')/id('CAPACITY_CFG') karşılığı
    const items = [
      { key: 'ups', unit: 'kVA', threshold: 80, maxCapacity: 1000, currentPct: 0, currentVal: 0 },
      { key: 'trafo', unit: 'kVA', threshold: 80, maxCapacity: 2000, currentPct: 0, currentVal: 0 },
      { key: 'klima', unit: 'kW', threshold: 75, maxCapacity: 1500, currentPct: 0, currentVal: 0 },
      { key: 'kabin', unit: '%', threshold: 70, maxCapacity: 100, currentPct: 0, currentVal: 0 }
    ];
    items.forEach(it => { const c = M.config[it.key]; if (c) { it.threshold = c.threshold; it.maxCapacity = c.maxCapacity; } });

    const st = {
      period: 'instant', startDate: '', endDate: '', loadingReport: false,
      level: 'general', salon: '', pod: '', cabinet: '',
      podsList: [], cabinetsList: [],
      showPopup: false, showSettings: false, saving: false, editItems: [],
      tick: 0,
      creationDate: now0.toLocaleDateString('tr-TR') + ' ' + now0.toLocaleTimeString('tr-TR')
    };

    // ---------------------------------------------------------------------
    // Hesaplamalar
    // ---------------------------------------------------------------------
    function updateItemVal(key, total) {
      const it = items.find(c => c.key === key);
      it.currentVal = parseFloat(total.toFixed(2));
      it.currentPct = it.maxCapacity > 0 ? parseFloat((total / it.maxCapacity * 100).toFixed(1)) : 0;
    }
    function fetchInstantData() {
      const v = M.instant(st.tick);
      updateItemVal('ups', v.ups);
      updateItemVal('trafo', v.trafo);
      updateItemVal('klima', v.klima);
      calculateCapacity();
    }
    function calculateCapacity() {
      let totalU = 0, usedU = 0;
      const add = c => { totalU += c.total_u; usedU += c.used_u || 0; };
      if (st.level === 'general') dbCabinets.forEach(add);
      else if (st.level === 'salon') { if (st.salon) dbCabinets.filter(c => c.salon === st.salon).forEach(add); }
      else if (st.level === 'pod') { if (st.pod) dbCabinets.filter(c => c.pod === st.pod && c.salon === st.salon).forEach(add); }
      else if (st.level === 'cabinet' && st.cabinet) {
        const cab = dbCabinets.find(c => c.cabin_name === st.cabinet && (!st.salon || c.salon === st.salon));
        if (cab) add(cab);
      }
      const it = items.find(c => c.key === 'kabin');
      it.maxCapacity = totalU;
      it.currentVal = usedU;
      it.currentPct = Number((totalU > 0 ? usedU / totalU * 100 : 0).toFixed(1));
      it.unit = 'U';
    }
    function updateDropdownLists() {
      if (st.salon && salonsList.indexOf(st.salon) < 0) { st.salon = ''; st.pod = ''; st.cabinet = ''; }
      st.podsList = st.salon ? (podsMap[st.salon] || []) : [];
      if (st.pod && st.podsList.indexOf(st.pod) < 0) { st.pod = ''; st.cabinet = ''; }
      if (st.level === 'cabinet') {
        if (st.pod) st.cabinetsList = cabinetsMap[st.salon + ' / ' + st.pod] || [];
        else if (st.salon) st.cabinetsList = cabinetsMap[st.salon] || [];
        else st.cabinetsList = dbCabinets.map(c => c.cabin_name).sort(natural);
        if (st.cabinet && st.cabinetsList.indexOf(st.cabinet) < 0) st.cabinet = '';
      } else st.cabinetsList = [];
    }
    function scopeLabel() {
      if (st.level === 'general') return 'Genel';
      if (st.level === 'salon') return 'Salon: ' + (st.salon || '-');
      if (st.level === 'pod') return 'Salon: ' + (st.salon || '-') + ', Pod: ' + (st.pod || '-');
      return 'Kabin: ' + (st.cabinet || '-');
    }
    const periodLabel = () => (PERIODS.find(p => p.value === st.period) || PERIODS[0]).label;

    // ---------------------------------------------------------------------
    // HTML
    // ---------------------------------------------------------------------
    function renderHeader() {
      const dis = st.loadingReport ? ' disabled' : '';
      return kit.pageHeader({
        title: 'KAPASİTE KULLANIM RAPORLAMA',
        breadcrumbs: [{ label: 'Raporlar' }, { label: 'KAPASİTE KULLANIM RAPORLAMA' }],
        actions:
          button({ variant: 'secondary', icon: 'pi pi-cog', label: 'Eşikler', attrs: 'data-action="settings"' }) +
          (st.period !== 'instant' ? button({ variant: 'primary', icon: 'pi pi-filter', label: 'Rapor Oluştur', attrs: 'data-action="generate"' + dis }) : '') +
          button({ variant: 'secondary', icon: 'pi pi-file-pdf', label: 'PDF İndir', attrs: 'data-action="pdf"' + dis }) +
          button({ variant: 'secondary', icon: 'pi pi-file-excel', label: 'Excel İndir', attrs: 'data-action="excel"' + dis }) +
          button({ variant: 'secondary', icon: 'pi pi-file-archive', label: 'ZIP İndir', attrs: 'data-action="zip"' + dis })
      });
    }

    const option = (value, label, sel) => '<option value="' + esc(value) + '"' + (sel ? ' selected' : '') + '>' + esc(label) + '</option>';

    function renderFilters() {
      let html = kit.formField({
        label: 'Kapsam',
        control: '<select class="scada-select w-full" data-sel="level">' +
          option('general', 'Genel', st.level === 'general') + option('salon', 'Salon', st.level === 'salon') +
          option('pod', 'Pod', st.level === 'pod') + option('cabinet', 'Kabin', st.level === 'cabinet') + '</select>'
      });
      if (st.level !== 'general') {
        html += kit.formField({
          label: 'Salon',
          control: '<select class="scada-select w-full" data-sel="salon">' + option('', '-- Salon Seçin --', !st.salon) +
            salonsList.map(s => option(s, s, st.salon === s)).join('') + '</select>'
        });
      }
      if (st.level === 'pod' || st.level === 'cabinet') {
        html += kit.formField({
          label: 'Pod',
          control: '<select class="scada-select w-full" data-sel="pod"' + (st.salon ? '' : ' disabled') + '>' + option('', '-- Pod Seçin --', !st.pod) +
            st.podsList.map(p => option(p, p, st.pod === p)).join('') + '</select>'
        });
      }
      if (st.level === 'cabinet') {
        html += kit.formField({
          label: 'Kabin',
          control: '<select class="scada-select w-full" data-sel="cabinet"' + (st.salon ? '' : ' disabled') + '>' + option('', '-- Kabin Seçin --', !st.cabinet) +
            st.cabinetsList.map(c => option(c, c, st.cabinet === c)).join('') + '</select>'
        });
      }
      html += kit.formField({
        label: 'Rapor Periyodu',
        control: '<div class="flex items-center gap-1 bg-slate-100 dark:bg-surface-panel p-1 rounded-[2px] h-[34px]">' +
          PERIODS.map(p => '<button type="button" data-period="' + p.value + '" class="flex-1 py-1 text-xs font-medium rounded-[2px] transition-colors ' +
            (st.period === p.value ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 font-bold shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200') +
            '">' + p.label + '</button>').join('') +
        '</div>'
      });
      if (st.period !== 'instant') {
        html += kit.formField({ label: 'Başlangıç Tarihi:', control: '<input type="date" data-model="startDate" value="' + esc(st.startDate) + '" class="scada-input w-full" />' });
        html += kit.formField({ label: 'Bitiş Tarihi:', control: '<input type="date" data-model="endDate" value="' + esc(st.endDate) + '" class="scada-input w-full" />' });
      }
      return kit.card({ title: 'Filtre', icon: 'pi pi-filter', body: '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">' + html + '</div>' });
    }

    function pctTone(it) {
      if (it.currentPct >= it.threshold + 10) return 'text-rose-600 dark:text-rose-400';
      if (it.currentPct >= it.threshold) return 'text-amber-600 dark:text-amber-400';
      return 'text-emerald-600 dark:text-emerald-400';
    }
    const barW = it => it.currentPct > 100 ? 100 : it.currentPct;

    function renderKpis() {
      return '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">' + items.map(it =>
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-4 flex flex-col justify-between shadow-sm relative overflow-hidden transition-all hover:border-slate-300 dark:hover:border-border-muted">' +
          '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<span class="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-wide uppercase">' + esc(COMPONENT_LABEL[it.key]) + '</span>' +
            statusBadge(statusOf(it), statusLabel(it)) +
          '</div>' +
          '<div class="my-2 flex items-baseline justify-between">' +
            '<span class="text-3xl font-extrabold tracking-tight ' + pctTone(it) + '">' + it.currentPct + '%</span>' +
            '<span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Eşik: ' + it.threshold + '%</span>' +
          '</div>' +
          '<div class="relative w-full h-2.5 bg-slate-100 dark:bg-surface-panel rounded-[2px] overflow-hidden my-2">' +
            '<div class="h-full rounded-[2px] transition-all duration-300" style="width:' + barW(it) + '%;background:' + progressColor(it) + '"></div>' +
            '<div class="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-slate-100 z-10 opacity-80" style="left:' + it.threshold + '%" title="Eşik: ' + it.threshold + '%"></div>' +
          '</div>' +
          '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1 pt-1 border-t border-slate-100 dark:border-border-subtle/50">' +
            '<span>Anlık Değer</span>' +
            '<span class="font-bold text-slate-800 dark:text-slate-200">' + it.currentVal + ' / ' + it.maxCapacity + ' ' + esc(it.unit) + '</span>' +
          '</div>' +
        '</div>').join('') + '</div>';
    }

    function renderTable() {
      const body =
        '<div class="overflow-x-auto"><table class="w-full text-left border-collapse"><thead>' +
          '<tr class="' + THEAD_TR + '">' +
            '<th class="' + TH + '">Bileşen</th><th class="' + TH + '">Anlık Değer</th><th class="' + TH + '">Birim</th>' +
            '<th class="py-2.5 px-3.5 min-w-[200px]">Kullanım</th><th class="' + TH + '">Eşik Değeri</th><th class="py-2.5 px-3.5 text-center">Durum</th>' +
          '</tr></thead><tbody class="' + TBODY + '">' +
          items.map(it =>
            '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
              '<td class="py-3 px-3.5 font-semibold text-slate-900 dark:text-slate-100">' + esc(COMPONENT_LABEL[it.key]) + '</td>' +
              '<td class="py-3 px-3.5 font-mono font-medium">' + it.currentVal + '</td>' +
              '<td class="py-3 px-3.5 text-slate-500 dark:text-slate-400 font-mono">' + esc(it.unit) + '</td>' +
              '<td class="py-3 px-3.5"><div class="flex items-center gap-3">' +
                '<div class="flex-1 h-2 bg-slate-100 dark:bg-surface-panel rounded-[2px] overflow-hidden">' +
                  '<div class="h-full rounded-[2px] transition-all" style="width:' + barW(it) + '%;background:' + progressColor(it) + '"></div></div>' +
                '<span class="font-mono font-bold text-xs w-12 text-right">' + it.currentPct + '%</span>' +
              '</div></td>' +
              '<td class="py-3 px-3.5 font-mono text-slate-600 dark:text-slate-400">' + it.threshold + '%</td>' +
              '<td class="py-3 px-3.5 text-center">' + statusBadge(statusOf(it), statusLabel(it)) + '</td>' +
            '</tr>').join('') +
          '</tbody></table></div>' +
        '<div class="mt-3 pt-2 border-t border-slate-200 dark:border-border-subtle flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">' +
          '<div class="flex items-center gap-1.5"><i class="pi pi-clock"></i><span>Son güncelleme: ' + esc(st.creationDate) + '</span></div>' +
          '<div class="flex items-center gap-1.5 text-sky-600 dark:text-sky-400"><i class="pi pi-sync spin"></i><span>Otomatik yenileme: 30 sn</span></div>' +
        '</div>';
      return kit.card({ title: 'KAPASİTE KULLANIM RAPORLAMA', icon: 'pi pi-table', body });
    }

    function renderPopup() {
      if (!st.showPopup) return '';
      const dis = st.loadingReport ? ' disabled' : '';
      const body = st.loadingReport
        ? '<div class="py-12 flex flex-col items-center justify-center gap-3"><i class="pi pi-spin pi-spinner text-3xl text-sky-500"></i>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 font-medium">Veriler Hazırlanıyor...</p></div>'
        : '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]"><table class="w-full text-left border-collapse"><thead>' +
            '<tr class="' + THEAD_TR + '">' +
              '<th class="' + TH + '">Bileşen</th><th class="' + TH + '">Birim</th><th class="' + TH + '">Anlık Değer</th>' +
              '<th class="' + TH + '">Kullanım (%)</th><th class="' + TH + '">Eşik (%)</th><th class="py-2.5 px-3.5 text-center">Durum</th>' +
            '</tr></thead><tbody class="' + TBODY + '">' +
            items.map(it =>
              '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover">' +
                '<td class="py-2.5 px-3.5 font-semibold">' + esc(COMPONENT_LABEL[it.key]) + '</td>' +
                '<td class="py-2.5 px-3.5 font-mono text-slate-500">' + esc(it.unit) + '</td>' +
                '<td class="py-2.5 px-3.5 font-mono font-medium">' + it.currentVal + '</td>' +
                '<td class="py-2.5 px-3.5 font-mono font-bold">' + it.currentPct + '%</td>' +
                '<td class="py-2.5 px-3.5 font-mono text-slate-500">' + it.threshold + '%</td>' +
                '<td class="py-2.5 px-3.5 text-center">' + statusBadge(statusOf(it), statusLabel(it)) + '</td>' +
              '</tr>').join('') +
            '</tbody></table></div>';
      return '<div data-backdrop="popup" class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-4">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-4xl overflow-hidden transform transition-all">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel">' +
            '<div class="flex items-center gap-2.5 flex-wrap">' +
              '<i class="pi pi-file-pdf text-sky-500 text-lg"></i>' +
              '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Kapasite Raporu</h3>' +
              '<span class="px-2 py-0.5 text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 rounded-[2px]">' +
                esc(periodLabel()) + '&nbsp;|&nbsp; ' + esc(st.startDate) + ' – ' + esc(st.endDate) + '</span>' +
              '<span class="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-border-subtle rounded-[2px]">Kapsam: ' + esc(scopeLabel()) + '</span>' +
            '</div>' +
            '<button type="button" data-action="close-popup" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"><i class="pi pi-times text-base"></i></button>' +
          '</div>' +
          '<div class="p-5 max-h-[70vh] overflow-y-auto">' + body + '</div>' +
          '<div class="px-5 py-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel flex items-center justify-end gap-2">' +
            button({ variant: 'secondary', icon: 'pi pi-file-pdf', label: 'PDF İndir', attrs: 'data-action="pdf"' + dis }) +
            button({ variant: 'secondary', icon: 'pi pi-file-excel', label: 'Excel İndir', attrs: 'data-action="excel"' + dis }) +
            button({ variant: 'secondary', icon: 'pi pi-file-archive', label: 'ZIP İndir', attrs: 'data-action="zip"' + dis }) +
            button({ variant: 'ghost', label: 'İptal', attrs: 'data-action="close-popup"' }) +
          '</div>' +
        '</div></div>';
    }

    function renderSettings() {
      if (!st.showSettings) return '';
      return '<div data-backdrop="settings" class="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-4">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">' +
          '<div class="px-5 py-4 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel">' +
            '<div class="flex items-center gap-2"><i class="pi pi-cog text-sky-500 text-lg"></i><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">Kapasite Eşik Değerleri</h3></div>' +
            '<button type="button" data-action="close-settings" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"><i class="pi pi-times text-base"></i></button>' +
          '</div>' +
          '<div class="p-5 max-h-[70vh] overflow-y-auto space-y-4">' +
            '<p class="text-xs text-slate-600 dark:text-slate-400">Her bileşen için sisteminizdeki Maksimum Kapasiteyi (kVA, kW vb.) ve alarm üretilecek Eşik Yüzdesini belirleyin. Anlık kullanım eşik değerini geçince satır sarıya, eşik + 10% geçince kırmızıya döner.</p>' +
            '<div class="overflow-x-auto border border-slate-200 dark:border-border-subtle rounded-[2px]"><table class="w-full text-left border-collapse"><thead>' +
              '<tr class="' + THEAD_TR + '">' +
                '<th class="' + TH + '">Bileşen</th><th class="' + TH + '">Birim</th><th class="' + TH + '">Maks Kapasite</th><th class="' + TH + '">Eşik (%)</th><th class="' + TH + '">Önizleme</th>' +
              '</tr></thead><tbody class="' + TBODY + '">' +
              st.editItems.map(it =>
                '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover">' +
                  '<td class="py-2.5 px-3.5 font-semibold">' + esc(COMPONENT_LABEL[it.key]) + '</td>' +
                  '<td class="py-2.5 px-3.5 font-mono text-slate-500">' + esc(it.unit) + '</td>' +
                  '<td class="py-2.5 px-3.5"><input type="number" data-edit="' + it.key + '|maxCapacity" value="' + esc(it.maxCapacity) + '" min="1" placeholder="Max" class="scada-input w-24 py-1 px-2 text-xs font-mono" /></td>' +
                  '<td class="py-2.5 px-3.5"><input type="number" data-edit="' + it.key + '|threshold" value="' + esc(it.threshold) + '" min="0" max="100" placeholder="0-100" class="scada-input w-24 py-1 px-2 text-xs font-mono" /></td>' +
                  '<td class="py-2.5 px-3.5"><div class="flex items-center gap-2">' +
                    '<div class="flex-1 h-2 bg-slate-100 dark:bg-surface-panel rounded-[2px] overflow-hidden min-w-[80px]"><div data-preview-bar="' + it.key + '" class="h-full bg-amber-500 rounded-[2px] transition-all" style="width:' + it.threshold + '%"></div></div>' +
                    '<span data-preview-label="' + it.key + '" class="font-mono text-xs text-slate-500 font-bold w-9 text-right">' + it.threshold + '%</span>' +
                  '</div></td>' +
                '</tr>').join('') +
              '</tbody></table></div>' +
          '</div>' +
          '<div class="px-5 py-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel flex items-center justify-end gap-2">' +
            button({ variant: 'ghost', label: 'İptal', attrs: 'data-action="close-settings"' }) +
            button({ variant: 'primary', icon: st.saving ? 'pi pi-spin pi-spinner' : 'pi pi-check', label: st.saving ? 'Kaydediliyor...' : 'Kaydet', attrs: 'data-action="save-settings"' + (st.saving ? ' disabled' : '') }) +
          '</div>' +
        '</div></div>';
    }

    // İskelet
    el.innerHTML = '<div class="space-y-4"><div data-cap-header></div><div data-cap-filters></div><div data-cap-kpis></div><div data-cap-table></div></div><div data-cap-popup></div><div data-cap-settings></div>';
    const $ = s => el.querySelector(s);
    function renderMain() {
      $('[data-cap-header]').innerHTML = renderHeader();
      $('[data-cap-filters]').innerHTML = renderFilters();
      renderValues();
    }
    function renderValues() {
      $('[data-cap-kpis]').innerHTML = renderKpis();
      $('[data-cap-table]').innerHTML = renderTable();
      if (st.showPopup) $('[data-cap-popup]').innerHTML = renderPopup();
    }
    function renderPopupLayer() { $('[data-cap-popup]').innerHTML = renderPopup(); }
    function renderSettingsLayer() { $('[data-cap-settings]').innerHTML = renderSettings(); }

    // ---------------------------------------------------------------------
    // Eylemler
    // ---------------------------------------------------------------------
    function setPeriod(p) {
      st.period = p;
      const today = new Date();
      if (p === 'daily') { st.startDate = fmtIso(today); st.endDate = fmtIso(today); }
      else if (p === 'weekly') { const s = new Date(today); s.setDate(today.getDate() - 6); st.startDate = fmtIso(s); st.endDate = fmtIso(today); }
      else if (p === 'monthly') { const s = new Date(today); s.setDate(today.getDate() - 29); st.startDate = fmtIso(s); st.endDate = fmtIso(today); }
      else { st.startDate = ''; st.endDate = ''; fetchInstantData(); }
      renderMain();
    }
    function generateReport() {
      if (st.period === 'instant') { fetchInstantData(); renderValues(); return; }
      if (!st.startDate || !st.endDate) { DCIM.ui.toast('Lütfen başlangıç ve bitiş tarihi seçin.', 'warning', 'Kapasite Raporu'); return; }
      st.showPopup = true;
      renderPopupLayer();
    }
    function saveSettings() {
      st.saving = true;
      renderSettingsLayer();
      later(() => {
        st.editItems.forEach(e => {
          const o = items.find(c => c.key === e.key);
          if (o) { o.threshold = e.threshold; o.maxCapacity = e.maxCapacity; }
        });
        st.saving = false;
        st.showSettings = false;
        fetchInstantData();
        renderSettingsLayer();
        renderValues();
        DCIM.ui.toast('Kapasite eşikleri kaydedildi.', 'success', 'Kapasite Raporu');
      }, 350);
    }
    function exportColumns() {
      return [
        { header: 'Bileşen', value: it => COMPONENT_LABEL[it.key] },
        { header: 'Birim', value: it => it.unit },
        { header: 'Anlık Değer', value: it => it.currentVal },
        { header: 'Kullanım (%)', value: it => it.currentPct },
        { header: 'Eşik (%)', value: it => it.threshold },
        { header: 'Durum', value: it => statusLabel(it) },
        { header: 'Rapor Periyodu', value: () => periodLabel() },
        { header: 'Tarih Aralığı', value: () => st.startDate && st.endDate ? st.startDate + ' - ' + st.endDate : '-' },
        { header: 'Filtre', value: it => it.key === 'kabin' ? scopeLabel() : 'Genel' }
      ];
    }
    const exportExcel = () => kit.exportExcel('kapasite_raporu_' + fmtIso(new Date()), exportColumns(), items);

    const timers = new Set();
    function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); }

    // Olaylar
    function onClick(e) {
      const t = e.target;
      const act = t.closest('[data-action]');
      if (act && !act.disabled) {
        const a = act.getAttribute('data-action');
        if (a === 'settings') { st.editItems = items.map(it => Object.assign({}, it)); st.showSettings = true; renderSettingsLayer(); }
        else if (a === 'close-settings') { st.showSettings = false; renderSettingsLayer(); }
        else if (a === 'save-settings') saveSettings();
        else if (a === 'generate') generateReport();
        else if (a === 'close-popup') { st.showPopup = false; renderPopupLayer(); }
        else if (a === 'excel') exportExcel();
        else if (a === 'pdf') kit.exportPdf();
        else if (a === 'zip') { exportExcel(); kit.exportPdf(); }
        return;
      }
      const bd = t.getAttribute('data-backdrop');
      if (bd === 'popup') { st.showPopup = false; renderPopupLayer(); return; }
      if (bd === 'settings') { st.showSettings = false; renderSettingsLayer(); return; }
      const per = t.closest('[data-period]');
      if (per) setPeriod(per.getAttribute('data-period'));
    }
    function onChange(e) {
      const t = e.target;
      const sel = t.getAttribute('data-sel');
      if (sel === 'level') { st.level = t.value; st.salon = ''; st.pod = ''; st.cabinet = ''; }
      else if (sel === 'salon') { st.salon = t.value; st.pod = ''; st.cabinet = ''; }
      else if (sel === 'pod') { st.pod = t.value; st.cabinet = ''; }
      else if (sel === 'cabinet') { st.cabinet = t.value; }
      if (sel) { updateDropdownLists(); calculateCapacity(); renderMain(); return; }
      if (t.hasAttribute('data-model')) st[t.getAttribute('data-model')] = t.value;
    }
    function onInput(e) {
      const t = e.target;
      if (t.hasAttribute('data-model')) { st[t.getAttribute('data-model')] = t.value; return; }
      const ed = t.getAttribute('data-edit');
      if (!ed) return;
      const p = ed.split('|');
      const it = st.editItems.find(x => x.key === p[0]);
      if (!it) return;
      let v = Number(t.value);
      if (p[1] === 'threshold') {
        // clampThreshold()
        if (isNaN(v) || v < 0) v = 0;
        if (v > 100) { v = 100; t.value = '100'; }
        it.threshold = v;
        const bar = el.querySelector('[data-preview-bar="' + it.key + '"]');
        const lbl = el.querySelector('[data-preview-label="' + it.key + '"]');
        if (bar) bar.style.width = v + '%';
        if (lbl) lbl.textContent = v + '%';
      } else {
        it.maxCapacity = isNaN(v) ? it.maxCapacity : v;
      }
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      if (st.showPopup) { st.showPopup = false; renderPopupLayer(); }
      if (st.showSettings) { st.showSettings = false; renderSettingsLayer(); }
    }

    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);

    // startPolling(): ilk okuma + 30 sn'de bir
    updateDropdownLists();
    fetchInstantData();
    renderMain();
    const poll = setInterval(() => { st.tick++; fetchInstantData(); renderValues(); }, 30000);

    return {
      destroy() {
        clearInterval(poll);
        timers.forEach(id => clearTimeout(id));
        timers.clear();
        el.removeEventListener('click', onClick);
        el.removeEventListener('change', onChange);
        el.removeEventListener('input', onInput);
        document.removeEventListener('keydown', onKey);
      }
    };
  }

  (DCIM.reportRegistry = DCIM.reportRegistry || {}).capacity = { mount };
})();
