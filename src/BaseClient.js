import { loadTemplates, parseCode, renderTemplate } from './utils.js';

export default class BaseClient {
  constructor(options) {
    this.options = {
      // @ts-ignore
      model: this.constructor.DEFAULT_MODEL,
      ...options,
    };
    this.templates = null;
  }

  // Public

  /**
   * Interpolates vars into the provided template as instructions and runs the
   * prompt.
   *
   * @param {PromptOptions} options
   */
  async prompt(options) {
    options = await this.normalizeOptions(options);

    const { input, output, schema } = options;

    const response = await this.runPrompt(options);

    this.debug('Response:', response);

    if (output === 'raw') {
      return response;
    }

    let result;

    if (schema) {
      result = this.getStructuredResponse(response);
      if (schema.type === 'array') {
        // @ts-ignore
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
        ...this.getMessagesResponse(input, response),
      };
    } else {
      return result;
    }
  }

  /**
   * Streams the prompt response.
   *
   * @param {PromptOptions} options
   * @returns {AsyncIterator}
   */
  async *stream(options) {
    options = await this.normalizeOptions(options);

    const stream = await this.runStream(options);

    const events = [];

    // @ts-ignore
    for await (const event of stream) {
      events.push(event);
      const normalized = this.normalizeStreamEvent(event);

      // @ts-ignore
      if (normalized) {
        yield normalized;
      }
    }
  }

  async buildTemplate(options) {
    const template = await this.resolveTemplate(options);
    return renderTemplate(template, options);
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

  normalizeStreamEvent(event) {
    void event;
    throw new Error('Method not implemented.');
  }

  // Private

  async normalizeOptions(options) {
    options = {
      input: '',
      output: 'text',
      ...this.options,
      ...options,
    };

    options.input = this.normalizeInput(options);
    options.schema = this.normalizeSchema(options);
    options.instructions ||= await this.resolveInstructions(options);

    return options;
  }

  normalizeInput(options) {
    let { input = '', output } = options;

    if (typeof input === 'string') {
      if (output === 'json') {
        input += '\nOutput only valid JSON.';
      }

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
    const { schema } = options;
    return schema?.toJSON?.() || schema;
  }

  debug(message, arg) {
    if (this.options.debug) {
      // TODO: replace with logger when opentelemetry is removed
      // eslint-disable-next-line
      console.debug(`${message}\n${JSON.stringify(arg, null, 2)}`);
    }
  }

  async resolveInstructions(options) {
    if (options.template) {
      const template = await this.resolveTemplate(options);
      return renderTemplate(template, options);
    }
  }

  async resolveTemplate(options) {
    const { template } = options;
    await this.loadTemplates();
    return this.templates[template] || template;
  }

  async loadTemplates() {
    const { templates } = this.options;
    this.templates ||= await loadTemplates(templates);
  }
}

/**
 * @typedef {Object} PromptOptions
 * @property {string} input - Input to use.
 * @property {string} [model] - The model to use.
 * @property {Object} [schema] - A JSON schema compatible object that defines the output shape.
 * @property {"raw" | "text" | "json" | "messages"} [output] - The return value type.
 * @property {Object} [params] - Params to be interpolated into the template.
 *                               May also be passed as additional props to options.
 */
