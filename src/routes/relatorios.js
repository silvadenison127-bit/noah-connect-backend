const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const router = express.Router();

// Resumo geral (admin)
router.get('/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const [membros, cultosMes, financeiroMes, celulas, ministerios] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM usuarios WHERE ativo = true`),
      pool.query(
        `SELECT COUNT(*) FROM eventos
         WHERE tipo = 'culto' AND date_trunc('month', data_inicio) = date_trunc('month', CURRENT_DATE)`
      ),
      pool.query(
        `SELECT
          COALESCE((SELECT SUM(valor) FROM dizimos_ofertas WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS entradas,
          COALESCE((SELECT SUM(valor) FROM despesas WHERE date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)), 0) AS saidas`
      ),
      pool.query(`SELECT COUNT(*) FROM celulas`),
      pool.query(`SELECT COUNT(*) FROM ministerios`),
    ]);

    const entradas = parseFloat(financeiroMes.rows[0].entradas);
    const saidas = parseFloat(financeiroMes.rows[0].saidas);

    res.json({
      membros_ativos: parseInt(membros.rows[0].count, 10),
      cultos_este_mes: parseInt(cultosMes.rows[0].count, 10),
      total_celulas: parseInt(celulas.rows[0].count, 10),
      total_ministerios: parseInt(ministerios.rows[0].count, 10),
      financeiro: { entradas, saidas, saldo: entradas - saidas },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo' });
  }
});

// Relatório financeiro detalhado por período (admin)
router.get('/financeiro', autenticar, somenteAdmin, async (req, res) => {
  const { inicio, fim } = req.query;
  if (!inicio || !fim) {
    return res.status(400).json({ erro: 'Informe as datas de início e fim.' });
  }
  try {
    const [entradas, saidas, porCategoriaDespesa, porTipoEntrada] = await Promise.all([
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM dizimos_ofertas
         WHERE data_lancamento BETWEEN $1 AND $2`,
        [inicio, fim]
      ),
      pool.query(
        `SELECT COALESCE(SUM(valor), 0) AS total FROM despesas
         WHERE data_lancamento BETWEEN $1 AND $2`,
        [inicio, fim]
      ),
      pool.query(
        `SELECT categoria, COALESCE(SUM(valor), 0) AS total FROM despesas
         WHERE data_lancamento BETWEEN $1 AND $2
         GROUP BY categoria ORDER BY total DESC`,
        [inicio, fim]
      ),
      pool.query(
        `SELECT tipo, COALESCE(SUM(valor), 0) AS total FROM dizimos_ofertas
         WHERE data_lancamento BETWEEN $1 AND $2
         GROUP BY tipo ORDER BY total DESC`,
        [inicio, fim]
      ),
    ]);

    const totalEntradas = parseFloat(entradas.rows[0].total);
    const totalSaidas = parseFloat(saidas.rows[0].total);

    res.json({
      entradas: totalEntradas,
      saidas: totalSaidas,
      saldo: totalEntradas - totalSaidas,
      por_categoria_despesa: porCategoriaDespesa.rows,
      por_tipo_entrada: porTipoEntrada.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar relatório financeiro' });
  }
});

// Frequência de membros nos cultos (admin)
router.get('/frequencia', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT e.id AS evento_id, e.titulo, e.data_inicio,
              COUNT(p.id) FILTER (WHERE p.presente = true) AS presentes,
              (SELECT COUNT(*) FROM usuarios WHERE ativo = true) AS total_membros
       FROM eventos e
       LEFT JOIN presencas_culto p ON p.evento_id = e.id
       WHERE e.tipo = 'culto'
       GROUP BY e.id, e.titulo, e.data_inicio
       ORDER BY e.data_inicio DESC
       LIMIT 10`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar frequência' });
  }
});

module.exports = router;
