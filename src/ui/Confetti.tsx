import { useMemo } from 'react';
import './Confetti.css';

const COLORS = ['#e52521', '#f5c518', '#049cd8', '#43b047', '#ff8fb1', '#ffffff'];

export function Confetti({ count = 46 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        size: 7 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        drift: (Math.random() - 0.5) * 120,
        spin: 360 + Math.random() * 720,
        round: i % 3 === 0,
      })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className="confetti-bit"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.round ? b.size : b.size * 0.5,
            background: b.color,
            borderRadius: b.round ? '50%' : 2,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.duration}s`,
            ['--drift' as string]: `${b.drift}px`,
            ['--spin' as string]: `${b.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
