/**
 * 9도 미소 측정 및 평가 시스템 - 시스템 설정 상수
 * 중앙 통제국 감정관리처 규격 지침 제42호
 */

export const CONFIG = {
  // [측정 기준 알고리즘 상수]
  TARGET_ANGLE: 9.0,            // 표준 규격 미소 각도 (도)
  PENALTY_COEFFICIENT: 10.0,    // 1도 편차당 감점 계수 (Score = 100 - |각도 - 9| * 계수)
  SCORE_MIN: 0.0,               // 최저 점수 클램프
  SCORE_MAX: 100.0,             // 최고 점수 클램프

  // [시간 제어 상수]
  COUNTDOWN_SEC: 3.0,           // 안면 인식 후 측정 준비 카운트다운 (초)
  MEASURING_SEC: 3.0,           // 측정 데이터 수집 지속 시간 (초)
  RESULT_DISPLAY_SEC: 8.0,      // 결과 표시 후 자동 대기 복귀 시간 (초)
  LOST_FACE_ABORT_MS: 400,      // 안면 소실 판정 허용 시간 (밀리초)
  CONSENT_TIMEOUT_SEC: 10.0,    // 사진 기록 동의 선택 대기 시간 (초). 미선택 시 측정 취소
  REARM_ABSENCE_MS: 1200,       // 측정 종료 후 피험자가 화면을 이 시간 이상 벗어나야 다음 측정 개시

  // [안면 사진 기록 규격]
  PHOTO: {
    ENABLED: true,              // false로 바꾸면 동의 절차와 사진 기록을 모두 생략
    WIDTH: 240,                 // 저장 사진 너비 (px) — 증명사진 3:4 비율
    HEIGHT: 320,                // 저장 사진 높이 (px)
    QUALITY: 0.72,              // JPEG 품질 (장당 약 10~20KB)
    FACE_PADDING: 0.45          // 얼굴 경계 상자 대비 여백 비율
  },

  // [미디어파이프 랜드마크 색인 규격]
  LANDMARKS: {
    LIP_TOP: 0,                 // 윗입술 상단 중앙
    LIP_BOTTOM: 17,             // 아랫입술 하단 중앙
    MOUTH_CORNER_LEFT: 61,      // 피험자 우측 / 화면 좌측 입꼬리
    MOUTH_CORNER_RIGHT: 291,    // 피험자 좌측 / 화면 우측 입꼬리
    EYE_LEFT_OUTER: 33,         // 피험자 우측 / 화면 좌측 눈 외안각
    EYE_RIGHT_OUTER: 263,       // 피험자 좌측 / 화면 우측 눈 외안각
  },

  // [로컬 저장소 감사 기록 규격]
  STORAGE_KEYS: {
    RECORDS: 'smile9_audit_records_v1',
    COUNTER: 'smile9_subject_counter_v1',
    SELECTED_CAMERA: 'smile9_preferred_camera_id',
    MUTE_SOUND: 'smile9_audio_muted',
  },
  MAX_LEADERBOARD_RECORDS: 50,  // 로컬 감사 기록 최대 보관 건수 (FIFO)

  // [관료제적 판정 분류 기준]
  CLASSIFICATION: [
    { minScore: 95.0, label: '규격 합치', code: 'CLASS-A', flyer: '★축★ 9도 달성', desc: '공인 9.00° 미소 표준 도달. 감정 억제 상태 양호.' },
    { minScore: 80.0, label: '허용 범위', code: 'CLASS-B', flyer: '◆ 허용 오차 이내 ◆', desc: '경미한 미세 편차 감지. 행정 처분 유예 대상.' },
    { minScore: 60.0, label: '요주의 안면', code: 'CLASS-C', flyer: '▲ 재교육 대상 ▲', desc: '허용 오차 초과. 안면 근육 재조정 권고.' },
    { minScore: 0.0,  label: '규격 부적격', code: 'CLASS-D', flyer: '※ 규격 미달 ※', desc: '심각한 감정 왜곡 또는 일탈. 규격 미달 즉각 판정.' }
  ]
};
