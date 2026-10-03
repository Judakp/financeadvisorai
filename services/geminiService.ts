/**
 * Client-side wrapper for the Supabase Edge Function.
 * The Gemini API key must NEVER be placed in this frontend code.
 */
export type ChatHistoryItem = {
  role: 'user' | 'model' | 'assistant';
  text: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const getFinancialAdvice = async (
  message: string,
  history: ChatHistoryItem[],
  lang: 'fr' | 'en' = 'fr',
): Promise<string> => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Configuration Supabase manquante. Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      // This public anon key identifies the project; it is not a secret.
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ message, history, lang }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Erreur Supabase (${response.status}).`);
  }
  if (typeof data.text !== 'string' || !data.text.trim()) {
    throw new Error('La fonction Supabase a renvoyé une réponse vide.');
  }
  return data.text;
};
