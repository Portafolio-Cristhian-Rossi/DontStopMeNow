import { EventEmitter } from 'node:events';
import type { ScanStatus } from '@dsmn/shared';

export interface BusEvents {
  scan: ScanStatus;
  revision: { revision: number };
}

type Listener<K extends keyof BusEvents> = (payload: BusEvents[K]) => void;

/** Bus de eventos internos del servidor (progreso de escaneo, cambios de revisión). */
export class EventBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof BusEvents>(event: K, listener: Listener<K>): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof BusEvents>(event: K, listener: Listener<K>): void {
    this.emitter.off(event, listener);
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}
