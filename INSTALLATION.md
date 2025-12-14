# AI Assistant - Installation Guide

> Get up and running in 3 simple steps!

---

## ⚡ Quick Start (3 Steps)

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/ai-assistant.git
cd ai-assistant
npm install
```

### 2. Run Setup (Automatic)

```bash
npm run setup
```

This automatically:
- ✅ Creates Python virtual environment
- ✅ Installs Vosk speech recognition
- ✅ Downloads the speech model (~40MB)

### 3. Add API Key

```bash
# Copy the example config
cp .env.example .env

# Edit .env and add your Gemini API key
# Get one free at: https://aistudio.google.com/apikey
```

Edit `.env` file:
```
GEMINI_API_KEY=your_api_key_here
```

### 4. Run!

```bash
npm start
```

---

## 📋 Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
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

**Windows**: Make sure to check "Add Python to PATH" during install.

### "npm run setup" fails

Run steps manually:
```bash
# Windows
python -m venv .venv
.venv\Scripts\pip install vosk

# macOS/Linux
python3 -m venv .venv
.venv/bin/pip install vosk
```

Then download model manually from:
https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip

Extract to `models/` folder.

### "No AI providers configured"

Check that:
1. `.env` file exists in project root
2. It contains `GEMINI_API_KEY=your_actual_key`
3. No spaces around the `=`

### Speech recognition not working

1. Make sure you ran `npm run setup`
2. Check the `models/` folder contains the Vosk model
3. Restart the app

---

## 📁 Project Structure

```
ai-assistant/
├── src/
│   ├── main.js           # Main process
│   └── ui/               # UI files
├── scripts/
│   └── setup.js          # Auto-setup script
├── models/               # Speech model (after setup)
├── .env                  # Your API key
├── vosk_server.py        # Speech server
└── package.json
```

---

## 📄 License

MIT License - Free for personal and commercial use.
