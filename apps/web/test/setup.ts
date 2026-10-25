import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { FakeEventSource } from './utils.tsx';

vi.stubGlobal('EventSource', FakeEventSource);

// jsdom no reproduce audio: play/pause solo avisan con sus eventos, como haría el navegador.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  },
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value(this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  },
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
});
