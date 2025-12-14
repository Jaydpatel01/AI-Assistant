const { app, BrowserWindow, ipcMain, globalShortcut, desktopCapturer } = require('electron');
const path = require('path');
const AIService = require('./services/ai-service');

// ============================================
// BASIC CONFIGURATION
// ============================================

const aiService = new AIService();
let overlayWindow = null;
let isVisible = true;

// ============================================
// WINDOW CREATION (Basic - No Stealth)
// ============================================

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 500,
    height: 400,  // Reduced to match actual content height
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,  // Hidden from taskbar
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Stealth mode starts OFF by default (visible in screen shares)
  // User can toggle it ON with the Stealth button

  overlayWindow.loadFile(path.join(__dirname, 'ui/overlay.html'));

  // Position in top-right corner
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;
  overlayWindow.setPosition(width - 520, 20);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

// ============================================
// HOTKEY REGISTRATION (Basic)
// ============================================

function registerHotkeys() {
  // Toggle overlay visibility: Ctrl+Shift+O
  globalShortcut.register('Control+Shift+O', () => {
    if (overlayWindow) {
      if (isVisible) {
        overlayWindow.hide();
        isVisible = false;
      } else {
        overlayWindow.show();
        isVisible = true;
      }
    }
  });

  console.log('⌨️ Hotkey registered: Ctrl+Shift+O (toggle overlay)');
}

// ============================================
// APP LIFECYCLE
// ============================================

app.whenReady().then(() => {
  createOverlayWindow();
  registerHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createOverlayWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  // ============================================
  // SESSION DATA WIPE (Privacy & Cleanup)
  // Prevents data accumulation on user's laptop
  // ============================================

  console.log('🧹 Wiping session data...');

  const fs = require('fs');
  const os = require('os');

  // 1. Wipe app's temp directory
  try {
    const tempDir = path.join(os.tmpdir(), 'ai-assistant-*');
    const tempDirs = require('fs').readdirSync(os.tmpdir())
      .filter(f => f.startsWith('ai-assistant'));

    tempDirs.forEach(dir => {
      const fullPath = path.join(os.tmpdir(), dir);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`✅ Wiped temp: ${fullPath}`);
      } catch (e) {
        // Ignore
      }
    });
  } catch (e) {
    // Ignore temp cleanup errors
  }

  // 2. Clear Electron session data (cookies, cache, storage)
  if (overlayWindow && overlayWindow.webContents) {
    try {
      overlayWindow.webContents.session.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'cachestorage']
      });
      console.log('✅ Wiped session storage');
    } catch (e) {
      // Ignore
    }
  }

  // 3. Clear any cached API responses from memory
  if (aiService) {
    try {
      aiService.client = null;
      aiService.model = null;
      console.log('✅ Wiped AI service from memory');
    } catch (e) {
      // Ignore
    }
  }

  console.log('✅ Session data wipe complete');
});

// ============================================
// ============================================
// IPC HANDLERS
// ============================================

ipcMain.on('log-message', (event, message) => {
  console.log(`[Renderer] ${message}`);
});



ipcMain.on('toggle-stealth', (event, enabled) => {
  if (overlayWindow) {
    overlayWindow.setContentProtection(enabled);
    console.log(`🔒 Stealth mode: ${enabled ? 'ON' : 'OFF'}`);
  }
});

ipcMain.on('minimize-window', () => {
  if (overlayWindow) {
    overlayWindow.minimize();
  }
});

ipcMain.on('close-window', () => {
  if (overlayWindow) {
    overlayWindow.hide();
    isVisible = false;
  }
});

ipcMain.on('close-app', () => {
  console.log('🚪 Closing app...');
  if (overlayWindow) {
    overlayWindow.destroy();
  }
  app.quit();
});

ipcMain.on('resize-window', (event, { width, height, x, y }) => {
  if (overlayWindow) {
    const currentBounds = overlayWindow.getBounds();
    overlayWindow.setBounds({
      x: x !== null && x !== undefined ? x : currentBounds.x,
      y: y !== null && y !== undefined ? y : currentBounds.y,
      width: width || currentBounds.width,
      height: height || currentBounds.height
    });
  }
});

ipcMain.handle('get-window-bounds', () => {
  if (overlayWindow) {
    return overlayWindow.getBounds();
  }
  return { x: 0, y: 0, width: 500, height: 600 };
});

// ============================================
// AI SERVICE HANDLERS
// ============================================

// Get API settings
ipcMain.handle('get-settings', async () => {
  try {
    const apiKeys = [];
    if (aiService.config.GEMINI_API_KEY) {
      apiKeys.push(aiService.config.GEMINI_API_KEY);
    }
    return {
      apiKeys: apiKeys,
      model: aiService.config.GEMINI_MODEL || 'gemini-2.5-flash-lite'
    };
  } catch (error) {
    console.error('❌ Error getting settings:', error);
    return { apiKeys: [], model: 'gemini-2.5-flash-lite' };
  }
});

// Handle AI queries
ipcMain.handle('query-ai', async (event, data) => {
  try {
    const response = await aiService.query(data.prompt, data.context);
    return response;
  } catch (error) {
    console.error('❌ AI query error:', error.message);
    throw error;
  }
});

// Handle screen text extraction (OCR)
ipcMain.handle('extract-screen-text', async (event, data) => {
  try {
    const base64Image = typeof data === 'string' ? data : data.imageData;
    const result = await aiService.extractTextFromImage(base64Image);
    return result;
  } catch (error) {
    console.error('❌ OCR error:', error);
    return { success: false, error: error.message, text: '' };
  }
});

// Get screen sources for capture
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window']
    });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      display_id: source.display_id
    }));
  } catch (error) {
    console.error('Error getting screen sources:', error);
    throw error;
  }
});

console.log('🎯 AI Assistant starting...');
