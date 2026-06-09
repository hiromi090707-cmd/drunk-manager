import { useApp } from '../context/AppContext';
import { updateGroupMembers, updateMemberDrinks } from '../lib/db';
import {
  addMemberToRoster,
  removeFromRoster,
  restoreToRoster,
  renameInRoster,
} from '../lib/roster';
import { findActiveParty, zeroMember } from '../lib/party';
import type { GroupMember } from '../types';

// 名簿操作の副作用（Firestore書込＋context更新＋進行中パーティへのカスケード）を集約するフック。
export function useRoster() {
  const { state, dispatch } = useApp();
  const group = state.groupInfo;

  async function commit(members: GroupMember[]) {
    if (!group) return;
    await updateGroupMembers(members);
    dispatch({ type: 'SET_GROUP', group: { ...group, members } });
  }

  // 名簿に追加し、進行中パーティがあれば0杯でその席も増やす。追加した GroupMember を返す。
  async function addMember(name: string, activePartyId?: string | null): Promise<GroupMember | undefined> {
    if (!group || !name.trim()) return undefined;
    const { members, added } = addMemberToRoster(group.members, name);
    await commit(members);
    const partyId = activePartyId ?? findActiveParty(state.historyData)?._docId ?? null;
    if (partyId) await updateMemberDrinks(partyId, zeroMember(added));
    return added;
  }

  async function removeMember(id: string) {
    if (!group) return;
    await commit(removeFromRoster(group.members, id));
  }

  // 復活。進行中パーティに未参加なら0杯で席を追加（add と同様のカスケード）。
  async function restoreMember(id: string) {
    if (!group) return;
    const target = group.members.find((m) => m.id === id);
    await commit(restoreToRoster(group.members, id));
    const active = findActiveParty(state.historyData);
    if (active && target && !active.members.some((m) => m.id === id)) {
      await updateMemberDrinks(active._docId, zeroMember(target));
    }
  }

  async function renameMember(id: string, name: string) {
    if (!group || !name.trim()) return;
    await commit(renameInRoster(group.members, id, name));
  }

  return { addMember, removeMember, restoreMember, renameMember };
}
