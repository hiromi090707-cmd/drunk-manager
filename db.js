// Database module - Firestore CRUD operations + real-time listeners
import { db } from './firebase.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc,
  onSnapshot, query, orderBy, where, serverTimestamp, arrayRemove
} from 'firebase/firestore';

let activeGroupId = null;
let historyUnsubscribe = null;

// --- Group Operations ---

export function setActiveGroup(groupId) {
  activeGroupId = groupId;
}

export function getActiveGroup() {
  return activeGroupId;
}

// Create a new group (first-time setup by admin)
export async function createGroup(groupName, members, creatorUid, creatorEmail) {
  // Generate a simple 6-character invite code
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  const groupRef = doc(collection(db, 'groups'));
  const groupData = {
    name: groupName,
    memberUids: [creatorUid],
    memberEmails: [creatorEmail],
    members: members,
    inviteCode: inviteCode,
    geminiApiKey: '',
    createdAt: serverTimestamp(),
    createdBy: creatorUid
  };
  
  await setDoc(groupRef, groupData);
  activeGroupId = groupRef.id;
  return { id: groupRef.id, inviteCode, ...groupData };
}

// Join an existing group by invite code
export async function joinGroupByCode(inviteCode, uid, email) {
  const groupsRef = collection(db, 'groups');
  const q = query(groupsRef, where('inviteCode', '==', inviteCode));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('招待コードが見つかりません');
  }

  const docSnap = snapshot.docs[0];
  const targetGroup = { id: docSnap.id, ...docSnap.data() };

  if (!targetGroup.memberUids.includes(uid)) {
    const groupRef = doc(db, 'groups', targetGroup.id);
    await updateDoc(groupRef, {
      memberUids: [...targetGroup.memberUids, uid],
      memberEmails: [...(targetGroup.memberEmails || []), email]
    });
  }

  activeGroupId = targetGroup.id;
  return targetGroup;
}

// Find group for a user
export async function findUserGroup(uid) {
  const groupsRef = collection(db, 'groups');
  const q = query(groupsRef, where('memberUids', 'array-contains', uid));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const userGroup = { id: docSnap.id, ...docSnap.data() };
  activeGroupId = userGroup.id;
  return userGroup;
}

// Get group info
export async function getGroupInfo() {
  if (!activeGroupId) return null;
  const groupRef = doc(db, 'groups', activeGroupId);
  const docSnap = await getDoc(groupRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() };
  }
  return null;
}

// Regenerate invite code
export async function regenerateInviteCode() {
  if (!activeGroupId) return null;
  const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  await updateDoc(doc(db, 'groups', activeGroupId), { inviteCode: newCode });
  return newCode;
}

// Leave group (removes uid from memberUids)
export async function leaveGroup(uid, email) {
  if (!activeGroupId) return;
  const updates = { memberUids: arrayRemove(uid) };
  if (email) updates.memberEmails = arrayRemove(email);
  await updateDoc(doc(db, 'groups', activeGroupId), updates);
  activeGroupId = null;
}

// --- Gemini API Key (shared per group) ---

export async function saveGeminiApiKey(apiKey) {
  if (!activeGroupId) return;
  const groupRef = doc(db, 'groups', activeGroupId);
  await updateDoc(groupRef, { geminiApiKey: apiKey });
}

export async function getGeminiApiKey() {
  if (!activeGroupId) return localStorage.getItem('gemini_api_key') || '';
  const groupInfo = await getGroupInfo();
  return groupInfo?.geminiApiKey || '';
}

// --- Party (Drinking Session) Operations ---

function partiesCollection() {
  if (!activeGroupId) throw new Error('No active group');
  return collection(db, 'groups', activeGroupId, 'parties');
}

// Create a new party (called when party starts) — returns Firestore auto-generated ID
export async function createParty(initialData) {
  const col = partiesCollection();
  const docRef = await addDoc(col, {
    ...initialData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
}

// Save (upsert) final party data on end/edit
export async function saveParty(partyData) {
  const col = partiesCollection();
  const partyRef = doc(col, String(partyData.id));
  await setDoc(partyRef, { ...partyData, updatedAt: serverTimestamp() }, { merge: true });
}

// Get all parties (one-time fetch)
export async function getAllParties() {
  const col = partiesCollection();
  const q = query(col, orderBy('startTime', 'desc'));
  const snapshot = await getDocs(q);
  
  const parties = [];
  snapshot.forEach(docSnap => {
    parties.push({ ...docSnap.data(), _docId: docSnap.id });
  });
  
  return parties;
}

// Listen for real-time updates to the party list
export function listenToParties(callback) {
  // Unsubscribe from previous listener
  if (historyUnsubscribe) {
    historyUnsubscribe();
  }
  
  const col = partiesCollection();
  const q = query(col, orderBy('startTime', 'desc'));
  
  historyUnsubscribe = onSnapshot(q, (snapshot) => {
    const parties = [];
    snapshot.forEach(docSnap => {
      parties.push({ ...docSnap.data(), _docId: docSnap.id });
    });
    callback(parties);
  }, (error) => {
    console.error('Error listening to parties:', error);
  });
  
  return historyUnsubscribe;
}

// Listen for real-time updates to a single party
export function listenToParty(partyId, callback) {
  const col = partiesCollection();
  const partyRef = doc(col, String(partyId));
  
  return onSnapshot(partyRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ ...docSnap.data(), _docId: docSnap.id });
    }
  }, (error) => {
    console.error('Error listening to party:', error);
  });
}

// Update drink counts for a member in an active party (real-time sync)
export async function updatePartyMemberDrinks(partyId, members) {
  const col = partiesCollection();
  const partyRef = doc(col, String(partyId));
  await updateDoc(partyRef, { members, updatedAt: serverTimestamp() });
}

// --- Data Migration (localStorage → Firestore) ---

export async function migrateLocalData() {
  const localHistory = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  if (localHistory.length === 0) return 0;
  
  const col = partiesCollection();
  let migrated = 0;
  
  for (const party of localHistory) {
    const partyRef = doc(col, String(party.id));
    const existing = await getDoc(partyRef);
    
    if (!existing.exists()) {
      await setDoc(partyRef, {
        ...party,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        migratedFromLocal: true
      });
      migrated++;
    }
  }
  
  // Clear localStorage after successful migration
  if (migrated > 0) {
    localStorage.setItem('drunk_history_backup', localStorage.getItem('drunk_history'));
    localStorage.removeItem('drunk_history');
  }
  
  return migrated;
}

// Stop all listeners
export function cleanup() {
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
}
