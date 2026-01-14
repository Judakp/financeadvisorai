// geminiService.ts
export const getFinancialAdvice = async (message: string, history: any[]) => {
  
  // On appelle la fonction Netlify au lieu de l'API Google
  const response = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: message,
      history: history
    }),
  });

  if (!response.ok) {
    // Correction ici : utilisation de backticks ` au lieu de '
    throw new Error(`Erreur lors de l'appel à la fonction Netlify`);
  }

  const data = await response.json();
  return data.text; 
};