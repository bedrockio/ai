import path from 'path';

import { setResponse } from 'openai';

import { OpenAiClient } from '../src/openai';

import long from './responses/openai/long.json';
import text from './responses/openai/text.json';
import code from './responses/openai/code.json';
import formatted from './responses/openai/formatted.json';
import unformatted from './responses/openai/unformatted.json';
import arrayUnformatted from './responses/openai/array-unformatted.json';

const client = new OpenAiClient({
  templates: path.join(__dirname, './templates'),
});

describe('openai', () => {
  describe('prompt', () => {
    it('should succeed for a long response', async () => {
      setResponse(long);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        output: 'json',
      });
      expect(result).toEqual({
        name: 'banana',
        color: 'yellow',
        calories: 105,
      });
    });

    it('should succeed for basic text', async () => {
      setResponse(text);
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

    it('should succeed for a formatted response', async () => {
      setResponse(formatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        output: 'json',
      });
      expect(result).toEqual({
        name: 'banana',
        color: 'yellow',
        calories: 105,
      });
    });

    it('should succeed for an unformatted response', async () => {
      setResponse(unformatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        output: 'json',
      });
      expect(result).toEqual({
        name: 'banana',
        color: 'yellow',
        calories: 105,
      });
    });

    it('should succeed for an array response', async () => {
      setResponse(arrayUnformatted);
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

    it('should be able to return all messages', async () => {
      setResponse(arrayUnformatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        fruits: ['apple', 'banana'],
        output: 'messages',
      });
      expect(result).toEqual([
        {
          role: 'system',
          content:
            'You are a helpful assistant.\n\nHere is a list of fruits:\n\n- apple\n- banana',
        },
        {
          role: 'user',
          content:
            'The following text describes someone eating a meal. Please determine which\n' +
            'fruits were eaten and return a JSON array containing objects with the following\n' +
            'structure. Only output JSON, do not include any explanations.\n' +
            '\n' +
            '- "name" - The name of the fruit.\n' +
            '- "color" - The typical color of the fruit.\n' +
            '- "calories" - A rough estimate of the number of calories per serving. For\n' +
            '  example if the fruit is an "apple", provide the rough estimate of calories for\n' +
            '  a single apple.\n' +
            '\n' +
            'Text:\n' +
            '\n' +
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
        },
        {
          role: 'assistant',
          content:
            '[{\n"name": "banana",\n  "color": "yellow",\n  "calories": 105\n}]',
        },
      ]);
    });

    it('should default to outputting text', async () => {
      setResponse(arrayUnformatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
      });
      expect(result).toBe(
        '[{\n"name": "banana",\n  "color": "yellow",\n  "calories": 105\n}]',
      );
    });

    it('should be able to output the raw response', async () => {
      setResponse(arrayUnformatted);
      const result = await client.prompt({
        file: 'classify-fruits',
        text: 'I had a burger and some french fries for dinner. For dessert I had a banana.',
        output: 'raw',
      });
      expect(result).toEqual({
        id: 'chatcmpl-9dy8si0kRlF27OZiDtA4Y38u4lfO1',
        object: 'chat.completion',
        created: 1719313006,
        model: 'gpt-4o-2024-05-13',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content:
                '[{\n"name": "banana",\n  "color": "yellow",\n  "calories": 105\n}]',
            },
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 134,
          completion_tokens: 79,
          total_tokens: 213,
        },
        system_fingerprint: 'fp_3e7d703517',
      });
    });

    it('should transform code', async () => {
      setResponse(code);
      const result = await client.prompt({
        text: 'Please generate some javascript code',
        output: 'code',
      });
      expect(result).toEqual(
        `
function isEven(number) {
    if (number % 2 === 0) {
        return true;
    } else {
        return false;
    }
}

// Example usage:
console.log(isEven(4)); // Output: true
console.log(isEven(7)); // Output: false
      `.trim(0),
      );
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
        '```json\n{\n  "name": "ban',
        'ana",\n  "color": "yellow',
        '",\n  "calories": 105\n}\n```',
      ]);
    });
  });

  describe('other', () => {
    it('should build the partially interpolated template', async () => {
      setResponse(formatted);

      const template = '{{foo}} {{bar}}';

      const result = await client.buildTemplate({
        template,
        foo: 'foo',
      });

      expect(result).toBe('foo {{{bar}}}');
    });

    it('should allow passing params as own field', async () => {
      setResponse(formatted);

      const template = '{{foo}} {{bar}}';

      const result = await client.buildTemplate({
        template,
        params: {
          foo: 'foo',
        },
      });

      expect(result).toBe('foo {{{bar}}}');
    });

    it('should inject an array', async () => {
      setResponse(formatted);

      const template = '{{arr}}';

      const result = await client.buildTemplate({
        template,
        arr: ['one', 'two', 'three'],
      });

      expect(result).toBe('- one\n- two\n- three');
    });
  });
});
