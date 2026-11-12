/* ==========================================================================
   DCIM Sunum — Alarm Eşikleri (NewUICMPBulkSettingsComponent; eski adı "Toplu Parametre Ayarları")
   Kaynak: new-ui/pages/engineering/bulk-settings/bulk-settings.component.{html,ts} + bulk-config/
   Akış: 1 Kapsam (kat · grup: SENSÖR / KLİMA PANOLARI / SDP PANOLARI / PDU) → 2 Yeni eşikler (Acil/Alarm/Uyarı üst-alt,
   alarma geçiş/normalleşme süresi; boş alan değişmez, gri yazı kapsamdaki bugünkü değer, placeholder önerilen değer;
   sıra denetimi: üstte Acil ≥ Alarm ≥ Uyarı, altta Acil ≤ Alarm ≤ Uyarı) → "Önizle ve uygula" → önizleme → Uygula →
   geri okuyarak doğrulama. Ayrıca "Sigorta eşik politikası (PDU)": anma akımının yüzdesi (Uyarı/Alarm/Acil),
   "Politikayı uygula" ve "Cihaz eşiğinden farklı olanlar" tablosu (+ Rapor al).
   Veri: DCIM.data.bulkConfig (kurgusal; yazmalar bellekte).

   Derin bağlantılar (engineering.html#bulk-settings?...):
     ?group=SENSOR|KLIMA|SDP|PDU   ?floor=T00|T02|T03|DCB   ?mode=pick&pick=POD6_1DM03_ID01_DV
     ?step=preview   (değer yoksa SENSÖR Üst Sıcaklık: Alarm 35 / Uyarı 30 önseçilir)   ?step=apply
     ?mismatch=1     cihaz eşiğinden farklı sigortalar tablosunu açık getirir
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const esc = DCIM.ui.esc;

  const LIMIT_COLS = [
    { field: 'emr_hi', label: 'Acil Üst', sev: 'emr' },
    { field: 'alm_hi', label: 'Alarm Üst', sev: 'alm' },
    { field: 'wrn_hi', label: 'Uyarı Üst', sev: 'wrn' },
    { field: 'wrn_lo', label: 'Uyarı Alt', sev: 'wrn' },
    { field: 'alm_lo', label: 'Alarm Alt', sev: 'alm' },
    { field: 'emr_lo', label: 'Acil Alt', sev: 'emr' }
  ];
  const DELAY_COLS = [
    { field: 'alm_dly_set', label: 'Alarma Geçiş Süresi (sn)' },
    { field: 'alm_dly_rst', label: 'Normalleşme Süresi (sn)' }
  ];
  const FIELD_LABEL = {};
  LIMIT_COLS.concat(DELAY_COLS).forEach(c => { FIELD_LABEL[c.field] = c.label; });
  const GROUP_HINT = {
    SENSOR: 'Kabin sıcaklık ve nem noktaları (io_role cabin_temp / cabin_hum); sensör cihazlarının altında',
    KLIMA: 'Klima panolarının (dev_type crac_panel) gerilim, akım ve güç noktaları',
    SDP: 'Panoların (dev_type panel) gerilim, akım ve güç noktaları',
    PDU: 'Sigorta akımı: grubun tamamında sınıfa (io_role ocp_curr), tek tek seçimde cihazın noktalarına'
  };
  const SEV_HEAD = {
    emr: 'border-purple-500 text-purple-700 dark:text-purple-300',
    alm: 'border-red-500 text-red-600 dark:text-red-400',
    wrn: 'border-amber-500 text-amber-700 dark:text-amber-400'
  };
  const INPUT = 'w-full py-1 px-2 bg-white dark:bg-surface-panel border border-slate-300 dark:border-border-subtle rounded-[2px] text-[11px] text-right font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 placeholder:font-normal focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40';

  function mount(el, params) {
    const B = DCIM.engBulk;
    const M = DCIM.data.bulkConfig;
    const grouped = B.groupDevices(M.devices(), B.ALARM_GROUPS);
    let scope = B.scopeFromParams(params, grouped);
    let edits = {};          // paramKey → { field: value }
    let views = [];
    let policy = M.policy;
    let mismatchRows = params.get('mismatch') === '1' ? M.mismatch() : null;
    let mismatchMenu = null;

    el.innerHTML =
      '<div class="p-4 pb-20 space-y-3 eng-bs">' +
        B.header('ALARM EŞİKLERİ',
          '<div class="flex items-center gap-2.5 text-[10.5px] font-semibold">' +
            '<span class="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300"><span class="w-2 h-2 rounded-[1px] bg-purple-500"></span>Acil</span>' +
            '<span class="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><span class="w-2 h-2 rounded-[1px] bg-red-500"></span>Alarm</span>' +
            '<span class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400"><span class="w-2 h-2 rounded-[1px] bg-amber-500"></span>Uyarı</span>' +
          '</div>' +
          DCIM.ui.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', label: 'Yenile', attrs: 'data-refresh' })) +
        B.infoBox('<strong>1</strong> kapsamı seçin, <strong>2</strong> değiştirmek istediğiniz eşikleri girin (boş alan değişmez; gri yazı kapsamdaki bugünkü değerdir), ' +
          '<strong>3</strong> önizlemeyi kontrol edip uygulayın. Üstte Acil ≥ Alarm ≥ Uyarı, altta Acil ≤ Alarm ≤ Uyarı olmalıdır. Her değişiklik denetim kaydına (ESIK) yazılır.') +
        '<div data-scope></div>' +
        '<section data-edits class="' + B.SEC_CLS + '"></section>' +
        '<section data-policy class="' + B.SEC_CLS + ' p-3"></section>' +
        '<div data-bar></div>' +
      '</div>';

    const scopeCmp = B.scope(el.querySelector('[data-scope]'), {
      groups: B.ALARM_GROUPS, grouped, scope, onChange: s => { scope = s; renderEdits(); renderBar(); }
    });

    const row = p => edits[p.key] || {};
    const fieldsOf = p => LIMIT_COLS.map(c => c.field).concat(p.hasDelay ? DELAY_COLS.map(c => c.field) : []);
    const rowDirty = p => Object.keys(row(p)).some(f => row(p)[f] !== '' && row(p)[f] !== undefined && row(p)[f] !== null);
    const rowOrderOk = p => B.thresholdOrderOk(row(p));
    const recommended = (p, f) => { const r = B.RECOMMENDED[p.cat] || {}; return r[f] !== undefined ? r[f] : ''; };
    const viewOf = p => views.find(v => v.group.key === p.group);

    function currentDist(p, f) {
      const v = viewOf(p);
      if (!v) return [];
      return B.distribution(v.keys.map(k => M.thr(k, p.key)[f]).filter(x => x !== undefined));
    }
    function currentText(p, f) {
      const d = currentDist(p, f);
      if (!d.length) return 'bugün —';
      return 'bugün ' + B.distText(d, x => x === null ? 'tanımsız' : B.fmt(x, 1));
    }

    function renderEdits() {
      const targets = B.resolveTargets(grouped, scope);
      views = B.ALARM_GROUPS.map(g => {
        const ts = targets.filter(t => t.group.key === g.key);
        if (!ts.length) return null;
        const devs = ts.flatMap(t => t.devices);
        return { group: g, devices: devs.length, keys: devs.map(d => d.key), docs: ts.length, partial: ts.filter(t => !t.whole).length,
          params: B.ALARM_PARAMS.filter(p => p.group === g.key) };
      }).filter(Boolean);
      const host = el.querySelector('[data-edits]');
      host.innerHTML =
        '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex items-center gap-2">' + B.stepTitle(2, 'Yeni eşikler') + '</div>' +
        (!views.length ? '<div class="px-3 py-4 text-center text-[11px] text-slate-400">Kapsamda cihaz yok.</div>' : '') +
        views.map(v =>
          '<div class="border-b last:border-b-0 border-slate-200 dark:border-border-subtle">' +
            '<div class="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 bg-slate-50/70 dark:bg-slate-900/30">' +
              '<div class="flex items-center gap-2"><span class="w-6 h-6 shrink-0 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="' + v.group.icon + ' text-[11px]"></i></span>' +
                '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(v.group.label) + '</h3></div>' +
              '<span class="text-[10.5px] text-slate-600 dark:text-slate-300 tabular-nums"><strong>' + B.fmt(v.devices) + '</strong> cihaz · ' + v.docs + ' doküman</span>' +
              (v.partial ? '<span class="px-1.5 py-px rounded-[2px] border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[10px] font-semibold">' + v.partial + ' dokümanda cihaz bazında</span>' : '') +
              '<span class="text-[10.5px] text-slate-500 dark:text-slate-400">' + esc(GROUP_HINT[v.group.key]) + '</span>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-[11px] tabular-nums"><thead class="bg-white dark:bg-surface-card"><tr class="text-[10px] uppercase tracking-wider">' +
              '<th class="text-left font-semibold px-3 py-1.5 text-slate-500 dark:text-slate-400 min-w-[150px]">Parametre</th>' +
              LIMIT_COLS.map(c => '<th class="font-semibold px-1.5 py-1.5 text-center border-b-2 min-w-[90px] ' + SEV_HEAD[c.sev] + '">' + c.label + '</th>').join('') +
              (v.params[0] && v.params[0].hasDelay ? DELAY_COLS.map(c => '<th class="font-semibold px-1.5 py-1.5 text-center text-slate-500 dark:text-slate-400 border-b-2 border-slate-300 dark:border-slate-600 min-w-[100px] normal-case">' + c.label + '</th>').join('') : '') +
              '<th class="px-3 w-[1%]"></th>' +
            '</tr></thead><tbody>' +
            v.params.map(p => paramRow(p)).join('') +
            '</tbody></table></div>' +
          '</div>').join('');
    }

    function paramRow(p) {
      const r = row(p);
      const cell = c => '<td class="px-1.5 py-2"><input type="number" data-p="' + p.key + '" data-f="' + c.field + '" class="' + INPUT + '" value="' + esc(r[c.field] !== undefined ? r[c.field] : '') + '" placeholder="' + esc(recommended(p, c.field)) + '"' +
        (recommended(p, c.field) !== '' ? ' title="Önerilen: ' + esc(recommended(p, c.field)) + '"' : '') + '>' +
        '<div class="mt-0.5 text-[9.5px] text-right text-slate-500 dark:text-slate-400 truncate" title="' + esc(currentText(p, c.field)) + '">' + esc(currentText(p, c.field)) + '</div></td>';
      return '<tr data-prow="' + p.key + '" class="border-t border-slate-100 dark:border-slate-800/70 align-top ' + rowCls(p) + '">' +
        '<td class="px-3 py-2"><div class="text-xs font-semibold text-slate-800 dark:text-slate-100">' + esc(p.label) + '</div><div class="text-[10px] text-slate-400">birim: ' + esc(p.unit) + '</div>' +
          '<div data-order-err class="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 max-w-[180px] leading-snug' + (rowOrderOk(p) ? ' hidden' : '') + '">Eşikler sıralı olmalı: üstte Acil ≥ Alarm ≥ Uyarı, altta Acil ≤ Alarm ≤ Uyarı.</div></td>' +
        LIMIT_COLS.map(cell).join('') +
        (p.hasDelay ? DELAY_COLS.map(cell).join('') : '') +
        '<td class="px-3 py-2"><div class="flex items-center gap-1 justify-end">' +
          '<button type="button" data-fill="' + p.key + '" class="w-7 h-7 rounded-[2px] border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-sky-600 hover:border-sky-500 flex items-center justify-center cursor-pointer" title="Boş alanlara önerilen değerleri yaz"><i class="pi pi-lightbulb text-[11px]"></i></button>' +
          '<button type="button" data-clearrow="' + p.key + '" class="w-7 h-7 rounded-[2px] border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-rose-600 hover:border-rose-500 flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed" title="Satırı temizle"' + (rowDirty(p) ? '' : ' disabled') + '><i class="pi pi-eraser text-[11px]"></i></button>' +
        '</div></td>' +
      '</tr>';
    }
    const rowCls = p => !rowOrderOk(p) ? 'bg-rose-50 dark:bg-rose-950/20' : rowDirty(p) ? 'bg-sky-50/70 dark:bg-sky-950/20' : '';
    function refreshRow(p) {
      const tr = el.querySelector('[data-prow="' + p.key + '"]');
      if (!tr) return;
      ['bg-rose-50', 'dark:bg-rose-950/20', 'bg-sky-50/70', 'dark:bg-sky-950/20'].forEach(c => tr.classList.remove(c));
      rowCls(p).split(' ').filter(Boolean).forEach(c => tr.classList.add(c));
      tr.querySelector('[data-order-err]').classList.toggle('hidden', rowOrderOk(p));
      tr.querySelector('[data-clearrow]').disabled = !rowDirty(p);
    }

    const visibleParams = () => views.flatMap(v => v.params);
    const pendingRows = () => visibleParams().filter(rowDirty);
    const invalidRows = () => pendingRows().filter(p => !rowOrderOk(p));

    function renderBar() {
      const p = pendingRows();
      const devs = p.reduce((a, x) => a + ((viewOf(x) || {}).devices || 0), 0);
      B.pendingBar(el.querySelector('[data-bar]'), {
        count: p.length, devices: devs, unit: 'parametrede', invalid: invalidRows().length,
        onClear: () => { edits = {}; renderEdits(); renderBar(); }, onPreview: () => preview(false)
      });
    }

    function preview(autoRun) {
      if (invalidRows().length) return;
      const targets = B.resolveTargets(grouped, scope);
      const list = pendingRows().map(p => {
        const vals = {};
        fieldsOf(p).forEach(f => { const v = row(p)[f]; if (v !== undefined && v !== '' && v !== null) vals[f] = Number(v); });
        return { param: p, values: vals };
      });
      const before = (t, p) => {
        const keys = t.devices.map(d => d.key);
        const fields = Object.keys(row(p)).filter(f => row(p)[f] !== '' && row(p)[f] !== undefined);
        return fields.map(f => FIELD_LABEL[f] + ' ' + B.distText(B.distribution(keys.map(k => M.thr(k, p.key)[f]).filter(x => x !== undefined)), x => x === null ? 'tanımsız' : B.fmt(x, 1))).join(' · ');
      };
      const ops = B.buildAlarmOps(targets, list, before);
      const warnings = [];
      if (list.some(e => e.param.group === 'PDU' && (e.values.alm_hi !== undefined || e.values.wrn_hi !== undefined || e.values.emr_hi !== undefined))) {
        warnings.push(B.PDU_POINT_NOTE);
      }
      B.plan({
        title: 'Alarm eşikleri — önizleme', ops, warnings, autoRun,
        onClosed: applied => { if (applied) edits = {}; renderEdits(); renderBar(); }
      });
    }

    // ---- Sigorta eşik politikası (ADR-0007)
    function renderPolicy() {
      const host = el.querySelector('[data-policy]');
      if (mismatchMenu) { mismatchMenu.destroy(); mismatchMenu = null; }
      const inp = (k, label, color, txt) => '<label class="flex flex-col gap-0.5"><span class="text-[10px] font-semibold ' + txt + '">' + label + '</span>' +
        '<input type="number" min="1" max="100" data-pol="' + k + '" value="' + policy[k] + '" class="w-20 py-1 px-2 bg-white dark:bg-surface-panel border-0 border-b-2 ' + color + ' rounded-[2px] text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1"></label>';
      host.innerHTML =
        '<div class="flex flex-wrap items-start justify-between gap-3">' +
          '<div class="min-w-0 max-w-xl"><div class="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-shield text-sky-500 text-[11px]"></i>Sigorta eşik politikası (PDU)</div>' +
            '<p class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">Eşikler sigortanın anma akımının yüzdesidir; anma akımı PDU\'dan okunur. Cihazdaki eşik yalnız referanstır. Politika kapsam seçiminden bağımsızdır; politikanın tanımlı olduğu bütün dokümanlara uygulanır.</p></div>' +
          '<div class="flex flex-wrap items-end gap-2">' +
            inp('wrn', 'Uyarı %', 'border-amber-500', 'text-amber-700 dark:text-amber-400') +
            inp('alm', 'Alarm %', 'border-red-500', 'text-red-600 dark:text-red-400') +
            inp('emr', 'Acil %', 'border-purple-500', 'text-purple-700 dark:text-purple-400') +
            DCIM.ui.button({ variant: 'primary', size: 'sm', label: 'Politikayı uygula', attrs: 'data-pol-apply' }) +
            DCIM.ui.button({ variant: 'secondary', size: 'sm', label: 'Cihaz eşiğinden farklı olanlar', attrs: 'data-pol-mismatch' }) +
          '</div>' +
        '</div>' +
        '<div class="mt-2.5 relative h-2 rounded-[2px] bg-emerald-500/20 overflow-hidden" title="Anma akımına göre eşikler">' +
          '<div class="absolute inset-y-0 bg-amber-500/60" style="left:' + policy.wrn + '%;width:' + Math.max(0, policy.alm - policy.wrn) + '%"></div>' +
          '<div class="absolute inset-y-0 bg-red-500/70" style="left:' + policy.alm + '%;width:' + Math.max(0, policy.emr - policy.alm) + '%"></div>' +
          '<div class="absolute inset-y-0 bg-purple-500/80" style="left:' + policy.emr + '%;width:' + Math.max(0, 100 - policy.emr) + '%"></div>' +
        '</div>' +
        '<div class="flex justify-between text-[9.5px] text-slate-400 mt-0.5 tabular-nums"><span>%0</span><span>anma akımı %100</span></div>' +
        (mismatchRows ?
          '<div class="mt-2"><div class="flex flex-wrap items-center justify-between gap-2 mb-1">' +
            '<p class="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">' + (mismatchRows.length ? mismatchRows.length + ' sigortada DCIM eşiği cihazdakinden farklı.' : 'Fark yok.') + '</p><span data-mm-report></span></div>' +
            (mismatchRows.length ?
            '<div class="max-h-56 overflow-auto border border-slate-200 dark:border-border-subtle rounded-[2px]"><table class="w-full text-[10.5px] tabular-nums">' +
              '<thead class="bg-slate-100 dark:bg-slate-900 sticky top-0 text-slate-500 dark:text-slate-400"><tr><th class="text-left font-semibold px-2 py-1">Nokta</th><th class="text-right font-semibold px-2 py-1">DCIM (Alarm / Uyarı)</th><th class="text-right font-semibold px-2 py-1">Cihaz (Alarm / Uyarı)</th></tr></thead><tbody>' +
              mismatchRows.map(r => '<tr class="border-t border-slate-100 dark:border-slate-800"><td class="px-2 py-0.5" title="' + esc(r.id) + '">' + esc(r.desc) + '</td><td class="px-2 py-0.5 text-right font-mono">' + esc(r.act) + '</td><td class="px-2 py-0.5 text-right font-mono">' + esc(r.dev) + '</td></tr>').join('') +
            '</tbody></table></div>' : '') +
          '</div>' : '') +
        '<p class="mt-2 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400 flex items-start gap-1.5"><i class="pi pi-info-circle text-[10px] mt-0.5"></i>Sigorta eşiklerinin sahibi DCIM politikasıdır (aşağıda, anma akımının yüzdesi). PDU\'daki eşik referanstır; yalnız anma akımı okunamayan sigortada geçerli olur. Buradaki alt eşikler ve gecikmeler tüm sigortalara uygulanır.</p>';
      const mm = host.querySelector('[data-mm-report]');
      if (mm && mismatchRows && mismatchRows.length) {
        mismatchMenu = DCIM.report.menu(mm, {
          label: 'Rapor al', scopes: [{ id: 'list', label: 'Farklı sigortalar', hint: 'Cihazdaki eşikten farklı olanlar' }],
          options: 'limit', unit: 'nokta', total: mismatchRows.length, defaultLimit: 50,
          onExport: req => DCIM.report.generate({
            title: 'Cihazdaki eşikten farklı sigortalar', subtitle: 'Sigorta eşik politikası · Uyarı %' + policy.wrn + ' · Alarm %' + policy.alm + ' · Acil %' + policy.emr,
            filename: 'Sigorta_Esik_Farklari',
            kpis: [{ label: 'Sigorta', value: mismatchRows.length, tone: 'warning' }],
            sections: [{ title: 'Sigortalar', columns: [{ key: 'desc', label: 'Nokta' }, { key: 'id', label: 'Kimlik' }, { key: 'act', label: 'DCIM (Alarm / Uyarı)', align: 'right' }, { key: 'dev', label: 'Cihaz (Alarm / Uyarı)', align: 'right' }],
              rows: DCIM.report.applyLimit(mismatchRows, req) }]
          }, req.format)
        });
      }
    }

    function applyPolicy() {
      const p = {};
      ['wrn', 'alm', 'emr'].forEach(k => { p[k] = Number(el.querySelector('[data-pol="' + k + '"]').value); });
      if (!(p.wrn > 0 && p.wrn < p.alm && p.alm < p.emr && p.emr <= 100)) {
        DCIM.ui.toast('Yüzdeler kesin sıralı olmalı: Uyarı < Alarm < Acil; her biri %0\'dan büyük ve en çok %100.', 'error');
        return;
      }
      M.setPolicy(p);
      policy = M.policy;
      if (mismatchRows) mismatchRows = M.mismatch();
      renderPolicy();
      renderEdits();
      DCIM.ui.toast('Politika kaydedildi ve bütün sigortalara uygulandı.', 'success');
    }

    el.addEventListener('input', e => {
      const t = e.target;
      if (t.hasAttribute('data-p')) {
        const p = B.ALARM_PARAMS.find(x => x.key === t.getAttribute('data-p'));
        const r = Object.assign({}, row(p));
        if (t.value === '') delete r[t.getAttribute('data-f')]; else r[t.getAttribute('data-f')] = Number(t.value);
        edits[p.key] = r;
        refreshRow(p);
        renderBar();
      }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-fill')) {
        const p = B.ALARM_PARAMS.find(x => x.key === b.getAttribute('data-fill'));
        const r = Object.assign({}, row(p));
        fieldsOf(p).forEach(f => { const v = recommended(p, f); if (v !== '' && (r[f] === undefined || r[f] === '')) r[f] = v; });
        edits[p.key] = r;
        renderEdits(); renderBar();
      } else if (b.hasAttribute('data-clearrow')) {
        delete edits[b.getAttribute('data-clearrow')];
        renderEdits(); renderBar();
      } else if (b.hasAttribute('data-pol-apply')) applyPolicy();
      else if (b.hasAttribute('data-pol-mismatch')) {
        b.disabled = true;
        b.innerHTML = '<i class="pi pi-spin pi-spinner"></i><span>Okunuyor…</span>';
        setTimeout(() => { mismatchRows = M.mismatch(); renderPolicy(); }, 450);
      } else if (b.hasAttribute('data-refresh')) { renderEdits(); renderBar(); DCIM.ui.toast('Bugünkü eşikler yeniden okundu.', 'info'); }
    });

    renderEdits();
    renderPolicy();
    renderBar();
    const step = params.get('step');
    if (step === 'preview' || step === 'apply') {
      if (!pendingRows().length) {
        const p = visibleParams().find(x => x.key === 'TEMP_TOP') || visibleParams()[0];
        if (p) edits[p.key] = p.key === 'TEMP_TOP' ? { alm_hi: 35, wrn_hi: 30 } : Object.assign({}, B.RECOMMENDED[p.cat]);
        renderEdits(); renderBar();
      }
      setTimeout(() => preview(step === 'apply'), 50);
    }

    return {
      destroy() {
        if (mismatchMenu) mismatchMenu.destroy();
        document.querySelectorAll('body > .fixed.inset-0.z-50').forEach(n => n.remove());
      }
    };
  }

  DCIM.engRegistry['bulk-settings'] = { mount };
})();
