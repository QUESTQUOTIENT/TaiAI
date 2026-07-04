import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, PageLoading } from './LoadingSpinner';

describe('Spinner Component', () => {
  it('renders with default size', () => {
    const { container } = render(<Spinner />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('w-8', 'h-8', 'border-2'); 
  });

  it('renders with small size', () => {
    const { container } = render(<Spinner size="sm" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner).toHaveClass('w-4', 'h-4', 'border');
  });

  it('renders with large size', () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner).toHaveClass('w-12', 'h-12', 'border-2');
  });

  it('applies custom className', () => {
    const { container } = render(<Spinner className="custom-class" />);
    const spinner = container.firstChild as HTMLElement;
    expect(spinner).toHaveClass('custom-class');
  });
});

describe('PageLoading Component', () => {
  it('renders with default label', () => {
    render(<PageLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    render(<PageLoading label="Fetching data…" />);
    expect(screen.getByText('Fetching data…')).toBeInTheDocument();
  });

  it('renders spinner', () => {
    const { container } = render(<PageLoading />);
    const spinners = container.querySelectorAll('[class*="animate-spin"]');
    expect(spinners.length).toBeGreaterThan(0);
  });
});
