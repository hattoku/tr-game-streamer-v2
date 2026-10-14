/** このサイトについて（/site-info）。本文は後日整備のため暫定表示。 */
import type { Metadata } from 'next';
import { UnderConstruction } from '@/components/layout/UnderConstruction';

export const metadata: Metadata = { title: 'このサイトについて' };

export default function SiteInfoPage() {
  return <UnderConstruction title="このサイトについて" />;
}
