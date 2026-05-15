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
      messages,
      instructions = '',
      tool_choice = 'auto',
      stream = false,
    } = options;

    const params = {
      model,
      tools,
      input: this.getApiMessages(messages),
      stream,
      tool_choice,
      temperature,
      instructions,

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

  extractStreamResult(blocks) {
    const textBlocks = blocks.filter((block) => {
      return block.type === 'text';
    });
    const last = textBlocks[textBlocks.length - 1];
    if (!last) {
      return;
    }
    return JSON.parse(last.text);
  }

  normalizeContentBlock(block) {
    const { type, text } = block;

    if (type === 'text') {
      block = {
        type: 'input_text',
        text,
      };
    }
    return block;
  }

  normalizeFileBlock(block) {
    const { type, source } = block;

    if (type === 'image') {
      block = {
        type: 'input_image',
        ...this.normalizeSourceParams(source, 'image'),
      };
    } else if (type === 'document') {
      block = {
        type: 'input_file',
        ...this.normalizeSourceParams(source, 'file'),
      };
    }

    return block;
  }

  normalizeSourceParams(source, prefix) {
    const { type } = source;
    if (type === 'url') {
      return {
        [`${prefix}_url`]: source.url,
      };
    } else if (type === 'base64') {
      const { filename, data } = source;
      const mimeType = source.mimeType || source.media_type;
      return {
        file_data: `data:${mimeType};base64,${data}`,
        ...(filename && {
          filename,
        }),
      };
    } else if (type === 'file') {
      return {
        file_id: source.id || source.file_id,
      };
    }
  }

  normalizeResponse(response, options) {
    const blocks = response.output.flatMap((item) => {
      return this.itemToBlock(item) || [];
    });

    return {
      messages: [
        ...this.getFilteredMessages(options),
        {
          role: 'assistant',
          content: this.compactContentBlocks(blocks),
          ...this.getMessageTimestamp(options),
        },
      ],
      usage: this.normalizeUsage(response.usage),
    };
  }

  normalizeUsage(usage) {
    if (usage) {
      return {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      };
    }
  }

  itemToBlock(item) {
    const { type } = item;
    if (type === 'message') {
      const text = item.content
        .filter((c) => {
          return c.type === 'output_text';
        })
        .map((c) => {
          return c.text;
        })
        .join('');
      return {
        type: 'text',
        text,
      };
    } else if (type === 'function_call') {
      return {
        type: 'tool_use',
        id: item.id,
        call_id: item.call_id,
        name: item.name,
        input: item.arguments ? JSON.parse(item.arguments) : {},
      };
    } else if (type === 'mcp_call') {
      return {
        type: 'mcp_tool_use',
        id: item.id,
        name: item.name,
        server_label: item.server_label,
        input: item.arguments ? JSON.parse(item.arguments) : {},
        output: item.output,
      };
    }
  }

  compactContentBlocks(blocks) {
    if (blocks.length === 1 && blocks[0].type === 'text') {
      return blocks[0].text;
    } else {
      return blocks;
    }
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

    options.blocks ||= new Map();

    if (type === 'response.created') {
      return {
        type: 'start',
      };
    } else if (type === 'response.output_text.delta') {
      return {
        type: 'delta',
        delta: event.delta,
      };
    } else if (type === 'response.output_item.added') {
      // MCP tool calls emit start/stop so the UI can show a
      // loading state. Function calls accumulate silently.
      if (event.item.type === 'mcp_call') {
        return {
          type: 'content_block_start',
          index: event.output_index,
          content_block: this.itemToBlock(event.item),
        };
      }
    } else if (type === 'response.output_item.done') {
      const block = this.itemToBlock(event.item);
      if (!block) {
        return;
      }
      options.blocks.set(event.output_index, block);
      if (block.type === 'mcp_tool_use') {
        return {
          type: 'content_block_stop',
          index: event.output_index,
        };
      }
    } else if (type === 'response.completed') {
      const blocks = Array.from(options.blocks.values());
      return {
        type: 'stop',
        ...this.getResultParams(options),
        ...this.getStreamResult(blocks, options),
        messages: [
          ...this.getFilteredMessages(options),
          {
            role: 'assistant',
            content: this.compactContentBlocks(blocks),
            ...this.getMessageTimestamp(options),
          },
        ],
        usage: this.normalizeUsage(event.response.usage),
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
