const express = require('express');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const metricsService = require('../services/metricsService');
const router = express.Router();

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

router.get('/seguranca', autenticar, somenteAdmin, async (req, res) => {
  try {
    const seguranca = await metricsService.seguranca();
    res.json(seguranca);
  } catch (err) {
    console.error('[metrics] Erro na seguranca:', err);
    res.status(500).json({ erro: 'Erro ao avaliar seguranca.' });
  }
});

module.exports = router;