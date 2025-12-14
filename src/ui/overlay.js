const { ipcRenderer } = require('electron');

// Pipe console logs to main process for terminal visibility
const originalLog = console.log;
console.log = (...args) => {
  originalLog.apply(console, args);
  ipcRenderer.send('log-message', args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

const originalWarn = console.warn;
console.warn = (...args) => {
  originalWarn.apply(console, args);
  ipcRenderer.send('log-message', '⚠️ ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

const originalError = console.error;
console.error = (...args) => {
  originalError.apply(console, args);
  ipcRenderer.send('log-message', '❌ ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
};

console.log('🚀 overlay.js script execution started (logging enabled)');

// ============================================
// STATE MANAGEMENT
// ============================================

const appState = {
  chatHistory: [],
  screenContext: '',
  isScreenCapturing: false
};

// ============================================
// DOM ELEMENTS
// ============================================

const elements = {
  chatMessages: null,
  chatInput: null,
  sendBtn: null,
  useScreenBtn: null,
  answerBtn: null,
  stealthBtn: null,
  minimizeBtn: null,
  closeBtn: null,
  toggleChatBtn: null
};

// ============================================
// AI CHAT
// ============================================

// Track last request time for UI feedback
let lastAIRequestTime = 0;
const minRequestInterval = 4000; // 4 seconds

function getCooldownRemaining() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastAIRequestTime;
  if (timeSinceLastRequest < minRequestInterval) {
    return Math.ceil((minRequestInterval - timeSinceLastRequest) / 1000);
  }
  return 0;
}

async function sendMessage() {
  const input = elements.chatInput;
  if (!input || !input.value.trim()) return;

  const message = input.value.trim();
  input.value = '';

  // Add user message to chat
  addChatMessage('user', message);

  // Check rate limit and show countdown to user
  const cooldown = getCooldownRemaining();
  if (cooldown > 0) {
    addChatMessage('system', `Please wait ${cooldown} second${cooldown > 1 ? 's' : ''}...`);
    await new Promise(resolve => setTimeout(resolve, cooldown * 1000));
    // Remove the wait message
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }
  }

  // Build context from screen capture
  let context = '';
  if (appState.screenContext) {
    context = `Screen content:\n${appState.screenContext}\n\n`;
  }

  try {
    addChatMessage('assistant', 'Thinking...');

    // Track request time
    lastAIRequestTime = Date.now();

    const response = await ipcRenderer.invoke('query-ai', {
      prompt: message,
      context: context
    });

    // Replace "Thinking..." with actual response
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }

    addChatMessage('assistant', response);

  } catch (error) {
    console.error('AI query failed:', error);
    // Remove "Thinking..."
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }

    // Provide user-friendly error messages based on error type
    const errorMsg = error.message || '';

    if (errorMsg.includes('rate limit') || errorMsg.includes('429') || errorMsg.includes('quota')) {
      addChatMessage('system', 'Rate limit reached. Please wait a moment before trying again.');
    } else if (errorMsg.includes('API key') || errorMsg.includes('not initialized') || errorMsg.includes('Invalid API')) {
      addChatMessage('system', 'API key issue. Please check your .env file has a valid GEMINI_API_KEY.');
    } else if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('ENOTFOUND')) {
      addChatMessage('system', 'Network error. Please check your internet connection.');
    } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      addChatMessage('system', 'Request timed out. Please try again.');
    } else {
      addChatMessage('system', `Something went wrong: ${errorMsg || 'Unknown error'}. Please try again.`);
    }
  }
}

function addChatMessage(role, content) {
  if (!elements.chatMessages) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;

  // Basic markdown rendering
  let html = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  messageDiv.innerHTML = html;
  elements.chatMessages.appendChild(messageDiv);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function addSystemMessage(text) {
  addChatMessage('system', text);
}

// ============================================
// SCREEN CAPTURE (Manual Only)
// ============================================

async function captureScreen() {
  try {
    // Check rate limit and show countdown to user
    const cooldown = getCooldownRemaining();
    if (cooldown > 0) {
      addSystemMessage(`Please wait ${cooldown} second${cooldown > 1 ? 's' : ''} before capturing...`);
      await new Promise(resolve => setTimeout(resolve, cooldown * 1000));
      // Remove the wait message
      const messages = elements.chatMessages;
      if (messages && messages.lastChild) {
        messages.removeChild(messages.lastChild);
      }
    }

    addSystemMessage('Capturing screen...');

    // Track request time (OCR uses API)
    lastAIRequestTime = Date.now();

    const sources = await ipcRenderer.invoke('get-screen-sources');
    if (!sources || sources.length === 0) {
      addSystemMessage('No screen sources available');
      return;
    }

    // Get the primary display
    const primarySource = sources.find(s => s.name === 'Entire Screen') || sources[0];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id,
        }
      }
    });

    // Capture frame
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Stop stream
    stream.getTracks().forEach(track => track.stop());

    // Get base64 image
    const base64Image = canvas.toDataURL('image/png').split(',')[1];

    // Extract text via OCR
    const result = await ipcRenderer.invoke('extract-screen-text', base64Image);

    if (result.success && result.text) {
      appState.screenContext = result.text;
      addSystemMessage(`Screen captured! Extracted ${result.text.length} characters of text.`);

      // Change button to "Captured" temporarily
      if (elements.useScreenBtn) {
        const originalText = elements.useScreenBtn.innerHTML;
        elements.useScreenBtn.innerHTML = '<span class="label">Captured</span>';
        elements.useScreenBtn.classList.add('captured');

        // Reset after cooldown period
        setTimeout(() => {
          elements.useScreenBtn.innerHTML = originalText;
          elements.useScreenBtn.classList.remove('captured');
        }, minRequestInterval);
      }
    } else if (result.error && result.error.includes('Rate limit')) {
      addSystemMessage('Rate limit reached. Please wait a moment and try again.');
    } else {
      addSystemMessage('Screen captured but no text could be extracted.');
    }

  } catch (error) {
    console.error('Screen capture failed:', error);
    addSystemMessage(`Screen capture failed: ${error.message}`);
  }
}

// ============================================
// QUICK ANSWER (Uses screen context)
// ============================================

async function getQuickAnswer() {
  // Use screen context only (audio capture removed)
  const hasScreen = appState.screenContext && appState.screenContext.trim().length > 0;

  console.log(`📋 Context check: hasScreen=${hasScreen}`);

  if (!hasScreen) {
    addSystemMessage('No context available. Click "Use Screen" to capture screen content first.');
    return;
  }

  const context = appState.screenContext;
  const contextSource = 'screen capture';

  console.log(`📋 Using context: ${contextSource} (${context.length} chars)`);

  // Check rate limit
  const cooldown = getCooldownRemaining();
  if (cooldown > 0) {
    addSystemMessage(`Please wait ${cooldown} second${cooldown > 1 ? 's' : ''}...`);
    await new Promise(resolve => setTimeout(resolve, cooldown * 1000));
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }
  }

  addChatMessage('user', `What should I answer? (using ${contextSource})`);
  addChatMessage('assistant', 'Thinking...');

  lastAIRequestTime = Date.now();

  try {
    const prompt = `Based on the following ${contextSource}, what should I answer or respond with? Give me a clear, helpful response I can use.

Context:
${context}

Provide a direct, actionable answer or response suggestion.`;

    const response = await ipcRenderer.invoke('query-ai', { prompt, context: '' });

    // Remove "Thinking..." message
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }

    // Response is a string directly, not an object
    if (response && typeof response === 'string') {
      addChatMessage('assistant', response);
    } else if (response && response.text) {
      addChatMessage('assistant', response.text);
    } else {
      addChatMessage('system', 'No response received. Please try again.');
    }
  } catch (error) {
    // Remove "Thinking..." message
    const messages = elements.chatMessages;
    if (messages && messages.lastChild) {
      messages.removeChild(messages.lastChild);
    }

    // Check for rate limit errors
    const errorMsg = error.message || '';
    if (errorMsg.includes('rate') || errorMsg.includes('limit') || errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('retryDelay')) {
      addChatMessage('system', 'Rate limit reached. Please wait a moment and try again.');
    } else {
      addChatMessage('system', `Error: ${errorMsg || 'Unknown error'}`);
    }
  }
}

// ============================================
// WINDOW CONTROLS
// ============================================

function minimizeWindow() {
  ipcRenderer.send('minimize-window');
}

function closeWindow() {
  ipcRenderer.send('close-app');
}

// Track stealth state (starts disabled = visible in screen shares)
let stealthEnabled = false;

function toggleStealth() {
  stealthEnabled = !stealthEnabled;
  ipcRenderer.send('toggle-stealth', stealthEnabled);

  // Update button state
  if (elements.stealthBtn) {
    if (stealthEnabled) {
      elements.stealthBtn.classList.add('active');
    } else {
      elements.stealthBtn.classList.remove('active');
    }
  }
}

function toggleChatVisibility() {
  const mainContent = document.getElementById('main-content');
  const toggleBtn = elements.toggleChatBtn;

  if (mainContent) {
    // Toggle collapsed state
    document.body.classList.toggle('chat-collapsed');
    const isCollapsed = document.body.classList.contains('chat-collapsed');

    // Update button icon
    if (toggleBtn) {
      toggleBtn.innerHTML = isCollapsed ? 'v' : '^';
    }

    // Resize window to fit content
    ipcRenderer.send('resize-window', {
      width: null,
      height: isCollapsed ? 60 : 400,
      x: null,
      y: null
    });
  }
}

// ============================================
// DRAG FUNCTIONALITY
// ============================================

function initializeDrag() {
  const toolbar = document.getElementById('main-toolbar');
  if (!toolbar) return;

  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  toolbar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
  });

  document.addEventListener('mousemove', async (e) => {
    if (!isDragging) return;

    const deltaX = e.screenX - dragStartX;
    const deltaY = e.screenY - dragStartY;

    const bounds = await ipcRenderer.invoke('get-window-bounds');
    ipcRenderer.send('resize-window', {
      x: bounds.x + deltaX,
      y: bounds.y + deltaY,
      width: null,
      height: null
    });

    dragStartX = e.screenX;
    dragStartY = e.screenY;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Cache elements
  elements.chatMessages = document.getElementById('chatMessages');
  elements.chatInput = document.getElementById('chatInput');
  elements.sendBtn = document.getElementById('sendBtn');
  elements.useScreenBtn = document.getElementById('useScreenBtn');
  elements.answerBtn = document.getElementById('answerBtn');
  elements.stealthBtn = document.getElementById('stealthBtn');
  elements.minimizeBtn = document.getElementById('minimizeBtn');
  elements.closeBtn = document.getElementById('closeBtn');
  elements.toggleChatBtn = document.getElementById('toggleChatBtn');

  console.log('✅ DOM Elements loaded:', {
    useScreenBtn: !!elements.useScreenBtn,
    answerBtn: !!elements.answerBtn,
    chatInput: !!elements.chatInput
  });

  // Event listeners
  elements.sendBtn?.addEventListener('click', sendMessage);
  elements.useScreenBtn?.addEventListener('click', captureScreen);
  elements.answerBtn?.addEventListener('click', getQuickAnswer);
  elements.stealthBtn?.addEventListener('click', toggleStealth);
  elements.minimizeBtn?.addEventListener('click', minimizeWindow);
  elements.closeBtn?.addEventListener('click', closeWindow);
  elements.toggleChatBtn?.addEventListener('click', toggleChatVisibility);

  // Enter to send
  elements.chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Initialize drag
  initializeDrag();

  // Welcome message
  addSystemMessage('Ready! Use "Use Screen" to capture visual content and get AI-powered answers.');

  console.log('🎯 AI Assistant loaded');
});
