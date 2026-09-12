const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const {
  marcarPedidoDoPainel,
  buscarPedidosDoApp,
  ordenarPorData,
  interpretarId,
  resolverUuidDoPastor,
  responderPedidoDoApp,
  alterarStatusDoPedidoDoApp,
  excluirPedidoDoApp,
} = require('../services/oracao.service');
const router = express.Router();

// Criar pedido de oracao (membro logado)
router.post('/', autenticar, async (req, res) => {
  const { titulo, pedido, anonimo, nome_solicitante } = req.body;
  if (!pedido) {
    return res.status(400).json({ erro: 'O texto do pedido e obrigatorio' });
  }
  try {
    const resultado = await pool.query(
      `INSERT INTO pedidos_oracao (usuario_id, nome_solicitante, anonimo, titulo, pedido)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.usuario.id,
        anonimo ? null : (nome_solicitante || req.usuario.nome),
        !!anonimo,
        titulo || null,
        pedido
      ]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao enviar pedido de oracao' });
  }
});

// Ver meus proprios pedidos
router.get('/meus', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM pedidos_oracao WHERE usuario_id = $1 ORDER BY criado_em DESC`,
      [req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// Resumo de pedidos por status (admin/lideranca) - usado no card do Dashboard
router.get('/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT status, COUNT(*)::int AS total
       FROM pedidos_oracao
       GROUP BY status`
    );

    const contagens = { em_oracao: 0, respondido: 0, encerrado: 0 };
    resultado.rows.forEach((r) => {
      if (contagens[r.status] !== undefined) {
        contagens[r.status] = r.total;
      }
    });

    // Os pedidos do aplicativo entram na mesma contagem: para o pastor,
    // pedido de oracao e pedido de oracao, nao importa por onde chegou.
    const { pedidos: doApp } = await buscarPedidosDoApp();
    doApp.forEach((p) => {
      if (contagens[p.status] !== undefined) {
        contagens[p.status] += 1;
      }
    });

    const total = contagens.em_oracao + contagens.respondido + contagens.encerrado;

    res.json({ total, contagens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar resumo de pedidos de oracao' });
  }
});

/**
 * Listar todos os pedidos (admin/lideranca).
 *
 * Junta os pedidos criados no painel (Railway) com os enviados pelo
 * aplicativo (Supabase) numa lista unica, ordenada por data.
 *
 * Se o Supabase estiver indisponivel, a tela continua funcionando com os
 * pedidos do painel e o problema sobe no cabecalho - nunca em silencio.
 */
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const doPainel = await pool.query(
      `SELECT * FROM pedidos_oracao ORDER BY criado_em DESC`
    );

    const { pedidos: doApp, aviso } = await buscarPedidosDoApp();

    const lista = ordenarPorData([
      ...doPainel.rows.map(marcarPedidoDoPainel),
      ...doApp,
    ]);

    if (aviso) {
      res.set('X-Aviso-Parcial', encodeURIComponent(aviso));
    }

    res.json(lista);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar pedidos' });
  }
});

// Contar pedidos de oracao pendentes (para o badge do menu).
// Soma painel + aplicativo, porque para o pastor a origem nao importa.
router.get('/nao-respondidos', autenticar, somenteAdmin, async (req, res) => {
  try {
    const doPainel = await pool.query(
      "SELECT COUNT(*)::int AS total FROM pedidos_oracao WHERE status = 'em_oracao'"
    );
    const { pedidos: doApp } = await buscarPedidosDoApp();
    const totalApp = doApp.filter((p) => p.status === 'em_oracao').length;
    res.json({ total: doPainel.rows[0].total + totalApp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao contar pedidos pendentes' });
  }
});

// Atualizar status do pedido (admin/lideranca)
router.put('/:id/status', autenticar, somenteAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['em_oracao', 'respondido', 'encerrado'].includes(status)) {
    return res.status(400).json({ erro: 'Status invalido' });
  }

  const alvo = interpretarId(req.params.id);

  // Pedido do aplicativo vive no Supabase: nao ha nada a fazer no Railway.
  if (alvo.origem === 'aplicativo') {
    const r = await alterarStatusDoPedidoDoApp(alvo.id, status);
    if (r.erro) return res.status(r.status).json({ erro: r.erro });
    return res.json(r.pedido);
  }

  try {
    const resultado = await pool.query(
      `UPDATE pedidos_oracao SET status = $1 WHERE id = $2 RETURNING *`,
      [status, alvo.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar status' });
  }
});

// Responder pedido com uma mensagem (admin/lideranca)
router.put('/:id/responder', autenticar, somenteAdmin, async (req, res) => {
  const { resposta } = req.body;
  if (!resposta || !resposta.trim()) {
    return res.status(400).json({ erro: 'A resposta nao pode ser vazia' });
  }

  const alvo = interpretarId(req.params.id);

  // Pedido do aplicativo: a autoria exige o vinculo com a conta do Supabase.
  if (alvo.origem === 'aplicativo') {
    const vinculo = await resolverUuidDoPastor(req.usuario.id);
    if (!vinculo.uuid) {
      return res.status(422).json({ erro: vinculo.erro });
    }
    const r = await responderPedidoDoApp(alvo.id, resposta.trim(), vinculo.uuid);
    if (r.erro) return res.status(r.status).json({ erro: r.erro });
    return res.json(r.pedido);
  }

  try {
    const resultado = await pool.query(
      `UPDATE pedidos_oracao SET
        resposta = $1,
        respondido_em = NOW(),
        status = 'respondido'
       WHERE id = $2
       RETURNING *`,
      [resposta, alvo.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Pedido nao encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao responder pedido' });
  }
});

/**
 * Excluir um pedido de oracao (admin).
 *
 * O id carrega a origem: com prefixo `sb:` o pedido vive no Supabase, sem
 * prefixo vive no Railway. Cada caso vai para o seu banco -- nao ha exclusao
 * cruzada nem tentativa nos dois.
 *
 * A exclusao e definitiva. A confirmacao acontece na tela, antes da chamada.
 */
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  const alvo = interpretarId(req.params.id);

  if (alvo.origem === 'aplicativo') {
    const r = await excluirPedidoDoApp(alvo.id);
    if (r.erro) return res.status(r.status).json({ erro: r.erro });
    return res.status(204).send();
  }

  try {
    const resultado = await pool.query(
      'DELETE FROM pedidos_oracao WHERE id = $1 RETURNING id',
      [alvo.id],
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Pedido nao encontrado' });
    }
    res.status(204).send();
  } catch (err) {
    console.error('[oracao] falha ao excluir pedido do painel:', err);
    res.status(500).json({ erro: 'Erro ao excluir pedido' });
  }
});

module.exports = router;