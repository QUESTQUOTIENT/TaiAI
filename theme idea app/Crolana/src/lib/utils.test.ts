import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (className merger)', () => {
  it('should merge basic class names', () => {
    const result = cn('bg-red-500', 'text-white');
    expect(result).toBe('bg-red-500 text-white');
  });

  it('should handle conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn(
      'px-4',
      'py-2',
      isActive && 'bg-blue-600',
      isDisabled && 'opacity-50'
    );
    expect(result).toBe('px-4 py-2 bg-blue-600');
  });

  it('should deduplicate classes', () => {
    const result = cn('p-4 p-4', 'p-4');
    expect(result).toBe('p-4');
  });

  it('should handle Tailwind conflicting classes (uses twMerge)', () => {
    const result = cn('bg-red-500', 'bg-blue-600');
    
    expect(result).toBe('bg-blue-600');
  });

  it('should handle empty/undefined values', () => {
    const result = cn('text-lg', undefined, null, false, 'font-bold');
    expect(result).toBe('text-lg font-bold');
  });
});
