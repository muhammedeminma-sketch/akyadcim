/* ==========================================================================
   DCIM Sunum — Ticket Yönetimi mock verisi (DCIM.data.tickets)
   TicketService.getTickets → api.HIS_GetTickets(...) satırlarının karşılığı (Ticket arayüzü):
     tck_id, customer_id, customer_name, email, subject, description, chat_history (JSON dizisi),
     status (OPEN | CLOSED), priority (Low | Medium | High), created_at, updated_at
   Tutarlılık:
     - DCIM.data.site.tickets → { newTickets: 2, newMessages: 1 }
       YENİ TICKET  = OPEN + hiç admin mesajı yok          → #1047 (1DA03), #1046 (1DA07)
       YENİ MESAJ   = OPEN + admin yanıtı var, son mesaj müşteri → #1044 (1NA06)
     - Kabin talepleri kabinin (mock) sahibine yazılır: ownerOf(kod) = DCIM.data.findCabinet(kod).customer;
       POD adı da aynı kayıttan gelir (where(kod) → 'POD-1 / 1DA03'). Kabin dışı talepler sabit müşteriye.
     - Durum olayları: sender_type 'system', event 'closed' | 'reopened' (kapalı talepler + #1036 yeniden açıldı)
     - Olay zamanları sunum senaryosuyla uyumlu (1DA03 alarmı ~11 dk, 1NA06 faz kaybı ~23 dk önce)
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

  // Kabin sahibi (DCIM.data.cabinets[].customer) → müşteri kaydı; kabin talepleri her zaman gerçek sahibine yazılır
  const OWNER = { 'Anadolu Finans A.Ş.': C.anadolu, 'Ege Lojistik': C.ege, 'Kuzey Enerji': C.kuzey, 'Marmara Sigorta': C.marmara, 'Başkent Belediyesi': C.baskent, 'Delta Yazılım': C.delta };
  const cab = code => (D.findCabinet && D.findCabinet(code)) || {};
  const ownerOf = (code, fallback) => OWNER[cab(code).customer] || fallback;
  const where = code => (cab(code).pod ? cab(code).pod + ' / ' : '') + code;
  // Durum olayları (logStatusEvent): sender_type 'system', event closed | reopened — mesaj sayısına girmez
  const sys = (event, who, m) => ({ sender_type: 'system', event, sender_name: who, message: '', timestamp: new Date(ago(m)).toISOString() });

  // ---------------------------------------------------------------------------
  // AÇIK TALEPLER
  // ---------------------------------------------------------------------------
  // YENİ TICKET — 1DA03 yetkisiz kapak açılması (sunum senaryosu)
  const c1047 = ownerOf('1DA03', C.anadolu);
  add(1047, c1047, {
    subject: '1DA03 kabininde yetkisiz kapak açılması',
    priority: 'High',
    created: 8,
    description:
      'Portalda ' + where('1DA03') + ' kabinimizin ön kapağının kart okutulmadan açıldığı bildirimi göründü. ' +
      'Planlı çalışmamız yok; kamera kaydı incelenip olay raporu iletilebilir mi?'
  });
  // YENİ TICKET — 1DA07 yüksek sıcaklık
  const c1046 = ownerOf('1DA07', C.baskent);
  add(1046, c1046, {
    subject: '1DA07 kabininde sunucu giriş sıcaklığı yükseldi',
    priority: 'High',
    created: 3,
    description:
      'Sunucularımızda giriş sıcaklığı son bir saatte 31-33 °C bandına çıktı, fan devirleri arttı. ' +
      where('1DA07') + ' için soğutma çalışması var mı, tahmini süre nedir?'
  });
  // YENİ MESAJ — 1NA06 PDU-B faz kaybı (yönetici yanıtladı, müşteri yeniden yazdı)
  const c1044 = ownerOf('1NA06', C.marmara);
  add(1044, c1044, {
    subject: '1NA06 kabininde B beslemesi kesildi',
    priority: 'High',
    created: 18,
    description:
      where('1NA06') + ' kabinimizdeki sunucularda B güç kaynağı (PSU2) alarmı alıyoruz. B beslemesinde kesinti mi var?',
    chat: [
      adm(ADMIN.ayse,
        'Merhaba, ' + where('1NA06') + ' kabininizdeki PDU-B\'de L2 faz kaybı tespit edildi. ' + woText('1NA06', 'arıza iş emri') +
        ' Enerji & Mekanik Bakım ekibine atandı ve ekip sahada. Cihazlarınız A beslemesi (PDU-A) üzerinden kesintisiz çalışmaya devam ediyor.', 12),
      cust(c1044, 'Teşekkürler. Tek besleme ile çalıştığımız süre boyunca PDU-A yükü sınırı aşar mı? Tahmini çözüm saatini paylaşabilir misiniz?', 4)
    ]
  });
  // UPS A5 akü modu — bilgilendirme yanıtı verilmiş
  add(1043, C.ege, {
    subject: 'UPS akü modu bildirimi hakkında',
    priority: 'Medium',
    created: 35,
    description: 'Portalda Salon 1 UPS A5 için "akü modunda" bildirimi gördük. Kabinlerimiz etkilenir mi, kesinti riski var mı?',
    chat: [
      adm(ADMIN.mehmet,
        'UPS A5 şebeke girişindeki dalgalanma nedeniyle akü moduna geçti; B hattı (UPS B grubu) yükü taşıyabilecek durumda. ' +
        'Çift beslemeli cihazlarınızda kesinti beklenmiyor; gelişmeleri buradan paylaşacağız.', 28)
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
  const c1039 = ownerOf('1DN05', C.baskent);
  add(1039, c1039, {
    subject: '1DN05 kabininde nem uyarısı',
    priority: 'Medium',
    created: 55,
    description: 'Portalda ' + where('1DN05') + ' kabinimiz için nem uyarısı görüyoruz. Cihazlarımız için bir risk var mı?',
    chat: [
      adm(ADMIN.ayse,
        'Kabininizin bulunduğu ' + (cab('1DN05').pod || 'POD') + '\'de nem %62 ölçülüyor (uyarı limiti %60). ' + woText('1DN05', 'kontrol / test iş emri') +
        ' açıldı; klimaların nem alma modu kontrol edilecek. Risk seviyesi düşüktür, gelişmeleri buradan paylaşacağız.', 40)
    ]
  });
  // Kapatılıp müşterinin dönüşüyle yeniden açılan talep (durum olayları)
  add(1036, C.delta, {
    subject: 'Personel kartı tanımlama talebi (2 kişi)',
    priority: 'Low',
    created: 2 * 1440 + 180,
    description: 'Yeni başlayan iki sistem yöneticimiz için Salon 1 kabin erişim kartı tanımlanmasını talep ediyoruz.',
    chat: [
      adm(ADMIN.mehmet, 'Talebiniz alındı. Kimlik fotokopileri ve imzalı yetki formu ulaştığında kart tanımları yapılacaktır.', 2 * 1440 + 90),
      cust(C.delta, 'Formlar bugün e-posta ile iletildi.', 1440 + 300),
      adm(ADMIN.deniz, 'Formlar teslim alındı. Kartlar yarın 10:00\'da güvenlik biriminden kimlik ibrazı ile teslim alınabilir.', 1440 + 120),
      sys('closed', ADMIN.deniz, 1440 + 110),
      cust(C.delta, 'Kartlardan biri Salon 1 turnikesinde tanınmıyor, kontrol edebilir misiniz?', 300),
      sys('reopened', ADMIN.mehmet, 240),
      adm(ADMIN.mehmet, 'Kart erişim grubu eksik tanımlanmış; düzeltildi. Yeniden dener misiniz?', 235)
    ]
  });
  const c1034 = ownerOf('1DC06', C.kuzey);
  add(1034, c1034, {
    subject: 'Kabin kapak kilidi için ek kullanıcı yetkisi',
    priority: 'Low',
    created: 3 * 1440 + 60,
    description: 'Gece vardiyasındaki iki teknisyenimiz için ' + where('1DC06') + ' kapak kilidi yetkisi tanımlanmasını rica ederiz.',
    chat: [
      adm(ADMIN.deniz, 'Yetki talebi Kilit Yetkilendirme ekranında oluşturuldu; onay sonrası kartlarınız 22:00-06:00 aralığında geçerli olacak.', 3 * 1440)
    ]
  });

  // ---------------------------------------------------------------------------
  // KAPALI TALEPLER
  // ---------------------------------------------------------------------------
  const closed = (id, c, subject, priority, days, description, reply, thanks) => {
    const created = days * 1440 + ((id * 37) % 420); // gün içinde farklı saatler
    const closedAgo = created - 1440 * 0.8;
    add(id, c, {
      status: 'CLOSED', subject, priority, created, description, closedAgo,
      chat: [adm(ADMIN.mehmet, reply, created - 90), cust(c, thanks, created - 60), sys('closed', ADMIN.mehmet, closedAgo)]
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
  closed(1028, ownerOf('1DC06', C.kuzey), 'Uzaktan el (remote hands) — sunucu yeniden başlatma', 'Medium', 15,
    where('1DC06') + ' kabinimizde U24 konumundaki sunucunun güç düğmesiyle yeniden başlatılmasını talep ediyoruz.',
    'Sunucu 14:20\'de yeniden başlatıldı; ön panel durum ışıkları normal.', 'Sunucu erişime açıldı, teşekkürler.');
  closed(1025, C.baskent, 'Müşteri portalı şifre sıfırlama', 'Low', 19,
    'Portal kullanıcımızın şifresi süresi dolduğu için kilitlendi.',
    'Şifre sıfırlama bağlantısı kayıtlı e-posta adresine gönderildi.', 'Giriş yapabildik.');
  closed(1022, C.delta, 'Kabin içi kablo düzenleme talebi', 'Medium', 24,
    'Kabinimizdeki arka taraf güç kablolarının düzenlenmesini ve etiketlenmesini talep ediyoruz.',
    'Kablolama düzenlendi ve A/B besleme etiketleri yenilendi. Fotoğraflar e-posta ile iletildi.', 'Elinize sağlık.');
  closed(1019, C.kuzey, 'Planlı UPS bakımı hakkında bilgi', 'High', 31,
    'Duyurulan planlı UPS bakımı sırasında kabinlerimizde kesinti yaşanacak mı?',
    'Bakım sırasında yükler B hattına aktarılacak; çift beslemeli cihazlarınızda kesinti beklenmemektedir.', 'Bilgi için teşekkürler.');
  closed(1016, C.marmara, 'Yeni rack PDU çıkış ataması', 'Medium', 38,
    'Yeni gelen sunucumuz için PDU-A ve PDU-B üzerinde birer çıkış ataması talep ediyoruz.',
    'PDU-A ve PDU-B üzerinde 12 numaralı çıkışlar tahsis edildi.', 'Teşekkürler, kurulum tamamlandı.');
  closed(1012, C.anadolu, 'Kabin soğutma kapasitesi değerlendirmesi', 'High', 46,
    'Yeni GPU sunucularımız için kabin başına 12 kW soğutma kapasitesi uygun mu?',
    'Salon 1 sıcak koridor kapsamasında kabin başına 12 kW desteklenebiliyor; yerleşim önerisi e-posta ile iletildi.', 'Teşekkürler, planlamaya başladık.');

  // Backend sırası: en yeni talep en üstte
  list.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));

  // Yönetici yanıtından sonra gelen müşteri dönüşleri (10 sn'lik sessiz yoklamada teslim edilir)
  const followUps = {
    1047: { sender_name: c1047.contact, message: 'Hızlı dönüşünüz için teşekkürler. Olay raporu hazır olduğunda ' + c1047.email + ' adresine de iletebilir misiniz?' },
    1046: { sender_name: c1046.contact, message: 'Bilgi için teşekkürler, yük taşımayı şimdilik bekletiyoruz. Giriş sıcaklığı 27 °C altına indiğinde haber verebilir misiniz?' },
    1044: { sender_name: c1044.contact, message: 'Anlaşıldı, teşekkürler. Faz geri geldiğinde bilgilendirme rica ederiz.' }
  };

  D.tickets = {
    list,
    followUps,
    // Varsayılan yanıtlayan (das.usr_fullname boşsa kaynakta 'Destek Yetkilisi')
    defaultAdmin: 'Destek Yetkilisi'
  };
})();
