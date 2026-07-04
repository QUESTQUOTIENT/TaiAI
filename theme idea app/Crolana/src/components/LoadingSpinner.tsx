
import React from 'react';
import { cn } from '../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClasses = { sm: 'w-4 h-4 border', md: 'w-8 h-8 border-2', lg: 'w-12 h-12 border-2' };
  return (
    <div
      className={cn(
        'rounded-full animate-spin border-blue-500/30 border-t-blue-500',
        sizeClasses[size],
        className,
      )}
    />
  );
}

interface PageLoadingProps {
  label?: string;
}

export function PageLoading({ label = 'Loading…' }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-4">
      <Spinner size="lg" />
      <p className="text-slate-500 text-sm">{label}</p>
    </div>
  );
}
