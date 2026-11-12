/* ==========================================================================
   DCIM Sunum — PDU Detay Sayfası (NewUICMPPduDetailComponent)
   pdu-detail.component.html/.ts karşılığı:
   - Sol: Lokasyon & Kabinler ağacı (app-location-tree): şirket → şehir → DCA → kat → POD → kabin (3 kat)
   - Sağ: seçili kabinin PDU-A / PDU-B üniteleri — kimlik kartı, Inlet / Outlet / Devre Kesici sekmeleri
   - Satır durumları: noktalarda UYARI/ALARM/ACİL varsa ON/OFF yerine o (Acil mor); susturulmuş (0x00C0) → DEVREDIŞI
   - 5 sn polling (canlı telemetri), rapor menüsü (app-report-export-menu: İnlet / Outlet / Devre kesici / Tümü, satır sınırı)
   URL: ?cabinet=1NA06 (&pdu=B) (&tab=inlet|outlet|breaker)
        Kaynak parametreleri de desteklenir: cabinetId, cabinetDevId, devId, pin, targetPduId
   Veri: DCIM.data.pduPage (js/mock/pdu-detail.data.js) — senaryo: 1NA06 PDU-B L2 faz kaybı, 1DL03 PDU-B C1 uyarı,
         2. katta bir kabinin PDU-A C2 kesicisi ACİL, 3. katta bir kabin susturulmuş (DEVREDIŞI)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtTime, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'pdu' });

  // ---------------------------------------------------------------------------
  // Sözlük (messages.tr.json → pduDetailPage.* / pduDetailTable.*)
  // ---------------------------------------------------------------------------
  const T = {
    title: 'PDU Detay Sayfası',
    assets: 'Varlıklar',
    cabinetManager: 'Kabin Yönetimi', // menu.cabinetmanager tr.json'da yok; shell menüsündeki etiket kullanıldı
    locationAndCabinets: 'Lokasyon & Kabinler',
    cabin: 'Kabin',
    loading: 'YÜKLENİYOR',
    loadingHierarchy: 'Kabin hiyerarşisi yükleniyor...',
    noCabinetFound: 'Kabin bulunamadı.',
    loadingTelemetry: 'PDU telemetri verileri yükleniyor...',
    cabinet: 'Kabin',
    unit: 'Ünite',
    selectPdu: 'PDU Seçiniz',
    identityCardTitle: 'PDU Kimlik ve Anma Özellikleri',
    pduName: 'PDU Adı',
    pduBrand: 'PDU Markası',
    pduModel: 'PDU Modeli',
    ipAddress: 'IP Adresi',
    serialNumber: 'Seri Numarası',
    snmpVersion: 'SNMP Sürümü',
    ratedVoltage: 'Anma Voltajı',
    ratedCurrent: 'Anma Akımı',
    ratedApparentPower: 'Anma Görünür Gücü',
    inletCount: 'INLET SAYISI',
    outletCount: 'OUTLET SAYISI',
    alarmStatus: 'Alarm Durumu',
    inlet: 'İnlet',
    outlet: 'Outlet',
    circuitBreaker: 'Devre Kesici',
    noInletData: 'Bu PDU için Inlet telemetri verisi bulunamadı.',
    noOutletData: 'Bu PDU için Outlet telemetri verisi bulunamadı.',
    noBreakerData: 'Bu PDU için Devre Kesici verisi bulunamadı.',
    noPduData: 'PDU Verisi Bulunamadı',
    noPduDesc: 'Seçili kabine ait PDU bulunamadı veya cihaz henüz veri göndermiyor.',
    tField: 'Alan',
    tCurrent: 'Akım',
    tVoltage: 'Voltaj',
    tPower: 'Güç',
    tApparentPower: 'Görünen Güç',
    tPowerFactor: 'Güç Faktörü',
    tActiveEnergy: 'Aktif Enerji',
    tFrequency: 'Frekans',
    tRatedCurrent: 'Anma Akımı',
    tRemainingCurrent: 'Kalan Akım',
    tStatus: 'Durum'
  };

  // ---------------------------------------------------------------------------
  // STA değerlendirmesi (Haberleşme sayfası ile uyumlu bitmask mantığı)
  // ---------------------------------------------------------------------------
  const STA_ENG_RUNNING = 0x0003;
  const STA_MSK_ENG = 0x0003;
  const STA_VAL_WARNING = 0x0004;
  const STA_VAL_ALARM = 0x0008;
  const STA_VAL_EMERGENCY = 0x000C;
  const STA_MSK_VAL = 0x000C;

  function parseStaNumber(sta) {
    if (sta === undefined || sta === null || sta === '') return 0;
    if (typeof sta === 'number') return sta;
    const str = String(sta).trim();
    if (str.toLowerCase().startsWith('0x')) return parseInt(str, 16) || 0;
    return parseInt(str, 10) || 0;
  }
  function getClassNo(sta) {
    if ((sta & STA_MSK_ENG) !== STA_ENG_RUNNING) return sta & 0x0003;
    return 4 + ((sta >> 2) & 0x0003);
  }
  const STA_MUTED = 0x00C0; // kabin takibi kapalı / alarm susturulmuş
  function getCommStatus(sta) {
    const staNum = parseStaNumber(sta);
    // Susturulmuş (örn. 0x03C3): ortak kuralda DEVREDIŞI (resolveAyxdbDisplayStatus)
    if ((staNum & STA_MUTED) === STA_MUTED) return { badgeStatus: 'inactive', label: 'DEVREDIŞI' };
    const val = getClassNo(staNum);
    if (val === 0) return { badgeStatus: 'inactive', label: 'DEVREDIŞI' };
    if (val === 1) return { badgeStatus: 'stopped', label: 'DURDURULDU' };
    if (val === 2) {
      const valMask = staNum & STA_MSK_VAL;
      if (valMask === STA_VAL_WARNING) return { badgeStatus: 'warning', label: 'KOPTU-UYARI' };
      if (valMask === STA_VAL_ALARM) return { badgeStatus: 'alarm', label: 'KOPTU-ALARM' };
      if (valMask === STA_VAL_EMERGENCY) return { badgeStatus: 'lvl-acil', label: 'KOPTU-ACİL' };
      return { badgeStatus: 'koptu', label: 'KOPTU' };
    }
    if (val === 3 || val === 4) return { badgeStatus: 'normal', label: 'BAĞLI-NORMAL' };
    if (val === 5) return { badgeStatus: 'warning', label: 'BAĞLI-UYARI' };
    if (val === 6) return { badgeStatus: 'alarm', label: 'BAĞLI-ALARM' };
    if (val === 7) return { badgeStatus: 'lvl-acil', label: 'BAĞLI-ACİL' };
    return { badgeStatus: 'koptu', label: 'KOPTU' };
  }

  // Satırın noktalarındaki en kötü değer durumu (susturulmuş noktalar sayılmaz); yoksa null (rowAlarm)
  function rowAlarm(ios) {
    let worst = 0;
    (ios || []).forEach(io => {
      if (!io || io.sta === undefined || io.sta === null || io.sta === '') return;
      const s = parseStaNumber(io.sta);
      if ((s & STA_MUTED) === STA_MUTED) return;
      const v = s & STA_MSK_VAL;
      if (v > worst) worst = v;
    });
    if (worst === STA_VAL_EMERGENCY) return { badgeStatus: 'lvl-acil', label: 'ACİL' };
    if (worst === STA_VAL_ALARM) return { badgeStatus: 'alarm', label: 'ALARM' };
    if (worst === STA_VAL_WARNING) return { badgeStatus: 'warning', label: 'UYARI' };
    return null;
  }
  // Sekmelerin noktaları, tabloları kuran parse*Rows filtreleriyle aynı (tabAlarms)
  function tabAlarms(deviceIos) {
    const ios = (deviceIos || []).filter(io => io && io.id && !io.id.includes('_NFO_'));
    const lvl = list => { const a = rowAlarm(list); return a ? a.badgeStatus : null; };
    return {
      inlet: lvl(ios.filter(io => io.id.includes('_IN_') || /_IN\d*_/.test(io.id))),
      outlet: lvl(ios.filter(io => io.id.includes('_OUT'))),
      breaker: lvl(ios.filter(io => io.id.includes('_OCP') && !io.id.includes('_ONLVL')))
    };
  }
  // Sekme sayı rozeti: alarm yoksa nötr; varsa durum rozetleriyle aynı renk (Acil mor)
  function tabCountClass(level) {
    switch (level) {
      case 'lvl-acil': return 'bg-purple-600/15 text-purple-700 ring-1 ring-purple-400 dark:bg-purple-500/25 dark:text-purple-200 dark:ring-purple-400/70 font-bold';
      case 'alarm': return 'bg-rose-500/15 text-rose-600 ring-1 ring-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/50 font-bold';
      case 'warning': return 'bg-amber-500/15 text-amber-700 ring-1 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/50 font-bold';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
    }
  }

  // ---------------------------------------------------------------------------
  // app-status-badge (AppStatusBadgeComponent) — stopped/inactive/active dahil tam karşılık
  // ---------------------------------------------------------------------------
  function badgeClass(s) {
    switch (s) {
      case 'lvl-acil':
        return 'bg-purple-600/15 text-purple-700 border-purple-400 dark:bg-purple-500/25 dark:text-purple-200 dark:border-purple-400/70';
      case 'alarm': case 'critical': case 'kritik': case 'acil': case 'emergency': case 'danger':
        return 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/50';
      case 'warning': case 'uyarı': case 'major': case 'minor':
        return 'bg-amber-500/10 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/50';
      case 'koptu': case 'kayıp': case 'lost':
        return 'bg-orange-500/10 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/50';
      case 'normal': case 'active': case 'aktif': case 'completed':
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/50';
      case 'info': case 'bilgi':
        return 'bg-sky-500/10 text-sky-700 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/50';
      case 'maintenance':
        return 'bg-purple-500/10 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/50';
      case 'stopped': case 'durdu': case 'inactive': case 'pasif': case 'disabled':
        return 'bg-slate-500/10 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  }
  function badgeDot(s) {
    switch (s) {
      case 'lvl-acil': return 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]';
      case 'alarm': case 'critical': case 'kritik': case 'acil': case 'emergency': case 'danger': return 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]';
      case 'warning': case 'uyarı': case 'major': case 'minor': return 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]';
      case 'koptu': case 'kayıp': case 'lost': return 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]';
      case 'normal': case 'active': case 'aktif': case 'completed': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]';
      case 'info': case 'bilgi': return 'bg-sky-500 shadow-[0_0_8px_rgba(2,132,199,0.8)]';
      case 'maintenance': return 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]';
      default: return 'bg-slate-400';
    }
  }
  function badge(status, label) {
    const s = String(status || 'normal').toLowerCase();
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[11px] font-bold tracking-wide border transition-all ' + badgeClass(s) + '">' +
      '<span class="w-1.5 h-1.5 rounded-full animate-pulse ' + badgeDot(s) + '"></span>' + esc(label || DCIM.ui.badgeLabel(s)) + '</span>';
  }

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const TABS = ['inlet', 'outlet', 'breaker'];
  const state = {
    isLoadingTree: true,
    isLoadingDetails: false,
    pduTreeNodes: [],
    totalCabinetsCount: 0,
    selectedCabinetId: '',
    selectedCabinetName: '',
    pdus: [],
    selectedPdu: null,
    activeTab: TABS.indexOf(params.get('tab')) >= 0 ? params.get('tab') : 'inlet',
    targetPduId: '',
    lastUpdate: null
  };

  // Kaynak: resolveCabinetId() — POD/PDU/NFO/IN son eklerini temizler
  function cleanCabinetRaw(raw) {
    let clean = String(raw || '').trim().replace(/_DV$/, '').replace(/_NFO_.*$/, '').replace(/_IN_.*$/, '');
    const pduMatch = clean.match(/^(.*?)_PDU/i);
    if (pduMatch) clean = pduMatch[1];
    const podMatch = clean.match(/^POD\d+_(.+)$/i);
    if (podMatch) clean = podMatch[1];
    return clean;
  }
  function resolveCabinetId() {
    const raw = params.get('cabinet') || params.get('cabinetId') || params.get('cabinetDevId') || params.get('devId') || params.get('pin') || params.get('targetPduId') || '';
    return raw ? cleanCabinetRaw(raw) : '';
  }
  (function initTarget() {
    const t = params.get('targetPduId');
    if (t) state.targetPduId = t.replace(/_DV$/, '');
    const side = (params.get('pdu') || '').toUpperCase();
    const cab = resolveCabinetId();
    if (!state.targetPduId && (side === 'A' || side === 'B') && cab) {
      state.targetPduId = (cab.charAt(0) === 'K' ? cab : 'K' + cab) + '_PDU_' + side;
    }
  })();

  // ---------------------------------------------------------------------------
  // Ağaç (loadSidebarCabinets)
  // ---------------------------------------------------------------------------
  const naturalCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const slug = s => s.toLowerCase().replace(/\s+/g, '-');
  const P = DCIM.data.pduPage;

  // Ağaçta kabinin grubu: POD; POD yoksa sıra; o da yoksa kabin kodunun sıra harfleri (treeGroup)
  function treeGroup(c) {
    const pod = String(c.pod || '').trim();
    if (pod) return pod;
    const row = (String(c.code || '').toUpperCase().match(/^\d*([A-Z]+)\d+$/) || [])[1] || '';
    return row ? row + ' Sırası' : 'Diğer Kabinler';
  }

  // Kat (DCIM.data.floors sırasıyla) → POD / sıra → kabin. Salon katmanı yoktur (orijinalde CMR'de salon özniteliği yok).
  function loadSidebarCabinets() {
    state.isLoadingTree = true;
    renderTree();
    setTimeout(() => {
      const floorList = P.floors();
      const unique = new Set();
      let activeCabId = resolveCabinetId();
      let activeCabName = '';
      if (activeCabId) {
        const c = P.findCab(activeCabId);
        if (c) { activeCabId = c.code; activeCabName = c.code; }
        else { toast(activeCabId + ' için PDU kaydı bulunamadı; ilk kabin seçildi.', 'warning', T.title); activeCabId = ''; }
      }
      let firstId = '';
      const floorNodes = floorList.filter(f => f.cabinets.length).map(f => {
        const groups = {};
        f.cabinets.forEach(c => { (groups[treeGroup(c)] = groups[treeGroup(c)] || []).push(c); unique.add(c.code); });
        const groupNodes = Object.keys(groups).sort(naturalCompare).map(g => {
          const leaves = groups[g].slice().sort((a, b) => naturalCompare(a.code, b.code)).map(c => {
            if (!firstId) firstId = c.code;
            return { id: c.code, name: c.code, type: 'cabinet', selected: c.code === activeCabId };
          });
          return { id: slug('group-' + f.id + '-' + g), name: g, type: 'pod', expanded: leaves.some(l => l.selected), children: leaves };
        });
        return { id: slug('floor-' + f.id), name: f.label, type: 'floor', expanded: groupNodes.some(g => g.expanded), children: groupNodes };
      });
      state.totalCabinetsCount = unique.size;
      // Üst düğümler konum kaydından (içten dışa: veri merkezi, şehir, şirket)
      const root = {
        id: 'company-tt', name: 'Türk Telekom', type: 'company', expanded: true,
        children: [{ id: 'city-ankara', name: 'Ankara', type: 'city', expanded: true, children: [{ id: 'dc-dca', name: 'DCA', type: 'dc', expanded: true, children: floorNodes }] }]
      };
      if (!activeCabId && firstId) {
        activeCabId = firstId;
        activeCabName = firstId;
        if (floorNodes[0]) {
          floorNodes[0].expanded = true;
          if (floorNodes[0].children && floorNodes[0].children[0]) floorNodes[0].children[0].expanded = true;
        }
      }
      state.pduTreeNodes = floorNodes.length ? [root] : [];
      state.isLoadingTree = false;
      if (activeCabId) selectCabinet(activeCabId, activeCabName, true);
      renderTree(true);
    }, 450);
  }

  // app-location-tree
  const NODE_ICON = {
    company: 'pi pi-globe text-sky-500', city: 'pi pi-map-marker text-sky-500', dc: 'pi pi-building text-sky-500',
    floor: 'pi pi-layers text-sky-500', salon: 'pi pi-th-large text-sky-500', pod: 'pi pi-server text-sky-500',
    cabinet: 'pi pi-box text-sky-500', pdu: 'pi pi-bolt text-amber-500'
  };
  const nodeIndex = {};
  function treeHtml(nodes) {
    return '<div class="space-y-1 text-xs select-none">' + nodes.map(node => {
      nodeIndex[node.id] = node;
      const hasChildren = node.children && node.children.length > 0;
      const sel = node.id === state.selectedCabinetId;
      return '<div>' +
        '<div data-node="' + esc(node.id) + '" class="flex items-center gap-1.5 px-2 py-1 rounded-[2px] cursor-pointer transition-colors justify-between ' +
          (sel ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400 font-bold border-l-2 border-sky-600' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300') + '">' +
          '<div class="flex items-center gap-1.5 min-w-0 flex-1">' +
            (hasChildren
              ? '<button type="button" data-toggle="' + esc(node.id) + '" class="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"><i class="' + (node.expanded ? 'pi pi-chevron-down text-[9px]' : 'pi pi-chevron-right text-[9px]') + '"></i></button>'
              : '<span class="w-4 shrink-0"></span>') +
            '<i class="' + (NODE_ICON[node.type] || 'pi pi-folder text-sky-500') + ' text-xs shrink-0"></i>' +
            '<span class="truncate flex-1 font-medium">' + esc(node.name) + '</span>' +
          '</div>' +
          (node.status
            ? '<div class="flex items-center gap-1 shrink-0 ml-1"><span class="w-1.5 h-1.5 rounded-full" style="background-color:' + esc(node.statusColor || '#868686') + '"></span>' +
              '<span class="text-[8px] font-extrabold uppercase" style="color:' + esc(node.statusColor || '#868686') + '">' + esc(node.status) + '</span></div>'
            : '') +
        '</div>' +
        (node.expanded && hasChildren
          ? '<div class="pl-3.5 border-l border-slate-200 dark:border-slate-800 my-0.5 space-y-0.5">' + treeHtml(node.children) + '</div>'
          : '') +
      '</div>';
    }).join('') + '</div>';
  }

  const treeEl = document.getElementById('pdu-tree');
  const treeBadgeEl = document.getElementById('pdu-tree-badge');
  function renderTree(scrollToSelected) {
    if (state.isLoadingTree) {
      treeBadgeEl.innerHTML = '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center gap-1 shrink-0"><i class="pi pi-spin pi-spinner text-[8px]"></i> ' + esc(T.loading) + '</span>';
      treeEl.innerHTML =
        '<div class="space-y-2.5 p-2 animate-pulse">' +
          '<div class="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/60 rounded"><div class="w-4 h-4 bg-sky-400/40 rounded"></div><div class="h-3 w-28 bg-slate-300 dark:bg-slate-700 rounded"></div></div>' +
          '<div class="ml-4 space-y-2 border-l border-slate-200 dark:border-slate-800 pl-3">' +
            '<div class="flex items-center gap-2 p-1 bg-slate-100/70 dark:bg-slate-800/40 rounded"><div class="w-3.5 h-3.5 bg-sky-400/30 rounded"></div><div class="h-2.5 w-20 bg-slate-300 dark:bg-slate-700 rounded"></div></div>' +
            '<div class="ml-3 space-y-1.5 border-l border-slate-200 dark:border-slate-800 pl-2.5">' +
              '<div class="h-2.5 w-16 bg-slate-200 dark:bg-slate-700/60 rounded"></div><div class="h-2.5 w-24 bg-slate-200 dark:bg-slate-700/60 rounded"></div><div class="h-2.5 w-20 bg-slate-200 dark:bg-slate-700/60 rounded"></div>' +
            '</div>' +
          '</div>' +
          '<div class="pt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400"><i class="pi pi-spin pi-spinner text-xs"></i><span>' + esc(T.loadingHierarchy) + '</span></div>' +
        '</div>';
      return;
    }
    treeBadgeEl.innerHTML = state.totalCabinetsCount > 0
      ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">' + state.totalCabinetsCount + ' ' + esc(T.cabin) + '</span>'
      : '';
    const scroll = treeEl.scrollTop;
    treeEl.innerHTML = treeHtml(state.pduTreeNodes) +
      (!state.pduTreeNodes.length ? '<div class="p-4 text-center text-xs text-slate-400 italic">' + esc(T.noCabinetFound) + '</div>' : '');
    treeEl.scrollTop = scroll;
    if (scrollToSelected) {
      const el = treeEl.querySelector('[data-node="' + CSS.escape(state.selectedCabinetId) + '"]');
      if (el) {
        const er = el.getBoundingClientRect();
        const cr = treeEl.getBoundingClientRect();
        treeEl.scrollTop += er.top - cr.top - cr.height / 2 + er.height / 2;
      }
    }
  }

  treeEl.addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      e.stopPropagation();
      const n = nodeIndex[tg.getAttribute('data-toggle')];
      if (n) { n.expanded = !n.expanded; renderTree(); }
      return;
    }
    const row = e.target.closest('[data-node]');
    if (!row) return;
    const node = nodeIndex[row.getAttribute('data-node')];
    if (!node) return;
    // onTreeNodeSelected: üst düğümde aç/kapa, yaprakta kabin seç
    if (node.children && node.children.length > 0) { node.expanded = !node.expanded; renderTree(); return; }
    if (node.id === state.selectedCabinetId) return;
    state.targetPduId = '';
    selectCabinet(node.id, node.name);
    renderTree();
  });

  // ---------------------------------------------------------------------------
  // Detay (selectCabinet → loadSelectedCabinetDetails → processParsedDevs)
  // ---------------------------------------------------------------------------
  let detailTimer = null;
  function selectCabinet(cabinetId, cabinetName, initial) {
    state.selectedCabinetId = cabinetId;
    state.selectedCabinetName = cabinetName || (cabinetId.startsWith('K') ? cabinetId.substring(1) : cabinetId);
    state.isLoadingDetails = true;
    renderHeader();
    renderMain();
    syncUrl();
    clearTimeout(detailTimer);
    detailTimer = setTimeout(() => loadSelectedCabinetDetails(cabinetId, false), initial ? 250 : 350);
  }

  function extractIosFromDev(dev) {
    const ios = [];
    if (!dev) return ios;
    const collect = item => {
      if (!item || typeof item !== 'object' || !item.id) return;
      ios.push({ id: String(item.id), val: item.val !== undefined ? String(item.val) : '-', sta: String(item.sta || ''), unit: String(item.unit || '-'), desc: String(item.desc || '') });
    };
    (Array.isArray(dev.io) ? dev.io : dev.io ? [dev.io] : []).forEach(collect);
    return ios;
  }

  function loadSelectedCabinetDetails(cabinetId, isPolling) {
    if (!cabinetId) { state.isLoadingDetails = false; renderMain(); return; }
    const parsedDevs = P.query(cabinetId, isPolling);
    if (!parsedDevs.length) {
      state.pdus = [];
      state.selectedPdu = null;
      state.isLoadingDetails = false;
      renderMain();
      return;
    }
    processParsedDevs(parsedDevs);
  }

  const formatVal = (raw, unit) => {
    if (raw === undefined || raw === null || raw === '' || raw === '-') return '-';
    const num = parseFloat(String(raw).replace(',', '.'));
    return !isNaN(num) ? num + ' ' + unit : raw + ' ' + unit;
  };
  const hasVal = v => v !== undefined && v !== null && v !== '' && v !== '-';
  const findVal = (ios, pred) => { const x = ios.find(pred); return x ? x.val : undefined; };

  function processParsedDevs(parsedDevs) {
    const transformed = parsedDevs.map(dev => {
      const deviceId = String(dev.id || '').replace(/_DV$/, '');
      const snmpVersion = hasVal(dev.pro_ver) ? String(dev.pro_ver) : '-';
      const conHost = dev.con_host || '-';
      const ios = extractIosFromDev(dev);
      // Motor alarm bitlerini io @sta üzerinde yükseltir; susturulmamış io'ların en kötü değer biti cihaza taşınır
      const devStaNum = parseStaNumber(dev.sta);
      let effSta = devStaNum;
      if ((devStaNum & STA_MUTED) !== STA_MUTED) {
        let worstVal = devStaNum & STA_MSK_VAL;
        ios.forEach(io => {
          const s = parseStaNumber(io.sta);
          if ((s & STA_MUTED) === STA_MUTED) return;
          if ((s & STA_MSK_VAL) > worstVal) worstVal = s & STA_MSK_VAL;
        });
        effSta = (devStaNum & ~STA_MSK_VAL) | worstVal;
      }
      const comm = getCommStatus(effSta);
      const nfo = key => { const v = findVal(ios, io => io.id.includes(key)); return hasVal(v) ? v : ''; };
      const manuf = nfo('_NFO_PDUMANUF') || '-';
      const model = nfo('_NFO_PDUMODEL') || '-';
      const serNo = nfo('_NFO_PDUSERNO') || '-';
      const ipAddr = nfo('_NFO_PDUIPADDR') || (conHost !== '-' ? conHost : '-');
      const nfoName = nfo('_NFO_PDUNAME');
      const formatRtd = (key, unit) => { const v = findVal(ios, io => io.id.includes(key)); return hasVal(v) ? v + ' ' + unit : '-'; };
      const inletRows = parseInletRows(ios);
      const outletRows = parseOutletRows(ios);
      const breakerRows = parseBreakerRows(ios);
      const inCnt = nfo('_NFO_PDUINCNT');
      const outCnt = nfo('_NFO_PDUOUTCNT');
      const inletCount = inCnt && !isNaN(parseInt(inCnt, 10)) ? inCnt : (inletRows.filter(r => !r.isTotal).length || '-');
      const outletCount = outCnt && !isNaN(parseInt(outCnt, 10)) ? outCnt : (outletRows.length || '-');
      return {
        id: deviceId,
        name: getPduDisplayName(deviceId, nfoName),
        status: comm.label,
        badgeStatus: comm.badgeStatus,
        rawSta: dev.sta,
        manuf, model, serNo, ipAddr, nfoName, snmpVersion,
        rtdVolt: formatRtd('_RTD_VOLT', 'V'),
        rtdCurr: formatRtd('_RTD_CURR', 'A'),
        rtdVA: formatRtd('_RTD_VA', 'VA'),
        inletCount, outletCount, inletRows, outletRows, breakerRows,
        tabAlarm: tabAlarms(ios),
        ios
      };
    });
    state.pdus = transformed;
    let selected = null;
    const t = state.targetPduId;
    if (t) selected = transformed.find(p => p.id === t || p.id.endsWith(t) || t.endsWith(p.id)) || null;
    if (!selected && state.selectedPdu) selected = transformed.find(p => p.id === state.selectedPdu.id) || null;
    if (!selected && transformed.length) selected = transformed.find(p => p.id.endsWith('_PDU_A')) || transformed[0];
    state.selectedPdu = selected;
    state.isLoadingDetails = false;
    state.lastUpdate = new Date();
    renderMain();
  }

  // INLET: _IN_, _IN1_.._IN4_, _IN_TOT_
  function parseInletRows(ios) {
    const data = ios.filter(io => (io.id.includes('_IN_') || /_IN\d*_/.test(io.id)) && !io.id.includes('_NFO_'));
    if (!data.length) return [];
    const groups = new Map();
    data.forEach(io => {
      const m = io.id.match(/_IN(\d+)_/);
      const key = m ? m[1] : (io.id.includes('_IN_TOT_') || io.id.includes('_TOT_') ? 'TOT' : '1');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(io);
    });
    const keys = Array.from(groups.keys()).sort((a, b) => (a === 'TOT' ? 1 : b === 'TOT' ? -1 : parseInt(a, 10) - parseInt(b, 10)));
    const rows = [];
    keys.forEach(key => {
      if (key === 'TOT') return;
      const g = groups.get(key) || [];
      const f = s => findVal(g, io => io.id.includes(s));
      const volt = f('_VOLT_FN') !== undefined ? f('_VOLT_FN') : f('_VOLT_FF') !== undefined ? f('_VOLT_FF') : f('_VOLT');
      const pf = f('_PF');
      rows.push({
        field: 'Inlet ' + key.padStart(2, '0'),
        current: formatVal(f('_CURR'), 'A'),
        voltage: formatVal(volt, 'V'),
        power: formatVal(f('_POW'), 'W'),
        apparentPower: formatVal(f('_APPOW'), 'VA'),
        powerFactor: hasVal(pf) ? pf : '-',
        activeEnergy: formatVal(f('_AENRG'), 'Wh'),
        frequency: formatVal(f('_FREQ'), 'Hz'),
        isTotal: false
      });
    });
    if (keys.filter(k => k !== 'TOT').length > 1 || groups.has('TOT')) {
      const tot = groups.get('TOT') || [];
      const p = s => findVal(tot, io => io.id.includes(s));
      const sumNums = prop => {
        const vals = rows.filter(r => !r.isTotal).map(r => (!r[prop] || r[prop] === '-' ? NaN : parseFloat(String(r[prop]).replace(',', '.')))).filter(v => !isNaN(v));
        if (!vals.length) return undefined;
        const total = vals.reduce((a, b) => a + b, 0);
        return Number.isFinite(total) ? total.toFixed(2).replace(/\.00$/, '') : undefined;
      };
      const or = (a, b) => (a !== undefined ? a : b);
      const pfTotal = or(p('_PF'), '-');
      rows.push({
        field: 'Toplam Inlet',
        current: formatVal(or(p('_CURR'), sumNums('current')), 'A'),
        voltage: formatVal(or(p('_VOLT_FN'), or(p('_VOLT_FF'), or(p('_VOLT'), rows[0] ? rows[0].voltage.replace(' V', '') : undefined))), 'V'),
        power: formatVal(or(p('_POW'), sumNums('power')), 'W'),
        apparentPower: formatVal(or(p('_APPOW'), sumNums('apparentPower')), 'VA'),
        powerFactor: hasVal(pfTotal) ? pfTotal : '-',
        activeEnergy: formatVal(or(p('_AENRG'), sumNums('activeEnergy')), 'Wh'),
        frequency: formatVal(or(p('_FREQ'), rows[0] ? rows[0].frequency.replace(' Hz', '') : undefined), 'Hz'),
        isTotal: true
      });
    }
    return rows;
  }

  // OUTLET: _OUT01_CURR, _VOLT, _POW, _APPOW, _PF, _AENRG, _STATUS
  function parseOutletRows(ios) {
    const data = ios.filter(io => io.id.includes('_OUT') && !io.id.includes('_NFO_'));
    if (!data.length) return [];
    const groups = new Map();
    data.forEach(io => {
      const m = io.id.match(/_OUT(\d+)_/i);
      if (!m) return;
      if (!groups.has(m[1])) groups.set(m[1], []);
      groups.get(m[1]).push(io);
    });
    return Array.from(groups.entries()).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)).map(([num, g]) => {
      const f = s => findVal(g, io => io.id.includes(s));
      const statusVal = f('_STATUS');
      let status = 'Normal';
      let badgeStatus = 'active';
      if (statusVal === '1') { status = 'ON'; badgeStatus = 'active'; }
      else if (statusVal === '0') { status = 'OFF'; badgeStatus = 'stopped'; }
      else if (hasVal(statusVal)) { status = String(statusVal); badgeStatus = 'info'; }
      // Çıkışın noktalarında UYARI/ALARM/ACİL varsa ON/OFF yerine o gösterilir (2D kabin rengiyle aynı kaynak: io @sta)
      const outletAlarm = rowAlarm(g);
      if (outletAlarm) { status = outletAlarm.label; badgeStatus = outletAlarm.badgeStatus; }
      const pf = f('_PF');
      return {
        no: parseInt(num, 10),
        outlet: 'Outlet ' + num.padStart(2, '0'),
        current: formatVal(f('_CURR'), 'A'),
        voltage: formatVal(f('_VOLT'), 'V'),
        power: formatVal(f('_POW'), 'W'),
        apparentPower: formatVal(f('_APPOW'), 'VA'),
        powerFactor: hasVal(pf) ? pf : '-',
        activeEnergy: formatVal(f('_AENRG'), 'Wh'),
        status, badgeStatus, rawStatus: statusVal
      };
    });
  }

  // DEVRE KESİCİ: _OCP_C1_CURR.., _RTD_OCP1_CURR, _RTD_CURR
  function parseBreakerRows(ios) {
    const data = ios.filter(io => io.id.includes('_OCP') && !io.id.includes('_ONLVL') && !io.id.includes('_NFO_'));
    const rated = ios.filter(io => /_OCP_C\d+_CURR/i.test(io.id) || io.id.includes('_RTD_OCP') || (io.id.includes('_RTD') && io.id.includes('_CURR')));
    if (!data.length) return [];
    const groups = new Map();
    data.forEach(io => {
      const m = io.id.match(/_OCP_?C?(\d+)/i);
      if (!m) return;
      if (!groups.has(m[1])) groups.set(m[1], []);
      groups.get(m[1]).push(io);
    });
    return Array.from(groups.entries()).sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10)).map(([n, g]) => {
      const currIo = g.find(io => io.id.includes('_OCP_C' + n + '_CURR') || (io.id.includes('_C' + n + '_') && io.id.includes('_CURR'))) ||
        g.find(io => io.id.includes('_CURR') && !io.id.includes('_RTD'));
      const current = currIo ? currIo.val : undefined;
      const statusIo = g.find(io => io.id.includes('_OCP_C' + n + '_STATUS') || (io.id.includes('_C' + n + '_') && io.id.includes('_STATUS'))) || g.find(io => io.id.includes('_STATUS'));
      const statusVal = statusIo ? statusIo.val : undefined;
      // Anma akımı RTD noktasıdır; kesicinin kendi akım noktası (_OCP_Cn_CURR) anma sayılmaz
      const ratedIo = rated.find(io => io !== currIo && (io.id.includes('_RTD_OCP' + n + '_CURR') || io.id.includes('_RTD_OCP_C' + n + '_CURR'))) ||
        ios.find(io => io.id.includes('_RTD_CURR'));
      const ratedCurrent = ratedIo ? ratedIo.val : undefined;
      const cNum = parseFloat(String(current).replace(',', '.'));
      const rNum = parseFloat(String(ratedCurrent).replace(',', '.'));
      const remaining = !isNaN(rNum) && rNum > 0 && !isNaN(cNum) ? (rNum - cNum).toFixed(2) + ' A' : '-';
      let status = 'Normal';
      let badgeStatus = 'active';
      if (statusVal === '1') { status = 'ON'; badgeStatus = 'active'; }
      else if (statusVal === '0') { status = 'OFF'; badgeStatus = 'stopped'; }
      else if (currIo && currIo.sta) { const c = getCommStatus(currIo.sta); status = c.label; badgeStatus = c.badgeStatus; }
      // OCP akımı 2D'de kabini renklendiren noktadır: alarmı ON/OFF'u ezer
      const breakerAlarm = rowAlarm(currIo ? [currIo].concat(g) : g);
      if (breakerAlarm) { status = breakerAlarm.label; badgeStatus = breakerAlarm.badgeStatus; }
      return {
        no: parseInt(n, 10),
        breaker: 'C' + n.padStart(2, '0'),
        current: formatVal(current, 'A'),
        ratedCurrent: formatVal(ratedCurrent, 'A'),
        remainingCurrent: remaining,
        status, badgeStatus,
        staStatus: currIo && currIo.sta ? getCommStatus(currIo.sta).label : 'Normal'
      };
    });
  }

  function getPduDisplayName(deviceId, nfoName) {
    if (nfoName && nfoName.trim() !== '' && nfoName.trim() !== '-') return nfoName;
    let cleanId = deviceId.replace('_NFO_BL1', '').replace('_NFO', '').replace('_IN', '').replace('_BL1', '');
    const podMatch = cleanId.match(/^POD\d+_(.+)$/);
    if (podMatch) cleanId = podMatch[1];
    const parts = cleanId.split('_').filter(Boolean);
    const base = parts[0] || cleanId;
    const baseNoK = base.startsWith('K') ? base.substring(1) : base;
    const rest = parts.slice(1).join('_');
    return rest ? baseNoK + '_' + rest : baseNoK;
  }

  // ---------------------------------------------------------------------------
  // Görünüm
  // ---------------------------------------------------------------------------
  const headerEl = document.getElementById('page-header');
  const mainEl = document.getElementById('pdu-main');

  function renderHeader() {
    headerEl.innerHTML = kit.pageHeader({
      title: T.title,
      breadcrumbs: [
        { label: T.assets },
        { label: T.cabinetManager, href: 'cabinet-detail.html' + (state.selectedCabinetName ? '?cabinet=' + encodeURIComponent(state.selectedCabinetName) : '') },
        { label: T.title }
      ]
    });
  }

  function syncUrl() {
    try {
      const q = new URLSearchParams();
      if (state.selectedCabinetName) q.set('cabinet', state.selectedCabinetName);
      if (state.selectedPdu && /_PDU_B$/.test(state.selectedPdu.id)) q.set('pdu', 'B');
      if (state.activeTab !== 'inlet') q.set('tab', state.activeTab);
      history.replaceState(null, '', window.location.pathname + '?' + q.toString());
    } catch (e) { /* file:// altında bazı tarayıcılar izin vermeyebilir */ }
  }

  function loadingSkeleton() {
    const idRows = Array.from({ length: 12 }, () => '<div class="flex justify-between items-center py-1"><div class="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div><div class="h-3 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div></div>').join('');
    const tRows = Array.from({ length: 5 }, () => '<div class="h-8 bg-slate-100 dark:bg-slate-800/40 rounded"></div>').join('');
    return '<div class="space-y-3">' +
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2px] p-3 shadow-xs animate-pulse">' +
        '<div class="flex items-center justify-between"><div class="flex items-center gap-3">' +
          '<div class="w-9 h-9 rounded bg-amber-500/30 flex items-center justify-center"><i class="pi pi-spin pi-spinner text-amber-600 text-sm"></i></div>' +
          '<div class="space-y-1.5"><div class="h-4 w-44 bg-slate-200 dark:bg-slate-700 rounded"></div><div class="h-2.5 w-32 bg-slate-100 dark:bg-slate-800 rounded"></div></div>' +
        '</div><div class="h-7 w-28 bg-slate-200 dark:bg-slate-800 rounded"></div></div>' +
      '</div>' +
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2px] p-4 shadow-xs space-y-3 animate-pulse">' +
        '<div class="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2"><div class="w-4 h-4 rounded bg-slate-300 dark:bg-slate-700"></div><div class="h-3.5 w-48 bg-slate-300 dark:bg-slate-700 rounded"></div></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">' + idRows + '</div>' +
      '</div>' +
      '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2px] p-4 shadow-xs space-y-3 animate-pulse">' +
        '<div class="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-2"><div class="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div><div class="h-6 w-20 bg-slate-200 dark:bg-slate-800 rounded"></div><div class="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded"></div></div>' +
        '<div class="space-y-2 pt-2">' + tRows + '</div>' +
      '</div>' +
      '<div class="p-3 bg-sky-500/10 border border-sky-500/20 rounded text-center text-xs font-semibold text-sky-700 dark:text-sky-300 flex items-center justify-center gap-2 shadow-xs">' +
        '<i class="pi pi-spin pi-spinner text-sky-600 text-sm"></i><span>' + esc(state.selectedCabinetName ? state.selectedCabinetName + ' - ' + T.loadingTelemetry : T.loadingTelemetry) + '</span>' +
      '</div>' +
    '</div>';
  }

  function headerSection(p) {
    const code = state.selectedCabinetName;
    const pills = state.pdus.length > 1
      ? '<div class="flex items-center gap-1.5 mt-2"><span class="text-[10px] font-bold text-slate-400">' + esc(T.unit) + ':</span>' +
          state.pdus.map(x => '<button type="button" data-pdu="' + esc(x.id) + '" class="px-2 py-0.5 text-[10px] rounded transition-colors cursor-pointer flex items-center gap-1 ' +
            (p.id === x.id ? 'bg-brand-500 text-white font-bold shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700') + '">' +
            '<i class="pi pi-bolt text-[9px] shrink-0"></i><span class="min-w-0">' + esc(x.name || x.nfoName || x.id) + '</span>' +
          '</button>').join('') +
        '</div>'
      : '';
    return '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2px] p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">' +
      '<div class="flex items-center gap-2.5">' +
        '<div class="w-9 h-9 rounded bg-brand-500 text-white font-black flex items-center justify-center text-sm shadow-xs"><i class="pi pi-bolt"></i></div>' +
        '<div>' +
          '<div class="flex items-center gap-2">' +
            '<h1 class="text-sm font-extrabold text-slate-900 dark:text-slate-100">' + esc(p.name || p.nfoName || T.selectPdu) + '</h1>' +
            '<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-brand-500/15 text-brand-700 dark:text-brand-300 border border-brand-500/30">' + esc(T.cabinet) + ': ' + esc(code) + '</span>' +
            badge(p.badgeStatus, p.status) +
          '</div>' +
          '<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">IP: ' + esc(p.ipAddr || '-') + ' | Cihaz: ' + esc(p.id) + '</p>' +
          pills +
        '</div>' +
      '</div>' +
      // Rapor: seçili PDU tabloları (sekme başına kapsam); menü kalıcı düğümdür, her çizimde bu yuvaya taşınır
      '<div class="flex items-center gap-2 shrink-0" data-report-slot></div>' +
    '</div>';
  }

  function identityCard(p) {
    const row = (label, valueHtml) => '<div class="py-1.5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800"><span class="text-slate-500 dark:text-slate-400">' + esc(label) + ':</span>' + valueHtml + '</div>';
    const strong = (v, cls) => '<strong class="' + cls + '">' + esc(v) + '</strong>';
    return kit.card({
      title: T.identityCardTitle,
      icon: 'pi pi-id-card',
      body: '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2 text-xs">' +
        row(T.pduName, strong(p.name, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.pduBrand, strong(p.manuf, 'text-slate-900 dark:text-slate-100')) +
        row(T.pduModel, strong(p.model, 'text-slate-900 dark:text-slate-100')) +
        row(T.ipAddress, strong(p.ipAddr, 'text-sky-600 dark:text-sky-400 font-mono')) +
        row(T.serialNumber, strong(p.serNo, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.snmpVersion, strong(p.snmpVersion, 'text-amber-600 dark:text-amber-400 font-mono font-bold')) +
        row(T.ratedVoltage, strong(p.rtdVolt, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.ratedCurrent, strong(p.rtdCurr, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.ratedApparentPower, strong(p.rtdVA, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.inletCount, strong(p.inletCount, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.outletCount, strong(p.outletCount, 'text-slate-900 dark:text-slate-100 font-mono')) +
        row(T.alarmStatus, badge(p.badgeStatus, p.status)) +
      '</div>'
    });
  }

  const TAB_ON = 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 font-extrabold shadow-xs border border-slate-200 dark:border-slate-800';
  const TAB_OFF = 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-800/60 font-medium';
  const TH = 'py-2.5 px-3';
  const THEAD_TR = 'border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-950/50';
  const TD_NAME = 'py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100';
  const TD_AMBER = 'py-2.5 px-3 font-mono font-bold text-amber-600 dark:text-amber-400';
  const TD_MONO = 'py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300';
  const TD_SKY_B = 'py-2.5 px-3 font-mono font-bold text-sky-600 dark:text-sky-400';
  const TD_SKY = 'py-2.5 px-3 font-mono text-sky-600 dark:text-sky-400';
  const TD_EMERALD = 'py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400';
  const ROW_HOVER = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors';

  function tabButton(key, icon, label, count, level) {
    return '<button type="button" data-tab="' + key + '" class="px-3.5 py-1.5 text-xs rounded transition-all cursor-pointer flex items-center gap-2 ' + (state.activeTab === key ? TAB_ON : TAB_OFF) + '">' +
      '<i class="' + icon + ' text-xs"></i><span>' + esc(label) + '</span>' +
      (count > 0 ? '<span class="px-1.5 py-0.2 rounded-full text-[10px] font-mono ' + tabCountClass(level) + '">' + count + '</span>' : '') +
    '</button>';
  }
  const table = (head, body) => '<table class="w-full text-left text-xs border-collapse"><thead><tr class="' + THEAD_TR + '">' +
    head.map(h => '<th class="' + TH + '">' + esc(h) + '</th>').join('') + '</tr></thead>' +
    '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/60">' + body + '</tbody></table>';
  const noData = msg => '<div class="py-8 text-center text-xs text-slate-400 italic">' + esc(msg) + '</div>';

  function tabsSection(p) {
    let content = '';
    if (state.activeTab === 'inlet') {
      content = '<div class="overflow-x-auto">' + loadBalance(p) + (p.inletRows.length
        ? table([T.tField, T.tCurrent, T.tVoltage, T.tPower, T.tApparentPower, T.tPowerFactor, T.tActiveEnergy, T.tFrequency],
          p.inletRows.map(r => '<tr class="' + (r.isTotal ? 'bg-slate-100/80 dark:bg-slate-800/70 font-bold border-t-2 border-slate-300 dark:border-slate-700' : ROW_HOVER) + '">' +
            '<td class="' + TD_NAME + '">' + esc(r.field) + '</td><td class="' + TD_AMBER + '">' + esc(r.current) + '</td><td class="' + TD_MONO + '">' + esc(r.voltage) + '</td>' +
            '<td class="' + TD_SKY_B + '">' + esc(r.power) + '</td><td class="' + TD_MONO + '">' + esc(r.apparentPower) + '</td><td class="' + TD_MONO + '">' + esc(r.powerFactor) + '</td>' +
            '<td class="' + TD_MONO + '">' + esc(r.activeEnergy) + '</td><td class="' + TD_MONO + '">' + esc(r.frequency) + '</td></tr>').join(''))
        : noData(T.noInletData)) + '</div>';
    } else if (state.activeTab === 'outlet') {
      const hosts = P.outletAssets(state.selectedCabinetId, /_PDU_B$/.test(p.id) ? 'B' : 'A');
      content = '<div class="overflow-x-auto">' + (p.outletRows.length
        ? table([T.outlet, T.tCurrent, T.tVoltage, T.tPower, T.tApparentPower, T.tPowerFactor, T.tActiveEnergy, T.tStatus],
          p.outletRows.map(r => {
            const h = hosts[r.no] || [];
            return '<tr class="' + ROW_HOVER + '"' + (h.length ? ' title="Bağlı cihaz: ' + esc(h.join(', ')) + '"' : '') + '>' +
              '<td class="' + TD_NAME + '">' + esc(r.outlet) + '</td><td class="' + TD_AMBER + '">' + esc(r.current) + '</td><td class="' + TD_MONO + '">' + esc(r.voltage) + '</td>' +
              '<td class="' + TD_SKY + '">' + esc(r.power) + '</td><td class="' + TD_MONO + '">' + esc(r.apparentPower) + '</td><td class="' + TD_MONO + '">' + esc(r.powerFactor) + '</td>' +
              '<td class="' + TD_MONO + '">' + esc(r.activeEnergy) + '</td><td class="py-2.5 px-3">' + badge(r.badgeStatus, r.status) + '</td></tr>';
          }).join(''))
        : noData(T.noOutletData)) + '</div>';
    } else {
      content = '<div class="overflow-x-auto">' + (p.breakerRows.length
        ? table([T.circuitBreaker, T.tCurrent, T.tRatedCurrent, T.tRemainingCurrent, T.tStatus],
          p.breakerRows.map(r => '<tr class="' + ROW_HOVER + '">' +
            '<td class="' + TD_NAME + '">' + esc(r.breaker) + '</td><td class="' + TD_AMBER + '">' + esc(r.current) + '</td><td class="' + TD_MONO + '">' + esc(r.ratedCurrent) + '</td>' +
            '<td class="' + TD_EMERALD + '">' + esc(r.remainingCurrent) + '</td><td class="py-2.5 px-3">' + badge(r.badgeStatus, r.status) + '</td></tr>').join(''))
        : noData(T.noBreakerData)) + '</div>';
    }
    return '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2px] shadow-xs overflow-hidden">' +
      '<div class="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-2.5">' +
        tabButton('inlet', 'pi pi-sign-in', T.inlet, p.inletRows.length, p.tabAlarm && p.tabAlarm.inlet) +
        tabButton('outlet', 'pi pi-sign-out', T.outlet, p.outletRows.length, p.tabAlarm && p.tabAlarm.outlet) +
        tabButton('breaker', 'pi pi-shield', T.circuitBreaker, p.breakerRows.length, p.tabAlarm && p.tabAlarm.breaker) +
        '<span class="ml-auto hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
          '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Canlı · 5 sn · ' + esc(state.lastUpdate ? fmtTime(state.lastUpdate) : '--:--:--') +
        '</span>' +
      '</div>' +
      '<div class="p-3">' + content + '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Sunum eki: Faz yük dengesi ve kesici yükleri (anma akımı + ONLVLHIWRN/ONLVLHIALM eşikleri)
  // Kaynak şablonda yoktur; aynı IO'lardan türetilir ve Inlet sekmesinin üstünde gösterilir.
  // ---------------------------------------------------------------------------
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };
  function loadBar(value, max, warnAt, almAt, lost) {
    const pct = max > 0 && value != null ? Math.min(100, value / max * 100) : 0;
    const color = lost ? 'bg-rose-500' : value >= almAt ? 'bg-rose-500' : value >= warnAt ? 'bg-amber-500' : 'bg-emerald-500';
    return '<div class="relative flex-1 h-2.5 rounded-[2px] bg-slate-200 dark:bg-slate-800 overflow-hidden">' +
      '<div class="absolute inset-y-0 left-0 ' + color + ' transition-all duration-500" style="width:' + pct.toFixed(1) + '%"></div>' +
      '<div class="absolute inset-y-0 w-px bg-amber-500" style="left:' + (warnAt / max * 100).toFixed(1) + '%" title="Uyarı limiti"></div>' +
      '<div class="absolute inset-y-0 w-px bg-rose-500" style="left:' + (almAt / max * 100).toFixed(1) + '%" title="Alarm limiti"></div>' +
    '</div>';
  }
  function loadBalance(p) {
    const ios = p.ios;
    const v = key => num(findVal(ios, io => io.id.endsWith(key)));
    const staOf = key => { const x = ios.find(io => io.id.endsWith(key)); return x ? x.sta : ''; };
    const rated = v('_RTD_CURR') || 32;
    const three = ios.some(io => /_IN1_CURR$/.test(io.id));
    const phases = three
      ? [1, 2, 3].map(ph => ({ label: 'L' + ph, curr: v('_IN' + ph + '_CURR'), volt: v('_IN' + ph + '_VOLT_FN'), sta: staOf('_IN' + ph + '_VOLT_FN') }))
      : [{ label: 'L1', curr: v('_IN_CURR'), volt: v('_IN_VOLT'), sta: staOf('_IN_VOLT') }];
    const phaseRows = phases.map(ph => {
      const lost = ph.volt === 0;
      return '<div class="flex items-center gap-2 text-[11px]">' +
        '<span class="w-6 font-mono font-bold ' + (lost ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300') + '">' + ph.label + '</span>' +
        loadBar(ph.curr, rated, rated * 0.8, rated * 0.9, lost) +
        '<span class="w-24 text-right font-mono font-bold text-amber-600 dark:text-amber-400">' + (ph.curr != null ? ph.curr.toFixed(2) : '-') + ' / ' + rated + ' A</span>' +
        '<span class="w-20 text-right font-mono ' + (lost ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400') + '">' + (lost ? '0 V · KAYIP' : (ph.volt != null ? ph.volt.toFixed(1) + ' V' : '-')) + '</span>' +
      '</div>';
    }).join('');
    const currs = phases.map(ph => ph.curr || 0);
    const avg = currs.reduce((a, b) => a + b, 0) / currs.length;
    const imbalance = three && avg > 0 ? (Math.max.apply(null, currs) - Math.min.apply(null, currs)) / avg * 100 : null;

    const breakers = p.breakerRows.map(b => {
      const n = b.no;
      const curr = v('_OCP_C' + n + '_CURR');
      const r = v('_RTD_OCP' + n + '_CURR') || rated;
      const wrn = v('_OCP_C' + n + '_ONLVLHIWRN') || r * 0.8;
      const alm = v('_OCP_C' + n + '_ONLVLHIALM') || r * 0.9;
      const lost = b.badgeStatus === 'alarm' && (curr || 0) < wrn;
      return '<div class="flex items-center gap-2 text-[11px]">' +
        '<span class="w-8 font-mono font-bold text-slate-700 dark:text-slate-300">' + esc(b.breaker) + '</span>' +
        loadBar(curr, r, wrn, alm, lost) +
        '<span class="w-24 text-right font-mono font-bold ' + (lost || curr >= alm ? 'text-rose-600 dark:text-rose-400' : curr >= wrn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300') + '">' + (curr != null ? curr.toFixed(2) : '-') + ' / ' + r + ' A</span>' +
        '<span class="w-20 text-right font-mono text-[10px] font-bold ' + (lost ? 'text-rose-600 dark:text-rose-400' : curr >= alm ? 'text-rose-600 dark:text-rose-400' : curr >= wrn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400') + '">' +
          (lost ? 'FAZ YOK' : curr != null ? '%' + (curr / r * 100).toFixed(0) : '-') + '</span>' +
      '</div>';
    }).join('');

    // Kabine ait aktif enerji alarmları (alarms.html ile aynı kayıtlar)
    const side = /_PDU_B$/.test(p.id) ? 'B' : 'A';
    const alarms = DCIM.data.activeAlarms.filter(a => a.target === state.selectedCabinetName && (/_PDU_/.test(a.rid) ? a.rid.indexOf('_PDU_' + side) >= 0 : /_OCP_/.test(a.rid)));
    const alarmHtml = alarms.map(a => {
      const crit = a.level === 'alarm';
      const acil = crit && a.severity === 'critical'; // Acil her yerde mor
      return '<a href="alarms.html" class="flex items-center gap-2 px-2.5 py-1.5 rounded-[2px] border text-[11px] font-semibold transition-colors ' +
        (acil ? 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300 ' : crit ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300 ' : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300 ') + '">' +
        '<i class="pi ' + (crit ? 'pi-exclamation-circle' : 'pi-exclamation-triangle') + ' text-xs"></i>' +
        '<span class="truncate">' + esc(a.txt) + '</span>' +
        '<span class="ml-auto shrink-0 font-mono text-[10px] opacity-80">' + esc(DCIM.ui.fmtDateTime(a.tim).slice(11, 16)) + '</span>' +
      '</a>';
    }).join('');

    const panel = (title, icon, body) => '<div class="rounded-[2px] border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-2.5 space-y-1.5">' +
      '<div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1"><i class="' + icon + ' text-sky-600 dark:text-sky-400 text-[10px]"></i>' + esc(title) + '</div>' +
      body + '</div>';
    const legend = '<span class="flex items-center gap-1"><span class="w-2 h-px bg-amber-500 inline-block"></span>Uyarı %80</span><span class="flex items-center gap-1"><span class="w-2 h-px bg-rose-500 inline-block"></span>Alarm %90</span>';
    const foot = left => '<div class="pt-1 flex items-center gap-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400">' + (left || '') + '<span class="ml-auto flex items-center gap-3">' + legend + '</span></div>';

    return (alarmHtml ? '<div class="space-y-1.5 mb-3">' + alarmHtml + '</div>' : '') +
      '<div class="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3">' +
        panel('Faz Yük Dengesi', 'pi pi-chart-bar', phaseRows +
          foot(imbalance != null ? '<span>Faz dengesizliği: <span class="font-mono font-bold ' + (imbalance > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300') + '">%' + imbalance.toFixed(0) + '</span></span>' : '<span>Anma akımına göre (' + rated + ' A)</span>')) +
        panel('Devre Kesici Yükleri', 'pi pi-shield', breakers ? breakers + foot('<span>OCP limitleri (ONLVLHIWRN / ONLVLHIALM)</span>') : noData(T.noBreakerData)) +
      '</div>';
  }

  function emptyPdu() {
    return '<div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded p-8 text-center space-y-3 shadow-xs">' +
      '<div class="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl"><i class="pi pi-bolt"></i></div>' +
      '<h3 class="text-sm font-bold text-slate-700 dark:text-slate-300">' + esc(T.noPduData) + '</h3>' +
      '<p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">' + esc(T.noPduDesc) + '</p>' +
    '</div>';
  }

  function renderMain() {
    if (state.isLoadingDetails) { mainEl.innerHTML = loadingSkeleton(); return; }
    const p = state.selectedPdu;
    if (!p) { mainEl.innerHTML = state.isLoadingTree ? '' : emptyPdu(); return; }
    const scroll = mainEl.scrollTop;
    mainEl.innerHTML = headerSection(p) + '<div class="space-y-3">' + identityCard(p) + tabsSection(p) + '</div>';
    const slot = mainEl.querySelector('[data-report-slot]');
    if (slot) slot.appendChild(reportHost);
    mainEl.scrollTop = scroll;
  }

  mainEl.addEventListener('click', e => {
    const pill = e.target.closest('[data-pdu]');
    if (pill) {
      const p = state.pdus.find(x => x.id === pill.getAttribute('data-pdu'));
      if (p) { state.selectedPdu = p; state.targetPduId = p.id; renderMain(); syncUrl(); }
      return;
    }
    const tab = e.target.closest('[data-tab]');
    if (tab) { state.activeTab = tab.getAttribute('data-tab'); renderMain(); syncUrl(); return; }
  });

  // Polling (interval(5000)) — canlı değerler
  setInterval(() => {
    if (state.selectedCabinetId && !state.isLoadingDetails) loadSelectedCabinetDetails(state.selectedCabinetId, true);
  }, 5000);

  // ---------------------------------------------------------------------------
  // Rapor (app-report-export-menu, options="limit" unit="satır") — seçili PDU'nun sekme tabloları
  // ---------------------------------------------------------------------------
  const REPORT_SCOPES = [
    { id: 'inlet', label: 'İnlet tablosu', hint: 'Giriş faz ve güç değerleri' },
    { id: 'outlet', label: 'Outlet tablosu', hint: 'Çıkış soketleri' },
    { id: 'breaker', label: 'Devre kesici tablosu' },
    { id: 'all', label: 'Tüm tablolar', hint: 'İnlet, outlet ve devre kesici' }
  ];
  // Rapor satır tonu (statusTone): Acil mor, Alarm/KOPTU kırmızı, Uyarı sarı
  const statusTone = b => (b === 'lvl-acil' ? 'acil' : b === 'alarm' || b === 'koptu' ? 'alarm' : b === 'warning' ? 'warning' : '');

  function exportReport(req) {
    const p = state.selectedPdu;
    if (!p) { toast('Lütfen önce bir PDU seçiniz.', 'warning'); return; }
    const pduName = p.name || p.nfoName || p.id || 'PDU';
    const want = scope => req.scope === 'all' || req.scope === scope;
    const lim = rows => DCIM.report.applyLimit(rows, req);
    const sections = [];
    let total = 0;
    if (want('inlet')) {
      total += p.inletRows.length;
      sections.push({
        title: 'İnlet', toneKey: '_tone',
        columns: [{ key: 'field', label: 'Alan' }, { key: 'current', label: 'Akım', align: 'right' }, { key: 'voltage', label: 'Voltaj', align: 'right' },
          { key: 'power', label: 'Güç', align: 'right' }, { key: 'apparentPower', label: 'Görünen Güç', align: 'right' }, { key: 'powerFactor', label: 'Güç Faktörü', align: 'right' },
          { key: 'activeEnergy', label: 'Aktif Enerji', align: 'right' }, { key: 'frequency', label: 'Frekans', align: 'right' }],
        rows: lim(p.inletRows).map(r => Object.assign({ _tone: r.isTotal ? 'info' : '' }, r))
      });
    }
    if (want('outlet')) {
      total += p.outletRows.length;
      sections.push({
        title: 'Outlet', toneKey: '_tone',
        columns: [{ key: 'outlet', label: 'Outlet' }, { key: 'current', label: 'Akım', align: 'right' }, { key: 'voltage', label: 'Voltaj', align: 'right' },
          { key: 'power', label: 'Güç', align: 'right' }, { key: 'apparentPower', label: 'Görünen Güç', align: 'right' }, { key: 'powerFactor', label: 'Güç Faktörü', align: 'right' },
          { key: 'activeEnergy', label: 'Aktif Enerji', align: 'right' }, { key: 'status', label: 'Durum' }],
        rows: lim(p.outletRows).map(r => Object.assign({ _tone: statusTone(r.badgeStatus) }, r))
      });
    }
    if (want('breaker')) {
      total += p.breakerRows.length;
      sections.push({
        title: 'Devre Kesici', toneKey: '_tone',
        columns: [{ key: 'breaker', label: 'Devre Kesici' }, { key: 'current', label: 'Akım', align: 'right' }, { key: 'ratedCurrent', label: 'Anma Akımı', align: 'right' },
          { key: 'remainingCurrent', label: 'Kalan Akım', align: 'right' }, { key: 'status', label: 'Durum' }],
        rows: lim(p.breakerRows).map(r => Object.assign({ _tone: statusTone(r.badgeStatus) }, r))
      });
    }
    const scopeLabel = (REPORT_SCOPES.find(x => x.id === req.scope) || {}).label || '';
    const shown = sections.reduce((n, sct) => n + sct.rows.length, 0);
    DCIM.report.generate({
      title: 'PDU Detay Raporu',
      subtitle: pduName + ' · ' + scopeLabel + ' · ' + (shown < total ? 'ilk ' + shown + ' / ' + total : total) + ' satır · Kabin ' + (state.selectedCabinetName || '-'),
      filename: ('PDU_' + pduName).replace(/[^\p{L}\p{N}_-]+/gu, '_'),
      kpis: [
        { label: 'Durum', value: p.status, tone: statusTone(p.badgeStatus) || 'normal' },
        { label: 'Marka / model', value: [p.manuf, p.model].filter(v => v && v !== '-').join(' / ') || '-' },
        { label: 'Seri no', value: p.serNo || '-' },
        { label: 'SNMP', value: p.snmpVersion || '-' },
        { label: 'Anma gerilimi', value: p.rtdVolt || '-' },
        { label: 'Anma akımı', value: p.rtdCurr || '-' },
        { label: 'Anma görünür gücü', value: p.rtdVA || '-' },
        { label: 'İnlet / outlet', value: p.inletCount + ' / ' + p.outletCount }
      ],
      sections,
      notes: ['Cihaz ' + p.id + ' · IP ' + (p.ipAddr || '-') + ' · anlık değerler, rapor anındaki okuma.']
    }, req.format);
  }

  const reportHost = document.createElement('div');
  DCIM.report.menu(reportHost, { scopes: REPORT_SCOPES, options: 'limit', unit: 'satır', onExport: exportReport });

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderHeader();
  renderMain();
  loadSidebarCabinets();
  document.addEventListener('dcim:theme', renderMain);
})();
