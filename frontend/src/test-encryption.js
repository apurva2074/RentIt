// Quick test to verify E2EE implementation
import { testEncryption, checkEncryptionSetup } from './services/encryptionTest';

// Test the encryption functionality
console.log('🧪 Testing End-to-End Encryption Implementation...');

// Test 1: Basic encryption/decryption
const encryptionTest = testEncryption();
console.log('Encryption Test Result:', encryptionTest ? '✅ PASSED' : '❌ FAILED');

// Test 2: Check setup status
const setupStatus = checkEncryptionSetup();
console.log('Setup Status:', setupStatus ? '✅ Configured' : '❌ Not configured');

console.log('🎉 E2EE Implementation Test Complete!');
