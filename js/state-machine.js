/**
 * 9도 미소 측정 및 평가 시스템 - 상태 머신 관리자
 * 대기 → 얼굴 감지 → [사진 기록 동의] → 카운트다운(3초) → 측정(3초, 프레임별 점수 중앙값) → 결과 표시 → 저장 → 대기
 */

import { CONFIG } from './config.js';
import { calculateMedianResults } from './geometry.js';

export const STATES = {
  IDLE: 'IDLE',                   // 대기
  CONSENT: 'CONSENT',             // 안면 사진 기록 동의 선택
  COUNTDOWN: 'COUNTDOWN',         // 카운트다운 (3초)
  MEASURING: 'MEASURING',         // 측정 (3초)
  RESULT: 'RESULT',               // 결과 표시
  ABORTED: 'ABORTED'              // 안면 소실로 인한 중단
};

export class MeasurementStateMachine {
  constructor({ onStateChange, onResultReady, onAbort, audio }) {
    this.state = STATES.IDLE;
    this.onStateChange = onStateChange;
    this.onResultReady = onResultReady;
    this.onAbort = onAbort;
    this.audio = audio;

    // 타이머 및 데이터 버퍼
    this.timerStart = 0;
    this.timerDuration = 0;
    this.lastFaceSeenTime = 0;
    this.measureSamples = [];
    this.currentCountdownInt = -1;
    this.activeSubjectId = null;
    this.finalResult = null;
    this.photoConsent = false;
    this.armed = true;              // false이면 피험자가 화면을 벗어날 때까지 측정 개시 보류
  }

  getState() {
    return this.state;
  }

  /**
   * 상태 천이 실행
   * @param {string} nextState 
   * @param {object} payload 
   */
  transition(nextState, payload = {}) {
    const prevState = this.state;
    this.state = nextState;
    const now = performance.now();

    console.log(`[STATE] ${prevState} -> ${nextState}`, payload);

    switch (nextState) {
      case STATES.IDLE:
        this.timerStart = 0;
        this.timerDuration = 0;
        this.measureSamples = [];
        this.currentCountdownInt = -1;
        this.finalResult = null;
        if (payload.disarm) this.armed = false;
        if (payload.arm) this.armed = true;
        break;

      case STATES.CONSENT:
        this.timerStart = now;
        this.timerDuration = CONFIG.CONSENT_TIMEOUT_SEC * 1000;
        this.photoConsent = false;
        this.audio?.playCountdownTick();
        break;

      case STATES.COUNTDOWN:
        this.timerStart = now;
        this.timerDuration = CONFIG.COUNTDOWN_SEC * 1000;
        this.currentCountdownInt = Math.ceil(CONFIG.COUNTDOWN_SEC);
        this.audio?.playCountdownTick();
        break;

      case STATES.MEASURING:
        this.timerStart = now;
        this.timerDuration = CONFIG.MEASURING_SEC * 1000;
        this.measureSamples = [];
        this.audio?.playMeasureStart();
        break;

      case STATES.RESULT:
        this.timerStart = now;
        this.timerDuration = CONFIG.RESULT_DISPLAY_SEC * 1000;
        this.audio?.playResultCaptured();
        if (this.onResultReady && this.finalResult) {
          this.onResultReady(this.finalResult);
        }
        break;

      case STATES.ABORTED:
        this.timerStart = now;
        this.timerDuration = 3000; // 3초간 경고 표시
        this.audio?.playAbortWarning();
        if (this.onAbort) {
          this.onAbort(payload.reason || '피험자를 인식하지 못했습니다.');
        }
        break;
    }

    if (this.onStateChange) {
      this.onStateChange(this.state, prevState, payload);
    }
  }

  /**
   * 프레임별 업데이트 루프에서 호출
   * @param {boolean} hasFace 안면 감지 여부
   * @param {object|null} smileData 현재 프레임 분석 데이터
   */
  update(hasFace, smileData) {
    const now = performance.now();

    if (hasFace) {
      this.lastFaceSeenTime = now;
    }

    const faceLostDuration = now - this.lastFaceSeenTime;
    const isFaceLost = !hasFace && (faceLostDuration > CONFIG.LOST_FACE_ABORT_MS);

    switch (this.state) {
      case STATES.IDLE:
        // 피험자가 일정 시간 이상 화면을 벗어나면 다음 측정 가능 상태로 전환
        if (!hasFace && faceLostDuration > CONFIG.REARM_ABSENCE_MS) {
          this.armed = true;
        }
        if (hasFace && this.armed) {
          if (CONFIG.PHOTO.ENABLED) {
            this.transition(STATES.CONSENT);
          } else {
            this.photoConsent = false;
            this.transition(STATES.COUNTDOWN);
          }
        }
        break;

      case STATES.CONSENT:
        if (isFaceLost) {
          this.transition(STATES.IDLE);
          return;
        }
        if (now - this.timerStart >= this.timerDuration) {
          // 미선택 시 측정 취소. 피험자가 이탈할 때까지 재요청하지 않음
          this.transition(STATES.IDLE, { disarm: true });
        }
        break;

      case STATES.COUNTDOWN:
        if (isFaceLost) {
          this.transition(STATES.ABORTED, { reason: '피험자를 인식하지 못했습니다. 안면을 탐지 영역 내에 위치시키십시오.' });
          return;
        }

        const elapsedCd = now - this.timerStart;
        const remainingCd = Math.max(0, this.timerDuration - elapsedCd);
        const cdInt = Math.ceil(remainingCd / 1000);

        if (cdInt > 0 && cdInt !== this.currentCountdownInt) {
          this.currentCountdownInt = cdInt;
          this.audio?.playCountdownTick();
        }

        if (remainingCd <= 0) {
          this.transition(STATES.MEASURING);
        }
        break;

      case STATES.MEASURING:
        if (isFaceLost) {
          this.transition(STATES.ABORTED, { reason: '측정 중단: 안면 추적이 소실되었습니다. 기준 위치를 유지하십시오.' });
          return;
        }

        // 측정 데이터 수집
        if (smileData) {
          this.measureSamples.push({
            score: smileData.score,
            measuredAngle: smileData.measuredAngle,
            deviation: smileData.deviation,
            angleLeftDeg: smileData.angleLeftDeg,
            angleRightDeg: smileData.angleRightDeg,
            rollDeg: smileData.rollDeg
          });

          // 주기적인 스캔 펄스음 (약 10프레임마다)
          if (this.measureSamples.length % 10 === 0) {
            this.audio?.playScanPulse();
          }
        }

        const elapsedMs = now - this.timerStart;
        const remainingMs = Math.max(0, this.timerDuration - elapsedMs);

        if (remainingMs <= 0) {
          // 3초 측정 완료: 프레임별 점수의 중앙값 산출
          const medianRes = calculateMedianResults(this.measureSamples);
          const classification = CONFIG.CLASSIFICATION.find(c => medianRes.medianScore >= c.minScore) 
            || CONFIG.CLASSIFICATION[CONFIG.CLASSIFICATION.length - 1];

          this.finalResult = {
            score: medianRes.medianScore,
            measuredAngle: medianRes.medianAngle,
            deviation: medianRes.medianDeviation,
            sampleCount: this.measureSamples.length,
            classification: classification,
            photoConsent: this.photoConsent,
            photo: null,
            completedAt: new Date()
          };

          this.transition(STATES.RESULT);
        }
        break;

      case STATES.RESULT:
        const elapsedResult = now - this.timerStart;
        if (elapsedResult >= this.timerDuration) {
          // 결과 표시 시간 경과 후 대기로 복귀 (동일 피험자 재측정 방지)
          this.transition(STATES.IDLE, { disarm: true });
        }
        break;

      case STATES.ABORTED:
        const elapsedAbort = now - this.timerStart;
        if (elapsedAbort >= this.timerDuration) {
          // 경고 문구 표시 후 대기로 복귀
          this.transition(STATES.IDLE);
        }
        break;
    }
  }

  /**
   * 현재 진행 잔여 시간 정보 반환
   */
  getProgressInfo() {
    const now = performance.now();
    const elapsed = now - this.timerStart;
    const remaining = Math.max(0, this.timerDuration - elapsed);
    const progress = this.timerDuration > 0 ? Math.min(1, elapsed / this.timerDuration) : 0;

    return {
      elapsed,
      remaining,
      progress,
      remainingSec: (remaining / 1000).toFixed(1)
    };
  }

  /**
   * 사진 기록 동의/거부 입력
   * @param {boolean} accepted
   */
  submitConsent(accepted) {
    if (this.state !== STATES.CONSENT) return;
    this.photoConsent = !!accepted;
    this.transition(STATES.COUNTDOWN, { photoConsent: this.photoConsent });
  }

  /**
   * 즉시 대기 상태로 강제 리셋 (스페이스바 등). 즉시 재측정 가능 상태로 둠
   */
  forceReset() {
    this.transition(STATES.IDLE, { arm: true });
  }
}
