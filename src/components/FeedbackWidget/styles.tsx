export function FeedbackWidgetStyles() {
  return (
    <style>{`
        [data-fw-crrt] {
          color-scheme: dark;
          --fw-surface: #181818;
          --fw-surface-deep: #0A0A0A;
          --fw-surface-solid: #0D0D0D;
          --fw-surface-input: #222;
          --fw-surface-raised: #2a2a2a;
          --fw-surface-hover: #333;
          --fw-surface-divider: #3a3a3a;
          --fw-surface-divider-strong: #3A3A3A;
          --fw-surface-translucent: rgba(18, 18, 18, 0.96);
          --fw-menu-translucent: rgba(13, 13, 13, 0.96);
          --fw-instruction-translucent: rgba(10, 10, 10, 0.88);
          --fw-key-background: rgba(10, 10, 10, 0.62);
          --fw-foreground: #FFFFFF;
          --fw-foreground-soft: #E8E5DF;
          --fw-foreground-subtle: #ccc;
          --fw-foreground-muted: #A8A29A;
          --fw-foreground-faint: #6B6560;
          --fw-foreground-disabled: #555;
          --fw-empty-state: #555;
          --fw-foreground-meta: #8F8881;
          --fw-quote: #C9C4BC;
          --fw-active-label: #E8853D;
          --fw-active-label-soft: #E8A06B;
          --fw-danger-label: #F87171;
          --fw-info-label: #93C5FD;
          --fw-success-label: #4ADE80;
          --fw-time-chip-label: #FFB000;
          --fw-location-chip-label: #E8853D;
          --fw-contrast-02: rgba(255, 255, 255, 0.02);
          --fw-contrast-03: rgba(255, 255, 255, 0.03);
          --fw-contrast-04: rgba(255, 255, 255, 0.04);
          --fw-contrast-05: rgba(255, 255, 255, 0.05);
          --fw-contrast-055: rgba(255, 255, 255, 0.055);
          --fw-contrast-06: rgba(255, 255, 255, 0.06);
          --fw-contrast-07: rgba(255, 255, 255, 0.07);
          --fw-contrast-08: rgba(255, 255, 255, 0.08);
          --fw-contrast-09: rgba(255, 255, 255, 0.09);
          --fw-contrast-10: rgba(255, 255, 255, 0.10);
          --fw-contrast-12: rgba(255, 255, 255, 0.12);
          --fw-contrast-14: rgba(255, 255, 255, 0.14);
          --fw-contrast-15: rgba(255, 255, 255, 0.15);
          --fw-contrast-18: rgba(255, 255, 255, 0.18);
        }
        [data-fw-crrt][data-crrt-theme='light'] {
          color-scheme: light;
          --fw-surface: #FFFCF6;
          --fw-surface-deep: #F2EBE0;
          --fw-surface-solid: #FFFCF6;
          --fw-surface-input: #EDE3D2;
          --fw-surface-raised: #EDE3D2;
          --fw-surface-hover: #EDE3D2;
          --fw-surface-divider: rgba(10, 10, 10, 0.10);
          --fw-surface-divider-strong: rgba(10, 10, 10, 0.20);
          --fw-surface-translucent: rgba(255, 252, 246, 0.96);
          --fw-menu-translucent: rgba(255, 252, 246, 0.96);
          --fw-instruction-translucent: rgba(255, 252, 246, 0.94);
          --fw-key-background: rgba(10, 10, 10, 0.06);
          --fw-foreground: #0A0A0A;
          --fw-foreground-soft: #2C2C2C;
          --fw-foreground-subtle: #2C2C2C;
          --fw-foreground-muted: #6B6560;
          --fw-foreground-faint: #6B6560;
          --fw-foreground-disabled: #A8A29A;
          --fw-empty-state: #6B6560;
          --fw-foreground-meta: #6B6560;
          --fw-quote: #2C2C2C;
          --fw-active-label: #0A0A0A;
          --fw-active-label-soft: #6B6560;
          --fw-danger-label: #0A0A0A;
          --fw-info-label: #0A0A0A;
          --fw-success-label: #0A0A0A;
          --fw-time-chip-label: #0A0A0A;
          --fw-location-chip-label: #0A0A0A;
          --fw-contrast-02: rgba(10, 10, 10, 0.02);
          --fw-contrast-03: rgba(10, 10, 10, 0.03);
          --fw-contrast-04: rgba(10, 10, 10, 0.04);
          --fw-contrast-05: rgba(10, 10, 10, 0.05);
          --fw-contrast-055: rgba(10, 10, 10, 0.055);
          --fw-contrast-06: rgba(10, 10, 10, 0.06);
          --fw-contrast-07: rgba(10, 10, 10, 0.07);
          --fw-contrast-08: rgba(10, 10, 10, 0.08);
          --fw-contrast-09: rgba(10, 10, 10, 0.09);
          --fw-contrast-10: rgba(10, 10, 10, 0.10);
          --fw-contrast-12: rgba(10, 10, 10, 0.12);
          --fw-contrast-14: rgba(10, 10, 10, 0.14);
          --fw-contrast-15: rgba(10, 10, 10, 0.15);
          --fw-contrast-18: rgba(10, 10, 10, 0.18);
        }
        @media (prefers-color-scheme: light) {
          [data-fw-crrt][data-crrt-theme='system'] {
            color-scheme: light;
            --fw-surface: #FFFCF6;
            --fw-surface-deep: #F2EBE0;
            --fw-surface-solid: #FFFCF6;
            --fw-surface-input: #EDE3D2;
            --fw-surface-raised: #EDE3D2;
            --fw-surface-hover: #EDE3D2;
            --fw-surface-divider: rgba(10, 10, 10, 0.10);
            --fw-surface-divider-strong: rgba(10, 10, 10, 0.20);
            --fw-surface-translucent: rgba(255, 252, 246, 0.96);
            --fw-menu-translucent: rgba(255, 252, 246, 0.96);
            --fw-instruction-translucent: rgba(255, 252, 246, 0.94);
            --fw-key-background: rgba(10, 10, 10, 0.06);
            --fw-foreground: #0A0A0A;
            --fw-foreground-soft: #2C2C2C;
            --fw-foreground-subtle: #2C2C2C;
            --fw-foreground-muted: #6B6560;
            --fw-foreground-faint: #6B6560;
            --fw-foreground-disabled: #A8A29A;
            --fw-empty-state: #6B6560;
            --fw-foreground-meta: #6B6560;
            --fw-quote: #2C2C2C;
            --fw-active-label: #0A0A0A;
            --fw-active-label-soft: #6B6560;
            --fw-danger-label: #0A0A0A;
            --fw-info-label: #0A0A0A;
            --fw-success-label: #0A0A0A;
            --fw-time-chip-label: #0A0A0A;
            --fw-location-chip-label: #0A0A0A;
            --fw-contrast-02: rgba(10, 10, 10, 0.02);
            --fw-contrast-03: rgba(10, 10, 10, 0.03);
            --fw-contrast-04: rgba(10, 10, 10, 0.04);
            --fw-contrast-05: rgba(10, 10, 10, 0.05);
            --fw-contrast-055: rgba(10, 10, 10, 0.055);
            --fw-contrast-06: rgba(10, 10, 10, 0.06);
            --fw-contrast-07: rgba(10, 10, 10, 0.07);
            --fw-contrast-08: rgba(10, 10, 10, 0.08);
            --fw-contrast-09: rgba(10, 10, 10, 0.09);
            --fw-contrast-10: rgba(10, 10, 10, 0.10);
            --fw-contrast-12: rgba(10, 10, 10, 0.12);
            --fw-contrast-14: rgba(10, 10, 10, 0.14);
            --fw-contrast-15: rgba(10, 10, 10, 0.15);
            --fw-contrast-18: rgba(10, 10, 10, 0.18);
          }
        }
        @keyframes fw-badge-pop {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(232, 133, 61, 0.45);
          }
          42% {
            transform: scale(1.75);
            box-shadow: 0 0 0 10px rgba(232, 133, 61, 0);
          }
          68% {
            transform: scale(0.92);
            box-shadow: 0 0 0 0 rgba(232, 133, 61, 0);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(232, 133, 61, 0);
          }
        }
        @keyframes fw-slide-in {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fw-agent-reveal {
          0% { opacity: 0; transform: scale(0.4); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fw-slide-in-new {
          0% { opacity: 0; transform: translateY(-12px); }
          50% { background: #1F3A2F; }
          100% { opacity: 1; transform: translateY(0); }
        }
        [data-fw-crrt] button:focus {
          outline: none;
        }
        [data-fw-crrt] button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #E8853D;
        }
        @keyframes fw-instruction-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(10px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .fw-rec-dot {
          animation: fw-rec-pulse 1.5s ease-in-out infinite;
        }
        @keyframes fw-rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fw-tooltip-in {
          0% { opacity: 0; transform: translateY(4px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fw-pin-drop {
          0% { transform: translateY(-20px); opacity: 0; }
          60% { transform: translateY(4px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes fw-pin-glow-pulse {
          0%, 100% {
            filter:
              drop-shadow(0 0 8px rgba(232, 133, 61, 0.5))
              drop-shadow(0 0 16px rgba(232, 133, 61, 0.25))
              drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18));
          }
          50% {
            filter:
              drop-shadow(0 0 12px rgba(232, 133, 61, 0.65))
              drop-shadow(0 0 26px rgba(232, 133, 61, 0.35))
              drop-shadow(0 2px 4px rgba(0, 0, 0, 0.18));
          }
        }
        @keyframes fw-widget-receive {
          0%, 100% { transform: translateY(0) scale(1); filter: none; }
          38% { transform: translateY(0) scale(1.1); filter: drop-shadow(0 0 14px rgba(232, 133, 61, 0.42)); }
          68% { transform: translateY(0) scale(0.98); filter: none; }
        }
        @keyframes fw-tooltip-liquid {
          0% { opacity: 0; transform: scale(0.08); filter: blur(10px); }
          35% { opacity: 1; }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        .fw-sidebar-card:hover .fw-card-actions {
          display: flex !important;
        }
        .fw-pill-icon:hover {
          background: var(--fw-contrast-15);
        }
        .fw-highlight {
          outline: 2px solid #E8853D !important;
          outline-offset: 2px !important;
          background-color: rgba(232, 133, 61, 0.15) !important;
          animation: fw-highlight-pulse 1.4s ease both !important;
        }
        @keyframes fw-highlight-pulse {
          0% { outline-color: transparent; background-color: transparent; }
          14% { outline-color: #E8853D; background-color: rgba(232, 133, 61, 0.15); }
          71% { outline-color: #E8853D; background-color: rgba(232, 133, 61, 0.15); }
          100% { outline-color: transparent; background-color: transparent; }
        }
        @keyframes fw-modal-overlay-in {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes fw-modal-card-in {
          0% { opacity: 0; transform: scale(0.94) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes crrt-pulse {
          0%, 100% { opacity: 1;   transform: scale(1); }
          50%      { opacity: 0.6; transform: scale(0.85); }
        }
        @keyframes crrt-pin-seed-bounce {
          0%, 100% { transform: scale(1);    box-shadow: 0 0 0 2px rgba(10,10,10,0.9), 0 0 14px rgba(232,133,61,0.55), 0 2px 6px rgba(10,10,10,0.4); }
          50%      { transform: scale(1.1); box-shadow: 0 0 0 2px rgba(10,10,10,0.9), 0 0 22px rgba(232,133,61,0.75), 0 2px 8px rgba(10,10,10,0.4); }
        }
        @keyframes crrt-pin-seed-halo {
          0%   { opacity: 0.7;  transform: translate(-50%, -50%) scale(1); }
          80%  { opacity: 0;    transform: translate(-50%, -50%) scale(3.2); }
          100% { opacity: 0;    transform: translate(-50%, -50%) scale(3.2); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-fw-crrt] * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
          .fw-rec-dot { animation: none !important; }
        }
    `}</style>
  )
}
