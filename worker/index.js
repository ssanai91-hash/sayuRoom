const ROOM_NAME = 'sayu-room-main';
const MAX_CONNECTIONS = 300;
const IDLE_MS = 75_000;
const SWEEP_MS = 60_000;
const TAB_PROTOCOL = /^sayu-presence\.[a-f0-9]{32}$/;

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/presence') {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response(null, { status: 426, headers: { Upgrade: 'websocket' } });
    }
    // 다른 사이트에서 이 방에 연결하는 요청은 받지 않는다. IP·기기 정보는 읽지 않는다.
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
    return env.PRESENCE.get(env.PRESENCE.idFromName(ROOM_NAME)).fetch(request);
  }
};

export class SayuPresence {
  constructor(state) {
    this.state = state;
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  sockets() {
    // getWebSockets()는 close() 직후 CLOSING 연결도 돌려줄 수 있다.
    // 닫는 중인 이전 연결을 빼야 같은 탭의 재연결이 잠깐 2명으로 보이지 않는다.
    return this.state.getWebSockets().filter(ws => ws.readyState === WebSocket.OPEN);
  }

  lastSeen(ws) {
    return this.state.getWebSocketAutoResponseTimestamp(ws)?.getTime()
      ?? ws.deserializeAttachment().connectedAt;
  }

  broadcast() {
    let sockets = this.sockets();
    // send 실패 연결을 닫은 뒤 남은 연결에 최종 숫자를 한 번 더 보낸다.
    for (;;) {
      const message = JSON.stringify({ count: sockets.length });
      let failed = false;
      for (const ws of sockets) {
        try { ws.send(message); }
        catch { ws.close(1011, 'Connection unavailable'); failed = true; }
      }
      if (!failed) return;
      const remaining = this.sockets();
      if (remaining.length === sockets.length) return;
      sockets = remaining;
    }
  }

  async scheduleAlarm() {
    const sockets = this.sockets();
    if (!sockets.length) {
      await this.state.storage.deleteAlarm();
      return;
    }
    const now = Date.now();
    // 60초 주기와 가장 이른 75초 만료 중 빠른 쪽. ping은 객체를 깨우지 않는다.
    const deadline = Math.min(now + SWEEP_MS, ...sockets.map(ws => this.lastSeen(ws) + IDLE_MS));
    const next = Math.max(now + 1, deadline);
    const current = await this.state.storage.getAlarm();
    if (current === null || current > next) await this.state.storage.setAlarm(next);
  }

  async fetch(request) {
    const protocol = request.headers.get('Sec-WebSocket-Protocol') || '';
    if (!TAB_PROTOCOL.test(protocol)) return new Response(null, { status: 400 });
    // 무작위 탭 ID는 URL·로그·DB에 남기지 않고 연결 수명 동안의 태그로만 쓴다.
    const previous = this.state.getWebSockets(protocol).filter(ws => ws.readyState === WebSocket.OPEN);
    if (this.sockets().length - previous.length >= MAX_CONNECTIONS) {
      return new Response(null, { status: 503, headers: { 'Retry-After': '30' } });
    }
    for (const ws of previous) ws.close(4001, 'Replaced');
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server, [protocol]);
    server.serializeAttachment({ connectedAt: Date.now() });
    this.broadcast();
    await this.scheduleAlarm();
    return new Response(null, { status: 101, webSocket: client,
      headers: { 'Sec-WebSocket-Protocol': protocol } });
  }

  async webSocketMessage(ws) {
    // ping은 런타임이 자동 응답한다. 그 외 데이터는 받거나 저장하지 않는다.
    ws.close(1008, 'Only ping is supported');
    this.broadcast();
    await this.scheduleAlarm();
  }

  async webSocketClose() {
    this.broadcast();
    await this.scheduleAlarm();
  }

  async webSocketError(ws) {
    ws.close(1011, 'Connection unavailable');
    this.broadcast();
    await this.scheduleAlarm();
  }

  async alarm() {
    const now = Date.now();
    for (const ws of this.sockets()) {
      if (now - this.lastSeen(ws) >= IDLE_MS) ws.close(4000, 'Heartbeat expired');
    }
    this.broadcast();
    await this.scheduleAlarm();
  }
}
