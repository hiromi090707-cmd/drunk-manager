import type { GroupMember } from '../types';

// ASCII 安全（先頭が文字・英数字とアンダースコアのみ）で一意な id を生成する。
// id は Firestore のフィールドパス（members.<id>）に使うため、日本語名からは作らない。
export function genMemberId(): string {
  return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// 在籍中（removed でない）メンバーだけを返す。
export function activeRoster(members: readonly GroupMember[]): GroupMember[] {
  return members.filter((m) => !m.removed);
}

// 新メンバーを在籍として末尾に追加し、追加した GroupMember も返す。
export function addMemberToRoster(
  members: GroupMember[],
  name: string,
): { members: GroupMember[]; added: GroupMember } {
  const added: GroupMember = { id: genMemberId(), name: name.trim() };
  return { members: [...members, added], added };
}

// ソフト削除（removed=true）。他メンバーは不変。
export function removeFromRoster(members: GroupMember[], id: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, removed: true } : m));
}

// 復活（removed=false）。
export function restoreToRoster(members: GroupMember[], id: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, removed: false } : m));
}

// 改名（id 据え置き・name のみ）。
export function renameInRoster(members: GroupMember[], id: string, name: string): GroupMember[] {
  return members.map((m) => (m.id === id ? { ...m, name: name.trim() } : m));
}
