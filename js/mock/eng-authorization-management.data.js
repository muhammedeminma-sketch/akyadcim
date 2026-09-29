/* ==========================================================================
   DCIM Sunum — Mühendislik / Yetkilendirme Yönetimi mock verisi (DCIM.data.authMgmt)
   Kaynak: engineering/authorization-management.component.ts
   - Kullanıcılar ayrı üretilmez: api.HIS_get_auth_users karşılığı DCIM.data.accounts.users içindeki
     müşteri kullanıcılarıdır (Kullanıcı Ayarları → "Müşteri Yetkilendirme" modalıyla aynı kişiler/ACL'ler).
   - api.HIS_get_auth_stats karşılığı (total / active_alarms / inactive_alarms) sayfada kullanıcıların
     CMA yetkisinden hesaplanır.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;

  D.authMgmt = {
    // confirmResetPermissions() → newAcl (varsayılan müşteri şablonu; accounts.aclByGroup['müşteri'] ile aynı)
    defaultAcl: 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,',
    // canEditAuth → das.isAuthorized('ASP' | 'ASPC' | 'ASPU'); sunum oturumu mühendis/admin kabul edilir
    canEditAuth: true
  };
})();
