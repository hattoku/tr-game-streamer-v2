/**
 * お問い合わせの画像の添付欄（ページ お問い合わせフォーム仕様書 §9.3・§9.4）。フォームとスレッドの返信欄（お問い合わせ履歴）で共用する。
 * ログイン済みユーザーにだけ出すこと（§9.1）。選んだ時点で形式・サイズ・枚数を確かめ、駄目なら追加せずにエラーを出す
 * （ブラウザの確認は補助で、サーバーが先頭バイトで判定し直す）。
 */
'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';
import {
  INQUIRY_ATTACHMENTS_MAX,
  INQUIRY_ATTACHMENT_ERRORS,
  INQUIRY_ATTACHMENT_MIME_TYPES,
  checkAttachmentFiles,
} from '@/lib/inquiry-shared';
import { Button } from '@/components/ui/Button';
import { PlusIcon, XIcon } from '@/components/ui/icons';

export interface PickedImage {
  /** 途中の画像を外したときにプレビューがずれないよう、行ごとに安定した key を持たせる */
  key: number;
  file: File;
  /** プレビュー用の Blob URL。選んだときに作り、一覧から外れたら AttachmentPicker が破棄する */
  previewUrl: string;
}

let nextKey = 0;

function Preview({ image, index, onRemove, disabled }: { image: PickedImage; index: number; onRemove: () => void; disabled?: boolean }) {
  return (
    <li className="relative size-[72px] shrink-0 overflow-hidden rounded-[6px] border border-surface-border bg-bg-hover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.previewUrl} alt={`選択した画像 ${index + 1}`} className="size-full object-cover" />
      {/* 見た目は小さな丸、押せる範囲は右上の 32px 四方（390px 幅で押しやすく） */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`選択した画像 ${index + 1}を外す`}
        className="absolute right-0 top-0 flex size-8 items-start justify-end p-1 disabled:opacity-40"
      >
        <span className="rounded-full bg-overlay p-[3px] text-text-primary">
          <XIcon size={12} />
        </span>
      </button>
    </li>
  );
}

export function AttachmentPicker({
  images,
  onChange,
  error,
  onError,
  disabled,
}: {
  images: PickedImage[];
  onChange: (images: PickedImage[]) => void;
  error?: string;
  onError: (message: string | undefined) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 一覧から外れた（外した・送信後に空にした）画像の Blob URL を破棄する。アンマウント時は残りもすべて破棄する
  const liveUrls = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(images.map((i) => i.previewUrl));
    liveUrls.current.forEach((url) => {
      if (!current.has(url)) URL.revokeObjectURL(url);
    });
    liveUrls.current = current;
  }, [images]);
  useEffect(() => () => liveUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // 同じファイルを外してから選び直せるよう、毎回空に戻す
    event.target.value = '';
    if (picked.length === 0) return;
    const code = checkAttachmentFiles([...images.map((i) => i.file), ...picked]);
    if (code) {
      onError(INQUIRY_ATTACHMENT_ERRORS[code]);
      return;
    }
    onError(undefined);
    onChange([...images, ...picked.map((file) => ({ key: nextKey++, file, previewUrl: URL.createObjectURL(file) }))]);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-[6px]">
      <legend className="mb-[6px] text-md text-text-tertiary">画像（任意・{INQUIRY_ATTACHMENTS_MAX}枚まで）</legend>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((image, i) => (
            <Preview
              key={image.key}
              image={image}
              index={i}
              disabled={disabled}
              onRemove={() => {
                onError(undefined);
                onChange(images.filter((x) => x.key !== image.key));
              }}
            />
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(INQUIRY_ATTACHMENT_MIME_TYPES).join(',')}
        multiple
        hidden
        onChange={handleSelect}
        aria-label="添付する画像を選択"
      />
      {images.length < INQUIRY_ATTACHMENTS_MAX && (
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <PlusIcon size={14} />
            画像を追加する
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-md text-input-error">
          {error}
        </p>
      )}
      {/* 個人情報の注意はエラーの有無にかかわらず常に出す（§9.3） */}
      <p className="text-md text-text-muted">
        PNG・JPEG・WebP、1枚5MBまで・{INQUIRY_ATTACHMENTS_MAX}枚まで。スクリーンショットにメールアドレスなどの個人情報が写っていないかご確認ください
      </p>
    </fieldset>
  );
}
