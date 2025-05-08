// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './', // Path to your Next.js app
});

// Base Jest configuration options
const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',

  clearMocks: true,
  coverageProvider: 'v8',

  // Handle module aliases (e.g., @/lib/foo)
  moduleNameMapper: {
    // CSS modules
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',

    // Image and static asset imports
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/__mocks__/fileMock.js',

    // Aliases (e.g., @/lib/googleClient → src/lib/googleClient)
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Ignore unnecessary paths
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/'],

  // Ignore transformations for CSS modules and node_modules
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],

  // Extensions Jest should look for
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};

module.exports = createJestConfig(customJestConfig);
