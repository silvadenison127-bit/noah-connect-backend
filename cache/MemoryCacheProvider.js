/**
 * MemoryCacheProvider.js
 *
 * Implementação concreta de cache em memória (Map + TTL). Só é
 * consumida através de CacheProvider.js — nenhum outro arquivo deve
 * importar esta classe diretamente, para que a troca futura por
 * Redis não exija alterar quem usa o cache.
 */
class MemoryCacheProvider {
  constructor() {
    this.dados = new Map(); // chave -> { valor, expiraEm }
  }

  async get(chave) {
    const entrada = this.dados.get(chave);
    if (!entrada) return null;
    if (Date.now() > entrada.expiraEm) {
      this.dados.delete(chave);
      return null;
    }
    return entrada.valor;
  }

  async set(chave, valor, ttlMs = 60000) {
    this.dados.set(chave, { valor, expiraEm: Date.now() + ttlMs });
  }

  async clear(chave) {
    if (chave) {
      this.dados.delete(chave);
    } else {
      this.dados.clear();
    }
  }
}

module.exports = MemoryCacheProvider;
