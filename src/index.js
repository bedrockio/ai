import { OpenAiClient } from './openai.js';
import { GoogleClient } from './google.js';
import { AnthropicClient } from './anthropic.js';

export class Client {
  constructor(options = {}) {
    const { platform } = options;

    if (!options.platform) {
      throw new Error('No platform specified.');
    } else if (!options.templates) {
      throw new Error('No templates directory specified.');
    } else if (!options.apiKey) {
      throw new Error('No API key specified.');
    }

    if (platform === 'openai' || platform === 'gpt') {
      return new OpenAiClient(options);
    } else if (platform === 'google' || platform === 'gemini') {
      return new GoogleClient(options);
    } else if (platform === 'anthropic' || platform === 'claude') {
      return new AnthropicClient(options);
    } else if (platform) {
      throw new Error(`Unknown platform "${platform}".`);
    }
  }
}
