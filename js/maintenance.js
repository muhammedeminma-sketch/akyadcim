/* ==========================================================================
   DCIM Sunum — Bakım Modülü (İzleme › Servis ve Bakım › Bakım Modülü)
   Kaynak: front_end/projects/user-app/src/app/new-ui/pages/engineering/
     maintenance-module   (NewUICMPMaintenanceModuleComponent — kartlar, Bakım Tablosu, sihirbaz)
     maintenance-plans    (NewUICMPMaintenancePlansComponent  — Periyodik Bakım Takvimi)
     maintenance-alarm    (NewUICMPMaintenanceAlarmComponent  — Alarm Bakımları)
   Orijinal rotalar /dcim/engineering/maintenance-module|maintenance-plans|maintenance-alarm; sunumda tek sayfa, ?tab= ile.
   Veri: js/mock/maintenance.data.js (DCIM.data.mntPage). Değişiklikler yalnız bu sayfa açıkken bellekte tutulur;
   Alarm Bakımları ayrıca sessionStorage 'dcim_alarm_maint_v1' kayıtlarını (Tarihsel Alarmlar → "Bakım Aç") okur ve
   tamamlanınca aynı kayda status:'done' (+ doneAt) yazar.

   Derin bağlantılar:
     (parametresiz)                  dört seçim kartı
     ?tab=table                      Bakım Tablosu  [&state=incomplete|completed|unknown|cancelled|all] [&open=<mnt_id | ekipman adı>] [&q=<arama>]
     ?tab=warranty                   Garanti ve Bakım Tarihi Belirleme sihirbazı [&step=2&sel=<asm_id,asm_id>]
     ?tab=plans                      Periyodik Bakım Takvimi [&new=1[&asm=<asm_id>]] [&q=<arama>]
     ?tab=alarm                      Alarm Bakımları [&view=open|done] [&open=<mnt_id | sessionStorage id>]
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, statusBadge, buttonClasses, dialog, toast, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'maintenance' });

  const M = DCIM.data.mntPage;
  const ALARM_KEY = 'dcim_alarm_maint_v1';

  // messages.tr.json → maintenance.* / common.*
  const T = {
    monitoring: 'İzleme',
    title: 'BAKIM MODÜLÜ İŞLEMLERİ',
    viewOnly: 'Mobilde bakım kayıtları yalnızca görüntülenir; ekleme ve düzenleme masaüstünden yapılır.',
    cards: {
      tableTitle: 'Bakım Tablosu', tableDesc: 'Sisteme kayıtlı varlıkların garanti ve bakım planlarını listeleyin, güncelleyin veya filtreleyin.',
      stepperTitle: 'Garanti ve Bakım Tarihi Belirleme', stepperDesc: 'Toplu garanti ve bakım tarihi güncellemeleri veya ileri düzey ayarlar için kullanılan yöneltim ekranı.',
      plansTitle: 'Periyodik Bakım Planları', plansDesc: 'Bakım tarihlerini takip edin; tamamlanan bakımın sonraki tarihini güncelleyin.',
      alarmTitle: 'Alarm Bakımları', alarmDesc: 'Tarihsel alarmlardan açılan bakım kayıtlarını görüntüleyin ve tamamlayın.',
      view: 'Görüntüle'
    },
    common: { back: 'Geri', select: 'Seçiniz', search: 'Ara...', filter: 'Filtre', clear: 'Temizle', refresh: 'Yenile', perPage: 'Sayfa Başına', first: 'İlk Sayfa', last: 'Son Sayfa', previous: 'Önceki', next: 'Sonraki' },
    types: [
      { value: 'Periyodik Bakim', label: 'Periyodik Bakım' }, { value: 'Ariza Onarim', label: 'Arıza Onarım' },
      { value: 'Donanim Degisimi', label: 'Donanım Değişimi' }, { value: 'Yazilim Guncelleme', label: 'Yazılım Güncelleme' },
      { value: 'Kalibrasyon', label: 'Kalibrasyon' }, { value: 'Diger', label: 'Diğer' }
    ],
    priority: { '': '(belirtilmemiş)', LOW: 'Düşük', NORMAL: 'Normal', HIGH: 'Yüksek', URGENT: 'Acil' },
    source: { MANUAL: 'Manuel', PLAN: 'Periyodik plan', FAULT: 'Arıza kuralı', PREDICT: 'Kestirimci öneri', UNKNOWN: 'Bilinmiyor' },
    st: {
      title: 'Garanti ve Bakım Tarihi Belirleme', step1: 'Varlık Seçimi', step2: 'Tarih Bilgileri', step3: 'Tamamlandı',
      selectHeader: 'İşlem Yapılacak Varlıkları Seçiniz', noRecords: 'Kayıt bulunamadı.', selected: 'Seçili: {count}',
      datesHeader: 'Bakım ve Garanti Tarihlerini Belirleyin', datesDesc: 'Seçilen {count} adet varlık için yeni tarihleri giriniz.',
      warranty: 'Garanti Bitiş Tarihi', plan: 'Planlanan Bakım Tarihi', type: 'Bakım Türü', responsible: 'Bakım Yapan Firma/Personel',
      responsiblePh: 'Ad Soyad/Firma', desc: 'Bakım Açıklaması', descPh: 'Notlarınızı buraya yazınız...',
      successTitle: 'İşlem Tamamlandı', successDesc: 'Varlıklar için bakım ve garanti tarihleri başarıyla güncellendi.',
      redirecting: 'Ana ekrana yönlendiriliyorsunuz...', cancel: 'Vazgeç', back: 'Geri', next: 'İleri', complete: 'Kaydetmeyi Tamamla',
      deviceName: 'Cihaz Adı', cabin: 'Kabin', connected: 'Bağlı'
    },
    tb: {
      title: 'BAKIM MODÜLÜ', pending: 'Bekleyen Bakımlar', completed: 'Tamamlanan Bakımlar', unknown: 'Durumu Bilinmeyenler', cancelled: 'İptal Edilenler', all: 'Tümü',
      unknownHint: 'Bu kayıtlar eski modelden gelir; tamamlanma durumları BİLİNMEZ ve ne açık ne tamamlanmış sayılırlar. Her birini açıkça sınıflandırın.',
      cancelledHint: 'İptal edilen bakım açık veya tamamlanmış sayılmaz. Periyodik plandaki aynı vade tüketilmiş kalır; yeni bir dönem için bilinçli plan işlemi gerekir.',
      assetId: 'Asset ID', serialNo: 'Seri Numarası', manufacturer: 'Marka', model: 'Model', cabinName: 'Kabin Adı', warrantyEnd: 'Garanti Bitiş',
      mntPlan: 'Bakım Planı', recordType: 'Kayıt Türü', priority: 'Öncelik', source: 'Kaynak', description: 'Bakım Açıklaması',
      responsible: 'Bakım Yapan Firma/Personel', status: 'Durum', action: 'İşlem',
      state: { OPEN: 'Açık', DONE: 'Tamamlandı', UNKNOWN: 'Durumu bilinmiyor', CANCELLED: 'İptal edildi' },
      phase: { PLANNED: 'Planlandı', STARTED: 'Devam ediyor', DONE: 'Tamamlandı', CANCELLED: 'İptal edildi', UNKNOWN: 'Durumu bilinmiyor' },
      classifyOpen: 'Açık yap', classifyDone: 'Tamamlandı yap', doComplete: 'Tamamla', isCompleted: 'Tamamlandı',
      expired: 'Süresi Doldu', today: 'Bugün', uY: 'y', uM: 'ay', uD: 'g',
      manualMail: 'Manuel E-posta Gönder', select: 'Tümü / Seçiniz',
      wBgn: 'Garanti Başlangıç', wEnd: 'Garanti Bitiş', mBgn: 'Planlanan Başlangıç', mEnd: 'Planlanan Bitiş', noData: 'Gösterilecek veri bulunamadı.'
    },
    due: { title: 'Bakım bildirimi', overdue: 'Geciken bakım', dueSoon: '7 gün içinde', warrantySoon: 'Garanti bitişi 7 gün içinde', showOpen: 'Açık bakımları göster',
      overdueDays: '{n} gün gecikmiş', today: 'bugün', inDays: '{n} gün içinde' },
    panel: {
      title: 'Garanti ve Bakım Düzenleme', subtitle: 'Seçili varlık için bakım ve garanti kayıtlarını güncelleyin.', assetInfo: 'Varlık Bilgileri',
      assetId: 'Asset ID:', serialNo: 'Seri No:', device: 'Cihaz:', cabin: 'Kabin:', cancel: 'Vazgeç', save: 'Kaydet',
      notesLabel: 'Açıklama / Notlar', notesPh: 'İşlem detaylarını buraya yazınız...',
      unknownNotice: 'Bu kaydın durumu bilinmiyor. Düzenlemeden önce listeden "Açık yap" ya da "Tamamlandı yap" ile sınıflandırın.',
      doneNotice: 'Tamamlanmış kayıt düzenlenemez.', cancelledNotice: 'İptal edilmiş kayıt yeniden açılamaz veya düzenlenemez.'
    },
    lc: {
      title: 'Bakım yaşam döngüsü', phase: 'Durum:', responsible: 'Sorumlu:', startedAt: 'Gerçek başlangıç:', doneAt: 'Gerçek tamamlanma:', cancelledAt: 'İptal zamanı:',
      work: 'Yapılan işlem', workPh: 'Gerçekleştirilen bakım işlemini açıklayın…', result: 'Sonuç açıklaması', resultPh: 'Bakımın sonucunu açıklayın…',
      reason: 'İptal gerekçesi', cancelPh: 'İptal gerekçesini yazın…', history: 'İşlem geçmişi', assign: 'Sorumluyu ata/değiştir',
      start: 'Bakımı başlat', complete: 'Sonuçla tamamla', cancel: 'Bakımı iptal et',
      confirmComplete: 'Girilen işlem ve sonuç açıklamalarıyla bakımı tamamlamak istiyor musunuz?',
      confirmCancel: 'Bu açık bakım kaydını verilen gerekçeyle iptal etmek istiyor musunuz? Aynı periyodik dönem otomatik olarak yeniden oluşturulmayacaktır.',
      assigned: 'Sorumlu atandı/değiştirildi.', started: 'Bakım başlatıldı.', completed: 'Bakım tamamlandı.', cancelled: 'Bakım iptal edildi.',
      events: { CREATE: 'Oluşturuldu', CLASSIFY: 'Sınıflandırıldı', ASSIGN: 'Sorumlu değişti', START: 'Başlatıldı', COMPLETE: 'Tamamlandı', CANCEL: 'İptal edildi', UPDATE: 'Güncellendi' }
    },
    alerts: {
      selectAsset: 'Lütfen en az bir varlık seçiniz.', confirmComplete: 'Bu bakım kaydını tamamlamak istediğinize emin misiniz?',
      confirmMail: 'Tarihi yaklaşan varlıklar için e-posta taraması başlatılsın mı?', mailSent: 'E-posta tarama komutu gönderildi. Lütfen kayıtları kontrol ediniz.',
      saveSuccess: 'Başarıyla kaydedildi', completeSuccess: 'Bakım başarıyla tamamlandı.', bulkSaveSuccess: '{count} kayıt başarıyla güncellendi.',
      confirmClassifyOpen: 'Bu kaydın durumu bilinmiyor. AÇIK olarak işaretlensin mi? (Bu işlem geri alınamaz; tamamlanma tarihi yazılmaz.)',
      confirmClassifyDone: 'Bu kaydın durumu bilinmiyor. TAMAMLANMIŞ olarak işaretlensin mi? (Tamamlanma tarihi uydurulmaz, yazılmaz.)',
      classifySuccessOpen: 'Kayıt açık olarak sınıflandırıldı.', classifySuccessDone: 'Kayıt tamamlanmış olarak sınıflandırıldı.',
      requiredFields: 'Lütfen şu zorunlu alanları doldurun: {fields}.'
    },
    cal: {
      title: 'Periyodik Bakım Takvimi', device: 'Cihaz', description: 'Yapılacak bakım', period: 'Tekrar aralığı', next: 'Sonraki bakım tarihi',
      last: 'Son tamamlanma', status: 'Durum', action: 'İşlem', waiting: 'Bekliyor', today: 'Bakım zamanı geldi', overdue: 'Gecikmiş',
      invalid: 'Cihaz, açıklama, geçerli tarih ve tam sayı periyot girin.', new: 'Yeni Periyodik Bakım', edit: 'Bakımı Düzenle',
      inventory: 'Envanter cihazları', search: 'Cihaz ara...', empty: 'Cihaz bulunamadı.', first: 'İlk bakım tarihi', cancel: 'Vazgeç', save: 'Kaydet',
      complete: 'Tamamlandı', confirm: 'Bakımı bugün tamamlandı olarak kaydedip sonraki tarihi hesaplamak istiyor musunuz?',
      saved: 'Bakım planı kaydedildi.', completed: 'Bakım tamamlandı, sonraki tarih güncellendi.',
      unit: { D: 'gün', W: 'hafta', M: 'ay', Y: 'yıl' }
    },
    al: {
      title: 'Alarm Bakımları', complete: 'Tamamlandı',
      confirmDone: 'Bu bakım kaydı tamamlandı olarak işaretlensin mi? Kayıt silinmez; açık listeden kalkar ve yeniden açılamaz.',
      emptyOpen: 'Açık alarm bakımı yok.', emptyDone: 'Tamamlanmış alarm bakımı yok.', emptySearch: 'Aramaya uyan alarm bakımı yok.',
      viewOpen: 'Açık bakımlar', viewDone: 'Tamamlananlar',
      col: { device: 'Cihaz', description: 'Alarm Açıklaması', alarmTime: 'Alarm Zamanı', openedAt: 'Bakım Açılış Zamanı', doneAt: 'Tamamlanma Zamanı', state: 'Durum', actions: 'İşlem' },
      phase: { PLANNED: 'Açık', STARTED: 'Devam ediyor', DONE: 'Tamamlandı', CANCELLED: 'İptal edildi', UNKNOWN: 'Durumu bilinmiyor' },
      detail: { title: 'Alarm Bakımı', open: 'Ayrıntı', close: 'Kapat', source: 'Kaynak (belge / nesne)', openedBy: 'Bakımı açan', doneBy: 'Tamamlayan', doneBanner: 'Bu bakım tamamlanmıştır.', note: 'Not' },
      notFound: 'Bakım kaydı bulunamadı.', completed: 'Bakım kaydı tamamlandı olarak işaretlendi.', sessionBadge: 'Bu oturum'
    }
  };

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------
  const pad = n => String(n).padStart(2, '0');
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const nowStamp = () => { const d = new Date(); return todayKey() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  function parseDay(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const fmtDay = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : '-'; };
  function diffDays(v) {
    const d = parseDay(v);
    if (!d) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / 86400000);
  }
  // maintenance-module getDateClass: geçmiş mor, 0-14 kırmızı, 14-30 turuncu, 30-90 sarı, 90-180 mavi, 180-365 açık yeşil, 365+ yeşil
  function getDateClass(v) {
    const n = diffDays(v);
    if (n == null) return 'text-slate-400';
    if (n < 0) return 'text-[#a855f7] font-bold dark:text-[#c084fc]';
    if (n <= 14) return 'text-rose-500 font-bold dark:text-rose-400';
    if (n <= 30) return 'text-amber-500 font-bold dark:text-amber-400';
    if (n <= 90) return 'text-yellow-500 font-bold dark:text-yellow-400';
    if (n <= 180) return 'text-sky-500 font-bold dark:text-sky-400';
    if (n <= 365) return 'text-emerald-500 font-bold dark:text-emerald-400';
    return 'text-emerald-600 font-bold dark:text-emerald-400';
  }
  function remainingText(v) {
    const n = diffDays(v);
    if (n == null) return '';
    if (n < 0) return '(' + T.tb.expired + ')';
    if (n === 0) return '(' + T.tb.today + ')';
    const y = Math.floor(n / 365), mo = Math.floor((n % 365) / 30), d = (n % 365) % 30;
    const parts = [];
    if (y) parts.push(y + T.tb.uY);
    if (mo) parts.push(mo + T.tb.uM);
    if (d) parts.push(d + T.tb.uD);
    return '(' + parts.join(' ') + ')';
  }
  const dueText = n => n < 0 ? T.due.overdueDays.replace('{n}', -n) : n === 0 ? T.due.today : T.due.inDays.replace('{n}', n);
  const kindLabel = v => (T.types.find(t => t.value === v) || { label: v || '' }).label;
  const lower = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const user = () => { const u = DCIM.session && DCIM.session.user ? DCIM.session.user() : null; return (u && (u.fullname || u.usr)) || 'DCIM Operatör'; };
  // mnt-calendar: sonraki tarih / durum
  function nextCalendarDate(from, n, unit) {
    const d = parseDay(from);
    n = Number(n);
    if (!d || !(n >= 1) || Math.floor(n) !== n) return '';
    if (unit === 'D') d.setDate(d.getDate() + n);
    else if (unit === 'W') d.setDate(d.getDate() + n * 7);
    else if (unit === 'M') d.setMonth(d.getMonth() + n);
    else if (unit === 'Y') d.setFullYear(d.getFullYear() + n);
    else return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function calendarStatus(next) { const n = diffDays(next); return n == null ? 'waiting' : n < 0 ? 'overdue' : n === 0 ? 'today' : 'waiting'; }

  function btn(o) {
    const icon = o.loading ? 'pi pi-spin pi-spinner' : o.icon;
    return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', !o.label && !!icon) + (o.cls ? ' ' + o.cls : '') + '"' +
      (o.act ? ' data-act="' + o.act + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') +
      (o.disabled || o.loading ? ' disabled' : '') + '>' +
      (icon ? '<i class="' + icon + ' text-current shrink-0"></i>' : '') +
      (o.label ? '<span class="truncate">' + esc(o.label) + '</span>' : '') + '</button>';
  }
  const crumbs = extra => [{ label: T.monitoring }, { label: T.title, href: 'maintenance.html' }].concat(extra ? [{ label: extra }] : []);
  const kindOptions = (value, placeholder, disabledPh) =>
    '<option value=""' + (disabledPh ? ' disabled' : '') + (!value ? ' selected' : '') + '>' + esc(placeholder) + '</option>' +
    T.types.map(k => '<option value="' + esc(k.value) + '"' + (k.value === value ? ' selected' : '') + '>' + esc(k.label) + '</option>').join('');
  const prioOptions = value => ['', 'LOW', 'NORMAL', 'HIGH', 'URGENT'].map(p => '<option value="' + p + '"' + (p === (value || '') ? ' selected' : '') + '>' + esc(T.priority[p]) + '</option>').join('');
  const countHtml = (text, n) => esc(text).replace('{count}', '<span class="font-bold text-sky-600 dark:text-sky-400">' + n + '</span>');
  const PERSONNEL = (DCIM.data.personnel || []).map(p => p.name);

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const VIEWS = ['cards', 'table', 'warranty', 'plans', 'alarm'];
  const S = {
    view: VIEWS.indexOf(params.get('tab')) > 0 ? params.get('tab') : 'cards',
    tab: ['incomplete', 'completed', 'unknown', 'cancelled', 'all'].indexOf(params.get('state')) >= 0 ? params.get('state') : 'incomplete',
    alarmView: params.get('view') === 'done' ? 'done' : 'open',
    tbl: {},
    drawer: null,          // { kind:'mnt'|'plan'|'alarm', ... }
    // sihirbaz
    step: 1, sel: new Set(), asmPage: 0, asmRng: 50, asmFilters: {}, bulk: { warr: '', plan: '', kind: '', prio: '', usr: '', notes: '' }, saving: false
  };
  function tbl(key) {
    if (!S.tbl[key]) S.tbl[key] = { search: '', page: 1, pageSize: 50, showFilters: false, filters: {} };
    return S.tbl[key];
  }
  if (params.get('q')) tbl(S.view).search = params.get('q');

  function syncUrl() {
    const p = new URLSearchParams();
    if (S.view !== 'cards') p.set('tab', S.view);
    if (S.view === 'table' && S.tab !== 'incomplete') p.set('state', S.tab);
    if (S.view === 'alarm' && S.alarmView === 'done') p.set('view', 'done');
    const qs = p.toString();
    try { history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// bazı tarayıcılarda */ }
  }

  // ---------------------------------------------------------------------------
  // app-data-table (vanilla): arama, hızlı filtre, sütun filtreleri, sayfalama (varsayılan 50)
  //   cols: [{ field, header, width, minWidth, cell(row) → html, text(row) → arama metni, filter: 'text'|'kind'|'dateRange'|false }]
  // ---------------------------------------------------------------------------
  const fInput = 'w-full px-1.5 py-0.5 text-[11px] bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500';
  function colText(c, r) { return c.text ? c.text(r) : r[c.field]; }
  function applyTable(key, rows, cols) {
    const t = tbl(key);
    const q = lower(t.search).trim();
    let out = rows;
    if (q) out = out.filter(r => cols.some(c => c.field !== 'actions' && lower(colText(c, r)).indexOf(q) >= 0));
    cols.forEach(c => {
      if (!c.filter) return;
      if (c.filter === 'dateRange') {
        const a = t.filters[c.field + '_bgn'], b = t.filters[c.field + '_end'];
        if (a) out = out.filter(r => r[c.field] && r[c.field] >= a);
        if (b) out = out.filter(r => r[c.field] && r[c.field] <= b);
        return;
      }
      const v = t.filters[c.field];
      if (!v) return;
      if (c.filter === 'kind') out = out.filter(r => r[c.field] === v);
      else out = out.filter(r => lower(colText(c, r)).indexOf(lower(v)) >= 0);
    });
    return out;
  }
  function filterCell(key, c) {
    const t = tbl(key);
    if (!c.filter) return '';
    if (c.filter === 'dateRange') {
      return '<div class="flex flex-col gap-1 min-w-[105px]">' +
        '<input type="date" data-dt-f="' + c.field + '_bgn" value="' + esc(t.filters[c.field + '_bgn'] || '') + '" class="' + fInput + '" title="' + esc(c.bgnLabel || '') + '" aria-label="' + esc(c.bgnLabel || '') + '" />' +
        '<input type="date" data-dt-f="' + c.field + '_end" value="' + esc(t.filters[c.field + '_end'] || '') + '" class="' + fInput + '" title="' + esc(c.endLabel || '') + '" aria-label="' + esc(c.endLabel || '') + '" /></div>';
    }
    if (c.filter === 'kind') return '<select data-dt-f="' + c.field + '" class="' + fInput + '" aria-label="' + esc(c.header) + '">' + kindOptions(t.filters[c.field] || '', T.tb.select, false) + '</select>';
    return '<input type="text" data-dt-f="' + c.field + '" data-focus-key="f-' + key + '-' + c.field + '" value="' + esc(t.filters[c.field] || '') + '" placeholder="' + esc(T.common.search) + '" class="' + fInput + '" />';
  }
  const styleOf = c => (c.width ? 'width:' + c.width + ';' : '') + (c.minWidth ? 'min-width:' + c.minWidth + ';' : '');
  function dataTable(key, o) {
    const t = tbl(key);
    const cols = o.cols;
    const all = applyTable(key, o.rows, cols);
    const pages = Math.max(1, Math.ceil(all.length / t.pageSize));
    if (t.page > pages) t.page = pages;
    const slice = all.slice((t.page - 1) * t.pageSize, t.page * t.pageSize);
    const hasFilters = o.filterable !== false && cols.some(c => c.filter);
    const quick = (o.quick || []).map(q =>
      '<button type="button" data-dt-q="' + esc(q.value) + '" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer ' +
      (q.value === o.activeQuick ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700') + '">' + esc(q.label) + '</button>').join('');
    const head = '<tr class="bg-slate-100 dark:bg-surface-base text-slate-800 dark:text-slate-200 font-bold border-b border-slate-200 dark:border-border-subtle select-none">' +
      cols.map(c => '<th class="py-2 px-2 text-left font-bold bg-slate-100 dark:bg-surface-base text-[11px] whitespace-nowrap' + (c.field === 'actions' ? ' text-center' : '') + '" style="' + styleOf(c) + '">' + esc(c.header) + '</th>').join('') + '</tr>' +
      (t.showFilters && hasFilters
        ? '<tr class="bg-slate-50 dark:bg-[#0b121e] border-b border-slate-200 dark:border-slate-800">' + cols.map(c => '<th class="py-1 px-1.5 bg-slate-50 dark:bg-[#0b121e] font-normal align-top" style="' + styleOf(c) + '">' + filterCell(key, c) + '</th>').join('') + '</tr>'
        : '');
    const body = slice.length
      ? slice.map(r => '<tr ' + (o.rowAttr ? o.rowAttr(r) : '') + ' class="hover:bg-slate-50 dark:hover:bg-surface-hover/60 transition-colors cursor-pointer ' + (o.rowClass ? o.rowClass(r) : '') + '">' +
          cols.map(c => '<td class="py-2 px-2 align-middle' + (c.field === 'actions' ? ' text-center' : '') + '" style="' + styleOf(c) + '"' + (c.field === 'actions' ? ' data-stop' : '') + '>' + (c.cell ? c.cell(r) : esc(r[c.field] == null || r[c.field] === '' ? '-' : r[c.field])) + '</td>').join('') + '</tr>').join('')
      : '<tr><td colspan="' + cols.length + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><div class="flex flex-col items-center justify-center py-4"><i class="pi pi-inbox text-2xl text-slate-300 dark:text-slate-700 mb-1"></i><span>' + esc(o.empty || T.tb.noData) + '</span></div></td></tr>';
    const pBtn = (d, dis, icon, title) => '<button type="button" data-dt-page="' + d + '"' + (dis ? ' disabled' : '') + ' title="' + title + '" class="w-7 h-7 rounded-[2px] border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><i class="' + icon + ' text-[10px]"></i></button>';
    return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden w-full" data-dt="' + key + '">' +
      '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="relative w-60 sm:w-72"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
            '<input type="text" data-dt-search data-focus-key="s-' + key + '" value="' + esc(t.search) + '" placeholder="' + esc(o.searchPh || T.common.search) + '" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" /></div>' +
          (quick ? '<div class="flex items-center gap-1">' + quick + '</div>' : '') +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
          '<span class="px-2 py-0.5 text-[10px] font-bold rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0" title="Online"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span><span>Online</span></span>' +
          (o.reportHost ? '<span data-report-host="' + key + '"></span>' : '') +
          (t.showFilters && hasFilters ? '<button type="button" data-dt-clear title="' + T.common.clear + '" class="px-2.5 py-1 text-xs rounded-[2px] border bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center transition-all cursor-pointer"><i class="pi pi-filter-slash text-xs"></i></button>' : '') +
          (hasFilters ? '<button type="button" data-dt-filters class="px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 transition-all cursor-pointer ' +
            (t.showFilters ? 'bg-sky-600 text-white font-bold border-sky-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700') + '"><i class="pi pi-filter text-xs"></i><span>' + T.common.filter + '</span></button>' : '') +
          '<button type="button" data-dt-refresh class="p-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] transition-colors cursor-pointer" title="' + T.common.refresh + '"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="flex-1 min-h-0 overflow-auto w-full custom-scrollbar">' +
        '<table class="scada-table w-full text-left border-collapse text-xs"><thead class="sticky top-0 z-10 shadow-2xs">' + head + '</thead>' +
        '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-xs text-slate-800 dark:text-slate-200">' + body + '</tbody></table>' +
      '</div>' +
      '<div class="py-2 px-3 border-t border-slate-200 dark:border-[#1b263b] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-slate-50 dark:bg-[#0b121e] shrink-0">' +
        '<div class="text-slate-500 dark:text-slate-400 font-medium">Toplam Kayıt: <span class="font-bold text-slate-900 dark:text-slate-100">' + all.length + '</span>' +
          (all.length !== o.rows.length ? ' <span class="text-slate-400">/ ' + o.rows.length + '</span>' : '') + '</div>' +
        '<div class="flex items-center gap-3 self-end sm:self-auto">' +
          '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>' + T.common.perPage + ':</span>' +
            '<select data-dt-size class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
            [10, 25, 50, 100].map(n => '<option value="' + n + '"' + (n === t.pageSize ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
          '<div class="flex items-center gap-1">' +
            pBtn('first', t.page <= 1, 'pi pi-angle-double-left', T.common.first) + pBtn('-1', t.page <= 1, 'pi pi-chevron-left', T.common.previous) +
            '<span class="px-2 font-bold text-slate-800 dark:text-slate-200">' + t.page + ' / ' + pages + '</span>' +
            pBtn('1', t.page >= pages, 'pi pi-chevron-right', T.common.next) + pBtn('last', t.page >= pages, 'pi pi-angle-double-right', T.common.last) +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Görünüm: kartlar
  // ---------------------------------------------------------------------------
  const TONE = {
    sky: ['bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400', 'text-sky-600 dark:text-sky-400'],
    purple: ['bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400', 'text-purple-600 dark:text-purple-400'],
    emerald: ['bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', 'text-emerald-600 dark:text-emerald-400'],
    amber: ['bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400', 'text-amber-600 dark:text-amber-400']
  };
  function optionCard(view, title, desc, icon, tone, extra, wide) {
    return '<a href="maintenance.html?tab=' + view + '" data-go="' + view + '" class="group relative flex flex-col justify-between h-64 p-8 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle hover:bg-slate-50 dark:hover:bg-surface-hover hover:border-sky-500 dark:hover:border-sky-500 transition-all duration-200 cursor-pointer rounded-[2px] shadow-2xs' + (wide ? ' md:col-span-2' : '') + '">' +
      '<div class="flex items-start justify-between">' +
        '<div class="space-y-4">' +
          '<h3 class="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">' + esc(title) + '</h3>' +
          '<p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">' + esc(desc) + '</p>' +
          (extra || '') +
        '</div>' +
        '<div class="w-16 h-16 rounded-[2px] ' + TONE[tone][0] + ' flex items-center justify-center group-hover:scale-105 transition-transform shrink-0"><i class="' + icon + ' text-3xl"></i></div>' +
      '</div>' +
      '<div class="flex items-center text-sm font-semibold ' + TONE[tone][1] + ' gap-1.5 select-none"><span>' + esc(T.cards.view) + '</span><i class="pi pi-arrow-right text-xs"></i></div>' +
    '</a>';
  }
  function renderCards() {
    // Sunum: kartların altına küçük sayaç çipleri (orijinal kartlarda yok; tıklanabilir alanı değiştirmez)
    const open = M.records.filter(r => r.mnt_state === 'OPEN').length;
    const overduePlans = M.plans.filter(p => p.state === 'A' && calendarStatus(p.next_due) === 'overdue').length;
    const openAlarm = alarmRows().filter(a => a.phase !== 'DONE' && a.phase !== 'CANCELLED').length;
    const chip = (txt, cls) => '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-[2px] border ' + cls + '">' + txt + '</span>';
    return '<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar"><div class="p-4 space-y-6">' +
      kit.pageHeader({ title: T.title, breadcrumbs: [{ label: T.monitoring }, { label: T.title }] }) +
      '<div class="flex justify-center items-center py-16">' +
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl w-full px-4">' +
          optionCard('table', T.cards.tableTitle, T.cards.tableDesc, 'pi pi-table', 'sky', chip(open + ' açık bakım', 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30')) +
          optionCard('warranty', T.cards.stepperTitle, T.cards.stepperDesc, 'pi pi-calendar-plus', 'purple') +
          optionCard('plans', T.cards.plansTitle, T.cards.plansDesc, 'pi pi-sync', 'emerald',
            overduePlans ? chip('<i class="pi pi-exclamation-triangle text-[9px]"></i>' + overduePlans + ' gecikmiş plan', 'bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30') : '', true) +
          optionCard('alarm', T.cards.alarmTitle, T.cards.alarmDesc, 'pi pi-bell', 'amber',
            chip(openAlarm + ' açık alarm bakımı', 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'), true) +
        '</div>' +
      '</div>' +
    '</div></div>';
  }

  // ---------------------------------------------------------------------------
  // Görünüm: Bakım Tablosu
  // ---------------------------------------------------------------------------
  const TAB_DEF = [
    { id: 'incomplete', label: T.tb.pending, icon: 'pi pi-wrench', state: 'OPEN' },
    { id: 'completed', label: T.tb.completed, icon: 'pi pi-check-circle', state: 'DONE' },
    { id: 'unknown', label: T.tb.unknown, icon: 'pi pi-question-circle', state: 'UNKNOWN' },
    { id: 'cancelled', label: T.tb.cancelled, icon: 'pi pi-ban', state: 'CANCELLED' },
    { id: 'all', label: T.tb.all, icon: 'pi pi-list', state: '' }
  ];
  const counts = () => ({
    open: M.records.filter(r => r.mnt_state === 'OPEN').length,
    done: M.records.filter(r => r.mnt_state === 'DONE').length,
    unknown: M.records.filter(r => r.mnt_state === 'UNKNOWN').length,
    cancelled: M.records.filter(r => r.mnt_state === 'CANCELLED').length,
    total: M.records.length
  });
  function stateBadge(r) {
    if (r.mnt_state === 'DONE') return '<span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">' + T.tb.state.DONE + '</span>';
    if (r.mnt_state === 'OPEN') return '<span class="inline-flex whitespace-nowrap px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800">' + T.tb.phase[r.mnt_phase] + '</span>';
    if (r.mnt_state === 'UNKNOWN') return '<span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700" title="' + esc(T.tb.unknownHint) + '">' + T.tb.state.UNKNOWN + '</span>';
    return '<span class="px-1.5 py-0.5 text-[10px] font-semibold rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">' + T.tb.state.CANCELLED + '</span>';
  }
  const stateText = r => r.mnt_state === 'OPEN' ? T.tb.phase[r.mnt_phase] : T.tb.state[r.mnt_state];
  const dateCell = v => fmtDay(v) !== '-'
    ? '<div class="text-[10px] leading-tight"><div class="' + getDateClass(v) + '">' + fmtDay(v) + '</div><div class="text-slate-400 text-[9px] mt-0.5">' + esc(remainingText(v)) + '</div></div>'
    : '<span class="text-slate-400 text-[10px]">—</span>';
  const PRIO_CLS = { URGENT: 'text-purple-600 dark:text-purple-400 font-bold', HIGH: 'text-rose-600 dark:text-rose-400 font-bold', NORMAL: 'text-slate-700 dark:text-slate-300', LOW: 'text-slate-500 dark:text-slate-400' };
  const MNT_COLS = [
    { field: 'asm_id', header: T.tb.assetId, filter: 'text', cell: r => '<span class="font-mono font-bold">' + esc(r.asm_id) + '</span>' },
    { field: 'asset_serial_no', header: T.tb.serialNo, filter: 'text' },
    { field: 'manufacturer', header: T.tb.manufacturer, filter: 'text' },
    { field: 'model', header: T.tb.model, filter: 'text', cell: r => '<span class="font-semibold">' + esc(r.model || '-') + '</span>' },
    { field: 'cabin_name', header: T.tb.cabinName, filter: 'text' },
    { field: 'tim_warr', header: T.tb.warrantyEnd, filter: 'dateRange', bgnLabel: T.tb.wBgn, endLabel: T.tb.wEnd, cell: r => dateCell(r.tim_warr), text: r => fmtDay(r.tim_warr) },
    { field: 'tim_mnt_plan', header: T.tb.mntPlan, filter: 'dateRange', bgnLabel: T.tb.mBgn, endLabel: T.tb.mEnd, cell: r => dateCell(r.tim_mnt_plan), text: r => fmtDay(r.tim_mnt_plan) },
    { field: 'mnt_kind', header: T.tb.recordType, filter: 'kind', text: r => kindLabel(r.mnt_kind),
      cell: r => r.mnt_kind ? '<span class="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold rounded-[2px] inline-block max-w-full truncate" title="' + esc(kindLabel(r.mnt_kind)) + '">' + esc(kindLabel(r.mnt_kind)) + '</span>' : '<span class="text-slate-400 text-[10px]">—</span>' },
    { field: 'prio', header: T.tb.priority, text: r => r.prio ? T.priority[r.prio] : '', cell: r => r.prio ? '<span class="' + PRIO_CLS[r.prio] + '">' + T.priority[r.prio] + '</span>' : '<span class="text-slate-400">—</span>' },
    { field: 'src', header: T.tb.source, text: r => T.source[r.src || 'UNKNOWN'], cell: r => '<span class="text-[11px] text-slate-600 dark:text-slate-300">' + esc(T.source[r.src || 'UNKNOWN']) + '</span>' },
    { field: 'mnt_notes', header: T.tb.description, filter: 'text', cell: r => '<span class="block max-w-[230px] truncate" title="' + esc(r.mnt_notes) + '">' + esc(r.mnt_notes || '-') + '</span>' },
    { field: 'mnt_usr', header: T.tb.responsible, filter: 'text' },
    { field: 'mnt_state', header: T.tb.status, minWidth: '90px', text: stateText, cell: stateBadge },
    { field: 'actions', header: T.tb.action, minWidth: '150px', cell: r => {
      const id = esc(r.mnt_id);
      let h = '<div class="flex items-center justify-center gap-1.5">' +
        '<button type="button" data-act="mnt-edit" data-id="' + id + '" class="p-1 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 rounded transition-colors cursor-pointer" title="' + esc(T.panel.title) + '"><i class="pi pi-calendar-plus text-xs"></i></button>';
      if (r.mnt_state === 'OPEN') h += btn({ act: 'mnt-complete', attrs: 'data-id="' + id + '"', size: 'sm', label: T.tb.doComplete });
      if (r.mnt_state === 'UNKNOWN') h += btn({ act: 'mnt-classify-open', attrs: 'data-id="' + id + '"', variant: 'secondary', size: 'sm', label: T.tb.classifyOpen }) + btn({ act: 'mnt-classify-done', attrs: 'data-id="' + id + '"', size: 'sm', label: T.tb.classifyDone });
      if (r.mnt_state === 'DONE') h += '<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]"><i class="pi pi-check-circle text-xs"></i><span>' + T.tb.isCompleted + '</span></span>';
      return h + '</div>';
    } }
  ];
  function tabRows() {
    const def = TAB_DEF.find(t => t.id === S.tab);
    return def.state ? M.records.filter(r => r.mnt_state === def.state) : M.records.slice();
  }
  function dueSummary() {
    const open = M.records.filter(r => r.mnt_state === 'OPEN');
    const items = [];
    let overdue = 0, soon = 0, warr = 0;
    open.forEach(r => {
      const n = diffDays(r.tim_mnt_plan);
      if (n != null && n < 0) { overdue++; items.push({ r, n }); } else if (n != null && n <= 7) { soon++; items.push({ r, n }); }
      const w = diffDays(r.tim_warr);
      if (w != null && w >= 0 && w <= 7) warr++;
    });
    items.sort((a, b) => a.n - b.n);
    return { overdue, soon, warr, items: items.slice(0, 4) };
  }
  function renderTable() {
    const c = counts();
    const cnt = { incomplete: c.open, completed: c.done, unknown: c.unknown, cancelled: c.cancelled, all: c.total };
    const tabBtn = d => {
      if ((d.id === 'unknown' || d.id === 'cancelled') && !cnt[d.id] && S.tab !== d.id) return '';
      const on = S.tab === d.id;
      const cls = on
        ? (d.id === 'unknown' ? 'bg-amber-600 text-white font-bold shadow-xs' : d.id === 'cancelled' ? 'bg-slate-600 text-white font-bold shadow-xs' : 'bg-sky-600 text-white font-bold shadow-xs')
        : (d.id === 'unknown' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 font-medium'
          : d.id === 'cancelled' ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-medium'
          : 'bg-white dark:bg-surface-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-border-subtle font-medium');
      return '<button type="button" data-act="tab" data-tab="' + d.id + '" class="px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer ' + cls + '"' + (d.id === 'unknown' ? ' title="' + esc(T.tb.unknownHint) + '"' : '') + '>' +
        '<i class="' + d.icon + ' text-xs"></i><span>' + esc(d.label) + '</span>' +
        '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] bg-slate-100 dark:bg-surface-base text-slate-700 dark:text-slate-300 font-bold">' + cnt[d.id] + '</span></button>';
    };
    const due = dueSummary();
    const banner = due.overdue || due.soon || due.warr
      ? '<div role="status" class="shrink-0 px-3 py-2 text-[11px] rounded-[2px] border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300">' +
          '<div class="flex flex-wrap items-center gap-x-4 gap-y-1"><strong>' + T.due.title + '</strong>' +
            (due.overdue ? '<span>' + T.due.overdue + ': <b>' + due.overdue + '</b></span>' : '') +
            (due.soon ? '<span>' + T.due.dueSoon + ': <b>' + due.soon + '</b></span>' : '') +
            (due.warr ? '<span>' + T.due.warrantySoon + ': <b>' + due.warr + '</b></span>' : '') +
            '<button type="button" data-act="tab" data-tab="incomplete" class="underline font-semibold cursor-pointer">' + T.due.showOpen + '</button></div>' +
          (due.items.length ? '<ul class="mt-1 list-disc pl-5">' + due.items.map(it => '<li>' + esc((it.r.manufacturer + ' ' + it.r.model).trim()) + ' — ' + fmtDay(it.r.tim_mnt_plan) + ' (' + esc(dueText(it.n)) + ') · ' + esc(T.tb.phase[it.r.mnt_phase]) + '</li>').join('') + '</ul>' : '') +
        '</div>'
      : '';
    const hint = S.tab === 'unknown'
      ? '<div class="shrink-0 px-3 py-2 text-[11px] rounded-[2px] border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">' + esc(T.tb.unknownHint) + '</div>'
      : S.tab === 'cancelled'
        ? '<div class="shrink-0 px-3 py-2 text-[11px] rounded-[2px] border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">' + esc(T.tb.cancelledHint) + '</div>'
        : '';
    return '<div class="h-full w-full min-w-0 flex flex-col min-h-0 gap-3 overflow-hidden">' +
      '<div class="shrink-0">' + kit.pageHeader({ title: T.tb.title, breadcrumbs: crumbs(T.tb.title), actions:
        '<div class="flex items-center gap-3">' + btn({ act: 'go-cards', variant: 'secondary', icon: 'pi pi-chevron-left', label: T.common.back }) +
        '<span data-report-host="mnt-header"></span>' +
        btn({ act: 'mail', variant: 'secondary', icon: 'pi pi-envelope', label: T.tb.manualMail }) + '</div>' }) + '</div>' +
      '<div class="shrink-0 flex items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-2"><div class="flex flex-wrap items-center gap-2">' + TAB_DEF.map(tabBtn).join('') + '</div></div>' +
      hint + banner +
      dataTable('table', { cols: MNT_COLS, rows: tabRows(), rowAttr: r => 'data-row="mnt" data-id="' + esc(r.mnt_id) + '"',
        rowClass: r => S.drawer && S.drawer.kind === 'mnt' && S.drawer.id === r.mnt_id ? 'bg-sky-500/5' : '' }) +
    '</div>';
  }

  // Bakım düzenleme çekmecesi (app-drawer)
  function drawerShell(o) {
    return '<div data-drawer-backdrop class="fixed inset-0 z-50 overflow-hidden bg-slate-950/75 transition-opacity animate-fade-in">' +
      '<div class="fixed inset-y-0 right-0 max-w-full flex pl-8">' +
        '<div data-drawer-panel class="w-screen max-w-xl bg-white dark:bg-surface-card border-l border-slate-200 dark:border-border-subtle shadow-xl flex flex-col justify-between">' +
          '<div class="p-3 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base">' +
            '<div><h2 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">' + (o.icon ? '<i class="' + o.icon + ' text-sky-600 dark:text-sky-400 text-sm"></i>' : '') + esc(o.title) + '</h2>' +
              (o.subtitle ? '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(o.subtitle) + '</p>' : '') + '</div>' +
            '<button type="button" data-act="drawer-close" class="w-7 h-7 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"><i class="pi pi-times text-xs"></i></button>' +
          '</div>' +
          '<div class="p-4 overflow-y-auto flex-1 text-xs text-slate-800 dark:text-slate-200 custom-scrollbar">' + o.body + '</div>' +
          '<div class="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-base flex justify-end gap-2"><div class="flex items-center gap-2">' + o.footer + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  const findMnt = id => M.records.find(r => r.mnt_id === String(id)) || null;
  function renderMntDrawer() {
    const d = S.drawer;
    const r = findMnt(d.id);
    if (!r) return '';
    const locked = r.mnt_state !== 'OPEN';
    const ro = locked ? ' disabled' : '';
    const t = d.temp;
    const notice = locked
      ? '<div class="p-2 text-[11px] rounded-[2px] border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300">' +
          esc(r.mnt_state === 'UNKNOWN' ? T.panel.unknownNotice : r.mnt_state === 'CANCELLED' ? T.panel.cancelledNotice : T.panel.doneNotice) + '</div>'
      : '';
    const line = (k, v, wide) => '<p' + (wide ? ' class="col-span-2"' : '') + '><span class="text-slate-400">' + esc(k) + '</span> ' + v + '</p>';
    const lifecycle = '<section class="space-y-3 border-t border-slate-200 dark:border-border-subtle pt-3">' +
      '<h4 class="font-bold text-slate-800 dark:text-slate-100">' + T.lc.title + '</h4>' +
      '<div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">' +
        line(T.lc.phase, esc(T.tb.phase[r.mnt_phase])) + line(T.lc.responsible, esc(r.mnt_usr || '—')) +
        line(T.tb.source + ':', esc(T.source[r.src || 'UNKNOWN']) + (r.src_ref ? ' (' + esc(r.src_ref) + ')' : '') + (r.plan_id ? ' · Plan filtresi #' + esc(r.plan_id) : '')) +
        line(T.tb.priority + ':', esc(r.prio ? T.priority[r.prio] : '—')) +
        line(T.lc.startedAt, esc(r.started_at || '—')) + line(T.lc.doneAt, esc(r.done_at || '—')) +
        (r.cancel_at ? line(T.lc.cancelledAt, esc(r.cancel_at), true) : '') +
        (r.work_note ? line(T.lc.work + ':', esc(r.work_note), true) : '') +
        (r.result_note ? line(T.lc.result + ':', esc(r.result_note), true) : '') +
        (r.cancel_note ? line(T.lc.reason + ':', esc(r.cancel_note), true) : '') +
      '</div>' +
      (r.mnt_state === 'OPEN'
        ? '<div class="space-y-2">' +
            (r.mnt_phase === 'PLANNED' ? '<button type="button" data-act="lc-start" class="px-2 py-1 text-[11px] font-semibold rounded-[2px] bg-sky-600 text-white cursor-pointer">' + T.lc.start + '</button>' : '') +
            kit.formField({ label: T.lc.work, icon: 'pi pi-wrench', control: '<textarea data-tmp="work" rows="2" maxlength="1000" class="scada-textarea" placeholder="' + esc(T.lc.workPh) + '">' + esc(t.work) + '</textarea>' }) +
            kit.formField({ label: T.lc.result, icon: 'pi pi-check-circle', control: '<textarea data-tmp="result" rows="2" maxlength="1000" class="scada-textarea" placeholder="' + esc(T.lc.resultPh) + '">' + esc(t.result) + '</textarea>' }) +
            '<button type="button" data-act="lc-complete" class="px-2 py-1 text-[11px] font-semibold rounded-[2px] bg-emerald-600 text-white disabled:opacity-50 cursor-pointer"' + (t.work.trim() && t.result.trim() ? '' : ' disabled') + '>' + T.lc.complete + '</button>' +
            kit.formField({ label: T.lc.reason, icon: 'pi pi-ban', control: '<textarea data-tmp="reason" rows="2" maxlength="1000" class="scada-textarea" placeholder="' + esc(T.lc.cancelPh) + '">' + esc(t.reason) + '</textarea>' }) +
            '<button type="button" data-act="lc-cancel" class="px-2 py-1 text-[11px] font-semibold rounded-[2px] bg-slate-600 text-white disabled:opacity-50 cursor-pointer"' + (t.reason.trim() ? '' : ' disabled') + '>' + T.lc.cancel + '</button>' +
          '</div>'
        : '') +
      (r.history.length
        ? '<div class="space-y-2"><h5 class="font-semibold text-slate-700 dark:text-slate-200">' + T.lc.history + '</h5><ol class="space-y-2">' +
            r.history.map(e => '<li class="border-l-2 border-sky-300 dark:border-sky-700 pl-2 text-[10px]">' +
              '<div class="font-semibold">' + esc(T.lc.events[e.evt_typ] || e.evt_typ) + ' · ' + esc(e.evt_at) + '</div>' +
              '<div>' + esc(e.actor || '') + (e.from_state ? ' · ' + esc(T.tb.phase[e.from_state] || e.from_state) + ' → ' : ' · ') + esc(T.tb.phase[e.to_state] || e.to_state) + '</div>' +
              (e.old_val || e.new_val ? '<div>' + esc(e.old_val || '—') + ' → ' + esc(e.new_val || '—') + '</div>' : '') +
              (e.note ? '<div>' + esc(e.note) + '</div>' : '') + (e.note2 ? '<div>' + esc(e.note2) + '</div>' : '') +
            '</li>').join('') + '</ol></div>'
        : '') +
    '</section>';
    const body = '<div class="space-y-4 text-xs">' +
      '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] space-y-1.5">' +
        '<p class="font-bold text-sky-600 dark:text-sky-400 text-xs">' + T.panel.assetInfo + '</p>' +
        '<div class="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">' +
          line(T.panel.assetId, esc(r.asm_id)) + line(T.panel.serialNo, esc(r.asset_serial_no || '-')) +
          line(T.panel.device, esc(r.manufacturer + ' ' + r.model), true) + (r.cabin_name ? line(T.panel.cabin, esc(r.cabin_name), true) : '') +
        '</div></div>' +
      '<hr class="border-slate-100 dark:border-border-subtle my-2" />' + notice +
      kit.formField({ label: T.st.warranty, icon: 'pi pi-calendar', control: '<input type="date" data-tmp="warr" value="' + esc(t.warr) + '"' + ro + ' class="scada-input ' + getDateClass(t.warr) + '" />' }) +
      kit.formField({ label: T.st.plan, icon: 'pi pi-calendar', control: '<input type="date" data-tmp="plan" value="' + esc(t.plan) + '"' + ro + ' class="scada-input ' + getDateClass(t.plan) + '" />' }) +
      kit.formField({ label: T.tb.recordType, icon: 'pi pi-cog', control: '<select data-tmp="kind"' + ro + ' class="scada-select">' + kindOptions(t.kind, T.common.select, true) + '</select>' }) +
      kit.formField({ label: T.tb.priority, icon: 'pi pi-flag', control: '<select data-tmp="prio"' + ro + ' class="scada-select">' + prioOptions(t.prio) + '</select>' }) +
      kit.formField({ label: T.st.responsible, icon: 'pi pi-user', control: '<input type="text" data-tmp="usr" value="' + esc(t.usr) + '"' + ro + ' maxlength="100" placeholder="' + esc(T.st.responsiblePh) + '" class="scada-input" list="mnt-personnel" />' +
        '<button type="button" data-act="lc-assign" class="mt-2 px-2 py-1 text-[11px] font-semibold rounded-[2px] bg-sky-600 text-white disabled:opacity-50 cursor-pointer"' + (locked || !t.usr.trim() ? ' disabled' : '') + '>' + T.lc.assign + '</button>' }) +
      kit.formField({ label: T.st.desc, icon: 'pi pi-file-edit', control:
        '<div class="flex justify-between items-center mb-1 text-[10px] text-slate-400"><span>' + T.panel.notesLabel + '</span><span data-count="notes" class="text-rose-500 font-bold' + (t.notes.length >= 200 ? '' : ' hidden') + '">' + t.notes.length + '/200</span></div>' +
        '<textarea data-tmp="notes"' + ro + ' rows="4" class="scada-textarea" placeholder="' + esc(T.panel.notesPh) + '" maxlength="200">' + esc(t.notes) + '</textarea>' }) +
      lifecycle +
    '</div>';
    return drawerShell({ title: T.panel.title, subtitle: T.panel.subtitle, icon: 'pi pi-cog', body,
      footer: btn({ act: 'drawer-close', variant: 'secondary', size: 'sm', label: T.panel.cancel }) + (!locked ? btn({ act: 'mnt-save', size: 'sm', label: T.panel.save }) : '') });
  }
  function openMnt(id) {
    const r = findMnt(id);
    if (!r) return;
    S.drawer = { kind: 'mnt', id: r.mnt_id, temp: { warr: r.tim_warr || '', plan: r.tim_mnt_plan || '', kind: r.mnt_kind || '', prio: r.prio || '', usr: r.mnt_usr || '', notes: r.mnt_notes || '', work: '', result: '', reason: '' } };
    render();
  }
  function addEvent(r, e) { r.history.unshift(Object.assign({ evt_at: nowStamp(), actor: user() }, e)); }
  function completeRecord(r, work, result) {
    const from = r.mnt_phase;
    Object.assign(r, { mnt_state: 'DONE', mnt_phase: 'DONE', done_at: nowStamp(), work_note: work || r.work_note, result_note: result || r.result_note });
    addEvent(r, { evt_typ: 'COMPLETE', from_state: from, to_state: 'DONE', note: work || '', note2: result || '' });
  }

  // ---------------------------------------------------------------------------
  // Görünüm: sihirbaz (Garanti ve Bakım Tarihi Belirleme)
  // ---------------------------------------------------------------------------
  const ASM_FILTERS = [{ key: 'asset_id' }, { key: 'asset_serial_no' }, { key: 'model' }, { key: 'name' }, { key: 'cabin_name' }];
  function asmFiltered() {
    let rows = M.assets;
    ASM_FILTERS.forEach(f => {
      const v = lower(S.asmFilters[f.key] || '').trim();
      if (v) rows = rows.filter(a => lower(a[f.key]).indexOf(v) >= 0);
    });
    return rows;
  }
  function stepIndicator(n, label) {
    const s = S.step;
    let box, txt;
    if (n === 3) {
      box = s === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
      txt = s === 3 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400';
    } else {
      box = s === n ? 'bg-sky-600 text-white' : (s > n ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400');
      txt = s === n ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400';
    }
    return '<div class="flex items-center gap-2"><div class="w-6 h-6 rounded-[2px] flex items-center justify-center text-xs font-bold transition-colors ' + box + '">' +
      (n < 3 && s > n ? '<i class="pi pi-check text-[10px]"></i>' : '<span>' + n + '</span>') + '</div><span class="text-xs font-bold ' + txt + '">' + esc(label) + '</span></div>';
  }
  function renderStep1() {
    const list = asmFiltered();
    const total = Math.max(1, Math.ceil(list.length / S.asmRng));
    if (S.asmPage >= total) S.asmPage = total - 1;
    const page = list.slice(S.asmPage * S.asmRng, (S.asmPage + 1) * S.asmRng);
    const allOn = page.length > 0 && page.every(a => S.sel.has(a.asm_id));
    const atStart = S.asmPage === 0, atEnd = S.asmPage + 1 >= total;
    const body = page.length
      ? page.map(a => {
          const on = S.sel.has(a.asm_id);
          return '<tr data-asm-row="' + esc(a.asm_id) + '" class="hover:bg-slate-50 dark:hover:bg-surface-base transition-colors cursor-pointer' + (on ? ' bg-sky-500/5' : '') + '">' +
            '<td class="py-2 px-3 text-center" data-stop><input type="checkbox" data-asm-chk="' + esc(a.asm_id) + '"' + (on ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></td>' +
            '<td class="py-2 px-3">' + esc(a.asset_id) + '</td><td class="py-2 px-3">' + esc(a.asset_serial_no) + '</td>' +
            '<td class="py-2 px-3 font-medium">' + esc(a.model) + '</td><td class="py-2 px-3">' + esc(a.name) + '</td><td class="py-2 px-3">' + esc(a.cabin_name) + '</td></tr>';
        }).join('')
      : '<tr><td colspan="6" class="p-8 text-center text-slate-400 dark:text-slate-500 italic">' + esc(T.st.noRecords) + '</td></tr>';
    return '<div class="space-y-4">' +
      '<div class="flex items-center justify-between border-b border-slate-100 dark:border-border-subtle pb-3">' +
        '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + esc(T.st.selectHeader) + '</h3>' +
        '<div class="flex items-center gap-1">' +
          btn({ act: 'asm-first', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-double-left', title: T.common.first, disabled: atStart }) +
          btn({ act: 'asm-prev', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-left', title: T.common.previous, disabled: atStart }) +
          '<div class="flex items-center gap-1 mx-2"><input type="number" data-asm-page class="scada-input w-12 text-center text-xs py-1" value="' + (S.asmPage + 1) + '" min="1" max="' + total + '" />' +
            '<span class="shrink-0 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">/ ' + total + '</span></div>' +
          btn({ act: 'asm-next', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-right', title: T.common.next, disabled: atEnd }) +
          btn({ act: 'asm-last', variant: 'secondary', size: 'sm', icon: 'pi pi-angle-double-right', title: T.common.last, disabled: atEnd }) +
        '</div>' +
      '</div>' +
      '<div class="overflow-x-auto"><table class="scada-table w-full text-left border-collapse text-xs"><thead>' +
        '<tr class="bg-slate-50 dark:bg-surface-base border-b border-slate-200 dark:border-border-subtle font-bold text-slate-800 dark:text-slate-200">' +
          '<th class="py-2 px-3 w-8 text-center"><input type="checkbox" data-asm-all' + (allOn ? ' checked' : '') + ' class="rounded-[2px] border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-sky-500" /></th>' +
          '<th>' + T.tb.assetId + '</th><th>Seri No</th><th>' + T.tb.model + '</th><th>' + T.st.deviceName + '</th><th>' + T.st.cabin + '</th></tr>' +
        '<tr class="bg-slate-100 dark:bg-surface-panel border-b border-slate-200 dark:border-border-subtle"><th></th>' +
          ASM_FILTERS.map(f => '<th class="p-1"><input type="text" data-af="' + f.key + '" data-focus-key="af-' + f.key + '" value="' + esc(S.asmFilters[f.key] || '') + '" placeholder="' + esc(T.common.search) + '" class="scada-input py-0.5 text-[11px]" /></th>').join('') + '</tr>' +
      '</thead><tbody class="divide-y divide-slate-100 dark:divide-border-subtle text-slate-800 dark:text-slate-200">' + body + '</tbody></table></div>' +
      '<div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-border-subtle text-xs text-slate-500 dark:text-slate-400 font-semibold">' +
        '<div>' + countHtml(T.st.selected, S.sel.size) + ' <span class="text-slate-400 font-normal">· ' + list.length + ' varlık</span></div>' +
        '<div class="flex items-center gap-1.5 font-semibold"><span class="whitespace-nowrap">' + T.common.perPage + ':</span>' +
          '<select data-asm-rng class="bg-white dark:bg-[#080c14] border border-slate-200 dark:border-slate-700 rounded-[2px] px-2 py-0.5 text-slate-800 dark:text-slate-200 text-xs font-bold">' +
          [5, 10, 15, 20, 50, 100].map(n => '<option value="' + n + '"' + (n === S.asmRng ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div>' +
      '</div>' +
    '</div>';
  }
  function renderStep2() {
    const B = S.bulk;
    const one = S.sel.size === 1 ? M.findAsset(Array.from(S.sel)[0]) : null;
    return '<div class="space-y-6">' +
      (one ? '<p class="text-xs text-slate-700 dark:text-slate-200">Ekipman: <b>' + esc(one.name + ' — ' + one.manufacturer + ' ' + one.model) + '</b></p>' : '') +
      '<div class="border-b border-slate-100 dark:border-border-subtle pb-3">' +
        '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + T.st.datesHeader + '</h3>' +
        '<p class="text-xs text-slate-500 dark:text-slate-400 mt-1">' + countHtml(T.st.datesDesc, S.sel.size) + '</p>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' +
        kit.formField({ label: T.st.warranty, icon: 'pi pi-calendar', required: true, control: '<input type="date" data-bulk="warr" value="' + esc(B.warr) + '" class="scada-input" />' }) +
        kit.formField({ label: T.st.plan, icon: 'pi pi-calendar', required: true, control: '<input type="date" data-bulk="plan" value="' + esc(B.plan) + '" class="scada-input" />' }) +
        kit.formField({ label: T.st.type, icon: 'pi pi-cog', required: true, control: '<select data-bulk="kind" class="scada-select">' + kindOptions(B.kind, T.common.select, true) + '</select>' }) +
        kit.formField({ label: T.tb.priority, icon: 'pi pi-flag', control: '<select data-bulk="prio" class="scada-select">' + prioOptions(B.prio) + '</select>' }) +
        kit.formField({ label: T.st.responsible, icon: 'pi pi-user', required: true, control: '<input type="text" data-bulk="usr" data-focus-key="bulk-usr" value="' + esc(B.usr) + '" placeholder="' + esc(T.st.responsiblePh) + '" class="scada-input" list="mnt-personnel" />' }) +
        '<div class="md:col-span-2">' + kit.formField({ label: T.st.desc, icon: 'pi pi-file-edit', control:
          '<div class="flex justify-between items-center mb-1 text-[10px] text-slate-400"><span>' + T.st.descPh + '</span><span data-count="bulk" class="text-rose-500 font-bold' + (B.notes.length >= 200 ? '' : ' hidden') + '">' + B.notes.length + '/200</span></div>' +
          '<textarea data-bulk="notes" rows="3" class="scada-textarea" placeholder="' + esc(T.st.descPh) + '" maxlength="200">' + esc(B.notes) + '</textarea>' }) + '</div>' +
      '</div>' +
    '</div>';
  }
  function renderStep3() {
    return '<div class="py-8 flex flex-col items-center justify-center text-center space-y-4 max-w-sm mx-auto">' +
      '<div class="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 text-2xl font-bold animate-bounce"><i class="pi pi-check text-2xl"></i></div>' +
      '<div class="space-y-1.5"><h3 class="text-base font-bold text-slate-900 dark:text-slate-100">' + T.st.successTitle + '</h3>' +
        '<p class="text-xs text-slate-500 dark:text-slate-400">' + T.st.successDesc + '</p>' +
        '<p class="text-[11px] text-sky-600 dark:text-sky-400 font-semibold animate-pulse pt-2">' + T.st.redirecting + '</p></div>' +
    '</div>';
  }
  function renderStepper() {
    const s = S.step;
    return '<div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar"><div class="p-4 space-y-6">' +
      kit.pageHeader({ title: T.st.title, breadcrumbs: crumbs(T.st.title), actions:
        '<div class="flex items-center gap-2">' +
          '<button type="button" data-act="go-cards" class="h-6 box-border px-2 py-0.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-[2px] text-[11px] flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer" title="' + T.common.back + '"><i class="pi pi-chevron-left text-[10px]"></i><span>' + T.common.back + '</span></button>' +
          statusBadge('active', T.st.connected) + '</div>' }) +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle p-4 rounded-[2px]"><div class="flex items-center justify-between max-w-2xl mx-auto">' +
        stepIndicator(1, T.st.step1) + '<div class="flex-1 h-px bg-slate-200 dark:bg-border-subtle mx-4"></div>' +
        stepIndicator(2, T.st.step2) + '<div class="flex-1 h-px bg-slate-200 dark:bg-border-subtle mx-4"></div>' + stepIndicator(3, T.st.step3) +
      '</div></div>' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle p-6 rounded-[2px]">' + (s === 1 ? renderStep1() : s === 2 ? renderStep2() : renderStep3()) + '</div>' +
      (s < 3
        ? '<div class="flex items-center justify-between border-t border-slate-200 dark:border-border-subtle pt-4">' +
            btn({ act: 'step-prev', variant: 'secondary', label: s === 1 ? T.st.cancel : T.st.back, disabled: S.saving }) +
            btn({ act: 'step-next', label: s === 1 ? T.st.next : T.st.complete, disabled: S.saving, loading: S.saving }) + '</div>'
        : '') +
    '</div></div>';
  }
  function bulkSave() {
    const B = S.bulk;
    const missing = [[B.warr, T.st.warranty], [B.plan, T.st.plan], [B.kind, T.st.type], [B.usr.trim(), T.st.responsible]].filter(x => !x[0]).map(x => x[1]);
    if (missing.length) { toast(T.alerts.requiredFields.replace('{fields}', missing.join(', ')), 'warning'); return; }
    S.saving = true; render();
    setTimeout(() => {
      let n = 0;
      S.sel.forEach(id => {
        const a = M.findAsset(id);
        if (!a) return;
        // api.OPR_mnt_save: varlık başına tek açık kayıt — varsa güncellenir, yoksa eklenir
        let r = M.records.find(x => x.asm_id === a.asm_id && x.mnt_state === 'OPEN');
        if (r) {
          Object.assign(r, { tim_warr: B.warr, tim_mnt_plan: B.plan, mnt_kind: B.kind, prio: B.prio, mnt_usr: B.usr.trim(), mnt_notes: B.notes || r.mnt_notes });
          addEvent(r, { evt_typ: 'UPDATE', from_state: r.mnt_phase, to_state: r.mnt_phase, note: 'Toplu tarih belirleme' });
        } else {
          r = { mnt_id: M.nextMntId(), asm_id: a.asm_id, asset_serial_no: a.asset_serial_no, manufacturer: a.manufacturer, model: a.model, cabin_name: a.cabin_name, name: a.name,
            tim_warr: B.warr, tim_mnt_plan: B.plan, mnt_kind: B.kind, mnt_notes: B.notes || (a.name + ' — ' + kindLabel(B.kind)), mnt_usr: B.usr.trim(), prio: B.prio, src: 'MANUAL', src_ref: '', plan_id: '',
            mnt_state: 'OPEN', mnt_phase: 'PLANNED', started_at: '', done_at: '', cancel_at: '', work_note: '', result_note: '', cancel_note: '', history: [] };
          addEvent(r, { evt_typ: 'CREATE', from_state: '', to_state: 'PLANNED', note: 'Toplu tarih belirleme' });
          M.records.unshift(r);
        }
        n++;
      });
      S.saving = false; S.step = 3;
      toast(T.alerts.bulkSaveSuccess.replace('{count}', n), 'success');
      render();
      setTimeout(() => { if (S.view === 'warranty' && S.step === 3) { resetStepper(); go('cards'); } }, 2000);
    }, 500);
  }
  function resetStepper() { S.step = 1; S.sel = new Set(); S.bulk = { warr: '', plan: '', kind: '', prio: '', usr: '', notes: '' }; }

  // ---------------------------------------------------------------------------
  // Görünüm: Periyodik Bakım Takvimi
  // ---------------------------------------------------------------------------
  function planRow(p) {
    const status = calendarStatus(p.next_due);
    return Object.assign({}, p, {
      period_text: p.period_n + ' ' + T.cal.unit[p.period_unit], next_text: fmtDay(p.next_due), last_text: p.last_done ? fmtDay(p.last_done) : '-',
      status, statusText: T.cal[status], badge: status === 'overdue' ? 'alarm' : status === 'today' ? 'warning' : 'normal'
    });
  }
  const PLAN_COLS = [
    { field: 'device', header: T.cal.device, filter: 'text', minWidth: '220px', cell: r => '<span class="cell-wrap font-medium">' + esc(r.device) + '</span>' },
    { field: 'plan_name', header: T.cal.description, filter: 'text', minWidth: '200px', cell: r => '<span class="cell-wrap">' + esc(r.plan_name) + '</span>' },
    { field: 'period_text', header: T.cal.period, filter: 'text', width: '110px' },
    { field: 'next_text', header: T.cal.next, filter: 'text', width: '150px', cell: r => {
      const n = diffDays(r.next_due);
      return '<div class="leading-tight"><div class="font-mono">' + esc(r.next_text) + '</div>' + (n != null ? '<div class="text-[10px] ' + (n < 0 ? 'text-rose-500 font-bold' : n === 0 ? 'text-amber-500 font-bold' : 'text-slate-400') + '">' + esc(dueText(n)) + '</div>' : '') + '</div>';
    } },
    { field: 'last_text', header: T.cal.last, filter: 'text', width: '120px', cell: r => '<span class="font-mono">' + esc(r.last_text) + '</span>' },
    { field: 'statusText', header: T.cal.status, filter: 'text', width: '150px', cell: r => statusBadge(r.badge, r.statusText) },
    { field: 'actions', header: T.cal.action, width: '120px', cell: r => r.state === 'A' ? btn({ act: 'plan-complete', attrs: 'data-id="' + esc(r.plan_id) + '"', size: 'sm', label: T.cal.complete }) : '' }
  ];
  function renderPlans() {
    const rows = M.plans.map(planRow);
    return '<div class="h-full w-full min-w-0 flex flex-col min-h-0 gap-3 overflow-hidden">' +
      '<div class="shrink-0">' + kit.pageHeader({ title: T.cal.title, breadcrumbs: crumbs(T.cal.title), actions:
        '<div class="flex items-center gap-3">' + btn({ act: 'go-cards', variant: 'secondary', icon: 'pi pi-chevron-left', label: T.common.back }) +
        btn({ act: 'plan-new', icon: 'pi pi-plus', label: T.cal.new }) + '</div>' }) + '</div>' +
      dataTable('plans', { cols: PLAN_COLS, rows, reportHost: true, rowAttr: r => 'data-row="plan" data-id="' + esc(r.plan_id) + '"',
        rowClass: r => r.status === 'overdue' ? 'bg-rose-500/[0.04]' : '' }) +
    '</div>';
  }
  function scadaDevices(src) {
    const floor = src === 'CMR/T01' ? 'T01' : 'T00';
    const list = src === 'CMR/T01'
      ? (DCIM.data.cabinets || []).slice(0, 60).map(c => ({ id: 'K' + c.code + '_PDU_A', desc: 'Kabin ' + c.code + ' PDU-A' }))
      : [].concat(DCIM.data.ups || [], DCIM.data.climates || [], DCIM.data.panels || []).map(e => ({ id: 'KAT1_' + e.label.replace(/\s+/g, '_').toUpperCase(), desc: e.label }));
    return list.map(d => Object.assign(d, { doc: 'CMR/' + floor }));
  }
  function deviceResults(d) {
    const q = lower(d.q).trim();
    if (q.length < 2 || d.selectedLabel) return null;
    if (d.source === 'ASM') return M.assets.filter(a => (lower(a.asm_id) + ' ' + lower(a.name) + ' ' + lower(a.asset_id) + ' ' + lower(a.manufacturer) + ' ' + lower(a.model) + ' ' + lower(a.cabin_name)).indexOf(q) >= 0);
    return scadaDevices(d.source).filter(x => (lower(x.id) + ' ' + lower(x.desc)).indexOf(q) >= 0);
  }
  function renderPlanDrawer() {
    const d = S.drawer;
    const f = d.form;
    let picker = '';
    if (!d.editing) {
      const res = deviceResults(d);
      const page = res ? res.slice(d.ofs, d.ofs + 10) : [];
      picker = '<select data-pf="source" class="scada-select">' +
          [['ASM', T.cal.inventory], ['CMR/T00', 'SCADA — T00'], ['CMR/T01', 'SCADA — T01']].map(o => '<option value="' + o[0] + '"' + (o[0] === d.source ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
        '<div class="relative mt-2"><input type="search" data-pf="q" data-focus-key="plan-q" value="' + esc(d.q) + '" maxlength="60" class="scada-input" placeholder="' + esc(T.cal.search) + '" autocomplete="off" />' +
          (res
            ? '<div class="absolute left-0 right-0 top-full z-20 mt-1 rounded border border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card shadow-lg"><ul class="max-h-48 overflow-auto">' +
                (page.length ? page.map((x, i) => '<li><button type="button" data-act="plan-pick" data-i="' + (d.ofs + i) + '" class="w-full text-left px-3 py-2 hover:bg-slate-100 dark:hover:bg-surface-hover cursor-pointer">' +
                  esc(d.source === 'ASM' ? '[' + x.asm_id + '] ' + x.name + ' ' + x.manufacturer + ' ' + x.model : x.id + ' — ' + x.desc) + '</button></li>').join('')
                  : '<li class="px-3 py-2 text-slate-500">' + T.cal.empty + '</li>') + '</ul>' +
                (res.length > 10 ? '<div class="flex items-center justify-between px-3 py-2 border-t border-slate-200 dark:border-border-subtle">' +
                  '<button type="button" data-act="plan-dpage" data-d="-1"' + (d.ofs ? '' : ' disabled') + ' class="disabled:opacity-40 cursor-pointer">Önceki</button>' +
                  '<button type="button" data-act="plan-dpage" data-d="1"' + (d.ofs + 10 < res.length ? '' : ' disabled') + ' class="disabled:opacity-40 cursor-pointer">Sonraki</button></div>' : '') +
              '</div>'
            : '') +
        '</div>';
    } else picker = '<p class="text-slate-600 dark:text-slate-300">' + esc(d.selectedLabel) + '</p>';
    const body = '<div class="space-y-4 text-xs">' +
      kit.formField({ label: T.cal.device, required: true, control: picker }) +
      kit.formField({ label: T.cal.description, required: true, control: '<input type="text" maxlength="250" data-pf="plan_name" data-focus-key="plan-name" value="' + esc(f.plan_name) + '" class="scada-input" />' }) +
      kit.formField({ label: T.cal.period, required: true, control: '<div class="grid grid-cols-2 gap-3"><input type="number" min="1" step="1" data-pf="period_n" value="' + esc(f.period_n) + '" class="scada-input" />' +
        '<select data-pf="period_unit" class="scada-select">' + ['D', 'W', 'M', 'Y'].map(u => '<option value="' + u + '"' + (u === f.period_unit ? ' selected' : '') + '>' + T.cal.unit[u] + '</option>').join('') + '</select></div>' }) +
      kit.formField({ label: d.editing ? T.cal.next : T.cal.first, required: true, control: '<input type="date" data-pf="next_due" value="' + esc(f.next_due) + '" class="scada-input" />' }) +
    '</div>';
    return drawerShell({ title: d.editing ? T.cal.edit : T.cal.new, body,
      footer: btn({ act: 'drawer-close', variant: 'secondary', size: 'sm', label: T.cal.cancel }) + btn({ act: 'plan-save', size: 'sm', label: T.cal.save }) });
  }
  function openPlan(p) {
    S.drawer = p
      ? { kind: 'plan', editing: true, id: p.plan_id, selectedLabel: p.device, source: 'ASM', q: '', ofs: 0,
          form: { asm_id: p.asm_id, source_doc: p.source_doc, source_dev: p.source_dev, device: p.device, plan_name: p.plan_name, period_n: p.period_n, period_unit: p.period_unit, next_due: p.next_due } }
      : { kind: 'plan', editing: false, source: 'ASM', q: '', ofs: 0, selectedLabel: '',
          form: { asm_id: '', source_doc: '', source_dev: '', device: '', plan_name: '', period_n: 1, period_unit: 'M', next_due: '' } };
    render();
  }

  // ---------------------------------------------------------------------------
  // Görünüm: Alarm Bakımları
  // ---------------------------------------------------------------------------
  const fmtAlarmTime = v => { const d = new Date(v); return isNaN(d.getTime()) ? (v || '-') : d.toLocaleDateString('tr-TR') + ' ' + d.toLocaleTimeString('tr-TR'); };
  const fmtServerTime = v => { const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(v || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] + ' ' + m[4] : (v || '-'); };
  const isoToServer = v => { const d = new Date(v); return isNaN(d.getTime()) ? String(v || '') : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  function readSession() {
    try { const v = JSON.parse(sessionStorage.getItem(ALARM_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeSessionDone(id) {
    try {
      const list = readSession();
      const it = list.find(x => String(x.id) === String(id));
      if (!it) return;
      it.status = 'done';
      it.doneAt = new Date().toISOString();
      sessionStorage.setItem(ALARM_KEY, JSON.stringify(list));
    } catch (e) { /* sessionStorage kullanılamıyor */ }
  }
  // sessionStorage kaydı → alarm bakımı satırı: [{id, alarmRid, desc, target, opened, note, status}]
  function fromSession(s) {
    const h = (DCIM.data.historicalAlarms || []).find(x => x.rid === s.alarmRid || x.id === s.alarmRid) || null;
    const done = /^(done|completed|tamamland)/i.test(String(s.status || ''));
    return {
      mnt_id: String(s.id), doc: /^KAT|^DCA|^POD/.test(String(s.alarmRid || '')) ? 'CMR/T01' : 'CMR/T00', rid: s.alarmRid || '', atr: h ? h.fnc : '',
      dev: s.target || (h && h.desc) || s.alarmRid || '-', target: s.target || '', txt: s.desc || (h && h.txt) || '-', note: s.note || '',
      // Alarmlar sayfası tıklanan satırın zamanını alarmTime olarak yazar; aynı rid'li başka bir kayda düşmemek için önce onu kullan
      alm_tim: s.alarmTime ? new Date(s.alarmTime) : h ? h.tim : s.opened, opn_at: isoToServer(s.opened), opn_usr: user(), done_at: done ? isoToServer(s.doneAt || s.opened) : '', done_usr: done ? user() : '',
      phase: done ? 'DONE' : 'PLANNED', src: 'session'
    };
  }
  const alarmLocal = {};   // seed kayıtlarının bu açılıştaki değişiklikleri
  function alarmRows() {
    const sess = readSession().map(fromSession);
    const ids = new Set(sess.map(s => s.mnt_id));
    const seed = M.alarm.filter(a => !ids.has(a.mnt_id)).map(a => Object.assign({}, a, alarmLocal[a.mnt_id] || {}));
    return sess.reverse().concat(seed).map(r => Object.assign(r, {
      device: r.dev || r.rid || '-', alm_time_text: fmtAlarmTime(r.alm_tim), opn_time_text: fmtServerTime(r.opn_at), done_time_text: r.done_at ? fmtServerTime(r.done_at) : '-'
    }));
  }
  const phaseBadge = p => p === 'DONE' ? 'active' : (p === 'PLANNED' || p === 'STARTED') ? 'warning' : 'inactive';
  const phaseLabel = p => T.al.phase[p] || T.al.phase.UNKNOWN;
  function alarmCols() {
    const cols = [
      { field: 'device', header: T.al.col.device, minWidth: '160px', cell: r => '<div class="flex items-center gap-1.5 flex-wrap"><span class="font-semibold">' + esc(r.device) + '</span>' +
        (r.src === 'session' ? '<span class="px-1.5 py-0.5 text-[9px] font-bold rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">' + T.al.sessionBadge + '</span>' : '') + '</div>' },
      { field: 'txt', header: T.al.col.description, minWidth: '220px', cell: r => '<span class="cell-wrap">' + esc(r.txt) + '</span>' },
      { field: 'alm_time_text', header: T.al.col.alarmTime, minWidth: '150px', cell: r => '<span class="font-mono whitespace-nowrap">' + esc(r.alm_time_text) + '</span>' },
      { field: 'opn_time_text', header: T.al.col.openedAt, minWidth: '150px', cell: r => '<span class="font-mono whitespace-nowrap">' + esc(r.opn_time_text) + '</span>' }
    ];
    if (S.alarmView === 'done') {
      cols.push({ field: 'done_time_text', header: T.al.col.doneAt, minWidth: '150px', cell: r => '<span class="font-mono whitespace-nowrap">' + esc(r.done_time_text) + '</span>' });
      cols.push({ field: 'phase', header: T.al.col.state, text: r => phaseLabel(r.phase), cell: r => statusBadge(phaseBadge(r.phase), phaseLabel(r.phase)) });
    }
    cols.push({ field: 'actions', header: T.al.col.actions, width: '130px', cell: r => r.phase !== 'DONE' && r.phase !== 'CANCELLED'
      ? btn({ act: 'al-complete', attrs: 'data-id="' + esc(r.mnt_id) + '"', size: 'sm', label: T.al.complete })
      : btn({ act: 'al-detail', attrs: 'data-id="' + esc(r.mnt_id) + '"', variant: 'secondary', size: 'sm', label: T.al.detail.open }) });
    return cols;
  }
  function viewAlarmRows() {
    const all = alarmRows();
    return S.alarmView === 'done' ? all.filter(r => r.phase === 'DONE' || r.phase === 'CANCELLED') : all.filter(r => r.phase !== 'DONE' && r.phase !== 'CANCELLED');
  }
  function renderAlarm() {
    const vBtn = (v, icon, label) => '<button type="button" data-act="al-view" data-v="' + v + '" aria-pressed="' + (S.alarmView === v) + '" class="px-3 py-1.5 rounded-[2px] text-xs transition-all flex items-center gap-1.5 cursor-pointer ' +
      (S.alarmView === v ? 'bg-sky-600 text-white font-bold shadow-xs' : 'bg-white dark:bg-surface-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-border-subtle font-medium') + '"><i class="' + icon + ' text-xs"></i><span>' + label + '</span></button>';
    const t = tbl('alarm');
    const rows = viewAlarmRows();
    const empty = t.search ? T.al.emptySearch : S.alarmView === 'open' ? T.al.emptyOpen : T.al.emptyDone;
    return '<div class="h-full w-full min-w-0 flex flex-col min-h-0 gap-3 overflow-hidden">' +
      '<div class="shrink-0">' + kit.pageHeader({ title: T.al.title, breadcrumbs: crumbs(T.al.title), actions: '<div class="flex items-center gap-3">' + btn({ act: 'go-cards', variant: 'secondary', icon: 'pi pi-chevron-left', label: T.common.back }) + '</div>' }) + '</div>' +
      '<div class="shrink-0 flex flex-wrap items-center gap-2 w-full border-b border-slate-200 dark:border-border-subtle pb-2" role="group">' + vBtn('open', 'pi pi-wrench', T.al.viewOpen) + vBtn('done', 'pi pi-check-circle', T.al.viewDone) + '</div>' +
      (!rows.length && !t.search ? '<div class="shrink-0 text-xs text-slate-500 dark:text-slate-400">' + esc(empty) + '</div>' : '') +
      dataTable('alarm', { cols: alarmCols(), rows, filterable: false, reportHost: true, empty, rowAttr: r => 'data-row="alarm" data-id="' + esc(r.mnt_id) + '"',
        rowClass: r => S.drawer && S.drawer.kind === 'alarm' && S.drawer.id === r.mnt_id ? 'bg-sky-500/5' : '' }) +
    '</div>';
  }
  function renderAlarmDrawer() {
    const r = alarmRows().find(x => x.mnt_id === S.drawer.id);
    if (!r) return '';
    const dt = (k, v, id) => '<dt class="text-slate-500">' + esc(k) + '</dt><dd class="col-span-2 break-words"' + (id ? ' id="' + id + '"' : '') + '>' + v + '</dd>';
    const body = '<div class="space-y-3 text-xs" id="alarm-mnt-detail">' +
      '<div class="flex items-center gap-2">' + statusBadge(phaseBadge(r.phase), phaseLabel(r.phase)) +
        (r.phase === 'DONE' ? '<span class="font-semibold text-emerald-700 dark:text-emerald-400">' + T.al.detail.doneBanner + '</span>' : '') + '</div>' +
      '<dl class="grid grid-cols-3 gap-x-3 gap-y-2">' +
        dt(T.al.col.device, '<span class="font-medium">' + esc(r.dev || '-') + '</span>') +
        dt(T.al.detail.source, esc(r.doc + ' / ' + r.rid) + (r.atr ? ' · ' + esc(r.atr) : '')) +
        dt(T.al.col.description, '<span class="whitespace-pre-wrap">' + esc(r.txt || '-') + '</span>') +
        (r.note ? dt(T.al.detail.note, esc(r.note)) : '') +
        dt(T.al.col.alarmTime, esc(r.alm_time_text)) + dt(T.al.col.openedAt, esc(r.opn_time_text)) + dt(T.al.detail.openedBy, esc(r.opn_usr || '-')) +
        (r.phase === 'DONE' ? dt(T.al.col.doneAt, esc(r.done_time_text)) + dt(T.al.detail.doneBy, esc(r.done_usr || '-')) : '') +
      '</dl>' +
      (r.target ? '<div class="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-border-subtle">' +
        '<a href="alarms.html?tab=history" class="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"><i class="pi pi-history text-[10px] mr-1"></i>Tarihsel Alarmlar</a>' +
        (/^\d[A-Z]{2}\d{2}$/.test(r.target) ? '<a href="cabinet-detail.html?cabinet=' + encodeURIComponent(r.target) + '" class="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline"><i class="pi pi-server text-[10px] mr-1"></i>Kabin ' + esc(r.target) + '</a>' : '') +
      '</div>' : '') +
    '</div>';
    return drawerShell({ title: T.al.detail.title, subtitle: (r.dev || r.rid) + ' · #' + r.mnt_id, icon: 'pi pi-wrench', body,
      footer: btn({ act: 'drawer-close', variant: 'secondary', size: 'sm', label: T.al.detail.close }) +
        (r.phase !== 'DONE' && r.phase !== 'CANCELLED' ? btn({ act: 'al-complete', attrs: 'data-id="' + esc(r.mnt_id) + '"', size: 'sm', label: T.al.complete }) : '') });
  }
  function completeAlarm(id) {
    const r = alarmRows().find(x => x.mnt_id === String(id));
    if (!r || r.phase === 'DONE') return;
    dialog({
      title: T.al.title, variant: 'confirm', body: esc(T.al.confirmDone), confirmLabel: T.al.complete, cancelLabel: T.cal.cancel,
      onConfirm: () => {
        if (r.src === 'session') writeSessionDone(r.mnt_id);
        else alarmLocal[r.mnt_id] = { phase: 'DONE', done_at: nowStamp(), done_usr: user() };
        toast(T.al.completed, 'success');
        render();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Rapor menüleri (app-report-export-menu)
  // ---------------------------------------------------------------------------
  const reportMenus = [];
  function mountReports() {
    reportMenus.splice(0).forEach(m => { try { m.destroy(); } catch (e) { /* yok say */ } });
    const host = k => root.querySelector('[data-report-host="' + k + '"]');
    if (S.view === 'table' && host('mnt-header')) {
      reportMenus.push(DCIM.report.menu(host('mnt-header'), {
        label: 'Rapor al', scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki sekme, arama ve filtrelerle' }], options: 'dateRange', defaultPreset: '90d',
        onExport: req => {
          const tab = TAB_DEF.find(t => t.id === S.tab);
          const rows = DCIM.report.applyRange(applyTable('table', tabRows(), MNT_COLS), req, 'tim_mnt_plan');
          const cnt = st => rows.filter(r => r.mnt_state === st).length;
          DCIM.report.generate({
            title: 'Bakım Kayıtları Raporu', subtitle: tab.label + (tbl('table').search ? ' · arama "' + tbl('table').search + '"' : ''), filename: 'Bakim_Kayitlari',
            kpis: [{ label: 'Kayıt', value: rows.length }, { label: T.tb.state.DONE, value: cnt('DONE'), tone: 'normal' }, { label: 'Açık', value: cnt('OPEN'), tone: cnt('OPEN') ? 'info' : 'normal' },
              { label: T.tb.state.UNKNOWN, value: cnt('UNKNOWN'), tone: cnt('UNKNOWN') ? 'warning' : 'normal' }, { label: T.tb.state.CANCELLED, value: cnt('CANCELLED') }],
            sections: [{ title: tab.label, toneKey: '_tone',
              columns: [{ key: 'asm_id', label: T.tb.assetId }, { key: 'asset_serial_no', label: T.tb.serialNo }, { key: 'manufacturer', label: T.tb.manufacturer }, { key: 'model', label: T.tb.model },
                { key: 'cabin_name', label: T.tb.cabinName }, { key: 'warr', label: T.tb.warrantyEnd }, { key: 'plan', label: T.tb.mntPlan }, { key: 'kind', label: T.tb.recordType },
                { key: 'prio', label: T.tb.priority }, { key: 'src', label: T.tb.source }, { key: 'mnt_notes', label: T.tb.description }, { key: 'mnt_usr', label: T.tb.responsible }, { key: 'state', label: T.tb.status }],
              rows: rows.map(r => ({ asm_id: r.asm_id, asset_serial_no: r.asset_serial_no, manufacturer: r.manufacturer, model: r.model, cabin_name: r.cabin_name, warr: fmtDay(r.tim_warr), plan: fmtDay(r.tim_mnt_plan),
                kind: kindLabel(r.mnt_kind), prio: r.prio ? T.priority[r.prio] : '', src: T.source[r.src || 'UNKNOWN'], mnt_notes: r.mnt_notes, mnt_usr: r.mnt_usr, state: stateText(r),
                _tone: r.mnt_state === 'DONE' ? 'normal' : r.mnt_state === 'UNKNOWN' ? 'warning' : '' })) }],
            notes: ['Tarih aralığı planlanan bakım tarihine uygulanır; planlanan tarihi olmayan kayıtlar da listelenir.']
          }, req.format);
        }
      }));
    }
    if (S.view === 'plans' && host('plans')) {
      const visible = applyTable('plans', M.plans.map(planRow), PLAN_COLS);
      reportMenus.push(DCIM.report.menu(host('plans'), {
        label: 'Rapor al', inTable: true, scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }], options: 'limit', unit: 'plan', total: visible.length,
        onExport: req => {
          const rows = DCIM.report.applyLimit(applyTable('plans', M.plans.map(planRow), PLAN_COLS), req);
          const cnt = s => rows.filter(r => r.status === s).length;
          DCIM.report.generate({
            title: 'Periyodik Bakım Planları Raporu', subtitle: visible.length < M.plans.length ? 'Filtre uygulandı: ' + visible.length + ' / ' + M.plans.length + ' plan' : 'Tüm planlar', filename: 'Bakim_Planlari',
            kpis: [{ label: 'Plan', value: rows.length }, { label: T.cal.overdue, value: cnt('overdue'), tone: cnt('overdue') ? 'alarm' : 'normal' }, { label: T.cal.today, value: cnt('today'), tone: cnt('today') ? 'warning' : 'normal' }],
            sections: [{ title: T.cal.title, toneKey: 'badge',
              columns: [{ key: 'device', label: T.cal.device }, { key: 'plan_name', label: T.cal.description }, { key: 'period_text', label: T.cal.period }, { key: 'next_text', label: T.cal.next },
                { key: 'last_text', label: T.cal.last }, { key: 'statusText', label: T.cal.status }], rows }]
          }, req.format);
        }
      }));
    }
    if (S.view === 'alarm' && host('alarm')) {
      reportMenus.push(DCIM.report.menu(host('alarm'), {
        label: 'Rapor al', inTable: true, scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }], options: 'dateRange', defaultPreset: '30d',
        onExport: req => {
          const done = S.alarmView === 'done';
          const base = applyTable('alarm', viewAlarmRows(), alarmCols()).map(r => Object.assign({}, r, { _t: (done ? r.done_at : r.opn_at || '').replace(' ', 'T'), _tone: r.phase === 'DONE' ? 'normal' : 'warning', state: phaseLabel(r.phase) }));
          const rows = DCIM.report.applyRange(base, req, '_t');
          const viewLabel = done ? T.al.viewDone : T.al.viewOpen;
          DCIM.report.generate({
            title: 'Alarm Bakımları Raporu', subtitle: viewLabel, filename: 'Alarm_Bakimlari',
            kpis: [{ label: 'Kayıt', value: rows.length }, { label: 'Tamamlanan', value: rows.filter(r => r.phase === 'DONE').length, tone: 'normal' },
              { label: 'Açık', value: rows.filter(r => r.phase !== 'DONE' && r.phase !== 'CANCELLED').length, tone: 'warning' }],
            sections: [{ title: viewLabel, toneKey: '_tone',
              columns: [{ key: 'device', label: T.al.col.device }, { key: 'txt', label: T.al.col.description }, { key: 'alm_time_text', label: T.al.col.alarmTime }, { key: 'opn_time_text', label: T.al.col.openedAt }]
                .concat(done ? [{ key: 'done_time_text', label: T.al.col.doneAt }] : []).concat([{ key: 'state', label: T.al.col.state }]), rows }],
            notes: [done ? 'Tarih aralığı bakımın tamamlanma zamanına uygulanır.' : 'Tarih aralığı bakım kaydının açılış zamanına uygulanır.']
          }, req.format);
        }
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Çizim + olaylar
  // ---------------------------------------------------------------------------
  const root = document.getElementById('mnt-root');
  function render() {
    const a = document.activeElement;
    const fk = a && a.getAttribute && a.getAttribute('data-focus-key');
    const caret = fk && typeof a.selectionStart === 'number' ? a.selectionStart : null;
    const scrollEl = root.querySelector('[data-dt] .overflow-auto');
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    let html = S.view === 'table' ? renderTable() : S.view === 'warranty' ? renderStepper() : S.view === 'plans' ? renderPlans() : S.view === 'alarm' ? renderAlarm() : renderCards();
    if (S.drawer) html += S.drawer.kind === 'mnt' ? renderMntDrawer() : S.drawer.kind === 'plan' ? renderPlanDrawer() : renderAlarmDrawer();
    html += '<datalist id="mnt-personnel">' + PERSONNEL.concat(['Voltaris Yetkili Servis', 'Üretici Servisi']).map(n => '<option value="' + esc(n) + '"></option>').join('') + '</datalist>';
    root.innerHTML = html;
    const sc = root.querySelector('[data-dt] .overflow-auto');
    if (sc && scrollTop) sc.scrollTop = scrollTop;
    if (fk) {
      const el = root.querySelector('[data-focus-key="' + fk + '"]');
      if (el) { el.focus(); if (caret != null) try { el.setSelectionRange(caret, caret); } catch (e) { /* tarih alanı */ } }
    }
    mountReports();
  }
  function go(view) {
    S.view = view;
    S.drawer = null;
    if (view === 'warranty' && S.step === 3) resetStepper();
    syncUrl();
    render();
    root.scrollTop = 0;
  }
  function currentKey(el) { const d = el.closest('[data-dt]'); return d ? d.getAttribute('data-dt') : null; }

  root.addEventListener('click', e => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) { e.preventDefault(); go(goEl.getAttribute('data-go')); return; }
    if (e.target.hasAttribute && e.target.hasAttribute('data-drawer-backdrop')) { S.drawer = null; render(); return; }
    // data-table
    const key = currentKey(e.target);
    if (key) {
      const t = tbl(key);
      const q = e.target.closest('[data-dt-q]');
      if (q) { onQuick(key, q.getAttribute('data-dt-q')); return; }
      const pg = e.target.closest('[data-dt-page]');
      if (pg && !pg.disabled) {
        const v = pg.getAttribute('data-dt-page');
        t.page = v === 'first' ? 1 : v === 'last' ? 99999 : t.page + Number(v);
        render();
        const sc = root.querySelector('[data-dt] .overflow-auto'); if (sc) sc.scrollTop = 0;
        return;
      }
      if (e.target.closest('[data-dt-filters]')) { t.showFilters = !t.showFilters; render(); return; }
      if (e.target.closest('[data-dt-clear]')) { t.filters = {}; t.page = 1; render(); return; }
      if (e.target.closest('[data-dt-refresh]')) {
        const ic = e.target.closest('[data-dt-refresh]').querySelector('i');
        ic.className = 'pi pi-spin pi-spinner text-xs';
        setTimeout(() => { render(); toast('Liste yenilendi.', 'success'); }, 450);
        return;
      }
    }
    const act = e.target.closest('[data-act]');
    if (act) { onAct(act.getAttribute('data-act'), act); return; }
    if (e.target.closest('[data-stop]')) return;
    const asmRow = e.target.closest('[data-asm-row]');
    if (asmRow) { toggleAsm(asmRow.getAttribute('data-asm-row')); return; }
    const row = e.target.closest('[data-row]');
    if (row) {
      const kind = row.getAttribute('data-row'), id = row.getAttribute('data-id');
      if (kind === 'mnt') openMnt(id);
      else if (kind === 'plan') openPlan(M.plans.find(p => p.plan_id === id));
      else if (kind === 'alarm') { S.drawer = { kind: 'alarm', id }; render(); }
    }
  });
  function onQuick() { /* hızlı filtre bu sayfada sekme düğmeleriyle yapılır */ }
  function toggleAsm(id) { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); render(); }

  function onAct(a, el) {
    const id = el.getAttribute('data-id');
    switch (a) {
      case 'go-cards': resetStepper(); go('cards'); break;
      case 'drawer-close': S.drawer = null; render(); break;
      case 'tab': S.tab = el.getAttribute('data-tab'); tbl('table').page = 1; S.drawer = null; syncUrl(); render(); break;
      case 'mail':
        dialog({ title: T.tb.manualMail, variant: 'info', body: esc(T.alerts.confirmMail), confirmLabel: 'Başlat', onConfirm: () => toast(T.alerts.mailSent, 'info', 'BİLGİ') });
        break;
      case 'mnt-edit': openMnt(id); break;
      case 'mnt-complete': {
        const r = findMnt(id);
        dialog({ title: T.tb.doComplete, variant: 'confirm', body: esc(T.alerts.confirmComplete), confirmLabel: T.tb.doComplete,
          onConfirm: () => { completeRecord(r, '', ''); toast(T.alerts.completeSuccess, 'success'); render(); } });
        break;
      }
      case 'mnt-classify-open':
      case 'mnt-classify-done': {
        const r = findMnt(id);
        const toDone = a === 'mnt-classify-done';
        dialog({ title: toDone ? T.tb.classifyDone : T.tb.classifyOpen, variant: 'warning', body: esc(toDone ? T.alerts.confirmClassifyDone : T.alerts.confirmClassifyOpen), confirmLabel: toDone ? T.tb.classifyDone : T.tb.classifyOpen,
          onConfirm: () => {
            Object.assign(r, toDone ? { mnt_state: 'DONE', mnt_phase: 'DONE' } : { mnt_state: 'OPEN', mnt_phase: 'PLANNED' });
            addEvent(r, { evt_typ: 'CLASSIFY', from_state: 'UNKNOWN', to_state: toDone ? 'DONE' : 'PLANNED' });
            toast(toDone ? T.alerts.classifySuccessDone : T.alerts.classifySuccessOpen, 'success');
            render();
          } });
        break;
      }
      case 'mnt-save': {
        const r = findMnt(S.drawer.id), t = S.drawer.temp;
        Object.assign(r, { tim_warr: t.warr, tim_mnt_plan: t.plan, mnt_kind: t.kind, prio: t.prio, mnt_notes: t.notes });
        if (t.usr.trim() && t.usr.trim() !== r.mnt_usr) { addEvent(r, { evt_typ: 'ASSIGN', from_state: r.mnt_phase, to_state: r.mnt_phase, old_val: r.mnt_usr, new_val: t.usr.trim() }); r.mnt_usr = t.usr.trim(); }
        addEvent(r, { evt_typ: 'UPDATE', from_state: r.mnt_phase, to_state: r.mnt_phase, note: 'Garanti / bakım tarihleri güncellendi' });
        S.drawer = null; toast(T.alerts.saveSuccess, 'success'); render();
        break;
      }
      case 'lc-assign': {
        const r = findMnt(S.drawer.id), v = S.drawer.temp.usr.trim();
        if (!v) return;
        addEvent(r, { evt_typ: 'ASSIGN', from_state: r.mnt_phase, to_state: r.mnt_phase, old_val: r.mnt_usr, new_val: v });
        r.mnt_usr = v; toast(T.lc.assigned, 'success'); render();
        break;
      }
      case 'lc-start': {
        const r = findMnt(S.drawer.id);
        r.mnt_phase = 'STARTED'; r.started_at = nowStamp();
        addEvent(r, { evt_typ: 'START', from_state: 'PLANNED', to_state: 'STARTED' });
        toast(T.lc.started, 'success'); render();
        break;
      }
      case 'lc-complete': {
        const r = findMnt(S.drawer.id), t = S.drawer.temp;
        dialog({ title: T.lc.complete, variant: 'confirm', body: esc(T.lc.confirmComplete), confirmLabel: T.lc.complete,
          onConfirm: () => { completeRecord(r, t.work.trim(), t.result.trim()); toast(T.lc.completed, 'success'); render(); } });
        break;
      }
      case 'lc-cancel': {
        const r = findMnt(S.drawer.id), t = S.drawer.temp;
        dialog({ title: T.lc.cancel, variant: 'danger', body: esc(T.lc.confirmCancel), confirmLabel: T.lc.cancel,
          onConfirm: () => {
            const from = r.mnt_phase;
            Object.assign(r, { mnt_state: 'CANCELLED', mnt_phase: 'CANCELLED', cancel_at: nowStamp(), cancel_note: t.reason.trim() });
            addEvent(r, { evt_typ: 'CANCEL', from_state: from, to_state: 'CANCELLED', note: t.reason.trim() });
            toast(T.lc.cancelled, 'success'); render();
          } });
        break;
      }
      // sihirbaz
      case 'asm-first': S.asmPage = 0; render(); break;
      case 'asm-prev': S.asmPage = Math.max(0, S.asmPage - 1); render(); break;
      case 'asm-next': S.asmPage++; render(); break;
      case 'asm-last': S.asmPage = 99999; render(); break;
      case 'step-prev': if (S.step === 1) { resetStepper(); go('cards'); } else { S.step--; render(); } break;
      case 'step-next':
        if (S.step === 1) { if (!S.sel.size) { toast(T.alerts.selectAsset, 'warning'); return; } S.step = 2; render(); }
        else if (S.step === 2) bulkSave();
        break;
      // planlar
      case 'plan-new': openPlan(null); break;
      case 'plan-pick': {
        const d = S.drawer, res = deviceResults(d), x = res && res[Number(el.getAttribute('data-i'))];
        if (!x) return;
        if (d.source === 'ASM') Object.assign(d.form, { asm_id: x.asm_id, source_doc: '', source_dev: '', device: '[' + x.asm_id + '] ' + x.name + ' ' + x.manufacturer + ' ' + x.model });
        else Object.assign(d.form, { asm_id: '', source_doc: d.source, source_dev: x.id, device: x.id + ' — ' + x.desc });
        d.selectedLabel = d.form.device; d.q = d.selectedLabel; render();
        break;
      }
      case 'plan-dpage': S.drawer.ofs = Math.max(0, S.drawer.ofs + Number(el.getAttribute('data-d')) * 10); render(); break;
      case 'plan-save': {
        const d = S.drawer, f = d.form;
        if (!String(f.plan_name).trim() || !nextCalendarDate(f.next_due, Number(f.period_n), f.period_unit) || (!f.asm_id && !(f.source_doc && f.source_dev))) { toast(T.cal.invalid, 'warning'); return; }
        if (d.editing) {
          const p = M.plans.find(x => x.plan_id === d.id);
          Object.assign(p, { plan_name: f.plan_name.trim(), period_n: Number(f.period_n), period_unit: f.period_unit, next_due: f.next_due, ver: String(Number(p.ver) + 1) });
        } else {
          M.plans.unshift({ plan_id: M.nextPlanId(), ver: '1', asm_id: f.asm_id, source_doc: f.source_doc, source_dev: f.source_dev, device: f.device, plan_name: f.plan_name.trim(),
            period_n: Number(f.period_n), period_unit: f.period_unit, next_due: f.next_due, last_done: '', state: 'A' });
        }
        S.drawer = null; toast(T.cal.saved, 'success'); render();
        break;
      }
      case 'plan-complete': {
        const p = M.plans.find(x => x.plan_id === id);
        dialog({ title: T.cal.complete, variant: 'confirm', body: esc(T.cal.confirm), confirmLabel: T.cal.complete,
          onConfirm: () => { const t = todayKey(); p.last_done = t; p.next_due = nextCalendarDate(t, p.period_n, p.period_unit); p.ver = String(Number(p.ver) + 1); toast(T.cal.completed, 'success'); render(); } });
        break;
      }
      // alarm bakımları
      case 'al-view': S.alarmView = el.getAttribute('data-v'); tbl('alarm').page = 1; S.drawer = null; syncUrl(); render(); break;
      case 'al-complete': completeAlarm(id); break;
      case 'al-detail': S.drawer = { kind: 'alarm', id }; render(); break;
      default: break;
    }
  }

  root.addEventListener('input', e => {
    const el = e.target;
    const key = currentKey(el);
    if (el.hasAttribute('data-dt-search') && key) { tbl(key).search = el.value; tbl(key).page = 1; render(); return; }
    if (el.hasAttribute('data-dt-f') && key && el.type === 'text') { tbl(key).filters[el.getAttribute('data-dt-f')] = el.value; tbl(key).page = 1; render(); return; }
    if (el.hasAttribute('data-tmp') && S.drawer) {
      const k = el.getAttribute('data-tmp');
      S.drawer.temp[k] = el.value;
      if (k === 'notes') { const c = root.querySelector('[data-count="notes"]'); c.textContent = el.value.length + '/200'; c.classList.toggle('hidden', el.value.length < 200); }
      if (k === 'work' || k === 'result') { const b = root.querySelector('[data-act="lc-complete"]'); if (b) b.disabled = !(S.drawer.temp.work.trim() && S.drawer.temp.result.trim()); }
      if (k === 'reason') { const b = root.querySelector('[data-act="lc-cancel"]'); if (b) b.disabled = !S.drawer.temp.reason.trim(); }
      if (k === 'usr') { const b = root.querySelector('[data-act="lc-assign"]'); if (b) b.disabled = !el.value.trim(); }
      return;
    }
    if (el.hasAttribute('data-bulk')) {
      const k = el.getAttribute('data-bulk');
      S.bulk[k] = el.value;
      if (k === 'notes') { const c = root.querySelector('[data-count="bulk"]'); c.textContent = el.value.length + '/200'; c.classList.toggle('hidden', el.value.length < 200); }
      return;
    }
    if (el.hasAttribute('data-af')) { S.asmFilters[el.getAttribute('data-af')] = el.value; S.asmPage = 0; render(); return; }
    if (el.hasAttribute('data-pf') && S.drawer) {
      const k = el.getAttribute('data-pf');
      if (k === 'q') { S.drawer.q = el.value; S.drawer.selectedLabel = ''; S.drawer.ofs = 0; Object.assign(S.drawer.form, { asm_id: '', source_doc: '', source_dev: '' }); render(); }
      else S.drawer.form[k] = el.value;
    }
  });
  root.addEventListener('change', e => {
    const el = e.target;
    const key = currentKey(el);
    if (el.hasAttribute('data-dt-size') && key) { tbl(key).pageSize = parseInt(el.value, 10); tbl(key).page = 1; render(); return; }
    if (el.hasAttribute('data-dt-f') && key && el.type !== 'text') { tbl(key).filters[el.getAttribute('data-dt-f')] = el.value; tbl(key).page = 1; render(); return; }
    if (el.hasAttribute('data-tmp') && S.drawer) { S.drawer.temp[el.getAttribute('data-tmp')] = el.value; if (el.type === 'date') render(); return; }
    if (el.hasAttribute('data-bulk')) { S.bulk[el.getAttribute('data-bulk')] = el.value; return; }
    if (el.hasAttribute('data-asm-chk')) { toggleAsm(el.getAttribute('data-asm-chk')); return; }
    if (el.hasAttribute('data-asm-all')) {
      const list = asmFiltered().slice(S.asmPage * S.asmRng, (S.asmPage + 1) * S.asmRng);
      list.forEach(a => { if (el.checked) S.sel.add(a.asm_id); else S.sel.delete(a.asm_id); });
      render(); return;
    }
    if (el.hasAttribute('data-asm-rng')) { S.asmRng = parseInt(el.value, 10); S.asmPage = 0; render(); return; }
    if (el.hasAttribute('data-asm-page')) { const n = parseInt(el.value, 10); if (n >= 1) { S.asmPage = n - 1; render(); } return; }
    if (el.hasAttribute('data-pf') && S.drawer) {
      const k = el.getAttribute('data-pf');
      if (k === 'source') { S.drawer.source = el.value; S.drawer.q = ''; S.drawer.selectedLabel = ''; S.drawer.ofs = 0; Object.assign(S.drawer.form, { asm_id: '', source_doc: '', source_dev: '' }); render(); }
      else if (k !== 'q') S.drawer.form[k] = el.value;
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.drawer && !document.querySelector('[data-dialog-panel]')) { S.drawer = null; render(); } });
  // Başka sekmede (Tarihsel Alarmlar) açılan alarm bakımları: görünüm açıksa yenile
  window.addEventListener('storage', e => { if (e.key === ALARM_KEY && S.view === 'alarm') render(); });

  // ---------------------------------------------------------------------------
  // Açılış: derin bağlantılar
  // ---------------------------------------------------------------------------
  const openParam = params.get('open');
  if (S.view === 'table' && openParam) {
    const q = lower(openParam);
    const r = findMnt(openParam) || M.records.find(x => x.mnt_state === 'OPEN' && lower(x.name) === q) || M.records.find(x => lower(x.name).indexOf(q) >= 0 || lower(x.mnt_notes).indexOf(q) >= 0);
    if (r) {
      const def = TAB_DEF.find(t => t.state === r.mnt_state);
      if (def && S.tab !== 'all' && S.tab !== def.id) S.tab = def.id;
      S.drawer = { kind: 'mnt', id: r.mnt_id, temp: { warr: r.tim_warr || '', plan: r.tim_mnt_plan || '', kind: r.mnt_kind || '', prio: r.prio || '', usr: r.mnt_usr || '', notes: r.mnt_notes || '', work: '', result: '', reason: '' } };
    } else toast(T.al.notFound, 'warning');
  }
  if (S.view === 'warranty' && params.get('step') === '2') {
    String(params.get('sel') || '').split(',').filter(id => M.findAsset(id)).forEach(id => S.sel.add(id));
    if (S.sel.size) S.step = 2;
  }
  if (S.view === 'plans' && params.get('new') === '1') {
    openPlan(null);
    const a = M.findAsset(params.get('asm'));
    if (a) { Object.assign(S.drawer.form, { asm_id: a.asm_id, device: '[' + a.asm_id + '] ' + a.name + ' ' + a.manufacturer + ' ' + a.model }); S.drawer.selectedLabel = S.drawer.form.device; S.drawer.q = S.drawer.selectedLabel; }
  }
  if (S.view === 'alarm' && openParam) {
    const r = alarmRows().find(x => x.mnt_id === String(openParam));
    if (r) {
      S.alarmView = r.phase === 'DONE' || r.phase === 'CANCELLED' ? 'done' : 'open';
      S.drawer = { kind: 'alarm', id: r.mnt_id };
    } else toast(T.al.notFound, 'warning');
  }
  render();
})();
