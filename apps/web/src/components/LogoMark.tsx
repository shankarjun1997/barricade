export function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bc-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2430" />
          <stop offset="1" stopColor="#0b1016" />
        </linearGradient>
        <linearGradient id="bc-wall" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe6a6" />
          <stop offset=".5" stopColor="#f5c451" />
          <stop offset="1" stopColor="#b98524" />
        </linearGradient>
        <radialGradient id="bc-blue" cx="32%" cy="26%" r="72%">
          <stop offset="0" stopColor="#bcdcff" />
          <stop offset=".55" stopColor="#4aa8ff" />
          <stop offset="1" stopColor="#2468b0" />
        </radialGradient>
        <radialGradient id="bc-green" cx="32%" cy="26%" r="72%">
          <stop offset="0" stopColor="#b6ffd3" />
          <stop offset=".55" stopColor="#35e07f" />
          <stop offset="1" stopColor="#178a4c" />
        </radialGradient>
      </defs>

      <rect x="1.5" y="1.5" width="61" height="61" rx="16" fill="url(#bc-tile)" stroke="#2a3340" strokeWidth="2" />
      <rect x="9" y="9" width="46" height="46" rx="10" fill="#090e13" stroke="rgba(255,255,255,.07)" />

      <g stroke="rgba(255,255,255,.075)" strokeWidth="1">
        <path d="M24.3 9v46M39.7 9v46M9 24.3h46M9 39.7h46" />
      </g>

      <path
        d="M32 42.5V36a2 2 0 0 0-2-2H18a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2h12a2 2 0 0 0 2-2"
        fill="none"
        stroke="#35e07f"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <rect x="18.5" y="29" width="31" height="7" rx="3.5" fill="url(#bc-wall)" />
      <path d="M20.5 30.2h27" stroke="rgba(255,255,255,.35)" strokeWidth="1.1" strokeLinecap="round" opacity=".65" />

      <circle cx="32" cy="16" r="5" fill="url(#bc-blue)" />
      <circle cx="30.2" cy="14.2" r="1.4" fill="rgba(255,255,255,.55)" />

      <circle cx="32" cy="47.5" r="5" fill="url(#bc-green)" />
      <circle cx="30.2" cy="45.7" r="1.4" fill="rgba(255,255,255,.6)" />
    </svg>
  );
}
