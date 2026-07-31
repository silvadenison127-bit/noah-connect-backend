/**
 * anthropicService.js
 *
 * Ponto de integracao com a API da Anthropic (Claude). Enquanto a
 * variavel de ambiente ANTHROPIC_API_KEY nao estiver configurada, este
 * servico funciona em "modo demonstracao", devolvendo respostas
 * simuladas coerentes com o contexto recebido, sem quebrar o fluxo do
 * restante da aplicacao.
 *
 * Quando a chave for adicionada ao .env (local) ou as variaveis de
 * ambiente do Railway (producao), o servico passa a chamar a API real
 * automaticamente, sem necessidade de alterar rotas ou o frontend.
 */

const MODELO_PADRAO = 'claude-sonnet-4-5';

function chaveConfigurada() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function respostaSimulada(pergunta, contexto) {
  const resumo = contexto?.resumoTextual || 'os dados disponiveis da igreja';
  return {
    modo: 'demonstracao',
    resposta: `Modo demonstracao: ainda nao ha uma chave da Anthropic configurada. ` +
      `Quando configurada, a IA Noah respondera "${pergunta}" com base em ${resumo}. ` +
      `Esta e uma resposta simulada apenas para fins de visualizacao da interface.`,
  };
}

async function perguntar({ pergunta, contexto, historico = [] }) {
  if (!chaveConfigurada()) {
    return respostaSimulada(pergunta, contexto);
  }

  // Ponto de integracao real - ativado automaticamente quando
  // ANTHROPIC_API_KEY estiver definida no ambiente.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const mensagens = [
    ...historico.map((h) => ({ role: h.autor === 'usuario' ? 'user' : 'assistant', content: h.texto })),
    { role: 'user', content: pergunta },
  ];

  const systemPrompt = `Voce e a IA Noah, assistente de dados da Igreja Noah. ` +
    `Responda em portugues, de forma objetiva e acolhedora, usando apenas os dados fornecidos no contexto abaixo. ` +
    `Se a informacao nao estiver no contexto, diga que nao possui esse dado ainda, sem inventar numeros.\n\n` +
    `Contexto de dados atual:\n${JSON.stringify(contexto, null, 2)}`;

  const resposta = await client.messages.create({
    model: MODELO_PADRAO,
    max_tokens: 1024,
    system: systemPrompt,
    messages: mensagens,
  });

  const texto = resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n');

  return { modo: 'real', resposta: texto };
}

module.exports = { perguntar, chaveConfigurada };