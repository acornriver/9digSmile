/**
 * 9도 미소 측정 및 평가 시스템 - 메인 애플리케이션 진입점
 * 인텔 iMac Windows Chrome/Edge 및 키오스크 단독 실행 규격
 */

import { CONFIG } from './config.js';
import { analyzeSmile } from './geometry.js';
import { StorageManager } from './storage.js';
import { AudioManager } from './audio.js';
import { CameraManager } from './camera.js';
import { MeasurementStateMachine, STATES } from './state-machine.js';
import { CanvasHudRenderer } from './hud.js';
import { LeaderboardView } from './leaderboard.js';

class Smile9App {
  constructor() {
    this.video = document.getElementById('webcam');
    this.canvas = document.getElementById('overlay-canvas');
    this.cameraSelect = document.getElementById('camera-select');
    this.leaderboardContainer = document.getElementById('leaderboard-section');
    this.consentOverlay = document.getElementById('consent-overlay');
    this.consentRemaining = document.getElementById('consent-remaining');
    this.retryOverlay = document.getElementById('retry-overlay');
    this.btnRetry = document.getElementById('btn-retry');

    this.storage = new StorageManager();
    this.audio = new AudioManager();
    this.camera = new CameraManager(this.video, this.cameraSelect);
    this.hud = new CanvasHudRenderer(this.canvas);
    this.leaderboard = new LeaderboardView(
      this.leaderboardContainer,
      this.storage,
      document.getElementById('photo-lightbox')
    );

    this.faceMesh = null;
    this.isProcessingFrame = false;
    this.currentSmileData = null;
    this.lastLandmarks = null;
    this.hasDetectedFace = false;
    this.wakeLock = null;
    this.currentSubjectId = this.storage.peekNextSubjectId();

    this.stateMachine = new MeasurementStateMachine({
      audio: this.audio,
      onStateChange: (state, prevState, payload) => this.handleStateChange(state, prevState, payload),
      onResultReady: (result) => this.handleResultReady(result),
      onAbort: (reason) => this.handleAbort(reason)
    });
  }

  async init() {
    console.log('[SYSTEM] 9도 미소 측정 및 평가 시스템 시동 중...');
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // 브라우저 첫 사용자 제스처 시 BGM 및 WebAudio 자동 잠금 해제
    const unlockAudio = () => {
      this.audio.init();
      this.audio.playBgm();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    // 초기 BGM 루프 재생 시도
    this.audio.playBgm();

    this.setupUIControls();
    this.setupShortcuts();
    this.setupWakeLock();
    this.updateRetryButtonVisibility();
    this.leaderboard.render();

    // 1. MediaPipe FaceMesh 초기화
    await this.initFaceMesh();

    // 2. 웹캠 초기화
    try {
      await this.camera.init((video) => {
        this.syncCanvasResolution();
        this.startInferenceLoop();
      });
      this.updateStatusBadge('준비 완료', 'badge-ready');
    } catch (err) {
      this.showFatalError('웹캠 장치에 접근할 수 없습니다. 카메라 권한 및 연결 상태를 점검하십시오.');
      return;
    }

    // 3. 60FPS HUD 렌더링 루프 시작 (추론 주기와 분리하여 매끄러운 애니메이션 유지)
    this.startRenderLoop();
  }

  /**
   * MediaPipe FaceMesh 인스턴스 설정
   */
  async initFaceMesh() {
    this.updateStatusBadge('모델 불러오는 중', 'badge-loading');

    // models/face_mesh.js 가 window.FaceMesh를 전역 등록했는지 확인
    if (typeof window.FaceMesh === 'undefined') {
      console.warn('[SYSTEM] 로컬 face_mesh.js 미인식, CDN 스크립트 로드 시도');
      await this.loadScriptFromCDN('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
    }

    try {
      this.faceMesh = new window.FaceMesh({
        locateFile: (file) => {
          // 로컬 models/ 디렉터리 우선 탐색
          return `./models/${file}`;
        }
      });

      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      this.faceMesh.onResults((results) => this.onFaceMeshResults(results));
      console.log('[SYSTEM] MediaPipe FaceMesh 로드 완료');
    } catch (e) {
      console.error('[SYSTEM] 로컬 모델 초기화 오류, CDN fallback 시도:', e);
      this.faceMesh = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      this.faceMesh.onResults((results) => this.onFaceMeshResults(results));
    }
  }

  loadScriptFromCDN(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  syncCanvasResolution() {
    if (this.video.videoWidth && this.video.videoHeight) {
      this.hud.resize(this.video.videoWidth, this.video.videoHeight);
    }
  }

  /**
   * 안면 인식 추론 루프
   */
  startInferenceLoop() {
    const loop = async () => {
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.syncCanvasResolution();
        if (!this.isProcessingFrame && this.faceMesh) {
          this.isProcessingFrame = true;
          try {
            await this.faceMesh.send({ image: this.video });
          } catch (err) {
            console.error('[INFERENCE] 프레임 전송 실패:', err);
          } finally {
            this.isProcessingFrame = false;
          }
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /**
   * MediaPipe 결과 수신 핸들러
   */
  onFaceMeshResults(results) {
    const hasFace = !!(results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0);
    this.hasDetectedFace = hasFace;

    if (hasFace) {
      const landmarks = results.multiFaceLandmarks[0];
      this.lastLandmarks = landmarks;
      const smileData = analyzeSmile(landmarks, this.canvas.width, this.canvas.height);
      this.currentSmileData = smileData;
      this.stateMachine.update(true, smileData);
      this.updateTelemetrySidebar(smileData);
    } else {
      this.currentSmileData = null;
      this.stateMachine.update(false, null);
      this.resetTelemetrySidebar();
    }
    this.updateRetryButtonVisibility();
  }

  /**
   * 60FPS HUD 드로잉 루프
   */
  startRenderLoop() {
    const render = () => {
      const state = this.stateMachine.getState();
      const progressInfo = this.stateMachine.getProgressInfo();

      this.hud.render({
        state: state,
        smileData: this.currentSmileData,
        progressInfo: progressInfo,
        finalResult: this.stateMachine.finalResult,
        abortReason: this.lastAbortReason,
        subjectId: this.currentSubjectId
      });

      if (state === STATES.CONSENT && this.consentRemaining) {
        this.consentRemaining.textContent = String(Math.ceil(parseFloat(progressInfo.remainingSec)));
      }

      this.updateRetryButtonVisibility();

      // 피험자 이탈로 재측정 가능 상태가 되면 안내 문구 갱신
      if (state === STATES.IDLE && this.stateMachine.armed !== this.lastArmed) {
        this.lastArmed = this.stateMachine.armed;
        const box = document.getElementById('hud-instruction-text');
        if (box && this.lastArmed) box.textContent = '피험자 대기 중. 카메라를 정면으로 응시하십시오.';
      }

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  /**
   * 상태 천이 핸들러
   */
  handleStateChange(state, prevState, payload) {
    const stateBadge = document.getElementById('system-state-badge');
    const instructionBox = document.getElementById('hud-instruction-text');

    if (this.consentOverlay) {
      this.consentOverlay.hidden = state !== STATES.CONSENT;
    }

    this.updateRetryButtonVisibility();

    if (state === STATES.IDLE) {
      this.currentSubjectId = this.storage.peekNextSubjectId();
      this.updateStatusBadge('대기중', 'badge-idle');
      if (instructionBox) {
        instructionBox.textContent = this.stateMachine.armed
          ? '피험자 대기 중. 카메라를 정면으로 응시하십시오.'
          : '측정이 완료되었습니다. [다시 시도하기] 버튼을 누르거나 잠시 후 다음 피험자가 진입하십시오.';
      }
    } else if (state === STATES.CONSENT) {
      this.updateStatusBadge('동의 확인', 'badge-active');
      if (instructionBox) {
        instructionBox.textContent = '안면 사진 기록 동의 여부를 선택하십시오. [Y] 동의 / [N] 거부';
      }
    } else if (state === STATES.COUNTDOWN) {
      this.updateStatusBadge('카운트다운', 'badge-active');
      if (instructionBox) {
        instructionBox.textContent = '안면 감지 완료. 정면을 응시하며 자세를 고정하십시오.';
      }
    } else if (state === STATES.MEASURING) {
      this.updateStatusBadge('● 측정중', 'badge-measuring');
      if (instructionBox) {
        instructionBox.textContent = '안면 근육의 정렬을 분석 중입니다...';
      }
    } else if (state === STATES.RESULT) {
      this.updateStatusBadge('판정 완료', 'badge-verified');
      if (instructionBox) {
        instructionBox.textContent = '감정이 배제된 순수 미소 점수입니다. 다시 시도하려면 하단 버튼을 누르십시오.';
      }
    } else if (state === STATES.ABORTED) {
      this.updateStatusBadge('※ 경고 ※', 'badge-danger');
      if (instructionBox) {
        instructionBox.textContent = payload.reason || '피험자를 인식하지 못했습니다.';
      }
    }
  }

  /**
   * 현재 웹캠 프레임에서 얼굴 영역을 증명사진 비율(3:4)로 잘라 JPEG data URL 반환
   * 원본 비반전 영상 기준
   * @returns {string|null}
   */
  capturePhoto() {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!vw || !vh) return null;

    const { WIDTH, HEIGHT, QUALITY, FACE_PADDING } = CONFIG.PHOTO;
    const aspect = WIDTH / HEIGHT;

    let cx = vw / 2;
    let cy = vh / 2;
    let ch = vh;
    let cw = ch * aspect;

    const lms = this.lastLandmarks;
    if (lms && lms.length) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (const p of lms) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const fw = (maxX - minX) * vw;
      const fh = (maxY - minY) * vh;
      cx = ((minX + maxX) / 2) * vw;
      cy = ((minY + maxY) / 2) * vh - fh * 0.05; // 이마 쪽 여백 약간 추가
      ch = fh * (1 + FACE_PADDING * 2);
      cw = ch * aspect;
      if (cw < fw * (1 + FACE_PADDING)) {
        cw = fw * (1 + FACE_PADDING);
        ch = cw / aspect;
      }
    }

    // 영상 범위를 넘지 않도록 비율 유지하며 축소 후 위치 보정
    const scale = Math.min(1, vw / cw, vh / ch);
    cw *= scale;
    ch *= scale;
    const sx = Math.max(0, Math.min(vw - cw, cx - cw / 2));
    const sy = Math.max(0, Math.min(vh - ch, cy - ch / 2));

    try {
      const off = document.createElement('canvas');
      off.width = WIDTH;
      off.height = HEIGHT;
      off.getContext('2d').drawImage(v, sx, sy, cw, ch, 0, 0, WIDTH, HEIGHT);
      return off.toDataURL('image/jpeg', QUALITY);
    } catch (err) {
      console.error('[PHOTO] 사진 캡처 실패:', err);
      return null;
    }
  }

  /**
   * 측정 확정 결과 저장 및 리더보드 갱신
   */
  handleResultReady(result) {
    const assignedId = this.storage.getNextSubjectId();
    this.currentSubjectId = assignedId;

    // 동의한 경우에만 사진 촬영 (거부 시 어떠한 이미지도 생성하지 않음)
    result.photo = (CONFIG.PHOTO.ENABLED && result.photoConsent) ? this.capturePhoto() : null;

    const record = {
      id: assignedId,
      timestamp: this.storage.formatTimestamp(new Date()),
      angle: result.measuredAngle,
      score: result.score,
      deviation: result.deviation,
      classification: result.classification,
      photoConsent: !!result.photoConsent,
      photo: result.photo,
      note: '감정이 배제된 순수 미소 점수입니다.'
    };

    this.storage.addRecord(record);
    this.leaderboard.render();
  }

  handleAbort(reason) {
    this.lastAbortReason = reason;
  }

  /**
   * 우측/측면 실시간 텔레메트리 게이지 갱신
   */
  updateTelemetrySidebar(data) {
    if (!data) return;

    const elTarget = document.getElementById('tel-target-angle');
    const elCurrent = document.getElementById('tel-current-angle');
    const elRoll = document.getElementById('tel-roll-angle');
    const elLeft = document.getElementById('tel-left-angle');
    const elRight = document.getElementById('tel-right-angle');
    const elDev = document.getElementById('tel-deviation');
    const elScore = document.getElementById('tel-realtime-score');
    const elMeterFill = document.getElementById('tel-meter-fill');
    const elSubject = document.getElementById('tel-subject-id');

    if (elTarget) elTarget.textContent = `${CONFIG.TARGET_ANGLE.toFixed(2)}°`;
    if (elCurrent) elCurrent.textContent = `${data.measuredAngle.toFixed(2)}°`;
    if (elRoll) elRoll.textContent = `${data.rollDeg >= 0 ? '+' : ''}${data.rollDeg.toFixed(2)}°`;
    if (elLeft) elLeft.textContent = `${data.angleLeftDeg.toFixed(2)}°`;
    if (elRight) elRight.textContent = `${data.angleRightDeg.toFixed(2)}°`;
    if (elDev) elDev.textContent = `±${data.deviation.toFixed(2)}°`;
    if (elScore) elScore.textContent = `${data.score.toFixed(1)}`;
    if (elMeterFill) elMeterFill.style.width = `${data.score}%`;
    if (elSubject) elSubject.textContent = this.currentSubjectId || this.storage.peekNextSubjectId();
  }

  resetTelemetrySidebar() {
    const elCurrent = document.getElementById('tel-current-angle');
    const elRoll = document.getElementById('tel-roll-angle');
    const elDev = document.getElementById('tel-deviation');
    const elScore = document.getElementById('tel-realtime-score');
    const elMeterFill = document.getElementById('tel-meter-fill');

    if (elCurrent) elCurrent.textContent = '--.--°';
    if (elRoll) elRoll.textContent = '±0.00°';
    if (elDev) elDev.textContent = '--.--°';
    if (elScore) elScore.textContent = '---.-';
    if (elMeterFill) elMeterFill.style.width = '0%';
  }

  updateStatusBadge(text, className) {
    const el = document.getElementById('system-state-badge');
    if (el) {
      el.textContent = text;
      el.className = `status-badge ${className}`;
    }
  }

  setupUIControls() {
    // 키오스크 전체화면 버튼
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => this.toggleFullscreen());
    }

    // 음소거 토글 버튼
    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      this.updateMuteButtonUI();
      btnMute.addEventListener('click', () => {
        this.audio.setMuted(!this.audio.isMuted());
        this.updateMuteButtonUI();
      });
    }

    // 다시 시도하기 대형 버튼
    if (this.btnRetry) {
      this.btnRetry.addEventListener('click', (e) => {
        e.stopPropagation();
        this.retryMeasurement();
      });
    }

    // 캔버스 클릭 시 즉시 리셋 (결과/오류/재측정 대기 상태에서 빠른 전환)
    this.canvas.addEventListener('click', () => {
      const state = this.stateMachine.getState();
      if (state === STATES.RESULT || state === STATES.ABORTED ||
          (state === STATES.IDLE && !this.stateMachine.armed)) {
        this.retryMeasurement();
      }
    });

    // 사진 기록 동의/거부 버튼
    const btnYes = document.getElementById('btn-consent-yes');
    const btnNo = document.getElementById('btn-consent-no');
    if (btnYes) btnYes.addEventListener('click', () => { this.audio.init(); this.stateMachine.submitConsent(true); });
    if (btnNo) btnNo.addEventListener('click', () => { this.audio.init(); this.stateMachine.submitConsent(false); });
  }

  /**
   * 즉시 재측정 시도 (다시 시도하기 대형 버튼, 스페이스바, 캔버스 클릭)
   */
  retryMeasurement() {
    this.audio.init();
    this.audio.playBgm();
    this.stateMachine.retryNow(this.hasDetectedFace);
    this.updateRetryButtonVisibility();
  }

  /**
   * 다시 시도하기 대형 버튼 노출 여부 갱신
   * [UX 규칙]
   * - 카메라 앞에 실제 피험자의 얼굴이 존재할 때(hasDetectedFace === true)만 노출됩니다.
   * - 피험자가 화면을 벗어나거나 자리를 떴다면 버튼을 즉시 숨깁니다.
   * - 재측정이 필요한 상태:
   *   1) 결과 판정 화면이 떠 있을 때 (RESULT)
   *   2) 결과 후 대기 상태이나 방금 피험자가 제자리에 서 있을 때 (IDLE && !armed)
   *   3) 안면 소실 등으로 측정이 중단되어 피험자가 다시 시도하려 할 때 (ABORTED)
   */
  updateRetryButtonVisibility() {
    if (!this.retryOverlay) return;
    const state = this.stateMachine.getState();
    const isFacePresent = !!this.hasDetectedFace;

    const isRetryState = (state === STATES.RESULT) ||
                         (state === STATES.IDLE && !this.stateMachine.armed) ||
                         (state === STATES.ABORTED);

    const shouldShow = isFacePresent && isRetryState;

    if (this.retryOverlay.hidden !== !shouldShow) {
      this.retryOverlay.hidden = !shouldShow;
    }
  }

  updateMuteButtonUI() {
    const btnMute = document.getElementById('btn-mute');
    if (btnMute) {
      const isMuted = this.audio.isMuted();
      btnMute.textContent = isMuted ? '소리 끔' : '소리 켬';
      btnMute.classList.toggle('btn-active', !isMuted);
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('전체화면 요청 실패:', err);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.warn('전체화면 종료 실패:', err);
      });
    }
  }

  /**
   * 단축키 등록
   * - Shift + R: 전체 초기화
   * - Shift + E: JSON 내보내기
   * - Space: 다시 시도하기 / 즉시 재측정
   * - Y / N: 사진 기록 동의 / 거부
   * - M: 음향 토글
   * - F: 전체화면 토글
   */
  setupShortcuts() {
    window.addEventListener('keydown', (e) => {
      // 오디오 컨텍스트 사용자 제스처 활성화
      this.audio.init();

      if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        this.leaderboard.promptReset();
        return;
      }

      if (e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault();
        this.storage.exportJSON();
        return;
      }

      const state = this.stateMachine.getState();

      if (state === STATES.CONSENT && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'y' || e.key === 'Y') { e.preventDefault(); this.stateMachine.submitConsent(true); return; }
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.stateMachine.submitConsent(false); return; }
      }

      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        this.audio.setMuted(!this.audio.isMuted());
        this.updateMuteButtonUI();
        return;
      }

      if (e.code === 'Space') {
        if (state === STATES.RESULT || state === STATES.ABORTED ||
            (state === STATES.IDLE && !this.stateMachine.armed)) {
          e.preventDefault();
          this.retryMeasurement();
        }
      }

      if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          // 입력창 포커스가 아닐 때만
          if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            e.preventDefault();
            this.toggleFullscreen();
          }
        }
      }
    });
  }

  /**
   * 화면 꺼짐 방지 (Screen Wake Lock API)
   */
  async setupWakeLock() {
    const indicator = document.getElementById('wakelock-indicator');
    if ('wakeLock' in navigator) {
      try {
        const requestLock = async () => {
          this.wakeLock = await navigator.wakeLock.request('screen');
          if (indicator) {
            indicator.textContent = '화면 꺼짐 방지: 활성';
            document.getElementById('wakelock-dot')?.classList.add('status-on');
          }
        };

        await requestLock();

        // 탭 복귀 시 재획득
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible') {
            await requestLock();
          }
        });
      } catch (err) {
        console.warn('[WAKELOCK] Screen Wake Lock 요청 불가:', err);
        if (indicator) {
          indicator.textContent = '화면 꺼짐 방지: 미지원';
        }
      }
    } else if (indicator) {
      indicator.textContent = '화면 꺼짐 방지: 미지원';
    }
  }

  updateClock() {
    const el = document.getElementById('system-clock');
    if (el) {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timeStr = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      el.textContent = timeStr;
    }
  }

  showFatalError(msg) {
    const banner = document.getElementById('error-banner');
    if (banner) {
      banner.style.display = 'block';
      banner.textContent = `[치명적 오류] ${msg}`;
    }
  }
}

// 애플리케이션 시동
window.addEventListener('DOMContentLoaded', () => {
  const app = new Smile9App();
  app.init().catch(err => {
    console.error('[SYSTEM] 초기화 실패:', err);
  });
});
