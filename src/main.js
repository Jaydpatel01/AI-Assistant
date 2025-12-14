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
// VOSK PROCESS MANAGEMENT (Local Speech Recognition)
// ============================================

let voskProcess = null;
let voskProcessStarting = false;

/**
 * Get Python executable path (cross-platform, works in dev and production)
 */
function getPythonExecutable() {
  const fs = require('fs');
  const { execSync } = require('child_process');

  // In production, check for bundled Python or system Python
  const isPackaged = app.isPackaged;

  // Check various locations in priority order
  const possiblePaths = [];

  if (isPackaged) {
    // Production mode - check bundled venv in resources folder
    possiblePaths.push(
      path.join(process.resourcesPath, '.venv/Scripts/python.exe'),  // Windows bundled venv
      path.join(process.resourcesPath, '.venv/bin/python')           // Linux/macOS bundled venv
    );
  } else {
    // Development mode - check local venv first
    possiblePaths.push(
      path.join(__dirname, '../.venv/Scripts/python.exe'),  // Windows venv
      path.join(__dirname, '../.venv/bin/python')           // Linux/macOS venv
    );
  }

  // Always check system Python as fallback
  possiblePaths.push('python', 'python3');

  for (const pythonPath of possiblePaths) {
    try {
      // For full paths, check if file exists
      if (path.isAbsolute(pythonPath) || pythonPath.includes('/') || pythonPath.includes('\\')) {
        if (fs.existsSync(pythonPath)) {
          return pythonPath;
        }
      } else {
        // For 'python' or 'python3', check if it's in PATH
        try {
          const cmd = process.platform === 'win32' ? `where ${pythonPath}` : `which ${pythonPath}`;
          const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
          if (result.trim()) {
            return pythonPath;  // Return the command name, spawn will find it
          }
        } catch (e) {
          // Command not found, continue to next option
        }
      }
    } catch (e) {
      continue;
    }
  }

  // Last resort - just return 'python' and hope it works
  console.warn('⚠️ Could not find Python executable, trying "python" anyway');
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Start Vosk server process
 */
async function startVoskProcess() {
  if (voskProcess || voskProcessStarting) {
    console.log('📡 Vosk server already running or starting');
    return { success: true, message: 'Already running' };
  }

  voskProcessStarting = true;
  console.log('📡 Starting Vosk speech recognition server...');

  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const pythonExe = getPythonExecutable();

    // Get correct paths for dev vs production
    let scriptPath, workingDir, modelsDir;
    if (app.isPackaged) {
      // Production: files are in resources/app.asar.unpacked or resources
      workingDir = path.join(process.resourcesPath, 'app.asar.unpacked');
      scriptPath = path.join(workingDir, 'vosk_server.py');
      modelsDir = path.join(process.resourcesPath, 'models');

      // If unpacked doesn't exist, try app.asar (though Python can't run from asar)
      if (!require('fs').existsSync(scriptPath)) {
        // Fall back to extraResources location
        workingDir = process.resourcesPath;
        scriptPath = path.join(workingDir, 'vosk_server.py');
      }
    } else {
      // Development mode
      workingDir = path.join(__dirname, '..');
      scriptPath = path.join(workingDir, 'vosk_server.py');
      modelsDir = path.join(workingDir, 'models');
    }

    console.log(`📡 Python: ${pythonExe}`);
    console.log(`📡 Script: ${scriptPath}`);
    console.log(`📡 Working Dir: ${workingDir}`);

    try {
      voskProcess = spawn(pythonExe, [scriptPath], {
        cwd: workingDir,
        env: { ...process.env, MODELS_DIR: modelsDir },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let resolved = false;

      // Handle stdout
      voskProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[Vosk] ${output}`);

        if (!resolved && output.includes('ready')) {
          resolved = true;
          voskProcessStarting = false;
          resolve({ success: true, message: 'Vosk server started', pid: voskProcess.pid });
        }
      });

      // Handle stderr
      voskProcess.stderr.on('data', (data) => {
        console.error(`[Vosk Error] ${data.toString()}`);
      });

      // Handle exit
      voskProcess.on('exit', (code) => {
        console.log(`🛑 Vosk process exited (code: ${code})`);
        voskProcess = null;
        voskProcessStarting = false;
        if (!resolved) {
          resolved = true;
          resolve({ success: false, message: `Vosk exited with code ${code}` });
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          voskProcessStarting = false;
          resolve({ success: true, message: 'Vosk server starting (timeout reached)', pid: voskProcess?.pid });
        }
      }, 30000);

    } catch (error) {
      voskProcessStarting = false;
      console.error('❌ Failed to start Vosk:', error.message);
      resolve({ success: false, message: error.message });
    }
  });
}

/**
 * Stop Vosk server process
 */
async function stopVoskProcess() {
  if (!voskProcess) {
    console.log('📡 No Vosk process to stop');
    return { success: true };
  }

  console.log('🛑 Stopping Vosk server...');

  return new Promise((resolve) => {
    voskProcess.on('exit', () => {
      console.log('✅ Vosk server stopped');
      voskProcess = null;
      resolve({ success: true });
    });

    voskProcess.kill('SIGTERM');

    // Force kill after 5 seconds
    setTimeout(() => {
      if (voskProcess) {
        voskProcess.kill('SIGKILL');
        voskProcess = null;
      }
      resolve({ success: true });
    }, 5000);
  });
}

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

  // Auto-start Vosk when window loads
  overlayWindow.webContents.on('did-finish-load', async () => {
    console.log('🖥️ Overlay window loaded');
    await startVoskProcess();
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

  // Stop Vosk process
  if (voskProcess) {
    console.log('🧹 Cleaning up Vosk process...');
    try {
      voskProcess.kill('SIGTERM');
    } catch (e) {
      // Ignore errors
    }
  }

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

// ============================================
// VOSK IPC HANDLERS
// ============================================

ipcMain.handle('vosk-start', async () => {
  console.log('📡 IPC: vosk-start requested');
  return await startVoskProcess();
});

ipcMain.handle('vosk-stop', async () => {
  console.log('📡 IPC: vosk-stop requested');
  return await stopVoskProcess();
});

ipcMain.handle('vosk-status', async () => {
  return {
    isRunning: voskProcess !== null,
    pid: voskProcess?.pid || null
  };
});

console.log('🎯 AI Assistant starting...');
