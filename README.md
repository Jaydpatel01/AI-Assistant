# AI Assistant

An open-source AI-powered meeting assistant that provides real-time transcription and intelligent responses.

---

## How It Works

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         YOUR COMPUTER (LOCAL)                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐       │
│   │  MICROPHONE  │ ───► │    VOSK      │ ───► │   OVERLAY    │       │
│   │   (Audio)    │      │  (Local AI)  │      │     UI       │       │
│   └──────────────┘      └──────────────┘      └──────┬───────┘       │
│                                                      │               │
│   ┌──────────────┐                                   │               │
│   │    SCREEN    │ ─────────────────────────────────►│               │
│   │  (Screenshot)│                                   │               │
│   └──────────────┘                                   │               │
│                                                      ▼               │
└───────────────────────────────────────────────────────┬──────────────┘
                                                        │
                                                        │ (Your question +
                                                        │  context sent)
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       GOOGLE GEMINI API (CLOUD)                     │
│                                                                     │
│   • Receives: Your question + transcript context + screen text      │
│   • Returns: AI-generated response                                  │
│   • Uses: YOUR API key (you control usage)                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow & Privacy

### What Stays LOCAL (Never Leaves Your Computer)

| Data | Where Stored | When Deleted |
|------|--------------|--------------|
| Audio from microphone | Memory only | When you stop recording |
| Voice transcription | Memory only | When app closes |
| Screenshots | Memory only | After text extraction |
| App settings | Local config | When you delete them |

### What Goes to the CLOUD (Google's Servers)

| Data | When Sent | Purpose |
|------|-----------|---------|
| Your typed questions | When you ask | To get AI response |
| Recent transcript text | With questions | For context |
| Screenshot text (OCR) | When you capture screen | To extract text & provide context |

> **🔒 PII Protection**: Before ANY data is sent to the cloud, it passes through our PII masking system.

### PII Masking (Automatic)

The app automatically redacts sensitive information before sending to Google's API:

| PII Type | Example | Becomes |
|----------|---------|---------|
| Email addresses | john@email.com | `[EMAIL]` |
| Phone numbers | +1-555-123-4567 | `[PHONE]` |
| Credit cards | 4111-1111-1111-1111 | `[CARD]` |
| SSN (US) | 123-45-6789 | `[SSN]` |
| Aadhaar (India) | 1234 5678 9012 | `[AADHAAR]` |
| PAN (India) | ABCDE1234F | `[PAN]` |
| IP addresses | 192.168.1.1 | `[IP]` |
| API keys | sk-abc123... | `[API_KEY]` |

This happens **automatically** - you don't need to do anything.

### API Key Usage

- **Your API key** is stored in `.env` file on your computer
- **Never committed** to version control (blocked by .gitignore)
- **You control** all API usage and costs
- **Google sees** your queries in their API dashboard (with PII masked)

---

## Features

### 1. Speech-to-Text (Vosk - 100% Local)
- Runs entirely on your computer
- No internet required for transcription
- Audio never leaves your machine
- Supports English (other models available)

### 2. AI Chat (Gemini - Cloud)
- Ask questions about your meeting/interview
- AI responds with context-aware answers
- Rate-limited to prevent quota issues (4 sec cooldown)

### 3. Screen Capture & OCR
- Manual screenshot (you control when)
- Text extracted via Gemini Vision
- Useful for coding questions, shared screens

### 4. Session Cleanup
- All data wiped when app closes
- No persistent storage of conversations
- No logs or history saved

---

## Installation

### Prerequisites
- Node.js 18+
- Python 3.8+
- Gemini API key (free at https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/ai-assistant.git
cd ai-assistant

# 2. Install dependencies
npm install

# 3. Run automated setup (creates Python env, installs Vosk, downloads model)
npm run setup

# 4. Configure API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 5. Start the app
npm start
```

---

## Usage

### Quick Start Workflow

1. **Launch**: Run `npm start`
2. **Start Meeting**: Click "Start Meeting" button
3. **Talk**: Speak into your microphone (transcription starts)
4. **Ask Questions**: Type questions in chat, get AI answers
5. **End**: Click "End Meeting" or close app (data auto-wipes)

---

### Detailed Usage Guide

#### Starting a Meeting
1. Click **"Start Meeting"** to begin transcription
2. Speak clearly into your microphone
3. Transcript appears in the left panel in real-time
4. Both your voice and system audio are captured

#### Asking Questions to AI
1. Type your question in the chat input at the bottom
2. Press **Enter** or click the **Send** button
3. AI responds using context from:
   - Your recent transcript (last 10 entries)
   - Screenshot text (if captured)
4. Wait 4 seconds between questions (rate limit protection)

#### Using Screen Capture
1. Click **"Use Screen"** to capture your screen
2. The app extracts all visible text via OCR
3. This text is automatically added to context
4. Future AI questions will reference this screen content
5. **Tip**: Capture coding problems, shared documents, or interview questions

#### Ending Session
1. Click **"End Meeting"** or simply close the app
2. All session data is automatically wiped:
   - Transcript cleared
   - Screen context cleared
   - No files saved to disk

---

### Best Practices

#### For Interviews
| Tip | Why |
|-----|-----|
| Position mic close to speakers | Better capture of interviewer's voice |
| Capture coding problems with screenshot | AI can help with solutions |
| Ask specific questions | "What's the time complexity?" vs "Help" |
| Wait for complete questions | Don't ask mid-sentence |

#### For Meetings
| Tip | Why |
|-----|-----|
| Start transcription at beginning | Captures full context |
| Screenshot important slides | Preserves visual context |
| Ask for summaries at end | "Summarize key action items" |

#### For Efficiency
| Action | Benefit |
|--------|---------|
| Use short, clear questions | Faster responses |
| Capture screens with text | Better AI context |
| Don't spam requests | Avoid rate limits |
| Close other mic apps | Cleaner audio capture |

---

### Example Questions You Can Ask

| Context | Example Question |
|---------|------------------|
| During interview | "How should I answer this behavioral question?" |
| Coding problem | "What's the optimal approach for this algorithm?" |
| Technical discussion | "Explain this concept in simpler terms" |
| Meeting notes | "Summarize what was discussed about the deadline" |
| With screenshot | "What's the answer to this question on screen?" |

---

### What the AI Knows

The AI has access to:
- ✅ Your last 10 transcript entries
- ✅ Text from your latest screenshot
- ✅ Your current question

The AI does NOT know:
- ❌ Previous conversations (session-only)
- ❌ Your files or system
- ❌ Anything not captured by mic/screenshot

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+O` | Toggle overlay back after minizing |

---

## Configuration

### .env File Options

```env
# Required: Your Gemini API key
GEMINI_API_KEY=your_key_here

# Optional: Model name (default: gemini-2.5-flash-lite)
GEMINI_MODEL=gemini-2.5-flash-lite
```

---

## Rate Limits

The app includes built-in rate limiting to prevent API errors:

| Limit | Value |
|-------|-------|
| Minimum time between requests | 4 seconds |
| Auto-increase on 429 error | Yes (up to 10 sec) |
| Visual feedback | Shows countdown in chat |

### Gemini Free Tier Limits
- 15 requests per minute
- 1,500 requests per day
- More than enough for normal use

---

## Security

### What We Do
- ✅ API keys stored locally only
- ✅ .gitignore blocks all sensitive files
- ✅ Session data cleared on close
- ✅ No analytics or tracking
- ✅ No data collection by the app

### What You Should Know
- ⚠️ Your queries go to Google's Gemini API
- ⚠️ Google can see your API usage
- ⚠️ Keep your .env file private
- ⚠️ Don't share your API key

---

## Project Structure

```
ai-assistant/
├── src/
│   ├── main.js              # Electron main process
│   ├── services/
│   │   └── ai-service.js    # Gemini API integration
│   └── ui/
│       ├── overlay.html     # UI structure
│       ├── overlay.css      # Styling
│       └── overlay.js       # UI logic & audio handling
├── scripts/
│   └── setup.js             # Automated setup script
├── models/                   # Vosk speech model (after setup)
├── vosk_server.py           # Local speech recognition server
├── .env.example             # API key template
├── .gitignore               # Security exclusions
├── INSTALLATION.md          # Detailed setup guide
├── LICENSE                  # MIT License
└── package.json             # Dependencies & scripts
```

---

## Troubleshooting

### "Speech recognition not working"
1. Ensure `npm run setup` completed successfully
2. Check `models/` folder contains Vosk model
3. Restart the app

### "API key issue"
1. Verify `.env` file exists in project root
2. Check `GEMINI_API_KEY=` has no spaces
3. Ensure key is valid at https://aistudio.google.com

### "Rate limit reached"
- Wait a few seconds before next request
- The app auto-handles this with cooldowns

### "No microphone found"
- Check your microphone is connected
- Allow microphone access when prompted
- Close other apps using the microphone

---

## License

MIT License - Free for personal and commercial use.

---

## Disclaimer

This is an open-source tool for educational purposes. Users are responsible for:
- Their own API key usage and costs
- Compliance with their organization's policies
- Appropriate use during meetings/interviews

The app does not store, share, or sell any user data.
