import { useEffect, useRef, useState } from 'react';

type RollingNumberProps = {
  readonly value: number;
  readonly active?: boolean;
  readonly winner?: boolean;
  readonly accentColor: string;
  readonly className?: string;
};

/**
 * Minimalist Tabular Odometer Number: quietly suspended at board corners,
 * glides vertically with a crisp spring impulse whenever value changes.
 */
export function RollingNumber({
  value,
  active = false,
  winner = false,
  accentColor,
  className = '',
}: RollingNumberProps) {
  const prevRef = useRef<number>(value);
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [animSerial, setAnimSerial] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (prevRef.current !== value) {
      setDirection(value < prevRef.current ? 1 : -1);
      setPrevValue(prevRef.current);
      prevRef.current = value;
      setAnimSerial((s) => s + 1);
      const timer = window.setTimeout(() => setPrevValue(null), 340);
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  return (
    <div
      className={`relative inline-flex h-6 items-center justify-center overflow-hidden tabular-nums select-none transition-all duration-300 ${className}`}
      style={{
        color: winner || active ? accentColor : 'var(--fg-muted)',
        opacity: winner ? 1 : active ? 0.95 : 0.42,
        transform: winner ? 'scale(1.22)' : active ? 'scale(1.06)' : 'scale(1)',
        textShadow: winner ? `0 0 18px ${accentColor}` : 'none',
      }}
    >
      {prevValue !== null && (
        <span
          key={`out-${animSerial}`}
          className="absolute inset-0 flex items-center justify-center text-xs font-semibold tracking-wider"
          style={{
            animation: `${direction > 0 ? 'roll-out-up' : 'roll-out-down'} 320ms var(--ease-spring) forwards`,
          }}
        >
          {prevValue}
        </span>
      )}
      <span
        key={`in-${animSerial}`}
        className="text-xs font-semibold tracking-wider"
        style={
          prevValue !== null
            ? {
                animation: `${direction > 0 ? 'roll-in-up' : 'roll-in-down'} 320ms var(--ease-spring) both`,
              }
            : undefined
        }
      >
        {value}
      </span>

      <style>{`
        @keyframes roll-out-up {
          0% { transform: translateY(0); opacity: 0.9; }
          100% { transform: translateY(-110%); opacity: 0; }
        }
        @keyframes roll-in-up {
          0% { transform: translateY(110%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes roll-out-down {
          0% { transform: translateY(0); opacity: 0.9; }
          100% { transform: translateY(110%); opacity: 0; }
        }
        @keyframes roll-in-down {
          0% { transform: translateY(-110%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
