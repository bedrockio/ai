import Mustache from 'mustache';

import { loadTemplates } from './util.js';

const MESSAGES_REG = /(?:^|\n)-{3,}\s*(\w+)\s*-{3,}(.*?)(?=\n-{3,}|$)/gs;

export default class BaseClient {
  constructor(options) {
    this.options = options;
    this.templates = null;
  }

  /**
   * Interpolates vars into the provided template and
   * runs the chat completion. The "output" option may
   * be omitted and will default to `"text"`.
   * {@link https://github.com/bedrockio/ai?tab=readme-ov-file#bedrockioai Documentation}
   *
   * @param {object} options
   * @param {string} options.model - The model to use.
   * @param {"raw" | "text" | "json" | "messages"} [options.output] - The output to use.
   * @param {Object.<string, any>} [options.other] - Additional props
   *             will be interpolated in the template.
   */
  async prompt(options) {
    options = {
      ...this.options,
      ...options,
    };

    const messages = await this.getMessages(options);
    return await this.getCompletion({
      ...options,
      messages,
    });
  }

  /**
   * Streams the prompt response.
   * @returns {AsyncIterator}
   */
  async *stream(options) {
    const stream = await this.getStream(options);

    let started = false;

    // @ts-ignore
    for await (const chunk of stream) {
      const resolved = this.getStreamedChunk(chunk, started);
      started = true;

      // @ts-ignore
      if (resolved) {
        yield resolved;
      }
    }
  }

  async getMessages(options) {
    const template = await this.resolveTemplate(options);
    const raw = Mustache.render(template, transformParams(options));

    const messages = [];
    for (let match of raw.matchAll(MESSAGES_REG)) {
      const [, role, content] = match;
      messages.push({
        role: role.toLowerCase(),
        content: content.trim(),
      });
    }

    if (!messages.length) {
      messages.push({
        role: 'user',
        content: raw.trim(),
      });
    }

    return messages;
  }

  async loadTemplates() {
    const { templates } = this.options;
    this.templates ||= await loadTemplates(templates);
  }

  async resolveTemplate(options) {
    await this.loadTemplates();

    let { file, template } = options;

    if (!template && file) {
      template = this.templates[file];
    }

    if (!template) {
      throw new Error('No template provided.');
    }

    return template;
  }

  async getStream(options) {
    return await this.prompt({
      ...options,
      output: 'raw',
      stream: true,
    });
  }

  getCompletion(options) {
    void options;
    new Error('Method not implemented.');
  }

  getStreamedChunk(chunk, started) {
    void chunk;
    void started;
    new Error('Method not implemented.');
  }
}

function transformParams(params) {
  const result = {};
  for (let [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value = value
        .map((el) => {
          return `- ${el}`;
        })
        .join('\n');
    } else if (typeof value === 'object') {
      value = JSON.stringify(value, null, 2);
    }
    result[key] = value;
  }
  return result;
}
