import yd from '@bedrockio/yada';
import { describe, expect, it } from 'vitest';

import McpServer from '../src/McpServer';

class MockContext {
  constructor(request) {
    this.request = request;
    this.method = request.method || 'POST';
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
    expect(ctx.status).toBe(202);
    expect(ctx.body).toBeUndefined();
  });

  it('should accept any notifications/* method with 202', async () => {
    const server = new McpServer({
      name: 'MyServer',
      version: '1.0.0',
    });

    const ctx = new MockContext({
      body: {
        jsonrpc: '2.0',
        method: 'notifications/cancelled',
        params: { requestId: 'req-1' },
      },
    });

    const result = await server.handleRequest(ctx);

    expect(result).toBeUndefined();
    expect(ctx.status).toBe(202);
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

    it('should negotiate down to the latest supported version', async () => {
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
        result: {
          protocolVersion: '2025-11-25',
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
        id: 'list-1',
        error: {
          code: -32000,
          message: 'Invalid Session',
        },
      });
    });
  });

  describe('protocol version header', () => {
    it('should accept a request with no MCP-Protocol-Version header', async () => {
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

    it('should accept a supported MCP-Protocol-Version', async () => {
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
        headers: {
          'mcp-protocol-version': '2025-11-25',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result).toEqual({});
    });

    it('should reject an unsupported MCP-Protocol-Version', async () => {
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
        headers: {
          'mcp-protocol-version': '1.0.0',
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
        id: 'ping-1',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      });
    });

    it('should not enforce the version header on initialize', async () => {
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
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' },
          },
        },
        headers: {
          'mcp-protocol-version': '1.0.0',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.id).toBe('init-1');
      expect(result.result.protocolVersion).toBe('2025-11-25');
    });
  });

  describe('origin validation', () => {
    it('should accept any origin when allowedOrigins is not set', async () => {
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
        headers: {
          origin: 'https://attacker.example.com',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result).toEqual({});
    });

    it('should accept an allowed origin', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        allowedOrigins: ['https://app.example.com'],
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'ping-1',
          method: 'ping',
        },
        headers: {
          origin: 'https://app.example.com',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result).toEqual({});
    });

    it('should reject a disallowed origin with 403', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        allowedOrigins: ['https://app.example.com'],
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'ping-1',
          method: 'ping',
        },
        headers: {
          origin: 'https://attacker.example.com',
        },
      });

      let error;
      try {
        await server.handleRequest(ctx);
      } catch (err) {
        error = err;
      }

      expect(error.status).toBe(403);
      expect(JSON.parse(JSON.stringify(error))).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32002,
          message: 'Forbidden',
        },
      });
    });

    it('should accept a request with no Origin header', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        allowedOrigins: ['https://app.example.com'],
      });

      const ctx = new MockContext({
        body: {
          jsonrpc: '2.0',
          id: 'ping-1',
          method: 'ping',
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result).toEqual({});
    });
  });

  describe('http method', () => {
    it('should return 405 for non-POST requests', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        method: 'GET',
      });

      const result = await server.handleRequest(ctx);

      expect(result).toBeUndefined();
      expect(ctx.status).toBe(405);
      expect(ctx.response.headers['allow']).toBe('POST');
    });
  });

  describe('batched requests', () => {
    it('should reject array bodies as Invalid Request', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
      });

      const ctx = new MockContext({
        body: [
          {
            jsonrpc: '2.0',
            id: 'ping-1',
            method: 'ping',
          },
        ],
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
  });

  describe('tool execution', () => {
    it('should return isError when input fails schema validation', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        tools: [
          {
            name: 'MyTool',
            description: 'It does stuff.',
            inputSchema: yd.object({
              foo: yd.string().required(),
            }),
            handler() {
              return 'should not run';
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
            arguments: {},
          },
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result.isError).toBe(true);
      expect(result.result.content[0].type).toBe('text');
      expect(typeof result.result.content[0].text).toBe('string');
    });

    it('should return isError when handler throws', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        tools: [
          {
            name: 'MyTool',
            description: 'It does stuff.',
            handler() {
              throw new Error('boom');
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
            arguments: {},
          },
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result).toEqual({
        content: [{ type: 'text', text: 'boom' }],
        isError: true,
      });
    });

    it('should not double-stringify a string result', async () => {
      const server = new McpServer({
        name: 'MyServer',
        version: '1.0.0',
        tools: [
          {
            name: 'MyTool',
            description: 'It does stuff.',
            handler() {
              return 'hello';
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
            arguments: {},
          },
        },
      });

      const result = await server.handleRequest(ctx);

      expect(result.result.content[0].text).toBe('hello');
    });
  });
});
