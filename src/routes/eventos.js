const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

// Listar próximos eventos (qualquer membro logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM eventos
       WHERE data_inicio >= NOW() - INTERVAL '1 day'
       ORDER BY data_inicio ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar eventos' });
  }
});

// Criar evento (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, tipo, data_inicio, data_fim, local } = req.body;

  if (!titulo || !data_inicio) {
    return res.status(400).json({ erro: 'Título e data de início são obrigatórios' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO eventos (titulo, descricao, tipo, data_inicio, data_fim, local, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [titulo, descricao, tipo || 'evento', data_inicio, data_fim || null, local, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar evento' });
  }
});

// Atualizar evento (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, tipo, data_inicio, data_fim, local } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE eventos SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        tipo = COALESCE($3, tipo),
        data_inicio = COALESCE($4, data_inicio),
        data_fim = COALESCE($5, data_fim),
        local = COALESCE($6, local)
       WHERE id = $7 RETURNING *`,
      [titulo, descricao, tipo, data_inicio, data_fim, local, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Evento não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar evento' });
  }
});

// Remover evento (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM eventos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover evento' });
  }
});

module.exports = router;
