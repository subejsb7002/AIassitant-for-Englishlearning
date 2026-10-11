const sentenceInput = document.getElementById('sentenceInput');
const highlightedText = document.getElementById('highlightedText');
const checkBtn = document.getElementById('checkBtn');
const optimizeBtn = document.getElementById('optimizeBtn');
const editBtn = document.getElementById('editBtn');
const resultPanel = document.getElementById('resultPanel');
const statsEl = document.getElementById('stats');
const generateTopicBtn = document.getElementById('generateTopicBtn');
const toeflScoreBtn = document.getElementById('toeflScoreBtn');
const toeflTopicCard = document.getElementById('toeflTopicCard');
const legendEl = document.getElementById('legend');
const wordCountEl = document.getElementById('wordCount');
const buttonRow = document.getElementById('buttonRow');

// 托福 Tab 元素
const toeflTabBar = document.getElementById('toeflTabBar');
const toeflTabTopic = document.getElementById('toeflTabTopic');
const toeflTabScore = document.getElementById('toeflTabScore');
const toeflTopicView = document.getElementById('toeflTopicView');
const toeflTopicEmpty = document.getElementById('toeflTopicEmpty');

// 历史 & 设置元素
const historyBtn = document.getElementById('historyBtn');
const settingsBtn = document.getElementById('settingsBtn');
const historyDrawer = document.getElementById('historyDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerList = document.getElementById('drawerList');
const drawerCloseBtn = document.getElementById('drawerCloseBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const historyPathInput = document.getElementById('historyPathInput');
const settingsDefaultBtn = document.getElementById('settingsDefaultBtn');
const settingsCancelBtn = document.getElementById('settingsCancelBtn');
const settingsSaveBtn = document.getElementById('settingsSaveBtn');
const settingsMsg = document.getElementById('settingsMsg');
const toastBar = document.getElementById('toastBar');

let currentErrors = [];
let currentText = '';
let currentMode = 'free'; // 'free' | 'toefl' | 'gaokao'
let currentTopic = null;
let currentScore = null;
let toeflActiveTab = 'topic'; // 'topic' | 'score'
let historyItems = [];
let lastSavedId = null;

// 实时字数统计
sentenceInput.addEventListener('input', updateWordCount);
function updateWordCount() {
  const text = sentenceInput.value.trim();
  const count = text ? text.split(/\s+/).length : 0;
  if (currentMode === 'toefl') {
    wordCountEl.textContent = `Words: ${count} / Recommended 100+`;
    wordCountEl.className = count < 100 ? 'word-count toefl-warn' : 'word-count toefl-ok';
  } else if (currentMode === 'gaokao') {
    wordCountEl.textContent = `Words: ${count} / Recommended 80–120`;
    wordCountEl.className = count < 80 ? 'word-count toefl-warn' : 'word-count toefl-ok';
  } else {
    wordCountEl.textContent = `Words: ${count}`;
    wordCountEl.className = 'word-count';
  }
}

// 托福右栏 Tab 切换
toeflTabTopic.addEventListener('click', () => switchRightTab('topic'));
toeflTabScore.addEventListener('click', () => switchRightTab('score'));

function switchRightTab(tab) {
  toeflActiveTab = tab;
  if (tab === 'topic') {
    toeflTabTopic.classList.add('active');
    toeflTabScore.classList.remove('active');
    toeflTopicView.style.display = 'block';
    resultPanel.style.display = 'none';

    if (currentTopic) {
      toeflTopicCard.style.display = 'block';
      toeflTopicEmpty.style.display = 'none';
    } else {
      toeflTopicCard.style.display = 'none';
      toeflTopicEmpty.innerHTML = '<p>Click "🎲 New Topic" below to start</p>';
      toeflTopicEmpty.style.display = 'block';
    }
  } else {
    toeflTabScore.classList.add('active');
    toeflTabTopic.classList.remove('active');
    toeflTopicView.style.display = 'none';
    resultPanel.style.display = 'block';

    if (!currentScore) {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p>No score yet. Click "📝 Score Essay" after finishing your response</p>
        </div>`;
    } else {
      if (currentScore.rewritten) {
        renderRewriteResult(
          { rewritten: currentScore.rewritten, keyChanges: currentScore.keyChanges || [] },
          currentScore.total
        );
      } else {
        renderScoreResult(currentScore, currentText || sentenceInput.value);
      }
    }
  }
}

const TYPE_NAMES = {
  grammar: 'Grammar Error',
  spelling: 'Spelling Error',
  usage: 'Word Usage',
};

const DIMENSION_NAMES = {
  content: 'Content Contribution',
  organization: 'Organization',
  language: 'Language Use',
  taskResponse: 'Task Response',
  coherence: 'Coherence & Cohesion',
  lexical: 'Lexical Resource',
  grammar: 'Grammatical Range & Accuracy',
};

const GAOKAO_DIMENSION_NAMES = {
  content: 'Task & Content',
  language: 'Grammar & Vocabulary',
  organization: 'Structure & Cohesion',
};

const TYPE_LABELS = {
  'check': 'Grammar',
  'optimize': 'Polish',
  'toefl-score': 'Score',
  'gaokao-score': 'Score',
};

// ==================== 页面加载 ====================
fetchHistory();

// ==================== 模式切换 ====================
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    if (mode === currentMode) return;
    switchMode(mode);
  });
});

function switchMode(mode) {
  currentMode = mode;
  currentErrors = [];
  currentText = '';
  currentTopic = null;
  currentScore = null;
  toeflActiveTab = 'topic';

  // 更新 tab 样式
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.mode-tab[data-mode="${mode}"]`).classList.add('active');

  // 重置输入区
  sentenceInput.value = '';
  sentenceInput.style.display = 'block';
  highlightedText.style.display = 'none';
  highlightedText.innerHTML = '';
  statsEl.innerHTML = '';
  updateWordCount();

  if (mode === 'free') {
    buttonRow.classList.remove('toefl-layout');
    checkBtn.style.display = 'block';
    optimizeBtn.style.display = 'block';
    editBtn.style.display = 'none';
    generateTopicBtn.style.display = 'none';
    toeflScoreBtn.style.display = 'none';
    toeflTopicCard.style.display = 'none';
    toeflTopicCard.innerHTML = '';
    legendEl.style.display = 'flex';
    sentenceInput.placeholder = 'Enter your English text here (long text supported)\n\nExample: She don\'t likes coffee. He go to school everyday...';

    // 右栏恢复自由模式
    toeflTabBar.style.display = 'none';
    toeflTopicView.style.display = 'none';
    resultPanel.style.display = 'block';
    resultPanel.innerHTML = `
      <div class="empty-state">
        <p>Click a button on the left to see results here</p>
        <p class="hint">Click highlighted words to view details after checking, or view the polished version after optimizing</p>
      </div>`;
  } else {
    buttonRow.classList.add('toefl-layout');
    checkBtn.style.display = 'block';
    optimizeBtn.style.display = 'none';
    editBtn.style.display = 'none';
    generateTopicBtn.style.display = 'block';
    toeflScoreBtn.style.display = 'block';
    toeflTopicCard.style.display = 'none';
    toeflTopicCard.innerHTML = '';
    legendEl.style.display = 'none';
    if (mode === 'gaokao') {
      sentenceInput.placeholder = 'Click "🎲 New Topic" first, then write your response here (80–120 words recommended)...';
    } else {
      sentenceInput.placeholder = 'Click "🎲 New Topic" first, then write your response here (100+ words recommended)...';
    }

    // 右栏切换到托福/高考模式
    toeflTabBar.style.display = 'flex';
    switchRightTab('topic');
  }
}

// ==================== 检查语法 ====================
checkBtn.addEventListener('click', async () => {
  const text = sentenceInput.value;
  if (!text.trim()) return;

  currentText = text;
  checkBtn.disabled = true;
  optimizeBtn.disabled = true;
  if (toeflScoreBtn) toeflScoreBtn.disabled = true;
  checkBtn.textContent = 'Analyzing...';
  resultPanel.innerHTML = '<div class="empty-state"><p>🧠 AI is analyzing your text...</p></div>';

  try {
    const res = await fetch('/api/check-grammar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentErrors = data.errors || [];
    renderHighlighted();
    renderStats();
    switchToViewMode();

    if (currentMode === 'toefl' || currentMode === 'gaokao') {
      legendEl.style.display = 'flex';
      toeflTopicView.style.display = 'none';
      resultPanel.style.display = 'block';
    }

    if (currentErrors.length === 0) {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p style="color:#27ae60;font-size:36px;">✅</p>
          <p style="color:#27ae60;font-size:16px;">No errors found. Great job!</p>
        </div>`;
    } else {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p>Found <strong style="color:#4a90d9;">${currentErrors.length}</strong> ${currentErrors.length === 1 ? 'issue' : 'issues'}</p>
          <p class="hint">Click any highlighted segment on the left to view detailed analysis</p>
        </div>`;
    }

    // 自动存档
    saveToHistory('check', text, { errors: currentErrors });
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">Request failed: ${escapeHtml(err.message)}</p></div>`;
  } finally {
    checkBtn.disabled = false;
    optimizeBtn.disabled = false;
    if (toeflScoreBtn) toeflScoreBtn.disabled = false;
    checkBtn.textContent = '🔍 Check Grammar';
  }
});

// ==================== 优化表达 ====================
optimizeBtn.addEventListener('click', async () => {
  const text = sentenceInput.value;
  if (!text.trim()) return;

  currentText = text;
  optimizeBtn.disabled = true;
  checkBtn.disabled = true;
  optimizeBtn.textContent = 'Polishing...';
  resultPanel.innerHTML = '<div class="empty-state"><p>✨ AI is polishing your writing...</p></div>';

  try {
    const res = await fetch('/api/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    switchToViewMode();
    highlightedText.innerHTML = escapeHtml(currentText);
    statsEl.innerHTML = '';
    renderOptimizeResult(data);

    // 自动存档
    saveToHistory('optimize', text, data);
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">Optimization failed: ${escapeHtml(err.message)}</p></div>`;
  } finally {
    optimizeBtn.disabled = false;
    checkBtn.disabled = false;
    optimizeBtn.textContent = '✨ Polish Writing';
  }
});

// ==================== 重新编辑 ====================
editBtn.addEventListener('click', () => {
  highlightedText.style.display = 'none';
  sentenceInput.style.display = 'block';
  editBtn.style.display = 'none';
  statsEl.innerHTML = '';

  if (currentMode === 'free') {
    checkBtn.style.display = 'block';
    optimizeBtn.style.display = 'block';
    resultPanel.innerHTML = `
      <div class="empty-state">
        <p>Click a button on the left to see results here</p>
        <p class="hint">Click highlighted words to view details after checking, or view the polished version after optimizing</p>
      </div>`;
  } else {
    legendEl.style.display = 'none';
    checkBtn.style.display = 'block';
    toeflScoreBtn.style.display = 'block';
    generateTopicBtn.style.display = 'block';
    switchRightTab(toeflActiveTab);
  }
});

function switchToViewMode() {
  sentenceInput.style.display = 'none';
  highlightedText.style.display = 'block';
  checkBtn.style.display = 'none';
  optimizeBtn.style.display = 'none';
  generateTopicBtn.style.display = 'none';
  toeflScoreBtn.style.display = 'none';
  editBtn.style.display = 'block';
}

// ==================== 渲染高亮 ====================
function renderHighlighted() {
  const errors = [...currentErrors].sort((a, b) => a.start - b.start);
  let html = '';
  let cursor = 0;
  for (let i = 0; i < errors.length; i++) {
    const err = errors[i];
    if (err.start < cursor) continue;
    html += escapeHtml(currentText.slice(cursor, err.start));
    html += `<span class="hl hl-${err.type}" data-idx="${i}">${escapeHtml(currentText.slice(err.start, err.end))}</span>`;
    cursor = err.end;
  }
  html += escapeHtml(currentText.slice(cursor));
  highlightedText.innerHTML = html;
}

// ==================== 点击高亮看详情 ====================
highlightedText.addEventListener('click', (e) => {
  const span = e.target.closest('.hl');
  if (!span) return;
  highlightedText.querySelectorAll('.hl.active').forEach(el => el.classList.remove('active'));
  span.classList.add('active');
  const idx = parseInt(span.dataset.idx, 10);
  const err = currentErrors[idx];
  if (!err) return;
  showDetail(err);
});

function showDetail(err) {
  const typeName = TYPE_NAMES[err.type] || err.type;
  resultPanel.innerHTML = `
    <div class="detail-card type-${err.type}">
      <div class="detail-type">${typeName}</div>
      <div class="detail-section">
        <div class="detail-label">Original</div>
        <div class="detail-original">${escapeHtml(err.original_text)}</div>
      </div>
      ${err.suggestion ? `
      <div class="detail-section">
        <div class="detail-label">Suggestion</div>
        <div class="detail-suggestion">${escapeHtml(err.suggestion)}</div>
      </div>` : ''}
      ${err.explanation ? `
      <div class="detail-section">
        <div class="detail-label">Explanation</div>
        <div class="detail-explanation">${escapeHtml(err.explanation)}</div>
      </div>` : ''}
    </div>`;
}

// ==================== 统计条 ====================
function renderStats() {
  const counts = { grammar: 0, spelling: 0, usage: 0 };
  currentErrors.forEach(e => { if (counts[e.type] !== undefined) counts[e.type]++; });
  const parts = [];
  if (counts.grammar)  parts.push(`<span><span class="dot grammar"></span>${counts.grammar} Grammar</span>`);
  if (counts.spelling) parts.push(`<span><span class="dot spelling"></span>${counts.spelling} Spelling</span>`);
  if (counts.usage)    parts.push(`<span><span class="dot usage"></span>${counts.usage} Usage</span>`);
  statsEl.innerHTML = parts.join('');
}

// ==================== 渲染优化结果 ====================
function renderOptimizeResult(data) {
  const { optimized, changes, truncated } = data;
  let html = '';

  if (truncated) {
    html += `<div class="warn-banner">⚠️ Text is too long; only the first 6,000 characters were polished.</div>`;
  }

  html += `
    <div class="optimized-card">
      <div class="optimized-header">
        <div class="optimized-title">✨ Polished Version</div>
        <button class="copy-btn" id="copyOptimizedBtn">📋 Copy</button>
      </div>
      <div class="optimized-text">${escapeHtml(optimized)}</div>
    </div>`;

  if (changes && changes.length > 0) {
    html += `<div class="changes-title">${changes.length} ${changes.length === 1 ? 'Improvement' : 'Improvements'} Made</div>`;
    changes.forEach((c) => {
      html += `
        <div class="change-card">
          <div class="change-row">
            <span class="change-tag from">Original</span>
            <span>${escapeHtml(c.original)}</span>
          </div>
          <div class="change-row">
            <span class="change-tag to">Polished</span>
            <span>${escapeHtml(c.optimized)}</span>
          </div>
          ${c.reason ? `<div class="change-reason">${escapeHtml(c.reason)}</div>` : ''}
        </div>`;
    });
  } else {
    html += `<div class="changes-title" style="text-align:center;color:#999;">Your writing is already natural and idiomatic — no changes needed.</div>`;
  }

  resultPanel.innerHTML = html;

  const copyBtn = document.getElementById('copyOptimizedBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(optimized).then(() => {
        copyBtn.textContent = '✅ Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        copyBtn.textContent = 'Copy failed';
      });
    });
  }
}

// ==================== HTML 转义 ====================
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================== 托福 / 高考：生成新题目 ====================
generateTopicBtn.addEventListener('click', async () => {
  generateTopicBtn.disabled = true;
  toeflScoreBtn.disabled = true;
  checkBtn.disabled = true;
  generateTopicBtn.textContent = 'Generating...';

  // 自动切到右栏的“题目”Tab
  switchRightTab('topic');
  toeflTopicCard.style.display = 'none';
  toeflTopicEmpty.innerHTML = '<p>🎲 AI is generating a new topic...</p>';
  toeflTopicEmpty.style.display = 'block';

  try {
    const endpoint = currentMode === 'gaokao' ? '/api/gaokao/generate-topic' : '/api/toefl/generate-topic';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentTopic = data.topic;
    currentScore = null;
    renderTopicCard(data.topic);
    switchRightTab('topic');

    sentenceInput.value = '';
    updateWordCount();
  } catch (err) {
    toeflTopicEmpty.innerHTML = `<p style="color:#e74c3c;">Failed to generate topic: ${escapeHtml(err.message)}</p>`;
  } finally {
    generateTopicBtn.disabled = false;
    toeflScoreBtn.disabled = false;
    checkBtn.disabled = false;
    generateTopicBtn.textContent = '🎲 New Topic';
  }
});

function renderTopicCard(topic) {
  toeflTopicEmpty.style.display = 'none';
  toeflTopicCard.style.display = 'block';

  const isGaokao = currentMode === 'gaokao' || topic.type === 'gaokao' || Boolean(topic.situation);
  if (isGaokao) {
    let pointsHtml = '';
    if (topic.points && Array.isArray(topic.points) && topic.points.length > 0) {
      pointsHtml = `
        <div class="toefl-topic-section">
          <div class="toefl-topic-label">📋 Key Points</div>
          <div class="toefl-topic-text" style="padding: 8px 14px;">
            <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
              ${topic.points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
          </div>
        </div>`;
    } else if (topic.points) {
      pointsHtml = `
        <div class="toefl-topic-section">
          <div class="toefl-topic-label">📋 Key Points</div>
          <div class="toefl-topic-text">${escapeHtml(topic.points)}</div>
        </div>`;
    }

    toeflTopicCard.innerHTML = `
      <div class="toefl-topic-title">📝 ${escapeHtml(topic.title || 'Gaokao English Writing')}</div>
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">📌 Scenario & Task</div>
        <div class="toefl-topic-text">${escapeHtml(topic.situation || '')}</div>
      </div>
      ${pointsHtml}
      ${topic.instruction ? `
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">✍️ Instructions</div>
        <div class="toefl-topic-instruction">${escapeHtml(topic.instruction)}</div>
      </div>` : ''}`;
  } else {
    toeflTopicCard.innerHTML = `
      <div class="toefl-topic-title">📚 Academic Discussion Topic</div>
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">👨‍🏫 Professor's Post</div>
        <div class="toefl-topic-text">${escapeHtml(topic.professorPost || '')}</div>
      </div>
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">🙋 Student A</div>
        <div class="toefl-topic-text">${escapeHtml(topic.student1 || '')}</div>
      </div>
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">🙋‍♂️ Student B</div>
        <div class="toefl-topic-text">${escapeHtml(topic.student2 || '')}</div>
      </div>
      <div class="toefl-topic-section">
        <div class="toefl-topic-label">✍️ Your Task</div>
        <div class="toefl-topic-instruction">${escapeHtml(topic.instruction || '')}</div>
      </div>`;
  }
}

// ==================== 托福 / 高考：评分 ====================
toeflScoreBtn.addEventListener('click', async () => {
  if (!currentTopic) {
    alert('Please click "🎲 New Topic" first to generate a topic.');
    return;
  }
  const essay = sentenceInput.value;
  if (!essay.trim()) {
    alert('Please write your essay first.');
    return;
  }

  toeflScoreBtn.disabled = true;
  checkBtn.disabled = true;
  generateTopicBtn.disabled = true;
  toeflScoreBtn.textContent = 'Scoring...';

  // 自动切到右栏的“评分”Tab
  switchRightTab('score');
  resultPanel.innerHTML = '<div class="empty-state"><p>📝 AI is scoring your essay...</p></div>';

  try {
    const endpoint = currentMode === 'gaokao' ? '/api/gaokao/score' : '/api/toefl/score';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: currentTopic, essay, mode: currentMode }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    currentScore = data;
    currentText = essay;
    renderScoreResult(data, essay);
    switchRightTab('score');

    // 自动存档
    const historyType = currentMode === 'gaokao' ? 'gaokao-score' : 'toefl-score';
    saveToHistory(historyType, essay, data, currentTopic);
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">Scoring failed: ${escapeHtml(err.message)}</p></div>`;
  } finally {
    toeflScoreBtn.disabled = false;
    checkBtn.disabled = false;
    generateTopicBtn.disabled = false;
    toeflScoreBtn.textContent = '📝 Score Essay';
  }
});

function renderScoreResult(data, essay) {
  const { total, dimensions, comment, suggestions, tier } = data;
  const isGaokao = currentMode === 'gaokao' || (currentTopic && currentTopic.type === 'gaokao');

  const dimOrder = ['content', 'language', 'organization'];
  const maxPerDim = isGaokao ? 25 : 6;

  const roundVal = (n) => {
    const num = Number(n);
    if (isNaN(num)) return 0;
    if (isGaokao) return Math.min(25, Math.max(0, Math.round(num)));
    return Math.min(6, Math.max(0, Math.round(num * 2) / 2));
  };

  let dimHtml = '';
  dimOrder.forEach(key => {
    const raw = dimensions ? dimensions[key] : 0;
    const val = roundVal(raw);
    const pct = (val / maxPerDim * 100).toFixed(1);
    const label = isGaokao ? (GAOKAO_DIMENSION_NAMES[key] || key) : (DIMENSION_NAMES[key] || key);
    const valueDisplay = isGaokao ? `${val} <span style="font-size:11px;color:#999;font-weight:normal;">/ 25</span>` : val;
    dimHtml += `
      <div class="score-dim-row">
        <div class="score-dim-label">${escapeHtml(label)}</div>
        <div class="score-dim-bar-bg">
          <div class="score-dim-bar" style="width:${pct}%"></div>
        </div>
        <div class="score-dim-value">${valueDisplay}</div>
      </div>`;
  });

  let suggestionsHtml = '';
  if (suggestions && suggestions.length > 0) {
    suggestionsHtml = `<div class="score-suggestions-title">Suggestions for Improvement</div>`;
    suggestions.forEach(s => {
      suggestionsHtml += `<div class="score-suggestion-item">${escapeHtml(s)}</div>`;
    });
  }

  const displayTotal = isGaokao
    ? Math.min(25, Math.max(0, Math.round(Number(total) || 0)))
    : (Math.min(6, Math.max(0, Math.round(Number(total) * 2) / 2)));
  const scoreLabel = isGaokao
    ? (tier ? `Gaokao Writing Score · ${tier}` : 'Gaokao Writing Score (Max 25)')
    : 'TOEFL Writing Score';
  const maxLabel = isGaokao ? '/ 25' : '/ 6.0';
  const rewriteLabel = isGaokao ? '✨ Rewrite as 25-Point Model Essay' : '✨ Rewrite as 6.0 Model Essay';

  resultPanel.innerHTML = `
    <div class="score-card">
      <div class="score-total">
        <div class="score-total-number">${displayTotal} <span class="score-total-max">${maxLabel}</span></div>
        <div class="score-total-label">${escapeHtml(scoreLabel)}</div>
      </div>
      <div class="score-dimensions">${dimHtml}</div>
      <div class="score-comment">${escapeHtml(comment || '')}</div>
      ${suggestionsHtml}
      <button class="toefl-rewrite-btn" id="rewriteBtn">${escapeHtml(rewriteLabel)}</button>
    </div>`;

  const rewriteBtn = document.getElementById('rewriteBtn');
  if (rewriteBtn) {
    rewriteBtn.addEventListener('click', () => {
      handleRewrite(essay, data);
    });
  }
}

// ==================== 托福 / 高考：优化为范文 ====================
async function handleRewrite(essay, score) {
  const rewriteBtn = document.getElementById('rewriteBtn');
  if (rewriteBtn) {
    rewriteBtn.disabled = true;
    rewriteBtn.textContent = 'Rewriting...';
  }

  try {
    const endpoint = currentMode === 'gaokao' ? '/api/gaokao/rewrite' : '/api/toefl/rewrite';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: currentTopic, essay, score, mode: currentMode }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (currentScore) {
      currentScore.rewritten = data.rewritten;
      currentScore.keyChanges = data.keyChanges;
    }

    renderRewriteResult(data, score.total);

    // 用 PUT 更新同一条记录，补充 rewritten 和 keyChanges
    if (lastSavedId) {
      updateHistoryRecord(lastSavedId, {
        rewritten: data.rewritten,
        keyChanges: data.keyChanges,
      });
    }
  } catch (err) {
    resultPanel.innerHTML = `<div class="empty-state"><p style="color:#e74c3c;">Rewrite failed: ${escapeHtml(err.message)}</p></div>`;
  }
}

function renderRewriteResult(data, originalTotal) {
  const { rewritten, keyChanges } = data;
  const isGaokao = currentMode === 'gaokao' || (currentTopic && currentTopic.type === 'gaokao');
  let displayTotal = 0;
  if (isGaokao) {
    displayTotal = Math.min(25, Math.max(0, Math.round(Number(originalTotal) || 0)));
  } else {
    const roundToHalf = (n) => {
      const num = Number(n);
      if (isNaN(num)) return 0;
      return Math.min(6, Math.max(0, Math.round(num * 2) / 2));
    };
    displayTotal = roundToHalf(originalTotal);
  }

  const targetScoreText = isGaokao ? '25 (Full Mark)' : '6.0';
  const titleText = isGaokao ? '✨ 25-Point Model Essay' : '✨ 6.0 Model Essay';

  let html = `<div class="score-compare">Score Upgrade: ${displayTotal} → ${targetScoreText}</div>`;

  html += `
    <div class="optimized-card">
      <div class="optimized-header">
        <div class="optimized-title">${titleText}</div>
        <button class="copy-btn" id="copyRewrittenBtn">📋 Copy Essay</button>
      </div>
      <div class="optimized-text">${escapeHtml(rewritten)}</div>
    </div>`;

  if (keyChanges && keyChanges.length > 0) {
    html += `<div class="changes-title">Key Improvements (${keyChanges.length})</div>`;
    keyChanges.forEach(c => {
      html += `
        <div class="change-card">
          <div class="score-suggestion-item">${escapeHtml(c)}</div>
        </div>`;
    });
  }

  resultPanel.innerHTML = html;

  const copyBtn = document.getElementById('copyRewrittenBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(rewritten).then(() => {
        copyBtn.textContent = '✅ Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Essay';
          copyBtn.classList.remove('copied');
        }, 1500);
      }).catch(() => {
        copyBtn.textContent = 'Copy failed';
      });
    });
  }
}

// ==================== 存档系统 ====================

async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    historyItems = Array.isArray(data.items) ? data.items : [];
  } catch {
    historyItems = [];
  }
}

async function saveToHistory(type, text, result, topic) {
  try {
    const record = {
      mode: currentMode,
      type,
      text,
      result,
    };
    if (topic) record.topic = topic;
    const res = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
    const data = await res.json();
    if (data.id) lastSavedId = data.id;
    await fetchHistory();
  } catch {
    // 存档失败不影响主流程
  }
}

async function updateHistoryRecord(id, updates) {
  try {
    await fetch(`/api/history/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    await fetchHistory();
  } catch {
    // 更新失败不影响主流程
  }
}

async function deleteHistoryItem(id) {
  try {
    await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    await fetchHistory();
    renderHistoryList();
  } catch {
    // ignore
  }
}

async function clearAllHistory() {
  try {
    await fetch('/api/history?all=true', { method: 'DELETE' });
    historyItems = [];
    renderHistoryList();
  } catch {
    // ignore
  }
}

// ==================== 历史抽屉 ====================

historyBtn.addEventListener('click', openHistoryDrawer);
drawerCloseBtn.addEventListener('click', closeHistoryDrawer);
drawerOverlay.addEventListener('click', closeHistoryDrawer);
clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to clear all history? This action cannot be undone.')) {
    clearAllHistory();
  }
});

function openHistoryDrawer() {
  fetchHistory().then(() => renderHistoryList());
  historyDrawer.classList.add('open');
  drawerOverlay.classList.add('active');
}

function closeHistoryDrawer() {
  historyDrawer.classList.remove('open');
  drawerOverlay.classList.remove('active');
}

function renderHistoryList() {
  if (!historyItems || historyItems.length === 0) {
    drawerList.innerHTML = `
      <div class="drawer-empty">
        <p>No history yet</p>
        <p>Results will be saved automatically after checking or polishing</p>
      </div>`;
    return;
  }

  let html = '';
  historyItems.forEach(item => {
    // 类型检查防崩溃
    if (!item || !item.id) return;
    const time = formatTime(item.timestamp);
    const isGaokao = item.mode === 'gaokao';
    const isToefl = item.mode === 'toefl';
    const modeTag = isGaokao ? 'gaokao' : (isToefl ? 'toefl' : 'free');
    const modeLabel = isGaokao ? 'Gaokao' : (isToefl ? 'TOEFL' : 'Free');
    const typeTag = item.type || 'check';
    const typeLabel = TYPE_LABELS[typeTag] || typeTag;
    const preview = item.text ? item.text.slice(0, 40) : '(Empty)';

    html += `
      <div class="drawer-item" data-id="${escapeHtml(item.id)}">
        <div class="drawer-item-top">
          <span class="drawer-item-time">${escapeHtml(time)}</span>
          <span class="drawer-item-tag tag-${escapeHtml(modeTag)}">${escapeHtml(modeLabel)}</span>
          <span class="drawer-item-tag tag-${escapeHtml(typeTag)}">${escapeHtml(typeLabel)}</span>
        </div>
        <div class="drawer-item-preview">${escapeHtml(preview)}</div>
        <button class="drawer-item-delete" data-delete-id="${escapeHtml(item.id)}" title="Delete">🗑</button>
      </div>`;
  });
  drawerList.innerHTML = html;

  // 绑定事件（事件委托）
  drawerList.querySelectorAll('.drawer-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteId;
      if (id) deleteHistoryItem(id);
    });
  });
  drawerList.querySelectorAll('.drawer-item').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const item = historyItems.find(h => h.id === id);
      if (item) restoreRecord(item);
    });
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (itemDay.getTime() === today.getTime()) return `Today ${hh}:${mm}`;
  if (itemDay.getTime() === yesterday.getTime()) return `Yesterday ${hh}:${mm}`;
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${mon}-${day} ${hh}:${mm}`;
}

// ==================== 恢复记录 ====================

function restoreRecord(record) {
  closeHistoryDrawer();

  const mode = record.mode || 'free';
  if (mode !== currentMode) switchMode(mode);

  // 填充 textarea
  sentenceInput.value = record.text || '';
  updateWordCount();
  currentText = record.text || '';

  const type = record.type;
  const result = record.result;

  if (type === 'check' && result) {
    // 恢复语法检查
    currentErrors = Array.isArray(result.errors) ? result.errors : [];
    renderHighlighted();
    renderStats();
    switchToViewMode();
    if (currentMode === 'toefl' || currentMode === 'gaokao') legendEl.style.display = 'flex';

    if (currentErrors.length === 0) {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p style="color:#27ae60;font-size:36px;">✅</p>
          <p style="color:#27ae60;font-size:16px;">No errors found. Great job!</p>
        </div>`;
    } else {
      resultPanel.innerHTML = `
        <div class="empty-state">
          <p>Found <strong style="color:#4a90d9;">${currentErrors.length}</strong> ${currentErrors.length === 1 ? 'issue' : 'issues'}</p>
          <p class="hint">Click any highlighted segment on the left to view detailed analysis</p>
        </div>`;
    }
  } else if (type === 'optimize' && result) {
    // 恢复优化结果
    switchToViewMode();
    highlightedText.innerHTML = escapeHtml(currentText);
    statsEl.innerHTML = '';
    renderOptimizeResult(result);
  } else if ((type === 'toefl-score' || type === 'gaokao-score') && result) {
    // 恢复托福 / 高考评分
    if (record.topic) {
      currentTopic = record.topic;
      renderTopicCard(record.topic);
    }
    currentScore = result;

    // 自动切换到评分 Tab
    switchRightTab('score');

    // 如果有 rewritten，直接显示范文
    if (result.rewritten) {
      renderRewriteResult(
        { rewritten: result.rewritten, keyChanges: result.keyChanges || [] },
        result.total
      );
    } else {
      renderScoreResult(result, record.text || '');
    }
  }

  const time = formatTime(record.timestamp);
  showToast(`Restored record from ${time}`);
}

// ==================== 设置弹窗 ====================

settingsBtn.addEventListener('click', openSettingsModal);
settingsCancelBtn.addEventListener('click', closeSettingsModal);
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) closeSettingsModal();
});

settingsDefaultBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/settings/default');
    const data = await res.json();
    historyPathInput.value = data.historyFilePath || '';
    settingsMsg.textContent = 'Default path filled in. Click "Save" to apply.';
    settingsMsg.className = 'settings-msg success';
  } catch {
    settingsMsg.textContent = 'Failed to get default path';
    settingsMsg.className = 'settings-msg error';
  }
});

settingsSaveBtn.addEventListener('click', async () => {
  const p = historyPathInput.value.trim();
  if (!p) {
    settingsMsg.textContent = 'Path cannot be empty';
    settingsMsg.className = 'settings-msg error';
    return;
  }
  settingsSaveBtn.disabled = true;
  settingsSaveBtn.textContent = 'Saving...';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historyFilePath: p }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    settingsMsg.textContent = '✅ Saved! Will take effect on next save.';
    settingsMsg.className = 'settings-msg success';
    // 重新加载历史
    await fetchHistory();
  } catch (err) {
    settingsMsg.textContent = escapeHtml(err.message);
    settingsMsg.className = 'settings-msg error';
  } finally {
    settingsSaveBtn.disabled = false;
    settingsSaveBtn.textContent = 'Save';
  }
});

async function openSettingsModal() {
  settingsMsg.textContent = '';
  settingsMsg.className = 'settings-msg';
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    historyPathInput.value = data.historyFilePath || '';
  } catch {
    historyPathInput.value = '';
  }
  settingsOverlay.classList.add('active');
}

function closeSettingsModal() {
  settingsOverlay.classList.remove('active');
  settingsMsg.textContent = '';
}

// ==================== 提示条 ====================

function showToast(msg) {
  toastBar.textContent = msg;
  toastBar.classList.add('visible');
  setTimeout(() => {
    toastBar.classList.remove('visible');
  }, 3000);
}