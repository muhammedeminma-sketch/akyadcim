/* ==========================================================================
   DCIM Sunum — Toplu yapılandırma ortak akışı (DCIM.engBulk)
   Kaynak: new-ui/pages/engineering/bulk-config/ — bulk-config.model.ts, bulk-plans.ts,
   bulk-scope.component.ts (app-bulk-scope), bulk-plan.component.ts (app-bulk-plan), bulk-apply.service.ts.
   Üç sayfada aynı akış: 1 KAPSAM (kat, cihaz grubu, istenirse tek tek cihaz) → 2 DEĞER → 3 ÖNİZLEME (yazma planı)
   → UYGULA (canlı yazma + dosyaya kalıcı yazma) → DOĞRULA (geri okuma).
   Sunumda yazma/okuma DCIM.data.bulkConfig (js/mock/eng-bulk-config.data.js) üzerinde simüle edilir.

   API:
     model     groupDevices, candidates, selected, resolveTargets, distribution, distText, formatPeriod, fmt,
               PERIOD_OPTIONS, LEVEL_LABEL, QUERY_GROUPS, SAVE_GROUPS, ALARM_GROUPS, ALARM_PARAMS, RECOMMENDED, LIMIT_ATTR,
               thresholdOrderOk, buildQueryOps, buildSaveOps, buildAlarmOps, emptyScope()
     scope(host, { groups, grouped, scope, valueTitle, valueFn, onChange }) → { update(patch), destroy() }
     plan({ title, ops, warnings, autoRun, onClosed(applied) })          → önizleme/uygulama penceresi
     pendingBar(el, { count, devices, unit, invalid, onClear, onPreview })  → alttaki bekleyen değişiklik çubuğu
     stepTitle(n, text, tone), infoBox(html), chipCls(active), header(title, actionsHtml)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = window.DCIM;
  const esc = DCIM.ui.esc;

  // ---------------------------------------------------------------------------------------------
  // Model (bulk-config.model.ts)
  const ID_CHUNK = 10;
  const emptyScope = () => ({ floors: [], groups: [], mode: 'all', picked: [] });

  function groupDevices(devices, groups) {
    const out = [];
    devices.forEach(device => {
      const group = groups.find(g => g.match(device));
      if (group) out.push({ device, group });
    });
    return out;
  }
  function candidates(grouped, scope) {
    const floors = new Set(scope.floors), groups = new Set(scope.groups);
    return grouped.filter(x => (!floors.size || floors.has(x.device.floorId)) && (!groups.size || groups.has(x.group.key)));
  }
  function selected(grouped, scope) {
    const c = candidates(grouped, scope);
    if (scope.mode === 'all') return c;
    const picked = new Set(scope.picked);
    return c.filter(x => picked.has(x.device.key));
  }
  function resolveTargets(grouped, scope) {
    const totals = new Map();
    grouped.forEach(x => { const k = x.device.document + '|' + x.group.key; totals.set(k, (totals.get(k) || 0) + 1); });
    const byKey = new Map();
    selected(grouped, scope).forEach(x => {
      const k = x.device.document + '|' + x.group.key;
      let t = byKey.get(k);
      if (!t) { t = { doc: x.device.document, group: x.group, devices: [], total: totals.get(k) || 0, whole: false }; byKey.set(k, t); }
      t.devices.push(x.device);
    });
    const out = Array.from(byKey.values());
    out.forEach(t => { t.whole = t.devices.length === t.total; });
    return out.sort((a, b) => a.doc.localeCompare(b.doc) || a.group.key.localeCompare(b.group.key));
  }

  const q = v => "'" + String(v) + "'";
  const orList = (attr, values) => values.map(v => '@' + attr + '=' + q(v)).join(' or ');
  const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
  const deviceVerifyPaths = (ids, suffix) => chunk(ids, ID_CHUNK).map(c => '//dev[' + orList('id', c) + ']' + suffix);

  function fmt(n, digits) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '—';
    return n.toLocaleString('tr-TR', { maximumFractionDigits: digits || 0 });
  }
  function formatPeriod(sec) {
    if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
    if (sec < 60) return fmt(sec, 1) + ' sn';
    if (sec < 3600) return fmt(sec / 60, 1) + ' dk';
    if (sec < 86400) return fmt(sec / 3600, 1) + ' sa';
    return fmt(sec / 86400, 1) + ' gün';
  }
  function distribution(values) {
    const m = new Map();
    values.forEach(v => {
      const s = v === null || v === undefined ? '' : String(v).trim();
      const n = s === '' ? NaN : Number(s);
      const k = Number.isFinite(n) ? n : null;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  }
  function distText(d, f) {
    if (!d.length) return '—';
    if (d.length === 1) return f(d[0].value);
    return d.map(x => f(x.value) + ' ×' + fmt(x.count)).join(' · ');
  }

  const PERIOD_OPTIONS = [5, 10, 30, 60, 300, 900, 3600, 86400];
  const LEVEL_LABEL = { group: 'Grubun tamamı', device: 'Cihaz bazında', class: 'Sınıf (şablon)', point: 'Nokta bazında' };

  // ---------------------------------------------------------------------------------------------
  // Gruplar (bulk-plans.ts) — etiketler messages.tr.json (dataQueryPeriod.deviceNames / bulkSettings.groups)
  const type = t => d => d.deviceType === t;
  const types = (...ts) => d => ts.includes(d.deviceType);
  const QUERY_GROUPS = [
    { key: 'pdu', label: 'PDU', icon: 'pi pi-server', devFilter: "@dev_type='pdu'", match: type('pdu') },
    { key: 'climate', label: 'Klima', icon: 'pi pi-cloud', devFilter: "@dev_type='crac'", match: type('crac') },
    { key: 'climatePanel', label: 'Klima Panosu', icon: 'pi pi-table', devFilter: "@dev_type='crac_panel'", match: type('crac_panel') },
    { key: 'sdp', label: 'SDP', icon: 'pi pi-th-large', devFilter: "@dev_type='panel'", match: type('panel') },
    { key: 'sensor', label: 'Sensör', icon: 'pi pi-gauge', devFilter: "@dev_type='sensor'", match: type('sensor') },
    { key: 'analyzer', label: 'Enerji Analizörü', icon: 'pi pi-chart-bar', devFilter: "@dev_type='meter' and not(@meter_of='compensation') and not(@meter_of='generator')", match: d => d.deviceType === 'meter' && d.meterOf !== 'compensation' && d.meterOf !== 'generator' },
    { key: 'rectifier', label: 'Redresör', icon: 'pi pi-bolt', devFilter: "@dev_type='rectifier'", match: type('rectifier') },
    { key: 'compensation', label: 'Kompanzasyon', icon: 'pi pi-sliders-v', devFilter: "@meter_of='compensation'", match: d => d.meterOf === 'compensation' },
    { key: 'generator', label: 'Jeneratör', icon: 'pi pi-cog', devFilter: "@meter_of='generator'", match: d => d.meterOf === 'generator' },
    { key: 'ups', label: 'UPS', icon: 'pi pi-box', devFilter: "@dev_type='ups'", match: type('ups') }
  ];
  const SAVE_GROUPS = [
    { key: 'pdu', label: 'PDU', icon: 'pi pi-server', devFilter: "@dev_type='pdu' or @dev_type='pmm'", match: types('pdu', 'pmm') },
    { key: 'climate', label: 'Klima', icon: 'pi pi-cloud', devFilter: "@dev_type='crac'", match: type('crac') },
    { key: 'climatePanel', label: 'Klima Panosu', icon: 'pi pi-table', devFilter: "@dev_type='crac_panel'", match: type('crac_panel') },
    { key: 'sdp', label: 'SDP', icon: 'pi pi-th-large', devFilter: "@dev_type='panel' or @dev_type='dist_panel'", match: types('panel', 'dist_panel') },
    { key: 'sensor', label: 'Sensör', icon: 'pi pi-gauge', devFilter: "@dev_type='sensor'", match: type('sensor') },
    { key: 'analyzer', label: 'Enerji Analizörü', icon: 'pi pi-chart-bar', devFilter: "@dev_type='meter'", match: type('meter') },
    { key: 'rectifier', label: 'Redresör', icon: 'pi pi-bolt', devFilter: "@dev_type='rectifier'", match: type('rectifier') },
    { key: 'ups', label: 'UPS', icon: 'pi pi-box', devFilter: "@dev_type='ups'", match: type('ups') }
  ];
  const ALARM_GROUPS = [
    { key: 'SENSOR', label: 'SENSÖR GRUBU (Tüm Kabinler)', icon: 'pi pi-gauge', devFilter: "@dev_type='sensor'", match: type('sensor') },
    { key: 'KLIMA', label: 'KLİMA PANOLARI (A ve B Grupları)', icon: 'pi pi-cloud', devFilter: "@dev_type='crac_panel'", match: type('crac_panel') },
    { key: 'SDP', label: 'SDP PANOLARI', icon: 'pi pi-th-large', devFilter: "@dev_type='panel'", match: type('panel') },
    { key: 'PDU', label: 'PDU GRUBU', icon: 'pi pi-server', devFilter: "@dev_type='pdu'", match: type('pdu') }
  ];
  const LIMIT_ATTR = {
    emr_hi: 'val_alm_onlhi_emr', alm_hi: 'val_alm_onlhi_alm', wrn_hi: 'val_alm_onlhi_wrn',
    wrn_lo: 'val_alm_onllo_wrn', alm_lo: 'val_alm_onllo_alm', emr_lo: 'val_alm_onllo_emr',
    alm_dly_set: 'alm_dly_set', alm_dly_rst: 'alm_dly_rst'
  };
  const sensorParam = (key, label, pred, cat, unit) => ({ key, group: 'SENSOR', label, unit, hasDelay: true, cat, wholePath: '//io[' + pred + ']', wholeLevel: 'group', deviceSuffix: '//io[' + pred + ']', deviceLevel: 'device' });
  const panelParam = (group, devType, key, label, role, cat, unit) => ({ key, group, label, unit, hasDelay: false, cat, wholePath: "//dev[@dev_type='" + devType + "']//io[@io_role='" + role + "']", wholeLevel: 'group', deviceSuffix: "//io[@io_role='" + role + "']", deviceLevel: 'device' });
  const ALARM_PARAMS = [
    sensorParam('TEMP_TOP', 'Üst Sıcaklık', "@io_role='cabin_temp' and @io_pos='top'", 'TEMP', '°C'),
    sensorParam('TEMP_MID', 'Orta Sıcaklık', "@io_role='cabin_temp' and @io_pos='mid'", 'TEMP', '°C'),
    sensorParam('TEMP_BOT', 'Alt Sıcaklık', "@io_role='cabin_temp' and @io_pos='bot'", 'TEMP', '°C'),
    sensorParam('HUM_MID', 'Nem Oranı', "@io_role='cabin_hum'", 'HUM', '%'),
    panelParam('KLIMA', 'crac_panel', 'VOLT', 'Gerilim', 'volt_ln', 'VOLT', 'V'),
    panelParam('KLIMA', 'crac_panel', 'CURR', 'Akım Sınırı', 'curr', 'CURR', 'A'),
    panelParam('KLIMA', 'crac_panel', 'POW', 'Aktif Güç', 'pow_tot', 'POW', 'W'),
    panelParam('SDP', 'panel', 'VOLT', 'Gerilim', 'volt_ln', 'VOLT', 'V'),
    panelParam('SDP', 'panel', 'CURR', 'Akım Sınırı', 'curr', 'CURR', 'A'),
    panelParam('SDP', 'panel', 'POW', 'Aktif Güç', 'pow_tot', 'POW', 'W'),
    { key: 'OCP', group: 'PDU', label: 'OCP Akım Sınırı', unit: 'A', hasDelay: true, cat: 'CURR', wholePath: "//tio[@io_role='ocp_curr']", wholeLevel: 'class', deviceSuffix: "//io[@io_role='ocp_curr']", deviceLevel: 'point' }
  ];
  const RECOMMENDED = {
    TEMP: { alm_hi: 35, wrn_hi: 30, wrn_lo: 15, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40 },
    HUM: { alm_hi: 80, wrn_hi: 70, wrn_lo: 20, alm_lo: 10, alm_dly_set: 40, alm_dly_rst: 40 },
    VOLT: { alm_hi: 255, wrn_hi: 245, wrn_lo: 195, alm_lo: 185, alm_dly_set: 40, alm_dly_rst: 40 },
    CURR: { alm_hi: 1000, wrn_hi: 800, wrn_lo: 0, alm_lo: 0, alm_dly_set: 40, alm_dly_rst: 40 },
    POW: { alm_hi: 50000, wrn_hi: 40000, wrn_lo: 0, alm_lo: 0, alm_dly_set: 40, alm_dly_rst: 40 }
  };
  const POINT_LEVEL_NOTE = 'Noktaya yazılan his_per sınıf değerini ezer; sınıf sonradan değişse de bu noktalar kendi değerinde kalır.';
  const PDU_POINT_NOTE = 'PDU üst eşikleri sigorta politikasından türetilir (THR_Policy); noktaya yazılan üst eşik politika yeniden uygulanınca değişir.';

  function thresholdOrderOk(v) {
    const ordered = (vals, desc) => {
      const x = vals.filter(a => a !== null && a !== undefined && a !== '').map(Number);
      return x.every((a, i) => i === 0 || (desc ? x[i - 1] >= a : x[i - 1] <= a));
    };
    return ordered([v.emr_hi, v.alm_hi, v.wrn_hi], true) && ordered([v.emr_lo, v.alm_lo, v.wrn_lo], false);
  }

  // ---------------------------------------------------------------------------------------------
  // Yazma planları — her işlem apply() (canlı + dosya) ve check() (geri okuma) kapanışlarını taşır
  const M = () => DCIM.data.bulkConfig;
  const baseOp = (t, key, param, attrs, before) => ({
    key, doc: t.doc, floorName: (t.devices[0] && t.devices[0].floorName) || '', groupKey: t.group.key, groupLabel: t.group.label,
    param, devices: t.devices.length, attrs, before
  });

  function buildQueryOps(targets, values, before) {
    const ops = [];
    targets.forEach(t => {
      const v = values[t.group.key];
      if (!(v > 0)) return;
      const attrs = { evt_per: v };
      const keys = t.devices.map(d => d.key);
      const base = baseOp(t, t.doc + '|' + t.group.key + '|evt_per', 'Sorgu periyodu → ' + formatPeriod(v), attrs, before(t));
      const ids = t.devices.map(d => d.id);
      const live = t.whole ? ['//dev[' + t.group.devFilter + ']/bi'] : ids.map(id => 'id(' + q(id) + ')/bi');
      ops.push(Object.assign(base, {
        level: t.whole ? 'group' : 'device', live, persist: live.map(sel => ({ sel, atr: attrs })),
        verify: t.whole ? live : deviceVerifyPaths(ids, '/bi'),
        apply: () => M().setEvt(keys, v),
        check: () => { const vals = keys.flatMap(k => M().evt(k)); return { ok: vals.filter(x => x === v).length, total: vals.length }; }
      }));
    });
    return ops;
  }

  function buildSaveOps(targets, values, before) {
    const ops = [], skipped = [];
    targets.forEach(t => {
      const v = values[t.group.key];
      if (!(v > 0)) return;
      const classes = M().classes(t.doc, t.group.key, t.devices.length).map(c => c.id);
      if (!classes.length) { skipped.push(t); return; }
      const attrs = { his_per: v };
      const keys = t.devices.map(d => d.key);
      const base = baseOp(t, t.doc + '|' + t.group.key + '|his_per', 'Kayıt periyodu → ' + formatPeriod(v), attrs, before(t));
      if (t.whole) {
        const paths = chunk(classes, ID_CHUNK).map(c => '//tio[' + orList('id', c) + ']');
        ops.push(Object.assign(base, {
          level: 'class', live: paths, persist: paths.map(sel => ({ sel, atr: attrs })), verify: paths,
          apply: () => M().setClassHis(t.doc, t.group.key, v),
          check: () => { const cl = M().classes(t.doc, t.group.key, 0); return { ok: cl.filter(c => c.his === v).length, total: cl.length }; }
        }));
      } else {
        const ids = t.devices.map(d => d.id);
        const suffixes = chunk(classes, ID_CHUNK).map(c => '//io[' + orList('xdb_cls', c) + ']');
        const live = ids.flatMap(id => suffixes.map(s => 'id(' + q(id) + ')' + s));
        const pts = M().classes(t.doc, t.group.key, 1).reduce((a, c) => a + c.points, 0);
        ops.push(Object.assign(base, {
          level: 'point', live, persist: live.map(sel => ({ sel, atr: attrs })),
          verify: suffixes.flatMap(s => deviceVerifyPaths(ids, s)), note: POINT_LEVEL_NOTE,
          apply: () => M().setPointHis(keys, t.group.key, v),
          check: () => { const ok = keys.filter(k => M().pointHisOf(k, t.group.key) === v).length * pts; return { ok, total: keys.length * pts }; }
        }));
      }
    });
    return { ops, skipped };
  }

  function buildAlarmOps(targets, edits, before) {
    const ops = [];
    edits.forEach(e => {
      const attrs = {}, vals = {};
      Object.keys(e.values).forEach(f => {
        const v = e.values[f];
        if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) { attrs[LIMIT_ATTR[f]] = Number(v); vals[f] = Number(v); }
      });
      if (!Object.keys(attrs).length) return;
      targets.filter(x => x.group.key === e.param.group).forEach(t => {
        const keys = t.devices.map(d => d.key);
        const base = baseOp(t, t.doc + '|' + t.group.key + '|' + e.param.key, e.param.label, attrs, before(t, e.param));
        base.valueAsText = true;
        const ids = t.devices.map(d => d.id);
        const live = t.whole ? [e.param.wholePath] : ids.map(id => 'id(' + q(id) + ')' + e.param.deviceSuffix);
        const per = M().POINTS[e.param.key] || 1;
        ops.push(Object.assign(base, {
          level: t.whole ? e.param.wholeLevel : e.param.deviceLevel, live, persist: live.map(sel => ({ sel, atr: attrs })),
          verify: t.whole ? live : deviceVerifyPaths(ids, e.param.deviceSuffix),
          note: !t.whole && e.param.group === 'PDU' ? PDU_POINT_NOTE : undefined,
          apply: () => M().setThr(keys, e.param.key, vals),
          check: () => {
            const n = Object.keys(vals).length;
            const ok = keys.filter(k => { const cur = M().thr(k, e.param.key); return Object.keys(vals).every(f => Number(cur[f]) === vals[f]); }).length;
            return { ok: ok * per * n, total: keys.length * per * n };
          }
        }));
      });
    });
    return ops;
  }

  // ---------------------------------------------------------------------------------------------
  // Görsel yardımcılar
  const chipCls = active => 'px-2 py-0.5 rounded-[2px] border text-[11px] font-semibold cursor-pointer transition-colors inline-flex items-center gap-1 ' +
    (active ? 'bg-sky-600 border-sky-600 text-white'
      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');
  const stepTitle = (n, text, tone) => '<h2 class="text-xs font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">' +
    '<span class="w-5 h-5 rounded-full ' + (tone === 'emerald' ? 'bg-emerald-600' : 'bg-sky-600') + ' text-white text-[10px] flex items-center justify-center">' + n + '</span>' + text + '</h2>';
  const infoBox = html => '<div class="flex items-start gap-2 px-3 py-2 rounded-[2px] border border-sky-500/20 bg-sky-500/5 text-[11px] text-slate-600 dark:text-slate-300 leading-snug">' +
    '<i class="pi pi-info-circle text-sky-500 mt-0.5"></i><span>' + html + '</span></div>';
  const header = (title, actions) => DCIM.kit.pageHeader({
    title, breadcrumbs: [{ label: 'Mühendislik', href: 'engineering.html#home' }, { label: title }], actions
  });
  const STATE_LABEL = { online: 'Çevrimiçi', warning: 'Uyarı', alarm: 'Alarm', critical: 'Acil', nocomm: 'Haberleşme yok', stopped: 'Duruyor', disabled: 'Devre dışı', unknown: 'Bilinmiyor' };
  const STATE_DOT = { online: 'bg-emerald-500', warning: 'bg-amber-500', alarm: 'bg-rose-500', critical: 'bg-purple-500', nocomm: 'bg-slate-600 dark:bg-slate-400', disabled: 'bg-slate-300 dark:bg-slate-600', stopped: 'bg-slate-300 dark:bg-slate-600' };
  const SEC_CLS = 'bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px]';

  // ---------------------------------------------------------------------------------------------
  // app-bulk-scope
  const PAGE = 50;
  function scope(host, opts) {
    const o = Object.assign({ groups: [], grouped: [], scope: emptyScope(), valueTitle: '', valueFn: null, onChange: null }, opts);
    const st = { search: '', onlyPicked: false, page: 0, last: -1 };
    let filtered = [];

    function emit(s) {
      o.scope = s;
      render();
      if (o.onChange) o.onChange(s);
    }

    function render() {
      const s = o.scope;
      const pickedSet = new Set(s.picked);
      const byGroup = o.grouped.filter(x => !s.groups.length || s.groups.includes(x.group.key));
      const floors = new Map();
      o.grouped.forEach(x => { if (!floors.has(x.device.floorId)) floors.set(x.device.floorId, { id: x.device.floorId, name: x.device.floorName, count: 0 }); });
      byGroup.forEach(x => floors.get(x.device.floorId).count++);
      const floorChips = Array.from(floors.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      const byFloor = o.grouped.filter(x => !s.floors.length || s.floors.includes(x.device.floorId));
      const groupChips = o.groups.map(def => ({ def, count: byFloor.filter(x => x.group.key === def.key).length }));
      const cand = candidates(o.grouped, s);
      const pickedInCand = cand.filter(x => pickedSet.has(x.device.key)).length;
      const sel = selected(o.grouped, s);
      const targets = resolveTargets(o.grouped, s);
      const docCount = new Set(targets.map(t => t.doc)).size;
      const partial = targets.filter(t => !t.whole).length;
      const qq = st.search.trim().toLocaleLowerCase('tr');
      filtered = cand.filter(x => {
        if (st.onlyPicked && !pickedSet.has(x.device.key)) return false;
        if (!qq) return true;
        const d = x.device;
        return [d.id, d.description, d.host, d.locationName, d.floorName].some(v => (v || '').toLocaleLowerCase('tr').includes(qq));
      });
      const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
      if (st.page >= pageCount) st.page = pageCount - 1;
      const rows = filtered.slice(st.page * PAGE, (st.page + 1) * PAGE);
      const allPicked = filtered.length > 0 && filtered.every(x => pickedSet.has(x.device.key));
      const somePicked = filtered.some(x => pickedSet.has(x.device.key));
      const label = 'w-20 shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
      const segBtn = on => 'px-2.5 py-1 cursor-pointer ' + (on ? 'bg-sky-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800');

      host.innerHTML =
        '<section class="' + SEC_CLS + '">' +
          '<div class="px-3 py-2 border-b border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-2">' +
            stepTitle(1, 'Kapsam') +
            '<div class="text-[11px] text-slate-600 dark:text-slate-300 tabular-nums"><strong class="text-slate-900 dark:text-white">' + fmt(sel.length) + '</strong> cihaz · ' +
              '<strong class="text-slate-900 dark:text-white">' + docCount + '</strong> doküman' +
              (partial ? ' · <span class="text-amber-700 dark:text-amber-400">' + partial + ' hedefte cihaz bazında</span>' : '') + '</div>' +
          '</div>' +
          '<div class="p-3 space-y-2.5">' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="' + label + '">Kat</span>' +
              '<button type="button" data-floor="" class="' + chipCls(!s.floors.length) + '">Tümü</button>' +
              floorChips.map(f => '<button type="button" data-floor="' + esc(f.id) + '" class="' + chipCls(s.floors.includes(f.id)) + '">' + esc(f.name) + ' <span class="opacity-70 tabular-nums">' + fmt(f.count) + '</span></button>').join('') +
            '</div>' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="' + label + '">Cihaz grubu</span>' +
              '<button type="button" data-group="" class="' + chipCls(!s.groups.length) + '">Tümü</button>' +
              groupChips.map(g => {
                const on = s.groups.includes(g.def.key);
                return '<button type="button" data-group="' + esc(g.def.key) + '" class="' + chipCls(on) + ' disabled:opacity-40 disabled:cursor-not-allowed"' + (!g.count && !on ? ' disabled' : '') + '>' +
                  '<i class="' + g.def.icon + ' text-[10px]"></i> ' + esc(g.def.label) + ' <span class="opacity-70 tabular-nums">' + fmt(g.count) + '</span></button>';
              }).join('') +
            '</div>' +
            '<div class="flex flex-wrap items-center gap-1.5"><span class="' + label + '">Seçim</span>' +
              '<div class="inline-flex rounded-[2px] border border-slate-300 dark:border-slate-700 overflow-hidden text-[11px] font-semibold">' +
                '<button type="button" data-mode="all" class="' + segBtn(s.mode === 'all') + '">Bütün cihazlar (' + fmt(cand.length) + ')</button>' +
                '<button type="button" data-mode="pick" class="' + segBtn(s.mode === 'pick') + ' border-l border-slate-300 dark:border-slate-700">Listeden seç (' + fmt(pickedInCand) + ')</button>' +
              '</div>' +
              '<span class="text-[10.5px] text-slate-500 dark:text-slate-400">' + (s.mode === 'all'
                ? 'Seçili kat ve gruplardaki bütün cihazlar; grubun tamamı tek seçiciyle yazılır.'
                : 'Yalnız işaretlediğiniz cihazlar; bir dokümandaki grubun hepsi işaretliyse yine grubun tamamı olarak yazılır.') + '</span>' +
            '</div>' +
          '</div>' +
          (s.mode === 'pick' ?
          '<div class="border-t border-slate-200 dark:border-border-subtle">' +
            '<div class="px-3 py-2 flex flex-wrap items-center gap-2">' +
              '<div class="relative"><i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400"></i>' +
                '<input type="text" data-search value="' + esc(st.search) + '" placeholder="Cihaz, açıklama, IP, konum…" class="w-64 pl-6 pr-2 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-[2px] focus:outline-none focus:border-sky-500"></div>' +
              '<label class="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer select-none"><input type="checkbox" data-only' + (st.onlyPicked ? ' checked' : '') + ' class="accent-sky-600"> Yalnız seçilenler</label>' +
              '<span class="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700"></span>' +
              '<button type="button" data-pickvis="1" class="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:underline cursor-pointer">Süzülenlerin hepsini seç (' + fmt(filtered.length) + ')</button>' +
              '<button type="button" data-pickvis="0" class="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:underline cursor-pointer">Süzülenleri bırak</button>' +
              '<button type="button" data-clear class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer">Seçimi temizle</button>' +
              '<span class="ml-auto text-[10.5px] text-slate-500 dark:text-slate-400">Shift ile tıklayarak aralık seçebilirsiniz</span>' +
            '</div>' +
            '<div class="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar">' +
              '<table class="w-full text-[11px] tabular-nums"><thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10"><tr>' +
                '<th class="px-3 py-1.5 w-8"><input type="checkbox" data-allvis class="accent-sky-600"' + (allPicked ? ' checked' : '') + ' title="Süzülenlerin hepsi"></th>' +
                '<th class="text-left font-semibold px-2">Cihaz</th><th class="text-left font-semibold px-2">Grup</th><th class="text-left font-semibold px-2">Kat</th>' +
                '<th class="text-left font-semibold px-2">Konum</th><th class="text-left font-semibold px-2">IP</th><th class="text-left font-semibold px-2">Durum</th>' +
                (o.valueTitle ? '<th class="text-left font-semibold px-2">' + esc(o.valueTitle) + '</th>' : '') +
              '</tr></thead><tbody>' +
              rows.map((x, i) => {
                const d = x.device, on = pickedSet.has(d.key);
                return '<tr data-row="' + (st.page * PAGE + i) + '" class="border-t border-slate-100 dark:border-slate-800/70 cursor-pointer ' + (on ? 'bg-sky-50 dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/40') + '">' +
                  '<td class="px-3 py-1"><input type="checkbox" class="accent-sky-600 pointer-events-none" tabindex="-1"' + (on ? ' checked' : '') + '></td>' +
                  '<td class="px-2 py-1 min-w-[220px]"><div class="font-mono font-semibold text-slate-800 dark:text-slate-100">' + esc(d.id) + '</div>' +
                    '<div class="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[320px]">' + esc(d.description) + '</div></td>' +
                  '<td class="px-2 whitespace-nowrap"><i class="' + x.group.icon + ' text-[10px] text-slate-400 mr-1"></i>' + esc(x.group.label) + '</td>' +
                  '<td class="px-2 whitespace-nowrap">' + esc(d.floorName) + (d.area ? '<span class="text-slate-400"> · ' + esc(d.area) + '</span>' : '') + '</td>' +
                  '<td class="px-2 whitespace-nowrap max-w-[180px] truncate" title="' + esc(d.locationName) + '">' + esc(d.locationName || '—') + '</td>' +
                  '<td class="px-2 font-mono whitespace-nowrap">' + esc(d.host || '—') + '</td>' +
                  '<td class="px-2 whitespace-nowrap"><span class="inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full ' + (STATE_DOT[d.state] || 'bg-slate-200 dark:bg-slate-700') + '"></span>' + esc(STATE_LABEL[d.state] || d.state) + '</span></td>' +
                  (o.valueTitle ? '<td class="px-2 whitespace-nowrap font-semibold">' + esc(o.valueFn ? o.valueFn(d) : '') + '</td>' : '') +
                '</tr>';
              }).join('') +
              (!filtered.length ? '<tr><td colspan="' + (o.valueTitle ? 8 : 7) + '" class="px-3 py-4 text-center text-slate-400">Eşleşen cihaz yok.</td></tr>' : '') +
              '</tbody></table>' +
            '</div>' +
            '<div class="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">' +
              '<span>' + fmt(filtered.length ? st.page * PAGE + 1 : 0) + '–' + fmt(Math.min((st.page + 1) * PAGE, filtered.length)) + ' / ' + fmt(filtered.length) + '</span>' +
              '<div class="flex items-center gap-1">' +
                '<button type="button" data-page="-1" class="w-6 h-6 rounded-[2px] border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"' + (st.page === 0 ? ' disabled' : '') + '><i class="pi pi-chevron-left text-[9px]"></i></button>' +
                '<span>' + (st.page + 1) + ' / ' + pageCount + '</span>' +
                '<button type="button" data-page="1" class="w-6 h-6 rounded-[2px] border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"' + (st.page + 1 >= pageCount ? ' disabled' : '') + '><i class="pi pi-chevron-right text-[9px]"></i></button>' +
              '</div>' +
            '</div>' +
          '</div>' : '') +
        '</section>';

      const all = host.querySelector('[data-allvis]');
      if (all) all.indeterminate = somePicked && !allPicked;
    }

    const toggle = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : arr.concat(v);
    host.addEventListener('click', e => {
      const t = e.target.closest('button, tr[data-row], input[data-allvis]');
      if (!t || t.disabled) return;
      const s = o.scope;
      if (t.hasAttribute('data-floor')) { const id = t.getAttribute('data-floor'); emit(Object.assign({}, s, { floors: id ? toggle(s.floors, id) : [] })); }
      else if (t.hasAttribute('data-group')) { const id = t.getAttribute('data-group'); emit(Object.assign({}, s, { groups: id ? toggle(s.groups, id) : [] })); }
      else if (t.hasAttribute('data-mode')) emit(Object.assign({}, s, { mode: t.getAttribute('data-mode') }));
      else if (t.hasAttribute('data-pickvis') || t.hasAttribute('data-allvis')) {
        const on = t.hasAttribute('data-allvis') ? t.checked : t.getAttribute('data-pickvis') === '1';
        const set = new Set(s.picked);
        filtered.forEach(x => on ? set.add(x.device.key) : set.delete(x.device.key));
        emit(Object.assign({}, s, { picked: Array.from(set) }));
      } else if (t.hasAttribute('data-clear')) emit(Object.assign({}, s, { picked: [] }));
      else if (t.hasAttribute('data-page')) { st.page += Number(t.getAttribute('data-page')); render(); }
      else if (t.hasAttribute('data-row')) {
        const index = Number(t.getAttribute('data-row'));
        const x = filtered[index];
        if (!x) return;
        const set = new Set(s.picked);
        if (e.shiftKey && st.last >= 0) {
          const a = Math.min(st.last, index), b = Math.max(st.last, index);
          const on = !set.has(x.device.key);
          filtered.slice(a, b + 1).forEach(r => on ? set.add(r.device.key) : set.delete(r.device.key));
        } else if (set.has(x.device.key)) set.delete(x.device.key); else set.add(x.device.key);
        st.last = index;
        emit(Object.assign({}, s, { picked: Array.from(set) }));
      }
    });
    host.addEventListener('input', e => {
      if (e.target.hasAttribute('data-search')) {
        st.search = e.target.value; st.page = 0; st.last = -1;
        const pos = e.target.selectionStart;
        render();
        const inp = host.querySelector('[data-search]');
        inp.focus(); inp.setSelectionRange(pos, pos);
      }
    });
    host.addEventListener('change', e => {
      if (e.target.hasAttribute('data-only')) { st.onlyPicked = e.target.checked; st.page = 0; render(); }
    });

    render();
    return {
      update(patch) { Object.assign(o, patch || {}); render(); },
      get scope() { return o.scope; },
      destroy() { host.innerHTML = ''; }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // app-bulk-plan (önizleme + uygula + doğrula)
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function plan(opts) {
    const o = Object.assign({ title: 'Önizleme ve uygula', ops: [], warnings: [], autoRun: false, onClosed: null }, opts);
    const results = new Map();
    const st = { running: false, done: false, confirmed: !!o.autoRun, ok: 0, fail: 0 };
    const deviceCount = o.ops.reduce((a, op) => a + op.devices, 0);
    const docCount = new Set(o.ops.map(op => op.doc)).size;
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4';
    document.body.appendChild(el);

    const attrsText = op => Object.keys(op.attrs).map(k => k + '=' + op.attrs[k]).join(', ');
    const stateCls = r => r.state === 'done' ? 'text-emerald-600 dark:text-emerald-400' : r.state === 'failed' ? 'text-rose-600 dark:text-rose-400' : r.state === 'running' ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500';
    const stateIcon = r => r.state === 'done' ? 'pi-check-circle' : r.state === 'failed' ? 'pi-times-circle' : r.state === 'running' ? 'pi-spin pi-spinner' : 'pi-clock';

    function render() {
      el.innerHTML =
        '<div data-panel class="w-full max-w-6xl max-h-[90vh] flex flex-col bg-white dark:bg-surface-card border border-slate-200 dark:border-border-subtle rounded-[2px] shadow-2xl">' +
          '<div class="px-4 py-2.5 border-b border-slate-200 dark:border-border-subtle flex items-center justify-between gap-3">' +
            '<div><h2 class="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-sky-600 text-white text-[10px] flex items-center justify-center">3</span>' + esc(o.title) + '</h2>' +
              '<p class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">' + o.ops.length + ' işlem · ' + fmt(deviceCount) + ' cihaz · ' + docCount + ' doküman</p></div>' +
            '<button type="button" data-close class="w-7 h-7 rounded-[2px] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-40 cursor-pointer"' + (st.running ? ' disabled' : '') + '><i class="pi pi-times text-xs"></i></button>' +
          '</div>' +
          '<div class="flex-1 min-h-0 overflow-auto custom-scrollbar">' +
            o.warnings.map(w => '<div class="mx-3 mt-3 px-3 py-2 border border-amber-500/30 bg-amber-500/10 rounded-[2px] text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5"><i class="pi pi-exclamation-triangle text-[10px] mt-0.5"></i><span>' + esc(w) + '</span></div>').join('') +
            '<table class="w-full text-[11px] tabular-nums mt-2"><thead class="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 sticky top-0"><tr>' +
              '<th class="text-left font-semibold px-3 py-1.5">Kat · Doküman</th><th class="text-left font-semibold px-2">Grup</th><th class="text-left font-semibold px-2">Değişiklik</th>' +
              '<th class="text-left font-semibold px-2">Düzey</th><th class="text-right font-semibold px-2">Cihaz</th><th class="text-left font-semibold px-2">Bugün</th><th class="text-left font-semibold px-3">Sonuç</th>' +
            '</tr></thead><tbody>' +
            o.ops.map(op => {
              const r = results.get(op.key);
              const whole = op.level === 'group' || op.level === 'class';
              return '<tr class="border-t border-slate-100 dark:border-slate-800/70 align-top">' +
                '<td class="px-3 py-1.5 whitespace-nowrap"><div class="font-semibold text-slate-800 dark:text-slate-100">' + esc(op.floorName || '—') + '</div><div class="font-mono text-[10px] text-slate-500">' + esc(op.doc) + '</div></td>' +
                '<td class="px-2 py-1.5 whitespace-nowrap">' + esc(op.groupLabel) + '</td>' +
                '<td class="px-2 py-1.5"><div class="font-semibold text-slate-800 dark:text-slate-100">' + esc(op.param) + '</div><div class="text-[10px] text-slate-500 font-mono" title="' + esc(op.live[0] + (op.live.length > 1 ? ' (+' + (op.live.length - 1) + ' yol)' : '')) + '">' + esc(attrsText(op)) + '</div></td>' +
                '<td class="px-2 py-1.5 whitespace-nowrap"><span class="px-1.5 py-px rounded-[2px] text-[10px] font-semibold border ' + (whole ? 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300') + '">' + LEVEL_LABEL[op.level] + '</span>' +
                  (op.note ? '<div class="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400 max-w-[220px] leading-snug whitespace-normal">' + esc(op.note) + '</div>' : '') + '</td>' +
                '<td class="px-2 py-1.5 text-right font-semibold">' + fmt(op.devices) + '</td>' +
                '<td class="px-2 py-1.5 text-slate-600 dark:text-slate-300 max-w-[220px]">' + esc(op.before || '—') + '</td>' +
                '<td class="px-3 py-1.5 whitespace-nowrap">' + (r
                  ? '<span class="inline-flex items-center gap-1 font-semibold ' + stateCls(r) + '"><i class="pi text-[10px] ' + stateIcon(r) + '"></i>' + esc(r.message || '…') + '</span>' +
                    (r.verifiedTotal ? '<div class="text-[10px] text-slate-500">doğrulama ' + fmt(r.verifiedOk) + '/' + fmt(r.verifiedTotal) + '</div>' : '')
                  : '<span class="text-slate-400">bekliyor</span>') + '</td>' +
              '</tr>';
            }).join('') +
            (!o.ops.length ? '<tr><td colspan="7" class="px-3 py-4 text-center text-slate-400">Uygulanacak değişiklik yok.</td></tr>' : '') +
            '</tbody></table>' +
          '</div>' +
          '<div class="px-4 py-2.5 border-t border-slate-200 dark:border-border-subtle flex flex-wrap items-center justify-between gap-3">' +
            '<div class="text-[11px] text-slate-600 dark:text-slate-300">' + (!st.done
              ? '<label class="inline-flex items-center gap-1.5 cursor-pointer select-none' + (st.running ? ' opacity-50' : '') + '"><input type="checkbox" data-confirm class="accent-sky-600"' + (st.confirmed ? ' checked' : '') + (st.running ? ' disabled' : '') + '> Önizlemeyi kontrol ettim; değişiklik canlıda uygulanacak ve XML dosyalarına kaydedilecek.</label>'
              : '<span class="font-semibold ' + (st.fail ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400') + '"><i class="pi text-[11px] mr-1 ' + (st.fail ? 'pi-exclamation-circle' : 'pi-check-circle') + '"></i>' +
                st.ok + ' işlem uygulandı ve doğrulandı' + (st.fail ? ', ' + st.fail + ' işlemde sorun var' : '') + '.</span>') + '</div>' +
            '<div class="flex items-center gap-2">' +
              '<button type="button" data-close class="px-3 py-1.5 text-xs font-semibold rounded-[2px] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"' + (st.running ? ' disabled' : '') + '>' + (st.done ? 'Kapat' : 'Vazgeç') + '</button>' +
              (!st.done ? '<button type="button" data-run class="px-3.5 py-1.5 text-xs font-bold rounded-[2px] bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1.5"' + (!st.confirmed || st.running || !o.ops.length ? ' disabled' : '') + '>' +
                '<i class="pi text-[11px] ' + (st.running ? 'pi-spin pi-spinner' : 'pi-check') + '"></i>' + (st.running ? 'Uygulanıyor…' : 'Uygula') + '</button>' : '') +
            '</div>' +
          '</div>' +
        '</div>';
    }

    // bulk-apply.service.ts: önce bütün canlı yazmalar, sonra dosyaya kalıcı yazma, en sonda geri okuma
    async function run() {
      if (st.running || !st.confirmed) return;
      st.running = true;
      const put = (op, patch) => { results.set(op.key, Object.assign({}, results.get(op.key) || { state: 'pending' }, patch)); render(); };
      for (const op of o.ops) { put(op, { state: 'running', message: 'canlı yazılıyor' }); await wait(220); op.apply(); }
      for (const op of o.ops) { put(op, { message: 'dosyaya yazılıyor' }); await wait(140); }
      for (const op of o.ops) {
        put(op, { message: 'doğrulanıyor' });
        await wait(260);
        const c = op.check();
        const failed = c.total === 0 || c.ok < c.total;
        put(op, { state: failed ? 'failed' : 'done', verifiedOk: c.ok, verifiedTotal: c.total,
          message: failed ? (c.total === 0 ? 'geri okunamadı' : 'bazı hedefler yeni değerde değil') : 'uygulandı ve doğrulandı' });
      }
      st.ok = Array.from(results.values()).filter(r => r.state === 'done').length;
      st.fail = Array.from(results.values()).filter(r => r.state === 'failed').length;
      st.running = false;
      st.done = true;
      render();
      DCIM.ui.toast(st.ok + ' işlem uygulandı ve doğrulandı.', st.fail ? 'warning' : 'success');
    }

    function close() {
      if (st.running) return;
      el.remove();
      document.removeEventListener('keydown', onKey);
      if (o.onClosed) o.onClosed(st.done);
    }
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', e => {
      if (e.target === el) { close(); return; }
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-close')) close();
      else if (b.hasAttribute('data-run')) run();
    });
    el.addEventListener('change', e => {
      if (e.target.hasAttribute('data-confirm')) { st.confirmed = e.target.checked; render(); }
    });
    render();
    if (o.autoRun) setTimeout(run, 300);
    return { close, el };
  }

  // Bekleyen değişiklik çubuğu (sayfanın altında sabit)
  function pendingBar(el, o) {
    if (!o.count) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-[2px] bg-slate-900 dark:bg-slate-800 text-white shadow-xl flex items-center gap-4 text-xs">' +
        '<span><strong>' + o.count + '</strong> ' + esc(o.unit || 'grupta') + ' değişiklik · <strong>' + fmt(o.devices) + '</strong> cihaz</span>' +
        (o.invalid ? '<span class="text-rose-300"><i class="pi pi-exclamation-triangle text-[10px] mr-1"></i>' + o.invalid + ' satırda sıra hatası</span>' : '') +
        '<button type="button" data-bar-clear class="text-slate-300 hover:text-white cursor-pointer">Temizle</button>' +
        '<button type="button" data-bar-preview class="px-3 py-1 rounded-[2px] bg-sky-600 hover:bg-sky-500 font-bold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"' + (o.invalid ? ' disabled' : '') + '>' +
          '<i class="pi pi-eye text-[11px]"></i>Önizle ve uygula</button>' +
      '</div>';
    el.querySelector('[data-bar-clear]').onclick = o.onClear;
    el.querySelector('[data-bar-preview]').onclick = o.onPreview;
  }

  // Derin bağlantı: ?floor=T00,T02  ?group=pdu  ?mode=pick  ?pick=<id>,<id>
  function scopeFromParams(params, grouped) {
    const s = emptyScope();
    if (!params) return s;
    const list = k => (params.get(k) || '').split(',').map(x => x.trim()).filter(Boolean);
    s.floors = list('floor');
    s.groups = list('group');
    const ids = list('pick');
    if (params.get('mode') === 'pick' || ids.length) {
      s.mode = 'pick';
      s.picked = grouped.filter(x => ids.includes(x.device.id)).map(x => x.device.key);
    }
    return s;
  }

  DCIM.engBulk = {
    emptyScope, groupDevices, candidates, selected, resolveTargets, distribution, distText, formatPeriod, fmt,
    PERIOD_OPTIONS, LEVEL_LABEL, QUERY_GROUPS, SAVE_GROUPS, ALARM_GROUPS, ALARM_PARAMS, RECOMMENDED, LIMIT_ATTR,
    POINT_LEVEL_NOTE, PDU_POINT_NOTE, thresholdOrderOk, buildQueryOps, buildSaveOps, buildAlarmOps,
    scope, plan, pendingBar, scopeFromParams, stepTitle, infoBox, chipCls, header, SEC_CLS, STATE_LABEL, STATE_DOT
  };
})();
