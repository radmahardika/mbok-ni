// Periode rekap dan gambar rekap sederhana untuk dibagikan ke WA.
import { PRODUCTS, storeById } from './data.js';
import { tanggal, rupiah } from './nota.js';

export const PERIODS = [
  { id: 'minggu', label: 'Minggu ini' },
  { id: 'bulan', label: 'Bulan ini' },
  { id: 'lalu', label: 'Bulan lalu' },
];

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Mengembalikan { from, to, title } — to tidak ikut dihitung.
export function period(id, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (id === 'bulan') {
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    return { from, to: new Date(d.getFullYear(), d.getMonth() + 1, 1), title: `${BULAN[from.getMonth()]} ${from.getFullYear()}` };
  }
  if (id === 'lalu') {
    const from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return { from, to: new Date(d.getFullYear(), d.getMonth(), 1), title: `${BULAN[from.getMonth()]} ${from.getFullYear()}` };
  }
  const from = new Date(d);
  from.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Senin
  const to = new Date(from);
  to.setDate(from.getDate() + 7);
  const end = new Date(to - 1);
  return { from, to, title: `${tanggal(from.toISOString(), false)} – ${tanggal(end.toISOString(), false)}` };
}

export const topStores = (r, n = 5) =>
  Object.entries(r.byStore)
    .filter(([, q]) => q > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id, q]) => ({ name: storeById(id)?.name || '-', qty: q }));

// Gambar rekap 1080px: angka utama, laku per produk, toko terlaris.
export async function rekapImage(r, per, label) {
  const stores = topStores(r);
  const W = 1080;
  const H = 1150 + stores.length * 90 + (stores.length ? 90 : 0);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const INK = '#3a2314';
  const MUTED = '#7a6040';
  const BAR = '#3f7f20';
  const right = (t, x, y) => {
    g.textAlign = 'right';
    g.fillText(t, x, y);
    g.textAlign = 'left';
  };
  const bar = (x, y, w, h) => {
    const r = Math.min(4, w / 2);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + w - r, y);
    g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r);
    g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x, y + h);
    g.fill();
  };

  g.fillStyle = '#fffaf0';
  g.fillRect(0, 0, W, H);
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
  g.fillText(`Rekap ${label}`, 60, 190);
  g.font = font(500, 30);
  right(per.title, W - 60, 190);

  // Angka utama 2x2
  const tiles = [
    ['Laku', `${Object.values(r.sold).reduce((a, b) => a + b, 0)} bks`],
    ['Uang masuk', rupiah(r.received)],
    ['Dititip', `${Object.values(r.titip).reduce((a, b) => a + b, 0)} bks`],
    ['Belum dibayar', rupiah(r.owed)],
  ];
  tiles.forEach(([k, v], i) => {
    const x = 60 + (i % 2) * 490;
    const y = 290 + Math.floor(i / 2) * 170;
    g.fillStyle = '#ffffff';
    g.fillRect(x, y, 470, 150);
    g.strokeStyle = '#e6d9bd';
    g.lineWidth = 3;
    g.strokeRect(x, y, 470, 150);
    g.fillStyle = MUTED;
    g.font = font(600, 32);
    g.fillText(k, x + 30, y + 52);
    g.fillStyle = INK;
    g.font = font(900, 52);
    g.fillText(v, x + 30, y + 120);
  });

  // Laku per produk
  let y = 690;
  g.fillStyle = INK;
  g.font = font(800, 40);
  g.fillText('Laku per produk', 60, y);
  y += 30;
  const max = Math.max(1, ...PRODUCTS.map((p) => r.sold[p.id] || 0));
  for (const p of PRODUCTS) {
    const q = r.sold[p.id] || 0;
    g.fillStyle = p.color;
    g.beginPath();
    g.arc(75, y + 32, 14, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.font = font(600, 32);
    g.fillText(p.short, 100, y + 44);
    g.fillStyle = BAR;
    const bw = Math.round((q / max) * 400);
    if (q) bar(430, y + 14, bw, 36);
    g.fillStyle = INK;
    g.font = font(800, 34);
    g.fillText(`${q}`, 430 + bw + 16, y + 44);
    y += 75;
  }

  if (stores.length) {
    y += 50;
    g.fillStyle = INK;
    g.font = font(800, 40);
    g.fillText('Toko terlaris', 60, y);
    y += 30;
    const smax = stores[0].qty;
    stores.forEach((s, i) => {
      g.fillStyle = INK;
      g.font = font(600, 32);
      const name = s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name;
      g.fillText(`${i + 1}. ${name}`, 60, y + 44);
      g.fillStyle = BAR;
      const bw = Math.round((s.qty / smax) * 300);
      bar(530, y + 14, bw, 36);
      g.fillStyle = INK;
      g.font = font(800, 34);
      g.fillText(`${s.qty}`, 530 + bw + 16, y + 44);
      y += 90;
    });
  }

  g.font = font(500, 28);
  g.fillStyle = MUTED;
  g.fillText(`Dibuat SANI · ${tanggal(new Date().toISOString())}`, 60, H - 50);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
