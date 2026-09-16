const express = require('express');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const igrejaService = require('../services/igreja.service');
const router = express.Router();

function responderErro(res, err, mensagemPadrao) {
  console.error('[igreja]', err.codigo || '', err.message);
  if (err.codigo === igrejaService.STATUS.NAO_CONFIGURADO) {
    return res.status(503).json({ erro: 'Indisponivel: Supabase nao configurado.' });
  }
  if (err.codigo === igrejaService.STATUS.NAO_ENCONTRADO) {
    return res.status(404).json({ erro: err.message });
  }
  return res.status(500).json({ erro: mensagemPadrao });
}

// Dados da igreja
router.get('/', autenticar, async (req, res) => {
  try {
    res.json(await igrejaService.obterIgreja());
  } catch (err) {
    responderErro(res, err, 'Erro ao carregar os dados da igreja');
  }
});

router.put('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await igrejaService.atualizarIgreja(req.body));
  } catch (err) {
    responderErro(res, err, 'Erro ao salvar os dados da igreja');
  }
});

// Horarios dos cultos
router.get('/cultos', autenticar, async (req, res) => {
  try {
    res.json(await igrejaService.listarCultos());
  } catch (err) {
    responderErro(res, err, 'Erro ao carregar os horarios');
  }
});

router.post('/cultos', autenticar, somenteAdmin, async (req, res) => {
  const { name, weekday, start_time } = req.body;
  if (!name || weekday === undefined || weekday === null || !start_time) {
    return res.status(400).json({ erro: 'Informe nome, dia da semana e horario.' });
  }
  try {
    res.status(201).json(await igrejaService.criarCulto(req.body));
  } catch (err) {
    responderErro(res, err, 'Erro ao cadastrar o horario');
  }
});

router.put('/cultos/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await igrejaService.atualizarCulto(req.params.id, req.body));
  } catch (err) {
    responderErro(res, err, 'Erro ao salvar o horario');
  }
});

router.delete('/cultos/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await igrejaService.removerCulto(req.params.id));
  } catch (err) {
    responderErro(res, err, 'Erro ao remover o horario');
  }
});

module.exports = router;
