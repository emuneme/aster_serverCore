import React from 'react';

interface AsterLogoProps {
  variant?: 'full' | 'compact' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  showSlogan?: boolean;
  className?: string;
}

export const AsterLogo: React.FC<AsterLogoProps> = ({
  variant = 'full',
  size = 'md',
  showSlogan = true,
  className = '',
}) => {
  // Configuração de tamanhos
  const dimensions = {
    sm: { symbol: 'w-7 h-7', text: 'text-base', sub: 'text-[8px]', gap: 'gap-2' },
    md: { symbol: 'w-9 h-9', text: 'text-xl', sub: 'text-[9px]', gap: 'gap-3' },
    lg: { symbol: 'w-14 h-14', text: 'text-3xl', sub: 'text-[11px]', gap: 'gap-4' },
  }[size];

  return (
    <div className={`inline-flex items-center ${dimensions.gap} select-none ${className}`}>
      {/* Símbolo Vetorial SVG Oficial ASTER */}
      <div className={`relative shrink-0 ${dimensions.symbol} flex items-center justify-center`}>
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_2px_8px_rgba(249,115,22,0.35)]"
        >
          {/* Retângulo Traseiro Laranja ASTER */}
          <rect
            x="28"
            y="12"
            width="58"
            height="58"
            rx="4"
            stroke="#F97316"
            strokeWidth="6"
            fill="#F97316"
            fillOpacity="0.08"
          />

          {/* Retângulo Frontal Sobreposto */}
          <rect
            x="12"
            y="30"
            width="58"
            height="58"
            rx="4"
            stroke="#F97316"
            strokeWidth="6"
            fill="#0F172A"
          />

          {/* Linha Divisória de Grade Interna */}
          <line x1="12" y1="59" x2="70" y2="59" stroke="#F97316" strokeWidth="3" strokeDasharray="4 2" />
          <line x1="41" y1="30" x2="41" y2="88" stroke="#F97316" strokeWidth="3" strokeDasharray="4 2" />

          {/* Monograma Estilizado ASTER ("A" + Núcleo de Servidor) */}
          <path
            d="M41 42L28 76H36L39 67H43L46 76H54L41 42Z"
            fill="#F97316"
          />
          <polygon points="41,52 38.5,60 43.5,60" fill="#0F172A" />

          {/* Indicador de Conexão Central Sky Blue */}
          <circle cx="41" cy="59" r="4.5" fill="#0EA5E9" />
          <circle cx="41" cy="59" r="2" fill="#FFFFFF" />

          {/* Acento Tecnológico Superior Direito */}
          <circle cx="76" cy="22" r="4" fill="#0EA5E9" />
          <path d="M72 32L80 32" stroke="#0EA5E9" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Identidade Textual: ASTER ServerCore & Slogan */}
      {variant !== 'icon' && (
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5 leading-none">
            {/* Letra A em Laranja Oficial e STER em Branco */}
            <span className={`${dimensions.text} font-black tracking-tight`}>
              <span className="text-orange-500">A</span>
              <span className="text-white">STER</span>
            </span>

            {/* Nome do Produto ServerCore */}
            <span className={`${dimensions.text} font-bold text-sky-400 tracking-tight`}>
              ServerCore
            </span>

            {/* Badge de Versão */}
            {variant === 'full' && (
              <span className="ml-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                v1.0
              </span>
            )}
          </div>

          {/* Slogan Oficial Solicitado */}
          {showSlogan && variant === 'full' && (
            <span
              className={`${dimensions.sub} font-semibold uppercase tracking-wider text-slate-400 mt-1 font-mono`}
            >
              GESTÃO E AUTOMAÇÃO DE SERVIDORES LINUX
            </span>
          )}
        </div>
      )}
    </div>
  );
};
