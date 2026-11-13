# SANI · Staf Andalan Mbok Ni

Aplikasi web internal untuk mengelola stok bumbu pecel **Mbok Ni** (Malang).
Dipakai Juragan (Android & iPhone), dibantu staf virtual **SANI**. Sani memanggil pemilik dengan "Juragan".

## Produk
| Kode | Produk | Ukuran |
|---|---|---|
| `pedas` | Bumbu Pecel Pedas | 100 g |
| `sedang` | Bumbu Pecel Sedang | 100 g |
| `tidak` | Bumbu Pecel Tidak Pedas | 100 g |
| `kacang` | Bumbu Kacang Serbaguna (gado-gado) | 200 g |

## Tahap 1 — Titip ke Toko (sudah)
- Pilih toko (atau tambah toko baru) → isi jumlah per varian dengan tombol + / − / +10 → SANI membacakan ulang → nota dibuat.
- Nomor nota urut: `MBOKNI-0001`, `MBOKNI-0002`, …
- Kirim nota ke WhatsApp toko (teks) atau sebagai gambar.
- Foto nota kertas disimpan di nota digital (di HP, IndexedDB).
- Nota bisa dibatalkan (tetap tersimpan, ditandai batal).
- Setelan: daftar toko, harga titip (opsional), ukuran huruf, suara, cadangan data.

## Tahap 2 — Cek Toko & Pembayaran (sudah)
- Pilih toko → **hitung sisa di rak** (angka sudah diisi sesuai catatan Sani) → **tarik** barang lama/rusak → ringkasan & pembayaran → **Nota Pembayaran**.
- Laku = catatan Sani − sisa di rak. Total = laku × harga titip (dari Setelan).
- Pembayaran: lunas / sebagian / belum. Kekurangan bisa dicatat belakangan ("Catat pembayaran").
- Sani mengingatkan barang yang sudah lama di toko (batas hari diatur di Setelan, bawaan 30 hari).
- Setelah cek, tombol **Titip lagi ke toko ini** mengisi otomatis sejumlah yang laku + ditarik.
- Setiap nota mencatat **nama petugas toko** (penerima), dengan pilihan cepat nama yang pernah dipakai.

## Tahap 3 — Stok & Rekap (sudah)
- **Stok**: jumlah bumbu di semua toko (per produk) dan per toko, dengan tanda ⏰ barang lama dan tombol *Cek toko ini*.
- **Rekap** Minggu ini / Bulan ini / Bulan lalu: laku, uang masuk (menurut tanggal bayar), dititip, belum dibayar, laku per produk, **toko terlaris**.
- **Saran titip**: dari kecepatan laku (maks. 4 cek terakhir) × jarak kunjungan rata-rata + 20% cadangan − stok di toko. Muncul di Rekap dan di layar Jumlah Titipan (*Pakai saran Sani*).
- **Kirim rekap** sebagai gambar sederhana ke WA.
- Stok di rumah belum dicatat (menunggu Barang Datang/travel & Shopee).

## Rencana
1. ✅ Titip ke toko + nota
2. ✅ Cek toko & pembayaran
3. ✅ Stok & rekap, toko terlaris, saran titip
4. Pesanan Shopee (dari Google Sheet pencatatan harian)
5. Jadwal travel & pengingat
+ Sinkron data antar-HP (rencana: Google Sheet + Google Drive untuk foto)

## Catatan teknis
- HTML/CSS/JS biasa, tanpa build. Buka `index.html` lewat server `https://` (mis. GitHub Pages).
- Data tersimpan di HP masing-masing sampai fitur sinkron dibuat.
- Uji lokal: `npx http-server -p 8765 .` lalu buka `http://localhost:8765`.

Nota titip dan nota pembayaran memakai satu urutan nomor: `MBOKNI-0001`, `MBOKNI-0002`, …
