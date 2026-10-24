// Pengujian otomatis semua endpoint. Pakai:  BASE_URL=https://nama.vercel.app npm run test:api
// Tanpa BASE_URL -> http://localhost:3000. Hasil ASLI ditulis ke submission/test-results.json dan submission/BUKTI-PENGUJIAN.md
// Data uji dibuat sendiri (nama unik) dan dibersihkan di akhir skenario; data penting tidak disentuh.
const fs = require('fs');
const path = require('path');
const steps = require('./spec');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'submission');
const sub = (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] !== undefined ? v[k] : `{{${k}}}`));
const subDeep = (o, v) => JSON.parse(sub(JSON.stringify(o), v));
const pick = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

function writeEvidence(meta, results) {
  const pass = results.filter((r) => r.ok).length;
  let md = `# Bukti Pengujian API\n\n`;
  if (!results.length) {
    md += `**Status: BELUM DIJALANKAN.** Jalankan \`npm run test:api\` (lokal) atau \`BASE_URL=<url-vercel> npm run test:api\`; file ini akan terisi otomatis dengan hasil asli.\n`;
  } else {
    md += `- Target: \`${meta.base}\`\n- Waktu: ${meta.time}\n- Hasil: **${pass}/${results.length} lulus**${pass === results.length ? '' : ' (ada yang GAGAL, lihat tabel)'}\n\n`;
    md += `| # | Endpoint | Skenario | Request | Harapan | Hasil | Status |\n|---|---|---|---|---|---|---|\n`;
    results.forEach((r, i) => {
      md += `| ${i + 1} | ${r.ep} | ${r.name} | \`${r.method} ${r.url.replace(meta.base, '')}\` | ${r.expect} | ${r.status ?? 'ERR'}${r.note ? ' - ' + r.note : ''} | ${r.ok ? 'LULUS' : 'GAGAL'} |\n`;
    });
    md += `\nRequest/response lengkap tiap langkah ada di \`test-results.json\`.\n`;
  }
  md += `\n## Screenshot (Thunder Client / Postman)\n\nFolder \`screenshots/\` ${fs.readdirSync(path.join(OUT, 'screenshots')).filter((f) => !f.startsWith('.')).length ? 'berisi' : 'masih KOSONG, belum ada'} screenshot. ` +
    `Ambil sendiri di Thunder Client dengan URL Vercel (import \`thunder-collection.json\` + \`thunder-environment.json\`), minimal satu per method (GET, POST, PUT/PATCH, DELETE) dan satu respons error, simpan sebagai \`screenshots/01-get-products.png\`, dst., lalu daftarkan di sini.\n`;
  fs.writeFileSync(path.join(OUT, 'BUKTI-PENGUJIAN.md'), md);
}

async function main() {
  if (process.argv.includes('--pending')) return writeEvidence({}, []);
  const vars = { rnd: Date.now().toString(36) };
  const results = [];
  for (const s of steps) {
    const url = BASE + sub(s.path, vars);
    const body = s.body ? subDeep(typeof s.body === 'function' ? s.body(vars) : s.body, vars) : undefined;
    const r = { ep: s.ep, name: s.name, method: s.method, url, expect: s.expect, request: body };
    try {
      const res = await fetch(url, {
        method: s.method,
        headers: body !== undefined || s.raw ? { 'Content-Type': 'application/json' } : {},
        body: s.raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
      });
      const text = await res.text();
      let json = null; try { json = JSON.parse(text); } catch (e) { /* bukan JSON */ }
      r.status = res.status; r.response = json ?? text;
      r.ok = res.status === s.expect;
      if (!r.ok) r.note = `harapan ${s.expect}`;
      if (r.ok && s.check) { const msg = s.check({ status: res.status, json }, vars); if (msg) { r.ok = false; r.note = msg; } }
      if (r.ok && s.save) for (const [k, p] of Object.entries(s.save)) vars[k] = pick(json, p);
      if (r.ok && json && typeof json !== 'object') { r.ok = false; r.note = 'response bukan JSON'; }
    } catch (e) { r.ok = false; r.note = 'gagal terhubung: ' + e.message; }
    results.push(r);
    console.log(`${r.ok ? 'LULUS' : 'GAGAL'}  ${s.method.padEnd(6)} ${url.replace(BASE, '')}  -> ${r.status ?? 'ERR'} ${r.note || ''}`);
  }
  const meta = { base: BASE, time: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'test-results.json'), JSON.stringify({ ...meta, results }, null, 2));
  writeEvidence(meta, results);
  const bad = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - bad}/${results.length} lulus`);
  process.exit(bad ? 1 : 0);
}
main();
