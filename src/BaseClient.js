import { existsSync } from 'node:fs';

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
    this.assertTemplatesDir();
  }

  assertTemplatesDir() {
    const { templates } = this.options;
    if (templates && !existsSync(templates)) {
      throw new Error(`Directory not found: ${templates}`);
    }
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

    const { output, stream, schema, prompt, instructions } = options;

    const response = await this.runPrompt(options);

    if (!stream) {
      this.debug('Response:', response, options);
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

    return {
      result,
      prompt,
      response,
      instructions,
      ...this.normalizeResponse(response, options),
    };
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
        this.debug('Event:', event, options);

        event = this.normalizeStreamEvent(event, options);

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

          this.debug('Extract:', extractEvent, options);

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

  /**
   * Gets the source for a given template.
   *
   * @param {string} name
   */
  getTemplateSource(name) {
    return this.renderer.getTemplateSource(name);
  }

  getFilteredMessages(options) {
    const { messages = [] } = options;
    return messages
      .map((message) => {
        const { content } = message;
        return {
          ...message,
          content: this.getFilteredContent(content),
        };
      })
      .filter((message) => {
        const { content } = message;
        if (typeof content === 'string') {
          return !!content;
        } else {
          return content.length > 0;
        }
      });
  }

  getFilteredContent(content) {
    if (typeof content === 'string') {
      return this.isEmptyContent(content) ? '' : content;
    } else {
      return content.filter((block) => {
        const { type, text } = block;
        if (type === 'text') {
          return !this.isEmptyContent(text);
        } else {
          return true;
        }
      });
    }
  }

  getResultParams(options) {
    let { input, prompt, instructions } = options;

    prompt ||= this.getFallbackPrompt(options);
    instructions ||= input;

    return {
      prompt,
      instructions,
    };
  }

  // Message-level fields like `timestamp` are useful for the consumer
  // (chat UIs, logs) but are rejected by the upstream SDKs as "extra
  // inputs". Strip back to the canonical role/content shape just before
  // hitting the wire — output messages still carry the extras through
  // because `getFilteredMessages` spreads the originals.
  getApiMessages(messages) {
    return messages.map((message) => {
      const { role, content } = message;
      return {
        role,
        content,
      };
    });
  }

  getMessageTimestamp(options) {
    if (options.timestamps) {
      return {
        timestamp: new Date(),
      };
    }
  }

  getFallbackPrompt(options) {
    const { input, instructions } = options;
    if (input && instructions) {
      return `
=== SYSTEM ===

${instructions}

=== USER ===

${input}
      `.trim();
    } else {
      return instructions || input;
    }
  }

  isEmptyContent(str) {
    str = str.trim();
    return !str || str === '.';
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

  // Streaming counterpart to getStructuredResponse: when a schema is in play
  // the assistant's structured payload is buried in the accumulated content
  // blocks. Subclasses implement extractStreamResult(blocks) to pull out the
  // raw value (transport-specific — e.g. an Anthropic tool_use input vs an
  // OpenAI JSON-formatted text block); this method handles the schema gate,
  // the wrapped-array unwrap, and the `{ result }` envelope so the emitted
  // `stop` event mirrors prompt()'s return shape.
  getStreamResult(blocks, options) {
    if (!options.schema) {
      return {};
    }
    const raw = this.extractStreamResult(blocks);
    if (raw == null) {
      return {};
    }
    return {
      result: options.hasWrappedSchema ? raw?.items : raw,
    };
  }

  /**
   * @returns {Object}
   */
  extractStreamResult(blocks) {
    void blocks;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  normalizeResponse(response, options) {
    void response;
    void options;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  normalizeStreamEvent(event, options) {
    void event;
    void options;
    throw new Error('Method not implemented.');
  }

  normalizeContentBlock(block) {
    void block;
    throw new Error('Method not implemented.');
  }

  normalizeFileBlock(block) {
    void block;
    throw new Error('Method not implemented.');
  }

  compactContentBlocks(blocks) {
    void blocks;
    throw new Error('Method not implemented.');
  }

  // Private

  /**
   * @returns {Object}
   */
  normalizeOptions(options) {
    const merged = {
      ...this.options,
      ...options,
    };
    return {
      ...merged,
      ...this.normalizeInputs(merged),
      ...this.normalizeSchema(merged),
    };
  }

  normalizeInputs(options) {
    options = this.normalizeTemplateOptions(options);

    let { prompt, instructions, output = 'text' } = options;

    if (output === 'json') {
      instructions = [instructions, 'Output only valid JSON.'].join('\n\n');
    }

    const messages = this.normalizeMessages(options);

    return {
      prompt,
      messages,
      instructions,
    };
  }

  normalizeTemplateOptions(options) {
    const { template, params } = options;

    if (!template) {
      return options;
    }

    const { sections, body: prompt } = this.renderer.run({
      params,
      template,
    });

    let instructions = '';

    let { messages = [] } = options;

    // Templates may contain multiple roles, ie SYSTEM or USER, making them
    // useful for one-off prompting. However in a multi-turn conversation
    // the entire chat history will be passed, so do not inject user messages
    // when they already exist in the options.
    const hasUserMessages = messages.some((message) => {
      return message.role === 'user';
    });

    for (let section of sections) {
      const { title = 'system', content } = section;

      const role = title.toLowerCase();

      if (role === 'system') {
        instructions += [instructions, content].join('\n');
      } else if (!hasUserMessages) {
        messages = [
          ...messages,
          {
            role,
            content,
          },
        ];
      }
    }

    instructions = instructions.trim();

    return {
      ...options,
      instructions,
      messages,
      prompt,
    };
  }

  normalizeMessages(options) {
    const { files = [] } = options;

    let { input, messages = [] } = options;

    if (Array.isArray(input)) {
      messages = input;
    } else if (typeof input === 'string') {
      messages = [
        ...messages,
        {
          role: 'user',
          content: input,
          ...this.getMessageTimestamp(options),
        },
      ];
    } else if (!input && !messages.length) {
      messages = [
        {
          role: 'user',
        },
      ];
    }

    return messages.map((message) => {
      let { content } = message;

      if (files.length) {
        content = [
          ...this.expandContentBlocks(content),
          ...files.map((block) => {
            return this.normalizeFileBlock(block);
          }),
        ];
      } else if (!content) {
        // If no user input is passed, coerce it to a single period.
        // Combined with getFilteredMessages below this allows
        // a chatbot the ability to "speak first" by prompting it with empty
        // content. The empty message will be filtered out of the final result
        // appearing as if the chatbot went first.
        // Note that:
        // GPT will fail on an empty string but on whitespace
        // Anthropic will fail on all whitespace
        content = '.';
      }

      if (Array.isArray(content)) {
        content = content.map((block) => {
          if (block.type === 'mcp_tool_use' && !block.input) {
            return {
              ...block,
              input: {},
            };
          } else {
            return block;
          }
        });
      }

      return {
        ...message,
        content,
      };
    });
  }

  expandContentBlocks(content) {
    if (typeof content === 'string') {
      content = [
        {
          type: 'text',
          text: content,
        },
      ];
    } else if (!content) {
      content = [];
    }
    return content.map((block) => {
      return this.normalizeContentBlock(block);
    });
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

  debug(message, arg, options) {
    if (options.debug) {
      // TODO: replace with logger when opentelemetry is removed
      // eslint-disable-next-line
      console.debug(`${message}\n${JSON.stringify(arg, null, 2)}\n`);
    }
  }
}

/**
 * @typedef {Object} PromptOptions
 * @property {string} input - Basic input to be comes user message.
 * @property {string} prompt
 * @property {string} instructions
 * @property {PromptMessage[]} messages - Full message input.
 * @property {string} [model] - The model to use.
 * @property {boolean} stream - Stream response.
 * @property {Object} [schema] - A JSON schema compatible object that defines the output shape.
 * @property {"text" | "json"} [output] - The result output type.
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
