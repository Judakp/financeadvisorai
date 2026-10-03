# Migrer FinanceAI de Netlify Functions vers Supabase Edge Functions

## Important : sécurité de la clé
L’archive d’origine contenait une clé Gemini dans `.env.local`. Révoquez cette clé dans Google AI Studio et créez-en une nouvelle. Ne mettez jamais `GEMINI_API_KEY` dans une variable `VITE_*`, dans React, dans Git, ni dans un fichier distribué au navigateur.

## 1. Préparer Supabase
1. Créez/ouvrez un projet dans Supabase.
2. Dans Project Settings > API, copiez l’URL du projet et la clé publishable (ou `anon` si votre projet utilise les anciennes clés). Ces valeurs sont destinées au client web.
3. Dans le SQL Editor de Supabase, exécutez le contenu de `supabase/migrations/202610020001_chat_rate_limit.sql`.
4. Installez le Supabase CLI et connectez-vous : `npx supabase login`.
5. À la racine du projet, liez le projet : `npx supabase link --project-ref VOTRE_PROJECT_REF`.

## 2. Ajouter les secrets serveur
Exécutez ces commandes à la racine (remplacez les valeurs) :

```bash
npx supabase secrets set GEMINI_API_KEY="VOTRE_NOUVELLE_CLE_GEMINI"
npx supabase secrets set GEMINI_MODEL="gemini-3-flash-preview"
npx supabase secrets set ALLOWED_ORIGINS="http://localhost:3000,https://VOTRE-DOMAINE"
```

`GEMINI_MODEL` doit être un modèle disponible pour votre clé dans Google AI Studio. Si `gemini-3-flash-preview` n’est pas activé pour votre compte, remplacez-le par un identifiant de modèle actuellement disponible. Supabase fournit normalement `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` à l’environnement des Edge Functions ; ne les ajoutez pas au frontend.

## 3. Déployer la fonction

```bash
npx supabase functions deploy chat --no-verify-jwt
```

La désactivation de la vérification JWT est volontaire ici parce que cette démo est un outil public sans écran de connexion. La fonction utilise une clé Gemini serveur, valide les entrées et applique une limite de 12 demandes par minute et par IP hachée. Cette protection est une barrière de base, pas une protection complète contre les attaques distribuées. Pour un usage commercial, ajoutez Supabase Auth et/ou un CAPTCHA et des limites par utilisateur.

## 4. Configurer le frontend
Créez `.env.local` à la racine en vous basant sur `.env.example` :

```env
VITE_SUPABASE_URL=https://VOTRE_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLISHABLE_OU_ANON
```

Ne mettez **pas** la clé Gemini dans ce fichier. Les variables `VITE_*` sont intégrées au bundle public du navigateur.

Puis lancez :

```bash
npm install
npm run dev
```

Vérifiez le chat vocal. Le frontend appelle maintenant `https://VOTRE_PROJECT_REF.supabase.co/functions/v1/chat` et transmet `message`, `history` et `lang`.

## 5. Déploiement en production
Ajoutez les deux variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans les variables d’environnement du service qui héberge le frontend, puis reconstruisez/redéployez le site. Vous pouvez conserver Netlify uniquement pour héberger les fichiers statiques, mais sa fonction `netlify/functions/chat.ts` n’est plus utilisée.

## Fichiers modifiés
- `components/AdvisorChat.tsx` : remplace l’appel Netlify par le service client Supabase et gère les erreurs.
- `services/geminiService.ts` : devient le client HTTP de l’Edge Function (aucune clé Gemini).
- `supabase/functions/chat/index.ts` : validation, limitation des requêtes, appel serveur à l’API Gemini, consignes FR/EN.
- `supabase/config.toml` : configuration de la fonction publique.
- `supabase/migrations/...sql` : table et fonction SQL pour limiter le débit.

## Nettoyage après migration
- Supprimez `netlify/functions/chat.ts` une fois la migration validée.
- Supprimez l’ancien `.env.local` contenant `VITE_GEMINI_API_KEY` et ne le remettez pas dans l’archive ou le dépôt.
- L’ancien `services/geminiService.ts` est remplacé par le nouveau client Supabase.
- Les dépendances Google présentes dans `package.json` ne sont plus nécessaires à ce flux ; après vérification qu’aucun autre fichier ne les utilise, vous pourrez les retirer avec `npm uninstall @google/generative-ai @google/genai`.
