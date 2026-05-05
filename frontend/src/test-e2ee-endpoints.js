// Test E2EE endpoints functionality
import { fetchUserPublicKey } from './services/userEncryption';
import { initUserEncryption } from './services/userEncryption';
import { auth } from './firebase/auth';

export const testE2EEEndpoints = async () => {
  console.log('🧪 Testing E2EE Endpoints...');
  
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in');
    return false;
  }
  
  try {
    // Test 1: Initialize encryption for current user
    console.log('📝 Testing encryption initialization...');
    const initResult = await initUserEncryption(user);
    console.log('✅ Encryption initialization:', initResult ? 'Success' : 'Failed');
    
    // Test 2: Fetch current user's public key
    console.log('📝 Testing public key retrieval...');
    const publicKey = await fetchUserPublicKey(user.uid);
    console.log('✅ Public key retrieved:', publicKey ? 'Success' : 'Failed');
    
    if (publicKey) {
      console.log('🔑 Public key (first 50 chars):', publicKey.substring(0, 50) + '...');
    }
    
    // Test 3: Try to fetch non-existent user's public key
    console.log('📝 Testing non-existent user handling...');
    const fakePublicKey = await fetchUserPublicKey('fake-user-id');
    console.log('✅ Non-existent user handled correctly:', fakePublicKey === null ? 'Success' : 'Failed');
    
    console.log('🎉 E2EE Endpoints Test Complete!');
    return true;
  } catch (error) {
    console.error('❌ E2EE Endpoints Test Failed:', error);
    return false;
  }
};

// Auto-run test when user is logged in
auth.onAuthStateChanged((user) => {
  if (user) {
    setTimeout(() => {
      testE2EEEndpoints();
    }, 2000); // Wait 2 seconds for initialization
  }
});
