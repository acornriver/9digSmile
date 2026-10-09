/**
 * 9도 미소 측정 및 평가 시스템 - 캔버스 HUD 렌더러
 * 디자인 지침: 동네 전단지 + 노래방 자막 (원색 형광, 궁서체 워드아트, 깜빡이는 글씨)
 * 문구 지침: 감정 배제. 장식은 요란하되 내용은 사무적으로.
 */

import { CONFIG } from './config.js';
import { STATES } from './state-machine.js';

// 시스템 폰트 스택 (한국어 Windows 기본 탑재 폰트 우선)
const FONT_GUNG = '"궁서", "궁서체", "Gungsuh", "GungSeo", "AppleMyungjo", serif';
const FONT_HEAD = '"HY헤드라인M", "HYHeadLine-Medium", "맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
const FONT_GULIM = '"굴림", "Gulim", "돋움", "Dotum", "AppleGothic", sans-serif';

// 촌스러운 원색 팔레트
const C = {
  yellow: '#fff200',
  red: '#ff1a1a',
  pink: '#ff2bd6',
  blue: '#1238ff',
  navy: '#0a0a6b',
  cyan: '#00e5ff',
  green: '#39ff14',
  orange: '#ff8a00',
  white: '#ffffff',
  black: '#000000'
};

export class CanvasHudRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.photoCache = { src: null, img: null };
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  /**
   * HUD 전체 렌더링 루프
   */
  render({ state, smileData, progressInfo, finalResult, abortReason, subjectId }) {
    const { ctx, canvas } = this;
    const { width: w, height: h } = canvas;
    if (!w || !h) return;

    const u = h / 720; // 해상도 독립 단위
    const t = performance.now() / 1000;

    ctx.clearRect(0, 0, w, h);

    if (smileData && state !== STATES.RESULT) {
      this.drawFacialGeometry(smileData, state, u);
    }

    switch (state) {
      case STATES.IDLE:
        this.drawIdleOverlay(w, h, u, t, !!smileData);
        break;
      case STATES.CONSENT:
        // 동의 버튼은 HTML 오버레이에서 처리
        break;
      case STATES.COUNTDOWN:
        this.drawCountdownOverlay(w, h, u, t, progressInfo);
        break;
      case STATES.MEASURING:
        this.drawMeasuringOverlay(w, h, u, t, progressInfo);
        break;
      case STATES.RESULT:
        this.drawResultOverlay(w, h, u, t, finalResult, progressInfo, subjectId);
        break;
      case STATES.ABORTED:
        this.drawAbortedOverlay(w, h, u, t, abortReason);
        break;
    }

    this.drawBulbBorder(w, h, u, t, state);
  }

  /* ------------------------------------------------------------------
   * 공용 그리기 도구
   * ------------------------------------------------------------------ */

  /**
   * 워드아트: 두꺼운 이중 외곽선 + 그라데이션 채움 + 그림자
   */
  wordArt(text, x, y, size, opts = {}) {
    const { ctx } = this;
    const {
      font = FONT_GUNG,
      weight = '900',
      colors = [C.yellow, C.orange, C.red],
      outer = C.navy,
      inner = C.white,
      align = 'center',
      baseline = 'middle',
      shadow = true
    } = opts;

    ctx.save();
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';

    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(text, x + size * 0.08, y + size * 0.08);
    }

    ctx.strokeStyle = outer;
    ctx.lineWidth = size * 0.26;
    ctx.strokeText(text, x, y);

    ctx.strokeStyle = inner;
    ctx.lineWidth = size * 0.12;
    ctx.strokeText(text, x, y);

    const grad = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    colors.forEach((c, i) => grad.addColorStop(i / Math.max(1, colors.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * 노래방 자막: 진행률만큼 왼쪽부터 색이 칠해짐
   */
  karaoke(text, cx, y, size, progress, opts = {}) {
    const { ctx } = this;
    const { font = FONT_HEAD, sung = C.pink, sungStroke = C.white, base = C.white, baseStroke = C.navy } = opts;

    ctx.save();
    ctx.font = `900 ${size}px ${font}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const tw = ctx.measureText(text).width;
    const x = cx - tw / 2;

    // 아직 부르지 않은 부분
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = size * 0.22;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = base;
    ctx.fillText(text, x, y);

    // 부른 부분 (클리핑으로 채색)
    const p = Math.max(0, Math.min(1, progress));
    if (p > 0) {
      ctx.beginPath();
      ctx.rect(x - size, y - size, size + tw * p, size * 2);
      ctx.clip();
      ctx.strokeStyle = sungStroke;
      ctx.lineWidth = size * 0.22;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = sung;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  /**
   * 전단지용 폭발 별 모양 (starburst)
   */
  starburst(cx, cy, rOuter, rInner, points, rotation, fill, stroke, lineWidth) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (Math.PI * i) / points;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 공백 기준 줄바꿈 텍스트
   */
  wrapText(text, x, y, maxWidth, lineHeight) {
    const { ctx } = this;
    const words = String(text).split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  /**
   * 화면 테두리 전구 (노래방 간판 / 개업 전단 감성)
   */
  drawBulbBorder(w, h, u, t, state) {
    const { ctx } = this;
    const gap = 34 * u;
    const r = 5 * u;
    const m = 10 * u;
    const palette = state === STATES.ABORTED
      ? [C.red, C.yellow]
      : [C.yellow, C.pink, C.cyan, C.green];
    const phase = Math.floor(t * (state === STATES.MEASURING ? 10 : 4));

    const pts = [];
    for (let x = m; x <= w - m; x += gap) { pts.push([x, m]); }
    for (let y = m + gap; y <= h - m; y += gap) { pts.push([w - m, y]); }
    for (let x = w - m - gap; x >= m; x -= gap) { pts.push([x, h - m]); }
    for (let y = h - m - gap; y > m; y -= gap) { pts.push([m, y]); }

    ctx.save();
    pts.forEach(([x, y], i) => {
      const on = (i + phase) % 3 !== 0;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = on ? palette[(i + phase) % palette.length] : 'rgba(80,80,80,0.6)';
      ctx.shadowColor = on ? ctx.fillStyle : 'transparent';
      ctx.shadowBlur = on ? 10 * u : 0;
      ctx.fill();
    });
    ctx.restore();
  }

  /* ------------------------------------------------------------------
   * 안면 기하학 표시
   * ------------------------------------------------------------------ */

  drawFacialGeometry(data, state, u) {
    const { ctx } = this;
    const { rawPoints, rollDeg, measuredAngle } = data;
    const { eyeL, eyeR, lipCenter, cornerL, cornerR } = rawPoints;

    ctx.save();
    ctx.lineCap = 'round';

    // 양 눈 기준선 (형광 하늘색 점선)
    ctx.strokeStyle = C.cyan;
    ctx.setLineDash([8 * u, 6 * u]);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(eyeL.x, eyeL.y);
    ctx.lineTo(eyeR.x, eyeR.y);
    ctx.stroke();
    ctx.setLineDash([]);

    [eyeL, eyeR].forEach(pt => {
      this.starburst(pt.x, pt.y, 9 * u, 4 * u, 5, 0, C.yellow, C.navy, 1.5 * u);
    });

    const eyeMidX = (eyeL.x + eyeR.x) / 2;
    const eyeMidY = Math.min(eyeL.y, eyeR.y) - 22 * u;
    ctx.font = `bold ${16 * u}px ${FONT_GULIM}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = C.navy;
    ctx.strokeText(`고개 기울기 ${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`, eyeMidX, eyeMidY);
    ctx.fillStyle = C.cyan;
    ctx.fillText(`고개 기울기 ${rollDeg >= 0 ? '+' : ''}${rollDeg.toFixed(1)}°`, eyeMidX, eyeMidY);

    // 9도 기준 가이드선 (빨간 점선)
    const mouthWidth = Math.hypot(cornerR.x - cornerL.x, cornerR.y - cornerL.y);
    const guideLen = Math.max(40 * u, mouthWidth * 0.62);
    const rollRad = (rollDeg * Math.PI) / 180;
    const targetRad = (CONFIG.TARGET_ANGLE * Math.PI) / 180;
    const aL = Math.PI - rollRad - targetRad;
    const aR = -rollRad + targetRad;
    const gL = { x: lipCenter.x + Math.cos(aL) * guideLen, y: lipCenter.y - Math.sin(aL) * guideLen };
    const gR = { x: lipCenter.x + Math.cos(aR) * guideLen, y: lipCenter.y - Math.sin(aR) * guideLen };

    ctx.strokeStyle = C.red;
    ctx.setLineDash([5 * u, 5 * u]);
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.moveTo(lipCenter.x, lipCenter.y); ctx.lineTo(gL.x, gL.y);
    ctx.moveTo(lipCenter.x, lipCenter.y); ctx.lineTo(gR.x, gR.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 입술 중앙 → 입꼬리 측정선 (형광 노랑, 굵게)
    ctx.strokeStyle = C.navy;
    ctx.lineWidth = 7 * u;
    ctx.beginPath();
    ctx.moveTo(cornerL.x, cornerL.y); ctx.lineTo(lipCenter.x, lipCenter.y); ctx.lineTo(cornerR.x, cornerR.y);
    ctx.stroke();
    ctx.strokeStyle = state === STATES.MEASURING ? C.green : C.yellow;
    ctx.lineWidth = 3.5 * u;
    ctx.stroke();

    [cornerL, cornerR].forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 * u, 0, Math.PI * 2);
      ctx.fillStyle = C.pink;
      ctx.fill();
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = C.white;
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.arc(lipCenter.x, lipCenter.y, 5 * u, 0, Math.PI * 2);
    ctx.fillStyle = C.white;
    ctx.fill();

    // "9도 여기까지" 말풍선 태그
    ctx.font = `bold ${13 * u}px ${FONT_GULIM}`;
    ctx.textAlign = 'left';
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = C.white;
    ctx.strokeText('← 9도 여기까지!', gR.x + 6 * u, gR.y);
    ctx.fillStyle = C.red;
    ctx.fillText('← 9도 여기까지!', gR.x + 6 * u, gR.y);

    // 실시간 각도 가격표 (노란 딱지)
    const diff = measuredAngle - CONFIG.TARGET_ANGLE;
    const label = `${measuredAngle.toFixed(2)}° (${diff >= 0 ? '+' : ''}${diff.toFixed(2)})`;
    ctx.font = `900 ${18 * u}px ${FONT_HEAD}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 24 * u;
    const bh = 32 * u;
    const bx = lipCenter.x - bw / 2;
    const by = lipCenter.y + 34 * u;
    ctx.save();
    ctx.translate(lipCenter.x, by + bh / 2);
    ctx.rotate(-0.04);
    ctx.translate(-lipCenter.x, -(by + bh / 2));
    ctx.fillStyle = C.yellow;
    ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = C.red;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = C.red;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, lipCenter.x, by + bh / 2 + 1 * u);
    ctx.restore();

    ctx.restore();
  }

  /* ------------------------------------------------------------------
   * 상태별 오버레이
   * ------------------------------------------------------------------ */

  drawIdleOverlay(w, h, u, t, hasFace) {
    const blink = Math.floor(t * 2) % 2 === 0;
    this.wordArt('♪ 피험자 대기중 ♪', w / 2, 70 * u, 54 * u, {
      colors: blink ? [C.yellow, C.orange, C.red] : [C.white, C.cyan, C.blue]
    });

    const msg = hasFace
      ? '안면 감지 중. 자세를 유지하십시오.'
      : '카메라를 정면으로 응시하십시오.';
    this.karaoke(msg, w / 2, h - 70 * u, 34 * u, (t % 3) / 3);
  }

  drawCountdownOverlay(w, h, u, t, progressInfo) {
    const cx = w / 2;
    const cy = h / 2 - 20 * u;
    const cdNum = Math.max(1, Math.ceil(parseFloat(progressInfo.remainingSec)));

    // 회전하는 폭발 별 배경
    this.starburst(cx, cy, 150 * u, 105 * u, 16, t * 0.8, C.yellow, C.red, 6 * u);
    this.starburst(cx, cy, 112 * u, 86 * u, 16, -t * 1.2, C.red, C.white, 3 * u);

    // 숫자 (튀어나오는 효과)
    const frac = parseFloat(progressInfo.remainingSec) % 1;
    const pop = 1 + Math.max(0, frac - 0.75) * 1.6;
    this.wordArt(String(cdNum), cx, cy + 6 * u, 150 * u * pop, {
      font: FONT_HEAD,
      colors: [C.white, C.yellow, C.orange],
      outer: C.navy,
      inner: C.black
    });

    this.wordArt('준비하십시오', cx, cy - 175 * u, 44 * u, {
      colors: [C.cyan, C.white, C.cyan], outer: C.navy
    });

    this.karaoke('정면 응시 유지. 안면 근육의 긴장을 해제하십시오.', cx, h - 70 * u, 30 * u, progressInfo.progress, {
      sung: C.cyan
    });
  }

  drawMeasuringOverlay(w, h, u, t, progressInfo) {
    const { ctx } = this;
    const blink = Math.floor(t * 3) % 2 === 0;

    // 좌상단 녹화중 딱지
    ctx.save();
    ctx.font = `900 ${26 * u}px ${FONT_HEAD}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (blink) {
      ctx.beginPath();
      ctx.arc(50 * u, 52 * u, 11 * u, 0, Math.PI * 2);
      ctx.fillStyle = C.red;
      ctx.fill();
    }
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = C.black;
    ctx.strokeText('측정중', 70 * u, 53 * u);
    ctx.fillStyle = C.white;
    ctx.fillText('측정중', 70 * u, 53 * u);
    ctx.restore();

    // 상단 대형 워드아트
    this.wordArt('★ 미소 정밀 계측 ★', w / 2, 62 * u, 50 * u, {
      colors: [C.green, C.yellow, C.green], outer: C.navy
    });

    // 노래방 진행 막대
    const bw = Math.min(760 * u, w - 120 * u);
    const bx = (w - bw) / 2;
    const by = h - 130 * u;
    const bh = 22 * u;
    ctx.save();
    ctx.fillStyle = C.navy;
    ctx.fillRect(bx - 4 * u, by - 4 * u, bw + 8 * u, bh + 8 * u);
    ctx.fillStyle = '#333';
    ctx.fillRect(bx, by, bw, bh);
    const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    grad.addColorStop(0, C.red);
    grad.addColorStop(0.25, C.orange);
    grad.addColorStop(0.5, C.yellow);
    grad.addColorStop(0.75, C.green);
    grad.addColorStop(1, C.cyan);
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw * progressInfo.progress, bh);
    ctx.font = `900 ${16 * u}px ${FONT_HEAD}`;
    ctx.fillStyle = C.white;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.floor(progressInfo.progress * 100)}%  남은시간 ${progressInfo.remainingSec}초`, bx + bw, by - 18 * u);
    ctx.restore();

    this.karaoke('안면 근육의 정렬을 분석 중입니다.', w / 2, h - 70 * u, 36 * u, progressInfo.progress);
  }

  drawResultOverlay(w, h, u, t, result, progressInfo, subjectId) {
    if (!result) return;
    const { ctx } = this;

    const cardW = Math.min(1040 * u, w - 80 * u);
    const cardH = 600 * u;
    const cx0 = (w - cardW) / 2;
    const cy0 = (h - cardH) / 2;

    ctx.save();

    // 화면 어둡게
    ctx.fillStyle = 'rgba(0, 0, 60, 0.55)';
    ctx.fillRect(0, 0, w, h);

    // 전단지 본체 (노란 바탕 + 빨간 이중 테두리)
    ctx.fillStyle = C.yellow;
    ctx.fillRect(cx0, cy0, cardW, cardH);
    ctx.lineWidth = 10 * u;
    ctx.strokeStyle = C.red;
    ctx.strokeRect(cx0, cy0, cardW, cardH);
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = C.blue;
    ctx.setLineDash([12 * u, 8 * u]);
    ctx.strokeRect(cx0 + 16 * u, cy0 + 16 * u, cardW - 32 * u, cardH - 32 * u);
    ctx.setLineDash([]);

    // 상단 빨간 띠
    ctx.fillStyle = C.red;
    ctx.fillRect(cx0 + 16 * u, cy0 + 16 * u, cardW - 32 * u, 56 * u);
    ctx.font = `900 ${28 * u}px ${FONT_HEAD}`;
    ctx.fillStyle = C.yellow;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★★ 중앙 통제국 감정관리처 공식 판정 ★★', cx0 + cardW / 2, cy0 + 45 * u);

    // 증명사진 영역
    const pw = 240 * u;
    const ph = 320 * u;
    const px = cx0 + 44 * u;
    const py = cy0 + 100 * u;
    ctx.fillStyle = C.white;
    ctx.fillRect(px - 8 * u, py - 8 * u, pw + 16 * u, ph + 16 * u);
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = C.navy;
    ctx.strokeRect(px - 8 * u, py - 8 * u, pw + 16 * u, ph + 16 * u);

    const img = this.getPhotoImage(result.photo);
    if (img && img.complete && img.naturalWidth) {
      ctx.drawImage(img, px, py, pw, ph);
    } else {
      ctx.fillStyle = '#d9d9d9';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = '#555';
      ctx.font = `900 ${26 * u}px ${FONT_GULIM}`;
      ctx.fillText('사진 기록', px + pw / 2, py + ph / 2 - 18 * u);
      ctx.fillText('거부됨', px + pw / 2, py + ph / 2 + 18 * u);
    }
    ctx.font = `bold ${16 * u}px ${FONT_GULIM}`;
    ctx.fillStyle = C.navy;
    ctx.fillText(subjectId || '', px + pw / 2, py + ph + 30 * u);

    // 점수 워드아트
    const rx = px + pw + 60 * u;
    const rMid = rx + (cx0 + cardW - 40 * u - rx) / 2;
    ctx.font = `bold ${22 * u}px ${FONT_GULIM}`;
    ctx.fillStyle = C.navy;
    ctx.textAlign = 'left';
    ctx.fillText('순수 미소 점수 (중앙값)', rx, cy0 + 120 * u);

    this.wordArt(`${result.score.toFixed(1)}점`, rMid - 40 * u, cy0 + 205 * u, 120 * u, {
      font: FONT_HEAD,
      colors: [C.white, C.pink, C.red],
      outer: C.navy,
      inner: C.white
    });

    // 판정 폭발 별 딱지
    const sbx = cx0 + cardW - 120 * u;
    const sby = cy0 + 175 * u;
    const wobble = Math.sin(t * 6) * 0.06;
    this.starburst(sbx, sby, 105 * u, 80 * u, 18, wobble, C.red, C.yellow, 4 * u);
    ctx.save();
    ctx.translate(sbx, sby);
    ctx.rotate(-0.2 + wobble);
    ctx.font = `900 ${22 * u}px ${FONT_HEAD}`;
    ctx.fillStyle = C.yellow;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const flyer = result.classification.flyer || result.classification.label;
    const parts = flyer.split(' ');
    const half = Math.ceil(parts.length / 2);
    ctx.fillText(parts.slice(0, half).join(' '), 0, -14 * u);
    ctx.fillText(parts.slice(half).join(' '), 0, 16 * u);
    ctx.restore();

    // 상세 계측표 (굴림체 공문서 표)
    const ty = cy0 + 290 * u;
    const tW = cx0 + cardW - 44 * u - rx;
    const cols = ['기준각', '측정각', '편차', '판정'];
    const vals = [
      `${CONFIG.TARGET_ANGLE.toFixed(2)}°`,
      `${result.measuredAngle.toFixed(2)}°`,
      `±${result.deviation.toFixed(2)}°`,
      result.classification.label
    ];
    const colW = tW / cols.length;
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = C.navy;
    cols.forEach((c, i) => {
      const x = rx + colW * i;
      ctx.fillStyle = C.blue;
      ctx.fillRect(x, ty, colW, 34 * u);
      ctx.fillStyle = C.white;
      ctx.fillRect(x, ty + 34 * u, colW, 44 * u);
      ctx.strokeRect(x, ty, colW, 78 * u);
      ctx.textAlign = 'center';
      ctx.font = `bold ${17 * u}px ${FONT_GULIM}`;
      ctx.fillStyle = C.white;
      ctx.fillText(c, x + colW / 2, ty + 18 * u);
      ctx.font = `900 ${20 * u}px ${FONT_GULIM}`;
      ctx.fillStyle = C.red;
      ctx.fillText(vals[i], x + colW / 2, ty + 57 * u);
    });

    // 궁서체 사무 문구
    ctx.textAlign = 'left';
    ctx.font = `900 ${30 * u}px ${FONT_GUNG}`;
    ctx.fillStyle = C.red;
    ctx.fillText('"감정이 배제된 순수 미소 점수입니다."', rx, cy0 + 420 * u);
    ctx.font = `bold ${18 * u}px ${FONT_GULIM}`;
    ctx.fillStyle = C.navy;
    this.wrapText(result.classification.desc, rx, cy0 + 460 * u, tW, 26 * u);

    // 하단 안내
    ctx.font = `bold ${16 * u}px ${FONT_GULIM}`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    const photoNote = result.photo ? '증명사진 포함' : '사진 미포함';
    ctx.fillText(
      `※ 감사 기록부 등재 완료 (${photoNote}) ※  ${progressInfo.remainingSec}초 후 대기 복귀  [스페이스바: 즉시 복귀]`,
      cx0 + cardW / 2, cy0 + cardH - 40 * u
    );

    ctx.restore();
  }

  drawAbortedOverlay(w, h, u, t, reason) {
    const { ctx } = this;
    ctx.save();

    // 공사장 경고 띠
    const stripeH = 46 * u;
    [0, h - stripeH].forEach(y => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, w, stripeH);
      ctx.clip();
      ctx.fillStyle = C.yellow;
      ctx.fillRect(0, y, w, stripeH);
      ctx.fillStyle = C.black;
      const sw = 40 * u;
      const off = (t * 80 * u) % (sw * 2);
      for (let x = -sw * 2 + off; x < w + sw; x += sw * 2) {
        ctx.beginPath();
        ctx.moveTo(x, y + stripeH);
        ctx.lineTo(x + sw, y);
        ctx.lineTo(x + sw * 2, y);
        ctx.lineTo(x + sw, y + stripeH);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    });

    ctx.fillStyle = 'rgba(120, 0, 0, 0.55)';
    ctx.fillRect(0, stripeH, w, h - stripeH * 2);

    const blink = Math.floor(t * 4) % 2 === 0;
    this.wordArt('※ 경 고 ※', w / 2, h / 2 - 90 * u, 90 * u, {
      font: FONT_HEAD,
      colors: blink ? [C.yellow, C.yellow, C.orange] : [C.white, C.white, C.yellow],
      outer: C.black,
      inner: C.red
    });

    ctx.font = `900 ${32 * u}px ${FONT_GUNG}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = C.black;
    const text = reason || '피험자를 인식하지 못했습니다.';
    ctx.strokeText(text, w / 2, h / 2 + 10 * u, w - 120 * u);
    ctx.fillStyle = C.white;
    ctx.fillText(text, w / 2, h / 2 + 10 * u, w - 120 * u);

    ctx.font = `bold ${20 * u}px ${FONT_GULIM}`;
    ctx.fillStyle = C.yellow;
    ctx.fillText('시스템이 곧 대기 모드로 자동 전환됩니다.', w / 2, h / 2 + 70 * u);

    ctx.restore();
  }

  getPhotoImage(src) {
    if (!src) return null;
    if (this.photoCache.src !== src) {
      const img = new Image();
      img.src = src;
      this.photoCache = { src, img };
    }
    return this.photoCache.img;
  }
}
