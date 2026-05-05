// Test utility for E2EE fallback mechanism
import { resetE2EESupport } from './services/chatService';
import { fetchUserPublicKey } from './services/userEncryption';

export const testE2EEFallback = async () => {
  console.log('🧪 Testing E2EE Fallback Mechanism...');
  
  // Reset the support flag to force re-detection
  resetE2EESupport();
  
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in');
    return false;
  }
  
  try {
    // Test 1: Try to fetch public key (should fail on production without endpoints)
    console.log('📝 Testing public key endpoint availability...');
    const publicKey = await fetchUserPublicKey(user.uid);
    
    if (publicKey === null) {
      console.log('✅ Fallback detected - public key endpoint not available');
      console.log('📝 Messages will be sent as plain text');
    } else if (publicKey) {
      console.log('✅ E2EE supported - public key available');
      console.log('📝 Messages will be encrypted');
    } else {
      console.log('⚠️  Unexpected response from public key endpoint');
    }
    
    // Test 2: Test the support detection function
    console.log('\n📝 Testing E2EE support detection...');
    const checkE2EESupport = (await import('./services/chatService')).checkE2EESupport;
    const isSupported = await checkE2EESupport(user.uid);
    console.log(`📊 E2EE Support: ${isSupported ? '✅ Enabled' : '❌ Fallback to plain text'}`);
    
    console.log('\n🎉 E2EE Fallback Test Complete!');
    return true;
    
  } catch (error) {
    console.error('❌ E2EE Fallback Test Failed:', error);
    return false;
  }
};

// Auto-run test when user logs in
auth.onAuthStateChanged((user) => {
  if (user) {
    setTimeout(() => {
      testE2EEFallback();
    }, 2000); // Wait 2 seconds for initialization
  }
});

// Export for manual testing
window.testE2EEFallback = testE2EEFallback;
window.resetE2EESupport = resetE2EESupport;

console.log('🔧 E2EE Fallback Test Utilities Loaded!');
console.log('📝 Available commands:');
console.log('  - window.testE2EEFallback() - Test fallback mechanism');
console.log('  - window.resetE2EESupport() - Reset support flag');
