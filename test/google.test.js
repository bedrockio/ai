import path from 'path';

import { describe, expect, it } from 'vitest';

import { GoogleClient } from '../src/google';

const client = new GoogleClient({
  templates: path.join(__dirname, './templates'),
});

describe.skip('google', () => {
  describe('prompt', () => {
    it('should succeed for a simple response', async () => {
      const result = await client.prompt({
        file: 'stocks',
        output: 'json',
      });
      expect(result).toEqual([
        {
          name: 'Microsoft Corp.',
          symbol: 'MSFT',
        },
        {
          name: 'Apple Inc.',
          symbol: 'AAPL',
        },
        {
          name: 'NVIDIA Corporation',
          symbol: 'NVDA',
        },
        {
          name: 'Amazon.com Inc.',
          symbol: 'AMZN',
        },
        {
          name: 'Alphabet Inc Class A',
          symbol: 'GOOGL',
        },
      ]);
    });
  });

  describe('stream', () => {
    it('should stream response', async () => {
      const stream = await client.stream({
        file: 'stocks',
      });

      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk.text);
      }

      expect(chunks).toEqual([
        '```json\n[\n  {\n    "name": "Microsoft Corp.",\n    "symbol": "MSFT"\n  },\n  {\n    "name": "Apple Inc.",\n    "sym',
        'bol": "AAPL"\n  },\n    {\n    "name": "NVIDIA Corporation",\n    "symbol": "NVDA"\n  },\n  {\n    "name": "Amazon.c',
        'om Inc.",\n    "symbol": "AMZN"\n  },\n  {\n    "name": "Alphabet Inc Class A",\n     "symbol": "GOOGL"\n    }\n]\n```\n',
      ]);
    });
  });
});
