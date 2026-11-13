import { saniSVG } from './sani.js';
import * as D from './data.js';
import { notaDoc, notaText, waLink, notaImage, tanggal, jam, rupiah, payState } from './nota.js';
import { PERIODS, period, topStores, rekapImage } from './rekap.js';
import * as S from './sync.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const buzz = () => navigator.vibrate && navigator.vibrate(15);
const total = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

// Sani memanggil pemilik dengan "Juragan".
const sapa = () => 'Juragan';

// ---------- Komponen ----------
function sani(mood, text) {
  const voice = D.getState().settings.voice && 'speechSynthesis' in window;
  return `
    <div class="sani">
      <div class="sani-img" data-mood="${mood}">${saniSVG(mood)}</div>
      <div class="bubble">
        <p>${text}</p>
        ${voice ? `<button class="speak" data-act="speak" aria-label="Bacakan">🔊 Bacakan</button>` : ''}
      </div>
    </div>`;
}

function topbar(title, back = '#/') {
  return `
    <header class="top">
      <a class="back" href="${back}">‹ Kembali</a>
      <h1>${title}</h1>
    </header>`;
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/<[^>]+>/g, ''));
  u.lang = 'id-ID';
  u.rate = 0.9;
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.replace('_', '-').startsWith('id'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function toast(msg) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

// Dialog besar dengan Sani. Mengembalikan Promise<boolean>. no: null = satu tombol saja.
function confirmBox({ mood = 'khawatir', text, yes = 'Ya', no = 'Tidak', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-card">
        ${sani(mood, text)}
        <button class="btn big ${danger ? 'danger' : 'primary'}" data-r="1">${yes}</button>
        ${no ? `<button class="btn big ghost" data-r="0">${no}</button>` : ''}
      </div>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="speak"]')) return speak(el.querySelector('.bubble p').textContent);
      const b = e.target.closest('[data-r]');
      if (!b) return;
      el.remove();
      resolve(b.dataset.r === '1');
    });
    document.body.append(el);
  });
}

// Isian angka besar (jumlah bungkus / rupiah). Mengembalikan angka atau null.
function numberBox({ text, value = '', unit = '', mood = 'biasa' }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <form class="modal-card">
        ${sani(mood, text)}
        <label class="num-wrap">${unit === 'Rp' ? '<span>Rp</span>' : ''}
          <input class="input num-input" inputmode="numeric" pattern="[0-9.]*" value="${value}" autocomplete="off">
          ${unit && unit !== 'Rp' ? `<span>${unit}</span>` : ''}</label>
        <button class="btn big primary" type="submit">✔ Simpan</button>
        <button class="btn big ghost" type="button" data-r="0">Batal</button>
      </form>`;
    const input = el.querySelector('input');
    const done = (v) => {
      el.remove();
      resolve(v);
    };
    input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '');
      input.value = unit === 'Rp' && d ? Number(d).toLocaleString('id-ID') : d;
    });
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = input.value.replace(/\D/g, '');
      done(d === '' ? null : Number(d));
    });
    el.querySelector('[data-r="0"]').addEventListener('click', () => done(null));
    document.body.append(el);
    input.dispatchEvent(new Event('input'));
    setTimeout(() => input.focus(), 50);
  });
}

function photoViewer(url) {
  const el = document.createElement('div');
  el.className = 'modal viewer';
  el.innerHTML = `<img src="${url}" alt="Foto nota"><button class="btn big">Tutup</button>`;
  el.addEventListener('click', () => {
    el.remove();
    URL.revokeObjectURL(url);
  });
  document.body.append(el);
}

// Kartu jumlah dengan tombol − / +.
function stepper(p, qty, draftKey, { note = '', plus10 = false, max = Infinity } = {}) {
  return `
    <div class="qty-card" style="--c:${p.color}">
      <div class="qty-name"><b>${p.name}</b><small>${p.size}</small></div>
      ${note ? `<div class="qty-note">${note}</div>` : ''}
      <div class="qty-row">
        <button class="step" data-act="qty" data-draft="${draftKey}" data-id="${p.id}" data-d="-1" aria-label="Kurangi" ${qty <= 0 ? 'disabled' : ''}>−</button>
        <button class="qty-num" data-act="qty-type" data-draft="${draftKey}" data-id="${p.id}" data-max="${max}">${qty}</button>
        <button class="step" data-act="qty" data-draft="${draftKey}" data-id="${p.id}" data-d="1" aria-label="Tambah" ${qty >= max ? 'disabled' : ''}>+</button>
      </div>
      ${plus10 ? `<button class="plus10" data-act="qty" data-draft="${draftKey}" data-id="${p.id}" data-d="10">+10 (satu pak)</button>` : ''}
    </div>`;
}

// Isian nama petugas toko + pilihan cepat nama yang pernah dipakai.
function receiverField(storeId, value, label, draftKey) {
  const names = D.receiversForStore(storeId);
  const chips = names
    .map((n) => `<button type="button" class="chip ${n === value ? 'on' : ''}" data-act="pick-receiver" data-draft="${draftKey}" data-name="${esc(n)}">${esc(n)}</button>`)
    .join('');
  return `
    <div class="card">
      <label class="field">${label}
        <input class="input" data-act="receiver" data-draft="${draftKey}" value="${esc(value)}" maxlength="40" placeholder="contoh: Mbak Rina" autocomplete="off">
      </label>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>`;
}

// ---------- Draf (hilang kalau aplikasi ditutup — sengaja, supaya tidak membingungkan) ----------
const drafts = {
  titip: { storeId: null, items: {}, receiver: '' },
  cek: { storeId: null, counted: {}, pulled: {}, receiver: '', pay: null },
  datang: { items: {}, courier: '', scheduleId: null },
  rumah: {},
};
// Kunci isian stepper -> objek angka yang diubah.
const qtyTarget = (key) =>
  ({ titip: drafts.titip.items, hitung: drafts.cek.counted, tarik: drafts.cek.pulled, datang: drafts.datang.items, rumah: drafts.rumah })[key];

// Jadwal yang kemungkinan sedang datang (3 hari lalu s.d. besok).
const nearSchedule = () => D.pendingSchedules().find((sc) => D.scheduleDays(sc) >= -3 && D.scheduleDays(sc) <= 1);

function startDatang() {
  const sc = nearSchedule();
  drafts.datang = { items: {}, courier: sc?.courier || '', scheduleId: sc?.id || null };
}

function startTitip(storeId, items = {}) {
  drafts.titip = { storeId, items: { ...items }, receiver: '' };
}

function startCek(storeId) {
  drafts.cek = { storeId, counted: { ...D.stockAtStore(storeId) }, pulled: {}, receiver: '', pay: null };
}

// ---------- Halaman ----------
const routes = {
  '': home,
  titip: titipStore,
  jumlah: titipQty,
  'titip-cek': titipCheck,
  'cek-toko': cekStore,
  'cek-hitung': cekCount,
  'cek-tarik': cekPull,
  'cek-bayar': cekPay,
  nota: notaDetail,
  'daftar-nota': notaList,
  toko: storeForm,
  setelan: settings,
  stok: stockPage,
  rekap: rekapPage,
  datang: datangPage,
  'datang-jumlah': datangQty,
  'datang-cek': datangCheck,
  jadwal: scheduleForm,
  'hitung-rumah': countHome,
  sambung: connectPage,
};

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function whenText(sc) {
  const d = D.scheduleDays(sc);
  const day = d === 0 ? 'Hari ini' : d === 1 ? 'Besok' : d === -1 ? 'Kemarin' : tanggal(sc.date + 'T00:00');
  return `${day}${sc.time ? ` jam ${sc.time.replace(':', '.')}` : ''}`;
}

// Pengingat untuk beranda, paling penting di atas.
function reminders() {
  const out = [];
  for (const sc of D.pendingSchedules()) {
    const d = D.scheduleDays(sc);
    const via = sc.courier ? ` lewat <b>${esc(sc.courier)}</b>` : '';
    if (d < 0) out.push({ icon: '🚐', text: `Kiriman ${whenText(sc).toLowerCase()}${via} belum dicatat datang. Sudah sampai?`, href: '#/datang' });
    else if (d <= 1) out.push({ icon: '🚐', text: `<b>${whenText(sc)}</b> ada kiriman travel${via}.`, href: '#/datang' });
  }
  for (const s of D.activeStores()) {
    const old = D.oldItemsAtStore(s.id);
    const lastCek = D.lastNoteForStore(s.id, 'cek');
    const recentlyChecked = lastCek && D.daysSince(lastCek.createdAt) < 7; // sudah diputuskan saat cek
    if (old.length && !recentlyChecked) {
      const days = Math.max(...old.map((o) => o.days));
      out.push({ icon: '⏰', text: `<b>${esc(s.name)}</b>: ada bumbu yang sudah <b>${days} hari</b> di toko. Waktunya dicek & ditarik.`, href: `#/cek-toko?pilih=${s.id}` });
    }
  }
  for (const n of D.unpaidNotes()) {
    const s = D.storeById(n.storeId);
    out.push({ icon: '💰', text: `<b>${esc(s?.name)}</b> belum bayar <b>${rupiah(D.owedOf(n))}</b> (${n.no}).`, href: `#/nota?id=${n.id}` });
  }
  const noPhoto = D.getState().notes.filter((n) => n.status === 'aktif' && !n.photos.length && n.type !== 'datang');
  if (noPhoto.length) out.push({ icon: '📷', text: `<b>${noPhoto.length} nota</b> belum difoto nota kertasnya.`, href: '#/daftar-nota?foto=belum' });
  return out;
}

function home() {
  const rem = reminders();
  if (!D.activeStores().length) {
    rem.unshift({ icon: '👋', text: 'Belum ada toko yang dicatat. Ketuk di sini untuk mulai <b>titip ke toko</b>.', href: '#/titip' });
  }
  const msg = 'Halo Juragan, saya <b>SANI</b> - Staf Andalan Mbok Ni. Apa yang bisa saya bantu?';
  const mood = rem.length ? 'ingat' : 'senang';
  const remList = rem
    .slice(0, 4)
    .map((r) => `<a class="remind" href="${r.href}"><span class="ico">${r.icon}</span><span>${r.text}</span><span class="go">›</span></a>`)
    .join('');
  return `
    <main class="page">
      ${sani(mood, msg)}
      ${remList ? `<div class="stack">${remList}</div>` : ''}
      <nav class="menu">
        <a class="tile primary" href="#/titip"><span class="ico">🏪</span><span>Titip ke Toko</span></a>
        <a class="tile yellow" href="#/cek-toko"><span class="ico">🔍</span><span>Cek Toko &amp; Pembayaran</span></a>
        <a class="tile" href="#/datang"><span class="ico">🚐</span><span>Barang Datang</span></a>
        <a class="tile" href="#/stok"><span class="ico">📊</span><span>Stok &amp; Rekap</span></a>
        <button class="tile soon wide" data-act="soon" data-what="Pesanan Shopee"><span class="ico">🛒</span><span>Pesanan Shopee</span><small>Segera</small></button>
      </nav>
      <div class="row2">
        <a class="btn big" href="#/daftar-nota">📄 Daftar Nota</a>
        <a class="btn big" href="#/setelan">⚙️ Setelan</a>
      </div>
      ${syncLine()}
    </main>`;
}

function syncLine() {
  if (!S.isConfigured()) return '';
  const sy = D.getState().sync;
  const n = D.dirtyRecords().length;
  let t;
  if (!navigator.onLine || sy.error === 'offline') t = `📴 Belum ada sinyal — ${n} perubahan menunggu dikirim ke Sheet`;
  else if (sy.error) t = `⚠️ Belum tersimpan ke Sheet: ${esc(sy.error)}`;
  else if (n) t = `⏳ Mengirim ${n} perubahan ke Sheet…`;
  else t = `☁️ Tersimpan di Google Sheet${sy.lastAt ? ` · ${jam(sy.lastAt)}` : ''}`;
  return `<p class="sync-line">${t}</p>`;
}

// ----- Titip -----
function titipStore() {
  const stores = D.activeStores();
  const list = stores
    .map((s) => {
      const last = D.lastNoteForStore(s.id, 'titip');
      const info = last ? `Terakhir titip ${tanggal(last.createdAt, false)}` : 'Belum pernah titip';
      return `<button class="pick" data-act="pick-store" data-id="${s.id}">
          <b>${esc(s.name)}</b><small>${info}</small></button>`;
    })
    .join('');
  return `
    ${topbar('Titip ke Toko')}
    <main class="page">
      ${sani('biasa', stores.length ? `Mau titip ke toko mana, ${sapa()}?` : `Belum ada toko, ${sapa()}. Tambahkan dulu nggih.`)}
      <div class="stack">${list}
        <a class="btn big dashed" href="#/toko?lanjut=titip">➕ Tambah toko baru</a>
      </div>
    </main>`;
}

function titipQty() {
  const dr = drafts.titip;
  const s = D.storeById(dr.storeId);
  if (!s) return redirect('#/titip');
  const sum = total(dr.items);
  const sug = D.suggestion(s.id);
  const stock = D.stockAtStore(s.id);
  let msg;
  if (dr.fromCek) msg = `Titip lagi ke <b>${esc(s.name)}</b>. Sani sudah isi sesuai saran — boleh diubah nggih, ${sapa()}.`;
  else if (sug && total(sug.qty)) msg = `Titip ke <b>${esc(s.name)}</b>. Sani punya saran jumlah dari penjualan sebelumnya — ketuk <b>Pakai saran Sani</b> kalau setuju.`;
  else msg = `Titip ke <b>${esc(s.name)}</b>. Berapa bungkus masing-masing, ${sapa()}? Ketuk <b>+</b> untuk menambah.`;
  const home = D.homeStock();
  const note = (p) => {
    const parts = [];
    if (home.known) parts.push(`Di rumah: <b>${Math.max(0, home.stock[p.id] || 0)}</b>`);
    if (stock[p.id]) parts.push(`Masih di toko: <b>${stock[p.id]}</b>`);
    if (sug && sug.perWeek[p.id]) parts.push(`laku ±${sug.perWeek[p.id]}/minggu`);
    if (sug) parts.push(`saran Sani: <b>${sug.qty[p.id] || 0}</b>`);
    return parts.join(' · ');
  };
  const useBtn = sug && total(sug.qty) && !dr.fromCek
    ? `<button class="btn big yellow" data-act="use-suggest">✨ Pakai saran Sani (${total(sug.qty)} bungkus)</button>`
    : '';
  return `
    ${topbar('Jumlah Titipan', '#/titip')}
    <main class="page">
      ${sani('biasa', msg)}
      ${useBtn}
      <div class="stack">${D.PRODUCTS.map((p) => stepper(p, dr.items[p.id] || 0, 'titip', { plus10: true, note: note(p) })).join('')}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="go" data-to="#/titip-cek" ${sum ? '' : 'disabled'}>Lanjut (${sum} bungkus) ›</button>
      </div>
    </main>`;
}

function summaryText(storeName, items) {
  const parts = D.PRODUCTS.filter((p) => items[p.id]).map((p) => `${p.short} ${items[p.id]} bungkus`);
  return `Titip ke ${storeName}: ${parts.join(', ')}.`;
}

function sumList(qtyMap) {
  return D.PRODUCTS.filter((p) => qtyMap[p.id] > 0)
    .map((p) => `<li style="--c:${p.color}"><span>${p.name} <small>${p.size}</small></span><b>${qtyMap[p.id]}</b></li>`)
    .join('');
}

function titipCheck() {
  const dr = drafts.titip;
  const s = D.storeById(dr.storeId);
  const sum = total(dr.items);
  if (!s || !sum) return redirect('#/titip');
  return `
    ${topbar('Cek Ulang', '#/jumlah')}
    <main class="page">
      ${sani('biasa', `Sani bacakan nggih, ${sapa()}. ${esc(summaryText(s.name, dr.items))} Sudah betul? Jangan lupa tulis siapa yang menerima.`)}
      <div class="card">
        <p class="muted">Toko</p>
        <h2>${esc(s.name)}</h2>
        <ul class="sum">${sumList(dr.items)}</ul>
        <p class="sum-total">Jumlah <b>${sum} bungkus</b></p>
      </div>
      ${receiverField(s.id, dr.receiver, 'Diterima oleh (petugas toko)', 'titip')}
      <div class="stack">
        <button class="btn huge primary" data-act="create-titip">✔ Betul, buat nota</button>
        <a class="btn big ghost" href="#/jumlah">✏️ Ubah jumlah</a>
      </div>
    </main>`;
}

// ----- Cek toko & pembayaran -----
function cekStore(params) {
  if (params.pilih && D.storeById(params.pilih)) {
    startCek(params.pilih);
    return redirect('#/cek-hitung');
  }
  const stores = D.activeStores();
  const list = stores
    .map((s) => {
      const stock = total(D.stockAtStore(s.id));
      const old = D.oldItemsAtStore(s.id);
      const owed = D.unpaidNotes().filter((n) => n.storeId === s.id).reduce((a, n) => a + D.owedOf(n), 0);
      const lastCek = D.lastNoteForStore(s.id, 'cek');
      const badges = [
        old.length ? `<i class="b warn">⏰ Ada barang ${Math.max(...old.map((o) => o.days))} hari</i>` : '',
        owed ? `<i class="b bad">💰 Kurang ${rupiah(owed)}</i>` : '',
      ].join('');
      return `<button class="pick" data-act="pick-cek" data-id="${s.id}">
          <b>${esc(s.name)}</b>
          <small>Di toko: ${stock} bungkus · ${lastCek ? `dicek ${tanggal(lastCek.createdAt, false)}` : 'belum pernah dicek'}</small>
          ${badges ? `<span class="badges">${badges}</span>` : ''}</button>`;
    })
    .join('');
  return `
    ${topbar('Cek Toko &amp; Bayar')}
    <main class="page">
      ${sani('biasa', stores.length ? `Mau cek toko mana, ${sapa()}? Nanti Sani bantu hitung yang laku dan pembayarannya.` : `Belum ada toko, ${sapa()}. Titip barang dulu nggih.`)}
      <div class="stack">${list}</div>
    </main>`;
}

function cekCount() {
  const dr = drafts.cek;
  const s = D.storeById(dr.storeId);
  if (!s) return redirect('#/cek-toko');
  const expected = D.stockAtStore(s.id);
  const shown = D.PRODUCTS.filter((p) => expected[p.id] || dr.counted[p.id] || dr.showAll);
  const list = (shown.length ? shown : D.PRODUCTS)
    .map((p) => stepper(p, dr.counted[p.id] || 0, 'hitung', { note: `Catatan Sani: <b>${expected[p.id] || 0}</b> bungkus` }))
    .join('');
  const sold = D.PRODUCTS.reduce((a, p) => a + Math.max(0, (expected[p.id] || 0) - (dr.counted[p.id] || 0)), 0);
  const more = shown.length < D.PRODUCTS.length && shown.length
    ? `<button class="btn big dashed" data-act="show-all">Tampilkan semua produk</button>`
    : '';
  return `
    ${topbar('Hitung Sisa', '#/cek-toko')}
    <main class="page">
      ${sani('biasa', `${sapa()}, tolong hitung <b>sisa bumbu di rak</b> ${esc(s.name)}. Angkanya sudah Sani isi sesuai catatan — kalau beda, ubah nggih.`)}
      <div class="stack">${list}${more}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="go" data-to="#/cek-tarik">Lanjut · laku ${sold} bungkus ›</button>
      </div>
    </main>`;
}

function cekPull() {
  const dr = drafts.cek;
  const s = D.storeById(dr.storeId);
  if (!s) return redirect('#/cek-toko');
  const onShelf = D.PRODUCTS.filter((p) => dr.counted[p.id] > 0);
  if (!onShelf.length) return redirect('#/cek-bayar');
  const oldest = D.oldestAtStore(s.id);
  const max = D.getState().settings.maxDays;
  const old = [];
  const list = onShelf
    .map((p) => {
      const days = oldest[p.id] ? D.daysSince(oldest[p.id]) : null;
      if (days != null && days >= max) old.push(`${p.short} (${days} hari)`);
      const note = `Di rak: <b>${dr.counted[p.id]}</b> bungkus` +
        (days != null ? ` · titipan paling lama <b class="${days >= max ? 'warn-text' : ''}">${days} hari</b> lalu` : '');
      return stepper(p, dr.pulled[p.id] || 0, 'tarik', { note, max: dr.counted[p.id] });
    })
    .join('');
  const msg = old.length
    ? `Ada yang sudah lama di toko: <b>${old.join(', ')}</b>. Sebaiknya ditarik nggih, ${sapa()}. Berapa yang ditarik?`
    : `Ada bumbu yang <b>ditarik</b> (sudah lama atau rusak), ${sapa()}? Kalau tidak ada, langsung Lanjut saja.`;
  return `
    ${topbar('Tarik Barang', '#/cek-hitung')}
    <main class="page">
      ${sani(old.length ? 'ingat' : 'biasa', msg)}
      <div class="stack">${list}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="go" data-to="#/cek-bayar">${total(dr.pulled) ? `Lanjut · tarik ${total(dr.pulled)} bungkus` : 'Tidak ada yang ditarik · Lanjut'} ›</button>
      </div>
    </main>`;
}

function cekCalc() {
  const dr = drafts.cek;
  const expected = D.stockAtStore(dr.storeId);
  const sold = {};
  const extra = {};
  const sisa = {};
  for (const p of D.PRODUCTS) {
    const e = expected[p.id] || 0;
    const c = dr.counted[p.id] || 0;
    if (e > c) sold[p.id] = e - c;
    if (c > e) extra[p.id] = c - e;
    if (c - (dr.pulled[p.id] || 0) > 0) sisa[p.id] = c - (dr.pulled[p.id] || 0);
  }
  return { expected, sold, extra, sisa, bill: D.billFor(sold) };
}

function cekPay() {
  const dr = drafts.cek;
  const s = D.storeById(dr.storeId);
  if (!s) return redirect('#/cek-toko');
  const { sold, extra, sisa, bill } = cekCalc();
  const soldQty = total(sold);
  const parts = [];
  if (soldQty) parts.push(`Yang laku <b>${soldQty} bungkus</b>${bill != null ? `, totalnya <b>${rupiah(bill)}</b>` : ''}.`);
  else parts.push('Belum ada yang laku.');
  if (total(dr.pulled)) parts.push(`Ditarik ${total(dr.pulled)} bungkus.`);
  if (total(extra)) parts.push(`Di rak ada <b>lebih ${total(extra)}</b> dari catatan Sani — Sani ikuti hitungan ${sapa()}.`);

  let pay = '';
  if (soldQty && bill != null) {
    const opt = (mode, label) =>
      `<button class="btn big ${dr.pay?.mode === mode ? 'primary' : ''}" data-act="pay-mode" data-mode="${mode}">${label}</button>`;
    pay = `
      <div class="card">
        <h2>Pembayaran</h2>
        <p class="sum-total">Total <b>${rupiah(bill)}</b></p>
        <div class="stack">
          ${opt('lunas', `💵 Sudah dibayar lunas`)}
          ${opt('sebagian', dr.pay?.mode === 'sebagian' ? `💵 Dibayar ${rupiah(dr.pay.amount)} (ketuk untuk ubah)` : '💵 Dibayar sebagian…')}
          ${opt('belum', '⏳ Belum dibayar')}
        </div>
      </div>`;
  } else if (soldQty) {
    pay = `
      <div class="card">
        <h2>Pembayaran</h2>
        <p class="muted">Harga titip belum diisi di Setelan, jadi Sani belum bisa menghitung totalnya.</p>
        <div class="stack">
          <button class="btn big ${dr.pay?.mode === 'manual' ? 'primary' : ''}" data-act="pay-mode" data-mode="manual">${dr.pay?.mode === 'manual' ? `💵 Uang diterima ${rupiah(dr.pay.amount)}` : '💵 Isi uang yang diterima'}</button>
          <button class="btn big ${dr.pay?.mode === 'belum' ? 'primary' : ''}" data-act="pay-mode" data-mode="belum">⏳ Belum dibayar</button>
        </div>
      </div>`;
  }

  return `
    ${topbar('Ringkasan', total(dr.counted) ? '#/cek-tarik' : '#/cek-hitung')}
    <main class="page">
      ${sani('biasa', `${esc(s.name)}: ${parts.join(' ')}`)}
      <div class="card">
        ${soldQty ? `<p class="muted">Laku</p><ul class="sum">${sumList(sold)}</ul>` : ''}
        ${total(dr.pulled) ? `<p class="muted">Ditarik</p><ul class="sum">${sumList(dr.pulled)}</ul>` : ''}
        <p class="muted">Sisa di rak</p>
        ${total(sisa) ? `<ul class="sum">${sumList(sisa)}</ul>` : '<p><b>Kosong</b></p>'}
      </div>
      ${pay}
      ${receiverField(s.id, dr.receiver, 'Petugas toko yang ikut menghitung', 'cek')}
      <div class="stack">
        <button class="btn huge primary" data-act="create-cek">✔ Simpan &amp; buat nota</button>
      </div>
    </main>`;
}

// ----- Nota -----
function notaPreview(n) {
  const d = notaDoc(n);
  const sections = d.sections
    .map(
      (s) => `${s.title ? `<p class="sec-title">${s.title}</p>` : ''}<ul class="sum">${s.rows
        .map((r) => `<li style="--c:${r.p.color}"><span>${r.p.name} <small>${r.sub}</small></span><b>${r.qty}</b></li>`)
        .join('')}</ul>`
    )
    .join('');
  return `
    <div class="nota ${n.status === 'batal' ? 'void' : ''}">
      <div class="nota-head">
        <div><div class="brand">MBOK NI</div><div>${d.title}</div></div>
        <div class="nota-no"><b>${d.no}</b><div>${tanggal(d.date, false)}</div></div>
      </div>
      <div class="nota-body">
        <p class="muted">${d.storeLabel}</p>
        <h2>${esc(d.store)}</h2>
        ${d.receiver ? `<p class="receiver">${d.receiverLabel}: <b>${esc(d.receiver)}</b></p>` : ''}
        ${sections}
        ${d.empty ? `<p>${d.empty}</p>` : ''}
        ${d.totals.map(([k, v]) => `<p class="sum-total">${k} <b>${v}</b></p>`).join('')}
        ${d.status ? `<p class="pay-pill ${d.status.tone}">${d.status.text}</p>` : ''}
        <p class="muted small">Dicatat jam ${jam(n.createdAt)}${n.sentAt ? ' · ✔ sudah dikirim ke WA' : ''}</p>
      </div>
      ${n.status === 'batal' ? '<div class="stamp">DIBATALKAN</div>' : ''}
    </div>`;
}

function notaDetail(params) {
  const n = D.noteById(params.id);
  if (!n) return redirect('#/daftar-nota');
  const s = D.storeById(n.storeId);
  const isNew = params.baru === '1';
  const owed = D.owedOf(n);
  let mood = 'senang';
  let msg;
  if (n.status === 'batal') {
    mood = 'khawatir';
    msg = `Nota ${n.no} ini sudah dibatalkan, ${sapa()}.`;
  } else if (isNew && n.type === 'datang') {
    msg = `Barang datang sudah Sani catat di <b>${n.no}</b>, ${sapa()}. Stok di rumah bertambah ${D.noteTotalQty(n)} bungkus. Kalau ada surat jalan dari travel, foto nggih.`;
  } else if (isNew) {
    msg = `Nota <b>${n.no}</b> sudah jadi, ${sapa()}! Sekarang kirim ke WA toko, lalu foto nota kertasnya nggih.`;
  } else if (owed) {
    mood = 'ingat';
    msg = `${esc(s?.name)} masih kurang bayar <b>${rupiah(owed)}</b>, ${sapa()}.`;
  } else if (!n.photos.length && n.type !== 'datang') {
    mood = 'ingat';
    msg = `Nota kertas untuk <b>${n.no}</b> belum difoto, ${sapa()}.`;
  } else {
    msg = `Ini nota <b>${n.no}</b>${n.type === 'datang' ? ' barang datang' : ` untuk ${esc(s?.name)}`}.`;
  }
  const active = n.status === 'aktif';
  const refill = n.type === 'cek' ? { ...n.sold } : null;
  if (refill) for (const [k, v] of Object.entries(n.pulled)) refill[k] = (refill[k] || 0) + v;
  return `
    ${topbar('Nota', isNew ? (n.type === 'datang' ? '#/datang' : '#/') : '#/daftar-nota')}
    <main class="page">
      ${sani(mood, msg)}
      ${notaPreview(n)}
      ${
        active
          ? `<div class="stack">
        ${owed ? `<button class="btn huge primary" data-act="add-payment" data-id="${n.id}">💰 Catat pembayaran</button>` : ''}
        ${n.type !== 'datang' ? `<button class="btn huge wa" data-act="send-wa" data-id="${n.id}">💬 Kirim ke WA ${s?.wa ? 'toko' : ''}</button>` : ''}
        <button class="btn big" data-act="share-img" data-id="${n.id}">🖼️ Kirim gambar nota</button>
        <label class="btn big">📷 ${n.type === 'datang' ? 'Foto surat jalan / nota travel' : 'Foto nota kertas'}
          <input type="file" accept="image/*" capture="environment" data-act="photo" data-id="${n.id}" hidden>
        </label>
        ${refill && total(refill) && isNew ? `<button class="btn big yellow" data-act="refill" data-id="${n.id}">🏪 Titip lagi ke toko ini</button>` : ''}
      </div>`
          : ''
      }
      <div class="photos" id="photos"></div>
      <div class="stack">
        ${isNew ? '<a class="btn big primary" href="#/">🏠 Selesai</a>' : ''}
        ${active ? `<button class="small-danger" data-act="cancel-note" data-id="${n.id}">Batalkan nota ini</button>` : ''}
      </div>
    </main>`;
}

async function fillPhotos(n) {
  const box = document.getElementById('photos');
  if (!box || !n.photos.length) return;
  box.innerHTML = `<p class="muted">Foto nota kertas (${n.photos.length})</p>`;
  for (const id of n.photos) {
    let blob = await D.getPhoto(id);
    if (!blob) {
      const ph = document.createElement('div');
      ph.className = 'photo-wait';
      ph.textContent = '⏳ Mengambil foto…';
      box.append(ph);
      blob = await S.fetchPhoto(n, id).catch(() => null);
      ph.remove();
    }
    if (!blob) continue;
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.alt = 'Foto nota';
    img.onclick = () => photoViewer(URL.createObjectURL(blob));
    box.append(img);
  }
}

function notaList(params) {
  let notes = D.notesNewestFirst().filter((n) => !params.toko || n.storeId === params.toko);
  if (params.foto === 'belum') notes = notes.filter((n) => n.status === 'aktif' && !n.photos.length && n.type !== 'datang');
  const list = notes
    .map((n) => {
      const s = D.storeById(n.storeId);
      const ps = payState(n);
      const qty = n.type === 'cek' ? `laku ${total(n.sold)}` : `${D.noteTotalQty(n)} bks`;
      const badges = [
        `<i class="b type">${{ cek: '💵 Pembayaran', titip: '🏪 Titip', datang: '🚐 Datang' }[n.type]}</i>`,
        n.status === 'batal' ? '<i class="b bad">Batal</i>' : '',
        n.status === 'aktif' && ps ? `<i class="b ${ps.tone}">${ps.text}</i>` : '',
        n.status === 'aktif' && !n.photos.length && n.type !== 'datang' ? '<i class="b warn">📷 Belum foto</i>' : '',
        n.status === 'aktif' && n.photos.length ? '<i class="b ok">📷 Ada foto</i>' : '',
        n.sentAt ? '<i class="b ok">✔ WA</i>' : '',
      ].join('');
      return `<a class="pick note-item ${n.status}" href="#/nota?id=${n.id}">
        <span class="row-sb"><b>${n.no}</b><span>${qty}</span></span>
        <span>${n.type === 'datang' ? `Travel: ${esc(n.courier || '-')}` : esc(s?.name)}${n.receiver ? ` · ${esc(n.receiver)}` : ''}</span>
        <small>${tanggal(n.createdAt)}</small>
        <span class="badges">${badges}</span></a>`;
    })
    .join('');
  const stores = D.activeStores();
  const filter = stores.length > 1
    ? `<select class="input" data-act="filter-store">
        <option value="">Semua toko</option>
        ${stores.map((s) => `<option value="${s.id}" ${params.toko === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>`
    : '';
  const msg = params.foto === 'belum'
    ? `Ini <b>${notes.length} nota</b> yang belum difoto nota kertasnya, ${sapa()}.`
    : notes.length ? `Ada <b>${notes.length} nota</b>. Ketuk salah satu untuk melihat.` : `Belum ada nota, ${sapa()}.`;
  return `
    ${topbar('Daftar Nota')}
    <main class="page">
      ${sani('biasa', msg)}
      ${params.foto ? '<a class="btn big" href="#/daftar-nota">Tampilkan semua nota</a>' : filter}
      <div class="stack">${list}</div>
    </main>`;
}

function storeForm(params) {
  const s = params.id ? D.storeById(params.id) : null;
  const back = params.lanjut === 'titip' ? '#/titip' : '#/setelan';
  return `
    ${topbar(s ? 'Ubah Toko' : 'Toko Baru', back)}
    <main class="page">
      ${sani('biasa', s ? `Mau ubah data <b>${esc(s.name)}</b>?` : `Nama tokonya apa, ${sapa()}? Nomor WA boleh diisi nanti.`)}
      <form class="stack" data-form="store" data-id="${s?.id || ''}" data-lanjut="${esc(params.lanjut || '')}">
        <label class="field">Nama toko <input class="input" name="name" required maxlength="60" value="${esc(s?.name)}" placeholder="contoh: Swalayan Sumber Rejeki"></label>
        <label class="field">Nomor WA toko <input class="input" name="wa" inputmode="tel" maxlength="20" value="${esc(s?.wa ? '0' + s.wa.slice(2) : '')}" placeholder="08xx xxxx xxxx"></label>
        <label class="field">Alamat / catatan <input class="input" name="address" maxlength="120" value="${esc(s?.address)}" placeholder="boleh dikosongkan"></label>
        <button class="btn huge primary" type="submit">💾 Simpan</button>
        ${s ? `<button class="small-danger" type="button" data-act="archive-store" data-id="${s.id}">Hapus toko ini dari daftar</button>` : ''}
      </form>
    </main>`;
}

function settings() {
  const st = D.getState();
  const stores = D.activeStores()
    .map((s) => `<a class="pick" href="#/toko?id=${s.id}"><b>${esc(s.name)}</b><small>${s.wa ? 'WA 0' + s.wa.slice(2) : 'WA belum diisi'}</small></a>`)
    .join('');
  const prices = D.PRODUCTS.map(
    (p) => `<label class="field">${p.name} ${p.size}
      <input class="input" inputmode="numeric" data-act="price" data-id="${p.id}" value="${st.prices[p.id] || ''}" placeholder="Rp (kosongkan bila belum tahu)"></label>`
  ).join('');
  const sizes = [
    ['besar', 'Besar'],
    ['sangat', 'Sangat besar'],
  ]
    .map(([v, l]) => `<button class="btn big ${st.settings.textSize === v ? 'primary' : ''}" data-act="text-size" data-v="${v}">${l}</button>`)
    .join('');
  return `
    ${topbar('Setelan')}
    <main class="page">
      ${sheetSection()}
      <section class="card">
        <h2>Toko titipan</h2>
        <div class="stack">${stores || '<p class="muted">Belum ada toko.</p>'}
          <a class="btn big dashed" href="#/toko">➕ Tambah toko</a></div>
      </section>
      <section class="card">
        <h2>Harga titip per bungkus</h2>
        <p class="muted">Dipakai untuk menghitung nilai nota titip dan nota pembayaran. Boleh dikosongkan.</p>
        <div class="stack">${prices}</div>
      </section>
      <section class="card">
        <h2>Barang dianggap lama setelah</h2>
        <p class="muted">Sani akan mengingatkan untuk menarik bumbu yang sudah selama ini di toko.</p>
        <div class="qty-row">
          <button class="step" data-act="max-days" data-d="-5">−</button>
          <div class="qty-num as-text">${st.settings.maxDays} hari</div>
          <button class="step" data-act="max-days" data-d="5">+</button>
        </div>
      </section>
      <section class="card">
        <h2>Ukuran huruf</h2>
        <div class="row2">${sizes}</div>
      </section>
      <section class="card">
        <h2>Suara Sani</h2>
        <button class="btn big" data-act="toggle-voice">${st.settings.voice ? '🔊 Tombol bacakan: Nyala' : '🔇 Tombol bacakan: Mati'}</button>
      </section>
      <section class="card">
        <h2>Cadangan data</h2>
        <p class="muted">Simpan salinan data (tanpa foto) supaya aman kalau HP rusak atau ganti HP.</p>
        <div class="stack">
          <button class="btn big" data-act="backup">💾 Simpan cadangan</button>
          <label class="btn big">📂 Pulihkan dari cadangan
            <input type="file" accept="application/json,.json" data-act="restore" hidden></label>
        </div>
      </section>
      <p class="whoami">SANI · Staf Andalan Mbok Ni</p>
    </main>`;
}



// ----- Stok di rumah -----
function homeCard() {
  const hs = D.homeStock();
  if (!hs.known) {
    return `<section class="card">
      <h2>🏠 Di rumah</h2>
      <p>Stok di rumah belum diketahui. Hitung sekali dulu nggih, ${sapa()} — sesudah itu Sani yang menjumlahkan barang datang dan titipan.</p>
      <a class="btn big yellow" href="#/hitung-rumah">🧮 Hitung stok di rumah</a>
    </section>`;
  }
  const rows = D.PRODUCTS.map((p) => `<li style="--c:${p.color}"><span>${p.short}</span><b>${Math.max(0, hs.stock[p.id] || 0)}</b></li>`).join('');
  const minus = D.PRODUCTS.some((p) => (hs.stock[p.id] || 0) < 0);
  const tot = D.PRODUCTS.reduce((a, p) => a + Math.max(0, hs.stock[p.id] || 0), 0);
  return `<section class="card store-stock">
    <div class="row-sb"><h2>🏠 Di rumah</h2><b class="big-num">${tot}</b></div>
    ${minus ? `<p class="b warn">Catatan lebih banyak keluar daripada masuk — sebaiknya hitung ulang</p>` : ''}
    <ul class="mini">${rows}</ul>
    <p class="muted small">${hs.lastCount ? `Dihitung terakhir ${tanggal(hs.lastCount, false)}` : 'Belum pernah dihitung'}</p>
    <a class="btn big" href="#/hitung-rumah">🧮 Hitung ulang stok di rumah</a>
  </section>`;
}

function countHome() {
  return `
    ${topbar('Hitung Stok Rumah', '#/stok')}
    <main class="page">
      ${sani('biasa', `${sapa()}, tolong hitung bumbu yang ada di rumah. Angkanya sudah Sani isi sesuai catatan — kalau beda, ubah nggih.`)}
      <div class="stack">${D.PRODUCTS.map((p) => stepper(p, drafts.rumah[p.id] || 0, 'rumah', { plus10: true })).join('')}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="save-count">💾 Simpan hitungan</button>
      </div>
    </main>`;
}

// ----- Barang datang -----
function courierChips(value) {
  const names = D.recentCouriers();
  return names.length
    ? `<div class="chips">${names
        .map((n) => `<button type="button" class="chip ${n === value ? 'on' : ''}" data-act="pick-courier" data-name="${esc(n)}">${esc(n)}</button>`)
        .join('')}</div>`
    : '';
}

function datangPage() {
  const pend = D.pendingSchedules();
  const next = pend[0];
  let mood = 'biasa';
  let msg;
  if (next && D.scheduleDays(next) < 0) {
    mood = 'ingat';
    msg = `Kiriman ${whenText(next).toLowerCase()} belum dicatat datang. Sudah sampai, ${sapa()}?`;
  } else if (next) {
    msg = `Kiriman berikutnya: <b>${whenText(next)}</b>${next.courier ? ` lewat <b>${esc(next.courier)}</b>` : ''}.`;
  } else {
    msg = `Belum ada jadwal kiriman travel, ${sapa()}. Mau Sani catat jadwalnya supaya tidak lupa?`;
  }
  const cards = pend
    .map(
      (sc) => `<div class="card sched ${D.scheduleDays(sc) < 0 ? 'late' : ''}">
        <p class="muted">${HARI[new Date(sc.date + 'T00:00').getDay()]}, ${tanggal(sc.date + 'T00:00', false)}</p>
        <h2>${whenText(sc)}</h2>
        <p>${sc.courier ? `🚐 <b>${esc(sc.courier)}</b>` : '🚐 Travel'}${sc.note ? `<br>📝 ${esc(sc.note)}` : ''}</p>
        <div class="stack">
          ${sc.phone ? `<a class="btn big" href="tel:${esc(sc.phone)}">📞 Telepon ${esc(sc.phone)}</a>` : ''}
          <button class="btn big" data-act="add-calendar" data-id="${sc.id}">📅 Masukkan ke kalender HP</button>
          <div class="row2">
            <a class="btn big" href="#/jadwal?id=${sc.id}">✏️ Ubah</a>
            <button class="btn big" data-act="cancel-schedule" data-id="${sc.id}">✖ Batal</button>
          </div>
        </div>
      </div>`
    )
    .join('');
  const history = D.notesNewestFirst()
    .filter((n) => n.type === 'datang')
    .slice(0, 5)
    .map(
      (n) => `<a class="pick note-item ${n.status}" href="#/nota?id=${n.id}">
        <span class="row-sb"><b>${tanggal(n.createdAt, false)}</b><span>${D.noteTotalQty(n)} bks</span></span>
        <small>${n.no}${n.courier ? ` · ${esc(n.courier)}` : ''}${n.status === 'batal' ? ' · batal' : ''}</small></a>`
    )
    .join('');
  return `
    ${topbar('Barang Datang')}
    <main class="page">
      ${sani(mood, msg)}
      <button class="btn huge primary" data-act="start-datang">📦 Barang sudah datang — catat</button>
      <a class="btn big yellow" href="#/jadwal">🗓️ Jadwalkan kiriman travel</a>
      ${cards ? `<h2 class="section-h">Jadwal kiriman</h2>${cards}` : ''}
      ${history ? `<h2 class="section-h">Barang datang terakhir</h2><div class="stack">${history}</div>` : ''}
    </main>`;
}

function datangQty() {
  const dr = drafts.datang;
  const sc = dr.scheduleId && D.scheduleById(dr.scheduleId);
  const sum = total(dr.items);
  const msg = `Berapa bungkus yang datang, ${sapa()}?${sc ? ` Ini untuk kiriman <b>${whenText(sc).toLowerCase()}</b>${sc.courier ? ` (${esc(sc.courier)})` : ''}.` : ''}`;
  return `
    ${topbar('Jumlah Datang', '#/datang')}
    <main class="page">
      ${sani('biasa', msg)}
      <div class="stack">${D.PRODUCTS.map((p) => stepper(p, dr.items[p.id] || 0, 'datang', { plus10: true })).join('')}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="go" data-to="#/datang-cek" ${sum ? '' : 'disabled'}>Lanjut (${sum} bungkus) ›</button>
      </div>
    </main>`;
}

function datangCheck() {
  const dr = drafts.datang;
  const sum = total(dr.items);
  if (!sum) return redirect('#/datang');
  const parts = D.PRODUCTS.filter((p) => dr.items[p.id]).map((p) => `${p.short} ${dr.items[p.id]} bungkus`);
  return `
    ${topbar('Cek Ulang', '#/datang-jumlah')}
    <main class="page">
      ${sani('biasa', `Sani bacakan nggih, ${sapa()}. Barang datang: ${parts.join(', ')}. Sudah betul?`)}
      <div class="card">
        <ul class="sum">${sumList(dr.items)}</ul>
        <p class="sum-total">Jumlah <b>${sum} bungkus</b></p>
      </div>
      <div class="card">
        <label class="field">Nama travel / sopir (boleh kosong)
          <input class="input" data-act="courier" value="${esc(dr.courier)}" maxlength="40" placeholder="contoh: Travel Jaya" autocomplete="off">
        </label>
        ${courierChips(dr.courier)}
      </div>
      <div class="stack">
        <button class="btn huge primary" data-act="create-datang">✔ Betul, simpan</button>
        <a class="btn big ghost" href="#/datang-jumlah">✏️ Ubah jumlah</a>
      </div>
    </main>`;
}

function scheduleForm(params) {
  const sc = params.id ? D.scheduleById(params.id) : null;
  const tmr = new Date(Date.now() + 864e5);
  const def = `${tmr.getFullYear()}-${String(tmr.getMonth() + 1).padStart(2, '0')}-${String(tmr.getDate()).padStart(2, '0')}`;
  return `
    ${topbar(sc ? 'Ubah Jadwal' : 'Jadwal Kiriman', '#/datang')}
    <main class="page">
      ${sani('biasa', `Kapan travel-nya datang, ${sapa()}? Nanti Sani ingatkan di halaman awal, dan bisa dimasukkan ke kalender HP.`)}
      <form class="stack" data-form="schedule" data-id="${sc?.id || ''}">
        <label class="field">Tanggal <input class="input" type="date" name="date" required value="${sc?.date || def}"></label>
        <label class="field">Jam (kira-kira) <input class="input" type="time" name="time" value="${sc?.time || '10:00'}"></label>
        <div class="card">
          <label class="field">Nama travel / sopir <input class="input" name="courier" data-act="courier-form" maxlength="40" value="${esc(sc?.courier)}" placeholder="contoh: Travel Jaya" autocomplete="off"></label>
          ${courierChips(sc?.courier)}
        </div>
        <label class="field">No. HP sopir <input class="input" name="phone" inputmode="tel" maxlength="20" value="${esc(sc?.phone)}" placeholder="boleh dikosongkan"></label>
        <label class="field">Catatan <input class="input" name="note" maxlength="100" value="${esc(sc?.note)}" placeholder="contoh: ambil di pool travel"></label>
        <button class="btn huge primary" type="submit">💾 Simpan jadwal</button>
      </form>
    </main>`;
}

// Masukkan jadwal ke kalender HP: iPhone pakai file .ics, Android pakai Google Calendar.
function addToCalendar(sc) {
  const [y, m, d] = sc.date.split('-').map(Number);
  const [hh, mm] = (sc.time || '09:00').split(':').map(Number);
  const start = new Date(y, m - 1, d, hh, mm);
  const end = new Date(start.getTime() + 3600e3);
  const f = (t) => `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}${String(t.getMinutes()).padStart(2, '0')}00`;
  const title = `Kiriman Mbok Ni datang${sc.courier ? ` (${sc.courier})` : ''}`;
  const details = [sc.phone ? `HP sopir: ${sc.phone}` : '', sc.note || '', 'Dicatat SANI · Mbok Ni'].filter(Boolean).join('\n');
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mbok Ni//SANI//ID', 'BEGIN:VEVENT',
      `UID:${sc.id}@mbokni`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${title}`, `DESCRIPTION:${details.replace(/\n/g, '\\n')}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:Besok: ${title}`, 'END:VALARM',
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    download(new Blob([ics], { type: 'text/calendar' }), 'kiriman-mbokni.ics');
  } else {
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(start)}/${f(end)}&details=${encodeURIComponent(details)}`;
    window.open(url, '_blank');
  }
}

// ----- Google Sheet -----
function sheetSection() {
  const sy = D.getState().sync;
  if (!S.isConfigured()) {
    return `<section class="card">
      <h2>☁️ Google Sheet</h2>
      <p class="muted">Supaya catatan di semua HP sama dan tersimpan aman di Google Sheet. Cara memasang ada di panduan <b>CARA-PASANG</b>.</p>
      <form class="stack" data-form="sync">
        <label class="field">Alamat Web App (atau tempel link sambung) <input class="input" name="url" required placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
        <label class="field">Kode rahasia <input class="input" name="token" autocomplete="off" autocapitalize="characters" placeholder="tidak perlu bila menempel link sambung"></label>
        <button class="btn big primary" type="submit">🔗 Sambungkan</button>
      </form>
    </section>`;
  }
  return `<section class="card">
    <h2>☁️ Google Sheet</h2>
    <p>Tersambung${sy.name ? ` ke <b>${esc(sy.name)}</b>` : ''}.</p>
    ${syncLine()}
    <div class="stack">
      <button class="btn big primary" data-act="sync-now">🔄 Sinkron sekarang</button>
      <button class="btn big" data-act="share-link">📤 Kirim link sambung ke HP lain</button>
      <button class="small-danger" data-act="sync-off">Putuskan sambungan</button>
    </div>
  </section>`;
}

function connectLink() {
  const { url, token } = D.getState().sync;
  return `${location.origin}${location.pathname}#/sambung?u=${encodeURIComponent(url)}&k=${encodeURIComponent(token)}`;
}

function connectPage(params) {
  if (!params.u || !params.k) return redirect('#/');
  return `
    ${topbar('Sambungkan')}
    <main class="page">
      ${sani('biasa', `${sapa()}, sambungkan HP ini ke Google Sheet Mbok Ni? Sesudah tersambung, catatan di semua HP jadi sama.`)}
      <button class="btn huge primary" data-act="connect-link" data-u="${esc(params.u)}" data-k="${esc(params.k)}">✔ Ya, sambungkan</button>
      <a class="btn big ghost" href="#/">Nanti saja</a>
    </main>`;
}

// ----- Stok & rekap -----
function tabs(active) {
  return `
    <div class="row2 tabs">
      <a class="btn big ${active === 'stok' ? 'primary' : ''}" href="#/stok">📦 Stok</a>
      <a class="btn big ${active === 'rekap' ? 'primary' : ''}" href="#/rekap">📊 Rekap</a>
    </div>`;
}

// Batang mendatar satu warna, angka di ujung batang.
function bars(rows, unit = '') {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="bars">${rows
    .map(
      (r) => `<div class="bar-row">
        <span class="bar-label">${r.dot ? `<i class="dot" style="background:${r.dot}"></i>` : ''}${r.label}</span>
        <span class="bar-track"><span class="bar" style="width:${(r.value / max) * 100}%"></span><b>${r.value}${unit}</b></span>
      </div>`
    )
    .join('')}</div>`;
}

function stockPage() {
  const stores = D.activeStores();
  const all = {};
  const cards = stores
    .map((s) => {
      const st = D.stockAtStore(s.id);
      for (const [k, v] of Object.entries(st)) all[k] = (all[k] || 0) + v;
      const old = D.oldItemsAtStore(s.id);
      const rows = D.PRODUCTS.map((p) => `<li style="--c:${p.color}"><span>${p.short}</span><b>${st[p.id] || 0}</b></li>`).join('');
      return `<div class="card store-stock">
        <div class="row-sb"><h2>${esc(s.name)}</h2><b class="big-num">${total(st)}</b></div>
        ${old.length ? `<p class="b warn">⏰ Ada bumbu ${Math.max(...old.map((o) => o.days))} hari di toko</p>` : ''}
        <ul class="mini">${rows}</ul>
        <button class="btn big" data-act="pick-cek" data-id="${s.id}">🔍 Cek toko ini</button>
      </div>`;
    })
    .join('');
  const sum = total(all);
  const msg = stores.length
    ? `Menurut catatan Sani, ada <b>${sum} bungkus</b> di ${stores.length} toko, ${sapa()}.`
    : `Belum ada toko yang dicatat, ${sapa()}.`;
  return `
    ${topbar('Stok &amp; Rekap')}
    <main class="page">
      ${tabs('stok')}
      ${sani('biasa', msg)}
      ${homeCard()}
      ${stores.length ? `<section class="card"><h2>Di semua toko</h2>${bars(D.PRODUCTS.map((p) => ({ label: p.short, dot: p.color, value: all[p.id] || 0 })))}</section>` : ''}
      ${cards}
      <p class="muted small">Pesanan Shopee belum mengurangi stok di rumah (menunggu fitur Shopee).</p>
    </main>`;
}

function rekapPage(params) {
  const pid = PERIODS.some((x) => x.id === params.p) ? params.p : 'minggu';
  const per = period(pid);
  const label = PERIODS.find((x) => x.id === pid).label;
  const r = D.recap(per.from, per.to);
  const sold = total(r.sold);
  const titip = total(r.titip);
  const pulled = total(r.pulled);
  const stores = topStores(r);
  const pills = PERIODS.map((x) => `<a class="btn ${x.id === pid ? 'primary' : ''}" href="#/rekap?p=${x.id}">${x.label}</a>`).join('');

  let msg;
  if (!sold && !titip && !r.received) msg = `${label} belum ada catatan titip atau cek toko, ${sapa()}.`;
  else {
    msg = `${label} laku <b>${sold} bungkus</b>, uang masuk <b>${rupiah(r.received)}</b>.`;
    if (stores[0]) msg += ` Paling laris di <b>${esc(stores[0].name)}</b>.`;
  }

  const suggest = D.activeStores()
    .map((s) => ({ s, sug: D.suggestion(s.id) }))
    .filter((x) => x.sug && total(x.sug.qty))
    .map(({ s, sug }) => {
      const items = D.PRODUCTS.filter((p) => sug.qty[p.id]).map((p) => `${p.short} <b>${sug.qty[p.id]}</b>`).join(', ');
      return `<div class="sug">
        <p><b>${esc(s.name)}</b><br>${items}<br><small>kira-kira cukup untuk ${sug.interval} hari</small></p>
        <button class="btn big yellow" data-act="titip-suggest" data-id="${s.id}">🏪 Titip sesuai saran</button>
      </div>`;
    })
    .join('');

  return `
    ${topbar('Stok &amp; Rekap')}
    <main class="page">
      ${tabs('rekap')}
      <div class="pills">${pills}</div>
      <p class="muted center">${per.title}</p>
      ${sani(sold ? 'senang' : 'biasa', msg)}
      <div class="stats">
        <div class="stat"><small>Laku</small><b>${sold}</b><span>bungkus</span></div>
        <div class="stat"><small>Uang masuk</small><b class="money">${rupiah(r.received)}</b></div>
        <div class="stat"><small>Dititip</small><b>${titip}</b><span>bungkus</span></div>
        <div class="stat ${r.owed ? 'warn' : ''}"><small>Belum dibayar</small><b class="money">${rupiah(r.owed)}</b><span>semua toko</span></div>
      </div>
      ${r.salesUnknown ? `<p class="muted small">${r.salesUnknown} bungkus laku belum dihitung uangnya karena harga titip belum diisi di Setelan.</p>` : ''}
      <section class="card"><h2>Laku per produk</h2>${bars(D.PRODUCTS.map((p) => ({ label: p.short, dot: p.color, value: r.sold[p.id] || 0 })))}
        ${pulled ? `<p class="muted">Ditarik: <b>${pulled} bungkus</b></p>` : ''}
        ${total(r.datang) ? `<p class="muted">Barang datang dari travel: <b>${total(r.datang)} bungkus</b></p>` : ''}</section>
      ${stores.length ? `<section class="card"><h2>Toko terlaris</h2>${bars(stores.map((x, i) => ({ label: `${i + 1}. ${esc(x.name)}`, value: x.qty })))}</section>` : ''}
      ${suggest ? `<section class="card"><h2>Saran titip dari Sani</h2><div class="stack">${suggest}</div></section>` : ''}
      <button class="btn huge wa" data-act="share-rekap" data-p="${pid}">🖼️ Kirim rekap (gambar)</button>
    </main>`;
}

// ---------- Router ----------
function parse() {
  const [path, q] = location.hash.replace(/^#\/?/, '').split('?');
  return { path, params: Object.fromEntries(new URLSearchParams(q || '')) };
}

function redirect(hash) {
  setTimeout(() => location.replace(hash), 0);
  return '';
}

function render() {
  const { path, params } = parse();
  const view = routes[path] || home;
  if (path === 'hitung-rumah' && render.last !== location.hash) {
    const hs = D.homeStock().stock;
    drafts.rumah = Object.fromEntries(D.PRODUCTS.map((p) => [p.id, Math.max(0, hs[p.id] || 0)]));
  }
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const y = window.scrollY;
  const same = render.last === location.hash;
  render.last = location.hash;
  $app.innerHTML = view(params);
  window.scrollTo(0, same ? y : 0); // tetap di posisi yang sama saat angka diubah
  if (path === 'nota') {
    const n = D.noteById(params.id);
    if (n) fillPhotos(n);
  }
}

function applySettings() {
  document.documentElement.dataset.size = D.getState().settings.textSize;
}

async function needReceiver(draft) {
  if (draft.receiver.trim()) return true;
  await confirmBox({
    mood: 'khawatir',
    text: `Nama petugas tokonya belum diisi, ${sapa()}. Tulis dulu nggih, supaya jelas siapa yang menerima.`,
    yes: 'Nggih, saya isi',
    no: null,
  });
  document.querySelector('[data-act="receiver"]')?.focus();
  return false;
}

// ---------- Aksi ----------
$app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  buzz();

  if (act === 'speak') {
    speak(el.closest('.bubble').querySelector('p').textContent);
  } else if (act === 'go') {
    location.hash = el.dataset.to;
  } else if (act === 'soon') {
    await confirmBox({ mood: 'ingat', text: `${el.dataset.what} masih Sani siapkan nggih, ${sapa()}. Sabar sebentar.`, yes: 'Nggih', no: null });
  } else if (act === 'pick-store') {
    S.syncNow();
    if (drafts.titip.storeId !== id) startTitip(id);
    location.hash = '#/jumlah';
  } else if (act === 'pick-cek') {
    S.syncNow();
    startCek(id);
    location.hash = '#/cek-hitung';
  } else if (act === 'show-all') {
    drafts.cek.showAll = true;
    render();
  } else if (act === 'qty') {
    const t = qtyTarget(el.dataset.draft);
    const max = el.dataset.draft === 'tarik' ? drafts.cek.counted[id] || 0 : Infinity;
    t[id] = Math.min(max, Math.max(0, (t[id] || 0) + Number(el.dataset.d)));
    render();
  } else if (act === 'qty-type') {
    const p = D.productById(id);
    const t = qtyTarget(el.dataset.draft);
    const v = await numberBox({ text: `Berapa bungkus <b>${p.name}</b>, ${sapa()}?`, value: t[id] || 0, unit: 'bungkus' });
    if (v != null) {
      t[id] = Math.min(Number(el.dataset.max), v);
      render();
    }
  } else if (act === 'pick-receiver') {
    const dr = drafts[el.dataset.draft];
    dr.receiver = el.dataset.name;
    render();
  } else if (act === 'create-titip') {
    const dr = drafts.titip;
    if (!(await needReceiver(dr))) return;
    const items = Object.fromEntries(Object.entries(dr.items).filter(([, q]) => q > 0));
    const n = D.createTitipNote(dr.storeId, items, dr.receiver);
    startTitip(null);
    location.replace(`#/nota?id=${n.id}&baru=1`);
  } else if (act === 'pay-mode') {
    const mode = el.dataset.mode;
    const { bill } = cekCalc();
    if (mode === 'sebagian' || mode === 'manual') {
      const v = await numberBox({
        text: mode === 'manual' ? `Berapa uang yang diterima dari toko, ${sapa()}?` : `Dibayar berapa, ${sapa()}? Totalnya ${rupiah(bill)}.`,
        value: drafts.cek.pay?.amount || '',
        unit: 'Rp',
      });
      if (v == null) return;
      if (mode === 'sebagian' && v >= bill) drafts.cek.pay = { mode: 'lunas' };
      else drafts.cek.pay = v > 0 ? { mode, amount: v } : { mode: 'belum' };
    } else {
      drafts.cek.pay = { mode };
    }
    render();
  } else if (act === 'create-cek') {
    const dr = drafts.cek;
    const { expected, sold, bill } = cekCalc();
    if (total(sold) && !dr.pay) {
      await confirmBox({ mood: 'khawatir', text: `Sudah dibayar atau belum, ${sapa()}? Pilih dulu di bagian <b>Pembayaran</b> nggih.`, yes: 'Nggih', no: null });
      return;
    }
    if (!(await needReceiver(dr))) return;
    let amount = bill;
    let paid = 0;
    if (dr.pay?.mode === 'lunas') paid = bill;
    else if (dr.pay?.mode === 'sebagian') paid = dr.pay.amount;
    else if (dr.pay?.mode === 'manual') amount = paid = dr.pay.amount;
    if (!total(sold)) amount = null;
    const n = D.createCekNote({ storeId: dr.storeId, expected, counted: dr.counted, pulled: dr.pulled, receiver: dr.receiver, amount, paid });
    startCek(null);
    location.replace(`#/nota?id=${n.id}&baru=1`);
  } else if (act === 'add-payment') {
    const n = D.noteById(id);
    const owed = D.owedOf(n);
    const v = await numberBox({ text: `Toko bayar berapa, ${sapa()}? Kurangnya ${rupiah(owed)}.`, value: owed, unit: 'Rp' });
    if (v > 0) {
      D.addPayment(id, Math.min(v, owed));
      toast(v >= owed ? 'Lunas ✔' : 'Pembayaran dicatat ✔');
      render();
    }
  } else if (act === 'refill') {
    const n = D.noteById(id);
    const sug = D.suggestion(n.storeId);
    let items = sug ? sug.qty : {};
    if (!total(items)) {
      items = { ...n.sold };
      for (const [k, v] of Object.entries(n.pulled)) items[k] = (items[k] || 0) + v;
    }
    startTitip(n.storeId, items);
    drafts.titip.fromCek = true;
    location.hash = '#/jumlah';
  } else if (act === 'send-wa') {
    const n = D.noteById(id);
    D.markSent(id);
    window.open(waLink(n), '_blank');
    render();
  } else if (act === 'share-img') {
    await shareImage(D.noteById(id));
  } else if (act === 'cancel-note') {
    const n = D.noteById(id);
    const ok = await confirmBox({
      text: `Yakin nota <b>${n.no}</b> dibatalkan, ${sapa()}? Nota tetap tersimpan tapi ditandai batal.`,
      yes: 'Ya, batalkan',
      no: 'Jangan',
      danger: true,
    });
    if (ok) {
      D.cancelNote(id);
      toast('Nota dibatalkan');
      render();
    }
  } else if (act === 'archive-store') {
    const s = D.storeById(id);
    const ok = await confirmBox({ text: `Hapus <b>${esc(s.name)}</b> dari daftar toko? Nota lamanya tetap tersimpan.`, yes: 'Ya, hapus', no: 'Jangan', danger: true });
    if (ok) {
      D.archiveStore(id);
      location.hash = '#/setelan';
    }
  } else if (act === 'max-days') {
    D.setSetting('maxDays', Math.min(90, Math.max(5, D.getState().settings.maxDays + Number(el.dataset.d))));
    render();
  } else if (act === 'text-size') {
    D.setSetting('textSize', el.dataset.v);
    applySettings();
    render();
  } else if (act === 'toggle-voice') {
    D.setSetting('voice', !D.getState().settings.voice);
    render();
  } else if (act === 'start-datang') {
    S.syncNow();
    startDatang();
    location.hash = '#/datang-jumlah';
  } else if (act === 'pick-courier') {
    const input = document.querySelector('[data-act="courier"], [data-act="courier-form"]');
    if (input) input.value = el.dataset.name;
    drafts.datang.courier = el.dataset.name;
    document.querySelectorAll('.chip[data-act="pick-courier"]').forEach((c) => c.classList.toggle('on', c === el));
  } else if (act === 'create-datang') {
    const dr = drafts.datang;
    const items = Object.fromEntries(Object.entries(dr.items).filter(([, q]) => q > 0));
    const n = D.createDatangNote(items, dr.courier, dr.scheduleId);
    drafts.datang = { items: {}, courier: '', scheduleId: null };
    location.replace(`#/nota?id=${n.id}&baru=1`);
  } else if (act === 'add-calendar') {
    addToCalendar(D.scheduleById(id));
  } else if (act === 'cancel-schedule') {
    const sc = D.scheduleById(id);
    if (await confirmBox({ text: `Batalkan jadwal kiriman <b>${whenText(sc).toLowerCase()}</b>?`, yes: 'Ya, batalkan', no: 'Jangan', danger: true })) {
      D.cancelSchedule(id);
      render();
    }
  } else if (act === 'save-count') {
    const ok = await confirmBox({ mood: 'biasa', text: `Simpan hitungan stok di rumah: ${D.PRODUCTS.map((p) => `${p.short} ${drafts.rumah[p.id] || 0}`).join(', ')}?`, yes: 'Ya, simpan', no: 'Belum' });
    if (ok) {
      D.saveCount(drafts.rumah);
      toast('Stok rumah disimpan ✔');
      location.hash = '#/stok';
    }
  } else if (act === 'sync-now') {
    toast('Sinkron…');
    const r = await S.syncNow();
    toast(r.ok ? 'Sudah sama dengan Sheet ✔' : r.offline ? 'Belum ada sinyal' : `Gagal: ${r.error}`);
    render();
  } else if (act === 'share-link') {
    const link = connectLink();
    const text = `Buka link ini di HP Juragan supaya SANI tersambung ke Google Sheet Mbok Ni:\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        /* dibatalkan */
      }
    } else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  } else if (act === 'sync-off') {
    if (await confirmBox({ text: 'Putuskan sambungan ke Google Sheet? Data di HP ini tetap ada.', yes: 'Ya, putuskan', no: 'Jangan', danger: true })) {
      D.setSync({ url: '', token: '', since: 0, error: '', name: '' });
      render();
    }
  } else if (act === 'connect-link') {
    toast('Menyambungkan…');
    const r = await S.testConnection(el.dataset.u, el.dataset.k);
    if (!r.ok) {
      await confirmBox({ text: `Maaf, belum bisa tersambung: ${esc(r.error)}.`, yes: 'Nggih', no: null });
      return;
    }
    await S.syncNow();
    toast('Tersambung ke Google Sheet ✔');
    location.replace('#/');
  } else if (act === 'use-suggest') {
    drafts.titip.items = { ...D.suggestion(drafts.titip.storeId).qty };
    render();
  } else if (act === 'titip-suggest') {
    startTitip(id, D.suggestion(id)?.qty || {});
    drafts.titip.fromCek = true;
    location.hash = '#/jumlah';
  } else if (act === 'share-rekap') {
    const pid = el.dataset.p;
    const per = period(pid);
    const label = PERIODS.find((x) => x.id === pid).label;
    const blob = await rekapImage(D.recap(per.from, per.to), per, label);
    const file = new File([blob], `rekap-mbokni-${pid}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        /* dibatalkan */
      }
    } else download(blob, file.name);
  } else if (act === 'backup') {
    await backup();
  }
});

// Ketik nama penerima: simpan ke draf tanpa menggambar ulang (supaya keyboard tidak tertutup).
$app.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.act === 'courier') drafts.datang.courier = el.value;
  if (el.dataset.act === 'receiver') {
    drafts[el.dataset.draft].receiver = el.value;
    el.closest('.card')?.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.name === el.value));
  }
});

$app.addEventListener('change', async (e) => {
  const el = e.target;
  const act = el.dataset.act;
  if (act === 'photo' && el.files[0]) {
    toast('Menyimpan foto…');
    const blob = await D.compressPhoto(el.files[0]);
    await D.addPhotoToNote(el.dataset.id, blob);
    render();
    toast('Foto nota tersimpan ✔');
  } else if (act === 'price') {
    D.setPrice(el.dataset.id, el.value);
    toast('Harga disimpan ✔');
  } else if (act === 'filter-store') {
    location.hash = el.value ? `#/daftar-nota?toko=${el.value}` : '#/daftar-nota';
  } else if (act === 'restore' && el.files[0]) {
    const ok = await confirmBox({ text: 'Data di HP ini akan diganti dengan isi cadangan. Lanjutkan?', yes: 'Ya, pulihkan', no: 'Batal', danger: true });
    if (!ok) return;
    try {
      D.importData(await el.files[0].text());
      applySettings();
      toast('Data berhasil dipulihkan ✔');
      location.hash = '#/';
    } catch (err) {
      await confirmBox({ text: `Maaf, file itu tidak bisa dibaca. (${esc(err.message)})`, yes: 'Nggih', no: null });
    }
  }
});

$app.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.dataset.form === 'schedule') {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    const id = D.saveSchedule({ id: f.dataset.id || null, ...data });
    location.replace('#/datang');
    if (await confirmBox({ mood: 'senang', text: `Jadwal disimpan, ${sapa()}. Mau Sani masukkan ke <b>kalender HP</b> supaya ada pengingat?`, yes: '📅 Ya, masukkan', no: 'Tidak usah' })) {
      addToCalendar(D.scheduleById(id));
    }
    return;
  }
  if (f.dataset.form === 'sync') {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(f));
    let url = data.url.trim();
    let token = data.token.trim().toUpperCase();
    // Boleh juga menempel "link sambung" utuh dari HP lain
    const m = url.match(/#\/sambung\?(.*)$/);
    if (m) {
      const q = new URLSearchParams(m[1]);
      url = q.get('u') || '';
      token = (q.get('k') || '').toUpperCase();
    }
    if (!url || !token) {
      await confirmBox({ text: 'Alamat dan kode rahasia perlu diisi, atau tempel link sambung dari HP lain.', yes: 'Nggih', no: null });
      return;
    }
    toast('Menyambungkan…');
    const r = await S.testConnection(url, token);
    if (!r.ok) {
      await confirmBox({ text: `Maaf, belum bisa tersambung: ${esc(r.error)}.`, yes: 'Nggih', no: null });
      return;
    }
    await S.syncNow();
    toast('Tersambung ke Google Sheet ✔');
    render();
    return;
  }
  if (f.dataset.form !== 'store') return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(f));
  if (!data.name.trim()) return;
  const id = D.saveStore({ id: f.dataset.id || null, ...data });
  toast('Toko disimpan ✔');
  if (f.dataset.lanjut === 'titip') {
    startTitip(id);
    location.replace('#/jumlah');
  } else {
    location.replace('#/setelan');
  }
});

async function shareImage(n) {
  const blob = await notaImage(n);
  const file = new File([blob], `${n.no}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: notaText(n) });
      D.markSent(n.id);
      render();
    } catch {
      /* dibatalkan */
    }
  } else {
    download(blob, file.name);
  }
}

async function backup() {
  const name = `cadangan-mbokni-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([D.exportData()], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch {
      /* dibatalkan */
    }
  } else {
    download(file, name);
  }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Kedip sesekali supaya Sani terasa hidup.
setInterval(() => {
  document.querySelectorAll('.sani-img[data-mood="biasa"], .sani-img[data-mood="senang"]').forEach((el) => {
    const mood = el.dataset.mood;
    el.innerHTML = saniSVG('kedip');
    setTimeout(() => (el.innerHTML = saniSVG(mood)), 160);
  });
}, 4200);

window.addEventListener('hashchange', render);
applySettings();
render();

// ---------- Sinkron otomatis ----------
D.onChange(() => {
  if (D.dirtyRecords().length) S.syncSoon();
});
const SAFE_TO_REDRAW = ['', 'stok', 'rekap', 'daftar-nota', 'nota', 'datang'];
S.onSyncDone(async (r) => {
  const { path } = parse();
  if (r.renumbered && r.renumbered.length) {
    const list = r.renumbered.map((x) => `<b>${x.from}</b> → <b>${x.to}</b>`).join(', ');
    await confirmBox({ mood: 'ingat', text: `${sapa()}, nomor nota berubah karena dibuat bersamaan di HP lain: ${list}. Kalau sudah terkirim ke WA, kirim ulang nggih.`, yes: 'Nggih', no: null });
  }
  if (SAFE_TO_REDRAW.includes(path) && !document.querySelector('.modal')) render();
});
S.syncNow();
window.addEventListener('online', () => S.syncNow());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && S.syncNow());
setInterval(() => S.syncNow(), 5 * 60 * 1000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
