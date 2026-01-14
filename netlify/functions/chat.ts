import { GoogleGenerativeAI } from "@google/generative-ai";

export const handler = async (event: any) => {
  const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || '');
  
  try {
    const { message, history, lang } = JSON.parse(event.body);

    // Configuration des instructions selon la langue
    const systemInstruction = lang === 'fr' 
      ? `Tu es un conseiller financier expert international. Réponds de manière professionnelle et concise (3 à 5 phrases). Utilise le FCFA pour l'Afrique et le Dollar pour les USA.`
      : `You are an international financial expert advisor. Respond professionally and concisely (3 to 5 sentences). Use FCFA for Africa and Dollar for USA.`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash', // Modèle stable pour les fonctions serverless
      systemInstruction: systemInstruction,
    });

    // On formate l'historique pour le SDK Google
    const chat = model.startChat({
      history: history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: response.text() }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};