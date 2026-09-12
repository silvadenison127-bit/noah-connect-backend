const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const {
  buscarDoacoesDoApp,
  confirmarDoacaoDoApp,
  cancelarDoacaoDoApp,
} = require('../services/doacoes.service');
const router = express.Router();

// Listar lançamentos (admin) - com filtro opcional por mês
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  const { mes, ano } = req.query;
  try {
    let query = `
      SELECT d.*, u.nome AS membro_nome
      FROM dizimos_ofertas d
      LEFT JOIN usuarios u ON u.id = d.usuario_id
    `;
    const params = [];

    if (mes && ano) {
      query += ` WHERE EXTRACT(MONTH FROM d.data_lancamento) = $1 AND EXTRACT(YEAR FROM d.data_lancamento) = $2`;
      params.push(mes, ano);
    }

    query += ` ORDER BY d.data_lancamento DESC, d.criado_em DESC`;

    const resultado = await pool.query(query, params);
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar lançamentos' });
  }
});

/**
 * Doações feitas pelo aplicativo (admin).
 *
 * Lista separada dos lançamentos manuais: `dizimos_ofertas` é o que a
 * tesouraria registra à mão, esta é a cobrança digital com ciclo de pagamento
 * próprio. Juntar as duas distorceria o controle financeiro.
 *
 * O aviso de indisponibilidade sobe no cabeçalho, nunca em silêncio.
 */
router.get('/app', autenticar, somenteAdmin, async (req, res) => {
  const { doacoes, aviso } = await buscarDoacoesDoApp();
  if (aviso) res.set('X-Aviso-Parcial', encodeURIComponent(aviso));
  res.json(doacoes);
});

// Confirmar recebimento de uma doação do aplicativo (admin)
router.put('/app/:id/confirmar', autenticar, somenteAdmin, async (req, res) => {
  const r = await confirmarDoacaoDoApp(req.params.id);
  if (r.erro) return res.status(r.status).json({ erro: r.erro });
  res.json(r.doacao);
});

// Cancelar uma doação do aplicativo (admin)
router.put('/app/:id/cancelar', autenticar, somenteAdmin, async (req, res) => {
  const r = await cancelarDoacaoDoApp(req.params.id);
  if (r.erro) return res.status(r.status).json({ erro: r.erro });
  res.json(r.doacao);
});

// Resumo (totais) - usado no card do Dashboard
router.get('/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
        COALESCE(SUM(valor) FILTER (WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS total_mes,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'dizimo' AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS dizimos_mes,
        COALESCE(SUM(valor) FILTER (WHERE tipo = 'oferta' AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS ofertas_mes
       FROM dizimos_ofertas`
    );
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo' });
  }
});

// Criar lançamento (admin)
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { usuario_id, tipo, valor, forma_pagamento, observacao, data_lancamento } = req.body;

  if (!valor || isNaN(valor) || Number(valor) <= 0) {
    return res.status(400).json({ erro: 'Informe um valor válido.' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO dizimos_ofertas (usuario_id, tipo, valor, forma_pagamento, observacao, data_lancamento, criado_por)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7)
       RETURNING *`,
      [
        usuario_id || null,
        tipo || 'dizimo',
        valor,
        forma_pagamento || 'dinheiro',
        observacao || null,
        data_lancamento || null,
        req.usuario.id
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar lançamento' });
  }
});

// Remover lançamento (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM dizimos_ofertas WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover lançamento' });
  }
});

module.exports = router;