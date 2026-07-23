const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

const CATEGORIAS = ['aluguel', 'contas', 'manutencao', 'eventos', 'missoes', 'material', 'salarios', 'outros'];

// Histórico completo (entradas + saídas juntas), ordenado por data
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
        d.id, 'entrada' AS movimento, d.tipo AS categoria, d.valor,
        d.forma_pagamento, d.observacao AS descricao, d.data_lancamento,
        u.nome AS membro_nome
       FROM dizimos_ofertas d
       LEFT JOIN usuarios u ON u.id = d.usuario_id

       UNION ALL

       SELECT
        e.id, 'saida' AS movimento, e.categoria, e.valor,
        e.forma_pagamento, e.descricao, e.data_lancamento,
        NULL AS membro_nome
       FROM despesas e

       ORDER BY data_lancamento DESC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar histórico financeiro' });
  }
});

// Resumo por categoria de despesa (mês atual) + totais gerais
router.get('/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const [entradas, saidas, porCategoria] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM dizimos_ofertas
         WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`
      ),
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
         WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)`
      ),
      pool.query(
        `SELECT categoria, COALESCE(SUM(valor), 0) AS total
         FROM despesas
         WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)
         GROUP BY categoria
         ORDER BY total DESC`
      ),
    ]);

    const totalEntradas = parseFloat(entradas.rows[0].total);
    const totalSaidas = parseFloat(saidas.rows[0].total);

    res.json({
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldo: totalEntradas - totalSaidas,
      por_categoria: porCategoria.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo financeiro' });
  }
});

// Criar despesa (admin)
router.post('/despesas', autenticar, somenteAdmin, async (req, res) => {
  const { categoria, descricao, valor, forma_pagamento, data_lancamento } = req.body;

  if (!categoria || !CATEGORIAS.includes(categoria)) {
    return res.status(400).json({ erro: 'Categoria inválida.' });
  }
  if (!valor || isNaN(valor) || Number(valor) <= 0) {
    return res.status(400).json({ erro: 'Informe um valor válido.' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO despesas (categoria, descricao, valor, forma_pagamento, data_lancamento, criado_por)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6)
       RETURNING *`,
      [categoria, descricao || null, valor, forma_pagamento || 'dinheiro', data_lancamento || null, req.usuario.id]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar despesa' });
  }
});

// Remover despesa (admin)
router.delete('/despesas/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM despesas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover despesa' });
  }
});

module.exports = router;
