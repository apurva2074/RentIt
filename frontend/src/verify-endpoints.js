// Frontend verification script for E2EE endpoints
import { fetchUserPublicKey } from './services/userEncryption';
import { initUserEncryption } from './services/userEncryption';
import { auth } from './firebase/auth';

export const verifyE2EEEndpoints = async () => {
  console.log('🔍 Verifying E2EE Endpoints...');
  
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in - please log in first');
    return false;
  }
  
  try {
    // Step 1: Initialize encryption (this will test the PUT endpoint)
    console.log('📝 Step 1: Testing PUT /api/users/:userId/public-key');
    const initResult = await initUserEncryption(user);
    console.log('✅ PUT endpoint result:', initResult ? 'Success' : 'Failed');
    
    // Step 2: Fetch public key (this will test the GET endpoint)
    console.log('📝 Step 2: Testing GET /api/users/:userId/public-key');
    const publicKey = await fetchUserPublicKey(user.uid);
    console.log('✅ GET endpoint result:', publicKey ? 'Success' : 'Failed');
    
    if (publicKey) {
      console.log('🔑 Public key retrieved successfully');
      console.log('📏 Key length:', publicKey.length, 'characters');
      console.log('🔍 First 20 chars:', publicKey.substring(0, 20) + '...');
    } else {
      console.log('⚠️  No public key found - this might indicate an issue');
    }
    
    // Step 3: Test error handling with invalid user ID
    console.log('📝 Step 3: Testing error handling with invalid user');
    const invalidPublicKey = await fetchUserPublicKey('invalid-user-id-12345');
    console.log('✅ Error handling test:', invalidPublicKey === null ? 'Success' : 'Failed');
    
    console.log('\n🎉 E2EE Endpoints Verification Complete!');
    console.log('📊 Summary:');
    console.log('  - PUT endpoint:', initResult ? '✅ Working' : '❌ Issue');
    console.log('  - GET endpoint:', publicKey ? '✅ Working' : '❌ Issue');
    console.log('  - Error handling:', invalidPublicKey === null ? '✅ Working' : '❌ Issue');
    
    return initResult && publicKey !== null;
    
  } catch (error) {
    console.error('❌ Endpoint verification failed:', error);
    console.error('📝 Error details:', {
      message: error.message,
      stack: error.stack
    });
    return false;
  }
};

// Auto-run verification when user logs in
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('👤 User detected, running endpoint verification...');
    setTimeout(() => {
      verifyE2EEEndpoints();
    }, 3000); // Wait 3 seconds for initialization
  }
});

// Export for manual testing
window.verifyE2EEEndpoints = verifyE2EEEndpoints;
