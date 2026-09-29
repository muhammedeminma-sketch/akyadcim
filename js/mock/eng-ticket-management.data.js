/* ==========================================================================
   DCIM Sunum — Ticket Yönetimi mock verisi (DCIM.data.tickets)
   TicketService.getTickets → api.HIS_GetTickets(...) satırlarının karşılığı (Ticket arayüzü):
     tck_id, customer_id, customer_name, email, subject, description, chat_history (JSON dizisi),
     status (OPEN | CLOSED), priority (Low | Medium | High), created_at, updated_at
   Tutarlılık:
     - DCIM.data.site.tickets → { newTickets: 2, newMessages: 1 }
       YENİ TICKET  = OPEN + hiç admin mesajı yok          → #1047 (1AZ39), #1046 (1BJ53)
       YENİ MESAJ   = OPEN + admin yanıtı var, son mesaj müşteri → #1044 (1AV42)
     - Müşteriler DCIM.data.customers (CDB) ve kabin sahipleriyle aynı:
       1AZ39 → Kuzey Enerji, 1BJ53 → Ege Lojistik, 1AV42 → Marmara Sigorta, 1BU54 → Başkent Belediyesi
     - Olay zamanları sunum senaryosuyla uyumlu (1AZ39 alarmı ~11 dk, 1AV42 faz kaybı ~23 dk önce)
   followUps: yöneticinin yanıtından sonra 10 sn'lik yoklamada (silentLoadTickets) gelen müşteri yanıtı (demo).
   E-posta adresleri kurgusaldır (@example.com).
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const NOW = Date.now();
  const MIN = 60000;
  const pad = n => String(n).padStart(2, '0');
  // Veritabanı zaman damgası biçimi (yerel): YYYY-MM-DD HH:mm:ss
  const dbTime = ms => {
    const d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };
  const ago = m => NOW - m * MIN;

  // CDB müşteri numarası (customer_id) — DCIM.data.customers.cdbList ile aynı
  const CDB_FALLBACK = {
    'Anadolu Finans A.Ş.': '1013312753',
    'Delta Yazılım Teknolojileri A.Ş.': '1013318420',
    'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı': '1013290017',
    'Marmara Sigorta A.Ş.': '1013325566',
    'Ege Lojistik ve Taşımacılık A.Ş.': '1013301984',
    'Kuzey Enerji Dağıtım A.Ş.': '1013334409'
  };
  const cdbOf = name => {
    const list = (D.customers && D.customers.cdbList) || [];
    const row = list.find(r => r.customer_name === name);
    return row ? row.cdb_id : CDB_FALLBACK[name] || '';
  };

  // Senaryodaki açık iş emri numarası (varsa) — İş Emirleri ekranıyla aynı kayıt
  const woOf = target => {
    const list = (D.workOrders && D.workOrders.list) || [];
    const w = list.find(x => x.target === target && x.sta !== '0x0304');
    return w ? w.ord_id : '';
  };
  const woText = (target, fallback) => {
    const id = woOf(target);
    return id ? id + ' numaralı ' + fallback : fallback;
  };

  const C = {
    kuzey: { name: 'Kuzey Enerji Dağıtım A.Ş.', email: 'noc.kuzeyenerji@example.com', contact: 'Murat Yıldırım' },
    ege: { name: 'Ege Lojistik ve Taşımacılık A.Ş.', email: 'bt.egelojistik@example.com', contact: 'Selin Aydın' },
    marmara: { name: 'Marmara Sigorta A.Ş.', email: 'altyapi.marmarasigorta@example.com', contact: 'Kerem Aksoy' },
    anadolu: { name: 'Anadolu Finans A.Ş.', email: 'dc.anadolufinans@example.com', contact: 'Elif Güneş' },
    baskent: { name: 'Başkent Belediyesi Bilgi İşlem Daire Başkanlığı', email: 'bilgiislem.baskent@example.com', contact: 'Hakan Uçar' },
    delta: { name: 'Delta Yazılım Teknolojileri A.Ş.', email: 'operasyon.deltayazilim@example.com', contact: 'Ozan Tekin' }
  };
  // Destek yetkilileri (DCIM.data.personnel)
  const ADMIN = { ayse: 'Ayşe Demir', mehmet: 'Mehmet Kaya', deniz: 'Deniz Koç' };

  const msg = (type, name, text, minutesAgo) => ({ sender_type: type, sender_name: name, message: text, timestamp: new Date(ago(minutesAgo)).toISOString() });
  const cust = (c, text, m) => msg('customer', c.contact, text, m);
  const adm = (who, text, m) => msg('admin', who, text, m);

  const list = [];
  function add(id, c, o) {
    const hist = o.chat || [];
    const last = hist.length ? Math.min.apply(null, hist.map(h => (NOW - Date.parse(h.timestamp)) / MIN)) : o.created;
    list.push({
      tck_id: id,
      customer_id: cdbOf(c.name),
      das_uid: 'CU' + cdbOf(c.name).slice(-6),
      customer_name: c.name,
      email: c.email,
      subject: o.subject,
      description: o.description,
      // Backend chat_history'yi JSON metni olarak döndürür; bileşen JSON.parse eder
      chat_history: JSON.stringify(hist),
      attachments: [],
      status: o.status || 'OPEN',
      priority: o.priority,
      created_at: dbTime(ago(o.created)),
      updated_at: dbTime(ago(o.closedAgo != null ? o.closedAgo : last))
    });
  }

  // ---------------------------------------------------------------------------
  // AÇIK TALEPLER
  // ---------------------------------------------------------------------------
  // YENİ TICKET — 1AZ39 yetkisiz kapak açılması (sunum senaryosu)
  add(1047, C.kuzey, {
    subject: '1AZ39 kabininde yetkisiz kapak açılması',
    priority: 'High',
    created: 8,
    description:
      'Merhaba,\n' +
      'Müşteri portalından POD-1 / 1AZ39 kabinimizin ön kapağının kart okutulmadan açıldığına dair bildirim aldık. ' +
      'Bu saatte sahada ekibimiz ya da planlı bir çalışmamız bulunmuyor.\n\n' +
      '1) Kapağı kimin açtığı tespit edildi mi, kamera kaydı incelendi mi?\n' +
      '2) Kabindeki cihazlarımıza fiziksel bir müdahale var mı?\n' +
      '3) Kapak şu an kilitli durumda mı?\n\n' +
      'Olay raporunun tarafımıza iletilmesini rica ederiz.'
  });
  // YENİ TICKET — 1BJ53 yüksek sıcaklık
  add(1046, C.ege, {
    subject: '1BJ53 kabininde sunucu giriş sıcaklığı yükseldi',
    priority: 'High',
    created: 3,
    description:
      'Sunucularımızın yönetim arayüzlerinde giriş (inlet) sıcaklığı son bir saatte 31-33 °C bandına çıktı ve fan devirleri arttı. ' +
      'POD-9 / 1BJ53 kabinindeki soğutmayla ilgili bir çalışma var mı? Gerekirse yük taşıma planı yapacağız; tahmini süreyi paylaşabilir misiniz?'
  });
  // YENİ MESAJ — 1AV42 PDU-B faz kaybı (yönetici yanıtladı, müşteri yeniden yazdı)
  add(1044, C.marmara, {
    subject: '1AV42 kabininde B beslemesi kesildi',
    priority: 'High',
    created: 18,
    description:
      'NS1 / 1AV42 kabinimizdeki sunucularda B güç kaynağı (PSU2) alarmı alıyoruz. B beslemesinde bir kesinti mi var?',
    chat: [
      adm(ADMIN.ayse,
        'Merhaba, NS1 / 1AV42 kabininizdeki PDU-B\'de L2 faz kaybı tespit edildi. ' + woText('1AV42', 'arıza iş emri') +
        ' Enerji & Mekanik Bakım ekibine atandı ve ekip sahada. Cihazlarınız A beslemesi (PDU-A) üzerinden kesintisiz çalışmaya devam ediyor.', 12),
      cust(C.marmara, 'Teşekkürler. Tek besleme ile çalıştığımız süre boyunca PDU-A yükü sınırı aşar mı? Tahmini çözüm saatini paylaşabilir misiniz?', 4)
    ]
  });
  add(1041, C.anadolu, {
    subject: 'Ek enerji paketi (2 kW) aktivasyonu',
    priority: 'Medium',
    created: 22 * 60,
    description: 'Geçen hafta onaylanan 2 kW ek enerji paketimizin aktivasyon durumu hakkında bilgi alabilir miyiz?',
    chat: [
      adm(ADMIN.mehmet,
        'Siparişiniz tamamlandı; ek 2 kW enerji paketi PDU çıkış eşleştirmesi için Müşteri Eşleştirme listesine alındı. ' +
        'Eşleştirme sonrasında tüketiminiz aylık enerji raporunuzda ayrı kalem olarak görünecektir.', 20 * 60)
    ]
  });
  add(1039, C.baskent, {
    subject: '1BU54 kabininde nem uyarısı',
    priority: 'Medium',
    created: 55,
    description: 'Portalda POD-7 / 1BU54 kabinimiz için nem uyarısı görüyoruz. Cihazlarımız için bir risk var mı?',
    chat: [
      adm(ADMIN.ayse,
        'Kabininizin bulunduğu POD-7\'de nem %62 ölçülüyor (uyarı limiti %60). ' + woText('1BU54', 'kontrol / test iş emri') +
        ' açıldı; klimaların nem alma modu kontrol edilecek. Cihazlarınız için risk seviyesi düşüktür, gelişmeleri buradan paylaşacağız.', 40)
    ]
  });
  add(1036, C.delta, {
    subject: 'Personel kartı tanımlama talebi (2 kişi)',
    priority: 'Low',
    created: 2 * 1440 + 180,
    description: 'Yeni başlayan iki sistem yöneticimiz için Salon 1 kabin erişim kartı tanımlanmasını talep ediyoruz.',
    chat: [
      adm(ADMIN.mehmet, 'Talebiniz alındı. Kimlik fotokopileri ve imzalı yetki formu ulaştığında kart tanımları yapılacaktır.', 2 * 1440 + 90),
      cust(C.delta, 'Formlar bugün e-posta ile iletildi.', 1440 + 300),
      adm(ADMIN.deniz, 'Formlar teslim alındı. Kartlar yarın 10:00\'da güvenlik biriminden kimlik ibrazı ile teslim alınabilir.', 1440 + 120)
    ]
  });

  // ---------------------------------------------------------------------------
  // KAPALI TALEPLER
  // ---------------------------------------------------------------------------
  const closed = (id, c, subject, priority, days, description, reply, thanks) => {
    const created = days * 1440 + ((id * 37) % 420); // gün içinde farklı saatler
    add(id, c, {
      status: 'CLOSED', subject, priority, created, description,
      closedAgo: created - 1440 * 0.8,
      chat: [adm(ADMIN.mehmet, reply, created - 90), cust(c, thanks, created - 60)]
    });
  };
  closed(1035, C.kuzey, 'Eylül dönemi enerji tüketim raporu talebi', 'Low', 5,
    'Kabinlerimizin eylül ayı ara dönem enerji tüketim raporunu Excel formatında talep ediyoruz.',
    'Raporunuz hazırlanarak kayıtlı e-posta adresinize iletildi.', 'Teşekkürler, rapor elimize ulaştı.');
  closed(1033, C.marmara, 'Ağustos PUE raporunda eksik gün', 'Low', 9,
    'Ağustos ayı PUE raporunda 14 Ağustos verisi görünmüyor.',
    'İlgili gün sayaç verisi yeniden işlendi; güncel rapor portalda yayınlandı.', 'Kontrol ettik, sorun giderilmiş.');
  closed(1031, C.ege, 'Sunucu teslimatı kabulü (2 adet 2U)', 'Low', 12,
    'Perşembe günü kargo ile 2 adet 2U sunucu teslimatı yapılacak, kabul ve depolama rica ederiz.',
    'Teslimat alındı ve müşteri depo alanına kaydedildi. Kurulum için randevu oluşturabilirsiniz.', 'Teşekkürler.');
  closed(1028, C.anadolu, 'Uzaktan el (remote hands) — sunucu yeniden başlatma', 'Medium', 15,
    '1BG41 kabinimizde U24 konumundaki sunucunun güç düğmesiyle yeniden başlatılmasını talep ediyoruz.',
    'Sunucu 14:20\'de yeniden başlatıldı; ön panel durum ışıkları normal.', 'Sunucu erişime açıldı, teşekkürler.');
  closed(1025, C.baskent, 'Müşteri portalı şifre sıfırlama', 'Low', 19,
    'Portal kullanıcımızın şifresi süresi dolduğu için kilitlendi.',
    'Şifre sıfırlama bağlantısı kayıtlı e-posta adresine gönderildi.', 'Giriş yapabildik.');
  closed(1022, C.delta, 'Kabin içi kablo düzenleme talebi', 'Medium', 24,
    'Kabinimizdeki arka taraf güç kablolarının düzenlenmesini ve etiketlenmesini talep ediyoruz.',
    'Kablolama düzenlendi ve A/B besleme etiketleri yenilendi. Fotoğraflar e-posta ile iletildi.', 'Elinize sağlık.');
  closed(1019, C.kuzey, 'Planlı UPS bakımı hakkında bilgi', 'Medium', 31,
    'Duyurulan planlı UPS bakımı sırasında kabinlerimizde kesinti yaşanacak mı?',
    'Bakım sırasında yükler B hattına aktarılacak; çift beslemeli cihazlarınızda kesinti beklenmemektedir.', 'Bilgi için teşekkürler.');
  closed(1016, C.marmara, 'Yeni rack PDU çıkış ataması', 'Medium', 38,
    'Yeni gelen sunucumuz için PDU-A ve PDU-B üzerinde birer çıkış ataması talep ediyoruz.',
    'PDU-A ve PDU-B üzerinde 12 numaralı çıkışlar tahsis edildi.', 'Teşekkürler, kurulum tamamlandı.');

  // Backend sırası: en yeni talep en üstte
  list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  // Yönetici yanıtından sonra gelen müşteri dönüşleri (10 sn'lik sessiz yoklamada teslim edilir)
  const followUps = {
    1047: { sender_name: C.kuzey.contact, message: 'Hızlı dönüşünüz için teşekkürler. Olay raporu hazır olduğunda noc.kuzeyenerji@example.com adresine de iletebilir misiniz?' },
    1046: { sender_name: C.ege.contact, message: 'Bilgi için teşekkürler, yük taşımayı şimdilik bekletiyoruz. Giriş sıcaklığı 27 °C altına indiğinde haber verebilir misiniz?' },
    1044: { sender_name: C.marmara.contact, message: 'Anlaşıldı, teşekkürler. Faz geri geldiğinde bilgilendirme rica ederiz.' }
  };

  D.tickets = {
    list,
    followUps,
    // Varsayılan yanıtlayan (das.usr_fullname boşsa kaynakta 'Destek Yetkilisi')
    defaultAdmin: 'Destek Yetkilisi'
  };
})();
