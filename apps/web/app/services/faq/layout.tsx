import type { ReactNode } from 'react';
import { pageMetadata } from '../../../lib/site-metadata';

export const metadata = pageMetadata.faq;

export default function FaqLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
