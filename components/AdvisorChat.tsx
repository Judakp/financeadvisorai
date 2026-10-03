import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { getFinancialAdvice } from '../services/geminiService';

interface AdvisorChatProps {
  lang: 'fr' | 'en';
}

type ChatStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking';

interface Transcription {
  role: 'user' | 'model';
  text: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  start: () => void;
  stop: () => void;
  abort?: () => void;

  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/**
 * Nettoyage du Markdown généré par Gemini.
 *
 * Gemini peut naturellement répondre avec :
 *
 * # Titre
 * **texte**
 * * élément
 *
 * Cette fonction transforme ces éléments en texte
 * beaucoup plus propre pour l'interface et la lecture vocale.
 */
const cleanResponse = (text: string): string => {
  return text
    // Titres Markdown
    .replace(/^#{1,6}\s*/gm, '')

    // Gras
    .replace(/\*\*(.*?)\*\*/g, '$1')

    // Italique
    .replace(/\*(.*?)\*/g, '$1')

    // Gras / italique avec _
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')

    // Code inline
    .replace(/`([^`]+)`/g, '$1')

    // Listes Markdown
    .replace(/^\s*[-*+]\s+/gm, '• ')

    // Listes numérotées
    .replace(/^\s*(\d+)\.\s+/gm, '$1) ')

    // Liens Markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

    // Séparateurs Markdown
    .replace(/^---+$/gm, '')

    // Évite trop de lignes vides
    .replace(/\n{3,}/g, '\n\n')

    .trim();
};

const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  return (
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null
  );
};

export const AdvisorChat: React.FC<AdvisorChatProps> = ({
  lang,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);

  const [transcriptions, setTranscriptions] = useState<
    Transcription[]
  >([]);

  const [status, setStatus] =
    useState<ChatStatus>('idle');

  /**
   * Instance actuelle de SpeechRecognition.
   */
  const recognitionRef =
    useRef<SpeechRecognitionInstance | null>(null);

  /**
   * Ces refs permettent aux callbacks du navigateur
   * d'avoir toujours accès aux valeurs actuelles.
   *
   * Cela corrige notamment le problème :
   *
   * première question -> fonctionne
   * deuxième question -> aucune réponse
   */
  const isActiveRef = useRef<boolean>(false);

  const statusRef =
    useRef<ChatStatus>('idle');

  /**
   * Empêche plusieurs recognition.start()
   * simultanés.
   */
  const recognitionStartingRef =
    useRef<boolean>(false);

  /**
   * Indique qu'une requête Gemini est en cours.
   */
  const requestInProgressRef =
    useRef<boolean>(false);

  /**
   * Identifiant de session.
   *
   * Il empêche une ancienne session de redémarrer
   * le microphone après que l'utilisateur a cliqué
   * sur "Terminer".
   */
  const sessionIdRef =
    useRef<number>(0);

  /**
   * Historique toujours à jour.
   */
  const transcriptionsRef =
    useRef<Transcription[]>([]);

  /**
   * Mise à jour de isActive + ref.
   */
  const updateActive = useCallback(
    (value: boolean) => {
      isActiveRef.current = value;
      setIsActive(value);
    },
    [],
  );

  /**
   * Mise à jour de status + ref.
   */
  const updateStatus = useCallback(
    (value: ChatStatus) => {
      statusRef.current = value;
      setStatus(value);
    },
    [],
  );

  /**
   * Arrêt de SpeechRecognition.
   */
  const stopRecognition = useCallback(() => {
    const recognition =
      recognitionRef.current;

    if (!recognition) {
      return;
    }

    recognitionStartingRef.current = false;

    try {
      recognition.stop();
    } catch {
      // L'instance peut déjà être arrêtée.
    }
  }, []);

  /**
   * Démarrage sécurisé de SpeechRecognition.
   */
  const startRecognition = useCallback(() => {
    const recognition =
      recognitionRef.current;

    if (!recognition) {
      return;
    }

    if (!isActiveRef.current) {
      return;
    }

    if (requestInProgressRef.current) {
      return;
    }

    if (recognitionStartingRef.current) {
      return;
    }

    recognitionStartingRef.current = true;

    try {
      recognition.start();
    } catch (error) {
      console.warn(
        'SpeechRecognition.start():',
        error,
      );

      recognitionStartingRef.current = false;
    }
  }, []);

  /**
   * Lecture vocale de la réponse.
   */
  const speak = useCallback(
    (
      text: string,
      currentSessionId: number,
    ) => {
      /**
       * Si la synthèse vocale n'est pas disponible,
       * on revient directement à l'écoute.
       */
      if (!window.speechSynthesis) {
        updateStatus('listening');

        setTimeout(() => {
          if (
            isActiveRef.current &&
            sessionIdRef.current ===
              currentSessionId &&
            !requestInProgressRef.current
          ) {
            startRecognition();
          }
        }, 300);

        return;
      }

      /**
       * Arrêt d'une éventuelle lecture précédente.
       */
      window.speechSynthesis.cancel();

      const utterance =
        new SpeechSynthesisUtterance(text);

      utterance.lang =
        lang === 'fr'
          ? 'fr-FR'
          : 'en-US';

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        updateStatus('speaking');
      };

      utterance.onend = () => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        /**
         * Si l'utilisateur a terminé la session
         * pendant la lecture, on ne redémarre pas
         * le microphone.
         */
        if (!isActiveRef.current) {
          updateStatus('idle');
          return;
        }

        updateStatus('listening');

        /**
         * Petit délai avant de réactiver
         * le microphone.
         */
        setTimeout(() => {
          if (
            isActiveRef.current &&
            !requestInProgressRef.current &&
            sessionIdRef.current ===
              currentSessionId
          ) {
            startRecognition();
          }
        }, 300);
      };

      utterance.onerror = (event) => {
        console.warn(
          'Erreur SpeechSynthesis:',
          event,
        );

        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        if (!isActiveRef.current) {
          updateStatus('idle');
          return;
        }

        updateStatus('listening');

        setTimeout(() => {
          if (
            isActiveRef.current &&
            !requestInProgressRef.current &&
            sessionIdRef.current ===
              currentSessionId
          ) {
            startRecognition();
          }
        }, 300);
      };

      window.speechSynthesis.speak(
        utterance,
      );
    },
    [
      lang,
      startRecognition,
      updateStatus,
    ],
  );

  /**
   * Envoi d'une question à Gemini.
   */
  const handleChatRequest = useCallback(
    async (text: string) => {
      const cleanQuestion =
        text.trim();

      if (!cleanQuestion) {
        return;
      }

      /**
       * Empêche deux requêtes simultanées.
       */
      if (
        requestInProgressRef.current
      ) {
        return;
      }

      requestInProgressRef.current =
        true;

      const currentSessionId =
        sessionIdRef.current;

      /**
       * Arrête le microphone pendant
       * que Gemini traite la question.
       */
      stopRecognition();

      updateStatus('connecting');

      try {
        /**
         * On utilise la ref pour obtenir
         * l'historique réellement à jour.
         */
        const currentHistory =
          transcriptionsRef.current;

        const answer =
          await getFinancialAdvice(
            cleanQuestion,
            currentHistory,
            lang,
          );

        /**
         * Nettoyage des caractères Markdown.
         */
        const cleanedAnswer =
          cleanResponse(answer);

        /**
         * Ajout à l'historique.
         */
        setTranscriptions(
          (previous: Transcription[]) => {
            const next = [
              ...previous,
              {
                role: 'user' as const,
                text: cleanQuestion,
              },
              {
                role: 'model' as const,
                text: cleanedAnswer,
              },
            ].slice(-10);

            transcriptionsRef.current =
              next;

            return next;
          },
        );

        requestInProgressRef.current =
          false;

        /**
         * Si la session a été arrêtée
         * pendant la requête, on ne lit
         * pas la réponse.
         */
        if (
          !isActiveRef.current ||
          sessionIdRef.current !==
            currentSessionId
        ) {
          updateStatus('idle');
          return;
        }

        /**
         * Lecture de la réponse.
         *
         * Le microphone sera automatiquement
         * relancé lorsque la lecture sera terminée.
         */
        speak(
          cleanedAnswer,
          currentSessionId,
        );
      } catch (error) {
        console.error(
          'Erreur Supabase/Gemini:',
          error,
        );

        requestInProgressRef.current =
          false;

        updateStatus('idle');
        updateActive(false);

        const errorMessage =
          error instanceof Error
            ? error.message
            : lang === 'fr'
              ? 'Une erreur est survenue pendant la consultation.'
              : 'An error occurred during the consultation.';

        alert(errorMessage);
      }
    },
    [
      lang,
      speak,
      stopRecognition,
      updateActive,
      updateStatus,
    ],
  );

  /**
   * Arrêt complet de la session.
   */
  const stopSession =
    useCallback(() => {
      /**
       * Invalide immédiatement l'ancienne
       * session.
       */
      sessionIdRef.current += 1;

      requestInProgressRef.current =
        false;

      recognitionStartingRef.current =
        false;

      updateActive(false);
      updateStatus('idle');

      /**
       * Arrêt de la voix.
       */
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      /**
       * Arrêt du microphone.
       */
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart =
            null;

          recognitionRef.current.onresult =
            null;

          recognitionRef.current.onerror =
            null;

          recognitionRef.current.onend =
            null;

          recognitionRef.current.stop();
        } catch {
          // L'instance peut déjà être arrêtée.
        }

        recognitionRef.current = null;
      }
    }, [
      updateActive,
      updateStatus,
    ]);

  /**
   * Démarrage de la session.
   */
  const startSession =
    useCallback(() => {
      const Recognition =
        getSpeechRecognition();

      if (!Recognition) {
        alert(
          lang === 'fr'
            ? 'Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez Google Chrome ou Microsoft Edge.'
            : 'Your browser does not support speech recognition. Please use Google Chrome or Microsoft Edge.',
        );

        return;
      }

      /**
       * Nettoyage d'une éventuelle ancienne instance.
       */
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart =
            null;

          recognitionRef.current.onresult =
            null;

          recognitionRef.current.onerror =
            null;

          recognitionRef.current.onend =
            null;

          recognitionRef.current.stop();
        } catch {
          // Rien à faire.
        }
      }

      /**
       * Nouvelle session.
       */
      sessionIdRef.current += 1;

      const currentSessionId =
        sessionIdRef.current;

      requestInProgressRef.current =
        false;

      recognitionStartingRef.current =
        false;

      updateActive(true);
      updateStatus('listening');

      /**
       * Création d'une nouvelle instance.
       */
      const recognition =
        new Recognition();

      recognition.lang =
        lang === 'fr'
          ? 'fr-FR'
          : 'en-US';

      /**
       * Une phrase/question à la fois.
       */
      recognition.continuous = false;

      recognition.interimResults =
        false;

      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        recognitionStartingRef.current =
          false;

        if (!isActiveRef.current) {
          return;
        }

        updateStatus('listening');
      };

      recognition.onresult = (
        event: any,
      ) => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        const transcript =
          event?.results?.[0]?.[0]
            ?.transcript
            ?.trim() || '';

        if (!transcript) {
          return;
        }

        handleChatRequest(
          transcript,
        );
      };

      recognition.onerror = (
        event: any,
      ) => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        recognitionStartingRef.current =
          false;

        const error =
          event?.error;

        console.warn(
          'Erreur reconnaissance vocale:',
          error,
        );

        /**
         * "no-speech" signifie simplement
         * que le navigateur n'a rien entendu.
         *
         * Ce n'est pas une erreur fatale.
         */
        if (
          error === 'no-speech'
        ) {
          if (
            isActiveRef.current &&
            !requestInProgressRef.current &&
            statusRef.current ===
              'listening'
          ) {
            setTimeout(() => {
              if (
                isActiveRef.current &&
                !requestInProgressRef.current &&
                sessionIdRef.current ===
                  currentSessionId
              ) {
                startRecognition();
              }
            }, 300);
          }

          return;
        }

        /**
         * Permission microphone refusée.
         */
        if (
          error === 'not-allowed' ||
          error ===
            'service-not-allowed'
        ) {
          updateActive(false);
          updateStatus('idle');

          alert(
            lang === 'fr'
              ? "L'accès au microphone a été refusé. Autorisez le microphone dans les paramètres de votre navigateur."
              : 'Microphone access was denied. Please allow microphone access in your browser settings.',
          );

          return;
        }

        /**
         * Autres erreurs.
         */
        console.error(
          'Erreur reco vocale:',
          error,
        );

        updateActive(false);
        updateStatus('idle');
      };

      recognition.onend = () => {
        if (
          sessionIdRef.current !==
          currentSessionId
        ) {
          return;
        }

        recognitionStartingRef.current =
          false;

        /**
         * Session terminée par l'utilisateur.
         */
        if (!isActiveRef.current) {
          return;
        }

        /**
         * Gemini est encore en train de répondre.
         */
        if (
          requestInProgressRef.current
        ) {
          return;
        }

        /**
         * La synthèse vocale est en cours.
         */
        if (
          statusRef.current ===
          'speaking'
        ) {
          return;
        }

        /**
         * Si nous sommes toujours en mode
         * écoute, on relance SpeechRecognition.
         */
        if (
          statusRef.current ===
          'listening'
        ) {
          setTimeout(() => {
            if (
              isActiveRef.current &&
              !requestInProgressRef.current &&
              sessionIdRef.current ===
                currentSessionId
            ) {
              startRecognition();
            }
          }, 300);
        }
      };

      recognitionRef.current =
        recognition;

      /**
       * Première écoute.
       */
      startRecognition();
    }, [
      handleChatRequest,
      lang,
      startRecognition,
      updateActive,
      updateStatus,
    ]);

  /**
   * Nettoyage lorsque le composant
   * est démonté.
   */
  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;

      requestInProgressRef.current =
        false;

      recognitionStartingRef.current =
        false;

      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart =
            null;

          recognitionRef.current.onresult =
            null;

          recognitionRef.current.onerror =
            null;

          recognitionRef.current.onend =
            null;

          recognitionRef.current.stop();
        } catch {
          // Rien à faire.
        }

        recognitionRef.current =
          null;
      }
    };
  }, []);

  /**
   * Traductions.
   *
   * Le type explicite évite l'erreur TS7053
   * sur labels[status].
   */
  const labels: Record<
  'fr' | 'en',
  Record<
    ChatStatus,
    string
  > & {
    title: string;
    startTitle: string;
    startDesc: string;
    startButton: string;
    stopButton: string;
  }
> = {
    fr: {
      title: 'Expert Finance Global',
      idle: 'Mode Veille',
      connecting: 'Réflexion...',
      speaking: 'Conseil...',
      listening: 'Je vous écoute...',
      startTitle:
        'Consultation Vocale',
      startDesc:
        'Parlez naturellement pour analyser vos finances.',
      startButton:
        "Démarrer l'analyse",
      stopButton: 'Terminer',
    },

    en: {
      title: 'Global Finance Expert',
      idle: 'Standby Mode',
      connecting: 'Thinking...',
      speaking: 'Advising...',
      listening: 'Listening...',
      startTitle:
        'Voice Consultation',
      startDesc:
        'Speak naturally to analyze your finances.',
      startButton:
        'Start analysis',
      stopButton: 'Stop',
    },
  };

  const currentLabels =
    labels[lang];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden transition-all duration-500">
      {/* HEADER */}
      <div className="bg-slate-900 p-5 flex items-center justify-between text-white">
        <div className="flex items-center space-x-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isActive
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-slate-700'
            }`}
          >
            <i
              className={`fas ${
                status === 'speaking'
                  ? 'fa-volume-up'
                  : 'fa-microphone'
              }`}
            ></i>
          </div>

          <div>
            <p className="font-bold">
              {currentLabels.title}
            </p>

            <p className="text-[10px] text-slate-400 uppercase tracking-widest">
              {currentLabels[status]}
            </p>
          </div>
        </div>
      </div>

      {/* CONTENU */}
      <div className="flex-1 p-6 flex flex-col bg-slate-50/50 relative overflow-hidden">
        {!isActive ? (
          <div className="text-center my-auto">
            <h3 className="text-xl font-black text-slate-900 mb-2">
              {currentLabels.startTitle}
            </h3>

            <p className="text-slate-500 text-sm mb-6">
              {currentLabels.startDesc}
            </p>

            <button
              type="button"
              onClick={startSession}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95"
            >
              {currentLabels.startButton}
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            {/* ANIMATION MICROPHONE */}
            <div className="flex-1 flex items-center justify-center space-x-1">
              {Array.from(
                { length: 5 },
                (_, index) => (
                  <div
                    key={index}
                    className={`w-2 bg-emerald-500 rounded-full transition-all duration-300 ${
                      status === 'listening'
                        ? 'animate-bounce'
                        : 'h-2'
                    }`}
                    style={{
                      animationDelay: `${
                        index * 0.1
                      }s`,

                      height:
                        status ===
                        'listening'
                          ? '40px'
                          : status ===
                              'speaking'
                            ? '60px'
                            : '8px',

                      opacity:
                        status ===
                        'connecting'
                          ? 0.3
                          : 1,
                    }}
                  ></div>
                ),
              )}
            </div>

            {/* HISTORIQUE */}
            <div className="bg-white/80 rounded-2xl p-4 mb-4 max-h-40 overflow-y-auto shadow-inner text-sm">
              {transcriptions.map(
                (
                  transcription: Transcription,
                  index: number,
                ) => (
                  <div
                    key={`${transcription.role}-${index}`}
                    className={`mb-3 ${
                      transcription.role ===
                      'user'
                        ? 'text-right'
                        : 'text-left'
                    }`}
                  >
                    <span
                      className={`inline-block px-3 py-2 rounded-2xl whitespace-pre-wrap ${
                        transcription.role ===
                        'user'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {
                        transcription.text
                      }
                    </span>
                  </div>
                ),
              )}
            </div>

            {/* BOUTON ARRÊT */}
            <button
              type="button"
              onClick={stopSession}
              className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl active:scale-95 transition-transform"
            >
              {currentLabels.stopButton}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};