import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuthToken } from '../../../utils/authToken';
import { 
  uploadDocumentWithVerification, 
  getDocumentsStatus, 
  // eslint-disable-next-line no-unused-vars
  formatVerificationStatus, 
  // eslint-disable-next-line no-unused-vars
  getStatusDescription,
  // eslint-disable-next-line no-unused-vars
  isVerificationComplete,
  // eslint-disable-next-line no-unused-vars
  isVerificationSuccessful,
  // eslint-disable-next-line no-unused-vars
  getStatusProgress
} from '../../../services/enhancedDocumentService';
import DocumentStatusDisplay from '../../../components/DocumentStatusDisplay';
import './RentalDocuments.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

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
    const error = await response.json();
    throw new Error(error.message || 'API call failed');
  }

  return response.json();
};

export default function RentalDocuments({ uid }) {
  console.log("RentalDocuments component rendered with UID:", uid);
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  
  // Document verification status tracking - ADD ONLY THIS
  const [verificationStatus, setVerificationStatus] = useState('idle');
  
  // Document verification status tracking
  const [documentStatuses, setDocumentStatuses] = useState({
    idProof: null
  });
  
  const [formData, setFormData] = useState({
    fullName: '',
    dob: '',
    phone: '',
    address: '',
    idType: '',
    idProofUrl: ''
  });

  const [uploadProgress, setUploadProgress] = useState({
    idProof: 0
  });

  // Fetch user profile data to pre-fill name and phone
  const fetchUserProfile = useCallback(async () => {
    try {
      console.log("Fetching user profile for UID:", uid);
      const response = await apiCall('/users/profile');
      console.log("User profile response:", response);
      
      if (response && (response.name || response.phone)) {
        setFormData(prev => ({
          ...prev,
          fullName: response.data.name || '',
          phone: response.data.phone || ''
        }));
        console.log("Pre-filled user data:", { name: response.name, phone: response.phone });
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      // Don't show error for profile fetch, just continue with empty form
    }
  }, [uid]);

  // Fetch document verification status
  const fetchDocumentStatuses = useCallback(async () => {
    try {
      console.log("Fetching document verification status for UID:", uid);
      const response = await getDocumentsStatus();
      console.log("Document status response:", response);
      
      if (response.success && response.documents) {
        const statuses = {};
        let hasFailed = false;
        let hasApproved = false;
        
        response.documents.forEach(doc => {
          if (doc.documentType === 'idProof') {
            statuses.idProof = doc;
            if (doc.status === 'rejected' || doc.status === 'verification_failed') {
              hasFailed = true;
            } else if (doc.status === 'approved') {
              hasApproved = true;
            }
          }
        });
        
        setDocumentStatuses(statuses);
        
        // Update verification status based on results - ADD ONLY THIS
        if (hasFailed) {
          setVerificationStatus('failed');
        } else if (hasApproved) {
          // Enable save button when any document is approved
          setVerificationStatus('success');
        } else if (Object.keys(statuses).length > 0) {
          setVerificationStatus('verifying');
        }
        
        console.log("Updated document statuses:", statuses);
      }
    } catch (error) {
      console.error('Error fetching document statuses:', error);
      setVerificationStatus('failed');
    }
  }, [uid]);

  // Set up real-time listener for document status updates
  useEffect(() => {
    if (!uid) return;

    // Initial fetch
    fetchDocumentStatuses();

    // Set up polling for real-time updates (every 5 seconds)
    const interval = setInterval(() => {
      fetchDocumentStatuses();
    }, 5000);

    return () => clearInterval(interval);
  }, [uid, fetchDocumentStatuses]);

  const fetchExistingDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      console.log("Fetching existing documents for UID:", uid);
      
      const response = await apiCall(`/tenant/details/${uid}`);
      console.log("Documents response:", response);
      
      if (response.success && response.data) {
        setFormData(prev => ({
          fullName: response.data.fullName || prev.fullName || '',
          dob: response.data.dob || prev.dob || '',
          phone: response.data.phone || prev.phone || '',
          address: response.data.address || prev.address || '',
          idType: response.data.idType || prev.idType || '',
          idProofUrl: response.data.idProofUrl || prev.idProofUrl || ''
        }));
        
        // Check if documents are already complete and user was redirected from rent button
        const returnToProperty = localStorage.getItem('returnToProperty');
        // Only require ID proof
        const hasRequiredDocuments = !!(response.data.idProofUrl);
        
        if (returnToProperty && hasRequiredDocuments) {
          // Documents are complete, redirect to rental agreement/payment
          localStorage.removeItem('returnToProperty');
          navigate(`/property/${returnToProperty}`);
          return;
        }
      } else {
        console.log("No existing documents found, showing empty form");
        // Don't show error for first-time users, just continue with empty form
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
      // Only show error if it's not a 404 (first-time user)
      if (!error.message.includes('Tenant details not found')) {
        setError('Failed to load your documents. Please refresh the page.');
      }
    } finally {
      setLoading(false);
    }
  }, [uid, navigate]);

  useEffect(() => {
    if (uid) {
      // Fetch user profile first to pre-fill name and phone
      fetchUserProfile();
      // Then fetch existing documents
      fetchExistingDocuments();
    }
  }, [uid, fetchUserProfile, fetchExistingDocuments, navigate]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
    setSuccess(false);
  };

  // Handle document deletion - ADD ONLY THIS
  const handleDeleteDocument = async (documentId, documentType) => {
    // Show confirmation dialog
    const confirmed = window.confirm('Are you sure you want to delete this document?');
    if (!confirmed) return;

    try {
      const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';
      const response = await fetch(API_BASE + '/api/tenant/delete-document/' + documentId, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + await getAuthToken(),
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (result.success) {
        console.log('Document deleted successfully:', documentId);
        
        // Clear the form data for the deleted document type
        setFormData(prev => {
          const newData = { ...prev };
          newData[documentType + 'Url'] = '';
          return newData;
        });
        
        // Re-fetch document statuses to update UI
        await fetchDocumentStatuses();
        
        // Re-fetch existing documents to update form
        await fetchExistingDocuments();
        
        // Show success message
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.message || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Delete document error:', error);
      setError(error.message);
    }
  };

  const handleFileUpload = async (fileType, file) => {
    if (!file) return;

    try {
      // Show initial upload progress and set verifying status
      setUploadProgress(prev => ({ ...prev, [fileType]: 10 }));
      setVerificationStatus('verifying');
      
      console.log('Uploading file:', file);
      
      // Use enhanced upload service with AI verification
      const result = await uploadDocumentWithVerification(file, fileType);
      
      console.log('Upload result:', result);

      // STEP 1: CHECK RESPONSE - Only update UI if backend confirms success
      if (result.success === true) {
        console.log('Upload successful, updating UI');

        // Update form data with document URL ONLY after successful response
        setFormData(prev => ({ 
          ...prev, 
          [fileType + 'Url']: result.documentUrl 
        }));
        
        // Show "verifying" status
        setUploadProgress(prev => ({ ...prev, [fileType]: 50 }));
        
        // Trigger immediate status fetch to show verification progress
        fetchDocumentStatuses();
        
        // Show success message
        setSuccess(true);
        setError('');
        
        // Set verification status to success since AI verification passed
        setVerificationStatus('success');
        
        // Reset upload progress
        setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));
        
        console.log('Upload successful, verification completed');
      } else {
        console.log('Upload failed, not updating UI:', result);
        setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));
        setVerificationStatus('failed');
        setError(result.message || 'Document upload failed');
        return;
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(prev => ({ ...prev, [fileType]: 0 }));
      setVerificationStatus('failed');
      setError(error.message || 'Document upload failed');
    }
  };

  const validateForm = () => {
    // Only require at least one field to be filled to allow saving
    const hasAnyData = Object.values(formData).some(value => value && value.trim() !== '');
    
    if (!hasAnyData) {
      setError('Please fill in at least one field before saving');
      return false;
    }
    
    setError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    console.log('Save button clicked');
    console.log('Current formData:', formData);
    
    if (!validateForm()) return;

    try {
      setSaving(true);
      
      // Always send complete form state - this ensures single document update
      const dataToSave = {
        ...formData,
        updatedAt: new Date().toISOString()
      };
      
      console.log('Sending data to backend:', dataToSave);
      
      const response = await apiCall('/tenant/details', {
        method: 'POST',
        body: JSON.stringify(dataToSave)
      });

      console.log('Backend response:', response);

      if (response.success) {
        setSuccess(true);
        setError('');
        
        console.log('Tenant details updated successfully');
        
        // Refresh the data to show updated values
        await fetchExistingDocuments();
        
        // Simple redirect check - ADD ONLY THIS
        const redirectPropertyId = localStorage.getItem("redirectAfterDocs");
        if (redirectPropertyId) {
          localStorage.removeItem("redirectAfterDocs");
          navigate(`/property/${redirectPropertyId}`);
        }
        
        // Normal success flow
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(response.message || 'Failed to save details');
      }
      
    } catch (error) {
      console.error('Save error:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  };

  // Always render the form, even if there's an error or during loading
  return (
    <div className="rental-documents">
      <h2>Rental Documents</h2>
      
      {loading && (
        <div className="rental-documents-loading">
          <div className="loading-spinner"></div>
          <p>Loading your documents...</p>
        </div>
      )}
      
      {success && (
        <div className="success-message">
          ✓ Documents saved successfully! 
          {localStorage.getItem('returnToProperty') && !!(formData.idProofUrl) ? 
            <span>Documents are complete! Redirecting to property...</span>
            : 
            <span>You can now proceed with your rental booking.</span>
          }
        </div>
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {verificationStatus === 'verifying' && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ color: '#d97706', fontSize: '16px' }}>!</span>
          <span style={{ color: '#92400e', fontSize: '14px' }}>
            File is being verified...
          </span>
        </div>
      )}

      {verificationStatus === 'success' && (
        <div style={{
          backgroundColor: '#d1fae5',
          border: '1px solid #10b981',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ color: '#059669', fontSize: '16px' }}>!</span>
          <span style={{ color: '#065f46', fontSize: '14px' }}>
            Document verified successfully
          </span>
        </div>
      )}

      {verificationStatus === 'failed' && (
        <div style={{
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ color: '#dc2626', fontSize: '16px' }}>!</span>
          <span style={{ color: '#991b1b', fontSize: '14px' }}>
            Verification failed
          </span>
        </div>
      )}

      {!loading && localStorage.getItem('returnToProperty') && !(formData.idProofUrl) && (
        <div className="warning-message">
          Please upload your ID document before proceeding with your rental booking. This is required to complete your rental application.
        </div>
      )}

      {!loading && (
        <form onSubmit={handleSubmit} className="documents-form">
          <div className="form-section">
            <h3>Personal Information</h3>
            
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                required
                placeholder="From your signup profile"
                className="prefilled"
              />
              <small className="form-hint">This name was pulled from your signup profile</small>
            </div>

            <div className="form-group">
              <label>Date of Birth *</label>
              <input
                type="date"
                value={formData.dob}
                onChange={(e) => handleInputChange('dob', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Phone Number *</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                required
                placeholder="From your signup profile"
                className="prefilled"
              />
              <small className="form-hint">This phone was pulled from your signup profile</small>
            </div>

            <div className="form-group">
              <label>Current Address *</label>
              <textarea
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                required
                rows={3}
              />
            </div>
          </div>

          
          <div className="form-section">
            <h3>Document Upload</h3>
            
            <div className="upload-group">
              <label>Government ID Type *</label>
              <select
                value={formData.idType}
                onChange={(e) => handleInputChange('idType', e.target.value)}
                required
                className="id-type-select"
              >
                <option value="">Select ID Type</option>
                <option value="aadhaar">Aadhaar Card</option>
                <option value="pan">PAN Card</option>
                <option value="passport">Passport</option>
                <option value="voter">Voter ID Card</option>
                <option value="driving">Driving License</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div className="upload-group">
              <label>Upload Selected ID Document *</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => handleFileUpload('idProof', e.target.files[0])}
                disabled={uploadProgress.idProof > 0}
              />
              <DocumentStatusDisplay 
                documentStatus={documentStatuses.idProof}
                documentType="idProof"
                uploadProgress={uploadProgress.idProof}
              />
              {documentStatuses.idProof && (
                <div className="document-summary">
                  {formatVerificationStatus(documentStatuses.idProof.status, documentStatuses.idProof.createdAt).icon} 
                  {formatVerificationStatus(documentStatuses.idProof.status, documentStatuses.idProof.createdAt).text}
                  {documentStatuses.idProof.reason && (
                    <span className="status-reason">- {getStatusDescription(documentStatuses.idProof.status, documentStatuses.idProof.reason)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteDocument(documentStatuses.idProof.documentId, 'idProof')}
                    style={{
                      marginLeft: '10px',
                      padding: '4px 8px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

                      </div>

          {formData.idProofUrl && (
            <div className="documents-overview">
              <h4>📋 Document Verification Status</h4>
              <div className="status-grid">
                <div className="status-item">
                  <span className="label">ID Proof:</span>
                  {documentStatuses.idProof ? (
                    <span className={`status ${documentStatuses.idProof.status}`}>
                      {formatVerificationStatus(documentStatuses.idProof.status, documentStatuses.idProof.createdAt).icon} 
                      {formatVerificationStatus(documentStatuses.idProof.status, documentStatuses.idProof.createdAt).text}
                    </span>
                  ) : (
                    <span className="status pending">?? Pending Verification</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <button 
            type="submit" 
            className="submit-btn"
            disabled={saving || verificationStatus !== 'success'}
          >
            {saving ? 'Saving...' : 'Save Documents'}
          </button>
        </form>
      )}
    </div>
  );
}
