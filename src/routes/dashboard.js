const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const [membros, eventosMes, pedidos] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM usuarios WHERE ativo = true`),
      pool.query(`SELECT COUNT(*) FROM eventos WHERE date_trunc('month', data_inicio) = date_trunc('month', NOW())`),
      pool.query(`SELECT COUNT(*) FROM pedidos_oracao WHERE status = 'em_oracao'`)
    ]);

    res.json({
      membros_ativos: parseInt(membros.rows[0].count, 10),
      eventos_este_mes: parseInt(eventosMes.rows[0].count, 10),
      pedidos_em_oracao: parseInt(pedidos.rows[0].count, 10)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar estatísticas' });
  }
});

module.exports = router;
