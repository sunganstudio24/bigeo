// =============================================================
// 기획자용 데이터 파일 — 문구와 수치는 여기서만 고치면 됩니다.
// 작은따옴표/큰따옴표와 쉼표는 지우지 않도록 주의하세요.
// =============================================================

// ----- 수치 설정 -----
const CONFIG = {
  // 날개: lift = 들어 올리는 힘, drag = 공기저항, drawSize = 그림 크기
  // flipSlow = 뒤 무게추로 뒤집힐 때 앞 속도가 줄어드는 빠르기(작을수록 조금 더 멀리 가서 추락)
  wings: {
    small:  { name: '작은 날개', short: '작은', lift: 0.6, drag: 0.8, drawSize: 0.6,  flipSlow: 1.1 },
    normal: { name: '보통 날개', short: '보통', lift: 1.0, drag: 1.0, drawSize: 0.85, flipSlow: 0.8 },
    big:    { name: '큰 날개',   short: '큰',   lift: 1.3, drag: 1.2, drawSize: 1.12, flipSlow: 0.6 },
  },
  // 몸통: weight = 무게, alwaysCrash = true면 항상 추락
  bodies: {
    bamboo: { name: '대나무', tag: '가벼움', short: '대나무', weight: 0.8, alwaysCrash: false },
    wood:   { name: '나무판', tag: '보통',   short: '나무판', weight: 1.0, alwaysCrash: false },
    iron:   { name: '쇠',     tag: '무거움', short: '쇠',     weight: 1.7, alwaysCrash: true },
  },
  // 무게추: behavior = dive(고개 숙임) / glide(안정 활공) / flip(솟았다가 뒤집힘)
  ballasts: {
    front:  { name: '앞',     short: '앞',     behavior: 'dive',  alwaysCrash: false, drawX: 72 },
    center: { name: '가운데', short: '가운데', behavior: 'glide', alwaysCrash: false, drawX: 0 },
    back:   { name: '뒤',     short: '뒤',     behavior: 'flip',  alwaysCrash: true,  drawX: -72 },
  },

  // 처음 조립 화면에서 골라져 있는 부품
  defaults: { wing: 'small', body: 'wood', ballast: 'front' },

  // 비행 계산 값(단위: m, 초)
  flight: {
    launchHeight: 45,    // 출발 높이
    launchSpeed: 20,     // 출발 앞 속도
    launchLift: 3,       // 출발할 때 살짝 떠오르는 속도
    groundClearance: 4.6,// 땅에 닿았다고 보는 높이(비거 그림 크기에 맞춤)
    cruiseSpeed: 24,     // 활공 앞 속도(공기저항으로 나눔)
    sinkBase: 15.9,      // 활공 하강 속도 기준(작을수록 오래 낢)
    glideSharpness: 1.3, // 클수록 부품에 따른 거리 차이가 커짐
    sinkResponse: 1.1,   // 하강 속도로 바뀌는 빠르기
    diveRate: 0.6,       // 앞 무게추: 시간이 갈수록 하강이 빨라지는 정도
    diveMaxPitch: 55,    // 앞 무게추: 최대로 고개 숙이는 각도
    gravity: 15,         // 추락할 때 떨어지는 힘
    heavyLiftShare: 0.6, // 쇠 몸통: 날개가 떨어지는 힘을 덜어 주는 정도
    heavySlow: 0.75,     // 쇠 몸통: 앞 속도가 줄어드는 빠르기
    flipRiseTime: 0.9,   // 뒤 무게추: 솟아오르는 시간
    flipRisePower: 9,    // 뒤 무게추: 솟아오르는 힘
    flipSpin: 260,       // 뒤 무게추: 뒤집히는 회전 속도(도/초)
    minPlaySeconds: 3,   // 화면에서 보여 주는 최소 비행 시간
    maxPlaySeconds: 6,   // 화면에서 보여 주는 최대 비행 시간
  },

  // 비행 화면의 지형(단위: m, 출발점 = 0)
  world: {
    riverStart: 14,   // 남강 시작 지점
    riverEnd: 42,     // 남강 끝, 건너편 모래밭 시작 지점
    rulerMax: 130,    // 눈금과 막대 그래프의 최대 거리
    rulerStep: 10,    // 눈금 간격
  },

  // 등급 기준(m): 추락이 아니면서 거리로 나눔
  grades: { goodFrom: 75, bestFrom: 112 },

  historyMax: 5,        // 결과 화면 막대 그래프의 기록 개수
  topMax: 5,            // 오늘의 최고 기록 개수
  idleResetSeconds: 60, // 입력이 없으면 타이틀로 돌아가는 시간(초)
  maxCanvasWidth: 1600, // 저사양 대응: 캔버스 최대 해상도
};

// ----- 등급 이름 -----
const GRADE_TEXT = {
  crash: '추락',
  low: '조금 날았어',
  good: '잘 날았어',
  best: '최고 기록!',
};

// ----- 이야기 화면 -----
const STORY = {
  speech: '옛날 진주성 사람들이 하늘을 나는 비거를 만들었대! 우리도 만들어 볼까?',
  // TODO: 비거 체험관 자료로 확인 후 문구 추가
};

// ----- 결과 화면 하모 설명(위에서부터 먼저 맞는 것 하나만 나옵니다) -----
const FEEDBACK = {
  ballastBack: '무게추가 뒤에 있으니까 비거가 뒤로 뒤집혔어! 가운데로 옮겨 볼까?',
  ironBody: '쇠는 너무 무거워서 날개가 들어 올리지 못했어. 가벼운 재료로 바꿔 볼까?',
  ballastFront: '앞이 무거워서 비거가 고개를 숙이고 내려갔어.',
  smallWing: '날개가 작아서 공기를 많이 받지 못했어. 더 큰 날개는 어떨까?',
  balanced: '균형이 딱 맞아서 바람을 타고 멀리 날았어!',
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
];

// ----- 하모 이미지(assets/hamo/ 안의 파일 이름) -----
const HAMO_IMG = {
  title: 'bow.png',         // 타이틀·끝인사
  story: 'face_smile.png',  // 이야기
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
};

// ----- 화면 문구 -----
const TEXT = {
  title: '아요의 비거 날리기',
  start: '시작하기',
  titleHello: '안녕! 나는 하모야. 아요랑 비거를 날려 보자!',
  titleBye: '고마워! 또 놀러 와!',
  topTitle: '오늘의 최고 기록 TOP 5',
  topEmpty: '아직 기록이 없어요. 첫 기록을 세워 봐!',
  storyNext: '비거 만들러 가기',
  buildHello: '부품을 고르면 비거 모양이 바뀌어!',
  buildRetry: '이번엔 뭘 바꿔 볼까?',
  wingLabel: '날개',
  bodyLabel: '몸통',
  ballastLabel: '무게추 위치',
  fly: '날려보기!',
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
};
