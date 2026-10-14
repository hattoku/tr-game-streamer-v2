/** お問い合わせ（/contact）。ログイン・未ログイン問わずアクセス可（ページ お問い合わせフォーム仕様書 §2）。 */
import type { Metadata } from 'next';
import { ContactForm } from '@/components/contact/ContactForm';

export const metadata: Metadata = { title: 'お問い合わせ' };

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <ContactForm />
    </div>
  );
}
