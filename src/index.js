import { AnthropicClient } from './anthropic.js';
import { GoogleClient } from './google.js';
import { OpenAiClient } from './openai.js';
import { XAiClient } from './xai.js';

export function createClient(options = {}) {
  const { platform } = options;

  if (!platform) {
    throw new Error('No platform specified.');
  }

  if (platform === 'openai' || platform === 'gpt') {
    return new OpenAiClient(options);
  } else if (platform === 'google' || platform === 'gemini') {
    return new GoogleClient(options);
  } else if (platform === 'anthropic' || platform === 'claude') {
    return new AnthropicClient(options);
  } else if (platform === 'xai' || platform === 'grok') {
    return new XAiClient(options);
  } else if (platform) {
    throw new Error(`Unknown platform "${platform}".`);
  }
}
