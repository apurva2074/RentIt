// Simple test utility for E2EE functionality
import { generateKeyPair, encryptMessage, decryptMessage, isE2EESetup } from './encryptionService';

export const testEncryption = () => {
  console.log('🧪 Testing End-to-End Encryption...');
  
  // Generate test key pair
  const aliceKeys = generateKeyPair();
  const bobKeys = generateKeyPair();
  
  console.log('🔑 Alice Public Key:', aliceKeys.publicKey.substring(0, 20) + '...');
  console.log('🔑 Bob Public Key:', bobKeys.publicKey.substring(0, 20) + '...');
  
  // Test message
  const plainMessage = 'Hello, this is a secret message!';
  console.log('📝 Original Message:', plainMessage);
  
  // Encrypt message from Alice to Bob
  const encryptedMessage = encryptMessage(plainMessage, bobKeys.publicKey);
  console.log('🔒 Encrypted Message:', encryptedMessage?.substring(0, 50) + '...');
  
  if (!encryptedMessage) {
    console.error('❌ Encryption failed!');
    return false;
  }
  
  // Decrypt message from Bob's perspective
  const decryptedMessage = decryptMessage(encryptedMessage, aliceKeys.publicKey);
  console.log('🔓 Decrypted Message:', decryptedMessage);
  
  // Verify
  const success = decryptedMessage === plainMessage;
  console.log(success ? '✅ E2EE Test PASSED!' : '❌ E2EE Test FAILED!');
  
  return success;
};

export const checkEncryptionSetup = () => {
  const isSetup = isE2EESetup();
  console.log('🔐 Encryption Setup Status:', isSetup ? '✅ Configured' : '❌ Not configured');
  return isSetup;
};
