/** お問い合わせ（/contact）。ログイン・未ログイン問わずアクセス可（ページ お問い合わせフォーム仕様書 §2）。 */
import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact/ContactForm';
import { isInquiryCategory } from '@/lib/inquiry-shared';

export const metadata: Metadata = { title: 'お問い合わせ' };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  // `?type=channel_listing`（実況者・事務所の方へ から）で種別を選んだ状態にする（お問い合わせフォーム仕様書 §4 v1.5）
  const { type } = await searchParams;
  const initialCategory = isInquiryCategory(type) ? type : undefined;
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <ContactForm initialCategory={initialCategory} />
    </div>
  );
}
