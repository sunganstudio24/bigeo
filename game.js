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
// liftScale: 들어 올리는 힘 배율(도전 모드에서 끈이 없을 때 사용, 쉬운 모드는 1)
// ctl(없으면 자동 비행): { angle, power 발사 각도·세기, drums 두드린 시간 목록, thermal 상승 기류 사용 }
function simulateFlight(wingKey, bodyKey, ballastKey, liftScale = 1, ctl = null) {
  const f = CONFIG.flight;
  const wing = CONFIG.wings[wingKey];
  const body = CONFIG.bodies[bodyKey];
  const ballast = CONFIG.ballasts[ballastKey];
  const ratio = wing.lift * liftScale / body.weight;

  const mode = ballast.behavior === 'flip' ? 'flip' : body.alwaysCrash ? 'heavy' : 'glide';
  const dive = ballast.behavior === 'dive';
  const cruise = f.cruiseSpeed / wing.drag;
  const K = CONTROL, D = K.drum;
  // 쇠 몸통·뒤 무게추는 어떻게 쏘아도 같은 추락: 발사 각도·세기는 활공할 때만 적용
  const aimed = !!ctl && ctl.angle !== undefined;
  const aimOff = aimed ? ctl.angle - K.optAngle : 0;
  const power = aimed ? ctl.power : 1;
  const useAim = aimed && mode === 'glide';
  const sink = f.sinkBase / Math.pow(ratio, f.glideSharpness)
    * (useAim ? 1 + K.angleSink * Math.pow(aimOff / 30, 2) + K.powerSink * (1 - power) : 1);

  let x = 0, y = f.launchHeight, t = 0, step = 0;
  let vx = useAim ? f.launchSpeed * power * (1 - K.highSpeedLoss * Math.max(0, aimOff) / 30) : f.launchSpeed;
  let vy = useAim ? f.launchLift + K.riseRate * aimOff : f.launchLift;
  let pitch = aimed ? ctl.angle : 8;
  const drums = ctl && ctl.drums ? ctl.drums : [];
  const thermals = ctl && ctl.thermal ? K.thermals : [];
  let nextDrum = 0;
  const samples = [{ t: 0, x, y, pitch }];

  while (y > f.groundClearance && t < 30) {
    const dt = SIM_STEP;
    // 배 두드리기: 내려갈 때 더 잘 듣고, 무거운 몸통일수록 약함(뒤 무게추는 소용없음)
    while (nextDrum < drums.length && drums[nextDrum] <= t) {
      nextDrum++;
      if (mode === 'flip') continue;
      const e = (D.bodyEffect[bodyKey] === undefined ? 1 : D.bodyEffect[bodyKey]) * (vy < 0 ? D.fallingScale : D.risingScale);
      vy += D.lift * e;
      vx += D.push * e;
    }
    if (mode === 'glide') for (const z of thermals) if (x >= z.from && x <= z.to) vy += z.power * dt;
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
    wing: wingKey, body: bodyKey, ballast: ballastKey, liftScale,
    angle: aimed ? Math.round(ctl.angle) : null, drumsUsed: drums.length,
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
  for (const row of stage.loot) for (let i = 0; i < row.count; i++) pool.push(row.item);
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

// 가방 내용(['bamboo', 'paper', ...])을 조립에 쓸 수 있는 정보로 바꾼다
// stage가 끈을 쓰지 않는 단계면 끈이 없어도 벌칙이 없다
function partsFromBag(bag, empties = 0, stage = null) {
  const items = bag.filter(Boolean);
  const count = t => items.filter(x => x === t).length;
  const torn = items.filter(t => ITEMS[t].torn).length;
  const clean = items.filter(t => ITEMS[t].use === 'wing' && !ITEMS[t].torn).length;
  const paper = clean + torn * STATE_EFFECT.tornPaperValue;
  const bodies = [...new Set(items.filter(t => ITEMS[t].use === 'body').map(t => ITEMS[t].bodyKey))];
  const hasString = items.some(t => ITEMS[t].use === 'string') || !!(stage && !stage.needString);
  const traps = items.filter(t => ITEMS[t].use === 'trap');
  // 튼튼한 대나무가 있으면 그것을 쓰고, 금 간 대나무만 있을 때 흔들린다
  const crackedOnly = count('crackedBamboo') > 0 && count('bamboo') === 0;
  const minNeed = Math.min(...Object.values(CHALLENGE.wingNeedPaper));
  return { paper, torn, bodies, hasString, crackedOnly, empties, traps, canBuild: paper >= minNeed && bodies.length > 0 };
}

function wingUnlocked(parts, wingKey) { return parts.paper >= CHALLENGE.wingNeedPaper[wingKey]; }
function usesCracked(parts, pick) { return parts.crackedOnly && pick.body === 'bamboo'; }

// 들어 올리는 힘 배율: 끈 없음과 금 간 대나무가 겹치면 함께 곱한다
function liftScaleOf(parts, pick) {
  return (parts.hasString ? 1 : STATE_EFFECT.noStringLift) * (usesCracked(parts, pick) ? STATE_EFFECT.crackedBambooLift : 1);
}

// 무거운 물건 하나당 느려지고, 최소 속도 아래로는 내려가지 않는다
function speedScaleOf(bag) {
  const heavy = bag.filter(t => t && ITEMS[t].heavy).length;
  return Math.max(CHALLENGE.minSpeedScale, 1 - CHALLENGE.heavySlowEach * heavy);
}

function isChallengeSuccess(flight, stage) { return !flight.crashed && flight.distance >= stage.goal; }

// 도전 모드 피드백: 위에서 먼저 맞는 것 하나. 해당 없으면 null(기존 FEEDBACK만 사용)
function challengeFeedbackKey(parts, pick) {
  if (pick.body === 'iron' && !parts.bodies.includes('bamboo')) return 'ironNoBamboo';
  if (usesCracked(parts, pick)) return 'crackedBamboo';
  if (parts.torn > 0) return 'tornPaper';
  if (parts.traps && parts.traps.includes('jar')) return 'jarHeld';
  if (parts.traps && parts.traps.includes('pot')) return 'potHeld';
  if (parts.empties >= CHALLENGE.manyEmptyAt) return 'manyEmpty';
  if (parts.paper < CHALLENGE.wingNeedPaper.big) return 'littlePaper';
  if (!parts.hasString) return 'noString';
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

// 단계에서의 비행. drums를 주면 그때 두드린 것으로 계산. 1단계는 자동 발사, 그 외는 최적 발사로 본다
function stageFlight(stage, parts, pick, drums) {
  const ctl = { thermal: true, drums: drums || [] };
  if (stage.launch === 'pull') { ctl.angle = CONTROL.optAngle; ctl.power = 1; }
  return simulateFlight(pick.wing, pick.body, pick.ballast, liftScaleOf(parts, pick), ctl);
}

// 대표 가방 조합 검사 — 브라우저 콘솔에서 runChallengeCombos() 실행
function runChallengeCombos() {
  const B = 'bamboo', Cr = 'crackedBamboo', P = 'paper', Tp = 'tornPaper', Wd = 'wood', I = 'iron', S = 'string', J = 'jar', Pt = 'pot';
  const DR = [1, 2, 3]; // 두드린 시간(초)
  // must: 'ok' 성공 / 'fail' 실패 / 'cannot' 만들 수 없음, fb: 기대 피드백, drums: 두드리기
  const cases = {
    1: [
      { bag: [B, P, P],          wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok' }, // 대나무 + 한지 2장
      { bag: [B, P, P, P],       wing: 'big',    body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P, P, P],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P, P, Wd],      wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P],             wing: 'small',  body: 'bamboo', ballast: 'center', must: 'fail', fb: 'littlePaper' },
      { bag: [Wd, P, P],         wing: 'normal', body: 'wood',   ballast: 'center', must: 'fail', fb: 'littlePaper' },
      { bag: [B, P, P],          wing: 'normal', body: 'bamboo', ballast: 'front',  must: 'fail' },
      { bag: [B, P, P],          wing: 'normal', body: 'bamboo', ballast: 'back',   must: 'fail' },
      { bag: [P, P, P],          must: 'cannot' },
    ],
    2: [
      { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P, P, Tp, S],   wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok', locked: 'big' },
      { bag: [B, P, Tp, S],      wing: 'small',  body: 'bamboo', ballast: 'center', must: 'fail', locked: 'normal', fb: 'tornPaper' },
      { bag: [Cr, P, P, S],      wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', fb: 'crackedBamboo' },
      { bag: [Cr, P, P, P],      wing: 'big',    body: 'bamboo', ballast: 'center', must: 'fail', fb: 'crackedBamboo' },
      { bag: [Wd, P, P, P, S],   wing: 'big',    body: 'wood',   ballast: 'center', must: 'fail', fb: null },
      { bag: [Wd, P, P, P],      wing: 'big',    body: 'wood',   ballast: 'center', must: 'fail', fb: 'noString' },
      { bag: [B, Tp, S],         must: 'cannot' },
    ],
    3: [
      { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'center', must: 'ok' },
      { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', fb: 'littlePaper' },
      { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'ok', drums: DR },
      { bag: [Cr, P, P, P, S],   wing: 'big',    body: 'bamboo', ballast: 'center', must: 'fail', fb: 'crackedBamboo' },
      { bag: [Cr, P, P, P, S],   wing: 'big',    body: 'bamboo', ballast: 'center', must: 'ok', drums: DR },
      { bag: [B, P, P, P],       wing: 'big',    body: 'bamboo', ballast: 'center', must: 'fail', fb: 'noString' },
      { bag: [B, P, P, J, S],    wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', fb: 'jarHeld' },
      { bag: [B, P, P, Pt, S],   wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', fb: 'potHeld' },
      { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', empties: 2, fb: 'manyEmpty' },
      { bag: [I, P, P, P, S],    wing: 'big',    body: 'iron',   ballast: 'center', must: 'fail', fb: 'ironNoBamboo' },
      { bag: [I, P, P, P, S],    wing: 'big',    body: 'iron',   ballast: 'center', must: 'fail', fb: 'ironNoBamboo', drums: DR },
      { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'back',   must: 'fail', drums: DR },
      { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'front',  must: 'fail', drums: DR },
      { bag: [J, Pt, B],         must: 'cannot' },
    ],
  };
  const label = bag => {
    const n = {};
    bag.forEach(t => { n[ITEMS[t].short] = (n[ITEMS[t].short] || 0) + 1; });
    return Object.keys(n).map(k => n[k] > 1 ? `${k}${n[k]}` : k).join('+') || '(빈 가방)';
  };
  const rows = [], problems = [], stageTimes = [], hintSamples = [], eventRows = [];
  const decisionSeconds = 1.5; // 부품 팝업에서 고르는 시간(가정)
  const searchSeconds = SEARCH_TAPS / SEARCH_TAPS_PER_SECOND;

  for (const stage of STAGES) {
    const tag = stage.name;
    for (const c of cases[stage.id]) {
      const name = label(c.bag);
      if (c.bag.length > BAG_SIZE) problems.push(`${tag} ${name}: 가방 칸 초과`);
      const parts = partsFromBag(c.bag, c.empties || 0, stage);
      if (c.must === 'cannot') {
        rows.push({ 단계: tag, 가방: name, 조립: '-', 두드리기: 0, '거리(m)': '-', 결과: '만들 수 없음', 피드백: '부품이 모자람' });
        if (parts.canBuild) problems.push(`${tag} ${name}: 만들 수 없어야 함`);
        continue;
      }
      if (!parts.canBuild) { problems.push(`${tag} ${name}: 만들 수 있어야 함`); continue; }
      if (!wingUnlocked(parts, c.wing)) problems.push(`${tag} ${name}: ${c.wing} 날개가 잠겨 있음`);
      if (c.locked && wingUnlocked(parts, c.locked)) problems.push(`${tag} ${name}: ${c.locked} 날개는 잠겨 있어야 함`);
      if (!parts.bodies.includes(c.body)) problems.push(`${tag} ${name}: ${c.body} 몸통 재료가 없음`);
      const pick = { wing: c.wing, body: c.body, ballast: c.ballast };
      const fl = stageFlight(stage, parts, pick, c.drums);
      const ok = isChallengeSuccess(fl, stage);
      const extra = ok ? null : challengeFeedbackKey(parts, pick);
      rows.push({
        단계: tag, 가방: name + (c.empties ? ` (빈 곳 ${c.empties})` : ''),
        조립: `${CONFIG.wings[c.wing].short}/${CONFIG.bodies[c.body].short}/${CONFIG.ballasts[c.ballast].short}`,
        두드리기: c.drums ? c.drums.length : 0,
        '힘 배율': +liftScaleOf(parts, pick).toFixed(2), '거리(m)': fl.distance,
        결과: ok ? '성공' : `실패(${GRADE_TEXT[fl.grade]})`,
        피드백: ok ? 'success' : `${fl.feedback}${extra ? ' + ' + extra : ''}`,
      });
      if (c.must === 'ok' && !ok) problems.push(`${tag} ${name}: 반드시 성공해야 함(${fl.distance}m)`);
      if (c.must === 'fail' && ok) problems.push(`${tag} ${name}: 실패해야 함(${fl.distance}m)`);
      if ('fb' in c && !ok && extra !== c.fb) problems.push(`${tag} ${name}: 피드백이 ${c.fb}여야 하는데 ${extra}`);
      if ((c.body === 'iron' || c.ballast === 'back') && !fl.crashed) problems.push(`${tag} ${name}: 추락해야 함`);
    }

    // 내용물 구성
    const total = stage.loot.reduce((n, r) => n + r.count, 0);
    if (total !== stage.spots.length) problems.push(`${tag}: 내용물 ${total}개, 장소 ${stage.spots.length}곳`);
    if (!stage.states && stage.loot.some(r => ITEMS[r.item] && (ITEMS[r.item].torn || ITEMS[r.item].cracked))) problems.push(`${tag}: 부품 상태가 없어야 함`);
    const spots0 = stageSpots(stage);
    if (spots0.some(s => !s)) problems.push(`${tag}: 없는 장소 id`);

    // 힌트는 항상 실제 배치와 일치
    if (stage.hintVillager) {
      for (let seed = 1; seed <= 100; seed++) {
        const rng = createRng(seed + 1000), loot = shuffleLoot(seed, stage);
        const spots = spots0.map((s, i) => ({ ...s, loot: loot[i], opened: false, hint: null }));
        const h = makeHint(spots, rng);
        const spot = spots.find(s => s.id === h.spotId);
        if (!spot || spot.loot !== h.item) problems.push(`${tag} 시드 ${seed}: 거짓 힌트 "${h.text}"`);
        if (h.text.length > 20) problems.push(`${tag} 힌트가 20자 초과: ${h.text}`);
        if (seed <= 2) hintSamples.push(h.text);
      }
    }

    // 시간: 위치를 다 알 때 최적 가방이 60초 안에 되는가, 전부 뒤지면 얼마나 걸리는가
    const stands = [CHALLENGE.start, ...spots0.map(s => ({ x: s.sx, y: s.sy }))];
    stands.forEach((p, i) => { if (isBlocked(p.x, p.y)) problems.push(`${tag} ${i}번 서는 자리가 막혀 있음`); });
    const dist = stands.map(p => stands.map(q => pathLength(p, q)));
    const allStops = spots0.map((_, i) => i + 1);
    const popups = stage.loot.filter(r => r.item !== 'empty' && r.item !== 'record').reduce((n, r) => n + r.count, 0);
    const walkAll = shortestTour(dist, allStops) / CHALLENGE.walkSpeed;
    const allSeconds = walkAll + stage.spots.length * searchSeconds + popups * decisionSeconds;
    let worst = 0, sum = 0;
    const seedsChecked = 300;
    for (let seed = 1; seed <= seedsChecked; seed++) {
      const loot = shuffleLoot(seed, stage);
      const at = t => allStops.filter(i => loot[i - 1] === t);
      const stops = [...at('bamboo'), ...at('string'), ...at('paper')];
      const sec = shortestTour(dist, stops) / CHALLENGE.walkSpeed + stops.length * (searchSeconds + decisionSeconds);
      worst = Math.max(worst, sec); sum += sec;
    }
    if (worst > TIME_LIMIT) problems.push(`${tag}: 최적 가방이 ${worst.toFixed(1)}초 걸리는 배치가 있음`);
    stageTimes.push({ 단계: tag, 장소: stage.spots.length, '걷기 최단(초)': +walkAll.toFixed(1), '전부 뒤지기(초)': +allSeconds.toFixed(1), '최적 가방 평균(초)': +(sum / seedsChecked).toFixed(1), '최적 가방 최악(초)': +worst.toFixed(1) });
  }

  // 3단계 전부 뒤지기는 시간 안에 다 못 하게(80~90초)
  const last = stageTimes[stageTimes.length - 1]['전부 뒤지기(초)'];
  if (last < 80 || last > 90) problems.push(`3단계 전부 뒤지기 ${last}초(목표 80~90초)`);

  // 1단계: 대나무 + 한지 2장 이상이면 성공할 수 있어야 함
  {
    const st = STAGES[0];
    for (const n of [2, 3]) {
      const parts = partsFromBag(['bamboo', ...Array(n).fill('paper')], 0, st);
      const pick = { wing: n >= 3 ? 'big' : 'normal', body: 'bamboo', ballast: 'center' };
      if (!isChallengeSuccess(stageFlight(st, parts, pick), st)) problems.push(`1단계 대나무 + 한지 ${n}장이 실패`);
    }
  }

  // 시드 3개: 이벤트 목록과 3단계 배치
  const stage3 = STAGES[2], seedList = [1, 2, 3], layouts = seedList.map(s => shuffleLoot(s, stage3));
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
    if (makeEventPlan(seed, STAGES[0]).length || makeEventPlan(seed, STAGES[1]).length) problems.push('1·2단계에 이벤트가 있음');
  }
  if (eventCounts.size !== 2) problems.push('이벤트 수가 1개·2개로 나뉘지 않음');
  if (new Set(layouts.map(l => l.join())).size !== 3) problems.push('시드가 달라도 배치가 같음');
  const seedRows = stageSpots(stage3).map((s, i) => {
    const row = { 장소: `${placeName(s.area)} ${HIDE_SPOT_KINDS[s.kind]}` };
    seedList.forEach((seed, k) => { row[`시드 ${seed}`] = layouts[k][i] === 'empty' ? '꽝' : ITEMS[layouts[k][i]].name; });
    return row;
  });

  // 진행 중 문장은 20자 이내(이야기·기록 카드·요청 문구 제외)
  const shortOnes = [
    CHALLENGE_STORY.quitAsk, CHALLENGE_STORY.timeUp, CHALLENGE_STORY.noParts, CHALLENGE_STORY.bagFull, CHALLENGE_STORY.emptyLoot,
    CHALLENGE_STORY.buildHello, CHALLENGE_STORY.noString, CHALLENGE_STORY.crackedNote, CHALLENGE_STORY.tornNote,
    EVENTS.paper.startText, EVENTS.paper.missText, EVENTS.chicken.startText, TRADE_THANKS, ...TRADES.map(x => x.ask),
    HINT_TEMPLATES.none, TEXT.buildHello, TEXT.buildRetry, CONTROL_TEXT.pullHint,
    ...Object.entries(TUTORIALS.items).filter(([k]) => k !== 'drum').map(([, v]) => v),
  ];
  for (const s of shortOnes) if (s.length > 20) problems.push(`20자 초과: ${s}`);
  if (RECORD_CARDS.length !== 6 || new Set(RECORD_CARDS.map(r => r.id)).size !== 6) problems.push('기록 카드는 서로 다른 6장이어야 함');

  console.table(rows);
  console.table(stageTimes);
  console.table(eventRows);
  console.table(seedRows);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('도전 모드 조합 검사 통과');
  return { rows, problems, seedRows, stageTimes, eventRows, hintSamples };
}

// 조종 검사 — 브라우저 콘솔에서 runControlTest() 실행
function runControlTest() {
  const designs = [
    { 설계: '최적', wing: 'big', body: 'bamboo', ballast: 'center' },
    { 설계: '보통', wing: 'normal', body: 'wood', ballast: 'center' },
    { 설계: '쇠 몸통', wing: 'big', body: 'iron', ballast: 'center' },
  ];
  const rows = [], problems = [], DR = [1, 2, 3];
  for (const d of designs) {
    const auto = simulateFlight(d.wing, d.body, d.ballast);
    for (const angle of [15, 30, 50]) for (const drums of [[], DR]) {
      const fl = simulateFlight(d.wing, d.body, d.ballast, 1, { angle, power: 1, thermal: true, drums });
      rows.push({
        설계: d.설계, 각도: angle, 두드리기: drums.length, '거리(m)': fl.distance, 결과: fl.crashed ? '추락' : GRADE_TEXT[fl.grade],
        '자동 비행 대비(%)': fl.crashed ? '-' : Math.round((fl.distance / auto.distance - 1) * 100),
      });
      if (d.body === 'iron' && !fl.crashed) problems.push(`쇠 몸통 ${angle}도 ${drums.length}번: 추락해야 함`);
      if (fl.crashed && !fl.inRiver) problems.push(`${d.설계} ${angle}도: 추락인데 강 밖`);
      if (fl.distance > CONFIG.world.rulerMax) problems.push(`${d.설계} ${angle}도 ${drums.length}번: ${fl.distance}m(눈금 초과)`);
    }
  }
  const dist = (w, b, bl, ctl) => simulateFlight(w, b, bl, 1, ctl).distance;
  const auto = dist('big', 'bamboo', 'center');
  const best = dist('big', 'bamboo', 'center', { angle: CONTROL.optAngle, power: 1, thermal: true, drums: DR });
  const gain = best / auto - 1;
  if (gain < 0.1 || gain > 0.2) problems.push(`최적 조종이 자동보다 ${(gain * 100).toFixed(1)}%(목표 10~20%)`);
  // 같은 각도·세기는 자동과 같은 결과
  if (dist('big', 'bamboo', 'center', { angle: CONTROL.optAngle, power: 1 }) !== auto) problems.push('최적 발사가 자동 발사와 다름');
  // 약 30도가 가장 멀리
  for (const [w, b] of [['big', 'bamboo'], ['normal', 'wood'], ['small', 'bamboo']]) {
    let bestA = 0, bestD = -1;
    for (let a = CONTROL.minAngle; a <= CONTROL.maxAngle; a++) {
      const v = dist(w, b, 'center', { angle: a, power: 1 });
      if (v > bestD) { bestD = v; bestA = a; }
    }
    if (Math.abs(bestA - CONTROL.optAngle) > 6) problems.push(`${w}/${b}: 가장 멀리 가는 각도가 ${bestA}도`);
    if (dist(w, b, 'center', { angle: 30, power: 0.7 }) >= dist(w, b, 'center', { angle: 30, power: 1 })) problems.push(`${w}/${b}: 세게 쏘는 게 더 멀리 가야 함`);
  }
  // 쇠 몸통·뒤 무게추: 어떤 조종이어도 추락하고 거리도 강 안
  for (const w of Object.keys(CONFIG.wings)) for (const b of Object.keys(CONFIG.bodies)) for (const bl of Object.keys(CONFIG.ballasts)) {
    if (b !== 'iron' && bl !== 'back') continue;
    for (const angle of [10, 30, 60]) for (const power of [CONTROL.minPower, 1]) for (const drums of [[], DR]) {
      const fl = simulateFlight(w, b, bl, 1, { angle, power, thermal: true, drums });
      if (!fl.crashed || !fl.inRiver) problems.push(`${w}/${b}/${bl} ${angle}도: 강에 추락해야 함(${fl.distance}m)`);
    }
  }
  // 앞 무게추는 조종해도 3단계 목표에 못 감, 작은 날개도 마찬가지
  if (dist('big', 'bamboo', 'front', { angle: 30, power: 1, thermal: true, drums: DR }) >= STAGES[2].goal) problems.push('앞 무게추가 3단계 목표에 도달');
  if (dist('small', 'bamboo', 'center', { angle: 30, power: 1, thermal: true, drums: DR }) >= STAGES[1].goal) problems.push('작은 날개가 2단계 목표에 도달');
  // 조종 비중: 같은 설계에서 최고-최저 폭과 설계 간 폭 비교
  const worstCtl = dist('big', 'bamboo', 'center', { angle: 50, power: CONTROL.minPower });
  const designRange = auto - simulateFlight('small', 'wood', 'center').distance;
  const summary = { '자동(m)': auto, '최적 조종(m)': best, '자동 대비(%)': +(gain * 100).toFixed(1), '가장 못 쏜 경우(m)': worstCtl, '설계 차이(m, 큰+대나무 - 작은+나무판)': designRange };
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
  const combo = `${flight.wing}/${flight.body}/${flight.ballast}/${flight.liftScale}/${flight.distance}`;
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
  const next = Math.min(STAGES.length, stageId + 1);
  if (next <= progress.unlocked) return false;
  progress.unlocked = next;
  saveSaved(PROGRESS_KEY, progress);
  return true;
}

// 결과 화면의 조종 안내(설계 문제가 없을 때만). 해당 없으면 null
function controlFeedbackKey(flight, stage, success) {
  if (flight.feedback !== 'balanced') return null;
  if (flight.angle !== null && flight.angle >= CONTROL.tooHigh) return 'tooHigh';
  if (flight.angle !== null && flight.angle <= CONTROL.tooLow) return 'tooLow';
  if (stage && stage.drums > 0 && flight.drumsUsed === 0) return 'noDrum';
  if (stage && flight.drumsUsed > 0 && success) return 'drumWin';
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
  pick: { ...CONFIG.defaults },
  history: [], flight: null, isRetry: false, goodbye: false, lastQuiz: -1,
  quizHamo: 'quiz',
  mode: 'easy', parts: null, collect: null, stage: 1,
  tut: null, tutSeen: new Set(),
};
const currentStage = () => STAGES[game.stage - 1];

// =============================================================
// 효과음: Web Audio로 만든다(외부 파일 없음). 처음 누른 뒤에 켜진다
// =============================================================
const sfx = {
  ctx: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { const A = window.AudioContext || window.webkitAudioContext; if (A) this.ctx = new A(); } catch (e) { this.ctx = null; }
  },
  tone(freq, seconds, type, volume, delay, slideTo) {
    if (!settings.sound || !this.ctx) return;
    try {
      const t = this.ctx.currentTime + (delay || 0), o = this.ctx.createOscillator(), v = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
      v.gain.setValueAtTime(volume || 0.2, t);
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
let lastSpoken = '';
function speak(text) {
  if (!settings.speak || !canSpeak() || !text) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
    lastSpoken = text;
  } catch (e) { /* 무시 */ }
}
function stopSpeaking() {
  if (!canSpeak()) return;
  try { window.speechSynthesis.cancel(); } catch (e) { /* 무시 */ }
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
  else if (kind === 'cracked') drawItem(c, 'crackedBamboo', 48, 48, 1);
  else if (kind === 'villager') drawVillager(c, { x: 48, y: 50, color: '#6a9bd1', talked: true }, 0);
  else if (kind === 'trade') drawItem(c, 'jar', 48, 50, 1);
  else if (kind === 'chicken') drawChicken(c, 50, 48, 0.95, false, true);
  else if (kind === 'drum') drawDrum(c, 48, 50, 1.25);
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

// 비거에 탄 아요: 상반신만 보인다(아랫부분은 몸통이 가림). 원점이 비거 몸통 가운데
function drawAyoSeated(c) {
  const hullTop = -8, img = images.ayo, A = AYO_SIZE;
  if (!img) { drawAyo(c, A.seatX, hullTop - A.onBigeo * 0.32, A.onBigeo); return; }
  const k = A.onBigeo / img.height, w = img.width * k, srcH = img.height * A.showTop;
  // 아랫변이 몸통 뒤로 살짝 들어가도록 6만큼 내려서 그린다
  c.drawImage(img, 0, 0, img.width, srcH, A.seatX - w / 2, hullTop + 6 - srcH * k, w, srcH * k);
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
  drawAyoSeated(c);
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
  const w = CONFIG.world, f = CONFIG.flight;
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
  if (type === 'bamboo' || type === 'crackedBamboo') {
    c.rotate(0.25);
    roundBox(c, -9, -34, 18, 68, 6); fillStroke(c, '#7dbb5a', 3);
    c.strokeStyle = '#4c7f35'; c.lineWidth = 3;
    for (const yy of [-12, 12]) { c.beginPath(); c.moveTo(-9, yy); c.lineTo(9, yy); c.stroke(); }
    if (type === 'crackedBamboo') { // 금 선
      c.strokeStyle = '#2b2a26'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-3, -30); c.lineTo(4, -20); c.lineTo(-4, -8); c.lineTo(5, 4); c.lineTo(-3, 16); c.lineTo(3, 30); c.stroke();
    }
  } else if (type === 'wood') {
    roundBox(c, -34, -16, 68, 32, 5); fillStroke(c, C.wood, 3);
    c.strokeStyle = C.woodDark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-28, -5); c.lineTo(28, -5); c.moveTo(-28, 6); c.lineTo(28, 6); c.stroke();
  } else if (type === 'iron') {
    c.beginPath(); c.moveTo(-30, 18); c.lineTo(-22, -12); c.lineTo(4, -22); c.lineTo(28, -8); c.lineTo(32, 18); c.closePath();
    fillStroke(c, C.ironDark, 3);
    c.fillStyle = C.iron; c.beginPath(); c.moveTo(-14, -6); c.lineTo(4, -13); c.lineTo(10, -3); c.lineTo(-8, 4); c.closePath(); c.fill();
  } else if (type === 'paper' || type === 'tornPaper') {
    c.rotate(-0.08);
    c.beginPath();
    if (type === 'tornPaper') { // 찢어진 모서리
      c.moveTo(-25, -28); c.lineTo(2, -28); c.lineTo(8, -18); c.lineTo(14, -12); c.lineTo(11, -2); c.lineTo(20, 4); c.lineTo(25, 2);
      c.lineTo(25, 28); c.lineTo(-25, 28); c.closePath();
    } else c.rect(-25, -28, 50, 56);
    fillStroke(c, '#ffffff', 3);
    c.strokeStyle = C.wallDark; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-16, -12); c.lineTo(16, -12); c.moveTo(-16, 4); c.lineTo(16, 4); c.stroke();
  } else if (type === 'jar') {
    c.beginPath(); c.moveTo(-12, -26); c.quadraticCurveTo(-34, -4, -20, 28); c.lineTo(20, 28); c.quadraticCurveTo(34, -4, 12, -26); c.closePath();
    fillStroke(c, '#8a5a36', 3);
    c.beginPath(); c.ellipse(0, -26, 14, 5, 0, 0, Math.PI * 2); fillStroke(c, '#a97f52', 3);
  } else if (type === 'pot') {
    c.beginPath(); c.moveTo(-32, -8); c.quadraticCurveTo(-30, 26, 0, 26); c.quadraticCurveTo(30, 26, 32, -8); c.closePath();
    fillStroke(c, '#5a5f66', 3);
    c.beginPath(); c.moveTo(-38, -10); c.lineTo(38, -10); c.lineWidth = 6; c.strokeStyle = C.ink; c.stroke();
    c.beginPath(); c.moveTo(-14, -12); c.quadraticCurveTo(0, -30, 14, -12); c.closePath(); fillStroke(c, '#7c828a', 3);
  } else if (type === 'string') {
    const curve = () => { c.beginPath(); c.moveTo(-30, 12); c.bezierCurveTo(-16, -30, 2, 30, 12, -4); c.bezierCurveTo(16, -18, 28, -16, 30, -2); c.stroke(); };
    c.lineCap = 'round';
    c.strokeStyle = C.ink; c.lineWidth = 12; curve();
    c.strokeStyle = '#f4cc3c'; c.lineWidth = 7; curve();
    c.lineCap = 'butt';
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
  game.pick = { ...CONFIG.defaults };
  game.isRetry = false;
  go('build');
}

// 새 손님을 위해 판 기록과 선택을 비운다
function newSession() {
  game.history = [];
  game.pick = { ...CONFIG.defaults };
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
    STAGES.forEach(st => choose(S.adminFixed.replace('{name}', st.name), st.id));
    grid.append(button('', S.adminReset, () => {
      progress.unlocked = 1; progress.fixed = null; saveSaved(PROGRESS_KEY, progress);
      try { localStorage.removeItem(RECORD_KEY); } catch (e) { /* 무시 */ }
      memoryRecords = [];
      go('title');
    }, 'retry'));
    grid.append(button('', S.adminClose, () => back.remove(), 'cross'));
    box.append(grid);
    back.append(box);
    ui.append(back);
  },
  draw(now) {
    drawBg();
    const bob = Math.sin(now / 600) * 10;
    drawBigeo(ctx, game.pick, 1010, 588 + bob, 1, 4, Math.sin(now / 250) * 0.5 + 0.5);
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
    for (const st of STAGES) {
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
  enter() { storyDialog(this, STORY.lines, TEXT.storyNext, () => go('build')); },
  draw() { drawBg(); drawStoryHamo(STORY.lines, this.line); },
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

// ----- build -----
function drawWingCard(c, key) { c.translate(150, 150); c.scale(0.72, 0.72); drawWingShape(c, key, 0); }
function drawBodyCard(c, key) { c.translate(170, 80); c.scale(0.78, 0.78); drawHull(c, key); }
function drawBallastCard(c, key) {
  c.translate(170, 40); c.scale(0.78, 0.78);
  drawStone(c, key);
  drawHull(c, 'wood');
}

// 자물쇠 그림(잠긴 카드 오른쪽 위)
function drawLock(c) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.lineWidth = 8; c.strokeStyle = C.ink;
  c.beginPath(); c.arc(278, 38, 18, Math.PI, 0); c.stroke();
  roundBox(c, 250, 38, 56, 44, 8); fillStroke(c, '#8a867c', 5);
  c.fillStyle = C.ink; circle(c, 278, 58, 7); c.fill();
}

// locked(key): 잠긴 부품이면 안내 문구, 아니면 null / tagOf(key): 이름 아래 문구
function partGroup(label, slot, table, drawFn, locked, tagOf) {
  const group = el('section', 'part-group');
  group.append(el('h2', '', label));
  const row = el('div', 'part-row');
  for (const key of Object.keys(table)) {
    const card = el('button', 'card');
    card.type = 'button';
    card.dataset.slot = slot; card.dataset.key = key;
    const pic = el('canvas');
    pic.width = 320; pic.height = 160;
    const lockText = locked ? locked(key) : null;
    const picCtx = pic.getContext('2d');
    drawFn(picCtx, key);
    if (lockText) { drawLock(picCtx); card.disabled = true; }
    card.append(pic);
    const part = table[key];
    card.append(el('span', 'name', part.name));
    const tag = lockText || (tagOf ? tagOf(key) : part.tag);
    if (tag) card.append(el('span', 'tag', `(${tag})`));
    card.setAttribute('aria-pressed', String(game.pick[slot] === key));
    card.addEventListener('click', () => {
      game.pick[slot] = key;
      row.querySelectorAll('.card').forEach(b => b.setAttribute('aria-pressed', String(b === card)));
      game.dirty = true;
      screens.build.refreshNotes();
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
    const parts = game.mode === 'challenge' ? game.parts : null;
    const S = CHALLENGE_STORY;
    const needText = key => S.needPaper.replace('{n}', CHALLENGE.wingNeedPaper[key]);
    panel.append(
      parts
        ? partGroup(S.wingLabelCount.replace('{n}', parts.paper), 'wing', CONFIG.wings, drawWingCard, k => (wingUnlocked(parts, k) ? null : needText(k)), needText)
        : partGroup(TEXT.wingLabel, 'wing', CONFIG.wings, drawWingCard),
      parts
        ? partGroup(TEXT.bodyLabel, 'body', CONFIG.bodies, drawBodyCard, k => (parts.bodies.includes(k) ? null : S.noMaterial),
            k => (k === 'bamboo' && parts.crackedOnly ? S.crackedTag : CONFIG.bodies[k].tag))
        : partGroup(TEXT.bodyLabel, 'body', CONFIG.bodies, drawBodyCard),
      partGroup(TEXT.ballastLabel, 'ballast', CONFIG.ballasts, drawBallastCard),
    );
    ui.append(panel);
    this.bubble = el('div', 'bubble build-bubble');
    this.note = el('div', 'state-note');
    ui.append(this.note, this.bubble);
    this.refreshNotes();
    ui.append(button('primary big fly-btn', TEXT.fly, () => go('flight'), 'plane'));
  },
  // 고른 부품에 따라 안내를 바꾼다: 첫 안내는 하모 말풍선, 나머지는 회색 칸
  refreshNotes() {
    if (game.screen !== 'build') return;
    const S = CHALLENGE_STORY;
    if (game.mode !== 'challenge') {
      this.bubble.textContent = game.isRetry ? TEXT.buildRetry : TEXT.buildHello;
      this.note.hidden = true;
      return;
    }
    const parts = game.parts, notes = [];
    if (usesCracked(parts, game.pick)) notes.push(S.crackedNote);
    if (parts.torn > 0) notes.push(S.tornNote);
    if (!parts.hasString) notes.push(S.noString);
    this.bubble.textContent = notes[0] || S.buildHello;
    this.note.replaceChildren(...notes.slice(1).map(t => el('p', '', t)));
    this.note.hidden = notes.length < 2;
  },
  // 흔들리는 조합이면 날개가 흔들리는 모습을 계속 보여 준다
  get animated() { return game.mode === 'challenge' && game.parts && liftScaleOf(game.parts, game.pick) < 1; },
  draw(now) {
    drawBg();
    const wobble = this.animated ? Math.sin(now / 70) * 0.9 : 0;
    drawBigeo(ctx, game.pick, 420, 330, 1.6, wobble * 1.5, wobble);
    drawHamo(ctx, game.isRetry ? 'retry' : 'build', 130, 720, 220, 230);
  },
};

// ----- flight -----
const READY_MS = 900, LAND_MS = 1700;

screens.flight = {
  animated: true,
  enter() {
    const challenge = game.mode === 'challenge', stage = currentStage();
    setBg(challenge ? 'flightC' + stage.goal : 'flight');
    ui.className = 'collecting'; // 끄는 동안 화면이 움직이지 않게
    this.manual = challenge ? stage.launch === 'pull' : settings.easyControl;
    this.thermal = challenge || settings.easyControl; // 쉬운 모드 자동 비행은 기존 결과 그대로
    this.maxDrums = challenge ? stage.drums : 0;
    this.scale = challenge ? liftScaleOf(game.parts, game.pick) : 1;
    this.ctl = null;
    this.pops = [];
    this.drumAt = -1e9;
    this.pauseAt = 0;
    this.landed = false;
    this.drumTutorialPending = false;
    game.flight = null;
    game.flightCursor = 0;
    if (this.manual) {
      const K = CONTROL;
      this.phase = 'aim';
      this.aim = { angle: K.startAngle, power: K.startPower, active: false, dragging: false, pull: 0, previewKey: '', preview: [] };
      this.aimStart = performance.now();
      showTutorial('pull', px(0) - 150, py(CONFIG.flight.launchHeight) + 90);
    } else {
      this.launch();
    }
  },
  onPause() { this.pauseAt = performance.now(); },
  onResume() {
    const gap = performance.now() - this.pauseAt;
    this.pauseAt = 0;
    game.flightStart += gap;
    this.aimStart += gap;
  },
  // 발사: angle이 없으면 자동 발사(최적 각도·세기)
  launch(angle, power) {
    const p = game.pick;
    if (this.thermal || angle !== undefined) {
      this.ctl = { thermal: this.thermal, drums: [] };
      if (angle !== undefined) { this.ctl.angle = angle; this.ctl.power = power; }
    }
    const fl = simulateFlight(p.wing, p.body, p.ballast, this.scale, this.ctl);
    fl.rate = fl.simSeconds / fl.playSeconds; // 비행 내내 같은 빠르기로 재생
    game.flight = fl;
    game.flightStart = performance.now() - (angle !== undefined ? READY_MS : 0);
    game.flightCursor = 0;
    this.phase = 'fly';
    if (angle !== undefined) sfx.play('launch');
    if (this.maxDrums > 0) this.drumTutorialPending = true;
  },

  // ----- 조준 -----
  pointerDown(x, y) {
    if (this.phase === 'fly') { this.tapDrum(); return; }
    const ox = px(0), oy = py(CONFIG.flight.launchHeight);
    if (Math.hypot(x - ox, y - oy) > 230) return; // 비거 근처를 눌러야 잡힘
    this.aim.dragging = true;
    this.aim.active = true;
    this.aimStart = performance.now();
    this.dragTo(x, y);
  },
  dragTo(x, y) {
    const K = CONTROL, a = this.aim, ox = px(0), oy = py(CONFIG.flight.launchHeight);
    if (!a.dragging) return;
    this.aimStart = performance.now();
    const dx = ox - x, dy = y - oy; // 왼쪽 아래로 끌수록 오른쪽 위로 쏜다
    const len = Math.hypot(dx, dy);
    a.pull = len;
    if (len > 8) a.angle = clamp(Math.atan2(dy, Math.max(dx, 0.001)) * 180 / Math.PI, K.minAngle, K.maxAngle);
    a.power = K.minPower + (1 - K.minPower) * clamp(len / K.maxPull, 0, 1);
  },
  pointerUp() {
    const a = this.aim;
    if (!a || !a.dragging) return;
    a.dragging = false;
    if (a.pull < CONTROL.minPull) { a.active = false; return; } // 살짝 끌면 발사하지 않음
    this.launch(a.angle, a.power);
  },
  key(k) {
    const K = CONTROL;
    if (this.phase === 'fly') { if (k === ' ') this.tapDrum(); return; }
    const a = this.aim;
    a.active = true;
    this.aimStart = performance.now();
    if (k === 'ArrowUp') a.angle = clamp(a.angle + K.keyAngleStep, K.minAngle, K.maxAngle);
    else if (k === 'ArrowDown') a.angle = clamp(a.angle - K.keyAngleStep, K.minAngle, K.maxAngle);
    else if (k === 'ArrowRight') a.power = clamp(a.power + K.keyPowerStep, K.minPower, 1);
    else if (k === 'ArrowLeft') a.power = clamp(a.power - K.keyPowerStep, K.minPower, 1);
    else if (k === ' ') this.launch(a.angle, a.power);
  },
  powerColor(power) {
    return (CONTROL.powerBands.find(b => power <= b.upTo + 1e-6) || CONTROL.powerBands[0]).color;
  },
  drawAim(now) {
    const K = CONTROL, a = this.aim, ox = px(0), oy = py(CONFIG.flight.launchHeight);
    // 15·30·45도 눈금
    ctx.fillStyle = C.ink;
    ctx.font = '800 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const deg of K.angleMarks) {
      const r = deg * Math.PI / 180;
      ctx.lineWidth = 5; ctx.strokeStyle = C.ink;
      ctx.beginPath(); ctx.moveTo(ox + Math.cos(r) * 130, oy - Math.sin(r) * 130); ctx.lineTo(ox + Math.cos(r) * 190, oy - Math.sin(r) * 190); ctx.stroke();
      haloText(ctx, deg + '°', ox + Math.cos(r) * 232, oy - Math.sin(r) * 232);
    }
    ctx.fillStyle = C.ink;
    const r = a.angle * Math.PI / 180;
    const back = a.active ? clamp((a.power - K.minPower) / (1 - K.minPower), 0, 1) * 95 + 15 : 0;
    const bx = ox - Math.cos(r) * back, by = oy + Math.sin(r) * back;
    if (a.active) {
      // 예상 궤적(앞부분만)
      const key = Math.round(a.angle) + '/' + a.power.toFixed(2);
      if (key !== a.previewKey) {
        const p = game.pick;
        const s = simulateFlight(p.wing, p.body, p.ballast, this.scale, { angle: a.angle, power: a.power, thermal: this.thermal }).samples;
        a.preview = s.slice(0, Math.ceil(s.length * K.previewShare));
        a.previewKey = key;
      }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.setLineDash([12, 16]); ctx.lineCap = 'round';
      ctx.beginPath();
      a.preview.forEach((q, i) => { if (i === 0) ctx.moveTo(px(q.x), py(q.y)); else ctx.lineTo(px(q.x), py(q.y)); });
      ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
    }
    drawBigeo(ctx, game.pick, bx, by, 0.62, a.angle, 0);
    if (a.active) {
      // 고무줄: 길이 = 세기(3단계 색)
      ctx.strokeStyle = this.powerColor(a.power); ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ox + 26, oy + 34); ctx.lineTo(bx, by + 10); ctx.lineTo(ox - 66, oy + 28); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = C.ink; ctx.font = '900 56px system-ui, sans-serif'; ctx.textAlign = 'left';
      haloText(ctx, Math.round(a.angle) + '°', ox + 260, oy - 150);
    }
    // 오래 가만히 있으면 손가락 안내
    if (!a.dragging && now - this.aimStart > K.idleHintSeconds * 1000 && !game.tut) {
      const t = ((now - this.aimStart) % 1400) / 1400, k = t < 0.7 ? t / 0.7 : 1;
      drawFinger(ctx, ox - 110 * k, oy + 64 * k + 10, 1.5);
      ctx.fillStyle = C.ink; ctx.font = '900 64px system-ui, sans-serif'; ctx.textAlign = 'center';
      haloText(ctx, CONTROL_TEXT.pullHint, 960, 200);
    }
    ctx.textBaseline = 'middle';
  },

  // ----- 배 두드리기 -----
  tapDrum() {
    const fl = game.flight;
    if (!fl || this.maxDrums <= 0 || game.tut || !this.ctl || this.ctl.drums.length >= this.maxDrums) return;
    const flyMs = performance.now() - game.flightStart - READY_MS;
    const simT = (flyMs / 1000) * fl.rate;
    if (simT <= 0 || simT >= fl.simSeconds) return;
    this.ctl.drums.push(simT);
    const p = game.pick, again = simulateFlight(p.wing, p.body, p.ballast, this.scale, this.ctl);
    again.rate = fl.rate;
    game.flight = again;
    this.drumAt = performance.now();
    const pos = this.sampleAt(simT);
    this.pops.push({ x: px(pos.x) + 80, y: py(pos.y) - 90, at: this.drumAt });
    sfx.play('drum');
  },
  drawDrums(now) {
    const used = this.ctl ? this.ctl.drums.length : 0;
    for (let i = 0; i < this.maxDrums; i++) drawDrum(ctx, 960 + (i - (this.maxDrums - 1) / 2) * 96, 68, 1, i < used);
    this.pops = this.pops.filter(q => now - q.at < 700);
    for (const q of this.pops) {
      const k = (now - q.at) / 700;
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = C.orangeDark;
      ctx.font = '900 84px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      haloText(ctx, CONTROL_TEXT.drumPop, q.x, q.y - k * 70);
      ctx.restore();
    }
  },
  // 아요가 몸통을 두드리는 앞발
  drawPaw(x, y, pitch, now) {
    const age = now - this.drumAt;
    if (age > 260) return;
    const hit = Math.abs(Math.sin(age / 260 * Math.PI * 2));
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-pitch * Math.PI / 180); ctx.scale(0.62, 0.62);
    ctx.beginPath(); ctx.ellipse(AYO_SIZE.seatX - 50, -30 + hit * 22, 20, 15, -0.4, 0, Math.PI * 2);
    fillStroke(ctx, C.orange, 4);
    ctx.restore();
  },
  // 상승 기류: 남강 위의 아지랑이 세로 물결
  drawThermals(now) {
    if (!this.thermal) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (const z of CONTROL.thermals) {
      const x0 = px(z.from), x1 = px(z.to), n = 4;
      for (let i = 0; i < n; i++) {
        const x = x0 + (x1 - x0) * (i + 0.5) / n;
        ctx.beginPath();
        for (let y = GROUND_Y; y > py(CONFIG.flight.launchHeight) - 40; y -= 22) {
          const wave = Math.sin(y / 34 + now / 260 + i * 1.7) * 9;
          if (y === GROUND_Y) ctx.moveTo(x + wave, y); else ctx.lineTo(x + wave, y);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  // 재생 시간에 맞는 궤적 위치를 보간해서 구한다
  sampleAt(simT) {
    const s = game.flight.samples;
    let i = game.flightCursor;
    if (i >= s.length || s[i].t > simT) i = 0;
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
    if (game.tut && this.pauseAt) now = this.pauseAt; // 안내 중에는 멈춤
    drawBg();
    this.drawThermals(now);
    if (this.phase === 'aim') {
      this.drawAim(now);
      this.drawReadout(0);
      return;
    }
    const fl = game.flight;
    const elapsed = now - game.flightStart;
    const flyMs = elapsed - READY_MS;
    if (this.maxDrums > 0) this.drawDrums(now);

    if (flyMs < 0) {                 // 출발 준비
      const first = fl.samples[0];
      drawBigeo(ctx, game.pick, px(first.x), py(first.y), 0.62, 8, 0);
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 110px system-ui, sans-serif';
      ctx.fillText(TEXT.go, 960, 280);
      this.drawReadout(0);
      return;
    }
    const simT = (flyMs / 1000) * fl.rate;
    if (simT < fl.simSeconds) {      // 비행 중
      const pos = this.sampleAt(simT);
      this.drawTrail(pos);
      // 금 간 대나무나 끈이 없으면 비행 중에 흔들린다
      const shake = fl.liftScale < 1 ? Math.sin(now / 55) : 0;
      drawBigeo(ctx, game.pick, px(pos.x), py(pos.y) + shake * 5, 0.62, pos.pitch + shake * 7, Math.sin(now / 90) * 0.5 + 0.5);
      this.drawPaw(px(pos.x), py(pos.y) + shake * 5, pos.pitch + shake * 7, now);
      this.drawReadout(pos.x);
      // 처음 나오는 배 두드리기 안내는 떠오른 뒤에 보여 준다
      if (this.drumTutorialPending && simT > 0.5) {
        this.drumTutorialPending = false;
        showTutorial('drum', Math.min(px(pos.x) + 60, 1500), py(pos.y) + 30);
      }
      return;
    }
    // 착지·추락
    const last = fl.samples[fl.samples.length - 1];
    const pos = { i: fl.samples.length - 1, x: last.x, y: last.y };
    this.drawTrail(pos);
    const landAge = flyMs - (fl.simSeconds / fl.rate) * 1000;
    if (!this.landed) { this.landed = true; sfx.play(fl.inRiver ? 'splash' : 'empty'); }
    if (fl.inRiver) this.drawSplash(last, landAge);
    else this.drawLanded(last, landAge);
    this.drawFlag(last.x);
    this.drawReadout(fl.distance);

    if (landAge > LAND_MS) {
      this.landed = false;
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
    saveTop(fl, game.mode);
    this.success = game.mode === 'challenge' && isChallengeSuccess(fl, currentStage());
    sfx.play(this.success || fl.grade === 'best' ? 'win' : 'empty');
    if (game.mode === 'challenge') { this.enterChallenge(fl); return; }

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
  // 조종했으면 "발사 각도 32° · 두드리기 2번"
  addControlLine(fl) {
    if (fl.angle === null) return;
    const T = CONTROL_TEXT, stage = game.mode === 'challenge' ? currentStage() : null;
    const line = (stage && stage.drums > 0 ? T.line : T.lineNoDrum).replace('{angle}', fl.angle).replace('{drums}', fl.drumsUsed);
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
    const designKey = ok ? null : challengeFeedbackKey(game.parts, game.pick);
    const ctlKey = designKey ? null : controlFeedbackKey(fl, stage, ok);
    if (ok) {
      bubble.append(el('p', '', S.success));
      if (ctlKey) bubble.append(el('p', 'cheer', CONTROL_TEXT[ctlKey]));
      else if (fl.grade === 'best') bubble.append(el('p', 'cheer', TEXT.bestExtra));
      if (opened) bubble.append(el('p', 'cheer', STAGE_TEXT.opened.replace('{name}', STAGES[stage.id].name)));
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
    if (ok && stage.id < STAGES.length && !progress.fixed) {
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
    // 가진 재료 중 가장 큰 날개, 가장 가벼운 몸통을 먼저 골라 둔다
    const wing = ['big', 'normal', 'small'].find(k => wingUnlocked(game.parts, k));
    const body = Object.keys(CONFIG.bodies)
      .filter(k => game.parts.bodies.includes(k))
      .sort((p, q) => CONFIG.bodies[p].weight - CONFIG.bodies[q].weight)[0];
    game.pick = { wing, body, ballast: CHALLENGE.defaultBallast };
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
    if (ITEMS[item.type].torn || ITEMS[item.type].cracked) showTutorial('state', 960, 340);
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
      drawItem(ctx, 'paper', 0, 0, 1.25);
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
  window.addEventListener('pointerdown', () => { sfx.ensure(); stopSpeaking(); }, { passive: true });

  const toLogical = e => {
    const rect = ui.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  };
  // 모으기·비행 화면: 터치·클릭
  ui.addEventListener('pointerdown', e => {
    const scr = screens[game.screen];
    if (!scr.pointerDown || game.tut || e.target.closest('button, .loot-popup, .confirm-back, .tut-back')) return;
    const p = toLogical(e);
    scr.pointerDown(p.x, p.y);
  });
  // 비행 화면: 끌기와 놓기는 손가락이 화면 밖으로 나가도 받는다
  window.addEventListener('pointermove', e => {
    if (game.screen === 'flight' && screens.flight.phase === 'aim') { const p = toLogical(e); screens.flight.dragTo(p.x, p.y); }
  });
  for (const type of ['pointerup', 'pointercancel']) {
    window.addEventListener(type, () => { if (game.screen === 'flight' && screens.flight.phase === 'aim') screens.flight.pointerUp(); });
  }
  // 모으기 화면: PC 방향키, 스페이스바·Enter로 뒤지기
  const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    touched();
    sfx.ensure();
    if (game.tut) { e.preventDefault(); if (!e.repeat) game.tut.close(); return; } // 안내는 아무 키로 닫힘
    if (game.screen === 'flight') {
      if (ARROWS.includes(e.key) || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement) document.activeElement.blur();
        if (!(e.key === ' ' && e.repeat)) screens.flight.key(e.key);
      }
      return;
    }
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
  game.lastInput = performance.now();
  await preload();
  go('title');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') boot();
