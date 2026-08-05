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

router.get('/crescimento', autenticar, somenteAdmin, async (req, res) => {
  try {
    const crescimento = await metricsService.crescimento();
    res.json(crescimento);
  } catch (err) {
    console.error('[metrics] Erro no crescimento:', err);
    res.status(500).json({ erro: 'Erro ao calcular crescimento.' });
  }
});

router.get('/retencao', autenticar, somenteAdmin, async (req, res) => {
  try {
    const retencao = await metricsService.retencao();
    res.json(retencao);
  } catch (err) {
    console.error('[metrics] Erro na retencao:', err);
    res.status(500).json({ erro: 'Erro ao calcular retencao.' });
  }
});

router.get('/engajamento', autenticar, somenteAdmin, async (req, res) => {
  try {
    const engajamento = await metricsService.engajamento();
    res.json(engajamento);
  } catch (err) {
    console.error('[metrics] Erro no engajamento:', err);
    res.status(500).json({ erro: 'Erro ao calcular engajamento.' });
  }
});

router.get('/financeiro-status', autenticar, somenteAdmin, async (req, res) => {
  try {
    const status = await metricsService.statusFinanceiro();
    res.json(status);
  } catch (err) {
    console.error('[metrics] Erro no financeiro-status:', err);
    res.status(500).json({ erro: 'Erro ao calcular status financeiro.' });
  }
});

router.get('/igreja-saudavel', autenticar, somenteAdmin, async (req, res) => {
  try {
    const saude = await metricsService.igrejaSaudavel();
    res.json(saude);
  } catch (err) {
    console.error('[metrics] Erro no igreja-saudavel:', err);
    res.status(500).json({ erro: 'Erro ao calcular igreja saudavel.' });
  }
});

router.get('/ia-score', autenticar, somenteAdmin, async (req, res) => {
  try {
    const score = await metricsService.iaScore();
    res.json(score);
  } catch (err) {
    console.error('[metrics] Erro no ia-score:', err);
    res.status(500).json({ erro: 'Erro ao calcular IA score.' });
  }
});

router.get('/frequencia-cultos', autenticar, somenteAdmin, async (req, res) => {
  try {
    const frequencia = await metricsService.frequenciaCultos();
    res.json(frequencia);
  } catch (err) {
    console.error('[metrics] Erro no frequencia-cultos:', err);
    res.status(500).json({ erro: 'Erro ao calcular frequencia de cultos.' });
  }
});

router.get('/distribuicao-idades', autenticar, somenteAdmin, async (req, res) => {
  try {
    const distribuicao = await metricsService.distribuicaoIdades();
    res.json(distribuicao);
  } catch (err) {
    console.error('[metrics] Erro no distribuicao-idades:', err);
    res.status(500).json({ erro: 'Erro ao calcular distribuicao de idades.' });
  }
});

module.exports = router;