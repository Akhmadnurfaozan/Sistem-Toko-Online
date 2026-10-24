// Membuat submission/README.md, thunder-collection.json, thunder-environment.json dari scripts/spec.js
// (+ response asli dari submission/test-results.json bila sudah menjalankan: npm run test:api)
const fs = require('fs');
const path = require('path');
const steps = require('./spec');
const OUT = path.join(__dirname, '..', 'submission');
const W = (f, s) => fs.writeFileSync(path.join(OUT, f), s);

let real = null;
try { real = JSON.parse(fs.readFileSync(path.join(OUT, 'test-results.json'), 'utf8')); } catch (e) { /* belum ada */ }
const realFor = (i) => (real && real.results[i] && real.results[i].response !== undefined ? real.results[i] : null);

/* ---------- Thunder Client ---------- */
const VARS = ['userId', 'categoryId', 'productId', 'orderId', 'reviewId'];
const proxy = new Proxy({}, { get: (_, k) => `@@${String(k)}@@` });
const toThunder = (o) => JSON.stringify(o, null, 2).replace(/"@@(\w+)@@"/g, '{{$1}}').replace(/@@(\w+)@@/g, '{{$1}}');
const now = new Date().toISOString();
const colId = 'toko-online-uji';
const requests = steps.map((s, i) => {
  const body = s.body ? (typeof s.body === 'function' ? s.body(proxy) : s.body) : null;
  const tests = [{ type: 'res-code', custom: '', action: 'equal', value: String(s.expect) }];
  for (const [k, p] of Object.entries(s.save || {})) tests.push({ type: 'set-env-var', custom: 'json.' + p, action: 'setto', value: `{{${k}}}` });
  return {
    _id: `req-${String(i + 1).padStart(3, '0')}`, colId, containerId: '', name: `${String(i + 1).padStart(2, '0')} ${s.method} ${s.name}`,
    url: '{{baseUrl}}' + s.path, method: s.method, sortNum: (i + 1) * 10000, created: now, modified: now,
    headers: body || s.raw ? [{ name: 'Content-Type', value: 'application/json' }] : [], params: [],
    body: s.raw ? { type: 'json', raw: s.raw, form: [] } : body ? { type: 'json', raw: toThunder(body), form: [] } : undefined, tests,
  };
});
W('thunder-collection.json', JSON.stringify({ clientName: 'Thunder Client', collectionName: 'Toko Online API', collectionId: colId, dateExported: now, version: '1.2', folders: [], requests }, null, 2));
W('thunder-environment.json', JSON.stringify({
  _id: 'env-toko-online', name: 'Toko Online', default: true, global: false, sortNum: 1, created: now, modified: now,
  data: [{ name: 'baseUrl', value: 'http://localhost:3000' }, { name: 'rnd', value: 'uji1' }, ...VARS.map((n) => ({ name: n, value: '' }))],
}, null, 2));

/* ---------- README ---------- */
const eps = new Map();
steps.forEach((s, i) => {
  if (/unknown|JSON rusak/.test(s.ep)) return;
  const e = eps.get(s.ep) || { ep: s.ep, method: s.method, path: s.path.replace(/\?.*/, ''), errs: [] };
  if (s.desc && !e.desc) { e.desc = s.desc; e.ok = s; e.okI = i; }
  else if (s.expect >= 400) e.errs.push({ s, i });
  eps.set(s.ep, e);
});
const gen = (e) => (e.ep === 'GET /' ? '{ "name": "REST API Sistem Toko Online", "endpoints": [ ... ] }'
  : e.method === 'DELETE' ? '{ "message": "... berhasil dihapus" }'
  : e.method === 'GET' ? (e.ep.includes(':id') && !e.ep.endsWith('orders') ? '{ "data": { ... } }' : '{ "data": [ ... ] }')
  : '{ "message": "... berhasil ...", "data": { ... } }');
const cut = (x) => JSON.stringify(Array.isArray(x?.data) ? { ...x, data: x.data.slice(0, 2) } : x, null, 2);
const urlOf = (p) => '`{{BASE_URL}}' + p.replace(/\{\{(\w+)\}\}/g, ':id') + '`';
let docs = '';
for (const e of eps.values()) {
  if (!e.ok) continue;
  const b = e.ok.body ? (typeof e.ok.body === 'function' ? e.ok.body(proxy) : e.ok.body) : null;
  const r = realFor(e.okI);
  docs += `### ${e.ep}\n- Method : ${e.method}\n- URL : ${urlOf(e.path)}\n- Deskripsi : ${e.desc}\n- Headers : ${b ? '`Content-Type: application/json`' : '-'}\n`;
  docs += `- Request Body :\n${b ? '```json\n' + toThunder(b).replace(/\{\{rnd\}\}/g, 'uji1').replace(/\{\{\w+Id\}\}/g, '1') + '\n```' : '  -'}\n`;
  docs += `- Response Sukses (${e.ok.expect}):\n\`\`\`json\n${r ? cut(r.response) : gen(e)}\n\`\`\`\n`;
  const errs = e.errs.length ? e.errs : [];
  docs += `- Response Error: ` + (errs.length ? '\n' + errs.map(({ s, i }) => {
    const x = realFor(i); return `  - **${s.expect}** (${s.name}): \`${x && x.response && x.response.error ? JSON.stringify(x.response) : '{ "error": "<pesan kesalahan>" }'}\``;
  }).join('\n') : '`{ "error": "<pesan kesalahan>" }`') + '\n\n';
}
const erd = fs.readFileSync(path.join(OUT, 'ERD.md'), 'utf8').match(/```mermaid[\s\S]*?```/)[0];
const link = (u) => u;
W('README.md', `# Toko Online REST API

REST API sederhana untuk sistem toko online (e-commerce): manajemen user, profil, kategori, produk, order, dan review. Tugas Akhir Learning Labs: Backend Development.

- **Nama**: Akhmad Nur Faozan (21114022610003)
- **Repository**: lihat [LINK-PENGUMPULAN.md](LINK-PENGUMPULAN.md)
- **Deployment (Vercel)**: lihat [LINK-PENGUMPULAN.md](LINK-PENGUMPULAN.md)

## Teknologi
Node.js 18+, Express.js 4, PostgreSQL (driver \`pg\`), bcryptjs (hash password), dotenv. Deploy ke Vercel (serverless function \`api/index.js\`) dengan database PostgreSQL online (Supabase/Neon).

## ERD / Skema Database
7 tabel berelasi foreign key (skema lengkap: [\`schema.sql\`](../schema.sql), detail relasi: [ERD.md](ERD.md)).

${erd}

## Fitur
- CRUD lengkap: **products**, categories, reviews, users, profil user (1:1), order (create/read/ubah status/hapus).
- Validasi input (tipe, wajib diisi, format email/tanggal, rating 1-5, harga/stok >= 0) dan status HTTP tepat: 200, 201, 400, 401, 404, 409, 500. Semua response berformat JSON; error: \`{ "error": "pesan" }\`.
- Password di-hash dengan bcrypt (cost 10), \`password_hash\` tidak pernah dikirim ke client; role selalu \`customer\` saat register.
- Pembuatan order memakai transaksi database: total dihitung server dari harga produk, stok berkurang otomatis, dan dikembalikan saat order dibatalkan.
- Query memakai parameter (\`$1, $2\`) sehingga aman dari SQL injection. Catatan: API ini belum memakai token/JWT (di luar syarat tugas), jadi endpoint belum dibatasi per role.

## Menjalankan Secara Lokal
\`\`\`bash
git clone <URL-REPOSITORY> && cd <nama-folder>
npm install
cp .env.example .env          # isi DATABASE_URL milik kamu (Windows: copy .env.example .env)
psql "$DATABASE_URL" -f schema.sql   # membuat 7 tabel + data contoh
npm start                     # http://localhost:3000
npm run test:api              # pengujian otomatis semua endpoint
npm run docs                  # perbarui dokumen/koleksi setelah pengujian
\`\`\`
Catatan: \`schema.sql\` memakai \`DROP TABLE\` sehingga mengosongkan data lama. User contoh di \`schema.sql\` memakai hash palsu, jadi login hanya bisa dengan user hasil \`POST /auth/register\`.

## Deployment ke Vercel
1. Push repository ke GitHub (pastikan \`.env\` tidak ikut; sudah ada di \`.gitignore\`).
2. Buat database PostgreSQL online (Supabase: Project Settings > Database > Connection string, pilih *Transaction pooler*; atau Neon). Jalankan isi \`schema.sql\` di SQL Editor-nya.
3. Di vercel.com: *Add New > Project* > import repository (Framework Preset: Other).
4. Settings > Environment Variables: \`DATABASE_URL\` = connection string, \`DB_SSL\` = \`true\`. Jangan menaruh nilai ini di kode.
5. Deploy, lalu uji: \`BASE_URL=https://nama-project.vercel.app npm run test:api\`.

## Dokumentasi Endpoint
Base URL: \`{{BASE_URL}}\` = URL Vercel (lokal: \`http://localhost:3000\`). Semua request/response berformat JSON. \`:id\` diganti ID data. Dihasilkan dari \`scripts/spec.js\`${real ? ` dengan response asli dari pengujian ${real.time} (${real.base})` : '; bentuk response di bawah masih generik karena pengujian belum dijalankan, jalankan `npm run test:api` lalu `npm run docs` untuk mengisinya dengan response asli'}.

${docs}## Pengujian
Koleksi Thunder Client: [thunder-collection.json](thunder-collection.json) dan [thunder-environment.json](thunder-environment.json) (ubah \`baseUrl\` ke URL Vercel). Hasil pengujian: [BUKTI-PENGUJIAN.md](BUKTI-PENGUJIAN.md).
`);
console.log('OK:', requests.length, 'request,', eps.size, 'endpoint terdokumentasi');
