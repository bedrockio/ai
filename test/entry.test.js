import path from 'path';

import { setResponse as setGptResponse } from 'openai';
import { setResponse as setClaudeResponse } from '@anthropic-ai/sdk';

import { Client } from '../src/index';

import gpt from './responses/openai/text.json';
import claude from './responses/anthropic/text.json';

describe('entry', () => {
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
    setGptResponse(gpt);

    const client = new Client({
      platform: 'gpt',
      templates: path.join(__dirname, './templates'),
      apiKey: 'test-key',
    });
    const result = await client.prompt({
      file: 'stocks',
      output: 'json',
    });

    expect(result).toEqual([
      { name: 'Apple Inc.', symbol: 'AAPL' },
      { name: 'Microsoft Corporation', symbol: 'MSFT' },
      { name: 'Amazon.com Inc.', symbol: 'AMZN' },
      { name: 'NVIDIA Corporation', symbol: 'NVDA' },
      { name: 'Alphabet Inc. (Class A)', symbol: 'GOOGL' },
    ]);
  });

  it('should succeed for anthropic', async () => {
    setClaudeResponse(claude);

    const client = new Client({
      platform: 'claude',
      templates: path.join(__dirname, './templates'),
      apiKey: 'test-key',
    });

    const result = await client.prompt({
      file: 'stocks',
      output: 'json',
    });

    expect(result).toEqual([
      { name: 'Microsoft', symbol: 'MSFT' },
      { name: 'Apple', symbol: 'AAPL' },
      { name: 'NVIDIA', symbol: 'NVDA' },
      { name: 'Alphabet (Google)', symbol: 'GOOGL' },
      { name: 'Amazon', symbol: 'AMZN' },
    ]);
  });
});
