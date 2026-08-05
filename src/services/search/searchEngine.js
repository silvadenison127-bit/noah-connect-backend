/**
 * searchEngine.js
 * ----------------------------------------------------------------------------
 * Motor de busca textual da Pesquisa Global do Sistema Noah.
 *
 * Responsabilidade única: disparar todos os providers em paralelo e agregar
 * os resultados. Não conhece HTTP, não conhece o CommandEngine.
 *
 * Para adicionar um módulo novo no futuro: criar o provider (mesmo contrato)
 * e registrá-lo no array PROVIDERS abaixo — nada mais muda.
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

// Módulos com provider real e ativo.
const PROVIDERS = [
  membrosProvider,
  celulasProvider,
  ministeriosProvider,
  cursosProvider,
  eventosProvider,
  pedidosOracaoProvider,
  noticiasProvider,
  comunicadosProvider,
  estudosBiblicosProvider,
  financeiroProvider,
];

// ── Módulos PLANEJADOS PARA VERSÕES FUTURAS (sem tabela hoje) ──────────────
// Congregações, Visitantes, Professores/Alunos (como entidades próprias),
// Logs, Backups, Permissões granulares.
// Quando as tabelas existirem, criar o provider correspondente e adicionar
// ao array PROVIDERS acima — nenhuma outra mudança será necessária.

const TERMO_MINIMO = 2; // evita busca em 1 caractere (ruído/performance)

const searchEngine = {
  /**
   * Executa a busca textual em todos os providers registrados.
   * @param {object} pool - conexão de banco
   * @param {string} termoBruto - texto digitado pelo usuário
   * @returns {Promise<Array>} resultados agregados, no contrato padronizado
   */
  async buscar(pool, termoBruto) {
    const termo = (termoBruto || '').trim();

    if (termo.length < TERMO_MINIMO) {
      return [];
    }

    const resultadosPorProvider = await Promise.all(
      PROVIDERS.map((provider) => provider(pool, termo))
    );

    // Achata em uma lista única, mantendo a ordem dos módulos.
    return resultadosPorProvider.flat();
  },
};

module.exports = searchEngine;