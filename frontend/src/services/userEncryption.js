import { generateKeyPair, savePrivateKey, savePublicKey, isE2EESetup, clearKeys as clearEncryptionKeys } from './encryptionService';
import { getAuthToken } from '../utils/authToken';

export const initUserEncryption = async (user) => {
  if (!user) return false;
  if (isE2EESetup()) {
    console.log('E2EE already set up for user:', user.uid);
    return true;
  }
  
  console.log('Generating new key pair for user:', user.uid);
  const { publicKey, privateKey } = generateKeyPair();
  savePrivateKey(privateKey);
  savePublicKey(publicKey);
  
  try {
    const token = await getAuthToken();
    const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/users/${user.uid}/public-key`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey }),
    });
    if (!response.ok) throw new Error('Server responded with ' + response.status);
    console.log('Public key saved successfully');
    return true;
  } catch (error) {
    console.error('Failed to save public key:', error);
    return false;
  }
};

export const fetchUserPublicKey = async (userId) => {
  try {
    const token = await getAuthToken();
    const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/users/${userId}/public-key`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) {
      if (response.status === 404) console.warn(`Public key not found for user ${userId}`);
      return null;
    }
    const data = await response.json();
    return data.publicKey;
  } catch (error) {
    console.error(`Error fetching public key for ${userId}:`, error);
    return null;
  }
};

// Re-export clearKeys from encryptionService for useAuth
export const clearKeys = () => {
  clearEncryptionKeys();
};
