/**
 * 9도 미소 측정 및 평가 시스템 - 음향 피드백 합성기 (Web Audio API)
 * 감정이 배제된 기계적·사무적 신호음 생성
 */

import { CONFIG } from './config.js';

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem(CONFIG.STORAGE_KEYS.MUTE_SOUND) === 'true';
    this.bgm = null;
    this.bgmStarted = false;
    this.setupBgm();
  }

  setupBgm() {
    try {
      this.bgm = new Audio(CONFIG.BGM?.SRC || 'asset/9digsong.m4a');
      this.bgm.loop = CONFIG.BGM?.LOOP ?? true;
      this.bgm.volume = CONFIG.BGM?.VOLUME ?? 0.4;
      this.bgm.muted = this.muted;
      this.bgm.preload = 'auto';
    } catch (e) {
      console.warn('[AUDIO] BGM 오디오 객체 초기화 실패:', e);
    }
  }

  playBgm() {
    if (!this.bgm) return;
    this.bgm.muted = this.muted;
    const p = this.bgm.play();
    if (p !== undefined) {
      p.then(() => {
        this.bgmStarted = true;
        console.log('[AUDIO] 배경음악(9digsong.m4a) 루프 재생 시작');
      }).catch((err) => {
        // 브라우저 Autoplay 정책에 의한 차단 (사용자 인터랙션 대기)
        console.log('[AUDIO] BGM 자동재생 대기 (사용자 제스처 시 즉시 재생)');
      });
    }
  }

  pauseBgm() {
    if (this.bgm) {
      this.bgm.pause();
    }
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.bgmStarted && !this.muted) {
      this.playBgm();
    }
  }

  setMuted(isMuted) {
    this.muted = isMuted;
    localStorage.setItem(CONFIG.STORAGE_KEYS.MUTE_SOUND, String(isMuted));
    if (this.bgm) {
      this.bgm.muted = isMuted;
      if (!isMuted && this.bgm.paused) {
        this.playBgm();
      }
    }
  }

  isMuted() {
    return this.muted;
  }

  /**
   * 카운트다운 신호음 (건조한 단음)
   */
  playCountdownTick() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * 측정 개시 신호음
   */
  playMeasureStart() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1046.5, now); // C6

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * 측정 프레임 스캐닝 틱음 (낮은 볼륨의 미세 펄스)
   */
  playScanPulse() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(440, now);

    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  /**
   * 결과 확정 셔터/판정음 (기계적 스트로크)
   */
  playResultCaptured() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // 기계적 이중 펄스
    [0, 0.08].forEach((delay, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 587.3 : 1174.6, now + delay);

      gain.gain.setValueAtTime(0.18, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.1);
    });
  }

  /**
   * 안면 소실 및 측정 중단 경고음
   */
  playAbortWarning() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(164.8, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }
}
