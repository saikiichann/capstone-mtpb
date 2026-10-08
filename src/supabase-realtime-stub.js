/**
 * Supabase Realtime Stub for React Native
 * 
 * Hindi natin kailangan ang realtime subscriptions para sa photo upload.
 * Ang stub na ito ay pumipigil sa pag-load ng @supabase/realtime-js
 * (na may incompatibility sa React Native dahil sa `ws` library).
 */

export class RealtimeClient {
  constructor() {
    this.channels = [];
  }
  connect() {}
  disconnect() {}
  channel() {
    return new RealtimeChannel();
  }
  removeChannel() {}
  removeAllChannels() {}
  getChannels() {
    return [];
  }
}

export class RealtimeChannel {
  constructor() {
    this.state = 'closed';
  }
  on() {
    return this;
  }
  subscribe() {
    return this;
  }
  unsubscribe() {
    return Promise.resolve('ok');
  }
  send() {
    return Promise.resolve('ok');
  }
  track() {
    return Promise.resolve('ok');
  }
  untrack() {
    return Promise.resolve('ok');
  }
}

export class RealtimePresence {
  constructor() {
    this.state = {};
  }
  onSync() {}
  onJoin() {}
  onLeave() {}
}

export default {
  RealtimeClient,
  RealtimeChannel,
  RealtimePresence,
};