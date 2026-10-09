/**
 * 9도 미소 측정 및 평가 시스템 - 감사 저장소(LocalStorage) 관리 모듈
 * 중앙 통제국 영구 보존 규격
 */

import { CONFIG } from './config.js';

export class StorageManager {
  constructor() {
    this.recordsKey = CONFIG.STORAGE_KEYS.RECORDS;
    this.counterKey = CONFIG.STORAGE_KEYS.COUNTER;
  }

  /**
   * 다음 피험자 번호 생성 및 증가 (SUBJECT-0001 형태)
   * @returns {string}
   */
  getNextSubjectId() {
    let current = parseInt(localStorage.getItem(this.counterKey) || '1', 10);
    if (isNaN(current) || current < 1) current = 1;
    const formatted = `SUBJECT-${String(current).padStart(4, '0')}`;
    localStorage.setItem(this.counterKey, String(current + 1));
    return formatted;
  }

  /**
   * 현재 피험자 번호 미리보기 (증가하지 않음)
   * @returns {string}
   */
  peekNextSubjectId() {
    let current = parseInt(localStorage.getItem(this.counterKey) || '1', 10);
    if (isNaN(current) || current < 1) current = 1;
    return `SUBJECT-${String(current).padStart(4, '0')}`;
  }

  /**
   * 저장된 감사 기록 목록 반환 (최신순 또는 시간순)
   * @returns {Array<object>}
   */
  getRecords() {
    try {
      const data = localStorage.getItem(this.recordsKey);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[STORAGE] 감사 기록 로드 오류:', e);
      return [];
    }
  }

  /**
   * 신규 검증 기록 추가 (최대 50건 유지, 초과 시 선입선출 삭제)
   * @param {object} record 
   * @returns {Array<object>} 업데이트된 전체 기록
   */
  addRecord(record) {
    const records = this.getRecords();
    const formattedRecord = {
      id: record.id || this.getNextSubjectId(),
      timestamp: record.timestamp || this.formatTimestamp(new Date()),
      angle: record.angle,
      score: record.score,
      deviation: record.deviation,
      classification: record.classification,
      photoConsent: !!record.photoConsent,
      photo: record.photo || null,   // JPEG data URL (동의 시에만)
      note: record.note || '감정이 배제된 순수 미소 점수입니다.'
    };

    records.unshift(formattedRecord); // 최신 항목이 맨 앞으로

    if (records.length > CONFIG.MAX_LEADERBOARD_RECORDS) {
      records.length = CONFIG.MAX_LEADERBOARD_RECORDS;
    }

    this.persist(records);
    return records;
  }

  /**
   * 저장 시도. 용량 초과 시 가장 오래된 기록의 사진부터 제거하며 재시도 (점수는 보존)
   * @param {Array<object>} records
   */
  persist(records) {
    for (;;) {
      try {
        localStorage.setItem(this.recordsKey, JSON.stringify(records));
        return;
      } catch (e) {
        let idx = -1;
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i].photo) { idx = i; break; }
        }
        if (idx === -1) {
          console.error('[STORAGE] 감사 기록 저장 오류:', e);
          return;
        }
        console.warn(`[STORAGE] 저장 용량 초과. ${records[idx].id}의 사진을 폐기합니다.`);
        records[idx].photo = null;
      }
    }
  }

  /**
   * 감사 기록 전체 초기화 (Shift + R 단축키용)
   * @param {boolean} resetCounter 피험자 번호도 1번으로 리셋할지 여부
   */
  clearAll(resetCounter = false) {
    localStorage.removeItem(this.recordsKey);
    if (resetCounter) {
      localStorage.setItem(this.counterKey, '1');
    }
  }

  /**
   * 감사 기록 JSON 내보내기 (Shift + E 단축키용)
   */
  exportJSON() {
    const records = this.getRecords();
    const exportData = {
      system: '9도 미소 측정 및 평가 시스템 (Standard 9.00° Smile Metrology)',
      authority: '중앙 통제국 감정관리처',
      origin: window.location.origin,
      exportedAt: this.formatTimestamp(new Date()),
      totalRecords: records.length,
      records: records
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTime = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `smile9_audit_registry_${safeTime}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 일시 문자열 포맷터 (YYYY-MM-DD HH:mm:ss)
   * @param {Date} date 
   * @returns {string}
   */
  formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }
}
