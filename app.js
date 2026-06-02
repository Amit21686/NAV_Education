(function() {
  // =============================================
  // SERVICE WORKER & OFFLINE CACHE
  // =============================================
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("final-sw.js")
      .then(registration => {
        console.log('✅ Final Service Worker registered');
        setupUpdateNotificationSystem(registration);
        setupCacheManagement(registration);
        startPeriodicUpdateChecks(registration);
        trackUserActivityForCaching();
      }).catch(error => {
        console.error('❌ Service Worker failed:', error);
        navigator.serviceWorker.register("service-worker.js");
      });
  }

  function setupUpdateNotificationSystem(registration) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data.type === 'UPDATE_AVAILABLE') {
        showUpdateNotification(1);
      } else if (event.data.type === 'UPDATES_FOUND') {
        showUpdateNotification(event.data.count);
      }
    });
    window.checkForUpdatesManually = function() {
      if (registration.active) {
        registration.active.postMessage('checkForUpdates');
        showToast('🔍 Checking for updates...', 'info');
      }
    };
  }

  function setupCacheManagement(registration) {
    window.getCacheInfo = function() {
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        registration.active?.postMessage('getCacheInfo', [channel.port2]);
      });
    };
    window.clearOfflineCache = function() {
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data);
        if (registration.active) {
          registration.active.postMessage('clearCache', [channel.port2]);
        } else {
          caches.keys().then(keys => {
            Promise.all(keys.map(k => caches.delete(k))).then(() => resolve());
          });
        }
      });
    };
    window.prefetchContent = function(urls) {
      if (registration.active) {
        registration.active.postMessage({ type: 'prefetch', urls: urls });
      }
    };
  }

  function startPeriodicUpdateChecks(registration) {
    setTimeout(() => {
      if (navigator.onLine && registration.active) {
        registration.active.postMessage('checkForUpdates');
      }
    }, 3000);
    setInterval(() => {
      if (navigator.onLine) {
        registration.update();
        if (registration.active) {
          registration.active.postMessage('checkForUpdates');
        }
      }
    }, 30 * 60 * 1000);
  }

  function trackUserActivityForCaching() {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img').forEach(img => {
        if (img.src) window.prefetchContent([img.src]);
      });
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'IMG' && node.src) {
              window.prefetchContent([node.src]);
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  let isNotificationVisible = false;
  function showUpdateNotification(fileCount) {
    if (isNotificationVisible) return;
    if (sessionStorage.getItem('updateDismissed')) return;
    isNotificationVisible = true;
    const notification = document.createElement('div');
    notification.id = 'updateNotification';
    notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-xl shadow-2xl z-50 max-w-xs animate-fade-in';
    const message = fileCount === 1 ? 'New content available!' : `${fileCount} items updated`;
    notification.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0 pt-1"><i class="fas fa-sync-alt animate-spin text-xl"></i></div>
        <div class="ml-3 flex-1">
          <h4 class="font-bold text-lg">Update Available</h4>
          <p class="text-sm mt-1 opacity-90">${message}</p>
          <div class="flex space-x-2 mt-3">
            <button onclick="applyUpdateNow()" class="flex-1 bg-white text-green-600 px-3 py-2 rounded-lg font-semibold hover:bg-gray-50 transition text-sm">Update Now</button>
            <button onclick="dismissUpdateNotification()" class="flex-1 bg-transparent border border-white/30 text-white px-3 py-2 rounded-lg font-semibold hover:bg-white/10 transition text-sm">Later</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(notification);
    setTimeout(() => {
      const notif = document.getElementById('updateNotification');
      if (notif) { notif.remove(); isNotificationVisible = false; }
    }, 15000);
  }

  window.applyUpdateNow = function() {
    const notification = document.getElementById('updateNotification');
    if (notification) notification.remove();
    isNotificationVisible = false;
    showToast('🔄 Applying updates...', 'info');
    setTimeout(() => { window.location.reload(true); }, 1000);
  };

  function dismissUpdateNotification() {
    const notification = document.getElementById('updateNotification');
    if (notification) notification.remove();
    isNotificationVisible = false;
    sessionStorage.setItem('updateDismissed', 'true');
    showToast('Update postponed', 'info');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg z-50 ${type === 'info' ? 'bg-blue-500' : type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white text-sm`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  window.addEventListener('online', () => {
    document.getElementById('offlineIndicator')?.classList.add('hidden');
  });
  window.addEventListener('offline', () => {
    const indicator = document.getElementById('offlineIndicator');
    if (indicator) {
      indicator.classList.remove('hidden');
      showToast('🌐 You are offline. Using cached content.', 'info');
    }
  });

  // =============================================
  // PERFORMANCE STORAGE SYSTEM
  // =============================================
  let performanceState = {
    attempts: {},
    bestScores: {},
    achievements: {},
    bookmarks: [],
    studyProgress: {},
    customQuizzes: [],
    studyReminders: [],
    globalStats: { totalQuizzes: 0, averageScore: 0, improvement: 0 }
  };

  function initializePerformanceState() {
    const saved = localStorage.getItem('navPerformanceData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        performanceState = { ...performanceState, ...parsed };
      } catch (e) { console.error('Error loading performance data:', e); }
    }
  }

  function savePerformanceState() {
    localStorage.setItem('navPerformanceData', JSON.stringify(performanceState));
  }

  function addAttempt(subject, chapter, score, total, percentage, mode = 'normal') {
    const chapterKey = `${subject}_${chapter}`;
    const now = new Date();
    const attempt = {
      score, total, percentage,
      timestamp: now.toISOString(),
      date: now.toLocaleDateString(),
      time: now.toLocaleTimeString(),
      mode
    };
    if (!performanceState.attempts[chapterKey]) performanceState.attempts[chapterKey] = [];
    performanceState.attempts[chapterKey].push(attempt);
    performanceState.attempts[chapterKey].sort((a, b) => b.percentage - a.percentage);
    if (performanceState.attempts[chapterKey].length > 5) performanceState.attempts[chapterKey] = performanceState.attempts[chapterKey].slice(0, 5);
    if (!performanceState.bestScores[chapterKey] || percentage > performanceState.bestScores[chapterKey]) {
      performanceState.bestScores[chapterKey] = percentage;
    }
    performanceState.globalStats.totalQuizzes++;
    updateGlobalStatistics();
    checkAchievements(subject, chapter, percentage, mode);
    savePerformanceState();
  }

  function updateGlobalStatistics() {
    let totalPercentage = 0, count = 0;
    Object.values(performanceState.attempts).forEach(attempts => {
      attempts.forEach(a => { totalPercentage += a.percentage; count++; });
    });
    if (count > 0) performanceState.globalStats.averageScore = totalPercentage / count;
  }

  function calculateChapterStats(chapterKey) {
    const attempts = performanceState.attempts[chapterKey] || [];
    let totalPercentage = 0;
    attempts.forEach(a => totalPercentage += a.percentage);
    let improvement = 0;
    if (attempts.length >= 2) {
      improvement = attempts[0].percentage - attempts[attempts.length - 1].percentage;
    }
    return {
      averageScore: attempts.length ? totalPercentage / attempts.length : 0,
      totalAttempts: attempts.length,
      improvement
    };
  }

  function checkAchievements(subject, chapter, percentage, mode) {
    const key = `${subject}_${chapter}`;
    if (!performanceState.achievements[key]) performanceState.achievements[key] = [];
    const achievements = [
      { id: 'first_quiz', name: 'First Quiz', condition: () => performanceState.attempts[key]?.length === 1 },
      { id: 'perfect_score', name: 'Perfect Score', condition: (p) => p === 100 },
      { id: 'chapter_master', name: 'Chapter Master', condition: (p) => p >= 90 },
      { id: 'chapter_expert', name: 'Chapter Expert', condition: (p) => p >= 85 },
      { id: 'consistent_learner', name: 'Consistent Learner', condition: () => performanceState.attempts[key]?.length >= 3 },
      { id: 'speed_demon', name: 'Speed Demon', condition: (p, s, c, m) => m === 'hard' }
    ];
    achievements.forEach(a => {
      if (a.condition(percentage, subject, chapter, mode) && !performanceState.achievements[key].includes(a.id)) {
        performanceState.achievements[key].push(a.id);
        showAchievementNotification(a.name, `in ${subject} - Chapter ${chapter}`);
      }
    });
  }

  function showAchievementNotification(achievementName, context = "") {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-4 rounded-lg shadow-lg z-50 transform translate-x-full transition-transform duration-300';
    notification.innerHTML = `
      <div class="flex items-center space-x-3">
        <i class="fas fa-trophy text-xl"></i>
        <div>
          <div class="font-bold">Achievement Unlocked!</div>
          <div class="text-sm">${achievementName} ${context}</div>
        </div>
      </div>`;
    document.body.appendChild(notification);
    setTimeout(() => notification.style.transform = 'translateX(0)', 100);
    setTimeout(() => {
      notification.style.transform = 'translateX(100%)';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // =============================================
  // DATA CONFIGURATION
  // =============================================
  const data = {
    Biology: {
      chapters: [
        { id: 1, title: "1. Cell Structure and Function" },
        { id: 2, title: "2. Genetics" },
        { id: 3, title: "3. Evolution" },
        { id: 4, title: "4. Human Physiology" },
        { id: 5, title: "5. Principles of Inheritance and Variation" },
        { id: 6, title: "6. Organisms and Population" }
      ]
    },
    "Bharat Ratna MCQS": { chapters: [ { id: 1, title: "Bharat Ratna MCQS" } ] },
    Computer: {
      chapters: [
        { id: 1, title: "1. Creating HTML forms using KompoZer" },
        { id: 2, title: "Chapter 2" }, { id: 3, title: "Chapter 3" },
        { id: 4, title: "Chapter 4" }, { id: 5, title: "Chapter 5" }
      ]
    },
    "STD 6th": {
      chapters: [
        { id: 1, title: "1. Evolution" },
        { id: 2, title: "2. Living Organism" }
      ]
    }
  };

  const extraSubjects = [
    { type: "Special", name: "Country - Capital", display: "Countries & Capitals", url: "country-capital.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160383439.jpg" },
    { type: "Special", name: "BIOLOGY Question Paper", display: "BIOLOGY Question Paper", url: "gallery.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160428779.jpg" },
    { type: "Special", name: "COMPUTER Chapter 1 to 10", display: "Computer 🖥️ ALL MCQS", url: "computer.html", image: null },
    { type: "Special", name: "STD 12TH BIOLOGY MCQS", display: "STD 12TH BIOLOGY MCQS", url: "bio.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160453087.jpg" },
    { type: "Special", name: "Verbs", display: "Verbs Practice", url: "Verbs.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160318418.jpg" },
    { type: "Special", name: "Human Body Parts", display: "Human Body Parts", url: "human.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160290869.jpg" },
    { type: "Special", name: "Collective Noun", display: "Collective Nouns", url: "collective noun.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160256811.jpg" },
    { type: "Special", name: "India Map", display: "India Map", url: "india.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160161106.jpg" },
    { type: "Special", name: "Uttar Pradesh Map", display: "Uttar Pradesh Map", url: "UP.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160214009.jpg" },
    { type: "Special", name: "Gujarat Map", display: "Gujarat Map", url: "gujarat.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160188727.jpg" },
    { type: "Special", name: "Tense", display: "Structure of Tense", url: "Tense.html", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160344335.jpg" },
    { type: "Special", name: "L1 PDF", display: "Open L1.pdf", url: "https://amit21686.github.io/NAV_Education/L1.pdf", image: "https://raw.githubusercontent.com/amit21686/NAV-Education/main/images/IMG_1780160480030.jpg" }
  ];

  const timerConfig = { easy: 90, normal: 60, hard: 30 };

  // =============================================
  // APP STATE
  // =============================================
  let state = {
    currentView: 'subjectSelection',
    professionalProfile: {
      personalInfo: { fullName: localStorage.getItem('studentName') || '', email: '', phone: '', dateOfBirth: '', bio: 'Dedicated student.' },
      academicInfo: { classGrade: '12th Grade', school: 'Delhi Public School', board: 'CBSE', rollNumber: '', academicYear: '2024-2025' },
      profilePhotoUrl: null
    },
    selectedSubject: null,
    selectedChapter: null,
    selectedMode: null,
    studentName: localStorage.getItem('studentName') || '',
    testAnswers: [],
    timerInterval: null,
    timerSecondsLeft: 0,
    testSubmitted: false,
    telegramMessageStatus: null,
    currentQuestionIndex: 0,
    darkMode: false,
    jsonQuestions: [],
    jsonNotes: "",
    timePerQuestion: 60,
    isLoading: false,
    navigationStack: ['subjectSelection'],
    questionTransition: null,
    questionDisplayMode: 'single',
    interactiveQuiz: {
      currentQuestion: 0, score: 0, answered: [],
      showExplanation: false, difficulty: 'normal',
      timerSecondsLeft: 0, timerInterval: null, questions: []
    },
    preloadedData: {}
  };

  const TELEGRAM_BOT_TOKEN = "7876285536:AAEdt1KLNJ_jW8fzbbiG7X_08sro2kzWnPk";
  const TELEGRAM_CHAT_ID = "6071885031";
  const app = document.getElementById('app');

  // =============================================
  // UTILITY FUNCTIONS
  // =============================================
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function getSelectedChapter() {
    const chapters = data[state.selectedSubject]?.chapters || [];
    return chapters.find(ch => ch.id === state.selectedChapter) || {};
  }

  function calculateTotalTime(questions) { return questions.length * state.timePerQuestion; }
  function getTimePerQuestionDisplay() { return Math.floor(state.timePerQuestion / 60) + ' min'; }

  function getSubjectIcon(subject) {
    const icons = { 'Biology': 'dna', 'Computer': 'laptop-code', 'STD 6th': 'graduation-cap' };
    return icons[subject] || 'book';
  }

  const timedTestChapters = {
    'Biology': [1,2,3,4,5,6],
    'Bharat Ratna MCQS': [1],
    'Computer': [1,2,3,4,5],
    'STD 6th': [1,2]
  };
  function isTimedTestAllowed() {
    return timedTestChapters[state.selectedSubject]?.includes(state.selectedChapter) || false;
  }

  // =============================================
  // JSON LOADING
  // =============================================
  async function tryLoadJsonQuestions(subject, chapter) {
    try {
      let key = subject.toLowerCase().replace(/\s+/g, '');
      if (subject === "STD 6th") key = "std6";
      const resp = await fetch(`/NAV_Education/questions_${key}_${chapter}.json`);
      if (resp.ok) {
        const json = await resp.json();
        return parseJsonQuestions(json);
      }
      return [];
    } catch (e) { return []; }
  }

  async function tryLoadJsonNotes(subject, chapter) {
    try {
      let key = subject.toLowerCase().replace(/\s+/g, '');
      if (subject === "STD 6th") key = "std6";
      const resp = await fetch(`/NAV_Education/notes_${key}_${chapter}.json`);
      if (resp.ok) return await resp.json();
      return "";
    } catch (e) { return ""; }
  }

  async function preloadChapterData(subject, chapters) {
    for (const ch of chapters) {
      const k = `${subject}_${ch.id}`;
      if (!state.preloadedData[k]) state.preloadedData[k] = { questions: [], notes: "", loaded: false };
      Promise.all([tryLoadJsonQuestions(subject, ch.id), tryLoadJsonNotes(subject, ch.id)])
        .then(([questions, notes]) => {
          state.preloadedData[k] = { questions, notes, loaded: true };
        });
    }
  }

  function getPreloadedQuestions() {
    const k = `${state.selectedSubject}_${state.selectedChapter}`;
    return state.preloadedData[k]?.questions || [];
  }
  function getPreloadedNotes() {
    const k = `${state.selectedSubject}_${state.selectedChapter}`;
    return state.preloadedData[k]?.notes || "";
  }

  function parseJsonQuestions(jsonData) {
    const questions = [];
    const list = Array.isArray(jsonData) ? jsonData : jsonData.questions || [];
    list.forEach(item => {
      if (item.question && item.options && item.answer !== undefined) {
        questions.push({ question: item.question, image: item.image || null, table: item.table || null, options: item.options, answer: item.answer, explanation: item.explanation || "" });
      }
    });
    return questions;
  }

  function getCurrentQuizQuestions() {
    const preloaded = getPreloadedQuestions();
    return preloaded.length > 0 ? preloaded : state.jsonQuestions;
  }

  function getCurrentNotes() {
    return getPreloadedNotes() || state.jsonNotes || "No notes available.";
  }

  function renderQuizTable(tableData) {
    if (!tableData?.headers || !tableData?.rows) return '';
    return `<div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-600 my-2"><table class="min-w-full text-sm"><thead><tr>${tableData.headers.map(h => `<th class="px-3 py-2 bg-indigo-50 dark:bg-indigo-900 text-left text-xs font-medium text-indigo-600 dark:text-indigo-300">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${tableData.rows.map(row => `<tr class="border-t border-gray-100 dark:border-gray-700">${row.map(cell => `<td class="px-3 py-2 text-gray-700 dark:text-gray-300">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderQuizImage(imageUrl) {
    if (!imageUrl) return '';
    return `<div class="my-3 rounded-lg overflow-hidden"><img src="${imageUrl}" alt="Question image" class="w-full max-h-48 object-contain" onerror="this.style.display='none'"></div>`;
  }

  // =============================================
  // NOTES FORMATTING
  // =============================================
  function formatNotes(content) {
    if (!content) return '<p class="text-gray-500 dark:text-gray-400">No notes available.</p>';
    if (typeof content === 'object' && content.notes) return renderStructuredNotes(content.notes);
    if (typeof content === 'object') return renderStructuredNotes(content);
    return renderSimpleNotes(content);
  }

  function renderStructuredNotes(notes) {
    let html = '';
    const n = notes.notes || notes;
    if (n.title) html += `<h1 class="text-gray-900 dark:text-white">${escapeHtml(n.title)}</h1>`;
    if (n.description) html += `<p class="text-gray-700 dark:text-gray-300">${escapeHtml(n.description)}</p>`;
    if (n.sections) n.sections.forEach(s => { html += renderSection(s); });
    return html;
  }

  function renderSection(section) {
    switch(section.type) {
      case 'text': return `<p class="text-gray-700 dark:text-gray-300">${escapeHtml(section.content)}</p>`;
      case 'heading': return `<h3 class="text-gray-900 dark:text-white">${escapeHtml(section.content)}</h3>`;
      case 'list': return `<ul class="text-gray-700 dark:text-gray-300">${section.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      case 'definition': return `<div class="definition bg-blue-50 dark:bg-blue-900 border-l-4 border-indigo-500 p-3 rounded my-2"><strong class="text-indigo-700 dark:text-indigo-300">${escapeHtml(section.term)}:</strong> <span class="text-gray-700 dark:text-gray-300">${escapeHtml(section.meaning)}</span></div>`;
      case 'table': return renderTableSection(section);
      case 'image': return renderImageSection(section);
      default: return '';
    }
  }

  function renderTableSection(section) {
    return `<div class="overflow-x-auto my-3"><table class="min-w-full"><thead><tr>${section.headers.map(h => `<th class="text-gray-900 dark:text-white">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${section.rows.map(row => `<tr>${row.map(c => `<td class="text-gray-700 dark:text-gray-300">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function renderImageSection(section) {
    return `<div class="my-3"><img src="${section.url}" alt="${section.alt || ''}" class="rounded-lg max-w-full" /></div>`;
  }

  function renderSimpleNotes(content) {
    return content.replace(/\n/g, '<br>');
  }

  // =============================================
  // INTERACTIVE QUIZ HELPERS
  // =============================================
  function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  function initializeInteractiveQuiz(difficulty) {
    const originalQuestions = getCurrentQuizQuestions();
    let questions = [];
    switch(difficulty) {
      case 'easy': questions = [...originalQuestions]; break;
      case 'normal': questions = shuffleArray([...originalQuestions]); break;
      case 'hard': questions = shuffleArray([...originalQuestions]); break;
    }
    return { questions, currentQuestion: 0, score: 0, answered: [], showExplanation: false, difficulty, timerSecondsLeft: difficulty === 'hard' ? 60 : 0, timerInterval: null };
  }

  function startInteractiveQuizTimer() {
    if (state.interactiveQuiz.difficulty === 'hard' && state.interactiveQuiz.timerSecondsLeft > 0) {
      state.interactiveQuiz.timerInterval = setInterval(() => {
        state.interactiveQuiz.timerSecondsLeft--;
        const timerElement = document.getElementById('interactiveTimer');
        if (timerElement) timerElement.textContent = formatTime(state.interactiveQuiz.timerSecondsLeft);
        if (state.interactiveQuiz.timerSecondsLeft <= 0) {
          clearInterval(state.interactiveQuiz.timerInterval);
          state.interactiveQuiz.timerInterval = null;
          onInteractiveTimeUp();
        }
      }, 1000);
    }
  }

  function onInteractiveTimeUp() {
    const currentQ = state.interactiveQuiz.currentQuestion;
    if (state.interactiveQuiz.answered[currentQ] === undefined) {
      state.interactiveQuiz.answered[currentQ] = -1;
    }
    state.interactiveQuiz.showExplanation = true;
    render();
  }

  function clearInteractiveQuizTimer() {
    if (state.interactiveQuiz.timerInterval) {
      clearInterval(state.interactiveQuiz.timerInterval);
      state.interactiveQuiz.timerInterval = null;
    }
  }

  // =============================================
  // PROFILE & CROPPER
  // =============================================
  let cropperState = { imageData: null, originalImage: null, scale: 1, offsetX: 0, offsetY: 0, isDragging: false, startX: 0, startY: 0 };
  function openPhotoUpload() { document.getElementById('profilePhotoInput').click(); }
  window.openPhotoUpload = openPhotoUpload;
  function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { showToast('Image size must be < 5MB', 'error'); return; }
      const reader = new FileReader();
      reader.onload = function(e) { showImageCropperModal(e.target.result); };
      reader.readAsDataURL(file);
    }
  }
  window.handlePhotoUpload = handlePhotoUpload;
  function showImageCropperModal(imageData) {
    cropperState.imageData = imageData; cropperState.scale = 1; cropperState.offsetX = 0; cropperState.offsetY = 0;
    const modal = document.getElementById('imageCropperModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    loadImageInCropper();
    setTimeout(() => { initializeCropperDrag(); }, 100);
  }
  function loadImageInCropper() {
    const preview = document.getElementById('cropPreview');
    const img = new Image();
    img.onload = function() {
      cropperState.originalImage = img;
      const canvas = preview; const ctx = canvas.getContext('2d');
      canvas.width = 300; canvas.height = 300;
      const canvasSize = 300;
      const imgWidth = img.width, imgHeight = img.height;
      const imgAspect = imgWidth / imgHeight;
      let drawWidth, drawHeight;
      if (imgAspect > 1) { drawHeight = canvasSize; drawWidth = drawHeight * imgAspect; }
      else { drawWidth = canvasSize; drawHeight = drawWidth / imgAspect; }
      drawWidth *= cropperState.scale; drawHeight *= cropperState.scale;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.beginPath(); ctx.arc(150, 150, 150, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      const drawX = (canvasSize - drawWidth) / 2 + cropperState.offsetX;
      const drawY = (canvasSize - drawHeight) / 2 + cropperState.offsetY;
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      ctx.restore();
      ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(150, 150, 150, 0, Math.PI * 2); ctx.stroke();
    };
    img.src = cropperState.imageData;
  }
  window.updateCropperZoom = function(value) {
    cropperState.scale = parseFloat(value);
    document.getElementById('zoomValue').textContent = Math.round(cropperState.scale * 100) + '%';
    loadImageInCropper();
  };
  window.resetCropper = function() {
    cropperState.scale = 1; cropperState.offsetX = 0; cropperState.offsetY = 0;
    document.getElementById('zoomSlider').value = 1; document.getElementById('zoomValue').textContent = '100%';
    loadImageInCropper();
  };
  window.applyCrop = function() {
    const canvas = document.getElementById('cropPreview');
    const croppedImage = canvas.toDataURL('image/png');
    saveProfileImageToDB(dataURItoBlob(croppedImage)).then(() => {
      state.professionalProfile.profilePhotoUrl = croppedImage;
      updateTopBarLogo();
      closeImageCropperModal();
      renderProfessionalProfileView();
      showToast('Profile photo updated!', 'success');
    });
  };
  function closeImageCropperModal() {
    const modal = document.getElementById('imageCropperModal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
    document.getElementById('profilePhotoInput').value = '';
  }
  window.closeImageCropperModal = closeImageCropperModal;
  function initializeCropperDrag() {
    const canvas = document.getElementById('cropPreview');
    if (!canvas) return;
    canvas.addEventListener('mousedown', (e) => {
      cropperState.isDragging = true;
      const rect = canvas.getBoundingClientRect();
      cropperState.startX = e.clientX - rect.left - cropperState.offsetX;
      cropperState.startY = e.clientY - rect.top - cropperState.offsetY;
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('mousemove', (e) => {
      if (cropperState.isDragging) {
        const rect = canvas.getBoundingClientRect();
        cropperState.offsetX = e.clientX - rect.left - cropperState.startX;
        cropperState.offsetY = e.clientY - rect.top - cropperState.startY;
        loadImageInCropper();
      }
    });
    canvas.addEventListener('mouseup', () => { cropperState.isDragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('mouseleave', () => { cropperState.isDragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      cropperState.isDragging = true;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      cropperState.startX = touch.clientX - rect.left - cropperState.offsetX;
      cropperState.startY = touch.clientY - rect.top - cropperState.offsetY;
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (cropperState.isDragging) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        cropperState.offsetX = touch.clientX - rect.left - cropperState.startX;
        cropperState.offsetY = touch.clientY - rect.top - cropperState.startY;
        loadImageInCropper();
      }
    });
    canvas.addEventListener('touchend', () => { cropperState.isDragging = false; });
  }

  const PROFILE_DB_NAME = 'NAVProfileDB';
  const PROFILE_STORE_NAME = 'profile';
  function openProfileDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(PROFILE_DB_NAME, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(PROFILE_STORE_NAME)) {
          db.createObjectStore(PROFILE_STORE_NAME);
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }
  async function saveProfileImageToDB(blob) {
    const db = await openProfileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROFILE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PROFILE_STORE_NAME);
      const req = store.put(blob, 'profileImage');
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }
  async function loadProfileImageFromDB() {
    const db = await openProfileDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROFILE_STORE_NAME, 'readonly');
      const store = tx.objectStore(PROFILE_STORE_NAME);
      const req = store.get('profileImage');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }
  function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
    return new Blob([ab], { type: mimeString });
  }

  async function initProfileImage() {
    const blob = await loadProfileImageFromDB();
    if (blob) {
      const url = URL.createObjectURL(blob);
      state.professionalProfile.profilePhotoUrl = url;
      updateTopBarLogo();
    }
  }

  function loadProfessionalProfile() {
    const saved = localStorage.getItem('navProfessionalProfile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const { profilePhotoUrl, ...rest } = parsed;
        state.professionalProfile = { ...state.professionalProfile, ...rest };
      } catch(e) {}
    }
  }

  function saveProfessionalProfile() {
    const { profilePhotoUrl, ...saveData } = state.professionalProfile;
    localStorage.setItem('navProfessionalProfile', JSON.stringify(saveData));
    updateTopBarLogo();
  }

  function updateTopBarLogo() {
    const logoEl = document.getElementById('topBarLogoProfile');
    if (!logoEl) return;
    const url = state.professionalProfile.profilePhotoUrl;
    if (url) {
      logoEl.innerHTML = `<img src="${url}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      logoEl.innerHTML = `<div class="w-full h-full bg-white/20 flex items-center justify-center rounded-full"><i class="fas fa-user text-white text-sm"></i></div>`;
    }
  }

  function updateTopBarStudentName() {
    const pill = document.getElementById('topBarStudentName');
    if (!pill) return;
    if (state.studentName && state.studentName.trim()) {
      pill.classList.remove('hidden');
      pill.textContent = state.studentName;
    } else pill.classList.add('hidden');
  }

  // =============================================
  // FULL PROFILE VIEW (restored with editing and cache)
  // =============================================
  function renderProfessionalProfileView() {
    loadProfessionalProfile();
    const p = state.professionalProfile;
    app.innerHTML = `
      <div class="space-y-4">
        <h2 class="text-xl font-bold text-gray-800 dark:text-white">Professional Profile</h2>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm text-center">
          <div class="w-20 h-20 rounded-full overflow-hidden mx-auto bg-gray-200 dark:bg-gray-600">
            ${p.profilePhotoUrl ? `<img src="${p.profilePhotoUrl}" class="w-full h-full object-cover" alt="Profile">` : `<i class="fas fa-user text-4xl text-gray-400 dark:text-gray-500 mt-4"></i>`}
          </div>
          <button onclick="openPhotoUpload()" class="mt-2 text-sm text-indigo-600 dark:text-indigo-400">Change Photo</button>
          <div class="mt-2 font-semibold text-gray-800 dark:text-white">${p.personalInfo.fullName || 'Student'}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${p.academicInfo.classGrade} • ${p.academicInfo.school}</div>
          <div class="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div class="text-center"><div class="text-lg font-bold text-indigo-600 dark:text-indigo-400">${performanceState.globalStats.totalQuizzes || 0}</div><div class="text-xs text-gray-500 dark:text-gray-400">Quizzes</div></div>
            <div class="text-center"><div class="text-lg font-bold text-green-600 dark:text-green-400">${Math.round(performanceState.globalStats.averageScore) || 0}%</div><div class="text-xs text-gray-500 dark:text-gray-400">Average</div></div>
            <div class="text-center"><div class="text-lg font-bold text-purple-600 dark:text-purple-400">${Object.keys(performanceState.bestScores).length || 0}</div><div class="text-xs text-gray-500 dark:text-gray-400">Chapters</div></div>
          </div>
        </div>

        <!-- Personal Information Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800 dark:text-white"><i class="fas fa-user-circle text-indigo-500 mr-2"></i>Personal Information</h3>
            <button onclick="toggleEditMode('personalInfo')" class="text-sm text-indigo-600 dark:text-indigo-400"><i class="fas fa-edit mr-1"></i>Edit</button>
          </div>
          <div id="personalInfoView" class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-500 dark:text-gray-400">Full Name</span><p class="font-medium text-gray-800 dark:text-white">${p.personalInfo.fullName || '—'}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">Email</span><p class="font-medium text-gray-800 dark:text-white">${p.personalInfo.email || '—'}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">Phone</span><p class="font-medium text-gray-800 dark:text-white">${p.personalInfo.phone || '—'}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">Date of Birth</span><p class="font-medium text-gray-800 dark:text-white">${p.personalInfo.dateOfBirth || '—'}</p></div>
            <div class="col-span-2"><span class="text-gray-500 dark:text-gray-400">Bio</span><p class="font-medium text-gray-800 dark:text-white">${p.personalInfo.bio}</p></div>
          </div>
          <div id="personalInfoEdit" class="hidden">
            <form onsubmit="savePersonalInfo(event)" class="grid grid-cols-2 gap-3 text-sm">
              <div><label class="block text-gray-700 dark:text-gray-300 mb-1">Full Name</label><input type="text" name="fullName" value="${p.personalInfo.fullName}" class="w-full p-2 rounded-lg border dark:bg-slate-700 dark:border-gray-600"></div>
              <div><label class="block text-gray-700 dark:text-gray-300 mb-1">Email</label><input type="email" name="email" value="${p.personalInfo.email}" class="w-full p-2 rounded-lg border dark:bg-slate-700 dark:border-gray-600"></div>
              <div><label class="block text-gray-700 dark:text-gray-300 mb-1">Phone</label><input type="tel" name="phone" value="${p.personalInfo.phone}" class="w-full p-2 rounded-lg border dark:bg-slate-700 dark:border-gray-600"></div>
              <div><label class="block text-gray-700 dark:text-gray-300 mb-1">Date of Birth</label><input type="date" name="dateOfBirth" value="${p.personalInfo.dateOfBirth}" class="w-full p-2 rounded-lg border dark:bg-slate-700 dark:border-gray-600"></div>
              <div class="col-span-2"><label class="block text-gray-700 dark:text-gray-300 mb-1">Bio</label><textarea name="bio" class="w-full p-2 rounded-lg border dark:bg-slate-700 dark:border-gray-600">${p.personalInfo.bio}</textarea></div>
              <div class="col-span-2 flex justify-end gap-2">
                <button type="button" onclick="toggleEditMode('personalInfo')" class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm">Cancel</button>
                <button type="submit" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Academic Information Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-gray-800 dark:text-white"><i class="fas fa-graduation-cap text-green-500 mr-2"></i>Academic Information</h3>
            <button onclick="toggleEditMode('academicInfo')" class="text-sm text-indigo-600 dark:text-indigo-400"><i class="fas fa-edit mr-1"></i>Edit</button>
          </div>
          <div id="academicInfoView" class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-500 dark:text-gray-400">Class/Grade</span><p class="font-medium text-gray-800 dark:text-white">${p.academicInfo.classGrade}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">School</span><p class="font-medium text-gray-800 dark:text-white">${p.academicInfo.school}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">Board</span><p class="font-medium text-gray-800 dark:text-white">${p.academicInfo.board}</p></div>
            <div><span class="text-gray-500 dark:text-gray-400">Academic Year</span><p class="font-medium text-gray-800 dark:text-white">${p.academicInfo.academicYear}</p></div>
          </div>
          <div id="academicInfoEdit" class="hidden">
            <form onsubmit="saveAcademicInfo(event)" class="grid grid-cols-2 gap-3 text-sm">
              <div><label class="block text-gray-700 dark:text-gray-300">Class/Grade</label><select name="classGrade" class="w-full p-2 rounded-lg border dark:bg-slate-700">${['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th','11th','12th'].map(g => `<option ${p.academicInfo.classGrade.includes(g) ? 'selected' : ''}>${g} Grade</option>`).join('')}</select></div>
              <div><label class="block text-gray-700 dark:text-gray-300">School</label><input type="text" name="school" value="${p.academicInfo.school}" class="w-full p-2 rounded-lg border dark:bg-slate-700"></div>
              <div><label class="block text-gray-700 dark:text-gray-300">Board</label><select name="board" class="w-full p-2 rounded-lg border dark:bg-slate-700"><option ${p.academicInfo.board === 'CBSE' ? 'selected' : ''}>CBSE</option><option ${p.academicInfo.board === 'ICSE' ? 'selected' : ''}>ICSE</option><option ${p.academicInfo.board === 'State Board' ? 'selected' : ''}>State Board</option><option ${p.academicInfo.board === 'IB' ? 'selected' : ''}>IB</option></select></div>
              <div><label class="block text-gray-700 dark:text-gray-300">Academic Year</label><input type="text" name="academicYear" value="${p.academicInfo.academicYear}" class="w-full p-2 rounded-lg border dark:bg-slate-700"></div>
              <div class="col-span-2 flex justify-end gap-2">
                <button type="button" onclick="toggleEditMode('academicInfo')" class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm">Cancel</button>
                <button type="submit" class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>

        <!-- Cache Settings Card -->
        <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
          <h3 class="font-semibold text-gray-800 dark:text-white mb-3"><i class="fas fa-database text-purple-500 mr-2"></i>Cache & Data</h3>
          <div id="cacheInfoCard" class="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 mb-3">Loading cache info...</div>
          <div class="flex flex-wrap gap-2">
            <button onclick="refreshCacheInfo()" class="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm"><i class="fas fa-sync-alt mr-1"></i>Refresh Info</button>
            <button onclick="clearUserCache()" class="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-sm"><i class="fas fa-trash mr-1"></i>Clear Cache</button>
            <button onclick="showCacheManagementModal()" class="px-3 py-1.5 rounded-lg bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 text-sm"><i class="fas fa-list mr-1"></i>Manage Cache</button>
          </div>
        </div>
      </div>`;
    setTimeout(refreshCacheInfo, 500);
  }

  window.toggleEditMode = function(section) {
    const viewEl = document.getElementById(section + 'View');
    const editEl = document.getElementById(section + 'Edit');
    if (viewEl && editEl) {
      viewEl.classList.toggle('hidden');
      editEl.classList.toggle('hidden');
    }
  };

  window.savePersonalInfo = function(e) {
    e.preventDefault();
    const form = e.target;
    state.professionalProfile.personalInfo = {
      fullName: form.fullName.value,
      email: form.email.value,
      phone: form.phone.value,
      dateOfBirth: form.dateOfBirth.value,
      bio: form.bio.value
    };
    localStorage.setItem('studentName', form.fullName.value);
    state.studentName = form.fullName.value;
    saveProfessionalProfile();
    toggleEditMode('personalInfo');
    renderProfessionalProfileView();
    showToast('Personal info saved!', 'success');
  };

  window.saveAcademicInfo = function(e) {
    e.preventDefault();
    const form = e.target;
    state.professionalProfile.academicInfo = {
      classGrade: form.classGrade.value,
      school: form.school.value,
      board: form.board.value,
      rollNumber: form.rollNumber?.value || '',
      academicYear: form.academicYear.value
    };
    saveProfessionalProfile();
    toggleEditMode('academicInfo');
    renderProfessionalProfileView();
    showToast('Academic info saved!', 'success');
  };

  // =============================================
  // SEARCH (fully working)
  // =============================================
  function buildSearchIndex() {
    const index = [];
    for (const [subject, subjObj] of Object.entries(data)) {
      index.push({ type: 'Subject', subject, content: subject, display: `Subject: <b>${subject}</b>`, ref: { subject } });
      for (const chapter of subjObj.chapters) {
        index.push({ type: 'Chapter', subject, chapter: chapter.title, content: chapter.title, display: `Chapter: <b>${chapter.title}</b> <i>in ${subject}</i>`, ref: { subject, chapterId: chapter.id } });
      }
    }
    for (const item of extraSubjects) {
      index.push({ type: item.type, subject: item.name, content: item.name + " " + item.display, display: `Special: <b>${item.display}</b>`, url: item.url });
    }
    return index;
  }

  const searchIndex = buildSearchIndex();

  function performSearch(query) {
    query = query.trim().toLowerCase();
    if (!query) return [];
    return searchIndex.filter(item => item.content.toLowerCase().includes(query));
  }

  function highlightQuery(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return text.replace(re, '<mark>$1</mark>');
  }

  function initializeSearch() {
    const searchInput = document.getElementById('globalSearchInput');
    const resultsDiv = document.getElementById('globalSearchResults');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        const query = e.target.value;
        const results = performSearch(query);
        if (query && results.length) {
          resultsDiv.innerHTML = results.slice(0, 20).map(item => `
            <div class="p-3 text-sm border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
              ${item.url ? `onclick="window.location.href='${item.url}'"` : `onclick="onSearchResultClick('${item.subject}', ${item.ref?.chapterId || 1}, '${item.type}')"`}>
              <div class="text-gray-700 dark:text-gray-300">${highlightQuery(item.display, query)}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">${item.type}</div>
            </div>`).join('');
          resultsDiv.classList.remove('hidden');
        } else if (query) {
          resultsDiv.innerHTML = `<div class="p-3 text-gray-500 dark:text-gray-400 text-sm">No results found.</div>`;
          resultsDiv.classList.remove('hidden');
        } else {
          resultsDiv.innerHTML = '';
          resultsDiv.classList.add('hidden');
        }
      });
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#globalSearchForm') && !e.target.closest('#globalSearchResults')) {
        if (resultsDiv) resultsDiv.classList.add('hidden');
      }
    });
  }
// =============================================
// REDESIGNED RENDER FUNCTIONS (mobile-first, dark mode fixed, banner restored)
// =============================================
function renderSubjectSelection() {
  app.innerHTML = `
    <div class="space-y-4">
      <!-- BANNER (restored with static image and GIF) -->
      <div class="w-full max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div class="banner-container relative w-full">
          <img class="banner-image banner-static w-full h-auto block rounded-t-xl" 
               src="https://iili.io/K1fpl5J.md.png" alt="NAV Education Banner"
               onload="console.log('Static image loaded')" />
          <img class="banner-image banner-gif absolute top-0 left-0 w-full h-auto opacity-0 transition-opacity duration-1000" 
               src="https://amit21686.github.io/NAV_Education/images/Nav.gif.gif" 
               alt="NAV Animation" 
               onload="initBannerTransition()" 
               onerror="console.log('GIF failed')" />
        </div>
      </div>

      <!-- Welcome Text -->
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-800 dark:text-white">NAV Education</h1>
        <p class="text-gray-500 dark:text-gray-400 text-sm">Chapter-wise learning</p>
        ${state.studentName ? `<p class="text-indigo-600 dark:text-indigo-400 text-xs mt-1">Welcome back, ${state.studentName}!</p>` : ''}
      </div>

      <!-- Search Bar -->
      <div class="relative">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
        <input id="globalSearchInput" type="text" placeholder="Search subjects, chapters..." 
               class="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500">
        <div id="globalSearchResults" class="absolute top-full mt-1 w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 max-h-48 overflow-y-auto hidden z-10"></div>
      </div>

      <!-- Subject Grid (card style, 2 columns on mobile) -->
      <h2 class="text-lg font-semibold text-gray-800 dark:text-white">Select Subject</h2>
      <div class="grid grid-cols-2 gap-3">
        ${Object.keys(data).map(subject => `
          <button onclick="onSubjectSelect('${subject}')" 
                  class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition text-center">
            <div class="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center mb-2">
              <i class="fas fa-${getSubjectIcon(subject)} text-indigo-600 dark:text-indigo-400 text-xl"></i>
            </div>
            <span class="font-semibold text-gray-800 dark:text-white text-sm">${subject}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">${data[subject].chapters.length} chapters</span>
          </button>`).join('')}

        <!-- Extra subjects with custom images and proper links (no onclick loading) -->
        ${extraSubjects.map(item => `
          <a href="${item.url}" target="_blank" rel="noopener"
             class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition text-center">
            <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-2">
              ${item.image 
                ? `<img src="${item.image}" alt="${item.display}" class="w-full h-full object-cover" loading="eager" />`
                : `<i class="fas fa-external-link-alt text-blue-600 dark:text-blue-400 text-xl"></i>`
              }
            </div>
            <span class="font-semibold text-gray-800 dark:text-white text-xs">${item.display}</span>
            <span class="text-[10px] text-gray-500 dark:text-gray-400">${item.type}</span>
          </a>`).join('')}
      </div>
    </div>`;
  initializeSearch();
}

function renderChapterList() {
  const chapters = data[state.selectedSubject]?.chapters || [];
  preloadChapterData(state.selectedSubject, chapters);
  app.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <button onclick="onBackToSubjects()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">${state.selectedSubject}</h2>
      </div>
      <div class="grid gap-2">
        ${chapters.map(ch => {
          const key = `${state.selectedSubject}_${ch.id}`;
          const bestScore = performanceState.bestScores[key];
          return `
            <button onclick="onChapterSelect(${ch.id})" class="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition">
              <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400 w-6">${ch.id}</span>
              <div class="flex-1 text-left">
                <div class="text-sm font-medium text-gray-800 dark:text-white">${ch.title}</div>
                ${bestScore ? `<div class="text-xs text-green-600 dark:text-green-400">Best: ${Math.round(bestScore)}%</div>` : ''}
              </div>
              <i class="fas fa-chevron-right text-gray-400 dark:text-gray-500"></i>
            </button>`;
        }).join('')}
      </div>
    </div>`;
}

function renderChapterOptions() {
  const chapter = getSelectedChapter();
  const key = `${state.selectedSubject}_${state.selectedChapter}`;
  const bestScore = performanceState.bestScores[key];
  app.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <button onclick="onBackToChapters()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">${chapter.title}</h2>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button onclick="onStudyNotes()" class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition">
          <i class="fas fa-book-open text-2xl text-green-600 mb-2"></i>
          <span class="text-sm font-medium text-gray-800 dark:text-white">Study Notes</span>
        </button>
        <button onclick="onPracticeQuiz()" class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition">
          <i class="fas fa-question-circle text-2xl text-amber-600 mb-2"></i>
          <span class="text-sm font-medium text-gray-800 dark:text-white">Practice Quiz</span>
        </button>
        <button onclick="onViewPerformance()" class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition">
          <i class="fas fa-chart-line text-2xl text-purple-600 mb-2"></i>
          <span class="text-sm font-medium text-gray-800 dark:text-white">Performance</span>
        </button>
        <button onclick="onViewAchievements()" class="flex flex-col items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm active:scale-[0.98] transition">
          <i class="fas fa-trophy text-2xl text-yellow-600 mb-2"></i>
          <span class="text-sm font-medium text-gray-800 dark:text-white">Achievements</span>
        </button>
      </div>
      ${bestScore ? `<div class="p-3 bg-white dark:bg-slate-800 rounded-xl text-sm text-gray-800 dark:text-white">Best Score: <span class="font-bold text-green-600 dark:text-green-400">${Math.round(bestScore)}%</span></div>` : ''}
    </div>`;
}

function renderNotesView() {
  const notes = getCurrentNotes();
  const formatted = formatNotes(notes);
  app.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <button onclick="onBackFromNotes()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">${getSelectedChapter().title}</h2>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-4 notes-content text-sm text-gray-800 dark:text-gray-200">
        ${formatted}
      </div>
    </div>`;
}

function renderQuizModeSelection() {
  const questions = getCurrentQuizQuestions();
  app.innerHTML = `
    <div class="space-y-3 max-w-md mx-auto">
      <div class="flex items-center gap-2">
        <button onclick="onBackToChapterOptions()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">Chapter Quiz</h2>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-3 text-sm text-gray-800 dark:text-white">${questions.length} questions loaded</div>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-4">
        <input id="studentName" value="${state.studentName}" placeholder="Your name" class="w-full p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm mb-3">
        <div class="flex gap-3 mb-3">
          <select id="testDifficulty" class="flex-1 p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white text-sm">
            <option value="easy">Easy</option>
            <option value="normal" selected>Normal</option>
            <option value="hard">Hard</option>
          </select>
          <select id="questionDisplayMode" class="flex-1 p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-white text-sm">
            <option value="single">Single</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="flex gap-2">
          <label class="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer text-sm text-gray-800 dark:text-white">
            <input type="radio" name="quizMode" value="practice" checked class="mr-2"> Practice
          </label>
          <label class="flex items-center p-2 border border-gray-200 dark:border-gray-600 rounded-lg cursor-pointer text-sm text-gray-800 dark:text-white" ${isTimedTestAllowed() ? '' : 'style="opacity:0.5;pointer-events:none"'}>
            <input type="radio" name="quizMode" value="timed" ${isTimedTestAllowed() ? '' : 'disabled'} class="mr-2"> Timed
          </label>
        </div>
        <button onclick="onStartQuiz()" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm mt-3 active:scale-[0.98] transition">Start Quiz</button>
      </div>
    </div>`;
  const diffSel = document.getElementById('testDifficulty');
  if (diffSel) diffSel.addEventListener('change', function() {
    state.timePerQuestion = timerConfig[this.value] || 60;
  });
}

// Practice Mode Flashcards
function renderPracticeModeFlashcards() {
  const questions = getCurrentQuizQuestions();
  if (questions.length === 0) {
    return app.innerHTML = `<div class="text-center py-10 text-gray-500 dark:text-gray-400">No questions available for this chapter.</div>`;
  }
  const showAll = state.questionDisplayMode === 'all';
  app.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <button onclick="onBackToQuizModeSelection()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">Practice</h2>
        <span class="ml-auto text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">${state.questionDisplayMode === 'all' ? 'All' : 'Single'}</span>
        <button onclick="toggleQuestionDisplayMode()" class="text-xs text-indigo-600 dark:text-indigo-400 underline">Switch</button>
      </div>
      ${showAll ? renderAllQuestionsAtOnce(questions) : renderSingleQuestionMode(questions)}
    </div>`;
}

function renderAllQuestionsAtOnce(questions) {
  return `<div class="space-y-4">${questions.map((q, i) => `
    <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
      <div class="flex items-start gap-3">
        <span class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">${i+1}</span>
        <div class="flex-1">
          <p class="font-semibold text-gray-800 dark:text-white text-sm">${q.question}</p>
          ${q.image ? renderQuizImage(q.image) : ''}
          ${q.table ? renderQuizTable(q.table) : ''}
          <ul class="mt-2 space-y-1">
            ${q.options.map((opt, idx) => `<li class="flex items-center gap-2 text-sm ${idx === q.answer ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-600 dark:text-gray-400'}">
              <span class="w-5 h-5 rounded-full border ${idx === q.answer ? 'border-green-500 bg-green-50 dark:bg-green-900' : 'border-gray-300 dark:border-gray-600'} flex items-center justify-center text-xs">${String.fromCharCode(65+idx)}</span> ${opt} ${idx === q.answer ? '<i class="fas fa-check ml-1 text-xs"></i>' : ''}
            </li>`).join('')}
          </ul>
          ${q.explanation ? `<p class="mt-2 text-xs text-blue-600 dark:text-blue-400"><i class="fas fa-lightbulb mr-1"></i>${q.explanation}</p>` : ''}
        </div>
      </div>
    </div>`).join('')}</div>`;
}

function renderSingleQuestionMode(questions) {
  const q = questions[state.currentQuestionIndex];
  if (!q) return '';
  return `
    <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs text-gray-500 dark:text-gray-400">${state.currentQuestionIndex+1}/${questions.length}</span>
        <div class="flex gap-1">
          <button onclick="prevQuestion()" ${state.currentQuestionIndex===0?'disabled':''} class="p-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"><i class="fas fa-chevron-left"></i></button>
          <button onclick="nextQuestion()" ${state.currentQuestionIndex===questions.length-1?'disabled':''} class="p-1 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"><i class="fas fa-chevron-right"></i></button>
        </div>
      </div>
      <p class="font-semibold text-gray-800 dark:text-white">${q.question}</p>
      ${q.image ? renderQuizImage(q.image) : ''}
      ${q.table ? renderQuizTable(q.table) : ''}
      <ul class="mt-3 space-y-2">
        ${q.options.map((opt, idx) => `<li class="flex items-center gap-2 p-2 rounded-lg ${idx === q.answer ? 'bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-600'} text-sm">
          <span class="font-bold w-6">${String.fromCharCode(65+idx)}.</span> ${opt} ${idx === q.answer ? '<i class="fas fa-check ml-auto text-green-600"></i>' : ''}
        </li>`).join('')}
      </ul>
      ${q.explanation ? `<p class="mt-3 text-xs text-blue-600 dark:text-blue-400"><i class="fas fa-lightbulb mr-1"></i>${q.explanation}</p>` : ''}
    </div>`;
}

// =============================================
// INTERACTIVE QUIZ (mobile-friendly, dark mode text fixed)
// =============================================
function renderInteractiveQuiz() {
  const questions = state.interactiveQuiz.questions;
  if (questions.length === 0) {
    return app.innerHTML = `<div class="text-center py-10 text-gray-500 dark:text-gray-400">No questions available.</div>`;
  }

  if (state.questionDisplayMode === 'all') {
    let html = `<div class="space-y-4"><div class="flex items-center gap-2">
      <button onclick="onBackToQuizModeSelection()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
      <h2 class="text-lg font-bold text-gray-800 dark:text-white">Interactive Quiz</h2>
      <span class="ml-auto text-sm font-bold text-indigo-600 dark:text-indigo-400">${state.interactiveQuiz.score}/${questions.length}</span>
    </div>`;
    questions.forEach((q, idx) => {
      const isAnswered = state.interactiveQuiz.answered[idx] !== undefined;
      const userAns = state.interactiveQuiz.answered[idx];
      html += `<div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
        <div class="flex items-start gap-3">
          <span class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">${idx+1}</span>
          <div class="flex-1">
            <p class="font-semibold text-gray-800 dark:text-white text-sm">${q.question}</p>
            ${q.image ? renderQuizImage(q.image) : ''}
            ${q.table ? renderQuizTable(q.table) : ''}
            <div class="mt-2 space-y-1">
              ${q.options.map((opt, oi) => {
                let cls = "flex items-center gap-2 p-2 rounded-lg text-sm";
                if (isAnswered) {
                  if (oi === q.answer) cls += " bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300";
                  else if (oi === userAns && oi !== q.answer) cls += " bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300";
                  else cls += " bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
                } else if (oi === userAns) {
                  cls += " bg-indigo-50 dark:bg-indigo-900 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300";
                } else {
                  cls += " bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600";
                }
                return `<div class="${cls}" onclick="onAnswerSelect(${oi}, ${idx})">
                  <span class="font-bold w-6">${String.fromCharCode(65+oi)}.</span> ${opt}
                  ${isAnswered && oi === q.answer ? '<i class="fas fa-check ml-auto text-green-600"></i>' : ''}
                  ${isAnswered && oi === userAns && oi !== q.answer ? '<i class="fas fa-times ml-auto text-red-600"></i>' : ''}
                </div>`;
              }).join('')}
            </div>
            ${isAnswered && q.explanation ? `<p class="mt-2 text-xs text-blue-600 dark:text-blue-400"><i class="fas fa-lightbulb mr-1"></i>${q.explanation}</p>` : ''}
          </div>
        </div>
      </div>`;
    });
    html += `<button onclick="onFinishInteractiveQuiz()" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm mt-4">Finish Quiz & View Score</button></div>`;
    app.innerHTML = html;
    return;
  }

  // Single question mode
  const qIndex = state.interactiveQuiz.currentQuestion;
  const question = questions[qIndex];
  const isAnswered = state.interactiveQuiz.answered[qIndex] !== undefined;
  const userAns = state.interactiveQuiz.answered[qIndex];

  const timerDisplay = state.interactiveQuiz.difficulty === 'hard' && !isAnswered ?
    `<div id="interactiveTimer" class="fixed top-16 right-3 z-40 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold">${formatTime(state.interactiveQuiz.timerSecondsLeft)}</div>` : '';

  app.innerHTML = `
    <div class="space-y-4">
      ${timerDisplay}
      <div class="flex items-center gap-2">
        <button onclick="onBackToQuizModeSelection()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">Quiz</h2>
        <div class="ml-auto flex gap-2">
          <span class="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-medium">${qIndex+1}/${questions.length}</span>
          <span class="bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-xs font-medium">${state.interactiveQuiz.score}</span>
        </div>
      </div>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
        <p class="font-semibold text-gray-800 dark:text-white text-sm">${question.question}</p>
        ${question.image ? renderQuizImage(question.image) : ''}
        ${question.table ? renderQuizTable(question.table) : ''}
        <div class="mt-3 space-y-2">
          ${question.options.map((opt, oi) => {
            let cls = "flex items-center gap-2 p-3 rounded-lg text-sm active:scale-[0.98] transition";
            if (isAnswered) {
              if (oi === question.answer) cls += " bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300";
              else if (oi === userAns && oi !== question.answer) cls += " bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300";
              else cls += " bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-500";
            } else if (oi === userAns) {
              cls += " bg-indigo-50 dark:bg-indigo-900 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300";
            } else {
              cls += " bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer";
            }
            return `<div class="${cls}" ${!isAnswered ? `onclick="onAnswerSelect(${oi})"` : ''}>
              <span class="font-bold w-6">${String.fromCharCode(65+oi)}.</span> ${opt}
              ${isAnswered && oi === question.answer ? '<i class="fas fa-check ml-auto text-green-600"></i>' : ''}
              ${isAnswered && oi === userAns && oi !== question.answer ? '<i class="fas fa-times ml-auto text-red-600"></i>' : ''}
            </div>`;
          }).join('')}
        </div>
        ${isAnswered && question.explanation ? `<p class="mt-3 text-xs text-blue-600 dark:text-blue-400"><i class="fas fa-lightbulb mr-1"></i>${question.explanation}</p>` : ''}
      </div>
      <div class="flex justify-between">
        <button onclick="onPrevInteractiveQuestion()" ${qIndex === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">Prev</button>
        ${isAnswered ? `<button onclick="onNextInteractiveQuestion()" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">${qIndex < questions.length-1 ? 'Next' : 'Finish'}</button>` : `<div class="px-4 py-2 rounded-lg bg-gray-300 dark:bg-gray-600 text-gray-500 text-sm">Select an answer</div>`}
      </div>
    </div>`;

  if (state.interactiveQuiz.difficulty === 'hard' && !isAnswered && !state.interactiveQuiz.timerInterval) {
    startInteractiveQuizTimer();
  }
}

// =============================================
// TIMED TEST VIEW (dark mode text fixed)
// =============================================
function renderTimedTest() {
  if (state.testSubmitted) { renderTestResults(); return; }
  const questions = getCurrentQuizQuestions();
  if (questions.length === 0) return app.innerHTML = `<div class="text-center py-10 text-gray-500 dark:text-gray-400">No questions available.</div>`;

  const qIndex = state.currentQuestionIndex ?? 0;
  const question = questions[qIndex];
  const progress = ((qIndex + 1) / questions.length) * 100;

  app.innerHTML = `
    <div class="space-y-4 max-w-2xl mx-auto">
      <div class="flex justify-between items-center">
        <button onclick="onAbortTest()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-times"></i></button>
        <div class="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-sm font-bold" id="timerDisplay">${formatTime(state.timerSecondsLeft)}</div>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div class="bg-indigo-600 h-2 rounded-full" style="width:${progress}%"></div></div>
      <div class="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm">
        <p class="font-semibold text-gray-800 dark:text-white mb-3">${question.question}</p>
        ${question.image ? renderQuizImage(question.image) : ''}
        ${question.table ? renderQuizTable(question.table) : ''}
        <div class="space-y-2">
          ${question.options.map((opt, idx) => `
            <label class="flex items-center p-3 rounded-lg border ${state.testAnswers[qIndex] === idx ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900' : 'border-gray-200 dark:border-gray-600'} active:scale-[0.98] transition text-sm text-gray-800 dark:text-white">
              <input type="radio" name="answer" value="${idx}" ${state.testAnswers[qIndex] === idx ? 'checked' : ''} class="mr-3">
              ${opt}
            </label>`).join('')}
        </div>
      </div>
      <div class="flex justify-between">
        <button onclick="onPrevQuestion()" ${qIndex === 0 ? 'disabled' : ''} class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">Prev</button>
        ${qIndex < questions.length-1
          ? `<button onclick="onNextQuestion()" class="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm">Next</button>`
          : `<button onclick="onSubmitTest()" class="px-4 py-2 rounded-lg bg-green-600 text-white text-sm">Submit</button>`}
      </div>
    </div>`;

  const form = document.querySelector('#quizForm');
  if (form) form.addEventListener('change', e => {
    if (e.target.name === 'answer') state.testAnswers[qIndex] = parseInt(e.target.value);
  });

  if (!state.timerInterval) {
    state.timerInterval = setInterval(() => {
      state.timerSecondsLeft--;
      const disp = document.getElementById('timerDisplay');
      if (disp) disp.textContent = formatTime(state.timerSecondsLeft);
      if (state.timerSecondsLeft <= 0) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
        onSubmitTest(true);
      }
    }, 1000);
  }
}

// =============================================
// TEST RESULTS (dark mode text fixed)
// =============================================
function renderTestResults() {
  const questions = getCurrentQuizQuestions();
  const score = calculateScore();
  const percentage = ((score / questions.length) * 100).toFixed(2);
  app.innerHTML = `
    <div class="max-w-sm mx-auto space-y-4">
      <div class="bg-white dark:bg-slate-800 rounded-2xl p-5 text-center shadow-sm">
        <h2 class="text-xl font-bold text-gray-800 dark:text-white">Your Score</h2>
        <div class="text-4xl font-bold text-indigo-600 dark:text-indigo-400 my-2">${score}/${questions.length}</div>
        <div class="text-sm text-gray-500 dark:text-gray-400">${percentage}%</div>
        <div class="grid grid-cols-2 gap-3 mt-4">
          <button onclick="onViewPerformanceFromResults()" class="py-2 bg-indigo-50 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm">Performance</button>
          <button onclick="onReturnToSubjects()" class="py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm">Home</button>
        </div>
      </div>
    </div>`;
}

// =============================================
// PERFORMANCE & ACHIEVEMENTS (dark mode text fixed)
// =============================================
function renderPerformanceView() {
  const key = `${state.selectedSubject}_${state.selectedChapter}`;
  const bestScore = performanceState.bestScores[key] || 0;
  const attempts = performanceState.attempts[key] || [];
  app.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <button onclick="onBackToChapterOptions()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">Performance</h2>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-white dark:bg-slate-800 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-indigo-600 dark:text-indigo-400">${Math.round(bestScore)}%</div><div class="text-xs text-gray-500 dark:text-gray-400">Best</div></div>
        <div class="bg-white dark:bg-slate-800 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-green-600 dark:text-green-400">${attempts.length}</div><div class="text-xs text-gray-500 dark:text-gray-400">Attempts</div></div>
      </div>
      ${attempts.length > 0 ? `<div class="bg-white dark:bg-slate-800 rounded-xl p-4"><h3 class="text-sm font-semibold text-gray-800 dark:text-white mb-2">Recent</h3><div class="space-y-2">${attempts.slice(0,5).map(a => `<div class="flex justify-between text-sm text-gray-700 dark:text-gray-300"><span>${a.date}</span><span class="font-medium text-gray-800 dark:text-white">${Math.round(a.percentage)}%</span></div>`).join('')}</div></div>` : ''}
    </div>`;
}

function renderAchievementsView() {
  const key = `${state.selectedSubject}_${state.selectedChapter}`;
  const chapterAchievements = performanceState.achievements[key] || [];
  const all = [
    { id: 'first_quiz', name: 'First Quiz', icon: 'fa-play' },
    { id: 'perfect_score', name: 'Perfect Score', icon: 'fa-star' },
    { id: 'chapter_master', name: 'Chapter Master', icon: 'fa-graduation-cap' },
    { id: 'chapter_expert', name: 'Chapter Expert', icon: 'fa-book' },
    { id: 'consistent_learner', name: 'Consistent Learner', icon: 'fa-check-double' },
    { id: 'speed_demon', name: 'Speed Demon', icon: 'fa-bolt' }
  ];
  app.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <button onclick="onBackToChapterOptions()" class="p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-gray-600 dark:text-gray-300"><i class="fas fa-arrow-left"></i></button>
        <h2 class="text-lg font-bold text-gray-800 dark:text-white">Achievements</h2>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${all.map(a => {
          const unlocked = chapterAchievements.includes(a.id);
          return `<div class="bg-white dark:bg-slate-800 rounded-xl p-3 text-center ${unlocked ? 'border border-yellow-400 dark:border-yellow-500' : 'opacity-60'}">
            <i class="fas ${a.icon} text-2xl ${unlocked ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'} mb-1"></i>
            <div class="text-sm font-medium text-gray-800 dark:text-white">${a.name}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">${unlocked ? 'Unlocked' : 'Locked'}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
  // =============================================
  // BANNER TRANSITION (defined globally)
  // =============================================
  function initBannerTransition() {
    const staticImg = document.querySelector('.banner-static');
    const gifImg = document.querySelector('.banner-gif');
    if (!staticImg || !gifImg) return;
    setTimeout(() => {
      gifImg.classList.add('loaded');
      gifImg.style.opacity = '1';
      setTimeout(() => {
        staticImg.style.opacity = '0';
      }, 500);
    }, 2000);
  }

  // =============================================
  // EVENT HANDLERS
  // =============================================
  window.onSubjectSelect = (subject) => {
    state.selectedSubject = subject;
    state.currentView = 'chapterList';
    state.jsonQuestions = [];
    state.jsonNotes = "";
    state.isLoading = false;
    pushToNavigationStack('chapterList');
    render();
  };
  window.onBackToSubjects = () => handleBackNavigation();
  window.onChapterSelect = (chapterId) => {
    state.selectedChapter = chapterId;
    state.currentView = 'chapterOptions';
    pushToNavigationStack('chapterOptions');
    render();
  };
  window.onBackToChapters = () => handleBackNavigation();
  window.onStudyNotes = async () => {
    state.currentView = 'notesView';
    pushToNavigationStack('notesView');
    render();
  };
  window.onBackFromNotes = () => handleBackNavigation();
  window.onPracticeQuiz = async () => {
    state.currentView = 'quizModeSelection';
    pushToNavigationStack('quizModeSelection');
    render();
  };
  window.onBackToChapterOptions = () => handleBackNavigation();
  window.onBackToQuizModeSelection = () => handleBackNavigation();
  window.onViewPerformance = function() {
    state.currentView = 'performanceView';
    pushToNavigationStack('performanceView');
    render();
  };
  window.onViewPerformanceFromResults = function() {
    state.currentView = 'performanceView';
    pushToNavigationStack('performanceView');
    render();
  };
  window.onViewAchievements = function() {
    state.currentView = 'achievementsView';
    pushToNavigationStack('achievementsView');
    render();
  };
  window.onStartQuiz = async () => {
    const nameInput = document.getElementById('studentName');
    const modeInput = document.querySelector('input[name="quizMode"]:checked');
    const difficultySelect = document.getElementById('testDifficulty');
    const displayModeSelect = document.getElementById('questionDisplayMode');

    if (displayModeSelect) state.questionDisplayMode = displayModeSelect.value;
    if (nameInput && nameInput.value.trim()) {
      state.studentName = nameInput.value.trim();
      localStorage.setItem('studentName', state.studentName);
    }
    if (!state.studentName) {
      alert("Please enter your name.");
      if (nameInput) nameInput.focus();
      return;
    }
    const difficulty = difficultySelect ? difficultySelect.value : 'normal';
    state.timePerQuestion = timerConfig[difficulty] || 60;
    const questions = getCurrentQuizQuestions();
    if (questions.length === 0) {
      alert("No quiz questions available for this chapter.");
      return;
    }
    state.selectedMode = modeInput ? modeInput.value : 'practice';
    if (state.selectedMode === 'practice') {
      // default to flashcards for practice
      state.currentQuestionIndex = 0;
      state.currentView = 'practiceModeFlashcards';
      pushToNavigationStack('practiceModeFlashcards');
      render();
      return;
    }
    if (!isTimedTestAllowed()) {
      alert("Timed Test is not available for this chapter.");
      return;
    }
    state.timerSecondsLeft = calculateTotalTime(questions);
    state.currentView = 'timedTest';
    state.currentQuestionIndex = 0;
    state.testAnswers = Array(questions.length).fill(null);
    state.testSubmitted = false;
    state.telegramMessageStatus = null;
    state.questionTransition = null;
    pushToNavigationStack('timedTest');
    render();
  };
  window.onAnswerSelect = function(optionIndex, specificQIndex = null) {
    const currentQ = specificQIndex !== null ? specificQIndex : state.interactiveQuiz.currentQuestion;
    const question = state.interactiveQuiz.questions[currentQ];
    if (state.interactiveQuiz.answered[currentQ] !== undefined) return;
    state.interactiveQuiz.answered[currentQ] = optionIndex;
    if (optionIndex === question.answer) state.interactiveQuiz.score++;
    if (state.interactiveQuiz.difficulty === 'hard' && specificQIndex === null) clearInteractiveQuizTimer();
    state.interactiveQuiz.showExplanation = true;
    render();
  };
  window.onFinishInteractiveQuiz = function() {
    const questions = state.interactiveQuiz.questions;
    const unanswered = questions.length - state.interactiveQuiz.answered.filter(a => a !== undefined).length;
    if (unanswered > 0) {
      if (!confirm(`You have ${unanswered} unanswered questions. Do you want to finish anyway?`)) return;
    }
    const score = state.interactiveQuiz.score;
    const total = questions.length;
    const percentage = ((score / total) * 100).toFixed(2);
    addAttempt(state.selectedSubject, state.selectedChapter, score, total, percentage, 'interactive');
    state.testSubmitted = true;
    render();
  };
  window.onNextInteractiveQuestion = function() {
    const questions = state.interactiveQuiz.questions;
    if (state.interactiveQuiz.currentQuestion < questions.length - 1) {
      state.interactiveQuiz.currentQuestion++;
      state.interactiveQuiz.showExplanation = false;
      if (state.interactiveQuiz.difficulty === 'hard') {
        state.interactiveQuiz.timerSecondsLeft = 60;
        clearInteractiveQuizTimer();
      }
      render();
    } else {
      const percentage = (state.interactiveQuiz.score / questions.length) * 100;
      addAttempt(state.selectedSubject, state.selectedChapter, state.interactiveQuiz.score, questions.length, percentage, state.interactiveQuiz.difficulty);
      alert(`Quiz completed! Your score: ${state.interactiveQuiz.score}/${questions.length} (${Math.round(percentage)}%)`);
      onBackToChapterOptions();
    }
  };
  window.onPrevInteractiveQuestion = function() {
    if (state.interactiveQuiz.currentQuestion > 0) {
      state.interactiveQuiz.currentQuestion--;
      state.interactiveQuiz.showExplanation = false;
      if (state.interactiveQuiz.difficulty === 'hard') clearInteractiveQuizTimer();
      render();
    }
  };
  window.prevQuestion = function() {
    if (state.currentQuestionIndex > 0) { state.currentQuestionIndex--; renderPracticeModeFlashcards(); }
  };
  window.nextQuestion = function() {
    const questions = getCurrentQuizQuestions();
    if (state.currentQuestionIndex < questions.length - 1) { state.currentQuestionIndex++; renderPracticeModeFlashcards(); }
  };
  window.toggleQuestionDisplayMode = function() {
    state.questionDisplayMode = state.questionDisplayMode === 'single' ? 'all' : 'single';
    state.currentQuestionIndex = 0;
    if (state.currentView === 'practiceModeFlashcards') renderPracticeModeFlashcards();
    else if (state.currentView === 'interactiveQuiz') renderInteractiveQuiz();
    else if (state.currentView === 'timedTest') renderTimedTest();
    else render();
  };
  window.onPrevQuestion = () => {
    if (state.currentQuestionIndex > 0) { state.questionTransition = 'prev'; state.currentQuestionIndex--; renderTimedTest(); }
  };
  window.onNextQuestion = () => {
    if (state.currentQuestionIndex < getCurrentQuizQuestions().length - 1) { state.questionTransition = 'next'; state.currentQuestionIndex++; renderTimedTest(); }
  };
  window.onSubmitTest = async function(autoSubmit = false) {
    const questions = getCurrentQuizQuestions();
    if (!autoSubmit) {
      for (let i = 0; i < questions.length; i++) {
        if (state.testAnswers[i] === null) {
          alert(`Please answer question ${i+1}.`);
          state.currentQuestionIndex = i;
          render();
          return;
        }
      }
    }
    clearTimer();
    state.testSubmitted = true;
    const score = calculateScore();
    const percentage = ((score / questions.length) * 100).toFixed(2);
    addAttempt(state.selectedSubject, state.selectedChapter, score, questions.length, percentage, 'timed');
    state.currentView = 'testResults';
    pushToNavigationStack('testResults');
    render();
  };
  window.onAbortTest = () => {
    if (confirm("Cancel the test? Your progress will be lost.")) {
      clearTimer();
      state.testSubmitted = false;
      state.testAnswers = Array(getCurrentQuizQuestions().length).fill(null);
      state.timerSecondsLeft = 300;
      handleBackNavigation();
    }
  };
  window.onReturnToSubjects = () => {
    clearTimer();
    clearInteractiveQuizTimer();
    state.selectedSubject = null; state.selectedChapter = null; state.selectedMode = null;
    state.testAnswers = []; state.timerSecondsLeft = 300; state.testSubmitted = false;
    state.telegramMessageStatus = null; state.jsonQuestions = []; state.jsonNotes = "";
    state.isLoading = false; state.currentView = 'subjectSelection';
    state.navigationStack = ['subjectSelection']; state.questionTransition = null;
    state.interactiveQuiz = { currentQuestion:0, score:0, answered:[], showExplanation:false, difficulty:'normal', timerSecondsLeft:0, timerInterval:null, questions:[] };
    window.history.replaceState({ screen:'subjectSelection', stack:['subjectSelection'] }, '');
    render();
  };
  window.onSearchResultClick = function(subject, chapterId, type) {
    state.selectedSubject = subject; state.selectedChapter = chapterId;
    state.currentView = 'chapterOptions'; pushToNavigationStack('chapterOptions');
    render();
    const resultsDiv = document.getElementById('globalSearchResults');
    if (resultsDiv) { resultsDiv.innerHTML = ''; resultsDiv.classList.add('hidden'); }
  };

  function clearTimer() { if(state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; } }

  function calculateScore() {
    if (state.selectedMode === 'practice' && state.interactiveQuiz.questions.length > 0) {
      return state.interactiveQuiz.score;
    }
    const questions = getCurrentQuizQuestions();
    let score = 0;
    for (let i = 0; i < questions.length; i++) {
      if (state.testAnswers[i] === questions[i].answer) score++;
    }
    return score;
  }

  async function sendResultsToTelegram() {
    const questions = getCurrentQuizQuestions();
    const score = calculateScore();
    const percentage = ((score / questions.length) * 100).toFixed(2);
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-GB');
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const weatherEmoji = "☀️";
    const resultStatus = score >= questions.length/2 ? "✓ Pass" : "✗ Fail";
    const resultText = `=== Chapter Result Card ===\n--------------------------------------\n👨‍🎓 Name: ${state.studentName}\n📚 Subject: ${state.selectedSubject}\n📖 Chapter: ${getSelectedChapter().title}\n⏱️ Time Per Question: ${getTimePerQuestionDisplay()}\n⏰ Total Test Time: ${formatTime(calculateTotalTime(questions))}\n📊 Marks: ${score} / ${questions.length}\n📈 Percentage: ${percentage}%\n🏆 Result: ${resultStatus}\n--------------------------------------\nChapter test checked and verified.\n🕒 Time: ${time}\n📅 Date: ${date} ${weatherEmoji} ${day}`;
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: resultText })
      });
      if (!response.ok) state.telegramMessageStatus = 'error';
      else state.telegramMessageStatus = 'success';
    } catch (error) { state.telegramMessageStatus = 'error'; }
    renderTestResults();
  }

  // =============================================
  // DARK MODE
  // =============================================
  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    if (state.darkMode) {
      document.documentElement.classList.add('dark');
      document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun text-sm"></i>';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.getElementById('themeToggle').innerHTML = '<i class="fas fa-moon text-sm"></i>';
      localStorage.setItem('theme', 'light');
    }
    render();
  }

  // =============================================
  // NAVIGATION STACK & BACK BUTTON
  // =============================================
  function initializeHardwareBackButton() {
    window.addEventListener('popstate', function(event) {
      if (event.state && event.state.screen) {
        navigateToScreen(event.state.screen);
      } else {
        handleBackNavigation();
      }
    });
    window.history.replaceState({ screen: 'subjectSelection', stack: ['subjectSelection'] }, '');
    if (typeof device !== 'undefined') {
      document.addEventListener('backbutton', function(e) {
        e.preventDefault();
        handleBackNavigation();
      }, false);
    }
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('PWA standalone mode detected');
    }
  }

  function handleBackNavigation() {
    if (state.navigationStack.length > 1) {
      state.navigationStack.pop();
      const previousScreen = state.navigationStack[state.navigationStack.length - 1];
      state.currentView = previousScreen;
      if (previousScreen === 'subjectSelection') {
        state.selectedSubject = null;
        state.selectedChapter = null;
      }
      window.history.pushState({ screen: previousScreen, stack: [...state.navigationStack] }, '');
      render();
    } else {
      showExitConfirmation();
    }
  }

  function navigateToScreen(screen) {
    state.currentView = screen;
    switch(screen) {
      case 'subjectSelection':
        state.selectedSubject = null;
        state.selectedChapter = null;
        state.selectedMode = null;
        break;
      case 'chapterList':
        state.selectedChapter = null;
        state.selectedMode = null;
        break;
    }
    render();
  }

  function pushToNavigationStack(screen) {
    state.navigationStack.push(screen);
    window.history.pushState({ screen: screen, stack: [...state.navigationStack] }, '');
  }

  function showExitConfirmation() {
    const exitModal = document.getElementById('exitModal');
    exitModal.classList.remove('hidden');
    document.getElementById('cancelExitBtn').onclick = function() {
      exitModal.classList.add('hidden');
    };
    document.getElementById('confirmExitBtn').onclick = function() {
      if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
        if (window.navigator.app && window.navigator.app.exitApp) {
          window.navigator.app.exitApp();
        } else {
          window.close();
        }
      } else if (window.history.length > 1) {
        window.history.go(-1);
      } else {
        window.close();
      }
    };
  }

  // =============================================
  // NAME MANAGEMENT
  // =============================================
  function initializeNameModal() {
    const savedName = localStorage.getItem('studentName');
    if (!savedName) {
      showNameModal();
    } else {
      state.studentName = savedName;
    }
  }

  function showNameModal() {
    const nameModal = document.getElementById('nameModal');
    nameModal.classList.remove('hidden');
    const nameInput = document.getElementById('nameInput');
    const saveBtn = document.getElementById('saveNameBtn');
    nameInput.focus();
    saveBtn.onclick = function() {
      const name = nameInput.value.trim();
      if (name) {
        state.studentName = name;
        localStorage.setItem('studentName', name);
        nameModal.classList.add('hidden');
        render();
      } else {
        nameInput.focus();
      }
    };
    nameInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') saveBtn.click();
    });
  }

  // =============================================
  // BOTTOM NAVIGATION (fixed chapters button)
  // =============================================
  function setBottomNavActive(screen) {
    const items = document.querySelectorAll('.bottom-nav-item');
    items.forEach(btn => {
      const btnScreen = btn.getAttribute('data-screen');
      if (btnScreen === screen) btn.classList.add('bottom-nav-item-active');
      else btn.classList.remove('bottom-nav-item-active');
    });
  }

  function handleBottomNavClick(screen) {
    // Don't do anything if we're already on that screen (except profile)
    if (screen === state.currentView && screen !== 'profileView') return;

    switch (screen) {
      case 'subjectSelection':
        state.selectedSubject = null;
        state.selectedChapter = null;
        state.selectedMode = null;
        state.currentView = 'subjectSelection';
        state.navigationStack = ['subjectSelection'];
        window.history.replaceState({ screen: 'subjectSelection', stack: ['subjectSelection'] }, '');
        break;

      case 'chapterList':
        if (!state.selectedSubject) {
          // Show modal, do NOT change active button
          showPremiumSubjectModal('chapterList');
          return;
        } else {
          state.currentView = 'chapterList';
          state.navigationStack = ['subjectSelection', 'chapterList'];
        }
        break;

      case 'performanceView':
      case 'achievementsView':
        if (!state.selectedSubject || !state.selectedChapter) {
          showPremiumSubjectModal(screen);
          return;   // don't change active button
        } else {
          state.currentView = screen;
          pushToNavigationStack(screen);
        }
        break;

      case 'profileView':
        state.currentView = 'profileView';
        pushToNavigationStack('profileView');
        loadProfessionalProfile();
        break;

      default:
        return;   // unknown screen, do nothing
    }

    // Only now update the active button
    setBottomNavActive(state.currentView);
    render();
  }

  function initializeBottomNav() {
    setBottomNavActive(state.currentView || 'subjectSelection');
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      const screen = btn.getAttribute('data-screen');
      btn.removeAttribute('onclick');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleBottomNavClick(screen);
      });
    });
  }

  // =============================================
  // PREMIUM MODAL (subject/chapter selection)
  // =============================================
  let premiumModalState = { targetScreen: null, selectedSubject: null, selectedChapter: null, featureName: 'performance' };

  function showPremiumSubjectModal(targetScreen) {
    premiumModalState.targetScreen = targetScreen;
    premiumModalState.selectedSubject = null;
    premiumModalState.selectedChapter = null;
    const featureNames = { 'performanceView': 'performance', 'achievementsView': 'achievements', 'chapterList': 'chapters' };
    premiumModalState.featureName = featureNames[targetScreen] || 'content';
    const modalTitle = document.getElementById('premiumModalTitle');
    const modalIcon = document.getElementById('premiumModalIcon');
    const featureNameSpan = document.getElementById('modalFeatureName');
    if (targetScreen === 'performanceView') {
      modalTitle.textContent = 'View Performance';
      modalIcon.className = 'fas fa-chart-line';
      featureNameSpan.textContent = 'performance';
    } else if (targetScreen === 'achievementsView') {
      modalTitle.textContent = 'View Achievements';
      modalIcon.className = 'fas fa-trophy';
      featureNameSpan.textContent = 'achievements';
    } else {
      modalTitle.textContent = 'Select Subject';
      modalIcon.className = 'fas fa-book';
      featureNameSpan.textContent = 'chapters';
    }
    populateSubjectSelection();
    document.getElementById('premiumModalStep1').classList.remove('hidden');
    document.getElementById('premiumModalStep2').classList.add('hidden');
    document.getElementById('premiumModalContinueBtn').disabled = true;
    document.getElementById('premiumSubjectModal').classList.remove('hidden');
  }

  function populateSubjectSelection() {
    const grid = document.getElementById('subjectSelectionGrid');
    const subjects = Object.keys(data);
    grid.innerHTML = subjects.map(subject => `
      <div class="premium-select-card" onclick="selectSubject('${subject}')">
        <div class="premium-select-icon"><i class="fas fa-${getSubjectIcon(subject)}"></i></div>
        <div class="premium-select-content"><div class="premium-select-title">${subject}</div><div class="premium-select-desc">${data[subject].chapters.length} chapters available</div></div>
        <i class="fas fa-chevron-right text-gray-400"></i>
      </div>`).join('');
  }

  window.selectSubject = function(subject) {
    premiumModalState.selectedSubject = subject;
    document.querySelectorAll('.premium-select-card').forEach(card => card.classList.remove('active'));
    const selectedCard = Array.from(document.querySelectorAll('.premium-select-card')).find(card => card.querySelector('.premium-select-title').textContent === subject);
    if (selectedCard) selectedCard.classList.add('active');
    document.getElementById('premiumModalContinueBtn').disabled = false;
    document.getElementById('premiumModalContinueBtn').innerHTML = `<i class="fas fa-arrow-right mr-1"></i>${premiumModalState.targetScreen === 'chapterList' ? 'View Chapters' : 'Select Chapter'}`;
  };

  window.proceedToFeature = function() {
    if (!premiumModalState.selectedSubject) return;
    if (premiumModalState.targetScreen === 'chapterList') {
      closePremiumModal();
      state.selectedSubject = premiumModalState.selectedSubject;
      state.currentView = 'chapterList';
      state.navigationStack = ['subjectSelection', 'chapterList'];
      render();
      setBottomNavActive('chapterList');
      return;
    }
    if (!premiumModalState.selectedChapter) {
      showChapterSelection();
    } else {
      finalizeNavigation();
    }
  };

  function showChapterSelection() {
    document.getElementById('selectedSubjectText').textContent = premiumModalState.selectedSubject;
    populateChapterSelection();
    document.getElementById('premiumModalStep1').classList.add('hidden');
    document.getElementById('premiumModalStep2').classList.remove('hidden');
    const continueBtn = document.getElementById('premiumModalContinueBtn');
    continueBtn.disabled = true;
    continueBtn.innerHTML = `<i class="fas fa-check mr-1"></i>View ${premiumModalState.featureName}`;
  }

  function populateChapterSelection() {
    const list = document.getElementById('chapterSelectionList');
    const chapters = data[premiumModalState.selectedSubject]?.chapters || [];
    list.innerHTML = chapters.map(chapter => {
      const key = `${premiumModalState.selectedSubject}_${chapter.id}`;
      const bestScore = performanceState.bestScores[key];
      const attempts = performanceState.attempts[key]?.length || 0;
      return `<div class="premium-chapter-item" onclick="selectChapter(${chapter.id})">
        <div class="premium-chapter-number">${chapter.id}</div>
        <div class="premium-chapter-info"><div class="premium-chapter-name">${chapter.title}</div><div class="premium-chapter-stats">${bestScore ? `Best: ${Math.round(bestScore)}% • ` : ''}${attempts} attempt${attempts!==1?'s':''}</div></div>
        <i class="fas fa-check premium-chapter-check hidden"></i></div>`;
    }).join('');
  }

  window.selectChapter = function(chapterId) {
    premiumModalState.selectedChapter = chapterId;
    document.querySelectorAll('.premium-chapter-item').forEach(item => {
      item.classList.remove('active');
      item.querySelector('.premium-chapter-check').classList.add('hidden');
    });
    const selectedItem = Array.from(document.querySelectorAll('.premium-chapter-item')).find((_, index) => data[premiumModalState.selectedSubject].chapters[index].id === chapterId);
    if (selectedItem) {
      selectedItem.classList.add('active');
      selectedItem.querySelector('.premium-chapter-check').classList.remove('hidden');
    }
    document.getElementById('premiumModalContinueBtn').disabled = false;
  };

  window.goBackToSubjectSelection = function() {
    document.getElementById('premiumModalStep2').classList.add('hidden');
    document.getElementById('premiumModalStep1').classList.remove('hidden');
    premiumModalState.selectedChapter = null;
    document.getElementById('premiumModalContinueBtn').innerHTML = '<i class="fas fa-arrow-right mr-1"></i>Select Chapter';
  };

  function closePremiumModal() {
    document.getElementById('premiumSubjectModal').classList.add('hidden');
  }
  window.closePremiumModal = closePremiumModal;

  function finalizeNavigation() {
    if (!premiumModalState.selectedSubject || !premiumModalState.selectedChapter) return;
    state.selectedSubject = premiumModalState.selectedSubject;
    state.selectedChapter = premiumModalState.selectedChapter;
    state.currentView = premiumModalState.targetScreen;
    closePremiumModal();
    if (premiumModalState.targetScreen === 'performanceView') {
      pushToNavigationStack('performanceView');
    } else if (premiumModalState.targetScreen === 'achievementsView') {
      pushToNavigationStack('achievementsView');
    }
    setBottomNavActive(premiumModalState.targetScreen);
    render();
  }

  // =============================================
  // CACHE MANAGEMENT FUNCTIONS
  // =============================================
// =============================================
// FULL‑SCREEN CACHE MANAGER (user‑friendly)
// =============================================
let currentCacheView = 'all';  // 'all', 'images', 'html', 'css', 'js', 'json', 'other'

window.refreshCacheInfo = async function() {
  try {
    const cacheNames = await caches.keys();
    let totalFiles = 0;
    let totalSize = 0;
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      for (const req of requests) {
        const resp = await cache.match(req);
        const blob = await resp.blob();
        totalSize += blob.size;
        totalFiles++;
      }
    }
    const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    const card = document.getElementById('cacheInfoCard');
    if (card) {
      card.innerHTML = `
        <div class="flex flex-col gap-2">
          <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-300">Cached files</span><span class="font-bold text-purple-600 dark:text-purple-400">${totalFiles}</span></div>
          <div class="flex justify-between"><span class="text-gray-600 dark:text-gray-300">Total size</span><span class="font-bold text-purple-600 dark:text-purple-400">${sizeMB} MB</span></div>
        </div>`;
    }
  } catch (e) {
    const card = document.getElementById('cacheInfoCard');
    if (card) card.innerHTML = '<div class="text-amber-500 text-sm">Cache info unavailable</div>';
  }
};

// Helper: get all cached entries across all caches
async function getAllCachedEntries() {
  const entries = [];
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    for (const req of requests) {
      const resp = await cache.match(req);
      const blob = await resp.blob();
      const url = req.url;
      const filename = url.split('/').pop() || url;
      const extension = filename.split('.').pop().toLowerCase();
      entries.push({
        cacheName: name,
        url: url,
        filename: filename,
        extension: extension,
        size: blob.size,
        type: resp.headers.get('content-type') || 'unknown',
        blob: blob
      });
    }
  }
  return entries;
}

// Categorise extensions
function categoriseEntries(entries) {
  const categories = {
    images: [],
    html: [],
    css: [],
    js: [],
    json: [],
    fonts: [],
    other: []
  };
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'];
  const fontExts = ['woff', 'woff2', 'ttf', 'eot', 'otf'];
  entries.forEach(entry => {
    if (imageExts.includes(entry.extension)) categories.images.push(entry);
    else if (entry.extension === 'html') categories.html.push(entry);
    else if (entry.extension === 'css') categories.css.push(entry);
    else if (entry.extension === 'js') categories.js.push(entry);
    else if (entry.extension === 'json') categories.json.push(entry);
    else if (fontExts.includes(entry.extension)) categories.fonts.push(entry);
    else categories.other.push(entry);
  });
  return categories;
}

// Format bytes
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

// Visual preview modal (for any file)
// Visual preview modal – NOW SHOWS THE WHOLE FILE (no truncation)
window.openFilePreview = async function(url, filename, extension) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
  modal.innerHTML = `
    <div class="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="font-semibold text-gray-800 dark:text-white truncate pr-4">
          <i class="fas fa-eye mr-2 text-indigo-500"></i>${filename}
          <span class="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${extension.toUpperCase()}</span>
        </h3>
        <button class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition" onclick="this.closest('.fixed').remove()">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      <div class="flex-1 overflow-auto p-4" id="previewContent">
        <div class="flex items-center justify-center h-32">
          <i class="fas fa-spinner fa-pulse text-2xl text-indigo-500"></i>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const contentDiv = document.getElementById('previewContent');
  try {
    // Try to find the file in any cache
    let response = null;
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const r = await cache.match(url);
      if (r) {
        response = r;
        break;
      }
    }

    if (!response) throw new Error('File not found in cache');

    const blob = await response.blob();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico'];

    if (imageExts.includes(extension)) {
      const imgUrl = URL.createObjectURL(blob);
      contentDiv.innerHTML = `
        <div class="flex items-center justify-center h-full">
          <img src="${imgUrl}" alt="${filename}" class="max-w-full max-h-[75vh] object-contain rounded-lg shadow-md">
        </div>`;
    } else {
      // Show full text file content – NO truncation
      const text = await blob.text();
      contentDiv.innerHTML = `
        <pre class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto max-h-[75vh] overflow-y-auto">${escapeHtml(text)}</pre>`;
    }
  } catch (err) {
    contentDiv.innerHTML = `
      <div class="text-center text-red-500 dark:text-red-400 py-10">
        <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
        <p>Cannot preview this file.</p>
      </div>`;
  }
};

// Full-screen cache manager
window.showCacheManagementModal = async function() {
  // Create the full-screen overlay
  const overlay = document.createElement('div');
  overlay.id = 'cacheManagerOverlay';
  overlay.className = 'fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white';
  overlay.innerHTML = `
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <h2 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-database text-indigo-500"></i> Cache Manager</h2>
      <div class="flex items-center gap-3">
        <div class="text-sm text-gray-500 dark:text-gray-400" id="cacheStats">Loading…</div>
        <button class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" onclick="document.getElementById('cacheManagerOverlay').remove()">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
    </div>

    <!-- Category Tabs -->
    <div class="flex items-center gap-1 overflow-x-auto px-4 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      ${['all', 'images', 'html', 'css', 'js', 'json', 'fonts', 'other'].map(cat => `
        <button class="category-tab px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap ${cat === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}" data-category="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</button>
      `).join('')}
      <div class="flex-1"></div>
      <button onclick="deleteAllCaches()" class="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-200 dark:hover:bg-red-800 ml-2"><i class="fas fa-trash-alt mr-1"></i>Clear All</button>
    </div>

    <!-- File List -->
    <div class="flex-1 overflow-auto p-4" id="cacheFileList">
      <div class="flex items-center justify-center h-32"><i class="fas fa-spinner fa-pulse text-2xl text-indigo-500"></i></div>
    </div>`;

  document.body.appendChild(overlay);

  // Load entries
  const entries = await getAllCachedEntries();
  const categories = categoriseEntries(entries);
  const totalFiles = entries.length;
  const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
  document.getElementById('cacheStats').textContent = `${totalFiles} files · ${formatBytes(totalSize)}`;

  // Render file list based on current category
  function renderFileList(category = 'all') {
    currentCacheView = category;
    const listDiv = document.getElementById('cacheFileList');
    if (!listDiv) return;

    let filtered;
    if (category === 'all') filtered = entries;
    else filtered = categories[category] || [];

    if (filtered.length === 0) {
      listDiv.innerHTML = `<div class="text-center py-12 text-gray-500 dark:text-gray-400"><i class="fas fa-inbox text-4xl mb-3"></i><p>No files found in this category</p></div>`;
      return;
    }

    listDiv.innerHTML = filtered.map(entry => {
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'];
      const isImage = imageExts.includes(entry.extension);
      return `
        <div class="flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm mb-2 hover:shadow-md transition">
          <!-- Thumbnail / Icon -->
          <div class="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center">
            ${isImage 
              ? `<img src="${entry.url}" class="w-full h-full object-cover" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%239ca3af%22 d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z%22/%3E%3C/svg%3E'">`
              : `<i class="fas ${entry.extension === 'html' ? 'fa-code text-orange-500' : entry.extension === 'css' ? 'fa-paint-brush text-blue-500' : entry.extension === 'js' ? 'fa-js text-yellow-500' : entry.extension === 'json' ? 'fa-database text-green-500' : 'fa-file text-gray-400'} text-2xl"></i>`
            }
          </div>
          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-800 dark:text-white truncate" title="${entry.filename}">${entry.filename}</div>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">${entry.extension.toUpperCase()}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">${formatBytes(entry.size)}</span>
            </div>
          </div>
          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button onclick="openFilePreview('${entry.url}', '${entry.filename}', '${entry.extension}')" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400" title="Preview"><i class="fas fa-eye"></i></button>
            <button onclick="deleteSingleFile('${entry.cacheName}', '${entry.url}', event)" class="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900 text-red-500" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join('');
  }

  renderFileList('all');

  // Category tab click handlers
  document.querySelectorAll('.category-tab').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.category-tab').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white');
        b.classList.add('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
      });
      this.classList.add('bg-indigo-600', 'text-white');
      this.classList.remove('bg-gray-200', 'dark:bg-gray-700', 'text-gray-700', 'dark:text-gray-300');
      renderFileList(this.dataset.category);
    });
  });

  // Close on Escape key
  const escHandler = (e) => { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
};

// Override deleteSingleFile to refresh the manager after deletion
const originalDeleteSingleFile = window.deleteSingleFile;
window.deleteSingleFile = async function(cacheName, fileUrl, event) {
  if (event) event.stopPropagation();
  if (confirm(`Delete this file?\n${fileUrl.split('/').pop()}`)) {
    const cache = await caches.open(cacheName);
    await cache.delete(fileUrl);
    showToast('File deleted', 'success');
    // Refresh the cache manager if open
    if (document.getElementById('cacheManagerOverlay')) {
      const entries = await getAllCachedEntries();
      const categories = categoriseEntries(entries);
      const totalFiles = entries.length;
      const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
      const statsEl = document.getElementById('cacheStats');
      if (statsEl) statsEl.textContent = `${totalFiles} files · ${formatBytes(totalSize)}`;
      // Re-render current category
      const renderFn = window._renderFileList || (() => {});
      if (window._renderFileList) window._renderFileList(currentCacheView);
      else {
        // fallback
        const listDiv = document.getElementById('cacheFileList');
        if (listDiv) {
          // trigger category re-render by calling the last active tab
          const activeTab = document.querySelector('.category-tab.bg-indigo-600');
          if (activeTab) activeTab.click();
        }
      }
    }
  }
};

// Expose the render function so delete can call it
window._renderFileList = async function(category) {
  const entries = await getAllCachedEntries();
  const categories = categoriseEntries(entries);
  const listDiv = document.getElementById('cacheFileList');
  if (!listDiv) return;
  let filtered;
  if (category === 'all') filtered = entries;
  else filtered = categories[category] || [];
  // (reuse the rendering logic above, but we need to have it accessible)
  // For simplicity, we'll just call the click of the current active tab
  const activeTab = document.querySelector('.category-tab.bg-indigo-600');
  if (activeTab) activeTab.click();
};

  window.showAllAvailableUpdates = function() {
    showToast('🔍 Checking for updates...', 'info');
  };

  // =============================================
  // MAIN RENDER WRAPPER
  // =============================================
  function render() {
    switch(state.currentView) {
      case 'subjectSelection': renderSubjectSelection(); break;
      case 'chapterList': renderChapterList(); break;
      case 'chapterOptions': renderChapterOptions(); break;
      case 'notesView': renderNotesView(); break;
      case 'quizModeSelection': renderQuizModeSelection(); break;
      case 'practiceModeFlashcards': renderPracticeModeFlashcards(); break;
      case 'interactiveQuiz': renderInteractiveQuiz(); break;
      case 'timedTest': renderTimedTest(); break;
      case 'testResults': renderTestResults(); break;
      case 'profileView': renderProfessionalProfileView(); break;
      case 'performanceView': renderPerformanceView(); break;
      case 'achievementsView': renderAchievementsView(); break;
    }
    updateTopBarStudentName();
    updateTopBarLogo();
    setBottomNavActive(state.currentView || 'subjectSelection');
  }

  // =============================================
  // INITIALIZATION
  // =============================================
  initializePerformanceState();
  document.getElementById('themeToggle').addEventListener('click', toggleDarkMode);
  if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    state.darkMode = true;
    document.documentElement.classList.add('dark');
    document.getElementById('themeToggle').innerHTML = '<i class="fas fa-sun text-sm"></i>';
  }
  initializeNameModal();
  initializeHardwareBackButton();

  initProfileImage().then(() => {
    render();
    initializeBottomNav();
    setBottomNavActive('subjectSelection');
  });

  // Global helpers
  window.initBannerTransition = initBannerTransition;

})(); // END of IIFE