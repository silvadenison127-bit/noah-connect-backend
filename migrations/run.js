require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '001_schema_inicial.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('✅ Migration executada com sucesso! Tabelas criadas.');
  } catch (err) {
    console.error('❌ Erro ao rodar migration:', err.message);
  } finally {
    await pool.end();
  }
}

run();
