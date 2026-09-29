/* ==========================================================================
   DCIM Sunum — SDP Kablolama Topolojisi (ConnectivityViewComponent, app-connectivity-view)
   Kaynak: new-ui/pages/energy/connectivity-view/connectivity-view.component.{html,ts,scss}
   Kaynağın çizim yaklaşımı korunur: mutlak konumlu DOM düğüm kartları + SVG bezier hatlar,
   aynı ağaç yerleşimi (calculateTreeSize / assignPositions, NODE 240×80, GAP_X 20, GAP_Y 170),
   grup çerçeveleri, sürükle/yakınlaştır (wheel, ±, Sıfırla), aynı Türkçe etiketler.
   api.CTD_Data (queryCableTopologyDiagramApi, where={src_pan}) → DCIM.data.connectivity.query()
   (gerçek CTD tablosu, js/mock/connectivity.data.js).

   Sunum eklemeleri (kaynakta yok):
   - SDP kökünün üstünde tek hat besleme zinciri: Trafo → ADP (Ana Dağıtım Panosu) → UPS → SDP,
     SDP altında RPP / giriş barası (…G1 / …G2) kademesi → hedef kabin → sigorta → kabin → PDU.
   - Hat renkleri anlık yüke göre (normal #10b981, ≥%80 #f59e0b, ≥%95 veya faz kaybı #f43f5e),
     kesik kırmızı = faz/giriş kaybı, kesik gri = veri yok; hat üzerinde akım etiketi.
   - Kartlarda canlı ölçüm satırı + durum; kapalı düğümlerde alt kademe alarm sayacı.
   - Hover tooltip (akım/gerilim/yük), tıklamada detay penceresi (faz tablosu, çift besleme A/B,
     besleme zinciri, ilgili sayfalara bağlantılar). 4 sn'de bir değerler hafifçe dalgalanır.
   - A / B besleme yolu seçici ve "Hat Olayları" listesi (senaryodaki sorunlu hatlara atlar).

   Derin bağlantılar:
     ?sdp=A5                 → A5 SDP PANOSU seçili açılır (A1..A7, B1..B7)
     ?sdp=A5&open=ups        → düğüm detayını açar (trafo | adp | ups | sdp)
     ?cabinet=1AV42&side=B   → kabini besleyen B yolu SDP'si seçilir, yol açılır, PDU detayı gösterilir
                               (side verilmezse A; örn. ?cabinet=1CB52&side=B)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtNum, fmtTime, statusBadge, button } = DCIM.ui;
  const kit = DCIM.kit;
  const C = DCIM.data.connectivity;
  DCIM.shell.init({ active: 'connectivity' });

  // messages.tr.json → connectivityView.*
  const T = {
    title: 'SDP Kablolama Topolojisi',
    energy: 'Enerji',
    toolbarLoading: 'Yükleniyor...',
    refresh: 'Yenile',
    connections: 'Bağlantılar', connectionsHint: 'Aktif kablo rotaları',
    targetCabinets: 'Hedef Kabin', targetCabinetsHint: 'Bağlanan kabin sayısı',
    sourceFuses: 'SDP Sigorta', sourceFusesHint: 'İzlenen çıkışlar',
    status: 'Sistem Durumu', live: 'CANLI', unknown: 'Bilinmiyor',
    controlTitle: 'Topoloji Kontrolü', selectCabinet: 'Kaynak panoyu seçin',
    subtitle: 'Enerji dağıtım bağlantılarını kaynaktan hedef kabine kadar canlı keşfedin.',
    toolbarSelectCabinet: 'Kabin Seçimi:',
    interactionTitle: 'Etkileşim',
    interactionHint: 'Kartlara tıklayarak bağlantı zincirini açın. Canvas üzerinde sürükleyin, yakınlaştırın veya uzaklaştırın.',
    legendTitle: 'Topoloji Lejantı',
    toolbarReset: 'Sıfırla', zoom: 'Yakınlık',
    noDataTitle: 'Veri Bulunamadı', noDataDesc: 'Seçili kabin için SDP topoloji verisi mevcut değil.',
    nodeSourceLabel: 'KAYNAK SDP PANOSU', nodeSourceSubLabel: c => 'Toplam ' + c + ' Çıkış',
    nodeGroupLabel: 'HEDEF KABİN', nodeGroupSubLabel: c => c + ' Besleme', nodeGroupFrameLabel: n => 'HEDEF KABİN: ' + n,
    nodeFuseLabel: 'SDP SİGORTA', nodeFuseSubLabel: 'Sigorta',
    nodeCabinetLabel: 'KABİN', nodeCabinetSubLabel: 'Rack Kabin',
    nodePduLabel: 'PDU BİLGİSİ'
  };

  // Sabit Kabin Listesi (kaynaktaki cabinets dizisi)
  const CABINETS = [
    'A1 SDP PANOSU', 'A2 SDP PANOSU', 'A3 SDP PANOSU', 'A4 SDP PANOSU',
    'A5 SDP PANOSU', 'A6 SDP PANOSU', 'A7 SDP PANOSU',
    'B1 SDP PANOSU', 'B2 SDP PANOSU', 'B3 SDP PANOSU', 'B4 SDP PANOSU',
    'B5 SDP PANOSU', 'B6 SDP PANOSU', 'B7 SDP PANOSU'
  ];

  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 80;
  const GAP_X = 20;
  const GAP_Y = 170;
  const LIVE_INTERVAL_MS = 4000;
  const DRAG_CLICK_TOLERANCE = 4;

  const state = {
    selectedCabinet: 'A1 SDP PANOSU',
    rawData: [],
    nodes: [],
    lines: [],
    groupFrames: [],
    expandedNodes: new Set(),
    isLoading: false,
    scale: 1,
    pan: { x: 0, y: 0 },
    isDragging: false,
    lastMouse: { x: 0, y: 0 },
    dragDist: 0,
    selectedId: null,
    hoverId: null,
    tick: 0,
    updatedAt: new Date()
  };

  const root = document.getElementById('cv-root');
  const f1 = v => fmtNum(v, 1);
  const f0 = v => fmtNum(v, 0);
  const sdpOf = () => C.sdpCode(state.selectedCabinet);
  const sideOf = () => sdpOf().charAt(0);
  const peerSdp = code => (code.charAt(0) === 'A' ? 'B' : 'A') + code.slice(1);

  // ---------------------------------------------------------------------------
  // Topoloji hesabı (calculateTopology — kaynaktan port, üst besleme zinciri + RPP eklendi)
  // ---------------------------------------------------------------------------
  const rppKeyOf = row => String(row.src_fus || '').split(' - ')[0] || T.unknown;
  const groupKeyOf = row => (row.tgt_cab || T.unknown).split(' ')[0];

  // RPP → { gKey: rows } (kaynaktaki groups sözlüğü, RPP başına)
  function groupsOfRpp(rppKey) {
    const groups = {};
    state.rawData.forEach(row => {
      if (rppKeyOf(row) !== rppKey) return;
      const gKey = rppKey + '~' + groupKeyOf(row);
      if (!groups[gKey]) groups[gKey] = [];
      groups[gKey].push(row);
    });
    return groups;
  }
  function rppKeys() {
    const keys = [];
    state.rawData.forEach(row => { const k = rppKeyOf(row); if (keys.indexOf(k) < 0) keys.push(k); });
    return keys.sort();
  }

  function calculateTopology() {
    if (!state.selectedCabinet) return;
    const sdp = sdpOf();
    const up = C.upstreamOf(sdp);
    const tempNodes = [];
    const mk = o => Object.assign({ width: NODE_WIDTH, height: NODE_HEIGHT, isLeaf: false }, o);

    // Üst besleme zinciri (sunum eklemesi)
    tempNodes.push(mk({ id: 'trafo', type: 'trafo', typeLabel: 'TRAFO (AG ÇIKIŞI)', label: up.trafo.replace(/_/g, ' ').replace('TRAFO', 'TRAFO '), subLabel: C.rated.trafo + ' kVA · 34,5/0,4 kV', parentId: null, level: 0, isLeaf: true, ref: { kind: 'trafo', id: up.trafo } }));
    tempNodes.push(mk({ id: 'adp', type: 'adp', typeLabel: 'ANA DAĞITIM PANOSU (ADP)', label: up.adp, subLabel: up.side + ' Yolu · ' + up.ups.length + ' UPS besleme', parentId: 'trafo', level: 0, isLeaf: true, ref: { kind: 'adp', id: up.adp } }));
    tempNodes.push(mk({ id: 'ups', type: 'ups', typeLabel: 'UPS', label: 'UPS ' + sdp, subLabel: '', parentId: 'adp', level: 0, isLeaf: true, ref: { kind: 'ups', code: sdp } }));

    const rootId = 'root';
    tempNodes.push(mk({
      id: rootId, type: 'source', typeLabel: T.nodeSourceLabel, label: state.selectedCabinet,
      subLabel: T.nodeSourceSubLabel(state.rawData.length), parentId: 'ups', level: 0, ref: { kind: 'sdp', code: sdp }
    }));

    const allGroups = {};
    rppKeys().forEach(rppKey => {
      const rppId = 'rpp-' + rppKey;
      const gir = parseInt((rppKey.match(/G(\d)$/) || [])[1] || '1', 10);
      const groups = groupsOfRpp(rppKey);
      const count = Object.keys(groups).reduce((s, k) => s + groups[k].length, 0);
      tempNodes.push(mk({
        id: rppId, type: 'rpp', typeLabel: 'RPP / GİRİŞ BARASI', label: rppKey, subLabel: 'Giriş ' + gir + ' · ' + count + ' çıkış · ' + C.rated.rpp + ' A',
        parentId: rootId, level: 1, rppKey, ref: { kind: 'rpp', code: sdp, gir, rppKey }
      }));
      if (!state.expandedNodes.has(rppId)) return;

      Object.keys(groups).forEach(gKey => {
        const groupRows = groups[gKey];
        allGroups[gKey] = groupRows;
        const groupKey = gKey.split('~')[1];
        const groupId = 'group-' + gKey;
        const isGroupExpanded = state.expandedNodes.has(groupId);

        if (!isGroupExpanded) {
          tempNodes.push(mk({
            id: groupId, type: 'group', typeLabel: T.nodeGroupLabel, label: groupKey,
            subLabel: T.nodeGroupSubLabel(groupRows.length), parentId: rppId, level: 2,
            owningGroupId: groupId, owningGroupLabel: T.nodeGroupFrameLabel(groupKey), gKey, ref: { kind: 'group', rows: groupRows, code: groupKey }
          }));
        } else {
          groupRows.forEach((row, idx) => {
            const sigortaId = 'sigorta-' + gKey + '-' + idx;
            const kabinId = 'kabin-' + gKey + '-' + idx;
            const pduId = 'pdu-' + gKey + '-' + idx;
            const phase = C.circuit(row, 0).phase;
            tempNodes.push(mk({
              id: sigortaId, type: 'patch', typeLabel: T.nodeFuseLabel, label: row.src_fus,
              subLabel: T.nodeFuseSubLabel + ' · ' + phase + ' · C' + C.circuit(row, 0).rating, parentId: rppId, level: 2,
              owningGroupId: groupId, owningGroupLabel: T.nodeGroupFrameLabel(groupKey), ref: { kind: 'circuit', row }
            }));
            if (state.expandedNodes.has(sigortaId)) {
              tempNodes.push(mk({
                id: kabinId, type: 'cabinet', typeLabel: T.nodeCabinetLabel, label: row.tgt_cab,
                subLabel: T.nodeCabinetSubLabel, parentId: sigortaId, level: 3, owningGroupId: groupId, ref: { kind: 'cabinet', row }
              }));
              if (state.expandedNodes.has(kabinId)) {
                tempNodes.push(mk({
                  id: pduId, type: 'target', typeLabel: T.nodePduLabel, label: row.tgt_pdu,
                  subLabel: row.wrk_per || '', parentId: kabinId, level: 4, isLeaf: true, owningGroupId: groupId, ref: { kind: 'pdu', row }
                }));
              }
            }
          });
        }
      });
    });

    const nodeMap = {};
    tempNodes.forEach(n => { n.children = []; nodeMap[n.id] = n; });
    tempNodes.forEach(n => { if (n.parentId && nodeMap[n.parentId]) nodeMap[n.parentId].children.push(n); });

    const top = nodeMap.trafo;
    if (top) {
      calculateTreeSize(top);
      assignPositions(top, 2500, 50);
    }

    state.nodes = tempNodes;
    calculateLines();
    calculateGroupFrames(tempNodes, allGroups);
    if (state.selectedId && !nodeMap[state.selectedId]) state.selectedId = null;
  }

  // onNodeClick (kaynak) — düğüm seçimi (detay penceresi) sunum eklemesi
  function onNodeClick(node) {
    state.selectedId = node.id;
    if (node.id === 'root') {
      state.expandedNodes.clear();
      state.expandedNodes.add('root');
      calculateTopology();
      state.selectedId = 'root';
      renderCanvas();
      return;
    }
    if (node.isLeaf) { renderCanvas(); return; }

    const isExpanding = !state.expandedNodes.has(node.id);
    if (isExpanding) {
      state.expandedNodes.add(node.id);
      if (node.type === 'group') {
        (node.ref.rows || []).forEach((row, idx) => {
          state.expandedNodes.add('sigorta-' + node.gKey + '-' + idx);
          state.expandedNodes.add('kabin-' + node.gKey + '-' + idx);
        });
      }
    } else {
      state.expandedNodes.delete(node.id);
      if (node.type === 'group') {
        (node.ref.rows || []).forEach((row, idx) => {
          state.expandedNodes.delete('sigorta-' + node.gKey + '-' + idx);
          state.expandedNodes.delete('kabin-' + node.gKey + '-' + idx);
          state.expandedNodes.delete('pdu-' + node.gKey + '-' + idx);
        });
      }
    }
    calculateTopology();
    // Grup açılınca ilk sigorta seçili kalsın (grup düğümü kaybolur)
    if (!state.nodes.some(n => n.id === state.selectedId)) state.selectedId = null;
    renderCanvas();
  }

  function toggleGroupFrame(groupId) {
    state.expandedNodes.delete(groupId);
    const groupKey = groupId.replace('group-', '');
    Array.from(state.expandedNodes).forEach(id => {
      if (id.indexOf('-' + groupKey + '-') >= 0) state.expandedNodes.delete(id);
    });
    calculateTopology();
    renderCanvas();
  }

  function calculateTreeSize(node) {
    if (!node.children || node.children.length === 0) {
      node.treeWidth = node.width;
      return node.treeWidth;
    }
    let totalW = 0;
    let lastGroupId;
    node.children.forEach((child, i) => {
      const childW = calculateTreeSize(child);
      if (i > 0) {
        let gap = GAP_X;
        if (child.owningGroupId && child.owningGroupId !== lastGroupId) gap += 40;
        totalW += gap;
      }
      totalW += childW;
      lastGroupId = child.owningGroupId;
    });
    node.treeWidth = Math.max(node.width, totalW);
    return node.treeWidth;
  }

  function assignPositions(node, centerX, y) {
    node.x = centerX - node.width / 2;
    node.y = y;
    if (!node.children || node.children.length === 0) return;
    let currentX = centerX - node.treeWidth / 2;
    let lastGroupId;
    node.children.forEach((child, i) => {
      if (i > 0) {
        let gap = GAP_X;
        if (child.owningGroupId && child.owningGroupId !== lastGroupId) gap += 40;
        currentX += gap;
      }
      const childCenter = currentX + child.treeWidth / 2;
      assignPositions(child, childCenter, y + GAP_Y);
      currentX += child.treeWidth;
      lastGroupId = child.owningGroupId;
    });
  }

  function calculateLines() {
    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    state.lines = state.nodes.filter(n => n.parentId).map(node => {
      const parent = byId[node.parentId];
      if (!parent || node.x === undefined || parent.x === undefined) return null;
      const x1 = parent.x + parent.width / 2;
      const y1 = parent.y + parent.height;
      const x2 = node.x + node.width / 2;
      const y2 = node.y;
      const c1y = y1 + (y2 - y1) / 2;
      const c2y = y2 - (y2 - y1) / 2;
      return { id: parent.id + '-' + node.id, childId: node.id, d: 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + c1y + ', ' + x2 + ' ' + c2y + ', ' + x2 + ' ' + y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
    }).filter(Boolean);
  }

  function calculateGroupFrames(nodes, groupCounts) {
    const frames = {};
    const nodesByGroup = {};
    nodes.forEach(node => {
      if (node.owningGroupId && node.x !== undefined && node.y !== undefined) {
        (nodesByGroup[node.owningGroupId] = nodesByGroup[node.owningGroupId] || []).push(node);
      }
    });
    Object.keys(nodesByGroup).forEach(groupId => {
      if (!state.expandedNodes.has(groupId)) return;
      const groupNodes = nodesByGroup[groupId];
      const gKey = groupId.replace('group-', '');
      const totalInCsv = (groupCounts[gKey] || []).length;
      if (totalInCsv > 1) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        groupNodes.forEach(n => {
          minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
          maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height);
        });
        frames[groupId] = { id: groupId, label: groupNodes[0].owningGroupLabel || groupId, x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
    });
    const PADDING = 30;
    state.groupFrames = Object.keys(frames).map(k => {
      const f = frames[k];
      return { id: f.id, label: f.label, x: f.x - PADDING, y: f.y - PADDING - 15, w: f.w + PADDING * 2, h: f.h + PADDING * 2 + 15 };
    });
  }

  function getNodeClass(type) {
    return { source: 'node-source', group: 'node-group', patch: 'node-patch', cabinet: 'node-cabinet', target: 'node-target', trafo: 'node-trafo', adp: 'node-adp', ups: 'node-ups', rpp: 'node-rpp' }[type] || '';
  }
  function getNodeIcon(type) {
    return { source: 'pi pi-bolt', group: 'pi pi-sitemap', patch: 'pi pi-sliders-h', cabinet: 'pi pi-server', target: 'pi pi-box', trafo: 'pi pi-sun', adp: 'pi pi-th-large', ups: 'pi pi-database', rpp: 'pi pi-share-alt' }[type] || 'pi pi-circle';
  }

  const targetCount = () => new Set(state.rawData.map(r => r.tgt_cab).filter(Boolean)).size;
  const fuseCount = () => new Set(state.rawData.map(r => r.src_fus).filter(Boolean)).size;

  // ---------------------------------------------------------------------------
  // Canlı ölçümler (sunum eklemesi)
  // ---------------------------------------------------------------------------
  function measure(node) {
    const r = node.ref || {};
    const t = state.tick;
    switch (r.kind) {
      case 'trafo': return C.trafo(r.id, t);
      case 'adp': return C.adp(r.id, t);
      case 'ups': return C.ups(r.code, t);
      case 'sdp': return C.sdp(r.code, t);
      case 'rpp': return C.rpp(r.code, r.gir, t);
      case 'circuit': case 'cabinet': return C.circuit(r.row, t);
      case 'pdu': return C.pdu(C.cabCode(r.row.tgt_cab), r.row.tgt_pdu, t);
      case 'group': {
        const cs = r.rows.map(row => C.circuit(row, t));
        const live = cs.filter(c => !c.lost);
        const I = cs.reduce((s, c) => s + c.Iavg, 0);
        const load = cs.reduce((m, c) => Math.max(m, c.load), 0);
        const status = C.worst(cs.map(c => c.status));
        const lost = cs.some(c => c.lost);
        return {
          kind: 'group', circuits: cs, I: cs.map(c => c.Iavg), V: cs.map(c => c.Vavg), Iavg: I, Imax: cs.reduce((m, c) => Math.max(m, c.Iavg), 0),
          Vavg: live.length ? live.reduce((s, c) => s + c.Vavg, 0) / live.length : 0, P: cs.reduce((s, c) => s + c.P, 0),
          load, status, lost, reason: lost ? 'Faz kaybı' : (cs.find(c => c.status === status) || {}).reason || 'Normal',
          note: (cs.find(c => c.note) || {}).note || '', rating: cs.length ? cs[0].rating : 0
        };
      }
      default: return null;
    }
  }

  function lineClassOf(node, m) {
    if (!m) return 'ln-normal';
    if (node.type === 'ups') {
      const s = m.input.status;
      return m.input.lost ? 'ln-lost' : s === 'unknown' ? 'ln-unknown' : 'ln-' + s;
    }
    if ((node.type === 'patch' || node.type === 'cabinet') && m.lost) return 'ln-lost';
    if (m.status === 'lost' || m.status === 'unknown') return 'ln-unknown';
    return 'ln-' + m.status;
  }
  function lineTagOf(node, m) {
    if (!m) return '';
    if (node.type === 'ups') return m.input.lost ? 'GİRİŞ YOK' : m.lostCom ? '—' : f0(m.inputI.reduce((a, b) => a + b, 0) / 3) + ' A';
    if (m.lost && (node.type === 'patch' || node.type === 'cabinet')) return '0 A';
    return ['patch', 'cabinet', 'target', 'group'].indexOf(node.type) >= 0 ? f1(m.Iavg) + ' A' : f0(m.Iavg) + ' A';
  }
  function metricsText(node, m) {
    if (!m) return '';
    switch (node.type) {
      case 'ups':
        if (m.lostCom) return 'VERİ YOK · SNMP kaybı';
        if (m.battery) return 'AKÜ · %' + f0(m.batteryPct || 0) + ' · ' + f0(m.batteryMin || 0) + ' dk';
        return f1(m.Iavg) + ' A · ' + f1(m.P) + ' kW · %' + f0(m.load);
      case 'trafo': return f0(m.Iavg) + ' A · ' + f0(m.S) + ' kVA · %' + f0(m.load);
      case 'adp': case 'source': case 'rpp': return f1(m.Iavg) + ' A · ' + f0(m.Vavg) + ' V · %' + f0(m.load);
      case 'group': case 'target':
        if (m.lost) return 'FAZ KAYBI · ' + f1(m.Iavg) + ' A · %' + f0(m.load);
        return f1(m.Iavg) + ' A · ' + f1(m.P) + ' kW · %' + f0(m.load);
      default:
        if (m.lost) return 'FAZ KAYBI · 0 A · 0 V';
        return f1(m.Iavg) + ' A · ' + f0(m.Vavg) + ' V · %' + f0(m.load);
    }
  }
  function statusLabel(m) {
    if (!m) return 'Normal';
    if (m.kind === 'ups') return m.lostCom ? 'Veri Alınamıyor' : m.battery ? 'Akü Modu' : m.status === 'normal' ? 'Normal' : m.status === 'warning' ? 'Uyarı' : 'Alarm';
    if (m.lost) return 'Faz Kaybı';
    return m.status === 'alarm' ? 'Aşırı Yük' : m.status === 'warning' ? 'Yüksek Yük' : 'Normal';
  }
  const nodeStatus = m => (m ? m.status : 'normal');

  // Kapalı düğümlerin alt kademesindeki sorunlu devre sayısı
  function subtreeRows(node) {
    if (node.type === 'source') return state.rawData;
    if (node.type === 'rpp') return state.rawData.filter(r => rppKeyOf(r) === node.rppKey);
    if (node.type === 'group') return node.ref.rows;
    return null;
  }
  function flagOf(node) {
    if (state.expandedNodes.has(node.id) && node.type !== 'group') return null;
    const rows = subtreeRows(node);
    if (!rows) return null;
    let alarm = 0, warn = 0;
    rows.forEach(r => { const s = C.circuit(r, state.tick).status; if (s === 'alarm') alarm++; else if (s === 'warning') warn++; });
    if (alarm) return { cls: 'flag-alarm', text: alarm + ' ALARM' };
    if (warn) return { cls: 'flag-warning', text: warn + ' UYARI' };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Veri (refreshData — kaynaktan port)
  // ---------------------------------------------------------------------------
  function loadData() {
    state.rawData = C.query({ src_pan: state.selectedCabinet }).map(item => ({
      id: item.id, flr: item.flr, hal: item.hal, src_pan: item.src_pan, src_fus: item.src_fus,
      tgt_cab: item.tgt_cab, tgt_pdu: item.tgt_pdu, wrk_dat: item.wrk_dat, wrk_per: item.wrk_per
    }));
    state.expandedNodes.clear();
    state.expandedNodes.add('root');
    state.selectedId = null;
    calculateTopology();
  }
  function refreshData() {
    if (!state.selectedCabinet) return;
    state.isLoading = true;
    renderHeader();
    setTimeout(() => {
      loadData();
      state.isLoading = false;
      state.updatedAt = new Date();
      renderHeader();
      renderMetrics();
      renderAside();
      renderCanvas();
      resetView();
    }, 350);
  }
  function onCabinetChange(v) {
    state.selectedCabinet = v;
    refreshData();
  }

  // Kabine odaklan: side yolundaki SDP'yi seç, RPP + grubu aç, PDU'yu seç
  function focusCabinet(code, side, preferRow) {
    const feeds = C.feedsOf(code)[side] || [];
    if (!feeds.length) { DCIM.ui.toast(code + ' için ' + side + ' yolu beslemesi bulunamadı.', 'warning', T.title); return false; }
    const row = preferRow && feeds.some(r => r.id === preferRow.id) ? preferRow
      : feeds.slice().sort((a, b) => C.rank[C.circuit(b, 0).status] - C.rank[C.circuit(a, 0).status])[0];
    state.selectedCabinet = row.src_pan;
    loadData();
    const rppKey = rppKeyOf(row);
    const gKey = rppKey + '~' + groupKeyOf(row);
    const groupRows = groupsOfRpp(rppKey)[gKey] || [];
    state.expandedNodes.add('rpp-' + rppKey);
    state.expandedNodes.add('group-' + gKey);
    groupRows.forEach((r, idx) => {
      state.expandedNodes.add('sigorta-' + gKey + '-' + idx);
      state.expandedNodes.add('kabin-' + gKey + '-' + idx);
    });
    calculateTopology();
    const idx = groupRows.findIndex(r => r.id === row.id);
    state.selectedId = 'pdu-' + gKey + '-' + Math.max(0, idx);
    renderAll();
    centerOn(state.selectedId);
    return true;
  }
  function selectSdp(code, openId) {
    state.selectedCabinet = code + ' SDP PANOSU';
    loadData();
    if (openId) state.selectedId = openId;
    renderAll();
    resetView();
  }
  function switchSide(side) {
    if (side === sideOf()) return;
    const sel = state.nodes.find(n => n.id === state.selectedId);
    const row = sel && sel.ref && sel.ref.row;
    const code = row ? C.cabCode(row.tgt_cab) : sel && sel.type === 'group' ? sel.ref.code : null;
    if (code && focusCabinet(code, side)) return;
    selectSdp(side + sdpOf().slice(1), state.selectedId && ['trafo', 'adp', 'ups', 'root'].indexOf(state.selectedId) >= 0 ? state.selectedId : null);
  }

  // ---------------------------------------------------------------------------
  // Görünüm (zoom / pan — kaynaktan port)
  // ---------------------------------------------------------------------------
  let canvasEl = null, layerEl = null;
  function applyTransform() {
    if (layerEl) layerEl.style.transform = 'translate(' + state.pan.x + 'px, ' + state.pan.y + 'px) scale(' + state.scale + ')';
    const pill = root.querySelector('[data-zoom-pill]');
    if (pill) pill.textContent = T.zoom + ' ' + (state.scale * 100).toFixed(0) + '%';
  }
  function resetView() {
    const container = canvasEl;
    const positioned = state.nodes.filter(n => n.x !== undefined && n.y !== undefined);
    if (!container || positioned.length === 0) {
      state.scale = 1; state.pan = { x: 0, y: 0 }; applyTransform(); return;
    }
    const minX = Math.min.apply(null, positioned.map(n => n.x));
    const minY = Math.min.apply(null, positioned.map(n => n.y));
    const maxX = Math.max.apply(null, positioned.map(n => n.x + n.width));
    const maxY = Math.max.apply(null, positioned.map(n => n.y + n.height));
    const contentWidth = Math.max(maxX - minX, NODE_WIDTH);
    const contentHeight = Math.max(maxY - minY, NODE_HEIGHT);
    const padding = 72;
    const fitScale = Math.min((container.clientWidth - padding * 2) / contentWidth, (container.clientHeight - padding * 2) / contentHeight);
    state.scale = Math.min(1.15, Math.max(0.2, fitScale));
    state.pan = {
      x: (container.clientWidth - contentWidth * state.scale) / 2 - minX * state.scale,
      y: (container.clientHeight - contentHeight * state.scale) / 2 - minY * state.scale
    };
    applyTransform();
  }
  function zoomTo(nextScale, focusX, focusY) {
    const clamped = Math.min(2.5, Math.max(0.2, nextScale));
    const ratio = clamped / state.scale;
    state.pan = { x: focusX - (focusX - state.pan.x) * ratio, y: focusY - (focusY - state.pan.y) * ratio };
    state.scale = clamped;
    applyTransform();
  }
  const zoomIn = () => zoomTo(state.scale * 1.18, canvasEl ? canvasEl.clientWidth / 2 : 0, canvasEl ? canvasEl.clientHeight / 2 : 0);
  const zoomOut = () => zoomTo(state.scale * 0.85, canvasEl ? canvasEl.clientWidth / 2 : 0, canvasEl ? canvasEl.clientHeight / 2 : 0);
  // Düğümü görünür alanın ortasına al (detay penceresi açıksa solundaki alana)
  function centerOn(id) {
    const n = state.nodes.find(x => x.id === id);
    if (!n || !canvasEl) return resetView();
    state.scale = 0.85;
    const detailW = state.selectedId ? Math.min(340, canvasEl.clientWidth * 0.45) : 0;
    const cw = canvasEl.clientWidth - detailW;
    state.pan = { x: cw / 2 - (n.x + n.width / 2) * state.scale, y: canvasEl.clientHeight * 0.7 - (n.y + n.height / 2) * state.scale };
    applyTransform();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  function renderShell() {
    root.innerHTML =
      '<div class="shrink-0" data-header></div>' +
      '<div class="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2" data-metrics></div>' +
      '<div class="flex flex-1 min-h-0 flex-col xl:flex-row gap-2">' +
        '<aside class="shrink-0 xl:w-64 2xl:w-72 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3 flex flex-col gap-3 overflow-y-auto" data-aside></aside>' +
        '<div class="canvas-wrapper flex-1 min-h-[360px]" data-canvas>' +
          '<div class="canvas-topbar">' +
            '<div class="flex items-center gap-2 min-w-0">' +
              '<span class="canvas-live"><span class="status-dot"></span>' + esc(T.live) + '</span>' +
              '<span class="text-[10px] text-slate-500 dark:text-slate-400 truncate" data-topbar-sel></span>' +
            '</div>' +
            '<span class="zoom-pill" data-zoom-pill></span>' +
          '</div>' +
          '<div data-empty></div>' +
          '<div class="drawing-layer" data-layer></div>' +
          '<div class="cv-tooltip hidden" data-tooltip></div>' +
          '<div data-detail-host></div>' +
        '</div>' +
      '</div>';
    canvasEl = root.querySelector('[data-canvas]');
    layerEl = root.querySelector('[data-layer]');
  }

  function renderHeader() {
    const actions = '<div class="flex items-center gap-2">' +
      (state.isLoading ? '<span class="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-brand-600 dark:text-brand-400"><i class="pi pi-spin pi-spinner"></i>' + esc(T.toolbarLoading) + '</span>' : '') +
      button({ variant: 'secondary', icon: 'pi pi-refresh', label: T.refresh, attrs: 'data-act="refresh"' }) +
    '</div>';
    root.querySelector('[data-header]').innerHTML = kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.energy }, { label: T.title }], actions });
  }

  function renderMetrics() {
    root.querySelector('[data-metrics]').innerHTML =
      '<div class="metric-card"><div class="metric-label"><i class="pi pi-bolt"></i>' + esc(T.connections) + '</div><div class="metric-value">' + state.rawData.length + '</div><div class="metric-hint">' + esc(T.connectionsHint) + '</div></div>' +
      '<div class="metric-card metric-card-brand"><div class="metric-label"><i class="pi pi-server"></i>' + esc(T.targetCabinets) + '</div><div class="metric-value">' + targetCount() + '</div><div class="metric-hint">' + esc(T.targetCabinetsHint) + '</div></div>' +
      '<div class="metric-card"><div class="metric-label"><i class="pi pi-sliders-h"></i>' + esc(T.sourceFuses) + '</div><div class="metric-value">' + fuseCount() + '</div><div class="metric-hint">' + esc(T.sourceFusesHint) + '</div></div>' +
      '<div class="metric-card metric-card-status"><div class="metric-label"><span class="status-dot"></span>' + esc(T.status) + '</div><div class="metric-value text-emerald-600 dark:text-emerald-400">' + esc(T.live) + '</div><div class="metric-hint">' + esc(state.selectedCabinet || T.unknown) + '</div></div>';
  }

  const EVENTS = C.abnormal(0);
  function eventHtml(ev) {
    const cls = ev.status === 'alarm' ? 'ev-alarm' : ev.status === 'warning' ? 'ev-warning' : 'ev-lost';
    const icon = ev.status === 'alarm' ? 'pi pi-exclamation-circle text-rose-500' : ev.status === 'warning' ? 'pi pi-exclamation-triangle text-amber-500' : 'pi pi-wifi text-slate-400';
    let title, sub;
    if (ev.kind === 'ups') {
      title = 'UPS ' + ev.code;
      sub = ev.battery ? 'Akü modunda · ADP girişi yok' : ev.status === 'lost' || /%/.test(ev.reason) ? ev.reason : ev.reason + ' · yük %' + f0(ev.load);
    } else {
      title = ev.code + ' · ' + ev.pdu + ' ' + ev.phase;
      sub = (ev.reason === 'Faz kaybı' ? 'Faz kaybı · 0 V' : ev.reason + ' · %' + f0(ev.load)) + ' · ' + ev.sdp + ' SDP';
    }
    return '<button type="button" class="cv-event ' + cls + '" data-act="event" data-ev="' + EVENTS.indexOf(ev) + '">' +
      '<i class="' + icon + ' text-[11px] mt-0.5"></i><span class="min-w-0"><span class="block text-[10px] font-black text-slate-800 dark:text-slate-100 truncate">' + esc(title) + '</span>' +
      '<span class="block text-[9px] text-slate-500 dark:text-slate-400 truncate">' + esc(sub) + '</span></span></button>';
  }

  function renderAside() {
    const side = sideOf();
    const peer = peerSdp(sdpOf());
    root.querySelector('[data-aside]').innerHTML =
      '<div>' +
        '<div class="section-kicker"><i class="pi pi-sliders-h"></i>' + esc(T.controlTitle) + '</div>' +
        '<h2 class="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">' + esc(T.selectCabinet) + '</h2>' +
        '<p class="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">' + esc(T.subtitle) + '</p>' +
      '</div>' +
      '<label class="flex flex-col gap-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">' + esc(T.toolbarSelectCabinet) +
        '<select class="scada-select w-full h-8 text-xs" data-act="cabinet">' +
          CABINETS.map(cab => '<option value="' + esc(cab) + '"' + (cab === state.selectedCabinet ? ' selected' : '') + '>' + esc(cab) + '</option>').join('') +
        '</select>' +
      '</label>' +
      // Besleme yolu (sunum eklemesi)
      '<div class="flex flex-col gap-1">' +
        '<span class="text-[10px] font-bold text-slate-600 dark:text-slate-300">Besleme Yolu (Çift Besleme)</span>' +
        '<div class="grid grid-cols-2 gap-1.5">' +
          ['A', 'B'].map(s => '<button type="button" class="canvas-control' + (s === side ? ' is-active' : '') + '" data-act="side" data-side="' + s + '"><i class="pi pi-bolt mr-1"></i>' + s + ' Yolu</button>').join('') +
        '</div>' +
        '<span class="text-[9px] text-slate-500 dark:text-slate-400">Karşı besleme: ' + esc(peer) + ' SDP PANOSU · UPS ' + esc(peer) + '</span>' +
      '</div>' +
      '<div class="rounded-[2px] border border-brand-500/20 bg-brand-500/5 p-2.5">' +
        '<div class="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-brand-700 dark:text-brand-300"><i class="pi pi-info-circle"></i>' + esc(T.interactionTitle) + '</div>' +
        '<p class="mt-1.5 text-[10px] leading-relaxed text-slate-600 dark:text-slate-300">' + esc(T.interactionHint) + '</p>' +
      '</div>' +
      // Hat olayları (sunum eklemesi)
      '<div class="border-t border-slate-200 dark:border-border-subtle pt-3">' +
        '<div class="section-kicker mb-2"><i class="pi pi-exclamation-triangle"></i>Hat Olayları<span class="ml-auto text-slate-400">' + EVENTS.length + '</span></div>' +
        '<div class="space-y-1.5">' + EVENTS.map(eventHtml).join('') + '</div>' +
      '</div>' +
      '<div class="border-t border-slate-200 dark:border-border-subtle pt-3">' +
        '<div class="section-kicker mb-2"><i class="pi pi-palette"></i>' + esc(T.legendTitle) + '</div>' +
        '<div class="space-y-1.5">' +
          '<div class="legend-item"><span class="legend-swatch trafo"></span>Trafo</div>' +
          '<div class="legend-item"><span class="legend-swatch adp"></span>Ana Dağıtım Panosu (ADP)</div>' +
          '<div class="legend-item"><span class="legend-swatch ups"></span>UPS</div>' +
          '<div class="legend-item"><span class="legend-swatch source"></span>' + esc(T.nodeSourceLabel) + '</div>' +
          '<div class="legend-item"><span class="legend-swatch rpp"></span>RPP / Giriş Barası</div>' +
          '<div class="legend-item"><span class="legend-swatch patch"></span>' + esc(T.nodeFuseLabel) + '</div>' +
          '<div class="legend-item"><span class="legend-swatch cabinet"></span>' + esc(T.nodeCabinetLabel) + '</div>' +
          '<div class="legend-item"><span class="legend-swatch target"></span>' + esc(T.nodePduLabel) + '</div>' +
        '</div>' +
        '<div class="space-y-1.5 mt-2.5 pt-2.5 border-t border-dashed border-slate-200 dark:border-border-subtle">' +
          '<div class="legend-item"><span class="legend-line"></span>Normal yük (&lt; %' + C.thresholds.warn + ')</div>' +
          '<div class="legend-item"><span class="legend-line ln-warning"></span>Yüksek yük (≥ %' + C.thresholds.warn + ')</div>' +
          '<div class="legend-item"><span class="legend-line ln-alarm"></span>Aşırı yük (≥ %' + C.thresholds.crit + ')</div>' +
          '<div class="legend-item"><span class="legend-line ln-lost"></span>Faz / giriş kaybı</div>' +
          '<div class="legend-item"><span class="legend-line ln-unknown"></span>Veri alınamıyor</div>' +
        '</div>' +
      '</div>' +
      '<div class="mt-auto grid grid-cols-2 gap-1.5 text-center">' +
        '<button type="button" class="canvas-control" data-act="zoom-out"><i class="pi pi-minus"></i></button>' +
        '<button type="button" class="canvas-control" data-act="zoom-in"><i class="pi pi-plus"></i></button>' +
        '<button type="button" class="canvas-control col-span-2" data-act="reset"><i class="pi pi-refresh mr-1"></i>' + esc(T.toolbarReset) + '</button>' +
      '</div>';
  }

  function nodeHtml(node) {
    const m = measure(node);
    const st = nodeStatus(m);
    const flag = flagOf(node);
    if (node.type === 'ups' && m) node.subLabel = m.mode === 'AKÜ' ? 'AKÜ MODU · ' + f0(m.batteryMin || 0) + ' dk kaldı' : m.lostCom ? 'SNMP haberleşme kaybı' : m.mode + ' · ' + m.ratedKw + ' kW';
    return '<button type="button" class="node-card ' + getNodeClass(node.type) + ' st-' + st +
        (state.expandedNodes.has(node.id) ? ' expanded' : '') + (state.selectedId === node.id ? ' node-selected' : '') +
        '" style="left:' + node.x + 'px;top:' + node.y + 'px" data-node="' + esc(node.id) + '">' +
      (flag ? '<span class="node-flag ' + flag.cls + '" data-flag>' + esc(flag.text) + '</span>' : '') +
      '<span class="node-icon"><i class="' + getNodeIcon(node.type) + '"></i></span>' +
      '<span class="node-content">' +
        '<span class="node-type">' + esc(node.typeLabel) + '</span>' +
        '<span class="node-title" title="' + esc(node.label) + '">' + esc(node.label) + '</span>' +
        '<span class="node-subtitle">' + esc(node.subLabel || '') + '</span>' +
        '<span class="node-metrics"><span class="nm-dot"></span><span class="nm-text" data-metrics-text>' + esc(metricsText(node, m)) + '</span></span>' +
      '</span>' +
      (!node.isLeaf ? '<i class="node-action ' + (state.expandedNodes.has(node.id) ? 'pi pi-chevron-up' : 'pi pi-chevron-down') + '"></i>' : '') +
    '</button>';
  }

  function renderCanvas() {
    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    root.querySelector('[data-topbar-sel]').textContent = state.selectedCabinet + ' · ' + sideOf() + ' Yolu';
    root.querySelector('[data-empty]').innerHTML = !state.isLoading && state.rawData.length === 0
      ? '<div class="empty-state"><div class="empty-icon"><i class="pi pi-sitemap"></i></div><h3>' + esc(T.noDataTitle) + '</h3><p>' + esc(T.noDataDesc) + '</p></div>'
      : '';
    const lines = state.lines.map(line => {
      const child = byId[line.childId];
      const m = child ? measure(child) : null;
      const cls = lineClassOf(child, m);
      return '<g data-line="' + esc(line.childId) + '">' +
        '<path d="' + line.d + '" class="line-bg ' + cls + '" />' +
        '<path d="' + line.d + '" class="line-fg ' + cls + '" />' +
        '<text class="line-tag ' + cls + '" x="' + (line.mx + 8) + '" y="' + (line.my + 4) + '">' + esc(lineTagOf(child, m)) + '</text>' +
      '</g>';
    }).join('');
    layerEl.innerHTML =
      '<svg class="lines-svg">' + lines + '</svg>' +
      state.groupFrames.map(frame =>
        '<div class="group-frame" style="left:' + frame.x + 'px;top:' + frame.y + 'px;width:' + frame.w + 'px;height:' + frame.h + 'px">' +
          '<button type="button" class="frame-label" data-act="frame" data-frame="' + esc(frame.id) + '"><i class="pi pi-sitemap"></i><span>' + esc(frame.label) + '</span><i class="pi pi-chevron-up"></i></button>' +
        '</div>').join('') +
      state.nodes.map(nodeHtml).join('');
    applyTransform();
    renderDetail();
  }

  // Canlı güncelleme: yerleşimi bozmadan metin/sınıf güncellemesi
  function updateLive() {
    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    layerEl.querySelectorAll('[data-node]').forEach(el => {
      const node = byId[el.getAttribute('data-node')];
      if (!node) return;
      const m = measure(node);
      el.className = el.className.replace(/\bst-\w+/, 'st-' + nodeStatus(m));
      const t = el.querySelector('[data-metrics-text]');
      if (t) t.textContent = metricsText(node, m);
    });
    layerEl.querySelectorAll('[data-line]').forEach(g => {
      const node = byId[g.getAttribute('data-line')];
      if (!node) return;
      const m = measure(node);
      const cls = lineClassOf(node, m);
      g.querySelectorAll('path, text').forEach(p => { p.setAttribute('class', p.getAttribute('class').replace(/\bln-\w+/, cls)); });
      const tag = g.querySelector('text');
      if (tag) tag.textContent = lineTagOf(node, m);
    });
    renderDetail(true);
    if (state.hoverId) showTooltip(state.hoverId, null);
  }

  // ---------------------------------------------------------------------------
  // Tooltip + detay penceresi (sunum eklemesi)
  // ---------------------------------------------------------------------------
  const tooltipEl = () => root.querySelector('[data-tooltip]');
  function tipRow(label, value, cls) {
    return '<div class="flex items-center justify-between gap-3"><span class="text-slate-500 dark:text-slate-400">' + esc(label) + '</span><span class="cv-num font-bold ' + (cls || '') + '">' + esc(value) + '</span></div>';
  }
  const statusText = s => (s === 'alarm' ? 'text-rose-500' : s === 'warning' ? 'text-amber-500' : s === 'normal' ? 'text-emerald-500' : 'text-slate-400');

  function showTooltip(id, evt) {
    const el = tooltipEl();
    const node = state.nodes.find(n => n.id === id);
    if (!node || !el) return;
    const m = measure(node);
    if (!m) return;
    let rows = '';
    if (node.type === 'ups') {
      rows = tipRow('Çalışma modu', m.mode) + tipRow('Giriş gerilimi', m.lostCom ? '—' : f0(m.inputV) + ' V') +
        tipRow('Çıkış akımı', m.lostCom ? '—' : f1(m.Iavg) + ' A') + tipRow('Yük oranı', '%' + f0(m.load), statusText(m.status));
    } else {
      rows = tipRow('Akım', f1(m.Iavg) + ' A' + (m.phases === 3 ? ' (ort.)' : '')) + tipRow('Gerilim', f0(m.Vavg) + ' V') +
        tipRow('Aktif güç', f1(m.P) + ' kW') + tipRow('Yük', '%' + f0(m.load) + (m.rating ? ' / ' + f0(m.rating) + ' A' : ''), statusText(m.status));
    }
    el.innerHTML = '<div class="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-slate-200 dark:border-border-subtle">' +
        '<span class="font-black truncate">' + esc(node.label) + '</span><span class="text-[9px] font-black uppercase ' + statusText(m.status) + '">' + esc(statusLabel(m)) + '</span></div>' +
      '<div class="space-y-0.5">' + rows + '</div>' +
      '<div class="mt-1.5 text-[9px] text-slate-400">Detay için tıklayın</div>';
    el.classList.remove('hidden');
    if (evt) {
      const rect = canvasEl.getBoundingClientRect();
      let x = evt.clientX - rect.left + 14;
      let y = evt.clientY - rect.top + 14;
      if (x + el.offsetWidth > rect.width - 8) x = evt.clientX - rect.left - el.offsetWidth - 14;
      if (y + el.offsetHeight > rect.height - 8) y = evt.clientY - rect.top - el.offsetHeight - 14;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
  }
  function hideTooltip() {
    state.hoverId = null;
    const el = tooltipEl();
    if (el) el.classList.add('hidden');
  }

  function metricBox(label, value, unit, extra) {
    return '<div class="rounded-[2px] border border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel px-2 py-1.5">' +
      '<div class="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">' + esc(label) + '</div>' +
      '<div class="cv-num text-sm font-black text-slate-900 dark:text-slate-100">' + esc(value) + ' <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400">' + esc(unit) + '</span></div>' +
      (extra || '') + '</div>';
  }
  function infoRow(label, value) {
    return '<div class="flex items-start justify-between gap-3 py-1 border-b border-slate-100 dark:border-slate-800/80 last:border-0">' +
      '<span class="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">' + esc(label) + '</span>' +
      '<span class="text-[10px] font-bold text-slate-800 dark:text-slate-200 text-right">' + esc(value) + '</span></div>';
  }
  function sectionTitle(t) {
    return '<div class="section-kicker mb-1.5">' + esc(t) + '</div>';
  }

  // Seçili düğümden köke kadar besleme zinciri
  function chainOf(node) {
    const byId = {};
    state.nodes.forEach(n => { byId[n.id] = n; });
    const out = [];
    let cur = node;
    while (cur) { out.unshift(cur); cur = cur.parentId ? byId[cur.parentId] : null; }
    return out;
  }

  // Kabinin A/B çift beslemesi
  function dualFeedHtml(code) {
    const feeds = C.feedsOf(code);
    return ['A', 'B'].map(side => {
      const rows = feeds[side];
      if (!rows.length) return '<div class="text-[10px] text-slate-400">' + side + ' yolu: kayıt yok</div>';
      const pdus = C.pdusOf(code, side);
      const pm = pdus.map(p => C.pdu(code, p, state.tick));
      const st = C.worst(pm.map(p => p.status));
      const sdps = Array.from(new Set(rows.map(r => C.sdpCode(r.src_pan))));
      const I = pm.reduce((s, p) => s + p.Iavg, 0);
      const active = sdps.indexOf(sdpOf()) >= 0;
      return '<div class="rounded-[2px] border ' + (active ? 'border-brand-500/40 bg-brand-500/5' : 'border-slate-200 dark:border-border-subtle') + ' px-2 py-1.5">' +
        '<div class="flex items-center justify-between gap-2">' +
          '<span class="text-[10px] font-black text-slate-800 dark:text-slate-100"><i class="pi pi-bolt text-[9px] mr-1 ' + statusText(st) + '"></i>' + side + ' Yolu · ' + esc(sdps.join(', ')) + ' SDP</span>' +
          (active ? '<span class="text-[9px] font-black text-brand-600 dark:text-brand-400">GÖRÜNTÜLENEN</span>'
            : '<button type="button" class="text-[9px] font-black text-brand-600 dark:text-brand-400 hover:underline" data-act="goto" data-cab="' + esc(code) + '" data-side="' + side + '">Yolu göster <i class="pi pi-arrow-right text-[8px]"></i></button>') +
        '</div>' +
        '<div class="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">UPS ' + esc(sdps.join(', UPS ')) + ' · ' + esc(pdus.join(', ')) + ' · ' + rows.length + ' devre</div>' +
        '<div class="mt-0.5 flex items-center justify-between text-[10px]"><span class="cv-num font-bold ' + statusText(st) + '">' + f1(I) + ' A · ' + f1(pm.reduce((s, p) => s + p.P, 0)) + ' kW</span>' +
          '<span class="text-[9px] font-black uppercase ' + statusText(st) + '">' + esc(pm.some(p => p.lost) ? 'Faz kaybı' : st === 'warning' ? 'Yüksek yük' : st === 'alarm' ? 'Aşırı yük' : 'Normal') + '</span></div>' +
      '</div>';
    }).join('');
  }

  function detailBody(node, m) {
    const loadCls = m.lost || (node.type === 'ups' && m.battery) ? 'ln-alarm' : 'ln-' + (m.status === 'lost' || m.status === 'unknown' ? 'normal' : m.status);
    const loadBar = '<div class="cv-load-bar ' + loadCls + ' mt-1"><span style="width:' + Math.min(100, Math.max(0, m.load)).toFixed(1) + '%"></span></div>';
    let html = '<div class="flex items-center justify-between gap-2">' + statusBadge(m.status === 'lost' ? 'lost' : m.status, statusLabel(m)) +
      '<span class="text-[9px] text-slate-400 cv-num">Güncelleme ' + esc(fmtTime(state.updatedAt)) + '</span></div>';
    const note = node.type === 'ups' ? (m.battery ? 'Akü modunda çalışıyor — ADP girişi yok, kalan süre ' + f0(m.batteryMin || 0) + ' dk' : m.lostCom ? 'SNMP haberleşme kaybı — değerler alınamıyor' : m.status !== 'normal' ? m.reason : '') : m.note;
    if (note) {
      html += '<div class="rounded-[2px] border px-2 py-1.5 text-[10px] font-bold ' + (m.status === 'alarm' || m.lost ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300') + '"><i class="pi pi-exclamation-triangle mr-1"></i>' + esc(note) + '</div>';
    }

    if (node.type === 'ups') {
      html += '<div class="grid grid-cols-2 gap-1.5">' +
        metricBox('Çıkış Akımı', m.lostCom ? '—' : f1(m.Iavg), 'A') +
        metricBox('Çıkış Gerilimi', m.lostCom ? '—' : f0(m.Vavg), 'V') +
        metricBox('Çıkış Gücü', m.lostCom ? '—' : f1(m.P), 'kW') +
        metricBox('Yük Oranı', f0(m.load), '%', loadBar) +
      '</div>';
      html += '<div>' + sectionTitle('UPS Durumu') +
        infoRow('Çalışma modu', m.mode) +
        infoRow('Giriş gerilimi (L1)', m.lostCom ? '—' : f0(m.inputV) + ' V') +
        infoRow('Giriş akımı (ort.)', m.lostCom ? '—' : f1(m.inputI.reduce((a, b) => a + b, 0) / 3) + ' A') +
        infoRow('Akü kapasitesi', m.batteryPct != null ? '%' + f0(m.batteryPct) : '—') +
        infoRow('Kalan akü süresi', m.batteryMin != null ? f0(m.batteryMin) + ' dk' : '—') +
        infoRow('Akü sıcaklığı', m.batteryTemp != null ? f1(m.batteryTemp) + ' °C' : '—') +
        infoRow('Anma gücü', m.ratedKw + ' kW') +
      '</div>';
    } else {
      html += '<div class="grid grid-cols-2 gap-1.5">' +
        metricBox(node.type === 'group' || node.type === 'target' ? 'Toplam Akım' : m.phases === 3 ? 'Akım (ort.)' : 'Akım', f1(m.Iavg), 'A') +
        metricBox('Gerilim', f0(m.Vavg), 'V') +
        metricBox('Aktif Güç', f1(m.P), 'kW') +
        metricBox('Yük', f0(m.load), '%', loadBar) +
      '</div>';
      // Faz / devre tablosu
      let list = null;
      if (m.phases === 3 && m.I.length === 3) list = m.I.map((I, i) => ({ label: 'L' + (i + 1), I, V: m.V[i], load: m.rating ? (I / m.rating) * 100 : null, st: m.rating ? (I / m.rating * 100 >= C.thresholds.crit ? 'alarm' : I / m.rating * 100 >= C.thresholds.warn ? 'warning' : 'normal') : 'normal' }));
      else if (m.circuits && m.circuits.length) list = m.circuits.map(c => ({ label: c.row.src_fus + ' · ' + c.phase, I: c.Iavg, V: c.Vavg, load: c.load, st: c.status, lost: c.lost }));
      if (list) {
        html += '<div>' + sectionTitle(m.phases === 3 ? 'Faz Değerleri' : 'Besleyen Devreler') +
          '<table class="w-full text-[10px]"><thead><tr class="text-slate-400 text-left"><th class="font-bold py-0.5">' + (m.phases === 3 ? 'Faz' : 'Sigorta') + '</th><th class="font-bold text-right">Akım</th><th class="font-bold text-right">Gerilim</th><th class="font-bold text-right">Yük</th></tr></thead><tbody>' +
          list.map(r => '<tr class="border-t border-slate-100 dark:border-slate-800/80"><td class="py-0.5 font-bold text-slate-700 dark:text-slate-200">' + esc(r.label) + '</td>' +
            '<td class="cv-num text-right ' + statusText(r.st) + '">' + f1(r.I) + ' A</td><td class="cv-num text-right text-slate-600 dark:text-slate-300">' + f0(r.V) + ' V</td>' +
            '<td class="cv-num text-right font-bold ' + statusText(r.st) + '">' + (r.lost ? 'KAYIP' : r.load != null ? '%' + f0(r.load) : '—') + '</td></tr>').join('') +
          '</tbody></table></div>';
      }
      const row = node.ref.row;
      html += '<div>' + sectionTitle('Bilgi');
      if (m.rating) html += infoRow('Anma akımı', f0(m.rating) + ' A' + (node.type === 'patch' ? ' (C' + m.rating + ')' : ''));
      if (node.type === 'trafo') html += infoRow('Görünür güç', f0(m.S) + ' / ' + m.ratedKva + ' kVA') + infoRow('Güç faktörü', fmtNum(m.pf, 3));
      else html += infoRow('Güç faktörü', fmtNum(m.pf || 0.97, 2));
      html += infoRow('Besleme yolu', sideOf() + ' Yolu (' + state.selectedCabinet + ')');
      if (row) {
        html += infoRow('Kat / Salon', row.flr + ' / ' + row.hal) + infoRow('Kaynak sigorta', row.src_fus) + infoRow('Hedef', row.tgt_cab + ' · ' + row.tgt_pdu) +
          infoRow('Çalışma tarihi', row.wrk_dat) + infoRow('Personel', row.wrk_per);
      }
      html += '</div>';
      const code = row ? C.cabCode(row.tgt_cab) : node.type === 'group' ? node.ref.code : null;
      if (code) html += '<div>' + sectionTitle('Çift Besleme (A / B)') + '<div class="space-y-1.5">' + dualFeedHtml(code) + '</div></div>';
    }

    // Besleme zinciri
    const chain = chainOf(node);
    html += '<div>' + sectionTitle('Besleme Zinciri') + '<div class="flex flex-wrap items-center gap-1">' +
      chain.map((n, i) => {
        const cm = measure(n);
        return (i ? '<i class="pi pi-angle-right text-[9px] text-slate-400"></i>' : '') +
          '<button type="button" class="px-1.5 py-0.5 rounded-[2px] border text-[9px] font-bold ' + (n.id === node.id ? 'border-brand-500/50 text-brand-600 dark:text-brand-300' : 'border-slate-200 dark:border-border-subtle text-slate-600 dark:text-slate-300') + '" data-act="select" data-id="' + esc(n.id) + '">' +
          '<span class="inline-block w-1.5 h-1.5 rounded-full mr-1 ' + (nodeStatus(cm) === 'alarm' ? 'bg-rose-500' : nodeStatus(cm) === 'warning' ? 'bg-amber-500' : nodeStatus(cm) === 'normal' ? 'bg-emerald-500' : 'bg-slate-400') + '"></span>' + esc(n.label) + '</button>';
      }).join('') + '</div></div>';
    return html;
  }

  function detailActions(node) {
    const row = node.ref && node.ref.row;
    const code = row ? C.cabCode(row.tgt_cab) : node.type === 'group' ? node.ref.code : null;
    const link = (href, icon, label) => '<a href="' + esc(href) + '" class="' + DCIM.ui.buttonClasses('secondary', 'sm', false) + '"><i class="' + icon + '"></i><span>' + esc(label) + '</span></a>';
    const out = [];
    if (code) {
      const side = row ? C.sideOfPdu(row.tgt_pdu) : sideOf();
      out.push(link('pdu-detail.html?cabinet=' + encodeURIComponent(code) + '&pdu=' + side, 'pi pi-bolt', 'PDU Detayı'));
      out.push(link('cabinet-detail.html?cabinet=' + encodeURIComponent(code), 'pi pi-server', 'Kabin'));
      out.push(link('reports.html?cabinet=' + encodeURIComponent(code) + '#failover', 'pi pi-chart-bar', 'PDU Yük Raporu'));
    } else if (node.type === 'ups') {
      out.push(link('3d.html?focus=' + encodeURIComponent('UPS ' + node.ref.code), 'pi pi-box', "3D'de Göster"));
      out.push(link('reports.html#ups-module', 'pi pi-chart-line', 'UPS Raporu'));
      out.push(link('alarms.html?filter=alarm', 'pi pi-bell', 'Alarmlar'));
    } else if (node.type === 'trafo' || node.type === 'adp') {
      out.push(link('reports.html#transformer', 'pi pi-chart-line', 'Trafo Raporu'));
    } else {
      out.push(link('reports.html#ups', 'pi pi-chart-line', 'SDP Raporu'));
      out.push(link('reports.html#switch-redundancy', 'pi pi-power-off', 'Şalter Yedeklilik'));
    }
    return out.join('');
  }

  function renderDetail(liveOnly) {
    const host = root.querySelector('[data-detail-host]');
    const node = state.nodes.find(n => n.id === state.selectedId);
    if (!node) { host.innerHTML = ''; return; }
    const m = measure(node);
    if (!m) { host.innerHTML = ''; return; }
    if (liveOnly && host.querySelector('[data-detail-body]')) {
      const body = host.querySelector('[data-detail-body]');
      const scroll = body.scrollTop;
      body.innerHTML = detailBody(node, m);
      body.scrollTop = scroll;
      return;
    }
    host.innerHTML = '<div class="cv-detail" data-detail>' +
      '<div class="px-3 py-2.5 border-b border-slate-200 dark:border-border-subtle flex items-center gap-2.5 bg-slate-50/60 dark:bg-slate-900/60">' +
        '<span class="' + getNodeClass(node.type) + '"><span class="node-icon"><i class="' + getNodeIcon(node.type) + '"></i></span></span>' +
        '<div class="min-w-0 flex-1"><div class="node-type">' + esc(node.typeLabel) + '</div>' +
          '<div class="text-sm font-black text-slate-900 dark:text-slate-100 truncate">' + esc(node.label) + '</div></div>' +
        '<button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800" data-act="close-detail" title="Kapat"><i class="pi pi-times"></i></button>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3" data-detail-body>' + detailBody(node, m) + '</div>' +
      '<div class="px-3 py-2 border-t border-slate-200 dark:border-border-subtle flex flex-wrap gap-1.5 bg-slate-50 dark:bg-slate-900/60">' + detailActions(node) + '</div>' +
    '</div>';
  }

  function renderAll() {
    renderHeader();
    renderMetrics();
    renderAside();
    renderCanvas();
  }

  // ---------------------------------------------------------------------------
  // Olaylar
  // ---------------------------------------------------------------------------
  function bind() {
    root.addEventListener('click', e => {
      const actEl = e.target.closest('[data-act]');
      if (actEl && actEl.tagName !== 'SELECT') {
        const act = actEl.getAttribute('data-act');
        if (act === 'refresh') return refreshData();
        if (act === 'zoom-in') return zoomIn();
        if (act === 'zoom-out') return zoomOut();
        if (act === 'reset') return resetView();
        if (act === 'side') return switchSide(actEl.getAttribute('data-side'));
        if (act === 'frame') { e.stopPropagation(); return toggleGroupFrame(actEl.getAttribute('data-frame')); }
        if (act === 'close-detail') { state.selectedId = null; return renderCanvas(); }
        if (act === 'goto') return focusCabinet(actEl.getAttribute('data-cab'), actEl.getAttribute('data-side'));
        if (act === 'select') {
          state.selectedId = actEl.getAttribute('data-id');
          return renderCanvas();
        }
        if (act === 'event') {
          const ev = EVENTS[parseInt(actEl.getAttribute('data-ev'), 10)];
          if (!ev) return;
          if (ev.kind === 'ups') return selectSdp(ev.code, 'ups');
          return focusCabinet(ev.code, ev.side, ev.row);
        }
      }
      const nodeEl = e.target.closest('[data-node]');
      if (nodeEl && state.dragDist <= DRAG_CLICK_TOLERANCE) {
        const node = state.nodes.find(n => n.id === nodeEl.getAttribute('data-node'));
        if (node) { hideTooltip(); onNodeClick(node); }
      }
    });
    root.addEventListener('change', e => {
      if (e.target.matches('[data-act="cabinet"]')) onCabinetChange(e.target.value);
    });

    // Sürükleme / yakınlaştırma (onMouseDown / onMouseMove / onMouseUp / onWheel)
    canvasEl.addEventListener('mousedown', e => {
      if (e.target.closest('[data-detail]')) return;
      state.isDragging = true;
      state.dragDist = 0;
      state.lastMouse = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => { state.isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!state.isDragging) return;
      const dx = e.clientX - state.lastMouse.x;
      const dy = e.clientY - state.lastMouse.y;
      state.dragDist += Math.abs(dx) + Math.abs(dy);
      state.pan.x += dx;
      state.pan.y += dy;
      state.lastMouse = { x: e.clientX, y: e.clientY };
      applyTransform();
    });
    canvasEl.addEventListener('wheel', e => {
      if (e.target.closest('[data-detail]')) return;
      e.preventDefault();
      const rect = canvasEl.getBoundingClientRect();
      zoomTo(state.scale * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    // Tooltip
    layerEl.addEventListener('mousemove', e => {
      const nodeEl = e.target.closest('[data-node]');
      if (!nodeEl || state.isDragging) { if (state.hoverId) hideTooltip(); return; }
      state.hoverId = nodeEl.getAttribute('data-node');
      showTooltip(state.hoverId, e);
    });
    layerEl.addEventListener('mouseleave', hideTooltip);
    window.addEventListener('resize', () => applyTransform());
  }

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  renderShell();
  bind();

  const params = new URLSearchParams(window.location.search);
  const pCab = (params.get('cabinet') || '').toUpperCase();
  const pSide = (params.get('side') || 'A').toUpperCase() === 'B' ? 'B' : 'A';
  const pSdp = (params.get('sdp') || '').toUpperCase().replace(/\s*SDP PANOSU$/, '');
  const pOpen = { trafo: 'trafo', adp: 'adp', ups: 'ups', sdp: 'root' }[(params.get('open') || '').toLowerCase()] || null;

  if (!(pCab && focusCabinet(pCab, pSide))) {
    if (CABINETS.indexOf(pSdp + ' SDP PANOSU') >= 0) state.selectedCabinet = pSdp + ' SDP PANOSU';
    loadData();
    if (pOpen) state.selectedId = pOpen;
    renderAll();
    resetView();
  }

  // Canlı dalgalanma
  setInterval(() => {
    state.tick++;
    state.updatedAt = new Date();
    updateLive();
  }, LIVE_INTERVAL_MS);
})();
