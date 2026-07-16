import Anthropic from '@anthropic-ai/sdk';

import BaseClient from './BaseClient.js';

/* Note that max_tokens is a required field on all prompts. */
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicClient extends BaseClient {
  static DEFAULT_MODEL = 'claude-sonnet-4-5';

  constructor(options) {
    super({
      max_tokens: DEFAULT_MAX_TOKENS,
      ...options,
    });
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
      max_tokens,
      temperature,
      stream = false,
      instructions: system = '',
    } = options;

    const params = {
      model,
      stream,
      system,
      max_tokens,
      messages: this.getApiMessages(messages),
      temperature,
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
    // Look up the schema tool specifically — when schema is combined with
    // other tools (e.g. MCP) the response can contain multiple tool_use
    // blocks; only the schema one carries the structured result.
    const toolBlock = response.content.find((block) => {
      return block.type === 'tool_use' && block.name === 'schema';
    });
    return toolBlock?.input || null;
  }

  extractStreamResult(blocks) {
    const schemaBlock = blocks.find((block) => {
      return block.type === 'tool_use' && block.name === 'schema';
    });
    return schemaBlock?.input;
  }

  // Guards against malformed thinking blocks reaching the wire: messages
  // persisted before thinking deltas were accumulated (see
  // normalizeStreamEvent) carry thinking blocks with no content AND no
  // signature, which the API rejects on replay with a 400. Only that shape is
  // dropped. A signed block with empty text is valid — it is the default
  // output on models whose thinking display is "omitted" (Sonnet 5, Opus
  // 4.7+), and the API requires it back unchanged during tool use, decrypting
  // the signature to reconstruct the reasoning.
  getApiMessages(messages) {
    return super
      .getApiMessages(messages)
      .map((message) => {
        const { content } = message;
        if (!Array.isArray(content)) {
          return message;
        }
        return {
          ...message,
          content: content.filter((block) => {
            if (block.type === 'thinking') {
              return !!(block.thinking || block.signature);
            }
            return true;
          }),
        };
      })
      .filter((message) => {
        return typeof message.content === 'string' || message.content.length;
      });
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
              ...this.getMessageTimestamp(options),
            };
          }),
      ],
      usage: this.normalizeUsage(response.usage),
    };
  }

  normalizeUsage(usage) {
    if (usage) {
      const { cache_read_input_tokens, cache_creation_input_tokens } = usage;
      return {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        // The cache fields make cache hits observable (a zero read count on
        // repeated requests means a silent invalidator). They are only
        // included when the API reported them, so payloads without caching
        // are unchanged.
        ...(cache_read_input_tokens != null && {
          cache_read_input_tokens,
        }),
        ...(cache_creation_input_tokens != null && {
          cache_creation_input_tokens,
        }),
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
      } else if (event.delta.type === 'input_json_delta') {
        block.partial ||= '';
        block.partial += event.delta.partial_json;
      } else if (event.delta.type === 'thinking_delta') {
        // Thinking blocks must be accumulated in full: when the model thinks
        // before a tool call, the API requires the complete thinking block
        // (content and signature) to be replayed alongside the tool results,
        // and rejects an empty one.
        block.thinking ||= '';
        block.thinking += event.delta.thinking;
      } else if (event.delta.type === 'signature_delta') {
        block.signature ||= '';
        block.signature += event.delta.signature;
      }
    } else if (type === 'content_block_stop') {
      const block = options.blocks.get(event.index);

      if (typeof block.partial === 'string') {
        try {
          block.input = JSON.parse(block.partial);
        } catch {
          block.input = {};
        } finally {
          delete block.partial;
        }
      }

      if (block.type !== 'text') {
        return event;
      }
    } else if (type === 'message_start') {
      return { type: 'start' };
    } else if (type === 'message_delta') {
      options.usage = event.usage;
    } else if (type === 'message_stop') {
      const blocks = Array.from(options.blocks.values());
      // The final turn's thinking blocks are kept out of the persisted
      // message. The API only requires thinking blocks back when a tool-use
      // turn is replayed — the tool loop handles that with the raw blocks
      // (see appendToolExchange) — and explicitly allows prior turns to omit
      // them. Dropping them here is also cache-safe and cheaper: this message
      // was never part of a request prefix, so no cache entry is invalidated,
      // and on Opus 4.5+ / Sonnet 4.6+ a replayed thinking block is kept in
      // context and billed as input on every later turn. Intermediate
      // tool-use turns keep theirs — those bytes were already sent (and
      // cached) during the loop, so stripping them would invalidate the
      // conversation cache.
      const messageBlocks = blocks.filter((block) => {
        return block.type !== 'thinking' && block.type !== 'redacted_thinking';
      });
      return {
        type: 'stop',
        ...this.getResultParams(options),
        ...this.getStreamResult(blocks, options),
        messages: [
          ...this.getFilteredMessages(options),
          {
            role: 'assistant',
            content: this.compactContentBlocks(messageBlocks),
            ...this.getMessageTimestamp(options),
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
      // Capture whether the caller passed other tools BEFORE the schema tool
      // is pushed, so the comparison reflects user-supplied tools only.
      const hasOtherTools = tools.length > 0;
      tools.push({
        name: 'schema',
        description:
          'Call this tool with your final answer to return structured output matching the schema.',
        input_schema: schema,
      });
      // Only force the schema tool when it is the only tool in scope. When
      // other tools are present (e.g. MCP) leave it to 'auto' so the model
      // can call those first and then finalize with the schema tool — a
      // forced tool_choice would block multi-step agent flows.
      toolChoice = hasOtherTools
        ? { type: 'auto' }
        : { type: 'tool', name: 'schema' };
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
    // Local tools carry a `handler` (stripped — it never goes over the wire)
    // and may declare their schema as `inputSchema` (e.g. a yada schema, which
    // serializes via toJSON). Project these to the Anthropic custom-tool shape.
    if (input.handler || input.inputSchema) {
      const { handler, inputSchema, ...rest } = input;
      return {
        ...rest,
        input_schema:
          rest.input_schema || inputSchema?.toJSON?.() || inputSchema,
      };
    }
    return input;
  }

  getToolCalls(response) {
    return (response?.content || [])
      .filter((block) => {
        return block.type === 'tool_use';
      })
      .map((block) => {
        return {
          id: block.id,
          name: block.name,
          input: block.input,
        };
      });
  }

  formatToolResult(call, result, error) {
    const text = error
      ? error.message
      : typeof result === 'string'
        ? result
        : JSON.stringify(result);
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: text,
      ...(error && {
        is_error: true,
      }),
    };
  }

  // Re-emits the assistant turn for the next request, keeping text blocks and
  // only the tool_use blocks we are returning results for. Any other tool_use
  // (e.g. a premature schema call) is dropped so every tool_use has a matching
  // tool_result, as the API requires.
  formatAssistantMessage(response, calls) {
    const ids = new Set(
      calls.map((call) => {
        return call.id;
      }),
    );
    const content = response.content.filter((block) => {
      return block.type !== 'tool_use' || ids.has(block.id);
    });
    return {
      role: 'assistant',
      content,
    };
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
