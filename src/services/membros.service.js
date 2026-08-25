'use strict';

const { withTransaction } = require('../lib/db-transaction');
const { registrarAuditoria } = require('./auditoria.service');

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
    const del = await client.query(
      `DELETE FROM usuarios WHERE id::text = ANY($1::text[]) RETURNING id`,
      [idsLimpos]
    );
    const idsExcluidos = del.rows.map((r) => r.id);
    const auditoria_id = await registrarAuditoria(client, {
      executor_id:   executor.id,
      executor_nome: executor.nome,
      operacao:      'excluir_membros',
      ids_afetados:  idsExcluidos,
      impacto,
      resultado:     `${idsExcluidos.length} usuario(s) excluido(s)`,
      ip,
    });
    return { excluidos: idsExcluidos.length, ids: idsExcluidos, impacto, auditoria_id };
  });
}

async function excluirMembro({ id, executor, ip }) {
  return excluirMembros({ ids: [String(id)], confirmado: true, executor, ip });
}

module.exports = { excluirMembros, excluirMembro };