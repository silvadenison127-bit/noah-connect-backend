@'
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

async function run() {
  const arquivos = fs
    .readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Migrations encontradas: ${arquivos.join(', ')}`);

  for (const arquivo of arquivos) {
    const sql = fs.readFileSync(path.join(__dirname, arquivo), 'utf8');
    try {
      await pool.query(sql);
      console.log(`OK: ${arquivo} executada com sucesso.`);
    } catch (err) {
      console.error(`ERRO ao rodar ${arquivo}: ${err.message}`);
      console.error('Interrompendo - corrija esta migration antes de continuar.');
      await pool.end();
      process.exit(1);
    }
  }

  console.log('Todas as migrations foram aplicadas.');
  await pool.end();
}

run();
'@ | Set-Content -Path "migrations/run.js" -Encoding UTF8