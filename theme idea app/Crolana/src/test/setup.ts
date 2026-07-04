import '@testing-library/jest-dom';


Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});


class MockIntersectionObserver {
  constructor() {}
  root: Element | null = null;
  rootMargin: string = '';
  thresholds: number[] = [];
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;


global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};


const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });


Object.defineProperty(window, 'ethereum', {
  writable: true,
  value: {
    request: async () => { throw new Error('Not implemented'); },
    on: () => {},
    removeListener: () => {},
    isMetaMask: true,
    selectedAddress: null,
  },
});


Object.defineProperty(window, 'solana', {
  writable: true,
  value: {
    connect: async () => ({ publicKey: { toString: () => 'mock-solana-address' } }),
    disconnect: async () => {},
    on: () => {},
    off: () => {},
    isPhantom: true,
  },
});


const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = (...args) => {
    if (args[0]?.includes?.('Warning:')) return;
    originalError.call(console, ...args);
  };
  console.warn = originalWarn;
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
