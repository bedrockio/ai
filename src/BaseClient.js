import { TemplateRenderer } from '@bedrockio/templates';

import { parseCode } from './utils/code.js';
import { createMessageExtractor } from './utils/json.js';

export default class BaseClient {
  constructor(options) {
    this.options = {
      // @ts-ignore
      model: this.constructor.DEFAULT_MODEL,
      ...options,
    };
    this.renderer = new TemplateRenderer({
      dir: options.templates,
    });
  }

  // Public

  /**
   * Interpolates vars into the provided template as instructions and runs the
   * prompt.
   *
   * @param {PromptOptions} options
   */
  async prompt(options) {
    options = this.normalizeOptions(options);

    const { output, stream, schema } = options;

    const response = await this.runPrompt(options);

    if (!stream) {
      this.debug('Response:', response);
    }

    if (output === 'raw') {
      return response;
    }

    let result;
    if (schema) {
      result = this.getStructuredResponse(response);

      // @ts-ignore
      if (options.hasWrappedSchema) {
        result = result.items;
      }
    } else if (output === 'json') {
      result = JSON.parse(parseCode(this.getTextResponse(response)));
    } else {
      result = parseCode(this.getTextResponse(response));
    }

    if (output === 'messages') {
      return {
        result,
        ...this.getMessagesResponse(response, options),
      };
    } else {
      return result;
    }
  }

  /**
   * Streams the prompt response.
   *
   * @param {PromptOptions & StreamOptions} options
   * @returns {AsyncIterator}
   */
  async *stream(options) {
    options = this.normalizeOptions(options);

    const extractor = this.getMessageExtractor(options);

    try {
      const stream = await this.runStream(options);

      // @ts-ignore
      for await (let event of stream) {
        this.debug('Event:', event);

        event = this.normalizeStreamEvent(event);

        if (event) {
          yield event;
        }

        const extractedMessages = extractor?.(event) || [];

        for (let message of extractedMessages) {
          const { key, delta, text, done } = message;

          let extractEvent;
          if (done) {
            extractEvent = {
              type: 'extract:done',
              text,
              key,
            };
          } else {
            extractEvent = {
              type: 'extract:delta',
              delta,
              key,
            };
          }

          this.debug('Extract:', extractEvent);

          yield extractEvent;
        }
      }
    } catch (error) {
      const { message, code } = error;
      yield {
        type: 'error',
        code,
        message,
      };
    }
  }

  // Protected

  runPrompt(options) {
    void options;
    throw new Error('Method not implemented.');
  }

  runStream(options) {
    void options;
    throw new Error('Method not implemented.');
  }

  getTextResponse(response) {
    void response;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  getStructuredResponse(response) {
    void response;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  getMessagesResponse(input, response) {
    void response;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  normalizeStreamEvent(event) {
    void event;
    throw new Error('Method not implemented.');
  }

  // Private

  /**
   * @returns {Object}
   */
  normalizeOptions(options) {
    return {
      ...this.options,
      ...options,
      ...this.normalizeInputs(options),
      ...this.normalizeSchema(options),
    };
  }

  normalizeInputs(options) {
    const { template, params, output = 'text' } = options;
    const { sections } = this.renderer.run({
      params,
      template,
    });

    let system = '';
    let messages = [];

    for (let section of sections) {
      const { title = 'system', content } = section;

      const role = title.toLowerCase();

      if (role === 'system') {
        system += [system, content].join('\n');
      } else {
        messages = [
          ...messages,
          {
            role,
            content,
          },
        ];
      }
    }

    messages = [...messages, ...this.normalizeInput(options)];

    if (output === 'json') {
      system = [system, 'Output only valid JSON.'].join('\n\n');
    }

    return {
      system,
      messages,
    };
  }

  normalizeInput(options) {
    let { input = '' } = options;

    if (!input) {
      input = [];
    } else if (typeof input === 'string') {
      input = [
        {
          role: 'user',
          content: input,
        },
      ];
    }

    return input;
  }

  normalizeSchema(options) {
    let { schema } = options;

    if (!schema) {
      return;
    }

    let hasWrappedSchema = false;

    // Convert to JSON schema.
    schema = schema.toJSON?.() || schema;

    if (schema?.type === 'array') {
      schema = {
        type: 'object',
        properties: {
          items: schema,
        },
        required: ['items'],
        additionalProperties: false,
      };
      hasWrappedSchema = true;
    }

    return {
      schema,
      hasWrappedSchema,
    };
  }

  getMessageExtractor(options) {
    const { extractMessages } = options;
    if (!extractMessages) {
      return;
    }
    const messageExtractor = createMessageExtractor([extractMessages]);
    return (event) => {
      if (event?.type === 'delta') {
        return messageExtractor(event.delta);
      }
    };
  }

  debug(message, arg) {
    if (this.options.debug) {
      // TODO: replace with logger when opentelemetry is removed
      // eslint-disable-next-line
      console.debug(`${message}\n${JSON.stringify(arg, null, 2)}\n`);
    }
  }
}

/**
 * @typedef {Object} PromptOptions
 * @property {string|PromptMessage[]} input - Input to use.
 * @property {string} [model] - The model to use.
 * @property {boolean} stream - Stream response.
 * @property {Object} [schema] - A JSON schema compatible object that defines the output shape.
 * @property {"raw" | "text" | "json" | "messages"} [output] - The return value type.
 * @property {Object} [params] - Params to be interpolated into the template.
 *                               May also be passed as additional props to options.
 */

/**
 * @typedef {Object} StreamOptions
 * @property {string} [extractMessages] - Key in JSON response to extract a message stream from.
 */

/**
 * @typedef {Object} PromptMessage
 * @property {"system" | "user" | "assistant"} role
 * @property {string} content
 */
