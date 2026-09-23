const express = require('express');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const chatService = require('../services/chat.service');
const router = express.Router();

/** Traduz o erro do service em resposta HTTP, sem vazar detalhe do Supabase. */
function responderErro(res, err, mensagemPadrao) {
  console.error('[chat]', err.codigo || '', err.message);
  if (err.codigo === chatService.STATUS.NAO_CONFIGURADO) {
    return res.status(503).json({ erro: 'Chat indisponível: Supabase não configurado.' });
  }
  if (err.codigo === chatService.STATUS.SEM_ATENDENTE) {
    return res.status(409).json({ erro: err.message });
  }
  return res.status(500).json({ erro: mensagemPadrao });
}

// Caixa de entrada. ?status=closed para ver as encerradas.
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const status = req.query.status === 'closed' ? 'closed' : 'open';
    res.json(await chatService.listarConversas(status));
  } catch (err) {
    responderErro(res, err, 'Erro ao listar conversas');
  }
});

// Total de nao lidas para o badge do menu. Precisa vir antes de /:roomId.
router.get('/nao-lidas', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await chatService.contarNaoLidas());
  } catch (err) {
    responderErro(res, err, 'Erro ao contar mensagens não lidas');
  }
});

// Mensagens de uma conversa.
router.get('/:roomId/mensagens', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await chatService.listarMensagens(req.params.roomId));
  } catch (err) {
    responderErro(res, err, 'Erro ao carregar mensagens');
  }
});

// Oculta mensagens so no painel. Body: { ids: [...] } ou { todas: true }.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.post('/:roomId/mensagens/ocultar', autenticar, somenteAdmin, async (req, res) => {
  const { ids, todas } = req.body || {};
  if (!UUID.test(req.params.roomId)) {
    return res.status(400).json({ erro: 'Conversa invalida.' });
  }
  let lista = null;
  if (todas !== true) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every((i) => UUID.test(String(i)))) {
      return res.status(400).json({ erro: 'Selecione as mensagens a excluir.' });
    }
    lista = ids;
  }
  try {
    res.json(await chatService.ocultarMensagens(req.params.roomId, lista));
  } catch (err) {
    responderErro(res, err, 'Erro ao excluir mensagens');
  }
});

// Responder ao membro.
router.post('/:roomId/mensagens', autenticar, somenteAdmin, async (req, res) => {
  const { body } = req.body;
  if (!body || !String(body).trim()) {
    return res.status(400).json({ erro: 'Escreva uma mensagem.' });
  }
  try {
    res.status(201).json(await chatService.responder(req.params.roomId, body));
  } catch (err) {
    responderErro(res, err, 'Erro ao enviar mensagem');
  }
});

// Marcar as mensagens do membro como lidas.
router.put('/:roomId/lidas', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await chatService.marcarComoLidas(req.params.roomId));
  } catch (err) {
    responderErro(res, err, 'Erro ao marcar como lidas');
  }
});

// Encerrar ou reabrir a conversa.
router.put('/:roomId/status', autenticar, somenteAdmin, async (req, res) => {
  try {
    res.json(await chatService.alterarStatus(req.params.roomId, req.body.status));
  } catch (err) {
    responderErro(res, err, 'Erro ao alterar status da conversa');
  }
});

module.exports = router;
