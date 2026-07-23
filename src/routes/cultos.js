const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar cultos (qualquer membro logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM eventos WHERE tipo = 'culto' ORDER BY data_inicio DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar cultos' });
  }
});

// Criar culto (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, data_inicio, data_fim, local } = req.body;
  if (!titulo || !data_inicio) {
    return res.status(400).json({ erro: 'Título e data são obrigatórios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO eventos (titulo, descricao, tipo, data_inicio, data_fim, local, criado_por)
       VALUES ($1, $2, 'culto', $3, $4, $5, $6)
       RETURNING *`,
      [titulo, descricao || null, data_inicio, data_fim || null, local || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar culto' });
  }
});

// Atualizar culto (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, data_inicio, data_fim, local } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE eventos SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        data_inicio = COALESCE($3, data_inicio),
        data_fim = COALESCE($4, data_fim),
        local = COALESCE($5, local)
       WHERE id = $6 AND tipo = 'culto'
       RETURNING *`,
      [titulo, descricao, data_inicio, data_fim, local, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Culto não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar culto' });
  }
});

// Remover culto (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM eventos WHERE id = $1 AND tipo = 'culto'`, [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover culto' });
  }
});

// Listar presenças de um culto (admin)
router.get('/:id/presencas', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT u.id AS usuario_id, u.nome, u.email,
              COALESCE(p.presente, false) AS presente
       FROM usuarios u
       LEFT JOIN presencas_culto p ON p.usuario_id = u.id AND p.evento_id = $1
       WHERE u.ativo = true
       ORDER BY u.nome ASC`,
      [req.params.id]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar presenças' });
  }
});

// Marcar/desmarcar presença de um membro em um culto (admin)
router.post('/:id/presencas', autenticar, somenteAdmin, async (req, res) => {
  const { usuario_id, presente } = req.body;
  try {
    const resultado = await pool.query(
      `INSERT INTO presencas_culto (evento_id, usuario_id, presente)
       VALUES ($1, $2, $3)
       ON CONFLICT (evento_id, usuario_id)
       DO UPDATE SET presente = $3
       RETURNING *`,
      [req.params.id, usuario_id, presente]
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar presença' });
  }
});

module.exports = router;
