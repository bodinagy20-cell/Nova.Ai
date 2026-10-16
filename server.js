'use strict';

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

// Keep the secret key on the server. Never send it to browser code.
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'تم الوصول إلى حد الطلبات المؤقت. انتظر قليلًا ثم جرّب مجددًا.' }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(API_KEY), model: MODEL });
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      error: 'لم يتم إعداد OPENAI_API_KEY بعد. افتح ملف .env وأضف مفتاح API على الخادم، ثم أعد تشغيله.'
    });
  }

  const incoming = req.body && req.body.messages;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return res.status(400).json({ error: 'أرسل رسالة واحدة على الأقل.' });
  }

  // Only accept plain text chat messages and cap request size/history.
  const messages = incoming.slice(-20).map((m) => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return null;
    const content = m.content.trim();
    if (!content || content.length > 6000) return null;
    return { role: m.role, content };
  });

  if (messages.some((m) => m === null)) {
    return res.status(400).json({ error: 'صيغة الرسائل غير صحيحة أو أن إحدى الرسائل طويلة جدًا.' });
  }
  if (messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'آخر رسالة يجب أن تكون من المستخدم.' });
  }

  try {
    const apiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: [
          'You are NOVA AI, a capable, friendly general-purpose assistant.',
          'Reply in the language the user uses; default to clear, natural Arabic if unclear.',
          'Be helpful, accurate, thoughtful, and transparent about uncertainty.',
          'For school questions, explain at an appropriate level and show clear steps when useful.',
          'Format responses for readability, using short paragraphs and lists only when useful.'
        ].join(' '),
        input: messages,
        max_output_tokens: 1400
      }),
      signal: AbortSignal.timeout(90000)
    });

    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      console.error('OpenAI API request failed:', apiResponse.status, result?.error?.code || result?.error?.type || 'unknown');
      if (apiResponse.status === 401) {
        return res.status(502).json({ error: 'مفتاح API غير صحيح. راجع المفتاح الموجود في ملف .env.' });
      }
      if (apiResponse.status === 429) {
        return res.status(502).json({ error: 'تعذر إكمال الطلب بسبب حد الاستخدام أو الرصيد. راجع إعدادات API.' });
      }
      return res.status(502).json({ error: 'خدمة الذكاء الاصطناعي لم تُكمل الطلب. راجع اسم النموذج وإعدادات API ثم جرّب مجددًا.' });
    }

    let reply = typeof result.output_text === 'string' ? result.output_text : '';
    if (!reply && Array.isArray(result.output)) {
      for (const item of result.output) {
        if (item && item.type === 'message' && Array.isArray(item.content)) {
          for (const part of item.content) {
            if (part && part.type === 'output_text' && typeof part.text === 'string') reply += part.text;
          }
        }
      }
    }
    if (!reply.trim()) {
      return res.status(502).json({ error: 'وصل رد فارغ من النموذج. جرّب صياغة السؤال مرة أخرى.' });
    }
    return res.json({ reply: reply.trim(), model: MODEL });
  } catch (error) {
    console.error('Chat API error:', error.name || error.message);
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'استغرق الرد وقتًا طويلًا. جرّب مرة أخرى.' });
    }
    return res.status(500).json({ error: 'حدث خطأ في الخادم أثناء الاتصال بخدمة الذكاء الاصطناعي.' });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'مسار API غير موجود.' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => err && next(err));
});

app.listen(PORT, () => {
  console.log(`NOVA AI server running at http://localhost:${PORT}`);
  console.log(`API key configured: ${Boolean(API_KEY)} | Model: ${MODEL}`);
});
