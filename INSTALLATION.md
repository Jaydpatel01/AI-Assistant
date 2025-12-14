# AI Assistant - Installation Guide

> Get up and running in 2 simple steps!

---

## ⚡ Quick Start

### Step 1: Clone and Install

```bash
git clone https://github.com/Jaydpatel01/AI-Assistant.git
cd AI-Assistant
npm install
```

### Step 2: Add Your API Key

```bash
# Copy the example config
cp .env.example .env
```

Edit the `.env` file and add your Gemini API key:
```
GEMINI_API_KEY=your_api_key_here
```

> **Get a free API key:** https://aistudio.google.com/apikey

### Step 3: Run the App

```bash
npm start
```

The overlay window will appear. Use `Ctrl+Shift+O` to toggle visibility.

---

## 🏗️ Building for Production

```bash
npm run build
```

> ⏳ **Please be patient!** The build process takes some time.

**After build completes:**

```
dist/
├── win-unpacked/           ← Portable app folder
│   └── AI Assistant.exe    ← Run this directly!
└── AI Assistant-1.0.0.exe  ← Installer
```

**Important:** Copy your `.env` file to `dist/win-unpacked/` folder.

---

## 📋 Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 18+ | `node --version` |

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

### "No AI providers configured" or API key errors

Check that:
1. `.env` file exists in project root (or `dist/win-unpacked/` for built app)
2. It contains `GEMINI_API_KEY=your_actual_key`
3. No spaces around the `=`

### Screen capture not working

1. Make sure you allow screen sharing permissions when prompted
2. Try restarting the app

---

## 📁 Project Structure

```
ai-assistant/
├── src/
│   ├── main.js           # Main Electron process
│   ├── services/         # AI service
│   └── ui/               # Overlay UI
├── dist/                 # Built app (after build)
├── .env                  # Your API key (create this!)
└── package.json
```

---

## 📄 License

MIT License - Free for personal and commercial use.
