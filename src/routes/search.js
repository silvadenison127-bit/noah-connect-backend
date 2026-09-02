/**
 * search.js — Rota da Pesquisa Global do Sistema Noah.
 *
 * GET /api/search?q=texto
 * Delega ao searchService (fonte unica). Nao calcula nada aqui.
 *
 * O usuario autenticado segue para o service porque autenticacao nao e
 * autorizacao: modulos como financeiro e cadastro de membros so podem ser
 * consultados por quem tem papel para isso, e essa decisao acontece antes
 * de qualquer query chegar ao banco.
 */
const express = require('express');
const { autenticar } = require('../middleware/auth');
const searchService = require('../services/searchService');

const router = express.Router();

router.get('/', autenticar, async (req, res) => {
  const termo = req.query.q || '';
  try {
    const resultado = await searchService.pesquisar(termo, req.usuario);
    res.json(resultado);
  } catch (err) {
    console.error('[search] Erro na pesquisa:', err);
    res.status(500).json({ erro: 'Erro ao realizar a pesquisa.' });
  }
});

module.exports = router;