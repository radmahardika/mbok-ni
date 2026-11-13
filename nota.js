// Nota titip & nota pembayaran: satu susunan isi, dipakai untuk teks WhatsApp,
// gambar nota, dan tampilan di aplikasi.
import { PRODUCTS, storeById, noteTotalQty, noteTotalMoney, paidOf } from './data.js';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function tanggal(iso, withDay = true) {
  const d = new Date(iso);
  const t = `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  return withDay ? `${HARI[d.getDay()]}, ${t}` : t;
}

export const jam = (iso) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

export const rupiah = (n) => 'Rp' + Math.round(n).toLocaleString('id-ID');

const rowsOf = (qtyMap, prices) =>
  PRODUCTS.filter((p) => qtyMap && qtyMap[p.id] > 0).map((p) => ({
    p,
    qty: qtyMap[p.id],
    sub: prices && prices[p.id] ? `${p.size} · ${rupiah(prices[p.id])}/bks` : p.size,
  }));

export function payState(n) {
  if (n.type !== 'cek') return null;
  const sold = Object.values(n.sold).reduce((a, b) => a + b, 0);
  if (!sold) return { text: 'Tidak ada yang perlu dibayar', tone: 'ok' };
  if (n.amount == null) return { text: 'Belum dibayar', tone: 'warn' };
  const paid = paidOf(n);
  if (paid >= n.amount) return { text: 'LUNAS', tone: 'ok' };
  if (paid > 0) return { text: `Dibayar ${rupiah(paid)}, kurang ${rupiah(n.amount - paid)}`, tone: 'warn' };
  return { text: 'Belum dibayar', tone: 'warn' };
}

// Susunan isi nota.
export function notaDoc(n) {
  const store = storeById(n.storeId);
  const base = {
    no: n.no,
    date: n.createdAt,
    store: store ? store.name : '-',
    storeLabel: 'Toko',
    receiver: n.receiver || '',
  };
  if (n.type === 'datang') {
    return {
      ...base,
      title: 'Barang Datang',
      store: n.courier || '-',
      storeLabel: 'Travel',
      receiver: '',
      sections: [{ title: '', rows: rowsOf(n.items) }],
      totals: [['Jumlah', `${noteTotalQty(n)} bungkus`]],
      status: null,
    };
  }
  if (n.type === 'cek' && n.shopee) {
    const sh = n.shopee;
    const rows = [];
    if (sh.pecel) rows.push({ p: { name: 'Bumbu Pecel (semua rasa)', size: '100 g', color: '#e07b1f' }, qty: sh.pecel, sub: '100 g' });
    if (sh.kacang) rows.push({ p: { name: 'Bumbu Kacang / Gado-gado', size: '200 g', color: '#7a4a1f' }, qty: sh.kacang, sub: '200 g' });
    const qty = sh.pecel + sh.kacang;
    const totals = [['Laku', `${qty} bungkus`]];
    if (n.amount) totals.push(['Setoran', rupiah(n.amount)]);
    const paid = paidOf(n);
    if (paid) totals.push(['Dibayar', rupiah(paid)]);
    const days = sh.fromDay && sh.fromDay !== sh.lastDay ? `tgl ${sh.fromDay}–${sh.lastDay}` : `tgl ${sh.lastDay}`;
    return {
      ...base,
      title: 'Nota Pembayaran',
      receiverLabel: 'Periode',
      receiver: `${sh.label}, ${days}`,
      sections: [{ title: 'Laku di Shopee', rows }],
      empty: qty ? '' : 'Belum ada penjualan baru.',
      totals,
      status: payState(n),
    };
  }
  if (n.type === 'cek') {
    const sisa = {};
    for (const p of PRODUCTS) {
      const v = (n.counted[p.id] || 0) - (n.pulled[p.id] || 0);
      if (v > 0) sisa[p.id] = v;
    }
    const soldQty = Object.values(n.sold).reduce((a, b) => a + b, 0);
    const pulledQty = Object.values(n.pulled).reduce((a, b) => a + b, 0);
    const totals = [['Laku', `${soldQty} bungkus`]];
    if (n.amount != null && soldQty) totals.push(['Total', rupiah(n.amount)]);
    const paid = paidOf(n);
    if (paid) totals.push(['Dibayar', rupiah(paid)]);
    return {
      ...base,
      title: 'Nota Pembayaran',
      receiverLabel: 'Petugas toko',
      sections: [
        { title: 'Laku', rows: rowsOf(n.sold, n.prices) },
        { title: 'Ditarik (barang lama/rusak)', rows: rowsOf(n.pulled) },
        { title: 'Sisa di rak', rows: rowsOf(sisa) },
      ].filter((s) => s.rows.length),
      empty: !soldQty && !pulledQty ? 'Belum ada yang laku.' : '',
      totals,
      status: payState(n),
    };
  }
  const total = noteTotalMoney(n);
  const totals = [['Jumlah', `${noteTotalQty(n)} bungkus`]];
  if (total != null) totals.push(['Nilai titipan', rupiah(total)]);
  return {
    ...base,
    title: 'Nota Titip Barang',
    receiverLabel: 'Diterima oleh',
    sections: [{ title: '', rows: rowsOf(n.items, n.prices) }],
    totals,
    status: null,
  };
}

export function notaText(n) {
  const d = notaDoc(n);
  const out = [`*${d.title.toUpperCase()} — MBOK NI*`, `No: *${d.no}*`, `Tanggal: ${tanggal(d.date)}`, `${d.storeLabel}: ${d.store}`];
  if (d.receiver) out.push(`${d.receiverLabel}: *${d.receiver}*`);
  for (const s of d.sections) {
    out.push('');
    if (s.title) out.push(`_${s.title}:_`);
    for (const r of s.rows) out.push(`• ${r.p.name} ${r.p.size}: *${r.qty} bks*`);
  }
  if (d.empty) out.push('', d.empty);
  out.push('');
  for (const [k, v] of d.totals) out.push(`${k}: *${v}*`);
  if (d.status) out.push(`Status: *${d.status.text}*`);
  out.push('', 'Mohon nota ini disimpan nggih. Matur nuwun 🙏', '— Mbok Ni');
  return out.join('\n');
}

export function waLink(n) {
  const store = storeById(n.storeId);
  const text = encodeURIComponent(notaText(n));
  return store && store.wa ? `https://wa.me/${store.wa}?text=${text}` : `https://wa.me/?text=${text}`;
}

// Gambar nota 1080px, warna khas Mbok Ni.
export async function notaImage(n) {
  const d = notaDoc(n);
  const W = 1080;
  const rowsCount = d.sections.reduce((a, s) => a + s.rows.length, 0);
  const titles = d.sections.filter((s) => s.title).length;
  const H =
    470 + (d.receiver ? 60 : 0) + rowsCount * 110 + titles * 70 + (d.empty ? 80 : 0) + d.totals.length * 75 + (d.status ? 110 : 0) + 160;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const right = (text, x, y) => {
    g.textAlign = 'right';
    g.fillText(text, x, y);
    g.textAlign = 'left';
  };

  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, W, H);

  // kepala hijau dengan tepi bergerigi seperti stiker Mbok Ni
  g.fillStyle = '#5aa832';
  g.fillRect(0, 0, W, 230);
  g.fillStyle = '#f4ef8d';
  for (let x = 0; x < W + 40; x += 40) {
    g.beginPath();
    g.arc(x, 230, 20, 0, Math.PI);
    g.fill();
  }
  g.font = font(900, 96);
  g.fillText('MBOK NI', 60, 135);
  g.font = font(600, 36);
  g.fillText(d.title, 60, 190);
  g.font = font(800, 44);
  right(d.no, W - 60, 120);
  g.font = font(500, 32);
  right(tanggal(d.date), W - 60, 175);

  g.fillStyle = '#3a2314';
  g.font = font(500, 34);
  g.fillText(d.storeLabel, 60, 320);
  g.font = font(800, 52);
  g.fillText(d.store, 60, 385);
  let y = 385;
  if (d.receiver) {
    y += 60;
    g.font = font(500, 34);
    g.fillStyle = '#7a6040';
    g.fillText(`${d.receiverLabel}: `, 60, y);
    const w = g.measureText(`${d.receiverLabel}: `).width;
    g.fillStyle = '#3a2314';
    g.font = font(800, 34);
    g.fillText(d.receiver, 60 + w, y);
  }
  y += 50;

  g.strokeStyle = '#d9c9a3';
  g.lineWidth = 3;
  for (const s of d.sections) {
    if (s.title) {
      y += 60;
      g.fillStyle = '#5aa832';
      g.font = font(800, 36);
      g.fillText(s.title.toUpperCase(), 60, y);
      y += 10;
    }
    for (const { p, qty, sub } of s.rows) {
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(85, y + 45, 22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a2314';
      g.font = font(700, 42);
      g.fillText(p.name, 130, y + 45);
      g.font = font(500, 30);
      g.fillStyle = '#7a6040';
      g.fillText(sub, 130, y + 87);
      g.fillStyle = '#3a2314';
      g.font = font(900, 56);
      right(`${qty}`, W - 60, y + 65);
      y += 110;
      g.beginPath();
      g.moveTo(60, y + 8);
      g.lineTo(W - 60, y + 8);
      g.stroke();
    }
  }
  if (d.empty) {
    y += 80;
    g.font = font(600, 38);
    g.fillStyle = '#7a6040';
    g.fillText(d.empty, 60, y);
  }

  y += 20;
  g.fillStyle = '#3a2314';
  for (const [k, v] of d.totals) {
    y += 75;
    g.font = font(800, 44);
    g.fillText(k, 60, y);
    right(v, W - 60, y);
  }
  if (d.status) {
    y += 40;
    const ok = d.status.tone === 'ok';
    g.fillStyle = ok ? '#dff2d3' : '#fff0c2';
    g.fillRect(60, y, W - 120, 80);
    g.fillStyle = ok ? '#3f7f20' : '#8a5a00';
    g.font = font(900, 40);
    g.textAlign = 'center';
    g.fillText(d.status.text, W / 2, y + 55);
    g.textAlign = 'left';
  }

  g.font = font(500, 30);
  g.fillStyle = '#7a6040';
  g.fillText('Mohon nota ini disimpan. Matur nuwun 🙏', 60, H - 60);

  return new Promise((r) => c.toBlob(r, 'image/png'));
}
