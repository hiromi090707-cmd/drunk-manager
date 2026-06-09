import { describe, it, expect } from 'vitest';
import {
  genMemberId,
  activeRoster,
  addMemberToRoster,
  removeFromRoster,
  restoreToRoster,
  renameInRoster,
} from './roster';
import type { GroupMember } from '../types';

const roster: GroupMember[] = [
  { id: 'm1', name: 'あ' },
  { id: 'm2', name: 'い', removed: true },
  { id: 'm3', name: 'う' },
];

describe('genMemberId', () => {
  it('フィールドパス安全（先頭が文字・英数字とアンダースコアのみ）', () => {
    expect(genMemberId()).toMatch(/^m_[0-9a-z]+$/);
  });
  it('呼ぶたびに異なる id を返す', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genMemberId()));
    expect(ids.size).toBe(100);
  });
});

describe('activeRoster', () => {
  it('removed のメンバーを除外する', () => {
    expect(activeRoster(roster).map((m) => m.id)).toEqual(['m1', 'm3']);
  });
});

describe('addMemberToRoster', () => {
  it('在籍メンバーとして末尾に追加し、追加分を返す', () => {
    const { members, added } = addMemberToRoster(roster, '  えお  ');
    expect(added.name).toBe('えお'); // trim される
    expect(added.removed).toBeUndefined();
    expect(members).toHaveLength(4);
    expect(members[3].id).toBe(added.id);
  });
});

describe('removeFromRoster', () => {
  it('指定 id に removed=true を立てる（他は不変）', () => {
    const next = removeFromRoster(roster, 'm1');
    expect(next.find((m) => m.id === 'm1')!.removed).toBe(true);
    expect(next.find((m) => m.id === 'm3')!.removed).toBeUndefined();
  });
});

describe('restoreToRoster', () => {
  it('指定 id の removed を false に戻す', () => {
    const next = restoreToRoster(roster, 'm2');
    expect(next.find((m) => m.id === 'm2')!.removed).toBe(false);
    expect(activeRoster(next).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('renameInRoster', () => {
  it('指定 id の name のみ更新（id 据え置き・trim）', () => {
    const next = renameInRoster(roster, 'm1', '  かき  ');
    const m = next.find((x) => x.id === 'm1')!;
    expect(m.id).toBe('m1');
    expect(m.name).toBe('かき');
  });
});
