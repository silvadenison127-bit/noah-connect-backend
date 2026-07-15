const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar todos os membros (admin)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, tipo, foto_url, membro_desde, ativo, status
       FROM usuarios ORDER BY nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros' });
  }
});

// Criar novo membro (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, email, telefone, tipo, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
  }
  try {
    const existente = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Já existe um usuário com esse email.' });
    }
    const senha_hash = await bcrypt.hash(senha, 10);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, tipo, status)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'membro'), 'aprovado')
       RETURNING id, nome, email, telefone, tipo, ativo, membro_desde, status`,
      [nome, email, senha_hash, telefone || null, tipo]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar membro' });
  }
});

// Ver perfil próprio
router.get('/perfil', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, tipo, foto_url, membro_desde
       FROM usuarios WHERE id = $1`,
      [req.usuario.id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Atualizar próprio perfil (foto, telefone)
router.put('/perfil', autenticar, async (req, res) => {
  const { foto_url, telefone } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET
        foto_url = COALESCE($1, foto_url),
        telefone = COALESCE($2, telefone),
        atualizado_em = NOW()
       WHERE id = $3
       RETURNING id, nome, email, telefone, tipo, foto_url`,
      [foto_url, telefone, req.usuario.id]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Listar membros aguardando aprovação (admin)
router.get('/pendentes', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nome, email, telefone, criado_em
       FROM usuarios WHERE status = 'pendente' ORDER BY criado_em ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pendentes' });
  }
});

// Aprovar membro (admin)
router.put('/:id/aprovar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET status = 'aprovado', atualizado_em = NOW()
       WHERE id = $1 RETURNING id, nome, email, status`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao aprovar membro' });
  }
});

// Rejeitar membro (admin)
router.put('/:id/rejeitar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET status = 'rejeitado', atualizado_em = NOW()
       WHERE id = $1 RETURNING id, nome, email, status`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao rejeitar membro' });
  }
});

// Atualizar membro (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, tipo, ativo } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE usuarios SET
        nome = COALESCE($1, nome),
        telefone = COALESCE($2, telefone),
        tipo = COALESCE($3, tipo),
        ativo = COALESCE($4, ativo),
        atualizado_em = NOW()
       WHERE id = $5
       RETURNING id, nome, email, telefone, tipo, ativo`,
      [nome, telefone, tipo, ativo, id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Membro não encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar membro' });
  }
});

// Remover membro (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover membro' });
  }
});

module.exports = router;
