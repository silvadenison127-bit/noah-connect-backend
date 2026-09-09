'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const pool    = require('../config/db');
const { autenticar, somenteAdmin } = require('../middleware/auth');
const { excluirMembros, excluirMembro, removerContasDoAuth } = require('../services/membros.service');
const { supabaseAdmin, supabaseConfigurado } = require('../config/supabase');

const router = express.Router();

const INSERT_USUARIO = "INSERT INTO usuarios (nome, email, senha_hash, telefone, cpf, tipo, status, auth_user_id) VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'membro'), 'aprovado', $7) RETURNING id, nome, email, telefone, cpf, tipo, ativo, membro_desde, status, auth_user_id";

router.get('/', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde, ativo, status FROM usuarios ORDER BY nome ASC');
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar membros' }); }
});

/**
 * Cadastro de membro pelo painel.
 *
 * A conta nasce primeiro no Supabase Auth e so depois no Railway. Essa ordem e
 * deliberada: se a criacao no Auth falhar, nada foi escrito aqui e o cadastro
 * simplesmente nao acontece -- em vez de deixar um membro no painel sem acesso
 * ao aplicativo.
 *
 * O trigger `on_auth_user_created` cuida de `profiles` e `members` a partir do
 * `user_metadata`, entao este codigo nao toca nessas tabelas.
 *
 * Nao existe transacao entre os dois bancos. A unica janela de falha restante
 * (Auth criado, INSERT no Railway falhou) e coberta por compensacao no catch.
 */
router.post('/', autenticar, somenteAdmin, async (req, res) => {
  const { nome, email, telefone, tipo, senha, cpf } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha sao obrigatorios.' });
  }

  // Sem o cliente administrativo o membro nasceria sem acesso ao aplicativo e
  // ninguem perceberia. Recusar e melhor do que criar pela metade.
  if (!supabaseConfigurado) {
    return res.status(503).json({
      erro: 'Cadastro indisponivel: a integracao com o aplicativo nao esta configurada.',
    });
  }

  // O aplicativo normaliza o e-mail no login (trim + lowercase). Guardar em
  // outro formato faria a pessoa digitar as credenciais corretas e nao
  // encontrar a conta.
  const emailNormalizado = String(email).trim().toLowerCase();
  const nomeLimpo = String(nome).trim();
  const documento = cpf ? String(cpf).replace(/\D/g, '') : null;

  let authUserId = null;

  try {
    const existente = await pool.query('SELECT id FROM usuarios WHERE lower(email) = $1', [
      emailNormalizado,
    ]);
    if (existente.rows.length > 0) {
      return res.status(409).json({ erro: 'Ja existe um usuario com esse email.' });
    }

    // 1. Conta no Supabase Auth. `email_confirm: true` porque as credenciais
    //    sao entregues em maos pelo pastor -- exigir confirmacao por e-mail
    //    quebraria esse fluxo.
    const { data: criado, error: erroAuth } = await supabaseAdmin.auth.admin.createUser({
      email: emailNormalizado,
      password: senha,
      email_confirm: true,
      user_metadata: {
        full_name: nomeLimpo,
        phone: telefone || null,
        document: documento,
        birth_date: null,
      },
    });

    if (erroAuth) {
      const mensagem = String(erroAuth.message ?? '');
      // Conta pre-existente no Auth (criada pelo proprio aplicativo, por
      // exemplo). Nao vinculamos automaticamente: a senha digitada aqui nao
      // valeria, e o membro receberia credenciais que nao funcionam.
      if (/already|registered|exists|duplicate/i.test(mensagem)) {
        return res.status(409).json({ erro: 'Ja existe uma conta com esse email no aplicativo.' });
      }
      console.error('[membros] falha ao criar usuario no Supabase Auth:', erroAuth);
      return res.status(502).json({ erro: 'Nao foi possivel criar o acesso ao aplicativo.' });
    }

    authUserId = criado?.user?.id ?? null;
    if (!authUserId) {
      console.error('[membros] Supabase nao devolveu o id do usuario criado.');
      return res.status(502).json({ erro: 'Nao foi possivel criar o acesso ao aplicativo.' });
    }

    // 2. Registro no Railway, ja com o vinculo preenchido. Um unico INSERT:
    //    ou o membro nasce completo, ou nao nasce.
    const senha_hash = await bcrypt.hash(senha, 10);
    const r = await pool.query(INSERT_USUARIO, [
      nomeLimpo,
      emailNormalizado,
      senha_hash,
      telefone || null,
      documento,
      tipo,
      authUserId,
    ]);

    return res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error('[membros] erro ao criar membro:', err);

    // Compensacao: a conta no Auth ficou orfa. Apagar restaura o estado
    // anterior -- o CASCADE das chaves estrangeiras limpa profiles e members.
    if (authUserId) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        console.warn(`[membros] compensacao aplicada: auth user ${authUserId} removido.`);
      } catch (erroCompensacao) {
        // Nao ha como resolver automaticamente. O id fica registrado para
        // reconciliacao manual; esconder isso seria pior.
        console.error(
          `[membros] COMPENSACAO FALHOU. Conta orfa no Supabase Auth: ${authUserId}`,
          erroCompensacao,
        );
      }
    }

    return res.status(500).json({ erro: 'Erro ao criar membro' });
  }
});

router.get('/perfil', autenticar, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nome, email, telefone, cpf, tipo, foto_url, membro_desde FROM usuarios WHERE id = $1', [req.usuario.id]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar perfil' }); }
});

router.put('/perfil', autenticar, async (req, res) => {
  const { foto_url, telefone, cpf } = req.body;
  try {
    const r = await pool.query('UPDATE usuarios SET foto_url = COALESCE($1, foto_url), telefone = COALESCE($2, telefone), cpf = COALESCE($3, cpf), atualizado_em = NOW() WHERE id = $4 RETURNING id, nome, email, telefone, cpf, tipo, foto_url', [foto_url, telefone, cpf, req.usuario.id]);
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao atualizar perfil' }); }
});

router.get('/pendentes', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("SELECT id, nome, email, telefone, criado_em FROM usuarios WHERE status = 'pendente' ORDER BY criado_em ASC");
    res.json(r.rows);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao buscar pendentes' }); }
});

router.put('/:id/aprovar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE usuarios SET status = 'aprovado', atualizado_em = NOW() WHERE id = $1 RETURNING id, nome, email, status", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao aprovar membro' }); }
});

router.put('/:id/rejeitar', autenticar, somenteAdmin, async (req, res) => {
  try {
    const r = await pool.query("UPDATE usuarios SET status = 'rejeitado', atualizado_em = NOW() WHERE id = $1 RETURNING id, nome, email, status", [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Usuario nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao rejeitar membro' }); }
});

router.put('/:id', autenticar, somenteAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, tipo, ativo, cpf } = req.body;
  try {
    const r = await pool.query('UPDATE usuarios SET nome = COALESCE($1, nome), telefone = COALESCE($2, telefone), tipo = COALESCE($3, tipo), ativo = COALESCE($4, ativo), cpf = COALESCE($5, cpf), atualizado_em = NOW() WHERE id = $6 RETURNING id, nome, email, telefone, cpf, tipo, ativo', [nome, telefone, tipo, ativo, cpf, id]);
    if (r.rows.length === 0) return res.status(404).json({ erro: 'Membro nao encontrado' });
    res.json(r.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ erro: 'Erro ao atualizar membro' }); }
});

router.post('/excluir-multiplos', autenticar, somenteAdmin, async (req, res) => {
  const { ids, confirmado } = req.body;
  try {
    const resultado = await excluirMembros({ ids, confirmado, executor: req.usuario, ip: req.ip });
    // Fora da transacao, de proposito: o Railway ja confirmou.
    const auth = await removerContasDoAuth(resultado.authIds);
    res.json({ ...resultado, acessos_removidos: auth.removidas, acessos_com_falha: auth.falhas });
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    res.status(status).json({ erro: status < 500 ? err.message : 'Erro ao excluir membros.' });
  }
});

router.delete('/:id', autenticar, somenteAdmin, async (req, res) => {
  try {
    const resultado = await excluirMembro({ id: req.params.id, executor: req.usuario, ip: req.ip });
    const auth = await removerContasDoAuth(resultado.authIds);
    res.json({ ...resultado, acessos_removidos: auth.removidas, acessos_com_falha: auth.falhas });
  } catch (err) {
    const status = err.status ?? 500;
    if (status === 500) console.error(err);
    res.status(status).json({ erro: status < 500 ? err.message : 'Erro ao remover membro.' });
  }
});

module.exports = router;