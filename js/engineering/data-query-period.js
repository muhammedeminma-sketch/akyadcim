/* ==========================================================================
   DCIM Sunum — Veri Sorgulama Periyodu (NewUICMPDataQueryPeriodComponent)
   Kaynak: new-ui/pages/engineering/data-query-period/data-query-period.component.{html,ts}
   "2D ve Enerji Cihazlarının sorgu sıklığını ayarlama."
   İki kart (2D Cihaz Ayarları / Enerji Cihazları Ayarları); her satır: etiket + mevcut sorgu aralığı,
   özel açılır liste (8 aralık seçeneği) + "Güncelle". Güncelle → XDB_SetValue(bi/@evt_per) + #save,
   1,5 sn aralıkla XDB_GetValue ile doğrulama → toast "{label} başarıyla güncellendi." → seçim sıfırlanır.
   Veri: DCIM.data.dataQueryPeriod (js/mock/eng-data-query-period.data.js)

   Sunum eki (kaynakta yok): satır başlığındaki "N cihaz" çipi, XPath filtresine giren cihazların
   listesini (kimlik, açıklama, durum, periyot + arama) açar. Senaryo durumları DCIM.data ile aynıdır
   (UPS B7 SNMP kaybı, UPS A5 akü modu, KLIMA 109, 1AV42 PDU-B, 1CE51 kilit haberleşme kaybı...).

   Derin bağlantılar (engineering.html#data-query-period?...):
     ?open=upsEnergy            → kapsam listesini açık getirir (virgülle birden çok: open=pdu,sensor)
     ?q=B7                      → açık kapsam listelerinde arama
     ?sel=upsEnergy:60          → satırda aralık önseçimi (anahtar:saniye)
     ?sel=pdu:300&save=1        → önseçimi hemen kaydeder (yükleniyor durumu + toast)
     ?menu=climate              → satırın açılır listesini açık getirir
   Satır anahtarları (kaynaktaki dropdownStates): pdu, climate, climatePanel, sdp, sensor,
   analyzer, rectifier, compensation, generator, upsEnergy
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // messages.tr.json → dataQueryPeriod.*
  const T = {
    title: 'VERİ SORGULAMA PERİYODU',
    engineering: 'Mühendislik',
    back: 'Geri',
    deviceSettings2D: '2D Cihaz Ayarları',
    energyDeviceSettings: 'Enerji Cihazları Ayarları',
    current: 'Mevcut sorgu aralığı',
    secondsAbbrev: 'sn',
    loadingNewValue: 'Yeni değer yükleniyor...',
    selectFromList: 'Listeden seçiniz...',
    update: 'Güncelle',
    updatedSuccessfully: '{label} başarıyla güncellendi.'
  };

  const INTERVALS = [
    { value: 0, label: 'Anlık' },
    { value: 5, label: '5 Saniye' },
    { value: 10, label: '10 Saniye' },
    { value: 30, label: '30 Saniye' },
    { value: 60, label: '1 Dakika' },
    { value: 300, label: '5 Dakika' },
    { value: 3600, label: '1 Saat' },
    { value: 86400, label: '1 Gün' }
  ];

  // key: dropdownStates anahtarı · dev: loadingStates / deviceNames etiketi · title: satır başlığı
  const ROWS_2D = [
    { key: 'pdu', dev: 'PDU', title: 'PDU Sorgu Aralığı' },
    { key: 'climate', dev: 'Klima', title: 'Klima Sorgu Aralığı' },
    { key: 'climatePanel', dev: 'Klima Panosu', title: 'Klima Panosu Sorgu Aralığı' },
    { key: 'sdp', dev: 'SDP', title: 'SDP Sorgu Aralığı' },
    { key: 'sensor', dev: 'Sensör', title: 'Sensör Sorgu Aralığı' }
  ];
  const ROWS_ENERGY = [
    { key: 'analyzer', dev: 'Enerji Analizörü', title: 'Enerji Analizörleri' },
    { key: 'rectifier', dev: 'Redresör', title: 'Redresör Sorgu Aralığı' },
    { key: 'compensation', dev: 'Kompanzasyon', title: 'Kompanzasyon Sorgu Aralığı' },
    { key: 'generator', dev: 'Jeneratör', title: 'Jeneratör Sorgu Aralığı' },
    { key: 'upsEnergy', dev: 'UPS', title: 'UPS Modülü Sorgu Aralığı' }
  ];
  const ROWS = ROWS_2D.concat(ROWS_ENERGY);
  const ROW_BY_KEY = {};
  ROWS.forEach(r => { ROW_BY_KEY[r.key] = r; });

  // Kaynak şablondaki sınıflar
  const SELECT_BTN_CLS = 'scada-input w-full flex items-center justify-between py-1 px-2.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-border-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left font-medium';
  const MENU_CLS = 'absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-lg py-0.5';
  const OPT_CLS = 'px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors';

  const STATUS_LABEL = { normal: 'Normal', warning: 'Uyarı', alarm: 'Alarm', lost: 'Haberleşme Kaybı', info: 'Bilgi' };
  const STATUS_RANK = { lost: 1, alarm: 2, warning: 3, info: 4, normal: 5 };
  const POLL_MS = 1500;   // kaynaktaki checkUpdate aralığı
  const LOAD_MS = 250;    // XDB_GetValue yanıt gecikmesi (ilk açılışta '...' görünür)

  DCIM.engRegistry['data-query-period'] = {
    mount(el, params) {
      const { esc, button, buttonClasses, toast, statusBadge, fmtNum } = DCIM.ui;
      const kit = DCIM.kit;
      const Q = DCIM.data.dataQueryPeriod;

      const state = {
        current: {},     // *QueryInterval
        selection: {},   // *Selection
        loading: {},     // loadingStates (anahtar: satır key)
        dropdown: null,  // dropdownStates — aynı anda tek açık
        scope: {},       // sunum eki: açık kapsam listeleri
        scopeQ: {}
      };
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

      // --- deep link ---
      (params.get('open') || '').split(',').filter(k => ROW_BY_KEY[k]).forEach(k => { state.scope[k] = true; });
      const q0 = params.get('q') || '';
      Object.keys(state.scope).forEach(k => { state.scopeQ[k] = q0; });
      const selParam = (params.get('sel') || '').split(':');
      if (ROW_BY_KEY[selParam[0]] && INTERVALS.some(o => String(o.value) === selParam[1])) state.selection[selParam[0]] = Number(selParam[1]);
      if (ROW_BY_KEY[params.get('menu')]) state.dropdown = params.get('menu');

      const t = key => T[key];
      function getIntervalLabel(value) {
        if (value == null) return t('selectFromList');
        const found = INTERVALS.find(x => x.value === value);
        return found ? found.label : t('selectFromList');
      }

      // ------------------------------------------------------------------
      // Sunum eki — kapsam çipi + cihaz listesi
      // ------------------------------------------------------------------
      function scopeChip(row) {
        const devs = Q.devices(row.key);
        const lost = devs.filter(d => d.status === 'lost').length;
        const open = !!state.scope[row.key];
        return '<button type="button" data-scope="' + row.key + '" title="Filtreye giren cihazlar" class="inline-flex items-center gap-1 px-1.5 py-px rounded-[2px] border text-[9px] font-bold transition-colors ' +
          (open ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' : 'border-slate-200 dark:border-border-subtle text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-500/40') + '">' +
          '<i class="pi pi-server text-[9px]"></i><span>' + fmtNum(devs.length, 0) + ' cihaz</span>' +
          (lost ? '<span class="text-orange-600 dark:text-orange-400">· ' + lost + ' bağlantısız</span>' : '') +
          '<i class="pi ' + (open ? 'pi-chevron-up' : 'pi-chevron-down') + ' text-[8px]"></i>' +
        '</button>';
      }

      function scopeRows(row) {
        const q = (state.scopeQ[row.key] || '').trim().toLocaleLowerCase('tr');
        // Sorunlu cihazlar (bağlantısız → alarm → uyarı → bilgi) üstte, sonra kaynak sırası
        const devs = Q.devices(row.key)
          .map((d, i) => ({ d, i }))
          .filter(x => !q || (x.d.id + ' ' + x.d.desc + ' ' + x.d.note).toLocaleLowerCase('tr').indexOf(q) >= 0)
          .sort((a, b) => (STATUS_RANK[a.d.status] || 9) - (STATUS_RANK[b.d.status] || 9) || a.i - b.i)
          .map(x => x.d);
        if (!devs.length) return '<tr><td colspan="4" class="px-2 py-3 text-center text-slate-400">Eşleşen cihaz yok</td></tr>';
        const loading = state.loading[row.key];
        const cur = state.current[row.key];
        return devs.map(d =>
          '<tr class="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-surface-hover">' +
            '<td class="px-2 py-1 font-mono text-[10px] text-slate-600 dark:text-slate-400 whitespace-nowrap">' + esc(d.id) + '</td>' +
            '<td class="px-2 py-1 text-slate-800 dark:text-slate-200"><span class="font-semibold">' + esc(d.desc) + '</span>' +
              (d.note ? '<span class="block text-[10px] text-slate-500 dark:text-slate-400">' + esc(d.note) + '</span>' : '') + '</td>' +
            '<td class="px-2 py-1 whitespace-nowrap">' + statusBadge(d.status, STATUS_LABEL[d.status]) + '</td>' +
            '<td class="px-2 py-1 text-right whitespace-nowrap font-bold ' + (loading ? 'text-sky-500 animate-pulse' : 'text-slate-800 dark:text-slate-200') + '">' +
              (loading ? '…' : (cur != null ? esc(cur) + ' ' + t('secondsAbbrev') : '...')) + '</td>' +
          '</tr>'
        ).join('');
      }

      function scopePanel(row) {
        const g = Q.groups[row.key];
        const devs = Q.devices(row.key);
        const cnt = st => devs.filter(d => d.status === st).length;
        const pill = (n, cls, label) => n ? '<span class="px-1.5 py-px rounded-[2px] text-[9px] font-bold border ' + cls + '">' + n + ' ' + label + '</span>' : '';
        return '<div class="mt-2 border border-slate-200 dark:border-border-subtle rounded-[2px] bg-slate-50/60 dark:bg-surface-panel/60 animate-fade-in" data-scope-panel="' + row.key + '">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-border-subtle">' +
            '<div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">' +
              '<i class="pi pi-sitemap text-[10px] text-sky-500"></i>' +
              '<span>Doküman <strong class="text-slate-700 dark:text-slate-300">' + esc(g.doc) + '</strong></span>' +
              '<span>·</span><span class="font-mono">dev/bi/@evt_per</span>' +
              '<span>·</span><span>' + fmtNum(devs.length, 0) + ' cihaz</span>' +
              pill(cnt('alarm'), 'border-rose-500/40 text-rose-600 dark:text-rose-400', 'alarm') +
              pill(cnt('warning'), 'border-amber-500/40 text-amber-600 dark:text-amber-400', 'uyarı') +
              pill(cnt('lost'), 'border-orange-500/40 text-orange-600 dark:text-orange-400', 'bağlantısız') +
            '</div>' +
            '<div class="relative">' +
              '<i class="pi pi-search absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 pointer-events-none"></i>' +
              '<input type="text" data-scope-q="' + row.key + '" value="' + esc(state.scopeQ[row.key] || '') + '" placeholder="Cihaz ara..." class="w-44 pl-5 pr-1.5 py-0.5 text-[10px] bg-white dark:bg-surface-base border border-slate-200 dark:border-border-subtle rounded-[2px] text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500">' +
            '</div>' +
          '</div>' +
          '<div class="max-h-56 overflow-y-auto">' +
            '<table class="w-full text-[11px]">' +
              '<thead class="sticky top-0 bg-slate-100 dark:bg-surface-panel text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">' +
                '<tr><th class="px-2 py-1 text-left font-bold">Cihaz ID</th><th class="px-2 py-1 text-left font-bold">Açıklama</th>' +
                '<th class="px-2 py-1 text-left font-bold">Durum</th><th class="px-2 py-1 text-right font-bold">Sorgu Periyodu</th></tr>' +
              '</thead>' +
              '<tbody data-scope-body="' + row.key + '">' + scopeRows(row) + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      }

      // ------------------------------------------------------------------
      // Satır (kaynak şablondaki her "… Row" bloğu)
      // ------------------------------------------------------------------
      function updateButton(row) {
        const loading = !!state.loading[row.key];
        const disabled = state.selection[row.key] == null || loading;
        return '<button type="button" data-save="' + row.key + '" class="' + buttonClasses('primary', 'sm', false) + '"' +
          (disabled ? ' disabled aria-disabled="true"' : '') + (loading ? ' aria-busy="true"' : '') + '>' +
          (loading ? '<i class="pi pi-spin pi-spinner text-current"></i>' : '') +
          '<span class="truncate">' + esc(t('update')) + '</span></button>';
      }

      function rowInner(row) {
        const k = row.key;
        const loading = !!state.loading[k];
        const cur = state.current[k];
        return '<div class="flex flex-col md:flex-row md:items-center justify-between gap-1 mb-1.5 select-none">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="text-xs font-semibold text-slate-700 dark:text-slate-300">' + esc(row.title) + '</span>' +
              scopeChip(row) +
            '</div>' +
            '<div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">' +
              '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + (loading ? 'bg-sky-500 animate-pulse' : 'bg-emerald-500') + '"></span>' +
              '<span>' + esc(t('current')) + ':</span>' +
              (loading
                ? '<strong class="text-sky-500 animate-pulse font-semibold">' + esc(t('loadingNewValue')) + '</strong>'
                : '<strong class="text-slate-800 dark:text-slate-200">' + (cur != null ? esc(cur) : '...') + ' ' + esc(t('secondsAbbrev')) + '</strong>') +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2">' +
            '<div class="relative flex-1" data-stop>' +
              '<button type="button" data-toggle="' + k + '" class="' + SELECT_BTN_CLS + '"' + (loading ? ' disabled' : '') + '>' +
                '<span class="truncate">' + esc(getIntervalLabel(state.selection[k])) + '</span>' +
                '<i class="pi pi-chevron-down text-[9px] text-slate-400 shrink-0 ml-1"></i>' +
              '</button>' +
              (state.dropdown === k
                ? '<div class="' + MENU_CLS + '">' + INTERVALS.map(o => '<div class="' + OPT_CLS + '" data-opt="' + k + '" data-val="' + o.value + '">' + esc(o.label) + '</div>').join('') + '</div>'
                : '') +
            '</div>' +
            updateButton(row) +
          '</div>' +
          (state.scope[k] ? scopePanel(row) : '');
      }

      function rowsHtml(rows) {
        return rows.map((r, i) => {
          const cls = i === 0 ? 'py-3 first:pt-0 last:pb-0' : i === rows.length - 1 ? 'py-3 last:pb-0' : 'py-3';
          return '<div class="' + cls + '" data-row="' + r.key + '">' + rowInner(r) + '</div>';
        }).join('');
      }

      el.innerHTML =
        '<div class="p-4 eng-dqp" data-root>' +
          kit.pageHeader({
            title: T.title,
            breadcrumbs: [{ label: T.engineering, href: 'engineering.html' }, { label: T.title }],
            actions: button({ variant: 'secondary', icon: 'pi pi-chevron-left', label: T.back, attrs: 'data-act="back"' })
          }) +
          '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">' +
            kit.card({ title: T.deviceSettings2D, icon: 'pi pi-th-large', body: '<div class="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">' + rowsHtml(ROWS_2D) + '</div>' }) +
            kit.card({ title: T.energyDeviceSettings, icon: 'pi pi-bolt', body: '<div class="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">' + rowsHtml(ROWS_ENERGY) + '</div>' }) +
          '</div>' +
        '</div>';
      const root = el.querySelector('[data-root]');

      function paint(key) {
        const rowEl = root.querySelector('[data-row="' + key + '"]');
        if (rowEl) rowEl.innerHTML = rowInner(ROW_BY_KEY[key]);
      }
      function paintBody(key) {
        const body = root.querySelector('[data-scope-body="' + key + '"]');
        if (body) body.innerHTML = scopeRows(ROW_BY_KEY[key]);
      }

      // ------------------------------------------------------------------
      // Kaynak TS mantığı
      // ------------------------------------------------------------------
      function toggleDropdown(key) {
        const prev = state.dropdown;
        state.dropdown = prev === key ? null : key;
        if (prev && prev !== key) paint(prev);
        paint(key);
      }
      function closeAllDropdowns() {
        const prev = state.dropdown;
        state.dropdown = null;
        if (prev) paint(prev);
      }
      function selectInterval(key, value) {
        state.selection[key] = value;
        state.dropdown = null;
        paint(key);
      }

      // loadDeviceCommon — XDB_GetValue(...[1]/bi[1]/@evt_per)
      function loadCurrent(key) {
        later(() => {
          const val = parseInt(String(Q.get(key)).trim(), 10);
          if (!isNaN(val)) { state.current[key] = val; paint(key); }
        }, LOAD_MS);
      }

      // save*Intervals + saveDeviceCommon
      function save(key) {
        const row = ROW_BY_KEY[key];
        const newValue = state.selection[key];
        if (!newValue) return;   // kaynakla aynı: `if (!this.xSelection) return;` (0 = Anlık kaydedilmez)
        state.loading[key] = true;
        paint(key);
        Q.set(key, newValue);    // XDB_SetValue(bi/@evt_per) + XDB_SetValue(#save, 1)
        const checkUpdate = () => {
          const currentXdbValue = Q.get(key);
          if (currentXdbValue === newValue) {
            state.loading[key] = false;
            toast(T.updatedSuccessfully.replace('{label}', row.dev), 'success');
            // afterSave: load*CurrentValue + selection = undefined
            state.selection[key] = undefined;
            paint(key);
            loadCurrent(key);
          } else {
            later(checkUpdate, POLL_MS);
          }
        };
        later(checkUpdate, POLL_MS);
      }

      // ------------------------------------------------------------------
      // Olaylar
      // ------------------------------------------------------------------
      root.addEventListener('click', e => {
        // (click)="closeAllDropdowns()" kökte; açılır liste kabı $event.stopPropagation()
        if (!e.target.closest('[data-stop]')) closeAllDropdowns();

        const opt = e.target.closest('[data-opt]');
        if (opt) { selectInterval(opt.getAttribute('data-opt'), Number(opt.getAttribute('data-val'))); return; }
        const tg = e.target.closest('[data-toggle]');
        if (tg) { if (!tg.disabled) toggleDropdown(tg.getAttribute('data-toggle')); return; }
        const sv = e.target.closest('[data-save]');
        if (sv) { if (!sv.disabled) save(sv.getAttribute('data-save')); return; }
        const sc = e.target.closest('[data-scope]');
        if (sc) {
          const k = sc.getAttribute('data-scope');
          state.scope[k] = !state.scope[k];
          paint(k);
          return;
        }
        if (e.target.closest('[data-act="back"]')) {
          // Kaynakta back EventEmitter'ı rota üzerinden dinlenmez; sunumda tarayıcı geçmişine döner
          if (window.history.length > 1) window.history.back();
        }
      });
      root.addEventListener('input', e => {
        const inp = e.target.closest('[data-scope-q]');
        if (!inp) return;
        const k = inp.getAttribute('data-scope-q');
        state.scopeQ[k] = inp.value;
        paintBody(k);
      });
      // @HostListener('document:keydown.escape')
      const onKey = e => { if (e.key === 'Escape') closeAllDropdowns(); };
      document.addEventListener('keydown', onKey);

      // ngOnInit
      ROWS.forEach(r => loadCurrent(r.key));
      if (params.get('save') === '1' && selParam[0] && ROW_BY_KEY[selParam[0]]) later(() => save(selParam[0]), LOAD_MS + 50);

      return {
        destroy() {
          timers.forEach(clearTimeout);
          document.removeEventListener('keydown', onKey);
        }
      };
    }
  };
})();
