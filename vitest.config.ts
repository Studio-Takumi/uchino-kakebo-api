import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB integration files share one local database; run files serially so a
    // POST test's inserts can't race another file's row-count assertions.
    fileParallelism: false,
  },
});
