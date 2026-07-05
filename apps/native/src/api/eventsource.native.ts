// React Native has no global EventSource, which PocketBase realtime needs.
// Polyfill it with react-native-sse so live message updates work on device.
import EventSource from 'react-native-sse';

if (typeof (global as { EventSource?: unknown }).EventSource === 'undefined') {
  (global as { EventSource?: unknown }).EventSource = EventSource;
}

export {};
