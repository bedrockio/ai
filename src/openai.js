import OpenAI from 'openai';

import BaseClient from './BaseClient.js';

const DEFAULT_MODEL = 'gpt-5-nano';

export class OpenAiClient extends BaseClient {
  constructor(options) {
    super(options);
    this.client = new OpenAI(options);
  }

  /**
   * Lists available models.
   * {@link https://platform.openai.com/docs/models Documentation}
   */
  async models() {
    const { data } = await this.client.models.list();
    return data.map((o) => o.id);
  }

  async runPrompt(options) {
    let {
      input,
      model = DEFAULT_MODEL,
      output = 'text',
      stream = false,
    } = options;

    if (output === 'json') {
      input += 'Output must be valid JSON.';
    }

    const instructions = await this.resolveInstructions(options);

    return await this.client.responses.create({
      model,
      input,
      stream,
      instructions,
      text: {
        format: this.getOutputFormat(options),
      },
    });
  }

  async runStream(options) {
    return await this.prompt({
      ...options,
      output: 'raw',
      stream: true,
    });
  }

  getTextResponse(response) {
    return response.output_text;
  }

  getStructuredResponse(response) {
    return JSON.parse(response.output_text);
  }

  // Private

  /**
   * @returns {import('openai/resources/responses/responses').ResponseFormatTextConfig | undefined}
   */
  getOutputFormat(options) {
    const { output } = options;
    if (output === 'json') {
      return {
        type: 'json_object',
      };
    } else if (output?.type) {
      // JSON schema

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
        type: 'json_schema',
        // Name is required but arbitrary.
        name: 'schema',
        strict: true,
        schema: {
          type: 'object',
        },
      };
    } else {
      return {
        type: 'text',
      };
    }
  }

  normalizeStreamEvent(event) {
    let { type } = event;
    if (type === 'response.created') {
      return {
        type: 'start',
      };
    } else if (type === 'response.completed') {
      return {
        type: 'stop',
      };
    } else if (type === 'response.output_text.delta') {
      return {
        type: 'delta',
        text: event.delta,
      };
    }
  }
}
