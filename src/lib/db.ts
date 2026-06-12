import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group, GroupMember, Party, Member } from '../types';
import { membersToMap, membersToArray } from './party';

let activeGroupId: string | null = null;
let historyUnsubscribe: Unsubscribe | null = null;

export function setActiveGroup(groupId: string | null) {
  activeGroupId = groupId;
}

export function getActiveGroup() {
  return activeGroupId;
}

function partiesCollection() {
  if (!activeGroupId) throw new Error('No active group');
  return collection(db, 'groups', activeGroupId, 'parties');
}

export async function createGroup(
  groupName: string,
  members: GroupMember[],
  creatorUid: string,
  creatorEmail: string,
  customInviteCode?: string,
): Promise<Group> {
  const inviteCode = customInviteCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const existing = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', inviteCode)));
  if (!existing.empty) throw new Error('この招待コードはすでに使われています。別のコードを指定してください。');
  const groupRef = doc(collection(db, 'groups'));
  const groupData = {
    name: groupName,
    memberUids: [creatorUid],
    memberEmails: [creatorEmail],
    members,
    inviteCode,
    createdAt: serverTimestamp(),
    createdBy: creatorUid,
  };
  await setDoc(groupRef, groupData);
  activeGroupId = groupRef.id;
  return { id: groupRef.id, ...groupData } as Group;
}

export async function joinGroupByCode(inviteCode: string, uid: string, email: string): Promise<Group> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('招待コードが見つかりません');

  const docSnap = snapshot.docs[0];
  const targetGroup = { id: docSnap.id, ...docSnap.data() } as Group;

  if (!targetGroup.memberUids.includes(uid)) {
    await updateDoc(doc(db, 'groups', targetGroup.id), {
      memberUids: [...targetGroup.memberUids, uid],
      memberEmails: [...(targetGroup.memberEmails || []), email],
    });
  }

  activeGroupId = targetGroup.id;
  return targetGroup;
}

export async function updateInviteCode(newCode: string): Promise<string> {
  if (!activeGroupId) throw new Error('No active group');
  const groupId = activeGroupId;
  const code = newCode.trim().toUpperCase();
  if (code.length < 2 || code.length > 16) {
    throw new Error('招待コードは2〜16文字で入力してください。');
  }
  const existing = await getDocs(query(collection(db, 'groups'), where('inviteCode', '==', code)));
  const takenByOther = existing.docs.some((d) => d.id !== groupId);
  if (takenByOther) throw new Error('この招待コードはすでに使われています。別のコードを指定してください。');
  await updateDoc(doc(db, 'groups', groupId), { inviteCode: code });
  return code;
}

export async function findUserGroup(uid: string): Promise<Group | null> {
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const userGroup = { id: docSnap.id, ...docSnap.data() } as Group;
  activeGroupId = userGroup.id;
  return userGroup;
}

export async function leaveGroup(uid: string, email: string): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), {
    memberUids: arrayRemove(uid),
    memberEmails: arrayRemove(email),
  });
  activeGroupId = null;
}

// グループの名簿（members 配列）を丸ごと更新する。removed を含むフル配列を渡すこと。
// parties の members マップとは別物（こちらは配列）。
export async function updateGroupMembers(members: GroupMember[]): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), { members });
}

export async function createParty(initialData: Partial<Party>): Promise<string> {
  const { members, ...rest } = initialData;
  const docRef = await addDoc(partiesCollection(), {
    ...rest,
    ...(members ? { members: membersToMap(members) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteParty(partyId: string): Promise<void> {
  await deleteDoc(doc(partiesCollection(), String(partyId)));
}

export async function saveParty(partyData: Party): Promise<void> {
  const partyRef = doc(partiesCollection(), String(partyData.id ?? partyData._docId));
  const { _docId, members, ...rest } = partyData;
  void _docId;
  await setDoc(partyRef, { ...rest, members: membersToMap(members), updatedAt: serverTimestamp() }, { merge: true });
}

export function listenToParties(callback: (parties: Party[]) => void): Unsubscribe {
  if (historyUnsubscribe) historyUnsubscribe();
  const q = query(partiesCollection(), orderBy('startTime', 'desc'));
  historyUnsubscribe = onSnapshot(q, (snapshot) => {
    const parties: Party[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      parties.push({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    });
    callback(parties);
  }, console.error);
  return historyUnsubscribe;
}

export function listenToParty(partyId: string, callback: (party: Party) => void): Unsubscribe {
  const partyRef = doc(partiesCollection(), String(partyId));
  return onSnapshot(partyRef, (d) => {
    if (d.exists()) {
      const data = d.data();
      callback({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    }
  }, console.error);
}

// 1メンバーのフィールドのみを部分更新する。members.<id> サブツリーだけを書くため、
// 他メンバーの members.<otherId> は Firestore 側で自動マージされ、同時更新が消し合わない。
export async function updateMemberDrinks(partyId: string, member: Member): Promise<void> {
  if (!activeGroupId) return;
  const ref = doc(db, 'groups', activeGroupId, 'parties', partyId);
  // member.id は Firestore のフィールドパス（members.<id>）に使うため、安全なセグメントである前提。
  // 固定メンバーは英小文字、動的追加は genMemberId()（m_ + base36）で生成し、いずれも安全。
  await updateDoc(ref, {
    [`members.${member.id}`]: member,
    updatedAt: serverTimestamp(),
  });
}

export async function migrateLocalData(): Promise<number> {
  const localHistory: Party[] = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  if (localHistory.length === 0) return 0;

  const col = partiesCollection();
  let migrated = 0;
  for (const party of localHistory) {
    const partyRef = doc(col, String(party.id ?? party._docId));
    const existing = await getDoc(partyRef);
    if (!existing.exists()) {
      const { _docId, ...rest } = party;
      void _docId;
      await setDoc(partyRef, { ...rest, members: membersToMap(membersToArray(party.members)), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), migratedFromLocal: true });
      migrated++;
    }
  }

  if (migrated > 0) {
    localStorage.setItem('drunk_history_backup', localStorage.getItem('drunk_history') ?? '');
    localStorage.removeItem('drunk_history');
  }
  return migrated;
}

export function cleanup(): void {
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
  activeGroupId = null;
}
