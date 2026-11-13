/**
 * SANI · Mbok Ni — penghubung aplikasi dengan Google Sheet.
 *
 * Cara pasang ada di apps-script/CARA-PASANG.md.
 * Ringkasnya: tempel file ini di Extensions → Apps Script, jalankan fungsi `setup`
 * sekali, lalu Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *
 * Tab yang dibuat:
 *   _data   : salinan lengkap semua catatan (jangan diubah manual)
 *   Nota    : daftar nota yang mudah dibaca
 *   Toko    : daftar toko + stok di toko menurut catatan
 *   Kiriman : jadwal & kedatangan barang dari travel
 */

var PRODUCTS = [
  { id: 'pedas', name: 'Pecel Pedas' },
  { id: 'sedang', name: 'Pecel Sedang' },
  { id: 'tidak', name: 'Pecel Tidak Pedas' },
  { id: 'kacang', name: 'Bumbu Kacang' },
];
var DATA_HEADERS = ['kind', 'id', 'updatedAt', 'stamp', 'json'];
var PHOTO_FOLDER = 'Mbok Ni - Foto Nota';

// Jalankan sekali dari editor: membuat tab dan kode rahasia.
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  dataSheet_(ss);
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
    props.setProperty('TOKEN', token);
  }
  rebuildViews_(ss, loadAll_(ss).records);
  Logger.log('KODE RAHASIA: ' + token);
  return token;
}

function doGet() {
  return ContentService.createTextOutput('SANI · Mbok Ni aktif. Buka aplikasi untuk memakai.');
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ ok: false, error: 'Permintaan tidak terbaca' });
  }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || req.token !== token) return out_({ ok: false, error: 'token' });
  try {
    if (req.action === 'ping') return out_({ ok: true, name: SpreadsheetApp.getActiveSpreadsheet().getName() });
    if (req.action === 'sync') return out_(sync_(req));
    if (req.action === 'photo') return out_(savePhoto_(req));
    if (req.action === 'getPhoto') return out_(getPhoto_(req));
    return out_({ ok: false, error: 'Perintah tidak dikenal' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Data ----------
function dataSheet_(ss) {
  var sh = ss.getSheetByName('_data');
  if (!sh) {
    sh = ss.insertSheet('_data');
    sh.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]);
    sh.setFrozenRows(1);
  }
  // simpan sebagai teks apa adanya (Sheets suka mengubah tanggal & angka secara otomatis)
  sh.getRange('A:E').setNumberFormat('@');
  return sh;
}

function loadAll_(ss) {
  var sh = dataSheet_(ss);
  var values = sh.getDataRange().getValues();
  var records = [];
  var rowById = {};
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (!v[1]) continue;
    var rec = { kind: v[0], id: String(v[1]), updatedAt: String(v[2]), stamp: Number(v[3]), data: JSON.parse(v[4]) };
    rowById[rec.id] = { row: i + 1, index: records.length };
    records.push(rec);
  }
  return { sh: sh, records: records, rowById: rowById };
}

function noNumber_(no) {
  return Number(String(no || '').replace(/\D/g, '')) || 0;
}

/**
 * Terima perubahan dari HP, simpan yang lebih baru, lalu kirim balik semua yang berubah sejak `since`.
 * Nomor nota dijaga unik: kalau dua HP membuat nomor yang sama, yang datang belakangan diberi nomor baru.
 */
function sync_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var db = loadAll_(ss);
    var lastStamp = db.records.reduce(function (m, r) { return Math.max(m, r.stamp || 0); }, 0);
    var stamp = Math.max(Date.now(), lastStamp + 1);
    var changed = false;
    var noOwner = {};
    var maxNo = 0;
    db.records.forEach(function (r) {
      if (r.kind === 'note' && r.data.no) {
        noOwner[r.data.no] = r.id;
        maxNo = Math.max(maxNo, noNumber_(r.data.no));
      }
    });
    var updates = [];
    var appends = [];

    (req.push || []).forEach(function (inc) {
      var at = db.rowById[inc.id];
      var existing = at ? db.records[at.index] : null;
      if (existing && existing.updatedAt >= inc.updatedAt) return; // yang di Sheet lebih baru
      var data = inc.data;
      if (inc.kind === 'note') {
        if (existing) {
          // nomor & foto yang sudah tercatat di Sheet tidak boleh hilang
          data.no = existing.data.no;
          data.photoFiles = merge_(existing.data.photoFiles, data.photoFiles);
        } else if (!data.no || (noOwner[data.no] && noOwner[data.no] !== inc.id)) {
          maxNo += 1;
          data.no = 'MBOKNI-' + ('000' + maxNo).slice(-4);
        }
        noOwner[data.no] = inc.id;
        maxNo = Math.max(maxNo, noNumber_(data.no));
      }
      var rec = { kind: inc.kind, id: inc.id, updatedAt: inc.updatedAt, stamp: stamp, data: data };
      var row = [rec.kind, rec.id, rec.updatedAt, rec.stamp, JSON.stringify(rec.data)];
      if (existing) {
        db.records[at.index] = rec;
        updates.push({ row: at.row, values: row });
      } else {
        db.rowById[rec.id] = { row: db.sh.getLastRow() + appends.length + 1, index: db.records.length };
        db.records.push(rec);
        appends.push(row);
      }
      changed = true;
    });

    updates.forEach(function (u) {
      db.sh.getRange(u.row, 1, 1, u.values.length).setValues([u.values]);
    });
    if (appends.length) db.sh.getRange(db.sh.getLastRow() + 1, 1, appends.length, DATA_HEADERS.length).setValues(appends);
    if (changed) rebuildViews_(ss, db.records);

    var since = Number(req.since) || 0;
    var pull = db.records
      .filter(function (r) { return r.stamp > since; })
      .map(function (r) { return { kind: r.kind, id: r.id, updatedAt: r.updatedAt, data: r.data }; });
    var now = db.records.reduce(function (m, r) { return Math.max(m, r.stamp || 0); }, 0);
    return { ok: true, now: now, pull: pull };
  } finally {
    lock.releaseLock();
  }
}

function merge_(a, b) {
  var out = {};
  Object.keys(a || {}).forEach(function (k) { out[k] = a[k]; });
  Object.keys(b || {}).forEach(function (k) { out[k] = b[k]; });
  return out;
}

// ---------- Foto ----------
function photoFolder_() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}

function savePhoto_(req) {
  var name = (req.no || req.noteId) + ' - ' + req.photoId + '.jpg';
  var blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.mime || 'image/jpeg', name);
  var file = photoFolder_().createFile(blob);
  return { ok: true, fileId: file.getId() };
}

function getPhoto_(req) {
  var file = DriveApp.getFileById(req.fileId);
  var blob = file.getBlob();
  return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

// ---------- Tab yang mudah dibaca ----------
function sheetFresh_(ss, name, headers, rows, textCols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  (textCols || []).forEach(function (c) { sh.getRange(1, c, Math.max(1, rows.length + 1), 1).setNumberFormat('@'); });
  var all = [headers].concat(rows);
  sh.getRange(1, 1, all.length, headers.length).setValues(all);
  sh.setFrozenRows(1);
  return sh;
}

function fmtDate_(iso) {
  if (!iso) return '';
  return Utilities.formatDate(new Date(iso), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm');
}

function sumMap_(m) {
  return Object.keys(m || {}).reduce(function (a, k) { return a + (m[k] || 0); }, 0);
}

function rebuildViews_(ss, records) {
  var stores = {};
  var notes = [];
  var schedules = [];
  records.forEach(function (r) {
    if (r.kind === 'store') stores[r.id] = r.data;
    else if (r.kind === 'note') notes.push(r.data);
    else if (r.kind === 'schedule') schedules.push(r.data);
  });
  notes.sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });

  var JENIS = { titip: 'Titip', cek: 'Pembayaran', datang: 'Barang datang' };
  var noteRows = notes.map(function (n) {
    var qty = n.type === 'cek' ? n.sold || {} : n.items || {};
    var paid = (n.payments || []).reduce(function (a, p) { return a + p.amount; }, 0);
    var status = n.status === 'batal' ? 'BATAL' : '';
    if (!status && n.type === 'cek') {
      if (!sumMap_(n.sold)) status = 'Tidak ada yang laku';
      else if (n.amount != null && paid >= n.amount) status = 'LUNAS';
      else status = paid ? 'Kurang ' + ((n.amount || 0) - paid) : 'Belum dibayar';
    }
    var row = [
      n.no,
      fmtDate_(n.createdAt),
      JENIS[n.type] || n.type,
      n.type === 'datang' ? 'Travel: ' + (n.courier || '-') : (stores[n.storeId] || {}).name || '-',
      n.receiver || '',
    ];
    PRODUCTS.forEach(function (p) { row.push(qty[p.id] || 0); });
    row.push(sumMap_(qty), n.type === 'cek' ? sumMap_(n.pulled) : '', n.amount != null ? n.amount : '', n.type === 'cek' ? paid : '', status, (n.photos || []).length);
    return row;
  });
  var noteHeaders = ['No', 'Tanggal', 'Jenis', 'Toko / Travel', 'Petugas toko'];
  PRODUCTS.forEach(function (p) { noteHeaders.push(p.name); });
  noteHeaders.push('Jumlah (bks)', 'Ditarik', 'Total (Rp)', 'Dibayar (Rp)', 'Status', 'Foto');
  sheetFresh_(ss, 'Nota', noteHeaders, noteRows.reverse());

  // Stok di toko: hasil cek terakhir + titipan sesudahnya (sama dengan aplikasi)
  var stock = {};
  notes.forEach(function (n) {
    if (n.status !== 'aktif' || !n.storeId) return;
    var s = (stock[n.storeId] = stock[n.storeId] || {});
    if (n.type === 'cek') PRODUCTS.forEach(function (p) { s[p.id] = Math.max(0, ((n.counted || {})[p.id] || 0) - ((n.pulled || {})[p.id] || 0)); });
    if (n.type === 'titip') Object.keys(n.items || {}).forEach(function (k) { s[k] = (s[k] || 0) + n.items[k]; });
  });
  var storeHeaders = ['Toko', 'No. WA', 'Alamat'];
  PRODUCTS.forEach(function (p) { storeHeaders.push('Stok ' + p.name); });
  storeHeaders.push('Total di toko');
  var storeRows = Object.keys(stores)
    .filter(function (id) { return !stores[id].archived; })
    .map(function (id) {
      var st = stock[id] || {};
      var row = [stores[id].name, stores[id].wa ? '0' + String(stores[id].wa).slice(2) : '', stores[id].address || ''];
      PRODUCTS.forEach(function (p) { row.push(st[p.id] || 0); });
      row.push(sumMap_(st));
      return row;
    });
  sheetFresh_(ss, 'Toko', storeHeaders, storeRows, [2]);

  var STATUS = { menunggu: 'Menunggu', tiba: 'Sudah datang', batal: 'Batal' };
  schedules.sort(function (a, b) { return (a.date + a.time) < (b.date + b.time) ? 1 : -1; });
  sheetFresh_(ss, 'Kiriman', ['Tanggal', 'Jam', 'Travel', 'No. HP', 'Catatan', 'Status'], schedules.map(function (s) {
    return [s.date, s.time || '', s.courier || '', s.phone || '', s.note || '', STATUS[s.status] || s.status];
  }), [1, 2, 4]);
}
