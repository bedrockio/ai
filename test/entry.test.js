import path from 'path';

import { setResponse as setAnthropicResponse } from '@anthropic-ai/sdk';
import { setResponse as setOpenAiResponse } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { createClient } from '../src/index';
import anthropic from './fixtures/anthropic/stocks/object.json';
import openai from './fixtures/openai/stocks/object.json';

vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('createClient', () => {
  it('should error on bad setup', async () => {
    expect(() => {
      createClient();
    }).toThrow('No platform specified.');

    expect(() => {
      createClient({
        platform: 'foobar',
        templates: 'test',
        apiKey: 'test-key',
      });
    }).toThrow('Unknown platform "foobar".');
  });

  it('should not error on no API key', async () => {
    expect(() => {
      createClient({
        platform: 'openai',
      });
    }).not.toThrow();
  });

  it('should succeed for openai', async () => {
    setOpenAiResponse(openai);

    const client = createClient({
      platform: 'gpt',
      templates: path.join(__dirname, './templates'),
      apiKey: 'test-key',
    });

    const result = await client.prompt({
      file: 'stocks',
      output: 'json',
    });

    expect(result).toEqual({
      top5_by_market_cap_in_sp500: [
        {
          name: 'Apple Inc.',
          rank: 1,
          symbol: 'AAPL',
        },
        {
          name: 'Microsoft Corporation',
          rank: 2,
          symbol: 'MSFT',
        },
        {
          name: 'NVIDIA Corporation',
          rank: 3,
          symbol: 'NVDA',
        },
        {
          name: 'Amazon.com, Inc.',
          rank: 4,
          symbol: 'AMZN',
        },
        {
          name: 'Alphabet Inc.',
          rank: 5,
          symbol: 'GOOGL',
        },
      ],
    });
  });

  it('should succeed for anthropic', async () => {
    setAnthropicResponse(anthropic);

    const client = createClient({
      platform: 'claude',
      templates: path.join(__dirname, './templates'),
      apiKey: 'test-key',
    });

    const result = await client.prompt({
      file: 'stocks',
      output: 'json',
    });

    expect(result).toEqual({
      top_5_stocks: [
        {
          name: 'Apple Inc.',
          rank: 1,
          symbol: 'AAPL',
        },
        {
          name: 'Microsoft Corporation',
          rank: 2,
          symbol: 'MSFT',
        },
        {
          name: 'NVIDIA Corporation',
          rank: 3,
          symbol: 'NVDA',
        },
        {
          name: 'Amazon.com Inc.',
          rank: 4,
          symbol: 'AMZN',
        },
        {
          name: 'Alphabet Inc. Class A',
          rank: 5,
          symbol: 'GOOGL',
        },
      ],
    });
  });
});
