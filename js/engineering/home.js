/* ==========================================================================
   DCIM Sunum — Mühendislik ana sayfası (EngineeringHomeComponent)
   Kaynak: new-ui/pages/engineering/engineering-home/engineering-home.component.ts (4 Kas 2026)
   Navbardaki "Mühendislik" ve kenar çubuğu başlığı buraya açılır (#home; boş hash de buraya düşer).
   Canlı durum (AyxdbHealthService 'engineer' akışı) yerine DCIM.data.engSystem (js/mock/eng-home.data.js):
   5 sn'de bir yeni örnek (tick) alınır; worker yükleri / gecikmeler tohumlu olarak dalgalanır.
   Bölümler: 8 KPI · Cihaz haberleşme durumu (yığılmış çubuk) · Katlar ve dokümanlar tablosu (CMR/T00, T01, T02,
   T03, T09=DCB) · Dikkat gerektirenler + haberleşmeyen/kritik cihazlar · Mühendislik araçları (kenar çubuğuyla
   aynı liste, DCIM.eng.nav).
   Derin bağlantılar: engineering.html#home, #home?live=0 (canlı yenilemeyi durdurur)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const esc = DCIM.ui.esc;

  const STATUS_ORDER = [
    { status: 'online', label: 'Haberleşiyor', cls: 'bg-emerald-500' },
    { status: 'warning', label: 'Uyarı', cls: 'bg-amber-500' },
    { status: 'critical', label: 'Kritik', cls: 'bg-rose-500' },
    { status: 'offline', label: 'Haberleşme yok', cls: 'bg-slate-600 dark:bg-slate-400' },
    { status: 'disabled', label: 'Devre dışı', cls: 'bg-slate-300 dark:bg-slate-600' },
    { status: 'unknown', label: 'Bilinmiyor', cls: 'bg-slate-200 dark:bg-slate-700' }
  ];
  const PERF_RANK = { kirilma: 5, bozulma: 4, gecici: 3, saglikli: 2, toplu: 1, bilinmiyor: 0 };

  const fmt = (n, digits) => (n === null || n === undefined || !isFinite(n)) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: digits || 0 });
  const pad = n => String(n).padStart(2, '0');
  const hms = d => pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());

  function perfDot(l) {
    if (l === 'kirilma') return 'bg-rose-500';
    if (l === 'bozulma') return 'bg-amber-500';
    if (l === 'gecici') return 'bg-sky-500';
    if (l === 'saglikli') return 'bg-emerald-500';
    return 'bg-slate-400';
  }
  function sevIcon(s) {
    if (s === 'critical') return 'pi-times-circle text-rose-500';
    if (s === 'warning') return 'pi-exclamation-triangle text-amber-500';
    if (s === 'info') return 'pi-info-circle text-sky-500';
    if (s === 'healthy') return 'pi-check-circle text-emerald-500';
    return 'pi-question-circle text-slate-400';
  }
  function segs(devs) {
    const n = devs.length || 1;
    return STATUS_ORDER.map(o => {
      const count = devs.filter(d => d.status === o.status).length;
      return Object.assign({}, o, { count, pct: count / n * 100 });
    });
  }

  function compute(tick) {
    const sys = DCIM.data.engSystem;
    const s = sys.snapshot(tick);
    const perf = sys.perf(tick);
    const devices = s.devices, nodes = s.runtimeNodes, sum = s.summary;
    const perfByDoc = {};
    perf.nodes.forEach(v => {
      const prev = perfByDoc[v.node.document];
      if (!prev || PERF_RANK[v.level] > PERF_RANK[prev]) perfByDoc[v.node.document] = v.level;
    });
    const docRows = sys.docs.map(def => {
      const devs = devices.filter(d => d.document === def.doc);
      const docNodes = nodes.filter(n => n.document === def.doc);
      const sg = segs(devs);
      const cnt = st => (sg.find(x => x.status === st) || {}).count || 0;
      const loads = docNodes.map(n => n.workerLoad != null ? n.workerLoad : n.threadLoad).filter(x => x != null && isFinite(x));
      return {
        doc: def.doc, floors: def.floors, devices: devs.length, segs: sg,
        problem: cnt('offline') + cnt('critical') + cnt('warning'),
        connections: docNodes.filter(n => n.kind === 'connection').length,
        threads: docNodes.length,
        workers: docNodes.reduce((a, n) => a + (n.workerCount || 0), 0),
        maxLoad: loads.length ? Math.max.apply(null, loads) : null,
        sesUsed: docNodes.reduce((a, n) => a + (n.sessionCount || 0), 0),
        sesCap: docNodes.reduce((a, n) => a + (n.sessionCapacity || 0), 0),
        perf: perfByDoc[def.doc] || null
      };
    });
    const problems = devices.filter(d => d.status === 'offline' || d.status === 'critical');
    const total = sum.deviceTotal, online = sum.deviceOnline, active = total - sum.deviceDisabled;
    const workers = nodes.reduce((a, n) => a + (n.workerCount || 0), 0);
    const pc = perf.counts, perfBad = pc.kirilma + pc.bozulma;
    const floorCount = new Set(sys.docs.map(d => d.floors)).size;
    const kpis = [
      { key: 'floor', label: 'Kat', icon: 'pi-building', value: fmt(floorCount), sub: docRows.length + ' CMR dokümanı', tip: 'SITE_Floors içindeki açık katlar' },
      { key: 'dev', label: 'Cihaz', icon: 'pi-server', value: fmt(total), sub: sum.deviceDisabled ? fmt(sum.deviceDisabled) + ' devre dışı' : 'CMR dokümanlarında', tip: 'Canlı cihaz listesi (CMR/*)' },
      { key: 'online', label: 'Haberleşen', icon: 'pi-wifi', value: '%' + fmt(active ? online / active * 100 : 0, 1), sub: fmt(online) + ' / ' + fmt(active) + ' etkin cihaz', tip: 'Haberleşen cihazların etkin cihazlara oranı' },
      { key: 'off', label: 'Haberleşme yok', icon: 'pi-ban', value: fmt(sum.deviceOffline), sub: 'cevap vermeyen cihaz', subCls: sum.deviceOffline > 0 ? 'text-rose-600 dark:text-rose-400' : '', tip: 'Durumu "çalışmıyor" olan cihazlar' },
      { key: 'alm', label: 'Kritik / Uyarı', icon: 'pi-exclamation-triangle', value: fmt(sum.deviceCritical) + ' / ' + fmt(sum.deviceWarning), sub: 'cihaz durum bitleri', tip: 'Cihazın durum bitleri alarm/uyarı bildiriyor' },
      { key: 'rt', label: 'Bileşen', icon: 'pi-sitemap', value: fmt(sum.runtimeTotal), sub: fmt(sum.runtimeCritical) + ' kritik · ' + fmt(sum.runtimeWarning) + ' uyarı', subCls: sum.runtimeCritical > 0 ? 'text-rose-600 dark:text-rose-400' : '', tip: "Doküman kökleri, thread'ler ve bağlantılar" },
      { key: 'wrk', label: 'Worker', icon: 'pi-users', value: fmt(workers), sub: 'Σ thr_wrk (koşan)', tip: 'Koşan bileşenlerin worker toplamı' },
      { key: 'perf', label: 'Performans', icon: 'pi-gauge', value: fmt(perfBad), sub: 'kırılma ' + pc.kirilma + ' · bozulma ' + pc.bozulma, subCls: perfBad ? 'text-amber-600 dark:text-amber-400' : '', tip: 'Performans eşiğini aşan bileşen sayısı (Sistem Sağlığı ile aynı kural)' }
    ];
    return {
      s, kpis, docRows, siteSegs: segs(devices),
      issues: s.issueGroups.filter(g => g.severity !== 'healthy'),
      problemDevices: problems.slice(0, 50), problemTotal: problems.length
    };
  }

  // ---- çizim
  const CARD = 'bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px]';

  function kpisHtml(v) {
    return v.kpis.map(k =>
      '<div class="p-2.5 ' + CARD + ' min-w-0" title="' + esc(k.tip) + '">' +
        '<div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">' +
          '<span class="truncate">' + esc(k.label) + '</span><i class="pi ' + k.icon + ' text-[11px]"></i></div>' +
        '<div class="text-xl font-bold font-mono eng-tnum leading-tight mt-1 text-slate-900 dark:text-white">' + esc(k.value) + '</div>' +
        '<div class="text-[10px] truncate ' + (k.subCls || 'text-slate-500 dark:text-slate-400') + '">' + esc(k.sub) + '</div>' +
      '</div>').join('');
  }

  function siteHtml(v) {
    return '<div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">' +
        '<h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-server text-sky-600 dark:text-sky-400"></i>Cihaz haberleşme durumu</h2>' +
        '<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-600 dark:text-slate-300">' +
          v.siteSegs.map(s => '<span class="inline-flex items-center gap-1 eng-tnum"><span class="w-2 h-2 rounded-[1px] ' + s.cls + '"></span>' + esc(s.label) + ' <strong class="text-slate-900 dark:text-white">' + fmt(s.count) + '</strong></span>').join('') +
        '</div>' +
      '</div>' +
      '<div class="flex h-3 w-full gap-[2px] rounded-[2px] overflow-hidden bg-slate-100 dark:bg-slate-800">' +
        v.siteSegs.filter(s => s.count).map(s => '<div class="h-full ' + s.cls + '" style="width:' + s.pct.toFixed(3) + '%" title="' + esc(s.label + ': ' + fmt(s.count) + ' (%' + fmt(s.pct, 1) + ')') + '"></div>').join('') +
      '</div>';
  }

  function docRowsHtml(v) {
    const perfLabel = DCIM.data.engSystem.perfLabel;
    return v.docRows.map(r =>
      '<tr class="border-t border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-900/40">' +
        '<td class="px-3 py-1.5 font-mono font-bold text-sky-700 dark:text-sky-400 whitespace-nowrap">' + esc(r.doc) + '</td>' +
        '<td class="px-2 text-slate-600 dark:text-slate-300 whitespace-nowrap">' + esc(r.floors || '—') + '</td>' +
        '<td class="px-2 text-right font-semibold">' + fmt(r.devices) + '</td>' +
        '<td class="px-2"><div class="flex h-2 w-full gap-px rounded-[1px] overflow-hidden bg-slate-100 dark:bg-slate-800">' +
          r.segs.filter(s => s.count).map(s => '<div class="h-full ' + s.cls + '" style="width:' + s.pct.toFixed(3) + '%" title="' + esc(s.label + ': ' + s.count) + '"></div>').join('') +
        '</div></td>' +
        '<td class="px-2 text-right ' + (r.problem ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-400') + '">' + fmt(r.problem) + '</td>' +
        '<td class="px-2 text-right">' + r.connections + '</td>' +
        '<td class="px-2 text-right">' + r.threads + '</td>' +
        '<td class="px-2 text-right">' + r.workers + '</td>' +
        '<td class="px-2 text-right ' + ((r.maxLoad || 0) >= 80 ? 'text-amber-600 dark:text-amber-400 font-semibold' : '') + '">' + (r.maxLoad === null ? '—' : fmt(r.maxLoad) + '%') + '</td>' +
        '<td class="px-2 text-right whitespace-nowrap">' + (r.sesCap ? fmt(r.sesUsed) + '/' + fmt(r.sesCap) : '—') + '</td>' +
        '<td class="px-2 whitespace-nowrap">' + (r.perf ? '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ' + perfDot(r.perf) + '"></span>' + esc(perfLabel(r.perf)) + '</span>' : '<span class="text-slate-400">—</span>') + '</td>' +
        '<td class="px-3 text-right whitespace-nowrap"><a href="#xml-editor?doc=' + encodeURIComponent(r.doc) + '" class="text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:underline" title="Konfigürasyon editöründe aç">Konfigürasyon</a></td>' +
      '</tr>').join('');
  }

  function issuesHtml(v) {
    return (v.issues.length ? v.issues.map(g =>
      '<div class="px-3 py-1.5 text-[11px]">' +
        '<div class="flex items-center gap-2"><i class="pi ' + sevIcon(g.severity) + ' text-[10px]"></i>' +
          '<span class="font-semibold truncate">' + esc(g.title) + '</span><span class="ml-auto font-bold eng-tnum">' + fmt(g.count) + '</span></div>' +
        '<p class="text-[10.5px] text-slate-500 dark:text-slate-400 pl-4 leading-snug">' + esc(g.action || g.detail || '') + '</p>' +
      '</div>').join('')
      : '<div class="px-3 py-4 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><i class="pi pi-check-circle"></i>Bulgu yok.</div>');
  }

  function problemsHtml(v) {
    if (!v.problemDevices.length) return '';
    return '<div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between">' +
        '<span>Haberleşmeyen / kritik cihazlar</span><span class="eng-tnum">' + fmt(v.problemTotal) + '</span></div>' +
      '<div class="max-h-[200px] overflow-y-auto custom-scrollbar pb-1">' +
        v.problemDevices.map(d =>
          '<a href="#xml-editor?doc=' + encodeURIComponent(d.document) + '&dev=' + encodeURIComponent(d.id) + '" class="flex items-center gap-2 px-3 py-1 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-900/40" title="' + esc((d.description || d.id) + ' · konfigürasyonda aç') + '">' +
            '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + (d.status === 'offline' ? 'bg-slate-600 dark:bg-slate-400' : 'bg-rose-500') + '"></span>' +
            '<span class="font-mono truncate">' + esc(d.id) + '</span>' +
            '<span class="text-slate-400 truncate">' + esc(d.host) + '</span>' +
            '<span class="ml-auto font-mono text-[10px] text-slate-500 shrink-0">' + esc(d.document) + '</span>' +
          '</a>').join('') +
      '</div>';
  }

  function toolsHtml() {
    const groups = (DCIM.eng && DCIM.eng.nav) || DCIM.engNav || [];
    return groups.map(g =>
      '<div class="' + CARD + ' p-2.5 min-w-0">' +
        '<div class="flex items-center gap-1.5 px-1 pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-800/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">' +
          '<i class="' + g.icon + ' text-[11px]"></i><span class="truncate">' + esc(g.title) + '</span></div>' +
        g.items.map(it =>
          '<a href="#' + it.key + '" class="group flex items-start gap-2 px-1.5 py-1.5 rounded-[2px] hover:bg-sky-50 dark:hover:bg-sky-950/30">' +
            '<span class="w-6 h-6 shrink-0 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="' + it.icon + ' text-[11px]"></i></span>' +
            '<span class="min-w-0">' +
              '<span class="block text-[11.5px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300 truncate">' + esc(it.label) + '</span>' +
              '<span class="block text-[10.5px] text-slate-500 dark:text-slate-400 leading-snug">' + esc(it.desc) + '</span>' +
            '</span>' +
          '</a>').join('') +
      '</div>').join('');
  }

  DCIM.engRegistry['home'] = {
    mount(el, params) {
      const live = params.get('live') !== '0';
      let tick = 0;
      el.innerHTML =
        '<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-3">' +
          DCIM.kit.pageHeader({
            title: 'Mühendislik',
            breadcrumbs: [{ label: 'Mühendislik' }],
            actions:
              '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] border text-[10px] font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" data-h-source>' +
                '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500' + (live ? ' animate-pulse' : '') + '"></span>' + (live ? 'Canlı' : 'Duraklatıldı') + '</span>' +
              '<span class="text-[10px] text-slate-500 dark:text-slate-400 eng-tnum" data-h-time></span>' +
              '<button type="button" data-h-refresh class="px-2.5 py-1 text-[11px] font-semibold bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-[2px] flex items-center gap-1.5 cursor-pointer"><i class="pi pi-refresh text-[10px]"></i>Yenile</button>' +
              '<a href="#ayxdb-diagnostics" class="px-2.5 py-1 text-[11px] font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-[2px] flex items-center gap-1.5"><i class="pi pi-chart-line text-[10px]"></i>Tanılama</a>'
          }) +
          '<section class="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2" data-h-kpis></section>' +
          '<section class="' + CARD + ' px-3 py-2.5" data-h-site></section>' +
          '<section class="grid grid-cols-1 2xl:grid-cols-3 gap-3">' +
            '<div class="2xl:col-span-2 ' + CARD + ' min-w-0">' +
              '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between">' +
                '<h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-building text-indigo-600 dark:text-indigo-400"></i>Katlar ve dokümanlar</h2>' +
                '<span class="text-[10px] text-slate-500 dark:text-slate-400">' + (live ? "Canlı · 5 sn'de bir" : 'Duraklatıldı') + '</span>' +
              '</div>' +
              '<div class="overflow-x-auto custom-scrollbar">' +
                '<table class="w-full text-[11px] eng-tnum">' +
                  '<thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50"><tr>' +
                    '<th class="text-left font-semibold px-3 py-1.5">Doküman</th>' +
                    '<th class="text-left font-semibold px-2">Kat</th>' +
                    '<th class="text-right font-semibold px-2">Cihaz</th>' +
                    '<th class="text-left font-semibold px-2 min-w-[160px]">Durum</th>' +
                    '<th class="text-right font-semibold px-2" title="Haberleşme yok + kritik + uyarı">Sorunlu</th>' +
                    '<th class="text-right font-semibold px-2">Bağlantı</th>' +
                    '<th class="text-right font-semibold px-2" title="Doküman kökü, thread ve bağlantı bileşenleri">Thread</th>' +
                    '<th class="text-right font-semibold px-2" title="Σ thr_wrk">Worker</th>' +
                    '<th class="text-right font-semibold px-2" title="En yüklü bileşenin worker (yoksa thread) yükü">En yüksek yük</th>' +
                    '<th class="text-right font-semibold px-2" title="Bağlı oturum / kurulu (con_ses)">Oturum</th>' +
                    '<th class="text-left font-semibold px-2">Performans</th>' +
                    '<th class="px-3"></th>' +
                  '</tr></thead>' +
                  '<tbody data-h-docs></tbody>' +
                '</table>' +
              '</div>' +
            '</div>' +
            '<div class="' + CARD + ' min-w-0 flex flex-col">' +
              '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between">' +
                '<h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-exclamation-triangle text-amber-500"></i>Dikkat gerektirenler</h2>' +
                '<span class="text-[10px] text-slate-500 dark:text-slate-400 eng-tnum" data-h-issue-count></span>' +
              '</div>' +
              '<div class="divide-y divide-slate-100 dark:divide-slate-800/70 overflow-y-auto custom-scrollbar max-h-[340px]" data-h-issues></div>' +
              '<div class="border-t border-slate-200 dark:border-border-subtle" data-h-problems></div>' +
            '</div>' +
          '</section>' +
          '<section>' +
            '<h2 class="text-xs font-bold flex items-center gap-2 mb-2 px-0.5"><i class="pi pi-th-large text-slate-400"></i>Mühendislik araçları</h2>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">' + toolsHtml() + '</div>' +
          '</section>' +
        '</div>';

      const $ = sel => el.querySelector(sel);
      function render() {
        const v = compute(tick);
        $('[data-h-time]').textContent = 'Son örnek ' + hms(v.s.sampledAt);
        $('[data-h-kpis]').innerHTML = kpisHtml(v);
        $('[data-h-site]').innerHTML = siteHtml(v);
        $('[data-h-docs]').innerHTML = docRowsHtml(v);
        $('[data-h-issue-count]').textContent = v.issues.length + ' bulgu';
        $('[data-h-issues]').innerHTML = issuesHtml(v);
        $('[data-h-problems]').innerHTML = problemsHtml(v);
      }
      render();
      $('[data-h-refresh]').addEventListener('click', () => { tick++; render(); });
      const timer = live ? setInterval(() => { tick++; render(); }, 5000) : null;
      return { destroy() { if (timer) clearInterval(timer); } };
    }
  };
})();
