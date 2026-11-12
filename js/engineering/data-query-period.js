/* ==========================================================================
   DCIM Sunum — Veri Sorgulama Periyodu (NewUICMPDataQueryPeriodComponent, 4 Kas sonrası bulk-config akışı)
   Kaynak: new-ui/pages/engineering/data-query-period/data-query-period.component.{html,ts}
           + bulk-config/ (app-bulk-scope, app-bulk-plan, app-period-sampler)
   Akış: 1 Kapsam (kat · cihaz grubu · bütün cihazlar / listeden seç) → 2 Yeni sorgu periyodu (grup tablosu, bugünkü
   periyot dağılımı, yük ≈ blok ÷ periyot) → alttaki çubuk "Önizle ve uygula" → 3 önizleme penceresi (yazma planı,
   düzey: Grubun tamamı / Cihaz bazında) → Uygula → canlı yazma, dosyaya yazma, geri okuyarak doğrulama.
   3 · Doğrulama: örnek nokta — kapsamdan sağlıklı bir cihaz/nokta seçilir, okumalar ve aralıkları listelenir.
   Veri: DCIM.data.bulkConfig (js/mock/eng-bulk-config.data.js) — kurgusal; yazmalar bellekte.

   Derin bağlantılar (engineering.html#data-query-period?...):
     ?floor=T00,T02|DCB   ?group=pdu,sensor   ?mode=pick&pick=K1NA06_PDU_B_DV,K1DL03_PDU_B_DV
     ?value=pdu:60,sensor:10   (yeni periyot önseçimi, saniye)   ?all=300 (kapsamdaki bütün gruplara)
     ?step=preview             önizleme penceresini açar (değer yoksa sensör → 10 sn önseçilir)
     ?step=apply               önizlemeyi açıp onaylar ve uygular (ilerleme + doğrulama)
     ?sample=1                 doğrulama bölümünde rastgele örnek noktayı seçili açar
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const esc = DCIM.ui.esc;

  const POINT = {
    sensor: { name: 'Orta Sıcaklık', unit: '°C', base: 24 },
    ups: { name: 'Çıkış Gerilimi (L1)', unit: 'V', base: 230 },
    crac: { name: 'Dönüş Sıcaklığı', unit: '°C', base: 25 },
    crac_panel: { name: 'L1 Akım', unit: 'A', base: 48 },
    panel: { name: 'L1 Akım', unit: 'A', base: 112 },
    meter: { name: 'Toplam Aktif Güç', unit: 'kW', base: 36 },
    pdu: { name: 'Faz 1 Akım', unit: 'A', base: 9 },
    pmm: { name: 'Devre Gücü', unit: 'kW', base: 4 }
  };

  function mount(el, params) {
    const B = DCIM.engBulk;
    const M = DCIM.data.bulkConfig;
    const grouped = B.groupDevices(M.devices(), B.QUERY_GROUPS);
    let scope = B.scopeFromParams(params, grouped);
    let values = {};
    let rows = [];
    let reportMenu = null;
    let sampleTimer = null;
    let sample = null;

    (params.get('value') || '').split(',').forEach(p => { const [k, v] = p.split(':'); if (k && Number(v) > 0) values[k] = Number(v); });

    el.innerHTML =
      '<div class="p-4 pb-20 space-y-3 eng-dqp">' +
        B.header('VERİ SORGULAMA PERİYODU', DCIM.ui.button({ variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', label: 'Yenile', attrs: 'data-refresh' })) +
        B.infoBox('Sorgu periyodu, cihazın sahadan ne sıklıkla okunacağıdır (<span class="font-mono">bi/@evt_per</span>). ' +
          '<strong>1</strong> kapsamı seçin (kat, grup, istenirse tek tek cihaz), <strong>2</strong> yeni periyodu girin, ' +
          '<strong>3</strong> önizlemeyi kontrol edip uygulayın: değer canlıda yazılır, XML dosyasına kaydedilir ve geri okunarak doğrulanır. ' +
          'Kısa periyot bağlantının worker\'larına daha çok yük demektir (yük ≈ blok ÷ periyot).') +
        '<div data-scope></div>' +
        '<section data-values class="' + B.SEC_CLS + '"></section>' +
        '<section data-sampler class="' + B.SEC_CLS + '"></section>' +
        '<div data-bar></div>' +
      '</div>';

    const deviceValue = d => B.distText(B.distribution(M.evt(d.key)), B.formatPeriod);
    const scopeCmp = B.scope(el.querySelector('[data-scope]'), {
      groups: B.QUERY_GROUPS, grouped, scope, valueTitle: 'Sorgu periyodu', valueFn: deviceValue,
      onChange: s => { scope = s; recompute(); }
    });

    function recompute() {
      const sel = B.selected(grouped, scope);
      rows = [];
      B.QUERY_GROUPS.forEach(g => {
        const devs = sel.filter(x => x.group.key === g.key).map(x => x.device);
        if (!devs.length) return;
        const vals = devs.flatMap(d => M.evt(d.key));
        rows.push({ group: g, devices: devs.length, blocks: vals.length, unknown: 0, dist: B.distribution(vals),
          reqPerSec: vals.reduce((a, v) => a + (v > 0 ? 1 / v : 0), 0) });
      });
      if (params.get('all')) { const v = Number(params.get('all')); rows.forEach(r => { values[r.group.key] = v; }); params.delete('all'); }
      renderValues();
      renderBar();
    }

    const total = () => rows.reduce((a, r) => a + r.reqPerSec, 0);
    const newTotal = () => rows.reduce((a, r) => a + (values[r.group.key] ? r.blocks / values[r.group.key] : r.reqPerSec), 0);
    const pending = () => rows.filter(r => values[r.group.key]);

    function renderValues() {
      const host = el.querySelector('[data-values]');
      if (reportMenu) { reportMenu.destroy(); reportMenu = null; }
      const opt = (v, cur) => '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + esc(B.formatPeriod(v)) + '</option>';
      host.innerHTML =
        '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2">' +
          B.stepTitle(2, 'Yeni sorgu periyodu') +
          '<div class="flex items-center gap-2 text-[11px]">' +
            '<span class="text-slate-500 dark:text-slate-400">Hepsine aynı:</span>' +
            '<select data-all class="py-1 px-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[2px] text-[11px]"><option value="">seçin…</option>' + B.PERIOD_OPTIONS.map(v => opt(v, null)).join('') + '</select>' +
            '<span class="text-slate-500 dark:text-slate-400 tabular-nums" title="Kapsamdaki grupların toplam sorgu yükü">Yük: <strong class="text-slate-800 dark:text-slate-100">' + B.fmt(total(), 1) + '</strong>' +
              (pending().length ? ' → <strong class="' + (newTotal() > total() ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + B.fmt(newTotal(), 1) + '</strong>' : '') + ' istek/sn</span>' +
            '<span data-report></span>' +
          '</div>' +
        '</div>' +
        '<div class="overflow-x-auto"><table class="w-full text-[11px] tabular-nums">' +
          '<thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50"><tr>' +
            '<th class="text-left font-semibold px-3 py-1.5 min-w-[160px]">Cihaz grubu</th><th class="text-right font-semibold px-2">Cihaz</th><th class="text-right font-semibold px-2">Blok</th>' +
            '<th class="text-left font-semibold px-2 min-w-[200px]">Bugünkü periyot</th><th class="text-right font-semibold px-2">Yük (ist/sn)</th>' +
            '<th class="text-left font-semibold px-2 min-w-[150px]">Yeni periyot</th><th class="text-right font-semibold px-3">Yeni yük</th>' +
          '</tr></thead><tbody>' +
          rows.map(r => {
            const v = values[r.group.key];
            const multi = r.dist.length > 1;
            return '<tr class="border-t border-slate-100 dark:border-slate-800/70' + (v ? ' bg-sky-50/70 dark:bg-sky-950/20' : '') + '">' +
              '<td class="px-3 py-2"><div class="flex items-center gap-2"><span class="w-6 h-6 shrink-0 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="' + r.group.icon + ' text-[11px]"></i></span>' +
                '<span class="font-semibold text-slate-800 dark:text-slate-100 text-xs">' + esc(r.group.label) + '</span></div></td>' +
              '<td class="px-2 text-right font-semibold">' + B.fmt(r.devices) + '</td>' +
              '<td class="px-2 text-right">' + B.fmt(r.blocks) + '</td>' +
              '<td class="px-2 py-2"><div class="flex flex-wrap gap-1">' + r.dist.map(d =>
                '<span class="px-1.5 py-px rounded-[2px] border text-[10px] font-semibold whitespace-nowrap ' + (multi ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200') + '">' +
                (d.value === null ? 'tanımsız' : B.formatPeriod(d.value)) + ' × ' + B.fmt(d.count) + '</span>').join('') + '</div></td>' +
              '<td class="px-2 text-right">' + B.fmt(r.reqPerSec, 2) + '</td>' +
              '<td class="px-2 py-2"><select data-val="' + r.group.key + '" class="w-full py-1 px-2 bg-white dark:bg-slate-900 border rounded-[2px] text-[11px] font-semibold ' + (v ? 'border-sky-500 text-sky-700 dark:text-sky-300' : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300') + '">' +
                '<option value="">değiştirme</option>' + B.PERIOD_OPTIONS.map(x => opt(x, v)).join('') + '</select></td>' +
              '<td class="px-3 text-right whitespace-nowrap">' + (v ? '<span class="font-semibold ' + (r.blocks / v > r.reqPerSec ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + B.fmt(r.blocks / v, 2) + '</span>' : '<span class="text-slate-400">—</span>') + '</td>' +
            '</tr>';
          }).join('') +
          (!rows.length ? '<tr><td colspan="7" class="px-3 py-4 text-center text-slate-400">Kapsamda cihaz yok.</td></tr>' : '') +
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
        title: 'Veri Sorgulama Periyodu Raporu',
        subtitle: 'Cihaz grupları · Mühendislik · ' + B.fmt(devices) + ' cihaz · sorgu periyodu (bi/@evt_per)',
        filename: 'Veri_Sorgulama_Periyodu',
        kpis: [{ label: 'Grup', value: rows.length }, { label: 'Cihaz', value: devices }, { label: 'Yük (istek/sn)', value: B.fmt(total(), 1) }]
          .concat(pending().length ? [{ label: 'Yeni yük (istek/sn)', value: B.fmt(newTotal(), 1), tone: 'info' }] : []),
        sections: [{
          title: 'Cihaz grupları',
          columns: [{ key: 'g', label: 'Cihaz grubu' }, { key: 'd', label: 'Cihaz', align: 'right' }, { key: 'b', label: 'Blok', align: 'right' },
            { key: 'p', label: 'Bugünkü periyot' }, { key: 'y', label: 'Yük (ist/sn)', align: 'right' }, { key: 'n', label: 'Yeni periyot' }, { key: 'ny', label: 'Yeni yük', align: 'right' }, { key: 'tone', label: '' }],
          toneKey: 'tone',
          rows: list.map(r => ({ g: r.group.label, d: r.devices, b: r.blocks, p: r.dist.map(d => B.formatPeriod(d.value) + ' × ' + B.fmt(d.count)).join(', '),
            y: B.fmt(r.reqPerSec, 2), n: values[r.group.key] ? B.formatPeriod(values[r.group.key]) : '', ny: values[r.group.key] ? B.fmt(r.blocks / values[r.group.key], 2) : '',
            tone: r.dist.length > 1 ? 'warning' : '' }))
        }],
        notes: ['Yük ≈ blok ÷ periyot (istek/sn). "Yeni periyot" henüz uygulanmamış seçimi gösterir.']
      }, req.format);
    }

    function renderBar() {
      const p = pending();
      B.pendingBar(el.querySelector('[data-bar]'), {
        count: p.length, devices: p.reduce((a, r) => a + r.devices, 0), unit: 'grupta',
        onClear: () => { values = {}; recompute(); },
        onPreview: () => preview(false)
      });
    }

    function preview(autoRun) {
      const targets = B.resolveTargets(grouped, scope);
      const before = t => B.distText(B.distribution(t.devices.flatMap(x => M.evt(x.key))), B.formatPeriod);
      const ops = B.buildQueryOps(targets, values, before);
      const warnings = [];
      targets.forEach(t => {
        if (!values[t.group.key]) return;
        const d = B.distribution(t.devices.flatMap(x => M.evt(x.key)));
        if (d.length > 1) warnings.push(t.doc + ' · ' + t.group.key + ': bloklar bugün farklı periyotlarda (' + B.distText(d, B.formatPeriod) + '); hepsi aynı değere çekilecek.');
      });
      B.plan({
        title: 'Sorgu periyodu — önizleme', ops, warnings, autoRun,
        onClosed: applied => { if (applied) values = {}; recompute(); scopeCmp.update({}); }
      });
    }

    // ---- 3 · Doğrulama: örnek nokta (app-period-sampler)
    const median = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const timeText = iso => new Date(iso).toLocaleTimeString('tr-TR', { hour12: false });
    const secText = s => s === null || s === undefined ? '—' : (Math.round(s * 10) / 10).toLocaleString('tr-TR') + ' sn';

    function pickSample() {
      const sel = B.selected(grouped, scope).filter(x => x.device.state === 'online')
        .filter(x => B.distribution(M.evt(x.device.key)).length === 1);
      if (!sel.length) { sample = null; renderSampler('Kapsamda haberleşmesi sağlıklı ve blokları tek periyotta olan cihaz yok.'); return; }
      const x = sel[Math.floor(Math.random() * sel.length)];
      const pt = POINT[x.device.deviceType] || POINT.sensor;
      const period = M.evt(x.device.key)[0];
      const prev = M.sampleSeries(x.device.id, period, 8).map(r => Object.assign(r, { val: (pt.base + (Number(r.val) - 24)).toFixed(1).replace('.', ',') }));
      sample = { dev: x.device.id, devDesc: x.device.description, point: x.device.id + '_' + pt.name.toUpperCase().replace(/\W+/g, '_'), pointDesc: pt.name,
        unit: pt.unit, periodSec: period, rows: prev.reverse(), base: pt.base, last: Date.now() };
      startSampler();
      renderSampler();
    }

    function startSampler() {
      clearInterval(sampleTimer);
      if (!sample || sample.periodSec > 60) return;
      sampleTimer = setInterval(() => {
        if (!sample) return;
        const now = Date.now();
        const gap = (now - sample.last) / 1000;
        if (gap + 0.05 < sample.periodSec) return;
        sample.last = now;
        const prevVal = sample.rows.length ? Number(String(sample.rows[0].val).replace(',', '.')) : sample.base;
        const val = (prevVal + (Math.random() - 0.5) * 0.4).toFixed(1).replace('.', ',');
        sample.rows.unshift({ t: new Date(now).toISOString(), val, gapSec: gap });
        if (sample.rows.length > 120) sample.rows.pop();
        renderSampler();
      }, 250);
    }

    function renderSampler(note) {
      const host = el.querySelector('[data-sampler]');
      const gaps = sample ? sample.rows.map(r => r.gapSec).filter(g => g !== null && g !== undefined) : [];
      const med = median(gaps);
      host.innerHTML =
        '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2">' +
          B.stepTitle(3, 'Doğrulama: örnek nokta' + (sample && sample.periodSec <= 60 ? ' <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>canlı</span>' : ''), 'emerald') +
          '<div class="flex items-center gap-2 text-[11px]">' +
            '<button type="button" data-pick class="px-2.5 py-1 rounded-[2px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold cursor-pointer inline-flex items-center gap-1.5"><i class="pi pi-replay text-[10px]"></i>' + (sample ? 'Başka nokta seç' : 'Rastgele nokta seç') + '</button>' +
            (sample ? '<button type="button" data-clear-rows class="px-2 py-1 rounded-[2px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer">Listeyi temizle</button>' : '') +
          '</div>' +
        '</div>' +
        (note ? '<div class="px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">' + esc(note) + '</div>' : '') +
        (!sample && !note ? '<div class="px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">Kapsamdan haberleşmesi sağlıklı bir cihaz ve onun bir noktası rastgele seçilir. Cihaz her okunduğunda saat, değer ve bir önceki okumadan geçen süre aşağıya yazılır.</div>' : '') +
        (sample ?
          '<div class="px-3 py-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] border-b border-slate-100 dark:border-slate-800/70">' +
            '<div><div class="text-[10px] uppercase tracking-wide text-slate-400">Cihaz</div><div class="font-semibold text-slate-800 dark:text-slate-100 truncate" title="' + esc(sample.dev) + '">' + esc(sample.devDesc) + '</div></div>' +
            '<div><div class="text-[10px] uppercase tracking-wide text-slate-400">Nokta</div><div class="font-semibold text-slate-800 dark:text-slate-100 truncate" title="' + esc(sample.point) + '">' + esc(sample.pointDesc) + '</div></div>' +
            '<div><div class="text-[10px] uppercase tracking-wide text-slate-400">Sorgu periyodu</div><div class="font-semibold text-slate-800 dark:text-slate-100">' + B.formatPeriod(sample.periodSec) + '</div></div>' +
            '<div><div class="text-[10px] uppercase tracking-wide text-slate-400">Ölçülen aralık (medyan)</div><div class="font-semibold tabular-nums ' + (med === null ? 'text-slate-400' : 'text-emerald-600 dark:text-emerald-400') + '">' + secText(med) + '<span class="text-slate-400 font-normal"> · ' + gaps.length + ' aralık</span></div></div>' +
          '</div>' +
          '<div class="max-h-72 overflow-y-auto"><table class="w-full text-[11px] tabular-nums">' +
            '<thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 sticky top-0"><tr><th class="text-left font-semibold px-3 py-1.5">Okuma saati</th><th class="text-right font-semibold px-2">Değer</th><th class="text-right font-semibold px-3">Önceki ile arası</th></tr></thead><tbody>' +
            sample.rows.map(r => '<tr class="border-t border-slate-100 dark:border-slate-800/70"><td class="px-3 py-1 font-mono">' + timeText(r.t) + '</td><td class="px-2 text-right font-mono">' + esc(r.val) + ' <span class="text-slate-400">' + esc(sample.unit) + '</span></td><td class="px-3 text-right font-mono">' + secText(r.gapSec) + '</td></tr>').join('') +
            (!sample.rows.length ? '<tr><td colspan="3" class="px-3 py-3 text-center text-slate-400">İlk okuma bekleniyor…</td></tr>' : '') +
          '</tbody></table></div>' : '');
    }

    el.addEventListener('change', e => {
      const t = e.target;
      if (t.hasAttribute('data-val')) { const v = Number(t.value); values[t.getAttribute('data-val')] = v > 0 ? v : undefined; recompute(); }
      else if (t.hasAttribute('data-all')) { const v = Number(t.value); rows.forEach(r => { values[r.group.key] = v > 0 ? v : undefined; }); recompute(); }
    });
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-refresh')) { recompute(); scopeCmp.update({}); DCIM.ui.toast('Bugünkü değerler yeniden okundu.', 'info'); }
      else if (b.hasAttribute('data-pick')) pickSample();
      else if (b.hasAttribute('data-clear-rows') && sample) { sample.rows = []; sample.last = Date.now(); renderSampler(); }
    });

    recompute();
    renderSampler();
    if (params.get('sample') === '1') pickSample();
    const step = params.get('step');
    if (step === 'preview' || step === 'apply') {
      if (!pending().length) {
        const r = rows.find(x => x.group.key === 'sensor') || rows[0];
        if (r) values[r.group.key] = 10;
        recompute();
      }
      setTimeout(() => preview(step === 'apply'), 50);
    }

    return {
      destroy() {
        clearInterval(sampleTimer);
        if (reportMenu) reportMenu.destroy();
        document.querySelectorAll('body > .fixed.inset-0.z-50').forEach(n => n.remove());
      }
    };
  }

  DCIM.engRegistry['data-query-period'] = { mount };
})();
