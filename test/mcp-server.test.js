import { describe, expect, it } from 'vitest';

import McpServer from '../src/McpServer';

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
});
