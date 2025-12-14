#!/usr/bin/env node
/**
 * AI Assistant - Setup Script
 * Automates Python venv creation, Vosk installation, and model download
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream, existsSync, mkdirSync, rmSync } = fs;

const ROOT_DIR = path.join(__dirname, '..');
const VENV_DIR = path.join(ROOT_DIR, '.venv');
const MODELS_DIR = path.join(ROOT_DIR, 'models');
const MODEL_NAME = 'vosk-model-small-en-us-0.15';
const MODEL_URL = `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logStep(step, msg) {
    log(`\n[${step}] ${msg}`, 'cyan');
}

function logSuccess(msg) {
    log(`✅ ${msg}`, 'green');
}

function logWarn(msg) {
    log(`⚠️ ${msg}`, 'yellow');
}

function logError(msg) {
    log(`❌ ${msg}`, 'red');
}

// Extract zip file using system tools (PowerShell on Windows)
async function extractZip(zipPath, destDir) {
    try {
        if (process.platform === 'win32') {
            execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, { stdio: 'inherit' });
        } else {
            execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' });
        }
        rmSync(zipPath);
        logSuccess('Model extracted');
    } catch (e) {
        // Fallback: try adm-zip
        try {
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(destDir, true);
            rmSync(zipPath);
            logSuccess('Model extracted (via adm-zip)');
        } catch (extractErr) {
            logError(`Failed to extract: ${extractErr.message}`);
            logWarn('Please manually extract the zip file in models/ folder');
            throw extractErr;
        }
    }
}

// Check if Python is installed
function checkPython() {
    logStep('1/4', 'Checking Python installation...');

    const pythonCommands = ['python', 'python3', 'py'];

    for (const cmd of pythonCommands) {
        try {
            const version = execSync(`${cmd} --version`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
            if (version.includes('Python 3')) {
                logSuccess(`Found ${version.trim()}`);
                return cmd;
            }
        } catch (e) {
            continue;
        }
    }

    logError('Python 3 not found!');
    log('Please install Python 3.8+ from https://python.org', 'yellow');
    process.exit(1);
}

// Create Python virtual environment
function createVenv(pythonCmd) {
    logStep('2/4', 'Creating Python virtual environment...');

    if (existsSync(VENV_DIR)) {
        logWarn('.venv already exists, skipping creation');
        return;
    }

    try {
        execSync(`${pythonCmd} -m venv "${VENV_DIR}"`, {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });
        logSuccess('Virtual environment created');
    } catch (e) {
        logError(`Failed to create venv: ${e.message}`);
        process.exit(1);
    }
}

// Install Vosk in the virtual environment
function installVosk() {
    logStep('3/4', 'Installing Vosk speech recognition...');

    const isWindows = process.platform === 'win32';
    const pipPath = isWindows
        ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
        : path.join(VENV_DIR, 'bin', 'pip');

    try {
        execSync(`"${pipPath}" install vosk`, {
            cwd: ROOT_DIR,
            stdio: 'inherit'
        });
        logSuccess('Vosk installed successfully');
    } catch (e) {
        logError(`Failed to install Vosk: ${e.message}`);
        process.exit(1);
    }
}

// Download and extract Vosk model
async function downloadModel() {
    logStep('4/4', 'Downloading speech recognition model...');

    const modelPath = path.join(MODELS_DIR, MODEL_NAME);
    const zipPath = path.join(MODELS_DIR, `${MODEL_NAME}.zip`);

    // Check if model folder exists AND has content
    if (existsSync(modelPath)) {
        try {
            const contents = require('fs').readdirSync(modelPath);
            if (contents.length > 0) {
                logWarn('Model already exists, skipping download');
                return;
            }
        } catch (e) {
            // Folder exists but can't read - try to continue
        }
    }

    // Create models directory if needed
    if (!existsSync(MODELS_DIR)) {
        mkdirSync(MODELS_DIR, { recursive: true });
    }

    // Check if zip already exists (from previous failed extraction)
    if (existsSync(zipPath)) {
        log('Found existing zip file, extracting...', 'yellow');
        try {
            await extractZip(zipPath, MODELS_DIR);
            return;
        } catch (e) {
            logError(`Extraction failed: ${e.message}`);
            throw e;
        }
    }

    log('Downloading model (~40MB)... This may take a few minutes.');

    return new Promise((resolve, reject) => {
        const file = createWriteStream(zipPath);

        https.get(MODEL_URL, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // Follow redirect
                https.get(response.headers.location, (res) => {
                    const total = parseInt(res.headers['content-length'], 10);
                    let downloaded = 0;

                    res.on('data', (chunk) => {
                        downloaded += chunk.length;
                        const percent = ((downloaded / total) * 100).toFixed(1);
                        process.stdout.write(`\r   Downloading: ${percent}%`);
                    });

                    res.pipe(file);

                    file.on('finish', async () => {
                        file.close();
                        console.log('');
                        logSuccess('Download complete');

                        // Extract zip - use PowerShell on Windows (more reliable)
                        log('Extracting model...');
                        try {
                            if (process.platform === 'win32') {
                                // PowerShell extraction (most reliable on Windows)
                                execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${MODELS_DIR}' -Force"`, { stdio: 'inherit' });
                            } else {
                                // Unix unzip
                                execSync(`unzip -o "${zipPath}" -d "${MODELS_DIR}"`, { stdio: 'inherit' });
                            }
                            rmSync(zipPath);
                            logSuccess('Model extracted');
                            resolve();
                        } catch (e) {
                            // Fallback: try adm-zip
                            try {
                                const AdmZip = require('adm-zip');
                                const zip = new AdmZip(zipPath);
                                zip.extractAllTo(MODELS_DIR, true);
                                rmSync(zipPath);
                                logSuccess('Model extracted (via adm-zip)');
                                resolve();
                            } catch (extractErr) {
                                logError(`Failed to extract: ${extractErr.message}`);
                                logWarn('Please manually extract the zip file in models/ folder');
                                reject(extractErr);
                            }
                        }
                    });
                });
            } else {
                // Non-redirect response - pipe directly
                const total = parseInt(response.headers['content-length'], 10);
                let downloaded = 0;

                response.on('data', (chunk) => {
                    downloaded += chunk.length;
                    if (total) {
                        const percent = ((downloaded / total) * 100).toFixed(1);
                        process.stdout.write(`\r   Downloading: ${percent}%`);
                    }
                });

                response.pipe(file);

                file.on('finish', async () => {
                    file.close();
                    console.log('');
                    logSuccess('Download complete');

                    // Extract zip
                    log('Extracting model...');
                    try {
                        await extractZip(zipPath, MODELS_DIR);
                        resolve();
                    } catch (e) {
                        logError(`Extraction failed: ${e.message}`);
                        logWarn('Please manually extract the zip file in models/ folder');
                        reject(e);
                    }
                });
            }
        }).on('error', (err) => {
            rmSync(zipPath, { force: true });
            logError(`Download failed: ${err.message}`);
            reject(err);
        });
    });
}

// Main setup function
async function main() {
    console.log('\n🎯 AI Assistant - Setup\n');
    console.log('This will set up Python, Vosk, and download the speech model.\n');

    // Step 1: Check Python
    const pythonCmd = checkPython();

    // Step 2: Create venv
    createVenv(pythonCmd);

    // Step 3: Install Vosk
    installVosk();

    // Step 4: Download model
    try {
        await downloadModel();
    } catch (e) {
        logWarn('Model download failed. You can manually download from:');
        log(`   ${MODEL_URL}`, 'yellow');
        log(`   Extract to: ${MODELS_DIR}`, 'yellow');
    }

    console.log('\n' + '='.repeat(50));
    logSuccess('Setup complete!\n');
    log('Next steps:', 'cyan');
    log('  1. Copy .env.example to .env');
    log('  2. Add your Gemini API key to .env');
    log('  3. Run: npm start\n');
}

main().catch(console.error);
