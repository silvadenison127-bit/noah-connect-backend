/**
 * Botao de panico (Bloco 5) - leitura e atendimento pelo painel.
 *
 * Os alertas nascem no aplicativo e sao gravados no Supabase pela Edge
 * Function `panic-alert`. O painel so le os alertas em aberto e marca como
 * atendido. A tabela `panic_alerts` so e acessivel com a chave de servico,
 * que existe apenas aqui no backend.
 */
const express = require('express');
const { supabaseAdmin, supabaseConfigurado } = require('../config/supabase');
const { autenticar, somenteAdmin } = require('../middleware/auth');

const router = express.Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function exigirSupabase(res) {
  if (supabaseConfigurado) return true;
  res.status(503).json({ erro: 'Alertas indisponíveis: a integração com o aplicativo não está configurada.' });
  return false;
}

// Alertas ainda nao atendidos (mais recentes primeiro)
router.get('/abertos', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;
  try {
    const { data, error } = await supabaseAdmin
      .from('panic_alerts')
      .select('id, latitude, longitude, accuracy_m, created_at, members!inner(profiles!inner(full_name, phone))')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    const alertas = (data || []).map((a) => ({
      id: a.id,
      latitude: a.latitude,
      longitude: a.longitude,
      precisao_m: a.accuracy_m,
      criado_em: a.created_at,
      nome: a.members?.profiles?.full_name || 'Membro',
      telefone: a.members?.profiles?.phone || null,
    }));
    res.json(alertas);
  } catch (err) {
    console.error('[panico] falha ao listar:', err.message);
    res.status(500).json({ erro: 'Erro ao buscar alertas de pânico' });
  }
});

// Marcar alerta como atendido
router.patch('/:id/atender', autenticar, somenteAdmin, async (req, res) => {
  if (!exigirSupabase(res)) return;
  if (!UUID.test(req.params.id)) return res.status(400).json({ erro: 'Alerta inválido' });
  try {
    const { data, error } = await supabaseAdmin
      .from('panic_alerts')
      .update({ resolved_at: new Date().toISOString(), resolved_by: req.usuario?.nome || 'painel' })
      .eq('id', req.params.id)
      .is('resolved_at', null)
      .select('id');
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ erro: 'Alerta não encontrado ou já atendido' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[panico] falha ao atender:', err.message);
    res.status(500).json({ erro: 'Erro ao marcar o alerta como atendido' });
  }
});

module.exports = router;
