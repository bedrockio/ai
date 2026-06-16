import Toolset from './Toolset.js';

const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
// Per spec: when a non-initialize HTTP request omits the
// MCP-Protocol-Version header, assume this version.
const ASSUMED_PROTOCOL_VERSION = '2025-03-26';

const ERROR_INVALID_SESSION = -32000;
const ERROR_FORBIDDEN = -32002;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_INVALID_PARAMS = -32602;

export default class McpServer {
  constructor(options = {}) {
    this.validateOptions(options);
    this.options = options;
    this.toolset = this.resolveToolset(options);
  }

  // Accepts either a pre-built Toolset or, for backwards compatibility, a bare
  // `tools` array (plus lifecycle hooks) that is wrapped into one. Either way
  // the server only ever talks to a Toolset from here on.
  resolveToolset(options) {
    const { toolset, tools, onToolCalled, onToolFinished, onToolError } =
      options;
    if (toolset) {
      return toolset;
    }
    return new Toolset({
      tools,
      onToolCalled,
      onToolFinished,
      onToolError,
    });
  }

  async handleRequest(ctx) {
    if (ctx.method !== 'POST') {
      ctx.status = 405;
      ctx.set('allow', 'POST');
      return;
    }

    this.assertValidOrigin(ctx);

    const { body } = ctx.request;

    if (Array.isArray(body)) {
      throw new InvalidRequestError();
    }

    const { method, id } = body;

    if (this.isNotification(method)) {
      ctx.status = 202;
      return;
    }

    this.assertValidTransport(body);

    let result;

    if (method === 'initialize') {
      result = this.initialize(body);
      this.setNewSessionId(ctx);
    } else {
      this.assertValidProtocolVersion(ctx, id);
      this.assertValidSession(ctx, id);

      if (method === 'ping') {
        result = this.ping();
      } else if (method === 'tools/list') {
        result = this.listTools();
      } else if (method === 'tools/call') {
        result = await this.callTool(body, ctx);
      } else {
        result = this.unknownMethod();
      }
    }

    return this.respond(ctx, {
      jsonrpc: '2.0',
      id,
      ...result,
    });
  }

  // Validation

  validateOptions(options) {
    const { name, version } = options;
    if (!name) {
      throw new Error(`"name" required.`);
    } else if (!version) {
      throw new Error(`"version" required.`);
    }
  }

  assertValidOrigin(ctx) {
    const { allowedOrigins } = this.options;
    if (!allowedOrigins) {
      return;
    }
    const origin = ctx.get('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      throw new ForbiddenError();
    }
  }

  assertValidTransport(body) {
    const { id, method, jsonrpc } = body;
    if (id == null || !method || jsonrpc !== '2.0') {
      throw new InvalidRequestError();
    }
  }

  assertValidProtocolVersion(ctx, id) {
    const version = ctx.get('mcp-protocol-version') || ASSUMED_PROTOCOL_VERSION;
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
      throw new InvalidRequestError(id);
    }
  }

  assertValidSession(ctx, id) {
    if (!this.hasValidSessionId(ctx)) {
      throw new InvalidSessionError(id);
    }
  }

  // Calls

  initialize(body) {
    const { protocolVersion } = body.params;
    // Per spec: echo the client's version if we support it,
    // otherwise respond with our latest supported version.
    const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)
      ? protocolVersion
      : LATEST_PROTOCOL_VERSION;

    const { name, version } = this.options;
    return {
      result: {
        protocolVersion: negotiated,
        serverInfo: {
          name,
          version,
        },
        capabilities: {
          tools: {},
        },
      },
    };
  }

  ping() {
    return {
      result: {},
    };
  }

  listTools() {
    return {
      result: {
        tools: this.toolset.getToolDefinitions(),
      },
    };
  }

  async callTool(body, ctx) {
    const { name, arguments: args } = body.params;
    if (!this.hasTool(name)) {
      return this.invalidToolCall(name);
    }
    return await this.callValidTool(name, args, ctx);
  }

  async callValidTool(name, args, ctx) {
    const { result, error } = await this.toolset.call(name, args, ctx);
    if (error) {
      return {
        result: {
          content: [
            {
              type: 'text',
              text: error.message,
            },
          ],
          isError: true,
        },
      };
    }
    return {
      result: {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result),
          },
        ],
      },
    };
  }

  invalidToolCall(name) {
    return {
      error: {
        code: ERROR_INVALID_PARAMS,
        message: `Unknown tool: ${name}`,
      },
    };
  }

  // Error calls

  unknownMethod() {
    return {
      error: {
        code: ERROR_METHOD_NOT_FOUND,
        message: 'Method not found',
      },
    };
  }

  // Helpers

  isNotification(method) {
    return typeof method === 'string' && method.startsWith('notifications/');
  }

  respond(ctx, body) {
    ctx.set('content-type', 'application/json; charset=utf-8');
    ctx.body = body;
    return body;
  }

  // Tool helpers

  hasTool(name) {
    return this.toolset.hasTool(name);
  }

  // Session helpers

  getSessionId(ctx) {
    return this.options.getSessionId?.(ctx);
  }

  hasValidSessionId(ctx) {
    const id = ctx.get('mcp-session-id');
    if (id) {
      return id === this.getSessionId(ctx);
    } else {
      return true;
    }
  }

  setNewSessionId(ctx) {
    const sessionId = this.getSessionId(ctx);
    if (sessionId) {
      ctx.set('mcp-session-id', sessionId);
    }
  }
}

class InvalidRequestError extends Error {
  status = 400;

  constructor(id) {
    super('Invalid Request');
    this.id = id;
  }

  toJSON() {
    return {
      jsonrpc: '2.0',
      id: this.id,
      error: {
        code: ERROR_INVALID_REQUEST,
        message: 'Invalid Request',
      },
    };
  }
}

class ForbiddenError extends Error {
  status = 403;

  toJSON() {
    return {
      jsonrpc: '2.0',
      error: {
        code: ERROR_FORBIDDEN,
        message: 'Forbidden',
      },
    };
  }
}

class InvalidSessionError extends Error {
  status = 404;

  constructor(id) {
    super('Invalid Session');
    this.id = id;
  }

  toJSON() {
    return {
      jsonrpc: '2.0',
      id: this.id,
      error: {
        code: ERROR_INVALID_SESSION,
        message: 'Invalid Session',
      },
    };
  }
}
