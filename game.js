// 아요의 비거 날리기 — 게임 코드
// 문구와 수치는 data.js에서 고칩니다.
'use strict';

// =============================================================
// 1. 비행 계산 (화면과 무관, 같은 조합은 항상 같은 결과)
// =============================================================
const SIM_STEP = 1 / 60;
const SAMPLE_EVERY = 4; // 궤적 저장 간격(스텝)

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// 부품 조합 하나를 끝까지 계산해서 궤적과 결과를 돌려준다
function simulateFlight(wingKey, bodyKey, ballastKey) {
  const f = CONFIG.flight;
  const wing = CONFIG.wings[wingKey];
  const body = CONFIG.bodies[bodyKey];
  const ballast = CONFIG.ballasts[ballastKey];
  const ratio = wing.lift / body.weight;

  const mode = ballast.behavior === 'flip' ? 'flip' : body.alwaysCrash ? 'heavy' : 'glide';
  const dive = ballast.behavior === 'dive';
  const cruise = f.cruiseSpeed / wing.drag;
  const sink = f.sinkBase / Math.pow(ratio, f.glideSharpness);

  let x = 0, y = f.launchHeight, vx = f.launchSpeed, vy = f.launchLift, pitch = 8, t = 0, step = 0;
  const samples = [{ t: 0, x, y, pitch }];

  while (y > f.groundClearance && t < 30) {
    const dt = SIM_STEP;
    if (mode === 'flip') {
      // 뒤 무게추: 잠깐 솟았다가 뒤로 뒤집혀 떨어진다
      if (t < f.flipRiseTime) {
        vy += f.flipRisePower * Math.min(ratio, 1.2) * dt;
        pitch += (70 - pitch) * Math.min(1, 3 * dt);
      } else {
        vy -= f.gravity * dt;
        pitch += f.flipSpin * dt;
      }
      vx += -vx * wing.flipSlow * dt;
    } else if (mode === 'heavy') {
      // 쇠 몸통: 날개가 버티지 못하고 떨어진다
      const fall = f.gravity * (1 - Math.min(0.75, ratio * f.heavyLiftShare)) * (dive ? 1.25 : 1);
      vy -= fall * dt;
      vx += -vx * f.heavySlow * dt;
      pitch += ((dive ? -75 : -45) - pitch) * Math.min(1, 1.5 * dt);
    } else {
      // 활공: 하강 속도와 앞 속도가 목표값으로 천천히 맞춰진다
      const target = sink * (dive ? 1 + f.diveRate * t : 1);
      vy += (-target - vy) * Math.min(1, f.sinkResponse * dt);
      vx += (cruise - vx) * Math.min(1, dt);
      const pathAngle = Math.atan2(vy, vx) * 180 / Math.PI;
      const wanted = dive ? Math.max(-f.diveMaxPitch - 25, pathAngle - 14 * t) : clamp(pathAngle * 0.6, -18, 12);
      pitch += (wanted - pitch) * Math.min(1, 3 * dt);
    }
    x += vx * dt;
    y += vy * dt;
    t += dt;
    step++;
    if (step % SAMPLE_EVERY === 0) samples.push({ t, x, y, pitch });
  }
  samples.push({ t, x, y: Math.max(y, f.groundClearance), pitch });

  const crashed = !!(body.alwaysCrash || ballast.alwaysCrash);
  const distance = Math.round(x);
  const w = CONFIG.world;
  const grade = gradeOf(distance, crashed);
  return {
    wing: wingKey, body: bodyKey, ballast: ballastKey,
    samples, crashed, distance, grade,
    feedback: feedbackKey(wingKey, bodyKey, ballastKey),
    inRiver: x >= w.riverStart && x < w.riverEnd,
    simSeconds: t,
    playSeconds: clamp(t, f.minPlaySeconds, f.maxPlaySeconds),
  };
}

function gradeOf(distance, crashed) {
  if (crashed) return 'crash';
  if (distance >= CONFIG.grades.bestFrom) return 'best';
  if (distance >= CONFIG.grades.goodFrom) return 'good';
  return 'low';
}

// 피드백 우선순위: 위에서 먼저 맞는 것 하나만
function feedbackKey(wingKey, bodyKey, ballastKey) {
  if (CONFIG.ballasts[ballastKey].behavior === 'flip') return 'ballastBack';
  if (CONFIG.bodies[bodyKey].alwaysCrash) return 'ironBody';
  if (CONFIG.ballasts[ballastKey].behavior === 'dive') return 'ballastFront';
  if (wingKey === 'small') return 'smallWing';
  return 'balanced';
}

// 27가지 조합 검사 — 브라우저 콘솔에서 runAllCombos() 실행
function runAllCombos() {
  const rows = [], problems = [];
  for (const wing of Object.keys(CONFIG.wings))
    for (const body of Object.keys(CONFIG.bodies))
      for (const ballast of Object.keys(CONFIG.ballasts)) {
        const a = simulateFlight(wing, body, ballast);
        const b = simulateFlight(wing, body, ballast);
        const name = `${CONFIG.wings[wing].name} + ${CONFIG.bodies[body].name} + ${CONFIG.ballasts[ballast].name}`;
        rows.push({
          조합: name, '거리(m)': a.distance, 등급: GRADE_TEXT[a.grade],
          '하모 설명': a.feedback, 착지: a.inRiver ? '남강' : '모래밭',
          '비행(초)': +a.playSeconds.toFixed(1),
        });
        const mustCrash = body === 'iron' || ballast === 'back';
        if (mustCrash !== (a.grade === 'crash')) problems.push(`${name}: 추락 규칙 위반`);
        if (a.distance !== b.distance || a.samples.length !== b.samples.length) problems.push(`${name}: 결과가 매번 다름`);
        if (ballast === 'front' && !mustCrash && a.grade !== 'low') problems.push(`${name}: 앞 무게추는 "조금 날았어"여야 함`);
        if (wing === 'small' && !mustCrash && a.grade !== 'low') problems.push(`${name}: 작은 날개는 "조금 날았어"여야 함`);
        if (a.feedback === 'balanced' && a.grade !== 'good' && a.grade !== 'best') problems.push(`${name}: 칭찬 대사인데 등급이 낮음`);
        if (a.crashed !== a.inRiver) problems.push(`${name}: 추락은 남강, 그 외는 모래밭이어야 함`);
        if (a.simSeconds > CONFIG.flight.maxPlaySeconds) problems.push(`${name}: 비행 ${a.simSeconds.toFixed(1)}초(6초 초과, 빠르게 재생됨)`);
      }
  const best = simulateFlight('big', 'bamboo', 'center');
  rows.forEach(r => {
    if (!r.조합.startsWith('큰 날개 + 대나무 + 가운데') && r['거리(m)'] >= best.distance) problems.push(`${r.조합}: 최적 조합보다 멀리 감`);
    if (r.조합 !== '큰 날개 + 대나무 + 가운데' && r.등급 === GRADE_TEXT.best) problems.push(`${r.조합}: 최적 조합 외에 최고 기록`);
  });
  if (best.grade !== 'best') problems.push('최적 조합이 최고 기록이 아님');
  // 뒤 무게추: 날개가 클수록 추락 전에 조금 더 멀리 간다
  for (const body of Object.keys(CONFIG.bodies)) {
    const d = ['small', 'normal', 'big'].map(w => simulateFlight(w, body, 'back').distance);
    if (!(d[0] < d[1] && d[1] < d[2])) problems.push(`${CONFIG.bodies[body].name} + 뒤: 작은 < 보통 < 큰 순서가 아님(${d.join(', ')})`);
  }
  console.table(rows);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('27가지 조합 검사 통과');
  return { rows, problems };
}

// =============================================================
// 2. 오늘의 최고 기록 (저장 실패해도 메모리로 계속 동작)
// =============================================================
const TOP_KEY = 'ayo-bigeo-top';
let memoryTop = { date: '', list: [] };

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function loadTop() {
  const today = todayString();
  try {
    const raw = localStorage.getItem(TOP_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.date === today && Array.isArray(saved.list)) memoryTop = saved;
    }
  } catch (e) { /* 저장소를 못 쓰면 메모리 기록만 사용 */ }
  if (memoryTop.date !== today) memoryTop = { date: today, list: [] };
  return memoryTop.list;
}

// 같은 조합은 결과가 같으므로 한 번만 올린다. 추락은 올리지 않는다.
function saveTop(flight) {
  if (flight.crashed) return;
  const list = loadTop();
  const combo = `${flight.wing}/${flight.body}/${flight.ballast}`;
  if (list.some(r => r.combo === combo)) return;
  list.push({ combo, distance: flight.distance });
  list.sort((a, b) => b.distance - a.distance);
  list.length = Math.min(list.length, CONFIG.topMax);
  try { localStorage.setItem(TOP_KEY, JSON.stringify(memoryTop)); } catch (e) { /* 무시 */ }
}

// =============================================================
// 이 아래는 브라우저 화면 코드 (Node 테스트에서는 실행하지 않음)
// =============================================================
const C = {
  ink: '#3b3a36', paper: '#fff9ec', sky: '#cfebf7', cloud: '#ffffff',
  hill: '#bfe08a', hillBack: '#d5ecae', hillDark: '#a6d06f',
  river: '#4fb8b0', riverLine: '#7fd0c9', sand: '#f1dfa9', sandDark: '#e3cc8c',
  wood: '#c89b6c', woodDark: '#a97f52', woodLight: '#dcb78c',
  bamboo: '#cfd67a', bambooDark: '#9ba84f', iron: '#9aa3ab', ironDark: '#6c757d',
  wing: '#f8ecd2', wingBack: '#e6d3a9', stone: '#c8553d',
  orange: '#f28c38', orangeDark: '#d9701f', muzzle: '#fff4e2', collar: '#d8362f',
  hamo: '#a9c4e8', hamoLight: '#ffffff',
  wall: '#e6dfcc', wallDark: '#cbc2a8', roof: '#5e8a84',
};
const W = 1920, H = 1080;           // 논리 해상도
const GROUND_Y = 840, RULER_Y = 970; // 땅 높이, 눈금 시작
const WORLD_X0 = 290, WORLD_SCALE = 12.5; // 출발점 위치, 1m당 픽셀
const px = m => WORLD_X0 + m * WORLD_SCALE;
const py = m => GROUND_Y - m * WORLD_SCALE;

const images = {};
const game = {
  screen: 'title', dirty: true, lastInput: 0, canvasK: 1,
  pick: { ...CONFIG.defaults },
  history: [], flight: null, isRetry: false, goodbye: false, lastQuiz: -1,
  quizHamo: 'quiz',
};
let canvas, ctx, ui, bg, bgCtx, bgKind = '';

// ----- 이미지 미리 로딩 (실패하면 null → 도형으로 대체) -----
function loadImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function preload() {
  const files = [...new Set(Object.values(HAMO_IMG))];
  const jobs = files.map(async f => { images[f] = await loadImage('assets/hamo/' + f); });
  jobs.push((async () => { images.ayo = await loadImage('assets/ayo.png'); })());
  // 파일 하나가 응답이 없어도 5초 뒤에는 게임을 시작한다
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 5000))]);
}

// ----- 화면 크기: 16:9 레터박스 -----
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const sw = Math.floor(Math.min(vw, vh * 16 / 9));
  const sh = Math.floor(sw * 9 / 16);
  const stage = document.getElementById('stage');
  stage.style.width = sw + 'px';
  stage.style.height = sh + 'px';
  stage.style.left = Math.floor((vw - sw) / 2) + 'px';
  stage.style.top = Math.floor((vh - sh) / 2) + 'px';
  document.documentElement.style.fontSize = (sw / 48) + 'px';

  const dpr = window.devicePixelRatio || 1;
  const cw = Math.round(Math.min(sw * dpr, CONFIG.maxCanvasWidth));
  game.canvasK = cw / W;
  canvas.width = bg.width = cw;
  canvas.height = bg.height = Math.round(cw * 9 / 16);
  const kind = bgKind;
  bgKind = '';
  if (kind) setBg(kind); // 캔버스 크기가 바뀌면 배경을 다시 그린다
  game.dirty = true;
}

// ----- 그리기 도구 -----
function resetTransform(c) { c.setTransform(game.canvasK, 0, 0, game.canvasK, 0, 0); }

function drawBg() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bg, 0, 0);
  resetTransform(ctx);
}

function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

function roundBox(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function fillStroke(c, fill, lw) {
  c.fillStyle = fill; c.fill();
  c.lineWidth = lw || 4; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.stroke();
}

// 이미지를 원본 비율 그대로, 높이 또는 너비 안에 맞춰 그린다
function drawFit(c, img, cx, cy, maxW, maxH) {
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k, h = img.height * k;
  c.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

// 하모: 이미지가 없으면 하늘색 원으로 대체
function drawHamo(c, key, cx, cy, maxW, maxH) {
  const img = images[HAMO_IMG[key]];
  if (img) { drawFit(c, img, cx, cy, maxW, maxH); return; }
  const r = Math.min(maxW, maxH) * 0.42;
  circle(c, cx, cy, r); fillStroke(c, C.hamo);
  c.fillStyle = C.hamoLight;
  circle(c, cx, cy + r * 0.3, r * 0.55); c.fill();
  c.fillStyle = C.ink;
  circle(c, cx - r * 0.35, cy - r * 0.15, r * 0.08); c.fill();
  circle(c, cx + r * 0.35, cy - r * 0.15, r * 0.08); c.fill();
  circle(c, cx, cy + r * 0.1, r * 0.1); c.fill();
}

// 아요: assets/ayo.png가 있으면 이미지, 없으면 도형
function drawAyo(c, cx, cy, r) {
  if (images.ayo) { drawFit(c, images.ayo, cx, cy, r * 2.4, r * 2.4); return; }
  c.beginPath(); // 귀
  c.moveTo(cx - r * 0.85, cy - r * 0.35); c.lineTo(cx - r * 0.75, cy - r * 1.2); c.lineTo(cx - r * 0.15, cy - r * 0.85); c.closePath();
  fillStroke(c, C.orange, 3.5);
  c.beginPath();
  c.moveTo(cx + r * 0.85, cy - r * 0.35); c.lineTo(cx + r * 0.75, cy - r * 1.2); c.lineTo(cx + r * 0.15, cy - r * 0.85); c.closePath();
  fillStroke(c, C.orange, 3.5);
  circle(c, cx, cy, r); fillStroke(c, C.orange, 3.5); // 머리
  // 이마 줄무늬
  c.strokeStyle = C.orangeDark; c.lineWidth = r * 0.12; c.lineCap = 'round';
  for (const dx of [-0.25, 0, 0.25]) {
    c.beginPath(); c.moveTo(cx + r * dx, cy - r * 0.92); c.lineTo(cx + r * dx, cy - r * 0.55); c.stroke();
  }
  // 입 주변, 눈, 코
  c.fillStyle = C.muzzle;
  c.beginPath(); c.ellipse(cx + r * 0.08, cy + r * 0.42, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.ink;
  circle(c, cx - r * 0.3, cy - r * 0.05, r * 0.11); c.fill();
  circle(c, cx + r * 0.46, cy - r * 0.05, r * 0.11); c.fill();
  c.fillStyle = C.collar;
  circle(c, cx + r * 0.08, cy + r * 0.26, r * 0.09); c.fill();
  // 빨간 목줄
  c.strokeStyle = C.collar; c.lineWidth = r * 0.24; c.lineCap = 'round';
  c.beginPath(); c.arc(cx, cy + r * 0.1, r * 0.93, Math.PI * 0.32, Math.PI * 0.68); c.stroke();
  c.lineCap = 'butt';
}

// 날개 한 장 (size: 그림 크기, flap: 날갯짓 0~1)
function wingPath(c, size, flap) {
  const s = size * 170, up = 1 + (flap || 0) * 0.08;
  const rootF = 40 * Math.max(0.75, size), rootB = -48 * Math.max(0.75, size);
  const tipX = -0.32 * s, tipY = -s * up;
  c.beginPath();
  c.moveTo(rootF, -6);
  c.quadraticCurveTo(rootF * 0.9, -s * 0.72 * up, tipX, tipY);
  // 뒤쪽 깃털 세 칸
  const N = 3;
  for (let i = 1; i <= N; i++) {
    const a = (i - 1) / N, b = i / N;
    const x0 = tipX + (rootB - tipX) * a, y0 = tipY + (-6 - tipY) * a;
    const x1 = tipX + (rootB - tipX) * b, y1 = tipY + (-6 - tipY) * b;
    const mx = (x0 + x1) / 2 - s * 0.16, my = (y0 + y1) / 2 - s * 0.03;
    c.quadraticCurveTo(mx, my, x1, y1);
  }
  c.closePath();
}

function drawWingShape(c, wingKey, flap) {
  const size = CONFIG.wings[wingKey].drawSize;
  c.save(); c.translate(14, 0); c.rotate(0.3); wingPath(c, size, flap); fillStroke(c, C.wingBack); c.restore();
  wingPath(c, size, flap); fillStroke(c, C.wing);
  // 살대
  const s = size * 170;
  c.strokeStyle = C.woodDark; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-4, -8); c.lineTo(-0.28 * s, -s * 0.84); c.stroke();
  c.lineCap = 'butt';
}

function hullPath(c) {
  c.beginPath();
  c.moveTo(-108, -8); c.lineTo(112, -8);
  c.quadraticCurveTo(104, 38, 58, 40);
  c.lineTo(-62, 40);
  c.quadraticCurveTo(-100, 38, -108, -8);
  c.closePath();
}

function drawHull(c, bodyKey) {
  const main = bodyKey === 'bamboo' ? C.bamboo : bodyKey === 'iron' ? C.iron : C.wood;
  const dark = bodyKey === 'bamboo' ? C.bambooDark : bodyKey === 'iron' ? C.ironDark : C.woodDark;
  // 꼬리
  c.beginPath(); c.moveTo(-96, -6); c.lineTo(-146, -44); c.lineTo(-128, 8); c.closePath();
  fillStroke(c, main);
  hullPath(c); c.fillStyle = main; c.fill();
  c.save(); hullPath(c); c.clip();
  c.strokeStyle = c.fillStyle = dark;
  if (bodyKey === 'bamboo') {       // 대나무 마디
    c.lineWidth = 5;
    for (let x = -80; x <= 90; x += 42) { c.beginPath(); c.moveTo(x, -10); c.lineTo(x, 42); c.stroke(); }
  } else if (bodyKey === 'wood') {  // 나무판 줄
    c.lineWidth = 3.5;
    for (const y of [8, 24]) { c.beginPath(); c.moveTo(-110, y); c.lineTo(112, y); c.stroke(); }
  } else {                          // 쇠 징
    for (let x = -80; x <= 90; x += 34) { circle(c, x, 4, 5); c.fill(); circle(c, x, 26, 5); c.fill(); }
  }
  c.restore();
  hullPath(c); c.lineWidth = 4; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.stroke();
}

function drawStone(c, ballastKey) {
  const x = CONFIG.ballasts[ballastKey].drawX;
  c.strokeStyle = C.ink; c.lineWidth = 4;
  c.beginPath(); c.moveTo(x, 38); c.lineTo(x, 56); c.stroke();
  circle(c, x, 70, 18); fillStroke(c, C.stone);
}

// 비거 전체: 원점이 몸통 중앙
function drawBigeo(c, pick, x, y, scale, pitchDeg, flap) {
  c.save();
  c.translate(x, y);
  c.rotate(-(pitchDeg || 0) * Math.PI / 180);
  c.scale(scale, scale);
  drawStone(c, pick.ballast);
  drawWingShape(c, pick.wing, flap);
  drawAyo(c, 26, -38, 33);
  drawHull(c, pick.body);
  c.restore();
}

// ----- 배경 그림 (한 번만 그려 두고 복사) -----
function paperCloud(c, x, y, s) {
  c.fillStyle = C.cloud;
  for (const [dx, dy, r] of [[-60, 8, 34], [-18, -12, 48], [34, -4, 40], [74, 12, 26]]) {
    circle(c, x + dx * s, y + dy * s, r * s); c.fill();
  }
  c.fillRect(x - 60 * s, y + 8 * s, 134 * s, 30 * s);
}

function renderLandscape(c, withRuler) {
  const w = CONFIG.world, f = CONFIG.flight;
  const bottom = withRuler ? RULER_Y : H;
  c.fillStyle = C.sky; c.fillRect(0, 0, W, H);
  paperCloud(c, 620, 130, 1.1);
  paperCloud(c, 1120, 230, 0.8);
  paperCloud(c, 1640, 110, 1);

  // 뒤쪽 먼 산
  c.fillStyle = C.hillBack;
  c.beginPath(); c.moveTo(px(w.riverEnd) - 40, GROUND_Y);
  c.quadraticCurveTo(px(62), GROUND_Y - 300, px(92), GROUND_Y - 170);
  c.quadraticCurveTo(px(112), GROUND_Y - 280, W, GROUND_Y - 150);
  c.lineTo(W, GROUND_Y); c.closePath(); c.fill();

  // 진주성 성벽과 누각
  const wallL = px(70), wallR = W;
  c.fillStyle = C.wall; c.fillRect(wallL, GROUND_Y - 62, wallR - wallL, 62);
  c.fillStyle = C.wallDark;
  for (let x = wallL; x < wallR; x += 44) c.fillRect(x, GROUND_Y - 78, 26, 18);
  const gx = px(100);
  c.fillStyle = '#b5543f'; c.fillRect(gx - 74, GROUND_Y - 150, 12, 90); c.fillRect(gx + 62, GROUND_Y - 150, 12, 90); c.fillRect(gx - 6, GROUND_Y - 150, 12, 90);
  c.fillStyle = C.roof;
  c.beginPath(); c.moveTo(gx - 120, GROUND_Y - 138); c.quadraticCurveTo(gx - 60, GROUND_Y - 158, gx - 50, GROUND_Y - 205);
  c.lineTo(gx + 50, GROUND_Y - 205); c.quadraticCurveTo(gx + 60, GROUND_Y - 158, gx + 120, GROUND_Y - 138); c.closePath(); c.fill();

  // 남강
  c.fillStyle = C.river; c.fillRect(0, GROUND_Y, W, bottom - GROUND_Y);
  c.strokeStyle = C.riverLine; c.lineWidth = 5; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const yy = GROUND_Y + 36 + i * 36;
    for (let x = px(w.riverStart) + 20 + i * 40; x < px(w.riverEnd) - 40; x += 120) {
      c.beginPath(); c.moveTo(x, yy); c.quadraticCurveTo(x + 22, yy - 10, x + 44, yy); c.stroke();
    }
  }
  c.lineCap = 'butt';

  // 건너편 모래밭
  c.fillStyle = C.sand;
  c.beginPath(); c.moveTo(px(w.riverEnd) - 26, bottom);
  c.quadraticCurveTo(px(w.riverEnd) - 18, GROUND_Y + 8, px(w.riverEnd) + 16, GROUND_Y - 4);
  c.lineTo(W, GROUND_Y - 4); c.lineTo(W, bottom); c.closePath(); c.fill();
  c.fillStyle = C.sandDark;
  for (let x = px(w.riverEnd) + 60; x < W; x += 170) { circle(c, x, GROUND_Y + 50, 7); c.fill(); circle(c, x + 80, GROUND_Y + 92, 5); c.fill(); }

  // 망진산
  const topY = py(f.launchHeight - f.groundClearance);
  const foot = px(w.riverStart) - 8;
  c.fillStyle = C.hillDark;
  c.beginPath(); c.moveTo(0, bottom); c.lineTo(0, topY + 90);
  c.lineTo(px(-10), topY + 90); c.bezierCurveTo(px(2), topY + 90, foot - 60, GROUND_Y - 60, foot + 24, bottom); c.closePath(); c.fill();
  c.fillStyle = C.hill;
  c.beginPath(); c.moveTo(0, bottom); c.lineTo(0, topY + 22);
  c.quadraticCurveTo(px(-14), topY - 6, px(1), topY);
  c.bezierCurveTo(px(7), topY + 80, foot - 70, GROUND_Y - 100, foot - 6, bottom); c.closePath(); c.fill();
  // 발사대
  c.fillStyle = C.wood; c.strokeStyle = C.ink; c.lineWidth = 4;
  c.beginPath(); c.moveTo(px(-13), topY + 2); c.lineTo(px(2), topY - 10); c.lineTo(px(2), topY + 4); c.lineTo(px(-13), topY + 16); c.closePath(); c.fill(); c.stroke();

  if (withRuler) {
    c.fillStyle = C.ink;
    c.font = '800 52px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(TEXT.hill, 24, topY + 130);
    c.fillText(TEXT.castle, gx - 78, GROUND_Y - 30);
    c.fillStyle = '#1f5f5a'; // 강 이름은 추락 장면과 겹치지 않게 모래밭 쪽에
    c.fillText('← ' + TEXT.river, px(w.riverEnd) + 24, GROUND_Y + 66);
    renderRuler(c);
  }
}

function renderRuler(c) {
  const w = CONFIG.world;
  c.fillStyle = C.paper; c.fillRect(0, RULER_Y, W, H - RULER_Y);
  c.strokeStyle = C.ink; c.lineWidth = 4;
  c.beginPath(); c.moveTo(0, RULER_Y); c.lineTo(W, RULER_Y); c.stroke();
  c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 50px system-ui, sans-serif';
  for (let m = 0; m <= w.rulerMax; m += w.rulerStep) {
    const x = px(m);
    if (x > W - 10) break;
    c.fillRect(x - 2, RULER_Y, 4, 26);
    c.fillText(String(m), Math.min(x, W - 46), RULER_Y + 66);
  }
  c.font = '700 46px system-ui, sans-serif';
  c.textAlign = 'left';
  c.fillText(TEXT.rulerUnit, 22, RULER_Y + 66);
}

function setBg(kind) {
  if (bgKind === kind) return;
  bgKind = kind;
  resetTransform(bgCtx);
  if (kind === 'title') renderLandscape(bgCtx, false);
  else if (kind === 'flight') renderLandscape(bgCtx, true);
  else if (kind === 'build') {
    bgCtx.fillStyle = C.sky; bgCtx.fillRect(0, 0, W, H);
    paperCloud(bgCtx, 170, 120, 0.8);
    paperCloud(bgCtx, 640, 210, 0.7);
    bgCtx.fillStyle = C.hill;
    bgCtx.beginPath(); bgCtx.moveTo(0, 590); bgCtx.quadraticCurveTo(300, 500, 860, 570); bgCtx.lineTo(860, H); bgCtx.lineTo(0, H); bgCtx.closePath(); bgCtx.fill();
  } else { // paper: 결과·퀴즈
    bgCtx.fillStyle = '#f6efdd'; bgCtx.fillRect(0, 0, W, H);
  }
}

// ----- DOM 도구 -----
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(className, text, onTap) {
  const b = el('button', 'btn abs ' + className, text);
  b.type = 'button';
  b.addEventListener('click', onTap);
  return b;
}

// =============================================================
// 3. 화면별 함수
// =============================================================
const screens = {};

function go(name, arg) {
  game.screen = name;
  ui.replaceChildren();
  screens[name].enter(arg);
  game.dirty = true;
}

// 새 손님을 위해 판 기록과 선택을 비운다
function newSession() {
  game.history = [];
  game.pick = { ...CONFIG.defaults };
  game.isRetry = false;
}

// ----- title -----
screens.title = {
  enter() {
    setBg('title');
    ui.append(el('h1', 'sheet abs title-sign', TEXT.title));

    const panel = el('div', 'sheet abs top-panel');
    panel.append(el('h2', '', TEXT.topTitle));
    const top = loadTop();
    if (top.length === 0) panel.append(el('p', 'empty', TEXT.topEmpty));
    else {
      const ol = el('ol');
      top.forEach((r, i) => {
        const li = el('li');
        li.append(el('span', 'rank', `${i + 1}위`), el('span', '', `${r.distance}m`));
        ol.append(li);
      });
      panel.append(ol);
    }
    ui.append(panel);

    const hello = el('div', 'bubble title-bubble', game.goodbye ? TEXT.titleBye : TEXT.titleHello);
    ui.append(hello);
    ui.append(button('primary big start-btn', TEXT.start, () => {
      game.goodbye = false;
      go('story');
    }));
  },
  draw(now) {
    drawBg();
    const bob = Math.sin(now / 600) * 10;
    drawBigeo(ctx, game.pick, 1180, 520 + bob, 1, 4, Math.sin(now / 250) * 0.5 + 0.5);
    drawHamo(ctx, 'title', 240, 640, 400, 470);
  },
  animated: true,
};

// ----- story -----
screens.story = {
  enter() {
    setBg('title');
    // STORY.history를 넣으면 말풍선 아래에 나온다
    ui.append(el('div', 'bubble story-bubble' + (STORY.history ? '' : ' solo'), STORY.speech));
    if (STORY.history) ui.append(el('p', 'abs story-note', STORY.history));
    ui.append(button('primary big story-btn', TEXT.storyNext, () => go('build')));
  },
  draw() {
    drawBg();
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
    roundBox(ctx, 120, 100, 1680, 680, 56); ctx.fill(); ctx.stroke();
    drawHamo(ctx, 'story', 340, 430, 400, 480);
  },
};

// ----- build -----
function drawWingCard(c, key) { c.translate(150, 150); c.scale(0.72, 0.72); drawWingShape(c, key, 0); }
function drawBodyCard(c, key) { c.translate(170, 80); c.scale(0.78, 0.78); drawHull(c, key); }
function drawBallastCard(c, key) {
  c.translate(170, 40); c.scale(0.78, 0.78);
  drawStone(c, key);
  drawHull(c, 'wood');
}

function partGroup(label, slot, table, drawFn) {
  const group = el('section', 'part-group');
  group.append(el('h2', '', label));
  const row = el('div', 'part-row');
  for (const key of Object.keys(table)) {
    const card = el('button', 'card');
    card.type = 'button';
    card.dataset.slot = slot; card.dataset.key = key;
    const pic = el('canvas');
    pic.width = 320; pic.height = 160;
    drawFn(pic.getContext('2d'), key);
    card.append(pic);
    const part = table[key];
    card.append(el('span', 'name', part.name));
    if (part.tag) card.append(el('span', 'tag', `(${part.tag})`));
    card.setAttribute('aria-pressed', String(game.pick[slot] === key));
    card.addEventListener('click', () => {
      game.pick[slot] = key;
      row.querySelectorAll('.card').forEach(b => b.setAttribute('aria-pressed', String(b === card)));
      game.dirty = true;
    });
    row.append(card);
  }
  group.append(row);
  return group;
}

screens.build = {
  enter() {
    setBg('build');
    const panel = el('div', 'build-panel');
    panel.append(
      partGroup(TEXT.wingLabel, 'wing', CONFIG.wings, drawWingCard),
      partGroup(TEXT.bodyLabel, 'body', CONFIG.bodies, drawBodyCard),
      partGroup(TEXT.ballastLabel, 'ballast', CONFIG.ballasts, drawBallastCard),
    );
    ui.append(panel);
    ui.append(el('div', 'bubble build-bubble', game.isRetry ? TEXT.buildRetry : TEXT.buildHello));
    ui.append(button('primary big fly-btn', TEXT.fly, () => go('flight')));
  },
  draw() {
    drawBg();
    drawBigeo(ctx, game.pick, 420, 330, 1.6, 0, 0);
    drawHamo(ctx, game.isRetry ? 'retry' : 'build', 130, 720, 220, 230);
  },
};

// ----- flight -----
const READY_MS = 900, LAND_MS = 1700;

screens.flight = {
  enter() {
    setBg('flight');
    const p = game.pick;
    game.flight = simulateFlight(p.wing, p.body, p.ballast);
    game.flightStart = performance.now();
    game.flightNow = game.flightStart;
    game.flightCursor = 0;
  },
  animated: true,
  // 재생 시간(ms)에 맞는 궤적 위치를 보간해서 구한다
  sampleAt(simT) {
    const s = game.flight.samples;
    let i = game.flightCursor;
    if (s[i].t > simT) i = 0;
    while (i < s.length - 2 && s[i + 1].t <= simT) i++;
    game.flightCursor = i;
    const a = s[i], b = s[Math.min(i + 1, s.length - 1)];
    const k = b.t > a.t ? clamp((simT - a.t) / (b.t - a.t), 0, 1) : 0;
    return { i, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, pitch: a.pitch + (b.pitch - a.pitch) * k };
  },
  drawTrail(pos) {
    const s = game.flight.samples;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.setLineDash([16, 16]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px(s[0].x), py(s[0].y));
    for (let j = 1; j <= pos.i; j += 2) ctx.lineTo(px(s[j].x), py(s[j].y));
    ctx.lineTo(px(pos.x), py(pos.y));
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  },
  drawReadout(meters) {
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
    roundBox(ctx, 1560, 30, 330, 110, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillText(`${Math.round(meters)} m`, 1725, 88);
  },
  drawFlag(x) {
    const fx = px(x);
    ctx.fillStyle = C.orange; ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(fx, RULER_Y + 2); ctx.lineTo(fx - 22, RULER_Y - 32); ctx.lineTo(fx + 22, RULER_Y - 32); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  draw(now) {
    const fl = game.flight;
    drawBg();
    const elapsed = now - game.flightStart;
    const playMs = fl.playSeconds * 1000;
    const flyMs = elapsed - READY_MS;

    if (flyMs < 0) {                 // 출발 준비
      const first = fl.samples[0];
      drawBigeo(ctx, game.pick, px(first.x), py(first.y), 0.62, 8, 0);
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 110px system-ui, sans-serif';
      ctx.fillText(TEXT.go, 960, 280);
      this.drawReadout(0);
      return;
    }
    if (flyMs < playMs) {            // 비행 중
      const simT = fl.simSeconds * (flyMs / playMs);
      const pos = this.sampleAt(simT);
      this.drawTrail(pos);
      drawBigeo(ctx, game.pick, px(pos.x), py(pos.y), 0.62, pos.pitch, Math.sin(now / 90) * 0.5 + 0.5);
      this.drawReadout(pos.x);
      return;
    }
    // 착지·추락
    const last = fl.samples[fl.samples.length - 1];
    const pos = { i: fl.samples.length - 1, x: last.x, y: last.y };
    this.drawTrail(pos);
    const landAge = flyMs - playMs;
    if (fl.inRiver) this.drawSplash(last, landAge);
    else this.drawLanded(last, landAge);
    this.drawFlag(last.x);
    this.drawReadout(fl.distance);

    if (landAge > LAND_MS) {
      go('result');
    }
  },
  drawSplash(last, age) {
    const cx = px(last.x);
    const sink = Math.min(1, age / 300);
    const tilt = 10 + Math.sin(age / 300) * 3; // 물 위에서 흔들리는 각도
    drawBigeo(ctx, game.pick, cx, GROUND_Y - 20 + sink * 34, 0.62, last.pitch + (tilt - last.pitch) * sink, 0);
    // 강 아래쪽을 다시 덮어서 잠긴 것처럼 보이게 한다
    const k = game.canvasK, top = GROUND_Y + 34;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, top * k, W * k, (RULER_Y - top) * k, 0, top * k, W * k, (RULER_Y - top) * k);
    resetTransform(ctx);
    // 물방울
    if (age < 700) {
      const a = age / 700;
      ctx.fillStyle = C.cloud;
      for (const [dx, h, r] of [[-70, 110, 16], [-34, 170, 20], [6, 200, 22], [46, 160, 18], [84, 100, 14]]) {
        circle(ctx, cx + dx * (0.6 + a), GROUND_Y - h * Math.sin(a * Math.PI), r * (1 - a * 0.5));
        ctx.fill();
      }
    }
    // 강 위에 떠 있는 하모
    if (age > 350) {
      const pop = Math.min(1, (age - 350) / 250);
      const w = CONFIG.world, mid = (px(w.riverStart) + px(w.riverEnd)) / 2;
      const hx = cx < mid + 60 ? cx + 150 : cx - 150; // 비거 옆, 강 위쪽에
      drawHamo(ctx, 'river', hx, GROUND_Y + 56 + Math.sin(age / 300) * 5, 200 * pop, 170 * pop);
    }
  },
  drawLanded(last, age) {
    const settle = Math.min(1, age / 250);
    drawBigeo(ctx, game.pick, px(last.x), py(last.y), 0.62, last.pitch * (1 - settle), 0);
    if (age < 500) {
      ctx.fillStyle = C.sandDark;
      const a = age / 500;
      for (const [dx, r] of [[-110, 18], [-70, 24], [70, 24], [110, 18]]) {
        circle(ctx, px(last.x) + dx * (0.7 + a * 0.6), GROUND_Y + 2 - a * 18, r * (1 - a * 0.5));
        ctx.fill();
      }
    }
  },
};

// ----- result -----
function buildChart() {
  const chart = el('div', 'sheet abs chart');
  chart.append(el('h2', '', TEXT.chartTitle));
  const grid = el('div', 'chart-grid');
  const runs = game.history;
  const slots = CONFIG.historyMax;
  const nowIdx = runs.length - 1;

  grid.append(el('div', 'bar-axis'));
  for (let i = 0; i < slots; i++) {
    const cell = el('div', 'bar-cell' + (i === nowIdx ? ' now' : ''));
    const run = runs[i];
    if (run) {
      cell.append(el('span', 'bar-value', String(run.distance)));
      const bar = el('div', 'bar');
      bar.style.height = (Math.min(1, run.distance / CONFIG.world.rulerMax) * 10.2) + 'rem';
      cell.append(bar);
    }
    grid.append(cell);
  }
  const rows = [
    [TEXT.wingLabel, r => CONFIG.wings[r.wing].short],
    [TEXT.bodyLabel, r => CONFIG.bodies[r.body].short],
    ['무게추', r => CONFIG.ballasts[r.ballast].short],
  ];
  for (const [label, get] of rows) {
    grid.append(el('div', 'row-head', label));
    for (let i = 0; i < slots; i++) {
      const run = runs[i];
      grid.append(el('div', 'row-val' + (i === nowIdx ? ' now' : ''), run ? get(run) : ''));
    }
  }
  chart.append(grid);
  return chart;
}

screens.result = {
  enter() {
    setBg('paper');
    const fl = game.flight;
    game.history.push({ distance: fl.distance, wing: fl.wing, body: fl.body, ballast: fl.ballast });
    if (game.history.length > CONFIG.historyMax) game.history.shift();
    saveTop(fl);

    ui.append(el('div', 'abs grade ' + fl.grade, GRADE_TEXT[fl.grade]));
    const dist = el('div', 'abs distance', String(fl.distance));
    dist.append(el('small', '', 'm'));
    ui.append(dist);
    ui.append(el('div', 'bubble result-bubble', FEEDBACK[fl.feedback]));
    ui.append(buildChart());
    ui.append(button('primary result-retry', TEXT.retry, () => { game.isRetry = true; go('build'); }));
    ui.append(button('result-quiz', TEXT.toQuiz, () => go('quiz')));
  },
  draw() {
    drawBg();
    drawHamo(ctx, game.flight.grade, 150, 640, 230, 300);
  },
};

// ----- quiz -----
screens.quiz = {
  enter() {
    setBg('paper');
    game.quizHamo = 'quiz';
    // 바로 앞 문제와 겹치지 않게 고른다
    let idx = Math.floor(Math.random() * QUIZ.length);
    if (QUIZ.length > 1 && idx === game.lastQuiz) idx = (idx + 1) % QUIZ.length;
    game.lastQuiz = idx;
    const q = QUIZ[idx];

    ui.append(el('div', 'sheet abs quiz-q', q.question));
    const order = q.choices.slice();
    if (Math.random() < 0.5) order.reverse();

    const buttons = order.map((choice, i) => {
      const b = button(i === 0 ? 'quiz-a' : 'quiz-b', choice.text, () => {
        if (game.quizDone) return;
        game.quizDone = true;
        buttons.forEach((other, j) => {
          if (order[j].correct) other.classList.add('is-right');
          else if (other === b) other.classList.add('is-wrong');
          else other.classList.add('is-off');
          if (order[j].correct) other.textContent = '○ ' + order[j].text;
          else if (other === b) other.textContent = '✕ ' + order[j].text;
        });
        game.quizHamo = choice.correct ? 'quizRight' : 'quizWrong';
        game.dirty = true;
        ui.append(el('div', 'bubble quiz-bubble', choice.correct ? q.right : q.wrong));
        ui.append(button('quiz-home', TEXT.home, () => {
          newSession();
          game.goodbye = true;
          go('title');
        }));
        ui.append(button('primary quiz-again', TEXT.flyAgain, () => { game.isRetry = true; go('build'); }));
      });
      return b;
    });
    game.quizDone = false;
    ui.append(...buttons);
  },
  draw() {
    drawBg();
    if (game.quizHamo === 'quiz') drawHamo(ctx, 'quiz', 350, 400, 620, 560);
    else drawHamo(ctx, game.quizHamo, 350, 390, 460, 560);
  },
};

// =============================================================
// 4. 게임 루프와 자동 리셋
// =============================================================
function frame(now) {
  const scr = screens[game.screen];
  // 60초 동안 입력이 없으면 타이틀로
  if (now - game.lastInput > CONFIG.idleResetSeconds * 1000) {
    game.lastInput = now;
    if (game.screen !== 'title' || game.history.length) {
      newSession();
      game.goodbye = false;
      go('title');
    }
  }
  if (scr.animated || game.dirty) {
    game.dirty = false;
    resetTransform(ctx);
    screens[game.screen].draw(now);
  }
  requestAnimationFrame(frame);
}

async function boot() {
  canvas = document.getElementById('scene');
  ctx = canvas.getContext('2d', { alpha: false });
  ui = document.getElementById('ui');
  bg = document.createElement('canvas');
  bgCtx = bg.getContext('2d', { alpha: false });
  layout();
  window.addEventListener('resize', () => { layout(); });
  window.addEventListener('orientationchange', () => { layout(); });

  const touched = () => { game.lastInput = performance.now(); };
  for (const type of ['pointerdown', 'pointermove', 'touchstart']) {
    window.addEventListener(type, touched, { passive: true });
  }
  window.addEventListener('contextmenu', e => e.preventDefault());

  game.lastInput = performance.now();
  await preload();
  go('title');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') boot();
