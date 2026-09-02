/**
 * searchService.js
 * ----------------------------------------------------------------------------
 * Camada unica de integracao da Pesquisa Global do Sistema Noah.
 *
 * Fluxo: SearchService -> tenta CommandEngine primeiro -> se null,
 * cai para SearchEngine (busca textual).
 *
 * Nesta versao (Fase 1), o CommandEngine sempre retorna null, entao todo
 * texto passa pelo SearchEngine. A estrutura ja esta pronta para quando
 * os comandos forem implementados, sem precisar mudar este arquivo.
 *
 * O usuario autenticado atravessa esta camada sem ser interpretado: quem
 * decide o que pode ser consultado e o SearchEngine, que conhece os
 * providers. Aqui ele apenas nao se perde no caminho.
 * ----------------------------------------------------------------------------
 */
const pool = require('../config/db');
const searchEngine = require('./search/searchEngine');
const commandEngine = require('./search/commandEngine');

const searchService = {
  /**
   * Executa a Pesquisa Global.
   * @param {string} termo - texto digitado pelo usuario
   * @param {object} usuario - req.usuario ({ id, nome, tipo })
   * @returns {Promise<{ tipo: string, comando: object|null, resultados: Array }>}
   */
  async pesquisar(termo, usuario) {
    const comando = commandEngine.interpretar(termo);

    if (comando) {
      // Fase futura: quando o CommandEngine estiver ativo, retorna o comando
      // reconhecido em vez de rodar a busca textual.
      return { tipo: 'comando', comando, resultados: [] };
    }

    const resultados = await searchEngine.buscar(pool, termo, usuario);
    return { tipo: 'busca', comando: null, resultados };
  },
};

module.exports = searchService;