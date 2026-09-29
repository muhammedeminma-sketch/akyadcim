/* ==========================================================================
   DCIM Sunum — Yetkilendirme Ayarları (NewUIPermissionSettingsComponent)
   Kaynak: new-ui/pages/permission-settings/ (component.html/.ts + permission-models.ts)

   İki görünüm:
   1) "Kullanıcı İzin Sihirbazı" — orijinal 4 adımlı LDAP sihirbazının birebir portu
      (Giriş → Kullanıcı Ara → İzinler → Onay). ACL üretimi/ayrıştırması (+MOD / +MODop / *),
      parent→child ve child→sibling yayılımı, deduplikasyon TS'ten aynen taşındı.
      Backend (das.search_user_ldap / insert_user_ldap / update_user_ldap_attribute) → DCIM.data.permissions.
   2) "Rol Matrisi (RBAC)" — SUNUM EKLENTİSİ: rol şablonları × modüller için Okuma / Yazma / Yönetim
      onay kutuları; aynı modül listesi ve aynı ACL derleyicisi kullanılır
      (Okuma = R, Yazma = C+U, Yönetim = D). Değişiklik → Kaydet / Geri Al + toast.

   Kaydedilen yetki değişiklikleri sessionStorage 'dcim_audit_session' kuyruğuna YETKİ kaydı olarak
   eklenir; audit-logs.html bu kayıtları listenin başında gösterir.

   Derin bağlantılar:
     ?tab=roles | wizard        açılış görünümü (varsayılan: roles)
     ?role=operator             rol matrisinde ilgili rol sütununu vurgular
     ?uid=00549854              sihirbazı açar ve kullanıcıyı arar (2. adım)
     ?uid=00549854&step=3       kullanıcı bulunduktan sonra izin matrisine geçer
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, fmtDateTime, buttonClasses, dialog, toast, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'permissions' });

  const P = DCIM.data.permissions;
  const root = document.getElementById('ps-root');
  const params = new URLSearchParams(window.location.search);

  // ---------------------------------------------------------------------------
  // messages.tr.json → permissionSettings.* (renkli emojiler buton ikonlarıyla çakıştığı için çıkarıldı)
  // ---------------------------------------------------------------------------
  const T = {
    brandTitle: 'LDAP Erişim Yetkilendirme',
    menuManagement: 'Yönetim',
    backToAccounts: 'Hesap Listesi',
    stepLabels: { 1: 'Giriş', 2: 'Kullanıcı Ara', 3: 'İzinler', 4: 'Onay' },
    heroTitle: 'LDAP Granüler Erişim Güncelleme',
    heroDesc: 'Bu sihirbaz, Data Center altyapı platformundaki bireysel bir LDAP kullanıcısına modül başına ayrıntılı izinler atamanızı sağlar.',
    targetUser: { title: 'Hedef Kullanıcı', desc: 'LDAP uid ile hesabı arayın ve seçin.' },
    permissionMatrix: { title: 'İzin Matrisi', desc: 'Modül başına Create(Oluşturma) / Read(Okuma) / Update(Güncelleme) / Delete(Silme) haklarını ayarlayın.' },
    employeeType: { title: 'Employee Type Formatı', desc: 'İzinler +MOD+OP şeklinde kodlanır; örn. +ASMC,+NWTR' },
    important: { title: 'Önemli', desc: 'Kaydetme işlemi kullanıcının mevcut Employee Type dizesini tamamen değiştirir.' },
    startBtn: 'Başla',
    targetUserTitle: 'Hedef Kullanıcıyı Belirle',
    targetUserSub: "LDAP Kullanıcı ID'sini (uid) girin.",
    searchPlaceholder: 'örn. 00549854',
    searching: 'Aranıyor…',
    search: 'Ara',
    userFound: 'Kullanıcı bulundu',
    editPermissions: 'İzinleri Düzenle',
    userNotFound: 'Kullanıcı bulunamadı',
    changeUser: '↺ Değiştir',
    permissionMatrixTitle: 'İzin Matrisi',
    permissionMatrixSub: '{name} için modül erişimini yapılandırın',
    selectAll: '✔ Tümünü Seç',
    clearAll: '✕ Temizle',
    module: 'Modül',
    all: 'Tümü',
    preview: 'Önizleme:',
    adminAllPermissions: '★ Admin – Tüm yetkiler (*)',
    noSelection: '(seçim yok)',
    reviewConfirmTitle: 'İnceleme & Onayla',
    reviewConfirmSub: 'Dizine yazmadan önce değişiklikleri doğrulayın.',
    targetLdapUid: 'Hedef LDAP uid',
    generatedAclString: 'Oluşturulan ACL Dizesi',
    copied: 'Kopyalandı!',
    copy: 'Kopyala',
    moduleBreakdown: 'Modül Dökümü',
    noPermissionSelected: 'Hiçbir izin seçilmedi.',
    saveWarning: '⚠ Kaydetme işlemi kullanıcının LDAP\'taki mevcut Employee Type dizesini tamamen değiştirecek.',
    saveSuccessTitle: 'Kayıt başarılı!',
    saveSuccessBody: '{name} kullanıcısının LDAP izinleri güncellendi.',
    saveErrorTitle: 'Kayıt başarısız!',
    saving: 'Kaydediliyor…',
    saved: 'Kaydedildi',
    saveToLdap: 'LDAP Dizinine Kaydet',
    resetWizard: '↺ Başa Dön',
    review: 'İncele',
    back: 'Geri',
    errors: {
      enterUid: "Lütfen bir Kullanıcı ID'si girin.",
      notFound: 'Kullanıcı dizinde bulunamadı.',
      bindFail: 'LDAP sunucusuna bağlanılamadı.',
      genericSearchError: 'Arama sırasında hata oluştu.'
    },
    confirmInsertTitle: 'Kullanıcı Ekle',
    confirmInsertBody: 'Kullanıcı SQL veritabanında bulunamadı. LDAP bilgilerini kullanarak yeni bir kullanıcı kaydı oluşturmak istiyor musunuz?',
    confirmInsertYes: 'Kullanıcıyı Ekle',
    confirmInsertNo: 'İptal',
    userAddedInfo: 'Kullanıcı SQL veritabanına başarıyla eklendi. Yetkilendirmeyi tamamlamak için lütfen izinleri ayarlayıp kaydedin.',
    userNotAddedWarning: 'Kullanıcı SQL veritabanına kaydedilmedi. Kullanıcı giriş yaptıktan sonra yetkisiz olarak girecektir ve sayfalara erişimi olmayacaktır.',
    notInSqlTitle: "SQL'e Ekle"
  };

  // permission-models.ts
  const OPS = ['C', 'R', 'U', 'D'];
  const OP_LABELS = { C: 'Oluşturma', R: 'Okuma', U: 'Güncelleme', D: 'Silme' };

  // permission-settings.component.ts → modulesList
  // [+] ile işaretli girdiler SUNUM EKLENTİSİDİR (kodlar navigation.config.ts rollerinden / senaryodan).
  const MODULES = [
    {
      label: 'Sistem-Sayfaları', value: 'RTS', permission: 'R', children: [
        { label: 'Sistem-Noktalar', value: 'RTSN', permission: 'R' },
        { label: 'Sistem-Alarmlar', value: 'RTSA', permission: 'R' },
        { label: 'Sistem-Olaylar', value: 'RTSE', permission: 'R' }
      ]
    },
    {
      label: 'Mühendislik Sayfaları', value: 'RTS_ENG', permission: 'CRUD', children: [
        { label: '2 Boyutlu Genel Görünüm', value: 'RTS_ENG2D', permission: 'R' },
        { label: 'Kabin Detay', value: 'RTS_ENGC', permission: 'CRUD' },
        { label: '3 Boyutlu Genel Görünüm', value: 'RTS_ENG3D', permission: 'R' }
      ]
    },
    {
      label: 'Raporlama', value: 'RPS', permission: 'R', children: [
        { label: 'Enerji', value: 'RPSE', permission: 'R' },
        { label: 'Beyaz Alan', value: 'RPSBA', permission: 'R' },
        { label: 'Soğutma', value: 'RPSSO', permission: 'R' },
        { label: 'Tarihsel Alarmlar', value: 'RPSHA', permission: 'R', extra: true },          // [+] navigation.config.ts
        { label: 'Kullanıcı Logları (Audit)', value: 'RPSUL', permission: 'R', extra: true },  // [+] navigation.config.ts
        { label: 'Rapor İndirme (PDF/Excel)', value: 'RPSDL', permission: 'R', extra: true }   // [+] sunum
      ]
    },
    {
      label: 'Asset Managment', value: 'ASM', permission: 'CRUD', children: [
        { label: 'Müşteri Listesi', value: 'ASML', permission: 'CRUD' },
        { label: 'Kategori Listesi', value: 'ASMCAT', permission: 'CRUD' },
        { label: 'Lokasyon Listesi', value: 'ASMLOC', permission: 'CRUD' },
        { label: 'Asset Kabin Yönetimi', value: 'ASMCAB', permission: 'CRUD' },
        { label: 'Asset Cihaz Yönetimi', value: 'ASMD', permission: 'CRUD' },
        { label: 'Cihaz Tanımlama Formu', value: 'ASMDE', permission: 'CRUD' },
        { label: 'Network Topolojisi', value: 'ASMN', permission: 'CRUD' },
        { label: 'Bakım Modülü', value: 'MNT', permission: 'CRU' },
        { label: 'Kapak Kilidi Açma', value: 'LCK', permission: 'RU', extra: true } // [+] sunum
      ]
    },
    {
      label: 'Müşteri Sayfaları', value: 'CDB', permission: 'CRUD', children: [
        { label: 'Müşteri Sayfaları', value: 'CDB', permission: 'CRUD' },
        { label: 'Ticket Yönetimi', value: 'TCK', permission: 'RU' }
      ]
    },
    {
      label: 'Sipariş Listesi', value: 'WOR', permission: 'CRUD', children: [
        { label: 'Sipariş Listesi', value: 'WOR', permission: 'CRUD' }
      ]
    },
    {
      label: 'Enerji Sayfaları', value: 'ENR', permission: 'CRUD', children: [
        { label: 'Enerji Sayfaları Genel Görünüm', value: 'ENR', permission: 'CRUD' },
        { label: 'Enerji Optimizasyon', value: 'ENRO', permission: 'CRUD' },
        { label: 'PDU Detay Sayfası', value: 'ENRPDU', permission: 'CRUD' },
        { label: 'Enerji Kontrol (PDU Outlet Aç/Kapa)', value: 'ENRK', permission: 'RU', extra: true } // [+] sunum
      ]
    },
    {
      label: 'Kullanıcı Ayarları', value: 'AS', permission: 'CRUD', children: [
        { label: 'Kullanıcı Ayarları', value: 'ASU', permission: 'CRUD' },
        { label: 'İzin Ayarları', value: 'ASP', permission: 'CRUD' }
      ]
    }
  ];

  // messages.tr.json → permissionSettings.modules.* (çevirisi olmayanlarda modulesList etiketi kullanılır)
  const MOD_TR = {
    RTS: 'Sistem Sayfaları', RTSN: 'Sistem Noktaları', RTSA: 'Sistem Alarmları', RTSE: 'Sistem Olaylar',
    RTS_ENG: 'Mühendislik Sayfaları', RTS_ENG2D: '2 Boyutlu Genel Görünüm', RTS_ENGC: 'Kabin Detay', RTS_ENG3D: '3 Boyutlu Genel Görünüm',
    RPS: 'Raporlama', RPSE: 'Enerji', RPSBA: 'Beyaz Alan', RPSSO: 'Soğutma',
    ASM: 'Varlık Yönetimi', ASML: 'Müşteri Listesi', ASMCAT: 'Kategori Listesi', ASMLOC: 'Lokasyon Listesi',
    ASMCAB: 'Asset Kabin Yönetimi', ASMD: 'Asset Cihaz Yönetimi', ASMDE: 'Cihaz Tanımlama Formu', ASMN: 'Network Topolojisi',
    CDB: 'Müşteri Sayfaları', WOR: 'Sipariş Listesi', ENR: 'Enerji Sayfaları', ENRO: 'Enerji Optimizasyon', ENRPDU: 'PDU Detay Sayfası',
    AS: 'Kullanıcı Ayarları', ASP: 'İzin Ayarları'
  };
  const modLabel = m => MOD_TR[m.value] || m.label;

  // moduleIcon(): orijinalde emoji (ASM 🖥️, ENR ⚡, diğerleri 📦) — sunumda PrimeIcons karşılıkları
  const MODULE_ICON = { RTS: 'pi pi-desktop', RTS_ENG: 'pi pi-map', RPS: 'pi pi-file', ASM: 'pi pi-server', CDB: 'pi pi-users', WOR: 'pi pi-list-check', ENR: 'pi pi-bolt', AS: 'pi pi-cog' };
  const moduleIcon = v => MODULE_ICON[v] || 'pi pi-box';

  // ---------------------------------------------------------------------------
  // Satır modeli + ACL derleyici/ayrıştırıcı (component.ts'ten port)
  // shared verilirse aynı value'ya sahip satırlar aynı grants nesnesini paylaşır (rol matrisi).
  // ---------------------------------------------------------------------------
  function createRow(mod, shared) {
    let grants;
    if (shared) grants = shared[mod.value] = shared[mod.value] || { C: false, R: false, U: false, D: false };
    else grants = { C: false, R: false, U: false, D: false };
    const row = { module: mod, grants, selectAll: false, isExpanded: false };
    if (mod.children && mod.children.length) row.children = mod.children.map(c => createRow(c, shared));
    return row;
  }
  const createRows = shared => MODULES.map(m => createRow(m, shared));
  const isOpAvailable = (row, op) => row.module.permission.includes(op);
  const availOps = row => OPS.filter(op => isOpAvailable(row, op));
  function flatRows(rows, out) {
    out = out || [];
    rows.forEach(r => { out.push(r); if (r.children) flatRows(r.children, out); });
    return out;
  }
  function setRecursiveSelectAll(row, val) {
    row.selectAll = val;
    OPS.forEach(op => { if (isOpAvailable(row, op)) row.grants[op] = val; });
    if (row.children) row.children.forEach(c => setRecursiveSelectAll(c, val));
  }
  function updateSelectAll(rows) {
    rows.forEach(row => {
      const avail = availOps(row);
      row.selectAll = avail.length > 0 && avail.every(o => row.grants[o]);
      if (row.children) updateSelectAll(row.children);
    });
  }
  function checkAnyPermissionRecursive(rows) {
    return rows.some(row => OPS.some(op => row.grants[op]) || (row.children ? checkAnyPermissionRecursive(row.children) : false));
  }
  function isAllGrantedRecursive(rows) {
    return rows.every(row => {
      const av = availOps(row);
      const allChecked = av.length > 0 && av.every(op => row.grants[op]);
      return allChecked && (row.children ? isAllGrantedRecursive(row.children) : true);
    });
  }
  function collectPermissionsRecursive(rows, parts) {
    rows.forEach(row => {
      const av = availOps(row);
      const granted = av.filter(op => row.grants[op]);
      if (granted.length > 0) {
        if (granted.length === av.length) parts.add('+' + row.module.value);        // Tüm op'lar → +MODULE
        else granted.forEach(op => parts.add('+' + row.module.value + op));          // Kısmi → bireysel token
      }
      if (row.children) collectPermissionsRecursive(row.children, parts);
    });
  }
  // Full-grant token (+XYZ) varken aynı modülün partial token'larını temizler
  function deduplicateParts(rows, parts) {
    const moduleValues = new Set(flatRows(rows).map(r => r.module.value));
    return Array.from(parts).filter(token => {
      const body = token.slice(1);
      if (moduleValues.has(body)) return true;
      const last = body[body.length - 1];
      if (OPS.indexOf(last) >= 0 && parts.has('+' + body.slice(0, -1))) return false;
      return true;
    });
  }
  function aclOf(rows) {
    if (isAllGrantedRecursive(rows)) return '*';
    const parts = new Set();
    collectPermissionsRecursive(rows, parts);
    return deduplicateParts(rows, parts).join(',');
  }
  function previewOf(rows) {
    if (isAllGrantedRecursive(rows)) return T.adminAllPermissions;
    const parts = new Set();
    collectPermissionsRecursive(rows, parts);
    const d = deduplicateParts(rows, parts);
    return d.length ? d.join(',') : T.noSelection;
  }
  // parseExistingPermissions: "*" | "+ASM" | "+ASMC" (en uzun eşleşme) | "+ASMCR"
  function parseAcl(rows, authString) {
    flatRows(rows).forEach(r => OPS.forEach(op => { r.grants[op] = false; }));
    if (authString) {
      const tokens = String(authString).split(',').map(t => t.trim()).filter(Boolean);
      if (tokens.some(t => t === '*')) {
        rows.forEach(r => setRecursiveSelectAll(r, true));
      } else {
        const all = flatRows(rows).slice().sort((a, b) => b.module.value.length - a.module.value.length);
        tokens.filter(t => t.startsWith('+')).forEach(token => {
          let matchedValue = null, matchedOps = [];
          for (const row of all) {
            const prefix = '+' + row.module.value;
            if (token === prefix) { matchedValue = row.module.value; matchedOps = availOps(row); break; }
            if (token.startsWith(prefix) && token.length === prefix.length + 1) {
              const op = token[prefix.length];
              if (OPS.indexOf(op) >= 0 && isOpAvailable(row, op)) { matchedValue = row.module.value; matchedOps = [op]; break; }
            }
          }
          if (matchedValue !== null) {
            all.filter(r => r.module.value === matchedValue).forEach(r => matchedOps.forEach(op => { if (isOpAvailable(r, op)) r.grants[op] = true; }));
          }
        });
      }
    }
    updateSelectAll(rows);
  }
  const getGrantedOps = row => OPS.filter(op => isOpAvailable(row, op) && row.grants[op]);

  // Denetim kaydı kuyruğu (audit-logs.html okur) — SYSLOG_event(evt, 1, 4, "YETKİ", ...) karşılığı
  function pushAudit(txt, asset, url) {
    const user = DCIM.session.user();
    let list = [];
    try { list = JSON.parse(storage.sessionGet('dcim_audit_session') || '[]'); } catch (e) { list = []; }
    list.push({ tim: new Date().toISOString(), cat: 'YETKİ', txt, sta: 0x0105, user: user.usr || 'operator', ip: '10.130.1.45', url: url || 'http://10.130.1.111/k/dcim/permission-settings', asset, res: 'success' });
    storage.sessionSet('dcim_audit_session', JSON.stringify(list.slice(-50)));
  }

  // app-button karşılığı (customClass, iconPos=right, loading destekli)
  function btn(o) {
    const icon = o.loading ? 'pi pi-spin pi-spinner' : o.icon;
    const i = icon ? '<i class="' + icon + ' text-current shrink-0"></i>' : '';
    return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', false) + (o.cls ? ' ' + o.cls : '') + '"' +
      (o.id ? ' id="' + o.id + '"' : '') + (o.act ? ' data-act="' + o.act + '"' : '') + (o.disabled ? ' disabled' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + '>' +
      (o.iconRight ? '' : i) + '<span class="truncate">' + esc(o.label) + '</span>' + (o.iconRight ? i : '') + '</button>';
  }
  const fill = (s, name) => s.replace('{name}', name);

  // ===========================================================================
  // Sayfa iskeleti
  // ===========================================================================
  const state = { tab: params.get('tab') === 'wizard' ? 'wizard' : 'roles' };

  root.innerHTML =
    kit.pageHeader({
      title: T.brandTitle,
      breadcrumbs: [{ label: T.menuManagement }, { label: T.brandTitle }],
      actions: btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-arrow-left', label: T.backToAccounts, id: 'btn-back-to-accounts', act: 'back' })
    }) +
    '<div class="shrink-0 flex flex-wrap items-center justify-between gap-2">' +
      '<div class="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-900/70 p-0.5 rounded-[2px] border border-slate-200 dark:border-border-subtle" id="ps-tabs"></div>' +
      '<div class="hidden sm:flex items-center gap-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
        '<i class="pi pi-sitemap text-[10px] text-sky-500"></i><span>LDAP · employeeType (das_acl) · ' + P.ldapUsers.length + ' kullanıcı / ' + P.roles.length + ' rol</span>' +
      '</div>' +
    '</div>' +
    '<div id="ps-view-roles" class="space-y-3"></div>' +
    '<div id="ps-view-wizard" class="space-y-3"></div>';

  const viewRoles = document.getElementById('ps-view-roles');
  const viewWizard = document.getElementById('ps-view-wizard');

  root.querySelector('[data-act="back"]').addEventListener('click', () => { window.location.href = 'account-settings.html'; });

  function renderTabs() {
    const tabCls = on => 'px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 ' +
      (on ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent');
    const dirty = matrixDiffs().length;
    document.getElementById('ps-tabs').innerHTML =
      '<button type="button" data-tab="roles" class="' + tabCls(state.tab === 'roles') + '"><i class="pi pi-th-large text-xs"></i><span>Rol Matrisi (RBAC)</span>' +
        '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30">' + P.roles.length + '</span>' +
        (dirty ? '<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" title="Kaydedilmemiş değişiklik"></span>' : '') + '</button>' +
      '<button type="button" data-tab="wizard" class="' + tabCls(state.tab === 'wizard') + '"><i class="pi pi-key text-xs"></i><span>Kullanıcı İzin Sihirbazı</span>' +
        '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30">LDAP</span></button>';
  }
  document.getElementById('ps-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.getAttribute('data-tab'));
  });

  function switchTab(tab) {
    state.tab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    if (tab !== 'wizard') { url.searchParams.delete('uid'); url.searchParams.delete('step'); }
    window.history.replaceState(null, '', url.toString());
    viewRoles.classList.toggle('hidden', tab !== 'roles');
    viewWizard.classList.toggle('hidden', tab !== 'wizard');
    renderTabs();
    if (tab === 'roles') renderMatrix(); else renderWizard();
  }

  // ===========================================================================
  // 1) ROL MATRİSİ (sunum eklentisi)
  // ===========================================================================
  const LEVELS = [
    { key: 'read', label: 'Okuma', hint: 'R', ops: ['R'] },
    { key: 'write', label: 'Yazma', hint: 'C·U', ops: ['C', 'U'] },
    { key: 'admin', label: 'Yönetim', hint: 'D', ops: ['D'] }
  ];
  const TONE = {
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30'
  };

  const M = {
    grants: {},      // roleId → value → {C,R,U,D}
    saved: {},       // son kaydedilen hâl
    rows: {},        // roleId → paylaşımlı satır ağacı (ACL derleme için)
    expanded: new Set(MODULES.map(m => m.value)),
    query: '',
    onlyChanged: false,
    highlight: params.get('role') || '',
    saving: false
  };
  P.roles.forEach(r => {
    M.grants[r.id] = {};
    M.rows[r.id] = createRows(M.grants[r.id]);
    parseAcl(M.rows[r.id], r.acl);
  });
  const cloneGrants = g => JSON.parse(JSON.stringify(g));
  M.saved = cloneGrants(M.grants);
  const UNIQUE = (() => {
    const seen = new Map();
    flatRows(createRows()).forEach(r => { if (!seen.has(r.module.value)) seen.set(r.module.value, r); });
    return Array.from(seen.values());
  })();

  const levelOps = (row, lv) => lv.ops.filter(op => isOpAvailable(row, op));
  function cellState(g, row, lv) {
    const ops = levelOps(row, lv);
    if (!ops.length) return 'na';
    const n = ops.filter(op => g[row.module.value][op]).length;
    return n === 0 ? 'off' : n === ops.length ? 'on' : 'partial';
  }
  // Hiyerarşi: Yönetim ⇒ Yazma ⇒ Okuma. Açma alttaki seviyeleri de açar, kapatma üsttekileri kapatır.
  function setLevel(g, row, lvIdx, on) {
    const gr = g[row.module.value];
    LEVELS.forEach((lv, i) => {
      if (on ? i <= lvIdx : i >= lvIdx) levelOps(row, lv).forEach(op => { gr[op] = on; });
    });
  }
  function groupRows(parentRow) { return [parentRow].concat(parentRow.children || []); }
  function aggState(g, rowsArr, lv) {
    const states = rowsArr.map(r => cellState(g, r, lv)).filter(s => s !== 'na');
    if (!states.length) return 'na';
    if (states.every(s => s === 'on')) return 'on';
    if (states.every(s => s === 'off')) return 'off';
    return 'partial';
  }
  function isDirtyCell(roleId, row, lv) {
    const a = M.grants[roleId][row.module.value], b = M.saved[roleId][row.module.value];
    return levelOps(row, lv).some(op => a[op] !== b[op]);
  }
  function matrixDiffs() {
    const out = [];
    if (!M.grants || !P) return out;
    P.roles.forEach(r => UNIQUE.forEach(row => LEVELS.forEach(lv => { if (isDirtyCell(r.id, row, lv)) out.push({ role: r.id, value: row.module.value, level: lv.key }); })));
    return out;
  }
  const rowDirty = row => P.roles.some(r => LEVELS.some(lv => isDirtyCell(r.id, row, lv)));
  const roleDirty = id => UNIQUE.some(row => LEVELS.some(lv => isDirtyCell(id, row, lv)));

  function matches(mod) {
    const q = M.query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return true;
    return (modLabel(mod) + ' ' + mod.label + ' ' + mod.value).toLocaleLowerCase('tr-TR').indexOf(q) >= 0;
  }

  function checkboxCell(roleId, rowRef, lvIdx, kind, st, dirty, locked) {
    if (st === 'na') return '<td class="text-center py-1.5 px-1' + (lvIdx === 0 ? ' border-l border-slate-200 dark:border-border-subtle' : '') + '"><span class="text-slate-400 dark:text-slate-600 text-xs font-mono">—</span></td>';
    return '<td class="text-center py-1.5 px-1' + (lvIdx === 0 ? ' border-l border-slate-200 dark:border-border-subtle' : '') + (dirty ? ' bg-amber-500/10' : '') + '">' +
      '<label class="relative inline-flex items-center justify-center cursor-pointer select-none px-1.5 py-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors' + (locked ? ' opacity-60 cursor-not-allowed' : '') + '"' +
        (locked ? ' title="Süper Admin şablonu tüm yetkilere sahiptir (*) ve düzenlenemez"' : '') + '>' +
        '<input type="checkbox" data-mx="' + kind + '" data-role="' + roleId + '" data-ref="' + rowRef + '" data-lv="' + lvIdx + '"' +
          (st === 'on' ? ' checked' : '') + (st === 'partial' ? ' data-indeterminate="1"' : '') + (locked ? ' disabled' : '') +
          ' class="w-3.5 h-3.5 rounded-[2px] accent-sky-600 cursor-pointer disabled:cursor-not-allowed" />' +
        (dirty ? '<span class="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>' : '') +
      '</label></td>';
  }

  function matrixTableHtml() {
    const roles = P.roles;
    const hl = id => M.highlight === id;
    let head1 = '<tr class="bg-slate-50 dark:bg-surface-panel text-slate-700 dark:text-slate-300 select-none">' +
      '<th rowspan="2" class="text-left py-2 px-3 bg-slate-50 dark:bg-surface-panel align-bottom" style="min-width: 280px;">Modül</th>' +
      roles.map(r => {
        const users = P.usersOfRole(r.id).length;
        return '<th colspan="3" class="py-2 px-2 text-center border-l border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel' + (hl(r.id) ? ' ring-1 ring-inset ring-sky-500/60' : '') + '">' +
          '<div class="flex items-center justify-center gap-1.5">' +
            '<span class="w-5 h-5 rounded-[2px] border inline-flex items-center justify-center text-[10px] ' + TONE[r.tone] + '"><i class="' + r.icon + ' text-[10px]"></i></span>' +
            '<span class="text-[11px] font-extrabold text-slate-900 dark:text-slate-100">' + esc(r.label) + '</span>' +
            (r.locked ? '<i class="pi pi-lock text-[9px] text-slate-400" title="Kilitli şablon"></i>' : '') +
            (roleDirty(r.id) ? '<span class="px-1 py-0.5 rounded-[2px] text-[8px] font-extrabold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">değişti</span>' : '') +
          '</div>' +
          '<div class="text-[9px] font-mono font-normal text-slate-500 dark:text-slate-400 mt-0.5">das_grp: ' + esc(r.grp) + ' · ' + users + ' kullanıcı</div>' +
        '</th>';
      }).join('') + '</tr>';
    let head2 = '<tr class="bg-slate-50 dark:bg-surface-panel text-slate-600 dark:text-slate-400 select-none">' +
      roles.map(r => LEVELS.map((lv, i) =>
        '<th class="py-1 px-1 text-center bg-slate-50 dark:bg-surface-panel' + (i === 0 ? ' border-l border-slate-200 dark:border-border-subtle' : '') + (hl(r.id) ? ' bg-sky-500/5' : '') + '" style="min-width: 58px;">' +
          '<div class="text-[10px] font-bold text-slate-700 dark:text-slate-300">' + lv.label + '</div>' +
          '<div class="text-[9px] font-mono font-normal text-slate-400">' + lv.hint + '</div>' +
        '</th>').join('')).join('') + '</tr>';

    let body = '';
    let visibleCount = 0;
    MODULES.forEach((mod, ri) => {
      const probeRows = M.rows[roles[0].id];
      const parentRow = probeRows[ri];
      const childIdx = (mod.children || []).map((c, ci) => ci).filter(ci => matches(mod.children[ci]) || matches(mod));
      const selfMatch = matches(mod);
      if (!selfMatch && !childIdx.length) return;
      const changedFilter = r => !M.onlyChanged || rowDirty(r);
      const visibleChildren = childIdx.filter(ci => changedFilter(parentRow.children[ci]));
      if (M.onlyChanged && !rowDirty(parentRow) && !visibleChildren.length) return;
      const expanded = M.expanded.has(mod.value) || !!M.query.trim() || M.onlyChanged;
      visibleCount++;

      body += '<tr class="transition-colors font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-surface-hover/60">' +
        '<td class="py-2 px-3"><div class="flex items-center gap-2">' +
          (mod.children && mod.children.length
            ? '<button type="button" data-mx-expand="' + mod.value + '" class="w-5 h-5 rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/10 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors" title="' + (expanded ? 'Daralt' : 'Genişlet') + '"><i class="' + (expanded ? 'pi pi-minus' : 'pi pi-plus') + ' text-[9px]"></i></button>'
            : '<span class="w-5"></span>') +
          '<span class="w-6 h-6 rounded-[2px] bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0"><i class="' + moduleIcon(mod.value) + ' text-[11px]"></i></span>' +
          '<div><div class="font-bold text-xs text-slate-900 dark:text-slate-100">' + esc(modLabel(mod)) + '</div>' +
          '<div class="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-bold">' + mod.value + ' <span class="font-normal">· ' + mod.permission + '</span></div></div>' +
        '</div></td>' +
        roles.map(r => LEVELS.map((lv, li) => {
          const g = M.grants[r.id];
          const rowsArr = groupRows(M.rows[r.id][ri]);
          const st = aggState(g, rowsArr, lv);
          const dirty = rowsArr.some(x => isDirtyCell(r.id, x, lv));
          return checkboxCell(r.id, String(ri), li, 'p', st, dirty, r.locked);
        }).join('')).join('') +
      '</tr>';

      if (expanded && mod.children) {
        visibleChildren.forEach(ci => {
          const cm = mod.children[ci];
          body += '<tr class="transition-colors border-t border-slate-100 dark:border-slate-800/40 bg-slate-50/40 dark:bg-slate-900/40 hover:bg-slate-100/60 dark:hover:bg-slate-800/40">' +
            '<td class="py-1.5 px-3 pl-8"><div class="flex items-center gap-2">' +
              '<span class="text-slate-400 dark:text-slate-600 text-xs font-mono">↳</span>' +
              '<i class="pi pi-file text-slate-400 text-xs"></i>' +
              '<div><div class="font-semibold text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5">' + esc(modLabel(cm)) +
                (cm.extra ? '<span class="px-1 py-0.5 rounded-[2px] text-[8px] font-extrabold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30" title="Sunum için eklenen yetki kodu">EK</span>' : '') + '</div>' +
              '<div class="text-[10px] font-mono text-slate-400 dark:text-slate-500">' + cm.value + ' · ' + cm.permission + '</div></div>' +
            '</div></td>' +
            roles.map(r => LEVELS.map((lv, li) => {
              const row = M.rows[r.id][ri].children[ci];
              return checkboxCell(r.id, ri + '-' + ci, li, 'c', cellState(M.grants[r.id], row, lv), isDirtyCell(r.id, row, lv), r.locked);
            }).join('')).join('') +
          '</tr>';
        });
      }
    });
    if (!visibleCount) {
      body = '<tr><td colspan="' + (1 + roles.length * 3) + '" class="p-8 text-center text-slate-400 dark:text-slate-500"><i class="pi pi-inbox text-2xl mb-1 block opacity-40"></i><span class="italic">' +
        (M.onlyChanged ? 'Kaydedilmemiş değişiklik yok' : 'Eşleşen modül bulunamadı') + '</span></td></tr>';
    }
    return '<table class="scada-table w-full text-xs border-collapse">' +
      '<thead class="sticky top-0 z-10 shadow-2xs">' + head1 + head2 + '</thead>' +
      '<tbody class="divide-y divide-slate-100 dark:divide-slate-800/80">' + body + '</tbody></table>';
  }

  function roleCardsHtml() {
    return '<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">' + P.roles.map(r => {
      const rows = M.rows[r.id];
      const acl = aclOf(rows);
      const users = P.usersOfRole(r.id);
      const granted = flatRows(rows).filter(x => getGrantedOps(x).length).length;
      const opCount = UNIQUE.reduce((n, row) => n + getGrantedOps({ module: row.module, grants: M.grants[r.id][row.module.value] }).length, 0);
      const dirty = roleDirty(r.id);
      return '<div class="bg-white dark:bg-surface-card border rounded-[2px] p-3 shadow-2xs flex flex-col gap-2 ' + (dirty ? 'border-amber-500/50' : M.highlight === r.id ? 'border-sky-500/60' : 'border-slate-200 dark:border-border-subtle') + '">' +
        '<div class="flex items-start justify-between gap-2">' +
          '<div class="flex items-center gap-2 min-w-0">' +
            '<span class="w-8 h-8 rounded-[2px] border flex items-center justify-center text-sm shrink-0 ' + TONE[r.tone] + '"><i class="' + r.icon + '"></i></span>' +
            '<div class="min-w-0"><div class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(r.label) + '</div>' +
            '<div class="text-[10px] font-mono text-slate-500 dark:text-slate-400">das_grp: ' + esc(r.grp) + '</div></div>' +
          '</div>' +
          (dirty ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">Kaydedilmedi</span>'
            : r.locked ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30 shrink-0 flex items-center gap-1"><i class="pi pi-lock text-[8px]"></i>Kilitli</span>' : '') +
        '</div>' +
        '<p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">' + esc(r.desc) + '</p>' +
        '<div class="grid grid-cols-3 gap-1.5 text-center">' +
          '<div class="p-1 rounded-[2px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-border-subtle"><div class="text-[9px] uppercase tracking-wider text-slate-400">Modül</div><div class="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">' + granted + '</div></div>' +
          '<div class="p-1 rounded-[2px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-border-subtle"><div class="text-[9px] uppercase tracking-wider text-slate-400">Yetki</div><div class="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">' + opCount + '</div></div>' +
          '<div class="p-1 rounded-[2px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-border-subtle"><div class="text-[9px] uppercase tracking-wider text-slate-400">Kullanıcı</div><div class="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">' + users.length + '</div></div>' +
        '</div>' +
        '<div class="space-y-1">' +
          '<div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><i class="pi pi-key text-amber-500 text-[10px]"></i>ACL (Employee Type)</div>' +
          '<code class="block text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400 bg-slate-50 dark:bg-slate-900/80 p-1.5 rounded-[2px] border border-slate-200 dark:border-border-subtle break-all max-h-16 overflow-y-auto custom-scrollbar" title="' + esc(acl) + '">' + esc(acl || T.noSelection) + '</code>' +
        '</div>' +
        '<div class="flex flex-wrap gap-1">' + users.map(u =>
          '<button type="button" data-open-user="' + u.id + '" title="' + esc(u.nam + ' · ' + u.dept + ' — sihirbazda aç') + '" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-700 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">' +
            '<span class="w-4 h-4 rounded-[2px] bg-sky-700 text-white text-[8px] font-bold flex items-center justify-center">' + esc(DCIM.session.initials({ fullname: u.nam })) + '</span>' + esc(u.nam) +
            (u.acl && u.acl !== r.acl ? '<i class="pi pi-user-edit text-[9px] text-purple-500" title="Kullanıcıya özel ACL"></i>' : '') +
          '</button>').join('') + '</div>' +
        '<div class="mt-auto pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[9px] font-mono text-slate-400 flex items-center justify-between gap-2"><span>' + fmtDateTime(r.updatedAt).slice(0, 16) + '</span><span class="truncate">' + esc(r.updatedBy) + '</span></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderMatrix() {
    const diffs = matrixDiffs();
    const scrollEl = viewRoles.querySelector('[data-mx-scroll]');
    const keep = scrollEl ? { top: scrollEl.scrollTop, left: scrollEl.scrollLeft } : null;
    const hadFocus = document.activeElement && document.activeElement.hasAttribute && document.activeElement.hasAttribute('data-mx-search');

    viewRoles.innerHTML =
      // Bilgi şeridi
      '<div class="bg-sky-500/10 dark:bg-sky-500/10 border border-sky-500/30 rounded-[2px] p-3 shadow-2xs flex items-center gap-3">' +
        '<div class="w-8 h-8 rounded-[2px] bg-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-sm shrink-0"><i class="pi pi-shield"></i></div>' +
        '<div class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">' +
          '<strong class="font-bold text-slate-900 dark:text-slate-100 mr-1">Rol bazlı erişim (RBAC):</strong>' +
          'Her rol şablonu, sihirbazdaki modül listesiyle aynı Employee Type dizesine derlenir. <b>Okuma</b> = R, <b>Yazma</b> = C+U, <b>Yönetim</b> = D. ' +
          'Yönetim seçimi Yazma ve Okuma\'yı; Yazma seçimi Okuma\'yı otomatik açar.' +
        '</div>' +
      '</div>' +
      // Matris kartı
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs overflow-hidden flex flex-col">' +
        '<div class="p-2.5 px-3 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2.5 bg-slate-50 dark:bg-surface-base">' +
          '<div>' +
            '<h2 class="text-xs md:text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-table text-sky-600 dark:text-sky-400"></i><span>Rol × Modül Yetki Matrisi</span></h2>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + P.roles.length + ' rol · ' + UNIQUE.length + ' modül kodu · Veri Merkezi</p>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<div class="relative w-56">' +
              '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
              '<input type="text" data-mx-search value="' + esc(M.query) + '" placeholder="Modül veya kod ara (ör. LCK)" class="w-full pl-8 pr-3 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500" />' +
            '</div>' +
            '<button type="button" data-act="only-changed" class="px-2 py-1 text-[11px] rounded-[2px] border transition-all cursor-pointer flex items-center gap-1 ' +
              (M.onlyChanged ? 'bg-amber-500 text-white font-bold border-amber-500' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700') + '">' +
              '<i class="pi pi-filter text-[10px]"></i>Sadece değişenler' + (diffs.length ? ' (' + diffs.length + ')' : '') + '</button>' +
            btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-plus', label: 'Tümünü Genişlet', act: 'expand-all' }) +
            btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-minus', label: 'Daralt', act: 'collapse-all' }) +
          '</div>' +
        '</div>' +
        '<div class="overflow-auto max-h-[58vh] custom-scrollbar" data-mx-scroll>' + matrixTableHtml() + '</div>' +
        '<div class="py-2 px-3 border-t border-slate-200 dark:border-border-subtle flex flex-wrap items-center gap-3 text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#0b121e]">' +
          '<span class="flex items-center gap-1"><input type="checkbox" checked disabled class="w-3 h-3 accent-sky-600" /> Yetkili</span>' +
          '<span class="flex items-center gap-1"><input type="checkbox" disabled data-indeterminate="1" class="w-3 h-3 accent-sky-600" /> Kısmi (alt modüllerin bir kısmı)</span>' +
          '<span class="flex items-center gap-1"><span class="font-mono text-slate-400">—</span> Modülde bu işlem yok</span>' +
          '<span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-[2px] bg-amber-500/30 border border-amber-500/50"></span> Kaydedilmemiş değişiklik</span>' +
          '<span class="flex items-center gap-1"><span class="px-1 rounded-[2px] text-[8px] font-extrabold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">EK</span> Sunum için eklenen kod</span>' +
        '</div>' +
      '</div>' +
      // Kaydet / Geri Al çubuğu
      '<div class="sticky bottom-0 z-20 bg-white dark:bg-surface-card border rounded-[2px] p-2.5 px-3 shadow-xl flex flex-wrap items-center justify-between gap-2 ' + (diffs.length ? 'border-amber-500/50' : 'border-slate-200 dark:border-border-subtle') + '">' +
        '<div class="flex items-center gap-2 text-xs">' +
          (diffs.length
            ? '<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="font-bold text-amber-600 dark:text-amber-400">' + diffs.length + ' kaydedilmemiş değişiklik</span>' +
              '<span class="text-slate-500 dark:text-slate-400">· ' + P.roles.filter(r => roleDirty(r.id)).map(r => esc(r.label)).join(', ') + '</span>'
            : '<i class="pi pi-check-circle text-emerald-500"></i><span class="text-slate-600 dark:text-slate-300 font-semibold">Tüm rol şablonları kayıtlı.</span>') +
        '</div>' +
        '<div class="flex items-center gap-2">' +
          btn({ variant: 'secondary', size: 'md', icon: 'pi pi-undo', label: 'Geri Al', act: 'undo', disabled: !diffs.length || M.saving }) +
          btn({ variant: 'primary', size: 'md', icon: 'pi pi-save', label: M.saving ? T.saving : 'Değişiklikleri Kaydet', act: 'save', disabled: !diffs.length || M.saving, loading: M.saving }) +
        '</div>' +
      '</div>' +
      // Rol kartları
      '<div class="flex items-center justify-between pt-1"><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-id-card text-sky-600 dark:text-sky-400"></i>Rol Şablonları ve Üretilen ACL Dizeleri</h3>' +
      '<span class="text-[10px] text-slate-500 dark:text-slate-400">Kullanıcıya tıklayarak sihirbazda kişisel izinlerini açın</span></div>' +
      roleCardsHtml();

    viewRoles.querySelectorAll('[data-indeterminate]').forEach(i => { i.indeterminate = true; });
    const s2 = viewRoles.querySelector('[data-mx-scroll]');
    if (keep && s2) { s2.scrollTop = keep.top; s2.scrollLeft = keep.left; }
    if (hadFocus) {
      const inp = viewRoles.querySelector('[data-mx-search]');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
    renderTabs();
  }

  function refFor(roleId, ref, kind) {
    const rows = M.rows[roleId];
    if (kind === 'p') return groupRows(rows[parseInt(ref, 10)]);
    const [ri, ci] = ref.split('-').map(n => parseInt(n, 10));
    return [rows[ri].children[ci]];
  }

  viewRoles.addEventListener('change', e => {
    const cb = e.target.closest('[data-mx]');
    if (!cb) return;
    const roleId = cb.getAttribute('data-role');
    const role = P.roles.find(r => r.id === roleId);
    if (!role || role.locked) return;
    const lvIdx = parseInt(cb.getAttribute('data-lv'), 10);
    const kind = cb.getAttribute('data-mx');
    const rowsArr = refFor(roleId, cb.getAttribute('data-ref'), kind);
    const g = M.grants[roleId];
    // Parent: tümü açıksa kapat, aksi hâlde hepsini aç (kısmi → aç)
    const on = kind === 'p' ? aggState(g, rowsArr, LEVELS[lvIdx]) !== 'on' : cb.checked;
    rowsArr.forEach(r => setLevel(g, r, lvIdx, on));
    updateSelectAll(M.rows[roleId]);
    renderMatrix();
  });

  viewRoles.addEventListener('input', e => {
    if (!e.target.hasAttribute('data-mx-search')) return;
    M.query = e.target.value;
    renderMatrix();
  });

  viewRoles.addEventListener('click', e => {
    const ex = e.target.closest('[data-mx-expand]');
    if (ex) {
      const v = ex.getAttribute('data-mx-expand');
      if (M.expanded.has(v)) M.expanded.delete(v); else M.expanded.add(v);
      renderMatrix();
      return;
    }
    const u = e.target.closest('[data-open-user]');
    if (u) { openUserInWizard(u.getAttribute('data-open-user')); return; }
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    switch (act.getAttribute('data-act')) {
      case 'expand-all': MODULES.forEach(m => M.expanded.add(m.value)); renderMatrix(); break;
      case 'collapse-all': M.expanded.clear(); renderMatrix(); break;
      case 'only-changed': M.onlyChanged = !M.onlyChanged; renderMatrix(); break;
      case 'undo': undoMatrix(); break;
      case 'save': saveMatrix(); break;
    }
  });

  function undoMatrix() {
    const n = matrixDiffs().length;
    P.roles.forEach(r => Object.keys(M.grants[r.id]).forEach(v => OPS.forEach(op => { M.grants[r.id][v][op] = M.saved[r.id][v][op]; })));
    P.roles.forEach(r => updateSelectAll(M.rows[r.id]));
    M.onlyChanged = false;
    renderMatrix();
    toast(n + ' değişiklik geri alındı; son kaydedilen şablonlar yüklendi.', 'info', 'Geri Alındı');
  }

  function savedAclOf(roleId) {
    const tmp = {};
    const rows = createRows(tmp);
    Object.keys(M.saved[roleId]).forEach(v => { tmp[v] = tmp[v] || { C: false, R: false, U: false, D: false }; Object.assign(tmp[v], M.saved[roleId][v]); });
    return aclOf(rows);
  }

  function saveMatrix() {
    const changed = P.roles.filter(r => roleDirty(r.id));
    if (!changed.length) return;
    const affected = changed.reduce((n, r) => n + P.usersOfRole(r.id).length, 0);
    const rowsHtml = changed.map(r => {
      const before = savedAclOf(r.id), after = aclOf(M.rows[r.id]);
      const b = new Set(before.split(',').filter(Boolean)), a = new Set(after.split(',').filter(Boolean));
      const added = Array.from(a).filter(t => !b.has(t)), removed = Array.from(b).filter(t => !a.has(t));
      return '<div class="p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">' +
        '<div class="flex items-center justify-between gap-2"><span class="font-bold text-slate-900 dark:text-slate-100">' + esc(r.label) + ' <span class="font-mono font-normal text-slate-500">(' + esc(r.grp) + ')</span></span>' +
        '<span class="text-[10px] text-slate-500">' + P.usersOfRole(r.id).length + ' kullanıcı</span></div>' +
        (added.length ? '<div class="text-[10px] font-mono break-all"><span class="text-emerald-600 dark:text-emerald-400 font-bold">+ </span>' + esc(added.join(', ')) + '</div>' : '') +
        (removed.length ? '<div class="text-[10px] font-mono break-all"><span class="text-rose-600 dark:text-rose-400 font-bold">− </span>' + esc(removed.join(', ')) + '</div>' : '') +
      '</div>';
    }).join('');
    dialog({
      title: 'Rol Şablonlarını Kaydet',
      subtitle: changed.length + ' rol · ' + affected + ' kullanıcı etkilenecek',
      variant: 'warning',
      confirmLabel: 'Kaydet ve Uygula',
      confirmIcon: 'pi pi-save',
      maxWidth: 'max-w-xl',
      body: '<p class="text-xs text-slate-600 dark:text-slate-300 mb-3">' + esc(T.important.desc) + ' Aşağıdaki token değişiklikleri ilgili rolü kullanan hesapların Employee Type dizesine yazılacak.</p>' +
        '<div class="space-y-2">' + rowsHtml + '</div>',
      onConfirm: () => {
        M.saving = true;
        renderMatrix();
        setTimeout(() => {
          const user = DCIM.session.user();
          changed.forEach(r => {
            r.acl = aclOf(M.rows[r.id]);
            r.updatedAt = new Date();
            r.updatedBy = user.fullname || user.usr;
            pushAudit('Rol Şablonu Değişimi: ' + r.label + ' (' + r.grp + ') ACL: ' + r.acl, 'Rol ' + r.label);
          });
          M.saved = cloneGrants(M.grants);
          M.saving = false;
          M.onlyChanged = false;
          renderMatrix();
          toast(changed.map(r => r.label).join(', ') + ' şablonu kaydedildi; ' + affected + ' kullanıcının LDAP izinleri güncellendi.', 'success', 'Yetki Matrisi Kaydedildi');
        }, 650);
      }
    });
  }

  window.addEventListener('beforeunload', e => {
    if (matrixDiffs().length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ===========================================================================
  // 2) KULLANICI İZİN SİHİRBAZI (orijinal bileşen)
  // ===========================================================================
  const W = {
    currentStep: 1, totalSteps: 4,
    searchUid: '', isSearching: false, searchDone: false, searchNotFound: false,
    searchError: '', searchWarning: '', searchInfo: '',
    foundUserLabel: '', foundUserId: '', existingAcl: '', lastLdapUser: null,
    rows: createRows(),
    usersPermission: '', copySuccess: false,
    isSaving: false, saveSuccess: false, saveError: '',
    template: ''
  };

  function initPermissionRows() { W.rows = createRows(); }
  function goToStep(target) {
    if (target < 1 || target > W.totalSteps) return;
    if (target >= 3 && !W.searchDone) return;
    W.currentStep = target;
    if (target === 4) buildPermissionString();
    renderWizard();
  }
  const isStepDisabled = n => n !== W.currentStep && n > W.currentStep;
  const hasAnyPermission = () => checkAnyPermissionRecursive(W.rows);
  function buildPermissionString() { W.usersPermission = aclOf(W.rows); }

  function onUserFound(res) {
    W.searchDone = true;
    W.searchNotFound = false;
    W.foundUserId = res.id;
    W.foundUserLabel = res.nam || res.id;
    W.existingAcl = Array.isArray(res.acl) ? res.acl.join(',') : String(res.acl || '');
    W.saveSuccess = false; W.saveError = '';
    initPermissionRows();
    if (W.existingAcl) parseAcl(W.rows, W.existingAcl);   // 3. adım tablosunu önceden doldur
  }

  // das.search_user_ldap(uid) → DCIM.data.permissions.searchUser
  function performSearch(after) {
    const uid = W.searchUid.trim();
    if (!uid) { W.searchError = T.errors.enterUid; renderWizard(); return; }
    Object.assign(W, { isSearching: true, searchDone: false, searchNotFound: false, searchError: '', searchWarning: '', searchInfo: '', lastLdapUser: null });
    renderWizard();
    setTimeout(() => {
      const res = P.searchUser(uid);
      W.isSearching = false;
      if (res && res.id && !res.error) {
        W.lastLdapUser = res;
        if (res.inSql == 0) {
          renderWizard();
          let confirmed = false;
          dialog({
            title: T.confirmInsertTitle,
            variant: 'warning',
            body: '<div class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">' + esc(T.confirmInsertBody) + '</div>' +
              '<div class="mt-3 p-2.5 rounded-[2px] bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">' +
                '<div class="flex justify-between gap-3"><span class="text-slate-500">LDAP uid:</span><span class="font-mono font-bold text-slate-800 dark:text-slate-200">' + esc(res.id) + '</span></div>' +
                '<div class="flex justify-between gap-3"><span class="text-slate-500">Ad Soyad:</span><span class="font-bold text-slate-800 dark:text-slate-200">' + esc(res.nam) + '</span></div>' +
                '<div class="flex justify-between gap-3"><span class="text-slate-500">Birim:</span><span class="text-slate-700 dark:text-slate-300">' + esc(res.dept) + '</span></div>' +
              '</div>',
            confirmLabel: T.confirmInsertYes,
            cancelLabel: T.confirmInsertNo,
            confirmIcon: 'pi pi-check',
            onConfirm: () => { confirmed = true; },
            onClose: () => {
              if (confirmed) {
                insertUser(res);
                onUserFound(res);
                Object.assign(W, { searchInfo: T.userAddedInfo, searchError: '', searchWarning: '' });
              } else {
                Object.assign(W, { searchWarning: T.userNotAddedWarning, searchError: '', searchInfo: '', searchDone: false, searchNotFound: true });
              }
              renderWizard();
            }
          });
          return;
        }
        onUserFound(res);
      } else {
        W.searchDone = false;
        W.searchNotFound = true;
        if (res && res.code === 'ERR_SUB_INVUSER') W.searchError = T.errors.notFound;
        else if (res && res.code === 'ERR_BIND_FAIL') W.searchError = T.errors.bindFail;
        else W.searchError = (res && (res.err || res.code)) || T.errors.genericSearchError;
      }
      renderWizard();
      if (after) after();
    }, 550);
  }

  // das.insert_user_ldap(res) → mock dizinde inSql=1
  function insertUser(res) {
    const u = P.ldapUsers.find(x => x.id === res.id);
    if (u) u.inSql = 1;
    res.inSql = 1;
  }

  function retryInsertUser() {
    if (!W.lastLdapUser) return;
    Object.assign(W, { isSearching: true, searchDone: false, searchNotFound: false, searchError: '', searchWarning: '', searchInfo: '' });
    renderWizard();
    setTimeout(() => {
      W.isSearching = false;
      insertUser(W.lastLdapUser);
      onUserFound(W.lastLdapUser);
      Object.assign(W, { searchInfo: T.userAddedInfo, searchError: '', searchWarning: '' });
      renderWizard();
    }, 450);
  }

  function clearSearch() {
    Object.assign(W, { searchUid: '', searchDone: false, searchNotFound: false, searchError: '', searchWarning: '', searchInfo: '', foundUserLabel: '', foundUserId: '', existingAcl: '', lastLdapUser: null, usersPermission: '', template: '' });
    initPermissionRows();
    renderWizard();
  }

  function toggleSelectAll(row) {
    const next = !row.selectAll;
    row.selectAll = next;
    OPS.forEach(op => { if (isOpAvailable(row, op)) row.grants[op] = next; });
    if (row.children) row.children.forEach(child => {
      child.selectAll = next;
      OPS.forEach(op => { if (isOpAvailable(child, op)) child.grants[op] = next; });
      if (child.children) setRecursiveSelectAll(child, next);
    });
  }

  // Parent'taki op değişimi → AYNI VALUE'ya sahip direct child'lara yayılır
  function onParentCheckboxChange(row, op) {
    const avail = availOps(row);
    row.selectAll = avail.every(o => row.grants[o]);
    if (row.children) {
      const newVal = row.grants[op];
      row.children.filter(c => c.module.value === row.module.value).forEach(child => {
        if (isOpAvailable(child, op)) {
          child.grants[op] = newVal;
          child.selectAll = availOps(child).every(o => child.grants[o]);
        }
      });
    }
  }

  // Child'daki op değişimi → aynı value'lu kardeşlere ve (aynı value ise) parent'a yayılır
  function onChildCheckboxChange(child, op, parent) {
    child.selectAll = availOps(child).every(o => child.grants[o]);
    const newVal = child.grants[op];
    if (parent.children) {
      parent.children.filter(sib => sib !== child && sib.module.value === child.module.value).forEach(sib => {
        if (isOpAvailable(sib, op)) {
          sib.grants[op] = newVal;
          sib.selectAll = availOps(sib).every(o => sib.grants[o]);
        }
      });
    }
    if (parent.module.value === child.module.value && isOpAvailable(parent, op)) {
      parent.grants[op] = newVal;
      parent.selectAll = availOps(parent).every(o => parent.grants[o]);
    }
  }

  // das.update_user_ldap_attribute(uid, acl)
  function savePermissions() {
    if (W.isSaving || W.saveSuccess) return;
    Object.assign(W, { isSaving: true, saveSuccess: false, saveError: '' });
    renderWizard();
    setTimeout(() => {
      W.isSaving = false;
      const u = P.ldapUsers.find(x => x.id === W.foundUserId);
      if (u) u.acl = W.usersPermission;
      W.saveSuccess = true;
      W.saveError = '';
      pushAudit('Yetki Değişimi: ' + (W.foundUserId || W.foundUserLabel) + ' ACL: ' + W.usersPermission, 'Kullanıcı ' + W.foundUserLabel);
      renderWizard();
      toast(fill(T.saveSuccessBody, W.foundUserLabel), 'success', T.saveSuccessTitle);
    }, 700);
  }

  function copyToClipboard() {
    const done = () => { W.copySuccess = true; renderWizard(); setTimeout(() => { W.copySuccess = false; renderWizard(); }, 2000); };
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = W.usersPermission;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* yok say */ }
      ta.remove();
      done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(W.usersPermission).then(done, fallback);
    else fallback();
  }

  function resetWizard() {
    Object.assign(W, { currentStep: 1, searchUid: '', searchDone: false, searchNotFound: false, searchError: '', searchWarning: '', searchInfo: '', foundUserLabel: '', foundUserId: '', existingAcl: '', usersPermission: '', copySuccess: false, saveSuccess: false, saveError: '', template: '' });
    initPermissionRows();
    renderWizard();
  }

  function openUserInWizard(uid) {
    switchTab('wizard');
    W.currentStep = 2;
    W.searchUid = uid;
    const url = new URL(window.location.href);
    url.searchParams.set('uid', uid);
    window.history.replaceState(null, '', url.toString());
    performSearch();
  }

  // --- Şablon parçaları --------------------------------------------------------
  const infoCard = (iconBox, icon, title, desc) =>
    '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3.5 shadow-2xs"><div class="flex items-start gap-3">' +
      '<div class="w-8 h-8 rounded-[2px] ' + iconBox + ' flex items-center justify-center text-sm shrink-0"><i class="' + icon + '"></i></div>' +
      '<div><strong class="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1">' + esc(title) + '</strong>' +
      '<p class="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">' + esc(desc) + '</p></div>' +
    '</div></div>';

  function stepperHtml() {
    return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs"><div class="grid grid-cols-4 gap-2">' +
      [1, 2, 3, 4].map(n => {
        const cur = W.currentStep === n, done = W.currentStep > n, dis = isStepDisabled(n);
        const cls = cur ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400'
          : done ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500 hover:bg-emerald-500/10 cursor-pointer'
          : dis ? 'border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 opacity-60 cursor-not-allowed' : '';
        const num = cur ? 'bg-sky-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        return '<button type="button" data-step="' + n + '"' + (dis ? ' disabled' : '') + ' class="' + cls + ' flex items-center gap-2 px-3 py-2 border rounded-[2px] text-xs font-bold transition-all text-left disabled:cursor-not-allowed select-none">' +
          '<div class="' + num + ' w-5 h-5 rounded-[2px] flex items-center justify-center text-[10px] shrink-0 font-extrabold">' + (done ? '<span><i class="pi pi-check text-[10px]"></i></span>' : '<span>' + n + '</span>') + '</div>' +
          '<div class="truncate"><span class="block text-[11px] truncate">' + esc(T.stepLabels[n]) + '</span></div>' +
        '</button>';
      }).join('') + '</div></div>';
  }

  function step1Html() {
    return '<div class="space-y-3">' +
      kit.card({
        body: '<div class="flex items-start gap-3 py-1">' +
          '<div class="w-10 h-10 rounded-[2px] bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center text-lg shrink-0"><i class="pi pi-key"></i></div>' +
          '<div class="space-y-1"><h2 class="text-sm md:text-base font-extrabold text-slate-900 dark:text-slate-100">' + esc(T.heroTitle) + '</h2>' +
          '<p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">' + esc(T.heroDesc) + '</p></div>' +
        '</div>'
      }) +
      '<div class="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 rounded-[2px] p-3.5 shadow-2xs flex items-center gap-3">' +
        '<div class="w-8 h-8 rounded-[2px] bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center text-sm shrink-0"><i class="pi pi-exclamation-triangle"></i></div>' +
        '<div class="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed"><strong class="font-bold text-amber-900 dark:text-amber-100 mr-1">' + esc(T.important.title) + ':</strong><span>' + esc(T.important.desc) + '</span></div>' +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
        infoCard('bg-sky-500/10 text-sky-600 dark:text-sky-400', 'pi pi-user', T.targetUser.title, T.targetUser.desc) +
        infoCard('bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400', 'pi pi-table', T.permissionMatrix.title, T.permissionMatrix.desc) +
        infoCard('bg-purple-500/10 text-purple-600 dark:text-purple-400', 'pi pi-id-card', T.employeeType.title, T.employeeType.desc) +
      '</div>' +
      '<div class="flex justify-end pt-2">' + btn({ variant: 'primary', size: 'md', icon: 'pi pi-arrow-right', iconRight: true, label: T.startBtn, act: 'goto', attrs: 'data-n="2"' }) + '</div>' +
    '</div>';
  }

  function step2Html() {
    const alert = (cls, icon, txt) => '<div class="p-2.5 rounded-[2px] ' + cls + ' text-xs flex items-center gap-2"><i class="' + icon + ' text-sm shrink-0"></i><span>' + esc(txt) + '</span></div>';
    const demo = P.ldapUsers.slice(0, 8).concat(P.ldapUsers.filter(u => !u.inSql)).filter((u, i, a) => a.indexOf(u) === i);
    const body = '<div class="space-y-3 pt-1">' +
      '<div class="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end max-w-xl">' +
        '<div class="flex-1">' + kit.formField({
          label: T.searchPlaceholder, icon: 'pi pi-id-card',
          control: '<input id="ldap-uid-input" type="text" class="scada-input" placeholder="' + esc(T.searchPlaceholder) + '" value="' + esc(W.searchUid) + '" autocomplete="off" />'
        }) + '</div>' +
        btn({ variant: 'primary', size: 'md', icon: 'pi pi-search', label: W.isSearching ? T.searching : T.search, act: 'search', id: 'btn-search-ldap', disabled: W.isSearching || !W.searchUid.trim(), loading: W.isSearching }) +
      '</div>' +
      // SUNUM EKLENTİSİ: demo dizinindeki UID'ler
      '<div class="flex flex-wrap items-center gap-1 text-[10px]"><span class="text-slate-400 font-bold uppercase tracking-wider mr-1">Demo dizin:</span>' +
        demo.map(u => '<button type="button" data-demo-uid="' + u.id + '" class="px-1.5 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-500 hover:text-sky-600 dark:hover:text-sky-400 font-mono transition-colors" title="' + esc(u.nam + ' · ' + u.dept + (u.inSql ? '' : ' · SQL kaydı yok')) + '">' + u.id + '</button>').join('') +
        '<button type="button" data-demo-uid="99999999" class="px-1.5 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-500 hover:border-rose-500 font-mono transition-colors" title="LDAP bağlantı hatası senaryosu">99999999</button>' +
      '</div>' +
      (W.searchError ? alert('bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400', 'pi pi-exclamation-circle', W.searchError) : '') +
      (W.searchWarning ? alert('bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400', 'pi pi-exclamation-triangle', W.searchWarning) : '') +
      (W.searchInfo ? alert('bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400', 'pi pi-check-circle', W.searchInfo) : '') +
    '</div>';

    const ldap = W.lastLdapUser;
    const roleOf = ldap && P.roles.find(r => r.id === ldap.role);
    return '<div class="space-y-3">' +
      kit.card({ title: T.targetUserTitle, subtitle: T.targetUserSub, icon: 'pi pi-search', body }) +
      (W.searchDone
        ? '<div class="bg-emerald-500/10 border border-emerald-500/30 rounded-[2px] p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-[2px] bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0"><i class="pi pi-user text-base"></i></div>' +
              '<div><span class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">' + esc(T.userFound) + '</span>' +
              '<h3 class="text-sm font-extrabold text-slate-900 dark:text-slate-100">' + esc(W.foundUserLabel) + '</h3>' +
              (W.foundUserId ? '<p class="text-[11px] font-mono text-slate-500 dark:text-slate-400">UID: ' + esc(W.foundUserId) + (roleOf ? ' · ' + esc(roleOf.label) + ' (' + esc(roleOf.grp) + ')' : '') + (ldap && ldap.dept ? ' · ' + esc(ldap.dept) : '') + '</p>' : '') +
              '</div>' +
            '</div>' +
            btn({ variant: 'primary', size: 'sm', icon: 'pi pi-sliders-h', label: T.editPermissions, act: 'goto', attrs: 'data-n="3"' }) +
          '</div>'
        : '') +
      (W.searchNotFound && !W.searchWarning
        ? '<div class="bg-rose-500/10 border border-rose-500/30 rounded-[2px] p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-[2px] bg-rose-600 text-white flex items-center justify-center font-bold text-sm shrink-0"><i class="pi pi-user-minus text-base"></i></div>' +
              '<div><span class="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">' + esc(T.userNotFound) + '</span>' +
              '<h3 class="text-sm font-extrabold text-slate-900 dark:text-slate-100 font-mono">' + esc(W.searchUid) + '</h3></div>' +
            '</div>' +
            btn({ variant: 'secondary', size: 'sm', label: T.changeUser, act: 'clear-search' }) +
          '</div>'
        : '') +
      (W.searchNotFound && W.searchWarning
        ? '<div class="bg-amber-500/10 border border-amber-500/30 rounded-[2px] p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">' +
            '<div class="flex items-center gap-3">' +
              '<div class="w-10 h-10 rounded-[2px] bg-amber-600 text-white flex items-center justify-center font-bold text-sm shrink-0"><i class="pi pi-database text-base"></i></div>' +
              '<div><span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">' + esc(T.notInSqlTitle) + '</span>' +
              '<h3 class="text-sm font-extrabold text-slate-900 dark:text-slate-100 font-mono">' + esc(W.searchUid) + '</h3></div>' +
            '</div>' +
            '<div class="flex items-center gap-2">' +
              btn({ variant: 'primary', size: 'sm', icon: 'pi pi-plus', label: T.confirmInsertYes, act: 'retry-insert' }) +
              btn({ variant: 'secondary', size: 'sm', label: T.changeUser, act: 'clear-search' }) +
            '</div>' +
          '</div>'
        : '') +
      '<div class="flex items-center justify-start pt-1">' + btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-arrow-left', label: T.back, act: 'prev', id: 'btn-step2-back' }) + '</div>' +
    '</div>';
  }

  function opCell(row, op, id, parentIdx, childIdx, isChild) {
    if (!isOpAvailable(row, op)) return '<td class="text-center ' + (isChild ? 'py-1.5' : 'py-2') + ' px-1"><span class="text-slate-400 dark:text-slate-600 text-xs font-mono">—</span></td>';
    return '<td class="text-center ' + (isChild ? 'py-1.5' : 'py-2') + ' px-1">' +
      '<label for="' + id + '" class="inline-flex items-center justify-center gap-1 cursor-pointer select-none ' + (isChild ? 'px-1.5 py-0.5 hover:bg-slate-200/50' : 'px-2 py-1 hover:bg-slate-100') + ' rounded-[2px] dark:hover:bg-slate-800 transition-colors">' +
        '<input type="checkbox" id="' + id + '" data-wz="' + (isChild ? 'c' : 'p') + '" data-ri="' + parentIdx + '"' + (isChild ? ' data-ci="' + childIdx + '"' : '') + ' data-op="' + op + '"' + (row.grants[op] ? ' checked' : '') + ' class="w-3.5 h-3.5 rounded-[2px] accent-sky-600 cursor-pointer" />' +
        '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400' + (isChild ? '' : ' font-bold') + '">+' + row.module.value + op + '</span>' +
      '</label></td>';
  }

  function step3Html() {
    const allBtn = (row, id, small) => '<button type="button" id="' + id + '" data-wz-all="' + id + '" class="' +
      (row.selectAll ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700') +
      ' ' + (small ? 'w-5 h-5 text-[9px]' : 'w-6 h-6 text-[10px]') + ' rounded-[2px] border inline-flex items-center justify-center font-bold transition-all" title="' + (row.selectAll ? T.clearAll : T.selectAll) + '">' +
      '<i class="' + (row.selectAll ? 'pi pi-check' : 'pi pi-minus') + ' ' + (small ? 'text-[8px]' : 'text-[9px]') + '"></i></button>';

    let body = '';
    W.rows.forEach((row, ri) => {
      body += '<tr class="' + (row.selectAll ? 'bg-sky-50/50 dark:bg-sky-950/20' : 'hover:bg-slate-50/80 dark:hover:bg-surface-hover/60') + ' transition-colors font-medium text-slate-800 dark:text-slate-200">' +
        '<td class="py-2.5 px-3"><div class="flex items-center gap-2">' +
          (row.children && row.children.length
            ? '<button type="button" data-wz-expand="' + ri + '" class="w-5 h-5 rounded-[2px] bg-slate-100 dark:bg-slate-800 hover:bg-sky-500/10 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors" title="' + (row.isExpanded ? 'Daralt' : 'Genişlet') + '"><i class="' + (row.isExpanded ? 'pi pi-minus' : 'pi pi-plus') + ' text-[9px]"></i></button>'
            : '<span class="w-5"></span>') +
          '<span class="text-base select-none text-sky-600 dark:text-sky-400"><i class="' + moduleIcon(row.module.value) + ' text-sm"></i></span>' +
          '<div><div class="font-bold text-xs text-slate-900 dark:text-slate-100">' + esc(modLabel(row.module)) + '</div>' +
          '<div class="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-bold">' + row.module.value + '</div></div>' +
        '</div></td>' +
        OPS.map(op => opCell(row, op, 'chk-p' + ri + '-' + op, ri, null, false)).join('') +
        '<td class="text-center py-2 px-3">' + allBtn(row, 'btn-all-p' + ri, false) + '</td>' +
      '</tr>';
      if (row.isExpanded && row.children) {
        row.children.forEach((child, ci) => {
          body += '<tr class="' + (child.selectAll ? 'bg-sky-50/30 dark:bg-sky-950/10' : 'bg-slate-50/40 dark:bg-slate-900/40') + ' transition-colors border-t border-slate-100 dark:border-slate-800/40">' +
            '<td class="py-2 px-3 pl-8"><div class="flex items-center gap-2">' +
              '<span class="text-slate-400 dark:text-slate-600 text-xs font-mono">↳</span><i class="pi pi-file text-slate-400 text-xs"></i>' +
              '<div><div class="font-semibold text-[11px] text-slate-800 dark:text-slate-200">' + esc(modLabel(child.module)) + '</div>' +
              '<div class="text-[10px] font-mono text-slate-400 dark:text-slate-500">' + child.module.value + '</div></div>' +
            '</div></td>' +
            OPS.map(op => opCell(child, op, 'chk-c' + ri + '-' + ci + '-' + op, ri, ci, true)).join('') +
            '<td class="text-center py-1.5 px-3">' + allBtn(child, 'btn-all-c' + ri + '-' + ci, true) + '</td>' +
          '</tr>';
        });
      }
    });

    const any = hasAnyPermission();
    return '<div class="space-y-3">' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">' +
        '<div><h2 class="text-xs md:text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-table text-sky-600 dark:text-sky-400"></i><span>' + esc(T.permissionMatrixTitle) + '</span></h2>' +
        '<p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(fill(T.permissionMatrixSub, W.foundUserLabel)) + '</p></div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          // SUNUM EKLENTİSİ: rol şablonundan doldur
          '<div class="flex items-center gap-1.5"><span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Rol şablonu:</span>' +
            '<select data-wz-template class="bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[11px] rounded-[2px] px-2 py-1 font-semibold focus:outline-none focus:border-sky-500">' +
              '<option value="">— Uygula —</option>' + P.roles.map(r => '<option value="' + r.id + '"' + (W.template === r.id ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') +
            '</select></div>' +
          btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-check-square', label: T.selectAll, act: 'select-all', id: 'btn-select-all' }) +
          btn({ variant: 'ghost', size: 'sm', icon: 'pi pi-times', label: T.clearAll, act: 'clear-all', id: 'btn-clear-all', cls: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40' }) +
        '</div>' +
      '</div>' +
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-x-auto shadow-2xs">' +
        '<table class="scada-table"><thead><tr class="bg-slate-50 dark:bg-surface-panel text-slate-700 dark:text-slate-300 select-none">' +
          '<th class="w-1/3 text-left">' + esc(T.module) + '</th>' +
          OPS.map(op => '<th class="text-center w-28"><div class="flex items-center justify-center gap-1 font-mono">' +
            '<span class="px-1.5 py-0.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-[2px] text-[10px] font-extrabold">' + op + '</span>' +
            '<span class="text-[10px] font-normal text-slate-500 dark:text-slate-400">' + OP_LABELS[op] + '</span></div></th>').join('') +
          '<th class="text-center w-24">' + esc(T.all) + '</th>' +
        '</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-slate-800/80">' + body + '</tbody></table>' +
      '</div>' +
      (any
        ? '<div class="bg-white dark:bg-surface-card border border-sky-500/30 rounded-[2px] p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs"><div class="flex items-center gap-2 overflow-hidden">' +
            '<span class="px-2 py-0.5 rounded-[2px] bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 shrink-0"><i class="pi pi-eye"></i>' + esc(T.preview) + '</span>' +
            '<code class="text-xs font-mono text-slate-800 dark:text-slate-200 font-bold truncate" title="' + esc(previewOf(W.rows)) + '">' + esc(previewOf(W.rows)) + '</code>' +
          '</div></div>'
        : '') +
      '<div class="flex items-center justify-between pt-1">' +
        btn({ variant: 'secondary', size: 'md', icon: 'pi pi-arrow-left', label: T.back, act: 'prev', id: 'btn-step3-back' }) +
        btn({ variant: 'primary', size: 'md', icon: 'pi pi-arrow-right', iconRight: true, label: T.review, act: 'next', id: 'btn-step3-next', disabled: !any }) +
      '</div>' +
    '</div>';
  }

  function step4Html() {
    const granted = flatRows(W.rows).filter(r => getGrantedOps(r).length > 0);
    const body = '<div class="space-y-4 pt-1">' +
      '<div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">' +
        '<span class="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-user text-sky-600 dark:text-sky-400"></i>' + esc(T.targetLdapUid) + '</span>' +
        '<span class="px-2.5 py-1 rounded-[2px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs font-mono">' + esc(W.foundUserLabel) + '</span>' +
      '</div>' +
      '<div class="space-y-1.5 pb-3 border-b border-slate-100 dark:border-slate-800">' +
        '<span class="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-key text-amber-500"></i>' + esc(T.generatedAclString) + '</span>' +
        '<div class="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/80 p-2 rounded-[2px] border border-slate-200 dark:border-border-subtle">' +
          '<code id="acl-output" class="text-xs font-mono font-bold text-sky-600 dark:text-sky-400 flex-1 break-all">' + esc(W.usersPermission || T.noPermissionSelected) + '</code>' +
          (W.usersPermission ? btn({ variant: 'secondary', size: 'sm', icon: W.copySuccess ? 'pi pi-check' : 'pi pi-copy', label: W.copySuccess ? T.copied : T.copy, act: 'copy', id: 'btn-copy-acl' }) : '') +
        '</div>' +
        (W.existingAcl && W.existingAcl !== W.usersPermission
          ? '<div class="text-[10px] font-mono text-slate-400 break-all"><span class="font-sans font-bold text-slate-500 dark:text-slate-400">Mevcut dize: </span>' + esc(W.existingAcl) + '</div>' : '') +
      '</div>' +
      '<div class="space-y-2">' +
        '<span class="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><i class="pi pi-sitemap text-purple-500"></i>' + esc(T.moduleBreakdown) + '</span>' +
        '<div class="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">' +
          granted.map(row => '<div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">' +
            '<i class="' + moduleIcon(row.module.value) + ' text-[10px] text-sky-500"></i>' +
            '<span class="font-bold text-slate-900 dark:text-slate-100">' + esc(modLabel(row.module)) + '</span>' +
            '<div class="flex items-center gap-0.5 ml-1">' + getGrantedOps(row).map(op => '<span class="px-1 py-0.2 rounded-[2px] bg-sky-500/20 text-sky-600 dark:text-sky-400 font-mono text-[9px] font-extrabold">' + op + '</span>').join('') + '</div>' +
          '</div>').join('') +
          (!hasAnyPermission() ? '<div class="text-amber-500 text-xs flex items-center gap-1"><i class="pi pi-exclamation-triangle"></i>' + esc(T.noPermissionSelected) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="p-3 rounded-[2px] bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2 leading-relaxed">' + esc(T.saveWarning) + '</div>' +
      (W.saveSuccess
        ? '<div id="save-success-banner" class="p-3 rounded-[2px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2.5 shadow-2xs">' +
            '<i class="pi pi-check-circle text-base text-emerald-500 shrink-0 mt-0.5"></i><div><strong class="block font-bold">' + esc(T.saveSuccessTitle) + '</strong><span>' + esc(fill(T.saveSuccessBody, W.foundUserLabel)) + '</span></div></div>' : '') +
      (W.saveError
        ? '<div id="save-error-banner" class="p-3 rounded-[2px] bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5 shadow-2xs">' +
            '<i class="pi pi-times-circle text-base text-rose-500 shrink-0 mt-0.5"></i><div><strong class="block font-bold">' + esc(T.saveErrorTitle) + '</strong><span>' + esc(W.saveError) + '</span></div></div>' : '') +
      '<div class="pt-2">' + btn({ variant: 'primary', size: 'lg', icon: 'pi pi-save', cls: 'w-full', act: 'save', id: 'btn-save-permissions', loading: W.isSaving,
        disabled: !W.usersPermission || W.isSaving || W.saveSuccess, label: W.isSaving ? T.saving : W.saveSuccess ? T.saved : T.saveToLdap }) + '</div>' +
      '<div class="flex items-center justify-between pt-2">' +
        btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-arrow-left', label: T.back, act: 'prev', id: 'btn-step4-back' }) +
        btn({ variant: 'ghost', size: 'sm', icon: 'pi pi-refresh', label: T.resetWizard, act: 'reset', id: 'btn-step4-reset', cls: 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30' }) +
      '</div>' +
    '</div>';
    return '<div class="space-y-3">' + kit.card({ title: T.reviewConfirmTitle, subtitle: T.reviewConfirmSub, icon: 'pi pi-check-circle', body }) + '</div>';
  }

  function renderWizard() {
    if (state.tab !== 'wizard') return;
    const content = W.currentStep === 1 ? step1Html() : W.currentStep === 2 ? step2Html() : W.currentStep === 3 ? step3Html() : step4Html();
    viewWizard.innerHTML = stepperHtml() + '<div class="flex-1 min-h-0">' + content + '</div>';
  }

  // --- Sihirbaz olayları (delegasyon) -------------------------------------------
  viewWizard.addEventListener('click', e => {
    const st = e.target.closest('[data-step]');
    if (st && !st.disabled) { goToStep(parseInt(st.getAttribute('data-step'), 10)); return; }
    const demo = e.target.closest('[data-demo-uid]');
    if (demo) { W.searchUid = demo.getAttribute('data-demo-uid'); performSearch(); return; }
    const ex = e.target.closest('[data-wz-expand]');
    if (ex) { const r = W.rows[parseInt(ex.getAttribute('data-wz-expand'), 10)]; r.isExpanded = !r.isExpanded; renderWizard(); return; }
    const all = e.target.closest('[data-wz-all]');
    if (all) {
      const m = all.getAttribute('data-wz-all').match(/^btn-all-(p|c)(\d+)(?:-(\d+))?$/);
      const row = m[1] === 'p' ? W.rows[+m[2]] : W.rows[+m[2]].children[+m[3]];
      toggleSelectAll(row);
      renderWizard();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act || act.disabled) return;
    switch (act.getAttribute('data-act')) {
      case 'goto': goToStep(parseInt(act.getAttribute('data-n'), 10)); break;
      case 'prev': goToStep(W.currentStep - 1); break;
      case 'next': goToStep(W.currentStep + 1); break;
      case 'search': performSearch(); break;
      case 'clear-search': clearSearch(); break;
      case 'retry-insert': retryInsertUser(); break;
      case 'select-all': W.rows.forEach(r => setRecursiveSelectAll(r, true)); renderWizard(); break;
      case 'clear-all': W.rows.forEach(r => setRecursiveSelectAll(r, false)); renderWizard(); break;
      case 'copy': copyToClipboard(); break;
      case 'save': savePermissions(); break;
      case 'reset': resetWizard(); break;
    }
  });

  viewWizard.addEventListener('change', e => {
    const cb = e.target.closest('[data-wz]');
    if (cb) {
      const ri = parseInt(cb.getAttribute('data-ri'), 10);
      const op = cb.getAttribute('data-op');
      const parent = W.rows[ri];
      if (cb.getAttribute('data-wz') === 'p') {
        parent.grants[op] = cb.checked;
        onParentCheckboxChange(parent, op);
      } else {
        const child = parent.children[parseInt(cb.getAttribute('data-ci'), 10)];
        child.grants[op] = cb.checked;
        onChildCheckboxChange(child, op, parent);
      }
      renderWizard();
      return;
    }
    const tpl = e.target.closest('[data-wz-template]');
    if (tpl && tpl.value) {
      const role = P.roles.find(r => r.id === tpl.value);
      W.template = role.id;
      parseAcl(W.rows, role.acl);
      renderWizard();
      toast(role.label + ' şablonu ' + W.foundUserLabel + ' için matrise uygulandı (henüz kaydedilmedi).', 'info', 'Rol Şablonu');
    }
  });

  viewWizard.addEventListener('input', e => {
    if (e.target.id !== 'ldap-uid-input') return;
    W.searchUid = e.target.value;
    const b = document.getElementById('btn-search-ldap');
    if (b) b.disabled = W.isSearching || !W.searchUid.trim();
  });
  viewWizard.addEventListener('keydown', e => {
    if (e.target.id === 'ldap-uid-input' && e.key === 'Enter') performSearch();
  });

  // ===========================================================================
  // Açılış
  // ===========================================================================
  switchTab(state.tab);
  const uidParam = params.get('uid');
  if (uidParam) {
    const step = parseInt(params.get('step') || '2', 10);
    switchTab('wizard');
    W.currentStep = 2;
    W.searchUid = uidParam;
    performSearch(() => { if (step >= 3 && W.searchDone) goToStep(Math.min(step, 4)); });
  }
})();
