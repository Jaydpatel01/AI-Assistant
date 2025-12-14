# AI Assistant

An open-source AI-powered assistant that provides intelligent answers using screen capture and OCR.

> **⚠️ LEGAL DISCLAIMER:** This software is for **personal educational use only**. You are solely responsible for ensuring lawful use. The authors are NOT liable for any misuse. See [LICENSE](LICENSE) for full terms.

---

## How It Works

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         YOUR COMPUTER (LOCAL)                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐                           ┌──────────────┐        │
│   │    SCREEN    │ ────── OCR & Text ──────► │   OVERLAY    │        │
│   │  (Screenshot)│       Extraction          │     UI       │        │
│   └──────────────┘                           └──────┬───────┘        │
│                                                      │               │
│                                                      ▼               │
└───────────────────────────────────────────────────────┬──────────────┘
                                                        │
                                                        │ (Your question +
                                                        │  screen context)
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       GOOGLE GEMINI API (CLOUD)                     │
│                                                                     │
│   • Receives: Your question + screen text context                   │
│   • Returns: AI-generated response                                  │
│   • Uses: YOUR API key (you control usage)                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow & Privacy

### What Stays LOCAL (Your Computer)
| Data | Where Stored | When Deleted |
|------|--------------|--------------|
| Screenshots | Memory only | After text extraction |
| App settings | Local config | When you delete them |

### What Goes to CLOUD (Google's Servers)
| Data | When Sent | Purpose |
|------|-----------|---------|
| Your typed questions | When you ask | To get AI response |
| Screenshot text (OCR) | When you capture screen | To extract text & provide context |

> **🔒 PII Protection**: Before ANY data is sent to the cloud, it passes through our PII masking system.

### PII Masking (Automatic)

The app automatically redacts sensitive information before sending to Google's API:

| Pattern | Example | Masked As |
|---------|---------|-----------|
| Email addresses | john@company.com | `[EMAIL]` |
| Phone numbers | +1-555-123-4567 | `[PHONE]` |
| SSN | 123-45-6789 | `[SSN]` |
| Credit cards | 4111-1111-1111-1111 | `[CC]` |
| IP addresses | 192.168.1.100 | `[IP]` |
| API keys | sk-abc123... | `[API_KEY]` |
| URLs with tokens | https://site.com?token=xxx | `[URL_WITH_TOKEN]` |

---

## Platform Support

| Platform | Status |
|----------|--------|
| **Windows** | ✅ Fully tested and supported |
| **macOS** | ⚠️ Experimental (should work, not fully tested) |
| **Linux** | ⚠️ Experimental (should work, not fully tested) |

**Tips for macOS/Linux users:**
- Use `python3` instead of `python` if issues arise
- Run `chmod +x` on scripts if you get permission errors
- Ensure your system allows screen recording permissions
- Build with `npm run build:mac` or `npm run build:linux`

> **Note:** Full macOS and Linux support coming soon! If you encounter issues, please open a GitHub issue.

---

## Features

### 1. Screen Capture & OCR
- Manual screenshot (you control when)
- Text extracted via Gemini Vision AI
- Useful for coding questions, shared screens, documents

### 2. AI Chat (Gemini - Cloud)
- Ask questions about your screen content
- AI responds with context-aware answers
- Rate-limited to prevent quota issues

### 3. Stealth Mode
- Toggle visibility in screen shares
- Overlay stays on top of other windows
- Drag to reposition anywhere

### 4. Session Cleanup
- All data wiped when app closes
- No persistent storage of conversations
- No logs or history saved

---

## Installation

### Prerequisites
- Node.js 18+
- Gemini API key (free at https://aistudio.google.com/apikey)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Jaydpatel01/AI-Assistant.git
cd AI-Assistant

# 2. Install dependencies
npm install

# 3. Configure API key
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Start the app
npm start
```

### Building for Production

```bash
# Build the app (be patient, this takes some time)
npm run build
```

After building:
1. **App location:** `dist/win-unpacked/AI Assistant.exe`
2. **Installer:** `dist/AI Assistant-1.0.0.exe`
3. **Important:** Copy your `.env` file to `dist/win-unpacked/` folder

---

## Usage

### Quick Start Workflow

1. **Launch**: Run `npm start`
2. **Capture Screen**: Click "Use Screen" to capture and analyze screen content
3. **Ask Questions**: Type questions or click "Answer" for AI responses
4. **End**: Close the app (data auto-wipes)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+O` | Toggle overlay visibility |

### Using Screen Capture

1. Click **"Use Screen"** to take a screenshot
2. The app extracts text via Gemini Vision OCR
3. This context is used when you ask questions
4. Click "Answer" with screen context for best results

### Using AI Chat

1. Type your question in the input box
2. Press **Enter** or click **Send**
3. The AI responds using your screen context (if available)

### Best Practices

| Tip | Why |
|-----|-----|
| Capture relevant screens | Gives AI better context |
| Be specific in questions | Get more accurate answers |
| Use stealth mode when needed | Privacy in screen sharing |
| Wait between requests | Avoid rate limits |

---

## Project Structure

```
ai-assistant/
├── src/
│   ├── main.js              # Electron main process
│   ├── services/
│   │   └── ai-service.js    # Gemini API integration
│   ├── utils/
│   │   └── pii-mask.js      # PII masking utility
│   └── ui/
│       ├── overlay.html     # UI structure
│       ├── overlay.css      # Styling
│       └── overlay.js       # UI logic
├── .env.example             # API key template
├── .gitignore               # Security exclusions
├── INSTALLATION.md          # Detailed setup guide
├── PREMIUM.md               # Premium features comparison
├── LICENSE                  # MIT License
└── package.json             # Dependencies & scripts
```

---

## Troubleshooting

### "API key issue"
1. Verify `.env` file exists in project root
2. Check `GEMINI_API_KEY=` has no spaces
3. Ensure key is valid at https://aistudio.google.com

### "Rate limit reached"
- Free tier is limited to ~20 requests/day (as of Dec 2025)
- Wait for quota reset (usually 24 hours)
- Consider creating a new API key

### Screen capture not working
- Allow screen sharing permissions when prompted
- Try restarting the app
- Check if other apps are blocking screen capture

### App not starting
1. Ensure Node.js 18+ is installed (`node --version`)
2. Run `npm install` to ensure dependencies are installed
3. Check the `.env` file exists and has a valid API key

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Your Google Gemini API key |
| `GEMINI_MODEL` | No | Model to use (default: `gemini-2.5-flash-lite`) |

### Getting an API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key to your `.env` file

> **Note:** Free tier has limited requests per day. Check your usage at https://ai.dev/usage

---

## Security Considerations

### What We Do
- ✅ PII masking before any cloud requests
- ✅ Session data wipes on close
- ✅ No persistent storage of conversations
- ✅ Your API key stays local

### Your Responsibility
- 🔐 Never share your `.env` file
- 🔐 Don't expose your API key publicly
- 🔐 Review what's on screen before capturing
- 🔐 Use stealth mode in sensitive situations

### Privacy Summary
The app does not store, share, or sell any user data. All processing is session-based and wiped on close. Only the minimum necessary data (with PII masked) is sent to Google's API for AI responses.

---

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - See [LICENSE](LICENSE) file for details.

**⚠️ This software is provided AS-IS. The authors accept NO responsibility for any consequences of use.**

---

## Disclaimer

This software is for **personal educational use only**. Users are responsible for:
- Complying with all applicable laws
- Their own API key usage and costs
- Appropriate use of the tool
