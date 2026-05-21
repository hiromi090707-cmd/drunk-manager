import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, arrayRemove,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group, Party, Member } from '../types';

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
  members: { id: string; name: string }[],
  creatorUid: string,
  creatorEmail: string,
  customInviteCode?: string,
): Promise<Group> {
  const inviteCode = customInviteCode || Math.random().toString(36).substring(2, 8).toUpperCase();
  const groupRef = doc(collection(db, 'groups'));
  const groupData = {
    name: groupName,
    memberUids: [creatorUid],
    memberEmails: [creatorEmail],
    members,
    inviteCode,
    claudeApiKey: '',
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

export async function findUserGroup(uid: string): Promise<Group | null> {
  const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const userGroup = { id: docSnap.id, ...docSnap.data() } as Group;
  activeGroupId = userGroup.id;
  return userGroup;
}

export async function getGroupInfo(): Promise<Group | null> {
  if (!activeGroupId) return null;
  const docSnap = await getDoc(doc(db, 'groups', activeGroupId));
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as Group;
  return null;
}

export async function leaveGroup(uid: string, email: string): Promise<void> {
  if (!activeGroupId) return;
  const updates: Record<string, unknown> = { memberUids: arrayRemove(uid) };
  if (email) updates.memberEmails = arrayRemove(email);
  await updateDoc(doc(db, 'groups', activeGroupId), updates);
  activeGroupId = null;
}

export async function saveClaudeApiKey(apiKey: string): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), { claudeApiKey: apiKey });
}

export async function getClaudeApiKey(): Promise<string> {
  if (!activeGroupId) return '';
  const info = await getGroupInfo();
  // 旧Geminiキーからの移行サポート
  return info?.claudeApiKey || info?.geminiApiKey || '';
}

export async function createParty(initialData: Partial<Party>): Promise<string> {
  const docRef = await addDoc(partiesCollection(), {
    ...initialData,
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
  await setDoc(partyRef, { ...partyData, updatedAt: serverTimestamp() }, { merge: true });
}

export function listenToParties(callback: (parties: Party[]) => void): Unsubscribe {
  if (historyUnsubscribe) historyUnsubscribe();
  const q = query(partiesCollection(), orderBy('startTime', 'desc'));
  historyUnsubscribe = onSnapshot(q, (snapshot) => {
    const parties: Party[] = [];
    snapshot.forEach((d) => parties.push({ ...d.data(), _docId: d.id } as Party));
    callback(parties);
  }, console.error);
  return historyUnsubscribe;
}

export function listenToParty(partyId: string, callback: (party: Party) => void): Unsubscribe {
  const partyRef = doc(partiesCollection(), String(partyId));
  return onSnapshot(partyRef, (d) => {
    if (d.exists()) callback({ ...d.data(), _docId: d.id } as Party);
  }, console.error);
}

export async function updatePartyMemberDrinks(partyId: string, members: Member[]): Promise<void> {
  const partyRef = doc(partiesCollection(), String(partyId));
  await updateDoc(partyRef, { members, updatedAt: serverTimestamp() });
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
      await setDoc(partyRef, { ...party, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), migratedFromLocal: true });
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
