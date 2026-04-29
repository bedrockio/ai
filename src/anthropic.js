import Anthropic from '@anthropic-ai/sdk';

import BaseClient from './BaseClient.js';

const DEFAULT_TOKENS = 4096;

export class AnthropicClient extends BaseClient {
  static DEFAULT_MODEL = 'claude-sonnet-4-5';

  constructor(options) {
    super(options);
    this.client = new Anthropic(options);
  }

  /**
   * Lists available models.
   * {@link https://docs.anthropic.com/en/docs/about-claude/models Documentation}
   */
  async models() {
    const { data } = await this.client.models.list();
    return data.map((o) => o.id);
  }

  async runPrompt(options) {
    const {
      model,
      messages,
      temperature,
      stream = false,
      tokens = DEFAULT_TOKENS,
      instructions: system = '',
    } = options;

    const params = {
      model,
      stream,
      system,
      messages,
      temperature,
      max_tokens: tokens,
      ...this.getToolOptions(options),
    };

    const clientOptions = this.getClientOptions(params);

    this.debug('Options:', options, options);
    this.debug('Params:', params, options);

    // @ts-ignore
    return await this.client.messages.create(params, clientOptions);
  }

  async runStream(options) {
    return await this.runPrompt({
      ...options,
      stream: true,
    });
  }

  getTextResponse(response) {
    const textBlock = response?.content.find((block) => {
      return block.type === 'text';
    });
    return textBlock?.text || null;
  }

  getStructuredResponse(response) {
    const toolBlock = response.content.find((block) => {
      return block.type === 'tool_use';
    });
    return toolBlock?.input || null;
  }

  normalizeContentBlock(block) {
    return block;
  }

  normalizeFileBlock(block) {
    return block;
  }

  normalizeResponse(response, options) {
    return {
      messages: [
        ...this.getFilteredMessages(options),
        ...response.content
          .filter((item) => {
            return item.type === 'text';
          })
          .map((item) => {
            return {
              role: 'assistant',
              content: item.text,
            };
          }),
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

  normalizeStreamEvent(event, options) {
    const { type } = event;

    options.blocks ||= new Map();

    if (type === 'content_block_start') {
      options.blocks.set(event.index, event.content_block);
      if (event.content_block.type !== 'text') {
        return event;
      }
    } else if (type === 'content_block_delta') {
      const block = options.blocks.get(event.index);
      if (event.delta.type === 'text_delta') {
        block.text ||= '';
        block.text += event.delta.text;
        return {
          type: 'delta',
          delta: event.delta.text,
        };
      }
    } else if (type === 'content_block_stop') {
      const block = options.blocks.get(event.index);
      if (block.type !== 'text') {
        return event;
      }
    } else if (type === 'message_start') {
      return { type: 'start' };
    } else if (type === 'message_delta') {
      options.usage = event.usage;
    } else if (type === 'message_stop') {
      const blocks = Array.from(options.blocks.values());
      return {
        type: 'stop',
        instructions: options.instructions,
        messages: [
          ...this.getFilteredMessages(options),
          {
            role: 'assistant',
            content: this.compactContentBlocks(blocks),
          },
        ],
        usage: this.normalizeUsage(options.usage),
      };
    }
  }

  // Private

  getToolOptions(options) {
    let { tools = [], schema } = options;
    let toolChoice;

    tools = tools.map((tool) => {
      return this.normalizeToolInput(tool);
    });

    if (schema) {
      tools.push({
        name: 'schema',
        description: 'Follow the schema for JSON output.',
        input_schema: schema,
      });
      toolChoice = {
        type: 'tool',
        name: 'schema',
      };
    } else {
      // The default.
      toolChoice = {
        type: 'auto',
      };
    }

    const mcpServers = tools
      .filter((tool) => {
        return tool.type === 'mcp';
      })
      .map((tool) => {
        const { name, url, authorization_token } = tool;
        return {
          type: 'url',
          name,
          url,
          ...(authorization_token && {
            authorization_token,
          }),
        };
      });

    tools = tools.filter((tool) => {
      return tool.type !== 'mcp';
    });

    for (let server of mcpServers) {
      const hasToolset = tools.some((tool) => {
        const { type, mcp_server_name: name } = tool;
        return type === 'mcp_toolset' && name === server.name;
      });

      if (!hasToolset) {
        tools.push({
          type: 'mcp_toolset',
          mcp_server_name: server.name,
        });
      }
    }

    return {
      tools,
      mcp_servers: mcpServers,
      tool_choice: toolChoice,
    };
  }

  normalizeToolInput(input) {
    if (input.type === 'function') {
      input = this.normalizeOpenAiToolInput(input);
    }
    return input;
  }

  // OpenAI uses the following input for custom tools
  // so map it here to Anthropic styles when passed.
  // {
  //   type: 'function',
  //   name: 'apples',
  //   description: 'Call this when you talk about apples.',
  //   parameters: { type: 'object', properties: {}, required: [] }
  // }
  normalizeOpenAiToolInput(input) {
    const { name, description, parameters } = input;
    return {
      name,
      description,
      input_schema: parameters,
    };
  }

  compactContentBlocks(blocks) {
    if (blocks.length === 1 && blocks[0].type === 'text') {
      return blocks[0].text;
    } else {
      return blocks;
    }
  }

  getClientOptions(params) {
    if (params.mcp_servers) {
      return {
        headers: {
          'anthropic-beta': 'mcp-client-2025-11-20',
        },
      };
    }
  }
}
