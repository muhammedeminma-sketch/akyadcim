/* ==========================================================================
   DCIM Sunum — CCTV İzleme mock verisi (DCIM.data.cctv) — cctv.html
   Orijinal: NewUICMPCctvComponent.cameras (db_CCTV.xml kamera tanımları; CCTV/S00 kök XML'e bağlı değil,
   bu yüzden her kanal "SİNYAL YOK" yer tutucusu gösterir).
   Kamera adları, adresler ve düğüm adları KURGUSALDIR (gerçek saha kamerası / IP yoktur).
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = (DCIM.data = DCIM.data || {});

  // code: ekrandaki kanal kodu (OSD) · name: kamera adı · host: RTSP adresi · node: db_CCTV.xml kaynak düğümü
  const cameras = [
    { code: 'CAM-01', name: 'DCA K1 Salon-1 Kuzey', host: '10.0.50.11', node: 'CN_CAM1' },
    { code: 'CAM-02', name: 'DCA K1 Salon-1 Güney', host: '10.0.50.12', node: 'CAM2' },
    { code: 'CAM-03', name: 'DCA K1 Sıcak Koridor POD-8', host: '10.0.50.13', node: 'CAM3' },
    { code: 'CAM-04', name: 'DCA K1 UPS Odası', host: '10.0.50.14', node: 'CAM4' },
    { code: 'CAM-05', name: 'DCA K2 Salon Girişi', host: '10.0.50.21', node: 'CAM5' },
    { code: 'CAM-06', name: 'DCA Zemin Kat Koridor', host: '10.0.50.31', node: 'CAM6' },
    { code: 'CAM-07', name: 'DCB Jeneratör Sahası', host: '10.0.60.11', node: 'CAM7' }
  ];

  D.cctv = { cameras };
})();
