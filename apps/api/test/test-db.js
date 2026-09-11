// Plain CommonJS (not TS) so it can run as jest's globalSetup, which Jest
// loads directly with Node — outside the ts-jest transform pipeline.
const { Client } = require('pg');

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgresql://ledger:ledger@localhost:5432/postgres';
const TEST_DB_NAME = 'orantix_ledger_test';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? `postgresql://ledger:ledger@localhost:5432/${TEST_DB_NAME}?schema=public`;

module.exports = { ADMIN_URL, TEST_DB_NAME, TEST_DATABASE_URL };
