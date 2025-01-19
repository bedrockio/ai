import OpenAI from 'openai';

import BaseClient from './BaseClient.js';
import { transformResponse } from './util.js';

const DEFAULT_MODEL = 'gpt-4o';

export class OpenAiClient extends BaseClient {
  constructor(options) {
    super(options);
    this.client = new OpenAI({
      ...options,
    });
  }

  /**
   * Lists available models.
   */
  async models() {
    const { data } = await this.client.models.list();
    return data.map((o) => o.id);
  }

  async getCompletion(options) {
    const { model = DEFAULT_MODEL, output = 'text', stream = false } = options;
    const { client } = this;

    const messages = await this.getMessages(options);
    const response = await client.chat.completions.create({
      model,
      messages,
      stream,
    });

    if (output === 'raw') {
      return response;
    }

    const { message } = response.choices[0];

    return transformResponse({
      ...options,
      messages,
      message,
    });
  }

  getStreamedChunk(chunk, started) {
    const [choice] = chunk.choices;

    let type;
    if (!started) {
      type = 'start';
    } else if (choice.finish_reason === 'stop') {
      type = 'stop';
    } else {
      type = 'chunk';
    }

    if (type) {
      return {
        type,
        text: choice.delta.content || '',
      };
    }
  }
}
