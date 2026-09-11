const { TEST_DATABASE_URL } = require('./test-db');

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-only-secret-do-not-use-elsewhere-32chars';
