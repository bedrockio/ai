import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BaseClient from '../src/BaseClient.js';

class TestClient extends BaseClient {
  runPrompt(options) {
    return this.mockRunPrompt(options);
  }
  runStream(options) {
    return this.mockRunStream(options);
  }
}

function overloadedError() {
  return Object.assign(new Error('Overloaded'), { status: 529 });
}

function backoffOptions(extras = {}) {
  return {
    backoff: true,
    maxRetries: 10,
    maxBackoff: 60_000,
    ...extras,
  };
}

describe('backoff', () => {
  let client;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new TestClient({});
    client.mockRunPrompt = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('canRunWithBackoff', () => {
    it('should be true when backoff is set and retries < maxRetries', () => {
      expect(client.canRunWithBackoff(backoffOptions())).toBe(true);
    });

    it('should be false without backoff', () => {
      expect(client.canRunWithBackoff({ maxRetries: 10 })).toBe(false);
    });

    it('should be false when streaming', () => {
      expect(client.canRunWithBackoff(backoffOptions({ stream: true }))).toBe(
        false,
      );
    });

    it('should be false once retries hits maxRetries', () => {
      expect(client.canRunWithBackoff(backoffOptions({ retries: 10 }))).toBe(
        false,
      );
    });
  });

  describe('getNextBackoffProps', () => {
    it('should start at 1000ms and bump retries to 1', () => {
      expect(client.getNextBackoffProps(backoffOptions())).toEqual({
        backoffDelay: 1000,
        retries: 1,
      });
    });

    it('should double the delay on each step', () => {
      expect(
        client.getNextBackoffProps(
          backoffOptions({ backoffDelay: 1000, retries: 1 }),
        ),
      ).toEqual({ backoffDelay: 2000, retries: 2 });

      expect(
        client.getNextBackoffProps(
          backoffOptions({ backoffDelay: 4000, retries: 3 }),
        ),
      ).toEqual({ backoffDelay: 8000, retries: 4 });
    });

    it('should cap delay at maxBackoff', () => {
      expect(
        client.getNextBackoffProps(
          backoffOptions({ backoffDelay: 40_000, retries: 5 }),
        ),
      ).toEqual({ backoffDelay: 60_000, retries: 6 });

      expect(
        client.getNextBackoffProps(
          backoffOptions({ backoffDelay: 60_000, retries: 6 }),
        ),
      ).toEqual({ backoffDelay: 60_000, retries: 7 });
    });
  });

  describe('runPromptSwitch', () => {
    it('should skip backoff when not requested', async () => {
      client.mockRunPrompt.mockResolvedValue('ok');
      const result = await client.runPromptSwitch({});
      expect(result).toBe('ok');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(1);
    });

    it('should skip backoff when streaming, even on 529', async () => {
      client.mockRunPrompt.mockRejectedValue(overloadedError());
      await expect(
        client.runPromptSwitch(backoffOptions({ stream: true })),
      ).rejects.toThrow('Overloaded');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('runPromptWithBackoff', () => {
    it('should return immediately on success', async () => {
      client.mockRunPrompt.mockResolvedValue('ok');
      const promise = client.runPromptWithBackoff(backoffOptions());
      await vi.runAllTimersAsync();
      const result = await promise;
      expect(result).toBe('ok');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(1);
    });

    it('should retry on 529 and succeed', async () => {
      client.mockRunPrompt
        .mockRejectedValueOnce(overloadedError())
        .mockResolvedValueOnce('ok');

      const promise = client.runPromptWithBackoff(backoffOptions());
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('ok');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(2);
    });

    it('should double the delay between successive retries', async () => {
      client.mockRunPrompt
        .mockRejectedValueOnce(overloadedError())
        .mockRejectedValueOnce(overloadedError())
        .mockRejectedValueOnce(overloadedError())
        .mockResolvedValueOnce('ok');

      const promise = client.runPromptWithBackoff(backoffOptions());

      // Flush the initial sleep(0).
      await vi.advanceTimersByTimeAsync(0);
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(1);

      // 1s -> first retry
      await vi.advanceTimersByTimeAsync(1000);
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(2);

      // 2s -> second retry
      await vi.advanceTimersByTimeAsync(2000);
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(3);

      // 4s -> third retry, resolves
      await vi.advanceTimersByTimeAsync(4000);
      const result = await promise;
      expect(result).toBe('ok');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(4);
    });

    it('should cap the delay at maxBackoff', async () => {
      client.mockRunPrompt
        .mockRejectedValueOnce(overloadedError())
        .mockRejectedValueOnce(overloadedError())
        .mockRejectedValueOnce(overloadedError())
        .mockResolvedValueOnce('ok');

      const promise = client.runPromptWithBackoff(
        backoffOptions({ maxBackoff: 1500 }),
      );

      // First delay is 1000ms (the initial value, not yet capped).
      await vi.advanceTimersByTimeAsync(1000);
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(2);

      // Would double to 2000ms but maxBackoff caps it at 1500ms.
      await vi.advanceTimersByTimeAsync(1500);
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(3);

      // Stays at the cap on subsequent retries.
      await vi.advanceTimersByTimeAsync(1500);
      const result = await promise;
      expect(result).toBe('ok');
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(4);
    });

    it('should not retry on non-529 errors', async () => {
      const error = Object.assign(new Error('Bad Request'), { status: 400 });
      client.mockRunPrompt.mockRejectedValue(error);

      const promise = client.runPromptWithBackoff(backoffOptions());
      const assertion = expect(promise).rejects.toThrow('Bad Request');
      await vi.runAllTimersAsync();
      await assertion;
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(1);
    });

    it('should stop retrying once maxRetries is reached and throw the 529', async () => {
      client.mockRunPrompt.mockRejectedValue(overloadedError());

      const promise = client.runPromptWithBackoff(
        backoffOptions({ maxRetries: 2 }),
      );
      const assertion = expect(promise).rejects.toThrow('Overloaded');
      await vi.runAllTimersAsync();
      await assertion;

      // 1 initial attempt + 2 retries = 3 calls.
      expect(client.mockRunPrompt).toHaveBeenCalledTimes(3);
    });

    it('should not call onError from within the backoff loop', async () => {
      const onError = vi.fn();
      client.mockRunPrompt
        .mockRejectedValueOnce(overloadedError())
        .mockResolvedValueOnce('ok');

      const promise = client.runPromptWithBackoff(backoffOptions({ onError }));
      await vi.runAllTimersAsync();
      await promise;

      expect(onError).not.toHaveBeenCalled();
    });
  });
});

describe('onError', () => {
  let client;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new TestClient({});
    client.mockRunPrompt = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call onError when prompt() fails', async () => {
    const error = Object.assign(new Error('Bad Request'), { status: 400 });
    const onError = vi.fn();
    client.mockRunPrompt.mockRejectedValue(error);

    await expect(client.prompt({ input: 'hi', onError })).rejects.toThrow(
      'Bad Request',
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should call onError once after backoff exhausts retries', async () => {
    const error = overloadedError();
    const onError = vi.fn();
    client.mockRunPrompt.mockRejectedValue(error);

    const promise = client.prompt(
      backoffOptions({ input: 'hi', maxRetries: 2, onError }),
    );
    const assertion = expect(promise).rejects.toThrow('Overloaded');
    await vi.runAllTimersAsync();
    await assertion;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

describe('transformError', () => {
  let client;

  beforeEach(() => {
    client = new TestClient({});
    client.mockRunPrompt = vi.fn();
    client.mockRunStream = vi.fn();
  });

  describe('prompt()', () => {
    it('should throw the transformed error when transformError returns one', async () => {
      const original = new Error('Original');
      const transformed = new Error('Transformed');
      client.mockRunPrompt.mockRejectedValue(original);

      const transformError = vi.fn().mockReturnValue(transformed);

      await expect(
        client.prompt({ input: 'hi', transformError }),
      ).rejects.toThrow('Transformed');
      expect(transformError).toHaveBeenCalledWith(original);
    });

    it('should fall back to the original error when transformError returns falsy', async () => {
      const original = new Error('Original');
      client.mockRunPrompt.mockRejectedValue(original);

      const transformError = vi.fn().mockReturnValue(null);

      await expect(
        client.prompt({ input: 'hi', transformError }),
      ).rejects.toThrow('Original');
      expect(transformError).toHaveBeenCalledWith(original);
    });

    it('should rethrow the original error when no transformError is provided', async () => {
      const original = new Error('Original');
      client.mockRunPrompt.mockRejectedValue(original);

      await expect(client.prompt({ input: 'hi' })).rejects.toThrow('Original');
    });
  });

  describe('stream()', () => {
    it('should yield an error event using the transformed error fields', async () => {
      const original = Object.assign(new Error('Original'), {
        code: 'orig_code',
        status: 500,
      });
      const transformed = Object.assign(new Error('Transformed'), {
        code: 'mapped_code',
        status: 502,
      });
      client.mockRunStream.mockRejectedValue(original);

      const transformError = vi.fn().mockReturnValue(transformed);

      const events = [];
      for await (const event of client.stream({
        input: 'hi',
        transformError,
      })) {
        events.push(event);
      }

      expect(transformError).toHaveBeenCalledWith(original);
      expect(events).toEqual([
        {
          type: 'error',
          code: 'mapped_code',
          status: 502,
          message: 'Transformed',
        },
      ]);
    });

    it('should yield an error event using the original error when no transformError is provided', async () => {
      const original = Object.assign(new Error('Original'), {
        code: 'orig_code',
        status: 500,
      });
      client.mockRunStream.mockRejectedValue(original);

      const events = [];
      for await (const event of client.stream({ input: 'hi' })) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: 'error',
          code: 'orig_code',
          status: 500,
          message: 'Original',
        },
      ]);
    });
  });
});
