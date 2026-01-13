
import React, { useState } from 'react';
import { AdvisorChat } from './components/AdvisorChat';

type Language = 'fr' | 'en';

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('fr');

  const content = {
    fr: {
      title: "Espace Conseil",
      subtitle: "Patrimoine mondial.",
      region: "Région",
      auto: "Auto",
      flashTitle: "Stratégie",
      mainTitle: <>Gestion des finances</>,
      mainDesc: "Simulez vos scénarios d'épargne en monnaie locale.",
      feature1: "Multidevises",
      feature2: "Risques",
      card1Title: "Investissement",
      card1Desc: "Fructifiez vos actifs sur les marchés locaux.",
      card2Title: "Protection",
      card2Desc: "Anticipez les imprévus avec une réserve d'urgence."
    },
    en: {
      title: "Advice Space",
      subtitle: "Global assets.",
      region: "Region",
      auto: "Auto",
      flashTitle: "Strategy",
      mainTitle: <>Global Management.</>,
      mainDesc: "Simulate savings scenarios in local currency.",
      feature1: "Multi-currency",
      feature2: "Risks",
      card1Title: "Investment",
      card1Desc: "Grow assets based on local markets.",
      card2Title: "Protection",
      card2Desc: "Anticipate the unexpected with emergency reserves."
    }
  }[lang];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#fcfdfe]">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-20 bg-slate-950 flex flex-row lg:flex-col items-center justify-between p-4 lg:py-8 shadow-2xl z-20 shrink-0">
        <div className="flex lg:flex-col items-center space-x-4 lg:space-x-0 lg:space-y-8">
          <div className="w-10 h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-xl transform -rotate-6">
            <i className="fas fa-vault text-white text-xl"></i>
          </div>
          <nav className="flex lg:flex-col items-center space-x-4 lg:space-x-0 lg:space-y-6">
            <button className="w-10 h-10 lg:w-12 lg:h-12 text-emerald-400 bg-white/10 rounded-xl flex items-center justify-center">
              <i className="fas fa-home text-sm lg:text-base"></i>
            </button>
            <button className="w-10 h-10 lg:w-12 lg:h-12 text-slate-500 hover:text-white transition-colors flex items-center justify-center">
              <i className="fas fa-compass text-sm lg:text-base"></i>
            </button>
          </nav>
        </div>
        <div className="hidden lg:flex flex-col items-center space-y-6">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <i className="fas fa-user text-slate-400 text-sm"></i>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/30">
        <header className="px-6 py-4 flex items-center justify-between bg-white border-b border-slate-100 shrink-0">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">{content.title}</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{content.subtitle}</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setLang('fr')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${lang === 'fr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                FR
              </button>
              <button 
                onClick={() => setLang('en')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-6 lg:gap-8">
            
            {/* Advisor Chat - Top on mobile, right on desktop */}
            <div className="order-1 lg:order-2 lg:col-span-4 xl:col-span-4">
              <div className="sticky top-0 lg:top-4 z-10">
                <AdvisorChat lang={lang} />
              </div>
            </div>

            {/* Left Content - Bottom on mobile, left on desktop */}
            <div className="order-2 lg:order-1 lg:col-span-8 xl:col-span-8 space-y-6 lg:space-y-8">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-6 lg:p-8 text-white shadow-xl relative overflow-hidden group">
                <div className="relative z-10">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md mb-4 inline-block">{content.flashTitle}</span>
                  <h2 className="text-2xl lg:text-3xl font-black mb-3 leading-tight">{content.mainTitle}</h2>
                  <p className="text-emerald-50/80 text-sm mb-6 leading-relaxed max-w-sm">
                    {content.mainDesc}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center space-x-2">
                      <i className="fas fa-check-circle text-emerald-300 text-xs"></i>
                      <span className="text-[10px] font-bold uppercase">{content.feature1}</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-3 py-2 rounded-xl border border-white/10 flex items-center space-x-2">
                      <i className="fas fa-shield-halved text-emerald-300 text-xs"></i>
                      <span className="text-[10px] font-bold uppercase">{content.feature2}</span>
                    </div>
                  </div>
                </div>
                <i className="fas fa-chart-line absolute -bottom-6 -right-6 text-9xl text-white/5 transform rotate-12 group-hover:scale-110 transition-transform duration-700"></i>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <i className="fas fa-seedling text-base"></i>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{content.card1Title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{content.card1Desc}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                    <i className="fas fa-umbrella text-base"></i>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">{content.card2Title}</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">{content.card2Desc}</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
