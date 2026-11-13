import { saniSVG } from './sani.js';
import * as D from './data.js';
import { notaText, waLink, notaImage, tanggal, jam, rupiah } from './nota.js';

const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const buzz = () => navigator.vibrate && navigator.vibrate(15);

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

// Dialog konfirmasi besar. Mengembalikan Promise<boolean>.
function confirmBox({ mood = 'khawatir', text, yes = 'Ya', no = 'Tidak', danger = false }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `
      <div class="modal-card">
        ${sani(mood, text)}
        <button class="btn big ${danger ? 'danger' : 'primary'}" data-r="1">${yes}</button>
        <button class="btn big ghost" data-r="0">${no}</button>
      </div>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      el.remove();
      resolve(b.dataset.r === '1');
    });
    document.body.append(el);
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

// ---------- Halaman ----------
const routes = {
  '': home,
  pengguna: chooseUser,
  titip: titipStore,
  jumlah: titipQty,
  cek: titipCheck,
  nota: notaDetail,
  'daftar-nota': notaList,
  toko: storeForm,
  setelan: settings,
};

// Draf titip yang sedang diisi (hilang kalau aplikasi ditutup — sengaja, supaya tidak membingungkan).
let draft = { storeId: null, items: {} };

function chooseUser() {
  return `
    <main class="page">
      ${sani('senang', 'Sugeng rawuh! Kula <b>SANI</b>, Staf Andalan Mbok Ni. Ini HP siapa nggih?')}
      <div class="stack">
        <button class="btn huge primary" data-act="user" data-user="Bapak">👨 Saya Bapak</button>
        <button class="btn huge primary" data-act="user" data-user="Ibu">👩 Saya Ibu</button>
      </div>
    </main>`;
}

function home() {
  const st = D.getState();
  if (!st.user) return chooseUser();
  const stores = D.activeStores();
  const last = D.notesNewestFirst().find((n) => n.status === 'aktif');
  let msg;
  let mood = 'senang';
  if (!stores.length) {
    msg = `${salam()}, ${sapa()}! Belum ada toko yang dicatat. Ketuk <b>Titip ke Toko</b>, nanti saya bantu tambahkan tokonya.`;
  } else if (last) {
    const s = D.storeById(last.storeId);
    msg = `${salam()}, ${sapa()}! Nota terakhir <b>${last.no}</b> ke <b>${esc(s?.name)}</b>, ${tanggal(last.createdAt, false)}.`;
    const noPhoto = st.notes.filter((n) => n.status === 'aktif' && !n.photos.length).length;
    if (noPhoto) {
      mood = 'ingat';
      msg += ` Ada <b>${noPhoto} nota</b> yang belum difoto nota kertasnya.`;
    }
  } else {
    msg = `${salam()}, ${sapa()}! Mau titip barang ke toko hari ini?`;
  }
  return `
    <main class="page">
      ${sani(mood, msg)}
      <nav class="menu">
        <a class="tile primary" href="#/titip"><span class="ico">🏪</span><span>Titip ke Toko</span></a>
        <button class="tile soon" data-act="soon" data-what="Cek toko dan tagih"><span class="ico">🔍</span><span>Cek Toko &amp; Tagih</span><small>Segera</small></button>
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

function titipStore() {
  const stores = D.activeStores();
  const list = stores
    .map((s) => {
      const last = D.lastNoteForStore(s.id);
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

function stepper(p, qty) {
  return `
    <div class="qty-card" style="--c:${p.color}">
      <div class="qty-name"><b>${p.name}</b><small>${p.size}</small></div>
      <div class="qty-row">
        <button class="step" data-act="qty" data-id="${p.id}" data-d="-1" aria-label="Kurangi">−</button>
        <button class="qty-num" data-act="qty-type" data-id="${p.id}">${qty}</button>
        <button class="step" data-act="qty" data-id="${p.id}" data-d="1" aria-label="Tambah">+</button>
      </div>
      <button class="plus10" data-act="qty" data-id="${p.id}" data-d="10">+10 (satu pak)</button>
    </div>`;
}

function titipQty() {
  const s = D.storeById(draft.storeId);
  if (!s) return redirect('#/titip');
  const total = Object.values(draft.items).reduce((a, b) => a + b, 0);
  return `
    ${topbar('Jumlah Titipan', '#/titip')}
    <main class="page">
      ${sani('biasa', `Titip ke <b>${esc(s.name)}</b>. Berapa bungkus masing-masing, ${sapa()}? Ketuk <b>+</b> untuk menambah.`)}
      <div class="stack">${D.PRODUCTS.map((p) => stepper(p, draft.items[p.id] || 0)).join('')}</div>
      <div class="sticky">
        <button class="btn huge primary" data-act="to-check" ${total ? '' : 'disabled'}>Lanjut (${total} bungkus) ›</button>
      </div>
    </main>`;
}

function summaryText(storeName, items) {
  const parts = D.PRODUCTS.filter((p) => items[p.id]).map((p) => `${p.short} ${items[p.id]} bungkus`);
  return `Titip ke ${storeName}: ${parts.join(', ')}.`;
}

function titipCheck() {
  const s = D.storeById(draft.storeId);
  const total = Object.values(draft.items).reduce((a, b) => a + b, 0);
  if (!s || !total) return redirect('#/titip');
  const rows = D.PRODUCTS.filter((p) => draft.items[p.id])
    .map((p) => `<li style="--c:${p.color}"><span>${p.name} <small>${p.size}</small></span><b>${draft.items[p.id]}</b></li>`)
    .join('');
  return `
    ${topbar('Cek Ulang', '#/jumlah')}
    <main class="page">
      ${sani('biasa', `Saya bacakan nggih, ${sapa()}. ${esc(summaryText(s.name, draft.items))} Sudah betul?`)}
      <div class="card">
        <p class="muted">Toko</p>
        <h2>${esc(s.name)}</h2>
        <ul class="sum">${rows}</ul>
        <p class="sum-total">Jumlah <b>${total} bungkus</b></p>
      </div>
      <div class="stack">
        <button class="btn huge primary" data-act="create-note">✔ Betul, buat nota</button>
        <a class="btn big ghost" href="#/jumlah">✏️ Ubah jumlah</a>
      </div>
    </main>`;
}

function notaPreview(n) {
  const s = D.storeById(n.storeId);
  const total = D.noteTotalMoney(n);
  const rows = D.PRODUCTS.filter((p) => n.items[p.id] > 0)
    .map((p) => {
      const pr = n.prices[p.id] ? `<small>${rupiah(n.prices[p.id])}/bks</small>` : '';
      return `<li style="--c:${p.color}"><span>${p.name} <small>${p.size}</small>${pr}</span><b>${n.items[p.id]}</b></li>`;
    })
    .join('');
  return `
    <div class="nota ${n.status === 'batal' ? 'void' : ''}">
      <div class="nota-head">
        <div><div class="brand">MBOK NI</div><div>Nota Titip Barang</div></div>
        <div class="nota-no"><b>${n.no}</b><div>${tanggal(n.createdAt, false)}</div></div>
      </div>
      <div class="nota-body">
        <p class="muted">Toko</p>
        <h2>${esc(s?.name)}</h2>
        <ul class="sum">${rows}</ul>
        <p class="sum-total">Jumlah <b>${D.noteTotalQty(n)} bungkus</b></p>
        ${total != null ? `<p class="sum-total">Nilai titipan <b>${rupiah(total)}</b></p>` : ''}
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
  let mood = 'senang';
  let msg;
  if (n.status === 'batal') {
    mood = 'khawatir';
    msg = `Nota ${n.no} ini sudah dibatalkan, ${sapa()}.`;
  } else if (isNew) {
    msg = `Nota <b>${n.no}</b> sudah jadi, ${sapa()}! Sekarang kirim ke WA toko, lalu foto nota kertasnya nggih.`;
  } else if (!n.photos.length) {
    mood = 'ingat';
    msg = `Nota kertas untuk <b>${n.no}</b> belum difoto, ${sapa()}.`;
  } else {
    msg = `Ini nota <b>${n.no}</b> untuk ${esc(s?.name)}.`;
  }
  const active = n.status === 'aktif';
  return `
    ${topbar('Nota', isNew ? '#/' : '#/daftar-nota')}
    <main class="page">
      ${sani(mood, msg)}
      ${notaPreview(n)}
      ${
        active
          ? `<div class="stack">
        <button class="btn huge wa" data-act="send-wa" data-id="${n.id}">💬 Kirim ke WA ${s?.wa ? 'toko' : ''}</button>
        <button class="btn big" data-act="share-img" data-id="${n.id}">🖼️ Kirim gambar nota</button>
        <label class="btn big">📷 Foto nota kertas
          <input type="file" accept="image/*" capture="environment" data-act="photo" data-id="${n.id}" hidden>
        </label>
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
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Foto nota';
    img.onclick = () => photoViewer(URL.createObjectURL(blob));
    box.append(img);
  }
}

function notaList(params) {
  const notes = D.notesNewestFirst().filter((n) => !params.toko || n.storeId === params.toko);
  const list = notes
    .map((n) => {
      const s = D.storeById(n.storeId);
      const badges = [
        n.status === 'batal' ? '<i class="b bad">Batal</i>' : '',
        n.status === 'aktif' && n.photos.length ? '<i class="b ok">📷 Ada foto</i>' : '',
        n.status === 'aktif' && !n.photos.length ? '<i class="b warn">📷 Belum foto</i>' : '',
        n.sentAt ? '<i class="b ok">✔ WA</i>' : '',
      ].join('');
      return `<a class="pick note-item ${n.status}" href="#/nota?id=${n.id}">
        <span class="row-sb"><b>${n.no}</b><span>${D.noteTotalQty(n)} bks</span></span>
        <span>${esc(s?.name)}</span>
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
  return `
    ${topbar('Daftar Nota')}
    <main class="page">
      ${sani('biasa', notes.length ? `Ada <b>${notes.length} nota</b>. Ketuk salah satu untuk melihat.` : `Belum ada nota, ${sapa()}.`)}
      ${filter}
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
        <p class="muted">Dipakai untuk menghitung nilai nota. Boleh dikosongkan.</p>
        <div class="stack">${prices}</div>
      </section>
      <section class="card">
        <h2>Ukuran huruf</h2>
        <div class="row2">${sizes}</div>
      </section>
      <section class="card">
        <h2>Suara SANI</h2>
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
  $app.innerHTML = view(params);
  window.scrollTo(0, 0);
  if (path === 'nota') {
    const n = D.noteById(params.id);
    if (n) fillPhotos(n);
  }
}

function applySettings() {
  document.documentElement.dataset.size = D.getState().settings.textSize;
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
  } else if (act === 'user') {
    D.setUser(el.dataset.user);
    render();
  } else if (act === 'soon') {
    await confirmBox({ mood: 'ingat', text: `${el.dataset.what} masih saya siapkan nggih, ${sapa()}. Sabar sebentar.`, yes: 'Nggih', no: 'Tutup' });
  } else if (act === 'pick-store') {
    if (draft.storeId !== id) draft = { storeId: id, items: {} };
    location.hash = '#/jumlah';
  } else if (act === 'qty') {
    const v = Math.max(0, (draft.items[id] || 0) + Number(el.dataset.d));
    draft.items[id] = v;
    render();
  } else if (act === 'qty-type') {
    const p = D.productById(id);
    const v = prompt(`Jumlah ${p.name} (bungkus):`, draft.items[id] || 0);
    if (v !== null && /^\d+$/.test(v.trim())) {
      draft.items[id] = Number(v.trim());
      render();
    }
  } else if (act === 'to-check') {
    location.hash = '#/cek';
  } else if (act === 'create-note') {
    const items = Object.fromEntries(Object.entries(draft.items).filter(([, q]) => q > 0));
    const n = D.createTitipNote(draft.storeId, items);
    draft = { storeId: null, items: {} };
    location.replace(`#/nota?id=${n.id}&baru=1`);
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

$app.addEventListener('change', async (e) => {
  const el = e.target;
  const act = el.dataset.act;
  if (act === 'photo' && el.files[0]) {
    toast('Menyimpan foto…');
    const blob = await D.compressPhoto(el.files[0]);
    await D.addPhotoToNote(el.dataset.id, blob);
    toast('Foto nota tersimpan ✔');
    render();
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
      await confirmBox({ text: `Maaf, file itu tidak bisa dibaca. (${esc(err.message)})`, yes: 'Nggih', no: 'Tutup' });
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
    draft = { storeId: id, items: {} };
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

// Kedip sesekali supaya SANI terasa hidup.
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
