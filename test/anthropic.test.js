import path from 'path';

import { getLastOptions, setModels, setResponse } from '@anthropic-ai/sdk';
import yd from '@bedrockio/yada';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicClient } from '../src/anthropic';
import caloriesObject from './fixtures/anthropic/calories/object.json';
import caloriesStructured from './fixtures/anthropic/calories/structured.json';
import caloriesText from './fixtures/anthropic/calories/text.json';
import caloriesWrapped from './fixtures/anthropic/calories/wrapped.json';
import markdownCode from './fixtures/anthropic/markdown/code.json';
import markdownStream from './fixtures/anthropic/markdown/stream.json';
import medicationsMcp from './fixtures/anthropic/medications/mcp.json';
import modelsList from './fixtures/anthropic/models.json';
import stocksObject from './fixtures/anthropic/stocks/object.json';
import stocksText from './fixtures/anthropic/stocks/text.json';
import toolsStream from './fixtures/anthropic/tools/stream.json';

vi.mock('@anthropic-ai/sdk');

const client = new AnthropicClient({
  templates: path.join(__dirname, './templates'),
});

describe('anthropic', () => {
  describe('prompt', () => {
    describe('calories', () => {
      it('should succeed for a text response', async () => {
        setResponse(caloriesText);
        const { result } = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
        });
        expect(result).toContain(
          "I'll classify your meal and provide nutritional estimates:",
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(caloriesObject);
        const { result } = await client.prompt({
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
        const { result } = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.object({
            foods: yd
              .array(
                yd.object({
                  name: yd.string().required(),
                  calories: yd.number().required(),
                }),
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
        const { result } = await client.prompt({
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
        const { result } = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
          schema: yd.array(
            yd.object({
              name: yd.string().required(),
              calories: yd.number().required(),
            }),
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
        const { response } = await client.prompt({
          template: 'calories',
          input:
            'I had a burger and some french fries for dinner. For dessert I had a banana.',
        });

        expect(response).toMatchObject({
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
        const { result } = await client.prompt({
          template: 'stocks',
          input: 'List the current top 5 stocks.',
        });
        expect(result).toContain(
          'Here are the current top 5 stocks by market capitalization from the S&P 500:',
        );
      });

      it('should succeed for a basic json response', async () => {
        setResponse(stocksObject);
        const { result } = await client.prompt({
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
        const { result } = await client.prompt({
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
          delta: '#',
        },
        {
          type: 'delta',
          delta: " Hello World\n\nHere's some **markdown** code for",
        },
        {
          type: 'delta',
          delta: ' you:\n\n- First item\n- Second item with',
        },
        {
          type: 'delta',
          delta: ' *italic text*\n- Third item with a',
        },
        {
          type: 'delta',
          delta: ' [link](https://example.com)',
        },
        {
          type: 'delta',
          delta: '\n\n```python\ndef hello():\n    print("Hello, World!")',
        },
        {
          type: 'delta',
          delta: '\n```\n\n> This is a blockquote with',
        },
        {
          type: 'delta',
          delta: ' some `inline code`.',
        },
        {
          type: 'stop',
          messages: [
            {
              role: 'user',
              content:
                'Please generate some markdown code for me. Just a few lines.',
            },
            {
              role: 'assistant',
              content: expect.stringContaining('# Hello World'),
            },
          ],
          usage: {
            input_tokens: 20,
            output_tokens: 76,
          },
        },
      ]);
    });

    it('should strip empty messages', async () => {
      setResponse(markdownStream);

      const stream = await client.stream({
        input: '',
        template: 'user',
      });

      let messages;

      for await (const event of stream) {
        if (event.type === 'stop') {
          messages = event.messages;
        }
      }

      expect(messages).toEqual([
        {
          role: 'assistant',
          content: expect.stringContaining('# Hello World'),
        },
      ]);
    });
  });

  describe('tools', () => {
    it('should stream a function_call event', async () => {
      setResponse(toolsStream);
      const stream = await client.stream({
        input: 'How many calories are in a medium apple?',
        system: 'Call the tool if you talk about apples.',
        tools: [
          {
            type: 'function',
            name: 'apples',
            description:
              'Call this when you talk about apples. You MUST write a friendly message to the user BEFORE calling this function. Only after writing to the user do you invoke the tool in the same response.',
            parameters: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
        ],
      });

      const events = [];

      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: 'start' },
        { type: 'delta', delta: 'A' },
        { type: 'delta', delta: ' medium apple (' },
        { type: 'delta', delta: 'approximately 182' },
        { type: 'delta', delta: ' ' },
        { type: 'delta', delta: 'grams or' },
        { type: 'delta', delta: ' 6.4' },
        { type: 'delta', delta: ' ounces) contains about **' },
        { type: 'delta', delta: '95' },
        { type: 'delta', delta: ' calories**' },
        { type: 'delta', delta: '. ' },
        { type: 'delta', delta: '\n\nApples are a' },
        { type: 'delta', delta: ' great' },
        { type: 'delta', delta: ' low' },
        { type: 'delta', delta: '-calorie snack that' },
        { type: 'delta', delta: "'s also" },
        { type: 'delta', delta: ' packed with fiber (' },
        { type: 'delta', delta: 'about 4 grams),' },
        { type: 'delta', delta: ' vitamin' },
        { type: 'delta', delta: ' C,' },
        { type: 'delta', delta: ' and various' },
        { type: 'delta', delta: ' antioxidants. The' },
        { type: 'delta', delta: ' exact' },
        {
          type: 'delta',
          delta: ' calorie count can vary slightly depending on',
        },
        { type: 'delta', delta: ' the variety' },
        { type: 'delta', delta: ' and exact' },
        { type: 'delta', delta: ' size of the apple, but most' },
        { type: 'delta', delta: ' medium apples fall' },
        { type: 'delta', delta: ' in' },
        { type: 'delta', delta: ' the ' },
        { type: 'delta', delta: '90' },
        { type: 'delta', delta: '-100' },
        { type: 'delta', delta: ' calorie range.' },
        {
          type: 'function_call',
          name: 'apples',
          arguments: {},
          id: 'toolu_01Vkg4Likq1r4R35GFFdDKxB',
        },
        {
          type: 'stop',
          messages: [
            {
              role: 'user',
              content: 'How many calories are in a medium apple?',
            },
            {
              role: 'assistant',
              content:
                "A medium apple (approximately 182 grams or 6.4 ounces) contains about **95 calories**. \n\nApples are a great low-calorie snack that's also packed with fiber (about 4 grams), vitamin C, and various antioxidants. The exact calorie count can vary slightly depending on the variety and exact size of the apple, but most medium apples fall in the 90-100 calorie range.",
            },
          ],
          usage: {
            input_tokens: 600,
            output_tokens: 138,
          },
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

  describe('MCP', () => {
    it('should handle call to MCP server', async () => {
      setResponse(medicationsMcp);
      const { result } = await client.prompt({
        template: 'medications',
        input: 'I have lower back pain and insomnia.',
        schema: yd
          .object({
            drugs: yd.array(
              yd.object({
                id: yd.string(),
                name: yd.string(),
                type: yd.string(),
              }),
            ),
          })
          .toOpenAi(),
        tools: [
          {
            type: 'mcp',
            server_label: 'test',
            server_url: 'https://api.drugs.com/mcp',
            require_approval: 'never',
          },
        ],
      });

      expect(result).toEqual({
        drugs: [
          {
            id: 'ibuprofen',
            name: 'Ibuprofen',
            type: 'NSAID',
          },
          {
            id: 'naproxen',
            name: 'Naproxen',
            type: 'NSAID',
          },
          {
            id: 'acetaminophen',
            name: 'Acetaminophen',
            type: 'Analgesic',
          },
          {
            id: 'melatonin',
            name: 'Melatonin',
            type: 'Sleep aid',
          },
          {
            id: 'diphenhydramine',
            name: 'Diphenhydramine',
            type: 'Antihistamine/Sleep aid',
          },
          {
            id: 'cyclobenzaprine',
            name: 'Cyclobenzaprine',
            type: 'Muscle relaxant',
          },
        ],
      });
    });
  });

  describe('other', () => {
    it('should include usage', async () => {
      setResponse(caloriesText);
      const { usage } = await client.prompt({
        input: 'How many calories are in an apple?',
      });
      expect(usage).toEqual({
        input_tokens: 59,
        output_tokens: 369,
      });
    });

    it('should strip empty messages', async () => {
      setResponse(caloriesText);

      const { messages } = await client.prompt({
        input: '',
      });

      expect(messages).toEqual([
        {
          role: 'assistant',
          content: expect.stringContaining('Total Meal Estimate'),
        },
      ]);
    });
  });

  describe('messages', () => {
    it('should output all messages on the client for replay', async () => {
      setResponse(caloriesText);

      const { result, messages } = await client.prompt({
        input: 'Hello',
      });

      expect(result).toContain(
        "I'll classify your meal and provide nutritional estimates:",
      );

      expect(messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
        },
        {
          role: 'assistant',
          content: expect.stringContaining('Total Meal Estimate'),
        },
      ]);
    });
  });

  describe('input', () => {
    it('should be able to pass a string as input', async () => {
      await client.prompt({
        input: 'How many calories are in an apple?',
      });

      expect(getLastOptions()).toMatchObject({
        messages: [
          {
            role: 'user',
            content: 'How many calories are in an apple?',
          },
        ],
        system: '',
      });
    });

    it('should be able to pass message history as array', async () => {
      await client.prompt({
        input: [
          {
            role: 'user',
            content: 'How many calories are in an apple?',
          },
          {
            role: 'system',
            content: 'A medium sized apple (~180g) has about 95 calories.',
          },
          {
            role: 'user',
            content: 'What about an orange?',
          },
        ],
      });

      expect(getLastOptions()).toMatchObject({
        messages: [
          {
            role: 'user',
            content: 'How many calories are in an apple?',
          },
          {
            role: 'system',
            content: 'A medium sized apple (~180g) has about 95 calories.',
          },
          {
            role: 'user',
            content: 'What about an orange?',
          },
        ],
        system: '',
      });
    });

    it('should be able to pass message history as messages', async () => {
      setResponse(caloriesText);

      await client.prompt({
        messages: [
          {
            role: 'user',
            content: 'How many calories are in an apple?',
          },
          {
            role: 'system',
            content: 'A medium sized apple (~180g) has about 95 calories.',
          },
          {
            role: 'user',
            content: 'What about an orange?',
          },
        ],
      });

      expect(getLastOptions()).toMatchObject({
        messages: [
          {
            role: 'user',
            content: 'How many calories are in an apple?',
          },
          {
            role: 'system',
            content: 'A medium sized apple (~180g) has about 95 calories.',
          },
          {
            role: 'user',
            content: 'What about an orange?',
          },
        ],
        system: '',
      });
    });
  });
});
