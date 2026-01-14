import { GoogleGenerativeAI } from "@google/generative-ai";

export const handler = async (event: any) => {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Clé API manquante" }) };
  }

  try {
    const { message, history, lang } = JSON.parse(event.body);
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // --- MODIFICATION DU MODÈLE ICI ---
    // Vous pouvez tester 'gemini-2.0-flash-exp' ou 'gemini-1.5-flash'
    // Si vous avez un nom spécifique pour Gemini 3 Preview, insérez-le ici.
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview", 
    });

    // NETTOYAGE STRICT DE L'HISTORIQUE (Pour éviter l'erreur 400)
    // On s'assure que chaque message possède bien un texte non vide.
    const cleanHistory = (history || [])
      .filter((h: any) => h.text && h.text.trim().length > 0)
      .map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text.trim() }],
      }));

    const chat = model.startChat({
      history: cleanHistory,
    });

    // On s'assure que le message actuel n'est pas vide
    if (!message || message.trim().length === 0) {
      throw new Error("Le message envoyé est vide.");
    }

    const result = await chat.sendMessage(message);
    const response = await result.response;
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: response.text() }),
    };

  } catch (error: any) {
    console.error("LOG ERREUR GOOGLE API:", error.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Détails: " + error.message }),
    };
  }
};