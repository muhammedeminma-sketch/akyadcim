/* ==========================================================================
   DCIM Sunum — Kilit Yetkilendirme (SUNUM EKLENTİSİ)
   Kapak kilitleri (Kapak Kilitleri monitörü, CMR/T00) için kullanıcı bazlı erişim yetkileri:
   - Özet kartları: yetkili kullanıcı, toplam kilit, süreli yetki, reddedilen erişim (24 sa)
   - Sekmeler: Kullanıcı Yetkileri · Yetki Grupları · Erişim Kayıtları
   - POD / kabin kapsam kenar çubuğu (app-sidebar) + araç çubuğu filtreleri
   - Yeni Yetki sihirbazı: Kullanıcı → POD/Kabin/Kilit → İşlem İzinleri → Erişim Süresi
   - Yetki düzenleme, süre uzatma, iptal; grup üyeliği; erişim testi (yetki doğrulama simülasyonu)

   Backend yok, gerçek kilit komutu üretilmez. Kabin/kapak verisi DCIM.data.getLockFloor('T00'),
   kişiler DCIM.data.permissions.ldapUsers + DCIM.data.personnel (kart numaraları) kaynaklıdır.
   Oturumdaki değişiklikler sessionStorage 'dcim_lock_auth_v1'de tutulur; yetki değişiklikleri
   'dcim_audit_session' kuyruğuna YETKİ kaydı olarak eklenir (audit-logs.html gösterir).

   Derin bağlantılar:
     ?tab=users | groups | logs     açılış sekmesi
     ?pod=POD-8                     POD kapsamı
     ?cabinet=1BN52                 kabin kapsamı (POD otomatik seçilir)
     ?q=deniz                       arama (kullanıcı / kart / yetki no / kabin)
     ?status=active|timed|scheduled|expired|revoked
     ?result=denied|granted         erişim kayıtları sonuç filtresi (logs sekmesi)
     ?new=1[&user=deniz.koc]        Yeni Yetki sihirbazını açar
     ?grant=YTK-0104                yetki detayını açar
     ?test=1                        erişim testi penceresini açar
     ?reset=1                       oturum verisini sıfırlar (sunum öncesi)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, buttonClasses, dialog, toast, storage } = DCIM.ui;
  const kit = DCIM.kit;
  const D = DCIM.data;
  DCIM.shell.init({ active: 'lock-auth' });

  const params = new URLSearchParams(window.location.search);
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const NOW0 = Date.now();
  const ago = m => NOW0 - m * MIN;
  const lc = v => String(v == null ? '' : v).toLocaleLowerCase('tr-TR');
  const uniq = arr => Array.from(new Set(arr));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = n => String(n).padStart(2, '0');
  const fmtShort = t => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtLog = t => { const d = new Date(t); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const toLocalInput = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fromLocalInput = v => { const t = new Date(v).getTime(); return isNaN(t) ? null : t; };
  const roundTo5 = t => Math.ceil(t / (5 * MIN)) * 5 * MIN;
  function dur(ms) {
    const m = Math.max(1, Math.round(Math.abs(ms) / MIN));
    if (m < 60) return m + ' dk';
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + ' sa' + (mm ? ' ' + mm + ' dk' : '');
    const d = Math.floor(h / 24), hh = h % 24;
    return d + ' gün' + (hh ? ' ' + hh + ' sa' : '');
  }

  // ---------------------------------------------------------------------------
  // Kabinler, POD'lar, kilitler
  // ---------------------------------------------------------------------------
  const LOCK_CARDS = D.getLockFloor('T00');
  const CABS = LOCK_CARDS.map(c => ({ code: c.cabinetCode, pod: c.pod, customer: c.cabinet.customer, lock: c }));
  const CAB_BY = {};
  CABS.forEach(c => { CAB_BY[c.code] = c; });
  const podOrder = p => { const m = /^(NS|POD-)(\d+)$/.exec(p); return m ? (m[1] === 'NS' ? 0 : 100) + Number(m[2]) : 999; };
  const PODS = uniq(CABS.map(c => c.pod)).sort((a, b) => podOrder(a) - podOrder(b));
  const CABS_OF = {};
  PODS.forEach(p => { CABS_OF[p] = CABS.filter(c => c.pod === p).sort((a, b) => a.code.localeCompare(b.code)); });
  const CUSTOMERS = uniq(CABS.map(c => c.customer)).sort((a, b) => a.localeCompare(b, 'tr'));
  const TOTAL_LOCKS = CABS.length * 2;
  const podOf = code => (CAB_BY[code] ? CAB_BY[code].pod : PODS[0]);
  const SIDES = [
    { key: 'front', label: 'Ön Kapak Kilidi', short: 'Ön', sfx: 'FDOOR' },
    { key: 'rear', label: 'Arka Kapak Kilidi', short: 'Arka', sfx: 'RDOOR' }
  ];
  const sideShort = s => (s === 'front' ? 'Ön' : 'Arka');
  const sidesText = sides => (sides.length === 2 ? 'Ön + Arka' : sides[0] === 'front' ? 'Yalnız ön kapak' : 'Yalnız arka kapak');

  // ---------------------------------------------------------------------------
  // Kullanıcılar (LDAP dizini + kart numaraları)
  // ---------------------------------------------------------------------------
  const P = D.permissions;
  const ROLE_BY = {};
  P.roles.forEach(r => { ROLE_BY[r.id] = r; });
  const PERS_BY = {};
  (D.personnel || []).forEach(p => { PERS_BY[p.name] = p; });
  const genCard = key => {
    const r = D.rng(D.hash('lock-card-' + key));
    const b = () => Math.floor(r() * 256).toString(16).toUpperCase().padStart(2, '0');
    return '04:' + b() + ':' + b() + ':' + b();
  };
  // LDAP'ta olup permission-settings listesinde yer almayan personel (account-settings kurumsal kullanıcıları)
  const EXTRA_USERS = [
    { id: '00554419', nam: 'Gökhan Polat', usr: 'gokhan.polat', role: 'maintenance', dept: 'İklimlendirme Bakım' },
    { id: '00551873', nam: 'Elif Aksoy', usr: 'elif.aksoy', role: 'operator', dept: 'Veri Merkezi Operasyon' },
    { id: '00550966', nam: 'Seda Kurt', usr: 'seda.kurt', role: 'operator', dept: 'Veri Merkezi Operasyon', passive: true },
    { id: '00549120', nam: 'Tolga Erdem', usr: 'tolga.erdem', role: 'maintenance', dept: 'Kapasite Planlama', passive: true }
  ];
  const USERS = P.ldapUsers.concat(EXTRA_USERS).map(u => ({
    id: u.id, usr: u.usr, name: u.nam, dept: u.dept, role: u.role,
    card: PERS_BY[u.nam] ? PERS_BY[u.nam].card : genCard(u.usr),
    passive: !!u.passive
  })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const USER_BY = {};
  USERS.forEach(u => { USER_BY[u.id] = u; });
  const userByName = n => USERS.find(u => u.name === n) || null;
  const uid = usr => (USERS.find(u => u.usr === usr) || {}).id;
  const initials = name => DCIM.session.initials({ fullname: name });

  const TONE = {
    sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30',
    slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/30'
  };
  const AVATAR = { 'super-admin': 'bg-rose-600', maintenance: 'bg-amber-600', operator: 'bg-sky-700', customer: 'bg-emerald-600', guest: 'bg-slate-600' };
  const avatar = (u, big) => '<div class="' + (big ? 'w-8 h-8 text-xs' : 'w-7 h-7 text-[10px]') + ' rounded-[2px] ' + (AVATAR[u.role] || 'bg-slate-600') + ' text-white font-bold flex items-center justify-center shrink-0' + (u.passive ? ' opacity-50' : '') + '">' + esc(initials(u.name)) + '</div>';
  const roleBadge = u => {
    const r = ROLE_BY[u.role];
    return r ? '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold border whitespace-nowrap ' + TONE[r.tone] + '">' + esc(r.label) + '</span>' : '';
  };

  // ---------------------------------------------------------------------------
  // İşlem izinleri
  // ---------------------------------------------------------------------------
  const PERMS = [
    { key: 'view', label: 'Görüntüleme', icon: 'pi pi-eye', code: 'LCK:R', tone: 'sky', desc: 'Kapak ve kilit durumunu, kart okuma geçmişini izleme.' },
    { key: 'unlock', label: 'Kilit Açma', icon: 'pi pi-lock-open', code: 'LCK:U', tone: 'amber', desc: 'Kart okutma veya uzaktan komutla elektronik kilidi açma.' },
    { key: 'lock', label: 'Kilitleme', icon: 'pi pi-lock', code: 'LCK:L', tone: 'emerald', desc: 'Açık kalan kilidi uzaktan kilitli konuma alma.' },
    { key: 'manage', label: 'Yetki Yönetimi', icon: 'pi pi-shield', code: 'LCK:A', tone: 'purple', desc: 'Kapsamdaki kilitler için başka kullanıcılara yetki tanımlama / iptal etme.' }
  ];
  const PERM_BY = {};
  PERMS.forEach(p => { PERM_BY[p.key] = p; });
  const permOrder = arr => PERMS.map(p => p.key).filter(k => arr.indexOf(k) >= 0);
  const permNames = arr => permOrder(arr).map(k => PERM_BY[k].label).join(', ');

  const WORK_ORDERS = [
    { id: 'İE-2026-0931', name: '1BG41 PDU-A modül değişimi' },
    { id: 'İE-2026-0928', name: 'KLIMA 109 kompresör basınç kontrolü' },
    { id: 'İE-2026-0925', name: 'UPS A5 akü grubu kapasite testi' },
    { id: 'İE-2026-0919', name: '1AV42 PDU-B faz onarımı' },
    { id: 'İE-2026-0914', name: '1BX54 kilit motoru değişimi' },
    { id: 'İE-2026-0907', name: 'KLIMA 104 filtre değişimi' },
    { id: 'İE-2026-0902', name: 'POD-6 kablo tavası düzenlemesi' }
  ];

  // ---------------------------------------------------------------------------
  // Tohum veri: yetki grupları ve yetkiler
  // ---------------------------------------------------------------------------
  const EGE = CABS.filter(c => c.customer === 'Ege Lojistik').map(c => c.code);
  const ANADOLU = CABS.filter(c => c.customer === 'Anadolu Finans A.Ş.').map(c => c.code);
  const POD8 = (CABS_OF[podOf('1BN52')] || []).map(c => c.code);
  const BURAK_CABS = (() => { const i = Math.max(0, POD8.indexOf('1BN52')); return POD8.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 4); })();

  function seedGroups() {
    return [
      { id: 'GRP-01', name: 'NOC Operasyon', icon: 'pi pi-desktop', tone: 'sky', desc: '7/24 izleme ekibi — salon genelinde kapak takibi, kart ile giriş ve uzaktan kilitleme.', pod: '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view', 'unlock', 'lock'], mode: 'permanent', hours: 0, members: ['00549854', '00551207', '00551873'], createdAt: ago(310 * 1440) },
      { id: 'GRP-02', name: 'Güvenlik Ekibi', icon: 'pi pi-shield', tone: 'rose', desc: 'Fiziksel güvenlik — alarm ve zorlama durumlarında tüm kilitlere müdahale.', pod: '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view', 'unlock', 'lock'], mode: 'permanent', hours: 0, members: ['00552604'], createdAt: ago(310 * 1440) },
      { id: 'GRP-03', name: 'Enerji & Mekanik Bakım', icon: 'pi pi-wrench', tone: 'amber', desc: 'İş emrine bağlı bakım erişimi — varsayılan 8 saatlik bakım penceresi.', pod: '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view', 'unlock', 'lock'], mode: 'timed', hours: 8, members: ['00553318', '00550437', '00554419'], createdAt: ago(240 * 1440) },
      { id: 'GRP-04', name: 'Yüklenici Bakım Firması', icon: 'pi pi-briefcase', tone: 'slate', desc: 'Harici firma personeli — refakatli, süreli ve kabin bazında erişim.', pod: podOf('1BN52'), cabinets: ['1BN52'], sides: ['rear'], perms: ['view', 'unlock'], mode: 'timed', hours: 4, members: ['00561190'], createdAt: ago(120 * 1440) },
      { id: 'GRP-05', name: 'Müşteri — Ege Lojistik', icon: 'pi pi-building', tone: 'emerald', desc: 'Müşteri temsilcisi — yalnızca sözleşmeli kabinler (Ege Lojistik).', pod: '*', cabinets: EGE.slice(), sides: ['front', 'rear'], perms: ['view', 'unlock'], mode: 'permanent', hours: 0, members: ['00560042'], createdAt: ago(200 * 1440) },
      { id: 'GRP-06', name: 'Yetki Yöneticileri', icon: 'pi pi-key', tone: 'purple', desc: 'Kilit yetkilerini tanımlayan, denetleyen ve iptal eden yöneticiler.', pod: '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view', 'unlock', 'lock', 'manage'], mode: 'permanent', hours: 0, members: ['00547731', '00546120'], createdAt: ago(310 * 1440) }
    ];
  }

  function seedGrants() {
    const list = [];
    let n = 101;
    const add = o => {
      const g = Object.assign({
        id: 'YTK-' + String(n).padStart(4, '0'), group: '', pod: '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view'],
        mode: 'permanent', start: null, end: null, window: false, wo: '', reason: '', autoRelock: 60, woReq: false,
        createdBy: 'Zeynep Arslan', createdAt: ago(30 * 1440), updatedBy: '', updatedAt: null, revokedAt: null, revokedBy: '', revokeReason: '', sync: 'ok'
      }, o);
      g.history = [{ t: g.createdAt, by: g.createdBy, action: 'Yetki tanımlandı', note: g.group ? 'Grup: ' + g.group : '' }];
      if (g.revokedAt) g.history.push({ t: g.revokedAt, by: g.revokedBy, action: 'Yetki iptal edildi', note: g.revokeReason });
      list.push(g);
      n += 1 + (n % 3);
      return g;
    };
    const ALL3 = ['view', 'unlock', 'lock'];
    add({ user: '00547731', group: 'GRP-06', perms: ['view', 'unlock', 'lock', 'manage'], createdBy: 'Murat Aksoy', createdAt: ago(300 * 1440), reason: 'Sistem yöneticisi — tam yetki' });
    add({ user: '00546120', group: 'GRP-06', perms: ['view', 'unlock', 'lock', 'manage'], createdAt: ago(298 * 1440), reason: 'DCIM platform ekibi' });
    add({ user: '00552604', group: 'GRP-02', perms: ALL3, createdAt: ago(95 * 1440), autoRelock: 120, reason: 'Güvenlik vardiya ekibi' });
    add({ user: '00549854', group: 'GRP-01', perms: ALL3, createdAt: ago(210 * 1440), reason: 'NOC vardiya operatörü' });
    add({ user: '00551207', group: 'GRP-01', perms: ALL3, createdAt: ago(180 * 1440), reason: 'NOC vardiya operatörü' });
    add({ user: '00551873', group: 'GRP-01', perms: ALL3, createdAt: ago(60 * 1440), createdBy: 'Murat Aksoy', reason: 'NOC vardiya operatörü' });
    add({ user: '00553318', group: 'GRP-03', pod: podOf('1BG41'), cabinets: ['1BG41'], sides: ['front'], perms: ALL3, mode: 'timed', start: ago(150), end: ago(-90), wo: 'İE-2026-0931', reason: '1BG41 PDU-A modül değişimi — yetkili bakım penceresi', createdAt: ago(1300), woReq: true });
    add({ user: '00554419', group: 'GRP-03', pod: podOf('1BJ53'), cabinets: 'ALL', sides: ['rear'], perms: ALL3, mode: 'timed', start: ago(300), end: ago(-1140), wo: 'İE-2026-0928', reason: 'Yüksek sıcaklık — arka kapak hava akışı ve körleme paneli kontrolü (1BJ53 / 1BC37)', createdAt: ago(310), createdBy: 'Deniz Koç' });
    add({ user: '00550437', group: 'GRP-03', pod: podOf('1BX54'), cabinets: ['1BX54'], perms: ALL3, mode: 'timed', start: roundTo5(ago(-180)), end: roundTo5(ago(-660)), wo: 'İE-2026-0914', reason: '1BX54 kilit motoru değişimi — planlı bakım', createdAt: ago(240), woReq: true });
    add({ user: '00548816', pod: podOf('1BN52'), cabinets: BURAK_CABS, perms: ALL3, mode: 'timed', start: ago(2 * 1440 + 35), end: ago(-5 * 1440 + 35), reason: 'Omurga switch geçişi — POD ağ kabinleri', createdAt: ago(2 * 1440 + 60), createdBy: 'Murat Aksoy' });
    add({ user: '00561190', group: 'GRP-04', pod: podOf('1BN52'), cabinets: ['1BN52'], sides: ['rear'], perms: ['view', 'unlock'], mode: 'timed', start: ago(180), end: ago(20), reason: 'Yüklenici — arka panel kablolama (refakatli)', createdAt: ago(200), createdBy: 'Deniz Koç' });
    add({ user: '00560042', group: 'GRP-05', cabinets: EGE.slice(), perms: ['view', 'unlock'], createdAt: ago(200 * 1440), reason: 'Müşteri sözleşmesi — Ege Lojistik kabinleri' });
    add({ user: '00562275', cabinets: ANADOLU.slice(), perms: ['view'], createdAt: ago(75 * 1440), createdBy: 'Murat Aksoy', reason: 'Müşteri temsilcisi — salt izleme (Anadolu Finans A.Ş.)' });
    add({ user: '00553318', pod: podOf('1BX54'), cabinets: 'ALL', perms: ALL3, mode: 'timed', start: ago(9 * 1440), end: ago(9 * 1440 - 480), wo: 'İE-2026-0907', reason: 'KLIMA 104 filtre değişimi — kabin arkası erişim', createdAt: ago(9 * 1440 + 30) });
    add({ user: '00549120', pod: 'POD-3', cabinets: 'ALL', perms: ['view', 'unlock'], mode: 'timed', start: ago(15 * 1440), end: ago(12 * 1440), reason: 'Kapasite sayımı — U doluluk doğrulaması', createdAt: ago(15 * 1440 + 20) });
    add({ user: '00550966', group: 'GRP-01', perms: ALL3, createdAt: ago(260 * 1440), revokedAt: ago(30 * 1440), revokedBy: 'Zeynep Arslan', revokeReason: 'Kullanıcı hesabı pasife alındı' });
    add({ user: '00548816', pod: 'POD-6', cabinets: 'ALL', perms: ALL3, createdAt: ago(80 * 1440), createdBy: 'Murat Aksoy', revokedAt: ago(20 * 1440), revokedBy: 'Murat Aksoy', revokeReason: 'Proje tamamlandı (POD-6 kablo tavası)' });
    return { grants: list, seq: n };
  }

  // ---------------------------------------------------------------------------
  // Yetki hesapları
  // ---------------------------------------------------------------------------
  function grantStatus(g, t) {
    t = t == null ? Date.now() : t;
    if (g.revokedAt && g.revokedAt <= t) return 'revoked';
    if (g.mode === 'timed') {
      if (t < g.start) return 'scheduled';
      if (t > g.end) return 'expired';
    }
    return 'active';
  }
  const activeAt = (g, t) => g.createdAt <= t && grantStatus(g, t) === 'active';
  const grantCabs = g => (g.cabinets === 'ALL' ? (g.pod === '*' ? CABS : (CABS_OF[g.pod] || [])) : g.cabinets.map(c => CAB_BY[c]).filter(Boolean));
  const lockCount = g => grantCabs(g).length * g.sides.length;
  function covers(g, code, side) {
    const cab = CAB_BY[code];
    if (!cab) return false;
    if (side && g.sides.indexOf(side) < 0) return false;
    if (g.cabinets === 'ALL') return g.pod === '*' || g.pod === cab.pod;
    return g.cabinets.indexOf(code) >= 0;
  }
  const touchesPod = (g, pod) => (g.cabinets === 'ALL' ? (g.pod === '*' || g.pod === pod) : g.cabinets.some(c => CAB_BY[c] && CAB_BY[c].pod === pod));
  function scopeTitle(g) {
    if (g.cabinets === 'ALL') return g.pod === '*' ? 'Tüm Salon' : g.pod;
    const pods = uniq(grantCabs(g).map(c => c.pod));
    return pods.length === 1 ? pods[0] : pods.length + ' POD';
  }
  function scopeSub(g) {
    const n = grantCabs(g).length;
    if (g.cabinets === 'ALL') return (g.pod === '*' ? 'Tüm kabinler' : 'POD\'daki tüm kabinler') + ' (' + n + ')';
    return n + ' seçili kabin';
  }

  // ---------------------------------------------------------------------------
  // Erişim kayıtları (kart okuma logları + senaryo olayları)
  // ---------------------------------------------------------------------------
  const SEED = seedGrants();
  const SEED_GRANTS = SEED.grants;
  const FALLBACK_POOL = ['00549854', '00551207', '00551873', '00552604'];
  const findGrant = (grants, userId, code, side, perm, t) =>
    grants.find(g => g.user === userId && covers(g, code, side) && g.perms.indexOf(perm) >= 0 && activeAt(g, t)) || null;

  function buildLogs() {
    const raw = [];
    LOCK_CARDS.forEach(card => {
      // "Kapak kapatıldı / otomatik kilit" satırı ilgili kilit açma satırına süre notu olarak eklenir
      const pending = {};
      card.accessLog.slice().sort((a, b) => a.tim - b.tim).forEach((l, i) => {
        const tim = l.tim.getTime();
        const key = l.user + '|' + l.side;
        if (l.result === 'system') {
          const open = pending[key];
          if (open && tim <= NOW0) open.closedAfter = tim - open.tim;
          delete pending[key];
          return;
        }
        // Senaryo dışı tanımsız kart denemeleri seyreltilir (kabin başına rastgele üretim salon genelinde fazla kalıyor)
        if (l.result === 'denied' && l.user === 'Tanımsız Kart' && !card.alarmText && D.hash(card.cabinetCode + '|' + i) % 20 !== 0) return;
        const row = { tim, name: l.user, card: l.card, dept: l.dept, side: l.side, event: l.event, result: l.result, cab: card.cabinetCode, closedAfter: 0 };
        if (l.result === 'granted') pending[key] = row;
        raw.push(row);
      });
    });
    // Kart sahibi ilgili kapakta Kilit Açma yetkisine sahip değilse aynı olay yetkili bir NOC/güvenlik kullanıcısına atanır
    const replace = {};
    raw.forEach(l => {
      const u = userByName(l.name);
      if (!u || l.result !== 'granted') return;
      const key = l.cab + '|' + l.name + '|' + l.side;
      if (!findGrant(SEED_GRANTS, u.id, l.cab, l.side, 'unlock', l.tim)) replace[key] = FALLBACK_POOL[D.hash(key) % FALLBACK_POOL.length];
    });
    const out = raw.map((l, i) => {
      let u = userByName(l.name);
      const rep = replace[l.cab + '|' + l.name + '|' + l.side];
      if (u && rep) u = USER_BY[rep];
      const g = u && l.result === 'granted' ? findGrant(SEED_GRANTS, u.id, l.cab, l.side, 'unlock', l.tim) : null;
      let note = '';
      if (l.result === 'denied') note = u ? '' : (l.name === '—' ? 'Kart okutulmadan açılma — zorlama şüphesi' : 'Kart sistemde kayıtlı değil');
      if (l.closedAfter) note = 'Kapak ' + dur(l.closedAfter) + ' açık kaldı · otomatik kilitlendi';
      return { id: 'L' + i, tim: l.tim, user: u ? u.id : '', name: u ? u.name : l.name, card: u ? u.card : l.card, dept: u ? u.dept : l.dept, cab: l.cab, side: l.side, event: l.event, result: l.result, ref: g ? g.id : '', note, test: false };
    });
    const gid = (userId, pred) => (SEED_GRANTS.find(g => g.user === userId && (!pred || pred(g))) || {}).id || '';
    const extra = (tim, userId, cab, side, event, result, ref, note) => {
      const u = USER_BY[userId];
      out.push({ id: 'S' + out.length, tim, user: userId, name: u.name, card: u.card, dept: u.dept, cab, side, event, result, ref, note, test: false });
    };
    const can = SEED_GRANTS.find(g => g.user === '00561190');
    extra(ago(12), '00561190', '1BN52', 'rear', 'Kart okutuldu — yetki süresi dolmuş', 'denied', can ? can.id : '', can ? 'Yetki bitişi ' + fmtShort(can.end) : '');
    extra(ago(9), '00560042', '1AZ39', 'front', 'Uzaktan kilit açma talebi (Müşteri Portalı)', 'denied', '', 'Kabin yetki kapsamı dışında');
    extra(ago(6), '00552604', '1AZ39', 'front', 'Uzaktan kilit açıldı — güvenlik yerinde kontrol', 'granted', gid('00552604'), '');
    extra(ago(40), '00550437', '1BX54', 'front', 'Kart okutuldu — yetki henüz başlamadı', 'denied', gid('00550437', g => g.mode === 'timed'), 'Planlı bakım penceresi bekleniyor');
    const pod3 = (CABS_OF['POD-3'] || CABS)[2] || CABS[0];
    extra(ago(2 * 1440 + 312), '00549120', pod3.code, 'front', 'Kart okutuldu — yetki süresi dolmuş', 'denied', gid('00549120'), '');
    const pod5 = (CABS_OF['POD-5'] || CABS)[4] || CABS[0];
    extra(ago(3 * 1440 + 95), '00550966', pod5.code, 'rear', 'Kart okutuldu — yetki iptal edilmiş', 'denied', gid('00550966'), 'Hesap pasif');
    return out;
  }
  const BASE_LOGS = buildLogs();

  // ---------------------------------------------------------------------------
  // Oturum deposu
  // ---------------------------------------------------------------------------
  const STORE_KEY = 'dcim_lock_auth_v1';
  if (params.get('reset') === '1') {
    storage.sessionRemove(STORE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState(null, '', url.toString());
  }
  const DB = (() => {
    try {
      const raw = JSON.parse(storage.sessionGet(STORE_KEY) || 'null');
      if (raw && raw.v === 1 && Array.isArray(raw.grants) && Array.isArray(raw.groups)) return { seq: raw.seq || 500, grants: raw.grants, groups: raw.groups, extraLogs: Array.isArray(raw.extraLogs) ? raw.extraLogs : [] };
    } catch (e) { /* yok say */ }
    return { seq: SEED.seq, grants: SEED_GRANTS.map(g => JSON.parse(JSON.stringify(g))), groups: seedGroups(), extraLogs: [] };
  })();
  function persist() {
    storage.sessionSet(STORE_KEY, JSON.stringify({ v: 1, seq: DB.seq, grants: DB.grants, groups: DB.groups, extraLogs: DB.extraLogs.slice(-200) }));
  }
  const nextId = () => { DB.seq += 1 + (DB.seq % 2); return 'YTK-' + String(DB.seq).padStart(4, '0'); };
  const GROUP_BY = id => DB.groups.find(g => g.id === id) || null;
  const grantById = id => DB.grants.find(g => g.id === id) || null;
  const allLogs = () => BASE_LOGS.concat(DB.extraLogs);
  const me = () => { const u = DCIM.session.user(); return u.fullname || u.usr || 'DCIM Operatör'; };

  function pushAudit(txt, asset) {
    const user = DCIM.session.user();
    let list = [];
    try { list = JSON.parse(storage.sessionGet('dcim_audit_session') || '[]'); } catch (e) { list = []; }
    list.push({ tim: new Date().toISOString(), cat: 'YETKİ', txt, sta: 0x0105, user: user.usr || 'operator', ip: '10.130.1.45', url: 'http://10.130.1.111/k/dcim/monitoring/lock-authorization', asset, res: 'success' });
    storage.sessionSet('dcim_audit_session', JSON.stringify(list.slice(-50)));
  }

  // Kilit denetleyicisine aktarım (yalnızca arayüz durumu; gerçek komut üretilmez)
  function simulateSync(ids) {
    ids.forEach(id => { const g = grantById(id); if (g) g.sync = 'pending'; });
    persist();
    renderContent();
    setTimeout(() => {
      let locks = 0;
      ids.forEach(id => { const g = grantById(id); if (g) { g.sync = 'ok'; locks += lockCount(g); } });
      persist();
      renderAll();
      toast(locks + ' kilit için erişim listesi güncellendi.', 'success', 'Kilit Denetleyicisi');
    }, 1600);
  }

  // ---------------------------------------------------------------------------
  // Sayfa durumu
  // ---------------------------------------------------------------------------
  const TABS = ['users', 'groups', 'logs'];
  const STATUS_FILTERS = ['all', 'active', 'timed', 'scheduled', 'expired', 'revoked'];
  const RESULT_FILTERS = ['all', 'granted', 'denied'];
  const initCab = CAB_BY[params.get('cabinet')] ? params.get('cabinet') : '';
  const S = {
    tab: TABS.indexOf(params.get('tab')) >= 0 ? params.get('tab') : 'users',
    pod: initCab ? podOf(initCab) : (PODS.indexOf(params.get('pod')) >= 0 ? params.get('pod') : ''),
    cab: initCab,
    q: params.get('q') || (params.get('new') ? '' : (params.get('user') || '')),
    status: STATUS_FILTERS.indexOf(params.get('status')) >= 0 ? params.get('status') : 'all',
    gq: '',
    lq: '',
    result: RESULT_FILTERS.indexOf(params.get('result')) >= 0 ? params.get('result') : 'all',
    period: '7d',
    logLimit: 60,
    sideCollapsed: storage.get('dcim_lock_auth_sidebar') === '1',
    sideQ: ''
  };

  function syncUrl() {
    const url = new URL(window.location.href);
    const set = (k, v) => { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); };
    set('tab', S.tab === 'users' ? '' : S.tab);
    set('pod', S.cab ? '' : S.pod);
    set('cabinet', S.cab);
    ['new', 'grant', 'test', 'user'].forEach(k => url.searchParams.delete(k));
    window.history.replaceState(null, '', url.toString());
  }

  // ---------------------------------------------------------------------------
  // Ortak HTML parçaları
  // ---------------------------------------------------------------------------
  const INPUT = 'h-8 w-full rounded-[2px] border border-slate-300 bg-white pl-8 pr-2.5 text-xs text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-100 transition-colors';
  const SELECT = 'h-8 rounded-[2px] border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-100 transition-colors cursor-pointer';
  const FIELD = 'w-full bg-white dark:bg-surface-base border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-[2px] px-2 py-1.5 font-semibold focus:outline-none focus:border-sky-500';
  const LABEL = 'text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400';

  function btn(o) {
    return '<button type="button" class="' + buttonClasses(o.variant || 'primary', o.size || 'md', false) + (o.cls ? ' ' + o.cls : '') + '"' +
      (o.act ? ' data-act="' + o.act + '"' : '') + (o.attrs ? ' ' + o.attrs : '') + (o.disabled ? ' disabled' : '') + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' +
      (o.icon ? '<i class="' + o.icon + ' text-current shrink-0"></i>' : '') + '<span class="truncate">' + esc(o.label) + '</span></button>';
  }
  const searchBox = (attr, value, ph, extra) =>
    '<div class="relative min-w-0 flex-1 sm:w-56 ' + (extra || '') + '"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"></i>' +
    '<input type="search" ' + attr + ' value="' + esc(value) + '" placeholder="' + esc(ph) + '" class="' + INPUT + '" /></div>';
  const segBtn = (attr, on, label, count) =>
    '<button type="button" ' + attr + ' class="h-7 px-2 sm:px-2.5 text-[10px] font-black rounded-[2px] transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ' +
    (on ? 'bg-white dark:bg-surface-card text-brand-600 dark:text-brand-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent') + '">' +
    esc(label) + (count != null ? '<span class="font-mono text-[9px] opacity-70">' + count + '</span>' : '') + '</button>';
  const segWrap = inner => '<div class="inline-flex flex-wrap items-center rounded-[2px] p-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">' + inner + '</div>';

  const STATUS = {
    active: { label: 'Aktif', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-500' },
    scheduled: { label: 'Planlandı', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/40', dot: 'bg-sky-500' },
    expired: { label: 'Süresi Doldu', cls: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/40', dot: 'bg-orange-500' },
    revoked: { label: 'İptal Edildi', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400' }
  };
  function statusBadge(g) {
    if (g.sync === 'pending') return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-bold border whitespace-nowrap bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/40"><i class="pi pi-spin pi-spinner text-[9px]"></i>Aktarılıyor</span>';
    const s = STATUS[grantStatus(g)];
    return '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[2px] text-[10px] font-bold border whitespace-nowrap ' + s.cls + '"><span class="w-1.5 h-1.5 rounded-full ' + s.dot + '"></span>' + s.label + '</span>';
  }
  function permIcons(perms) {
    return '<div class="flex items-center gap-1">' + PERMS.map(p => {
      const on = perms.indexOf(p.key) >= 0;
      return '<span title="' + esc(p.label + (on ? '' : ' — tanımlı değil')) + '" class="w-6 h-6 rounded-[2px] border inline-flex items-center justify-center ' +
        (on ? TONE[p.tone] : 'border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-700') + '"><i class="' + p.icon + ' text-[10px]"></i></span>';
    }).join('') + '</div>';
  }
  const permChips = perms => permOrder(perms).map(k => {
    const p = PERM_BY[k];
    return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-bold border ' + TONE[p.tone] + '"><i class="' + p.icon + ' text-[9px]"></i>' + p.label + '</span>';
  }).join('');
  const groupChip = g => (g ? '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-bold border ' + TONE[g.tone] + '"><i class="' + g.icon + ' text-[8px]"></i>' + esc(g.name) + '</span>' : '');

  function remainText(g) {
    const st = grantStatus(g), now = Date.now();
    if (st === 'scheduled') return { txt: dur(g.start - now) + ' sonra başlar', cls: 'text-sky-600 dark:text-sky-400' };
    if (st === 'expired') return { txt: dur(now - g.end) + ' önce doldu', cls: 'text-orange-600 dark:text-orange-400' };
    if (st === 'revoked') return { txt: 'İptal edildi', cls: 'text-slate-400' };
    const left = g.end - now;
    return { txt: dur(left) + ' kaldı', cls: left < 2 * HOUR ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400' };
  }
  function durationCell(g) {
    if (g.mode === 'permanent') {
      return '<div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200"><i class="pi pi-verified text-emerald-500 text-[10px]"></i>Kalıcı</div>' +
        '<div class="text-[9.5px] font-mono text-slate-400 whitespace-nowrap">' + fmtShort(g.createdAt) + ' itibarıyla</div>';
    }
    const st = grantStatus(g), now = Date.now();
    const pct = st === 'scheduled' ? 0 : clamp((now - g.start) / (g.end - g.start) * 100, 0, 100);
    const r = remainText(g);
    const bar = st === 'active' ? (g.end - now < 2 * HOUR ? 'bg-amber-500' : 'bg-sky-500') : st === 'expired' ? 'bg-orange-500' : 'bg-slate-400';
    return '<div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap"><i class="pi pi-stopwatch text-amber-500 text-[10px]"></i>Süreli' +
        '<span class="text-[9.5px] font-mono font-semibold ' + r.cls + '">' + r.txt + '</span></div>' +
      '<div class="text-[9.5px] font-mono text-slate-400 whitespace-nowrap">' + fmtShort(g.start) + ' → ' + fmtShort(g.end) + (g.window ? ' · mesai' : '') + '</div>' +
      '<div class="mt-1 h-1 w-full max-w-[180px] rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div class="h-full ' + bar + '" style="width:' + pct.toFixed(1) + '%"></div></div>';
  }

  // ---------------------------------------------------------------------------
  // Sayfa başlığı
  // ---------------------------------------------------------------------------
  function renderHeader() {
    document.getElementById('la-header').innerHTML = kit.pageHeader({
      title: 'Kilit Yetkilendirme',
      badge: 'CMR/T00 · ' + TOTAL_LOCKS + ' kilit',
      compact: true,
      breadcrumbs: [{ label: 'Yönetim' }, { label: 'Kilit Yetkilendirme' }],
      actions:
        '<a href="locks.html" class="' + buttonClasses('secondary', 'sm', false) + '"><i class="pi pi-lock text-current shrink-0"></i><span class="truncate">Kapak Kilitleri</span></a>' +
        btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-check-square', label: 'Erişim Testi', act: 'test' }) +
        btn({ variant: 'primary', size: 'sm', icon: 'pi pi-plus', label: 'Yeni Yetki', act: 'new' })
    });
  }

  // ---------------------------------------------------------------------------
  // Özet kartları
  // ---------------------------------------------------------------------------
  function renderSummary() {
    const now = Date.now();
    const active = DB.grants.filter(g => grantStatus(g) === 'active');
    const users = uniq(active.map(g => g.user));
    const covered = new Set();
    active.forEach(g => grantCabs(g).forEach(c => g.sides.forEach(s => covered.add(c.code + s))));
    const timed = DB.grants.filter(g => g.mode === 'timed' && ['active', 'scheduled'].indexOf(grantStatus(g)) >= 0);
    const soon = timed.filter(g => grantStatus(g) === 'active' && g.end - now < DAY).length;
    const scheduled = timed.filter(g => grantStatus(g) === 'scheduled').length;
    const denied = allLogs().filter(l => l.result === 'denied' && !l.test && now - l.tim < DAY).length;
    const card = (attrs, cls, head, icon, value, unit, foot, footCls) =>
      '<div ' + attrs + ' class="' + cls + ' border rounded-[2px] p-2.5 sm:p-3 shadow-2xs transition-all select-none">' +
        '<div class="flex items-center justify-between ' + head[1] + '"><span class="text-[9.5px] sm:text-[10px] font-black uppercase tracking-wider">' + head[0] + '</span><i class="' + icon + ' text-sm"></i></div>' +
        '<div class="mt-1 flex items-baseline gap-1.5 sm:gap-2"><span class="text-xl sm:text-2xl font-black tracking-tight ' + value[1] + '">' + value[0] + '</span><span class="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">' + unit + '</span></div>' +
        '<div class="mt-1 text-[8.5px] sm:text-[9px] font-mono truncate ' + (footCls || 'text-slate-400') + '">' + foot + '</div>' +
      '</div>';
    const el = document.getElementById('la-summary');
    el.innerHTML =
      card('data-sum="users" title="Aktif yetkileri listele"', 'bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer', ['Yetkili Kullanıcı', 'text-slate-500 dark:text-slate-400'], 'pi pi-users text-brand-500',
        [users.length, 'text-slate-900 dark:text-slate-100'], 'kullanıcı', active.length + ' aktif yetki · ' + DB.groups.length + ' yetki grubu') +
      card('', 'bg-white dark:bg-surface-card border-emerald-500/30 dark:border-emerald-500/40', ['Toplam Kilit', 'text-emerald-600 dark:text-emerald-400'], 'pi pi-lock',
        [TOTAL_LOCKS, 'text-emerald-700 dark:text-emerald-300'], 'kilit', CABS.length + ' kabin · ' + covered.size + ' kilit yetki kapsamında', 'text-emerald-600/80 dark:text-emerald-400/80') +
      card('data-sum="timed" title="Süreli yetkileri listele"', (soon ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-500/50 hover:border-amber-500' : 'bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle hover:border-slate-300') + ' cursor-pointer',
        ['Süreli Yetki', soon ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'], 'pi pi-stopwatch',
        [timed.length, soon ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'], 'yetki',
        soon + ' yetki 24 sa içinde sona eriyor · ' + scheduled + ' planlı', soon ? 'text-amber-600 dark:text-amber-400 font-bold' : '') +
      card('data-sum="denied" title="Reddedilen erişimleri listele"', (denied ? 'bg-rose-50/50 dark:bg-rose-950/25 border-rose-500/60 hover:border-rose-500' : 'bg-white dark:bg-surface-card border-slate-200 dark:border-border-subtle') + ' cursor-pointer',
        ['Reddedilen Erişim', denied ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'], 'pi pi-ban',
        [denied, denied ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-slate-100'], 'son 24 sa', 'Yetkisiz kart · süresi dolmuş · kapsam dışı', denied ? 'text-rose-600 dark:text-rose-400' : '');
  }
  document.getElementById('la-summary').addEventListener('click', e => {
    const c = e.target.closest('[data-sum]');
    if (!c) return;
    const k = c.getAttribute('data-sum');
    if (k === 'users') { S.tab = 'users'; S.status = 'active'; }
    else if (k === 'timed') { S.tab = 'users'; S.status = 'timed'; }
    else { S.tab = 'logs'; S.result = 'denied'; S.period = '24h'; }
    syncUrl();
    renderTabs(); renderToolbar(); renderContent();
  });

  // ---------------------------------------------------------------------------
  // Sekmeler + kapsam çubuğu
  // ---------------------------------------------------------------------------
  function renderTabs() {
    const tabCls = on => 'px-3 py-1.5 text-xs font-bold rounded-[2px] transition-colors cursor-pointer flex items-center gap-1.5 ' +
      (on ? 'bg-white dark:bg-surface-card text-sky-600 dark:text-sky-400 shadow-xs border border-slate-200 dark:border-border-subtle' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent');
    const cnt = (n, tone) => '<span class="font-mono text-[10px] px-1.5 py-0.5 rounded-[2px] border ' + TONE[tone] + '">' + n + '</span>';
    const deniedToday = allLogs().filter(l => l.result === 'denied' && !l.test && Date.now() - l.tim < DAY).length;
    document.getElementById('la-tabs').innerHTML =
      '<button type="button" data-tab="users" class="' + tabCls(S.tab === 'users') + '"><i class="pi pi-id-card text-xs"></i><span>Kullanıcı Yetkileri</span>' + cnt(DB.grants.filter(g => grantStatus(g) !== 'revoked').length, 'sky') + '</button>' +
      '<button type="button" data-tab="groups" class="' + tabCls(S.tab === 'groups') + '"><i class="pi pi-users text-xs"></i><span>Yetki Grupları</span>' + cnt(DB.groups.length, 'slate') + '</button>' +
      '<button type="button" data-tab="logs" class="' + tabCls(S.tab === 'logs') + '"><i class="pi pi-history text-xs"></i><span>Erişim Kayıtları</span>' +
        (deniedToday ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="Son 24 saatte reddedilen erişim var"></span>' : '') + '</button>';
  }
  document.getElementById('la-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.getAttribute('data-tab');
    syncUrl();
    renderTabs(); renderToolbar(); renderContent();
  });

  const authorizedUsersOf = code => uniq(DB.grants.filter(g => grantStatus(g) === 'active' && covers(g, code)).map(g => g.user));
  function renderScope() {
    const el = document.getElementById('la-scope');
    const chip = (icon, label, clear) =>
      '<span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-[2px] font-mono font-bold bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-200">' +
      '<i class="' + icon + ' text-[9px] text-brand-500"></i>' + esc(label) +
      (clear ? '<button type="button" data-scope-clear="' + clear + '" title="Kapsamı temizle" class="ml-0.5 text-slate-400 hover:text-rose-500 cursor-pointer"><i class="pi pi-times text-[8px]"></i></button>' : '') + '</span>';
    if (!S.pod && !S.cab) {
      el.innerHTML = '<span class="hidden sm:inline-flex items-center gap-1.5 font-mono text-slate-500 dark:text-slate-400"><i class="pi pi-sitemap text-[10px] text-sky-500"></i>Kapsam: Tüm Salon · ' + PODS.length + ' POD · ' + CABS.length + ' kabin</span>';
      return;
    }
    let html = chip('pi pi-building', 'Salon 1', '') + '<i class="pi pi-chevron-right text-[8px] text-slate-400"></i>' + chip('pi pi-map-marker', S.pod, 'pod');
    if (S.cab) {
      const cab = CAB_BY[S.cab];
      const st = p => (p.state === 'open' ? '<span class="text-rose-600 dark:text-rose-400">AÇIK</span>' : p.lockState === 'fault' ? '<span class="text-orange-600 dark:text-orange-400">ARIZA</span>' : p.state === 'closed' ? '<span class="text-emerald-600 dark:text-emerald-400">KİLİTLİ</span>' : '<span class="text-slate-400">?</span>');
      html += '<i class="pi pi-chevron-right text-[8px] text-slate-400"></i>' + chip('pi pi-server', S.cab, 'cab') +
        '<span class="inline-flex items-center gap-2 px-2 py-1 rounded-[2px] bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle font-bold text-slate-600 dark:text-slate-300">' +
          '<span class="truncate max-w-[140px]">' + esc(cab.customer) + '</span><span class="font-mono">Ön: ' + st(cab.lock.front) + '</span><span class="font-mono">Arka: ' + st(cab.lock.rear) + '</span>' +
          '<span class="font-mono text-sky-600 dark:text-sky-400">' + authorizedUsersOf(S.cab).length + ' yetkili</span>' +
          '<a href="locks.html?view=cards&cabinet=' + encodeURIComponent(S.cab) + '" class="text-brand-600 dark:text-brand-400 hover:underline" title="Kapak Kilitleri monitöründe aç">Monitör <i class="pi pi-arrow-up-right text-[8px]"></i></a>' +
        '</span>';
    }
    el.innerHTML = html;
  }
  document.getElementById('la-scope').addEventListener('click', e => {
    const b = e.target.closest('[data-scope-clear]');
    if (!b) return;
    if (b.getAttribute('data-scope-clear') === 'pod') setScope('', ''); else setScope(S.pod, '');
  });

  function setScope(pod, cab) {
    S.pod = pod;
    S.cab = cab;
    S.logLimit = 60;
    syncUrl();
    renderSidebar(); renderScope(); renderToolbar(); renderContent();
  }

  // ---------------------------------------------------------------------------
  // Kenar çubuğu (app-sidebar): POD / Kabin kapsamı
  // ---------------------------------------------------------------------------
  const podShort = p => p.replace('POD-', 'P');
  function renderSidebar() {
    const host = document.getElementById('la-sidebar');
    if (S.sideCollapsed) {
      host.innerHTML = kit.sidebar({
        title: '', collapsed: true,
        body: '<button type="button" data-sb-pod="" title="Tüm Salon" class="w-full h-8 rounded-[2px] text-[10px] font-black flex items-center justify-center transition-colors cursor-pointer ' + (!S.pod ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800') + '"><i class="pi pi-building text-xs"></i></button>' +
          PODS.map(p => '<button type="button" data-sb-pod="' + esc(p) + '" title="' + esc(p) + '" class="w-full h-7 rounded-[2px] text-[9px] font-black font-mono flex items-center justify-center transition-colors cursor-pointer ' +
            (S.pod === p ? 'bg-sky-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800') + '">' + esc(podShort(p)) + '</button>').join(''),
        footer: '<div class="text-center text-[9px] font-mono text-slate-400" title="Toplam kilit">' + TOTAL_LOCKS + '</div>'
      });
    } else {
      host.innerHTML = kit.sidebar({
        title: 'POD / Kabin Kapsamı', icon: 'pi pi-sitemap', collapsed: false,
        body: '<div class="relative mb-1.5"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
            '<input type="search" data-sb-search value="' + esc(S.sideQ) + '" placeholder="Kabin veya müşteri ara..." class="h-7 w-full rounded-[2px] border border-slate-300 bg-white pl-7 pr-2 text-[11px] text-slate-800 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-surface-panel dark:text-slate-100" /></div>' +
          '<div id="la-sb-list" class="space-y-0.5"></div>',
        footer: '<div class="flex items-center justify-between text-[9.5px] font-mono text-slate-500 dark:text-slate-400">' +
            '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Kilitli</span>' +
            '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Açık</span>' +
            '<span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-orange-500"></span>Alarm</span>' +
            '<span>' + CABS.length + ' kabin</span>' +
          '</div>'
      });
      renderSidebarList();
    }
  }
  const DOT = { open: 'bg-rose-500', alarm: 'bg-orange-500', normal: 'bg-emerald-500', unknown: 'bg-slate-400' };
  function renderSidebarList() {
    const host = document.getElementById('la-sb-list');
    if (!host) return;
    const q = lc(S.sideQ.trim());
    const match = c => !q || lc(c.code).indexOf(q) >= 0 || lc(c.customer).indexOf(q) >= 0;
    const active = DB.grants.filter(g => grantStatus(g) === 'active');
    const podUsers = p => uniq(active.filter(g => touchesPod(g, p)).map(g => g.user)).length;
    const item = (attrs, on, left, right) =>
      '<button type="button" ' + attrs + ' class="w-full px-2 py-1.5 rounded-[2px] text-left text-[11px] flex items-center justify-between gap-2 transition-colors cursor-pointer ' +
      (on ? 'bg-sky-600/10 text-sky-700 dark:text-sky-300 font-bold border border-sky-500/30' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 border border-transparent') + '">' + left + right + '</button>';
    let html = q ? '' : item('data-sb-pod=""', !S.pod, '<span class="flex items-center gap-2 min-w-0"><i class="pi pi-building text-[11px] text-sky-500"></i><span class="font-bold truncate">Tüm Salon</span></span>',
      '<span class="font-mono text-[9.5px] text-slate-400">' + uniq(active.map(g => g.user)).length + ' kişi</span>');
    let any = false;
    PODS.forEach(p => {
      const cabs = CABS_OF[p].filter(match);
      if (q && !cabs.length) return;
      any = true;
      const open = CABS_OF[p].filter(c => c.lock.overallState === 'open').length;
      const expanded = q || S.pod === p;
      html += item('data-sb-pod="' + esc(p) + '"', S.pod === p && !S.cab,
        '<span class="flex items-center gap-2 min-w-0"><i class="pi ' + (expanded ? 'pi-chevron-down' : 'pi-chevron-right') + ' text-[8px] text-slate-400"></i><i class="pi pi-map-marker text-[10px] text-brand-500"></i><span class="font-bold truncate">' + esc(p) + '</span>' +
          (open ? '<span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="' + open + ' açık kapak"></span>' : '') + '</span>',
        '<span class="font-mono text-[9.5px] text-slate-400 whitespace-nowrap">' + CABS_OF[p].length + ' kb · ' + podUsers(p) + ' kişi</span>');
      if (expanded) {
        html += '<div class="ml-3 pl-2 border-l border-slate-200 dark:border-slate-800 space-y-0.5 py-0.5">' + cabs.map(c =>
          '<button type="button" data-sb-cab="' + esc(c.code) + '" title="' + esc(c.code + ' — ' + c.customer) + '" class="w-full px-2 py-1 rounded-[2px] text-left text-[10.5px] flex items-center justify-between gap-2 transition-colors cursor-pointer ' +
            (S.cab === c.code ? 'bg-sky-600 text-white font-bold' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70') + '">' +
            '<span class="flex items-center gap-1.5 min-w-0"><span class="w-1.5 h-1.5 rounded-full shrink-0 ' + DOT[c.lock.overallState] + '"></span><span class="font-mono font-bold">' + esc(c.code) + '</span>' +
              '<span class="truncate text-[9.5px] ' + (S.cab === c.code ? 'text-white/80' : 'text-slate-400') + '">' + esc(c.customer) + '</span></span>' +
            '<span class="font-mono text-[9px] ' + (S.cab === c.code ? 'text-white/90' : 'text-slate-400') + '">' + authorizedUsersOf(c.code).length + '</span>' +
          '</button>').join('') + '</div>';
      }
    });
    if (!any) html += '<div class="px-2 py-4 text-center text-[10.5px] text-slate-400"><i class="pi pi-filter-slash block mb-1 text-base"></i>Eşleşen kabin yok</div>';
    host.innerHTML = html;
  }
  const sidebarHost = document.getElementById('la-sidebar');
  sidebarHost.addEventListener('click', e => {
    if (e.target.closest('[data-sidebar-toggle]')) {
      S.sideCollapsed = !S.sideCollapsed;
      storage.set('dcim_lock_auth_sidebar', S.sideCollapsed ? '1' : '0');
      renderSidebar();
      return;
    }
    const cab = e.target.closest('[data-sb-cab]');
    if (cab) { const code = cab.getAttribute('data-sb-cab'); if (S.cab === code) setScope(S.pod, ''); else setScope(podOf(code), code); return; }
    const pod = e.target.closest('[data-sb-pod]');
    if (pod) { const p = pod.getAttribute('data-sb-pod'); setScope(p && S.pod === p && !S.cab ? '' : p, ''); }
  });
  sidebarHost.addEventListener('input', e => {
    if (!e.target.matches('[data-sb-search]')) return;
    S.sideQ = e.target.value;
    renderSidebarList();
  });

  // ---------------------------------------------------------------------------
  // Araç çubuğu
  // ---------------------------------------------------------------------------
  function scopeSelects() {
    const cabs = S.pod ? CABS_OF[S.pod] : [];
    return '<select data-f="pod" class="' + SELECT + ' min-w-28" title="POD filtresi"><option value="">Tüm POD\'lar</option>' +
        PODS.map(p => '<option value="' + esc(p) + '"' + (p === S.pod ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select>' +
      '<select data-f="cab" class="' + SELECT + ' min-w-28" title="Kabin filtresi"' + (S.pod ? '' : ' disabled') + '><option value="">' + (S.pod ? 'Tüm kabinler' : 'Önce POD seçin') + '</option>' +
        cabs.map(c => '<option value="' + esc(c.code) + '"' + (c.code === S.cab ? ' selected' : '') + '>' + esc(c.code) + ' — ' + esc(c.customer) + '</option>').join('') + '</select>';
  }
  function renderToolbar() {
    const el = document.getElementById('la-toolbar');
    if (S.tab === 'users') {
      const base = scopedGrants();
      const count = f => base.filter(g => statusMatch(g, f)).length;
      const labels = { all: 'Tümü', active: 'Aktif', timed: 'Süreli', scheduled: 'Planlı', expired: 'Süresi Dolan', revoked: 'İptal' };
      el.innerHTML =
        '<div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">' +
          segWrap(STATUS_FILTERS.map(f => segBtn('data-status="' + f + '"', S.status === f, labels[f], count(f))).join('')) +
        '</div>' +
        '<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">' +
          searchBox('data-f="q"', S.q, 'Kullanıcı, kart, yetki no, kabin ara...') + scopeSelects() +
          btn({ variant: 'secondary', icon: 'pi pi-file-excel', label: 'Excel', act: 'export-grants', cls: 'shrink-0' }) +
        '</div>';
    } else if (S.tab === 'groups') {
      el.innerHTML =
        '<div class="flex items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400"><i class="pi pi-info-circle text-sky-500"></i>' +
          '<span>Grup üyeleri grubun kapsam ve izin şablonunu devralır; üye ekleme/çıkarma yetkileri otomatik oluşturur veya iptal eder.</span></div>' +
        '<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">' +
          searchBox('data-f="gq"', S.gq, 'Grup veya üye ara...') +
          btn({ variant: 'primary', icon: 'pi pi-plus', label: 'Yeni Grup', act: 'new-group', cls: 'shrink-0' }) +
        '</div>';
    } else {
      const labels = { all: 'Tümü', granted: 'İzin Verildi', denied: 'Reddedildi' };
      const base = scopedLogs(true);
      const count = f => (f === 'all' ? base.length : base.filter(l => l.result === f).length);
      el.innerHTML =
        '<div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">' +
          segWrap(RESULT_FILTERS.map(f => segBtn('data-result="' + f + '"', S.result === f, labels[f], count(f))).join('')) +
          '<select data-f="period" class="' + SELECT + '" title="Zaman aralığı">' +
            [['24h', 'Son 24 saat'], ['7d', 'Son 7 gün'], ['all', 'Tüm kayıtlar']].map(o => '<option value="' + o[0] + '"' + (S.period === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full lg:w-auto">' +
          searchBox('data-f="lq"', S.lq, 'Kullanıcı, kart, kabin, olay ara...') + scopeSelects() +
          btn({ variant: 'secondary', icon: 'pi pi-file-excel', label: 'Excel', act: 'export-logs', cls: 'shrink-0' }) +
        '</div>';
    }
  }
  const toolbar = document.getElementById('la-toolbar');
  toolbar.addEventListener('input', e => {
    const f = e.target.getAttribute('data-f');
    if (f === 'q' || f === 'gq' || f === 'lq') { S[f] = e.target.value; S.logLimit = 60; renderContent(); }
  });
  toolbar.addEventListener('change', e => {
    const f = e.target.getAttribute('data-f');
    if (f === 'pod') setScope(e.target.value, '');
    else if (f === 'cab') setScope(S.pod, e.target.value);
    else if (f === 'period') { S.period = e.target.value; S.logLimit = 60; renderToolbar(); renderContent(); }
  });
  toolbar.addEventListener('click', e => {
    const st = e.target.closest('[data-status]');
    if (st) { S.status = st.getAttribute('data-status'); renderToolbar(); renderContent(); return; }
    const rs = e.target.closest('[data-result]');
    if (rs) { S.result = rs.getAttribute('data-result'); S.logLimit = 60; renderToolbar(); renderContent(); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.getAttribute('data-act');
    if (act === 'export-grants') exportGrants();
    else if (act === 'export-logs') exportLogs();
    else if (act === 'new-group') groupDialog(null);
  });

  // ---------------------------------------------------------------------------
  // İçerik
  // ---------------------------------------------------------------------------
  function renderContent() {
    const host = document.getElementById('la-content');
    if (S.tab === 'users') renderGrants(host);
    else if (S.tab === 'groups') renderGroups(host);
    else renderLogs(host);
  }

  // --- 1) Kullanıcı Yetkileri -------------------------------------------------
  function statusMatch(g, f) {
    const st = grantStatus(g);
    if (f === 'all') return true;
    if (f === 'timed') return g.mode === 'timed' && (st === 'active' || st === 'scheduled');
    return st === f;
  }
  function scopedGrants() {
    return DB.grants.filter(g => (S.cab ? covers(g, S.cab) : S.pod ? touchesPod(g, S.pod) : true));
  }
  const ST_ORDER = { active: 0, scheduled: 1, expired: 2, revoked: 3 };
  function visibleGrants() {
    const q = lc(S.q.trim());
    return scopedGrants().filter(g => {
      if (!statusMatch(g, S.status)) return false;
      if (!q) return true;
      const u = USER_BY[g.user] || {};
      const grp = GROUP_BY(g.group);
      const hay = [g.id, u.name, u.usr, u.dept, u.card, u.id, grp ? grp.name : '', scopeTitle(g), g.wo, g.reason, g.cabinets === 'ALL' ? '' : g.cabinets.join(' ')].join(' ');
      return lc(hay).indexOf(q) >= 0;
    }).sort((a, b) => (ST_ORDER[grantStatus(a)] - ST_ORDER[grantStatus(b)]) || (USER_BY[a.user].name.localeCompare(USER_BY[b.user].name, 'tr')) || a.id.localeCompare(b.id));
  }

  function renderGrants(host) {
    const list = visibleGrants();
    if (!list.length) {
      host.innerHTML = kit.emptyState({ icon: 'pi pi-filter-slash', message: 'Filtreye uyan yetki bulunamadı', description: S.cab ? S.cab + ' kabini için bu filtrede yetki tanımı yok. "Yeni Yetki" ile tanımlayabilirsiniz.' : 'Arama veya durum filtresini değiştirin.' });
      return;
    }
    const actBtn = (act, id, icon, title, tone) =>
      '<button type="button" data-row-act="' + act + '" data-id="' + esc(id) + '" title="' + esc(title) + '" class="w-7 h-7 inline-flex items-center justify-center rounded-[2px] transition-colors cursor-pointer ' + tone + '"><i class="' + icon + ' text-[11px]"></i></button>';
    host.innerHTML =
      '<div class="w-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden shadow-2xs flex flex-col"><div class="overflow-x-auto custom-scrollbar">' +
      '<table class="w-full text-left border-collapse text-xs"><thead><tr class="border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">' +
        '<th class="px-3 py-2.5">Yetki No</th><th class="px-3 py-2.5">Kullanıcı</th><th class="px-3 py-2.5">Kapsam</th><th class="px-3 py-2.5 text-center">Kilit</th>' +
        '<th class="px-3 py-2.5">İzinler</th><th class="px-3 py-2.5">Erişim Süresi</th><th class="px-3 py-2.5">Durum</th><th class="px-3 py-2.5 text-right">İşlem</th>' +
      '</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
      list.map(g => {
        const u = USER_BY[g.user];
        const st = grantStatus(g);
        const dim = st === 'revoked' || st === 'expired';
        const grp = GROUP_BY(g.group);
        const cabs = g.cabinets === 'ALL' ? [] : g.cabinets;
        const canEdit = st !== 'revoked';
        return '<tr data-grant="' + esc(g.id) + '" class="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors' + (dim ? ' opacity-70' : '') + '">' +
          '<td class="px-3 py-2 align-top"><div class="font-mono text-[11px] font-black text-slate-800 dark:text-slate-100 whitespace-nowrap">' + esc(g.id) + '</div>' +
            '<div class="text-[9px] font-mono text-slate-400 whitespace-nowrap">' + fmtShort(g.updatedAt || g.createdAt) + '</div></td>' +
          '<td class="px-3 py-2 align-top"><div class="flex items-start gap-2.5">' + avatar(u) +
            '<div class="min-w-0"><div class="flex items-center gap-1.5 flex-wrap"><span class="font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">' + esc(u.name) + '</span>' + roleBadge(u) +
              (u.passive ? '<span class="px-1 py-0.5 rounded-[2px] text-[8.5px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">pasif</span>' : '') + '</div>' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[240px]">' + esc(u.dept) + '</div>' +
            '<div class="text-[9.5px] font-mono text-slate-400 whitespace-nowrap"><i class="pi pi-id-card text-[9px] mr-1"></i>' + esc(u.card) + ' · ' + esc(u.usr) + '</div>' +
            (grp ? '<div class="mt-1">' + groupChip(grp) + '</div>' : '') + '</div>' +
          '</div></td>' +
          '<td class="px-3 py-2 align-top"><div class="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap"><i class="pi ' + (g.pod === '*' && g.cabinets === 'ALL' ? 'pi-building' : 'pi-map-marker') + ' text-[10px] text-brand-500"></i>' + esc(scopeTitle(g)) + '</div>' +
            '<div class="text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">' + esc(scopeSub(g)) + ' · ' + sidesText(g.sides) + '</div>' +
            (cabs.length ? '<div class="mt-1 flex flex-wrap gap-1 max-w-[260px]">' + cabs.slice(0, 4).map(c => '<span class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300' + (c === S.cab ? ' ring-1 ring-sky-500' : '') + '">' + esc(c) + '</span>').join('') +
              (cabs.length > 4 ? '<span class="px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-400">+' + (cabs.length - 4) + '</span>' : '') + '</div>' : '') +
          '</td>' +
          '<td class="px-3 py-2 align-top text-center"><span class="font-mono text-sm font-black text-slate-800 dark:text-slate-100">' + lockCount(g) + '</span></td>' +
          '<td class="px-3 py-2 align-top">' + permIcons(g.perms) + '</td>' +
          '<td class="px-3 py-2 align-top">' + durationCell(g) + '</td>' +
          '<td class="px-3 py-2 align-top">' + statusBadge(g) + (g.revokedAt && st === 'revoked' ? '<div class="text-[9px] text-slate-400 mt-1 truncate max-w-[150px]" title="' + esc(g.revokeReason) + '">' + esc(g.revokeReason) + '</div>' : '') + '</td>' +
          '<td class="px-3 py-2 align-top text-right whitespace-nowrap">' +
            (canEdit ? actBtn('edit', g.id, 'pi pi-pencil', 'Yetkiyi düzenle', 'text-sky-600 dark:text-sky-400 hover:bg-sky-500/10') : '') +
            (canEdit && g.mode === 'timed' ? actBtn('extend', g.id, 'pi pi-calendar-clock', 'Süreyi uzat', 'text-amber-600 dark:text-amber-400 hover:bg-amber-500/10') : '') +
            (canEdit ? actBtn('revoke', g.id, 'pi pi-ban', 'Yetkiyi iptal et', 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10') : '') +
            (!canEdit ? actBtn('detail', g.id, 'pi pi-eye', 'Detay', 'text-slate-500 hover:bg-slate-500/10') : '') +
          '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="px-3 py-2 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
        '<span>' + list.length + ' yetki · ' + uniq(list.map(g => g.user)).length + ' kullanıcı</span>' +
        '<span class="flex items-center gap-3">' + PERMS.map(p => '<span class="inline-flex items-center gap-1"><i class="' + p.icon + ' text-[9px]"></i>' + p.label + ' <span class="text-slate-400">(' + p.code + ')</span></span>').join('') + '</span>' +
      '</div></div>';
  }

  // --- 2) Yetki Grupları ------------------------------------------------------
  function renderGroups(host) {
    const q = lc(S.gq.trim());
    const list = DB.groups.filter(g => {
      if (S.cab && !covers(g, S.cab)) return false;
      if (!S.cab && S.pod && !touchesPod(g, S.pod)) return false;
      if (!q) return true;
      return lc(g.name + ' ' + g.desc + ' ' + g.members.map(id => (USER_BY[id] || {}).name).join(' ')).indexOf(q) >= 0;
    });
    if (!list.length) {
      host.innerHTML = kit.emptyState({ icon: 'pi pi-users', message: 'Eşleşen yetki grubu yok', description: 'Arama veya kapsam filtresini değiştirin.' });
      return;
    }
    host.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2">' + list.map(g => {
      const grants = DB.grants.filter(x => x.group === g.id && grantStatus(x) === 'active');
      const members = g.members.map(id => USER_BY[id]).filter(Boolean);
      return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col">' +
        '<div class="p-3 flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80">' +
          '<div class="flex items-start gap-2.5 min-w-0">' +
            '<span class="w-8 h-8 rounded-[2px] border flex items-center justify-center shrink-0 ' + TONE[g.tone] + '"><i class="' + g.icon + ' text-sm"></i></span>' +
            '<div class="min-w-0"><div class="flex items-center gap-1.5"><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 truncate">' + esc(g.name) + '</h3><span class="text-[9px] font-mono text-slate-400">' + esc(g.id) + '</span></div>' +
              '<p class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">' + esc(g.desc) + '</p></div>' +
          '</div>' +
          '<button type="button" data-g-act="edit" data-id="' + g.id + '" title="Grubu düzenle" class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-[2px] text-slate-500 hover:text-sky-600 hover:bg-sky-500/10 cursor-pointer transition-colors"><i class="pi pi-pencil text-[11px]"></i></button>' +
        '</div>' +
        '<div class="p-3 space-y-2.5 flex-1">' +
          '<div class="grid grid-cols-3 gap-2 text-center">' +
            [['Üye', members.length], ['Aktif Yetki', grants.length], ['Kilit', lockCount(g)]].map(k =>
              '<div class="rounded-[2px] bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 py-1.5"><div class="text-base font-black text-slate-900 dark:text-slate-100 leading-none">' + k[1] + '</div><div class="text-[9px] font-bold uppercase tracking-wider text-slate-400 mt-1">' + k[0] + '</div></div>').join('') +
          '</div>' +
          '<div class="flex items-center justify-between gap-2 text-[10.5px]"><span class="' + LABEL + '">Kapsam</span><span class="font-bold text-slate-700 dark:text-slate-200 text-right">' + esc(scopeTitle(g)) + ' · ' + esc(scopeSub(g)) + ' · ' + sidesText(g.sides) + '</span></div>' +
          '<div class="flex items-center justify-between gap-2 text-[10.5px]"><span class="' + LABEL + '">Süre Şablonu</span><span class="font-bold text-slate-700 dark:text-slate-200">' + (g.mode === 'timed' ? '<i class="pi pi-stopwatch text-amber-500 text-[10px] mr-1"></i>Süreli · ' + g.hours + ' saat' : '<i class="pi pi-verified text-emerald-500 text-[10px] mr-1"></i>Kalıcı') + '</span></div>' +
          '<div class="flex flex-wrap gap-1">' + permChips(g.perms) + '</div>' +
          '<div class="flex flex-wrap gap-1.5 pt-1">' + (members.length ? members.map(u =>
            '<span class="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-[2px] bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-700 dark:text-slate-200" title="' + esc(u.dept) + '">' +
              '<span class="w-5 h-5 rounded-[2px] ' + (AVATAR[u.role] || 'bg-slate-600') + ' text-white text-[8.5px] font-bold flex items-center justify-center">' + esc(initials(u.name)) + '</span>' + esc(u.name) + '</span>').join('')
            : '<span class="text-[10px] text-slate-400 italic">Henüz üye yok</span>') + '</div>' +
        '</div>' +
        '<div class="px-3 py-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-end gap-1.5">' +
          btn({ variant: 'ghost', size: 'sm', icon: 'pi pi-user-edit', label: 'Üyeler', attrs: 'data-g-act="members" data-id="' + g.id + '"' }) +
          btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-key', label: 'Yetki Ata', attrs: 'data-g-act="assign" data-id="' + g.id + '"' }) +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // --- 3) Erişim Kayıtları ----------------------------------------------------
  function scopedLogs(ignoreResult) {
    const now = Date.now();
    const lim = S.period === '24h' ? DAY : S.period === '7d' ? 7 * DAY : Infinity;
    const q = lc(S.lq.trim());
    return allLogs().filter(l => {
      if (now - l.tim > lim) return false;
      if (S.cab && l.cab !== S.cab) return false;
      if (!S.cab && S.pod && podOf(l.cab) !== S.pod) return false;
      if (!ignoreResult && S.result !== 'all' && l.result !== S.result) return false;
      if (!q) return true;
      return lc([l.name, l.card, l.dept, l.cab, podOf(l.cab), l.event, l.note, l.ref].join(' ')).indexOf(q) >= 0;
    }).sort((a, b) => b.tim - a.tim);
  }
  const RESULT = {
    granted: { label: 'İzin Verildi', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40', icon: 'pi pi-check' },
    denied: { label: 'Reddedildi', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/40', icon: 'pi pi-ban' },
    system: { label: 'Sistem', cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700', icon: 'pi pi-cog' }
  };
  const resultBadge = r => { const m = RESULT[r] || RESULT.system; return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-bold border whitespace-nowrap ' + m.cls + '"><i class="' + m.icon + ' text-[8px]"></i>' + m.label + '</span>'; };

  function renderLogs(host) {
    const list = scopedLogs(false);
    if (!list.length) {
      host.innerHTML = kit.emptyState({ icon: 'pi pi-history', message: 'Bu filtrede erişim kaydı yok', description: 'Zaman aralığını genişletin veya kapsamı temizleyin.' });
      return;
    }
    const shown = list.slice(0, S.logLimit);
    host.innerHTML =
      '<div class="w-full bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden shadow-2xs flex flex-col"><div class="overflow-x-auto custom-scrollbar">' +
      '<table class="w-full text-left border-collapse text-xs"><thead><tr class="border-b border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">' +
        '<th class="px-3 py-2.5">Zaman</th><th class="px-3 py-2.5">Personel / Kart</th><th class="px-3 py-2.5">Kabin</th><th class="px-3 py-2.5">Kapak</th><th class="px-3 py-2.5">Olay</th><th class="px-3 py-2.5">Yetki Referansı</th><th class="px-3 py-2.5 text-right">Sonuç</th>' +
      '</tr></thead><tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' +
      shown.map(l => {
        const g = l.ref ? grantById(l.ref) : null;
        const grp = g ? GROUP_BY(g.group) : null;
        return '<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors' + (l.result === 'denied' ? ' bg-rose-500/5' : '') + '">' +
          '<td class="px-3 py-1.5 font-mono text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap">' + fmtLog(l.tim) + '</td>' +
          '<td class="px-3 py-1.5"><div class="font-bold text-[11px] ' + (l.result === 'denied' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200') + ' whitespace-nowrap">' + esc(l.name) +
              (l.test ? '<span class="ml-1.5 px-1 py-0.5 rounded-[2px] text-[8.5px] font-extrabold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/30">TEST</span>' : '') + '</div>' +
            '<div class="text-[9px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[220px]">' + esc(l.card) + ' · ' + esc(l.dept) + '</div></td>' +
          '<td class="px-3 py-1.5 whitespace-nowrap"><button type="button" data-log-cab="' + esc(l.cab) + '" title="Kabin kapsamını seç" class="font-mono font-black text-[11px] text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer">' + esc(l.cab) + '</button>' +
            '<span class="ml-1.5 text-[9px] font-mono text-slate-400">' + esc(podOf(l.cab)) + '</span></td>' +
          '<td class="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 whitespace-nowrap">' + sideShort(l.side) + '</td>' +
          '<td class="px-3 py-1.5 text-[10.5px] text-slate-700 dark:text-slate-300">' + esc(l.event) + (l.note ? '<div class="text-[9.5px] text-slate-400">' + esc(l.note) + '</div>' : '') + '</td>' +
          '<td class="px-3 py-1.5 whitespace-nowrap">' + (g
            ? '<button type="button" data-log-grant="' + esc(g.id) + '" class="font-mono text-[10.5px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer">' + esc(g.id) + '</button>' + (grp ? '<div class="text-[9px] text-slate-400">' + esc(grp.name) + '</div>' : '')
            : '<span class="text-[10px] text-slate-400">—</span>') + '</td>' +
          '<td class="px-3 py-1.5 text-right">' + resultBadge(l.result) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="px-3 py-2 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">' +
        '<span>' + shown.length + ' / ' + list.length + ' kayıt</span>' +
        (list.length > shown.length ? '<button type="button" data-log-more class="px-2.5 py-1 rounded-[2px] font-sans font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 cursor-pointer">Daha fazla göster (' + Math.min(60, list.length - shown.length) + ')</button>' : '<span>Tüm kayıtlar gösteriliyor</span>') +
      '</div></div>';
  }

  // İçerik olayları (tek dinleyici)
  document.getElementById('la-content').addEventListener('click', e => {
    const ra = e.target.closest('[data-row-act]');
    if (ra) {
      e.stopPropagation();
      const g = grantById(ra.getAttribute('data-id'));
      const act = ra.getAttribute('data-row-act');
      if (!g) return;
      if (act === 'edit') openWizard({ grant: g });
      else if (act === 'extend') extendDialog(g);
      else if (act === 'revoke') revokeDialog(g);
      else detailDialog(g);
      return;
    }
    const row = e.target.closest('[data-grant]');
    if (row) { const g = grantById(row.getAttribute('data-grant')); if (g) detailDialog(g); return; }
    const ga = e.target.closest('[data-g-act]');
    if (ga) {
      const grp = GROUP_BY(ga.getAttribute('data-id'));
      const act = ga.getAttribute('data-g-act');
      if (!grp) return;
      if (act === 'edit') groupDialog(grp);
      else if (act === 'members') membersDialog(grp);
      else openWizard({ fromGroup: grp });
      return;
    }
    const lg = e.target.closest('[data-log-grant]');
    if (lg) { const g = grantById(lg.getAttribute('data-log-grant')); if (g) detailDialog(g); return; }
    const lcab = e.target.closest('[data-log-cab]');
    if (lcab) { const code = lcab.getAttribute('data-log-cab'); setScope(podOf(code), code); return; }
    if (e.target.closest('[data-log-more]')) { S.logLimit += 60; renderContent(); }
  });

  // ---------------------------------------------------------------------------
  // Dışa aktarım
  // ---------------------------------------------------------------------------
  function exportGrants() {
    kit.exportExcel('kilit-yetkileri', [
      { header: 'Yetki No', value: g => g.id },
      { header: 'Kullanıcı', value: g => USER_BY[g.user].name },
      { header: 'Sicil', value: g => USER_BY[g.user].id },
      { header: 'Kart', value: g => USER_BY[g.user].card },
      { header: 'Departman', value: g => USER_BY[g.user].dept },
      { header: 'Grup', value: g => (GROUP_BY(g.group) || {}).name || '' },
      { header: 'Kapsam', value: g => scopeTitle(g) + ' — ' + scopeSub(g) },
      { header: 'Kabinler', value: g => (g.cabinets === 'ALL' ? 'Tümü' : g.cabinets.join(', ')) },
      { header: 'Kapak', value: g => sidesText(g.sides) },
      { header: 'Kilit Sayısı', value: g => lockCount(g) },
      { header: 'İzinler', value: g => permNames(g.perms) },
      { header: 'Süre', value: g => (g.mode === 'timed' ? fmtShort(g.start) + ' - ' + fmtShort(g.end) : 'Kalıcı') },
      { header: 'Durum', value: g => STATUS[grantStatus(g)].label },
      { header: 'İş Emri', value: g => g.wo || '' },
      { header: 'Gerekçe', value: g => g.reason || '' },
      { header: 'Tanımlayan', value: g => g.createdBy }
    ], visibleGrants());
  }
  function exportLogs() {
    kit.exportExcel('kilit-erisim-kayitlari', [
      { header: 'Zaman', value: l => fmtShort(l.tim) },
      { header: 'Personel', value: l => l.name },
      { header: 'Kart', value: l => l.card },
      { header: 'Departman', value: l => l.dept },
      { header: 'Kabin', value: l => l.cab },
      { header: 'POD', value: l => podOf(l.cab) },
      { header: 'Kapak', value: l => sideShort(l.side) },
      { header: 'Olay', value: l => l.event + (l.note ? ' (' + l.note + ')' : '') },
      { header: 'Yetki No', value: l => l.ref || '' },
      { header: 'Sonuç', value: l => (RESULT[l.result] || RESULT.system).label }
    ], scopedLogs(false));
  }

  // ---------------------------------------------------------------------------
  // Yetki detayı
  // ---------------------------------------------------------------------------
  function detailDialog(g) {
    const u = USER_BY[g.user];
    const grp = GROUP_BY(g.group);
    const st = grantStatus(g);
    const cabs = grantCabs(g);
    const logs = allLogs().filter(l => l.user === g.user && covers(g, l.cab, l.side)).sort((a, b) => b.tim - a.tim).slice(0, 8);
    const row = (k, v) => '<div class="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80"><span class="' + LABEL + ' shrink-0">' + k + '</span><span class="text-[11px] font-semibold text-slate-800 dark:text-slate-200 text-right">' + v + '</span></div>';
    const body =
      '<div class="flex items-center gap-3 mb-3">' + avatar(u, true) +
        '<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 flex-wrap"><span class="text-sm font-extrabold text-slate-900 dark:text-slate-100">' + esc(u.name) + '</span>' + roleBadge(u) + (grp ? groupChip(grp) : '') + '</div>' +
          '<div class="text-[10.5px] text-slate-500 dark:text-slate-400">' + esc(u.dept) + ' · <span class="font-mono">' + esc(u.usr) + ' · ' + esc(u.id) + '</span></div></div>' +
        statusBadge(g) +
      '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-x-5">' +
        '<div>' +
          row('Kart', '<span class="font-mono">' + esc(u.card) + '</span>') +
          row('Kapsam', esc(scopeTitle(g)) + ' · ' + esc(scopeSub(g))) +
          row('Kapak', sidesText(g.sides) + ' · ' + lockCount(g) + ' kilit') +
          row('İzinler', '<span class="inline-flex flex-wrap justify-end gap-1">' + permChips(g.perms) + '</span>') +
        '</div><div>' +
          row('Süre', g.mode === 'timed' ? fmtShort(g.start) + ' → ' + fmtShort(g.end) + '<div class="text-[10px] font-mono ' + remainText(g).cls + '">' + remainText(g).txt + '</div>' : 'Kalıcı') +
          row('Otomatik kilit', g.perms.indexOf('unlock') >= 0 ? g.autoRelock + ' sn sonra' + (g.woReq ? ' · iş emri zorunlu' : '') : '—') +
          row('İş Emri', g.wo ? '<span class="font-mono">' + esc(g.wo) + '</span>' : '—') +
          row('Gerekçe', esc(g.reason || '—')) +
        '</div>' +
      '</div>' +
      '<div class="mt-3"><div class="' + LABEL + ' mb-1.5">Kapsamdaki kabinler (' + cabs.length + ')</div>' +
        '<div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar">' + cabs.slice(0, 80).map(c =>
          '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9.5px] font-mono font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"><span class="w-1.5 h-1.5 rounded-full ' + DOT[c.lock.overallState] + '"></span>' + esc(c.code) + '</span>').join('') +
          (cabs.length > 80 ? '<span class="text-[9.5px] font-mono text-slate-400 px-1">+' + (cabs.length - 80) + '</span>' : '') + '</div></div>' +
      '<div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div><div class="' + LABEL + ' mb-1.5">Yetki geçmişi</div><ol class="space-y-1.5">' + g.history.slice().reverse().map(h =>
          '<li class="flex items-start gap-2"><span class="mt-1 w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0"></span><div><div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">' + esc(h.action) + '</div>' +
            '<div class="text-[9.5px] font-mono text-slate-400">' + fmtShort(h.t) + ' · ' + esc(h.by) + (h.note ? ' · ' + esc(h.note) : '') + '</div></div></li>').join('') + '</ol></div>' +
        '<div><div class="' + LABEL + ' mb-1.5">Son erişimler</div>' + (logs.length ? '<div class="space-y-1">' + logs.map(l =>
          '<div class="flex items-center justify-between gap-2 text-[10.5px]"><span class="font-mono text-slate-400 whitespace-nowrap">' + fmtLog(l.tim) + '</span><span class="font-mono font-bold text-slate-700 dark:text-slate-200">' + esc(l.cab) + ' ' + sideShort(l.side) + '</span><span class="truncate text-slate-500 dark:text-slate-400 flex-1">' + esc(l.event) + '</span>' + resultBadge(l.result) + '</div>').join('') + '</div>'
          : '<div class="text-[10.5px] text-slate-400">Bu yetki kapsamında kayıtlı erişim yok.</div>') + '</div>' +
      '</div>' +
      (st !== 'revoked' ? '<div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap justify-end gap-2">' +
        btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-pencil', label: 'Düzenle', attrs: 'data-dd="edit"' }) +
        (g.mode === 'timed' ? btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-calendar-clock', label: 'Süreyi Uzat', attrs: 'data-dd="extend"' }) : '') +
        btn({ variant: 'danger', size: 'sm', icon: 'pi pi-ban', label: 'Yetkiyi İptal Et', attrs: 'data-dd="revoke"' }) +
      '</div>' : '');
    const dlg = dialog({ title: 'Yetki Detayı — ' + g.id, subtitle: 'Tanımlayan: ' + g.createdBy + ' · ' + fmtShort(g.createdAt), variant: 'info', maxWidth: 'max-w-3xl', body, showCancel: false, confirmLabel: 'Kapat' });
    dlg.body.addEventListener('click', e => {
      const b = e.target.closest('[data-dd]');
      if (!b) return;
      const a = b.getAttribute('data-dd');
      dlg.close();
      if (a === 'edit') openWizard({ grant: g }); else if (a === 'extend') extendDialog(g); else revokeDialog(g);
    });
  }

  // ---------------------------------------------------------------------------
  // İptal / Süre uzatma
  // ---------------------------------------------------------------------------
  function grantSummaryBox(g) {
    const u = USER_BY[g.user];
    return '<div class="flex items-center gap-2.5 p-2.5 rounded-[2px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 mb-3">' + avatar(u) +
      '<div class="min-w-0 flex-1"><div class="text-xs font-bold text-slate-900 dark:text-slate-100">' + esc(u.name) + ' <span class="font-mono text-[10px] text-slate-400">' + esc(g.id) + '</span></div>' +
      '<div class="text-[10px] text-slate-500 dark:text-slate-400">' + esc(scopeTitle(g)) + ' · ' + esc(scopeSub(g)) + ' · ' + lockCount(g) + ' kilit · ' + esc(permNames(g.perms)) + '</div></div></div>';
  }
  function revokeDialog(g) {
    const REASONS = ['Görev / departman değişikliği', 'Bakım çalışması tamamlandı', 'Güvenlik ihlali şüphesi', 'Sözleşme veya proje sona erdi', 'Kullanıcı hesabı pasife alındı', 'Diğer'];
    dialog({
      title: 'Yetkiyi İptal Et', subtitle: 'İptal edilen yetki kilit denetleyicilerinden anında kaldırılır.', variant: 'danger', confirmLabel: 'Yetkiyi İptal Et', confirmIcon: 'pi pi-ban',
      body: grantSummaryBox(g) +
        '<div class="space-y-3">' +
          kit.formField({ label: 'İptal nedeni', required: true, control: kit.select('data-rv="reason"', REASONS, REASONS[0]) }) +
          kit.formField({ label: 'Açıklama', hint: 'isteğe bağlı', control: '<textarea data-rv="note" rows="2" class="' + FIELD + ' resize-none" placeholder="Denetim kaydına eklenecek not"></textarea>' }) +
          '<div class="flex items-start gap-2 p-2 rounded-[2px] bg-rose-500/5 border border-rose-500/30 text-[10.5px] text-rose-700 dark:text-rose-300"><i class="pi pi-exclamation-triangle mt-0.5"></i>' +
            '<span>' + esc(USER_BY[g.user].name) + ' kartı ' + lockCount(g) + ' kilitte geçersiz olacak. Bu işlem denetim kaydına işlenir.</span></div>' +
        '</div>',
      onConfirm: host => {
        const reason = host.querySelector('[data-rv="reason"]').value;
        const note = host.querySelector('[data-rv="note"]').value.trim();
        const t = Date.now();
        g.revokedAt = t; g.revokedBy = me(); g.revokeReason = reason + (note ? ' — ' + note : '');
        g.history.push({ t, by: me(), action: 'Yetki iptal edildi', note: g.revokeReason });
        pushAudit('Kilit Yetkisi İptal: ' + g.id + ' — ' + USER_BY[g.user].name + ' · ' + scopeTitle(g) + ' (' + lockCount(g) + ' kilit) · Neden: ' + reason, 'Kullanıcı ' + USER_BY[g.user].name + ' (' + g.user + ')');
        persist();
        renderAll();
        toast(g.id + ' iptal edildi · ' + USER_BY[g.user].name, 'warning', 'Yetki İptali');
        simulateSync([g.id]);
      }
    });
  }
  function extendDialog(g) {
    const OPTS = [[2, '+2 saat'], [8, '+8 saat'], [24, '+24 saat'], [72, '+3 gün'], [168, '+7 gün']];
    const base = () => Math.max(g.end, Date.now());
    const dlg = dialog({
      title: 'Süreyi Uzat', subtitle: 'Mevcut bitiş: ' + fmtShort(g.end), variant: 'warning', confirmLabel: 'Süreyi Uzat', confirmIcon: 'pi pi-calendar-clock',
      body: grantSummaryBox(g) +
        '<div class="' + LABEL + ' mb-1.5">Uzatma süresi</div>' +
        '<div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5" data-ext-opts>' + OPTS.map((o, i) =>
          '<button type="button" data-ext="' + o[0] + '" class="la-choice px-2 py-2 rounded-[2px] border text-[11px] font-bold transition-colors cursor-pointer ' + (i === 1 ? 'is-on' : '') + '">' + o[1] + '</button>').join('') + '</div>' +
        '<div class="mt-3 text-[11px] text-slate-600 dark:text-slate-300">Yeni bitiş: <span data-ext-end class="font-mono font-bold text-amber-600 dark:text-amber-400">' + fmtShort(base() + 8 * HOUR) + '</span></div>' +
        (grantStatus(g) === 'expired' ? '<div class="mt-2 text-[10.5px] text-orange-600 dark:text-orange-400"><i class="pi pi-info-circle mr-1"></i>Süresi dolan yetki uzatma ile yeniden etkinleşir.</div>' : ''),
      onConfirm: host => {
        const on = host.querySelector('[data-ext].is-on');
        const h = on ? Number(on.getAttribute('data-ext')) : 8;
        const t = Date.now();
        const oldEnd = g.end;
        g.end = base() + h * HOUR;
        if (g.start > t && g.start > g.end) g.start = t;
        g.updatedAt = t; g.updatedBy = me();
        g.history.push({ t, by: me(), action: 'Süre uzatıldı', note: fmtShort(oldEnd) + ' → ' + fmtShort(g.end) });
        pushAudit('Kilit Yetkisi Süre Uzatma: ' + g.id + ' — ' + USER_BY[g.user].name + ' · yeni bitiş ' + fmtShort(g.end), 'Kullanıcı ' + USER_BY[g.user].name + ' (' + g.user + ')');
        persist();
        renderAll();
        toast(g.id + ' bitiş: ' + fmtShort(g.end), 'success', 'Süre Uzatıldı');
        simulateSync([g.id]);
      }
    });
    dlg.body.addEventListener('click', e => {
      const b = e.target.closest('[data-ext]');
      if (!b) return;
      dlg.body.querySelectorAll('[data-ext]').forEach(x => x.classList.toggle('is-on', x === b));
      dlg.body.querySelector('[data-ext-end]').textContent = fmtShort(base() + Number(b.getAttribute('data-ext')) * HOUR);
    });
  }

  // ---------------------------------------------------------------------------
  // Yetki grupları: üyeler, düzenleme, yeni grup
  // ---------------------------------------------------------------------------
  function grantFromGroup(grp, userId) {
    const t = Date.now();
    const g = {
      id: nextId(), user: userId, group: grp.id, pod: grp.pod, cabinets: grp.cabinets === 'ALL' ? 'ALL' : grp.cabinets.slice(), sides: grp.sides.slice(), perms: grp.perms.slice(),
      mode: grp.mode, start: grp.mode === 'timed' ? t : null, end: grp.mode === 'timed' ? t + grp.hours * HOUR : null, window: false, wo: '', reason: 'Grup üyeliği: ' + grp.name, autoRelock: 60, woReq: false,
      createdBy: me(), createdAt: t, updatedBy: '', updatedAt: null, revokedAt: null, revokedBy: '', revokeReason: '', sync: 'ok',
      history: [{ t, by: me(), action: 'Yetki tanımlandı', note: 'Grup: ' + grp.id }]
    };
    DB.grants.push(g);
    return g;
  }
  function membersDialog(grp) {
    const sel = new Set(grp.members);
    const list = () => USERS.map(u => {
      const on = sel.has(u.id);
      return '<label class="la-choice flex items-center gap-2.5 px-2 py-1.5 rounded-[2px] border cursor-pointer transition-colors ' + (on ? 'is-on' : '') + (u.passive ? ' opacity-50' : '') + '" data-mem-row="' + u.id + '">' +
        '<input type="checkbox" data-mem="' + u.id + '"' + (on ? ' checked' : '') + (u.passive ? ' disabled' : '') + ' class="w-3.5 h-3.5 accent-sky-600" />' + avatar(u) +
        '<div class="min-w-0 flex-1"><div class="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">' + esc(u.name) + (u.passive ? ' <span class="text-[9px] text-slate-400">(pasif)</span>' : '') + '</div><div class="text-[9.5px] text-slate-500 dark:text-slate-400 truncate">' + esc(u.dept) + '</div></div>' + roleBadge(u) + '</label>';
    }).join('');
    const dlg = dialog({
      title: 'Grup Üyeleri — ' + grp.name, subtitle: 'Eklenen üyelere grup şablonuyla yetki tanımlanır; çıkarılanların grup yetkileri iptal edilir.', variant: 'info', maxWidth: 'max-w-xl', confirmLabel: 'Kaydet', confirmIcon: 'pi pi-check',
      body: '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1" data-mem-list>' + list() + '</div>',
      onConfirm: () => {
        const added = [...sel].filter(id => grp.members.indexOf(id) < 0);
        const removed = grp.members.filter(id => !sel.has(id));
        const t = Date.now();
        const created = added.map(id => grantFromGroup(grp, id).id);
        let revoked = 0;
        DB.grants.forEach(g => {
          if (g.group === grp.id && removed.indexOf(g.user) >= 0 && grantStatus(g) !== 'revoked') {
            g.revokedAt = t; g.revokedBy = me(); g.revokeReason = 'Gruptan çıkarıldı (' + grp.name + ')';
            g.history.push({ t, by: me(), action: 'Yetki iptal edildi', note: g.revokeReason });
            revoked++;
          }
        });
        grp.members = [...sel];
        if (added.length || removed.length) pushAudit('Kilit Yetki Grubu Üyelik: ' + grp.name + ' — +' + added.length + ' / -' + removed.length + ' üye', 'Yetki Grubu ' + grp.id);
        persist();
        renderAll();
        toast(added.length + ' üye eklendi, ' + removed.length + ' üye çıkarıldı · ' + created.length + ' yetki oluşturuldu, ' + revoked + ' yetki iptal edildi', 'success', grp.name);
        if (created.length) simulateSync(created);
      }
    });
    dlg.body.addEventListener('change', e => {
      const cb = e.target.closest('[data-mem]');
      if (!cb) return;
      const id = cb.getAttribute('data-mem');
      if (cb.checked) sel.add(id); else sel.delete(id);
      const row = dlg.body.querySelector('[data-mem-row="' + id + '"]');
      if (row) row.classList.toggle('is-on', cb.checked);
    });
  }
  function groupDialog(grp) {
    const isNew = !grp;
    const TONES = [['sky', 'Mavi'], ['emerald', 'Yeşil'], ['amber', 'Sarı'], ['rose', 'Kırmızı'], ['purple', 'Mor'], ['slate', 'Gri']];
    const g = grp || { name: '', desc: '', tone: 'sky', icon: 'pi pi-users', pod: S.pod || '*', cabinets: 'ALL', sides: ['front', 'rear'], perms: ['view'], mode: 'permanent', hours: 8, members: [] };
    const permBoxes = PERMS.map(p =>
      '<label class="flex items-center gap-2 px-2 py-1.5 rounded-[2px] border border-slate-200 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60">' +
        '<input type="checkbox" data-gp="' + p.key + '"' + (g.perms.indexOf(p.key) >= 0 ? ' checked' : '') + (p.key === 'view' ? ' checked disabled' : '') + ' class="w-3.5 h-3.5 accent-sky-600" />' +
        '<i class="' + p.icon + ' text-[11px] text-slate-500"></i><span class="text-[11px] font-bold">' + p.label + '</span><span class="ml-auto text-[9px] font-mono text-slate-400">' + p.code + '</span></label>').join('');
    const podLocked = !isNew && g.cabinets !== 'ALL';
    dialog({
      title: isNew ? 'Yeni Yetki Grubu' : 'Grubu Düzenle — ' + g.name,
      subtitle: isNew ? 'Grup bir kapsam + izin + süre şablonudur; üyeler bu şablonu devralır.' : 'İzin değişiklikleri grubun aktif yetkilerine uygulanır.',
      variant: 'info', maxWidth: 'max-w-xl', confirmLabel: isNew ? 'Grubu Oluştur' : 'Kaydet', confirmIcon: 'pi pi-check',
      body: '<div class="space-y-3">' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><div class="sm:col-span-2">' + kit.formField({ label: 'Grup adı', required: true, control: '<input data-gf="name" value="' + esc(g.name) + '" class="' + FIELD + '" placeholder="Örn. Gece Vardiyası Operasyon" />' }) + '</div>' +
          kit.formField({ label: 'Renk', control: kit.select('data-gf="tone"', TONES.map(t => ({ value: t[0], label: t[1] })), g.tone) }) + '</div>' +
        kit.formField({ label: 'Açıklama', control: '<input data-gf="desc" value="' + esc(g.desc) + '" class="' + FIELD + '" placeholder="Grubun amacı ve erişim kuralı" />' }) +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
          kit.formField({ label: 'Kapsam (POD)', hint: podLocked ? 'kabin bazlı' : '', control: podLocked ? '<div class="' + FIELD + ' opacity-70">' + esc(scopeTitle(g)) + ' · ' + esc(scopeSub(g)) + '</div>' : kit.select('data-gf="pod"', [{ value: '*', label: 'Tüm Salon' }].concat(PODS.map(p => ({ value: p, label: p }))), g.pod) }) +
          kit.formField({ label: 'Kapak', control: kit.select('data-gf="sides"', [{ value: 'both', label: 'Ön + Arka' }, { value: 'front', label: 'Yalnız ön' }, { value: 'rear', label: 'Yalnız arka' }], g.sides.length === 2 ? 'both' : g.sides[0]) }) +
          kit.formField({ label: 'Süre şablonu', control: kit.select('data-gf="mode"', [{ value: 'permanent', label: 'Kalıcı' }, { value: '2', label: 'Süreli · 2 saat' }, { value: '4', label: 'Süreli · 4 saat' }, { value: '8', label: 'Süreli · 8 saat' }, { value: '24', label: 'Süreli · 24 saat' }], g.mode === 'permanent' ? 'permanent' : String(g.hours)) }) +
        '</div>' +
        '<div><div class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">İşlem izinleri</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">' + permBoxes + '</div></div>' +
      '</div>',
      onConfirm: host => {
        const val = k => host.querySelector('[data-gf="' + k + '"]');
        const name = val('name').value.trim();
        if (name.length < 3) { toast('Grup adı en az 3 karakter olmalı.', 'error', 'Doğrulama'); return false; }
        const perms = PERMS.map(p => p.key).filter(k => k === 'view' || host.querySelector('[data-gp="' + k + '"]').checked);
        const sidesV = val('sides').value;
        const modeV = val('mode').value;
        const t = Date.now();
        const patch = { name, desc: val('desc').value.trim() || 'Özel yetki grubu', tone: val('tone').value, perms, sides: sidesV === 'both' ? ['front', 'rear'] : [sidesV], mode: modeV === 'permanent' ? 'permanent' : 'timed', hours: modeV === 'permanent' ? 0 : Number(modeV) };
        if (!podLocked) patch.pod = val('pod').value;
        if (isNew) {
          const n = DB.groups.reduce((m, x) => Math.max(m, Number(x.id.replace('GRP-', '')) || 0), 0) + 1;
          const ng = Object.assign({ id: 'GRP-' + pad(n), icon: 'pi pi-users', cabinets: 'ALL', members: [], createdAt: t }, patch);
          DB.groups.push(ng);
          pushAudit('Kilit Yetki Grubu Oluşturuldu: ' + ng.name + ' (' + permNames(perms) + ')', 'Yetki Grubu ' + ng.id);
          persist();
          renderAll();
          toast(ng.name + ' oluşturuldu. Üye ekleyerek yetki tanımlayabilirsiniz.', 'success', 'Yeni Grup');
          setTimeout(() => membersDialog(ng), 150);
        } else {
          Object.assign(grp, patch);
          const affected = DB.grants.filter(x => x.group === grp.id && grantStatus(x) !== 'revoked');
          affected.forEach(x => {
            x.perms = perms.slice(); x.sides = patch.sides.slice(); x.updatedAt = t; x.updatedBy = me();
            x.history.push({ t, by: me(), action: 'Grup şablonu uygulandı', note: permNames(perms) });
          });
          pushAudit('Kilit Yetki Grubu Güncellendi: ' + grp.name + ' — ' + permNames(perms) + ' · ' + affected.length + ' yetki', 'Yetki Grubu ' + grp.id);
          persist();
          renderAll();
          toast(affected.length + ' aktif yetkiye uygulandı.', 'success', grp.name + ' güncellendi');
          if (affected.length) simulateSync(affected.map(x => x.id));
        }
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Erişim testi (yetki doğrulama simülasyonu — kilide komut gönderilmez)
  // ---------------------------------------------------------------------------
  function evaluate(userId, code, side, perm) {
    const u = USER_BY[userId];
    const t = Date.now();
    if (u.passive) return { ok: false, why: 'Kullanıcı hesabı pasif — kart tüm kilitlerde geçersiz.' };
    const inScope = DB.grants.filter(g => g.user === userId && covers(g, code, side));
    if (!inScope.length) return { ok: false, why: code + ' ' + sideShort(side).toLocaleLowerCase('tr-TR') + ' kapak kilidi kullanıcının yetki kapsamında değil.' };
    const act = inScope.filter(g => grantStatus(g, t) === 'active');
    if (!act.length) {
      const g = inScope.slice().sort((a, b) => ST_ORDER[grantStatus(a)] - ST_ORDER[grantStatus(b)])[0];
      const st = grantStatus(g, t);
      if (st === 'scheduled') return { ok: false, grant: g, why: g.id + ' henüz başlamadı (başlangıç ' + fmtShort(g.start) + ').' };
      if (st === 'expired') return { ok: false, grant: g, why: g.id + ' yetkisinin süresi doldu (bitiş ' + fmtShort(g.end) + ').' };
      return { ok: false, grant: g, why: g.id + ' iptal edilmiş: ' + g.revokeReason };
    }
    const withPerm = act.find(g => g.perms.indexOf(perm) >= 0);
    if (!withPerm) return { ok: false, grant: act[0], why: '"' + PERM_BY[perm].label + '" izni tanımlı değil (mevcut: ' + permNames(act[0].perms) + ').' };
    if (withPerm.window) {
      const h = new Date(t).getHours();
      if (h < 8 || h >= 18) return { ok: false, grant: withPerm, why: withPerm.id + ' yalnızca mesai saatlerinde (08:00–18:00) geçerli.' };
    }
    const grp = GROUP_BY(withPerm.group);
    return { ok: true, grant: withPerm, why: withPerm.id + (grp ? ' (' + grp.name + ')' : '') + ' kapsamında ' + PERM_BY[perm].label.toLocaleLowerCase('tr-TR') + ' izni geçerli.' };
  }
  function testDialog() {
    const firstCab = S.cab || (S.pod ? CABS_OF[S.pod][0].code : '1AZ39');
    const cabOptions = pod => CABS_OF[pod].map(c => ({ value: c.code, label: c.code + ' — ' + c.customer }));
    const dlg = dialog({
      title: 'Erişim Testi', subtitle: 'Kart/kullanıcı için yetki kararını doğrular. Kilide komut gönderilmez.', variant: 'info', maxWidth: 'max-w-xl',
      confirmLabel: 'Testi Çalıştır', confirmIcon: 'pi pi-play-circle', cancelLabel: 'Kapat',
      body: '<div class="space-y-3">' +
        kit.formField({ label: 'Kullanıcı / Kart', control: kit.select('data-t="user"', USERS.map(u => ({ value: u.id, label: u.name + ' · ' + u.card + (u.passive ? ' (pasif)' : '') })), uid('selin.aydin')) }) +
        '<div class="grid grid-cols-2 gap-3">' +
          kit.formField({ label: 'POD', control: kit.select('data-t="pod"', PODS, podOf(firstCab)) }) +
          kit.formField({ label: 'Kabin', control: '<div data-t-cabwrap>' + kit.select('data-t="cab"', cabOptions(podOf(firstCab)), firstCab) + '</div>' }) +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          kit.formField({ label: 'Kapak', control: kit.select('data-t="side"', [{ value: 'front', label: 'Ön kapak kilidi' }, { value: 'rear', label: 'Arka kapak kilidi' }], 'front') }) +
          kit.formField({ label: 'İşlem', control: kit.select('data-t="perm"', PERMS.map(p => ({ value: p.key, label: p.label })), 'unlock') }) +
        '</div>' +
        '<div data-t-result></div>' +
      '</div>',
      onConfirm: host => {
        const v = k => host.querySelector('[data-t="' + k + '"]').value;
        const userId = v('user'), code = v('cab'), side = v('side'), perm = v('perm');
        const r = evaluate(userId, code, side, perm);
        const u = USER_BY[userId];
        host.querySelector('[data-t-result]').innerHTML =
          '<div class="flex items-start gap-2.5 p-3 rounded-[2px] border ' + (r.ok ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-rose-500/10 border-rose-500/40') + ' animate-fade-in">' +
            '<i class="' + (r.ok ? 'pi pi-check-circle text-emerald-500' : 'pi pi-times-circle text-rose-500') + ' text-lg mt-0.5"></i>' +
            '<div><div class="text-xs font-extrabold ' + (r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300') + '">' + (r.ok ? 'ERİŞİM İZNİ VERİLİR' : 'ERİŞİM REDDEDİLİR') + '</div>' +
            '<div class="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">' + esc(r.why) + '</div>' +
            '<div class="text-[9.5px] font-mono text-slate-400 mt-1">' + esc(u.name) + ' · ' + esc(u.card) + ' → ' + esc(code) + ' ' + sideShort(side) + ' · ' + PERM_BY[perm].code + '</div></div>' +
          '</div>';
        DB.extraLogs.push({ id: 'T' + Date.now(), tim: Date.now(), user: userId, name: u.name, card: u.card, dept: u.dept, cab: code, side, event: 'Erişim testi — ' + PERM_BY[perm].label, result: r.ok ? 'granted' : 'denied', ref: r.grant ? r.grant.id : '', note: r.why, test: true });
        persist();
        renderSummary(); renderTabs();
        if (S.tab === 'logs') { renderToolbar(); renderContent(); }
        return false;
      }
    });
    dlg.body.addEventListener('change', e => {
      if (!e.target.matches('[data-t="pod"]')) return;
      dlg.body.querySelector('[data-t-cabwrap]').innerHTML = kit.select('data-t="cab"', cabOptions(e.target.value), CABS_OF[e.target.value][0].code);
    });
  }

  // ---------------------------------------------------------------------------
  // Yeni Yetki sihirbazı
  // Adımlar: 1 Kullanıcı Seçimi → 2 POD/Kabin/Kilit → 3 İşlem İzinleri → 4 Erişim Süresi
  // ---------------------------------------------------------------------------
  const STEPS = [
    { n: 1, label: 'Kullanıcı Seçimi', icon: 'pi pi-users' },
    { n: 2, label: 'POD / Kabin / Kilit', icon: 'pi pi-sitemap' },
    { n: 3, label: 'İşlem İzinleri', icon: 'pi pi-shield' },
    { n: 4, label: 'Erişim Süresi', icon: 'pi pi-clock' }
  ];
  const PRESETS = [[2, '2 saat'], [8, '8 saat'], [24, '24 saat'], [72, '3 gün'], [168, '7 gün']];
  let W = null;
  let wzHost = null;

  function openWizard(opts) {
    opts = opts || {};
    const g = opts.grant;
    const grp = opts.fromGroup;
    const now = roundTo5(Date.now());
    const pod = g ? g.pod : grp ? grp.pod : (S.pod || '*');
    const cabList = g ? g.cabinets : grp ? grp.cabinets : (S.cab ? [S.cab] : 'ALL');
    W = {
      mode: g ? 'edit' : 'new', grantId: g ? g.id : '', step: 1, maxStep: g ? 4 : 1,
      users: new Set(g ? [g.user] : grp ? grp.members.filter(id => !USER_BY[id].passive) : (opts.users || [])),
      group: g ? g.group : grp ? grp.id : '',
      pod,
      cabMode: cabList === 'ALL' ? 'ALL' : 'SELECT',
      cabinets: new Set(cabList === 'ALL' ? [] : cabList),
      sides: new Set(g ? g.sides : grp ? grp.sides : ['front', 'rear']),
      perms: new Set(g ? g.perms : grp ? grp.perms : ['view', 'unlock', 'lock']),
      relock: g ? g.autoRelock : 60, woReq: g ? !!g.woReq : false,
      duration: g ? g.mode : grp ? grp.mode : 'permanent',
      preset: grp && grp.mode === 'timed' ? grp.hours : (g ? 0 : 8),
      start: g && g.start ? g.start : now,
      end: g && g.end ? g.end : now + (grp && grp.mode === 'timed' ? grp.hours : 8) * HOUR,
      window: g ? !!g.window : false, wo: g ? g.wo : '', reason: g ? g.reason : (grp ? 'Grup yetkisi: ' + grp.name : ''),
      uq: '', cq: '', cust: ''
    };
    if (W.mode === 'new' && W.pod !== '*' && W.cabMode === 'SELECT') W.cabinets.forEach(c => { if (podOf(c) !== W.pod) W.pod = '*'; });
    if (wzHost) wzHost.remove();
    wzHost = document.createElement('div');
    wzHost.className = 'fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 flex items-center justify-center p-2 sm:p-4 animate-fade-in';
    wzHost.innerHTML =
      '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl w-full max-w-5xl overflow-hidden animate-modal-pop flex flex-col la-wizard" data-wz-panel>' +
        '<div class="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/60 shrink-0">' +
          '<div class="flex items-center gap-2.5"><span class="w-7 h-7 rounded-[2px] flex items-center justify-center text-xs bg-sky-500/10 text-sky-500 border border-sky-500/20"><i class="pi pi-key"></i></span>' +
            '<div><h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">' + (W.mode === 'edit' ? 'Yetkiyi Düzenle — ' + esc(W.grantId) : 'Yeni Kilit Yetkisi') + '</h3>' +
            '<p class="text-[11px] text-slate-500 dark:text-slate-400">' + (grp ? 'Grup şablonu: ' + esc(grp.name) : 'Kapak kilitleri için kullanıcı bazlı erişim tanımı') + '</p></div></div>' +
          '<button type="button" data-wz="close" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><i class="pi pi-times"></i></button>' +
        '</div>' +
        '<div data-wz-stepper class="px-4 sm:px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0"></div>' +
        '<div class="flex-1 min-h-0 flex">' +
          '<div data-wz-step class="flex-1 min-w-0 p-4 sm:p-5 overflow-y-auto custom-scrollbar"></div>' +
          '<aside data-wz-summary class="hidden md:block w-72 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 overflow-y-auto custom-scrollbar"></aside>' +
        '</div>' +
        '<div data-wz-footer class="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex flex-wrap items-center justify-between gap-2 shrink-0"></div>' +
      '</div>';
    document.body.appendChild(wzHost);
    wzHost.addEventListener('click', onWzClick);
    wzHost.addEventListener('input', onWzInput);
    wzHost.addEventListener('change', onWzInput);
    document.addEventListener('keydown', onWzKey);
    renderWizard();
  }
  function closeWizard() {
    if (!wzHost) return;
    document.removeEventListener('keydown', onWzKey);
    wzHost.remove();
    wzHost = null;
    W = null;
  }
  function onWzKey(e) { if (e.key === 'Escape' && wzHost && !document.querySelector('[data-dialog-panel]')) closeWizard(); }

  const wzCabs = () => (W.cabMode === 'ALL' ? (W.pod === '*' ? CABS : CABS_OF[W.pod]) : [...W.cabinets].map(c => CAB_BY[c]).filter(Boolean));
  const wzLocks = () => wzCabs().length * W.sides.size;
  function wzErrors(step) {
    const e = [];
    if (step === 1 && !W.users.size) e.push('En az bir kullanıcı seçin.');
    if (step === 2) {
      if (W.cabMode === 'SELECT' && !W.cabinets.size) e.push('En az bir kabin seçin.');
      if (!W.sides.size) e.push('En az bir kapak kilidi seçin.');
    }
    if (step === 4 && W.duration === 'timed') {
      if (!W.start || !W.end || W.end <= W.start) e.push('Bitiş zamanı başlangıçtan sonra olmalı.');
      else if (W.end <= Date.now()) e.push('Bitiş zamanı geçmişte olamaz.');
      else if (W.end - W.start > 90 * DAY) e.push('Süreli yetki en fazla 90 gün olabilir.');
      if (W.reason.trim().length < 5) e.push('Süreli yetki için gerekçe girin (en az 5 karakter).');
    }
    return e;
  }
  function wzConflicts() {
    const cabs = wzCabs();
    const out = [];
    W.users.forEach(id => {
      DB.grants.forEach(g => {
        if (g.user !== id || g.id === W.grantId) return;
        const st = grantStatus(g);
        if (st !== 'active' && st !== 'scheduled') return;
        if (cabs.some(c => [...W.sides].some(s => covers(g, c.code, s)))) out.push({ user: USER_BY[id], grant: g });
      });
    });
    return out;
  }

  function renderWizard() {
    renderWzStepper(); renderWzStep(); renderWzSummary(); renderWzFooter();
  }
  function renderWzStepper() {
    wzHost.querySelector('[data-wz-stepper]').innerHTML = '<ol class="flex items-center gap-1 sm:gap-2 overflow-x-auto">' + STEPS.map((s, i) => {
      const cur = W.step === s.n, done = !cur && s.n <= W.maxStep && !wzErrors(s.n).length;
      const reach = s.n <= W.maxStep;
      return (i ? '<li class="flex-1 min-w-4 h-px ' + (s.n <= W.maxStep ? 'bg-sky-500/60' : 'bg-slate-200 dark:bg-slate-800') + '"></li>' : '') +
        '<li><button type="button" data-wz="goto" data-n="' + s.n + '"' + (reach ? '' : ' disabled') + ' class="flex items-center gap-2 px-1.5 py-1 rounded-[2px] transition-colors whitespace-nowrap ' + (reach ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/70' : 'cursor-not-allowed opacity-50') + '">' +
          '<span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border ' +
            (cur ? 'bg-sky-600 border-sky-600 text-white' : done ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500') + '">' +
            (done ? '<i class="pi pi-check text-[9px]"></i>' : s.n) + '</span>' +
          '<span class="hidden sm:inline text-[11px] font-bold ' + (cur ? 'text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400') + '">' + s.label + '</span>' +
        '</button></li>';
    }).join('') + '</ol>';
  }

  function sectionTitle(n, t, sub) {
    return '<div class="flex items-baseline justify-between gap-2 mb-2"><div class="flex items-center gap-2"><span class="w-5 h-5 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black flex items-center justify-center text-slate-500">' + n + '</span>' +
      '<h4 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + t + '</h4></div>' + (sub ? '<span class="text-[10px] text-slate-400 font-mono">' + sub + '</span>' : '') + '</div>';
  }

  function renderWzStep() {
    const host = wzHost.querySelector('[data-wz-step]');
    if (W.step === 1) host.innerHTML = step1();
    else if (W.step === 2) host.innerHTML = step2();
    else if (W.step === 3) host.innerHTML = step3();
    else host.innerHTML = step4();
    if (W.step === 1) renderUserList();
    if (W.step === 2) { if (W.cabMode === 'SELECT') renderCabGrid(); renderLockInfo(); }
    if (W.step === 4) renderDurInfo();
  }

  // Adım 1 — Kullanıcı Seçimi
  function step1() {
    if (W.mode === 'edit') {
      const u = USER_BY[[...W.users][0]];
      return sectionTitle('1', 'Kullanıcı', 'düzenleme modu') +
        '<div class="flex items-center gap-3 p-3 rounded-[2px] border border-sky-500/40 bg-sky-500/5">' + avatar(u, true) +
          '<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 flex-wrap"><span class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + esc(u.name) + '</span>' + roleBadge(u) + '</div>' +
          '<div class="text-[10.5px] text-slate-500 dark:text-slate-400">' + esc(u.dept) + ' · <span class="font-mono">' + esc(u.card) + '</span></div></div><i class="pi pi-lock text-slate-400" title="Düzenlemede kullanıcı değiştirilemez"></i></div>' +
        '<p class="mt-2 text-[10.5px] text-slate-500 dark:text-slate-400"><i class="pi pi-info-circle mr-1 text-sky-500"></i>Kullanıcıyı değiştirmek için bu yetkiyi iptal edip yeni yetki tanımlayın.</p>';
    }
    return sectionTitle('1', 'Kullanıcı Seçimi', 'LDAP dizini · ' + USERS.length + ' kullanıcı') +
      '<div class="flex flex-wrap items-center gap-2 mb-2">' +
        '<div class="relative flex-1 min-w-48"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"></i>' +
          '<input type="search" data-wzf="uq" value="' + esc(W.uq) + '" placeholder="Ad, sicil, kart no veya departman ara..." class="' + INPUT + '" /></div>' +
        '<span data-wz-ucount class="text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap"></span>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-1.5 mb-3"><span class="' + LABEL + ' mr-1">Gruptan seç:</span>' + DB.groups.map(g =>
        '<button type="button" data-wz="grp" data-id="' + g.id + '" class="inline-flex items-center gap-1 px-2 py-1 rounded-[2px] text-[10px] font-bold border cursor-pointer transition-colors hover:opacity-80 ' + TONE[g.tone] + '"><i class="' + g.icon + ' text-[9px]"></i>' + esc(g.name) + ' <span class="font-mono opacity-70">' + g.members.length + '</span></button>').join('') + '</div>' +
      '<div data-wz-ulist class="grid grid-cols-1 lg:grid-cols-2 gap-1.5"></div>';
  }
  function renderUserList() {
    const host = wzHost.querySelector('[data-wz-ulist]');
    const cnt = wzHost.querySelector('[data-wz-ucount]');
    if (cnt) cnt.textContent = W.users.size + ' seçili';
    if (!host) return;
    const q = lc(W.uq.trim());
    const list = USERS.filter(u => !q || lc([u.name, u.usr, u.id, u.card, u.dept].join(' ')).indexOf(q) >= 0);
    if (!list.length) { host.innerHTML = '<div class="col-span-full">' + kit.emptyState({ compact: true, message: 'Eşleşen kullanıcı yok', icon: 'pi pi-user' }) + '</div>'; return; }
    host.innerHTML = list.map(u => {
      const on = W.users.has(u.id);
      const n = DB.grants.filter(g => g.user === u.id && grantStatus(g) === 'active').length;
      return '<button type="button" data-wz="user" data-id="' + u.id + '"' + (u.passive ? ' disabled title="Pasif hesaba yetki tanımlanamaz"' : '') +
        ' class="la-choice text-left flex items-center gap-2.5 p-2 rounded-[2px] border transition-colors ' + (on ? 'is-on' : '') + (u.passive ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer') + '">' +
        '<span class="w-4 h-4 rounded-[2px] border flex items-center justify-center shrink-0 ' + (on ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 dark:border-slate-600') + '">' + (on ? '<i class="pi pi-check text-[8px]"></i>' : '') + '</span>' +
        avatar(u) +
        '<div class="min-w-0 flex-1"><div class="flex items-center gap-1.5"><span class="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate">' + esc(u.name) + '</span>' + roleBadge(u) + '</div>' +
          '<div class="text-[9.5px] text-slate-500 dark:text-slate-400 truncate">' + esc(u.dept) + '</div>' +
          '<div class="text-[9px] font-mono text-slate-400 truncate">' + esc(u.card) + ' · ' + esc(u.id) + (u.passive ? ' · pasif' : '') + '</div></div>' +
        (n ? '<span class="shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30" title="Aktif yetki">' + n + ' yetki</span>' : '') +
      '</button>';
    }).join('');
  }

  // Adım 2 — POD / Kabin / Kilit Seçimi
  function step2() {
    const podBtn = (val, label, sub, on) =>
      '<button type="button" data-wz="pod" data-pod="' + esc(val) + '" class="la-choice px-2 py-2 rounded-[2px] border text-left transition-colors cursor-pointer ' + (on ? 'is-on' : '') + '">' +
        '<div class="text-[11px] font-black font-mono">' + esc(label) + '</div><div class="text-[9px] text-slate-400 font-mono">' + sub + '</div></button>';
    const scopeCard = (val, icon, title, desc) =>
      '<button type="button" data-wz="cabmode" data-v="' + val + '" class="la-choice flex items-start gap-2.5 p-2.5 rounded-[2px] border text-left transition-colors cursor-pointer ' + (W.cabMode === val ? 'is-on' : '') + '">' +
        '<span class="w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 ' + (W.cabMode === val ? 'border-sky-600' : 'border-slate-300 dark:border-slate-600') + '">' + (W.cabMode === val ? '<span class="w-2 h-2 rounded-full bg-sky-600"></span>' : '') + '</span>' +
        '<div><div class="text-[11px] font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="' + icon + ' text-[10px] text-brand-500"></i>' + title + '</div><div class="text-[10px] text-slate-500 dark:text-slate-400">' + desc + '</div></div></button>';
    const sideCard = s => {
      const on = W.sides.has(s.key);
      return '<button type="button" data-wz="side" data-v="' + s.key + '" class="la-choice flex items-center gap-2.5 p-2.5 rounded-[2px] border text-left transition-colors cursor-pointer ' + (on ? 'is-on' : '') + '">' +
        '<span class="w-4 h-4 rounded-[2px] border flex items-center justify-center shrink-0 ' + (on ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 dark:border-slate-600') + '">' + (on ? '<i class="pi pi-check text-[8px]"></i>' : '') + '</span>' +
        '<i class="pi pi-lock text-sm ' + (on ? 'text-sky-500' : 'text-slate-400') + '"></i>' +
        '<div><div class="text-[11px] font-bold text-slate-900 dark:text-slate-100">' + s.label + '</div><div class="text-[9.5px] font-mono text-slate-400">&lt;POD&gt;_&lt;KABİN&gt;_' + s.sfx + '</div></div></button>';
    };
    const podName = W.pod === '*' ? 'Salondaki' : W.pod + ' içindeki';
    return sectionTitle('1', 'POD Seçimi', PODS.length + ' POD · ' + CABS.length + ' kabin') +
      '<div class="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-1.5 mb-4">' +
        podBtn('*', 'Tüm Salon', CABS.length + ' kabin', W.pod === '*') +
        PODS.map(p => podBtn(p, p, CABS_OF[p].length + ' kabin', W.pod === p)).join('') +
      '</div>' +
      sectionTitle('2', 'Kabin Kapsamı', '') +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2">' +
        scopeCard('ALL', 'pi pi-th-large', 'Tüm kabinler', podName + ' tüm kabinler — sonradan eklenenler dahil') +
        scopeCard('SELECT', 'pi pi-server', 'Seçili kabinler', 'Kabin bazında seçim (müşteri kabinleri, bakım kabinleri)') +
      '</div>' +
      (W.cabMode === 'SELECT'
        ? '<div class="rounded-[2px] border border-slate-200 dark:border-slate-800 p-2.5 mb-4 bg-slate-50/50 dark:bg-slate-950/30">' +
            '<div class="flex flex-wrap items-center gap-2 mb-2">' +
              '<div class="relative flex-1 min-w-40"><i class="pi pi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400"></i><input type="search" data-wzf="cq" value="' + esc(W.cq) + '" placeholder="Kabin kodu ara..." class="' + INPUT + '" /></div>' +
              '<select data-wzf="cust" class="' + SELECT + '"><option value="">Tüm müşteriler</option>' + CUSTOMERS.map(c => '<option value="' + esc(c) + '"' + (W.cust === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
              btn({ variant: 'secondary', size: 'sm', icon: 'pi pi-check-square', label: 'Görünenleri seç', attrs: 'data-wz="cab-all"' }) +
              btn({ variant: 'ghost', size: 'sm', icon: 'pi pi-times', label: 'Temizle', attrs: 'data-wz="cab-none"' }) +
            '</div>' +
            '<div data-wz-cabgrid class="max-h-56 overflow-y-auto custom-scrollbar pr-1"></div>' +
          '</div>'
        : '<div class="mb-4"></div>') +
      sectionTitle('3', 'Kilit Seçimi', 'kapak başına 1 elektronik kilit') +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">' + SIDES.map(sideCard).join('') + '</div>' +
      '<div data-wz-lockinfo class="mt-3 flex items-center gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-300"></div>';
  }
  function renderCabGrid() {
    const host = wzHost.querySelector('[data-wz-cabgrid]');
    if (!host) return;
    const pods = W.pod === '*' ? PODS : [W.pod];
    const q = lc(W.cq.trim());
    let html = '';
    pods.forEach(p => {
      const cabs = CABS_OF[p].filter(c => (!q || lc(c.code).indexOf(q) >= 0) && (!W.cust || c.customer === W.cust));
      if (!cabs.length) return;
      if (pods.length > 1) html += '<div class="' + LABEL + ' mt-1.5 mb-1">' + esc(p) + ' <span class="font-mono normal-case text-slate-400">(' + cabs.filter(c => W.cabinets.has(c.code)).length + '/' + cabs.length + ')</span></div>';
      html += '<div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1">' + cabs.map(c => {
        const on = W.cabinets.has(c.code);
        return '<button type="button" data-wz="cab" data-code="' + esc(c.code) + '" title="' + esc(c.code + ' — ' + c.customer) + '" class="la-choice px-1.5 py-1 rounded-[2px] border text-left transition-colors cursor-pointer ' + (on ? 'is-on' : '') + '">' +
          '<div class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full shrink-0 ' + DOT[c.lock.overallState] + '"></span><span class="text-[10.5px] font-mono font-black">' + esc(c.code) + '</span>' + (on ? '<i class="pi pi-check text-[8px] ml-auto text-sky-500"></i>' : '') + '</div>' +
          '<div class="text-[8.5px] text-slate-400 truncate">' + esc(c.customer) + '</div></button>';
      }).join('') + '</div>';
    });
    host.innerHTML = html || kit.emptyState({ compact: true, message: 'Filtreye uyan kabin yok', icon: 'pi pi-server' });
  }
  function renderLockInfo() {
    const el = wzHost && wzHost.querySelector('[data-wz-lockinfo]');
    if (!el) return;
    const n = wzCabs().length;
    el.innerHTML = '<i class="pi pi-lock text-sky-500"></i><span><b class="text-slate-900 dark:text-slate-100">' + n + '</b> kabin × <b class="text-slate-900 dark:text-slate-100">' + W.sides.size + '</b> kapak = <b class="text-sky-600 dark:text-sky-400">' + wzLocks() + '</b> elektronik kilit</span>';
  }

  // Adım 3 — İşlem İzinleri
  function step3() {
    const others = [...W.perms].some(k => k !== 'view');
    return sectionTitle('1', 'İşlem İzinleri', 'LCK modülü') +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' + PERMS.map(p => {
        const on = W.perms.has(p.key);
        const forced = p.key === 'view' && others;
        return '<button type="button" data-wz="perm" data-v="' + p.key + '"' + (forced ? ' title="Diğer izinler için Görüntüleme zorunludur"' : '') + ' class="la-choice flex items-start gap-3 p-3 rounded-[2px] border text-left transition-colors cursor-pointer ' + (on ? 'is-on' : '') + '">' +
          '<span class="w-9 h-9 rounded-[2px] border flex items-center justify-center shrink-0 ' + (on ? TONE[p.tone] : 'border-slate-200 dark:border-slate-700 text-slate-400') + '"><i class="' + p.icon + ' text-base"></i></span>' +
          '<div class="flex-1 min-w-0"><div class="flex items-center justify-between gap-2"><span class="text-xs font-extrabold text-slate-900 dark:text-slate-100">' + p.label + '</span>' +
            '<span class="w-8 h-4 rounded-full relative transition-colors shrink-0 ' + (on ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700') + '"><span class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-xs transition-all ' + (on ? 'left-4.5' : 'left-0.5') + '"></span></span></div>' +
            '<div class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">' + p.desc + '</div>' +
            '<div class="text-[9px] font-mono text-slate-400 mt-1">' + p.code + (forced ? ' · zorunlu' : '') + '</div></div>' +
        '</button>';
      }).join('') + '</div>' +
      (W.perms.has('unlock')
        ? '<div class="mt-4">' + sectionTitle('2', 'Kilit Açma Kuralları', '') +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              kit.formField({ label: 'Otomatik yeniden kilitleme', hint: 'kapak açılmazsa', control: kit.select('data-wzf="relock"', [30, 60, 120, 300].map(s => ({ value: s, label: s + ' saniye sonra' })), W.relock) }) +
              '<label class="flex items-start gap-2 p-2.5 rounded-[2px] border border-slate-200 dark:border-slate-700 cursor-pointer self-end"><input type="checkbox" data-wzf="woreq"' + (W.woReq ? ' checked' : '') + ' class="w-3.5 h-3.5 mt-0.5 accent-sky-600" />' +
                '<span><span class="block text-[11px] font-bold text-slate-800 dark:text-slate-200">İş emri numarası zorunlu</span><span class="block text-[10px] text-slate-500 dark:text-slate-400">Uzaktan kilit açma talebinde iş emri sorulur</span></span></label>' +
            '</div></div>'
        : '') +
      (W.perms.has('manage')
        ? '<div class="mt-3 flex items-start gap-2 p-2.5 rounded-[2px] bg-purple-500/10 border border-purple-500/30 text-[10.5px] text-purple-700 dark:text-purple-300"><i class="pi pi-exclamation-triangle mt-0.5"></i>' +
            '<span><b>Yetki Yönetimi</b> izni, kullanıcının bu kapsamdaki kilitler için başka kullanıcılara yetki tanımlamasına ve iptal etmesine izin verir. Yalnızca yönetici rollerine verilmesi önerilir.</span></div>'
        : '');
  }

  // Adım 4 — Erişim Süresi
  function step4() {
    const modeCard = (val, icon, title, desc) =>
      '<button type="button" data-wz="duration" data-v="' + val + '" class="la-choice flex items-start gap-3 p-3 rounded-[2px] border text-left transition-colors cursor-pointer ' + (W.duration === val ? 'is-on' : '') + '">' +
        '<span class="w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center shrink-0 ' + (W.duration === val ? 'border-sky-600' : 'border-slate-300 dark:border-slate-600') + '">' + (W.duration === val ? '<span class="w-2 h-2 rounded-full bg-sky-600"></span>' : '') + '</span>' +
        '<div><div class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="' + icon + ' text-[11px]"></i>' + title + '</div><div class="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">' + desc + '</div></div></button>';
    return sectionTitle('1', 'Erişim Süresi', '') +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">' +
        modeCard('permanent', 'pi pi-verified text-emerald-500', 'Kalıcı yetki', 'İptal edilene kadar geçerli. Personel ve sözleşmeli müşteriler için.') +
        modeCard('timed', 'pi pi-stopwatch text-amber-500', 'Süreli yetki', 'Başlangıç–bitiş aralığında geçerli; süre sonunda kart otomatik geçersiz olur.') +
      '</div>' +
      (W.duration === 'timed'
        ? '<div class="rounded-[2px] border border-slate-200 dark:border-slate-800 p-3 mb-4 bg-slate-50/50 dark:bg-slate-950/30 space-y-3">' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="' + LABEL + ' mr-1">Hazır süre:</span>' + PRESETS.map(p =>
              '<button type="button" data-wz="preset" data-h="' + p[0] + '" class="la-choice px-2.5 py-1 rounded-[2px] border text-[10.5px] font-bold transition-colors cursor-pointer ' + (W.preset === p[0] ? 'is-on' : '') + '">' + p[1] + '</button>').join('') +
              '<button type="button" data-wz="preset" data-h="0" class="la-choice px-2.5 py-1 rounded-[2px] border text-[10.5px] font-bold transition-colors cursor-pointer ' + (!W.preset ? 'is-on' : '') + '">Özel</button></div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
              kit.formField({ label: 'Başlangıç', required: true, control: '<input type="datetime-local" data-wzf="start" value="' + toLocalInput(W.start) + '" class="' + FIELD + ' la-dt" />' }) +
              kit.formField({ label: 'Bitiş', required: true, control: '<input type="datetime-local" data-wzf="end" value="' + toLocalInput(W.end) + '" class="' + FIELD + ' la-dt" />' }) +
            '</div>' +
            '<label class="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"><input type="checkbox" data-wzf="window"' + (W.window ? ' checked' : '') + ' class="w-3.5 h-3.5 accent-sky-600" />Yalnızca mesai saatlerinde geçerli (08:00–18:00)</label>' +
            '<div data-wz-dur class="text-[10.5px] font-mono text-slate-500 dark:text-slate-400"></div>' +
          '</div>'
        : '') +
      sectionTitle('2', 'Referans ve Gerekçe', '') +
      '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
        kit.formField({ label: 'İş Emri', hint: 'isteğe bağlı', control: kit.select('data-wzf="wo"', [{ value: '', label: '— İş emri yok —' }].concat(WORK_ORDERS.map(w => ({ value: w.id, label: w.id + ' · ' + w.name }))), W.wo) }) +
        '<div class="sm:col-span-2">' + kit.formField({ label: 'Gerekçe / Açıklama', required: W.duration === 'timed', control: '<textarea data-wzf="reason" rows="2" class="' + FIELD + ' resize-none" placeholder="Örn. PDU modül değişimi — refakatli bakım">' + esc(W.reason) + '</textarea>' }) + '</div>' +
      '</div>';
  }
  function renderDurInfo() {
    const el = wzHost && wzHost.querySelector('[data-wz-dur]');
    if (!el) return;
    el.innerHTML = W.end > W.start ? '<i class="pi pi-clock mr-1 text-sky-500"></i>Toplam süre: <b class="text-slate-800 dark:text-slate-200">' + dur(W.end - W.start) + '</b>' + (W.start > Date.now() + MIN ? ' · ' + dur(W.start - Date.now()) + ' sonra başlar' : ' · hemen geçerli') : '<span class="text-rose-500">Geçersiz aralık</span>';
  }

  // Sağ panel — özet
  function renderWzSummary() {
    const host = wzHost.querySelector('[data-wz-summary]');
    const users = [...W.users].map(id => USER_BY[id]);
    const cabs = wzCabs();
    const grp = GROUP_BY(W.group);
    const conf = wzConflicts();
    const row = (k, v) => '<div class="py-2 border-b border-slate-200 dark:border-slate-800"><div class="' + LABEL + ' mb-1">' + k + '</div>' + v + '</div>';
    const scope = W.cabMode === 'ALL' ? (W.pod === '*' ? 'Tüm Salon' : W.pod) + ' · tüm kabinler' : cabs.length + ' kabin' + (cabs.length ? ' · ' + uniq(cabs.map(c => c.pod)).join(', ') : '');
    host.innerHTML =
      '<div class="flex items-center gap-2 mb-1"><i class="pi pi-list-check text-sky-500 text-sm"></i><h4 class="text-xs font-extrabold text-slate-900 dark:text-slate-100">Yetki Özeti</h4></div>' +
      row('Kullanıcı (' + users.length + ')', users.length ? '<div class="flex flex-wrap gap-1">' + users.slice(0, 6).map(u => '<span class="px-1.5 py-0.5 rounded-[2px] text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">' + esc(u.name) + '</span>').join('') + (users.length > 6 ? '<span class="text-[10px] font-mono text-slate-400">+' + (users.length - 6) + '</span>' : '') + '</div>' : '<span class="text-[10.5px] text-slate-400 italic">Seçilmedi</span>') +
      (grp ? row('Grup', groupChip(grp)) : '') +
      row('Kapsam', '<div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">' + esc(scope) + '</div><div class="text-[10px] text-slate-500 dark:text-slate-400">' + (W.sides.size ? sidesText([...W.sides]) : 'Kapak seçilmedi') + '</div>') +
      row('Elektronik Kilit', '<div class="text-xl font-black text-sky-600 dark:text-sky-400 leading-none">' + wzLocks() + '</div><div class="text-[9.5px] font-mono text-slate-400 mt-0.5">kullanıcı başına · toplam ' + wzLocks() * Math.max(1, users.length) + ' kart kaydı</div>') +
      row('İzinler', '<div class="flex flex-wrap gap-1">' + permChips([...W.perms]) + '</div>') +
      row('Süre', W.duration === 'permanent' ? '<div class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400"><i class="pi pi-verified text-[10px] mr-1"></i>Kalıcı</div>'
        : '<div class="text-[11px] font-bold text-amber-600 dark:text-amber-400"><i class="pi pi-stopwatch text-[10px] mr-1"></i>Süreli · ' + (W.end > W.start ? dur(W.end - W.start) : '—') + '</div><div class="text-[9.5px] font-mono text-slate-400">' + fmtShort(W.start) + ' → ' + fmtShort(W.end) + '</div>') +
      (W.wo ? row('İş Emri', '<span class="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">' + esc(W.wo) + '</span>') : '') +
      (conf.length ? '<div class="mt-3 p-2 rounded-[2px] bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-700 dark:text-amber-300"><div class="font-bold mb-0.5"><i class="pi pi-info-circle mr-1"></i>Kapsam çakışması</div>' +
          conf.slice(0, 4).map(c => '<div>' + esc(c.user.name) + ': <span class="font-mono">' + esc(c.grant.id) + '</span> (' + esc(scopeTitle(c.grant)) + ')</div>').join('') + (conf.length > 4 ? '<div>+' + (conf.length - 4) + ' yetki</div>' : '') +
          '<div class="mt-1 opacity-80">Mevcut yetkiler korunur; izinler birleşik değerlendirilir.</div></div>' : '');
  }
  function renderWzFooter() {
    const errs = wzErrors(W.step);
    const last = W.step === 4;
    wzHost.querySelector('[data-wz-footer]').innerHTML =
      '<div class="text-[10.5px] min-w-0 flex-1">' + (errs.length && W.touched ? '<span class="text-rose-600 dark:text-rose-400 font-semibold"><i class="pi pi-exclamation-circle mr-1"></i>' + esc(errs[0]) + '</span>'
        : '<span class="font-mono text-slate-400">Adım ' + W.step + ' / 4 · ' + STEPS[W.step - 1].label + '</span>') + '</div>' +
      '<div class="flex items-center gap-2">' +
        '<button type="button" data-wz="close" class="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-[2px] transition-colors cursor-pointer">İptal</button>' +
        (W.step > 1 ? btn({ variant: 'secondary', icon: 'pi pi-arrow-left', label: 'Geri', attrs: 'data-wz="prev"' }) : '') +
        (last ? '<button type="button" data-wz="save" class="px-3 py-1.5 text-xs font-semibold text-white rounded-[2px] transition-all flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 cursor-pointer"><i class="pi pi-check"></i>' + (W.mode === 'edit' ? 'Değişiklikleri Kaydet' : 'Yetkiyi Tanımla') + '</button>'
          : btn({ variant: 'primary', icon: 'pi pi-arrow-right', label: 'İleri', attrs: 'data-wz="next"' })) +
      '</div>';
  }
  const refreshWz = () => { renderWzSummary(); renderWzFooter(); renderWzStepper(); };

  function goStep(n) {
    W.step = n;
    W.maxStep = Math.max(W.maxStep, n);
    W.touched = false;
    renderWizard();
    const body = wzHost.querySelector('[data-wz-step]');
    if (body) body.scrollTop = 0;
  }

  // Arka plana tıklama sihirbazı kapatmaz (girilen bilgiler kaybolmasın); kapatma: İptal / × / Esc
  function onWzClick(e) {
    const a = e.target.closest('[data-wz]');
    if (!a || a.disabled) return;
    const act = a.getAttribute('data-wz');
    switch (act) {
      case 'close': closeWizard(); return;
      case 'goto': {
        const n = Number(a.getAttribute('data-n'));
        for (let s = 1; s < n; s++) if (wzErrors(s).length) { goStep(s); W.touched = true; renderWzFooter(); return; }
        goStep(n);
        return;
      }
      case 'next':
        if (wzErrors(W.step).length) { W.touched = true; renderWzFooter(); return; }
        goStep(W.step + 1);
        return;
      case 'prev': goStep(W.step - 1); return;
      case 'save': saveWizard(); return;
      case 'user': {
        const id = a.getAttribute('data-id');
        if (W.users.has(id)) W.users.delete(id); else W.users.add(id);
        renderUserList(); refreshWz();
        return;
      }
      case 'grp': {
        const g = GROUP_BY(a.getAttribute('data-id'));
        if (!g) return;
        g.members.forEach(id => { if (USER_BY[id] && !USER_BY[id].passive) W.users.add(id); });
        W.group = g.id;
        renderUserList(); refreshWz();
        toast(g.name + ' üyeleri seçildi.', 'info');
        return;
      }
      case 'pod': {
        W.pod = a.getAttribute('data-pod');
        if (W.pod !== '*') W.cabinets.forEach(c => { if (podOf(c) !== W.pod) W.cabinets.delete(c); });
        renderWzStep(); renderLockInfo(); refreshWz();
        return;
      }
      case 'cabmode': W.cabMode = a.getAttribute('data-v'); renderWzStep(); renderLockInfo(); refreshWz(); return;
      case 'cab': {
        const c = a.getAttribute('data-code');
        if (W.cabinets.has(c)) W.cabinets.delete(c); else W.cabinets.add(c);
        renderCabGrid(); renderLockInfo(); refreshWz();
        return;
      }
      case 'cab-all': {
        const q = lc(W.cq.trim());
        (W.pod === '*' ? CABS : CABS_OF[W.pod]).filter(c => (!q || lc(c.code).indexOf(q) >= 0) && (!W.cust || c.customer === W.cust)).forEach(c => W.cabinets.add(c.code));
        renderCabGrid(); renderLockInfo(); refreshWz();
        return;
      }
      case 'cab-none': W.cabinets.clear(); renderCabGrid(); renderLockInfo(); refreshWz(); return;
      case 'side': {
        const s = a.getAttribute('data-v');
        if (W.sides.has(s)) W.sides.delete(s); else W.sides.add(s);
        renderWzStep(); renderLockInfo(); refreshWz();
        return;
      }
      case 'perm': {
        const k = a.getAttribute('data-v');
        if (k === 'view') { if ([...W.perms].some(x => x !== 'view')) { toast('Diğer izinler seçiliyken Görüntüleme kaldırılamaz.', 'warning'); return; } }
        if (W.perms.has(k)) { if (k === 'view') return; W.perms.delete(k); } else { W.perms.add(k); W.perms.add('view'); }
        renderWzStep(); refreshWz();
        return;
      }
      case 'duration': {
        W.duration = a.getAttribute('data-v');
        if (W.duration === 'timed' && (!W.end || W.end <= Date.now())) { W.start = roundTo5(Date.now()); W.end = W.start + 8 * HOUR; W.preset = 8; }
        renderWzStep(); renderDurInfo(); refreshWz();
        return;
      }
      case 'preset': {
        const h = Number(a.getAttribute('data-h'));
        W.preset = h;
        if (h) { if (!W.start || W.start < Date.now() - HOUR) W.start = roundTo5(Date.now()); W.end = W.start + h * HOUR; }
        renderWzStep(); renderDurInfo(); refreshWz();
        return;
      }
      default:
    }
  }
  function onWzInput(e) {
    const f = e.target.getAttribute('data-wzf');
    if (!f) return;
    const v = e.target.value;
    if (f === 'uq') { W.uq = v; renderUserList(); return; }
    if (f === 'cq') { W.cq = v; renderCabGrid(); return; }
    if (f === 'cust') { W.cust = v; renderCabGrid(); return; }
    if (f === 'relock') W.relock = Number(v);
    else if (f === 'woreq') W.woReq = e.target.checked;
    else if (f === 'window') W.window = e.target.checked;
    else if (f === 'wo') W.wo = v;
    else if (f === 'reason') W.reason = v;
    else if (f === 'start' || f === 'end') {
      const t = fromLocalInput(v);
      if (t == null) return;
      W[f] = t;
      if (f === 'start' && W.preset) W.end = t + W.preset * HOUR;
      else W.preset = 0;
      if (e.type === 'change') { renderWzStep(); }
      renderDurInfo();
    }
    refreshWz();
  }

  function saveWizard() {
    for (let s = 1; s <= 4; s++) {
      const errs = wzErrors(s);
      if (errs.length) { goStep(s); W.touched = true; renderWzFooter(); toast(errs[0], 'error', 'Eksik bilgi'); return; }
    }
    const t = Date.now();
    const data = {
      pod: W.pod,
      cabinets: W.cabMode === 'ALL' ? 'ALL' : [...W.cabinets].sort(),
      sides: SIDES.map(s => s.key).filter(k => W.sides.has(k)),
      perms: permOrder([...W.perms]),
      mode: W.duration,
      start: W.duration === 'timed' ? W.start : null,
      end: W.duration === 'timed' ? W.end : null,
      window: W.duration === 'timed' && W.window,
      wo: W.wo, reason: W.reason.trim(),
      autoRelock: W.relock, woReq: W.perms.has('unlock') && W.woReq
    };
    const locks = wzLocks();
    let ids = [];
    if (W.mode === 'edit') {
      const g = grantById(W.grantId);
      if (!g) { closeWizard(); return; }
      Object.assign(g, data, { updatedAt: t, updatedBy: me() });
      g.history.push({ t, by: me(), action: 'Yetki güncellendi', note: scopeTitle(g) + ' · ' + permNames(g.perms) + (g.mode === 'timed' ? ' · bitiş ' + fmtShort(g.end) : ' · kalıcı') });
      ids = [g.id];
      pushAudit('Kilit Yetkisi Güncellendi: ' + g.id + ' — ' + USER_BY[g.user].name + ' · ' + scopeTitle(g) + ' (' + locks + ' kilit) · ' + permNames(g.perms), 'Kullanıcı ' + USER_BY[g.user].name + ' (' + g.user + ')');
      toast(g.id + ' güncellendi · ' + locks + ' kilit', 'success', 'Yetki Güncellendi');
    } else {
      [...W.users].forEach(userId => {
        const g = Object.assign({
          id: nextId(), user: userId, group: W.group && (GROUP_BY(W.group) || { members: [] }).members.indexOf(userId) >= 0 ? W.group : '',
          createdBy: me(), createdAt: t, updatedBy: '', updatedAt: null, revokedAt: null, revokedBy: '', revokeReason: '', sync: 'ok'
        }, data);
        g.history = [{ t, by: me(), action: 'Yetki tanımlandı', note: (g.wo ? g.wo + ' · ' : '') + (g.reason || '') }];
        DB.grants.push(g);
        ids.push(g.id);
        pushAudit('Kilit Yetkisi Tanımlandı: ' + g.id + ' — ' + USER_BY[userId].name + ' · ' + scopeTitle(g) + ' (' + locks + ' kilit) · ' + permNames(g.perms) + (g.mode === 'timed' ? ' · ' + fmtShort(g.start) + '–' + fmtShort(g.end) : ' · kalıcı'), 'Kullanıcı ' + USER_BY[userId].name + ' (' + userId + ')');
      });
      toast(ids.length + ' kullanıcıya ' + locks + ' kilit için yetki tanımlandı (' + ids.join(', ') + ').', 'success', 'Yetki Tanımlandı');
    }
    persist();
    closeWizard();
    S.tab = 'users';
    if (S.status === 'revoked' || S.status === 'expired') S.status = 'all';
    syncUrl();
    renderAll();
    simulateSync(ids);
  }

  // ---------------------------------------------------------------------------
  // Başlık işlemleri
  // ---------------------------------------------------------------------------
  document.getElementById('la-header').addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.getAttribute('data-act') === 'new') openWizard();
    else if (a.getAttribute('data-act') === 'test') testDialog();
  });

  // ---------------------------------------------------------------------------
  // Başlat
  // ---------------------------------------------------------------------------
  function renderAll() {
    renderSummary(); renderTabs(); renderSidebar(); renderScope(); renderToolbar(); renderContent();
  }
  renderHeader();
  renderAll();

  // Süreli yetkilerin kalan süresi / durum geçişleri
  setInterval(() => {
    renderSummary();
    renderTabs();
    if (S.tab === 'users' && !document.activeElement.matches('#la-toolbar input')) { renderToolbar(); renderContent(); }
  }, 30000);

  if (params.get('new') === '1') {
    const u = uid(params.get('user'));
    openWizard({ users: u ? [u] : [] });
    if (u) goStep(2);
  } else if (params.get('grant') && grantById(params.get('grant'))) {
    detailDialog(grantById(params.get('grant')));
  } else if (params.get('test') === '1') {
    testDialog();
  }
})();
