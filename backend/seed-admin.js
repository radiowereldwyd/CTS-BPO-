// One-time script: creates or resets the admin user with a known password.
// Run with:  node seed-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const EMAIL = 'admin@ctsbpo.com';
const PASSWORD = 'Admin1234!';
const NAME = 'CTS Admin';
const ROLE = 'admin';

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL not set in .env');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    console.log('🔐 Generated fresh bcrypt hash for password.');

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash,
                     is_active = true,
                     name = EXCLUDED.name,
                     role = EXCLUDED.role
       RETURNING id, email, role;`,
      [NAME, EMAIL, hash, ROLE]
    );

    console.log('✅ Admin user ready:', result.rows[0]);
    console.log('');
    console.log('👉 Login with:');
    console.log('   Email:    ' + EMAIL);
    console.log('   Password: ' + PASSWORD);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
})();
