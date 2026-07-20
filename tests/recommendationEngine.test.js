/**
 * recommendationEngine.test.js
 * Requer Jest instalado (`npm install --save-dev jest`).
 */
const { gerarRecomendacoes } = require('../src/engines/recommendationEngine');

const alertaBase = {
  id: 'celula_sem_lider_123',
  categoria: 'Células',
  titulo: 'Células sem líder definido',
  descricao: '1 célula(s) sem líder definido.',
  exemplos: ['Célula Vila Nova'],
  severidade: 'CRITICAL',
  prioridade: 1,
  origem: 'alertEngine',
  dataCriacao: '2026-07-20T00:00:00.000Z',
  status: 'ativo',
  acaoSugerida: 'Agendar reunião para definir um líder responsável pela célula.',
};

describe('recommendationEngine', () => {
  test('retorna lista vazia quando não há alertas', () => {
    expect(gerarRecomendacoes([])).toEqual([]);
    expect(gerarRecomendacoes(null)).toEqual([]);
  });

  test('gera recomendação completa a partir de um alerta CRITICAL', () => {
    const [rec] = gerarRecomendacoes([alertaBase]);

    expect(rec.alertaOrigemId).toBe('celula_sem_lider_123');
    expect(rec.motivo).toBe(alertaBase.descricao);
    expect(rec.acaoRecomendada).toBe(alertaBase.acaoSugerida);
    expect(rec.areaResponsavel).toBe('Coordenação de Células');
    expect(rec.impacto).toContain('Alto');
    expect(rec.prioridade).toBe(1);
  });

  test('ordena recomendações por prioridade (CRITICAL antes de WARNING)', () => {
    const alertaWarning = { ...alertaBase, id: 'a2', severidade: 'WARNING', categoria: 'Financeiro' };
    const alertaCritical = { ...alertaBase, id: 'a1' };

    const recomendacoes = gerarRecomendacoes([alertaWarning, alertaCritical]);

    expect(recomendacoes[0].alertaOrigemId).toBe('a1'); // CRITICAL primeiro
    expect(recomendacoes[1].alertaOrigemId).toBe('a2');
  });

  test('ignora alertas sem acaoSugerida', () => {
    const alertaSemAcao = { ...alertaBase, acaoSugerida: null };
    expect(gerarRecomendacoes([alertaSemAcao])).toEqual([]);
  });

  test('usa valores padrão para categoria não mapeada', () => {
    const alertaCategoriaNova = { ...alertaBase, categoria: 'Categoria Inexistente' };
    const [rec] = gerarRecomendacoes([alertaCategoriaNova]);
    expect(rec.areaResponsavel).toBe('Liderança Geral');
  });
});
