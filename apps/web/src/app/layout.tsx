import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: {
    default: 'Heritage Platform',
    template: '%s · Heritage Platform',
  },
  description:
    'Discover UK heritage: places connected to people, stories, objects and journeys.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
