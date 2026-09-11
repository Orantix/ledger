const { Client } = require('pg');
const { execSync } = require('child_process');
const { ADMIN_URL, TEST_DB_NAME, TEST_DATABASE_URL } = require('./test-db');

module.exports = async function globalSetup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB_NAME]);
    if (rowCount === 0) {
      await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    }
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    cwd: __dirname + '/..',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'inherit',
  });
};
