import React from 'react';

export type IconProps = {
  size?: number;        // default 13
  strokeWidth?: number; // default 1.5
  filled?: boolean;     // if true, fill="currentColor" strokeWidth=0
  className?: string;
  children?: React.ReactNode;
};

export function Icon({ size = 13, strokeWidth = 1.5, filled = false, className, children }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
