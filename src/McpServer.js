const LATEST_PROTOCOL_VERSION = '2025-11-25';
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
];
// Per spec: when a non-initialize HTTP request omits the
// MCP-Protocol-Version header, assume this version.
const ASSUMED_PROTOCOL_VERSION = '2025-03-26';

const ERROR_INVALID_SESSION = -32000;
const ERROR_UNAUTHORIZED = -32001;
const ERROR_FORBIDDEN = -32002;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_INVALID_PARAMS = -32602;

export default class McpServer {
  constructor(options = {}) {
    this.validateOptions(options);
    this.options = options;
  }

  async handleRequest(ctx) {
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
    await this.assertAuthorization(ctx, id);

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

  async assertAuthorization(ctx, id) {
    const { apiKeyRequired, isValidApiKey } = this.options;
    const bearer = this.getBearer(ctx);

    if (apiKeyRequired || bearer) {
      const isValid = await isValidApiKey(bearer, ctx);
      if (!isValid) {
        throw new UnauthorizedError(id);
      }
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
    const { tools = [] } = this.options;
    return {
      result: {
        tools: tools.map((tool) => {
          const { handler, ...rest } = tool;
          return rest;
        }),
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
    const tool = this.getTool(name);
    try {
      await this.validateArgs(tool, args);
      const result = await tool.handler(args, ctx);
      return {
        result: {
          content: [
            {
              type: 'text',
              text:
                typeof result === 'string' ? result : JSON.stringify(result),
            },
          ],
        },
      };
    } catch (err) {
      return {
        result: {
          content: [
            {
              type: 'text',
              text: err.message,
            },
          ],
          isError: true,
        },
      };
    }
  }

  async validateArgs(tool, args) {
    const { inputSchema } = tool;
    if (inputSchema && typeof inputSchema.validate === 'function') {
      await inputSchema.validate(args);
    }
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

  getTool(name) {
    const { tools = [] } = this.options;
    return tools.find((tool) => {
      return tool.name === name;
    });
  }

  hasTool(name) {
    return !!this.getTool(name);
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

  // Authorization helpers

  getBearer(ctx) {
    const authorization = ctx.get('authorization') || '';
    return authorization.match(/Bearer (.+)/)?.[1];
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

class UnauthorizedError extends Error {
  status = 401;

  constructor(id) {
    super('Unauthorized');
    this.id = id;
  }

  toJSON() {
    return {
      jsonrpc: '2.0',
      id: this.id,
      error: {
        code: ERROR_UNAUTHORIZED,
        message: 'Unauthorized',
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
