import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'e2ee_public_key';

/**
 * Generate a new key pair (publicKey, privateKey) using tweetnacl box (curve25519)
 */
export const generateKeyPair = () => {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: encodeBase64(keyPair.publicKey),
    privateKey: encodeBase64(keyPair.secretKey),
  };
};

/**
 * Save private key to localStorage (encrypted with a simple XOR or just raw for simplicity)
 * For production, you would derive a key from user's password. For this demo, raw storage is acceptable.
 */
export const savePrivateKey = (privateKeyBase64) => {
  localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privateKeyBase64);
};

/**
 * Get private key from localStorage
 */
export const getPrivateKey = () => {
  const privateKeyBase64 = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
  if (!privateKeyBase64) return null;
  return decodeBase64(privateKeyBase64);
};

/**
 * Get public key from localStorage (saved during key generation)
 */
export const getLocalPublicKey = () => {
  const publicKeyBase64 = localStorage.getItem(PUBLIC_KEY_STORAGE_KEY);
  if (!publicKeyBase64) return null;
  return decodeBase64(publicKeyBase64);
};

/**
 * Save public key to localStorage
 */
export const savePublicKey = (publicKeyBase64) => {
  localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, publicKeyBase64);
};

/**
 * Encrypt a message for a recipient using their public key (base64 encoded)
 * Returns base64 encoded ciphertext (ready to store)
 */
export const encryptMessage = (message, recipientPublicKeyBase64) => {
  try {
    const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
    const senderPrivateKey = getPrivateKey();
    if (!senderPrivateKey) throw new Error('No private key found');
    
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageUint8 = new TextEncoder().encode(message);
    
    const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, senderPrivateKey);
    
    // Combine nonce + encrypted into one base64 string
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);
    
    return encodeBase64(combined);
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
};

/**
 * Decrypt a message using recipient's own private key and sender's public key
 * @param {string} ciphertextBase64 - Combined nonce + ciphertext (base64)
 * @param {string} senderPublicKeyBase64 - Public key of the message sender
 */
export const decryptMessage = (ciphertextBase64, senderPublicKeyBase64) => {
  try {
    const combined = decodeBase64(ciphertextBase64);
    const nonce = combined.slice(0, nacl.box.nonceLength);
    const encrypted = combined.slice(nacl.box.nonceLength);
    
    const senderPublicKey = decodeBase64(senderPublicKeyBase64);
    const recipientPrivateKey = getPrivateKey();
    if (!recipientPrivateKey) throw new Error('No private key found');
    
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientPrivateKey);
    if (!decrypted) throw new Error('Decryption failed – invalid key or tampered data');
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Encrypted message]';
  }
};

/**
 * Check if E2EE is set up for the current user
 */
export const isE2EESetup = () => {
  return !!localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
};

/**
 * Remove keys (on logout)
 */
export const clearKeys = () => {
  localStorage.removeItem(PRIVATE_KEY_STORAGE_KEY);
  localStorage.removeItem(PUBLIC_KEY_STORAGE_KEY);
};
