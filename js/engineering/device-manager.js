/* ==========================================================================
   DCIM Sunum — Cihaz Ekle (Model Kütüphanesi) (NewUICMPDeviceManagerComponent)
   Kaynak: new-ui/pages/engineering/device-manager/device-manager.component.{html,ts}, .model.ts, .excel.ts
   ADR-0011: model kütüphanesindeki şablonla cihaz ekleme. Eski "Cihaz Tanımlama Formu" (add-device) ve
   "PDU Ekleme Formu" (device-add) kaldırıldı; eski adresler (#add-device, #device-add) buraya yönlenir (js/engineering.js).
   Akış: Kat + Salon seç → kütüphaneden marka/model → bağlantı/konum alanları, SNMP bölümü (V1/V2C/V3; V3 kimliği formda)
   → istemci ön denetimi (zorunlu alan, önek, IP biçimi/CR-LF, port, Modbus adresi, bütün katlarda aynı uç nokta,
   PDU/PMM için kabin, bağlantı protokolü) → "Doğrula" (kapıya kuru çalıştırma, dry_run) → "Ekle".
   Excel ile toplu: "Şablon indir" (CSV), dosya seçimi (sunumda örnek dosya simülasyonu, en çok 200 satır);
   SNMPv3 satırları kimliği sayfadan alır (Excel'e parola yazılmaz). Sağ kartta "Bağlantılar" sekmesi: kat → salon →
   protokol bağlantı yuvası doluluğu (con_ses). PDU yardımcısı: kabin önerisi (datalist), kabindeki PDU'lar,
   K{kabin}_PDU_{harf} ad önerisi.
   Veri: DCIM.data.deviceManager (js/mock/eng-device-manager.data.js) — kurgusal; "Ekle" yalnız sunum oturumuna yazar.

   Derin bağlantılar (engineering.html#device-manager?...):
     ?floor=1|2|3|DCB&hall=S2       hedef kat/salon        ?model=MDL_RARITAN_PX3_5530V   model seçili
     ?cabinet=1NA06                 PDU modeli + kabin (PDU yardımcısı açık); &apply=1 önerilen adı uygular
     ?host=10.201.21.250            IP                     ?dry=1   doğrulamayı (kuru çalıştırma) hemen çalıştırır; &add=1 ardından ekler
     ?mode=excel&sample=1|errors    Excel ile toplu + örnek dosya (errors: hatalı satırlı örnek)
     ?tab=input|conns|result        sağ kart sekmesi       ?view=cards  ?q=raritan  ?proto=snmp|modbus  ?type=pdu
     ?reset=1                       sunum oturumunda eklenenleri siler
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  DCIM.engRegistry = DCIM.engRegistry || {};
  const { esc, toast, buttonClasses } = DCIM.ui;
  const kit = DCIM.kit;

  // device-manager.model.ts
  const SNMP_VERSIONS = ['V1', 'V2C', 'V3'];
  const SNMP_AUTH = ['MD5', 'SHA', 'SHA1', 'SHA224', 'SHA256', 'SHA384', 'SHA512'];
  const SNMP_PRIV = ['DES', 'AES', 'AES128', 'AES192', 'AES256'];
  const SNMP_TEXT_MAX = 32;
  const SNMP_PASS_MIN = 8;
  const DEV_PARAMS = ['con_host', 'con_port', 'pro_adr', 'pro_con', 'cab', 'row', 'feed', 'pod', 'dev_loc', 'loc', 'panel', 'pair', 'inlet', 'dev_nfo', 'dev_cap', 'dev_bcu',
    'pro_ver', 'pro_getc', 'pro_setc', 'pro_usr', 'pro_auth', 'pro_pwd', 'pro_priv', 'pro_priv_key'];
  const SECRET_PARAMS = ['pro_usr', 'pro_auth', 'pro_pwd', 'pro_priv', 'pro_priv_key'];
  const UI_PARAMS = DEV_PARAMS.filter(p => SECRET_PARAMS.indexOf(p) < 0);
  const EXCEL_COLUMNS = ['model', 'prefix', 'desc'].concat(UI_PARAMS);
  const MAX_ROWS = 200;
  const PREFIX_RE = /^[A-Za-z0-9_-]+$/;
  const DEV_SUFFIX = '_DV';
  const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ENERGY_DEV_TYPES = ['meter', 'rectifier', 'ups', 'plc'];
  const PROTOCOLS = [{ key: 'snmp', label: 'SNMP' }, { key: 'modbus', label: 'Modbus' }];
  // core/utils/dev-type.ts
  const DEV_TYPES = [
    { key: 'pdu', label: 'PDU' }, { key: 'pmm', label: 'PMM' }, { key: 'ups', label: 'UPS' }, { key: 'rectifier', label: 'Redresör' },
    { key: 'panel', label: 'Pano' }, { key: 'dist_panel', label: 'Dağıtım panosu' }, { key: 'crac_panel', label: 'Klima panosu' },
    { key: 'crac', label: 'Klima' }, { key: 'meter', label: 'Sayaç' }, { key: 'sensor', label: 'Sensör' },
    { key: 'weather', label: 'Hava istasyonu' }, { key: 'plc', label: 'PLC' }
  ];
  const LOCATION_FIELDS = [{ key: 'cab', label: 'Kabin (cab)' }, { key: 'row', label: 'Sıra (row)' }, { key: 'feed', label: 'Besleme (feed)' }, { key: 'pod', label: 'POD (pod)' }];
  const EXTRA_FIELDS = [{ key: 'dev_loc', label: 'Konum (dev_loc)' }, { key: 'panel', label: 'Panel (panel)' }, { key: 'pair', label: 'Çift (pair)' },
    { key: 'inlet', label: 'Giriş (inlet)' }, { key: 'dev_nfo', label: 'Bilgi (dev_nfo)' }, { key: 'dev_cap', label: 'Kapasite (dev_cap)' }, { key: 'dev_bcu', label: 'BCU (dev_bcu)' }];
  const RIGHT_TABS = [{ id: 'input', label: 'Giriş', icon: 'pi pi-pencil' }, { id: 'conns', label: 'Bağlantılar', icon: 'pi pi-sitemap' }, { id: 'result', label: 'Sonuç', icon: 'pi pi-check-square' }];

  const str = v => (v === undefined || v === null ? '' : String(v).trim());
  const devTypeLabel = t => (DEV_TYPES.find(x => x.key === t) || {}).label || t || 'Tipi bilinmiyor';
  const devTypeOrder = t => { const i = DEV_TYPES.findIndex(x => x.key === t); return i < 0 ? DEV_TYPES.length + (t ? 0 : 1) : i; };
  const protoLabel = p => (PROTOCOLS.find(x => x.key === p) || {}).label || p || 'Protokol bilinmiyor';
  const normCab = v => str(v).toUpperCase().replace(/^K(?=\d)/, '');
  const defaultPort = p => (p === 'snmp' ? '161' : p === 'modbus' ? '502' : '');
  const endpointKey = (proto, host, port, adr) => [proto, str(host), str(port) || defaultPort(proto), str(adr)].join('|');
  const lc = v => String(v || '').toLocaleLowerCase('tr-TR');

  const BTN = (variant, label, icon, attrs, disabled, loading) =>
    '<button type="button" class="' + buttonClasses(variant, 'sm', !label) + '" ' + (attrs || '') + (disabled ? ' disabled' : '') + '>' +
      (loading ? '<i class="pi pi-spin pi-spinner text-current shrink-0"></i>' : icon ? '<i class="' + icon + ' text-current shrink-0"></i>' : '') +
      (label ? '<span class="truncate">' + esc(label) + '</span>' : '') + '</button>';
  const SEG = (on, first) => 'px-2 py-1' + (first ? '' : ' border-l border-slate-200 dark:border-border-subtle') + (on ? ' bg-sky-600 text-white' : ' hover:bg-slate-50 dark:hover:bg-white/5');
  const FIELD = (label, control, o) => {
    o = o || {};
    return '<div class="flex flex-col gap-1 min-w-0' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<label class="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"><span class="truncate">' + esc(label) +
        (o.required ? '<span class="text-rose-500 font-bold ml-0.5">*</span>' : '') + '</span>' +
        (o.hint ? '<span class="text-[10px] font-normal text-slate-400 truncate"' + (o.hintAttr || '') + '>' + esc(o.hint) + '</span>' : (o.hintAttr ? '<span class="text-[10px] font-normal text-slate-400 truncate"' + o.hintAttr + '></span>' : '')) + '</label>' +
      control +
      (o.error ? '<p class="text-[10px] text-rose-500 font-medium flex items-center gap-1"><i class="pi pi-exclamation-circle text-[10px]"></i>' + esc(o.error) + '</p>' : '') +
    '</div>';
  };

  // ---- ön denetimler (device-manager.model.ts) -----------------------------------------------
  function checkEndpoint(row, proto) {
    const e = [];
    const host = row.con_host || '';
    if (host && /\s/.test(host)) e.push('IP adresinde boşluk ya da satır sonu var');
    else if (host && !IPV4.test(host)) e.push('IP adresi geçersiz: ' + host);
    const port = row.con_port || '';
    if (port && !(/^\d+$/.test(port) && +port >= 1 && +port <= 65535)) e.push('port 1–65535 arasında olmalı: ' + port);
    const adr = row.pro_adr || '';
    if (proto === 'modbus' && adr && !(/^\d+$/.test(adr) && +adr <= 255)) e.push('Modbus birim adresi 0–255 olmalı: ' + adr);
    return e;
  }

  function checkSnmp(row, conSes, def) {
    const e = [];
    const ver = row.pro_ver || (def && def.def_pro_ver) || '';
    const auth = row.pro_auth || (def && def.def_pro_auth) || '';
    const priv = row.pro_priv || (def && def.def_pro_priv) || '';
    const required = (k, label) => { if (!row[k]) e.push(label + ' boş'); };
    if (ver && SNMP_VERSIONS.indexOf(ver) < 0) e.push('SNMP sürümü yalnız ' + SNMP_VERSIONS.join(', ') + ' olabilir (' + ver + ')');
    ['pro_getc', 'pro_setc', 'pro_usr'].forEach(k => { if ((row[k] || '').length > SNMP_TEXT_MAX) e.push(k + ' en çok ' + SNMP_TEXT_MAX + ' karakter (motor uzununu yok sayar)'); });
    if (ver === 'V3') {
      required('pro_usr', 'SNMPv3 kullanıcı adı (pro_usr)');
      if (!row.pro_auth && def && def.def_pro_auth) e.push('model şablonunda kimlik doğrulama (' + def.def_pro_auth + ') var; boş bırakılamaz, açıkça seçin');
      if (!row.pro_priv && def && def.def_pro_priv) e.push('model şablonunda şifreleme (' + def.def_pro_priv + ') var; boş bırakılamaz, açıkça seçin');
      if (auth && SNMP_AUTH.indexOf(auth) < 0) e.push('kimlik doğrulama ' + SNMP_AUTH.join('/') + ' olmalı');
      if (priv && SNMP_PRIV.indexOf(priv) < 0) e.push('şifreleme ' + SNMP_PRIV.join('/') + ' olmalı');
      if (priv && !auth) e.push('şifreleme (pro_priv) kimlik doğrulamasız kullanılamaz');
      if (auth) required('pro_pwd', 'kimlik doğrulama parolası (pro_pwd)');
      if (priv) required('pro_priv_key', 'şifreleme anahtarı (pro_priv_key)');
      if (row.pro_pwd && row.pro_pwd.length < SNMP_PASS_MIN) e.push('parola en az ' + SNMP_PASS_MIN + ' karakter olmalı');
      if (row.pro_priv_key && row.pro_priv_key.length < SNMP_PASS_MIN) e.push('şifreleme anahtarı en az ' + SNMP_PASS_MIN + ' karakter olmalı');
    }
    const identity = row.pro_ver || row.pro_getc || row.pro_setc || row.pro_usr;
    if (identity && conSes === 0) e.push('bağlantının cihaz başına oturumu yok (con_ses = 0): cihazdaki SNMP ayarları yok sayılır');
    return e;
  }

  function buildRow(src) {
    const row = { mdl: str(src.mdl || src.model), prefix: str(src.prefix) };
    const desc = str(src.desc);
    if (desc) row.desc = desc;
    UI_PARAMS.forEach(p => { const v = str(src[p]); if (v) row[p] = p === 'pro_ver' ? v.toUpperCase() : v; });
    return row;
  }

  function applyV3(row, cred) {
    if (row.pro_ver !== 'V3') return row;
    const out = Object.assign({}, row);
    Object.keys(cred).forEach(k => { const v = str(cred[k]); if (v && !out[k]) out[k] = k === 'pro_auth' || k === 'pro_priv' ? v.toUpperCase() : v; });
    return out;
  }

  function mount(el, params) {
    const DM = DCIM.data.deviceManager;
    if (!DM) { el.innerHTML = '<div class="p-4">' + kit.emptyState({ message: 'Model kütüphanesi verisi yok' }) + '</div>'; return null; }
    if (params.get('reset') === '1') DM.resetSession();
    const models = DM.models;
    const modelMap = new Map(models.map(m => [m.id, m]));
    const floors = DM.floors;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

    const emptyForm = () => ({ mdl: '', prefix: '', desc: '', con_host: '', con_port: '', pro_adr: '', pro_con: '', cab: '', row: '', feed: '', pod: '', loc: '',
      dev_loc: '', panel: '', pair: '', inlet: '', dev_nfo: '', dev_cap: '', dev_bcu: '', pro_ver: '', pro_getc: '', pro_setc: '' });
    const S = {
      floorKey: '', hallId: '', libView: 'table', modelSearch: '', protoFilter: '', brandFilter: '', typeFilter: new Set(),
      groupBy: 'type', sortBy: 'name', onlyFitting: false, rightTab: 'input', mode: 'form', form: emptyForm(),
      v3: { pro_usr: '', pro_auth: '', pro_pwd: '', pro_priv: '', pro_priv_key: '' }, showSecrets: false, showAdvanced: false,
      parsed: null, fileName: '', fileError: '', verified: null, version: 0, lastResult: null, busy: false, busyText: '', notice: null,
      connProto: '', connScope: 'floor'
    };

    // ---- türetilenler -------------------------------------------------------------------
    const floor = () => floors.find(f => f.key === S.floorKey) || null;
    const halls = () => (floor() ? floor().halls : []);
    const hall = () => halls().find(h => h.id === S.hallId) || null;
    const hallRequired = () => halls().length > 0;
    const place = () => { const f = floor(); return !f ? '' : hall() ? f.name + ' / ' + hall().name : f.name; };
    const selectedModel = () => modelMap.get(S.form.mdl);
    const docFor = m => {
      const f = floor();
      if (!m || !f) return '';
      if (f.key === '1') return m.dev_type === 'pdu' ? 'CMR/T01' : 'CMR/T00';
      return f.docs[0];
    };
    const fitsFloor = m => {
      if (!m.katlar || !floor()) return null;
      const doc = docFor(m).replace('CMR/', '');
      return m.katlar.split(/\s+/).indexOf(doc) >= 0;
    };
    const floorNames = m => {
      if (!m.katlar) return 'Kat bilgisi yok';
      const names = [];
      m.katlar.split(/\s+/).forEach(code => {
        const f = floors.find(x => x.docs.indexOf('CMR/' + code) >= 0);
        if (f && names.indexOf(f.name) < 0) names.push(f.name);
      });
      return names.join(', ');
    };
    const allConns = () => DM.connections();
    const docConns = doc => allConns().filter(c => c.document === doc);
    const modelConnections = () => docConns(docFor(selectedModel()));
    const formConnection = () => { const pc = S.form.pro_con || (selectedModel() || {}).def_pro_con || ''; return modelConnections().find(c => c.id === pc); };
    const formVer = () => S.form.pro_ver || (selectedModel() || {}).def_pro_ver || '';
    const isPduModel = () => (selectedModel() || {}).dev_type === 'pdu';
    const isSnmpModel = () => { const p = (selectedModel() || {}).proto; return !p || p === 'snmp'; };
    const isEnergyModel = () => ENERGY_DEV_TYPES.indexOf((selectedModel() || {}).dev_type || '') >= 0;
    const energyLocs = () => (S.floorKey ? DM.energyLocs(S.floorKey) : []);
    const touch = () => { S.version++; };
    const modelLabel = id => { const m = modelMap.get(id); return m ? (str(m.dev_mfr + ' ' + m.dev_mdl) || m.id) : id; };

    const devIndex = () => {
      const ids = new Map(); const eps = new Map();
      DM.devices().forEach(d => {
        ids.set(d.id, d.document);
        if (d.host) eps.set(endpointKey(d.proto, d.host, d.port, d.adr || '1'), d.id + '|' + d.document);
      });
      return { ids, eps };
    };

    const conError = () => {
      const m = selectedModel(); const pc = S.form.pro_con;
      if (!m || !pc || !floor()) return '';
      const c = modelConnections().find(x => x.id === pc);
      if (!c) return 'Bu bağlantı katta yok';
      if (m.proto && c.proto !== m.proto) return 'Bağlantı ' + protoLabel(c.proto) + ', model ' + protoLabel(m.proto);
      return '';
    };

    // PDU yardımcısı
    const pduCabinets = () => {
      const doc = docFor(selectedModel());
      const map = new Map();
      DM.devices().filter(d => d.document === doc && /_PDU_[A-Z]_DV$/.test(d.id)).forEach(d => {
        const cab = normCab(d.id.replace(/_PDU_[A-Z]_DV$/, ''));
        const e = map.get(cab) || { cab, ids: [], pods: [] };
        e.ids.push(d.id);
        map.set(cab, e);
      });
      const cabs = DM.cabinets(S.floorKey);
      map.forEach(e => { const c = cabs.find(x => x.code === e.cab); if (c && c.pod && e.pods.indexOf(c.pod) < 0) e.pods.push(c.pod); });
      return Array.from(map.values()).sort((a, b) => a.cab.localeCompare(b.cab));
    };
    const cabinetPdus = () => { const c = normCab(S.form.cab); return c ? pduCabinets().find(x => x.cab === c) : undefined; };
    const pduSuggestion = () => {
      if (!isPduModel()) return null;
      const c = normCab(S.form.cab);
      if (!c || !/^[A-Z0-9]+$/.test(c)) return null;
      const ids = devIndex().ids;
      for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const prefix = 'K' + c + '_PDU_' + letter;
        if (!ids.has(prefix + DEV_SUFFIX)) return { prefix, desc: c + '-PDU-' + letter, letter };
      }
      return null;
    };
    function applyPduSuggestion() {
      const s = pduSuggestion();
      if (!s) return;
      S.form.cab = normCab(S.form.cab);
      S.form.prefix = s.prefix;
      S.form.desc = s.desc;
      const cp = cabinetPdus();
      const pods = cp ? cp.pods : [];
      const cab = DM.cabinets(S.floorKey).find(x => x.code === S.form.cab);
      if (!S.form.pod && pods.length === 1) S.form.pod = pods[0];
      else if (!S.form.pod && cab && cab.pod) S.form.pod = cab.pod;
      if (!S.form.row && cab && cab.col) S.form.row = cab.col;
      touch();
    }

    // Satırlar + ön denetim (refreshCache karşılığı)
    function sourceRows() {
      let src = [];
      if (S.mode === 'form') src = [{ rowNo: 1, row: buildRow(S.form) }];
      else if (S.parsed && !S.parsed.error) src = S.parsed.rows;
      if (S.hallId) src = src.map(s => ({ rowNo: s.rowNo, row: Object.assign({}, s.row, { loc: s.row.loc || S.hallId }) }));
      return src.map(s => ({ rowNo: s.rowNo, row: applyV3(s.row, S.v3) }));
    }
    function checkedRows() {
      const seen = new Map();
      const idx = devIndex();
      const seenEp = new Map();
      const locIds = new Set(halls().map(h => h.id).concat(energyLocs().map(e => e.id)));
      return sourceRows().map(({ rowNo, row }) => {
        const errors = [];
        if (!row.mdl) errors.push('model boş');
        else if (!modelMap.has(row.mdl)) errors.push('model kütüphanede yok: ' + row.mdl);
        if (!row.prefix) errors.push('prefix boş');
        else if (!PREFIX_RE.test(row.prefix)) errors.push('prefix yalnız A-Z a-z 0-9 _ - içerebilir');
        if (!row.con_host) errors.push('con_host boş');
        if (row.prefix) {
          const first = seen.get(row.prefix);
          if (first !== undefined) errors.push('prefix yineleniyor (satır ' + first + ')');
          else seen.set(row.prefix, rowNo);
        }
        const m = modelMap.get(row.mdl);
        if (m && floor()) {
          if (fitsFloor(m) === false) {
            errors.push('model bu kata uygun değil');
          } else {
            const pc = row.pro_con || m.def_pro_con || '';
            const con = docConns(docFor(m)).find(x => x.id === pc);
            if (pc && !con) errors.push('bağlantı bu katta yok: ' + pc);
            else if (con && m.proto && con.proto !== m.proto) errors.push('bağlantı ' + protoLabel(con.proto) + ', model ' + protoLabel(m.proto));
            const proto = (con && con.proto) || m.proto;
            if (proto === 'snmp') checkSnmp(row, con ? con.con_ses : null, m).forEach(x => errors.push(x));
            checkEndpoint(row, proto).forEach(x => errors.push(x));
            if (proto && row.con_host) {
              const key = endpointKey(proto, row.con_host, row.con_port || m.def_con_port, row.pro_adr || '1');
              const prev = seenEp.get(key);
              if (prev !== undefined) errors.push('aynı IP, port ve adres satır ' + prev + "'de de var");
              else seenEp.set(key, rowNo);
              const hit = idx.eps.get(key);
              if (hit) {
                const [hid, hdoc] = hit.split('|');
                const hf = floors.find(f => f.docs.indexOf(hdoc) >= 0);
                errors.push('bu IP, port ve adres zaten ' + hid + ' cihazında (' + (hf ? hf.name : 'başka kat') + ')');
              }
            }
            if (row.loc && !locIds.has(row.loc)) errors.push('konum kaydında yok: ' + row.loc);
            if ((m.dev_type === 'pdu' || m.dev_type === 'pmm') && !row.cab) errors.push('PDU için kabin (cab) zorunlu');
          }
        }
        return { rowNo, row, errors };
      });
    }
    function capacityIssues(checked) {
      const adding = new Map();
      checked.forEach(c => {
        const m = modelMap.get(c.row.mdl);
        if (!m) return;
        const doc = docFor(m);
        const pc = c.row.pro_con || m.def_pro_con || '';
        const k = doc + '|' + pc;
        adding.set(k, (adding.get(k) || 0) + 1);
      });
      const out = [];
      adding.forEach((n, k) => {
        const [doc, pc] = k.split('|');
        const c = docConns(doc).find(x => x.id === pc);
        if (c && c.con_ses > 0 && c.devCount + n > c.con_ses) out.push({ proCon: pc, proto: c.proto, conSes: c.con_ses, current: c.devCount, adding: n });
      });
      return out;
    }
    const signature = rows => JSON.stringify({ floor: S.floorKey, hall: S.hallId, rows });
    const canVerify = checked => !S.busy && !!floor() && (!hallRequired() || !!S.hallId) && models.length > 0 && checked.length > 0 &&
      checked.every(c => !c.errors.length) && !(S.mode === 'excel' && S.parsed && S.parsed.error);
    const canAdd = checked => canVerify(checked) && !!S.verified && S.verified.version === S.version;

    // ---- model kütüphanesi süzgeci --------------------------------------------------------
    function baseFiltered(skipType) {
      const q = lc(S.modelSearch.trim());
      return models.filter(m => {
        if (S.protoFilter && m.proto !== S.protoFilter) return false;
        if (S.brandFilter && (S.brandFilter === '-' ? !!m.dev_mfr : m.dev_mfr !== S.brandFilter)) return false;
        if (!skipType && S.typeFilter.size && !S.typeFilter.has(m.dev_type)) return false;
        if (S.onlyFitting && floor() && fitsFloor(m) === false) return false;
        if (q && !lc([m.id, m.dev_mfr, m.dev_mdl, m.desc, devTypeLabel(m.dev_type)].join(' ')).includes(q)) return false;
        return true;
      });
    }
    function filteredModels() {
      const list = baseFiltered(false);
      return list.sort((a, b) => S.sortBy === 'points'
        ? b.n_io - a.n_io
        : (a.dev_mfr + ' ' + a.dev_mdl).localeCompare(b.dev_mfr + ' ' + b.dev_mdl, 'tr'));
    }
    function modelGroups() {
      const list = filteredModels();
      if (S.groupBy === 'none') return list.length ? [{ key: '*', label: '', models: list }] : [];
      const map = new Map();
      list.forEach(m => { const k = S.groupBy === 'type' ? m.dev_type : m.dev_mfr; if (!map.has(k)) map.set(k, []); map.get(k).push(m); });
      return Array.from(map.entries())
        .sort((a, b) => S.groupBy === 'type' ? devTypeOrder(a[0]) - devTypeOrder(b[0]) : (a[0] || '~').localeCompare(b[0] || '~', 'tr'))
        .map(([k, ms]) => ({ key: k, label: S.groupBy === 'type' ? devTypeLabel(k) : (k || 'Marka bilinmiyor'), models: ms }));
    }
    const brands = Array.from(new Set(models.map(m => m.dev_mfr).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'tr'));
    const hasUnknownBrand = models.some(m => !m.dev_mfr);
    const hasFilters = () => !!(S.modelSearch || S.protoFilter || S.brandFilter || S.typeFilter.size);

    // ---- iskelet --------------------------------------------------------------------------
    el.innerHTML =
      '<div class="eng-dm p-3 flex-1 min-h-0 flex flex-col gap-2 overflow-hidden max-md:overflow-y-auto">' +
        kit.pageHeader({ title: 'Cihaz Ekle (Model Kütüphanesi)', compact: true, breadcrumbs: [{ label: 'Mühendislik', href: 'engineering.html#home' }, { label: 'Cihaz Ekle (Model Kütüphanesi)' }] }) +
        '<div data-dm-top class="shrink-0 flex flex-wrap items-end gap-3 px-3 py-2 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px]"></div>' +
        '<div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] md:grid-rows-[minmax(0,1fr)] gap-2">' +
          // Model kütüphanesi kartı
          '<section class="eng-dm-card bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col min-h-0 max-md:min-h-[30rem]">' +
            '<div class="px-3.5 pt-3 pb-2 mx-0 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80">' +
              '<div class="flex items-center gap-2 min-w-0"><i class="pi pi-book text-sky-600 dark:text-sky-400 text-sm"></i>' +
                '<h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">Model kütüphanesi</h3>' +
                '<span data-dm-libbadge class="px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20"></span></div>' +
              '<div class="flex items-center gap-2"><div data-dm-report></div><div data-dm-viewbtns class="flex gap-1" role="group" aria-label="Görünüm"></div></div>' +
            '</div>' +
            '<div class="flex-1 min-h-0 flex flex-col gap-2 p-3">' +
              '<div class="shrink-0 flex flex-col gap-1.5">' +
                '<div class="flex flex-wrap items-center gap-2">' +
                  '<input type="search" data-dm-search class="scada-input flex-1 min-w-[10rem]" aria-label="Model ara (marka, model, tip, id)" placeholder="Ara: marka, model, tip, id">' +
                  '<div data-dm-protof class="flex rounded-[2px] border border-slate-200 dark:border-border-subtle overflow-hidden text-[11px]" role="group" aria-label="Protokol"></div>' +
                  '<select data-dm-brand class="scada-input w-36" aria-label="Marka"><option value="">Bütün markalar</option>' +
                    brands.map(b => '<option value="' + esc(b) + '">' + esc(b) + '</option>').join('') +
                    (hasUnknownBrand ? '<option value="-">Marka bilinmiyor</option>' : '') + '</select>' +
                '</div>' +
                '<div data-dm-chips class="flex flex-wrap items-center gap-1" role="group" aria-label="Cihaz tipi"></div>' +
                '<div data-dm-libopts class="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300"></div>' +
              '</div>' +
              '<div data-dm-liblist class="flex-1 min-h-0 overflow-auto border border-slate-200 dark:border-border-subtle rounded-[2px]"></div>' +
            '</div>' +
          '</section>' +
          // Cihazlar kartı
          '<section class="eng-dm-card bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xs flex flex-col min-h-0 max-md:min-h-[36rem]">' +
            '<div class="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80">' +
              '<div class="flex items-center gap-2 min-w-0"><i class="pi pi-server text-sky-600 dark:text-sky-400 text-sm"></i>' +
                '<div class="min-w-0"><h3 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 leading-none">Cihazlar</h3>' +
                '<p data-dm-place class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate"></p></div></div>' +
              '<div data-dm-tabs class="flex rounded-[2px] border border-slate-200 dark:border-border-subtle overflow-hidden text-[11px]" role="tablist" aria-label="Cihazlar bölümleri"></div>' +
            '</div>' +
            '<div data-dm-right class="flex-1 min-h-0 overflow-auto p-3 text-xs text-slate-800 dark:text-slate-200"></div>' +
          '</section>' +
        '</div>' +
      '</div>';

    const $ = sel => el.querySelector(sel);

    // ---- üst çubuk --------------------------------------------------------------------------
    function renderTop() {
      const f = floor();
      const checked = checkedRows();
      const verifyOk = canVerify(checked);
      const addOk = canAdd(checked);
      let status;
      if (S.busy) {
        status = '<i class="pi pi-spin pi-spinner text-xs text-sky-600"></i><span class="text-sky-700 dark:text-sky-300">' + esc(S.busyText) + ' (en çok 120 sn)</span>';
      } else if (S.notice) {
        const ic = { ok: 'pi-check-circle text-emerald-600', info: 'pi-info-circle text-sky-600', warn: 'pi-exclamation-triangle text-amber-600', error: 'pi-times-circle text-rose-600' }[S.notice.kind];
        const tc = { ok: 'text-emerald-700 dark:text-emerald-300', info: 'text-sky-700 dark:text-sky-300', warn: 'text-amber-700 dark:text-amber-300', error: 'text-rose-700 dark:text-rose-300' }[S.notice.kind];
        status = '<i class="pi text-xs ' + ic + '"></i><span class="' + tc + '">' + esc(S.notice.text) + '</span>';
      } else if (!f) {
        status = '<span class="text-slate-500">Kat seçin (ya da Bağlantılar panelinden bir kata tıklayın).</span>';
      } else if (hallRequired() && !S.hallId) {
        status = '<span class="text-amber-700 dark:text-amber-300">Salon seçin.</span>';
      } else status = '';
      $('[data-dm-top]').innerHTML =
        FIELD('Kat', '<select data-dm-floor class="scada-input w-full"' + (S.busy ? ' disabled' : '') + '><option value="">Kat seçin…</option>' +
          floors.map(x => '<option value="' + x.key + '"' + (x.key === S.floorKey ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>', { required: true, cls: 'w-44' }) +
        FIELD('Salon', '<select data-dm-hall class="scada-input w-full"' + (S.busy || !f || !halls().length ? ' disabled' : '') + '><option value="">' +
          (!f ? 'Önce kat seçin' : halls().length ? 'Salon seçin…' : 'Salon tanımlı değil') + '</option>' +
          halls().map(h => '<option value="' + h.id + '"' + (h.id === S.hallId ? ' selected' : '') + '>' + esc(h.name) + '</option>').join('') + '</select>', { required: hallRequired(), cls: 'w-44' }) +
        '<div class="pb-0.5">' + BTN('ghost', '', 'pi pi-refresh', 'data-dm-act="reload" title="Katları, salonları ve bağlantıları yenile"', S.busy) + '</div>' +
        '<div class="flex-1 min-w-[12rem] text-[11px] flex items-center gap-2 pb-1.5" role="status" aria-live="polite">' + status + '</div>' +
        '<div class="flex gap-2 pb-0.5">' +
          BTN('secondary', 'Doğrula', 'pi pi-search', 'data-dm-act="verify" title="Kapıya kuru çalıştırma (dry run): hiçbir şey yazılmaz"', !verifyOk, S.busy && S.busyText.indexOf('Doğrula') === 0) +
          BTN('primary', 'Ekle', 'pi pi-plus', 'data-dm-act="add" title="' + (addOk ? 'Doğrulanan satırları ekle' : 'Önce doğrulayın') + '"', !addOk, S.busy && S.busyText.indexOf('Cihaz') === 0) +
        '</div>';
      $('[data-dm-place]').textContent = place() || 'Kat seçilmedi';
    }

    // ---- kütüphane ----------------------------------------------------------------------------
    function renderLibHead() {
      $('[data-dm-viewbtns]').innerHTML =
        BTN(S.libView === 'table' ? 'primary' : 'secondary', '', 'pi pi-list', 'data-dm-view="table" aria-label="Tablo görünümü" title="Tablo görünümü"') +
        BTN(S.libView === 'cards' ? 'primary' : 'secondary', '', 'pi pi-th-large', 'data-dm-view="cards" aria-label="Kart görünümü" title="Kart görünümü"');
      $('[data-dm-protof]').innerHTML =
        '<button type="button" data-dm-proto="" class="' + SEG(!S.protoFilter, true) + '">Tümü</button>' +
        PROTOCOLS.map(p => '<button type="button" data-dm-proto="' + p.key + '" class="' + SEG(S.protoFilter === p.key) + '">' + p.label + '</button>').join('');
      $('[data-dm-brand]').value = S.brandFilter;
      $('[data-dm-libopts]').innerHTML =
        '<label class="flex items-center gap-1">Grupla <select data-dm-group class="scada-input py-0.5">' +
          [['type', 'Tip'], ['brand', 'Marka'], ['none', 'Yok']].map(o => '<option value="' + o[0] + '"' + (S.groupBy === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
        '<label class="flex items-center gap-1">Sırala <select data-dm-sort class="scada-input py-0.5">' +
          [['name', 'Marka, model'], ['points', 'Nokta sayısı']].map(o => '<option value="' + o[0] + '"' + (S.sortBy === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
        '<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" data-dm-fitting class="accent-sky-600"' + (S.onlyFitting ? ' checked' : '') + '> Yalnız ' + esc((floor() || {}).name || 'seçili kat') + ' için uygun</label>';
    }
    function renderChips() {
      const base = baseFiltered(true);
      const n = new Map();
      base.forEach(m => n.set(m.dev_type, (n.get(m.dev_type) || 0) + 1));
      const keys = DEV_TYPES.map(t => t.key).filter(k => models.some(m => m.dev_type === k));
      $('[data-dm-chips]').innerHTML = keys.map(k => {
        const on = S.typeFilter.has(k); const c = n.get(k) || 0;
        return '<button type="button" data-dm-type="' + k + '" class="px-2 py-0.5 rounded-full border text-[11px] flex items-center gap-1 ' +
          (on ? 'bg-sky-600 border-sky-600 text-white' : c ? 'border-slate-200 dark:border-border-subtle hover:bg-slate-50 dark:hover:bg-white/5' : 'border-slate-100 dark:border-border-subtle text-slate-400') +
          '" aria-pressed="' + on + '">' + esc(devTypeLabel(k)) + ' <span class="text-[10px] opacity-75">' + c + '</span></button>';
      }).join('') + (hasFilters() ? '<button type="button" data-dm-act="clear-filters" class="ml-1 text-[11px] text-sky-700 dark:text-sky-400 underline">Süzgeçleri temizle</button>' : '');
    }
    function fitCls(m) { return fitsFloor(m) === false ? 'text-amber-600' : 'text-slate-500 dark:text-slate-400'; }
    function renderLibList() {
      const groups = modelGroups();
      const fm = filteredModels();
      $('[data-dm-libbadge]').textContent = fm.length + ' / ' + models.length;
      if (reportApi && reportApi.setTotal) reportApi.setTotal(fm.length);
      const pickable = S.mode === 'form';
      let h = '';
      if (!groups.length) {
        h = '<p class="px-2 py-2 text-[11px] text-slate-500">Süzgeçlere ya da bu kata uyan model yok. ' +
          ((hasFilters() || S.onlyFitting) ? '<button type="button" data-dm-act="show-all" class="text-sky-700 dark:text-sky-400 underline">Hepsini göster</button>' : '') + '</p>';
      } else if (S.libView === 'table') {
        const cols = (S.groupBy !== 'type' ? 1 : 0) + (S.groupBy !== 'brand' ? 1 : 0) + 4;
        h = '<table class="w-full text-[11px] border-collapse"><thead class="sticky top-0 z-10 bg-slate-100 dark:bg-surface-base"><tr>' +
          (S.groupBy !== 'type' ? '<th class="px-2 py-1 text-left">Tip</th>' : '') + (S.groupBy !== 'brand' ? '<th class="px-2 py-1 text-left">Marka</th>' : '') +
          '<th class="px-2 py-1 text-left">Model</th><th class="px-2 py-1 text-left">Protokol</th><th class="px-2 py-1 text-right">Blok/Nokta</th><th class="px-2 py-1 text-left">Katlar</th></tr></thead>' +
          groups.map(g => '<tbody>' +
            (g.label ? '<tr class="bg-slate-50 dark:bg-white/5"><th colspan="' + cols + '" class="px-2 py-1 text-left text-[10px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">' +
              esc(g.label) + ' <span class="font-normal normal-case text-slate-400">(' + g.models.length + ')</span></th></tr>' : '') +
            g.models.map(m => '<tr data-dm-model="' + esc(m.id) + '" class="border-t border-slate-100 dark:border-border-subtle' +
                (pickable ? ' cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : '') + (pickable && S.form.mdl === m.id ? ' bg-sky-500/10' : '') + '">' +
              (S.groupBy !== 'type' ? '<td class="px-2 py-1">' + esc(devTypeLabel(m.dev_type)) + '</td>' : '') +
              (S.groupBy !== 'brand' ? '<td class="px-2 py-1">' + esc(m.dev_mfr || '—') + '</td>' : '') +
              '<td class="px-2 py-1"><span class="font-semibold">' + esc(m.dev_mdl || m.desc) + '</span><span class="block font-mono text-[10px] text-slate-400">' + esc(m.id) + '@' + esc(m.ver) + '</span></td>' +
              '<td class="px-2 py-1">' + esc(protoLabel(m.proto)) + '</td>' +
              '<td class="px-2 py-1 text-right">' + m.n_bi + ' / ' + m.n_io + '</td>' +
              '<td class="px-2 py-1 text-[10px]' + (fitsFloor(m) === false ? ' text-amber-600' : '') + '">' + esc(floorNames(m)) + '</td></tr>').join('') +
          '</tbody>').join('') + '</table>';
      } else {
        h = '<div class="p-2 flex flex-col gap-3">' + groups.map(g => '<section>' +
          (g.label ? '<h4 class="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">' + esc(g.label) + ' <span class="font-normal normal-case text-slate-400">(' + g.models.length + ')</span></h4>' : '') +
          '<div class="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">' +
          g.models.map(m => '<button type="button" data-dm-model="' + esc(m.id) + '" class="text-left p-2 rounded-[2px] border bg-white dark:bg-surface-card flex flex-col gap-1 disabled:cursor-default ' +
              (pickable && S.form.mdl === m.id ? 'border-sky-500 ring-1 ring-sky-500/40 bg-sky-500/5' : 'border-slate-200 dark:border-border-subtle hover:border-sky-400') + '"' + (!pickable || S.busy ? ' disabled' : '') + '>' +
            '<span class="text-[10px] text-slate-500 dark:text-slate-400">' + esc(m.dev_mfr || 'Marka bilinmiyor') + '</span>' +
            '<span class="text-xs font-bold leading-tight">' + esc(m.dev_mdl || m.desc) + '</span>' +
            '<span class="flex flex-wrap gap-1"><span class="px-1.5 rounded-[2px] text-[9px] font-bold bg-slate-100 dark:bg-white/10">' + esc(devTypeLabel(m.dev_type)) + '</span>' +
              '<span class="px-1.5 rounded-[2px] text-[9px] font-bold ' + (m.proto === 'snmp' ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300') + '">' + esc(protoLabel(m.proto)) + '</span></span>' +
            '<span class="text-[10px] text-slate-500 dark:text-slate-400">' + m.n_bi + ' blok · ' + m.n_io + ' nokta</span>' +
            '<span class="text-[10px] ' + fitCls(m) + '">' + esc(floorNames(m)) + '</span></button>').join('') +
          '</div></section>').join('') + '</div>';
      }
      $('[data-dm-liblist]').innerHTML = h;
    }
    function renderLib() { renderLibHead(); renderChips(); renderLibList(); }

    // ---- sağ kart --------------------------------------------------------------------------
    function renderTabs() {
      $('[data-dm-tabs]').innerHTML = RIGHT_TABS.map((t, i) =>
        '<button type="button" role="tab" data-dm-tab="' + t.id + '" class="px-2.5 py-1 flex items-center gap-1' + (i ? ' border-l border-slate-200 dark:border-border-subtle' : '') +
          (S.rightTab === t.id ? ' bg-sky-600 text-white' : ' hover:bg-slate-50 dark:hover:bg-white/5') + '" aria-selected="' + (S.rightTab === t.id) + '">' +
          '<i class="' + t.icon + ' text-[10px]"></i>' + t.label +
          (t.id === 'result' && S.lastResult ? '<span class="px-1 rounded-full text-[9px] font-bold text-white ' + (S.lastResult.res.ok ? 'bg-emerald-500' : 'bg-rose-500') + '">' + S.lastResult.res.rows.length + '</span>' : '') +
        '</button>').join('');
    }

    function v3Html() {
      const v = S.v3;
      const lvl = v.pro_priv ? 'authPriv' : v.pro_auth ? 'authNoPriv' : 'noAuthNoPriv';
      const lvlCls = v.pro_priv ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : v.pro_auth ? 'border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-rose-500/40 text-rose-700 dark:text-rose-400';
      const pw = S.showSecrets ? 'text' : 'password';
      return '<div class="flex flex-col gap-2">' +
        '<div class="flex items-center justify-between gap-2"><span class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">SNMPv3 kimliği</span>' +
          '<span class="px-1.5 py-px rounded-[2px] text-[10px] font-semibold border ' + lvlCls + '" title="Güvenlik düzeyi">' + lvl + '</span></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">' +
          FIELD('Kullanıcı adı (pro_usr)', '<input data-v3="pro_usr" class="scada-input w-full font-mono" autocomplete="off" maxlength="' + SNMP_TEXT_MAX + '" value="' + esc(v.pro_usr) + '">', { required: true, hint: 'en çok ' + SNMP_TEXT_MAX + ' karakter' }) +
          FIELD('Kimlik doğrulama (pro_auth)', '<select data-v3="pro_auth" class="scada-input w-full"><option value="">Yok</option>' + SNMP_AUTH.map(a => '<option' + (v.pro_auth === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>') +
          FIELD('Parola (pro_pwd)', '<input data-v3="pro_pwd" type="' + pw + '" autocomplete="new-password" class="scada-input w-full font-mono" value="' + esc(v.pro_pwd) + '"' + (!v.pro_auth ? ' disabled' : '') + '>', { hint: 'en az ' + SNMP_PASS_MIN + ' karakter' }) +
          FIELD('Şifreleme (pro_priv)', '<select data-v3="pro_priv" class="scada-input w-full"' + (!v.pro_auth ? ' disabled' : '') + '><option value="">Yok</option>' + SNMP_PRIV.map(a => '<option' + (v.pro_priv === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>', { hint: !v.pro_auth ? 'önce kimlik doğrulama' : '' }) +
          FIELD('Şifreleme anahtarı (pro_priv_key)', '<input data-v3="pro_priv_key" type="' + pw + '" autocomplete="new-password" class="scada-input w-full font-mono" value="' + esc(v.pro_priv_key) + '"' + (!v.pro_priv ? ' disabled' : '') + '>', { hint: 'en az ' + SNMP_PASS_MIN + ' karakter' }) +
          '<label class="flex items-end gap-1.5 pb-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" data-dm-secrets class="accent-sky-600"' + (S.showSecrets ? ' checked' : '') + '> Parolaları göster</label>' +
        '</div>' +
        '<p class="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">Kimlik cihazın kaydına yazılır (sahadaki V3 cihazlar gibi); motor cihazdaki alanı bağlantınınkinin önüne koyar. ' +
          'Parolalar XML dosyasında motorun beklediği biçimde düz metin saklanır; sonuç tablosuna ve Excel sonuç dosyasına yazılmaz.</p>' +
      '</div>';
    }

    function pduHelperHtml() {
      if (!isPduModel() || !S.form.cab) return '';
      const cp = cabinetPdus();
      const s = pduSuggestion();
      return '<div class="md:col-span-4 rounded-[2px] border border-sky-500/30 bg-sky-500/5 px-2 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">' +
        '<span class="text-slate-600 dark:text-slate-300"><i class="pi pi-server text-[10px] text-sky-500 mr-1"></i>' +
          (cp ? 'Kabin <strong class="font-mono">' + esc(cp.cab) + '</strong> içinde ' + cp.ids.length + ' PDU: <span class="font-mono">' + esc(cp.ids.join(', ')) + '</span>' + (cp.pods.length ? ' · POD ' + esc(cp.pods.join(', ')) : '')
              : 'Bu katta <strong class="font-mono">' + esc(S.form.cab) + '</strong> kabininde PDU yok (yeni kabin).') + '</span>' +
        (s ? '<span class="flex items-center gap-2"><span class="text-slate-500">Önerilen:</span><span class="font-mono font-semibold">' + esc(s.prefix) + '_DV</span>' +
              '<span class="text-slate-500">· ' + esc(s.desc) + '</span>' +
              '<button type="button" data-dm-act="apply-pdu" class="px-2 py-0.5 rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white font-semibold disabled:opacity-50"' + (S.form.prefix === s.prefix ? ' disabled' : '') + '>' + (S.form.prefix === s.prefix ? 'Uygulandı' : 'Uygula') + '</button></span>'
           : '<span class="text-rose-600 dark:text-rose-400">Kabin kodu yalnız harf ve rakam olmalı.</span>') +
      '</div>';
    }

    function checksHtml() {
      const checked = checkedRows();
      let h = '';
      if (S.mode === 'form' && checked[0] && checked[0].errors.length && (S.form.mdl || S.form.prefix || S.form.con_host)) {
        h += '<ul class="list-disc pl-5 text-[11px] text-rose-600 dark:text-rose-400" aria-live="polite">' + checked[0].errors.map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>';
      }
      const cap = capacityIssues(checked);
      if (cap.length) {
        h += '<div class="px-3 py-2 rounded-[2px] border text-[11px] bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300" role="status">' +
          cap.map(c => '<div><span class="font-mono">' + esc(c.proCon) + '</span> (' + esc(protoLabel(c.proto)) + '): yuva yetmeyebilir — ' + c.current + ' mevcut + ' + c.adding + ' eklenecek &gt; ' + c.conSes + ' (con_ses artırılıp kat yenilenmeli)</div>').join('') + '</div>';
      }
      return h;
    }

    function formHtml() {
      const m = selectedModel();
      const groups = modelGroups();
      const conns = modelConnections().filter(c => !m || !m.proto || c.proto === m.proto);
      const conGroups = PROTOCOLS.map(p => ({ label: ((floor() || {}).name || '') + ' · ' + p.label, options: conns.filter(c => c.proto === p.key) })).filter(g => g.options.length);
      if (S.form.pro_con && !conns.some(c => c.id === S.form.pro_con)) conGroups.push({ label: 'Listede olmayan', options: [{ id: S.form.pro_con, con_ses: 0, devCount: 0 }] });
      const inp = (key, attrs) => '<input data-f="' + key + '" class="scada-input w-full' + (attrs && attrs.mono ? ' font-mono' : '') + '" value="' + esc(S.form[key]) + '"' + (attrs && attrs.ph ? ' placeholder="' + esc(attrs.ph) + '"' : '') + (attrs && attrs.extra ? ' ' + attrs.extra : '') + '>';
      const idPreview = S.form.prefix.trim() ? S.form.prefix.trim() + DEV_SUFFIX : '';
      const verFallback = m && m.def_pro_ver ? 'model şablonu: ' + m.def_pro_ver : (formConnection() && formConnection().snmpVer ? 'bağlantı: ' + formConnection().snmpVer : '');
      const communityFallback = m && m.hasDefCommunity ? 'boşsa model şablonununki' : 'boşsa bağlantınınki';
      const pduCabs = pduCabinets();
      const fv = formVer();
      const h = hall();
      const eLocs = energyLocs();
      return '<div class="flex flex-col gap-2">' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">' +
          FIELD('Model', '<select data-f="mdl" class="scada-input w-full"><option value="">Model seçin…</option>' +
            groups.map(g => '<optgroup label="' + esc(g.label || 'Modeller') + '">' + g.models.map(x => '<option value="' + esc(x.id) + '"' + (x.id === S.form.mdl ? ' selected' : '') + '>' + esc(x.dev_mfr + ' ' + (x.dev_mdl || x.desc)) + '</option>').join('') + '</optgroup>').join('') +
            (m && !filteredModels().includes(m) ? '<option value="' + esc(m.id) + '" selected>' + esc(modelLabel(m.id)) + '</option>' : '') + '</select>',
            { required: true, hint: m ? devTypeLabel(m.dev_type) + ' · ' + protoLabel(m.proto) : 'listeden ya da buradan seçin', error: S.form.mdl && !m ? 'Model kütüphanede yok' : '' }) +
          FIELD('Önek (prefix)', inp('prefix', { mono: true, ph: 'K3FA09_PDU_C' }), { required: true, hint: idPreview ? 'cihaz id: ' + idPreview : 'A-Z a-z 0-9 _ -', hintAttr: ' data-dm-idhint' }) +
          FIELD('Açıklama (desc)', inp('desc', { ph: '3FA09-PDU-C' }), { hint: m ? 'boşsa: ' + m.desc : '' }) +
        '</div>' +
        '<div class="grid grid-cols-2 md:grid-cols-4 gap-2">' +
          FIELD('IP (con_host)', inp('con_host', { mono: true, ph: '10.201.27.30' }), { required: true }) +
          FIELD('Port (con_port)', inp('con_port', { extra: 'inputmode="numeric"' }), { hint: m && m.def_con_port ? 'boşsa: ' + m.def_con_port : '' }) +
          FIELD('Adres (pro_adr)', inp('pro_adr')) +
          FIELD('Bağlantı (pro_con)', '<select data-f="pro_con" class="scada-input w-full"' + (!m ? ' disabled' : '') + '><option value="">' +
              esc(!m ? 'Önce model' : m.def_pro_con ? 'Model varsayılanı (' + m.def_pro_con + ')' : 'Seçin…') + '</option>' +
              conGroups.map(g => '<optgroup label="' + esc(g.label) + '">' + g.options.map(c => '<option value="' + esc(c.id) + '"' + (c.id === S.form.pro_con ? ' selected' : '') + '>' + esc(c.id + (c.con_ses ? ' — ' + c.devCount + '/' + c.con_ses : '')) + '</option>').join('') + '</optgroup>').join('') +
            '</select>', { error: conError() }) +
          LOCATION_FIELDS.map(f => FIELD(f.label, inp(f.key, { extra: f.key === 'cab' && isPduModel() ? 'list="dm-pdu-cabs"' : '' }), { required: f.key === 'cab' && isPduModel() })).join('') +
          '<datalist id="dm-pdu-cabs">' + DM.cabinets(S.floorKey).map(c => { const p = pduCabs.find(x => x.cab === c.code); return '<option value="' + esc(c.code) + '">' + (p ? p.ids.length + ' PDU' : 'PDU yok') + '</option>'; }).join('') + '</datalist>' +
          '<div data-dm-pdu class="contents">' + pduHelperHtml() + '</div>' +
          FIELD('Konum (loc)', '<select data-f="loc" class="scada-input w-full"><option value="">' + esc(h ? 'Salon: ' + h.name : 'Salon (sayfada seçilen)') + '</option>' +
              (eLocs.length ? '<optgroup label="Enerji konumları">' + eLocs.map(e => '<option value="' + esc(e.id) + '"' + (e.id === S.form.loc ? ' selected' : '') + '>' + esc(e.fullName) + '</option>').join('') + '</optgroup>' : '') + '</select>',
            { cls: 'md:col-span-2', hint: isEnergyModel() && !S.form.loc ? 'Bu tip cihaz sahada enerji konumuna bağlıdır; enerji konumu seçin' : (S.form.loc ? '' : 'boşsa seçili salon') }) +
        '</div>' +
        (isSnmpModel() ? '<div class="rounded-[2px] border border-slate-200 dark:border-border-subtle p-2 flex flex-col gap-2">' +
          '<div class="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">SNMP</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">' +
            FIELD('SNMP sürümü (pro_ver)', '<select data-f="pro_ver" class="scada-input w-full"><option value="">Varsayılan' + (verFallback ? ' (' + esc(verFallback) + ')' : '') + '</option>' +
              SNMP_VERSIONS.map(v => '<option' + (S.form.pro_ver === v ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>', { hint: verFallback ? 'boşsa ' + verFallback : '' }) +
            (fv !== 'V3'
              ? FIELD('Okuma community (pro_getc)', inp('pro_getc', { extra: 'maxlength="' + SNMP_TEXT_MAX + '"' }), { hint: communityFallback + ' · en çok ' + SNMP_TEXT_MAX + ' karakter' }) +
                FIELD('Yazma community (pro_setc)', inp('pro_setc', { extra: 'maxlength="' + SNMP_TEXT_MAX + '"' }), { hint: communityFallback })
              : '') +
          '</div>' + (fv === 'V3' ? v3Html() : '') + '</div>' : '') +
        '<div><button type="button" data-dm-act="advanced" class="text-[11px] font-semibold text-sky-700 dark:text-sky-400 flex items-center gap-1" aria-expanded="' + S.showAdvanced + '">' +
          '<i class="pi text-[10px] ' + (S.showAdvanced ? 'pi-chevron-down' : 'pi-chevron-right') + '"></i>Diğer alanlar</button>' +
          (S.showAdvanced ? '<div class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">' + EXTRA_FIELDS.map(f => FIELD(f.label, inp(f.key))).join('') + '</div>' : '') +
        '</div>' +
      '</div>';
    }

    function excelHtml() {
      const p = S.parsed;
      const checked = checkedRows();
      const errCount = checked.filter(r => r.errors.length).length;
      const v3Rows = p && !p.error ? p.rows.filter(r => r.row.pro_ver === 'V3').length : 0;
      return '<div class="flex flex-col gap-2">' +
        (v3Rows ? '<div class="rounded-[2px] border border-sky-500/30 bg-sky-500/5 p-2 flex flex-col gap-2"><div class="text-[11px] text-slate-700 dark:text-slate-200">Dosyada <strong>' + v3Rows +
          '</strong> SNMPv3 satırı var. Kimlik bilgisi Excel\'den alınmaz; aşağıdaki kimlik seti bu satırlara yazılır.</div>' + v3Html() + '</div>' : '') +
        '<div class="flex flex-wrap items-end gap-3">' +
          '<div class="pb-0.5">' + BTN('secondary', 'Şablon indir', 'pi pi-download', 'data-dm-act="template"', S.busy) + '</div>' +
          FIELD('Excel dosyası (.xlsx, sayfa: Cihazlar)',
            '<div class="flex items-center gap-2"><input type="file" data-dm-file accept=".xlsx" class="scada-input w-full py-1 px-2 text-[11px] file:mr-2 file:px-2 file:py-0.5 file:rounded-[2px] file:border-0 file:bg-sky-600 file:text-white file:text-[11px] file:font-bold cursor-pointer"' + (S.busy ? ' disabled' : '') + '>' +
            BTN('ghost', 'Örnek dosya', 'pi pi-file-excel', 'data-dm-act="sample" title="Sunum: örnek Excel dosyasını seçer"', S.busy) + '</div>',
            { cls: 'flex-1 min-w-[14rem]', hint: 'en çok ' + MAX_ROWS + ' satır', error: S.fileError }) +
        '</div>' +
        '<p class="text-[10px] text-slate-500 dark:text-slate-400">Model sütunu kütüphanedeki id\'dir (şablonun "Modeller" sayfası tip ve protokolle listeler). Boş hücre modelin varsayılanını kullanır (SNMPv3 kullanıcı, parola ve anahtar hariç). loc sütunu boşsa seçili salon yazılır; enerji cihazlarında enerji konumunun kimliğini (ENERGY_List_static) yazın.</p>' +
        (S.fileName && p ? '<div class="text-[11px] text-slate-600 dark:text-slate-400">' + esc(S.fileName) + ': ' + p.rows.length + ' dolu satır' + (p.rows.length ? ', ' + errCount + ' satırda hata' : '') + '.' +
          (p.ignored.length ? '<span class="block text-amber-700 dark:text-amber-300">Alınmayan sütunlar: ' + esc(p.ignored.join(', ')) + '</span>' : '') + '</div>' : '') +
        (p && p.error ? '<div class="px-3 py-2 rounded-[2px] border text-xs bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300" role="alert">' + esc(p.error) + '</div>' : '') +
        (checked.length ? '<div class="border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-x-auto"><table class="w-full text-[11px] border-collapse">' +
          '<thead class="bg-slate-100 dark:bg-surface-base"><tr><th class="px-2 py-1 text-right">Satır</th><th class="px-2 py-1 text-left">Tip</th><th class="px-2 py-1 text-left">Model</th><th class="px-2 py-1 text-left">Önek → id</th><th class="px-2 py-1 text-left">IP</th><th class="px-2 py-1 text-left">Bağlantı</th><th class="px-2 py-1 text-left">Kabin</th><th class="px-2 py-1 text-left">Ön denetim</th></tr></thead><tbody>' +
          checked.map(r => { const mm = modelMap.get(r.row.mdl); return '<tr class="border-t border-slate-100 dark:border-border-subtle' + (r.errors.length ? ' bg-rose-500/5' : '') + '">' +
            '<td class="px-2 py-1 text-right">' + r.rowNo + '</td><td class="px-2 py-1">' + esc(mm ? devTypeLabel(mm.dev_type) : '') + '</td><td class="px-2 py-1 whitespace-nowrap">' + esc(modelLabel(r.row.mdl)) + '</td>' +
            '<td class="px-2 py-1 font-mono text-[10px]">' + esc(r.row.prefix) + (r.row.prefix ? '<span class="text-slate-400"> → ' + esc(r.row.prefix + DEV_SUFFIX) + '</span>' : '') + '</td>' +
            '<td class="px-2 py-1 font-mono text-[10px]">' + esc(r.row.con_host) + '</td><td class="px-2 py-1 font-mono text-[10px]">' + esc(r.row.pro_con || (mm ? mm.def_pro_con : '')) + '</td>' +
            '<td class="px-2 py-1">' + esc(r.row.cab || '') + '</td><td class="px-2 py-1 ' + (r.errors.length ? 'text-rose-600' : 'text-emerald-600') + '">' + esc(r.errors.length ? r.errors.join('; ') : 'uygun') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' : '') +
      '</div>';
    }

    function resultHtml() {
      if (!S.lastResult) return '<p class="text-[11px] text-slate-500">Henüz doğrulama ya da ekleme yapılmadı.</p>';
      const r = S.lastResult.res;
      return '<div class="flex flex-col gap-3"><div class="flex items-center justify-between gap-2"><span class="text-[11px] font-semibold">Sunucu cevabı (' + (r.dry_run ? 'kuru çalıştırma' : 'ekleme') + ', ' + esc(S.lastResult.place) + '): ' +
          (r.ok ? 'başarılı' : 'reddedildi') + (!r.dry_run ? ', eklenen ' + r.added + ', kayıt ' + (r.saved ? 'yapıldı' : 'yapılmadı') : '') + (r.lic ? '<span class="text-slate-500"> · lisans ' + esc(r.lic) + '</span>' : '') + '</span>' +
          BTN('ghost', 'Sonucu indir', 'pi pi-file-excel', 'data-dm-act="result-file"') + '</div>' +
        (r.err ? '<p class="text-[11px] text-rose-600 dark:text-rose-400">' + esc(r.err) + '</p>' : '') +
        (!r.ok ? '<p class="text-[11px] text-slate-500">Kapı hepsi ya da hiçbiri çalışır: bir satır reddedilirse hiçbir cihaz eklenmez.</p>' : '') +
        '<div class="border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-x-auto"><table class="w-full text-[11px] border-collapse"><thead class="bg-slate-100 dark:bg-surface-base"><tr>' +
          '<th class="px-2 py-1 text-right">Sıra</th><th class="px-2 py-1 text-left">Önek</th><th class="px-2 py-1 text-left">id</th><th class="px-2 py-1 text-left">Sonuç</th><th class="px-2 py-1 text-left">Hata</th></tr></thead><tbody>' +
          (r.rows.length ? r.rows.map(x => '<tr class="border-t border-slate-100 dark:border-border-subtle"><td class="px-2 py-1 text-right">' + (x.i + 1) + '</td>' +
            '<td class="px-2 py-1 font-mono text-[10px]">' + esc((S.lastResult.rows[x.i] || {}).prefix || '') + '</td><td class="px-2 py-1 font-mono text-[10px]">' + esc(x.id) + '</td>' +
            '<td class="px-2 py-1 font-semibold ' + (x.ok ? 'text-emerald-600' : 'text-rose-600') + '">' + (x.ok ? 'uygun' : 'hata') + '</td><td class="px-2 py-1">' + esc(x.err || '') + '</td></tr>').join('')
            : '<tr><td colspan="5" class="px-2 py-2 text-slate-500">Cevapta satır sonucu yok.</td></tr>') +
        '</tbody></table></div></div>';
    }

    function connsHtml() {
      const all = allConns();
      const m = selectedModel();
      const list = S.connScope === 'floor' && floor() ? floors.filter(f => f.key === S.floorKey) : floors;
      const pickable = r => S.mode === 'form' && !S.busy && !!m && r.document === docFor(m) && (!m.proto || m.proto === r.proto);
      return '<div class="flex flex-col gap-3">' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<div class="flex rounded-[2px] border border-slate-200 dark:border-border-subtle overflow-hidden text-[11px]" role="group" aria-label="Bağlantı protokolü">' +
            '<button type="button" data-dm-cproto="" class="' + SEG(!S.connProto, true).replace('py-1', 'py-0.5') + '">Tümü</button>' +
            PROTOCOLS.map(p => '<button type="button" data-dm-cproto="' + p.key + '" class="' + SEG(S.connProto === p.key).replace('py-1', 'py-0.5') + '">' + p.label + '</button>').join('') + '</div>' +
          '<div class="flex rounded-[2px] border border-slate-200 dark:border-border-subtle overflow-hidden text-[11px]" role="group" aria-label="Kapsam">' +
            '<button type="button" data-dm-cscope="floor" class="' + SEG(S.connScope === 'floor', true).replace('py-1', 'py-0.5') + '">Seçili kat</button>' +
            '<button type="button" data-dm-cscope="all" class="' + SEG(S.connScope === 'all').replace('py-1', 'py-0.5') + '">Bütün katlar</button></div>' +
          '<span class="text-[10px] text-slate-400">Uyumlu bağlantıya tıklamak onu forma alır.</span>' +
        '</div>' +
        list.map(f => {
          const fc = all.filter(c => c.floorKey === f.key);
          const devCount = DM.devices().filter(d => f.docs.indexOf(d.document) >= 0).length;
          const protos = PROTOCOLS.filter(p => !S.connProto || S.connProto === p.key).map(p => ({ p, rows: fc.filter(c => c.proto === p.key) })).filter(x => x.rows.length);
          const locName = id => { const hh = f.halls.find(x => x.id === id); if (hh) return hh.name; const e = DM.energyLocs(f.key).find(x => x.id === id); return e ? e.fullName.split(' / ').pop() : id; };
          return '<section>' +
            '<div class="flex flex-wrap items-center gap-2 mb-1">' +
              '<button type="button" data-dm-place-floor="' + f.key + '" class="text-xs font-extrabold flex items-center gap-1 hover:underline ' + (f.key === S.floorKey ? 'text-sky-700 dark:text-sky-400' : 'text-slate-800 dark:text-slate-100') + '"' + (S.busy ? ' disabled' : '') + '>' +
                '<i class="pi text-[10px] ' + (f.key === S.floorKey ? 'pi-check-circle' : 'pi-building') + '"></i>' + esc(f.name) + '</button>' +
              '<span class="text-[10px] text-slate-500">' + devCount + ' cihaz</span>' +
              f.halls.map(hh => '<button type="button" data-dm-place-floor="' + f.key + '" data-dm-place-hall="' + hh.id + '" class="px-2 py-0.5 rounded-full border text-[10px] ' +
                (f.key === S.floorKey && hh.id === S.hallId ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-200 dark:border-border-subtle hover:bg-slate-50 dark:hover:bg-white/5') + '">' + esc(hh.name) + '</button>').join('') +
              (!f.halls.length ? '<span class="text-[10px] text-slate-400">salon tanımlı değil</span>' : '') +
            '</div>' +
            protos.map(x => '<div class="mb-1.5"><div class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">' + x.p.label + '</div>' +
              '<table class="w-full text-[11px] border-collapse"><thead><tr class="text-slate-500"><th class="px-2 py-0.5 text-left font-semibold">Bağlantı</th><th class="px-2 py-0.5 text-right font-semibold">Cihaz</th><th class="px-2 py-0.5 text-left font-semibold w-32">Yuva</th><th class="px-2 py-0.5 text-left font-semibold">Salon / konum</th></tr></thead><tbody>' +
              x.rows.map(r => {
                const free = r.con_ses ? r.con_ses - r.devCount : null;
                const pk = pickable(r);
                const sel = pk && S.form.pro_con === r.id;
                const locs = Object.keys(r.byLoc).filter(k => r.byLoc[k]).map(k => esc(locName(k)) + ' ' + r.byLoc[k]).join(' · ');
                return '<tr data-dm-conn="' + esc(r.document + '|' + r.id) + '" class="border-t border-slate-100 dark:border-border-subtle' + (pk ? ' cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : '') + (sel ? ' bg-sky-500/10' : '') + '"' + (pk ? ' title="Forma al"' : '') + '>' +
                  '<td class="px-2 py-0.5 font-mono">' + esc(r.id) + '<span class="ml-1 font-sans text-[9px] px-1 rounded-[2px] bg-slate-100 dark:bg-white/10">' + esc(r.document.replace('CMR/', '')) + '</span></td>' +
                  '<td class="px-2 py-0.5 text-right">' + r.devCount + '</td>' +
                  '<td class="px-2 py-0.5">' + (free !== null
                    ? '<div class="flex items-center gap-1.5"><div class="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><div class="h-full ' +
                        (free <= 0 ? 'bg-rose-500' : free < r.con_ses * 0.1 ? 'bg-amber-500' : 'bg-emerald-500') + '" style="width:' + Math.min(100, 100 * r.devCount / r.con_ses).toFixed(1) + '%"></div></div>' +
                      '<span class="text-[10px] whitespace-nowrap' + (free <= 0 ? ' text-rose-600' : '') + '">' + free + ' boş / ' + r.con_ses + '</span></div>'
                    : '<span class="text-[10px] text-slate-400">sınırsız</span>') + '</td>' +
                  '<td class="px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-300">' + (locs || '<span class="text-slate-400">—</span>') + '</td></tr>';
              }).join('') + '</tbody></table></div>').join('') +
            (!protos.length ? '<p class="text-[10px] text-slate-400">Bu süzgeçte bağlantı yok.</p>' : '') +
          '</section>';
        }).join('') +
      '</div>';
    }

    function renderRight() {
      renderTabs();
      let h = '';
      if (S.rightTab === 'input') {
        h = '<div class="flex flex-col gap-3">' +
          '<div class="flex items-center gap-1" role="group" aria-label="Giriş biçimi">' +
            BTN(S.mode === 'form' ? 'primary' : 'secondary', 'Tek cihaz', 'pi pi-pencil', 'data-dm-mode="form"', S.busy) +
            BTN(S.mode === 'excel' ? 'primary' : 'secondary', 'Excel ile toplu', 'pi pi-file-excel', 'data-dm-mode="excel"', S.busy) +
            '<span class="ml-auto text-[10px] text-slate-400" title="Bağlantı yuvasını sunucu kesin olarak denetler">Lisans cihaz sınırı buradan okunamıyor</span>' +
          '</div>' +
          (S.mode === 'form' ? formHtml() : excelHtml()) +
          '<div data-dm-checks class="flex flex-col gap-2">' + checksHtml() + '</div>' +
        '</div>';
      } else if (S.rightTab === 'result') h = resultHtml();
      else h = connsHtml();
      $('[data-dm-right]').innerHTML = h;
    }

    function renderAll() { renderTop(); renderLib(); renderRight(); }

    // Yazarken: odak kaybolmasın diye yalnız türetilen bölgeler
    function refreshDerived() {
      const checks = $('[data-dm-checks]');
      if (checks) checks.innerHTML = checksHtml();
      const pdu = $('[data-dm-pdu]');
      if (pdu) pdu.innerHTML = pduHelperHtml();
      const hint = $('[data-dm-idhint]');
      if (hint) hint.textContent = S.form.prefix.trim() ? 'cihaz id: ' + S.form.prefix.trim() + DEV_SUFFIX : 'A-Z a-z 0-9 _ -';
      renderTop();
    }

    // ---- işlemler ---------------------------------------------------------------------------
    function setFloor(key, hallId) {
      S.floorKey = key;
      const hs = halls();
      S.hallId = hallId !== undefined ? hallId : (hs.length === 1 ? hs[0].id : '');
      S.lastResult = null;
      S.notice = null;
      if (S.mode === 'form' && S.form.pro_con && !modelConnections().some(c => c.id === S.form.pro_con)) S.form.pro_con = '';
      touch();
    }
    function pickModel(id) {
      S.form.mdl = id;
      const m = modelMap.get(id);
      S.form.pro_con = (m && m.def_pro_con) || '';
      touch();
    }
    function call(rows, dry, text, done) {
      S.busy = true; S.busyText = text; S.notice = null;
      renderTop(); renderRight();
      later(() => {
        const res = DM.gate(rows, dry, S.floorKey, S.hallId);
        S.busy = false; S.busyText = '';
        S.lastResult = { res, place: place(), rows };
        done(res);
        S.rightTab = 'result';
        renderAll();
      }, dry ? 700 : 900);
    }
    function verify() {
      const checked = checkedRows();
      if (!canVerify(checked)) return;
      const version = S.version;
      const rows = checked.map(c => c.row);
      call(rows, true, 'Doğrulanıyor (kuru çalıştırma)…', res => {
        if (res.ok && version === S.version) {
          S.verified = { version, sig: signature(rows) };
          S.notice = { kind: 'ok', text: 'Doğrulama başarılı: ' + rows.length + ' satır eklenebilir. Eklemek için "Ekle"ye basın.' };
        } else {
          S.verified = null;
          const bad = res.rows.filter(r => !r.ok).length;
          S.notice = { kind: 'error', text: 'Doğrulama başarısız: ' + bad + ' satır reddedildi (ayrıntı Sonuç sekmesinde).' };
        }
      });
    }
    function add() {
      const checked = checkedRows();
      if (!canAdd(checked)) return;
      const rows = checked.map(c => c.row);
      if (signature(rows) !== S.verified.sig) {
        S.verified = null;
        S.notice = { kind: 'warn', text: 'Satırlar doğrulamadan sonra değişti; yeniden doğrulayın.' };
        renderTop();
        return;
      }
      const pl = place();
      S.verified = null;
      call(rows, false, 'Cihazlar ekleniyor…', res => {
        if (res.ok) {
          S.notice = { kind: 'ok', text: res.added + ' cihaz ' + pl + ' konumuna eklendi ve kaydedildi.' };
          toast(res.added + ' cihaz eklendi (sunum: yalnız bu oturumda).', 'success', 'Cihaz Ekle');
        } else {
          S.notice = { kind: 'error', text: 'Ekleme yapılmadı (hepsi ya da hiçbiri).' };
        }
      });
    }
    function loadSample(withErrors) {
      if (!S.floorKey) { S.fileError = 'Önce kat seçin.'; renderRight(); return; }
      const smp = DM.sampleRows(S.floorKey, withErrors);
      S.busy = true; S.busyText = 'Dosya okunuyor…'; renderTop();
      later(() => {
        S.busy = false; S.busyText = '';
        S.fileName = smp.name;
        S.fileError = '';
        const rows = smp.rows.map((r, i) => ({ rowNo: i + 2, row: buildRow(r) }));
        S.parsed = { rows, ignored: smp.ignored, error: rows.length > MAX_ROWS ? 'Dosyada ' + rows.length + ' satır var; en çok ' + MAX_ROWS + ' satır işlenir.' : (rows.length ? '' : 'Dosyada veri satırı yok.') };
        S.lastResult = null;
        touch();
        renderAll();
      }, 350);
    }
    function downloadTemplate() {
      const ex = { model: 'MDL_RARITAN_PX3_5530V', prefix: 'K2EB03_PDU_C', desc: '2EB03-PDU-C', con_host: '10.201.27.30', con_port: '161', pro_con: 'SNMP_PDU_2', cab: '2EB03' };
      kit.exportExcel('cihaz_ekleme_sablonu', EXCEL_COLUMNS.map(c => ({ header: c, value: r => r[c] || '' })), [ex]);
    }
    function downloadResult() {
      const lr = S.lastResult;
      if (!lr) return;
      kit.exportExcel('cihaz_ekleme_sonuc', [
        { header: 'Sıra', value: r => r.i + 1 }, { header: 'Önek', value: r => (lr.rows[r.i] || {}).prefix || '' },
        { header: 'id', value: r => r.id }, { header: 'Sonuç', value: r => (r.ok ? 'uygun' : 'hata') }, { header: 'Hata', value: r => r.err || '' },
        { header: 'IP', value: r => (lr.rows[r.i] || {}).con_host || '' }, { header: 'Bağlantı', value: r => (lr.rows[r.i] || {}).pro_con || '' }
      ], lr.res.rows);
    }

    // ---- rapor menüsü (model kütüphanesi) -------------------------------------------------------
    let reportApi = null;
    if (DCIM.report && DCIM.report.menu) {
      reportApi = DCIM.report.menu($('[data-dm-report]'), {
        label: 'Rapor al', scopes: [{ id: 'list', label: 'Filtrelenmiş liste', hint: 'Ekrandaki arama ve filtrelerle' }],
        options: 'limit', unit: 'model', total: models.length, defaultLimit: 50,
        onExport(req) {
          const ordered = modelGroups().flatMap(g => g.models);
          const rows = DCIM.report.applyLimit(ordered, req).map(m => ({ type: devTypeLabel(m.dev_type), mfr: m.dev_mfr || '—', mdl: m.dev_mdl || m.desc, id: m.id + '@' + m.ver,
            proto: protoLabel(m.proto), bi: m.n_bi, io: m.n_io, floors: floorNames(m) }));
          DCIM.report.generate({
            title: 'Model Kütüphanesi', subtitle: 'Cihaz Ekle · ' + (place() || 'kat seçilmedi'), filename: 'model_kutuphanesi',
            kpis: [{ label: 'Model', value: ordered.length }, { label: 'SNMP', value: ordered.filter(m => m.proto === 'snmp').length }, { label: 'Modbus', value: ordered.filter(m => m.proto === 'modbus').length }],
            sections: [{ title: 'Modeller', columns: [{ key: 'type', label: 'Tip' }, { key: 'mfr', label: 'Marka' }, { key: 'mdl', label: 'Model' }, { key: 'id', label: 'Kimlik' },
              { key: 'proto', label: 'Protokol' }, { key: 'bi', label: 'Blok', align: 'right' }, { key: 'io', label: 'Nokta', align: 'right' }, { key: 'floors', label: 'Katlar' }], rows }]
          }, req.format);
        }
      });
    }

    // ---- olaylar ----------------------------------------------------------------------------
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-dm-act],[data-dm-view],[data-dm-proto],[data-dm-type],[data-dm-model],[data-dm-tab],[data-dm-mode],[data-dm-cproto],[data-dm-cscope],[data-dm-place-floor],[data-dm-conn]');
      if (!t || !el.contains(t) || t.disabled) return;
      const d = t.dataset;
      if (d.dmAct) {
        switch (d.dmAct) {
          case 'reload': S.notice = { kind: 'info', text: 'Katlar, salonlar ve bağlantılar yenilendi.' }; renderAll(); break;
          case 'verify': verify(); break;
          case 'add': add(); break;
          case 'clear-filters': S.modelSearch = ''; $('[data-dm-search]').value = ''; S.protoFilter = ''; S.brandFilter = ''; S.typeFilter.clear(); renderLib(); break;
          case 'show-all': S.modelSearch = ''; $('[data-dm-search]').value = ''; S.protoFilter = ''; S.brandFilter = ''; S.typeFilter.clear(); S.onlyFitting = false; renderLib(); break;
          case 'apply-pdu': applyPduSuggestion(); renderRight(); renderTop(); break;
          case 'advanced': S.showAdvanced = !S.showAdvanced; renderRight(); break;
          case 'template': downloadTemplate(); break;
          case 'sample': loadSample(false); break;
          case 'result-file': downloadResult(); break;
        }
        return;
      }
      if (d.dmView) { S.libView = d.dmView; renderLibHead(); renderLibList(); return; }
      if (d.dmProto !== undefined) { S.protoFilter = d.dmProto; renderLib(); return; }
      if (d.dmType) { if (S.typeFilter.has(d.dmType)) S.typeFilter.delete(d.dmType); else S.typeFilter.add(d.dmType); renderChips(); renderLibList(); return; }
      if (d.dmModel) {
        if (S.busy || S.mode !== 'form') return;
        pickModel(d.dmModel); S.rightTab = 'input'; renderLibList(); renderRight(); renderTop(); return;
      }
      if (d.dmTab) { S.rightTab = d.dmTab; renderRight(); return; }
      if (d.dmMode) { if (S.busy || S.mode === d.dmMode) return; S.mode = d.dmMode; S.lastResult = null; touch(); renderAll(); return; }
      if (d.dmCproto !== undefined) { S.connProto = d.dmCproto; renderRight(); return; }
      if (d.dmCscope) { S.connScope = d.dmCscope; renderRight(); return; }
      if (d.dmPlaceFloor) { if (S.busy) return; setFloor(d.dmPlaceFloor, d.dmPlaceHall); renderAll(); return; }
      if (d.dmConn) {
        const [doc, id] = d.dmConn.split('|');
        const m = selectedModel();
        if (S.mode !== 'form' || S.busy || !m || doc !== docFor(m)) return;
        const c = docConns(doc).find(x => x.id === id);
        if (!c || (m.proto && m.proto !== c.proto)) return;
        S.form.pro_con = id; touch(); S.rightTab = 'input'; renderRight(); renderTop();
      }
    });

    el.addEventListener('input', e => {
      const t = e.target;
      if (t.matches('[data-dm-search]')) { S.modelSearch = t.value; renderChips(); renderLibList(); return; }
      if (t.matches('input[data-f]')) { S.form[t.dataset.f] = t.value; S.verified = null; touch(); refreshDerived(); return; }
      if (t.matches('input[data-v3]')) { S.v3[t.dataset.v3] = t.value; touch(); refreshDerived(); }
    });

    el.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('[data-dm-floor]')) { setFloor(t.value); renderAll(); return; }
      if (t.matches('[data-dm-hall]')) { S.hallId = t.value; S.lastResult = null; touch(); renderTop(); renderRight(); return; }
      if (t.matches('[data-dm-brand]')) { S.brandFilter = t.value; renderChips(); renderLibList(); return; }
      if (t.matches('[data-dm-group]')) { S.groupBy = t.value; renderLibList(); if (S.rightTab === 'input' && S.mode === 'form') renderRight(); return; }
      if (t.matches('[data-dm-sort]')) { S.sortBy = t.value; renderLibList(); return; }
      if (t.matches('[data-dm-fitting]')) { S.onlyFitting = t.checked; renderChips(); renderLibList(); return; }
      if (t.matches('[data-dm-secrets]')) { S.showSecrets = t.checked; renderRight(); return; }
      if (t.matches('select[data-f]')) {
        if (t.dataset.f === 'mdl') { pickModel(t.value); renderLibList(); }
        else { S.form[t.dataset.f] = t.value; touch(); }
        renderRight(); renderTop(); return;
      }
      if (t.matches('select[data-v3]')) {
        S.v3[t.dataset.v3] = t.value;
        if (t.dataset.v3 === 'pro_auth' && !t.value) Object.assign(S.v3, { pro_pwd: '', pro_priv: '', pro_priv_key: '' });
        if (t.dataset.v3 === 'pro_priv' && !t.value) S.v3.pro_priv_key = '';
        touch(); renderRight(); renderTop(); return;
      }
      if (t.matches('[data-dm-file]')) {
        const f = t.files && t.files[0];
        if (!f) return;
        if (!/\.xlsx$/i.test(f.name)) { S.fileError = 'Yalnız .xlsx dosyası seçilebilir.'; renderRight(); return; }
        toast('Sunumda dosya içeriği okunmaz; örnek satırlar yüklendi.', 'info', 'Excel');
        loadSample(false);
      }
    });

    // ---- derin bağlantılar -------------------------------------------------------------------
    const pFloor = params.get('floor');
    const pCab = normCab(params.get('cabinet') || '');
    if (pFloor) {
      const fk = floors.find(f => f.key === pFloor || f.id === pFloor || lc(f.name) === lc(pFloor));
      if (fk) setFloor(fk.key, params.get('hall') || undefined);
    }
    if (pCab) {
      const digit = pCab.charAt(0);
      if (!S.floorKey && floors.some(f => f.key === digit)) setFloor(digit);
      const cab = DM.cabinets(S.floorKey).find(c => c.code === pCab);
      if (cab && cab.salon && halls().some(h => h.id === cab.salon)) S.hallId = cab.salon;
      pickModel(params.get('model') || 'MDL_RARITAN_PX3_5530V');
      S.form.cab = pCab;
      if (cab && cab.pod) S.form.pod = cab.pod;
      if (cab && cab.col) S.form.row = cab.col;
      if (params.get('apply') === '1') applyPduSuggestion();
    } else if (params.get('model') && modelMap.has(params.get('model'))) pickModel(params.get('model'));
    if (params.get('host')) S.form.con_host = params.get('host');
    if (params.get('view') === 'cards') S.libView = 'cards';
    if (params.get('q')) { S.modelSearch = params.get('q'); $('[data-dm-search]').value = S.modelSearch; }
    if (['snmp', 'modbus'].indexOf(params.get('proto')) >= 0) S.protoFilter = params.get('proto');
    if (params.get('type')) params.get('type').split(',').forEach(t => S.typeFilter.add(t));
    if (params.get('mode') === 'excel') S.mode = 'excel';
    if (['input', 'conns', 'result'].indexOf(params.get('tab')) >= 0) S.rightTab = params.get('tab');
    renderAll();
    if (S.mode === 'excel' && params.get('sample')) loadSample(params.get('sample') === 'errors');
    if (params.get('dry') === '1') {
      if (S.mode === 'form') {
        if (!S.floorKey) setFloor('2', 'S1');
        if (!S.form.mdl) pickModel('MDL_RARITAN_PX3_5530V');
        if (!S.form.cab && isPduModel()) { const c = DM.cabinets(S.floorKey)[3]; if (c) { S.form.cab = c.code; S.form.pod = c.pod || ''; S.form.row = c.col || ''; } }
        if (!S.form.prefix && pduSuggestion()) applyPduSuggestion();
        if (!S.form.con_host) S.form.con_host = '10.201.' + ((Number(S.floorKey) || 9) * 10 + 7) + '.250';
        touch();
        renderAll();
        verify();
        if (params.get('add') === '1') later(() => add(), 900);
      } else later(() => verify(), 500);
    }

    return { destroy() { timers.forEach(clearTimeout); } };
  }

  DCIM.engRegistry['device-manager'] = { mount };
})();
