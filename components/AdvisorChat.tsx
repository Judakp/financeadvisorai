
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { decode, decodeAudioData, createBlob } from '../services/audioService';

const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY || '';

interface AdvisorChatProps {
  lang: 'fr' | 'en';
}

export const AdvisorChat: React.FC<AdvisorChatProps> = ({ lang }) => {
  const [isActive, setIsActive] = useState(false);
  const [transcriptions, setTranscriptions] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking'>('idle');
  
  const sessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionBufferRef = useRef({ user: '', model: '' });

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.debug('Session already closed');
      }
      sessionRef.current = null;
    }

    sourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();

    if (audioContextsRef.current) {
      const { input, output } = audioContextsRef.current;
      if (input && input.state !== 'closed') {
        input.close().catch(console.error);
      }
      if (output && output.state !== 'closed') {
        output.close().catch(console.error);
      }
      audioContextsRef.current = null;
    }

    setIsActive(false);
    setStatus('idle');
    nextStartTimeRef.current = 0;
  }, []);

  const startSession = async () => {
    if (!API_KEY) return;
    
    setStatus('connecting');
    setIsActive(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await inputCtx.resume();
      await outputCtx.resume();
      
      audioContextsRef.current = { input: inputCtx, output: outputCtx };
      const ai = new GoogleGenAI({ apiKey: API_KEY });

      const systemInstructionFr = `Tu es un conseiller financier expert international. 
          Tes réponses doivent être détaillées et instructives, MAIS reste concis pour ne pas que le flux audio soit trop long. 
          Explique les concepts clairement en 3 à 5 phrases maximum par point. 
          Priorise les informations les plus importantes.
          Adapte-toi au pays de l'utilisateur (Afrique, Amérique, Europe). 
          Utilise le FCFA pour le Bénin et l'Afrique de l'Ouest, le Dollar pour les USA. 
          Sois encourageant et précis.`;

      const systemInstructionEn = `You are an international financial expert advisor. 
          Your answers should be detailed and educational, BUT keep them concise enough so the audio stream doesn't get cut off. 
          Explain concepts clearly in 3 to 5 sentences max per point. 
          Prioritize the most important information first.
          Adapt to the user's region (Africa, America, Europe). 
          Use FCFA for West Africa/Benin, and Dollar for the USA. 
          Be encouraging and precise.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('listening');
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              transcriptionBufferRef.current.model += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              transcriptionBufferRef.current.user += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const userT = transcriptionBufferRef.current.user;
              const modelT = transcriptionBufferRef.current.model;
              if (userT || modelT) {
                setTranscriptions(prev => [
                  ...prev,
                  ...(userT ? [{role: 'user', text: userT} as const] : []),
                  ...(modelT ? [{role: 'model', text: modelT} as const] : [])
                ].slice(-10));
              }
              transcriptionBufferRef.current = { user: '', model: '' };
            }

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
              setStatus('speaking');
              const ctx = audioContextsRef.current?.output;
              if (ctx && ctx.state !== 'closed') {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.addEventListener('ended', () => {
                  sourcesRef.current.delete(source);
                  if (sourcesRef.current.size === 0) setStatus('listening');
                });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(source);
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setStatus('listening');
            }
          },
          onclose: () => stopSession(),
          onerror: (e) => stopSession(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: lang === 'fr' ? 'Kore' : 'Zephyr' } },
          },
          systemInstruction: lang === 'fr' ? systemInstructionFr : systemInstructionEn,
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (err) {
      stopSession();
    }
  };

  useEffect(() => {
    return () => stopSession();
  }, [stopSession, lang]);

  const labels = {
    fr: {
      title: 'Expert Finance Global',
      idle: 'Mode Veille',
      connecting: 'Initialisation...',
      speaking: 'Conseil...',
      listening: 'À l\'écoute',
      startTitle: 'Consultation Vocale',
      startDesc: 'Analyse en temps réel de votre stratégie financière.',
      startButton: 'Démarrer l\'analyse',
      stopButton: 'Terminer',
      transcriptionHint: 'Transcription...'
    },
    en: {
      title: 'Global Finance Expert',
      idle: 'Standby Mode',
      connecting: 'Initializing...',
      speaking: 'Advising...',
      listening: 'Listening',
      startTitle: 'Voice Consultation',
      startDesc: 'Real-time analysis of your financial strategy.',
      startButton: 'Start analysis',
      stopButton: 'Stop',
      transcriptionHint: 'Transcription...'
    }
  }[lang];

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden transition-all duration-500 hover:shadow-2xl max-h-[500px] lg:max-h-none">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5 flex items-center justify-between text-white shrink-0">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-slate-700'}`}>
            <i className={`fas ${status === 'speaking' ? 'fa-volume-up' : status === 'listening' ? 'fa-microphone' : 'fa-brain'} text-lg`}></i>
          </div>
          <div>
            <p className="font-bold text-base leading-tight">{labels.title}</p>
            <div className="flex items-center space-x-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                {status === 'idle' ? labels.idle : status === 'connecting' ? labels.connecting : status === 'speaking' ? labels.speaking : labels.listening}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6 flex flex-col items-center justify-center bg-slate-50/50 relative">
        {!isActive ? (
          <div className="text-center w-full">
            <div className="w-16 h-16 bg-white shadow-sm border border-slate-100 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-5 transform rotate-3">
              <i className="fas fa-comment-dots text-2xl"></i>
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{labels.startTitle}</h3>
            <p className="text-slate-500 text-xs leading-relaxed mb-6">
              {labels.startDesc}
            </p>
            <button 
              onClick={startSession}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center space-x-2"
            >
              <i className="fas fa-microphone"></i>
              <span>{labels.startButton}</span>
            </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col justify-between">
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-end justify-center space-x-1 h-20">
                {[...Array(8)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-1.5 bg-emerald-500 rounded-full transition-all duration-300 ${status === 'speaking' || status === 'listening' ? 'opacity-100' : 'opacity-20 h-1.5'}`}
                    style={{ 
                      height: status !== 'idle' ? `${Math.random() * 80 + 20}%` : '6px',
                      animation: (status === 'speaking' || status === 'listening') ? `wave 1s infinite ease-in-out ${i * 0.1}s` : 'none'
                    }}
                  ></div>
                ))}
              </div>
            </div>
            
            <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto shadow-inner text-xs">
               {transcriptions.length === 0 ? (
                 <p className="text-center text-slate-400 italic">{labels.transcriptionHint}</p>
               ) : (
                 transcriptions.map((t, i) => (
                   <div key={i} className={`mb-2 ${t.role === 'user' ? 'text-right' : 'text-left'}`}>
                     <span className={`inline-block px-2.5 py-1 rounded-lg ${t.role === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-800 font-medium'}`}>
                       {t.text}
                     </span>
                   </div>
                 ))
               )}
            </div>

            <button 
              onClick={stopSession}
              className="w-full py-3 bg-slate-900 text-white hover:bg-black font-bold rounded-xl transition-all flex items-center justify-center space-x-2 text-sm"
            >
              <i className="fas fa-stop text-red-400"></i>
              <span>{labels.stopButton}</span>
            </button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes wave {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
      `}</style>
    </div>
  );
};
