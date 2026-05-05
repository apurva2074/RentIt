import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./TenantDashboard.css";

import Header from "../../MyComponent/Header";
// eslint-disable-next-line no-unused-vars
import { getWishlist, removeFromWishlist } from "../../services/wishlistService";
import { getUserDashboard } from "../../services/userDashboardService";
import { testBackendConnection } from "../../services/userDashboardService";
// eslint-disable-next-line no-unused-vars
import { getAllProperties } from "../../services/propertiesService";
import { checkTenantDocuments } from "../../services/tenantService";
import TenantChat from "./components/TenantChat";
import TenantProfile from "./components/TenantProfile";
import RentalDocuments from "./components/RentalDocuments";
import "./RentRequests.css";
import { getAuthToken } from "../../utils/authToken";
import { useAuth } from "../../hooks/useAuth";
import { markAllMessagesAsRead } from "../../services/chatService";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase/firestore";

// API service for properties
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

// API helper with auth
const apiCall = async (endpoint, options = {}) => {
  const token = await getAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE}/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tenant Dashboard API Error Response:', {
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
      
      console.error('Tenant Dashboard API Parsed Error:', errorData);
      throw new Error(errorData.message || 'API call failed');
    }

    return response.json();
  } catch (error) {
    console.error(`Tenant Dashboard API Call Failed:`, {
      url: `${API_BASE}/api${endpoint}`,
      method: options.method || 'GET',
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

export default function TenantDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, error: authError } = useAuth();

  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);
  
  // Document completion status tracking - ADD ONLY THIS
  const [documentStatus, setDocumentStatus] = useState({
    hasDocuments: false,
    isLoading: true
  });

  // Real-time agreement status tracking
  const [agreements, setAgreements] = useState({});
  
  // State declarations that were previously scattered
  const [wishlistedProperties, setWishlistedProperties] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [dashboardData, setDashboardData] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [rentRequests, setRentRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('wishlist');
  const [rentedPropertyTab, setRentedPropertyTab] = useState('details');
  const [unreadNotifications, setUnreadNotifications] = useState({});

  // Fetch dashboard data function (moved outside useEffect for reuse)
  const fetchDashboardData = useCallback(async () => {
    try {
      console.log('TenantDashboard - Fetching dashboard data...');
      
      // Test backend connectivity first
      console.log('TenantDashboard - Testing backend connectivity...');
      const backendTest = await testBackendConnection();
      if (!backendTest) {
        console.error('TenantDashboard - Backend connectivity test failed!');
        return;
      }
      
      const data = await getUserDashboard();
      console.log('TenantDashboard - Dashboard data received:', data);
      console.log('TenantDashboard - Active chats count from backend:', data?.activeChatsCount);
      console.log('TenantDashboard - Wishlist count from backend:', data?.wishlistCount);
      setDashboardData(data);
    } catch (error) {
      console.error('TenantDashboard - Error fetching dashboard data:', error);
      // Set default values if dashboard API fails
      setDashboardData({
        wishlistCount: 0,
        activeChatsCount: 0,
        rentedProperty: null,
        rentAmount: 0,
        nextRentDueDate: null,
        rentStatus: 'none',
        profileCompletion: 0
      });
    }

    // Fetch user information via API
    try {
      const userResponse = await apiCall('/users/profile');
      console.log('TenantDashboard - User profile received:', userResponse);
      setUserInfo(userResponse);
    } catch (error) {
      console.error('TenantDashboard - Error fetching user profile:', error);
    }

    // Check document completion status and show warning if needed
    try {
      const docStatus = await checkTenantDocuments();
      console.log('TenantDashboard - Document status checked:', docStatus);
      setDocumentStatus({
        hasDocuments: docStatus.hasDocuments,
        isLoading: false
      });
    } catch (error) {
      console.error('TenantDashboard - Error checking document status:', error);
      setDocumentStatus({
        hasDocuments: false,
        isLoading: false
      });
    }

    // Initialize recently viewed from localStorage
    const recentlyViewedData = localStorage.getItem('recentlyViewed');
    if (recentlyViewedData) {
      const viewedIds = JSON.parse(recentlyViewedData).slice(0, 5);
      
      if (viewedIds.length > 0) {
        try {
          // Get all properties from backend and filter by recently viewed
          const allProperties = await getAllProperties();
          const recentProperties = allProperties.filter(property => 
            viewedIds.includes(property.id)
          );
          setRecentlyViewed(recentProperties);
        } catch (error) {
          console.error("Error fetching recently viewed:", error);
        }
      }
    }

    // Initialize payment history with default structure
    setPaymentHistory({
      pastPayments: [],
      summary: {
        totalPaid: 0,
        totalPending: 0,
        nextPaymentDue: null,
        paymentStatus: 'no_agreement'
      }
    });

    setLoading(false);
  }, [setDashboardData, setUserInfo, setDocumentStatus, setLoading, setRecentlyViewed, setPaymentHistory]);

  // Authentication-aware navigation function
  const handleGenerateAgreement = (bookingId) => {
    console.log('🔍 DEBUG: Generate Agreement clicked for booking:', bookingId);
    console.log('🔍 DEBUG: Current user:', user?.uid);
    console.log('🔍 DEBUG: Auth loading:', authLoading);
    console.log('🔍 DEBUG: Auth error:', authError);
    
    if (!user || authLoading) {
      console.log('🔍 DEBUG: User not authenticated, waiting...');
      // Wait a moment for auth to stabilize
      setTimeout(() => {
        if (user) {
          console.log('🔍 DEBUG: User authenticated after delay, navigating...');
          navigateWithFallback(`/tenant/agreement/${bookingId}`);
        } else {
          console.log('🔍 DEBUG: Still not authenticated, redirecting to login');
          navigate('/login');
        }
      }, 2000);
      return;
    }
    
    console.log('🔍 DEBUG: User authenticated, navigating immediately...');
    navigateWithFallback(`/tenant/agreement/${bookingId}`);
  };

  // Fallback navigation function
  const navigateWithFallback = (path) => {
    console.log('🔍 DEBUG: Navigating to:', path);
    
    try {
      navigate(path);
      console.log('🔍 DEBUG: React Router navigation called');
      
      // Fallback if React Router doesn't work
      setTimeout(() => {
        if (window.location.pathname.includes('/dashboard')) {
          console.log('🔍 DEBUG: React Router failed, using window.location fallback');
          window.location.href = path;
        }
      }, 1000);
    } catch (error) {
      console.error('🔍 DEBUG: Navigation failed:', error);
      window.location.href = path;
    }
  };

  // General notification tracking function
  const updateTabNotification = useCallback((tabName, hasNotification) => {
    setUnreadNotifications(prev => ({
      ...prev,
      [tabName]: hasNotification
    }));
  }, []);

  // Check for notifications across all tabs
  const checkAllTabNotifications = useCallback(async () => {
    if (!user?.uid) return;

    try {
      // Check rent requests notifications
      const rentRequestsResponse = await apiCall('/rentals/tenant/bookings');
      const rentRequestsData = Array.isArray(rentRequestsResponse) ? rentRequestsResponse : (rentRequestsResponse.data || []);
      const pendingRentRequests = rentRequestsData.filter(request => 
        request.status === 'pending' || request.status === 'request_sent'
      );
      updateTabNotification('rent-requests', pendingRentRequests.length > 0);

      // Check chat notifications (active chats count)
      if (dashboardData?.activeChatsCount > 0) {
        updateTabNotification('chat', true);
      }

      // Check rental documents notifications
      // This would be based on pending documents or document status changes
      
      // Check wishlist notifications 
      // This would be based on price changes or availability changes

    } catch (error) {
      console.error('Error checking tab notifications:', error);
    }
  }, [user, dashboardData, updateTabNotification]);

  // Fetch rent requests for this tenant
  const fetchRentRequests = useCallback(async () => {
    try {
      console.log(`Fetching rent requests for user: ${user.uid}`);
      console.log('User object:', user);
      console.log('User UID:', user?.uid);
      
      if (!user?.uid) {
        console.error('No user UID available');
        setRentRequests([]);
        return;
      }
      
      // Use the correct endpoint that exists in backend
      const response = await apiCall(`/rentals/tenant/bookings`);
      console.log('Rent requests API response:', response);
      console.log('Response data:', response.data);
      console.log("Dashboard bookings response:", response.data);
      console.log("Rent request API response:", response.data);
      
      // Handle both direct array and wrapped response formats
      const rentRequestsData = Array.isArray(response) ? response : (response.data || response || []);
      console.log("Final rent requests data:", rentRequestsData);
      setRentRequests(rentRequestsData);
      
      // Track pending approvals for notification highlighting using general system
      const pendingApprovals = rentRequestsData.filter(request => 
        request.status === 'pending' || request.status === 'request_sent'
      );
      updateTabNotification('rent-requests', pendingApprovals.length > 0);
    } catch (error) {
      console.error('Error fetching rent requests:', error);
      setRentRequests([]);
    }
  }, [user, updateTabNotification]);

  // Check notifications when dashboard data changes
  useEffect(() => {
    if (dashboardData && user) {
      checkAllTabNotifications();
    }
  }, [dashboardData, user, checkAllTabNotifications]);

  // General tab click handler to clear notifications
  const handleTabClick = useCallback(async (tabName) => {
    setActiveTab(tabName);
    // Clear notification for the clicked tab
    updateTabNotification(tabName, false);
    
    // Mark all messages as read when chat tab is clicked
    if (tabName === 'chat' && user?.uid) {
      try {
        await markAllMessagesAsRead();
        console.log('All messages marked as read');
      } catch (error) {
        console.error('Failed to mark all messages as read:', error);
      }
    }
  }, [updateTabNotification, user]);

  // Cancel booking function
  const cancelBooking = async (bookingId, propertyId) => {
    try {
      console.log(`Cancelling booking: ${bookingId}`);
      const response = await apiCall(`/bookings/${bookingId}/cancel`, {
        method: 'PUT'
      });
      console.log('Cancel response:', response);
      
      if (response.success) {
        // Refresh the rent requests list
        await fetchRentRequests();
        alert('Booking cancelled successfully');
      } else {
        alert(response.message || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  // Set active tab from navigation state (when coming back from chat)
  useEffect(() => {
    if (location.state?.activeTab === 'messages') {
      setActiveTab('chat');
    }
  }, [location.state]);

  // Handle URL parameters for tab navigation
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    
    if (tabParam === 'rental-documents') {
      setActiveTab('rental-documents');
    } else if (tabParam === 'rent-requests') {
      setActiveTab('rent-requests');
    }
  }, [location.search]);

  // Fetch rent requests when tab changes to rent-requests (for refresh)
  useEffect(() => {
    if (activeTab === 'rent-requests' && user?.uid) {
      fetchRentRequests();
    }
  }, [activeTab, user?.uid, fetchRentRequests]);

  // Fetch rent requests after initial data load
  useEffect(() => {
    if (user?.uid) {
      fetchRentRequests();
    }
  }, [user?.uid, fetchRentRequests]);

  useEffect(() => {
    // Wait for auth state to be determined
    if (authLoading) return;

    // If no user after loading, redirect to login
    if (!user || !user.uid) {
      navigate('/login');
      return;
    }

    fetchDashboardData();
  }, [user, authLoading, navigate, fetchRentRequests, fetchDashboardData]);

  // Real-time agreement listeners
  useEffect(() => {
    if (!user || !dashboardData?.rentRequests) return;

    const unsubscribers = [];
    
    // Set up listeners for each booking's agreement
    dashboardData.rentRequests.forEach(request => {
      if (request.id) {
        const q = query(collection(db, 'agreements'), where('bookingId', '==', request.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const agreementDoc = snapshot.docs[0];
            setAgreements(prev => ({
              ...prev,
              [request.id]: { id: agreementDoc.id, ...agreementDoc.data() }
            }));
          } else {
            setAgreements(prev => {
              const newAgreements = { ...prev };
              delete newAgreements[request.id];
              return newAgreements;
            });
          }
        });
        unsubscribers.push(unsubscribe);
      }
    });

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [user, dashboardData?.rentRequests]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      // Refresh dashboard data when user navigates back
      if (user) {
        fetchDashboardData();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, fetchDashboardData]);

  const handlePropertyClick = (propertyId) => {
    // Add to recently viewed
    const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
    const updatedViewed = [propertyId, ...recentlyViewed.filter(id => id !== propertyId)].slice(0, 10);
    localStorage.setItem('recentlyViewed', JSON.stringify(updatedViewed));
    
    // Update React state
    setRecentlyViewed(updatedViewed);
    
    navigate(`/property/${propertyId}`);
  };

  const handleRemoveFromWishlist = async (propertyId) => {
    try {
      await removeFromWishlist(propertyId);
      const updatedWishlist = wishlistedProperties.filter(p => p.id !== propertyId);
      setWishlistedProperties(updatedWishlist);
    } catch (error) {
      console.error("Error removing from wishlist:", error);
    }
  };

  const formatPrice = (property) => {
    const price = property.type === "pg" ? property.rentPerPerson : property.rent;
    return property.type === "pg" 
      ? `₹${price} / person`
      : `₹${price} / month`;
  };

  const formatAddress = (property) => {
    if (!property.address) return 'Address not available';
    
    // If address is already a string, return it
    if (typeof property.address === 'string') {
      return property.address;
    }
    
    // If address is an object, format it
    const address = [
      property.address?.line || property.address?.line1,
      property.address?.city,
      property.address?.state,
      property.address?.pincode || property.address?.zipCode,
    ].filter(Boolean).join(", ");
    return address || 'Address not available';
  };

  const formatDate = (date) => {
    if (!date) return 'Not available';
    
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      
      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        console.warn('Invalid date provided:', date);
        return 'Invalid date';
      }
      
      // Additional validation for reasonable date range
      const currentYear = new Date().getFullYear();
      const dateYear = dateObj.getFullYear();
      
      if (dateYear < 1900 || dateYear > currentYear + 100) {
        console.warn('Date out of reasonable range:', date);
        return 'Invalid date';
      }
      
      return dateObj.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, 'Date value:', date);
      return 'Invalid date';
    }
  };

  const handleDownloadAgreement = async (agreementDetails) => {
    try {
      console.log('TenantDashboard - Downloading agreement:', agreementDetails.agreementId);
      
      // If there's a document URL, download it
      if (agreementDetails.documentUrl) {
        const link = document.createElement('a');
        link.href = agreementDetails.documentUrl;
        link.download = `Agreement-${agreementDetails.agreementId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      
      // Create placeholder PDF content
      const agreementContent = `
RENTAL AGREEMENT

Agreement ID: ${agreementDetails.agreementId}
Property: ${dashboardData?.rentedProperty?.title || 'N/A'}
Owner: ${dashboardData?.ownerDetails?.name || 'N/A'}

Agreement Period: ${formatDate(agreementDetails.startDate)} - ${formatDate(agreementDetails.endDate)}
Monthly Rent: ₹${agreementDetails.rentAmount.toLocaleString()}
Security Deposit: ₹${(agreementDetails.securityDeposit || 0).toLocaleString()}
Status: ${agreementDetails.status}

Terms and Conditions:
${agreementDetails.terms}

Created Date: ${formatDate(agreementDetails.createdAt)}
${agreementDetails.signedAt ? `Signed Date: ${formatDate(agreementDetails.signedAt)}` : ''}

---
This is a digitally generated rental agreement document.
For official purposes, please contact the property owner.
      `;
      
      // Create a blob and download
      const blob = new Blob([agreementContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Agreement-${agreementDetails.agreementId}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('TenantDashboard - Agreement downloaded successfully');
    } catch (error) {
      console.error('TenantDashboard - Error downloading agreement:', error);
      alert('Failed to download agreement. Please try again.');
    }
  };

  // Show loading state while checking auth or fetching data
  if (authLoading || loading) {
    return (
      <>
        <Header />
        <div className="tenant-dashboard-loading">
          <div className="loading-overlay">
            <div className="loading-spinner-container">
              <div className="spinner"></div>
              <p>Loading your dashboard...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // If auth error or no user after loading, don't render
  if (authError || !user || !user.uid) {
    return null;
  }

  return (
    <>
      <Header />
      
      <div className="tenant-dashboard">
        {/* Welcome Section */}
        <div className="dashboard-welcome">
          <div className="welcome-content">
            <h1>Welcome back, {userInfo?.name || 'User'}!</h1>
            <p>Find your perfect rental home with personalized recommendations</p>
          </div>
          <div className="welcome-stats">
            <div className="stat-card">
              <span className="stat-number">{dashboardData?.wishlistCount || wishlistedProperties.length || 0}</span>
              <span className="stat-label">Saved Properties</span>
            </div>
            <div className="stat-card">
              <span className="stat-number">{dashboardData?.activeChatsCount || 0}</span>
              <span className="stat-label">Active Chats</span>
            </div>
            {dashboardData?.rentedProperty && (
              <div className="stat-card">
                <span className="stat-number">House</span>
                <span className="stat-label">Rented Property</span>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Tabs - Professional Structure */}
        <div className="dashboard-tabs">
          <div className="tabs-container">
            <button 
              className={`tab ${activeTab === 'wishlist' ? 'active' : ''}`}
              onClick={() => setActiveTab('wishlist')}
            >
              Saved Properties ({dashboardData?.wishlistCount || wishlistedProperties.length})
            </button>
            <button 
              className={`tab ${activeTab === 'recent' ? 'active' : ''}`}
              onClick={() => setActiveTab('recent')}
            >
              Recently Viewed ({recentlyViewed.length})
            </button>
            <button 
              className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Profile
            </button>
            <button 
              className={`tab ${activeTab === 'chat' ? 'active' : ''} ${unreadNotifications['chat'] ? 'has-notification' : ''}`}
              onClick={() => handleTabClick('chat')}
            >
              Active Chats ({dashboardData?.activeChatsCount || 0})
            </button>
            <button 
              className={`tab ${activeTab === 'rent-requests' ? 'active' : ''} ${unreadNotifications['rent-requests'] ? 'has-notification' : ''}`}
              onClick={() => handleTabClick('rent-requests')}
            >
              Rent Requests ({rentRequests.length})
            </button>
            <button 
              className={`tab ${activeTab === 'rented-property' ? 'active' : ''}`}
              onClick={() => setActiveTab('rented-property')}
            >
              My Rental
            </button>
            <button 
              className={`tab ${activeTab === 'rental-documents' ? 'active' : ''} ${unreadNotifications['rental-documents'] ? 'has-notification' : ''}`}
              onClick={() => handleTabClick('rental-documents')}
              style={!documentStatus.isLoading && !documentStatus.hasDocuments ? {
                border: '2px solid #dc2626',
                backgroundColor: activeTab === 'rental-documents' ? '#dc2626' : '#fef2f2',
                color: activeTab === 'rental-documents' ? 'white' : '#dc2626'
              } : {}}
            >
              Rental Documents
              {!documentStatus.isLoading && !documentStatus.hasDocuments && (
                <span style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  marginLeft: '4px'
                }}>
                  Required
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'wishlist' && (
            <div className="properties-section">
              <h2>Your Saved Properties</h2>
              {wishlistedProperties.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">Heart</div>
                  <h3>No saved properties yet</h3>
                  <p>Start browsing and save properties you're interested in</p>
                  <button className="btn-primary" onClick={() => navigate('/listings')}>
                    Browse Properties
                  </button>
                </div>
              ) : (
                <div className="properties-grid">
                  {wishlistedProperties.map((property) => (
                    <div key={property.id} className="property-card">
                      <div className="property-image">
                        {property.images && property.images.length > 0 ? (
                          <img 
                            src={property.images[0]?.url || property.images[0]} 
                            alt={property.title}
                            onClick={() => handlePropertyClick(property.id)}
                          />
                        ) : (
                          <div className="no-image" onClick={() => handlePropertyClick(property.id)}>
                            No Image
                          </div>
                        )}
                        <button 
                          className="remove-wishlist"
                          onClick={() => handleRemoveFromWishlist(property.id)}
                        >
                          Heart
                        </button>
                      </div>
                      <div className="property-info">
                        <h3 onClick={() => handlePropertyClick(property.id)}>{property.title}</h3>
                        <p className="property-address">{formatAddress(property)}</p>
                        <div className="property-price">{formatPrice(property)}</div>
                        <div className="property-tags">
                          <span className="property-type">{property.type}</span>
                          {property.bedrooms && <span>{property.bedrooms} BHK</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'recent' && (
            <div className="properties-section">
              <h2>Recently Viewed Properties</h2>
              {recentlyViewed.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">View</div>
                  <h3>No recently viewed properties</h3>
                  <p>Start browsing properties to see them here</p>
                  <button className="btn-primary" onClick={() => navigate('/listings')}>
                    Browse Properties
                  </button>
                </div>
              ) : (
                <div className="properties-grid">
                  {recentlyViewed.map((property) => (
                    <div key={property.id} className="property-card">
                      <div className="property-image">
                        {property.images && property.images.length > 0 ? (
                          <img 
                            src={property.images[0]?.url || property.images[0]} 
                            alt={property.title}
                            onClick={() => handlePropertyClick(property.id)}
                          />
                        ) : (
                          <div className="no-image" onClick={() => handlePropertyClick(property.id)}>
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="property-info">
                        <h3 onClick={() => handlePropertyClick(property.id)}>{property.title}</h3>
                        <p className="property-address">{formatAddress(property)}</p>
                        <div className="property-price">{formatPrice(property)}</div>
                        <div className="property-tags">
                          <span className="property-type">{property.type}</span>
                          {property.bedrooms && <span>{property.bedrooms} BHK</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'profile' && user && user.uid && (
            <TenantProfile uid={user.uid} fallbackEmail={user.email} />
          )}

          {activeTab === 'rented-property' && (
            <div className="rented-property-section">
              {/* Rental Property Overview */}
              {dashboardData?.rentedProperty ? (
                <div className="rental-overview-section">
                  <h2>Rented Property Overview</h2>
                  
                  {/* Rented Property Tabs */}
                  <div className="rented-property-tabs">
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'details' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('details')}
                    >
                      Property Details
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'agreement' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('agreement')}
                    >
                      Rental Agreement
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'upcoming-rent' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('upcoming-rent')}
                    >
                      Upcoming Rent
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'payment-history' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('payment-history')}
                    >
                      Payment History
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'maintenance' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('maintenance')}
                    >
                      Maintenance
                    </button>
                  </div>

                  <div className="rental-overview-card">
                    {/* Property Details Tab */}
                    {rentedPropertyTab === 'details' && (
                      <div className="property-overview">
                        <div className="property-header">
                          <h3>{dashboardData.rentedProperty.title}</h3>
                          <span className={`agreement-status ${dashboardData.agreementStatus}`}>
                            {dashboardData.agreementStatus === 'active' ? 'Active' : 
                               dashboardData.agreementStatus === 'expired' ? 'Expired' : 
                               dashboardData.agreementStatus === 'pending' ? 'Pending' : 
                               'Document ' + dashboardData.agreementStatus}
                          </span>
                        </div>
                        
                        <div className="property-info-grid">
                          <div className="info-item">
                            <span className="info-label">Address</span>
                            <span className="info-value">
                              {typeof dashboardData.rentedProperty.address === 'string' 
                                ? dashboardData.rentedProperty.address 
                                : `${dashboardData.rentedProperty.address?.line1 || ''}, ${dashboardData.rentedProperty.address?.city || ''}, ${dashboardData.rentedProperty.address?.state || ''} ${dashboardData.rentedProperty.address?.pincode || ''}`
                              }
                            </span>
                          </div>
                          
                          <div className="info-item">
                            <span className="info-label">Type</span>
                            <span className="info-value">{dashboardData.rentedProperty.type}</span>
                          </div>
                          
                          {dashboardData.rentedProperty.bedrooms && (
                            <div className="info-item">
                              <span className="info-label">Bedrooms</span>
                              <span className="info-value">{dashboardData.rentedProperty.bedrooms} BHK</span>
                            </div>
                          )}
                          
                          <div className="info-item">
                            <span className="info-label">Rent Start Date</span>
                            <span className="info-value">
                              {(() => {
                                const startDate = dashboardData.rentStartDate;
                                if (!startDate) return 'Not set';
                                
                                const dateObj = startDate.toDate ? startDate.toDate() : new Date(startDate);
                                if (isNaN(dateObj.getTime())) return 'Invalid date';
                                
                                return dateObj.toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                });
                              })()}
                            </span>
                          </div>
                          
                          {dashboardData.agreementStatus && (
                            <div className="info-item">
                              <span className="info-label">Status</span>
                              <span className="info-value">{dashboardData.agreementStatus}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Rental Agreement Tab */}
                    {rentedPropertyTab === 'agreement' && (
                      <div className="rental-agreement-section">
                        <h3>Rental Agreement</h3>
                        <div className="agreement-card">
                          <div className="agreement-header">
                            <h4>Agreement Details</h4>
                          </div>
                          
                          <div className="agreement-details">
                            <div className="agreement-item">
                              <span className="agreement-label">Agreement ID:</span>
                              <span className="agreement-value">{dashboardData.agreementDetails.agreementId}</span>
                            </div>
                            <div className="agreement-item">
                              <span className="agreement-label">Property:</span>
                              <span className="agreement-value">{dashboardData?.rentedProperty?.title || 'N/A'}</span>
                            </div>
                            <div className="agreement-item">
                              <span className="agreement-label">Owner:</span>
                              <span className="agreement-value">{dashboardData?.ownerDetails?.name || 'N/A'}</span>
                            </div>
                            <div className="agreement-item">
                              <span className="agreement-label">Agreement Period:</span>
                              <span className="agreement-value">{formatDate(dashboardData.agreementDetails.startDate)} - {formatDate(dashboardData.agreementDetails.endDate)}</span>
                            </div>
                            <div className="agreement-item">
                              <span className="agreement-label">Monthly Rent:</span>
                              <span className="agreement-value">Rs{dashboardData.agreementDetails.monthlyRent?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="agreement-item">
                              <span className="agreement-label">Security Deposit:</span>
                              <span className="agreement-value">Rs{dashboardData.agreementDetails.securityDeposit?.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Upcoming Rent Reminder Tab */}
                    {rentedPropertyTab === 'upcoming-rent' && (
                      <div className="upcoming-rent-section">
                        <h3>Upcoming Rent Reminder</h3>
                        <div className="rent-reminder-card">
                          <div className="reminder-header">
                            <div className="reminder-icon">Rs</div>
                            <div className="reminder-info">
                              <h4>Next Rent Payment Due</h4>
                              <p className="due-date">
                                {(() => {
                                  const nextDueDate = dashboardData?.nextRentDueDate;
                                  if (!nextDueDate) return 'No due date available';
                                  
                                  const dateObj = nextDueDate.toDate ? nextDueDate.toDate() : new Date(nextDueDate);
                                  if (isNaN(dateObj.getTime())) return 'Invalid date';
                                  
                                  const daysUntilDue = Math.ceil((dateObj - new Date()) / (1000 * 60 * 60 * 24));
                                  const isOverdue = daysUntilDue < 0;
                                  const isDueSoon = daysUntilDue <= 7 && daysUntilDue > 0;
                                  
                                  return (
                                    <span className={`due-status ${isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : 'normal'}`}>
                                      {dateObj.toLocaleDateString('en-US', { 
                                        month: 'long', 
                                        day: 'numeric', 
                                        year: 'numeric' 
                                      })}
                                      {isOverdue && <span className="overdue-badge">OVERDUE</span>}
                                      {isDueSoon && <span className="due-soon-badge">Due Soon</span>}
                                    </span>
                                  );
                                })()}
                              </p>
                            </div>
                          </div>
                          
                          <div className="rent-details">
                            <div className="rent-amount">
                              <span className="amount-label">Monthly Rent:</span>
                              <span className="amount-value">Rs{dashboardData?.rentAmount?.toLocaleString('en-IN') || '0'}</span>
                            </div>
                            
                            <div className="rent-status">
                              <span className="status-label">Payment Status:</span>
                              <span className={`status-value ${dashboardData?.rentStatus || 'pending'}`}>
                                {dashboardData?.rentStatus === 'paid' ? 'Paid' : 
                                 dashboardData?.rentStatus === 'pending' ? 'Pending' : 
                                 dashboardData?.rentStatus || 'Pending'}
                              </span>
                            </div>
                            
                            <div className="payment-methods">
                              <span className="methods-label">Payment Methods:</span>
                              <div className="methods-list">
                                <button className="payment-method-btn primary" onClick={() => navigate(`/rent-payment/${dashboardData.rentedProperty.id}`)}>
                                  Pay Now
                                </button>
                                <button className="payment-method-btn secondary">
                                  Schedule Payment
                                </button>
                                <button className="payment-method-btn secondary">
                                  View Payment Options
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          <div className="reminder-actions">
                            <div className="notification-settings">
                              <h5>Payment Reminders</h5>
                              <div className="reminder-options">
                                <label className="reminder-option">
                                  <input type="checkbox" defaultChecked />
                                  <span>Email reminder 3 days before due</span>
                                </label>
                                <label className="reminder-option">
                                  <input type="checkbox" defaultChecked />
                                  <span>Email reminder 1 day before due</span>
                                </label>
                                <label className="reminder-option">
                                  <input type="checkbox" />
                                  <span>SMS reminder on due date</span>
                                </label>
                              </div>
                            </div>
                            
                            <div className="payment-history-link">
                              <button className="link-btn" onClick={() => setRentedPropertyTab('payment-history')}>
                                View Full Payment History
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Payment History Tab */}
                    {rentedPropertyTab === 'payment-history' && (
                      <div className="payment-history-section">
                        <h3>Payment History</h3>
                        <div className="payment-summary">
                          <div className="summary-card">
                            <div className="summary-item">
                              <span className="summary-label">Total Paid:</span>
                              <span className="summary-value paid">Rs{(paymentHistory?.reduce((sum, payment) => sum + (payment.amount || 0), 0) || 0).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Payments Made:</span>
                              <span className="summary-value">{paymentHistory?.length || 0} payments</span>
                            </div>
                            <div className="summary-item">
                              <span className="summary-label">Next Payment:</span>
                              <span className="summary-value upcoming">Rs{dashboardData?.rentAmount?.toLocaleString('en-IN') || '0'}</span>
                            </div>
                          </div>
                        </div>
                        
                        {paymentHistory && paymentHistory.length > 0 ? (
                          <div className="payment-list">
                            <div className="payment-list-header">
                              <h4>Recent Payments</h4>
                              <div className="filter-options">
                                <select className="payment-filter">
                                  <option value="all">All Payments</option>
                                  <option value="completed">Completed</option>
                                  <option value="pending">Pending</option>
                                  <option value="failed">Failed</option>
                                </select>
                              </div>
                            </div>
                            
                            {paymentHistory.map((payment, index) => (
                              <div key={index} className="payment-item">
                                <div className="payment-header">
                                  <div className="payment-date-info">
                                    <span className="payment-date">{new Date(payment.date).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    })}</span>
                                    <span className="payment-time">{new Date(payment.date).toLocaleTimeString('en-US', { 
                                      hour: '2-digit', 
                                      minute: '2-digit' 
                                    })}</span>
                                  </div>
                                  <span className={`payment-status ${payment.status}`}>
                                    {payment.status === 'completed' ? 'Paid' : 
                                     payment.status === 'pending' ? 'Pending' : 
                                     payment.status === 'failed' ? 'Failed' : 
                                     payment.status}
                                  </span>
                                </div>
                                
                                <div className="payment-details">
                                  <div className="payment-amount-info">
                                    <div className="payment-amount">Rs{payment.amount?.toLocaleString('en-IN')}</div>
                                    <div className="payment-period">{payment.period || 'Monthly Rent'}</div>
                                  </div>
                                  
                                  <div className="payment-method-info">
                                    <div className="payment-method">{payment.method || 'Online Payment'}</div>
                                    <div className="payment-id">ID: {payment.transactionId || payment.id || 'N/A'}</div>
                                  </div>
                                  
                                  <div className="payment-actions">
                                    {payment.status === 'pending' && (
                                      <button className="action-btn primary">Complete Payment</button>
                                    )}
                                    {payment.status === 'completed' && (
                                      <button className="action-btn secondary">Download Receipt</button>
                                    )}
                                    {payment.status === 'failed' && (
                                      <button className="action-btn danger">Retry Payment</button>
                                    )}
                                  </div>
                                </div>
                                
                                {payment.notes && (
                                  <div className="payment-notes">
                                    <span className="notes-label">Notes:</span>
                                    <span className="notes-text">{payment.notes}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-state-card">
                            <div className="empty-icon">Rs</div>
                            <h3>No payment history</h3>
                            <p>Your payment history will appear here once you make rent payments.</p>
                            <button className="primary-btn" onClick={() => navigate(`/rent-payment/${dashboardData.rentedProperty.id}`)}>
                              Make First Payment
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Maintenance Tab */}
                    {rentedPropertyTab === 'maintenance' && (
                      <div className="maintenance-section">
                        <h3>Maintenance Requests</h3>
                        <div className="maintenance-card">
                          <div className="empty-state">
                            <div className="empty-icon">Rs</div>
                            <h4>No maintenance requests</h4>
                            <p>If you have any maintenance issues with your rented property, you can submit them here.</p>
                            <button className="primary-btn">
                              Request Maintenance
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons - Always Visible */}
                    <div className="rental-actions">
                      <button className="action-btn primary" onClick={() => navigate(`/rent-payment/${dashboardData.rentedProperty.id}`)}>
                        Pay Rent
                      </button>
                      <button className="action-btn secondary" onClick={() => navigate(`/property/${dashboardData.rentedProperty.id}`)}>
                        View Property
                      </button>
                      <button className="action-btn secondary" onClick={() => navigate(`/chat/new/${dashboardData.ownerDetails?.uid}`)}>
                        Contact Owner
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="no-rented-property-section">
                  <h2>My Rental</h2>
                  
                  {/* Rented Property Tabs - Always Visible */}
                  <div className="rented-property-tabs">
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'details' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('details')}
                    >
                      Property Details
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'agreement' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('agreement')}
                    >
                      Rental Agreement
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'upcoming-rent' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('upcoming-rent')}
                    >
                      Upcoming Rent
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'payment-history' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('payment-history')}
                    >
                      Payment History
                    </button>
                    <button 
                      className={`rented-tab ${rentedPropertyTab === 'maintenance' ? 'active' : ''}`}
                      onClick={() => setRentedPropertyTab('maintenance')}
                    >
                      Maintenance
                    </button>
                  </div>

                  {/* Empty State Content */}
                  <div className="rental-overview-card">
                    {rentedPropertyTab === 'details' && (
                      <div className="empty-state-card">
                        <div className="empty-icon">House</div>
                        <h3>No rented property yet</h3>
                        <p>Start your rental journey by browsing available properties and connecting with owners.</p>
                        <div className="empty-actions">
                          <button className="primary-btn" onClick={() => navigate('/listings')}>
                            Browse Properties
                          </button>
                          <button className="secondary-btn" onClick={() => navigate('/wishlist')}>
                            View Wishlist
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {rentedPropertyTab === 'agreement' && (
                      <div className="empty-state-card">
                        <div className="empty-icon">Rs</div>
                        <h3>No rental agreement</h3>
                        <p>You need to have an active rental agreement to view agreement details.</p>
                        <button className="primary-btn" onClick={() => navigate('/listings')}>
                          Find Properties
                        </button>
                      </div>
                    )}
                    
                    {rentedPropertyTab === 'upcoming-rent' && (
                      <div className="empty-state-card">
                        <div className="empty-icon">Rs</div>
                        <h3>No upcoming rent</h3>
                        <p>You don't have any upcoming rent payments. Once you rent a property, you'll see payment reminders here.</p>
                        <button className="primary-btn" onClick={() => navigate('/listings')}>
                          Find Properties to Rent
                        </button>
                      </div>
                    )}
                    
                    {rentedPropertyTab === 'payment-history' && (
                      <div className="empty-state-card">
                        <div className="empty-icon">Rs</div>
                        <h3>No payment history</h3>
                        <p>Your payment history will appear here once you make rent payments for your rented property.</p>
                        <button className="primary-btn" onClick={() => navigate('/listings')}>
                          Find Properties to Rent
                        </button>
                      </div>
                    )}
                    
                    {rentedPropertyTab === 'maintenance' && (
                      <div className="empty-state-card">
                        <div className="empty-icon">Rs</div>
                        <h3>No maintenance requests</h3>
                        <p>Maintenance requests will appear here once you have a rented property and submit requests.</p>
                        <button className="primary-btn" onClick={() => navigate('/listings')}>
                          Find Properties to Rent
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'rental-documents' && user && user.uid && (
            <>
              {console.log("Rental Documents tab activated for user:", user.uid)}
              
              {/* Warning banner for incomplete documents - ADD ONLY THIS */}
              {!documentStatus.isLoading && !documentStatus.hasDocuments && (
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
                    Please complete your documents to continue booking properties
                  </span>
                </div>
              )}
              
              <RentalDocuments uid={user.uid} />
            </>
          )}

          {activeTab === 'chat' && (
            <div className="chat-section">
              <TenantChat />
            </div>
          )}

          {activeTab === 'rent-requests' && (
            <div className="rent-requests-section">
              <h2>Your Rent Requests</h2>
              
              {/* Pending Approval Notification */}
              {rentRequests.filter(request => 
                request.status === 'pending' || request.status === 'request_sent'
              ).length > 0 && (
                <div className="pending-approval-notice">
                  <div className="notice-icon">⏰</div>
                  <div className="notice-content">
                    <h3>Pending Approval</h3>
                    <p>You have {rentRequests.filter(request => 
                      request.status === 'pending' || request.status === 'request_sent'
                    ).length} rent request(s) waiting for owner approval</p>
                  </div>
                </div>
              )}
              
              {rentRequests.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">Clipboard</div>
                  <h3>No rent requests yet</h3>
                  <p>When you apply to rent properties, your requests will appear here</p>
                  <button className="btn-primary" onClick={() => navigate('/listings')}>
                    Browse Properties
                  </button>
                </div>
              ) : (
                <div className="rent-requests-list">
                  {rentRequests.map((request) => (
                    <div key={request.id} className="rent-request-card">
                      <div className="request-header">
                        <h3>{request.propertySnapshot?.title || request.propertyDetails?.title || 'Property'}</h3>
                        <span className={`status-badge ${request.status}`}>
                          {request.status === 'pending_signature' ? 'Sign Agreement' :
                           request.status === 'request_sent' ? 'Pending Approval' :
                           request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                        </span>
                      </div>
                      
                      <div className="request-details">
                        <p className="property-address">
                          {typeof request.propertySnapshot?.address === 'string' 
                            ? request.propertySnapshot.address
                            : typeof request.propertyDetails?.address === 'string'
                            ? request.propertyDetails.address
                            : `${request.propertySnapshot?.address?.line || request.propertyDetails?.address?.line || ''}, ${request.propertySnapshot?.address?.city || request.propertyDetails?.address?.city || ''}`
                          }
                        </p>
                        <p className="rent-amount">
                          Proposed Rent: ₹{request.proposedRent || request.propertySnapshot?.rent || request.propertyDetails?.rent || request.rentAmount || 'N/A'}
                        </p>
                        <p className="deposit-amount">
                          Proposed Deposit: ₹{request.proposedDeposit || request.securityDeposit || 'N/A'}
                        </p>
                        <p className="movein-date">
                          Move-in Date: {request.tenantDetails?.moveInDate ? formatDate(request.tenantDetails.moveInDate) : request.moveInDate ? formatDate(request.moveInDate) : 'Not specified'}
                        </p>
                        <p className="submitted-date">
                          Submitted: {new Date(request.createdAt?.toDate?.() || request.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      {request.status === 'request_sent' && (
                        <div className="waiting-message">
                          <p>Waiting for owner approval</p>
                        </div>
                      )}

                      <div className="request-documents">
                        <h4>Documents Submitted:</h4>
                        <div className="documents-list">
                          <span className="document-item">ID Proof</span>
                          <span className="document-item">Address Proof</span>
                          {request.documents?.incomeProof && (
                            <span className="document-item">Income Proof</span>
                          )}
                        </div>
                      </div>

                      {request.ownerMessage && (
                        <div className="owner-message">
                          <h4>Message from Owner:</h4>
                          <p>{request.ownerMessage}</p>
                        </div>
                      )}

                      <div className="request-actions">
                        {request.status === 'pending' && (
                          <button 
                            className="btn-secondary"
                            onClick={() => {
                              if (window.confirm('Are you sure you want to withdraw this rent request?')) {
                                cancelBooking(request.id, request.propertyId);
                              }
                            }}
                          >
                            Request Sent
                          </button>
                        )}
                        {request.status === 'pending_signature' && !agreements[request.id]?.signedAt && (
                          <button 
                            className="btn-primary"
                            onClick={() => handleGenerateAgreement(request.id)}
                          >
                            Generate Agreement
                          </button>
                        )}
                        {request.status === 'pending_payment' && (
                          <button 
                            className="btn-primary"
                            onClick={() => navigate(`/tenant/payment/${request.id}`)}
                          >
                            Pay Deposit
                          </button>
                        )}
                        {request.status === 'active' && (
                          <button 
                            className="btn-secondary"
                            disabled
                          >
                            Property Rented
                          </button>
                        )}
                        {request.status === 'completed' && (
                          <button 
                            className="btn-secondary"
                            disabled
                          >
                            Completed
                          </button>
                        )}
                        {request.status === 'cancelled' && (
                          <button 
                            className="btn-secondary"
                            disabled
                          >
                            Cancelled
                          </button>
                        )}
                        <button 
                          className="btn-primary"
                          onClick={() => navigate(`/property/${request.propertyId}`)}
                        >
                          View Property
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rental Agreement Section */}
        {dashboardData?.agreementDetails && (
          <div className="rental-agreement-section">
            <h2>Rental Agreement</h2>
            <div className="agreement-card">
              {/* Agreement Header */}
              <div className="agreement-header">
                <div className="agreement-title">
                  <h3>Agreement #{dashboardData.agreementDetails.agreementId}</h3>
                  <span className={`agreement-status-badge ${dashboardData.agreementDetails.status}`}>
                    {dashboardData.agreementDetails.status === 'active' ? 'Active' : 
                     dashboardData.agreementDetails.status === 'expired' ? 'Expired' : 
                     dashboardData.agreementDetails.status === 'pending' ? 'Pending' : 
                     'Document ' + dashboardData.agreementDetails.status}
                  </span>
                </div>
                <div className="agreement-actions">
                  <button className="download-btn" onClick={() => handleDownloadAgreement(dashboardData.agreementDetails)}>
                    Download Agreement
                  </button>
                </div>
              </div>

              {/* Agreement Details */}
              <div className="agreement-details">
                <div className="agreement-info-grid">
                  <div className="info-item">
                    <span className="info-label">Agreement Period</span>
                    <span className="info-value">
                      {formatDate(dashboardData.agreementDetails.startDate)} - 
                      {formatDate(dashboardData.agreementDetails.endDate)}
                    </span>
                  </div>
                  
                  <div className="info-item">
                    <span className="info-label">Monthly Rent</span>
                    <span className="info-value rent-amount">₹{dashboardData.agreementDetails.rentAmount.toLocaleString()}/month</span>
                  </div>
                  
                  <div className="info-item">
                    <span className="info-label">Security Deposit</span>
                    <span className="info-value">₹{(dashboardData.agreementDetails.securityDeposit || 0).toLocaleString()}</span>
                  </div>
                  
                  <div className="info-item">
                    <span className="info-label">Created Date</span>
                    <span className="info-value">{formatDate(dashboardData.agreementDetails.createdAt)}</span>
                  </div>
                  
                  {dashboardData.agreementDetails.signedAt && (
                    <div className="info-item">
                      <span className="info-label">Signed Date</span>
                      <span className="info-value">{formatDate(dashboardData.agreementDetails.signedAt)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Agreement Terms */}
              <div className="agreement-terms">
                <h4>Terms & Conditions</h4>
                <div className="terms-content">
                  <p>{dashboardData.agreementDetails.terms}</p>
                </div>
              </div>

              {/* Agreement Status Timeline */}
              <div className="agreement-timeline">
                <h4>Agreement Status</h4>
                <div className="timeline">
                  <div className={`timeline-item ${dashboardData.agreementDetails.status === 'pending' ? 'active' : 'completed'}`}>
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <h5>Pending</h5>
                      <p>Agreement awaiting signature</p>
                    </div>
                  </div>
                  <div className={`timeline-item ${dashboardData.agreementDetails.status === 'active' ? 'active' : 
                    dashboardData.agreementDetails.status === 'expired' ? 'completed' : 'pending'}`}>
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <h5>Active</h5>
                      <p>Agreement is currently active</p>
                    </div>
                  </div>
                  <div className={`timeline-item ${dashboardData.agreementDetails.status === 'expired' ? 'active' : 'pending'}`}>
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <h5>Expired</h5>
                      <p>Agreement period ended</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upcoming Rent Reminder */}
        {paymentHistory && (
          <div className="upcoming-rent-reminder">
            <div className="reminder-header">
              <h2>Upcoming Rent Reminder</h2>
              <div className="reminder-badge">
                {(() => {
                  if (!paymentHistory?.summary?.nextPaymentDue) {
                    return 'No Payment Due';
                  }
                  const today = new Date();
                  const dueDate = new Date(paymentHistory.summary.nextPaymentDue);
                  const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                  
                  if (daysUntilDue < 0) return 'Overdue';
                  if (daysUntilDue === 0) return 'Due Today';
                  if (daysUntilDue <= 3) return `${daysUntilDue} Days Left`;
                  if (daysUntilDue <= 7) return `${daysUntilDue} Days Left`;
                  return `${daysUntilDue} Days Left`;
                })()}
              </div>
            </div>
            
            <div className="reminder-card">
              <div className="reminder-content">
                <div className="rent-amount">
                  <span className="amount-label">Monthly Rent</span>
                  <span className="amount-value">
                    {(() => {
                      const rentAmount = paymentHistory?.summary?.totalPending > 0 ? 
                        paymentHistory.summary.totalPending : 
                        dashboardData?.rentalInfo?.rentAmount || 0;
                      return `₹${rentAmount.toLocaleString()}`;
                    })()}
                  </span>
                </div>
                
                <div className="rent-due">
                  <span className="due-label">Due Date</span>
                  <span className="due-value">
                    {(() => {
                      const dueDate = paymentHistory?.summary?.nextPaymentDue ? 
                        formatDate(paymentHistory.summary.nextPaymentDue) : 
                        'No due date';
                      return dueDate;
                    })()}
                  </span>
                </div>
                
                <div className="rent-status">
                  <span className="status-label">Status</span>
                  <span className={`status-value ${paymentHistory?.summary?.paymentStatus || 'no_agreement'}`}>
                    {(() => {
                      const status = paymentHistory?.summary?.paymentStatus || 'no_agreement';
                      const statusDisplay = {
                        'upcoming': 'Pending',
                        'overdue': 'Overdue',
                        'no_agreement': 'No Agreement',
                        'up_to_date': 'Up to date'
                      }[status] || 'Up to date';
                      
                      return statusDisplay;
                    })()}
                  </span>
                </div>
              </div>
              
              <div className="reminder-actions">
                {paymentHistory?.summary?.totalPending > 0 && (
                  <button 
                    className="pay-rent-btn primary"
                    onClick={() => navigate('/rent-payment')}
                  >
                    Pay Rent Now
                  </button>
                )}
                <button 
                  className="view-details-btn secondary"
                  onClick={() => setActiveTab('chat')}
                >
                  Contact Owner
                </button>
              </div>
            </div>
            
            {/* Payment Progress Indicator */}
            {(paymentHistory?.summary?.totalPaid > 0 || paymentHistory?.summary?.totalPending > 0) && (
              <div className="payment-progress">
                <div className="progress-header">
                  <span>Payment Progress</span>
                  <span className="progress-percentage">
                    {(() => {
                      const percentage = paymentHistory?.summary?.totalPaid > 0 ? 
                        Math.round((paymentHistory.summary.totalPaid / (paymentHistory.summary.totalPaid + paymentHistory.summary.totalPending)) * 100) : 
                        0;
                      return `${percentage}%`;
                    })()}
                  </span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ 
                      width: `${paymentHistory?.summary?.totalPaid > 0 ? 
                        Math.round((paymentHistory.summary.totalPaid / (paymentHistory.summary.totalPaid + paymentHistory.summary.totalPending)) * 100) : 
                        0}%` 
                    }}
                  ></div>
                </div>
                <div className="progress-details">
                  <span className="paid-amount">Paid: ₹{paymentHistory?.summary?.totalPaid?.toLocaleString() || 0}</span>
                  <span className="pending-amount">Pending: ₹{paymentHistory?.summary?.totalPending?.toLocaleString() || 0}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rent Payment History */}
        <div className="payment-history-section">
          <h2>Rent Payment History</h2>
          
          {/* Payment Summary */}
          {paymentHistory?.summary?.totalPaid > 0 || paymentHistory?.summary?.totalPending > 0 ? (
            <div className="payment-summary-card">
              <h3>Payment Summary</h3>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Total Paid</span>
                  <span className="summary-value paid">₹{paymentHistory?.summary?.totalPaid?.toLocaleString() || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Total Pending</span>
                  <span className="summary-value pending">₹{paymentHistory?.summary?.totalPending?.toLocaleString() || 0}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Next Payment Due</span>
                  <span className="summary-value">
                    {paymentHistory?.summary?.nextPaymentDue ? 
                      formatDate(paymentHistory.summary.nextPaymentDue) : 
                      'No upcoming payment'
                    }
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Payment Status</span>
                  <span className={`summary-status ${paymentHistory?.summary?.paymentStatus}`}>
                    {paymentHistory?.summary?.paymentStatus === 'upcoming' ? 'Upcoming' :
                     paymentHistory?.summary?.paymentStatus === 'overdue' ? 'Overdue' :
                     paymentHistory?.summary?.paymentStatus === 'no_agreement' ? 'No Agreement' :
                     'Up to date'
                    }
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state-card">
              <div className="empty-icon">Card</div>
              <h3>No payments found</h3>
              <p>Payment history will appear here once you have an active rental agreement and start making payments.</p>
              <div className="empty-actions">
                <button className="primary-btn" onClick={() => navigate('/listings')}>
                  Find a Property
                </button>
                <button className="secondary-btn" onClick={() => navigate('/profile')}>
                  Update Profile
                </button>
              </div>
            </div>
          )}

          {/* Security Deposit Status */}
          {paymentHistory?.securityDeposit && (
            <div className="security-deposit-card">
              <h3>Security Deposit</h3>
              <div className="deposit-info">
                <div className="deposit-amount">
                  <span className="deposit-label">Amount</span>
                  <span className="deposit-value">₹{paymentHistory.securityDeposit.amount.toLocaleString()}</span>
                </div>
                <div className="deposit-status">
                  <span className="deposit-label">Status</span>
                  <span className={`deposit-status-badge ${paymentHistory.securityDeposit.status}`}>
                    {paymentHistory.securityDeposit.status === 'completed' ? 'Paid' :
                     paymentHistory.securityDeposit.status === 'pending' ? 'Pending' :
                     'Failed'
                    }
                  </span>
                </div>
                {paymentHistory.securityDeposit.paidDate && (
                  <div className="deposit-date">
                    <span className="deposit-label">Paid Date</span>
                    <span className="deposit-value">{formatDate(paymentHistory.securityDeposit.paidDate)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pending Payments */}
          {paymentHistory?.pendingPayments && paymentHistory.pendingPayments.length > 0 && (
            <div className="pending-payments-card">
              <h3>Pending Payments</h3>
              <div className="payments-list">
                {paymentHistory.pendingPayments.map((payment) => (
                  <div key={payment.id} className="payment-item pending">
                    <div className="payment-info">
                      <h4>{payment.propertyTitle}</h4>
                      <p className="payment-description">{payment.description}</p>
                      <div className="payment-details">
                        <span className="payment-amount">₹{payment.amount.toLocaleString()}</span>
                        <span className="payment-due">Due: {formatDate(payment.dueDate)}</span>
                        <span className="payment-status-badge pending">Pending</span>
                      </div>
                    </div>
                    <button 
                      className="pay-now-btn"
                      onClick={() => navigate(`/rent-payment/${payment.propertyId}`)}
                    >
                      Pay Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Past Payments */}
          {paymentHistory?.pastPayments && paymentHistory.pastPayments.length > 0 && (
            <div className="past-payments-card">
              <h3>Past Payments</h3>
              <div className="payments-list">
                {paymentHistory.pastPayments.map((payment) => (
                  <div key={payment.id} className="payment-item completed">
                    <div className="payment-info">
                      <h4>{payment.propertyTitle}</h4>
                      <p className="payment-description">{payment.description}</p>
                      <div className="payment-details">
                        <span className="payment-amount">₹{payment.amount.toLocaleString()}</span>
                        <span className="payment-date">Paid: {formatDate(payment.paidDate)}</span>
                        <span className="payment-method">{payment.method || 'Online'}</span>
                        <span className="payment-status-badge completed">Paid</span>
                      </div>
                      {payment.transactionId && (
                        <p className="transaction-id">Transaction ID: {payment.transactionId}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No Payments Message */}
          {(!paymentHistory?.pastPayments || paymentHistory.pastPayments.length === 0) && 
           (!paymentHistory?.pendingPayments || paymentHistory.pendingPayments.length === 0) && (
            <div className="no-payments-card">
              <div className="no-payments-content">
                <span className="no-payments-icon">Card</span>
                <h3>No Payment History</h3>
                <p>You don't have any payment records yet. Your payment history will appear here once you start making rent payments.</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="quick-actions">
          <button className="action-btn primary" onClick={() => navigate('/listings')}>
            <span className="action-icon">Search</span>
            <span>Browse Properties</span>
          </button>
          <button className="action-btn secondary" onClick={() => navigate('/listings')}>
            <span className="action-icon">Location</span>
            <span>Search by Location</span>
          </button>
          <button className="action-btn secondary" onClick={() => navigate('/listings')}>
            <span className="action-icon">Home</span>
            <span>Property Types</span>
          </button>
        </div>
      </div>
    </>
  );
}
