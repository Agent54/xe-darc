<span class="mcp-activity-glow" aria-hidden="true"></span>

<style>
    .mcp-activity-glow { position: absolute; inset: -5px; pointer-events: none; z-index: -1; }
    .mcp-activity-glow::before, .mcp-activity-glow::after {
        content: ''; position: absolute; inset: 1px; border: 1px solid #79baff70;
        border-radius: 42% 58% 61% 39% / 55% 40% 60% 45%;
        box-shadow: 0 0 5px #438fff60, inset 0 0 4px #438fff30;
        animation: mcp-glow-warp 4.8s ease-in-out infinite;
    }
    .mcp-activity-glow::after { inset: -1px; border-color: #438fff30; filter: blur(2px); animation-direction: reverse; animation-duration: 6.4s; }
    @keyframes mcp-glow-warp {
        0%, 100% { border-radius: 42% 58% 61% 39% / 55% 40% 60% 45%; transform: rotate(-12deg); opacity: .65; }
        50% { border-radius: 61% 39% 43% 57% / 40% 60% 45% 55%; transform: rotate(26deg); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
        .mcp-activity-glow::before, .mcp-activity-glow::after { animation: none; border-radius: 50%; }
    }
</style>
