import { OpenAiClient } from './openai.js';

const DEFAULT_MODEL = 'grok-2-1212';

export class XAiClient extends OpenAiClient {
  constructor(options) {
    super({
      ...options,
      baseURL: 'https://api.x.ai/v1',
    });
  }

  async getCompletion(options) {
    return super.getCompletion({
      model: DEFAULT_MODEL,
      ...options,
    });
  }
}
