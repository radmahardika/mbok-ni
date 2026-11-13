// Penyimpanan data di HP (localStorage untuk catatan, IndexedDB untuk foto).
// Setiap catatan punya id unik + updatedAt supaya nanti mudah disinkronkan ke Google Sheet.

const KEY = 'mbokni-v1';

export const PRODUCTS = [
  { id: 'pedas', name: 'Bumbu Pecel Pedas', short: 'Pecel Pedas', size: '100 g', color: '#c8372d' },
  { id: 'sedang', name: 'Bumbu Pecel Sedang', short: 'Pecel Sedang', size: '100 g', color: '#e07b1f' },
  { id: 'tidak', name: 'Bumbu Pecel Tidak Pedas', short: 'Pecel Tdk Pedas', size: '100 g', color: '#4f9a2f' },
  { id: 'kacang', name: 'Bumbu Kacang Serbaguna', short: 'Bumbu Kacang', size: '200 g', color: '#7a4a1f' },
];

export const productById = (id) => PRODUCTS.find((p) => p.id === id);

const EMPTY = {
  version: 1,
  user: null, // 'Bapak' | 'Ibu'
  counter: 0, // nomor nota terakhir
  stores: [],
  prices: {}, // harga titip per produk (opsional)
  notes: [],
  settings: { textSize: 'besar', voice: true },
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

export const getState = () => state;

export function setUser(user) {
  state.user = user;
  save();
}

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
    state.stores.push({ id, ...clean, createdAt: now(), createdBy: state.user });
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

// ---------- Nota ----------
export const formatNo = (n) => 'MBOKNI-' + String(n).padStart(4, '0');

export function createTitipNote(storeId, items) {
  state.counter += 1;
  const note = {
    id: uid(),
    no: formatNo(state.counter),
    type: 'titip',
    storeId,
    items: { ...items },
    prices: { ...state.prices }, // harga saat nota dibuat
    status: 'aktif',
    photos: [],
    createdAt: now(),
    createdBy: state.user,
    updatedAt: now(),
  };
  state.notes.push(note);
  save();
  return note;
}

export const noteById = (id) => state.notes.find((n) => n.id === id);

export const notesNewestFirst = () => [...state.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function cancelNote(id) {
  const n = noteById(id);
  n.status = 'batal';
  n.cancelledBy = state.user;
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

export const noteTotalQty = (n) => Object.values(n.items).reduce((a, b) => a + b, 0);

export function noteTotalMoney(n) {
  let total = 0;
  for (const [pid, qty] of Object.entries(n.items)) {
    if (!n.prices[pid]) return null; // harga belum lengkap
    total += qty * n.prices[pid];
  }
  return total;
}

// Jumlah barang yang sedang dititip di tiap toko (dari nota aktif).
export function stockAtStore(storeId) {
  const out = {};
  for (const n of state.notes) {
    if (n.storeId !== storeId || n.status !== 'aktif' || n.type !== 'titip') continue;
    for (const [pid, q] of Object.entries(n.items)) out[pid] = (out[pid] || 0) + q;
  }
  return out;
}

export const lastNoteForStore = (storeId) =>
  notesNewestFirst().find((n) => n.storeId === storeId && n.status === 'aktif');

// ---------- Cadangan ----------
export function exportData() {
  return JSON.stringify({ ...state, exportedAt: now() }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.notes) || !Array.isArray(data.stores)) throw new Error('File bukan cadangan Mbok Ni');
  state = { ...structuredClone(EMPTY), ...data };
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
