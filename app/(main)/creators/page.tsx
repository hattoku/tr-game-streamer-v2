/**
 * 実況者・事務所の方へ（/creators）。ページ 実況者・事務所の方へ 仕様書（リブランディング段階6）。
 * プレミテが何をしているか、掲載を外す方法（お問い合わせ）、掲載の申請方法を丁寧に伝える。
 * 「認定」という言葉は使わない。「YouTube・チャンネルと提携していません」の明記はしない（検討項目9）。
 * チャンネル詳細ページからはリンクしない。
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';

export const metadata: Metadata = { title: '実況者・事務所の方へ' };

export default function CreatorsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <SectionHeading>実況者・事務所の方へ</SectionHeading>

      <Section title="プレミテについて">
        <p>
          プレミテは、ゲーム実況のシリーズ（再生リスト）を、最初から順に・続きから見られるようにし、視聴者が記録とレビューを残せるサービスです。
        </p>
      </Section>

      <Section title="掲載のしかた">
        <p>
          YouTube で公開されているチャンネル・再生リスト・動画の情報を、YouTube の公式の仕組み（YouTube Data API と埋め込みプレーヤー）で表示しています。動画は
          YouTube のプレーヤーで再生されるため、再生は YouTube 上のチャンネルの視聴として数えられます。
        </p>
        <p>
          掲載するチャンネルは運営が選んでいます。実況者ご本人・公式のチャンネルだけを掲載し、切り抜き・転載のチャンネルは掲載しません。
        </p>
      </Section>

      <Section title="掲載を外してほしいとき" id="opt-out">
        <p>掲載を望まれない場合は、お問い合わせからお知らせください。確認でき次第、チャンネル単位ですぐに掲載を止めます。</p>
        <p>お問い合わせには、チャンネル名またはチャンネルのURLを書き添えてください。</p>
        <LinkButton href="/contact?type=channel_listing" variant="primary" className="w-fit">
          掲載についてお問い合わせ
        </LinkButton>
      </Section>

      <Section title="掲載を申請したいとき" id="apply">
        <p>まだ掲載していないご自身（または所属タレント）のチャンネルの掲載を申請できます。</p>
        <LinkButton href="/channels/apply" variant="primary" className="w-fit">
          掲載を申請する
        </LinkButton>
        <p className="text-md text-text-muted">申請にはログインが必要です。アカウントを作らずに申請したい場合は、お問い合わせからでも受け付けます。</p>
      </Section>

      <Section title="よくある質問">
        <dl className="flex flex-col gap-4">
          <Faq q="掲載に費用はかかりますか">かかりません。</Faq>
          <Faq q="レビューを消してもらえますか">不適切なレビューは、通報またはお問い合わせから内容を確認します。</Faq>
          <Faq q="掲載されている情報が古いです">毎日 YouTube から取り直しています。反映まで1日ほどかかります。</Faq>
        </dl>
      </Section>
    </div>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3" id={id}>
      <h2 className="text-lg font-medium text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-text-secondary">{children}</div>
    </Card>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-base font-medium text-text-primary">{q}</dt>
      <dd className="text-base text-text-secondary">{children}</dd>
    </div>
  );
}
