/**
 * searchService.js
 * ----------------------------------------------------------------------------
 * Camada única de integração da Pesquisa Global do Sistema Noah.
 *
 * Fluxo: SearchService -> tenta CommandEngine primeiro -> se null,
 * cai para SearchEngine (busca textual).
 *
 * Nesta versão (Fase 1), o CommandEngine sempre retorna null, então todo
 * texto passa pelo SearchEngine. A estrutura já está pronta para quando
 * os comandos forem implementados, sem precisar mudar este arquivo.
 * ----------------------------------------------------------------------------
 */

const pool = require('../config/db');
const searchEngine = require('./search/searchEngine');
const commandEngine = require('./search/commandEngine');

const searchService = {
  /**
   * Executa a Pesquisa Global.
   * @param {string} termo - texto digitado pelo usuário
   * @returns {Promise<{ tipo: string, comando: object|null, resultados: Array }>}
   */
  async pesquisar(termo) {
    const comando = commandEngine.interpretar(termo);

    if (comando) {
      // Fase futura: quando o CommandEngine estiver ativo, retorna o comando
      // reconhecido em vez de rodar a busca textual.
      return { tipo: 'comando', comando, resultados: [] };
    }

    const resultados = await searchEngine.buscar(pool, termo);
    return { tipo: 'busca', comando: null, resultados };
  },
};

module.exports = searchService;