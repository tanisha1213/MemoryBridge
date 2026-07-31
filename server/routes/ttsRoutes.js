const express = require('express');
const router = express.Router();
const axios = require('axios');

// Helper function to sanitize and fix Hindi/Marathi grammar bugs
const normalizeIndianText = (text, lang) => {
  if (!text) return '';

  let cleaned = text.trim();

  if (lang === 'hi' || lang === 'hi-IN') {
    // Fix common speech grammar bugs
    cleaned = cleaned
      .replace(/\bho\b/gi, 'है')               // Fixes "gai ho" -> "gai hai"
      .replace(/\bhongi\b/gi, 'हैं')
      .replace(/\bhaii\b/gi, 'है')
      .replace(/गई हो/g, 'गई है')              // Direct Devanagari correction
      .replace(/गए हो/g, 'गए हैं')
      .replace(/आए हो/g, 'आए हैं');
  } else if (lang === 'mr' || lang === 'mr-IN') {
    // Fix Marathi grammar bugs
    cleaned = cleaned
      .replace(/आली हो/g, 'आली आहे')
      .replace(/आले हो/g, 'आले आहेत');
  }

  // Remove unwanted punctuation/symbols that break TTS cadence
  cleaned = cleaned.replace(/[&/\\#+()$~%'":*?<>{}]/g, '');

  return cleaned;
};

// 100% Free Unlimited TTS Endpoint
const handleTtsStream = async (req, res) => {
  try {
    const { text, lang = 'hi' } = req.query;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // 1. Sanitize text and fix grammar bugs
    const sanitizedText = normalizeIndianText(text, lang);

    // 2. Map language codes to Google Translate TTS
    const langMap = {
      'hi-IN': 'hi',
      'mr-IN': 'mr',
      'en-IN': 'en',
      'en-US': 'en',
      hi: 'hi',
      mr: 'mr',
      en: 'en',
    };
    const targetLang = langMap[lang] || 'hi';

    // 3. Fetch clear audio stream from Google Neural TTS engine
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(sanitizedText)}&tl=${targetLang}&client=tw-ob`;

    const response = await axios({
      method: 'get',
      url: googleTtsUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    res.set('Content-Type', 'audio/mpeg');
    response.data.pipe(res);
  } catch (error) {
    console.error('TTS Stream Error:', error.message);
    res.status(500).json({ error: 'Failed to stream audio' });
  }
};

router.get('/stream', handleTtsStream);

module.exports = { router, handleTtsStream, normalizeIndianText };
