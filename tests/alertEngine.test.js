/**
 * alertEngine.test.js
 * Requer Jest instalado (`npm install --save-dev jest`).
 */
const { gerarAlertas } = require('../src/engines/alertEngine');

function criarPoolMock(respostasPorQuery) {
  return {
    query: jest.fn((sql) => {
      const chave = Object.keys(respostasPorQuery).find((k) => sql.includes(k));
      if (!chave) return Promise.resolve({ rows: [] });
      const resposta = respostasPorQuery[chave];
      if (resposta instanceof Error) return Promise.reject(resposta);
      return Promise.resolve({ rows: resposta });
    }),
  };
}

describe('alertEngine', () => {
  test('dispara alerta de célula sem líder quando há células com lider_id nulo', async () => {
    const pool = criarPoolMock({
      'FROM usuarios': [],
      'FROM celulas c\n     WHERE NOT EXISTS': [],
      'FROM celulas WHERE lider_id IS NULL': [{ nome: 'Célula Vila Nova' }],
      'FROM ministerios': [],
      'dizimos_ofertas': [{ entradas: '100', saidas: '50' }],
    });

    const alertas = await gerarAlertas(pool);
    const alertaCelula = alertas.find((a) => a.categoria === 'Células' && a.severidade === 'CRITICAL');

    expect(alertaCelula).toBeDefined();
    expect(alertaCelula.descricao).toContain('1 célula(s) sem líder');
    expect(alertaCelula.status).toBe('ativo');
  });

  test('dispara alerta financeiro quando saídas superam entradas', async () => {
    const pool = criarPoolMock({
      'FROM usuarios': [],
      'FROM celulas': [],
      'FROM ministerios': [],
      'dizimos_ofertas': [{ entradas: '100', saidas: '300' }],
    });

    const alertas = await gerarAlertas(pool);
    const alertaFinanceiro = alertas.find((a) => a.categoria === 'Financeiro');

    expect(alertaFinanceiro).toBeDefined();
    expect(alertaFinanceiro.severidade).toBe('CRITICAL');
  });

  test('não gera alerta nenhum quando tudo está saudável', async () => {
    const pool = criarPoolMock({
      'FROM usuarios': [],
      'FROM celulas': [],
      'FROM ministerios': [],
      'dizimos_ofertas': [{ entradas: '300', saidas: '100' }],
    });

    const alertas = await gerarAlertas(pool);
    expect(alertas).toEqual([]);
  });

  test('uma regra com erro de query não impede as demais de funcionar', async () => {
    const pool = {
      query: jest.fn((sql) => {
        if (sql.includes('celulas WHERE lider_id')) {
          return Promise.reject(new Error('relation "celulas" does not exist'));
        }
        if (sql.includes('dizimos_ofertas')) {
          return Promise.resolve({ rows: [{ entradas: '100', saidas: '300' }] });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    const alertas = await gerarAlertas(pool);
    const alertaFinanceiro = alertas.find((a) => a.categoria === 'Financeiro');
    expect(alertaFinanceiro).toBeDefined();
  });
});
