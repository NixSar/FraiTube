import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    passWithNoTests: true,
    // Tests that write files run many times slower on a busy build machine.
    testTimeout: 30_000
  }
})
