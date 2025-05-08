// jest.setup.ts

// Import Jest DOM extensions like .toBeInTheDocument()
import '@testing-library/jest-dom';

// You can add other global setup here if needed, for example:
// - Mocking global objects (like fetch, localStorage)
// - Setting up environment variables for tests (though .env loading via nextJest should handle most)
// - Global beforeAll/afterAll hooks

// Example: Basic fetch mock (uncomment and adapt if needed)
/*
import 'whatwg-fetch'; // Polyfill fetch for Node environment if needed by tests
import { server } from './__mocks__/server'; // Example using MSW (Mock Service Worker)

beforeAll(() => server.listen()); // Establish API mocking before all tests.
afterEach(() => server.resetHandlers()); // Reset any request handlers that we may add during the tests.
afterAll(() => server.close()); // Clean up after the tests are finished.
*/