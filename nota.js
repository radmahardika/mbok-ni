// Nota titip: teks untuk WhatsApp dan gambar untuk dibagikan.
import { PRODUCTS, storeById, noteTotalQty, noteTotalMoney } from './data.js';

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

function lines(note) {
  return PRODUCTS.filter((p) => note.items[p.id] > 0).map((p) => ({
    p,
    qty: note.items[p.id],
    price: note.prices[p.id],
  }));
}

export function notaText(note) {
  const store = storeById(note.storeId);
  const total = noteTotalMoney(note);
  const rows = lines(note).map(({ p, qty, price }) => {
    const money = price ? ` × ${rupiah(price)} = ${rupiah(qty * price)}` : '';
    return `• ${p.name} ${p.size}: *${qty} bks*${money}`;
  });
  return [
    '*NOTA TITIP — MBOK NI*',
    `No: *${note.no}*`,
    `Tanggal: ${tanggal(note.createdAt)}`,
    `Toko: ${store ? store.name : '-'}`,
    '',
    ...rows,
    '',
    `Jumlah: *${noteTotalQty(note)} bungkus*`,
    total != null ? `Nilai titipan: *${rupiah(total)}*` : null,
    '',
    'Mohon nota ini disimpan nggih. Matur nuwun 🙏',
    '— Mbok Ni',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function waLink(note) {
  const store = storeById(note.storeId);
  const text = encodeURIComponent(notaText(note));
  return store && store.wa ? `https://wa.me/${store.wa}?text=${text}` : `https://wa.me/?text=${text}`;
}

// Gambar nota 1080px, warna khas Mbok Ni.
export async function notaImage(note) {
  const store = storeById(note.storeId);
  const items = lines(note);
  const total = noteTotalMoney(note);
  const W = 1080;
  const H = 760 + items.length * 110 + (total != null ? 90 : 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

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
  g.fillStyle = '#f4ef8d';
  g.font = font(900, 96);
  g.fillText('MBOK NI', 60, 135);
  g.font = font(600, 36);
  g.fillText('Nota Titip Barang', 60, 190);
  g.textAlign = 'right';
  g.font = font(800, 44);
  g.fillText(note.no, W - 60, 120);
  g.font = font(500, 32);
  g.fillText(tanggal(note.createdAt), W - 60, 175);
  g.textAlign = 'left';

  g.fillStyle = '#3a2314';
  g.font = font(500, 34);
  g.fillText('Toko', 60, 320);
  g.font = font(800, 52);
  g.fillText(store ? store.name : '-', 60, 385);

  let y = 470;
  g.strokeStyle = '#d9c9a3';
  g.lineWidth = 3;
  for (const { p, qty, price } of items) {
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(85, y + 30, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a2314';
    g.font = font(700, 42);
    g.fillText(`${p.name}`, 130, y + 30);
    g.font = font(500, 30);
    g.fillStyle = '#7a6040';
    g.fillText(price ? `${p.size} · ${rupiah(price)}/bks` : p.size, 130, y + 72);
    g.textAlign = 'right';
    g.fillStyle = '#3a2314';
    g.font = font(900, 56);
    g.fillText(`${qty}`, W - 60, y + 50);
    g.textAlign = 'left';
    y += 110;
    g.beginPath();
    g.moveTo(60, y - 8);
    g.lineTo(W - 60, y - 8);
    g.stroke();
  }

  y += 50;
  g.font = font(800, 44);
  g.fillText('Jumlah', 60, y);
  g.textAlign = 'right';
  g.fillText(`${noteTotalQty(note)} bungkus`, W - 60, y);
  g.textAlign = 'left';
  if (total != null) {
    y += 90;
    g.fillText('Nilai titipan', 60, y);
    g.textAlign = 'right';
    g.fillText(rupiah(total), W - 60, y);
    g.textAlign = 'left';
  }

  g.font = font(500, 30);
  g.fillStyle = '#7a6040';
  g.fillText('Mohon nota ini disimpan. Matur nuwun 🙏', 60, H - 70);

  return new Promise((r) => c.toBlob(r, 'image/png'));
}
