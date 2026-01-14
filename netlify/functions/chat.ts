import { GoogleGenerativeAI } from "@google/generative-ai";

export const handler = async (event: any) => {
  // On utilise VITE_GEMINI_API_KEY pour être cohérent avec votre config Netlify
  const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY || '');
  
  try {
    const { message, history } = JSON.parse(event.body);

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash', 
      systemInstruction: `Tu es un expert en finance personnelle et conseiller patrimonial français. 
      Ton but est d'aider les utilisateurs à mieux gérer leur argent, épargner, et investir intelligemment. 
      Réponds toujours de manière professionnelle, claire et encourageante. 
      N'hésite pas à poser des questions pour mieux comprendre la situation financière de l'utilisateur. 
      Mentionne toujours que tes conseils sont à titre informatif et qu'il est bon de consulter un professionnel certifié avant de prendre des décisions majeures.`,
    });

    const chat = model.startChat({
      history: history,
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: response.text() }),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur lors de la génération : " + error.message }),
    };
  }
};