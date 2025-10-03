import path from 'path';

import { describe, expect, it } from 'vitest';

import { XAiClient } from '../src/xai';

const client = new XAiClient({
  templates: path.join(__dirname, './templates'),
});

describe.skip('xAi', () => {
  describe('prompt', () => {
    it('should transform code', async () => {
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
      `.trim(0)
      );
    });
  });
});
