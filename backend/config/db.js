const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'ReconocimientoFacial',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});
pool.on('error', error => console.error('Conexión PostgreSQL:', error.code || error.name));
module.exports = { pool, query: (text, params) => pool.query(text, params) };
