import path from 'path';

import { setResponse as setAnthropicResponse } from '@anthropic-ai/sdk';
import { setResponse as setOpenAiResponse } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { Client, MultiClient } from '../src/index';
import anthropic from './fixtures/anthropic/stocks/object.json';
import openai from './fixtures/openai/stocks/object.json';

vi.mock('openai');
vi.mock('@anthropic-ai/sdk');

describe('Client', () => {
  it('should error on bad setup', async () => {
    expect(() => {
      new Client();
    }).toThrow('No platform specified.');

    expect(() => {
      new Client({
        platform: 'openai',
      });
    }).toThrow('No templates directory specified.');

    expect(() => {
      new Client({
        platform: 'openai',
        templates: 'test',
      });
    }).toThrow('No API key specified.');

    expect(() => {
      new Client({
        platform: 'foobar',
        templates: 'test',
        apiKey: 'test-key',
      });
    }).toThrow('Unknown platform "foobar".');
  });

  it('should succeed for openai', async () => {
    setOpenAiResponse(openai);

    const client = new Client({
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

    const client = new Client({
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

describe('MultiClient', () => {
  it('should set multiple keys at once', async () => {
    setOpenAiResponse(openai);
    setAnthropicResponse(anthropic);

    const client = new MultiClient({
      templates: path.join(__dirname, './templates'),
      platforms: [
        {
          name: 'claude',
          apiKey: 'claude-key',
        },
        {
          name: 'openai',
          apiKey: 'openai-key',
        },
      ],
    });

    let result;

    result = await client.prompt({
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

    result = await client.prompt({
      file: 'stocks',
      output: 'json',
      platform: 'openai',
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
});
