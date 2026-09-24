/**
 * Visitantes por QR Code (Bloco 6).
 *
 * POST /api/visitantes          -> PUBLICO: formulario aberto pelo QR na recepcao
 * GET  /api/visitantes          -> admin: ultimas visitas
 * GET  /api/visitantes/resumo   -> admin: visitantes x membros por culto
 *
 * Tabela `visitas_culto` (Railway). Nao usa `presencas_culto`, que e so de
 * membros e alimenta metricas, saude da igreja e alertas.
 *
 * LGPD: telefone so e guardado com autorizacao de contato (o banco tambem
 * recusa: constraint visitas_culto_telefone_com_autorizacao).
 */
const express = require('express');
const pool = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

const COMO_CONHECEU = ['amigo_familia', 'redes_sociais', 'passou_na_frente', 'evento', 'outro'];

// Limite de envios por IP (rota publica): 40 a cada 10 minutos. Folgado de
// proposito: todos os visitantes no Wi-Fi da igreja saem pelo MESMO IP.
// Segura robo/enxurrada sem barrar a recepcao cheia.
const JANELA_MS = 10 * 60 * 1000;
const MAX_ENVIOS = 40;
const envios = new Map();

function ipDe(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado.trim()) return encaminhado.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconhecido';
}

function excedeuLimite(ip) {
  const agora = Date.now();
  const lista = (envios.get(ip) || []).filter((t) => agora - t < JANELA_MS);
  if (lista.length >= MAX_ENVIOS) {
    envios.set(ip, lista);
    return true;
  }
  lista.push(agora);
  envios.set(ip, lista);
  if (envios.size > 5000) {
    for (const [chave, tempos] of envios) {
      if (!tempos.some((t) => agora - t < JANELA_MS)) envios.delete(chave);
    }
  }
  return false;
}

/** Valida e normaliza o corpo do formulario. Devolve { erro } ou { dados }. */
function validar(body) {
  const nome = typeof body?.nome === 'string' ? body.nome.trim().replace(/\s+/g, ' ') : '';
  if (nome.length < 2 || nome.length > 120) return { erro: 'Informe seu nome (de 2 a 120 letras).' };

  const comoConheceu = body?.como_conheceu;
  if (!COMO_CONHECEU.includes(comoConheceu)) return { erro: 'Escolha como conheceu a igreja.' };

  const autoriza = body?.autoriza_contato === true;
  let telefone = null;
  if (autoriza) {
    const digitos = String(body?.telefone || '').replace(/\D/g, '');
    if (digitos.length !== 10 && digitos.length !== 11) {
      return { erro: 'Para autorizar contato, informe um telefone com DDD.' };
    }
    telefone = digitos;
  }

  return { dados: { nome, telefone, autoriza, comoConheceu } };
}

// PUBLICO: registrar visita
router.post('/', async (req, res) => {
  if (excedeuLimite(ipDe(req))) {
    return res.status(429).json({ erro: 'Muitos envios seguidos. Tente de novo em alguns minutos.' });
  }

  const { erro, dados } = validar(req.body);
  if (erro) return res.status(400).json({ erro });

  try {
    // Liga ao culto que comeca ate 1h depois ou comecou ate 3h antes (horario de Brasilia).
    const resultado = await pool.query(
      `INSERT INTO visitas_culto (evento_id, nome, telefone, autoriza_contato, como_conheceu)
       VALUES (
         (SELECT e.id FROM eventos e
           WHERE e.tipo = 'culto'
             AND (now() AT TIME ZONE 'America/Sao_Paulo')
                 BETWEEN e.data_inicio - INTERVAL '1 hour' AND e.data_inicio + INTERVAL '3 hours'
           ORDER BY abs(extract(epoch FROM (e.data_inicio - (now() AT TIME ZONE 'America/Sao_Paulo'))))
           LIMIT 1),
         $1, $2, $3, $4)
       RETURNING id`,
      [dados.nome, dados.telefone, dados.autoriza, dados.comoConheceu]
    );
    res.status(201).json({ ok: true, id: resultado.rows[0].id });
  } catch (err) {
    console.error('[visitantes] falha ao registrar:', err.message);
    res.status(500).json({ erro: 'Não foi possível registrar agora. Tente de novo.' });
  }
});

// Admin: ultimas visitas
router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT v.id, v.nome, v.telefone, v.autoriza_contato, v.como_conheceu,
              to_char(v.criado_em, 'YYYY-MM-DD"T"HH24:MI') AS criado_em,
              e.titulo AS culto
         FROM visitas_culto v
         LEFT JOIN eventos e ON e.id = v.evento_id
        ORDER BY v.criado_em DESC
        LIMIT 200`
    );
    res.json(resultado.rows);
  } catch (err) {
    console.error('[visitantes] falha ao listar:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar visitantes' });
  }
});

// Admin: visitantes x membros nos ultimos 12 cultos + visitas sem culto por dia (30 dias)
router.get('/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const porCulto = await pool.query(
      `SELECT e.id, e.titulo, to_char(e.data_inicio, 'YYYY-MM-DD"T"HH24:MI') AS data_inicio,
              (SELECT COUNT(*) FROM visitas_culto v WHERE v.evento_id = e.id)::int AS visitantes,
              (SELECT COUNT(*) FROM presencas_culto p WHERE p.evento_id = e.id AND p.presente = true)::int AS membros
         FROM eventos e
        WHERE e.tipo = 'culto'
          AND e.data_inicio <= (now() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '3 hours'
        ORDER BY e.data_inicio DESC
        LIMIT 12`
    );
    const semCulto = await pool.query(
      `SELECT to_char(criado_em::date, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS visitantes
         FROM visitas_culto
        WHERE evento_id IS NULL
          AND criado_em >= (now() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '30 days'
        GROUP BY criado_em::date
        ORDER BY dia DESC`
    );
    const origem = await pool.query(
      `SELECT como_conheceu, COUNT(*)::int AS total
         FROM visitas_culto
        GROUP BY como_conheceu
        ORDER BY total DESC`
    );
    res.json({ por_culto: porCulto.rows, sem_culto: semCulto.rows, como_conheceu: origem.rows });
  } catch (err) {
    console.error('[visitantes] falha no resumo:', err.message);
    res.status(500).json({ erro: 'Erro ao montar o resumo de visitantes' });
  }
});

module.exports = router;
module.exports._interno = { validar, excedeuLimite, envios };
