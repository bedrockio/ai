import { OpenAiClient } from './openai.js';

export class XAiClient extends OpenAiClient {
  static DEFAULT_MODEL = 'grok-4-fast';

  constructor(options) {
    super({
      ...options,
      baseURL: 'https://api.x.ai/v1',
    });
  }
}
