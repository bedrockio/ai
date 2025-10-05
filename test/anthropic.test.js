import path from 'path';

import { setModels, setResponse } from '@anthropic-ai/sdk';
import yd from '@bedrockio/yada';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicClient } from '../src/anthropic';
import caloriesObject from './fixtures/anthropic/calories/object.json';
import caloriesStructured from './fixtures/anthropic/calories/structured.json';
import caloriesText from './fixtures/anthropic/calories/text.json';
import caloriesWrapped from './fixtures/anthropic/calories/wrapped.json';
import markdownCode from './fixtures/anthropic/markdown/code.json';
import markdownStream from './fixtures/anthropic/markdown/stream.json';
import modelsList from './fixtures/anthropic/models.json';
import stocksObject from './fixtures/anthropic/stocks/object.json';
import stocksText from './fixtures/anthropic/stocks/text.json';

vi.mock('@anthropic-ai/sdk');

const client = new AnthropicClient({
  templates: path.join(__dirname, './templates'),
});

describe('anthropic', () => {
  describe('prompt', () => {
    describe('calories', () => {
      it('should succeed for a text response', async () => {
        setResponse(caloriesText);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
        });
        expect(result).toContain(
          "I'll classify your meal and provide nutritional estimates:"
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(caloriesObject);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          output: 'json',
        });
        expect(result).toEqual({
          meal: 'dinner',
          foods: [
            {
              item: 'burger',
              category: 'main_course',
              food_group: 'protein/grain',
              estimated_calories: 550,
              notes:
                'Assuming a standard beef burger with bun, lettuce, tomato, and condiments',
            },
            {
              item: 'french fries',
              category: 'side_dish',
              food_group: 'starch/vegetable',
              estimated_calories: 365,
              notes: 'Assuming a medium-sized serving (approximately 117g)',
            },
            {
              item: 'banana',
              category: 'dessert',
              food_group: 'fruit',
              estimated_calories: 105,
              notes: 'Assuming a medium-sized banana (approximately 118g)',
            },
          ],
          total_estimated_calories: 1020,
          nutritional_balance: {
            protein: 'moderate',
            carbohydrates: 'high',
            fats: 'moderate_to_high',
            fiber: 'moderate',
            vitamins_minerals: 'moderate',
          },
        });
      });

      it('should allow yada schema for output', async () => {
        setResponse(caloriesStructured);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.object({
            foods: yd
              .array(
                yd.object({
                  name: yd.string().required(),
                  calories: yd.number().required(),
                })
              )
              .required(),
          }),
        });
        expect(result).toEqual({
          foods: [
            {
              name: 'burger',
              calories: 550,
            },
            {
              name: 'french fries',
              calories: 365,
            },
            {
              name: 'banana',
              calories: 105,
            },
          ],
        });
      });

      it('should allow a JSON schema for output', async () => {
        setResponse(caloriesStructured);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: {
            type: 'object',
            properties: {
              foods: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    calories: { type: 'number' },
                  },
                  required: ['name', 'calories'],
                  additionalProperties: false,
                },
              },
            },
            required: ['foods'],
            additionalProperties: false,
          },
        });
        expect(result).toEqual({
          foods: [
            {
              name: 'burger',
              calories: 550,
            },
            {
              name: 'french fries',
              calories: 365,
            },
            {
              name: 'banana',
              calories: 105,
            },
          ],
        });
      });

      it('should wrap an array schema', async () => {
        setResponse(caloriesWrapped);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.array(
            yd.object({
              name: yd.string().required(),
              calories: yd.number().required(),
            })
          ),
        });
        expect(result).toEqual([
          {
            name: 'burger',
            calories: 550,
          },
          {
            name: 'french fries',
            calories: 365,
          },
          {
            name: 'banana',
            calories: 105,
          },
        ]);
      });

      it('should get the raw response', async () => {
        setResponse(caloriesText);
        const result = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          output: 'raw',
        });

        expect(result).toMatchObject({
          id: 'msg_01Wc7kf31bhkFAZY5zXCHiri',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [
            {
              type: 'text',
              text: "I'll classify your meal and provide nutritional estimates:\n\n## **Dinner:**\n\n### 🍔 Burger\n- **Classification:** Main course, protein + carbohydrate\n- **Type:** Likely beef burger with bun\n- **Estimated calories:** 500-800 calories\n  - Beef patty (4 oz): ~300 cal\n  - Bun: ~150 cal\n  - Toppings (cheese, lettuce, tomato, condiments): ~50-350 cal\n\n### 🍟 French Fries\n- **Classification:** Side dish, carbohydrate + fat\n- **Portion assumed:** Medium serving (~4 oz/115g)\n- **Estimated calories:** 300-400 calories\n\n## **Dessert:**\n\n### 🍌 Banana\n- **Classification:** Fruit, carbohydrate (natural sugars + fiber)\n- **Size assumed:** Medium (7-8 inches)\n- **Estimated calories:** 105 calories\n\n---\n\n## **Total Meal Estimate: 905-1,305 calories**\n\n**Notes:**\n- The wide range depends on burger size, toppings, and whether fries were regular or large\n- The burger could be 400 cal (small fast-food) to 1,000+ cal (restaurant with bacon/cheese)\n- Fries vary significantly based on preparation (fried vs baked) and portion size\n- The banana is the healthiest item with fiber, potassium, and vitamins\n\nWould you like more specific estimates if you can provide details about the burger type or restaurant?",
            },
          ],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 59,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 0,
              ephemeral_1h_input_tokens: 0,
            },
            output_tokens: 369,
            service_tier: 'standard',
          },
        });
      });
    });

    describe('stocks', () => {
      it('should succeed for a text response', async () => {
        setResponse(stocksText);
        const result = await client.prompt({
          template: 'stocks',
          input: 'List the current top 5 stocks.',
        });
        expect(result).toContain(
          'Here are the current top 5 stocks by market capitalization from the S&P 500:'
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(stocksObject);
        const result = await client.prompt({
          template: 'stocks',
          input: 'List the current top 5 stocks.',
          output: 'json',
        });
        expect(result).toEqual({
          top_5_stocks: [
            { name: 'Apple Inc.', rank: 1, symbol: 'AAPL' },
            { name: 'Microsoft Corporation', rank: 2, symbol: 'MSFT' },
            { name: 'NVIDIA Corporation', rank: 3, symbol: 'NVDA' },
            { name: 'Amazon.com Inc.', rank: 4, symbol: 'AMZN' },
            { name: 'Alphabet Inc. Class A', rank: 5, symbol: 'GOOGL' },
          ],
        });
      });
    });

    describe('markdown', () => {
      it('should extract code', async () => {
        setResponse(markdownCode);
        const result = await client.prompt({
          input: 'Please generate some markdown code for me. Just a few lines.',
        });
        expect(result).toContain('# Sample Markdown');
      });
    });
  });

  describe('stream', () => {
    it('should stream response', async () => {
      setResponse(markdownStream);
      const stream = await client.stream({
        input: 'Please generate some markdown code for me. Just a few lines.',
      });

      const events = [];

      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'start',
        },
        {
          type: 'delta',
          text: '#',
        },
        {
          type: 'delta',
          text: " Hello World\n\nHere's some **markdown** code for",
        },
        {
          type: 'delta',
          text: ' you:\n\n- First item\n- Second item with',
        },
        {
          type: 'delta',
          text: ' *italic text*\n- Third item with a',
        },
        {
          type: 'delta',
          text: ' [link](https://example.com)',
        },
        {
          type: 'delta',
          text: '\n\n```python\ndef hello():\n    print("Hello, World!")',
        },
        {
          type: 'delta',
          text: '\n```\n\n> This is a blockquote with',
        },
        {
          type: 'delta',
          text: ' some `inline code`.',
        },
        {
          type: 'stop',
        },
      ]);
    });
  });

  describe('models', () => {
    it('should list out available models', async () => {
      setModels(modelsList);
      const models = await client.models();
      expect(models).toEqual([
        'claude-sonnet-4-5-20250929',
        'claude-opus-4-1-20250805',
        'claude-opus-4-20250514',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-5-sonnet-20240620',
        'claude-3-haiku-20240307',
        'claude-3-opus-20240229',
      ]);
    });
  });

  describe('other', () => {
    it('should build the partially interpolated template', async () => {
      const result = await client.buildTemplate({
        template: '{{foo}} {{bar}}',
        foo: 'foo',
      });
      expect(result).toBe('foo {{{bar}}}');
    });

    it('should allow passing params as own field', async () => {
      const result = await client.buildTemplate({
        template: '{{foo}} {{bar}}',
        params: {
          foo: 'foo',
        },
      });

      expect(result).toBe('foo {{{bar}}}');
    });

    it('should inject an array', async () => {
      const result = await client.buildTemplate({
        template: '{{arr}}',
        arr: ['one', 'two', 'three'],
      });
      expect(result).toBe('- one\n- two\n- three');
    });
  });

  describe('messages', () => {
    it('should output all messages on the client for replay', async () => {
      setResponse(caloriesText);

      const { result, messages } = await client.prompt({
        input: 'Hello',
        output: 'messages',
      });

      expect(result).toContain(
        "I'll classify your meal and provide nutritional estimates:"
      );

      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: expect.stringContaining(
            "I'll classify your meal and provide nutritional estimates:"
          ),
        },
      ]);
    });
  });
});
