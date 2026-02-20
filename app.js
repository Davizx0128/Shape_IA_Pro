/* ═══════════════════════════════════════════════════════
   ShapeAI Premium v3.0 — app.js
   AI Fitness Coach · Single-file PWA logic
   ═══════════════════════════════════════════════════════ */
'use strict';

/* ── STORAGE ──────────────────────────────────────────── */
const DB = {
  get(k, d = null) {
    try { const v = localStorage.getItem('sa3_' + k); return v ? JSON.parse(v) : d; } catch { return d; }
  },
  set(k, v) { try { localStorage.setItem('sa3_' + k, JSON.stringify(v)); } catch {} },
  del(k)    { try { localStorage.removeItem('sa3_' + k); } catch {} }
};

/* ── STATE ────────────────────────────────────────────── */
const S = {
  screen: 'auth',
  lang: DB.get('lang', 'pt'),
  user: DB.get('user'),
  profile: DB.get('profile'),
  today: new Date().toISOString().slice(0, 10),
  logs: DB.get('logs', {}),
  xp: DB.get('xp', 0),
  level: DB.get('level', 1),
  streak: DB.get('streak', { count: 0, lastDate: null }),
  achievements: DB.get('achievements', []),
  workoutPlan: DB.get('workoutPlan'),
  nutritionPlan: DB.get('nutritionPlan'),
  stepTracker: { active: false, interval: null, elapsed: 0 },
  onboardStep: 0,
  onboardData: {},
  _authMode: 'login',
  _workoutDayIdx: 0,
};

/* ── TRANSLATIONS ─────────────────────────────────────── */
const LANG = {
  pt: {
    goodMorning: 'Bom dia', goodAfternoon: 'Boa tarde', goodEvening: 'Boa noite',
    streak: 'Sequência', achievements: 'Conquistas', level: 'Nível',
    dashboard: 'Dashboard', workout: 'Treino', nutrition: 'Nutrição',
    steps: 'Passos', profile: 'Perfil',
  },
  en: {
    goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
    streak: 'Streak', achievements: 'Achievements', level: 'Level',
    dashboard: 'Dashboard', workout: 'Workout', nutrition: 'Nutrition',
    steps: 'Steps', profile: 'Profile',
  }
};
const t = k => (LANG[S.lang] || LANG.pt)[k] || k;

/* ── FITNESS ENGINE ───────────────────────────────────── */
const FE = {
  bmr(p) {
    const b = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return p.gender === 'f' ? b - 161 : b + 5;
  },
  tdee(bmr, act) {
    return Math.round(bmr * ([1.2, 1.2, 1.375, 1.55, 1.725, 1.9][+act] || 1.375));
  },
  target(tdee, goal) {
    return goal === 'lose' ? tdee - 500 : goal === 'gain' ? tdee + 400 : tdee;
  },
  macros(cal, goal) {
    const r = goal === 'gain' ? [.35, .40, .25] : goal === 'lose' ? [.40, .30, .30] : [.30, .40, .30];
    return { protein: Math.round(cal * r[0] / 4), carbs: Math.round(cal * r[1] / 4), fat: Math.round(cal * r[2] / 9) };
  },
  xpLevel(xp) {
    const thr = [0, 500, 1200, 2500, 5000, 9000, 15000, 23000, 35000, 50000];
    let lv = 1;
    for (let i = 1; i < thr.length; i++) if (xp >= thr[i]) lv = i + 1;
    const cur = thr[Math.min(lv - 1, thr.length - 1)];
    const nxt = thr[Math.min(lv, thr.length - 1)];
    return { lv, inLv: xp - cur, need: nxt - cur, pct: nxt > cur ? Math.min(100, Math.round((xp - cur) / (nxt - cur) * 100)) : 100 };
  },
  lvName(l) {
    return ['', 'Iniciante', 'Ativo', 'Dedicado', 'Atleta', 'Guerreiro', 'Campeão', 'Elite', 'Lenda', 'Imortal', 'Deus Fitness'][Math.min(l, 10)];
  },
  stepsKm:  s => (s * 0.00075).toFixed(2),
  stepsCal: (s, w) => Math.round(s * 0.04 * ((w || 70) / 70)),
};

/* ── AI ENGINE ────────────────────────────────────────── */
const AI = {
  workout(p) {
    const { goal, level: lvl, days } = p;
    const lose = goal === 'lose', gain = goal === 'gain';
    const d = parseInt(days) || 3;

    const EX = {
      beginner: {
        upper:  [
          { name:'Flexão de Joelho',         sets:3, reps:'10-12', rest:60,  muscle:'Peitoral',    emoji:'💪' },
          { name:'Remada com Garrafa',        sets:3, reps:'12',   rest:60,  muscle:'Costas',      emoji:'🔙' },
          { name:'Desenvolvimento Ombros',    sets:3, reps:'10',   rest:60,  muscle:'Ombros',      emoji:'🔝' },
          { name:'Tríceps Banco',             sets:3, reps:'12',   rest:60,  muscle:'Tríceps',     emoji:'💺' },
        ],
        lower:  [
          { name:'Agachamento Livre',         sets:3, reps:'15',   rest:60,  muscle:'Quadríceps',  emoji:'🦵' },
          { name:'Afundo Estático',           sets:3, reps:'10 cd',rest:60,  muscle:'Glúteos',     emoji:'🍑' },
          { name:'Elevação Panturrilha',      sets:4, reps:'20',   rest:45,  muscle:'Panturrilha', emoji:'🦶' },
          { name:'Glúteo no Chão',            sets:3, reps:'15',   rest:60,  muscle:'Glúteos',     emoji:'🔥' },
        ],
        core:   [
          { name:'Prancha Isométrica',        sets:3, reps:'25s',  rest:45,  muscle:'Core',        emoji:'🏋️' },
          { name:'Crunch Abdominal',          sets:3, reps:'20',   rest:45,  muscle:'Abdômen',     emoji:'🔥' },
          { name:'Elevação de Pernas',        sets:3, reps:'12',   rest:45,  muscle:'Abdômen',     emoji:'⬆️' },
        ],
        cardio: [
          { name:'Jumping Jacks',             sets:4, reps:'30s',  rest:30,  muscle:'Cardio',      emoji:'⚡' },
          { name:'Polichinelos',              sets:3, reps:'40',   rest:30,  muscle:'Cardio',      emoji:'🏃' },
          { name:'Agachamento Rápido',        sets:3, reps:'20',   rest:45,  muscle:'Cardio/Pernas',emoji:'🔥' },
        ],
      },
      intermediate: {
        upper:  [
          { name:'Flexão Completa',           sets:4, reps:'12-15',rest:60,  muscle:'Peitoral',    emoji:'💪' },
          { name:'Flexão Diamante',           sets:3, reps:'10',   rest:75,  muscle:'Tríceps',     emoji:'💎' },
          { name:'Barra Fixa Assistida',      sets:3, reps:'8-10', rest:90,  muscle:'Costas',      emoji:'🏅' },
          { name:'Pike Push-up',              sets:3, reps:'10',   rest:60,  muscle:'Ombros',      emoji:'🔺' },
        ],
        lower:  [
          { name:'Agachamento Búlgaro',       sets:3, reps:'10 cd',rest:75,  muscle:'Quadríceps',  emoji:'🦵' },
          { name:'Hip Thrust',                sets:4, reps:'15',   rest:60,  muscle:'Glúteos',     emoji:'🍑' },
          { name:'Agachamento Sumô',          sets:3, reps:'15',   rest:60,  muscle:'Adutores',    emoji:'🤸' },
          { name:'Stiff Leg',                 sets:3, reps:'12',   rest:75,  muscle:'Posterior',   emoji:'🦿' },
        ],
        core:   [
          { name:'Prancha Lateral',           sets:3, reps:'30s cd',rest:45, muscle:'Oblíquos',    emoji:'📐' },
          { name:'Russian Twist',             sets:3, reps:'20',   rest:45,  muscle:'Core',        emoji:'🔄' },
          { name:'Mountain Climber',          sets:4, reps:'30s',  rest:30,  muscle:'Core+Cardio', emoji:'⛰️' },
        ],
        cardio: [
          { name:'Burpee',                    sets:4, reps:'10',   rest:60,  muscle:'Full Body',   emoji:'🔥' },
          { name:'Agachamento com Salto',     sets:3, reps:'15',   rest:45,  muscle:'Cardio',      emoji:'🚀' },
          { name:'Sprint no Lugar',           sets:5, reps:'20s',  rest:20,  muscle:'Cardio',      emoji:'⚡' },
        ],
      },
      advanced: {
        upper:  [
          { name:'Flexão Archer',             sets:4, reps:'8 cd', rest:90,  muscle:'Peitoral',    emoji:'🎯' },
          { name:'Flexão Explosiva',          sets:4, reps:'8',    rest:90,  muscle:'Potência',    emoji:'💥' },
          { name:'Barra Fixa Pronada',        sets:4, reps:'8-10', rest:90,  muscle:'Costas',      emoji:'🏆' },
          { name:'Muscle Up',                 sets:3, reps:'5',    rest:120, muscle:'Full Upper',  emoji:'👑' },
        ],
        lower:  [
          { name:'Pistol Squat',              sets:4, reps:'6 cd', rest:90,  muscle:'Unilateral',  emoji:'🎯' },
          { name:'Nórdico Leg Curl',          sets:3, reps:'6-8',  rest:120, muscle:'Posterior',   emoji:'🦿' },
          { name:'Single Leg Hip Thrust',     sets:3, reps:'12 cd',rest:75,  muscle:'Glúteos',     emoji:'🍑' },
          { name:'Box Jump',                  sets:4, reps:'8',    rest:60,  muscle:'Potência',    emoji:'📦' },
        ],
        core:   [
          { name:'L-Sit',                     sets:4, reps:'15s',  rest:60,  muscle:'Core Av.',    emoji:'💺' },
          { name:'Dragon Flag',               sets:3, reps:'6-8',  rest:90,  muscle:'Core Total',  emoji:'🐉' },
          { name:'V-Up',                      sets:4, reps:'15',   rest:45,  muscle:'Abdômen',     emoji:'✌️' },
        ],
        cardio: [
          { name:'Burpee com Salto',          sets:5, reps:'10',   rest:45,  muscle:'HIIT',        emoji:'🔥' },
          { name:'Tabata Sprint',             sets:8, reps:'20s',  rest:10,  muscle:'Cardio Max',  emoji:'⚡' },
          { name:'Bear Crawl',                sets:4, reps:'30s',  rest:30,  muscle:'Full Body',   emoji:'🐻' },
        ],
      },
    };

    const typeSeq = gain
      ? ['upper','lower','rest','upper','lower','rest','rest']
      : lose
      ? ['cardio','lower','cardio','upper','cardio','core','rest']
      : ['upper','lower','core','upper','lower','cardio','rest'];

    const days_pt = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
    const exMap = EX[lvl] || EX.beginner;

    return {
      weekNumber: 1,
      generatedAt: new Date().toISOString(),
      profile: { goal, level: lvl, days: d },
      schedule: typeSeq.map((type, i) => {
        const isRest = type === 'rest' || i >= d;
        const exs = isRest ? [] : (exMap[type] || exMap.upper).map(e => ({ ...e, done: false }));
        return {
          day: days_pt[i], dayIdx: i, type: isRest ? 'rest' : type, isRest,
          exercises: exs,
          duration: isRest ? 0 : lvl === 'advanced' ? 60 : lvl === 'intermediate' ? 50 : 40,
          calories:  isRest ? 0 : Math.round((lvl === 'advanced' ? 450 : lvl === 'intermediate' ? 350 : 280) * (lose ? 1.2 : 1)),
        };
      }),
    };
  },

  nutrition(p) {
    const bmrVal  = FE.bmr(p);
    const tdeeVal = FE.tdee(bmrVal, p.activityLevel || 2);
    const tgt     = FE.target(tdeeVal, p.goal);
    const mac     = FE.macros(tgt, p.goal);

    const plans = {
      lose: [
        { name:'Café da Manhã', time:'07:00', emoji:'☀️', cal:Math.round(tgt*.25),
          foods:['Omelete de claras (3)','Aveia com frutas (50g)','Café puro'] },
        { name:'Lanche',        time:'10:00', emoji:'🍎', cal:Math.round(tgt*.10),
          foods:['Maçã ou pera','Castanhas (20g)'] },
        { name:'Almoço',        time:'13:00', emoji:'🍚', cal:Math.round(tgt*.35),
          foods:['Frango grelhado (150g)','Arroz integral (60g)','Salada verde'] },
        { name:'Lanche',        time:'16:00', emoji:'🥛', cal:Math.round(tgt*.10),
          foods:['Iogurte grego (150g)','Whey (se treinou)'] },
        { name:'Jantar',        time:'19:30', emoji:'🌙', cal:Math.round(tgt*.20),
          foods:['Peixe ou frango (130g)','Vegetais refogados','Batata doce (80g)'] },
      ],
      gain: [
        { name:'Café da Manhã', time:'07:00', emoji:'☀️', cal:Math.round(tgt*.25),
          foods:['3 ovos inteiros','Aveia (80g)','Banana','Pasta de amendoim (20g)'] },
        { name:'Lanche',        time:'10:00', emoji:'💪', cal:Math.round(tgt*.15),
          foods:['Whey protein + leite','Banana','Amendoim (30g)'] },
        { name:'Almoço',        time:'13:00', emoji:'🍚', cal:Math.round(tgt*.30),
          foods:['Frango (200g)','Arroz branco (100g)','Feijão (80g)','Batata doce (100g)'] },
        { name:'Pré-treino',    time:'16:30', emoji:'⚡', cal:Math.round(tgt*.10),
          foods:['Banana + mel','Café preto'] },
        { name:'Jantar',        time:'20:00', emoji:'🌙', cal:Math.round(tgt*.20),
          foods:['Carne bovina (180g)','Macarrão integral (80g)','Brócolis'] },
      ],
      maintain: [
        { name:'Café da Manhã', time:'07:00', emoji:'☀️', cal:Math.round(tgt*.25),
          foods:['Iogurte grego + granola','Frutas da estação','Café ou chá'] },
        { name:'Lanche',        time:'10:00', emoji:'🍓', cal:Math.round(tgt*.10),
          foods:['Frutas mistas','Castanhas (25g)'] },
        { name:'Almoço',        time:'13:00', emoji:'🍚', cal:Math.round(tgt*.35),
          foods:['Proteína à escolha (150g)','Arroz + feijão','Salada completa'] },
        { name:'Lanche',        time:'16:00', emoji:'🥛', cal:Math.round(tgt*.10),
          foods:['Iogurte (150g)','Castanhas ou fruta'] },
        { name:'Jantar',        time:'19:00', emoji:'🌙', cal:Math.round(tgt*.20),
          foods:['Omelete ou peixe','Legumes variados','Arroz integral (50g)'] },
      ],
    };

    return {
      bmr: Math.round(bmrVal), tdee: tdeeVal, target: tgt, macros: mac,
      meals: plans[p.goal] || plans.maintain,
      generatedAt: new Date().toISOString(),
    };
  },

  coachMsg(p, log, streak) {
    const calIn   = log?.calories || 0;
    const target  = S.nutritionPlan?.target || 2000;
    const diff    = calIn - target;
    const pool    = [];

    if (streak?.count >= 7)  pool.push(`🔥 ${streak.count} dias seguidos! Você está no modo BEAST!`);
    else if (streak?.count >= 3) pool.push(`⚡ ${streak.count} dias consecutivos. Continue firme!`);
    else pool.push('💡 Consistência > Intensidade. Cada dia conta!');

    if (calIn === 0)        pool.push('📝 Registre suas refeições para eu acompanhar seus macros!');
    else if (Math.abs(diff) < 100) pool.push('✅ Calorias no ponto! Perfeito para seu objetivo!');
    else if (diff < -350)   pool.push(`⚠️ Déficit de ${Math.abs(diff)} kcal. Coma mais para proteger o músculo!`);
    else if (diff > 350)    pool.push(`📈 ${diff} kcal acima da meta. Compense com movimento!`);

    if (p?.goal === 'gain') pool.push('💪 Não esqueça: 1,8–2g de proteína por kg de peso hoje!');
    if (p?.goal === 'lose') pool.push('💧 Beba 2,5L de água hoje. Hidratação acelera o metabolismo!');

    return pool[Math.floor(Math.random() * pool.length)];
  },
};

/* ── CALORIE DATABASE ─────────────────────────────────── */
const CALDB = {
  'arroz':130,'arroz branco':130,'arroz integral':115,'feijão':76,'feijao':76,
  'frango':165,'peito de frango':165,'carne':250,'carne bovina':250,'peixe':140,
  'atum':132,'salmão':208,'salmao':208,'ovo':155,'clara de ovo':52,'ovo mexido':185,
  'banana':89,'maçã':52,'maca':52,'laranja':47,'uva':67,'mamão':43,'mamao':43,
  'abacaxi':50,'morango':32,'abacate':160,'manga':60,'kiwi':61,'melão':34,
  'leite':61,'leite integral':61,'leite desnatado':35,'iogurte':59,'iogurte grego':97,
  'queijo':402,'queijo minas':264,'queijo cottage':98,'whey':120,'whey protein':120,
  'pão':265,'pao':265,'pão francês':265,'pão integral':247,'tapioca':98,'granola':471,
  'macarrão':131,'macarrao':131,'batata':77,'batata doce':86,'mandioca':125,'inhame':98,
  'brócolis':34,'brocolis':34,'cenoura':41,'alface':15,'tomate':18,'espinafre':23,
  'abobrinha':17,'pepino':15,'cebola':40,'milho':86,'ervilha':81,'grão-de-bico':164,
  'pizza':266,'hambúrguer':295,'hamburguer':295,'batata frita':312,'nuggets':250,
  'chocolate':546,'bolo':350,'sorvete':207,'açaí':58,'acai':58,'biscoito':480,
  'café':2,'cafe':2,'suco':45,'refrigerante':42,'cerveja':43,'vinho':85,
  'água de coco':19,'agua de coco':19,'leite de coco':197,'chá':2,
  'azeite':884,'manteiga':717,'pasta de amendoim':589,'amendoim':567,'castanha':656,
  'aveia':389,'mel':304,'amêndoa':579,'amendoa':579,'nozes':654,
  'proteína':120,'proteina':120,'suplemento':120,'creatina':0,'bcaa':0,
  'atum em lata':132,'sardinha':150,'tilápia':96,'tilapia':96,'filé de peixe':105,
  'coxa de frango':215,'sobrecoxa':240,'frango inteiro':190,
};

function estimateCal(food, qty = 100) {
  const low = food.toLowerCase().trim();
  for (const [k, v] of Object.entries(CALDB)) if (low.includes(k)) return Math.round(v * qty / 100);
  return null;
}

/* ── ACHIEVEMENTS ─────────────────────────────────────── */
const ACH_DEF = [
  { id:'first_workout',  emoji:'🏋️', name:'Primeira Suor',       desc:'Complete seu 1º treino',          xp:100 },
  { id:'streak_3',       emoji:'🔥', name:'Em Chamas',            desc:'3 dias consecutivos',              xp:150 },
  { id:'streak_7',       emoji:'⚡', name:'Semana Perfeita',      desc:'7 dias seguidos',                  xp:500 },
  { id:'streak_30',      emoji:'🌟', name:'Mês Épico',            desc:'30 dias sem parar',                xp:2000 },
  { id:'first_log',      emoji:'📝', name:'Primeiro Registro',    desc:'Registrou a 1ª refeição',          xp:50 },
  { id:'calories_target',emoji:'🎯', name:'Meta Calórica',        desc:'Ficou na meta por 1 dia',          xp:100 },
  { id:'steps_10k',      emoji:'👟', name:'10 Mil Passos',        desc:'Bateu 10k passos',                 xp:150 },
  { id:'plan_generated', emoji:'🤖', name:'IA Ativada',           desc:'Gerou plano com IA',               xp:200 },
  { id:'level_5',        emoji:'🏆', name:'Guerreiro',            desc:'Chegou ao nível 5',                xp:0 },
  { id:'level_10',       emoji:'👑', name:'Lenda',                desc:'Chegou ao nível 10',               xp:0 },
  { id:'workouts_10',    emoji:'💯', name:'10 Treinos',           desc:'Completou 10 treinos',             xp:300 },
  { id:'premium',        emoji:'✦',  name:'Premium',              desc:'Ativou o plano premium',           xp:500 },
];

function unlock(id) {
  if (S.achievements.includes(id)) return;
  const a = ACH_DEF.find(x => x.id === id);
  if (!a) return;
  S.achievements.push(id);
  DB.set('achievements', S.achievements);
  if (a.xp) gainXP(a.xp);
  showToast(`🏅 ${a.name} desbloqueada! +${a.xp}XP`);
}

function gainXP(amount) {
  S.xp += amount;
  DB.set('xp', S.xp);
  const { lv } = FE.xpLevel(S.xp);
  if (lv > S.level) {
    S.level = lv; DB.set('level', lv);
    showToast(`🚀 LEVEL UP! Nível ${lv} — ${FE.lvName(lv)}!`, 4000);
    if (lv >= 5)  unlock('level_5');
    if (lv >= 10) unlock('level_10');
  }
}

/* ── LOG HELPERS ──────────────────────────────────────── */
function todayLog() {
  if (!S.logs[S.today]) S.logs[S.today] = { calories:0, items:[], workoutDone:false, steps:0, protein:0, carbs:0, fat:0 };
  return S.logs[S.today];
}
function saveLogs() { DB.set('logs', S.logs); }

function checkStreak() {
  const today = S.today;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (S.streak.lastDate === today) return;
  S.streak.count = S.streak.lastDate === yesterday ? S.streak.count + 1 : 1;
  S.streak.lastDate = today;
  DB.set('streak', S.streak);
  if (S.streak.count >= 3)  unlock('streak_3');
  if (S.streak.count >= 7)  unlock('streak_7');
  if (S.streak.count >= 30) unlock('streak_30');
}

/* ── UTILS ────────────────────────────────────────────── */
const $     = id  => document.getElementById(id);
const qsa   = sel => document.querySelectorAll(sel);
const fmt   = n   => (n || 0).toLocaleString('pt-BR');
const pct   = (v, t) => t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function greet() {
  const h = new Date().getHours();
  return h < 12 ? t('goodMorning') : h < 18 ? t('goodAfternoon') : t('goodEvening');
}

function todayDOW() { return (new Date().getDay() + 6) % 7; } // Mon=0

function dateFor(dayIdx) {
  const diff = dayIdx - todayDOW();
  return new Date(Date.now() + diff * 86400000).toISOString().slice(0, 10);
}

function last7() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
    return { date: d, cal: S.logs[d]?.calories || 0, done: S.logs[d]?.workoutDone || false, steps: S.logs[d]?.steps || 0 };
  });
}

let _toastTimer;
function showToast(msg, dur = 3000) {
  const el = $('toast');
  el.innerHTML = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

/* ── ROUTER ───────────────────────────────────────────── */
function go(screen) {
  const sc = $('screen');
  if (!sc) return;
  sc.innerHTML = '';
  sc.scrollTop = 0;
  S.screen = screen;

  const map = {
    auth:      renderAuth,
    onboard:   renderOnboard,
    dashboard: renderDashboard,
    workout:   renderWorkout,
    nutrition: renderNutrition,
    steps:     renderSteps,
    profile:   renderProfile,
  };
  (map[screen] || renderDashboard)(sc);

  const nav = $('nav');
  const noNav = ['auth', 'onboard'];
  if (nav) {
    nav.style.display = noNav.includes(screen) ? 'none' : 'flex';
    qsa('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === screen));
  }
}

/* ══════════════════════════════════════════════════════
   SCREENS
   ══════════════════════════════════════════════════════ */

/* ── AUTH ─────────────────────────────────────────────── */
function renderAuth(el) {
  el.innerHTML = `
  <div style="min-height:100vh;display:flex;flex-direction:column;padding:0 22px 40px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-80px;right:-60px;width:300px;height:300px;
      background:radial-gradient(circle,rgba(200,245,87,.07) 0%,transparent 65%);pointer-events:none"></div>
    <div style="position:absolute;bottom:0;left:-50px;width:220px;height:220px;
      background:radial-gradient(circle,rgba(34,211,238,.05) 0%,transparent 65%);pointer-events:none"></div>

    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:56px;margin-bottom:28px;">
      <div style="font-size:62px;margin-bottom:12px;animation:bounce 1s ease-in-out infinite">⚡</div>
      <div class="hero fu" style="background:linear-gradient(135deg,var(--lime),var(--green),var(--cyan));
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px">ShapeAI</div>
      <div class="sm fu d1" style="text-align:center;max-width:230px;line-height:1.5">
        Seu coach de fitness com IA<br>
        <span style="color:var(--lime);font-weight:600">Powered by Artificial Intelligence</span>
      </div>
      <div style="display:flex;gap:7px;margin-top:18px;flex-wrap:wrap;justify-content:center" class="fu d2">
        <span class="badge badge-lime">🤖 IA Trainer</span>
        <span class="badge badge-blue">🥗 IA Nutri</span>
        <span class="badge badge-orange">🏆 Gamificação</span>
      </div>
    </div>

    <div class="card fu d3" style="padding:22px">
      <div class="toggle" style="margin-bottom:20px">
        <button class="toggle-opt tog-on"  id="tl" onclick="authTab('login')">Entrar</button>
        <button class="toggle-opt tog-off" id="tr" onclick="authTab('reg')">Cadastrar</button>
      </div>
      <div id="fn" style="display:none;margin-bottom:13px">
        <label class="lbl">Nome</label>
        <input class="inp" id="an" type="text" placeholder="Como quer ser chamado?"/>
      </div>
      <div style="margin-bottom:13px">
        <label class="lbl">Email</label>
        <input class="inp" id="ae" type="email" placeholder="seu@email.com"/>
      </div>
      <div style="margin-bottom:6px">
        <label class="lbl">Senha</label>
        <input class="inp" id="ap" type="password" placeholder="••••••••"
          onkeydown="if(event.key==='Enter')doAuth()"/>
      </div>
      <p id="aerr" style="color:var(--red);font-size:12px;min-height:18px;margin:7px 0"></p>
      <button class="btn btn-primary" id="abtn" onclick="doAuth()">Entrar →</button>
      <p style="text-align:center;margin-top:14px;font-size:11px;color:var(--text3)">
        Demo: qualquer email + senha (min 4 caracteres)
      </p>
    </div>
  </div>`;
}

function authTab(m) {
  S._authMode = m;
  $('tl').className = 'toggle-opt ' + (m === 'login' ? 'tog-on' : 'tog-off');
  $('tr').className = 'toggle-opt ' + (m === 'reg'   ? 'tog-on' : 'tog-off');
  $('fn').style.display  = m === 'reg' ? 'block' : 'none';
  $('abtn').textContent  = m === 'login' ? 'Entrar →' : 'Criar Conta →';
}

function doAuth() {
  const email = $('ae').value.trim();
  const pass  = $('ap').value;
  const name  = S._authMode === 'reg' ? $('an').value.trim() : '';
  $('aerr').textContent = '';
  if (!email)         return ($('aerr').textContent = 'Informe seu email');
  if (pass.length < 4)return ($('aerr').textContent = 'Senha mínima: 4 caracteres');
  if (S._authMode === 'reg' && !name) return ($('aerr').textContent = 'Informe seu nome');

  S.user = { email, name: name || email.split('@')[0], createdAt: new Date().toISOString(), premium: false };
  DB.set('user', S.user);

  if (S._authMode === 'reg' || !S.profile) {
    S.onboardStep = 0; S.onboardData = {};
    go('onboard');
  } else {
    bootApp();
  }
}

function bootApp() {
  checkStreak();
  if (!S.workoutPlan && S.profile) {
    S.workoutPlan = AI.workout(S.profile);
    DB.set('workoutPlan', S.workoutPlan);
    S.nutritionPlan = AI.nutrition(S.profile);
    DB.set('nutritionPlan', S.nutritionPlan);
    unlock('plan_generated');
  }
  $('root').style.display = 'flex';
  go('dashboard');
}

/* ── ONBOARDING ───────────────────────────────────────── */
const OB_STEPS = [
  {
    key:'info', title:'Sobre você', sub:'Personalizamos tudo para você',
    fields:[
      { key:'name',   label:'Seu nome',    type:'text',   ph:'Ex: João' },
      { key:'age',    label:'Idade',       type:'number', ph:'25', min:14, max:80 },
      { key:'weight', label:'Peso (kg)',   type:'number', ph:'70', min:30, max:250 },
      { key:'height', label:'Altura (cm)', type:'number', ph:'175',min:120,max:230 },
    ],
  },
  {
    key:'goal', title:'Qual é seu objetivo?', sub:'A IA cria o plano ideal',
    opts:[
      { v:'lose',     emoji:'🔥', label:'Perder Peso',    sub:'Déficit calórico + HIIT' },
      { v:'gain',     emoji:'💪', label:'Ganhar Massa',   sub:'Superávit + treino pesado' },
      { v:'maintain', emoji:'⚖️', label:'Manter Forma',  sub:'Equilíbrio + saúde' },
    ],
  },
  {
    key:'level', title:'Nível de treino', sub:'Para calibrar intensidade',
    opts:[
      { v:'beginner',     emoji:'🌱', label:'Iniciante',     sub:'Menos de 6 meses' },
      { v:'intermediate', emoji:'⚡', label:'Intermediário', sub:'6 meses a 2 anos' },
      { v:'advanced',     emoji:'🔥', label:'Avançado',      sub:'Mais de 2 anos' },
    ],
  },
  {
    key:'days', title:'Dias disponíveis', sub:'Quantos dias por semana?',
    opts:[
      { v:'2', emoji:'📅', label:'2 dias', sub:'Treinos curtos e intensos' },
      { v:'3', emoji:'📅', label:'3 dias', sub:'Ideal para iniciantes' },
      { v:'4', emoji:'📅', label:'4 dias', sub:'Ótimo para resultados' },
      { v:'5', emoji:'📅', label:'5 dias', sub:'Máximo volume' },
    ],
  },
  {
    key:'gender', title:'Gênero biológico', sub:'Para cálculos precisos de TMB',
    opts:[
      { v:'m', emoji:'♂️', label:'Masculino', sub:'' },
      { v:'f', emoji:'♀️', label:'Feminino',  sub:'' },
    ],
  },
  {
    key:'activityLevel', title:'Atividade diária', sub:'Fora dos treinos',
    opts:[
      { v:'1', emoji:'🛋️', label:'Sedentário',       sub:'Trabalho sentado' },
      { v:'2', emoji:'🚶', label:'Levemente ativo',  sub:'Caminhadas casuais' },
      { v:'3', emoji:'🏃', label:'Moderado',         sub:'Exercícios 3-5x/semana' },
      { v:'4', emoji:'⚡', label:'Muito ativo',      sub:'Trabalho físico' },
    ],
  },
];

function renderOnboard(el) {
  const step = OB_STEPS[S.onboardStep];
  el.innerHTML = `
  <div style="padding:32px 22px 24px">
    <div class="ob-dots">
      ${OB_STEPS.map((_, i) => `<div class="ob-dot ${i < S.onboardStep ? 'done' : i === S.onboardStep ? 'active' : ''}"></div>`).join('')}
    </div>
    <div class="fu">
      <div class="xs" style="margin-bottom:7px">PASSO ${S.onboardStep + 1} DE ${OB_STEPS.length}</div>
      <h2 class="h1" style="margin-bottom:5px">${step.title}</h2>
      <p class="sm" style="margin-bottom:26px">${step.sub}</p>
    </div>

    ${step.fields ? `
    <div style="display:flex;flex-direction:column;gap:13px" class="fu d1">
      ${step.fields.map(f => `
      <div>
        <label class="lbl">${f.label}</label>
        <input class="inp" id="ob_${f.key}" type="${f.type}" placeholder="${f.ph}"
          value="${S.onboardData[f.key] || ''}" ${f.min ? `min="${f.min}" max="${f.max}"` : ''}/>
      </div>`).join('')}
    </div>` : ''}

    ${step.opts ? `
    <div style="display:flex;flex-direction:column;gap:9px" class="fu d1">
      ${step.opts.map(o => `
      <button class="opt-btn ${S.onboardData[step.key] === o.v ? 'sel' : ''}"
        onclick="obSelect('${step.key}','${o.v}')">
        <span style="font-size:27px;flex-shrink:0">${o.emoji}</span>
        <div style="text-align:left;flex:1">
          <div style="font-weight:700;font-size:15px">${o.label}</div>
          ${o.sub ? `<div class="sm" style="margin-top:2px">${o.sub}</div>` : ''}
        </div>
        <div style="width:21px;height:21px;border-radius:50%;flex-shrink:0;border:2px solid ${S.onboardData[step.key] === o.v ? 'var(--lime)' : 'var(--border2)'};background:${S.onboardData[step.key] === o.v ? 'var(--lime)' : 'transparent'};display:flex;align-items:center;justify-content:center">
          ${S.onboardData[step.key] === o.v ? '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l3 3 5-5" stroke="#050508" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' : ''}
        </div>
      </button>`).join('')}
    </div>` : ''}

    <div style="display:flex;gap:10px;margin-top:28px" class="fu d3">
      ${S.onboardStep > 0 ? `<button class="btn btn-secondary" style="flex:1" onclick="obBack()">← Voltar</button>` : ''}
      <button class="btn btn-primary" style="flex:2" onclick="obNext()">
        ${S.onboardStep === OB_STEPS.length - 1 ? '🤖 Gerar Meu Plano →' : 'Próximo →'}
      </button>
    </div>
  </div>`;
}

function obSelect(key, val) {
  S.onboardData[key] = val;
  qsa('.opt-btn').forEach((btn, i) => {
    const o = OB_STEPS[S.onboardStep].opts[i];
    if (!o) return;
    const sel = S.onboardData[key] === o.v;
    btn.className = 'opt-btn' + (sel ? ' sel' : '');
    const ring = btn.querySelector('div:last-child');
    if (ring) {
      ring.style.borderColor = sel ? 'var(--lime)' : 'var(--border2)';
      ring.style.background  = sel ? 'var(--lime)' : 'transparent';
      ring.innerHTML = sel ? '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l3 3 5-5" stroke="#050508" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' : '';
    }
  });
}

function obNext() {
  const step = OB_STEPS[S.onboardStep];
  if (step.fields) {
    for (const f of step.fields) {
      const el = $(`ob_${f.key}`);
      if (!el || !el.value.trim()) { showToast('⚠️ Preencha todos os campos'); return; }
      S.onboardData[f.key] = f.type === 'number' ? parseFloat(el.value) : el.value.trim();
    }
  } else if (step.opts && !S.onboardData[step.key]) {
    showToast('⚠️ Selecione uma opção'); return;
  }

  if (S.onboardStep < OB_STEPS.length - 1) { S.onboardStep++; go('onboard'); return; }

  // Finalize
  const p = {
    ...S.onboardData,
    goal:          S.onboardData.goal || 'maintain',
    level:         S.onboardData.level || 'beginner',
    days:          parseInt(S.onboardData.days) || 3,
    activityLevel: parseInt(S.onboardData.activityLevel) || 2,
    gender:        S.onboardData.gender || 'm',
    weight:        parseFloat(S.onboardData.weight) || 70,
    height:        parseFloat(S.onboardData.height) || 175,
    age:           parseInt(S.onboardData.age) || 25,
    stepGoal:      10000,
  };
  S.profile = p; DB.set('profile', p);
  S.workoutPlan = AI.workout(p); DB.set('workoutPlan', S.workoutPlan);
  S.nutritionPlan = AI.nutrition(p); DB.set('nutritionPlan', S.nutritionPlan);
  if (S.user) { S.user.name = p.name || S.user.name; DB.set('user', S.user); }
  unlock('plan_generated');
  checkStreak();
  showToast('✅ Plano gerado! Bem-vindo ao ShapeAI!');
  $('root').style.display = 'flex';
  go('dashboard');
}

function obBack() {
  if (S.onboardStep > 0) { S.onboardStep--; go('onboard'); }
}

/* ── DASHBOARD ────────────────────────────────────────── */
function renderDashboard(el) {
  const p     = S.profile || {};
  const log   = todayLog();
  const np    = S.nutritionPlan || {};
  const xpD   = FE.xpLevel(S.xp);
  const tgt   = np.target || 2000;
  const calIn = log.calories || 0;
  const wDay  = S.workoutPlan?.schedule?.[todayDOW()] || {};
  const burned= FE.stepsCal(log.steps || 0, p.weight) + (log.workoutDone ? (wDay.calories || 300) : 0);
  const bal   = tgt - calIn + burned;
  const w7    = last7();
  const coach = S.profile ? AI.coachMsg(p, log, S.streak) : '👋 Complete seu perfil para ativar a IA!';

  el.innerHTML = `
  <div style="padding-bottom:24px">

    <!-- TOP BAR -->
    <div class="topbar">
      <div>
        <div class="sm" style="margin-bottom:2px">${greet()},</div>
        <div style="font-size:21px;font-weight:800;letter-spacing:-.5px">${S.user?.name || 'Atleta'} 👋</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="text-align:right">
          <div class="xs">Nível ${xpD.lv}</div>
          <div style="font-size:12px;font-weight:700;color:var(--lime)">${FE.lvName(xpD.lv)}</div>
        </div>
        <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--lime),var(--green));
          display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#050508;cursor:pointer"
          onclick="go('profile')">${(S.user?.name || 'A')[0].toUpperCase()}</div>
      </div>
    </div>

    <!-- XP -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span class="xs">XP — ${fmt(S.xp)}</span>
        <span style="font-size:11px;color:var(--lime);font-weight:700">${xpD.pct}% → Nível ${xpD.lv + 1}</span>
      </div>
      <div class="xp-wrap"><div class="xp-fill" style="width:${xpD.pct}%"></div></div>
    </div>

    <!-- STREAK + STATS ROW -->
    <div style="padding:0 20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:18px" class="fu d1">
      ${[
        { icon: S.streak.count >= 7 ? '🔥' : '📅', val: S.streak.count, label:'Streak' },
        { icon: '🏅', val: S.achievements.length, label:'Medalhas' },
        { icon: '👟', val: fmt(log.steps || 0), label:'Passos' },
      ].map(s => `
      <div class="card" style="padding:13px;display:flex;align-items:center;gap:9px">
        <span style="font-size:24px">${s.icon}</span>
        <div>
          <div style="font-size:20px;font-weight:900;line-height:1;font-family:var(--font2)">${s.val}</div>
          <div class="xs">${s.label}</div>
        </div>
      </div>`).join('')}
    </div>

    <!-- AI COACH -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu d2">
      <div class="card-prem" style="padding:15px">
        <div style="display:flex;gap:11px;align-items:flex-start">
          <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--lime),var(--cyan));
            display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">🤖</div>
          <div>
            <div style="font-size:11px;color:var(--lime);font-weight:700;margin-bottom:3px;font-family:var(--font2)">IA COACH</div>
            <div style="font-size:13px;line-height:1.55">${coach}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- CALORIE OVERVIEW -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu d2">
      <div class="sec"><span class="sec-t">📊 Hoje</span>
        <span class="xs">${new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'numeric',month:'short'})}</span>
      </div>
      <div class="card" style="padding:18px">
        <div style="display:flex;gap:14px;align-items:center">
          <!-- SVG Ring -->
          <div style="flex-shrink:0;width:96px;height:96px;position:relative">
            ${calRingSVG(calIn, tgt, burned)}
          </div>
          <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:9px">
            ${[
              { label:'Ingerido',  val:calIn,         color:'var(--orange)', icon:'🍽️' },
              { label:'Queimado',  val:burned,        color:'var(--green)',  icon:'🔥' },
              { label:'Meta',      val:tgt,           color:'var(--cyan)',   icon:'🎯' },
              { label:'Saldo',     val:Math.abs(bal), color:bal>=0?'var(--green)':'var(--red)', icon:bal>=0?'✅':'⚠️' },
            ].map(s => `
            <div>
              <div style="font-size:10px;color:var(--text3);margin-bottom:1px">${s.icon} ${s.label}</div>
              <div style="font-size:15px;font-weight:800;color:${s.color};font-family:var(--font2)">${fmt(s.val)}</div>
            </div>`).join('')}
          </div>
        </div>
        ${np.macros ? `
        <div class="div"></div>
        <div class="macro-grid">
          ${[
            { n:'Proteína', v:log.protein||0, t:np.macros.protein, c:'var(--cyan)' },
            { n:'Carbs',    v:log.carbs||0,   t:np.macros.carbs,   c:'var(--orange)' },
            { n:'Gordura',  v:log.fat||0,     t:np.macros.fat,     c:'var(--purple)' },
          ].map(m => `
          <div class="macro-card">
            <div class="xs" style="margin-bottom:5px">${m.n}</div>
            <div style="font-size:16px;font-weight:800;color:${m.c};font-family:var(--font2)">${Math.round(m.v)}g</div>
            <div style="font-size:9px;color:var(--text3);margin-top:1px">/ ${m.t}g</div>
            <div class="prog" style="margin-top:5px;height:3px"><div class="prog-fill" style="width:${pct(m.v,m.t)}%;background:${m.c}"></div></div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <!-- TODAY WORKOUT PREVIEW -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu d3">
      <div class="sec">
        <span class="sec-t">🏋️ Treino de Hoje</span>
        <button class="btn btn-ghost" style="padding:5px 11px;font-size:12px" onclick="go('workout')">Ver tudo →</button>
      </div>
      ${wDay.isRest ? `
      <div class="card-prem" style="padding:18px;text-align:center">
        <div style="font-size:34px;margin-bottom:7px">😴</div>
        <div style="font-weight:700;font-size:15px;margin-bottom:3px">Dia de Descanso</div>
        <div class="sm">Recuperação é parte do treino. Hidrate-se!</div>
      </div>` : `
      <div class="card-glow" style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <div style="font-weight:800;font-size:15px">${typeLabel(wDay.type)}</div>
            <div class="sm">${wDay.duration}min · ~${wDay.calories} kcal</div>
          </div>
          <span class="badge ${log.workoutDone ? 'badge-lime' : 'badge-blue'}">${log.workoutDone ? '✅ Feito' : '⚡ Pendente'}</span>
        </div>
        ${(wDay.exercises || []).slice(0, 3).map(ex => `
        <div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:17px">${ex.emoji}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600">${ex.name}</div>
            <div style="font-size:11px;color:var(--text3)">${ex.sets}×${ex.reps} · ${ex.rest}s rest</div>
          </div>
        </div>`).join('')}
        ${!log.workoutDone ? `<button class="btn btn-primary" style="margin-top:12px" onclick="go('workout')">▶ Iniciar Treino</button>` : ''}
      </div>`}
    </div>

    <!-- WEEKLY CHART -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu d4">
      <div class="sec"><span class="sec-t">📈 Calorias — 7 dias</span></div>
      <div class="card" style="padding:16px">
        ${weekChart(w7, tgt)}
      </div>
    </div>

    <!-- STREAK WEEK -->
    <div style="padding:0 20px;margin-bottom:18px" class="fu d5">
      <div class="sec"><span class="sec-t">📅 Esta Semana</span></div>
      <div class="card" style="padding:14px">
        <div style="display:flex;gap:5px;justify-content:space-between">
          ${['S','T','Q','Q','S','S','D'].map((d, i) => {
            const date = new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10);
            const done = S.logs[date]?.workoutDone;
            const isToday = date === S.today;
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px">
              <div class="xs">${d}</div>
              <div class="s-day ${done ? 's-done' : isToday ? 's-now' : 's-miss'}">${done ? '✓' : isToday ? '→' : '·'}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- CHALLENGES -->
    <div style="padding:0 20px" class="fu d6">
      <div class="sec"><span class="sec-t">🏆 Desafios Ativos</span></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${challenges()}
      </div>
    </div>
  </div>`;
}

function calRingSVG(cur, tgt, burned) {
  const r1 = 42, r2 = 32, cx = 48, cy = 48;
  const c1 = 2 * Math.PI * r1, c2 = 2 * Math.PI * r2;
  const p1 = pct(cur, tgt), p2 = pct(burned, tgt);
  return `<svg viewBox="0 0 96 96" width="96" height="96">
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="var(--orange)" stroke-width="10"
      stroke-dasharray="${c1}" stroke-dashoffset="${c1*(1-p1/100)}"
      stroke-linecap="round" transform="rotate(-90 48 48)" style="transition:stroke-dashoffset .6s ease"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="rgba(255,255,255,.03)" stroke-width="7"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="var(--green)" stroke-width="7"
      stroke-dasharray="${c2}" stroke-dashoffset="${c2*(1-p2/100)}"
      stroke-linecap="round" transform="rotate(-90 48 48)" style="transition:stroke-dashoffset .6s ease"/>
    <text x="48" y="44" text-anchor="middle" fill="var(--text)" font-size="11" font-weight="800" font-family="var(--font2)">${p1}%</text>
    <text x="48" y="55" text-anchor="middle" fill="var(--text3)" font-size="8" font-family="var(--font2)">meta</text>
  </svg>`;
}

function weekChart(w7, tgt) {
  const max = Math.max(...w7.map(d => d.cal), tgt, 1);
  return `
  <div class="chart-bars" style="margin-bottom:8px">
    ${w7.map((d, i) => {
      const h = Math.round(d.cal / max * 72) + 6;
      const isToday = i === 6;
      const over = d.cal > tgt && d.cal > 0;
      return `<div class="bar-col" style="height:${h}px;background:${isToday ? 'linear-gradient(to top,var(--lime),var(--green))' : over ? 'rgba(248,113,113,.5)' : 'var(--bg4)'}"></div>`;
    }).join('')}
  </div>
  <div style="display:flex;gap:5px">
    ${['S','T','Q','Q','S','S','D'].map(d => `<div style="flex:1;text-align:center;font-size:10px;color:var(--text3);font-family:var(--font2)">${d}</div>`).join('')}
  </div>`;
}

function challenges() {
  const w7 = last7();
  const data = [
    { emoji:'🔥', name:'7 Dias Seguidos',  progress:Math.min(S.streak.count,7), total:7,     reward:'500XP', c:'var(--orange)' },
    { emoji:'👟', name:'70k Passos/Semana',progress:w7.reduce((a,d)=>a+(S.logs[d.date]?.steps||0),0), total:70000, reward:'300XP', c:'var(--purple)' },
    { emoji:'🥗', name:'Nutri 5 Dias',     progress:w7.filter(d=>S.logs[d.date]?.items?.length>0).length, total:5, reward:'200XP', c:'var(--cyan)' },
  ];
  return data.map(c => `
  <div class="card" style="padding:14px">
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:10px">
      <span style="font-size:24px">${c.emoji}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px">${c.name}</div>
      </div>
      <span class="badge badge-gold">${c.reward}</span>
    </div>
    <div style="display:flex;align-items:center;gap:9px">
      <div class="prog" style="flex:1"><div class="prog-fill" style="width:${pct(c.progress,c.total)}%;background:${c.c}"></div></div>
      <span style="font-size:11px;color:var(--text2);font-family:var(--font2);white-space:nowrap">${fmt(c.progress)}/${fmt(c.total)}</span>
    </div>
  </div>`).join('');
}

function typeLabel(type) {
  return { upper:'💪 Membros Superiores', lower:'🦵 Membros Inferiores', core:'🔥 Core & Abdômen', cardio:'⚡ Cardio', rest:'😴 Descanso' }[type] || '🏋️ Treino';
}

/* ── WORKOUT ──────────────────────────────────────────── */
function renderWorkout(el) {
  const plan = S.workoutPlan;
  if (!plan) {
    el.innerHTML = `<div style="padding:80px 22px;text-align:center">
      <div style="font-size:48px;margin-bottom:14px">🤖</div>
      <div class="h1" style="margin-bottom:8px">Complete seu perfil</div>
      <p class="sm" style="margin-bottom:22px">A IA precisa dos seus dados para criar o plano</p>
      <button class="btn btn-primary" onclick="go('profile')">Completar Perfil →</button>
    </div>`; return;
  }

  S._workoutDayIdx = todayDOW();
  const log = todayLog();

  el.innerHTML = `
  <div style="padding-bottom:30px">
    <div class="topbar">
      <h1 class="h1">🏋️ Treino</h1>
      <span class="badge badge-lime">Semana ${plan.weekNumber}</span>
    </div>

    <!-- DAY CHIPS -->
    <div style="padding:0 20px 14px">
      <div class="chips" id="wchips">
        ${plan.schedule.map((d, i) => `
        <div class="chip ${i === S._workoutDayIdx ? 'on' : ''}" id="wc${i}" onclick="wSelectDay(${i})">
          ${d.isRest ? '😴' : dayEmoji(d.type)} ${d.day.slice(0,3)}
        </div>`).join('')}
      </div>
    </div>

    <!-- DAY CONTENT -->
    <div id="wday" style="padding:0 20px">
      ${wDayHTML(plan.schedule[S._workoutDayIdx], S._workoutDayIdx === todayDOW(), log)}
    </div>

    <!-- WEEK OVERVIEW -->
    <div style="padding:14px 20px 0">
      <div class="sec"><span class="sec-t">📅 Plano da Semana</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${plan.schedule.map((d, i) => `
        <div class="card" style="padding:13px;display:flex;align-items:center;gap:11px;cursor:pointer;opacity:${i===todayDOW()?1:0.65}" onclick="wSelectDay(${i})">
          <div style="width:34px;height:34px;border-radius:9px;background:${d.isRest ? 'var(--bg3)' : `linear-gradient(135deg,${dColor(d.type)},${dColor2(d.type)})`};
            display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">${d.isRest ? '😴' : dayEmoji(d.type)}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${d.day}${i===todayDOW()?' <span style="color:var(--lime);font-size:10px"> · HOJE</span>':''}</div>
            <div class="sm" style="font-size:11px">${d.isRest ? 'Descanso' : typeLabel(d.type)} ${d.duration ? '· '+d.duration+'min' : ''}</div>
          </div>
          ${S.logs[dateFor(i)]?.workoutDone ? `<span style="color:var(--lime);font-size:15px">✓</span>` : ''}
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function wDayHTML(day, isToday, log) {
  if (day.isRest) return `
  <div class="card-prem" style="padding:22px;text-align:center;margin-bottom:14px">
    <div style="font-size:46px;margin-bottom:10px">😴</div>
    <div class="h2" style="margin-bottom:7px">Dia de Descanso</div>
    <p class="sm">Seu músculo cresce na recuperação.<br>Hidrate-se, durma bem!</p>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap">
      <span class="badge badge-lime">💧 Hidratação</span>
      <span class="badge badge-blue">😴 8h de sono</span>
      <span class="badge badge-orange">🧘 Alongamento</span>
    </div>
  </div>`;

  const done = isToday && log?.workoutDone;
  return `
  <div>
    <div class="card-glow" style="padding:16px;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <div class="h3">${typeLabel(day.type)}</div>
        ${done ? `<span class="badge badge-lime">✅ Concluído</span>` : isToday ? `<span class="badge badge-orange">⚡ Hoje</span>` : ''}
      </div>
      <div style="display:flex;gap:14px;margin-top:7px">
        <span class="sm">⏱ ${day.duration}min</span>
        <span class="sm">🔥 ~${day.calories} kcal</span>
        <span class="sm">💪 ${day.exercises?.length||0} exercícios</span>
      </div>
    </div>

    ${(day.exercises||[]).map((ex, i) => `
    <div class="wex fu" style="animation-delay:${i*.04}s">
      <div style="width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--bg4),var(--bg3));
        display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0">${ex.emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:14px;margin-bottom:1px">${ex.name}</div>
        <div class="sm" style="font-size:11px">${ex.sets} séries · ${ex.reps} reps · 🎯 ${ex.muscle}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:1px">⏱ ${ex.rest}s descanso</div>
      </div>
      ${isToday ? `
      <div style="width:26px;height:26px;border-radius:50%;border:2px solid ${ex.done?'var(--lime)':'var(--border2)'};
        background:${ex.done?'var(--lime)':'transparent'};display:flex;align-items:center;justify-content:center;
        cursor:pointer;flex-shrink:0;transition:all .2s" onclick="wToggleEx(${i})">
        ${ex.done ? '<svg width="11" height="11" viewBox="0 0 11 11"><path d="M1.5 5.5l3 3 5-5" stroke="#050508" stroke-width="2" fill="none" stroke-linecap="round"/></svg>' : ''}
      </div>` : ''}
    </div>`).join('')}

    ${isToday && !done ? `
    <button class="btn btn-primary" style="margin-top:14px" onclick="wComplete()">
      ✅ Concluir Treino (+${300+(day.exercises?.length||0)*20} XP)
    </button>` : done ? `
    <div class="card-prem" style="padding:14px;text-align:center;margin-top:14px">
      <div style="font-size:26px;margin-bottom:5px">🏆</div>
      <div style="font-weight:700">Treino Concluído! Incrível!</div>
    </div>` : ''}
  </div>`;
}

function wSelectDay(idx) {
  S._workoutDayIdx = idx;
  const wd = $('wday');
  if (wd && S.workoutPlan) wd.innerHTML = wDayHTML(S.workoutPlan.schedule[idx], idx === todayDOW(), todayLog());
  qsa('[id^="wc"]').forEach((el, i) => el.className = 'chip ' + (i === idx ? 'on' : ''));
}

function wToggleEx(idx) {
  const day = S.workoutPlan?.schedule?.[S._workoutDayIdx];
  if (!day?.exercises?.[idx]) return;
  day.exercises[idx].done = !day.exercises[idx].done;
  DB.set('workoutPlan', S.workoutPlan);
  wSelectDay(S._workoutDayIdx);
}

function wComplete() {
  const log = todayLog();
  log.workoutDone = true;
  checkStreak();
  saveLogs();
  const day = S.workoutPlan?.schedule?.[todayDOW()];
  const xp  = 300 + (day?.exercises?.length || 0) * 20;
  gainXP(xp);
  unlock('first_workout');
  const total = Object.values(S.logs).filter(l => l.workoutDone).length;
  if (total >= 10) unlock('workouts_10');
  showToast(`🏆 Treino concluído! +${xp} XP`);
  go('workout');
}

function dayEmoji(type) { return { upper:'💪',lower:'🦵',core:'🔥',cardio:'⚡' }[type]||'🏋️'; }
function dColor(type)  { return { upper:'rgba(99,102,241,.8)',lower:'rgba(74,222,128,.8)',core:'rgba(251,146,60,.8)',cardio:'rgba(200,245,87,.8)' }[type]||'rgba(168,85,247,.8)'; }
function dColor2(type) { return { upper:'rgba(34,211,238,.8)',lower:'rgba(200,245,87,.8)',core:'rgba(251,191,36,.8)',cardio:'rgba(74,222,128,.8)' }[type]||'rgba(99,102,241,.8)'; }

/* ── NUTRITION ────────────────────────────────────────── */
function renderNutrition(el) {
  const np    = S.nutritionPlan || {};
  const log   = todayLog();
  const tgt   = np.target || 2000;
  const calIn = log.calories || 0;

  el.innerHTML = `
  <div style="padding-bottom:30px">
    <div class="topbar">
      <h1 class="h1">🥗 Nutrição</h1>
      <button class="btn btn-lime" style="padding:8px 13px;font-size:12px" onclick="nutOpenModal()">+ Adicionar</button>
    </div>

    <!-- CALORIE CARD -->
    <div style="padding:0 20px 16px">
      <div class="card" style="padding:17px">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:13px">
          <div>
            <div class="xs" style="margin-bottom:3px">CALORIAS HOJE</div>
            <div style="font-size:38px;font-weight:900;font-family:var(--font2);
              background:linear-gradient(135deg,var(--orange),var(--yellow));
              -webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1">${fmt(calIn)}</div>
          </div>
          <div style="text-align:right">
            <div class="sm">Meta: ${fmt(tgt)} kcal</div>
            <div style="font-size:13px;font-weight:700;margin-top:2px;color:${calIn>tgt?'var(--red)':'var(--green)'}">${calIn>tgt?`+${calIn-tgt} acima`:`${tgt-calIn} restantes`}</div>
          </div>
        </div>
        <div class="prog" style="height:8px;margin-bottom:14px">
          <div class="prog-fill p-orange" style="width:${Math.min(pct(calIn,tgt),100)}%"></div>
        </div>
        ${np.macros ? `
        <div class="macro-grid">
          ${[
            { n:'Proteína', v:log.protein||0, t:np.macros.protein, c:'var(--cyan)' },
            { n:'Carbs',    v:log.carbs||0,   t:np.macros.carbs,   c:'var(--orange)' },
            { n:'Gordura',  v:log.fat||0,     t:np.macros.fat,     c:'var(--purple)' },
          ].map(m => `
          <div class="macro-card">
            <div class="xs" style="margin-bottom:5px">${m.n}</div>
            <div style="font-size:17px;font-weight:800;color:${m.c};font-family:var(--font2)">${Math.round(m.v)}g</div>
            <div style="font-size:9px;color:var(--text3)">/ ${m.t}g</div>
            <div class="prog" style="margin-top:5px;height:3px"><div class="prog-fill" style="width:${pct(m.v,m.t)}%;background:${m.c}"></div></div>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>

    <!-- AI FEEDBACK -->
    <div style="padding:0 20px 16px">
      <div class="card-prem" style="padding:13px 15px">
        <div style="display:flex;gap:9px;align-items:flex-start">
          <span style="font-size:20px;flex-shrink:0">🤖</span>
          <div>
            <div style="font-size:11px;color:var(--lime);font-weight:700;margin-bottom:3px;font-family:var(--font2)">IA NUTRICIONISTA</div>
            <div style="font-size:13px;line-height:1.5">${nutFeedback(calIn, tgt)}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- FOOD LOG -->
    ${log.items?.length > 0 ? `
    <div style="padding:0 20px 16px">
      <div class="sec">
        <span class="sec-t">📝 Registrado hoje (${log.items.length})</span>
        <button onclick="nutClear()" style="background:transparent;border:none;color:var(--red);font-size:12px;cursor:pointer">Limpar</button>
      </div>
      <div class="card" style="padding:0 15px">
        ${log.items.map((item, i) => `
        <div class="food-item">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
            <div class="sm" style="font-size:11px">${item.qty}g</div>
          </div>
          <div style="font-weight:800;font-size:14px;color:var(--orange);font-family:var(--font2);white-space:nowrap">${item.cal!=null?item.cal+' kcal':'?'}</div>
          <button onclick="nutRemove(${i})" style="background:transparent;border:none;color:var(--text3);cursor:pointer;font-size:19px;margin-left:8px">×</button>
        </div>`).join('')}
      </div>
    </div>` : `
    <div style="padding:0 20px 16px;text-align:center">
      <div style="font-size:34px;margin-bottom:7px">🍽️</div>
      <div class="sm">Registre suas refeições para acompanhar os macros</div>
    </div>`}

    <!-- MEAL PLAN -->
    ${np.meals ? `
    <div style="padding:0 20px 16px">
      <div class="sec"><span class="sec-t">📋 Plano IA do Dia</span><span class="badge badge-lime">Personalizado</span></div>
      <div style="display:flex;flex-direction:column;gap:9px">
        ${np.meals.map(m => `
        <div class="card" style="padding:14px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px">
            <div style="display:flex;align-items:center;gap:9px">
              <span style="font-size:21px">${m.emoji}</span>
              <div>
                <div style="font-weight:700;font-size:14px">${m.name}</div>
                <div style="font-size:11px;color:var(--text3)">⏰ ${m.time}</div>
              </div>
            </div>
            <span class="badge badge-orange">🔥 ${m.cal} kcal</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${(m.foods||[]).map(f => `<span style="background:var(--bg3);border-radius:99px;padding:3px 9px;font-size:11px;color:var(--text2)">${f}</span>`).join('')}
          </div>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- METABOLISM -->
    ${np.bmr ? `
    <div style="padding:0 20px">
      <div class="sec"><span class="sec-t">🔬 Metabolismo</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        ${[
          { label:'TMB',    val:fmt(np.bmr),    sub:'Metabolismo basal', icon:'🧬', c:'var(--cyan)' },
          { label:'TDEE',   val:fmt(np.tdee),   sub:'Gasto total diário', icon:'⚡', c:'var(--orange)' },
          { label:'Meta',   val:fmt(np.target), sub:`Alvo diário`, icon:'🎯', c:'var(--lime)' },
          { label:'Ajuste', val:(np.target>np.tdee?'+':'')+(np.target-np.tdee), sub:'kcal/dia', icon:np.target>=np.tdee?'📈':'📉', c:np.target>=np.tdee?'var(--green)':'var(--blue)' },
        ].map(s => `
        <div class="card" style="padding:14px">
          <div style="font-size:20px;margin-bottom:6px">${s.icon}</div>
          <div style="font-size:22px;font-weight:900;color:${s.c};font-family:var(--font2);line-height:1;margin-bottom:3px">${s.val}</div>
          <div class="xs">${s.label}</div>
          <div class="sm" style="font-size:10px;margin-top:2px">${s.sub}</div>
        </div>`).join('')}
      </div>
    </div>` : ''}
  </div>

  <!-- ADD FOOD MODAL -->
  <div id="nutModal" class="overlay" style="display:none" onclick="if(event.target===this)nutCloseModal()">
    <div class="sheet">
      <div class="handle"></div>
      <div class="h2" style="margin-bottom:5px">➕ Registrar Alimento</div>
      <p class="sm" style="margin-bottom:18px">Digite o alimento e a quantidade em gramas</p>
      <div style="margin-bottom:11px">
        <label class="lbl">Alimento</label>
        <input class="inp" id="nfood" placeholder="Ex: arroz, frango, banana…" autofocus
          oninput="nutPreview()" onkeydown="if(event.key==='Enter')nutAdd()"/>
      </div>
      <div style="margin-bottom:16px">
        <label class="lbl">Quantidade (gramas)</label>
        <input class="inp" id="nqty" type="number" value="100" min="1" max="2000" oninput="nutPreview()"/>
      </div>
      <div id="nprev" style="display:none;padding:11px 14px;background:var(--bg3);border-radius:var(--r);margin-bottom:14px;font-size:13px"></div>
      <button class="btn btn-primary" onclick="nutAdd()">Adicionar ao Diário</button>
      <button class="btn btn-ghost"   style="margin-top:9px" onclick="nutCloseModal()">Cancelar</button>
    </div>
  </div>`;
}

function nutFeedback(cur, tgt) {
  if (cur === 0) return 'Nenhuma refeição registrada ainda. Comece a registrar para acompanhar seus macros!';
  const d = cur - tgt;
  if (Math.abs(d) < 100) return '✅ Calorias no ponto hoje! Continue assim!';
  if (d < -400)  return `⚠️ Déficit de ${Math.abs(d)} kcal. Coma mais para proteger sua massa muscular!`;
  if (d < -100)  return `📉 Você está ${Math.abs(d)} kcal abaixo. Um lanche proteico cairia bem!`;
  if (d > 400)   return `📈 Você ultrapassou a meta em ${d} kcal. Compense com mais passos!`;
  return `⚡ Apenas ${d} kcal acima. Tudo sob controle!`;
}

function nutOpenModal() { $('nutModal').style.display = 'flex'; setTimeout(() => $('nfood')?.focus(), 100); }
function nutCloseModal() { $('nutModal').style.display = 'none'; }

function nutPreview() {
  const food = $('nfood')?.value?.trim();
  const qty  = parseFloat($('nqty')?.value) || 100;
  const prev = $('nprev');
  if (!prev) return;
  if (!food || food.length < 2) { prev.style.display = 'none'; return; }
  const cal = estimateCal(food, qty);
  prev.style.display = 'block';
  prev.innerHTML = cal !== null
    ? `<span style="color:var(--lime)">✅ Estimativa: <strong>${cal} kcal</strong></span> para ${qty}g de ${food}`
    : `<span style="color:var(--text3)">⚠️ Alimento não encontrado — será registrado sem calorias</span>`;
}

function nutAdd() {
  const name = $('nfood')?.value?.trim();
  const qty  = parseFloat($('nqty')?.value) || 100;
  if (!name) return showToast('⚠️ Digite o nome do alimento');
  const cal = estimateCal(name, qty);
  const log = todayLog();
  if (!log.items) log.items = [];
  log.items.push({ name, qty, cal });
  if (cal) log.calories = (log.calories || 0) + cal;
  saveLogs();
  unlock('first_log');
  if (Math.abs((log.calories || 0) - (S.nutritionPlan?.target || 2000)) < 100) unlock('calories_target');
  nutCloseModal();
  showToast(cal ? `✅ ${name}: ${cal} kcal` : `📝 ${name} adicionado`);
  go('nutrition');
}

function nutRemove(idx) {
  const log  = todayLog();
  const item = log.items?.[idx];
  if (!item) return;
  if (item.cal) log.calories = Math.max(0, (log.calories || 0) - item.cal);
  log.items.splice(idx, 1);
  saveLogs();
  go('nutrition');
}

function nutClear() {
  const log = todayLog();
  log.items = []; log.calories = 0; log.protein = 0; log.carbs = 0; log.fat = 0;
  saveLogs();
  go('nutrition');
}

/* ── STEPS ────────────────────────────────────────────── */
function renderSteps(el) {
  const log  = todayLog();
  const goal = S.profile?.stepGoal || 10000;
  const steps= log.steps || 0;
  const km   = FE.stepsKm(steps);
  const cal  = FE.stepsCal(steps, S.profile?.weight);
  const p    = pct(steps, goal);
  const st   = S.stepTracker;
  const mins = Math.floor(st.elapsed / 60);
  const secs = st.elapsed % 60;
  const r = 98, cx = 112, cy = 112;
  const circ = 2 * Math.PI * r;
  const off  = circ * (1 - p / 100);
  const w7   = last7();
  const maxS = Math.max(...w7.map(d => d.steps), goal, 1);

  el.innerHTML = `
  <div style="padding-bottom:30px">
    <div class="topbar">
      <h1 class="h1">👟 Passos</h1>
      <span class="badge badge-purple">${fmt(goal)} meta</span>
    </div>

    <!-- RING -->
    <div style="display:flex;justify-content:center;padding:8px 20px 6px">
      <div style="position:relative;width:224px;height:224px">
        <svg viewBox="0 0 224 224" width="224" height="224">
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#C8F557"/>
              <stop offset="100%" stop-color="#4ADE80"/>
            </linearGradient>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.04)" stroke-width="14"/>
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#sg)" stroke-width="14"
            stroke-dasharray="${circ}" stroke-dashoffset="${off}"
            stroke-linecap="round" transform="rotate(-90 112 112)"
            style="transition:stroke-dashoffset .6s cubic-bezier(.34,1.2,.64,1);filter:drop-shadow(0 0 8px rgba(200,245,87,.35))"/>
          <text x="${cx}" y="${cy-18}" text-anchor="middle" fill="var(--text)" font-size="40" font-weight="900" font-family="var(--font2)">${fmt(steps)}</text>
          <text x="${cx}" y="${cy+6}"  text-anchor="middle" fill="var(--text2)" font-size="13" font-family="var(--font2)">passos</text>
          <text x="${cx}" y="${cy+26}" text-anchor="middle" fill="var(--lime)" font-size="14" font-weight="700" font-family="var(--font2)">${p}% da meta</text>
          ${st.active ? `<circle cx="${cx}" cy="${cy+48}" r="5" fill="var(--lime)"><animate attributeName="opacity" values="1;.2;1" dur="1s" repeatCount="indefinite"/></circle>` : ''}
        </svg>
      </div>
    </div>

    <!-- STATS -->
    <div style="padding:0 20px 16px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:7px">
      ${[
        { label:'km', val:km, icon:'📍', c:'var(--cyan)' },
        { label:'kcal', val:cal, icon:'🔥', c:'var(--orange)' },
        { label:'tempo', val:`${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`, icon:'⏱️', c:'var(--text)' },
        { label:'p/min', val:st.elapsed>0?Math.round(steps/(st.elapsed/60)):0, icon:'⚡', c:'var(--lime)' },
      ].map(s => `
      <div class="card" style="padding:11px 7px;text-align:center">
        <div style="font-size:17px;margin-bottom:3px">${s.icon}</div>
        <div style="font-size:14px;font-weight:800;color:${s.c};font-family:var(--font2);line-height:1">${s.val}</div>
        <div style="font-size:9px;color:var(--text3);margin-top:2px">${s.label}</div>
      </div>`).join('')}
    </div>

    <!-- GOAL CHIPS -->
    <div style="padding:0 20px 14px">
      <div class="sec"><span class="sec-t">🎯 Meta Rápida</span></div>
      <div style="display:flex;gap:7px">
        ${[5000,8000,10000,15000].map(g => `
        <button onclick="setStepGoal(${g})" style="flex:1;padding:9px 4px;border-radius:11px;
          border:1px solid ${goal===g?'var(--lime)':'var(--border)'};
          background:${goal===g?'rgba(200,245,87,.1)':'var(--bg2)'};
          color:${goal===g?'var(--lime)':'var(--text2)'};font-weight:700;cursor:pointer;font-size:12px;font-family:var(--font2);transition:all .2s">
          ${g>=1000?g/1000+'k':g}
        </button>`).join('')}
      </div>
    </div>

    <!-- CONTROLS -->
    <div style="padding:0 20px 18px;display:flex;gap:9px">
      <button class="btn ${st.active?'btn-secondary':'btn-primary'}" style="flex:2" onclick="stepsToggle()">
        ${st.active ? '⏸ Pausar' : steps > 0 ? '▶ Continuar' : '▶ Iniciar Contagem'}
      </button>
      <button class="btn btn-ghost" style="flex:1" onclick="stepsReset()">↺ Reset</button>
    </div>

    ${p >= 100 ? `
    <div style="padding:0 20px 16px">
      <div class="card-prem" style="padding:18px;text-align:center;animation:glow 2s ease infinite">
        <div style="font-size:38px;margin-bottom:7px">🎉</div>
        <div style="font-size:18px;font-weight:900;color:var(--lime);margin-bottom:3px">META BATIDA!</div>
        <div class="sm">Incrível! Você completou sua meta de passos!</div>
      </div>
    </div>` : ''}

    <!-- WEEKLY CHART -->
    <div style="padding:0 20px 16px">
      <div class="sec"><span class="sec-t">📊 Semana em Passos</span></div>
      <div class="card" style="padding:16px">
        <div class="chart-bars" style="margin-bottom:8px">
          ${w7.map((d, i) => {
            const h = Math.round(d.steps / maxS * 70) + 4;
            const isToday = i === 6, hit = d.steps >= goal;
            return `<div class="bar-col" style="height:${h}px;background:${isToday?'linear-gradient(to top,var(--lime),var(--green))':hit?'rgba(74,222,128,.35)':'var(--bg4)'}"></div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:5px">
          ${['S','T','Q','Q','S','S','D'].map(d => `<div style="flex:1;text-align:center;font-size:10px;color:var(--text3);font-family:var(--font2)">${d}</div>`).join('')}
        </div>
      </div>
    </div>

    <!-- RECORDS -->
    <div style="padding:0 20px">
      <div class="sec"><span class="sec-t">🏆 Recordes</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        ${[
          { icon:'🏆', label:'Melhor dia', val:fmt(Math.max(...Object.values(S.logs).map(l=>l.steps||0),0)) },
          { icon:'👣', label:'Total geral', val:fmt(Object.values(S.logs).reduce((a,l)=>a+(l.steps||0),0)) },
        ].map(s => `
        <div class="card" style="padding:14px">
          <div style="font-size:24px;margin-bottom:6px">${s.icon}</div>
          <div style="font-size:20px;font-weight:900;color:var(--lime);font-family:var(--font2);line-height:1;margin-bottom:3px">${s.val}</div>
          <div class="xs">${s.label}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function stepsToggle() {
  const st = S.stepTracker;
  if (st.active) {
    clearInterval(st.interval);
    st.active = false; st.interval = null;
    go('steps');
  } else {
    st.active = true;
    st.interval = setInterval(() => {
      st.elapsed++;
      const log = todayLog();
      log.steps = (log.steps || 0) + Math.floor(Math.random() * 3) + 1;
      saveLogs();
      if (log.steps >= 10000) unlock('steps_10k');
      if (S.screen === 'steps') go('steps');
    }, 650);
    go('steps');
  }
}

function stepsReset() {
  clearInterval(S.stepTracker.interval);
  S.stepTracker = { active: false, interval: null, elapsed: 0 };
  todayLog().steps = 0;
  saveLogs();
  go('steps');
}

function setStepGoal(g) {
  if (!S.profile) S.profile = {};
  S.profile.stepGoal = g;
  DB.set('profile', S.profile);
  go('steps');
}

/* ── PROFILE ──────────────────────────────────────────── */
function renderProfile(el) {
  const p      = S.profile || {};
  const xpD    = FE.xpLevel(S.xp);
  const np     = S.nutritionPlan;
  const totWK  = Object.values(S.logs).filter(l => l.workoutDone).length;
  const totSt  = Object.values(S.logs).reduce((a, l) => a + (l.steps || 0), 0);

  el.innerHTML = `
  <div style="padding-bottom:30px">

    <!-- HEADER -->
    <div style="background:linear-gradient(180deg,rgba(200,245,87,.05) 0%,transparent 100%);
      border-bottom:1px solid var(--border);padding:calc(env(safe-area-inset-top,20px)+20px) 20px 22px">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,var(--lime),var(--cyan));
          display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#050508;
          flex-shrink:0;border:3px solid rgba(200,245,87,.25)">${(S.user?.name||'A')[0].toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-size:21px;font-weight:900;letter-spacing:-.5px">${S.user?.name||'Atleta'}</div>
          <div class="sm" style="margin-top:2px">${S.user?.email||''}</div>
          <div style="display:flex;gap:7px;margin-top:7px;flex-wrap:wrap">
            <span class="badge ${S.user?.premium?'badge-gold':'badge-lime'}">${S.user?.premium?'✦ PREMIUM':'⚡ FREE'}</span>
            <span class="badge badge-blue">Nível ${xpD.lv} — ${FE.lvName(xpD.lv)}</span>
          </div>
        </div>
      </div>
      <div style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px">
          <span class="xs">XP — ${fmt(S.xp)}</span>
          <span style="font-size:11px;color:var(--lime);font-weight:700">Nível ${xpD.lv+1} em ${xpD.pct}%</span>
        </div>
        <div class="xp-wrap" style="height:9px"><div class="xp-fill" style="width:${xpD.pct}%"></div></div>
      </div>
    </div>

    <div style="padding:18px 20px 0">

      <!-- QUICK STATS -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-bottom:18px">
        ${[
          { icon:'🏋️', val:totWK,        label:'Treinos' },
          { icon:'🔥', val:S.streak.count,label:'Streak' },
          { icon:'👟', val:fmt(totSt),    label:'Passos Total' },
        ].map(s => `
        <div class="card" style="padding:13px;text-align:center">
          <div style="font-size:22px;margin-bottom:5px">${s.icon}</div>
          <div style="font-size:19px;font-weight:900;color:var(--lime);font-family:var(--font2);line-height:1;margin-bottom:2px">${s.val}</div>
          <div class="xs">${s.label}</div>
        </div>`).join('')}
      </div>

      <!-- BODY DATA -->
      ${p.weight ? `
      <div style="margin-bottom:18px">
        <div class="sec"><span class="sec-t">📊 Dados Físicos</span></div>
        <div class="card" style="padding:15px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px">
            ${[
              { label:'Peso',      val:`${p.weight} kg`,  icon:'⚖️' },
              { label:'Altura',    val:`${p.height} cm`,  icon:'📏' },
              { label:'Idade',     val:`${p.age} anos`,   icon:'🎂' },
              { label:'IMC',       val:p.weight&&p.height?(p.weight/Math.pow(p.height/100,2)).toFixed(1):'-', icon:'🔬' },
              { label:'Objetivo',  val:p.goal==='lose'?'🔥 Emagrecer':p.goal==='gain'?'💪 Ganhar Massa':'⚖️ Manter', icon:'🎯' },
              { label:'Nível',     val:p.level==='advanced'?'🔥 Avançado':p.level==='intermediate'?'⚡ Inter.':'🌱 Iniciante', icon:'🏋️' },
            ].map(s => `
            <div style="display:flex;align-items:center;gap:9px">
              <span style="font-size:19px">${s.icon}</span>
              <div>
                <div class="xs">${s.label}</div>
                <div style="font-weight:700;font-size:14px;margin-top:2px">${s.val}</div>
              </div>
            </div>`).join('')}
          </div>
          ${np ? `
          <div class="div"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center">
            <div><div class="xs">TMB</div><div style="font-weight:800;color:var(--cyan);font-family:var(--font2)">${fmt(np.bmr)}</div></div>
            <div><div class="xs">TDEE</div><div style="font-weight:800;color:var(--orange);font-family:var(--font2)">${fmt(np.tdee)}</div></div>
            <div><div class="xs">Meta Cal</div><div style="font-weight:800;color:var(--lime);font-family:var(--font2)">${fmt(np.target)}</div></div>
          </div>` : ''}
        </div>
      </div>` : ''}

      <!-- ACHIEVEMENTS -->
      <div style="margin-bottom:18px">
        <div class="sec"><span class="sec-t">🏅 Conquistas (${S.achievements.length}/${ACH_DEF.length})</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">
          ${ACH_DEF.map(a => {
            const ok = S.achievements.includes(a.id);
            return `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer"
              onclick="showToast('${ok?'🏅':'🔒'} ${a.name}: ${a.desc}${a.xp?' +'+a.xp+'XP':''}')"
              title="${a.name}">
              <div class="medal ${ok?'medal-gold':'medal-locked'}">${a.emoji}</div>
              <div style="font-size:9px;color:${ok?'var(--lime)':'var(--text3)'};text-align:center;line-height:1.2;max-width:58px">${a.name}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- LANGUAGE -->
      <div style="margin-bottom:18px">
        <div class="sec"><span class="sec-t">🌍 Idioma</span></div>
        <div class="toggle">
          <button class="toggle-opt ${S.lang==='pt'?'tog-on':'tog-off'}" onclick="setLang('pt')">🇧🇷 Português</button>
          <button class="toggle-opt ${S.lang==='en'?'tog-on':'tog-off'}" onclick="setLang('en')">🇺🇸 English</button>
        </div>
      </div>

      <!-- PREMIUM BANNER -->
      ${!S.user?.premium ? `
      <div style="margin-bottom:18px">
        <div class="card-gold" style="padding:18px">
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:13px">
            <span style="font-size:30px">✦</span>
            <div>
              <div style="font-weight:800;font-size:16px;color:var(--gold)">ShapeAI Premium</div>
              <div class="sm">Desbloqueie todo o potencial da IA</div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px">
            ${['🤖 IA 24/7','📊 Analytics Pro','🏋️ +500 Exercícios','🥗 Planos Exclusivos','🏆 Rankings Globais','📴 Offline Total'].map(f => `
            <span style="background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.18);border-radius:99px;padding:3px 9px;font-size:11px;color:var(--yellow)">${f}</span>`).join('')}
          </div>
          <button class="btn" onclick="activatePremium()"
            style="background:linear-gradient(135deg,var(--gold),var(--orange));color:#050508;border-radius:var(--r);padding:14px;font-size:15px;width:100%;font-weight:800">
            ✦ Ativar Premium — R$29/mês
          </button>
          <p style="text-align:center;margin-top:7px;font-size:10px;color:var(--text3)">Demo: clique para simular ativação</p>
        </div>
      </div>` : `
      <div class="card-gold" style="padding:14px;margin-bottom:18px;text-align:center">
        <div style="font-size:30px;margin-bottom:5px">✦</div>
        <div style="font-weight:800;font-size:15px;color:var(--gold)">Você é PREMIUM!</div>
        <div class="sm">Todos os recursos desbloqueados</div>
      </div>`}

      <!-- ACTIONS -->
      <div style="display:flex;flex-direction:column;gap:9px">
        <button class="btn btn-secondary" onclick="regenPlan()">🤖 Regenerar Plano de IA</button>
        <button class="btn btn-danger"    onclick="doLogout()">🚪 Sair da Conta</button>
      </div>
    </div>
  </div>`;
}

function setLang(l) { S.lang = l; DB.set('lang', l); go('profile'); }

function activatePremium() {
  if (S.user) { S.user.premium = true; DB.set('user', S.user); }
  gainXP(500); unlock('premium');
  showToast('✦ Premium ativado! Bem-vindo!');
  go('profile');
}

function regenPlan() {
  if (!S.profile) return showToast('⚠️ Complete seu perfil');
  S.workoutPlan   = AI.workout(S.profile);   DB.set('workoutPlan', S.workoutPlan);
  S.nutritionPlan = AI.nutrition(S.profile); DB.set('nutritionPlan', S.nutritionPlan);
  showToast('🤖 Plano regenerado!');
  go('profile');
}

function doLogout() {
  if (!confirm('Deseja sair da conta?')) return;
  clearInterval(S.stepTracker.interval);
  S.stepTracker = { active: false, interval: null, elapsed: 0 };
  S.user = null; S.profile = null;
  DB.del('user'); DB.del('profile');
  $('root').style.display = 'none';
  go('auth');
}

/* ── PWA ──────────────────────────────────────────────── */
let _deferredPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredPrompt = e;
  setTimeout(() => { $('install-banner').style.display = 'block'; }, 4000);
});
window.addEventListener('appinstalled', () => { $('install-banner').style.display = 'none'; });

$('ib-yes').onclick = async () => {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  await _deferredPrompt.userChoice;
  _deferredPrompt = null;
  $('install-banner').style.display = 'none';
};
$('ib-no').onclick = () => { $('install-banner').style.display = 'none'; };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ── BOOT ─────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const splash = $('splash');
    splash.classList.add('out');
    setTimeout(() => splash.style.display = 'none', 500);

    if (S.user && S.profile) {
      checkStreak();
      if (!S.workoutPlan)   { S.workoutPlan   = AI.workout(S.profile);   DB.set('workoutPlan',   S.workoutPlan);   }
      if (!S.nutritionPlan) { S.nutritionPlan = AI.nutrition(S.profile); DB.set('nutritionPlan', S.nutritionPlan); }
      $('root').style.display = 'flex';
      go('dashboard');
    } else {
      go('auth');
    }
  }, 2000);
});
