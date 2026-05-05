import React, { useEffect, useState, useMemo, useCallback } from "react";
import "./OwnerDashboard.css";
import OwnerChat from "./components/OwnerChat";
import AnalyticsReports from "./components/AnalyticsReports";
import OwnerProfile from "./components/OwnerProfile";
import { signOut, getAuth } from "firebase/auth";
import { collection, onSnapshot, query, where, getDocs, serverTimestamp, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/firestore";
import { useAuth } from "../../hooks/useAuth";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { fetchUserRole } from "../../utils/fetchUserRole";
import { getOwnerDashboardSummary } from "../../services/ownerDashboardService";
import {
  editProperty,
  deleteProperty,
  togglePropertyAvailability,
  getPropertyRentHistory,
  markPropertyAsRented
} from "../../services/propertyActionsService";
import { startUnreadMessagesListener, stopUnreadMessagesListener, restartUnreadMessagesListener } from "../../services/unreadService";
import { markAllMessagesAsRead } from "../../services/chatService";

export default function OwnerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [roleChecked, setRoleChecked] = useState(false);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [editingProperty, setEditingProperty] = useState(null);
  const [rentHistoryProperty, setRentHistoryProperty] = useState(null);
  const [rentHistoryData, setRentHistoryData] = useState(null);
  const [markRentedProperty, setMarkRentedProperty] = useState(null);
  const [rentalFormData, setRentalFormData] = useState({
    tenantId: '',
    rentAmount: '',
    rentStartDate: '',
    paymentMethod: 'credit_card'
  });

  // Bank Details state
  const [bankDetails, setBankDetails] = useState(null);
  const [bankDetailsLoading, setBankDetailsLoading] = useState(false);
  const [bankDetailsForm, setBankDetailsForm] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    upiId: '',
    branchName: ''
  });
  const [isEditingBankDetails, setIsEditingBankDetails] = useState(false);
  const [bankSearchTerm, setBankSearchTerm] = useState('');
  const [showBankDropdown, setShowBankDropdown] = useState(false);
  const [highlightedBankIndex, setHighlightedBankIndex] = useState(-1);

  // Comprehensive list of authenticated Indian banks (alphabetically ordered)
  const indianBanks = [
    // A
    "ABN AMRO Bank",
    "Agricultural Bank of China",
    "Ahmednagar District Co-operative Bank",
    "Allahabad Bank",
    "Amanath Co-operative Bank",
    "Andhra Bank",
    "Andhra Pradesh Grameena Vikas Bank",
    "Apna Sahakari Bank",
    "Australian and New Zealand Banking Group",
    "AU Small Finance Bank",
    // B
    "Bandhan Bank",
    "Bank of America",
    "Bank of Baroda",
    "Bank of China",
    "Bank of India",
    "Bank of Maharashtra",
    "Bank of Nova Scotia",
    "Barclays Bank",
    "Baroda Gujarat Gramin Bank",
    "Baroda Uttar Pradesh Gramin Bank",
    "Bharat Co-operative Bank",
    "Bihar Gramin Bank",
    "BNP Paribas",
    "Bhandara Co-operative Bank",
    // C
    "Canara Bank",
    "Central Bank of India",
    "China Construction Bank",
    "Citibank",
    "Commonwealth Bank of Australia",
    "Cooperative Bank",
    "Corporation Bank",
    "Cosmos Bank",
    "Credit Agricole",
    "Credit Suisse",
    "CSB Bank",
    // D
    "DBS Bank",
    "Deutsche Bank",
    "Dena Bank",
    "Dhanlaxmi Bank",
    // E
    "Equitas Small Finance Bank",
    "ESAF Small Finance Bank",
    // F
    "Federal Bank",
    "Fincare Small Finance Bank",
    // G
    "Goldman Sachs",
    // H
    "Haryana Gramin Bank",
    "HDFC Bank",
    "HSBC Bank",
    "Himachal Pradesh Gramin Bank",
    // I
    "ICICI Bank",
    "IDBI Bank",
    "IDFC First Bank",
    "IFCI Bank",
    "Indian Bank",
    "Indian Overseas Bank",
    "Industrial and Commercial Bank of China",
    "IndusInd Bank",
    "ING Bank",
    // J
    "Jalgaon Peoples Co-operative Bank",
    "Jammu & Kashmir Bank",
    "Jammu & Kashmir Grameena Bank",
    "Jana Small Finance Bank",
    "JP Morgan Chase",
    "Jharkhand Rajya Gramin Bank",
    // K
    "Karur Vysya Bank",
    "Karnataka Gramin Bank",
    "Karnataka Vikas Gramin Bank",
    "Kerala Gramin Bank",
    "Kotak Mahindra Bank",
    // L
    // M
    "Madhya Bihar Gramin Bank",
    "Madhya Pradesh Gramin Bank",
    "Madhyanchal Gramin Bank",
    "Maharashtra Gramin Bank",
    "Merrill Lynch",
    "Mizuho Bank",
    "Morgan Stanley",
    "MUFG Bank",
    // N
    "Naupada Small Finance Bank",
    "NKGSB Co-operative Bank",
    "National Australia Bank",
    "New India Co-operative Bank",
    "North East Small Finance Bank",
    // O
    "Oriental Bank of Commerce",
    // P
    "Prathama UP Gramin Bank",
    "Punjab & Maharashtra Co-operative Bank",
    "Punjab & Sind Bank",
    "Punjab Gramin Bank",
    "Punjab National Bank",
    // R
    "Rajmahal Co-operative Bank",
    "RBL Bank",
    "Royal Bank of Scotland",
    "Rupee Co-operative Bank",
    "Raigad District Co-operative Bank",
    "Ratnagiri District Co-operative Bank",
    // S
    "Sahebrao Mahadev Co-operative Bank",
    "Saraswat Bank",
    "Sarva Haryana Gramin Bank",
    "Satara Co-operative Bank",
    "Shamrao Vithal Co-operative Bank",
    "Shivalik Small Finance Bank",
    "Sindhudurg District Co-operative Bank",
    "Societe Generale",
    "Solapur District Co-operative Bank",
    "South Indian Bank",
    "Standard Chartered Bank",
    "State Bank of India",
    "Sumitomo Mitsui Banking Corporation",
    "Suryoday Small Finance Bank",
    // T
    "Tamilnad Mercantile Bank",
    "Tamil Nadu Grama Bank",
    "Telangana Grameena Bank",
    "Thane District Central Co-operative Bank",
    // U
    "UBS AG",
    "UCO Bank",
    "Ujjivan Small Finance Bank",
    "Union Bank of India",
    "United Bank of India",
    "United Overseas Bank",
    "Utkarsh Small Finance Bank",
    "Uttar Bihar Gramin Bank",
    "Uttarakhand Gramin Bank",
    "Uttaranchal Gramin Bank",
    // V
    "Vananchal Gramin Bank",
    "Vijaya Bank",
    // W
    "Westpac Banking Corporation",
    // Y
    "YES Bank",
    // Z
    // Additional Banks (to be added if needed)
  ];

  // Filter banks based on search term
  const filteredBanks = indianBanks.filter(bank =>
    bank.toLowerCase().includes(bankSearchTerm.toLowerCase())
  );

  // Handle bank selection
  const handleBankSelect = (bankName) => {
    setBankDetailsForm(prev => ({ ...prev, bankName }));
    setBankSearchTerm(bankName);
    setShowBankDropdown(false);
    setHighlightedBankIndex(-1);
  };

  // Handle input change
  const handleBankInputChange = (e) => {
    const value = e.target.value;
    setBankSearchTerm(value);
    setShowBankDropdown(true);
    setHighlightedBankIndex(-1);

    // Update form value if it matches a bank exactly
    const matchingBank = indianBanks.find(bank =>
      bank.toLowerCase() === value.toLowerCase()
    );
    if (matchingBank) {
      setBankDetailsForm(prev => ({ ...prev, bankName: matchingBank }));
    }
  };

  // Handle keyboard navigation
  const handleBankKeyDown = (e) => {
    const banks = filteredBanks;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedBankIndex(prev =>
          prev < banks.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedBankIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedBankIndex >= 0 && banks[highlightedBankIndex]) {
          handleBankSelect(banks[highlightedBankIndex]);
        }
        break;
      case 'Escape':
        setShowBankDropdown(false);
        setHighlightedBankIndex(-1);
        break;
      default:
        // Handle other keys if needed
        break;
    }
  };

  // Handle input focus
  const handleBankInputFocus = () => {
    setShowBankDropdown(true);
    setHighlightedBankIndex(-1);
  };

  // Handle click outside
  const handleBankDropdownBlur = (e) => {
    setTimeout(() => setShowBankDropdown(false), 200);
  };

  // Rental requests state - now categorized
  const [allBookings, setAllBookings] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeAgreements, setActiveAgreements] = useState([]);
  const [completedBookings, setCompletedBookings] = useState([]);
  const [rentalRequestsLoading, setRentalRequestsLoading] = useState(false);


  // Dashboard data from single API
  const [dashboardData, setDashboardData] = useState({
    totalProperties: 0,
    availableProperties: 0,
    rentedProperties: 0,
    properties: [],
    rentedPropertiesWithTenants: [],
    earningsSummary: {
      totalMonthlyEarnings: 0,
      averageRentPerProperty: 0,
      occupancyRate: 0
    },
    recentActivities: []
  });
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('properties');

  // Unread messages state
  const [unreadCount, setUnreadCount] = useState(0);

  // Notification state for tab highlighting
  const [unreadNotifications, setUnreadNotifications] = useState({});

  const navigate = useNavigate();
  const location = useLocation();

  // Set active tab from navigation state (when coming back from chat)
  useEffect(() => {
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }
  }, [location.state]);

  // Unread messages listener
  useEffect(() => {
    if (user?.uid) {
      startUnreadMessagesListener(user.uid, setUnreadCount);
      return () => stopUnreadMessagesListener();
    }
  }, [user]);

  // Retry unread messages listener after delay (in case index was created after page load)
  useEffect(() => {
    if (user?.uid && unreadCount === 0) {
      const timer = setTimeout(() => {
        console.log('🔄 Retrying unread messages listener after delay...');
        restartUnreadMessagesListener(user.uid, setUnreadCount);
      }, 10000); // retry after 10 seconds
      return () => clearTimeout(timer);
    }
  }, [user, unreadCount]);

  // General notification tracking function
  const updateTabNotification = useCallback((tabName, hasNotification) => {
    setUnreadNotifications(prev => ({
      ...prev,
      [tabName]: hasNotification
    }));
  }, [setUnreadNotifications]);

  // Check for notifications across all tabs
  const checkAllTabNotifications = useCallback(async () => {
    if (!user?.uid) return;

    try {
      // Check rental requests notifications
      if (pendingRequests.length > 0) {
        const pendingCount = pendingRequests.filter(request =>
          request.status === 'pending' || request.status === 'request_sent'
        ).length;
        updateTabNotification('rental-requests', pendingCount > 0);
      }

      // Check bank details notifications (if verification needed)
      // This would be based on bank verification status changes
      // For now, bank details tab doesn't need notifications

      // Check chat notifications (active chats count)
      if (dashboardData?.activeChatsCount > 0) {
        updateTabNotification('chat', true);
      }

      // Check analytics notifications (new insights, reports)
      // This would be based on new analytics data or reports

      // Check properties notifications (maintenance requests, issues)
      // This would be based on property status changes or issues

    } catch (error) {
      console.error('Error checking owner tab notifications:', error);
    }
  }, [user, pendingRequests, dashboardData, updateTabNotification]);

  // General tab click handler to clear notifications
  const handleTabClick = useCallback(async (tabName) => {
    setActiveTab(tabName);
    // Clear notification for the clicked tab
    updateTabNotification(tabName, false);

    // Mark all messages as read when Messages tab is clicked
    if (tabName === 'chat' && user?.uid) {
      // Immediately clear unread badge and mark all messages as read globally
      setUnreadCount(0);
      try {
        await markAllMessagesAsRead();
        console.log('All messages marked as read for owner');
      } catch (error) {
        console.error('Failed to mark all messages as read for owner:', error);
      }
    }
  }, [updateTabNotification, user]);

  // Auth and role guard
  useEffect(() => {
    // Wait for auth state to be determined
    if (authLoading) return;

    // If no user after loading, redirect to login
    if (!user) {
      console.log('OwnerDashboard - No user, redirecting to login');
      navigate("/login");
      return;
    }

    // Check user role
    const checkRole = async () => {
      try {
        console.log('OwnerDashboard - Checking role for user:', user.uid);
        const role = await fetchUserRole(user.uid);
        console.log('OwnerDashboard - User role from Firestore:', role);

        if (!role) {
          console.error('OwnerDashboard - No role found for user');
          alert('Unable to verify your account role. Please contact support.');
          navigate("/login");
          return;
        }

        if (role !== "owner") {
          console.log('OwnerDashboard - Role mismatch, redirecting to tenant dashboard. User role:', role);
          navigate("/dashboard");
          return;
        }

        console.log('OwnerDashboard - Role match, allowing owner access');
        setRoleChecked(true);
      } catch (error) {
        console.error('OwnerDashboard - Error checking role:', error);
        // Handle permission errors
        if (error.code === 'permission-denied' || error.message?.includes('permission') || error.message?.includes('Missing or insufficient permissions')) {
          alert('Permission error: Unable to verify your account. Please ensure your account is properly set up.');
        }
        navigate("/login");
      }
    };

    checkRole();
  }, [user, authLoading, navigate]);

  // Removed property media listener - now using backend API only

  // Removed direct Firestore query - now using backend API only

  // Fetch dashboard data from single API
  useEffect(() => {
    if (!user || !user.uid) return;

    const fetchDashboardData = async () => {
      try {
        console.log("Fetching dashboard summary from single API...");
        const response = await getOwnerDashboardSummary();
        console.log("Received dashboard data:", response);

        // Backend returns data directly, not wrapped in success/data
        if (response && typeof response === 'object') {
          setDashboardData(response);
          // Set properties from backend API response with validation
          const backendProperties = Array.isArray(response.properties) ? response.properties : [];
          setProperties(backendProperties);
          console.log("Set properties from backend:", backendProperties.length);
          console.log("Dashboard stats:", {
            total: response.totalProperties || 0,
            rented: response.rentedProperties || 0,
            available: response.availableProperties || 0
          });
        } else {
          console.warn('Invalid response format from backend:', response);
          setDashboardData({
            totalProperties: 0,
            rentedProperties: 0,
            availableProperties: 0,
            totalMonthlyEarnings: 0,
            properties: [],
            rentedPropertiesWithTenants: [],
            earningsSummary: {
              totalMonthlyEarnings: 0,
              averageRentPerProperty: 0,
              occupancyRate: 0
            },
            recentActivities: []
          });
          setProperties([]);
        }
        setDashboardLoading(false);
        setLoading(false); // Also set main loading to false
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setDashboardData({
          totalProperties: 0,
          rentedProperties: 0,
          availableProperties: 0,
          properties: [],
          rentedPropertiesWithTenants: [],
          earningsSummary: {
            totalMonthlyEarnings: 0,
            averageRentPerProperty: 0,
            occupancyRate: 0
          },
          recentActivities: []
        });
        setDashboardLoading(false);
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user, refreshKey]);

  // Filter properties
  const filteredProperties = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return properties;

    return properties.filter(p =>
      (p.title || "").toLowerCase().includes(term) ||
      (p.address?.city || "").toLowerCase().includes(term) ||
      (p.type || "").toLowerCase().includes(term)
    );
  }, [properties, searchTerm]);

  const handlePropertyDelete = async (property) => {
    try {
      await deleteProperty(property.id);
      setRefreshKey(prev => prev + 1);
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting property:", error);
      alert("Failed to delete property: " + error.message);
    }
  };

  const handleEditProperty = (property) => {
    setEditingProperty(property);
  };

  const handleToggleAvailability = async (property) => {
    try {
      const newStatus = property.status === 'available' ? 'unavailable' : 'available';
      await togglePropertyAvailability(property.id, newStatus);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Error toggling availability:", error);
      alert("Failed to update availability: " + error.message);
    }
  };

  const handleViewRentHistory = async (property) => {
    try {
      const data = await getPropertyRentHistory(property.id);
      setRentHistoryData(data);
      setRentHistoryProperty(property);
    } catch (error) {
      console.error("Error fetching rent history:", error);
      alert("Failed to fetch rent history: " + error.message);
    }
  };

  const handleMarkAsRented = (property) => {
    setMarkRentedProperty(property);
    setRentalFormData({
      tenantId: '',
      rentAmount: property.rent || property.monthlyRent || '',
      rentStartDate: '',
      paymentMethod: 'credit_card'
    });
  };

  const handleSaveRental = async () => {
    try {
      await markPropertyAsRented(markRentedProperty.id, rentalFormData);
      setMarkRentedProperty(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Error marking property as rented:", error);
      alert("Failed to mark property as rented: " + error.message);
    }
  };

  const handleSaveProperty = async (propertyData) => {
    try {
      await editProperty(editingProperty.id, propertyData);
      setEditingProperty(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Error saving property:", error);
      alert("Failed to save property: " + error.message);
    }
  };

  // fetchBankDetails function removed - now using real-time listener

  // Save or update bank details
  const handleSaveBankDetails = async () => {
    if (!user || !user.uid) {
      alert('Please log in to save bank details');
      return;
    }

    // Validate required fields
    if (!bankDetailsForm.accountHolderName.trim() ||
      !bankDetailsForm.bankName.trim() ||
      !bankDetailsForm.accountNumber.trim() ||
      !bankDetailsForm.ifsc.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setBankDetailsLoading(true);
      console.log('🔍 Saving bank details for owner:', user.uid);

      // Direct document access using user.uid as document ID
      const ownerRef = doc(db, "users", user.uid);
      const ownerSnap = await getDoc(ownerRef);

      if (ownerSnap.exists()) {
        const ownerData = ownerSnap.data();

        // Verify user is owner before saving bank details
        if (ownerData.role === 'owner') {
          const bankDetailsData = {
            accountHolderName: bankDetailsForm.accountHolderName.trim(),
            bankName: bankDetailsForm.bankName.trim(),
            accountNumber: bankDetailsForm.accountNumber.trim(),
            ifsc: bankDetailsForm.ifsc.trim(),
            upiId: bankDetailsForm.upiId.trim(),
            branchName: bankDetailsForm.branchName.trim(),
            isVerified: false,
            updatedAt: serverTimestamp()
          };

          console.log('🔍 SAVING BANK DETAILS:');
          console.log('  - bankDetailsData:', bankDetailsData);
          console.log('  - bankDetailsData.bankName:', bankDetailsData.bankName);
          console.log('  - bankDetailsForm.bankName (source):', bankDetailsForm.bankName);

          await updateDoc(ownerRef, {
            bankDetails: bankDetailsData
          });

          console.log('✅ AFTER SAVE – Firestore updated, waiting for real-time listener');

          // Real-time listener will automatically update bankDetails state
          setIsEditingBankDetails(false);

          console.log('✅ Bank details saved successfully');
          console.log('✅ Bank details state after save:', bankDetailsData);
          console.log('✅ Bank details state variable:', bankDetails);

          alert('Bank details saved successfully!');
        } else {
          console.log('🚨 User is not an owner, cannot save bank details');
          alert('Only owners can save bank details.');
        }
      } else {
        alert('Owner profile not found. Please complete your profile first.');
      }
    } catch (error) {
      console.error('🚨 Error saving bank details:', error);
      alert('Failed to save bank details. Please try again.');
    } finally {
      setBankDetailsLoading(false);
    }
  };

  // Handle bank details form input changes
  const handleBankDetailsInputChange = (field, value) => {
    setBankDetailsForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Mask account number for display
  const maskAccountNumber = (accountNumber) => {
    if (!accountNumber || accountNumber.length < 4) return accountNumber;
    return `****-****-${accountNumber.slice(-4)}`;
  };

  // Real-time listener for bank details (most robust solution)
  useEffect(() => {
    if (!user?.uid) return;

    setBankDetailsLoading(true);
    const ownerRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(ownerRef, (docSnap) => {
      console.log('🔍 BANK DETAILS DIAGNOSTIC - Real-time listener triggered:');
      console.log('  - docSnap.exists():', docSnap.exists());

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('🔍 BANK DETAILS DIAGNOSTIC:');
        console.log('  - ownerData.role:', data.role);
        console.log('  - ownerData.bankDetails:', data.bankDetails);
        console.log('  - ownerData.bankDetails?.bankName:', data.bankDetails?.bankName);

        if (data.role === 'owner') {
          const bank = data.bankDetails || null;
          console.log('🔔 Real-time bank details update:', bank);
          setBankDetails(bank);

          if (bank) {
            const updatedForm = {
              accountHolderName: bank.accountHolderName || '',
              bankName: bank.bankName || '',
              accountNumber: bank.accountNumber || '',
              ifsc: bank.ifsc || '',
              upiId: bank.upiId || '',
              branchName: bank.branchName || '',
            };
            setBankDetailsForm(updatedForm);
            console.log('📝 bankDetailsForm after real-time update:', updatedForm);
            console.log('📝 bankDetailsForm.bankName after update:', updatedForm.bankName);
          }
        }
      }
      setBankDetailsLoading(false);
    }, (error) => {
      console.error('Bank details listener error:', error);
      setBankDetails(null);
      setBankDetailsLoading(false);
    });

    return unsubscribe;
  }, [user?.uid]);

  // Debug bankDetails state changes
  useEffect(() => {
    console.log('🔄 bankDetails state changed:', bankDetails);
    console.log('🔄 bankDetails?.bankName:', bankDetails?.bankName);
  }, [bankDetails]);

  // Check notifications when rental requests change
  useEffect(() => {
    if (pendingRequests.length > 0) {
      checkAllTabNotifications();
    }
  }, [pendingRequests, checkAllTabNotifications]);

  // Check notifications when dashboard data changes
  useEffect(() => {
    if (dashboardData && user) {
      checkAllTabNotifications();
    }
  }, [dashboardData, user, checkAllTabNotifications]);

  // Fetch rental requests for this owner
  const fetchRentalRequests = useCallback(async () => {
    if (!user || !user.uid) {
      console.log("🔍 DEBUG: No user or UID, skipping fetch");
      return;
    }

    try {
      console.log("🔍 DEBUG: Starting fetchRentalRequests for owner:", user.uid);
      setRentalRequestsLoading(true);
      const token = await user.getIdToken();

      const apiUrl = `${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/owner/requests`;
      console.log("🔍 DEBUG: Making API call to:", apiUrl);

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log("🔍 DEBUG: API response status:", response.status);

      if (!response.ok) {
        throw new Error(`Failed to fetch rental requests: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("🔍 DEBUG: API response data:", data);

      if (data.success && data.data) {
        console.log("🔍 DEBUG: Setting categorized bookings:");
        console.log("- All bookings:", data.data.allBookings?.length || 0);
        console.log("- Pending requests:", data.data.pendingRequests?.length || 0);
        console.log("- Active agreements:", data.data.activeAgreements?.length || 0);
        console.log("- Completed bookings:", data.data.completedBookings?.length || 0);

        // Update all categorized states
        setAllBookings(data.data.allBookings || []);
        setPendingRequests(data.data.pendingRequests || []);
        setActiveAgreements(data.data.activeAgreements || []);
        setCompletedBookings(data.data.completedBookings || []);
      } else {
        console.warn("🔍 DEBUG: Unexpected response format:", data);
        // Fallback to old format for backward compatibility
        setAllBookings(data.requests || []);
        setPendingRequests(data.requests || []);
        setActiveAgreements([]);
        setCompletedBookings([]);
      }

    } catch (error) {
      console.error('🔍 DEBUG: Error fetching rental requests:', error);
      // Reset all states on error
      setAllBookings([]);
      setPendingRequests([]);
      setActiveAgreements([]);
      setCompletedBookings([]);
    } finally {
      setRentalRequestsLoading(false);
      console.log("🔍 DEBUG: fetchRentalRequests completed");
    }
  }, [user]);

  // Real-time bookings listener - FIXED VERSION (no orderBy to avoid composite index)
  useEffect(() => {
    if (!user || !user.uid) {
      console.log("🔍 DEBUG: No user or UID, skipping real-time listener setup");
      return;
    }

    console.log("🔍 DEBUG: Setting up real-time bookings listener for owner:", user.uid);
    console.log("🔍 DEBUG: Owner UID:", user?.uid);

    const bookingsQuery = query(
      collection(db, "bookings"),
      where("ownerId", "==", user.uid),
      where("status", "==", "pending") // CRITICAL: Filter for pending requests only
      // REMOVED: orderBy("createdAt", "desc") to avoid composite index
    );

    console.log("🔍 DEBUG: Query created with filters:", {
      collection: "bookings",
      ownerId: user.uid,
      status: "pending"
    });

    const unsubscribe = onSnapshot(
      bookingsQuery,
      (snapshot) => {
        console.log("🔍 DEBUG: Real-time update received");
        console.log("🔍 DEBUG: Snapshot size:", snapshot.size);
        console.log("🔍 DEBUG: Snapshot docs count:", snapshot.docs.length);

        if (snapshot.size === 0) {
          console.log("🔍 DEBUG: No pending bookings found for this owner");
          setPendingRequests([]);
          setActiveAgreements([]);
          setCompletedBookings([]);
          setRentalRequestsLoading(false);
          return;
        }

        console.log("🔍 DEBUG: Raw booking data from Firestore:");
        snapshot.docs.forEach(doc => {
          console.log("- Booking ID:", doc.id, "Data:", doc.data());
        });

        // Map documents and sort locally (client-side sorting)
        const pendingRequestsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Sort by createdAt descending (newest first) - CLIENT SIDE SORTING
        const sortedPendingRequests = pendingRequestsData.sort((a, b) => {
          const aTime = a.createdAt?.seconds || a.createdAt?._seconds || 0;
          const bTime = b.createdAt?.seconds || b.createdAt?._seconds || 0;
          return bTime - aTime; // Descending order (newest first)
        });

        console.log("🔍 DEBUG: Processed pending requests:", sortedPendingRequests);
        console.log("🔍 DEBUG: Setting pendingRequests with", sortedPendingRequests.length, "items");

        setPendingRequests(sortedPendingRequests);
        setCompletedBookings([]);
        setRentalRequestsLoading(false);
      },
      (error) => {
        console.error("🔍 DEBUG: Real-time listener error:", error);
        console.error("🔍 DEBUG: Error details:", {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        setRentalRequestsLoading(false);

        // Fallback to API call on real-time error
        console.log("🔍 DEBUG: Falling back to API call due to real-time error");
        fetchRentalRequests();
      }
    );

    return () => {
      console.log("🔍 DEBUG: Cleaning up real-time listener");
      unsubscribe();
    };
  }, [user, user?.uid, activeTab, fetchRentalRequests]);

  // Real-time listener for active/confirmed bookings (agreements)
  useEffect(() => {
    if (!user?.uid) return;

    console.log("🔍 DEBUG: Setting up real-time active agreements listener for owner:", user.uid);

    const activeBookingsQuery = query(
      collection(db, "bookings"),
      where("ownerId", "==", user.uid),
      where("status", "in", ["confirmed", "active"])
    );

    const unsubscribe = onSnapshot(activeBookingsQuery, (snapshot) => {
      const activeBookings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort by confirmedAt or createdAt descending
      activeBookings.sort((a, b) => {
        const timeA = a.confirmedAt?.seconds || a.createdAt?.seconds || 0;
        const timeB = b.confirmedAt?.seconds || b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      console.log("🔍 DEBUG: Active agreements updated:", activeBookings.length, "items");
      setActiveAgreements(activeBookings);
    }, (error) => {
      console.error("Real-time active agreements listener error:", error);
      // Fallback to API fetch
      fetchRentalRequests();
    });

    return () => unsubscribe();
  }, [user?.uid, fetchRentalRequests]);

  // Refresh analytics when active agreements change
  useEffect(() => {
    if (activeAgreements.length > 0 && user?.uid) {
      console.log("🔍 DEBUG: Refreshing analytics due to active agreements change");
      const fetchDashboardData = async () => {
        try {
          console.log("Fetching dashboard summary after active agreements update...");
          const response = await getOwnerDashboardSummary();
          
          if (response && response.success) {
            setProperties(response.properties || []);
            setBankDetails(response.bankDetails || null);
            setBankDetailsLoading(false);
          }
        } catch (error) {
          console.error("Error refreshing dashboard after agreements update:", error);
        }
      };

      fetchDashboardData();
    }
  }, [activeAgreements.length, user?.uid]);

  // Fetch rental requests when rental-requests tab is active (fallback)
  useEffect(() => {
    if (activeTab === 'rental-requests' && user && user.uid) {
      // Only fetch if real-time listener hasn't been set up (fallback)
      if (!user?.uid) return;

      // Small delay to let real-time listener kick in first
      const timeoutId = setTimeout(() => {
        if (rentalRequestsLoading && allBookings.length === 0) {
          console.log("🔍 DEBUG: Real-time listener didn't update, using API fallback");
          fetchRentalRequests();
        }
      }, 2000);

      return () => clearTimeout(timeoutId);
    }
  }, [activeTab, user, fetchRentalRequests, rentalRequestsLoading, allBookings.length]);

  const handleRentalRequestResponse = async (bookingId, action) => {
    if (!user || !user.uid) return;

    if (action === 'accept' && !bankDetails) {
      alert('⚠️ Bank details required! Please add your bank details before accepting rental requests.');
      handleTabClick('requests');
      setIsEditingBankDetails(true);
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE || 'http://localhost:5000'}/api/rentals/booking/${bookingId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: action === 'accept' ? 'pending_signature' : 'rejected'
        })
      });

      if (response.ok) {
        await fetchRentalRequests();
        alert(action === 'accept' ? 'Request accepted successfully.' : 'Request rejected.');
      }
    } catch (error) {
      alert(`Failed to ${action} rental request.`);
    }
  };


  const handleLogout = async () => {
    try {
      // Get auth instance and sign out
      const auth = getAuth();
      await signOut(auth);
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  // Show loading state while checking auth or role
  if (authLoading || !roleChecked) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #e3e3e3',
          borderTop: '4px solid #007bff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }}></div>
        <p style={{ color: '#666', fontSize: '16px', margin: 0 }}>Loading...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // If auth error or no user after loading, don't render


  return (
    <div className="minimal-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <Link to="/" className="logo-container">
              <img
                src="/Rentit-logo.png"
                alt="RentIt Logo"
                className="rentit-logo"
              />
            </Link>
            <div className="dashboard-info">
              <h1 className="dashboard-title">Dashboard</h1>
              <p className="dashboard-subtitle">Welcome back, {user?.displayName || user?.email}</p>
            </div>
          </div>
          <div className="header-right">
            <div className="search-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Link to="/owner/add-property" className="btn-add-property">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Property
            </Link>
            <button className="btn-logout" onClick={handleLogout}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="dashboard-tabs">
        <div className="tabs-container">
          <button
            className={`tab ${activeTab === 'properties' ? 'active' : ''} ${unreadNotifications['properties'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('properties')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Properties
          </button>
          <button
            className={`tab ${activeTab === 'analytics' ? 'active' : ''} ${unreadNotifications['analytics'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('analytics')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Analytics
          </button>
          <button
            className={`tab ${activeTab === 'chat' ? 'active' : ''} ${unreadNotifications['chat'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('chat')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Messages
            {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
          </button>
          <button
            className={`tab ${activeTab === 'tenants' ? 'active' : ''} ${unreadNotifications['tenants'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('tenants')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            Tenants
          </button>
          <button
            className={`tab ${activeTab === 'rental-requests' ? 'active' : ''} ${unreadNotifications['rental-requests'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('rental-requests')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19h-6l-4-4m0 0l-4 4h6"></path>
              <path d="M22 12v-7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7"></path>
            </svg>
            Rental Requests
            {pendingRequests.length > 0 && (
              <span className="tab-badge">{pendingRequests.length}</span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'active-agreements' ? 'active' : ''} ${unreadNotifications['active-agreements'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('active-agreements')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Active Agreements
            {activeAgreements.length > 0 && (
              <span className="tab-badge">{activeAgreements.length}</span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'completed-bookings' ? 'active' : ''} ${unreadNotifications['completed-bookings'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('completed-bookings')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Completed
            {completedBookings.length > 0 && (
              <span className="tab-badge">{completedBookings.length}</span>
            )}
          </button>
          <button
            className={`tab ${activeTab === 'requests' ? 'active' : ''} ${unreadNotifications['requests'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('requests')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Bank Details
          </button>
          <button
            className={`tab ${activeTab === 'profile' ? 'active' : ''} ${unreadNotifications['profile'] ? 'has-notification' : ''}`}
            onClick={() => handleTabClick('profile')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Profile
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Bank Details Warning Banner */}
        {(() => {
          console.log('Ë Warning banner check:', { bankDetailsLoading, bankDetails });
          return !bankDetailsLoading && !bankDetails;
        })() && (
            <div className="warning-banner" style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeaa7',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ fontSize: '20px', color: '#856404' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#856404' }}>Bank details required to receive rent payments.</strong>
                <p style={{ margin: '4px 0 0 0', color: '#856404', fontSize: '14px' }}>
                  Add your bank details to enable tenants to pay rent for your properties.
                </p>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  handleTabClick('requests');
                  setIsEditingBankDetails(true);
                }}
                style={{
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Add Bank Details
              </button>
            </div>
          )}

        {activeTab === 'properties' && (
          <>
            {/* Stats Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3>{dashboardLoading ? '...' : (dashboardData?.totalProperties || 0)}</h3>
                  <p>Total Properties</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon active">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3>{dashboardLoading ? '...' : (dashboardData?.availableProperties || 0)}</h3>
                  <p>Available Properties</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon rented">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3>{dashboardLoading ? '...' : (dashboardData?.rentedProperties || 0)}</h3>
                  <p>Rented Properties</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon revenue">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  </svg>
                </div>
                <div className="stat-content">
                  <h3>{dashboardLoading ? '...' : `₹${(dashboardData?.earningsSummary?.totalMonthlyEarnings || dashboardData?.totalMonthlyEarnings || 0).toLocaleString()}`}</h3>
                  <p>Monthly Earnings</p>
                </div>
              </div>
            </div>

            {/* Properties Section */}
            <div className="properties-section">
              <div className="section-header">
                <h2>Your Properties</h2>
                <div className="section-actions">
                  <select className="filter-select">
                    <option value="all">All Properties</option>
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="loading-state">
                  <div className="spinner"></div>
                  <p>Loading properties...</p>
                </div>
              ) : filteredProperties.length === 0 ? (
                <div className="empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                  </svg>
                  <h3>No properties found</h3>
                  <p>Start by adding your first property</p>
                  <Link to="/owner/add-property" className="btn-primary">
                    Add Your First Property
                  </Link>
                </div>
              ) : (
                <div className="properties-grid">
                  {filteredProperties.map((property) => {
                    // Find corresponding property stats from dashboard data
                    const propertyWithStats = dashboardData.properties.find(p => p.id === property.id);
                    const viewCount = propertyWithStats?.viewCount || property.viewCount || 0;
                    const inquiries = propertyWithStats?.inquiries || property.inquiries || 0;

                    return (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        onDelete={handlePropertyDelete}
                        setDeleteConfirm={setDeleteConfirm}
                        viewCount={viewCount}
                        inquiries={inquiries}
                        onEdit={handleEditProperty}
                        onToggleAvailability={handleToggleAvailability}
                        onViewRentHistory={handleViewRentHistory}
                        onMarkAsRented={handleMarkAsRented}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'analytics' && <AnalyticsReports />}

        {activeTab === 'chat' && <OwnerChat />}

        {activeTab === 'profile' && <OwnerProfile uid={user.uid} fallbackEmail={user.email} />}

        {activeTab === 'tenants' && (
          <div className="tenants-section">
            <div className="section-header">
              <h2>Rented Properties & Tenants</h2>
              <div className="section-info">
                <span className="tenant-count">
                  {dashboardLoading ? 'Loading...' : `${(dashboardData?.rentedPropertiesWithTenants || []).length} rented properties`}
                </span>
              </div>
            </div>

            {dashboardLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading tenant information...</p>
              </div>
            ) : !dashboardData?.rentedPropertiesWithTenants || dashboardData.rentedPropertiesWithTenants.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <line x1="20" y1="8" x2="20" y2="14"></line>
                  <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                <h3>No rented properties</h3>
                <p>When tenants rent your properties, they will appear here</p>
              </div>
            ) : (
              <div className="rented-properties-grid">
                {dashboardData.rentedPropertiesWithTenants.map((property) => (
                  <div key={property.id} className="tenant-card">
                    <div className="tenant-card-header">
                      <div className="property-info">
                        <h3>{property.title}</h3>
                        <p className="property-address">
                          {property.address?.city}, {property.address?.state}
                        </p>
                      </div>
                      <div className="rent-amount">
                        <span className="amount">₹{property.rent.toLocaleString()}/month</span>
                      </div>
                    </div>

                    {property.tenant && (
                      <div className="tenant-info">
                        <div className="tenant-header">
                          <h4>Tenant Information</h4>
                        </div>
                        <div className="tenant-details">
                          <div className="tenant-avatar">
                            {property.tenant.profilePicture ? (
                              <img
                                src={property.tenant.profilePicture}
                                alt={property.tenant.name}
                                className="tenant-photo"
                              />
                            ) : (
                              <div className="avatar-placeholder">
                                {property.tenant.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="tenant-contact">
                            <p className="tenant-name">
                              <strong>{property.tenant.name}</strong>
                            </p>
                            <p className="tenant-email">{property.tenant.email}</p>
                            <p className="tenant-phone">{property.tenant.phone}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {property.rentInfo && (
                      <div className="rent-details">
                        <div className="rent-header">
                          <h4>Rent Details</h4>
                        </div>
                        <div className="rent-info-grid">
                          <div className="rent-detail-item">
                            <span className="label">Rent Amount:</span>
                            <span className="value">₹{property.rentInfo.rentAmount.toLocaleString()}</span>
                          </div>
                          <div className="rent-detail-item">
                            <span className="label">Payment Method:</span>
                            <span className="value">{property.rentInfo.paymentMethod}</span>
                          </div>
                          <div className="rent-detail-item">
                            <span className="label">Rent Start Date:</span>
                            <span className="value">
                              {property.rentInfo.rentStartDate
                                ? new Date(property.rentInfo.rentStartDate).toLocaleDateString()
                                : 'Not specified'
                              }
                            </span>
                          </div>
                          <div className="rent-detail-item">
                            <span className="label">Last Payment:</span>
                            <span className="value">
                              {property.rentInfo.lastPaymentDate
                                ? new Date(property.rentInfo.lastPaymentDate).toLocaleDateString()
                                : 'No payments yet'
                              }
                            </span>
                          </div>
                          <div className="rent-detail-item">
                            <span className="label">Payment Status:</span>
                            <span className={`value payment-status ${property.rentInfo.paymentStatus}`}>
                              {property.rentInfo.paymentStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="tenant-card-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => handleViewRentHistory(property)}
                      >
                        View Rent History
                      </button>
                      <button className="btn-outline">
                        Contact Tenant
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="bank-details-section">
            <div className="section-header">
              <h2>Bank Details</h2>
              <div className="section-info">
                {bankDetails?.isVerified ? (
                  <span className="status-badge verified">Verified</span>
                ) : (
                  <span className="status-badge pending">Pending Verification</span>
                )}
              </div>
            </div>

            {bankDetailsLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading bank details...</p>
              </div>
            ) : isEditingBankDetails ? (
              <div className="bank-details-form">
                <div className="form-card">
                  <div className="form-header">
                    <h3>{bankDetails ? 'Update Bank Details' : 'Add Bank Details'}</h3>
                    <button
                      className="btn-secondary"
                      onClick={() => setIsEditingBankDetails(false)}
                    >
                      Cancel
                    </button>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleSaveBankDetails(); }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Account Holder Name *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.accountHolderName || user?.displayName || user?.email || ''}
                          onChange={(e) => handleBankDetailsInputChange('accountHolderName', e.target.value)}
                          placeholder="Enter account holder name"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Bank Name *</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={bankSearchTerm}
                            onChange={handleBankInputChange}
                            onKeyDown={handleBankKeyDown}
                            onFocus={handleBankInputFocus}
                            onBlur={handleBankDropdownBlur}
                            placeholder="Type to search bank name..."
                            required
                            style={{
                              width: '100%',
                              padding: '12px',
                              border: '1px solid #ddd',
                              borderRadius: '6px',
                              fontSize: '14px',
                              backgroundColor: '#fff',
                              boxSizing: 'border-box'
                            }}
                          />

                          {showBankDropdown && filteredBanks.length > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid #ddd',
                                borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                                backgroundColor: '#fff',
                                zIndex: 1000,
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                              }}
                            >
                              {filteredBanks.slice(0, 10).map((bank, index) => (
                                <div
                                  key={bank}
                                  onClick={() => handleBankSelect(bank)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    backgroundColor: index === highlightedBankIndex ? '#f0f8ff' : 'transparent',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '14px',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={() => setHighlightedBankIndex(index)}
                                  onMouseLeave={() => setHighlightedBankIndex(-1)}
                                >
                                  {bank}
                                </div>
                              ))}
                              {filteredBanks.length > 10 && (
                                <div
                                  style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#f8f9fa',
                                    fontSize: '12px',
                                    color: '#666',
                                    textAlign: 'center',
                                    fontStyle: 'italic'
                                  }}
                                >
                                  ... and {filteredBanks.length - 10} more banks
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                          {filteredBanks.length} banks found • Type to search or use arrow keys to navigate
                        </small>
                      </div>

                      <div className="form-group">
                        <label>Account Number *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.accountNumber}
                          onChange={(e) => handleBankDetailsInputChange('accountNumber', e.target.value)}
                          placeholder="Enter account number"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>IFSC Code *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.ifsc}
                          onChange={(e) => handleBankDetailsInputChange('ifsc', e.target.value)}
                          placeholder="Enter IFSC code"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>UPI ID (Optional)</label>
                        <input
                          type="text"
                          value={bankDetailsForm.upiId}
                          onChange={(e) => handleBankDetailsInputChange('upiId', e.target.value)}
                          placeholder="Enter UPI ID"
                        />
                      </div>

                      <div className="form-group">
                        <label>Branch Name *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.branchName}
                          onChange={(e) => handleBankDetailsInputChange('branchName', e.target.value)}
                          placeholder="Enter branch name"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setIsEditingBankDetails(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={bankDetailsLoading}
                      >
                        {bankDetailsLoading ? 'Saving...' : (bankDetails ? 'Update' : 'Save')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : !bankDetails ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <line x1="6" y1="9" x2="18" y2="9"></line>
                  <line x1="6" y1="13" x2="18" y2="13"></line>
                  <line x1="6" y1="17" x2="12" y2="17"></line>
                </svg>
                <h3>No Bank Details Added</h3>
                <p>Add your bank details to receive rent payments from tenants</p>
                <button
                  className="btn-primary"
                  onClick={() => setIsEditingBankDetails(true)}
                >
                  Add Bank Details
                </button>
              </div>
            ) : !isEditingBankDetails ? (
              <div className="bank-details-display">
                <div className="bank-details-card">
                  <div className="bank-details-header">
                    <h3>Bank Account Information</h3>
                    <button
                      className="btn-secondary"
                      onClick={() => setIsEditingBankDetails(true)}
                    >
                      Update
                    </button>
                  </div>

                  <div className="bank-details-grid">
                    <div className="detail-item">
                      <label>Account Holder Name:</label>
                      <span>{bankDetails.accountHolderName}</span>
                    </div>
                    <div className="detail-item">
                      <label>Bank Name:</label>
                      <span>{bankDetails.bankName}</span>
                    </div>
                    <div className="detail-item">
                      <label>Account Number:</label>
                      <span>{maskAccountNumber(bankDetails.accountNumber)}</span>
                    </div>
                    <div className="detail-item">
                      <label>IFSC Code:</label>
                      <span>{bankDetails.ifsc}</span>
                    </div>
                    {bankDetails.upiId && (
                      <div className="detail-item">
                        <label>UPI ID:</label>
                        <span>{bankDetails.upiId}</span>
                      </div>
                    )}
                    <div className="detail-item">
                      <label>Branch Name:</label>
                      <span>{bankDetails.branchName}</span>
                    </div>
                  </div>

                  <div className="verification-status">
                    <span className={`status-badge ${bankDetails.isVerified ? 'verified' : 'pending'}`}>
                      {bankDetails.isVerified ? 'Verified' : 'Pending Verification'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bank-details-form">
                <div className="form-card">
                  <div className="form-header">
                    <h3>Update Bank Details</h3>
                    <button
                      className="btn-secondary"
                      onClick={() => setIsEditingBankDetails(false)}
                    >
                      Cancel
                    </button>
                  </div>

                  <form onSubmit={(e) => { e.preventDefault(); handleSaveBankDetails(); }}>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Account Holder Name *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.accountHolderName || user?.displayName || user?.email || ''}
                          onChange={(e) => handleBankDetailsInputChange('accountHolderName', e.target.value)}
                          placeholder="Enter account holder name"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>Bank Name *</label>
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={bankSearchTerm}
                            onChange={handleBankInputChange}
                            onKeyDown={handleBankKeyDown}
                            onFocus={handleBankInputFocus}
                            onBlur={handleBankDropdownBlur}
                            placeholder="Type to search bank name..."
                            required
                            style={{
                              width: '100%',
                              padding: '12px',
                              border: '1px solid #ddd',
                              borderRadius: '6px',
                              fontSize: '14px',
                              backgroundColor: '#fff',
                              boxSizing: 'border-box'
                            }}
                          />

                          {showBankDropdown && filteredBanks.length > 0 && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                maxHeight: '200px',
                                overflowY: 'auto',
                                border: '1px solid #ddd',
                                borderTop: 'none',
                                borderRadius: '0 0 6px 6px',
                                backgroundColor: '#fff',
                                zIndex: 1000,
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                              }}
                            >
                              {filteredBanks.slice(0, 10).map((bank, index) => (
                                <div
                                  key={bank}
                                  onClick={() => handleBankSelect(bank)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    backgroundColor: index === highlightedBankIndex ? '#f0f8ff' : 'transparent',
                                    borderBottom: '1px solid #eee',
                                    fontSize: '14px',
                                    transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={() => setHighlightedBankIndex(index)}
                                  onMouseLeave={() => setHighlightedBankIndex(-1)}
                                >
                                  {bank}
                                </div>
                              ))}
                              {filteredBanks.length > 10 && (
                                <div
                                  style={{
                                    padding: '8px 12px',
                                    backgroundColor: '#f8f9fa',
                                    fontSize: '12px',
                                    color: '#666',
                                    textAlign: 'center',
                                    fontStyle: 'italic'
                                  }}
                                >
                                  ... and {filteredBanks.length - 10} more banks
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                          {filteredBanks.length} banks found • Type to search or use arrow keys to navigate
                        </small>
                      </div>

                      <div className="form-group">
                        <label>Account Number *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.accountNumber}
                          onChange={(e) => handleBankDetailsInputChange('accountNumber', e.target.value)}
                          placeholder="Enter account number"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>IFSC Code *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.ifsc}
                          onChange={(e) => handleBankDetailsInputChange('ifsc', e.target.value)}
                          placeholder="Enter IFSC code"
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label>UPI ID (Optional)</label>
                        <input
                          type="text"
                          value={bankDetailsForm.upiId}
                          onChange={(e) => handleBankDetailsInputChange('upiId', e.target.value)}
                          placeholder="Enter UPI ID"
                        />
                      </div>

                      <div className="form-group">
                        <label>Branch Name *</label>
                        <input
                          type="text"
                          value={bankDetailsForm.branchName}
                          onChange={(e) => handleBankDetailsInputChange('branchName', e.target.value)}
                          placeholder="Enter branch name"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setIsEditingBankDetails(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={bankDetailsLoading}
                      >
                        {bankDetailsLoading ? 'Saving...' : 'Update'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rental-requests' && (
          <div className="rental-requests-section">
            <div className="section-header">
              <h2>Rental Requests</h2>
              <div className="section-info">
                <span className="request-count">
                  {rentalRequestsLoading ? 'Loading...' : `${pendingRequests.length} pending requests`}
                </span>
                {/* DEBUG: Temporary test button */}
                {process.env.NODE_ENV === 'development' && (
                  <button
                    onClick={async () => {
                      console.log("🔍 MANUAL DEBUG: Testing Firestore query...");
                      if (!user?.uid) {
                        console.log("🔍 No user UID");
                        return;
                      }

                      const testQuery = query(
                        collection(db, "bookings"),
                        where("ownerId", "==", user.uid),
                        where("status", "==", "pending")
                      );

                      const testSnapshot = await getDocs(testQuery);
                      console.log("🔍 MANUAL DEBUG: Query results:");
                      console.log("- Snapshot size:", testSnapshot.size);
                      console.log("- Docs count:", testSnapshot.docs.length);
                      testSnapshot.docs.forEach(doc => {
                        console.log("- Found booking:", doc.id, doc.data());
                      });
                    }}
                    className="debug-test-btn"
                  >
                    Test Query
                  </button>
                )}
              </div>
            </div>

            {rentalRequestsLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading rental requests...</p>
              </div>
            ) : !user || !user.uid ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19h-6l-4-4m0 0l-4 4h6"></path>
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M22 19V9a2 2 0 0 0-2-2h-4l-2-2H9a2 2 0 0 0-2 2v10"></path>
                </svg>
                <h3>Authentication Required</h3>
                <p>Please log in to view rental requests</p>
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19h-6l-4-4m0 0l-4 4h6"></path>
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M22 19V9a2 2 0 0 0-2-2h-4l-2-2H9a2 2 0 0 0-2 2v10"></path>
                </svg>
                <h3>No rental requests</h3>
                <p>When tenants apply to rent your properties, they will appear here</p>
                {allBookings.length > 0 && (
                  <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                    Debug: Found {allBookings.length} total bookings (may be in other statuses)
                  </p>
                )}
              </div>
            ) : (
              <div className="rental-requests-grid">
                {pendingRequests.map((request) => {
                  const tenantName = request.tenantDetails?.fullName || request.tenantDetails?.name || 'Unknown Tenant';
                  const propertyTitle = request.propertyDetails?.title || 'Unknown Property';

                  return (
                    <div key={request.id} className="rental-request-card">
                      <div className="request-header">
                        <div className="property-info">
                          <h3>{propertyTitle}</h3>
                          <p className="tenant-name">Tenant: {tenantName}</p>
                          <p className="request-date">
                            {new Date(request.createdAt?.toDate?.() || request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="request-status">
                          <span className="status-badge pending">Pending</span>
                        </div>
                      </div>

                      <div className="request-details">
                        <div className="detail-item">
                          <span className="label">Proposed Rent:</span>
                          <span className="value">₹{request.proposedRent?.toLocaleString() || request.propertyDetails?.rent?.toLocaleString() || 'N/A'}/month</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Security Deposit:</span>
                          <span className="value">₹{request.proposedDeposit?.toLocaleString() || request.propertyDetails?.securityDeposit?.toLocaleString() || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="request-actions">
                        <button
                          className="btn btn-outline btn-reject"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to reject the rental request from ${tenantName} for "${propertyTitle}"?`)) {
                              handleRentalRequestResponse(request.id, 'reject');
                            }
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18"></path>
                            <path d="M6 6l12 12"></path>
                          </svg>
                          Reject
                        </button>
                        <button
                          className="btn btn-primary btn-accept"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to accept the rental request from ${tenantName} for "${propertyTitle}"?`)) {
                              handleRentalRequestResponse(request.id, 'accept');
                            }
                          }}
                          disabled={!bankDetails}
                          title={!bankDetails ? 'Bank details required to accept requests' : ''}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 6L9 17l-5-5"></path>
                          </svg>
                          Accept
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'active-agreements' && (
          <div className="active-agreements-section">
            <div className="section-header">
              <h2>Active Agreements</h2>
              <div className="section-info">
                <span className="agreement-count">
                  {rentalRequestsLoading ? 'Loading...' : `${activeAgreements.length} active agreements`}
                </span>
              </div>
            </div>

            {rentalRequestsLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading active agreements...</p>
              </div>
            ) : activeAgreements.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <h3>No active agreements</h3>
                <p>Approved rental agreements will appear here</p>
              </div>
            ) : (
              <div className="agreements-grid">
                {activeAgreements.map((agreement) => (
                  <div key={agreement.id} className="agreement-card">
                    <div className="agreement-header">
                      <div className="property-info">
                        <h3>{agreement.propertyDetails?.title || 'Unknown Property'}</h3>
                        <p className="tenant-name">Tenant: {agreement.tenantDetails?.fullName || agreement.tenantDetails?.name || 'Unknown Tenant'}</p>
                        <p className="created-date">
                          Created: {new Date(agreement.createdAt?.toDate?.() || agreement.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="agreement-status">
                        <span className="status-badge active">{agreement.status.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="agreement-details">
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="label">Monthly Rent:</span>
                          <span className="value">₹{agreement.proposedRent?.toLocaleString() || agreement.propertyDetails?.rent?.toLocaleString() || 'N/A'}/month</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Security Deposit:</span>
                          <span className="value">₹{agreement.proposedDeposit?.toLocaleString() || agreement.propertyDetails?.securityDeposit?.toLocaleString() || 'N/A'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Status:</span>
                          <span className="value">{agreement.status.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'completed-bookings' && (
          <div className="completed-bookings-section">
            <div className="section-header">
              <h2>Completed Bookings</h2>
              <div className="section-info">
                <span className="booking-count">
                  {rentalRequestsLoading ? 'Loading...' : `${completedBookings.length} completed bookings`}
                </span>
              </div>
            </div>

            {rentalRequestsLoading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading completed bookings...</p>
              </div>
            ) : completedBookings.length === 0 ? (
              <div className="empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <h3>No completed bookings</h3>
                <p>Completed and cancelled bookings will appear here</p>
              </div>
            ) : (
              <div className="completed-bookings-grid">
                {completedBookings.map((booking) => (
                  <div key={booking.id} className="completed-booking-card">
                    <div className="booking-header">
                      <div className="property-info">
                        <h3>{booking.propertyDetails?.title || 'Unknown Property'}</h3>
                        <p className="tenant-name">Tenant: {booking.tenantDetails?.fullName || booking.tenantDetails?.name || 'Unknown Tenant'}</p>
                        <p className="completed-date">
                          {booking.status === 'completed' ? 'Completed' : 'Cancelled'}: {new Date(booking.updatedAt?.toDate?.() || booking.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="booking-status">
                        <span className={`status-badge ${booking.status}`}>{booking.status}</span>
                      </div>
                    </div>

                    <div className="booking-details">
                      <div className="detail-grid">
                        <div className="detail-item">
                          <span className="label">Final Rent:</span>
                          <span className="value">₹{booking.proposedRent?.toLocaleString() || booking.propertyDetails?.rent?.toLocaleString() || 'N/A'}/month</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Security Deposit:</span>
                          <span className="value">₹{booking.proposedDeposit?.toLocaleString() || booking.propertyDetails?.securityDeposit?.toLocaleString() || 'N/A'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="label">Final Status:</span>
                          <span className="value">{booking.status}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mark as Rented Modal */}
      {markRentedProperty && (
        <div className="mark-rented-overlay">
          <div className="mark-rented-modal">
            <h4>Mark Property as Rented - {markRentedProperty.title}</h4>
            <div className="rental-form">
              <div className="form-group">
                <label>Tenant ID</label>
                <input
                  type="text"
                  value={rentalFormData.tenantId}
                  onChange={(e) => setRentalFormData(prev => ({
                    ...prev,
                    tenantId: e.target.value
                  }))}
                  placeholder="Enter tenant user ID"
                  required
                />
              </div>

              <div className="form-group">
                <label>Rent Amount (₹)</label>
                <input
                  type="number"
                  value={rentalFormData.rentAmount}
                  onChange={(e) => setRentalFormData(prev => ({
                    ...prev,
                    rentAmount: e.target.value
                  }))}
                  placeholder="Enter monthly rent amount"
                  required
                />
              </div>

              <div className="form-group">
                <label>Rent Start Date</label>
                <input
                  type="date"
                  value={rentalFormData.rentStartDate}
                  onChange={(e) => setRentalFormData(prev => ({
                    ...prev,
                    rentStartDate: e.target.value
                  }))}
                  required
                />
              </div>

              <div className="form-group">
                <label>Payment Method</label>
                <select
                  value={rentalFormData.paymentMethod}
                  onChange={(e) => setRentalFormData(prev => ({
                    ...prev,
                    paymentMethod: e.target.value
                  }))}
                  required
                >
                  <option value="credit_card">Credit Card</option>
                  <option value="debit_card">Debit Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setMarkRentedProperty(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSaveRental} disabled={!rentalFormData.tenantId || !rentalFormData.rentAmount || !rentalFormData.rentStartDate}>
                Mark as Rented
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-modal">
            <h4>Delete Property?</h4>
            <p>Are you sure you want to delete "{deleteConfirm.title}"? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={() => handlePropertyDelete(deleteConfirm)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Property Modal */}
      {editingProperty && (
        <div className="edit-property-overlay">
          <div className="edit-property-modal">
            <h4>Edit Property</h4>
            <EditPropertyForm
              property={editingProperty}
              onSave={handleSaveProperty}
              onCancel={() => setEditingProperty(null)}
            />
          </div>
        </div>
      )}

      {/* Rent History Modal */}
      {rentHistoryProperty && rentHistoryData && (
        <div className="rent-history-overlay">
          <div className="rent-history-modal">
            <h4>Tenants & Rent History - {rentHistoryProperty.title}</h4>
            <RentHistoryContent
              property={rentHistoryData.property}
              rentHistory={rentHistoryData.rentHistory}
              totalPayments={rentHistoryData.totalPayments}
              totalRevenue={rentHistoryData.totalRevenue}
              onClose={() => {
                setRentHistoryProperty(null);
                setRentHistoryData(null);
              }}
            />
          </div>
        </div>
      )}

    </div>
  );

  // Property Card Component
  function PropertyCard({
    property,
    onDelete,
    setDeleteConfirm,
    viewCount = 0,
    inquiries = 0,
    onEdit,
    onToggleAvailability,
    onViewRentHistory,
    onMarkAsRented
  }) {
    const getStatusColor = (status) => {
      switch (status) {
        case 'ACTIVE': return 'success';
        case 'PENDING': return 'warning';
        case 'REJECTED': return 'danger';
        case 'rented': return 'info';
        case 'available': return 'success';
        case 'unavailable': return 'warning';
        default: return 'default';
      }
    };

    return (
      <div className="property-card">
        <div className="property-image">
          {/* Show multiple images in a carousel or grid */}
          {property.images && Array.isArray(property.images) && property.images.length > 0 ? (
            <div className="property-images-container">
              <img
                src={property.images[0]?.url || "/placeholder-property.jpg"}
                alt={property.title || 'Property'}
                className="main-property-image"
                onError={(e) => {
                  e.target.src = "/placeholder-property.jpg";
                }}
              />
              {property.images.length > 1 && (
                <div className="image-indicators">
                  <span className="image-count">+{property.images.length - 1} more</span>
                </div>
              )}
            </div>
          ) : (
            <div className="no-image-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              <span>No Images</span>
            </div>
          )}
          <span className={`status-badge ${getStatusColor(property.status)}`}>
            {property.status === 'rented' ? 'Rented' :
              property.status === 'available' ? 'Available' :
                property.status === 'unavailable' ? 'Unavailable' :
                  property.status || 'PENDING'}
          </span>
        </div>

        <div className="property-content">
          <div className="property-header">
            <h3>{property.title}</h3>
            <div className="property-price">
              ₹{property.rent || property.monthlyRent || 0}/month
            </div>
          </div>

          <div className="property-location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            {property.address?.city}, {property.address?.state}
          </div>

          <div className="property-details">
            <span>{property.bedrooms || 0} bed</span>
            <span>{property.bathrooms || 0} bath</span>
            <span>{property.squareFootage || 0} sqft</span>
          </div>

          <div className="property-stats">
            <span className="stat views-stat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              {viewCount.toLocaleString()} views
            </span>
            <span className="stat inquiries-stat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
              {inquiries} inquiries
            </span>
          </div>

          <div className="property-actions">
            <button
              className="btn-secondary"
              onClick={() => onEdit(property)}
            >
              Edit
            </button>
            <button className="btn-outline">View Details</button>

            {/* Show Mark as Rented button only when property is available */}
            {property.status === 'available' && (
              <button
                className="btn-primary"
                onClick={() => onMarkAsRented(property)}
              >
                Mark as Rented
              </button>
            )}

            {/* Show Tenants/Rent Info only when property is rented */}
            {property.status === 'rented' && (
              <button
                className="btn-outline"
                onClick={() => onViewRentHistory(property)}
              >
                Tenants / Rent Info
              </button>
            )}

            {/* Show Mark Unavailable only when property is available */}
            {property.status === 'available' && (
              <button
                className="btn-outline"
                onClick={() => onToggleAvailability(property)}
              >
                Mark Unavailable
              </button>
            )}

            {/* Show Mark Available only when property is unavailable */}
            {property.status === 'unavailable' && (
              <button
                className="btn-outline"
                onClick={() => onToggleAvailability(property)}
              >
                Mark Available
              </button>
            )}

            <button
              className="btn-danger"
              onClick={() => setDeleteConfirm(property)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Edit Property Form Component
  function EditPropertyForm({ property, onSave, onCancel }) {
    const [formData, setFormData] = useState({
      title: property.title || '',
      description: property.description || '',
      rent: property.rent || property.monthlyRent || '',
      address: property.address || {},
      type: property.type || '',
      bedrooms: property.bedrooms || '',
      bathrooms: property.bathrooms || '',
      squareFootage: property.squareFootage || '',
      availableDate: property.availableDate || '',
      leaseDuration: property.leaseDuration || '',
      maintenanceCharge: property.maintenanceCharge || '',
      securityDeposit: property.securityDeposit || '',
      pgGender: property.pgGender || '',
    });

    // Photo management state
    const [existingPhotos, setExistingPhotos] = useState(property.images || []);
    const [newPhotos, setNewPhotos] = useState([]);
    const [photosToRemove, setPhotosToRemove] = useState([]);

    const handleChange = (e) => {
      const { name, value } = e.target;
      if (name.includes('.')) {
        const [parent, child] = name.split('.');
        setFormData(prev => ({
          ...prev,
          [parent]: {
            ...prev[parent],
            [child]: value
          }
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: value
        }));
      }
    };

    const handlePhotoSelect = (e) => {
      const files = Array.from(e.target.files);
      setNewPhotos(prev => [...prev, ...files]);
    };

    const removeExistingPhoto = (photoIndex) => {
      const photo = existingPhotos[photoIndex];
      setExistingPhotos(prev => prev.filter((_, i) => i !== photoIndex));
      setPhotosToRemove(prev => [...prev, photo]);
    };

    const removeNewPhoto = (photoIndex) => {
      setNewPhotos(prev => prev.filter((_, i) => i !== photoIndex));
    };

    const getPhotoUrl = (photo) => {
      if (typeof photo === 'string') {
        return photo;
      }
      return photo.url || URL.createObjectURL(photo);
    };

    const handleSubmit = (e) => {
      e.preventDefault();

      // Prepare photos data
      const photosData = {
        existingPhotos: existingPhotos,
        newPhotos: newPhotos,
        photosToRemove: photosToRemove
      };

      onSave({
        ...formData,
        ...photosData
      });
    };

    return (
      <form onSubmit={handleSubmit} className="edit-property-form">
        <div className="form-row">
          <div className="form-group">
            <label>Property Title</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Monthly Rent (₹)</label>
            <input
              type="number"
              name="rent"
              value={formData.rent}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows="3"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              name="address.city"
              value={formData.address.city || ''}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>State</label>
            <input
              type="text"
              name="address.state"
              value={formData.address.state || ''}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Bedrooms</label>
            <input
              type="number"
              name="bedrooms"
              value={formData.bedrooms}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Bathrooms</label>
            <input
              type="number"
              name="bathrooms"
              value={formData.bathrooms}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Square Footage</label>
            <input
              type="number"
              name="squareFootage"
              value={formData.squareFootage}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Property Type</label>
            <select name="type" value={formData.type} onChange={handleChange}>
              <option value="">Select Type</option>
              <option value="apartment">Apartment</option>
              <option value="house">House</option>
              <option value="pg">PG</option>
              <option value="studio">Studio</option>
            </select>
          </div>
        </div>

        {/* Photo Management Section */}
        <div className="photo-management-section">
          <label>Property Photos</label>

          {/* Existing Photos */}
          {existingPhotos.length > 0 && (
            <div className="photos-section">
              <h5>Current Photos ({existingPhotos.length})</h5>
              <div className="photos-grid">
                {existingPhotos.map((photo, index) => (
                  <div key={`existing-${index}`} className="photo-item">
                    <img
                      src={getPhotoUrl(photo)}
                      alt={`Property ${index + 1}`}
                      className="photo-thumbnail"
                    />
                    <button
                      type="button"
                      className="remove-photo-btn"
                      onClick={() => removeExistingPhoto(index)}
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Photos */}
          {newPhotos.length > 0 && (
            <div className="photos-section">
              <h5>New Photos ({newPhotos.length})</h5>
              <div className="photos-grid">
                {newPhotos.map((photo, index) => (
                  <div key={`new-${index}`} className="photo-item">
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`New ${index + 1}`}
                      className="photo-thumbnail"
                    />
                    <button
                      type="button"
                      className="remove-photo-btn"
                      onClick={() => removeNewPhoto(index)}
                      title="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Photos Button */}
          <div className="add-photo-section">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handlePhotoSelect}
              id="photo-upload"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn-outline"
              onClick={() => document.getElementById('photo-upload').click()}
            >
              + Add Photos
            </button>
            <span className="photo-hint">
              You can add multiple photos. Click × on any photo to remove it.
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-secondary">
            Save Changes
          </button>
        </div>
      </form>
    );
  }
}

// Rent History Content Component
function RentHistoryContent({ property, rentHistory, totalPayments, totalRevenue, onClose }) {
    return (
      <div className="rent-history-content">
        <div className="rent-summary">
          <div className="summary-card">
            <h5>Property Status</h5>
            <p className={`status ${property.status}`}>
              {property.status === 'rented' ? 'Rented' : 'Available'}
            </p>
          </div>
          <div className="summary-card">
            <h5>Monthly Rent</h5>
            <p>₹{property.rent?.toLocaleString() || 0}</p>
          </div>
          <div className="summary-card">
            <h5>Total Payments</h5>
            <p>{totalPayments}</p>
          </div>
          <div className="summary-card">
            <h5>Total Revenue</h5>
            <p>₹{totalRevenue.toLocaleString()}</p>
          </div>
        </div>

        {property.currentTenant && (
          <div className="current-tenant">
            <h5>Current Tenant</h5>
            <div className="tenant-info">
              <p><strong>Name:</strong> {property.currentTenant.name || 'N/A'}</p>
              <p><strong>Email:</strong> {property.currentTenant.email || 'N/A'}</p>
              <p><strong>Phone:</strong> {property.currentTenant.phone || 'N/A'}</p>
            </div>
          </div>
        )}

        <div className="rent-history-list">
          <h5>Payment History</h5>
          {rentHistory.length === 0 ? (
            <p>No payment records found.</p>
          ) : (
            <div className="payment-list">
              {rentHistory.map((payment) => (
                <div key={payment.id} className="payment-item">
                  <div className="payment-info">
                    <p><strong>Date:</strong> {new Date(payment.paymentDate).toLocaleDateString()}</p>
                    <p><strong>Amount:</strong> ₹{payment.amount?.toLocaleString() || 0}</p>
                    <p><strong>Status:</strong>
                      <span className={`payment-status ${payment.status}`}>
                        {payment.status || 'Pending'}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    );
  }
