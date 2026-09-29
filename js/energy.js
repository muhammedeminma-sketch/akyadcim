/* ==========================================================================
   DCIM Sunum — Enerji Genel Görünüm (EnergyGeneralViewComponent)
   Kompozisyon (energy-general-view.component.html ile aynı):
     app-page-header + PDF Raporu · Lokasyon Ağacı (sidebar) · sağ çalışma alanı:
     [sekme çubuğu] · app-schematic-toolbar · aktif görünüm
   Görünümler (activeView karşılıkları):
     overview  → Genel Bakış (orijinalde "Enerji Tek Hat" şeması; sunumda PUE/güç kırılımı + akış özeti)
     rectifier → RectifierDashboardComponent (+ doğrultucu modülleri)
     ups       → UpsDashboardComponent (1400×900 ölçeklenen SCADA şeması, UPS alt menüsü)
     generator → GeneratorGaugesComponent (SVG kadran göstergeleri)
     meters    → EnergyTableDashboardComponent (enerji analizörleri SCADA tablosu)
   Veri: DCIM.data.energy (js/mock/energy.data.js); 3 sn'de bir tohumlu gürültüyle canlı güncellenir.
   Derin bağlantılar:
     ?tab=overview|rectifier|ups|generator|meters
     ?tab=ups&ups=A5        (UPS seçimi: A1–A7, B1–B7; varsayılan: en kritik UPS → A5)
     ?tab=meters&q=Klima    (arama terimi; tüm sekmelerde süzme için kullanılır)
     ?tab=generator&gen=B   (ilgili jeneratör grubuna kaydırır)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtTime, statusBadge, toast } = DCIM.ui;
  const kit = DCIM.kit;
  const D = DCIM.data;
  const E = D.energy;
  DCIM.shell.init({ active: 'energy' });

  const TABS = [
    { key: 'overview', label: 'Genel Bakış', icon: 'pi pi-sitemap', node: 'EN01010102010000' },
    { key: 'rectifier', label: 'Redresör Paneli', icon: 'pi pi-sliders-h', node: 'EN01010105000000' },
    { key: 'ups', label: 'UPS Paneli', icon: 'pi pi-shield', node: null },
    { key: 'generator', label: 'Jeneratör', icon: 'pi pi-cog', node: 'EN0101010400000000' },
    { key: 'meters', label: 'Sayaç Tablosu', icon: 'pi pi-table', node: null, title: 'ENERJİ ANALİZÖRLERİ' }
  ];
  const TAB_KEYS = TABS.map(t => t.key);

  const params = new URLSearchParams(window.location.search);
  const upsInit = (params.get('ups') || '').toUpperCase();
  const state = {
    tab: TAB_KEYS.indexOf(params.get('tab')) >= 0 ? params.get('tab') : 'overview',
    ups: E.upsCodes.indexOf(upsInit) >= 0 ? upsInit : 'A5',
    gen: params.get('gen') === 'B' ? 'B' : params.get('gen') === 'A' ? 'A' : null,
    q: params.get('q') || '',
    tick: 0,
    sidebarCollapsed: false,
    details: false,
    cardsPerRow: 3,
    activeNodeId: '',
    pageTitle: 'ENERJİ GENEL GÖRÜNÜM',
    collapsed: new Set()
  };

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  const $ = sel => document.querySelector(sel);
  const fx = (v, d) => (v == null || v === '-' || isNaN(parseFloat(v)) ? '-' : parseFloat(v).toFixed(d));
  const fnum = (v, d) => (v == null || isNaN(v) ? '-' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }));
  // Türkçe büyük/küçük harf: 'KLIMA' → 'klıma' olmasın diye ı/i eşitlenir
  const lc = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  const matchQ = s => !state.q.trim() || lc(s).indexOf(lc(state.q.trim())) >= 0;
  const CARD = 'bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs';

  // Lokasyon ağacı düzleştirme
  const NODE_MAP = new Map();
  (function walk(nodes, parent) {
    nodes.forEach(n => { n.parent = parent || null; NODE_MAP.set(n.id, n); if (n.children) walk(n.children, n); });
  })(E.tree);

  // ---------------------------------------------------------------------------
  // Sayfa iskeleti
  // ---------------------------------------------------------------------------
  const root = document.getElementById('en-root');
  root.innerHTML =
    '<div class="px-3 pt-1.5 pb-1 shrink-0 flex items-center justify-between">' +
      '<div class="flex-grow">' + kit.pageHeader({ title: 'Enerji Genel Görünüm', compact: true, breadcrumbs: [{ label: 'Enerji ve Çevre' }, { label: 'Enerji Genel Görünüm' }] }) + '</div>' +
      '<button type="button" data-pdf class="ml-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-[2px] flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer" title="Aktif Görünümün PDF Raporunu İndir" data-report-hide>' +
        '<i class="pi pi-file-pdf text-sm"></i><span>PDF Raporu</span></button>' +
    '</div>' +
    '<div class="flex-grow flex overflow-hidden min-h-0">' +
      '<div id="en-sidebar"></div>' +
      '<div class="flex-grow flex flex-col min-w-0 bg-slate-50 dark:bg-surface-base relative overflow-hidden">' +
        '<div id="en-tabs" class="shrink-0 px-2 pt-2 pb-1.5" data-report-hide></div>' +
        '<div id="en-toolbar" class="shrink-0 px-2"></div>' +
        '<div id="en-view" class="flex-1 min-h-0 relative overflow-hidden"></div>' +
      '</div>' +
    '</div>';
  root.querySelector('[data-pdf]').addEventListener('click', () => kit.exportPdf());

  // ---------------------------------------------------------------------------
  // Lokasyon Ağacı (sidebar)
  // ---------------------------------------------------------------------------
  const SB_DOT = { alarm: 'bg-rose-500 animate-pulse', warning: 'bg-amber-500', lost: 'bg-orange-500' };
  function nodeHtml(n) {
    const leaf = !n.children || !n.children.length;
    const expanded = !state.collapsed.has(n.id);
    const active = state.activeNodeId === n.id;
    return '<div>' +
      '<div data-node="' + esc(n.id) + '" class="' + (active ? 'bg-sky-600/10 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800') + ' px-2 py-1.5 rounded-[2px] flex items-center gap-1.5 cursor-pointer transition-colors">' +
        (!leaf ? '<i data-toggle="' + esc(n.id) + '" class="' + (expanded ? 'pi pi-chevron-down text-slate-400' : 'pi pi-chevron-right text-slate-400') + ' text-[10px] w-3 h-3 flex items-center justify-center cursor-pointer hover:text-slate-700"></i>' : '<i class="w-3"></i>') +
        '<i class="' + (leaf ? 'pi pi-file text-slate-400' : 'pi pi-folder text-amber-500') + '"></i>' +
        '<span class="truncate flex-grow">' + esc(n.title) + '</span>' +
        (n.status && SB_DOT[n.status] ? '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + SB_DOT[n.status] + '"></span>' : '') +
      '</div>' +
      (!leaf && expanded ? '<div class="pl-3.5 space-y-0.5 mt-0.5 border-l border-slate-200 dark:border-slate-700 ml-2">' + n.children.map(nodeHtml).join('') + '</div>' : '') +
    '</div>';
  }
  function renderSidebar() {
    const el = document.getElementById('en-sidebar');
    const c = state.sidebarCollapsed;
    el.className = (c ? 'w-10' : 'w-64') + ' h-full min-h-0 overflow-hidden bg-white dark:bg-surface-card border-r border-slate-200 dark:border-border-subtle flex flex-col transition-all duration-200 shrink-0 select-none';
    el.setAttribute('data-report-hide', '');
    const scroll = el.querySelector('.sidebar-tree-scroll');
    const top = scroll ? scroll.scrollTop : 0;
    el.innerHTML =
      '<div class="p-2 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between shrink-0">' +
        (!c ? '<span class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate"><i class="pi pi-sitemap text-sky-600"></i><span>Lokasyon Ağacı</span></span>' : '') +
        '<button type="button" data-sb-toggle class="p-1 rounded-[2px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ml-auto transition-colors" title="' + (c ? 'Kenar çubuğunu aç' : 'Kenar çubuğunu kapat') + '">' +
          '<i class="' + (c ? 'pi pi-chevron-right' : 'pi pi-chevron-left') + ' text-xs"></i></button>' +
      '</div>' +
      (!c ? '<div class="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 text-xs select-none sidebar-tree-scroll">' + E.tree.map(nodeHtml).join('') + '</div>' : '');
    const ns = el.querySelector('.sidebar-tree-scroll');
    if (ns) ns.scrollTop = top;
  }
  document.getElementById('en-sidebar').addEventListener('click', e => {
    if (e.target.closest('[data-sb-toggle]')) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      renderSidebar();
      if (views[state.tab].resize) setTimeout(views[state.tab].resize, 220);
      return;
    }
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      e.stopPropagation();
      const id = tg.getAttribute('data-toggle');
      if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
      renderSidebar();
      return;
    }
    const nd = e.target.closest('[data-node]');
    if (nd) selectNode(NODE_MAP.get(nd.getAttribute('data-node')));
  });

  // handleNodeSelect karşılığı: düğümün eylemini (sekme/seçim) uygula
  function selectNode(n) {
    if (!n) return;
    let target = n;
    if (!n.go && n.children && n.children.length) {
      target = n.children.find(c => c.go) || n;
      state.collapsed.delete(n.id);
    }
    const go = target.go;
    if (!go) { state.collapsed.delete(n.id); renderSidebar(); return; }
    if (go.unavailable) {
      toast(target.title + ' şeması bu sunumda yer almıyor; IDC1 (Kat 1 / Salon 1) verileri gösteriliyor.', 'info', 'Enerji Genel Görünüm');
      return;
    }
    state.activeNodeId = target.id;
    state.pageTitle = target.title;
    if (go.ups) state.ups = go.ups;
    state.gen = go.gen || null;
    state.q = go.q || '';
    switchTab(go.tab, { keepNode: true });
  }

  // ---------------------------------------------------------------------------
  // Sekme çubuğu
  // ---------------------------------------------------------------------------
  function tabBadge(key) {
    const ups = E.ups(state.tick);
    if (key === 'ups') {
      const a = ups.filter(u => u.status === 'alarm').length;
      const w = ups.filter(u => u.status === 'warning' || u.status === 'lost').length;
      return (a ? '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30">' + a + '</span>' : '') +
        (w ? '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">' + w + '</span>' : '');
    }
    if (key === 'meters') {
      const w = E.energyAlarms().filter(a => a.deviceType === 'panel' && a.level === 'warning').length;
      return w ? '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30">' + w + '</span>' : '';
    }
    if (key === 'generator') {
      return '<span class="font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30">TEST</span>';
    }
    return '';
  }
  function renderTabs() {
    const tabCls = on => 'px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ' +
      (on ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent');
    document.getElementById('en-tabs').innerHTML =
      '<div class="flex items-center justify-between gap-2">' +
        '<div class="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900/70 p-0.5 rounded-[2px] border border-slate-200 dark:border-border-subtle overflow-x-auto">' +
          TABS.map(t => '<button type="button" data-tab="' + t.key + '" class="' + tabCls(state.tab === t.key) + '"><i class="' + t.icon + ' text-xs"></i><span>' + esc(t.label) + '</span>' + tabBadge(t.key) + '</button>').join('') +
        '</div>' +
        '<div class="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>CMR/T00 · Canlı telemetri</span>' +
          '<span class="text-slate-400">|</span><span id="en-last">Son güncelleme: ' + fmtTime(new Date()) + '</span>' +
        '</div>' +
      '</div>';
  }
  document.getElementById('en-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { state.q = ''; state.gen = null; switchTab(b.getAttribute('data-tab')); }
  });

  // ---------------------------------------------------------------------------
  // app-schematic-toolbar
  // ---------------------------------------------------------------------------
  function renderToolbar() {
    const site = D.site;
    const alarms = E.energyAlarms();
    const nA = alarms.filter(a => a.level === 'alarm').length;
    const nW = alarms.filter(a => a.level === 'warning').length;
    const ov = E.overview(state.tick);
    const btnCls = 'px-2.5 py-1 text-xs font-bold rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer';
    const tile = 'flex items-center gap-2 px-2 py-1 border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-[#0b121e] rounded-[2px]';
    document.getElementById('en-toolbar').innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-2.5 py-1.5 mb-1.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">' +
        '<div class="flex flex-wrap items-center gap-2.5">' +
          '<div class="flex items-center gap-1.5 mr-1"><i class="pi pi-map text-sky-600 dark:text-sky-400 font-bold text-sm"></i>' +
            '<span class="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-tight" id="en-page-title">' + esc(state.pageTitle) + '</span></div>' +
          '<div class="relative w-36 sm:w-44" data-report-hide>' +
            '<i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
            '<input type="text" id="en-search" value="' + esc(state.q) + '" placeholder="Şema içinde ara..." class="w-full pl-6 pr-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500" />' +
          '</div>' +
          '<button type="button" data-refresh title="Yenile" class="' + btnCls + '" data-report-hide><i class="pi pi-refresh text-xs"></i><span class="hidden sm:inline">Yenile</span></button>' +
          (state.tab === 'meters' ? '<button type="button" data-details class="px-2.5 py-1 text-xs font-bold rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer" data-report-hide>' + (state.details ? 'Detayları Gizle' : 'Detayları Göster') + '</button>' : '') +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2 text-xs">' +
          (nA || nW ? '<div class="flex items-center gap-1 mr-1">' +
            (nA ? '<span class="px-2 py-0.5 rounded-[2px] bg-rose-600 text-white font-mono font-bold text-[11px] flex items-center gap-1 shadow-xs" title="Aktif Alarmlar"><i class="pi pi-exclamation-circle text-[10px]"></i><span>' + nA + '</span></span>' : '') +
            (nW ? '<span class="px-2 py-0.5 rounded-[2px] bg-amber-500 text-white font-mono font-bold text-[11px] flex items-center gap-1 shadow-xs" title="Aktif Uyarılar"><i class="pi pi-exclamation-triangle text-[10px]"></i><span>' + nW + '</span></span>' : '') +
          '</div>' : '') +
          '<div class="relative group ' + tile + '"><i class="pi pi-sun text-amber-500 font-bold text-xs"></i>' +
            '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-bold uppercase block leading-none">Dış Ortam</span>' +
            '<span class="font-mono font-black text-slate-900 dark:text-slate-100 text-xs">' + esc(site.outdoor[0].val) + ' ' + esc(site.outdoor[0].unit) + '</span></div>' +
            '<div class="absolute top-full right-0 mt-1 hidden group-hover:block bg-slate-900 text-slate-100 text-xs p-2 rounded-[2px] shadow-xl border border-slate-700 z-50 min-w-48">' +
              '<table class="w-full text-left text-[11px]"><thead><tr class="border-b border-slate-700 text-slate-400"><th class="py-1">Parametre</th><th class="py-1 text-right">Değer</th></tr></thead><tbody>' +
              site.outdoor.map(o => '<tr class="border-b border-slate-800"><td class="py-1">' + esc(o.desc) + '</td><td class="py-1 text-right font-bold">' + esc(o.val) + (o.unit ? ' ' + esc(o.unit) : '') + '</td></tr>').join('') +
              '</tbody></table></div>' +
          '</div>' +
          '<div class="' + tile + '"><div class="relative w-7 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-7 h-4">' +
            '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 24 6" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" />' +
            '<path d="M 24 6 A 16 16 0 0 1 36 20" fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="13" y2="9" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#10b981" /></svg></div>' +
            '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık PUE</span><span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs" id="en-tb-pue">' + fnum(ov.pue, 2) + '</span></div>' +
          '</div>' +
          '<div class="' + tile + '"><div class="relative w-7 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-7 h-4">' +
            '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="#0284c7" stroke-width="4" stroke-linecap="round" />' +
            '<path d="M 20 4 A 16 16 0 0 1 36 20" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="11" y2="11" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#0284c7" /></svg></div>' +
            '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık CUE</span><span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs">' + fnum(site.cue || 0, 2) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  const toolbarEl = document.getElementById('en-toolbar');
  toolbarEl.addEventListener('input', e => {
    if (e.target.id !== 'en-search') return;
    state.q = e.target.value;
    const ms = document.getElementById('m-search');
    if (ms && ms !== e.target) ms.value = state.q;
    views[state.tab].update();
  });
  toolbarEl.addEventListener('click', e => {
    const r = e.target.closest('[data-refresh]');
    if (r) {
      const i = r.querySelector('i');
      i.classList.add('pi-spin');
      setTimeout(() => i.classList.remove('pi-spin'), 600);
      liveTick();
      return;
    }
    if (e.target.closest('[data-details]')) {
      state.details = !state.details;
      renderToolbar();
      views.meters.update();
    }
  });

  // ---------------------------------------------------------------------------
  // SCADA durum sınıfları (rectifier/ups getStatusClass)
  // ---------------------------------------------------------------------------
  const STATUS_CLASS = { NORMAL: 'sta-v-normal', UYARI: 'sta-v-uyari', ALARM: 'sta-v-alarm', 'ESKİ': 'sta-v-eski', BILINMEYEN: 'sta-v-disabled', 'DEVREDIŞI': 'sta-v-disabled', 'BAĞLANAMADI': 'sta-v-disabled' };
  const getStatusClass = s => (!s ? '' : STATUS_CLASS[s] || 'sta-v-disabled');

  // ===========================================================================
  // 1) GENEL BAKIŞ
  // ===========================================================================
  const TILE_BORDER = {
    alarm: 'border-rose-500/60 bg-rose-500/5 dark:bg-rose-500/10',
    warning: 'border-amber-500/60 bg-amber-500/5 dark:bg-amber-500/10',
    lost: 'border-orange-500/60 bg-orange-500/5 dark:bg-orange-500/10',
    normal: 'border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel'
  };
  const DOT = { alarm: 'bg-rose-500 animate-pulse', warning: 'bg-amber-500', lost: 'bg-orange-500', normal: 'bg-emerald-500' };

  function kpiCard(label, icon, iconCls, value, unit, unitCls, sub, extra) {
    return '<div class="' + CARD + ' p-3">' +
      '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1"><span>' + esc(label) + '</span><i class="' + icon + ' ' + iconCls + ' text-xs"></i></div>' +
      '<div class="flex items-baseline gap-1.5"><span class="text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100">' + value + '</span>' +
        (unit ? '<span class="text-xs font-bold ' + unitCls + '">' + esc(unit) + '</span>' : '') + '</div>' +
      (extra || '') +
      '<span class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block truncate">' + sub + '</span>' +
    '</div>';
  }

  // Akış şeması düğümü (SVG). data-fv/data-fs: canlı değer/alt metin güncelleme kancaları
  function flowNode(id, x, y, w, h, title) {
    const big = h >= 56;
    return '<g>' +
      '<rect class="n-box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" />' +
      '<rect data-fst="' + id + '" class="dot-normal" x="' + x + '" y="' + y + '" width="3" height="' + h + '" rx="1" />' +
      '<circle data-fdot="' + id + '" class="dot-normal" cx="' + (x + w - 10) + '" cy="' + (y + 11) + '" r="3.5" />' +
      '<text class="n-title" x="' + (x + 11) + '" y="' + (y + (big ? 16 : 14)) + '">' + esc(title) + '</text>' +
      '<text class="n-val" data-fv="' + id + '" x="' + (x + 11) + '" y="' + (y + (big ? 36 : 31)) + '">-</text>' +
      '<text class="n-sub" data-fs="' + id + '" x="' + (x + 11) + '" y="' + (y + (big ? 50 : 44)) + '"></text>' +
    '</g>';
  }
  function flowLine(d, id) {
    return '<path class="ln-base" d="' + d + '" /><path data-fl="' + id + '" class="ln-flow" d="' + d + '" />';
  }
  function flowSvg() {
    const row = (side, y) => {
      const s = side.toLowerCase();
      const cy = y + 29;
      return flowLine('M 130 ' + cy + ' L 170 ' + cy, s + '-l1') + flowLine('M 290 ' + cy + ' L 330 ' + cy, s + '-l2') +
        flowLine('M 450 ' + cy + ' L 490 ' + cy, s + '-l3') + flowLine('M 620 ' + cy + ' L 670 ' + cy, s + '-l4') +
        flowLine('M 820 ' + cy + ' L 860 ' + cy, s + '-l5') +
        flowNode(s + '-grid', 10, y, 120, 58, 'Şebeke ' + side) +
        flowNode(s + '-tr', 170, y, 120, 58, side === 'A' ? 'TR-1 Trafo' : 'TR-2 Trafo') +
        flowNode(s + '-ats', 330, y, 120, 58, 'ATS-' + side) +
        flowNode(s + '-dist', 490, y, 130, 58, side === 'A' ? 'SYNC. Dağıtım' : 'BD. Dağıtım') +
        flowNode(s + '-ups', 670, y, 150, 58, 'UPS ' + side + '1–' + side + '7') +
        flowNode(s + '-it', 860, y, 130, 58, 'BT Yükü ' + side);
    };
    return '<svg viewBox="0 0 1000 330" class="en-flow-svg" preserveAspectRatio="xMidYMid meet">' +
      '<text class="lane" x="10" y="16">A KOLU · TR-1</text>' +
      '<text class="lane" x="10" y="324">B KOLU · TR-2</text>' +
      // A: jeneratör ve klima kolları
      flowLine('M 390 84 L 390 104', 'a-gen') + flowLine('M 555 84 L 555 129 L 670 129', 'a-cool') +
      // B: jeneratör ve klima kolları
      flowLine('M 390 246 L 390 226', 'b-gen') + flowLine('M 555 246 L 555 201 L 670 201', 'b-cool') +
      row('A', 26) + row('B', 246) +
      flowNode('a-genbox', 330, 104, 120, 50, 'Jeneratör A') + flowNode('a-coolbox', 670, 104, 150, 50, 'Klima Panoları A') +
      flowNode('b-genbox', 330, 176, 120, 50, 'Jeneratör B') + flowNode('b-coolbox', 670, 176, 150, 50, 'Klima Panoları B') +
      flowNode('aux', 860, 140, 130, 50, 'Aydınlatma') +
      flowLine('M 620 55 L 640 55 L 640 165 L 860 165', 'aux-l') +
    '</svg>';
  }

  const views = {};
  views.overview = {
    mount(el) {
      el.innerHTML =
        '<div class="h-full overflow-y-auto px-2 pb-3 space-y-2" id="ov-root">' +
          '<div class="grid grid-cols-2 md:grid-cols-5 gap-2 shrink-0" id="ov-kpi"></div>' +
          '<div class="grid grid-cols-1 xl:grid-cols-12 gap-2">' +
            '<div class="xl:col-span-8 ' + CARD + ' p-3 flex flex-col">' +
              '<div class="flex items-center justify-between mb-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">' +
                '<div class="flex items-center gap-2"><i class="pi pi-share-alt text-sky-600 dark:text-sky-400 text-sm"></i>' +
                  '<div><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">Enerji Akış Özeti</h3>' +
                  '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">IDC1 · Kat 1 Enerji Tek Hat (özet) — şebeke → trafo → ATS → dağıtım → UPS → BT</p></div></div>' +
                '<div class="flex items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400">' +
                  '<span class="flex items-center gap-1"><span class="w-3 h-0.5 bg-emerald-500"></span>Enerji akışı</span>' +
                  '<span class="flex items-center gap-1"><span class="w-3 h-0.5 border-t border-dashed border-slate-400"></span>Beklemede</span>' +
                '</div>' +
              '</div>' +
              '<div class="flex-1 flex items-center" id="ov-flow">' + flowSvg() + '</div>' +
            '</div>' +
            '<div class="xl:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-2 content-start" id="ov-sources"></div>' +
          '</div>' +
          '<div class="grid grid-cols-1 xl:grid-cols-12 gap-2">' +
            '<div class="xl:col-span-8 ' + CARD + ' p-3" id="ov-ups"></div>' +
            '<div class="xl:col-span-4 ' + CARD + ' p-3" id="ov-alarms"></div>' +
          '</div>' +
        '</div>';
      el.addEventListener('click', this.onClick);
    },
    onClick(e) {
      const t = e.target.closest('[data-go-ups]');
      if (t) { state.ups = t.getAttribute('data-go-ups'); state.q = ''; switchTab('ups'); return; }
      const g = e.target.closest('[data-go-tab]');
      if (g) { state.q = ''; state.gen = g.getAttribute('data-go-gen') || null; switchTab(g.getAttribute('data-go-tab')); }
    },
    unmount(el) { el.removeEventListener('click', this.onClick); },
    update() {
      const o = E.overview(state.tick);
      const ups = E.ups(state.tick);
      const pctIt = o.itKw / o.facilityKw * 100, pctCool = o.coolKw / o.facilityKw * 100, pctAux = 100 - pctIt - pctCool;

      // KPI kartları
      document.getElementById('ov-kpi').innerHTML =
        kpiCard('PUE (Anlık)', 'pi pi-gauge', 'text-emerald-500', fnum(o.pue, 2), '', '', 'Tesis gücü / BT gücü (UPS girişleri)',
          '<div class="mt-1.5 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style="width:' + Math.min(100, (2 - o.pue) * 100).toFixed(0) + '%"></div></div>') +
        kpiCard('Toplam Tesis Gücü', 'pi pi-bolt', 'text-amber-500', fnum(o.facilityKw, 1), 'kW', 'text-amber-500', 'Şebeke A + B (TR-1 / TR-2)',
          '<div class="mt-1.5 w-full h-1.5 rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-700" title="BT / Soğutma / Yardımcı">' +
            '<div class="h-full bg-sky-500" style="width:' + pctIt.toFixed(1) + '%"></div><div class="h-full bg-cyan-400" style="width:' + pctCool.toFixed(1) + '%"></div><div class="h-full bg-purple-500" style="width:' + Math.max(0, pctAux).toFixed(1) + '%"></div></div>') +
        kpiCard('BT Yükü', 'pi pi-server', 'text-sky-500', fnum(o.itKw, 1), 'kW', 'text-sky-500', '%' + fnum(pctIt, 0) + ' · 13/14 UPS şebekeden besleniyor') +
        kpiCard('Soğutma', 'pi pi-cloud', 'text-cyan-500', fnum(o.coolKw, 1), 'kW', 'text-cyan-500', '%' + fnum(pctCool, 0) + ' · 7 klima panosu') +
        kpiCard('Aydınlatma / Yardımcı', 'pi pi-lightbulb', 'text-purple-500', fnum(o.auxKw, 1), 'kW', 'text-purple-400', '%' + fnum(Math.max(0, pctAux), 0) + ' · Analizor-4');

      // Akış şeması canlı değerleri
      const svg = document.querySelector('#ov-flow svg');
      const setN = (id, val, sub, st, subCls) => {
        const v = svg.querySelector('[data-fv="' + id + '"]'); if (v) v.textContent = val;
        const s = svg.querySelector('[data-fs="' + id + '"]'); if (s) { s.textContent = sub || ''; s.setAttribute('class', 'n-sub' + (subCls ? ' ' + subCls : '')); }
        const cls = 'dot-' + (st || 'normal');
        const a = svg.querySelector('[data-fst="' + id + '"]'); if (a) a.setAttribute('class', cls);
        const d = svg.querySelector('[data-fdot="' + id + '"]'); if (d) d.setAttribute('class', cls);
      };
      const setL = (id, mode) => { const l = svg.querySelector('[data-fl="' + id + '"]'); if (l) l.setAttribute('class', mode === 'idle' ? 'ln-idle' : 'ln-flow' + (mode === 'warn' ? ' f-warn' : '')); };
      ['A', 'B'].forEach((side, i) => {
        const s = side.toLowerCase();
        const g = o.grids[i];
        const gen = o.gens[i];
        const grp = side === 'A' ? o.upsA : o.upsB;
        const coolKw = side === 'A' ? o.coolA : o.coolB;
        const itSide = ups.filter(u => u.code.charAt(0) === side);
        const upsSt = grp.alarm ? 'alarm' : grp.warning ? 'warning' : grp.lost ? 'lost' : 'normal';
        setN(s + '-grid', fnum(g.voltage, 0) + ' V', fnum(g.freq, 2) + ' Hz · ŞEBEKEDE');
        setN(s + '-tr', fnum(g.kw, 0) + ' kW', 'Aktif güç');
        setN(s + '-ats', 'ŞEBEKE', 'Jeneratör: ' + (gen.running ? 'test' : 'hazır'));
        setN(s + '-dist', fnum(g.kw, 0) + ' kW', side === 'A' ? 'SYNC. Analizor' : 'BD. Analizor');
        const subU = grp.battery.length ? grp.battery.map(x => x.replace('UPS ', '')).join(', ') + ' akü modunda'
          : grp.lost ? grp.lost + ' SNMP kaybı · ' + grp.warning + ' uyarı' : grp.warning ? grp.warning + ' uyarı' : grp.count + ' UPS normal';
        setN(s + '-ups', fnum(itSide.reduce((x, u) => x + (u.mode === 'battery' ? 0 : (u.load || 0) * 0.8 / 0.955), 0), 0) + ' kW', subU, upsSt, upsSt === 'alarm' ? 't-alarm' : upsSt === 'normal' ? '' : 't-warning');
        setN(s + '-it', fnum(grp.outKw, 0) + ' kW', 'UPS çıkışı');
        setN(s + '-genbox', gen.running ? fnum(gen.rpm, 0) + ' RPM' : 'HAZIR', gen.running ? 'Test · yüksüz' : 'Otomatik', gen.running ? 'warning' : 'idle');
        const coolWarn = side === 'A' && o.coolWarn.length;
        setN(s + '-coolbox', fnum(coolKw, 1) + ' kW', coolWarn ? 'A1 KLIMA PANOSU faz dengesizliği' : 'Normal', coolWarn ? 'warning' : 'normal', coolWarn ? 't-warning' : '');
        ['l1', 'l2', 'l3', 'l4', 'l5'].forEach(k => setL(s + '-' + k, 'flow'));
        setL(s + '-gen', 'idle');
        setL(s + '-cool', coolWarn ? 'warn' : 'flow');
      });
      setN('aux', fnum(o.auxKw, 1) + ' kW', 'Analizor-4');
      setL('aux-l', 'flow');

      // Şebeke / Jeneratör durum kartları
      const src = (title, icon, badge, rows, note, tab, gen) =>
        '<div class="' + CARD + ' p-3 cursor-pointer hover:border-sky-500/50 transition-colors" data-go-tab="' + tab + '"' + (gen ? ' data-go-gen="' + gen + '"' : '') + '>' +
          '<div class="flex items-center justify-between gap-2 mb-2">' +
            '<div class="flex items-center gap-2 min-w-0"><div class="w-7 h-7 rounded-[2px] bg-sky-600/15 text-sky-500 flex items-center justify-center text-xs shrink-0"><i class="' + icon + '"></i></div>' +
            '<span class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(title) + '</span></div>' + badge +
          '</div>' +
          '<div class="grid grid-cols-3 gap-1.5 font-mono text-[11px]">' + rows.map(r =>
            '<div class="bg-slate-50 dark:bg-surface-panel p-1.5 rounded-[2px] border border-slate-200 dark:border-slate-800 text-center">' +
              '<span class="text-[9px] text-slate-400 block font-sans">' + esc(r[0]) + '</span><span class="font-bold text-slate-900 dark:text-slate-100">' + r[1] + '</span></div>').join('') +
          '</div>' +
          '<span class="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 block truncate">' + esc(note) + '</span>' +
        '</div>';
      document.getElementById('ov-sources').innerHTML =
        o.grids.map(g => src('Şebeke ' + g.side, 'pi pi-bolt', statusBadge('normal', 'ŞEBEKEDE'),
          [['Gerilim', fnum(g.voltage, 0) + ' V'], ['Frekans', fnum(g.freq, 2) + ' Hz'], ['Güç', fnum(g.kw, 0) + ' kW']], 'Kaynak: ' + (g.side === 'A' ? 'TR-1' : 'TR-2') + ' · ATS-' + g.side + ' şebeke konumunda', 'meters')).join('') +
        o.gens.map(g => src('Jeneratör ' + g.side, 'pi pi-cog', g.running ? statusBadge('info', 'TEST') : statusBadge('normal', 'HAZIR'),
          [['Devir', fnum(g.rpm, 0) + ' RPM'], ['Yakıt', '%' + fnum(g.fuel, 0)], ['Su', fnum(g.water, 0) + ' °C']], g.modeNote + ' · ' + fnum(g.runHours, 1) + ' saat', 'generator', g.side)).join('');

      // UPS durum özeti
      const tiles = ups.filter(u => matchQ(u.name));
      document.getElementById('ov-ups').innerHTML =
        '<div class="flex items-center justify-between mb-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">' +
          '<div class="flex items-center gap-2"><i class="pi pi-shield text-sky-600 dark:text-sky-400 text-sm"></i><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">UPS Durum Özeti</h3></div>' +
          '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">' + ups.filter(u => u.status === 'normal').length + ' / ' + ups.length + ' normal · UPS Paneli için tıklayın</span>' +
        '</div>' +
        (tiles.length ? '<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">' + tiles.map(u => {
          const loadCls = u.load > 80 ? 'from-amber-600 to-amber-400' : 'from-emerald-500 to-teal-400';
          return '<button type="button" data-go-ups="' + esc(u.code) + '" class="text-left p-2 rounded-[2px] border transition-colors cursor-pointer hover:border-sky-500 ' + TILE_BORDER[u.status] + '">' +
            '<div class="flex items-center justify-between gap-1"><span class="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">' + esc(u.name) + '</span><span class="w-2 h-2 rounded-full ' + DOT[u.status] + '"></span></div>' +
            '<span class="text-[9px] font-bold block mt-0.5 ' + (u.mode === 'battery' ? 'text-rose-600 dark:text-rose-400' : u.mode === 'lost' ? 'text-orange-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400') + '">' + esc(u.modeLabel) + '</span>' +
            '<div class="mt-1 w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ' + loadCls + ' rounded-full" style="width:' + (u.load || 0) + '%"></div></div>' +
            '<div class="flex justify-between text-[10px] font-mono mt-1 text-slate-600 dark:text-slate-300"><span>' + (u.load == null ? '-' : '%' + u.load) + '</span><span>' + (u.runtime == null ? '-' : u.runtime + ' dk') + '</span></div>' +
          '</button>';
        }).join('') + '</div>' : kit.emptyState({ message: 'Aramaya uygun UPS bulunamadı', compact: true }));

      // Enerji alarmları
      const al = E.energyAlarms();
      document.getElementById('ov-alarms').innerHTML =
        '<div class="flex items-center justify-between mb-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">' +
          '<div class="flex items-center gap-2"><i class="pi pi-exclamation-triangle text-rose-500 text-sm"></i><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">Enerji Grubu Alarmları</h3></div>' +
          '<a href="alarms.html" class="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">Tümü <i class="pi pi-arrow-right text-[9px]"></i></a>' +
        '</div>' +
        '<div class="space-y-1.5">' + al.map(a => {
          const code = String(a.target || '').replace(/^UPS\s*/i, '');
          const isUps = a.deviceType === 'ups' && E.upsCodes.indexOf(code) >= 0;
          return '<div class="flex items-start gap-2 p-1.5 rounded-[2px] bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-slate-800' + (isUps ? ' cursor-pointer hover:border-sky-500/50' : ' cursor-pointer hover:border-sky-500/50') + '"' + (isUps ? ' data-go-ups="' + esc(code) + '"' : ' data-go-tab="meters"') + '>' +
            '<div class="shrink-0 pt-0.5">' + statusBadge(a.level) + '</div>' +
            '<div class="min-w-0 flex-1"><div class="flex items-center justify-between gap-2"><span class="text-[11px] font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(a.desc) + '</span>' +
              '<span class="text-[9px] font-mono text-slate-400 shrink-0">' + fmtTime(a.tim) + '</span></div>' +
              '<p class="text-[10px] text-slate-500 dark:text-slate-400 truncate" title="' + esc(a.txt) + '">' + esc(a.txt) + '</p></div>' +
          '</div>';
        }).join('') + '</div>';
    }
  };

  // ===========================================================================
  // 2) REDRESÖR PANELİ (rectifier-dashboard.component.html)
  // ===========================================================================
  views.rectifier = {
    mount(el) {
      el.innerHTML = '<div class="h-full flex flex-col overflow-y-auto p-4 pt-1 space-y-4 font-sans select-none bg-slate-50 dark:bg-surface-base text-slate-800 dark:text-slate-100" id="rc-root"></div>';
    },
    update() {
      const list = E.rectifiers(state.tick);
      const r0 = list[0];
      const kpi = (label, icon, body, sub, subCls) =>
        '<div class="' + CARD + ' p-3">' +
          '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1"><span>' + label + '</span>' + icon + '</div>' +
          '<div class="flex items-baseline gap-1.5">' + body + '</div>' +
          '<span class="text-[10px] ' + subCls + ' mt-1 block">' + sub + '</span></div>';
      const cards = list.filter(r => matchQ(r.name + ' ' + r.place + ' ' + r.modules.map(m => m.id).join(' '))).map(r => {
        const modules = r.modules.map(m => {
          const on = m.status === 'NORMAL';
          return '<div class="bg-white dark:bg-slate-900 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 text-center">' +
            '<div class="flex items-center justify-center gap-1 text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400"><span class="w-1.5 h-1.5 rounded-full ' + (on ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + esc(m.id) + '</div>' +
            '<span class="font-bold block ' + (on ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400') + '">' + fx(m.current, 1) + ' A</span>' +
            '<span class="text-[9px] font-sans font-bold block ' + (on ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400') + '">' + (on ? 'AKTİF' : 'BEKLEMEDE') + '</span>' +
            '<span class="text-[9px] block text-slate-400">' + fx(m.temp, 0) + ' °C</span>' +
          '</div>';
        }).join('');
        return '<div class="' + CARD + ' overflow-hidden flex flex-col">' +
          '<div class="px-4 py-3 bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-border-subtle flex items-center justify-between">' +
            '<div class="flex items-center gap-2.5">' +
              '<div class="w-8 h-8 rounded-[2px] bg-sky-600/15 text-sky-500 flex items-center justify-center font-bold text-sm"><i class="pi pi-sliders-h"></i></div>' +
              '<div><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(r.name) + '</h3>' +
              '<p class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Telekom DC Güç Besleme Ünitesi · ' + esc(r.place) + '</p></div>' +
            '</div>' +
            '<div class="flex items-center gap-2"><span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">ONLINE</span></div>' +
          '</div>' +
          '<div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">' +
            // AC Kaynağı
            '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-slate-800 rounded-[2px] space-y-2">' +
              '<div class="flex items-center justify-between font-bold text-[11px] text-sky-600 dark:text-sky-400 pb-1.5 border-b border-slate-200 dark:border-slate-700">' +
                '<span class="flex items-center gap-1.5"><i class="pi pi-bolt"></i> AC Kaynağı</span><span class="font-mono text-slate-700 dark:text-slate-300">' + fx(r.averageAcVoltage.value, 2) + ' V</span></div>' +
              '<div class="space-y-1.5 font-mono text-[11px]">' + r.acInput.map(ac =>
                '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400 font-sans">Faz ' + esc(ac.phase) + ' Gerilimi:</span>' +
                '<div class="flex items-center gap-1"><span class="font-bold text-slate-900 dark:text-slate-100">' + fx(ac.voltage.value, 2) + ' V</span><span class="w-2 h-2 rounded-full bg-emerald-500"></span></div></div>').join('') +
              '</div>' +
            '</div>' +
            // DC Yük
            '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-slate-800 rounded-[2px] space-y-2">' +
              '<div class="flex items-center justify-between font-bold text-[11px] text-amber-600 dark:text-amber-400 pb-1.5 border-b border-slate-200 dark:border-slate-700">' +
                '<span class="flex items-center gap-1.5"><i class="pi pi-chart-line"></i> Yük</span><span class="font-mono text-slate-700 dark:text-slate-300">48V DC</span></div>' +
              '<div class="space-y-1.5 font-mono text-[11px]">' +
                '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400 font-sans">Yük Gerilimi:</span><span class="font-bold text-slate-900 dark:text-slate-100">' + fx(r.loadVoltage.value, 2) + ' V</span></div>' +
                '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400 font-sans">Yük Akımı:</span><span class="font-bold text-amber-600 dark:text-amber-400">' + fx(r.loadCurrent.value, 2) + ' A</span></div>' +
                '<div class="flex items-center justify-between"><span class="text-slate-500 dark:text-slate-400 font-sans">Doğrultucu Çıkış:</span><span class="font-bold text-emerald-600 dark:text-emerald-400">' + fx(r.outputCurrent.value, 2) + ' A</span></div>' +
              '</div>' +
            '</div>' +
            // Aküler
            '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-slate-800 rounded-[2px] space-y-2 col-span-1 md:col-span-2">' +
              '<div class="flex items-center justify-between font-bold text-[11px] text-emerald-600 dark:text-emerald-400 pb-1.5 border-b border-slate-200 dark:border-slate-700">' +
                '<span class="flex items-center gap-1.5"><i class="pi pi-shield"></i> Aküler (Akü Grubu)</span><span class="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold">%' + fx(r.capacity.value, 0) + '</span></div>' +
              '<div class="space-y-1"><div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono"><span>Akü Doluluk Seviyesi</span><span>%' + fx(r.capacity.value, 0) + ' Kapasite</span></div>' +
                '<div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style="width:' + (r.capacity.value || 95) + '%"></div></div></div>' +
              '<div class="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">' +
                '<div class="bg-white dark:bg-slate-900 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 text-center"><span class="text-[10px] text-slate-400 block font-sans">Akü Gerilimi</span><span class="font-bold text-slate-900 dark:text-slate-100">' + fx(r.batteryVoltage.value, 2) + ' V</span></div>' +
                '<div class="bg-white dark:bg-slate-900 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 text-center"><span class="text-[10px] text-slate-400 block font-sans">Akü Sıcaklığı</span><span class="font-bold text-sky-600 dark:text-sky-400">' + fx(r.batteryTemp.value, 2) + ' °C</span></div>' +
                '<div class="bg-white dark:bg-slate-900 p-2 rounded-[2px] border border-slate-200 dark:border-slate-800 text-center"><span class="text-[10px] text-slate-400 block font-sans">Kalan Çalışma</span><span class="font-bold text-purple-500">' + fx(r.batteryRuntime.value, 2) + ' Saat</span></div>' +
              '</div>' +
            '</div>' +
            // Sunum eki: doğrultucu modül durumları (aynı bölüm stili)
            '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-slate-800 rounded-[2px] space-y-2 col-span-1 md:col-span-2">' +
              '<div class="flex items-center justify-between font-bold text-[11px] text-purple-600 dark:text-purple-400 pb-1.5 border-b border-slate-200 dark:border-slate-700">' +
                '<span class="flex items-center gap-1.5"><i class="pi pi-th-large"></i> Doğrultucu Modülleri</span><span class="font-mono text-slate-700 dark:text-slate-300">' + r.activeModules + ' / ' + r.modules.length + ' aktif · N+1</span></div>' +
              '<div class="grid grid-cols-3 md:grid-cols-6 gap-2 font-mono text-[11px]">' + modules + '</div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
      document.getElementById('rc-root').innerHTML =
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">' +
          kpi('AC Giriş Gerilimi', '<i class="pi pi-bolt text-sky-500 text-xs"></i>', '<span class="text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100">' + fx(r0.averageAcVoltage.value, 2) + '</span><span class="text-xs font-bold text-sky-500">V AC</span>', '3-Faz Nominal', 'text-emerald-600 dark:text-emerald-400') +
          kpi('DC Yük Gerilimi', '<i class="pi pi-sliders-h text-amber-500 text-xs"></i>', '<span class="text-xl font-extrabold font-mono text-slate-900 dark:text-slate-100">' + fx(r0.loadVoltage.value, 2) + '</span><span class="text-xs font-bold text-amber-500">V DC</span>', '48V DC Busbar · ' + fx(list.reduce((s, r) => s + r.loadCurrent.value, 0), 1) + ' A toplam yük', 'text-slate-500 dark:text-slate-400') +
          kpi('Akü Kapasitesi', '<i class="pi pi-shield text-emerald-500 text-xs"></i>', '<span class="text-xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">%' + fx(r0.capacity.value, 0) + '</span><span class="text-xs text-slate-400 font-mono">/ %100</span>', 'Tam Dolu (Float)', 'text-emerald-600 dark:text-emerald-400') +
          kpi('Sistem Durumu', '<i class="pi pi-check-circle text-emerald-500 text-xs"></i>', '<span class="text-xs font-extrabold px-2 py-0.5 rounded-[2px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">NORMAL ÇALIŞIYOR</span>', 'Aktif Redresör Modu', 'text-slate-500 dark:text-slate-400') +
        '</div>' +
        (cards ? '<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">' + cards + '</div>' : kit.emptyState({ message: 'Aramaya uygun redresör bulunamadı' }));
    }
  };

  // ===========================================================================
  // 3) UPS PANELİ (ups-dashboard.component.html/.scss/.ts)
  // ===========================================================================
  const PHASE_COLS = ['A', 'B', 'C'];
  const ROWS_VA = [{ label: 'Gerilim', key: 'v', unit: 'V' }, { label: 'Akım', key: 'a', unit: 'A' }];
  const upsFmt = (val, d) => (!val || val.value === undefined || val.value === '-' ? '-' : isNaN(parseFloat(val.value)) ? val.value : parseFloat(val.value).toFixed(d == null ? 1 : d));
  const ICONS_HTML =
    '<div class="comp-icon i-1"><svg viewBox="20 20 60 60" class="svg-primary" fill="none" stroke-linecap="round"><path d="M 25 50 C 35 25, 65 75, 75 50" /></svg></div>' +
    '<div class="comp-icon i-2"><svg viewBox="20 20 60 60" class="svg-primary" fill="none" stroke-linecap="round"><path d="M 25 50 C 35 25, 65 75, 75 50" /></svg></div>' +
    '<div class="comp-icon i-3"><svg viewBox="0 0 100 100" class="svg-primary" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M 85 15 L 15 85" /><path d="M 20 30 L 50 30" /><path d="M 20 42 L 50 42" /><path d="M 50 65 C 57 48 74 82 82 65" /></svg></div>' +
    '<div class="comp-icon i-4"><svg viewBox="0 0 100 100" class="svg-primary" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g transform="rotate(180 50 50)"><path d="M 85 15 L 15 85" /><path d="M 20 30 L 50 30" /><path d="M 20 42 L 50 42" /><path d="M 50 65 C 57 48 74 82 82 65" /></g></svg></div>' +
    '<div class="comp-icon i-5"><svg viewBox="5 5 90 90" class="svg-primary" fill="none" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(10, 10)"><path d="M 6.14 20.804 C 13.14 3.804 37.14 37.804 44.14 20.804" /><path d="M 78.515 1.758 L 1.456 78.403" /><path d="M 35.528 56.498 C 42.528 39.498 66.528 73.498 73.528 56.498" /></g></svg></div>' +
    '<div class="comp-icon i-6"><svg viewBox="0 0 100 100" class="svg-primary" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M 75 51 L 25 36" /><circle cx="34" cy="32" r="6" /><circle cx="70" cy="43" r="6" /><path d="M 50 44 L 68 75 L 32 75 Z" /></svg></div>';

  function phaseTable(title, prefix, vals, bold) {
    return '<table class="scada-table"><thead><tr><th class="text-left">' + esc(title) + '</th>' + PHASE_COLS.map(p => '<th>' + p + '</th>').join('') + '</tr></thead><tbody>' +
      ROWS_VA.map(row => '<tr><td class="label">' + row.label + '</td>' + ['a', 'b', 'c'].map(p => {
        const v = vals[prefix + '_' + row.key + '_' + p];
        return '<td><span class="' + getStatusClass(v && v.status) + (bold ? ' font-bold' : '') + '">' + upsFmt(v) + '<span class="unit">' + row.unit + '</span></span></td>';
      }).join('') + '</tr>').join('') +
      '</tbody></table>';
  }
  const rowVal = (label, v, unit, d) => '<div class="row-val"><span class="label">' + esc(label) + '</span><div class="flex flex-col items-end"><span class="' + getStatusClass(v && v.status) + '">' + upsFmt(v, d) + '<span class="unit">' + esc(unit) + '</span></span></div></div>';

  views.ups = {
    ro: null,
    renderedFor: null,
    mount(el) {
      el.innerHTML =
        '<div class="h-full flex flex-col min-h-0">' +
          '<div class="shrink-0 px-2 pb-1.5" id="ups-sub" data-report-hide></div>' +
          '<div class="flex-1 min-h-0 relative overflow-hidden" id="ups-parent"><div class="ups-host" id="ups-host"></div></div>' +
        '</div>';
      this.renderedFor = null;
      el.querySelector('#ups-sub').addEventListener('click', e => {
        const b = e.target.closest('[data-ups]');
        if (!b) return;
        state.ups = b.getAttribute('data-ups');
        state.activeNodeId = 'UPS-' + state.ups;
        state.pageTitle = 'UPS ' + state.ups;
        document.getElementById('en-page-title').textContent = state.pageTitle;
        renderSidebar();
        syncUrl();
        this.update();
      });
      const parent = el.querySelector('#ups-parent');
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(parent);
      }
    },
    unmount() { if (this.ro) { this.ro.disconnect(); this.ro = null; } },
    // handleScaling: Math.min(scaleX, scaleY) * 0.94
    resize() {
      const parent = document.getElementById('ups-parent');
      const box = document.getElementById('ups-box');
      if (!parent || !box) return;
      const w = parent.clientWidth || window.innerWidth;
      const h = parent.clientHeight || window.innerHeight;
      const scale = Math.min(w / 1400, h / 900) * 0.94;
      box.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
    },
    skeleton(code) {
      document.getElementById('ups-host').innerHTML =
        '<div class="ups-dashboard-wrapper show-dots" id="ups-wrap"><div class="centering-container"><div class="scaling-box" id="ups-box">' +
          [1, 2, 3, 4, 5, 6, 7, 8].map(i => '<div class="cable cable-' + i + '" data-cable="' + i + '"></div>').join('') +
          ICONS_HTML +
          '<div class="batt-park-wrap"><div class="batt-visual"><div class="batt-t">-</div><div class="batt-body"><div class="batt-fill" id="ups-bfill"></div></div><div class="batt-t">+</div></div><div class="batt-label">AKÜ GRUBU</div></div>' +
          '<div class="ups-title" id="ups-title"></div>' +
          '<div class="ups-banner" id="ups-banner" style="display:none"></div>' +
          '<div class="status-badge" id="ups-sbadge"></div>' +
          '<div class="data-card table-bypass" id="ups-c-bypass"></div>' +
          '<div class="data-card table-main" id="ups-c-main"></div>' +
          '<div class="data-card table-battery" id="ups-c-batt"></div>' +
          '<div class="data-card table-output" id="ups-c-out"></div>' +
        '</div></div></div>';
      this.renderedFor = code;
      this.resize();
    },
    update() {
      const list = E.ups(state.tick);
      const ups = list.find(u => u.code === state.ups) || list[0];
      // Alt menü (schemaMenuConfigMap "UPS" butonları)
      const chips = list.filter(u => matchQ(u.name) || u.code === ups.code);
      document.getElementById('ups-sub').innerHTML =
        '<div class="' + CARD + ' px-2.5 py-1.5 flex items-center gap-2">' +
          '<span class="text-xs font-extrabold text-slate-700 dark:text-slate-200 shrink-0 flex items-center gap-1.5 mr-1"><i class="pi pi-shield text-sky-600"></i>UPS</span>' +
          '<div class="en-subtabs flex items-center gap-1.5 overflow-x-auto pb-0.5">' + chips.map(u => {
            const on = u.code === ups.code;
            return '<button type="button" data-ups="' + esc(u.code) + '" class="px-2.5 py-1 text-[11px] font-bold rounded-[2px] border flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ' +
              (on ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' +
              '<span class="w-1.5 h-1.5 rounded-full ' + DOT[u.status] + '"></span><span>' + esc(u.name) + '</span>' +
              '<span class="font-mono text-[10px] ' + (on ? 'text-sky-100' : 'text-slate-400') + '">' + (u.load == null ? '—' : '%' + u.load) + '</span></button>';
          }).join('') + '</div>' +
        '</div>';

      if (this.renderedFor !== ups.code) this.skeleton(ups.code);
      const v = ups.values;
      const cur = k => parseFloat(v[k] && v[k].value) || 0;
      const bypassFlowing = cur('bypass_a_a') > 0.5 || cur('bypass_a_b') > 0.5 || cur('bypass_a_c') > 0.5;
      const mainFlowing = cur('main_a_a') > 0.5 || cur('main_a_b') > 0.5 || cur('main_a_c') > 0.5;
      const battery = ups.mode === 'battery';
      let alarmState = false, bypassFlow = false, mainFlow = false;
      if (bypassFlowing && mainFlowing) alarmState = true;
      else { bypassFlow = bypassFlowing; mainFlow = mainFlowing; }
      if (battery) alarmState = true; // sunum eki: akü modunda şema alarm zeminine geçer
      const flows = {
        1: bypassFlow, 2: bypassFlow, 3: bypassFlow,
        4: mainFlow, 5: mainFlow || battery, 6: mainFlow || battery,
        7: bypassFlow || mainFlow || battery,
        8: battery
      };
      const wrap = document.getElementById('ups-wrap');
      wrap.classList.toggle('alarm-state', alarmState);
      wrap.classList.toggle('lost-mask', ups.mode === 'lost');
      wrap.querySelectorAll('[data-cable]').forEach(c => c.classList.toggle('flowing', !!flows[c.getAttribute('data-cable')]));
      const bfill = document.getElementById('ups-bfill');
      bfill.className = 'batt-fill ' + getStatusClass(v.batt_cap && v.batt_cap.status);
      bfill.style.width = (parseFloat(v.batt_cap.value) || 0) + '%';

      // Başlık, senaryo bandı, durum rozeti
      document.getElementById('ups-title').innerHTML =
        '<div class="t-name">' + esc(ups.name) + '</div><div class="t-sub">' + esc(ups.devId) + ' · 80 kVA · ' + esc(ups.modeLabel) + '</div>';
      const banner = document.getElementById('ups-banner');
      if (battery) {
        banner.className = 'ups-banner b-alarm';
        banner.innerHTML = '<i class="pi pi-exclamation-circle"></i><div>AKÜ MODUNDA ÇALIŞIYOR · KALAN ' + esc(ups.runtime) + ' DK<div class="b-sub">Şebeke girişi yok (0 V) · Bypass hazır, yük inverter üzerinden aküden besleniyor</div></div>';
        banner.style.display = '';
      } else if (ups.mode === 'lost') {
        banner.className = 'ups-banner b-lost';
        banner.innerHTML = '<i class="pi pi-question-circle"></i><div>SNMP HABERLEŞME KAYBI<div class="b-sub">3 ardışık sorgu yanıtsız · Son veri: ' + esc(DCIM.ui.fmtDateTime(ups.lostSince)) + '</div></div>';
        banner.style.display = '';
      } else if (ups.status === 'warning') {
        banner.className = 'ups-banner b-uyari';
        banner.innerHTML = '<i class="pi pi-exclamation-triangle"></i><div>' + esc(ups.note) + '<div class="b-sub">' + (ups.code === 'B4' ? 'Yük oranı uyarı limitinin (%80) üzerinde' : 'Akü sıcaklığı limitin (30,0 °C) üzerinde') + '</div></div>';
        banner.style.display = '';
      } else {
        banner.style.display = 'none';
      }
      const sb = document.getElementById('ups-sbadge');
      const sbCls = { alarm: 'sb-alarm', warning: 'sb-uyari', lost: 'sb-lost', normal: 'sb-normal' }[ups.status];
      sb.className = 'status-badge ' + sbCls;
      sb.textContent = ups.status === 'alarm' ? 'ALARM' : ups.status === 'warning' ? 'UYARI' : ups.status === 'lost' ? 'VERİ ALINAMIYOR' : 'NORMAL';

      // Veri kartları
      document.getElementById('ups-c-bypass').innerHTML = phaseTable('Bypass Girişi', 'bypass', v) + rowVal('Frekans', v.bypass_freq, 'Hz', 2) +
        '<div class="row-val"><span class="label">Bypass Durumu</span><span class="' + (ups.mode === 'lost' ? 'sta-v-disabled' : 'sta-v-normal') + '">' + esc(ups.bypassState) + '</span></div>';
      document.getElementById('ups-c-main').innerHTML = phaseTable('Şebeke Girişi', 'main', v) + rowVal('Frekans', v.main_freq, 'Hz', 2);
      const cap = parseFloat(v.batt_cap.value) || 0;
      document.getElementById('ups-c-batt').innerHTML =
        '<div class="gauge-wrap"><svg class="gauge-svg" viewBox="0 0 36 36"><circle class="gauge-bg" cx="18" cy="18" r="15.9"></circle>' +
          '<circle class="gauge-fill ' + getStatusClass(v.batt_cap.status) + '" cx="18" cy="18" r="15.9" stroke-dasharray="' + cap + ', 100"></circle></svg>' +
          '<div class="gauge-txt"><span class="g-val ' + getStatusClass(v.batt_cap.status) + '">' + upsFmt(v.batt_cap, 0) + '%</span></div></div>' +
        '<div class="info-grid">' + [
          { l: 'Gerilim', k: 'batt_v_dc', u: 'V' },
          { l: 'Akım', k: 'batt_curr', u: 'A' },
          { l: 'Kalan Batarya Süresi', k: 'batt_runtime', u: 'dk', d: 0 },
          { l: 'Sıcaklık', k: 'batt_temp', u: '°C' }
        ].map(it => '<div class="info-row"><span class="info-l">' + esc(it.l) + '</span><div class="flex flex-col items-end"><span class="' + getStatusClass(v[it.k] && v[it.k].status) + ' info-v">' + upsFmt(v[it.k], it.d) + ' <span class="unit">' + it.u + '</span></span></div></div>').join('') +
        '</div>';
      const loads = ['a', 'b', 'c'].map(p => v['out_load_' + p]);
      const avgLoad = ups.load == null ? { value: '-', status: 'BAĞLANAMADI' } : { value: ups.load, status: ups.load > 90 ? 'ALARM' : ups.load > 80 ? 'UYARI' : 'NORMAL' };
      document.getElementById('ups-c-out').innerHTML = phaseTable('Çıkış', 'out', v, true) + rowVal('Frekans', v.out_freq, 'Hz', 2) +
        '<span class="upper block mt-4 text-left">Faz Yük Oranları</span>' +
        '<div class="load-bars">' + loads.map(l =>
          '<div class="l-bar"><div class="l-bg"><div class="l-fill ' + getStatusClass(l.status) + '" style="height:' + (parseFloat(l.value) || 0) + '%"></div></div><span class="l-txt">' + (l.value === '-' ? 0 : l.value || 0) + '%</span></div>').join('') +
        '</div>' +
        rowVal('Aktif Yük', avgLoad, '%', 0);
    }
  };

  // ===========================================================================
  // 4) JENERATÖR GÖSTERGELERİ (generator-gauges.component.html/.ts)
  // ===========================================================================
  const ANGLE_RANGE = 288;
  const START_ANGLE = 126;
  const gMax = g => (!g.scaleTicks || !g.scaleTicks.length ? 100 : Math.max.apply(null, g.scaleTicks));
  const gAngle = (value, g) => START_ANGLE + Math.max(0, Math.min(1, value / gMax(g))) * ANGLE_RANGE;
  const polar = (r, deg) => ({ x: r * Math.cos(deg * Math.PI / 180), y: r * Math.sin(deg * Math.PI / 180) });
  function describeArc(from, to, g) {
    const sa = gAngle(from, g);
    let ea = gAngle(to, g);
    if (sa === ea) ea -= 0.001;
    const s = polar(100, ea), e = polar(100, sa);
    return ['M', s.x, s.y, 'A', 100, 100, 0, ea - sa <= 180 ? '0' : '1', 0, e.x, e.y].join(' ');
  }
  const pad2 = n => String(n).padStart(2, '0');
  const fmtStamp = d => pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  const cardBasis = () => 'flex-basis: calc(' + (100 / state.cardsPerRow) + '% - 1rem); max-width: calc(' + (100 / state.cardsPerRow) + '% - 1rem);';

  views.generator = {
    mount(el) {
      const gens = E.generators(state.tick);
      el.innerHTML =
        '<div class="h-full flex flex-col min-h-0">' +
          '<div class="component-controls p-2.5 bg-slate-50/80 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle flex items-center justify-between text-xs shrink-0" data-report-hide>' +
            '<div class="flex items-center gap-2"><label for="cards-slider" class="font-medium text-slate-700 dark:text-slate-300 text-[11px]">Kart Sayısı:</label>' +
              '<input type="range" id="cards-slider" class="w-24 cursor-pointer" min="1" max="4" step="1" value="' + state.cardsPerRow + '">' +
              '<span class="font-bold text-sky-600 dark:text-sky-400 text-xs" id="cards-val">' + state.cardsPerRow + '</span></div>' +
            '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">' + gens.length + ' jeneratör · ' + gens.reduce((s, g) => s + g.gauges.length, 0) + ' gösterge</span>' +
          '</div>' +
          '<div class="gauges-container p-4 flex flex-wrap gap-4 overflow-y-auto flex-1 min-h-0 content-start" id="gen-cards">' +
            gens.map((gen, gi) =>
              // Sunum eki: jeneratör grup başlığı
              '<div class="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 ' + CARD + '" data-gen-head="' + gen.side + '">' +
                '<div class="flex items-center gap-2.5"><div class="w-8 h-8 rounded-[2px] bg-sky-600/15 text-sky-500 flex items-center justify-center text-sm"><i class="pi pi-cog' + (gen.running ? ' pi-spin' : '') + '"></i></div>' +
                  '<div><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(gen.name) + '</h3><p class="text-[10px] text-slate-500 dark:text-slate-400 font-mono">' + esc(gen.modeNote) + '</p></div></div>' +
                '<div class="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
                  '<span>Çalışma: <strong class="text-slate-800 dark:text-slate-200" data-gen-hours="' + gi + '">' + fnum(gen.runHours, 1) + '</strong> saat</span>' +
                  (gen.running ? statusBadge('info', gen.mode) : statusBadge('normal', gen.mode)) + '</div>' +
              '</div>' +
              gen.gauges.map((g, i) => {
                const id = gi + '-' + i;
                return '<div class="gauge-card bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-md p-4 flex flex-col relative shadow-sm" data-gauge="' + id + '" data-desc="' + esc(gen.name + ' ' + g.ioDescription) + '" style="' + cardBasis() + '">' +
                  '<div class="io-description font-semibold text-sm text-center mb-2 text-slate-800 dark:text-slate-100"><span>' + esc(g.ioDescription) + '</span></div>' +
                  '<div class="gauge-visualization flex justify-center items-center py-2">' +
                    '<svg viewBox="-110 -110 220 220" class="gauge-svg w-48 h-48">' +
                      '<path d="M -58.78 80.9 A 100 100 0 1 1 58.78 80.9" fill="none" stroke="#e2e8f0" stroke-width="12" stroke-linecap="round" />' +
                      '<g>' + g.colorRanges.map(r => '<path class="gauge-range-segment" fill="none" stroke-width="12" d="' + describeArc(r.from, r.to, g) + '" style="stroke:' + r.color + '"></path>').join('') + '</g>' +
                      g.scaleTicks.map(t => {
                        const a = gAngle(t, g) * Math.PI / 180;
                        return '<g><line x1="' + (90 * Math.cos(a)) + '" y1="' + (90 * Math.sin(a)) + '" x2="' + (100 * Math.cos(a)) + '" y2="' + (100 * Math.sin(a)) + '" stroke="#64748b" stroke-width="2" />' +
                          '<text x="' + (78 * Math.cos(a)) + '" y="' + (78 * Math.sin(a)) + '" dy="0.35em" text-anchor="middle" font-size="10" fill="#64748b">' + t + '</text></g>';
                      }).join('') +
                      '<g class="needle-group transition-transform duration-300" data-needle="' + id + '" style="transform: rotate(' + gAngle(g.value || 0, g) + 'deg)"><path d="M 0 -5 L 85 0 L 0 5 Z" fill="#ef4444" /><circle cx="0" cy="0" r="10" fill="#334155" /></g>' +
                    '</svg>' +
                  '</div>' +
                  '<div class="details-table mt-auto pt-3 border-t border-slate-200 dark:border-border-subtle text-xs space-y-1.5">' +
                    '<div class="details-row text-center font-bold py-1 rounded ' + (g.connectionStatus === 'var' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300') + '">' +
                      '<span class="value">' + (g.connectionStatus === 'var' ? 'Bağlı' : 'Bağlantı Yok') + '</span></div>' +
                    '<div class="details-row text-center"><span class="value text-base font-extrabold text-slate-900 dark:text-slate-100" data-gval="' + id + '">' + (g.value || 0).toFixed(1) + ' ' + esc(g.unit) + '</span></div>' +
                    '<div class="details-row text-center text-slate-500 dark:text-slate-400 text-[11px]"><span class="value" data-gtime="' + id + '">' + (g.lastUpdateTime ? fmtStamp(g.lastUpdateTime) : '--.--.---- --:--:--') + '</span></div>' +
                  '</div>' +
                '</div>';
              }).join('')
            ).join('') +
          '</div>' +
        '</div>';
      const slider = el.querySelector('#cards-slider');
      slider.addEventListener('input', () => {
        state.cardsPerRow = parseInt(slider.value, 10) || 3;
        el.querySelector('#cards-val').textContent = state.cardsPerRow;
        el.querySelectorAll('[data-gauge]').forEach(c => c.setAttribute('style', cardBasis() + (c.style.display === 'none' ? ' display:none;' : '')));
      });
      if (state.gen) {
        const head = el.querySelector('[data-gen-head="' + state.gen + '"]');
        if (head) setTimeout(() => {
          head.scrollIntoView({ block: 'start' });
          head.classList.add('ring-2', 'ring-sky-500/40');
          setTimeout(() => head.classList.remove('ring-2', 'ring-sky-500/40'), 1800);
        }, 30);
      }
    },
    update() {
      const gens = E.generators(state.tick);
      gens.forEach((gen, gi) => {
        const h = document.querySelector('[data-gen-hours="' + gi + '"]');
        if (h) h.textContent = fnum(gen.runHours, 1);
        gen.gauges.forEach((g, i) => {
          const id = gi + '-' + i;
          const card = document.querySelector('[data-gauge="' + id + '"]');
          if (!card) return;
          card.style.display = matchQ(card.getAttribute('data-desc')) ? '' : 'none';
          card.querySelector('[data-needle="' + id + '"]').style.transform = 'rotate(' + gAngle(g.value || 0, g) + 'deg)';
          card.querySelector('[data-gval="' + id + '"]').textContent = (g.value || 0).toFixed(1) + ' ' + g.unit;
          card.querySelector('[data-gtime="' + id + '"]').textContent = fmtStamp(g.lastUpdateTime);
        });
      });
    }
  };

  // ===========================================================================
  // 5) SAYAÇ TABLOSU (energy-table-dashboard.component.html/.ts)
  // ===========================================================================
  // getCellStatus: AyXDB sta hex/decimal → durum
  function getCellStatus(cell) {
    if (!cell) return 'BILINMEYEN';
    if (cell.sta !== undefined && cell.sta !== null) {
      const s = String(cell.sta).toLowerCase();
      const num = parseInt(s, s.indexOf('0x') === 0 ? 16 : 10);
      if (!isNaN(num)) {
        if (num === 779 || num === 843 || (num & 0x000f) === 0x000b) return 'ALARM';
        if (num === 775 || num === 839 || (num & 0x000f) === 0x0007) return 'UYARI';
        if (num === 771 || num === 835 || (num & 0x000f) === 0x0003) return 'NORMAL';
        if (num === 770 || (num & 0x000f) === 0x0002) return 'ESKİ';
        if (num === 768 || (num & 0x000f) === 0x0000) return 'DEVREDIŞI';
        if (num === 769 || (num & 0x000f) === 0x0001) return 'BAĞLANAMADI';
      }
    }
    if (cell.status) {
      const s = String(cell.status).toUpperCase();
      if (s === 'ALARM' || s === 'CRITICAL') return 'ALARM';
      if (s === 'UYARI' || s === 'WARNING') return 'UYARI';
      if (s === 'NORMAL' || s === 'OK') return 'NORMAL';
    }
    return 'BILINMEYEN';
  }
  const cellStatusClass = c => ({ ALARM: 'sta-v-alarm', UYARI: 'sta-v-uyari', NORMAL: 'sta-v-normal', 'ESKİ': 'sta-v-eski' }[getCellStatus(c)] || 'sta-v-disabled');
  const cellDotClass = c => { const s = getCellStatus(c); return s === 'ALARM' ? 'dot-alarm' : s === 'UYARI' ? 'dot-uyari' : ''; };
  function cellBadgeClass(c) {
    switch (getCellStatus(c)) {
      case 'NORMAL': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
      case 'UYARI': return 'bg-amber-500/15 text-amber-500 dark:text-amber-300 font-bold border border-amber-500/40';
      case 'ALARM': return 'bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/40 animate-pulse';
      case 'ESKİ': return 'bg-orange-500/15 text-orange-500 dark:text-orange-400 border border-orange-500/30';
      default: return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700';
    }
  }
  function rowStatus(row) {
    let warn = false, normal = false;
    for (let i = 1; i < row.cells.length; i++) {
      const st = getCellStatus(row.cells[i]);
      if (st === 'ALARM') return 'ALARM';
      if (st === 'UYARI') warn = true;
      if (st === 'NORMAL') normal = true;
    }
    return warn ? 'UYARI' : normal ? 'NORMAL' : 'BILINMEYEN';
  }
  const rowDotClass = row => ({ ALARM: 'bg-rose-500 animate-pulse ring-2 ring-rose-500/40', UYARI: 'bg-amber-400 ring-2 ring-amber-400/40', NORMAL: 'bg-emerald-500' }[rowStatus(row)] || 'bg-slate-400');
  const formatCellValue = v => {
    if (v === null || v === undefined || v === '' || v === '-') return '-';
    const n = parseFloat(v);
    return !isNaN(n) && isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : String(v);
  };

  // computeKpiMetrics — sunum farkı: üst seviye (aggregate) analizörler güç ve faz akımı toplamına katılmaz (çift sayım önlenir)
  function computeKpi(tables) {
    const m = { totalP: 0, sumV: 0, nV: 0, sumF: 0, nF: 0, sumPf: 0, nPf: 0, active: 0, total: 0, a: 0, b: 0, c: 0, alarms: 0, warnings: 0 };
    tables.forEach(table => (table.rows || []).forEach(row => {
      m.total++;
      let hasActive = false;
      table.headers.forEach((h, ci) => {
        if (ci === 0) return;
        const cell = row.cells[ci];
        if (!cell || cell.value === null || cell.value === undefined || cell.value === '' || cell.value === '-') return;
        const n = parseFloat(String(cell.value));
        const isNum = !isNaN(n) && isFinite(n);
        if (isNum && n > 0) hasActive = true;
        const devId = (h.devId || '').toUpperCase(), title = (h.title || '').toUpperCase(), unit = (cell.unit || '').toUpperCase();
        if (devId.indexOf('FREQ') >= 0 || devId === 'F' || title.indexOf('FREKANS') >= 0 || title.indexOf('FREQ') >= 0 || unit === 'HZ') {
          if (isNum && n >= 30 && n <= 70) { m.sumF += n; m.nF++; }
        } else if (devId.indexOf('VLT') >= 0 || devId.indexOf('VOLT') >= 0 || devId.indexOf('_PV') >= 0 || devId.indexOf('_LV') >= 0 || devId.indexOf('VORT') >= 0 || devId.charAt(0) === 'V' || title.indexOf('VOLTAJ') >= 0 || title.indexOf('GERİLİM') >= 0 || title.indexOf('ORTALAMA') >= 0 || unit === 'V') {
          if (isNum && n >= 50 && n <= 500) { m.sumV += n; m.nV++; }
        } else if (devId.indexOf('POW') >= 0 || devId.indexOf('GUC') >= 0 || devId.indexOf('GÜÇ') >= 0 || devId === 'PT' || title.indexOf('GÜÇ') >= 0 || title.indexOf('POW') >= 0 || unit === 'KW' || unit === 'W') {
          if (isNum && n >= 0 && !row.aggregate) m.totalP += (unit === 'W' || n > 10000) ? n / 1000 : n;
        } else if (devId.indexOf('PF') >= 0 || devId.indexOf('COS') >= 0 || title.indexOf('FAKTÖR') >= 0 || title.indexOf('COS') >= 0) {
          if (isNum && n > 0 && n <= 1.0) { m.sumPf += n; m.nPf++; }
        }
        if (!row.aggregate && isNum && n >= 0) {
          if (devId.indexOf('PA_CURR') >= 0 || devId === 'I1' || devId === 'IA' || title.indexOf('FAZ A') >= 0 || title.indexOf('FAZ 1') >= 0 || title.indexOf('L1') >= 0) m.a += n;
          else if (devId.indexOf('PB_CURR') >= 0 || devId === 'I2' || devId === 'IB' || title.indexOf('FAZ B') >= 0 || title.indexOf('FAZ 2') >= 0 || title.indexOf('L2') >= 0) m.b += n;
          else if (devId.indexOf('PC_CURR') >= 0 || devId === 'I3' || devId === 'IC' || title.indexOf('FAZ C') >= 0 || title.indexOf('FAZ 3') >= 0 || title.indexOf('L3') >= 0) m.c += n;
        }
        const st = getCellStatus(cell);
        if (st === 'ALARM') m.alarms++; else if (st === 'UYARI') m.warnings++;
      });
      if (hasActive) m.active++;
    }));
    return {
      totalPowerKw: Math.round(m.totalP),
      avgVoltageV: m.nV ? Math.round(m.sumV / m.nV) : 0,
      avgFreqHz: m.nF ? Number((m.sumF / m.nF).toFixed(2)) : 0,
      avgPowerFactor: m.nPf ? Number((m.sumPf / m.nPf).toFixed(2)) : 0,
      activeCount: m.active, totalCount: m.total,
      phaseA: Math.round(m.a), phaseB: Math.round(m.b), phaseC: Math.round(m.c),
      alarmCount: m.alarms, warningCount: m.warnings
    };
  }

  views.meters = {
    mount(el) {
      el.innerHTML =
        '<div class="h-full flex flex-col overflow-hidden p-2 pt-0 space-y-2 font-sans select-none bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-100 etd-host">' +
          '<div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5 shrink-0" id="m-kpi"></div>' +
          '<div class="flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-3 py-1.5 shadow-2xs shrink-0">' +
            '<div class="flex items-center gap-2 flex-grow max-w-md"><div class="relative w-full">' +
              '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
              '<input type="text" id="m-search" value="' + esc(state.q) + '" placeholder="Şalter, hat veya pano ara..." class="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500" />' +
            '</div></div>' +
            '<div class="flex items-center gap-2 text-xs">' +
              '<button type="button" data-m-excel class="' + DCIM.ui.buttonClasses('secondary', 'sm') + '" data-report-hide><i class="pi pi-file-excel text-current shrink-0"></i><span>Excel</span></button>' +
              '<span class="text-slate-500 dark:text-slate-400 text-[11px]">Görünüm:</span>' +
              '<span class="px-2 py-0.5 rounded-[2px] font-bold text-[11px] bg-sky-600/10 text-sky-600 dark:text-sky-400 border border-sky-500/30" id="m-viewlbl"></span>' +
            '</div>' +
          '</div>' +
          '<div class="flex-grow min-h-0 overflow-y-auto space-y-3 pr-0.5" id="m-tables"></div>' +
        '</div>';
      el.querySelector('#m-search').addEventListener('input', e => {
        state.q = e.target.value;
        const ts = document.getElementById('en-search');
        if (ts) ts.value = state.q;
        this.update();
      });
      el.querySelector('[data-m-excel]').addEventListener('click', () => {
        const tables = E.meterTables(state.tick);
        const headers = tables[0].headers;
        const rows = [];
        tables.forEach(t => t.rows.forEach(r => rows.push({ t: t.title, r })));
        kit.exportExcel('enerji_analizorleri_' + DCIM.ui.fmtDateKey(new Date()),
          [{ header: 'Tablo', value: x => x.t }].concat(headers.map((h, i) => ({ header: h.title + (x0(i, tables) ? ' (' + x0(i, tables) + ')' : ''), value: x => x.r.cells[i].value }))), rows);
      });
      function x0(i, tables) { const c = tables[0].rows[0].cells[i]; return c && c.unit ? c.unit : ''; }
    },
    update() {
      const tables = E.meterTables(state.tick);
      const k = computeKpi(tables);
      const total = k.phaseA + k.phaseB + k.phaseC;
      const pct = x => (total > 0 ? Math.round(x / total * 100) : 0);
      const kc = (label, icon, value, unit, unitCls, dotCls, sub, extraCls) =>
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs relative overflow-hidden flex flex-col justify-between ' + (extraCls || '') + '">' +
          '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5"><span class="truncate">' + esc(label) + '</span><i class="' + icon + ' text-xs shrink-0"></i></div>' +
          '<div class="flex items-baseline gap-1"><span class="text-lg font-extrabold font-mono text-slate-900 dark:text-slate-100">' + value + '</span><span class="text-[11px] font-bold ' + unitCls + '">' + unit + '</span></div>' +
          '<div class="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate"><span class="w-1.5 h-1.5 rounded-full ' + dotCls + '"></span><span>' + esc(sub) + '</span></div>' +
        '</div>';
      const bar = (label, cls, grad, val, p) =>
        '<div><div class="flex justify-between text-[10px] mb-0.5"><span class="font-bold ' + cls + '">' + label + '</span><span class="font-mono text-slate-500 dark:text-slate-400">' + val + ' A (%' + p + ')</span></div>' +
        '<div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ' + grad + ' transition-all duration-500 rounded-full" style="width:' + p + '%"></div></div></div>';
      document.getElementById('m-kpi').innerHTML =
        '<div class="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">' +
          kc('Toplam Aktif Güç', 'pi pi-bolt text-amber-500', k.totalPowerKw > 0 ? k.totalPowerKw : '-', 'kW', 'text-amber-500', k.totalPowerKw > 0 ? 'bg-emerald-500' : 'bg-slate-400', k.totalPowerKw > 0 ? 'Aktif Güç' : 'Veri Bekleniyor') +
          kc('Ort. Hat V', 'pi pi-gauge text-sky-500', k.avgVoltageV > 0 ? k.avgVoltageV : '-', 'V', 'text-sky-500', k.avgVoltageV >= 200 ? 'bg-emerald-500' : k.avgVoltageV > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgVoltageV > 0 ? 'Nominal Seviye' : 'Veri Bekleniyor') +
          kc('Frekans', 'pi pi-wave-pulse text-emerald-500', k.avgFreqHz > 0 ? k.avgFreqHz : '-', 'Hz', 'text-emerald-500', k.avgFreqHz >= 49.5 && k.avgFreqHz <= 50.5 ? 'bg-emerald-500' : k.avgFreqHz > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgFreqHz > 0 ? '50 Hz ±0.5' : 'Veri Bekleniyor') +
          kc('Toplam Güç Faktörü', 'pi pi-sliders-h text-purple-500', k.avgPowerFactor > 0 ? k.avgPowerFactor : '-', 'PF', 'text-purple-400', k.avgPowerFactor >= 0.95 ? 'bg-emerald-500' : k.avgPowerFactor > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgPowerFactor > 0 ? 'cos φ' : 'Veri Bekleniyor') +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs relative overflow-hidden flex flex-col justify-between col-span-2 sm:col-span-1">' +
            '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5"><span class="truncate">İzlenen Şalter</span><i class="pi pi-sitemap text-sky-500 text-xs shrink-0"></i></div>' +
            '<div class="flex items-baseline gap-1"><span class="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">' + k.activeCount + '</span><span class="text-xs text-slate-400 font-mono">/ ' + k.totalCount + '</span></div>' +
            '<div class="mt-1 flex items-center gap-1 text-[10px]">' +
              (k.alarmCount ? '<span class="px-1 py-0.2 rounded font-bold text-[9px] bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse">' + k.alarmCount + ' ALARM</span>' : '') +
              (k.warningCount ? '<span class="px-1 py-0.2 rounded font-bold text-[9px] bg-amber-500/15 text-amber-500 dark:text-amber-300 border border-amber-500/30">' + k.warningCount + ' UYARI</span>' : '') +
              (!k.alarmCount && !k.warningCount ? '<span class="text-slate-500 dark:text-slate-400 truncate">Telemetri Canlı</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lg:col-span-5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs flex flex-col justify-between">' +
          '<div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">' +
            '<div class="flex items-center gap-1.5"><i class="pi pi-chart-bar text-sky-600 dark:text-sky-400 text-xs"></i><span class="text-[11px] font-bold text-slate-900 dark:text-slate-100">3-Faz Akım Yük Dağılımı</span></div>' +
            '<div class="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
              '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> L1: <strong>' + k.phaseA + 'A</strong></span>' +
              '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> L2: <strong>' + k.phaseB + 'A</strong></span>' +
              '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> L3: <strong>' + k.phaseC + 'A</strong></span>' +
            '</div>' +
          '</div>' +
          '<div class="space-y-1.5 text-xs">' +
            bar('Faz A (L1)', 'text-sky-600 dark:text-sky-400', 'from-sky-600 to-sky-400', k.phaseA, pct(k.phaseA)) +
            bar('Faz B (L2)', 'text-amber-500 dark:text-amber-400', 'from-amber-600 to-amber-400', k.phaseB, pct(k.phaseB)) +
            bar('Faz C (L3)', 'text-emerald-600 dark:text-emerald-400', 'from-emerald-600 to-emerald-400', k.phaseC, pct(k.phaseC)) +
          '</div>' +
        '</div>';
      document.getElementById('m-viewlbl').textContent = state.details ? 'Detaylı Görünüm' : 'Kompakt SCADA Tablosu';

      const term = lc(state.q.trim());
      const visH = hs => (state.details ? hs : hs.filter(h => !h.hidden));
      const filtered = t => {
        if (!term || lc(t.title).indexOf(term) >= 0) return state.details ? t.rows : t.rows.filter(r => !r.hidden);
        return t.rows.filter(r => (state.details || !r.hidden) && r.cells.some(c => lc(c.value != null ? String(c.value) : '').indexOf(term) >= 0));
      };
      document.getElementById('m-tables').innerHTML = tables.map(t => {
        const hs = visH(t.headers);
        const rows = filtered(t);
        return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden">' +
          '<div class="px-3 py-2 bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-border-subtle flex items-center justify-between">' +
            '<div class="flex items-center gap-2"><div class="w-5 h-5 rounded-[2px] bg-sky-600/20 text-sky-500 flex items-center justify-center text-[10px] font-bold"><i class="pi pi-table"></i></div>' +
            '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(t.title) + '</h3></div>' +
            '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400">' + rows.length + ' Kayıt</span>' +
          '</div>' +
          '<div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse">' +
            '<thead><tr class="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 select-none">' +
              hs.map((h, ci) => '<th class="px-3 py-1.5 text-[11px] whitespace-nowrap font-semibold' + (ci > 0 ? ' text-center' : '') + '"><span>' + esc(h.title) + '</span></th>').join('') +
            '</tr></thead>' +
            '<tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">' +
              (rows.length ? rows.map(r => '<tr class="hover:bg-sky-500/5 transition-colors group">' + hs.map((h, ci) => {
                const cell = r.cells[t.headers.indexOf(h)];
                if (ci === 0) {
                  return '<td class="px-3 py-1.5 whitespace-nowrap"><div class="flex items-center gap-2 font-sans font-bold text-slate-900 dark:text-slate-100"><span class="w-2 h-2 rounded-full shrink-0 ' + rowDotClass(r) + '"></span><span>' + esc(cell && cell.value) + '</span>' +
                    (r.aggregate ? '<span class="text-[9px] font-bold px-1 rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">ÜST</span>' : '') + '</div></td>';
                }
                const dot = cellDotClass(cell);
                return '<td class="px-3 py-1.5 whitespace-nowrap text-center"><div class="inline-flex items-center justify-center gap-1.5">' +
                  '<span class="px-1.5 py-0.5 rounded-[2px] font-bold text-xs inline-flex items-center gap-1 ' + cellBadgeClass(cell) + '">' +
                    (dot ? '<span class="' + dot + '"></span>' : '') + '<span class="' + cellStatusClass(cell) + '">' + formatCellValue(cell && cell.value) + '</span></span>' +
                  (cell && cell.unit ? '<span class="text-[10px] font-sans text-slate-400">' + esc(cell.unit) + '</span>' : '') +
                '</div></td>';
              }).join('') + '</tr>').join('')
              : '<tr><td colspan="' + hs.length + '" class="text-center py-6 text-slate-400 italic">Arama kriterine uygun kayıt bulunamadı.</td></tr>') +
            '</tbody></table></div>' +
        '</div>';
      }).join('');
    }
  };

  // ---------------------------------------------------------------------------
  // Sekme geçişi, URL, canlı güncelleme
  // ---------------------------------------------------------------------------
  function syncUrl() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', state.tab);
      if (state.tab === 'ups') u.searchParams.set('ups', state.ups); else u.searchParams.delete('ups');
      if (state.q) u.searchParams.set('q', state.q); else u.searchParams.delete('q');
      u.searchParams.delete('gen');
      window.history.replaceState(null, '', u.toString());
    } catch (e) { /* file:// bazı tarayıcılarda izin vermez */ }
  }

  let current = null;
  function switchTab(tab, opts) {
    if (TAB_KEYS.indexOf(tab) < 0) tab = 'overview';
    const viewEl = document.getElementById('en-view');
    if (current && views[current].unmount) views[current].unmount(viewEl);
    state.tab = tab;
    current = tab;
    if (!(opts && opts.keepNode)) {
      const t = TABS.find(x => x.key === tab);
      state.activeNodeId = tab === 'generator' && state.gen === 'B' ? 'EN0101010400000000b' : t.node || (tab === 'ups' ? 'UPS-' + state.ups : '');
      const n = NODE_MAP.get(state.activeNodeId);
      state.pageTitle = tab === 'overview' ? 'ENERJİ GENEL GÖRÜNÜM' : t.title || (n ? n.title : t.label);
    }
    // Seçili düğümün üst dallarını aç
    let n = NODE_MAP.get(state.activeNodeId);
    while (n && n.parent) { state.collapsed.delete(n.parent.id); n = n.parent; }
    renderTabs();
    renderToolbar();
    renderSidebar();
    views[tab].mount(viewEl);
    views[tab].update();
    syncUrl();
  }

  function liveTick() {
    state.tick++;
    views[state.tab].update();
    const pue = document.getElementById('en-tb-pue');
    if (pue) pue.textContent = fnum(E.overview(state.tick).pue, 2);
    const last = document.getElementById('en-last');
    if (last) last.textContent = 'Son güncelleme: ' + fmtTime(new Date());
  }

  window.addEventListener('resize', () => { if (views[state.tab].resize) views[state.tab].resize(); });
  switchTab(state.tab);
  // Deep link ?tab=ups&ups=A5 için UPS düğümü; ?q= için arama değerini koru
  if (params.get('q')) { state.q = params.get('q'); const s = document.getElementById('en-search'); if (s) s.value = state.q; views[state.tab].update(); }
  setInterval(liveTick, E.TICK_SEC * 1000);
})();
