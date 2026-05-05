import { db } from '../firebase/firestore';
import { collectionGroup, query, where, onSnapshot } from 'firebase/firestore';

let unsub = null;
let isPermissionError = false;

/**
 * Start listening to unread messages count for the given user.
 * If permission denied (missing index or rules), gracefully stops and logs instructions.
 */
export const startUnreadMessagesListener = (userId, onUpdate) => {
  if (!userId) return;
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (isPermissionError) {
    console.warn('Unread messages listener previously failed due to permissions. Not retrying.');
    onUpdate(0);
    return;
  }

  // Collection group query for unread messages not sent by current user
  const q = query(
    collectionGroup(db, 'messages'),
    where('read', '==', false),
    where('senderId', '!=', userId)
  );

  unsub = onSnapshot(q, 
    (snapshot) => {
      // Success – update badge count
      onUpdate(snapshot.size);
      isPermissionError = false;
    },
    (error) => {
      console.error('Unread messages listener error:', error);
      if (error.code === 'permission-denied') {
        isPermissionError = true;
        console.warn(`
          � PERMISSION DENIED for unread messages query.
          
          This usually means one of two things:
          1. Missing composite index for collection group 'messages' on fields 'read' and 'senderId'.
          2. Firestore security rules are too restrictive.
          
          ✅ To fix: 
          - Go to Firebase Console → Firestore → Indexes
          - Add composite index:
              Collection group: messages
              Fields: read (Ascending), senderId (Ascending)
              Query scope: Collection group
          - Wait 2-5 minutes for index to build.
          
          🔗 Direct link (replace YOUR_PROJECT_ID):
          https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore/indexes
          
          In the meantime, unread badge is disabled.
        `);
        onUpdate(0); // Disable badge
      } else {
        // Other errors: log but keep badge off
        console.error('Unrecoverable error in unread listener:', error);
        onUpdate(0);
      }
      // Unsubscribe to avoid repeated errors
      if (unsub) {
        unsub();
        unsub = null;
      }
    }
  );
};

export const stopUnreadMessagesListener = () => {
  if (unsub) {
    unsub();
    unsub = null;
  }
  isPermissionError = false;
};

/**
 * Force re-initialize the listener (e.g., after index creation).
 */
export const restartUnreadMessagesListener = (userId, onUpdate) => {
  stopUnreadMessagesListener();
  startUnreadMessagesListener(userId, onUpdate);
};
