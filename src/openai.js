import OpenAI from 'openai';

import BaseClient from './BaseClient.js';

export class OpenAiClient extends BaseClient {
  static DEFAULT_MODEL = 'gpt-5-nano';

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
    const {
      model,
      tools,
      verbosity,
      temperature,
      prevResponseId,
      messages: input,
      system: instructions,
      tool_choice = 'auto',
      stream = false,
    } = options;

    const params = {
      model,
      tools,
      input,
      stream,
      tool_choice,
      temperature,
      instructions,
      previous_response_id: prevResponseId,

      text: {
        format: this.getOutputFormat(options),
        verbosity,
      },
    };

    this.debug('Params:', params);

    // @ts-ignore
    return await this.client.responses.create(params);
  }

  async runStream(options) {
    return await this.runPrompt({
      ...options,
      stream: true,
    });
  }

  getTextResponse(response) {
    return response.output_text;
  }

  getStructuredResponse(response) {
    // Note here that certain cases (tool usage etc)
    // can result in multiple outputs with identical
    // content. These outputs are simply concatenated
    // together in output_text which will result in a
    // JSON parse error, so take the LAST output_text
    // entry assuming that this is its "final answer".

    const outputs = response.output
      .filter((item) => {
        return item.type === 'message';
      })
      .flatMap((item) => {
        return item.content.filter((c) => {
          return c.type === 'output_text';
        });
      });

    const last = outputs[outputs.length - 1];
    return JSON.parse(last.text);
  }

  getMessagesResponse(response, options) {
    const { messages } = options;
    return {
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: response.output_text,
        },
      ],
      // Note that this ability currently only
      // exists for OpenAI compatible providers.
      prevResponseId: response.id,
    };
  }

  // Private

  getOutputFormat(options) {
    let { output, schema } = options;
    if (output === 'json') {
      return {
        type: 'json_object',
      };
    } else if (schema) {
      return {
        type: 'json_schema',
        // Name is required but arbitrary.
        name: 'schema',
        strict: true,
        schema,
      };
    } else {
      return {
        type: 'text',
      };
    }
  }

  normalizeStreamEvent(event) {
    const { type } = event;

    if (type === 'response.created') {
      return {
        type: 'start',
        id: event.response.id,
      };
    } else if (type === 'response.completed') {
      return {
        type: 'stop',
        id: event.response.id,
        usage: event.response.usage,
      };
    } else if (type === 'response.output_text.delta') {
      return {
        type: 'delta',
        delta: event.delta,
      };
    } else if (type === 'response.output_text.done') {
      return {
        type: 'done',
        text: event.text,
      };
    }
  }
}
