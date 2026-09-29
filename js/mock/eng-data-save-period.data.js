/* ==========================================================================
   DCIM Sunum — Veri Kayıt Periyodu mock verisi (DCIM.data.dataSavePeriod)
   Kaynak: NewUICMPDataSavePeriodComponent — XDB_GetValue / XDB_SetValue yerine.
     GET: doc('<doc>')//tio[@id='A' or @id='B' ...][1]/@his_per
     SET: doc('<doc>')//tio[@id='A' or @id='B' ...]/@his_per  +  doc('<doc>')/#save
   Sınıf listeleri bileşendeki *Tios dizileriyle birebir aynıdır.
   his_per değerleri ve nokta sayıları gerçek yapılandırmadan okundu
   (P24A01_S01/db41/db_CMR_T00.xml, db_CMR_T01.xml):
     - his: tio/@his_per (sn); null → sınıf tanımlı ama his_per özniteliği yok
     - exists: false → sınıf o dokümanda tanımlı değil (SET bu sınıfları etkilemez)
     - points: xdb_cls ile bu sınıfı kullanan nokta (io) sayısı
     - first: doküman sırasındaki ilk eşleşen tio — "Mevcut Kayıt aralığı" bu sınıftan okunur ([1])
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  // [sınıf, his_per, nokta sayısı] — exists=false için his_per 'X'
  const cls = rows => rows.map(r => ({ id: r[0], exists: r[1] !== 'X', his: r[1] === 'X' ? null : r[1], points: r[2] || 0 }));

  const GROUPS = {
    pdu: {
      doc: 'CMR/T01', first: 'CABIN_PDU_CURR04_OCP',
      classes: cls([
        ['CABIN_PDU_CURR04_OCP', 300, 420], ['CABIN_PDU_CURR05_OCP', 300, 528], ['CABIN_PDU_CURR01', 300, 1284],
        ['CABIN_PDU_CURR02', 300, 528], ['CABIN_PDU_CURR03', 300, 12], ['CABIN_PDU_CURR04', 300, 1006],
        ['CABIN_PDU_CURR05', 300, 1320], ['CABIN_PDU_VOLT01', 900, 3402], ['CABIN_PDU_VOLT02', 900, 12],
        ['CABIN_PDU_POW', 300, 2182], ['PMM_CIRC_POW', 300, 64], ['PMM_CIRC_CURR', 300, 66],
        ['CABIN_PDU_PF01', 300, 2240], ['CABIN_PDU_FR01', 14400, 1590], ['PDU_Inv', 43200, 5160],
        ['cls_SI', 300, 75], ['cls_TI2', 300, 5834], ['cls_SI00', 300, 66]
      ])
    },
    climate: {
      doc: 'CMR/T00', first: 'KLM_TMP',
      classes: cls([
        ['KLM_ASYS', 300, 780], ['KLM_RPR', 300, 60], ['KLM_HUM', 300, 20], ['KLM_TMP', 300, 80], ['KLM_SET', 300, 280],
        ['cls_KL3', 300, 1580], ['cls_KLM_ALM_1', null, 20], ['cls_KLM_ALM_2', null, 360], ['cls_KLM_ALM_2_1', null, 20]
      ])
    },
    climatePanel: {
      doc: 'CMR/T00', first: 'KLM_PN_FREQ',
      classes: cls([
        ['KLM_PN_FREQ', 300, 5], ['KLM_PN_VOLT', 900, 25], ['KLM_PN_POWA', 300, 33], ['KLM_PN_PF', 300, 20],
        ['KLM_PN_VOL', 900, 15], ['KLM_PN_CURRA', 300, 12], ['KLM_PN_POWTA', 300, 3]
      ])
    },
    sdp: {
      doc: 'CMR/T00', first: 'SDP_VOLT',
      classes: cls([
        ['SDP_FREQ', 300, 30], ['SDP_VOL', 900, 90], ['SDP_VOLT', 900, 150], ['SDP_CUR', 300, 90], ['SDP_POW', 300, 28],
        ['SDP_APOW', 300, 228], ['SDP_PF', 300, 120], ['ENT_VLT', 'X'], ['ENT_VLL', 'X'], ['ENT_CUR', 'X'],
        ['ENT_PWF', 'X'], ['ENT_POW', 'X'], ['ENT_FRQ', 'X']
      ])
    },
    sensor: {
      doc: 'CMR/T00', first: 'CABIN_TEMP',
      classes: cls([['POD_TEMP', 300, 12], ['CABIN_TEMP', 300, 567], ['CABIN_HUM', 300, 189]])
    },
    analyzer: {
      doc: 'CMR/T00', first: 'TEK_FREQ',
      classes: cls([
        ['TEK_FREQ', 300, 42], ['TEK_VOLT', 900, 315], ['TEK_CURR', 900, 105], ['TEK_POW', 300, 102],
        ['TRF_POW', 300, 402], ['TRF_PF', 300, 168]
      ])
    },
    rectifier: {
      doc: 'CMR/T00', first: 'RDR_VLT1',
      classes: cls([['RDR_VLT1', 300, 20], ['RDR_VLT2', 300, 12], ['RDR_CURR', 300, 12], ['RDR_TEMP', 300, 16]])
    },
    upsEnergy: {
      doc: 'CMR/T00', first: 'HUW_VOLT',
      classes: cls([
        ['HUW_VOLT', 900, 72], ['HUW_FREQ', 900, 24], ['HUW_CURR', 900, 72], ['HUW_VOLT2', 900, 72],
        ['HUW_PF', 'X'], ['HUW_POW', 'X'], ['BAT_LEFT', 'X']
      ])
    }
  };

  D.dataSavePeriod = {
    groups: GROUPS,
    // XDB_GetValue karşılığı — doküman sırasındaki ilk eşleşen tio'nun his_per değeri
    get(key) {
      const g = GROUPS[key];
      if (!g) return undefined;
      const c = g.classes.find(x => x.id === g.first);
      return c && c.his != null ? c.his : undefined;
    },
    // XDB_SetValue + #save karşılığı — dokümanda tanımlı tüm eşleşen tio'ların his_per değeri
    set(key, value) {
      const g = GROUPS[key];
      if (g) g.classes.forEach(c => { if (c.exists) c.his = value; });
    },
    classIds(key) { return GROUPS[key] ? GROUPS[key].classes.map(c => c.id) : []; }
  };
})();
