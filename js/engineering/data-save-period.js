/* ==========================================================================
   DCIM Sunum — Veri Kayıt Periyodu (NewUICMPDataSavePeriodComponent)
   Kaynak: new-ui/pages/engineering/data-save-period/data-save-period.component.{html,ts}
   "2D ve Enerji Cihazlarının kayıt sıklığını ayarlama."
   Veri Sorgulama Periyodu ile aynı yerleşim; fark: cihaz filtresi yerine nokta sınıfı (tio) listeleri,
   öznitelik tio/@his_per, Kompanzasyon ve Jeneratör satırları yok.
   Güncelle → XDB_SetValue(//tio[@id=…]/@his_per) + #save, 1,5 sn aralıkla doğrulama →
   toast "{label} başarıyla güncellendi." (sınıf listesi boşsa uyarı toast'ı "{label} için sınıf listesi boş.")
   Veri: DCIM.data.dataSavePeriod (js/mock/eng-data-save-period.data.js)

   Sunum eki (kaynakta yok): satır başlığındaki "N sınıf" çipi, güncellemeden etkilenecek nokta
   sınıflarını (sınıf kimliği, nokta sayısı, mevcut his_per) listeler. Dokümanda tanımlı olmayan
   sınıflar (ör. ENT_*, HUW_PF) "Dokümanda yok" olarak gösterilir ve güncellenmez.

   Derin bağlantılar (engineering.html#data-save-period?...):
     ?open=pdu                  → sınıf listesini açık getirir (virgülle birden çok)
     ?sel=sdp:300               → satırda aralık önseçimi (anahtar:saniye)
     ?sel=sdp:300&save=1        → önseçimi hemen kaydeder (yükleniyor durumu + toast)
     ?menu=sensor               → satırın açılır listesini açık getirir
   Satır anahtarları: pdu, climate, climatePanel, sdp, sensor, analyzer, rectifier, upsEnergy
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // messages.tr.json → dataSavePeriod.*
  const T = {
    title: 'VERİ KAYIT PERİYODU',
    engineering: 'Mühendislik',
    back: 'Geri',
    deviceSettings2D: '2D Cihaz Ayarları',
    energyDeviceSettings: 'Enerji Cihazları Ayarları',
    current: 'Mevcut Kayıt aralığı',
    secondsAbbrev: 'sn',
    loadingNewValue: 'Yeni değer yükleniyor...',
    selectFromList: 'Listeden seçiniz...',
    update: 'Güncelle',
    updatedSuccessfully: '{label} başarıyla güncellendi.',
    classEmptyWarning: '{label} için sınıf listesi boş.'
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

  const ROWS_2D = [
    { key: 'pdu', dev: 'PDU', title: 'PDU Kayıt Aralığı' },
    { key: 'climate', dev: 'Klima', title: 'Klima Kayıt Aralığı' },
    { key: 'climatePanel', dev: 'Klima Panosu', title: 'Klima Panosu Kayıt Aralığı' },
    { key: 'sdp', dev: 'SDP', title: 'SDP Kayıt Aralığı' },
    { key: 'sensor', dev: 'Sensör', title: 'Sensör Kayıt Aralığı' }
  ];
  const ROWS_ENERGY = [
    { key: 'analyzer', dev: 'Enerji Analizörü', title: 'Enerji Analizörleri' },
    { key: 'rectifier', dev: 'Redresör', title: 'Redresör Kayıt Aralığı' },
    { key: 'upsEnergy', dev: 'UPS', title: 'UPS Modülü Kayıt Aralığı' }
  ];
  const ROWS = ROWS_2D.concat(ROWS_ENERGY);
  const ROW_BY_KEY = {};
  ROWS.forEach(r => { ROW_BY_KEY[r.key] = r; });

  // Kaynak şablondaki sınıflar
  const SELECT_BTN_CLS = 'scada-input w-full flex items-center justify-between py-1 px-2.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-border-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left font-medium';
  const MENU_CLS = 'absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-lg py-0.5';
  const OPT_CLS = 'px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors';

  const POLL_MS = 1500;
  const LOAD_MS = 250;

  DCIM.engRegistry['data-save-period'] = {
    mount(el, params) {
      const { esc, button, buttonClasses, toast, fmtNum } = DCIM.ui;
      const kit = DCIM.kit;
      const S = DCIM.data.dataSavePeriod;

      const state = { current: {}, selection: {}, loading: {}, dropdown: null, scope: {} };
      const timers = [];
      const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

      (params.get('open') || '').split(',').filter(k => ROW_BY_KEY[k]).forEach(k => { state.scope[k] = true; });
      const selParam = (params.get('sel') || '').split(':');
      if (ROW_BY_KEY[selParam[0]] && INTERVALS.some(o => String(o.value) === selParam[1])) state.selection[selParam[0]] = Number(selParam[1]);
      if (ROW_BY_KEY[params.get('menu')]) state.dropdown = params.get('menu');

      function getIntervalLabel(value) {
        if (value == null) return T.selectFromList;
        const found = INTERVALS.find(x => x.value === value);
        return found ? found.label : T.selectFromList;
      }

      // ------------------------------------------------------------------
      // Sunum eki — sınıf çipi + sınıf listesi
      // ------------------------------------------------------------------
      function scopeChip(row) {
        const g = S.groups[row.key];
        const open = !!state.scope[row.key];
        const missing = g.classes.filter(c => !c.exists).length;
        return '<button type="button" data-scope="' + row.key + '" title="Güncellenecek nokta sınıfları" class="inline-flex items-center gap-1 px-1.5 py-px rounded-[2px] border text-[9px] font-bold transition-colors ' +
          (open ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400' : 'border-slate-200 dark:border-border-subtle text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:border-sky-500/40') + '">' +
          '<i class="pi pi-tags text-[9px]"></i><span>' + g.classes.length + ' sınıf</span>' +
          (missing ? '<span class="text-slate-400 dark:text-slate-500">· ' + missing + ' tanımsız</span>' : '') +
          '<i class="pi ' + (open ? 'pi-chevron-up' : 'pi-chevron-down') + ' text-[8px]"></i>' +
        '</button>';
      }

      function scopePanel(row) {
        const g = S.groups[row.key];
        const loading = !!state.loading[row.key];
        const points = g.classes.reduce((s, c) => s + c.points, 0);
        const body = g.classes.map(c => {
          const isFirst = c.id === g.first;
          let per;
          if (!c.exists) per = '<span class="italic text-slate-400 dark:text-slate-500 font-medium">Dokümanda yok</span>';
          else if (loading) per = '<span class="text-sky-500 animate-pulse">…</span>';
          else per = c.his != null ? esc(c.his) + ' ' + T.secondsAbbrev : '<span class="text-slate-400">—</span>';
          return '<tr class="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-surface-hover' + (c.exists ? '' : ' opacity-60') + '">' +
            '<td class="px-2 py-1 font-mono text-[10px] text-slate-700 dark:text-slate-300 whitespace-nowrap">' + esc(c.id) +
              (isFirst ? ' <span class="ml-1 px-1 py-px rounded-[2px] text-[8px] font-bold font-sans bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20" title="Mevcut Kayıt aralığı bu sınıftan okunur">[1]</span>' : '') + '</td>' +
            '<td class="px-2 py-1 text-right text-slate-600 dark:text-slate-400">' + (c.exists ? fmtNum(c.points, 0) : '—') + '</td>' +
            '<td class="px-2 py-1 text-right whitespace-nowrap font-bold text-slate-800 dark:text-slate-200">' + per + '</td>' +
          '</tr>';
        }).join('');
        return '<div class="mt-2 border border-slate-200 dark:border-border-subtle rounded-[2px] bg-slate-50/60 dark:bg-surface-panel/60 animate-fade-in" data-scope-panel="' + row.key + '">' +
          '<div class="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-slate-200 dark:border-border-subtle text-[10px] text-slate-500 dark:text-slate-400">' +
            '<i class="pi pi-sitemap text-[10px] text-sky-500"></i>' +
            '<span>Doküman <strong class="text-slate-700 dark:text-slate-300">' + esc(g.doc) + '</strong></span>' +
            '<span>·</span><span class="font-mono">tio/@his_per</span>' +
            '<span>·</span><span>' + g.classes.length + ' sınıf</span>' +
            '<span>·</span><span>' + fmtNum(points, 0) + ' nokta</span>' +
          '</div>' +
          '<div class="max-h-56 overflow-y-auto">' +
            '<table class="w-full text-[11px]">' +
              '<thead class="sticky top-0 bg-slate-100 dark:bg-surface-panel text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">' +
                '<tr><th class="px-2 py-1 text-left font-bold">Nokta Sınıfı</th><th class="px-2 py-1 text-right font-bold">Nokta</th>' +
                '<th class="px-2 py-1 text-right font-bold">Kayıt Periyodu</th></tr>' +
              '</thead>' +
              '<tbody>' + body + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
      }

      // ------------------------------------------------------------------
      // Satır
      // ------------------------------------------------------------------
      function updateButton(row) {
        const loading = !!state.loading[row.key];
        const disabled = state.selection[row.key] == null || loading;
        return '<button type="button" data-save="' + row.key + '" class="' + buttonClasses('primary', 'sm', false) + '"' +
          (disabled ? ' disabled aria-disabled="true"' : '') + (loading ? ' aria-busy="true"' : '') + '>' +
          (loading ? '<i class="pi pi-spin pi-spinner text-current"></i>' : '') +
          '<span class="truncate">' + esc(T.update) + '</span></button>';
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
              '<span>' + esc(T.current) + ':</span>' +
              (loading
                ? '<strong class="text-sky-500 animate-pulse font-semibold">' + esc(T.loadingNewValue) + '</strong>'
                : '<strong class="text-slate-800 dark:text-slate-200">' + (cur != null ? esc(cur) : '...') + ' ' + esc(T.secondsAbbrev) + '</strong>') +
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
        '<div class="p-4 eng-dsp" data-root>' +
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

      // loadTioCommon — XDB_GetValue(//tio[…][1]/@his_per)
      function loadCurrent(key) {
        if (S.classIds(key).length === 0) { state.current[key] = undefined; paint(key); return; }
        later(() => {
          const raw = S.get(key);
          if (raw != null && String(raw).trim() !== '') {
            const val = parseInt(String(raw).trim(), 10);
            state.current[key] = isNaN(val) ? undefined : val;
          } else {
            state.current[key] = undefined;
          }
          paint(key);
        }, LOAD_MS);
      }

      // save*Intervals + saveTiosCommon
      function save(key) {
        const row = ROW_BY_KEY[key];
        const newValue = state.selection[key];
        if (!newValue) return;   // kaynakla aynı: `if (!this.xSelection) return;` (0 = Anlık kaydedilmez)
        const afterSave = () => { state.selection[key] = undefined; paint(key); loadCurrent(key); };
        if (S.classIds(key).length === 0) {
          toast(T.classEmptyWarning.replace('{label}', row.dev), 'warning');
          afterSave();
          return;
        }
        state.loading[key] = true;
        paint(key);
        S.set(key, newValue);    // XDB_SetValue(tio/@his_per) + XDB_SetValue(#save, 1)
        const checkUpdate = () => {
          const currentXdbValue = S.get(key);
          if (currentXdbValue === newValue) {
            state.loading[key] = false;
            toast(T.updatedSuccessfully.replace('{label}', row.dev), 'success');
            afterSave();
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
