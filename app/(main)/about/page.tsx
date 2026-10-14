/** 初めての方へ（/about）。本文は後日整備のため暫定表示。 */
import type { Metadata } from 'next';
import { UnderConstruction } from '@/components/layout/UnderConstruction';

export const metadata: Metadata = { title: '初めての方へ' };

export default function AboutPage() {
  return <UnderConstruction title="初めての方へ" />;
}
