import path from 'path';

import yd from '@bedrockio/yada';
import { setModels, setResponse } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { OpenAiClient } from '../src/openai';
import caloriesObject from './fixtures/openai/calories/object.json';
import caloriesStructured from './fixtures/openai/calories/structured.json';
import caloriesText from './fixtures/openai/calories/text.json';
import caloriesWrapped from './fixtures/openai/calories/wrapped.json';
import markdownCode from './fixtures/openai/markdown/code.json';
import markdownStream from './fixtures/openai/markdown/stream.json';
import modelsList from './fixtures/openai/models.json';
import stocksObject from './fixtures/openai/stocks/object.json';
import stocksText from './fixtures/openai/stocks/text.json';

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
          output: yd.object({
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
          output: {
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
          output: yd.array(
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
        { type: 'start' },
        { type: 'delta', text: '#' },
        { type: 'delta', text: ' Quick' },
        { type: 'delta', text: ' Markdown' },
        { type: 'delta', text: '\n' },
        { type: 'delta', text: 'This' },
        { type: 'delta', text: ' is' },
        { type: 'delta', text: ' a' },
        { type: 'delta', text: ' tiny' },
        { type: 'delta', text: ' example' },
        { type: 'delta', text: ' with' },
        { type: 'delta', text: ' a' },
        { type: 'delta', text: ' link' },
        { type: 'delta', text: ':' },
        { type: 'delta', text: ' [' },
        { type: 'delta', text: 'Open' },
        { type: 'delta', text: 'AI' },
        { type: 'delta', text: '](' },
        { type: 'delta', text: 'https' },
        { type: 'delta', text: '://' },
        { type: 'delta', text: 'open' },
        { type: 'delta', text: 'ai' },
        { type: 'delta', text: '.com' },
        { type: 'delta', text: ')\n' },
        { type: 'delta', text: '-' },
        { type: 'delta', text: ' Item' },
        { type: 'delta', text: ' one' },
        { type: 'delta', text: '\n' },
        { type: 'delta', text: '-' },
        { type: 'delta', text: ' Item' },
        { type: 'delta', text: ' two' },
        { type: 'stop' },
      ]);
    });
  });

  describe('models', () => {
    it('should list out available models', async () => {
      setModels(modelsList);
      const models = await client.models();
      expect(models).toEqual([
        'gpt-4-0613',
        'gpt-4',
        'gpt-3.5-turbo',
        'gpt-5-codex',
        'gpt-audio-2025-08-28',
        'gpt-realtime',
        'gpt-realtime-2025-08-28',
        'gpt-audio',
        'davinci-002',
        'babbage-002',
        'gpt-3.5-turbo-instruct',
        'gpt-3.5-turbo-instruct-0914',
        'dall-e-3',
        'dall-e-2',
        'gpt-4-1106-preview',
        'gpt-3.5-turbo-1106',
        'tts-1-hd',
        'tts-1-1106',
        'tts-1-hd-1106',
        'text-embedding-3-small',
        'text-embedding-3-large',
        'gpt-4-0125-preview',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo-0125',
        'gpt-4-turbo',
        'gpt-4-turbo-2024-04-09',
        'gpt-4o',
        'gpt-4o-2024-05-13',
        'gpt-4o-mini-2024-07-18',
        'gpt-4o-mini',
        'gpt-4o-2024-08-06',
        'chatgpt-4o-latest',
        'o1-mini-2024-09-12',
        'o1-mini',
        'gpt-4o-realtime-preview-2024-10-01',
        'gpt-4o-audio-preview-2024-10-01',
        'gpt-4o-audio-preview',
        'gpt-4o-realtime-preview',
        'omni-moderation-latest',
        'omni-moderation-2024-09-26',
        'gpt-4o-realtime-preview-2024-12-17',
        'gpt-4o-audio-preview-2024-12-17',
        'gpt-4o-mini-realtime-preview-2024-12-17',
        'gpt-4o-mini-audio-preview-2024-12-17',
        'o1-2024-12-17',
        'o1',
        'gpt-4o-mini-realtime-preview',
        'gpt-4o-mini-audio-preview',
        'o3-mini',
        'o3-mini-2025-01-31',
        'gpt-4o-2024-11-20',
        'gpt-4o-search-preview-2025-03-11',
        'gpt-4o-search-preview',
        'gpt-4o-mini-search-preview-2025-03-11',
        'gpt-4o-mini-search-preview',
        'gpt-4o-transcribe',
        'gpt-4o-mini-transcribe',
        'o1-pro-2025-03-19',
        'o1-pro',
        'gpt-4o-mini-tts',
        'o3-2025-04-16',
        'o4-mini-2025-04-16',
        'o3',
        'o4-mini',
        'gpt-4.1-2025-04-14',
        'gpt-4.1',
        'gpt-4.1-mini-2025-04-14',
        'gpt-4.1-mini',
        'gpt-4.1-nano-2025-04-14',
        'gpt-4.1-nano',
        'gpt-image-1',
        'codex-mini-latest',
        'gpt-4o-realtime-preview-2025-06-03',
        'gpt-4o-audio-preview-2025-06-03',
        'o4-mini-deep-research',
        'o4-mini-deep-research-2025-06-26',
        'gpt-5-chat-latest',
        'gpt-5-2025-08-07',
        'gpt-5',
        'gpt-5-mini-2025-08-07',
        'gpt-5-mini',
        'gpt-5-nano-2025-08-07',
        'gpt-5-nano',
        'gpt-3.5-turbo-16k',
        'tts-1',
        'whisper-1',
        'text-embedding-ada-002',
      ]);
    });
  });

  describe('other', () => {
    it('should build the partially interpolated template', async () => {
      const result = await client.buildTemplate({
        template: '{{foo}} {{bar}}',
        foo: 'foo',
      });
      expect(result).toBe('foo {{{bar}}}');
    });

    it('should allow passing params as own field', async () => {
      const result = await client.buildTemplate({
        template: '{{foo}} {{bar}}',
        params: {
          foo: 'foo',
        },
      });

      expect(result).toBe('foo {{{bar}}}');
    });

    it('should inject an array', async () => {
      const result = await client.buildTemplate({
        template: '{{arr}}',
        arr: ['one', 'two', 'three'],
      });
      expect(result).toBe('- one\n- two\n- three');
    });

    it('should store the previous response id', async () => {
      setResponse(caloriesText);

      await client.prompt({
        input: 'Hello',
      });

      expect(client.previousResponseId).toBe(
        'resp_0594e6c81a245f130068ca4d5691648192a0b15b41dfc1b0b7'
      );
    });
  });
});
