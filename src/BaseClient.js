import Mustache from 'mustache';

import { loadTemplates, loadTemplate } from './util.js';

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
    const { text } = options;
    const template = await this.resolveTemplate(options);

    if (template) {
      const raw = render(template, options);

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
    } else if (text) {
      return [
        {
          role: 'user',
          content: text,
        },
      ];
    } else {
      throw new Error('No input provided.');
    }
  }

  async buildTemplate(options) {
    const template = await this.resolveTemplate(options);
    return render(template, options);
  }

  async loadTemplates() {
    const { templates } = this.options;
    this.templates ||= await loadTemplates(templates);
  }

  async resolveTemplate(options) {
    const { template, file } = options;
    if (template) {
      return template;
    } else if (file?.endsWith('.md')) {
      return await loadTemplate(file);
    } else if (file) {
      await this.loadTemplates();
      return this.templates[file];
    }
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

function render(template, params) {
  params = wrapObjects(params);
  params = wrapProxy(params);
  return Mustache.render(template, params);
}

// Transform arrays and object to versions
// that are more understandable in the context
// of a template that may have meaningful whitespace.
function wrapObjects(params) {
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

// Wrap params with a proxy object that reports
// as having all properties. If one is accessed
// that does not exist then return the original
// token. This way templates can be partially
// interpolated and re-interpolated later.
function wrapProxy(params) {
  return new Proxy(params, {
    has() {
      return true;
    },

    get(target, prop) {
      if (prop in target) {
        return target[prop];
      } else {
        return `{{{${prop.toString()}}}}`;
      }
    },
  });
}
