import path from 'path';

import { setResponse } from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { XAiClient } from '../src/xai';
import code from './fixtures/xai/code.json';

const client = new XAiClient({
  templates: path.join(__dirname, './templates'),
});

vi.mock('openai');

describe('xAi', () => {
  describe('prompt', () => {
    it('should transform code', async () => {
      setResponse(code);
      const { result } = await client.prompt({
        input:
          'Please generate some a basic Javascript function that sums two numbers.',
      });
      expect(result).toEqual(
        `
function sumTwoNumbers(a, b) {
    return a + b;
}

// Example usage:
// console.log(sumTwoNumbers(5, 3)); // Output: 8
    `.trim()
      );
    });
  });
});
