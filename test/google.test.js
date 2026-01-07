import path from 'path';

import { setResponse } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { GoogleClient } from '../src/google';
import stocksStream from './fixtures/google/stocks/stream.json';
import stocksText from './fixtures/google/stocks/text.json';

vi.mock('@google/genai');

const client = new GoogleClient({
  apiKey: process.env.GOOGLE_AI_API_KEY,
  templates: path.join(__dirname, './templates'),
});

describe('google', () => {
  describe('models', () => {
    it('should list models', async () => {
      const result = await client.models();
      expect(result).toEqual([
        'gemini-3-pro-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
      ]);
    });
  });

  describe('prompt', () => {
    it('should succeed for a simple text response', async () => {
      setResponse(stocksText);
      const { result } = await client.prompt({
        template: 'stocks',
      });
      expect(result).toBe(
        `
Here is a list of some stocks from the S&P 500:

*   **Apple Inc.** (AAPL)
*   **Microsoft Corporation** (MSFT)
*   **Amazon.com Inc.** (AMZN)
*   **Alphabet Inc.** (GOOGL) (Class A)
*   **Alphabet Inc.** (GOOG) (Class C)
*   **Meta Platforms Inc.** (META)
*   **NVIDIA Corporation** (NVDA)
*   **Tesla Inc.** (TSLA)
*   **Berkshire Hathaway Inc.** (BRK.B)
*   **Johnson & Johnson** (JNJ)
        `.trim()
      );
    });
  });

  describe('other', () => {
    it('should include usage', async () => {
      setResponse(stocksText);
      const { usage } = await client.prompt({
        input: 'How many calories are in an apple?',
      });
      expect(usage).toEqual({
        input_tokens: 61,
        output_tokens: 143,
      });
    });
  });

  describe('stream', () => {
    it('should stream response', async () => {
      setResponse(stocksStream);
      const stream = await client.stream({
        template: 'stocks',
      });

      const events = [];

      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'delta',
          delta:
            'Here are some stocks from the S&P 500:\n\n*   **Apple Inc.** (AAPL)\n*   **Microsoft Corporation** (MSFT)\n*   **Amazon.com Inc.** (AMZN)\n*   ',
        },
        {
          type: 'delta',
          delta:
            '**Alphabet Inc. (Class A)** (GOOGL)\n*   **Alphabet Inc. (Class C)** (GOOG)\n*   **NVIDIA Corporation** (NVDA)\n*   **Tesla, Inc.** (TS',
        },
        {
          type: 'delta',
          delta:
            'LA)\n*   **Meta Platforms, Inc.** (META)\n*   **Johnson & Johnson** (JNJ)\n*   **Exxon Mobil Corporation** (XOM)',
        },
      ]);
    });
  });
});
