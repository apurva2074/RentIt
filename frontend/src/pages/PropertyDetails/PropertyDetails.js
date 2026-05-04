import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./PropertyDetails.css";
import { useAuth } from "../../hooks/useAuth";
import { getPropertyById } from "../../services/propertiesService";
import { toggleWishlist, isWishlisted } from "../../services/wishlistService";
import { createOrGetChat } from "../../services/chatService";
import { trackPropertyView, trackPropertyInquiry } from "../../services/ownerStatsService";
import rentalService from "../../services/rentalService";
import { checkTenantDocuments } from "../../services/tenantService";
import Header from "../../MyComponent/Header";
import { getAuthToken } from "../../utils/authToken";

export default function PropertyDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  console.log("Property ID from params:", id);
  console.log("Auth state in PropertyDetails:", { 
    user: user?.email, 
    uid: user?.uid, 
    loading, 
    isLoggedIn: !!user 
  });

  const [property, setProperty] = useState(null);
  const [images, setImages] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [liked, setLiked] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(true);
  const [propertyLoading, setPropertyLoading] = useState(true);
  const [ownerInfo, setOwnerInfo] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Rental request modal state
  const [showRentalRequestModal, setShowRentalRequestModal] = useState(false);
  const [rentalRequestData, setRentalRequestData] = useState({
    proposedRent: '',
    proposedDeposit: '',
    moveInDate: ''
  });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  
  // Rent request status state
  const [rentRequestStatus, setRentRequestStatus] = useState(null);
  const [currentBooking, setCurrentBooking] = useState(null);

  useEffect(() => {
    // CRITICAL: Don't fetch until auth is ready and we have a valid ID
    if (loading || !id) {
      console.log("Waiting for auth or propertyId...", { loading, id });
      return;
    }

    const fetchDetails = async () => {
      try {
        console.log("Starting property fetch for ID:", id);
        // Add to recently viewed (for all users, not just logged in)
        const recentlyViewed = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
        const updatedViewed = [id, ...recentlyViewed.filter(viewedId => viewedId !== id)].slice(0, 10);
        localStorage.setItem('recentlyViewed', JSON.stringify(updatedViewed));

        /* 1 Fetch property from backend API (now includes media) */
        const propData = await getPropertyById(id);
        console.log("Property from API:", propData);

        /* 2 Track property view for owner statistics */
        try {
          console.log("Attempting to track view for property:", id);
          const result = await trackPropertyView(id);
          console.log("Property view tracked successfully:", result);
        } catch (viewError) {
          console.log("View tracking failed (non-critical):", viewError);
          console.log("View tracking error details:", viewError.message);
        }

        /* 3 Extract images from property data (now included from backend) */
        const imgs = propData.images || [];
        console.log("Images from property data:", imgs);

        setProperty(propData);
        setImages(imgs);

        /* 4 Fetch owner information via API */
        if (propData.owner_uid) {
          try {
            console.log(`Fetching owner info for UID: ${propData.owner_uid}`);
            const token = await getAuthToken();
            const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/users/${propData.owner_uid}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            console.log(`Owner info response status: ${response.status}`);
            
            if (response.ok) {
              const ownerData = await response.json();
              console.log(`Owner data received:`, ownerData);
              setOwnerInfo(ownerData);
            } else {
              const errorText = await response.text();
              console.error(`Owner info fetch failed (${response.status}):`, errorText);
            }
          } catch (err) {
            console.error("Owner info fetch error:", err);
          }
        }
      } catch (e) {
        console.error("Error fetching property details:", e);
      } finally {
        setPropertyLoading(false);
      }
    };

    fetchDetails();
  }, [id, user, loading]);

  useEffect(() => {
    if (!user || !id) {
      setWishlistLoading(false);
      return;
    }
    
    const checkWishlistStatus = async () => {
      try {
        setWishlistLoading(true);
        const isLiked = await isWishlisted(id);
        setLiked(isLiked);
      } catch (error) {
        console.error('Failed to check wishlist status:', error);
        // Don't set liked to false on error - keep previous state
      } finally {
        setWishlistLoading(false);
      }
    };
    
    checkWishlistStatus();
  }, [user, id]);

  // Query bookings collection to check rent request status
  useEffect(() => {
    if (!user || !id) {
      setRentRequestStatus(null);
      return;
    }
    
    const checkBookingStatus = async () => {
      try {
        const token = await getAuthToken();
        // Query bookings collection for this property and tenant
        const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/tenant/bookings`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const bookings = await response.json();
          console.log("Bookings fetched:", bookings);
          
          // Find booking for current property
          const relevantBooking = bookings.find(booking => 
            booking.propertyId === id && booking.tenantId === user.uid
          );
          
          if (relevantBooking) {
            console.log("Found relevant booking:", relevantBooking);
            setRentRequestStatus(relevantBooking.status);
            setCurrentBooking(relevantBooking);
          } else {
            console.log("No relevant booking found");
            setRentRequestStatus(null);
            setCurrentBooking(null);
          }
        } else {
          console.error("Failed to fetch bookings");
          setRentRequestStatus(null);
          setCurrentBooking(null);
        }
      } catch (error) {
        console.error('Error checking booking status:', error);
        setRentRequestStatus(null);
        setCurrentBooking(null);
      }
    };
    
    checkBookingStatus();
  }, [user, id]);

  const formatPropertyType = (type) => {
    const typeMap = {
      'apartment': 'Apartment',
      'house': 'House',
      'pg': 'PG',
      'villa': 'Villa',
      'studio': 'Studio'
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatPrice = () => {
    if (!property) return '';
    const price = property.type === "pg" ? property.rentPerPerson : property.rent;
    return property.type === "pg" 
      ? `₹${price} / person`
      : `₹${price} / month`;
  };

  const address = property ? (() => {
    // Handle different address formats
    if (!property.address) return '';
    
    // If address is already a string, return it
    if (typeof property.address === 'string') {
      return property.address;
    }
    
    // If address is an object, format it
    const parts = [
      property.address?.line || property.address?.line1,
      property.address?.city,
      property.address?.state,
      property.address?.pincode || property.address?.zipCode,
    ].filter(Boolean);
    
    return parts.join(', ');
  })() : '';

  const mapUrl = address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : '';

  const handleContactOwner = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    if (!property?.owner_uid) {
      alert('Owner information not available');
      return;
    }

    // Prevent property owners from initiating chat with themselves
    if (user.uid === property.owner_uid) {
      alert('You cannot contact yourself for your own property. Tenants will contact you directly.');
      return;
    }

    try {
      // Track property inquiry for owner statistics
      try {
        await trackPropertyInquiry(id);
        console.log("Property inquiry tracked successfully");
      } catch (inquiryError) {
        console.log("Inquiry tracking failed (non-critical):", inquiryError);
      }

      // Create or get existing chat
      const chat = await createOrGetChat(id, property.owner_uid);
      // Navigate to chat page
      navigate(`/chat/${chat.chatId}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      alert('Unable to start chat. Please try again.');
    }
  };

  const handleWishlistToggle = async () => {
    // Wait for auth to load before checking user
    if (!loading && !user) {
      navigate('/login');
      return;
    }
    
    if (wishlistLoading) {
      // Don't allow multiple clicks while loading
      return;
    }
    
    try {
      const res = await toggleWishlist(id);
      setLiked(res);
      
      // Show toast notification
      setToastMessage(res ? 'Property saved to wishlist!' : 'Property removed from wishlist');
      setShowToast(true);
      
      // Hide toast after 3 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to update wishlist:', error);
      
      // Show error toast
      setToastMessage('Failed to update wishlist. Please try again.');
      setShowToast(true);
      
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
    }
  };

  const handleScheduleVisit = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    // TODO: Implement schedule visit functionality when backend is ready
    alert('Schedule visit feature will be available soon! Please contact the property owner directly.');
  };

  const handleRentNow = async () => {
    console.log("🔍 Rent button clicked - Starting workflow");
    console.log("🔍 User:", { user: !!user, uid: user?.uid });
    console.log("🔍 Property:", { property: !!property, propertyId: id });
    console.log("🔍 Current booking status:", rentRequestStatus);
    
    // TEMPORARY DIAGNOSTIC LOGGING
    console.log('🔍 RENT BUTTON: Tenant documents state:', {
      idProofUrl: user?.idProofUrl,
      fullName: user?.fullName,
      phone: user?.phone,
      documents: user?.documents,
      isProfileComplete: !!user?.fullName && !!user?.phone && !!user?.idProofUrl
    });
    
    if (!user) {
      console.log("No user found, redirecting to login");
      navigate('/login');
      return;
    }
    
    if (!property?.owner_uid) {
      alert('Property information not available');
      return;
    }

    // 🎯 CONDITIONAL WORKFLOW - Check booking status FIRST
    console.log("🔍 Checking booking status for navigation decision");
    
    // ✅ Only rely on backend API for document verification
    try {
      console.log("Checking tenant documents for booking...");
      const documentCheck = await checkTenantDocuments(user.uid);
      console.log("Document check result:", documentCheck);
      console.log("🔍 DOCUMENT CHECK DETAILS:", {
        success: documentCheck?.success,
        hasRequiredDocuments: documentCheck?.data?.hasRequiredDocuments,
        idProofUrl: documentCheck?.data?.idProofUrl,
        message: documentCheck?.data?.message
      });
      
      if (!documentCheck.success || !documentCheck.data.hasRequiredDocuments) {
        console.log("Documents incomplete - Block booking and redirect to documents");
        
        // Show warning message
        alert("Please fill required documents before booking");
        
        // Save property ID for smart redirect after document completion
        localStorage.setItem("redirectAfterDocs", id);
        
        // Redirect to documents tab
        navigate('/dashboard?tab=rental-documents');
        return;
      }
    } catch (error) {
      console.error('Error checking documents:', error);
      alert('Failed to check documents. Please try again.');
      return;
    }

    // 🎯 MAIN CONDITIONAL LOGIC
    if (!rentRequestStatus || !currentBooking) {
      console.log("🔍 No booking exists - Create new booking");
      // No booking exists - create booking (status: "pending")
      await createNewBooking();
      return;
    }
    
    if (rentRequestStatus === 'pending') {
      console.log("🔍 Booking is pending - Show waiting message");
      alert('Your rental request is pending owner approval. Please wait for confirmation.');
      return;
    }
    
    if (rentRequestStatus === 'pending_signature') {
      console.log("🔍 Booking pending_signature - Navigate to agreement page");
      console.log('🔍 DEBUG: Current user before navigation:', user?.uid);
      console.log('🔍 DEBUG: User is authenticated:', !!user);
      
      // Navigate with authentication check and fallback
      setTimeout(() => {
        console.log('🔍 DEBUG: Navigating to agreement page:', `/tenant/agreement/${currentBooking.id}`);
        
        try {
          navigate(`/tenant/agreement/${currentBooking.id}`);
          console.log('🔍 DEBUG: React Router navigation called');
          
          // Fallback if React Router doesn't work
          setTimeout(() => {
            if (window.location.pathname.includes('/property')) {
              console.log('🔍 DEBUG: React Router failed, using window.location fallback');
              window.location.href = `/tenant/agreement/${currentBooking.id}`;
            }
          }, 1000);
        } catch (error) {
          console.error('🔍 DEBUG: Navigation failed:', error);
          window.location.href = `/tenant/agreement/${currentBooking.id}`;
        }
      }, 500);
      return;
    }
    
    if (rentRequestStatus === 'active') {
      console.log("🔍 Booking active - Navigate to payment page");
      navigate(`/tenant/payment/${currentBooking.id}`);
      return;
    }
    
    // Handle other statuses
    console.log("🔍 Unknown booking status:", rentRequestStatus);
    alert(`Booking status: ${rentRequestStatus}. Please contact support.`);
  };

  const createNewBooking = async () => {
    console.log("🔍 Creating new booking...");
    
    // Check property availability
    const availableStatuses = ['approved', 'APPROVED', 'ACTIVE', 'active', 'available', 'Available', 'AVAILABLE'];
    const propertyStatus = property.status?.toString().trim().toUpperCase();
    
    if (!availableStatuses.includes(propertyStatus)) {
      alert(`This property is not available for rent. Current status: ${property.status}`);
      return;
    }

    try {
      // Pre-fill form with current property rent and deposit
      const currentRent = property.type === 'pg' ? property.rentPerPerson : property.rent;
      const currentDeposit = property.securityDeposit || currentRent * 2;
      
      setRentalRequestData({
        proposedRent: currentRent.toString(),
        proposedDeposit: currentDeposit.toString(),
        moveInDate: ''
      });
      
      setShowRentalRequestModal(true);
      console.log("🔍 Rental request modal opened");
      
    } catch (error) {
      console.error('🚨 Error creating booking:', error);
      alert(error.message || 'Failed to start rental process. Please try again.');
    }
  };

  // Handle rental request form submission
  const handleRentalRequestSubmit = async (e) => {
    e.preventDefault();
    
    // Enhanced validation for all mandatory fields
    const proposedRent = rentalRequestData.proposedRent?.trim();
    const proposedDeposit = rentalRequestData.proposedDeposit?.trim();
    const moveInDate = rentalRequestData.moveInDate?.trim();
    
    if (!proposedRent || proposedRent === '' || parseFloat(proposedRent) <= 0) {
      alert('Please enter a valid proposed rent amount');
      return;
    }
    
    if (!proposedDeposit || proposedDeposit === '' || parseFloat(proposedDeposit) < 0) {
      alert('Please enter a valid security deposit amount');
      return;
    }
    
    if (!moveInDate || moveInDate === '') {
      alert('Please select a preferred move-in date');
      return;
    }
    
    // Additional validation: move-in date should not be in the past
    const selectedDate = new Date(moveInDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for fair comparison
    
    if (selectedDate < today) {
      alert('Move-in date cannot be in the past');
      return;
    }
    
    try {
      setSubmittingRequest(true);
      
      // Create rental booking with proposed values
      console.log("Creating rental booking with proposed values...");
      const bookingData = {
        propertyId: id,
        tenantDetails: {
          tenantId: user.uid,
          leaseDuration: 12, // Default 12 months
          rentAmount: parseFloat(proposedRent),
          moveInDate: moveInDate
        },
        agreementType: 'builtin', // Use built-in agreement
        propertyDetails: {
          title: property.title,
          address: property.address,
          rent: parseFloat(proposedRent),
          securityDeposit: parseFloat(proposedDeposit),
          type: property.type,
          bedrooms: property.bedrooms,
          owner_uid: property.owner_uid
        }
      };
      
      const booking = await rentalService.createRentalBooking(bookingData);
      console.log("Booking created:", booking);

      // Check if the response contains an error message (indicating backend error)
      if (booking && booking.message && booking.message.includes('error')) {
        throw new Error(booking.message);
      }

      // Success - booking was created successfully
      // Close modal and show success message
      setShowRentalRequestModal(false);
      alert('Rental request sent to owner for approval!');
      
      // Navigate to tenant dashboard rent requests tab
      navigate('/dashboard?tab=rent-requests');
      
    } catch (error) {
      console.error('Error submitting rental request:', error);
      alert(error.message || 'Failed to submit rental request. Please try again.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Handle form input changes
  const handleRentalRequestChange = (field, value) => {
    setRentalRequestData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading || propertyLoading) return (
    <>
      <div className="property-details-loading">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading property details...</p>
        </div>
      </div>
    </>
  );

  if (!property) return (
    <div className="property-details-error">
      <Header />
      <div className="error-container">
        <h2>Property Not Found</h2>
        <p>The property you're looking for doesn't exist or has been removed.</p>
        <button onClick={() => navigate('/listings')} className="btn-primary">
          Browse Other Properties
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Header />

      <div className="property-details-wrapper">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <a href="/listings">Properties</a>
          <span>/</span>
          <span>{property.title}</span>
        </div>

        {/* Main Content */}
        <div className="property-details-container">
          {/* Left Column - Images */}
          <div className="property-images-section">
            <div className="main-image-container">
              {images.length > 0 ? (
                <>
                  <img
                    src={images[activeIndex]?.url || images[activeIndex] || "https://images.unsplash.com/photo-1560185127-6c6d6f4b4f8d?w=1200&q=80&auto=format&fit=crop"}
                    alt={property.title || 'Property image'}
                    className="main-property-image"
                    onError={(e) => {
                      e.target.src = "https://images.unsplash.com/photo-1560185127-6c6d6f4b4f8d?w=1200&q=80&auto=format&fit=crop";
                    }}
                  />
                  <button
                    className="image-nav prev"
                    onClick={() =>
                      setActiveIndex(
                        activeIndex === 0 ? images.length - 1 : activeIndex - 1
                      )
                    }
                    disabled={images.length <= 1}
                  >
                    ‹
                  </button>
                  <button
                    className="image-nav next"
                    onClick={() =>
                      setActiveIndex(
                        activeIndex === images.length - 1 ? 0 : activeIndex + 1
                      )
                    }
                    disabled={images.length <= 1}
                  >
                    ›
                  </button>
                </>
              ) : (
                <div className="no-images">
                  <div className="no-images-icon">Camera</div>
                  <p>No images available</p>
                </div>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
              <div className="thumbnail-gallery">
                {images.map((img, i) => (
                  <img
                    key={i}
                    src={img?.url || img || "https://images.unsplash.com/photo-1560185127-6c6d6f4b4f8d?w=1200&q=80&auto=format&fit=crop"}
                    alt={`Property ${i + 1}`}
                    className={`thumbnail ${i === activeIndex ? 'active' : ''}`}
                    onClick={() => setActiveIndex(i)}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Column - Property Info */}
          <div className="property-info-section">
            {/* Header */}
            <div className="property-header">
              <div className="property-title-section">
                <h1 className="property-title">{property.title}</h1>
                <div className="property-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  {address}
                </div>
              </div>

              <div className="property-actions">
                <button
                  className={`wishlist-btn ${liked ? 'active' : ''} ${wishlistLoading ? 'loading' : ''}`}
                  onClick={handleWishlistToggle}
                  disabled={wishlistLoading}
                >
                  {wishlistLoading ? (
                    <span className="loading-spinner">⟳</span>
                  ) : liked ? (
                    <span className="heart-icon">❤️</span>
                  ) : (
                    <span className="heart-icon">🤍</span>
                  )}
                </button>
                <button className="share-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                    <polyline points="16 6 12 2 8 6"></polyline>
                    <line x1="12" y1="2" x2="12" y2="15"></line>
                  </svg>
                  Share
                </button>
              </div>
            </div>

            {/* Price */}
            <div className="price-section">
              <div className="price">
                {formatPrice()}
              </div>
              {property.securityDeposit && (
                <div className="security-deposit">
                  Security Deposit: ₹{property.securityDeposit}
                </div>
              )}
            </div>

            {/* Property Type and Tags */}
            <div className="property-tags">
              <span className="property-type">{formatPropertyType(property.type)}</span>
              {property.pgGender && (
                <span className="pg-gender">{property.pgGender}</span>
              )}
              {property.furnishing && (
                <span className="furnishing">{property.furnishing}</span>
              )}
            </div>

            {/* Key Features */}
            <div className="key-features">
              <h3>Key Features</h3>
              <div className="features-grid">
                {property.bedrooms && (
                  <div className="feature-item">
                    <span className="feature-icon">Bed</span>
                    <div className="feature-details">
                      <span className="feature-value">{property.bedrooms}</span>
                      <span className="feature-label">Bedrooms</span>
                    </div>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="feature-item">
                    <span className="feature-icon">Bath</span>
                    <div className="feature-details">
                      <span className="feature-value">{property.bathrooms}</span>
                      <span className="feature-label">Bathrooms</span>
                    </div>
                  </div>
                )}
                {property.balconies && (
                  <div className="feature-item">
                    <span className="feature-icon">Sun</span>
                    <div className="feature-details">
                      <span className="feature-value">{property.balconies}</span>
                      <span className="feature-label">Balconies</span>
                    </div>
                  </div>
                )}
                {property.squareFootage && (
                  <div className="feature-item">
                    <span className="feature-icon">Ruler</span>
                    <div className="feature-details">
                      <span className="feature-value">{property.squareFootage}</span>
                      <span className="feature-label">Sq. Ft.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {property.description && (
              <div className="description-section">
                <h3>Description</h3>
                <p className="property-description">{property.description}</p>
              </div>
            )}

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="amenities-section">
                <h3>Amenities</h3>
                <div className="amenities-grid">
                  {property.amenities.map((amenity, index) => (
                    <div key={index} className="amenity-item">
                      <span className="amenity-icon">
                        {amenity === 'parking' && 'P'}
                        {amenity === 'lift' && 'L'}
                        {amenity === 'security' && 'S'}
                        {amenity === 'gym' && 'G'}
                        {amenity === 'pool' && 'Pool'}
                        {amenity === 'wifi' && 'WiFi'}
                        {amenity === 'power_backup' && 'Power'}
                        {amenity === 'garden' && 'Garden'}
                        {amenity === 'housekeeping' && 'HK'}
                        {amenity === 'food' && 'Food'}
                        {amenity === 'laundry' && 'Laundry'}
                        {!['parking', 'lift', 'security', 'gym', 'pool', 'wifi', 'power_backup', 'garden', 'housekeeping', 'food', 'laundry'].includes(amenity) && '✓'}
                      </span>
                      <span className="amenity-name">{amenity.charAt(0).toUpperCase() + amenity.slice(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Details */}
            <div className="additional-details">
              <h3>Additional Details</h3>
              <div className="details-grid">
                {property.propertyAge && (
                  <div className="detail-item">
                    <span className="detail-label">Property Age:</span>
                    <span className="detail-value">{property.propertyAge} years</span>
                  </div>
                )}
                {property.floors && (
                  <div className="detail-item">
                    <span className="detail-label">Total Floors:</span>
                    <span className="detail-value">{property.floors}</span>
                  </div>
                )}
                {property.floorNumber && (
                  <div className="detail-item">
                    <span className="detail-label">Floor Number:</span>
                    <span className="detail-value">{property.floorNumber}</span>
                  </div>
                )}
                {property.availableDate && (
                  <div className="detail-item">
                    <span className="detail-label">Available From:</span>
                    <span className="detail-value">{new Date(property.availableDate).toLocaleDateString()}</span>
                  </div>
                )}
                {property.leaseDuration && (
                  <div className="detail-item">
                    <span className="detail-label">Lease Duration:</span>
                    <span className="detail-value">{property.leaseDuration}</span>
                  </div>
                )}
                {property.maintenanceCharge && (
                  <div className="detail-item">
                    <span className="detail-label">Maintenance:</span>
                    <span className="detail-value">₹{property.maintenanceCharge}/month</span>
                  </div>
                )}
                {property.parkingCharge && (
                  <div className="detail-item">
                    <span className="detail-label">Parking:</span>
                    <span className="detail-value">₹{property.parkingCharge}/month</span>
                  </div>
                )}
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="cta-section">
              {user?.uid !== property?.owner_uid && (
                <button className="contact-btn primary" onClick={handleContactOwner}>
                  Contact Owner
                </button>
              )}
              <button className="schedule-btn" onClick={handleScheduleVisit}>
                Schedule Visit
              </button>
              <button 
                className="rent-btn" 
                onClick={handleRentNow}
                disabled={rentRequestStatus === 'request_sent' || rentRequestStatus === 'agreement_generated'}
              >
                {rentRequestStatus === 'request_sent' ? 'Request Sent' : 
                 rentRequestStatus === 'owner_approved' ? 'Generate Agreement' :
                 rentRequestStatus === 'agreement_generated' ? 'Agreement Generated' :
                 'Rent Property'}
              </button>
            </div>
          </div>
        </div>

        {/* Location Section */}
        <div className="location-section">
          <h2>Location</h2>
          <div className="location-content">
            <div className="map-container">
              <iframe
                title="Property Location"
                src={mapUrl}
                loading="lazy"
                className="property-map"
              />
            </div>
            <div className="location-details">
              <h3>Neighborhood</h3>
              {property.nearbyPlaces && property.nearbyPlaces.length > 0 && (
                <div className="nearby-places">
                  {property.nearbyPlaces.map((place, index) => (
                    <div key={index} className="nearby-item">
                      <span className="nearby-icon">📍</span>
                      <span>{place}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Owner Information */}
        {ownerInfo && (
          <div className="owner-section">
            <h2>Property Owner</h2>
            <div className="owner-card">
              <div className="owner-avatar">
                {ownerInfo.name ? ownerInfo.name.charAt(0).toUpperCase() : 'O'}
              </div>
              <div className="owner-details">
                <h3>{ownerInfo.name || 'Property Owner'}</h3>
                <p>{ownerInfo.email || 'Contact for details'}</p>
                {ownerInfo.phone && <p>📞 {ownerInfo.phone}</p>}
              </div>
              {user?.uid !== property?.owner_uid && (
                <button className="contact-owner-btn" onClick={handleContactOwner}>
                  Contact Owner
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className="toast-notification">
          <div className="toast-content">
            <span className="toast-icon">{liked ? 'Heart' : 'Broken'}</span>
            <span className="toast-message">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && (
        <div className="modal-overlay" onClick={() => setShowContactModal(false)}>
          <div className="contact-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact Property Owner</h3>
              <button className="close-modal" onClick={() => setShowContactModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-content">
              {ownerInfo ? (
                <div className="contact-info">
                  <div className="contact-item">
                    <strong>Name:</strong> {ownerInfo.name || 'Property Owner'}
                  </div>
                  {ownerInfo.email && (
                    <div className="contact-item">
                      <strong>Email:</strong> {ownerInfo.email}
                    </div>
                  )}
                  {ownerInfo.phone && (
                    <div className="contact-item">
                      <strong>Phone:</strong> {ownerInfo.phone}
                    </div>
                  )}
                  <div className="contact-item">
                    <strong>Property:</strong> {property.title}
                  </div>
                  <div className="contact-item">
                    <strong>Address:</strong> {address}
                  </div>
                </div>
              ) : (
                <p>Contact information not available. Please login to contact the owner.</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowContactModal(false)}>
                Close
              </button>
              <button className="btn-primary">
                Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rental Request Modal */}
      {showRentalRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRentalRequestModal(false)}>
          <div className="rental-request-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Send Rental Request</h3>
              <button className="close-modal" onClick={() => setShowRentalRequestModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleRentalRequestSubmit} className="rental-request-form">
              <div className="form-content">
                <div className="property-summary">
                  <h4>{property?.title}</h4>
                  <p>{property?.type === 'pg' ? `₹${property?.rentPerPerson}/person` : `₹${property?.rent}/month`}</p>
                </div>
                
                <div className="form-group">
                  <label htmlFor="proposedRent">Proposed Rent (₹/month)*</label>
                  <input
                    type="number"
                    id="proposedRent"
                    value={rentalRequestData.proposedRent}
                    onChange={(e) => handleRentalRequestChange('proposedRent', e.target.value)}
                    required
                    min="1"
                    placeholder="Enter your proposed rent"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="proposedDeposit">Proposed Security Deposit (₹)*</label>
                  <input
                    type="number"
                    id="proposedDeposit"
                    value={rentalRequestData.proposedDeposit}
                    onChange={(e) => handleRentalRequestChange('proposedDeposit', e.target.value)}
                    required
                    min="0"
                    placeholder="Enter security deposit amount"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="moveInDate">Preferred Move-in Date*</label>
                  <input
                    type="date"
                    id="moveInDate"
                    value={rentalRequestData.moveInDate}
                    onChange={(e) => handleRentalRequestChange('moveInDate', e.target.value)}
                    required
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => setShowRentalRequestModal(false)}
                  disabled={submittingRequest}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={submittingRequest}
                >
                  {submittingRequest ? 'Sending...' : 'Send Rental Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
