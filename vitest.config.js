import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: 'verbose',
    environment: 'node',
    include: ['test/**/*.test.*'],
    testTimeout: 60000,
  },
});
