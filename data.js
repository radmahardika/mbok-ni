// Penyimpanan data di HP (localStorage untuk catatan, IndexedDB untuk foto).
// Setiap catatan punya id unik + updatedAt; perubahan ditandai _dirty sampai terkirim ke Google Sheet.

const KEY = 'mbokni-v1';
const DAY = 86400000;

export const PRODUCTS = [
  { id: 'pedas', name: 'Bumbu Pecel Pedas', short: 'Pecel Pedas', size: '100 g', color: '#c8372d' },
  { id: 'sedang', name: 'Bumbu Pecel Sedang', short: 'Pecel Sedang', size: '100 g', color: '#e07b1f' },
  { id: 'tidak', name: 'Bumbu Pecel Tidak Pedas', short: 'Pecel Tidak Pedas', size: '100 g', color: '#4f9a2f' },
  { id: 'kacang', name: 'Bumbu Kacang Serbaguna', short: 'Bumbu Kacang', size: '200 g', color: '#7a4a1f' },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);

const EMPTY = {
  version: 1,
  counter: 0, // nomor nota terakhir
  stores: [],
  prices: {}, // harga titip per produk (opsional)
  notes: [],
  schedules: [], // jadwal kiriman travel
  counts: [], // hitung stok di rumah
  config: { updatedAt: '1970-01-01T00:00:00.000Z' }, // penanda waktu harga & batas hari (ikut sinkron)
  sync: { url: '', token: '', since: 0, lastAt: null, error: '' },
  settings: { textSize: 'besar', voice: true, maxDays: 30 },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const data = JSON.parse(raw);
    return {
      ...structuredClone(EMPTY),
      ...data,
      settings: { ...EMPTY.settings, ...data.settings },
      sync: { ...EMPTY.sync, ...data.sync },
    };
  } catch {
    return structuredClone(EMPTY);
  }
}

const listeners = [];
export const onChange = (fn) => listeners.push(fn);

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn());
}

// Tandai catatan berubah supaya ikut terkirim saat sinkron.
function touch(rec) {
  rec.updatedAt = now();
  rec._dirty = true;
  return rec;
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const now = () => new Date().toISOString();
const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
export const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

export const getState = () => state;

export function setSetting(key, value) {
  state.settings[key] = value;
  if (key === 'maxDays') touch(state.config);
  save();
}

export function setPrice(productId, value) {
  const n = Number(String(value).replace(/\D/g, ''));
  if (n > 0) state.prices[productId] = n;
  else delete state.prices[productId];
  touch(state.config);
  save();
}

// ---------- Toko ----------
export const activeStores = () => state.stores.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name));
export const storeById = (id) => state.stores.find((s) => s.id === id);

export function saveStore({ id, name, wa, address }) {
  const clean = { name: name.trim(), wa: normalizeWA(wa), address: (address || '').trim() };
  if (id) {
    touch(Object.assign(storeById(id), clean));
  } else {
    id = uid();
    state.stores.push(touch({ id, ...clean, createdAt: now() }));
  }
  save();
  return id;
}

export function archiveStore(id) {
  const s = storeById(id);
  if (s) {
    s.archived = true;
    touch(s);
    save();
  }
}

// 0812-3456-789 / +62 812... -> 628123456789
export function normalizeWA(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}

// Nama petugas toko yang pernah menerima, terbaru dulu (untuk pilihan cepat).
export function receiversForStore(storeId) {
  const names = [];
  for (const n of notesNewestFirst()) {
    if (n.storeId === storeId && n.receiver && !names.includes(n.receiver)) names.push(n.receiver);
  }
  return names.slice(0, 4);
}

// ---------- Nota ----------
export const formatNo = (n) => 'MBOKNI-' + String(n).padStart(4, '0');
const noNumber = (no) => Number(String(no || '').replace(/\D/g, '')) || 0;

// Nomor berikutnya = nomor tertinggi yang pernah tercatat (di HP ini atau dari Sheet) + 1.
function nextNo() {
  const max = state.notes.reduce((m, n) => Math.max(m, noNumber(n.no)), state.counter || 0);
  state.counter = max + 1;
  return formatNo(state.counter);
}

function addNote(fields) {
  const note = touch({
    id: uid(),
    no: nextNo(),
    status: 'aktif',
    photos: [],
    prices: { ...state.prices }, // harga saat nota dibuat
    createdAt: now(),
    ...fields,
  });
  state.notes.push(note);
  save();
  return note;
}

export function createTitipNote(storeId, items, receiver) {
  return addNote({ type: 'titip', storeId, items: { ...items }, receiver: receiver.trim() });
}

// Cek toko: expected = catatan Sani, counted = hitungan di rak, pulled = ditarik.
export function createCekNote({ storeId, expected, counted, pulled, receiver, amount, paid }) {
  const sold = {};
  for (const p of PRODUCTS) {
    const s = Math.max(0, (expected[p.id] || 0) - (counted[p.id] || 0));
    if (s) sold[p.id] = s;
  }
  const payments = paid > 0 ? [{ at: now(), amount: paid }] : [];
  return addNote({
    type: 'cek',
    storeId,
    expected: { ...expected },
    counted: { ...counted },
    pulled: { ...pulled },
    sold,
    receiver: receiver.trim(),
    amount, // total yang harus dibayar (Rp) atau null bila harga belum ada dan tidak ada uang
    payments,
  });
}

export function billFor(sold, prices = state.prices) {
  let total = 0;
  for (const [pid, q] of Object.entries(sold)) {
    if (!q) continue;
    if (!prices[pid]) return null;
    total += q * prices[pid];
  }
  return total;
}

export const paidOf = (n) => (n.payments || []).reduce((a, p) => a + p.amount, 0);
export const owedOf = (n) => (n.type === 'cek' && n.status === 'aktif' && n.amount ? Math.max(0, n.amount - paidOf(n)) : 0);

export function addPayment(id, amount) {
  const n = noteById(id);
  n.payments = [...(n.payments || []), { at: now(), amount }];
  touch(n);
  save();
}

export const noteById = (id) => state.notes.find((n) => n.id === id);

export const notesNewestFirst = () => [...state.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const notesOldestFirst = () => [...state.notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function cancelNote(id) {
  const n = noteById(id);
  n.status = 'batal';
  touch(n);
  save();
}

export function markSent(id) {
  const n = noteById(id);
  n.sentAt = now();
  touch(n);
  save();
}

export async function addPhotoToNote(id, blob) {
  const photoId = uid();
  await putPhoto(photoId, blob);
  const n = noteById(id);
  n.photos.push(photoId);
  touch(n);
  save();
  return photoId;
}

export const noteTotalQty = (n) => sum(n.items);

export function noteTotalMoney(n) {
  return billFor(n.items, n.prices);
}

// ---------- Stok di toko ----------
// Stok = hasil cek terakhir (sisa di rak − ditarik) + titipan sesudahnya.
// Kalau nota cek dibatalkan, otomatis kembali ke cek sebelumnya.
export function stockAtStore(storeId) {
  const out = {};
  for (const n of notesOldestFirst()) {
    if (n.storeId !== storeId || n.status !== 'aktif') continue;
    if (n.type === 'cek') {
      for (const p of PRODUCTS) out[p.id] = Math.max(0, (n.counted[p.id] || 0) - (n.pulled[p.id] || 0));
    } else if (n.type === 'titip') {
      for (const [pid, q] of Object.entries(n.items)) out[pid] = (out[pid] || 0) + q;
    }
  }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

// Umur barang tertua yang masih di toko, per produk (barang lama dianggap laku duluan).
export function oldestAtStore(storeId) {
  const stock = stockAtStore(storeId);
  const out = {};
  const titips = notesNewestFirst().filter((n) => n.storeId === storeId && n.status === 'aktif' && n.type === 'titip');
  for (const [pid, left] of Object.entries(stock)) {
    let need = left;
    // Ambil dari titipan terbaru ke belakang sampai jumlah stok terpenuhi; yang terakhir = tertua.
    for (const n of titips) {
      if (!n.items[pid]) continue;
      out[pid] = n.createdAt;
      need -= n.items[pid];
      if (need <= 0) break;
    }
  }
  return out;
}

// Produk yang sudah terlalu lama di toko (lebih dari batas hari).
export function oldItemsAtStore(storeId) {
  const max = state.settings.maxDays;
  return Object.entries(oldestAtStore(storeId))
    .map(([pid, iso]) => ({ pid, days: daysSince(iso) }))
    .filter((x) => x.days >= max);
}

export const lastNoteForStore = (storeId, type) =>
  notesNewestFirst().find((n) => n.storeId === storeId && n.status === 'aktif' && (!type || n.type === type));

export const unpaidNotes = () => notesNewestFirst().filter((n) => owedOf(n) > 0);

// ---------- Cadangan ----------
export function exportData() {
  return JSON.stringify({ ...state, exportedAt: now() }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.notes) || !Array.isArray(data.stores)) throw new Error('File bukan cadangan Mbok Ni');
  state = { ...structuredClone(EMPTY), ...data, settings: { ...EMPTY.settings, ...data.settings } };
  save();
}

// ---------- Foto (IndexedDB) ----------
let dbPromise;
function db() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('mbokni-foto', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('foto');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function putPhoto(id, blob) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('foto', 'readwrite');
    tx.objectStore('foto').put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPhoto(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction('foto').objectStore('foto').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Kecilkan foto supaya hemat memori HP (sisi terpanjang 1600px, JPEG).
export async function compressPhoto(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.75));
}

// ---------- Rekap ----------
const inRange = (iso, from, to) => iso >= from.toISOString() && iso < to.toISOString();

export function recap(from, to) {
  const out = { titip: {}, datang: {}, sold: {}, pulled: {}, sales: 0, salesUnknown: 0, received: 0, byStore: {}, ceks: 0 };
  const add = (map, pid, q) => (map[pid] = (map[pid] || 0) + q);
  for (const n of state.notes) {
    if (n.status !== 'aktif') continue;
    // uang masuk dihitung dari tanggal bayar, bukan tanggal nota
    for (const p of n.payments || []) if (inRange(p.at, from, to)) out.received += p.amount;
    if (!inRange(n.createdAt, from, to)) continue;
    if (n.type === 'titip') {
      for (const [pid, q] of Object.entries(n.items)) add(out.titip, pid, q);
    } else if (n.type === 'datang') {
      for (const [pid, q] of Object.entries(n.items)) add(out.datang, pid, q);
    } else if (n.type === 'cek') {
      out.ceks++;
      const soldQty = sum(n.sold);
      for (const [pid, q] of Object.entries(n.sold)) add(out.sold, pid, q);
      for (const [pid, q] of Object.entries(n.pulled)) if (q) add(out.pulled, pid, q);
      if (soldQty) {
        if (n.amount != null) out.sales += n.amount;
        else out.salesUnknown += soldQty;
      }
      out.byStore[n.storeId] = (out.byStore[n.storeId] || 0) + soldQty;
    }
  }
  out.owed = unpaidNotes().reduce((a, n) => a + owedOf(n), 0);
  return out;
}

// Kecepatan laku per toko dari (maksimal) 4 cek terakhir, dan saran titip.
// Saran = perkiraan laku sampai kunjungan berikutnya + 20% cadangan − stok yang masih di toko.
export function suggestion(storeId) {
  const ceks = notesOldestFirst().filter((n) => n.storeId === storeId && n.status === 'aktif' && n.type === 'cek');
  if (!ceks.length) return null;
  const win = ceks.slice(-4);
  const before = ceks[ceks.length - win.length - 1];
  const firstTitip = notesOldestFirst().find((n) => n.storeId === storeId && n.status === 'aktif' && n.type === 'titip');
  const startIso = before ? before.createdAt : firstTitip ? firstTitip.createdAt : win[0].createdAt;
  const days = Math.max(1, (new Date(win[win.length - 1].createdAt) - new Date(startIso)) / DAY);
  const interval = Math.min(30, Math.max(7, days / win.length)); // jarak kunjungan rata-rata
  const stock = stockAtStore(storeId);
  const perWeek = {};
  const qty = {};
  for (const p of PRODUCTS) {
    const sold = win.reduce((a, n) => a + (n.sold[p.id] || 0), 0);
    const perDay = sold / days;
    perWeek[p.id] = Math.round(perDay * 7);
    const need = Math.ceil(perDay * interval * 1.2) - (stock[p.id] || 0);
    if (need > 0) qty[p.id] = need;
  }
  return { perWeek, qty, interval: Math.round(interval) };
}

// ---------- Barang datang (kiriman travel) ----------
export function createDatangNote(items, courier, scheduleId) {
  const n = addNote({ type: 'datang', items: { ...items }, courier: (courier || '').trim(), scheduleId: scheduleId || null });
  if (scheduleId) {
    const sc = scheduleById(scheduleId);
    if (sc) {
      sc.status = 'tiba';
      sc.noteId = n.id;
      touch(sc);
      save();
    }
  }
  return n;
}

// Jadwal: { id, date: 'YYYY-MM-DD', time: 'HH:MM', courier, phone, note, status: 'menunggu'|'tiba'|'batal' }
export const scheduleById = (id) => state.schedules.find((s) => s.id === id);

export function saveSchedule({ id, date, time, courier, phone, note }) {
  const clean = { date, time: time || '', courier: (courier || '').trim(), phone: (phone || '').replace(/[^\d+]/g, ''), note: (note || '').trim() };
  if (id) touch(Object.assign(scheduleById(id), clean));
  else {
    id = uid();
    state.schedules.push(touch({ id, ...clean, status: 'menunggu', createdAt: now() }));
  }
  save();
  return id;
}

export function cancelSchedule(id) {
  const sc = scheduleById(id);
  sc.status = 'batal';
  touch(sc);
  save();
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const scheduleDays = (sc) => Math.round((new Date(sc.date + 'T00:00') - new Date(todayStr() + 'T00:00')) / DAY);

export const pendingSchedules = () =>
  state.schedules.filter((s) => s.status === 'menunggu').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

// ---------- Stok di rumah ----------
// Stok rumah = hitungan terakhir + barang datang sesudahnya − titipan sesudahnya.
export function saveCount(items) {
  state.counts.push(touch({ id: uid(), items: { ...items }, createdAt: now() }));
  save();
}

export function homeStock() {
  const events = [
    ...state.counts.map((c) => ({ at: c.createdAt, kind: 'count', items: c.items })),
    ...state.notes
      .filter((n) => n.status === 'aktif' && (n.type === 'datang' || n.type === 'titip'))
      .map((n) => ({ at: n.createdAt, kind: n.type, items: n.items })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const stock = {};
  for (const e of events) {
    if (e.kind === 'count') {
      for (const p of PRODUCTS) stock[p.id] = e.items[p.id] || 0;
    } else {
      const sign = e.kind === 'datang' ? 1 : -1;
      for (const [pid, q] of Object.entries(e.items)) stock[pid] = (stock[pid] || 0) + sign * q;
    }
  }
  return { stock, known: events.some((e) => e.kind !== 'titip'), lastCount: state.counts.at(-1)?.createdAt || null };
}

// ---------- Sinkron ----------
// Jenis catatan yang dikirim ke Sheet.
const KINDS = { store: 'stores', note: 'notes', schedule: 'schedules', count: 'counts' };

export function setSync(fields) {
  Object.assign(state.sync, fields);
  save();
}

export function dirtyRecords() {
  const out = [];
  for (const [kind, key] of Object.entries(KINDS)) {
    for (const r of state[key]) if (r._dirty) out.push({ kind, id: r.id, updatedAt: r.updatedAt, data: strip(r) });
  }
  if (state.config._dirty) {
    out.push({ kind: 'config', id: 'config', updatedAt: state.config.updatedAt, data: { prices: state.prices, maxDays: state.settings.maxDays } });
  }
  return out;
}

const strip = (r) => {
  const { _dirty, ...rest } = r;
  return rest;
};

// Setelah terkirim: bersihkan tanda, kecuali kalau sempat diubah lagi selama proses kirim.
export function markSynced(sent) {
  for (const s of sent) {
    const rec = s.kind === 'config' ? state.config : state[KINDS[s.kind]]?.find((r) => r.id === s.id);
    if (rec && rec.updatedAt === s.updatedAt) delete rec._dirty;
  }
  save();
}

// Terapkan catatan dari Sheet bila lebih baru dari yang ada di HP. Mengembalikan daftar nota yang berganti nomor.
export function applyPulled(records) {
  const renumbered = [];
  for (const r of records) {
    if (r.kind === 'config') {
      if (r.updatedAt > state.config.updatedAt || !state.config._dirty) {
        state.prices = r.data.prices || {};
        if (r.data.maxDays) state.settings.maxDays = r.data.maxDays;
        state.config = { updatedAt: r.updatedAt };
      }
      continue;
    }
    const key = KINDS[r.kind];
    if (!key) continue;
    const list = state[key];
    const i = list.findIndex((x) => x.id === r.id);
    if (i < 0) list.push(r.data);
    else {
      const local = list[i];
      if (local.no && r.data.no && local.no !== r.data.no) renumbered.push({ from: local.no, to: r.data.no });
      if (!local._dirty || r.updatedAt >= local.updatedAt) {
        // foto yang ada di HP ini tetap disimpan
        const photos = [...new Set([...(r.data.photos || []), ...(local.photos || [])])];
        list[i] = local.photos ? { ...r.data, photos } : r.data;
        if (local._dirty && list[i].photos?.length !== (r.data.photos || []).length) list[i]._dirty = true;
      } else if (r.data.no && local.no !== r.data.no) {
        local.no = r.data.no; // nomor dari Sheet selalu dipakai
      }
    }
  }
  save();
  return renumbered;
}

// Foto di Drive: note.photoFiles = { photoId: fileId }
export function setPhotoFile(noteId, photoId, fileId) {
  const n = noteById(noteId);
  if (!n) return;
  n.photoFiles = { ...(n.photoFiles || {}), [photoId]: fileId };
  touch(n);
  save();
}

export async function hasLocalPhoto(id) {
  return !!(await getPhoto(id));
}

export async function cachePhoto(id, blob) {
  await putPhoto(id, blob);
}

// Saat pertama tersambung: kirim semua catatan yang sudah ada di HP ini.
export function markAllDirty() {
  for (const key of Object.values(KINDS)) for (const r of state[key]) r._dirty = true;
  if (Object.keys(state.prices).length) {
    state.config._dirty = true;
    if (state.config.updatedAt.startsWith('1970')) state.config.updatedAt = now();
  }
  save();
}

// Nama travel yang pernah dipakai, terbaru dulu.
export function recentCouriers() {
  const names = [];
  const src = [
    ...notesNewestFirst().filter((n) => n.type === 'datang').map((n) => n.courier),
    ...[...state.schedules].reverse().map((s) => s.courier),
  ];
  for (const c of src) if (c && !names.includes(c)) names.push(c);
  return names.slice(0, 4);
}

// ---------- Shopee ----------
// Shopee dicatat seperti toko: stok diambil penjual Shopee lewat "titip", laku & setoran dari sheet Shopee.
// Di sheet Shopee pecel tidak dicatat rasanya, jadi untuk Shopee pecel dihitung gabungan.
export const SHOPEE_ID = 'shopee';
export const PECEL_IDS = ['pedas', 'sedang', 'tidak'];
export const isShopee = (storeId) => storeId === SHOPEE_ID;

export function ensureShopeeStore() {
  if (!storeById(SHOPEE_ID)) {
    state.stores.push(touch({ id: SHOPEE_ID, name: 'Shopee', wa: '', address: 'Toko online', createdAt: now() }));
    save();
  }
}

// Bagi jumlah pecel laku ke tiap rasa sebanding stok yang ada (sisa pembagian ke stok terbesar).
function allocatePecel(stock, qty) {
  let base = Object.fromEntries(PECEL_IDS.map((id) => [id, stock[id] || 0]));
  if (!sum(base)) {
    // stok tidak tercatat: pakai perbandingan semua titipan ke Shopee, atau rata
    base = Object.fromEntries(PECEL_IDS.map((id) => [id, 0]));
    for (const n of state.notes) if (n.storeId === SHOPEE_ID && n.type === 'titip' && n.status === 'aktif') for (const id of PECEL_IDS) base[id] += n.items[id] || 0;
    if (!sum(base)) base = { pedas: 1, sedang: 1, tidak: 1 };
  }
  const tot = sum(base);
  const out = {};
  let given = 0;
  for (const id of PECEL_IDS) {
    out[id] = Math.floor((qty * base[id]) / tot);
    given += out[id];
  }
  const order = [...PECEL_IDS].sort((a, b) => base[b] - base[a]);
  for (let i = 0; given < qty; i++, given++) out[order[i % 3]]++;
  return out;
}

// Total yang sudah dicatat dari tab bulan tertentu (nota Shopee terakhir untuk bulan itu).
export function shopeeImported(month) {
  const n = notesNewestFirst().find((x) => x.status === 'aktif' && x.shopee && x.shopee.month === month);
  return n ? n.shopee.totals : { pecel: 0, kacang: 0, setor: 0, lastDay: 0 };
}

export function shopeeStock() {
  const st = stockAtStore(SHOPEE_ID);
  return { pecel: PECEL_IDS.reduce((a, id) => a + (st[id] || 0), 0), kacang: st.kacang || 0 };
}

// data = hasil baca sheet; mencatat hanya tambahan sejak catatan sebelumnya.
export function createShopeeNote(data, label) {
  const before = shopeeImported(data.month);
  const setor = data.setorPecel + data.setorKacang;
  const delta = {
    pecel: Math.max(0, data.pecel - before.pecel),
    kacang: Math.max(0, data.kacang - before.kacang),
    setor: Math.max(0, setor - before.setor),
  };
  const expected = stockAtStore(SHOPEE_ID);
  const pec = allocatePecel(expected, delta.pecel);
  const soldMap = { ...pec, kacang: delta.kacang };
  const counted = {};
  let short = 0;
  for (const p of PRODUCTS) {
    const e = expected[p.id] || 0;
    counted[p.id] = Math.max(0, e - (soldMap[p.id] || 0));
    short += Math.max(0, (soldMap[p.id] || 0) - e);
  }
  // expected disamakan dengan yang laku bila stok kurang, supaya laku tetap tercatat utuh
  const exp = {};
  for (const p of PRODUCTS) exp[p.id] = counted[p.id] + (soldMap[p.id] || 0);
  const n = createCekNote({ storeId: SHOPEE_ID, expected: exp, counted, pulled: {}, receiver: '', amount: delta.setor || null, paid: 0 });
  n.shopee = {
    month: data.month,
    label,
    fromDay: before.lastDay ? before.lastDay : 1,
    lastDay: data.lastDay,
    pecel: delta.pecel,
    kacang: delta.kacang,
    short,
    totals: { pecel: data.pecel, kacang: data.kacang, setor, lastDay: data.lastDay },
  };
  touch(n);
  save();
  return n;
}
