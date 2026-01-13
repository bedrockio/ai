import yd from '@bedrockio/yada';
import { describe, expect, it } from 'vitest';

import McpServer from '../src/McpServer';

class MockContext {
  constructor(request) {
    this.request = request;
    this.response = {
      headers: {},
    };
  }

  get(name) {
    return this.request.headers?.[name];
  }

  set(name, value) {
    this.response.headers[name] = value;
  }
}

describe('McpServer', () => {
  it('should require a server name and version on setup', async () => {
    expect(() => {
      new McpServer();
    }).toThrow('"name" required');
    expect(() => {
      new McpServer({
        name: 'MyServer',
      });
    }).toThrow('"version" required');
    expect(() => {
      new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });
    }).not.toThrow();
  });

  it('should handle initialize request', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'init-1',
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: {
          name: 'MyServer',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    });
  });

  it('should handle initialized notification', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toBeUndefined();
  });

  it('should list available tools', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
      tools: [
        {
          name: 'MyTool',
          description: 'It does stuff.',
          inputSchema: yd.object({
            foo: yd.string(),
          }),
        },
      ],
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'list-1',
        method: 'tools/list',
      },
    });

    const result = await server.handleRequest(ctx);

    expect(JSON.parse(JSON.stringify(result))).toEqual({
      jsonrpc: '2.0',
      id: 'list-1',
      result: {
        tools: [
          {
            name: 'MyTool',
            description: 'It does stuff.',
            inputSchema: {
              type: 'object',
              properties: {
                foo: {
                  type: 'string',
                },
              },
              required: [],
              additionalProperties: false,
            },
          },
        ],
      },
    });
  });

  it('should call my tool', async () => {
    let called = null;

    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
      tools: [
        {
          name: 'MyTool',
          description: 'It does stuff.',
          inputSchema: yd.object({
            foo: yd.string(),
          }),
          handler(args) {
            called = args;
            return ['hello'];
          },
        },
      ],
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: 'MyTool',
          arguments: {
            foo: 'bar',
          },
        },
      },
    });

    const result = await server.handleRequest(ctx);

    expect(called).toEqual({ foo: 'bar' });

    expect(JSON.parse(JSON.stringify(result))).toEqual({
      jsonrpc: '2.0',
      id: 'call-1',
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(['hello']),
          },
        ],
      },
    });
  });

  it('should handle ping request', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'ping-1',
        method: 'ping',
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'ping-1',
      result: {},
    });
  });

  it('should handle unknown method', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'error-1',
        method: 'unknown/method',
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'error-1',
      error: {
        code: -32601,
        message: 'Method not found',
      },
    });
  });

  it('should handle unknown tool call', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'error-2',
        method: 'tools/call',
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 'error-2',
      error: {
        code: -32602,
        message: 'Unknown tool: nonexistent_tool',
      },
    });
  });

  it('should include proper headers', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        id: 'header-1',
        method: 'ping',
      },
    });

    await server.handleRequest(ctx);

    expect(ctx.response.headers['content-type']).toBe(
      'application/json; charset=utf-8'
    );
  });

  describe('errors', () => {
    it('should return error for missing jsonrpc field', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        body: {
          id: 'init-2',
          method: 'initialize',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(400);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('should return error for missing id', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          method: 'tools/list',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(400);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('should return error for missing method', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'test-1',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(400);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('should return error for unsupported protocol version', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'init-bad',
          method: 'initialize',
          params: {
            protocolVersion: '1.0.0',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        },
      });

      const result = await server.handleRequest(ctx);

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        jsonrpc: '2.0',
        id: 'init-bad',
        error: {
          code: -32602,
          message: 'Unsupported protocol version',
          data: {
            minimum: '2025-03-26',
            requested: '1.0.0',
          },
        },
      });
    });
  });

  describe('sessions', () => {
    it('should return session ID on initialize', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        getSessionId(ctx) {
          return ctx.request.headers.cookie;
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'init-1',
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: {
              name: 'test-client',
              version: '1.0.0',
            },
          },
        },
        headers: {
          cookie: 'cookie',
        },
      });

      await server.handleRequest(ctx);
      expect(ctx.response.headers['mcp-session-id']).toBe('cookie');
    });

    it('should accept valid session ID in subsequent requests', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        getSessionId(ctx) {
          return ctx.request.headers.cookie;
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {
          cookie: 'cookie',
          'mcp-session-id': 'cookie',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result).toEqual({
        id: 'list-1',
        jsonrpc: '2.0',
        result: {
          tools: [],
        },
      });
    });

    it('should return 404 for invalid session ID', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        getSessionId(ctx) {
          return ctx.request.headers.cookie;
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {
          'mcp-session-id': 'invalid-session-id',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(404);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Invalid Session',
        },
      });
    });
  });

  describe('authorization', () => {
    it('should require api key', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        apiKeyRequired: true,
        isValidApiKey(key) {
          return key === 'my-api-key';
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(401);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized',
        },
      });
    });

    it('should error on invalid api-key', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        apiKeyRequired: true,
        isValidApiKey(key) {
          return key === 'my-api-key';
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {
          authorization: 'Bearer invalid-key',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(401);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized',
        },
      });
    });

    it('should allow valid api-key', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        apiKeyRequired: true,
        isValidApiKey(key) {
          return key === 'my-api-key';
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {
          authorization: 'Bearer my-api-key',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        jsonrpc: '2.0',
        id: 'list-1',
        result: {
          tools: [],
        },
      });
    });

    it('should allow optional api key', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        isValidApiKey(key) {
          return key === 'my-api-key';
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {},
      });

      const result = await server.handleRequest(ctx);

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        jsonrpc: '2.0',
        id: 'list-1',
        result: {
          tools: [],
        },
      });
    });

    it('should have asynchronous api key check', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        async isValidApiKey(key) {
          return key === 'my-api-key';
        },
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'list-1',
          method: 'tools/list',
        },
        headers: {
          authorization: 'Bearer my-api-key',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(JSON.parse(JSON.stringify(result))).toEqual({
        jsonrpc: '2.0',
        id: 'list-1',
        result: {
          tools: [],
        },
      });
    });
  });
});
