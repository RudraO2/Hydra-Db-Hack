import Link from 'next/link';

const CHARACTERS = [
  { name: 'Kabir Malhotra', role: 'CEO', color: '#f2a65a', alias: 'K' },
  { name: 'Priya Sharma', role: 'HR Manager', color: '#f07178', alias: 'P' },
  { name: 'Dev Malhotra', role: 'IT Guy', color: '#5ea1ff', alias: 'D' },
  { name: 'Meera Joshi', role: 'Sr. Accountant', color: '#c1a6ff', alias: 'M' },
  { name: 'Sanjana Kapoor', role: "CEO's Assistant", color: '#7ed6a7', alias: 'S' },
  { name: 'Rohan Mehta', role: 'Intern', color: '#ffd166', alias: 'R' },
];

const CONTROLS = [
  ['WASD', 'Move'],
  ['E', 'Talk to someone'],
  ['J', 'Case file / accuse'],
  ['M', 'Memory web'],
  ['ESC', 'Close'],
  ['D', 'Debug panel'],
];

const TIMELINE_PREVIEW = [
  '8:50am — A suspicious phone call is made',
  '9:05am — The CEO steps out for 3 minutes',
  '9:07am — Something small and silver disappears',
  '9:08am — The cameras go dark',
];

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 20% 15%, #1a2a45, #0a0b10 55%)',
        color: '#e9edf6',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 20px 60px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      {/* Hackathon badge */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#f3b640',
          background: 'rgba(243,182,64,0.1)',
          border: '1px solid rgba(243,182,64,0.25)',
          borderRadius: 999,
          padding: '4px 14px',
          marginBottom: 32,
        }}
      >
        HydraDB Hackathon 2026
      </div>

      {/* USB icon */}
      <div style={{ fontSize: 52, marginBottom: 16, filter: 'drop-shadow(0 0 18px #f3b64066)' }}>
        💾
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: 'clamp(36px, 7vw, 72px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          margin: 0,
          lineHeight: 1,
          textShadow: '0 0 40px rgba(243,182,64,0.15)',
        }}
      >
        OFFICE DRAMA
      </h1>
      <div
        style={{
          fontSize: 'clamp(11px, 1.8vw, 16px)',
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
          color: '#f3b640',
          marginTop: 10,
          marginBottom: 16,
        }}
      >
        The Stolen Drive
      </div>

      {/* Premise */}
      <p
        style={{
          maxWidth: 540,
          textAlign: 'center',
          color: 'rgba(233,237,246,0.6)',
          fontSize: 15,
          lineHeight: 1.75,
          margin: '0 0 44px',
        }}
      >
        A USB drive containing the company's financial secrets vanished from the CEO's desk
        during a 3-minute window. Six suspects. A web of gossip.
        Each NPC has a memory — powered by{' '}
        <span style={{ color: '#9cb0d4', fontWeight: 600 }}>HydraDB</span>.
        Find the thief before 5 PM.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          width: '100%',
          maxWidth: 680,
          marginBottom: 36,
        }}
      >
        {/* Characters card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14,
            padding: '18px 20px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              marginBottom: 14,
            }}
          >
            Suspects
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {CHARACTERS.map((c) => (
              <div
                key={c.alias}
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: c.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 12,
                    color: '#0a0b10',
                    flexShrink: 0,
                    boxShadow: `0 0 10px ${c.color}55`,
                  }}
                >
                  {c.alias}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>
                    {c.name.split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{c.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline teaser */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 14,
            padding: '18px 20px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.35)',
              marginBottom: 14,
            }}
          >
            What happened this morning
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TIMELINE_PREVIEW.map((event) => (
              <div key={event} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#f3b640',
                    flexShrink: 0,
                    marginTop: 5,
                    boxShadow: '0 0 6px #f3b64088',
                  }}
                />
                <span style={{ fontSize: 12, color: 'rgba(233,237,246,0.65)', lineHeight: 1.5 }}>
                  {event}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: 14,
          padding: '18px 24px',
          width: '100%',
          maxWidth: 680,
          marginBottom: 40,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: 14,
          }}
        >
          Controls
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px 16px',
          }}
        >
          {CONTROLS.map(([key, action]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <kbd
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderBottom: '2px solid rgba(255,255,255,0.2)',
                  borderRadius: 5,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  color: '#f3b640',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {key}
              </kbd>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Link
        href="/game"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#f3b640',
          color: '#0a0b10',
          fontWeight: 800,
          fontSize: 15,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: '15px 44px',
          borderRadius: 999,
          textDecoration: 'none',
          boxShadow: '0 0 32px rgba(243,182,64,0.3)',
        }}
      >
        Begin Investigation
        <span style={{ fontSize: 18 }}>→</span>
      </Link>

      {/* Footer */}
      <div
        style={{
          marginTop: 52,
          fontSize: 11,
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.06em',
          textAlign: 'center',
          lineHeight: 1.8,
        }}
      >
        Built with HydraDB · Phaser 3 · Next.js · Claude AI
        <br />
        NPC memory persists across conversations — no two playthroughs are identical.
      </div>
    </main>
  );
}
