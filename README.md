# SANI · Staf Andalan Mbok Ni

Aplikasi web internal untuk mengelola stok bumbu pecel **Mbok Ni** (Malang).
Dipakai Bapak (Android) dan Ibu (iPhone), dibantu staf virtual **SANI**.

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
- Setelan: daftar toko, harga titip (opsional), ukuran huruf, suara, ganti pengguna, cadangan data.

## Tahap 2 — Cek Toko & Tagih (sudah)
- Pilih toko → **hitung sisa di rak** (angka sudah diisi sesuai catatan Sani) → **tarik** barang lama/rusak → ringkasan & pembayaran → **Nota Tagihan**.
- Laku = catatan Sani − sisa di rak. Tagihan = laku × harga titip (dari Setelan).
- Pembayaran: lunas / sebagian / belum. Kekurangan bisa dicatat belakangan ("Catat pembayaran").
- Sani mengingatkan barang yang sudah lama di toko (batas hari diatur di Setelan, bawaan 30 hari).
- Setelah cek, tombol **Titip lagi ke toko ini** mengisi otomatis sejumlah yang laku + ditarik.
- Setiap nota mencatat **nama petugas toko** (penerima), dengan pilihan cepat nama yang pernah dipakai.

## Rencana
1. ✅ Titip ke toko + nota
2. ✅ Cek toko & tagih
3. Stok & rekap (rekap dalam bentuk gambar sederhana), toko terlaris, saran titip
4. Pesanan Shopee (dari Google Sheet pencatatan harian)
5. Jadwal travel & pengingat
+ Sinkron data Bapak–Ibu (rencana: Google Sheet + Google Drive untuk foto)

## Catatan teknis
- HTML/CSS/JS biasa, tanpa build. Buka `index.html` lewat server `https://` (mis. GitHub Pages).
- Data tersimpan di HP masing-masing sampai fitur sinkron dibuat.
- Uji lokal: `npx http-server -p 8765 .` lalu buka `http://localhost:8765`.
