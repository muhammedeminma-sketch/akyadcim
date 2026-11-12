/* ==========================================================================
   DCIM Sunum — Ağ Bağlantılarını İçe Aktar mock verisi (DCIM.data.lnkImport)
   NewUICMPLnkImportComponent + LnkImportService (db_DAS_lnk.py / import_lnk.py) yerine geçer.
   Sunumda dosya okunmaz: "ornek_lnk.xlsx" kurgusal LNK çalışma kitabıdır (KAYNAK A–E / HEDEF F–L düzeni).
   Kabin kodları sunumun kurgusal yerleşiminden (1DA01…, 2EA05…, 3FA09…); personel sütunu boştur.
   Sonuç sınıfları ve gerekçe kodları importer sözleşmesiyle aynı adlardadır (DATA, INSERT_WITH_PORT_ISSUE,
   SKIP_DUPLICATE_IN_FILE, DEVICE_NOT_FOUND, CAT_PORT_NOT_FOUND …); sayılar kurgusaldır.
   API:
     lnkImport.env / target / maxFileMb / chunkKb / sample {name,size,sha,sheets}
     lnkImport.run(mode, params) → {data_records, selected_records, target, env, run_id, report_name, summary}
       mode: 'preview' | 'import'; params {sheet, rows, site}. İçe aktarmadan sonra yeniden önizleme
       eklenen satırları "Zaten kayıtlı" (SKIP_EXISTING) gösterir (yalnız sayfa ömrü boyunca).
     lnkImport.resultRows(params) → sonuç Excel'i satırları (özgün kolonlar + "Sonuçlar")
   Bağımlılık: js/mock-data.js (cabinets, layoutOf, rng, hash)
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  const SHEETS = ['LNK', 'Açıklamalar', 'Değişiklikler'];
  const SAMPLE = {
    name: 'ornek_lnk.xlsx', size: 214733,
    sha: '4f1c9a0e7d2b36a85c0e91f4b7a2d6c3e8f05a1b9c47d2e6f3a8b0c5d1e7f924', sheets: SHEETS
  };

  // Sınıf → importer sonuç kodu (outcome) ve sonuç Excel'i sınıfı (export cls)
  const CLASSES = [
    { cls: 'ok', outcome: 'INSERT', w: 52 },
    { cls: 'port', outcome: 'INSERT_WITH_PORT_ISSUE', w: 17, cat: 'PORT', reasons: ['CAT_PORT_NOT_FOUND', 'CAT_PORTS_MISSING', 'CAT_JSON_INVALID'] },
    { cls: 'existing', outcome: 'SKIP_EXISTING', w: 9 },
    { cls: 'file_dup', outcome: 'SKIP_DUPLICATE_IN_FILE', w: 2 },
    { cls: 'data', outcome: 'DATA', w: 17, cat: 'DATA', reasons: ['DEVICE_NOT_FOUND', 'EXCEL_DEVICE_UNPARSEABLE', 'DEVICE_AMBIGUOUS', 'PORT_LABEL_MISSING', 'EXCEL_U_MISSING', 'PORT_CONFLICT_IN_FILE'] },
    { cls: 'check', outcome: 'CHECK_DUPLICATE_UNCERTAIN', w: 3, cat: 'DATA', reasons: ['DUPLICATE_UNCERTAIN_EXISTING'] }
  ];
  const CLS_LABEL = { ok: 'Aktarıldı', port: 'Aktarıldı, port eşleşmedi', existing: 'Zaten kayıtlı', file_dup: 'Dosyada tekrar', data: 'Veri hatası', system: 'Sistem hatası', check: 'Kontrol edilmeli', not_processed: 'İşlenmedi', out_of_scope: 'Kapsam dışı' };
  const CLS_TONE = { ok: 'normal', port: 'warning', existing: 'info', file_dup: 'info', data: 'alarm', check: 'warning', out_of_scope: 'lost' };

  let ROWS = null;
  let imported = new Set();

  function cabsOf(digit) {
    if (digit === 1) return (D.cabinets || []).map(c => c.code);
    const L = D.layoutOf ? D.layoutOf(digit) : null;
    return L ? L.items.filter(i => i.type === 'cabinet').map(i => i.label) : [];
  }

  function build() {
    const rnd = D.rng(D.hash('lnk-import-sample-2026'));
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const total = CLASSES.reduce((a, c) => a + c.w, 0);
    const cabs = { 1: cabsOf(1), 2: cabsOf(2), 3: cabsOf(3) };
    const out = [];
    const N = 246;
    for (let i = 0; i < N; i++) {
      const kat = i < 120 ? 1 : i < 196 ? 2 : 3;
      const list = cabs[kat].length ? cabs[kat] : ['1DA01'];
      const src = pick(list);
      let dst = pick(list);
      if (dst === src) dst = list[(list.indexOf(src) + 3) % list.length];
      const u = 2 + Math.floor(rnd() * 38);
      const du = 2 + Math.floor(rnd() * 38);
      const fmt = Math.floor(rnd() * 4);
      const srcDev = fmt === 0 ? src + ' ' + u + 'U' : fmt === 1 ? src + ' U' + u : fmt === 2 ? src + ' ' + u + '-' + (u + 1) : src + '-SAN';
      const dstDev = (rnd() < 0.15 ? dst + ' ' + du + 'U DATA NIC' + (1 + Math.floor(rnd() * 2)) : dst + ' ' + du + 'U');
      let r = rnd() * total;
      let c = CLASSES[0];
      for (const k of CLASSES) { if (r < k.w) { c = k; break; } r -= k.w; }
      const day = 1 + Math.floor(rnd() * 27);
      const reason = c.reasons ? pick(c.reasons) : '';
      out.push({
        sheetRow: i + 3, kat: String(kat).padStart(2, '0'), salon: kat === 2 && rnd() < 0.4 ? '2' : '1', kabin: srcDev,
        srcPort: reason === 'PORT_LABEL_MISSING' ? '' : 'Port-' + (1 + Math.floor(rnd() * 48)),
        srcPatch: 'PP-' + src + '-' + String(1 + Math.floor(rnd() * 4)).padStart(2, '0'),
        dstPatch: 'PP-' + dst + '-' + String(1 + Math.floor(rnd() * 4)).padStart(2, '0'),
        farLabel: dst + '/' + (1 + Math.floor(rnd() * 24)), switchLabel: rnd() < 0.5 ? 'SW-' + dst.slice(0, 3) + '-' + (1 + Math.floor(rnd() * 4)) : '',
        cihaz: reason === 'EXCEL_DEVICE_UNPARSEABLE' ? dst + ' (raf üstü)' : dstDev,
        dstPort: 'Port-' + (1 + Math.floor(rnd() * 48)),
        workDate: String(day).padStart(2, '0') + '.10.2026', staff: '',
        cls: c.cls, outcome: c.outcome, cat: c.cat || '', reason,
        info: rnd() < 0.3 ? 'DEVICE_MATCHED_BY_TYPE' : rnd() < 0.5 ? 'PORT_NOT_EVALUATED' : ''
      });
    }
    return out;
  }

  const rows = () => (ROWS || (ROWS = build()));

  /** "3-20,25" → satır kümesi (veri 3. satırdan). Geçersizse null. */
  function parseRanges(text) {
    const t = String(text || '').trim();
    if (!t) return { all: true };
    const set = new Set();
    for (const part of t.split(',')) {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) return null;
      const a = +m[1], b = m[2] ? +m[2] : a;
      if (a < 3 || b < a) return null;
      for (let i = a; i <= Math.min(b, 5000); i++) set.add(i);
    }
    return { set };
  }

  function select(params) {
    const r = parseRanges(params.rows);
    const all = rows();
    const sel = !r || r.all ? all : all.filter(x => r.set.has(x.sheetRow));
    const outScope = params.site && !/^DCA/i.test(params.site);
    return sel.map(x => {
      if (outScope) return Object.assign({}, x, { cls: 'out_of_scope', outcome: 'OUT_OF_SCOPE', cat: 'DATA', reason: 'DEVICE_OUT_OF_SCOPE' });
      if (imported.has(x.sheetRow) && (x.cls === 'ok' || x.cls === 'port')) return Object.assign({}, x, { cls: 'existing', outcome: 'SKIP_EXISTING', cat: '', reason: '' });
      return x;
    });
  }

  function run(mode, params) {
    const sel = select(params);
    const outcome = {}, reasons = {};
    const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
    sel.forEach(x => {
      inc(outcome, x.outcome);
      if (x.cat && x.reason) { reasons[x.cat] = reasons[x.cat] || {}; inc(reasons[x.cat], x.reason); }
      if (x.info) { reasons.INFO = reasons.INFO || {}; inc(reasons.INFO, x.info); }
    });
    const summary = { outcome_counts: outcome, reason_counts: reasons, commit_unknown_count: 0, aborted: false };
    if (mode === 'import') {
      const ins = sel.filter(x => x.cls === 'ok' || x.cls === 'port');
      summary.lnk_inserted = ins.length;
      const faild = {};
      sel.forEach(x => { if (x.cls === 'port') inc(faild, 'PORT'); else if (x.cls === 'data' || x.cls === 'check') inc(faild, 'DATA'); });
      summary.lnk_faild_written = faild;
      ins.forEach(x => imported.add(x.sheetRow));
    }
    const stamp = new Date();
    const pad = n => String(n).padStart(2, '0');
    const id = stamp.getFullYear() + pad(stamp.getMonth() + 1) + pad(stamp.getDate()) + '-' + pad(stamp.getHours()) + pad(stamp.getMinutes()) + pad(stamp.getSeconds());
    return {
      data_records: rows().length, selected_records: sel.length, target: API.target, env: API.env,
      run_id: 'lnk-' + id, report_name: 'lnk_' + mode + '_' + id + '.json', summary
    };
  }

  function exportInfo(params) {
    const sel = select(params);
    const counts = {};
    sel.forEach(x => { counts[x.cls] = (counts[x.cls] || 0) + 1; });
    return { state: 'READY', name: 'ornek_lnk_sonuc.xlsx', size: 231402, counts, warnings: ['IMAGES_DROPPED', 'THREADED_COMMENTS'] };
  }

  // İçe aktarma sonrası "Sonuçlar" kolonu: içe aktarmanın gördüğü sınıf (eklenenler artık existing değil, ok/port)
  function resultRows(params, lastImportRows) {
    return (lastImportRows || select(params)).map(x => Object.assign({}, x, { result: CLS_LABEL[x.cls] + (x.reason ? ' (' + x.reason + ')' : ''), tone: CLS_TONE[x.cls] || 'normal' }));
  }

  const API = {
    env: 'prod',
    target: 'aymon_dcim@pg-sunum',
    maxFileMb: 10,
    chunkKb: 64,
    sample: SAMPLE,
    parseRanges,
    run,
    select,
    exportInfo,
    resultRows,
    clsLabel: CLS_LABEL,
    resetSession: () => { imported = new Set(); }
  };
  D.lnkImport = API;
})();
