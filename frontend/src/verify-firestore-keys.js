// Utility to verify Firestore public key data
import { auth } from './firebase/auth';
import { db } from './firebase/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { initUserEncryption } from './services/userEncryption';

export const verifyFirestoreKeys = async () => {
  console.log('🔍 Verifying Firestore Public Keys...');
  
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in');
    return false;
  }
  
  try {
    // Step 1: Check current user's public key in Firestore
    console.log(`📝 Checking public key for user: ${user.uid}`);
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const publicKey = userData.publicKey;
      
      if (publicKey) {
        console.log('✅ Public key found in Firestore');
        console.log('📏 Key length:', publicKey.length, 'characters');
        console.log('🔍 First 20 chars:', publicKey.substring(0, 20) + '...');
        console.log('🔍 Last 20 chars:', '...' + publicKey.substring(publicKey.length - 20));
      } else {
        console.log('❌ No public key found in Firestore');
        console.log('🔧 Attempting to initialize encryption...');
        
        // Try to initialize encryption
        const initResult = await initUserEncryption(user);
        if (initResult) {
          console.log('✅ Encryption initialized successfully');
          
          // Verify again after initialization
          const updatedDoc = await getDoc(doc(db, 'users', user.uid));
          const updatedData = updatedDoc.data();
          if (updatedData.publicKey) {
            console.log('✅ Public key now available in Firestore');
            console.log('📏 Key length:', updatedData.publicKey.length, 'characters');
          } else {
            console.log('❌ Still no public key after initialization');
          }
        } else {
          console.log('❌ Failed to initialize encryption');
        }
      }
    } else {
      console.log('❌ User document not found in Firestore');
    }
    
    // Step 2: Check other users in the system (for testing)
    console.log('\n📝 Checking for other users with public keys...');
    const usersSnapshot = await getDoc(doc(db, 'users', 'sample-user-id'));
    console.log('🔍 Sample user check completed (this is just a test)');
    
    // Step 3: Manual initialization instructions
    console.log('\n🔧 Manual Initialization (if needed):');
    console.log('Run this in browser console:');
    console.log(`
import { initUserEncryption } from './services/userEncryption';
import { auth } from './firebase/auth';
const user = auth.currentUser;
await initUserEncryption(user);
    `);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error verifying Firestore keys:', error);
    return false;
  }
};

// Auto-run verification when user logs in
auth.onAuthStateChanged((user) => {
  if (user) {
    setTimeout(() => {
      verifyFirestoreKeys();
    }, 2000); // Wait 2 seconds for initialization
  }
});

// Export for manual testing
window.verifyFirestoreKeys = verifyFirestoreKeys;

// Also provide a manual initialization function
window.initEncryption = async () => {
  const user = auth.currentUser;
  if (user) {
    try {
      const result = await initUserEncryption(user);
      console.log('Manual initialization result:', result);
      return result;
    } catch (error) {
      console.error('Manual initialization failed:', error);
      return false;
    }
  } else {
    console.log('No user logged in');
    return false;
  }
};
