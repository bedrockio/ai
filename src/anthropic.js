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
      usage: this.normalizeUsage(response),
    };
  }

  normalizeUsage(response) {
    return {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    };
  }

  normalizeStreamEvent(event, options) {
    let { type } = event;
    options.buffer ||= '';
    if (type === 'content_block_start') {
      const { content_block } = event;
      if (content_block?.type === 'tool_use') {
        return {
          type: 'function_call',
          id: content_block.id,
          name: content_block.name,
          arguments: content_block.input,
        };
      } else {
        return {
          type: 'start',
        };
      }
    } else if (type === 'content_block_delta') {
      if (event.delta.type === 'text_delta') {
        options.buffer += event.delta.text;
        return {
          type: 'delta',
          delta: event.delta.text,
        };
      }
    } else if (type === 'message_delta') {
      return {
        type: 'stop',
        messages: [
          ...this.getFilteredMessages(options),
          {
            role: 'assistant',
            content: options.buffer,
          },
        ],
        usage: this.normalizeUsage(event),
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
        return this.mapMcpTool(tool);
      });

    tools = tools.filter((tool) => {
      return tool.type !== 'mcp';
    });

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

  // Map OpenAI-like input of MCP servers as "tools" to
  // Anthropic's mcp_servers.
  mapMcpTool(tool) {
    const { server_label, server_url } = tool;
    return {
      type: 'url',
      name: server_label,
      url: server_url,
    };
  }

  getClientOptions(params) {
    if (params.mcp_servers) {
      return {
        headers: {
          'anthropic-beta': 'mcp-client-2025-04-04',
        },
      };
    }
  }
}
