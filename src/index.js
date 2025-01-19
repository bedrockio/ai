import { OpenAiClient } from './openai.js';
import { GoogleClient } from './google.js';
import { AnthropicClient } from './anthropic.js';

export class Client {
  constructor(options) {
    const { platform, ...rest } = options;
    if (platform === 'openai' || platform === 'gpt') {
      return new OpenAiClient(rest);
    } else if (platform === 'google' || platform === 'gemini') {
      return new GoogleClient(rest);
    } else if (platform === 'anthropic' || platform === 'claude') {
      return new AnthropicClient(rest);
    } else if (platform) {
      throw new Error(`Unknown platform "${platform}".`);
    } else {
      throw new Error('Platform required.');
    }
  }
}
