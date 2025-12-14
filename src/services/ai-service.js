const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { maskPII } = require('../utils/pii-mask');

class AIService {
  constructor() {
    this.config = this.loadConfig();
    this.client = null;
    this.model = null;

    // Rate limiting - Gemini free tier
    this.lastRequestTime = 0;
    this.minRequestInterval = 4000; // 4 seconds between requests
    this.requestQueue = [];
    this.isProcessingQueue = false;

    this.initializeClient();
  }

  /**
   * Reload configuration and reinitialize client
   * Call this when user changes the API key
   */
  reloadConfig() {
    console.log('🔄 Reloading AI configuration...');
    this.config = this.loadConfig();
    this.lastRequestTime = 0; // Reset rate limiting for new key
    this.initializeClient();
    console.log('✅ AI configuration reloaded');
  }

  /**
   * Load configuration from .env file
   */
  loadConfig() {
    const os = require('os');

    // Search for .env in multiple locations
    const possiblePaths = [
      path.join(__dirname, '../../.env'),
      path.join(path.dirname(process.execPath), '.env'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'ai-assistant', '.env'),
      path.join(os.homedir(), '.config', 'ai-assistant', '.env')
    ];

    for (const configPath of possiblePaths) {
      try {
        if (fs.existsSync(configPath)) {
          console.log(`✅ Found .env at: ${configPath}`);
          const envContent = fs.readFileSync(configPath, 'utf-8');
          const config = {};

          envContent.split('\n').forEach(line => {
            if (line.trim().startsWith('#') || !line.includes('=')) return;
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
              config[key.trim()] = valueParts.join('=').trim();
            }
          });

          return config;
        }
      } catch (error) {
        continue;
      }
    }

    console.warn('⚠️ No .env file found');
    return {};
  }

  /**
   * Initialize the Gemini client
   */
  initializeClient() {
    const apiKey = this.config.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('❌ No Gemini API key configured');
      console.error('   Please create a .env file with: GEMINI_API_KEY=your_key_here');
      return;
    }

    try {
      this.client = new GoogleGenerativeAI(apiKey);
      const modelName = this.config.GEMINI_MODEL || 'gemini-2.5-flash-lite';
      this.model = this.client.getGenerativeModel({ model: modelName });
      console.log(`✅ Gemini AI initialized (model: ${modelName})`);
    } catch (error) {
      console.error('❌ Failed to initialize Gemini:', error.message);
    }
  }

  /**
   * Wait for rate limit cooldown if needed
   */
  async waitForCooldown() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      console.log(`⏳ Rate limit protection: waiting ${(waitTime / 1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Get remaining cooldown time in seconds
   */
  getCooldownRemaining() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      return Math.ceil((this.minRequestInterval - timeSinceLastRequest) / 1000);
    }
    return 0;
  }

  /**
   * Send a query to the AI
   * @param {string} prompt - The user's question
   * @param {string} context - Optional context (screen text)
   * @returns {Promise<string>} - AI response
   */
  async query(prompt, context = '') {
    if (!this.model) {
      throw new Error('AI not initialized. Please check your API key.');
    }

    // Rate limit protection
    await this.waitForCooldown();

    try {
      // Mask PII in prompt and context before sending to API
      const maskedPrompt = maskPII(prompt);
      const maskedContext = context ? maskPII(context) : { masked: '', found: [] };

      // Log if PII was found and masked
      if (maskedPrompt.found.length > 0 || maskedContext.found.length > 0) {
        console.log('🔒 PII masked before API call:', [...maskedPrompt.found, ...maskedContext.found]);
      }

      // Build the full prompt with masked content
      let fullPrompt = maskedPrompt.masked;

      if (maskedContext.masked) {
        fullPrompt = `Context:\n${maskedContext.masked}\n\nQuestion: ${maskedPrompt.masked}`;
      }

      console.log(`🤖 AI Query: ${prompt.substring(0, 50)}...`);

      // Track request time BEFORE making request
      this.lastRequestTime = Date.now();

      const result = await this.model.generateContent(fullPrompt);
      const response = result.response.text();

      console.log(`✅ AI Response received (${response.length} chars)`);
      return response;

    } catch (error) {
      console.error('❌ AI query failed:', error.message);

      if (error.message.includes('quota') || error.message.includes('429')) {
        // Increase cooldown on rate limit hit
        this.minRequestInterval = Math.min(this.minRequestInterval * 1.5, 10000);
        throw new Error('API rate limit reached. Please wait a moment and try again.');
      }

      throw error;
    }
  }

  /**
   * Extract text from a screenshot using Gemini Vision
   * @param {string} base64Image - Base64 encoded image
   * @returns {Promise<Object>} - { success, text, error }
   */
  async extractTextFromImage(base64Image) {
    if (!this.model) {
      return { success: false, text: '', error: 'AI not initialized' };
    }

    // Rate limit protection (same as chat)
    await this.waitForCooldown();

    try {
      console.log('🔍 Extracting text from screenshot...');

      // Track request time
      this.lastRequestTime = Date.now();

      // Prepare image for Gemini
      const imagePart = {
        inlineData: {
          mimeType: 'image/png',
          data: base64Image.replace(/^data:image\/\w+;base64,/, '')
        }
      };

      const prompt = `Extract and return ALL visible text from this screenshot. 
Include:
- All UI text, labels, buttons
- Code if visible
- Any questions or important content
Return only the extracted text, no commentary.`;

      const result = await this.model.generateContent([prompt, imagePart]);
      const rawText = result.response.text();

      // Mask PII in extracted text before returning
      const masked = maskPII(rawText);

      if (masked.found.length > 0) {
        console.log('🔒 PII masked in OCR result:', masked.found);
      }

      console.log(`✅ OCR complete (${masked.masked.length} chars, ${masked.found.length} PII items masked)`);
      return { success: true, text: masked.masked };

    } catch (error) {
      console.error('❌ OCR failed:', error.message);

      if (error.message.includes('quota') || error.message.includes('429')) {
        this.minRequestInterval = Math.min(this.minRequestInterval * 1.5, 10000);
        return { success: false, text: '', error: 'Rate limit reached. Please wait a moment.' };
      }

      return { success: false, text: '', error: error.message };
    }
  }
}

module.exports = AIService;
