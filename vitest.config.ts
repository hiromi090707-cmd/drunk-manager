import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Firestore Emulator への接続・リスナー反映に少し時間がかかるため余裕を持たせる
    testTimeout: 15000,
    hookTimeout: 15000,
    // db.ts はモジュールスコープに activeGroupId / historyUnsubscribe を持つため、
    // ファイル間で状態が混ざらないよう並列実行を抑える
    fileParallelism: false,
  },
  define: {
    // Vite と同じく import.meta.env を解釈させる
    'import.meta.env.VITE_USE_EMULATOR': JSON.stringify('true'),
    'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify('test-api-key'),
    'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify('localhost'),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify('drunk-manage'),
    'import.meta.env.VITE_FIREBASE_STORAGE_BUCKET': JSON.stringify(''),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(''),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify('test-app-id'),
  },
});
