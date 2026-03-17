const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const CLAUDE_API_KEY       = (process.env.CLAUDE_API_KEY       || '').trim();
const ELEVENLABS_API_KEY   = (process.env.ELEVENLABS_API_KEY   || '').trim();
const ELEVENLABS_VOICE_ID  = (process.env.ELEVENLABS_VOICE_ID  || '').trim();
const LIVEAVATAR_API_KEY   = (process.env.LIVEAVATAR_API_KEY   || '').trim();
const LIVEAVATAR_AVATAR_ID = (process.env.LIVEAVATAR_AVATAR_ID || '').trim();

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Claude ───────────────────────────────────────────────────
app.post('/api/claude', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const { messages, system } = req.body;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system, messages })
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ElevenLabs TTS ───────────────────────────────────────────
app.post('/api/tts', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const { text } = req.body;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    const buf = await r.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LiveAvatar: crear sesión ─────────────────────────────────
app.post('/api/liveavatar/session', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const headers = { 'Content-Type': 'application/json', 'x-api-key': LIVEAVATAR_API_KEY };

    // Paso 1: token de sesión
    const tokenRes = await fetch('https://api.liveavatar.com/v1/sessions/token', {
      method: 'POST', headers,
      body: JSON.stringify({
        mode: 'LITE',
        avatar_id: LIVEAVATAR_AVATAR_ID,
        video_settings: { quality: 'high', encoding: 'VP8' },
        is_sandbox: false
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.data?.session_token) return res.status(500).json({ error: 'No session_token', detail: tokenData });

    // Paso 2: iniciar sesión
    const startRes = await fetch('https://api.liveavatar.com/v1/sessions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenData.data.session_token}` },
      body: JSON.stringify({})
    });
    const startData = await startRes.json();
    if (!startData.data?.livekit_url) return res.status(500).json({ error: 'No livekit_url', detail: startData });

    res.json({
      session_id: startData.data.session_id,
      livekit_url: startData.data.livekit_url,
      livekit_client_token: startData.data.livekit_client_token,
      ws_url: startData.data.ws_url,
      session_token: tokenData.data.session_token
    });
  } catch (err) {
    console.error('LiveAvatar session error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── LiveAvatar: cerrar sesión ────────────────────────────────
app.post('/api/liveavatar/close', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const { session_token } = req.body;
    const r = await fetch('https://api.liveavatar.com/v1/sessions/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session_token}` },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Puerto ' + PORT);
  console.log('Claude: ' + (CLAUDE_API_KEY ? '✅' : '❌'));
  console.log('ElevenLabs: ' + (ELEVENLABS_API_KEY ? '✅' : '❌'));
  console.log('LiveAvatar: ' + (LIVEAVATAR_API_KEY ? '✅' : '❌'));
  console.log('Avatar ID: ' + LIVEAVATAR_AVATAR_ID);
});
