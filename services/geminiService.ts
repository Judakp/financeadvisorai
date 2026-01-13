
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY || '';

export const getFinancialAdvice = async (message: string, history: any[]) => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      systemInstruction: `Tu es un expert en finance personnelle et conseiller patrimonial français. 
      Ton but est d'aider les utilisateurs à mieux gérer leur argent, épargner, et investir intelligemment. 
      Réponds toujours de manière professionnelle, claire et encourageante. 
      N'hésite pas à poser des questions pour mieux comprendre la situation financière de l'utilisateur. 
      Mentionne toujours que tes conseils sont à titre informatif et qu'il est bon de consulter un professionnel certifié avant de prendre des décisions majeures.`,
      temperature: 0.7,
    },
  });

  return response.text;
};
