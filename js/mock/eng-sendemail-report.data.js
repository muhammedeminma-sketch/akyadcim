/* ==========================================================================
   DCIM Sunum — Email Konfigürasyonu mock verisi (DCIM.data.emailReport)
   savedConfig : doc('ASM/S00')/id('EMAIL_REPORT_CFG')/@jsn → { email, reports[] }
   smtp        : Rapor servisinin (P24A01_S01/db41/lib_PAPI → email_send) SMTP bilgisi. Kaynakta UI'dan
                 düzenlenmez; yalnızca port (587) ve STARTTLS kaynakla aynıdır. Sunucu adı / gönderen
                 adresi AÇIKÇA ÖRNEK değerdir; gerçek sunucu/kimlik bilgisi kullanılmaz.
   history     : Sunum eki — son otomatik gönderimler (her ayın 1'i, önceki ayın raporları)
   E-posta adresleri kurgusaldır (@example.com).
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const pad = n => String(n).padStart(2, '0');
  const RECIPIENT = 'dcim.rapor@example.com';
  const REPORTS = ['pue', 'cue', 'energy', 'ups', 'cabin', 'climate', 'temperature'];

  // Son 4 ayın 1'i 06:00 — önceki ayın dönemi
  const now = new Date();
  const history = [];
  for (let i = 0; i < 4; i++) {
    const sent = new Date(now.getFullYear(), now.getMonth() - i, 1, 6, 0, 0);
    if (sent > now) continue;
    const per = new Date(sent.getFullYear(), sent.getMonth() - 1, 1);
    history.push({
      time: sent.getTime() + (3 + i * 2) * 60000 + 17000, // hesaplama + gönderim süresi
      kind: 'auto',
      period: per.getFullYear() + '-' + pad(per.getMonth() + 1),
      email: RECIPIENT,
      count: i < 2 ? REPORTS.length : 5,
      ok: true
    });
  }

  D.emailReport = {
    savedConfig: { email: RECIPIENT, reports: REPORTS.slice() },
    smtp: {
      server: 'smtp.example.com',   // örnek değer
      port: 587,                     // lib_PAPI email_send ile aynı
      security: 'STARTTLS',          // server.starttls()
      sender: 'noreply@example.com', // örnek değer
      auth: 'Kullanıcı adı / şifre'
    },
    history
  };
})();
