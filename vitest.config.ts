/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({  
  test: {
    globals: true,       // Allows `describe`, `it`, `expect` globally
    environment: 'node', // Pure TypeScript logic doesn’t need jsdom
    coverage: { reporter: ['text', 'lcov'] }, // optional coverage report
    pool: "threads",
    maxWorkers: 1,
    minWorkers: 1
  },
})
