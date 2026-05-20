export function FeedbackWidgetStyles() {
  return (
    <style>{`
        @keyframes fw-badge-pop {
          0% { transform: scale(1); }
          30% { transform: scale(1.3); }
          100% { transform: scale(1); }
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
          0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
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
        @keyframes fw-tooltip-liquid {
          0% { opacity: 0; transform: scale(0.08); filter: blur(10px); }
          35% { opacity: 1; }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        .fw-sidebar-card:hover .fw-card-actions {
          display: flex !important;
        }
        .fw-pill-icon:hover {
          background: rgba(255, 255, 255, 0.15);
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
        @keyframes fw-toast-in {
          0% { opacity: 0; transform: translateX(-50%) translateY(8px); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fw-toast-out {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(6px); }
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
