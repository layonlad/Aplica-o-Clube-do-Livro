import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: process.env.TEST_SUITE === 'auth' ? ['test/auth.test.ts'] : process.env.TEST_SUITE === 'integration' ? ['test/integration.test.ts','test/*.integration.test.ts'] : ['test/*.unit.test.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
