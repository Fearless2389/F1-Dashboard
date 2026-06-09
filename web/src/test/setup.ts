import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement WebSocket — provide a controllable stub for
// useLiveSocket tests.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = 0;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
    // Fire async to match real WS lifecycle
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.({});
    });
  }
  send(data: string) { this.sentMessages.push(data); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({}); }
  // Helpers used by tests
  emit(payload: object) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

// @ts-expect-error – override
globalThis.WebSocket = FakeWebSocket;

// Track instances on globalThis so tests can grab them
// @ts-expect-error – test-only
globalThis.__FakeWebSocket = FakeWebSocket;
