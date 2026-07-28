const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar todos os estudos biblicos (qualquer logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT e.*, u.nome AS criado_por_nome
       FROM estudos_biblicos e
       LEFT JOIN usuarios u ON u.id = e.criado_por
       ORDER BY e.criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estudos biblicos' });
  }
});

// Ver um estudo especifico (qualquer logado)
router.get('/:id', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT e.*, u.nome AS criado_por_nome
       FROM estudos_biblicos e
       LEFT JOIN usuarios u ON u.id = e.criado_por
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estudo nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estudo' });
  }
});

// Criar estudo biblico (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, conteudo, categoria, autor } = req.body;
  if (!titulo || !conteudo) {
    return res.status(400).json({ erro: 'Titulo e conteudo sao obrigatorios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO estudos_biblicos (titulo, descricao, conteudo, categoria, autor, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [titulo, descricao || null, conteudo, categoria || null, autor || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar estudo biblico' });
  }
});

// Atualizar estudo biblico (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, conteudo, categoria, autor } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE estudos_biblicos SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        conteudo = COALESCE($3, conteudo),
        categoria = COALESCE($4, categoria),
        autor = COALESCE($5, autor)
       WHERE id = $6
       RETURNING *`,
      [titulo, descricao, conteudo, categoria, autor, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Estudo nao encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar estudo' });
  }
});

// Remover estudo biblico (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM estudos_biblicos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover estudo' });
  }
});

module.exports = router;