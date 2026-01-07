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
   * @param {OpenAICategory} category
   * {@link https://platform.openai.com/docs/models Documentation}
   */
  async models(category = 'general') {
    const { data } = await this.client.models.list();

    const names = [];

    for (let entry of data) {
      const model = {
        ...entry,
        category: getModelCategory(entry),
      };

      if (isMatch(model, category)) {
        names.push(model.id);
      }
    }

    names.sort((a, b) => {
      // If one is a prefix of the other, the shorter one comes first
      if (a.startsWith(b)) {
        return 1;
      } else if (b.startsWith(a)) {
        return -1;
      }

      // Otherwise sort alphabetically
      return b.localeCompare(a);
    });

    return names;
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

    this.debug('Params:', params, options);

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
    return response?.output_text;
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

  normalizeResponse(response, options) {
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
      usage: this.normalizeUsage(response),
    };
  }

  normalizeUsage(response) {
    return {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
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

  normalizeStreamEvent(event, options) {
    const { type } = event;

    if (type === 'response.created') {
      return {
        type: 'start',
        id: event.response.id,
      };
    } else if (type === 'response.completed') {
      const output = event.response.output.find((item) => {
        return item.type === 'message';
      });
      return {
        type: 'stop',
        id: event.response.id,
        messages: [
          ...options.messages,
          {
            role: 'assistant',
            content: output?.content[0].text,
          },
        ],
        usage: this.normalizeUsage(event.response),
      };
    } else if (type === 'response.output_text.delta') {
      return {
        type: 'delta',
        delta: event.delta,
      };
    }
  }
}

// Categories

const DATE_REG = /\d{4}-\d{2}-\d{2}$|\d{4}/;

/**
 * @typedef {
 *   | "all"
 *   | "general"
 *   | "reasoning"
 *   | "lightweight"
 *   | "moderation"
 *   | "embedding"
 *   | "speech"
 *   | "audio"
 *   | "image"
 *   | "code"
 *   | "legacy"
 * } OpenAICategory
 */

const MODEL_CATEGORIES = [
  { name: 'code', reg: /codex/ },
  { name: 'image', reg: /(dall-e|image|sora)/ },
  { name: 'audio', reg: /(audio|realtime)/ },
  { name: 'speech', reg: /(transcribe|tts)/ },
  { name: 'embedding', reg: /embedding/ },
  { name: 'moderation', reg: /moderation/ },
  { name: 'lightweight', reg: /(mini|nano|small)/ },
  { name: 'reasoning', reg: /(^o\d|deep-research)/ },
  { name: 'legacy', reg: /(davinci|babbage|curie|ada)/ },
  { name: 'general', reg: /^gpt/ },
];

function getModelCategory(model) {
  const category = MODEL_CATEGORIES.find((category) => {
    return category.reg.test(model.id);
  });

  return category?.name || 'none';
}

function isMatch(model, category) {
  if (model.owned_by === 'openai-internal') {
    return false;
  } else if (DATE_REG.test(model.id)) {
    return false;
  }
  return category === 'all' || model.category === category;
}
