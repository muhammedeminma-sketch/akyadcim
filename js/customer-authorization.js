/* ==========================================================================
   DCIM Sunum — Müşteri Sayfaları Yetkilendirme
   NewUICMPAuthorizationManagementComponent, sayfa modu (/dcim/customer-authorization, 9 Kas yeniden tasarım):
   - Sol: müşteri kullanıcıları listesi (arama, seçili satır vurgusu, pozisyon rozeti)
   - Sağ: seçili kullanıcı özeti (müşteri kutusu), "Kullanıcı Sayfaları Modülleri" (6 modül satırı,
     anahtar + Alt Yetkiler açılır listesi, ilerleme çubuğu), "Müşteri Alarm Yönetimi" (sayaçlar,
     dağılım çubuğu, Tümünü Aç / Tümünü Kapat)
   - Onay diyalogları: Yetkileri Sıfırla, toplu alarm aç/kapat
   ACL ayrıştırma / üretme mantığı orijinal bileşenle aynıdır (CAB(...), REP(...), ASM*, PDU*, CDB*, CMA*).
   Kullanıcılar: DCIM.data.accounts.users (kurgusal müşteri hesapları; Kullanıcı Ayarları ile aynı kayıtlar).
   Oturumdaki değişiklikler sessionStorage 'dcim_customer_auth_v1'de tutulur (sekme kapanınca sıfırlanır)
   ve 'dcim_audit_session' kuyruğuna YETKİ kaydı olarak yazılır (audit-logs.html gösterir).

   Derin bağlantılar:
     ?uid=<das_uid|user_id>      kullanıcıyı seçer (orijinal sorgu parametresi)
     ?q=<metin>                  kullanıcı araması (kullanıcı adı / ad / soyad / müşteri)
     ?customer=<müşteri adı>     o müşterinin ilk kullanıcısını seçer (ör. ?customer=Delta)
     ?open=kabinler|raporlama    alt yetki listesini açık getirir
     ?reset=1                    oturum değişikliklerini sıfırlar
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, button, toast, dialog, storage } = DCIM.ui;
  const kit = DCIM.kit;
  DCIM.shell.init({ active: 'customer-auth' });

  const trLower = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
  const clone = o => JSON.parse(JSON.stringify(o));
  const STORE_KEY = 'dcim_customer_auth_v1';
  const DEFAULT_CUSTOMER_ACL = 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,';

  // messages.tr.json → authorizationManagement.*
  const AM = {
    title: 'MÜŞTERİ SAYFALARI YETKİLENDİRME', users: 'Kullanıcılar', searchUser: 'Kullanıcı ara...', userNotFound: 'Kullanıcı bulunamadı.',
    permissionModules: 'Kullanıcı Sayfaları Modülleri', permissionDescription: 'Bu modüle erişim izni tanımlıdır.', subPermissions: 'Alt Yetkiler',
    noRelatedCustomer: 'İlişkili Müşteri Yok', resetPermissions: 'Yetkileri Sıfırla', saveChanges: 'Değişiklikleri Kaydet', saving: 'Kaydediliyor...',
    customerAlarmManagement: 'MÜŞTERİ ALARM YÖNETİMİ', total: 'TOPLAM', alarmOn: 'ALARM AÇIK', alarmOff: 'KAPALI', turnOnAll: 'Tümünü Aç', turnOffAll: 'Tümünü Kapat',
    alarmManagementInfo: 'Sistem genelindeki müşterilerin alarm bildirim tercihlerini merkezi olarak yönetebilir ve toplu yapılandırma işlemlerini gerçekleştirebilirsiniz.',
    selectUserPrompt: 'Yetkilerini düzenlemek için sol listeden bir kullanıcı seçin.',
    bulkToggleTitle: 'Tüm Alarmları {action}', bulkToggleMessage: 'Sistemdeki tüm müşteriler için alarm bildirimlerini toplu olarak {action} üzeresiniz.',
    bulkToggleWarning: 'Bu işlem, müşterilerin mevcut alarm ayarlarını ve yetkilerini devre dışı bırakacaktır.',
    cancelBtn: 'İptal Et', confirmBulkToggle: 'Evet, Alarmları {action}', confirmResetBtn: 'Evet, Yetkileri Sıfırla', resetTitle: 'Yetkileri Sıfırla',
    resetMessage: '{name} kullanıcısının yetkilerini varsayılan şablona sıfırlamak istediğinize emin misiniz?',
    resetWarning: 'Bu işlem kullanıcının yetkilerini standart başlangıç seviyesine (Kabinler, Varlıklar, PDU ve Raporlama) çekecektir.',
    permissions: { kabinler: 'Kabinler', tumVarliklar: 'Tüm Varlıklar', raporlama: 'Raporlama', pduDetaylari: 'PDU Detayları', alarmListesi: 'Alarm Listesi', musteriHesap: 'Müşteri Bilgileri' },
    sub: { kabinler_pdu: 'PDU Detayları', kabinler_asm: 'Kabin Görünümü (Asset)', kabinler_sensor: 'Sensör Detayları', raporlama_pduGuc: 'PDU Güç Raporlama', raporlama_sensor: 'Sensör Raporlama', raporlama_alarm: 'Alarm Raporlama' },
    alerts: {
      bulkEnabled: 'Tüm kullanıcılar için alarm yetkilendirmesi başarıyla etkinleştirildi.',
      bulkDisabled: 'Tüm kullanıcılar için alarm yetkilendirmesi başarıyla devre dışı bırakıldı.',
      resetSuccess: '{username} kullanıcısının yetkileri varsayılan şablona sıfırlandı.',
      updateSuccess: '{username} kullanıcısının yetkileri başarıyla güncellendi.',
      noAlarmPermission: 'Kullanıcının Alarm Yetkisi bulunmamaktadır!',
      noAlarmPermissionTooltip: 'Bu yetkiyi açmak için önce Ana Alarm Listesi yetkisini açmalısınız.'
    }
  };
  const PERM_KEYS = ['kabinler', 'tumVarliklar', 'raporlama', 'pduDetaylari', 'alarmListesi', 'musteriHesap'];
  const MODULE_ICONS = { kabinler: 'pi pi-server', tumVarliklar: 'pi pi-box', raporlama: 'pi pi-chart-line', pduDetaylari: 'pi pi-bolt', alarmListesi: 'pi pi-bell', musteriHesap: 'pi pi-id-card' };
  const SUB_MAP = { kabinler: ['kabinler_pdu', 'kabinler_asm', 'kabinler_sensor'], raporlama: ['raporlama_pduGuc', 'raporlama_sensor', 'raporlama_alarm'] };

  // ---------------------------------------------------------------------------
  // ACL ayrıştırma / üretme (authorization-management.component.ts ile aynı)
  // ---------------------------------------------------------------------------
  const splitAcl = acl => String(acl || '').split(/,(?![^(]*\))/).map(t => t.trim());
  function parseAclToSubPermissions(acl) {
    const tags = splitAcl(acl);
    const sp = { raporlama_pduGuc: false, raporlama_sensor: false, raporlama_alarm: false, kabinler_pdu: false, kabinler_asm: false, kabinler_sensor: false };
    if (tags.some(t => t === '*')) { Object.keys(sp).forEach(k => { sp[k] = true; }); return sp; }
    if (tags.some(t => t === 'CAB*')) { sp.kabinler_pdu = sp.kabinler_asm = sp.kabinler_sensor = true; }
    else if (tags.some(t => t === '*CAB' || t === 'CAB')) { sp.kabinler_pdu = sp.kabinler_asm = true; }
    else {
      const cab = tags.find(t => t.startsWith('CAB('));
      const mm = cab && cab.match(/^CAB\(([^)]+)\)$/);
      if (mm) {
        const parts = mm[1].split(/[,|-]/).map(p => p.trim().toLowerCase());
        sp.kabinler_pdu = parts.includes('pdu'); sp.kabinler_asm = parts.includes('asm'); sp.kabinler_sensor = parts.includes('sen');
      }
    }
    if (tags.some(t => t === 'REP*')) { sp.raporlama_pduGuc = sp.raporlama_sensor = sp.raporlama_alarm = true; }
    else {
      const rep = tags.find(t => t.startsWith('REP('));
      const mm = rep && rep.match(/^REP\(([^)]+)\)$/);
      if (mm) {
        const parts = mm[1].split(/[,|-]/).map(p => p.trim().toLowerCase());
        sp.raporlama_pduGuc = parts.includes('pdu'); sp.raporlama_sensor = parts.includes('sen'); sp.raporlama_alarm = parts.includes('cma');
      }
    }
    return sp;
  }
  function parseAclToPermissions(acl) {
    const tags = splitAcl(acl);
    const has = tag => tags.some(t => t === tag || t === tag + '*' || t === '*' + tag || t === '*' || t.startsWith(tag + '('));
    const sp = parseAclToSubPermissions(acl);
    return {
      kabinler: sp.kabinler_pdu || sp.kabinler_asm || sp.kabinler_sensor,
      tumVarliklar: has('ASM'),
      pduDetaylari: has('PDU'),
      raporlama: sp.raporlama_pduGuc || sp.raporlama_sensor || sp.raporlama_alarm,
      alarmListesi: has('CMA'),
      musteriHesap: has('CDB')
    };
  }
  function buildAclFromUser(u) {
    const parts = [];
    const p = u.permissions;
    const sp = u.subPermissions;
    if (!p.alarmListesi) sp.raporlama_alarm = false;
    if (p.kabinler) {
      const c = [];
      if (sp.kabinler_pdu) c.push('pdu');
      if (sp.kabinler_asm) c.push('asm');
      if (sp.kabinler_sensor) c.push('sen');
      if (c.length === 3) parts.push('CAB*'); else if (c.length) parts.push('CAB(' + c.join(', ') + ')');
    }
    if (p.tumVarliklar) parts.push('ASM*');
    if (p.pduDetaylari) parts.push('PDU*');
    if (p.raporlama) {
      const r = [];
      if (sp.raporlama_pduGuc) r.push('pdu');
      if (sp.raporlama_sensor) r.push('sen');
      if (sp.raporlama_alarm) r.push('cma');
      if (r.length === 3) parts.push('REP*'); else if (r.length) parts.push('REP(' + r.join(', ') + ')');
    }
    if (p.musteriHesap) parts.push('CDB*');
    if (p.alarmListesi) parts.push('CMA*');
    let acl = parts.join(',');
    if (acl.length) acl += ',';
    return acl;
  }
  function getDisplayPosition(grp) {
    const v = trLower(grp).trim();
    if (v === 'admin') return 'Admin';
    if (v === 'mühendis' || v === 'muhendis') return 'Mühendis';
    if (v === 'operatör' || v === 'operator') return 'Operatör';
    if (v === 'misafir') return 'Misafir';
    if (v === 'müşteri' || v === 'musteri') return 'Müşteri';
    return v;
  }

  // ---------------------------------------------------------------------------
  // Veri (HIS_get_auth_users karşılığı) + oturum kalıcılığı
  // ---------------------------------------------------------------------------
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') storage.sessionSet(STORE_KEY, '');
  let saved = {};
  try { saved = JSON.parse(storage.sessionGet(STORE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
  const persist = () => storage.sessionSet(STORE_KEY, JSON.stringify(saved));

  const SRC = ((DCIM.data.accounts && DCIM.data.accounts.users) || []).filter(u => /m[uü][sş]?teri/.test(trLower(u.das_grp)));
  const toAuth = u => {
    const acl = saved[u.user_id] != null ? saved[u.user_id] : (u.das_acl || '');
    return {
      user_id: u.user_id, das_uid: u.das_uid, name: u.name, surname: u.surname, email: u.email, das_acl: acl, das_grp: u.das_grp,
      customer_name: u.customer_name || '', permissions: parseAclToPermissions(acl), subPermissions: parseAclToSubPermissions(acl)
    };
  };
  const state = {
    users: SRC.map(toAuth),
    search: params.get('q') || '',
    selected: null,
    openDD: null,
    saving: false
  };

  function filtered() {
    const term = trLower(state.search).trim();
    if (!term) return state.users;
    return state.users.filter(u => trLower(u.das_uid).includes(term) || trLower(u.name).includes(term) || trLower(u.surname).includes(term) ||
      trLower(u.name + ' ' + u.surname).includes(term) || trLower(u.customer_name).includes(term));
  }
  function stats() {
    const total = state.users.length;
    const active = state.users.filter(u => u.permissions.alarmListesi).length;
    return { total, active, inactive: total - active };
  }
  function selectUser(u) { state.selected = u ? clone(u) : null; }

  (function initSelection() {
    const uid = params.get('uid');
    const cust = params.get('customer');
    let found = null;
    if (uid) found = state.users.find(u => u.das_uid === uid || u.user_id === uid);
    if (!found && cust) found = state.users.find(u => trLower(u.customer_name).includes(trLower(cust)));
    const list = filtered();
    selectUser(found || list[0] || state.users[0] || null);
    const dd = params.get('open');
    if (dd && SUB_MAP[dd]) state.openDD = dd;
  })();

  function pushAudit(txt, asset) {
    const user = DCIM.session.user();
    let list = [];
    try { list = JSON.parse(storage.sessionGet('dcim_audit_session') || '[]'); } catch (e) { list = []; }
    list.push({ tim: new Date().toISOString(), cat: 'YETKİ', txt, sta: 0x0105, user: user.usr || 'operator', ip: '10.24.1.45', url: 'https://dcim.dca.local/k/dcim/customer-authorization', asset, res: 'success' });
    storage.sessionSet('dcim_audit_session', JSON.stringify(list.slice(-50)));
  }

  // ---------------------------------------------------------------------------
  // Başlık (app-page-header)
  // ---------------------------------------------------------------------------
  function renderHeader() {
    document.getElementById('ca-header').innerHTML = kit.pageHeader({
      title: AM.title,
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Kullanıcı Ayarları', href: 'account-settings.html' }, { label: AM.title }],
      actions: '<div class="flex items-center gap-2">' +
        '<span class="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-surface-panel border border-slate-200 dark:border-border-muted"><i class="pi pi-users text-[10px]"></i>' + state.users.length + ' ' + AM.users + '</span>' +
        '<a href="account-settings.html" class="' + DCIM.ui.buttonClasses('secondary', 'sm') + '"><i class="pi pi-arrow-left text-current shrink-0"></i><span class="truncate">Hesap Listesi</span></a>' +
      '</div>'
    });
  }

  // ---------------------------------------------------------------------------
  // Sol: kullanıcı listesi
  // ---------------------------------------------------------------------------
  function renderUsersShell() {
    document.getElementById('ca-users').innerHTML =
      '<div class="px-4 pt-3.5 pb-3 border-b border-slate-200 dark:border-border-subtle space-y-2.5 select-none shrink-0">' +
        '<div class="flex items-center justify-between">' +
          '<span class="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">' + AM.users + '</span>' +
          '<span data-count class="min-w-6 h-5 px-1.5 inline-flex items-center justify-center text-[10px] font-extrabold tabular-nums bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 rounded-[2px]"></span>' +
        '</div>' +
        '<div class="relative">' +
          '<i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] pointer-events-none"></i>' +
          '<input type="text" data-search value="' + esc(state.search) + '" placeholder="' + esc(AM.searchUser) + '" class="w-full h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-surface-base border border-slate-200 dark:border-border-muted rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:bg-white dark:focus:bg-surface-base focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition-colors" />' +
          '<button type="button" data-search-clear class="' + (state.search ? '' : 'hidden ') + 'absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-[2px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-surface-hover"><i class="pi pi-times text-[9px]"></i></button>' +
        '</div>' +
      '</div>' +
      '<div data-list class="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-0.5"></div>';
  }

  function renderUserList() {
    const host = document.getElementById('ca-users');
    const list = filtered();
    const sel = state.selected;
    host.querySelector('[data-count]').textContent = list.length;
    host.querySelector('[data-search-clear]').classList.toggle('hidden', !state.search);
    host.querySelector('[data-list]').innerHTML = list.length
      ? list.map(u => {
        const on = sel && sel.user_id === u.user_id;
        return '<div data-user="' + esc(u.user_id) + '" class="group relative pl-3 pr-2.5 py-2 flex items-center gap-2.5 cursor-pointer border rounded-[2px] transition-colors ' +
            (on ? 'bg-sky-500/10 dark:bg-sky-500/10 border-sky-500/30 dark:border-sky-500/25' : 'border-transparent hover:bg-slate-50 dark:hover:bg-surface-hover/50') + '">' +
          (on ? '<span class="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-sky-600 dark:bg-sky-400"></span>' : '') +
          '<div class="w-8 h-8 rounded-[2px] border font-extrabold text-[11px] flex items-center justify-center shrink-0 select-none uppercase transition-colors ' +
            (on ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-100 dark:bg-surface-panel text-slate-600 dark:text-slate-300 border-slate-200 dark:border-border-muted') + '">' + esc(u.name.charAt(0) + u.surname.charAt(0)) + '</div>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-xs font-bold truncate leading-tight ' + (on ? 'text-sky-800 dark:text-sky-300' : 'text-slate-800 dark:text-slate-200') + '">' + esc(u.name + ' ' + u.surname) + '</div>' +
            '<div class="flex items-center justify-between gap-1.5 mt-1 min-w-0">' +
              '<span class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">' + esc(u.das_uid) + '</span>' +
              '<span class="px-1.5 py-px rounded-[2px] bg-slate-100 dark:bg-surface-panel border border-slate-200 dark:border-border-muted text-slate-600 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wide shrink-0">' + esc(getDisplayPosition(u.das_grp)) + '</span>' +
            '</div>' +
          '</div>' +
          '<i class="pi pi-chevron-right text-[10px] shrink-0 transition-opacity ' + (on ? 'text-sky-600 dark:text-sky-400 opacity-100' : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100') + '"></i>' +
        '</div>';
      }).join('')
      : '<div class="flex flex-col items-center justify-center p-8 text-center h-48 select-none">' +
          '<span class="w-10 h-10 mb-3 rounded-[2px] flex items-center justify-center bg-slate-100 dark:bg-surface-panel border border-slate-200 dark:border-border-muted"><i class="pi pi-search-minus text-slate-400 text-sm"></i></span>' +
          '<span class="text-xs text-slate-500 dark:text-slate-400 font-medium">' + esc(AM.userNotFound) + '</span>' +
        '</div>';
  }

  // ---------------------------------------------------------------------------
  // Sağ: ayrıntı
  // ---------------------------------------------------------------------------
  function subRow(key, sk, u) {
    const locked = sk === 'raporlama_alarm' && !u.permissions.alarmListesi;
    return '<label data-sublabel="' + sk + '" class="h-10 flex items-center justify-between gap-4 pl-3 pr-0 transition-colors ' +
        (locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white dark:hover:bg-surface-hover/40') + '"' +
        (locked ? ' title="' + esc(AM.alerts.noAlarmPermissionTooltip) + '"' : '') + '>' +
      '<span class="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 truncate">' +
        (locked ? '<i class="pi pi-lock text-[10px] text-amber-500"></i>' : '') + esc(AM.sub[sk]) + '</span>' +
      '<input type="checkbox" class="ca-sub-input" data-sub="' + sk + '" data-parent="' + key + '"' + (u.subPermissions[sk] ? ' checked' : '') + (locked ? ' disabled' : '') + ' />' +
      '<span class="ca-sub-track"></span>' +
    '</label>';
  }

  function moduleRow(key, u) {
    const p = u.permissions;
    const sp = u.subPermissions;
    const open = state.openDD === key;
    const subs = SUB_MAP[key];
    const subOn = subs ? subs.filter(k => sp[k]).length : 0;
    return '<div class="relative transition-colors' + (open ? ' ca-row-open' : '') + '">' +
      '<span class="absolute left-0 top-0 bottom-0 w-0.5 transition-colors ' + (p[key] ? 'bg-sky-600 dark:bg-sky-500' : 'bg-transparent') + '"></span>' +
      '<div data-perm="' + key + '" class="ca-row flex items-center gap-3 px-4 select-none transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-surface-hover/40">' +
        '<span class="w-9 h-9 rounded-[2px] border flex items-center justify-center shrink-0 transition-colors ' +
          (p[key] ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25' : 'bg-slate-100 dark:bg-surface-panel text-slate-400 dark:text-slate-500 border-slate-200 dark:border-border-muted') + '"><i class="' + MODULE_ICONS[key] + ' text-sm"></i></span>' +
        '<div class="flex flex-col min-w-0 flex-1 pointer-events-none">' +
          '<span class="text-xs font-bold truncate ' + (p[key] ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400') + '">' + esc(AM.permissions[key]) + '</span>' +
          '<span class="text-[10px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5 truncate">' + esc(AM.permissionDescription) + '</span>' +
        '</div>' +
        '<div class="w-12 sm:w-36 flex justify-end shrink-0">' +
          (subs
            ? '<button type="button" data-dd="' + key + '" title="' + esc(AM.subPermissions) + '" class="h-7 inline-flex items-center gap-1.5 px-2 border rounded-[2px] text-[10px] font-bold cursor-pointer select-none transition-colors ' +
                (open ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30' : 'bg-white dark:bg-surface-panel text-slate-600 dark:text-slate-300 border-slate-200 dark:border-border-muted hover:border-sky-500/40 hover:text-sky-700 dark:hover:text-sky-400') + '">' +
                '<i class="pi pi-sitemap text-[10px]"></i><span class="hidden sm:inline">' + esc(AM.subPermissions) + '</span>' +
                '<span class="tabular-nums ' + (subOn > 0 ? 'text-sky-700 dark:text-sky-400' : 'text-slate-400') + '">' + subOn + '/' + subs.length + '</span>' +
                '<i class="pi pi-chevron-down text-[8px] transition-transform' + (open ? ' ca-rotate' : '') + '"></i></button>'
            : '') +
        '</div>' +
        '<span class="ca-switch' + (p[key] ? ' is-on' : '') + '"><span></span></span>' +
      '</div>' +
      (subs && open
        ? '<div class="ca-sub-indent pr-4 pb-3 -mt-1 select-none"><div class="border-l-2 border-sky-500/30 dark:border-sky-500/25 bg-slate-50 dark:bg-surface-panel/60 divide-y divide-slate-200/70 dark:divide-border-subtle">' +
            subs.map(sk => subRow(key, sk, u)).join('') + '</div></div>'
        : '') +
    '</div>';
  }

  function renderDetail() {
    const host = document.getElementById('ca-detail');
    const u = state.selected;
    if (!u) {
      host.innerHTML = '<div class="h-full ca-min-h bg-white dark:bg-surface-card border border-dashed border-slate-300 dark:border-border-muted rounded-[2px] flex items-center justify-center p-8 select-none">' +
        kit.emptyState({ message: AM.selectUserPrompt, icon: 'pi pi-users', tone: 'info' }) + '</div>';
      return;
    }
    const p = u.permissions;
    const granted = PERM_KEYS.filter(k => p[k]).length;
    const st = stats();
    const summary =
      '<div class="col-span-12 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs select-none">' +
        '<div class="p-4 flex flex-col md:flex-row md:items-center gap-4">' +
          '<div class="flex items-center gap-3.5 flex-1 min-w-0">' +
            '<div class="w-12 h-12 rounded-[2px] bg-gradient-to-br from-sky-500 to-sky-700 text-white font-extrabold text-base flex items-center justify-center uppercase shadow-sm shrink-0">' + esc(u.name.charAt(0) + u.surname.charAt(0)) + '</div>' +
            '<div class="min-w-0">' +
              '<div class="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate leading-tight">' + esc(u.name + ' ' + u.surname) + '</div>' +
              '<div class="flex flex-wrap items-center gap-1.5 mt-1.5">' +
                '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-bold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20"><i class="pi pi-user text-[9px]"></i>' + esc(u.das_uid) + '</span>' +
                '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-surface-panel text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-border-muted">' + esc(getDisplayPosition(u.das_grp)) + '</span>' +
                (u.email ? '<span class="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[16rem]"><i class="pi pi-envelope text-[9px]"></i>' + esc(u.email) + '</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ca-customer flex items-center gap-3 md:shrink-0 min-w-0 px-3 py-2.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-muted border-l-2 border-l-sky-500 rounded-[2px]">' +
            '<span class="w-8 h-8 rounded-[2px] flex items-center justify-center bg-white dark:bg-surface-base border border-slate-200 dark:border-border-muted text-sky-600 dark:text-sky-400 shrink-0"><i class="pi pi-building text-xs"></i></span>' +
            '<div class="min-w-0 flex-1">' +
              '<div class="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Müşteri</div>' +
              '<div title="' + esc(u.customer_name) + '" class="mt-0.5 text-xs font-bold leading-snug break-words ca-line-clamp-2 ' + (u.customer_name ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 italic') + '">' +
                esc(u.customer_name ? u.customer_name.split(',').join(', ') : AM.noRelatedCustomer) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const perms =
      '<div class="col-span-12 xl:col-span-8">' +
        '<div class="h-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col">' +
          '<div class="px-4 py-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between gap-3 select-none">' +
            '<div class="flex items-center gap-2 min-w-0"><i class="pi pi-shield text-sky-600 dark:text-sky-400 text-sm"></i><h4 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(AM.permissionModules) + '</h4></div>' +
            '<div class="flex items-center gap-2.5 shrink-0">' +
              '<div class="hidden sm:block ca-progress bg-slate-200 dark:bg-surface-panel rounded-full overflow-hidden"><div class="h-full bg-sky-600 dark:bg-sky-500 transition-all duration-300" style="width:' + (granted / PERM_KEYS.length * 100) + '%"></div></div>' +
              '<span class="text-[11px] font-extrabold tabular-nums text-slate-700 dark:text-slate-200">' + granted + '<span class="text-slate-400 dark:text-slate-500 font-bold"> / ' + PERM_KEYS.length + '</span></span>' +
            '</div>' +
          '</div>' +
          '<div class="flex-1 divide-y divide-slate-100 dark:divide-border-subtle">' + PERM_KEYS.map(k => moduleRow(k, u)).join('') + '</div>' +
          '<div class="px-4 py-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50/70 dark:bg-surface-base/40 flex flex-col sm:flex-row items-center justify-end gap-2 select-none">' +
            '<div class="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">' +
              button({ variant: 'secondary', size: 'md', icon: 'pi pi-refresh', label: AM.resetPermissions, attrs: 'data-reset' + (state.saving ? ' disabled' : '') }).replace('inline-flex', 'w-full sm:w-auto inline-flex') +
              button({ variant: 'primary', size: 'md', icon: state.saving ? 'pi pi-spin pi-spinner' : 'pi pi-save', label: state.saving ? AM.saving : AM.saveChanges, attrs: 'data-save' + (state.saving ? ' disabled' : '') }).replace('inline-flex', 'w-full sm:w-auto inline-flex') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const pct = v => (st.total ? v / st.total * 100 : 0);
    const metric = (bar, box, lbl, val, icon, label, value) =>
      '<div class="relative ' + box + ' p-2.5 rounded-[2px] overflow-hidden"><span class="absolute inset-x-0 top-0 h-0.5 ' + bar + '"></span>' +
        '<div class="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider truncate ' + lbl + '"><i class="' + icon + ' text-[9px]"></i>' + esc(label) + '</div>' +
        '<div class="text-xl font-extrabold tabular-nums mt-1.5 leading-none ' + val + '">' + value + '</div></div>';
    const alarms =
      '<div class="col-span-12 xl:col-span-4">' +
        '<div class="h-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col">' +
          '<div class="px-4 py-3 border-b border-slate-200 dark:border-border-subtle flex items-center gap-2 select-none"><i class="pi pi-bell text-sky-600 dark:text-sky-400 text-sm"></i><h4 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(AM.customerAlarmManagement) + '</h4></div>' +
          '<div class="p-4 space-y-4 flex-1 select-none">' +
            '<div class="grid grid-cols-3 gap-2">' +
              metric('bg-slate-400 dark:bg-slate-500', 'bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-muted', 'text-slate-500 dark:text-slate-400', 'text-slate-900 dark:text-slate-100', 'pi pi-chart-bar', AM.total, st.total) +
              metric('bg-emerald-500', 'bg-emerald-500/5 border border-emerald-500/20', 'text-emerald-600 dark:text-emerald-400', 'text-emerald-600 dark:text-emerald-400', 'pi pi-bell', AM.alarmOn, st.active) +
              metric('bg-rose-500', 'bg-rose-500/5 border border-rose-500/20', 'text-rose-600 dark:text-rose-400', 'text-rose-600 dark:text-rose-400', 'pi pi-bell-slash', AM.alarmOff, st.inactive) +
            '</div>' +
            '<div class="flex h-1.5 w-full rounded-full overflow-hidden bg-slate-200 dark:bg-surface-panel">' +
              '<div class="h-full bg-emerald-500 transition-all duration-300" style="width:' + pct(st.active) + '%"></div>' +
              '<div class="h-full bg-rose-500 transition-all duration-300" style="width:' + pct(st.inactive) + '%"></div>' +
            '</div>' +
            '<div class="flex gap-2.5 p-3 bg-sky-500/5 border border-sky-500/15 border-l-2 border-l-sky-500 rounded-[2px] text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">' +
              '<i class="pi pi-info-circle text-sky-500 text-xs shrink-0 mt-0.5"></i><span>' + esc(AM.alarmManagementInfo) + '</span></div>' +
          '</div>' +
          '<div class="px-4 py-3 border-t border-slate-200 dark:border-border-subtle bg-slate-50/70 dark:bg-surface-base/40 grid grid-cols-2 xl:grid-cols-1 gap-2 select-none">' +
            button({ variant: 'primary', size: 'md', icon: 'pi pi-bell', label: AM.turnOnAll, attrs: 'data-bulk="on"' + (state.saving ? ' disabled' : '') }).replace('inline-flex', 'w-full inline-flex') +
            button({ variant: 'danger', size: 'md', icon: 'pi pi-bell-slash', label: AM.turnOffAll, attrs: 'data-bulk="off"' + (state.saving ? ' disabled' : '') }).replace('inline-flex', 'w-full inline-flex') +
          '</div>' +
        '</div>' +
      '</div>';

    host.innerHTML = '<div class="grid grid-cols-12 gap-4">' + summary + perms + alarms + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Davranış (togglePermission / checkParentStatus / kaydet / sıfırla / toplu)
  // ---------------------------------------------------------------------------
  function togglePermission(key) {
    const u = state.selected;
    const next = !u.permissions[key];
    u.permissions[key] = next;
    if (key === 'kabinler') { SUB_MAP.kabinler.forEach(k => { u.subPermissions[k] = next; }); checkParentStatus('kabinler'); }
    if (key === 'raporlama') {
      SUB_MAP.raporlama.forEach(k => { u.subPermissions[k] = next; });
      if (next) u.permissions.alarmListesi = true;
      checkParentStatus('raporlama');
    }
    if (key === 'alarmListesi') { u.subPermissions.raporlama_alarm = next; checkParentStatus('raporlama'); }
  }
  function checkParentStatus(parent) {
    const u = state.selected;
    if (SUB_MAP[parent]) u.permissions[parent] = SUB_MAP[parent].some(k => u.subPermissions[k]);
  }
  function applyAcl(userId, acl) {
    saved[userId] = acl;
    const idx = state.users.findIndex(x => x.user_id === userId);
    if (idx >= 0) {
      state.users[idx].das_acl = acl;
      state.users[idx].permissions = parseAclToPermissions(acl);
      state.users[idx].subPermissions = parseAclToSubPermissions(acl);
    }
  }
  function saveWithDelay(fn) {
    state.saving = true;
    renderDetail();
    setTimeout(() => {
      state.saving = false;
      fn();
      persist();
      renderUserList();
      renderDetail();
    }, 450);
  }
  const refreshSelected = id => { const x = state.users.find(v => v.user_id === id); state.selected = x ? clone(x) : null; };

  const usersEl = document.getElementById('ca-users');
  usersEl.addEventListener('input', e => {
    if (!e.target.hasAttribute('data-search')) return;
    state.search = e.target.value;
    if (state.selected && !filtered().some(u => u.user_id === state.selected.user_id)) { state.selected = null; renderDetail(); }
    renderUserList();
  });
  usersEl.addEventListener('click', e => {
    if (e.target.closest('[data-search-clear]')) {
      state.search = '';
      usersEl.querySelector('[data-search]').value = '';
      renderUserList();
      return;
    }
    const row = e.target.closest('[data-user]');
    if (!row) return;
    selectUser(state.users.find(x => x.user_id === row.getAttribute('data-user')));
    state.openDD = null;
    renderUserList();
    renderDetail();
  });

  const detailEl = document.getElementById('ca-detail');
  detailEl.addEventListener('click', e => {
    const dd = e.target.closest('[data-dd]');
    if (dd) { e.stopPropagation(); const k = dd.getAttribute('data-dd'); state.openDD = state.openDD === k ? null : k; return renderDetail(); }
    const perm = e.target.closest('[data-perm]');
    if (perm) { togglePermission(perm.getAttribute('data-perm')); return renderDetail(); }
    const lockLabel = e.target.closest('[data-sublabel="raporlama_alarm"]');
    if (lockLabel && !state.selected.permissions.alarmListesi) { e.preventDefault(); toast(AM.alerts.noAlarmPermission, 'error'); return; }
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    const u = state.selected;
    if (b.hasAttribute('data-save')) {
      const acl = buildAclFromUser(clone(u));
      return saveWithDelay(() => {
        applyAcl(u.user_id, acl);
        refreshSelected(u.user_id);
        pushAudit('Yetki Değişimi: ' + u.das_uid + ' ACL: ' + acl, u.das_uid);
        toast(AM.alerts.updateSuccess.replace('{username}', u.das_uid), 'success');
      });
    }
    if (b.hasAttribute('data-reset')) {
      const name = u.name + ' ' + u.surname;
      dialog({
        title: AM.resetTitle, subtitle: name, variant: 'warning', confirmLabel: AM.confirmResetBtn, cancelLabel: AM.cancelBtn, confirmIcon: 'pi pi-refresh', showCancel: true,
        body: '<div class="space-y-3 select-none"><p class="text-xs leading-normal">' + esc(AM.resetMessage.replace('{name}', name)) + '</p>' +
          '<div class="flex gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 border-l-2 border-l-amber-500 text-amber-600 dark:text-amber-400 rounded-[2px] leading-relaxed"><i class="pi pi-info-circle text-xs shrink-0 mt-0.5"></i><span class="text-[10px]">' + esc(AM.resetWarning) + '</span></div></div>',
        onConfirm() {
          saveWithDelay(() => {
            applyAcl(u.user_id, DEFAULT_CUSTOMER_ACL);
            refreshSelected(u.user_id);
            pushAudit('Yetki Sıfırlama: ' + u.das_uid, u.das_uid);
            toast(AM.alerts.resetSuccess.replace('{username}', u.das_uid), 'success');
          });
        }
      });
      return;
    }
    if (b.hasAttribute('data-bulk')) {
      const on = b.getAttribute('data-bulk') === 'on';
      const action = on ? AM.turnOnAll : AM.turnOffAll;
      dialog({
        title: AM.bulkToggleTitle.replace('{action}', action), variant: 'warning', showCancel: true,
        confirmLabel: AM.confirmBulkToggle.replace('{action}', action), cancelLabel: AM.cancelBtn, confirmIcon: on ? 'pi pi-bell' : 'pi pi-bell-slash',
        body: '<div class="space-y-3 select-none"><p class="text-xs leading-normal">' + esc(AM.bulkToggleMessage.replace('{action}', action)) + '</p>' +
          (!on ? '<div class="flex gap-2 p-2.5 bg-rose-500/5 border border-rose-500/25 border-l-2 border-l-rose-500 text-rose-600 dark:text-rose-400 rounded-[2px] leading-relaxed"><i class="pi pi-info-circle text-xs shrink-0 mt-0.5"></i><span class="text-[10px]">' + esc(AM.bulkToggleWarning) + '</span></div>' : '') + '</div>',
        onConfirm() {
          // HIS_bulk_update_alarms(ENABLE|DISABLE): tüm müşterilerde CMA yetkisini aç/kapat
          saveWithDelay(() => {
            state.users.forEach(x => {
              const cp = clone(x);
              cp.permissions.alarmListesi = on;
              if (!on) cp.subPermissions.raporlama_alarm = false;
              applyAcl(x.user_id, buildAclFromUser(cp));
            });
            if (state.selected) refreshSelected(state.selected.user_id);
            pushAudit('Toplu alarm yetkisi: ' + (on ? 'ENABLE' : 'DISABLE') + ' (' + state.users.length + ' müşteri kullanıcısı)', 'Müşteri Alarm Yönetimi');
            toast(on ? AM.alerts.bulkEnabled : AM.alerts.bulkDisabled, 'success');
          });
        }
      });
    }
  });
  detailEl.addEventListener('change', e => {
    const sk = e.target.getAttribute('data-sub');
    if (!sk || !state.selected) return;
    state.selected.subPermissions[sk] = e.target.checked;
    checkParentStatus(e.target.getAttribute('data-parent'));
    renderDetail();
  });

  renderHeader();
  renderUsersShell();
  renderUserList();
  renderDetail();
})();
