# Cara memasang sinkron Google Sheet

Dikerjakan **sekali saja** oleh anak / pendamping, sekitar 10 menit, dari laptop.
Pakai akun Google keluarga yang akan menyimpan catatan Mbok Ni.

## 1. Buat Google Sheet
1. Buka <https://sheets.new>.
2. Beri nama, misalnya **Mbok Ni – Catatan SANI**.

## 2. Pasang skrip
1. Di Sheet itu: menu **Ekstensi → Apps Script** (*Extensions → Apps Script*).
2. Hapus semua isi `Code.gs`, lalu tempel seluruh isi file [`Code.gs`](Code.gs) dari folder ini. Klik 💾 **Simpan**.
3. **Untuk Penjualan Shopee:** di baris `var SHOPEE_SHEET_ID = '';` isi ID sheet **Mbokni Shopee**, yaitu bagian alamat di antara `/d/` dan `/edit`.
   Contoh: `var SHOPEE_SHEET_ID = '1AbC…xyz';` lalu Simpan. (ID ini sengaja tidak disimpan di repo.)
   Sheet Shopee harus bisa dibuka oleh akun yang sama.
4. Di bagian atas, pilih fungsi **`setup`** lalu klik **▶ Jalankan** (*Run*).
5. Google akan minta izin: **Tinjau izin** → pilih akun → **Lanjutan / Advanced** → **Buka … (tidak aman)** → **Izinkan**.
   Izin ini untuk menulis ke Sheet ini, membaca sheet Shopee, dan menyimpan foto nota di Google Drive akun ini.
6. Lihat **Log eksekusi** di bawah: ada tulisan **`KODE RAHASIA: XXXXXXXXXXXX`**. Catat kodenya.

## 3. Terbitkan sebagai Web App
1. Klik **Terapkan → Deployment baru** (*Deploy → New deployment*).
2. Klik ⚙️ di sebelah "Pilih jenis", pilih **Aplikasi web** (*Web app*).
3. Isi:
   - **Jalankan sebagai**: *Saya* (akun Anda)
   - **Yang memiliki akses**: *Siapa saja* (*Anyone*)
4. Klik **Terapkan**, lalu salin **URL aplikasi web** (berakhiran `/exec`).

> "Siapa saja" artinya alamat itu bisa dipanggil tanpa login Google, tapi **tanpa kode rahasia tidak ada yang bisa membaca atau menulis data**. Jangan sebarkan kode rahasia atau link sambung.

## 4. Sambungkan HP Juragan
**HP pertama**
1. Buka aplikasi SANI → **⚙️ Setelan** → bagian **☁️ Google Sheet**.
2. Isi **Alamat Web App** (URL `/exec` tadi) dan **Kode rahasia** → **🔗 Sambungkan**.
3. Semua catatan yang sudah ada di HP itu langsung dikirim ke Sheet.

**HP berikutnya**
1. Di HP pertama: Setelan → **📤 Kirim link sambung ke HP lain** → kirim lewat WA.
2. Di HP kedua:
   - **Android**: cukup ketuk link-nya, lalu **✔ Ya, sambungkan**.
   - **iPhone** (aplikasi yang dipasang di layar utama punya penyimpanan sendiri, terpisah dari Safari):
     salin link dari WA → buka aplikasi SANI dari layar utama → Setelan → **tempel link** di kolom *Alamat Web App* → **Sambungkan** (kode rahasia tidak perlu diisi).

## Isi Google Sheet
| Tab | Isi |
|---|---|
| **Nota** | Semua nota (titip, pembayaran, barang datang), terbaru di atas |
| **Toko** | Daftar toko + stok di tiap toko menurut catatan |
| **Kiriman** | Jadwal & kedatangan barang dari travel |
| `_data` | Salinan lengkap untuk aplikasi — **jangan diubah manual** |

Tab Nota, Toko, dan Kiriman **dibuat ulang otomatis** setiap ada perubahan, jadi jangan mengetik di sana (akan tertimpa). Untuk catatan sendiri, buat tab baru.

Foto nota kertas tersimpan di Google Drive, folder **Mbok Ni - Foto Nota**.

## Cara kerja sinkron
- Aplikasi tetap bisa dipakai **tanpa sinyal**. Perubahan menunggu, lalu terkirim sendiri saat ada sinyal (status di bawah halaman awal).
- Sinkron otomatis saat aplikasi dibuka, sebelum membuat nota, setelah ada perubahan, dan tiap 5 menit.
- Nomor nota dijaga **tidak dobel**: kalau dua HP membuat nota bersamaan saat salah satunya tanpa sinyal, Sheet memberi nomor baru dan Sani memberi tahu Juragan.

## Penjualan Shopee
- Di aplikasi: **🛒 Penjualan Shopee** menampilkan penjualan bulan ini / bulan lalu dari sheet **Mbokni Shopee** — **hanya info**, tidak mengubah stok atau nota.
- Yang dihitung hanya kode **PC…** (Pecel, semua rasa) dan **GD…** (Gado-gado). E-Money, Kremesan, Saripohatji, dll. diabaikan. Setoran dari kolom **HARGA**.
- Nama tab harus mengikuti pola yang sudah ada: `Jan Feb Mar Apr Mei Jun Jul Agt Sep Okt Nov Des` + 2 angka tahun.

## Kalau skrip diperbarui
Tempel `Code.gs` versi baru (isi lagi `SHOPEE_SHEET_ID`) → Simpan → **Terapkan → Kelola deployment** → ✏️ → *Versi: Versi baru* → **Terapkan**.
Alamat `/exec` tetap sama, HP tidak perlu disambungkan ulang. Kalau Google minta izin baru, jalankan `setup` sekali lagi.
