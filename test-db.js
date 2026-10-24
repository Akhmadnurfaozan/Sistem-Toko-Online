const pool = require('./db');

async function testDatabase() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('BERHASIL TERHUBUNG:', result.rows[0]);
  } catch (error) {
    console.error('KONEKSI GAGAL');
    console.error('Error lengkap:', error);
  } finally {
    await pool.end();
  }
}

testDatabase();