// 指定メールアドレスのユーザーにFirebase Auth Custom Claims `role` を設定し、
// `users/{uid}.role`（ダッシュボード表示用ミラー、firestore.rules冒頭コメント参照）も
// 合わせて更新するスクリプト。
//
// 現状ownerに昇格させる手段がコードに一切無い（`api/auth/init-user`は`user`固定、
// `api/test/sign-in`はテスト用会員専用）ため、本番で自分の常用アカウントに
// owner権限を付与するために新規作成した（HANDOFF.md フェーズ4.5ステップ1）。
//
// 使い方:
//   node scripts/set-role.mjs --target=prod --email=you@example.com --role=owner
//   node scripts/set-role.mjs --target=stg --email=you@example.com --role=owner
//
// 事前準備: seed-master-data.mjs等と同じくApplication Default Credentialsでログイン済みで、
// 対象Firebaseプロジェクトに対してAuthentication・Firestoreへの書き込み権限を持つこと。
//
// 注意: Custom Claimsの変更は対象ユーザーの次回IDトークン再発行（再ログイン、または
// クライアントSDKの`getIdToken(true)`強制リフレッシュ）まで反映されない。
import { initFirestore, initAuth } from './lib/firebase-admin.mjs';

const VALID_ROLES = ['user', 'operator', 'owner', 'ai_operator'];

function parseArgs() {
  const target = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1];
  const email = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1];
  const role = process.argv.find((a) => a.startsWith('--role='))?.split('=')[1];

  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  if (!email) {
    throw new Error('--email=<メールアドレス> を指定してください。');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`--role は ${VALID_ROLES.join('/')} のいずれかを指定してください。`);
  }
  return { target, email, role };
}

async function main() {
  const { target, email, role } = parseArgs();
  const { auth, projectId } = initAuth(target);
  const { db } = initFirestore(target);
  console.log(`対象プロジェクト: ${projectId}`);

  const userRecord = await auth.getUserByEmail(email);
  const previousRole = userRecord.customClaims?.role ?? '(未設定)';

  await auth.setCustomUserClaims(userRecord.uid, { ...userRecord.customClaims, role });
  await db.collection('users').doc(userRecord.uid).set({ role }, { merge: true });

  console.log(`${email} (uid: ${userRecord.uid}) の role を ${previousRole} → ${role} に更新しました。`);
  console.log('反映には対象ユーザーの再ログイン（またはIDトークンの強制リフレッシュ）が必要です。');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
