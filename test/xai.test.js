import path from 'path';

import { setResponse } from 'openai';

import { XAiClient } from '../src/xai';

import code from './responses/xai/code.json';

const client = new XAiClient({
  templates: path.join(__dirname, './templates'),
});

describe('xAi', () => {
  describe('prompt', () => {
    it('should transform code', async () => {
      setResponse(code);
      const result = await client.prompt({
        text: 'Please generate some javascript code',
        output: 'code',
      });
      expect(result).toEqual(
        `
/**
 * Calculates the factorial of a given number.
 * @param {number} n - The number to calculate the factorial for.
 * @returns {number} The factorial of the input number.
 */
function factorial(n) {
    if (n === 0 || n === 1) return 1;
    return n * factorial(n - 1);
}
      `.trim(0),
      );
    });
  });
});
