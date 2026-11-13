// Server uji: menyajikan aplikasi + tiruan Google Apps Script (SpreadsheetApp, DriveApp, dll)
// supaya sinkron bisa dicoba tanpa akun Google.
// Pakai: node tests/mock-apps-script.mjs 8770  → buka http://localhost:8770, alamat Web App = http://localhost:8770/exec
// Kode rahasia tercetak di layar (dan disimpan di tests/token.txt).
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.argv[2] || 8770);

// --- tiruan Sheets ---
class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  setValues(v) {
    for (let i = 0; i < v.length; i++) for (let j = 0; j < v[i].length; j++) {
      const row = (this.sh.rows[this.r - 1 + i] ||= []);
      let val = v[i][j];
      // tiruan perilaku Sheets: tanpa format teks, ISO date jadi Date
      if (!this.sh.textCols.has(this.c + j) && typeof val === 'string' && /^\d{4}-\d\d-\d\dT/.test(val)) val = new Date(val);
      row[this.c - 1 + j] = val;
    }
    return this;
  }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(this.sh.rows[this.r - 1 + i]?.[this.c - 1 + j] ?? ''); out.push(row); }
    return out;
  }
  setNumberFormat(f) { if (f === '@') for (let j = 0; j < this.nc; j++) this.sh.textCols.add(this.c + j); return this; }
}
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.textCols = new Set(); }
  getLastRow() { return this.rows.length; }
  getRange(a, c, nr = 1, nc = 1) {
    if (typeof a === 'string') { const m = a.match(/^([A-Z]):([A-Z])$/); const c1 = m[1].charCodeAt(0) - 64, c2 = m[2].charCodeAt(0) - 64; return new Range(this, 1, c1, 1000, c2 - c1 + 1); }
    return new Range(this, a, c, nr, nc);
  }
  getDataRange() { const nc = Math.max(1, ...this.rows.map((r) => r.length)); return new Range(this, 1, 1, this.rows.length, nc); }
  clearContents() { this.rows = []; }
  setFrozenRows() {}
}
const sheets = {};
const ss = {
  getName: () => 'Mbok Ni (uji)',
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = new Sheet(n)),
};
const files = {};
const props = {};
const ctx = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => (props[k] = v) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64Decode: (s) => [...Buffer.from(s, 'base64')],
    base64Encode: (b) => Buffer.from(b).toString('base64'),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
    formatDate: (d) => d.toISOString().slice(0, 16).replace('T', ' '),
  },
  DriveApp: {
    getFoldersByName: () => ({ hasNext: () => false }),
    createFolder: () => ({ createFile: (b) => { const id = 'F' + Object.keys(files).length; files[id] = b; return { getId: () => id }; } }),
    getFileById: (id) => ({ getBlob: () => ({ getContentType: () => files[id].mime, getBytes: () => files[id].bytes }) }),
  },
  Logger: { log: (...a) => console.log('[gs]', ...a) },
  Date, JSON, Math, Number, String, Object, Array, console,
});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8'), ctx);
const token = vm.runInContext('setup()', ctx);
fs.writeFileSync(path.join(ROOT, 'tests', 'token.txt'), token);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/exec')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      ctx.__e = { postData: { contents: body } };
      const out = vm.runInContext('doPost(__e)', ctx);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.t);
    });
    return;
  }
  if (req.url === '/__sheets') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, v]) => [k, v.rows])))); return; }
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
}).listen(PORT, () => console.log('mock on', PORT, 'token', token));
