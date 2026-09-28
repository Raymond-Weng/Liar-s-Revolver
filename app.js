(() => {
  'use strict';

  const CHAMBERS = 6;
  const STEP = 360 / CHAMBERS;
  const RADIUS = 58;

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const rotor = $('rotor');
  const chambersG = $('chambers');
  const triggerBtn = $('trigger');
  const reloadBtn = $('reload');
  const againBtn = $('again');
  const pullsEl = $('pulls');
  const remainEl = $('remain');
  const statusEl = $('status');
  const flashEl = $('flash');
  const deadEl = $('dead');
  const deadDetail = $('dead-detail');

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CLICK_LINES = ['喀。你還活著。', '喀……空的。', '喀。運氣不錯。', '喀。心跳加速中。', '喀。下一個。'];

  let bullet = 0;   // 實彈所在格
  let current = 0;  // 擊錘對準的格
  let pulls = 0;
  let angle = 0;    // 累計旋轉角度，避免裝填時倒轉
  let busy = false;
  let dead = false;

  // ---------- 隨機 ----------
  function randInt(n) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // ---------- 彈巢繪製 ----------
  const chamberEls = [];
  function el(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  }
  for (let i = 0; i < CHAMBERS; i++) {
    const a = (i * STEP) * Math.PI / 180;
    const x = RADIUS * Math.sin(a);
    const y = -RADIUS * Math.cos(a);
    const g = el('g', { class: 'chamber', transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})` });
    g.appendChild(el('circle', { class: 'hole', r: 22, fill: 'url(#hole)', stroke: '#0d0f10', 'stroke-width': 2 }));
    const b = el('g', { class: 'bullet' });
    b.appendChild(el('circle', { r: 17, fill: 'url(#brass)', stroke: '#4a2d08', 'stroke-width': 1.5 }));
    b.appendChild(el('circle', { r: 6, fill: '#b8b8b8', stroke: '#555', 'stroke-width': 1 }));
    g.appendChild(b);
    chambersG.appendChild(g);
    chamberEls.push(g);
  }

  function setRotation(spin) {
    rotor.classList.toggle('spin', !!spin);
    rotor.style.transform = `rotate(${angle}deg)`;
  }

  // ---------- 音效（Web Audio 合成，不需音檔） ----------
  let ctx = null;
  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(ac, seconds) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playClick() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    // 兩段金屬碰撞聲：擊錘落下 + 彈簧回彈
    [0, 0.045].forEach((dt, idx) => {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac, 0.05);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = idx ? 5200 : 3200;
      bp.Q.value = 6;
      const g = ac.createGain();
      g.gain.setValueAtTime(idx ? 0.35 : 0.9, t + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.04);
      src.connect(bp).connect(g).connect(ac.destination);
      src.start(t + dt);
      src.stop(t + dt + 0.05);
    });
  }

  function playCock() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 0.03);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    src.connect(hp).connect(g).connect(ac.destination);
    src.start(t);
  }

  function playBang() {
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;

    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, 1.2);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(6000, t);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const g = ac.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(lp).connect(g);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const og = ac.createGain();
    og.gain.setValueAtTime(1.0, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(og);

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 12;
    g.connect(comp);
    og.connect(comp);
    comp.connect(ac.destination);

    src.start(t); src.stop(t + 1.2);
    osc.start(t); osc.stop(t + 0.5);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
    }
  }

  // ---------- 遊戲流程 ----------
  function render() {
    const remain = CHAMBERS - pulls;
    pullsEl.textContent = pulls;
    remainEl.textContent = remain;
    // 從第 0 格開始依序往後扣，i < current 代表已扣過的空格
    chamberEls.forEach((c, i) => c.classList.toggle('fired', i < current));
  }

  function setStatus(text, hot) {
    statusEl.textContent = text;
    statusEl.classList.toggle('hot', !!hot);
  }

  function anim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // 重新觸發動畫
    node.classList.add(cls);
  }

  // ---------- 存檔：重新整理 / 關掉 App 再開都會接著玩 ----------
  const SAVE_KEY = 'revolver-state-v1';
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ bullet, current, pulls, dead }));
    } catch (_) { /* 無痕模式等情況存不了就算了 */ }
  }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      const ok = s && [s.bullet, s.current, s.pulls].every(Number.isInteger)
        && s.bullet >= 0 && s.bullet < CHAMBERS
        && s.current >= 0 && s.current <= s.bullet
        && s.pulls === s.current + (s.dead ? 1 : 0);
      if (!ok) return false;
      ({ bullet, current, pulls } = s);
      dead = !!s.dead;
    } catch (_) {
      return false;
    }
    angle = -STEP * current;
    setRotation(false);
    chamberEls.forEach((c) => c.classList.remove('reveal', 'fired'));
    render();
    if (dead) {
      chamberEls[bullet].classList.add('reveal');
      triggerBtn.disabled = true;
      setStatus('💥', true);
      showDead(false);
    } else {
      triggerBtn.disabled = false;
      setStatus(pulls ? `接續上一局：已扣 ${pulls} 發。` : '扣下扳機吧。');
    }
    return true;
  }

  // 死亡畫面的「重新裝填」先鎖 1 秒，避免連點扳機時誤觸
  let againTimer = 0;
  function showDead(lockAgain) {
    deadDetail.textContent = `第 ${pulls} 發中彈`;
    deadEl.hidden = false;
    clearTimeout(againTimer);
    againBtn.disabled = lockAgain;
    if (lockAgain) {
      againTimer = setTimeout(() => {
        againBtn.disabled = false;
        againBtn.focus();
      }, 1000);
    } else {
      againBtn.focus();
    }
  }

  function load(spin) {
    bullet = randInt(CHAMBERS);
    current = 0;
    pulls = 0;
    dead = false;
    save();
    chamberEls.forEach((c) => c.classList.remove('reveal', 'fired'));
    if (spin) {
      // 往前轉兩圈多，停在第 0 格
      const base = Math.ceil(Math.abs(angle) / 360) * 360;
      angle = -(base + 720);
      setRotation(true);
    } else {
      angle = 0;
      setRotation(false);
    }
    deadEl.hidden = true;
    triggerBtn.disabled = false;
    setStatus('扣下扳機吧。');
    render();
  }

  function pull() {
    if (busy || dead) return;
    busy = true;
    audio(); // iOS 需要在使用者手勢中解鎖音訊

    if (current === bullet) {
      dead = true;
      playBang();
      vibrate([60, 30, 250]);
      anim(flashEl, 'on');
      anim(app, 'shake');
      chamberEls[bullet].classList.add('reveal');
      pulls++;
      save();
      render();
      setStatus('💥', true);
      triggerBtn.disabled = true;
      setTimeout(() => {
        showDead(true);
        busy = false;
      }, 450);
      return;
    }

    playClick();
    vibrate(15);
    anim(app, 'recoil');
    pulls++;
    current++;
    save();
    angle -= STEP;
    setRotation(false);
    render();

    const remain = CHAMBERS - pulls;
    if (remain === 1) setStatus('喀。只剩最後一發了……', true);
    else if (remain === 2) setStatus('喀。一半一半。', true);
    else setStatus(CLICK_LINES[randInt(CLICK_LINES.length)]);

    setTimeout(() => { busy = false; }, 330);
  }

  // pointerdown 讓手機反應更即時；click 只處理鍵盤/無障礙觸發（detail === 0），避免重複擊發
  triggerBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pull();
  });
  triggerBtn.addEventListener('click', (e) => {
    if (e.detail === 0) pull();
  });

  function reload() {
    audio();
    playCock();
    vibrate(10);
    load(true);
  }
  againBtn.addEventListener('click', () => { if (!againBtn.disabled) reload(); });

  // 遊戲中的「重新裝填」要按住 0.8 秒才會觸發，放開或滑出就取消
  const HOLD_MS = 800;
  let holdTimer = 0;
  function holdStart(e) {
    if (e.button !== 0 || holdTimer) return;
    // 觸控預設會 capture 在按鈕上，放掉才能在手指滑出時收到 pointerleave
    if (reloadBtn.hasPointerCapture?.(e.pointerId)) reloadBtn.releasePointerCapture(e.pointerId);
    reloadBtn.classList.add('holding');
    holdTimer = setTimeout(() => {
      holdEnd();
      reload();
    }, HOLD_MS);
  }
  function holdEnd() {
    clearTimeout(holdTimer);
    holdTimer = 0;
    reloadBtn.classList.remove('holding');
  }
  reloadBtn.addEventListener('pointerdown', holdStart);
  reloadBtn.addEventListener('pointerup', holdEnd);
  reloadBtn.addEventListener('pointercancel', holdEnd);
  reloadBtn.addEventListener('pointerleave', holdEnd);
  reloadBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  // 鍵盤操作沒辦法「按住」，改成要按兩次確認
  let keyConfirm = 0;
  reloadBtn.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    if (keyConfirm) {
      clearTimeout(keyConfirm);
      keyConfirm = 0;
      reloadBtn.textContent = '按住重新裝填';
      reload();
    } else {
      reloadBtn.textContent = '再按一次確認';
      keyConfirm = setTimeout(() => {
        keyConfirm = 0;
        reloadBtn.textContent = '按住重新裝填';
      }, 2000);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
      e.preventDefault();
      if (!dead) pull();
      else if (!againBtn.disabled) reload();
    } else if ((e.key === 'r' || e.key === 'R') && dead && !againBtn.disabled) {
      reload();
    }
  });

  // 阻擋 iOS 雙指縮放
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------- 防止自動熄屏 ----------
  // 一般情況用 Screen Wake Lock API；舊版 iOS 用不了，改播一支隱藏的無聲迴圈影片。
  //  - iOS < 16.4：沒有 Wake Lock API
  //  - iOS < 18.4 的「加入主畫面」App：API 存在但沒效果（WebKit bug）
  const iosVersion = (() => {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|od|ad)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return null;
    const m = ua.match(/OS (\d+)_(\d+)/) || ua.match(/Version\/(\d+)\.(\d+)/);
    return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
  })();
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const useVideoHack = iosVersion !== null && (
    !('wakeLock' in navigator) || iosVersion < 16.04 || (standalone && iosVersion < 18.04)
  );

  let keepAwake;
  if (useVideoHack) {
    // 64x64 黑畫面、約 3 秒、2KB 的 H.264 影片
    const NOSLEEP_MP4 = 'data:video/mp4;base64,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';
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('aria-hidden', 'true');
    video.muted = true;
    video.loop = true;
    video.src = NOSLEEP_MP4;
    // 必須在畫面上才算「正在播放」，所以用 1px 透明而不是 display:none
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.appendChild(video);
    // 保險：有些版本 loop 不可靠，快播完時手動拉回開頭
    video.addEventListener('timeupdate', () => {
      if (video.duration && video.currentTime > video.duration - 0.5) video.currentTime = 0.1;
    });
    keepAwake = () => {
      if (document.visibilityState === 'visible' && video.paused) video.play().catch(() => {});
    };
  } else {
    let wakeLock = null;
    keepAwake = async () => {
      if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } catch (_) { /* 不支援或被拒絕就算了 */ }
    };
  }
  // 切到背景時系統會自動釋放/暫停，回到前景再要一次
  document.addEventListener('visibilitychange', keepAwake);
  // iOS 要求在使用者手勢中才能開始
  document.addEventListener('pointerdown', keepAwake);
  keepAwake();

  if (!restore()) load(false);

  // ---------- iPhone 加入主畫面提示：只在 iOS 瀏覽器、還沒從主畫面打開時顯示 ----------
  const A2HS_KEY = 'revolver-a2hs-dismissed';
  const a2hsEl = $('a2hs');
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1); // iPadOS 會偽裝成 Mac
  let a2hsDismissed = false;
  try { a2hsDismissed = localStorage.getItem(A2HS_KEY) === '1'; } catch (_) {}
  if (isIOS && !standalone && !a2hsDismissed) {
    a2hsEl.hidden = false;
    $('a2hs-close').addEventListener('click', () => {
      a2hsEl.hidden = true;
      try { localStorage.setItem(A2HS_KEY, '1'); } catch (_) {}
    });
  }

  // ---------- PWA ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
