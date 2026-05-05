import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './TenantAgreement.css';

const TenantAgreement = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [booking, setBooking] = useState(null);
  const [property, setProperty] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [agreement, setAgreement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1500;

  useEffect(() => {
    const fetchBooking = async () => {
      console.log('🔍 Agreement Page - Starting fetch');
      console.log('🔍 Booking ID:', bookingId);
      console.log('🔍 Current User:', user?.uid);
      console.log('🔍 Retry attempt:', retryCount + 1);
      
      if (!bookingId || !user) {
        console.log('🚨 Missing bookingId or user - staying on page');
        setLoading(false);
        return;
      }

      try {
        console.log('🔍 Fetching booking from:', `${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/booking/${bookingId}`);
        
        const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/booking/${bookingId}`, {
          headers: {
            'Authorization': `Bearer ${await user.getIdToken()}`
          }
        });
        
        console.log('🔍 Response status:', response.status);
        
        if (response.ok) {
          const responseData = await response.json();
          console.log('🔍 Response data received:', responseData);
          
          // Handle both structured response and direct booking response
          let bookingData, propertyData, agreementData;
          
          if (responseData.booking) {
            // Structured response: {booking: {...}, property: {...}, agreement: {...}}
            bookingData = responseData.booking;
            propertyData = responseData.property || null;
            agreementData = responseData.agreement || null;
            console.log('🔍 Using structured response format');
          } else {
            // Direct response: booking data with propertySnapshot included
            bookingData = responseData;
            propertyData = responseData.propertySnapshot || null;
            agreementData = responseData.agreement || null;
            console.log('🔍 Using direct response format');
          }
          
          console.log('🔍 Booking data:', bookingData);
          console.log('🔍 Property data:', propertyData);
          console.log('🔍 Agreement data:', agreementData);
          console.log('🔍 Booking status:', bookingData.status);
          
          // Debug: Log all available fields
          if (propertyData) {
            console.log('🔍 Available property fields:', Object.keys(propertyData));
            console.log('🔍 Property title field:', propertyData.title);
            console.log('🔍 Property address field:', propertyData.address);
            console.log('🔍 Property rent field:', propertyData.rent);
            console.log('🔍 Property monthlyRent field:', propertyData.monthlyRent);
            console.log('🔍 Property securityDeposit field:', propertyData.securityDeposit);
          }
          
          if (bookingData) {
            console.log('🔍 Available booking fields:', Object.keys(bookingData));
            console.log('🔍 Booking proposedRent field:', bookingData.proposedRent);
            console.log('🔍 Booking proposedDeposit field:', bookingData.proposedDeposit);
            console.log('🔍 Booking tenantDetails field:', bookingData.tenantDetails);
          }
          
          // Set booking, property, and agreement data
          setBooking(bookingData);
          setProperty(propertyData);
          setAgreement(agreementData);
          
          // Check if agreement is already signed and redirect
          if (agreementData && agreementData.signedAt) {
            console.log('🔍 Agreement already signed, redirecting to payment page');
            navigate(`/tenant/payment/${bookingId}`, { replace: true });
            return;
          }
          
          // Check if booking is already in pending_payment status
          if (bookingData.status === 'pending_payment') {
            console.log('🔍 Booking already in pending_payment status, redirecting to payment page');
            navigate(`/tenant/payment/${bookingId}`, { replace: true });
            return;
          }
          
          setLoading(false);
          console.log('✅ Booking, property, and agreement loaded successfully');
          console.log('🔍 DEBUG: Final booking status:', bookingData.status);
          console.log('🔍 DEBUG: Booking data:', bookingData);
          return; // Success - exit function
        }
        
        // If 404 or other error, retry
        if (retryCount < MAX_RETRIES) {
          console.log(`🔄 Retrying in ${RETRY_DELAY}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => fetchBooking(), RETRY_DELAY);
        } else {
          console.log('🚨 Max retries reached - giving up');
          setError('Agreement not found after multiple retries. Please try again later.');
          setLoading(false);
        }
      } catch (err) {
        console.error('🚨 Network error:', err);
        if (retryCount < MAX_RETRIES) {
          console.log(`🔄 Retrying in ${RETRY_DELAY}ms... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(prev => prev + 1);
          setTimeout(() => fetchBooking(), RETRY_DELAY);
        } else {
          console.log('🚨 Max retries reached - giving up');
          setError('Network error. Please check your connection and try again.');
          setLoading(false);
        }
      }
    };

    if (user && bookingId) {
      fetchBooking();
    }
  }, [user, bookingId, retryCount, navigate]);

  const handleAcceptAgreement = async () => {
    console.log('🔍 CRITICAL DEBUG: Agreement acceptance started');
    console.log('🔍 CRITICAL DEBUG: user:', user?.uid);
    console.log('🔍 CRITICAL DEBUG: user exists:', !!user);
    console.log('🔍 CRITICAL DEBUG: user email:', user?.email);
    
    if (!user) {
      console.log('🚨 CRITICAL ERROR: No user, redirecting to login');
      alert('Please log in to accept agreement');
      return;
    }

    // Check if booking is in correct status
    console.log('🔍 CRITICAL DEBUG: Current booking status:', booking.status);
    console.log('🔍 CRITICAL DEBUG: Expected status: pending_signature or approved_by_owner');
    
    const validStatuses = ['pending_signature', 'approved_by_owner'];
    if (!validStatuses.includes(booking.status)) {
      console.log('🚨 CRITICAL ERROR: Invalid booking status');
      alert(`Cannot accept agreement. Current status: ${booking.status}. Expected: pending_signature or approved_by_owner`);
      return;
    }

    try {
      setAccepting(true);
      
      console.log('🔍 CRITICAL DEBUG: Accepting agreement for booking:', bookingId);
      
      // Get fresh token and log it
      const token = await user.getIdToken();
      console.log('🔍 CRITICAL DEBUG: Firebase token length:', token?.length);
      console.log('🔍 CRITICAL DEBUG: Firebase token exists:', !!token);
      
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/booking/${bookingId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'pending_payment'
        })
      });
      
      console.log('🔍 CRITICAL DEBUG: Backend response status:', response.status);
      console.log('🔍 CRITICAL DEBUG: Backend response ok:', response.ok);
      console.log('🔍 CRITICAL DEBUG: Backend response headers:', Object.fromEntries(response.headers.entries()));
      console.log('🔍 CRITICAL DEBUG: Response URL:', response.url);
      console.log('🔍 CRITICAL DEBUG: Response type:', response.type);
      
      // Try to get response text first to see if we get anything
      try {
        const responseText = await response.text();
        console.log('🔍 CRITICAL DEBUG: Raw response text:', responseText);
        console.log('🔍 CRITICAL DEBUG: Response text length:', responseText.length);
        
        if (response.ok) {
          // Parse JSON only if we got text
          let result;
          try {
            result = responseText ? JSON.parse(responseText) : {};
          } catch (parseError) {
            console.error('🚨 CRITICAL ERROR: Failed to parse response JSON:', parseError);
            console.error('🚨 CRITICAL ERROR: Response text was:', responseText);
            result = {};
          }
          
          console.log('✅ CRITICAL DEBUG: Agreement accepted successfully:', result);
          
          alert('Agreement accepted! Proceeding to payment...');
          
          // Check authentication state before navigation
          console.log('🔍 CRITICAL DEBUG: Current user before navigation:', user?.uid);
          console.log('🔍 CRITICAL DEBUG: User is authenticated:', !!user);
          console.log('🔍 CRITICAL DEBUG: User email before navigation:', user?.email);
          
          // Navigate to payment page immediately - let auth state control flow
          console.log('🔍 CRITICAL DEBUG: Navigating to:', `/tenant/payment/${bookingId}`);
          console.log('🔍 CRITICAL DEBUG: Booking ID:', bookingId);
          console.log('🔍 CRITICAL DEBUG: Current pathname before navigation:', window.location.pathname);
          
          try {
            navigate(`/tenant/payment/${bookingId}`, { replace: true });
            console.log('🔍 CRITICAL DEBUG: React Router navigation called with replace: true');
          } catch (error) {
            console.error('🔍 CRITICAL DEBUG: React Router navigation failed:', error);
            // Direct fallback - use replace to prevent back navigation to agreement
            window.location.replace(`/tenant/payment/${bookingId}`);
          }
        } else {
          console.log('🚨 CRITICAL ERROR: Backend response not ok');
          console.log('🚨 CRITICAL ERROR: Response status:', response.status);
          console.log('🚨 CRITICAL ERROR: Response text:', responseText);
          
          // Check if it's auth error
          if (response.status === 401) {
            console.log('🚨 CRITICAL ERROR: 401 Unauthorized - Token expired or invalid');
            alert('Your session has expired. Please log in again.');
            navigate('/login');
            return;
          }
          
          try {
            const error = responseText ? JSON.parse(responseText) : {};
            console.error('Failed to accept agreement:', error);
            alert(error.message || 'Failed to accept agreement. Please try again.');
          } catch (e) {
            console.error('Failed to parse error response:', e);
            alert(`Failed to accept agreement: ${responseText}`);
          }
        }
      } catch (responseError) {
        console.error('🚨 CRITICAL ERROR: Failed to read response:', responseError);
        console.error('🚨 CRITICAL ERROR: Response object:', response);
        alert('Network error while accepting agreement. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting agreement:', error);
      alert('Failed to accept agreement. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleBack = () => {
    navigate('/dashboard?tab=rent-requests');
  };

  if (loading || authLoading) {
    return (
      <div className="agreement-loading">
        <div className="spinner"></div>
        <p>Loading agreement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="agreement-error">
        <h2>Error Loading Agreement</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/dashboard?tab=rent-requests')} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="agreement-error">
        <h2>Agreement Not Found</h2>
        <p>The rental agreement you're looking for is not available.</p>
        <button onClick={() => navigate('/dashboard?tab=rent-requests')} className="btn-primary">
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="tenant-agreement-page">
      <div className="agreement-container">
        <div className="agreement-header">
          <h1>Rental Agreement</h1>
          <div className="agreement-meta">
            <span className="agreement-id">Agreement #{bookingId}</span>
            <span className="agreement-date">
              {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="agreement-content">
          <div className="property-details">
            <h2>Property Details</h2>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Property Title:</label>
                <span>{property?.title || 'N/A'}</span>
              </div>
              <div className="detail-item">
                <label>Address:</label>
                <span>
                  {property?.address ? 
                    (typeof property.address === 'string' ? 
                      property.address : 
                      `${property.address?.line || ''}, ${property.address?.city || ''}, ${property.address?.state || ''} - ${property.address?.pincode || ''}`
                    ).trim() || 'N/A' : 'N/A'
                  }
                </span>
              </div>
              <div className="detail-item">
                <label>Monthly Rent:</label>
                <span>₹{booking?.proposedRent ? booking.proposedRent.toLocaleString() : (property?.rent ? property.rent.toLocaleString() : (property?.monthlyRent ? property.monthlyRent.toLocaleString() : 'N/A'))}</span>
              </div>
              <div className="detail-item">
                <label>Security Deposit:</label>
                <span>₹{booking?.proposedDeposit ? booking.proposedDeposit.toLocaleString() : (property?.securityDeposit ? property.securityDeposit.toLocaleString() : 'N/A')}</span>
              </div>
              <div className="detail-item">
                <label>Move-in Date:</label>
                <span>{booking?.tenantDetails?.moveInDate || 'Not specified'}</span>
              </div>
              <div className="detail-item">
                <label>Lease Duration:</label>
                <span>{booking?.tenantDetails?.leaseDuration || 'Not specified'} months</span>
              </div>
            </div>
          </div>

          <div className="agreement-terms">
            <h2>Rental Terms & Conditions</h2>
            <div className="terms-content">
              <h3>1. Rent Payment</h3>
              <p>The tenant agrees to pay the monthly rent amount as specified above, due on the 1st day of each month.</p>
              
              <h3>2. Security Deposit</h3>
              <p>The tenant has paid a security deposit as specified above, which will be returned within 30 days of lease termination, subject to property conditions.</p>
              
              <h3>3. Lease Duration</h3>
              <p>This rental agreement is for the duration specified above. Any extension requires mutual consent in writing.</p>
              
              <h3>4. Property Use</h3>
              <p>The tenant agrees to use the property for residential purposes only and maintain it in good condition.</p>
              
              <h3>5. Termination</h3>
              <p>Either party may terminate this agreement with 30 days written notice.</p>
            </div>
          </div>

          <div className="agreement-signature">
            <h2>Accept Agreement</h2>
            <p>By clicking "Accept Agreement", you confirm that you have read, understood, and agree to the terms and conditions outlined above.</p>
            
            <div className="agreement-actions">
              <button 
                onClick={handleBack} 
                className="btn-secondary"
                disabled={accepting}
              >
                Back to Dashboard
              </button>
              <button 
                onClick={handleAcceptAgreement} 
                className="btn-primary"
                disabled={accepting}
              >
                {accepting ? 'Accepting...' : 'Accept Agreement & Proceed to Payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantAgreement;
