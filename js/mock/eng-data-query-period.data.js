/* ==========================================================================
   DCIM Sunum — Veri Sorgulama Periyodu mock verisi (DCIM.data.dataQueryPeriod)
   Kaynak: NewUICMPDataQueryPeriodComponent — XDB_GetValue / XDB_SetValue yerine.
     GET: doc('<doc>')//dev[<filtre>][1]/bi[1]/@evt_per
     SET: doc('<doc>')//dev[<filtre>]/bi/@evt_per  +  doc('<doc>')/#save
   Başlangıç evt_per değerleri gerçek yapılandırmadan okundu (P24A01_S01/db41/db_CMR_T00.xml,
   db_CMR_T01.xml; bileşenin XPath filtreleri uygulanarak ilk cihazın ilk bi'si):
     PDU (CMR/T01) 3600 sn, diğer tüm gruplar (CMR/T00) 30 sn.
   Kapsam (etkilenen cihaz) listeleri sunuma özgüdür (kaynak bileşende liste yoktur):
     - PDU / Klima / Klima Panosu / SDP / Sensör (Kilit) / Enerji Analizörü / UPS:
       DCIM.data (cabinets, climates, panels, ups, getLockFloor, energy.meterTables) ile tutarlı;
       senaryo durumları korunur (1AV42 PDU-B faz kaybı, 1CB52 yüksek akım, 1CE51 haberleşme kaybı,
       KLIMA 109 yüksek basınç, UPS A5 akü modu, UPS B7 SNMP kaybı, A1 Klima Panosu faz dengesizliği).
     - Redresör / Kompanzasyon / Jeneratör / S2-S4 sensör modülleri: DCIM.data'da cihaz olarak
       modellenmediği için gerçek db_CMR_T00.xml dev kimlikleri kullanıldı.
   Listeler yükleme anında değil, ilk açıldığında üretilir (önbellekli).
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  // Bileşendeki load*/save* çağrılarının doküman + XPath filtresi (TS'ten birebir)
  const ANALYZER_FILTER = "contains(@id, 'IDC') and not(contains(@id, 'AIPC')) and not(contains(@id, 'BIPC')) and not(contains(@id, 'KOMP_')) and not(contains(@id, '_GEN')) and not(contains(@id, 'H_U_')) and not(contains(@id, 'PLC')) and not(contains(@id, 'NOLUKLM')) and not(contains(@id, '_KLM'))";
  const SENSOR_FILTER = "contains(@id, '_S2_') or contains(@id, '_S3_') or contains(@id, '_S4_') or contains(@id, '_LOCK_')";
  const GROUPS = {
    pdu: { doc: 'CMR/T01', filter: "contains(@id, '_PDU_')", evtPer: 3600 },
    climate: { doc: 'CMR/T00', filter: "contains(@id, 'KLM') and not(contains(@id, 'KLM_PANO'))", evtPer: 30 },
    climatePanel: { doc: 'CMR/T00', filter: "contains(@id, 'KLM_PANO')", evtPer: 30 },
    sdp: { doc: 'CMR/T00', filter: "contains(@id, '_UPS_G')", evtPer: 30 },
    sensor: { doc: 'CMR/T00', filter: SENSOR_FILTER, evtPer: 30 },
    rectifier: { doc: 'CMR/T00', filter: "contains(@id, 'AIPC') or contains(@id, 'BIPC')", evtPer: 30 },
    compensation: { doc: 'CMR/T00', filter: "contains(@id, 'KOMP_')", evtPer: 30 },
    generator: { doc: 'CMR/T00', filter: "contains(@id, '_GEN')", evtPer: 30 },
    upsEnergy: { doc: 'CMR/T00', filter: "contains(@id, 'H_U_')", evtPer: 30 },
    analyzer: { doc: 'CMR/T00', filter: ANALYZER_FILTER, evtPer: 30 }
  };

  const dev = (id, desc, status, note) => ({ id, desc, status: status || 'normal', note: note || '' });

  const BUILDERS = {
    // Her kabinde A/B PDU — K<kabin>_PDU_<A|B>_DV (cabinetMgr.pduDevs ile aynı kimlik)
    pdu() {
      const out = [];
      D.cabinets.slice().sort((a, b) => a.code.localeCompare(b.code)).forEach(c => {
        ['A', 'B'].forEach(side => {
          let st = 'normal', note = '';
          if (side === 'B' && c.pduFault) { st = 'alarm'; note = 'Faz kaybı (L2)'; }
          else if (c.status === 'warning' && /akım/i.test(c.note)) { st = 'warning'; note = c.note; }
          out.push(dev('K' + c.code + '_PDU_' + side + '_DV', c.code + ' PDU-' + side + ' · ' + c.customer, st, note));
        });
      });
      return out;
    },
    climate() {
      return D.climates.slice().sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }))
        .map(k => dev(k.devId, k.label, k.status, k.note));
    },
    // 2D yerleşiminde aynı pano iki şekille çizilmiş olabilir → devId tekil
    climatePanel() {
      const seen = {};
      return D.panels.filter(p => (seen[p.devId] ? false : (seen[p.devId] = true)))
        .map(p => dev(p.devId, p.label, p.status, p.note));
    },
    // UPS dağıtım panosu girişleri — KAT1_SAL1_<UPS>_UPS_GIR<1|2>_DV (gerçek yapıda 28 cihaz)
    sdp() {
      const out = [];
      D.ups.slice().sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true })).forEach(u => {
        const code = u.label.replace(/^UPS\s*/i, '');
        [1, 2].forEach(g => out.push(dev('KAT1_SAL1_' + code + '_UPS_GIR' + g + '_DV', code + ' SDP Giriş ' + g, 'normal', '')));
      });
      return out;
    },
    // S2–S4 salon sensör modülleri (gerçek) + her kabinin kilit modülü (kilit sayfasıyla aynı durum)
    sensor() {
      const out = [2, 3, 4].map(n => dev('K1S1_S' + n + '_DV', 'Salon 1 Sensör Modülü S' + n, 'normal', ''));
      const cards = D.getLockFloor ? D.getLockFloor('T00') : [];
      cards.slice().sort((a, b) => a.cabinetCode.localeCompare(b.cabinetCode)).forEach(k => {
        let st = 'normal', note = '';
        if (k.communicationState === 'offline') { st = 'lost'; note = k.cabinet && k.cabinet.note ? k.cabinet.note : 'Haberleşme kaybı'; }
        else if (k.cabinet && k.cabinet.lockState === 'fault') { st = 'warning'; note = 'Kilit motoru geri bildirimi okunamıyor'; }
        else if (k.alarmText) { st = /yetkisiz kapak/i.test(k.alarmText) ? 'alarm' : 'warning'; note = k.alarmText; }
        out.push(dev(k.id + '_LOCK_DV', 'Kilit ' + k.cabinetCode + ' · ' + k.pod, st, note));
      });
      return out;
    },
    // db_CMR_T00.xml — AIPC / BIPC cihazları
    rectifier() {
      return [
        dev('IDC_K2_1AIPC_DV', 'Redresör K2 · 1A IPC'),
        dev('IDC_K2_2AIPC_DV', 'Redresör K2 · 2A IPC'),
        dev('IDC_K2_2BIPC_DV', 'Redresör K2 · 2B IPC'),
        dev('IDC_K3_1BIPC_DV', 'Redresör K3 · 1B IPC')
      ];
    },
    // db_CMR_T00.xml — KOMP_ cihazları
    compensation() {
      return [
        dev('IDC1_A_TRF1KOMP_Q15_DV', 'A Blok TRF-1 Kompanzasyon (Q15)'),
        dev('IDC1_A_TRAFO1KOMP_Q146_DV', 'A Blok Trafo-1 Kompanzasyon (Q146)'),
        dev('IDC1_B_TRAFO1KOMP_Q16_DV', 'B Blok Trafo-1 Kompanzasyon (Q16)'),
        dev('IDC1_B_TRAFO2KOMP_Q145_DV', 'B Blok Trafo-2 Kompanzasyon (Q145)')
      ];
    },
    // db_CMR_T00.xml — _GEN cihazları; kol modu enerji sayfasıyla aynı (A kolu test çalışmasında)
    generator() {
      const gens = D.energy && D.energy.generators ? D.energy.generators(0) : [];
      const modeOf = side => { const g = gens.find(x => x.side === side); return g && /TEST/i.test(g.mode) ? 'Test çalışması' : ''; };
      return [
        ['IDC1_A_GEN4_Q5_DV', 'A', 'GEN-4 (Q5)'], ['IDC1_A_GEN5_Q6_DV', 'A', 'GEN-5 (Q6)'], ['IDC1_A_GEN6_Q7_DV', 'A', 'GEN-6 (Q7)'],
        ['IDC1_B_GEN1_Q8_DV', 'B', 'GEN-1 (Q8)'], ['IDC1_B_GEN3_Q9_DV', 'B', 'GEN-3 (Q9)'], ['IDC1_B_GEN2_Q10_DV', 'B', 'GEN-2 (Q10)']
      ].map(g => dev(g[0], 'Jeneratör ' + g[1] + ' Kolu · ' + g[2], modeOf(g[1]) ? 'info' : 'normal', modeOf(g[1])));
    },
    // UPS modülleri — DCIM.data.ups (UPS A5 akü modu, UPS B7 SNMP kaybı)
    upsEnergy() {
      return D.ups.slice().sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }))
        .map(u => dev(u.devId, u.label, u.status, u.status === 'lost' && !u.note ? 'SNMP haberleşme kaybı' : u.note));
    },
    // Enerji analizörleri — enerji sayfasının ölçüm tabloları (kompanzasyon ve klima panosu PMM'leri filtre dışı)
    analyzer() {
      const tables = D.energy && D.energy.meterTables ? D.energy.meterTables(0) : [];
      const out = [];
      tables.forEach(t => t.rows.forEach(r => {
        if (/KOMP|_KLM/i.test(r.id)) return;
        const warn = r.cells.some(c => c.sta === '0x0307'); // enerji STA.UYARI
        out.push(dev(r.id, r.cells[0].value, warn ? 'warning' : 'normal', warn ? 'Faz akımı uyarı sınırında' : ''));
      }));
      return out;
    }
  };

  const cache = {};

  D.dataQueryPeriod = {
    groups: GROUPS,
    // XDB_GetValue karşılığı — evt_per (sn)
    get(key) { return GROUPS[key] ? GROUPS[key].evtPer : undefined; },
    // XDB_SetValue + #save karşılığı — filtreye uyan tüm cihazların bi/@evt_per değeri
    set(key, value) { if (GROUPS[key]) GROUPS[key].evtPer = value; },
    devices(key) {
      if (!cache[key]) cache[key] = BUILDERS[key] ? BUILDERS[key]() : [];
      return cache[key];
    }
  };
})();
