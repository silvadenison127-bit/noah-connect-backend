const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const {
  STATUS,
  publicarEventoNoApp,
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
router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { titulo, descricao, tipo, data_inicio, data_fim, local } = req.body;
  try {
    const resultado = await pool.query(
      `UPDATE eventos SET
        titulo = COALESCE($1, titulo),
        descricao = COALESCE($2, descricao),
        tipo = COALESCE($3, tipo),
        data_inicio = COALESCE($4, data_inicio),
        data_fim = COALESCE($5, data_fim),
        local = COALESCE($6, local)
       WHERE id = $7 RETURNING *`,
      [titulo, descricao, tipo, data_inicio, data_fim, local, req.params.id]
    );
    if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Evento não encontrado' });
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar evento' });
  }
});

// Remover evento (admin)
router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM eventos WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao remover evento' });
  }
});

module.exports = router;
