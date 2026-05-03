/**
 * Enhanced Document Service
 * Handles document upload with AI verification status tracking
 */

import { getAuthToken } from '../utils/authToken';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

/**
 * Upload document with AI verification status tracking
 * @param {File} file - Document file to upload
 * @param {string} documentType - Type of document (idProof, etc.)
 * @returns {Promise<Object>} - Upload result with status
 */
export const uploadDocumentWithVerification = async (file, documentType) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);

    const response = await fetch(`${API_BASE}/api/tenant/upload-document-enhanced`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Document upload failed');
    }

    return result;
  } catch (error) {
    console.error('Enhanced document upload error:', error);
    throw error;
  }
};

/**
 * Get documents with verification status
 * @returns {Promise<Object>} - Documents with status
 */
export const getDocumentsStatus = async () => {
  try {
    const response = await fetch(`${API_BASE}/api/tenant/documents-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${await getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Failed to fetch documents status');
    }

    return result;
  } catch (error) {
    console.error('Get documents status error:', error);
    throw error;
  }
};

/**
 * Format verification status for display
 * @param {string} status - Verification status
 * @param {Date|string|null} createdAt - Document creation timestamp (optional)
 * @returns {Object} - Formatted status with color, icon, and text
 */
export const formatVerificationStatus = (status, createdAt = null) => {
  // Check if document is old (created more than 5 minutes ago)
  const isOldDocument = createdAt && (
    (typeof createdAt === 'string' ? new Date(createdAt) : createdAt)
  ) < (new Date(Date.now() - 5 * 60 * 1000));

  switch (status) {
    case 'uploaded':
      return {
        color: '#6c757d',
        bgColor: '#f8f9fa',
        icon: '📤',
        text: 'Uploaded'
      };
    case 'verifying':
      return {
        color: '#007bff',
        bgColor: '#cce5ff',
        icon: '⏳',
        text: 'Verifying document...'
      };
    case 'approved':
      return {
        color: '#28a745',
        bgColor: '#d4edda',
        icon: '✅',
        text: 'Document Verified Successfully'
      };
    case 'rejected':
      return {
        color: '#dc3545',
        bgColor: '#f8d7da',
        icon: '❌',
        text: 'Verification Failed'
      };
    case 'needs_review':
      return {
        color: '#ffc107',
        bgColor: '#fff3cd',
        icon: '⚠️',
        text: 'Needs Manual Review'
      };
    case 'verification_failed':
      // Show neutral message for old failed documents, error only for recent ones
      return {
        color: isOldDocument ? '#6c757d' : '#dc3545',
        bgColor: isOldDocument ? '#f8f9fa' : '#f8d7da',
        icon: isOldDocument ? '📄' : '🚫',
        text: isOldDocument ? 'Previous verification failed' : 'Verification System Error'
      };
    default:
      return {
        color: '#6c757d',
        bgColor: '#f8f9fa',
        icon: '📄',
        text: 'Unknown Status'
      };
  }
};

/**
 * Get status description with reason
 * @param {string} status - Verification status
 * @param {string} reason - Verification reason
 * @returns {string} - Full status description
 */
export const getStatusDescription = (status, reason) => {
  const formattedStatus = formatVerificationStatus(status);
  
  if (status === 'approved') {
    return formattedStatus.text;
  } else if (status === 'rejected') {
    return `${formattedStatus.text} - ${reason || 'Document could not be verified'}`;
  } else if (status === 'needs_review') {
    return `${formattedStatus.text} - ${reason || 'Document requires manual verification'}`;
  } else if (status === 'verification_failed') {
    return `${formattedStatus.text} - ${reason || 'AI verification service unavailable'}`;
  } else {
    return formattedStatus.text;
  }
};

/**
 * Check if document is in final state
 * @param {string} status - Document status
 * @returns {boolean} - True if verification is complete
 */
// Currently not used, kept for future feature expansion
export const isVerificationComplete = (status) => {
  return ['approved', 'rejected', 'needs_review', 'verification_failed'].includes(status);
};

/**
 * Check if document verification is successful
 * @param {string} status - Document status
 * @returns {boolean} - True if verification passed
 */
// Currently not used, kept for future feature expansion
export const isVerificationSuccessful = (status) => {
  return status === 'approved';
};

/**
 * Get progress percentage for status
 * @param {string} status - Document status
 * @returns {number} - Progress percentage (0-100)
 */
export const getStatusProgress = (status) => {
  switch (status) {
    case 'uploaded':
      return 25;
    case 'verifying':
      return 50;
    case 'approved':
      return 100;
    case 'rejected':
      return 100;
    case 'needs_review':
      return 75;
    case 'verification_failed':
      return 50;
    default:
      return 0;
  }
};
