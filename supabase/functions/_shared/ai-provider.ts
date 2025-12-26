// AI Provider Abstraction Layer
// Supports: Aiapi AI (default), OpenAI, HuggingFace

export type AIProvider = 'aiapi' | 'openai' | 'huggingface';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AICompletionResponse {
  content: string;
  provider: AIProvider;
  model: string;
}

// Provider configurations
const PROVIDER_CONFIGS = {
  aiapi: {
    baseUrl: 'https://ai.gateway.aiapi.dev/v1/chat/completions',
    defaultModel: 'google/gemini-2.5-flash',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('AIAPI_API_KEY')}`,
    }),
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
    }),
  },
  huggingface: {
    baseUrl: 'https://api-inference.huggingface.co/models',
    defaultModel: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_KEY')}`,
    }),
  },
};

// Detect available provider based on configured API keys
export function getAvailableProvider(): AIProvider {
  // Priority: OpenAI > HuggingFace > Aiapi (fallback)
  if (Deno.env.get('OPENAI_API_KEY')) {
    console.log('Using OpenAI provider');
    return 'openai';
  }
  if (Deno.env.get('HUGGINGFACE_API_KEY')) {
    console.log('Using HuggingFace provider');
    return 'huggingface';
  }
  if (Deno.env.get('AIAPI_API_KEY')) {
    console.log('Using Aiapi AI provider');
    return 'aiapi';
  }
  throw new Error('No AI provider configured. Set AIAPI_API_KEY, OPENAI_API_KEY, or HUGGINGFACE_API_KEY.');
}

// Make completion request to the selected provider
export async function createCompletion(
  request: AICompletionRequest,
  provider?: AIProvider
): Promise<AICompletionResponse> {
  const selectedProvider = provider || getAvailableProvider();
  const config = PROVIDER_CONFIGS[selectedProvider];

  if (!config) {
    throw new Error(`Unknown AI provider: ${selectedProvider}`);
  }

  const model = request.model || config.defaultModel;

  if (selectedProvider === 'huggingface') {
    return await createHuggingFaceCompletion(request, model);
  }

  // OpenAI-compatible API (Aiapi AI and OpenAI)
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
  };

  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.maxTokens !== undefined) {
    body.max_tokens = request.maxTokens;
  }

  const response = await fetch(config.baseUrl, {
    method: 'POST',
    headers: config.getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`${selectedProvider} API error:`, errorText);

    // Handle rate limits
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('AI credits exhausted. Please add funds.');
    }

    throw new Error(`${selectedProvider} API failed: ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content received from AI provider');
  }

  return {
    content,
    provider: selectedProvider,
    model,
  };
}

// HuggingFace Inference API has a different format
async function createHuggingFaceCompletion(
  request: AICompletionRequest,
  model: string
): Promise<AICompletionResponse> {
  const config = PROVIDER_CONFIGS.huggingface;

  // Format messages for HuggingFace chat format
  const formattedPrompt = request.messages
    .map(m => {
      if (m.role === 'system') return `<s>[INST] <<SYS>>\n${m.content}\n<</SYS>>\n\n`;
      if (m.role === 'user') return `${m.content} [/INST]`;
      return `${m.content} </s><s>[INST] `;
    })
    .join('');

  const response = await fetch(`${config.baseUrl}/${model}`, {
    method: 'POST',
    headers: config.getHeaders(),
    body: JSON.stringify({
      inputs: formattedPrompt,
      parameters: {
        max_new_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.7,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('HuggingFace API error:', errorText);
    throw new Error(`HuggingFace API failed: ${errorText}`);
  }

  const data = await response.json();
  const content = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;

  if (!content) {
    throw new Error('No content received from HuggingFace');
  }

  return {
    content,
    provider: 'huggingface',
    model,
  };
}

// Parse JSON from AI response (handles markdown code blocks)
export function parseAIJSON<T>(content: string): T {
  const cleanedText = content.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleanedText) as T;
}
