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
function simulateFlight(wingKey, bodyKey, ballastKey, liftScale = 1) {
  const f = CONFIG.flight;
  const wing = CONFIG.wings[wingKey];
  const body = CONFIG.bodies[bodyKey];
  const ballast = CONFIG.ballasts[ballastKey];
  const ratio = wing.lift * liftScale / body.weight;

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
    wing: wingKey, body: bodyKey, ballast: ballastKey, liftScale,
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

// 내용물을 섞어서 HIDE_SPOTS 순서대로 돌려준다
function shuffleLoot(seed) {
  const rng = createRng(seed);
  const pool = [];
  for (const row of LOOT_TABLE) for (let i = 0; i < row.count; i++) pool.push(row.item);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
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
function partsFromBag(bag, empties = 0) {
  const items = bag.filter(Boolean);
  const count = t => items.filter(x => x === t).length;
  const torn = items.filter(t => ITEMS[t].torn).length;
  const clean = items.filter(t => ITEMS[t].use === 'wing' && !ITEMS[t].torn).length;
  const paper = clean + torn * STATE_EFFECT.tornPaperValue;
  const bodies = [...new Set(items.filter(t => ITEMS[t].use === 'body').map(t => ITEMS[t].bodyKey))];
  const hasString = items.some(t => ITEMS[t].use === 'string');
  // 튼튼한 대나무가 있으면 그것을 쓰고, 금 간 대나무만 있을 때 흔들린다
  const crackedOnly = count('crackedBamboo') > 0 && count('bamboo') === 0;
  const minNeed = Math.min(...Object.values(CHALLENGE.wingNeedPaper));
  return { paper, torn, bodies, hasString, crackedOnly, empties, canBuild: paper >= minNeed && bodies.length > 0 };
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

function isChallengeSuccess(flight) { return !flight.crashed && flight.distance >= SUCCESS_DISTANCE; }

// 도전 모드 피드백: 위에서 먼저 맞는 것 하나. 해당 없으면 null(기존 FEEDBACK만 사용)
function challengeFeedbackKey(parts, pick) {
  if (pick.body === 'iron' && !parts.bodies.includes('bamboo')) return 'ironNoBamboo';
  if (usesCracked(parts, pick)) return 'crackedBamboo';
  if (parts.torn > 0) return 'tornPaper';
  if (parts.empties >= 3) return 'manyEmpty';
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

// 대표 가방 조합 검사 — 브라우저 콘솔에서 runChallengeCombos() 실행
function runChallengeCombos() {
  const B = 'bamboo', Cr = 'crackedBamboo', P = 'paper', Tp = 'tornPaper', Wd = 'wood', I = 'iron', S = 'string';
  // must: 'ok' 성공 / 'fail' 실패 / 'near' 성공 또는 목표 근처 / 'cannot' 만들 수 없음, fb: 기대 피드백
  const cases = [
    { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'center', must: 'ok' },
    { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'front',  must: 'fail', fb: null },
    { bag: [B, P, P, P, S],    wing: 'big',    body: 'bamboo', ballast: 'back',   must: 'fail', fb: null },
    { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'center', must: 'near' },
    { bag: [B, P, P, S],       wing: 'normal', body: 'bamboo', ballast: 'back',   must: 'fail', fb: 'littlePaper' },
    { bag: [B, P, P, P],       wing: 'big',    body: 'bamboo', ballast: 'center', must: 'near' },
    { bag: [Wd, P, P, P],      wing: 'big',    body: 'wood',   ballast: 'center', must: 'fail', fb: 'noString' },
    { bag: [B, P, S],          wing: 'small',  body: 'bamboo', ballast: 'center', must: 'fail', fb: 'littlePaper' },
    { bag: [Wd, P, P, P, S],   wing: 'big',    body: 'wood',   ballast: 'center', must: 'fail', fb: null },
    { bag: [Wd, P, P, S],      wing: 'normal', body: 'wood',   ballast: 'center', must: 'fail', fb: 'littlePaper' },
    { bag: [Wd, P, P, S],      wing: 'normal', body: 'wood',   ballast: 'center', must: 'fail', empties: 3, fb: 'manyEmpty' },
    { bag: [I, P, P, P, S],    wing: 'big',    body: 'iron',   ballast: 'center', must: 'fail', fb: 'ironNoBamboo' },
    { bag: [B, I, P, P, P],    wing: 'big',    body: 'iron',   ballast: 'center', must: 'fail', fb: 'noString' },
    // 금 간 대나무
    { bag: [Cr, P, P, P, S],   wing: 'big',    body: 'bamboo', ballast: 'center', must: 'near' },
    { bag: [Cr, P, P, S],      wing: 'normal', body: 'bamboo', ballast: 'center', must: 'fail', fb: 'crackedBamboo' },
    { bag: [Cr, P, P, P],      wing: 'big',    body: 'bamboo', ballast: 'center', must: 'fail', fb: 'crackedBamboo' },
    { bag: [Cr, P, P, P, S],   wing: 'big',    body: 'bamboo', ballast: 'back',   must: 'fail', fb: 'crackedBamboo' },
    { bag: [B, Cr, P, P, P],   wing: 'big',    body: 'bamboo', ballast: 'center', must: 'near' }, // 튼튼한 대나무를 쓰므로 안 흔들림
    // 찢어진 한지
    { bag: [B, P, P, Tp, S],   wing: 'normal', body: 'bamboo', ballast: 'center', must: 'near', locked: 'big' }, // 2.5개 → 보통
    { bag: [B, P, Tp, S],      wing: 'small',  body: 'bamboo', ballast: 'center', must: 'fail', locked: 'normal', fb: 'tornPaper' }, // 1.5개 → 작은
    { bag: [B, P, P, Tp, S],   wing: 'normal', body: 'bamboo', ballast: 'front',  must: 'fail', fb: 'tornPaper' },
    { bag: [Wd, P, P, P, Tp],  wing: 'big',    body: 'wood',   ballast: 'center', must: 'fail', fb: 'tornPaper' },
    // 만들 수 없음
    { bag: [B, Tp, S],         must: 'cannot' }, // 찢어진 한지만으로는 0.5개
    { bag: [P, P, P, S],       must: 'cannot' },
    { bag: [B, S],             must: 'cannot' },
    { bag: [],                 must: 'cannot' },
  ];
  const label = bag => {
    const n = {};
    bag.forEach(t => { n[ITEMS[t].name] = (n[ITEMS[t].name] || 0) + 1; });
    return Object.keys(n).map(k => n[k] > 1 ? `${k}${n[k]}` : k).join('+') || '(빈 가방)';
  };
  const rows = [], problems = [];
  for (const c of cases) {
    const name = label(c.bag);
    if (c.bag.length > BAG_SIZE) problems.push(`${name}: 가방 칸 초과`);
    const parts = partsFromBag(c.bag, c.empties || 0);
    if (c.must === 'cannot') {
      rows.push({ 가방: name, 조립: '-', '거리(m)': '-', 결과: '만들 수 없음', 피드백: '부품이 모자람' });
      if (parts.canBuild) problems.push(`${name}: 만들 수 없어야 함`);
      continue;
    }
    if (!parts.canBuild) { problems.push(`${name}: 만들 수 있어야 함`); continue; }
    if (!wingUnlocked(parts, c.wing)) problems.push(`${name}: ${c.wing} 날개가 잠겨 있음`);
    if (c.locked && wingUnlocked(parts, c.locked)) problems.push(`${name}: ${c.locked} 날개는 잠겨 있어야 함`);
    if (!parts.bodies.includes(c.body)) problems.push(`${name}: ${c.body} 몸통 재료가 없음`);
    const pick = { wing: c.wing, body: c.body, ballast: c.ballast };
    const fl = simulateFlight(c.wing, c.body, c.ballast, liftScaleOf(parts, pick));
    const ok = isChallengeSuccess(fl);
    const extra = ok ? null : challengeFeedbackKey(parts, pick);
    rows.push({
      가방: name + (c.empties ? ` (꽝 ${c.empties}번)` : ''),
      조립: `${CONFIG.wings[c.wing].short}/${CONFIG.bodies[c.body].short}/${CONFIG.ballasts[c.ballast].short}`,
      '힘 배율': +liftScaleOf(parts, pick).toFixed(2), '거리(m)': fl.distance, 결과: ok ? '성공' : `실패(${GRADE_TEXT[fl.grade]})`,
      피드백: ok ? 'success' : `${fl.feedback}${extra ? ' + ' + extra : ''}`,
    });
    if (c.must === 'ok' && !ok) problems.push(`${name}: 반드시 성공해야 함(${fl.distance}m)`);
    if (c.must === 'fail' && ok) problems.push(`${name}: 실패해야 함(${fl.distance}m)`);
    if (c.must === 'near' && !ok && SUCCESS_DISTANCE - fl.distance > 15) problems.push(`${name}: 목표 근처여야 함(${fl.distance}m)`);
    if ('fb' in c && !ok && extra !== c.fb) problems.push(`${name}: 피드백이 ${c.fb}여야 하는데 ${extra}`);
    if ((c.body === 'iron' || c.ballast === 'back') && ok) problems.push(`${name}: 쇠 몸통·뒤 무게추인데 성공`);
  }
  // 쇠 몸통·뒤 무게추는 어떤 조합이어도 실패
  for (const wing of Object.keys(CONFIG.wings)) for (const scale of [1, 0.85, 0.7225]) {
    for (const body of Object.keys(CONFIG.bodies)) for (const ballast of Object.keys(CONFIG.ballasts)) {
      if ((body === 'iron' || ballast === 'back') && isChallengeSuccess(simulateFlight(wing, body, ballast, scale))) {
        problems.push(`${wing}/${body}/${ballast}: 반드시 실패해야 함`);
      }
    }
  }
  // 쇠 하나당 속도 20% 감소
  if (Math.abs(speedScaleOf(['iron']) - 0.8) > 0.001) problems.push('쇠 속도 감소가 20%가 아님');

  // ----- 배치 검사 -----
  const lootTotal = LOOT_TABLE.reduce((n, r) => n + r.count, 0);
  if (lootTotal !== HIDE_SPOTS.length) problems.push(`내용물 ${lootTotal}개, 숨김 장소 ${HIDE_SPOTS.length}곳: 수가 다름`);
  const hideNames = new Set(HIDE_SPOTS.map(s => `${s.area}/${s.kind}`));
  if (hideNames.size !== HIDE_SPOTS.length) problems.push('장소+종류 이름이 겹쳐서 힌트가 헷갈림');
  const seedList = [1, 2, 3];
  const layouts = seedList.map(shuffleLoot);
  const seedRows = HIDE_SPOTS.map((s, i) => {
    const row = { 장소: `${placeName(s.area)} ${HIDE_SPOT_KINDS[s.kind]}` };
    seedList.forEach((seed, k) => { row[`시드 ${seed}`] = layouts[k][i] === 'empty' ? '꽝' : ITEMS[layouts[k][i]].name; });
    return row;
  });
  if (new Set(layouts.map(l => l.join())).size !== seedList.length) problems.push('시드가 달라도 배치가 같음');
  if (shuffleLoot(1).join() !== shuffleLoot(1).join()) problems.push('같은 시드인데 배치가 다름');

  // 힌트는 항상 실제 배치와 일치
  const hintSamples = [];
  for (let seed = 1; seed <= 200; seed++) {
    const rng = createRng(seed + 1000), loot = shuffleLoot(seed);
    const spots = HIDE_SPOTS.map((s, i) => ({ ...s, loot: loot[i], opened: false, hint: null }));
    for (let k = 0; k < VILLAGERS.length; k++) {
      const h = makeHint(spots, rng);
      const spot = spots.find(s => s.id === h.spotId);
      if (!spot || spot.loot !== h.item) problems.push(`시드 ${seed}: 거짓 힌트 "${h.text}"`);
      else spot.hint = h.item;
      if (seed <= 2) hintSamples.push(h.text);
    }
  }

  // ----- 시간 검사(걷기·뒤지기는 계산값, 팝업 판단 시간은 가정값) -----
  const decisionSeconds = 1.5; // 부품 팝업에서 담기·두고 가기를 고르는 시간(가정)
  const stands = [CHALLENGE.start, ...HIDE_SPOTS.map(s => ({ x: s.sx, y: s.sy }))];
  stands.forEach((p, i) => { if (isBlocked(p.x, p.y)) problems.push(`${i}번 서는 자리가 막혀 있음`); });
  for (const v of VILLAGERS) if (isBlocked(v.sx, v.sy)) problems.push(`${v.id} 서는 자리가 막혀 있음`);
  const dist = stands.map(a => stands.map(b => pathLength(a, b)));
  dist.forEach((row, i) => row.forEach((d, j) => { if (i !== j && d === 0) problems.push(`${i}→${j} 길이 없음`); }));
  const allStops = HIDE_SPOTS.map((_, i) => i + 1);
  const parts9 = LOOT_TABLE.filter(r => r.item !== 'empty').reduce((n, r) => n + r.count, 0);
  const walkAll = shortestTour(dist, allStops) / CHALLENGE.walkSpeed;
  const allSeconds = walkAll + HIDE_SPOTS.length * SEARCH_TIME + parts9 * decisionSeconds;
  if (allSeconds < 80 || allSeconds > 90) problems.push(`전부 뒤지기 ${allSeconds.toFixed(1)}초(목표 80~90초)`);

  // 위치를 다 안다고 할 때 최적 가방을 모으는 시간: 어떤 배치에서도 60초 안에 가능해야 함
  let worst = 0, sum = 0;
  const seedsChecked = 500;
  for (let seed = 1; seed <= seedsChecked; seed++) {
    const loot = shuffleLoot(seed);
    const needAt = t => allStops.filter(i => loot[i - 1] === t);
    let bestSec = Infinity;
    const papers = needAt('paper');
    const stops = [...needAt('bamboo'), ...needAt('string'), ...papers];
    bestSec = shortestTour(dist, stops) / CHALLENGE.walkSpeed + 5 * (SEARCH_TIME + decisionSeconds);
    worst = Math.max(worst, bestSec); sum += bestSec;
  }
  if (worst > TIME_LIMIT) problems.push(`최적 가방이 ${worst.toFixed(1)}초 걸리는 배치가 있음`);
  const timing = {
    '걷는 속도(px/s)': CHALLENGE.walkSpeed,
    '맵 끝에서 끝까지(초)': +((CHALLENGE.walkArea.w - 2 * CHALLENGE.ayoRadius) / CHALLENGE.walkSpeed).toFixed(1),
    '12곳 최단 걷기(초)': +walkAll.toFixed(1),
    '뒤지기 합계(초)': HIDE_SPOTS.length * SEARCH_TIME,
    '팝업 판단 합계(가정, 초)': parts9 * decisionSeconds,
    '전부 뒤지기 합계(초)': +allSeconds.toFixed(1),
    '최적 가방 평균(위치를 알 때, 초)': +(sum / seedsChecked).toFixed(1),
    '최적 가방 최악(위치를 알 때, 초)': +worst.toFixed(1),
  };

  console.table(rows);
  console.table(seedRows);
  console.table([timing]);
  if (problems.length) console.warn('문제 ' + problems.length + '건:\n' + problems.join('\n'));
  else console.log('도전 모드 조합 검사 통과');
  return { rows, problems, seedRows, timing, hintSamples };
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
  const combo = `${flight.wing}/${flight.body}/${flight.ballast}/${flight.liftScale}`;
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
  mode: 'easy', parts: null, collect: null,
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

// challenge: 도전 모드 비행 배경(왼쪽이 진주성, 오른쪽이 성 밖)
function renderLandscape(c, withRuler, challenge) {
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
  const gx = px(100);
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
    c.fillText(challenge ? TEXT.castle : TEXT.hill, 24, topY + 130);
    if (!challenge) c.fillText(TEXT.castle, gx - 78, GROUND_Y - 30);
    c.fillStyle = '#1f5f5a'; // 강 이름은 추락 장면과 겹치지 않게 모래밭 쪽에
    c.fillText('← ' + TEXT.river, px(w.riverEnd) + 24, GROUND_Y + 66);
    if (challenge) renderGoal(c, topY);
    renderRuler(c);
  }
}

// 도전 모드: 산 위의 성벽과 목표 지점 깃발
function renderGoal(c, topY) {
  c.fillStyle = C.wall; c.fillRect(0, topY - 66, px(-15), 100);
  c.fillStyle = C.wallDark;
  for (let x = 6; x < px(-15) - 20; x += 44) c.fillRect(x, topY - 84, 26, 18);

  const gx = px(SUCCESS_DISTANCE);
  c.fillStyle = '#fbf0c6'; // 목표 지점부터 모래밭 색을 밝게
  c.fillRect(gx, GROUND_Y - 4, W - gx, RULER_Y - GROUND_Y + 4);
  c.fillStyle = C.ink; c.fillRect(gx - 4, GROUND_Y - 230, 8, 234);
  c.beginPath(); c.moveTo(gx + 4, GROUND_Y - 230); c.lineTo(gx + 124, GROUND_Y - 192); c.lineTo(gx + 4, GROUND_Y - 154); c.closePath();
  fillStroke(c, C.orange);
  c.fillStyle = C.ink; c.font = '800 50px system-ui, sans-serif';
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(TEXT.goalFlag, gx + 16, GROUND_Y - 110);
  c.fillText(`${SUCCESS_DISTANCE}m`, gx + 16, GROUND_Y - 54);
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
    roundBox(c, v.x - 26, by - 18, 52, 34, 12); fillStroke(c, '#ffffff', 3);
    c.beginPath(); c.moveTo(v.x - 6, by + 15); c.lineTo(v.x, by + 25); c.lineTo(v.x + 6, by + 15); c.closePath(); c.fillStyle = '#fff'; c.fill();
    c.fillStyle = C.ink;
    for (const dx of [-11, 0, 11]) { circle(c, v.x + dx, by, 3); c.fill(); }
  }
}

function setBg(kind) {
  if (bgKind === kind) return;
  bgKind = kind;
  resetTransform(bgCtx);
  if (kind === 'title') renderLandscape(bgCtx, false);
  else if (kind === 'flight') renderLandscape(bgCtx, true);
  else if (kind === 'flightChallenge') renderLandscape(bgCtx, true, true);
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
  if (mode === 'challenge') { go('challengeIntro'); return; }
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
}

function goHome() {
  newSession();
  game.goodbye = true;
  go('title');
}

function twoLineButton(className, main, sub, onTap) {
  const b = button(className, main, onTap);
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
    ui.append(el('h1', 'sheet abs title-sign', TEXT.title));

    const panel = el('div', 'sheet abs top-panel');
    panel.append(el('h2', '', TEXT.topTitle));
    const cols = el('div', 'top-cols');
    cols.append(topColumn(TEXT.startEasy, 'easy'), topColumn(TEXT.startChallenge, 'challenge'));
    panel.append(cols);
    ui.append(panel);

    const hello = el('div', 'bubble title-bubble', game.goodbye ? TEXT.titleBye : TEXT.titleHello);
    ui.append(hello);
    ui.append(twoLineButton('primary start-btn start-easy', TEXT.startEasy, TEXT.startEasySub, () => {
      game.goodbye = false;
      game.mode = 'easy';
      go('story');
    }));
    ui.append(twoLineButton('start-btn start-hard', TEXT.startChallenge, TEXT.startChallengeSub, () => {
      game.goodbye = false;
      game.mode = 'challenge';
      go('challengeIntro');
    }));
  },
  draw(now) {
    drawBg();
    const bob = Math.sin(now / 600) * 10;
    drawBigeo(ctx, game.pick, 1090, 660 + bob, 1, 4, Math.sin(now / 250) * 0.5 + 0.5);
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
    ui.append(button('primary big fly-btn', TEXT.fly, () => go('flight')));
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
  enter() {
    const challenge = game.mode === 'challenge';
    setBg(challenge ? 'flightChallenge' : 'flight');
    const p = game.pick;
    game.flight = simulateFlight(p.wing, p.body, p.ballast, challenge ? liftScaleOf(game.parts, p) : 1);
    game.flightStart = performance.now();
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
      // 금 간 대나무나 끈이 없으면 비행 중에 흔들린다
      const shake = fl.liftScale < 1 ? Math.sin(now / 55) : 0;
      drawBigeo(ctx, game.pick, px(pos.x), py(pos.y) + shake * 5, 0.62, pos.pitch + shake * 7, Math.sin(now / 90) * 0.5 + 0.5);
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
function buildChart(compact) {
  const barMax = compact ? 3.7 : 10.2;
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
    if (game.mode === 'challenge') { this.enterChallenge(fl); return; }

    ui.append(el('div', 'abs grade ' + fl.grade, GRADE_TEXT[fl.grade]));
    const dist = el('div', 'abs distance', String(fl.distance));
    dist.append(el('small', '', 'm'));
    ui.append(dist);
    ui.append(el('div', 'bubble result-bubble', FEEDBACK[fl.feedback]));
    ui.append(buildChart());
    ui.append(button('primary result-retry', TEXT.retry, () => { game.isRetry = true; go('build'); }));
    ui.append(button('result-quiz', TEXT.toQuiz, () => go('quiz')));
    ui.append(button('result-other', TEXT.tryChallenge, () => switchMode('challenge')));
  },
  // 도전 모드 결과: 기존 결과 + 목표 안내 + 전용 피드백 + 버튼 3개
  enterChallenge(fl) {
    const S = CHALLENGE_STORY;
    const ok = isChallengeSuccess(fl);
    ui.className = 'result-challenge';
    ui.append(el('div', 'abs grade ' + (ok ? 'best' : fl.grade), ok ? S.successTitle : GRADE_TEXT[fl.grade]));
    const dist = el('div', 'abs distance', String(fl.distance));
    dist.append(el('small', '', 'm'));
    ui.append(dist);
    const goalText = ok
      ? S.goalReached.replace('{goal}', SUCCESS_DISTANCE)
      : S.goalLeft.replace('{goal}', SUCCESS_DISTANCE).replace('{left}', SUCCESS_DISTANCE - fl.distance);
    ui.append(el('div', 'abs goal-line', goalText));

    const bubble = el('div', 'bubble challenge-bubble' + (ok ? ' ok' : ''));
    if (ok) bubble.append(el('p', '', S.success));
    else {
      bubble.append(el('p', '', FEEDBACK[fl.feedback]));
      const key = challengeFeedbackKey(game.parts, game.pick);
      if (key) bubble.append(el('p', 'extra', CHALLENGE_FEEDBACK[key]));
    }
    ui.append(bubble);
    ui.append(buildChart(true));
    ui.append(button('primary c-retry', S.retryFull, () => go('collect')));
    ui.append(button('c-quiz', TEXT.toQuiz, () => go('quiz')));
    ui.append(button('c-other', TEXT.tryEasy, () => switchMode('easy')));
  },
  draw() {
    drawBg();
    if (game.mode === 'challenge') {
      drawHamo(ctx, isChallengeSuccess(game.flight) ? 'challengeSuccess' : game.flight.grade, 150, 715, 220, 270);
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
        ui.append(button('quiz-home', TEXT.home, goHome));
        if (game.mode === 'challenge') {
          ui.append(button('primary quiz-again', CHALLENGE_STORY.retryFull, () => go('collect')));
        } else {
          ui.append(button('primary quiz-again', TEXT.flyAgain, () => { game.isRetry = true; go('build'); }));
        }
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

// ----- challengeIntro: 도전 모드 상황 소개 -----
screens.challengeIntro = {
  enter() {
    setBg('title');
    const [a, b] = CHALLENGE_STORY.intro;
    ui.append(el('div', 'bubble intro-bubble first', a.text));
    ui.append(el('div', 'bubble intro-bubble second', b.text));
    ui.append(button('primary big story-btn', CHALLENGE_STORY.startButton, () => go('collect')));
  },
  draw() {
    drawBg();
    ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
    roundBox(ctx, 120, 130, 1680, 690, 56); ctx.fill(); ctx.stroke();
    const [a, b] = CHALLENGE_STORY.intro;
    drawHamo(ctx, a.hamo, 320, 305, 280, 280);
    drawHamo(ctx, b.hamo, 320, 635, 280, 280);
  },
};

// ----- collect: 60초 부품 모으기 -----
let roundCounter = 0;
function newCollect() {
  const seed = CHALLENGE.fixedSeed !== null ? CHALLENGE.fixedSeed : (Date.now() + (++roundCounter) * 7919) >>> 0;
  const loot = shuffleLoot(seed);
  const now = performance.now();
  return {
    seed, phase: 'play', startMs: now, lastMs: now, endMs: 0,
    rng: createRng(seed + 1000),
    ayo: { x: CHALLENGE.start.x, y: CHALLENGE.start.y }, path: [], intent: null, moving: false,
    spots: HIDE_SPOTS.map((s, i) => ({ ...s, loot: loot[i], opened: false, hint: null })),
    villagers: VILLAGERS.map(v => ({ ...v, talked: false })),
    loose: [],      // 바닥이나 열린 장소에 남아 있는 부품 { type, x, y, sx, sy }
    bag: Array(BAG_SIZE).fill(null),
    empties: 0, busy: null, popup: null, confirm: false, pauseAt: 0,
    toast: null, hintUntil: 0, keys: new Set(), usedKeys: false, slots: [],
  };
}

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
    ui.append(button('primary done-btn', CHALLENGE_STORY.doneButton, () => this.finish()));
  },
  renderBag() {
    const c = game.collect;
    c.slots.forEach((slot, i) => {
      const type = c.bag[i];
      slot.className = 'bag-slot' + (type ? '' : ' empty');
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
  // 가방 칸을 누르면 아요 자리에 내려놓는다(겹치면 살짝 옆으로)
  drop(i) {
    const c = game.collect;
    if (c.phase !== 'play' || c.confirm || !c.bag[i]) return;
    let x = c.ayo.x, y = c.ayo.y;
    for (const [dx, dy] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, 60]]) {
      const free = !isBlocked(c.ayo.x + dx, c.ayo.y + dy) && !c.loose.some(l => Math.hypot(l.x - c.ayo.x - dx, l.y - c.ayo.y - dy) < 50);
      if (free) { x = c.ayo.x + dx; y = c.ayo.y + dy; break; }
    }
    c.loose.push({ type: c.bag[i], x, y, sx: x, sy: y });
    c.bag[i] = null;
    this.renderBag();
  },

  // ----- 처음으로: 확인 창을 띄우고 타이머를 멈춘다 -----
  askQuit() {
    const c = game.collect;
    if (c.confirm || c.phase !== 'play') return;
    c.confirm = true;
    c.pauseAt = performance.now();
    c.keys.clear();
    const back = el('div', 'confirm-back');
    const box = el('div', 'sheet confirm-box');
    box.append(el('p', '', CHALLENGE_STORY.quitAsk));
    const yes = button('confirm-yes', CHALLENGE_STORY.yes, goHome);
    const no = button('primary confirm-no', CHALLENGE_STORY.no, () => this.resume(back));
    box.append(yes, no);
    back.append(box);
    ui.append(back);
    no.focus();
  },
  resume(back) {
    const c = game.collect;
    const paused = performance.now() - c.pauseAt;
    c.startMs += paused;
    c.lastMs = performance.now();
    c.hintUntil += paused;
    if (c.busy) { c.busy.start += paused; c.busy.until += paused; }
    if (c.toast) c.toast.until += paused;
    c.confirm = false;
    back.remove();
    if (document.activeElement) document.activeElement.blur();
    game.lastInput = performance.now();
  },

  finish() {
    const c = game.collect;
    game.parts = partsFromBag(c.bag, c.empties);
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
  tapAt(x, y) {
    const c = game.collect;
    if (c.phase !== 'play' || c.confirm || c.busy || c.popup) return;
    c.usedKeys = false;
    const R = CHALLENGE.tapRadius;
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
    if (c.phase !== 'play' || c.confirm || c.busy || c.popup) return;
    const target = this.nearestReach();
    if (target) { c.path = []; c.intent = null; this.begin(target); }
  },
  begin(intent) {
    const c = game.collect, now = performance.now();
    if (intent.kind === 'item') { this.openPopup(intent.item); return; }
    const secs = intent.kind === 'search' ? SEARCH_TIME : TALK_TIME;
    c.busy = { ...intent, start: now, until: now + secs * 1000 };
    c.moving = false;
  },
  finishBusy() {
    const c = game.collect, b = c.busy;
    c.busy = null;
    if (b.kind === 'search') {
      const s = b.spot;
      s.opened = true;
      if (s.loot === 'empty') {
        c.empties++;
        this.showToast(CHALLENGE_STORY.emptyLoot);
      } else {
        const item = { type: s.loot, x: s.x, y: s.y - 12, sx: s.sx, sy: s.sy };
        c.loose.push(item);
        this.openPopup(item);
      }
    } else {
      b.person.talked = true;
      const hint = makeHint(c.spots, c.rng);
      const spot = c.spots.find(s => s.id === hint.spotId);
      if (spot) spot.hint = hint.item === 'empty' ? 'empty' : 'part';
      ui.querySelector('.hint-bubble')?.remove();
      ui.append(el('div', 'bubble hint-bubble', hint.text));
      c.hintUntil = performance.now() + CHALLENGE.hintShowSeconds * 1000;
    }
  },
  // ----- 부품 팝업: 담기 / 두고 가기 -----
  openPopup(item) {
    const c = game.collect;
    c.popup = item;
    const box = el('div', 'sheet loot-popup');
    const pic = el('canvas');
    pic.width = 420; pic.height = 280;
    drawItem(pic.getContext('2d'), item.type, 210, 140, 3.4);
    box.append(pic, el('p', 'loot-name', ITEMS[item.type].name));
    const take = button('primary loot-take', CHALLENGE_STORY.take, () => this.takeItem());
    const leave = button('loot-leave', CHALLENGE_STORY.leave, () => this.closePopup());
    box.append(take, leave);
    ui.append(box);
    take.focus();
  },
  closePopup() {
    const c = game.collect;
    c.popup = null;
    ui.querySelector('.loot-popup')?.remove();
    if (document.activeElement) document.activeElement.blur();
  },
  takeItem() {
    const c = game.collect;
    const free = c.bag.indexOf(null);
    if (free < 0) { this.showToast(CHALLENGE_STORY.bagFull); return; }
    c.bag[free] = c.popup.type;
    c.loose.splice(c.loose.indexOf(c.popup), 1);
    this.renderBag();
    this.closePopup();
  },

  update(now) {
    const c = game.collect;
    if (c.confirm) return; // 확인 창이 떠 있으면 모두 멈춘다
    const dt = Math.min(0.05, (now - c.lastMs) / 1000);
    c.lastMs = now;
    if (c.phase === 'timeup') {
      if (now - c.endMs > CHALLENGE.timeUpSeconds * 1000) this.finish();
      return;
    }
    if (now - c.startMs >= TIME_LIMIT * 1000) {
      c.phase = 'timeup'; c.endMs = now; c.path = []; c.intent = null; c.moving = false; c.busy = null;
      this.closePopup();
      ui.querySelector('.done-btn').remove();
      ui.querySelector('.home-btn')?.remove();
      ui.querySelector('.hint-bubble')?.remove();
      ui.append(el('div', 'bubble timeup-bubble', CHALLENGE_STORY.timeUp));
      return;
    }
    if (c.hintUntil && now > c.hintUntil) { c.hintUntil = 0; ui.querySelector('.hint-bubble')?.remove(); }
    if (c.busy) { if (now >= c.busy.until) this.finishBusy(); return; }
    if (c.popup) return;

    const step = CHALLENGE.walkSpeed * speedScaleOf(c.bag) * dt;
    c.moving = false;
    const k = c.keys;
    if (k.size) {
      // 방향키: 가로·세로를 따로 움직여서 벽을 따라 미끄러지게 한다
      c.path = []; c.intent = null; c.usedKeys = true;
      let dx = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
      let dy = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
      const len = Math.hypot(dx, dy);
      if (len) {
        dx *= step / len; dy *= step / len;
        const x0 = c.ayo.x, y0 = c.ayo.y;
        if (!isBlocked(c.ayo.x + dx, c.ayo.y)) c.ayo.x += dx;
        if (!isBlocked(c.ayo.x, c.ayo.y + dy)) c.ayo.y += dy;
        c.moving = c.ayo.x !== x0 || c.ayo.y !== y0;
      }
      return;
    }
    // 누른 곳으로: 정해진 길을 따라 걷는다
    let left = step;
    while (left > 0 && c.path.length) {
      const p = c.path[0];
      const d = Math.hypot(p.x - c.ayo.x, p.y - c.ayo.y);
      if (d <= left) { c.ayo.x = p.x; c.ayo.y = p.y; c.path.shift(); left -= d; }
      else { c.ayo.x += (p.x - c.ayo.x) / d * left; c.ayo.y += (p.y - c.ayo.y) / d * left; left = 0; }
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
    const t = c.confirm ? c.pauseAt : now;
    for (const s of c.spots) this.drawSpot(s, t);
    for (const it of c.loose) drawItem(ctx, it.type, it.x, it.y, 0.9);
    for (const v of c.villagers) drawVillager(ctx, v, t);
    if (c.path.length) {
      const goal = c.path[c.path.length - 1];
      ctx.strokeStyle = C.orangeDark; ctx.lineWidth = 5;
      circle(ctx, goal.x, goal.y, 16); ctx.stroke();
    }
    this.drawAyoTop(t);
    if (c.busy) this.drawBar(c.busy, t);
    if (c.usedKeys && !c.busy && !c.popup && c.phase === 'play') {
      const near = this.nearestReach();
      if (near) this.drawMark(near.at.x, near.at.y - 66);
    }
    this.drawTimer(t);
    if (c.toast && t < c.toast.until) this.drawToast(c.toast.text);
    if (c.phase === 'timeup') {
      ctx.fillStyle = C.paper; ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
      roundBox(ctx, 400, 250, 1160, 500, 40); ctx.fill(); ctx.stroke();
      drawHamo(ctx, 'challengeTimeUp', 590, 500, 300, 340);
    }
  },
  drawSpot(s, now) {
    const b = game.collect.busy;
    const shaking = b && b.kind === 'search' && b.spot === s;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (shaking) { ctx.rotate(Math.sin(now / 45) * 0.09); ctx.translate(0, Math.abs(Math.sin(now / 90)) * -9); }
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
  // 뒤지기·대화 진행 바
  drawBar(b, now) {
    const at = b.kind === 'search' ? b.spot : game.collect.ayo;
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
  // 위에서 본 아요: 머리 위주로 단순하게
  drawAyoTop(now) {
    const c = game.collect, a = c.ayo;
    const y = a.y + (c.moving ? Math.sin(now / 80) * 3 : 0);
    if (!images.ayo) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 10; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x - 16, y + 26); ctx.quadraticCurveTo(a.x - 46, y + 34, a.x - 40, y + 8); ctx.stroke();
      ctx.strokeStyle = C.orange; ctx.lineWidth = 6; ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.ellipse(a.x, y + 18, 24, 20, 0, 0, Math.PI * 2); fillStroke(ctx, C.orange, 3.5);
    }
    drawAyo(ctx, a.x, y - 8, 28);
    // 무거우면 머리 위에 땀
    if (c.bag.some(t => t && ITEMS[t].heavy)) {
      ctx.fillStyle = '#6fc3ec'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
      const wob = Math.sin(now / 160) * 3;
      for (const [dx, dy, s] of [[30, -48, 1], [-30, -52, 0.8]]) {
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
    roundBox(ctx, 830, 6, 260, 92, 24);
    fillStroke(ctx, blink ? '#d8362f' : C.paper, 5);
    ctx.fillStyle = blink ? '#ffffff' : warn ? '#d8362f' : C.ink;
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${left}초`, 960, 56);
  },
  drawToast(text) {
    ctx.font = '800 56px system-ui, sans-serif';
    const tw = ctx.measureText(text).width + 70;
    roundBox(ctx, 960 - tw / 2, 118, tw, 92, 24); fillStroke(ctx, '#ffe7c7', 4);
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 960, 166);
  },
};

// ----- noParts: 비거를 만들 수 없을 때 -----
screens.noParts = {
  enter() {
    setBg('paper');
    ui.append(el('div', 'bubble noparts-bubble', CHALLENGE_STORY.noParts));
    ui.append(button('primary big noparts-retry', CHALLENGE_STORY.retry, () => go('collect')));
    ui.append(button('noparts-home', TEXT.home, goHome));
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
  if (game.screen === 'collect' && !game.collect.confirm) game.lastInput = now;
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

  // 모으기 화면: 터치·클릭
  ui.addEventListener('pointerdown', e => {
    if (game.screen !== 'collect' || e.target.closest('button, .loot-popup, .confirm-back')) return;
    const rect = ui.getBoundingClientRect();
    screens.collect.tapAt((e.clientX - rect.left) / rect.width * W, (e.clientY - rect.top) / rect.height * H);
  });
  // 모으기 화면: PC 방향키, 스페이스바·Enter로 뒤지기
  const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', e => {
    touched();
    if (game.screen !== 'collect') return;
    const c = game.collect;
    if (c.confirm || c.popup) return; // 창이 떠 있으면 버튼이 키를 받는다
    if (ARROWS.includes(e.key)) { e.preventDefault(); c.keys.add(e.key); }
    else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      if (document.activeElement) document.activeElement.blur();
      screens.collect.useNearest();
    }
  });
  window.addEventListener('keyup', e => { if (game.collect) game.collect.keys.delete(e.key); });
  window.addEventListener('blur', () => { if (game.collect) game.collect.keys.clear(); });

  game.lastInput = performance.now();
  await preload();
  go('title');
  requestAnimationFrame(frame);
}

if (typeof document !== 'undefined') boot();
