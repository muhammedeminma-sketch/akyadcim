/* ==========================================================================
   DCIM Sunum — PDU Ekleme Formu mock verisi (engineering.html#device-add)
   Kaynak: NewUICMPDeviceAddEngComponent + PduPresetService
   - presets: doc('CMR/TMP')/xdb/config/pdu_presets/preset — P24A01_S01/db41/db_CMR_TMP.xml'deki
     23 preset birebir (yalnızca PduPresetService'in okuduğu alanlar; *_class öznitelikleri servis
     tarafından okunmadığı için burada da yok). XML'deki çift "PX2-5292R" kimliği aynen korunmuştur.
   - cmrDevs(): doc('CMR/T01')/descendant::dev kimlikleri. Kaynaktaki kabin/PDU sorguları
     "POD10_1BJ53_PDU_A_DV" biçimini beklediği için kimlikler kabinin pod'u + kabin kodu + A/B
     PDU'larından bu biçimde üretilir (DCIM.data.cabinets / DCIM.data.pdu ile aynı kabin ve taraflar).
   - addDev(id): kaydedilen PDU'nun bellekte listeye eklenmesi (sayfa yenilenince kaybolur).
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  // PduPresetService.createNonePreset() / map(): eksik alanlar '' ve 0 olur
  const EMPTY = {
    id: '', brandName: '', modelName: '', inletCount: 0, outletCount: 0,
    inletBiProAdr: '', inletCurrIoProAdr: '', inletVoltIoProAdr: '', inletPowIoProAdr: '',
    inletAppOffset: '', inletPfOffset: '', inletEngOffset: '', inletFreqOffset: '',
    outletOidBase: '', outletCurrOffset: '', outletVoltOffset: '', outletPowOffset: '',
    outletAppOffset: '', outletPfOffset: '', outletEngOffset: '', outletFreqOffset: '', outletStatusOffset: '',
    ocpCount: 0, ocpBaseOid: '',
    ocpRtdCapPattern: '', ocpCurrPattern: '', ocpStatusPattern: '', ocpAlarmPattern: '', ocpWarnPattern: ''
  };
  const P = (...parts) => Object.assign({}, EMPTY, ...parts);

  const EXAGATE = {
    brandName: 'Exagate', inletCount: 1, outletCount: 24,
    inletBiProAdr: '1.3.6.1.4.1.35483.1.1.1.3',
    inletCurrIoProAdr: '1.3.6.1.4.1.35483.1.1.1.3.1.1.4.49',
    inletVoltIoProAdr: '1.3.6.1.4.1.35483.1.1.1.3.1.1.4.48',
    inletPowIoProAdr: '1.3.6.1.4.1.35483.1.1.1.3.1.1.4.51',
    inletAppOffset: '1.1.4.52', inletPfOffset: '1.1.4.54', inletFreqOffset: '1.1.4.50',
    outletOidBase: '1.3.6.1.4.1.35483.1.1.1.3',
    ocpCount: 6, ocpBaseOid: '1.3.6.1.4.1.35483.1.1.1.3'
  };
  const RARITAN_IN = {
    brandName: 'Raritan', inletCount: 1,
    inletBiProAdr: '1.3.6.1.4.1.13742.6.5.2.3.1.4.1.1',
    inletCurrIoProAdr: '1.3.6.1.4.1.13742.6.5.2.3.1.4.1.1.1',
    inletVoltIoProAdr: '1.3.6.1.4.1.13742.6.5.2.3.1.4.1.1.4',
    inletPowIoProAdr: '1.3.6.1.4.1.13742.6.5.2.3.1.4.1.1.5',
    inletAppOffset: '6', inletPfOffset: '7', inletEngOffset: '8', inletFreqOffset: '23',
    ocpBaseOid: '1.3.6.1.4.1.13742.6',
    ocpRtdCapPattern: '4.3.1.5.1.{i}', ocpCurrPattern: '5.3.3.1.4.1.{i}.1', ocpStatusPattern: '5.3.3.1.3.1.{i}.15',
    ocpAlarmPattern: '3.4.4.1.23.1.{i}.1', ocpWarnPattern: '3.4.4.1.24.1.{i}.1'
  };
  const RARITAN_OUT = {
    outletOidBase: '1.3.6.1.4.1.13742.6.5.4.3.1.4.1',
    outletCurrOffset: '.1', outletVoltOffset: '.4', outletPowOffset: '.5',
    outletAppOffset: '.6', outletPfOffset: '.7', outletEngOffset: '.8', outletFreqOffset: '.23', outletStatusOffset: '.14'
  };
  const rar = (id, model, outlets, ocp) =>
    P(RARITAN_IN, outlets ? RARITAN_OUT : {}, { id, modelName: model, outletCount: outlets, ocpCount: ocp });

  // db_CMR_TMP.xml sırasıyla
  const PRESETS = [
    P({ id: 'NONE', brandName: 'Yok', modelName: 'Ön Ayar Seçin' }),
    P(EXAGATE, { id: 'EXAGATEPDU_T', modelName: 'EXAGATEPDU_T (24 Outlet)' }),
    P(EXAGATE, { id: 'EXAGATEPDU_32A', modelName: 'EXAGATEPDU_32A (24 Outlet)' }),
    rar('PX2-2493', 'PX2-2493 (12 Outlet)', 12, 2),
    rar('PX2-5292R', 'PX2-5292R (6 Outlet)', 6, 2),
    rar('PX2-5292R', 'PX2-5292R (12 Outlet)', 12, 2),
    rar('PX2-5530', 'PX2-5530 (12 Outlet)', 12, 2),
    rar('PX2-5844R', 'PX2-5844R (24 Outlet)', 24, 2),
    rar('PX3-4104R-V2', 'PX3-4104R-V2 (24 Outlet)', 24, 2),
    rar('PX3-5292R', 'PX3-5292R (12 Outlet', 12, 2),
    rar('PX3-5493XV', 'PX3-5493XV (Sadece Inlet)', 0, 2),
    rar('PX4-4917-E7V2K1', 'PX4-4917-E7V2K1 (Sadece Inlet)', 0, 2),
    rar('PX3-5528V-V2', 'PX3-5528V-V2 (10 Outlet)', 10, 2),
    rar('PX3-5530V', 'PX3-5530V (24 Outlet)', 24, 2),
    rar('PX2-4104R-V2', 'PX2-4104R-V2 (6 Outlet)', 6, 6),
    rar('PX3-5493V', 'PX3-5493V (24 Outlet)', 24, 2),
    rar('PX3-5528V', 'PX3-5528V (24 Outlet)', 24, 6),
    rar('PX3-5530V-V2', 'PX3-5530V-V2 (24 Outlet)', 24, 6),
    rar('PX2-4134NR', 'PX2-4134NR (6 Outlet)', 6, 2),
    rar('PX3-5466R', 'PX3-5466R (20 Outlet)', 20, 2),
    rar('PX3-5530XV-V2', 'PX3-5530XV-V2 (24 Outlet)', 24, 6),
    rar('PX4-4917-E7V2K2', 'PX4-4917-E7V2K2 (24 Outlet)', 24, 6),
    rar('PMC-1001', 'PMC-1001 (24 Outlet)', 24, 2)
  ];

  // CMR/T01 dev kimlikleri — ilk erişimde üretilir; kaydedilenler sona eklenir
  let devs = null;
  const added = [];
  function cmrDevs() {
    if (!devs) {
      devs = [];
      (D.cabinets || []).forEach(c => {
        const pod = String(c.pod || '').replace('-', '');
        ['A', 'B'].forEach(side => devs.push({ rid: (pod ? pod + '_' : '') + c.code + '_PDU_' + side + '_DV', doc: 'CMR/T01' }));
      });
    }
    return devs;
  }

  D.engDeviceAdd = {
    presets: () => PRESETS.map(p => Object.assign({}, p)),
    cmrDevs,
    added,
    // Kaydet: doc('CMR/Txx')/xdb/@opr ← {cmd:1, xml} + #save karşılığı (yalnızca bellek)
    addDev(rec) {
      added.push(rec);
      if (rec.doc === 'CMR/T01') cmrDevs().push({ rid: rec.deviceId, doc: rec.doc });
    }
  };
})();
