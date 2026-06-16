import yd from '@bedrockio/yada';
import { describe, expect, it, vi } from 'vitest';

import Toolset from '../src/Toolset';

describe('Toolset', () => {
  describe('lookup', () => {
    it('should find a tool by name', () => {
      const toolset = new Toolset({
        tools: [{ name: 'MyTool' }],
      });
      expect(toolset.getTool('MyTool')).toEqual({ name: 'MyTool' });
      expect(toolset.hasTool('MyTool')).toBe(true);
      expect(toolset.getTool('Nope')).toBeUndefined();
      expect(toolset.hasTool('Nope')).toBe(false);
    });

    it('should default to an empty toolset', () => {
      const toolset = new Toolset();
      expect(toolset.tools).toEqual([]);
      expect(toolset.hasTool('MyTool')).toBe(false);
    });
  });

  describe('getToolDefinitions', () => {
    it('should strip handlers from the definitions', () => {
      const toolset = new Toolset({
        tools: [
          {
            name: 'MyTool',
            description: 'It does stuff.',
            inputSchema: yd.object({ foo: yd.string() }),
            handler() {
              return 'nope';
            },
          },
        ],
      });

      const [def] = toolset.getToolDefinitions();
      expect(def.handler).toBeUndefined();
      expect(def.name).toBe('MyTool');
      expect(def.description).toBe('It does stuff.');
      expect(def.inputSchema).toBeDefined();
    });
  });

  describe('call', () => {
    it('should validate arguments before invoking the handler', async () => {
      const handler = vi.fn();
      const toolset = new Toolset({
        tools: [
          {
            name: 'MyTool',
            inputSchema: yd.object({ foo: yd.string().required() }),
            handler,
          },
        ],
      });

      const { result, error } = await toolset.call('MyTool', {});
      expect(result).toBeUndefined();
      expect(error).toBeInstanceOf(Error);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should return the handler result on success', async () => {
      const toolset = new Toolset({
        tools: [
          {
            name: 'MyTool',
            inputSchema: yd.object({ foo: yd.string() }),
            handler(args) {
              return { echoed: args.foo };
            },
          },
        ],
      });

      const { result, error } = await toolset.call('MyTool', { foo: 'bar' });
      expect(error).toBeUndefined();
      expect(result).toEqual({ echoed: 'bar' });
    });

    it('should forward the context to the handler', async () => {
      const handler = vi.fn();
      const toolset = new Toolset({
        tools: [{ name: 'MyTool', handler }],
      });

      const context = { user: 'me' };
      await toolset.call('MyTool', { foo: 'bar' }, context);
      expect(handler).toHaveBeenCalledWith({ foo: 'bar' }, context);
    });

    it('should surface a thrown handler as an error outcome', async () => {
      const toolset = new Toolset({
        tools: [
          {
            name: 'MyTool',
            handler() {
              throw new Error('boom');
            },
          },
        ],
      });

      const { result, error } = await toolset.call('MyTool', {});
      expect(result).toBeUndefined();
      expect(error.message).toBe('boom');
    });

    it('should return an error outcome for an unknown tool', async () => {
      const toolset = new Toolset();
      const { error } = await toolset.call('Nope', {});
      expect(error.message).toBe('Unknown tool: Nope');
    });

    it('should fire lifecycle hooks around a successful call', async () => {
      const onToolCalled = vi.fn();
      const onToolFinished = vi.fn();
      const onToolError = vi.fn();

      const toolset = new Toolset({
        onToolCalled,
        onToolFinished,
        onToolError,
        tools: [
          {
            name: 'MyTool',
            handler() {
              return 'ok';
            },
          },
        ],
      });

      await toolset.call('MyTool', { foo: 'bar' });
      expect(onToolCalled).toHaveBeenCalledWith('MyTool', { foo: 'bar' });
      expect(onToolFinished).toHaveBeenCalledWith('MyTool', 'ok');
      expect(onToolError).not.toHaveBeenCalled();
    });

    it('should fire the error hook when a handler throws', async () => {
      const onToolFinished = vi.fn();
      const onToolError = vi.fn();
      const error = new Error('boom');

      const toolset = new Toolset({
        onToolFinished,
        onToolError,
        tools: [
          {
            name: 'MyTool',
            handler() {
              throw error;
            },
          },
        ],
      });

      await toolset.call('MyTool', {});
      expect(onToolError).toHaveBeenCalledWith('MyTool', error);
      expect(onToolFinished).not.toHaveBeenCalled();
    });
  });
});
