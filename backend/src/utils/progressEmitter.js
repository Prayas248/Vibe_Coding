import { EventEmitter } from 'events';

class ProgressEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  send(sessionId, step, message) {
    this.emit(sessionId, { step, message, timestamp: Date.now() });
  }
}

export const progressEmitter = new ProgressEmitter();
