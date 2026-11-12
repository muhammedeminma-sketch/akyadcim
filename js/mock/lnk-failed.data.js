/* ==========================================================================
   DCIM Sunum — Import Hata Kayıtları mock verisi (DCIM.data.lnkFailed)
   dbo.LNK_FAILD satırlarının (TASK-001 şeması) kurgusal karşılığı:
     faild_id, created_at, import_group, source_file, source_sheet, source_record_no, source_row_no,
     failure_category (DATA|PORT|SYSTEM), reason_code, reason_detail (JSON), failed_end (src|dst|both|row),
     src/dst_asm_id, src/dst_asset_id, src/dst_port_id, lnk_id, raw_cells (JSON), source_sha256
   Gerekçe kodları ve Excel kolon düzeni import_lnk.py sözleşmesiyle aynıdır; tüm değerler (kabinler,
   asset/asm kimlikleri, port etiketleri, dosya adları, personel) kurgusal ve tohumludur.
   Bağımlılık: js/layout-data.js (kabin kodları), js/mock-data.js (DCIM.data.rng / hash)
   ========================================================================== */
(function () {
  'use strict';

  const D = window.DCIM.data;
  const rnd = D.rng(D.hash('lnk-failed-2026'));
  const pick = arr => arr[Math.floor(rnd() * arr.length) % arr.length];
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const NOW = Date.now();
  const pad = n => String(n).padStart(2, '0');
  const isoLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  const hex = n => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'.charAt(Math.floor(rnd() * 16)); return s; };

  // Kurgusal bina: kat → salon → kabin kodları
  const FLOORS = (window.DCIM_FLOOR_LAYOUTS || []).map(f => ({
    floor: f.floor,
    salons: f.salons.map(s => ({ id: s.id, no: Number(String(s.id).replace(/\D/g, '')) || 1, cabs: f.items.filter(i => i.type === 'cabinet' && i.salon === s.id).map(i => i.label || i.id) }))
  }));
  const locPath = (floor, salonNo, cab) => 'DCA/FLOOR-' + floor + '/SALOON-' + salonNo + '/' + (cab ? cab + '/' : '');

  // Cihaz türleri (Excel CİHAZ BİLGİSİ / KABİN hücrelerinde serbest metin)
  const DEVICE_KINDS = ['SW', 'SAN Switch', 'FW', 'RTR', 'SRV', 'Patch Panel', 'ODF', 'Storage'];
  const PORT_LABELS = () => pick([
    'Gi1/0/' + int(1, 48), 'Te1/1/' + int(1, 4), 'Eth1/' + int(1, 32), 'Port-' + int(1, 48), 'LC-' + pad(int(1, 24)), 'MGMT', 'iDRAC', 'FC' + int(0, 7)
  ]);
  const PEOPLE = ['Burak Şahin', 'Mehmet Kaya', 'Ayşe Demir', 'Emre Çelik', 'Can Öztürk', 'Gökhan Polat'];

  // Import grupları (her biri ayrı bir Excel çalıştırması)
  const GROUPS = [
    { id: 'LNKIMP-local-20261021-1012-' + hex(6), file: 'LNK_DCA_Kat1_Fiber.xlsx', sheet: 'KAT-1', floor: 1, daysAgo: 21, n: 46 },
    { id: 'LNKIMP-local-20261028-1430-' + hex(6), file: 'LNK_DCA_Kat2_Bakir.xlsx', sheet: 'KAT-2 SALON-1', floor: 2, daysAgo: 14, n: 38 },
    { id: 'LNKIMP-local-20261103-0915-' + hex(6), file: 'LNK_DCA_Kat3_Uplink.xlsx', sheet: 'KAT-3', floor: 3, daysAgo: 8, n: 31 },
    { id: 'LNKIMP-local-20261110-1640-' + hex(6), file: 'LNK_DCA_Kat1_Ek.xlsx', sheet: 'EK-LISTE', floor: 1, daysAgo: 1, n: 19 }
  ];

  // Gerekçe şablonları: [kod, kategori, ağırlık]
  const REASONS = [
    ['DEVICE_NOT_FOUND', 'DATA', 16], ['DEVICE_AMBIGUOUS', 'DATA', 9], ['DEVICE_OUT_OF_SCOPE', 'DATA', 4],
    ['EXCEL_DEVICE_UNPARSEABLE', 'DATA', 8], ['EXCEL_U_MISSING', 'DATA', 5], ['KAT_SALON_INVALID', 'DATA', 3],
    ['LOCATION_NOT_FOUND', 'DATA', 2], ['PORT_LABEL_MISSING', 'DATA', 4], ['DUPLICATE_UNCERTAIN_EXISTING', 'DATA', 3],
    ['PORT_CONFLICT_EXISTING', 'DATA', 3], ['DEVICE_LOCATION_UNRESOLVED', 'DATA', 2], ['ENDPOINTS_IDENTICAL', 'DATA', 1],
    ['CAT_PORT_NOT_FOUND', 'PORT', 14], ['CAT_PORT_AMBIGUOUS', 'PORT', 4], ['CAT_MODEL_MISSING', 'PORT', 5],
    ['CAT_JSON_MISSING', 'PORT', 2], ['CAT_PORTS_INVALID', 'PORT', 1]
  ];
  const W_TOTAL = REASONS.reduce((s, r) => s + r[2], 0);
  const pickReason = () => { let x = rnd() * W_TOTAL; for (const r of REASONS) { x -= r[2]; if (x <= 0) return r; } return REASONS[0]; };

  let asmSeq = 41200;
  let lnkSeq = 18340;
  const assetId = (kind, cab) => (kind === 'SRV' ? 'SRV' : kind === 'Patch Panel' || kind === 'ODF' ? 'PP' : kind === 'Storage' ? 'STR' : kind === 'FW' ? 'FW' : kind === 'RTR' ? 'RTR' : 'SW') +
    '-' + cab + '-' + pad(int(1, 42));

  function endpoint(g, salon) {
    const cab = pick(salon.cabs);
    const kind = pick(DEVICE_KINDS);
    const u = int(1, 42);
    return { cab, kind, u, label: cab + ' U' + u + ' ' + kind, asmId: String(++asmSeq * 3 + int(0, 2)), assetId: assetId(kind, cab), port: PORT_LABELS(), floor: g.floor, salonNo: salon.no };
  }

  function candidateList(ep, count, opts) {
    const o = opts || {};
    const list = [];
    for (let i = 0; i < count; i++) {
      const otherFloor = o.outside && i % 2 === 0;
      const fl = otherFloor ? (ep.floor === 1 ? 2 : 1) : ep.floor;
      list.push({
        asm_id: String(Number(ep.asmId) + 7 + i * 11),
        asset_id: i === 1 && o.missingAsset ? '' : assetId(ep.kind, ep.cab).replace(/-\d+$/, '-' + pad(ep.u + i)),
        location_id: 'LC' + String(1020100000 + fl * 10000 + ep.salonNo * 100 + i),
        location_full_name: locPath(fl, ep.salonNo, ep.cab),
        scope: o.unresolved && i === count - 1 ? 'unresolved' : otherFloor ? 'outside' : 'inside',
        note: i === 0 ? 'uplace ' + ep.u + '-' + (ep.u + 1) : ''
      });
    }
    return list;
  }

  function buildDetail(code, cat, end, src, dst, g, salon) {
    const failEp = end === 'dst' ? dst : src;
    const endName = end === 'dst' ? 'hedef' : 'kaynak';
    const issues = [];
    let detail = '';
    switch (code) {
      case 'DEVICE_NOT_FOUND': detail = failEp.cab + ' kabininde başlangıç U' + failEp.u + ' ile eşleşen ASM kaydı yok (kapsamda ' + int(3, 14) + ' cihaz; en yakın U' + (failEp.u + int(1, 3)) + ')'; break;
      case 'DEVICE_AMBIGUOUS': detail = 'Kapsam içinde ' + failEp.cab + ' + U' + failEp.u + ' için 2 aday ASM var; hiçbiri seçilmedi'; break;
      case 'DEVICE_OUT_OF_SCOPE': detail = failEp.cab + ' + U' + failEp.u + ' yalnız satırın KAT/SALON kapsamı dışındaki konumlarda bulundu'; break;
      case 'EXCEL_DEVICE_UNPARSEABLE': detail = '"' + failEp.cab.slice(1) + ' ' + failEp.u + '" kabin belirteci okunamadı (harf ve rakam birlikte olmalı)'; break;
      case 'EXCEL_U_MISSING': detail = failEp.cab + ' hücresinde U bilgisi yok'; break;
      case 'KAT_SALON_INVALID': detail = 'KAT/SALON hücresi sayı değil: "' + pick(['K1', 'Zemin', '1A', '-']) + '"'; break;
      case 'LOCATION_NOT_FOUND': detail = 'FLOOR-' + g.floor + '/SALOON-' + (salon.no + 3) + ' yolunda LOC kaydı yok'; break;
      case 'PORT_LABEL_MISSING': detail = endName + ' uç PORT BİLGİSİ hücresi boş'; break;
      case 'DUPLICATE_UNCERTAIN_EXISTING': detail = 'Aynı uç çifti LNK\'de port bilgisi belirsiz bir kayıtla zaten var (lnk_id ' + (lnkSeq - int(200, 900)) + ')'; break;
      case 'PORT_CONFLICT_EXISTING': detail = failEp.port + ' portu başka bir bağlantıda kullanılıyor (lnk_id ' + (lnkSeq - int(50, 400)) + ')'; break;
      case 'DEVICE_LOCATION_UNRESOLVED': detail = 'Aday ASM\'nin location_id değeri LOC\'ta yok; kapsam içinde olup olmadığı bilinemiyor'; break;
      case 'ENDPOINTS_IDENTICAL': detail = 'Kaynak ve hedef aynı cihaz/port'; break;
      case 'CAT_PORT_NOT_FOUND': detail = 'CAT modelinde "' + failEp.port + '" etiketli port yok (model ' + int(2100, 2260) + ')'; break;
      case 'CAT_PORT_AMBIGUOUS': detail = '"' + failEp.port + '" etiketi CAT modelinde ön ve arka yüzde iki porta uyuyor'; break;
      case 'CAT_MODEL_MISSING': detail = 'ASM ' + failEp.asmId + ' kaydının model_id değeri boş; port eşlemesi yapılamadı'; break;
      case 'CAT_JSON_MISSING': detail = 'CAT modelinin port çizim JSON\'u yok'; break;
      case 'CAT_PORTS_INVALID': detail = 'CAT ports dizisi okunamadı (ports alanı nesne değil)'; break;
      default: detail = code;
    }
    issues.push({ code, category: cat, end, detail });
    // Ek INFO gerekçeleri (bazı satırlarda)
    if (rnd() < 0.3) issues.push({ code: 'DEVICE_MATCHED_BY_TYPE', category: 'INFO', end: end === 'src' ? 'dst' : 'src', detail: 'Uç cihaz türüyle (' + (end === 'src' ? dst : src).kind + ') eşleşti' });
    if (cat === 'PORT') issues.push({ code: 'PORT_NOT_EVALUATED', category: 'INFO', end: end === 'src' ? 'dst' : 'src', detail: 'Diğer uç portu değerlendirildi; sorun yok' });

    const reason = {
      issues,
      excel: {
        src_kat: String(g.floor).padStart(2, '0'), src_salon: String(salon.no).padStart(2, '0'),
        src_device: code === 'EXCEL_DEVICE_UNPARSEABLE' && end === 'src' ? src.cab.slice(1) + ' ' + src.u : src.label,
        src_port: code === 'PORT_LABEL_MISSING' && end === 'src' ? '' : src.port,
        dst_device: code === 'EXCEL_DEVICE_UNPARSEABLE' && end === 'dst' ? dst.cab.slice(1) + ' ' + dst.u : dst.label,
        dst_port: code === 'PORT_LABEL_MISSING' && end === 'dst' ? '' : dst.port
      },
      resolved: {}
    };
    const resolveSrc = !(end === 'src' || end === 'both') || cat === 'PORT';
    const resolveDst = !(end === 'dst' || end === 'both') || cat === 'PORT';
    if (resolveSrc) reason.resolved.src = { asm_id: src.asmId, asset_id: src.assetId, cabinet: src.cab, u_start: src.u, location_id: 'LC' + (1020100000 + g.floor * 10000 + salon.no * 100), port_id: cat === 'PORT' && end === 'src' ? null : src.port };
    if (resolveDst) reason.resolved.dst = { asm_id: dst.asmId, asset_id: dst.assetId, cabinet: dst.cab, u_start: dst.u, port_id: cat === 'PORT' && end === 'dst' ? null : dst.port };
    if (code.indexOf('DUPLICATE') === 0 || code.indexOf('PORT_CONFLICT') === 0) reason.related_lnk_ids = [lnkSeq - int(10, 900)];

    // TASK-003/004: konum kapsamı + aday özeti
    if (cat === 'DATA') {
      reason.location_scope = {
        mode: g.floor === 3 ? 'site' : 'all', site_location_id: g.floor === 3 ? 'LC0102010000000000' : '',
        kat: String(g.floor), salon: String(salon.no),
        src_scope: 'Excel KAT/SALON salon yolları (' + (g.floor === 3 ? 'DCA' : 'tüm tesisler') + ')',
        dst_scope: g.floor === 3 ? 'hedef: seçili tesis kökü DCA ve altı (KAT/SALON sınırı yok)' : 'hedef: tüm geçerli LOC konumları (KAT/SALON sınırı yok)',
        salon_path_count: g.floor === 1 ? 2 : 1,
        salon_paths: g.floor === 1 ? [locPath(1, salon.no), 'DCB/FLOOR-1/SALOON-' + salon.no + '/'] : [locPath(g.floor, salon.no)]
      };
      if (['DEVICE_AMBIGUOUS', 'DEVICE_OUT_OF_SCOPE', 'DEVICE_NOT_FOUND', 'DEVICE_LOCATION_UNRESOLVED'].indexOf(code) >= 0) {
        const n = code === 'DEVICE_AMBIGUOUS' ? int(2, 3) : code === 'DEVICE_NOT_FOUND' ? 0 : code === 'DEVICE_LOCATION_UNRESOLVED' ? 2 : int(1, 2);
        const listed = n ? candidateList(failEp, n, { outside: code === 'DEVICE_OUT_OF_SCOPE', unresolved: code === 'DEVICE_LOCATION_UNRESOLVED', missingAsset: code === 'DEVICE_AMBIGUOUS' && rnd() < 0.3 }) : [];
        const cnt = s => listed.filter(x => x.scope === s).length;
        reason.candidates = {};
        reason.candidates[end === 'dst' ? 'dst' : 'src'] = {
          device: failEp.label, scope: end === 'dst' ? reason.location_scope.dst_scope : 'FLOOR-' + g.floor + '/SALOON-' + salon.no,
          scope_basis: end === 'dst' ? 'asm_location' : 'excel_kat_salon',
          total: listed.length, in_scope: cnt('inside'), outside_scope: cnt('outside'), location_unresolved: cnt('unresolved'), location_conflict: 0,
          listed
        };
      }
    }
    return reason;
  }

  function rawCells(g, salon, src, dst, code, end) {
    const date = new Date(NOW - (g.daysAgo + int(3, 40)) * 86400000);
    const dstr = pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear();
    const kat = code === 'KAT_SALON_INVALID' ? pick(['K1', 'Zemin', '1A']) : String(g.floor).padStart(2, '0');
    const srcDev = code === 'EXCEL_DEVICE_UNPARSEABLE' && end === 'src' ? src.cab.slice(1) + ' ' + src.u : code === 'EXCEL_U_MISSING' && end === 'src' ? src.cab + ' ' + src.kind : src.label;
    const dstDev = code === 'EXCEL_DEVICE_UNPARSEABLE' && end === 'dst' ? dst.cab.slice(1) + ' ' + dst.u : code === 'EXCEL_U_MISSING' && end === 'dst' ? dst.cab + ' ' + dst.kind : dst.label;
    const cells = [
      ['A', 'KAYNAK', 'KAT', kat], ['B', 'KAYNAK', 'SALON', String(salon.no).padStart(2, '0')], ['C', 'KAYNAK', 'KABİN', srcDev],
      ['D', 'KAYNAK', 'PORT BİLGİSİ', code === 'PORT_LABEL_MISSING' && end === 'src' ? '' : src.port],
      ['E', 'KAYNAK', 'KAYNAK PATCH PANEL', 'PP-' + src.cab + '-' + pad(int(1, 4)) + ' / ' + int(1, 24)],
      ['F', 'HEDEF', 'HEDEF PATCH PANEL', 'PP-' + dst.cab + '-' + pad(int(1, 4)) + ' / ' + int(1, 24)],
      ['G', 'HEDEF', 'KARŞI UÇ ETİKET BİLGİSİ', src.cab + '-' + dst.cab + '-' + pad(int(1, 96))],
      ['H', 'HEDEF', 'SWİTCH ETİKET BİLGİSİ', dst.kind === 'SW' || dst.kind === 'SAN Switch' ? dst.assetId : ''],
      ['I', 'HEDEF', 'CİHAZ BİLGİSİ', dstDev],
      ['J', 'HEDEF', 'PORT BİLGİSİ', code === 'PORT_LABEL_MISSING' && end === 'dst' ? '' : dst.port],
      ['K', 'HEDEF', 'ÇALIŞMA TARİHİ', dstr],
      ['L', 'HEDEF', 'ÇALIŞMAYI YAPAN PERSONEL', pick(PEOPLE)]
    ].map(c => ({ col: c[0], group: c[1], header: c[2], value: c[3] }));
    const out = { cells };
    if (rnd() < 0.08) out.extra_cells = { M: 'not: ' + pick(['yedek hat', 'geçici', 'kontrol edilecek']) };
    return out;
  }

  const rows = [];
  let faildId = 3100;
  let sheetRowBase = {};
  GROUPS.forEach(g => {
    const fl = FLOORS.find(f => f.floor === g.floor) || FLOORS[0];
    sheetRowBase[g.id] = 3;
    let t = NOW - g.daysAgo * 86400000;
    for (let i = 0; i < g.n; i++) {
      t += int(9, 40) * 1000;
      const salon = pick(fl.salons);
      const src = endpoint(g, salon);
      const dst = endpoint(g, pick(fl.salons));
      const [code, cat] = pickReason();
      let end = cat === 'PORT' ? pick(['src', 'dst', 'dst']) : pick(['src', 'src', 'dst', 'both']);
      if (code === 'KAT_SALON_INVALID' || code === 'LOCATION_NOT_FOUND') end = 'src';
      if (code === 'ENDPOINTS_IDENTICAL' || code.indexOf('DUPLICATE') === 0) end = 'both';
      const recordNo = i + 1 + int(0, 3) + i * int(1, 3);
      const sheetRow = recordNo + 2 + Math.floor(recordNo / 9);
      const reason = buildDetail(code, cat, end, src, dst, g, salon);
      const lnkId = cat === 'PORT' ? ++lnkSeq : null;
      const srcResolved = !!reason.resolved.src;
      const dstResolved = !!reason.resolved.dst;
      rows.push({
        faildId: ++faildId,
        createdAt: isoLocal(new Date(t)), _t: t,
        importGroup: g.id, sourceFile: g.file, sourceSheet: g.sheet, sourceRecordNo: recordNo, sourceRowNo: sheetRow,
        category: cat, reasonCode: code, reason, failedEnd: end,
        srcAsmId: srcResolved ? src.asmId : '', srcAssetId: srcResolved ? src.assetId : '', srcPortId: srcResolved && !(cat === 'PORT' && end === 'src') ? src.port : '',
        dstAsmId: dstResolved ? dst.asmId : '', dstAssetId: dstResolved ? dst.assetId : '', dstPortId: dstResolved && !(cat === 'PORT' && end === 'dst') ? dst.port : '',
        lnkId,
        raw: rawCells(g, salon, src, dst, code, end),
        sourceSha256: hex(64)
      });
      // ilişkili mükerrer satır: aynı uç bir sonraki kayıtta tekrar
      if (code === 'DUPLICATE_UNCERTAIN_EXISTING') reason.related_sheet_rows = [sheetRow + int(1, 6)];
    }
  });

  // SYSTEM kayıtları: commit öncesi DB hatası (satır kalıcı değil)
  const sysGroup = GROUPS[1];
  [['DB_INSERT_FAILED', 'LNK_INSERT', '229', 'INSERT yetkisi reddedildi (dbo.LNK)'], ['DB_DEADLOCK', 'LNK_INSERT', '1205', 'İşlem kilitlenme kurbanı seçildi']].forEach((s, i) => {
    const salon = FLOORS[1].salons[0];
    const src = endpoint(sysGroup, salon), dst = endpoint(sysGroup, salon);
    rows.push({
      faildId: ++faildId,
      createdAt: isoLocal(new Date(NOW - (sysGroup.daysAgo - 0.02 * (i + 1)) * 86400000)), _t: NOW - (sysGroup.daysAgo - 0.02 * (i + 1)) * 86400000,
      importGroup: sysGroup.id, sourceFile: sysGroup.file, sourceSheet: sysGroup.sheet, sourceRecordNo: 40 + i, sourceRowNo: 46 + i * 2,
      category: 'SYSTEM', reasonCode: s[0],
      reason: { issues: [{ code: s[0], category: 'SYSTEM', end: 'row', detail: s[3] }], excel: { src_device: src.label, dst_device: dst.label }, resolved: {}, system_error: { stage: s[1], code: s[2] } },
      failedEnd: 'row', srcAsmId: '', srcAssetId: '', srcPortId: '', dstAsmId: '', dstAssetId: '', dstPortId: '', lnkId: null,
      raw: rawCells(sysGroup, salon, src, dst, s[0], 'row'), sourceSha256: hex(64)
    });
  });

  // Eski (TASK-002 öncesi) bir kayıt: reason_detail JSON değil → ayrıntıda ham metin gösterilir
  rows.push({
    faildId: 3088, createdAt: isoLocal(new Date(NOW - 34 * 86400000)), importGroup: 'LNKIMP-legacy-20261008', sourceFile: 'LNK_eski_liste.xlsx', sourceSheet: 'Sayfa1',
    sourceRecordNo: 12, sourceRowNo: 14, category: 'DATA', reasonCode: 'DEVICE_NOT_FOUND',
    reasonText: 'src: 1DC04 U22 SW bulunamadi (eski importer 1.2 metin ciktisi)', failedEnd: 'src',
    srcAsmId: '', srcAssetId: '', srcPortId: '', dstAsmId: '', dstAssetId: 'SW-1DC09-14', dstPortId: 'Gi1/0/7', lnkId: null,
    rawText: 'C=1DC04 U22 SW; D=Gi1/0/12; I=1DC09 U14 SW; J=Gi1/0/7', sourceSha256: ''
  });

  // faild_id importer yazım sırasıdır (IDENTITY): zaman sırasına göre yeniden numarala
  rows.filter(r => r._t != null).sort((a, b) => a._t - b._t).forEach((r, i) => { r.faildId = 3101 + i; delete r._t; });
  rows.sort((a, b) => b.faildId - a.faildId);
  D.lnkFailed = {
    rows,
    groups: GROUPS.map(g => ({ importGroup: g.id, count: rows.filter(r => r.importGroup === g.id).length, lastId: Math.max.apply(null, rows.filter(r => r.importGroup === g.id).map(r => r.faildId)) }))
      .concat([{ importGroup: 'LNKIMP-legacy-20261008', count: 1, lastId: 3088 }])
  };
})();
