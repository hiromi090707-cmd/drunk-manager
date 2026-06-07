// 初回オンボーディングの既読状態を localStorage で管理する。
// storage を引数で注入可能にして node 環境のテストでもモックできるようにする。
const ONBOARDING_KEY = 'drunk_onboarding_seen';

export function hasSeenOnboarding(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return storage.getItem(ONBOARDING_KEY) === '1';
}

export function markOnboardingSeen(storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(ONBOARDING_KEY, '1');
}
