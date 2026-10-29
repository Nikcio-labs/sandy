import type { ReactNode } from "react";

const paths = {
  box: (
    <>
      <path d="m3 7 9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 5 9-5M12 12v9" />
    </>
  ),
  create: (
    <>
      <path d="m12 3 8 4.5v8L12 20l-8-4.5v-8Z" />
      <path d="m4 7.5 8 4.5 8-4.5M12 12v8M20 16v6M17 19h6" />
    </>
  ),
  template: (
    <>
      <path d="M6 3h8l5 5v13H6Z" />
      <path d="M14 3v6h5M9 13h7M9 17h7" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 16h.01" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  "chevron-right": <path d="m9 5 7 7-7 7" />,
  back: <path d="m15 5-7 7 7 7" />,
  dune: (
    <>
      <path d="M2 19c3-7 7-12 10-12s7 5 10 12z" />
      <path d="M8 19c2-4 5-7 8-7" />
    </>
  ),
  plus: <path d="M12 4v16M4 12h16" />,
  kit: (
    <>
      <path d="m3 7 9-4 9 4-9 4z" />
      <path d="m3 12 9 4 9-4M3 17l9 4 9-4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13" />
      <path d="M10 11v6m4-6v6" />
    </>
  ),
  stop: (
    <rect x="5" y="5" width="14" height="14" rx="2" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-11v1" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 11a9 9 0 1 0-2 7" />
      <path d="M21 3v8h-8" />
    </>
  ),
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  bulb: <path d="M8 16a7 7 0 1 1 8 0v3H8Zm1 6h6M12 1V0M3 5 1 3m20 2 2-2" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m7 9 3 3-3 3m6 0h4" />
    </>
  ),
  shield: (
    <>
      <path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="5" width="14" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  edit: (
    <>
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="m12 12 9 9m-5-5 3-3m-6 0 3-3" />
    </>
  ),
  update: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16V8m-3.5 3.5L12 8l3.5 3.5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export default function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ? `icon ${className}` : "icon"}
    >
      {paths[name]}
    </svg>
  );
}
