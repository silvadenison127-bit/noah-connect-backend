/**
 * metrics.js — Rota oficial de métricas do Sistema Noah.
 *
 * Expõe a camada metricsService via HTTP. É a porta de entrada única
 * para Dashboard, Executive BI, IA Noah e Relatórios consumirem KPIs.
 *
 * A rota não calcula nada — apenas delega ao metricsService (fonte de verdade)
 * e devolve o resultado padronizado { valor, estado, ultimaAtualizacao, origem }.
 */

const express = require('express');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const metricsService = require('../services/metricsService');
const router = express.Router();

/**
 * GET /api/metrics/contagens
 * Retorna todos os KPIs de contagem da Fase 1 (dados reais do banco).
 * Acesso: admin.
 */
router.get('/contagens', autenticar, somenteAdmin, async (req, res) => {
  try {
    const contagens = await metricsService.coletarContagens();
    res.json({
      gerado_em: new Date().toISOString(),
      contagens,
    });
  } catch (err) {
    console.error('[metrics] Erro ao coletar contagens:', err);
    res.status(500).json({ erro: 'Erro ao coletar métricas.' });
  }
});

module.exports = router;