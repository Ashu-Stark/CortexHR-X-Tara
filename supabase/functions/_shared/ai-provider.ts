// AI Provider Abstraction Layer
// Supports: Lovable AI (default), OpenAI, HuggingFace

export type AIProvider = 'openai' | 'huggingface' | 'google' | 'groq' | 'mistral';

// ... lines 6-23 ...

// Provider configurations
const PROVIDER_CONFIGS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')}`,
    }),
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-1.5-flash',
    getHeaders: () => ({
      'Content-Type': 'application/json',
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
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
    }),
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'mistral-large-latest',
    getHeaders: () => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('MISTRAL_API_KEY')}`,
    }),
  },
};
// ...
// Detect available provider based on configured API keys
export function getAvailableProvider(): AIProvider {
  // Priority: OpenAI > Google > Groq > Mistral > HuggingFace
  if (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')) {
    console.log('Using OpenAI provider');
    return 'openai';
  }
  if (Deno.env.get('GOOGLE_API_KEY')) {
    console.log('Using Google provider');
    return 'google';
  }
  if (Deno.env.get('GROQ_API_KEY')) {
    console.log('Using Groq provider');
    return 'groq';
  }
  if (Deno.env.get('MISTRAL_API_KEY')) {
    console.log('Using Mistral provider');
    return 'mistral';
  }
  if (Deno.env.get('HUGGINGFACE_API_KEY')) {
    console.log('Using HuggingFace provider');
    return 'huggingface';
  }

  throw new Error('No AI provider configured. Set GOOGLE_API_KEY or OPENAI_API_KEY.');
}

// Make completion request to the selected provider
// Make completion request with automatic fallback
export async function createCompletion(
  request: AICompletionRequest,
  preferredProvider?: AIProvider
): Promise<AICompletionResponse> {
  // Define provider priority
  const providers: AIProvider[] = [];

  // If a specific provider is requested, put it first
  if (preferredProvider) {
    providers.push(preferredProvider);
  } else {
    // Default priority: Google -> OpenAI -> HuggingFace
    if (Deno.env.get('GOOGLE_API_KEY')) providers.push('google');
    if (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')) providers.push('openai');
    if (Deno.env.get('HUGGINGFACE_API_KEY')) providers.push('huggingface');
  }

  // Backup providers in case the primary/preferred one fails (uniq)
  const backups: AIProvider[] = [];
  if (Deno.env.get('GOOGLE_API_KEY')) backups.push('google');
  if (Deno.env.get('OPENAI_API_KEY') || Deno.env.get('openAI')) backups.push('openai');
  if (Deno.env.get('HUGGINGFACE_API_KEY')) backups.push('huggingface');

  for (const backup of backups) {
    if (!providers.includes(backup)) providers.push(backup);
  }

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set GOOGLE_API_KEY, OPENAI_API_KEY, or HUGGINGFACE_API_KEY.');
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    console.log(`Attempting AI completion with provider: ${provider}`);
    try {
      const config = PROVIDER_CONFIGS[provider];
      if (!config) throw new Error(`Unknown provider config: ${provider}`);

      const model = request.model || config.defaultModel;

      if (provider === 'google') {
        return await createGoogleCompletion(request, model);
      } else if (provider === 'groq') {
        return await createGroqCompletion(request, model);
      } else if (provider === 'huggingface') {
        return await createHuggingFaceCompletion(request, model);
      } else {
        // OpenAI compatible
        const body: Record<string, unknown> = {
          model,
          messages: request.messages,
        };

        if (request.temperature !== undefined) body.temperature = request.temperature;
        if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

        const response = await fetch(config.baseUrl, {
          method: 'POST',
          headers: config.getHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Should we fallback on 429/402? Yes.
          throw new Error(`${provider} API failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) throw new Error('No content received from AI provider');

        return { content, provider, model };
      }

    } catch (error: any) {
      console.error(`${provider} failed: ${error.message}. Trying next provider...`);
      lastError = error;
      continue; // Try next provider
    }
  }

  throw lastError || new Error('All AI providers failed.');
}

// Google Gemini API adapter with Key Rotation
async function createGoogleCompletion(
  request: AICompletionRequest,
  model: string
): Promise<AICompletionResponse> {
  const config = PROVIDER_CONFIGS.google;
  const envKeys = Deno.env.get('GOOGLE_API_KEY') || "";
  const apiKeys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (apiKeys.length === 0) {
    throw new Error('GOOGLE_API_KEY is not set');
  }

  let lastError: Error | null = null;

  // Convert OpenAI messages to Gemini format once
  const systemMessage = request.messages.find(m => m.role === 'system');
  const otherMessages = request.messages.filter(m => m.role !== 'system');
  const contents = otherMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const bodyData: any = { contents };
  if (systemMessage) {
    bodyData.system_instruction = { parts: [{ text: systemMessage.content }] };
  }
  if (request.temperature !== undefined || request.maxTokens !== undefined) {
    bodyData.generationConfig = {};
    if (request.temperature !== undefined) bodyData.generationConfig.temperature = request.temperature;
    if (request.maxTokens !== undefined) bodyData.generationConfig.maxOutputTokens = request.maxTokens;
  }

  // Try each key
  for (const apiKey of apiKeys) {
    try {
      // Clean model name just in case
      const cleanModel = model.replace('models/', '');
      const url = `${config.baseUrl}/${cleanModel}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: config.getHeaders(),
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        // If 429 (Rate Limit) or 403 (Quota), try next key. 
        // If 400 (Bad Request), it's likely the request itself, but we can retry to be safe unless we distinguish.
        // For simplicity, we treat 4xx/5xx as "try next key" except maybe 400 if we were sure.
        throw new Error(`Status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) throw new Error('No content received from Google API');

      return {
        content,
        provider: 'google',
        model,
      };

    } catch (error: any) {
      console.warn(`Google Key ${apiKey.substr(0, 5)}... failed: ${error.message}`);
      lastError = error;
      // Continue to next key
    }
  }

  throw lastError || new Error('All Google API keys failed.');
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

// Groq API adapter with Key Rotation
async function createGroqCompletion(
  request: AICompletionRequest,
  model: string
): Promise<AICompletionResponse> {
  const config = PROVIDER_CONFIGS.groq;
  const envKeys = Deno.env.get('GROQ_API_KEY') || "";
  const apiKeys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (apiKeys.length === 0) {
    throw new Error('GROQ_API_KEY is not set');
  }

  let lastError: Error | null = null;
  const body: Record<string, unknown> = {
    model,
    messages: request.messages,
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

  // Try each key
  for (const apiKey of apiKeys) {
    try {
      const response = await fetch(config.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) throw new Error('No content received from Groq API');

      return {
        content,
        provider: 'groq',
        model,
      };

    } catch (error: any) {
      console.warn(`Groq Key ${apiKey.substr(0, 5)}... failed: ${error.message}`);
      lastError = error;
      // Continue to next key
    }
  }

  throw lastError || new Error('All Groq API keys failed.');
}

// Parse JSON from AI response (handles markdown code blocks)
export function parseAIJSON<T>(content: string): T {
  const cleanedText = content.replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleanedText) as T;
}
