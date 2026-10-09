/**
 * 9도 미소 측정 및 평가 시스템 - 비디오 및 카메라 장치 관리자
 * 외장 웹캠 전환 지원 및 원본 비반전 스트림 공급
 */

import { CONFIG } from './config.js';

export class CameraManager {
  constructor(videoElement, selectElement) {
    this.video = videoElement;
    this.select = selectElement;
    this.currentStream = null;
    this.selectedDeviceId = localStorage.getItem(CONFIG.STORAGE_KEYS.SELECTED_CAMERA) || null;
    this.onStreamReady = null;
  }

  /**
   * 카메라 장치 초기화 및 첫 스트림 획득
   */
  async init(onStreamReadyCallback) {
    this.onStreamReady = onStreamReadyCallback;

    // 장치 변경 이벤트 리스너 등록
    if (this.select) {
      this.select.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        this.selectedDeviceId = deviceId;
        localStorage.setItem(CONFIG.STORAGE_KEYS.SELECTED_CAMERA, deviceId);
        await this.startStream(deviceId);
      });
    }

    // 초기 스트림 시작 (기본 장치 또는 이전 저장 장치)
    await this.startStream(this.selectedDeviceId);
    // 권한 획득 후 장치 목록 갱신
    await this.updateDeviceList();

    // 장치 연결/분리 감지
    navigator.mediaDevices?.addEventListener('devicechange', async () => {
      await this.updateDeviceList();
    });
  }

  /**
   * 지정된 deviceId로 웹캠 스트림 시작
   * @param {string|null} deviceId 
   */
  async startStream(deviceId = null) {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    const constraints = {
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // 지정된 장치가 없는 경우 기본 장치로 재시도
        console.warn('[CAMERA] 지정 장치 진입 실패, 기본 장치로 재시도:', err);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      }

      this.currentStream = stream;
      this.video.srcObject = stream;

      await new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play().then(resolve);
        };
      });

      console.log(`[CAMERA] 비디오 스트림 활성화: ${this.video.videoWidth}x${this.video.videoHeight}`);

      if (this.onStreamReady) {
        this.onStreamReady(this.video);
      }
    } catch (err) {
      console.error('[CAMERA] 카메라 스트림 획득 실패:', err);
      throw err;
    }
  }

  /**
   * 연결된 비디오 입력 장치 목록 갱신
   */
  async updateDeviceList() {
    if (!navigator.mediaDevices?.enumerateDevices || !this.select) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      this.select.innerHTML = '';

      if (videoDevices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '인식된 비디오 장치 없음';
        this.select.appendChild(opt);
        return;
      }

      const activeTrack = this.currentStream?.getVideoTracks()[0];
      const activeSettings = activeTrack ? activeTrack.getSettings() : {};
      const activeDeviceId = activeSettings.deviceId || this.selectedDeviceId;

      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `카메라 장치 ${index + 1} (${device.deviceId.slice(0, 8)}...)`;
        if (device.deviceId === activeDeviceId) {
          option.selected = true;
        }
        this.select.appendChild(option);
      });
    } catch (err) {
      console.error('[CAMERA] 장치 목록 열거 실패:', err);
    }
  }

  /**
   * 현재 스트림 중단
   */
  stop() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(t => t.stop());
      this.currentStream = null;
    }
  }
}
