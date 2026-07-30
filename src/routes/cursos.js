const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar todos os cursos (qualquer logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM turmas t WHERE t.curso_id = c.id) AS total_turmas
       FROM cursos c
       ORDER BY c.nome ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar cursos' });
  }
});

// Ver um curso especifico
router.get('/:id', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM cursos WHERE id = $1', [req.params.id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Curso nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar curso' });
  }
});

// Criar curso (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, descricao } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'O nome do curso e obrigatorio' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO cursos (nome, descricao, criado_por)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [nome, descricao || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar curso' });
  }
});

// Atualizar curso (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome, descricao, ativo } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE cursos SET
        nome = COALESCE($1, nome),
        descricao = COALESCE($2, descricao),
        ativo = COALESCE($3, ativo)
       WHERE id = $4
       RETURNING *`,
      [nome, descricao, ativo, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Curso nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar curso' });
  }
});

// Remover curso (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM cursos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover curso' });
  }
});

module.exports = router;