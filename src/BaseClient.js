import { existsSync } from 'node:fs';

import { TemplateRenderer } from '@bedrockio/templates';

import Toolset from './Toolset.js';
import { parseCode } from './utils/code.js';
import { createMessageExtractor } from './utils/json.js';

// The underlying SDKs (Anthropic, OpenAI) already retry 2x
// before they surface a 529, so by the time we see one the
// API has been hit a few times. Our layer is the safety net
// for sustained outages. With 5/30s the delays are:
// 1, 2, 4, 8, 16, 30 ≈ 1 min total wait - long enough to ride
// out a real overload blip, short enough not to feel broken.
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_MAX_BACKOFF = 30_000;

// Safety bound on the local tool loop so a model that keeps calling tools can
// never spin forever. Each round is one extra round-trip after the first.
const DEFAULT_MAX_TOOL_ROUNDS = 12;

export default class BaseClient {
  constructor(options) {
    this.options = {
      // @ts-ignore
      model: this.constructor.DEFAULT_MODEL,
      maxRetries: DEFAULT_MAX_RETRIES,
      maxBackoff: DEFAULT_MAX_BACKOFF,
      ...options,
    };
    this.renderer = new TemplateRenderer({
      dir: options.templates,
    });
    this.assertTemplatesDir();
  }

  assertTemplatesDir() {
    const { templates } = this.options;
    if (templates && !existsSync(templates)) {
      throw new Error(`Directory not found: ${templates}`);
    }
  }

  // Public

  /**
   * Interpolates vars into the provided template as instructions and runs the
   * prompt.
   *
   * @param {PromptOptions} options
   */
  async prompt(options) {
    options = this.normalizeOptions(options);

    const { output, stream, schema, prompt, instructions } = options;

    let response;
    try {
      // Runs the model and, when local tools are in play, drives the tool loop
      // in-process so this single call returns only once the model has produced
      // its final (non-tool) response — mirroring how a remote MCP server
      // resolves tools server-side within one call. `options` is reassigned to
      // carry the full message exchange for the response below.
      ({ response, options } = await this.runToolLoop(options));
    } catch (error) {
      options.onError?.(error);
      throw this.getTransformedError(error, options);
    }

    if (!stream) {
      this.debug('Response:', response, options);
    }

    let result;
    if (schema) {
      result = this.getStructuredResponse(response);

      // @ts-ignore
      if (options.hasWrappedSchema) {
        result = result.items;
      }
    } else if (output === 'json') {
      result = JSON.parse(parseCode(this.getTextResponse(response)));
    } else {
      result = parseCode(this.getTextResponse(response));
    }

    return {
      result,
      prompt,
      response,
      instructions,
      ...this.normalizeResponse(response, options),
    };
  }

  runPromptSwitch(options) {
    if (this.canRunWithBackoff(options)) {
      return this.runPromptWithBackoff(options);
    } else {
      return this.runPrompt(options);
    }
  }

  async runPromptWithBackoff(options) {
    try {
      const { backoffDelay = 0 } = options;

      await new Promise((resolve) => {
        setTimeout(resolve, backoffDelay);
      });

      return await this.runPrompt(options);
    } catch (error) {
      if (error.status === 529) {
        return this.runPromptSwitch({
          ...options,
          ...this.getNextBackoffProps(options),
        });
      } else {
        throw error;
      }
    }
  }

  getNextBackoffProps(options) {
    let { retries, backoffDelay, maxBackoff } = options;
    if (backoffDelay) {
      backoffDelay = Math.min(maxBackoff, backoffDelay * 2);
    } else {
      backoffDelay = 1000;
    }

    if (retries == null) {
      retries = 0;
    }
    retries += 1;

    return {
      backoffDelay,
      retries,
    };
  }

  canRunWithBackoff(options) {
    const { backoff, stream, retries = 0, maxRetries } = options;

    if (!backoff || stream) {
      return false;
    }

    if (retries >= maxRetries) {
      return false;
    }

    return true;
  }

  // Drives the local tool loop. Runs the prompt; while the model keeps calling
  // tools that have a local handler, executes them, feeds the results back, and
  // runs again. Tools without a local handler end the loop: the schema tool is
  // left for the caller to extract and remote MCP tools are resolved by the
  // provider. Returns the final response along with the options carrying the
  // full message exchange. With no local tools this is a single-shot call,
  // behaving exactly as a bare runPromptSwitch.
  async runToolLoop(options) {
    const toolset = this.getLocalToolset(options);

    let response = await this.runPromptSwitch(options);

    if (!toolset) {
      return { response, options };
    }

    const { maxToolRounds = DEFAULT_MAX_TOOL_ROUNDS } = options;

    for (let round = 0; round < maxToolRounds; round++) {
      const calls = this.getLocalToolCalls(response, toolset);

      if (!calls.length) {
        break;
      }

      const toolResults = await this.runToolCalls(
        calls,
        toolset,
        options.context,
      );
      options = this.appendToolExchange(options, response, calls, toolResults);

      response = await this.runPromptSwitch(options);
    }

    return {
      response,
      options,
    };
  }

  // A tool is "local" purely by virtue of having a handler. An explicit
  // `toolset` is preferred (its lifecycle hooks are retained); otherwise any
  // handler-bearing tools are gathered into an ad-hoc toolset for execution.
  getLocalToolset(options) {
    if (options.toolset) {
      return options.toolset;
    }
    const tools = (options.tools || []).filter((tool) => {
      return typeof tool.handler === 'function';
    });
    if (!tools.length) {
      return null;
    }
    return new Toolset({
      tools,
    });
  }

  // The tool_use blocks in a response that map to a local handler — i.e. the
  // ones the loop is responsible for executing (skips the schema tool and any
  // remote MCP tools).
  getLocalToolCalls(response, toolset) {
    return this.getToolCalls(response).filter((call) => {
      return toolset.hasTool(call.name);
    });
  }

  // Executes each call against the toolset, returning a tool_result block per
  // call (errors are folded into the result, not thrown — see Toolset.call).
  async runToolCalls(calls, toolset, context) {
    const results = [];
    for (let call of calls) {
      const { result, error } = await toolset.call(
        call.name,
        call.input,
        context,
      );
      results.push(this.formatToolResult(call, result, error));
    }
    return results;
  }

  // Appends the assistant tool-use turn plus the user tool-result turn to the
  // message history for the next round. Shared by the prompt and stream loops.
  appendToolExchange(options, response, calls, toolResults) {
    return {
      ...options,
      messages: [
        ...options.messages,
        this.formatAssistantMessage(response, calls),
        {
          role: 'user',
          content: toolResults,
        },
      ],
    };
  }

  /**
   * Streams the prompt response.
   *
   * @param {PromptOptions & StreamOptions} options
   * @returns {AsyncIterator}
   */
  async *stream(options) {
    options = this.normalizeOptions(options);

    const extractor = this.getMessageExtractor(options);
    const toolset = this.getLocalToolset(options);
    const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;

    try {
      // Streaming counterpart of runToolLoop: each round streams a turn, and
      // while the model keeps calling local tools the turn's stop event is
      // swallowed, the tools are run, the exchange is folded into the messages,
      // and the next turn is streamed. The consumer sees one continuous stream
      // — a single 'start', deltas flowing across rounds, and one final 'stop'
      // carrying the full exchange. With no local tools it is a single pass,
      // behaving exactly as before.
      let started = false;

      for (let round = 0; ; round++) {
        // Fresh block accumulator per turn (normalizeStreamEvent fills it).
        options.blocks = new Map();

        const stream = await this.runStream(options);

        let stopEvent;

        // @ts-ignore
        for await (let event of stream) {
          this.debug('Event:', event, options);

          event = this.normalizeStreamEvent(event, options);

          if (!event) {
            continue;
          }

          // Hold the turn's stop — it is only surfaced once the loop ends.
          if (event.type === 'stop') {
            stopEvent = event;
            break;
          }

          // Emit a single 'start' so multiple turns read as one stream.
          if (event.type === 'start') {
            if (started) {
              continue;
            }
            started = true;
          }

          yield event;

          const extractedMessages = extractor?.(event) || [];

          for (let message of extractedMessages) {
            const { key, delta, text, done } = message;

            let extractEvent;
            if (done) {
              extractEvent = {
                type: 'extract:done',
                text,
                key,
              };
            } else {
              extractEvent = {
                type: 'extract:delta',
                delta,
                key,
              };
            }

            this.debug('Extract:', extractEvent, options);

            yield extractEvent;
          }
        }

        const blocks = Array.from(options.blocks.values());
        const response = {
          content: blocks,
        };
        const calls = toolset
          ? this.getLocalToolCalls(response, toolset)
          : [];

        // Terminal: no local tool calls (or none possible), or the safety
        // bound was reached — surface the held stop and finish.
        if (!calls.length || round >= maxToolRounds) {
          if (stopEvent) {
            yield stopEvent;
          }
          return;
        }

        // Otherwise run the tools, fold the exchange in, and stream the next
        // turn.
        const toolResults = await this.runToolCalls(
          calls,
          toolset,
          options.context,
        );
        options = this.appendToolExchange(
          options,
          response,
          calls,
          toolResults,
        );
      }
    } catch (error) {
      if (error.error?.error.type === 'overloaded_error') {
        error.status = 529;
      }
      const { code, status, message } = this.getTransformedError(
        error,
        options,
      );
      yield {
        type: 'error',
        code,
        status,
        message,
      };
    }
  }

  /**
   * Gets the source for a given template.
   *
   * @param {string} name
   */
  getTemplateSource(name) {
    return this.renderer.getTemplateSource(name);
  }

  getFilteredMessages(options) {
    const { messages = [] } = options;
    return messages
      .map((message) => {
        const { content } = message;
        return {
          ...message,
          content: this.getFilteredContent(content),
        };
      })
      .filter((message) => {
        const { content } = message;
        if (typeof content === 'string') {
          return !!content;
        } else {
          return content.length > 0;
        }
      });
  }

  getFilteredContent(content) {
    if (typeof content === 'string') {
      return this.isEmptyContent(content) ? '' : content;
    } else {
      return content.filter((block) => {
        const { type, text } = block;
        if (type === 'text') {
          return !this.isEmptyContent(text);
        } else {
          return true;
        }
      });
    }
  }

  getResultParams(options) {
    let { input, prompt, instructions } = options;

    prompt ||= this.getFallbackPrompt(options);
    instructions ||= input;

    return {
      prompt,
      instructions,
    };
  }

  // Message-level fields like `timestamp` are useful for the consumer
  // (chat UIs, logs) but are rejected by the upstream SDKs as "extra
  // inputs". Strip back to the canonical role/content shape just before
  // hitting the wire — output messages still carry the extras through
  // because `getFilteredMessages` spreads the originals.
  getApiMessages(messages) {
    return messages.map((message) => {
      const { role, content } = message;
      return {
        role,
        content,
      };
    });
  }

  getMessageTimestamp(options) {
    if (options.timestamps) {
      return {
        timestamp: new Date(),
      };
    }
  }

  getFallbackPrompt(options) {
    const { input, instructions } = options;
    if (input && instructions) {
      return `
=== SYSTEM ===

${instructions}

=== USER ===

${input}
      `.trim();
    } else {
      return instructions || input;
    }
  }

  isEmptyContent(str) {
    str = str.trim();
    return !str || str === '.';
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

  /**
   * @returns {Object}
   */
  getStructuredResponse(response) {
    void response;
    throw new Error('Method not implemented.');
  }

  // Streaming counterpart to getStructuredResponse: when a schema is in play
  // the assistant's structured payload is buried in the accumulated content
  // blocks. Subclasses implement extractStreamResult(blocks) to pull out the
  // raw value (transport-specific — e.g. an Anthropic tool_use input vs an
  // OpenAI JSON-formatted text block); this method handles the schema gate,
  // the wrapped-array unwrap, and the `{ result }` envelope so the emitted
  // `stop` event mirrors prompt()'s return shape.
  getStreamResult(blocks, options) {
    if (!options.schema) {
      return {};
    }
    const raw = this.extractStreamResult(blocks);
    if (raw == null) {
      return {};
    }
    return {
      result: options.hasWrappedSchema ? raw?.items : raw,
    };
  }

  /**
   * @returns {Object}
   */
  extractStreamResult(blocks) {
    void blocks;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  normalizeResponse(response, options) {
    void response;
    void options;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  normalizeStreamEvent(event, options) {
    void event;
    void options;
    throw new Error('Method not implemented.');
  }

  normalizeContentBlock(block) {
    void block;
    throw new Error('Method not implemented.');
  }

  normalizeFileBlock(block) {
    void block;
    throw new Error('Method not implemented.');
  }

  compactContentBlocks(blocks) {
    void blocks;
    throw new Error('Method not implemented.');
  }

  // Tool-loop hooks. Implemented per platform because the response and message
  // shapes differ (Anthropic content blocks vs OpenAI tool_calls, etc.). Only
  // invoked when a local toolset is present.

  /**
   * @returns {Array}
   */
  getToolCalls(response) {
    void response;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  formatToolResult(call, result, error) {
    void call;
    void result;
    void error;
    throw new Error('Method not implemented.');
  }

  /**
   * @returns {Object}
   */
  formatAssistantMessage(response, calls) {
    void response;
    void calls;
    throw new Error('Method not implemented.');
  }

  // Private

  /**
   * @returns {Object}
   */
  normalizeOptions(options) {
    const merged = {
      ...this.options,
      ...options,
    };
    return {
      ...merged,
      ...this.normalizeInputs(merged),
      ...this.normalizeSchema(merged),
      ...this.normalizeTools(merged),
    };
  }

  // Folds a `toolset` option into the `tools` array so a single channel feeds
  // both the wire payload (handlers are stripped downstream) and the local
  // loop. When no toolset is given, `tools` is left untouched.
  normalizeTools(options) {
    const { toolset, tools } = options;
    if (!toolset) {
      return;
    }
    return {
      tools: [
        ...(tools || []),
        ...toolset.tools,
      ],
    };
  }

  normalizeInputs(options) {
    options = this.normalizeTemplateOptions(options);

    let { prompt, instructions, output = 'text' } = options;

    if (output === 'json') {
      instructions = [instructions, 'Output only valid JSON.'].join('\n\n');
    }

    const messages = this.normalizeMessages(options);

    return {
      prompt,
      messages,
      instructions,
    };
  }

  normalizeTemplateOptions(options) {
    const { template, params } = options;

    if (!template) {
      return options;
    }

    const { sections, body: prompt } = this.renderer.run({
      params,
      template,
    });

    let instructions = '';

    let { messages = [] } = options;

    // Templates may contain multiple roles, ie SYSTEM or USER, making them
    // useful for one-off prompting. However in a multi-turn conversation
    // the entire chat history will be passed, so do not inject user messages
    // when they already exist in the options.
    const hasUserMessages = messages.some((message) => {
      return message.role === 'user';
    });

    for (let section of sections) {
      const { title = 'system', content } = section;

      const role = title.toLowerCase();

      if (role === 'system') {
        instructions += [instructions, content].join('\n');
      } else if (!hasUserMessages) {
        messages = [
          ...messages,
          {
            role,
            content,
          },
        ];
      }
    }

    instructions = instructions.trim();

    return {
      ...options,
      instructions,
      messages,
      prompt,
    };
  }

  normalizeMessages(options) {
    const { files = [] } = options;

    let { input, messages = [] } = options;

    if (Array.isArray(input)) {
      messages = input;
    } else if (typeof input === 'string') {
      messages = [
        ...messages,
        {
          role: 'user',
          content: input,
          ...this.getMessageTimestamp(options),
        },
      ];
    } else if (!input && !messages.length) {
      messages = [
        {
          role: 'user',
        },
      ];
    }

    return messages.map((message) => {
      let { content } = message;

      if (files.length) {
        content = [
          ...this.expandContentBlocks(content),
          ...files.map((block) => {
            return this.normalizeFileBlock(block);
          }),
        ];
      } else if (!content) {
        // If no user input is passed, coerce it to a single period.
        // Combined with getFilteredMessages below this allows
        // a chatbot the ability to "speak first" by prompting it with empty
        // content. The empty message will be filtered out of the final result
        // appearing as if the chatbot went first.
        // Note that:
        // GPT will fail on an empty string but on whitespace
        // Anthropic will fail on all whitespace
        content = '.';
      }

      if (Array.isArray(content)) {
        content = content.map((block) => {
          const isToolUse =
            block.type === 'mcp_tool_use' || block.type === 'tool_use';
          if (isToolUse && !block.input) {
            return {
              ...block,
              input: {},
            };
          } else {
            return block;
          }
        });
      }

      return {
        ...message,
        content,
      };
    });
  }

  expandContentBlocks(content) {
    if (typeof content === 'string') {
      content = [
        {
          type: 'text',
          text: content,
        },
      ];
    } else if (!content) {
      content = [];
    }
    return content.map((block) => {
      return this.normalizeContentBlock(block);
    });
  }

  normalizeSchema(options) {
    let { schema } = options;

    if (!schema) {
      return;
    }

    let hasWrappedSchema = false;

    // Convert to JSON schema.
    schema = schema.toJSON?.() || schema;

    if (schema?.type === 'array') {
      schema = {
        type: 'object',
        properties: {
          items: schema,
        },
        required: ['items'],
        additionalProperties: false,
      };
      hasWrappedSchema = true;
    }

    return {
      schema,
      hasWrappedSchema,
    };
  }

  getMessageExtractor(options) {
    const { extractMessages } = options;
    if (!extractMessages) {
      return;
    }
    const messageExtractor = createMessageExtractor([extractMessages]);
    return (event) => {
      if (event?.type === 'delta') {
        return messageExtractor(event.delta);
      }
    };
  }

  getTransformedError(error, options) {
    const { transformError } = options;
    return transformError?.(error) || error;
  }

  debug(message, arg, options) {
    if (options.debug) {
      // TODO: replace with logger when opentelemetry is removed
      // eslint-disable-next-line
      console.debug(`${message}\n${JSON.stringify(arg, null, 2)}\n`);
    }
  }
}

/**
 * @typedef {Object} PromptOptions
 * @property {string} input - Basic input to be comes user message.
 * @property {string} prompt
 * @property {string} instructions
 * @property {PromptMessage[]} messages - Full message input.
 * @property {string} [model] - The model to use.
 * @property {Function} [onError] - Error handler.
 * @property {boolean} stream - Stream response.
 * @property {Object} [schema] - A JSON schema compatible object that defines the output shape.
 * @property {"text" | "json"} [output] - The result output type.
 * @property {Object} [params] - Params to be interpolated into the template.
 *                               May also be passed as additional props to options.
 * @property {Array} [tools] - Tool definitions. A tool carrying a `handler` is run
 *                             locally by the tool loop; others (e.g. an MCP server
 *                             reference) are passed through to the provider.
 * @property {Object} [toolset] - A Toolset whose tools are run locally; folded into `tools`.
 * @property {*} [context] - Passed as the second argument to local tool handlers.
 * @property {number} [maxToolRounds] - Safety bound on local tool-execution rounds.
 */

/**
 * @typedef {Object} StreamOptions
 * @property {string} [extractMessages] - Key in JSON response to extract a message stream from.
 * @property {Map} [blocks] - Internal: per-turn content-block accumulator used by the stream loop.
 */

/**
 * @typedef {Object} PromptMessage
 * @property {"system" | "user" | "assistant"} role
 * @property {string} content
 */
