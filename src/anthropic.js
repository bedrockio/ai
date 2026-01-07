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
      system,
      messages,
      temperature,
      stream = false,
      tokens = DEFAULT_TOKENS,
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

    this.debug('Params:', params, options);
    this.debug('Options:', options, options);

    // @ts-ignore
    return await this.client.messages.create(params, clientOptions);
  }

  async runStream(options) {
    return await this.runPrompt({
      ...options,
      output: 'raw',
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

  getMessagesResponse(response, options) {
    const { messages } = options;
    return {
      messages: [
        ...messages,
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
    };
  }

  normalizeStreamEvent(event) {
    let { type } = event;
    if (type === 'content_block_start') {
      return {
        type: 'start',
      };
    } else if (type === 'content_block_stop') {
      return {
        type: 'stop',
      };
    } else if (type === 'content_block_delta') {
      return {
        type: 'delta',
        text: event.delta.text,
      };
    }
  }

  // Private

  getToolOptions(options) {
    let { tools = [], schema } = options;
    let toolChoice;

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
