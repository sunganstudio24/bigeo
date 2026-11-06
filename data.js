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
  ],
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
  startEasy: '쉬운 모드',
  startEasySub: '바로 만들기',
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
const BAG_SIZE = 5;           // 가방 칸 수
const TIME_LIMIT = 60;        // 부품 모으기 제한 시간(초)
const SEARCH_TAPS = 5;        // 숨김 장소를 뒤지려고 누르는 횟수
const SEARCH_TAPS_PER_SECOND = 4; // 시간 검사에서 가정하는 연타 빠르기
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

// 부품: name = 이름, short = 가방 칸 이름, use = 용도(body 몸통 / wing 날개 / string 끈)
// heavy = 무거워서 느려짐, hintRank = 힌트로 알려 주는 순서(작을수록 먼저)
const ITEMS = {
  bamboo:        { name: '튼튼한 대나무', short: '대나무',    use: 'body', bodyKey: 'bamboo', good: true, hintRank: 1 },
  crackedBamboo: { name: '금 간 대나무',  short: '금 대나무', use: 'body', bodyKey: 'bamboo', cracked: true, hintRank: 3 },
  wood:          { name: '나무판',        short: '나무판',    use: 'body', bodyKey: 'wood', hintRank: 2 },
  iron:          { name: '쇠',            short: '쇠',        use: 'body', bodyKey: 'iron', heavy: true, hintRank: 3 },
  paper:         { name: '깨끗한 한지',   short: '한지',      use: 'wing', good: true, hintRank: 1 },
  tornPaper:     { name: '찢어진 한지',   short: '찢긴 한지', use: 'wing', torn: true, hintRank: 3 },
  string:        { name: '튼튼한 끈',     short: '끈',        use: 'string', good: true, hintRank: 1 },
  jar:           { name: '작은 항아리',   short: '항아리',    use: 'trap', hintRank: 3 }, // 비거에는 못 쓰고 교환에 씀
  pot:           { name: '솥',            short: '솥',        use: 'trap', hintRank: 3 },
  record:        { name: '옛 책 조각',    short: '옛 책',     use: 'record', hintRank: 2 },
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
  timeUp: '시간 끝! 비거를 만들자!',
  noParts: '부품이 모자라… 다시 모아 볼까?',
  retry: '다시 도전',
  retryFull: '다시 도전(60초부터)',
  buildHello: '모은 부품으로 비거를 만들어 보자!',
  noString: '끈이 없어서 날개가 흔들려요',
  crackedNote: '금 간 대나무는 흔들려요',
  tornNote: '찢어진 한지는 반 개로 쳐요',
  crackedTag: '금 감',
  wingLabelCount: '날개 (한지 {n}개)',
  needPaper: '한지 {n}개',
  noMaterial: '없음',
  successTitle: '성공!',
  success: '소식 전달 성공!',
  goalReached: '목표 {goal}m 도착!',
  goalLeft: '목표까지 {left}m 남았어!',
};

// 도전 모드 실패 시 하모의 한 마디(규칙은 game.js의 challengeFeedbackKey, 먼저 맞는 것 하나)
// 어느 것도 맞지 않으면 기존 FEEDBACK만 나옵니다.
const CHALLENGE_FEEDBACK = {
  jarHeld: '항아리를 할머니께 드렸으면 한지로 바꿔 주셨을 거야!',
  potHeld: '솥을 대장장이 아저씨께 드렸으면 끈으로 바꿔 주셨을 거야!',
  ironNoBamboo: '대나무를 못 가져와서 무거운 쇠로 만들었네. 다음엔 대나무를 먼저 찾아보자!',
  crackedBamboo: '대나무에 금이 가 있어서 비거가 흔들렸어. 튼튼한 걸 골라 보자!',
  tornPaper: '찢어진 한지는 바람이 새어 나가. 깨끗한 한지를 찾아보자!',
  manyEmpty: '마을 사람들한테 물어보면 어디에 있는지 알려 줄 거야!',
  littlePaper: '한지가 더 있었으면 날개를 크게 만들 수 있었어!',
  noString: '끈이 없어서 날개가 흔들렸어. 다음엔 끈을 꼭 찾아보자!',
};

// =============================================================
// 조종: 당겨서 쏘기, 배 두드리기, 상승 기류
// =============================================================
const CONTROL = {
  optAngle: 30,        // 가장 멀리 가는 발사 각도(도). 이 각도·최대 세기가 자동 발사와 같은 결과
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
  highSpeedLoss: 0.5,  // 최적 각도보다 30도 높을 때 줄어드는 앞 속도 비율
  riseRate: 0.12,      // 각도 1도당 출발 위아래 속도(m/초)
  angleSink: 0.55,     // 각도가 30도 벗어날 때 빨라지는 하강 비율
  powerSink: 0.3,      // 세기가 최대에서 1만큼 모자랄 때 빨라지는 하강 비율
  previewShare: 1 / 2, // 예상 궤적을 보여 주는 앞부분 비율
  idleHintSeconds: 5,  // 조작이 없으면 안내하는 시간(초)
  drum: {
    lift: 1.75,        // 두드릴 때 떠오르는 속도(m/초)
    push: 0.5,         // 두드릴 때 빨라지는 앞 속도(m/초)
    fallingScale: 1,   // 내려가는 중에 쓴 효과
    risingScale: 0.6,  // 올라가는 중에 쓴 효과
    bodyEffect: { bamboo: 1, wood: 0.75, iron: 0.08 }, // 몸통별 효과(무거울수록 작음)
  },
  // 상승 기류: 거리(m) 구간, power = 떠오르는 힘. 판마다 같은 위치(쉬운 모드 자동 비행에는 없음)
  thermals: [{ from: 22, to: 33, power: 3 }],
};

// =============================================================
// 도전 모드 단계. 기능을 여기서 켜고 끕니다.
// =============================================================
// spots: HIDE_SPOTS의 id, loot: 내용물(개수 합 = 장소 수), empty 꽝, record 옛 책 조각
// states: 금 간·찢어진 부품 있음, hintVillager: 힌트 주는 마을 사람 id(null 없음), trades: 물물교환
// events: [최소, 최대] 돌발 이벤트 수, launch: 'auto' 자동 / 'pull' 당겨서 쏘기, drums: 배 두드리기 횟수
// needString: 끈이 없을 때 벌칙 적용, icons: 카드에 보여 줄 새 요소
const STAGES = [
  {
    id: 1, name: '1단계', goal: 90,
    spots: ['forest-straw', 'storage-straw', 'storage-box', 'carpenter-box', 'paper-box', 'yard-crock', 'yard-jar', 'smithy-jar'], // 가운데 가까운 곳만
    loot: [{ item: 'bamboo', count: 1 }, { item: 'wood', count: 1 }, { item: 'paper', count: 4 }, { item: 'empty', count: 2 }],
    states: false, hintVillager: null, trades: false, events: [0, 0], launch: 'auto', drums: 0, needString: false,
    icons: [{ draw: 'spot', text: '부품 찾기' }],
  },
  {
    id: 2, name: '2단계', goal: 100,
    spots: ['forest-basket', 'forest-straw', 'storage-box', 'carpenter-box', 'carpenter-basket', 'paper-basket', 'yard-crock', 'yard-jar', 'smithy-box'],
    loot: [{ item: 'bamboo', count: 1 }, { item: 'crackedBamboo', count: 1 }, { item: 'wood', count: 1 }, { item: 'paper', count: 3 }, { item: 'tornPaper', count: 1 }, { item: 'string', count: 1 }, { item: 'record', count: 1 }],
    states: true, hintVillager: 'v2', trades: false, events: [0, 0], launch: 'pull', drums: 0, needString: true,
    icons: [{ draw: 'cracked', text: '금 간 부품' }, { draw: 'villager', text: '마을 사람' }, { draw: 'pull', text: '당겨서 쏘기' }],
  },
  {
    id: 3, name: '3단계', goal: 110,
    spots: HIDE_SPOTS.map(s => s.id),
    loot: [{ item: 'bamboo', count: 1 }, { item: 'crackedBamboo', count: 1 }, { item: 'iron', count: 1 }, { item: 'paper', count: 3 }, { item: 'tornPaper', count: 1 }, { item: 'string', count: 1 }, { item: 'jar', count: 1 }, { item: 'pot', count: 1 }, { item: 'record', count: 1 }, { item: 'empty', count: 1 }],
    states: true, hintVillager: 'v2', trades: true, events: [1, 2], launch: 'pull', drums: 3, needString: true,
    icons: [{ draw: 'trade', text: '물물교환' }, { draw: 'chicken', text: '돌발 사건' }, { draw: 'drum', text: '배 두드리기' }],
  },
];

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
  { villager: 'v1', who: '할머니', want: 'jar', give: 'paper', ask: '항아리가 있으면 바꿔 줄게.' },
  { villager: 'v3', who: '대장장이 아저씨', want: 'pot', give: 'string', ask: '솥이 있으면 바꿔 줄게.' },
];
const TRADE_THANKS = '고마워! 대신 이거 줄게.';

// 돌발 이벤트(3단계). at: 일어나는 시간(초) 범위
const EVENTS = {
  atFrom: 10, atTo: 45,
  edgeSeconds: 1.2,    // 화면 가장자리 반짝임 시간
  noticeSeconds: 2.2,  // 하모 한 줄 알림 시간
  paper: {
    seconds: 3, startText: '한지가 날아가! 잡아!', missText: '앗, 한지가 강에 빠졌어!', tapRadius: 110,
    reward: 'paper',
  },
  chicken: {
    startText: '닭이 끈을 물고 갔어!', speedScale: 1.1, // 아요보다 얼마나 빠른지
    runSeconds: 6, restSeconds: 1.3, touchRadius: 66, tapRadius: 110, sound: '꼬꼬', reward: 'string',
  },
};

// 처음 보는 요소 안내(20자 이내)
const TUTORIALS = {
  enabled: true,          // false면 안내를 전혀 보여 주지 않음
  resetOnTitle: true,     // 타이틀 복귀·자동 리셋 때 본 기록을 지움(체험관용). false면 한 번만 보여 줌
  items: {
    search: '톡톡 눌러!',
    bagFull: '칸을 누르면 내려놔!',
    state: '금 가거나 찢어진 건 약해!',
    villager: '마을 사람에게 물어봐!',
    pull: '뒤로 당겼다 놓아!',
    drum: '옛 책에는 배를 두드리면 떠올랐대. 눌러 봐!', // 요청 문구 그대로(20자 초과)
    event: '눌러서 잡아!',
    trade: '원하는 물건을 갖다 줘!',
  },
};

// 조종·재미 요소 문구
const CONTROL_TEXT = {
  pullHint: '뒤로 당겼다 놓아!',
  drumPop: '둥!',
  line: '발사 각도 {angle}° · 두드리기 {drums}번',
  lineNoDrum: '발사 각도 {angle}°',
  tooHigh: '너무 높이 쐈어! 조금 낮게!',
  tooLow: '너무 낮게 쐈어! 조금 위로!',
  noDrum: '화면을 눌러 배를 두드려 봐!',
  drumWin: '옛 책 속 비거처럼 날았어!',
  combo: '연속 {n}개!',
  easyControl: '조종하기',
  easyAuto: '자동 비행',
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
