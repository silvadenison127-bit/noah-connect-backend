/**
 * commandEngine.js
 * ----------------------------------------------------------------------------
 * Motor de comandos em linguagem natural da Pesquisa Global.
 *
 * STATUS: estrutura preparada, SEM lógica implementada nesta versão (Fase 1).
 * Existe para que o SearchService já tenha o ponto de extensão certo, sem
 * precisar de refatoração quando os comandos forem implementados.
 *
 * Exemplos de comandos que serão suportados no futuro (documentado, não ativo):
 *   "abrir membros"        -> navega direto para /membros
 *   "abrir financeiro"     -> navega direto para /financeiro
 *   "novo evento"          -> abre o formulário de criação de evento
 *   "abrir membro João"    -> navega para o perfil do João
 *   "mostrar pedidos de oração" -> navega para /oracao
 *
 * Contrato de retorno quando ativo (a definir na implementação futura):
 *   { tipo: 'navegacao' | 'acao', rota?: string, acao?: string, parametros?: object }
 *   ou null quando o texto não corresponde a nenhum comando reconhecido.
 * ----------------------------------------------------------------------------
 */

const commandEngine = {
  /**
   * Tenta interpretar o texto como um comando.
   * Nesta versão, SEMPRE retorna null (nenhum comando implementado ainda) —
   * o SearchService cai automaticamente para a busca textual (SearchEngine).
   *
   * @param {string} texto - texto digitado pelo usuário
   * @returns {object|null} comando reconhecido, ou null
   */
  interpretar(texto) {
    // Fase 1: nenhum comando ativo. Retorna null propositalmente.
    return null;
  },
};

module.exports = commandEngine;