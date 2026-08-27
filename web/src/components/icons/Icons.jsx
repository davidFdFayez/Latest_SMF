/* Small inline SVG icon set — kept dependency-free, sized/colored entirely
   through the master stylesheet (currentColor + explicit width/height rules). */

export function IconChevron(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="main-nav__chevron" {...props}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconEmail(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 5h18v14H3V5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m3 6 9 7 9-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconPhone(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.5 2.5.8 3.8.9.6 0 1 .5 1 1v3.6c0 .6-.5 1-1 1C10.9 21.5 2.5 13.1 2.5 2.8c0-.6.5-1 1-1H7c.6 0 1 .4 1 1 .1 1.3.4 2.6.9 3.8.1.4 0 .8-.2 1L6.6 10.8Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconLocation(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconExternal(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconWhatsApp(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M17.5 14.4c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.2-.7.9-.9 1.1-.2.2-.3.2-.6.1-.9-.4-1.8-1-2.6-1.7-.7-.6-1.3-1.4-1.8-2.2-.1-.2 0-.4.1-.5.2-.2.4-.5.6-.7.1-.2.2-.4.1-.6-.1-.2-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.5.5-.8 1.2-.8 1.9.1 1 .5 2 1.1 2.9 1.3 1.9 2.9 3.4 4.9 4.4.6.3 1.2.5 1.8.7.7.2 1.4.2 2 .1.7-.1 1.3-.6 1.7-1.2.2-.3.2-.7.1-1l-.1-.3ZM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Z" />
    </svg>
  );
}

export function IconXTwitter(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.9 3H21l-4.9 5.6L21.8 21h-6.1l-4.8-6.2L5.2 21H3l5.2-6-6-9h6.2l4.4 5.7L18.9 3Zm-2.1 16.2h1.7L8.3 4.7H6.5l10.3 14.5Z" />
    </svg>
  );
}

export function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function IconYouTube(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 9.5v5l4.3-2.5-4.3-2.5Z" fill="currentColor" />
    </svg>
  );
}

export function IconSnapchat(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 3c2.8 0 5 2.3 4.9 5.2v1.6c0 .3.3.5.7.7.5.2 1.4.4 1.4 1.1 0 .5-.5.8-1 1.1-.3.2-.3.4-.2.6.2.6 1.1 1 1.1 1.4 0 .5-1 .7-1.6.8-.2 0-.3.1-.4.4-.1.4-.2.9-.7 1-.5.1-1.2 0-1.8.2-.6.2-1 .8-2.4.8s-1.8-.6-2.4-.8c-.6-.2-1.3-.1-1.8-.2-.5-.1-.6-.6-.7-1-.1-.3-.2-.4-.4-.4-.6-.1-1.6-.3-1.6-.8 0-.4.9-.8 1.1-1.4.1-.2.1-.4-.2-.6-.5-.3-1-.6-1-1.1 0-.7.9-.9 1.4-1.1.4-.2.7-.4.7-.7V8.2C7 5.3 9.2 3 12 3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconTikTok(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M16.6 3h-2.9v12.2a2.6 2.6 0 1 1-1.9-2.5V9.6a5.5 5.5 0 1 0 4.8 5.5V9.1c1 .7 2.2 1.1 3.4 1.1V7.3c-1.9 0-3.4-1.4-3.4-3.2V3Z" />
    </svg>
  );
}

export function IconPerson(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconStar(props) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconThreads(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12.2 21c-3 0-5.2-1-6.6-2.9C4.3 16.4 3.7 14.4 3.7 12v0c0-2.4.6-4.4 1.9-6.1C7 4 9.2 3 12.2 3c2.3 0 4.2.6 5.5 1.8.9.8 1.5 1.8 1.9 3l-1.9.6c-.6-2-2.1-3.4-5.5-3.4-2.3 0-3.9.7-4.9 2.1-1 1.3-1.4 2.9-1.4 4.9s.5 3.6 1.4 4.9c1 1.4 2.6 2.1 4.9 2.1 2 0 3.4-.5 4.3-1.4.7-.7 1-1.5 1-2.4 0-1.1-.4-1.9-1.3-2.5-.3 1.2-.9 2.1-1.7 2.7-.8.6-1.8.9-2.9.8-1.1-.1-2-.5-2.6-1.2-.6-.7-.9-1.5-.8-2.4.1-1 .6-1.8 1.4-2.3.8-.5 1.9-.8 3.1-.7.6 0 1.2.1 1.8.2 0-.6-.2-1.1-.6-1.5-.4-.4-1-.6-1.7-.6-1 0-1.8.4-2.2 1.2l-1.7-1c.8-1.4 2.2-2.1 3.9-2.1 1.3 0 2.3.4 3.1 1.2.7.7 1.1 1.7 1.2 2.9 1.9.9 2.9 2.4 2.9 4.4 0 1.5-.6 2.8-1.7 3.9-1.3 1.2-3.2 1.8-5.5 1.8Zm-.4-9c-1.4 0-2.2.5-2.3 1.3 0 .4.1.7.4 1 .3.3.7.5 1.2.5.7 0 1.3-.2 1.7-.6.5-.5.8-1.2.9-2.1-.6-.1-1.2-.2-1.9-.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconLinkedIn(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 10v6.2M7.5 7.6v.1M12 16.2V12.7c0-1.3.8-2.2 2-2.2s1.9.9 1.9 2.2v3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
