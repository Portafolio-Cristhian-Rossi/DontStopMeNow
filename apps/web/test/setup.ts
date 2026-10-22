import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { FakeEventSource } from './utils.tsx';

vi.stubGlobal('EventSource', FakeEventSource);

afterEach(() => {
  cleanup();
  FakeEventSource.instances = [];
  vi.restoreAllMocks();
});
