/* ==========================================================================
   DCIM Sunum — Proje Envanteri mock verisi (DCIM.data.projectInventory)
   api.INV_project_stats() (db_DAS_api.js) yanıtının karşılığı:
     [{ doc: 'CMR/T00', data: [{ name, dev, bi, io }, ...] }, ...]
   Sayımlar mevcut sunum verisinden türetilir (tüm sayfalarla tutarlı):
     CMR/T00  KAT1   → SDP UPS girişleri (DCIM.data.ups × GIR1/GIR2) + klima panoları (DCIM.data.panels) + 2 genel cihaz
              IDC    → klimalar (DCIM.data.climates) + enerji analizörleri (DCIM.data.energy.meterTables satırları)
                       + redresör panelleri (DCIM.data.energy.rectifiers)
              HMI    → 3 PLC/HMI analizörü (sunum verisinde modellenmedi; proje XML'indeki sayılar)
              H_U_R  → redresör modülleri (redresör paneli × 4 modül: H_U_RA_M1..M4, H_U_RB_M1..M4)
              K1S1   → Kabin sensör ağ geçitleri; IO = kabin sensör IO'ları (cabinetMgr.sensorIos) + ağ geçidi durum IO'ları
     CMR/T01  PDU_POD / PDU_NS → Kat 1 PDU'ları (cabinetMgr.pduDevs, dev_loc 'POD' / 'NON-S'),
                       BI = PDU blokları (NFO, RTD, IN, OUT, OCP), IO = gerçek IO listeleri
              PMM    → Master Pano PMM-1
     CMR/T02..T04 K<n>A/B/C → <n>. kat kabin sıralarının (DCIM.data.floors; aynı salon yerleşimi) PDU'ları;
                       IO/BI sayıları Kat 1'deki aynı konumlu kabinin PDU'larından alınır
   pduDevs() tüm kabinler için ~0,5 sn sürdüğünden hesap parçalar halinde (setTimeout) yapılır ve önbelleklenir.
   ========================================================================== */
(function () {
  'use strict';

  const DCIM = (window.DCIM = window.DCIM || {});
  const D = DCIM.data;
  if (!D) return;

  // Proje XML'inden (P24A01_S01 db_CMR_T00.xml) alınan, sunum verisinde karşılığı olmayan cihaz başı ortalamalar
  const IO_PER = { sdp: 23, pano: 26, generic: 16, klm: 64, analyzer: 72, rect: 58, rectModule: 49, gateway: 4 };
  const HMI = { dev: 3, bi: 4, io: 646 };

  let cache = null;

  // PDU dev → { bi, io }  (bi: IO kimliğindeki blok öneki — NFO / RTD / IN / OUT / OCP)
  function pduStat(dv) {
    const blocks = {};
    dv.io.forEach(io => {
      const blk = io.id.replace(/^K\w+?_PDU_[AB]_/, '').split('_')[0].replace(/\d+$/, '');
      blocks[blk] = 1;
    });
    return { bi: Object.keys(blocks).length, io: dv.io.length };
  }

  function floor1Groups() {
    const E = D.energy || {};
    const ups = (D.ups || []).length;
    const panels = (D.panels || []).length;
    const climates = (D.climates || []).length;
    let meters = 0;
    try { (E.meterTables ? E.meterTables() : []).forEach(t => { meters += (t.rows || []).length; }); } catch (e) { meters = 0; }
    let rect = 0;
    try { rect = (E.rectifiers ? E.rectifiers() : []).length; } catch (e) { rect = 0; }
    const sensorIo = (D.cabinets || []).reduce((s, c) => s + (D.cabinetMgr ? D.cabinetMgr.sensorIos(c.code).length : 6), 0);
    const kat1Dev = ups * 2 + panels + 2;
    const gateways = 3;
    return [
      { name: 'KAT1', dev: kat1Dev, bi: kat1Dev, io: ups * 2 * IO_PER.sdp + panels * IO_PER.pano + 2 * IO_PER.generic },
      { name: 'IDC', dev: climates + meters + rect, bi: climates + meters * 2 + rect * 2, io: climates * IO_PER.klm + meters * IO_PER.analyzer + rect * IO_PER.rect },
      { name: 'HMI', dev: HMI.dev, bi: HMI.bi, io: HMI.io },
      { name: 'H_U_R', dev: rect * 4, bi: rect * 4 * 4, io: rect * 4 * IO_PER.rectModule },
      { name: 'K1S1', dev: gateways, bi: gateways * 4, io: sensorIo + gateways * IO_PER.gateway }
    ];
  }

  // Diğer katların kabin kodları (aynı yerleşim: kat hanesi + etiketin kalanı)
  function floorCodes(digit) {
    const items = D.layout && D.layout.items ? D.layout.items.filter(it => it.type === 'cabinet') : [];
    return items.map(it => digit + it.label.slice(1));
  }

  // done(result) — result: INV_project_stats JSON'unun ayrıştırılmış hâli
  // Dönüş: iptal fonksiyonu
  function stats(done) {
    if (cache) { const t = setTimeout(() => done(cache), 0); return () => clearTimeout(t); }
    const cabs = (D.cabinets || []).slice();
    const byPos = {};           // '<etiket kalanı>' → { dev, bi, io }  (Kat 1 kabinin PDU toplamı)
    const pod = { name: 'PDU_POD', dev: 0, bi: 0, io: 0 };
    const ns = { name: 'PDU_NS', dev: 0, bi: 0, io: 0 };
    let i = 0;
    let timer = null;
    let cancelled = false;
    const CHUNK = 16;

    function step() {
      if (cancelled) return;
      const end = Math.min(cabs.length, i + CHUNK);
      for (; i < end; i++) {
        const c = cabs[i];
        const devs = D.cabinetMgr ? D.cabinetMgr.pduDevs(c.code) : [];
        const tot = { dev: 0, bi: 0, io: 0 };
        devs.forEach(dv => {
          const s = pduStat(dv);
          const loc = String(dv.dev_loc || '');
          const g = loc.indexOf('NON-S') >= 0 ? ns : loc.indexOf('POD') >= 0 ? pod : (/^NS/.test(c.pod) ? ns : pod);
          g.dev++; g.bi += s.bi; g.io += s.io;
          tot.dev++; tot.bi += s.bi; tot.io += s.io;
        });
        byPos[c.code.slice(1)] = tot;
      }
      if (i < cabs.length) { timer = setTimeout(step, 0); return; }
      finish();
    }

    function floorGroups(digit, rows) {
      const codes = floorCodes(digit);
      return rows.map(r => {
        const g = { name: 'K' + digit + r, dev: 0, bi: 0, io: 0 };
        codes.filter(code => code.charAt(1) === r).forEach(code => {
          const t = byPos[code.slice(1)] || { dev: 2, bi: 10, io: 0 };
          g.dev += t.dev; g.bi += t.bi; g.io += t.io;
        });
        return g;
      });
    }

    function finish() {
      cache = [
        { doc: 'CMR/T00', data: floor1Groups() },
        { doc: 'CMR/T01', data: [pod, ns, { name: 'PMM', dev: 1, bi: 12, io: 543 }] },
        { doc: 'CMR/T02', data: floorGroups(2, ['A', 'B', 'C']) },
        { doc: 'CMR/T03', data: floorGroups(3, ['A', 'B', 'C']) },
        { doc: 'CMR/T04', data: floorGroups(4, ['A', 'B']) }
      ];
      done(cache);
    }

    timer = setTimeout(step, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }

  D.projectInventory = { stats };
})();
