/**
 * 9도 미소 측정 및 평가 시스템 - 기하학 연산 모듈
 * 랜드마크 기반 고개 기울기(Roll) 보정 및 입꼬리 상승 각도 산출
 */

import { CONFIG } from './config.js';

/**
 * 2차원 평면 회전 변환 (지정 중심점 기준)
 * @param {{x: number, y: number}} point 대상 좌표
 * @param {{x: number, y: number}} center 회전 중심 좌표
 * @param {number} angleRad 회전 각도 (라디안)
 * @returns {{x: number, y: number}} 회전 변환된 좌표
 */
export function rotatePoint(point, center, angleRad) {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos)
  };
}

/**
 * 미디어파이프 정규화 랜드마크를 픽셀 절대 좌표로 변환
 * @param {Array<{x: number, y: number, z: number}>} landmarks 
 * @param {number} width 뷰포트 너비
 * @param {number} height 뷰포트 높이
 * @returns {Array<{x: number, y: number, z: number}>}
 */
export function denormalizeLandmarks(landmarks, width, height) {
  return landmarks.map(lm => ({
    x: lm.x * width,
    y: lm.y * height,
    z: lm.z ? lm.z * width : 0
  }));
}

/**
 * 안면 랜드마크로부터 9도 미소 측정 데이터 산출
 * @param {Array<{x: number, y: number, z: number}>} rawLandmarks 
 * @param {number} width 
 * @param {number} height 
 * @returns {object|null}
 */
export function analyzeSmile(rawLandmarks, width, height) {
  if (!rawLandmarks || rawLandmarks.length < 300) {
    return null;
  }

  const px = denormalizeLandmarks(rawLandmarks, width, height);
  const { LIP_TOP, LIP_BOTTOM, MOUTH_CORNER_LEFT, MOUTH_CORNER_RIGHT, EYE_LEFT_OUTER, EYE_RIGHT_OUTER } = CONFIG.LANDMARKS;

  const pLipTop = px[LIP_TOP];
  const pLipBottom = px[LIP_BOTTOM];
  const pCornerL = px[MOUTH_CORNER_LEFT];   // 61
  const pCornerR = px[MOUTH_CORNER_RIGHT];  // 291
  const pEyeL = px[EYE_LEFT_OUTER];         // 33
  const pEyeR = px[EYE_RIGHT_OUTER];        // 263

  if (!pLipTop || !pLipBottom || !pCornerL || !pCornerR || !pEyeL || !pEyeR) {
    return null;
  }

  // 1. 입술 정중앙점 계산 (0과 17의 중점)
  const lipCenter = {
    x: (pLipTop.x + pLipBottom.x) / 2,
    y: (pLipTop.y + pLipBottom.y) / 2
  };

  // 2. 고개 기울기(Roll) 각도 계산 (양 눈 외안각을 잇는 기준선)
  // pEyeL(33, 화면 좌측/피험자 우측) -> pEyeR(263, 화면 우측/피험자 좌측)
  const dxEye = pEyeR.x - pEyeL.x;
  const dyEye = pEyeR.y - pEyeL.y;
  const rollRad = Math.atan2(dyEye, dxEye);
  const rollDeg = rollRad * (180 / Math.PI);

  // 3. 고개 기울기 보정 (lipCenter를 중심으로 -rollRad 만큼 회전 변환)
  // 회전 후에는 양 눈 선이 정확히 수평(0 rad)이 되며 안면의 수평축이 X축과 평행해짐
  const rotCornerL = rotatePoint(pCornerL, lipCenter, -rollRad);
  const rotCornerR = rotatePoint(pCornerR, lipCenter, -rollRad);
  const rotEyeL = rotatePoint(pEyeL, lipCenter, -rollRad);
  const rotEyeR = rotatePoint(pEyeR, lipCenter, -rollRad);

  // 회전된 좌표에서 화면 좌/우측 입꼬리 구분
  const leftSideCorner = (rotCornerL.x < rotCornerR.x) ? rotCornerL : rotCornerR;
  const rightSideCorner = (rotCornerL.x > rotCornerR.x) ? rotCornerL : rotCornerR;

  // 4. 각 입꼬리의 상승 각도 산출
  // 화면 좌표계에서 Y는 아래로 증가하므로, 입꼬리가 입술 중앙보다 위로 올라갈수록 lipCenter.y - corner.y > 0
  const dxLeft = Math.abs(lipCenter.x - leftSideCorner.x);
  const dyLeft = lipCenter.y - leftSideCorner.y;
  const angleLeftDeg = Math.atan2(dyLeft, dxLeft) * (180 / Math.PI);

  const dxRight = Math.abs(rightSideCorner.x - lipCenter.x);
  const dyRight = lipCenter.y - rightSideCorner.y;
  const angleRightDeg = Math.atan2(dyRight, dxRight) * (180 / Math.PI);

  // 5. 종합 측정 각도 (좌우 입꼬리 평균 상승각)
  const measuredAngle = (angleLeftDeg + angleRightDeg) / 2;

  // 6. 점수 계산: 100 - (|측정각 - 9| × 감점계수), 0~100 클램프
  const targetAngle = CONFIG.TARGET_ANGLE;
  const deviation = Math.abs(measuredAngle - targetAngle);
  const rawScore = 100.0 - (deviation * CONFIG.PENALTY_COEFFICIENT);
  const score = Math.max(CONFIG.SCORE_MIN, Math.min(CONFIG.SCORE_MAX, Math.round(rawScore * 10) / 10));

  // 7. 관료적 분류 판정
  const classification = CONFIG.CLASSIFICATION.find(c => score >= c.minScore) || CONFIG.CLASSIFICATION[CONFIG.CLASSIFICATION.length - 1];

  return {
    rawPoints: {
      lipCenter,
      lipTop: pLipTop,
      lipBottom: pLipBottom,
      cornerL: pCornerL,
      cornerR: pCornerR,
      eyeL: pEyeL,
      eyeR: pEyeR
    },
    rotatedPoints: {
      lipCenter,
      leftCorner: leftSideCorner,
      rightCorner: rightSideCorner,
      eyeL: rotEyeL,
      eyeR: rotEyeR
    },
    rollDeg: Math.round(rollDeg * 100) / 100,
    angleLeftDeg: Math.round(angleLeftDeg * 100) / 100,
    angleRightDeg: Math.round(angleRightDeg * 100) / 100,
    measuredAngle: Math.round(measuredAngle * 100) / 100,
    targetAngle: targetAngle,
    deviation: Math.round(deviation * 100) / 100,
    score: score,
    classification: classification,
    isOverSmiling: measuredAngle > targetAngle,
    isUnderSmiling: measuredAngle < targetAngle
  };
}

/**
 * 프레임 배열의 점수 중앙값(Median) 및 대표 각도 산출
 * @param {Array<{score: number, measuredAngle: number, deviation: number}>} samples 
 * @returns {{medianScore: number, medianAngle: number, medianDeviation: number}}
 */
export function calculateMedianResults(samples) {
  if (!samples || samples.length === 0) {
    return { medianScore: 0, medianAngle: 0, medianDeviation: 9 };
  }

  const sortedByScore = [...samples].sort((a, b) => a.score - b.score);
  const midIdx = Math.floor(sortedByScore.length / 2);

  const medianScore = sortedByScore.length % 2 !== 0
    ? sortedByScore[midIdx].score
    : (sortedByScore[midIdx - 1].score + sortedByScore[midIdx].score) / 2;

  const sortedByAngle = [...samples].sort((a, b) => a.measuredAngle - b.measuredAngle);
  const medianAngle = sortedByAngle.length % 2 !== 0
    ? sortedByAngle[midIdx].measuredAngle
    : (sortedByAngle[midIdx - 1].measuredAngle + sortedByAngle[midIdx].measuredAngle) / 2;

  const deviation = Math.abs(medianAngle - CONFIG.TARGET_ANGLE);
  const clampedScore = Math.max(CONFIG.SCORE_MIN, Math.min(CONFIG.SCORE_MAX, Math.round(medianScore * 10) / 10));

  return {
    medianScore: clampedScore,
    medianAngle: Math.round(medianAngle * 100) / 100,
    medianDeviation: Math.round(deviation * 100) / 100
  };
}
