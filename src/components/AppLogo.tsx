import React from 'react';

interface AppLogoProps {
  className?: string;
  size?: number;
}

/**
 * Custom TavernSmith vector emblem featuring a stylized glowing anvil,
 * storyteller's quill, and arcane spark bound to --theme-accent.
 */
export const AppLogo: React.FC<AppLogoProps> = ({
  className = 'h-8 w-8',
  size = 32,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id="tsAppLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#18181b" />
          <stop offset="100%" stopColor="#09090b" />
        </linearGradient>
        <linearGradient id="tsAppLogoAnvil" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="65%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Rounded Crest Background */}
      <rect
        width="512"
        height="512"
        rx="112"
        fill="url(#tsAppLogoBg)"
      />
      <rect
        x="22"
        y="22"
        width="468"
        height="468"
        rx="94"
        stroke="var(--theme-accent, #6366f1)"
        strokeWidth="18"
        strokeOpacity="0.9"
      />

      {/* Subtle Arcane Forge Ring */}
      <circle
        cx="256"
        cy="252"
        r="158"
        stroke="var(--theme-accent, #6366f1)"
        strokeWidth="6"
        strokeDasharray="16 14"
        strokeOpacity="0.4"
      />

      {/* Stylized Blacksmith Anvil */}
      <path
        d="M88 292 C120 278, 150 274, 178 274 L374 274 C396 274, 414 286, 420 304 L366 330 L174 330 C140 330, 108 314, 88 292 Z"
        fill="url(#tsAppLogoAnvil)"
      />
      <path
        d="M196 330 L336 330 C324 354, 326 376, 352 396 L174 396 C198 376, 204 354, 196 330 Z"
        fill="#94a3b8"
      />
      <rect
        x="146"
        y="396"
        width="236"
        height="34"
        rx="10"
        fill="url(#tsAppLogoAnvil)"
      />
      <path
        d="M180 302 L354 302"
        stroke="var(--theme-accent, #6366f1)"
        strokeWidth="12"
        strokeLinecap="round"
      />

      {/* Storyteller Quill */}
      <path
        d="M390 92 C332 92, 272 130, 242 190 C228 218, 222 250, 220 276 C250 272, 286 262, 314 240 C368 200, 400 144, 390 92 Z"
        fill="var(--theme-accent, #6366f1)"
      />
      <path
        d="M376 108 C326 158, 272 220, 214 292"
        stroke="#ffffff"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* Arcane Spark Emblem */}
      <path
        d="M184 110 L198 154 L242 168 L198 182 L184 226 L170 182 L126 168 L170 154 Z"
        fill="#ffffff"
      />
      <path
        d="M184 128 L193 157 L222 168 L193 179 L184 208 L175 179 L146 168 L175 157 Z"
        fill="var(--theme-accent, #6366f1)"
      />
    </svg>
  );
};
