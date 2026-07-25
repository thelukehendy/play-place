import type { CSSProperties, ReactNode } from 'react';

export function Panel({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`panel ${className}`} style={style}>
      {children}
    </div>
  );
}
