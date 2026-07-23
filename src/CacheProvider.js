/**
 * CacheProvider.js
 *
 * Interface de cache. Quem consome (ex: biAggregatorService) só
 * conhece os métodos get/set/clear — nunca a implementação real.
 *
 * Hoje: MemoryCacheProvider (Map em memória com TTL).
 * Futuro: trocar apenas o `require` abaixo por um RedisCacheProvider
 * que implemente a mesma interface — nenhum outro arquivo muda.
 *
 * Interface esperada por qualquer implementação:
 *   async get(chave)              -> valor | null
 *   async set(chave, valor, ttlMs) -> void
 *   async clear(chave)            -> void
 */
const MemoryCacheProvider = require('./MemoryCacheProvider');

let instancia = null;

/**
 * Retorna a instância singleton do provider de cache configurado.
 * @returns {{get: Function, set: Function, clear: Function}}
 */
function obterCacheProvider() {
  if (!instancia) {
    instancia = new MemoryCacheProvider();
  }
  return instancia;
}

module.exports = { obterCacheProvider };
