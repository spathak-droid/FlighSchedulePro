export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Shield / badge background */}
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#14532d" />
      <rect x="7" y="7" width="50" height="50" rx="11" fill="#15803d" />

      {/* Stylised airplane — top-down silhouette */}
      {/* Fuselage */}
      <path
        d="M32 12C30.5 12 29.5 14 29.5 17L29.5 47C29.5 49.5 30.5 51 32 52C33.5 51 34.5 49.5 34.5 47L34.5 17C34.5 14 33.5 12 32 12Z"
        fill="#fff"
      />

      {/* Main wings */}
      <path
        d="M29.5 28L12 36C11 36.5 11 38 12 38.5L18 40L29.5 34Z"
        fill="#d1fae5"
      />
      <path
        d="M34.5 28L52 36C53 36.5 53 38 52 38.5L46 40L34.5 34Z"
        fill="#d1fae5"
      />

      {/* Tail wings */}
      <path
        d="M30 46L22 49C21.5 49.2 21.5 50 22 50.2L26 51L30 48Z"
        fill="#bbf7d0"
      />
      <path
        d="M34 46L42 49C42.5 49.2 42.5 50 42 50.2L38 51L34 48Z"
        fill="#bbf7d0"
      />

      {/* Cockpit window */}
      <ellipse cx="32" cy="16" rx="1.5" ry="2.5" fill="#14532d" opacity="0.6" />

      {/* Wing stripe accents */}
      <path d="M29.5 29L15 35.5L16 36.5L29.5 30.5Z" fill="#fff" opacity="0.4" />
      <path d="M34.5 29L49 35.5L48 36.5L34.5 30.5Z" fill="#fff" opacity="0.4" />
    </svg>
  );
}

export function LogoMark({ size = 20, color = '#15803d' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Airplane only — no background, for inline use */}
      <path
        d="M32 6C30 6 28.5 9 28.5 13L28.5 51C28.5 54 30 56 32 58C34 56 35.5 54 35.5 51L35.5 13C35.5 9 34 6 32 6Z"
        fill={color}
      />
      <path
        d="M28.5 26L8 36C6.5 36.7 6.5 39 8 39.5L16 42L28.5 33Z"
        fill={color}
        opacity="0.7"
      />
      <path
        d="M35.5 26L56 36C57.5 36.7 57.5 39 56 39.5L48 42L35.5 33Z"
        fill={color}
        opacity="0.7"
      />
      <path d="M29 49L20 53C19 53.3 19 54.5 20 54.7L25 55.5L29 51Z" fill={color} opacity="0.5" />
      <path d="M35 49L44 53C45 53.3 45 54.5 44 54.7L39 55.5L35 51Z" fill={color} opacity="0.5" />
    </svg>
  );
}
