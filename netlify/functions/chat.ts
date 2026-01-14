import { GoogleGenerativeAI } from "@google/generative-ai";

export const handler = async (event: any) => {
  // 1. Log pour confirmer que la fonction est appelée
  console.log("--- Début de la fonction Chat ---");

  // 2. Vérification de la clé API
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("ERREUR : La variable VITE_GEMINI_API_KEY est introuvable sur Netlify.");
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Configuration serveur incomplète (Clé API manquante)." }),
    };
  }

  try {
    const { message, history, lang } = JSON.parse(event.body);
    console.log(`Message reçu (${lang}):`, message);

    const genAI = new GoogleGenerativeAI(apiKey);

    const systemInstruction = lang === 'fr' 
      ? `Tu es un conseiller financier expert international. Réponds de manière professionnelle et concise (3 à 5 phrases). Utilise le FCFA pour l'Afrique et le Dollar pour les USA.`
      : `You are an international financial expert advisor. Respond professionally and concisely (3 to 5 sentences). Use FCFA for Africa and Dollar for USA.`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: systemInstruction,
    });

    const chat = model.startChat({
      history: history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const textResponse = response.text();
    
    console.log("Réponse générée avec succès.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textResponse }),
    };

  } catch (error: any) {
    // 3. Log détaillé de l'erreur pour le debug Netlify
    console.error("ERREUR lors de l'exécution :", error.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Erreur interne du serveur : " + error.message }),
    };
  }
};