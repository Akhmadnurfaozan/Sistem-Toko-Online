// Sumber tunggal skenario pengujian -> dipakai run-tests.js (tes otomatis), build-docs.js (README + koleksi Thunder Client)
// {{var}} pada path/body diganti saat runtime. body boleh fungsi (v) => objek.
const U = '{{rnd}}';
const noHash = (r) => (JSON.stringify(r.json).includes('password_hash') ? 'password_hash bocor di response' : null);
const stockIs = (n) => (r) => (r.json?.data?.stock === n ? null : `stok harus ${n}, didapat ${r.json?.data?.stock}`);

const S = (ep, name, method, path, expect, o = {}) => ({ ep, name, method, path, expect, ...o });

module.exports = [
  S('GET /', 'Health check', 'GET', '/', 200, { desc: 'Informasi API' }),
  S('GET /unknown', 'Endpoint tidak ada', 'GET', '/tidak-ada', 404, { desc: 'Endpoint yang tidak terdaftar' }),
  S('POST /users (JSON rusak)', 'JSON tidak valid', 'POST', '/auth/register', 400, { raw: '{rusak', desc: 'Body JSON tidak valid' }),

  // ---- AUTH
  S('POST /auth/register', 'Register user baru', 'POST', '/auth/register', 201, {
    desc: 'Mendaftarkan user baru (role selalu customer, password di-hash bcrypt)',
    body: { username: `tester_${U}`, email: `tester_${U}@example.com`, password: 'Passw0rd123' }, save: { userId: 'data.id' }, check: noHash }),
  S('POST /auth/register', 'Register duplikat', 'POST', '/auth/register', 409, { body: { username: `tester_${U}`, email: `tester_${U}@example.com`, password: 'Passw0rd123' } }),
  S('POST /auth/register', 'Register input tidak valid', 'POST', '/auth/register', 400, { body: { username: 'a', email: 'bukan-email', password: '123' } }),
  S('POST /auth/login', 'Login berhasil', 'POST', '/auth/login', 200, {
    desc: 'Login dengan email dan password', body: { email: `tester_${U}@example.com`, password: 'Passw0rd123' }, check: noHash }),
  S('POST /auth/login', 'Login password salah', 'POST', '/auth/login', 401, { body: { email: `tester_${U}@example.com`, password: 'SalahBanget1' } }),

  // ---- USERS
  S('GET /users', 'Daftar user', 'GET', '/users', 200, { desc: 'Mengambil semua user (tanpa password)', check: noHash }),
  S('GET /users/:id', 'Detail user', 'GET', '/users/{{userId}}', 200, { desc: 'Mengambil satu user berdasarkan ID' }),
  S('GET /users/:id', 'User tidak ditemukan', 'GET', '/users/999999', 404),
  S('GET /users/:id', 'ID bukan angka', 'GET', '/users/abc', 400),
  S('PUT /users/:id', 'Ganti data user', 'PUT', '/users/{{userId}}', 200, {
    desc: 'Mengganti username dan email (keduanya wajib)', body: { username: `tester_${U}`, email: `tester_${U}@example.com` } }),
  S('PUT /users/:id', 'PUT tanpa email', 'PUT', '/users/{{userId}}', 400, { body: { username: `tester_${U}` } }),
  S('PATCH /users/:id', 'Ubah password', 'PATCH', '/users/{{userId}}', 200, {
    desc: 'Mengubah sebagian data user (username, email, password)', body: { password: 'NewPassw0rd9' }, check: noHash }),
  S('PATCH /users/:id', 'PATCH kosong', 'PATCH', '/users/{{userId}}', 400, { body: {} }),

  // ---- PROFIL
  S('PUT /users/:id/profile', 'Buat profil', 'PUT', '/users/{{userId}}/profile', 201, {
    desc: 'Membuat profil user (201) atau mengganti profil yang sudah ada (200) - relasi 1:1',
    body: { full_name: 'Tester Uji', city: 'Kebumen', birth_date: '2000-01-31' } }),
  S('PUT /users/:id/profile', 'Ganti profil', 'PUT', '/users/{{userId}}/profile', 200, { body: { full_name: 'Tester Uji Baru', city: 'Kebumen' } }),
  S('PUT /users/:id/profile', 'Profil tanpa full_name', 'PUT', '/users/{{userId}}/profile', 400, { body: { city: 'Kebumen' } }),
  S('PUT /users/:id/profile', 'Profil user tidak ada', 'PUT', '/users/999999/profile', 404, { body: { full_name: 'X' } }),
  S('GET /users/:id/profile', 'Lihat profil', 'GET', '/users/{{userId}}/profile', 200, { desc: 'Mengambil profil user' }),
  S('GET /users/:id/profile', 'Profil tidak ditemukan', 'GET', '/users/999999/profile', 404),
  S('PATCH /users/:id/profile', 'Ubah sebagian profil', 'PATCH', '/users/{{userId}}/profile', 200, { desc: 'Mengubah sebagian data profil', body: { phone: '081100001111' } }),

  // ---- CATEGORIES
  S('POST /categories', 'Tambah kategori', 'POST', '/categories', 201, {
    desc: 'Menambah kategori', body: { name: `Kategori Uji ${U}`, description: 'Dibuat oleh pengujian otomatis' }, save: { categoryId: 'data.id' } }),
  S('POST /categories', 'Kategori duplikat', 'POST', '/categories', 409, { body: { name: `Kategori Uji ${U}` } }),
  S('POST /categories', 'Kategori tanpa nama', 'POST', '/categories', 400, { body: {} }),
  S('GET /categories', 'Daftar kategori', 'GET', '/categories', 200, { desc: 'Mengambil semua kategori' }),
  S('GET /categories/:id', 'Detail kategori', 'GET', '/categories/{{categoryId}}', 200, { desc: 'Mengambil satu kategori' }),
  S('GET /categories/:id', 'Kategori tidak ditemukan', 'GET', '/categories/999999', 404),
  S('PUT /categories/:id', 'Ganti kategori', 'PUT', '/categories/{{categoryId}}', 200, { desc: 'Mengganti seluruh data kategori', body: { name: `Kategori Uji ${U}`, description: 'Diganti' } }),
  S('PATCH /categories/:id', 'Ubah sebagian kategori', 'PATCH', '/categories/{{categoryId}}', 200, { desc: 'Mengubah sebagian data kategori', body: { description: 'Deskripsi baru' } }),

  // ---- PRODUCTS (CRUD lengkap)
  S('POST /products', 'Tambah produk', 'POST', '/products', 201, {
    desc: 'Menambah produk (CRUD lengkap)', body: (v) => ({ category_id: v.categoryId, name: `Produk Uji ${U}`, description: 'Barang uji', price: 150000, stock: 10 }), save: { productId: 'data.id' } }),
  S('POST /products', 'Harga negatif', 'POST', '/products', 400, { body: (v) => ({ category_id: v.categoryId, name: 'X', price: -1 }) }),
  S('POST /products', 'Kategori tidak ada', 'POST', '/products', 400, { body: { category_id: 999999, name: 'X', price: 1000 } }),
  S('GET /products', 'Daftar produk', 'GET', '/products', 200, { desc: 'Mengambil semua produk. Query opsional: q (cari nama/deskripsi), category_id' }),
  S('GET /products', 'Cari produk (q)', 'GET', '/products?q=Headphone', 200),
  S('GET /products', 'Filter kategori', 'GET', '/products?category_id=1', 200),
  S('GET /products/:id', 'Detail produk', 'GET', '/products/{{productId}}', 200, { desc: 'Detail produk beserta avg_rating dan review_count', check: stockIs(10) }),
  S('GET /products/:id', 'Produk tidak ditemukan', 'GET', '/products/999999', 404),
  S('PUT /products/:id', 'Ganti produk', 'PUT', '/products/{{productId}}', 200, {
    desc: 'Mengganti seluruh data produk', body: (v) => ({ category_id: v.categoryId, name: `Produk Uji ${U}`, description: 'Barang uji', price: 160000, stock: 10 }) }),
  S('PATCH /products/:id', 'Ubah stok', 'PATCH', '/products/{{productId}}', 200, { desc: 'Mengubah sebagian data produk', body: { stock: 20 }, check: stockIs(20) }),

  // ---- ORDERS
  S('POST /orders', 'Buat order', 'POST', '/orders', 201, {
    desc: 'Membuat order: total dihitung server, stok produk otomatis berkurang (transaksi database)',
    body: (v) => ({ user_id: v.userId, shipping_address: 'Jl. Uji No. 1, Kebumen', items: [{ product_id: v.productId, quantity: 2 }] }),
    save: { orderId: 'data.id' }, check: (r) => (r.json.data.total_amount === 320000 ? null : `total harus 320000, didapat ${r.json.data.total_amount}`) }),
  S('GET /products/:id', 'Stok berkurang setelah order', 'GET', '/products/{{productId}}', 200, { check: stockIs(18) }),
  S('POST /orders', 'Stok tidak cukup', 'POST', '/orders', 400, { body: (v) => ({ user_id: v.userId, shipping_address: 'x', items: [{ product_id: v.productId, quantity: 999 }] }) }),
  S('POST /orders', 'Items kosong', 'POST', '/orders', 400, { body: (v) => ({ user_id: v.userId, shipping_address: 'x', items: [] }) }),
  S('POST /orders', 'User tidak ada', 'POST', '/orders', 400, { body: (v) => ({ user_id: 999999, shipping_address: 'x', items: [{ product_id: v.productId, quantity: 1 }] }) }),
  S('GET /orders', 'Daftar order', 'GET', '/orders', 200, { desc: 'Mengambil semua order. Query opsional: user_id, status' }),
  S('GET /orders', 'Filter order per user', 'GET', '/orders?user_id={{userId}}', 200),
  S('GET /orders/:id', 'Detail order', 'GET', '/orders/{{orderId}}', 200, { desc: 'Detail order beserta item' }),
  S('GET /orders/:id', 'Order tidak ditemukan', 'GET', '/orders/999999', 404),
  S('PATCH /orders/:id', 'Ubah alamat order', 'PATCH', '/orders/{{orderId}}', 200, { desc: 'Mengubah alamat pengiriman (hanya saat pending)', body: { shipping_address: 'Jl. Baru No. 2, Kebumen' } }),
  S('PATCH /orders/:id/status', 'Bayar order', 'PATCH', '/orders/{{orderId}}/status', 200, {
    desc: 'Mengubah status: pending->paid|cancelled, paid->shipped|cancelled, shipped->completed. Cancelled mengembalikan stok', body: { status: 'paid' } }),
  S('PATCH /orders/:id/status', 'Transisi status tidak valid', 'PATCH', '/orders/{{orderId}}/status', 400, { body: { status: 'pending' } }),
  S('PATCH /orders/:id/status', 'Nilai status tidak valid', 'PATCH', '/orders/{{orderId}}/status', 400, { body: { status: 'terbang' } }),
  S('PATCH /orders/:id', 'Ubah alamat setelah paid', 'PATCH', '/orders/{{orderId}}', 400, { body: { shipping_address: 'x' } }),

  // ---- REVIEWS
  S('POST /reviews', 'Tambah review', 'POST', '/reviews', 201, {
    desc: 'Menambah review produk (rating 1-5, satu user satu review per produk)',
    body: (v) => ({ user_id: v.userId, product_id: v.productId, rating: 5, comment: 'Bagus' }), save: { reviewId: 'data.id' } }),
  S('POST /reviews', 'Review duplikat', 'POST', '/reviews', 409, { body: (v) => ({ user_id: v.userId, product_id: v.productId, rating: 4 }) }),
  S('POST /reviews', 'Rating di luar 1-5', 'POST', '/reviews', 400, { body: (v) => ({ user_id: v.userId, product_id: v.productId, rating: 6 }) }),
  S('GET /reviews', 'Daftar review', 'GET', '/reviews?product_id={{productId}}', 200, { desc: 'Mengambil review. Query opsional: product_id, user_id' }),
  S('GET /reviews/:id', 'Detail review', 'GET', '/reviews/{{reviewId}}', 200, { desc: 'Mengambil satu review' }),
  S('PUT /reviews/:id', 'Ganti review', 'PUT', '/reviews/{{reviewId}}', 200, {
    desc: 'Mengganti seluruh data review', body: (v) => ({ user_id: v.userId, product_id: v.productId, rating: 4, comment: 'Oke' }) }),
  S('PATCH /reviews/:id', 'Ubah rating', 'PATCH', '/reviews/{{reviewId}}', 200, { desc: 'Mengubah sebagian data review', body: { rating: 3 } }),
  S('GET /products/:id', 'avg_rating terhitung', 'GET', '/products/{{productId}}', 200, { check: (r) => (r.json.data.avg_rating === 3 ? null : `avg_rating harus 3, didapat ${r.json.data.avg_rating}`) }),
  S('DELETE /reviews/:id', 'Hapus review', 'DELETE', '/reviews/{{reviewId}}', 200, { desc: 'Menghapus review' }),
  S('DELETE /reviews/:id', 'Hapus review lagi', 'DELETE', '/reviews/{{reviewId}}', 404),

  // ---- DELETE + integritas foreign key (urutan pembersihan data uji)
  S('DELETE /categories/:id', 'Kategori masih dipakai produk', 'DELETE', '/categories/{{categoryId}}', 409),
  S('DELETE /users/:id', 'User masih punya order', 'DELETE', '/users/{{userId}}', 409),
  S('DELETE /orders/:id', 'Hapus order belum cancelled', 'DELETE', '/orders/{{orderId}}', 400),
  S('PATCH /orders/:id/status', 'Batalkan order (stok kembali)', 'PATCH', '/orders/{{orderId}}/status', 200, { body: { status: 'cancelled' } }),
  S('GET /products/:id', 'Stok kembali setelah cancel', 'GET', '/products/{{productId}}', 200, { check: stockIs(20) }),
  S('DELETE /orders/:id', 'Hapus order', 'DELETE', '/orders/{{orderId}}', 200, { desc: 'Menghapus order (hanya yang berstatus cancelled)' }),
  S('DELETE /products/:id', 'Hapus produk', 'DELETE', '/products/{{productId}}', 200, { desc: 'Menghapus produk' }),
  S('DELETE /products/:id', 'Hapus produk lagi', 'DELETE', '/products/{{productId}}', 404),
  S('DELETE /categories/:id', 'Hapus kategori', 'DELETE', '/categories/{{categoryId}}', 200, { desc: 'Menghapus kategori (ditolak 409 jika masih dipakai produk)' }),
  S('DELETE /users/:id/profile', 'Hapus profil', 'DELETE', '/users/{{userId}}/profile', 200, { desc: 'Menghapus profil user' }),
  S('DELETE /users/:id/profile', 'Hapus profil lagi', 'DELETE', '/users/{{userId}}/profile', 404),
  S('DELETE /users/:id', 'Hapus user', 'DELETE', '/users/{{userId}}', 200, { desc: 'Menghapus user (ditolak 409 jika masih punya order)' }),
];
