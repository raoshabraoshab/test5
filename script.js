// public/script.js
let quizzes = [];
let currentQuiz = null;
let currentIndex = 0;
let attemptId = null;
let timeLeft = 0; // seconds
let timerInterval = null;

const el = (id) => document.getElementById(id);
const joinSec = el('join'), quizSec = el('quiz'), resultSec = el('result');

async function fetchJSON(url, options={}){
  const res = await fetch(url, options);
  if(!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadQuizzes(){
  try{
    quizzes = await fetchJSON('/api/quizzes');
    const dd = el('quizList');
    dd.innerHTML = '';
    quizzes.forEach(q => {
      const opt = document.createElement('option');
      opt.value = q.id;
      opt.textContent = `${q.subject} • ${q.title} (${q.duration_minutes}m)`;
      dd.appendChild(opt);
    });
    if(quizzes.length === 0){
      el('status').textContent = 'No quizzes yet. Ask admin to add one.';
    }
  }catch(e){
    el('status').textContent = 'Failed to load quizzes.';
  }
}

function show(section){
  [joinSec, quizSec, resultSec].forEach(s => s.classList.add('hidden'));
  section.classList.remove('hidden');
}

function startTimer(minutes){
  timeLeft = minutes * 60;
  updateTimer();
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    timeLeft--;
    updateTimer();
    if(timeLeft <= 0){
      clearInterval(timerInterval);
      submitAttempt();
    }
  }, 1000);
}

function updateTimer(){
  const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
  const s = (timeLeft%60).toString().padStart(2,'0');
  el('timer').textContent = `⏱️ ${m}:${s}`;
}

function renderQuestion(){
  const q = currentQuiz.questions[currentIndex];
  el('questionContainer').innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('div');
  h.innerHTML = `<b>Q${currentIndex+1}.</b> ${q.statement}`;
  card.appendChild(h);

  (q.options || []).forEach(opt => {
    const row = document.createElement('label');
    row.className = 'option';
    row.innerHTML = `<input type="radio" name="opt" value="${opt.id}"/> <div>${opt.label}</div>`;
    row.onclick = () => {
      document.querySelectorAll('label.option').forEach(x => x.classList.remove('selected'));
      row.classList.add('selected');
      saveAnswer(opt.id);
    };
    card.appendChild(row);
  });

  el('questionContainer').appendChild(card);
  el('quizTitle').textContent = `${currentQuiz.subject} • ${currentQuiz.title} — Q${currentIndex+1}/${currentQuiz.questions.length}`;
}

async function saveAnswer(option_id){
  const q = currentQuiz.questions[currentIndex];
  try{
    await fetchJSON(`/api/attempts/${attemptId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: q.id, option_id })
    });
  }catch(e){
    console.error(e);
  }
}

async function submitAttempt(){
  try{
    const res = await fetchJSON(`/api/attempts/${attemptId}/submit`, { method: 'POST' });
    show(resultSec);
    el('resultSummary').innerHTML = `
      <div class="card">
        <div><b>Total:</b> ${res.total}</div>
        <div><b>Correct:</b> ${res.correct}</div>
        <div><b>Wrong:</b> ${res.wrong}</div>
        <div><b>Score:</b> ${res.score}</div>
      </div>`;
  }catch(e){
    alert('Submit failed');
  }
}

el('startBtn').onclick = async () => {
  const name = el('name').value.trim();
  const quizId = el('quizList').value;
  if(!name){ el('status').textContent = 'Enter your name'; return; }
  try{
    currentQuiz = await fetchJSON(`/api/quizzes/${quizId}`);
    const attempt = await fetchJSON('/api/attempts', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ quiz_id: quizId, name })
    });
    attemptId = attempt.attempt_id;
    currentIndex = 0;
    show(quizSec);
    startTimer(currentQuiz.duration_minutes);
    renderQuestion();
  }catch(e){
    el('status').textContent = 'Could not start quiz';
  }
};

el('prevBtn').onclick = () => {
  if(currentIndex>0){ currentIndex--; renderQuestion(); }
};
el('nextBtn').onclick = () => {
  if(currentIndex < currentQuiz.questions.length-1){ currentIndex++; renderQuestion(); }
};
el('submitBtn').onclick = submitAttempt;
el('restartBtn').onclick = () => { show(joinSec); loadQuizzes(); };

// Init
loadQuizzes();
