import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'background.js',
        'options/options.js',
        'popup/popup.js',
        'friction-page/script.js'
      ],
      thresholds: {
        lines: 45,
        functions: 50,
        statements: 45,
        branches: 70,
        'background.js': {
          lines: 85,
          functions: 95,
          statements: 85,
          branches: 70
        }
      }
    }
  }
});
