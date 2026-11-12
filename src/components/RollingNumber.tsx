import { useEffect, useRef, useState } from 'react';

type RollingNumberProps = {
  readonly value: number;
  readonly active?: boolean;
  readonly winner?: boolean;
  readonly align: 'left' | 'right';
  readonly accentColor: string;
};

/**
 * Strictly aligned Tabular Odometer Counter: fixed height, explicit inner-edge alignment
 * so 1-digit and 2-digit numbers maintain identical clearance from the board bezel.
 */
export function RollingNumber({
  value,
  active = false,
  winner = false,
  align,
  accentColor,
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
      const timer = window.setTimeout(() => setPrevValue(null), 320);
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left';

  return (
    <div
      className={`relative flex h-5 w-9 items-center overflow-hidden tabular-nums select-none transition-all duration-300 ${alignClass}`}
      style={{
        color: winner || active ? accentColor : 'var(--fg-muted)',
        opacity: winner ? 1 : active ? 0.96 : 0.42,
        transform: winner ? 'scale3d(1.16, 1.16, 1)' : 'scale3d(1, 1, 1)',
        transformOrigin: align === 'right' ? 'right center' : 'left center',
        textShadow: winner ? `0 0 14px ${accentColor}` : 'none',
      }}
    >
      {prevValue !== null && (
        <span
          key={`out-${animSerial}`}
          className={`absolute inset-0 flex items-center text-[12px] font-semibold tracking-wider ${alignClass}`}
          style={{
            animation: `${direction > 0 ? 'rn-out-up' : 'rn-out-down'} 300ms var(--ease-spring) forwards`,
          }}
        >
          {prevValue}
        </span>
      )}
      <span
        key={`in-${animSerial}`}
        className="text-[12px] font-semibold tracking-wider leading-none"
        style={
          prevValue !== null
            ? {
                animation: `${direction > 0 ? 'rn-in-up' : 'rn-in-down'} 300ms var(--ease-spring) both`,
              }
            : undefined
        }
      >
        {value}
      </span>

      <style>{`
        @keyframes rn-out-up {
          0% { transform: translate3d(0, 0, 0); opacity: 0.9; }
          100% { transform: translate3d(0, -105%, 0); opacity: 0; }
        }
        @keyframes rn-in-up {
          0% { transform: translate3d(0, 105%, 0); opacity: 0; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
        @keyframes rn-out-down {
          0% { transform: translate3d(0, 0, 0); opacity: 0.9; }
          100% { transform: translate3d(0, 105%, 0); opacity: 0; }
        }
        @keyframes rn-in-down {
          0% { transform: translate3d(0, -105%, 0); opacity: 0; }
          100% { transform: translate3d(0, 0, 0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
