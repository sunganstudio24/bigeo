// 아요의 비거 날리기 — 게임 코드
// 문구와 수치는 data.js에서 고칩니다.
'use strict';

// =============================================================
// 1. 비행 계산 (화면과 무관, 같은 조합은 항상 같은 결과)
// =============================================================
const SIM_STEP = 1 / 60;
const SAMPLE_EVERY = 4; // 궤적 저장 간격(스텝)

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// =============================================================
// 1-0. 칸 조립과 비행 계산 (화면과 무관, 같은 조립·같은 조작이면 항상 같은 결과)
// 물리 엔진 없이 조립 결과를 한 덩어리로 합산해서 날린다.
// =============================================================
const DEG = Math.PI / 180;
const PART_BY_CODE = {};
for (const k of Object.keys(PARTS)) PART_BY_CODE[PARTS[k].code] = k;

function emptyGrid() { return Array.from({ length: GRID.rows }, () => Array(GRID.cols).fill(null)); }
// ['..W..', 'FCWW.', '..K..'] 같은 글자 줄로 조립을 만든다(. = 빈칸)
function gridFromRows(rows) {
  const g = emptyGrid();
  rows.forEach((line, r) => [...line].forEach((ch, c) => {
    if (r < GRID.rows && c < GRID.cols) g[r][c] = PART_BY_CODE[ch] || null;
  }));
  return g;
}
function gridToRows(g) { return g.map(row => row.map(k => (k ? PARTS[k].code : '.')).join('')); }
function copyGrid(g) { return g.map(row => row.slice()); }
const cellX = c => c - (GRID.cols - 1) / 2; // 앞(오른쪽)이 +
const cellY = r => (GRID.rows - 1) / 2 - r; // 위가 +

// 조립을 합산한다. 떨어진 부품(조종석과 이어지지 않은 것)은 계산에서 뺀다
function analyzeCraft(grid) {
  const F = CRAFT_FLIGHT, cells = [];
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (grid[r][c]) cells.push({ r, c, key: grid[r][c] });
  const cockpits = cells.filter(x => x.key === 'cockpit');
  const linked = new Set();
  if (cockpits.length) {
    const todo = [cockpits[0]];
    linked.add(cockpits[0].r * 10 + cockpits[0].c);
    while (todo.length) {
      const { r, c } = todo.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc, id = nr * 10 + nc;
        if (nr < 0 || nc < 0 || nr >= GRID.rows || nc >= GRID.cols || !grid[nr][nc] || linked.has(id)) continue;
        linked.add(id);
        todo.push({ r: nr, c: nc });
      }
    }
  }
  const detached = cells.filter(x => !linked.has(x.r * 10 + x.c));
  const s = { mass: 0, lift: 0, up: 0, drag: 0, thrust: 0, gauge: 0, rotor: 0, taps: 0, roll: 0, steady: 0 };
  let mx = 0, my = 0, lx = 0, ly = 0;
  const counts = {};
  for (const x of cells) {
    if (!linked.has(x.r * 10 + x.c)) continue;
    const P = PARTS[x.key], X = cellX(x.c), Y = cellY(x.r);
    counts[x.key] = (counts[x.key] || 0) + 1;
    s.mass += P.weight; mx += P.weight * X; my += P.weight * Y;
    // 양력 중심: 날개와 회전날개가 드는 자리의 평균
    const up = (P.lift || 0) * F.wingLift + (P.rotor || 0) * F.rotorLift;
    if (P.lift) s.lift += P.lift;
    if (up) { s.up += up; lx += up * X; ly += up * Y; }
    for (const k of ['drag', 'thrust', 'gauge', 'rotor', 'taps', 'roll', 'steady']) s[k] += P[k] || 0;
  }
  const xcg = s.mass ? mx / s.mass : 0, ycg = s.mass ? my / s.mass : 0;
  const xcl = s.up ? lx / s.up : xcg, ycl = s.up ? ly / s.up : ycg;
  const liftForce = wingForce(s.lift), rotorForce = s.rotor * F.rotorLift, pushForce = s.thrust * F.thrust;
  // 나는 방식: 가장 큰 힘으로 정한다
  let style = 'none';
  const best = Math.max(liftForce, rotorForce, pushForce * 1.6);
  if (best > 0) style = best === liftForce ? 'glide' : best === rotorForce ? 'rotor' : 'bellows';
  return {
    ...s, counts, cells, detached, cockpits: cockpits.length,
    partCount: cells.length - cockpits.length,
    valid: cockpits.length === 1 && detached.length === 0,
    xcg, ycg, xcl, ycl,
    offset: s.up ? xcg - xcl : 0, // + 앞이 무거움, - 뒤가 무거움
    liftForce, rotorForce, pushForce: pushForce + s.roll * F.wheelBoost * 6,
    style,
  };
}

// 망진산 언덕의 땅 높이(m). 출발점(0m)에서 남강 시작까지 내려간다
function terrainAt(x) {
  const F = CRAFT_FLIGHT, top = F.launchHeight - F.groundClearance, foot = CONFIG.world.riverStart;
  if (x <= 1) return top;
  if (x >= foot) return 0;
  const k = (x - 1) / (foot - 1);
  return top * (1 - k * k * (3 - 2 * k));
}

// 날개 n장이 버티는 무게: 많이 달수록 조금씩 덜 늘어남
function wingForce(n) { return n > 0 ? CRAFT_FLIGHT.wingLift * Math.pow(n, CRAFT_FLIGHT.wingStack) : 0; }

function wrapDeg(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }

function liftCoef(alpha) {
  const F = CRAFT_FLIGHT, a = Math.abs(alpha), sign = alpha < 0 ? -1 : 1;
  if (a <= F.stallAlpha) return Math.max(F.clMin, F.cl0 + F.clSlope * alpha);
  // 고개를 너무 들거나 숙이면 날개 힘이 빠진다
  if (sign > 0) return Math.max(F.clStall, F.cl0 + F.clSlope * F.stallAlpha - (a - F.stallAlpha) * F.stallDrop);
  return F.clMin;
}

function launchSpeedOf(info, power) {
  const F = CRAFT_FLIGHT;
  const massK = clamp(Math.pow(F.launchMassRef / Math.max(0.1, info.mass), F.launchMassPow), F.launchMassMin, F.launchMassMax);
  return F.launchSpeed * power * massK * (1 + F.wheelBoost * Math.min(info.roll, F.wheelMax));
}

// 비행 시작. angle(도)·power(0~1)는 당겨서 쏘기 결과
function startFlight(info, angle, power) {
  const F = CRAFT_FLIGHT, v = launchSpeedOf(info, power);
  const st = {
    info, angle, power, x: 0, y: F.launchHeight, vx: v * Math.cos(angle * DEG), vy: v * Math.sin(angle * DEG),
    theta: angle, omega: 0, t: 0, step: 0, gauge: info.gauge, tapsLeft: info.taps, spin: 0,
    tapsUsed: 0, blowTime: 0, blowing: false, tumbling: false, done: false, crashed: false, endedBy: '',
    maxY: F.launchHeight, maxSpeed: v, wobble: 0, wobbleN: 0, minTheta: angle,
  };
  st.samples = [{ t: 0, x: st.x, y: st.y, theta: st.theta, spin: 0, blow: false }];
  return st;
}

// 화면을 두드림: 회전날개를 돌린다. 돌렸으면 true
function tapRotor(st) {
  if (st.done || st.info.rotor <= 0 || st.tapsLeft <= 0) return false;
  st.tapsLeft--;
  st.tapsUsed++;
  st.spin = Math.min(1, st.spin + CRAFT_FLIGHT.rotorTapAdd);
  return true;
}

// 한 걸음 계산. blowing = 풀무 버튼을 누르고 있음
function stepFlight(st, blowing, dt) {
  if (st.done) return;
  const F = CRAFT_FLIGHT, I = st.info;
  const v2 = st.vx * st.vx + st.vy * st.vy, v = Math.sqrt(v2);
  const gamma = Math.atan2(st.vy, st.vx) / DEG;
  const alpha = wrapDeg(st.theta - gamma);
  const q = Math.min(v2 / (F.vFull * F.vFull), F.qMax);
  let ax = 0, ay = -F.g;
  // 날개: 진행 방향에 수직으로 들어 올림
  const cl = !st.tumbling && I.lift > 0 ? liftCoef(alpha) : 0;
  // 날개 힘은 속도에 비례하되 너무 빨라도 몸무게의 liftCap배까지만(크게 솟구치지 않게)
  const liftAcc = Math.min(F.g * (wingForce(I.lift) / I.mass) * cl * Math.min(v / F.vFull, F.qMax), F.g * F.liftCap);
  const aClamp = clamp(alpha, -30, 30) / 10;
  const dragArea = I.drag + F.alphaDrag * I.lift * aClamp * aClamp + F.rotorDrag * I.rotor * st.spin + (st.tumbling ? 0.6 : 0);
  const dragAcc = F.dragK * dragArea * v2 / I.mass;
  if (v > 0.01) {
    const ux = st.vx / v, uy = st.vy / v;
    ax += -dragAcc * ux - liftAcc * uy;
    ay += -dragAcc * uy + liftAcc * ux;
  }
  // 풀무: 누르는 동안 바라보는 방향으로 민다
  st.blowing = !!blowing && st.gauge > 0 && I.thrust > 0;
  if (st.blowing) {
    // 날개가 없으면 바람이 헛돌아 절반만 민다
    const T = F.g * I.thrust * F.thrust / I.mass * (0.5 + 0.5 * Math.min(1, I.liftForce / I.mass));
    ax += T * Math.cos(st.theta * DEG);
    ay += T * Math.sin(st.theta * DEG);
    st.gauge = Math.max(0, st.gauge - dt);
    st.blowTime += dt;
  }
  // 회전날개: 돌수록 위로, 떨어질 때는 낙하산처럼 받쳐 줌
  if (I.rotor > 0) {
    ay += F.g * (I.rotor * F.rotorLift / I.mass) * st.spin;
    if (st.vy < 0) ay += F.rotorAuto * I.rotor * st.vy * st.vy / I.mass;
    st.spin *= Math.exp(-F.rotorDecay * dt);
    if (st.spin < 0.01) st.spin = 0;
  }
  // 기울기: 무게중심이 양력 중심보다 앞이면 고개를 숙이고, 뒤면 고개를 든다
  if (st.tumbling) {
    st.omega = (st.omega < 0 ? -1 : 1) * F.tumbleSpin;
  } else {
    const vane = F.vaneK * (1 + F.tailVane * I.steady) * Math.max(F.vaneMin, q);
    const rotorAcc = I.rotor * F.rotorLift * st.spin / I.mass;
    // 회전날개 비중이 클수록 매달린 것처럼 수평을 유지(떠 있을 때 고개가 처박히지 않게)
    const hang = I.rotor > 0 ? F.rotorLevel * I.rotorForce / (I.rotorForce + I.liftForce) : 0;
    // 바람결: 늘 조금씩 흔드는 힘. 연 꼬리가 있으면 덜 흔들린다
    const gust = F.gust * (Math.sin(st.t * 2.3) + 0.6 * Math.sin(st.t * 5.1 + 1)) / (1 + F.tailGust * I.steady);
    const torque = -F.balanceK * I.offset * Math.min(1.5, liftAcc / F.g + rotorAcc)
      + vane * wrapDeg(gamma - st.theta) - hang * st.theta + gust
      - (F.dampBase + F.tailDamp * I.steady) * st.omega;
    st.omega += torque * dt;
    if (I.lift > 0 && Math.abs(alpha) > F.tumbleAlpha && v > F.tumbleSpeed && I.rotor === 0) {
      st.tumbling = true;
      st.omega = (alpha > 0 ? 1 : -1) * F.tumbleSpin;
    }
  }
  st.theta = wrapDeg(st.theta + st.omega * dt);
  st.vx += ax * dt; st.vy += ay * dt;
  st.x += st.vx * dt; st.y += st.vy * dt;
  st.t += dt; st.step++;
  if (st.y > F.ceiling) { st.y = F.ceiling; st.vy = Math.min(st.vy, 0); }
  if (st.x < -12) { st.x = -12; st.vx = Math.max(0, st.vx); }
  st.maxY = Math.max(st.maxY, st.y);
  st.maxSpeed = Math.max(st.maxSpeed, v);
  st.minTheta = Math.min(st.minTheta, st.theta);
  // 흔들림: 출발 직후 고개를 맞추는 동안은 빼고, 고개가 위아래로 오락가락한 정도
  if (st.t > 1.5 && st.t < 9) { st.wobble += Math.abs(st.omega); st.wobbleN++; }

  const ground = terrainAt(st.x) + F.groundClearance;
  if (![st.x, st.y, st.vx, st.vy, st.theta].every(Number.isFinite)) { st.done = true; st.endedBy = 'error'; st.crashed = true; }
  else if (st.y <= ground && st.t > 0.15) {
    st.y = ground; st.done = true; st.endedBy = 'ground';
    st.crashed = st.tumbling || st.vy < -F.crashVy || (st.theta < -F.crashPitch && st.vy < -F.crashVy * 0.5);
  } else if (st.x >= F.worldEnd) { st.x = F.worldEnd; st.done = true; st.endedBy = 'edge'; }
  else if (st.t >= F.maxSeconds) { st.done = true; st.endedBy = 'timeout'; }
  if (st.done || st.step % SAMPLE_EVERY === 0) st.samples.push({ t: st.t, x: st.x, y: st.y, theta: st.theta, spin: st.spin, blow: st.blowing });
}

// 비행 결과 정리
function flightSummary(st, allowed) {
  const w = CONFIG.world, distance = Math.max(0, Math.round(st.x));
  const wobble = st.wobbleN ? st.wobble / st.wobbleN : 0;
  const s = {
    distance, crashed: st.crashed, endedBy: st.endedBy, maxHeight: Math.round(st.maxY),
    simSeconds: st.t, maxSpeed: st.maxSpeed, wobble, tapsUsed: st.tapsUsed, blowTime: st.blowTime,
    inRiver: st.x >= w.riverStart && st.x < w.riverEnd, angle: Math.round(st.angle), samples: st.samples,
    style: st.info.style,
  };
  s.grade = gradeOf(distance, st.crashed);
  s.feedback = craftFeedbackKey(st.info, s, allowed);
  return s;
}

// 결과 화면 하모 설명: 위에서 먼저 맞는 것 하나
// allowed: 이번에 쓸 수 있는 부품 목록(없으면 전부). 못 쓰는 부품을 권하지 않는다
function craftFeedbackKey(info, s, allowed) {
  const F = CRAFT_FLIGHT;
  if (info.lift === 0 && info.rotor === 0) return 'noWing';
  if (info.rotor > 0 && s.tapsUsed === 0 && info.liftForce < info.mass) return 'rotorIdle';
  if (info.thrust > 0 && s.blowTime === 0 && info.liftForce < info.mass) return 'bellowsIdle';
  if (info.liftForce * F.qMax * F.cl0 < info.mass && info.rotorForce < info.mass) return info.lift ? 'tooHeavy' : 'noWing';
  if (info.offset < -F.offsetWarn) return 'tailHeavy';
  if (info.offset > F.offsetWarn) return 'noseHeavy';
  if (info.style === 'rotor') return s.tapsUsed > 0 ? 'rotorFly' : 'rotorIdle';
  if (info.style === 'bellows') return s.blowTime > 0 ? (s.distance < CONFIG.grades.goodFrom ? 'bellowsOut' : 'bellowsFly') : 'bellowsIdle';
  if (info.steady === 0 && s.wobble > F.wobbleWarn && (!allowed || allowed.includes('tail'))) return 'wobble';
  return 'glide';
}

// 자동 조작으로 끝까지 날린다(검사용): 풀무는 처음부터 다 쓰고, 회전날개는 tapEvery초마다 두드림
function simulateCraft(grid, opt = {}) {
  const info = analyzeCraft(grid);
  const st = startFlight(info, opt.angle === undefined ? CRAFT_FLIGHT.autoAngle : opt.angle, opt.power === undefined ? 1 : opt.power);
  const tapEvery = opt.tapEvery === undefined ? 0.9 : opt.tapEvery;
  let nextTap = opt.tapFrom === undefined ? 0.3 : opt.tapFrom;
  while (!st.done) {
    if (tapEvery > 0 && st.t >= nextTap) { tapRotor(st); nextTap += tapEvery; }
    const blow = opt.blow === undefined ? st.t > 0.2 : opt.blow(st.t);
    stepFlight(st, blow, SIM_STEP);
  }
  return { info, st, ...flightSummary(st) };
}

// ----- 스테이지 규칙(화면과 무관) -----
function rulesFromStage(stage) {
  return {
    allowed: PART_ORDER.filter(k => stage.parts[k] !== undefined),
    limits: { ...stage.parts }, locked: stage.locked || [], recommend: stage.recommend,
  };
}
// 궤적이 별 상자를 지나갔는지
function boxPassed(box, samples) {
  if (!box) return false;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const k = L ? clamp(((box.x - a.x) * dx + (box.y - a.y) * dy) / L, 0, 1) : 0;
    if (Math.hypot(a.x + dx * k - box.x, a.y + dy * k - box.y) <= box.r) return true;
  }
  return false;
}
// 성공 여부와 별 3개
function stageOutcome(stage, info, s, rules) {
  const g = stage.goal;
  const ok = !s.crashed && (g.type === 'height' ? s.maxHeight >= g.value : s.distance >= g.value);
  const parts = info.partCount - (rules ? rules.locked.length : 0);
  const passed = boxPassed(stage.box, s.samples);
  const stars = stage.stars.map(c => {
    if (c.type === 'goal') return ok;
    if (c.type === 'maxParts') return ok && parts <= c.value;
    if (c.type === 'box') return passed;
    if (c.type === 'distance') return !s.crashed && s.distance >= c.value;
    if (c.type === 'height') return !s.crashed && s.maxHeight >= c.value;
    return false;
  });
  return { ok, stars, passed, parts };
}

// 별 기록: 날짜가 바뀌어도 남는다. { 스테이지 id: [별1, 별2, 별3] }
const STAR_KEY = 'ayo-bigeo-stars';
let memoryStars = {};
function loadStars() {
  try { const v = JSON.parse(localStorage.getItem(STAR_KEY)); if (v && typeof v === 'object') memoryStars = v; } catch (e) { /* 메모리 기록만 사용 */ }
  return memoryStars;
}
// 새로 얻은 별만 true인 목록을 돌려준다
function saveStageStars(id, stars) {
  const all = loadStars(), old = all[id] || [false, false, false];
  const merged = old.map((b, i) => b || !!stars[i]);
  all[id] = merged;
  try { localStorage.setItem(STAR_KEY, JSON.stringify(all)); } catch (e) { /* 무시 */ }
  return { merged, fresh: merged.map((b, i) => b && !old[i]) };
}
function stageUnlocked(id) {
  if (id === 1 || progress.allStages) return true;
  const s = loadStars()[id - 1];
  return !!(s && s[0]);
}

// 스테이지 검사용: 별 3개를 한 번에 얻는 조립 예시(아요 추천과 함께 찾아봄)
const TEST_STAGE_SOLUTIONS = {
  1: [['..W..', '.FC..', '..W..'], ['..W..', '..C..', '..W..'], ['.WW..', '.FC..', '.W...']],
  2: [['..WW.', '.FCW.', '..WW.'], ['..WW.', '..CW.', '...W.'], ['..WW.', '..CW.', '..W..'], ['...W.', '..CWK', '..WW.']],
  3: [['.RRR.', '.FCF.', '.....'], ['.RRR.', '..C..', '.....'], ['RRR..', '.FC..', '.....']],
  4: [['.WW..', 'BFCB.', '.WW..'], ['.B...', 'BBCW.', '..W..'], ['.WWW.', 'BFCB.', '.WW..']],
  5: [['.WWW.', 'TFCF.', '.WWW.'], ['WWWWW', 'TFCBH', 'WWRWW'], ['WWWW.', 'TFCBH', 'WWWW.']],
};

// 스테이지 검사 — 브라우저 콘솔에서 runStageTest() 실행
// '아요 추천'으로 깰 수 있는지, 별 3개를 실제로 얻을 수 있는지 확인한다
function runStageTest() {
  const rows = [], problems = [];
  const flyOpts = [];
  for (let angle = 10; angle <= 60; angle += 5) for (const power of [0.85, 1]) for (const tapEvery of [0.5, 0.9, 1.4]) for (const blow of [true, false]) flyOpts.push({ angle, power, tapEvery, blow: blow ? undefined : () => false });
  for (const stage of STAGES) {
    const R = rulesFromStage(stage);
    const rec = fitGrid(gridFromRows(stage.recommend), R);
    const recInfo = analyzeCraft(rec);
    const want = gridFromRows(stage.recommend);
    for (const l of R.locked) want[l.r][l.c] = l.key;
    if (gridToRows(rec).join('/') !== gridToRows(want).join('/')) problems.push(`${stage.id}: 아요 추천이 부품 개수·종류를 넘음`);
    if (!recInfo.valid) problems.push(`${stage.id}: 아요 추천 조립이 올바르지 않음`);
    const auto = simulateCraft(rec), autoOut = stageOutcome(stage, recInfo, auto, R);
    const pull = simulateCraft(rec, { angle: 30, power: 1 }), pullOut = stageOutcome(stage, recInfo, pull, R);
    if (!autoOut.ok) problems.push(`${stage.id}: 아요 추천 + 자동 발사로 못 깸`);
    if (!pullOut.ok) problems.push(`${stage.id}: 아요 추천 + 30° 당겨 쏘기로 못 깸`);
    const bare = simulateCraft(freshGrid(R));
    if (stageOutcome(stage, analyzeCraft(freshGrid(R)), bare, R).ok) problems.push(`${stage.id}: 조종석만으로도 깸(너무 쉬움)`);
    // 별 3개 찾기
    let three = null;
    const each = [false, false, false];
    const builds = [stage.recommend, ...(TEST_STAGE_SOLUTIONS[stage.id] || [])];
    for (const b of builds) {
      const g = fitGrid(gridFromRows(b), R), info = analyzeCraft(g);
      if (!info.valid) continue;
      for (const o of flyOpts) {
        const out = stageOutcome(stage, info, simulateCraft(g, o), R);
        out.stars.forEach((v, i) => { if (v) each[i] = true; });
        if (out.stars.every(Boolean)) { three = `${gridToRows(g).join('/')} ${o.angle}° ${o.power}`; break; }
      }
      if (three) break;
    }
    if (!three) problems.push(`${stage.id}: 별 3개를 한 번에 얻는 방법을 못 찾음(얻을 수 있는 별: ${each.map(v => (v ? '★' : '☆')).join('')})`);
    const goalVal = stage.goal.type === 'height' ? auto.maxHeight : auto.distance;
    rows.push({
      스테이지: `${stage.id}. ${stage.name}`, 목표: `${stage.goal.value}m ${stage.goal.type === 'height' ? '높이' : '거리'}`,
      '추천·자동': goalVal, '추천 별(자동)': autoOut.stars.map(v => (v ? '★' : '☆')).join(''),
      '추천·30°': stage.goal.type === 'height' ? pull.maxHeight : pull.distance, '별 3개 예': three || '없음',
    });
  }
  console.table(rows);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('스테이지 5개 검사 통과');
  return { rows, problems };
}

// 검사용 대표 조립(오른쪽이 앞). C 조종석 F 대나무 틀 W 한지 날개 K 무게추 R 회전날개 B 풀무 H 수레바퀴 T 연 꼬리
const TEST_CRAFTS = {
  '날개 2장':        ['..W..', '.FC..', '..W..'],
  '날개 3장':        ['.WWW.', '.FCF.', '.....'],
  '날개 4장':        ['.WW..', '.FCF.', '.WW..'],
  '날개 6장+꼬리':   ['.WWW.', 'TFCF.', '.WWW.'],
  '날개 6장':        ['.WWW.', '.FCF.', '.WWW.'],
  '날개 8장+꼬리':   ['WWWW.', 'TFCF.', 'WWWW.'],
  '날개 4장+바퀴':   ['.WWW.', '.FCF.', '.H.H.'],
  '뒤가 무거움':     ['..WW.', 'KFC..', '.....'],
  '앞이 무거움':     ['.WW..', '..CFK', '.....'],
  '무게추로 균형':   ['.WW..', 'KFCFK', '.WW..'],
  '날개 없음':       ['.....', '.FCF.', '.....'],
  '너무 무거움':     ['.W...', 'KKCKK', '.....'],
  '조종석만':        ['.....', '..C..', '.....'],
  '회전날개 2개':    ['.RR..', '.FCW.', '.....'],
  '회전날개 3개':    ['.RRR.', '.FCF.', '.....'],
  '회전날개+날개':   ['.RR..', 'WFCW.', '.WW..'],
  '풀무 2개':        ['..W..', 'BFCB.', '..W..'],
  '풀무 3개':        ['.B...', 'BBCW.', '..W..'],
  '풀무+날개 4장':   ['.WW..', 'BFCB.', '.WW..'],
  '풀무만':          ['.....', 'BBCB.', '.....'],
  '전부 조금씩':     ['.RWW.', 'TFCFB', '.HWW.'],
  '꽉 채움':         ['WWWWW', 'TFCBH', 'WWRWW'],
  '세로로 길게':     ['..W..', '..C..', '..W..'],
};

// 대표 조립 자동 비행 검사 — 브라우저 콘솔에서 runAllCombos() 실행
// NaN, 무한 비행, 화면 밖 이탈, 매번 다른 결과, 나는 방식 구분, 무게중심 원리를 확인한다
function runAllCombos() {
  const F = CRAFT_FLIGHT, rows = [], problems = [], res = {};
  const inBounds = r => r.samples.every(s => Number.isFinite(s.x) && Number.isFinite(s.y) && s.x >= -12 && s.x <= F.worldEnd + 0.01 && s.y >= -0.01 && s.y <= F.ceiling + 0.01);
  const check = (name, r) => {
    if (r.endedBy === 'error') problems.push(`${name}: 계산이 숫자가 아님(NaN)`);
    if (r.endedBy === 'timeout') problems.push(`${name}: ${F.maxSeconds}초가 넘도록 내려오지 않음(무한 비행)`);
    if (!inBounds(r)) problems.push(`${name}: 화면 밖으로 나감`);
  };
  for (const [name, rowsG] of Object.entries(TEST_CRAFTS)) {
    const g = gridFromRows(rowsG), a = simulateCraft(g), b = simulateCraft(g);
    res[name] = a;
    check(name, a);
    if (a.distance !== b.distance || a.samples.length !== b.samples.length) problems.push(`${name}: 결과가 매번 다름`);
    if (!a.info.valid) problems.push(`${name}: 조립이 올바르지 않음`);
    // 여러 발사 각도·세기, 조작 없음도 안전한지
    for (const angle of [CONTROL.minAngle, 25, 45, CONTROL.maxAngle]) for (const power of [CONTROL.minPower, 1]) {
      check(`${name}(${angle}°, ${power})`, simulateCraft(g, { angle, power }));
    }
    check(`${name}(조작 없음)`, simulateCraft(g, { tapEvery: 0, blow: () => false }));
    check(`${name}(계속 두드림)`, simulateCraft(g, { tapEvery: 0.1 }));
    rows.push({
      조립: name, 방식: a.info.style, '거리(m)': a.distance, '최고 높이(m)': a.maxHeight,
      '최고 속도': +a.maxSpeed.toFixed(1), '비행(초)': +a.simSeconds.toFixed(1), 흔들림: +a.wobble.toFixed(0),
      결과: a.crashed ? '추락' : a.inRiver ? '남강' : '착지', '하모 설명': a.feedback,
    });
  }
  // 무작위 조립 300개도 안전한지
  const rng = createRng(20261116), keys = Object.keys(PARTS).filter(k => k !== 'cockpit');
  for (let i = 0; i < 300; i++) {
    const g = emptyGrid();
    g[Math.floor(rng() * GRID.rows)][Math.floor(rng() * GRID.cols)] = 'cockpit';
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (!g[r][c] && rng() < 0.6) g[r][c] = keys[Math.floor(rng() * keys.length)];
    if (!analyzeCraft(g).valid) continue;
    check(`무작위 ${gridToRows(g).join('/')}`, simulateCraft(g, { angle: 10 + rng() * 50, power: 0.7 + rng() * 0.3 }));
  }

  // 나는 방식 구분: 날개형 = 가장 멀리, 회전날개형 = 가장 높이·가장 천천히, 풀무형 = 가장 빠르게·금방 떨어짐
  const glide = res['날개 6장+꼬리'], rotor = res['회전날개 3개'], bellows = res['풀무 2개'];
  const avgSpeed = r => r.distance / r.simSeconds;
  if (!(glide.distance > rotor.distance && glide.distance > bellows.distance)) problems.push('날개형이 가장 멀리 가지 않음');
  if (!(rotor.maxHeight > glide.maxHeight && rotor.maxHeight > bellows.maxHeight)) problems.push('회전날개형이 가장 높이 뜨지 않음');
  if (!(avgSpeed(rotor) < avgSpeed(glide) && avgSpeed(rotor) < avgSpeed(bellows))) problems.push('회전날개형이 가장 천천히 가지 않음');
  if (!(bellows.maxSpeed > glide.maxSpeed * 1.3 && bellows.maxSpeed > rotor.maxSpeed * 1.3)) problems.push('풀무형이 눈에 띄게 빠르지 않음');
  if (!(bellows.simSeconds < glide.simSeconds)) problems.push('풀무형이 날개형보다 오래 낢(금방 떨어져야 함)');
  if (glide.info.style !== 'glide' || rotor.info.style !== 'rotor' || bellows.info.style !== 'bellows') problems.push('나는 방식 분류가 틀림');
  const styles = [['날개형', glide], ['회전날개형', rotor], ['풀무형', bellows]].map(([k, r]) => ({
    방식: k, '거리(m)': r.distance, '최고 높이(m)': r.maxHeight, '평균 속도': +avgSpeed(r).toFixed(1), '최고 속도': +r.maxSpeed.toFixed(1), '비행(초)': +r.simSeconds.toFixed(1),
  }));

  // 무게중심 원리
  const bal = res['날개 4장'];
  if (!(res['뒤가 무거움'].distance < bal.distance * 0.8)) problems.push('뒤가 무거워도 멀리 감');
  if (!(res['앞이 무거움'].distance < bal.distance * 0.8)) problems.push('앞이 무거워도 멀리 감');
  if (res['뒤가 무거움'].feedback !== 'tailHeavy' || res['앞이 무거움'].feedback !== 'noseHeavy') problems.push('무게중심 하모 설명이 틀림');
  if (!(res['날개 6장+꼬리'].distance > res['날개 6장'].distance)) problems.push('연 꼬리가 도움이 안 됨');
  if (!(res['날개 6장'].wobble > res['날개 6장+꼬리'].wobble)) problems.push('연 꼬리가 흔들림을 줄이지 않음');
  if (!(res['날개 4장+바퀴'].distance > res['날개 3장'].distance)) problems.push('수레바퀴가 출발을 돕지 않음');
  if (!(res['날개 없음'].distance < CONFIG.world.riverEnd) || res['날개 없음'].feedback !== 'noWing') problems.push('날개 없이도 남강을 건넘');
  if (res['너무 무거움'].feedback !== 'tooHeavy') problems.push('너무 무거운 조립 설명이 틀림');
  if (!(res['날개 2장'].distance > CONFIG.world.riverEnd)) problems.push('날개 2장으로 남강을 못 건넘(너무 어려움)');

  console.table(rows);
  console.table(styles);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log(`대표 조립 ${rows.length}종 검사 통과`);
  return { rows, styles, problems };
}

function gradeOf(distance, crashed) {
  if (crashed) return 'crash';
  if (distance >= CONFIG.grades.bestFrom) return 'best';
  if (distance >= CONFIG.grades.goodFrom) return 'good';
  return 'low';
}

// =============================================================
// 1-2. 도전 모드 규칙 (화면과 무관)
// =============================================================
// 시드 랜덤: 같은 시드면 항상 같은 순서 (mulberry32)
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 단계의 숨김 장소 정보
function stageSpots(stage) { return stage.spots.map(id => HIDE_SPOTS.find(s => s.id === id)); }

// 내용물을 섞어서 그 단계 spots 순서대로 돌려준다
function shuffleLoot(seed, stage) {
  const rng = createRng(seed);
  const pool = [];
  for (const row of LOOT_TABLE[stage.id]) for (let i = 0; i < row.count; i++) pool.push(row.item);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

// 돌발 이벤트 계획: 같은 시드면 항상 같음. [{ type, at }]
function makeEventPlan(seed, stage) {
  const [lo, hi] = stage.events;
  if (hi <= 0) return [];
  const rng = createRng(seed + 5000);
  const n = lo + Math.floor(rng() * (hi - lo + 1));
  const types = rng() < 0.5 ? ['paper', 'chicken'] : ['chicken', 'paper'];
  return types.slice(0, n)
    .map(type => ({ type, at: Math.round((EVENTS.atFrom + rng() * (EVENTS.atTo - EVENTS.atFrom)) * 10) / 10 }))
    .sort((a, b) => a.at - b.at);
}

// 받침에 맞는 조사 고르기
function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  return code >= 0 && code <= 11171 && code % 28 > 0 ? withFinal : withoutFinal;
}

function placeName(areaId) { return MAP_PLACES.find(p => p.id === areaId).name; }

// 이번 판 실제 배치에서 힌트를 만든다. spots: { id, area, kind, loot, opened, hint }
function makeHint(spots, rng) {
  const left = spots.filter(s => !s.opened && !s.hint);
  if (left.length === 0) return { spotId: null, item: null, text: HINT_TEMPLATES.none };
  const empties = left.filter(s => s.loot === 'empty');
  const parts = left.filter(s => s.loot !== 'empty');
  let chosen;
  if (parts.length === 0 || (empties.length > 0 && rng() < CHALLENGE.hintEmptyChance)) {
    chosen = empties[Math.floor(rng() * empties.length)];
  } else {
    const top = Math.min(...parts.map(s => ITEMS[s.loot].hintRank));
    const best = parts.filter(s => ITEMS[s.loot].hintRank === top);
    chosen = best[Math.floor(rng() * best.length)];
  }
  const place = placeName(chosen.area), spot = HIDE_SPOT_KINDS[chosen.kind];
  if (chosen.loot === 'empty') {
    return {
      spotId: chosen.id, item: 'empty',
      text: HINT_TEMPLATES.empty.replace('{place}', place).replace('{spot}', spot).replace('{은는}', josa(spot, '은', '는')),
    };
  }
  const item = ITEMS[chosen.loot].name;
  return {
    spotId: chosen.id, item: chosen.loot,
    text: HINT_TEMPLATES.found.replace('{place}', place).replace('{spot}', spot).replace('{item}', item).replace('{이가}', josa(item, '이', '가')),
  };
}

// 벽·건물 충돌: 아요를 사각형으로 보고 단순 판정
function isBlocked(x, y) {
  const r = CHALLENGE.ayoRadius, a = CHALLENGE.walkArea;
  if (x - r < a.x || x + r > a.x + a.w || y - r < a.y || y + r > a.y + a.h) return true;
  for (const list of [MAP_PLACES, MAP_DECOR, MAP_FENCES]) {
    for (const p of list) {
      if (p.solid === false) continue;
      if (x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h) return true;
    }
  }
  return false;
}

// ----- 길찾기: 칸으로 나눈 지도에서 A*, 눌렀을 때만 계산 -----
let walkGridCache = null;
function walkGrid() {
  if (walkGridCache) return walkGridCache;
  const a = CHALLENGE.walkArea, g = CHALLENGE.gridCell;
  const cols = Math.floor(a.w / g), rows = Math.floor(a.h / g);
  const free = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    free[r * cols + c] = isBlocked(a.x + (c + 0.5) * g, a.y + (r + 0.5) * g) ? 0 : 1;
  }
  walkGridCache = { cols, rows, free, g, x0: a.x, y0: a.y };
  return walkGridCache;
}

function nearestFreeCell(G, x, y) {
  const c0 = clamp(Math.floor((x - G.x0) / G.g), 0, G.cols - 1);
  const r0 = clamp(Math.floor((y - G.y0) / G.g), 0, G.rows - 1);
  for (let d = 0; d < Math.max(G.cols, G.rows); d++) {
    let best = -1, bestD = Infinity;
    for (let r = r0 - d; r <= r0 + d; r++) for (let c = c0 - d; c <= c0 + d; c++) {
      if (r < 0 || c < 0 || r >= G.rows || c >= G.cols || !G.free[r * G.cols + c]) continue;
      const dist = Math.hypot(c - c0, r - r0);
      if (dist < bestD) { bestD = dist; best = r * G.cols + c; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

function segmentClear(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
  for (let i = 1; i <= n; i++) {
    if (isBlocked(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
  }
  return true;
}

// from에서 to까지 지나갈 점들을 돌려준다(to가 막힌 곳이면 가장 가까운 빈 곳까지)
function findPath(from, to) {
  const end = isBlocked(to.x, to.y) ? null : to;
  if (end && segmentClear(from, end)) return [{ x: end.x, y: end.y }];
  const G = walkGrid(), { cols, rows } = G;
  const center = i => ({ x: G.x0 + (i % cols + 0.5) * G.g, y: G.y0 + (Math.floor(i / cols) + 0.5) * G.g });
  const start = nearestFreeCell(G, from.x, from.y), goal = nearestFreeCell(G, to.x, to.y);
  if (start < 0 || goal < 0) return [];
  const cost = new Float32Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const open = [start];
  cost[start] = 0;
  const gx = goal % cols, gy = Math.floor(goal / cols);
  const guess = i => Math.hypot(i % cols - gx, Math.floor(i / cols) - gy);
  while (open.length) {
    let at = 0;
    for (let k = 1; k < open.length; k++) if (cost[open[k]] + guess(open[k]) < cost[open[at]] + guess(open[at])) at = k;
    const i = open[at];
    open[at] = open[open.length - 1]; open.pop();
    if (i === goal) break;
    if (closed[i]) continue;
    closed[i] = 1;
    const c = i % cols, r = Math.floor(i / cols);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      if (!G.free[n] || closed[n]) continue;
      if (dr && dc && (!G.free[r * cols + nc] || !G.free[nr * cols + c])) continue; // 모서리 끼어들기 금지
      const nextCost = cost[i] + (dr && dc ? Math.SQRT2 : 1);
      if (nextCost < cost[n]) { cost[n] = nextCost; prev[n] = i; open.push(n); }
    }
  }
  if (goal !== start && prev[goal] < 0) return [];
  const cells = [];
  for (let i = goal; i >= 0; i = prev[i]) cells.unshift(center(i));
  const pts = [{ x: from.x, y: from.y }, ...cells];
  if (end) pts.push({ x: end.x, y: end.y });
  // 직선으로 갈 수 있는 점은 건너뛴다
  const out = [];
  for (let i = 0; i < pts.length - 1;) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

function pathLength(from, to) {
  let len = 0, at = from;
  for (const p of findPath(from, to)) { len += Math.hypot(p.x - at.x, p.y - at.y); at = p; }
  return len;
}

// 가방 내용(['wing', 'frame', ...])을 조립 부품 개수로 바꾼다. 조종석은 늘 하나 준다
function partsFromBag(bag, empties = 0, level = null) {
  const counts = {};
  for (const t of bag) if (t && ITEMS[t].part) counts[ITEMS[t].part] = (counts[ITEMS[t].part] || 0) + 1;
  const traps = bag.filter(t => t && ITEMS[t].use === 'trap');
  return { counts, empties, traps, canAsk: !level || !!level.hintVillager, canBuild: !!(counts.wing || counts.rotor || counts.bellows) };
}

// 아요 추천 후보(가진 부품에 맞게 줄여서 가장 멀리 가는 것을 고른다)
const BUILD_TEMPLATES = [
  ['WWWWW', 'TFCBH', 'WWRWW'], ['.WWW.', 'TFCF.', '.WWW.'], ['.WWW.', 'TFCB.', '.WWW.'], ['.WW..', 'BFCB.', '.WW..'],
  ['.WWW.', 'BFCB.', '.WW..'], ['.B...', 'BBCW.', '..W..'], ['.WW..', 'TFCW.', '..WW.'], ['.WW..', '.FCW.', '..WW.'],
  ['..W..', '.FCW.', '..W..'], ['.WWW.', '.FCF.', '.....'], ['..W..', '.FC..', '..W..'], ['..W..', '..C..', '..W..'],
  ['..WW.', 'TFCW.', '.....'], ['.RRR.', '.FCF.', '.....'], ['.RR..', 'WFCW.', '.WW..'], ['.RWW.', 'TFCFB', '.HWW.'],
  ['..W..', 'TFCB.', '..W..'], ['..W..', '.TCW.', '.....'], ['.....', 'BFCB.', '..W..'], ['..R..', '.FCW.', '.....'],
];
function bestBuildFor(rules, opt) {
  const score = g => { const r = simulateCraft(g, opt); return r.crashed ? r.distance * 0.5 : r.distance; };
  let best = null, bestD = -1;
  for (const t of BUILD_TEMPLATES) {
    const g = fitGrid(gridFromRows(t), rules);
    if (!analyzeCraft(g).valid) continue;
    const d = score(g);
    if (d > bestD) { bestD = d; best = g; }
  }
  if (!best) return freshGrid(rules);
  // 남은 부품을 하나씩 붙이거나 떼어 보고, 가장 멀리 가게 하는 것을 고른다(더 나아지지 않으면 멈춤)
  for (let round = 0; round < 8; round++) {
    let gain = null;
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      if (!best[r][c] || best[r][c] === 'cockpit') continue;
      const g = copyGrid(best);
      g[r][c] = null;
      if (!analyzeCraft(g).valid) continue;
      const d = score(g);
      if (d > bestD + 0.5 && (!gain || d > gain.d)) gain = { g, d };
    }
    for (const key of rules.allowed) {
      if (key === 'cockpit' || limitOf(rules, key) - usedOf(best, rules, key) <= 0) continue;
      for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
        if (best[r][c]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => best[r + dr] && best[r + dr][c + dc]);
        if (!near) continue;
        const g = copyGrid(best);
        g[r][c] = key;
        const d = score(g);
        if (d > bestD + 0.5 && (!gain || d > gain.d)) gain = { g, d };
      }
    }
    if (!gain) break;
    best = gain.g; bestD = gain.d;
  }
  return best;
}
// 모은 부품으로 조립 규칙을 만든다(조종석 1 + 모은 부품만)
function rulesFromParts(parts, level) {
  const limits = { cockpit: 1, ...parts.counts };
  const rules = { allowed: PART_ORDER.filter(k => limits[k]), limits, locked: [], recommend: null };
  rules.recommend = gridToRows(bestBuildFor(rules, challengeLaunch(level)));
  return rules;
}
// 도전 모드 발사: 1단계는 자동, 그 외는 '수평으로 끝까지 당김'으로 본다
function challengeLaunch(level) { return level && level.launch === 'pull' ? { angle: CONTROL.optAngle, power: 1 } : {}; }

// 무거운 물건 하나당 느려지고, 최소 속도 아래로는 내려가지 않는다
function speedScaleOf(bag) {
  const heavy = bag.filter(t => t && ITEMS[t].heavy).length;
  return Math.max(CHALLENGE.minSpeedScale, 1 - CHALLENGE.heavySlowEach * heavy);
}

function isChallengeSuccess(flight, level) { return !flight.crashed && flight.distance >= level.goal; }

// 도전 모드 실패 시 한 마디: 위에서 먼저 맞는 것 하나. 해당 없으면 null(FEEDBACK만 사용)
function challengeFeedbackKey(parts) {
  if (parts.traps.includes('jar')) return 'jarHeld';
  if (parts.traps.includes('pot')) return 'potHeld';
  if (parts.canAsk && parts.empties >= CHALLENGE.manyEmptyAt) return 'manyEmpty';
  if ((parts.counts.wing || 0) < CHALLENGE.goodWings) return 'littleWing';
  return null;
}

// 여러 지점을 가장 짧게 도는 거리(출발점 0번, 칸 수가 적어서 전부 계산)
function shortestTour(dist, stops) {
  const n = stops.length, full = (1 << n) - 1;
  const best = new Float64Array((1 << n) * n).fill(Infinity);
  for (let i = 0; i < n; i++) best[(1 << i) * n + i] = dist[0][stops[i]];
  for (let mask = 1; mask <= full; mask++) for (let i = 0; i < n; i++) {
    const cur = best[mask * n + i];
    if (cur === Infinity) continue;
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue;
      const k = (mask | (1 << j)) * n + j, v = cur + dist[stops[i]][stops[j]];
      if (v < best[k]) best[k] = v;
    }
  }
  let ans = Infinity;
  for (let i = 0; i < n; i++) ans = Math.min(ans, best[full * n + i]);
  return ans;
}

// 발사대에서 (dx, dy)만큼 끌었을 때(화면 좌표, 오른쪽·아래가 +)의 각도와 세기
// 왼쪽 수평 = 최적 각도, 아래로 기울수록 높아지고 위로 기울수록 낮아짐. 오른쪽으로 밀면 cancel
function aimFromPull(dx, dy) {
  const K = CONTROL, pull = Math.hypot(dx, dy);
  const power = K.minPower + (1 - K.minPower) * clamp(pull / K.maxPull, 0, 1);
  if (dx >= 0) return { cancel: pull > 0, angle: K.optAngle, power, pull };
  const tilt = Math.atan2(dy, -dx) * 180 / Math.PI;
  return { cancel: false, angle: clamp(K.optAngle + tilt * K.pullAngleScale, K.minAngle, K.maxAngle), power, pull };
}

// 도전 모드 검사 — 브라우저 콘솔에서 runChallengeCombos() 실행
// 대표 가방(아요 추천 조립으로 날림), 내용물 수, 1단계 보장, 힌트, 60초 안에 모을 수 있는지, 이벤트, 문장 길이
function runChallengeCombos() {
  const W = 'wing', F = 'frame', K = 'weight', R = 'rotor', B = 'bellows', T = 'tail', J = 'jar', P = 'pot';
  // must: 'ok' 성공 / 'fail' 실패 / 'cannot' 만들 수 없음, fb: 기대하는 도전 모드 한 마디
  const cases = {
    1: [
      { bag: [W, W], must: 'ok' }, // 최소한 날 수 있는 조합
      { bag: [W, W, W, W, F, T], must: 'ok' },
      { bag: [W], must: 'fail', fb: 'littleWing' },
      { bag: [F, T], must: 'cannot' },
    ],
    2: [
      { bag: [W, W, W, F, T], must: 'ok' },
      { bag: [W, W, W, R, F, T], must: 'ok' },
      { bag: [W, W], must: 'fail', fb: 'littleWing' },
      { bag: [W, W], empties: 2, must: 'fail', fb: 'manyEmpty' },
      { bag: [R, F, K], must: 'fail' },
      { bag: [K, F], must: 'cannot' },
    ],
    3: [
      { bag: [W, W, W, W, B, T, F], must: 'ok' },
      { bag: [W, W, W, B, B, T], must: 'ok' },
      { bag: [W, W, W, F, T], must: 'fail' },
      { bag: [W, W, W, J, T, F], must: 'fail', fb: 'jarHeld' },
      { bag: [W, W, W, P, T, F], must: 'fail', fb: 'potHeld' },
      { bag: [J, P, F], must: 'cannot' },
    ],
  };
  // 위치를 다 알 때 60초 안에 모아야 하는 가방
  const targetBag = { 1: [W, W], 2: [W, W, W, T], 3: [W, W, W, B, T] };
  const label = bag => {
    const n = {};
    bag.forEach(t => { n[ITEMS[t].short] = (n[ITEMS[t].short] || 0) + 1; });
    return Object.keys(n).map(k => (n[k] > 1 ? `${k}${n[k]}` : k)).join('+') || '(빈 가방)';
  };
  const flyBag = (level, bag, empties) => {
    const parts = partsFromBag(bag, empties || 0, level);
    if (!parts.canBuild) return { parts };
    const rules = rulesFromParts(parts, level), g = fitGrid(gridFromRows(rules.recommend), rules);
    const fl = simulateCraft(g, challengeLaunch(level));
    return { parts, rules, fl, ok: isChallengeSuccess(fl, level) };
  };
  const rows = [], problems = [], stageTimes = [], hintSamples = [], eventRows = [];
  const decisionSeconds = 1.5; // 부품 팝업에서 고르는 시간(가정)
  const searchSeconds = SEARCH_TAPS / SEARCH_TAPS_PER_SECOND;

  for (const level of CHALLENGE_LEVELS) {
    const tag = level.name, loot = LOOT_TABLE[level.id] || [];
    for (const c of [...cases[level.id], { bag: targetBag[level.id], must: 'ok' }]) {
      const name = label(c.bag);
      if (c.bag.length > BAG_SIZE) problems.push(`${tag} ${name}: 가방 칸 초과`);
      const r = flyBag(level, c.bag, c.empties);
      if (c.must === 'cannot') {
        rows.push({ 단계: tag, 가방: name, '추천 조립': '-', '거리(m)': '-', 결과: '만들 수 없음', 피드백: '-' });
        if (r.parts.canBuild) problems.push(`${tag} ${name}: 만들 수 없어야 함`);
        continue;
      }
      if (!r.fl) { problems.push(`${tag} ${name}: 만들 수 있어야 함`); continue; }
      const extra = r.ok ? null : challengeFeedbackKey(r.parts);
      rows.push({
        단계: tag, 가방: name + (c.empties ? ` (빈 곳 ${c.empties})` : ''), '추천 조립': r.rules.recommend.join('/'),
        '거리(m)': r.fl.distance, 결과: r.ok ? '성공' : `실패(${GRADE_TEXT[r.fl.grade]})`, 피드백: r.ok ? 'success' : `${r.fl.feedback}${extra ? ' + ' + extra : ''}`,
      });
      if (c.must === 'ok' && !r.ok) problems.push(`${tag} ${name}: 반드시 성공해야 함(${r.fl.distance}m)`);
      if (c.must === 'fail' && r.ok) problems.push(`${tag} ${name}: 실패해야 함(${r.fl.distance}m)`);
      if ('fb' in c && !r.ok && extra !== c.fb) problems.push(`${tag} ${name}: 한 마디가 ${c.fb}여야 하는데 ${extra}`);
    }

    // 내용물 구성
    const total = loot.reduce((n, x) => n + x.count, 0);
    if (total !== level.spots.length) problems.push(`${tag}: 내용물 ${total}개, 장소 ${level.spots.length}곳`);
    if (loot.some(x => x.item !== 'empty' && !ITEMS[x.item])) problems.push(`${tag}: 없는 부품이 들어 있음`);
    const spots0 = stageSpots(level);
    if (spots0.some(s => !s)) problems.push(`${tag}: 없는 장소 id`);

    // 힌트는 항상 실제 배치와 일치
    if (level.hintVillager) {
      for (let seed = 1; seed <= 100; seed++) {
        const rng = createRng(seed + 1000), lay = shuffleLoot(seed, level);
        const spots = spots0.map((s, i) => ({ ...s, loot: lay[i], opened: false, hint: null }));
        const h = makeHint(spots, rng);
        const spot = spots.find(s => s.id === h.spotId);
        if (!spot || spot.loot !== h.item) problems.push(`${tag} 시드 ${seed}: 거짓 힌트 "${h.text}"`);
        if (h.text.length > 20) problems.push(`${tag} 힌트가 20자 초과: ${h.text}`);
        if (seed <= 2) hintSamples.push(h.text);
      }
    }

    // 시간: 위치를 다 알 때 목표 가방을 60초 안에 모을 수 있는가, 전부 뒤지면 얼마나 걸리는가
    const stands = [CHALLENGE.start, ...spots0.map(s => ({ x: s.sx, y: s.sy }))];
    stands.forEach((p, i) => { if (isBlocked(p.x, p.y)) problems.push(`${tag} ${i}번 서는 자리가 막혀 있음`); });
    const dist = stands.map(p => stands.map(q => pathLength(p, q)));
    const allStops = spots0.map((_, i) => i + 1);
    const popups = loot.filter(x => x.item !== 'empty' && x.item !== 'record').reduce((n, x) => n + x.count, 0);
    const walkAll = shortestTour(dist, allStops) / CHALLENGE.walkSpeed;
    const allSeconds = walkAll + level.spots.length * searchSeconds + popups * decisionSeconds;
    const need = {};
    targetBag[level.id].forEach(t => { need[t] = (need[t] || 0) + 1; });
    let worst = 0, sum = 0;
    const seedsChecked = 200;
    for (let seed = 1; seed <= seedsChecked; seed++) {
      const lay = shuffleLoot(seed, level);
      // 종류마다 필요한 개수만큼 장소를 고르는 모든 경우 중 가장 빠른 것
      let choices = [[]];
      for (const [t, n] of Object.entries(need)) {
        const at = allStops.filter(i => lay[i - 1] === t), next = [];
        for (let mask = 0; mask < 1 << at.length; mask++) {
          const pick = at.filter((_, i) => mask & (1 << i));
          if (pick.length === n) choices.forEach(ch => next.push([...ch, ...pick]));
        }
        choices = next;
      }
      let sec = Infinity;
      for (const stops of choices) sec = Math.min(sec, shortestTour(dist, stops) / CHALLENGE.walkSpeed + stops.length * (searchSeconds + decisionSeconds));
      worst = Math.max(worst, sec); sum += sec;
    }
    if (worst > TIME_LIMIT) problems.push(`${tag}: 목표 가방을 모으는 데 ${worst.toFixed(1)}초 걸리는 배치가 있음`);
    stageTimes.push({ 단계: tag, 장소: level.spots.length, '목표 가방': label(targetBag[level.id]), '걷기 최단(초)': +walkAll.toFixed(1), '전부 뒤지기(초)': +allSeconds.toFixed(1), '목표 가방 평균(초)': +(sum / seedsChecked).toFixed(1), '목표 가방 최악(초)': +worst.toFixed(1) });
  }

  // 3단계 전부 뒤지기는 시간 안에 다 못 하게(80~90초)
  const last = stageTimes[stageTimes.length - 1]['전부 뒤지기(초)'];
  if (last < 80 || last > 90) problems.push(`3단계 전부 뒤지기 ${last}초(목표 80~90초)`);

  // 1단계 보장: 날 수 있는 만큼 한지 날개가 늘 들어 있음
  const wings1 = (LOOT_TABLE[1].find(x => x.item === 'wing') || { count: 0 }).count;
  if (wings1 < CHALLENGE.level1MinWings) problems.push(`1단계 한지 날개 ${wings1}장(최소 ${CHALLENGE.level1MinWings}장)`);
  if (!flyBag(CHALLENGE_LEVELS[0], Array(CHALLENGE.level1MinWings).fill('wing')).ok) problems.push('1단계 최소 날개로 성공 못 함');

  // 교환·이벤트 보상이 실제 부품
  for (const tr of TRADES) if (!ITEMS[tr.give] || !ITEMS[tr.give].part || !ITEMS[tr.want]) problems.push(`교환 ${tr.who}: 부품이 아님`);
  for (const e of [EVENTS.paper, EVENTS.chicken]) if (!ITEMS[e.reward] || !ITEMS[e.reward].part) problems.push(`이벤트 보상 ${e.reward}: 부품이 아님`);

  // 시드 3개: 이벤트 목록과 3단계 배치
  const stage3 = CHALLENGE_LEVELS[2], seedList = [1, 2, 3], layouts = seedList.map(s => shuffleLoot(s, stage3));
  for (const seed of seedList) {
    const plan = makeEventPlan(seed, stage3);
    eventRows.push({ 시드: seed, 이벤트: plan.map(e => `${e.type === 'paper' ? '날아가는 한지' : '도망가는 닭'} ${e.at}초`).join(', ') });
  }
  const eventCounts = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const plan = makeEventPlan(seed, stage3);
    eventCounts.add(plan.length);
    if (plan.length < 1 || plan.length > 2) problems.push(`시드 ${seed}: 이벤트 ${plan.length}개`);
    if (plan.some(e => e.at < EVENTS.atFrom || e.at > EVENTS.atTo)) problems.push(`시드 ${seed}: 이벤트 시간 벗어남`);
    if (JSON.stringify(plan) !== JSON.stringify(makeEventPlan(seed, stage3))) problems.push(`시드 ${seed}: 이벤트가 매번 다름`);
    if (makeEventPlan(seed, CHALLENGE_LEVELS[0]).length || makeEventPlan(seed, CHALLENGE_LEVELS[1]).length) problems.push('1·2단계에 이벤트가 있음');
  }
  if (eventCounts.size !== 2) problems.push('이벤트 수가 1개·2개로 나뉘지 않음');
  if (new Set(layouts.map(l => l.join())).size !== 3) problems.push('시드가 달라도 배치가 같음');
  const seedRows = stageSpots(stage3).map((s, i) => {
    const row = { 장소: `${placeName(s.area)} ${HIDE_SPOT_KINDS[s.kind]}` };
    seedList.forEach((seed, k) => { row[`시드 ${seed}`] = layouts[k][i] === 'empty' ? '꽝' : ITEMS[layouts[k][i]].name; });
    return row;
  });

  // 진행 중 문장은 20자 이내(이야기·기록 카드·부품 소개·요청 문구 제외)
  const shortOnes = [
    CHALLENGE_STORY.quitAsk, CHALLENGE_STORY.timeUp, CHALLENGE_STORY.noParts, CHALLENGE_STORY.bagFull, CHALLENGE_STORY.emptyLoot,
    EVENTS.paper.startText, EVENTS.paper.missText, EVENTS.chicken.startText, TRADE_THANKS, ...TRADES.map(x => x.ask),
    HINT_TEMPLATES.none, CONTROL_TEXT.pullHint, FLIGHT_TEXT.bellowsHint, FLIGHT_TEXT.rotorHint,
    BUILD_TEXT.needCockpit, BUILD_TEXT.noLift, BUILD_TEXT.tailHeavy, BUILD_TEXT.noseHeavy, BUILD_TEXT.ready, BUILD_TEXT.usedUp,
    ...Object.entries(TUTORIALS.items).filter(([k]) => k !== 'drum').map(([, v]) => v),
  ];
  for (const s of shortOnes) if (s.length > 20) problems.push(`20자 초과: ${s}`);
  if (new Set(RECORD_CARDS.map(r => r.id)).size !== RECORD_CARDS.length) problems.push('기록 카드 id가 겹침');

  console.table(rows);
  console.table(stageTimes);
  console.table(eventRows);
  console.table(seedRows);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('도전 모드 조합 검사 통과');
  return { rows, problems, seedRows, stageTimes, eventRows, hintSamples };
}

// 조종 검사 — 브라우저 콘솔에서 runControlTest() 실행
// 당기는 방향과 각도, 발사 각도·세기, 풀무 누르기, 회전날개 두드리기가 결과를 바꾸는지 확인
function runControlTest() {
  const problems = [], rows = [], M = CONTROL.maxPull;
  // 당기기: 왼쪽 수평 = 기준 각도, 아래로 = 높게, 위로 = 낮게, 오른쪽 = 취소
  const full = aimFromPull(-M, 0), half = aimFromPull(-M / 2, 0), up = aimFromPull(-100, -50), down = aimFromPull(-M, M);
  if (full.angle !== CONTROL.optAngle || full.power !== 1) problems.push('수평 끝까지가 기준 각도·최대 세기가 아님');
  if (!(down.angle > CONTROL.optAngle)) problems.push('왼쪽 아래로 당기면 각도가 높아져야 함');
  if (!(up.angle < CONTROL.optAngle)) problems.push('왼쪽 위로 당기면 각도가 낮아져야 함');
  if (half.angle !== CONTROL.optAngle || !(half.power < 1)) problems.push('수평 절반은 각도가 같고 세기만 약해야 함');
  if (!aimFromPull(50, 0).cancel || !aimFromPull(50, 40).cancel) problems.push('오른쪽으로 밀면 취소되어야 함');
  if (aimFromPull(-M, -M * 5).angle !== CONTROL.minAngle || aimFromPull(-1, M).angle !== CONTROL.maxAngle) problems.push('각도가 최소~최대로 제한되지 않음');

  const crafts = { 날개형: TEST_CRAFTS['날개 6장+꼬리'], 풀무형: TEST_CRAFTS['풀무 2개'], 회전날개형: TEST_CRAFTS['회전날개 3개'], '날개 2장': TEST_CRAFTS['날개 2장'] };
  for (const [name, rowsG] of Object.entries(crafts)) {
    const g = gridFromRows(rowsG), row = { 조립: name };
    let bestA = 0, bestD = -1;
    for (let a = CONTROL.minAngle; a <= CONTROL.maxAngle; a += 10) {
      const d = simulateCraft(g, { angle: a, power: 1 }).distance;
      row[`${a}°`] = d;
      if (d > bestD) { bestD = d; bestA = a; }
    }
    row['약하게(30°)'] = simulateCraft(g, { angle: 30, power: CONTROL.minPower }).distance;
    row['가장 먼 각도'] = bestA;
    rows.push(row);
    if (row['약하게(30°)'] > simulateCraft(g, { angle: 30, power: 1 }).distance) problems.push(`${name}: 약하게 쏜 게 더 멀리 감`);
    const a = simulateCraft(g, { angle: 30, power: 1 }), b = simulateCraft(g, { angle: 30, power: 1 });
    if (a.distance !== b.distance || a.samples.length !== b.samples.length) problems.push(`${name}: 같은 조작인데 결과가 다름`);
  }
  const angleKeys = Object.keys(rows[0]).filter(k => k.endsWith('°') && !k.includes('('));
  if (rows[0]['가장 먼 각도'] === CONTROL.maxAngle || rows[3]['가장 먼 각도'] === CONTROL.maxAngle) problems.push('날개형이 가장 높은 각도에서 가장 멀리 감');
  const spread = Math.max(...angleKeys.map(k => rows[3][k])) - Math.min(...angleKeys.map(k => rows[3][k]));
  if (spread < 10) problems.push(`날개 2장: 발사 각도에 따른 거리 차이가 ${spread}m(너무 작음)`);

  // 풀무: 누르면 더 멀리 / 회전날개: 두드리면 더 높이
  const bel = gridFromRows(crafts.풀무형), rot = gridFromRows(crafts.회전날개형);
  const belOn = simulateCraft(bel).distance, belOff = simulateCraft(bel, { blow: () => false }).distance;
  const rotOn = simulateCraft(rot).maxHeight, rotOff = simulateCraft(rot, { tapEvery: 0 }).maxHeight;
  if (!(belOn > belOff + 10)) problems.push(`풀무를 눌러도 별로 멀리 안 감(${belOff} → ${belOn}m)`);
  if (!(rotOn > rotOff + 5)) problems.push(`회전날개를 두드려도 별로 안 뜸(${rotOff} → ${rotOn}m)`);
  const summary = { '풀무 안 누름(m)': belOff, '풀무 누름(m)': belOn, '회전날개 안 두드림(높이)': rotOff, '회전날개 두드림(높이)': rotOn };
  console.table(rows);
  console.table([summary]);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('조종 검사 통과');
  return { rows, problems, summary };
}

// =============================================================
// 2. 오늘의 최고 기록 (저장 실패해도 메모리로 계속 동작)
// =============================================================
const TOP_KEY = 'ayo-bigeo-top';
let memoryTop = { date: '', list: [], challenge: [] };

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// mode: 'easy'(쉬운 모드) 또는 'challenge'(도전 모드)
function loadTop(mode) {
  const today = todayString();
  try {
    const raw = localStorage.getItem(TOP_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved && saved.date === today && Array.isArray(saved.list)) memoryTop = saved;
    }
  } catch (e) { /* 저장소를 못 쓰면 메모리 기록만 사용 */ }
  if (memoryTop.date !== today) memoryTop = { date: today, list: [], challenge: [] };
  if (!Array.isArray(memoryTop.challenge)) memoryTop.challenge = [];
  return mode === 'challenge' ? memoryTop.challenge : memoryTop.list;
}

// 같은 조합은 결과가 같으므로 한 번만 올린다. 추락은 올리지 않는다.
function saveTop(flight, mode) {
  if (flight.crashed) return;
  const list = loadTop(mode);
  const combo = flight.combo || `${flight.wing}/${flight.body}/${flight.ballast}/${flight.liftScale}/${flight.distance}`;
  if (list.some(r => r.combo === combo)) return;
  list.push({ combo, distance: flight.distance });
  list.sort((a, b) => b.distance - a.distance);
  list.length = Math.min(list.length, CONFIG.topMax);
  try { localStorage.setItem(TOP_KEY, JSON.stringify(memoryTop)); } catch (e) { /* 무시 */ }
}

// ----- 모은 옛 기록 카드: 날짜가 바뀌어도 남는다 -----
const RECORD_KEY = 'ayo-bigeo-records';
let memoryRecords = [];

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECORD_KEY));
    if (Array.isArray(saved)) memoryRecords = saved.filter(id => RECORD_CARDS.some(c => c.id === id));
  } catch (e) { /* 저장소를 못 쓰면 메모리 기록만 사용 */ }
  return memoryRecords;
}

// 아직 안 모은 카드 중 하나를 고른다. 전부 모았으면 아무 카드나 다시 보여 준다.
function pickRecord() {
  const have = loadRecords();
  const left = RECORD_CARDS.filter(c => !have.includes(c.id));
  if (left.length === 0) {
    return { card: RECORD_CARDS[Math.floor(Math.random() * RECORD_CARDS.length)], fresh: false, complete: false };
  }
  const card = left[Math.floor(Math.random() * left.length)];
  have.push(card.id);
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(have)); } catch (e) { /* 무시 */ }
  return { card, fresh: true, complete: left.length === 1 };
}

// ----- 설정(소리·읽어주기·쉬운 모드 조종)과 단계 진행: 저장 실패해도 메모리로 동작 -----
const SETTINGS_KEY = 'ayo-bigeo-settings', PROGRESS_KEY = 'ayo-bigeo-progress', TUT_KEY = 'ayo-bigeo-tutorials';
const settings = { sound: true, speak: true, easyControl: false };
const progress = { unlocked: 1, fixed: null };

function loadSaved(key, target) {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v && typeof v === 'object') Object.assign(target, v); } catch (e) { /* 무시 */ }
}
function saveSaved(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ } }

// 단계 성공: 다음 단계를 연다. 새로 열렸으면 true
function unlockNext(stageId) {
  if (stageId >= CHALLENGE_LEVELS.length) return false; // 마지막 단계면 더 열 것이 없음
  const next = stageId + 1;
  if (next <= progress.unlocked) return false;
  progress.unlocked = next;
  saveSaved(PROGRESS_KEY, progress);
  return true;
}

// 결과 화면의 조종 안내(설계 문제가 없을 때만). 해당 없으면 null
function controlFeedbackKey(flight, stage, success) {
  if (flight.feedback !== 'glide') return null;
  if (flight.angle !== null && flight.angle >= CONTROL.tooHigh) return 'tooHigh';
  if (flight.angle !== null && flight.angle <= CONTROL.tooLow) return 'tooLow';
  return null;
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
  orange: '#f28c38', orangeDark: '#d9701f', muzzle: '#fff4e2', pearl: '#ffffff',
  hamo: '#a9c4e8', hamoLight: '#ffffff',
  wall: '#e6dfcc', wallDark: '#cbc2a8', roof: '#5e8a84',
};
const W = 1920, H = 1080;           // 논리 해상도
const RULER_Y = 970;                // 눈금 시작(땅 높이 GROUND_Y는 data.js)
const WORLD_X0 = 290, WORLD_SCALE = 12.5, WORLD_SCALE_X = 11.6; // 출발점 위치, 1m당 픽셀(가로는 140m까지 보이게 조금 좁힘)
const px = m => WORLD_X0 + m * WORLD_SCALE_X;
const py = m => GROUND_Y - m * WORLD_SCALE;

const images = {};
const game = {
  screen: 'title', dirty: true, lastInput: 0, canvasK: 1,

  history: [], flight: null, isRetry: false, goodbye: false, lastQuiz: -1,
  quizHamo: 'quiz',
  mode: 'easy', parts: null, collect: null, stage: 1,
  tut: null, tutSeen: new Set(),
};
const currentStage = () => CHALLENGE_LEVELS[game.stage - 1];

// =============================================================
// 효과음: Web Audio로 만든다(외부 파일 없음). 처음 누른 뒤에 켜진다
// =============================================================
const sfx = {
  ctx: null,
  unlocked: false,
  // 터치 기기는 pointerup·touchend·click에서만 소리를 켤 수 있다(pointerdown은 안 됨)
  ensure() {
    try {
      if (!this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); }
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') this.ctx.resume();
      if (!this.unlocked) {
        // 아무 소리 없는 아주 짧은 소리를 한 번 내서 안드로이드 크롬의 잠금을 푼다
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this.unlocked = true;
      }
    } catch (e) { /* 소리는 없어도 게임은 계속 */ }
  },
  tone(freq, seconds, type, volume, delay, slideTo) {
    if (!settings.sound || !this.ctx) return;
    try {
      const t = this.ctx.currentTime + (delay || 0), o = this.ctx.createOscillator(), v = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
      // 기본값의 2배에 SFX_VOLUME을 곱하고 최대 크기로 제한
      v.gain.setValueAtTime(Math.max(0.001, Math.min(SFX_MAX_GAIN, (volume || 0.2) * 2 * SFX_VOLUME)), t);
      v.gain.exponentialRampToValueAtTime(0.001, t + seconds);
      o.connect(v); v.connect(this.ctx.destination);
      o.start(t); o.stop(t + seconds);
    } catch (e) { /* 소리는 없어도 게임은 계속 */ }
  },
  play(name) {
    const T = (...a) => this.tone(...a);
    if (name === 'tap') T(420, 0.07, 'triangle', 0.14);
    else if (name === 'found') { T(660, 0.1, 'sine', 0.2); T(880, 0.14, 'sine', 0.2, 0.08); }
    else if (name === 'good') { T(660, 0.1, 'sine', 0.2); T(880, 0.1, 'sine', 0.2, 0.08); T(1320, 0.2, 'sine', 0.18, 0.16); }
    else if (name === 'empty') T(240, 0.18, 'triangle', 0.15, 0, 160);
    else if (name === 'tick') T(1100, 0.04, 'square', 0.07);
    else if (name === 'drum') { T(130, 0.22, 'sine', 0.4, 0, 70); T(90, 0.12, 'triangle', 0.25); }
    else if (name === 'launch') T(300, 0.3, 'sawtooth', 0.1, 0, 800);
    else if (name === 'wind') T(500, 0.5, 'sine', 0.08, 0, 1100);
    else if (name === 'splash') T(500, 0.25, 'sine', 0.2, 0, 120);
    else if (name === 'cluck') { T(700, 0.06, 'square', 0.08); T(900, 0.06, 'square', 0.08, 0.1); }
    else if (name === 'win') { [523, 659, 784, 1047].forEach((f, i) => T(f, 0.18, 'triangle', 0.2, i * 0.1)); }
  },
};

// =============================================================
// 말풍선 읽어주기: 지원하지 않는 환경이면 조용히 넘어간다
// =============================================================
const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
let lastSpoken = '', speakTimer = 0, firstInputDone = false, pendingSpeech = '', voicesKnown = false;
const koVoices = () => { try { return window.speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang || '')); } catch (e) { return []; } };
function speak(text) {
  if (!settings.speak || !canSpeak() || !text) return;
  lastSpoken = text;
  // 브라우저는 처음 누르기 전의 음성을 막으므로 기억해 뒀다가 첫 터치 때 읽는다
  if (!firstInputDone) { pendingSpeech = text; return; }
  try {
    window.speechSynthesis.cancel();
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ko-KR';
        u.rate = 0.95;
        const ko = koVoices();
        try { if (ko.length) u.voice = ko[0]; } catch (e) { /* lang만으로 읽음 */ }
        window.speechSynthesis.speak(u);
      } catch (e) { /* 무시 */ }
    }, SPEECH_DELAY_MS);
  } catch (e) { /* 무시 */ }
}
function stopSpeaking() {
  clearTimeout(speakTimer);
  if (!canSpeak()) return;
  try { window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
}
// 처음 누르거나 키를 누른 순간: 소리를 켜고, 기다리던 말풍선을 읽고, 상태를 한 번 기록한다
function onFirstInput() {
  sfx.ensure();
  if (firstInputDone) return;
  firstInputDone = true;
  if (pendingSpeech) { const text = pendingSpeech; pendingSpeech = ''; speak(text); }
  setTimeout(logSoundState, 600);
}
function logSoundState() {
  const voices = canSpeak() ? window.speechSynthesis.getVoices().map(v => `${v.name} (${v.lang})`) : [];
  console.log('[소리 확인] AudioContext:', sfx.ctx ? sfx.ctx.state : '없음', '/ 음성 ' + voices.length + '개:', voices.join(', ') || '(없음)');
}
// 타이틀: 한국어 음성이 없으면 작은 글씨로 알린다(목록을 다 받은 뒤에만)
function refreshVoiceNote() {
  if (game.screen !== 'title' || !ui) return;
  const old = ui.querySelector('.voice-note');
  const need = VOICE_NOTE.show && canSpeak() && voicesKnown && koVoices().length === 0;
  if (need && !old) ui.append(el('p', 'abs voice-note', VOICE_NOTE.text));
  else if (!need && old) old.remove();
}
function watchVoices() {
  if (!canSpeak()) return;
  const done = () => { voicesKnown = true; refreshVoiceNote(); };
  try { window.speechSynthesis.addEventListener('voiceschanged', done); } catch (e) { /* 무시 */ }
  if (koVoices().length) done();
  setTimeout(done, VOICE_NOTE.waitSeconds * 1000);
}
function bubbleText(n) {
  const ps = n.querySelectorAll('p');
  return (ps.length ? [...ps].map(p => p.textContent).join(' ') : n.textContent).trim();
}
// 말풍선이 새로 생기거나 글자가 바뀌면 읽는다
function watchBubbles() {
  let timer = 0;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const list = ui.querySelectorAll('.bubble');
      if (!list.length) return;
      const text = bubbleText(list[list.length - 1]);
      if (text !== lastSpoken) speak(text);
    }, 80);
  }).observe(ui, { childList: true, subtree: true, characterData: true });
}

// =============================================================
// 처음 보는 요소 안내: 잠깐 멈추고, 누르면 계속
// =============================================================
function showTutorial(key, lx, ly) {
  if (!TUTORIALS.enabled || game.tut || game.tutSeen.has(key)) return false;
  game.tutSeen.add(key);
  if (!TUTORIALS.resetOnTitle) saveSaved(TUT_KEY, [...game.tutSeen]);
  const scr = screens[game.screen];
  if (scr.onPause) scr.onPause();
  const back = el('div', 'tut-back');
  const text = el('div', 'sheet tut-text', TUTORIALS.items[key]);
  text.style.top = (ly < 540 ? Math.min(ly + 130, 900) : Math.max(ly - 260, 40)) / 40 + 'rem';
  const pic = el('canvas', 'tut-finger');
  pic.width = 160; pic.height = 160;
  drawFinger(pic.getContext('2d'), 70, 40, 1.6);
  pic.style.left = (lx - 30) / 40 + 'rem';
  pic.style.top = (ly - 10) / 40 + 'rem';
  back.append(pic, text);
  const close = () => {
    if (game.tut !== state) return;
    back.remove();
    game.tut = null;
    if (scr.onResume) scr.onResume();
  };
  const state = { key, close };
  game.tut = state;
  back.addEventListener('click', e => { e.stopPropagation(); sfx.play('tap'); close(); });
  ui.append(back);
  speak(TUTORIALS.items[key]);
  return true;
}

// 안내용 손가락(원점이 손끝)
function drawFinger(c, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath();
  c.moveTo(-10, 0); c.quadraticCurveTo(0, -12, 10, 0); c.lineTo(10, 30); c.lineTo(30, 36);
  c.quadraticCurveTo(38, 40, 36, 52); c.lineTo(30, 78); c.lineTo(-14, 78); c.lineTo(-28, 48);
  c.quadraticCurveTo(-30, 38, -18, 40); c.lineTo(-10, 46);
  c.closePath();
  c.fillStyle = '#ffffff'; c.fill();
  c.lineWidth = 4; c.lineJoin = 'round'; c.strokeStyle = C.ink; c.stroke();
  c.restore();
}

// 작은 북(원점이 가운데). used면 회색
function drawDrum(c, x, y, s, used) {
  c.save(); c.translate(x, y); c.scale(s, s);
  roundBox(c, -28, -14, 56, 34, 6); fillStroke(c, used ? '#c9c5ba' : '#c8553d', 3.5);
  c.beginPath(); c.ellipse(0, -14, 28, 10, 0, 0, Math.PI * 2); fillStroke(c, used ? '#e6e3da' : '#fff4e2', 3.5);
  c.strokeStyle = used ? '#a09c92' : C.ink; c.lineWidth = 2.5;
  c.beginPath(); for (const dx of [-16, 0, 16]) { c.moveTo(dx, -4); c.lineTo(dx, 18); } c.stroke();
  c.restore();
}

// 닭(흰 몸, 빨간 볏). 원점이 가운데, flip이면 오른쪽을 본다
function drawChicken(c, x, y, s, flip, carrying) {
  c.save(); c.translate(x, y); c.scale(flip ? -s : s, s);
  c.strokeStyle = '#d9962a'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(-6, 22); c.lineTo(-6, 36); c.moveTo(8, 22); c.lineTo(8, 36); c.stroke();
  c.beginPath(); c.moveTo(26, 4); c.lineTo(46, -14); c.lineTo(38, 12); c.closePath(); fillStroke(c, '#ffffff', 3);
  c.beginPath(); c.ellipse(4, 6, 26, 21, 0, 0, Math.PI * 2); fillStroke(c, '#ffffff', 3);
  circle(c, -22, -12, 13); fillStroke(c, '#ffffff', 3);
  c.beginPath(); c.moveTo(-30, -23); c.quadraticCurveTo(-28, -36, -22, -26); c.quadraticCurveTo(-18, -38, -14, -23); c.closePath(); fillStroke(c, '#d8362f', 2.5);
  c.beginPath(); c.moveTo(-34, -13); c.lineTo(-44, -9); c.lineTo(-33, -5); c.closePath(); fillStroke(c, '#f2b632', 2.5);
  c.fillStyle = C.ink; circle(c, -25, -14, 2.4); c.fill();
  if (carrying) { // 물고 있는 끈
    c.lineCap = 'round'; c.strokeStyle = C.ink; c.lineWidth = 8;
    c.beginPath(); c.moveTo(-42, -8); c.quadraticCurveTo(-52, 6, -40, 14); c.stroke();
    c.strokeStyle = '#f4cc3c'; c.lineWidth = 4.5; c.stroke(); c.lineCap = 'butt';
  }
  c.restore();
}

// 금색 테두리와 별(좋은 상태 부품)
function drawGoodMark(c, x, y, r, now) {
  c.save();
  c.strokeStyle = '#e0a800'; c.lineWidth = Math.max(3, r * 0.08);
  circle(c, x, y, r); c.stroke();
  c.fillStyle = '#ffd94a'; c.strokeStyle = C.ink; c.lineWidth = 2;
  [[0.75, -0.72], [-0.82, -0.5], [0.85, 0.55]].forEach(([dx, dy], i) => {
    const k = 0.7 + 0.3 * Math.sin((now || 0) / 200 + i * 2);
    drawStar(c, x + dx * r, y + dy * r, r * 0.22 * k);
  });
  c.restore();
}
function drawStar(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2, q = i % 2 ? r * 0.38 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath(); c.fill(); c.stroke();
}

// 단계 카드의 새 요소 그림
function drawStageIcon(c, kind) {
  if (kind === 'spot') { c.save(); c.translate(48, 46); c.scale(0.95, 0.95); drawHideSpot(c, 'box', false); c.restore(); }
  else if (PARTS[kind]) { c.save(); c.translate(48, 48); drawPart(c, kind, 80, { spin: 0.5 }); c.restore(); }
  else if (kind === 'villager') drawVillager(c, { x: 48, y: 50, color: '#6a9bd1', talked: true }, 0);
  else if (kind === 'trade') drawItem(c, 'jar', 48, 50, 1);
  else if (kind === 'chicken') drawChicken(c, 50, 48, 0.95, false, true);
  else if (kind === 'pull') {
    c.strokeStyle = '#d8362f'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(80, 22); c.lineTo(26, 70); c.stroke();
    c.lineCap = 'butt'; circle(c, 26, 70, 12); fillStroke(c, C.orange, 3.5);
    c.setLineDash([6, 8]); c.strokeStyle = C.ink; c.lineWidth = 4;
    c.beginPath(); c.moveTo(80, 22); c.lineTo(94, 10); c.stroke(); c.setLineDash([]);
  }
}

// 버튼 그림(24칸 기준 경로)
const ICON_PATHS = {
  play: 'M7 4l13 8-13 8z',
  next: 'M4 11h11l-4-5 2-1 7 7-7 7-2-1 4-5H4z',
  retry: 'M12 4a8 8 0 1 1-7.6 5.5l2.3.8A5.6 5.6 0 1 0 12 6.4V10L6.5 5.2 12 .5z',
  quiz: 'M12 2a6.5 6.5 0 0 1 3.8 11.8c-1.4 1-1.8 1.6-1.8 3.2H10c0-2.6 1-3.9 2.7-5.1a3 3 0 1 0-4.7-2.4H5.5A6.5 6.5 0 0 1 12 2zm-2 17h4v3h-4z',
  check: 'M4 12l2-2 4 4 8-8 2 2-10 10z',
  cross: 'M6 4l6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6z',
  book: 'M3 4c3 0 6 .5 9 2.5C15 4.500 18 4 21 4v15c-3 0-6 .5-9 2.5C9 19.500 6 19 3 19zm8 4c-2-1-4-1.300-6-1.500v10c2 .2 4 .5 6 1.500z',
  bag: 'M8 7a4 4 0 0 1 8 0h3l1 14H4L5 7zm2 0h4a2 2 0 0 0-4 0z',
  hand: 'M9 2a2 2 0 0 1 2 2v7h1V6a2 2 0 0 1 4 0v5h1V8a2 2 0 0 1 4 0v8c0 4-3 6-6 6h-3c-3 0-4-2-6-5l-3-4a2 2 0 0 1 3-2l1 1V4a2 2 0 0 1 2-2z',
  plane: 'M2 13l20-9-5 18-5-7-4 3v-5z',
  soundOn: 'M3 9h4l6-5v16l-6-5H3zm13-1a6 6 0 0 1 0 8l-1.500-1.500a4 4 0 0 0 0-5zm2.500-3a10 10 0 0 1 0 14L17 17.500a8 8 0 0 0 0-11z',
  soundOff: 'M3 9h4l6-5v16l-6-5H3zm12 0l2-2 2 2 2-2 1.500 1.500-2 2 2 2L21 14l-2-2-2 2-1.500-1.500 2-2z',
  speak: 'M3 4h18v12H10l-5 5v-5H3zm4 4v2h10V8zm0 4v2h7v-2z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h2v11H5V10zm2 0h6V7a3 3 0 0 0-6 0z',
  star: 'M12 2l3 7 7 .6-5.300 4.600L18.300 22 12 18l-6.300 4 1.600-7.800L2 9.600 9 9z',
  gear: 'M10 2h4l.5 3 2 .8 2.500-1.800 2.800 2.800-1.800 2.500.8 2 3 .5v4l-3 .5-.8 2 1.800 2.500-2.800 2.800-2.500-1.800-2 .8-.5 3h-4l-.5-3-2-.8L5 22 2.200 19.200 4 16.700l-.8-2-3-.5v-4l3-.5.8-2L2.200 5.200 5 2.400l2.500 1.800 2-.8zm2 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', ICON_PATHS[name] || '');
  p.setAttribute('fill', 'currentColor');
  s.append(p);
  return s;
}
let canvas, ctx, ui, bg, bgCtx, bgKind = '';

// ----- 이미지 미리 로딩 (실패하면 null → 도형으로 대체) -----
function loadImage(path) {
  return new Promise(resolve => {
    const img = new Image();
    // 화면에 그릴 때 끊기지 않도록 압축을 미리 풀어 둔다
    img.onload = () => { if (img.decode) img.decode().then(() => resolve(img), () => resolve(img)); else resolve(img); };
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function preload() {
  const files = [...new Set(Object.values(HAMO_IMG))];
  const jobs = files.map(async f => { images[f] = await loadImage('assets/hamo/' + f); });
  jobs.push((async () => { images.ayo = await loadImage('assets/ayo.png'); })());
  for (const key of Object.keys(BG_PHOTOS)) {
    jobs.push((async () => { images['bg:' + key] = await loadImage('assets/bg/' + BG_PHOTOS[key].file); })());
  }
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

// 아요(삵): assets/ayo.png가 있으면 이미지, 없으면 도형. h = 전체 높이, flip = 좌우 반전
function drawAyo(c, cx, cy, h, flip) {
  c.save();
  c.translate(cx, cy);
  if (flip) c.scale(-1, 1);
  const img = images.ayo;
  if (img) {
    const w = img.width * h / img.height;
    c.drawImage(img, -w / 2, -h / 2, w, h);
  } else drawAyoShape(c, h * 0.3);
  c.restore();
}

// 이미지가 없을 때의 아요: 주황 삵 + 이마 줄무늬 + 흰 진주 목걸이 (원점이 머리 가운데)
function drawAyoShape(c, r) {
  c.beginPath(); // 귀
  c.moveTo(-r * 0.85, -r * 0.35); c.lineTo(-r * 0.75, -r * 1.2); c.lineTo(-r * 0.15, -r * 0.85); c.closePath();
  fillStroke(c, C.orange, 3.5);
  c.beginPath();
  c.moveTo(r * 0.85, -r * 0.35); c.lineTo(r * 0.75, -r * 1.2); c.lineTo(r * 0.15, -r * 0.85); c.closePath();
  fillStroke(c, C.orange, 3.5);
  circle(c, 0, 0, r); fillStroke(c, C.orange, 3.5); // 머리
  // 이마 줄무늬
  c.strokeStyle = C.orangeDark; c.lineWidth = r * 0.12; c.lineCap = 'round';
  for (const dx of [-0.25, 0, 0.25]) {
    c.beginPath(); c.moveTo(r * dx, -r * 0.92); c.lineTo(r * dx, -r * 0.55); c.stroke();
  }
  c.lineCap = 'butt';
  // 입 주변, 눈, 코
  c.fillStyle = C.muzzle;
  c.beginPath(); c.ellipse(0, r * 0.42, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = C.ink;
  circle(c, -r * 0.38, -r * 0.05, r * 0.11); c.fill();
  circle(c, r * 0.38, -r * 0.05, r * 0.11); c.fill();
  circle(c, 0, r * 0.24, r * 0.08); c.fill();
  // 흰 진주 목걸이
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * (0.2 + 0.6 * i / 6);
    circle(c, Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02, r * 0.14);
    fillStroke(c, C.pearl, 2);
  }
}

// ----- 칸 조립 부품 그림: 원점이 칸 가운데, s = 칸 크기 -----
// opt.spin 회전날개 각도, opt.blow 풀무 바람, opt.roll 바퀴 각도, opt.wave 꼬리 물결
function drawPart(c, key, s, opt = {}) {
  const k = s / 100;
  c.save();
  c.scale(k, k);
  c.lineJoin = 'round';
  if (key === 'cockpit') {
    // 아요가 앉은 나무 조종석
    if (images.ayo) {
      const img = images.ayo, h = 92, w = img.width * h / img.height, srcH = img.height * 0.62;
      c.drawImage(img, 0, 0, img.width, srcH, 2 - w / 2, 4 - srcH * h / img.height, w, srcH * h / img.height);
    } else { c.save(); c.translate(2, -20); drawAyoShape(c, 22); c.restore(); }
    c.beginPath(); c.moveTo(-46, 0); c.lineTo(48, 0); c.quadraticCurveTo(44, 40, 20, 42); c.lineTo(-24, 42); c.quadraticCurveTo(-44, 40, -46, 0); c.closePath();
    fillStroke(c, C.wood, 5);
    c.strokeStyle = C.woodDark; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-38, 16); c.lineTo(40, 16); c.moveTo(-30, 30); c.lineTo(32, 30); c.stroke();
  } else if (key === 'frame') {
    // 대나무 틀: 네모 + 대각선, 마디
    c.lineCap = 'round';
    const stick = (x0, y0, x1, y1, w) => {
      c.strokeStyle = C.ink; c.lineWidth = w + 6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = C.bamboo; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    };
    stick(-38, -38, 38, 38, 7); stick(38, -38, -38, 38, 7);
    stick(-40, -40, 40, -40, 10); stick(-40, 40, 40, 40, 10); stick(-40, -40, -40, 40, 10); stick(40, -40, 40, 40, 10);
    c.fillStyle = C.bambooDark;
    for (const [x, y] of [[0, -40], [0, 40], [-40, 0], [40, 0]]) { c.fillRect(x - 3, y - 7, 6, 14); }
    c.lineCap = 'butt';
  } else if (key === 'wing') {
    // 한지 날개: 살대가 있는 돛 모양
    c.beginPath(); c.moveTo(-48, 30); c.lineTo(-44, -26); c.quadraticCurveTo(0, -48, 48, -30); c.lineTo(44, 26); c.quadraticCurveTo(0, 14, -48, 30); c.closePath();
    fillStroke(c, C.wing, 5);
    c.strokeStyle = C.woodDark; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); for (const x of [-22, 2, 26]) { c.moveTo(x, -36 + Math.abs(x) * 0.12); c.lineTo(x, 22 - Math.abs(x) * 0.1); } c.stroke();
    c.beginPath(); c.moveTo(-44, -2); c.quadraticCurveTo(0, -18, 46, -4); c.stroke();
    c.lineCap = 'butt';
  } else if (key === 'weight') {
    // 새끼줄로 묶은 납작한 돌
    c.beginPath(); c.moveTo(-40, 14); c.quadraticCurveTo(-42, -14, -14, -20); c.quadraticCurveTo(20, -26, 40, -8); c.quadraticCurveTo(46, 22, 18, 30); c.quadraticCurveTo(-30, 36, -40, 14); c.closePath();
    fillStroke(c, '#9b938a', 5);
    c.fillStyle = '#b7afa5'; c.beginPath(); c.ellipse(-14, -6, 14, 6, -0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7b736b'; circle(c, 18, 12, 4); c.fill(); circle(c, -22, 18, 3); c.fill();
    c.lineCap = 'round';
    c.strokeStyle = C.ink; c.lineWidth = 11; c.beginPath(); c.moveTo(-6, -24); c.quadraticCurveTo(-2, 4, -8, 32); c.stroke();
    c.strokeStyle = '#d9b46a'; c.lineWidth = 6; c.stroke();
    c.strokeStyle = C.ink; c.lineWidth = 5; c.beginPath(); c.moveTo(-6, -24); c.lineTo(-6, -44); c.stroke();
    c.lineCap = 'butt';
  } else if (key === 'rotor') {
    // 대나무 회전날개(대나무 잠자리)
    const a = opt.spin || 0, cos = Math.cos(a);
    c.lineCap = 'round';
    c.strokeStyle = C.ink; c.lineWidth = 13; c.beginPath(); c.moveTo(0, -18); c.lineTo(0, 44); c.stroke();
    c.strokeStyle = C.bamboo; c.lineWidth = 7; c.beginPath(); c.moveTo(0, -18); c.lineTo(0, 44); c.stroke();
    for (const side of [1, -1]) {
      const len = 44 * Math.abs(cos) + 6;
      c.beginPath(); c.ellipse(side * cos * 24, -24, len / 2, 9, 0, 0, Math.PI * 2);
      fillStroke(c, side * cos > 0 ? C.bamboo : C.bambooDark, 4);
    }
    circle(c, 0, -24, 7); fillStroke(c, C.woodDark, 3);
    c.lineCap = 'butt';
  } else if (key === 'bellows') {
    // 풀무(바람 주머니): 주름 + 뒤쪽 바람 구멍
    if (opt.blow) {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      const t = (opt.blowT || 0) % 1;
      for (let i = 0; i < 3; i++) { const d = ((t + i / 3) % 1); circle(c, -56 - d * 40, (i - 1) * 10, 8 + d * 10); c.fill(); }
    }
    c.beginPath(); c.moveTo(-52, -6); c.lineTo(-38, -10); c.lineTo(-38, 10); c.lineTo(-52, 6); c.closePath(); fillStroke(c, C.woodDark, 4);
    c.beginPath(); c.moveTo(-38, -20); c.lineTo(30, -36); c.lineTo(30, 36); c.lineTo(-38, 20); c.closePath(); fillStroke(c, '#b88a5a', 5);
    c.strokeStyle = C.woodDark; c.lineWidth = 4;
    c.beginPath(); for (const x of [-20, -2, 16]) { const h = 22 + (x + 38) * 0.21; c.moveTo(x, -h); c.lineTo(x + 6, 0); c.lineTo(x, h); } c.stroke();
    roundBox(c, 28, -42, 16, 84, 6); fillStroke(c, C.wood, 4);
  } else if (key === 'wheel') {
    const a = opt.roll || 0;
    circle(c, 0, 0, 38); fillStroke(c, '#8a5a36', 5);
    circle(c, 0, 0, 28); c.fillStyle = C.woodLight; c.fill(); c.lineWidth = 3; c.strokeStyle = C.ink; c.stroke();
    c.strokeStyle = '#6b4426'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); for (let i = 0; i < 6; i++) { const r = a + i * Math.PI / 3; c.moveTo(0, 0); c.lineTo(Math.cos(r) * 27, Math.sin(r) * 27); } c.stroke();
    circle(c, 0, 0, 9); fillStroke(c, C.woodDark, 3);
    c.lineCap = 'butt';
  } else if (key === 'tail') {
    // 연 꼬리: 물결치는 끈과 리본
    const w = opt.wave || 0;
    const yAt = x => Math.sin(x / 16 + w) * 10 * (40 - x) / 80;
    c.lineCap = 'round';
    c.strokeStyle = C.ink; c.lineWidth = 9; c.beginPath(); for (let x = 46; x >= -48; x -= 6) { if (x === 46) c.moveTo(x, yAt(x)); else c.lineTo(x, yAt(x)); } c.stroke();
    c.strokeStyle = '#f4cc3c'; c.lineWidth = 4; c.stroke();
    for (const x of [22, -6, -34]) {
      const y = yAt(x);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 12, y - 14); c.lineTo(x - 12, y + 14); c.closePath(); fillStroke(c, '#e0795b', 3);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y - 14); c.lineTo(x + 12, y + 14); c.closePath(); fillStroke(c, '#e0795b', 3);
    }
    c.lineCap = 'butt';
  }
  c.restore();
}

// 조립한 탈것 전체: (x, y) = 무게중심 위치, s = 칸 크기, pitch = 기울기(도, 고개 듦이 +)
function drawCraft(c, grid, x, y, s, pitch, opt = {}) {
  const info = opt.info || analyzeCraft(grid);
  c.save();
  c.translate(x, y);
  c.rotate(-(pitch || 0) * Math.PI / 180);
  const ox = -info.xcg * s, oy = info.ycg * s;
  const at = (r, cc) => [ox + cellX(cc) * s, oy - cellY(r) * s];
  // 이웃한 부품을 잇는 대나무 막대
  c.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    c.strokeStyle = pass ? C.bamboo : C.ink; c.lineWidth = s * (pass ? 0.07 : 0.12);
    c.beginPath();
    for (let r = 0; r < GRID.rows; r++) for (let cc = 0; cc < GRID.cols; cc++) {
      if (!grid[r][cc]) continue;
      const [x0, y0] = at(r, cc);
      if (cc + 1 < GRID.cols && grid[r][cc + 1]) { const [x1, y1] = at(r, cc + 1); c.moveTo(x0, y0); c.lineTo(x1, y1); }
      if (r + 1 < GRID.rows && grid[r + 1][cc]) { const [x1, y1] = at(r + 1, cc); c.moveTo(x0, y0); c.lineTo(x1, y1); }
    }
    c.stroke();
  }
  c.lineCap = 'butt';
  // 조종석(아요)은 맨 위에 그린다
  for (const front of [false, true]) {
    for (let r = 0; r < GRID.rows; r++) for (let cc = 0; cc < GRID.cols; cc++) {
      const key = grid[r][cc];
      if (!key || (key === 'cockpit') !== front) continue;
      const [px0, py0] = at(r, cc);
      c.save(); c.translate(px0, py0); drawPart(c, key, s, opt); c.restore();
    }
  }
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

// 사진 배경: 비율을 유지한 채 화면을 꽉 채운다(cover). 사진이 없으면 false를 돌려준다.
// areaH = 채울 높이, focusX = 화면 가운데에 올 사진 가로 위치(비행 화면에서 모드별로 지정)
function drawPhoto(c, key, areaH, focusX) {
  const img = images['bg:' + key];
  if (!img) return false;
  const p = BG_PHOTOS[key], iw = img.width, ih = img.height;
  let s = Math.max(W / iw, areaH / ih), y;
  if (p.bankY) {
    // 사진 속 강둑이 GROUND_Y에 오도록 맞춘다
    s = Math.max(s, GROUND_Y / (p.bankY * ih), (areaH - GROUND_Y) / ((1 - p.bankY) * ih));
    y = GROUND_Y - p.bankY * ih * s;
  } else {
    y = clamp(areaH / 2 - p.focusY * ih * s, areaH - ih * s, 0);
  }
  const x = clamp(W / 2 - (focusX === undefined ? p.focusX : focusX) * iw * s, W - iw * s, 0);
  c.save();
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, x, y, iw * s, ih * s);
  // 그림과 어울리게 채도를 낮추고 흰 막을 씌운다
  c.globalCompositeOperation = 'saturation';
  c.globalAlpha = BG_DESATURATE;
  c.fillStyle = '#808080'; c.fillRect(0, 0, W, areaH);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = BG_OVERLAY;
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, areaH);
  c.restore();
  return true;
}

// 사진 위에서도 읽히도록 흰 테두리를 두른 글자
function haloText(c, text, x, y) {
  c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = '#ffffff';
  c.strokeText(text, x, y);
  c.fillText(text, x, y);
}

// 타이틀·이야기 배경: 사진이 있으면 사진, 없으면 기존 그림
function renderPhotoBg(c, key) {
  if (!drawPhoto(c, key, H)) renderLandscape(c, false);
}

// challenge: 도전 모드 비행 배경이면 목표 거리(왼쪽이 진주성, 오른쪽이 성 밖)
function renderLandscape(c, withRuler, challenge) {
  const w = CONFIG.world, f = CRAFT_FLIGHT;
  const bottom = withRuler ? RULER_Y : H;
  // 비행 화면: 사진은 배경으로만 쓰고 언덕·모래밭·눈금은 그 위에 그린다
  const photo = withRuler && drawPhoto(c, 'flight', bottom, challenge ? BG_PHOTOS.flight.focusXChallenge : BG_PHOTOS.flight.focusX);
  const gx = px(100);
  if (!photo) {
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
  if (!challenge) {
    const wallL = px(70), wallR = W;
    c.fillStyle = C.wall; c.fillRect(wallL, GROUND_Y - 62, wallR - wallL, 62);
    c.fillStyle = C.wallDark;
    for (let x = wallL; x < wallR; x += 44) c.fillRect(x, GROUND_Y - 78, 26, 18);
    c.fillStyle = '#b5543f'; c.fillRect(gx - 74, GROUND_Y - 150, 12, 90); c.fillRect(gx + 62, GROUND_Y - 150, 12, 90); c.fillRect(gx - 6, GROUND_Y - 150, 12, 90);
    c.fillStyle = C.roof;
    c.beginPath(); c.moveTo(gx - 120, GROUND_Y - 138); c.quadraticCurveTo(gx - 60, GROUND_Y - 158, gx - 50, GROUND_Y - 205);
    c.lineTo(gx + 50, GROUND_Y - 205); c.quadraticCurveTo(gx + 60, GROUND_Y - 158, gx + 120, GROUND_Y - 138); c.closePath(); c.fill();
  }

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
  } // 사진이 없을 때 그리는 부분 끝

  // 건너편 모래밭
  c.save();
  if (photo) c.globalAlpha = FLIGHT_SAND_ALPHA;
  c.fillStyle = C.sand;
  c.beginPath(); c.moveTo(px(w.riverEnd) - 26, bottom);
  c.quadraticCurveTo(px(w.riverEnd) - 18, GROUND_Y + 8, px(w.riverEnd) + 16, GROUND_Y - 4);
  c.lineTo(W, GROUND_Y - 4); c.lineTo(W, bottom); c.closePath(); c.fill();
  c.restore();
  c.fillStyle = C.sandDark;
  for (let x = px(w.riverEnd) + 60; x < W; x += 170) { circle(c, x, GROUND_Y + 50, 7); c.fill(); circle(c, x + 80, GROUND_Y + 92, 5); c.fill(); }

  // 망진산
  const topY = py(f.launchHeight - f.groundClearance);
  const foot = px(w.riverStart) - 8;
  c.save();
  if (photo) c.globalAlpha = FLIGHT_HILL_ALPHA;
  c.fillStyle = C.hillDark;
  c.beginPath(); c.moveTo(0, bottom); c.lineTo(0, topY + 90);
  c.lineTo(px(-10), topY + 90); c.bezierCurveTo(px(2), topY + 90, foot - 60, GROUND_Y - 60, foot + 24, bottom); c.closePath(); c.fill();
  c.fillStyle = C.hill;
  c.beginPath(); c.moveTo(0, bottom); c.lineTo(0, topY + 22);
  c.quadraticCurveTo(px(-14), topY - 6, px(1), topY);
  c.bezierCurveTo(px(7), topY + 80, foot - 70, GROUND_Y - 100, foot - 6, bottom); c.closePath(); c.fill();
  c.restore();
  // 발사대
  c.fillStyle = C.wood; c.strokeStyle = C.ink; c.lineWidth = 4;
  c.beginPath(); c.moveTo(px(-13), topY + 2); c.lineTo(px(2), topY - 10); c.lineTo(px(2), topY + 4); c.lineTo(px(-13), topY + 16); c.closePath(); c.fill(); c.stroke();

  if (withRuler) {
    c.fillStyle = C.ink;
    c.font = '800 52px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    const label = photo ? haloText : (cc, t, x, y) => cc.fillText(t, x, y);
    label(c, challenge ? TEXT.castle : TEXT.hill, 24, topY + 130);
    // 사진에서는 진주성 이름을 촉석루 지붕 위에 쓴다
    if (!challenge) { c.fillStyle = C.ink; label(c, TEXT.castle, gx - 78, photo ? GROUND_Y - 340 : GROUND_Y - 30); }
    c.fillStyle = '#1f5f5a'; // 강 이름은 추락 장면과 겹치지 않게 모래밭 쪽에
    label(c, '← ' + TEXT.river, px(w.riverEnd) + 24, GROUND_Y + 66);
    if (challenge) renderGoal(c, topY, photo, challenge);
    renderRuler(c);
  }
}

// 도전 모드: 산 위의 성벽과 목표 지점 깃발
function renderGoal(c, topY, photo, goal) {
  c.fillStyle = C.wall; c.fillRect(0, topY - 66, px(-15), 100);
  c.fillStyle = C.wallDark;
  for (let x = 6; x < px(-15) - 20; x += 44) c.fillRect(x, topY - 84, 26, 18);

  const gx = px(goal);
  c.save();
  if (photo) c.globalAlpha = FLIGHT_SAND_ALPHA;
  c.fillStyle = '#fbf0c6'; // 목표 지점부터 모래밭 색을 밝게
  c.fillRect(gx, GROUND_Y - 4, W - gx, RULER_Y - GROUND_Y + 4);
  c.restore();
  c.fillStyle = C.ink; c.fillRect(gx - 4, GROUND_Y - 230, 8, 234);
  c.beginPath(); c.moveTo(gx + 4, GROUND_Y - 230); c.lineTo(gx + 124, GROUND_Y - 192); c.lineTo(gx + 4, GROUND_Y - 154); c.closePath();
  fillStroke(c, C.orange);
  c.fillStyle = C.ink; c.font = '800 50px system-ui, sans-serif';
  c.textAlign = 'left'; c.textBaseline = 'middle';
  const label = photo ? haloText : (cc, t, x, y) => cc.fillText(t, x, y);
  label(c, TEXT.goalFlag, gx + 16, GROUND_Y - 110);
  label(c, `${goal}m`, gx + 16, GROUND_Y - 54);
}

// 스테이지 목표: 거리면 깃발, 높이면 점선
function renderStageGoal(c, stage) {
  if (!stage) return;
  const g = stage.goal, T = STAGE_MODE_TEXT;
  c.fillStyle = C.ink; c.font = '800 48px system-ui, sans-serif'; c.textBaseline = 'middle';
  if (g.type === 'height') {
    const y = py(g.value);
    c.strokeStyle = C.orangeDark; c.lineWidth = 7; c.setLineDash([26, 18]);
    c.beginPath(); c.moveTo(px(-8), y); c.lineTo(W, y); c.stroke();
    c.setLineDash([]);
    c.textAlign = 'right';
    haloText(c, `${T.goalHeightLabel} ${g.value}m`, W - 24, y - 40);
    return;
  }
  const gx = px(g.value);
  c.fillStyle = C.ink; c.fillRect(gx - 4, GROUND_Y - 230, 8, 234);
  c.beginPath(); c.moveTo(gx + 4, GROUND_Y - 230); c.lineTo(gx + 124, GROUND_Y - 192); c.lineTo(gx + 4, GROUND_Y - 154); c.closePath();
  fillStroke(c, C.orange);
  c.fillStyle = C.ink; c.textAlign = 'left';
  haloText(c, T.goalFlag, gx + 16, GROUND_Y - 110);
  haloText(c, `${g.value}m`, gx + 16, GROUND_Y - 54);
}

// 하늘의 별 상자(원점이 가운데). open = 지나감
function drawStarBox(c, x, y, now, open) {
  const bob = open ? 0 : Math.sin(now / 300) * 6;
  c.save();
  c.translate(x, y + bob);
  roundBox(c, -40, -30, 80, 60, 10); fillStroke(c, open ? '#fff4c2' : '#c8553d', 5);
  if (!open) { c.strokeStyle = '#8a2f1f'; c.lineWidth = 4; c.beginPath(); c.moveTo(-40, -6); c.lineTo(40, -6); c.stroke(); }
  star5(c, 0, open ? -48 : 2, open ? 34 : 22, open ? '#f0b400' : '#ffd94a');
  c.restore();
}
// 다섯 꼭짓점 별
function star5(c, x, y, r, fill) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
  fillStroke(c, fill, 4);
}

// 도전 모드: 위에서 본 진주성 지도
function renderCastleMap(c) {
  c.fillStyle = C.hill; c.fillRect(0, 0, W, H);
  // 남강과 가방 자리
  c.fillStyle = C.river; c.fillRect(0, 830, W, 82);
  c.strokeStyle = C.riverLine; c.lineWidth = 5; c.lineCap = 'round';
  for (let x = 40; x < W; x += 150) {
    if (x > 850 && x < 1040) continue; // 강 이름 자리
    const yy = 858 + (x % 300 ? 26 : 0);
    c.beginPath(); c.moveTo(x, yy); c.quadraticCurveTo(x + 24, yy - 12, x + 48, yy); c.stroke();
  }
  c.lineCap = 'butt';
  c.fillStyle = '#1f5f5a'; c.font = '800 50px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(TEXT.river, 960, 872);
  c.fillStyle = C.paper; c.fillRect(0, 912, W, H - 912);
  c.fillStyle = C.ink; c.fillRect(0, 910, W, 4);

  // 성벽과 성 안 땅
  roundBox(c, 60, 100, 1800, 730, 24); fillStroke(c, C.wall, 5);
  c.fillStyle = C.wallDark;
  for (let x = 90; x < 1800; x += 60) { c.fillRect(x, 108, 34, 20); c.fillRect(x, 800, 34, 20); }
  for (let y = 150; y < 790; y += 60) { c.fillRect(68, y, 20, 34); c.fillRect(1832, y, 20, 34); }
  const a = CHALLENGE.walkArea;
  c.fillStyle = '#e4f2bd'; c.fillRect(a.x, a.y, a.w, a.h);
  c.strokeStyle = C.ink; c.lineWidth = 4; c.strokeRect(a.x, a.y, a.w, a.h);
  c.fillStyle = '#f4e9c2'; c.fillRect(a.x + 2, 410, a.w - 4, 110); // 가운데 길
  for (const f of MAP_FENCES) { // 담장
    c.fillStyle = '#c9a77c'; c.fillRect(f.x, f.y, f.w, f.h);
    c.strokeStyle = C.ink; c.lineWidth = 3; c.strokeRect(f.x, f.y, f.w, f.h);
  }

  for (const p of [...MAP_PLACES, ...MAP_DECOR]) renderPlace(c, p);
}

function renderPlace(c, p) {
  if (p.kind !== 'label') { roundBox(c, p.x, p.y, p.w, p.h, 18); fillStroke(c, p.color); }
  c.strokeStyle = C.ink; c.lineWidth = 3;
  if (p.kind === 'label') {
    // 이름표만
  } else if (p.kind === 'forest') {           // 대나무 줄기
    c.lineWidth = 9; c.strokeStyle = '#5f9a4a'; c.lineCap = 'round';
    for (let x = p.x + 30; x < p.x + p.w - 10; x += 46) {
      c.beginPath(); c.moveTo(x, p.y + 16); c.lineTo(x, p.y + p.h - 16); c.stroke();
    }
    c.lineCap = 'butt';
  } else if (p.kind === 'pavilion') {  // 촉석루 지붕
    c.strokeRect(p.x + 26, p.y + 22, p.w - 52, p.h - 44);
    c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + 26, p.y + 22); c.moveTo(p.x + p.w, p.y); c.lineTo(p.x + p.w - 26, p.y + 22);
    c.moveTo(p.x, p.y + p.h); c.lineTo(p.x + 26, p.y + p.h - 22); c.moveTo(p.x + p.w, p.y + p.h); c.lineTo(p.x + p.w - 26, p.y + p.h - 22); c.stroke();
  } else {                             // 지붕 용마루
    c.beginPath(); c.moveTo(p.x + 14, p.y + 28); c.lineTo(p.x + p.w - 14, p.y + 28); c.stroke();
  }
  // 이름표
  c.font = '800 50px system-ui, sans-serif';
  const tw = c.measureText(p.name).width + 36;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + 8;
  roundBox(c, cx - tw / 2, cy - 38, tw, 74, 14); fillStroke(c, C.paper, 3);
  c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(p.name, cx, cy);
}

// 부품 아이콘 (원점이 가운데, 약 60px 크기)
function drawItem(c, type, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  if (PARTS[type]) {
    drawPart(c, type, 70, { spin: 0.5 }); // 조립 부품은 조립 화면과 같은 그림
  } else if (type === 'record') {
    roundBox(c, -24, -28, 48, 56, 4); fillStroke(c, '#f3e1b5', 3);
    c.strokeStyle = C.woodDark; c.lineWidth = 3;
    c.beginPath(); for (const yy of [-14, -2, 10]) { c.moveTo(-14, yy); c.lineTo(14, yy); } c.stroke();
  } else if (type === 'jar') {
    c.beginPath(); c.moveTo(-12, -26); c.quadraticCurveTo(-34, -4, -20, 28); c.lineTo(20, 28); c.quadraticCurveTo(34, -4, 12, -26); c.closePath();
    fillStroke(c, '#8a5a36', 3);
    c.beginPath(); c.ellipse(0, -26, 14, 5, 0, 0, Math.PI * 2); fillStroke(c, '#a97f52', 3);
  } else if (type === 'pot') {
    c.beginPath(); c.moveTo(-32, -8); c.quadraticCurveTo(-30, 26, 0, 26); c.quadraticCurveTo(30, 26, 32, -8); c.closePath();
    fillStroke(c, '#5a5f66', 3);
    c.beginPath(); c.moveTo(-38, -10); c.lineTo(38, -10); c.lineWidth = 6; c.strokeStyle = C.ink; c.stroke();
    c.beginPath(); c.moveTo(-14, -12); c.quadraticCurveTo(0, -30, 14, -12); c.closePath(); fillStroke(c, '#7c828a', 3);
  }
  c.restore();
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

// 숨김 장소 그림 (원점이 가운데, 약 80px 크기)
function drawHideSpot(c, kind, opened) {
  const dark = '#3f3026';
  if (kind === 'box') {
    if (opened) { c.save(); c.translate(-6, -30); c.rotate(-0.5); roundBox(c, -36, -9, 72, 16, 4); fillStroke(c, '#c49a68', 3); c.restore(); }
    roundBox(c, -36, -18, 72, 54, 5); fillStroke(c, opened ? dark : C.wood, 3);
    if (opened) { c.fillStyle = C.wood; c.fillRect(-34, 10, 68, 24); c.strokeStyle = C.ink; c.lineWidth = 3; c.strokeRect(-36, 10, 72, 26); }
    else { c.strokeStyle = C.woodDark; c.lineWidth = 4; c.beginPath(); c.moveTo(-36, -2); c.lineTo(36, -2); c.moveTo(0, -2); c.lineTo(0, 36); c.stroke(); }
  } else if (kind === 'straw') {
    c.beginPath(); c.moveTo(-42, 32);
    if (opened) { c.quadraticCurveTo(-30, 6, -10, 22); c.quadraticCurveTo(12, 4, 42, 32); }
    else { c.quadraticCurveTo(-30, -36, 0, -36); c.quadraticCurveTo(30, -36, 42, 32); }
    c.closePath(); fillStroke(c, '#e7c95f', 3);
    c.strokeStyle = '#b8972f'; c.lineWidth = 3; c.beginPath();
    for (const x of [-22, -8, 8, 22]) { c.moveTo(x, 28); c.lineTo(x * (opened ? 1.1 : 0.55), opened ? 18 : -16); }
    c.stroke();
    if (opened) { c.beginPath(); c.ellipse(2, 24, 16, 6, 0, 0, Math.PI * 2); c.fillStyle = dark; c.fill(); }
  } else if (kind === 'basket') {
    c.beginPath(); c.moveTo(-34, -6); c.lineTo(34, -6); c.lineTo(24, 34); c.lineTo(-24, 34); c.closePath(); fillStroke(c, '#d6b26f', 3);
    c.strokeStyle = '#a07f3f'; c.lineWidth = 3; c.beginPath();
    for (const yy of [6, 20]) { c.moveTo(-30, yy); c.lineTo(30, yy); }
    for (const x of [-14, 0, 14]) { c.moveTo(x, -6); c.lineTo(x * 0.8, 34); }
    c.stroke();
    if (opened) {
      c.beginPath(); c.ellipse(0, -6, 34, 9, 0, 0, Math.PI * 2); fillStroke(c, dark, 3);
      c.save(); c.translate(36, -28); c.rotate(0.5); c.beginPath(); c.ellipse(0, 0, 26, 8, 0, 0, Math.PI * 2); fillStroke(c, '#d6b26f', 3); c.restore();
    } else { c.beginPath(); c.ellipse(0, -8, 36, 13, 0, 0, Math.PI * 2); fillStroke(c, '#c9a35e', 3); }
  } else { // jar 항아리, crock 장독
    const crock = kind === 'crock', w = crock ? 42 : 32, top = crock ? 24 : 15;
    c.beginPath(); c.moveTo(-top, -24); c.quadraticCurveTo(-w - 10, 4, -w * 0.6, 34); c.lineTo(w * 0.6, 34); c.quadraticCurveTo(w + 10, 4, top, -24); c.closePath();
    fillStroke(c, crock ? '#6d4a2f' : '#8a5a36', 3);
    if (opened) {
      c.beginPath(); c.ellipse(0, -24, top, 7, 0, 0, Math.PI * 2); fillStroke(c, dark, 3);
      c.save(); c.translate(top + 26, 24); c.rotate(0.3); c.beginPath(); c.ellipse(0, 0, top, 7, 0, 0, Math.PI * 2); fillStroke(c, '#a97f52', 3); c.restore();
    } else {
      c.beginPath(); c.ellipse(0, -26, top + 4, 9, 0, 0, Math.PI * 2); fillStroke(c, '#a97f52', 3);
      circle(c, 0, -34, 5); fillStroke(c, '#a97f52', 2.5);
    }
  }
}

// 마을 사람: 단순한 사람 모양, 아직 이야기 안 했으면 말풍선
function drawVillager(c, v, now) {
  c.beginPath(); c.moveTo(v.x - 22, v.y + 36); c.lineTo(v.x - 15, v.y); c.lineTo(v.x + 15, v.y); c.lineTo(v.x + 22, v.y + 36); c.closePath();
  fillStroke(c, v.color, 3);
  circle(c, v.x, v.y - 14, 18); fillStroke(c, '#f5d7b0', 3);
  c.fillStyle = C.ink;
  circle(c, v.x - 6, v.y - 15, 2.5); c.fill(); circle(c, v.x + 6, v.y - 15, 2.5); c.fill();
  if (!v.talked) {
    const by = v.y - 66 + Math.sin(now / 350) * 3;
    if (v.trade) {
      roundBox(c, v.x - 34, by - 42, 68, 62, 14); fillStroke(c, '#ffffff', 3);
      c.beginPath(); c.moveTo(v.x - 7, by + 19); c.lineTo(v.x, by + 30); c.lineTo(v.x + 7, by + 19); c.closePath(); c.fillStyle = '#fff'; c.fill();
      drawItem(c, v.trade.want, v.x, by - 11, 0.72);
    } else {
      roundBox(c, v.x - 26, by - 18, 52, 34, 12); fillStroke(c, '#ffffff', 3);
      c.beginPath(); c.moveTo(v.x - 6, by + 15); c.lineTo(v.x, by + 25); c.lineTo(v.x + 6, by + 15); c.closePath(); c.fillStyle = '#fff'; c.fill();
      c.fillStyle = C.ink;
      for (const dx of [-11, 0, 11]) { circle(c, v.x + dx, by, 3); c.fill(); }
    }
  }
}

function setBg(kind) {
  if (bgKind === kind) return;
  bgKind = kind;
  resetTransform(bgCtx);
  if (kind === 'title' || kind === 'story') renderPhotoBg(bgCtx, kind);
  else if (kind === 'flight') renderLandscape(bgCtx, true);
  else if (kind.startsWith('flightC')) renderLandscape(bgCtx, true, Number(kind.slice(7)));
  else if (kind.startsWith('stage')) { renderLandscape(bgCtx, true); renderStageGoal(bgCtx, STAGES[Number(kind.slice(5)) - 1]); }
  else if (kind === 'castle') renderCastleMap(bgCtx);
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

// iconName: ICON_PATHS의 이름(버튼은 글자 + 그림)
function button(className, text, onTap, iconName) {
  const b = el('button', 'btn abs ' + className);
  b.type = 'button';
  if (iconName) b.append(icon(iconName));
  b.labelEl = el('span', '', text);
  b.append(b.labelEl);
  b.addEventListener('click', e => { sfx.play('tap'); onTap(e); });
  return b;
}

// =============================================================
// 3. 화면별 함수
// =============================================================
const screens = {};

function go(name, arg) {
  game.screen = name;
  game.tut = null;
  lastSpoken = '';
  ui.replaceChildren();
  // 비행 화면에서는 터치 끌기가 스크롤로 끊기지 않게 한다
  document.getElementById('stage').classList.toggle('flying', name === 'flight' || name === 'build');
  ui.className = '';
  screens[name].enter(arg);
  if (name !== 'title' && game.screen === name) ui.append(homeButton());
  game.dirty = true;
}

// 타이틀을 뺀 모든 화면 왼쪽 위의 [처음으로]
function homeButton() {
  const b = el('button', 'home-btn');
  b.type = 'button';
  const pic = el('canvas');
  pic.width = 72; pic.height = 72;
  const c = pic.getContext('2d');
  c.beginPath(); c.moveTo(36, 8); c.lineTo(66, 36); c.lineTo(56, 36); c.lineTo(56, 64); c.lineTo(16, 64); c.lineTo(16, 36); c.lineTo(6, 36); c.closePath();
  c.fillStyle = '#f28c38'; c.fill(); c.lineWidth = 5; c.lineJoin = 'round'; c.strokeStyle = '#3b3a36'; c.stroke();
  c.fillStyle = '#3b3a36'; c.fillRect(29, 42, 14, 22);
  b.append(pic, el('span', '', TEXT.home));
  b.addEventListener('click', () => {
    if (game.screen === 'collect') { b.blur(); screens.collect.askQuit(); }
    else goHome();
  });
  return b;
}

// 다른 모드로 바로 간다
function switchMode(mode) {
  game.mode = mode;
  game.history = [];
  game.parts = null;
  game.collect = null;
  game.goodbye = false;
  if (mode === 'challenge') { startChallenge(); return; }
  game.grid = null; game.buildRules = null; game.stageDef = null; game.autoLaunch = false;
  game.isRetry = false;
  go('stagePick');
}

// 새 손님을 위해 판 기록과 선택을 비운다
function newSession() {
  game.history = [];
  game.grid = null; game.buildRules = null; game.stageDef = null; game.autoLaunch = false;
  game.isRetry = false;
  game.mode = 'easy';
  game.parts = null;
  game.collect = null;
  if (TUTORIALS.resetOnTitle) game.tutSeen.clear();
}

// 도전 모드 시작: 관리자가 단계를 고정했으면 바로 그 단계로
function startChallenge() {
  game.goodbye = false;
  game.mode = 'challenge';
  if (progress.fixed) { game.stage = progress.fixed; go('challengeIntro'); }
  else go('stages');
}

function goHome() {
  newSession();
  game.goodbye = true;
  go('title');
}

function twoLineButton(className, main, sub, onTap, iconName) {
  const b = button(className, main, onTap, iconName);
  b.append(el('small', '', sub));
  return b;
}

// 오늘의 기록 한 칸(모드별)
function topColumn(title, mode) {
  const col = el('section');
  col.append(el('h3', '', title));
  const top = loadTop(mode);
  if (top.length === 0) col.append(el('p', 'empty', TEXT.topEmpty));
  else {
    const ol = el('ol');
    top.forEach((r, i) => {
      const li = el('li');
      li.append(el('span', 'rank', `${i + 1}위`), el('span', '', `${r.distance}m`));
      ol.append(li);
    });
    col.append(ol);
  }
  return col;
}

// ----- title -----
screens.title = {
  enter() {
    setBg('title');
    const sign = el('h1', 'sheet abs title-sign', TEXT.title);
    // 관리자 설정: 로고를 빠르게 5번 누르면 단계 고정 메뉴
    let taps = 0, lastTap = 0;
    sign.addEventListener('click', () => {
      const now = performance.now();
      taps = now - lastTap < 1500 ? taps + 1 : 1;
      lastTap = now;
      if (taps >= 5) { taps = 0; this.openAdmin(); }
    });
    ui.append(sign);

    const panel = el('div', 'sheet abs top-panel');
    panel.append(el('h2', '', TEXT.topTitle));
    const cols = el('div', 'top-cols');
    cols.append(topColumn(TEXT.startEasy, 'easy'), topColumn(TEXT.startChallenge, 'challenge'));
    panel.append(cols);
    ui.append(panel);

    ui.append(el('div', 'bubble title-bubble', game.goodbye ? TEXT.titleBye : TEXT.titleHello));
    ui.append(this.toggleRow());
    ui.append(twoLineButton('primary start-btn start-easy', TEXT.startEasy, TEXT.startEasySub, () => {
      game.goodbye = false;
      game.mode = 'easy';
      go('story');
    }, 'plane'));
    ui.append(twoLineButton('start-btn start-hard', TEXT.startChallenge, TEXT.startChallengeSub, startChallenge, 'star'));
    const n = loadRecords().length;
    ui.append(button('records-btn', `${RECORD_TEXT.bookButton} (${n}/${RECORD_CARDS.length})`, () => go('records'), 'book'));
    refreshVoiceNote();
  },
  // 쉬운 모드 조종 / 소리 / 읽어주기
  toggleRow() {
    const T = CONTROL_TEXT, row = el('div', 'toggle-row');
    const make = (text, iconName, onTap) => {
      const b = button('toggle-btn', text, () => { onTap(); saveSaved(SETTINGS_KEY, settings); go('title'); }, iconName);
      row.append(b);
      return b;
    };
    const easy = make(settings.easyControl ? T.easyControl : T.easyAuto, settings.easyControl ? 'hand' : 'plane', () => { settings.easyControl = !settings.easyControl; });
    easy.labelEl.prepend(el('small', '', TEXT.startEasy));
    make(settings.sound ? T.soundOff : T.soundOn, settings.sound ? 'soundOn' : 'soundOff', () => { settings.sound = !settings.sound; });
    if (canSpeak()) make(settings.speak ? T.speakOff : T.speakOn, 'speak', () => { settings.speak = !settings.speak; if (!settings.speak) stopSpeaking(); });
    return row;
  },
  openAdmin() {
    const S = STAGE_TEXT, back = el('div', 'confirm-back admin-back');
    const box = el('div', 'sheet admin-box');
    box.append(el('h2', '', S.adminTitle));
    const grid = el('div', 'admin-grid');
    const choose = (label, value, cls) => {
      const b = button((progress.fixed === value ? 'primary ' : '') + (cls || ''), label, () => { progress.fixed = value; saveSaved(PROGRESS_KEY, progress); back.remove(); }, progress.fixed === value ? 'check' : undefined);
      grid.append(b);
    };
    choose(S.adminAuto, null);
    CHALLENGE_LEVELS.forEach(st => choose(S.adminFixed.replace('{name}', st.name), st.id));
    grid.append(button('', S.adminReset, () => {
      progress.unlocked = 1; progress.fixed = null; progress.allStages = false; saveSaved(PROGRESS_KEY, progress);
      try { localStorage.removeItem(STAR_KEY); } catch (e) { /* 무시 */ }
      memoryStars = {};
      try { localStorage.removeItem(RECORD_KEY); } catch (e) { /* 무시 */ }
      memoryRecords = [];
      go('title');
    }, 'retry'));
    grid.append(button(progress.allStages ? 'primary' : '', STAGE_MODE_TEXT.allOpen, () => { progress.allStages = !progress.allStages; saveSaved(PROGRESS_KEY, progress); back.remove(); }, progress.allStages ? 'check' : 'star'));
    grid.append(button('', S.adminClose, () => back.remove(), 'cross'));
    box.append(grid);
    back.append(box);
    ui.append(back);
  },
  draw(now) {
    drawBg();
    const bob = Math.sin(now / 600) * 10;
    if (!this.craft) this.craft = gridFromRows(FREE_RECOMMEND);
    drawCraft(ctx, this.craft, 1010, 588 + bob, 84, 4, { wave: now / 200 });
    drawHamo(ctx, 'title', 240, 595, 400, 470);
  },
  animated: true,
};

// ----- stages: 단계 선택 -----
screens.stages = {
  enter() {
    setBg('paper');
    const S = STAGE_TEXT;
    ui.append(el('h2', 'abs stages-title', S.title));
    const row = el('div', 'stage-row');
    for (const st of CHALLENGE_LEVELS) {
      const locked = st.id > progress.unlocked;
      const card = el('button', 'stage-card' + (locked ? ' locked' : ''));
      card.type = 'button';
      card.disabled = locked;
      card.dataset.stage = st.id;
      card.append(el('span', 'stage-name', st.name), el('span', 'stage-goal', S.goal.replace('{goal}', st.goal)));
      const list = el('span', 'stage-icons');
      for (const it of st.icons) {
        const line = el('span', 'stage-icon'), pic = el('canvas');
        pic.width = 96; pic.height = 96;
        drawStageIcon(pic.getContext('2d'), it.draw);
        line.append(pic, el('span', '', it.text));
        list.append(line);
      }
      card.append(list);
      if (locked) {
        const lock = el('span', 'stage-lock');
        lock.append(icon('lock'), el('span', '', S.locked));
        card.append(lock);
      } else {
        card.addEventListener('click', () => { sfx.play('tap'); game.stage = st.id; go('challengeIntro'); });
      }
      row.append(card);
    }
    ui.append(row);
  },
  draw() { drawBg(); },
};

// ----- story: 사진이 잘 보이도록 대사를 한 줄씩 보여 준다 -----
// lines: [{ hamo, text }], lastLabel: 마지막 줄 버튼 글자, onDone: 마지막 줄 버튼을 눌렀을 때
function storyDialog(scr, lines, lastLabel, onDone) {
  setBg('story');
  scr.line = 0;
  const bubble = el('div', 'bubble story-bubble', lines[0].text);
  const next = button('primary story-btn', lines.length > 1 ? TEXT.next : lastLabel, () => {
    if (scr.line >= lines.length - 1) { onDone(); return; }
    scr.line++;
    bubble.textContent = lines[scr.line].text;
    if (scr.line === lines.length - 1) next.labelEl.textContent = lastLabel;
    game.dirty = true;
  }, lines.length > 1 ? 'next' : 'play');
  ui.append(bubble, next);
}

function drawStoryHamo(lines, line) { drawHamo(ctx, lines[line].hamo, 245, 790, 440, 500); }

screens.story = {
  enter() { storyDialog(this, STORY.lines, TEXT.storyNext, () => go('stagePick')); },
  draw() { drawBg(); drawStoryHamo(STORY.lines, this.line); },
};

// ----- stagePick: 스테이지 고르기 -----
function startStage(id) {
  const stage = STAGES[id - 1];
  game.mode = 'easy';
  game.stageDef = stage;
  game.buildRules = rulesFromStage(stage);
  game.grid = null;
  game.isRetry = false;
  game.history = [];
  game.autoLaunch = !settings.easyControl; // 타이틀에서 '자동 발사'를 고르면 당기지 않아도 날아감
  go('stageIntro');
}
function stageGoalText(stage) {
  const T = STAGE_MODE_TEXT;
  return (stage.goal.type === 'height' ? T.goalHeight : T.goalDistance).replace('{goal}', stage.goal.value);
}
function starLabel(cond) { return STAGE_MODE_TEXT.star[cond.type].replace('{n}', cond.value); }

screens.stagePick = {
  enter() {
    setBg('paper');
    const T = STAGE_MODE_TEXT, all = loadStars();
    ui.append(el('h2', 'abs stages-title', T.pickTitle));
    const row = el('div', 'stage-row sp-row');
    for (const st of STAGES) {
      const open = stageUnlocked(st.id);
      const card = el('button', 'stage-card sp-card' + (open ? '' : ' locked'));
      card.type = 'button';
      card.disabled = !open;
      card.dataset.stage = st.id;
      card.append(el('span', 'sp-num', String(st.id)), el('span', 'stage-name sp-name', st.name));
      // 이 스테이지에서 새로 나오는 부품 그림
      const pic = el('canvas', 'sp-pic');
      pic.width = 220; pic.height = 130;
      const c = pic.getContext('2d'), n = st.newParts.length;
      st.newParts.forEach((k, i) => { c.save(); c.translate(110 + (i - (n - 1) / 2) * 105, 65); drawPart(c, k, n > 1 ? 100 : 124, { spin: 0.5 }); c.restore(); });
      card.append(pic, el('span', 'stage-goal', stageGoalText(st)));
      const stars = el('span', 'sp-stars'), got = all[st.id] || [];
      for (let i = 0; i < 3; i++) stars.append(el('span', 'sp-star' + (got[i] ? ' on' : ''), '★'));
      card.append(stars);
      if (!open) {
        const lock = el('span', 'stage-lock');
        lock.append(icon('lock'), el('span', '', T.locked));
        card.append(lock);
      } else card.addEventListener('click', () => { sfx.play('tap'); startStage(st.id); });
      row.append(card);
    }
    ui.append(row);
  },
  draw() { drawBg(); },
};

// ----- stageIntro: 스테이지 소개와 새 부품 소개(한 문장씩, 그림과 함께) -----
screens.stageIntro = {
  enter() {
    const st = game.stageDef;
    this.lines = [{ hamo: 'build', text: st.intro }];
    for (const k of st.newParts) {
      if (game.tutSeen.has('part:' + k)) continue;
      game.tutSeen.add('part:' + k);
      this.lines.push({ hamo: 'storyShape', text: PARTS[k].intro, part: k });
    }
    storyDialog(this, this.lines, STAGE_MODE_TEXT.start, () => go('build'));
    ui.append(el('div', 'sheet abs intro-goal', `${st.id}. ${st.title}`));
  },
  draw(now) {
    drawBg();
    drawStoryHamo(this.lines, this.line);
    const line = this.lines[this.line];
    // 부품 소개는 큰 부품 그림, 첫 줄은 추천 조립 모습
    ctx.save();
    ctx.fillStyle = 'rgba(255,249,236,0.85)';
    roundBox(ctx, 1240, 130, 620, 350, 40); fillStroke(ctx, 'rgba(255,249,236,0.9)', 5);
    if (line.part) { ctx.translate(1550, 305); drawPart(ctx, line.part, 260, { spin: now / 200, wave: now / 160, blow: true, blowT: now / 250 }); }
    else drawCraft(ctx, gridFromRows(game.stageDef.recommend), 1550, 305, 80, 0, { wave: now / 160 });
    ctx.restore();
  },
  animated: true,
};

// ----- records: 비거 기록 도감 -----
screens.records = {
  enter() {
    setBg('paper');
    const have = loadRecords();
    this.done = have.length >= RECORD_CARDS.length;
    ui.append(el('h2', 'abs records-title', RECORD_TEXT.bookButton));
    ui.append(el('p', 'abs records-count', RECORD_TEXT.count.replace('{n}', have.length).replace('{all}', RECORD_CARDS.length)));
    const grid = el('div', 'records-grid');
    for (const card of RECORD_CARDS) {
      const got = have.includes(card.id);
      grid.append(el('div', 'record-cell' + (got ? '' : ' unknown'), got ? card.text : RECORD_TEXT.unknown));
    }
    ui.append(grid);
    ui.append(el('div', 'bubble records-bubble', this.done ? RECORD_TEXT.complete : RECORD_TEXT.progress));
  },
  draw() {
    drawBg();
    drawHamo(ctx, this.done ? 'recordDone' : 'record', 150, 968, 200, 210);
  },
};

// ----- build: 5×3 칸 조립 -----
const CELL = 168, GRID_X = 360, GRID_Y = 120; // 조립 칸 크기와 위치(화면 1920×1080 기준)
const rem = v => v / 40 + 'rem';

// 이번 조립의 규칙: allowed 쓸 수 있는 부품, limits 부품별 개수(없으면 무제한),
// locked 옮길 수 없는 부품 [{ r, c, key }], recommend '아요 추천' 조립
function buildRules() {
  return game.buildRules || { allowed: PART_ORDER.slice(), limits: { cockpit: 1 }, locked: [], recommend: FREE_RECOMMEND };
}
const limitOf = (rules, key) => (rules.limits[key] === undefined ? Infinity : rules.limits[key]);
const isLocked = (rules, r, c) => rules.locked.some(l => l.r === r && l.c === c);
function usedOf(grid, rules, key) {
  let n = 0;
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (grid[r][c] === key && !isLocked(rules, r, c)) n++;
  return n;
}
// 옮길 수 없는 부품을 제자리에 두고, 개수를 넘는 부품은 뺀다
function fitGrid(grid, rules) {
  const g = copyGrid(grid);
  for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (g[r][c] && !rules.allowed.includes(g[r][c]) && !isLocked(rules, r, c)) g[r][c] = null;
  for (const l of rules.locked) g[l.r][l.c] = l.key;
  for (const key of PART_ORDER) {
    let extra = usedOf(g, rules, key) - limitOf(rules, key);
    for (let r = GRID.rows - 1; r >= 0 && extra > 0; r--) for (let c = 0; c < GRID.cols && extra > 0; c++) {
      if (g[r][c] === key && !isLocked(rules, r, c)) { g[r][c] = null; extra--; }
    }
  }
  return g;
}
function freshGrid(rules) {
  const g = emptyGrid();
  if (!isLocked(rules, 1, 2)) g[1][2] = 'cockpit'; // 조종석은 처음부터 가운데에
  return fitGrid(g, rules);
}

// 조립 화면 하모 안내
function buildHintKey(info) {
  const F = CRAFT_FLIGHT;
  if (info.cockpits === 0) return 'needCockpit';
  if (info.detached.length) return 'detached';
  if (info.up === 0) return 'noLift';
  if (info.liftForce * F.qMax * F.cl0 < info.mass && info.rotorForce < info.mass) return 'tooHeavy';
  if (info.offset < -F.offsetWarn) return 'tailHeavy';
  if (info.offset > F.offsetWarn) return 'noseHeavy';
  return 'ready';
}

screens.build = {
  enter() {
    setBg('build');
    const R = this.rules = buildRules(), T = BUILD_TEXT;
    game.grid = game.grid ? fitGrid(game.grid, R) : freshGrid(R);
    this.selected = null;
    this.drag = null;
    this.flashText = '';
    clearTimeout(this.flashTimer);

    const gridEl = this.gridEl = el('div', 'craft-grid');
    Object.assign(gridEl.style, { left: rem(GRID_X), top: rem(GRID_Y), width: rem(CELL * GRID.cols), height: rem(CELL * GRID.rows) });
    this.cells = [];
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) {
      const cell = el('div', 'cell'), pic = el('canvas');
      pic.width = pic.height = 168;
      cell.dataset.r = r; cell.dataset.c = c;
      cell.append(pic);
      cell.pic = pic;
      gridEl.append(cell);
      this.cells.push(cell);
    }
    gridEl.append(el('span', 'grid-label back', '◀ ' + T.back), el('span', 'grid-label front', T.front + ' ▶'));
    this.clDot = el('div', 'cl-dot');
    this.cgDot = el('div', 'cg-dot');
    gridEl.append(this.clDot, this.cgDot);
    ui.append(gridEl);

    // 무게·뜨는 힘·미는 힘 막대
    const bars = el('div', 'sheet abs bars');
    this.bar = {};
    for (const [key, label] of [['weight', T.barWeight], ['lift', T.barLift], ['push', T.barPush]]) {
      const row = el('div', 'bar-row'), track = el('div', 'bar-track'), fill = el('div', 'bar-fill ' + key);
      track.append(fill);
      if (key === 'lift') { this.liftMark = el('div', 'bar-mark'); track.append(this.liftMark); }
      row.append(el('span', 'bar-label', label), track);
      bars.append(row);
      this.bar[key] = fill;
    }
    ui.append(bars);
    ui.append(button('recommend-btn', T.recommend, () => this.recommend(), 'star'));
    ui.append(button('clear-btn', T.clear, () => this.clear(), 'retry'));
    this.flyBtn = button('primary big cb-fly', T.fly, () => this.fly(), 'plane');
    ui.append(this.flyBtn);

    // 부품 상자
    const tray = this.tray = el('div', 'part-tray');
    for (const key of R.allowed) {
      const item = el('div', 'tray-item'), pic = el('canvas');
      pic.width = pic.height = 136;
      const c = pic.getContext('2d');
      c.translate(68, 68);
      drawPart(c, key, 112, { spin: 0.5 });
      item.dataset.key = key;
      item.append(pic, el('span', 'name', PARTS[key].name), el('span', 'count'));
      tray.append(item);
    }
    ui.append(tray);
    this.bubble = el('div', 'bubble cb-bubble');
    ui.append(this.bubble);

    gridEl.addEventListener('pointerdown', e => this.down(e, e.target.closest('.cell')));
    tray.addEventListener('pointerdown', e => this.down(e, e.target.closest('.tray-item')));
    this.refresh();
  },

  available(key) { return limitOf(this.rules, key) - usedOf(game.grid, this.rules, key); },
  say(text) {
    this.flashText = text;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => { this.flashText = ''; if (game.screen === 'build') this.refresh(); }, 2200);
  },

  // ----- 끌어다 놓기 / 탭→탭 -----
  down(e, target) {
    if (!target || this.drag || game.tut) return;
    const fromCell = target.classList.contains('cell');
    const r = fromCell ? +target.dataset.r : -1, c = fromCell ? +target.dataset.c : -1;
    const key = fromCell ? game.grid[r][c] : target.dataset.key;
    this.drag = { id: e.pointerId, fromCell, r, c, key, target, x0: e.clientX, y0: e.clientY, moved: false };
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  },
  canDrag(d) {
    if (!d.key) return false;
    if (d.fromCell) return !isLocked(this.rules, d.r, d.c);
    return this.available(d.key) > 0 || d.key === 'cockpit';
  },
  onMove(e, p) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 12 && this.canDrag(d)) {
      d.moved = true;
      const g = this.ghost = el('canvas', 'drag-ghost');
      g.width = g.height = 168;
      const c = g.getContext('2d'); c.translate(84, 84); drawPart(c, d.key, 150, { spin: 0.5 });
      ui.append(g);
    }
    if (!d.moved) return;
    this.ghost.style.left = rem(p.x - 80);
    this.ghost.style.top = rem(p.y - 80);
    const over = this.cellAt(e.clientX, e.clientY);
    this.cells.forEach(cell => cell.classList.toggle('hover', cell === over));
  },
  onUp(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.endDrag();
    if (d.moved) {
      const cell = this.cellAt(e.clientX, e.clientY);
      if (d.fromCell) {
        if (cell) this.move(d.r, d.c, +cell.dataset.r, +cell.dataset.c);
        else this.removeAt(d.r, d.c);
      } else if (cell) this.place(d.key, +cell.dataset.r, +cell.dataset.c);
    } else if (d.fromCell) this.tapCell(d.r, d.c);
    else this.tapTray(d.key);
    this.refresh();
  },
  onCancel(e) { if (this.drag && this.drag.id === e.pointerId) { this.endDrag(); this.refresh(); } },
  endDrag() {
    this.drag = null;
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
    this.cells.forEach(cell => cell.classList.remove('hover'));
  },
  cellAt(x, y) {
    const n = document.elementFromPoint(x, y);
    return n && n.closest ? n.closest('.craft-grid .cell') : null;
  },
  tapTray(key) {
    if (this.available(key) <= 0 && key !== 'cockpit') { this.say(BUILD_TEXT.usedUp); sfx.play('empty'); return; }
    this.selected = this.selected === key ? null : key;
    sfx.play('tap');
    if (this.selected && !game.tutSeen.has('part:' + key) && PARTS[key].intro) { game.tutSeen.add('part:' + key); this.say(PARTS[key].intro); }
  },
  tapCell(r, c) {
    const key = game.grid[r][c];
    if (isLocked(this.rules, r, c)) { this.say(BUILD_TEXT.locked); sfx.play('empty'); return; }
    if (this.selected && this.selected !== key) { this.place(this.selected, r, c); return; }
    if (key) { this.removeAt(r, c); return; }
    this.say(BUILD_TEXT.pickFirst);
    this.tray.classList.remove('flash'); void this.tray.offsetWidth; this.tray.classList.add('flash');
  },
  place(key, r, c) {
    const g = game.grid;
    if (isLocked(this.rules, r, c)) { this.say(BUILD_TEXT.locked); sfx.play('empty'); return; }
    if (g[r][c] === key) return;
    if (this.available(key) <= 0) {
      // 조종석은 하나뿐이라 새 자리로 옮긴다
      if (key !== 'cockpit') { this.say(BUILD_TEXT.usedUp); sfx.play('empty'); return; }
      for (let rr = 0; rr < GRID.rows; rr++) for (let cc = 0; cc < GRID.cols; cc++) if (g[rr][cc] === 'cockpit' && !isLocked(this.rules, rr, cc)) g[rr][cc] = null;
    }
    g[r][c] = key;
    sfx.play('found');
    if (this.selected && this.available(this.selected) <= 0) this.selected = null;
  },
  move(r0, c0, r1, c1) {
    if (r0 === r1 && c0 === c1) return;
    if (isLocked(this.rules, r1, c1)) { this.say(BUILD_TEXT.locked); sfx.play('empty'); return; }
    const g = game.grid, t = g[r1][c1];
    g[r1][c1] = g[r0][c0];
    g[r0][c0] = t;
    sfx.play('found');
  },
  removeAt(r, c) {
    if (isLocked(this.rules, r, c)) { this.say(BUILD_TEXT.locked); return; }
    game.grid[r][c] = null;
    sfx.play('tap');
  },
  recommend() { game.grid = fitGrid(gridFromRows(this.rules.recommend), this.rules); this.selected = null; this.say(BUILD_TEXT.ready); this.refresh(); },
  clear() { game.grid = freshGrid(this.rules); this.selected = null; this.refresh(); },
  fly() {
    if (!this.info.valid) {
      sfx.play('empty');
      this.flyBtn.classList.remove('shake'); void this.flyBtn.offsetWidth; this.flyBtn.classList.add('shake');
      this.say(BUILD_TEXT[buildHintKey(this.info)]);
      this.refresh();
      return;
    }
    go('flight');
  },

  // 칸 그림, 막대, 무게중심 점, 하모 안내를 다시 그린다
  refresh() {
    if (game.screen !== 'build') return;
    const F = CRAFT_FLIGHT, R = this.rules, g = game.grid, info = this.info = analyzeCraft(g);
    const loose = new Set(info.detached.map(x => x.r * 10 + x.c));
    for (const cell of this.cells) {
      const r = +cell.dataset.r, c = +cell.dataset.c, key = g[r][c], pc = cell.pic.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, 168, 168);
      if (key) { pc.translate(84, 84); drawPart(pc, key, 150, { spin: 0.5 }); }
      cell.classList.toggle('filled', !!key);
      cell.classList.toggle('locked', isLocked(R, r, c));
      cell.classList.toggle('loose', loose.has(r * 10 + c));
    }
    this.gridEl.classList.toggle('picking', !!this.selected);
    for (const item of this.tray.children) {
      const key = item.dataset.key, left = this.available(key);
      item.classList.toggle('selected', this.selected === key);
      item.classList.toggle('empty', left <= 0 && key !== 'cockpit');
      item.querySelector('.count').textContent = Number.isFinite(left) ? String(Math.max(0, left)) : '';
      item.querySelector('.count').hidden = !Number.isFinite(limitOf(R, key)) || key === 'cockpit';
    }
    // 막대: 숫자 대신 길이와 색
    const pct = v => clamp(v / F.barMax, 0, 1) * 100 + '%';
    const liftBar = (info.liftForce + info.rotorForce) * F.liftBarScale;
    this.bar.weight.style.width = pct(info.mass);
    this.bar.lift.style.width = pct(liftBar);
    this.bar.lift.classList.toggle('ok', liftBar >= info.mass && info.mass > 0);
    this.bar.push.style.width = pct(info.pushForce);
    this.liftMark.style.left = pct(info.mass);
    // 무게중심(빨간 점)과 뜨는 힘의 중심(파란 세모)
    const toX = x => (x + (GRID.cols - 1) / 2 + 0.5) * CELL, toY = y => ((GRID.rows - 1) / 2 - y + 0.5) * CELL;
    this.cgDot.hidden = info.cockpits === 0;
    this.cgDot.style.left = rem(toX(info.xcg)); this.cgDot.style.top = rem(toY(info.ycg));
    this.clDot.hidden = info.up === 0 || info.cockpits === 0;
    this.clDot.style.left = rem(toX(info.xcl)); this.clDot.style.top = rem(toY(info.ycl));
    // 무게중심이 어긋나면 칸 전체가 살짝 기운다(앞이 무거우면 앞이 내려감)
    const tilt = info.up > 0 && info.cockpits ? clamp(info.offset * 7, -9, 9) : 0;
    this.gridEl.style.transform = `rotate(${tilt}deg)`;
    this.flyBtn.classList.toggle('off', !info.valid);
    const text = this.flashText || BUILD_TEXT[buildHintKey(info)];
    if (this.bubble.textContent !== text) this.bubble.textContent = text;
    game.dirty = true;
  },
  draw() {
    drawBg();
    drawHamo(ctx, game.isRetry ? 'retry' : 'build', 150, 968, 200, 210);
  },
};

// ----- flight: 조립한 탈것 날리기 -----
const READY_MS = 900, LAND_MS = 1700;
const FLY_CELL = 48; // 비행 화면에서 칸 하나 크기(픽셀)

screens.flight = {
  animated: true,
  enter() {
    const K = CONTROL;
    this.rules = buildRules();
    this.grid = copyGrid(game.grid);
    this.info = analyzeCraft(this.grid);
    this.stage = game.stageDef || null;
    setBg(this.stage ? 'stage' + this.stage.id : game.mode === 'challenge' ? 'flightC' + currentStage().goal : 'flight');
    ui.className = 'collecting'; // 끌거나 누르는 동안 화면이 움직이지 않게
    this.st = null;
    this.result = null;
    this.blowHeld = false; this.blowId = null; this.blowKey = false;
    this.acc = 0; this.last = 0; this.landedAt = 0; this.spinA = 0; this.pops = [];
    this.pauseAt = 0;
    this.boxOpen = false; this.boxAt = 0; this.prevPos = null;
    this.aim = { angle: K.startAngle, power: K.startPower, active: false, dragging: false, pull: 0, previewKey: '', preview: [], pointerId: null };
    this.aimStart = performance.now();
    if (game.autoLaunch) { this.launch(CRAFT_FLIGHT.autoAngle, 1, true); return; }
    this.phase = 'aim';
    showTutorial('pull', px(0) - 120, py(CRAFT_FLIGHT.launchHeight) + 40);
  },
  onPause() { this.pauseAt = performance.now(); },
  onResume() { this.aimStart += performance.now() - this.pauseAt; this.pauseAt = 0; this.last = 0; },

  launch(angle, power, auto) {
    this.st = startFlight(this.info, angle, power);
    this.phase = 'fly';
    this.flyFrom = performance.now() + (auto ? READY_MS : 0);
    this.last = 0;
    sfx.play('launch');
    const I = this.info;
    if (I.thrust > 0) {
      // 풀무 버튼: 누르는 동안 바람
      const b = this.blowBtn = el('button', 'blow-btn');
      b.type = 'button';
      const pic = el('canvas'); pic.width = pic.height = 120;
      const c = pic.getContext('2d'); c.translate(60, 60); drawPart(c, 'bellows', 100);
      this.gaugeFill = el('div', 'blow-gauge-fill');
      const gauge = el('div', 'blow-gauge'); gauge.append(this.gaugeFill);
      b.append(pic, el('span', '', FLIGHT_TEXT.bellows), gauge);
      b.addEventListener('pointerdown', e => {
        if (this.blowId !== null) return;
        this.blowId = e.pointerId; this.blowHeld = true;
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
        b.classList.add('on');
      });
      ui.append(b);
      if (!auto) showTutorial('bellows', 1660, 860);
    }
    if (I.rotor > 0 && !I.thrust) showTutorial('rotor', 960, 420);
  },
  stopBlow() { this.blowHeld = false; this.blowId = null; if (this.blowBtn) this.blowBtn.classList.remove('on'); },

  // ----- 입력 -----
  pointerDown(x, y, e) {
    if (this.phase === 'fly') { this.tapRotor(); return; }
    if (this.phase !== 'aim' || this.aim.dragging) return;
    const ox = px(0), oy = py(CRAFT_FLIGHT.launchHeight);
    if (Math.hypot(x - ox, y - oy) > 230) return; // 탈것 근처를 눌러야 잡힘
    this.aim.pointerId = e ? e.pointerId : null;
    try { if (e) ui.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    this.aim.dragging = true;
    this.aim.active = true;
    this.dragTo(x, y);
  },
  dragTo(x, y) {
    const a = this.aim;
    this.aimStart = performance.now();
    const aim = aimFromPull(x - px(0), y - py(CRAFT_FLIGHT.launchHeight));
    a.pull = aim.pull; a.cancel = aim.cancel; a.active = !aim.cancel;
    if (aim.cancel) return;
    a.power = aim.power;
    if (aim.pull > 8) a.angle = aim.angle;
  },
  onMove(e, p) {
    if (this.phase === 'aim' && this.aim.dragging && this.aim.pointerId === e.pointerId) this.dragTo(p.x, p.y);
  },
  onUp(e) {
    if (this.blowId === e.pointerId) this.stopBlow();
    const a = this.aim;
    if (this.phase !== 'aim' || !a.dragging || a.pointerId !== e.pointerId) return;
    a.dragging = false;
    if (a.cancel || a.pull < CONTROL.minPull) { a.active = false; a.cancel = false; return; }
    this.launch(a.angle, a.power);
  },
  onCancel(e) {
    if (this.blowId === e.pointerId) this.stopBlow();
    if (this.aim.dragging && this.aim.pointerId === e.pointerId) { this.aim.dragging = false; this.aim.active = false; }
  },
  onKey(e) {
    const K = CONTROL, k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) return;
    e.preventDefault();
    if (document.activeElement) document.activeElement.blur();
    if (this.phase === 'fly') {
      if (k === ' ' && !e.repeat) this.tapRotor();
      if (k === 'ArrowRight') { this.blowKey = true; this.blowHeld = true; if (this.blowBtn) this.blowBtn.classList.add('on'); }
      return;
    }
    if (this.phase !== 'aim') return;
    const a = this.aim;
    a.active = true;
    this.aimStart = performance.now();
    if (k === 'ArrowUp') a.angle = clamp(a.angle + K.keyAngleStep, K.minAngle, K.maxAngle);
    else if (k === 'ArrowDown') a.angle = clamp(a.angle - K.keyAngleStep, K.minAngle, K.maxAngle);
    else if (k === 'ArrowRight') a.power = clamp(a.power + K.keyPowerStep, K.minPower, 1);
    else if (k === 'ArrowLeft') a.power = clamp(a.power - K.keyPowerStep, K.minPower, 1);
    else if (k === ' ' && !e.repeat) this.launch(a.angle, a.power);
  },
  onKeyUp(e) { if (e.key === 'ArrowRight' && this.blowKey) { this.blowKey = false; this.stopBlow(); } },
  tapRotor() {
    const st = this.st;
    if (!st || game.tut || performance.now() < this.flyFrom) return;
    if (!tapRotor(st)) return;
    sfx.play('drum');
    this.pops.push({ x: px(st.x) + 70, y: py(st.y) - 80, at: performance.now() });
  },

  // ----- 그리기 -----
  drawAim(now) {
    const K = CONTROL, a = this.aim, ox = px(0), oy = py(CRAFT_FLIGHT.launchHeight);
    ctx.fillStyle = C.ink;
    ctx.font = '800 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const deg of K.angleMarks) {
      const r = deg * DEG;
      ctx.lineWidth = 5; ctx.strokeStyle = C.ink;
      ctx.beginPath(); ctx.moveTo(ox + Math.cos(r) * 130, oy - Math.sin(r) * 130); ctx.lineTo(ox + Math.cos(r) * 190, oy - Math.sin(r) * 190); ctx.stroke();
      haloText(ctx, deg + '°', ox + Math.cos(r) * 232, oy - Math.sin(r) * 232);
    }
    const strength = clamp((a.power - K.minPower) / (1 - K.minPower), 0, 1);
    const tilt = (a.angle - K.optAngle) / K.pullAngleScale * DEG;
    const back = a.active ? strength * 95 + 15 : 0;
    const bx = ox - Math.cos(tilt) * back, by = oy + Math.sin(tilt) * back;
    if (a.active) {
      // 예상 궤적(앞부분만, 조작 없이)
      const key = Math.round(a.angle) + '/' + a.power.toFixed(2);
      if (key !== a.previewKey) {
        const st = startFlight(this.info, a.angle, a.power);
        while (!st.done) stepFlight(st, false, SIM_STEP);
        a.preview = st.samples.slice(0, Math.ceil(st.samples.length * K.previewShare));
        a.previewKey = key;
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.setLineDash([12, 16]); ctx.lineCap = 'round';
      ctx.beginPath();
      a.preview.forEach((q, i) => { if (i === 0) ctx.moveTo(px(q.x), py(q.y)); else ctx.lineTo(px(q.x), py(q.y)); });
      ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
    }
    drawCraft(ctx, this.grid, bx, by, FLY_CELL, a.angle, { info: this.info, wave: now / 200 });
    if (a.active) {
      ctx.strokeStyle = this.powerColor(a.power); ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox + 26, oy + 44); ctx.lineTo(bx, by + 20); ctx.lineTo(ox - 66, oy + 38); ctx.stroke();
      ctx.lineCap = 'butt';
      const rx = ox + 270, ry = oy - 158, rw = 300;
      ctx.fillStyle = C.ink; ctx.font = '900 92px system-ui, sans-serif'; ctx.textAlign = 'left';
      haloText(ctx, Math.round(a.angle) + '°', rx, ry);
      roundBox(ctx, rx, ry + 54, rw, 44, 14); fillStroke(ctx, C.paper, 4);
      if (strength > 0.01) { roundBox(ctx, rx + 5, ry + 59, (rw - 10) * strength, 34, 10); ctx.fillStyle = this.powerColor(a.power); ctx.fill(); }
    }
    if (!a.dragging && now - this.aimStart > K.idleHintSeconds * 1000 && !game.tut) {
      const t = ((now - this.aimStart) % 1400) / 1400, k = t < 0.7 ? t / 0.7 : 1;
      drawFinger(ctx, ox - 130 * k, oy + 16, 1.5);
      ctx.fillStyle = C.ink; ctx.font = '900 64px system-ui, sans-serif'; ctx.textAlign = 'center';
      haloText(ctx, CONTROL_TEXT.pullHint, 960, 200);
    }
    ctx.textBaseline = 'middle';
  },
  powerColor(power) { return (CONTROL.powerBands.find(b => power <= b.upTo + 1e-6) || CONTROL.powerBands[0]).color; },
  drawReadout(meters) {
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 5;
    roundBox(ctx, 1560, 30, 330, 110, 28); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillText(`${Math.round(meters)} m`, 1725, 88);
  },
  // 회전날개 남은 두드리기(위쪽 가운데)
  drawTaps(now) {
    const st = this.st, n = this.info.taps;
    for (let i = 0; i < n; i++) {
      if (!st) break;
      ctx.save();
      ctx.translate(960 + (i - (n - 1) / 2) * 70, 70);
      if (i >= st.tapsLeft) ctx.globalAlpha = 0.3;
      drawPart(ctx, 'rotor', 60, { spin: i < st.tapsLeft ? now / 300 : 0.5 });
      ctx.restore();
    }
    if (st.tapsUsed === 0 && st.tapsLeft > 0 && !st.done && !this.info.thrust) {
      ctx.fillStyle = C.ink; ctx.font = '900 60px system-ui, sans-serif'; ctx.textAlign = 'center';
      haloText(ctx, FLIGHT_TEXT.rotorHint, 960, 170);
    }
    this.pops = this.pops.filter(q => now - q.at < 700);
    for (const q of this.pops) {
      const k = (now - q.at) / 700;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = C.orangeDark;
      ctx.font = '900 84px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      haloText(ctx, q.text || CONTROL_TEXT.drumPop, q.x, q.y - k * 70);
      ctx.restore();
    }
  },
  // 하늘의 별 상자: 지나가면 열리고 반짝
  drawBox(now) {
    const box = this.stage && this.stage.box;
    if (!box) return;
    const st = this.st;
    if (st && !this.boxOpen) {
      const cur = { x: st.x, y: st.y };
      if (this.prevPos && boxPassed(box, [this.prevPos, cur])) {
        this.boxOpen = true; this.boxAt = now;
        sfx.play('good');
        this.pops.push({ x: px(box.x), y: py(box.y) - 60, at: now, text: FLIGHT_TEXT.starBox });
      }
      this.prevPos = cur;
    }
    drawStarBox(ctx, px(box.x), py(box.y), now, this.boxOpen);
    if (this.boxOpen && now - this.boxAt < 600) {
      const k = (now - this.boxAt) / 600;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#f0b400'; ctx.lineWidth = 8;
      circle(ctx, px(box.x), py(box.y), 40 + k * 90); ctx.stroke(); ctx.restore();
    }
  },
  drawTrail() {
    const s = this.st.samples;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.setLineDash([16, 16]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px(s[0].x), py(s[0].y));
    for (let j = 1; j < s.length; j += 2) ctx.lineTo(px(s[j].x), py(s[j].y));
    ctx.lineTo(px(this.st.x), py(this.st.y));
    ctx.stroke();
    ctx.setLineDash([]); ctx.lineCap = 'butt';
  },
  // 고정 간격으로 계산해서 어느 기기에서나 같은 결과
  advance(now) {
    const st = this.st;
    if (!this.last || game.tut || now < this.flyFrom) { this.last = now; return; }
    const dt = Math.min(0.1, (now - this.last) / 1000) * CRAFT_FLIGHT.playSpeed;
    this.last = now;
    this.acc += dt;
    while (this.acc >= SIM_STEP && !st.done) { stepFlight(st, this.blowHeld, SIM_STEP); this.acc -= SIM_STEP; }
    this.spinA += st.spin * dt * 30;
    if (this.gaugeFill) this.gaugeFill.style.width = (st.gauge / Math.max(0.01, this.info.gauge) * 100) + '%';
    if (st.done && !this.landedAt) {
      this.landedAt = now;
      this.result = flightSummary(st, this.rules.allowed);
      this.result.parts = this.info.partCount;
      this.result.combo = gridToRows(this.grid).join('/') + '@' + this.result.distance;
      this.stopBlow();
      if (this.blowBtn) this.blowBtn.disabled = true;
      sfx.play(this.result.inRiver ? 'splash' : 'empty');
    }
  },
  draw(now) {
    if (game.tut && this.pauseAt) now = this.pauseAt;
    drawBg();
    if (this.phase === 'aim') { this.drawBox(now); this.drawAim(now); this.drawReadout(0); return; }
    this.advance(now);
    const st = this.st;
    if (now < this.flyFrom) {
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 110px system-ui, sans-serif';
      ctx.fillText(TEXT.go, 960, 280);
    }
    this.drawTrail();
    this.drawBox(now);
    let y = py(st.y), pitch = st.theta;
    if (this.landedAt) {
      const age = now - this.landedAt;
      if (this.result.inRiver) { y += Math.min(1, age / 300) * 34; pitch = pitch + (8 - pitch) * Math.min(1, age / 300); }
      else pitch *= 1 - Math.min(1, age / 250);
    }
    drawCraft(ctx, this.grid, px(st.x), y, FLY_CELL, pitch, {
      info: this.info, spin: this.spinA, blow: st.blowing, blowT: now / 250, wave: now / 160, roll: -st.x / 3,
    });
    if (this.landedAt) this.drawLanding(now - this.landedAt);
    this.drawTaps(now);
    this.drawReadout(st.x);
    if (this.landedAt && now - this.landedAt > LAND_MS) {
      game.flight = this.result;
      go('result');
    }
  },
  drawLanding(age) {
    const st = this.st, cx = px(st.x);
    if (this.result.inRiver) {
      // 강 아래를 다시 덮어서 잠긴 것처럼
      const k = game.canvasK, top = GROUND_Y + 34;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, top * k, W * k, (RULER_Y - top) * k, 0, top * k, W * k, (RULER_Y - top) * k);
      resetTransform(ctx);
      if (age < 700) {
        const a = age / 700;
        ctx.fillStyle = C.cloud;
        for (const [dx, h, r] of [[-70, 110, 16], [-34, 170, 20], [6, 200, 22], [46, 160, 18], [84, 100, 14]]) {
          circle(ctx, cx + dx * (0.6 + a), GROUND_Y - h * Math.sin(a * Math.PI), r * (1 - a * 0.5)); ctx.fill();
        }
      }
      if (age > 350) {
        const pop = Math.min(1, (age - 350) / 250);
        drawHamo(ctx, 'river', cx + (cx < 900 ? 170 : -170), GROUND_Y + 56 + Math.sin(age / 300) * 5, 200 * pop, 170 * pop);
      }
    } else if (age < 500) {
      ctx.fillStyle = C.sandDark;
      const a = age / 500;
      for (const [dx, r] of [[-110, 18], [-70, 24], [70, 24], [110, 18]]) {
        circle(ctx, cx + dx * (0.7 + a * 0.6), py(st.y) + 30 - a * 18, r * (1 - a * 0.5)); ctx.fill();
      }
    }
  },
};

// ----- result -----
function buildChart(compact) {
  const barMax = compact ? 3.1 : 9.4;
  const chart = el('div', 'sheet abs chart' + (compact ? ' compact' : ''));
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
      bar.style.height = (Math.min(1, run.distance / CONFIG.world.rulerMax) * barMax) + 'rem';
      cell.append(bar);
    }
    grid.append(cell);
  }
  // 나는 방식과 부품 수
  const rows = [
    ['방식', r => STYLE_TEXT[r.style] || ''],
    ['부품', r => (r.parts === undefined ? '' : r.parts + '개')],
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
    game.history.push({ distance: fl.distance, style: fl.style, parts: fl.parts });
    if (game.history.length > CONFIG.historyMax) game.history.shift();
    saveTop(fl, game.mode);
    this.success = game.mode === 'challenge' && isChallengeSuccess(fl, currentStage());
    sfx.play(this.success || fl.grade === 'best' ? 'win' : 'empty');
    if (game.mode === 'challenge') { this.enterChallenge(fl); return; }
    if (game.stageDef) { this.enterStage(fl); return; }

    ui.append(el('div', 'abs grade ' + fl.grade, GRADE_TEXT[fl.grade]));
    const dist = el('div', 'abs distance', String(fl.distance));
    dist.append(el('small', '', 'm'));
    ui.append(dist);
    const ctlKey = controlFeedbackKey(fl, null, false);
    const extra = ctlKey ? CONTROL_TEXT[ctlKey] : fl.grade === 'best' ? TEXT.bestExtra : null;
    const said = el('div', 'bubble result-bubble' + (extra ? ' two' : ''));
    said.append(el('p', '', FEEDBACK[fl.feedback]));
    if (extra) said.append(el('p', '', extra));
    ui.append(said);
    ui.append(buildChart());
    this.addControlLine(fl);
    ui.append(button('primary result-retry', TEXT.retry, () => { game.isRetry = true; go('build'); }, 'retry'));
    ui.append(button('result-quiz', TEXT.toQuiz, () => go('quiz'), 'quiz'));
    ui.append(button('result-other', TEXT.tryChallenge, () => switchMode('challenge'), 'star'));
    ui.append(el('p', 'abs result-note', TEXT.resultNote));
  },
  // 스테이지 결과: 성공·목표, 별 3개, 하모 설명, 다시 조립/다음 스테이지/퀴즈
  enterStage(fl) {
    const st = game.stageDef, T = STAGE_MODE_TEXT, R = game.buildRules;
    const out = stageOutcome(st, analyzeCraft(game.grid), fl, R);
    const nextOpenBefore = st.id < STAGES.length && stageUnlocked(st.id + 1);
    const saved = saveStageStars(st.id, out.stars);
    const opened = out.ok && st.id < STAGES.length && !nextOpenBefore;
    this.success = out.ok;
    this.hamoKey = out.ok ? 'best' : fl.crashed ? 'crash' : fl.grade;
    sfx.play(out.ok ? 'win' : 'empty');
    ui.className = 'result-stage';
    ui.append(el('div', 'abs grade ' + (out.ok ? 'best' : fl.grade), out.ok ? T.success : GRADE_TEXT[fl.grade]));
    const height = st.goal.type === 'height';
    const big = el('div', 'abs distance', String(height ? fl.maxHeight : fl.distance));
    big.append(el('small', '', 'm'));
    ui.append(big);
    const left = Math.max(0, st.goal.value - (height ? fl.maxHeight : fl.distance));
    const goalText = out.ok
      ? (height ? T.reachedHeight : T.reachedDistance).replace('{goal}', st.goal.value)
      : (height ? T.leftHeight : T.leftDistance).replace('{n}', left || 1);
    ui.append(el('div', 'abs goal-line', goalText));

    // 별 3개(새로 얻은 별은 반짝)
    const panel = el('div', 'sheet abs star-panel');
    panel.append(el('h2', '', `${st.id}. ${st.title}`));
    const row = el('div', 'star-row');
    st.stars.forEach((cond, i) => {
      const cell = el('div', 'star-cell' + (out.stars[i] ? ' on' : '') + (saved.fresh[i] ? ' fresh' : '') + (!out.stars[i] && saved.merged[i] ? ' before' : ''));
      cell.append(el('span', 'big-star', '★'), el('span', 'star-text', starLabel(cond)));
      row.append(cell);
    });
    panel.append(row);
    ui.append(panel);

    const bubble = el('div', 'bubble challenge-bubble' + (out.ok ? ' ok' : ''));
    bubble.append(el('p', '', FEEDBACK[fl.feedback]));
    if (saved.merged.every(Boolean) && saved.fresh.some(Boolean)) bubble.append(el('p', 'cheer', T.allStars));
    else if (opened) bubble.append(el('p', 'cheer', T.opened));
    else if (saved.fresh.some(Boolean)) bubble.append(el('p', 'cheer', T.newStar));
    ui.append(bubble);
    this.addControlLine(fl);
    ui.append(button('primary c-retry', T.rebuild, () => { game.isRetry = true; go('build'); }, 'retry'));
    ui.append(button('c-quiz', TEXT.toQuiz, () => go('quiz'), 'quiz'));
    if (out.ok && st.id < STAGES.length) ui.append(button('primary c-other', T.next, () => startStage(st.id + 1), 'next'));
    else ui.append(button('c-other', T.pick, () => go('stagePick'), 'star'));
    ui.append(el('p', 'abs result-note', TEXT.resultNote));
  },
  // 조종했으면 "발사 각도 32° · 두드리기 2번"
  addControlLine(fl) {
    if (fl.angle === null) return;
    const T = CONTROL_TEXT, stage = game.mode === 'challenge' ? currentStage() : null;
    const line = T.lineNoDrum.replace('{angle}', fl.angle);
    ui.append(el('p', 'abs control-line', line));
  },
  // 도전 모드 결과: 기존 결과 + 목표 안내 + 전용 피드백 + 버튼 3개
  enterChallenge(fl) {
    const S = CHALLENGE_STORY, stage = currentStage(), ok = this.success;
    const opened = ok ? unlockNext(stage.id) : false;
    ui.className = 'result-challenge';
    ui.append(el('div', 'abs grade ' + (ok ? 'best' : fl.grade), ok ? S.successTitle : GRADE_TEXT[fl.grade]));
    const dist = el('div', 'abs distance', String(fl.distance));
    dist.append(el('small', '', 'm'));
    ui.append(dist);
    const goalText = ok
      ? S.goalReached.replace('{goal}', stage.goal)
      : S.goalLeft.replace('{left}', stage.goal - fl.distance);
    ui.append(el('div', 'abs goal-line', goalText));

    const bubble = el('div', 'bubble challenge-bubble' + (ok ? ' ok' : ''));
    const designKey = ok ? null : challengeFeedbackKey(game.parts);
    const ctlKey = designKey ? null : controlFeedbackKey(fl, stage, ok);
    if (ok) {
      bubble.append(el('p', '', S.success));
      if (ctlKey) bubble.append(el('p', 'cheer', CONTROL_TEXT[ctlKey]));
      else if (fl.grade === 'best') bubble.append(el('p', 'cheer', TEXT.bestExtra));
      if (opened) bubble.append(el('p', 'cheer', STAGE_TEXT.opened.replace('{name}', CHALLENGE_LEVELS[stage.id].name)));
    } else {
      bubble.append(el('p', '', FEEDBACK[fl.feedback]));
      if (designKey) bubble.append(el('p', 'extra', CHALLENGE_FEEDBACK[designKey]));
      else if (ctlKey) bubble.append(el('p', 'extra', CONTROL_TEXT[ctlKey]));
    }
    ui.append(bubble);
    ui.append(buildChart(true));
    this.addControlLine(fl);
    ui.append(button('primary c-retry', S.retryFull, () => go('collect'), 'retry'));
    ui.append(button('c-quiz', TEXT.toQuiz, () => go('quiz'), 'quiz'));
    if (ok && stage.id < CHALLENGE_LEVELS.length && !progress.fixed) {
      ui.append(button('primary c-other', STAGE_TEXT.next, () => { game.stage = stage.id + 1; game.history = []; go('collect'); }, 'next'));
    } else {
      ui.append(button('c-other', TEXT.tryEasy, () => switchMode('easy'), 'plane'));
    }
    ui.append(el('p', 'abs result-note', TEXT.resultNote));
  },
  draw() {
    drawBg();
    if (game.mode === 'challenge') {
      drawHamo(ctx, this.success ? 'challengeSuccess' : game.flight.grade, 150, 715, 220, 270);
      return;
    }
    if (game.stageDef) { drawHamo(ctx, this.hamoKey, 150, 715, 220, 270); return; }
    drawHamo(ctx, game.flight.grade, 150, 640, 230, 300);
  },
};

// ----- quiz -----
screens.quiz = {
  enter() {
    setBg('paper');
    game.quizHamo = 'quiz';
    // 이번 모드에 나올 수 있는 문제 중에서, 바로 앞 문제와 겹치지 않게 고른다
    const pool = QUIZ.map((q, i) => i).filter(i => !QUIZ[i].mode || QUIZ[i].mode === game.mode);
    let at = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && pool[at] === game.lastQuiz) at = (at + 1) % pool.length;
    const idx = pool[at];
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
        ui.append(button('primary quiz-next', TEXT.next, () => go('place'), 'next'));
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

// ----- place: 퀴즈를 마친 뒤 진짜 장소 안내 -----
screens.place = {
  enter() {
    setBg('paper');
    ui.append(el('div', 'bubble place-bubble', PLACE_INFO.text));
    ui.append(button('quiz-home', TEXT.home, goHome, 'cross'));
    if (game.mode === 'challenge') {
      ui.append(button('primary quiz-again', CHALLENGE_STORY.retryFull, () => go('collect'), 'retry'));
    } else {
      ui.append(button('primary quiz-again', TEXT.flyAgain, () => { game.isRetry = true; go('build'); }, 'retry'));
    }
  },
  draw() {
    drawBg();
    drawHamo(ctx, 'place', 400, 480, 620, 600);
  },
};

// ----- challengeIntro: 도전 모드 상황 소개 -----
screens.challengeIntro = {
  enter() { storyDialog(this, CHALLENGE_STORY.intro, CHALLENGE_STORY.startButton, () => go('collect')); },
  draw() { drawBg(); drawStoryHamo(CHALLENGE_STORY.intro, this.line); },
};

// ----- collect: 60초 부품 모으기 -----
let roundCounter = 0;
function newCollect() {
  const stage = currentStage();
  const seed = CHALLENGE.fixedSeed !== null ? CHALLENGE.fixedSeed : (Date.now() + (++roundCounter) * 7919) >>> 0;
  const loot = shuffleLoot(seed, stage);
  const now = performance.now();
  // 이 단계에 나오는 마을 사람: 힌트 1명, 교환 상대
  const villagers = [];
  for (const v of VILLAGERS) {
    const trade = stage.trades ? TRADES.find(t => t.villager === v.id) : null;
    if (trade || stage.hintVillager === v.id) villagers.push({ ...v, trade, talked: false });
  }
  return {
    seed, stage, phase: 'play', startMs: now, lastMs: now, endMs: 0,
    rng: createRng(seed + 1000),
    ayo: { x: CHALLENGE.start.x, y: CHALLENGE.start.y }, path: [], intent: null, moving: false, flip: false,
    spots: stageSpots(stage).map((s, i) => ({ ...s, loot: loot[i], opened: false, hint: null })),
    villagers,
    loose: [],      // 바닥이나 열린 장소에 남아 있는 부품 { type, x, y, sx, sy }
    bag: Array(BAG_SIZE).fill(null),
    empties: 0,     // 부품이 안 나온 곳 수(꽝 + 옛 책 조각)
    busy: null, search: null, popup: null, card: null, confirm: false, pauseAt: 0,
    toast: null, hintUntil: 0, keys: new Set(), usedKeys: false, slots: [],
    plan: makeEventPlan(seed, stage), paper: null, chicken: null, chase: false, chaseT: 0,
    edgeUntil: 0, notice: null, fx: [], lastFound: -1e9, combo: 0, lastTick: 99, tutQ: [],
  };
}

const collectPaused = c => c.confirm || c.card || !!game.tut;

screens.collect = {
  animated: true,
  enter() {
    setBg('castle');
    ui.className = 'collecting';
    const c = game.collect = newCollect();
    const row = el('div', 'bag-row');
    c.slots = c.bag.map((_, i) => {
      const slot = el('button', 'bag-slot');
      slot.type = 'button';
      slot.addEventListener('click', () => { this.drop(i); slot.blur(); });
      row.append(slot);
      return slot;
    });
    ui.append(row);
    this.renderBag();
    ui.append(button('primary done-btn', CHALLENGE_STORY.doneButton, () => this.finish(), 'check'));
    // 처음 보는 요소 안내는 하나씩
    for (const v of c.villagers) {
      if (v.trade) c.tutQ.push(['trade', v.x, v.y]);
      else c.tutQ.push(['villager', v.x, v.y]);
    }
    if (c.villagers.some(v => v.trade)) c.tutQ = c.tutQ.filter((q, i, a) => a.findIndex(o => o[0] === q[0]) === i);
  },
  renderBag() {
    const c = game.collect;
    c.slots.forEach((slot, i) => {
      const type = c.bag[i];
      slot.className = 'bag-slot' + (type ? (ITEMS[type].good ? ' good' : '') : ' empty');
      slot.replaceChildren();
      if (type) {
        const pic = el('canvas');
        pic.width = 120; pic.height = 80;
        drawItem(pic.getContext('2d'), type, 60, 40, 1);
        slot.append(pic, el('span', '', ITEMS[type].short));
      } else slot.append(el('span', '', CHALLENGE_STORY.emptySlot));
    });
  },
  showToast(text) {
    game.collect.toast = { text, until: performance.now() + CHALLENGE.toastSeconds * 1000 };
  },
  // 하모 한 줄 알림
  showNotice(text) {
    const c = game.collect;
    c.notice = { text, until: performance.now() + EVENTS.noticeSeconds * 1000 };
    speak(text);
  },
  sparkle(x, y, color, n) {
    const fx = game.collect.fx;
    for (let i = 0; i < (n || 10); i++) {
      const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 160;
      fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + Math.random() * 0.3, age: 0, color: color || '#ffd94a', r: 5 + Math.random() * 6 });
    }
  },
  // 가방 칸을 누르면 아요 자리에 내려놓는다(겹치면 살짝 옆으로)
  drop(i) {
    const c = game.collect;
    if (c.phase !== 'play' || collectPaused(c) || !c.bag[i]) return;
    let x = c.ayo.x, y = c.ayo.y;
    for (const [dx, dy] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, 60]]) {
      const free = !isBlocked(c.ayo.x + dx, c.ayo.y + dy) && !c.loose.some(l => Math.hypot(l.x - c.ayo.x - dx, l.y - c.ayo.y - dy) < 50);
      if (free) { x = c.ayo.x + dx; y = c.ayo.y + dy; break; }
    }
    c.loose.push({ type: c.bag[i], x, y, sx: x, sy: y });
    c.bag[i] = null;
    this.renderBag();
  },
  // 가방에 넣는다. 꽉 찼으면 false
  addBag(type) {
    const c = game.collect, free = c.bag.indexOf(null);
    if (free < 0) return false;
    c.bag[free] = type;
    this.renderBag();
    this.sparkle(c.ayo.x, c.ayo.y - 30, ITEMS[type].good ? '#ffd94a' : '#ffffff');
    sfx.play(ITEMS[type].good ? 'good' : 'found');
    return true;
  },
  bagFullNotice() {
    this.showToast(CHALLENGE_STORY.bagFull);
    showTutorial('bagFull', 300, 900);
  },

  // ----- 시계 멈춤: 확인 창, 기록 카드, 처음 보는 안내 -----
  onPause() { this.pauseClock(); },
  onResume() { this.resumeClock(); },
  pauseClock() {
    const c = game.collect;
    if (!c.pauseAt) c.pauseAt = performance.now();
    c.keys.clear();
  },
  resumeClock() {
    const c = game.collect;
    if (!c.pauseAt || collectPaused(c)) return;
    const now = performance.now(), paused = now - c.pauseAt;
    c.pauseAt = 0;
    c.startMs += paused;
    c.lastMs = now;
    if (c.hintUntil) c.hintUntil += paused;
    if (c.busy) { c.busy.start += paused; c.busy.until += paused; }
    if (c.toast) c.toast.until += paused;
    if (c.notice) c.notice.until += paused;
    if (c.edgeUntil) c.edgeUntil += paused;
    c.lastFound += paused;
    game.lastInput = now;
  },

  // ----- 처음으로: 확인 창을 띄우고 타이머를 멈춘다 -----
  askQuit() {
    const c = game.collect;
    if (collectPaused(c) || c.phase !== 'play') return;
    c.confirm = true;
    this.pauseClock();
    const back = el('div', 'confirm-back');
    const box = el('div', 'sheet confirm-box');
    box.append(el('p', '', CHALLENGE_STORY.quitAsk));
    const yes = button('confirm-yes', CHALLENGE_STORY.yes, goHome, 'check');
    const no = button('primary confirm-no', CHALLENGE_STORY.no, () => this.closeOverlay(back), 'cross');
    box.append(yes, no);
    back.append(box);
    ui.append(back);
    no.focus();
  },
  closeOverlay(back) {
    const c = game.collect;
    c.confirm = false;
    c.card = null;
    back.remove();
    this.resumeClock();
    if (document.activeElement) document.activeElement.blur();
  },

  finish() {
    const c = game.collect;
    game.parts = partsFromBag(c.bag, c.empties, c.stage);
    game.lastInput = performance.now();
    if (!game.parts.canBuild) { go('noParts'); return; }
    // 모은 부품이 그대로 조립 화면의 부품 상자가 된다(조종석은 늘 하나)
    game.buildRules = rulesFromParts(game.parts, c.stage);
    game.stageDef = null;
    game.grid = null;
    game.autoLaunch = c.stage.launch === 'auto';
    game.isRetry = false;
    go('build');
  },

  // ----- 누른 곳에 무엇이 있는지 찾아서 그쪽으로 걸어간다 -----
  pointerDown(x, y) { this.tapAt(x, y); },
  tapAt(x, y) {
    const c = game.collect;
    if (c.phase !== 'play' || collectPaused(c) || c.busy || c.popup) return;
    c.usedKeys = false;
    // 날아가는 한지·닭
    if (c.paper && Math.hypot(c.paper.x - x, c.paper.y - y) < EVENTS.paper.tapRadius) { this.grabPaper(); return; }
    const R = CHALLENGE.tapRadius;
    if (c.chicken && !c.chicken.gone && Math.hypot(c.chicken.x - x, c.chicken.y - y) < EVENTS.chicken.tapRadius) {
      c.search = null;
      c.chase = true; c.chaseT = 0; c.intent = null;
      return;
    }
    // 뒤지는 중: 그 자리를 누르면 한 번 더, 다른 곳을 누르면 취소하고 이동
    if (c.search) {
      const s = c.search.spot;
      if (Math.hypot(s.x - x, s.y - y) < R * 1.4 || Math.hypot(c.ayo.x - x, c.ayo.y - y) < R) { this.searchTap(); return; }
      c.search = null;
    }
    c.chase = false;
    const near = (list, skip) => {
      let best = null, bestD = R;
      for (const it of list) {
        if (skip && skip(it)) continue;
        const d = Math.hypot(it.x - x, it.y - y);
        if (d < bestD) { bestD = d; best = it; }
      }
      return best;
    };
    const item = near(c.loose);
    if (item) { this.walkTo(item.sx, item.sy, { kind: 'item', item }); return; }
    const spot = near(c.spots, s => s.opened);
    if (spot) { this.walkTo(spot.sx, spot.sy, { kind: 'search', spot }); return; }
    const person = near(c.villagers, v => v.talked);
    if (person) { this.walkTo(person.sx, person.sy, { kind: 'talk', person }); return; }
    this.walkTo(x, y, null);
  },
  walkTo(x, y, intent) {
    const c = game.collect;
    c.path = findPath(c.ayo, { x, y });
    c.intent = intent;
    if (c.path.length === 0 && intent) { // 이미 그 자리에 있음
      c.intent = null;
      this.begin(intent);
    }
  },
  // 방향키 이동 중: 스페이스바·Enter로 가장 가까운 것을 뒤진다
  nearestReach() {
    const c = game.collect, R = CHALLENGE.reachDistance;
    let best = null, bestD = R;
    const check = (it, make) => {
      const d = Math.hypot(it.x - c.ayo.x, it.y - c.ayo.y);
      if (d < bestD) { bestD = d; best = make(it); best.at = it; }
    };
    c.loose.forEach(it => check(it, item => ({ kind: 'item', item })));
    c.spots.filter(s => !s.opened).forEach(s => check(s, spot => ({ kind: 'search', spot })));
    c.villagers.filter(v => !v.talked).forEach(v => check(v, person => ({ kind: 'talk', person })));
    return best;
  },
  useNearest() {
    const c = game.collect;
    if (c.phase !== 'play' || collectPaused(c) || c.busy || c.popup) return;
    if (c.search) { this.searchTap(); return; }
    if (c.paper && Math.hypot(c.paper.x - c.ayo.x, c.paper.y - c.ayo.y) < CHALLENGE.reachDistance * 1.5) { this.grabPaper(); return; }
    const target = this.nearestReach();
    if (target) { c.path = []; c.intent = null; c.chase = false; this.begin(target); }
  },
  begin(intent) {
    const c = game.collect, now = performance.now();
    if (intent.kind === 'item') { this.openPopup(intent.item); return; }
    c.moving = false;
    if (intent.kind === 'search') {
      c.search = { spot: intent.spot, count: 0, bump: 0 };
      showTutorial('search', intent.spot.x, intent.spot.y);
      return;
    }
    // 교환 상대인데 원하는 물건이 없으면 바로 한마디만
    const p = intent.person;
    if (p.trade && !c.bag.includes(p.trade.want)) { this.sayHint(p.trade.ask); return; }
    c.busy = { ...intent, start: now, until: now + TALK_TIME * 1000 };
  },
  // ----- 뒤지기: 빠르게 여러 번 누르기 -----
  searchTap() {
    const c = game.collect, se = c.search;
    se.count++;
    se.bump = 1;
    sfx.play('tap');
    const straw = se.spot.kind === 'straw' ? '#e7c95f' : '#c9b89a';
    this.sparkle(se.spot.x, se.spot.y - 10, straw, 6);
    if (se.count >= SEARCH_TAPS) { c.search = null; this.openSpot(se.spot); }
  },
  openSpot(s) {
    const c = game.collect;
    s.opened = true;
    if (s.loot === 'empty') {
      c.empties++;
      sfx.play('empty');
      this.showToast(CHALLENGE_STORY.emptyLoot);
    } else if (s.loot === 'record') {
      c.empties++;
      sfx.play('good');
      this.openRecord();
    } else {
      const now = performance.now();
      c.combo = now - c.lastFound < 3000 ? c.combo + 1 : 1;
      const item = { type: s.loot, x: s.x, y: s.y - 12, sx: s.sx, sy: s.sy };
      c.loose.push(item);
      sfx.play(ITEMS[s.loot].good ? 'good' : 'found');
      this.sparkle(s.x, s.y - 20, ITEMS[s.loot].good ? '#ffd94a' : '#ffffff');
      this.openPopup(item, c.combo);
    }
  },
  sayHint(text) {
    const c = game.collect;
    ui.querySelector('.hint-bubble')?.remove();
    ui.append(el('div', 'bubble hint-bubble', text));
    c.hintUntil = performance.now() + CHALLENGE.hintShowSeconds * 1000;
  },
  finishBusy() {
    const c = game.collect, b = c.busy;
    c.busy = null;
    const p = b.person;
    if (p.trade) { // 물물교환: 같은 칸에서 바꾼다
      const at = c.bag.indexOf(p.trade.want);
      if (at < 0) { this.sayHint(p.trade.ask); return; } // 대화 중에 내려놓은 경우
      c.bag[at] = p.trade.give;
      p.talked = true;
      this.renderBag();
      this.sparkle(p.x, p.y - 20, '#ffd94a');
      sfx.play('good');
      this.sayHint(TRADE_THANKS);
      return;
    }
    p.talked = true;
    const hint = makeHint(c.spots, c.rng);
    const spot = c.spots.find(s => s.id === hint.spotId);
    if (spot) spot.hint = hint.item === 'empty' ? 'empty' : 'part';
    this.sayHint(hint.text);
  },
  // ----- 옛 책 조각: 가방에 넣지 않고 카드로 읽는다. 읽는 동안 시계가 멈춘다 -----
  openRecord() {
    const c = game.collect, got = pickRecord(), R = RECORD_TEXT;
    c.card = got.card;
    this.pauseClock();
    const back = el('div', 'confirm-back');
    const box = el('div', 'sheet record-popup');
    const pic = el('canvas');
    pic.width = 160; pic.height = 160;
    drawHamo(pic.getContext('2d'), got.complete ? 'recordDone' : 'record', 80, 80, 150, 150);
    const n = loadRecords().length;
    box.append(pic, el('h2', '', R.found),
      el('p', 'record-tag', got.fresh ? R.fresh.replace('{n}', n).replace('{all}', RECORD_CARDS.length) : R.again),
      el('p', 'record-text', got.card.text));
    if (got.complete) box.append(el('p', 'record-done', R.complete));
    const ok = button('primary record-ok', R.ok, () => this.closeOverlay(back), 'check');
    box.append(ok);
    back.append(box);
    ui.append(back);
    ok.focus();
    speak(got.card.text);
  },

  // ----- 부품 팝업: 담기 / 두고 가기 -----
  openPopup(item, combo) {
    const c = game.collect, good = ITEMS[item.type].good;
    c.popup = item;
    const box = el('div', 'sheet loot-popup' + (good ? ' good' : ''));
    const pic = el('canvas');
    pic.width = 420; pic.height = 280;
    const pc = pic.getContext('2d');
    drawItem(pc, item.type, 210, 140, 3.4);
    if (good) drawGoodMark(pc, 210, 140, 128, performance.now());
    box.append(pic, el('p', 'loot-name', ITEMS[item.type].name));
    if (combo >= 2) box.append(el('p', 'loot-combo', CONTROL_TEXT.combo.replace('{n}', combo)));
    const take = button('primary loot-take', CHALLENGE_STORY.take, () => this.takeItem(), 'bag');
    const leave = button('loot-leave', CHALLENGE_STORY.leave, () => this.closePopup(), 'cross');
    box.append(take, leave);
    ui.append(box);
    take.focus();
  },
  closePopup() {
    const c = game.collect;
    c.popup = null;
    c.lastFound = performance.now(); // 연속 찾기는 팝업을 닫은 뒤부터 잰다
    ui.querySelector('.loot-popup')?.remove();
    if (document.activeElement) document.activeElement.blur();
  },
  takeItem() {
    const c = game.collect;
    if (!this.addBag(c.popup.type)) { this.bagFullNotice(); return; }
    c.loose.splice(c.loose.indexOf(c.popup), 1);
    this.closePopup();
  },

  // ----- 돌발 이벤트 -----
  startEvent(type) {
    const c = game.collect, now = performance.now();
    c.edgeUntil = now + EVENTS.edgeSeconds * 1000;
    if (type === 'paper') {
      c.paper = { age: 0, x: 160, y: 220 };
      this.showNotice(EVENTS.paper.startText);
      sfx.play('wind');
      showTutorial('event', 240, 260);
    } else {
      const start = { x: 1500, y: 465 };
      c.chicken = { x: start.x, y: start.y, path: [], run: EVENTS.chicken.runSeconds, rest: 0, flip: false };
      this.showNotice(EVENTS.chicken.startText);
      sfx.play('cluck');
      showTutorial('event', start.x, start.y);
    }
  },
  grabPaper() {
    const c = game.collect;
    if (!this.addBag(EVENTS.paper.reward)) { this.bagFullNotice(); return; }
    this.sparkle(c.paper.x, c.paper.y, '#ffd94a', 14);
    c.paper = null;
  },
  updateEvents(dt, elapsed) {
    const c = game.collect;
    while (c.plan.length && elapsed >= c.plan[0].at) this.startEvent(c.plan.shift().type);
    if (game.tut) return;
    if (c.paper) {
      const P = c.paper, k = P.age / EVENTS.paper.seconds;
      P.age += dt;
      P.x = 160 + (1560 - 160) * k + Math.sin(k * 14) * 30;
      P.y = 220 + (870 - 220) * k * k + Math.sin(k * 22) * 34;
      if (P.age >= EVENTS.paper.seconds) {
        this.sparkle(P.x, 870, '#bfe7f2', 14);
        sfx.play('splash');
        this.showNotice(EVENTS.paper.missText);
        c.paper = null;
      }
    }
    const H = c.chicken;
    if (H) {
      const E = EVENTS.chicken;
      if (Math.hypot(H.x - c.ayo.x, H.y - c.ayo.y) < E.touchRadius) { // 닿으면 끈을 얻는다
        if (this.addBag(E.reward)) {
          this.sparkle(H.x, H.y, '#ffd94a', 14);
          sfx.play('cluck');
          c.chicken = null; c.chase = false; c.path = [];
          return;
        }
        if (!H.fullShown) { H.fullShown = true; this.bagFullNotice(); c.chase = false; c.path = []; }
      } else H.fullShown = false;
      if (H.rest > 0) {
        H.rest -= dt;
        if (H.rest <= 0) { H.run = E.runSeconds; sfx.play('cluck'); }
      } else {
        H.run -= dt;
        if (H.run <= 0) H.rest = E.restSeconds;
        if (!H.path.length) {
          const pool = [...c.spots.map(s => ({ x: s.sx, y: s.sy })), { x: CHALLENGE.start.x, y: CHALLENGE.start.y }];
          const t = pool[Math.floor(c.rng() * pool.length)];
          H.path = findPath(H, t);
        }
        let left = CHALLENGE.walkSpeed * E.speedScale * dt;
        while (left > 0 && H.path.length) {
          const p = H.path[0], d = Math.hypot(p.x - H.x, p.y - H.y);
          if (Math.abs(p.x - H.x) > 1) H.flip = p.x > H.x;
          if (d <= left) { H.x = p.x; H.y = p.y; H.path.shift(); left -= d; }
          else { H.x += (p.x - H.x) / d * left; H.y += (p.y - H.y) / d * left; left = 0; }
        }
      }
      if (c.chase) {
        c.chaseT -= dt;
        if (c.chaseT <= 0) { c.chaseT = 0.35; c.path = findPath(c.ayo, H); }
      }
    }
  },

  update(now) {
    const c = game.collect;
    if (collectPaused(c)) return; // 확인 창·기록 카드·안내가 떠 있으면 모두 멈춘다
    const dt = Math.min(0.05, (now - c.lastMs) / 1000);
    c.lastMs = now;
    for (const f of c.fx) { f.age += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; }
    c.fx = c.fx.filter(f => f.age < f.life);
    if (c.search && c.search.bump > 0) c.search.bump = Math.max(0, c.search.bump - dt * 6);
    if (c.phase === 'timeup') {
      if (now - c.endMs > CHALLENGE.timeUpSeconds * 1000) this.finish();
      return;
    }
    const elapsed = (now - c.startMs) / 1000;
    if (elapsed >= TIME_LIMIT) {
      c.phase = 'timeup'; c.endMs = now; c.path = []; c.intent = null; c.moving = false; c.busy = null; c.search = null; c.paper = null; c.chase = false;
      this.closePopup();
      ui.querySelector('.done-btn').remove();
      ui.querySelector('.home-btn')?.remove();
      ui.querySelector('.hint-bubble')?.remove();
      ui.append(el('div', 'bubble timeup-bubble', CHALLENGE_STORY.timeUp));
      return;
    }
    // 남은 10초: 째깍
    const left = Math.ceil(TIME_LIMIT - elapsed);
    if (left !== c.lastTick) { c.lastTick = left; if (left <= CHALLENGE.warnSeconds) sfx.play('tick'); }
    if (c.hintUntil && now > c.hintUntil) { c.hintUntil = 0; ui.querySelector('.hint-bubble')?.remove(); }
    if (c.notice && now > c.notice.until) c.notice = null;
    if (c.popup) return;
    // 처음 보는 요소 안내(하나씩)
    if (c.tutQ.length && !c.busy && !c.search && elapsed > 0.5) {
      const [key, x, y] = c.tutQ.shift();
      if (showTutorial(key, x, y)) return;
    }
    this.updateEvents(dt, elapsed);
    if (game.screen !== 'collect' || collectPaused(c) || c.popup) return;
    if (c.busy) { if (now >= c.busy.until) this.finishBusy(); return; }

    const step = CHALLENGE.walkSpeed * speedScaleOf(c.bag) * dt;
    c.moving = false;
    const k = c.keys;
    if (k.size) {
      // 방향키: 가로·세로를 따로 움직여서 벽을 따라 미끄러지게 한다
      c.path = []; c.intent = null; c.usedKeys = true; c.search = null; c.chase = false;
      let dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      let dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
      const len = Math.hypot(dx, dy);
      if (len) {
        dx *= step / len; dy *= step / len;
        if (dx) c.flip = dx > 0;
        const x0 = c.ayo.x, y0 = c.ayo.y;
        if (!isBlocked(c.ayo.x + dx, c.ayo.y)) c.ayo.x += dx;
        if (!isBlocked(c.ayo.x, c.ayo.y + dy)) c.ayo.y += dy;
        c.moving = c.ayo.x !== x0 || c.ayo.y !== y0;
      }
      return;
    }
    // 누른 곳으로: 정해진 길을 따라 걷는다
    let walk = step;
    while (walk > 0 && c.path.length) {
      const p = c.path[0];
      const d = Math.hypot(p.x - c.ayo.x, p.y - c.ayo.y);
      if (Math.abs(p.x - c.ayo.x) > 1) c.flip = p.x > c.ayo.x;
      if (d <= walk) { c.ayo.x = p.x; c.ayo.y = p.y; c.path.shift(); walk -= d; }
      else { c.ayo.x += (p.x - c.ayo.x) / d * walk; c.ayo.y += (p.y - c.ayo.y) / d * walk; walk = 0; }
      c.moving = true;
    }
    if (!c.path.length && c.intent) {
      const intent = c.intent;
      c.intent = null;
      this.begin(intent);
    }
  },
  draw(now) {
    this.update(now);
    if (game.screen !== 'collect') return; // update에서 화면이 넘어간 경우
    const c = game.collect;
    drawBg();
    const t = c.pauseAt || now;
    for (const s of c.spots) this.drawSpot(s, t);
    for (const it of c.loose) {
      if (ITEMS[it.type].good) drawGoodMark(ctx, it.x, it.y, 44, t);
      drawItem(ctx, it.type, it.x, it.y, 0.9);
    }
    for (const v of c.villagers) drawVillager(ctx, v, t);
    if (c.path.length && !c.chase) {
      const goal = c.path[c.path.length - 1];
      ctx.strokeStyle = C.orangeDark; ctx.lineWidth = 5;
      circle(ctx, goal.x, goal.y, 16); ctx.stroke();
    }
    if (c.chicken) this.drawChickenEvent(t);
    this.drawAyoTop(t);
    if (c.paper) {
      ctx.save(); ctx.translate(c.paper.x, c.paper.y); ctx.rotate(Math.sin(t / 150) * 0.5);
      drawItem(ctx, 'wing', 0, 0, 1.25);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      for (const d of [-26, 0, 26]) { ctx.beginPath(); ctx.moveTo(c.paper.x - 110, c.paper.y + d); ctx.lineTo(c.paper.x - 56, c.paper.y + d); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
    for (const f of c.fx) {
      ctx.globalAlpha = 1 - f.age / f.life;
      ctx.fillStyle = f.color;
      circle(ctx, f.x, f.y, f.r); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (c.busy) this.drawBar(c.busy, t);
    if (c.search) this.drawSearchBoxes(c.search);
    if (c.usedKeys && !c.busy && !c.popup && !c.search && c.phase === 'play') {
      const near = this.nearestReach();
      if (near) this.drawMark(near.at.x, near.at.y - 66);
    }
    this.drawTimer(t);
    if (c.toast && t < c.toast.until) this.drawToast(c.toast.text);
    if (c.notice && t < c.notice.until) this.drawNotice(c.notice.text);
    if (t < c.edgeUntil) { // 이벤트 시작: 가장자리 반짝임
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / 70);
      ctx.strokeStyle = '#ffd94a'; ctx.lineWidth = 34;
      ctx.strokeRect(0, 0, W, 910);
      ctx.restore();
    }
    if (c.phase === 'timeup') {
      ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
      roundBox(ctx, 400, 250, 1160, 500, 40); ctx.fill(); ctx.stroke();
      drawHamo(ctx, 'challengeTimeUp', 590, 500, 300, 340);
    }
  },
  drawSpot(s, now) {
    const c = game.collect, se = c.search;
    const shaking = se && se.spot === s;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (shaking) { ctx.rotate(Math.sin(now / 45) * 0.04 * (1 + se.bump * 2)); ctx.translate(0, se.bump * -22); }
    drawHideSpot(ctx, s.kind, s.opened);
    ctx.restore();
    // 힌트로 들은 곳 표시
    if (s.hint && !s.opened) {
      circle(ctx, s.x + 40, s.y - 40, 20); fillStroke(ctx, s.hint === 'empty' ? '#d9d4c8' : '#ffd94a', 3);
      ctx.fillStyle = C.ink; ctx.font = '900 30px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.hint === 'empty' ? '✕' : '!', s.x + 40, s.y - 39);
    }
  },
  // 뒤지기 진행 칸
  drawSearchBoxes(se) {
    const s = se.spot, size = 30, gap = 6, w = SEARCH_TAPS * size + (SEARCH_TAPS - 1) * gap;
    const x0 = clamp(s.sx - w / 2, 110, W - 110 - w), y = s.sy + 42; // 아요 발밑
    for (let i = 0; i < SEARCH_TAPS; i++) {
      roundBox(ctx, x0 + i * (size + gap), y, size, size, 7);
      fillStroke(ctx, i < se.count ? C.orange : C.paper, 3.5);
    }
  },
  drawChickenEvent(now) {
    const H = game.collect.chicken;
    drawChicken(ctx, H.x, H.y - 8, 1, H.flip, true);
    if (Math.floor(now / 900) % 2 === 0) {
      ctx.font = '800 32px system-ui, sans-serif';
      const tw = ctx.measureText(EVENTS.chicken.sound).width + 22;
      roundBox(ctx, H.x + 22, H.y - 84, tw, 44, 12); fillStroke(ctx, '#ffffff', 3);
      ctx.fillStyle = C.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(EVENTS.chicken.sound, H.x + 33, H.y - 61);
    }
  },
  // 대화 진행 바
  drawBar(b, now) {
    const at = b.person;
    const k = clamp((now - b.start) / (b.until - b.start), 0, 1);
    const x = at.x - 70, y = at.y - 96;
    roundBox(ctx, x, y, 140, 26, 12); fillStroke(ctx, C.paper, 4);
    if (k > 0.02) { roundBox(ctx, x + 4, y + 4, 132 * k, 18, 8); ctx.fillStyle = C.orange; ctx.fill(); }
  },
  drawMark(x, y) {
    circle(ctx, x, y, 22); fillStroke(ctx, '#ffd94a', 3);
    ctx.fillStyle = C.ink; ctx.font = '900 32px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 1);
  },
  // 지도 위의 아요: 비거에 탄 모습과 같은 이미지를 작게, 걷는 방향에 따라 좌우 반전
  // (이미지 속 아요는 꼬리가 오른쪽이라 왼쪽을 보는 모습이 기본)
  drawAyoTop(now) {
    const c = game.collect, a = c.ayo, h = AYO_SIZE.onMap;
    const y = a.y + (c.moving ? Math.sin(now / 80) * 3 : 0);
    drawAyo(ctx, a.x, y - 16, h, c.flip);
    // 무거우면 머리 위에 땀
    if (c.bag.some(t => t && ITEMS[t].heavy)) {
      ctx.fillStyle = '#6fc3ec'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      const wob = Math.sin(now / 160) * 3;
      for (const [dx, dy, s] of [[44, -56, 1], [-44, -60, 0.8]]) {
        const sx = a.x + dx, sy = y + dy + wob;
        ctx.beginPath(); ctx.moveTo(sx, sy - 13 * s);
        ctx.quadraticCurveTo(sx + 10 * s, sy + 3 * s, sx, sy + 7 * s);
        ctx.quadraticCurveTo(sx - 10 * s, sy + 3 * s, sx, sy - 13 * s);
        ctx.fill(); ctx.stroke();
      }
    }
  },
  drawTimer(now) {
    const c = game.collect;
    const leftMs = Math.max(0, TIME_LIMIT * 1000 - (c.phase === 'timeup' ? c.endMs - c.startMs : now - c.startMs));
    const left = Math.ceil(leftMs / 1000);
    const warn = left <= CHALLENGE.warnSeconds;
    const blink = warn && Math.floor(now / 300) % 2 === 0;
    // 남은 10초: 타이머가 흔들린다
    const shake = warn && c.phase === 'play' ? Math.sin(now / 40) * 7 : 0;
    roundBox(ctx, 830 + shake, 6, 260, 92, 24);
    fillStroke(ctx, blink ? '#d8362f' : C.paper, 5);
    ctx.fillStyle = blink ? '#ffffff' : warn ? '#d8362f' : C.ink;
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${left}초`, 960 + shake, 56);
  },
  drawToast(text) {
    ctx.font = '800 56px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 70;
    roundBox(ctx, 960 - tw / 2, 118, tw, 92, 24); fillStroke(ctx, '#ffe7c7', 4);
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 960, 166);
  },
  // 하모 한 줄 알림
  drawNotice(text) {
    ctx.font = '800 54px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 60, x = 960 - tw / 2 + 50;
    roundBox(ctx, x, 222, tw, 92, 24); fillStroke(ctx, '#ffffff', 4);
    drawHamo(ctx, 'record', x - 56, 268, 100, 110);
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + tw / 2, 270);
  },
};

// ----- noParts: 비거를 만들 수 없을 때 -----
screens.noParts = {
  enter() {
    setBg('paper');
    ui.append(el('div', 'bubble noparts-bubble', CHALLENGE_STORY.noParts));
    ui.append(button('primary big noparts-retry', CHALLENGE_STORY.retry, () => go('collect'), 'retry'));
    ui.append(button('noparts-home', TEXT.home, goHome, 'cross'));
  },
  draw() {
    drawBg();
    drawHamo(ctx, 'challengeNoParts', 400, 420, 420, 460);
  },
};

// =============================================================
// 4. 게임 루프와 자동 리셋
// =============================================================
function frame(now) {
  // 모으기 단계에서는 자동 리셋을 하지 않는다
  if (game.screen === 'collect' && !collectPaused(game.collect)) game.lastInput = now;
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

  // 처음 누를 때 소리를 켠다. 읽어주는 중에 누르면 멈춘다
  // 터치 기기에서는 pointerdown이 '사용자 동작'으로 인정되지 않아 소리·음성이 막힌다.
  // 그래서 손을 뗄 때(pointerup·touchend·click)에 소리를 켜고 기다리던 말풍선을 읽는다.
  window.addEventListener('pointerdown', () => stopSpeaking(), { passive: true });
  for (const type of ['pointerup', 'touchend', 'click']) window.addEventListener(type, onFirstInput, { passive: true });

  const toLogical = e => {
    const rect = ui.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  };
  // 모으기·비행 화면: 터치·클릭
  ui.addEventListener('pointerdown', e => {
    const scr = screens[game.screen];
    if (!scr.pointerDown || game.tut || e.target.closest('button, .loot-popup, .confirm-back, .tut-back')) return;
    const p = toLogical(e);
    scr.pointerDown(p.x, p.y, e);
  });
  // 조립·비행 화면: 끌기·놓기를 화면 밖에서도 받는다(각 화면이 시작한 손가락 번호만 따라감)
  window.addEventListener('pointermove', e => { const s = screens[game.screen]; if (s.onMove) s.onMove(e, toLogical(e)); });
  window.addEventListener('pointerup', e => { const s = screens[game.screen]; if (s.onUp) s.onUp(e, toLogical(e)); });
  window.addEventListener('pointercancel', e => { const s = screens[game.screen]; if (s.onCancel) s.onCancel(e); });
  window.addEventListener('keyup', e => { const s = screens[game.screen]; if (s.onKeyUp) s.onKeyUp(e); });
  game.toLogical = toLogical;
  // 모으기 화면: PC 방향키, 스페이스바·Enter로 뒤지기
  const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    touched();
    onFirstInput();
    if (game.tut) { e.preventDefault(); if (!e.repeat) game.tut.close(); return; } // 안내는 아무 키로 닫힘
    if (screens[game.screen].onKey) { screens[game.screen].onKey(e); return; }
    if (game.screen !== 'collect') return;
    const c = game.collect;
    if (c.confirm || c.card || c.popup) return; // 창이 떠 있으면 버튼이 키를 받는다
    if (ARROWS.includes(e.key)) { e.preventDefault(); c.keys.add(e.key); }
    else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (document.activeElement) document.activeElement.blur();
      screens.collect.useNearest();
    }
  });
  window.addEventListener('keyup', e => { if (game.collect) game.collect.keys.delete(e.key); });
  window.addEventListener('blur', () => { if (game.collect) game.collect.keys.clear(); });

  loadSaved(SETTINGS_KEY, settings);
  loadSaved(PROGRESS_KEY, progress);
  if (!TUTORIALS.resetOnTitle) { const seen = []; loadSaved(TUT_KEY, seen); seen.forEach(k => game.tutSeen.add(k)); }
  watchBubbles();
  watchVoices();
  game.lastInput = performance.now();
  await preload();
  go('title');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') boot();
