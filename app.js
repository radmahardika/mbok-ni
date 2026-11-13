import { saniSVG } from './sani.js';
import * as D from './data.js';
import { notaDoc, notaText, waLink, notaImage, tanggal, jam, rupiah, payState } from './nota.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const buzz = () => navigator.vibrate && navigator.vibrate(15);
const total = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);

// Sapaan sesuai pengguna: "Pak" / "Bu".
const sapa = () => (D.getState().user === 'Ibu' ? 'Bu' : 'Pak');

function salam() {
  const h = new Date().getHours();
  if (h < 11) return 'Sugeng enjang';
  if (h < 15) return 'Sugeng siang';
  if (h < 18) return 'Sugeng sonten';
  return 'Sugeng dalu';
}

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
};
// Kunci isian stepper -> objek angka yang diubah.
const qtyTarget = (key) => ({ titip: drafts.titip.items, hitung: drafts.cek.counted, tarik: drafts.cek.pulled })[key];

function startTitip(storeId, items = {}) {
  drafts.titip = { storeId, items: { ...items }, receiver: '' };
}

function startCek(storeId) {
  drafts.cek = { storeId, counted: { ...D.stockAtStore(storeId) }, pulled: {}, receiver: '', pay: null };
}

// ---------- Halaman ----------
const routes = {
  '': home,
  pengguna: chooseUser,
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
};

function chooseUser() {
  return `
    <main class="page">
      ${sani('senang', 'Sugeng rawuh! Sani di sini, <b>Staf Andalan Mbok Ni</b>. Ini HP siapa nggih?')}
      <div class="stack">
        <button class="btn huge primary" data-act="user" data-user="Bapak">👨 Saya Bapak</button>
        <button class="btn huge primary" data-act="user" data-user="Ibu">👩 Saya Ibu</button>
      </div>
    </main>`;
}

// Pengingat untuk beranda, paling penting di atas.
function reminders() {
  const out = [];
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
  const noPhoto = D.getState().notes.filter((n) => n.status === 'aktif' && !n.photos.length);
  if (noPhoto.length) out.push({ icon: '📷', text: `<b>${noPhoto.length} nota</b> belum difoto nota kertasnya.`, href: '#/daftar-nota?foto=belum' });
  return out;
}

function home() {
  const st = D.getState();
  if (!st.user) return chooseUser();
  const stores = D.activeStores();
  const rem = reminders();
  let msg;
  let mood = 'senang';
  if (!stores.length) {
    msg = `${salam()}, ${sapa()}! Belum ada toko yang dicatat. Ketuk <b>Titip ke Toko</b>, nanti Sani bantu tambahkan tokonya.`;
  } else if (rem.length) {
    mood = 'ingat';
    msg = `${salam()}, ${sapa()}! Ada <b>${rem.length} hal</b> yang perlu diperhatikan hari ini.`;
  } else {
    msg = `${salam()}, ${sapa()}! Semua beres. Mau titip atau cek toko hari ini?`;
  }
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
        <a class="tile yellow" href="#/cek-toko"><span class="ico">🔍</span><span>Cek Toko &amp; Tagih</span></a>
        <button class="tile soon" data-act="soon" data-what="Stok dan rekap"><span class="ico">📊</span><span>Stok &amp; Rekap</span><small>Segera</small></button>
        <button class="tile soon" data-act="soon" data-what="Pesanan Shopee"><span class="ico">🛒</span><span>Pesanan Shopee</span><small>Segera</small></button>
      </nav>
      <div class="row2">
        <a class="btn big" href="#/daftar-nota">📄 Daftar Nota</a>
        <a class="btn big" href="#/setelan">⚙️ Setelan</a>
      </div>
      <p class="whoami">Dipakai oleh: <b>${st.user}</b></p>
    </main>`;
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
  const msg = dr.fromCek
    ? `Titip lagi ke <b>${esc(s.name)}</b>. Sani sudah isi sesuai yang laku dan ditarik tadi — boleh diubah nggih, ${sapa()}.`
    : `Titip ke <b>${esc(s.name)}</b>. Berapa bungkus masing-masing, ${sapa()}? Ketuk <b>+</b> untuk menambah.`;
  return `
    ${topbar('Jumlah Titipan', '#/titip')}
    <main class="page">
      ${sani('biasa', msg)}
      <div class="stack">${D.PRODUCTS.map((p) => stepper(p, dr.items[p.id] || 0, 'titip', { plus10: true })).join('')}</div>
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

// ----- Cek toko & tagih -----
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
    ${topbar('Cek Toko &amp; Tagih')}
    <main class="page">
      ${sani('biasa', stores.length ? `Mau cek toko mana, ${sapa()}? Nanti Sani bantu hitung yang laku dan tagihannya.` : `Belum ada toko, ${sapa()}. Titip barang dulu nggih.`)}
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
  if (soldQty) parts.push(`Yang laku <b>${soldQty} bungkus</b>${bill != null ? `, tagihannya <b>${rupiah(bill)}</b>` : ''}.`);
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
        <p class="sum-total">Tagihan <b>${rupiah(bill)}</b></p>
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
        <p class="muted">Harga titip belum diisi di Setelan, jadi Sani belum bisa menghitung tagihan.</p>
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
        <p class="muted">Toko</p>
        <h2>${esc(d.store)}</h2>
        ${d.receiver ? `<p class="receiver">${d.receiverLabel}: <b>${esc(d.receiver)}</b></p>` : ''}
        ${sections}
        ${d.empty ? `<p>${d.empty}</p>` : ''}
        ${d.totals.map(([k, v]) => `<p class="sum-total">${k} <b>${v}</b></p>`).join('')}
        ${d.status ? `<p class="pay-pill ${d.status.tone}">${d.status.text}</p>` : ''}
        <p class="muted small">Dicatat ${n.createdBy || ''} · ${jam(n.createdAt)}${n.sentAt ? ' · ✔ sudah dikirim ke WA' : ''}</p>
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
  } else if (isNew) {
    msg = `Nota <b>${n.no}</b> sudah jadi, ${sapa()}! Sekarang kirim ke WA toko, lalu foto nota kertasnya nggih.`;
  } else if (owed) {
    mood = 'ingat';
    msg = `${esc(s?.name)} masih kurang bayar <b>${rupiah(owed)}</b>, ${sapa()}.`;
  } else if (!n.photos.length) {
    mood = 'ingat';
    msg = `Nota kertas untuk <b>${n.no}</b> belum difoto, ${sapa()}.`;
  } else {
    msg = `Ini nota <b>${n.no}</b> untuk ${esc(s?.name)}.`;
  }
  const active = n.status === 'aktif';
  const refill = n.type === 'cek' ? { ...n.sold } : null;
  if (refill) for (const [k, v] of Object.entries(n.pulled)) refill[k] = (refill[k] || 0) + v;
  return `
    ${topbar('Nota', isNew ? '#/' : '#/daftar-nota')}
    <main class="page">
      ${sani(mood, msg)}
      ${notaPreview(n)}
      ${
        active
          ? `<div class="stack">
        ${owed ? `<button class="btn huge primary" data-act="add-payment" data-id="${n.id}">💰 Catat pembayaran</button>` : ''}
        <button class="btn huge wa" data-act="send-wa" data-id="${n.id}">💬 Kirim ke WA ${s?.wa ? 'toko' : ''}</button>
        <button class="btn big" data-act="share-img" data-id="${n.id}">🖼️ Kirim gambar nota</button>
        <label class="btn big">📷 Foto nota kertas
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
    const blob = await D.getPhoto(id);
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
  if (params.foto === 'belum') notes = notes.filter((n) => n.status === 'aktif' && !n.photos.length);
  const list = notes
    .map((n) => {
      const s = D.storeById(n.storeId);
      const ps = payState(n);
      const qty = n.type === 'cek' ? `laku ${total(n.sold)}` : `${D.noteTotalQty(n)} bks`;
      const badges = [
        `<i class="b type">${n.type === 'cek' ? '🔍 Tagihan' : '🏪 Titip'}</i>`,
        n.status === 'batal' ? '<i class="b bad">Batal</i>' : '',
        n.status === 'aktif' && ps ? `<i class="b ${ps.tone}">${ps.text}</i>` : '',
        n.status === 'aktif' && !n.photos.length ? '<i class="b warn">📷 Belum foto</i>' : '',
        n.status === 'aktif' && n.photos.length ? '<i class="b ok">📷 Ada foto</i>' : '',
        n.sentAt ? '<i class="b ok">✔ WA</i>' : '',
      ].join('');
      return `<a class="pick note-item ${n.status}" href="#/nota?id=${n.id}">
        <span class="row-sb"><b>${n.no}</b><span>${qty}</span></span>
        <span>${esc(s?.name)}${n.receiver ? ` · ${esc(n.receiver)}` : ''}</span>
        <small>${tanggal(n.createdAt)} · ${n.createdBy || ''}</small>
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
      <section class="card">
        <h2>Toko titipan</h2>
        <div class="stack">${stores || '<p class="muted">Belum ada toko.</p>'}
          <a class="btn big dashed" href="#/toko">➕ Tambah toko</a></div>
      </section>
      <section class="card">
        <h2>Harga titip per bungkus</h2>
        <p class="muted">Dipakai untuk menghitung nilai nota dan tagihan. Boleh dikosongkan.</p>
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
        <h2>Pengguna HP ini</h2>
        <p>Sekarang: <b>${st.user}</b></p>
        <button class="btn big" data-act="switch-user">Ganti ke ${st.user === 'Bapak' ? 'Ibu' : 'Bapak'}</button>
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
  } else if (act === 'user') {
    D.setUser(el.dataset.user);
    render();
  } else if (act === 'soon') {
    await confirmBox({ mood: 'ingat', text: `${el.dataset.what} masih Sani siapkan nggih, ${sapa()}. Sabar sebentar.`, yes: 'Nggih', no: null });
  } else if (act === 'pick-store') {
    if (drafts.titip.storeId !== id) startTitip(id);
    location.hash = '#/jumlah';
  } else if (act === 'pick-cek') {
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
        text: mode === 'manual' ? `Berapa uang yang diterima dari toko, ${sapa()}?` : `Dibayar berapa, ${sapa()}? Tagihannya ${rupiah(bill)}.`,
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
      await confirmBox({ mood: 'khawatir', text: `Tagihannya sudah dibayar atau belum, ${sapa()}? Pilih dulu di bagian <b>Pembayaran</b> nggih.`, yes: 'Nggih', no: null });
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
    const items = { ...n.sold };
    for (const [k, v] of Object.entries(n.pulled)) items[k] = (items[k] || 0) + v;
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
  } else if (act === 'switch-user') {
    const to = D.getState().user === 'Bapak' ? 'Ibu' : 'Bapak';
    if (await confirmBox({ mood: 'biasa', text: `Ganti pengguna HP ini ke <b>${to}</b>?`, yes: 'Ya, ganti', no: 'Tidak' })) {
      D.setUser(to);
      render();
    }
  } else if (act === 'backup') {
    await backup();
  }
});

// Ketik nama penerima: simpan ke draf tanpa menggambar ulang (supaya keyboard tidak tertutup).
$app.addEventListener('input', (e) => {
  const el = e.target;
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

$app.addEventListener('submit', (e) => {
  const f = e.target;
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

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
