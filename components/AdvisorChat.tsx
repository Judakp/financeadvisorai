import React, { useState, useRef, useEffect, useCallback } from 'react';
import { decode, decodeAudioData, createBlob } from '../services/audioService';

interface AdvisorChatProps {
  lang: 'fr' | 'en';
}

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const AdvisorChat: React.FC<AdvisorChatProps> = ({ lang }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  
  const recognitionRef = useRef<any>(null);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    utterance.onstart = () => setStatus('speaking');
    utterance.onend = () => {
      if (isActive) {
        setStatus('listening');
        try { recognitionRef.current?.start(); } catch (e) {}
      }
    };
    window.speechSynthesis.speak(utterance);
  }, [lang, isActive]);

  const handleChatRequest = async (text: string) => {
    if (!text.trim()) return;
    recognitionRef.current?.stop();
    setStatus('connecting');

    try {
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: transcriptions,
          lang: lang
        }),
      });

      const data = await response.json();
      setTranscriptions(prev => [
        ...prev,
        { role: 'user', text: text },
        { role: 'model', text: data.text }
      ].slice(-10));
      
      speak(data.text);
    } catch (err) {
      console.error("Erreur Backend:", err);
      setStatus('idle');
      setIsActive(false);
    }
  };

  const startSession = useCallback(async () => {
    if (!SpeechRecognition) {
      alert("Votre navigateur ne supporte pas la reconnaissance vocale.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'fr' ? 'fr-FR' : 'en-US';
    recognition.continuous = false; 
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsActive(true);
      setStatus('listening');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      handleChatRequest(transcript);
    };

    // CHANGEMENT ICI : Gestion intelligente des erreurs
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // C'est juste un silence, on ne coupe pas la session
        console.warn("Aucun discours détecté, on continue d'écouter...");
        return; 
      }
      console.error("Erreur reco vocale:", event.error);
      stopSession();
    };

    recognition.onend = () => {
      // Si on est toujours actif et qu'on n'est pas en train de parler, on relance
      if (isActive && status === 'listening') {
        try { recognition.start(); } catch(e) {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, isActive, status]);

  const stopSession = useCallback(() => {
    window.speechSynthesis.cancel();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsActive(false);
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => stopSession();
  }, [stopSession]);

  const labels = {
    fr: { title: 'Expert Finance Global', idle: 'Mode Veille', connecting: 'Réflexion...', speaking: 'Conseil...', listening: 'Je vous écoute...', startTitle: 'Consultation Vocale', startDesc: 'Parlez naturellement pour analyser vos finances.', startButton: 'Démarrer l\'analyse', stopButton: 'Terminer' },
    en: { title: 'Global Finance Expert', idle: 'Standby Mode', connecting: 'Thinking...', speaking: 'Advising...', listening: 'Listening...', startTitle: 'Voice Consultation', startDesc: 'Speak naturally to analyze your finances.', startButton: 'Start analysis', stopButton: 'Stop' }
  }[lang];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden transition-all duration-500">
      <div className="bg-slate-900 p-5 flex items-center justify-between text-white">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}>
            <i className={`fas ${status === 'speaking' ? 'fa-volume-up' : 'fa-microphone'}`}></i>
          </div>
          <div>
            <p className="font-bold">{labels.title}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">{labels[status] || status}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col bg-slate-50/50 relative overflow-hidden">
        {!isActive ? (
          <div className="text-center my-auto">
            <h3 className="text-xl font-black text-slate-900 mb-2">{labels.startTitle}</h3>
            <p className="text-slate-500 text-sm mb-6">{labels.startDesc}</p>
            <button onClick={startSession} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95">
              {labels.startButton}
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-2 bg-emerald-500 rounded-full transition-all duration-300 ${status === 'listening' ? 'animate-bounce' : 'h-2'}`} 
                  style={{ 
                    animationDelay: `${i * 0.1}s`, 
                    height: status === 'listening' ? '40px' : (status === 'speaking' ? '60px' : '8px'),
                    opacity: status === 'connecting' ? 0.3 : 1
                  }}
                ></div>
              ))}
            </div>
            
            <div className="bg-white/80 rounded-2xl p-4 mb-4 max-h-40 overflow-y-auto shadow-inner text-sm">
               {transcriptions.map((t, i) => (
                 <div key={i} className={`mb-3 ${t.role === 'user' ? 'text-right' : 'text-left'}`}>
                   <span className={`inline-block px-3 py-2 rounded-2xl ${t.role === 'user' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-600 text-white'}`}>
                     {t.text}
                   </span>
                 </div>
               ))}
            </div>

            <button onClick={stopSession} className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl active:scale-95 transition-transform">
              {labels.stopButton}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};