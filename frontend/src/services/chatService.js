// Frontend service for chat API calls
import { getAuthToken } from '../utils/authToken';
import { encryptMessage } from './encryptionService';
import { fetchUserPublicKey } from './userEncryption';

// Global cache for sent messages (store plain text)
if (typeof window !== 'undefined' && !window.sentMessagesCache) {
  window.sentMessagesCache = new Map();
}

// Feature flag for E2EE support
let e2eeSupported = undefined; // undefined = unknown, true = supported, false = fallback

const checkE2EESupport = async (recipientId) => {
  if (e2eeSupported !== undefined) return e2eeSupported;
  try {
    const key = await fetchUserPublicKey(recipientId);
    // If we get a 404 from fetchUserPublicKey (it returns null), assume not supported
    if (key === null) {
      console.warn('Public-key endpoint not available – falling back to plain text');
      e2eeSupported = false;
      return false;
    }
    e2eeSupported = true;
    return true;
  } catch {
    e2eeSupported = false;
    return false;
  }
};

// Utility to reset E2EE support flag (for testing)
export const resetE2EESupport = () => {
  e2eeSupported = undefined;
  console.log('E2EE support flag reset - will re-detect on next message');
};

// Mark all messages as read for the current user
export const markAllMessagesAsRead = async () => {
  try {
    const response = await apiCall('/chats/mark-all-read', {
      method: 'POST',
    });
    return response;
  } catch (error) {
    console.error('Mark all read error:', error);
    throw error;
  }
};

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

// API helper with auth
const apiCall = async (endpoint, options = {}) => {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Chat API Error Response:', {
      status: response.status,
      statusText: response.statusText,
      url: `${API_BASE}/api${endpoint}`,
      headers: headers,
      body: errorText
    });
    
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText || 'API call failed' };
    }
    
    console.error('Chat API Parsed Error:', errorData);
    throw new Error(errorData.message || 'API call failed');
  }

  return response.json();
};

// Create or get existing chat
export const createOrGetChat = async (propertyId, ownerId) => {
  try {
    return await apiCall('/chats', {
      method: 'POST',
      body: JSON.stringify({ propertyId, ownerId }),
    });
  } catch (error) {
    console.error('Create/get chat error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      propertyId: propertyId,
      ownerId: ownerId
    });
    throw error;
  }
};

// Get user's chats
export const getUserChats = async () => {
  try {
    console.log("Fetching user chats...");
    const response = await apiCall('/chats');
    console.log("Received chats:", response);
    return response;
  } catch (error) {
    console.error('Get user chats error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

// Get specific chat with messages
export const getChatById = async (chatId) => {
  try {
    return await apiCall(`/chats/${chatId}`);
  } catch (error) {
    console.error('Get chat by ID error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      chatId: chatId
    });
    throw error;
  }
};

// Send message
export const sendMessage = async (chatId, message) => {
  try {
    const chat = await getChatById(chatId);
    const currentUser = (await import('../firebase/auth')).auth?.currentUser;
    if (!currentUser) throw new Error('No user');

    const recipientId = chat.ownerId === currentUser.uid ? chat.tenantId : chat.ownerId;
    const e2eeEnabled = await checkE2EESupport(recipientId);
    
    let finalMessage = message;
    if (e2eeEnabled) {
      const recipientPublicKey = await fetchUserPublicKey(recipientId);
      if (recipientPublicKey) {
        const encrypted = encryptMessage(message, recipientPublicKey);
        if (encrypted) finalMessage = encrypted;
        else console.warn('Encryption failed, sending plain text');
      } else {
        console.warn('No public key, sending plain text');
      }
    }

    const response = await apiCall(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: finalMessage }),
    });

    // Store plain text in cache for own messages
    if (response.messageId && window.sentMessagesCache) {
      window.sentMessagesCache.set(response.messageId, message);
      setTimeout(() => window.sentMessagesCache.delete(response.messageId), 10 * 60 * 1000);
    }
    return response;
  } catch (error) {
    console.error('Send message error:', error);
    throw error;
  }
};

// Send typing indicator
export const sendTypingIndicator = async (chatId, isTyping) => {
  try {
    return await apiCall(`/chats/${chatId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping }),
    });
  } catch (error) {
    console.error('Typing indicator error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      chatId: chatId,
      isTyping: isTyping
    });
    throw error;
  }
};

// Mark messages as read
export const markMessagesAsRead = async (chatId) => {
  try {
    return await apiCall(`/chats/${chatId}/read`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Mark as read error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      chatId: chatId
    });
    throw error;
  }
};

// Add reaction to message
export const addMessageReaction = async (chatId, messageId, emoji) => {
  try {
    return await apiCall(`/chats/${chatId}/messages/${messageId}/reaction`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  } catch (error) {
    console.error('Reaction error:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      chatId: chatId,
      messageId: messageId,
      emoji: emoji
    });
    throw error;
  }
};
