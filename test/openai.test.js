import path from 'path';

import yd from '@bedrockio/yada';
import { setModels, setResponse } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { OpenAiClient } from '../src/openai';
import caloriesFollowUp from './fixtures/openai/calories/follow-up.json';
import caloriesObject from './fixtures/openai/calories/object.json';
import caloriesStructured from './fixtures/openai/calories/structured.json';
import caloriesText from './fixtures/openai/calories/text.json';
import caloriesWrapped from './fixtures/openai/calories/wrapped.json';
import markdownCode from './fixtures/openai/markdown/code.json';
import markdownStream from './fixtures/openai/markdown/stream.json';
import medicationsMcp from './fixtures/openai/medications/mcp.json';
import modelsList from './fixtures/openai/models.json';
import stocksObject from './fixtures/openai/stocks/object.json';
import stocksText from './fixtures/openai/stocks/text.json';
import userStream from './fixtures/openai/user/stream.json';

vi.mock('openai');

const client = new OpenAiClient({
  templates: path.join(__dirname, './templates'),
});

describe('openai', () => {
  describe('prompt', () => {
    describe('calories', () => {
      it('should succeed for a text response', async () => {
        setResponse(caloriesText);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
        });
        expect(result).toContain(
          'Total dinner calorie ballpark: about 490–1,370 kcal'
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(caloriesObject);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          output: 'json',
        });
        expect(result).toEqual({
          foods: [
            {
              name: 'Burger',
              calories: 360,
            },
            {
              name: 'French fries',
              calories: 340,
            },
            {
              name: 'Banana',
              calories: 105,
            },
          ],
        });
      });

      it('should allow a yada schema for output', async () => {
        setResponse(caloriesStructured);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.object({
            foods: yd
              .array(
                yd.object({
                  name: yd.string().required(),
                  calories: yd.number().required(),
                })
              )
              .required(),
          }),
        });
        expect(result).toEqual({
          foods: [
            {
              name: 'burger',
              calories: 450,
            },
            {
              name: 'french fries',
              calories: 350,
            },
            {
              name: 'banana',
              calories: 105,
            },
          ],
        });
      });

      it('should allow a JSON schema for output', async () => {
        setResponse(caloriesStructured);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: {
            type: 'object',
            properties: {
              foods: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    calories: { type: 'number' },
                  },
                  required: ['name', 'calories'],
                  additionalProperties: false,
                },
              },
            },
            required: ['foods'],
            additionalProperties: false,
          },
        });
        expect(result).toEqual({
          foods: [
            {
              name: 'burger',
              calories: 450,
            },
            {
              name: 'french fries',
              calories: 350,
            },
            {
              name: 'banana',
              calories: 105,
            },
          ],
        });
      });

      it('should wrap an array schema', async () => {
        setResponse(caloriesWrapped);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.array(
            yd.object({
              name: yd.string().required(),
              calories: yd.number().required(),
            })
          ),
        });
        expect(result).toEqual([
          {
            name: 'burger',
            calories: 500,
          },
          {
            name: 'french fries',
            calories: 365,
          },
          {
            name: 'banana',
            calories: 105,
          },
        ]);
      });

      it('should get the raw response', async () => {
        setResponse(caloriesText);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          output: 'raw',
        });

        expect(result).toMatchObject({
          id: 'resp_0594e6c81a245f130068ca4d5691648192a0b15b41dfc1b0b7',
          object: 'response',
          status: 'completed',
        });
      });
    });

    describe('stocks', () => {
      it('should succeed for a text response', async () => {
        setResponse(stocksText);
        const result = await client.prompt({
          template: 'stocks',
          input: 'List the current top 5 stocks.',
        });
        expect(result).toContain(
          'Top 5 stocks by market cap within the S&P 500:'
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(stocksObject);
        const result = await client.prompt({
          template: 'stocks',
          input: 'List the current top 5 stocks.',
          output: 'json',
        });
        expect(result).toEqual({
          top5_by_market_cap_in_sp500: [
            { name: 'Apple Inc.', rank: 1, symbol: 'AAPL' },
            { name: 'Microsoft Corporation', rank: 2, symbol: 'MSFT' },
            { name: 'NVIDIA Corporation', rank: 3, symbol: 'NVDA' },
            { name: 'Amazon.com, Inc.', rank: 4, symbol: 'AMZN' },
            { name: 'Alphabet Inc.', rank: 5, symbol: 'GOOGL' },
          ],
        });
      });
    });

    describe('markdown', () => {
      it('should extract code', async () => {
        setResponse(markdownCode);
        const result = await client.prompt({
          input: 'Please generate some markdown code for me. Just a few lines.',
        });
        expect(result).toBe(
          `
# Hello World

This is a simple markdown snippet with a [link](https://example.com).

- One
- Two
`.trim()
        );
      });
    });
  });

  describe('stream', () => {
    it('should stream response', async () => {
      setResponse(markdownStream);
      const stream = await client.stream({
        input: 'Please generate some markdown code for me. Just a few lines.',
      });

      const events = [];

      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          id: 'resp_0117717bc1b9c9890068e01576f9f8819db4cf03cdefda9185',
          type: 'start',
        },
        { type: 'delta', delta: '#' },
        { type: 'delta', delta: ' Quick' },
        { type: 'delta', delta: ' Markdown' },
        { type: 'delta', delta: '\n' },
        { type: 'delta', delta: 'This' },
        { type: 'delta', delta: ' is' },
        { type: 'delta', delta: ' a' },
        { type: 'delta', delta: ' tiny' },
        { type: 'delta', delta: ' example' },
        { type: 'delta', delta: ' with' },
        { type: 'delta', delta: ' a' },
        { type: 'delta', delta: ' link' },
        { type: 'delta', delta: ':' },
        { type: 'delta', delta: ' [' },
        { type: 'delta', delta: 'Open' },
        { type: 'delta', delta: 'AI' },
        { type: 'delta', delta: '](' },
        { type: 'delta', delta: 'https' },
        { type: 'delta', delta: '://' },
        { type: 'delta', delta: 'open' },
        { type: 'delta', delta: 'ai' },
        { type: 'delta', delta: '.com' },
        { type: 'delta', delta: ')\n' },
        { type: 'delta', delta: '-' },
        { type: 'delta', delta: ' Item' },
        { type: 'delta', delta: ' one' },
        { type: 'delta', delta: '\n' },
        { type: 'delta', delta: '-' },
        { type: 'delta', delta: ' Item' },
        { type: 'delta', delta: ' two' },
        {
          type: 'done',
          text: `# Quick Markdown
This is a tiny example with a link: [OpenAI](https://openai.com)
- Item one
- Item two`.trim(),
        },
        {
          id: 'resp_0117717bc1b9c9890068e01576f9f8819db4cf03cdefda9185',
          type: 'stop',
          usage: {
            input_tokens: 19,
            input_tokens_details: {
              cached_tokens: 0,
            },
            output_tokens: 1060,
            output_tokens_details: {
              reasoning_tokens: 1024,
            },
            total_tokens: 1079,
          },
        },
      ]);
    });

    it('should extract message deltas for a JSON response', async () => {
      setResponse(userStream);
      const stream = await client.stream({
        input: 'Hello!',
        template: 'user',
        extractMessages: 'text',
        schema: yd
          .object({
            text: yd.string(),
            next: yd.string().allow('input', 'boolean', 'done'),
            user: yd.object({
              firstName: yd.string(),
              lastName: yd.string(),
            }),
          })
          .requireAllWithin(),
      });

      const events = [];

      for await (const event of stream) {
        if (event.type === 'extract:delta') {
          events.push(event);
        }
      }

      expect(events).toEqual([
        { type: 'extract:delta', delta: 'Hello', key: 'text' },
        { type: 'extract:delta', delta: '!', key: 'text' },
        { type: 'extract:delta', delta: ' Nice', key: 'text' },
        { type: 'extract:delta', delta: ' to', key: 'text' },
        { type: 'extract:delta', delta: ' meet', key: 'text' },
        { type: 'extract:delta', delta: ' you', key: 'text' },
        { type: 'extract:delta', delta: '.', key: 'text' },
        { type: 'extract:delta', delta: ' What', key: 'text' },
        { type: 'extract:delta', delta: ' is', key: 'text' },
        { type: 'extract:delta', delta: ' your', key: 'text' },
        { type: 'extract:delta', delta: ' full', key: 'text' },
        { type: 'extract:delta', delta: ' name', key: 'text' },
        { type: 'extract:delta', delta: '?', key: 'text' },
        { type: 'extract:delta', delta: ' Please', key: 'text' },
        { type: 'extract:delta', delta: ' share', key: 'text' },
        { type: 'extract:delta', delta: ' your', key: 'text' },
        { type: 'extract:delta', delta: ' first', key: 'text' },
        { type: 'extract:delta', delta: ' name', key: 'text' },
        { type: 'extract:delta', delta: ' and', key: 'text' },
        { type: 'extract:delta', delta: ' last', key: 'text' },
        { type: 'extract:delta', delta: ' name', key: 'text' },
        { type: 'extract:delta', delta: '.', key: 'text' },
      ]);
    });
  });

  describe('models', () => {
    it('should list out general models', async () => {
      setModels(modelsList);
      const models = await client.models();
      expect(models).toEqual([
        'gpt-5',
        'gpt-5-chat-latest',
        'gpt-4',
        'gpt-4o',
        'gpt-4o-search-preview',
        'gpt-4.1',
        'gpt-4-turbo',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-instruct',
      ]);
    });

    it('should list out all models', async () => {
      setModels(modelsList);
      const models = await client.models('all');
      expect(models).toEqual([
        'tts-1-hd',
        'text-embedding-3-small',
        'text-embedding-3-large',
        'omni-moderation-latest',
        'o4-mini',
        'o4-mini-deep-research',
        'o3',
        'o3-mini',
        'o1',
        'o1-pro',
        'o1-mini',
        'gpt-realtime',
        'gpt-image-1',
        'gpt-audio',
        'gpt-5',
        'gpt-5-nano',
        'gpt-5-mini',
        'gpt-5-codex',
        'gpt-5-chat-latest',
        'gpt-4',
        'gpt-4o',
        'gpt-4o-transcribe',
        'gpt-4o-search-preview',
        'gpt-4o-realtime-preview',
        'gpt-4o-mini',
        'gpt-4o-mini-tts',
        'gpt-4o-mini-transcribe',
        'gpt-4o-mini-search-preview',
        'gpt-4o-mini-realtime-preview',
        'gpt-4o-mini-audio-preview',
        'gpt-4o-audio-preview',
        'gpt-4.1',
        'gpt-4.1-nano',
        'gpt-4.1-mini',
        'gpt-4-turbo',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-instruct',
        'davinci-002',
        'dall-e-3',
        'dall-e-2',
        'codex-mini-latest',
        'chatgpt-4o-latest',
        'babbage-002',
      ]);
    });
  });

  describe('MCP', () => {
    it('should handle call to MCP server', async () => {
      setResponse(medicationsMcp);
      const result = await client.prompt({
        model: 'gpt-4o',
        template: 'medications',
        input: 'I have lower back pain and insomnia.',
        schema: yd
          .object({
            drugs: yd.array(
              yd.object({
                id: yd.string(),
                name: yd.string(),
                type: yd.string(),
              })
            ),
          })
          .requireAllWithin(),
        tools: [
          {
            type: 'mcp',
            server_label: 'test',
            server_url: 'https://api.drugs.com/mcp',
            require_approval: 'never',
          },
        ],
      });
      expect(result).toEqual({
        drugs: [
          {
            id: '68ed8a32b3cb4e2ad7d04113',
            name: 'IBUPROFEN',
            type: 'medication',
          },
          {
            id: '68ed8a32b3cb4e2ad7d041d4',
            name: 'DIPHENHYDRAMINE HYDROCHLORIDE',
            type: 'medication',
          },
        ],
      });
    });
  });

  describe('other', () => {
    it('should inject input from the template', async () => {
      setResponse(caloriesText);
      const result = await client.prompt({
        template: 'mixed-roles',
        params: {
          fatigue: 'often',
          headaches: 'often',
          musclePain: 'often',
        },
      });
      expect(result).toContain(
        'Total dinner calorie ballpark: about 490–1,370 kcal'
      );
    });

    it('should pass through the previous response ID', async () => {
      setResponse(caloriesText, 'default');
      setResponse(caloriesFollowUp, 'prev-id');

      const { result, prevResponseId } = await client.prompt({
        input: 'Hello',
        output: 'messages',
        prevResponseId: 'prev-id',
      });

      expect(result).toBe('I am a new response in the thread!');
      expect(prevResponseId).toBe('resp_next');
    });

    it('should get the template source', async () => {
      const result = await client.getTemplateSource('calories');
      expect(result).toBe(
        `
You are a helpful assistant.
Your job is to classify foods that a user has eaten and guess
additional information about it including an estimate of the calories.
        `.trim()
      );
    });
  });

  describe('messages', () => {
    it('should output all messages on the client for replay', async () => {
      setResponse(caloriesText);

      const { result, messages } = await client.prompt({
        input: 'Hello',
        output: 'messages',
      });

      expect(result).toContain('Total dinner calorie ballpark:');
      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: expect.stringContaining('Total dinner calorie ballpark:'),
        },
      ]);
    });

    it('should store the previous response id', async () => {
      setResponse(caloriesText);

      const { prevResponseId } = await client.prompt({
        input: 'Hello',
        output: 'messages',
      });

      expect(prevResponseId).toBe(
        'resp_0594e6c81a245f130068ca4d5691648192a0b15b41dfc1b0b7'
      );
    });
  });
});
