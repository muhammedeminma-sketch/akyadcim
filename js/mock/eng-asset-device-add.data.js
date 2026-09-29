/* ==========================================================================
   DCIM Sunum — Asset Cihazı Ekleme mock verisi (engineering.html#asset-device-add)
   NewUICMPAssetDeviceAddComponent servis çağrılarının yerine geçer:
     assetService.getAllCat()          (SELECT ... FROM CAT)                    → getAllCat()   = DCIM.data.catList.list()
     assetService.getAllDeviceType()   (api.HIS_getAllDeviceType: SELECT DISTINCT
                                        device_type FROM ASM ...)               → getAllDeviceType()  (kabin varlıklarının tipleri)
     catService.createCatalogItem(allCatInput)  (ASM/S00 CAT_List @opr cmd:6)    → createCatalogItem() → DCIM.data.catList.create()
   Kayıt yalnızca bellektedir (sayfa yenilenince kaybolur); Model Kütüphanesi verisiyle (DCIM.data.catList) aynı havuzdur.
   Bağımlılık: js/mock-data.js (DCIM.data.catList, DCIM.data.cabinets)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  D.engAssetDeviceAdd = {
    // CAT kayıtları: { cat_id, model_id, name, brand, nature, full_name, jsn }
    getAllCat: () => (D.catList ? D.catList.list() : []),

    // HIS_getAllDeviceType → [{ device_type }] (ASM.device_type, boş olmayan, sıralı)
    getAllDeviceType() {
      const set = new Set();
      (D.cabinets || []).forEach(c => (c.assets || []).forEach(a => { if (a.assetType) set.add(a.assetType); }));
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr')).map(t => ({ device_type: t }));
    },

    // catService.createCatalogItem: allCatInput → CAT (name / brand / nature / full_name) + jsn
    createCatalogItem(data) {
      const name = data.model || data.name || '';
      const brand = data.manufacturer || data.brand || '';
      const nature = data.deviceType || data.nature || '';
      const power = data.power || 0;
      const jsn = {
        ucapacity: data.uCapacity || 0,
        weight: data.weight || 0,
        power,
        nominal_power: power,
        powerConnections: data.powerConnections || 0,
        // Model Kütüphanesi (category-list) ekranının okuduğu anahtar
        power_connection_numbers: data.powerConnections || 0
      };
      const cat = { name, brand, nature, full_name: '/Türk Telekom-TTVM/' + nature + '/' + brand + '/' + name + '/' };
      return D.catList ? D.catList.create(cat, jsn) : null;
    }
  };
})();
