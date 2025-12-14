# AI Assistant - Installation Guide

> Complete setup guide from clone to running the app!

---

## ⚡ Quick Start (Development Mode)

### Step 1: Clone and Install Dependencies

```bash
git clone https://github.com/YOUR_USERNAME/ai-assistant.git
cd ai-assistant
npm install
```

### Step 2: Run Setup Script (Automatic)

```bash
npm run setup
```

This automatically:
- ✅ Creates Python virtual environment
- ✅ Installs Vosk speech recognition
- ✅ Downloads the speech model (~40MB)

### Step 3: Add Your API Key

```bash
# Copy the example config
cp .env.example .env
```

Edit the `.env` file and add your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

> **Get a free API key:** https://aistudio.google.com/apikey

### Step 4: Run the App

```bash
npm start
```

The overlay window will appear. Use `Ctrl+Shift+O` to toggle visibility.

---

## 🏗️ Building for Production

### Step 1: Build the Application

```bash
npm run build
```

> ⏳ **Please be patient!** The build process takes some time as it bundles the Python environment, Vosk model, and Electron app together.

### Step 2: Find the Built App

After build completes, your app is located in:

```
dist/
├── win-unpacked/           ← Portable app folder
│   └── AI Assistant.exe    ← Run this directly!
└── AI Assistant-1.0.0.exe  ← Installer for distribution (Ignore this and run
                              AI Assistant.exe)
```

### Step 3: Configure the Built App

**Important:** Copy your `.env` file to the built app folder:

```bash
# Copy .env to the portable app folder
cp .env dist/win-unpacked/
```

Or manually copy the `.env` file to `dist/win-unpacked/` folder.

### Step 4: Run the Built App

Navigate to `dist/win-unpacked/` and double-click `AI Assistant.exe`

---

## 📋 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18+ | `node --version` |
| Python | 3.8+ | `python --version` |

---

## 🔑 Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google
3. Click **"Create API Key"**
4. Copy the key to your `.env` file

**Free tier includes:**
- 15 requests per minute
- 1,500 requests per day

---

## 🐛 Troubleshooting

### "Python not found"

Install Python 3.8+ from https://python.org

**Windows:** Make sure to check "Add Python to PATH" during installation.

### "npm run setup" fails

Run steps manually:
```bash
# Windows
python -m venv .venv
.venv\Scripts\pip install vosk websockets

# macOS/Linux
python3 -m venv .venv
.venv/bin/pip install vosk websockets
```

Then download model manually from:
https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip

Extract to `models/` folder.

### "No AI providers configured" or API key errors

Check that:
1. `.env` file exists in project root (or `dist/win-unpacked/` for built app)
2. It contains `GEMINI_API_KEY=your_actual_key`
3. No spaces around the `=`

### Speech recognition not working

1. Make sure you ran `npm run setup`
2. Check the `models/` folder contains the Vosk model
3. Restart the app

### Built app shows "spawn python ENOENT"

The Python environment wasn't bundled correctly. Ensure:
1. You ran `npm run setup` before building
2. The `.venv` folder exists in project root
3. Rebuild with `npm run build`

---

## 📁 Project Structure

```
ai-assistant/
├── src/
│   ├── main.js           # Main Electron process
│   ├── services/         # AI service
│   └── ui/               # Overlay UI
├── scripts/
│   └── setup.js          # Auto-setup script
├── models/               # Speech model (after setup)
├── .venv/                # Python environment (after setup)
├── dist/                 # Built app (after build)
├── .env                  # Your API key (create this!)
├── vosk_server.py        # Speech recognition server
└── package.json
```

---

## 📄 License

MIT License - Free for personal and commercial use.

