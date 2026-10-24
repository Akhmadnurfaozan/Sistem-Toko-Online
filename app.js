const express = require('express');
const bcrypt = require('bcryptjs');
const { Pool, types } = require('pg');

types.setTypeParser(1700, (v) => parseFloat(v)); // NUMERIC -> number
types.setTypeParser(1082, (v) => v);             // DATE -> 'YYYY-MM-DD'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 3,
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
const router = express.Router();

/* ---------- Helper ---------- */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const isId = (v) => /^\d{1,9}$/.test(String(v));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// spec: string | email | username | password | int (>=0) | pint (>=1) | num (>=0) | date | bool ; akhiran '!' = wajib
function validate(body, schema, { partial = false } = {}) {
  const errors = [], values = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Body harus berupa JSON object'], values };
  }
  for (const [field, spec] of Object.entries(schema)) {
    const required = spec.endsWith('!');
    const type = spec.replace('!', '');
    const v = body[field];
    if (v === undefined) { if (required && !partial) errors.push(`Field ${field} wajib diisi`); continue; }
    if (v === null || v === '') {
      if (required) errors.push(`Field ${field} wajib diisi`); else values[field] = null;
      continue;
    }
    if (['string', 'email', 'username', 'password', 'date'].includes(type)) {
      if (typeof v !== 'string') { errors.push(`Field ${field} harus berupa teks`); continue; }
      const s = type === 'password' ? v : v.trim();
      if (type === 'email' && !EMAIL.test(s)) errors.push('Format email tidak valid');
      else if (type === 'username' && !/^[A-Za-z0-9_]{3,50}$/.test(s)) errors.push('Username 3-50 karakter (huruf, angka, underscore)');
      else if (type === 'password' && !(s.length >= 8 && /[A-Za-z]/.test(s) && /\d/.test(s))) errors.push('Password minimal 8 karakter dan mengandung huruf serta angka');
      else if (type === 'date' && !(/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)))) errors.push(`Field ${field} harus berformat YYYY-MM-DD`);
      else values[field] = type === 'email' ? s.toLowerCase() : s;
    } else if (type === 'int' || type === 'pint') {
      const min = type === 'pint' ? 1 : 0;
      if (!Number.isInteger(v) || v < min || v > 2000000000) errors.push(`Field ${field} harus berupa bilangan bulat >= ${min}`);
      else values[field] = v;
    } else if (type === 'num') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 9999999999) errors.push(`Field ${field} harus berupa angka >= 0`);
      else values[field] = v;
    } else if (type === 'bool') {
      if (typeof v !== 'boolean') errors.push(`Field ${field} harus berupa true/false`); else values[field] = v;
    }
  }
  return { errors, values };
}

/* ---------- CRUD generik ---------- */
function crud({ route, table, alias, select, schema, label, filters = [], search = [], extra }) {
  const sel = select || `SELECT * FROM ${table}`;
  const idCol = alias ? `${alias}.id` : 'id';
  const cols = Object.keys(schema);
  const pre = alias ? alias + '.' : '';

  router.get(`/${route}`, wrap(async (req, res) => {
    const where = [], params = [];
    for (const f of filters) {
      if (req.query[f] !== undefined) {
        if (!isId(req.query[f])) return fail(res, 400, `Query ${f} harus berupa angka`);
        params.push(Number(req.query[f])); where.push(`${pre}${f} = $${params.length}`);
      }
    }
    if (search.length && req.query.q) {
      params.push(`%${String(req.query.q).slice(0, 100)}%`);
      where.push('(' + search.map((s) => `${s} ILIKE $${params.length}`).join(' OR ') + ')');
    }
    const r = await pool.query(`${sel} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${idCol}`, params);
    res.json({ data: r.rows });
  }));

  router.get(`/${route}/:id`, wrap(async (req, res) => {
    if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
    const r = await pool.query(`${sel} WHERE ${idCol} = $1`, [req.params.id]);
    if (!r.rows.length) return fail(res, 404, `${label} tidak ditemukan`);
    res.json({ data: r.rows[0] });
  }));

  router.post(`/${route}`, wrap(async (req, res) => {
    const { errors, values } = validate(req.body, schema);
    if (extra) errors.push(...extra(values));
    if (errors.length) return fail(res, 400, errors.join('; '));
    const keys = Object.keys(values);
    const ins = await pool.query(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
      keys.map((k) => values[k]));
    const r = await pool.query(`${sel} WHERE ${idCol} = $1`, [ins.rows[0].id]);
    res.status(201).json({ message: `${label} berhasil ditambahkan`, data: r.rows[0] });
  }));

  // PUT = ganti seluruh data (field opsional yang tidak dikirim kembali ke default/NULL)
  router.put(`/${route}/:id`, wrap(async (req, res) => {
    if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
    const { errors, values } = validate(req.body, schema);
    if (extra) errors.push(...extra(values));
    if (errors.length) return fail(res, 400, errors.join('; '));
    const params = [], sets = cols.map((c) => {
      if (values[c] === undefined) return `${c} = DEFAULT`;
      params.push(values[c]); return `${c} = $${params.length}`;
    });
    params.push(req.params.id);
    const u = await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`, params);
    if (!u.rows.length) return fail(res, 404, `${label} tidak ditemukan`);
    const r = await pool.query(`${sel} WHERE ${idCol} = $1`, [req.params.id]);
    res.json({ message: `${label} berhasil diperbarui`, data: r.rows[0] });
  }));

  router.patch(`/${route}/:id`, wrap(async (req, res) => {
    if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
    const { errors, values } = validate(req.body, schema, { partial: true });
    if (extra) errors.push(...extra(values));
    if (errors.length) return fail(res, 400, errors.join('; '));
    const keys = Object.keys(values);
    if (!keys.length) return fail(res, 400, 'Tidak ada field yang diubah');
    const params = keys.map((k) => values[k]); params.push(req.params.id);
    const u = await pool.query(
      `UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${params.length} RETURNING id`, params);
    if (!u.rows.length) return fail(res, 404, `${label} tidak ditemukan`);
    const r = await pool.query(`${sel} WHERE ${idCol} = $1`, [req.params.id]);
    res.json({ message: `${label} berhasil diperbarui`, data: r.rows[0] });
  }));

  router.delete(`/${route}/:id`, wrap(async (req, res) => {
    if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
    const r = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!r.rows.length) return fail(res, 404, `${label} tidak ditemukan`);
    res.json({ message: `${label} berhasil dihapus` });
  }));
}

const ratingCheck = (v) => (v.rating !== undefined && (v.rating < 1 || v.rating > 5) ? ['Field rating harus 1 sampai 5'] : []);

crud({ route: 'categories', table: 'categories', label: 'Kategori', schema: { name: 'string!', description: 'string' } });
crud({
  route: 'products', table: 'products', alias: 'p', label: 'Produk',
  select: `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.description, p.price, p.stock, p.created_at,
             (SELECT ROUND(AVG(r.rating), 2) FROM reviews r WHERE r.product_id = p.id) AS avg_rating,
             (SELECT COUNT(*)::int FROM reviews r WHERE r.product_id = p.id) AS review_count
           FROM products p JOIN categories c ON c.id = p.category_id`,
  schema: { category_id: 'pint!', name: 'string!', description: 'string', price: 'num!', stock: 'int' },
  filters: ['category_id'], search: ['p.name', 'p.description'],
});
crud({
  route: 'reviews', table: 'reviews', label: 'Review',
  schema: { user_id: 'pint!', product_id: 'pint!', rating: 'pint!', comment: 'string' },
  filters: ['product_id', 'user_id'], extra: ratingCheck,
});

/* ---------- Auth & Users ---------- */
const USER_COLS = 'id, username, email, role, created_at'; // password_hash TIDAK pernah dikirim

router.post('/auth/register', wrap(async (req, res) => {
  const { errors, values } = validate(req.body, { username: 'username!', email: 'email!', password: 'password!' });
  if (errors.length) return fail(res, 400, errors.join('; '));
  const hash = await bcrypt.hash(values.password, 10);
  const r = await pool.query(
    `INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING ${USER_COLS}`,
    [values.username, values.email, hash]); // role selalu 'customer' pada registrasi publik
  res.status(201).json({ message: 'Registrasi berhasil', data: r.rows[0] });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const { errors, values } = validate(req.body, { email: 'email!', password: 'string!' });
  if (errors.length) return fail(res, 400, errors.join('; '));
  const r = await pool.query('SELECT id, username, email, role, created_at, password_hash FROM users WHERE email = $1', [values.email]);
  const u = r.rows[0];
  const ok = u && (await bcrypt.compare(req.body.password, u.password_hash).catch(() => false));
  if (!ok) return fail(res, 401, 'Email atau password salah');
  delete u.password_hash;
  res.json({ message: 'Login berhasil', data: u });
}));

router.get('/users', wrap(async (req, res) => {
  const r = await pool.query(`SELECT ${USER_COLS} FROM users ORDER BY id`);
  res.json({ data: r.rows });
}));

router.get('/users/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const r = await pool.query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [req.params.id]);
  if (!r.rows.length) return fail(res, 404, 'User tidak ditemukan');
  res.json({ data: r.rows[0] });
}));

async function updateUser(req, res, partial) {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const spec = partial ? { username: 'username', email: 'email', password: 'password' } : { username: 'username!', email: 'email!', password: 'password' };
  const { errors, values } = validate(req.body, spec, { partial });
  if (errors.length) return fail(res, 400, errors.join('; '));
  if (values.password) { values.password_hash = await bcrypt.hash(values.password, 10); delete values.password; }
  const keys = Object.keys(values);
  if (!keys.length) return fail(res, 400, 'Tidak ada field yang diubah');
  const params = keys.map((k) => values[k]); params.push(req.params.id);
  const r = await pool.query(
    `UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${params.length} RETURNING ${USER_COLS}`, params);
  if (!r.rows.length) return fail(res, 404, 'User tidak ditemukan');
  res.json({ message: 'User berhasil diperbarui', data: r.rows[0] });
}
router.put('/users/:id', wrap((req, res) => updateUser(req, res, false)));
router.patch('/users/:id', wrap((req, res) => updateUser(req, res, true)));

router.delete('/users/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const r = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return fail(res, 404, 'User tidak ditemukan');
  res.json({ message: 'User berhasil dihapus' });
}));

/* ---------- Profil (1:1 dengan users) ---------- */
const PROFILE = { full_name: 'string!', phone: 'string', address: 'string', city: 'string', postal_code: 'string', birth_date: 'date' };
const getProfile = (uid) => pool.query('SELECT * FROM user_profiles WHERE user_id = $1', [uid]);

router.get('/users/:id/profile', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const r = await getProfile(req.params.id);
  if (!r.rows.length) return fail(res, 404, 'Profil tidak ditemukan');
  res.json({ data: r.rows[0] });
}));

// PUT = buat atau ganti profil (upsert)
router.put('/users/:id/profile', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const { errors, values } = validate(req.body, PROFILE);
  if (errors.length) return fail(res, 400, errors.join('; '));
  const u = await pool.query('SELECT 1 FROM users WHERE id = $1', [req.params.id]);
  if (!u.rows.length) return fail(res, 404, 'User tidak ditemukan');
  const cols = Object.keys(PROFILE), vals = cols.map((c) => values[c] ?? null);
  const r = await pool.query(
    `INSERT INTO user_profiles (user_id, ${cols.join(',')}) VALUES ($1, ${cols.map((_, i) => '$' + (i + 2)).join(',')})
     ON CONFLICT (user_id) DO UPDATE SET ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}
     RETURNING *, (xmax = 0) AS created`, [req.params.id, ...vals]);
  const { created, ...data } = r.rows[0];
  res.status(created ? 201 : 200).json({ message: created ? 'Profil berhasil dibuat' : 'Profil berhasil diperbarui', data });
}));

router.patch('/users/:id/profile', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const { errors, values } = validate(req.body, PROFILE, { partial: true });
  if (errors.length) return fail(res, 400, errors.join('; '));
  const keys = Object.keys(values);
  if (!keys.length) return fail(res, 400, 'Tidak ada field yang diubah');
  const params = keys.map((k) => values[k]); params.push(req.params.id);
  const r = await pool.query(
    `UPDATE user_profiles SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE user_id = $${params.length} RETURNING *`, params);
  if (!r.rows.length) return fail(res, 404, 'Profil tidak ditemukan');
  res.json({ message: 'Profil berhasil diperbarui', data: r.rows[0] });
}));

router.delete('/users/:id/profile', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const r = await pool.query('DELETE FROM user_profiles WHERE user_id = $1 RETURNING id', [req.params.id]);
  if (!r.rows.length) return fail(res, 404, 'Profil tidak ditemukan');
  res.json({ message: 'Profil berhasil dihapus' });
}));

/* ---------- Orders ---------- */
const NEXT = { pending: ['paid', 'cancelled'], paid: ['shipped', 'cancelled'], shipped: ['completed'], completed: [], cancelled: [] };

async function orderDetail(db, id) {
  const o = await db.query(
    `SELECT o.*, u.username FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [id]);
  if (!o.rows.length) return null;
  const items = await db.query(
    `SELECT oi.product_id, p.name AS product_name, oi.quantity, oi.unit_price, (oi.quantity * oi.unit_price) AS line_total
     FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.product_id`, [id]);
  return { ...o.rows[0], items: items.rows };
}

router.get('/orders', wrap(async (req, res) => {
  const where = [], params = [];
  if (req.query.user_id !== undefined) {
    if (!isId(req.query.user_id)) return fail(res, 400, 'Query user_id harus berupa angka');
    params.push(Number(req.query.user_id)); where.push(`o.user_id = $${params.length}`);
  }
  if (req.query.status) { params.push(String(req.query.status)); where.push(`o.status = $${params.length}`); }
  const r = await pool.query(
    `SELECT o.*, u.username FROM orders o JOIN users u ON u.id = o.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id`, params);
  res.json({ data: r.rows });
}));

router.get('/orders/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const d = await orderDetail(pool, req.params.id);
  if (!d) return fail(res, 404, 'Order tidak ditemukan');
  res.json({ data: d });
}));

router.post('/orders', wrap(async (req, res) => {
  const body = req.body || {};
  const { errors, values } = validate(body, { user_id: 'pint!', shipping_address: 'string!' });
  const qty = new Map();
  if (!Array.isArray(body.items) || !body.items.length) errors.push('Field items wajib diisi (minimal 1 item)');
  else {
    body.items.forEach((it, i) => {
      const v = validate(it, { product_id: 'pint!', quantity: 'pint!' });
      if (v.errors.length) return errors.push(`items[${i}]: ${v.errors.join(', ')}`);
      qty.set(v.values.product_id, (qty.get(v.values.product_id) || 0) + v.values.quantity);
    });
  }
  if (errors.length) return fail(res, 400, errors.join('; '));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query('SELECT 1 FROM users WHERE id = $1', [values.user_id]);
    if (!u.rows.length) { await client.query('ROLLBACK'); return fail(res, 400, 'User tidak ditemukan'); }
    const ids = [...qty.keys()].sort((a, b) => a - b);
    const p = await client.query('SELECT id, name, price, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    const map = new Map(p.rows.map((r) => [r.id, r]));
    for (const id of ids) {
      const pr = map.get(id);
      if (!pr) { await client.query('ROLLBACK'); return fail(res, 400, `Produk dengan id ${id} tidak ditemukan`); }
      if (pr.stock < qty.get(id)) { await client.query('ROLLBACK'); return fail(res, 400, `Stok "${pr.name}" tidak cukup (tersedia ${pr.stock})`); }
    }
    const total = ids.reduce((s, id) => s + map.get(id).price * qty.get(id), 0);
    const o = await client.query(
      'INSERT INTO orders (user_id, shipping_address, total_amount) VALUES ($1,$2,$3) RETURNING id',
      [values.user_id, values.shipping_address, total]);
    for (const id of ids) {
      await client.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [o.rows[0].id, id, qty.get(id), map.get(id).price]);
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [qty.get(id), id]);
    }
    await client.query('COMMIT');
    res.status(201).json({ message: 'Order berhasil dibuat', data: await orderDetail(pool, o.rows[0].id) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}));

// PATCH: ubah alamat pengiriman (hanya saat status pending)
router.patch('/orders/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const { errors, values } = validate(req.body, { shipping_address: 'string!' });
  if (errors.length) return fail(res, 400, errors.join('; '));
  const cur = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
  if (!cur.rows.length) return fail(res, 404, 'Order tidak ditemukan');
  if (cur.rows[0].status !== 'pending') return fail(res, 400, 'Alamat hanya bisa diubah saat order berstatus pending');
  await pool.query('UPDATE orders SET shipping_address = $1 WHERE id = $2', [values.shipping_address, req.params.id]);
  res.json({ message: 'Order berhasil diperbarui', data: await orderDetail(pool, req.params.id) });
}));

// PATCH status: pending -> paid|cancelled, paid -> shipped|cancelled, shipped -> completed
router.patch('/orders/:id/status', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const { errors, values } = validate(req.body, { status: 'string!' });
  if (!errors.length && !Object.keys(NEXT).includes(values.status)) errors.push('Status harus salah satu dari: ' + Object.keys(NEXT).join(', '));
  if (errors.length) return fail(res, 400, errors.join('; '));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur.rows.length) { await client.query('ROLLBACK'); return fail(res, 404, 'Order tidak ditemukan'); }
    const from = cur.rows[0].status;
    if (!NEXT[from].includes(values.status)) {
      await client.query('ROLLBACK');
      return fail(res, 400, `Status tidak bisa diubah dari "${from}" ke "${values.status}"`);
    }
    if (values.status === 'cancelled') { // kembalikan stok
      await client.query(
        `UPDATE products p SET stock = p.stock + oi.quantity FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id`, [req.params.id]);
    }
    await client.query('UPDATE orders SET status = $1 WHERE id = $2', [values.status, req.params.id]);
    await client.query('COMMIT');
    res.json({ message: `Status order diubah menjadi ${values.status}`, data: await orderDetail(pool, req.params.id) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}));

router.delete('/orders/:id', wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'ID harus berupa angka');
  const cur = await pool.query('SELECT status FROM orders WHERE id = $1', [req.params.id]);
  if (!cur.rows.length) return fail(res, 404, 'Order tidak ditemukan');
  if (cur.rows[0].status !== 'cancelled') return fail(res, 400, 'Hanya order berstatus cancelled yang bisa dihapus');
  await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
  res.json({ message: 'Order berhasil dihapus' });
}));

/* ---------- Root, 404, error ---------- */
router.get('/', (req, res) => res.json({
  name: 'REST API Sistem Toko Online',
  endpoints: ['/auth', '/users', '/users/:id/profile', '/categories', '/products', '/orders', '/reviews'],
}));

app.use(router);
app.use((req, res) => fail(res, 404, 'Endpoint tidak ditemukan'));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON tidak valid');
  if (err.code === '23503') {
    return /still referenced/.test(err.detail || '')
      ? fail(res, 409, 'Data masih dipakai oleh data lain, tidak bisa dihapus')
      : fail(res, 400, 'Data referensi (foreign key) tidak ditemukan');
  }
  if (err.code === '23505') return fail(res, 409, 'Data sudah ada (duplikat), mis. username/email sudah dipakai atau review ganda');
  if (['22P02', '22003', '22001', '23514', '23502'].includes(err.code)) return fail(res, 400, 'Format atau nilai input tidak valid');
  console.error(err);
  fail(res, 500, 'Terjadi kesalahan pada server');
});

module.exports = app;
