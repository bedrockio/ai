const MIN_SUPPORTED_VERSION = '2025-03-26';

const ERROR_INVALID_SESSION = -32000;
const ERROR_UNAUTHORIZED = -32001;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_INVALID_PARAMS = -32602;

export default class McpServer {
  constructor(options = {}) {
    this.validateOptions(options);
    this.options = options;
  }

  async handleRequest(ctx) {
    const { body } = ctx.request;
    const { method } = body;

    if (method === 'notifications/initialized') {
      return;
    }

    this.assertValidTransport(body);
    await this.assertAuthorization(ctx);

    let result;

    if (method === 'initialize') {
      this.setNewSessionId(ctx);
      result = this.initialize(body);
    }

    this.assertValidSession(ctx);

    if (method === 'ping') {
      result = this.ping();
    } else if (method === 'tools/list') {
      result = this.listTools();
    } else if (method === 'tools/call') {
      result = await this.callTool(body, ctx);
    } else if (!result) {
      result = this.unknownMethod();
    }

    return {
      jsonrpc: '2.0',
      id: body.id,
      ...result,
    };
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

  assertValidTransport(body) {
    const { id, method, jsonrpc } = body;
    if (id == null || !method || !jsonrpc) {
      throw new InvalidRequestError();
    }
  }

  async assertAuthorization(ctx) {
    const { apiKeyRequired, isValidApiKey } = this.options;
    const bearer = this.getBearer(ctx);

    if (apiKeyRequired || bearer) {
      const isValid = await isValidApiKey(bearer, ctx);
      if (!isValid) {
        throw new UnauthorizedError();
      }
    }
  }

  assertValidSession(ctx) {
    if (!this.hasValidSessionId(ctx)) {
      throw new InvalidSessionError();
    }
    ctx.set('content-type', 'application/json; charset=utf-8');
  }

  // Calls

  initialize(body) {
    const { protocolVersion } = body.params;
    if (!this.isSupportedVersion(protocolVersion)) {
      return this.invalidVersion(body);
    }

    const { name, version } = this.options;
    return {
      result: {
        protocolVersion,
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
    if (this.hasTool(name)) {
      return await this.callValidTool(name, args, ctx);
    } else {
      return this.invalidToolCall(name);
    }
  }

  async callValidTool(name, args, ctx) {
    const tool = this.getTool(name);
    const result = await tool.handler(args, ctx);
    return {
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
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

  invalidVersion(request) {
    return {
      error: {
        code: ERROR_INVALID_PARAMS,
        message: 'Unsupported protocol version',
        data: {
          requested: request.params.protocolVersion,
          minimum: MIN_SUPPORTED_VERSION,
        },
      },
    };
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

  // Version helpers

  isSupportedVersion(version) {
    return version >= MIN_SUPPORTED_VERSION;
  }
}

class InvalidRequestError extends Error {
  status = 400;

  toJSON() {
    return {
      jsonrpc: '2.0',
      error: {
        code: ERROR_INVALID_REQUEST,
        message: 'Invalid Request',
      },
    };
  }
}

class UnauthorizedError extends Error {
  status = 401;

  toJSON() {
    return {
      jsonrpc: '2.0',
      error: {
        code: ERROR_UNAUTHORIZED,
        message: 'Unauthorized',
      },
    };
  }
}

class InvalidSessionError extends Error {
  status = 404;

  toJSON() {
    return {
      jsonrpc: '2.0',
      error: {
        code: ERROR_INVALID_SESSION,
        message: 'Invalid Session',
      },
    };
  }
}
