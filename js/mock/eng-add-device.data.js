/* ==========================================================================
   DCIM Sunum — Cihaz Tanımlama Talep Formu mock verisi (engineering.html#add-device)
   Kaynak: NewUICMPAddDeviceComponent
   - cabinOptions(): "Değiştirilecek Kabin" (INROW klima) seçenekleri. Orijinalde sabit
     Cabin-01 / Cabin-02; sunumda DCIM.data.cabinets (Salon 1 kabinleri) kullanılır.
   - catalog(deviceType): Marka / Model öneri listesi — DCIM.data.catList (Model Kütüphanesi)
     içinde cihaz tipine karşılık gelen nature'daki modeller (sunum eki).
   - send(req): XDB_SetValue(doc('EXT/S00')/id('CN_PAPI')/@opr, {cmd:'SEND_EMAIL',...}) karşılığı;
     talep bellekte saklanır (sayfa yenilenince kaybolur).
   Bağımlılık: js/mock-data.js → DCIM.data (cabinets, catList)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  // Cihaz tipi → Model Kütüphanesi (CAT) nature karşılığı; karşılığı olmayan tiplerde öneri yok
  const NATURE_OF = { PDU: 'PDU', UPS: 'UPS', SENSOR: 'Sensör' };

  const requests = [];

  D.engAddDevice = {
    to_addr: 'nobetci@turktelekom.com.tr',
    cabinOptions() {
      return (D.cabinets || []).slice()
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(c => ({ id: c.code, name: c.code + ' (' + c.pod + ')' }));
    },
    catalog(deviceType) {
      const nature = NATURE_OF[deviceType];
      if (!nature || !D.catList) return [];
      return D.catList.list().filter(m => m.nature === nature).map(m => ({ brand: m.brand, model: m.name }));
    },
    requests,
    send(req) {
      requests.push(Object.assign({ tim: new Date() }, req));
      return 'OK';
    }
  };
})();
