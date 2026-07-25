import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'sky' | 'green' | 'gold' | 'ghost';
  block?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  block,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${block ? 'btn-block' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
