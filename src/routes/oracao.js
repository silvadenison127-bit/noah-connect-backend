const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Criar pedido de oração (membro logado)
router.post('/', autenticar, async (req, res) => {
  const { titulo, pedido, anonimo, nome_solicitante } = req.body;
  if (!pedido) {
    return res.status(400).json({ erro: 'O texto do pedido é obrigatório' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO pedidos_oracao (usuario_id, nome_solicitante, anonimo, titulo, pedido)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.usuario.id,
        anonimo ? null : (nome_solicitante || req.usuario.nome),
        !!anonimo,
        titulo || null,
        pedido
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar pedido de oração' });
  }
});

// Ver meus próprios pedidos
router.get('/meus', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM pedidos_oracao WHERE usuario_id = $1 ORDER BY criado_em DESC`,
      [req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// Listar todos os pedidos (admin/liderança)
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM pedidos_oracao ORDER BY criado_em DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// Atualizar status do pedido (admin/liderança)
router.put('/:id/status', autenticar, somenteAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['em_oracao', 'respondido', 'encerrado'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido' });
  }
  try {
    const resultado = await pool.query(
      `UPDATE pedidos_oracao SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

// Responder pedido com uma mensagem (admin/liderança)
router.put('/:id/responder', autenticar, somenteAdmin, async (req, res) => {
  const { resposta } = req.body;
  if (!resposta || !resposta.trim()) {
    return res.status(400).json({ erro: 'A resposta não pode ser vazia' });
  }
  try {
    const resultado = await pool.query(
      `UPDATE pedidos_oracao SET
        resposta = $1,
        respondido_em = NOW(),
        status = 'respondido'
       WHERE id = $2
       RETURNING *`,
      [resposta, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao responder pedido' });
  }
});

module.exports = router;
