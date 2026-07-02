import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group, GroupMember, Party, Member } from '../types';
import { membersToMap, membersToArray } from './party';

// groups/<groupId>/parties コレクション参照。groupId は呼び出し元（AppContext の groupInfo）が渡す。
function partiesCollection(groupId: string) {
  return collection(db, 'groups', groupId, 'parties');
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
  return { id: groupRef.id, ...groupData } as Group;
}

export async function joinGroupByCode(inviteCode: string, uid: string, email: string): Promise<Group> {
  const q = query(collection(db, 'groups'), where('inviteCode', '==', inviteCode));
  const snapshot = await getDocs(q);
  if (snapshot.empty) throw new Error('招待コードが見つかりません');

  const docSnap = snapshot.docs[0];
  const targetGroup = { id: docSnap.id, ...docSnap.data() } as Group;

  // 参加済みならそのまま返す（memberUids に自分が居るので合成不要）
  if (targetGroup.memberUids.includes(uid)) return targetGroup;

  // 1人1グループの不変条件。UI からは通常到達しない防波堤
  const current = await findUserGroup(uid);
  if (current) throw new Error('既に別のグループに参加しています。先に退出してください。');

  const memberUids = [...targetGroup.memberUids, uid];
  const memberEmails = [...(targetGroup.memberEmails || []), email];
  await updateDoc(doc(db, 'groups', targetGroup.id), { memberUids, memberEmails });
  // 更新前のスナップショットではなく、自分を含めた姿をローカル合成して返す（再読取なし）
  return { ...targetGroup, memberUids, memberEmails };
}

export async function updateInviteCode(groupId: string, newCode: string): Promise<string> {
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
  return { id: docSnap.id, ...docSnap.data() } as Group;
}

export async function leaveGroup(groupId: string, uid: string, email: string): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), {
    memberUids: arrayRemove(uid),
    memberEmails: arrayRemove(email),
  });
}

// グループの名簿（members 配列）を丸ごと更新する。removed を含むフル配列を渡すこと。
// parties の members マップとは別物（こちらは配列）。
export async function updateGroupMembers(groupId: string, members: GroupMember[]): Promise<void> {
  await updateDoc(doc(db, 'groups', groupId), { members });
}

export async function createParty(groupId: string, initialData: Partial<Party>): Promise<string> {
  const { members, ...rest } = initialData;
  const docRef = await addDoc(partiesCollection(groupId), {
    ...rest,
    ...(members ? { members: membersToMap(members) } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteParty(groupId: string, partyId: string): Promise<void> {
  await deleteDoc(doc(partiesCollection(groupId), String(partyId)));
}

export async function saveParty(groupId: string, partyData: Party): Promise<void> {
  const partyRef = doc(partiesCollection(groupId), String(partyData.id ?? partyData._docId));
  const { _docId, members, ...rest } = partyData;
  void _docId;
  await setDoc(partyRef, { ...rest, members: membersToMap(members), updatedAt: serverTimestamp() }, { merge: true });
}

// 購読解除は返り値の Unsubscribe を呼び出し元（useEffect の cleanup）が必ず管理する。
// onError は SDK が購読を恒久停止した時のみ発火する（ネットワーク断では発火しない）。
export function listenToParties(
  groupId: string,
  onData: (parties: Party[]) => void,
  onError: (error: Error) => void = console.error,
): Unsubscribe {
  const q = query(partiesCollection(groupId), orderBy('startTime', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const parties: Party[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      parties.push({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    });
    onData(parties);
  }, onError);
}

export function listenToParty(groupId: string, partyId: string, callback: (party: Party) => void): Unsubscribe {
  const partyRef = doc(partiesCollection(groupId), String(partyId));
  return onSnapshot(partyRef, (d) => {
    if (d.exists()) {
      const data = d.data();
      callback({ ...data, members: membersToArray(data.members), _docId: d.id } as Party);
    }
  }, console.error);
}

// 1メンバーのフィールドのみを部分更新する。members.<id> サブツリーだけを書くため、
// 他メンバーの members.<otherId> は Firestore 側で自動マージされ、同時更新が消し合わない。
export async function updateMemberDrinks(groupId: string, partyId: string, member: Member): Promise<void> {
  const ref = doc(db, 'groups', groupId, 'parties', partyId);
  // member.id は Firestore のフィールドパス（members.<id>）に使うため、安全なセグメントである前提。
  // 固定メンバーは英小文字、動的追加は genMemberId()（m_ + base36）で生成し、いずれも安全。
  await updateDoc(ref, {
    [`members.${member.id}`]: member,
    updatedAt: serverTimestamp(),
  });
}

export async function migrateLocalData(groupId: string): Promise<number> {
  const localHistory: Party[] = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  if (localHistory.length === 0) return 0;

  const col = partiesCollection(groupId);
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
