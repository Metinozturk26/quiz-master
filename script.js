// ========== STATE ==========
let currentQuiz = null;
let currentQuestion = 0;
let score = 0;
let answers = [];
let timer = null;
let timeLeft = 30;
let questionStartTime = 0;
let totalTime = 0;
let soundEnabled = true;
let jokersUsed = { half: false, freeze: false, hint: false };

// ========== LEVEL SYSTEM ==========
const LEVELS = [
    { level: 1, name: "Çaylak", icon: "\u{1F331}", min: 0 },
    { level: 2, name: "Meraklı", icon: "\u{1F9D0}", min: 100 },
    { level: 3, name: "Bilgin", icon: "\u{1F4DA}", min: 300 },
    { level: 4, name: "Uzman", icon: "\u{1F393}", min: 600 },
    { level: 5, name: "Usta", icon: "\u{1F3AF}", min: 1000 },
    { level: 6, name: "Profesör", icon: "\u{1F9D1}\u200D\u{1F3EB}", min: 1800 },
    { level: 7, name: "Deha", icon: "\u{1F451}", min: 3000 }
];

const LOCKED_CATEGORIES = {
    "felsefe": 3,
    "uzay-astronomi": 3,
    "mitoloji": 4,
    "tip-vucud": 4
};

// ========== BADGES ==========
const BADGES = [
    { id: "first_quiz", name: "İlk Adım", icon: "\u{1F3C1}", desc: "İlk quizini tamamla", check: (s) => s.length >= 1 },
    { id: "perfect", name: "Mükemmeliyetçi", icon: "\u{1F48E}", desc: "Bir quizde 20/20 yap", check: (s) => s.some(x => x.correct === x.total) },
    { id: "speed", name: "Hız Şeytanı", icon: "\u26A1", desc: "Ortalama 5sn altında bitir", check: (s) => s.some(x => x.avgTime <= 5) },
    { id: "collector", name: "Koleksiyoncu", icon: "\u{1F3C5}", desc: "En az 6 farklı kategori çöz", check: (s) => new Set(s.map(x => x.quizId)).size >= 6 },
    { id: "thousand", name: "Binyüz", icon: "\u{1F4B0}", desc: "1000 puana ulaş", check: (s) => s.reduce((sum, x) => sum + x.correct * 10, 0) >= 1000 },
    { id: "streak3", name: "Üç Bilen", icon: "\u{1F525}", desc: "3 quizde üst üste %70+ yap", check: (s) => { if(s.length<3) return false; return s.slice(0,3).every(x=>x.percent>=70); } },
    { id: "allstar", name: "All Star", icon: "\u2B50", desc: "Tüm kategorilerde %50+ yap", check: (s) => { const ids=new Set(s.filter(x=>x.percent>=50).map(x=>x.quizId)); return ids.size>=QUIZZES.length; } },
    { id: "master", name: "Quiz Master", icon: "\u{1F3C6}", desc: "3000 puana ulaş ve Deha ol", check: (s) => s.reduce((sum, x) => sum + x.correct * 10, 0) >= 3000 }
];

// ========== JOKER SHOP ==========
const SHOP_ITEMS = [
    { id: "half", name: "50:50 Joker", icon: "\u2702\uFE0F", desc: "2 yanlış şıkkı eler", cost: 50 },
    { id: "freeze", name: "Süre Durdur", icon: "\u2744\uFE0F", desc: "+15 saniye ekstra süre", cost: 30 },
    { id: "hint", name: "İpucu", icon: "\u{1F4A1}", desc: "Doğru cevaba dair ipucu", cost: 40 }
];

function getJokerInventory() {
    return JSON.parse(localStorage.getItem('jokerInventory') || '{"half":0,"freeze":0,"hint":0}');
}
function saveJokerInventory(inv) {
    localStorage.setItem('jokerInventory', JSON.stringify(inv));
}
function getSpentPoints() {
    return parseInt(localStorage.getItem('spentPoints') || '0');
}
function setSpentPoints(v) {
    localStorage.setItem('spentPoints', v.toString());
}
function getAvailablePoints() {
    return getTotalPoints() - getSpentPoints();
}

function buyJoker(id) {
    const item = SHOP_ITEMS.find(x => x.id === id);
    if (!item) return;
    const avail = getAvailablePoints();
    if (avail < item.cost) {
        alert('Yeterli puanın yok! ' + item.cost + ' puan gerekli, sende ' + avail + ' puan var.');
        return;
    }
    setSpentPoints(getSpentPoints() + item.cost);
    const inv = getJokerInventory();
    inv[id] = (inv[id] || 0) + 1;
    saveJokerInventory(inv);
    playSound('correct');
    renderShop();
    renderHome();
}

// ========== JOKER USAGE IN QUIZ ==========
function useHalfJoker() {
    const inv = getJokerInventory();
    if (inv.half <= 0 || jokersUsed.half) return;
    const q = currentQuiz.questions[currentQuestion];
    const correct = q.a;
    const buttons = document.querySelectorAll('.option-btn');
    if (buttons[0].classList.contains('disabled')) return;

    let removed = 0;
    const indices = [0,1,2,3].filter(i => i !== correct).sort(() => Math.random()-0.5);
    for (const i of indices) {
        if (removed >= 2) break;
        buttons[i].style.opacity = '0.2';
        buttons[i].style.pointerEvents = 'none';
        removed++;
    }
    inv.half--;
    saveJokerInventory(inv);
    jokersUsed.half = true;
    updateJokerButtons();
    playSound('correct');
}

function useFreezeJoker() {
    const inv = getJokerInventory();
    if (inv.freeze <= 0 || jokersUsed.freeze) return;
    const buttons = document.querySelectorAll('.option-btn');
    if (buttons[0] && buttons[0].classList.contains('disabled')) return;

    timeLeft += 15;
    updateTimerDisplay();
    inv.freeze--;
    saveJokerInventory(inv);
    jokersUsed.freeze = true;
    updateJokerButtons();
    playSound('correct');
}

function useHintJoker() {
    const inv = getJokerInventory();
    if (inv.hint <= 0 || jokersUsed.hint) return;
    const q = currentQuiz.questions[currentQuestion];
    const buttons = document.querySelectorAll('.option-btn');
    if (buttons[0] && buttons[0].classList.contains('disabled')) return;

    const correctAnswer = q.o[q.a];
    const hintText = q.e ? q.e.substring(0, 60) + '...' : 'Doğru cevap "' + correctAnswer.charAt(0) + '" harfiyle başlıyor.';
    showExplanation(hintText, true);
    inv.hint--;
    saveJokerInventory(inv);
    jokersUsed.hint = true;
    updateJokerButtons();
    playSound('correct');
}

function updateJokerButtons() {
    const inv = getJokerInventory();
    const el = document.getElementById('jokerButtons');
    if (!el) return;
    el.innerHTML = `
        <button class="joker-btn ${inv.half<=0||jokersUsed.half?'joker-disabled':''}" onclick="useHalfJoker()" title="50:50 Joker">
            \u2702\uFE0F <span class="joker-count">${inv.half}</span>
        </button>
        <button class="joker-btn ${inv.freeze<=0||jokersUsed.freeze?'joker-disabled':''}" onclick="useFreezeJoker()" title="Süre Durdur (+15sn)">
            \u2744\uFE0F <span class="joker-count">${inv.freeze}</span>
        </button>
        <button class="joker-btn ${inv.hint<=0||jokersUsed.hint?'joker-disabled':''}" onclick="useHintJoker()" title="İpucu">
            \u{1F4A1} <span class="joker-count">${inv.hint}</span>
        </button>
    `;
}

// ========== LEVEL HELPERS ==========
function getCurrentLevel() {
    const pts = getTotalPoints();
    let lvl = LEVELS[0];
    for (const l of LEVELS) {
        if (pts >= l.min) lvl = l;
    }
    return lvl;
}

function getNextLevel() {
    const cur = getCurrentLevel();
    return LEVELS.find(l => l.level === cur.level + 1) || null;
}

function getLevelProgress() {
    const pts = getTotalPoints();
    const cur = getCurrentLevel();
    const next = getNextLevel();
    if (!next) return 100;
    return Math.min(100, Math.round(((pts - cur.min) / (next.min - cur.min)) * 100));
}

function isUnlocked(quizId) {
    const reqLevel = LOCKED_CATEGORIES[quizId];
    if (!reqLevel) return true;
    return getCurrentLevel().level >= reqLevel;
}

function getUnlockedBadges() {
    const scores = getScores();
    return BADGES.filter(b => b.check(scores));
}

// ========== SOUND EFFECTS ==========
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (!soundEnabled) return;
    try { audioCtx.resume(); } catch(e) {}
    if (type === 'correct') {
        [523.25, 659.25].forEach((freq, i) => {
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='sine'; o.frequency.value=freq;
            g.gain.setValueAtTime(0.3,audioCtx.currentTime+i*0.12);
            g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+i*0.12+0.4);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(audioCtx.currentTime+i*0.12); o.stop(audioCtx.currentTime+i*0.12+0.4);
        });
    } else if (type === 'wrong') {
        const o=audioCtx.createOscillator(), g=audioCtx.createGain();
        o.type='square'; o.frequency.value=180;
        g.gain.setValueAtTime(0.2,audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.35);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.35);
    } else if (type === 'tick') {
        const o=audioCtx.createOscillator(), g=audioCtx.createGain();
        o.type='sine'; o.frequency.value=880;
        g.gain.setValueAtTime(0.1,audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.08);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.08);
    } else if (type === 'timeout') {
        const o=audioCtx.createOscillator(), g=audioCtx.createGain();
        o.type='sawtooth'; o.frequency.setValueAtTime(400,audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(150,audioCtx.currentTime+0.5);
        g.gain.setValueAtTime(0.15,audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.5);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+0.5);
    } else if (type === 'success') {
        [523.25,659.25,783.99,1046.5].forEach((freq,i) => {
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='sine'; o.frequency.value=freq;
            g.gain.setValueAtTime(0.25,audioCtx.currentTime+i*0.15);
            g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+i*0.15+0.5);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(audioCtx.currentTime+i*0.15); o.stop(audioCtx.currentTime+i*0.15+0.5);
        });
    } else if (type === 'levelup') {
        [440,554.37,659.25,880].forEach((freq,i) => {
            const o=audioCtx.createOscillator(), g=audioCtx.createGain();
            o.type='triangle'; o.frequency.value=freq;
            g.gain.setValueAtTime(0.3,audioCtx.currentTime+i*0.2);
            g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+i*0.2+0.6);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(audioCtx.currentTime+i*0.2); o.stop(audioCtx.currentTime+i*0.2+0.6);
        });
    }
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('soundToggle').textContent = soundEnabled ? '\u{1F50A}' : '\u{1F507}';
}

// ========== CONFETTI ==========
function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const pieces = [];
    const colors = ['#6C5CE7','#A29BFE','#00CEC9','#FF6B6B','#FDCB6E','#00B894','#E84393','#fd79a8'];
    for (let i = 0; i < 150; i++) {
        pieces.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height-canvas.height,
            w:Math.random()*10+5, h:Math.random()*6+3, color:colors[Math.floor(Math.random()*colors.length)],
            vy:Math.random()*3+2, vx:(Math.random()-0.5)*4, rotation:Math.random()*360,
            rotSpeed:(Math.random()-0.5)*10, life:1 });
    }
    let frame = 0;
    function animate() {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        let alive = false;
        pieces.forEach(p => { if(p.life<=0)return; alive=true;
            p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.rotation+=p.rotSpeed;
            if(frame>60) p.life-=0.008;
            ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rotation*Math.PI/180);
            ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
            ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h); ctx.restore();
        });
        frame++;
        if(alive&&frame<300) requestAnimationFrame(animate);
        else { ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }
    }
    animate();
}

// ========== LOCAL STORAGE ==========
function getScores() {
    return JSON.parse(localStorage.getItem('quizScores') || '[]');
}

function saveScore(quizId, title, icon, correct, total, avgTime) {
    const scores = getScores();
    scores.unshift({ quizId, title, icon, correct, total, avgTime,
        date: new Date().toLocaleDateString('tr-TR'),
        percent: Math.round((correct / total) * 100) });
    if (scores.length > 30) scores.pop();
    localStorage.setItem('quizScores', JSON.stringify(scores));
}

function getTotalPoints() {
    return getScores().reduce((sum, s) => sum + s.correct * 10, 0);
}

function getBestScore(quizId) {
    const scores = getScores().filter(s => s.quizId === quizId);
    if (scores.length === 0) return null;
    return Math.max(...scores.map(s => s.percent));
}

// ========== RENDER HOME ==========
function renderHome() {
    const pts = getTotalPoints();
    const avail = getAvailablePoints();
    const lvl = getCurrentLevel();
    const next = getNextLevel();
    const progress = getLevelProgress();

    document.getElementById('totalScore').textContent = avail;
    document.getElementById('levelBadge').innerHTML = `${lvl.icon} <span>Lv.${lvl.level} ${lvl.name}</span>`;
    document.getElementById('levelBadge').style.display = 'flex';

    // Level progress bar in hero
    const heroLevel = document.getElementById('heroLevelInfo');
    if (heroLevel) {
        heroLevel.innerHTML = `
            <div class="hero-level-card">
                <div class="hero-level-top">
                    <span class="hero-level-icon">${lvl.icon}</span>
                    <div>
                        <div class="hero-level-name">Lv.${lvl.level} ${lvl.name}</div>
                        <div class="hero-level-pts">${pts} toplam puan | ${avail} harcayabilir</div>
                    </div>
                </div>
                ${next ? `
                <div class="hero-level-bar-wrap">
                    <div class="hero-level-bar"><div class="hero-level-fill" style="width:${progress}%"></div></div>
                    <span class="hero-level-next">${next.icon} ${next.name}'a ${next.min - pts} puan</span>
                </div>` : '<div class="hero-level-max">Maksimum seviyeye ulaştın!</div>'}
            </div>
        `;
    }

    // Categories
    const grid = document.getElementById('categoryGrid');
    grid.innerHTML = QUIZZES.map(q => {
        const locked = !isUnlocked(q.id);
        const reqLvl = LOCKED_CATEGORIES[q.id];
        const best = getBestScore(q.id);
        const bestHTML = best !== null
            ? `<span class="category-best">${best}% En İyi</span>`
            : `<span>Henüz çözülmedi</span>`;

        if (locked) {
            return `
                <div class="category-card category-locked">
                    <div class="lock-overlay">
                        <span class="lock-icon">\u{1F512}</span>
                        <span class="lock-text">Lv.${reqLvl} gerekli</span>
                    </div>
                    <span class="category-icon">${q.icon}</span>
                    <h3>${q.title}</h3>
                    <p>${q.desc}</p>
                    <div class="category-meta"><span>${q.questions.length} Soru</span></div>
                </div>`;
        }
        return `
            <div class="category-card" onclick="startQuiz('${q.id}')" style="--cat-color: ${q.color}">
                <span class="category-icon">${q.icon}</span>
                <h3>${q.title}</h3>
                <p>${q.desc}</p>
                <div class="category-meta">
                    <span>${q.questions.length} Soru</span>
                    ${bestHTML}
                </div>
            </div>`;
    }).join('');

    // Leaderboard
    const lb = document.getElementById('leaderboard');
    const scores = getScores();
    if (scores.length === 0) {
        lb.innerHTML = '<p class="empty-state">Henüz quiz çözmedin. Hadi başlayalım!</p>';
    } else {
        lb.innerHTML = scores.slice(0, 8).map(s => `
            <div class="score-item">
                <span class="score-item-icon">${s.icon}</span>
                <div class="score-item-info">
                    <h4>${s.title}</h4>
                    <span>${s.date} | Ort. ${s.avgTime}s</span>
                </div>
                <span class="score-item-result">${s.correct}/${s.total}</span>
            </div>`).join('');
    }

    // Badges
    renderBadges();
}

// ========== BADGES RENDER ==========
function renderBadges() {
    const container = document.getElementById('badgesGrid');
    if (!container) return;
    const unlocked = getUnlockedBadges().map(b => b.id);
    container.innerHTML = BADGES.map(b => {
        const has = unlocked.includes(b.id);
        return `<div class="badge-item ${has ? 'badge-unlocked' : 'badge-locked'}" title="${b.desc}">
            <span class="badge-icon">${has ? b.icon : '\u{1F512}'}</span>
            <span class="badge-name">${b.name}</span>
        </div>`;
    }).join('');
}

// ========== SHOP RENDER ==========
function renderShop() {
    const container = document.getElementById('shopGrid');
    if (!container) return;
    const avail = getAvailablePoints();
    const inv = getJokerInventory();
    container.innerHTML = SHOP_ITEMS.map(item => `
        <div class="shop-item">
            <span class="shop-icon">${item.icon}</span>
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
            <div class="shop-bottom">
                <span class="shop-owned">Elinde: ${inv[item.id] || 0}</span>
                <button class="btn-shop ${avail < item.cost ? 'btn-shop-disabled' : ''}" onclick="buyJoker('${item.id}')">
                    ${item.cost} Puan
                </button>
            </div>
        </div>
    `).join('');
    const ptsEl = document.getElementById('shopPoints');
    if (ptsEl) ptsEl.textContent = avail;
}

function showShop() {
    renderShop();
    document.getElementById('shopModal').style.display = 'flex';
}
function closeShop() {
    document.getElementById('shopModal').style.display = 'none';
}

// ========== NAVIGATION ==========
function showPage(page) {
    document.getElementById('homePage').style.display = page === 'home' ? 'block' : 'none';
    document.getElementById('quizPage').style.display = page === 'quiz' ? 'block' : 'none';
    document.getElementById('resultPage').style.display = page === 'result' ? 'block' : 'none';
    document.getElementById('footer').style.display = page === 'home' ? 'block' : 'none';
    window.scrollTo(0, 0);
}

function goHome() {
    if (timer) clearInterval(timer);
    renderHome();
    showPage('home');
}

// ========== START QUIZ ==========
function trackEvent(action, category, label, value) {
    if (typeof gtag === 'function') {
        gtag('event', action, { event_category: category, event_label: label, value: value });
    }
}

function startQuiz(quizId) {
    if (!isUnlocked(quizId)) return;
    currentQuiz = QUIZZES.find(q => q.id === quizId);
    if (!currentQuiz) return;
    trackEvent('quiz_start', 'quiz', currentQuiz.title);

    currentQuestion = 0;
    score = 0;
    answers = [];
    totalTime = 0;
    jokersUsed = { half: false, freeze: false, hint: false };

    document.getElementById('quizCategoryLabel').textContent = currentQuiz.title;
    document.getElementById('totalQ').textContent = currentQuiz.questions.length;

    showPage('quiz');
    updateJokerButtons();
    renderQuestion();
}

function retryQuiz() {
    if (currentQuiz) startQuiz(currentQuiz.id);
}

// ========== RENDER QUESTION ==========
function renderQuestion() {
    const q = currentQuiz.questions[currentQuestion];
    const total = currentQuiz.questions.length;

    document.getElementById('currentQ').textContent = currentQuestion + 1;
    document.getElementById('questionNumber').textContent = currentQuestion + 1;
    document.getElementById('progressFill').style.width = ((currentQuestion) / total * 100) + '%';
    document.getElementById('questionText').textContent = q.q;

    const oldExp = document.getElementById('explanationBox');
    if (oldExp) oldExp.remove();

    const adEl = document.getElementById('quizAd');
    adEl.style.display = (currentQuestion > 0 && currentQuestion % 5 === 0) ? 'block' : 'none';

    const letters = ['A', 'B', 'C', 'D'];
    const container = document.getElementById('optionsContainer');
    container.innerHTML = q.o.map((opt, i) => `
        <button class="option-btn" onclick="selectAnswer(${i})">
            <span class="option-letter">${letters[i]}</span>
            <span>${opt}</span>
        </button>
    `).join('');

    const card = document.getElementById('questionCard');
    card.style.animation = 'none';
    card.offsetHeight;
    card.style.animation = 'slideIn 0.4s ease';

    // Reset per-question joker usage
    jokersUsed.half = false;
    jokersUsed.freeze = false;
    jokersUsed.hint = false;
    updateJokerButtons();

    startTimer();
    questionStartTime = Date.now();
}

// ========== TIMER ==========
function startTimer() {
    if (timer) clearInterval(timer);
    timeLeft = 30;
    updateTimerDisplay();
    timer = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 10) {
            document.getElementById('quizTimer').classList.add('warning');
            playSound('tick');
        }
        if (timeLeft <= 0) {
            clearInterval(timer);
            playSound('timeout');
            selectAnswer(-1);
        }
    }, 1000);
}

function updateTimerDisplay() {
    document.getElementById('timerText').textContent = timeLeft;
}

// ========== SELECT ANSWER ==========
function selectAnswer(index) {
    if (timer) clearInterval(timer);
    document.getElementById('quizTimer').classList.remove('warning');

    const q = currentQuiz.questions[currentQuestion];
    const correct = q.a;
    const elapsed = Math.round((Date.now() - questionStartTime) / 1000);
    totalTime += elapsed;

    const buttons = document.querySelectorAll('.option-btn');
    buttons.forEach(btn => btn.classList.add('disabled'));
    buttons[correct].classList.add('correct');

    const isCorrect = index === correct;
    if (!isCorrect && index >= 0) buttons[index].classList.add('wrong');
    if (isCorrect) { score++; playSound('correct'); }
    else playSound('wrong');

    answers.push({ question: currentQuestion, selected: index, correct, time: elapsed });

    if (q.e) showExplanation(q.e, isCorrect);

    const delay = q.e ? 3000 : 1200;
    setTimeout(() => {
        currentQuestion++;
        if (currentQuestion < currentQuiz.questions.length) renderQuestion();
        else showResult();
    }, delay);
}

// ========== EXPLANATION ==========
function showExplanation(text, isCorrect) {
    const card = document.getElementById('questionCard');
    const existing = document.getElementById('explanationBox');
    if (existing) existing.remove();
    const box = document.createElement('div');
    box.id = 'explanationBox';
    box.className = `explanation-box ${isCorrect ? 'explanation-correct' : 'explanation-wrong'}`;
    box.innerHTML = `<span class="explanation-icon">${isCorrect ? '\u{1F4A1}' : '\u{1F4D6}'}</span><p>${text}</p>`;
    card.appendChild(box);
}

// ========== SHOW RESULT ==========
function showResult() {
    const total = currentQuiz.questions.length;
    const percent = Math.round((score / total) * 100);
    const avgTime = Math.round(totalTime / total);

    const prevLevel = getCurrentLevel().level;
    saveScore(currentQuiz.id, currentQuiz.title, currentQuiz.icon, score, total, avgTime);
    const newLevel = getCurrentLevel().level;
    trackEvent('quiz_complete', 'quiz', currentQuiz.title, score);
    if (newLevel > prevLevel) trackEvent('level_up', 'progression', 'Lv.' + newLevel);

    let emoji, title, subtitle;
    if (percent >= 90) { emoji="\u{1F3C6}"; title="Muhteşem!"; subtitle="Sen bir dehasın! Neredeyse hepsini bildin."; }
    else if (percent >= 70) { emoji="\u{1F389}"; title="Harika!"; subtitle="Çok iyi biliyorsun, biraz daha çalışmayla mükemmel olur!"; }
    else if (percent >= 50) { emoji="\u{1F44D}"; title="Fena Değil!"; subtitle="Ortalama üstüsün, gelişmeye devam!"; }
    else if (percent >= 30) { emoji="\u{1F914}"; title="Daha İyisini Yapabilirsin"; subtitle="Biraz daha çalışma gerekiyor gibi görünüyor."; }
    else { emoji="\u{1F4DA}"; title="Çalışma Zamanı!"; subtitle="Bu kategoriyi biraz daha araştırmalısın!"; }

    document.getElementById('resultEmoji').textContent = emoji;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSubtitle').textContent = subtitle;
    document.getElementById('resultScoreNum').textContent = score;
    document.getElementById('correctCount').textContent = score;
    document.getElementById('wrongCount').textContent = total - score;
    document.getElementById('avgTime').textContent = avgTime + 's';

    // Points earned
    const earned = score * 10;
    document.getElementById('earnedPoints').textContent = '+' + earned + ' puan kazandın!';

    // Level up check
    const lvlUpEl = document.getElementById('levelUpNotice');
    if (newLevel > prevLevel) {
        const nl = getCurrentLevel();
        lvlUpEl.innerHTML = `<span class="levelup-icon">${nl.icon}</span> Seviye atladın! <strong>Lv.${nl.level} ${nl.name}</strong>`;
        lvlUpEl.style.display = 'block';
        playSound('levelup');
    } else {
        lvlUpEl.style.display = 'none';
    }

    const ring = document.getElementById('scoreRing');
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / total) * circumference;
    ring.style.strokeDashoffset = circumference;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

    if (percent >= 70) ring.style.stroke = '#00B894';
    else if (percent >= 50) ring.style.stroke = '#FDCB6E';
    else ring.style.stroke = '#FF6B6B';

    document.getElementById('totalScore').textContent = getAvailablePoints();
    showPage('result');

    if (percent >= 70) { playSound('success'); setTimeout(launchConfetti, 300); }
}

// ========== SHARE ==========
function shareResult() {
    const total = currentQuiz.questions.length;
    const percent = Math.round((score / total) * 100);
    const lvl = getCurrentLevel();
    const text = `QuizMaster'da ${currentQuiz.title} quizinde ${score}/${total} (%${percent}) yaptım! Seviyem: ${lvl.icon} ${lvl.name} | Sen de dene: ${window.location.href}`;
    if (navigator.share) {
        navigator.share({ title: 'QuizMaster Sonucum', text });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.btn-share');
            const orig = btn.innerHTML;
            btn.innerHTML = 'Kopyalandı! \u2713';
            setTimeout(() => btn.innerHTML = orig, 2000);
        });
    }
}

// ========== KEYBOARD ==========
document.addEventListener('keydown', (e) => {
    if (document.getElementById('quizPage').style.display !== 'block') return;
    const key = e.key.toUpperCase();
    const map = { 'A':0,'B':1,'C':2,'D':3,'1':0,'2':1,'3':2,'4':3 };
    if (key in map) {
        const btns = document.querySelectorAll('.option-btn');
        if (btns.length > 0 && !btns[0].classList.contains('disabled')) selectAnswer(map[key]);
    }
});

// ========== INIT ==========
renderHome();
showPage('home');
