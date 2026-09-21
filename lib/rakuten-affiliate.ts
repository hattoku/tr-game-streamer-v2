// 楽天アフィリエイトIDをFirestoreの`rakutenUrl`（lib/rakuten.tsが保存する生の商品URL）に
// 表示時点で付与するためのクライアント/サーバー共用ヘルパー。
//
// あえて`lib/rakuten.ts`側（商品検索時）でタグ付けせず、表示のたびにこちらで付与する方式に
// している。理由: 検索時に確定させてFirestoreへ保存してしまうと、後でアフィリエイトIDを
// 変更したときに過去登録済みのゲームのリンクだけ古いIDのまま取り残されてしまうため
// （新規登録分にしか新IDが反映されない）。この方式ならID変更が全ゲームに即座に反映される。
//
// アフィリエイトID自体は秘密情報ではなく、生成後のURLにそのまま露出する値のため
// NEXT_PUBLIC_プレフィックスでブラウザに公開してよい（lib/constants.tsのYOUTUBE_API_KEY等の
// サーバー専用値とは性質が異なる）。
export const RAKUTEN_AFFILIATE_ID = process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID || '';

// 楽天が提供する汎用のアフィリエイトリンク変換（https://hb.afl.rakuten.co.jp/hgc/...）を使い、
// 任意の楽天商品URLをアフィリエイトタグ付きURLに変換する。IDが未設定の場合は元のURLをそのまま返す
// （開発環境等でアフィリエイトIDを持たない場合でもリンク自体は機能する）。
export function toRakutenAffiliateUrl(itemUrl: string): string {
  if (!RAKUTEN_AFFILIATE_ID || !itemUrl) return itemUrl;
  const encoded = encodeURIComponent(itemUrl);
  return `https://hb.afl.rakuten.co.jp/hgc/${RAKUTEN_AFFILIATE_ID}/?pc=${encoded}&m=${encoded}`;
}
