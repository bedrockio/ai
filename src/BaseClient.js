import { loadTemplates, parseCode, renderTemplate } from './utils.js';

export default class BaseClient {
  constructor(options) {
    this.options = options;
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
    let { input, output = 'text' } = options;

    if (output === 'json') {
      input += '\nOutput only valid JSON.';
    }

    const instructions = await this.resolveInstructions(options);

    const response = await this.runPrompt({
      input,
      output,
      instructions,
    });

    if (output === 'raw') {
      return response;
    } else if (output === 'json') {
      return JSON.parse(parseCode(this.getTextResponse(response)));
    } else if (output?.meta?.type) {
      let result = this.getStructuredResponse(response);
      if (output.meta?.type === 'array') {
        // @ts-ignore
        result = result.items;
      }
      return result;
    } else {
      return parseCode(this.getTextResponse(response));
    }
  }

  /**
   * Streams the prompt response.
   *
   * @param {PromptOptions} options
   * @returns {AsyncIterator}
   */
  async *stream(options) {
    const instructions = await this.resolveInstructions(options);

    const stream = await this.runStream({
      ...options,
      instructions,
    });

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

  normalizeStreamEvent(event) {
    void event;
    throw new Error('Method not implemented.');
  }

  // Private

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
 * @property {"raw" | "text" | "json" | Object} [output] - The output to use.
 * @property {Object} [params] - Params to be interpolated into the template.
 *                               May also be passed as additional props to options.
 */
