const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Buscar dados da igreja (qualquer logado)
router.get('/igreja', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(`SELECT * FROM configuracoes_igreja ORDER BY id LIMIT 1`);
    res.json(resultado.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar dados da igreja' });
  }
});

// Atualizar dados da igreja (admin)
router.put('/igreja', autenticar, somenteAdmin, async (req, res) => {
  const { nome, endereco, telefone, email } = req.body;
  try {
    const existente = await pool.query(`SELECT id FROM configuracoes_igreja ORDER BY id LIMIT 1`);
    let resultado;
    if (existente.rows.length === 0) {
      resultado = await pool.query(
        `INSERT INTO configuracoes_igreja (nome, endereco, telefone, email)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [nome, endereco, telefone, email]
      );
    } else {
      resultado = await pool.query(
        `UPDATE configuracoes_igreja SET
          nome = COALESCE($1, nome),
          endereco = COALESCE($2, endereco),
          telefone = COALESCE($3, telefone),
          email = COALESCE($4, email),
          atualizado_em = NOW()
         WHERE id = $5 RETURNING *`,
        [nome, endereco, telefone, email, existente.rows[0].id]
      );
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar dados da igreja' });
  }
});

// Trocar a própria senha (qualquer logado)
router.put('/senha', autenticar, async (req, res) => {
  const { senha_atual, senha_nova } = req.body;
  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  }
  if (senha_nova.length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }
  try {
    const usuario = await pool.query(`SELECT senha_hash FROM usuarios WHERE id = $1`, [req.usuario.id]);
    if (usuario.rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    const senhaCorreta = await bcrypt.compare(senha_atual, usuario.rows[0].senha_hash);
    if (!senhaCorreta) {
      return res.status(401).json({ erro: 'Senha atual incorreta.' });
    }
    const novoHash = await bcrypt.hash(senha_nova, 10);
    await pool.query(
      `UPDATE usuarios SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`,
      [novoHash, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao trocar senha' });
  }
});

// Listar admins (admin)
router.get('/admins', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, tipo FROM usuarios WHERE tipo = 'admin' ORDER BY nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar administradores' });
  }
});

// Promover membro a admin (admin)
router.put('/admins/:id/promover', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET tipo = 'admin', atualizado_em = NOW() WHERE id = $1
       RETURNING id, nome, email, tipo`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao promover usuário' });
  }
});

// Remover privilégio de admin (volta a ser membro)
router.put('/admins/:id/rebaixar', autenticar, somenteAdmin, async (req, res) => {
  if (parseInt(req.params.id, 10) === req.usuario.id) {
    return res.status(400).json({ erro: 'Você não pode remover seu próprio acesso de admin.' });
  }
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET tipo = 'membro', atualizado_em = NOW() WHERE id = $1
       RETURNING id, nome, email, tipo`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao rebaixar usuário' });
  }
});

module.exports = router;
