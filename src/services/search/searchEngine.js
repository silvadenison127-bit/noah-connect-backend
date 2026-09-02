/**
 * searchEngine.js
 * ----------------------------------------------------------------------------
 * Motor de busca textual da Pesquisa Global do Sistema Noah.
 *
 * Responsabilidade unica: disparar os providers autorizados em paralelo e
 * agregar os resultados. Nao conhece HTTP, nao conhece o CommandEngine.
 *
 * AUTORIZACAO
 *
 * Estar autenticado nao e o mesmo que poder consultar tudo. Tres modulos
 * expoem informacao que so a administracao deve ver:
 *
 *   financeiro     valores de dizimos, ofertas, despesas, salarios
 *   membros        telefone e CPF de qualquer pessoa cadastrada
 *   pedidosOracao  pedidos de terceiros, inclusive os marcados como anonimos
 *
 * O filtro acontece ANTES do Promise.all: um provider bloqueado nao entra na
 * lista, entao sua query nunca chega ao banco. Esconder o resultado depois de
 * consultar seria proteger a tela, nao o dado.
 *
 * ESCOPO DO LIDER
 *
 * `celulas.lider_id` e `membros_celula` existem no schema e permitiriam um dia
 * liberar `membros` para o lider dentro da propria celula. Nao foi feito aqui:
 * nenhuma celula esta cadastrada, entao a relacao nunca foi exercitada e a
 * consulta retornaria vazio sem que se pudesse distinguir "sem escopo" de
 * "com defeito". Fica para quando houver celulas reais.
 *
 * Para adicionar um modulo novo no futuro: criar o provider (mesmo contrato) e
 * registra-lo em PROVIDERS abaixo, decidindo se ele e institucional ou restrito.
 * ----------------------------------------------------------------------------
 */

const membrosProvider = require('./providers/membrosProvider');
const celulasProvider = require('./providers/celulasProvider');
const ministeriosProvider = require('./providers/ministeriosProvider');
const cursosProvider = require('./providers/cursosProvider');
const eventosProvider = require('./providers/eventosProvider');
const pedidosOracaoProvider = require('./providers/pedidosOracaoProvider');
const noticiasProvider = require('./providers/noticiasProvider');
const comunicadosProvider = require('./providers/comunicadosProvider');
const estudosBiblicosProvider = require('./providers/estudosBiblicosProvider');
const financeiroProvider = require('./providers/financeiroProvider');

/**
 * Modulos com provider real e ativo.
 *
 * `restrito: true` significa que somente `admin` executa aquele provider.
 * O id existe para tornar a regra legivel em log e em revisao de codigo.
 */
const PROVIDERS = [
  { id: 'membros', executar: membrosProvider, restrito: true },
  { id: 'celulas', executar: celulasProvider, restrito: false },
  { id: 'ministerios', executar: ministeriosProvider, restrito: false },
  { id: 'cursos', executar: cursosProvider, restrito: false },
  { id: 'eventos', executar: eventosProvider, restrito: false },
  { id: 'pedidosOracao', executar: pedidosOracaoProvider, restrito: true },
  { id: 'noticias', executar: noticiasProvider, restrito: false },
  { id: 'comunicados', executar: comunicadosProvider, restrito: false },
  { id: 'estudosBiblicos', executar: estudosBiblicosProvider, restrito: false },
  { id: 'financeiro', executar: financeiroProvider, restrito: true },
];

// ── MODULOS PLANEJADOS PARA VERSOES FUTURAS (sem tabela hoje) ────────────────
// Congregacoes, Visitantes, Professores/Alunos (como entidades proprias),
// Logs, Backups, Permissoes granulares.
// Quando as tabelas existirem, criar o provider correspondente e adicionar
// ao array PROVIDERS acima — nenhuma outra mudanca sera necessaria.

const TERMO_MINIMO = 2; // evita busca em 1 caractere (ruido/performance)

/**
 * Decide quais providers podem rodar para este usuario.
 *
 * Fecha por padrao: sem usuario ou sem papel reconhecido, so os
 * institucionais entram. Um token malformado nao vira acesso ampliado.
 */
function providersAutorizados(usuario) {
  const ehAdmin = usuario?.tipo === 'admin';
  return PROVIDERS.filter((p) => !p.restrito || ehAdmin);
}

const searchEngine = {
  /**
   * Executa a busca textual nos providers autorizados para o usuario.
   * @param {object} pool - conexao de banco
   * @param {string} termoBruto - texto digitado pelo usuario
   * @param {object} usuario - { id, nome, tipo } vindo do JWT
   * @returns {Promise<Array>} resultados agregados, no contrato padronizado
   */
  async buscar(pool, termoBruto, usuario) {
    const termo = (termoBruto || '').trim();

    if (termo.length < TERMO_MINIMO) {
      return [];
    }

    const permitidos = providersAutorizados(usuario);

    const resultadosPorProvider = await Promise.all(
      permitidos.map((p) => p.executar(pool, termo))
    );

    // Achata em uma lista unica, mantendo a ordem dos modulos.
    return resultadosPorProvider.flat();
  },
};

module.exports = searchEngine;
module.exports.PROVIDERS = PROVIDERS;
module.exports.providersAutorizados = providersAutorizados;