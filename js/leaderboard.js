/**
 * 9도 미소 측정 및 평가 시스템 - 리더보드 (감사 기록부) 뷰 모듈
 * 최대 50건 보관, 증명사진 썸네일, 점수 시각화 막대, 사진 확대 보기
 */

import { CONFIG } from './config.js';

export class LeaderboardView {
  constructor(containerElement, storageManager, lightboxElement) {
    this.container = containerElement;
    this.storage = storageManager;
    this.lightbox = lightboxElement;

    // 사진 확대 창 닫기 (클릭 또는 Esc)
    if (this.lightbox) {
      this.lightbox.addEventListener('click', () => this.closeLightbox());
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeLightbox();
      });
    }

    // 썸네일 클릭 위임 (렌더링마다 재바인딩하지 않음)
    this.container.addEventListener('click', (e) => {
      const thumb = e.target.closest('[data-photo-id]');
      if (thumb) this.openLightbox(thumb.getAttribute('data-photo-id'));
    });
  }

  /**
   * 리더보드 렌더링
   */
  render() {
    const records = this.storage.getRecords();
    const totalCount = records.length;

    const avgScore = totalCount > 0
      ? (records.reduce((acc, r) => acc + (r.score || 0), 0) / totalCount).toFixed(1)
      : '0.0';

    const passCount = records.filter(r => (r.score || 0) >= 80).length;
    const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

    // 최고 기록 (동점이면 먼저 측정된 사람)
    let bestId = null;
    let bestScore = -1;
    for (let i = records.length - 1; i >= 0; i--) {
      if ((records[i].score || 0) > bestScore) {
        bestScore = records[i].score || 0;
        bestId = records[i].id;
      }
    }

    let html = `
      <div class="registry-header">
        <div class="registry-title-group">
          <span class="registry-tag">공 고</span>
          <h2 class="registry-title">★ 피험자 검증 감사 기록부 ★</h2>
          <span class="registry-count">누적 ${totalCount}건 / 최대 ${CONFIG.MAX_LEADERBOARD_RECORDS}건 보관</span>
        </div>
        <div class="registry-summary">
          <div class="summary-metric">
            <span class="metric-label">평균</span>
            <span class="metric-value">${avgScore}점</span>
          </div>
          <div class="summary-metric">
            <span class="metric-label">규격 준수율</span>
            <span class="metric-value">${passRate}%</span>
          </div>
          <div class="summary-actions">
            <button id="btn-export-json" class="btn-flyer btn-sm" title="JSON 내보내기 (Shift+E)">JSON 내보내기</button>
            <button id="btn-reset-records" class="btn-flyer btn-sm btn-danger" title="기록 전체 초기화 (Shift+R)">기록 초기화</button>
          </div>
        </div>
      </div>
    `;

    if (records.length === 0) {
      html += `
        <div class="registry-empty">
          <div class="empty-code">※ 등재된 기록 없음 ※</div>
          <p>카메라 앞에 서서 측정을 진행하십시오.</p>
        </div>
      `;
    } else {
      html += `
        <div class="registry-table-wrapper">
          <table class="registry-table">
            <thead>
              <tr>
                <th style="width: 70px;">증명사진</th>
                <th style="width: 150px;">피험자 번호</th>
                <th style="width: 170px;">측정 시각</th>
                <th style="width: 90px;">측정각</th>
                <th style="width: 100px;">점수</th>
                <th>점수 비교 막대</th>
                <th style="width: 120px;">판정</th>
              </tr>
            </thead>
            <tbody>
      `;

      records.forEach((record, index) => {
        const score = typeof record.score === 'number' ? record.score : 0;
        const angle = typeof record.angle === 'number' ? record.angle.toFixed(2) : '-';
        const isLatest = index === 0;
        const isBest = record.id === bestId;

        let barClass = 'bar-compliant';
        if (score < 60) barClass = 'bar-fail';
        else if (score < 80) barClass = 'bar-warning';

        const statusLabel = record.classification?.label || (score >= 80 ? '규격 합치' : '규격 미달');
        const statusCode = record.classification?.code || 'CLASS';

        const photoCell = record.photo
          ? `<img class="thumb" src="${record.photo}" alt="${record.id} 증명사진" data-photo-id="${record.id}">`
          : `<div class="thumb thumb-none">사진<br>없음</div>`;

        html += `
          <tr class="${isLatest ? 'row-latest' : ''}">
            <td class="col-photo">${photoCell}</td>
            <td class="col-id">
              <span class="badge-subject">${record.id}</span>
              ${isLatest ? '<span class="tag-latest">NEW</span>' : ''}
              ${isBest ? '<span class="tag-best">최고기록</span>' : ''}
            </td>
            <td class="col-time">${record.timestamp}</td>
            <td class="col-angle">${angle}°</td>
            <td class="col-score"><strong>${score.toFixed(1)}</strong>점</td>
            <td class="col-bar">
              <div class="score-bar-track">
                <div class="score-bar-fill ${barClass}" style="width: ${Math.max(2, score)}%;">
                  <span class="bar-value-text">${score.toFixed(1)}</span>
                </div>
              </div>
            </td>
            <td class="col-status">
              <span class="status-pill status-${statusCode.toLowerCase()}">${statusLabel}</span>
            </td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    }

    this.container.innerHTML = html;

    const btnExport = this.container.querySelector('#btn-export-json');
    if (btnExport) {
      btnExport.addEventListener('click', () => this.storage.exportJSON());
    }

    const btnReset = this.container.querySelector('#btn-reset-records');
    if (btnReset) {
      btnReset.addEventListener('click', () => this.promptReset());
    }
  }

  /**
   * 사진 확대 보기
   * @param {string} id 피험자 번호
   */
  openLightbox(id) {
    if (!this.lightbox) return;
    const record = this.storage.getRecords().find(r => r.id === id);
    if (!record || !record.photo) return;

    const score = typeof record.score === 'number' ? record.score.toFixed(1) : '-';
    const flyer = record.classification?.flyer || record.classification?.label || '';
    this.lightbox.innerHTML = `
      <div class="lightbox-card">
        <div class="lightbox-ribbon">${flyer}</div>
        <img src="${record.photo}" alt="${record.id} 증명사진">
        <div class="lightbox-id">${record.id}</div>
        <div class="lightbox-score">${score}점</div>
        <div class="lightbox-time">${record.timestamp}</div>
        <div class="lightbox-close">[아무 곳이나 누르면 닫힘]</div>
      </div>
    `;
    this.lightbox.hidden = false;
  }

  closeLightbox() {
    if (this.lightbox && !this.lightbox.hidden) {
      this.lightbox.hidden = true;
      this.lightbox.innerHTML = '';
    }
  }

  /**
   * 전체 초기화 확인 대화상자
   */
  promptReset() {
    const confirmed = window.confirm(
      '경고: 중앙 통제국 감사 규정에 따라 모든 피험자 검증 기록과 증명사진이 영구 파기됩니다.\n' +
      '기록을 전체 초기화하시겠습니까?\n\n' +
      '(피험자 번호도 SUBJECT-0001로 함께 리셋됩니다.)'
    );
    if (confirmed) {
      this.storage.clearAll(true);
      this.render();
    }
  }
}
