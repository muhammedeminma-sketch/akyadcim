/* ==========================================================================
   DCIM Sunum — Konfigürasyon Editörü (NewUICMPXmlEditorComponent → ConfigHomeComponent)
   Kaynak: new-ui/pages/engineering/xml-editor/xml-editor.component.ts,
           components/config-home/config-home.component.ts (ana sayfa), models/config-scan.ts (tarama + kontroller)
   Editör önce bütün dokümanların özetiyle açılır: KPI kutuları, Dokümanlar tablosu, "Bağlantılar, oturumlar ve sorgu
   yükü", "Thread ve worker haritası", dağılım kartları ve "Tutarlılık kontrolleri" (Hata / Uyarı / Bilgi süzgeci;
   örneğe tıklayınca doküman/cihaz açılır). Üstteki çiplerle kapsam "Tüm site" ya da tek doküman.
   Doküman görünümü (sunumda SALT OKUNUR basit görünüm; orijinaldeki tam editör — blok/nokta/sınıf düzenleme,
   doğrulama, sürüm geçmişi — kapsam dışı): solda bağlantı → cihaz ağacı (arama), sağda doküman özeti ya da seçili
   cihazın öznitelikleri, sorgu blokları ve noktaları.
   Veri: DCIM.data.configScan (js/mock/eng-xml-editor.data.js) — engSystem + bulkConfig ile tutarlı, kurgusal.

   Derin bağlantılar (engineering.html#xml-editor?...):
     ?scope=CMR/T01                  ana sayfada kapsam tek doküman
     ?levels=error,warning,info      kontrol süzgeci (varsayılan error,warning)   ?issue=dly_zero  bulguyu açık getirir
     ?doc=CMR/T01                    doküman görünümü     ?doc=CMR/T01&dev=K1NA06_PDU_B_DV  cihaz seçili
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const esc = DCIM.ui.esc;

  const fmt = (n, d) => (n === null || n === undefined || !Number.isFinite(n)) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: d || 0 });
  const mb = b => b >= 1048576 ? fmt(b / 1048576, 1) + ' MB' : fmt(b / 1024, 0) + ' KB';
  const pctOf = (v, max) => max > 0 ? (v / max) * 100 : 0;
  function ago(s) {
    const t = new Date(s).getTime();
    if (!Number.isFinite(t)) return '—';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'az önce';
    if (m < 60) return m + ' dk önce';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' sa önce';
    const d = Math.round(h / 24);
    return d < 30 ? d + ' gün önce' : new Date(t).toLocaleDateString('tr-TR');
  }
  const ranked = (map, top) => Object.keys(map).map(k => ({ key: k, value: map[k] })).sort((a, b) => b.value - a.value).slice(0, top || 99);
  const merge = maps => { const o = {}; maps.forEach(m => Object.keys(m).forEach(k => { o[k] = (o[k] || 0) + m[k]; })); return o; };
  const LEVEL = {
    error: { icon: 'pi-times-circle text-rose-500', text: 'text-rose-600 dark:text-rose-400', label: 'HATA', chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300', name: 'Hata' },
    warning: { icon: 'pi-exclamation-triangle text-amber-500', text: 'text-amber-600 dark:text-amber-400', label: 'UYARI', chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300', name: 'Uyarı' },
    info: { icon: 'pi-info-circle text-sky-500', text: 'text-sky-600 dark:text-sky-400', label: 'BİLGİ', chip: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300', name: 'Bilgi' }
  };
  const CARD = 'bg-white dark:bg-[#0e1726] border border-slate-200 dark:border-slate-800 rounded-[2px]';
  const TH = 'text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50';
  const STATUS_DOT = { online: 'bg-emerald-500', warning: 'bg-amber-500', critical: 'bg-rose-500', offline: 'bg-slate-600 dark:bg-slate-400', disabled: 'bg-slate-300 dark:bg-slate-600' };
  const STATUS_LABEL = { online: 'Haberleşiyor', warning: 'Uyarı', critical: 'Kritik', offline: 'Haberleşme yok', disabled: 'Devre dışı' };

  function mount(el, params) {
    const S = DCIM.data.configScan;
    el.classList.add('eng-xml');
    return params.get('doc') ? mountDoc(el, params, S) : mountHome(el, params, S);
  }

  // =============================================================================================
  // Ana sayfa (config-home)
  function mountHome(el, params, S) {
    const st = {
      scope: params.get('scope') || 'ALL',
      levels: { error: true, warning: true, info: false },
      expanded: new Set(params.get('issue') ? [params.get('issue')] : []),
      scanning: false, scanned: 0, finishedAt: new Date(), totalMs: 820
    };
    if (params.get('levels')) { const l = params.get('levels').split(','); Object.keys(st.levels).forEach(k => { st.levels[k] = l.includes(k); }); }
    let menu = null;
    const all = S.docs();
    if (st.scope !== 'ALL' && !all.some(d => d.id === st.scope)) st.scope = 'ALL';

    function render() {
      if (menu) { menu.destroy(); menu = null; }
      const docs = st.scope === 'ALL' ? all : all.filter(d => d.id === st.scope);
      const T = {
        docs: docs.length, bytes: docs.reduce((a, d) => a + d.bytes, 0),
        dev: docs.reduce((a, d) => a + d.counts.dev, 0), devDisabled: docs.reduce((a, d) => a + d.counts.devDisabled, 0),
        hosts: docs.reduce((a, d) => a + d.hosts, 0), bi: docs.reduce((a, d) => a + d.counts.bi, 0), biDisabled: docs.reduce((a, d) => a + d.counts.biDisabled, 0),
        io: docs.reduce((a, d) => a + d.counts.io, 0), con: docs.reduce((a, d) => a + d.counts.con, 0), thr: docs.reduce((a, d) => a + d.counts.thr, 0),
        threads: docs.reduce((a, d) => a + d.threads.length, 0), workers: docs.reduce((a, d) => a + d.workers, 0), reqPerSec: docs.reduce((a, d) => a + d.reqPerSec, 0),
        ioHistory: docs.reduce((a, d) => a + d.ioHistory, 0), ioAlarm: docs.reduce((a, d) => a + d.ioAlarm, 0),
        tio: docs.reduce((a, d) => a + d.counts.tio, 0), tioUnused: docs.reduce((a, d) => a + d.tioUnused, 0),
        list: docs.reduce((a, d) => a + d.counts.list, 0), item: docs.reduce((a, d) => a + d.counts.item, 0)
      };
      const issues = docs.flatMap(d => d.issues);
      const lvlSum = l => issues.filter(i => i.level === l).reduce((a, i) => a + i.count, 0);
      T.errors = lvlSum('error'); T.warnings = lvlSum('warning'); T.infos = lvlSum('info');
      const cons = docs.flatMap(d => d.cons.map(c => ({ doc: d.id, c, perWrk: c.thrWrk ? c.reqPerSec / c.thrWrk : 0,
        occ: c.thrWrk && c.worstReqSec && c.reqPerSec ? (c.reqPerSec * c.worstReqSec * 100) / c.thrWrk : null,
        sesPct: c.ses > 0 ? (c.devices / c.ses) * 100 : null })))
        .sort((a, b) => b.c.reqPerSec - a.c.reqPerSec || b.c.devices - a.c.devices);
      const thrs = docs.flatMap(d => d.threads.map(t => ({ doc: d.id, t })));
      const conSes = docs.flatMap(d => d.cons).filter(c => c.ses > 0);
      const sesDev = conSes.reduce((a, c) => a + c.devices, 0), sesCap = conSes.reduce((a, c) => a + c.ses, 0);
      const maps = k => merge(docs.map(d => d.maps[k]));
      const devProto = maps('devProtocols');
      const conProto = {};
      docs.flatMap(d => d.cons).forEach(c => { conProto[c.protocol] = (conProto[c.protocol] || 0) + 1; });
      const issueSub = T.errors ? fmt(T.errors) + ' hata · ' + fmt(T.warnings) + ' uyarı' : T.warnings ? fmt(T.warnings) + ' uyarı' : 'hata/uyarı yok';
      const kpis = [
        { label: 'Doküman', icon: 'pi-folder', value: fmt(T.docs), sub: mb(T.bytes) + ' XML', tip: 'Taranan doküman ve toplam dosya boyutu' },
        { label: 'Cihaz', icon: 'pi-server', value: fmt(T.dev), sub: T.devDisabled ? fmt(T.devDisabled) + ' devre dışı · ' + fmt(T.hosts) + ' IP' : fmt(T.hosts) + ' farklı IP', tip: ranked(devProto).map(x => x.key + ' ' + fmt(x.value)).join(' · ') },
        { label: 'Sorgu bloğu', icon: 'pi-box', value: fmt(T.bi), sub: T.biDisabled ? fmt(T.biDisabled) + ' devre dışı' : 'cihaz başına ' + fmt(T.dev ? T.bi / T.dev : 0, 1), tip: '<bi> elemanları' },
        { label: 'IO noktası', icon: 'pi-chart-line', value: fmt(T.io), sub: 'cihaz başına ' + fmt(T.dev ? T.io / T.dev : 0), tip: 'Blok altındaki ve hesaplanan noktalar' },
        { label: 'Bağlantı', icon: 'pi-sitemap', value: fmt(T.con), sub: ranked(conProto).map(x => x.key + ' ' + x.value).join(' · '), tip: 'Protokole göre <con> sayısı' },
        { label: 'Thread', icon: 'pi-microchip', value: fmt(T.threads), sub: T.docs + ' kök · ' + cons.length + ' bağlantı · ' + T.thr + ' <thr>', tip: 'Doküman kökü, her <con> ve her <thr> birer thread\'dir' },
        { label: 'Worker', icon: 'pi-users', value: fmt(T.workers), sub: 'Σ thr_wrk', tip: 'Bütün thread\'lerin worker havuzu toplamı' },
        { label: 'Oturum', icon: 'pi-link', value: fmt(sesDev) + '/' + fmt(sesCap), sub: fmt(sesCap - sesDev) + ' boş oturum', subCls: sesCap - sesDev <= 0 && sesCap ? 'text-rose-600 dark:text-rose-400' : '', tip: 'con_ses > 0 olan bağlantılarda cihaz / kurulu oturum' },
        { label: 'Sorgu yükü', icon: 'pi-bolt', value: fmt(T.reqPerSec, 1), sub: 'istek/sn · ~' + fmt(T.reqPerSec * 60) + ' /dk', tip: 'Σ 1/evt_per, etkin bloklar' },
        { label: 'Geçmişe yazılan', icon: 'pi-history', value: fmt(T.ioHistory), sub: 'noktaların %' + fmt(pctOf(T.ioHistory, T.io), 1) + '\'i', tip: 'Sınıf ya da noktada main.his* fonksiyonu olan noktalar' },
        { label: 'Alarmlı nokta', icon: 'pi-bell', value: fmt(T.ioAlarm), sub: 'noktaların %' + fmt(pctOf(T.ioAlarm, T.io), 1) + '\'i', tip: 'Sınıf ya da noktada ALM.* fonksiyonu ya da alm_ alanı olan noktalar' },
        { label: 'Kontroller', icon: 'pi-shield', value: fmt(T.errors + T.warnings), sub: issueSub, subCls: T.errors ? 'text-rose-600 dark:text-rose-400' : T.warnings ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400', tip: 'Aşağıdaki tutarlılık kontrollerinin hata + uyarı toplamı' }
      ];
      const ioPerDoc = {};
      all.forEach(d => { ioPerDoc[d.id] = d.counts.io; });
      const card = (title, icon, unit, map, top, note) => {
        const r = ranked(map, top);
        const max = Math.max(0, ...r.map(x => x.value));
        const total = Object.values(map).reduce((a, b) => a + b, 0);
        return { title, icon, unit, note, total, bars: r.map(x => Object.assign(x, { pct: pctOf(x.value, max) })) };
      };
      const cards = [
        card('Cihaz türü', 'pi-server', 'cihaz', maps('devTypes'), 9, 'dev_type (cihazda ya da sınıfta); yoksa sınıfın alm_lbl\'i'),
        card('Protokol', 'pi-sitemap', 'cihaz', devProto, 6),
        card('Sorgu periyodu', 'pi-clock', 'blok', maps('blockPeriods'), 8, 'evt_per; blokta yoksa sınıftan'),
        card('Geçmiş kayıt periyodu', 'pi-history', 'nokta', maps('hisPeriods'), 8, 'his_per; geçmişe yazılan noktalar'),
        card('En çok kullanılan IO sınıfı', 'pi-th-large', 'nokta', maps('ioClasses'), 9, fmt(T.tio) + ' sınıf tanımlı, ' + fmt(T.tioUnused) + ' kullanılmıyor'),
        card('Birim', 'pi-tag', 'nokta', maps('units'), 9, 'unit alanı dolu noktalar'),
        card('Cihaz sta (dosyada)', 'pi-flag', 'cihaz', maps('devSta'), 6, 'Motorun son #save anındaki değer; 0x0000 = devre dışı'),
        card('IO noktası (doküman)', 'pi-folder', 'nokta', ioPerDoc, 10, fmt(T.list) + ' liste, ' + fmt(T.item) + ' liste öğesi')
      ];
      const visible = issues.filter(i => st.levels[i.level]);
      const maxDocIo = Math.max(0, ...all.map(d => d.counts.io));
      const chip = on => 'px-2 py-1 text-[11px] font-semibold rounded-[2px] border cursor-pointer whitespace-nowrap transition-colors ' +
        (on ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800');
      const lc = (d, l) => d.issues.filter(i => i.level === l).reduce((a, i) => a + i.count, 0);
      const dash = '<span class="text-slate-400">—</span>';

      el.innerHTML =
        '<div class="h-full flex flex-col bg-slate-100 dark:bg-[#080c14] text-slate-800 dark:text-slate-100 min-h-0">' +
          '<header class="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0e1726] px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0">' +
            '<div class="flex items-center gap-2.5 min-w-0"><span class="w-7 h-7 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center text-xs"><i class="pi pi-th-large"></i></span>' +
              '<div class="min-w-0"><h1 class="text-xs font-bold leading-tight text-slate-900 dark:text-white">Konfigürasyon Editörü — Ana Sayfa</h1>' +
              '<span class="text-[10px] text-slate-500 dark:text-slate-400 truncate block">' + (st.scanning ? 'Taranıyor… ' + st.scanned + '/' + all.length + ' doküman'
                : all.length + ' doküman · db41 dosyalarından · ' + st.finishedAt.toLocaleTimeString('tr-TR', { hour12: false }) + ' (' + fmt(st.totalMs / 1000, 1) + ' sn)') + '</span></div></div>' +
            '<div class="flex items-center gap-1 overflow-x-auto custom-scrollbar">' +
              '<button type="button" data-scope="ALL" class="' + chip(st.scope === 'ALL') + '">Tüm site</button>' +
              all.map(d => '<button type="button" data-scope="' + esc(d.id) + '" class="' + chip(st.scope === d.id) + ' font-mono">' + esc(d.id) + '</button>').join('') +
            '</div>' +
            '<div class="flex items-center gap-2 shrink-0"><span data-report></span>' +
              '<button type="button" data-refresh class="px-2.5 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-[2px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50" title="Bütün dokümanları diskten yeniden oku ve tara"' + (st.scanning ? ' disabled' : '') + '>' +
                '<i class="pi pi-refresh text-[11px]' + (st.scanning ? ' pi-spin' : '') + '"></i><span class="hidden md:inline">Yenile</span></button></div>' +
          '</header>' +
          '<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-3">' +
            // KPI
            '<section class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12 gap-2">' +
              kpis.map(k => '<div class="p-2.5 ' + CARD + ' min-w-0" title="' + esc(k.tip) + '">' +
                '<div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><span class="truncate">' + esc(k.label) + '</span><i class="pi text-[11px] ' + k.icon + '"></i></div>' +
                '<div class="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-tight mt-1">' + esc(k.value) + '</div>' +
                '<div class="text-[10px] truncate ' + (k.subCls || 'text-slate-500 dark:text-slate-400') + '">' + esc(k.sub) + '</div></div>').join('') +
            '</section>' +
            // Dokümanlar
            '<section class="' + CARD + '">' +
              '<div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-folder-open text-sky-600 dark:text-sky-400"></i>Dokümanlar</h2>' +
                '<span class="text-[10px] text-slate-500 dark:text-slate-400">Satıra tıklayınca doküman editörde açılır</span></div>' +
              '<div class="overflow-x-auto custom-scrollbar"><table class="w-full text-[11px] tabular-nums"><thead class="' + TH + '"><tr>' +
                '<th class="text-left font-semibold px-3 py-1.5">Doküman</th><th class="text-left font-semibold px-2">Kat</th><th class="text-right font-semibold px-2">Boyut</th><th class="text-left font-semibold px-2">Son değişiklik</th>' +
                '<th class="text-right font-semibold px-2">Cihaz</th><th class="text-right font-semibold px-2">Blok</th><th class="text-left font-semibold px-2 min-w-[140px]">IO noktası</th>' +
                '<th class="text-right font-semibold px-2">Bağlantı</th><th class="text-right font-semibold px-2" title="Kök + bağlantılar + <thr>">Thread</th><th class="text-right font-semibold px-2" title="Σ thr_wrk">Worker</th>' +
                '<th class="text-right font-semibold px-2" title="Σ 1/evt_per (etkin bloklar)">İstek/sn</th><th class="text-right font-semibold px-2">Sınıf</th><th class="text-right font-semibold px-2">Liste</th>' +
                '<th class="text-right font-semibold px-2" title="xdb_log">Log</th><th class="text-left font-semibold px-2">Kontroller</th><th class="px-3"></th>' +
              '</tr></thead><tbody>' +
              all.map((d, i) => {
                const scanned = !st.scanning || i < st.scanned;
                return '<tr data-open="' + esc(d.id) + '" class="border-t border-slate-100 dark:border-slate-800/70 hover:bg-sky-50 dark:hover:bg-sky-950/20 cursor-pointer' + (scanned ? '' : ' opacity-60') + '">' +
                  '<td class="px-3 py-1.5 font-mono font-bold text-sky-700 dark:text-sky-400 whitespace-nowrap">' + esc(d.id) + '</td>' +
                  '<td class="px-2 whitespace-nowrap text-slate-600 dark:text-slate-300">' + esc(d.floors) + ' <span class="text-slate-400">· ' + esc(d.kind) + '</span></td>' +
                  (scanned ?
                    '<td class="px-2 text-right whitespace-nowrap">' + mb(d.bytes) + '</td>' +
                    '<td class="px-2 whitespace-nowrap text-slate-500 dark:text-slate-400" title="' + esc(d.modified) + '">' + ago(d.modified) + '</td>' +
                    '<td class="px-2 text-right font-semibold">' + fmt(d.counts.dev) + (d.counts.devDisabled ? '<span class="text-slate-400"> (' + d.counts.devDisabled + ' kapalı)</span>' : '') + '</td>' +
                    '<td class="px-2 text-right">' + fmt(d.counts.bi) + '</td>' +
                    '<td class="px-2"><div class="flex items-center gap-1.5"><div class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-sky-500 rounded-full" style="width:' + pctOf(d.counts.io, maxDocIo).toFixed(1) + '%"></div></div><span class="w-14 text-right font-semibold">' + fmt(d.counts.io) + '</span></div></td>' +
                    '<td class="px-2 text-right">' + d.counts.con + '</td><td class="px-2 text-right">' + d.threads.length + '</td><td class="px-2 text-right">' + d.workers + '</td>' +
                    '<td class="px-2 text-right">' + fmt(d.reqPerSec, 1) + '</td><td class="px-2 text-right">' + d.counts.tio + '</td><td class="px-2 text-right">' + d.counts.list + '</td><td class="px-2 text-right">' + esc(d.root.log) + '</td>' +
                    '<td class="px-2 whitespace-nowrap">' +
                      (lc(d, 'error') ? '<span class="inline-flex items-center gap-0.5 mr-1.5 text-rose-600 dark:text-rose-400"><i class="pi pi-times-circle text-[10px]"></i>' + lc(d, 'error') + ' hata</span>' : '') +
                      (lc(d, 'warning') ? '<span class="inline-flex items-center gap-0.5 mr-1.5 text-amber-600 dark:text-amber-400"><i class="pi pi-exclamation-triangle text-[10px]"></i>' + lc(d, 'warning') + ' uyarı</span>' : '') +
                      (!lc(d, 'error') && !lc(d, 'warning') ? '<span class="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"><i class="pi pi-check-circle text-[10px]"></i>temiz</span>' : '') + '</td>' +
                    '<td class="px-3 text-right"><i class="pi pi-chevron-right text-[10px] text-slate-400"></i></td>'
                  : '<td colspan="14" class="px-2 text-slate-500 dark:text-slate-400"><i class="pi pi-spin pi-spinner text-[10px] mr-1"></i>' + (i === st.scanned ? 'taranıyor…' : 'sırada') + '</td>') +
                '</tr>';
              }).join('') +
              '</tbody></table></div>' +
            '</section>' +
            // Bağlantılar + thread
            '<section class="grid grid-cols-1 2xl:grid-cols-5 gap-3">' +
              '<div class="2xl:col-span-3 ' + CARD + ' flex flex-col min-h-0">' +
                '<div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-sitemap text-purple-600 dark:text-purple-400"></i>Bağlantılar, oturumlar ve sorgu yükü</h2>' +
                  '<span class="text-[10px] text-slate-500 dark:text-slate-400 hidden md:inline">Haberleşme Rehberi §8 tanımlarıyla</span></div>' +
                '<div class="overflow-auto custom-scrollbar max-h-[420px]"><table class="w-full text-[11px] tabular-nums"><thead class="' + TH + ' sticky top-0 z-10"><tr>' +
                  (st.scope === 'ALL' ? '<th class="text-left font-semibold px-3 py-1.5">Doküman</th>' : '') +
                  '<th class="text-left font-semibold px-2 py-1.5">Bağlantı</th><th class="text-left font-semibold px-2">Protokol</th><th class="text-right font-semibold px-2">Cihaz</th><th class="text-right font-semibold px-2">Blok</th><th class="text-right font-semibold px-2">IO</th>' +
                  '<th class="text-left font-semibold px-2 min-w-[120px]" title="Cihaz / con_ses. Boş oturum > 0 olmalı">Oturum (cihaz/kurulu)</th><th class="text-right font-semibold px-2" title="thr_wrk">Worker</th>' +
                  '<th class="text-right font-semibold px-2" title="Σ 1/evt_per, etkin bloklar">İstek/sn</th><th class="text-right font-semibold px-2" title="İstek/sn ÷ thr_wrk">/worker</th>' +
                  '<th class="text-right font-semibold px-2" title="pro_tmo × max(pro_try, 1)">En kötü istek</th><th class="text-right font-semibold px-2" title="Her istek zaman aşımına düşerse worker havuzunun doluluğu. Tahmin; ölçüm değil.">En kötü doluluk</th>' +
                  '<th class="text-left font-semibold px-2" title="Etkin blokların evt_dly değerleri: hepsi 0 ise bloklar aynı anda tetiklenir">evt_dly yayılımı</th>' +
                '</tr></thead><tbody>' +
                cons.map(r => '<tr class="border-t border-slate-100 dark:border-slate-800/70">' +
                  (st.scope === 'ALL' ? '<td class="px-3 py-1 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">' + esc(r.doc) + '</td>' : '') +
                  '<td class="px-2 py-1 font-mono font-semibold whitespace-nowrap">' + esc(r.c.id) + '</td>' +
                  '<td class="px-2 whitespace-nowrap"><span class="px-1.5 py-px rounded-[2px] bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold">' + r.c.protocol + '</span> <span class="text-slate-400 text-[10px]">' + r.c.transport + '</span></td>' +
                  '<td class="px-2 text-right font-semibold">' + fmt(r.c.devices) + '</td><td class="px-2 text-right">' + fmt(r.c.blocks) + '</td><td class="px-2 text-right">' + fmt(r.c.ios) + '</td>' +
                  '<td class="px-2">' + (r.sesPct !== null
                    ? '<div class="flex items-center gap-1.5" title="Boş oturum: ' + r.c.freeSes + '"><div class="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full rounded-full ' + (r.c.freeSes <= 0 ? 'bg-rose-500' : r.sesPct >= 90 ? 'bg-amber-500' : 'bg-sky-500') + '" style="width:' + Math.min(r.sesPct, 100).toFixed(1) + '%"></div></div><span class="whitespace-nowrap">' + r.c.devices + '/' + r.c.ses + '</span></div>'
                    : '<span class="text-slate-400">con_ses yok</span>') + '</td>' +
                  '<td class="px-2 text-right">' + r.c.thrWrk + '</td><td class="px-2 text-right font-semibold">' + fmt(r.c.reqPerSec, 2) + '</td>' +
                  '<td class="px-2 text-right">' + (r.c.thrWrk ? fmt(r.perWrk, 2) : '—') + '</td><td class="px-2 text-right">' + fmt(r.c.worstReqSec, 1) + ' sn</td>' +
                  '<td class="px-2 text-right whitespace-nowrap">' + (r.occ !== null ? '<span class="' + (r.occ > 100 ? 'text-amber-600 dark:text-amber-400 font-semibold' : '') + '">' + fmt(r.occ) + '%</span>' + (r.occ > 100 ? '<i class="pi pi-exclamation-triangle text-[10px] text-amber-500 ml-0.5" title="Cihazların çoğu cevap vermezse worker havuzu yetişmez"></i>' : '') : dash) + '</td>' +
                  '<td class="px-2 whitespace-nowrap">' + (r.c.blocksActive ? (r.c.dlyZero === r.c.blocksActive ? '<span class="text-amber-600 dark:text-amber-400" title="' + r.c.blocksActive + ' blok aynı anda tetiklenir"><i class="pi pi-exclamation-triangle text-[10px]"></i> yok (hepsi 0)</span>' : r.c.dlyDistinct + ' farklı değer') : dash) + '</td>' +
                '</tr>').join('') +
                '</tbody></table></div>' +
              '</div>' +
              '<div class="2xl:col-span-2 ' + CARD + ' flex flex-col min-h-0">' +
                '<div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-microchip text-indigo-600 dark:text-indigo-400"></i>Thread ve worker haritası</h2>' +
                  '<span class="text-[10px] text-slate-500 dark:text-slate-400">' + T.threads + ' thread · ' + T.workers + ' worker</span></div>' +
                '<div class="overflow-auto custom-scrollbar max-h-[420px]"><table class="w-full text-[11px] tabular-nums"><thead class="' + TH + ' sticky top-0 z-10"><tr>' +
                  (st.scope === 'ALL' ? '<th class="text-left font-semibold px-3 py-1.5">Doküman</th>' : '') +
                  '<th class="text-left font-semibold px-2 py-1.5">Thread</th><th class="text-left font-semibold px-2">Worker (thr_wrk)</th><th class="text-right font-semibold px-2" title="thr_per (ms)">Çevrim</th>' +
                  '<th class="text-right font-semibold px-2" title="Zamanlayıcısı bu thread\'de yaşayan eleman (bi/var/io)">Zamanlayıcı</th><th class="text-right font-semibold px-2" title="que_max">Kuyruk üst</th>' +
                '</tr></thead><tbody>' +
                thrs.map(r => '<tr class="border-t border-slate-100 dark:border-slate-800/70">' +
                  (st.scope === 'ALL' ? '<td class="px-3 py-1 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">' + esc(r.doc) + '</td>' : '') +
                  '<td class="px-2 py-1 whitespace-nowrap" title="' + esc(r.t.desc) + '"><span class="font-mono font-semibold">' + esc(r.t.id) + '</span>' +
                    '<span class="ml-1 px-1 rounded-[2px] text-[9px] font-semibold uppercase ' + (r.t.kind === 'root' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : r.t.kind === 'con' ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300' : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300') + '">' +
                    (r.t.kind === 'root' ? 'kök' : r.t.kind === 'con' ? 'bağlantı' : 'thr') + '</span></td>' +
                  '<td class="px-2"><div class="flex items-center gap-1.5"><span class="flex flex-wrap gap-[2px] max-w-[132px]">' + '<span class="w-[6px] h-[6px] rounded-[1px] bg-indigo-500 dark:bg-indigo-400"></span>'.repeat(Math.min(r.t.thrWrk, 64)) + '</span><span class="font-semibold">' + r.t.thrWrk + '</span></div></td>' +
                  '<td class="px-2 text-right">' + (r.t.thrPer ? r.t.thrPer + ' ms' : '—') + '</td><td class="px-2 text-right font-semibold">' + fmt(r.t.timers) + '</td><td class="px-2 text-right">' + (r.t.queMax !== null ? fmt(r.t.queMax) : '—') + '</td>' +
                '</tr>').join('') +
                '</tbody></table></div>' +
              '</div>' +
            '</section>' +
            // Dağılımlar
            '<section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">' +
              cards.map(c => '<div class="' + CARD + ' p-3 min-w-0">' +
                '<div class="flex items-center justify-between mb-2"><h3 class="text-[11px] font-bold flex items-center gap-1.5"><i class="pi text-slate-400 ' + c.icon + '"></i>' + esc(c.title) + '</h3><span class="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">' + fmt(c.total) + ' ' + c.unit + '</span></div>' +
                '<div class="space-y-1">' + c.bars.map(b => '<div class="group" title="' + esc(b.key + ': ' + fmt(b.value) + ' ' + c.unit) + '">' +
                  '<div class="flex items-center justify-between text-[11px] leading-tight"><span class="truncate pr-2 text-slate-700 dark:text-slate-300 font-mono text-[10.5px]">' + esc(b.key) + '</span><span class="tabular-nums font-semibold text-slate-900 dark:text-slate-100">' + fmt(b.value) + '</span></div>' +
                  '<div class="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-sky-500 dark:bg-sky-400 rounded-full" style="width:' + b.pct.toFixed(1) + '%"></div></div></div>').join('') +
                  (!c.bars.length ? '<div class="text-[11px] text-slate-400">Veri yok</div>' : '') + '</div>' +
                (c.note ? '<p class="mt-2 text-[10px] text-slate-400 leading-snug">' + esc(c.note) + '</p>' : '') +
              '</div>').join('') +
            '</section>' +
            // Kontroller
            '<section class="' + CARD + '">' +
              '<div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-shield text-emerald-600 dark:text-emerald-400"></i>Tutarlılık kontrolleri</h2>' +
                '<div class="flex items-center gap-1 text-[11px]">' + ['error', 'warning', 'info'].map(l =>
                  '<button type="button" data-level="' + l + '" class="px-2 py-0.5 rounded-[2px] border cursor-pointer flex items-center gap-1 ' + (st.levels[l] ? LEVEL[l].chip : 'border-slate-300 dark:border-slate-700 text-slate-400') + '"><i class="pi ' + LEVEL[l].icon.split(' ')[0] + ' text-[10px]"></i>' + LEVEL[l].name + ' ' + fmt(l === 'error' ? T.errors : l === 'warning' ? T.warnings : T.infos) + '</button>').join('') + '</div>' +
              '</div>' +
              (!visible.length ? '<div class="px-3 py-4 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><i class="pi pi-check-circle"></i>Seçili seviyelerde bulgu yok.</div>' : '') +
              '<div class="divide-y divide-slate-100 dark:divide-slate-800/70">' +
              visible.map(is => {
                const k = is.doc + '|' + is.code;
                const open = st.expanded.has(k) || st.expanded.has(is.code);
                return '<div><button type="button" data-issue="' + esc(k) + '" class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer">' +
                  '<i class="pi text-[11px] ' + LEVEL[is.level].icon + '"></i><span class="text-[10px] font-semibold w-10 shrink-0 ' + LEVEL[is.level].text + '">' + LEVEL[is.level].label + '</span>' +
                  '<span class="font-mono text-[10px] px-1 rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">' + esc(is.doc) + '</span>' +
                  '<span class="font-semibold truncate">' + esc(is.title) + '</span><span class="ml-auto tabular-nums font-bold shrink-0">' + fmt(is.count) + '</span>' +
                  '<i class="pi text-[10px] text-slate-400 shrink-0 ' + (open ? 'pi-chevron-up' : 'pi-chevron-down') + '"></i></button>' +
                  (open ? '<div class="px-3 pb-2 pl-9 space-y-1.5"><p class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(is.hint) + '</p><div class="flex flex-wrap gap-1">' +
                    is.samples.map(sm => '<button type="button" data-sample-doc="' + esc(is.doc) + '" data-sample-dev="' + esc(sm.dev || '') + '" class="px-1.5 py-0.5 rounded-[2px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-sky-500/50 hover:text-sky-700 dark:hover:text-sky-300 text-[10.5px] font-mono cursor-pointer" title="' + esc(is.doc + (sm.dev ? ' · cihazı editörde aç' : ' · dokümanı aç')) + '">' +
                      esc(sm.id) + (sm.detail ? '<span class="text-slate-400"> · ' + esc(sm.detail) + '</span>' : '') + '</button>').join('') +
                  '</div></div>' : '') + '</div>';
              }).join('') +
              '</div>' +
            '</section>' +
            '<p class="text-[10px] text-slate-400 leading-relaxed px-1 pb-2">Kaynak: db41 XML dosyaları (yorum satırları hariç). Dosyadaki <span class="font-mono">sta</span>, <span class="font-mono">ses_cnt</span> gibi alanlar motorun son #save anındaki değerleridir, canlı durum değildir. ' +
              'İstek/sn = Σ 1/evt_per (etkin bloklar, sınıftan devralınan evt_per dahil); en kötü istek = pro_tmo × max(pro_try, 1); boş evt_thr → bağlantının thread\'i; sta = 0x0000 → devre dışı. Sunumda değerler kurgusaldır.</p>' +
          '</div>' +
        '</div>';

      menu = DCIM.report.menu(el.querySelector('[data-report]'), {
        label: 'Rapor al', options: 'limit', unit: 'bağlantı', total: cons.length, defaultLimit: 50,
        scopes: [{ id: 'docs', label: 'Dokümanlar', hint: 'Doküman özet tablosu' }, { id: 'cons', label: 'Bağlantılar ve yük', hint: 'Kapsamdaki bağlantılar' }, { id: 'issues', label: 'Tutarlılık kontrolleri', hint: 'Seçili seviyeler' }],
        onExport: req => {
          const sec = req.scope === 'docs'
            ? { title: 'Dokümanlar', columns: [{ key: 'id', label: 'Doküman' }, { key: 'f', label: 'Kat' }, { key: 'dev', label: 'Cihaz', align: 'right' }, { key: 'bi', label: 'Blok', align: 'right' }, { key: 'io', label: 'IO', align: 'right' }, { key: 'con', label: 'Bağlantı', align: 'right' }, { key: 'wrk', label: 'Worker', align: 'right' }, { key: 'rps', label: 'İstek/sn', align: 'right' }],
                rows: DCIM.report.applyLimit(all, req).map(d => ({ id: d.id, f: d.floors, dev: d.counts.dev, bi: d.counts.bi, io: d.counts.io, con: d.counts.con, wrk: d.workers, rps: fmt(d.reqPerSec, 1) })) }
            : req.scope === 'issues'
              ? { title: 'Tutarlılık kontrolleri', toneKey: 'tone', columns: [{ key: 'lvl', label: 'Seviye' }, { key: 'doc', label: 'Doküman' }, { key: 'title', label: 'Bulgu' }, { key: 'count', label: 'Adet', align: 'right' }, { key: 'hint', label: 'Açıklama' }],
                  rows: DCIM.report.applyLimit(visible, req).map(i => ({ lvl: LEVEL[i.level].name, doc: i.doc, title: i.title, count: i.count, hint: i.hint, tone: i.level === 'error' ? 'alarm' : i.level === 'warning' ? 'warning' : 'info' })) }
              : { title: 'Bağlantılar, oturumlar ve sorgu yükü', columns: [{ key: 'doc', label: 'Doküman' }, { key: 'id', label: 'Bağlantı' }, { key: 'p', label: 'Protokol' }, { key: 'dev', label: 'Cihaz', align: 'right' }, { key: 'bi', label: 'Blok', align: 'right' }, { key: 'ses', label: 'Oturum' }, { key: 'wrk', label: 'Worker', align: 'right' }, { key: 'rps', label: 'İstek/sn', align: 'right' }, { key: 'occ', label: 'En kötü doluluk', align: 'right' }],
                  rows: DCIM.report.applyLimit(cons, req).map(r => ({ doc: r.doc, id: r.c.id, p: r.c.protocol, dev: r.c.devices, bi: r.c.blocks, ses: r.c.ses ? r.c.devices + '/' + r.c.ses : 'con_ses yok', wrk: r.c.thrWrk, rps: fmt(r.c.reqPerSec, 2), occ: r.occ === null ? '—' : fmt(r.occ) + '%' })) };
          DCIM.report.generate({
            title: 'Konfigürasyon Özeti', subtitle: (st.scope === 'ALL' ? 'Tüm site' : st.scope) + ' · ' + sec.title, filename: 'Konfigurasyon_Ozeti',
            kpis: kpis.slice(0, 6).map(k => ({ label: k.label, value: k.value })), sections: [sec]
          }, req.format);
        }
      });
    }

    let timer = null;
    function rescan() {
      st.scanning = true; st.scanned = 0;
      const t0 = Date.now();
      render();
      timer = setInterval(() => {
        st.scanned++;
        if (st.scanned >= all.length) { clearInterval(timer); timer = null; st.scanning = false; st.finishedAt = new Date(); st.totalMs = Date.now() - t0; }
        render();
      }, 260);
    }

    el.addEventListener('click', e => {
      const t = e.target.closest('[data-scope],[data-open],[data-level],[data-issue],[data-sample-doc],[data-refresh]');
      if (!t || t.disabled) return;
      if (t.hasAttribute('data-scope')) { st.scope = t.getAttribute('data-scope'); render(); }
      else if (t.hasAttribute('data-open')) DCIM.eng.go('xml-editor', { doc: t.getAttribute('data-open') });
      else if (t.hasAttribute('data-level')) { const l = t.getAttribute('data-level'); st.levels[l] = !st.levels[l]; render(); }
      else if (t.hasAttribute('data-issue')) { const k = t.getAttribute('data-issue'); if (st.expanded.has(k)) st.expanded.delete(k); else st.expanded.add(k); render(); }
      else if (t.hasAttribute('data-sample-doc')) { const dev = t.getAttribute('data-sample-dev'); DCIM.eng.go('xml-editor', Object.assign({ doc: t.getAttribute('data-sample-doc') }, dev ? { dev } : {})); }
      else if (t.hasAttribute('data-refresh')) rescan();
    });

    render();
    return { destroy() { clearInterval(timer); if (menu) menu.destroy(); } };
  }

  // =============================================================================================
  // Doküman görünümü (salt okunur)
  function mountDoc(el, params, S) {
    const docId = params.get('doc');
    const d = S.doc(docId);
    if (!d) {
      el.innerHTML = '<div class="p-4">' + DCIM.kit.emptyState({ message: docId + ' dokümanı bulunamadı', description: 'Doküman listesi: ' + S.docs().map(x => x.id).join(', '), icon: 'pi pi-file' }) + '</div>';
      return {};
    }
    const st = { dev: params.get('dev') || '', q: '', open: new Set() };
    const sel = d.devices.find(x => x.id === st.dev);
    if (sel) st.open.add(sel.con); else if (d.cons[0]) st.open.add(d.cons[0].id);

    el.innerHTML =
      '<div class="h-full flex flex-col bg-slate-100 dark:bg-[#080c14] text-slate-800 dark:text-slate-100 min-h-0">' +
        '<header class="h-12 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0e1726] px-3 sm:px-4 flex items-center justify-between gap-3 shrink-0">' +
          '<div class="flex items-center gap-2.5 min-w-0">' +
            '<a href="#xml-editor" class="px-2 py-1 text-[11px] font-semibold rounded-[2px] border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5" title="Konfigürasyon Editörü ana sayfası"><i class="pi pi-th-large text-[10px]"></i>Ana sayfa</a>' +
            '<span class="w-7 h-7 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 flex items-center justify-center text-xs"><i class="pi pi-file-edit"></i></span>' +
            '<div class="min-w-0"><h1 class="text-xs font-bold leading-tight text-slate-900 dark:text-white font-mono">' + esc(d.id) + '</h1>' +
              '<span class="text-[10px] text-slate-500 dark:text-slate-400 truncate block">' + esc(d.floors + ' · ' + d.kind) + ' · ' + mb(d.bytes) + ' · ' + fmt(d.counts.dev) + ' cihaz · ' + fmt(d.counts.io) + ' nokta · son değişiklik ' + ago(d.modified) + '</span></div>' +
          '</div>' +
          '<span class="px-2 py-0.5 rounded-[2px] border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-semibold flex items-center gap-1"><i class="pi pi-lock text-[9px]"></i>Salt okunur (sunum)</span>' +
        '</header>' +
        '<div class="flex-1 min-h-0 flex">' +
          '<aside class="w-80 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0e1726] flex flex-col min-h-0">' +
            '<div class="p-2 border-b border-slate-200 dark:border-slate-800"><div class="relative"><i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
              '<input type="text" data-q placeholder="Cihaz, açıklama, IP…" class="w-full pl-6 pr-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] focus:outline-none focus:border-sky-500"></div></div>' +
            '<div data-tree class="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-1"></div>' +
          '</aside>' +
          '<main data-detail class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-3"></main>' +
        '</div>' +
      '</div>';

    function renderTree() {
      const q = st.q.trim().toLocaleLowerCase('tr');
      const host = el.querySelector('[data-tree]');
      host.innerHTML =
        '<button type="button" data-dev="" class="w-full px-3 py-1.5 flex items-center gap-2 text-left text-[11px] font-semibold ' + (!st.dev ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40') + '"><i class="pi pi-folder text-[10px] text-sky-500"></i>Doküman özeti</button>' +
        d.cons.map(c => {
          const devs = d.devices.filter(x => x.con === c.id && (!q || [x.id, x.desc, x.host].some(v => (v || '').toLocaleLowerCase('tr').includes(q))));
          if (q && !devs.length) return '';
          const open = q || st.open.has(c.id);
          return '<div><button type="button" data-con="' + esc(c.id) + '" class="w-full px-3 py-1 flex items-center gap-1.5 text-left text-[11px] hover:bg-slate-50 dark:hover:bg-slate-900/40">' +
              '<i class="pi text-[9px] text-slate-400 ' + (open ? 'pi-chevron-down' : 'pi-chevron-right') + '"></i><i class="pi pi-sitemap text-[10px] text-purple-500"></i>' +
              '<span class="font-mono font-semibold">' + esc(c.id) + '</span><span class="ml-auto text-[10px] text-slate-400 tabular-nums">' + devs.length + '</span></button>' +
            (open ? devs.map(x => '<button type="button" data-dev="' + esc(x.id) + '" class="w-full pl-8 pr-3 py-0.5 flex items-center gap-1.5 text-left text-[11px] ' + (x.id === st.dev ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 font-semibold' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40') + '" title="' + esc(x.desc + ' · ' + x.host) + '">' +
              '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + (STATUS_DOT[x.status] || 'bg-slate-400') + '"></span><span class="font-mono truncate">' + esc(x.id) + '</span></button>').join('') : '') +
          '</div>';
        }).join('');
      const s = host.querySelector('[data-dev="' + (window.CSS && CSS.escape ? CSS.escape(st.dev) : st.dev) + '"]');
      if (s && st.dev) s.scrollIntoView({ block: 'center' });
    }

    function renderDetail() {
      const host = el.querySelector('[data-detail]');
      const x = st.dev ? S.device(d.id, st.dev) : null;
      if (!x) {
        host.innerHTML =
          '<section class="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">' +
            [['Cihaz', d.counts.dev], ['Devre dışı', d.counts.devDisabled], ['Sorgu bloğu', d.counts.bi], ['IO noktası', d.counts.io], ['Bağlantı', d.counts.con], ['Thread', d.threads.length], ['Worker', d.workers], ['Sınıf', d.counts.tio]]
              .map(k => '<div class="p-2.5 ' + CARD + '"><div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">' + k[0] + '</div><div class="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">' + fmt(k[1]) + '</div></div>').join('') +
          '</section>' +
          '<section class="' + CARD + '"><div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-sitemap text-purple-600 dark:text-purple-400"></i>Bağlantılar</h2></div>' +
            '<table class="w-full text-[11px] tabular-nums"><thead class="' + TH + '"><tr><th class="text-left font-semibold px-3 py-1.5">Bağlantı</th><th class="text-left font-semibold px-2">Protokol</th><th class="text-right font-semibold px-2">Cihaz</th><th class="text-right font-semibold px-2">Blok</th><th class="text-right font-semibold px-2">Worker</th><th class="text-right font-semibold px-3">İstek/sn</th></tr></thead><tbody>' +
            d.cons.map(c => '<tr data-con="' + esc(c.id) + '" class="border-t border-slate-100 dark:border-slate-800/70 hover:bg-sky-50 dark:hover:bg-sky-950/20 cursor-pointer"><td class="px-3 py-1 font-mono font-semibold">' + esc(c.id) + '</td><td class="px-2">' + c.protocol + ' <span class="text-slate-400 text-[10px]">' + c.transport + '</span></td><td class="px-2 text-right">' + c.devices + '</td><td class="px-2 text-right">' + fmt(c.blocks) + '</td><td class="px-2 text-right">' + c.thrWrk + '</td><td class="px-3 text-right font-semibold">' + fmt(c.reqPerSec, 2) + '</td></tr>').join('') +
            '</tbody></table></section>' +
          '<section class="' + CARD + '"><div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-shield text-emerald-600 dark:text-emerald-400"></i>Bu dokümandaki kontroller</h2></div>' +
            '<div class="divide-y divide-slate-100 dark:divide-slate-800/70">' + d.issues.map(is => '<div class="px-3 py-1.5 text-xs"><div class="flex items-center gap-2"><i class="pi text-[11px] ' + LEVEL[is.level].icon + '"></i><span class="text-[10px] font-semibold w-10 ' + LEVEL[is.level].text + '">' + LEVEL[is.level].label + '</span><span class="font-semibold">' + esc(is.title) + '</span><span class="ml-auto font-bold tabular-nums">' + is.count + '</span></div>' +
              '<div class="pl-14 flex flex-wrap gap-1 mt-0.5">' + is.samples.map(sm => sm.dev ? '<button type="button" data-dev="' + esc(sm.dev) + '" class="px-1.5 py-0.5 rounded-[2px] border border-slate-200 dark:border-slate-700 text-[10.5px] font-mono hover:border-sky-500/50 hover:text-sky-700 dark:hover:text-sky-300 cursor-pointer">' + esc(sm.dev) + '</button>' : '<span class="px-1.5 py-0.5 text-[10.5px] font-mono text-slate-500">' + esc(sm.id) + '</span>').join('') + '</div></div>').join('') + '</div></section>';
        return;
      }
      host.innerHTML =
        '<section class="' + CARD + ' p-3 flex flex-wrap items-center gap-3">' +
          '<span class="w-8 h-8 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center"><i class="pi pi-server"></i></span>' +
          '<div class="min-w-0"><div class="font-mono font-bold text-sm text-slate-900 dark:text-white">' + esc(x.id) + '</div><div class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(x.desc) + ' · ' + esc(x.loc) + '</div></div>' +
          '<span class="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold"><span class="w-2 h-2 rounded-full ' + (STATUS_DOT[x.status] || 'bg-slate-400') + '"></span>' + (STATUS_LABEL[x.status] || x.status) + '</span>' +
        '</section>' +
        '<section class="grid grid-cols-1 xl:grid-cols-2 gap-3">' +
          '<div class="' + CARD + '"><div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-list text-sky-600 dark:text-sky-400"></i>Öznitelikler <span class="text-[10px] font-normal text-slate-400">&lt;dev&gt;</span></h2></div>' +
            '<table class="w-full text-[11px]"><tbody>' + x.attrs.map(a => '<tr class="border-t first:border-t-0 border-slate-100 dark:border-slate-800/70"><td class="px-3 py-1 font-mono text-slate-500 dark:text-slate-400 w-32">' + esc(a[0]) + '</td><td class="px-2 py-1 font-mono font-semibold break-all ' + (/\\r$/.test(a[1]) ? 'text-rose-600 dark:text-rose-400' : '') + '">' + esc(a[1]) + '</td></tr>').join('') + '</tbody></table></div>' +
          '<div class="' + CARD + '"><div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-box text-indigo-600 dark:text-indigo-400"></i>Sorgu blokları <span class="text-[10px] font-normal text-slate-400">&lt;bi&gt;</span></h2></div>' +
            '<table class="w-full text-[11px] tabular-nums"><thead class="' + TH + '"><tr><th class="text-left font-semibold px-3 py-1.5">Blok</th><th class="text-right font-semibold px-2">evt_per</th><th class="text-right font-semibold px-2">evt_dly</th><th class="text-right font-semibold px-3">Nokta</th></tr></thead><tbody>' +
            x.blocks.map(b => '<tr class="border-t border-slate-100 dark:border-slate-800/70"><td class="px-3 py-1 font-mono font-semibold">' + esc(b.id) + '</td><td class="px-2 text-right">' + DCIM.engBulk.formatPeriod(b.evt_per) + '</td><td class="px-2 text-right' + (b.evt_dly === 0 ? ' text-amber-600 dark:text-amber-400' : '') + '">' + b.evt_dly + ' sn</td><td class="px-3 text-right">' + b.ios + '</td></tr>').join('') +
            '</tbody></table></div>' +
        '</section>' +
        '<section class="' + CARD + '"><div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between"><h2 class="text-xs font-bold flex items-center gap-2"><i class="pi pi-chart-line text-emerald-600 dark:text-emerald-400"></i>Noktalar <span class="text-[10px] font-normal text-slate-400">&lt;io&gt; · ilk ' + x.iosList.length + ' / ' + x.ios + '</span></h2></div>' +
          '<table class="w-full text-[11px] tabular-nums"><thead class="' + TH + '"><tr><th class="text-left font-semibold px-3 py-1.5">Nokta</th><th class="text-left font-semibold px-2">Açıklama</th><th class="text-left font-semibold px-2">Sınıf (xdb_cls)</th><th class="text-left font-semibold px-2">Birim</th><th class="text-right font-semibold px-2">his_per</th><th class="text-left font-semibold px-3">Alarm</th></tr></thead><tbody>' +
          x.iosList.map(p => '<tr class="border-t border-slate-100 dark:border-slate-800/70"><td class="px-3 py-1 font-mono">' + esc(p.id) + '</td><td class="px-2">' + esc(p.desc) + '</td><td class="px-2 font-mono text-slate-500 dark:text-slate-400">' + esc(p.cls) + '</td><td class="px-2">' + esc(p.unit || '—') + '</td><td class="px-2 text-right">' + (p.his ? DCIM.engBulk.formatPeriod(p.his) : '—') + '</td><td class="px-3">' + (p.alm ? '<i class="pi pi-bell text-[10px] text-amber-500"></i> ALM' : '<span class="text-slate-400">—</span>') + '</td></tr>').join('') +
          '</tbody></table></section>';
    }

    function select(dev) {
      st.dev = dev;
      history.replaceState(null, '', '#xml-editor?doc=' + encodeURIComponent(d.id) + (dev ? '&dev=' + encodeURIComponent(dev) : ''));
      renderTree();
      renderDetail();
    }

    el.addEventListener('click', e => {
      const t = e.target.closest('[data-dev],[data-con]');
      if (!t) return;
      if (t.hasAttribute('data-dev')) select(t.getAttribute('data-dev'));
      else { const c = t.getAttribute('data-con'); if (st.open.has(c) && t.tagName === 'BUTTON') st.open.delete(c); else st.open.add(c); renderTree(); }
    });
    el.querySelector('[data-q]').addEventListener('input', e => { st.q = e.target.value; renderTree(); });

    renderTree();
    renderDetail();
    return {};
  }

  DCIM.engRegistry['xml-editor'] = { mount };
})();
