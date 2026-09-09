'use strict';

const { withTransaction } = require('../lib/db-transaction');
const { registrarAuditoria } = require('./auditoria.service');
const { supabaseAdmin } = require('../config/supabase');

const TABELAS_PESSOAIS = [
  { tabela: 'refresh_tokens',     coluna: 'usuario_id' },
  { tabela: 'comunicados_lidos',  coluna: 'usuario_id' },
  { tabela: 'presencas_culto',    coluna: 'usuario_id' },
  { tabela: 'inscricoes_cursos',  coluna: 'usuario_id' },
  { tabela: 'membros_celula',     coluna: 'usuario_id' },
  { tabela: 'membros_ministerio', coluna: 'usuario_id' },
  { tabela: 'pedidos_oracao',     coluna: 'usuario_id' },
];

const COLUNAS_DESVINCULAR = [
  { tabela: 'celulas',          coluna: 'lider_id'   },
  { tabela: 'ministerios',      coluna: 'lider_id'   },
  { tabela: 'comunicados',      coluna: 'criado_por' },
  { tabela: 'cursos',           coluna: 'criado_por' },
  { tabela: 'despesas',         coluna: 'criado_por' },
  { tabela: 'estudos_biblicos', coluna: 'criado_por' },
  { tabela: 'eventos',          coluna: 'criado_por' },
  { tabela: 'noticias',         coluna: 'autor_id'   },
  { tabela: 'turmas',           coluna: 'criado_por' },
  { tabela: 'dizimos_ofertas',  coluna: 'usuario_id' },
  { tabela: 'dizimos_ofertas',  coluna: 'criado_por' },
];

function sanitizarIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return [...new Set(ids.map((v) => String(v).trim()).filter(Boolean))];
}

async function coletarImpacto(client, idsLimpos) {
  const impacto = {};
  for (const { tabela, coluna } of TABELAS_PESSOAIS) {
    const r = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
      [idsLimpos]
    );
    impacto[tabela] = r.rows[0].total;
  }
  for (const { tabela, coluna } of COLUNAS_DESVINCULAR) {
    const chave = `${tabela}.${coluna}_desvinculados`;
    const r = await client.query(
      `SELECT COUNT(*)::int AS total FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
      [idsLimpos]
    );
    impacto[chave] = (impacto[chave] ?? 0) + r.rows[0].total;
  }
  return impacto;
}

/**
 * Remove as contas do Supabase Auth. Chamada por quem consome este servico,
 * SEMPRE depois de a transacao do Railway ter confirmado.
 *
 * A ordem importa. Se o Supabase falhar, sobra uma conta orfa no Auth: a pessoa
 * entraria no aplicativo mas nao existiria no painel -- ruim, porem detectavel
 * pelo log e corrigivel a mao. O inverso seria pior: o membro sumiria do
 * aplicativo e continuaria no painel, dando a falsa impressao de que ainda tem
 * acesso.
 *
 * Nao lanca. A exclusao no Railway ja foi confirmada, e reverter uma transacao
 * concluida seria pior do que registrar a inconsistencia.
 *
 * O CASCADE das chaves estrangeiras remove `profiles` e `members` sozinho.
 */
async function removerContasDoAuth(authIds) {
  if (!Array.isArray(authIds) || authIds.length === 0) {
    return { removidas: 0, falhas: [] };
  }

  if (!supabaseAdmin) {
    console.error(
      '[membros] Supabase nao configurado. Contas NAO removidas do Auth:',
      authIds.join(', ')
    );
    return { removidas: 0, falhas: authIds };
  }

  const falhas = [];
  let removidas = 0;

  for (const authId of authIds) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(authId);
      if (error) throw error;
      removidas += 1;
    } catch (err) {
      falhas.push(authId);
      console.error(
        `[membros] INCIDENTE: conta orfa no Supabase Auth apos exclusao no Railway: ${authId}`,
        err
      );
    }
  }

  return { removidas, falhas };
}

async function excluirMembros({ ids, confirmado, executor, ip }) {
  if (confirmado !== true) {
    const err = new Error('Confirmacao explicita obrigatoria.');
    err.status = 400;
    throw err;
  }
  const idsLimpos = sanitizarIds(ids);
  if (idsLimpos.length === 0) {
    const err = new Error('Nenhum ID valido informado.');
    err.status = 400;
    throw err;
  }
  if (idsLimpos.includes(String(executor.id))) {
    const err = new Error('Voce nao pode excluir o seu proprio usuario.');
    err.status = 403;
    throw err;
  }
  return await withTransaction(async (client) => {
    const adminsAlvo = await client.query(
      `SELECT id FROM usuarios WHERE tipo = 'admin' AND id::text = ANY($1::text[])`,
      [idsLimpos]
    );
    if (adminsAlvo.rows.length > 0) {
      const err = new Error('Nao e permitido excluir administradores.');
      err.status = 403;
      throw err;
    }
    const impacto = await coletarImpacto(client, idsLimpos);
    for (const { tabela, coluna } of COLUNAS_DESVINCULAR) {
      await client.query(
        `UPDATE "${tabela}" SET "${coluna}" = NULL WHERE "${coluna}"::text = ANY($1::text[])`,
        [idsLimpos]
      );
    }
    for (const { tabela, coluna } of TABELAS_PESSOAIS) {
      await client.query(
        `DELETE FROM "${tabela}" WHERE "${coluna}"::text = ANY($1::text[])`,
        [idsLimpos]
      );
    }
    // O `auth_user_id` e capturado aqui porque depois do DELETE a informacao
    // some -- e sem ela nao ha como remover a conta do aplicativo.
    const del = await client.query(
      `DELETE FROM usuarios WHERE id::text = ANY($1::text[]) RETURNING id, auth_user_id`,
      [idsLimpos]
    );
    const idsExcluidos = del.rows.map((r) => r.id);
    const authIds = del.rows.map((r) => r.auth_user_id).filter(Boolean);
    const auditoria_id = await registrarAuditoria(client, {
      executor_id:   executor.id,
      executor_nome: executor.nome,
      operacao:      'excluir_membros',
      ids_afetados:  idsExcluidos,
      impacto,
      resultado:     `${idsExcluidos.length} usuario(s) excluido(s)`,
      ip,
    });
    return { excluidos: idsExcluidos.length, ids: idsExcluidos, impacto, auditoria_id, authIds };
  });
}

async function excluirMembro({ id, executor, ip }) {
  return excluirMembros({ ids: [String(id)], confirmado: true, executor, ip });
}

module.exports = { excluirMembros, excluirMembro, removerContasDoAuth };