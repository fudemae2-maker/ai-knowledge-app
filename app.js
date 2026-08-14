/**
 * AIナレッジ Pocket - Main Application Logic
 * PWA, Gemini API Integration, Voice Dictation, Knowledge Store, LINE Sharing
 */

// ==========================================
// 1. STATE & STORAGE MANAGEMENT
// ==========================================
const STORAGE_KEYS = {
  KNOWLEDGE_LIST: 'ai_knowledge_pocket_items_v1',
  SETTINGS: 'ai_knowledge_pocket_settings_v1',
  THEME: 'ai_knowledge_pocket_theme_v1',
  CURRENT_CHAT: 'ai_knowledge_pocket_active_chat_v1'
};

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'gemini-2.0-flash',
  lineHeader: '📌 【AIナレッジ Pocket 要約】',
  lineFooter: '---\n📱 AIナレッジ Pocketより共有'
};

let appState = {
  currentView: 'chatView',
  settings: { ...DEFAULT_SETTINGS },
  knowledgeItems: [],
  activeChatHistory: [],
  selectedKnowledgeId: null,
  currentShareFormat: 'summary',
  isRecordingVoice: false,
  recognition: null,
  activeFilterTag: 'all',
  searchQuery: ''
};

// Initial Preset Sample Data if empty
const SAMPLE_KNOWLEDGE = [
  {
    id: 'sample-1',
    title: 'LINE連携AIナレッジアプリの活用アイデア',
    category: 'アイデア',
    summary: '日々の気づきやブレストをスマホでAIに壁打ちし、ワンタップで構造化してLINEのKeepやグループに転送する仕組み。',
    insights: [
      '忘れる前に音声でAIに話しかけるのが最も手軽',
      'LINEのKeepメモに要約を送ることで自分専用のナレッジベースができる',
      'チームのLINEグループに送れば会議メモが即座に共有できる'
    ],
    todos: [
      'スマホのホーム画面にアプリを追加する',
      'Google AI Studioで無料APIキーを発行して設定する',
      'LINEで最初の要約をテスト送信してみる'
    ],
    tags: ['#アイデア', '#生産性', '#LINE活用'],
    isFavorite: true,
    createdAt: new Date().toISOString(),
    rawChat: 'ユーザー: AIと会話した内容をLINEに送るアプリの使い方を教えて\nAI: 音声入力やチャットでアイデアを話し、「ナレッジ化」を押すだけで自動で要約・ToDoが生成され、LINEに送信できます！'
  }
];

// ==========================================
// 2. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadStoredData();
  setupEventListeners();
  initVoiceRecognition();
  registerServiceWorker();
  renderKnowledgeList();
  updateBadgeCounts();
  updateHeaderStatus();
});

function loadStoredData() {
  // Load Settings
  try {
    const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (savedSettings) {
      appState.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }

  // Set Inputs in Settings View
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  const lineHeaderInput = document.getElementById('lineHeaderInput');
  const lineFooterInput = document.getElementById('lineFooterInput');

  if (apiKeyInput) apiKeyInput.value = appState.settings.apiKey || '';
  if (modelSelect) modelSelect.value = appState.settings.model || 'gemini-2.0-flash';
  if (lineHeaderInput) lineHeaderInput.value = appState.settings.lineHeader || DEFAULT_SETTINGS.lineHeader;
  if (lineFooterInput) lineFooterInput.value = appState.settings.lineFooter || DEFAULT_SETTINGS.lineFooter;

  // Load Theme
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  document.body.setAttribute('data-theme', savedTheme);

  // Load Knowledge Items
  try {
    const savedItems = localStorage.getItem(STORAGE_KEYS.KNOWLEDGE_LIST);
    if (savedItems) {
      appState.knowledgeItems = JSON.parse(savedItems);
    } else {
      appState.knowledgeItems = [...SAMPLE_KNOWLEDGE];
      saveKnowledgeToStorage();
    }
  } catch (e) {
    appState.knowledgeItems = [...SAMPLE_KNOWLEDGE];
  }

  // Load Active Chat if any
  try {
    const savedChat = localStorage.getItem(STORAGE_KEYS.CURRENT_CHAT);
    if (savedChat) {
      appState.activeChatHistory = JSON.parse(savedChat);
      renderChatMessages();
    }
  } catch (e) {
    appState.activeChatHistory = [];
  }
}

function saveKnowledgeToStorage() {
  localStorage.setItem(STORAGE_KEYS.KNOWLEDGE_LIST, JSON.stringify(appState.knowledgeItems));
  updateBadgeCounts();
  populateShareDropdown();
}

function updateHeaderStatus() {
  const headerStatus = document.getElementById('headerModelStatus');
  if (!headerStatus) return;

  if (appState.settings.apiKey) {
    headerStatus.textContent = `${appState.settings.model} (API連携中)`;
    headerStatus.style.color = '#38bdf8';
  } else {
    headerStatus.textContent = '無料デモモード (キー未設定)';
    headerStatus.style.color = '#94a3b8';
  }
}

function updateBadgeCounts() {
  const total = appState.knowledgeItems.length;
  const favCount = appState.knowledgeItems.filter(item => item.isFavorite).length;

  const countAll = document.getElementById('countAll');
  const countFav = document.getElementById('countFav');
  const badgeKnowledge = document.getElementById('badgeKnowledgeCount');

  if (countAll) countAll.textContent = total;
  if (countFav) countFav.textContent = favCount;
  if (badgeKnowledge) {
    badgeKnowledge.textContent = total;
    badgeKnowledge.style.display = total > 0 ? 'inline-flex' : 'none';
  }
}

// ==========================================
// 3. UI EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // Navigation Tabs
  const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      switchView(viewId);
    });
  });

  // Header Settings Button
  document.getElementById('headerSettingsBtn')?.addEventListener('click', () => {
    switchView('settingsView');
  });

  // Theme Toggle
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleTheme);

  // Chat Form & Input
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendChatMessage();
  });

  // Auto-expand textarea
  chatInput?.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });

  // Enter to send (Shift+Enter for newline)
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChatMessage();
    }
  });

  // Preset Chips
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt');
      if (prompt && chatInput) {
        chatInput.value = prompt;
        chatInput.focus();
      }
    });
  });

  // Clear Chat Button
  document.getElementById('clearChatBtn')?.addEventListener('click', clearActiveChat);

  // Knowledge Extraction Action Button
  document.getElementById('extractKnowledgeBtn')?.addEventListener('click', extractKnowledgeFromChat);

  // Voice Input Buttons
  document.getElementById('voiceInputBtn')?.addEventListener('click', toggleVoiceDictation);
  document.getElementById('cancelSpeechBtn')?.addEventListener('click', stopVoiceDictation);

  // Knowledge Search & Filtering
  const searchInput = document.getElementById('knowledgeSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  searchInput?.addEventListener('input', (e) => {
    appState.searchQuery = e.target.value.toLowerCase().trim();
    if (clearSearchBtn) clearSearchBtn.style.display = appState.searchQuery ? 'block' : 'none';
    renderKnowledgeList();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    appState.searchQuery = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';
    renderKnowledgeList();
  });

  // Tag filter pills
  document.querySelectorAll('#tagsFilterContainer .tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#tagsFilterContainer .tag-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      appState.activeFilterTag = pill.getAttribute('data-tag');
      renderKnowledgeList();
    });
  });

  // Empty state action button
  document.getElementById('goToChatBtn')?.addEventListener('click', () => {
    switchView('chatView');
  });

  // LINE Share Format Selector
  document.querySelectorAll('#formatButtons .format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#formatButtons .format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      appState.currentShareFormat = btn.getAttribute('data-format');
      updateLinePreviewText();
    });
  });

  // LINE Share Select Dropdown
  document.getElementById('shareKnowledgeSelect')?.addEventListener('change', (e) => {
    appState.selectedKnowledgeId = e.target.value;
    updateLinePreviewText();
  });

  // LINE Action Buttons
  document.getElementById('sendToLineDirectBtn')?.addEventListener('click', sendDirectToLine);
  document.getElementById('copyMessageBtn')?.addEventListener('click', copyLineMessage);
  document.getElementById('webShareBtn')?.addEventListener('click', shareViaWebShare);

  // Line Message Editor input event for char count
  document.getElementById('lineMessageEditor')?.addEventListener('input', (e) => {
    const charCountEl = document.getElementById('charCount');
    if (charCountEl) charCountEl.textContent = `${e.target.value.length} 文字`;
  });

  // Settings View: Save AI & LINE Settings
  document.getElementById('saveAiSettingsBtn')?.addEventListener('click', saveAiSettings);
  document.getElementById('saveLineSettingsBtn')?.addEventListener('click', saveLineSettings);

  // Toggle API Key visibility
  document.getElementById('toggleApiKeyVisibility')?.addEventListener('click', () => {
    const keyInput = document.getElementById('apiKeyInput');
    if (!keyInput) return;
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
  });

  // Data Export & Import
  document.getElementById('exportDataBtn')?.addEventListener('click', exportKnowledgeJson);
  document.getElementById('importDataBtn')?.addEventListener('click', () => {
    document.getElementById('importFileInput')?.click();
  });
  document.getElementById('importFileInput')?.addEventListener('change', handleImportJson);
  document.getElementById('clearAllDataBtn')?.addEventListener('click', clearAllKnowledgeData);

  // Modal Close & Background Click
  document.getElementById('closeModalBtn')?.addEventListener('click', closeKnowledgeModal);
  document.getElementById('knowledgeModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'knowledgeModal') closeKnowledgeModal();
  });

  document.getElementById('modalFavBtn')?.addEventListener('click', toggleModalFavorite);
  document.getElementById('modalDeleteBtn')?.addEventListener('click', deleteModalKnowledge);
  document.getElementById('modalSendLineBtn')?.addEventListener('click', () => {
    if (!appState.selectedKnowledgeId) return;
    closeKnowledgeModal();
    switchView('shareView');
    const select = document.getElementById('shareKnowledgeSelect');
    if (select) select.value = appState.selectedKnowledgeId;
    updateLinePreviewText();
  });
}

// Switch Active View Tab
function switchView(viewId) {
  appState.currentView = viewId;

  // View sections
  document.querySelectorAll('.view-screen').forEach(view => {
    view.classList.toggle('active', view.id === viewId);
  });

  // Navigation icons
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewId);
  });

  // If switched to shareView, populate select
  if (viewId === 'shareView') {
    populateShareDropdown();
    updateLinePreviewText();
  }

  // If switched to knowledgeView, refresh list
  if (viewId === 'knowledgeView') {
    renderKnowledgeList();
  }
}

// Theme Switcher
function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  showToast(newTheme === 'dark' ? '🌙 ダークモードに切り替えました' : '☀️ ライトモードに切り替えました');
}

// ==========================================
// 4. CHAT & AI CONVERSATION
// ==========================================
async function handleSendChatMessage() {
  const chatInput = document.getElementById('chatInput');
  const text = chatInput?.value.trim();
  if (!text) return;

  // Append user message
  const userMsg = { role: 'user', text, timestamp: new Date().toISOString() };
  appState.activeChatHistory.push(userMsg);
  saveActiveChat();
  renderChatMessages();

  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Add AI typing indicator bubble
  const typingBubbleId = addTypingIndicator();

  try {
    const aiResponseText = await queryGeminiOrSimulator(text, appState.activeChatHistory);
    removeTypingIndicator(typingBubbleId);

    const aiMsg = { role: 'model', text: aiResponseText, timestamp: new Date().toISOString() };
    appState.activeChatHistory.push(aiMsg);
    saveActiveChat();
    renderChatMessages();
  } catch (error) {
    removeTypingIndicator(typingBubbleId);
    console.error('Chat error:', error);
    const errorMsg = { 
      role: 'model', 
      text: `⚠️ エラーが発生しました: ${error.message}\n設定画面でAPIキーをご確認いただくか、デモモードをお試しください。`,
      timestamp: new Date().toISOString()
    };
    appState.activeChatHistory.push(errorMsg);
    renderChatMessages();
  }
}

function saveActiveChat() {
  localStorage.setItem(STORAGE_KEYS.CURRENT_CHAT, JSON.stringify(appState.activeChatHistory));
}

function renderChatMessages() {
  const container = document.getElementById('chatContainer');
  const actionBar = document.getElementById('chatActionBar');
  if (!container) return;

  if (appState.activeChatHistory.length === 0) {
    container.innerHTML = `
      <div class="chat-bubble ai welcome-bubble">
        <div class="bubble-avatar"><span class="avatar-sparkle">✨</span></div>
        <div class="bubble-content">
          <div class="bubble-title">こんにちは！AIナレッジアシスタントです。</div>
          <p>考え事、調べたこと、アイデア、今日の出来事などを気軽にお話しください。</p>
          <div class="welcome-guide-card">
            <div class="guide-step"><span>1</span> 音声またはテキストでAIと会話</div>
            <div class="guide-step"><span>2</span> <strong>「ナレッジ化」</strong>ボタンで要点＆ToDoを自動抽出</div>
            <div class="guide-step"><span>3</span> <strong>「LINEで送る」</strong>で自分やチームに即転送！</div>
          </div>
        </div>
      </div>
    `;
    if (actionBar) actionBar.style.display = 'none';
    return;
  }

  // Show floating action bar when messages exist
  if (actionBar) actionBar.style.display = 'flex';

  container.innerHTML = appState.activeChatHistory.map(msg => {
    const isUser = msg.role === 'user';
    const formattedText = escapeHtml(msg.text).replace(/\n/g, '<br>');

    return `
      <div class="chat-bubble ${isUser ? 'user' : 'ai'}">
        ${!isUser ? '<div class="bubble-avatar"><span class="avatar-sparkle">✨</span></div>' : ''}
        <div class="bubble-content">${formattedText}</div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function addTypingIndicator() {
  const container = document.getElementById('chatContainer');
  if (!container) return null;

  const id = 'typing-' + Date.now();
  const typingHtml = `
    <div class="chat-bubble ai" id="${id}">
      <div class="bubble-avatar"><span class="avatar-sparkle">✨</span></div>
      <div class="bubble-content" style="color: var(--text-muted);">
        <span>AIが思考中...</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', typingHtml);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  if (!id) return;
  const el = document.getElementById(id);
  if (el) el.remove();
}

function clearActiveChat() {
  if (confirm('チャットの会話履歴をクリアしますか？（保存済みのナレッジは消えません）')) {
    appState.activeChatHistory = [];
    localStorage.removeItem(STORAGE_KEYS.CURRENT_CHAT);
    renderChatMessages();
    showToast('🗑️ チャット履歴をクリアしました');
  }
}

// ==========================================
// 5. GEMINI API & AI DEMO SIMULATOR
// ==========================================
async function queryGeminiOrSimulator(userPrompt, conversationHistory = []) {
  const apiKey = appState.settings.apiKey?.trim();
  const model = appState.settings.model || 'gemini-2.0-flash';

  // If no API key or model is 'demo', use the built-in intelligent Japanese simulator
  if (!apiKey || model === 'demo') {
    return generateSimulatorResponse(userPrompt, conversationHistory);
  }

  // Call Real Google Gemini API (REST Endpoint)
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Format system prompt and contents
  const contents = conversationHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

  const systemInstruction = {
    parts: [{
      text: "あなたはスマートフォン向けの親切で優秀なAIナレッジアシスタントです。ユーザーのアイデア、思考の整理、学習メモ、ToDoの洗い出しを手助けしてください。回答はスマホで読みやすいように、要点を簡潔にまとめ、わかりやすく箇条書きや具体的な次のステップを添えて日本語で答えてください。"
    }]
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const data = await response.json();
  const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResult) throw new Error('AIからの応答を取得できませんでした');

  return textResult;
}

// Built-in Japanese Simulator for Instant Test without API Key
function generateSimulatorResponse(prompt, history) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const lower = prompt.toLowerCase();
      
      if (lower.includes('アイデア') || lower.includes('ひらめき') || lower.includes('企画')) {
        resolve(`💡 **素晴らしいアイデアですね！**\n\n実現に向けたポイントを3つ整理しました：\n\n1. **ターゲットの明確化**: 誰のどんな課題を解決するのかを1行で定義する\n2. **最小限のプロトタイプ（MVP）**: まず手元のツールで小さく試す\n3. **フィードバックの回収**: 周りの人に意見を聞いてブラッシュアップ\n\n【次のアクション】\n- [ ] コアバリューを箇条書きで書き出す\n- [ ] LINEなどで関係者に共有して意見をもらう`);
      } else if (lower.includes('todo') || lower.includes('タスク') || lower.includes('整理')) {
        resolve(`📋 **タスクを優先度順に整理しました！**\n\n【最優先（今日やるべきこと）】\n- [ ] 重要な連絡・返信を済ませる\n- [ ] プロジェクトの骨子を作成\n\n【今週中のタスク】\n- [ ] スケジュールと進捗の確認\n- [ ] 次回打ち合わせの資料準備\n\n無理のないペースで一つずつ完了させていきましょう！`);
      } else if (lower.includes('本') || lower.includes('読書') || lower.includes('勉強') || lower.includes('学習')) {
        resolve(`📖 **学びの要約と実践ポイント**\n\n【学んだ知見】\n・インプットだけでなく即座のアウトプットが記憶定着の鍵\n・小さく習慣化して毎日継続する\n\n【実践アクション】\n- [ ] 今日の気づきを1行でメモしてLINEに送る\n- [ ] 明日の朝に15分だけ実践タイムを確保する`);
      } else {
        resolve(`✨ **お話しいただきありがとうございます！**\n\n伺った内容の要点をまとめました：\n\n・**現状のテーマ**: ${prompt.slice(0, 30)}...\n・**重要なポイント**: 現状の課題を整理し、実行可能なステップに分解することが有効です。\n\n画面下の「**🧠 この会話をナレッジ化して保存**」を押すと、自動で整理されてLINEへの送信準備が整います！`);
      }
    }, 600);
  });
}

// ==========================================
// 6. KNOWLEDGE EXTRACTION ENGINE
// ==========================================
async function extractKnowledgeFromChat() {
  if (appState.activeChatHistory.length === 0) {
    showToast('⚠️ 会話履歴がありません。まずはAIとお話しください。');
    return;
  }

  showToast('🧠 AIが会話からナレッジを抽出中...');

  const chatContext = appState.activeChatHistory
    .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`)
    .join('\n\n');

  try {
    const apiKey = appState.settings.apiKey?.trim();
    const model = appState.settings.model || 'gemini-2.0-flash';
    let knowledgeResult = null;

    if (!apiKey || model === 'demo') {
      // Simulator Extraction
      knowledgeResult = generateSimulatorKnowledge(appState.activeChatHistory);
    } else {
      // Real Gemini Structured Extraction
      const prompt = `以下の会話内容から、後で振り返ったりLINEで共有しやすい構造化ナレッジをJSON形式で抽出してください。

JSONスキーマ:
{
  "title": "会話内容を表す具体的で魅力的なタイトル (30文字以内)",
  "category": "仕事 または アイデア または 学習 または 生活 または ToDo",
  "summary": "会話の全体要約（2〜3行で簡潔に）",
  "insights": ["重要な知見や気づき1", "知見2", "知見3"],
  "todos": ["具体的なアクションアイテム1", "アクションアイテム2"],
  "tags": ["#タグ1", "#タグ2", "#タグ3"]
}

会話内容:
${chatContext}

※ 必ず上記の有効なJSONのみを出力してください（Markdownコードブロックは含めても構いません）。`;

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error('ナレッジ抽出リクエストに失敗しました');

      const data = await response.json();
      const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      // Clean JSON string
      const cleanJson = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();
      knowledgeResult = JSON.parse(cleanJson);
    }

    // Create item
    const newItem = {
      id: 'k_' + Date.now(),
      title: knowledgeResult.title || 'AI会話ナレッジ',
      category: knowledgeResult.category || 'アイデア',
      summary: knowledgeResult.summary || '会話のまとめ',
      insights: Array.isArray(knowledgeResult.insights) ? knowledgeResult.insights : [],
      todos: Array.isArray(knowledgeResult.todos) ? knowledgeResult.todos : [],
      tags: Array.isArray(knowledgeResult.tags) ? knowledgeResult.tags : ['#AIナレッジ'],
      isFavorite: false,
      createdAt: new Date().toISOString(),
      rawChat: chatContext
    };

    // Prepend to list
    appState.knowledgeItems.unshift(newItem);
    saveKnowledgeToStorage();

    // Select this item for LINE share
    appState.selectedKnowledgeId = newItem.id;

    showToast('✨ ナレッジを抽出・保存しました！');

    // Switch to Knowledge view or Share view
    setTimeout(() => {
      switchView('knowledgeView');
    }, 400);

  } catch (error) {
    console.error('Knowledge extraction error:', error);
    showToast(`⚠️ 抽出エラー: ${error.message}`);
  }
}

function generateSimulatorKnowledge(chatHistory) {
  const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')?.text || 'AI会話';
  const shortTitle = lastUserMsg.length > 20 ? lastUserMsg.slice(0, 20) + '...' : lastUserMsg;

  return {
    title: `【整理】${shortTitle}`,
    category: lastUserMsg.includes('todo') || lastUserMsg.includes('タスク') ? 'ToDo' : 'アイデア',
    summary: 'AIとの対話から得られた主要な論点と、次に取るべき具体的な行動ステップのまとめ。',
    insights: [
      '課題を小分けにして優先度を明確にする',
      'スマホを活用してすぐに共有・記録する習慣が効果的',
      'LINEのKeepメモやグループを活用して可視化する'
    ],
    todos: [
      '抽出された知見を確認してLINEで送信する',
      '優先度の高いToDoから順に着手する'
    ],
    tags: ['#知見整理', '#AI活用', '#アクション']
  };
}

// ==========================================
// 7. KNOWLEDGE BASE UI & CRUD
// ==========================================
function renderKnowledgeList() {
  const container = document.getElementById('knowledgeList');
  if (!container) return;

  let items = [...appState.knowledgeItems];

  // Apply Tag Filter
  if (appState.activeFilterTag === 'fav') {
    items = items.filter(item => item.isFavorite);
  } else if (appState.activeFilterTag !== 'all') {
    items = items.filter(item => 
      item.category === appState.activeFilterTag || 
      item.tags.some(t => t.includes(appState.activeFilterTag))
    );
  }

  // Apply Search Query
  if (appState.searchQuery) {
    const q = appState.searchQuery;
    items = items.filter(item => 
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.insights.some(i => i.toLowerCase().includes(q)) ||
      item.todos.some(t => t.toLowerCase().includes(q)) ||
      item.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">該当するナレッジがありません</div>
        <p class="empty-desc">検索条件を変更するか、新しいナレッジを作成してください。</p>
        <button class="btn btn-primary" onclick="document.getElementById('navChat').click()">AIと会話して作成</button>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => {
    const formattedDate = formatDate(item.createdAt);
    const todoPreview = item.todos.slice(0, 2).map(todo => `
      <div class="card-todo-item">
        <span>▫️</span> <span>${escapeHtml(todo)}</span>
      </div>
    `).join('');

    return `
      <div class="knowledge-card" data-id="${item.id}">
        <div class="card-top-row">
          <span class="card-tag">${escapeHtml(item.category || 'アイデア')}</span>
          <span class="card-date">${formattedDate}</span>
        </div>

        <div class="card-title" onclick="window.appOpenModal('${item.id}')">
          ${escapeHtml(item.title)}
        </div>

        <div class="card-summary-snippet" onclick="window.appOpenModal('${item.id}')">
          ${escapeHtml(item.summary)}
        </div>

        ${item.todos.length > 0 ? `<div class="card-todo-preview">${todoPreview}</div>` : ''}

        <div class="card-actions-footer">
          <button class="card-line-btn" onclick="window.appDirectShareLine('${item.id}')">
            <span>💬 LINEで送る</span>
          </button>
          <div class="card-sub-actions">
            <button class="icon-btn" onclick="window.appToggleFav('${item.id}')" title="お気に入り">
              ${item.isFavorite ? '★' : '☆'}
            </button>
            <button class="icon-btn" onclick="window.appOpenModal('${item.id}')" title="詳細を見る">
              🔍
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Global modal helpers
window.appOpenModal = function(id) {
  const item = appState.knowledgeItems.find(k => k.id === id);
  if (!item) return;

  appState.selectedKnowledgeId = id;
  const modal = document.getElementById('knowledgeModal');
  if (!modal) return;

  document.getElementById('modalTitle').textContent = item.title;
  document.getElementById('modalTagBadge').textContent = `${item.category} ${item.tags.join(' ')}`;
  document.getElementById('modalMeta').textContent = `作成日時: ${formatDate(item.createdAt)}`;
  document.getElementById('modalSummary').textContent = item.summary;
  
  const favBtn = document.getElementById('modalFavBtn');
  if (favBtn) favBtn.textContent = item.isFavorite ? '★' : '☆';

  // Insights
  const insightsEl = document.getElementById('modalInsights');
  if (insightsEl) {
    insightsEl.innerHTML = item.insights.map(ins => `<li>${escapeHtml(ins)}</li>`).join('');
  }

  // Todos
  const todosEl = document.getElementById('modalTodos');
  const todoSection = document.getElementById('modalTodoSection');
  if (todosEl && todoSection) {
    if (item.todos.length > 0) {
      todoSection.style.display = 'block';
      todosEl.innerHTML = item.todos.map(td => `<li>${escapeHtml(td)}</li>`).join('');
    } else {
      todoSection.style.display = 'none';
    }
  }

  // Chat Log
  const chatLogEl = document.getElementById('modalOriginalChat');
  if (chatLogEl) {
    chatLogEl.textContent = item.rawChat || '元の会話ログなし';
  }

  modal.style.display = 'flex';
};

window.appDirectShareLine = function(id) {
  appState.selectedKnowledgeId = id;
  switchView('shareView');
  const select = document.getElementById('shareKnowledgeSelect');
  if (select) select.value = id;
  updateLinePreviewText();
};

window.appToggleFav = function(id) {
  const item = appState.knowledgeItems.find(k => k.id === id);
  if (item) {
    item.isFavorite = !item.isFavorite;
    saveKnowledgeToStorage();
    renderKnowledgeList();
  }
};

function closeKnowledgeModal() {
  const modal = document.getElementById('knowledgeModal');
  if (modal) modal.style.display = 'none';
}

function toggleModalFavorite() {
  if (!appState.selectedKnowledgeId) return;
  window.appToggleFav(appState.selectedKnowledgeId);
  const item = appState.knowledgeItems.find(k => k.id === appState.selectedKnowledgeId);
  const favBtn = document.getElementById('modalFavBtn');
  if (favBtn && item) favBtn.textContent = item.isFavorite ? '★' : '☆';
}

function deleteModalKnowledge() {
  if (!appState.selectedKnowledgeId) return;
  if (confirm('このナレッジを削除してもよろしいですか？')) {
    appState.knowledgeItems = appState.knowledgeItems.filter(k => k.id !== appState.selectedKnowledgeId);
    saveKnowledgeToStorage();
    closeKnowledgeModal();
    renderKnowledgeList();
    showToast('🗑️ ナレッジを削除しました');
  }
}

// ==========================================
// 8. LINE SHARING & FORMATTING
// ==========================================
function populateShareDropdown() {
  const select = document.getElementById('shareKnowledgeSelect');
  if (!select) return;

  const currentVal = appState.selectedKnowledgeId || select.value;
  select.innerHTML = '<option value="">-- 送信するナレッジを選択 --</option>' + 
    appState.knowledgeItems.map(item => {
      const selected = item.id === currentVal ? 'selected' : '';
      return `<option value="${item.id}" ${selected}>${escapeHtml(item.title)}</option>`;
    }).join('');

  if (!currentVal && appState.knowledgeItems.length > 0) {
    appState.selectedKnowledgeId = appState.knowledgeItems[0].id;
    select.value = appState.selectedKnowledgeId;
  }
}

function generateLineFormattedMessage(item, format = 'summary') {
  if (!item) return '';

  const header = appState.settings.lineHeader ? `${appState.settings.lineHeader}\n` : '';
  const footer = appState.settings.lineFooter ? `\n${appState.settings.lineFooter}` : '';
  const tags = item.tags && item.tags.length > 0 ? `\n${item.tags.join(' ')}` : '';

  if (format === 'summary') {
    // Short & Sweet 3-line summary
    return `${header}【${item.title}】\n\n📝 要約:\n${item.summary}\n${tags}${footer}`.trim();
  } 
  
  if (format === 'full') {
    // Detailed Report
    const insightsText = item.insights.length > 0 ? `\n\n💡 主要なポイント:\n` + item.insights.map(i => `・${i}`).join('\n') : '';
    const todosText = item.todos.length > 0 ? `\n\n✅ ToDo / アクション:\n` + item.todos.map(t => `[ ] ${t}`).join('\n') : '';

    return `${header}【${item.title}】\n\n📝 要約:\n${item.summary}${insightsText}${todosText}${tags}${footer}`.trim();
  }

  if (format === 'todo') {
    // ToDo Checklist Only
    const todosText = item.todos.length > 0 ? item.todos.map(t => `[ ] ${t}`).join('\n') : 'ToDoはありません';
    return `✅ 【ToDoチェックリスト】\n${item.title}\n\n${todosText}${tags}${footer}`.trim();
  }

  return item.summary || '';
}

function updateLinePreviewText() {
  const item = appState.knowledgeItems.find(k => k.id === appState.selectedKnowledgeId) || appState.knowledgeItems[0];
  const editor = document.getElementById('lineMessageEditor');
  const charCountEl = document.getElementById('charCount');

  if (!item || !editor) {
    if (editor) editor.value = 'ナレッジが選択されていません。';
    if (charCountEl) charCountEl.textContent = '0 文字';
    return;
  }

  const formattedMsg = generateLineFormattedMessage(item, appState.currentShareFormat);
  editor.value = formattedMsg;
  if (charCountEl) charCountEl.textContent = `${formattedMsg.length} 文字`;
}

function sendDirectToLine() {
  const editor = document.getElementById('lineMessageEditor');
  const message = editor?.value.trim();
  if (!message) {
    showToast('⚠️ 送信するメッセージがありません');
    return;
  }

  // LINE Official URL Scheme (Opens LINE App on iOS/Android or LINE Web)
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(message)}`;
  
  // Try opening LINE app
  window.open(lineUrl, '_blank');
  showToast('🚀 LINEアプリを開きました！送信先を選択してください');
}

async function copyLineMessage() {
  const editor = document.getElementById('lineMessageEditor');
  const message = editor?.value.trim();
  if (!message) return;

  try {
    await navigator.clipboard.writeText(message);
    showToast('📋 クリップボードにコピーしました！');
  } catch (err) {
    // Fallback
    editor.select();
    document.execCommand('copy');
    showToast('📋 コピーしました');
  }
}

async function shareViaWebShare() {
  const editor = document.getElementById('lineMessageEditor');
  const message = editor?.value.trim();
  if (!message) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'AIナレッジ Pocket',
        text: message
      });
      showToast('✨ 共有メニューを開きました');
    } catch (err) {
      if (err.name !== 'AbortError') copyLineMessage();
    }
  } else {
    copyLineMessage();
  }
}

// ==========================================
// 9. VOICE RECOGNITION (Web Speech API)
// ==========================================
function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const voiceBtn = document.getElementById('voiceInputBtn');
    if (voiceBtn) {
      voiceBtn.title = 'お使いのブラウザは音声認識に未対応です';
      voiceBtn.style.opacity = '0.5';
    }
    return;
  }

  appState.recognition = new SpeechRecognition();
  appState.recognition.lang = 'ja-JP';
  appState.recognition.continuous = true;
  appState.recognition.interimResults = true;

  appState.recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      }
    }

    if (finalTranscript) {
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = (chatInput.value + ' ' + finalTranscript).trim();
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
      }
    }
  };

  appState.recognition.onerror = (event) => {
    console.warn('Speech error:', event.error);
    stopVoiceDictation();
    if (event.error !== 'no-speech') {
      showToast(`⚠️ 音声認識: ${event.error}`);
    }
  };

  appState.recognition.onend = () => {
    if (appState.isRecordingVoice) {
      stopVoiceDictation();
    }
  };
}

function toggleVoiceDictation() {
  if (!appState.recognition) {
    showToast('⚠️ お使いの環境では音声入力に対応していません');
    return;
  }

  if (appState.isRecordingVoice) {
    stopVoiceDictation();
  } else {
    startVoiceDictation();
  }
}

function startVoiceDictation() {
  try {
    appState.recognition.start();
    appState.isRecordingVoice = true;
    
    document.getElementById('voiceInputBtn')?.classList.add('recording');
    const indicator = document.getElementById('speechIndicator');
    if (indicator) indicator.style.display = 'flex';

    showToast('🎙️ 音声入力を開始しました。お話しください');
  } catch (e) {
    console.error(e);
  }
}

function stopVoiceDictation() {
  if (appState.recognition && appState.isRecordingVoice) {
    try {
      appState.recognition.stop();
    } catch (e) {}
  }

  appState.isRecordingVoice = false;
  document.getElementById('voiceInputBtn')?.classList.remove('recording');
  const indicator = document.getElementById('speechIndicator');
  if (indicator) indicator.style.display = 'none';
}

// ==========================================
// 10. SETTINGS, EXPORT & IMPORT
// ==========================================
function saveAiSettings() {
  const apiKey = document.getElementById('apiKeyInput')?.value.trim() || '';
  const model = document.getElementById('modelSelect')?.value || 'gemini-2.0-flash';

  appState.settings.apiKey = apiKey;
  appState.settings.model = model;

  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
  updateHeaderStatus();
  showToast('✅ AI設定を保存しました！');
}

function saveLineSettings() {
  const header = document.getElementById('lineHeaderInput')?.value || '';
  const footer = document.getElementById('lineFooterInput')?.value || '';

  appState.settings.lineHeader = header;
  appState.settings.lineFooter = footer;

  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(appState.settings));
  showToast('✅ LINEテンプレート設定を保存しました！');
}

function exportKnowledgeJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState.knowledgeItems, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `ai_knowledge_backup_${new Date().toISOString().slice(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('📥 JSONファイルをダウンロードしました');
}

function handleImportJson(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (Array.isArray(imported)) {
        appState.knowledgeItems = imported;
        saveKnowledgeToStorage();
        renderKnowledgeList();
        showToast(`📤 ${imported.length}件のナレッジを復元しました！`);
      } else {
        throw new Error('JSONの形式が正しくありません');
      }
    } catch (err) {
      showToast('⚠️ インポートに失敗しました: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function clearAllKnowledgeData() {
  if (confirm('【警告】すべてのナレッジデータを完全に削除しますか？この操作は取り消せません。')) {
    appState.knowledgeItems = [];
    localStorage.removeItem(STORAGE_KEYS.KNOWLEDGE_LIST);
    saveKnowledgeToStorage();
    renderKnowledgeList();
    showToast('🗑️ 全データを削除しました');
  }
}

// ==========================================
// 11. PWA & HELPER UTILITIES
// ==========================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW Registered:', reg.scope))
        .catch(err => console.log('SW Registration failed:', err));
    });
  }
}

function showToast(message) {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMessage');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.style.display = 'flex';

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${mins}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
