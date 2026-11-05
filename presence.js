/* 접속 수만 표시한다. 연결 전용 무작위 탭 ID 외 이름·위치·기기 정보는 보내지 않는다. */
(() => {
  'use strict';
  let started = false, paused = false, socket = null;
  let retryTimer = null, heartbeat = null, hiddenTimer = null, animation = null;
  let retryDelay = 2000, lastPong = 0, displayed = null;
  const hiddenGrace = 30_000;
  let hiddenAt = 0;
  let tabId;

  function getTabId() {
    // 새 탭에 sessionStorage가 복사된 경우에도 새 ID. 새로고침·복귀는 같은 ID.
    let id;
    try {
      const navigation = performance.getEntriesByType('navigation')[0]?.type;
      if (navigation === 'reload' || navigation === 'back_forward') id = sessionStorage.getItem('sayu-presence-tab');
    } catch {}
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    try { sessionStorage.setItem('sayu-presence-tab', id); } catch {}
    return id;
  }

  function showCount(count) {
    if (!Number.isInteger(count) || count < 1 || count > 300 || displayed === count) return;
    displayed = count;
    const element = document.getElementById('presenceCount');
    if (!element) return;
    element.style.display = 'inline-block';
    element.textContent = String(count);
    animation?.cancel();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && element.animate) {
      // 불투명도나 색을 번쩍이지 않고 숫자 위치만 아주 조금 가라앉힌다.
      animation = element.animate([
        { transform: 'translateY(-1px)' }, { transform: 'translateY(0)' }
      ], { duration: 600, easing: 'ease-out' });
    }
  }

  function disconnect() {
    clearTimeout(retryTimer); retryTimer = null;
    clearInterval(heartbeat); heartbeat = null;
    const previous = socket; socket = null;
    if (previous && previous.readyState < WebSocket.CLOSING) previous.close(1000, 'Away');
  }

  function retry() {
    if (!started || paused || retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  }

  function connect() {
    if (!started || paused || socket || (document.hidden && Date.now() - hiddenAt >= hiddenGrace)) return;
    if (!window.WebSocket || !/^https?:$/.test(location.protocol)) { showCount(1); return; }
    let current;
    try {
      const url = new URL('/api/presence', location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      current = new WebSocket(url.href, 'sayu-presence.' + tabId);
      socket = current;
    } catch { retry(); return; }
    current.onopen = () => {
      if (socket !== current) return;
      lastPong = Date.now();
      const ping = () => {
        if (socket !== current || current.readyState !== WebSocket.OPEN) return;
        // 응답 없는 끊김도 감지하고 마지막 숫자를 유지하며 다시 연결한다.
        if (Date.now() - lastPong >= 75_000) { disconnect(); retry(); return; }
        current.send('ping');
      };
      ping();
      heartbeat = setInterval(ping, 25_000);
    };
    current.onmessage = event => {
      if (socket !== current) return;
      if (event.data === 'pong') { lastPong = Date.now(); return; }
      try {
        const message = JSON.parse(event.data);
        if (Number.isInteger(message.count) && message.count >= 1 && message.count <= 300) {
          retryDelay = 2000;
          showCount(message.count);
        }
      } catch {}
    };
    current.onerror = () => {}; // close가 재연결을 처리한다. 방문자 정보·오류를 기록하지 않는다.
    current.onclose = event => {
      if (socket !== current) return;
      socket = null; clearInterval(heartbeat); heartbeat = null;
      // 새로고침한 같은 탭에 자리를 넘긴 옛 연결은 다시 연결하지 않는다.
      if (event.code === 4001) { paused = true; return; }
      retry();
    };
  }

  function visibilityChanged() {
    if (!started) return;
    clearTimeout(hiddenTimer); hiddenTimer = null;
    if (document.hidden) {
      hiddenAt = Date.now();
      hiddenTimer = setTimeout(() => { paused = true; disconnect(); }, hiddenGrace);
    } else {
      if (paused || (hiddenAt && Date.now() - hiddenAt >= hiddenGrace)) disconnect();
      paused = false; hiddenAt = 0;
      connect();
    }
  }

  window.SayuPresence = {
    start() {
      if (started) return;
      started = true;
      tabId = getTabId();
      // 서버 없는 미리보기에서도 본인은 포함. 연결이 끊기면 마지막 숫자를 유지한다.
      showCount(1);
      document.addEventListener('visibilitychange', visibilityChanged);
      window.addEventListener('pagehide', () => { paused = true; disconnect(); });
      window.addEventListener('pageshow', () => { if (!document.hidden) { paused = false; connect(); } });
      visibilityChanged();
      connect();
    }
  };
})();
