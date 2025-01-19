import path from 'path';

import { setResponse } from '@anthropic-ai/sdk';

import { AnthropicClient } from '../src/anthropic';
import formatted from './responses/anthropic/formatted.json';

const client = new AnthropicClient({
  templates: path.join(__dirname, './templates'),
});

describe('anthropic', () => {
  describe('prompt', () => {
    it('should succeed for a long response', async () => {
      setResponse(formatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        output: 'json',
      });
      expect(result).toEqual([
        {
          name: 'banana',
          color: 'yellow',
          calories: 105,
        },
      ]);
    });
  });

  describe('stream', () => {
    it('should stream response', async () => {
      setResponse(formatted);
      const stream = await client.stream({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
      });

      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk.text);
      }

      expect(chunks).toEqual([
        '[\n  {\n    "name": "banana',
        '",\n    "color": "yellow",',
        '\n    "calories": 105\n  }\n]',
      ]);
    });
  });
});
