import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Prices from '.';
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { email: 'a' } } }) }));
vi.mock('@/components/ApiLimitBadge', () => ({ default: () => null }));
afterEach(cleanup);
it.each([undefined, 'invalid'])('keeps missing/invalid saved dates unknown independently of quote time (%s)', recordedAt => {
  render(<Prices user={{ _id: 'a', email: 'a', assets: [{ id: 0, name: 'Apple', abb: 'AAPL', type: 'stocks', quantity: 1, baseValue: 1, value: 1, isDeleted: false }] }} prices={[{ symbol: 'AAPL', value: 1, recordedAt, timestamp: '2026-10-01T12:00:00Z' }]} onRevalidate={async () => []} />);
  expect(screen.getByText(/Saved: unknown/i)).toBeInTheDocument();
  expect(screen.getByText(/Quote: 01.10.2026/)).toBeInTheDocument();
  expect(screen.getByText('Save time unknown')).toBeInTheDocument();
});
it('does not invent a 1970 quote or save date', () => {
  render(<Prices user={{ _id: 'a', email: 'a', assets: [{ id: 0, name: 'Apple', abb: 'AAPL', type: 'stocks', quantity: 1, baseValue: 1, value: 1, isDeleted: false }] }} prices={[{ symbol: 'AAPL', value: 1 }]} onRevalidate={async () => []} />);
  expect(screen.getByText(/Saved: unknown/i)).toBeInTheDocument();
  expect(screen.getByText(/Quote: unknown/i)).toBeInTheDocument();
});
