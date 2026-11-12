/* ==========================================================================
   DCIM Sunum — Veri Kayıt Periyodu (NewUICMPDataSavePeriodComponent, 4 Kas sonrası bulk-config akışı)
   Kaynak: new-ui/pages/engineering/data-save-period/data-save-period.component.{html,ts} + bulk-config/
   Kayıt periyodu (his_per) ölçümün geçmişe yazılma aralığıdır. Bir dokümandaki grubun BÜTÜN cihazları seçiliyse
   değer grubun nokta sınıflarına (tio) yazılır (düzey "Sınıf (şablon)"); tek tek seçilen cihazlarda yalnız o
   cihazların noktalarına yazılır (düzey "Nokta bazında", sınıf değerini ezer).
   Akış: 1 Kapsam → 2 Yeni kayıt periyodu → "Önizle ve uygula" → önizleme → Uygula → geri okuyarak doğrulama.
   Veri: DCIM.data.bulkConfig (kurgusal sınıf adları/değerleri; yazmalar bellekte).

   Derin bağlantılar (engineering.html#data-save-period?...):
     ?floor=T00|T02|T03|DCB   ?group=pdu,ups   ?mode=pick&pick=K1NA06_PDU_A_DV,K1NA06_PDU_B_DV
     ?value=pdu:900   ?all=3600   ?step=preview   ?step=apply
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const esc = DCIM.ui.esc;

  function mount(el, params) {
    const B = DCIM.engBulk;
    const M = DCIM.data.bulkConfig;
    const grouped = B.groupDevices(M.devices(), B.SAVE_GROUPS);
    const docTotals = {};
    grouped.forEach(x => { const k = x.device.document + '|' + x.group.key; docTotals[k] = (docTotals[k] || 0) + 1; });
    let scope = B.scopeFromParams(params, grouped);
    let values = {};
    let rows = [];
    let reportMenu = null;
    (params.get('value') || '').split(',').forEach(p => { const [k, v] = p.split(':'); if (k && Number(v) > 0) values[k] = Number(v); });

    const classesOf = (doc, g) => M.classes(doc, g, docTotals[doc + '|' + g] || 0);

    el.innerHTML =
      '<div class="p-4 pb-20 space-y-3 eng-dsp">' +
        B.header('VERİ KAYIT PERİYODU', DCIM.ui.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', label: 'Yenile', attrs: 'data-refresh' })) +
        B.infoBox('Kayıt periyodu, ölçümün geçmişe (tarihçeye) yazılma aralığıdır (<span class="font-mono">his_per</span>). ' +
          'Bir dokümandaki grubun <strong>bütün</strong> cihazları seçiliyse değer grubun nokta sınıflarına (<span class="font-mono">tio</span>) yazılır; ' +
          '<strong>tek tek</strong> seçilen cihazlarda yalnız o cihazların noktalarına yazılır ve sınıf değerini ezer. ' +
          'Noktanın kendisinde ayrıca <span class="font-mono">his_per</span> yazılıysa sınıfa yazılan değer o noktayı etkilemez.') +
        '<div data-scope></div>' +
        '<section data-values class="' + B.SEC_CLS + '"></section>' +
        '<div data-bar></div>' +
      '</div>';

    const deviceValue = d => {
      const g = B.SAVE_GROUPS.find(x => x.match(d));
      return g ? B.distText(B.distribution(classesOf(d.document, g.key).map(c => c.his)), B.formatPeriod) : '—';
    };
    const scopeCmp = B.scope(el.querySelector('[data-scope]'), {
      groups: B.SAVE_GROUPS, grouped, scope, valueTitle: 'Sınıflardaki kayıt periyodu', valueFn: deviceValue,
      onChange: s => { scope = s; recompute(); }
    });

    function recompute() {
      const targets = B.resolveTargets(grouped, scope);
      rows = [];
      B.SAVE_GROUPS.forEach(g => {
        const ts = targets.filter(t => t.group.key === g.key);
        if (!ts.length) return;
        const cls = ts.flatMap(t => classesOf(t.doc, g.key));
        rows.push({ group: g, devices: ts.reduce((a, t) => a + t.devices.length, 0), classes: cls.length,
          dist: B.distribution(cls.map(c => c.his)), docs: ts.length, partial: ts.filter(t => !t.whole).length });
      });
      if (params.get('all')) { const v = Number(params.get('all')); rows.forEach(r => { values[r.group.key] = v; }); params.delete('all'); }
      renderValues();
      renderBar();
    }
    const pending = () => rows.filter(r => values[r.group.key]);

    function renderValues() {
      const host = el.querySelector('[data-values]');
      if (reportMenu) { reportMenu.destroy(); reportMenu = null; }
      const opt = (v, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(B.formatPeriod(v)) + '</option>';
      host.innerHTML =
        '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2">' +
          B.stepTitle(2, 'Yeni kayıt periyodu') +
          '<div class="flex items-center gap-2 text-[11px]">' +
            '<span class="text-slate-500 dark:text-slate-400">Hepsine aynı:</span>' +
            '<select data-all class="py-1 px-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[2px] text-[11px]"><option value="">seçin…</option>' + B.PERIOD_OPTIONS.map(v => opt(v, null)).join('') + '</select>' +
            '<span data-report></span>' +
          '</div>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-[11px] tabular-nums">' +
          '<thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50"><tr>' +
            '<th class="text-left font-semibold px-3 py-1.5 min-w-[160px]">Cihaz grubu</th><th class="text-right font-semibold px-2">Cihaz</th>' +
            '<th class="text-right font-semibold px-2" title="Grubun noktalarında kullanılan sınıflar (doküman başına)">Nokta sınıfı</th>' +
            '<th class="text-left font-semibold px-2 min-w-[200px]">Bugün (sınıflarda)</th><th class="text-left font-semibold px-2">Yazılacağı yer</th>' +
            '<th class="text-left font-semibold px-3 min-w-[150px]">Yeni periyot</th>' +
          '</tr></thead><tbody>' +
          rows.map(r => {
            const v = values[r.group.key];
            const multi = r.dist.length > 1;
            return '<tr class="border-t border-slate-100 dark:border-slate-800/70' + (v ? ' bg-sky-50/70 dark:bg-sky-950/20' : '') + '">' +
              '<td class="px-3 py-2"><div class="flex items-center gap-2"><span class="w-6 h-6 shrink-0 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="' + r.group.icon + ' text-[11px]"></i></span>' +
                '<span class="font-semibold text-slate-800 dark:text-slate-100 text-xs">' + esc(r.group.label) + '</span></div></td>' +
              '<td class="px-2 text-right font-semibold">' + B.fmt(r.devices) + '</td>' +
              '<td class="px-2 text-right">' + B.fmt(r.classes) + '</td>' +
              '<td class="px-2 py-2"><div class="flex flex-wrap gap-1">' + r.dist.map(d =>
                '<span class="px-1.5 py-px rounded-[2px] border text-[10px] font-semibold whitespace-nowrap ' + (multi ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200') + '">' +
                (d.value === null ? 'tanımsız' : B.formatPeriod(d.value)) + ' × ' + B.fmt(d.count) + ' sınıf</span>').join('') + '</div></td>' +
              '<td class="px-2 whitespace-nowrap">' + (!r.partial
                ? '<span class="text-slate-600 dark:text-slate-300">Sınıf · ' + r.docs + ' doküman</span>'
                : '<span class="px-1.5 py-px rounded-[2px] border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[10px] font-semibold" title="' + esc(B.POINT_LEVEL_NOTE) + '">Nokta bazında · ' + r.partial + ' doküman</span>') + '</td>' +
              '<td class="px-3 py-2"><select data-val="' + r.group.key + '" class="w-full py-1 px-2 bg-white dark:bg-slate-900 border rounded-[2px] text-[11px] font-semibold ' + (v ? 'border-sky-500 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300') + '">' +
                '<option value="">değiştirme</option>' + B.PERIOD_OPTIONS.map(x => opt(x, v)).join('') + '</select></td>' +
            '</tr>';
          }).join('') +
          (!rows.length ? '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-400">Kapsamda cihaz yok.</td></tr>' : '') +
          '</tbody></table></div>';
      reportMenu = DCIM.report.menu(host.querySelector('[data-report]'), {
        label: 'Rapor al', scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki kapsam seçimiyle' }],
        options: 'limit', unit: 'grup', total: rows.length, defaultLimit: 50, disabled: !rows.length, onExport: exportReport
      });
    }

    function exportReport(req) {
      const list = DCIM.report.applyLimit(rows, req);
      const devices = rows.reduce((a, r) => a + r.devices, 0);
      DCIM.report.generate({
        title: 'Veri Kayıt Periyodu Raporu',
        subtitle: 'Cihaz grupları · Mühendislik · ' + B.fmt(devices) + ' cihaz · kayıt periyodu (his_per)',
        filename: 'Veri_Kayit_Periyodu',
        kpis: [{ label: 'Grup', value: rows.length }, { label: 'Cihaz', value: devices }, { label: 'Nokta sınıfı', value: rows.reduce((a, r) => a + r.classes, 0) }],
        sections: [{
          title: 'Cihaz grupları',
          columns: [{ key: 'g', label: 'Cihaz grubu' }, { key: 'd', label: 'Cihaz', align: 'right' }, { key: 'c', label: 'Nokta sınıfı', align: 'right' },
            { key: 'p', label: 'Bugün (sınıflarda)' }, { key: 'w', label: 'Yazılacağı yer' }, { key: 'n', label: 'Yeni periyot' }],
          rows: list.map(r => ({ g: r.group.label, d: r.devices, c: r.classes, p: r.dist.map(d => B.formatPeriod(d.value) + ' × ' + d.count + ' sınıf').join(', '),
            w: r.partial ? 'Nokta bazında · ' + r.partial + ' doküman' : 'Sınıf · ' + r.docs + ' doküman', n: values[r.group.key] ? B.formatPeriod(values[r.group.key]) : '' }))
        }]
      }, req.format);
    }

    function renderBar() {
      const p = pending();
      B.pendingBar(el.querySelector('[data-bar]'), {
        count: p.length, devices: p.reduce((a, r) => a + r.devices, 0), unit: 'grupta',
        onClear: () => { values = {}; recompute(); }, onPreview: () => preview(false)
      });
    }

    function preview(autoRun) {
      const targets = B.resolveTargets(grouped, scope);
      const before = t => B.distText(B.distribution(classesOf(t.doc, t.group.key).map(c => c.his)), B.formatPeriod) + ' (sınıflarda)';
      const res = B.buildSaveOps(targets, values, before);
      const warnings = res.skipped.map(t => t.doc + ' · ' + t.group.label + ' için sınıf listesi boş; atlandı.');
      B.plan({
        title: 'Kayıt periyodu — önizleme', ops: res.ops, warnings, autoRun,
        onClosed: applied => { if (applied) values = {}; recompute(); scopeCmp.update({}); }
      });
    }

    el.addEventListener('change', e => {
      const t = e.target;
      if (t.hasAttribute('data-val')) { const v = Number(t.value); values[t.getAttribute('data-val')] = v > 0 ? v : undefined; recompute(); }
      else if (t.hasAttribute('data-all')) { const v = Number(t.value); rows.forEach(r => { values[r.group.key] = v > 0 ? v : undefined; }); recompute(); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b && b.hasAttribute('data-refresh')) { recompute(); scopeCmp.update({}); DCIM.ui.toast('Nokta sınıfları yeniden okundu.', 'info'); }
    });

    recompute();
    const step = params.get('step');
    if (step === 'preview' || step === 'apply') {
      if (!pending().length) {
        const r = rows.find(x => x.group.key === 'ups') || rows[0];
        if (r) values[r.group.key] = 300;
        recompute();
      }
      setTimeout(() => preview(step === 'apply'), 50);
    }

    return {
      destroy() {
        if (reportMenu) reportMenu.destroy();
        document.querySelectorAll('body > .fixed.inset-0.z-50').forEach(n => n.remove());
      }
    };
  }

  DCIM.engRegistry['data-save-period'] = { mount };
})();
