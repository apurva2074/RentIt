// Utility to reset encryption keys and force regeneration
import { clearKeys } from './services/encryptionService';
import { initUserEncryption } from './services/userEncryption';
import { auth } from './firebase/auth';

export const resetEncryptionForCurrentUser = async () => {
  console.log('🔄 Resetting encryption for current user...');
  
  const user = auth.currentUser;
  if (!user) {
    console.log('❌ No user logged in');
    return false;
  }
  
  try {
    // Step 1: Clear existing keys
    console.log('🗑️  Clearing existing keys...');
    clearKeys();
    
    // Step 2: Clear message cache
    if (window.sentMessagesCache) {
      window.sentMessagesCache.clear();
      console.log('🗑️  Cleared message cache');
    }
    
    // Step 3: Re-initialize encryption
    console.log('🔑 Re-initializing encryption...');
    const success = await initUserEncryption(user);
    
    if (success) {
      console.log('✅ Encryption reset successfully!');
      console.log('📝 Please refresh the page and try sending a message');
      return true;
    } else {
      console.log('❌ Failed to re-initialize encryption');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error resetting encryption:', error);
    return false;
  }
};

export const clearAllEncryptionData = () => {
  console.log('🗑️  Clearing all encryption data...');
  
  // Clear local storage
  localStorage.removeItem('e2ee_private_key');
  localStorage.removeItem('e2ee_public_key');
  
  // Clear message cache
  if (window.sentMessagesCache) {
    window.sentMessagesCache.clear();
  }
  
  console.log('✅ All encryption data cleared');
  console.log('📝 Please log out and log back in to regenerate keys');
};

// Export for manual use in browser console
window.resetEncryption = resetEncryptionForCurrentUser;
window.clearAllEncryption = clearAllEncryptionData;

// Auto-run instructions
console.log('🔧 Encryption reset utilities loaded!');
console.log('📝 Available commands:');
console.log('  - window.resetEncryption() - Reset for current user');
console.log('  - window.clearAllEncryption() - Clear all encryption data');
