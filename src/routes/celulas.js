const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar células com líder e contagem de membros
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.*, u.nome AS lider_nome,
              (SELECT COUNT(*) FROM membros_celula mc WHERE mc.celula_id = c.id) AS total_membros
       FROM celulas c
       LEFT JOIN usuarios u ON u.id = c.lider_id
       ORDER BY c.nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar células' });
  }
});

// Criar célula (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, dia_semana, horario, endereco } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'Nome da célula é obrigatório' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO celulas (nome, lider_id, dia_semana, horario, endereco)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [nome, lider_id || null, dia_semana || null, horario || null, endereco || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar célula' });
  }
});

// Atualizar célula (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, lider_id, dia_semana, horario, endereco } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE celulas SET
        nome = COALESCE($1, nome),
        lider_id = COALESCE($2, lider_id),
        dia_semana = COALESCE($3, dia_semana),
        horario = COALESCE($4, horario),
        endereco = COALESCE($5, endereco)
       WHERE id = $6 RETURNING *`,
      [nome, lider_id, dia_semana, horario, endereco, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Célula não encontrada' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar célula' });
  }
});

// Remover célula (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM celulas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover célula' });
  }
});

// Listar membros vinculados a uma célula + membros disponíveis para vincular
router.get('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  try {
    const vinculados = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM membros_celula mc
       JOIN usuarios u ON u.id = mc.usuario_id
       WHERE mc.celula_id = $1
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    const disponiveis = await pool.query(
      `SELECT u.id, u.nome, u.email
       FROM usuarios u
       WHERE u.ativo = true
         AND u.id NOT IN (
           SELECT usuario_id FROM membros_celula WHERE celula_id = $1
         )
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    res.json({ vinculados: vinculados.rows, disponiveis: disponiveis.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar membros da célula' });
  }
});

// Vincular membro a uma célula (admin)
router.post('/:id/membros', autenticar, somenteAdmin, async (req, res) => {
  const { usuario_id } = req.body;
  try {
    await pool.query(
      `INSERT INTO membros_celula (celula_id, usuario_id)
       VALUES ($1, $2)
       ON CONFLICT (celula_id, usuario_id) DO NOTHING`,
      [req.params.id, usuario_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao vincular membro' });
  }
});

// Desvincular membro de uma célula (admin)
router.delete('/:id/membros/:usuarioId', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM membros_celula WHERE celula_id = $1 AND usuario_id = $2`,
      [req.params.id, req.params.usuarioId]
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao desvincular membro' });
  }
});

module.exports = router;
