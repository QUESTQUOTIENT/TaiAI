


if (typeof (globalThis as any).process === 'undefined') {
  (globalThis as any).process = {
    env:      { NODE_ENV: import.meta.env.MODE ?? 'production', BROWSER: 'true' },
    version:  'v20.0.0',
    browser:  true,
    nextTick: (fn: (...args: any[]) => void, ...args: any[]) => setTimeout(() => fn(...args), 0),
  };
} else {
  (globalThis as any).process.browser = true;
  if (!(globalThis as any).process.nextTick) {
    (globalThis as any).process.nextTick = (fn: (...args: any[]) => void, ...args: any[]) => setTimeout(() => fn(...args), 0);
  }
}
if (typeof window !== 'undefined') {
  (window as any).process = (globalThis as any).process;
}


if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis;
}


if (typeof (globalThis as any).TextEncoder === 'undefined') {
  (globalThis as any).TextEncoder = class TextEncoder {
    encode(s: string) {
      const a = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
      return a;
    }
  };
}
if (typeof (globalThis as any).TextDecoder === 'undefined') {
  (globalThis as any).TextDecoder = class TextDecoder {
    decode(a?: Uint8Array) {
      return a ? Array.from(a).map(b => String.fromCharCode(b)).join('') : '';
    }
  };
}


if (typeof (globalThis as any).crypto?.getRandomValues === 'undefined') {
  (globalThis as any).crypto = {
    ...((globalThis as any).crypto ?? {}),
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
      return arr;
    },
  };
}

export {};
