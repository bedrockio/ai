import Anthropic from '@anthropic-ai/sdk';

import BaseClient from './BaseClient.js';

const DEFAULT_TOKENS = 4096;

export class AnthropicClient extends BaseClient {
  static DEFAULT_MODEL = 'claude-sonnet-4-5';

  constructor(options) {
    super(options);
    this.client = new Anthropic(options);
  }

  /**
   * Lists available models.
   * {@link https://docs.anthropic.com/en/docs/about-claude/models Documentation}
   */
  async models() {
    const { data } = await this.client.models.list();
    return data.map((o) => o.id);
  }

  async runPrompt(options) {
    const {
      input,
      model,
      temperature,
      instructions,
      stream = false,
      tokens = DEFAULT_TOKENS,
    } = options;

    // @ts-ignore
    return await this.client.messages.create({
      model,
      stream,
      temperature,
      max_tokens: tokens,
      system: instructions,
      ...this.getSchemaOptions(options),
      messages: input,
    });
  }

  async runStream(options) {
    return await this.runPrompt({
      ...options,
      output: 'raw',
      stream: true,
    });
  }

  getTextResponse(response) {
    const textBlock = response.content.find((block) => {
      return block.type === 'text';
    });
    return textBlock?.text || null;
  }

  getStructuredResponse(response) {
    const toolBlock = response.content.find((block) => {
      return block.type === 'tool_use';
    });
    return toolBlock?.input || null;
  }

  getMessagesResponse(input, response) {
    return {
      messages: [
        ...input,
        ...response.content
          .filter((item) => {
            return item.type === 'text';
          })
          .map((item) => {
            return {
              role: 'assistant',
              content: item.text,
            };
          }),
      ],
    };
  }

  normalizeStreamEvent(event) {
    let { type } = event;
    if (type === 'content_block_start') {
      return {
        type: 'start',
      };
    } else if (type === 'content_block_stop') {
      return {
        type: 'stop',
      };
    } else if (type === 'content_block_delta') {
      return {
        type: 'delta',
        text: event.delta.text,
      };
    }
  }

  // Private

  getSchemaOptions(options) {
    const { output } = options;
    if (output?.type) {
      let schema = output;

      if (schema.type === 'array') {
        schema = {
          type: 'object',
          properties: {
            items: schema,
          },
          required: ['items'],
          additionalProperties: false,
        };
      }

      return {
        tools: [
          {
            name: 'schema',
            description: 'Follow the schema for JSON output.',
            input_schema: schema,
          },
        ],
        tool_choice: {
          type: 'tool',
          name: 'schema',
        },
      };
    }
  }
}
