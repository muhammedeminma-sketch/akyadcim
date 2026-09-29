/* ==========================================================================
   DCIM Sunum — Toplu Parametre Ayarları mock verisi (DCIM.data.bulkSettings)
   NewUICMPBulkSettingsComponent'in DASService.XDB_SetValue çağrılarının yerine geçer.
   Yazılan XPath/değer çiftleri bellekte tutulur (sayfa yenilenince sıfırlanır) ve
   konsola "[XDB_SetValue]" önekiyle yazılır — sunumda geliştirici konsolundan gösterilebilir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const log = [];

  D.bulkSettings = {
    log,
    // das.XDB_SetValue(path, value) karşılığı
    setValue(path, value) {
      const rec = { tim: new Date(), path: String(path), value: String(value) };
      log.push(rec);
      if (window.console && console.info) console.info('[XDB_SetValue]', rec.path, '=', rec.value);
      return rec;
    }
  };
})();
