// Sinkron ke Google Sheet lewat Google Apps Script (lihat folder apps-script/).
// Semua data tetap tersimpan di HP; sinkron hanya mengirim perubahan dan mengambil perubahan dari HP lain.
import * as D from './data.js';

let running = null;
let timer = null;
let backoffUntil = 0; // jeda setelah gagal supaya tidak mencoba terus-menerus
const listeners = [];
export const onSyncDone = (fn) => listeners.push(fn);

export const isConfigured = () => !!(D.getState().sync.url && D.getState().sync.token);

async function call(body, timeoutMs = 30000) {
  const { url, token } = D.getState().sync;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // text/plain supaya tidak perlu izin CORS tambahan dari Apps Script
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ ...body, token }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error === 'token' ? 'Kode rahasia salah' : data.error || 'Gagal');
    return data;
  } finally {
    clearTimeout(t);
  }
}

export async function testConnection(url, token) {
  const prev = { ...D.getState().sync };
  D.setSync({ url, token });
  try {
    const r = await call({ action: 'ping' }, 20000);
    D.setSync({ name: r.name, since: 0, error: '' });
    D.markAllDirty();
    return { ok: true, name: r.name };
  } catch (e) {
    D.setSync({ url: prev.url, token: prev.token });
    return { ok: false, error: e.name === 'AbortError' ? 'Tidak ada jawaban (cek internet)' : e.message };
  }
}

// Sinkron penuh. Aman dipanggil berkali-kali: kalau sedang berjalan, menunggu yang sama.
export function syncNow() {
  if (!isConfigured()) return Promise.resolve({ skipped: true });
  if (!navigator.onLine) {
    if (D.getState().sync.error !== 'offline') D.setSync({ error: 'offline' });
    return Promise.resolve({ offline: true });
  }
  running ||= (async () => {
    try {
      const push = D.dirtyRecords();
      const r = await call({ action: 'sync', since: D.getState().sync.since, push });
      D.markSynced(push);
      const renumbered = D.applyPulled(r.pull || []);
      D.setSync({ since: r.now, lastAt: new Date().toISOString(), error: '' });
      await uploadPhotos();
      const result = { ok: true, pushed: push.length, pulled: (r.pull || []).length, renumbered };
      backoffUntil = 0;
      listeners.forEach((fn) => fn(result));
      return result;
    } catch (e) {
      backoffUntil = Date.now() + 60000;
      D.setSync({ error: e.name === 'AbortError' ? 'Sinyal lemah' : e.message });
      const result = { ok: false, error: e.message };
      listeners.forEach((fn) => fn(result));
      return result;
    } finally {
      running = null;
    }
  })();
  return running;
}

// Kirim perubahan sebentar lagi (dikumpulkan dulu supaya tidak terlalu sering).
export function syncSoon(ms = 1500) {
  if (!isConfigured()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, Math.max(ms, backoffUntil - Date.now()));
}

async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Unggah foto nota yang belum ada di Drive.
async function uploadPhotos() {
  for (const n of D.getState().notes) {
    for (const pid of n.photos || []) {
      if (n.photoFiles && n.photoFiles[pid]) continue;
      const blob = await D.getPhoto(pid);
      if (!blob) continue; // foto ini dibuat di HP lain
      const r = await call({ action: 'photo', noteId: n.id, no: n.no, photoId: pid, mime: blob.type || 'image/jpeg', data: await blobToBase64(blob) }, 60000);
      D.setPhotoFile(n.id, pid, r.fileId);
    }
  }
  if (D.dirtyRecords().length) {
    const push = D.dirtyRecords();
    const r = await call({ action: 'sync', since: D.getState().sync.since, push });
    D.markSynced(push);
    D.applyPulled(r.pull || []);
    D.setSync({ since: r.now });
  }
}

// Ambil foto dari Drive bila foto itu dibuat di HP lain.
export async function fetchPhoto(note, photoId) {
  const local = await D.getPhoto(photoId);
  if (local) return local;
  const fileId = note.photoFiles && note.photoFiles[photoId];
  if (!fileId || !isConfigured()) return null;
  const r = await call({ action: 'getPhoto', fileId }, 60000);
  const bin = atob(r.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: r.mime || 'image/jpeg' });
  await D.cachePhoto(photoId, blob);
  return blob;
}
