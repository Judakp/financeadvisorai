import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeadersBase = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (
  body: Record<string, unknown>,
  status = 200,
  origin = '*',
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersBase,
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') ?? '';

  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const corsOrigin = !allowedOrigins.length
    ? '*'
    : allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0];

  // ---------------------------------------------------------
  // CORS / METHOD
  // ---------------------------------------------------------

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeadersBase,
        'Access-Control-Allow-Origin': corsOrigin,
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Méthode non autorisée.' },
      405,
      corsOrigin,
    );
  }

  if (
    allowedOrigins.length &&
    origin &&
    !allowedOrigins.includes(origin)
  ) {
    return jsonResponse(
      { error: 'Origine non autorisée.' },
      403,
      corsOrigin,
    );
  }

  // ---------------------------------------------------------
  // CONFIGURATION SERVEUR
  // ---------------------------------------------------------

  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const model =
    Deno.env.get('GEMINI_MODEL') ?? 'gemini-3-flash-preview';

  if (!geminiApiKey || !supabaseUrl || !serviceRoleKey) {
    console.error(
      'Configuration serveur manquante: GEMINI_API_KEY, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
    );

    return jsonResponse(
      {
        error:
          'Le service IA est momentanément mal configuré.',
      },
      500,
      corsOrigin,
    );
  }

  try {
    // -------------------------------------------------------
    // LECTURE ET VALIDATION DE LA REQUÊTE
    // -------------------------------------------------------

    const body = await req.json();

    const message =
      typeof body?.message === 'string'
        ? body.message.trim()
        : '';

    const lang = body?.lang === 'en' ? 'en' : 'fr';

    const rawHistory = Array.isArray(body?.history)
      ? body.history
      : [];

    if (!message) {
      return jsonResponse(
        {
          error: 'Le message ne peut pas être vide.',
        },
        400,
        corsOrigin,
      );
    }

    if (message.length > 6000) {
      return jsonResponse(
        {
          error:
            'Le message est trop long (maximum 6 000 caractères).',
        },
        413,
        corsOrigin,
      );
    }

    if (rawHistory.length > 20) {
      return jsonResponse(
        {
          error:
            'Historique trop long. Veuillez recommencer la consultation.',
        },
        400,
        corsOrigin,
      );
    }

    // -------------------------------------------------------
    // IDENTIFICATION ANONYME DU VISITEUR
    // -------------------------------------------------------
    // L'adresse IP brute n'est jamais enregistrée.
    // Seul son hash SHA-256 est utilisé pour les quotas.

    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-real-ip') ??
      req.headers
        .get('x-forwarded-for')
        ?.split(',')[0]
        ?.trim() ??
      'unknown';

    const rateKey = await sha256(ip);

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // -------------------------------------------------------
    // RATE LIMIT : 12 REQUÊTES PAR MINUTE
    // -------------------------------------------------------

    const {
      data: allowed,
      error: rateError,
    } = await admin.rpc('consume_chat_rate_limit', {
      p_key_hash: rateKey,
      p_limit: 12,
      p_window_seconds: 60,
    });

    if (rateError) {
      console.error(
        'Rate limiter error:',
        rateError.message,
      );

      return jsonResponse(
        {
          error:
            'Le service est momentanément indisponible.',
        },
        503,
        corsOrigin,
      );
    }

    if (allowed !== true) {
      return jsonResponse(
        {
          error:
            'Trop de demandes. Réessayez dans une minute.',
        },
        429,
        corsOrigin,
      );
    }

    // -------------------------------------------------------
    // QUOTA : 5 CONSULTATIONS PAR JOUR
    // -------------------------------------------------------

    const {
      data: dailyAllowed,
      error: dailyRateError,
    } = await admin.rpc('consume_chat_daily_limit', {
      p_key_hash: rateKey,
      p_limit: 5,
    });

    if (dailyRateError) {
      console.error(
        'Daily rate limiter error:',
        dailyRateError.message,
      );

      return jsonResponse(
        {
          error:
            'Le service est momentanément indisponible.',
        },
        503,
        corsOrigin,
      );
    }

    if (dailyAllowed !== true) {
      return jsonResponse(
        {
          error:
            lang === 'fr'
              ? 'Vous avez atteint la limite de 5 consultations gratuites pour aujourd’hui. Revenez demain pour continuer.'
              : 'You have reached the limit of 5 free consultations for today. Please come back tomorrow to continue.',
        },
        429,
        corsOrigin,
      );
    }

    // -------------------------------------------------------
    // HISTORIQUE
    // -------------------------------------------------------

    const history = rawHistory
      .filter(
        (item: any) =>
          item &&
          typeof item.text === 'string' &&
          item.text.trim(),
      )
      .slice(-10)
      .map((item: any) => ({
        role: item.role === 'user' ? 'user' : 'model',
        parts: [
          {
            text: item.text.trim().slice(0, 6000),
          },
        ],
      }));

    // -------------------------------------------------------
    // INSTRUCTIONS DE L'ASSISTANT
    // -------------------------------------------------------

    const systemInstruction =
      lang === 'fr'
        ? `
Tu es un assistant pédagogique spécialisé dans l'information financière générale.

Réponds toujours en français.

Tes réponses doivent être claires, pédagogiques, prudentes et faciles à lire.

IMPORTANT : N'UTILISE JAMAIS DE MARKDOWN.

Ne mets jamais :
- de symbole # pour créer des titres ;
- d'astérisque * ou ** pour créer du gras ou de l'italique ;
- de listes Markdown avec -, * ou + ;
- de blocs de code Markdown ;
- de liens au format Markdown ;
- de tableaux Markdown.

Utilise uniquement du texte simple.

Pour structurer une réponse, utilise des phrases courtes et des paragraphes séparés par des retours à la ligne.

Si tu dois présenter plusieurs éléments, utilise simplement une numérotation classique comme :
1. Premier élément.
2. Deuxième élément.
3. Troisième élément.

Tu peux également utiliser des titres simples sans symbole Markdown, par exemple :
Épargne
Investissement
Risques

Ne prétends jamais être un conseiller financier agréé.

Ne garantis jamais un rendement.

Ne présente jamais une information financière incertaine comme une certitude.

Mentionne les risques lorsqu'ils sont pertinents.

Demande des précisions lorsque les informations fournies par l'utilisateur sont insuffisantes.

Tes réponses doivent rester informatives et éducatives et ne constituent pas un conseil financier personnalisé.
        `.trim()
        : `
You are an educational assistant specialized in general financial information.

Always answer in English.

Your answers must be clear, educational, cautious, and easy to read.

IMPORTANT: NEVER USE MARKDOWN.

Never use:
- the # symbol to create headings;
- asterisks * or ** for bold or italic formatting;
- Markdown lists using -, * or +;
- Markdown code blocks;
- Markdown-formatted links;
- Markdown tables.

Use plain text only.

To structure your answer, use short sentences and separate paragraphs with line breaks.

If you need to present several elements, use simple numbering such as:
1. First element.
2. Second element.
3. Third element.

You may also use simple headings without Markdown symbols, for example:
Savings
Investing
Risks

Never claim to be a licensed financial adviser.

Never guarantee returns.

Never present uncertain financial information as a certainty.

Mention relevant risks when appropriate.

Ask for clarification when the information provided by the user is insufficient.

Your answers must remain educational and informational and do not constitute personalized financial advice.
        `.trim();

    // -------------------------------------------------------
    // CONTENU ENVOYÉ À GEMINI
    // -------------------------------------------------------

    const contents = [
      ...history,
      {
        role: 'user',
        parts: [
          {
            text: message,
          },
        ],
      },
    ];

    // -------------------------------------------------------
    // APPEL GEMINI
    // -------------------------------------------------------

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model,
      )}:generateContent?key=${encodeURIComponent(
        geminiApiKey,
      )}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemInstruction,
              },
            ],
          },

          contents,

          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1200,
          },
        }),
      },
    );

    // -------------------------------------------------------
    // TRAITEMENT DE LA RÉPONSE GEMINI
    // -------------------------------------------------------

    const geminiData =
      await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      console.error(
        'Gemini API error:',
        geminiResponse.status,
        JSON.stringify(geminiData).slice(0, 1200),
      );

      const status =
        geminiResponse.status === 429 ? 429 : 502;

      return jsonResponse(
        {
          error:
            geminiResponse.status === 429
              ? 'La limite de requêtes Gemini est atteinte. Réessayez plus tard.'
              : 'Gemini n’a pas pu traiter la demande. Vérifiez le modèle et la configuration de la clé API.',
        },
        status,
        corsOrigin,
      );
    }

    let answer =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((part: any) =>
          typeof part.text === 'string'
            ? part.text
            : '',
        )
        .join('')
        .trim();

    if (!answer) {
      return jsonResponse(
        {
          error:
            'Gemini a renvoyé une réponse vide.',
        },
        502,
        corsOrigin,
      );
    }

    // -------------------------------------------------------
    // NETTOYAGE DE SÉCURITÉ DU MARKDOWN
    // -------------------------------------------------------
    // Même si Gemini génère accidentellement du Markdown,
    // on retire les principaux marqueurs avant de renvoyer
    // la réponse au frontend.

    answer = answer
      // Titres Markdown : ### Titre -> Titre
      .replace(/^\s*#{1,6}\s+/gm, '')

      // Gras : **texte** -> texte
      .replace(/\*\*(.*?)\*\*/gs, '$1')

      // Italique : *texte* -> texte
      .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')

      // Code inline : `texte` -> texte
      .replace(/`([^`\n]+)`/g, '$1')

      // Listes Markdown avec -, * ou +
      .replace(/^\s*[-*+]\s+/gm, '')

      // Liens Markdown : [texte](url) -> texte
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
        '$1',
      )

      // Plusieurs lignes vides consécutives -> maximum 2
      .replace(/\n{3,}/g, '\n\n')

      .trim();

    // -------------------------------------------------------
    // RÉPONSE FINALE
    // -------------------------------------------------------

    return jsonResponse(
      {
        text: answer,
      },
      200,
      corsOrigin,
    );
  } catch (error) {
    console.error(
      'Chat function error:',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    );

    return jsonResponse(
      {
        error:
          'Une erreur est survenue pendant le traitement de votre demande.',
      },
      500,
      corsOrigin,
    );
  }
});
