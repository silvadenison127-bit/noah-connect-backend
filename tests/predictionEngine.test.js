/**
 * predictionEngine.test.js
 * Requer Jest instalado (`npm install --save-dev jest`).
 */
const { gerarPrevisoes } = require('../src/engines/predictionEngine');

describe('predictionEngine', () => {
  test('retorna "dados insuficientes" quando a tabela de histórico não existe', async () => {
    const pool = {
      query: jest.fn(() => Promise.reject(new Error('relation "historico_metricas" does not exist'))),
    };

    const previsoes = await gerarPrevisoes(pool);

    expect(previsoes.length).toBeGreaterThan(0);
    previsoes.forEach((p) => {
      expect(p.suficiente).toBe(false);
      expect(p.mensagem).toBe('Dados históricos insuficientes para gerar previsão.');
      Object.values(p.horizontes).forEach((valor) => expect(valor).toBeNull());
    });
  });

  test('nunca inventa valores mesmo com histórico abaixo do mínimo', async () => {
    const pool = {
      query: jest.fn(() => Promise.resolve({ rows: [{ total: '10' }] })), // abaixo do mínimo (90)
    };

    const previsoes = await gerarPrevisoes(pool);

    previsoes.forEach((p) => {
      expect(p.suficiente).toBe(false);
      expect(p.totalRegistrosHistorico).toBe(10);
    });
  });

  test('reconhece histórico suficiente sem gerar previsão fictícia (modelo ainda não implementado)', async () => {
    const pool = {
      query: jest.fn(() => Promise.resolve({ rows: [{ total: '120' }] })), // acima do mínimo (90)
    };

    const previsoes = await gerarPrevisoes(pool);

    previsoes.forEach((p) => {
      expect(p.suficiente).toBe(true);
      expect(p.mensagem).toContain('modelo estatístico de previsão ainda não foi implementado');
      // mesmo com histórico suficiente, nenhum horizonte deve ter valor
      // numérico enquanto o ForecastEngine não existir
      Object.values(p.horizontes).forEach((valor) => expect(valor).toBeNull());
    });
  });

  test('cobre as métricas configuradas (membros, dizimos, batismos, visitantes)', async () => {
    const pool = { query: jest.fn(() => Promise.reject(new Error('sem tabela'))) };
    const previsoes = await gerarPrevisoes(pool);
    const metricas = previsoes.map((p) => p.metrica);
    expect(metricas).toEqual(expect.arrayContaining(['membros', 'dizimos', 'batismos', 'visitantes']));
  });
});
