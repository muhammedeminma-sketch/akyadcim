/* ==========================================================================
   DCIM Sunum — Kullanıcı Ayarları (NewUICMPAccountSettingsComponent, "Hesap Ayarları")
   Kaynak: user-app/src/app/new-ui/pages/account-settings/account-settings.component.{html,ts,scss}
   - Kurumsal / Müşteri kullanıcı listeleri, tablo içi filtre satırı, sayfalama (alt çubuk), sayfa boyutu (varsayılan 50)
   - Yeni kayıt / düzenleme modalları (telefon maskesi, ülke kodu, müşteri seçimi, şifre üretme)
   - Silme onayı (app-dialog); rapor menüsü (app-report-export-menu: Kurumsal / Müşteri kullanıcıları,
     açık sekmeye ekrandaki filtreler uygulanır; şifre rapora yazılmaz, yalnız LDAP / yerel şifre)
   - Mobil (lg altı): kart listesi, arama + Filtre (alan paneli) + Yenile; ekleme / düzenleme / silme yok
   - "Müşteri Yetkilendirme" artık ayrı sayfa: customer-authorization.html (?uid=<das_uid> ile)
   Sunum eklentileri (kaynakta yok, aynı görsel dille): Departman / Durum (Aktif-Pasif) / Son Giriş
   kolonları, aktif-pasif değiştirme, "Şifre Değiştir" sekmesi (oturumdaki kullanıcı için).
   Derin bağlantılar:
     ?tab=corporate|customer|password   başlangıç sekmesi (varsayılan: corporate — kaynaktaki gibi)
     ?filter=1                          tablo içi filtre satırını açık başlat
     ?open=add                          aktif sekme için "Yeni Kayıt" modalını aç
     ?edit=<das_uid>                    ilgili kullanıcının düzenleme modalını aç (örn. ?edit=egelojistik.selin)
     ?auth=1 | ?auth=<das_uid>          customer-authorization.html'e yönlendirir (eski modal bağlantısı; uid taşınır)
     ?report=1                          rapor menüsünü açık başlat
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const params = new URLSearchParams(window.location.search);
  // Eski "Müşteri Yetkilendirme" modal bağlantısı → ayrı sayfa (orijinal openAuthModal → /dcim/customer-authorization)
  const authRedirect = params.get('auth');
  if (authRedirect) {
    window.location.replace('customer-authorization.html' + (authRedirect !== '1' ? '?uid=' + encodeURIComponent(authRedirect) : ''));
    return;
  }

  const { esc, fmtDateTime, statusBadge, button, dialog, toast } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'accounts' });

  const A = DCIM.data.accounts;
  // Mobilde ekleme / düzenleme / silme / yetkilendirme yok (isMobileViewport — lg altı)
  const isMobile = () => window.innerWidth < 1024;
  const CUST_AUTH_URL = uid => 'customer-authorization.html' + (uid ? '?uid=' + encodeURIComponent(uid) : '');
  const trLower = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
  const trUpper = s => String(s == null ? '' : s).toLocaleUpperCase('tr-TR');

  // ---------------------------------------------------------------------------
  // Sözlük (messages.tr.json → accountSettingsComponent.* / authorizationManagement.*)
  // ---------------------------------------------------------------------------
  const T = {
    corporateTitle: 'Kurumsal Hesap Listesi',
    customerTitle: 'Müşteri Hesap Listesi',
    passwordTitle: 'Şifre Değiştir',
    filter: 'Filtre',
    refresh: 'Yenile',
    addCorporate: 'Kurumsal Kullanıcı Ekle',
    addCustomer: 'Müşteri Kullanıcısı Ekle',
    corporateUsers: 'Kurumsal Kullanıcılar',
    customerUsers: 'Müşteri Kullanıcıları',
    permissionPages: 'İzin Sayfaları',
    customerAuthorization: 'Müşteri Yetkilendirme',
    totalRecords: 'Toplam Veri Sayısı',
    noDataToShow: 'Gösterilecek veri bulunamadı.',
    noDataOrWaiting: 'Veri bulunamadı veya bekleniyor...',
    headers: {
      id: 'ID', name: 'Ad', surname: 'Soyad', username: 'Kullanıcı Adı', password: 'Şifre', position: 'Pozisyon',
      routing: 'Yönlendirme', twoFactor: '2FA', phoneNumber: 'Telefon Numarası', email: 'Email', customer: 'Müşteri',
      actions: 'İşlemler',
      // Sunum eklentisi kolonlar
      department: 'Departman', status: 'Durum', lastLogin: 'Son Giriş'
    },
    placeholders: {
      id: 'ID', name: 'Ad', surname: 'Soyad', username: 'Kullanıcı Adı', password: 'Şifre', position: 'Pozisyon',
      routing: 'Yönlendirme', twoFactor: '2FA', phoneNumber: 'Telefon', email: 'Email', customer: 'Müşteri',
      countryCode: 'Kod', searchCustomer: 'Listeden Seçiniz veya Arayınız', selectPosition: 'Pozisyon Seçiniz',
      department: 'Departman', lastLogin: 'Son Giriş'
    },
    tooltips: {
      toggleFilter: 'Filtreyi Aç/Kapat', showPassword: 'Şifreyi Göster', hidePassword: 'Şifreyi Gizle', edit: 'Düzenle',
      delete: 'Sil', close: 'Kapat', generatePassword: 'Şifre Üret', addNewCustomer: 'Yeni Müşteri Ekle', cancel: 'İptal',
      deactivate: 'Pasif Yap', activate: 'Aktif Yap', selfAccount: 'Oturumdaki kullanıcı üzerinde bu işlem yapılamaz'
    },
    modal: {
      newCorporate: 'Yeni Kurumsal Kayıt', newCustomer: 'Yeni Müşteri Kaydı',
      editCorporate: 'Kurumsal Kaydı Düzenle', editCustomer: 'Müşteri Kaydını Düzenle',
      userIdentityInfo: 'Kullanıcı Kimlik Bilgileri', name: 'Ad *', surname: 'Soyad *', employeeNo: 'Sicil No *',
      username: 'Kullanıcı Adı *', password: 'Şifre *', position: 'Pozisyon *', contactDetails: 'İletişim ve Detaylar',
      phoneNumber: 'Telefon Numarası', email: 'Email', emailRequired: 'Email *', customers: 'Müşteriler',
      customerAndAuth: 'Müşteri & Yetkilendirme', authorization: 'Yetkilendirme', authSettings: 'Yetkilendirme Ayarları',
      cancel: 'İptal', save: 'Kaydet', update: 'Güncelle',
      department: 'Departman', status: 'Durum'
    },
    deleteModal: {
      title: 'Kaydı Sil', question: 'Seçili kullanıcıyı silmek istediğinize emin misiniz?',
      warning: 'Bu işlem geri alınamaz.', confirm: 'Evet, Sil', cancel: 'İptal'
    },
    alerts: {
      success: 'İşlem başarıyla tamamlandı!',
      invalidEmail: 'Lütfen geçerli bir e-posta adresi girin.',
      invalidPhone: 'Telefon numarası eksik veya hatalı.'
    },
    positions: { Admin: 'Admin', 'Mühendis': 'Mühendis', 'Operatör': 'Operatör', 'Müşteri': 'Müşteri', 'Müsteri': 'Müşteri', Misafir: 'Misafir', Test: 'Test' },
    status: { active: 'Aktif', passive: 'Pasif' }
  };

  const COUNTRY_CODES = [
    { code: '90', name: 'Türkiye (+90)' }, { code: '44', name: 'İngiltere (+44)' }, { code: '1', name: 'ABD (+1)' },
    { code: '49', name: 'Almanya (+49)' }, { code: '81', name: 'Japonya (+81)' }, { code: '33', name: 'Fransa (+33)' },
    { code: '34', name: 'İspanya (+34)' }, { code: '7', name: 'Rusya (+7)' }, { code: '86', name: 'Çin (+86)' }
  ];
  const POSITION_LIST = A.positions;
  const CORP_POSITIONS = POSITION_LIST.filter(p => p !== 'Müşteri');
  const DEFAULT_CUSTOMER_ACL = 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,';

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  let USERS = A.users.map(u => Object.assign({}, u));
  const CUSTOMER_LIST = A.customers;
  const SESSION = DCIM.session.user();

  const emptyFilter = () => ({ user_id: '', name: '', surname: '', das_uid: '', das_pwd: '', das_grp: '', department: '', das_acl: '', das_cfg: '', mobile: '', email: '', customer_name: '', status: '', last_login: '' });
  const tabParam = params.get('tab');
  const state = {
    listTab: tabParam === 'customer' || tabParam === 'password' ? tabParam : 'corporate',
    filterSwitch: params.get('filter') === '1' ? 1 : 0,
    filterModel: emptyFilter(),
    localFilters: {},
    pageOfs: 0,
    pageRng: 50,
    pageInput: 1,
    loading: false,
    visiblePwd: null,
    flashId: null,
    showPositionDropdown: false,
    // Mobil arama kutusu (kartta görünen alanlarda arar; şifre alanı aranmaz)
    searchQuery: '',
    // Mobil kartta müşteri listesi açık olan kullanıcılar
    expandedCustomers: new Set()
  };
  // Mobil filtre paneli alanları (masaüstü filtre satırıyla aynı filterModel)
  const MOBILE_FILTER_FIELDS = [
    { key: 'user_id', label: 'id' }, { key: 'name', label: 'name' }, { key: 'surname', label: 'surname' },
    { key: 'das_uid', label: 'username' }, { key: 'das_pwd', label: 'password' },
    { key: 'das_grp', label: 'position', corporateOnly: true }, { key: 'das_acl', label: 'routing' },
    { key: 'das_cfg', label: 'twoFactor' }, { key: 'mobile', label: 'phoneNumber' }, { key: 'email', label: 'email' },
    { key: 'customer_name', label: 'customer', customerOnly: true }
  ];
  const getCustomerNames = s => String(s || '').split(',').map(c => c.trim()).filter(Boolean);

  const root = document.getElementById('as-root');

  // ---------------------------------------------------------------------------
  // Yardımcılar (TS'ten port)
  // ---------------------------------------------------------------------------
  function getDisplayPosition(grp) {
    if (!grp) return '';
    const clean = grp.trim().toLowerCase();
    if (clean === 'mühendis' || clean === 'muhendis') return 'Mühendis';
    if (clean === 'operatör' || clean === 'operator') return 'Operatör';
    if (clean === 'müşteri' || clean === 'musteri' || clean === 'musterı' || clean === 'müsteri') return 'Müşteri';
    if (clean === 'misafir') return 'Misafir';
    if (clean === 'admin') return 'Admin';
    if (clean === 'test') return 'Test';
    return grp;
  }
  const positionLabel = p => T.positions[p] || p;

  function isUserCustomer(user) {
    if (!user) return false;
    const grp = (user.das_grp || '').toLowerCase().trim();
    return /m[uü]steri/.test(grp) || /m[uü][sş]teri/.test(grp) || grp === 'müşteri' || grp === 'musteri' ||
      !!(user.customer_name && user.customer_name.trim() !== '');
  }
  const isSessionUser = u => !!u && trLower(u.das_uid) === trLower(SESSION.usr);
  const sessionRow = () => USERS.find(isSessionUser) || null;

  function isEmailValid(email) {
    if (!email || email.trim() === '') return true;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  }
  function isPhoneValid(phone) {
    if (!phone || String(phone).trim() === '') return false;
    return String(phone).replace(/\D/g, '').length === 10;
  }

  function matchesSearch(user, q) {
    const pos = getDisplayPosition(user.das_grp);
    return [user.user_id, user.name, user.surname, user.das_uid, user.mobile, user.email, user.customer_name, pos, positionLabel(pos)]
      .some(v => trLower(v).indexOf(q) >= 0);
  }
  const activeFilterCount = () => Object.keys(state.filterModel).filter(k => String(state.filterModel[k] || '').trim() !== '').length;

  function filteredUsers() {
    return filterUsers(state.listTab, true);
  }
  // Sekmenin kullanıcıları; withFilters: ekrandaki sütun süzgeçleri ve arama da uygulanır (liste ve rapor aynı süzgeci kullanır)
  function filterUsers(tab, withFilters) {
    let users = USERS.filter(u => (tab === 'customer' ? isUserCustomer(u) : !isUserCustomer(u)));
    if (!withFilters) return users.sort((a, b) => Number(a.user_id) - Number(b.user_id));
    const q = trLower(state.searchQuery).trim();
    if (q) users = users.filter(u => matchesSearch(u, q));
    const keys = Object.keys(state.localFilters);
    if (keys.length) {
      users = users.filter(user => keys.every(key => {
        let val;
        if (key === 'das_grp') {
          const disp = getDisplayPosition(user[key]);
          val = trLower(disp + ' ' + positionLabel(disp) + ' ' + user[key]);
        } else if (key === 'status') {
          return user.status === state.localFilters[key];
        } else if (key === 'last_login') {
          val = user.last_login ? fmtDateTime(user.last_login) : '-';
        } else {
          val = trLower(user[key] || '');
        }
        return val.indexOf(state.localFilters[key]) >= 0;
      }));
    }
    return users.sort((a, b) => Number(a.user_id) - Number(b.user_id));
  }
  const totalPages = () => Math.ceil(filteredUsers().length / state.pageRng);
  function paginatedUsers() {
    const start = state.pageOfs * state.pageRng;
    return filteredUsers().slice(start, start + state.pageRng);
  }
  function title() {
    if (state.listTab === 'password') return trUpper(T.passwordTitle);
    return trUpper(state.listTab === 'customer' ? T.customerTitle : T.corporateTitle);
  }
  function conBadge() {
    if (state.loading) return statusBadge('processing', 'Bağlanıyor');
    return USERS.length ? statusBadge('active', 'Bağlı') : statusBadge('processing', 'Bağlanıyor');
  }

  // ---------------------------------------------------------------------------
  // Sınıf sabitleri (kaynak şablondan)
  // ---------------------------------------------------------------------------
  const TAB_ON = 'bg-sky-600 text-white font-bold shadow-xs border-sky-600';
  const TAB_OFF = 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700';
  const PAGER_BTN = 'w-7 h-7 flex items-center justify-center rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
  const FILTER_INPUT = 'scada-input w-full px-1.5 py-0.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100';
  const M_INPUT = 'scada-input w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500';
  const M_LABEL = 'block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1';
  const M_SECTION = 'text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2';
  const DD_PANEL = 'absolute left-0 top-full mt-1 z-30 bg-white dark:bg-surface-card border border-slate-200 dark:border-slate-700 rounded-[2px] shadow-lg overflow-y-auto';
  // Sunum eklentisi: tablo yatay kaydığında İşlemler kolonu sağda sabit kalır (opak zemin gerekir)
  const STICKY_HEAD = 'sticky right-0 bg-slate-100 dark:bg-[#0f1624] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.35)]';
  const STICKY_FILTER = 'sticky right-0 bg-slate-50 dark:bg-[#070b13] shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.35)]';
  const STICKY_CELL = 'sticky right-0 bg-white dark:bg-surface-card group-hover:bg-slate-50 dark:group-hover:bg-[#172133] transition-colors shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.35)]';
  const DD_ITEM = 'px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 cursor-pointer';

  // ---------------------------------------------------------------------------
  // Ana görünüm
  // ---------------------------------------------------------------------------
  function render() {
    const isPwd = state.listTab === 'password';
    if (reportMenu) { reportMenu.destroy(); reportMenu = null; }
    root.innerHTML =
      kit.pageHeader({
        title: title(),
        breadcrumbs: [{ label: 'Yönetim' }, { label: 'Kullanıcı Ayarları' }],
        actions: '<div class="flex items-center gap-2" id="as-con">' + conBadge() + '</div>'
      }).replace('class="mb-3 pb-2', 'class="shrink-0 mb-3 pb-2') +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden w-full">' +
        // Üst çubuk: sekmeler + işlemler (mobil: üstte sekmeler, altında arama + Filtre + Yenile tek satır)
        '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base shrink-0 max-lg:pt-0 max-lg:bg-white dark:max-lg:bg-surface-card' +
          (isPwd ? '' : ' max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_auto_auto] max-lg:gap-2') + '">' +
          renderListTabs() +
          (isPwd ? '' : renderMobileSearch() + renderActions()) +
        '</div>' +
        (isPwd ? renderPasswordView() :
          '<div class="flex-1 min-h-0 overflow-auto" id="as-table">' +
            // Mobil kart listesi (lg altı): aynı sayfa, aynı filtre modeli; yalnızca görüntüleme
            '<div class="lg:hidden p-2 space-y-1.5 min-h-full bg-slate-100 dark:bg-[#080c14]">' +
              '<div id="as-mfilter">' + renderMobileFilter() + '</div>' +
              '<div id="as-cards" class="space-y-1.5">' + renderCards() + '</div>' +
            '</div>' +
            '<table class="w-full text-left border-collapse text-xs max-lg:hidden">' +
              '<thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider select-none" id="as-thead">' + renderThead() + '</thead>' +
              '<tbody class="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300" id="as-tbody">' + renderTbody() + '</tbody>' +
            '</table>' +
          '</div>') +
        // Alt çubuk: toplam + başlık | sayfa boyutu + sayfalama (all-assets data-table düzeni)
        '<div class="p-2.5 px-3 border-t border-slate-200 dark:border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 dark:bg-surface-base text-xs text-slate-500 dark:text-slate-400 shrink-0">' +
          (isPwd
            ? '<div class="flex items-center gap-2"><i class="pi pi-user text-xs"></i><span>Oturum:</span><span class="px-1.5 py-0.5 rounded-[2px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">' + esc(SESSION.usr) + '</span></div>' +
              '<div class="text-[11px] font-mono text-slate-400">' + esc(title()) + '</div>'
            : '<div class="flex items-center gap-2"><span>' + esc(T.totalRecords) + ':</span><span class="px-1.5 py-0.5 rounded-[2px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200" id="as-total">' + filteredUsers().length + '</span>' +
                '<span class="text-[11px] font-mono text-slate-400 ml-2">' + esc(title()) + '</span></div>' +
              '<div class="flex items-center gap-3 self-end sm:self-auto max-lg:self-stretch max-lg:justify-between" id="as-pager">' + renderPager() + '</div>') +
        '</div>' +
      '</div>';
    if (isPwd) updatePasswordState();
    else mountReportMenu();
  }

  function renderListTabs() {
    const tab = (key, icon, label) =>
      '<button type="button" role="tab" aria-selected="' + (state.listTab === key) + '" data-list-tab="' + key + '" class="' + (state.listTab === key ? TAB_ON : TAB_OFF) + ' px-3 py-1.5 rounded-[2px] text-xs border transition-all flex items-center gap-1.5 cursor-pointer">' +
        '<i class="' + icon + ' text-xs"></i><span>' + esc(label) + '</span></button>';
    // Mobilde ortak alt çizgili sekme çubuğu (.nu-mtabs — css/account-settings.css)
    return '<div class="flex items-center gap-1.5 nu-mtabs max-lg:w-full max-lg:col-span-3">' +
      tab('corporate', 'pi pi-building', T.corporateUsers) +
      tab('customer', 'pi pi-users', T.customerUsers) +
      // Sunum eklentisi: oturumdaki kullanıcı için şifre değiştirme
      '<div class="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 max-lg:hidden"></div>' +
      tab('password', 'pi pi-key', T.passwordTitle) +
    '</div>';
  }

  // Mobil: arama kutusu (diğer tablolardaki Ara / Filtre / Yenile düzeni); masaüstünde sütun filtreleri kullanılır
  function renderMobileSearch() {
    return '<div class="lg:hidden relative w-full min-w-0">' +
      '<i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
      '<input type="text" id="as-msearch" value="' + esc(state.searchQuery) + '" placeholder="Ara" class="w-full h-10 pl-9 pr-9 py-2.5 text-base font-medium bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[3px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500" />' +
      '<button type="button" data-act="msearch-clear" aria-label="Temizle" class="' + (state.searchQuery ? '' : 'hidden ') + 'absolute right-0 top-0 h-10 w-9 flex items-center justify-center text-slate-400 dark:text-slate-500 active:text-rose-500 cursor-pointer"><i class="pi pi-times-circle text-xs"></i></button>' +
    '</div>';
  }

  function renderPager() {
    const tp = totalPages();
    const atStart = state.pageOfs === 0;
    const atEnd = tp === 0 || state.pageOfs + 1 >= tp;
    const PB = PAGER_BTN + ' max-lg:w-10 max-lg:h-10 max-lg:rounded-[3px]';
    return '<div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span>Sayfa:</span>' +
        '<input id="as-page-size" type="number" min="1" max="999" value="' + state.pageRng + '" class="w-12 max-lg:w-16 max-lg:h-10 py-0.5 px-1 text-center text-xs max-lg:text-base bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
      '</div>' +
      '<div class="flex items-center gap-1">' +
        '<button type="button" data-page="first" ' + (atStart ? 'disabled' : '') + ' title="İlk Sayfa" class="' + PB + '"><i class="pi pi-angle-double-left text-xs"></i></button>' +
        '<button type="button" data-page="prev" ' + (atStart ? 'disabled' : '') + ' title="Önceki" class="' + PB + '"><i class="pi pi-angle-left text-xs"></i></button>' +
        '<div class="flex items-center gap-1 px-1">' +
          '<input type="number" id="as-page-input" min="1" max="' + tp + '" value="' + state.pageInput + '" class="w-12 max-lg:w-16 max-lg:h-10 py-1 px-1.5 text-center text-xs max-lg:text-base bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono" />' +
          (tp > 0 ? '<span class="text-xs text-slate-500 dark:text-slate-400 font-mono">/ ' + tp + '</span>' : '') +
        '</div>' +
        '<button type="button" data-page="next" ' + (atEnd ? 'disabled' : '') + ' title="Sonraki" class="' + PB + '"><i class="pi pi-angle-right text-xs"></i></button>' +
        '<button type="button" data-page="last" ' + (atEnd ? 'disabled' : '') + ' title="Son Sayfa" class="' + PB + '"><i class="pi pi-angle-double-right text-xs"></i></button>' +
      '</div>';
  }

  // Sağ: sekmeye göre işlemler, rapor, Filtre ve Yenile (mobilde kutu kalkar: Filtre ve Yenile arama satırına oturur)
  function renderActions() {
    const corp = state.listTab === 'corporate';
    const n = activeFilterCount();
    const on = state.filterSwitch === 1;
    return '<div class="flex items-center gap-2 max-lg:contents">' +
      '<span class="contents max-lg:hidden">' + button({ variant: 'primary', size: 'sm', icon: 'pi pi-plus', label: corp ? T.addCorporate : T.addCustomer, attrs: 'data-act="add"' }) + '</span>' +
      '<span class="contents max-lg:hidden">' + button({ variant: 'secondary', size: 'sm', icon: 'pi pi-shield', label: corp ? T.permissionPages : T.customerAuthorization, attrs: corp ? 'data-act="perm-pages"' : 'data-act="cust-auth"' }) + '</span>' +
      // Rapor (masaüstü; mobilde arama satırı düzeni korunur)
      '<div class="max-lg:hidden" id="as-report"></div>' +
      '<div class="h-4 w-px bg-slate-200 dark:bg-slate-700 max-lg:hidden"></div>' +
      '<button type="button" data-act="filter" aria-expanded="' + on + '" title="' + esc(T.tooltips.toggleFilter) + '" class="' +
        (on ? 'bg-sky-600 text-white border-sky-600 font-bold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700') +
        ' px-2.5 py-1 text-xs rounded-[2px] border flex items-center gap-1 cursor-pointer transition-colors max-lg:justify-center max-lg:h-10 max-lg:py-0 max-lg:px-3 max-lg:text-[13px] max-lg:font-semibold max-lg:gap-1.5 max-lg:whitespace-nowrap">' +
        '<i class="pi pi-filter text-xs max-lg:text-[12px]"></i><span>' + esc(T.filter) + '</span>' +
        '<span data-filter-count' + (n ? '' : ' style="display:none"') + ' class="lg:hidden min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums ' + (on ? 'bg-white text-sky-700' : 'bg-sky-600 text-white') + '">' + n + '</span>' +
      '</button>' +
      '<button type="button" data-act="refresh" title="' + esc(T.refresh) + '" aria-label="' + esc(T.refresh) + '" class="w-7 h-7 flex items-center justify-center rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors max-lg:w-10 max-lg:h-10"><i data-refresh-icon class="pi pi-refresh text-xs max-lg:text-sm' + (state.loading ? ' pi-spin' : '') + '"></i></button>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Mobil kart görünümü (account-settings.component.html — lg:hidden kart listesi)
  // ---------------------------------------------------------------------------
  function renderMobileFilter() {
    if (state.filterSwitch !== 1) return '';
    const n = activeFilterCount();
    const cust = state.listTab === 'customer';
    const f = state.filterModel;
    return '<div class="rounded-[3px] border border-sky-200 dark:border-sky-500/30 bg-white dark:bg-surface-card shadow-sm">' +
      '<div class="h-11 pl-3 pr-1.5 flex items-center gap-2.5 border-b border-slate-100 dark:border-border-subtle">' +
        '<span class="w-7 h-7 shrink-0 rounded-[2px] flex items-center justify-center bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400"><i class="pi pi-filter text-[11px]"></i></span>' +
        '<span class="flex-1 min-w-0 flex items-center gap-2 text-[13.5px] font-bold text-slate-900 dark:text-slate-100">' + esc(T.filter) +
          '<span data-mfilter-count' + (n ? '' : ' style="display:none"') + ' class="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-sky-600 text-white text-[10px] font-bold tabular-nums">' + n + '</span></span>' +
        '<button type="button" data-act="mfilter-clear" class="h-9 px-2.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-sky-700 dark:text-sky-300 active:bg-sky-100 dark:active:bg-sky-500/20 cursor-pointer"><i class="pi pi-filter-slash text-[11px]"></i><span>Temizle</span></button>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-x-2.5 gap-y-3 p-3">' +
        MOBILE_FILTER_FIELDS.filter(x => (!x.customerOnly || cust) && (!x.corporateOnly || !cust)).map(x =>
          '<div class="min-w-0 relative">' +
            '<label class="block mb-1 text-[10.5px] font-semibold uppercase tracking-wider truncate text-slate-500 dark:text-slate-400">' + esc(T.headers[x.label]) + '</label>' +
            '<input type="text" autocomplete="off" enterkeyhint="search" data-filter="' + x.key + '" data-mfilter value="' + esc(f[x.key]) + '" class="w-full h-10 pl-2.5 pr-2 text-base font-medium rounded-[3px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0b121e] text-slate-900 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500" />' +
          '</div>').join('') +
      '</div>' +
    '</div>';
  }

  function renderCards() {
    const list = filteredUsers();
    if (!list.length) {
      return '<div class="py-10 text-center">' + kit.emptyState({ message: state.loading ? T.noDataOrWaiting : T.noDataToShow, icon: 'pi pi-inbox' }) + '</div>';
    }
    const cust = state.listTab === 'customer';
    return paginatedUsers().map(el => {
      const disp = getDisplayPosition(el.das_grp);
      const vis = state.visiblePwd === el.user_id;
      const pwd = !el.das_pwd
        ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"><i class="pi pi-lock text-[9px]"></i><span>LDAP</span></span>'
        : (vis ? '<span class="text-amber-600 dark:text-amber-400 font-bold break-all select-all">' + esc(el.das_pwd) + '</span>' : '<span class="tracking-widest text-slate-400 select-none">••••••••</span>') +
          '<button type="button" data-pwd-toggle="' + esc(el.user_id) + '" class="w-8 h-8 -my-2 flex items-center justify-center shrink-0 text-slate-400 active:text-slate-600 dark:active:text-slate-200 cursor-pointer"><i class="' + (vis ? 'pi pi-eye-slash' : 'pi pi-eye') + ' text-sm"></i></button>';
      let custHtml = '';
      if (cust) {
        const names = getCustomerNames(el.customer_name);
        const open = state.expandedCustomers.has(el.user_id);
        custHtml = '<div class="col-span-2 min-w-0">' +
          '<dt class="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate mb-0.5">' + esc(T.headers.customer) + '</dt><dd>' +
          (names.length > 2
            ? '<button type="button" data-cust-toggle="' + esc(el.user_id) + '" class="w-full h-9 px-2.5 flex items-center justify-between gap-2 rounded-[3px] border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[12.5px] font-bold cursor-pointer active:bg-sky-100 dark:active:bg-sky-500/20">' +
                '<span class="flex items-center gap-1.5 min-w-0"><i class="pi pi-building text-[12px] shrink-0"></i><span class="truncate">' + names.length + ' ' + esc(T.headers.customer) + '</span></span>' +
                '<i class="pi ' + (open ? 'pi-chevron-up' : 'pi-chevron-down') + ' text-[10px]"></i></button>'
            : '') +
          (names.length <= 2 || open
            ? '<div class="flex flex-wrap gap-1' + (names.length > 2 ? ' mt-1.5' : '') + '">' + (names.length ? names.map(cu => '<span class="inline-block max-w-full whitespace-normal break-words px-1.5 py-0.5 rounded-[2px] text-[11.5px] leading-4 font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25">' + esc(cu) + '</span>').join('') : '<span class="text-slate-400">-</span>') + '</div>'
            : '') +
          '</dd></div>';
      }
      return '<article class="rounded-[3px] border border-slate-200 dark:border-border-subtle bg-white dark:bg-surface-card shadow-2xs px-2.5 py-2">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="min-w-0">' +
            '<div class="text-[14px] font-extrabold leading-snug text-slate-900 dark:text-slate-100 break-words">' + esc(el.name + ' ' + el.surname) + '</div>' +
            '<div class="mt-0.5 flex items-start gap-1.5 text-[12.5px] font-semibold text-sky-700 dark:text-sky-300"><i class="pi pi-user text-[11px] mt-[3px] shrink-0 opacity-80"></i><span class="font-mono break-all">' + esc(el.das_uid) + '</span></div>' +
            '<div class="mt-0.5 flex items-center gap-1.5 text-[12px] font-mono font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap" title="' + esc(T.headers.phoneNumber) + '"><i class="pi pi-phone text-[11px] shrink-0 text-slate-400 dark:text-slate-500"></i><span>' + esc(el.mobile || '-') + '</span></div>' +
            '<div class="mt-0.5 flex items-start gap-1.5 text-[12px] font-semibold" title="' + esc(T.headers.email) + '"><i class="pi pi-envelope text-[11px] mt-[3px] shrink-0 text-slate-400 dark:text-slate-500"></i>' +
              (el.email ? '<a href="mailto:' + esc(el.email) + '" class="min-w-0 break-all text-sky-600 dark:text-sky-400 underline underline-offset-2">' + esc(el.email) + '</a>' : '<span class="text-slate-400">-</span>') + '</div>' +
          '</div>' +
          '<div class="shrink-0 flex flex-col items-end gap-1">' +
            '<span class="inline-block px-1.5 py-0.5 rounded-[2px] text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">' + esc(positionLabel(disp)) + '</span>' +
            '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10.5px] font-bold font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25" title="' + esc(T.headers.twoFactor) + '"><i class="pi pi-shield text-[9.5px]"></i>2FA ' + esc(el.das_cfg || '-') + '</span>' +
            '<span class="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">#' + esc(el.user_id) + '</span>' +
          '</div>' +
        '</div>' +
        '<dl class="mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-2 gap-x-3 gap-y-1.5">' +
          '<div class="col-span-2 flex items-center gap-2 min-w-0"><dt class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">' + esc(T.headers.password) + '</dt>' +
            '<dd class="flex items-center gap-1 min-w-0 font-mono text-[12px] leading-snug">' + pwd + '</dd></div>' +
          '<div class="col-span-2 min-w-0"><dt class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 truncate">' + esc(T.headers.routing) + '</dt>' +
            '<dd class="text-[11.5px] font-mono font-semibold text-slate-700 dark:text-slate-200 break-words leading-snug">' + esc(String(el.das_acl || '-').split(',').join(', ')) + '</dd></div>' +
          custHtml +
        '</dl>' +
      '</article>';
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Rapor (exportReport): Kurumsal / Müşteri kullanıcıları — açık sekmeye ekrandaki arama ve filtreler uygulanır
  // ---------------------------------------------------------------------------
  let reportMenu = null;
  const REPORT_SCOPES = {
    corporate: [
      { id: 'corporate', label: 'Kurumsal kullanıcılar', hint: 'Ekrandaki arama ve filtrelerle' },
      { id: 'customer', label: 'Müşteri kullanıcıları', hint: 'Tüm kayıtlar' }
    ],
    customer: [
      { id: 'corporate', label: 'Kurumsal kullanıcılar', hint: 'Tüm kayıtlar' },
      { id: 'customer', label: 'Müşteri kullanıcıları', hint: 'Ekrandaki arama ve filtrelerle' }
    ]
  };
  const FILTER_HEADER = { user_id: 'id', name: 'name', surname: 'surname', das_uid: 'username', das_pwd: 'password', das_grp: 'position', das_acl: 'routing', das_cfg: 'twoFactor', mobile: 'phoneNumber', email: 'email', customer_name: 'customer', department: 'department', status: 'status', last_login: 'lastLogin' };

  function mountReportMenu() {
    const host = document.getElementById('as-report');
    if (!host || !DCIM.report) return;
    reportMenu = DCIM.report.menu(host, {
      label: 'Rapor al', scopes: REPORT_SCOPES[state.listTab], options: 'limit', unit: 'kullanıcı',
      total: filteredUsers().length, disabled: !USERS.length, onExport: exportReport
    });
  }

  // Kullanıcı listesi raporu. Şifre sütunu rapora yazılmaz; yalnız kimlik doğrulama türü (LDAP / yerel) gösterilir.
  function exportReport(req) {
    const tab = req.scope === 'customer' ? 'customer' : 'corporate';
    const filtered = tab === state.listTab;
    const all = filterUsers(tab, filtered);
    const rows = DCIM.report.applyLimit(all, req);
    const scopeLabel = REPORT_SCOPES[state.listTab].find(s => s.id === tab).label;
    // Şifre süzgecinin değeri rapora yazılmaz
    const filters = filtered ? [state.searchQuery.trim() ? 'arama "' + state.searchQuery.trim() + '"' : '']
      .concat(Object.keys(state.localFilters).map(k => (T.headers[FILTER_HEADER[k]] || k) + ': ' + (k === 'das_pwd' ? '***' : state.localFilters[k])))
      .filter(Boolean) : [];
    const ldap = rows.filter(u => !u.das_pwd).length;
    const position = u => { const p = getDisplayPosition(u.das_grp); return p ? positionLabel(p) : '-'; };
    const H = T.headers;
    const columns = [
      { key: 'id', label: H.id, align: 'right' }, { key: 'name', label: H.name }, { key: 'surname', label: H.surname },
      { key: 'uid', label: H.username }, { key: 'auth', label: 'Kimlik doğrulama' }, { key: 'pos', label: H.position },
      { key: 'acl', label: H.routing }, { key: 'cfg', label: H.twoFactor }, { key: 'mobile', label: H.phoneNumber }, { key: 'email', label: H.email }
    ].concat(tab === 'customer' ? [{ key: 'cust', label: H.customer }] : []);
    DCIM.report.generate({
      title: 'Kullanıcı Listesi Raporu',
      subtitle: [scopeLabel, filters.length ? 'Filtre: ' + filters.join(', ') : '', 'Yönetim · ' + (req.limit ? 'İlk ' + rows.length + ' / ' + all.length : 'Tümü (' + all.length + ')') + ' kullanıcı'].filter(Boolean).join(' · '),
      filename: tab === 'customer' ? 'Musteri_Kullanicilari' : 'Kurumsal_Kullanicilar',
      kpis: [
        { label: 'Kullanıcı', value: rows.length },
        { label: 'LDAP', value: ldap, tone: 'info' },
        { label: 'Yerel şifre', value: rows.length - ldap }
      ],
      sections: [{
        title: scopeLabel,
        columns,
        rows: rows.map(u => ({
          id: u.user_id, name: u.name, surname: u.surname, uid: u.das_uid, auth: u.das_pwd ? 'Yerel şifre' : 'LDAP', pos: position(u),
          acl: String(u.das_acl || '-').split(',').join(', '), cfg: u.das_cfg || '-', mobile: u.mobile || '-', email: u.email || '-',
          cust: getCustomerNames(u.customer_name).join(', ') || '-'
        }))
      }],
      notes: ['Güvenlik gereği şifreler rapora yazılmaz; yalnız kimlik doğrulama türü gösterilir.']
    }, req.format);
  }

  const colCount = () => (state.listTab === 'customer' ? 15 : 14);

  function renderThead() {
    const H = T.headers;
    const cust = state.listTab === 'customer';
    const th = (label, cls) => '<th class="py-2.5 px-3 ' + cls + '">' + esc(label) + '</th>';
    let html = '<tr>' +
      th(H.id, 'w-16') + th(H.name, 'min-w-[120px]') + th(H.surname, 'min-w-[120px]') + th(H.username, 'min-w-[120px]') +
      th(H.password, 'min-w-[130px]') + th(H.position, 'min-w-[110px]') + th(H.department, 'min-w-[150px]') +
      th(H.routing, 'min-w-[140px]') + th(H.twoFactor, 'min-w-[90px]') + th(H.phoneNumber, 'min-w-[130px]') +
      th(H.email, 'min-w-[160px]') + (cust ? th(H.customer, 'min-w-[304px]') : '') +
      th(H.status, 'min-w-[90px]') + th(H.lastLogin, 'min-w-[130px]') + th(H.actions, 'w-24 text-center ' + STICKY_HEAD) +
    '</tr>';
    if (state.filterSwitch === 1) {
      const P = T.placeholders;
      const f = state.filterModel;
      const inp = (key, ph) => '<th class="p-1"><input type="text" data-filter="' + key + '" value="' + esc(f[key]) + '" placeholder="' + esc(ph) + '" class="' + FILTER_INPUT + '" /></th>';
      html += '<tr class="bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 font-normal">' +
        inp('user_id', P.id) + inp('name', P.name) + inp('surname', P.surname) + inp('das_uid', P.username) + inp('das_pwd', P.password) +
        '<th class="p-1 relative">' + (!cust
          ? '<div class="relative"><input type="text" data-filter="das_grp" data-pos-filter value="' + esc(f.das_grp) + '" placeholder="' + esc(P.position) + '" class="' + FILTER_INPUT + '" autocomplete="off" />' +
            '<div data-pos-dd class="hidden ' + DD_PANEL + ' w-full max-h-40"></div></div>'
          : '') + '</th>' +
        inp('department', P.department) + inp('das_acl', P.routing) + inp('das_cfg', P.twoFactor) + inp('mobile', P.phoneNumber) + inp('email', P.email) +
        (cust ? inp('customer_name', P.customer) : '') +
        '<th class="p-1"><select data-filter="status" class="' + FILTER_INPUT + '">' +
          '<option value=""' + (f.status === '' ? ' selected' : '') + '>Tümü</option>' +
          '<option value="active"' + (f.status === 'active' ? ' selected' : '') + '>' + T.status.active + '</option>' +
          '<option value="passive"' + (f.status === 'passive' ? ' selected' : '') + '>' + T.status.passive + '</option>' +
        '</select></th>' +
        inp('last_login', P.lastLogin) +
        '<th class="p-1 ' + STICKY_FILTER + '"></th>' +
      '</tr>';
    }
    return html;
  }

  function renderTbody() {
    const list = filteredUsers();
    if (!list.length) {
      return '<tr><td colspan="' + colCount() + '" class="py-12 text-center">' +
        kit.emptyState({ message: state.loading ? T.noDataOrWaiting : T.noDataToShow, icon: 'pi pi-inbox' }) + '</td></tr>';
    }
    const cust = state.listTab === 'customer';
    return paginatedUsers().map(el => {
      const self = isSessionUser(el);
      const passive = el.status === 'passive';
      const disp = getDisplayPosition(el.das_grp);
      const pwdCell = !el.das_pwd
        ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20" title="LDAP Kullanıcısı"><i class="pi pi-lock text-[9px]"></i><span>LDAP</span></span>'
        : (state.visiblePwd === el.user_id
          ? '<span class="text-amber-500 dark:text-amber-400 font-bold select-all">' + esc(el.das_pwd) + '</span>'
          : '<span class="tracking-widest text-slate-400 select-none">••••••••</span>') +
          '<button type="button" data-pwd-toggle="' + esc(el.user_id) + '" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="' + (state.visiblePwd === el.user_id ? T.tooltips.hidePassword : T.tooltips.showPassword) + '">' +
            '<i class="' + (state.visiblePwd === el.user_id ? 'pi pi-eye-slash text-xs' : 'pi pi-eye text-xs') + '"></i></button>';
      const lockTitle = esc(T.tooltips.selfAccount);
      return '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group' + (state.flashId === el.user_id ? ' as-row-flash' : '') + '">' +
        '<td class="py-2 px-3 font-mono text-slate-500 dark:text-slate-400">' + esc(el.user_id) + '</td>' +
        '<td class="py-2 px-3 font-medium text-slate-900 dark:text-slate-100' + (passive ? ' opacity-60' : '') + '">' + esc(el.name) + '</td>' +
        '<td class="py-2 px-3 font-medium text-slate-900 dark:text-slate-100' + (passive ? ' opacity-60' : '') + '">' + esc(el.surname) + '</td>' +
        '<td class="py-2 px-3 font-mono text-sky-600 dark:text-sky-400 whitespace-nowrap">' + esc(el.das_uid) +
          (self ? '<span class="ml-1.5 px-1 py-0.5 text-[9px] font-bold font-sans rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 align-middle">Oturum</span>' : '') + '</td>' +
        '<td class="py-2 px-3"><div class="flex items-center gap-1.5 font-mono">' + pwdCell + '</div></td>' +
        '<td class="py-2 px-3"><span class="inline-block px-1.5 py-0.5 rounded-[2px] text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">' + esc(positionLabel(disp)) + '</span></td>' +
        '<td class="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">' + esc(el.department || '-') + '</td>' +
        '<td class="py-2 px-3"><div class="max-w-[200px] truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title="' + esc(el.das_acl) + '">' + esc(el.das_acl) + '</div></td>' +
        '<td class="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">' + esc(el.das_cfg) + '</td>' +
        '<td class="py-2 px-3 font-mono text-[11px] whitespace-nowrap">' + esc(el.mobile) + '</td>' +
        '<td class="py-2 px-3">' + (el.email ? '<a href="mailto:' + esc(el.email) + '" class="text-sky-600 dark:text-sky-400 hover:underline">' + esc(el.email) + '</a>' : '') + '</td>' +
        // Müşteriler chip olarak listelenir; sığmazsa hücre içinde dikey kaydırılır
        (cust ? '<td class="py-2 px-3 align-middle"><div class="flex flex-wrap items-start content-start gap-1 w-[280px] max-h-[52px] overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:thin]">' +
          getCustomerNames(el.customer_name).map(cu => '<span class="inline-block max-w-full whitespace-normal break-words px-1.5 py-px rounded-[2px] text-[11px] leading-4 font-semibold bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/25">' + esc(cu) + '</span>').join('') + '</div></td>' : '') +
        '<td class="py-2 px-3 whitespace-nowrap">' + statusBadge(passive ? 'passive' : 'active', passive ? T.status.passive : T.status.active) + '</td>' +
        '<td class="py-2 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">' + (el.last_login ? esc(fmtDateTime(el.last_login)) : '-') + '</td>' +
        '<td class="py-2 px-3 text-center ' + STICKY_CELL + '"><div class="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">' +
          '<button type="button" data-row-edit="' + esc(el.user_id) + '" class="p-1 rounded-[2px] text-slate-400 hover:text-sky-500 hover:bg-sky-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer" title="' + esc(T.tooltips.edit) + '"><i class="pi pi-pencil text-xs"></i></button>' +
          '<button type="button" data-row-status="' + esc(el.user_id) + '"' + (self ? ' disabled' : '') + ' class="p-1 rounded-[2px] text-slate-400 ' + (passive ? 'hover:text-emerald-500 hover:bg-emerald-500/10' : 'hover:text-amber-500 hover:bg-amber-500/10') + ' transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer" title="' + (self ? lockTitle : esc(passive ? T.tooltips.activate : T.tooltips.deactivate)) + '"><i class="' + (passive ? 'pi pi-check-circle' : 'pi pi-ban') + ' text-xs"></i></button>' +
          '<button type="button" data-row-del="' + esc(el.user_id) + '"' + (self ? ' disabled' : '') + ' class="p-1 rounded-[2px] text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer" title="' + (self ? lockTitle : esc(T.tooltips.delete)) + '"><i class="pi pi-trash text-xs"></i></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  // Filtre yazarken odağı korumak için yalnız gövde/sayaç/sayfalama güncellenir
  function refreshBody() {
    const tb = document.getElementById('as-tbody');
    if (!tb) return render();
    tb.innerHTML = renderTbody();
    const cards = document.getElementById('as-cards');
    if (cards) cards.innerHTML = renderCards();
    // Dolu filtre alanı sayısı: mobil Filtre düğmesi ve panel başlığındaki rozet
    const n = activeFilterCount();
    root.querySelectorAll('[data-filter-count], [data-mfilter-count]').forEach(b => { b.textContent = n; b.style.display = n ? '' : 'none'; });
    const clr = root.querySelector('[data-act="msearch-clear"]');
    if (clr) clr.classList.toggle('hidden', !state.searchQuery);
    const ri = root.querySelector('[data-refresh-icon]');
    if (ri) ri.classList.toggle('pi-spin', state.loading);
    if (reportMenu) reportMenu.update({ total: filteredUsers().length });
    const total = document.getElementById('as-total');
    if (total) total.textContent = filteredUsers().length;
    const pager = document.getElementById('as-pager');
    if (pager) pager.innerHTML = renderPager();
    const con = document.getElementById('as-con');
    if (con) con.innerHTML = conBadge();
  }

  // ---------------------------------------------------------------------------
  // Liste işlemleri
  // ---------------------------------------------------------------------------
  function selectListTab(tab) {
    state.listTab = tab;
    state.pageOfs = 0;
    state.pageInput = 1;
    state.filterModel = emptyFilter();
    state.localFilters = {};
    state.searchQuery = '';
    state.visiblePwd = null;
    render();
  }
  function inputFilter() {
    state.pageOfs = 0;
    state.pageInput = 1;
    const nf = {};
    Object.keys(state.filterModel).forEach(k => {
      const v = String(state.filterModel[k] || '').trim();
      if (v !== '') nf[k] = k === 'status' ? v : trLower(v);
    });
    state.localFilters = nf;
    refreshBody();
  }
  function openFilter() {
    state.filterSwitch = state.filterSwitch === 1 ? 0 : 1;
    if (state.filterSwitch === 0) {
      state.filterModel = emptyFilter();
      state.localFilters = {};
      state.pageOfs = 0;
      state.pageInput = 1;
    }
    render();
  }
  function goPage(which) {
    const tp = totalPages();
    if (which === 'first' && state.pageOfs > 0) state.pageOfs = 0;
    else if (which === 'prev' && state.pageOfs > 0) state.pageOfs--;
    else if (which === 'next' && state.pageOfs + 1 < tp) state.pageOfs++;
    else if (which === 'last' && tp > 0 && state.pageOfs < tp - 1) state.pageOfs = tp - 1;
    else return;
    state.pageInput = state.pageOfs + 1;
    refreshBody();
  }
  function onPageInputSubmit(raw) {
    const tp = totalPages();
    let target = Math.round(Number(raw));
    if (!target) { state.pageInput = state.pageOfs + 1; refreshBody(); return; }
    if (target < 1) target = 1;
    else if (tp > 0 && target > tp) target = tp;
    state.pageInput = target;
    state.pageOfs = target - 1;
    refreshBody();
  }
  function onPageSizeChange(raw) {
    let n = Math.round(Number(raw)) || 50;
    if (n > 999) n = 999; else if (n < 1) n = 1;
    state.pageRng = n;
    state.pageOfs = 0;
    state.pageInput = 1;
    render();
  }
  function onRefreshData() {
    state.loading = true;
    refreshBody();
    setTimeout(() => {
      state.loading = false;
      const tp = totalPages();
      if (tp > 0 && state.pageInput > tp) { state.pageInput = tp; state.pageOfs = tp - 1; }
      refreshBody();
    }, 650);
  }
  function flash(id) {
    state.flashId = id;
    setTimeout(() => { if (state.flashId === id) state.flashId = null; }, 2600);
  }
  function showUserPage(user) {
    const want = isUserCustomer(user) ? 'customer' : 'corporate';
    if (state.listTab !== want) {
      state.listTab = want;
      state.filterModel = emptyFilter();
      state.localFilters = {};
    }
    const idx = filteredUsers().findIndex(u => u.user_id === user.user_id);
    state.pageOfs = idx >= 0 ? Math.floor(idx / state.pageRng) : 0;
    state.pageInput = state.pageOfs + 1;
  }

  function deleteUser(user) {
    // Mobilde ekleme / düzenleme / silme / yetkilendirme yok (yalnızca görüntüleme)
    if (!user || isMobile()) return;
    dialog({
      title: T.deleteModal.title,
      variant: 'danger',
      confirmLabel: T.deleteModal.confirm,
      cancelLabel: T.deleteModal.cancel,
      body: '<div class="space-y-3">' +
        '<p class="text-sm text-slate-800 dark:text-slate-200">' + esc(T.deleteModal.question) + '</p>' +
        '<div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[2px] font-mono text-xs">' +
          '<span class="font-bold text-slate-900 dark:text-slate-100">' + esc(user.name + ' ' + user.surname) + '</span>' +
          '<span class="text-slate-500 dark:text-slate-400"> (' + esc(user.das_uid) + ')</span>' +
        '</div>' +
        '<p class="text-xs text-rose-500 font-semibold flex items-center gap-1.5"><i class="pi pi-exclamation-triangle"></i><span>' + esc(T.deleteModal.warning) + '</span></p>' +
      '</div>',
      onConfirm() {
        USERS = USERS.filter(u => u.user_id !== user.user_id);
        const tp = totalPages();
        if (tp > 0 && state.pageOfs > tp - 1) { state.pageOfs = tp - 1; state.pageInput = tp; }
        refreshBody();
        toast('Kullanıcı Silindi: ' + user.name + ' ' + user.surname, 'success', T.alerts.success);
      }
    });
  }

  function toggleStatus(user) {
    user.status = user.status === 'passive' ? 'active' : 'passive';
    flash(user.user_id);
    refreshBody();
    const label = user.name + ' ' + user.surname + ' (' + user.das_uid + ')';
    if (user.status === 'passive') toast(label + ' pasif duruma alındı; oturum açamaz.', 'warning', 'Kullanıcı Pasif');
    else toast(label + ' yeniden aktif edildi.', 'success', 'Kullanıcı Aktif');
  }

  // Mobil arama kutusu
  function onSearchChange(v) {
    state.searchQuery = v;
    state.pageOfs = 0;
    state.pageInput = 1;
    const inp = document.getElementById('as-msearch');
    if (inp && inp.value !== v) inp.value = v;
    refreshBody();
  }
  // Mobil filtre panelindeki "Temizle": tüm alan filtrelerini ve aramayı sıfırlar (panel açık kalır)
  function clearAllFilters() {
    state.filterModel = emptyFilter();
    state.localFilters = {};
    state.searchQuery = '';
    state.pageOfs = 0;
    state.pageInput = 1;
    render();
  }

  // Pozisyon filtresi açılır listesi (filterPositionDropdown)
  function updatePositionDropdown(show) {
    const dd = root.querySelector('[data-pos-dd]');
    if (!dd) return;
    const search = trLower(state.filterModel.das_grp);
    const list = search ? CORP_POSITIONS.filter(p => trLower(p).indexOf(search) >= 0 || trLower(positionLabel(p)).indexOf(search) >= 0) : CORP_POSITIONS.slice();
    if (!show || !list.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = list.map(p => '<div data-pos-pick="' + esc(p) + '" class="' + DD_ITEM + ' normal-case tracking-normal font-normal">' + esc(positionLabel(p)) + '</div>').join('');
    dd.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // Olaylar — ana görünüm
  // ---------------------------------------------------------------------------
  root.addEventListener('click', e => {
    const t = e.target.closest('button, [data-list-tab]');
    if (!t || !root.contains(t) || t.disabled) return;
    const find = id => USERS.find(u => u.user_id === id);
    if (t.hasAttribute('data-list-tab')) return selectListTab(t.getAttribute('data-list-tab'));
    if (t.hasAttribute('data-page')) return goPage(t.getAttribute('data-page'));
    if (t.hasAttribute('data-pwd-toggle')) {
      e.stopPropagation();
      const id = t.getAttribute('data-pwd-toggle');
      state.visiblePwd = state.visiblePwd === id ? null : id;
      refreshBody();
      return;
    }
    if (t.hasAttribute('data-row-edit')) { e.stopPropagation(); return rowClickSelect(find(t.getAttribute('data-row-edit'))); }
    if (t.hasAttribute('data-row-del')) { e.stopPropagation(); return deleteUser(find(t.getAttribute('data-row-del'))); }
    if (t.hasAttribute('data-row-status')) { e.stopPropagation(); return toggleStatus(find(t.getAttribute('data-row-status'))); }
    if (t.hasAttribute('data-pw-eye')) return togglePwEye(t);
    if (t.hasAttribute('data-cust-toggle')) {
      const id = t.getAttribute('data-cust-toggle');
      if (state.expandedCustomers.has(id)) state.expandedCustomers.delete(id); else state.expandedCustomers.add(id);
      return refreshBody();
    }
    switch (t.getAttribute('data-act')) {
      case 'filter': return openFilter();
      case 'refresh': return onRefreshData();
      case 'add': return openAddModal(state.listTab === 'customer' ? 'customer' : 'corporate');
      case 'perm-pages': if (!isMobile()) window.location.href = 'permission-settings.html'; return;
      // Müşteri yetkilendirme artık ayrı sayfa: seçili kullanıcı (varsa) ?uid= ile taşınır
      case 'cust-auth': if (!isMobile()) window.location.href = CUST_AUTH_URL(lastRecordUid); return;
      case 'msearch-clear': return onSearchChange('');
      case 'mfilter-clear': return clearAllFilters();
      case 'pw-clear': return clearPasswordForm();
      case 'pw-submit': return submitPasswordChange();
    }
  });
  root.addEventListener('input', e => {
    const key = e.target.getAttribute('data-filter');
    if (key && e.target.tagName === 'INPUT') {
      state.filterModel[key] = e.target.value;
      if (e.target.hasAttribute('data-pos-filter')) updatePositionDropdown(true);
      inputFilter();
    }
    if (e.target.id === 'as-msearch') onSearchChange(e.target.value);
    if (e.target.hasAttribute('data-pw')) updatePasswordState();
  });
  root.addEventListener('change', e => {
    const key = e.target.getAttribute('data-filter');
    if (key && e.target.tagName === 'SELECT') { state.filterModel[key] = e.target.value; inputFilter(); }
    if (e.target.id === 'as-page-input') onPageInputSubmit(e.target.value);
    if (e.target.id === 'as-page-size') onPageSizeChange(e.target.value);
  });
  root.addEventListener('keyup', e => {
    if (e.key === 'Enter' && e.target.id === 'as-page-input') onPageInputSubmit(e.target.value);
    if (e.key === 'Enter' && e.target.hasAttribute('data-pw')) submitPasswordChange();
  });
  root.addEventListener('focusin', e => { if (e.target.hasAttribute('data-pos-filter')) updatePositionDropdown(true); });
  root.addEventListener('focusout', e => { if (e.target.hasAttribute('data-pos-filter')) setTimeout(() => updatePositionDropdown(false), 200); });
  root.addEventListener('mousedown', e => {
    const p = e.target.closest('[data-pos-pick]');
    if (!p) return;
    state.filterModel.das_grp = p.getAttribute('data-pos-pick');
    const inp = root.querySelector('[data-pos-filter]');
    if (inp) inp.value = state.filterModel.das_grp;
    updatePositionDropdown(false);
    inputFilter();
  });
  // Tablo dışına tıklanınca görünür şifreyi gizle (onDocumentClick → hideAllPasswords)
  document.addEventListener('click', e => {
    const tbl = document.getElementById('as-table');
    if (state.visiblePwd && tbl && !tbl.contains(e.target)) { state.visiblePwd = null; refreshBody(); }
  });

  // ===========================================================================
  // Ekle / Güncelle modalı
  // ===========================================================================
  let modal = null;
  const emptyRecord = () => ({ user_id: '', name: '', surname: '', mobile: '', email: '', das_uid: '', das_pwd: '', das_kid: '', das_grp: '', das_acl: '', das_cfg: '', customer_name: '', cdb_id: '', country_code: '', department: '', status: 'active' });

  let lastRecordUid = ''; // newRecord?.das_uid — Müşteri Yetkilendirme sayfasına taşınır

  function openAddModal(type) {
    // Mobilde ekleme / düzenleme / silme / yetkilendirme yok (yalnızca görüntüleme)
    if (isMobile()) return;
    modal = { mode: 'add', tab: type, rec: emptyRecord(), sel: [], custSelectVisible: false, pwdVisible: false, custSearch: '', submitting: false, el: null };
    mountModal();
  }

  // rowClickSelect — kaydı modala yükle, telefonu ülke kodu + maske biçimine ayır
  function rowClickSelect(rec) {
    if (!rec || isMobile()) return;
    lastRecordUid = rec.das_uid || '';
    const r = Object.assign(emptyRecord(), rec);
    const sel = [];
    if (r.cdb_id && r.cdb_id.trim() !== '') {
      r.cdb_id.split(',').map(s => s.trim()).forEach(id => {
        const found = CUSTOMER_LIST.find(c => c.cdb_id === id);
        if (found) sel.push(found);
      });
    } else if (r.customer_name && r.customer_name.trim() !== '') {
      r.customer_name.split(',').map(s => s.trim()).forEach(name => sel.push(CUSTOMER_LIST.find(c => c.customer_name === name) || { cdb_id: '', customer_name: name }));
    }
    const orig = r.mobile || '';
    const digits = orig.replace(/\D/g, '');
    let cc = '';
    let num = '';
    if (orig.startsWith('+') && digits.length > 10) {
      num = digits.slice(-10);
      cc = digits.substring(0, digits.length - 10);
    } else {
      const sorted = COUNTRY_CODES.slice().sort((a, b) => b.code.length - a.code.length);
      const m = sorted.find(c => digits.startsWith(c.code) && digits.length - c.code.length === 10);
      if (m) { cc = m.code; num = digits.substring(m.code.length); } else num = digits;
    }
    r.country_code = cc;
    r.mobile = cc && num.length === 10
      ? '(' + num.substring(0, 3) + ') ' + num.substring(3, 6) + ' ' + num.substring(6, 8) + ' ' + num.substring(8, 10)
      : num;
    modal = { mode: 'update', tab: isUserCustomer(rec) ? 'customer' : 'corporate', rec: r, sel, custSelectVisible: false, pwdVisible: false, custSearch: '', submitting: false, el: null, orig: rec };
    mountModal();
  }

  function closeModal() {
    if (!modal) return;
    if (modal.el) modal.el.remove();
    document.removeEventListener('keydown', onModalKey);
    modal = null;
  }
  function onModalKey(e) {
    if (e.key === 'Escape' && modal && !document.querySelector('[data-dialog-panel]')) closeModal();
  }

  function isFormValid() {
    const r = modal.rec;
    const has = v => String(v || '').trim() !== '';
    if (!has(r.name) || !has(r.surname) || !has(r.das_uid) || !has(r.country_code)) return false;
    if (modal.tab === 'corporate' && !has(r.das_grp)) return false;
    if (modal.tab === 'customer' && (!has(r.email) || !r.das_pwd)) return false;
    if (modal.mode === 'add') return isPhoneValid(r.mobile);
    return !r.mobile || isPhoneValid(r.mobile);
  }
  function updateSubmitState() {
    if (!modal || !modal.el) return;
    const btn = modal.el.querySelector('[data-m-submit]');
    if (btn) btn.disabled = !isFormValid() || modal.submitting;
  }

  function modalHtml() {
    const m = modal;
    const r = m.rec;
    const corp = m.tab === 'corporate';
    const isAdd = m.mode === 'add';
    const MT = T.modal;
    const tabBtn = (key, label) => '<button type="button" data-mtab="' + key + '" class="' +
      (m.tab === key ? 'bg-sky-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300') +
      ' px-3 py-1 text-xs rounded-[2px] transition-colors">' + esc(label) + '</button>';
    const field = (label, control) => '<div><label class="' + M_LABEL + '">' + esc(label) + '</label>' + control + '</div>';
    const text = (f, extra) => '<input type="text" data-f="' + f + '" value="' + esc(r[f]) + '" class="' + M_INPUT + (extra || '') + '" />';

    const pwdField = !corp ? field(MT.password,
      '<div class="relative flex items-center">' +
        '<input type="' + (m.pwdVisible ? 'text' : 'password') + '" data-f="das_pwd" value="' + esc(r.das_pwd) + '" class="scada-input w-full pl-2.5 pr-16 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" autocomplete="new-password" />' +
        '<div class="absolute right-1.5 flex items-center gap-1">' +
          '<button type="button" data-m-pwd-vis class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="' + esc(m.pwdVisible ? T.tooltips.hidePassword : T.tooltips.showPassword) + '"><i class="' + (m.pwdVisible ? 'pi pi-eye-slash text-xs' : 'pi pi-eye text-xs') + '"></i></button>' +
          '<button type="button" data-m-pwd-gen class="p-1 text-sky-500 hover:text-sky-600" title="' + esc(T.tooltips.generatePassword) + '"><i class="pi pi-refresh text-xs"></i></button>' +
        '</div>' +
      '</div>') : '';
    const posField = corp ? field(MT.position,
      '<select data-f="das_grp" class="scada-select w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
        '<option value="" disabled' + (!r.das_grp ? ' selected' : '') + '>' + esc(T.placeholders.selectPosition) + '</option>' +
        CORP_POSITIONS.map(p => '<option value="' + esc(trLower(p)) + '"' + (trLower(r.das_grp) === trLower(p) ? ' selected' : '') + '>' + esc(positionLabel(p)) + '</option>').join('') +
      '</select>') : '';

    // Müşteri seçimi (chip + otomatik tamamlama)
    const chips = m.sel.length
      ? '<div class="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-[2px]' + (isAdd ? '' : ' mb-1.5') + '">' +
          m.sel.map((c, i) => '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-xs font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30"><span>' + esc(c.customer_name) + '</span>' +
            '<button type="button" data-chip-rm="' + i + '" class="text-sky-500 hover:text-rose-500 transition-colors">×</button></span>').join('') +
          (!m.custSelectVisible ? '<button type="button" data-chip-add class="px-2 py-0.5 rounded-[2px] text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-sky-600 hover:text-white transition-colors" title="' + esc(T.tooltips.addNewCustomer) + '">+</button>' : '') +
        '</div>'
      : '';
    const search = (!m.sel.length || m.custSelectVisible)
      ? '<div class="relative"><div class="flex items-center gap-1">' +
          '<input type="text" data-cust-search value="' + esc(m.custSearch) + '" placeholder="' + esc(T.placeholders.searchCustomer) + '" class="scada-input flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100" autocomplete="off" />' +
          (m.sel.length ? '<button type="button" data-cust-cancel class="px-2 py-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="' + esc(T.tooltips.cancel) + '">×</button>' : '') +
        '</div><div data-cust-dd class="hidden ' + DD_PANEL + ' w-full max-h-48"></div></div>'
      : '';
    const customerSection = corp ? '' : isAdd
      ? '<div class="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">' +
          '<div class="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-1">' + esc(T.headers.customer) + '</div>' +
          '<label class="block text-[11px] font-medium text-slate-700 dark:text-slate-300">' + esc(MT.customers) + '</label>' + chips + search +
        '</div>'
      : '<div class="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">' +
          '<div class="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">' + esc(MT.customerAndAuth) + '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">' +
            '<div><label class="' + M_LABEL + '">' + esc(MT.customers) + '</label>' + chips + search + '</div>' +
            '<div><label class="' + M_LABEL + '">' + esc(MT.authorization) + '</label>' +
              '<button type="button" data-m-open-auth class="w-full px-3 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-900/50 rounded-[2px] transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"><i class="pi pi-shield text-xs"></i><span>' + esc(MT.authSettings) + '</span></button>' +
            '</div>' +
          '</div>' +
        '</div>';

    return '<div class="as-modal bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all animate-modal-pop" data-m-panel>' +
      '<div class="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60">' +
        '<div class="flex items-center gap-2.5">' +
          '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs bg-sky-500/10 text-sky-500 border border-sky-500/20"><i class="' + (isAdd ? 'pi pi-user-plus' : 'pi pi-user-edit') + '"></i></span>' +
          '<div><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' +
            esc(isAdd ? (corp ? MT.newCorporate : MT.newCustomer) : (corp ? MT.editCorporate : MT.editCustomer)) + '</h3>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400">' +
              esc(isAdd ? (corp ? T.corporateUsers : T.customerUsers) : (m.orig.name + ' ' + m.orig.surname + ' (' + m.orig.das_uid + ')')) + '</p></div>' +
        '</div>' +
        '<button type="button" data-m-close class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800" title="' + esc(T.tooltips.close) + '"><i class="pi pi-times text-xs"></i></button>' +
      '</div>' +
      '<div class="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">' +
        (isAdd ? '<div class="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">' + tabBtn('corporate', T.corporateUsers) + tabBtn('customer', T.customerUsers) + '</div>' : '') +
        '<div>' +
          '<div class="' + M_SECTION + '">' + esc(MT.userIdentityInfo) + '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
            field(MT.name, text('name')) + field(MT.surname, text('surname')) +
            field(corp ? MT.employeeNo : MT.username, text('das_uid', ' font-mono')) +
            pwdField + posField +
            // Sunum eklentisi alanlar
            field(MT.department, text('department')) +
            field(MT.status, '<select data-f="status" class="scada-select w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500">' +
              '<option value="active"' + (r.status !== 'passive' ? ' selected' : '') + '>' + T.status.active + '</option>' +
              '<option value="passive"' + (r.status === 'passive' ? ' selected' : '') + '>' + T.status.passive + '</option></select>') +
          '</div>' +
        '</div>' +
        '<div class="pt-2 border-t border-slate-200 dark:border-slate-800">' +
          '<div class="' + M_SECTION + '">' + esc(MT.contactDetails) + '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
            '<div><label class="' + M_LABEL + '">' + esc(MT.phoneNumber) + '</label>' +
              '<div class="flex gap-1.5">' +
                '<div class="relative w-28 shrink-0">' +
                  '<input type="text" data-country value="' + esc(r.country_code) + '" placeholder="' + esc(T.placeholders.countryCode) + '" class="scada-input w-full px-2 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 font-mono text-center" autocomplete="off" />' +
                  '<div data-country-dd class="hidden ' + DD_PANEL + ' w-52 max-h-40"></div>' +
                '</div>' +
                '<input type="text" data-phone placeholder="(5__) ___ __ __" value="' + esc(r.mobile) + '"' + (r.country_code ? '' : ' disabled') + ' class="scada-input flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 font-mono disabled:opacity-50" />' +
              '</div>' +
            '</div>' +
            field(corp ? MT.email : MT.emailRequired, '<input type="email" data-f="email" value="' + esc(r.email) + '" class="' + M_INPUT + '" />') +
          '</div>' +
        '</div>' +
        customerSection +
      '</div>' +
      '<div class="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2">' +
        button({ variant: 'ghost', size: 'sm', label: MT.cancel, attrs: 'data-m-close' }) +
        '<button type="button" data-m-submit' + (!isFormValid() || m.submitting ? ' disabled' : '') + ' class="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-[2px] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5">' +
          '<i class="' + (m.submitting ? 'pi pi-spin pi-spinner' : 'pi pi-check') + ' text-xs"></i><span>' + esc(isAdd ? MT.save : MT.update) + '</span></button>' +
      '</div>' +
    '</div>';
  }

  function mountModal() {
    if (!modal.el) {
      const host = document.createElement('div');
      host.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-4 animate-fade-in';
      document.body.appendChild(host);
      modal.el = host;
      bindModal(host);
      document.addEventListener('keydown', onModalKey);
    }
    modal.el.innerHTML = modalHtml();
  }

  // selectTab (modal içi Kurumsal/Müşteri)
  function selectModalTab(tab) {
    modal.tab = tab;
    if (tab === 'customer' && !modal.rec.das_grp) modal.rec.das_grp = 'musteri';
    if (tab === 'corporate' && (modal.rec.das_grp === 'müşteri' || modal.rec.das_grp === 'musteri')) modal.rec.das_grp = '';
    mountModal();
  }

  // Ülke kodu açılır listesi
  function updateCountryDropdown(show) {
    const dd = modal && modal.el.querySelector('[data-country-dd]');
    if (!dd) return;
    const s = trLower(modal.rec.country_code);
    const list = s ? COUNTRY_CODES.filter(c => trLower(c.name).indexOf(s) >= 0 || c.code.indexOf(s) >= 0) : COUNTRY_CODES.slice();
    if (!show || !list.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = list.map(c => '<div data-country-pick="' + c.code + '" class="' + DD_ITEM + '">' + esc(c.name) + '</div>').join('');
    dd.classList.remove('hidden');
  }
  function setCountry(code) {
    modal.rec.country_code = code;
    const inp = modal.el.querySelector('[data-country]');
    if (inp) inp.value = code;
    const ph = modal.el.querySelector('[data-phone]');
    if (ph) ph.disabled = !code;
    updateSubmitState();
  }

  // Müşteri açılır listesi (filterCustomerDropdown)
  function filteredCustomers() {
    const s = trLower(modal.custSearch);
    return CUSTOMER_LIST.filter(c => !modal.sel.some(x => x.cdb_id === c.cdb_id) && (!s || trLower(c.customer_name).indexOf(s) >= 0));
  }
  function updateCustomerDropdown(show) {
    const dd = modal && modal.el.querySelector('[data-cust-dd]');
    if (!dd) return;
    const list = filteredCustomers();
    if (!show || !list.length) { dd.classList.add('hidden'); return; }
    dd.innerHTML = list.map(c => '<div data-cust-pick="' + esc(c.cdb_id) + '" class="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 cursor-pointer">' + esc(c.customer_name) + '</div>').join('');
    dd.classList.remove('hidden');
  }
  function selectCustomer(c) {
    if (!c) return;
    if (!modal.sel.some(x => x.cdb_id === c.cdb_id)) modal.sel.push(c);
    modal.custSelectVisible = false;
    modal.custSearch = '';
    mountModal();
  }

  // onPhoneFocus / formatMobileNumber (TS'ten birebir)
  function onPhoneFocus(input) {
    const d = input.value.replace(/\D/g, '');
    if (d.length <= 1) {
      const mask = '(5__) ___ __ __';
      modal.rec.mobile = mask;
      input.value = mask;
      requestAnimationFrame(() => input.setSelectionRange(3, 3));
      updateSubmitState();
    }
  }
  function formatMobileNumber(e) {
    const input = e.target;
    const isBackspace = e.inputType === 'deleteContentBackward';
    let d = input.value.replace(/\D/g, '');
    if (isBackspace) {
      const prev = String(modal.rec.mobile || '').replace(/\D/g, '');
      if (prev.length > 1) d = prev.slice(0, -1);
    }
    if (!d.startsWith('5') || d.length === 0) d = '5';
    d = d.substring(0, 10);
    const c = i => d.charAt(i) || '_';
    const val = '(5' + c(1) + c(2) + ') ' + c(3) + c(4) + c(5) + ' ' + c(6) + c(7) + ' ' + c(8) + c(9);
    modal.rec.mobile = val;
    input.value = val;
    requestAnimationFrame(() => {
      let pos = input.value.indexOf('_');
      if (pos === -1) pos = input.value.length;
      if (isBackspace && pos > 3) {
        const last = val.lastIndexOf(d[d.length - 1]);
        input.setSelectionRange(last + 1, last + 1);
      } else input.setSelectionRange(pos, pos);
    });
    updateSubmitState();
  }

  function generatePassword() {
    const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let p = '';
    for (let i = 0; i < 10; i++) p += cs.charAt(Math.floor(Math.random() * cs.length));
    modal.rec.das_pwd = p;
    const inp = modal.el.querySelector('[data-f="das_pwd"]');
    if (inp) inp.value = p;
    updateSubmitState();
  }

  function bindModal(host) {
    host.addEventListener('click', e => {
      if (e.target === host) return closeModal();
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-m-close')) return closeModal();
      if (b.hasAttribute('data-mtab')) return selectModalTab(b.getAttribute('data-mtab'));
      if (b.hasAttribute('data-m-pwd-vis')) { modal.pwdVisible = !modal.pwdVisible; return mountModal(); }
      if (b.hasAttribute('data-m-pwd-gen')) return generatePassword();
      if (b.hasAttribute('data-chip-rm')) { modal.sel.splice(Number(b.getAttribute('data-chip-rm')), 1); return mountModal(); }
      if (b.hasAttribute('data-chip-add')) {
        modal.custSelectVisible = true;
        mountModal();
        const s = modal.el.querySelector('[data-cust-search]');
        if (s) s.focus();
        return;
      }
      if (b.hasAttribute('data-cust-cancel')) { modal.custSelectVisible = false; modal.custSearch = ''; return mountModal(); }
      // Müşteri yetkilendirme artık ayrı sayfa (customer-authorization.html?uid=)
      if (b.hasAttribute('data-m-open-auth')) { window.location.href = CUST_AUTH_URL(modal.rec.das_uid); return; }
      if (b.hasAttribute('data-m-submit')) return submitModal();
    });
    host.addEventListener('input', e => {
      const t = e.target;
      const f = t.getAttribute('data-f');
      if (f) { modal.rec[f] = t.value; updateSubmitState(); return; }
      if (t.hasAttribute('data-phone')) return formatMobileNumber(e);
      if (t.hasAttribute('data-country')) {
        modal.rec.country_code = t.value;
        const ph = modal.el.querySelector('[data-phone]');
        if (ph) ph.disabled = !t.value;
        updateCountryDropdown(true);
        updateSubmitState();
        return;
      }
      if (t.hasAttribute('data-cust-search')) { modal.custSearch = t.value; updateCustomerDropdown(true); }
    });
    host.addEventListener('change', e => {
      const f = e.target.getAttribute('data-f');
      if (f && e.target.tagName === 'SELECT') { modal.rec[f] = e.target.value; updateSubmitState(); }
    });
    host.addEventListener('focusin', e => {
      const t = e.target;
      if (t.hasAttribute('data-phone')) onPhoneFocus(t);
      else if (t.hasAttribute('data-country')) updateCountryDropdown(true);
      else if (t.hasAttribute('data-cust-search')) updateCustomerDropdown(true);
    });
    host.addEventListener('focusout', e => {
      const t = e.target;
      if (t.hasAttribute('data-country')) setTimeout(() => { if (modal) updateCountryDropdown(false); }, 200);
      else if (t.hasAttribute('data-cust-search')) {
        // hideCustomerDropdown — tam eşleşme varsa seç, yoksa aramayı temizle
        setTimeout(() => {
          if (!modal || !modal.el.contains(t)) return;
          updateCustomerDropdown(false);
          const term = trLower(modal.custSearch).trim();
          if (!term) return;
          const exact = CUSTOMER_LIST.find(c => trLower(c.customer_name) === term && !modal.sel.some(s => s.cdb_id === c.cdb_id));
          if (exact) selectCustomer(exact);
          else { modal.custSearch = ''; t.value = ''; }
        }, 200);
      }
    });
    host.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.hasAttribute('data-cust-search')) {
        e.preventDefault();
        const list = filteredCustomers();
        if (list.length) selectCustomer(list[0]);
        else { modal.custSearch = ''; e.target.value = ''; }
      }
    });
    host.addEventListener('mousedown', e => {
      const cp = e.target.closest('[data-country-pick]');
      if (cp) { e.preventDefault(); setCountry(cp.getAttribute('data-country-pick')); updateCountryDropdown(false); return; }
      const cu = e.target.closest('[data-cust-pick]');
      if (cu) { e.preventDefault(); selectCustomer(CUSTOMER_LIST.find(c => c.cdb_id === cu.getAttribute('data-cust-pick'))); }
    });
  }

  // submitAddForm / updateAddForm
  function submitModal() {
    if (!modal || modal.submitting || !isFormValid()) return;
    const m = modal;
    const r = m.rec;
    if (m.tab === 'customer' && !isEmailValid(r.email)) { toast(T.alerts.invalidEmail, 'error'); return; }
    if (m.mode === 'add' && r.country_code && r.mobile && !isPhoneValid(r.mobile)) { toast(T.alerts.invalidPhone, 'error'); return; }
    m.submitting = true;
    updateSubmitState();
    const ic = m.el.querySelector('[data-m-submit] i');
    if (ic) ic.className = 'pi pi-spin pi-spinner text-xs';

    setTimeout(() => {
      const p = Object.assign({}, r);
      p.das_uid = String(p.das_uid || '').trim();
      if (m.tab === 'customer') {
        p.customer_name = m.sel.map(c => c.customer_name).join(',').substring(0, 4000);
        p.cdb_id = m.sel.map(c => c.cdb_id).filter(Boolean).join(',');
        p.das_grp = 'müşteri';
        if (!p.das_acl || p.das_acl.indexOf('???') !== -1) p.das_acl = DEFAULT_CUSTOMER_ACL;
      } else {
        p.customer_name = '';
        p.das_pwd = '';
        if (m.mode === 'add') p.cdb_id = '';
        // Eski INSERT sorgusundaki CASE: pozisyona göre varsayılan ACL
        if (m.mode === 'add' || !p.das_acl) p.das_acl = A.aclByGroup[p.das_grp] || '';
      }
      const cc = String(p.country_code || '').replace(/\D/g, '');
      const sub = String(p.mobile || '').replace(/\D/g, '');
      p.mobile = cc && sub.length === 10 ? '+' + cc + sub : '';
      delete p.country_code;
      p.department = String(p.department || '').trim();
      const logUser = p.das_uid || (r.name + ' ' + r.surname);

      let saved;
      if (m.mode === 'add') {
        const maxId = USERS.reduce((mx, u) => Math.max(mx, Number(u.user_id) || 0), 0);
        saved = Object.assign(p, {
          user_id: String(maxId + 1),
          das_kid: '0',
          das_cfg: p.das_cfg || '0x0000',
          last_login: null
        });
        USERS.push(saved);
        toast('Yeni Kullanıcı Eklendi: ' + logUser, 'success', T.alerts.success);
      } else {
        saved = Object.assign(m.orig, p, { user_id: m.orig.user_id, last_login: m.orig.last_login });
        toast('Kullanıcı Güncellendi: ' + logUser, 'success', T.alerts.success);
      }
      closeModal();
      state.filterModel = emptyFilter();
      state.localFilters = {};
      showUserPage(saved);
      flash(saved.user_id);
      render();
    }, 450);
  }

  // ===========================================================================
  // Şifre Değiştir sekmesi (sunum eklentisi — kaynakta karşılığı yok)
  // Kurallar: mevcut şifre zorunlu; yeni şifre ≥ 8 karakter, büyük/küçük harf, rakam, özel karakter;
  // mevcut şifreden farklı; kullanıcı adını içermez; tekrar alanı eşleşmeli.
  // ===========================================================================
  const pw = { current: '', next: '', confirm: '', submitting: false, lastChange: null };
  function pwRules() {
    const n = pw.next;
    const usr = trLower(SESSION.usr);
    return [
      { ok: n.length >= 8, label: 'En az 8 karakter' },
      { ok: /[A-ZÇĞİÖŞÜ]/.test(n), label: 'En az bir büyük harf (A-Z)' },
      { ok: /[a-zçğıöşü]/.test(n), label: 'En az bir küçük harf (a-z)' },
      { ok: /\d/.test(n), label: 'En az bir rakam (0-9)' },
      { ok: /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü\s]/.test(n), label: 'En az bir özel karakter (!@#$%...)' },
      { ok: !!n && n !== pw.current, label: 'Mevcut şifreden farklı' },
      { ok: !!n && (usr.length < 3 || trLower(n).indexOf(usr) < 0), label: 'Kullanıcı adını içermez' }
    ];
  }
  function pwValid() {
    return !!pw.current && pwRules().every(r => r.ok) && pw.next === pw.confirm;
  }

  function renderPasswordView() {
    const row = sessionRow();
    const initials = DCIM.session.initials(SESSION);
    const disp = row ? positionLabel(getDisplayPosition(row.das_grp)) : '-';
    const pwInput = (key, label, ph) =>
      '<div class="flex flex-col gap-1 w-full">' +
        '<label class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between"><span>' + esc(label) + '<span class="text-rose-500 font-bold ml-0.5">*</span></span></label>' +
        '<div class="relative flex items-center">' +
          '<input type="password" data-pw="' + key + '" value="' + esc(pw[key]) + '" placeholder="' + esc(ph) + '" autocomplete="' + (key === 'current' ? 'current-password' : 'new-password') + '" class="scada-input w-full pl-2.5 pr-9 py-1.5 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
          '<button type="button" data-pw-eye="' + key + '" class="absolute right-1.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="' + esc(T.tooltips.showPassword) + '"><i class="pi pi-eye text-xs"></i></button>' +
        '</div>' +
        '<p data-pw-err="' + key + '" class="hidden text-[10px] text-rose-500 font-medium flex items-center gap-1 mt-0.5"><i class="pi pi-exclamation-circle text-[10px]"></i><span></span></p>' +
      '</div>';
    const info = (label, val, mono) => '<div class="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0">' +
      '<span class="text-[11px] text-slate-500 dark:text-slate-400">' + esc(label) + '</span>' +
      '<span class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 text-right' + (mono ? ' font-mono' : '') + '">' + val + '</span></div>';

    const form = kit.card({
      title: T.passwordTitle,
      subtitle: 'Oturumdaki kullanıcının şifresini günceller',
      icon: 'pi pi-key',
      body:
        '<div class="space-y-4">' +
          pwInput('current', 'Mevcut Şifre', 'Mevcut şifreniz') +
          '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
            pwInput('next', 'Yeni Şifre', 'Yeni şifre') +
            pwInput('confirm', 'Yeni Şifre (Tekrar)', 'Yeni şifreyi tekrar girin') +
          '</div>' +
          '<div>' +
            '<div class="flex items-center justify-between text-[11px] mb-1"><span class="font-semibold text-slate-600 dark:text-slate-400">Şifre Gücü</span><span data-pw-strength-label class="font-bold text-slate-400">-</span></div>' +
            '<div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-[2px] overflow-hidden"><div data-pw-strength class="as-strength-bar h-full w-0 bg-rose-500"></div></div>' +
          '</div>' +
          '<div class="p-3 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-[2px]">' +
            '<div class="text-[11px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 mb-2">Şifre Kuralları</div>' +
            '<ul data-pw-rules class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1"></ul>' +
          '</div>' +
          '<div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">' +
            button({ variant: 'ghost', size: 'sm', icon: 'pi pi-times', label: 'Temizle', attrs: 'data-act="pw-clear"' }) +
            '<button type="button" data-act="pw-submit" disabled class="px-4 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-[2px] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"><i class="pi pi-check text-xs"></i><span>Şifreyi Güncelle</span></button>' +
          '</div>' +
        '</div>'
    });
    const account = kit.card({
      title: 'Hesap Bilgileri',
      icon: 'pi pi-id-card',
      badge: row ? (row.das_pwd ? 'SQL' : 'LDAP') : '',
      body:
        '<div class="flex items-center gap-3 mb-3">' +
          '<div class="w-10 h-10 rounded-[2px] bg-sky-700 text-white font-bold text-sm flex items-center justify-center shrink-0">' + esc(initials) + '</div>' +
          '<div class="min-w-0"><div class="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(SESSION.fullname || SESSION.usr) + '</div>' +
            '<div class="text-[11px] font-mono text-sky-600 dark:text-sky-400 truncate">' + esc(SESSION.usr) + '</div></div>' +
        '</div>' +
        info('Pozisyon', esc(disp)) +
        info('Departman', esc(row ? row.department || '-' : '-')) +
        info('Durum', row ? statusBadge(row.status === 'passive' ? 'passive' : 'active', row.status === 'passive' ? T.status.passive : T.status.active) : '-') +
        info('Son Giriş', row && row.last_login ? esc(fmtDateTime(row.last_login)) : '-', true) +
        info('2FA', esc(row ? row.das_cfg : '-'), true) +
        info('Son Şifre Değişikliği', '<span data-pw-last>' + (pw.lastChange ? esc(fmtDateTime(pw.lastChange)) : '-') + '</span>', true)
    });
    return '<div class="flex-1 min-h-0 overflow-y-auto p-3 bg-slate-100/60 dark:bg-[#080c14]/40">' +
      '<div class="grid grid-cols-1 xl:grid-cols-3 gap-3 max-w-[1280px] mx-auto">' +
        '<div class="xl:col-span-2">' + form + '</div>' +
        '<div>' + account + '</div>' +
      '</div>' +
    '</div>';
  }

  function updatePasswordState() {
    root.querySelectorAll('[data-pw]').forEach(i => { pw[i.getAttribute('data-pw')] = i.value; });
    const rules = pwRules();
    const ul = root.querySelector('[data-pw-rules]');
    if (ul) {
      ul.innerHTML = rules.map(r => {
        const idle = !pw.next;
        const cls = idle ? 'text-slate-500 dark:text-slate-400' : r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500';
        const ic = idle ? 'pi pi-circle' : r.ok ? 'pi pi-check-circle' : 'pi pi-times-circle';
        return '<li class="flex items-center gap-1.5 text-[11px] ' + cls + '"><i class="' + ic + ' text-[10px]"></i><span>' + esc(r.label) + '</span></li>';
      }).join('');
    }
    // Güç: ilk beş kural (uzunluk + karakter sınıfları)
    const score = pw.next ? rules.slice(0, 5).filter(r => r.ok).length : 0;
    const bar = root.querySelector('[data-pw-strength]');
    const lbl = root.querySelector('[data-pw-strength-label]');
    const LV = [
      { w: '0%', c: 'bg-rose-500', t: '-', tc: 'text-slate-400' },
      { w: '20%', c: 'bg-rose-500', t: 'Çok Zayıf', tc: 'text-rose-500' },
      { w: '40%', c: 'bg-rose-500', t: 'Zayıf', tc: 'text-rose-500' },
      { w: '60%', c: 'bg-amber-500', t: 'Orta', tc: 'text-amber-500' },
      { w: '80%', c: 'bg-amber-500', t: 'İyi', tc: 'text-amber-500' },
      { w: '100%', c: 'bg-emerald-500', t: 'Güçlü', tc: 'text-emerald-500' }
    ][score];
    if (bar) { bar.style.width = LV.w; bar.className = 'as-strength-bar h-full ' + LV.c; }
    if (lbl) { lbl.textContent = LV.t; lbl.className = 'font-bold ' + LV.tc; }
    setPwError('confirm', pw.confirm && pw.next !== pw.confirm ? 'Şifreler eşleşmiyor.' : '');
    setPwError('current', '');
    const btn = root.querySelector('[data-act="pw-submit"]');
    if (btn) btn.disabled = !pwValid() || pw.submitting;
  }
  function setPwError(key, msg) {
    const el = root.querySelector('[data-pw-err="' + key + '"]');
    if (!el) return;
    el.querySelector('span').textContent = msg;
    el.classList.toggle('hidden', !msg);
  }
  function togglePwEye(btn) {
    const key = btn.getAttribute('data-pw-eye');
    const inp = root.querySelector('[data-pw="' + key + '"]');
    if (!inp) return;
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.querySelector('i').className = (show ? 'pi pi-eye-slash' : 'pi pi-eye') + ' text-xs';
    btn.title = show ? T.tooltips.hidePassword : T.tooltips.showPassword;
  }
  function clearPasswordForm() {
    pw.current = pw.next = pw.confirm = '';
    root.querySelectorAll('[data-pw]').forEach(i => { i.value = ''; i.type = 'password'; });
    updatePasswordState();
  }
  function submitPasswordChange() {
    updatePasswordState();
    if (!pwValid() || pw.submitting) return;
    const row = sessionRow();
    // SQL hesabında (müşteri) mevcut şifre kayıtla karşılaştırılır; LDAP hesabında dizin doğrular (demo: kabul)
    if (row && row.das_pwd && row.das_pwd !== pw.current) {
      setPwError('current', 'Mevcut şifre hatalı.');
      toast('Mevcut şifre hatalı.', 'error', T.passwordTitle);
      return;
    }
    pw.submitting = true;
    const btn = root.querySelector('[data-act="pw-submit"]');
    if (btn) { btn.disabled = true; btn.querySelector('i').className = 'pi pi-spin pi-spinner text-xs'; }
    setTimeout(() => {
      pw.submitting = false;
      if (row && row.das_pwd) row.das_pwd = pw.next;
      pw.lastChange = new Date();
      const last = root.querySelector('[data-pw-last]');
      if (last) last.textContent = fmtDateTime(pw.lastChange);
      if (btn) btn.querySelector('i').className = 'pi pi-check text-xs';
      clearPasswordForm();
      toast('Şifreniz başarıyla güncellendi. Bir sonraki girişte yeni şifrenizi kullanın.', 'success', T.passwordTitle);
    }, 600);
  }

  // ---------------------------------------------------------------------------
  // Başlat + derin bağlantılar
  // ---------------------------------------------------------------------------
  render();
  const editUid = params.get('edit');
  if (editUid) {
    const u = USERS.find(x => x.das_uid === editUid || x.user_id === editUid);
    if (u) { showUserPage(u); render(); rowClickSelect(u); }
  } else if (params.get('open') === 'add' && state.listTab !== 'password') {
    openAddModal(state.listTab === 'customer' ? 'customer' : 'corporate');
  }
  if (params.get('report') === '1' && state.listTab !== 'password') {
    const rb = root.querySelector('#as-report [data-rk-btn]');
    if (rb) setTimeout(() => rb.click(), 60);
  }
})();
