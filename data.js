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
  challengeStart: 'face_wow.png',    // 도전 모드 소개 첫 줄
  challengeBag: 'face_smile.png',    // 도전 모드 소개 둘째 줄
  challengeTimeUp: 'face_shock.png', // 시간 끝
  challengeNoParts: 'face_cry.png',  // 부품이 모자랄 때
  challengeSuccess: 'face_wow.png',  // 소식 전달 성공
};

// ----- 화면 문구 -----
const TEXT = {
  title: '아요의 비거 날리기',
  startEasy: '쉬운 모드',
  startEasySub: '바로 만들기',
  startChallenge: '도전 모드',
  startChallengeSub: '진주성 60초',
  titleHello: '안녕! 나는 하모야. 아요랑 비거를 날려 보자!',
  titleBye: '고마워! 또 놀러 와!',
  topTitle: '오늘의 최고 기록 TOP 5', //  : TOP과 5가 줄바꿈으로 갈라지지 않게 하는 띄어쓰기
  topEmpty: '아직 없어요',
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
  goalFlag: '아군 진영',
  tryChallenge: '도전 모드 해보기',
  tryEasy: '쉬운 모드로 연습하기',
};

// =============================================================
// 도전 모드: 진주성 60초
// =============================================================
const BAG_SIZE = 5;           // 가방 칸 수
const TIME_LIMIT = 60;        // 부품 모으기 제한 시간(초)
const SUCCESS_DISTANCE = 100; // 소식 전달에 성공하는 비행 거리(m)
const SEARCH_TIME = 1;        // 숨김 장소를 뒤지는 시간(초)
const TALK_TIME = 2;          // 마을 사람과 이야기하는 시간(초)

// 부품 상태와 끈이 비행에 주는 영향
const STATE_EFFECT = {
  crackedBambooLift: 0.85, // 금 간 대나무: 들어 올리는 힘 배율(비행 중 흔들림)
  tornPaperValue: 0.5,     // 찢어진 한지: 날개 크기 계산에서 세는 개수
  noStringLift: 0.85,      // 끈이 없을 때: 들어 올리는 힘 배율
};

const CHALLENGE = {
  walkSpeed: 119,        // 아요 걷는 속도(화면 1920 기준 초당 픽셀)
  heavySlowEach: 0.2,    // 무거운 물건 하나당 줄어드는 속도
  minSpeedScale: 0.4,    // 아무리 무거워도 이 비율 아래로는 안 느려짐
  ayoRadius: 28,         // 벽·건물에 부딪히는 아요 크기(픽셀)
  warnSeconds: 10,       // 남은 시간이 이 아래면 타이머가 빨개짐
  timeUpSeconds: 2.6,    // "시간 끝!" 안내를 보여 주는 시간(초)
  wingNeedPaper: { small: 1, normal: 2, big: 3 }, // 날개별 필요한 한지 수
  defaultBallast: 'front', // 조립 화면의 첫 무게추 위치
  start: { x: 960, y: 465 }, // 아요 출발 위치
  walkArea: { x: 105, y: 145, w: 1710, h: 640 }, // 성벽 안쪽, 걸어 다닐 수 있는 곳
  gridCell: 20,          // 길찾기 칸 크기(픽셀)
  tapRadius: 75,         // 이 거리 안을 누르면 그 장소를 누른 것으로 봄(픽셀)
  reachDistance: 110,    // 방향키로 움직일 때 스페이스바로 뒤질 수 있는 거리(픽셀)
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

// 판마다 숨김 장소에 섞어 넣는 내용물(개수 합이 숨김 장소 수와 같아야 합니다). empty = 꽝
const LOOT_TABLE = [
  { item: 'bamboo', count: 1 },
  { item: 'crackedBamboo', count: 1 },
  { item: 'wood', count: 1 },
  { item: 'iron', count: 1 },
  { item: 'paper', count: 3 },
  { item: 'tornPaper', count: 1 },
  { item: 'string', count: 1 },
  { item: 'empty', count: 3 },
];

// 부품: name = 이름, short = 가방 칸 이름, use = 용도(body 몸통 / wing 날개 / string 끈)
// heavy = 무거워서 느려짐, hintRank = 힌트로 알려 주는 순서(작을수록 먼저)
const ITEMS = {
  bamboo:        { name: '튼튼한 대나무', short: '대나무',    use: 'body', bodyKey: 'bamboo', hintRank: 1 },
  crackedBamboo: { name: '금 간 대나무',  short: '금 대나무', use: 'body', bodyKey: 'bamboo', cracked: true, hintRank: 3 },
  wood:          { name: '나무판',        short: '나무판',    use: 'body', bodyKey: 'wood', hintRank: 2 },
  iron:          { name: '쇠',            short: '쇠',        use: 'body', bodyKey: 'iron', heavy: true, hintRank: 3 },
  paper:         { name: '깨끗한 한지',   short: '한지',      use: 'wing', hintRank: 1 },
  tornPaper:     { name: '찢어진 한지',   short: '찢긴 한지', use: 'wing', torn: true, hintRank: 3 },
  string:        { name: '튼튼한 끈',     short: '끈',        use: 'string', hintRank: 1 },
};

// 마을 사람 3명: x·y = 위치, sx·sy = 아요가 서서 이야기하는 자리
const VILLAGERS = [
  { id: 'v1', color: '#e0795b', x: 330,  y: 448, sx: 400,  sy: 470 },
  { id: 'v2', color: '#6a9bd1', x: 800,  y: 448, sx: 870,  sy: 470 },
  { id: 'v3', color: '#b57bc2', x: 1560, y: 448, sx: 1490, sy: 470 },
];

// 힌트 문장: {place} 장소, {spot} 숨김 장소, {item} 부품, {이가}·{은는} 받침에 맞는 조사
const HINT_TEMPLATES = {
  found: '{place} {spot}에 {item}{이가} 있던데?',
  empty: '{place} {spot}{은는} 비어 있더라.',
  none: '이제 내가 아는 건 없어. 힘내!',
};

// 도전 모드 문구
const CHALLENGE_STORY = {
  intro: [
    { hamo: 'challengeStart', text: '성 밖에 소식을 전해야 해! 60초 안에 부품을 모아서 비거를 만들자!' },
    { hamo: 'challengeBag', text: '가방에는 5개까지만 담을 수 있어. 잘 골라야 해!' },
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
  timeUp: '시간 끝! 모은 부품으로 비거를 만들자!',
  noParts: '부품이 모자라… 다시 모아 볼까?',
  retry: '다시 도전',
  retryFull: '다시 도전(60초부터)',
  buildHello: '모은 부품으로 비거를 만들어 보자!',
  noString: '끈이 없어서 날개가 흔들려요',
  crackedNote: '금 간 대나무라 조금 흔들릴 수 있어요',
  tornNote: '찢어진 한지는 반 개로 쳐요',
  crackedTag: '금 감',
  wingLabelCount: '날개 (한지 {n}개)',
  needPaper: '한지 {n}개',
  noMaterial: '없음',
  successTitle: '성공!',
  success: '소식 전달 성공! 진주성을 도왔어!',
  goalReached: '목표 {goal}m 도착!',
  goalLeft: '목표 {goal}m까지 {left}m 남았어!',
};

// 도전 모드 실패 시 하모의 한 마디(규칙은 game.js의 challengeFeedbackKey, 먼저 맞는 것 하나)
// 어느 것도 맞지 않으면 기존 FEEDBACK만 나옵니다.
const CHALLENGE_FEEDBACK = {
  ironNoBamboo: '대나무를 못 가져와서 무거운 쇠로 만들었네. 다음엔 대나무를 먼저 찾아보자!',
  crackedBamboo: '대나무에 금이 가 있어서 비거가 흔들렸어. 튼튼한 걸 골라 보자!',
  tornPaper: '찢어진 한지는 바람이 새어 나가. 깨끗한 한지를 찾아보자!',
  manyEmpty: '마을 사람들한테 물어보면 어디에 있는지 알려 줄 거야!',
  littlePaper: '한지가 더 있었으면 날개를 크게 만들 수 있었어!',
  noString: '끈이 없어서 날개가 흔들렸어. 다음엔 끈을 꼭 찾아보자!',
};
