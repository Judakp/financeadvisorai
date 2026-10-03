import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeadersBase = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body: Record<string, unknown>, status = 200, origin = '*') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersBase, 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json; charset=utf-8' },
  });

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const corsOrigin = !allowedOrigins.length ? '*' : (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]);

  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeadersBase, 'Access-Control-Allow-Origin': corsOrigin } });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405, corsOrigin);
  if (allowedOrigins.length && origin && !allowedOrigins.includes(origin)) {
    return jsonResponse({ error: 'Origine non autorisée.' }, 403, corsOrigin);
  }

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3-flash-preview';
  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error('Configuration serveur manquante: GEMINI_API_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.');
    return jsonResponse({ error: 'Le service IA est momentanément mal configuré.' }, 500, corsOrigin);
  }

  try {
    const body = await req.json();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    const lang = body?.lang === 'en' ? 'en' : 'fr';
    const rawHistory = Array.isArray(body?.history) ? body.history : [];

    if (!message) return jsonResponse({ error: 'Le message ne peut pas être vide.' }, 400, corsOrigin);
    if (message.length > 6000) return jsonResponse({ error: 'Le message est trop long (maximum 6 000 caractères).' }, 413, corsOrigin);
    if (rawHistory.length > 20) return jsonResponse({ error: 'Historique trop long. Veuillez recommencer la consultation.' }, 400, corsOrigin);

    // Rate limit by a hashed IP. The raw IP is not stored in the database.
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const rateKey = await sha256(ip);
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: allowed, error: rateError } = await admin.rpc('consume_chat_rate_limit', {
      p_key_hash: rateKey,
      p_limit: 12,
      p_window_seconds: 60,
    });
    if (rateError) {
      console.error('Rate limiter error:', rateError.message);
      return jsonResponse({ error: 'Le service est momentanément indisponible.' }, 503, corsOrigin);
    }
    if (allowed !== true) return jsonResponse({ error: 'Trop de demandes. Réessayez dans une minute.' }, 429, corsOrigin);

    const history = rawHistory
      .filter((item: any) => item && typeof item.text === 'string' && item.text.trim())
      .slice(-10)
      .map((item: any) => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [{ text: item.text.trim().slice(0, 6000) }],
      }));

    const systemInstruction = lang === 'fr'
      ? 'Tu es un assistant pédagogique d’information financière générale. Réponds toujours en français, clairement et prudemment. Ne prétends pas être conseiller financier agréé, ne garantis aucun rendement et rappelle les risques lorsque c’est pertinent. Demande des précisions si les données sont insuffisantes.'
      : 'You are an educational assistant providing general financial information. Always answer in English, clearly and cautiously. Do not claim to be a licensed financial adviser, guarantee returns, or omit relevant risks. Ask for clarification when information is insufficient.';

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ];

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
        }),
      },
    );

    const geminiData = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      console.error('Gemini API error:', geminiResponse.status, JSON.stringify(geminiData).slice(0, 1200));
      const status = geminiResponse.status === 429 ? 429 : 502;
      return jsonResponse({ error: geminiResponse.status === 429
        ? 'La limite de requêtes Gemini est atteinte. Réessayez plus tard.'
        : 'Gemini n’a pas pu traiter la demande. Vérifiez le modèle et la configuration de la clé API.' }, status, corsOrigin);
    }

    const answer = geminiData?.candidates?.[0]?.content?.parts
      ?.map((part: any) => typeof part.text === 'string' ? part.text : '')
      .join('').trim();
    if (!answer) return jsonResponse({ error: 'Gemini a renvoyé une réponse vide.' }, 502, corsOrigin);

    return jsonResponse({ text: answer }, 200, corsOrigin);
  } catch (error) {
    console.error('Chat function error:', error instanceof Error ? error.message : 'Unknown error');
    return jsonResponse({ error: 'Une erreur est survenue pendant le traitement de votre demande.' }, 500, corsOrigin);
  }
});
