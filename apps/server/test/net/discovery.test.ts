import { describe, expect, it } from 'vitest';
import { publishService } from '../../src/net/discovery.ts';

describe('publishService', () => {
  it('anuncia tipo, puerto e id', () => {
    const calls: object[] = [];
    let stopped = false;
    const svc = publishService({
      bonjour: {
        publish: (o) => {
          calls.push(o);
          return { stop: () => (stopped = true) };
        },
      },
      serverId: 'abc',
      serverName: 'PC',
      port: 4747,
    });
    expect(calls[0]).toEqual({
      name: 'DontStopMeNow (PC)',
      type: 'dontstopmenow',
      port: 4747,
      txt: { id: 'abc', v: '1' },
    });
    svc.stop();
    expect(stopped).toBe(true);
  });
});
