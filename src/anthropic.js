import Anthropic from '@anthropic-ai/sdk';

import BaseClient from './BaseClient.js';
import { transformResponse } from './util.js';

const MODELS_URL = 'https://docs.anthropic.com/en/docs/about-claude/models';
const DEFAULT_MODEL = 'claude-3-5-sonnet-latest';

export class AnthropicClient extends BaseClient {
  constructor(options) {
    super(options);
    this.client = new Anthropic({
      ...options,
    });
  }

  /**
   * Lists available models.
   * {@link https://docs.anthropic.com/en/docs/about-claude/models Documentation}
   */
  async models() {
    const { data } = await this.client.models.list();
    return data.map((o) => o.id);
  }

  async getCompletion(options) {
    const {
      model = DEFAULT_MODEL,
      max_tokens = 2048,
      output = 'text',
      stream = false,
      messages,
    } = options;
    const { client } = this;

    const { system, user } = splitMessages(messages);

    if (!model) {
      throw new Error(
        `No model specified. Available models are here: ${MODELS_URL}.`,
      );
    }

    const response = await client.messages.create({
      max_tokens,
      messages: user,
      system,
      model,
      stream,
    });

    if (output === 'raw') {
      return response;
    }

    // @ts-ignore
    const message = response.content[0];

    return transformResponse({
      ...options,
      messages,
      message,
    });
  }

  getStreamedChunk(chunk) {
    // @ts-ignore
    let type;
    if (chunk.type === 'content_block_start') {
      type = 'start';
    } else if (chunk.type === 'content_block_delta') {
      type = 'chunk';
    } else if (chunk.type === 'message_stop') {
      type = 'stop';
    }

    if (type) {
      return {
        type,
        text: chunk.delta?.text || '',
      };
    }
  }
}

function splitMessages(messages) {
  const system = [];
  const user = [];
  for (let message of messages) {
    if (message.role === 'system') {
      system.push(message);
    } else {
      user.push(message);
    }
  }
  return { system: system.join('\n'), user };
}
