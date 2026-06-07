import { describe, it, expect, vi } from 'vitest';
import { hasSeenOnboarding, markOnboardingSeen } from './onboarding';

describe('onboarding 既読フラグ', () => {
  it('フラグ未設定なら未読（false）', () => {
    const storage = { getItem: () => null } as unknown as Storage;
    expect(hasSeenOnboarding(storage)).toBe(false);
  });

  it('フラグが立っていれば既読（true）', () => {
    const storage = { getItem: () => '1' } as unknown as Storage;
    expect(hasSeenOnboarding(storage)).toBe(true);
  });

  it('markOnboardingSeen で既読キーを保存する', () => {
    const setItem = vi.fn();
    const storage = { setItem } as unknown as Storage;
    markOnboardingSeen(storage);
    expect(setItem).toHaveBeenCalledWith('drunk_onboarding_seen', '1');
  });
});
