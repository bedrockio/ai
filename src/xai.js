import { OpenAiClient } from './openai.js';

const DEFAULT_MODEL = 'grok-2-1212';

export class XAiClient extends OpenAiClient {
  constructor(options) {
    super({
      ...options,
      baseURL: 'https://api.x.ai/v1',
    });
  }

  async runPrompt(options) {
    return super.runPrompt({
      model: DEFAULT_MODEL,
      ...options,
    });
  }

  async runStream(options) {
    return super.runStream({
      model: DEFAULT_MODEL,
      ...options,
    });
  }
}
