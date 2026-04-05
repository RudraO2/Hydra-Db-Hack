'use client';

type Props = {
  gameMinute: number;
  cluesFound: number;
  contactsMade: number;
};

function formatTime(gameMinute: number) {
  const hour24 = Math.floor(gameMinute / 60);
  const minute = gameMinute % 60;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export default function HUD({ gameMinute, cluesFound, contactsMade }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        top: 16,
        zIndex: 20,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--panel)',
        border: '1px solid rgba(255,255,255,0.12)',
        minWidth: 210
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Momentum Corp</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Time: {formatTime(gameMinute)}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>NPCs Interviewed: {contactsMade}/6</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Clues Found: {cluesFound}/5</div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#f8d893' }}>Press E near an NPC to interrogate</div>
    </div>
  );
}
