// ai.js — toda a comunicação com a API da Anthropic vive aqui.
// Chamada feita direto do navegador (fetch), por isso o header especial
// "anthropic-dangerous-direct-browser-access: true" é obrigatório.
// A chave de API NUNCA é gravada em arquivo algum: fica só no localStorage,
// lida em tempo real de store.js (config.apiKey).

import { getConfig } from './store.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export const SYSTEM_PROMPT = `Você é um nutricionista brasileiro experiente, especializado em estimar porções e calcular calorias e macronutrientes de refeições a partir de fotos e/ou descrições em texto.

Regras obrigatórias:
1. Responda sempre em português do Brasil, em tom claro e direto.
2. Use a TABELA BRASILEIRA DE COMPOSIÇÃO DE ALIMENTOS (TACO) como referência principal para valores nutricionais por 100 g.
3. Para cada alimento identificado, detalhe: nome do alimento, porção estimada em gramas, calorias (kcal), proteína (g), carboidrato (g) e gordura (g).
4. Se um alimento não constar na TACO (ex.: produto industrializado, prato muito específico), use a informação nutricional mais confiável disponível, e marque esse item como estimado.
5. Se o usuário corrigir uma porção ou um alimento, recalcule tudo e responda de novo com a lista e os totais atualizados.
6. Sempre que possível, prefira valores da TACO; quando usar outra fonte, diga isso de forma breve no texto.

Formato da resposta (sempre, em toda resposta sua):
Primeiro, escreva um texto curto em português, alimento por alimento, explicando a estimativa (porção, kcal, macros e se é TACO ou estimado).
Depois, ao final da mensagem, inclua um bloco de código JSON cercado por \`\`\`json e \`\`\` com exatamente este formato:

{
  "items": [
    { "name": "string", "grams": number, "kcal": number, "protein": number, "carbs": number, "fat": number, "source": "taco" ou "estimado" }
  ],
  "totals": { "kcal": number, "protein": number, "carbs": number, "fat": number }
}

Não inclua nenhum outro texto depois do bloco JSON. Os números devem ser números (não strings), arredondados de forma razoável. Nunca omita o bloco JSON, mesmo que o usuário só esteja conversando ou corrigindo algo pequeno.`;

/** Erros conhecidos, para mensagens amigáveis na interface. */
export class AIError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // 'no-key' | 'offline' | 'http' | 'format'
  }
}

/**
 * Envia a conversa (histórico + nova mensagem) para a API e devolve
 * { text, structured } onde `text` é o texto a mostrar no chat (sem o bloco JSON)
 * e `structured` é o objeto { items, totals } já parseado (ou null se não veio / veio inválido).
 *
 * @param {Array<{role:'user'|'assistant', content: any}>} messages histórico completo da conversa
 */
export async function askFoodAnalysis(messages) {
  const { apiKey, apiModel } = getConfig();

  if (!apiKey) {
    throw new AIError('Nenhuma chave de API configurada. Vá em Configurações e cole sua chave da Anthropic.', 'no-key');
  }
  if (!navigator.onLine) {
    throw new AIError('Sem conexão com a internet. O chat de IA precisa estar online; o resto do app funciona offline.', 'offline');
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: apiModel || 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
  } catch (err) {
    throw new AIError('Falha de rede ao chamar a IA. Verifique sua conexão e tente de novo.', 'offline');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || '';
    } catch {
      /* ignore */
    }
    if (response.status === 401) {
      throw new AIError('Chave de API inválida ou expirada. Confira em Configurações.', 'no-key');
    }
    if (response.status === 429) {
      throw new AIError('Limite de uso da API atingido no momento. Tente novamente em instantes.', 'http');
    }
    throw new AIError(`A API respondeu com erro (${response.status}). ${detail}`.trim(), 'http');
  }

  const data = await response.json();
  const textBlocks = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const fullText = textBlocks.join('\n').trim();

  return parseAIResponse(fullText);
}

/** Extrai o bloco ```json ... ``` do texto e separa do texto "de leitura". */
export function parseAIResponse(fullText) {
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/i);
  let structured = null;
  let text = fullText;

  if (jsonMatch) {
    text = fullText.slice(0, jsonMatch.index).trim();
    try {
      structured = JSON.parse(jsonMatch[1]);
      structured = normalizeStructured(structured);
    } catch (err) {
      structured = null; // formato inválido — avisamos na UI, mas mostramos o texto normalmente
    }
  }

  return { text: text || fullText, structured, raw: fullText };
}

function normalizeStructured(obj) {
  if (!obj || !Array.isArray(obj.items)) return null;
  const items = obj.items.map((it) => ({
    name: String(it.name ?? 'Alimento'),
    grams: Number(it.grams) || 0,
    kcal: Number(it.kcal) || 0,
    protein: Number(it.protein) || 0,
    carbs: Number(it.carbs) || 0,
    fat: Number(it.fat) || 0,
    source: it.source === 'taco' ? 'taco' : 'estimado',
  }));
  const totals = obj.totals && typeof obj.totals === 'object'
    ? {
        kcal: Number(obj.totals.kcal) || items.reduce((s, i) => s + i.kcal, 0),
        protein: Number(obj.totals.protein) || items.reduce((s, i) => s + i.protein, 0),
        carbs: Number(obj.totals.carbs) || items.reduce((s, i) => s + i.carbs, 0),
        fat: Number(obj.totals.fat) || items.reduce((s, i) => s + i.fat, 0),
      }
    : {
        kcal: items.reduce((s, i) => s + i.kcal, 0),
        protein: items.reduce((s, i) => s + i.protein, 0),
        carbs: items.reduce((s, i) => s + i.carbs, 0),
        fat: items.reduce((s, i) => s + i.fat, 0),
      };
  return { items, totals };
}

/** Monta o conteúdo de uma mensagem de usuário com texto opcional + imagem opcional (base64). */
export function buildUserContent({ text, image }) {
  const content = [];
  if (image) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    });
  }
  content.push({ type: 'text', text: text || 'Analise esta refeição.' });
  return content;
}
