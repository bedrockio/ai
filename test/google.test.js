import path from 'path';

// eslint-disable-next-line
import { setResponse } from '@google/generative-ai';

import { GoogleClient } from '../src/google';
import text from './responses/google/text.json';

const client = new GoogleClient({
  templates: path.join(__dirname, './templates'),
});

describe('google', () => {
  describe('prompt', () => {
    it('should succeed for a simple response', async () => {
      setResponse(text);
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
      setResponse(text);
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
