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
  isRecording: false,
  isMeetingActive: false,
  transcript: [],
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
  startMeetingBtn: null,
  stealthBtn: null,
  minimizeBtn: null,
  closeBtn: null,
  toggleChatBtn: null,
  transcriptContent: null
};

// ============================================
// VOSK CLIENT (Local Speech Recognition)
// ============================================

let voskSocket = null;
let voskConnected = false;
let voskReconnectAttempts = 0;
const maxVoskReconnectAttempts = 3;

async function connectToVosk() {
  try {
    voskSocket = new WebSocket('ws://localhost:2700');

    voskSocket.onopen = () => {
      console.log('✅ Connected to Vosk server');
      voskConnected = true;
      voskReconnectAttempts = 0;
      updateMeetingButton();
      // Notify user on first successful connection
      if (elements.chatMessages) {
        addSystemMessage('Speech recognition ready!');
      }
    };

    voskSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.text && data.text.trim()) {
          addToTranscript('You', data.text.trim());
        }
      } catch (e) {
        console.error('Vosk message parse error:', e);
      }
    };

    voskSocket.onclose = () => {
      console.log('Vosk connection closed');
      voskConnected = false;
      updateMeetingButton();

      // Reconnect with limits
      voskReconnectAttempts++;
      if (voskReconnectAttempts <= maxVoskReconnectAttempts) {
        setTimeout(connectToVosk, 3000);
      } else if (elements.chatMessages) {
        addSystemMessage('Speech recognition unavailable. Make sure Vosk is set up correctly (see INSTALLATION.md)');
      }
    };

    voskSocket.onerror = (error) => {
      console.error('Vosk connection error:', error);
      if (voskReconnectAttempts >= maxVoskReconnectAttempts && elements.chatMessages) {
        addSystemMessage('Could not connect to speech recognition. You can still use manual input and screenshots.');
      }
    };

  } catch (error) {
    console.error('Failed to connect to Vosk:', error);
    if (elements.chatMessages) {
      addSystemMessage('Speech recognition not available. You can still type questions or use screenshots.');
    }
  }
}

// ============================================
// AUDIO RECORDING
// ============================================

let mediaRecorder = null;
let audioStream = null;
let audioContext = null;

async function startRecording() {
  console.log('🎤 startRecording called');
  try {
    // Get desktop audio source via IPC (since desktopCapturer is not available in renderer)
    // const { desktopCapturer } = require('electron'); // This fails in renderer

    console.log('🎤 Requesting sources via IPC...');
    const sources = await ipcRenderer.invoke('get-screen-sources');

    console.log('Available screen sources:', sources.map(s => `${s.name} (${s.id})`));

    if (!sources || sources.length === 0) {
      addSystemMessage('No audio sources available.');
      return;
    }

    // Use the first screen source (auto-select, no picker dialog)
    const screenSource = sources[0];
    console.log(`🎤 Attempting to capture audio from source: ${screenSource.name} (${screenSource.id})`);

    // Capture desktop audio (system audio - what plays through speakers)
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id,
          minWidth: 1,
          maxWidth: 1,
          minHeight: 1,
          maxHeight: 1
        }
      }
    };

    try {
      audioStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('✅ Desktop audio stream captured successfully');
    } catch (err) {
      console.warn('⚠️ Specific source capture failed, trying default system audio...', err);
      // Fallback: Try with 'system' as source id or just basic desktop
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: true, // Try default system audio device loopback if available
        video: false
      });
    }

    // We only need the audio track
    const audioTrack = audioStream.getAudioTracks()[0];
    if (!audioTrack) {
      console.warn('⚠️ No audio track found in captured stream!');
      addSystemMessage('Warning: No audio detected from screen. Make sure system audio is playing.');
    } else {
      console.log(`✅ Audio track found: ${audioTrack.label}, Enabled: ${audioTrack.enabled}, Muted: ${audioTrack.muted}`);
      audioTrack.onmute = () => console.warn('⚠️ Audio track muted by system');
      audioTrack.onunmute = () => console.log('✅ Audio track unmuted');
    }

    // Stop video tracks to save resources (but keep audio)
    const videoTracks = audioStream.getVideoTracks();
    videoTracks.forEach(track => track.stop());

    // Create audio context for processing at 16kHz for Vosk
    audioContext = new AudioContext({ sampleRate: 16000 });
    // Use the stream that definitely has the audio track
    const source = audioContext.createMediaStreamSource(audioStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      if (voskSocket && voskSocket.readyState === WebSocket.OPEN) {
        const inputData = event.inputBuffer.getChannelData(0);

        // Debug: Check signal level (RMS) every ~100 frames
        if (Math.random() < 0.01) {
          let sum = 0;
          for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sum / inputData.length);
          if (rms > 0.01) console.log(`🔊 Audio Signal RMS: ${rms.toFixed(4)}`);
        }

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }
        voskSocket.send(pcmData.buffer);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    appState.isRecording = true;
    console.log('🔊 Desktop audio recording started');
    addSystemMessage('Capturing desktop audio! Interviewer speech will be transcribed.');

  } catch (error) {
    console.error('Failed to start desktop audio capture:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    // Provide specific error messages
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      addSystemMessage('Desktop audio capture denied. Please allow screen sharing when prompted.');
    } else if (error.message && error.message.includes('audio')) {
      addSystemMessage('System audio not available. Make sure audio is playing through your speakers.');
    } else {
      addSystemMessage(`Could not capture desktop audio: ${error.message || 'Unknown error'}`);
    }
  }
}

function stopRecording() {
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  appState.isRecording = false;
  console.log('🔊 Desktop audio recording stopped');
}

// ============================================
// TRANSCRIPT HANDLING
// ============================================

function addToTranscript(speaker, text) {
  const timestamp = new Date().toLocaleTimeString();
  appState.transcript.push({ speaker, text, timestamp });

  // Update transcript view
  if (elements.transcriptContent) {
    const entry = document.createElement('div');
    entry.className = 'transcript-entry';
    entry.innerHTML = `<span class="speaker">${speaker}:</span> ${text}`;
    elements.transcriptContent.appendChild(entry);
    elements.transcriptContent.scrollTop = elements.transcriptContent.scrollHeight;
  }

  console.log(`[${speaker}] ${text}`);
}

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

  // Build context from transcript and screen
  let context = '';
  if (appState.transcript.length > 0) {
    const recentTranscript = appState.transcript.slice(-10)
      .map(t => `${t.speaker}: ${t.text}`).join('\n');
    context += `Recent conversation:\n${recentTranscript}\n\n`;
  }
  if (appState.screenContext) {
    context += `Screen content:\n${appState.screenContext}\n\n`;
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
// QUICK ANSWER (Uses transcript or screen context)
// ============================================

async function getQuickAnswer() {
  // Build context from either transcript or screen
  // Priority: Active audio transcript > Screen capture (when audio inactive)
  let context = '';
  let contextSource = '';

  const transcriptText = appState.transcript.map(t => `${t.speaker}: ${t.text}`).join('\n').trim();
  const hasTranscript = transcriptText.length > 0;
  const hasScreen = appState.screenContext && appState.screenContext.trim().length > 0;

  console.log(`📋 Context check: Meeting active=${appState.isMeetingActive}, hasTranscript=${hasTranscript}, hasScreen=${hasScreen}`);

  // Decision logic:
  // 1. If audio capture is ACTIVE → use transcript (priority), fallback to screen if no transcript yet
  // 2. If audio capture is OFF → use screen context
  if (appState.isMeetingActive) {
    // Audio mode active - prioritize transcript
    if (hasTranscript) {
      context = transcriptText;
      contextSource = 'meeting transcript';
    } else if (hasScreen) {
      // Audio active but no transcript yet - use screen as fallback
      context = appState.screenContext;
      contextSource = 'screen capture (audio has no transcript yet)';
    }
  } else {
    // Audio mode OFF - use screen context
    if (hasScreen) {
      context = appState.screenContext;
      contextSource = 'screen capture';
    } else if (hasTranscript) {
      // Audio off but has old transcript - use it as fallback
      context = transcriptText;
      contextSource = 'previous transcript';
    }
  }

  if (!context) {
    addSystemMessage('No context available. Click "Capture Audio" to transcribe speech or "Use Screen" to capture screen content.');
    return;
  }

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
// MEETING TOGGLE
// ============================================

function updateMeetingButton() {
  if (!elements.startMeetingBtn) return;

  if (appState.isMeetingActive) {
    elements.startMeetingBtn.classList.add('active');
    elements.startMeetingBtn.innerHTML = '<span class="label">Stop Capture</span>';
  } else {
    elements.startMeetingBtn.classList.remove('active');
    elements.startMeetingBtn.innerHTML = '<span class="label">Capture Audio</span>';
  }
}

// ============================================
// MEETING TOGGLE
// ============================================

async function toggleMeeting() {
  console.log('🔘 Toggle meeting clicked. Current state:', appState.isMeetingActive);

  if (appState.isMeetingActive) {
    // End meeting
    stopRecording();
    appState.isMeetingActive = false;
    addSystemMessage('Meeting ended. Transcription stopped.');
  } else {
    // Start meeting
    try {
      appState.isMeetingActive = true;
      appState.transcript = [];

      // Clear transcript view
      if (elements.transcriptContent) {
        elements.transcriptContent.innerHTML = '';
      }

      console.log('🎤 Calling startRecording...');
      await startRecording();
      addSystemMessage('Capturing desktop audio! Interviewer speech will be transcribed.');
    } catch (error) {
      console.error('❌ Error in toggleMeeting:', error);
      appState.isMeetingActive = false;
      addSystemMessage('Error starting meeting: ' + error.message);
    }
  }

  updateMeetingButton();
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
  elements.startMeetingBtn = document.getElementById('startMeetingBtn');
  elements.stealthBtn = document.getElementById('stealthBtn');
  elements.minimizeBtn = document.getElementById('minimizeBtn');
  elements.closeBtn = document.getElementById('closeBtn');
  elements.toggleChatBtn = document.getElementById('toggleChatBtn');
  elements.transcriptContent = document.getElementById('transcriptContent');

  console.log('✅ DOM Elements loaded:', {
    startMeetingBtn: !!elements.startMeetingBtn,
    useScreenBtn: !!elements.useScreenBtn,
    answerBtn: !!elements.answerBtn,
    chatInput: !!elements.chatInput
  });

  // Event listeners
  elements.sendBtn?.addEventListener('click', sendMessage);
  elements.useScreenBtn?.addEventListener('click', captureScreen);
  elements.answerBtn?.addEventListener('click', getQuickAnswer);
  elements.startMeetingBtn?.addEventListener('click', toggleMeeting);
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

  // Connect to Vosk
  connectToVosk();

  // Welcome message
  addSystemMessage('Ready! Click "Capture Audio" to transcribe desktop audio (interviewer), or use "Use Screen" for visual content.');

  console.log('🎯 AI Assistant loaded');
});
