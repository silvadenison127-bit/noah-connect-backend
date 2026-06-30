// Cria o primeiro usuário administrador do sistema.
// Uso: node migrations/criar_admin.js "Seu Nome" seuemail@igrejanoah.com suaSenha123

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

async function criarAdmin() {
  const [nome, email, senha] = process.argv.slice(2);

  if (!nome || !email || !senha) {
    console.log('Uso: node migrations/criar_admin.js "Nome Completo" email@exemplo.com senha123');
    process.exit(1);
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE SET senha_hash = $3, tipo = 'admin'
       RETURNING id, nome, email, tipo`,
      [nome, email, senhaHash]
    );
    console.log('✅ Administrador criado/atualizado com sucesso:', resultado.rows[0]);
  } catch (err) {
    console.error('❌ Erro ao criar administrador:', err.message);
  } finally {
    await pool.end();
  }
}

criarAdmin();
