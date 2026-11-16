// =============================================================
// 기획자용 데이터 파일 — 문구와 수치는 여기서만 고치면 됩니다.
// 작은따옴표/큰따옴표와 쉼표는 지우지 않도록 주의하세요.
// =============================================================

// ----- 수치 설정 -----
const CONFIG = {
  // 비행 화면의 지형(단위: m, 출발점 = 0)
  world: {
    riverStart: 14,   // 남강 시작 지점
    riverEnd: 42,     // 남강 끝, 건너편 모래밭 시작 지점
    rulerMax: 140,    // 눈금과 막대 그래프의 최대 거리
    rulerStep: 10,    // 눈금 간격
  },

  // 등급 기준(m): 추락이 아니면서 거리로 나눔
  grades: { goodFrom: 75, bestFrom: 112 },

  historyMax: 5,        // 결과 화면 막대 그래프의 기록 개수
  topMax: 5,            // 오늘의 최고 기록 개수
  idleResetSeconds: 60, // 입력이 없으면 타이틀로 돌아가는 시간(초)
  maxCanvasWidth: 1600, // 저사양 대응: 캔버스 최대 해상도
};

// =============================================================
// 칸 조립: 조립 칸, 부품, 비행 수치
// =============================================================
const GRID = { cols: 5, rows: 3 }; // 가로 5칸(오른쪽이 앞), 세로 3칸

// 부품 수치(무게 단위는 서로 비교용)
// code = 조립 예시 글자, weight 무게, drag 공기 저항, lift 뜨는 힘(날개)
// thrust 미는 힘·gauge 바람 게이지 초(풀무), rotor 위로 뜨는 힘·taps 두드리기 횟수(회전날개)
// roll 출발 속도 올림(수레바퀴), steady 흔들림 줄임(연 꼬리)
// intro = 처음 나올 때 하모 소개(한 문장)
const PARTS = {
  cockpit: { code: 'C', name: '조종석',    weight: 3.0, drag: 0.35, color: '#c89b6c',
             intro: '아요가 타는 조종석이야. 꼭 하나 있어야 해!' },
  frame:   { code: 'F', name: '대나무 틀', weight: 0.4, drag: 0.06, color: '#cfd67a',
             intro: '대나무 틀은 가벼워서 부품을 이어 붙이기 좋아.' },
  wing:    { code: 'W', name: '한지 날개', weight: 0.5, drag: 0.2,  lift: 1, color: '#f8ecd2',
             intro: '한지 날개가 많을수록 잘 뜨지만, 바람도 많이 받아.' },
  weight:  { code: 'K', name: '무게추',    weight: 1.6, drag: 0.03, color: '#c8553d',
             intro: '무게추로 앞뒤 무게를 맞춰 봐!' },
  rotor:   { code: 'R', name: '회전날개',  weight: 0.9, drag: 0.25, rotor: 1, taps: 6, color: '#9bc46a',
             intro: '대나무 회전날개는 화면을 두드릴수록 빙글빙글 돌아서 위로 떠!' },
  bellows: { code: 'B', name: '풀무',      weight: 1.2, drag: 0.18, thrust: 1, gauge: 2.0, color: '#a97f52',
             intro: '풀무 버튼을 누르는 동안 바람이 나와서 앞으로 밀어 줘!' },
  wheel:   { code: 'H', name: '수레바퀴',  weight: 1.0, drag: 0.1,  roll: 1, color: '#8a5a36',
             intro: '수레바퀴를 달면 언덕을 더 빨리 굴러 내려가.' },
  tail:    { code: 'T', name: '연 꼬리',   weight: 0.2, drag: 0.05, steady: 1, color: '#e0795b',
             intro: '연 꼬리를 달면 덜 흔들려!' },
};
// 부품 상자에 놓이는 순서
const PART_ORDER = ['cockpit', 'frame', 'wing', 'weight', 'rotor', 'bellows', 'wheel', 'tail'];

// 조립 화면 문구(하모 말풍선은 위에서부터 먼저 맞는 것 하나)
const BUILD_TEXT = {
  hello: '아래 부품을 칸에 끌어다 놓아 봐!',
  needCockpit: '아요가 탈 조종석을 놓아 줘!',
  detached: '떨어진 부품이 있어! 조종석에 붙여 줘.',
  noLift: '날개가 없으면 금방 떨어져.',
  tooHeavy: '너무 무거워! 날개를 더 달거나 무게를 줄여 봐.',
  tailHeavy: '뒤가 무거워! 고개가 들릴 거야.',
  noseHeavy: '앞이 무거워! 고개를 숙일 거야.',
  ready: '좋아! 날려 보자!',
  pickFirst: '아래에서 부품을 먼저 골라 줘.',
  usedUp: '그 부품은 다 썼어.',
  locked: '이 짐은 옮길 수 없어.',
  recommend: '아요 추천',
  clear: '비우기',
  fly: '날려보기!',
  barWeight: '무게',
  barLift: '뜨는 힘',
  barPush: '미는 힘',
  front: '앞',
  back: '뒤',
  cannotFly: '아직 못 날아',
};
// 나는 방식 이름(결과 표)
const STYLE_TEXT = { glide: '날개', rotor: '회전날개', bellows: '풀무', none: '없음' };

// 비행 화면 문구
const FLIGHT_TEXT = {
  bellows: '꾹 누르기',
  bellowsHint: '풀무를 꾹 눌러!',
  rotorHint: '화면을 톡톡!',
  starBox: '별 상자!',
};

// 부품 제한이 없을 때 '아요 추천' 조립(오른쪽이 앞, 글자는 PARTS의 code, . = 빈칸)
const FREE_RECOMMEND = ['.WWW.', 'TFCF.', '.WWW.'];

// =============================================================
// 스테이지 5개(비거 만들기). 수치를 바꾼 뒤에는 runStageTest()로 꼭 확인
// =============================================================
// parts: 쓸 수 있는 부품과 개수, newParts: 이 스테이지에서 처음 나오는 부품(하모가 한 문장씩 소개)
// goal: { type: 'distance', value: m } 이만큼 멀리 / { type: 'height', value: m } 이만큼 높이
// locked: 옮길 수 없는 짐 [{ r: 줄(0 위), c: 칸(0 뒤), key }], box: 하늘의 별 상자 { x: 거리 m, y: 높이 m, r: 크기 m }
// stars: 별 조건 3개 — goal 목표 도착 / maxParts 부품 n개 이하로 성공(조종석·짐 빼고) / box 별 상자 지나가기
//                      distance n m 이상 / height n m 이상
// recommend: '아요 추천' 조립(오른쪽이 앞)
const STAGES = [
  {
    id: 1, name: '언덕에서 출발', title: '망진산 언덕에서 출발해 보기',
    intro: '망진산 언덕에서 남강 너머까지 날아 보자!',
    goal: { type: 'distance', value: 50 },
    parts: { cockpit: 1, frame: 2, wing: 4 }, newParts: ['wing', 'frame'],
    box: { x: 30, y: 40, r: 6 },
    stars: [{ type: 'goal' }, { type: 'maxParts', value: 2 }, { type: 'box' }],
    recommend: ['..W..', '.FC..', '..W..'],
  },
  {
    id: 2, name: '남강 건너기', title: '남강 건너기',
    intro: '앞에 무거운 짐을 실었어. 앞뒤 무게를 맞춰야 해!',
    goal: { type: 'distance', value: 65 },
    parts: { cockpit: 1, frame: 3, wing: 5, weight: 2 }, newParts: ['weight'],
    locked: [{ r: 1, c: 4, key: 'weight' }],
    box: { x: 42, y: 24, r: 6 },
    stars: [{ type: 'goal' }, { type: 'maxParts', value: 4 }, { type: 'box' }],
    recommend: ['..WW.', '..CW.', '..WW.'],
  },
  {
    id: 3, name: '높이 떠오르기', title: '높이 떠오르기',
    intro: '구름 높이까지 둥실 떠올라 보자!',
    goal: { type: 'height', value: 56 },
    parts: { cockpit: 1, frame: 3, wing: 4, weight: 1, rotor: 3 }, newParts: ['rotor'],
    box: { x: 22, y: 59, r: 6 },
    stars: [{ type: 'goal' }, { type: 'maxParts', value: 4 }, { type: 'box' }],
    recommend: ['.RRR.', '.FCF.', '.....'],
  },
  {
    id: 4, name: '멀리 소식 전하기', title: '멀리 소식 전하기',
    intro: '성 밖 멀리까지 소식을 전해야 해!',
    goal: { type: 'distance', value: 100 },
    parts: { cockpit: 1, frame: 3, wing: 6, weight: 1, rotor: 2, bellows: 3 }, newParts: ['bellows'],
    box: { x: 80, y: 28, r: 6 },
    stars: [{ type: 'goal' }, { type: 'maxParts', value: 5 }, { type: 'box' }],
    recommend: ['.WW..', 'BFCB.', '.WW..'],
  },
  {
    id: 5, name: '자유 조립', title: '자유 조립: 최고 기록 도전',
    intro: '모든 부품을 써서 가장 멀리 날아 보자!',
    goal: { type: 'distance', value: 100 },
    parts: { cockpit: 1, frame: 4, wing: 10, weight: 2, rotor: 3, bellows: 3, wheel: 2, tail: 2 }, newParts: ['wheel', 'tail'],
    box: { x: 70, y: 31, r: 6 },
    stars: [{ type: 'goal' }, { type: 'distance', value: 130 }, { type: 'box' }],
    recommend: ['.WWW.', 'TFCF.', '.WWW.'],
  },
];

// 스테이지 화면 문구. {n} 숫자, {goal} 목표
const STAGE_MODE_TEXT = {
  pickTitle: '어디로 날아 볼까?',
  locked: '잠김',
  goalDistance: '{goal}m 날기',
  goalHeight: '{goal}m 높이',
  star: { goal: '목표 도착', maxParts: '부품 {n}개 이하', box: '별 상자', distance: '{n}m 넘기', height: '{n}m 높이' },
  success: '성공!',
  reachedDistance: '목표 {goal}m 도착!',
  reachedHeight: '{goal}m 높이까지 떠올랐어!',
  leftDistance: '목표까지 {n}m 남았어!',
  leftHeight: '목표 높이까지 {n}m 남았어!',
  maxHeight: '최고 높이 {n}m',
  newStar: '별을 얻었어!',
  allStars: '별 3개 다 모았어!',
  opened: '다음 스테이지가 열렸어!',
  next: '다음 스테이지',
  pick: '스테이지 고르기',
  rebuild: '다시 조립하기',
  goalFlag: '목표',
  goalHeightLabel: '목표 높이',
  allOpen: '스테이지 모두 열기',
  start: '조립하러 가기',
};

// 비행 계산 값(단위: m, 초). 바꾼 뒤에는 runAllCombos()로 꼭 확인
const CRAFT_FLIGHT = {
  g: 9.8,
  launchHeight: 45,      // 망진산 출발 높이
  groundClearance: 4.6,  // 땅에 닿았다고 보는 높이
  ceiling: 62,           // 화면 위 끝(이보다 높이 못 올라감)
  worldEnd: 138,         // 화면 오른쪽 끝(여기까지 가면 비행 끝)
  maxSeconds: 40,        // 이보다 오래 날면 멈춤(무한 비행 방지)
  playSpeed: 1.15,       // 화면 재생 빠르기(1 = 실제 시간)
  // 발사
  launchSpeed: 15,       // 최대로 당겼을 때 출발 속도
  launchMassRef: 4.5,    // 이 무게보다 가벼우면 더 빨리, 무거우면 더 느리게 출발
  launchMassPow: 0.5,
  launchMassMin: 0.6, launchMassMax: 1.2,
  wheelBoost: 0.3,       // 수레바퀴 하나당 출발 속도 증가
  wheelMax: 2,           // 수레바퀴 효과가 쌓이는 최대 개수
  autoAngle: 25,         // 자동 발사 각도
  // 날개
  wingLift: 2.0,         // 날개 하나가 버티는 무게
  wingStack: 0.8,        // 날개를 많이 달수록 덜 늘어나는 정도(1이면 그대로)
  liftCap: 1.3,          // 날개 힘은 몸무게의 이 배수까지만(크게 솟구치지 않게)
  vFull: 12,             // 이 속도에서 날개가 제 힘을 냄
  qMax: 2.2,             // 빨라져도 날개 힘은 이 배수까지만
  dragK: 0.12,           // 공기 저항 세기
  cl0: 1.0,              // 기울기 0도일 때 날개 힘
  clSlope: 0.02,         // 1도 들릴 때마다 늘어나는 날개 힘
  clMin: -0.4,
  stallAlpha: 12,        // 이보다 고개를 들면 날개 힘이 줄어듦
  stallDrop: 0.07, clStall: 0.3,
  alphaDrag: 0.4,        // 고개를 들거나 숙일수록 늘어나는 저항
  // 기울기(무게중심과 양력 중심)
  balanceK: 400,         // 무게중심이 1칸 어긋날 때 기우는 힘
  vaneK: 40,             // 나는 방향으로 고개를 맞추는 힘
  vaneMin: 0.25,         // 느릴 때도 남는 최소 힘
  tailVane: 0.6,         // 연 꼬리 하나당 방향 맞추는 힘 증가
  dampBase: 5,          // 흔들림이 줄어드는 정도
  tailDamp: 6,           // 연 꼬리 하나당 흔들림 줄임
  rotorLevel: 30,        // 회전날개가 많을수록 매달린 것처럼 수평을 유지하는 힘
  gust: 200,             // 바람결이 흔드는 힘(연 꼬리가 없으면 크게 흔들림)
  tailGust: 3,           // 연 꼬리 하나당 바람결 흔들림을 줄이는 정도
  tumbleAlpha: 55,       // 이만큼 어긋나면 곤두박질(뒤집힘)
  tumbleSpeed: 7,
  tumbleSpin: 260,       // 곤두박질할 때 도는 빠르기(도/초)
  crashVy: 16,           // 이보다 빠르게 떨어지며 닿으면 추락
  crashPitch: 50,        // 이보다 고개를 숙이고 닿으면 추락
  // 풀무
  thrust: 2.8,           // 풀무 하나가 미는 힘(무게 단위)
  // 회전날개
  rotorLift: 3.4,        // 회전날개 하나가 다 돌 때 드는 무게
  rotorTapAdd: 0.55,     // 한 번 두드릴 때 도는 정도(최대 1)
  rotorDecay: 0.55,      // 도는 힘이 줄어드는 빠르기
  rotorDrag: 0.9,        // 돌 때 늘어나는 저항(앞으로 느려짐)
  rotorAuto: 0.5,        // 떨어질 때 회전날개가 낙하산처럼 받쳐 주는 정도
  // 조립 화면 막대
  barMax: 14,            // 막대가 꽉 차는 값(무게 단위)
  liftBarScale: 1.4,     // 뜨는 힘 막대 배율(무게 막대보다 길면 초록색 = 날 수 있음)
  offsetWarn: 0.45,      // 무게중심이 이만큼(칸) 어긋나면 "기울어짐" 안내
  wobbleWarn: 20,        // 흔들림이 이보다 크면 연 꼬리 안내
};

// ----- 등급 이름 -----
const GRADE_TEXT = {
  crash: '추락',
  low: '조금 날았어',
  good: '잘 날았어',
  best: '최고 기록!',
};

// ----- 이야기 화면 -----
// 대사는 한 줄씩 넘어갑니다. hamo = HAMO_IMG의 이름
const STORY = {
  lines: [
    { hamo: 'story', text: '옛날 책에 이런 이야기가 전해져. 임진왜란 때 진주성 사람들이 하늘을 나는 수레, 비거를 만들었대!' },
    { hamo: 'storyShape', text: '모양은 따오기를 닮았다고 적혀 있어. 진짜 모습은 아무도 몰라서, 우리가 직접 만들어 보는 거야!' },
    { hamo: 'build', text: '비거가 날개로 날았는지, 빙글빙글 도는 날개로 떴는지는 아무도 몰라. 그래서 여러 모양으로 만들어 보는 거야!' },
  ],
  // TODO: 비거 체험관 자료로 확인 후 문구 추가
};

// ----- 결과 화면 하모 설명(위에서부터 먼저 맞는 것 하나만 나옵니다) -----
const FEEDBACK = {
  // 칸 조립 비행(규칙은 game.js의 craftFeedbackKey)
  noWing: '날개가 없어서 금방 내려왔어. 한지 날개를 달아 볼까?',
  tooHeavy: '너무 무거워서 날개가 들어 올리지 못했어. 무게를 줄여 볼까?',
  tailHeavy: '뒤가 너무 무거워서 고개가 들렸어. 무게를 앞으로 옮겨 볼까?',
  noseHeavy: '앞이 너무 무거워서 고개를 숙이고 내려갔어. 무게를 뒤로 옮겨 볼까?',
  rotorIdle: '회전날개는 화면을 두드려야 돌아!',
  bellowsIdle: '풀무 버튼을 눌러야 바람이 나와!',
  bellowsOut: '풀무 바람이 다 떨어지니까 금방 내려왔어. 날개를 더 달아 볼까?',
  wobble: '비거가 흔들려서 힘이 빠졌어. 연 꼬리를 달아 볼까?',
  rotorFly: '회전날개 덕분에 제자리에서 둥실 떠올랐어!',
  bellowsFly: '풀무 바람으로 쌩 날아갔어!',
  glide: '균형이 딱 맞아서 바람을 타고 멀리 미끄러졌어!',
};

// ----- 퀴즈(correct: true가 정답, 보기 순서는 게임에서 섞입니다) -----
const QUIZ = [
  {
    question: '비거가 멀리 날려면 몸통이 가벼워야 할까, 무거워야 할까?',
    choices: [
      { text: '가벼워야', correct: true },
      { text: '무거워야', correct: false },
    ],
    right: '맞아! 가벼우면 날개가 쉽게 들어 올려.',
    wrong: '아쉬워! 무거우면 날개가 들어 올리기 힘들어. 가벼워야 멀리 날아.',
  },
  {
    question: '날개가 크면 비거를 더 잘 들어 올릴까?',
    choices: [
      { text: '네', correct: true },
      { text: '아니요', correct: false },
    ],
    right: '맞아! 큰 날개는 공기를 많이 받아서 잘 들어 올려.',
    wrong: '아쉬워! 큰 날개가 공기를 더 많이 받아서 더 잘 들어 올려.',
  },
  {
    question: '무게추가 맨 뒤에 있으면 어떻게 될까?',
    choices: [
      { text: '뒤집혀서 떨어져요', correct: true },
      { text: '더 멀리 날아요', correct: false },
    ],
    right: '맞아! 뒤가 무거우면 뒤로 뒤집혀서 떨어져.',
    wrong: '아쉬워! 뒤가 무거우면 뒤로 뒤집혀. 무게추는 가운데가 좋아.',
  },
  {
    question: '옛 책에서 비거는 어떤 새를 닮았다고 했을까?',
    choices: [
      { text: '따오기', correct: true },
      { text: '독수리', correct: false },
    ],
    right: '맞아! 옛 책에는 따오기를 닮았다고 적혀 있어.',
    wrong: '아쉬워! 옛 책에는 따오기를 닮았다고 적혀 있어.',
  },
  {
    question: '비거 설계도는 지금 남아 있을까?',
    choices: [
      { text: '아니요, 남아 있지 않아요', correct: true },
      { text: '네, 박물관에 있어요', correct: false },
    ],
    right: '맞아! 설계도가 없어서 사람들이 여러 모양으로 복원해 보고 있어.',
    wrong: '아쉬워! 설계도는 남아 있지 않아. 그래서 여러 모양으로 복원해 보고 있어.',
  },
  {
    mode: 'challenge', // 도전 모드에서만 나오는 문제
    question: '가방이 작을 때는 어떻게 해야 할까?',
    choices: [
      { text: '꼭 필요한 것부터 챙겨요', correct: true },
      { text: '아무거나 빨리 담아요', correct: false },
    ],
    right: '맞아! 꼭 필요한 것부터 담으면 비거를 잘 만들 수 있어.',
    wrong: '아쉬워! 아무거나 담으면 꼭 필요한 부품이 들어갈 자리가 없어.',
  },
];

// ----- 하모 이미지(assets/hamo/ 안의 파일 이름) -----
const HAMO_IMG = {
  title: 'bow.png',         // 타이틀·끝인사
  story: 'face_smile.png',  // 이야기 첫 줄
  storyShape: 'face_wink.png', // 이야기 둘째 줄
  build: 'face_grin.png',   // 처음 조립
  retry: 'face_wink.png',   // 다시 도전 유도
  crash: 'face_shock.png',  // 결과: 추락
  low: 'face_grin.png',     // 결과: 조금 날았어
  good: 'face_smile.png',   // 결과: 잘 날았어
  best: 'face_wow.png',     // 결과: 최고 기록
  river: 'float_water.png', // 남강에 떨어졌을 때
  quiz: 'study.png',        // 퀴즈
  quizRight: 'face_smile.png', // 퀴즈 정답
  quizWrong: 'face_cry.png',   // 퀴즈 오답
  challengeBook: 'study.png',        // 도전 모드 소개: 옛 책 이야기
  challengeStart: 'face_wow.png',    // 도전 모드 소개: 상황
  challengeBag: 'face_smile.png',    // 도전 모드 소개: 가방
  challengeTimeUp: 'face_shock.png', // 시간 끝
  challengeNoParts: 'face_cry.png',  // 부품이 모자랄 때
  challengeSuccess: 'face_wow.png',  // 소식 전달 성공
  place: 'bow.png',                  // 진짜 장소 안내
  record: 'face_smile.png',          // 옛 책 조각을 찾았을 때, 도감
  recordDone: 'face_wow.png',        // 기록을 전부 모았을 때
};

// ----- 화면 문구 -----
const TEXT = {
  title: '아요의 비거 날리기',
  startEasy: '비거 만들기',
  startEasySub: '스테이지 5개',
  startChallenge: '도전 모드',
  startChallengeSub: '진주성 60초',
  titleHello: '안녕! 아요랑 비거를 날려 보자!',
  titleBye: '고마워! 또 놀러 와!',
  topTitle: '오늘의 최고 기록 TOP 5', //  : TOP과 5가 줄바꿈으로 갈라지지 않게 하는 띄어쓰기
  topEmpty: '아직 없어요',
  storyNext: '비거 만들러 가기',
  next: '다음',
  bestExtra: '아요가 신나서 땡초라도 먹은 것 같아!', // 결과가 "최고 기록!"일 때 더 나오는 하모 대사
  resultNote: '비거의 진짜 모습은 아무도 몰라. 오늘 네가 만든 비거도 하나의 복원 아이디어야!',
  go: '출발!',
  retry: '부품 바꿔서 다시 날리기',
  toQuiz: '퀴즈 풀기',
  chartTitle: '이번 판 기록',
  home: '처음으로',
  flyAgain: '다시 날리기',
  hill: '망진산',
  river: '남강',
  castle: '진주성',
  rulerUnit: '거리(m)',
  goalFlag: '아군 진영',
  tryChallenge: '도전 모드 해보기',
  tryEasy: '비거 만들기로 연습',
};

// ----- 진짜 장소 안내(퀴즈를 마친 뒤) -----
const PLACE_INFO = {
  text: '진주 망경공원에 가면 비거 숲길과 비거 육교가 있어. 비거 모양을 찾아봐!',
};

// ----- 사진 배경(assets/bg/). 파일이 없으면 기존 그림 배경을 씁니다 -----
const BG_OVERLAY = 0.25;     // 사진 위 흰 막의 불투명도(0~1)
const BG_DESATURATE = 0.15;  // 채도를 낮추는 정도(0 = 그대로, 1 = 흑백)
const GROUND_Y = 840;        // 비행 화면의 땅·강 높이(화면 1920×1080 기준, 사진이 따라 움직임, 권장 700~840)
                             // 작게 하면 출발 높이도 함께 올라가서 화면 위로 나갈 수 있습니다.
const FLIGHT_HILL_ALPHA = 0.8;  // 사진 위 망진산 언덕 그림의 불투명도
const FLIGHT_SAND_ALPHA = 0.7;  // 사진 위 건너편 모래밭 그림의 불투명도

// focusX·focusY = 화면 가운데에 올 사진 위치(0~1), bankY = 사진 속 강둑 높이(0~1, 위가 0)
const BG_PHOTOS = {
  title:  { file: 'title.jpg',  focusX: 0.5, focusY: 0.5 },
  story:  { file: 'story.jpg',  focusX: 0.6, focusY: 0.58 },
  flight: {
    file: 'flight.jpg', bankY: 0.545,
    focusX: 0.543,           // 쉬운 모드: 촉석루가 오른쪽에 보이게
    focusXChallenge: 0.31,   // 도전 모드: 왼쪽이 성이므로 건너편은 숲만 보이게
  },
};

// ----- 아요(하모 프렌즈의 삵, assets/ayo.png) 크기 -----
const AYO_SIZE = {
  onBigeo: 150,   // 비거에 탔을 때 이미지 전체 높이(조립 화면에서 하모 얼굴과 비슷한 높이)
  seatX: 50,      // 비거 몸통 가운데에서 앞쪽으로 떨어진 자리
  showTop: 0.82,  // 비거에 탔을 때 보이는 윗부분 비율(나머지는 몸통에 가려짐)
  onMap: 92,      // 모으기 지도에서 이미지 높이
};

// =============================================================
// 도전 모드: 진주성 60초
// =============================================================
const BAG_SIZE = 8;           // 가방 칸 수(조종석은 따로 늘 줌)
const TIME_LIMIT = 60;        // 부품 모으기 제한 시간(초)
const SEARCH_TAPS = 5;        // 숨김 장소를 뒤지려고 누르는 횟수
const SEARCH_TAPS_PER_SECOND = 4; // 시간 검사에서 가정하는 연타 빠르기
const TALK_TIME = 2;          // 마을 사람과 이야기하는 시간(초)


const CHALLENGE = {
  walkSpeed: 119,        // 아요 걷는 속도(화면 1920 기준 초당 픽셀)
  heavySlowEach: 0.2,    // 무거운 물건 하나당 줄어드는 속도
  minSpeedScale: 0.4,    // 아무리 무거워도 이 비율 아래로는 안 느려짐
  ayoRadius: 28,         // 벽·건물에 부딪히는 아요 크기(픽셀)
  warnSeconds: 10,       // 남은 시간이 이 아래면 타이머가 빨개짐
  timeUpSeconds: 2.6,    // "시간 끝!" 안내를 보여 주는 시간(초)
  goodWings: 4,          // 한지 날개가 이보다 적게 모으고 실패하면 "더 모아 봐" 안내
  level1MinWings: 2,     // 1단계에 반드시 들어 있는 한지 날개 수(이것만으로도 성공)
  start: { x: 960, y: 465 }, // 아요 출발 위치
  walkArea: { x: 105, y: 145, w: 1710, h: 640 }, // 성벽 안쪽, 걸어 다닐 수 있는 곳
  gridCell: 20,          // 길찾기 칸 크기(픽셀)
  tapRadius: 75,         // 이 거리 안을 누르면 그 장소를 누른 것으로 봄(픽셀)
  reachDistance: 110,    // 방향키로 움직일 때 스페이스바로 뒤질 수 있는 거리(픽셀)
  manyEmptyAt: 2,        // 부품이 안 나온 곳을 이만큼 열면 "마을 사람에게 물어봐" 안내
  fixedSeed: null,       // 숫자를 넣으면 매 판 같은 배치(시험용), null이면 판마다 다름
  hintEmptyChance: 0.25, // 힌트가 "비어 있더라"일 확률
  hintShowSeconds: 6,    // 힌트 말풍선을 보여 주는 시간(초)
  toastSeconds: 1.4,     // "아무것도 없네…" 같은 짧은 안내 시간(초)
};

// 장소 이름표와 건물(x, y, w, h는 화면 1920×1080 기준, solid: false면 지나갈 수 있음)
const MAP_PLACES = [
  { id: 'forest',    name: '대나무숲',  kind: 'forest', color: '#8fbf6a', x: 120,  y: 150, w: 320, h: 110 },
  { id: 'storage',   name: '창고',      kind: 'house',  color: '#b89a78', x: 950,  y: 150, w: 285, h: 110 },
  { id: 'carpenter', name: '목공소',    kind: 'house',  color: '#d3a878', x: 1490, y: 150, w: 310, h: 110 },
  { id: 'paper',     name: '한지 공방', kind: 'house',  color: '#f3ead6', x: 120,  y: 670, w: 320, h: 110 },
  { id: 'yard',      name: '마당',      kind: 'label',  solid: false,     x: 900,  y: 556, w: 170, h: 84 },
  { id: 'smithy',    name: '대장간',    kind: 'house',  color: '#9aa3ab', x: 1490, y: 670, w: 310, h: 110 },
];

// 부품이 없는 장식 건물(지나갈 수 없음)
const MAP_DECOR = [
  { id: 'pavilion', name: '촉석루', kind: 'pavilion', color: '#5e8a84', x: 720, y: 660, w: 340, h: 120 },
];

// 담장(지나갈 수 없음). 틈이 있는 곳이 문입니다.
const MAP_FENCES = [
  // 위쪽 담장
  { x: 105,  y: 390, w: 435, h: 20 }, { x: 780,  y: 390, w: 470, h: 20 }, { x: 1380, y: 390, w: 435, h: 20 },
  // 아래쪽 담장
  { x: 105,  y: 520, w: 435, h: 20 }, { x: 670,  y: 520, w: 470, h: 20 }, { x: 1380, y: 520, w: 435, h: 20 },
  // 마당을 나누는 세로 담장
  { x: 650,  y: 145, w: 20, h: 265 }, { x: 1250, y: 145, w: 20, h: 265 },
  { x: 650,  y: 520, w: 20, h: 265 }, { x: 1250, y: 520, w: 20, h: 265 },
];

// 숨김 장소 종류 이름
const HIDE_SPOT_KINDS = {
  box: '상자', straw: '짚더미', jar: '항아리', crock: '장독', basket: '바구니',
};

// 숨김 장소 12곳: area = MAP_PLACES의 id, x·y = 위치, sx·sy = 아요가 서서 뒤지는 자리
const HIDE_SPOTS = [
  { id: 'forest-basket',  area: 'forest',    kind: 'basket', x: 170,  y: 335, sx: 245,  sy: 335 },
  { id: 'forest-straw',   area: 'forest',    kind: 'straw',  x: 590,  y: 190, sx: 590,  sy: 265 },
  { id: 'storage-straw',  area: 'storage',   kind: 'straw',  x: 730,  y: 190, sx: 730,  sy: 265 },
  { id: 'storage-box',    area: 'storage',   kind: 'box',    x: 1180, y: 335, sx: 1105, sy: 335 },
  { id: 'carpenter-box',  area: 'carpenter', kind: 'box',    x: 1320, y: 190, sx: 1320, sy: 265 },
  { id: 'carpenter-basket', area: 'carpenter', kind: 'basket', x: 1760, y: 335, sx: 1685, sy: 335 },
  { id: 'paper-basket',   area: 'paper',     kind: 'basket', x: 170,  y: 595, sx: 245,  sy: 595 },
  { id: 'paper-box',      area: 'paper',     kind: 'box',    x: 590,  y: 740, sx: 590,  sy: 665 },
  { id: 'yard-crock',     area: 'yard',      kind: 'crock',  x: 730,  y: 595, sx: 805,  sy: 595 },
  { id: 'yard-jar',       area: 'yard',      kind: 'jar',    x: 1200, y: 740, sx: 1200, sy: 665 },
  { id: 'smithy-jar',     area: 'smithy',    kind: 'jar',    x: 1320, y: 740, sx: 1320, sy: 665 },
  { id: 'smithy-box',     area: 'smithy',    kind: 'box',    x: 1760, y: 595, sx: 1685, sy: 595 },
];

// 숨김 장소에서 나오는 물건: name = 이름, short = 가방 칸 이름, part = 조립 부품(PARTS의 이름)
// use: trap 교환용(조립에 못 씀) / record 옛 책 조각, good = 반짝 표시, heavy = 무거워서 걸음이 느려짐
// hintRank = 마을 사람이 먼저 알려 주는 순서(작을수록 먼저)
const ITEMS = {
  wing:    { name: '한지 날개', short: '날개',   part: 'wing',    good: true, hintRank: 1 },
  frame:   { name: '대나무 틀', short: '대나무', part: 'frame',   hintRank: 2 },
  tail:    { name: '연 꼬리',   short: '꼬리',   part: 'tail',    good: true, hintRank: 1 },
  rotor:   { name: '회전날개',  short: '회전',   part: 'rotor',   hintRank: 2 },
  bellows: { name: '풀무',      short: '풀무',   part: 'bellows', good: true, heavy: true, hintRank: 1 },
  wheel:   { name: '수레바퀴',  short: '바퀴',   part: 'wheel',   heavy: true, hintRank: 3 },
  weight:  { name: '무게추',    short: '무게추', part: 'weight',  heavy: true, hintRank: 3 },
  jar:     { name: '작은 항아리', short: '항아리', use: 'trap', hintRank: 3 }, // 비거에는 못 쓰고 교환에 씀
  pot:     { name: '솥',        short: '솥',     use: 'trap', heavy: true, hintRank: 3 },
  record:  { name: '옛 책 조각', short: '옛 책', use: 'record', hintRank: 2 },
};

// 옛 기록 카드: 숨김 장소에서 옛 책 조각을 찾으면 아직 안 모은 것 중 하나가 나옵니다.
// id는 저장에 쓰이니 문장을 고쳐도 id는 그대로 두세요.
const RECORD_CARDS = [
  { id: 'shape',  text: '옛 책에는 비거가 따오기를 닮았다고 적혀 있어.' },
  { id: 'people', text: '옛 책에는 비거에 네 사람쯤 탈 수 있었다고 적혀 있어.' },
  { id: 'wind',   text: '옛 책에는 바람을 일으켜 하늘로 떠올랐다고 적혀 있어.' },
  { id: 'books',  text: '비거 이야기는 『오주연문장전산고』, 『여암전서』 같은 옛 책에 전해져.' },
  { id: 'maker',  text: '비거를 만든 사람은 정평구라는 군관이라고 전해져.' },
  { id: 'plan',   text: '비거를 그린 설계도는 남아 있지 않아. 그래서 사람들이 여러 모양으로 복원해 보고 있어.' },
  { id: 'rotor',  text: '비거가 날개로 날았는지, 빙글빙글 도는 날개로 떴는지는 아무도 몰라. 그래서 여러 모양으로 만들어 보는 거야!' },
];

const RECORD_TEXT = {
  found: '옛 책 조각을 찾았어!',
  fresh: '새 기록 {n}/{all}',
  again: '이미 모은 기록이야',
  ok: '확인',
  bookButton: '비거 기록 도감',
  count: '{n}/{all}장',
  unknown: '?',
  progress: '도전 모드에서 옛 책 조각을 찾으면 기록이 모여!',
  complete: '기록을 전부 모았어! 이제 너도 비거 박사야!',
};

// 마을 사람 3명: x·y = 위치, sx·sy = 아요가 서서 이야기하는 자리
const VILLAGERS = [
  { id: 'v1', color: '#e0795b', x: 330,  y: 448, sx: 400,  sy: 470 },
  { id: 'v2', color: '#6a9bd1', x: 800,  y: 448, sx: 870,  sy: 470 },
  { id: 'v3', color: '#b57bc2', x: 1560, y: 448, sx: 1490, sy: 470 },
];

// 힌트 문장(20자 이내): {place} 장소, {spot} 숨김 장소, {item} 부품, {이가}·{은는} 받침에 맞는 조사
const HINT_TEMPLATES = {
  found: '{place} {spot}에 {item}!',
  empty: '{place} {spot}{은는} 비어 있더라.',
  none: '이제 내가 아는 건 없어. 힘내!',
};

// 도전 모드 문구
const CHALLENGE_STORY = {
  intro: [
    { hamo: 'challengeBook', text: '옛 책에는 비거로 성 밖과 소식을 주고받았다는 이야기가 전해져.' },
    { hamo: 'challengeStart', text: '성 밖에 소식을 전해야 해! 60초 안에 부품을 모아서 비거를 만들자!' },
    { hamo: 'challengeBag', text: '가방에는 8개까지만 담을 수 있어. 모은 부품으로 비거를 조립할 거야!' },
  ],
  startButton: '시작!',
  doneButton: '다 모았어!',
  bagFull: '가방이 꽉 찼어!',
  emptySlot: '빈 칸',
  emptyLoot: '아무것도 없네…',
  take: '담기',
  leave: '두고 가기',
  quitAsk: '그만두고 처음으로 갈까?',
  yes: '예',
  no: '아니오',
  timeUp: '시간 끝! 비거를 만들자!',
  noParts: '부품이 모자라… 다시 모아 볼까?',
  retry: '다시 도전',
  retryFull: '다시 도전(60초부터)',
  successTitle: '성공!',
  success: '소식 전달 성공!',
  goalReached: '목표 {goal}m 도착!',
  goalLeft: '목표까지 {left}m 남았어!',
};

// 도전 모드 실패 시 하모의 한 마디(규칙은 game.js의 challengeFeedbackKey, 먼저 맞는 것 하나)
// 어느 것도 맞지 않으면 기존 FEEDBACK만 나옵니다.
const CHALLENGE_FEEDBACK = {
  jarHeld: '항아리를 할머니께 드렸으면 한지 날개로 바꿔 주셨을 거야!',
  potHeld: '솥을 대장장이 아저씨께 드렸으면 풀무로 바꿔 주셨을 거야!',
  manyEmpty: '마을 사람들한테 물어보면 어디에 있는지 알려 줄 거야!',
  littleWing: '한지 날개를 더 모았으면 더 멀리 날 수 있었어!',
};

// =============================================================
// 조종: 당겨서 쏘기(풀무·회전날개 조작 수치는 CRAFT_FLIGHT)
// =============================================================
const CONTROL = {
  optAngle: 30,        // 왼쪽 수평으로 끝까지 당겼을 때의 발사 각도(도)
  minAngle: 10, maxAngle: 60,
  angleMarks: [15, 30, 45], // 발사대 눈금
  tooHigh: 50, tooLow: 15,  // 결과 화면에서 "너무 높이·낮게" 안내하는 각도
  minPower: 0.7,       // 가장 약하게 당겼을 때의 세기(1이 최대)
  maxPull: 150,        // 이만큼 끌면 최대 세기(화면 1920 기준 픽셀)
  pullAngleScale: 0.6, // 왼쪽 수평으로 당기면 최적 각도. 수평에서 아래로 기운 각도에 이 값을 곱해 더함(위로 당기면 낮아짐)
  minPull: 40,         // 이보다 짧게 끌고 놓으면 발사하지 않음
  // 끈 색: 세기가 upTo 이하일 때의 색
  powerBands: [{ upTo: 0.8, color: '#e0b400' }, { upTo: 0.9, color: '#f28c38' }, { upTo: 1, color: '#d8362f' }],
  startAngle: 30, startPower: 0.85, // 키보드로 조종할 때 처음 값
  keyAngleStep: 2, keyPowerStep: 0.05,
  previewShare: 1 / 2, // 예상 궤적을 보여 주는 앞부분 비율
  idleHintSeconds: 5,  // 조작이 없으면 안내하는 시간(초)
};

// =============================================================
// 도전 모드 단계. 기능을 여기서 켜고 끕니다. 모은 부품이 그대로 조립 화면의 부품 상자가 됩니다.
// =============================================================
// spots: HIDE_SPOTS의 id, hintVillager: 힌트 주는 마을 사람 id(null 없음), trades: 물물교환
// events: [최소, 최대] 돌발 이벤트 수, launch: 'auto' 자동 발사 / 'pull' 당겨서 쏘기, icons: 카드에 보여 줄 새 요소
const CHALLENGE_LEVELS = [
  {
    id: 1, name: '1단계', goal: 70,
    spots: ['forest-straw', 'storage-straw', 'storage-box', 'carpenter-box', 'paper-box', 'yard-crock', 'yard-jar', 'smithy-jar'], // 가운데 가까운 곳만
    hintVillager: null, trades: false, events: [0, 0], launch: 'auto',
    icons: [{ draw: 'spot', text: '부품 찾기' }],
  },
  {
    id: 2, name: '2단계', goal: 85,
    spots: ['forest-basket', 'forest-straw', 'storage-box', 'carpenter-box', 'carpenter-basket', 'paper-basket', 'yard-crock', 'yard-jar', 'smithy-box'],
    hintVillager: 'v2', trades: false, events: [0, 0], launch: 'pull',
    icons: [{ draw: 'villager', text: '마을 사람' }, { draw: 'pull', text: '당겨서 쏘기' }, { draw: 'tail', text: '연 꼬리' }],
  },
  {
    id: 3, name: '3단계', goal: 105,
    spots: HIDE_SPOTS.map(s => s.id),
    hintVillager: 'v2', trades: true, events: [1, 2], launch: 'pull',
    icons: [{ draw: 'trade', text: '물물교환' }, { draw: 'chicken', text: '돌발 사건' }, { draw: 'bellows', text: '풀무' }],
  },
];

// 단계별 숨김 장소 내용물(개수 합 = 그 단계 spots 수). item은 ITEMS의 이름, empty 꽝
// 1단계는 한지 날개가 CHALLENGE.level1MinWings장 이상 들어 있어야 함(그것만으로도 날 수 있음)
const LOOT_TABLE = {
  1: [{ item: 'wing', count: 4 }, { item: 'frame', count: 1 }, { item: 'tail', count: 1 }, { item: 'empty', count: 2 }],
  2: [{ item: 'wing', count: 3 }, { item: 'frame', count: 1 }, { item: 'tail', count: 1 }, { item: 'rotor', count: 1 }, { item: 'weight', count: 1 }, { item: 'record', count: 1 }, { item: 'empty', count: 1 }],
  3: [{ item: 'wing', count: 3 }, { item: 'frame', count: 1 }, { item: 'tail', count: 1 }, { item: 'bellows', count: 1 }, { item: 'wheel', count: 1 }, { item: 'rotor', count: 1 }, { item: 'jar', count: 1 }, { item: 'pot', count: 1 }, { item: 'record', count: 1 }, { item: 'empty', count: 1 }],
};

const STAGE_TEXT = {
  title: '단계를 골라 봐!',
  goal: '목표 {goal}m',
  locked: '잠김',
  opened: '{name}가 열렸어!',
  next: '다음 단계 도전',
  adminTitle: '단계 고정',
  adminAuto: '진행대로',
  adminReset: '진행·도감 지우기',
  adminClose: '닫기',
  adminFixed: '{name} 고정',
};

// 물물교환(3단계): villager = VILLAGERS의 id
const TRADES = [
  { villager: 'v1', who: '할머니', want: 'jar', give: 'wing', ask: '항아리가 있으면 바꿔 줄게.' },
  { villager: 'v3', who: '대장장이 아저씨', want: 'pot', give: 'bellows', ask: '솥이 있으면 바꿔 줄게.' },
];
const TRADE_THANKS = '고마워! 대신 이거 줄게.';

// 돌발 이벤트(3단계). at: 일어나는 시간(초) 범위
const EVENTS = {
  atFrom: 10, atTo: 45,
  edgeSeconds: 1.2,    // 화면 가장자리 반짝임 시간
  noticeSeconds: 2.2,  // 하모 한 줄 알림 시간
  paper: {
    seconds: 3, startText: '한지가 날아가! 잡아!', missText: '앗, 한지가 강에 빠졌어!', tapRadius: 110,
    reward: 'wing',
  },
  chicken: {
    startText: '닭이 연 꼬리를 물고 갔어!', speedScale: 1.1, // 아요보다 얼마나 빠른지
    runSeconds: 6, restSeconds: 1.3, touchRadius: 66, tapRadius: 110, sound: '꼬꼬', reward: 'tail',
  },
};

// 처음 보는 요소 안내(20자 이내)
const TUTORIALS = {
  enabled: true,          // false면 안내를 전혀 보여 주지 않음
  resetOnTitle: true,     // 타이틀 복귀·자동 리셋 때 본 기록을 지움(체험관용). false면 한 번만 보여 줌
  items: {
    search: '톡톡 눌러!',
    bagFull: '칸을 누르면 내려놔!',
    villager: '마을 사람에게 물어봐!',
    pull: '뒤로 당겼다 놓아!',
    bellows: '꾹 누르면 바람이 나와!',
    rotor: '톡톡 두드리면 빙글빙글 돌아!',
    event: '눌러서 잡아!',
    trade: '원하는 물건을 갖다 줘!',
  },
};

// 조종·재미 요소 문구
const CONTROL_TEXT = {
  pullHint: '뒤로 당겼다 놓아!',
  drumPop: '둥!',
  lineNoDrum: '발사 각도 {angle}°',
  tooHigh: '너무 높이 쐈어! 조금 낮게!',
  tooLow: '너무 낮게 쐈어! 조금 위로!',
  combo: '연속 {n}개!',
  easyControl: '당겨서 쏘기',
  easyAuto: '자동 발사',
  soundOn: '소리 켜기',
  soundOff: '소리 끄기',
  speakOn: '읽어주기 켜기',
  speakOff: '읽어주기 끄기',
};

// ----- 소리 -----
const SFX_VOLUME = 1.0;    // 효과음 전체 볼륨(1.0이 기본, 0이면 무음)
const SFX_MAX_GAIN = 0.5;  // 소리 하나의 최대 크기(귀가 아프지 않게 제한)
const SPEECH_DELAY_MS = 100; // 읽기를 멈춘 뒤 다시 읽기까지 기다리는 시간(바로 읽으면 무시되는 브라우저 대비)
const VOICE_NOTE = {
  show: true, // 개발 확인용. false면 타이틀에 안내를 보여 주지 않음
  text: '한국어 음성이 없어 읽어주기를 할 수 없어요',
  waitSeconds: 2, // 음성 목록을 기다리는 시간(초)
};
