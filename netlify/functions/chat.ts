const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // On récupère la clé API depuis les variables d'environnement de Netlify
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  
  try {
    const { message, history } = JSON.parse(event.body);

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash', // ou 'gemini-3-flash-preview' selon votre accès
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
      body: JSON.stringify({ text: response.text() }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur lors de la génération du contenu" }),
    };
  }
};