// Penyimpanan data di HP (localStorage untuk catatan, IndexedDB untuk foto).
// Setiap catatan punya id unik + updatedAt supaya nanti mudah disinkronkan ke Google Sheet.

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
  settings: { textSize: 'besar', voice: true, maxDays: 30 },
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const data = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...data, settings: { ...EMPTY.settings, ...data.settings } };
  } catch {
    return structuredClone(EMPTY);
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const now = () => new Date().toISOString();
const sum = (obj) => Object.values(obj || {}).reduce((a, b) => a + b, 0);
export const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

export const getState = () => state;

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function setPrice(productId, value) {
  const n = Number(String(value).replace(/\D/g, ''));
  if (n > 0) state.prices[productId] = n;
  else delete state.prices[productId];
  save();
}

// ---------- Toko ----------
export const activeStores = () => state.stores.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name));
export const storeById = (id) => state.stores.find((s) => s.id === id);

export function saveStore({ id, name, wa, address }) {
  const clean = { name: name.trim(), wa: normalizeWA(wa), address: (address || '').trim(), updatedAt: now() };
  if (id) {
    Object.assign(storeById(id), clean);
  } else {
    id = uid();
    state.stores.push({ id, ...clean, createdAt: now() });
  }
  save();
  return id;
}

export function archiveStore(id) {
  const s = storeById(id);
  if (s) {
    s.archived = true;
    s.updatedAt = now();
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

function addNote(fields) {
  state.counter += 1;
  const note = {
    id: uid(),
    no: formatNo(state.counter),
    status: 'aktif',
    photos: [],
    prices: { ...state.prices }, // harga saat nota dibuat
    createdAt: now(),
    updatedAt: now(),
    ...fields,
  };
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
  n.updatedAt = now();
  save();
}

export const noteById = (id) => state.notes.find((n) => n.id === id);

export const notesNewestFirst = () => [...state.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const notesOldestFirst = () => [...state.notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export function cancelNote(id) {
  const n = noteById(id);
  n.status = 'batal';
  n.updatedAt = now();
  save();
}

export function markSent(id) {
  const n = noteById(id);
  n.sentAt = now();
  n.updatedAt = now();
  save();
}

export async function addPhotoToNote(id, blob) {
  const photoId = uid();
  await putPhoto(photoId, blob);
  const n = noteById(id);
  n.photos.push(photoId);
  n.updatedAt = now();
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
