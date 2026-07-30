const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Listar inscricoes (filtros opcionais: turma_id, status, busca por nome)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  const { turma_id, status, busca } = req.query;
  try {
    const condicoes = [];
    const params = [];

    if (turma_id) {
      params.push(turma_id);
      condicoes.push(`ic.turma_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      condicoes.push(`ic.status = $${params.length}`);
    }
    if (busca) {
      params.push(`%${busca}%`);
      condicoes.push(`ic.nome_completo ILIKE $${params.length}`);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';

    const resultado = await pool.query(
      `SELECT ic.*, t.nome AS turma_nome, c.nome AS curso_nome
       FROM inscricoes_cursos ic
       LEFT JOIN turmas t ON t.id = ic.turma_id
       LEFT JOIN cursos c ON c.id = t.curso_id
       ${where}
       ORDER BY ic.criado_em DESC`,
      params
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar inscricoes' });
  }
});

// Ver uma inscricao especifica
router.get('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT ic.*, t.nome AS turma_nome, c.nome AS curso_nome
       FROM inscricoes_cursos ic
       LEFT JOIN turmas t ON t.id = ic.turma_id
       LEFT JOIN cursos c ON c.id = t.curso_id
       WHERE ic.id = $1`,
      [req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Inscricao nao encontrada' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar inscricao' });
  }
});

// Criar inscricao (qualquer usuario logado pode se inscrever)
router.post('/', autenticar, async (req, res) => {
  const { turma_id, nome_completo, telefone, email, cpf, observacoes } = req.body;
  if (!turma_id || !nome_completo) {
    return res.status(400).json({ erro: 'turma_id e nome_completo sao obrigatorios' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO inscricoes_cursos (turma_id, usuario_id, nome_completo, telefone, email, cpf, observacoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [turma_id, req.usuario.id, nome_completo, telefone || null, email || null, cpf || null, observacoes || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar inscricao' });
  }
});

// Atualizar status/dados da inscricao (admin)
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { nome_completo, telefone, email, cpf, status, observacoes } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE inscricoes_cursos SET
        nome_completo = COALESCE($1, nome_completo),
        telefone = COALESCE($2, telefone),
        email = COALESCE($3, email),
        cpf = COALESCE($4, cpf),
        status = COALESCE($5, status),
        observacoes = COALESCE($6, observacoes)
       WHERE id = $7
       RETURNING *`,
      [nome_completo, telefone, email, cpf, status, observacoes, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Inscricao nao encontrada' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar inscricao' });
  }
});

// Remover inscricao (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM inscricoes_cursos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover inscricao' });
  }
});

module.exports = router;