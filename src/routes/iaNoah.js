const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const aiNoahService = require('../services/aiNoahService');
const router = express.Router();

// Status do modulo (informa ao frontend se esta em modo real ou demonstracao)
router.get('/status', autenticar, somenteAdmin, async (req, res) => {
  res.json(aiNoahService.obterStatus());
});

// Enviar uma pergunta em linguagem natural
router.post('/perguntar', autenticar, somenteAdmin, async (req, res) => {
  const { pergunta, historico } = req.body;
  if (!pergunta || !pergunta.trim()) {
    return res.status(400).json({ erro: 'Informe uma pergunta' });
  }
  try {
    const resultado = await aiNoahService.responderPergunta(pool, {
      pergunta: pergunta.trim(),
      historico: Array.isArray(historico) ? historico.slice(-10) : [],
    });
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao processar pergunta da IA Noah:', err);
    res.status(500).json({ erro: 'Erro ao processar sua pergunta' });
  }
});

module.exports = router;