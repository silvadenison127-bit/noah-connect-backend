const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const {
  STATUS,
  publicarEventoNoApp,
  atualizarEventoNoApp,
  cancelarEventoNoApp,
  vincularEvento,
} = require('../services/eventos.service');

const router = express.Router();

// Listar próximos eventos (qualquer membro logado)
router.get('/', autenticar, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM eventos
       WHERE data_inicio >= NOW() - INTERVAL '1 day'
       ORDER BY data_inicio ASC`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar eventos' });
  }
});

// Criar evento (admin)
//
// O evento nasce no Railway e e publicado no Supabase, para que o aplicativo
// do membro consiga ve-lo. Sao tres passos, nesta ordem:
//
//   1. INSERT no Railway            <- fonte administrativa
//   2. INSERT no Supabase           <- o que o membro le
//   3. UPDATE do vinculo no Railway <- permite atualizar depois
//
// O RETURNING converte o horario com AT TIME ZONE 'America/Sao_Paulo'.
// data_inicio e TIMESTAMP sem fuso e guarda o horario local de Curitiba
// exatamente como foi digitado; sem a conversao o Supabase interpretaria
// 19:00 como UTC e o membro veria 16:00.
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, tipo, data_inicio, data_fim, local } = req.body;

  if (!titulo || !data_inicio) {
    return res.status(400).json({ erro: 'Título e data de início são obrigatórios' });
  }

  let evento;

  // Passo 1 - Railway. Se falhar aqui, nada foi criado e o erro e simples.
  try {
    const resultado = await pool.query(
      `INSERT INTO eventos (titulo, descricao, tipo, data_inicio, data_fim, local, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *,
         (data_inicio AT TIME ZONE 'America/Sao_Paulo') AS starts_at_utc,
         (data_fim    AT TIME ZONE 'America/Sao_Paulo') AS ends_at_utc`,
      [titulo, descricao, tipo || 'evento', data_inicio, data_fim || null, local, req.usuario.id]
    );
    evento = resultado.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar evento' });
  }

  // A partir daqui o evento JA EXISTE no painel. Nenhuma falha adiante pode
  // ser reportada como "erro ao criar evento", porque criar deu certo.
  const { starts_at_utc, ends_at_utc, ...eventoPainel } = evento;

  // Passo 2 - Supabase.
  const publicacao = await publicarEventoNoApp(evento, req.usuario.id);

  if (publicacao.status !== STATUS.OK) {
    console.error(
      `[eventos] RAILWAY_CREATED id=${evento.id} / ${publicacao.status}: ${publicacao.erro}`
    );
    return res.status(201).json({
      ...eventoPainel,
      integracao: {
        status: `RAILWAY_CREATED / ${publicacao.status}`,
        publicado_no_app: false,
        aviso: publicacao.erro,
      },
    });
  }

  // Passo 3 - vinculo.
  const vinculo = await vincularEvento(evento.id, publicacao.uuid);

  if (!vinculo.ok) {
    console.error(
      `[eventos] RAILWAY_CREATED id=${evento.id} / SUPABASE_CREATED uuid=${publicacao.uuid} / LINK_FAILED: ${vinculo.erro}`
    );
    return res.status(201).json({
      ...eventoPainel,
      supabase_event_id: publicacao.uuid,
      integracao: {
        status: 'RAILWAY_CREATED / SUPABASE_CREATED / LINK_FAILED',
        publicado_no_app: true,
        aviso: vinculo.erro,
      },
    });
  }

  res.status(201).json({
    ...eventoPainel,
    supabase_event_id: publicacao.uuid,
    integracao: {
      status: 'RAILWAY_CREATED / SUPABASE_CREATED / LINKED',
      publicado_no_app: true,
      aviso: null,
    },
  });
});

// Atualizar evento (admin)
//
// A edicao precisa chegar ao membro, senao o aplicativo continua mostrando a
// data ou o local antigos - pior do que nao publicar, porque exibe informacao
// errada com aparencia de correta.
//
// Dois caminhos, decididos pelo vinculo:
//
//   supabase_event_id preenchido -> UPDATE no Supabase pelo uuid
//   supabase_event_id NULL       -> INSERT no Supabase + grava o vinculo
//
// O objeto enviado ao Supabase e montado a partir do RETURNING, nunca do
// req.body: o UPDATE usa COALESCE, entao a requisicao pode ser parcial e
// req.body sozinho produziria campos nulos no aplicativo.
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, tipo, data_inicio, data_fim, local } = req.body;

  let evento;

  // Passo 1 - Railway. Se falhar aqui, nada foi alterado e nao chamamos o
  // Supabase.
  try {
    const resultado = await pool.query(
      `UPDATE eventos SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        tipo = COALESCE($3, tipo),
        data_inicio = COALESCE($4, data_inicio),
        data_fim = COALESCE($5, data_fim),
        local = COALESCE($6, local)
       WHERE id = $7
       RETURNING *,
         (data_inicio AT TIME ZONE 'America/Sao_Paulo') AS starts_at_utc,
         (data_fim    AT TIME ZONE 'America/Sao_Paulo') AS ends_at_utc`,
      [titulo, descricao, tipo, data_inicio, data_fim, local, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Evento não encontrado' });
    }
    evento = resultado.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao atualizar evento' });
  }

  // A partir daqui o Railway JA FOI ATUALIZADO. Nenhuma falha adiante pode ser
  // reportada como "erro ao atualizar evento".
  const { starts_at_utc, ends_at_utc, ...eventoPainel } = evento;

  // CASO 1 - evento ja publicado: reflete a edicao.
  if (evento.supabase_event_id) {
    const sincronizacao = await atualizarEventoNoApp(evento, evento.supabase_event_id);

    if (sincronizacao.status !== STATUS.ATUALIZADO) {
      console.error(
        `[eventos] RAILWAY_UPDATED id=${evento.id} / ${sincronizacao.status}: ${sincronizacao.erro}`
      );
      return res.json({
        ...eventoPainel,
        integracao: {
          status: `RAILWAY_UPDATED / ${sincronizacao.status}`,
          publicado_no_app: false,
          aviso: sincronizacao.erro,
        },
      });
    }

    return res.json({
      ...eventoPainel,
      integracao: {
        status: 'RAILWAY_UPDATED / SUPABASE_UPDATED',
        publicado_no_app: true,
        aviso: null,
      },
    });
  }

  // CASO 2 - evento sem vinculo: publica agora e grava a referencia.
  //
  // criado_por, e nao req.usuario.id: created_by registra quem CRIOU o evento.
  // Quem esta editando pode ser outro administrador.
  const publicacao = await publicarEventoNoApp(evento, evento.criado_por);

  if (publicacao.status !== STATUS.OK) {
    console.error(
      `[eventos] RAILWAY_UPDATED id=${evento.id} / ${publicacao.status}: ${publicacao.erro}`
    );
    return res.json({
      ...eventoPainel,
      integracao: {
        status: `RAILWAY_UPDATED / ${publicacao.status}`,
        publicado_no_app: false,
        aviso: publicacao.erro,
      },
    });
  }

  const vinculo = await vincularEvento(evento.id, publicacao.uuid);

  if (!vinculo.ok) {
    console.error(
      `[eventos] RAILWAY_UPDATED id=${evento.id} / SUPABASE_CREATED uuid=${publicacao.uuid} / LINK_FAILED: ${vinculo.erro}`
    );
    return res.json({
      ...eventoPainel,
      supabase_event_id: publicacao.uuid,
      integracao: {
        status: 'RAILWAY_UPDATED / SUPABASE_CREATED / LINK_FAILED',
        publicado_no_app: true,
        aviso: vinculo.erro,
      },
    });
  }

  res.json({
    ...eventoPainel,
    supabase_event_id: publicacao.uuid,
    integracao: {
      status: 'RAILWAY_UPDATED / SUPABASE_CREATED / LINKED',
      publicado_no_app: true,
      aviso: null,
    },
  });
});

// Remover evento (admin)
//
// O evento sai do painel e e CANCELADO no aplicativo, nao apagado. Decisao do
// dono do projeto: um evento cancelado e informacao, e apagar destruiria o
// registro de que ele existiu. O aplicativo ja filtra
// `.neq('status', 'canceled')`, entao marcar o status basta para o membro
// deixar de ve-lo - e a operacao continua reversivel.
//
// O DELETE usa RETURNING para capturar o supabase_event_id ANTES de a linha
// sumir. Sem isso, perderiamos a referencia e o evento ficaria orfao no
// aplicativo, visivel para sempre.
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  let removido;

  // Passo 1 - Railway.
  try {
    const resultado = await pool.query(
      'DELETE FROM eventos WHERE id = $1 RETURNING id, titulo, supabase_event_id',
      [req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ erro: 'Evento não encontrado' });
    }
    removido = resultado.rows[0];
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao remover evento' });
  }

  // Evento que nunca foi publicado: nao ha nada a cancelar no aplicativo.
  if (!removido.supabase_event_id) {
    return res.json({
      id: removido.id,
      integracao: {
        status: 'RAILWAY_DELETED / SEM_VINCULO',
        removido_do_app: false,
        aviso: null,
      },
    });
  }

  // Passo 2 - Supabase.
  const cancelamento = await cancelarEventoNoApp(removido.supabase_event_id);

  if (cancelamento.status !== STATUS.CANCELADO) {
    console.error(
      `[eventos] RAILWAY_DELETED id=${removido.id} uuid=${removido.supabase_event_id} / ${cancelamento.status}: ${cancelamento.erro}`
    );
    return res.json({
      id: removido.id,
      supabase_event_id: removido.supabase_event_id,
      integracao: {
        status: `RAILWAY_DELETED / ${cancelamento.status}`,
        removido_do_app: false,
        aviso: cancelamento.erro,
      },
    });
  }

  res.json({
    id: removido.id,
    supabase_event_id: removido.supabase_event_id,
    integracao: {
      status: 'RAILWAY_DELETED / SUPABASE_CANCELED',
      removido_do_app: true,
      aviso: null,
    },
  });
});

module.exports = router;
