/* ==========================================================================
   DCIM Sunum — PMS · Güç Yönetim Sistemi (EnergyGeneralViewComponent, PMS sürümü)
   Kompozisyon (energy-general-view.component.html ile aynı):
     ["BMS'ten geldiniz · Geri"] + app-page-header (Enerji ve Çevre › Enerji Genel Görünüm) + PDF Raporu
     Sol: "Güç Yönetim Sistemi" kenar çubuğu — bölümler GENEL · TEK HAT · EKİPMAN, düğüm başına en yüksek
          aktif güç alarmı önem noktası; daraltılınca yalnız simgeler
     Sağ: PMS görünümlerinde (Genel Bakış, Analizörler) araç çubuğu yok; diğerlerinde app-schematic-toolbar
          (sayfa başlığı, Yenile, Dış Ortam / Anlık PUE / Anlık CUE) + aktif görünüm
   Görünümler (activeView karşılıkları):
     overview     → PmsDashboardComponent: KPI şeridi + sparkline, halka grafikler (Yük dağılımı, PUE, A/B dengesi,
                    Alarm önemi), Kaynaklar ve dağıtım (göreli halkalar), Güç alarmları (Tek hat / Mekânsal konum /
                    Gördüm), Sektör standartları, "Salt izleme", "BMS'e geç", "Veri kaynakları" penceresi
     analyzers    → PmsAnalyzersViewComponent: konuma göre gruplanmış analizör kartları + arama
     single-line  → EnergySingleLineComponent: js/pms/single-line.js (DCIM.pmsSingleLine) yüklüyse ona bağlanır,
                    yoksa yer tutucu gösterilir
     compensation → Kompanzasyon Sistemleri tablo şeması (EnergyTableDashboardComponent, 2 tablo/satır)
     generator    → A/B Tarafı Jeneratör Değerleri tablo şeması (EnergyTableDashboardComponent)
     rectifier    → RectifierDashboardComponent (yenilenmiş panel)
     ups          → UpsDashboardComponent (önceki sürüm; energy.js UPS görünümünün taşınmış hali)
   Veri: DCIM.data.pms (js/mock/pms.data.js) + DCIM.data.energy (UPS, redresör); 3 sn'de bir tohumlu gürültüyle canlı.
   Güç alarmları: DCIM.data.activeAlarms (Enerji Grubu + 1AV42 PDU-B) + DCIM.data.pmsSingleLine.demoAlarms (varsa).
   "Gördüm" onayları oturum boyunca sessionStorage 'dcim_pms_ack_v1'de tutulur (komut yok; salt izleme).
   Derin bağlantılar:
     ?view=overview|analyzers|single-line|generator|rectifier|ups|compensation
     ?view=single-line&schema=<id>    (şema kimliği DCIM.pmsSingleLine.schemas)
     ?view=ups&ups=A5                  (A1–A7, B1–B7)
     ?view=generator&gen=A|B
     ?alarm=<rid>&dev=<devId>&from=bms (BMS'ten gelen: tek hat şeması alarm işaretiyle açılır; bulunamazsa
                                         Genel Bakış'ta bilgi bandı; UPS cihazıysa UPS paneli açılır)
   Giden bağlantılar (BMS sözleşmesi): bms.html?from=pms ·
     bms.html?floor=KAT-1&cab=<kabin>&dev=<cihaz>&alarm=<rid>&from=pms (konumu olmayan cihazda kat verilmez;
     BMS dürüst mesaj gösterir)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtTime, toast } = DCIM.ui;
  const kit = DCIM.kit;
  const D = DCIM.data;
  const E = D.energy;
  const P = D.pms;
  DCIM.shell.init({ active: 'pms' });

  const SL = () => (DCIM.pmsSingleLine && typeof DCIM.pmsSingleLine.mount === 'function' ? DCIM.pmsSingleLine : null);

  // alarm-severity.util SEVERITY_COLOR + energy-general-view rank()
  const SEVERITY_COLOR = { acil: '#7E22CE', alarm: '#DC2626', uyari: '#D97706', kayip: '#EA580C', normal: '#16A34A' };
  const RANK = { acil: 4, alarm: 3, kayip: 2, uyari: 1 };
  const SEV_ORDER = ['acil', 'alarm', 'uyari', 'kayip'];
  const sevLabel = s => (s === 'acil' ? 'Acil' : s === 'alarm' ? 'Alarm' : s === 'uyari' ? 'Uyarı' : s === 'kayip' ? 'Kayıp' : 'Normal');
  const toFocusSev = s => (s === 'kayip' ? 'veri-yok' : s);
  const maxSev = list => list.reduce((best, a) => (!best || RANK[a.sev] > RANK[best] ? a.sev : best), null);

  const VIEWS = ['overview', 'analyzers', 'single-line', 'generator', 'rectifier', 'ups', 'compensation'];
  const PMS_VIEWS = ['overview', 'analyzers'];
  const params = new URLSearchParams(window.location.search);
  const safeId = v => String(v == null ? '' : v).replace(/[^A-Za-z0-9_.\-]/g, '');
  const upsInit = (params.get('ups') || '').toUpperCase();

  const state = {
    view: VIEWS.indexOf(params.get('view')) >= 0 ? params.get('view') : 'overview',
    schema: safeId(params.get('schema')),
    ups: E.upsCodes.indexOf(upsInit) >= 0 ? upsInit : 'A5',
    gen: params.get('gen') === 'B' ? 'B' : 'A',
    tick: 0,
    sidebarCollapsed: false,
    secCollapsed: {},
    expanded: {},
    activeNodeId: '',
    pageTitle: '',
    notice: '',
    fromBms: params.get('from') === 'bms',
    linkAlarm: safeId(params.get('alarm')),
    linkDev: safeId(params.get('dev')),
    slFocus: null,
    leaving: false,
    acks: new Set(),
    lastUpdate: new Date()
  };
  try { (JSON.parse(DCIM.ui.storage.sessionGet('dcim_pms_ack_v1') || '[]') || []).forEach(k => state.acks.add(k)); } catch (e) { /* yok say */ }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  const fmt = (v, d) => (v === null || v === undefined || !isFinite(v) ? '—' : Number(v).toLocaleString('tr-TR', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }));
  const lc = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  const devNorm = s => String(s || '').toUpperCase().replace(/_DV$/, '');
  // Alarm kaynağı bir cihaza mı ait (pms-shared sourceMatches: önek eşleşmesi; _DV eki yok sayılır)
  const alarmOn = (a, id) => {
    const dev = devNorm(a.devId), rid = String(a.rid || '').toUpperCase(), x = devNorm(id);
    return !!x && (dev === x || dev.indexOf(x + '_') === 0 || rid.indexOf(x) === 0);
  };
  const CARD = 'bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs';

  // Güç alarmları (oturum onaylarıyla); önem sırası → zaman
  function alarms() {
    const list = P.powerAlarms().map(a => Object.assign(a, { acked: a.acked || state.acks.has(a.key) }));
    list.sort((x, y) => RANK[y.sev] - RANK[x.sev] || new Date(y.tim) - new Date(x.tim));
    return list;
  }

  // Tek hat şemaları (modül yoksa ENERGY_List_static düğüm adları)
  const FALLBACK_SCHEMAS = [
    { id: 'IDC4', label: 'IDC4' },
    { id: 'IDC1-GENEL', label: 'IDC1 Genel' },
    { id: 'IDC1-A', label: 'IDC1 A Blok' },
    { id: 'IDC1-B', label: 'IDC1 B Blok' }
  ];
  const SCHEMA_TITLE = {
    'IDC4': 'VERİ MERKEZİ IDC4 TEK HAT ŞEMASI',
    'IDC1 Genel': 'VERİ MERKEZİ IDC1 TEK HAT ŞEMASI',
    'IDC1 A Blok': 'VERİ MERKEZİ IDC1 A BLOK HAT ŞEMASI',
    'IDC1 B Blok': 'VERİ MERKEZİ IDC1 B BLOK HAT ŞEMASI'
  };
  const schemas = () => (SL() && Array.isArray(SL().schemas) && SL().schemas.length ? SL().schemas : FALLBACK_SCHEMAS);
  const schemaById = id => schemas().find(s => s.id === id) || null;
  const resolveSrc = (...keys) => {
    const sl = SL();
    if (!sl || typeof sl.resolve !== 'function') return null;
    for (const k of keys) {
      if (!k) continue;
      try { const r = sl.resolve(k); if (r && r.schemaId) return r; } catch (e) { /* yok say */ }
    }
    return null;
  };
  const alarmSchema = a => a.schemaId || ((resolveSrc(a.rid, a.devId) || {}).schemaId) || null;

  // ---------------------------------------------------------------------------
  // Kenar çubuğu modeli (buildPmsSections: Genel / Tek Hat / Ekipman)
  // ---------------------------------------------------------------------------
  const GEN_IDS = { A: ['IDC1_A_GEN4_Q5', 'IDC1_A_GEN5_Q6', 'IDC1_A_GEN6_Q7'], B: ['IDC1_B_GEN1_Q8', 'IDC1_B_GEN2_Q10', 'IDC1_B_GEN3_Q9'] };
  const COMP_IDS = P.analyzers.filter(a => a.meterOf === 'compensation').map(a => a.id);
  const METER_IDS = P.analyzers.map(a => a.id);
  const upsDevId = code => 'KAT1_SAL1_' + code + '_UPS';

  function buildSections() {
    return [
      {
        key: 'overview', title: 'Genel', items: [
          { id: '__pms_dashboard', title: 'Genel Bakış', icon: 'pi pi-th-large', go: { view: 'overview' }, sev: al => maxSev(al) },
          { id: '__pms_analyzers', title: 'Analizörler', icon: 'pi pi-chart-bar', go: { view: 'analyzers' }, sev: al => maxSev(al.filter(a => METER_IDS.some(id => alarmOn(a, id)))) }
        ]
      },
      {
        key: 'single-line', title: 'Tek Hat', items: schemas().map(s => ({
          id: 'sl:' + s.id, title: s.label, icon: 'pi pi-share-alt', go: { view: 'single-line', schema: s.id },
          sev: al => maxSev(al.filter(a => alarmSchema(a) === s.id))
        }))
      },
      {
        key: 'equipment', title: 'Ekipman', items: [
          { id: 'EN0101010300000000', title: 'Kompanzasyon', icon: 'pi pi-sliders-v', go: { view: 'compensation' }, sev: al => maxSev(al.filter(a => COMP_IDS.some(id => alarmOn(a, id)))) },
          {
            id: 'EN0101010400000000', title: 'Jeneratör', icon: 'pi pi-cog', children: ['A', 'B'].map(s => ({
              id: 'gen:' + s, title: 'Jeneratör ' + s + ' Kolu', icon: 'pi pi-file', go: { view: 'generator', gen: s },
              sev: al => maxSev(al.filter(a => GEN_IDS[s].some(id => alarmOn(a, id))))
            }))
          },
          { id: 'EN_RECTIFIER_DASH', title: 'Redresör', icon: 'pi pi-sliders-h', go: { view: 'rectifier' }, sev: al => maxSev(al.filter(a => /REDRES|RECT/i.test(a.rid + ' ' + a.devId))) },
          {
            id: 'EN0101010600000000', title: 'UPS', icon: 'pi pi-server', children: E.upsCodes.map(c => ({
              id: 'ups:' + c, title: P.upsInfo(c).node, icon: 'pi pi-file', go: { view: 'ups', ups: c },
              sev: al => maxSev(al.filter(a => a.ups === c || alarmOn(a, upsDevId(c))))
            }))
          }
        ]
      }
    ];
  }
  let sections = buildSections();
  const allNodes = () => {
    const out = [];
    const walk = n => { out.push(n); (n.children || []).forEach(walk); };
    sections.forEach(s => s.items.forEach(walk));
    return out;
  };
  function nodeStatus(n, al) {
    let sev = n.sev ? n.sev(al) : null;
    (n.children || []).forEach(c => { const cs = nodeStatus(c, al); if (cs && (!sev || RANK[cs] > RANK[sev])) sev = cs; });
    n.status = sev;
    return sev;
  }
  function nodeForState() {
    if (state.view === 'overview') return '__pms_dashboard';
    if (state.view === 'analyzers') return '__pms_analyzers';
    if (state.view === 'single-line') return 'sl:' + state.schema;
    if (state.view === 'compensation') return 'EN0101010300000000';
    if (state.view === 'generator') return 'gen:' + state.gen;
    if (state.view === 'rectifier') return 'EN_RECTIFIER_DASH';
    return 'ups:' + state.ups;
  }

  // ---------------------------------------------------------------------------
  // Sayfa iskeleti
  // ---------------------------------------------------------------------------
  const root = document.getElementById('pms-root');
  root.innerHTML =
    '<div class="px-3 pt-1.5 pb-1 shrink-0 flex items-center justify-between">' +
      (state.fromBms ? '<button type="button" data-back-bms title="BMS görünümüne aynı alarm/cihazla dön" class="mr-3 shrink-0 px-2 py-1 text-[11px] font-semibold rounded-[2px] border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 flex items-center gap-1.5 cursor-pointer" data-report-hide>' +
        '<i class="pi pi-arrow-left text-[10px]"></i><span>BMS\'ten geldiniz · Geri</span></button>' : '') +
      '<div class="flex-grow">' + kit.pageHeader({ title: 'Enerji Genel Görünüm', compact: true, breadcrumbs: [{ label: 'Enerji ve Çevre' }, { label: 'Enerji Genel Görünüm' }] }) + '</div>' +
      '<button type="button" data-pdf class="ml-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-[2px] flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer" title="Aktif Görünümün PDF Raporunu İndir" data-report-hide>' +
        '<i class="pi pi-file-pdf text-sm"></i><span>PDF Raporu</span></button>' +
    '</div>' +
    '<div class="flex-grow flex overflow-hidden min-h-0">' +
      '<div id="pms-sidebar"></div>' +
      '<div class="flex-grow flex flex-col min-w-0 bg-slate-50 dark:bg-surface-base relative overflow-hidden">' +
        '<div id="pms-toolbar" class="shrink-0"></div>' +
        '<div id="pms-view" class="flex-1 min-h-0 relative overflow-hidden"></div>' +
      '</div>' +
    '</div>';
  root.querySelector('[data-pdf]').addEventListener('click', () => kit.exportPdf());
  const back = root.querySelector('[data-back-bms]');
  if (back) back.addEventListener('click', () => {
    const q = new URLSearchParams();
    if (state.linkAlarm) q.set('alarm', state.linkAlarm);
    if (state.linkDev) q.set('dev', state.linkDev);
    leaveTo('bms.html' + (q.toString() ? '?' + q.toString() : ''));
  });

  // PMS → BMS geçişi: kısa solma sonrası yönlendirme (hareket azaltmada anında)
  function leaveTo(href) {
    if (state.leaving) return;
    state.leaving = true;
    root.classList.add('page-leave');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => { window.location.href = href; }, reduce ? 0 : 220);
  }
  // openBms: alarm → alarm + dev (+ kat/kabin biliniyorsa); cihaz → dev; boş → yalnız BMS
  function openBms(req) {
    const q = new URLSearchParams();
    const r = req || {};
    if (r.alarm) {
      if (r.alarm.floor) q.set('floor', r.alarm.floor);
      if (r.alarm.cab) q.set('cab', r.alarm.cab);
      if (r.alarm.devId) q.set('dev', safeId(r.alarm.devId));
      if (r.alarm.rid) q.set('alarm', safeId(r.alarm.rid));
    } else if (r.dev) {
      if (r.floor) q.set('floor', r.floor);
      q.set('dev', safeId(r.dev));
    }
    q.set('from', 'pms');
    leaveTo('bms.html?' + q.toString());
  }

  // ---------------------------------------------------------------------------
  // Kenar çubuğu
  // ---------------------------------------------------------------------------
  function nodeHtml(n, depth) {
    const kids = n.children && n.children.length;
    const open = !!state.expanded[n.id];
    const active = state.activeNodeId === n.id;
    return '<div>' +
      '<div data-node="' + esc(n.id) + '" title="' + esc(n.title) + '" class="nav-item pr-2 py-1.5 flex items-center gap-2 cursor-pointer transition-colors border-l-2 ' +
        (active ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 font-semibold border-sky-600' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-surface-hover border-transparent') +
        '" style="padding-left:' + (10 + depth * 12) + 'px">' +
        (kids ? '<i data-toggle="' + esc(n.id) + '" class="' + (open ? 'pi pi-chevron-down' : 'pi pi-chevron-right') + ' text-[9px] w-3 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"></i>' : depth ? '<i class="w-3"></i>' : '') +
        '<i class="' + n.icon + ' text-[12px] opacity-80"></i>' +
        '<span class="truncate flex-grow">' + esc(n.title) + '</span>' +
        (n.status ? '<span class="w-2 h-2 rounded-full shrink-0" style="background:' + SEVERITY_COLOR[n.status] + '" title="Aktif alarm: ' + esc(sevLabel(n.status)) + '"></span>' : '') +
      '</div>' +
      (kids && open ? '<div>' + n.children.map(c => nodeHtml(c, depth + 1)).join('') + '</div>' : '') +
    '</div>';
  }
  function renderSidebar() {
    const el = document.getElementById('pms-sidebar');
    const c = state.sidebarCollapsed;
    const al = alarms();
    sections.forEach(s => s.items.forEach(n => nodeStatus(n, al)));
    el.className = (c ? 'w-11' : 'w-60') + ' h-full min-h-0 overflow-hidden bg-white dark:bg-surface-card border-r border-slate-200 dark:border-border-subtle flex flex-col transition-all duration-200 shrink-0 select-none';
    el.setAttribute('data-report-hide', '');
    const sc = el.querySelector('.sidebar-tree-scroll');
    const top = sc ? sc.scrollTop : 0;
    el.innerHTML =
      '<div class="p-2 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between shrink-0">' +
        (!c ? '<span class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate"><i class="pi pi-bolt text-sky-600 dark:text-sky-400"></i><span>Güç Yönetim Sistemi</span></span>' : '') +
        '<button type="button" data-sb-toggle class="p-1 rounded-[2px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-hover cursor-pointer ml-auto transition-colors" title="' + (c ? 'Kenar çubuğunu aç' : 'Kenar çubuğunu kapat') + '">' +
          '<i class="' + (c ? 'pi pi-chevron-right' : 'pi pi-chevron-left') + ' text-xs"></i></button>' +
      '</div>' +
      (!c
        ? '<div class="flex-1 min-h-0 overflow-y-auto py-1.5 text-xs select-none sidebar-tree-scroll">' + sections.filter(s => s.items.length).map(s =>
            '<div class="mb-1.5">' +
              '<button type="button" data-sec="' + s.key + '" class="w-full px-2.5 pt-2 pb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer">' +
                '<span class="flex-grow text-left">' + esc(s.title) + '</span>' +
                (state.secCollapsed[s.key] ? '<span class="font-normal normal-case tracking-normal text-[10px] text-slate-500 dark:text-slate-400">' + s.items.length + '</span>' : '') +
                '<i class="' + (state.secCollapsed[s.key] ? 'pi pi-angle-right' : 'pi pi-angle-down') + ' text-[10px]"></i></button>' +
              (!state.secCollapsed[s.key] ? '<div>' + s.items.map(n => nodeHtml(n, 0)).join('') + '</div>' : '') +
            '</div>').join('') + '</div>'
        : '<div class="flex-1 min-h-0 overflow-y-auto py-1 flex flex-col items-center gap-0.5">' + sections.filter(s => s.items.length).map(s =>
            '<div class="w-6 border-t border-slate-200 dark:border-border-subtle my-1"></div>' +
            s.items.map(n => {
              const on = state.activeNodeId === n.id || (n.children || []).some(k => k.id === state.activeNodeId);
              return '<button type="button" data-node="' + esc(n.id) + '" title="' + esc(n.title) + '" class="relative w-8 h-7 flex items-center justify-center rounded-[2px] cursor-pointer ' +
                (on ? 'bg-sky-600/10 text-sky-600 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-hover') + '">' +
                '<i class="' + n.icon + ' text-[12px]"></i>' +
                (n.status ? '<span class="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style="background:' + SEVERITY_COLOR[n.status] + '"></span>' : '') + '</button>';
            }).join('')).join('') + '</div>');
    const ns = el.querySelector('.sidebar-tree-scroll');
    if (ns) ns.scrollTop = top;
  }
  document.getElementById('pms-sidebar').addEventListener('click', e => {
    if (e.target.closest('[data-sb-toggle]')) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      renderSidebar();
      if (views[current] && views[current].resize) setTimeout(views[current].resize, 220);
      return;
    }
    const sec = e.target.closest('[data-sec]');
    if (sec) { const k = sec.getAttribute('data-sec'); state.secCollapsed[k] = !state.secCollapsed[k]; renderSidebar(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { e.stopPropagation(); const id = tg.getAttribute('data-toggle'); state.expanded[id] = !state.expanded[id]; renderSidebar(); return; }
    const nd = e.target.closest('[data-node]');
    if (nd) selectNode(allNodes().find(n => n.id === nd.getAttribute('data-node')));
  });

  // handleNodeSelect: eylemi olmayan grup düğümü açılır ve ilk alt sayfası seçilir
  function selectNode(n) {
    if (!n) return;
    let target = n;
    if (!n.go && n.children && n.children.length) { state.expanded[n.id] = true; target = n.children[0]; }
    if (!target.go) return;
    state.slFocus = null;
    state.notice = '';
    Object.assign(state, target.go);
    switchView(target.go.view);
  }

  // ---------------------------------------------------------------------------
  // app-schematic-toolbar (PMS görünümleri dışında)
  // ---------------------------------------------------------------------------
  function pageTitleFor() {
    switch (state.view) {
      case 'single-line': { const s = schemaById(state.schema); return s ? (s.title || SCHEMA_TITLE[s.label] || String(s.label).toLocaleUpperCase('tr-TR')) : 'Tek Hat'; }
      case 'compensation': return P.compPage.title;
      case 'generator': return P.genPage(state.gen).title;
      case 'rectifier': return 'Redresör';
      case 'ups': return P.upsInfo(state.ups).title;
      case 'analyzers': return 'Analizörler';
      default: return 'Genel Bakış';
    }
  }
  function renderToolbar() {
    const el = document.getElementById('pms-toolbar');
    // PMS görünümlerinde araç çubuğu yok; tek hat modülü kendi başlığını (başlık, Yenile, Dış Ortam/PUE/CUE) çizer
    if (PMS_VIEWS.indexOf(state.view) >= 0 || (state.view === 'single-line' && SL())) { el.innerHTML = ''; return; }
    const site = D.site;
    const k = P.kpi(state.tick);
    const btnCls = 'px-2.5 py-1 text-xs font-bold rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer';
    const tile = 'flex items-center gap-2 px-2 py-1 border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-[#0b121e] rounded-[2px]';
    el.innerHTML =
      '<div class="px-2 pt-2">' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-2.5 py-1.5 mb-1.5 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">' +
        '<div class="flex flex-wrap items-center gap-2.5 min-w-0">' +
          '<div class="flex items-center gap-1.5 mr-1 min-w-0"><i class="pi pi-map text-sky-600 dark:text-sky-400 font-bold text-sm"></i>' +
            '<span class="font-extrabold text-sm text-slate-900 dark:text-slate-100 tracking-tight truncate" id="pms-page-title">' + esc(state.pageTitle) + '</span></div>' +
          '<button type="button" data-refresh title="Yenile" class="' + btnCls + '" data-report-hide><i class="pi pi-refresh text-xs"></i><span class="hidden sm:inline">Yenile</span></button>' +
          '<span class="hidden xl:inline text-[10px] font-mono text-slate-500 dark:text-slate-400" id="pms-tb-last">Son güncelleme: ' + fmtTime(state.lastUpdate) + '</span>' +
        '</div>' +
        '<div class="flex flex-wrap items-center gap-2 text-xs">' +
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
            '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık PUE</span><span class="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs" id="pms-tb-pue">' + fmt(k.pue, 2) + '</span></div>' +
          '</div>' +
          '<div class="' + tile + '"><div class="relative w-7 h-4 flex flex-col items-center justify-center shrink-0"><svg viewBox="0 0 40 22" class="w-7 h-4">' +
            '<path d="M 4 20 A 16 16 0 0 1 36 20" fill="none" stroke="#1e293b" stroke-width="4" stroke-linecap="round" /><path d="M 4 20 A 16 16 0 0 1 20 4" fill="none" stroke="#0284c7" stroke-width="4" stroke-linecap="round" />' +
            '<path d="M 20 4 A 16 16 0 0 1 36 20" fill="none" stroke="#64748b" stroke-width="4" stroke-linecap="round" /><line x1="20" y1="20" x2="11" y2="11" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" /><circle cx="20" cy="20" r="2.5" fill="#0284c7" /></svg></div>' +
            '<div><span class="text-[9px] text-slate-500 dark:text-slate-400 font-extrabold uppercase block leading-none">Anlık CUE</span><span class="font-mono font-black text-sky-600 dark:text-sky-400 text-xs">' + fmt(site.cue || 0, 2) + '</span></div>' +
          '</div>' +
        '</div>' +
      '</div></div>';
  }
  document.getElementById('pms-toolbar').addEventListener('click', e => {
    const r = e.target.closest('[data-refresh]');
    if (!r) return;
    const i = r.querySelector('i');
    i.classList.add('pi-spin');
    setTimeout(() => i.classList.remove('pi-spin'), 600);
    liveTick();
  });

  // ---------------------------------------------------------------------------
  // pms-ring: halka / yarım daire göstergesi (pathLength=100, stroke-dashoffset; değer değişiminde geçişle kayar)
  // ---------------------------------------------------------------------------
  function ringHtml(cls, mode, n, thickness, center, aria) {
    const r = 50 - thickness / 2 - 1;
    let svg;
    if (mode === 'gauge') {
      const d = 'M ' + (50 - r) + ' 50 A ' + r + ' ' + r + ' 0 0 1 ' + (50 + r) + ' 50';
      svg = '<svg viewBox="0 0 100 56" role="img" aria-label="' + esc(aria) + '"><path d="' + d + '" class="track" stroke-width="' + thickness + '"></path>' +
        '<path d="' + d + '" pathLength="100" class="arc" stroke-width="' + thickness + '" style="stroke-dashoffset:100"><title></title></path></svg>';
    } else {
      let arcs = '';
      for (let i = 0; i < n; i++) arcs += '<circle cx="50" cy="50" r="' + r + '" pathLength="100" class="arc" stroke-width="' + thickness + '" style="stroke-dashoffset:100;transform:rotate(-90deg)"><title></title></circle>';
      svg = '<svg viewBox="0 0 100 100" role="img" aria-label="' + esc(aria) + '"><circle cx="50" cy="50" r="' + r + '" class="track" stroke-width="' + thickness + '"></circle>' + arcs + '</svg>';
    }
    return '<div class="pms-ring ' + cls + '" data-ring-mode="' + mode + '">' + svg + '<div class="center' + (mode === 'gauge' ? ' center-gauge' : '') + '">' + center + '</div></div>';
  }
  // ngOnChanges karşılığı: max verilirse ilk dilim min..max ölçeğine göre; yoksa dilimler toplama göre oranlanır
  function setRing(el, slices, opts) {
    if (!el) return;
    const o = opts || {};
    const val = s => (s.value != null && isFinite(s.value) && s.value > 0 ? s.value : 0);
    let arcs;
    if (o.max != null) {
      const s = slices[0];
      const min = o.min || 0, span = o.max - min;
      arcs = s ? [{ len: span > 0 && val(s) > 0 ? Math.max(0, Math.min(100, (val(s) - min) / span * 100)) : 0, rot: -90, color: s.color, label: s.label || '' }] : [];
    } else {
      const total = slices.reduce((a, s) => a + val(s), 0);
      const gap = slices.filter(s => val(s) > 0).length > 1 ? 0.8 : 0;
      let start = 0;
      arcs = slices.map(s => {
        const share = total > 0 ? val(s) / total * 100 : 0;
        const a = { len: share > 0 ? Math.max(0, share - gap) : 0, rot: -90 + start * 3.6, color: s.color, label: s.label || '' };
        start += share;
        return a;
      });
    }
    if (!el.hasAttribute('data-ready')) { void el.getBoundingClientRect(); el.setAttribute('data-ready', ''); }
    const gauge = el.getAttribute('data-ring-mode') === 'gauge';
    el.querySelectorAll('.arc').forEach((node, i) => {
      const a = arcs[i] || { len: 0, rot: -90, color: 'transparent', label: '' };
      node.style.stroke = a.color;
      node.style.strokeDashoffset = String(100 - a.len);
      if (!gauge) node.style.transform = 'rotate(' + a.rot + 'deg)';
      const t = node.querySelector('title');
      if (t) t.textContent = a.label;
    });
  }

  // ===========================================================================
  // 1) GENEL BAKIŞ (pms-dashboard.component)
  // ===========================================================================
  const KIND_LABEL = { transformer: 'Trafo', generator: 'Jeneratör', grid: 'Şebeke' };
  const KIND_ICON = { transformer: 'pi pi-box', generator: 'pi pi-cog', grid: 'pi pi-globe' };
  const SPARK_LEN = 30;
  const hist = { it: [], cool: [], trafo: [], pue: [] };
  (function seedSpark() {
    for (let t = -SPARK_LEN + 1; t <= 0; t++) {
      const k = P.kpi(t);
      hist.it.push(k.itKw); hist.cool.push(k.coolingKw); hist.trafo.push(k.trafoKva); hist.pue.push(k.pue);
    }
  })();
  let lastSparkTick = 0;
  function pushSpark(k) {
    if (state.tick === lastSparkTick) return;
    lastSparkTick = state.tick;
    [['it', k.itKw], ['cool', k.coolingKw], ['trafo', k.trafoKva], ['pue', k.pue]].forEach(([key, v]) => {
      if (v == null || !isFinite(v)) return;
      hist[key].push(v);
      if (hist[key].length > SPARK_LEN) hist[key].splice(0, hist[key].length - SPARK_LEN);
    });
  }
  function sparkPath(h) {
    if (h.length < 2) return '';
    const lo = Math.min.apply(null, h), hi = Math.max.apply(null, h), span = hi - lo;
    return h.map((y, i) => (i ? 'L' : 'M') + (i / (h.length - 1) * 100).toFixed(1) + ' ' + (span > 0 ? 22 - (y - lo) / span * 20 : 12).toFixed(1)).join(' ');
  }
  const kpiCard = (key, icon, label, unit, spark) =>
    '<div class="kpi-card" data-kpi="' + key + '">' +
      '<div class="kpi-label"><i class="' + icon + '"></i> ' + esc(label) + '</div>' +
      (spark
        ? '<div class="kpi-row"><div class="kpi-value"><span data-kv>—</span><span class="kpi-unit" data-ku>' + esc(unit) + '</span></div>' +
          '<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d=""></path></svg></div>'
        : '<div class="kpi-value"><span data-kv>—</span><span class="kpi-unit" data-ku>' + esc(unit) + '</span></div>') +
    '</div>';
  const legendRows = (key, rows) => '<ul class="legend" data-legend="' + key + '">' + rows.map(r =>
    '<li data-li="' + r + '"><i class="dot"></i><span class="lg-lbl"></span><span class="lg-val"></span><span class="lg-pct"></span></li>').join('') + '</ul>';

  const views = {};
  views.overview = {
    mount(el) {
      el.innerHTML =
        '<div class="pms-host"><div class="pms-page text-slate-800 dark:text-slate-100">' +
          // Başlık satırı
          '<div class="flex items-center gap-2 min-w-0">' +
            '<div class="flex items-center gap-2 min-w-0"><i class="pi pi-bolt text-sky-600 dark:text-sky-400"></i>' +
              '<span class="text-sm font-bold tracking-wide truncate">Güç Yönetim Sistemi · Genel Bakış</span>' +
              '<span class="text-[10px] px-1.5 py-0.5 rounded-[2px] bg-slate-200 dark:bg-surface-panel text-slate-600 dark:text-slate-300">Salt izleme</span></div>' +
            '<span id="ov-notice"></span>' +
            '<span class="ml-auto shrink-0 text-[11px] muted" id="ov-last"></span>' +
            '<button type="button" data-open-bms class="tool-btn shrink-0" title="Bina yönetim görünümüne (BMS) geç" data-report-hide><i class="pi pi-building text-[11px]"></i> BMS\'e geç</button>' +
            '<button type="button" data-sources class="tool-btn shrink-0" data-report-hide><i class="pi pi-database text-[11px]"></i> Veri kaynakları</button>' +
          '</div>' +
          // KPI şeridi
          '<div class="kpi-strip">' +
            kpiCard('it', 'pi pi-server', 'BT yükü', 'kW', true) +
            kpiCard('cool', 'pi pi-sun', 'Soğutma yükü', 'kW', true) +
            kpiCard('trafo', 'pi pi-box', 'Trafo yükü', 'kVA', true) +
            kpiCard('pue', 'pi pi-chart-line', 'PUE', '', true) +
            kpiCard('ups', 'pi pi-th-large', 'UPS modülü', 'adet', false) +
            kpiCard('alm', 'pi pi-bell', 'Aktif güç alarmı', '', false) +
          '</div>' +
          '<div class="pms-main">' +
            '<div class="charts area-charts">' +
              '<section class="panel chart-panel"><header class="panel-head"><span><i class="pi pi-chart-pie"></i> Yük dağılımı</span><span class="head-note" id="ov-load-note"></span></header>' +
                '<div class="chart-body">' + ringHtml('ring-lg', 'donut', 3, 12, '<span class="ring-val" data-c="load">—</span><span class="ring-unit">kW toplam</span>', 'Yük dağılımı') + legendRows('load', ['it', 'cool', 'other']) + '</div></section>' +
              '<section class="panel chart-panel"><header class="panel-head"><span><i class="pi pi-gauge"></i> PUE</span><span class="head-note">anlık</span></header>' +
                '<div class="chart-body"><div class="gauge-wrap">' + ringHtml('ring-gauge', 'gauge', 1, 11, '<span class="ring-val" data-c="pue">—</span>', 'PUE göstergesi, ölçek 1,0 ile 3,0') +
                  '<div class="gauge-scale"><span>1,0</span><span>3,0</span></div></div>' +
                  '<ul class="legend legend-text"><li><span class="lg-lbl">Ölçek</span><span class="lg-val">1,0–3,0</span></li><li><span class="lg-lbl">Hesap</span><span class="lg-val">sunucu, 15 dk</span></li><li><span class="lg-lbl">Kategori</span><span class="lg-val nodata">belirlenmedi</span></li></ul></div></section>' +
              '<section class="panel chart-panel"><header class="panel-head"><span><i class="pi pi-arrows-h"></i> A/B dengesi</span>' +
                '<i class="pi pi-info-circle head-info" title="İki yollu (A/B) beslemede bir yol kesildiğinde yükün tamamı öbür yola geçer. Pano eşleri ve faz doluluğu için Şalter Yedeklilik raporuna bakın."></i></header>' +
                '<div class="chart-body">' + ringHtml('ring-lg', 'donut', 2, 12, '<span class="ring-val" data-c="ab">—</span><span class="ring-unit">puan fark</span>', 'A/B besleme dengesi') +
                  '<ul class="legend" data-legend="ab"><li data-li="a"><i class="dot"></i><span class="lg-lbl"></span><span class="lg-val"></span><span class="lg-pct"></span></li><li data-li="b"><i class="dot"></i><span class="lg-lbl"></span><span class="lg-val"></span><span class="lg-pct"></span></li><li class="lg-foot" data-c="abfoot"></li></ul></div></section>' +
              '<section class="panel chart-panel"><header class="panel-head"><span><i class="pi pi-bell"></i> Alarm önemi</span></header>' +
                '<div class="chart-body">' + ringHtml('ring-lg', 'donut', 4, 12, '<span class="ring-val" data-c="sev">—</span><span class="ring-unit">aktif</span>', 'Aktif güç alarmlarının önem dağılımı') + legendRows('sev', SEV_ORDER) + '</div></section>' +
            '</div>' +
            '<section class="panel area-src"><header class="panel-head"><span><i class="pi pi-sitemap"></i> Kaynaklar ve dağıtım</span>' +
              '<button type="button" class="link-btn" data-go-analyzers>Tüm analizörler <i class="pi pi-arrow-right text-[9px]"></i></button></header>' +
              '<div class="panel-body src-grid" id="ov-src"></div></section>' +
            '<section class="panel area-alm"><header class="panel-head"><span><i class="pi pi-bell"></i> Güç alarmları</span><span class="flex items-center gap-2 text-[10px] font-normal" id="ov-alm-counts"></span></header>' +
              '<div id="ov-locate" class="pms-locate-msg"></div>' +
              '<div class="panel-body divide-y divide-slate-200 dark:divide-border-subtle" id="ov-alm"></div></section>' +
            '<section class="panel area-std"><header class="panel-head"><span><i class="pi pi-book"></i> Sektör standartları ve araştırma</span></header>' +
              '<div class="panel-body space-y-2" id="ov-std"></div></section>' +
          '</div>' +
        '</div>' +
        // Veri kaynakları penceresi
        '<div class="pms-dlg-backdrop fixed inset-0 z-50 flex items-center justify-center p-4" id="ov-dlg" style="display:none">' +
          '<div class="src-dialog w-full max-w-3xl max-h-[80vh] overflow-auto rounded-[2px] shadow-xl" data-dlg-body>' +
            '<div class="dlg-head flex items-center px-3 py-2"><span class="text-sm font-bold"><i class="pi pi-database mr-1.5"></i>Veri kaynakları</span>' +
              '<button type="button" class="ml-auto row-btn" data-dlg-close><i class="pi pi-times"></i></button></div>' +
            '<table class="w-full text-xs"><thead><tr class="text-left muted"><th class="px-3 py-1.5 font-semibold">Bileşen</th><th class="px-3 py-1.5 font-semibold">Durum</th><th class="px-3 py-1.5 font-semibold">Kaynak</th></tr></thead><tbody>' +
              P.dataSources.map(r => '<tr><td class="px-3 py-1.5">' + esc(r.component) + '</td><td class="px-3 py-1.5"><span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold whitespace-nowrap ' +
                (r.state === 'Canlı' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : r.state === 'Türetilmiş' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' : r.state === 'Gezinme' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300') +
                '">' + esc(r.state) + '</span></td><td class="px-3 py-1.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">' + esc(r.source) + '</td></tr>').join('') +
            '</tbody></table>' +
            '<p class="px-3 py-2 text-[10px] muted">Bu sayfada demo veri kullanılmaz; ölçümü olmayan öğe "Yok" olarak gösterilir. "Türetilmiş" öğeler canlı ölçümlerden hesaplanır; "göreli" halkalar anma kapasitesine değil aynı türdeki en büyük değere göredir. Kontrol/komut yoktur; tek işlem alarm onayıdır ("Gördüm").</p>' +
            '<p class="px-3 pb-2 text-[10px] font-semibold text-amber-700 dark:text-amber-400"><i class="pi pi-info-circle text-[10px] mr-1"></i>Sunum kopyası: tablodaki kaynaklar üründeki gerçek sorgulardır; bu ekrandaki tüm değerler tohumlu mock veridir (js/mock/pms.data.js).</p>' +
          '</div>' +
        '</div></div>';
      // Kaynak kartları (liste sabit; değerler yerinde güncellenir)
      document.getElementById('ov-src').innerHTML = P.sources(state.tick).map(s =>
        '<div class="src-card" data-src="' + esc(s.id) + '">' +
          '<div class="flex items-center gap-1.5 min-w-0"><i class="' + KIND_ICON[s.kind] + ' muted text-xs"></i>' +
            '<span class="text-[10px] uppercase tracking-wider muted">' + KIND_LABEL[s.kind] + '</span>' +
            (s.feed ? '<span class="feed-chip' + (s.feed === 'B' ? ' feed-b' : '') + '">' + s.feed + '</span>' : '') +
            '<span class="ml-auto flex items-center gap-1.5 shrink-0"><span class="text-[10px] muted" data-f="nodata" style="display:none">veri yok</span>' +
              '<button type="button" class="icon-btn" data-bms-dev="' + esc(s.id) + '" title="Mekânsal konum (BMS)" aria-label="Mekânsal konum (BMS)"><i class="pi pi-map-marker"></i></button></span></div>' +
          '<div class="src-body"><div class="min-w-0 flex-1">' +
              '<div class="text-xs font-semibold truncate mt-0.5" title="' + esc(s.title) + '">' + esc(s.title) + '</div>' +
              '<div class="flex items-baseline gap-3 mt-1"><div><span class="text-xl font-bold tabular-nums" data-f="kw">—</span><span class="kpi-unit">kW</span></div>' +
                '<div class="muted"><span class="text-sm font-semibold tabular-nums" data-f="kva">—</span><span class="kpi-unit">kVA</span></div></div></div>' +
            '<div class="src-ring" title="Aynı türdeki en büyük değere göre göreli yük; anma kapasitesi okunmadığı için % doluluk değildir">' +
              ringHtml('ring-xs', 'donut', 1, 14, '<span class="ring-xs-val" data-f="rel">—</span>', 'Göreli yük') + '<span class="rel-note">göreli</span></div></div>' +
          '<div class="grid grid-cols-3 gap-1 mt-1 text-[10px] muted tabular-nums"><span>PF <b class="strong" data-f="pf">—</b></span><span>U <b class="strong" data-f="volt">—</b> V</span><span>I <b class="strong" data-f="curr">—</b> A</span></div>' +
        '</div>').join('');
      this.almSig = '';
      el.addEventListener('click', this.onClick);
      this.renderNotice();
    },
    unmount(el) { el.removeEventListener('click', this.onClick); },
    renderNotice() {
      const n = document.getElementById('ov-notice');
      if (!n) return;
      n.className = state.notice ? 'notice-band min-w-0' : '';
      n.setAttribute('role', 'status');
      n.innerHTML = state.notice ? '<i class="pi pi-info-circle"></i><span class="truncate" title="' + esc(state.notice) + '">' + esc(state.notice) + '</span>' +
        '<button type="button" class="notice-x" data-notice-x title="Kapat" aria-label="Bilgi bandını kapat"><i class="pi pi-times"></i></button>' : '';
    },
    onClick(e) {
      const t = e.target;
      if (t.closest('[data-notice-x]')) { state.notice = ''; views.overview.renderNotice(); return; }
      if (t.closest('[data-open-bms]')) { openBms({}); return; }
      const dlg = document.getElementById('ov-dlg');
      if (t.closest('[data-sources]')) { dlg.style.display = 'flex'; return; }
      if (t.closest('[data-dlg-close]') || (t === dlg)) { dlg.style.display = 'none'; return; }
      if (t.closest('[data-go-analyzers]')) { switchView('analyzers'); return; }
      const bd = t.closest('[data-bms-dev]');
      if (bd) { openBms({ dev: bd.getAttribute('data-bms-dev') }); return; }
      const row = t.closest('[data-alm]');
      if (!row) return;
      const a = alarms().find(x => x.key === row.getAttribute('data-alm'));
      if (!a) return;
      if (t.closest('[data-locate]')) { locateAlarm(a); return; }
      if (t.closest('[data-bms-alarm]')) { openBms({ alarm: a }); return; }
      const ack = t.closest('[data-ack]');
      if (ack && !ack.disabled) {
        ack.disabled = true;
        ack.innerHTML = '<i class="pi pi-spin pi-spinner"></i> Gördüm';
        setTimeout(() => {
          state.acks.add(a.key);
          try { DCIM.ui.storage.sessionSet('dcim_pms_ack_v1', JSON.stringify(Array.from(state.acks))); } catch (err) { /* yok say */ }
          toast((a.title || a.rid) + ' alarmı onaylandı (Gördüm).', 'success', 'Güç alarmları');
          views.overview.update();
        }, 700);
      }
    },
    update() {
      const k = P.kpi(state.tick);
      pushSpark(k);
      const al = alarms();
      const kpi = key => document.querySelector('[data-kpi="' + key + '"]');
      const setKpi = (key, val, nodata) => {
        const c = kpi(key);
        const v = c.querySelector('[data-kv]');
        v.textContent = val;
        c.querySelector('.kpi-value').classList.toggle('nodata', !!nodata);
        const sp = c.querySelector('.spark path');
        if (sp) sp.setAttribute('d', sparkPath(hist[key]));
      };
      setKpi('it', fmt(k.itKw), k.itKw == null);
      setKpi('cool', fmt(k.coolingKw), k.coolingKw == null);
      setKpi('trafo', fmt(k.trafoKva), k.trafoKva == null);
      setKpi('pue', k.pue > 0 ? fmt(k.pue, 2) : '—', !(k.pue > 0));
      setKpi('ups', String(k.upsCount));
      const unacked = al.filter(a => !a.acked).length;
      const ac = kpi('alm');
      ac.querySelector('[data-kv]').textContent = String(al.length);
      ac.querySelector('[data-ku]').textContent = unacked ? unacked + ' onay bekliyor' : '';
      ac.classList.toggle('kpi-alert', al.length > 0);
      ac.style.borderLeftColor = al.length ? SEVERITY_COLOR[al[0].sev] : '';
      const last = document.getElementById('ov-last');
      if (last) last.textContent = 'Son güncelleme ' + fmtTime(state.lastUpdate);

      // Yük dağılımı (Diğer = tesis girişi − BT − soğutma; negatifse yalnız BT + soğutma)
      const known = (k.itKw || 0) + (k.coolingKw || 0);
      const other = k.facilityKw != null ? k.facilityKw - known : null;
      const partial = other == null || other < 0;
      const total = partial ? known : k.facilityKw;
      const loadItems = [
        { key: 'it', label: 'BT yükü', value: k.itKw, color: 'var(--pms-s1)' },
        { key: 'cool', label: 'Soğutma', value: k.coolingKw, color: 'var(--pms-s2)' },
        { key: 'other', label: 'Diğer', value: partial ? null : other, color: 'var(--pms-s3)' }
      ];
      const ringIn = q => document.querySelector(q);
      setRing(ringIn('[data-legend="load"]').previousElementSibling, loadItems);
      document.getElementById('ov-load-note').textContent = partial ? 'BT + soğutma' : '';
      document.querySelector('[data-c="load"]').textContent = fmt(total, 0);
      const fillLegend = (key, items) => items.forEach(i => {
        const li = document.querySelector('[data-legend="' + key + '"] [data-li="' + i.key + '"]');
        if (!li) return;
        li.style.display = i.hidden ? 'none' : '';
        li.classList.toggle('lg-zero', !!i.zero);
        li.querySelector('.dot').style.background = i.color;
        const lbl = li.querySelector('.lg-lbl'); lbl.textContent = i.label; lbl.title = i.label;
        const v = li.querySelector('.lg-val'); v.textContent = i.text != null ? i.text : fmt(i.value, i.d == null ? 0 : i.d); v.classList.toggle('nodata', i.value == null);
        li.querySelector('.lg-pct').textContent = i.pct == null ? '—' : '%' + fmt(i.pct, 0);
      });
      fillLegend('load', loadItems.map(i => Object.assign({}, i, { hidden: i.key === 'other' && partial, pct: total > 0 && i.value != null ? i.value / total * 100 : null })));

      // PUE (ölçek 1–3, eşik bandı yok)
      setRing(document.querySelector('.ring-gauge'), [{ value: k.pue > 0 ? k.pue : null, color: 'var(--pms-s1)', label: 'PUE' }], { min: 1, max: 3 });
      const pv = document.querySelector('[data-c="pue"]');
      pv.textContent = k.pue > 0 ? fmt(k.pue, 2) : '—';

      // A/B dengesi
      const ft = (k.feedA || 0) + (k.feedB || 0);
      const aPct = ft > 0 ? (k.feedA || 0) / ft * 100 : 50;
      const abItems = [
        { key: 'a', label: 'A tarafı', value: k.feedA, color: 'var(--pms-s1)', pct: ft > 0 ? aPct : null, d: 1 },
        { key: 'b', label: 'B tarafı', value: k.feedB, color: 'var(--pms-s2)', pct: ft > 0 ? 100 - aPct : null, d: 1 }
      ];
      setRing(ringIn('[data-legend="ab"]').previousElementSibling, abItems);
      fillLegend('ab', abItems);
      document.querySelector('[data-c="ab"]').textContent = ft > 0 ? 'Δ' + fmt(Math.abs(aPct - (100 - aPct)), 0) : '—';
      document.querySelector('[data-c="abfoot"]').textContent = 'Toplam ' + fmt(ft) + ' kW';

      // Alarm önemi
      const counts = { acil: 0, alarm: 0, uyari: 0, kayip: 0 };
      al.forEach(a => { counts[a.sev]++; });
      const sevItems = SEV_ORDER.map(s => ({ key: s, label: s === 'kayip' ? 'Kayıp (veri yok)' : sevLabel(s), value: counts[s], text: String(counts[s]), color: SEVERITY_COLOR[s], pct: al.length ? counts[s] / al.length * 100 : null, zero: !counts[s] }));
      setRing(ringIn('[data-legend="sev"]').previousElementSibling, sevItems);
      fillLegend('sev', sevItems);
      document.querySelector('[data-c="sev"]').textContent = String(al.length);

      // Kaynak kartları
      P.sources(state.tick, k.meters).forEach(s => {
        const c = document.querySelector('[data-src="' + s.id + '"]');
        if (!c) return;
        const f = n => c.querySelector('[data-f="' + n + '"]');
        f('kw').textContent = fmt(s.kw); f('kw').classList.toggle('nodata', s.kw == null);
        f('kva').textContent = fmt(s.kva);
        f('pf').textContent = fmt(s.pf, 2);
        f('volt').textContent = fmt(s.volt, 0);
        f('curr').textContent = fmt(s.curr, 0);
        f('nodata').style.display = s.loaded ? 'none' : '';
        f('rel').textContent = s.rel == null ? '—' : '%' + fmt(s.rel, 0);
        f('rel').classList.toggle('nodata', s.rel == null);
        setRing(c.querySelector('.pms-ring'), [{ value: s.rel, color: 'var(--pms-s1)', label: 'Göreli yük' }], { max: 100 });
      });

      // Güç alarmları (yalnız liste değişince yeniden çizilir)
      document.getElementById('ov-alm-counts').innerHTML = ['acil', 'alarm', 'kayip', 'uyari'].filter(s => counts[s]).map(s =>
        '<span class="flex items-center gap-1"><i class="sev-dot" style="background:' + SEVERITY_COLOR[s] + '"></i>' + sevLabel(s) + ' ' + counts[s] + '</span>').join('');
      const sig = al.map(a => a.key + (a.acked ? '+' : '-')).join('|');
      if (sig !== this.almSig) {
        this.almSig = sig;
        document.getElementById('ov-alm').innerHTML = al.length ? al.map(a =>
          '<div class="flex items-center gap-2 py-1.5 text-xs" data-alm="' + esc(a.key) + '">' +
            '<span class="w-1 self-stretch rounded-[1px]" style="background:' + SEVERITY_COLOR[a.sev] + '"></span>' +
            '<span class="sev-text w-12 shrink-0 text-[10px] font-bold uppercase" style="--sev:' + SEVERITY_COLOR[a.sev] + '">' + sevLabel(a.sev) + '</span>' +
            '<div class="min-w-0 flex-1"><div class="truncate font-medium" title="' + esc(a.text) + '">' + esc(a.title || a.rid) + '</div>' +
              '<div class="truncate text-[10px] muted" title="' + esc(a.text) + '">' + esc(a.text) + '</div></div>' +
            (!a.acked ? '<span class="text-[9px] px-1 rounded-[2px] bg-slate-200 dark:bg-surface-panel text-slate-600 dark:text-slate-300">YENİ</span>' : '') +
            '<button type="button" class="row-btn" data-locate title="Tek hatta göster" aria-label="Tek hatta göster"><i class="pi pi-sitemap"></i></button>' +
            '<button type="button" class="row-btn" data-bms-alarm title="Mekânsal konum (BMS)" aria-label="Mekânsal konum (BMS)"><i class="pi pi-map-marker"></i></button>' +
            (!a.acked ? '<button type="button" class="row-btn" data-ack><i class="pi pi-eye"></i> Gördüm</button>' : '') +
          '</div>').join('')
          : '<div class="empty"><i class="pi pi-check-circle text-emerald-600 dark:text-emerald-400 mr-1"></i>Aktif güç alarmı yok.</div>';
      }

      // Sektör standartları
      const S = P.standards;
      document.getElementById('ov-std').innerHTML =
        '<div class="std-card"><div class="std-title">' + esc(S.pue.title) + '</div><div class="flex items-baseline gap-2"><span class="text-lg font-bold tabular-nums">' + fmt(k.pue, 2) + '</span><span class="text-[11px] muted">PUE (anlık)</span></div><p class="std-text">' + esc(S.pue.text) + '</p></div>' +
        '<div class="std-card"><div class="std-title">' + esc(S.tier.title) + '</div><div class="flex items-baseline gap-2"><span class="text-lg font-bold tabular-nums">%' + fmt(aPct, 0) + ' / %' + fmt(100 - aPct, 0) + '</span><span class="text-[11px] muted">A/B payı</span></div><p class="std-text">' + esc(S.tier.text) + '</p></div>' +
        '<div class="std-card"><div class="std-title">' + esc(S.quality.title) + '</div><div class="text-[12px] font-semibold muted">Ölçüm yok — sonraki faz</div><p class="std-text">' + esc(S.quality.text) + '</p></div>' +
        '<div class="std-card"><div class="std-title">' + esc(S.alarm.title) + '</div><div class="flex items-baseline gap-2"><span class="text-lg font-bold tabular-nums">' + al.length + '</span><span class="text-[11px] muted">aktif güç alarmı · ' + unacked + ' onay bekliyor</span></div><p class="std-text">' + esc(S.alarm.text) + '</p></div>' +
        '<p class="text-[10px] muted leading-snug">' + esc(S.source) + '</p>';
    }
  };

  // "Tek hatta göster": alarm kaynağını içeren tek hat şemasını alarm işaretiyle açar
  function focusFor(a, devId) {
    return a ? { devId, rid: a.rid, severity: toFocusSev(a.sev), text: a.text || a.title || '', time: DCIM.ui.fmtDateTime(a.tim) } : { devId };
  }
  function locateAlarm(a) {
    const r = resolveSrc(a.rid, a.devId) || (a.schemaId && SL() ? { schemaId: a.schemaId, devId: a.devId } : null);
    const msg = document.getElementById('ov-locate');
    if (!r && a.ups) {
      // UPS modülleri tek hat şemalarında yok: sunumda ilgili UPS paneli açılır
      state.ups = a.ups;
      switchView('ups');
      toast('UPS ' + a.ups + ' tek hat şemalarında yer almıyor; UPS paneli açıldı.', 'info', 'PMS · Güç Yönetimi');
      return true;
    }
    if (!r) {
      if (msg) {
        msg.textContent = SL() ? 'Bu alarmın kaynağı tek hat sayfalarında bulunamadı.' : 'Tek hat modülü bu sunumda yüklü değil; alarm kaynağı gösterilemiyor.';
        clearTimeout(locateAlarm.t);
        locateAlarm.t = setTimeout(() => { if (msg) msg.textContent = ''; }, 4000);
      }
      return false;
    }
    state.schema = r.schemaId;
    state.slFocus = focusFor(a, r.devId || a.devId);
    switchView('single-line');
    return true;
  }

  // ===========================================================================
  // 2) ANALİZÖRLER (analyzers-view.component)
  // ===========================================================================
  const METER_OF_LABEL = { transformer: 'Trafo', generator: 'Jeneratör', compensation: 'Kompanzasyon', grid: 'Şebeke', breaker: 'Şalter', common_load: 'Ortak yük', chiller: 'Chiller', rectifier: 'Redresör' };
  const anState = { filter: '', collapsed: new Set() };
  function analyzerGroups() {
    const map = new Map();
    P.analyzers.forEach(m => {
      if (!map.has(m.loc)) map.set(m.loc, { key: 'loc:' + m.loc, title: m.loc, cards: [] });
      map.get(m.loc).cards.push(m);
    });
    const groups = Array.from(map.values());
    groups.forEach(g => g.cards.sort((a, b) => a.title.localeCompare(b.title, 'tr', { numeric: true })));
    return groups.sort((a, b) => a.title.localeCompare(b.title, 'tr', { numeric: true }));
  }
  views.analyzers = {
    mount(el) {
      const groups = analyzerGroups();
      el.innerHTML =
        '<div class="pms-host"><div class="pms-page-an text-slate-800 dark:text-slate-100">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<i class="pi pi-chart-bar text-sky-600 dark:text-sky-400"></i><span class="text-sm font-bold">Analizörler</span>' +
            '<span class="text-[11px] muted">' + P.analyzers.length + ' cihaz · canlı</span>' +
            '<div class="ml-auto flex items-center gap-2"><span class="text-[11px] muted" id="an-last"></span>' +
              '<div class="relative"><i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] muted"></i>' +
              '<input type="text" id="an-search" value="' + esc(anState.filter) + '" placeholder="Analizör ara" class="an-search" /></div></div>' +
          '</div>' +
          '<div class="an-scroll">' + groups.map(g =>
            '<section class="panel" data-group="' + esc(g.key) + '">' +
              '<header class="panel-head cursor-pointer select-none" data-toggle-group="' + esc(g.key) + '"><span>' +
                '<i class="' + (anState.collapsed.has(g.key) ? 'pi pi-chevron-right' : 'pi pi-chevron-down') + '"></i> ' + esc(g.title) +
                ' <span class="font-normal text-[11px] muted">' + g.cards.length + ' analizör</span></span>' +
                '<span class="font-normal text-[11px] muted tabular-nums" data-gtotal></span></header>' +
              '<div class="grid gap-2 an-grid"' + (anState.collapsed.has(g.key) ? ' style="display:none"' : '') + '>' + g.cards.map(c =>
                '<div class="an-card" data-an="' + esc(c.id) + '" data-q="' + esc(lc(c.title + ' ' + c.id)) + '">' +
                  '<div class="flex items-center gap-1.5 min-w-0"><span class="text-xs font-semibold truncate" title="' + esc(c.title + ' (' + c.id + ')') + '">' + esc(c.title) + '</span>' +
                    (c.feed ? '<span class="feed-chip' + (c.feed === 'B' ? ' feed-b' : '') + '">' + c.feed + '</span>' : '') +
                    (c.meterOf ? '<span class="ml-auto shrink-0 text-[9px] uppercase tracking-wider muted">' + esc(METER_OF_LABEL[c.meterOf] || c.meterOf) + '</span>' : '') + '</div>' +
                  '<div class="text-[10px] nodata mt-1" data-f="wait" style="display:none">veri bekleniyor…</div>' +
                  '<div class="flex items-end gap-3 mt-1.5">' +
                    '<div class="an-metric"><span class="lbl">Aktif güç</span><span class="val val-lg" data-f="kw">—</span></div>' +
                    '<div class="an-metric"><span class="lbl">Görünür</span><span class="val val-sub" data-f="kva">—</span></div></div>' +
                  '<div class="mini-bar"><div data-f="kwbar"></div></div>' +
                  '<div class="grid grid-cols-4 gap-1.5 mt-2">' +
                    '<div class="an-metric"><span class="lbl">Gerilim</span><span class="val val-sm" data-f="volt">—</span></div>' +
                    '<div class="an-metric"><span class="lbl">Akım</span><span class="val val-sm" data-f="curr">—</span></div>' +
                    '<div class="an-metric"><span class="lbl">PF</span><span class="val val-sm" data-f="pf">—</span><div class="mini-bar"><div data-f="pfbar"></div></div></div>' +
                    '<div class="an-metric"><span class="lbl">Frekans</span><span class="val val-sm" data-f="freq">—</span></div>' +
                  '</div>' +
                '</div>').join('') + '</div>' +
            '</section>').join('') + '</div>' +
        '</div></div>';
      el.querySelector('#an-search').addEventListener('input', e => { anState.filter = e.target.value; this.applyFilter(); });
      el.querySelectorAll('[data-toggle-group]').forEach(h => h.addEventListener('click', () => {
        const key = h.getAttribute('data-toggle-group');
        if (anState.collapsed.has(key)) anState.collapsed.delete(key); else anState.collapsed.add(key);
        h.nextElementSibling.style.display = anState.collapsed.has(key) ? 'none' : '';
        h.querySelector('i').className = anState.collapsed.has(key) ? 'pi pi-chevron-right' : 'pi pi-chevron-down';
      }));
      this.applyFilter();
    },
    applyFilter() {
      const f = lc(anState.filter.trim());
      document.querySelectorAll('[data-an]').forEach(c => { c.style.display = !f || c.getAttribute('data-q').indexOf(f) >= 0 ? '' : 'none'; });
    },
    update() {
      const m = P.meters(state.tick);
      const al = alarms();
      const last = document.getElementById('an-last');
      if (last) last.textContent = 'Son güncelleme ' + fmtTime(state.lastUpdate);
      const unit = (v, d, u) => fmt(v, d) + (u ? '<span class="unit">' + u + '</span>' : '');
      analyzerGroups().forEach(g => {
        const maxKw = Math.max(1, ...g.cards.map(c => m[c.id].kw || 0));
        const vals = g.cards.map(c => m[c.id].kw).filter(v => v != null);
        const tot = document.querySelector('[data-group="' + g.key + '"] [data-gtotal]');
        if (tot) tot.textContent = vals.length ? 'Toplam ' + fmt(vals.reduce((a, b) => a + b, 0)) + ' kW' : '';
        g.cards.forEach(c => {
          const card = document.querySelector('[data-an="' + c.id + '"]');
          if (!card) return;
          const v = m[c.id];
          const f = n => card.querySelector('[data-f="' + n + '"]');
          const sev = maxSev(al.filter(a => alarmOn(a, c.id)));
          card.style.borderLeft = sev ? '3px solid ' + SEVERITY_COLOR[sev] : '';
          f('wait').style.display = v.loaded ? 'none' : '';
          f('kw').innerHTML = unit(v.kw, 1, 'kW'); f('kw').classList.toggle('nodata', v.kw == null);
          f('kva').innerHTML = unit(v.kva, 1, 'kVA');
          f('kwbar').style.width = (v.kw == null ? 0 : Math.max(0, Math.min(100, v.kw / maxKw * 100))) + '%';
          f('volt').innerHTML = unit(v.vln, 0, 'V');
          f('curr').innerHTML = unit(v.curr, 0, 'A');
          f('pf').innerHTML = fmt(v.pf, 2);
          f('pfbar').style.width = (v.pf == null ? 0 : Math.max(0, Math.min(100, Math.abs(v.pf) * 100))) + '%';
          f('freq').innerHTML = unit(v.freq, 1, 'Hz');
        });
      });
    }
  };

  // ===========================================================================
  // 3) TEK HAT (EnergySingleLineComponent → js/pms/single-line.js)
  // ===========================================================================
  views['single-line'] = {
    inst: null,
    mount(el) {
      const sl = SL();
      if (!sl) {
        const s = schemaById(state.schema);
        el.innerHTML =
          '<div class="h-full flex items-center justify-center p-6"><div class="' + CARD + ' max-w-md w-full p-6 text-center">' +
            '<div class="w-10 h-10 mx-auto mb-3 rounded-[2px] bg-sky-600/15 text-sky-500 flex items-center justify-center"><i class="pi pi-share-alt"></i></div>' +
            '<h3 class="text-sm font-extrabold text-slate-900 dark:text-slate-100">' + esc(s ? s.label : 'Tek Hat') + ' · Tek hat şeması</h3>' +
            '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1.5">Tek hat çizim modülü (js/pms/single-line.js) bu sunum kopyasında yüklü değil. Şema, modül eklendiğinde bu alanda açılır.</p>' +
            (state.slFocus ? '<p class="text-[11px] mt-2 font-mono text-amber-700 dark:text-amber-400">İşaretlenecek cihaz: ' + esc(state.slFocus.devId || '') + '</p>' : '') +
          '</div></div>';
        return;
      }
      el.innerHTML = '<div class="pms-sl-mount" id="pms-sl"></div>';
      try {
        this.inst = sl.mount(document.getElementById('pms-sl'), {
          schemaId: state.schema,
          focus: state.slFocus,
          // Seçim kartı "Mekânsal konum (BMS)": alarm verildiyse alarm + cihaz, yoksa yalnız cihaz (kat bilinmiyor)
          onLocate: (devId, alarm) => openBms(alarm ? { alarm: { devId: devId || alarm.devId, rid: alarm.rid, floor: '', cab: '' } } : { dev: devId }),
          onFocusClear: () => { state.slFocus = null; }
        });
      } catch (err) {
        console.error('Tek hat modülü açılamadı:', err);
        el.innerHTML = '<div class="p-6">' + kit.emptyState({ message: 'Tek hat şeması açılamadı', compact: true }) + '</div>';
      }
    },
    unmount() { if (this.inst && this.inst.destroy) { try { this.inst.destroy(); } catch (e) { /* yok say */ } } this.inst = null; },
    update() { /* modül kendi canlı güncellemesini yapar */ }
  };

  // ===========================================================================
  // 4) TABLO ŞEMALARI — Kompanzasyon / Jeneratör (energy-table-dashboard.component)
  // ===========================================================================
  const tblState = { q: '' };
  const cellBadge = c => (c && c.sta === '0x0303'
    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700');
  const cellVal = v => {
    if (v === null || v === undefined || v === '' || v === '-') return '-';
    const n = parseFloat(v);
    return !isNaN(n) && isFinite(n) ? n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : String(v);
  };
  // computeKpiMetrics karşılığı: hücre rolüne göre (role: kw | vll-avg | hz | pf | ia | ib | ic)
  function tableKpi(tables) {
    const m = { p: 0, nP: 0, v: 0, nV: 0, f: 0, nF: 0, pf: 0, nPf: 0, a: 0, b: 0, c: 0, active: 0, total: 0, lost: 0 };
    tables.forEach(t => t.rows.forEach(r => {
      m.total++;
      let act = false;
      r.cells.slice(1).forEach(c => {
        const n = parseFloat(c.value);
        if (c.sta !== '0x0303') { m.lost++; return; }
        if (!isFinite(n)) return;
        if (n > 0) act = true;
        if (c.role === 'kw') { m.p += n; m.nP++; }
        else if (c.role === 'vll-avg' && n >= 50) { m.v += n; m.nV++; }
        else if (c.role === 'hz' && n >= 30 && n <= 70) { m.f += n; m.nF++; }
        else if (c.role === 'pf' && n > 0 && n <= 1) { m.pf += n; m.nPf++; }
        else if (c.role === 'ia') m.a += n; else if (c.role === 'ib') m.b += n; else if (c.role === 'ic') m.c += n;
      });
      if (act) m.active++;
    }));
    return {
      totalPowerKw: Math.round(m.p * 10) / 10, avgVoltageV: m.nV ? Math.round(m.v / m.nV) : 0,
      avgFreqHz: m.nF ? Number((m.f / m.nF).toFixed(2)) : 0, avgPowerFactor: m.nPf ? Number((m.pf / m.nPf).toFixed(2)) : 0,
      activeCount: m.active, totalCount: m.total, phaseA: Math.round(m.a), phaseB: Math.round(m.b), phaseC: Math.round(m.c), lost: m.lost
    };
  }
  function tableView(getTables, perRow, waitingLabel) {
    return {
      mount(el) {
        el.innerHTML =
          '<div class="h-full flex flex-col overflow-hidden p-2 pt-0 space-y-2 font-sans select-none bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-100 etd-host">' +
            '<div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5 shrink-0" id="tb-kpi"></div>' +
            '<div class="flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-3 py-1.5 shadow-2xs shrink-0">' +
              '<div class="flex items-center gap-2 flex-grow max-w-md"><div class="relative w-full">' +
                '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none"></i>' +
                '<input type="text" id="tb-search" value="' + esc(tblState.q) + '" placeholder="Şalter, hat veya pano ara..." class="w-full pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-[2px] text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500" />' +
              '</div></div>' +
              '<div class="flex items-center gap-2 text-xs"><span class="text-slate-500 dark:text-slate-400 text-[11px]">Görünüm:</span>' +
                '<span class="px-2 py-0.5 rounded-[2px] font-bold text-[11px] bg-sky-600/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">Kompakt SCADA Tablosu</span></div>' +
            '</div>' +
            '<div class="flex-grow min-h-0 overflow-y-auto pr-0.5"><div class="grid grid-cols-1 ' + (perRow > 1 ? 'xl:grid-cols-2 ' : '') + 'gap-3" id="tb-tables"></div></div>' +
          '</div>';
        el.querySelector('#tb-search').addEventListener('input', e => { tblState.q = e.target.value; this.update(); });
      },
      update() {
        const tables = getTables();
        const k = tableKpi(tables);
        const total = k.phaseA + k.phaseB + k.phaseC;
        const pct = x => (total > 0 ? Math.round(x / total * 100) : 0);
        const wait = waitingLabel ? waitingLabel() : 'Veri Bekleniyor';
        const kc = (label, icon, value, unit, unitCls, dotCls, sub) =>
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs relative overflow-hidden flex flex-col justify-between">' +
            '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5"><span class="truncate">' + esc(label) + '</span><i class="' + icon + ' text-xs shrink-0"></i></div>' +
            '<div class="flex items-baseline gap-1"><span class="text-lg font-extrabold font-mono text-slate-900 dark:text-slate-100">' + value + '</span><span class="text-[11px] font-bold ' + unitCls + '">' + unit + '</span></div>' +
            '<div class="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate"><span class="w-1.5 h-1.5 rounded-full ' + dotCls + '"></span><span>' + esc(sub) + '</span></div>' +
          '</div>';
        const bar = (label, cls, grad, val, p) =>
          '<div><div class="flex justify-between text-[10px] mb-0.5"><span class="font-bold ' + cls + '">' + label + '</span><span class="font-mono text-slate-500 dark:text-slate-400">' + val + ' A (%' + p + ')</span></div>' +
          '<div class="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r ' + grad + ' transition-all duration-500 rounded-full" style="width:' + p + '%"></div></div></div>';
        document.getElementById('tb-kpi').innerHTML =
          '<div class="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">' +
            kc('Toplam Aktif Güç', 'pi pi-bolt text-amber-500', k.totalPowerKw > 0 ? fmt(k.totalPowerKw, 1) : '-', 'kW', 'text-amber-500', k.totalPowerKw > 0 ? 'bg-emerald-500' : 'bg-slate-400', k.totalPowerKw > 0 ? 'Aktif Güç' : wait) +
            kc('Ort. Hat V', 'pi pi-gauge text-sky-500', k.avgVoltageV > 0 ? k.avgVoltageV : '-', 'V', 'text-sky-500', k.avgVoltageV >= 200 ? 'bg-emerald-500' : k.avgVoltageV > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgVoltageV > 0 ? 'Nominal Seviye' : wait) +
            kc('Frekans', 'pi pi-wave-pulse text-emerald-500', k.avgFreqHz > 0 ? fmt(k.avgFreqHz, 2) : '-', 'Hz', 'text-emerald-500', k.avgFreqHz >= 49.5 && k.avgFreqHz <= 50.5 ? 'bg-emerald-500' : k.avgFreqHz > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgFreqHz > 0 ? '50 Hz ±0.5' : wait) +
            kc('Toplam Güç Faktörü', 'pi pi-sliders-h text-purple-500', k.avgPowerFactor > 0 ? fmt(k.avgPowerFactor, 2) : '-', 'PF', 'text-purple-400', k.avgPowerFactor >= 0.95 ? 'bg-emerald-500' : k.avgPowerFactor > 0 ? 'bg-amber-500' : 'bg-slate-400', k.avgPowerFactor > 0 ? 'cos φ' : wait) +
            '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs relative overflow-hidden flex flex-col justify-between col-span-2 sm:col-span-1">' +
              '<div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5"><span class="truncate">İzlenen Şalter</span><i class="pi pi-sitemap text-sky-500 text-xs shrink-0"></i></div>' +
              '<div class="flex items-baseline gap-1"><span class="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">' + k.activeCount + '</span><span class="text-xs text-slate-400 font-mono">/ ' + k.totalCount + '</span></div>' +
              '<div class="mt-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate">' + (k.lost ? '<span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span><span>' + k.lost + ' değer okunamıyor</span>' : '<span>Telemetri Canlı</span>') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="lg:col-span-5 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs flex flex-col justify-between">' +
            '<div class="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800">' +
              '<div class="flex items-center gap-1.5"><i class="pi pi-chart-bar text-sky-600 dark:text-sky-400 text-xs"></i><span class="text-[11px] font-bold text-slate-900 dark:text-slate-100">3-Faz Akım Yük Dağılımı</span></div>' +
              '<div class="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
                '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-sky-500"></span> L1: <strong>' + k.phaseA + 'A</strong></span>' +
                '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> L2: <strong>' + k.phaseB + 'A</strong></span>' +
                '<span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> L3: <strong>' + k.phaseC + 'A</strong></span>' +
              '</div></div>' +
            '<div class="space-y-1.5 text-xs">' +
              bar('Faz A (L1)', 'text-sky-600 dark:text-sky-400', 'from-sky-600 to-sky-400', k.phaseA, pct(k.phaseA)) +
              bar('Faz B (L2)', 'text-amber-500 dark:text-amber-400', 'from-amber-600 to-amber-400', k.phaseB, pct(k.phaseB)) +
              bar('Faz C (L3)', 'text-emerald-600 dark:text-emerald-400', 'from-emerald-600 to-emerald-400', k.phaseC, pct(k.phaseC)) +
            '</div></div>';

        const term = lc(tblState.q.trim());
        document.getElementById('tb-tables').innerHTML = tables.map(t => {
          const rows = !term || lc(t.title).indexOf(term) >= 0 ? t.rows : t.rows.filter(r => r.cells.some(c => lc(c.value != null ? String(c.value) : '').indexOf(term) >= 0));
          return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden">' +
            '<div class="px-3 py-2 bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-border-subtle flex items-center justify-between gap-2">' +
              '<div class="flex items-center gap-2 min-w-0"><div class="w-5 h-5 rounded-[2px] bg-sky-600/20 text-sky-500 flex items-center justify-center text-[10px] font-bold"><i class="pi pi-table"></i></div>' +
                '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(t.title) + '</h3>' +
                (t.note ? '<span class="hidden md:inline text-[10px] text-slate-500 dark:text-slate-400 truncate">· ' + esc(t.note) + '</span>' : '') + '</div>' +
              '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">' + rows.length + ' Kayıt</span>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-left text-xs border-collapse">' +
              '<thead><tr class="bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 select-none">' +
                t.headers.map((h, ci) => '<th class="px-3 py-1.5 text-[11px] whitespace-nowrap font-semibold' + (ci > 0 ? ' text-center' : '') + '"><span>' + esc(h.title) + '</span></th>').join('') +
              '</tr></thead>' +
              '<tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">' +
                (rows.length ? rows.map(r => '<tr class="hover:bg-sky-500/5 transition-colors group">' + r.cells.map((c, ci) => {
                  if (ci === 0) {
                    const ok = r.cells.slice(1).some(x => x.sta === '0x0303');
                    return '<td class="px-3 py-1.5 whitespace-nowrap"><div class="flex items-center gap-2 font-sans font-bold text-slate-900 dark:text-slate-100"><span class="w-2 h-2 rounded-full shrink-0 ' + (ok ? 'bg-emerald-500' : 'bg-slate-400') + '"></span><span>' + esc(c.value) + '</span></div></td>';
                  }
                  return '<td class="px-3 py-1.5 whitespace-nowrap text-center"><div class="inline-flex items-center justify-center gap-1.5">' +
                    '<span class="px-1.5 py-0.5 rounded-[2px] font-bold text-xs inline-flex items-center gap-1 ' + cellBadge(c) + '"><span class="' + (c.sta === '0x0303' ? 'sta-v-normal' : 'sta-v-disabled') + '">' + cellVal(c.value) + '</span></span>' +
                    (c.unit ? '<span class="text-[10px] font-sans text-slate-400">' + esc(c.unit) + '</span>' : '') +
                  '</div></td>';
                }).join('') + '</tr>').join('')
                : '<tr><td colspan="' + t.headers.length + '" class="text-center py-6 text-slate-400 italic">Arama kriterine uygun kayıt bulunamadı.</td></tr>') +
              '</tbody></table></div>' +
          '</div>';
        }).join('');
      }
    };
  }
  views.compensation = tableView(() => P.compensationTables(state.tick), P.compPage.tablesPerRow);
  views.generator = tableView(() => [P.generatorTable(state.gen, state.tick)], 1, () => (P.genPage(state.gen).running ? 'Veri Bekleniyor' : 'Jeneratör beklemede'));

  // ===========================================================================
  // 5) REDRESÖR (rectifier-dashboard.component — yenilenmiş panel)
  // ===========================================================================
  const RECT_SEV = { NORMAL: 'normal', UYARI: 'uyari', ALARM: 'alarm', 'BAĞLANAMADI': 'kayip' };
  const RECT_KEYS = ['loadVoltage', 'loadCurrent', 'outputCurrent', 'averageAcVoltage', 'capacity', 'usedCapacity', 'batteryVoltage', 'batteryTemp', 'batteryRuntime'];
  const rn = v => { const x = v && typeof v === 'object' ? v.value : v; const n = parseFloat(x); return isFinite(n) ? n : null; };
  const rf = (v, d) => { const x = rn(v); return x === null ? '—' : x.toFixed(d); };
  const rfN = (x, d) => (x === null ? '—' : x.toFixed(d));
  const rsc = v => { const s = RECT_SEV[(v && v.status) || ''] || 'none'; return s === 'alarm' || s === 'uyari' || s === 'kayip' ? SEVERITY_COLOR[s] : ''; };
  const colorAttr = c => (c ? ' style="color:' + c + '"' : '');
  function rectState(r) {
    if (r.alarm) return 'alarm';
    const sev = RECT_KEYS.map(k => r[k]).concat((r.acInput || []).map(a => a.voltage)).map(v => RECT_SEV[(v && v.status) || ''] || 'none');
    if (sev.indexOf('alarm') >= 0) return 'alarm';
    if (sev.indexOf('uyari') >= 0) return 'uyari';
    if (sev.indexOf('kayip') >= 0) return 'kayip';
    return RECT_KEYS.some(k => rn(r[k]) !== null) ? 'normal' : 'nodata';
  }
  const rectLabel = s => ({ alarm: 'Alarm', uyari: 'Uyarı', kayip: 'Haberleşme yok', normal: 'Normal' }[s] || 'Veri yok');
  views.rectifier = {
    mount(el) { el.innerHTML = '<div class="rect-host"><div class="rect-root h-full flex flex-col overflow-hidden p-3 gap-3 select-none bg-slate-50 dark:bg-surface-base text-slate-800 dark:text-slate-100" id="rc-root" style="--r-alarm:' + SEVERITY_COLOR.alarm + '"></div></div>'; },
    update() {
      const list = E.rectifiers(state.tick);
      const nums = sel => list.map(sel).filter(x => x !== null);
      const sum = a => (a.length ? a.reduce((x, y) => x + y, 0) : null);
      const avgBus = (a => (a.length ? sum(a) / a.length : null))(nums(r => rn(r.loadVoltage)));
      const totLoad = sum(nums(r => rn(r.loadCurrent)));
      const totOut = sum(nums(r => rn(r.outputCurrent)));
      const minCap = (a => (a.length ? Math.min.apply(null, a) : null))(nums(r => rn(r.capacity)));
      const counts = { normal: 0, uyari: 0, alarm: 0, kayip: 0, nodata: 0 };
      list.forEach(r => { counts[rectState(r)]++; });
      const clamp = x => (x === null ? 0 : Math.max(0, Math.min(100, x)));
      document.getElementById('rc-root').innerHTML =
        '<div class="grid grid-cols-2 lg:grid-cols-5 gap-3 shrink-0">' +
          '<div class="kpi"><span class="kpi-l">DC Yük Gerilimi</span><div class="kpi-v"><span class="num text-2xl">' + rfN(avgBus, 1) + '</span><span class="unit">V DC</span></div><span class="kpi-s">Bara ortalaması</span></div>' +
          '<div class="kpi"><span class="kpi-l">Toplam Yük Akımı</span><div class="kpi-v"><span class="num text-2xl">' + rfN(totLoad, 1) + '</span><span class="unit">A</span></div><span class="kpi-s">' + list.length + ' redresör</span></div>' +
          '<div class="kpi"><span class="kpi-l">Toplam Doğrultucu Çıkışı</span><div class="kpi-v"><span class="num text-2xl">' + rfN(totOut, 1) + '</span><span class="unit">A</span></div><span class="kpi-s">&nbsp;</span></div>' +
          '<div class="kpi"><span class="kpi-l">En Düşük Akü Kapasitesi</span><div class="kpi-v"><span class="num text-2xl">' + rfN(minCap, 0) + '</span><span class="unit">%</span></div><div class="bar"><div class="bar-fill" style="width:' + clamp(minCap) + '%"></div></div></div>' +
          '<div class="kpi col-span-2 lg:col-span-1"><span class="kpi-l">Sağlık Izgarası</span><div class="flex flex-wrap gap-1.5 mt-1.5">' +
            list.map((r, i) => { const s = rectState(r); return '<span class="cell' + (s === 'nodata' ? ' cell-none' : '') + '"' + (s !== 'nodata' ? ' style="background:' + SEVERITY_COLOR[s] + '"' : '') + ' title="' + esc(r.name + ' — ' + rectLabel(s)) + '">' + (i + 1) + '</span>'; }).join('') +
            '</div><span class="kpi-s mt-1">' + (counts.alarm || counts.uyari || counts.kayip
              ? counts.alarm + ' Alarm · ' + counts.uyari + ' Uyarı · ' + counts.kayip + ' Haberleşme yok'
              : counts.normal + ' Normal · ' + counts.nodata + ' Veri yok') + '</span></div>' +
        '</div>' +
        '<div class="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3 content-start">' + list.map(r => {
          const s = rectState(r);
          const sColor = s === 'nodata' ? '' : SEVERITY_COLOR[s];
          const batt = (rn(r.outputCurrent) === null || rn(r.loadCurrent) === null) ? null : rn(r.outputCurrent) - rn(r.loadCurrent);
          return '<div class="card' + (s === 'alarm' ? ' card-alarm' : '') + '">' +
            '<div class="card-h"><div class="min-w-0"><h3 class="text-[13px] font-bold truncate">' + esc(r.name) + '</h3><p class="text-[10px] text-slate-500 dark:text-slate-400">Telekom DC Güç Besleme Ünitesi · ' + esc(r.place) + '</p></div>' +
              '<div class="flex items-center gap-1.5"><span class="badge' + (sColor ? '' : ' badge-none') + '"' + colorAttr(sColor) + '><i class="dot"></i>' + rectLabel(s) + '</span></div></div>' +
            '<div class="p-4 grid grid-cols-1 sm:grid-cols-[1.15fr_1fr] gap-4">' +
              '<div class="flex flex-col gap-3">' +
                '<div class="grid grid-cols-2 gap-3">' +
                  '<div><span class="lbl">DC Bara</span><div class="flex items-baseline mt-0.5"><span class="num text-[38px] leading-none font-semibold"' + colorAttr(rsc(r.loadVoltage)) + '>' + rf(r.loadVoltage, 1) + '</span><span class="unit text-base">V</span></div></div>' +
                  '<div><span class="lbl">Yük Akımı</span><div class="flex items-baseline mt-0.5"><span class="num text-[38px] leading-none font-semibold"' + colorAttr(rsc(r.loadCurrent)) + '>' + rf(r.loadCurrent, 1) + '</span><span class="unit text-base">A</span></div></div>' +
                '</div>' +
                '<div class="grid grid-cols-2 gap-2">' +
                  '<div class="stat"><span class="lbl">Doğrultucu Çıkış Akımı</span><span class="num text-[15px] font-semibold"' + colorAttr(rsc(r.outputCurrent)) + '>' + rf(r.outputCurrent, 1) + '<span class="unit">A</span></span></div>' +
                  '<div class="stat" title="Doğrultucu çıkışı − yük akımı (+ şarj / − deşarj)"><span class="lbl">Akü Akımı <span class="opacity-60">≈</span></span><span class="num text-[15px] font-semibold">' + rfN(batt, 1) + '<span class="unit">A</span></span></div>' +
                '</div>' +
                '<div><div class="flex items-baseline justify-between"><span class="lbl">AC Kaynağı</span><span class="num text-[12px] font-semibold"' + colorAttr(rsc(r.averageAcVoltage)) + '>' + rf(r.averageAcVoltage, 0) + '<span class="unit">V ort.</span></span></div>' +
                  '<div class="mt-1 space-y-1">' + (r.acInput || []).map(ac =>
                    '<div class="prow"><span class="ph-l">' + esc(ac.phase) + '</span><div class="pbar"><div class="pfill" style="width:' + clamp(rn(ac.voltage) === null ? 0 : rn(ac.voltage) / 300 * 100) + '%' + (rsc(ac.voltage) ? ';background:' + rsc(ac.voltage) : '') + '"></div></div>' +
                    '<span class="num pv"' + colorAttr(rsc(ac.voltage)) + '>' + rf(ac.voltage, 0) + '</span><span class="unit">V</span></div>').join('') + '</div></div>' +
              '</div>' +
              '<div class="batt-panel">' +
                '<div class="flex items-baseline justify-between"><span class="lbl">Aküler (Akü Grubu)</span><span class="num text-[22px] font-semibold"' + colorAttr(rsc(r.capacity)) + '>' + rf(r.capacity, 0) + '<span class="unit">%</span></span></div>' +
                '<div class="bar h-2"><div class="bar-fill" style="width:' + clamp(rn(r.capacity)) + '%' + (rsc(r.capacity) ? ';background:' + rsc(r.capacity) : '') + '"></div></div>' +
                '<div class="kv"><span>Kullanılan Kapasite</span><b class="num">' + rf(r.usedCapacity, 0) + '<span class="unit">%</span></b></div>' +
                '<div class="kv"><span>Akü Gerilimi</span><b class="num">' + rf(r.batteryVoltage, 2) + '<span class="unit">V</span></b></div>' +
                '<div class="kv"><span>Akü Sıcaklığı</span><b class="num">' + rf(r.batteryTemp, 1) + '<span class="unit">°C</span></b></div>' +
                '<div class="kv"><span>Kalan Çalışma Süresi</span><b class="num">' + rf(r.batteryRuntime, 1) + '<span class="unit">Saat</span></b></div>' +
                '<div class="kv"><span>Doğrultucu Modülleri</span><b class="num">' + r.activeModules + ' / ' + r.modules.length + '<span class="unit">aktif · N+1</span></b></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>';
    }
  };

  // ===========================================================================
  // 6) UPS PANELİ (ups-dashboard.component — önceki sürüm; energy.js'ten taşındı)
  // ===========================================================================
  const STATUS_CLASS = { NORMAL: 'sta-v-normal', UYARI: 'sta-v-uyari', ALARM: 'sta-v-alarm', 'ESKİ': 'sta-v-eski', BILINMEYEN: 'sta-v-disabled', 'DEVREDIŞI': 'sta-v-disabled', 'BAĞLANAMADI': 'sta-v-disabled' };
  const getStatusClass = s => (!s ? '' : STATUS_CLASS[s] || 'sta-v-disabled');
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
      el.innerHTML = '<div class="h-full flex flex-col min-h-0"><div class="flex-1 min-h-0 relative overflow-hidden" id="ups-parent"><div class="ups-host" id="ups-host"></div></div></div>';
      this.renderedFor = null;
      if (typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.resize());
        this.ro.observe(el.querySelector('#ups-parent'));
      }
    },
    unmount() { if (this.ro) { this.ro.disconnect(); this.ro = null; } },
    // handleScaling: Math.min(scaleX, scaleY) * 0.94
    resize() {
      const parent = document.getElementById('ups-parent');
      const box = document.getElementById('ups-box');
      if (!parent || !box) return;
      const scale = Math.min((parent.clientWidth || window.innerWidth) / 1400, (parent.clientHeight || window.innerHeight) / 900) * 0.94;
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
      const flows = { 1: bypassFlow, 2: bypassFlow, 3: bypassFlow, 4: mainFlow, 5: mainFlow || battery, 6: mainFlow || battery, 7: bypassFlow || mainFlow || battery, 8: battery };
      const wrap = document.getElementById('ups-wrap');
      wrap.classList.toggle('alarm-state', alarmState);
      wrap.classList.toggle('lost-mask', ups.mode === 'lost');
      wrap.querySelectorAll('[data-cable]').forEach(c => c.classList.toggle('flowing', !!flows[c.getAttribute('data-cable')]));
      const bfill = document.getElementById('ups-bfill');
      bfill.className = 'batt-fill ' + getStatusClass(v.batt_cap && v.batt_cap.status);
      bfill.style.width = (parseFloat(v.batt_cap.value) || 0) + '%';

      document.getElementById('ups-title').innerHTML =
        '<div class="t-name">' + esc(ups.name) + '</div><div class="t-sub">' + esc(P.upsInfo(ups.code).node) + ' · ' + esc(ups.devId) + ' · 80 kVA · ' + esc(ups.modeLabel) + '</div>';
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
      sb.className = 'status-badge ' + { alarm: 'sb-alarm', warning: 'sb-uyari', lost: 'sb-lost', normal: 'sb-normal' }[ups.status];
      sb.textContent = ups.status === 'alarm' ? 'ALARM' : ups.status === 'warning' ? 'UYARI' : ups.status === 'lost' ? 'VERİ ALINAMIYOR' : 'NORMAL';

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
        '</div>' + rowVal('Aktif Yük', avgLoad, '%', 0);
    }
  };

  // ---------------------------------------------------------------------------
  // Görünüm geçişi, URL, canlı güncelleme
  // ---------------------------------------------------------------------------
  let linkConsumed = false;
  function syncUrl() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('view', state.view);
      ['schema', 'ups', 'gen'].forEach(k => u.searchParams.delete(k));
      if (state.view === 'single-line' && state.schema) u.searchParams.set('schema', state.schema);
      if (state.view === 'ups') u.searchParams.set('ups', state.ups);
      if (state.view === 'generator') u.searchParams.set('gen', state.gen);
      if (linkConsumed) { u.searchParams.delete('alarm'); u.searchParams.delete('dev'); }
      window.history.replaceState(null, '', u.toString());
    } catch (e) { /* file:// bazı tarayıcılarda izin vermez */ }
  }

  let current = null;
  function switchView(view) {
    if (VIEWS.indexOf(view) < 0) view = 'overview';
    if (view === 'single-line' && !schemaById(state.schema)) state.schema = (schemas()[0] || {}).id || '';
    const viewEl = document.getElementById('pms-view');
    if (current && views[current].unmount) views[current].unmount(viewEl);
    if (current && current !== view) linkConsumed = true;
    if (view !== 'single-line') state.slFocus = null;
    state.view = view;
    current = view;
    state.activeNodeId = nodeForState();
    // Seçili düğümün üst grubunu aç
    sections.forEach(s => s.items.forEach(n => { if ((n.children || []).some(c => c.id === state.activeNodeId)) state.expanded[n.id] = true; }));
    state.pageTitle = pageTitleFor();
    viewEl.innerHTML = '';
    renderSidebar();
    renderToolbar();
    views[view].mount(viewEl);
    views[view].update();
    syncUrl();
  }

  function liveTick() {
    state.tick++;
    state.lastUpdate = new Date();
    if (views[current] && views[current].update) views[current].update();
    const pue = document.getElementById('pms-tb-pue');
    if (pue) pue.textContent = fmt(P.kpi(state.tick).pue, 2);
    const last = document.getElementById('pms-tb-last');
    if (last) last.textContent = 'Son güncelleme: ' + fmtTime(state.lastUpdate);
  }

  // BMS'ten gelen alarm/cihaz (tryPendingLink): tek hatta bulunursa işaretle açılır; UPS ise UPS paneli; yoksa bilgi bandı
  function applyIncomingLink() {
    const aId = state.linkAlarm, dev = state.linkDev;
    if (!aId && !dev) return false;
    const al = alarms().find(a => a.rid === aId || a.key === aId || a.key === 'P:' + aId || a.key === 'S:' + aId) || null;
    const src = (al && al.rid) || dev;
    const r = resolveSrc(src, dev, al && al.devId) || (al && al.schemaId && SL() ? { schemaId: al.schemaId, devId: al.devId } : null);
    if (r) {
      state.schema = r.schemaId;
      state.slFocus = focusFor(al, r.devId || dev || (al && al.devId));
      switchView('single-line');
      return true;
    }
    const label = /^UPS\s*([AB]\d)$/i.exec(String(params.get('dev') || '').trim());
    const upsCode = (al && al.ups) || (label && label[1].toUpperCase()) ||
      (E.upsCodes.find(c => devNorm(dev) === upsDevId(c) || devNorm(src).indexOf(upsDevId(c)) === 0) || '');
    if (upsCode) {
      state.ups = upsCode;
      switchView('ups');
      toast('Bu cihaz tek hat şemalarında bulunamadı (' + src + '); UPS paneli açıldı.', 'info', 'PMS · Güç Yönetimi');
      return true;
    }
    state.notice = 'Bu cihaz tek hat şemalarında bulunamadı' + (src ? ' (' + src + ')' : '') + '.';
    switchView('overview');
    return true;
  }

  window.addEventListener('resize', () => { if (views[current] && views[current].resize) views[current].resize(); });
  if (!applyIncomingLink()) switchView(state.view);
  setInterval(liveTick, (P.TICK_SEC || 3) * 1000);
})();
