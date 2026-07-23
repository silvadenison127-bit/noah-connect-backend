const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar ministérios com líder e contagem de membros
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT m.*, u.nome AS lider_nome,
              (SELECT COUNT(*) FROM membros_ministerio mm WHERE mm.ministerio_id = m.id) AS total_membros
       FROM ministerios m
       LEFT JOIN usuarios u ON u.id = m.lider_id
       ORDER BY m.nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar ministérios' });
  }
});

// Criar ministério (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, descricao } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'Nome do ministério é obrigatório' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO ministerios (nome, lider_id, descricao)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nome, lider_id || null, descricao || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar ministério' });
  }
});

// Atualizar ministério (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, descricao } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE ministerios SET
        nome = COALESCE($1, nome),
        lider_id = COALESCE($2, lider_id),
        descricao = COALESCE($3, descricao)
       WHERE id = $4 RETURNING *`,
      [nome, lider_id, descricao, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Ministério não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar ministério' });
  }
});

// Remover ministério (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM ministerios WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover ministério' });
  }
});

// Listar membros vinculados + disponíveis
router.get('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  try {
    const vinculados = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM membros_ministerio mm
       JOIN usuarios u ON u.id = mm.usuario_id
       WHERE mm.ministerio_id = $1
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    const disponiveis = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM usuarios u
       WHERE u.ativo = true
         AND u.id NOT IN (
           SELECT usuario_id FROM membros_ministerio WHERE ministerio_id = $1
         )
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    res.json({ vinculados: vinculados.rows, disponiveis: disponiveis.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros do ministério' });
  }
});

// Vincular membro (admin)
router.post('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  const { usuario_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO membros_ministerio (ministerio_id, usuario_id)
       VALUES ($1, $2)
       ON CONFLICT (ministerio_id, usuario_id) DO NOTHING`,
      [req.params.id, usuario_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao vincular membro' });
  }
});

// Desvincular membro (admin)
router.delete('/:id/membros/:usuarioId', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM membros_ministerio WHERE ministerio_id = $1 AND usuario_id = $2`,
      [req.params.id, req.params.usuarioId]
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desvincular membro' });
  }
});

module.exports = router;
