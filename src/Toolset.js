// A transport-agnostic set of actions an application can perform for an LLM.
//
// A Toolset holds the tool definitions (name, description, inputSchema and
// handler) and owns the concerns common to every way those tools might be
// exposed: looking them up, validating arguments, invoking the handler and
// firing lifecycle hooks. It deliberately knows nothing about HOW the tools
// are surfaced to a model — that is the job of an adapter.
//
// Two adapters consume a Toolset:
//
//   - McpServer wraps one and exposes it over the MCP JSON-RPC protocol so the
//     loop runs on the model provider's infrastructure.
//   - A client runs the loop locally, calling handlers in-process.
//
// Because the definitions are independent of the transport, moving a tool from
// local execution to a remote MCP server (or back) is a matter of where the
// same Toolset is handed, not a rewrite.
export default class Toolset {
  constructor(options = {}) {
    this.options = options;
    this.tools = options.tools || [];
  }

  getTool(name) {
    return this.tools.find((tool) => {
      return tool.name === name;
    });
  }

  hasTool(name) {
    return !!this.getTool(name);
  }

  // Returns the tool definitions with handlers stripped, leaving only the
  // fields that describe a tool to a model. Serialization of `inputSchema`
  // (e.g. a yada schema -> JSON schema) is left to the consumer.
  getToolDefinitions() {
    return this.tools.map((tool) => {
      const { handler, ...rest } = tool;
      return rest;
    });
  }

  async validate(tool, args) {
    const { inputSchema } = tool;
    if (inputSchema && typeof inputSchema.validate === 'function') {
      await inputSchema.validate(args);
    }
  }

  // Executes a tool by name and returns a transport-neutral outcome:
  // `{ result }` on success or `{ error }` on failure. Validation failures and
  // thrown handlers are caught and surfaced as `{ error }` so callers can shape
  // them into whatever their transport expects (an MCP `isError` payload, an
  // Anthropic `tool_result` block, etc.) rather than the loop throwing out.
  async call(name, args, context) {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        error: new Error(`Unknown tool: ${name}`),
      };
    }
    try {
      await this.validate(tool, args);
      this.options.onToolCalled?.(name, args);
      const result = await tool.handler(args, context);
      this.options.onToolFinished?.(name, result);
      return {
        result,
      };
    } catch (error) {
      this.options.onToolError?.(name, error);
      return {
        error,
      };
    }
  }
}
