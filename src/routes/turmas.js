const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar turmas (opcionalmente filtradas por curso_id via query string)
router.get('/', autenticar, async (req, res) => {
  const { curso_id } = req.query;
  try {
    const params = [];
    let query = `
      SELECT t.*, c.nome AS curso_nome,
             (SELECT COUNT(*) FROM inscricoes_cursos ic WHERE ic.turma_id = t.id) AS total_inscritos
      FROM turmas t
      LEFT JOIN cursos c ON c.id = t.curso_id
    `;
    if (curso_id) {
      params.push(curso_id);
      query += ` WHERE t.curso_id = $1`;
    }
    query += ` ORDER BY t.data_inicio DESC NULLS LAST, t.criado_em DESC`;

    const resultado = await pool.query(query, params);
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar turmas' });
  }
});

// Ver uma turma especifica
router.get('/:id', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT t.*, c.nome AS curso_nome
       FROM turmas t
       LEFT JOIN cursos c ON c.id = t.curso_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Turma nao encontrada' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar turma' });
  }
});

// Criar turma (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { curso_id, nome, professor, data_inicio, data_fim, dias_semana, horario, local, max_alunos, status } = req.body;
  if (!curso_id || !nome) {
    return res.status(400).json({ erro: 'curso_id e nome sao obrigatorios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO turmas (curso_id, nome, professor, data_inicio, data_fim, dias_semana, horario, local, max_alunos, status, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [curso_id, nome, professor || null, data_inicio || null, data_fim || null, dias_semana || null, horario || null, local || null, max_alunos || null, status || 'planejada', req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar turma' });
  }
});

// Atualizar turma (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, professor, data_inicio, data_fim, dias_semana, horario, local, max_alunos, status } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE turmas SET
        nome = COALESCE($1, nome),
        professor = COALESCE($2, professor),
        data_inicio = COALESCE($3, data_inicio),
        data_fim = COALESCE($4, data_fim),
        dias_semana = COALESCE($5, dias_semana),
        horario = COALESCE($6, horario),
        local = COALESCE($7, local),
        max_alunos = COALESCE($8, max_alunos),
        status = COALESCE($9, status)
       WHERE id = $10
       RETURNING *`,
      [nome, professor, data_inicio, data_fim, dias_semana, horario, local, max_alunos, status, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Turma nao encontrada' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar turma' });
  }
});

// Remover turma (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM turmas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover turma' });
  }
});

module.exports = router;