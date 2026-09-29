/* ==========================================================================
   DCIM Sunum — Mühendislik / Yetkilendirme Yönetimi ("Müşteri Sayfaları Yetkilendirme")
   Kaynak: user-app/src/app/new-ui/pages/engineering/authorization-management/
           authorization-management.component.{html,ts} (NewUICMPAuthorizationManagementComponent)
   - Sol: müşteri kullanıcı listesi (arama, seçim). Sağ: 6 modül + alt yetkiler (Kabinler, Raporlama),
     "Yetkileri Sıfırla" / "Değişiklikleri Kaydet", Müşteri Alarm Yönetimi (istatistik + toplu aç/kapat).
   - ACL çözme/oluşturma (parseAclToPermissions / parseAclToSubPermissions / buildAclFromUser) TS'ten
     birebir port; Kullanıcı Ayarları "Müşteri Yetkilendirme" modalıyla (js/account-settings.js) aynı mantık.
   - Veri: DCIM.data.accounts.users içindeki müşteri kullanıcıları (HIS_get_auth_users karşılığı).
     Kaydet / Sıfırla / Toplu işlem → bellekte (modül ömrü boyunca; sayfalar arası geçişte korunur) + toast.
   Bilinçli sapma: orijinal bileşenin tüm şablonu *ngIf="isOpen" içindedir; rota üzerinden açıldığında
   isOpen=false olduğu için boş görünür. Sunumda modal kabuğu (başlık + gövde) sayfa içine yerleşik çizilir.
   Sunum eklentisi: kart altbilgisinde canlı ACL önizlemesi (buildAclFromUser çıktısı, kaydedilmemiş işaretli).
   Derin bağlantılar (engineering.html#authorization-management?...):
     ?user=<das_uid|user_id>          kullanıcı seç (selectedUserId girdisi; ör. user=delta.ceren)
     ?q=<metin>                       kullanıcı araması (ör. q=delta)
     ?open=kabinler|raporlama         alt yetki panelini açık başlat
     ?dialog=reset|bulk-on|bulk-off   onay penceresini aç
     ?readonly=1                      canEditAuth = false (ASP/ASPC/ASPU yetkisi yok) görünümü
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};

  // Sözlük (messages.tr.json → authorizationManagement.* / accountSettingsComponent.positions.*)
  const AM = {
    title: 'MÜŞTERİ SAYFALARI YETKİLENDİRME', users: 'Kullanıcılar', searchUser: 'Kullanıcı ara...',
    userNotFound: 'Kullanıcı bulunamadı.', userPermissionsTitle: '{name} - Yetkileri',
    permissionModules: 'Kullanıcı Sayfaları Modülleri', permissionDescription: 'Bu modüle erişim izni tanımlıdır.',
    subPermissions: 'Alt Yetkiler', noRelatedCustomer: 'İlişkili Müşteri Yok',
    resetPermissions: 'Yetkileri Sıfırla', saveChanges: 'Değişiklikleri Kaydet', saving: 'Kaydediliyor...',
    customerAlarmManagement: 'MÜŞTERİ ALARM YÖNETİMİ', total: 'TOPLAM', alarmOn: 'ALARM AÇIK', alarmOff: 'KAPALI',
    turnOnAll: 'Tümünü Aç', turnOffAll: 'Tümünü Kapat',
    alarmManagementInfo: 'Sistem genelindeki müşterilerin alarm bildirim tercihlerini merkezi olarak yönetebilir ve toplu yapılandırma işlemlerini gerçekleştirebilirsiniz.',
    selectUserPrompt: 'Yetkilerini düzenlemek için sol listeden bir kullanıcı seçin.',
    bulkToggleTitle: 'Tüm Alarmları {action}',
    bulkToggleMessage: 'Sistemdeki tüm müşteriler için alarm bildirimlerini toplu olarak {action} üzeresiniz.',
    bulkToggleWarning: 'Bu işlem, müşterilerin mevcut alarm ayarlarını ve yetkilerini devre dışı bırakacaktır.',
    cancelBtn: 'İptal Et', confirmBulkToggle: 'Evet, Alarmları {action}', confirmResetBtn: 'Evet, Yetkileri Sıfırla',
    resetTitle: 'Yetkileri Sıfırla',
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
    },
    // Sunum eklentisi etiketleri
    aclPreview: 'ACL:', unsaved: 'Kaydedilmemiş değişiklik'
  };
  const POSITIONS = { admin: 'Admin', 'mühendis': 'Mühendis', muhendis: 'Mühendis', 'operatör': 'Operatör', operator: 'Operatör', misafir: 'Misafir', 'müşteri': 'Müşteri', musteri: 'Müşteri' };

  // togglePermission / buildAclFromUser içindeki alt yetki grupları (subPermissionsMap)
  const SUB_MAP = {
    kabinler: ['kabinler_pdu', 'kabinler_asm', 'kabinler_sensor'],
    raporlama: ['raporlama_pduGuc', 'raporlama_sensor', 'raporlama_alarm']
  };
  const PERM_KEYS = Object.keys(AM.permissions); // permissionLabels sırası
  const CHK = 'rounded-[2px] border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sky-600 focus:ring-sky-500';

  const trLower = s => String(s == null ? '' : s).toLocaleLowerCase('tr-TR');
  const clone = o => JSON.parse(JSON.stringify(o));
  const splitAcl = acl => String(acl || '').split(/,(?![^(]*\))/).map(t => t.trim());

  // ---------------------------------------------------------------------------
  // ACL çözme / oluşturma (authorization-management.component.ts)
  // ---------------------------------------------------------------------------
  function parseAclToSubPermissions(acl) {
    const tags = splitAcl(acl);
    const sp = { raporlama_pduGuc: false, raporlama_sensor: false, raporlama_alarm: false, kabinler_pdu: false, kabinler_asm: false, kabinler_sensor: false };
    if (tags.some(t => t === '*')) { Object.keys(sp).forEach(k => { sp[k] = true; }); return sp; }
    // Kabinler alt yetkileri
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
    // Raporlama alt yetkileri
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
  // Not: orijinal gibi alarmListesi kapalıysa u.subPermissions.raporlama_alarm'ı false yapar (yan etki)
  function buildAclFromUser(u) {
    const parts = [];
    const p = u.permissions;
    const sp = u.subPermissions || {};
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
    if (!grp) return '';
    const val = trLower(grp).trim();
    return POSITIONS[val] || val;
  }
  // Kullanıcı Ayarları'ndaki isUserCustomer ile aynı süzgeç (HIS_get_auth_users müşteri kullanıcılarını döner)
  function isUserCustomer(u) {
    const grp = trLower(u.das_grp).trim();
    return /m[uü][sş]teri/.test(grp) || !!(u.customer_name && u.customer_name.trim() !== '');
  }
  const authUser = u => ({
    user_id: u.user_id, das_uid: u.das_uid || '', name: u.name || '', surname: u.surname || '', email: u.email || '',
    das_acl: u.das_acl || '', das_grp: u.das_grp || '', customer_name: u.customer_name || '',
    permissions: parseAclToPermissions(u.das_acl || ''), subPermissions: parseAclToSubPermissions(u.das_acl || '')
  });

  // Bellekteki "veritabanı": modül ömrü boyunca korunur (mühendislik sayfaları arası geçişte kaybolmaz)
  let STORE = null;
  function store() {
    if (!STORE) {
      const src = (DCIM.data.accounts && DCIM.data.accounts.users) || [];
      STORE = src.filter(isUserCustomer).map(authUser);
    }
    return STORE;
  }

  DCIM.engRegistry['authorization-management'] = {
    mount(el, params) {
      const { esc, button, dialog, toast } = DCIM.ui;
      const kit = DCIM.kit;
      const CFG = DCIM.data.authMgmt || {};
      const DEFAULT_ACL = CFG.defaultAcl || 'CAB*,ASM*,PDU*,REP(pdu, sen),CDB*,';
      const canEditAuth = params.get('readonly') === '1' ? false : CFG.canEditAuth !== false;

      const users = store();
      const S = { search: params.get('q') || '', selected: null, openDD: null, saving: false };
      let timer = null;
      let destroyed = false;

      // fetchUsers(): selectedUserId varsa onu, yoksa ilk kullanıcıyı seç
      const want = params.get('user');
      const found = want ? users.find(u => u.das_uid === want || String(u.user_id) === want) : null;
      if (found) S.selected = clone(found);
      else if (users.length) S.selected = clone(users[0]);
      if (S.search && S.selected && !filtered().some(u => u.user_id === S.selected.user_id)) {
        const first = filtered()[0];
        S.selected = first ? clone(first) : null;
      }
      const openParam = params.get('open');
      if (SUB_MAP[openParam]) S.openDD = openParam;

      function filtered() {
        const term = trLower(S.search).trim();
        if (!term) return users.slice();
        return users.filter(u => trLower(u.das_uid).includes(term) || trLower(u.name).includes(term) ||
          trLower(u.surname).includes(term) || (trLower(u.name) + ' ' + trLower(u.surname)).includes(term));
      }
      // getStats() → HIS_get_auth_stats karşılığı: CMA (Alarm Listesi) yetkisi açık/kapalı müşteri sayısı
      function stats() {
        const total = users.length;
        const active = users.filter(u => u.permissions.alarmListesi).length;
        return { total, active, inactive: total - active };
      }

      // -----------------------------------------------------------------------
      // İskelet (modal kabuğu sayfa içine yerleşik)
      // -----------------------------------------------------------------------
      el.innerHTML =
        '<div class="eng-am h-full p-3 md:p-4 flex flex-col">' +
          '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs w-full flex-1 min-h-0 flex flex-col overflow-hidden">' +
            '<div class="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-surface-base shrink-0">' +
              '<div class="flex items-center gap-2.5">' +
                '<span class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs bg-sky-500/10 text-sky-500 border border-sky-500/20"><i class="pi pi-shield"></i></span>' +
                '<h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">' + esc(AM.title) + '</h3>' +
              '</div>' +
            '</div>' +
            '<div class="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-100 dark:bg-surface-base">' +
              '<div class="grid grid-cols-12 gap-4">' +
                // Sol: kullanıcı listesi
                '<div class="col-span-12 lg:col-span-3">' +
                  '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col h-[calc(100vh-13rem)] min-h-[480px]">' +
                    '<div class="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 select-none">' +
                      '<div class="flex items-center gap-2"><i class="pi pi-users text-sky-500 text-sm"></i><span class="text-xs font-bold text-slate-800 dark:text-slate-200">' + esc(AM.users) + '</span></div>' +
                      '<span data-am-count class="px-2 py-0.5 text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xs shrink-0"></span>' +
                    '</div>' +
                    '<div class="p-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/10"><div class="relative">' +
                      '<i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>' +
                      '<input type="text" data-am-search value="' + esc(S.search) + '" placeholder="' + esc(AM.searchUser) + '" class="w-full pl-7 pr-2 py-1 text-xs bg-white dark:bg-surface-base border border-slate-200 dark:border-border-subtle rounded-[2px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500" />' +
                    '</div></div>' +
                    '<div data-am-list class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/40"></div>' +
                  '</div>' +
                '</div>' +
                // Sağ: detay + alarm yönetimi
                '<div class="col-span-12 lg:col-span-9" data-am-detail></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      const listEl = el.querySelector('[data-am-list]');
      const countEl = el.querySelector('[data-am-count]');
      const detailEl = el.querySelector('[data-am-detail]');

      function renderList() {
        const list = filtered();
        const sel = S.selected;
        countEl.textContent = list.length;
        listEl.innerHTML = list.length
          ? list.map(u => {
            const on = sel && sel.user_id === u.user_id;
            return '<div data-am-user="' + esc(u.user_id) + '" class="' +
              (on ? 'bg-sky-500/10 border-l-2 border-sky-600 dark:bg-sky-950/20' : 'hover:bg-slate-50 dark:hover:bg-surface-hover/30 border-l-2 border-transparent') +
              ' p-2.5 flex items-center gap-2.5 cursor-pointer transition-all border-b border-slate-100 dark:border-slate-800/10">' +
              '<div class="w-8 h-8 rounded-[2px] bg-sky-100 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 font-extrabold text-[11px] flex items-center justify-center shrink-0 select-none uppercase">' + esc(u.name.charAt(0) + u.surname.charAt(0)) + '</div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">' + esc(u.name + ' ' + u.surname) + '</div>' +
                '<div class="flex items-center justify-between gap-1 text-[10px] text-slate-500 dark:text-slate-400 truncate"><span>' + esc(u.das_uid) + '</span>' +
                  '<span class="px-1.5 py-0.5 rounded-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-bold">' + esc(getDisplayPosition(u.das_grp)) + '</span></div>' +
              '</div>' +
              (on ? '<i class="pi pi-chevron-right text-sky-500 text-[10px]"></i>' : '') +
            '</div>';
          }).join('')
          : '<div class="flex flex-col items-center justify-center p-8 text-center h-48 select-none"><i class="pi pi-search-minus text-slate-400 text-xl mb-2"></i><span class="text-xs text-slate-500 dark:text-slate-400 font-medium">' + esc(AM.userNotFound) + '</span></div>';
      }

      function permCardsHtml(u) {
        return PERM_KEYS.map(key => {
          const open = S.openDD === key;
          const subs = SUB_MAP[key];
          return '<div class="' + (open ? 'border-sky-500 dark:border-sky-500/80 ring-1 ring-sky-500/20' : 'border-slate-200 dark:border-slate-800') + ' relative bg-slate-50/50 dark:bg-slate-900/30 border rounded-[2px] flex flex-col p-3 transition-all">' +
            '<div class="flex items-start justify-between gap-3">' +
              '<div data-am-perm="' + key + '" class="flex items-start gap-2.5 flex-1 min-w-0" style="cursor:' + (canEditAuth ? 'pointer' : 'not-allowed') + '">' +
                '<input type="checkbox"' + (u.permissions[key] ? ' checked' : '') + (canEditAuth ? '' : ' disabled') + ' class="pointer-events-none mt-0.5 ' + CHK + ' focus:ring-offset-0 focus:outline-none shrink-0" />' +
                '<div class="flex flex-col min-w-0 pointer-events-none">' +
                  '<span class="text-xs font-bold text-slate-800 dark:text-slate-200 select-none truncate">' + esc(AM.permissions[key]) + '</span>' +
                  '<span class="text-[10px] text-slate-400 dark:text-slate-500 leading-normal mt-0.5 select-none line-clamp-2">' + esc(AM.permissionDescription) + '</span>' +
                '</div>' +
              '</div>' +
              (subs ? '<button type="button" data-am-dd="' + key + '" class="' + (open ? 'bg-sky-600/10 text-sky-600 dark:text-sky-400 rotate-90' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80') + ' w-6 h-6 rounded-[2px] flex items-center justify-center transition-all cursor-pointer select-none shrink-0" title="' + esc(AM.subPermissions) + '"><i class="pi pi-chevron-right text-[9px]"></i></button>' : '') +
            '</div>' +
            (subs && open
              ? '<div class="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800/85 space-y-1.5 select-none sub-dropdown">' +
                  '<div class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">' + esc(AM.subPermissions) + '</div>' +
                  '<div class="space-y-1">' + subs.map(sk => {
                    const isAlarm = sk === 'raporlama_alarm';
                    const locked = isAlarm && !u.permissions.alarmListesi;
                    const disabled = locked || !canEditAuth;
                    return '<label data-am-sublabel="' + sk + '" class="flex items-center justify-between gap-4 p-1.5 rounded-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/40 ' + (locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer') + '"' + (locked ? ' title="' + esc(AM.alerts.noAlarmPermissionTooltip) + '"' : '') + '>' +
                      '<span class="text-[11px] text-slate-600 dark:text-slate-300">' + esc(AM.sub[sk]) + '</span>' +
                      '<input type="checkbox" data-am-sub="' + sk + '" data-parent="' + key + '"' + (u.subPermissions[sk] ? ' checked' : '') + (disabled ? ' disabled' : '') + ' class="' + CHK + '" />' +
                    '</label>';
                  }).join('') + '</div>' +
                '</div>'
              : '') +
          '</div>';
        }).join('');
      }

      function renderDetail() {
        const u = S.selected;
        if (!u) {
          detailEl.innerHTML = '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs h-[calc(100vh-13rem)] min-h-[480px] flex items-center justify-center p-8 select-none">' +
            kit.emptyState({ message: AM.selectUserPrompt, icon: 'pi pi-users', tone: 'info' }) + '</div>';
          return;
        }
        const lock = S.saving || !canEditAuth ? ' disabled' : '';
        // Sunum eklentisi: canlı ACL önizlemesi (buildAclFromUser yan etkisi seçili kopyayı bozmasın diye klon)
        const saved = users.find(x => x.user_id === u.user_id);
        const preview = buildAclFromUser(clone(u));
        const dirty = !!saved && preview !== buildAclFromUser(clone(saved));

        const permCard = kit.card({
          title: AM.userPermissionsTitle.replace('{name}', u.name + ' ' + u.surname),
          badge: u.das_uid,
          icon: 'pi pi-shield',
          body:
            '<div class="space-y-4 flex-1">' +
              '<div class="text-xs font-bold text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800/80 pb-1.5">' + esc(AM.permissionModules) + '</div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + permCardsHtml(u) + '</div>' +
            '</div>' +
            '<div class="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">' +
              '<div class="min-w-0 space-y-1">' +
                '<div class="text-xs text-slate-500 dark:text-slate-400"><span class="font-medium mr-1">Müşteri:</span><strong class="text-slate-800 dark:text-slate-200 font-bold">' + esc(u.customer_name || AM.noRelatedCustomer) + '</strong></div>' +
                '<div class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 min-w-0">' +
                  '<span class="font-medium shrink-0">' + esc(AM.aclPreview) + '</span>' +
                  '<code class="font-mono text-[10px] text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-[2px] px-1.5 py-0.5 truncate" title="' + esc(preview) + '">' + esc(preview || '—') + '</code>' +
                  (dirty ? '<span class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>' + esc(AM.unsaved) + '</span>' : '') +
                '</div>' +
              '</div>' +
              '<div class="flex items-center gap-2 w-full sm:w-auto justify-end">' +
                button({ variant: 'secondary', size: 'sm', icon: 'pi pi-refresh', label: AM.resetPermissions, attrs: 'data-am-reset' + lock }) +
                button({ variant: 'primary', size: 'sm', icon: S.saving ? 'pi pi-spin pi-spinner' : 'pi pi-save', label: S.saving ? AM.saving : AM.saveChanges, attrs: 'data-am-save' + lock }) +
              '</div>' +
            '</div>'
        });

        const st = stats();
        const tile = (icon, val, label, box, valCls, lblCls) =>
          '<div class="' + box + ' p-2.5 rounded-[2px] text-center"><i class="' + icon + ' text-sm"></i>' +
            '<div class="text-base font-extrabold ' + valCls + ' mt-1 leading-none">' + val + '</div>' +
            '<div class="text-[9px] font-bold ' + lblCls + ' uppercase tracking-wider mt-1.5 leading-none truncate">' + esc(label) + '</div></div>';
        const alarmCard = kit.card({
          title: AM.customerAlarmManagement,
          icon: 'pi pi-bell',
          body:
            '<div class="space-y-4 flex-1">' +
              '<div class="grid grid-cols-3 gap-2 select-none">' +
                tile('pi pi-chart-bar text-slate-400', st.total, AM.total, 'bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200 dark:border-border-subtle', 'text-slate-800 dark:text-slate-100', 'text-slate-400 dark:text-slate-500') +
                tile('pi pi-bell text-emerald-500', st.active, AM.alarmOn, 'bg-emerald-500/5 dark:bg-emerald-950/10 border border-emerald-500/10 dark:border-emerald-900/30', 'text-emerald-600 dark:text-emerald-400', 'text-emerald-500 dark:text-emerald-500') +
                tile('pi pi-bell-slash text-rose-500', st.inactive, AM.alarmOff, 'bg-rose-500/5 dark:bg-rose-950/10 border border-rose-500/10 dark:border-rose-900/30', 'text-rose-600 dark:text-rose-400', 'text-rose-500 dark:text-rose-500') +
              '</div>' +
              '<div class="h-px bg-slate-200 dark:bg-slate-800/80 my-2"></div>' +
              '<div class="flex gap-2 p-3 bg-sky-500/5 dark:bg-sky-500/5 border border-sky-500/10 dark:border-sky-500/10 rounded-[2px] text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed select-none">' +
                '<i class="pi pi-info-circle text-sky-500 text-xs shrink-0 mt-0.5"></i><span>' + esc(AM.alarmManagementInfo) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="mt-6 space-y-2 select-none">' +
              button({ variant: 'primary', size: 'md', icon: 'pi pi-bell', label: AM.turnOnAll, attrs: 'data-am-bulk="on"' + lock }).replace('inline-flex', 'w-full inline-flex') +
              button({ variant: 'danger', size: 'md', icon: 'pi pi-bell-slash', label: AM.turnOffAll, attrs: 'data-am-bulk="off"' + lock }).replace('inline-flex', 'w-full inline-flex') +
            '</div>'
        });

        // <app-card class="h-full flex flex-col justify-between">: sınıf host öğesindedir, iç kart içerik yüksekliğindedir
        const host = html => '<div class="h-full flex flex-col justify-between">' + html + '</div>';
        detailEl.innerHTML = '<div class="grid grid-cols-12 gap-4">' +
          '<div class="col-span-12 xl:col-span-8">' + host(permCard) + '</div>' +
          '<div class="col-span-12 xl:col-span-4">' + host(alarmCard) + '</div>' +
        '</div>';
      }

      // -----------------------------------------------------------------------
      // togglePermission / checkParentStatus
      // -----------------------------------------------------------------------
      function togglePermission(key) {
        const u = S.selected;
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
        const u = S.selected;
        if (u && SUB_MAP[parent]) u.permissions[parent] = SUB_MAP[parent].some(k => u.subPermissions[k]);
      }

      // Bellekte güncelle: bu sayfanın kullanıcıları + DCIM.data.accounts satırı (oturum içi tutarlılık)
      function applyAcl(userId, acl) {
        const row = ((DCIM.data.accounts && DCIM.data.accounts.users) || []).find(x => x.user_id === userId);
        if (row) row.das_acl = acl;
        const x = users.find(v => v.user_id === userId);
        if (x) {
          x.das_acl = acl;
          x.permissions = parseAclToPermissions(acl);
          x.subPermissions = parseAclToSubPermissions(acl);
        }
      }
      function refreshSelected() {
        const sel = S.selected && users.find(x => x.user_id === S.selected.user_id);
        S.selected = sel ? clone(sel) : null;
      }
      // das.query(...) gecikmesi karşılığı
      function saveWithDelay(fn) {
        S.saving = true;
        renderDetail();
        timer = setTimeout(() => {
          timer = null;
          if (destroyed) return;
          S.saving = false;
          fn();
          renderList();
          renderDetail();
        }, 450);
      }

      function savePermissions() {
        if (!S.selected || S.saving) return;
        const u = S.selected;
        const acl = buildAclFromUser(u);
        saveWithDelay(() => {
          applyAcl(u.user_id, acl);
          refreshSelected();
          toast(AM.alerts.updateSuccess.replace('{username}', u.das_uid) + ' ACL: ' + acl, 'success');
        });
      }
      function openResetModal() {
        const u = S.selected;
        if (!u) return;
        const name = u.name + ' ' + u.surname;
        dialog({
          title: AM.resetTitle, subtitle: name, variant: 'warning', confirmLabel: AM.confirmResetBtn, cancelLabel: AM.cancelBtn, confirmIcon: 'pi pi-refresh',
          body: '<div class="space-y-3 select-none"><p class="text-xs leading-normal">' + esc(AM.resetMessage.replace('{name}', name)) + '</p>' +
            '<div class="flex gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-[2px] leading-relaxed"><i class="pi pi-info-circle text-xs shrink-0 mt-0.5"></i><span class="text-[10px]">' + esc(AM.resetWarning) + '</span></div></div>',
          onConfirm() {
            if (destroyed || S.saving) return;
            saveWithDelay(() => {
              applyAcl(u.user_id, DEFAULT_ACL);
              refreshSelected();
              toast(AM.alerts.resetSuccess.replace('{username}', u.das_uid), 'success');
            });
          }
        });
      }
      function bulkToggleAlarms(on) {
        const action = on ? AM.turnOnAll : AM.turnOffAll;
        dialog({
          title: AM.bulkToggleTitle.replace('{action}', action), variant: 'warning',
          confirmLabel: AM.confirmBulkToggle.replace('{action}', action), cancelLabel: AM.cancelBtn, confirmIcon: on ? 'pi pi-bell' : 'pi pi-bell-slash',
          body: '<div class="space-y-3 select-none"><p class="text-xs leading-normal">' + esc(AM.bulkToggleMessage.replace('{action}', action)) + '</p>' +
            (!on ? '<div class="flex gap-2 p-2.5 bg-rose-500/5 border border-rose-500/25 text-rose-600 dark:text-rose-400 rounded-[2px] leading-relaxed"><i class="pi pi-info-circle text-xs shrink-0 mt-0.5"></i><span class="text-[10px]">' + esc(AM.bulkToggleWarning) + '</span></div>' : '') + '</div>',
          onConfirm() {
            if (destroyed || S.saving) return;
            // HIS_bulk_update_alarms(ENABLE|DISABLE) karşılığı: tüm müşterilerde CMA yetkisini aç/kapat,
            // ardından fetchUsers() — seçili kullanıcının kaydedilmemiş düzenlemeleri de sunucudan yenilenir
            saveWithDelay(() => {
              users.forEach(x => {
                const cp = clone(x);
                cp.permissions.alarmListesi = on;
                cp.subPermissions.raporlama_alarm = on && cp.permissions.raporlama ? cp.subPermissions.raporlama_alarm : false;
                applyAcl(x.user_id, buildAclFromUser(cp));
              });
              refreshSelected();
              toast(on ? AM.alerts.bulkEnabled : AM.alerts.bulkDisabled, 'success');
            });
          }
        });
      }

      // -----------------------------------------------------------------------
      // Olaylar
      // -----------------------------------------------------------------------
      function onClick(e) {
        const userEl = e.target.closest('[data-am-user]');
        if (userEl) {
          const u = users.find(x => String(x.user_id) === userEl.getAttribute('data-am-user'));
          S.selected = u ? clone(u) : null;
          renderList();
          renderDetail();
          return;
        }
        const perm = e.target.closest('[data-am-perm]');
        if (perm) {
          if (!canEditAuth || !S.selected) return;
          togglePermission(perm.getAttribute('data-am-perm'));
          return renderDetail();
        }
        const dd = e.target.closest('[data-am-dd]');
        if (dd) {
          e.stopPropagation();
          const k = dd.getAttribute('data-am-dd');
          S.openDD = S.openDD === k ? null : k;
          return renderDetail();
        }
        // onAlarmReportClick: Alarm Listesi yetkisi yoksa Alarm Raporlama açılamaz
        const subLabel = e.target.closest('[data-am-sublabel="raporlama_alarm"]');
        if (subLabel && S.selected && !S.selected.permissions.alarmListesi) {
          e.preventDefault();
          toast(AM.alerts.noAlarmPermission, 'error');
          return;
        }
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (b.hasAttribute('data-am-save')) return savePermissions();
        if (b.hasAttribute('data-am-reset')) return openResetModal();
        if (b.hasAttribute('data-am-bulk')) return bulkToggleAlarms(b.getAttribute('data-am-bulk') === 'on');
      }
      function onChange(e) {
        const sk = e.target.getAttribute('data-am-sub');
        if (!sk || !S.selected) return;
        S.selected.subPermissions[sk] = e.target.checked;
        checkParentStatus(e.target.getAttribute('data-parent'));
        renderDetail();
      }
      // onSearch(): seçili kullanıcı süzgeç dışında kalırsa seçim kalkar
      function onInput(e) {
        if (!e.target.hasAttribute('data-am-search')) return;
        S.search = e.target.value;
        if (S.selected && !filtered().some(u => u.user_id === S.selected.user_id)) {
          S.selected = null;
          renderDetail();
        }
        renderList();
      }

      el.addEventListener('click', onClick);
      el.addEventListener('change', onChange);
      el.addEventListener('input', onInput);

      renderList();
      renderDetail();

      // Derin bağlantı: onay pencereleri
      const dlg = params.get('dialog');
      if (canEditAuth && S.selected) {
        if (dlg === 'reset') openResetModal();
        else if (dlg === 'bulk-on') bulkToggleAlarms(true);
        else if (dlg === 'bulk-off') bulkToggleAlarms(false);
      }

      return {
        destroy() {
          destroyed = true;
          if (timer) clearTimeout(timer);
          el.removeEventListener('click', onClick);
          el.removeEventListener('change', onChange);
          el.removeEventListener('input', onInput);
        }
      };
    }
  };
})();
