/* ==========================================================================
   DCIM Sunum — Kabin Yönetimi (NewUICMPCabinetManagerComponent)
   cabinet-manager.component.html / .ts birebir port:
   - Üst bar: kabin adı, TAKİP AKTİF rozeti, lokasyon, Cihaz Ekle, Kabin Takibi (alarm renklenmesi)
   - 3 panel: PDU Üniteleri | 42U Ön/Arka rack (zoom + pan) | Sensörler + Kapasite Limitleri
   - Cihaz Detay / Ekleme penceresi (Varlık Takip, Fiziksel Altyapı, ön/arka görsel + port yönetimi)
   - Port Ekle/Düzenle ve Port Detay pencereleri, PDU Ekle / Sensör Eşik diyalogları
   XDB / ASM / CAT / LNK yerine js/mock-data.js (DCIM.data.cabinetMgr) kullanılır; kayıtlar bellek içidir.
   URL: ?cabinet=1BJ53 [&device=U6|<assetId>] [&edit=1] [&port=NIC1] [&add=1|U30] [&cls=R750] [&ai=front]
        [&dialog=sensor|pdu|position] [&tracking=0] [&zoom=1.5]
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const { esc, toast, dialog, storage } = DCIM.ui;
  const kit = DCIM.kit;
  const D = DCIM.data;
  const M = D.cabinetMgr;
  DCIM.shell.init({ active: 'cabinet' });

  const params = new URLSearchParams(window.location.search);
  const root = document.getElementById('cm-root');
  const TOTAL_U = 42;

  // SCADA STA bitmask sabitleri (Mühendislik haberleşme sayfası ile 1:1 uyumlu)
  const STA_ENG_RUNNING = 0x0003;
  const STA_MSK_ENG = 0x0003;
  const STA_VAL_NORMAL = 0x0000;
  const STA_VAL_WARNING = 0x0004;
  const STA_VAL_ALARM = 0x0008;
  const STA_VAL_EMERGENCY = 0x000C;
  const STA_MSK_VAL = 0x000C;

  const ASSIGNMENT_MAP = { 0: 'Kullanımda', 1: 'Stokta', 2: 'Hurdaya Ayrıldı', 3: 'Teslim Bekleniyor', 4: 'Bakımda', 5: 'Tedarikçiye İade', 6: 'Kayıp', 7: 'Demonte' };
  const ASSIGNMENT_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map(v => ({ value: v, label: ASSIGNMENT_MAP[v] }));
  const ASSIGNMENT_OPTIONS_EXT = [0, 7].map(v => ({ value: v, label: ASSIGNMENT_MAP[v] }));

  // ---------------------------------------------------------------------------
  // Durum
  // ---------------------------------------------------------------------------
  const emptySensors = () => ({
    topTemp: { value: null, unit: '°C', status: 'waiting', statusLabel: 'VERİ ALINAMIYOR' },
    midTemp: { value: null, unit: '°C', status: 'waiting', statusLabel: 'VERİ ALINAMIYOR' },
    lowTemp: { value: null, unit: '°C', status: 'waiting', statusLabel: 'VERİ ALINAMIYOR' },
    humidity: { value: null, unit: '%RH', status: 'waiting', statusLabel: 'VERİ ALINAMIYOR' },
    frontDoor: { status: null, label: '-', level: 'waiting', statusLabel: 'VERİ ALINAMIYOR' },
    rearDoor: { status: null, label: '-', level: 'waiting', statusLabel: 'VERİ ALINAMIYOR' }
  });

  const state = {
    code: '',
    cab: null,
    tracking: true,
    pduList: [],
    selectedPduName: '',
    avgInputVoltage: '-',
    totalCurrent: '-',
    pduInstantPower: '-',
    cabinetTotalPower: '-',
    pduAlarmMessage: '',
    sensors: emptySensors(),
    slots: { front: [], back: [] },
    rackZoomLevel: 1,
    zoom: { front: 1, back: 1 },
    pan: { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } },
    panning: null,
    hasPanned: false,
    capacity: { totalWeight: 0, weightLimit: 0, totalPower: 0, powerLimit: 0, hasWeight: false, hasPower: false }
  };
  const edits = {};      // assetId → bellek içi düzenlenmiş ASM alanları
  const portStore = {};  // assetId → bellek içi port listesi (CAT + LNK + eklenenler)
  let newSeq = 0;
  let pollTimer = null;

  // ---------------------------------------------------------------------------
  // STA / durum sınıfları (component .ts'den birebir)
  // ---------------------------------------------------------------------------
  function parseSta(val) {
    if (typeof val === 'number') return Number.isInteger(val) && val >= 0 ? val : 0;
    if (typeof val !== 'string') return 0;
    const s = val.trim();
    if (!s) return 0;
    const radix = /^0x[0-9a-f]+$/i.test(s) ? 16 : 10;
    if (radix === 10 && !/^\d+$/.test(s)) return 0;
    const n = parseInt(s, radix);
    return Number.isSafeInteger(n) ? n : 0;
  }
  function resolveDisplayStatus(val) {
    if (val === undefined || val === null || val === '') return 'BILINMEYEN';
    const sta = parseSta(val);
    if ((sta & 0x00C0) === 0x00C0) return 'DEVREDIŞI';
    const v = sta & STA_MSK_VAL;
    if (v === STA_VAL_WARNING) return 'UYARI';
    if (v === STA_VAL_ALARM) return 'ALARM';
    if (v === STA_VAL_EMERGENCY) return 'ACİL';
    const e = sta & STA_MSK_ENG;
    if (e === 0) return 'DEVREDIŞI';
    if (e === 1) return 'BAĞLANAMADI';
    if (e === 2) return 'ESKİ';
    return 'NORMAL';
  }
  function getStatusFromSta(sta) {
    switch (resolveDisplayStatus(sta)) {
      case 'ACİL': return { internalStatus: 'emergency', label: 'ACİL' };
      case 'ALARM': return { internalStatus: 'alarm', label: 'ALARM' };
      case 'UYARI': return { internalStatus: 'warning', label: 'UYARI' };
      case 'NORMAL': return { internalStatus: 'normal', label: 'NORMAL' };
      case 'BAĞLANAMADI': return { internalStatus: 'stopped', label: 'BAĞLANAMADI' };
      case 'ESKİ': return { internalStatus: 'waiting', label: 'VERİ ALINAMIYOR' };
      case 'DEVREDIŞI': return { internalStatus: 'disabled', label: 'DEVREDIŞI' };
      default: return { internalStatus: 'offline', label: 'BİLİNMEYEN' };
    }
  }
  const getPduClassNo = sta => ((sta & STA_MSK_ENG) !== STA_ENG_RUNNING ? sta & 0x0003 : 4 + ((sta >> 2) & 0x0003));
  const getPduClassNoSta = sta => ((sta & 0x00C0) === 0x00C0 ? 0 : (sta & STA_MSK_VAL) ? 4 + ((sta >> 2) & 0x0003) : sta & 0x0003);

  function getPduCommStatus(rawSta) {
    const sta = parseSta(rawSta);
    const classNo = getPduClassNo(sta);
    const classNoSta = getPduClassNoSta(sta);
    let label;
    if (classNo === 0) label = 'DEVREDIŞI';
    else if (classNo === 1) label = 'DURDURULDU';
    else if (classNo === 2) {
      const v = sta & STA_MSK_VAL;
      label = v === STA_VAL_WARNING ? 'KOPTU-UYARI' : v === STA_VAL_ALARM ? 'KOPTU-ALARM' : v === STA_VAL_EMERGENCY ? 'KOPTU-ACİL' : v === STA_VAL_NORMAL ? 'KOPTU' : 'KOPTU';
    } else if (classNo === 3 || classNo === 4) label = 'BAĞLI-NORMAL';
    else if (classNo === 5) label = 'BAĞLI-UYARI';
    else if (classNo === 6) label = 'BAĞLI-ALARM';
    else if (classNo === 7) label = 'BAĞLI-ACİL';
    else label = 'BAĞLI-NORMAL';

    let badgeClass;
    let dotClass;
    let internalStatus;
    switch (classNoSta) {
      case 0:
        badgeClass = 'bg-slate-100 text-slate-655 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
        dotClass = 'bg-slate-450';
        internalStatus = 'disabled';
        break;
      case 1:
        badgeClass = 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/40';
        dotClass = 'bg-rose-500 animate-pulse';
        internalStatus = 'stopped';
        break;
      case 2:
        badgeClass = 'bg-[#FF8E0A]/10 text-[#FF8E0A] border-[#FF8E0A]/40 dark:bg-[#FF8E0A]/15 dark:text-[#FF8E0A] dark:border-[#FF8E0A]/40';
        dotClass = 'bg-[#FF8E0A] animate-pulse';
        internalStatus = 'waiting';
        break;
      case 5:
        badgeClass = 'sta-warning-readable bg-[#F8DF00]/10 text-[#F8DF00] border-[#F8DF00]/40 dark:bg-[#F8DF00]/15 dark:text-[#F8DF00] dark:border-[#F8DF00]/40';
        dotClass = 'bg-[#F8DF00]';
        internalStatus = 'warning';
        break;
      case 6:
        badgeClass = 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/40';
        dotClass = 'bg-rose-600';
        internalStatus = 'alarm';
        break;
      case 7:
        badgeClass = 'bg-purple-500/10 text-purple-700 border-purple-250 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30';
        dotClass = 'bg-purple-500';
        internalStatus = 'emergency';
        break;
      default:
        badgeClass = 'bg-emerald-500/10 text-emerald-700 border-emerald-250 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30';
        dotClass = 'bg-emerald-500';
        internalStatus = 'normal';
    }
    const isAlarm = classNoSta === 6 || classNo === 6 || (sta & STA_MSK_VAL) === STA_VAL_ALARM || (sta & STA_MSK_VAL) === STA_VAL_EMERGENCY;
    const isWarning = classNoSta === 5 || classNo === 5 || (sta & STA_MSK_VAL) === STA_VAL_WARNING;
    return { sta, classNo, classNoSta, label, badgeClass, dotClass, internalStatus, isAlarm, isWarning };
  }

  function getPduBadgeClass(status) {
    if (!state.tracking) return 'bg-slate-100 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    if (typeof status === 'number' || (typeof status === 'string' && (status.toLowerCase().startsWith('0x') || /^\d+$/.test(status)))) return getPduCommStatus(status).badgeClass;
    switch (status) {
      case 'emergency': return 'bg-purple-500/10 text-purple-700 border-purple-250 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30';
      case 'alarm': return 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/40';
      case 'warning': return 'sta-warning-readable bg-[#F8DF00]/10 text-[#F8DF00] border-[#F8DF00]/40 dark:bg-[#F8DF00]/15 dark:text-[#F8DF00] dark:border-[#F8DF00]/40';
      case 'waiting': return 'bg-[#FF8E0A]/10 text-[#FF8E0A] border-[#FF8E0A]/40 dark:bg-[#FF8E0A]/15 dark:text-[#FF8E0A] dark:border-[#FF8E0A]/40';
      case 'stopped':
      case 'disconnected': return 'bg-rose-500/10 text-rose-600 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/40';
      case 'offline':
      case 'disabled': return 'bg-slate-100 text-slate-655 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
      default: return 'bg-emerald-500/10 text-emerald-700 border-emerald-250 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30';
    }
  }
  function getPduDotClass(status) {
    if (!state.tracking) return 'bg-slate-400 dark:bg-slate-600';
    if (typeof status === 'number' || (typeof status === 'string' && (status.toLowerCase().startsWith('0x') || /^\d+$/.test(status)))) return getPduCommStatus(status).dotClass;
    switch (status) {
      case 'emergency': return 'bg-purple-500';
      case 'alarm': return 'bg-rose-600';
      case 'warning': return 'bg-[#F8DF00]';
      case 'waiting': return 'bg-[#FF8E0A] animate-pulse';
      case 'stopped':
      case 'disconnected': return 'bg-rose-500 animate-pulse';
      case 'offline':
      case 'disabled': return 'bg-slate-450';
      default: return 'bg-emerald-500';
    }
  }
  function getSensorCardClass(status, level) {
    if (!state.tracking) return 'bg-slate-100/70 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-500 dark:text-slate-400';
    if (level === 'emergency' || status === 'emergency') return 'bg-purple-500/10 border-purple-500/40 text-purple-900 dark:text-purple-200';
    if (level === 'critical' || status === 'alarm') return 'bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-200';
    if (level === 'warning' || status === 'warning') return 'sta-warning-readable bg-[#F8DF00]/10 border-[#F8DF00]/40 text-[#F8DF00] dark:text-[#F8DF00]';
    if (status === 'waiting') return 'bg-[#FF8E0A]/10 border-[#FF8E0A]/40 text-[#FF8E0A] dark:text-[#FF8E0A]';
    if (status === 'stopped') return 'bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-200';
    if (status === 'offline' || status === 'disabled') return 'bg-slate-500/10 border-slate-400/40 text-slate-600 dark:text-slate-400';
    return 'bg-slate-50 dark:bg-surface-panel border-slate-200 dark:border-border-subtle text-slate-800 dark:text-slate-200';
  }
  function getSensorValueColorClass(status, level, defaultColor) {
    const def = defaultColor || 'text-emerald-600 dark:text-emerald-400';
    if (!state.tracking) return 'text-slate-600 dark:text-slate-400';
    if (level === 'emergency' || status === 'emergency') return 'text-purple-600 dark:text-purple-400';
    if (level === 'critical' || status === 'alarm') return 'text-rose-600 dark:text-rose-400';
    if (level === 'warning' || status === 'warning') return 'sta-warning-readable text-[#F8DF00] dark:text-[#F8DF00]';
    if (status === 'waiting') return 'text-[#FF8E0A] dark:text-[#FF8E0A]';
    if (status === 'stopped') return 'text-rose-600 dark:text-rose-400';
    if (status === 'offline' || status === 'disabled') return 'text-slate-500 dark:text-slate-400';
    return def;
  }

  // ---------------------------------------------------------------------------
  // PDU verisi (fetchPduData — XDB dev JSON ayrıştırma birebir)
  // ---------------------------------------------------------------------------
  function formatPduDisplayName(deviceId) {
    if (!deviceId) return 'PDU';
    let cleanId = String(deviceId).trim().replace(/_DV$/, '').replace(/_NFO_BL1$/, '').replace(/_NFO$/, '').replace(/_IN$/, '').replace(/_BL1$/, '');
    const podMatch = cleanId.match(/^POD\d+_(.+)$/i);
    if (podMatch) cleanId = podMatch[1];
    const parts = cleanId.split('_').filter(Boolean);
    const base = parts[0] || cleanId;
    const baseNoK = base.startsWith('K') || base.startsWith('k') ? base.substring(1) : base;
    const rest = parts.slice(1).join('_');
    return rest ? baseNoK + '_' + rest : baseNoK;
  }
  const upId = io => String((io && io.id) || '').toUpperCase();
  const valid = io => io && io.val !== undefined && io.val !== null && io.val !== '-';

  function fetchPduData(live) {
    const devs = M.pduDevs(state.code, { live, inhibited: !state.tracking });
    const pList = [];
    let grandTotalPow = 0;
    devs.forEach(dev => {
      const ios = [];
      if (Array.isArray(dev.bi)) dev.bi.forEach(b => { if (Array.isArray(b.io)) ios.push.apply(ios, b.io); });
      else if (Array.isArray(dev.io)) ios.push.apply(ios, dev.io);
      let currVal = 0;
      let voltVal = 0;
      let powVal = 0;
      const totPowIo = ios.find(io => { const id = upId(io); return id.includes('_IN_TOT_POW') || id.endsWith('_TOT_POW'); });
      if (totPowIo && totPowIo.val !== undefined && totPowIo.val !== null && totPowIo.val !== '' && totPowIo.val !== '-') powVal = parseFloat(totPowIo.val) || 0;
      const single = (id, key) => !id.includes('_IN2_') && !id.includes('_IN3_') && (id.endsWith('_IN_' + key) || id.includes('_IN_' + key));
      const in1Curr = ios.find(io => { const id = upId(io); return id.includes('_IN1_CURR') || single(id, 'CURR'); });
      const in2Curr = ios.find(io => upId(io).includes('_IN2_CURR'));
      const in3Curr = ios.find(io => upId(io).includes('_IN3_CURR'));
      const in1Volt = ios.find(io => { const id = upId(io); return id.includes('_IN1_VOLT') || single(id, 'VOLT'); });
      const in1Pow = ios.find(io => { const id = upId(io); return id.includes('_IN1_POW') || single(id, 'POW'); });
      const in2Pow = ios.find(io => upId(io).includes('_IN2_POW'));
      const in3Pow = ios.find(io => upId(io).includes('_IN3_POW'));
      if (valid(in1Volt)) voltVal = parseFloat(in1Volt.val) || 0;
      let hasInletCurr = false;
      [in1Curr, in2Curr, in3Curr].forEach(io => { if (valid(io)) { currVal += parseFloat(io.val) || 0; hasInletCurr = true; } });
      let calcPow = 0;
      [in1Pow, in2Pow, in3Pow].forEach(io => { if (valid(io)) calcPow += parseFloat(io.val) || 0; });
      if (powVal === 0 && calcPow > 0) powVal = calcPow;
      // Inlet tanımlı değilse outlet akımlarını topla (RTD / OCP hariç)
      if (!hasInletCurr) {
        ios.forEach(io => {
          const id = upId(io);
          const v = parseFloat(io.val) || 0;
          if (id.includes('OUT') && (id.includes('CURR') || id.includes('AKIM')) && !id.includes('RTD') && !id.includes('OCP')) currVal += v;
          if (voltVal === 0 && id.includes('VOLT') && !id.includes('RTD')) voltVal = v;
          if (powVal === 0 && id.includes('OUT') && (id.includes('POW') || id.includes('GUC')) && !id.includes('RTD')) powVal += v;
        });
      }
      const comm = getPduCommStatus(dev.sta !== undefined ? dev.sta : dev.status);
      grandTotalPow += powVal;
      pList.push({
        id: dev.id,
        name: formatPduDisplayName(dev.id || 'PDU'),
        ip: dev.con_host || dev.ip || '-',
        sta: comm.sta,
        status: comm.internalStatus,
        statusLabel: comm.label,
        badgeClass: comm.badgeClass,
        dotClass: comm.dotClass,
        isAlarm: comm.isAlarm,
        isWarning: comm.isWarning,
        voltage: voltVal,
        current: currVal,
        power: powVal
      });
    });
    state.pduList = pList;
    if (pList.length) {
      if (!state.selectedPduName || !pList.some(p => p.name === state.selectedPduName)) state.selectedPduName = pList[0].name;
    } else state.selectedPduName = '';
    updateSelectedPduMetrics(grandTotalPow);
    const alarmPdu = pList.find(p => p.isAlarm || p.status === 'alarm');
    const warningPdu = pList.find(p => p.isWarning || p.status === 'warning');
    state.pduAlarmMessage = alarmPdu ? alarmPdu.name + ' Alarm Durumunda (' + (alarmPdu.statusLabel || 'ALARM') + ')'
      : warningPdu ? warningPdu.name + ' Uyarı Durumunda (' + (warningPdu.statusLabel || 'UYARI') + ')' : '';
  }

  function updateSelectedPduMetrics(cabinetTotalWatts) {
    if (!state.pduList.length) {
      state.avgInputVoltage = state.totalCurrent = state.pduInstantPower = state.cabinetTotalPower = '-';
      return;
    }
    const sel = state.pduList.find(p => p.name === state.selectedPduName) || state.pduList[0];
    state.avgInputVoltage = sel.voltage > 0 ? sel.voltage.toFixed(1) + ' V' : '-';
    state.totalCurrent = sel.current.toFixed(1) + ' A';
    state.pduInstantPower = (sel.power / 1000).toFixed(2) + ' kW';
    const total = cabinetTotalWatts !== undefined ? cabinetTotalWatts : state.pduList.reduce((s, p) => s + (p.power || 0), 0);
    state.cabinetTotalPower = (total / 1000).toFixed(2) + ' kW';
  }

  // ---------------------------------------------------------------------------
  // Sensör verisi (fetchSensorData + parseAndAssignSensorData birebir)
  // ---------------------------------------------------------------------------
  function fetchSensorData(live) {
    const items = M.sensorIos(state.code, { live, inhibited: !state.tracking });
    const sensors = emptySensors();
    items.forEach(item => {
      const hasVal = item.val !== undefined && item.val !== null && item.val !== '' && item.val !== '-';
      const parsed = hasVal ? Number.parseFloat(item.val) : null;
      const num = parsed !== null && Number.isFinite(parsed) ? parsed : null;
      const id = String(item.id || item.rid || '').toUpperCase();
      const cls = String(item.xdb_cls || '').toUpperCase();
      const desc = String(item.desc || '').toUpperCase();
      const unit = String(item.unit || '').trim();
      const st = getStatusFromSta(item.sta);
      const reading = defUnit => ({ value: num !== null ? parseFloat(num.toFixed(1)) : null, unit: unit || defUnit, status: st.internalStatus, sta: parseSta(item.sta), statusLabel: st.label });
      const door = () => {
        const isOpen = num !== null && num !== 0;
        const s = st.internalStatus;
        const isDoorAlarm = isOpen || s === 'alarm' || s === 'emergency';
        const level = s === 'emergency' ? 'emergency' : isDoorAlarm ? 'critical' : s === 'warning' ? 'warning' : s === 'stopped' ? 'stopped' : s === 'waiting' ? 'waiting' : s === 'disabled' || s === 'offline' ? 'disabled' : 'normal';
        return { status: num !== null ? (isOpen ? 'open' : 'closed') : null, label: num !== null ? (isOpen ? 'Açık' : 'Kapalı') : '-', level, sta: parseSta(item.sta), statusLabel: isOpen ? 'Aksiyon gerekli' : st.label };
      };
      if (id.endsWith('_TEMP_TOP') || id.includes('TEMP_TOP') || desc.includes('ÜST SICAKLIĞI') || desc.includes('UST_SIC') || desc.includes('ÜST SICAKLIK')) sensors.topTemp = reading('°C');
      else if (id.endsWith('_TEMP_MID') || id.includes('TEMP_MID') || desc.includes('ORTA SICAKLIĞI') || desc.includes('ORTA_SIC') || desc.includes('ORTA SICAKLIK')) sensors.midTemp = reading('°C');
      else if (id.endsWith('_TEMP_BOT') || id.includes('TEMP_BOT') || desc.includes('ALT SICAKLIĞI') || desc.includes('ALT_SIC') || desc.includes('ALT SICAKLIK')) sensors.lowTemp = reading('°C');
      else if (id.endsWith('_HUM_MID') || id.includes('HUM') || cls.includes('HUM') || desc.includes('NEM')) sensors.humidity = reading('%RH');
      else if (id.endsWith('_FDOOR') || id.includes('FDOOR') || desc.includes('ÖN KAPAK') || desc.includes('ON_KAPAK')) sensors.frontDoor = door();
      else if (id.endsWith('_RDOOR') || id.includes('RDOOR') || desc.includes('ARKA KAPAK') || desc.includes('ARKA_KAPAK')) sensors.rearDoor = door();
    });
    state.sensors = sensors;
  }

  // ---------------------------------------------------------------------------
  // 42U slot üretimi (generateSlots birebir: kaplanan U'lar 'covered')
  // ---------------------------------------------------------------------------
  function generateSlots(devices) {
    const occ = new Map();
    (devices || []).forEach(d => {
      const startU = Number(d.startU) || 0;
      const uSize = Math.max(1, Number(d.uSize) || 1);
      const displayName = (d.manufacturer || d.model) ? ((d.manufacturer || '') + ' ' + (d.model || '')).trim() : '-';
      if (startU >= 1 && startU <= TOTAL_U) {
        for (let i = 0; i < uSize; i++) {
          const u = startU + i;
          if (u <= TOTAL_U) occ.set(u, { asset: d, startU, uSize, isTopSlot: u === startU + uSize - 1, customerType: d.customerType === 'internal' ? 'internal' : 'external', assetName: displayName, assetType: d.assetType || 'Sunucu' });
        }
      }
    });
    const list = [];
    for (let u = TOTAL_U; u >= 1; u--) {
      const it = occ.get(u);
      if (it) list.push(it.isTopSlot ? Object.assign({}, it, { uNumber: u }) : { uNumber: u, customerType: 'covered', uSize: 1 });
      else list.push({ uNumber: u, customerType: 'empty', uSize: 1 });
    }
    return { front: list, back: list.map(s => Object.assign({}, s)) };
  }

  // Kabin kapasitesi (checkCabinetCapacity — CAT Cabinet limitleri + cihaz jsn weight/power)
  function computeCapacity(cab, excludeAssetId) {
    const lim = M.capacity(cab);
    let totalWeight = 0;
    let totalPower = 0;
    cab.assets.forEach(a => {
      if (excludeAssetId && a.id === excludeAssetId) return;
      const d = detailOf(a, cab);
      if (Number(d.weight)) totalWeight += Number(d.weight);
      if (Number(d.power)) totalPower += Number(d.power);
    });
    return { totalWeight, weightLimit: lim.weightLimit, totalPower, powerLimit: lim.powerLimit, hasWeight: lim.weightLimit > 0, hasPower: lim.powerLimit > 0 };
  }
  const pct = (t, l) => (!l || l <= 0 ? 0 : Math.min(100, Math.round((t / l) * 100)));

  // Cihaz detay alanları (ASM + bellek içi düzenlemeler)
  function detailOf(a, cab) {
    const base = M.details(a, cab);
    const loc = cab ? M.locationOf(cab) : null;
    return Object.assign(base, {
      cabinetName: cab ? cab.code : '',
      locationId: loc ? loc.location_id : '',
      position: a.startU || 0,
      uCapacity: a.uSize || 1,
      manufacturer: a.manufacturer,
      model: a.model,
      name: a.displayName
    }, edits[a.id] || {});
  }
  function portsOf(a, cab) {
    if (!portStore[a.id]) portStore[a.id] = M.ports(a, cab).map(p => Object.assign({ isAutoNumbered: false }, p));
    return portStore[a.id];
  }

  // ---------------------------------------------------------------------------
  // Kabin yükleme
  // ---------------------------------------------------------------------------
  let firstLoad = true;
  function loadCabinet(code) {
    const cab = D.findCabinet(String(code || '').toUpperCase().replace(/^K/, '')) || D.findCabinet('1BJ53');
    state.code = cab.code;
    state.cab = cab;
    const saved = storage.get('aymon_cabinet_tracking_' + cab.code);
    state.tracking = firstLoad && params.get('tracking') === '0' ? false : saved !== '0';
    state.selectedPduName = '';
    state.rackZoomLevel = 1;
    state.zoom = { front: 1, back: 1 };
    state.pan = { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } };
    if (firstLoad && params.get('zoom')) {
      const z = Math.max(1, Math.min(3, parseFloat(params.get('zoom')) || 1));
      state.rackZoomLevel = z;
      state.zoom = { front: z, back: z };
    }
    firstLoad = false;
    refreshData(false);
    state.slots = generateSlots(cab.assets);
    state.capacity = computeCapacity(cab);
    renderPage();
    const url = new URL(window.location.href);
    url.searchParams.set('cabinet', cab.code);
    try { window.history.replaceState(null, '', url.toString()); } catch (e) { /* file:// bazı tarayıcılarda izin vermez */ }
    document.title = 'DCIM TT — Kabin ' + cab.code;
  }
  function refreshData(live) {
    fetchPduData(live);
    fetchSensorData(live);
  }
  function reloadRack() {
    state.slots = generateSlots(state.cab.assets);
    state.capacity = computeCapacity(state.cab);
    renderRack();
    renderSensors();
  }

  // ---------------------------------------------------------------------------
  // Render — üst bar
  // ---------------------------------------------------------------------------
  function locationFullName(cab) {
    const l = M.locationOf(cab);
    return l ? l.full_name : '';
  }
  function topBarHtml() {
    const cab = state.cab;
    const opts = D.cabinets.slice().sort((a, b) => a.code.localeCompare(b.code)).map(c =>
      '<option value="' + esc(c.code) + '">' + esc(c.code + ' · ' + c.pod + (c.note ? ' · ' + c.note : '')) + '</option>').join('');
    const navLink = (href, icon, label, title) =>
      '<a href="' + href + '" title="' + esc(title) + '" class="px-2 py-1 bg-slate-100 dark:bg-surface-panel hover:bg-slate-200 dark:hover:bg-surface-hover text-slate-700 dark:text-slate-300 font-bold text-[10px] rounded-[2px] border border-slate-200 dark:border-border-subtle transition-colors flex items-center gap-1 cursor-pointer"><i class="' + icon + ' text-[10px] text-sky-600 dark:text-sky-400"></i><span>' + label + '</span></a>';
    return '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] px-3 py-1.5 sm:py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs shrink-0">' +
      '<div class="flex items-center gap-2.5 min-w-0">' +
        '<div class="w-7 h-7 sm:w-8 sm:h-8 rounded-[2px] bg-sky-600 text-white font-extrabold flex items-center justify-center text-xs shadow-xs shrink-0"><i class="pi pi-server text-xs sm:text-sm"></i></div>' +
        '<div class="min-w-0">' +
          '<h1 class="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5 sm:gap-2 truncate">' +
            '<span class="truncate">' + esc('Kabin ' + cab.code) + '</span>' +
            (state.tracking
              ? '<span class="px-2 py-0.5 text-[9px] rounded-full font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shrink-0">TAKİP AKTİF</span>'
              : '<span class="px-2 py-0.5 text-[9px] rounded-full font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 shrink-0">TAKİP DEVREDIŞI</span>') +
          '</h1>' +
          '<p class="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">' + esc(locationFullName(cab) || 'Data Center Altyapısı') + ' — (42U Rack Altyapısı)</p>' +
        '</div>' +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2 sm:gap-3">' +
        // Sunum eki: kabin seçici + ilgili ekranlara geçiş
        '<div class="flex items-center gap-1.5 bg-slate-50 dark:bg-surface-panel px-2 py-1 rounded-[2px] border border-slate-200 dark:border-border-subtle" title="Kabin ara / seç">' +
          '<i class="pi pi-search text-[10px] text-slate-400"></i>' +
          '<input type="text" data-picker list="cm-cabinet-list" value="' + esc(cab.code) + '" placeholder="Kabin ara..." spellcheck="false" autocomplete="off" class="w-20 bg-transparent border-0 outline-none text-xs font-bold font-mono text-slate-800 dark:text-slate-200 placeholder:text-slate-400" />' +
          '<datalist id="cm-cabinet-list">' + opts + '</datalist>' +
        '</div>' +
        '<div class="flex items-center gap-1">' +
          navLink('2d.html?cabinet=' + encodeURIComponent(cab.code), 'pi pi-map', '2D', 'Dijital İkiz (2D) üzerinde göster') +
          navLink('3d.html?cabinet=' + encodeURIComponent(cab.code), 'pi pi-box', '3D', 'Dijital İkiz (3D) üzerinde göster') +
          navLink('locks.html?view=cards&cabinet=' + encodeURIComponent(cab.code), 'pi pi-lock', 'Kilit', 'Kapak Kilitleri') +
        '</div>' +
        '<button type="button" data-act="add-device" class="px-2.5 sm:px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-[2px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"><i class="pi pi-plus text-xs"></i><span>Cihaz Ekle</span></button>' +
        '<div class="flex items-center gap-1.5 bg-slate-50 dark:bg-surface-panel px-2 sm:px-2.5 py-1 rounded-[2px] border border-slate-200 dark:border-border-subtle text-xs font-bold">' +
          '<input type="checkbox" id="cabinetTracking"' + (state.tracking ? ' checked' : '') + ' class="rounded-[2px] text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 cursor-pointer" />' +
          '<label for="cabinetTracking" class="cursor-pointer text-slate-800 dark:text-slate-200 text-[10px] sm:text-xs select-none">Kabin Takibi (Alarm Renklenmesi)</label>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render — Bölüm 1: PDU Üniteleri
  // ---------------------------------------------------------------------------
  function pduPanelHtml() {
    const metric = (label, value, colorCls) =>
      '<div class="p-1.5 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] min-w-0">' +
        '<span class="text-[9px] text-slate-500 dark:text-slate-400 block font-medium truncate" title="' + esc(label) + '">' + esc(label) + '</span>' +
        '<span class="text-xs sm:text-sm font-extrabold truncate block ' + colorCls + '">' + esc(value) + '</span>' +
      '</div>';
    const off = 'text-slate-600 dark:text-slate-400';
    const rows = state.pduList.map(pdu => {
      const label = pdu.statusLabel || (pdu.status === 'emergency' ? 'ACİL' : pdu.status === 'warning' ? 'UYARI' : pdu.status === 'alarm' ? 'ALARM' : pdu.status === 'waiting' ? 'VERİ ALINAMIYOR' : pdu.status === 'stopped' ? 'VERİ ALINAMIYOR' : pdu.status === 'offline' ? 'PASİF' : pdu.status === 'disabled' ? 'DEVREDIŞI' : 'NORMAL');
      return '<tr class="hover:bg-slate-50 dark:hover:bg-surface-hover transition-colors">' +
        '<td class="py-1 px-1.5 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap text-[9px]">' + esc(pdu.name) + '</td>' +
        '<td class="py-1 px-1 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap text-[8.5px]">' + esc(pdu.ip) + '</td>' +
        '<td class="py-1 px-1 text-center whitespace-nowrap">' +
          '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-[9px] font-extrabold tracking-wide border transition-all select-none leading-none shrink-0 ' + (!state.tracking ? getPduBadgeClass() : (pdu.badgeClass || getPduBadgeClass(pdu.sta))) + '">' +
            '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + (!state.tracking ? getPduDotClass() : (pdu.dotClass || getPduDotClass(pdu.sta))) + '"></span>' + esc(label) +
          '</span>' +
        '</td>' +
        '<td class="py-1 px-1.5 text-right whitespace-nowrap">' +
          '<button type="button" data-act="pdu-detail" data-pdu="' + esc(pdu.id) + '" class="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[8.5px] rounded-[2px] transition-colors cursor-pointer inline-flex items-center gap-0.5 leading-none"><span>Detay</span></button>' +
        '</td>' +
      '</tr>';
    }).join('');
    return '<div class="space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5">' +
      '<div class="flex items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-1.5 shrink-0">' +
        '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-bolt text-sky-600 dark:text-sky-400 text-xs"></i><span>PDU Üniteleri</span></h2>' +
        '<div class="flex items-center gap-1">' +
          '<button type="button" data-act="add-pdu" class="px-1.5 py-0.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-[9px] rounded-[2px] transition-colors cursor-pointer">PDU Ekle</button>' +
          '<button type="button" data-act="pdu-report" class="px-1.5 py-0.5 bg-slate-100 dark:bg-surface-panel hover:bg-slate-200 dark:hover:bg-surface-hover text-slate-800 dark:text-slate-200 font-bold text-[9px] rounded-[2px] border border-slate-200 dark:border-border-subtle transition-colors cursor-pointer">Rapor</button>' +
        '</div>' +
      '</div>' +
      (state.tracking && state.pduAlarmMessage
        ? '<div class="p-1.5 bg-rose-500/10 dark:bg-rose-500/20 border border-rose-500/30 rounded-[2px] text-rose-700 dark:text-rose-300 text-[10px] font-bold flex items-start gap-1.5"><i class="pi pi-exclamation-triangle text-xs text-rose-500 shrink-0 mt-0.5"></i><span>' + esc(state.pduAlarmMessage) + '</span></div>'
        : '') +
      '<div>' +
        '<label class="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-0.5">Seçili PDU</label>' +
        '<select data-pdu-select class="scada-select w-full py-1 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-border-subtle text-slate-900 dark:text-slate-100">' +
          state.pduList.map(p => '<option value="' + esc(p.name) + '"' + (p.name === state.selectedPduName ? ' selected' : '') + '>' + esc(p.name + ' (' + p.ip + ')') + '</option>').join('') +
        '</select>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-1.5 text-xs">' +
        metric('Ort. Giriş Voltajı', state.avgInputVoltage, 'text-slate-900 dark:text-slate-100') +
        metric('Toplam Akım', state.totalCurrent, !state.tracking ? off : 'text-amber-600 dark:text-amber-400') +
        metric('PDU Anlık Güç Tüketimi', state.pduInstantPower, !state.tracking ? off : 'text-sky-600 dark:text-sky-400') +
        metric('Kabin Toplam Güç Tüketimi', state.cabinetTotalPower, !state.tracking ? off : 'text-emerald-600 dark:text-emerald-400') +
      '</div>' +
      '<div class="border border-slate-200 dark:border-border-subtle rounded-[2px] overflow-hidden text-[9px]">' +
        '<table class="w-full text-left table-auto border-collapse">' +
          '<thead class="bg-slate-100 dark:bg-surface-panel text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-border-subtle"><tr>' +
            '<th class="py-1 px-1.5 whitespace-nowrap">PDU Adı</th><th class="py-1 px-1 whitespace-nowrap">IP Adresi</th>' +
            '<th class="py-1 px-1 text-center whitespace-nowrap">Durum</th><th class="py-1 px-1.5 text-right whitespace-nowrap">Detay</th>' +
          '</tr></thead>' +
          '<tbody class="divide-y divide-slate-100 dark:divide-border-subtle">' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render — Bölüm 2: 42U Rack (Ön + Arka bağımsız görünüm)
  // ---------------------------------------------------------------------------
  function slotHtml(slot, side) {
    if (slot.customerType === 'covered') return '';
    if (slot.customerType === 'empty') {
      return '<div data-slot="' + slot.uNumber + '" data-side="' + side + '" style="flex: 1 1 0px;" class="w-full min-h-0 px-1 border border-dashed border-slate-300 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/40 rounded-[1px] text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-200/50 dark:hover:bg-slate-900/80 transition-colors flex items-center justify-between text-[8px] sm:text-[8.5px] leading-none overflow-hidden cursor-pointer" title="Boş Slot (Tıkla Cihaz Ekle)">' +
        '<span class="font-bold text-[7.5px] sm:text-[8px] opacity-70 font-mono">U' + slot.uNumber + '</span>' +
        '<span class="text-[7px] opacity-30 tracking-widest font-mono">╌╌╌╌╌╌╌╌╌╌</span>' +
        '<span class="font-bold text-[7.5px] sm:text-[8px] opacity-70 font-mono">U' + slot.uNumber + '</span>' +
      '</div>';
    }
    const internal = slot.customerType === 'internal';
    const cls = state.tracking
      ? (internal
        ? 'border-sky-500 bg-sky-500/15 text-sky-900 dark:text-sky-100 dark:bg-gradient-to-r dark:from-slate-900 dark:via-sky-950/70 dark:to-slate-900 hover:brightness-105 dark:hover:brightness-125'
        : 'border-purple-500 bg-purple-500/15 text-purple-900 dark:text-purple-100 dark:bg-gradient-to-r dark:from-slate-900 dark:via-purple-950/70 dark:to-slate-900 hover:brightness-105 dark:hover:brightness-125')
      : 'border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:brightness-105';
    const dot = state.tracking ? (internal ? 'bg-sky-500 shadow-[0_0_4px_#38bdf8]' : 'bg-purple-500 shadow-[0_0_4px_#c084fc]') : 'bg-slate-400 dark:bg-slate-500';
    const u = slot.uSize || 1;
    const range = slot.startU ? 'U' + slot.startU + (u > 1 ? '-U' + (slot.startU + u - 1) : '') : 'U' + slot.uNumber;
    return '<div data-slot="' + slot.uNumber + '" data-side="' + side + '" data-asset="' + esc(slot.asset.id) + '" style="flex: ' + u + ' ' + u + ' 0px" class="w-full min-h-0 px-1 sm:px-1.5 border rounded-[1px] flex items-center justify-between cursor-pointer transition-all shadow-xs overflow-hidden leading-none relative group ' + cls + '" title="' + esc(slot.assetName + ' · ' + slot.asset.hostname) + '">' +
      '<div class="flex items-center gap-1.5 min-w-0 truncate">' +
        '<span class="w-1.5 h-1.5 rounded-full shrink-0 ' + dot + '"></span>' +
        '<span class="font-bold shrink-0 text-[8px] sm:text-[8.5px] bg-slate-200/90 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1 py-0.5 rounded-[1px] font-mono border border-slate-300 dark:border-slate-700">' + range + '</span>' +
        '<span class="truncate font-sans font-bold text-[8.5px] sm:text-[9.5px] text-slate-900 dark:text-white tracking-wide">' + esc(slot.assetName) + '</span>' +
        (u > 1 ? '<span class="text-[7.5px] sm:text-[8px] font-semibold shrink-0 text-amber-600 dark:text-amber-300 font-mono">[' + u + 'U]</span>' : '') +
      '</div>' +
      '<div class="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">' +
        (slot.assetType ? '<span class="hidden sm:inline text-[7px] uppercase font-sans text-slate-500 dark:text-slate-400 truncate max-w-[60px]">' + esc(slot.assetType) + '</span>' : '') +
        '<i class="pi pi-info-circle text-[8px] text-slate-400 dark:text-slate-300"></i>' +
      '</div>' +
    '</div>';
  }

  function chassisTransform(side) {
    return 'translate(' + state.pan[side].x + 'px, ' + state.pan[side].y + 'px) scale(' + state.zoom[side] + ')';
  }
  function viewportHtml(side) {
    const z = state.zoom[side];
    const title = side === 'front' ? 'ÖN GÖRÜNÜM' : 'ARKA GÖRÜNÜM';
    const slots = side === 'front' ? state.slots.front : state.slots.back;
    return '<div data-rack-vp="' + side + '" class="flex-1 min-h-0 h-full overflow-hidden relative flex items-center justify-center p-1 sm:p-2 bg-slate-100/40 dark:bg-slate-900/30 rounded-[3px] border border-slate-200 dark:border-border-subtle select-none' + (z > 1 ? ' cursor-grab' : '') + '">' +
      '<div data-chassis="' + side + '" class="origin-center flex flex-col min-h-0 h-full w-full max-w-[260px] sm:max-w-[300px] md:max-w-[340px] bg-slate-200/90 dark:bg-slate-900/90 border-2 border-slate-300 dark:border-slate-700 rounded-[4px] shadow-xs overflow-hidden p-1 sm:p-1.5 shrink-0 transition-all duration-75" style="transform:' + chassisTransform(side) + ';transform-origin:center center">' +
        '<div class="flex items-center justify-between px-2 py-1 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-[2px] mb-1 shrink-0 select-none">' +
          '<div class="flex items-center gap-1.5"><i class="pi pi-server text-[10px] text-slate-500 dark:text-slate-400"></i><span class="font-black text-slate-800 dark:text-slate-100 text-[10px] sm:text-[11px] tracking-wide uppercase">' + title + '</span></div>' +
          '<div class="flex items-center gap-1">' + (z !== 1 ? '<span class="text-[8px] font-mono text-slate-500 dark:text-slate-400 font-bold">%' + Math.round(z * 100) + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="flex-1 min-h-0 flex flex-col justify-between gap-[1px] sm:gap-[1.5px] font-mono select-none bg-slate-100 dark:bg-slate-950 p-1 rounded-[2px] border border-slate-300 dark:border-slate-800 shadow-inner">' +
          slots.map(s => slotHtml(s, side)).join('') +
        '</div>' +
        '<div class="flex items-center justify-between px-2 py-0.5 bg-slate-200/80 dark:bg-slate-800/80 border-t border-slate-300 dark:border-slate-700 mt-1 shrink-0 text-[8.5px] font-mono text-slate-500 dark:text-slate-400 select-none"><span>42U CHASSIS</span><span>' + (side === 'front' ? 'FRONT' : 'REAR') + '</span></div>' +
      '</div>' +
    '</div>';
  }
  function rackPanelInnerHtml() {
    const z = state.rackZoomLevel;
    return '<div class="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-1.5 gap-2 shrink-0">' +
        '<div class="flex items-center gap-1 bg-slate-50 dark:bg-surface-panel px-1.5 py-0.5 rounded-[2px] border border-slate-200 dark:border-border-subtle select-none">' +
          '<button type="button" data-act="rack-zoom-out"' + (z <= 1 ? ' disabled' : '') + ' title="Uzaklaştır (Ekrana Tam Sığdır)" class="p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-35"><i class="pi pi-minus text-[10px]"></i></button>' +
          '<span class="font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300 min-w-[32px] text-center">%' + Math.round(z * 100) + '</span>' +
          '<button type="button" data-act="rack-zoom-in"' + (z >= 3 ? ' disabled' : '') + ' title="Yakınlaştır (Scroll ile de yapılabilir)" class="p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-35"><i class="pi pi-plus text-[10px]"></i></button>' +
          '<button type="button" data-act="rack-zoom-reset" title="Sıfırla / Ekrana Tam Sığdır" class="p-0.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer border-l border-slate-200 dark:border-border-subtle pl-1 ml-0.5"><i class="pi pi-refresh text-[10px]"></i></button>' +
        '</div>' +
        '<div class="flex items-center gap-3 text-[10px] font-semibold text-slate-600 dark:text-slate-400">' +
          '<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-[2px] bg-sky-500"></span> İç Müşteri</span>' +
          '<span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-[2px] bg-purple-500"></span> Dış Müşteri</span>' +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-2 gap-2 sm:gap-3 flex-1 min-h-0 h-full overflow-hidden">' + viewportHtml('front') + viewportHtml('back') + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Render — Bölüm 3: Sensörler & Kapasite Limitleri
  // ---------------------------------------------------------------------------
  function sensorPanelHtml() {
    const s = state.sensors;
    const tr = state.tracking;
    const reading = (label, r, defColor) =>
      '<div class="p-1.5 rounded border flex items-center justify-between transition-colors ' + getSensorCardClass(r.status) + '">' +
        '<span class="font-bold text-slate-700 dark:text-slate-300 text-[11px]">' + label + ':</span>' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="font-extrabold text-xs ' + getSensorValueColorClass(r.status, undefined, defColor) + '">' + esc(r.value != null ? r.value + ' ' + r.unit : '-') + '</span>' +
          (tr && r.status && r.status !== 'normal' ? '<span class="inline-flex items-center px-1 py-0.5 rounded-[2px] text-[8px] font-bold border leading-none ' + getPduBadgeClass(r.status) + '">' + esc(r.statusLabel || String(r.status).toUpperCase()) + '</span>' : '') +
        '</div>' +
      '</div>';
    const door = (label, d) => {
      const cardStatus = d.level === 'critical' ? 'alarm' : d.level === 'warning' ? 'warning' : d.level === 'stopped' ? 'stopped' : d.level;
      return '<div class="p-1.5 rounded border flex items-center justify-between transition-colors ' + getSensorCardClass(cardStatus, d.level) + '">' +
        '<span class="font-bold text-slate-700 dark:text-slate-300 text-[11px]">' + label + ':</span>' +
        '<div class="flex items-center gap-1.5">' +
          '<span class="font-extrabold flex items-center gap-1 text-xs ' + getSensorValueColorClass(d.level, d.level) + '">' +
            (d.status != null ? '<i class="' + (d.status === 'open' ? 'pi pi-lock-open' : 'pi pi-lock') + ' text-xs"></i>' : '') +
            '<span>' + esc(d.status != null ? d.label : '-') + '</span>' +
          '</span>' +
          (tr && d.status != null && (d.status === 'open' || d.level === 'critical') ? '<span class="inline-flex items-center px-1 py-0.5 rounded-[2px] text-[8px] font-bold border leading-none bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400 dark:border-rose-500/40">Aksiyon gerekli</span>' : '') +
          (tr && d.level && d.level !== 'normal' && d.level !== 'critical' && d.status !== 'open' ? '<span class="inline-flex items-center px-1 py-0.5 rounded-[2px] text-[8px] font-bold border leading-none ' + getPduBadgeClass(d.level) + '">' + esc(d.statusLabel || String(d.level).toUpperCase()) + '</span>' : '') +
        '</div>' +
      '</div>';
    };
    const c = state.capacity;
    return '<div class="space-y-2 flex-1 min-h-0 overflow-y-auto pr-0.5">' +
        '<div class="flex items-center justify-between border-b border-slate-200 dark:border-border-subtle pb-1.5 shrink-0">' +
          '<h2 class="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5"><i class="pi pi-wave-pulse text-sky-600 dark:text-sky-400 text-xs"></i><span>Sensörler</span></h2>' +
          '<div class="flex items-center gap-1">' +
            '<button type="button" data-act="sensor-settings" class="px-1.5 py-0.5 bg-slate-100 dark:bg-surface-panel text-slate-800 dark:text-slate-200 font-bold text-[9px] rounded-[2px] border border-slate-200 dark:border-border-subtle cursor-pointer hover:bg-slate-200 dark:hover:bg-surface-hover">Ayarlar</button>' +
            '<button type="button" data-act="sensor-report" class="px-1.5 py-0.5 bg-slate-100 dark:bg-surface-panel text-slate-800 dark:text-slate-200 font-bold text-[9px] rounded-[2px] border border-slate-200 dark:border-border-subtle cursor-pointer hover:bg-slate-200 dark:hover:bg-surface-hover">Rapor</button>' +
          '</div>' +
        '</div>' +
        '<div class="space-y-1.5 text-xs">' +
          reading('Üst Sıcaklık', s.topTemp) + reading('Orta Sıcaklık', s.midTemp) + reading('Alt Sıcaklık', s.lowTemp) +
          reading('Nem Oranı', s.humidity, 'text-sky-600 dark:text-sky-400') +
          door('Ön Kapak Durumu', s.frontDoor) + door('Arka Kapak Durumu', s.rearDoor) +
        '</div>' +
      '</div>' +
      '<div class="mt-2 pt-1.5 border-t border-slate-200 dark:border-border-subtle bg-slate-50 dark:bg-surface-panel p-2 rounded text-[11px] space-y-1.5 shrink-0">' +
        '<span class="font-extrabold text-slate-900 dark:text-slate-100 block mb-0.5">Kabin Kapasite Limitleri</span>' +
        '<div>' +
          '<div class="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[10px] mb-0.5"><span>Ağırlık Yükü:</span><strong class="text-slate-900 dark:text-slate-100 font-mono">' + (c.hasWeight ? c.totalWeight + ' / ' + c.weightLimit + ' kg' : '-') + '</strong></div>' +
          '<div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden"><div class="bg-sky-500 h-full rounded-full transition-all duration-300" style="width:' + (c.hasWeight ? pct(c.totalWeight, c.weightLimit) : 0) + '%"></div></div>' +
        '</div>' +
        '<div>' +
          '<div class="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[10px] mb-0.5"><span>Güç Tüketimi:</span><strong class="text-amber-600 dark:text-amber-400 font-mono">' + (c.hasPower ? c.totalPower + ' / ' + c.powerLimit + ' W' : '-') + '</strong></div>' +
          '<div class="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden"><div class="bg-amber-500 h-full rounded-full transition-all duration-300" style="width:' + (c.hasPower ? pct(c.totalPower, c.powerLimit) : 0) + '%"></div></div>' +
        '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------------------
  // Sayfa iskeleti
  // ---------------------------------------------------------------------------
  function renderPage() {
    root.innerHTML =
      '<div class="flex flex-col flex-1 min-h-0 space-y-2 overflow-hidden">' +
        topBarHtml() +
        '<div class="grid grid-cols-1 xl:grid-cols-3 flex-1 gap-2.5 min-h-0 overflow-y-auto xl:overflow-hidden">' +
          '<div id="cm-pdu" class="w-full min-w-0 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2.5 shadow-2xs flex flex-col justify-between min-h-[280px] xl:min-h-0 xl:h-full overflow-hidden"></div>' +
          '<div id="cm-rack" class="w-full min-w-0 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2 sm:p-2.5 space-y-2 shadow-2xs flex flex-col justify-between min-h-[460px] xl:min-h-0 xl:h-full overflow-hidden"></div>' +
          '<div id="cm-sensors" class="w-full min-w-0 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] p-2 sm:p-2.5 shadow-2xs flex flex-col justify-between min-h-[300px] xl:min-h-0 xl:h-full overflow-hidden"></div>' +
        '</div>' +
      '</div>';
    renderPdu();
    renderRack();
    renderSensors();
  }
  function renderPdu() {
    const el = document.getElementById('cm-pdu');
    if (el) el.innerHTML = pduPanelHtml();
  }
  function renderRack() {
    const el = document.getElementById('cm-rack');
    if (el) el.innerHTML = rackPanelInnerHtml();
  }
  function renderSensors() {
    const el = document.getElementById('cm-sensors');
    if (el) el.innerHTML = sensorPanelHtml();
  }

  // ---------------------------------------------------------------------------
  // Rack zoom / pan (zoomInRack, zoomOutRack, clampRackPan, onRackMouse*)
  // ---------------------------------------------------------------------------
  function clampPan(side) {
    const scale = state.zoom[side];
    if (scale <= 1) { state.pan[side] = { x: 0, y: 0 }; return; }
    const vp = document.querySelector('[data-rack-vp="' + side + '"]');
    if (!vp) return;
    const ch = vp.firstElementChild;
    const cw = (ch && ch.offsetWidth) || 300;
    const chh = (ch && ch.offsetHeight) || 700;
    const limitX = Math.max(0, Math.abs(cw * scale - (vp.clientWidth || 400)) / 2 + 30);
    const limitY = Math.max(0, Math.abs(chh * scale - (vp.clientHeight || 600)) / 2 + 30);
    state.pan[side].x = Math.max(-limitX, Math.min(limitX, state.pan[side].x));
    state.pan[side].y = Math.max(-limitY, Math.min(limitY, state.pan[side].y));
  }
  function zoomRack(dir, step, side) {
    const sides = side ? [side] : ['front', 'back'];
    const apply = z => (dir > 0 ? Math.min(3, +(z + step).toFixed(2)) : Math.max(1, +(z - step).toFixed(2)));
    if (side) {
      state.zoom[side] = apply(state.zoom[side]);
      state.rackZoomLevel = state.zoom[side];
    } else {
      state.rackZoomLevel = apply(state.rackZoomLevel);
      state.zoom.front = state.zoom.back = state.rackZoomLevel;
    }
    sides.forEach(s => { if (state.zoom[s] <= 1) state.pan[s] = { x: 0, y: 0 }; else clampPan(s); });
    renderRack();
  }
  function resetRackZoom() {
    state.rackZoomLevel = 1;
    state.zoom = { front: 1, back: 1 };
    state.pan = { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } };
    renderRack();
  }

  // ---------------------------------------------------------------------------
  // Olaylar — sayfa
  // ---------------------------------------------------------------------------
  root.addEventListener('click', e => {
    const actEl = e.target.closest('[data-act]');
    if (actEl && root.contains(actEl)) {
      const act = actEl.getAttribute('data-act');
      if (act === 'add-device') openCreate(null);
      else if (act === 'add-pdu') openAddPduDialog();
      else if (act === 'pdu-report') window.location.href = 'reports.html#energy';
      else if (act === 'sensor-report') window.location.href = 'reports.html#cabin';
      else if (act === 'sensor-settings') openSensorSettingsDialog();
      else if (act === 'pdu-detail') openPduDetail(actEl.getAttribute('data-pdu'));
      else if (act === 'rack-zoom-in') zoomRack(1, 0.1);
      else if (act === 'rack-zoom-out') zoomRack(-1, 0.1);
      else if (act === 'rack-zoom-reset') resetRackZoom();
      return;
    }
    const slotEl = e.target.closest('[data-slot]');
    if (slotEl) onSlotClick(slotEl);
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-pdu-select]')) {
      state.selectedPduName = e.target.value;
      updateSelectedPduMetrics();
      renderPdu();
    } else if (e.target.id === 'cabinetTracking') {
      onCabinetTrackingChange(e.target.checked);
    } else if (e.target.matches('[data-picker]')) {
      pickCabinet(e.target);
    }
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('[data-picker]')) pickCabinet(e.target);
  });
  root.addEventListener('input', e => {
    // datalist'ten seçim yapıldığında değer tam kabin kodu olur
    if (e.target.matches('[data-picker]') && D.findCabinet(e.target.value.trim().toUpperCase()) && e.inputType !== 'insertText' && e.inputType !== 'deleteContentBackward') pickCabinet(e.target);
  });
  function pickCabinet(input) {
    const v = input.value.trim().toUpperCase().split(/\s/)[0].replace(/^K/, '');
    const cab = D.findCabinet(v);
    if (!cab) { toast('"' + input.value + '" kodlu kabin bulunamadı.', 'warning', 'Kabin Seçimi'); return; }
    if (cab.code !== state.code) loadCabinet(cab.code);
  }

  // Wheel: panel geneli → iki görünüm birlikte; görünüm üzerinde → yalnız o taraf
  root.addEventListener('wheel', e => {
    const rack = e.target.closest('#cm-rack');
    if (!rack) return;
    e.preventDefault();
    const vp = e.target.closest('[data-rack-vp]');
    zoomRack(e.deltaY < 0 ? 1 : -1, 0.08, vp ? vp.getAttribute('data-rack-vp') : undefined);
  }, { passive: false });

  root.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const vp = e.target.closest('[data-rack-vp]');
    if (!vp) return;
    const side = vp.getAttribute('data-rack-vp');
    if (state.zoom[side] <= 1) return;
    state.panning = { side, startX: e.clientX, startY: e.clientY, initX: state.pan[side].x, initY: state.pan[side].y };
    state.hasPanned = false;
    const ch = vp.querySelector('[data-chassis]');
    ch.classList.remove('transition-all', 'duration-75');
    ch.classList.add('transition-none');
    vp.classList.remove('cursor-grab');
    vp.classList.add('cursor-grabbing');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    const p = state.panning;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.hasPanned = true;
    state.pan[p.side] = { x: p.initX + dx, y: p.initY + dy };
    clampPan(p.side);
    const ch = document.querySelector('[data-chassis="' + p.side + '"]');
    if (ch) ch.style.transform = chassisTransform(p.side);
  });
  document.addEventListener('mouseup', () => {
    if (!state.panning) return;
    const side = state.panning.side;
    state.panning = null;
    const vp = document.querySelector('[data-rack-vp="' + side + '"]');
    if (vp) {
      vp.classList.remove('cursor-grabbing');
      vp.classList.add('cursor-grab');
      const ch = vp.querySelector('[data-chassis]');
      ch.classList.remove('transition-none');
      ch.classList.add('transition-all', 'duration-75');
    }
  });

  function onCabinetTrackingChange(enabled) {
    state.tracking = enabled;
    storage.set('aymon_cabinet_tracking_' + state.code, enabled ? '1' : '0');
    refreshData(false);
    renderPage();
    if (enabled) toast(state.code + ' için kabin takibi ve alarm renklendirmesi aktifleştirildi.', 'success', 'Kabin Takibi');
    else toast(state.code + " için kabin takibi devredışı bırakıldı ve XML'e kaydedildi.", 'warning', 'Kabin Takibi');
  }

  function openPduDetail(pduId) {
    const target = String(pduId || '').replace(/_DV$/, '');
    window.location.href = 'pdu-detail.html?cabinet=' + encodeURIComponent(state.code) + '&targetPduId=' + encodeURIComponent(target) + '&docId=T01';
  }

  // app-dialog: PDU Ekleme Sayfası
  function openAddPduDialog() {
    dialog({
      title: 'PDU Ekleme Sayfası',
      subtitle: 'Kabine yeni PDU ünitesi ve IP adresi tanımı.',
      variant: 'info',
      confirmLabel: 'PDU Tanımla',
      body: '<p class="text-xs text-slate-400">Gelecekte Sunbird benzeri plugin altyapısı eklenecektir. Şimdilik PDU ekleme formu.</p>'
    });
  }
  // app-dialog: Sensör Eşik Değer Ayarları
  function openSensorSettingsDialog() {
    dialog({
      title: 'Sensör Eşik Değer Ayarları',
      subtitle: 'Üst, orta, alt sıcaklık ve nem alarm eşiklerini ayarlayın.',
      variant: 'warning',
      confirmLabel: 'Eşikleri Kaydet',
      body: '<div class="space-y-2 text-xs">' +
        '<div><label class="block font-bold text-slate-300 mb-1">Üst Sıcaklık Alarm Eşiği (°C)</label><input type="number" value="28" class="scada-input w-full" /></div>' +
        '<div><label class="block font-bold text-slate-300 mb-1">Nem Üst Limit (%)</label><input type="number" value="65" class="scada-input w-full" /></div>' +
      '</div>',
      onConfirm: () => { toast(state.code + ' sensör eşik değerleri kaydedildi.', 'success', 'Sensör Ayarları'); }
    });
  }

  // ---------------------------------------------------------------------------
  // Slot tıklama (onSlotClick)
  // ---------------------------------------------------------------------------
  function onSlotClick(el) {
    if (state.hasPanned) { state.hasPanned = false; return; }
    const u = parseInt(el.getAttribute('data-slot'), 10);
    const assetId = el.getAttribute('data-asset');
    if (!assetId) { openCreate(u); return; }
    const asset = state.cab.assets.find(a => a.id === assetId);
    if (asset) openDevice(asset, u);
  }

  // ==========================================================================
  // CİHAZ DETAY / EKLEME PENCERESİ
  // ==========================================================================
  let dm = null;
  const dmHost = document.createElement('div');
  const portHost = document.createElement('div');
  const portDetailHost = document.createElement('div');
  const tipEl = document.createElement('div');
  tipEl.className = 'fixed p-2 bg-slate-900 border border-slate-700 rounded-[2px] text-xs text-slate-200 z-50 pointer-events-none shadow-lg font-mono hidden';
  const debugEl = document.createElement('div');
  debugEl.className = 'fixed p-2 bg-slate-900 text-slate-300 text-xs rounded-[2px] border border-slate-700 z-50 pointer-events-none hidden';
  document.body.appendChild(dmHost);
  document.body.appendChild(portHost);
  document.body.appendChild(portDetailHost);
  document.body.appendChild(tipEl);
  document.body.appendChild(debugEl);

  function newDmState() {
    return {
      isCreatMode: false, isEditMode: false, isAddingToSpecificSlot: false,
      slotU: null, asset: null, d: null, snapshot: null, ports: [],
      img: { front: null, back: null }, imgFromCat: { front: false, back: false },
      scale: { front: 1, back: 1 }, pan: { front: { x: 0, y: 0 }, back: { x: 0, y: 0 } },
      panning: null, hasDragged: false, menu: null, portEditMode: null, selectedPort: null,
      analyzing: { front: false, back: false }, naming: { front: 'linear', back: 'linear' },
      classSearch: '', showClassDropdown: false, isSaving: false, scrapNew: false, lostNew: false
    };
  }

  // Varsayılan (boş) cihaz — createNewDevice / initializeNewDevice
  function blankDetail(position) {
    const loc = M.locationOf(state.cab);
    return {
      deviceId: '', frontAssetId: '', label: '', serialNumber: '', assetTag: '', supervisor: '', owner: '',
      primaryIP: '', hostname: '', cabinetName: state.code, locationId: loc ? loc.location_id : '',
      deviceClass: 'Yeni Cihaz', position: position || 0, deviceType: '', manufacturer: '', model: '', name: '',
      uCapacity: 1, weight: 0, power: 0, powerConnections: 0, notes: '', stock: '',
      assignment: '0', owning_directorate: 1, model_id: '',
      warranty_start_date: '', warranty_end_date: '', service_end_date: '', vendor_warranty_date: '',
      lastUpdateDate: '', whoUpdate: ''
    };
  }

  function openCreate(u) {
    dm = newDmState();
    dm.isCreatMode = true;
    if (u) {
      dm.isAddingToSpecificSlot = true;
      dm.isEditMode = true;
      dm.slotU = u;
    }
    dm.d = blankDetail(u || 0);
    dm.snapshot = JSON.stringify(dm.d);
    renderDm();
  }
  function openDevice(asset, slotU) {
    const cab = M.cabinetOfAsset(asset.id) || state.cab;
    dm = newDmState();
    dm.asset = asset;
    dm.slotU = slotU || (asset.startU + asset.uSize - 1);
    dm.d = detailOf(asset, cab);
    dm.snapshot = JSON.stringify(dm.d);
    dm.ports = portsOf(asset, cab);
    const f = M.face(asset, 'front');
    const b = M.face(asset, 'back');
    dm.img.front = edits[asset.id] && 'imgFront' in edits[asset.id] ? edits[asset.id].imgFront : (f ? f.img : null);
    dm.img.back = edits[asset.id] && 'imgBack' in edits[asset.id] ? edits[asset.id].imgBack : (b ? b.img : null);
    renderDm();
  }
  function closeDm() {
    dm = null;
    dmHost.innerHTML = '';
    hideTip();
    debugEl.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  // Kurallar (isCabinetRequired, isLocationVisible ...)
  const assignVal = () => { const v = parseInt(dm.d.assignment, 10); return Number.isFinite(v) ? v : -1; };
  const isCabinetAllowed = () => assignVal() === 0;
  const isCabinetRequired = () => assignVal() === 0;
  const isCabinetProhibited = () => assignVal() !== -1 && assignVal() !== 0;
  const isPositionProhibited = isCabinetProhibited;
  const isStockAllowed = () => assignVal() === 1;
  const isLocationAllowed = () => [0, 4, 3, 5, 2].indexOf(assignVal()) >= 0;
  const isLocationProhibited = () => assignVal() !== -1 && !isLocationAllowed();
  const isLocationVisible = isLocationAllowed;
  const isUsableDevice = () => (assignVal() === 2 && !dm.scrapNew) || (assignVal() === 6 && !dm.lostNew);
  const isPatchPanel = () => dm.d.deviceType === 'Patch Panel';
  const PROHIBITED_REASON = { 1: 'Cihaz stokta olduğu için', 2: 'Hurdaya ayrılmış cihazlar için', 3: 'Teslimat bekleyen cihazlar için', 4: 'Bakımda olan cihazlar için', 5: 'İade durumundaki cihazlar için', 6: 'Kayıp durumundaki cihazlar için' };
  const cabinetProhibitedReason = () => (PROHIBITED_REASON[assignVal()] ? PROHIBITED_REASON[assignVal()] + ' kabin seçimi yapılamaz' : 'Bu assignment durumunda kabin seçimi yapılamaz');
  const positionProhibitedReason = () => (PROHIBITED_REASON[assignVal()] ? PROHIBITED_REASON[assignVal()] + ' pozisyon seçimi yapılamaz' : 'Bu assignment durumunda pozisyon seçimi yapılamaz');

  // Sözleşme tarihleri (isContractExpired / isContractExpiringSoon / getDaysDiff)
  const dayStart = v => { const t = new Date(v); t.setHours(0, 0, 0, 0); return t; };
  const today = () => dayStart(new Date());
  const isExpired = v => !!v && dayStart(v) < today();
  const isExpiringSoon = v => { if (!v) return false; const diff = dayStart(v) - today(); return diff >= 0 && diff < 30 * 86400000; };
  function daysDiff(v, future) {
    if (!v) return '';
    const diff = future ? dayStart(v) - today() : today() - dayStart(v);
    const days = Math.ceil(diff / 86400000);
    if (future) return days < 0 ? 'Süresi doldu' : days === 0 ? 'Bugün bitiyor' : days + ' gün kaldı';
    return days < 0 ? 'Henüz başlamadı' : days === 0 ? 'Bugün başladı' : days + ' gün önce';
  }

  const nf1 = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // --- form alanı yardımcıları ---
  const lbl = (text, req) => '<label class="block text-xs font-semibold text-slate-600 dark:text-slate-400">' + text + (req ? ' <span class="text-rose-500">*</span>' : '') + '</label>';
  const fld = (inner, span) => '<div class="space-y-1' + (span ? ' sm:col-span-2' : '') + '">' + inner + '</div>';
  function inp(field, value, readonly, extra, type) {
    return '<input type="' + (type || 'text') + '" data-f="' + field + '" value="' + esc(value == null ? '' : value) + '"' + (readonly ? ' readonly' : '') +
      ' class="scada-input' + (extra ? ' ' + extra : '') + '" />';
  }
  function sel(field, options, value, extra, disabled) {
    return '<select data-f="' + field + '" class="scada-select' + (extra ? ' ' + extra : '') + '"' + (disabled ? ' disabled' : '') + '>' +
      options.map(o => '<option value="' + esc(o.value) + '"' + (String(o.value) === String(value) ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</select>';
  }

  function dmSection1() {
    const d = dm.d;
    const creat = dm.isCreatMode;
    const edit = dm.isEditMode;
    let h = '';
    if (!creat) {
      h += fld('<label class="block text-xs font-semibold text-slate-600 dark:text-slate-400">Asset ID</label>' +
        (Number(d.owning_directorate) === 0
          ? '<input type="text" value="' + esc(d.frontAssetId) + '" readonly class="scada-input opacity-75 cursor-not-allowed" />'
          : inp('deviceId', d.deviceId, !dm.isAddingToSpecificSlot, !dm.isAddingToSpecificSlot ? 'opacity-75' : '')));
    }
    if (Number(d.owning_directorate) === 1 && !creat) {
      h += fld('<label class="block text-xs font-semibold text-slate-600 dark:text-slate-400">SuperVISOR</label>' + inp('supervisor', d.supervisor, true, 'opacity-75'));
    }
    if (Number(d.owning_directorate) === 0 || creat) {
      h += fld(lbl('Owner', creat) + inp('owner', d.owner, !creat, !creat ? 'opacity-75' : ''));
    }
    if (Number(d.owning_directorate) === 1 && !creat) {
      h += fld(lbl('Supervisor Müdürlüğü') + inp('label', d.label, true, 'opacity-75'), true);
    }
    h += fld(lbl('Seri Numarası', creat) + inp('serialNumber', d.serialNumber, !creat, !creat ? 'opacity-75' : ''));
    h += fld(lbl('Barkod / RFID') + inp('assetTag', d.assetTag, !edit && !creat, !edit && !creat ? 'opacity-75' : ''));
    h += fld(lbl('Hostname') + inp('hostname', d.hostname, !creat, !creat ? 'opacity-75' : ''));
    h += fld(lbl('IP Adresi') + inp('primaryIP', d.primaryIP, !creat, !creat ? 'opacity-75' : ''));

    if (isLocationVisible()) {
      let loc = lbl('Lokasyon', (isLocationAllowed() && edit) || creat);
      if (!edit && !creat) {
        const l = M.locations.find(x => x.location_id === d.locationId);
        loc += '<input type="text" value="' + esc(l ? l.full_name : '') + '" readonly class="scada-input opacity-75 w-full" />';
      }
      if ((edit && isLocationAllowed()) || creat) {
        loc += sel('locationId', [{ value: '', label: 'Lokasyon Seçiniz' }].concat(M.locations.map(l => ({ value: l.location_id, label: l.full_name }))), d.locationId, 'w-full');
      }
      if (isLocationProhibited()) loc += '<div class="text-xs text-amber-400 font-medium mt-1">Lokasyon değiştirilemez.</div>';
      if (!d.locationId && isCabinetRequired()) loc += '<div class="blinking-text">Lütfen önce lokasyon seçiniz.</div>';
      h += fld(loc, true);
    }

    let asg = lbl('Atama Durumu', creat);
    if (!edit && !creat) asg += '<input type="text" value="' + esc(ASSIGNMENT_MAP[d.assignment] || '') + '" readonly class="scada-input opacity-75" />';
    else asg += sel('assignment', (Number(d.owning_directorate) === 0 && !creat ? ASSIGNMENT_OPTIONS_EXT : ASSIGNMENT_OPTIONS).map(o => ({ value: String(o.value), label: o.label })), d.assignment, '', isUsableDevice());
    h += fld(asg);

    if (isStockAllowed()) {
      let st = lbl('Stok Lokasyonu', edit);
      if (!edit && !creat) st += '<input type="text" value="' + esc(d.stock || 'Atanmamış') + '" readonly class="scada-input opacity-75" />';
      else {
        st += '<div>' + sel('stock', [{ value: '', label: 'Lokasyon Seçiniz' }].concat(M.stockLocations.map(s => ({ value: s, label: s }))), d.stock) + '</div>';
        if (!d.stock) st += '<div class="blinking-text">Lütfen stok lokasyonu seçiniz.</div>';
      }
      h += fld(st);
    }

    h += fld(lbl('Notlar') + '<textarea data-f="notes" rows="3"' + (!edit && !creat ? ' readonly' : '') + ' class="scada-textarea' + (!edit && !creat ? ' opacity-75' : '') + '">' + esc(d.notes || '') + '</textarea>', true);

    const dateFld = (label, v, future) => {
      const cls = future ? (isExpiringSoon(v) ? 'text-amber-400' : isExpired(v) ? 'text-rose-400' : 'text-slate-400') : 'text-sky-400';
      return '<div class="space-y-1">' + lbl(label) + '<input type="text" value="' + esc(v || '') + '" readonly class="scada-input opacity-75" />' +
        (v ? '<span class="text-[11px] block mt-0.5 ' + cls + '">' + esc(daysDiff(v, future)) + '</span>' : '') + '</div>';
    };
    h += '<div class="space-y-3 sm:col-span-2 pt-2 border-t border-slate-200 dark:border-border-subtle">' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + dateFld('Garanti Başlangıç Tarihi', d.warranty_start_date, false) + dateFld('Garanti Bitiş Tarihi', d.warranty_end_date, true) + '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + dateFld('Bakım Bitiş Tarihi', d.service_end_date, false) + dateFld('Vendor Garanti Tarihi', d.vendor_warranty_date, true) + '</div>' +
    '</div>';

    if (!creat) {
      h += fld(lbl('Son Güncelleme Tarihi') + '<input type="text" value="' + esc(d.lastUpdateDate || '') + '"' + (!dm.isAddingToSpecificSlot ? ' readonly' : '') + ' class="scada-input opacity-75" />');
      h += fld(lbl('Son Güncelleyen') + '<input type="text" value="' + esc(d.whoUpdate || '') + '"' + (!dm.isAddingToSpecificSlot ? ' readonly' : '') + ' class="scada-input opacity-75" />');
    }
    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + h + '</div>';
  }

  function classListHtml() {
    const q = dm.classSearch.trim().toLocaleLowerCase('tr-TR');
    const list = M.catalog.filter(c => !q || (c.brand + ' - ' + c.name + ' ' + c.nature).toLocaleLowerCase('tr-TR').indexOf(q) >= 0);
    if (!dm.showClassDropdown) return '';
    if (!list.length) return '<ul class="autocomplete-list"><li data-act="cls-add" class="px-3 py-2 text-xs text-sky-400 hover:bg-slate-700 cursor-pointer"><span>Sonuç bulunamadı. Yeni model eklemek için tıklayınız.</span></li></ul>';
    return '<ul class="autocomplete-list">' + list.map(c => '<li data-cls="' + esc(c.model_id) + '">' + esc(c.brand + ' - ' + c.name) + '</li>').join('') + '</ul>';
  }

  function dmSection2() {
    const d = dm.d;
    const creat = dm.isCreatMode;
    const edit = dm.isEditMode;
    let h = '';
    if (isCabinetAllowed()) {
      let c = lbl('Kabin', isCabinetRequired() && (edit || creat));
      if (!edit && !creat) c += '<input type="text" value="' + esc(d.cabinetName) + '" readonly class="scada-input opacity-75" />';
      else {
        if (isCabinetProhibited()) c += '<div class="text-xs text-amber-400 font-medium">' + esc(cabinetProhibitedReason()) + '</div>';
        const loc = M.locations.find(l => l.location_id === d.locationId);
        const cabs = loc ? D.cabinets.filter(x => x.pod === loc.pod).map(x => x.code).sort() : [];
        if (isCabinetRequired() && d.locationId) c += '<div>' + sel('cabinetName', (d.cabinetName ? [] : [{ value: '', label: '' }]).concat(cabs.map(x => ({ value: x, label: x }))), d.cabinetName, 'w-full') + '</div>';
        if (d.locationId && !cabs.length && isCabinetRequired()) c += '<div class="blinking-text">Seçilen lokasyonda kabin bulunamadı.</div>';
        if (!d.cabinetName && cabs.length && isCabinetRequired()) c += '<div class="blinking-text">Envanter için kabin seçiniz.</div>';
      }
      h += fld(c, true);
    }

    let dc = lbl('Cihaz Sınıfı / Modeli', creat);
    if (creat || dm.isAddingToSpecificSlot) {
      dc += '<div><input type="text" data-cls-search value="' + esc(dm.classSearch) + '" class="scada-input w-full" placeholder="Cihaz sınıfı ara (Marka - Model)..." aria-label="Cihaz Sınıfı / Modeli" autocomplete="off" />' +
        '<div data-cls-list>' + classListHtml() + '</div></div>';
    } else dc += '<input type="text" value="' + esc(d.deviceClass) + '" readonly class="scada-input opacity-75" />';
    h += '<div class="space-y-1 relative sm:col-span-2">' + dc + '</div>';

    h += fld(lbl('U Kapasitesi (Yükseklik)', creat) + inp('uCapacity', d.uCapacity, !creat, !creat ? 'opacity-75' : '', 'number'));

    if (isCabinetAllowed()) {
      let p = lbl('Kabin İçi Pozisyon (U)', isCabinetRequired() && d.cabinetName && (edit || creat));
      if (!edit && !creat) p += '<input type="text" value="' + esc(d.position || '') + '" readonly class="scada-input opacity-75" />';
      else {
        if (isPositionProhibited()) p += '<div class="text-xs text-amber-400">' + esc(positionProhibitedReason()) + '</div>';
        if (isCabinetRequired() && !d.cabinetName) p += '<div class="blinking-text">Lütfen önce kabin seçiniz.</div>';
        if (isCabinetRequired() && d.locationId && d.cabinetName) {
          p += '<div class="flex gap-2 items-center">' +
            '<input type="text" value="' + esc(d.position || '') + '" readonly placeholder="Pozisyon seçiniz" class="scada-input flex-1" />' +
            '<button type="button" data-act="dm-pos" title="Kabin üzerinden pozisyon seç" class="p-2 bg-sky-600 hover:bg-sky-500 text-white rounded-[2px] transition-colors cursor-pointer flex items-center justify-center"><i class="pi pi-th-large text-xs"></i></button>' +
          '</div>';
        }
      }
      h += fld(p);
    }

    if (d.cabinetName) {
      const cab = D.findCabinet(d.cabinetName);
      if (cab) {
        const cap = computeCapacity(cab, dm.asset ? dm.asset.id : null);
        const over = cap.totalWeight > cap.weightLimit || cap.totalPower > cap.powerLimit;
        h += '<div class="sm:col-span-2 p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px]">' +
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-3"><i class="pi pi-box text-lg text-sky-600 dark:text-sky-400"></i><div>' +
              '<div class="text-xs font-semibold text-slate-900 dark:text-slate-200">Kabin Kapasite Durumu</div>' +
              '<div class="text-[11px] text-slate-500 dark:text-slate-400">Ağırlık Limiti: ' + cap.weightLimit + ' kg | Güç Limiti: ' + cap.powerLimit + ' W</div>' +
            '</div></div>' +
            '<div class="flex items-center gap-3 text-xs' + (over ? ' text-rose-600 dark:text-rose-400' : '') + '">' +
              '<span class="font-bold text-slate-900 dark:text-slate-100">' + nf1(cap.totalWeight) + ' <span class="text-[10px] text-slate-500 dark:text-slate-400">kg</span></span>' +
              '<span class="font-bold text-slate-900 dark:text-slate-100">' + nf1(cap.totalPower) + ' <span class="text-[10px] text-slate-500 dark:text-slate-400">W</span></span>' +
              (over ? '<i class="pi pi-exclamation-triangle text-amber-500" title="Kabin kapasite limiti aşıldı!"></i>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }
    }
    h += fld(lbl('Güç (Watt)') + inp('power', d.power, !creat, !creat ? 'opacity-75' : '', 'number'));
    h += fld(lbl('Ağırlık (kg)') + inp('weight', d.weight, !creat, !creat ? 'opacity-75' : '', 'number'));
    h += fld(lbl('Güç Bağlantı Sayısı') + inp('powerConnections', d.powerConnections, !creat, !creat ? 'opacity-75' : '', 'number'), true);
    return '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">' + h + '</div>';
  }

  // --- görsel + port kutusu ---
  function hotspotHtml(p, side) {
    const editing = dm.isEditMode || dm.isCreatMode;
    const selected = editing && dm.selectedPort === p.id;
    const inv = +(1 / (dm.scale[side] || 1)).toFixed(4);
    return '<div class="port-hotspot' + (editing ? ' edit-mode' : '') + (selected ? ' selected' : '') + ' shape-' + esc(p.shape || 'circle') + '" data-port="' + esc(p.id) + '" style="left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;background-color:' + (p.connected ? '#f32121' : (p.color || '#4CAF50')) +
      ';border-radius:' + (p.shape === 'circle' ? '50%' : '2px') + ';transform:translate(-50%, -50%) scale(' + inv + ');position:absolute">' +
      '<span class="port-label">' + esc(p.name) + '</span>' +
      (selected ? '<div class="absolute -top-6 right-0 flex gap-1 z-30"><button type="button" data-act="port-del" data-port-id="' + esc(p.id) + '" class="p-1 bg-rose-600 text-white rounded-[2px] text-[10px] cursor-pointer"><i class="pi pi-trash"></i></button></div>' : '') +
    '</div>';
  }
  function imageBoxHtml(side) {
    const editing = dm.isEditMode || dm.isCreatMode;
    const img = dm.img[side];
    const title = side === 'front' ? 'Ön Görsel' : 'Arka Görsel';
    const analyzing = dm.analyzing[side];
    const pem = dm.portEditMode === side;
    const menuItem = (dir, icon, label) => '<button type="button" data-act="img-zoom" data-side="' + side + '" data-dir="' + dir + '" class="w-full px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center cursor-pointer"><i class="' + icon + ' text-xs mr-2"></i><span>' + label + '</span></button>';
    const btn = 'px-2.5 py-1 text-xs font-semibold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer';
    return '<div class="p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] flex flex-col gap-3">' +
      '<div class="flex items-center justify-between">' +
        '<label class="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><i class="pi pi-image text-sky-500 text-xs"></i><span>' + title + '</span></label>' +
        '<div class="relative">' +
          '<button type="button" data-act="img-menu" data-side="' + side + '" class="px-2 py-1 text-xs font-semibold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer" title="' + (side === 'front' ? 'Görünüm Ayarları' : 'Arka Görsel Görünüm Ayarları') + '"><i class="pi pi-search text-xs"></i><i class="pi pi-chevron-down text-[10px]"></i></button>' +
          (dm.menu === side ? '<div class="absolute right-0 top-full mt-1 z-40 w-44 bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-xl py-1 text-xs text-slate-700 dark:text-slate-200">' +
            menuItem('in', 'pi pi-search-plus', 'Yakınlaştır') + menuItem('out', 'pi pi-search-minus', 'Uzaklaştır') + menuItem('reset', 'pi pi-refresh', 'Görünümü Sıfırla') + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div data-img-vp="' + side + '" class="relative overflow-hidden border border-slate-200 dark:border-slate-800 rounded-[2px] bg-slate-100 dark:bg-slate-900 h-[260px] min-h-[260px] max-h-[260px] flex items-center justify-center p-3 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing">' +
        '<div data-img-wrap="' + side + '" class="relative inline-block origin-center' + (editing && pem ? ' cursor-crosshair' : '') + '" style="transform:translate(' + dm.pan[side].x + 'px, ' + dm.pan[side].y + 'px) scale(' + dm.scale[side] + ');transition:transform 0.15s ease-out">' +
          (analyzing ? '<div class="absolute inset-0 bg-sky-950/60 z-20 flex flex-col items-center justify-center border border-sky-400/50 rounded-[2px] overflow-hidden">' +
            '<div class="absolute inset-0 bg-gradient-to-b from-sky-500/20 via-sky-400/40 to-sky-500/20 animate-pulse"></div>' +
            '<div class="relative z-10 flex flex-col items-center gap-2 text-sky-300 font-bold text-xs"><i class="pi pi-spin pi-spinner text-2xl"></i><span>YZ Portları Analiz Ediyor...</span></div></div>' : '') +
          (img ? '<img src="' + esc(img) + '" alt="' + title + '" draggable="false" class="block max-w-full max-h-[220px] w-auto h-auto rounded-[2px] select-none pointer-events-none" />'
            : '<div class="text-slate-400 dark:text-slate-600 text-xs flex flex-col items-center gap-1 py-8"><i class="pi pi-image text-3xl"></i><span>Görsel Yüklenmemiş</span></div>') +
          (img ? dm.ports.filter(p => p.side === side).map(p => hotspotHtml(p, side)).join('') : '') +
        '</div>' +
      '</div>' +
      (editing ? '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" data-act="img-upload" data-side="' + side + '" class="' + btn + '"><i class="pi pi-upload text-xs"></i><span>' + (img ? 'Görseli Değiştir' : 'Görsel Ekle') + '</span></button>' +
        '<button type="button" data-act="img-remove" data-side="' + side + '"' + (!img ? ' disabled' : '') + ' class="px-2.5 py-1 text-xs font-semibold rounded-[2px] border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><i class="pi pi-trash text-xs"></i><span>Görseli Kaldır</span></button>' +
        '<div class="flex items-center gap-2 px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2px] text-xs">' +
          '<span class="font-bold text-slate-500 dark:text-slate-400 text-[11px]">Sıralama:</span>' +
          ['linear', 'zigzag'].map(v => '<label class="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer"><input type="radio" name="naming-' + side + '" value="' + v + '" data-naming="' + side + '"' + (dm.naming[side] === v ? ' checked' : '') + ' class="accent-sky-600" /><span>' + (v === 'linear' ? 'Linear' : 'Zigzag') + '</span></label>').join('') +
        '</div>' +
        '<button type="button" data-act="img-ai" data-side="' + side + '"' + (!img || analyzing ? ' disabled' : '') + ' class="px-2.5 py-1 text-xs font-bold rounded-[2px] bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"><i class="pi pi-sparkles text-xs' + (analyzing ? ' animate-spin' : '') + '"></i><span>' + (analyzing ? 'Analiz Ediliyor...' : 'YZ ile Analiz Et') + '</span></button>' +
        '<button type="button" data-act="port-mode" data-side="' + side + '"' + (!img ? ' disabled' : '') + ' class="px-2.5 py-1 text-xs font-bold rounded-[2px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed' + (pem ? ' bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600' : '') + '"><i class="pi ' + (pem ? 'pi-check' : 'pi-plus') + '"></i><span>' + (pem ? 'Port Eklemeyi Durdur' : 'Port Ekle') + '</span></button>' +
        '<input type="file" data-file="' + side + '" accept="image/*" class="hidden" />' +
      '</div>' : '') +
      (editing && pem ? '<div class="p-2 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold rounded-[2px] flex items-center gap-2 animate-pulse"><i class="pi pi-info-circle text-xs"></i><span>Yeni port eklemek için görsel üzerine tıklayınız.</span></div>' : '') +
    '</div>';
  }

  function dmActionsHtml() {
    const creat = dm.isCreatMode;
    const edit = dm.isEditMode;
    let h = '<div class="flex items-center gap-2">' +
      '<button type="button" data-act="dm-back" class="px-3 py-1.5 bg-slate-100 dark:bg-surface-panel hover:bg-slate-200 dark:hover:bg-surface-hover border border-slate-200 dark:border-border-subtle text-slate-700 dark:text-slate-300 text-xs font-medium rounded-[2px] transition-colors flex items-center gap-1 cursor-pointer"><i class="pi pi-chevron-left text-xs"></i><span>Geri Dön</span></button>';
    if (!creat) h += '<button type="button" data-act="dm-pdf" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-[2px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"><i class="pi pi-file-pdf text-xs text-rose-400"></i><span>PDF Rapor</span></button>';
    if (!edit && !creat) h += '<button type="button" data-act="dm-edit" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium rounded-[2px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"><i class="pi pi-pencil text-xs"></i><span>Düzenle</span></button>';
    if (edit || creat) {
      h += '<button type="button" data-act="dm-cancel" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-[2px] transition-colors cursor-pointer"><span>İptal</span></button>' +
        '<button type="button" data-act="dm-save"' + (dm.isSaving ? ' disabled' : '') + ' class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-[2px] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs">' +
          (dm.isSaving ? '<i class="pi pi-spin pi-spinner text-xs"></i>' : '<i class="pi pi-check text-xs"></i>') + '<span>' + (dm.isSaving ? 'Kaydediliyor...' : 'Kaydet') + '</span></button>';
    }
    return h + '</div>';
  }

  function renderDm() {
    if (!dm) return;
    const keepScroll = dmHost.querySelector('[data-dm-body]');
    const scrollTop = keepScroll ? keepScroll.scrollTop : 0;
    const d = dm.d;
    const creat = dm.isCreatMode;
    const title = creat ? 'Cihaz Ekleme Ekranı' : 'Cihaz Detayları';
    document.body.classList.add('overflow-hidden');
    dmHost.innerHTML =
      '<div data-dm-overlay class="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 z-50 animate-fade-in select-none">' +
        '<div data-dm-panel class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">' +
          '<div class="px-3 sm:px-5 py-2.5 sm:py-3.5 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel shrink-0">' +
            '<div class="flex items-center gap-2.5 sm:gap-3">' +
              '<div class="w-8 h-8 rounded-[2px] bg-sky-600 text-white font-extrabold flex items-center justify-center text-xs shadow-xs shrink-0"><i class="pi pi-server text-sm"></i></div>' +
              '<div>' +
                '<h2 class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5 sm:gap-2"><span>' + title + '</span>' +
                  (dm.slotU ? '<span class="px-2 py-0.5 text-[10px] rounded-[2px] font-bold bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">Slot U' + dm.slotU + '</span>' : '') +
                '</h2>' +
                '<p class="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">' + esc((d.cabinetName || 'Kabin') + ' — ' + (d.deviceClass || 'Sunucu / Cihaz')) + '</p>' +
              '</div>' +
            '</div>' +
            '<button type="button" data-act="dm-close" class="w-8 h-8 rounded-[2px] flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"><i class="pi pi-times text-sm"></i></button>' +
          '</div>' +
          '<div data-dm-body class="p-3 sm:p-5 overflow-y-auto space-y-4 sm:space-y-6 flex-1 select-text">' +
            kit.pageHeader({ title, breadcrumbs: [{ label: 'Varlık Takip Bilgileri' }, { label: 'Cihaz Detayları' }], actions: dmActionsHtml() }) +
            '<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">' +
              kit.card({ title: 'Varlık Takip Bilgileri', icon: 'pi pi-info-circle', body: dmSection1() }) +
              kit.card({ title: 'Fiziksel Altyapı Bilgileri', icon: 'pi pi-server', body: dmSection2() }) +
            '</div>' +
            '<div class="mt-6 pt-6 border-t border-slate-200 dark:border-border-subtle space-y-4">' +
              '<div class="text-xs font-bold text-slate-900 dark:text-slate-200 tracking-wide uppercase flex items-center justify-between"><span class="flex items-center gap-1.5"><i class="pi pi-image text-sky-600 dark:text-sky-400"></i><span>Cihaz Görselleri ve Port Yönetimi</span></span></div>' +
              '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">' + imageBoxHtml('front') + (!isPatchPanel() ? imageBoxHtml('back') : '') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    const body = dmHost.querySelector('[data-dm-body]');
    if (body) body.scrollTop = scrollTop;
  }

  // --- pencere olayları ---
  dmHost.addEventListener('click', e => {
    if (!dm) return;
    if (e.target.matches('[data-dm-overlay]')) { closeDm(); return; }
    const cls = e.target.closest('[data-cls]');
    if (cls) { selectDeviceClass(cls.getAttribute('data-cls')); return; }
    const portEl = e.target.closest('[data-port]');
    const actEl = e.target.closest('[data-act]');
    if (actEl && actEl.getAttribute('data-act') === 'port-del') { e.stopPropagation(); deletePort(actEl.getAttribute('data-port-id')); return; }
    if (portEl) { e.stopPropagation(); onPortClick(portEl.getAttribute('data-port')); return; }
    if (actEl) { onDmAction(actEl.getAttribute('data-act'), actEl); return; }
    if (dm.menu && !e.target.closest('[data-act="img-menu"]')) { dm.menu = null; renderDm(); return; }
    const wrap = e.target.closest('[data-img-wrap]');
    if (wrap) onImageClick(e, wrap);
  });

  function onDmAction(act, el) {
    const side = el.getAttribute('data-side');
    switch (act) {
      case 'dm-close':
      case 'dm-back':
        closeDm();
        break;
      case 'dm-cancel':
        if (dm.isEditMode && !dm.isCreatMode) toast('Değişiklikler iptal edildi.', 'info', dm.d.deviceClass);
        closeDm();
        break;
      case 'dm-edit':
        dm.isEditMode = true;
        dm.snapshot = JSON.stringify(dm.d);
        if (!dm.classSearch) dm.classSearch = ((dm.d.manufacturer || '') + ' - ' + (dm.d.model || '')).trim();
        renderDm();
        break;
      case 'dm-save':
        saveChanges();
        break;
      case 'dm-pdf':
        downloadPdf();
        break;
      case 'dm-pos':
        openPositionPicker();
        break;
      case 'cls-add':
        toast('Model Kütüphanesi ekranı sunum sürümünde yer almıyor; mevcut katalogdan seçim yapınız.', 'info', 'Cihaz Sınıfı');
        break;
      case 'img-menu':
        dm.menu = dm.menu === side ? null : side;
        renderDm();
        break;
      case 'img-zoom': {
        const dir = el.getAttribute('data-dir');
        if (dir === 'in') dm.scale[side] = Math.min(5, +(dm.scale[side] + 0.25).toFixed(2));
        else if (dir === 'out') dm.scale[side] = Math.max(0.5, +(dm.scale[side] - 0.25).toFixed(2));
        else { dm.scale[side] = 1; dm.pan[side] = { x: 0, y: 0 }; }
        dm.menu = null;
        renderDm();
        break;
      }
      case 'img-upload': {
        const f = dmHost.querySelector('[data-file="' + side + '"]');
        if (f) f.click();
        break;
      }
      case 'img-remove':
        dm.img[side] = null;
        dm.imgFromCat[side] = false;
        renderDm();
        break;
      case 'img-ai':
        analyzeImageWithAI(side);
        break;
      case 'port-mode':
        dm.portEditMode = dm.portEditMode === side ? null : side;
        renderDm();
        break;
      default:
        break;
    }
  }

  dmHost.addEventListener('input', e => {
    if (!dm) return;
    const t = e.target;
    if (t.matches('[data-cls-search]')) {
      dm.classSearch = t.value;
      dm.showClassDropdown = true;
      const list = dmHost.querySelector('[data-cls-list]');
      if (list) list.innerHTML = classListHtml();
      return;
    }
    const f = t.getAttribute('data-f');
    if (!f || t.tagName === 'SELECT') return;
    dm.d[f] = t.type === 'number' ? (t.value === '' ? 0 : Number(t.value)) : t.value;
  });
  dmHost.addEventListener('change', e => {
    if (!dm) return;
    const t = e.target;
    if (t.matches('[data-naming]')) { dm.naming[t.getAttribute('data-naming')] = t.value; return; }
    if (t.matches('[data-file]')) { onImageSelected(t); return; }
    const f = t.getAttribute('data-f');
    if (!f || t.tagName !== 'SELECT') return;
    if (f === 'assignment') { onAssignmentChange(t.value); return; }
    dm.d[f] = t.value;
    if (f === 'locationId') {
      const loc = M.locations.find(l => l.location_id === t.value);
      const cabs = loc ? D.cabinets.filter(x => x.pod === loc.pod) : [];
      if (!cabs.some(x => x.code === dm.d.cabinetName)) { dm.d.cabinetName = ''; dm.d.position = 0; }
      renderDm();
    } else if (f === 'cabinetName') {
      dm.d.position = 0;
      toast(t.value + ' kabini seçildi; lütfen pozisyon seçiniz.', 'info', 'Kabin');
      renderDm();
    }
  });
  dmHost.addEventListener('focusin', e => {
    if (dm && e.target.matches('[data-cls-search]')) {
      dm.showClassDropdown = true;
      const list = dmHost.querySelector('[data-cls-list]');
      if (list) list.innerHTML = classListHtml();
    }
  });
  dmHost.addEventListener('focusout', e => {
    if (dm && e.target.matches('[data-cls-search]')) {
      setTimeout(() => {
        if (!dm) return;
        dm.showClassDropdown = false;
        const list = dmHost.querySelector('[data-cls-list]');
        if (list) list.innerHTML = '';
      }, 200);
    }
  });
  // Liste öğesi blur'dan önce seçilsin (mousedown)
  dmHost.addEventListener('mousedown', e => {
    const cls = e.target.closest('[data-cls]');
    if (cls) { e.preventDefault(); selectDeviceClass(cls.getAttribute('data-cls')); return; }
    if (!dm || e.button !== 0) return;
    const vp = e.target.closest('[data-img-vp]');
    if (!vp || e.target.closest('.port-hotspot') || e.target.closest('button') || e.target.closest('input')) return;
    const side = vp.getAttribute('data-img-vp');
    dm.panning = { side, startX: e.clientX, startY: e.clientY, initX: dm.pan[side].x, initY: dm.pan[side].y };
    dm.hasDragged = false;
    const wrap = vp.querySelector('[data-img-wrap]');
    if (wrap) wrap.style.transition = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dm || !dm.panning) return;
    const p = dm.panning;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dm.hasDragged = true;
    dm.pan[p.side] = { x: p.initX + dx, y: p.initY + dy };
    const wrap = dmHost.querySelector('[data-img-wrap="' + p.side + '"]');
    if (wrap) wrap.style.transform = 'translate(' + dm.pan[p.side].x + 'px, ' + dm.pan[p.side].y + 'px) scale(' + dm.scale[p.side] + ')';
  });
  document.addEventListener('mouseup', () => {
    if (!dm || !dm.panning) return;
    const side = dm.panning.side;
    dm.panning = null;
    const wrap = dmHost.querySelector('[data-img-wrap="' + side + '"]');
    if (wrap) wrap.style.transition = 'transform 0.15s ease-out';
    setTimeout(() => { if (dm) dm.hasDragged = false; }, 60);
  });
  dmHost.addEventListener('wheel', e => {
    if (!dm) return;
    const vp = e.target.closest('[data-img-vp]');
    if (!vp) return;
    e.preventDefault();
    const side = vp.getAttribute('data-img-vp');
    dm.scale[side] = e.deltaY < 0 ? Math.min(5, +(dm.scale[side] + 0.25).toFixed(2)) : Math.max(0.5, +(dm.scale[side] - 0.25).toFixed(2));
    const wrap = vp.querySelector('[data-img-wrap]');
    if (wrap) {
      wrap.style.transform = 'translate(' + dm.pan[side].x + 'px, ' + dm.pan[side].y + 'px) scale(' + dm.scale[side] + ')';
      const inv = +(1 / dm.scale[side]).toFixed(4);
      wrap.querySelectorAll('.port-hotspot').forEach(h => { h.style.transform = 'translate(-50%, -50%) scale(' + inv + ')'; });
    }
  }, { passive: false });

  // Port tooltip (showPortTooltip → buildNormalDeviceTooltip / patch panel)
  function portTooltipText(p) {
    const d = dm.d;
    const typeMap = { ethernet: 'Ethernet', usb: 'USB', hdmi: 'HDMI', vga: 'VGA', power: 'Güç', audio: 'Ses', serial: 'Seri Port', other: 'Diğer' };
    const type = p.type || 'ethernet';
    let t = 'Port: ' + (p.name || 'Tanımsız') + '\nTip: ' + (typeMap[type.toLowerCase()] || type.toUpperCase());
    t += '\n\nKAYNAK:\nAsset ID: ' + (d.deviceId || '-') + (d.deviceType ? '\nCihaz Tipi: ' + d.deviceType : '') +
      '\nKabin: ' + (p.sourceCabinet || d.cabinetName || '-') + '\nU Konumu: ' + (p.sourceUPosition || d.position || '-') + '\nPort: ' + (p.name || '-');
    t += '\n\nHEDEF:';
    if (p.connected || p.target_asset_id || p.targetPortInfo || p.targetCabinet) {
      const tgt = p.target_asset_id ? M.findAsset(p.target_asset_id) : null;
      t += '\nAsset ID: ' + (tgt ? M.details(tgt, M.cabinetOfAsset(tgt.id)).deviceId : '-') + (p.target_device_type ? '\nCihaz Tipi: ' + p.target_device_type : '') +
        '\nKabin: ' + (p.targetCabinet || '-') + '\nU Konumu: ' + (p.targetUPosition || '-') + '\nPort: ' + (p.targetPortInfo || '-') +
        (p.link_type ? '\nLink Tipi: ' + p.link_type : '');
    } else t += '\nBağlantı yok';
    return t + (p.connected || p.target_asset_id ? '\n\nDurum: Bağlı' : '\n\nDurum: Boş');
  }
  function showTip(text, x, y) {
    tipEl.innerHTML = '<pre class="m-0 font-mono text-xs whitespace-pre-wrap">' + esc(text) + '</pre>';
    tipEl.classList.remove('hidden');
    const w = tipEl.offsetWidth;
    const h = tipEl.offsetHeight;
    tipEl.style.left = Math.min(x + 15, window.innerWidth - w - 8) + 'px';
    tipEl.style.top = Math.min(y + 15, window.innerHeight - h - 8) + 'px';
  }
  function hideTip() { tipEl.classList.add('hidden'); }
  dmHost.addEventListener('mouseover', e => {
    if (!dm || dm.isEditMode) return;
    const h = e.target.closest('[data-port]');
    if (!h) return;
    const p = dm.ports.find(x => x.id === h.getAttribute('data-port'));
    if (p) showTip(portTooltipText(p), e.clientX, e.clientY);
  });
  dmHost.addEventListener('mouseout', e => {
    if (e.target.closest('[data-port]')) hideTip();
  });
  // Port ekleme modunda koordinat göstergesi (debugCoordinates)
  dmHost.addEventListener('mousemove', e => {
    if (!dm) return;
    const wrap = e.target.closest('[data-img-wrap]');
    const side = wrap ? wrap.getAttribute('data-img-wrap') : null;
    if (!wrap || !(dm.isEditMode || dm.isCreatMode) || dm.portEditMode !== side) { debugEl.classList.add('hidden'); return; }
    const img = wrap.querySelector('img');
    if (!img) return;
    const r = img.getBoundingClientRect();
    const x = +((e.clientX - r.left) / r.width).toFixed(4);
    const y = +((e.clientY - r.top) / r.height).toFixed(4);
    if (x < 0 || x > 1 || y < 0 || y > 1) { debugEl.classList.add('hidden'); return; }
    debugEl.textContent = 'Paint: (' + x + ', ' + y + ')';
    debugEl.style.left = (e.clientX + 15) + 'px';
    debugEl.style.top = (e.clientY - 10) + 'px';
    debugEl.classList.remove('hidden');
  });

  function onImageClick(e, wrap) {
    if (dm.hasDragged) return;
    const side = wrap.getAttribute('data-img-wrap');
    if ((!dm.isEditMode && !dm.isCreatMode) || dm.portEditMode !== side) {
      if (dm.selectedPort) { dm.selectedPort = null; renderDm(); }
      return;
    }
    const r = wrap.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    openPortModal(null, +x.toFixed(4), +y.toFixed(4), side);
  }

  function onPortClick(portId) {
    const p = dm.ports.find(x => x.id === portId);
    if (!p) return;
    if (dm.isEditMode || dm.isCreatMode) {
      dm.selectedPort = dm.selectedPort === p.id ? null : p.id;
      renderDm();
    } else {
      hideTip();
      openPortDetail(p);
    }
  }

  function deletePort(portId) {
    const p = dm.ports.find(x => x.id === portId);
    if (!p) return;
    dialog({
      title: 'Port Sil',
      variant: 'danger',
      confirmLabel: 'Sil',
      body: '"' + esc(p.name) + '" portunu silmek istediğinizden emin misiniz?',
      onConfirm: () => {
        dm.ports.splice(dm.ports.indexOf(p), 1);
        if (p.target_asset_id) {
          const tgt = M.findAsset(p.target_asset_id);
          if (tgt) {
            const tp = portsOf(tgt, M.cabinetOfAsset(tgt.id)).find(x => x.name === p.targetPortInfo);
            if (tp) Object.assign(tp, { connected: false, target_asset_id: '', targetCabinet: '', targetUPosition: '', targetPortInfo: '', link_type: '' });
          }
        }
        dm.selectedPort = null;
        renderDm();
        toast(p.name + ' portu silindi.', 'success', 'Port Yönetimi');
      }
    });
  }

  function onImageSelected(input) {
    const side = input.getAttribute('data-file');
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("Dosya boyutu 5MB'dan büyük olamaz.", 'warning'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (!dm) return;
      dm.img[side] = reader.result;
      dm.imgFromCat[side] = false;
      dm.scale[side] = 1;
      dm.pan[side] = { x: 0, y: 0 };
      renderDm();
    };
    reader.readAsDataURL(file);
  }

  // YZ port tespiti (analyzeImageWithAI) — katalog görselinde şablon portları, yüklenen görselde ızgara taraması
  function analyzeImageWithAI(side) {
    if (!dm.img[side]) { toast('Lütfen önce bir görsel yükleyin.', 'warning'); return; }
    dm.analyzing[side] = true;
    renderDm();
    setTimeout(() => {
      if (!dm) return;
      const like = { assetType: dm.d.deviceType || 'Sunucu', manufacturer: dm.d.manufacturer, model: dm.d.model, uSize: dm.d.uCapacity };
      const f = dm.imgFromCat[side] || dm.asset ? M.face(like, side) : null;
      let found = f ? f.ports.map(p => ({ x: p.x, y: p.y, type: p.type })) : [];
      if (!f) for (let i = 0; i < 8; i++) found.push({ x: +(0.3 + i * 0.05).toFixed(4), y: 0.5, type: 'ethernet' });
      found = found.filter(fp => !dm.ports.some(p => p.side === side && Math.abs(p.x - fp.x) < 0.02 && Math.abs(p.y - fp.y) < 0.04));
      const stamp = Date.now();
      found.forEach((fp, i) => dm.ports.push({
        id: 'ai_port_' + stamp + '_' + i, name: 'YZ-Port-' + (dm.ports.length + 1), side, x: fp.x, y: fp.y, shape: 'circle', color: '#2196F3', type: fp.type,
        connected: false, is_included_in_sequence: true, isAutoNumbered: true, sourceCabinet: dm.d.cabinetName, sourceUPosition: String(dm.d.position || '')
      }));
      sortAndNamePorts(side, dm.naming[side]);
      dm.analyzing[side] = false;
      renderDm();
      if (found.length) toast(found.length + ' adet port başarıyla tespit edildi.', 'success');
      else toast('Bu görselde port tespit edilemedi.', 'info');
    }, 1800);
  }

  function sortAndNamePorts(side, logic) {
    const sidePorts = dm.ports.filter(p => p.side === side && p.is_included_in_sequence !== false && p.isAutoNumbered !== false);
    if (!sidePorts.length) return;
    let n = 1;
    const name = p => { p.name = 'Port-' + (n++); };
    if (String(logic).toLowerCase() === 'zigzag') {
      const yAvg = sidePorts.reduce((s, p) => s + p.y, 0) / sidePorts.length;
      const top = sidePorts.filter(p => p.y < yAvg).sort((a, b) => a.x - b.x);
      const bot = sidePorts.filter(p => p.y >= yAvg).sort((a, b) => a.x - b.x);
      let i = 0;
      let j = 0;
      while (i < top.length || j < bot.length) {
        if (i < top.length && j < bot.length) {
          if (Math.abs(top[i].x - bot[j].x) <= 0.05) { name(top[i++]); name(bot[j++]); }
          else if (top[i].x < bot[j].x) name(top[i++]);
          else name(bot[j++]);
        } else if (i < top.length) name(top[i++]);
        else name(bot[j++]);
      }
    } else {
      const rows = [];
      sidePorts.forEach(p => {
        const row = rows.find(r => Math.abs(p.y - r.reduce((s, x) => s + x.y, 0) / r.length) <= 0.1);
        if (row) row.push(p); else rows.push([p]);
      });
      rows.sort((a, b) => a.reduce((s, x) => s + x.y, 0) / a.length - b.reduce((s, x) => s + x.y, 0) / b.length);
      rows.forEach(r => r.sort((a, b) => a.x - b.x).forEach(name));
    }
  }

  function selectDeviceClass(modelId) {
    const c = M.catalog.find(x => x.model_id === modelId);
    if (!c || !dm) return;
    const d = dm.d;
    d.model = c.name;
    d.manufacturer = c.brand;
    d.deviceType = c.nature;
    d.model_id = c.model_id;
    d.deviceClass = (c.nature + ' ' + c.name).trim();
    d.uCapacity = c.jsn.ucapacity || 1;
    d.power = c.jsn.power || 0;
    d.weight = c.jsn.weight || 0;
    d.powerConnections = c.jsn.power_connection_numbers || 0;
    dm.classSearch = c.brand + ' - ' + c.name;
    dm.showClassDropdown = false;
    // CAT görselleri (sunumda katalogdan yüklenir; port şablonu YZ analizi ile eklenir)
    const like = { assetType: c.nature, manufacturer: c.brand, model: c.name, uSize: d.uCapacity };
    ['front', 'back'].forEach(s => {
      const f = M.face(like, s);
      dm.img[s] = f ? f.img : null;
      dm.imgFromCat[s] = !!f;
    });
    dm.ports = dm.ports.filter(p => !p.isAutoNumbered);
    renderDm();
  }

  // onAssignmentChange — durum geçişleri ve bilgilendirme
  function onAssignmentChange(v) {
    const d = dm.d;
    const n = parseInt(v, 10);
    const clearCab = () => { d.cabinetName = ''; d.position = 0; };
    d.assignment = String(v);
    if (n === 0) {
      d.stock = '';
      if (!d.locationId) { const l = M.locationOf(state.cab); d.locationId = l ? l.location_id : ''; }
    } else if (n === 1) { clearCab(); toast('Cihaz stokta olduğunda kabin ve pozisyon bilgisi temizlendi', 'info', 'Stokta Durumu'); }
    else if (n === 2) { dm.scrapNew = true; clearCab(); toast('Cihaz hurdaya ayrıldığında kabin ve pozisyon bilgisi temizlendi', 'info', 'Hurdaya Ayrıldı Durumu'); }
    else if (n === 3) { clearCab(); toast('Cihaz Teslim Bekleniyor olduğunda kabin ve pozisyon bilgisi temizlendi', 'info', 'Teslim Bekleniyor Durumu'); }
    else if (n === 4) { clearCab(); toast('Cihaz bakımda olduğunda kabin ve pozisyon bilgisi temizlendi', 'info', 'Bakımda Durumu'); }
    else if (n === 5) { clearCab(); toast('Cihaz tedarikçiye iade edildiğinde kabin ve pozisyon bilgisi temizlendi', 'info', 'Tedarikçiye İade Durumu'); }
    else if (n === 6) { dm.lostNew = true; clearCab(); d.stock = ''; d.locationId = ''; toast('Cihaz kayıp olduğunda tüm konum bilgisi temizlendi', 'info', 'Kayıp Durumu'); }
    else if (n === 7) {
      if (Number(d.owning_directorate) === 1 && !dm.isCreatMode) toast('İç müşteride kullanılamaz', 'error');
      else { clearCab(); d.locationId = ''; toast('Cihaz demonte olduğunda kabin ve pozisyon bilgisi temizlendi', 'info', 'Demonte Durumu'); }
    }
    renderDm();
  }

  // Kabin U doluluk haritası (suggestUPositions)
  function uMapFor(cab, excludeId) {
    const map = Array(TOTAL_U + 1).fill(null);
    cab.assets.forEach(a => {
      if (a.id === excludeId || !a.startU) return;
      for (let i = 0; i < a.uSize; i++) if (a.startU + i <= TOTAL_U) map[a.startU + i] = a;
    });
    return map;
  }
  const fits = (map, start, cap) => { if (start < 1 || start + cap - 1 > TOTAL_U) return false; for (let i = 0; i < cap; i++) if (map[start + i]) return false; return true; };
  function suggestPosition(map, cap) { for (let u = 1; u <= TOTAL_U; u++) if (fits(map, u, cap)) return u; return -1; }

  // Pozisyon seçici (AssetCabinetUplaceComponent karşılığı)
  function openPositionPicker() {
    const d = dm.d;
    const cab = D.findCabinet(d.cabinetName);
    if (!cab) { toast('Önce bir kabin seçmelisiniz!', 'warning'); return; }
    const cap = Math.max(1, Number(d.uCapacity) || 1);
    const map = uMapFor(cab, dm.asset ? dm.asset.id : null);
    const suggested = suggestPosition(map, cap);
    const curOk = d.position ? fits(map, Number(d.position), cap) : null;
    let chosen = d.position && curOk ? Number(d.position) : (suggested > 0 ? suggested : 0);
    const rowsHtml = () => {
      let h = '';
      for (let u = TOTAL_U; u >= 1; u--) {
        const a = map[u];
        const inSel = chosen && u >= chosen && u < chosen + cap;
        const cls = a ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 cursor-not-allowed'
          : inSel ? 'bg-sky-600 text-white border-sky-500'
            : 'bg-white dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 border-dashed border-slate-300 dark:border-slate-700 hover:bg-sky-500/15 hover:text-sky-600 dark:hover:text-sky-300 cursor-pointer';
        h += '<div data-pick-u="' + u + '" class="flex items-center justify-between px-2 h-[15px] border rounded-[1px] text-[9px] font-mono leading-none ' + cls + '">' +
          '<span class="font-bold">U' + u + '</span><span class="truncate max-w-[220px] font-sans font-semibold">' + (a ? esc(a.displayName) : inSel ? 'Seçili Konum' : '') + '</span></div>';
      }
      return h;
    };
    const summary = () =>
      '<div class="flex items-center justify-between gap-2 p-2 mb-2 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px] text-[11px]">' +
        '<div><span class="text-slate-500 dark:text-slate-400">Cihaz Kapasitesi:</span> <b class="text-slate-900 dark:text-slate-100">' + cap + 'U</b></div>' +
        '<div><span class="text-slate-500 dark:text-slate-400">Mevcut Pozisyon:</span> ' + (d.position ? (curOk === false ? '<b class="text-rose-500 blinking-text">' + d.position + 'U (Dolu)</b>' : '<b class="text-slate-900 dark:text-slate-100">' + d.position + 'U</b>') : '<b>-</b>') + '</div>' +
        '<div><span class="text-slate-500 dark:text-slate-400">Önerilen Pozisyon:</span> ' + (suggested > 0 ? '<b class="text-emerald-600 dark:text-emerald-400">' + suggested + 'U</b>' : '<b class="text-rose-500 blinking-text">Sığmaz</b>') + '</div>' +
      '</div>';
    const dlg = dialog({
      title: cab.code,
      subtitle: 'Kabin üzerinden pozisyon seç',
      variant: 'info',
      confirmLabel: 'Kaydet',
      maxWidth: 'max-w-md',
      body: summary() + '<div data-pick-rack class="flex flex-col gap-[2px] p-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-[2px]">' + rowsHtml() + '</div>',
      onConfirm: () => {
        if (!chosen) { toast('Lütfen bir pozisyon seçiniz.', 'warning'); return false; }
        d.position = chosen;
        renderDm();
        return true;
      }
    });
    dlg.body.addEventListener('click', e => {
      const r = e.target.closest('[data-pick-u]');
      if (!r) return;
      const u = parseInt(r.getAttribute('data-pick-u'), 10);
      if (map[u]) return;
      // Tıklanan U, cihazın alt U'su kabul edilir; sığmıyorsa üstten hizalamayı dene
      const start = fits(map, u, cap) ? u : fits(map, u - cap + 1, cap) ? u - cap + 1 : 0;
      if (!start) { toast('Seçilen konuma ' + cap + 'U cihaz sığmıyor.', 'warning'); return; }
      chosen = start;
      dlg.body.querySelector('[data-pick-rack]').innerHTML = rowsHtml();
    });
  }

  // saveChanges — bellek içi kayıt (ASM insert / update karşılığı)
  function saveChanges() {
    const d = dm.d;
    const creat = dm.isCreatMode;
    if (creat) {
      if (!String(d.serialNumber || '').trim()) { toast('Seri Numarası alanı zorunludur.', 'warning'); return; }
      if (d.assignment === null || d.assignment === undefined || String(d.assignment).trim() === '') { toast('Assignment alanı zorunludur.', 'warning'); return; }
    }
    const a = parseInt(d.assignment, 10);
    if (a === 0 && !d.cabinetName) { toast('Cihaz "Kullanımda" durumundayken Kabin seçimi zorunludur.', 'error'); return; }
    if (a === 0 && !Number(d.position)) { toast('Cihaz "Kullanımda" durumundayken Pozisyon seçimi zorunludur.', 'error'); return; }
    if (a === 1 && !d.stock) { toast('Stok lokasyonu seçmelisiniz!', 'warning', 'Eksik Bilgi'); return; }
    const targetCab = a === 0 ? D.findCabinet(d.cabinetName) : null;
    const cap = Math.max(1, Number(d.uCapacity) || 1);
    if (targetCab && !fits(uMapFor(targetCab, dm.asset ? dm.asset.id : null), Number(d.position), cap)) {
      toast('U' + d.position + ' pozisyonunda ' + cap + 'U için yeterli boş alan yok. Lütfen pozisyon seçiniz.', 'error', 'Pozisyon Hatası');
      return;
    }
    dm.isSaving = true;
    renderDm();
    setTimeout(() => {
      if (!dm) return;
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      d.lastUpdateDate = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
      d.whoUpdate = (DCIM.session.user().usr || 'operator');
      let asset = dm.asset;
      if (creat) {
        newSeq++;
        const code = targetCab ? targetCab.code : state.code;
        const type = d.deviceType || 'Sunucu';
        asset = {
          id: code + '-N' + newSeq, startU: 0, uSize: cap, manufacturer: d.manufacturer || '', model: d.model || 'Yeni Cihaz',
          displayName: ((d.manufacturer || '') + ' ' + (d.model || 'Yeni Cihaz')).trim(),
          hostname: d.hostname || ((type === 'Sunucu' ? 'srv' : type === 'Depolama' ? 'stg' : 'net') + '-' + code.toLowerCase() + '-n' + newSeq),
          assetType: type, customerType: d.owner ? 'external' : 'internal', customer: d.owner || 'Türk Telekom (Dahili)',
          primaryIP: d.primaryIP || '', serial: d.serialNumber, weight: Number(d.weight) || 0, powerKw: (Number(d.power) || 0) / 1000, status: 'normal'
        };
        d.deviceId = 'ASM' + (0xA0000 + newSeq).toString(16).toUpperCase().padStart(16, '0');
        d.owning_directorate = d.owner ? 0 : 1;
        d.frontAssetId = d.owner ? 'MST-' + code + '-N' + newSeq : '';
      }
      // Kabin / pozisyon taşıma
      const oldCab = M.cabinetOfAsset(asset.id);
      if (oldCab && oldCab.assets.indexOf(asset) >= 0 && (!targetCab || targetCab !== oldCab)) oldCab.assets.splice(oldCab.assets.indexOf(asset), 1);
      asset.startU = targetCab ? Number(d.position) : 0;
      if (targetCab) {
        if (targetCab.assets.indexOf(asset) < 0) targetCab.assets.push(asset);
        M.registerAsset(asset, targetCab);
      }
      edits[asset.id] = Object.assign({}, d, { imgFront: dm.img.front, imgBack: dm.img.back });
      portStore[asset.id] = dm.ports;
      dm.ports.forEach(p => { p.sourceCabinet = d.cabinetName; p.sourceUPosition = targetCab ? M.uRange(asset) : ''; });
      reloadRack();
      toast('Değişiklikler kaydedildi.', 'success', 'Başarılı');
      if (creat) { closeDm(); return; }
      dm.isSaving = false;
      dm.isEditMode = false;
      dm.portEditMode = null;
      dm.selectedPort = null;
      renderDm();
    }, 700);
  }

  // downloadPDF — Varlık Detay Raporu (yazdırılabilir pencere)
  function downloadPdf() {
    const d = dm.d;
    const rows = [
      ['Asset ID', Number(d.owning_directorate) === 0 ? d.frontAssetId : d.deviceId], ['Cihaz Sınıfı', d.deviceClass], ['Cihaz Tipi', d.deviceType],
      ['Seri Numarası', d.serialNumber], ['Barkod / RFID', d.assetTag], ['Hostname', d.hostname], ['IP Adresi', d.primaryIP],
      [Number(d.owning_directorate) === 0 ? 'Owner' : 'SuperVISOR', Number(d.owning_directorate) === 0 ? d.owner : d.supervisor], ['Supervisor Müdürlüğü', d.label],
      ['Kabin', d.cabinetName], ['Kabin İçi Pozisyon (U)', d.position], ['U Kapasitesi', d.uCapacity], ['Güç (Watt)', d.power], ['Ağırlık (kg)', d.weight],
      ['Atama Durumu', ASSIGNMENT_MAP[d.assignment]], ['Garanti Bitiş Tarihi', d.warranty_end_date], ['Bakım Bitiş Tarihi', d.service_end_date], ['Notlar', d.notes]
    ];
    const portRows = dm.ports.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + (p.side === 'front' ? 'Ön' : 'Arka') + '</td><td>' + esc(p.targetCabinet || '-') + '</td><td>' + esc(p.targetUPosition || '-') + '</td><td>' + esc(p.targetPortInfo || '-') + '</td><td>' + esc(p.link_type || '-') + '</td></tr>').join('');
    const html = '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Varlık Detay Raporu — ' + esc(d.hostname || d.deviceClass) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;font-size:11px;color:#0f172a;margin:24px}h1{font-size:16px;text-align:center;margin:0 0 4px}p{text-align:center;color:#64748b;margin:0 0 14px}table{width:100%;border-collapse:collapse;margin-bottom:14px}td,th{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#e2e8f0}td:first-child{font-weight:bold;width:32%}</style></head><body>' +
      '<h1>Varlık Detay Raporu</h1><p>' + esc(DCIM.ui.fmtDateTime(new Date())) + ' · ' + esc(D.site.dc + ' / ' + (d.cabinetName || '-')) + '</p>' +
      '<table>' + rows.map(r => '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1] == null || r[1] === '' ? '-' : r[1]) + '</td></tr>').join('') + '</table>' +
      (portRows ? '<table><tr><th>Port</th><th>Yüz</th><th>Hedef Kabin</th><th>Hedef U</th><th>Hedef Port</th><th>Link Tipi</th></tr>' + portRows + '</table>' : '') +
      '<script>window.onload=function(){window.print();}<\/script></body></html>';
    const w = window.open('', '_blank');
    if (!w) { kit.exportPdf(); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ==========================================================================
  // PORT EKLE / DÜZENLE PENCERESİ
  // ==========================================================================
  let pm = null;
  function openPortModal(existing, x, y, side) {
    pm = {
      editing: existing,
      form: {
        id: existing ? existing.id : 'port_' + Date.now(), name: existing ? existing.name : '', side, x, y,
        sourceCabinet: dm.d.cabinetName || '', sourceUPosition: dm.d.position ? String(dm.d.position) : '',
        targetEndLabel: '', switchLabel: '', workBy: '', workDate: '', workNotes: '', color: '#4CAF50'
      },
      targetCab: '', targetU: '', targetPortName: '', targetSide: 'front'
    };
    renderPortModal();
    const n = portHost.querySelector('#portName');
    if (n) n.focus();
  }
  function closePortModal() { pm = null; portHost.innerHTML = ''; }
  const targetAssetOf = () => {
    if (!pm.targetCab || !pm.targetU) return null;
    const c = D.findCabinet(pm.targetCab);
    return c ? c.assets.find(a => M.uRange(a) === pm.targetU) || null : null;
  };
  const isDupName = () => !!pm && !!pm.form.name.trim() && dm.ports.some(p => p !== pm.editing && p.name.trim().toLowerCase() === pm.form.name.trim().toLowerCase());

  function renderPortModal() {
    if (!pm) return;
    const f = pm.form;
    const tgt = targetAssetOf();
    const tgtCab = tgt ? M.cabinetOfAsset(tgt.id) : null;
    const tgtPorts = tgt ? portsOf(tgt, tgtCab) : [];
    const face = tgt ? M.face(tgt, pm.targetSide) : null;
    const cabs = D.cabinets.map(c => c.code).sort();
    const uOpts = pm.targetCab ? (D.findCabinet(pm.targetCab) || { assets: [] }).assets.filter(a => a.startU).slice().sort((a, b) => b.startU - a.startU) : [];
    const inputRow = (id, label, value, ph) => '<div class="space-y-1"><label for="' + id + '" class="block font-medium text-slate-700 dark:text-slate-300">' + label + '</label><input type="text" id="' + id + '" data-pf="' + id + '" value="' + esc(value) + '" placeholder="' + esc(ph) + '" class="scada-input w-full" /></div>';
    const box = 'space-y-2.5 sm:space-y-3 p-2.5 sm:p-3 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px]';
    const h4 = t => '<h4 class="font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wide text-[11px]">' + t + '</h4>';
    portHost.innerHTML =
      '<div data-pm-overlay class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden">' +
          '<div class="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel shrink-0">' +
            '<h3 class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><i class="pi pi-cog text-sky-600 dark:text-sky-400"></i><span>' + (pm.editing ? 'Port Düzenle' : 'Yeni Port Ekle') + '</span></h3>' +
            '<button type="button" data-pm="close" class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="p-3 sm:p-5 overflow-y-auto space-y-3 sm:space-y-4 text-xs text-slate-700 dark:text-slate-300 flex-1">' +
            '<form data-pm-form class="space-y-3 sm:space-y-4" autocomplete="off">' +
              '<div class="' + box + '">' + h4('Kaynak Bilgileri') +
                '<div class="space-y-1"><label for="portName" class="block font-medium text-slate-700 dark:text-slate-300">Port Adı</label>' +
                  '<input type="text" id="portName" data-pf="name" value="' + esc(f.name) + '" required maxlength="50" placeholder="Örn: Port 1, Eth0/1" class="scada-input w-full" />' +
                  '<div class="text-[11px] text-slate-500 dark:text-slate-400">Portun benzersiz adı</div></div>' +
                '<div class="flex items-center gap-3"><label class="font-medium text-slate-700 dark:text-slate-300">Önizleme:</label><div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full border border-slate-300 dark:border-white/80" style="background-color:' + f.color + '"></div><span data-pm-preview class="font-semibold text-slate-900 dark:text-slate-100">' + esc(f.name || 'Yeni Port') + '</span></div></div>' +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">' + inputRow('sourceCabinet', 'Kabin Adı', f.sourceCabinet, 'Kaynak Kabin') + inputRow('sourceUPosition', 'U Konumu', f.sourceUPosition, 'U Konumu') + '</div>' +
              '</div>' +
              '<div class="' + box + '">' + h4('Hedef Bilgileri') +
                inputRow('targetEndLabel', 'Hedef Uç Etiketi', f.targetEndLabel, 'Hedef Etiket') +
                inputRow('switchLabel', 'Switch Etiketi', f.switchLabel, 'Switch Etiketi') +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">' +
                  '<div class="space-y-1"><label for="targetCabinet" class="block font-medium text-slate-700 dark:text-slate-300">Kabin Adı</label><select id="targetCabinet" data-pt="cab" class="scada-select w-full"><option value="">Kabin Seçiniz</option>' +
                    cabs.map(c => '<option value="' + c + '"' + (c === pm.targetCab ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
                  '<div class="space-y-1"><label for="targetUPosition" class="block font-medium text-slate-700 dark:text-slate-300">U Konumu</label><select id="targetUPosition" data-pt="u"' + (!pm.targetCab ? ' disabled' : '') + ' class="scada-select w-full"><option value="">U Seçiniz</option>' +
                    uOpts.map(a => '<option value="' + M.uRange(a) + '"' + (M.uRange(a) === pm.targetU ? ' selected' : '') + '>' + M.uRange(a) + ' · ' + esc(a.displayName) + '</option>').join('') + '</select></div>' +
                '</div>' +
                '<div class="space-y-1"><label for="targetPortPosition" class="block font-medium text-slate-700 dark:text-slate-300">Port Adı</label><select id="targetPortPosition" data-pt="port"' + (!tgt ? ' disabled' : '') + ' class="scada-select w-full"><option value="">Port Seçiniz</option>' +
                  tgtPorts.map(p => '<option value="' + esc(p.name) + '"' + (p.name === pm.targetPortName ? ' selected' : '') + '>' + esc(p.name) + (p.connected ? ' (dolu)' : '') + '</option>').join('') + '</select></div>' +
                '<div class="relative space-y-1">' +
                  '<div class="flex items-center justify-between"><label class="block font-medium text-slate-700 dark:text-slate-300">Görsel Port Haritası</label>' +
                    '<button type="button" data-pm="flip" class="p-1 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 transition-colors cursor-pointer" title="Görünümü Değiştir"><i class="pi pi-sync text-xs"></i></button></div>' +
                  '<div class="relative border border-slate-200 dark:border-border-subtle bg-slate-100 dark:bg-slate-950/60 rounded-[2px] p-1">' +
                    (face ? '<div class="relative block"><img src="' + esc(face.img) + '" alt="Hedef Bilgileri" draggable="false" class="max-w-full block mx-auto" />' +
                      tgtPorts.filter(p => p.side === pm.targetSide).map(p => '<div class="port-hotspot shape-circle" data-pt-port="' + esc(p.name) + '" title="' + esc(p.name) + '" style="left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;background-color:' + (p.name === pm.targetPortName ? 'orange' : p.connected ? '#f32121' : '#4CAF50') + ';border-radius:50%;transform:translate(-50%, -50%);position:absolute"><span class="port-label text-[9px] pointer-events-none">' + esc(p.name) + '</span></div>').join('') + '</div>'
                      : '<div class="text-slate-500 text-xs text-center py-6">Görsel Yüklenmemiş</div>') +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="' + box + '">' + h4('İş Takip Bilgileri') +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">' + inputRow('workBy', 'İşlemi Yapan', f.workBy, 'İsim / Ekip') +
                  '<div class="space-y-1"><label for="workDate" class="block font-medium text-slate-700 dark:text-slate-300">Tarih</label><input type="date" id="workDate" data-pf="workDate" value="' + esc(f.workDate) + '" class="scada-input w-full" /></div></div>' +
                '<div class="space-y-1"><label for="workNotes" class="block font-medium text-slate-700 dark:text-slate-300">İş Notları</label><textarea id="workNotes" data-pf="workNotes" rows="2" placeholder="Açıklama veya not..." class="scada-textarea w-full">' + esc(f.workNotes) + '</textarea></div>' +
              '</div>' +
              '<div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-border-subtle">' +
                '<button type="button" data-pm="close" class="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-medium rounded-[2px] transition-colors cursor-pointer">İptal</button>' +
                '<button type="submit" data-pm-submit' + (!f.name.trim() || isDupName() ? ' disabled' : '') + ' class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-medium rounded-[2px] transition-colors cursor-pointer">' + (pm.editing ? 'Güncelle' : 'Ekle') + '</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  portHost.addEventListener('click', e => {
    if (!pm) return;
    if (e.target.matches('[data-pm-overlay]')) { closePortModal(); return; }
    const b = e.target.closest('[data-pm]');
    if (b) {
      const a = b.getAttribute('data-pm');
      if (a === 'close') closePortModal();
      else if (a === 'flip') { pm.targetSide = pm.targetSide === 'front' ? 'back' : 'front'; renderPortModal(); }
      return;
    }
    const tp = e.target.closest('[data-pt-port]');
    if (tp) {
      const tgt = targetAssetOf();
      const p = tgt ? portsOf(tgt, M.cabinetOfAsset(tgt.id)).find(x => x.name === tp.getAttribute('data-pt-port')) : null;
      if (p && p.connected) { toast('Port kullanılıyor!', 'error'); return; }
      pm.targetPortName = tp.getAttribute('data-pt-port');
      renderPortModal();
    }
  });
  portHost.addEventListener('input', e => {
    if (!pm) return;
    const k = e.target.getAttribute('data-pf');
    if (!k) return;
    pm.form[k] = e.target.value;
    if (k === 'name') {
      const pv = portHost.querySelector('[data-pm-preview]');
      if (pv) pv.textContent = pm.form.name || 'Yeni Port';
      const sb = portHost.querySelector('[data-pm-submit]');
      if (sb) sb.disabled = !pm.form.name.trim() || isDupName();
    }
  });
  portHost.addEventListener('change', e => {
    if (!pm) return;
    const k = e.target.getAttribute('data-pt');
    if (!k) return;
    if (k === 'cab') { pm.targetCab = e.target.value; pm.targetU = ''; pm.targetPortName = ''; }
    else if (k === 'u') { pm.targetU = e.target.value; pm.targetPortName = ''; }
    else if (k === 'port') {
      const tgt = targetAssetOf();
      const p = tgt ? portsOf(tgt, M.cabinetOfAsset(tgt.id)).find(x => x.name === e.target.value) : null;
      if (p) pm.targetSide = p.side;
      pm.targetPortName = e.target.value;
    }
    renderPortModal();
  });
  portHost.addEventListener('submit', e => {
    e.preventDefault();
    savePort();
  });
  function savePort() {
    const f = pm.form;
    if (!f.name.trim()) { toast('Port adı gereklidir!', 'error'); return; }
    if (isDupName()) { toast('Bu port adı zaten kullanılıyor!', 'warning'); return; }
    const tgt = targetAssetOf();
    const tgtCab = tgt ? M.cabinetOfAsset(tgt.id) : null;
    const tgtPort = tgt && pm.targetPortName ? portsOf(tgt, tgtCab).find(x => x.name === pm.targetPortName) : null;
    const port = Object.assign(pm.editing || {}, {
      id: f.id, name: f.name.trim(), type: 'ethernet', side: f.side, x: f.x, y: f.y, color: '#4CAF50', shape: 'circle',
      sourceCabinet: f.sourceCabinet, sourceUPosition: f.sourceUPosition, targetEndLabel: f.targetEndLabel, switchLabel: f.switchLabel,
      workBy: f.workBy, workDate: f.workDate, workNotes: f.workNotes,
      connected: !!tgtPort, target_asset_id: tgtPort ? tgt.id : '', target_device_type: tgt ? tgt.assetType : '',
      targetCabinet: tgt ? tgtCab.code : '', targetUPosition: tgt ? M.uRange(tgt) : '', targetPortInfo: tgtPort ? tgtPort.name : '',
      targetSide: tgtPort ? tgtPort.side : '', target_side: tgtPort ? tgtPort.side : '', link_type: tgtPort ? 'Cat6A U/FTP' : '', isAutoNumbered: false
    });
    if (!pm.editing) dm.ports.push(port);
    // Karşı uçta da bağlantıyı işaretle (LNK iki yönlü)
    if (tgtPort && dm.asset) {
      Object.assign(tgtPort, { connected: true, target_asset_id: dm.asset.id, target_device_type: dm.d.deviceType, targetCabinet: dm.d.cabinetName, targetUPosition: M.uRange(dm.asset), targetPortInfo: port.name, targetSide: port.side, target_side: port.side, link_type: port.link_type });
    }
    closePortModal();
    renderDm();
    toast(port.name + ' portu ' + (tgtPort ? tgtCab.code + ' / U' + M.uRange(tgt) + ' / ' + tgtPort.name + ' hedefine bağlandı.' : 'eklendi.'), 'success', 'Port Yönetimi');
  }

  // ==========================================================================
  // PORT DETAY PENCERESİ (showPortDetailModal)
  // ==========================================================================
  let pdState = null;
  function openPortDetail(port) {
    pdState = { port, targetSide: port.targetSide || port.target_side || 'front' };
    renderPortDetail();
  }
  function closePortDetail() { pdState = null; portDetailHost.innerHTML = ''; }
  const decorate = (ports, isSel) => ports.map(p => Object.assign({}, p, { color: isSel(p) ? 'orange' : p.connected ? '#f32121' : '#4CAF50' }));
  function infoImageHtml(img, ports) {
    if (!img) return '<div class="text-slate-500 text-xs">Görsel Yüklenmemiş</div>';
    return '<div class="relative inline-block max-w-full"><img src="' + esc(img) + '" draggable="false" class="max-w-full block mx-auto object-contain" />' +
      ports.map(p => '<div class="port-hotspot shape-circle" data-info-port="' + esc(p.name) + '" style="left:' + (p.x * 100) + '%;top:' + (p.y * 100) + '%;background-color:' + p.color + ';border-radius:50%;transform:translate(-50%, -50%);position:absolute"><span class="port-label text-[9px] pointer-events-none">' + esc(p.name) + '</span></div>').join('') + '</div>';
  }
  function renderPortDetail() {
    const p = pdState.port;
    const d = dm.d;
    const srcImg = dm.img[p.side];
    const srcPorts = decorate(dm.ports.filter(x => x.side === p.side), x => x.id === p.id);
    const tgt = p.target_asset_id ? M.findAsset(p.target_asset_id) : null;
    const tgtCab = tgt ? M.cabinetOfAsset(tgt.id) : null;
    const tgtFace = tgt ? M.face(tgt, pdState.targetSide) : null;
    const tgtPorts = tgt && tgtFace ? decorate(portsOf(tgt, tgtCab).filter(x => x.side === pdState.targetSide), x => x.name === p.targetPortInfo) : [];
    const info = (label, value, extra) => '<div><label class="block text-slate-500 dark:text-slate-400 font-semibold">' + label + '</label><span class="text-slate-900 dark:text-slate-200 font-medium' + (extra || '') + '"' + (extra ? ' title="' + esc(value) + '"' : '') + '>' + esc(value || '-') + '</span></div>';
    const panel = 'space-y-4 p-4 bg-slate-50 dark:bg-surface-panel border border-slate-200 dark:border-border-subtle rounded-[2px]';
    const openBtn = where => '<button type="button" data-pd="net-' + where + '" class="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-[11px] font-medium rounded-[2px] cursor-pointer">Open Network</button>';
    const vpCls = 'relative border border-slate-200 dark:border-border-subtle bg-slate-100 dark:bg-slate-950/60 rounded-[2px] p-2 min-h-[140px] flex items-center justify-center';
    portDetailHost.innerHTML =
      '<div data-pd-overlay class="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">' +
        '<div class="bg-white dark:bg-surface-card border border-slate-200 dark:border-border-muted rounded-[2px] shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">' +
          '<div class="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel shrink-0">' +
            '<div class="flex items-center gap-2"><i class="pi pi-sitemap text-sky-600 dark:text-sky-400"></i><span class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">Port Detay Bilgisi - ' + esc(p.name) + '</span></div>' +
            '<button type="button" data-pd="close" class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"><i class="pi pi-times"></i></button>' +
          '</div>' +
          '<div class="p-3 sm:p-5 overflow-y-auto space-y-4 sm:space-y-6 text-xs text-slate-700 dark:text-slate-300 flex-1">' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">' +
              '<div class="' + panel + '">' +
                '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-border-subtle"><span class="font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wide flex items-center gap-2"><i class="pi pi-sign-in"></i> Kaynak Port Bilgileri</span>' + openBtn('source') + '</div>' +
                '<div class="grid grid-cols-2 gap-3 text-xs">' + info('Port Adı:', p.name) + info('Kabin:', p.sourceCabinet || d.cabinetName) + info('U Konumu:', p.sourceUPosition || d.position) + '</div>' +
                '<div class="' + vpCls + '">' + infoImageHtml(srcImg, srcPorts) + '</div>' +
              '</div>' +
              '<div class="' + panel + '">' +
                '<div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-border-subtle"><span class="font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-2"><i class="pi pi-sign-out"></i> Hedef Bağlantı Bilgileri</span>' +
                  '<div class="flex items-center gap-2">' + openBtn('target') + '<button type="button" data-pd="flip" class="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white cursor-pointer" title="Görünümü Değiştir"><i class="pi pi-sync text-xs"></i></button></div></div>' +
                '<div class="grid grid-cols-2 gap-3 text-xs">' + info('Hedef Port:', p.targetPortInfo, ' truncate block') + info('Karşı Uç Etiketi:', p.targetEndLabel) + info('Switch Etiketi:', p.switchLabel) + info('Hedef Kabin:', p.targetCabinet) + info('Hedef U:', p.targetUPosition) +
                  (p.link_type ? info('Link Tipi:', p.link_type) : '') + '</div>' +
                '<div class="' + vpCls + '">' + infoImageHtml(tgtFace ? tgtFace.img : null, tgtPorts) + '</div>' +
                (p.workBy ? '<div class="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-border-subtle pt-2"><i class="pi pi-user text-[10px] mr-1"></i>' + esc(p.workBy) + ' · ' + esc(p.workDate || '') + (p.workNotes ? ' — ' + esc(p.workNotes) : '') + '</div>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="px-5 py-3 border-t border-slate-200 dark:border-border-subtle flex items-center justify-between bg-slate-50 dark:bg-surface-panel">' +
            (dm.isEditMode ? '<div class="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><i class="pi pi-info-circle text-xs"></i><span>Port düzenleme modundasınız. Değişiklikleri kaydetmeyi unutmayınız.</span></div>' : '<div></div>') +
            '<button type="button" data-pd="close" class="px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-[2px] transition-colors cursor-pointer">Kapat</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  portDetailHost.addEventListener('click', e => {
    if (!pdState) return;
    if (e.target.matches('[data-pd-overlay]')) { closePortDetail(); return; }
    const b = e.target.closest('[data-pd]');
    if (!b) return;
    const a = b.getAttribute('data-pd');
    if (a === 'close') closePortDetail();
    else if (a === 'flip') { pdState.targetSide = pdState.targetSide === 'front' ? 'back' : 'front'; renderPortDetail(); }
    else if (a === 'net-source') toast('Ağ topolojisi görünümü sunum sürümünde yer almıyor.', 'info', 'Open Network');
    else if (a === 'net-target') {
      const p = pdState.port;
      const tgt = p.target_asset_id ? M.findAsset(p.target_asset_id) : null;
      if (!tgt) { toast(p.targetPortInfo ? p.targetPortInfo + ' bir ağ cihazı değil (güç bağlantısı).' : 'Bu port bağlı değil.', 'info', 'Open Network'); return; }
      const cab = M.cabinetOfAsset(tgt.id);
      const tPort = portsOf(tgt, cab).find(x => x.name === p.targetPortInfo);
      closePortDetail();
      closeDm();
      if (cab.code !== state.code) loadCabinet(cab.code);
      openDevice(tgt);
      if (tPort) openPortDetail(tPort);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('[data-dialog-panel]')) return; // DCIM.ui.dialog kendi Escape'ini yönetir
    if (pdState) closePortDetail();
    else if (pm) closePortModal();
    else if (dm) closeDm();
  });

  // ---------------------------------------------------------------------------
  // Canlı veri (startLiveDataPolling karşılığı — 5 sn)
  // ---------------------------------------------------------------------------
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      refreshData(true);
      const selFocused = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-pdu-select]');
      if (!selFocused) renderPdu();
      renderSensors();
    }, 5000);
  }
  document.addEventListener('dcim:theme', () => { /* sınıflar dark: varyantlarıyla uyumlu; yeniden çizim gerekmez */ });

  // ---------------------------------------------------------------------------
  // Başlat + URL ile demo durumları
  // ---------------------------------------------------------------------------
  loadCabinet(params.get('cabinet') || params.get('cabin_name') || '1BJ53');
  startPolling();

  (function applyUrlState() {
    const dev = params.get('device');
    const add = params.get('add');
    if (dev) {
      const m = /^U?(\d+)$/i.exec(dev);
      const asset = m ? state.cab.assets.find(a => +m[1] >= a.startU && +m[1] < a.startU + a.uSize) : state.cab.assets.find(a => a.id === dev || a.hostname === dev);
      if (asset) {
        openDevice(asset);
        if (params.get('edit') === '1') { dm.isEditMode = true; dm.classSearch = (dm.d.manufacturer || '') + ' - ' + (dm.d.model || ''); renderDm(); }
        const pn = params.get('port');
        if (pn) { const p = dm.ports.find(x => x.name.toLowerCase() === pn.toLowerCase()); if (p) openPortDetail(p); }
      }
    } else if (add) {
      const m = /^U?(\d+)$/i.exec(add);
      openCreate(m && +m[1] > 0 && +m[1] <= TOTAL_U && add !== '1' ? +m[1] : null);
      const q = params.get('cls');
      if (q) {
        const c = M.catalog.find(x => (x.brand + ' ' + x.name).toLowerCase().indexOf(q.toLowerCase()) >= 0);
        if (c) selectDeviceClass(c.model_id);
      }
      const ai = params.get('ai');
      if (ai === 'front' || ai === 'back') analyzeImageWithAI(ai);
    }
    const dlg = params.get('dialog');
    if (dlg === 'sensor') openSensorSettingsDialog();
    else if (dlg === 'pdu') openAddPduDialog();
    else if (dlg === 'position' && dm) openPositionPicker();
  })();
})();
