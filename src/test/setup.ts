// vitest のテスト前に実行される共通セットアップ。
// Firebase Emulator にテストコードからも接続するため、modular SDK が参照する
// 環境変数と、firebase.ts のガード用フラグの双方を準備する。

import { beforeAll } from 'vitest';

// Emulator に向ける（firebase.ts が読み取る）
process.env.VITE_USE_EMULATOR = 'true';

// @firebase/rules-unit-testing と modular SDK が自動検出するための環境変数
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'drunk-manage';

beforeAll(async () => {
  // SKIP_EMULATOR_CHECK=1 の場合はエミュレーター接続チェックをスキップする（純関数テスト用）
  if (process.env.SKIP_EMULATOR_CHECK === '1') return;

  // Emulator が起動していなければ即座に失敗させる（CI でわかりやすくするため）
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080').split(':');
  try {
    const res = await fetch(`http://${host}:${port}/`);
    if (!res.ok && res.status !== 200 && res.status !== 404) {
      throw new Error(`Firestore Emulator が応答しません (status=${res.status})`);
    }
  } catch (err) {
    throw new Error(
      `Firestore Emulator (${host}:${port}) に接続できません。` +
        '`npm run emulators` を別ターミナルで起動するか、`npm run test:emulators` を使ってください。' +
        `\n原因: ${(err as Error).message}`,
    );
  }
});
