/**
 * historicalMetricsEngine.test.js
 * Requer Jest instalado (`npm install --save-dev jest`).
 */
const { obterHistorico } = require('../src/engines/historicalMetricsEngine');

function criarPoolMock(linhasPorChamada) {
  let chamada = 0;
  return {
    query: jest.fn(() => {
      const linhas = linhasPorChamada[chamada] ?? [];
      chamada += 1;
      return Promise.resolve({ rows: linhas });
    }),
  };
}

describe('historicalMetricsEngine', () => {
  test('retorna série de membros, arrecadação e frequência quando as queries funcionam', async () => {
    const pool = criarPoolMock([
      [{ periodo: '2026-06', valor: '5' }, { periodo: '2026-07', valor: '7' }], // membros
      [{ periodo: '2026-06', valor: '100.00' }, { periodo: '2026-07', valor: '320.00' }], // arrecadacao
      [{ periodo: '2026-06', valor: '2' }, { periodo: '2026-07', valor: '0' }], // frequencia
    ]);

    const historico = await obterHistorico(pool, 2);

    expect(historico.membros.disponivel).toBe(true);
    expect(historico.membros.serie).toEqual([
      { periodo: '2026-06', valor: 5 },
      { periodo: '2026-07', valor: 7 },
    ]);
    expect(historico.arrecadacao.serie[1].valor).toBe(320);
    expect(historico.frequencia.disponivel).toBe(true);
  });

  test('marca métricas indisponíveis (visitantes, batismos) com motivo, sem inventar dado', async () => {
    const pool = criarPoolMock([[], [], []]);
    const historico = await obterHistorico(pool, 1);

    expect(historico.visitantes.disponivel).toBe(false);
    expect(historico.visitantes.serie).toEqual([]);
    expect(typeof historico.visitantes.motivo).toBe('string');

    expect(historico.batismos.disponivel).toBe(false);
  });

  test('uma métrica com erro de query não derruba as demais', async () => {
    const pool = {
      query: jest.fn()
        .mockRejectedValueOnce(new Error('relation "usuarios" does not exist'))
        .mockResolvedValueOnce({ rows: [{ periodo: '2026-07', valor: '50' }] })
        .mockResolvedValueOnce({ rows: [{ periodo: '2026-07', valor: '1' }] }),
    };

    const historico = await obterHistorico(pool, 1);

    expect(historico.membros.disponivel).toBe(false);
    expect(historico.arrecadacao.disponivel).toBe(true);
    expect(historico.frequencia.disponivel).toBe(true);
  });
});
