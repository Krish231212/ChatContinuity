/**
 * ChatContinuity - OpenAI Client
 */

import { getSettings } from './storage.js';
import { logger } from './utils.js';

/**
 * Calls the OpenAI Chat Completion API.
 * @param {Array<{role: string, content: string}>} messages 
 * @param {string} systemPrompt 
 * @param {Object} options Override settings parameters (model, max_tokens, temperature)
 * @returns {Promise<string>} Content of the response message
 */
export async function callOpenAI(messages, systemPrompt = '', options = {}) {
  const settings = await getSettings();
  const apiKey = options.apiKey || settings.apiKey;
  const model = options.model || settings.model || 'gpt-4o';
  const apiBase = options.apiBaseUrl || settings.apiBaseUrl || 'https://api.openai.com/v1';

  if (!apiKey) {
    throw new Error('API key is missing. Please configure it in the ChatContinuity options page.');
  }

  const payloadMessages = [];
  if (systemPrompt) {
    payloadMessages.push({ role: 'system', content: systemPrompt });
  }
  payloadMessages.push(...messages);

  const lowerModel = model.toLowerCase();

  const requestBody = {
    model: model,
    messages: payloadMessages,
    temperature: options.temperature !== undefined ? options.temperature : 0.2
  };

  if (options.max_tokens !== undefined) {
    requestBody.max_tokens = options.max_tokens;
  } else if (!lowerModel.includes('gemini')) {
    requestBody.max_tokens = 1500;
  }

  // Enforce JSON mode for models that support it, unless explicitly skipped (e.g. test connection)
  if (
    !options.skipJsonMode &&
    (lowerModel.includes('gpt-4o') || 
    lowerModel.includes('gpt-4-turbo') || 
    lowerModel.includes('gemini') || 
    lowerModel.includes('json'))
  ) {
    requestBody.response_format = { type: 'json_object' };
  }

  logger.info(`Sending request using model: ${model} and base URL: ${apiBase}...`);
  logger.debug('Payload:', requestBody);

  // Build headers — only include optional headers for remote APIs (Ollama CORS doesn't allow them)
  const isLocal = apiBase.includes('localhost') || apiBase.includes('127.0.0.1');
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
  if (!isLocal) {
    headers['HTTP-Referer'] = 'https://github.com/ChatContinuity/ChatContinuity';
    headers['X-Title'] = 'ChatContinuity';
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      const errJSON = await response.json();
      if (errJSON.error && errJSON.error.message) {
        errorMsg = errJSON.error.message;
      }
    } catch (_) {
      // Ignored: keep original status message
    }
    throw new Error(`OpenAI API Error: ${errorMsg}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0 || !data.choices[0].message) {
    throw new Error('OpenAI API returned an empty or invalid response structure.');
  }

  const content = data.choices[0].message.content;
  logger.info('Received response from OpenAI.');
  logger.debug('Response content:', content);
  
  return content;
}
