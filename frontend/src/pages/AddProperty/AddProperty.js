import React, { useEffect, useState, useCallback, useMemo } from "react";

import "./AddProperty.css";
import AddPropertySteps from "./AddPropertySteps";
import { auth, app } from "../../firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { uploadPropertyPhotos } from "../../services/propertyMediaService";
import api from "../../utils/api";
import { useNavigate } from "react-router-dom";

const storage = getStorage(app);

  /* ================= ROOM CONFIG ================= */
const ROOM_CONFIG = {
  flat: [
    "living_room",
    "bedroom",
    "master_bedroom",
    "kitchen",
    "bathroom",
    "toilet",
    "balcony",
    "dining_area",
  ],
  house_villa: [
    "living_room",
    "bedroom",
    "master_bedroom",
    "kitchen",
    "bathroom",
    "toilet",
    "balcony",
    "dining_area",
    "terrace",
  ],
  pg: [
    "bedroom",
    "master_bedroom",
    "bathroom",
    "toilet",
    "common_area",
    "kitchen",
    "dining_area",
  ],
};

/* ================= COMMON ROOM NAMES ================= */
const COMMON_ROOMS = [
  { value: "living_room", label: "Living Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "master_bedroom", label: "Bedroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "toilet", label: "Toilet" },
  { value: "balcony", label: "Balcony" },
  { value: "dining_area", label: "Dining Area" },
  { value: "terrace", label: "Terrace" },
  { value: "other", label: "Other" }
];

/* ================= AMENITIES CONFIG ================= */
const AMENITIES = [
  "Air Conditioning", "Balcony", "Parking", "Lift", "Gym", "Swimming Pool",
  "Power Backup", "Security", "Garden", "Clubhouse", "Intercom", "CCTV",
  "Wi-Fi", "Gas Pipeline", "Modular Kitchen", "Wardrobe", "Refrigerator",
  "Washing Machine", "TV", "Sofa", "Dining Table", "Bed", "Mattress"
];

/* ================= NEARBY PLACES CONFIG ================= */
const NEARBY_PLACES = [
  "School", "College", "Hospital", "Metro Station", "Bus Stop", "Railway Station",
  "Shopping Mall", "Grocery Store", "Restaurant", "Bank", "ATM", "Pharmacy",
  "Park", "Temple", "Mosque", "Church", "Gym", "Cinema"
];

export default function AddPropertyPage() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;

  /* ================= BASIC DETAILS ================= */
  const [ptype, setPtype] = useState("");
  const [pgGender, setPgGender] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [landmark, setLandmark] = useState("");

  /* ================= PROPERTY DETAILS ================= */
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [toilets, setToilets] = useState("");
  const [balconies, setBalconies] = useState("");
  const [squareFootage, setSquareFootage] = useState("");
  const [furnishing, setFurnishing] = useState("");
  const [propertyAge, setPropertyAge] = useState("");
  const [floors, setFloors] = useState("");
  const [floorNumber, setFloorNumber] = useState("");

  /* ================= RENT & TERMS ================= */
  const [rentMonthly, setRentMonthly] = useState("");
  const [rentPerPerson, setRentPerPerson] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [availableDate, setAvailableDate] = useState("");
  const [leaseDuration, setLeaseDuration] = useState("");
  const [maintenanceCharge, setMaintenanceCharge] = useState("");
  const [parkingCharge, setParkingCharge] = useState("");
  const [preferredTenants, setPreferredTenants] = useState("");

  /* ================= RENT PREDICTION ================= */
  const [predictedRent, setPredictedRent] = useState(null);
  const [showPrediction, setShowPrediction] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [predictionError, setPredictionError] = useState("");
  const [userManuallyChangedRent, setUserManuallyChangedRent] = useState(false);

  /* ================= AMENITIES ================= */
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [selectedNearby, setSelectedNearby] = useState([]);

  /* ================= ROOMS ================= */
  const [rooms] = useState({
    bedroom: 1,
    bathroom: 1,
    toilet: 1,
  });

  /* ================= DYNAMIC ROOM UPLOADS ================= */
  const [roomUploads, setRoomUploads] = useState({});
  const [selectedRoom, setSelectedRoom] = useState("");
  const [tempFiles, setTempFiles] = useState([]);

  // Memoize amenities and nearby places to prevent unnecessary re-renders
  const amenitiesList = useMemo(() => AMENITIES, []);
  const nearbyPlacesList = useMemo(() => NEARBY_PLACES, []);
  const commonRoomsList = useMemo(() => COMMON_ROOMS, []);

  /* ================= UI ================= */
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  useEffect(() => {
    if (!ptype) return;

    const roomList = ROOM_CONFIG[ptype] || [];
    const initial = {};

    roomList.forEach((room) => {
      initial[room] = [];
    });

    setRoomUploads(initial);
  }, [ptype]);

  /* ================= VALIDATION ================= */
  const validateField = useCallback((field, value) => {
    let error = "";
    
    switch (field) {
      case 'ptype':
        if (!value) error = "Property type is required";
        break;
      case 'pgGender':
        if (ptype === "pg" && !value) error = "PG type is required";
        break;
      case 'title':
        if (!value.trim()) error = "Property title is required";
        break;
      case 'description':
        if (!value.trim()) error = "Description is required";
        break;
      case 'addressLine':
        if (!value.trim()) error = "Address is required";
        break;
      case 'city':
        if (!value.trim()) error = "City is required";
        break;
      case 'state':
        if (!value.trim()) error = "State is required";
        break;
      case 'pincode':
        if (!value) error = "Pincode is required";
        else if (!/^[0-9]{6}$/.test(value)) error = "Invalid pincode";
        break;
      case 'bedrooms':
        if (!value) error = "Number of bedrooms is required";
        else if (value < 1) error = "At least 1 bedroom is required";
        break;
      case 'bathrooms':
        if (!value) error = "Number of bathrooms is required";
        break;
      case 'squareFootage':
        if (!value) error = "Square footage is required";
        else if (value < 100) error = "Square footage must be at least 100";
        break;
      case 'rentMonthly':
        if (ptype !== "pg" && !value) error = "Monthly rent is required";
        else if (value < 1000) error = "Rent must be at least ₹1000";
        break;
      case 'rentPerPerson':
        if (ptype === "pg" && !value) error = "Rent per person is required";
        else if (value < 1000) error = "Rent must be at least ₹1000";
        break;
      case 'securityDeposit':
        if (!value) error = "Security deposit is required";
        break;
      case 'availableDate':
        if (!value) error = "Available date is required";
        break;
      default:
        break;
    }
    
    return error;
  }, [ptype]);

  const getFieldValue = useCallback((field) => {
    switch (field) {
      case 'ptype': return ptype;
      case 'pgGender': return pgGender;
      case 'title': return title;
      case 'description': return description;
      case 'addressLine': return addressLine;
      case 'city': return city;
      case 'state': return state;
      case 'pincode': return pincode;
      case 'bedrooms': return bedrooms;
      case 'bathrooms': return bathrooms;
      case 'squareFootage': return squareFootage;
      case 'rentMonthly': return rentMonthly;
      case 'rentPerPerson': return rentPerPerson;
      case 'securityDeposit': return securityDeposit;
      case 'availableDate': return availableDate;
      default: return '';
    }
  }, [ptype, pgGender, title, description, addressLine, city, state, pincode, bedrooms, bathrooms, squareFootage, rentMonthly, rentPerPerson, securityDeposit, availableDate]);

  const handleBlur = useCallback((field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, getFieldValue(field));
    setErrors(prev => ({ ...prev, [field]: error }));
  }, [getFieldValue, validateField]);

  // Immediate input handler for better performance
  const handleInputChange = useCallback((field, value) => {
    // Update field value immediately for UI responsiveness
    switch (field) {
      case 'ptype': setPtype(value); break;
      case 'pgGender': setPgGender(value); break;
      case 'title': setTitle(value); break;
      case 'description': setDescription(value); break;
      case 'addressLine': setAddressLine(value); break;
      case 'city': setCity(value); break;
      case 'state': setState(value); break;
      case 'pincode': setPincode(value); break;
      case 'bedrooms': setBedrooms(value); break;
      case 'bathrooms': setBathrooms(value); break;
      case 'squareFootage': setSquareFootage(value); break;
      case 'rentMonthly': 
      setRentMonthly(value);
      setUserManuallyChangedRent(true);
      break;
      case 'rentPerPerson': setRentPerPerson(value); break;
      case 'securityDeposit': setSecurityDeposit(value); break;
      case 'availableDate': setAvailableDate(value); break;
      default: break;
    }
    
    // Immediate validation for better UX
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
  }, [touched, validateField]);

  /* ================= VIDEO ================= */
  const [videoFile, setVideoFile] = useState(null);

  const validate = () => {
    if (!currentUser) {
      setMsg("Please login again.");
      return false;
    }

    const newErrors = {};
    const fieldsToValidate = ['ptype', 'title', 'description', 'addressLine', 'city', 'state', 'pincode', 'bedrooms', 'bathrooms', 'squareFootage'];
    
    if (ptype === "pg") {
      fieldsToValidate.push('pgGender', 'rentPerPerson');
    } else {
      fieldsToValidate.push('rentMonthly');
    }
    
    fieldsToValidate.push('securityDeposit', 'availableDate');

    let isValid = true;
    fieldsToValidate.forEach(field => {
      const error = validateField(field, getFieldValue(field));
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    setTouched(fieldsToValidate.reduce((acc, field) => ({ ...acc, [field]: true }), {}));
    
    return isValid;
  };

  /* ================= FILE UPLOAD HANDLERS ================= */
  const handleFileSelect = useCallback((files) => {
    if (files && files.length > 0) {
      const newFiles = Array.from(files);
      setTempFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleAddPhotos = useCallback(() => {
    if (selectedRoom && tempFiles.length > 0) {
      setRoomUploads(prev => ({
        ...prev,
        [selectedRoom]: [...(prev[selectedRoom] || []), ...tempFiles]
      }));
      setTempFiles([]);
    }
  }, [selectedRoom, tempFiles]);

  const removePhoto = useCallback((room, index) => {
    setRoomUploads(prev => ({
      ...prev,
      [room]: prev[room].filter((_, i) => i !== index)
    }));
  }, []);

  const removeTempFile = useCallback((index) => {
    setTempFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearTempFiles = useCallback(() => {
    setTempFiles([]);
  }, []);

  /* ================= AMENITIES HANDLERS ================= */
  const handleAmenityToggle = useCallback((amenity) => {
    setSelectedAmenities(prev => 
      prev.includes(amenity) 
        ? prev.filter(a => a !== amenity)
        : [...prev, amenity]
    );
  }, []);

  const handleNearbyToggle = useCallback((place) => {
    setSelectedNearby(prev => 
      prev.includes(place) 
        ? prev.filter(p => p !== place)
        : [...prev, place]
    );
  }, []);

  /* ================= RENT PREDICTION FUNCTION ================= */
  const predictRent = useCallback(async () => {
    // Check if we have enough data for prediction
    if (!city || !bedrooms || !bathrooms || !squareFootage || !furnishing || !ptype) {
      setPredictionError("Please fill in property details first (property type, bedrooms, bathrooms, square footage, furnishing, and location)");
      return;
    }

    // Validate that all numeric values are valid numbers
    if (isNaN(parseInt(bedrooms)) || isNaN(parseInt(bathrooms)) || isNaN(parseInt(squareFootage))) {
      setPredictionError("Please enter valid numeric values for bedrooms, bathrooms, and square footage");
      return;
    }

    // Only predict for Mumbai areas
    const mumbaiAreas = [
      'mumbai', 'bombay', 'south mumbai', 'bandra', 'andheri', 'juhu', 'worli', 'powai', 
      'goregaon', 'borivali', 'kandivali', 'dahisar', 'mulund', 'thane', 'navi mumbai', 
      'vashi', 'nerul', 'chembur', 'ghatkopar', 'vikhroli', 'kanjurmarg', 'bhandup', 
      'kurla', 'sion', 'matunga', 'dadar', 'parel', 'lower parel', 'prabhadevi', 
      'mahim', 'santacruz', 'vile parle', 'khar', 'jogeshwari', 'malad', 'kandivali'
    ];
    const isMumbai = mumbaiAreas.some(area => city.toLowerCase().includes(area)) || 
                     city.toLowerCase().includes('mumbai') || 
                     city.toLowerCase().includes('bombay');
    
    if (!isMumbai) {
      setPredictionError("Rent prediction is currently available only for Mumbai areas");
      return;
    }

    setPredictionLoading(true);
    setPredictionError("");
    setPredictedRent(null);

    try {
      // Log current form state for debugging
      console.log('=== Rent Prediction Input Data ===');
      console.log('City:', city);
      console.log('Property Type:', ptype);
      console.log('Bedrooms:', bedrooms);
      console.log('Bathrooms:', bathrooms);
      console.log('Square Footage:', squareFootage);
      console.log('Furnishing:', furnishing);
      console.log('Property Age:', propertyAge);
      console.log('Amenities Count:', selectedAmenities.length);
      console.log('================================');

      const requestData = {
        area: city.trim(), // Use exact city input
        propertyType: ptype, // Use exact property type from form
        bedrooms: parseInt(bedrooms),
        bathrooms: parseInt(bathrooms),
        squareFootage: parseInt(squareFootage),
        furnishing: furnishing,
        propertyAge: propertyAge !== undefined && propertyAge !== null && propertyAge !== '' ? parseInt(propertyAge) : 2,
        amenitiesCount: selectedAmenities.length || 0
      };

      // Validate that all required fields have valid values
      if (!requestData.area || !requestData.propertyType || !requestData.bedrooms || 
          !requestData.bathrooms || !requestData.squareFootage || !requestData.furnishing) {
        setPredictionError("Missing required fields for prediction");
        return;
      }

      console.log('Sending to backend:', requestData);

      const response = await api.post('/api/rent-prediction/predict', requestData);

      if (response.data && response.data.predicted_rent) {
        setPredictedRent(response.data.predicted_rent);
        setShowPrediction(true);
        console.log('Prediction successful:', response.data);
        console.log('Predicted rent:', response.data.predicted_rent);
        
        // Smart override: Ask user to update manual rent if difference is significant
        if (userManuallyChangedRent && rentMonthly && Math.abs(parseInt(rentMonthly) - response.data.predicted_rent) > 0.1 * response.data.predicted_rent) {
          const shouldOverride = window.confirm(
            `AI suggests ₹${response.data.predicted_rent.toLocaleString('en-IN')}/month. Your current rent is ₹${parseInt(rentMonthly).toLocaleString('en-IN')}/month.\n\nWould you like to update to the AI suggestion?` 
          );
          if (shouldOverride) {
            setRentMonthly(response.data.predicted_rent.toString());
            setUserManuallyChangedRent(false);
          }
        }
      } else {
        console.log('Prediction failed - no predicted_rent in response');
        setPredictionError("Failed to get rent prediction");
      }
    } catch (error) {
      console.error('Rent prediction error:', error);
      if (error.response?.data?.error) {
        setPredictionError(error.response.data.error);
      } else if (error.response?.status === 503) {
        setPredictionError("Rent prediction service is temporarily unavailable");
      } else if (error.response?.status === 400) {
        setPredictionError("Invalid property details provided");
      } else {
        setPredictionError("Unable to predict rent at the moment");
      }
    } finally {
      setPredictionLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [city, bedrooms, bathrooms, squareFootage, furnishing, propertyAge, ptype, selectedAmenities]);

  // Real-time prediction - trigger every time required fields change
  useEffect(() => {
    // Check if we have all required data for a prediction
    const hasRequiredData = city && ptype && bedrooms && bathrooms && squareFootage && furnishing;
    
    if (hasRequiredData && !predictionLoading) {
      // Clear any existing timer
      const timer = setTimeout(() => {
        predictRent();
      }, 800); // 0.8 second debounce

      return () => clearTimeout(timer);
    } else {
      // Clear prediction if required data is missing
      if (showPrediction) {
        setShowPrediction(false);
        setPredictedRent(null);
      }
    }
    // ✅ Added missing dependencies: propertyAge, selectedAmenities
    // ✅ Removed showPrediction from deps (it's only read, not needed for effect)
    // ✅ Keep predictRent (it's stable now after fixing its deps)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [city, ptype, bedrooms, bathrooms, squareFootage, furnishing, propertyAge, selectedAmenities, predictionLoading, predictRent]);

  // Reset userManuallyChangedRent when property fields change
  useEffect(() => {
    // When user changes core property details, assume they want fresh prediction and reset manual override flag
    setUserManuallyChangedRent(false);
  }, [city, ptype, bedrooms, bathrooms, squareFootage, furnishing, propertyAge]);

  /* ================= SUBMIT ================= */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!validate()) return;

    try {
      setLoading(true);

      /* 1 CREATE PROPERTY VIA BACKEND */
      const res = await api.post("/api/properties", {
        title,
        description,
        address: { line: addressLine, city, state, pincode, landmark },
        type: ptype,
        pgGender: ptype === "pg" ? pgGender : null,
        rent: ptype === "pg" ? null : Number(rentMonthly),
        rentPerPerson: ptype === "pg" ? Number(rentPerPerson) : null,
        securityDeposit: Number(securityDeposit),
        availableDate,
        leaseDuration,
        maintenanceCharge: maintenanceCharge ? Number(maintenanceCharge) : null,
        parkingCharge: parkingCharge ? Number(parkingCharge) : null,
        preferredTenants: preferredTenants || "",
        bedrooms: Number(bedrooms),
        bathrooms: Number(bathrooms),
        toilets: toilets ? Number(toilets) : null,
        balconies: balconies ? Number(balconies) : null,
        squareFootage: Number(squareFootage),
        furnishing,
        propertyAge: propertyAge ? Number(propertyAge) : null,
        floors: floors ? Number(floors) : null,
        floorNumber: floorNumber ? Number(floorNumber) : null,
        amenities: selectedAmenities,
        nearbyPlaces: selectedNearby,
        rooms,
      });

      // Handle different response formats
      const propertyId = res.data.propertyId || res.data.id;
      
      if (!propertyId) {
        throw new Error("Property ID not received from server");
      }

      /* 2 UPLOAD ROOM IMAGES */
      const images = [];

      // Ensure user is authenticated before uploading
      if (!currentUser || !currentUser.uid) {
        setMsg("Please login to upload property images");
        return;
      }

      for (const room of Object.keys(roomUploads)) {
        for (let i = 0; i < roomUploads[room].length; i++) {
          const file = roomUploads[room][i];
          const path = `properties/${currentUser.uid}/${propertyId}/${room}_${i}`;
          const sref = ref(storage, path);
          
          try {
            console.log(`Uploading file to Storage: ${path}`);
            await uploadBytes(sref, file);
            const url = await getDownloadURL(sref);
            console.log(`Successfully uploaded: ${url}`);
            
            // Push object format that backend expects
            images.push({
              url: url,
              type: file.type || 'image/jpeg',
              room: room,
              name: file.name
            });
          } catch (uploadError) {
            console.error(`Failed to upload file ${file.name} to Storage:`, uploadError);
            console.error('Upload error details:', {
              message: uploadError.message,
              code: uploadError.code,
              path: path,
              fileSize: file.size,
              fileType: file.type
            });
            // Continue with other files but prevent crash
            continue;
          }
        }
      }

      /* 3 UPLOAD VIDEO (OPTIONAL) - Future enhancement */
      // Video upload functionality can be added here when needed

      /* 4 SAVE MEDIA METADATA VIA BACKEND API */
      try {
        if (images.length > 0) {
          await uploadPropertyPhotos({
            propertyId: propertyId,
            ownerId: currentUser.uid,
            files: images
          });
          console.log("Photos uploaded successfully via backend API");
        }
      } catch (mediaError) {
        console.error("Failed to upload photos via backend:", mediaError);
        // Continue with property creation even if media fails
        console.warn("Property created but photo upload failed");
      }

      setMsg("Property added successfully! Your property is now live and visible to tenants.");
      navigate("/owner/dashboard", { replace: true });

    } catch (err) {
      console.error("Property submission error:", err);
      
      // Enhanced error handling
      let errorMessage = "Something went wrong while adding your property.";
      
      if (err.response) {
        // Server responded with error status
        errorMessage = err.response.data?.message || err.response.data?.error || "Server error occurred";
      } else if (err.request) {
        // Network error
        errorMessage = "Network error. Please check your internet connection and try again.";
      } else if (err.message) {
        // Other error
        errorMessage = err.message;
      }
      
      setMsg(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */
  return (
    <div className="ap-wrapper">
      <div className="ap-card">
        {/* Progress Steps */}
        <AddPropertySteps currentStep={1} totalSteps={6} />
        
        <div className="form-header">
          <h2>Add New Property</h2>
          <p className="ap-sub">List your property with photos and details to reach potential tenants.</p>
        </div>

        <form onSubmit={handleSubmit} className="ap-form">
          {/* PROPERTY TYPE */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              Property Details
            </div>
            
            <div className="ap-grid-2">
              <div className="ap-field">
                <label>Property Type <span className="required">*</span></label>
                <select 
                  value={ptype} 
                  onChange={(e) => handleInputChange('ptype', e.target.value)}
                  onBlur={() => handleBlur('ptype')}
                  className={touched.ptype && errors.ptype ? 'error' : ''}
                  required
                >
                  <option value="">Select property type</option>
                  <option value="apartment">Apartment</option>
                  <option value="house">House</option>
                  <option value="villa">Villa</option>
                  <option value="pg">PG</option>
                </select>
                {touched.ptype && errors.ptype && <span className="error-msg">{errors.ptype}</span>}
              </div>

              {ptype === "pg" && (
                <div className="ap-field">
                  <label>PG Type <span className="required">*</span></label>
                  <select
                    value={pgGender}
                    onChange={(e) => handleInputChange('pgGender', e.target.value)}
                    onBlur={() => handleBlur('pgGender')}
                    className={touched.pgGender && errors.pgGender ? 'error' : ''}
                    required
                  >
                    <option value="">Select PG type</option>
                    <option value="boys">Boys</option>
                    <option value="girls">Girls</option>
                    <option value="coed">Co-ed</option>
                  </select>
                  {touched.pgGender && errors.pgGender && <span className="error-msg">{errors.pgGender}</span>}
                </div>
              )}
            </div>

            <div className="ap-field">
              <label>Property Title <span className="required">*</span></label>
              <input 
                value={title} 
                onChange={(e) => handleInputChange('title', e.target.value)}
                onBlur={() => handleBlur('title')}
                placeholder="Enter a descriptive title for your property (e.g., 2BHK Apartment with Balcony)"
                className={touched.title && errors.title ? 'error' : ''}
                required
              />
              {touched.title && errors.title && <span className="error-msg">{errors.title}</span>}
            </div>

            <div className="ap-field">
              <label>Description <span className="required">*</span></label>
              <textarea
                value={description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                onBlur={() => handleBlur('description')}
                placeholder="Describe your property in detail. Include key features, location benefits, and what makes it special."
                className={touched.description && errors.description ? 'error' : ''}
                rows={4}
                required
              />
              {touched.description && errors.description && <span className="error-msg">{errors.description}</span>}
            </div>
          </div>

          {/* PROPERTY SPECIFICATIONS */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
              </svg>
              Property Specifications
            </div>

            <div className="ap-grid-3">
              <div className="ap-field">
                <label>Bedrooms <span className="required">*</span></label>
                <input 
                  type="number"
                  value={bedrooms} 
                  onChange={(e) => handleInputChange('bedrooms', e.target.value)}
                  onBlur={() => handleBlur('bedrooms')}
                  placeholder="e.g., 2"
                  min={1}
                  max={10}
                  className={touched.bedrooms && errors.bedrooms ? 'error' : ''}
                  required
                />
                {touched.bedrooms && errors.bedrooms && <span className="error-msg">{errors.bedrooms}</span>}
              </div>

              <div className="ap-field">
                <label>Bathrooms <span className="required">*</span></label>
                <input 
                  type="number"
                  value={bathrooms} 
                  onChange={(e) => handleInputChange('bathrooms', e.target.value)}
                  onBlur={() => handleBlur('bathrooms')}
                  placeholder="e.g., 2"
                  min={1}
                  max={10}
                  className={touched.bathrooms && errors.bathrooms ? 'error' : ''}
                  required
                />
                {touched.bathrooms && errors.bathrooms && <span className="error-msg">{errors.bathrooms}</span>}
              </div>

              <div className="ap-field">
                <label>Toilets</label>
                <input 
                  type="number"
                  value={toilets} 
                  onChange={(e) => setToilets(e.target.value)}
                  placeholder="e.g., 1"
                  min={0}
                  max={10}
                />
              </div>
            </div>

            <div className="ap-grid-3">
              <div className="ap-field">
                <label>Balconies</label>
                <input 
                  type="number"
                  value={balconies} 
                  onChange={(e) => setBalconies(e.target.value)}
                  placeholder="e.g., 1"
                  min={0}
                  max={5}
                />
              </div>

              <div className="ap-field">
                <label>Square Footage <span className="required">*</span></label>
                <input 
                  type="number"
                  value={squareFootage} 
                  onChange={(e) => handleInputChange('squareFootage', e.target.value)}
                  onBlur={() => handleBlur('squareFootage')}
                  placeholder="e.g., 1200"
                  min={100}
                  className={touched.squareFootage && errors.squareFootage ? 'error' : ''}
                  required
                />
                {touched.squareFootage && errors.squareFootage && <span className="error-msg">{errors.squareFootage}</span>}
              </div>

              <div className="ap-field">
                <label>Furnishing Status</label>
                <select value={furnishing} onChange={(e) => setFurnishing(e.target.value)}>
                  <option value="">Select furnishing</option>
                  <option value="unfurnished">Unfurnished</option>
                  <option value="semi-furnished">Semi Furnished</option>
                  <option value="fully-furnished">Fully Furnished</option>
                </select>
              </div>
            </div>

            <div className="ap-grid-3">
              <div className="ap-field">
                <label>Property Age</label>
                <select value={propertyAge} onChange={(e) => setPropertyAge(e.target.value)}>
                  <option value="">Select age</option>
                  <option value="0">New Construction</option>
                  <option value="1">1 Year</option>
                  <option value="2">2 Years</option>
                  <option value="3">3 Years</option>
                  <option value="5">5 Years</option>
                  <option value="10">10+ Years</option>
                </select>
              </div>

              <div className="ap-field">
                <label>Total Floors</label>
                <input 
                  type="number"
                  value={floors} 
                  onChange={(e) => setFloors(e.target.value)}
                  placeholder="e.g., 5"
                  min={1}
                  max={50}
                />
              </div>

              <div className="ap-field">
                <label>Floor Number</label>
                <input 
                  type="number"
                  value={floorNumber} 
                  onChange={(e) => setFloorNumber(e.target.value)}
                  placeholder="e.g., 3"
                  min={1}
                  max={50}
                />
              </div>
            </div>
          </div>

          {/* LOCATION */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              Location Information
            </div>
            
            <div className="ap-field">
              <label>Address Line <span className="required">*</span></label>
              <input
                value={addressLine}
                onChange={(e) => handleInputChange('addressLine', e.target.value)}
                onBlur={() => handleBlur('addressLine')}
                placeholder="Street address, area, landmarks"
                className={touched.addressLine && errors.addressLine ? 'error' : ''}
                required
              />
              {touched.addressLine && errors.addressLine && <span className="error-msg">{errors.addressLine}</span>}
            </div>

            <div className="ap-grid-2">
              <div className="ap-field">
                <label>City <span className="required">*</span></label>
                <input 
                  value={city} 
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  onBlur={() => handleBlur('city')}
                  placeholder="e.g., Mumbai"
                  className={touched.city && errors.city ? 'error' : ''}
                  required
                />
                {touched.city && errors.city && <span className="error-msg">{errors.city}</span>}
              </div>
              <div className="ap-field">
                <label>State <span className="required">*</span></label>
                <input 
                  value={state} 
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  onBlur={() => handleBlur('state')}
                  placeholder="e.g., Maharashtra"
                  className={touched.state && errors.state ? 'error' : ''}
                  required
                />
                {touched.state && errors.state && <span className="error-msg">{errors.state}</span>}
              </div>
            </div>

            <div className="ap-grid-2">
              <div className="ap-field">
                <label>Pincode <span className="required">*</span></label>
                <input
                  value={pincode}
                  onChange={(e) => handleInputChange('pincode', e.target.value)}
                  onBlur={() => handleBlur('pincode')}
                  placeholder="6-digit pincode"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className={touched.pincode && errors.pincode ? 'error' : ''}
                  required
                />
                {touched.pincode && errors.pincode && <span className="error-msg">{errors.pincode}</span>}
              </div>

              <div className="ap-field">
                <label>Landmark</label>
                <input
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Nearby landmark for easy identification"
                />
              </div>
            </div>
          </div>

          {/* RENT & TERMS */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              Rent & Terms
            </div>

            <div className="ap-grid-2">
              {ptype !== "pg" && (
                <div className="ap-field">
                  <label>Monthly Rent (Rs) <span className="required">*</span></label>
                  <input
                    type="number"
                    value={rentMonthly}
                    onChange={(e) => handleInputChange('rentMonthly', e.target.value)}
                    onBlur={() => handleBlur('rentMonthly')}
                    onFocus={() => {
                      // Show prediction when user focuses on rent input
                      if (!showPrediction && !predictionLoading && city && bedrooms && bathrooms && squareFootage && furnishing && ptype) {
                        predictRent();
                      }
                    }}
                    placeholder="e.g., 15000"
                    min={1000}
                    className={touched.rentMonthly && errors.rentMonthly ? 'error' : ''}
                    required
                  />
                  
                  {/* Rent Prediction Display */}
                  {(showPrediction && predictedRent) && (
                    <div className="rent-prediction-result">
                      <div className="prediction-header">
                        <span className="prediction-icon">?</span>
                        <span className="prediction-title">
                          {predictionLoading ? 'Calculating...' : 'AI Suggested Rent'}
                        </span>
                        {!predictionLoading && (
                          <button
                            type="button"
                            className="btn-refresh-prediction"
                            onClick={() => {
                              setPredictionError("");
                              predictRent();
                            }}
                            disabled={predictionLoading}
                            title="Update prediction with current property details"
                          >
                            ?
                          </button>
                        )}
                      </div>
                      <div className="prediction-amount">
                        Rs{predictedRent.toLocaleString('en-IN')}/month
                      </div>
                      {rentMonthly && parseInt(rentMonthly) !== predictedRent && (
                        <div className={`comparison-badge ${parseInt(rentMonthly) > predictedRent ? 'higher' : 'lower'}`}>
                          {parseInt(rentMonthly) > predictedRent 
                            ? `⚠️ Your rent is ₹${(parseInt(rentMonthly) - predictedRent).toLocaleString('en-IN')} higher than estimate` 
                            : `✨ Your rent is ₹${(predictedRent - parseInt(rentMonthly)).toLocaleString('en-IN')} lower than estimate` 
                          }
                        </div>
                      )}
                      <div className="prediction-actions">
                        <button 
                          type="button"
                          className="btn-primary btn-use-prediction"
                          onClick={() => {
                            setRentMonthly(predictedRent.toString());
                            setShowPrediction(false);
                            setPredictionError(""); // clear any old error
                          }}
                        >
                          Use This Rent
                        </button>
                        <button 
                          type="button"
                          className="btn-secondary"
                          onClick={() => setShowPrediction(false)}
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="prediction-note">
                        This is an AI estimate based on current property details. Click the refresh button (?) to update if you change any values.
                      </div>
                    </div>
                  )}
                  
                  {/* Real-time prediction loading shimmer effect */}
                  {predictionLoading && (
                    <div className="prediction-shimmer">
                      <div className="shimmer-line shimmer-title"></div>
                      <div className="shimmer-line shimmer-amount"></div>
                      <div className="shimmer-line shimmer-actions"></div>
                    </div>
                  )}
                  
                  {predictionError && (
                    <div className="prediction-error">
                      <span className="error-icon">?</span>
                      {predictionError}
                    </div>
                  )}
                  
                  {touched.rentMonthly && errors.rentMonthly && <span className="error-msg">{errors.rentMonthly}</span>}
                </div>
              )}

              {ptype === "pg" && (
                <div className="ap-field">
                  <label>Rent per Person (Rs) <span className="required">*</span></label>
                  <input
                    type="number"
                    value={rentPerPerson}
                    onChange={(e) => handleInputChange('rentPerPerson', e.target.value)}
                    onFocus={() => {
                      // Show prediction when user focuses on rent input
                      if (!showPrediction && !predictionLoading && city && bedrooms && bathrooms && squareFootage && furnishing && ptype) {
                        predictRent();
                      }
                    }}
                    onBlur={() => handleBlur('rentPerPerson')}
                    placeholder="e.g., 5000"
                    min={1000}
                    className={touched.rentPerPerson && errors.rentPerPerson ? 'error' : ''}
                    required
                  />
                  
                  {/* Rent Prediction Display for PG */}
                  {(showPrediction && predictedRent) && (
                    <div className="rent-prediction-result">
                      <div className="prediction-header">
                        <span className="prediction-icon">?</span>
                        <span className="prediction-title">
                          {predictionLoading ? 'Calculating...' : 'AI Suggested Rent per Person'}
                        </span>
                        {!predictionLoading && (
                          <button
                            type="button"
                            className="btn-refresh-prediction"
                            onClick={() => {
                              setPredictionError("");
                              predictRent();
                            }}
                            disabled={predictionLoading}
                            title="Update prediction with current property details"
                          >
                            ?
                          </button>
                        )}
                      </div>
                      <div className="prediction-amount">
                        Rs{Math.round(predictedRent / bedrooms).toLocaleString('en-IN')}/month
                      </div>
                      <div className="prediction-actions">
                        <button
                          type="button"
                          className="btn-use-prediction"
                          onClick={() => {
                            // Don't auto-fill, just hide the prediction
                            setShowPrediction(false);
                          }}
                        >
                          Got it
                        </button>
                        <button
                          type="button"
                          className="btn-dismiss-prediction"
                          onClick={() => setShowPrediction(false)}
                        >
                          Dismiss
                        </button>
                      </div>
                      <div className="prediction-note">
                        This is an AI estimate based on current property details. Click the refresh button (?) to update if you change any values.
                      </div>
                    </div>
                  )}
                  
                  {/* Real-time prediction loading shimmer effect */}
                  {predictionLoading && (
                    <div className="prediction-shimmer">
                      <div className="shimmer-line shimmer-title"></div>
                      <div className="shimmer-line shimmer-amount"></div>
                      <div className="shimmer-line shimmer-actions"></div>
                    </div>
                  )}
                  
                  {predictionError && (
                    <div className="prediction-error">
                      <span className="error-icon">?</span>
                      {predictionError}
                    </div>
                  )}
                  
                  {touched.rentPerPerson && errors.rentPerPerson && <span className="error-msg">{errors.rentPerPerson}</span>}
                </div>
              )}

              <div className="ap-field">
                <label>Security Deposit (₹) <span className="required">*</span></label>
                <input
                  type="number"
                  value={securityDeposit}
                  onChange={(e) => handleInputChange('securityDeposit', e.target.value)}
                  onBlur={() => handleBlur('securityDeposit')}
                  placeholder="e.g., 30000"
                  min={0}
                  className={touched.securityDeposit && errors.securityDeposit ? 'error' : ''}
                  required
                />
                {touched.securityDeposit && errors.securityDeposit && <span className="error-msg">{errors.securityDeposit}</span>}
              </div>
            </div>

            <div className="ap-grid-3">
              <div className="ap-field">
                <label>Available From <span className="required">*</span></label>
                <input
                  type="date"
                  value={availableDate}
                  onChange={(e) => handleInputChange('availableDate', e.target.value)}
                  onBlur={() => handleBlur('availableDate')}
                  min={new Date().toISOString().split('T')[0]}
                  className={touched.availableDate && errors.availableDate ? 'error' : ''}
                  required
                />
                {touched.availableDate && errors.availableDate && <span className="error-msg">{errors.availableDate}</span>}
              </div>

              <div className="ap-field">
                <label>Lease Duration</label>
                <select value={leaseDuration} onChange={(e) => setLeaseDuration(e.target.value)}>
                  <option value="">Select duration</option>
                  <option value="6-months">6 Months</option>
                  <option value="1-year">1 Year</option>
                  <option value="2-years">2 Years</option>
                  <option value="3-years">3 Years</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>

              <div className="ap-field">
                <label>Maintenance Charge (₹/month)</label>
                <input
                  type="number"
                  value={maintenanceCharge}
                  onChange={(e) => setMaintenanceCharge(e.target.value)}
                  placeholder="e.g., 2000"
                  min={0}
                />
              </div>
            </div>

            <div className="ap-grid-2">
              <div className="ap-field">
                <label>Parking Charge (₹/month)</label>
                <input
                  type="number"
                  value={parkingCharge}
                  onChange={(e) => setParkingCharge(e.target.value)}
                  placeholder="e.g., 1000"
                  min={0}
                />
              </div>

              <div className="ap-field">
                <label>Preferred Tenants</label>
                <select 
                  value={preferredTenants} 
                  onChange={(e) => setPreferredTenants(e.target.value)}
                >
                  <option value="">Select preference</option>
                  <option value="family">Family</option>
                  <option value="bachelors">Bachelors</option>
                  <option value="both">Both</option>
                  <option value="any">No Preference</option>
                </select>
              </div>
            </div>
          </div>

          {/* AMENITIES */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Amenities
            </div>
            
            <div className="form-subsection">
              <div className="subsection-header">
                <h4>Select Available Amenities</h4>
                <span className="selection-counter">
                  {selectedAmenities.length} of {amenitiesList.length} selected
                </span>
              </div>
              <div className="checkbox-grid">
                {amenitiesList.map((amenity) => (
                  <label key={amenity} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedAmenities.includes(amenity)}
                      onChange={() => handleAmenityToggle(amenity)}
                    />
                    <span className="checkbox-custom"></span>
                    {amenity}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* NEARBY PLACES */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              Nearby Places
            </div>
            
            <div className="form-subsection">
              <div className="subsection-header">
                <h4>Select Nearby Places (within 2km)</h4>
                <span className="selection-counter">
                  {selectedNearby.length} of {nearbyPlacesList.length} selected
                </span>
              </div>
              <div className="checkbox-grid">
                {nearbyPlacesList.map((place) => (
                  <label key={place} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedNearby.includes(place)}
                      onChange={() => handleNearbyToggle(place)}
                    />
                    <span className="checkbox-custom"></span>
                    {place}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ROOM UPLOADS */}
          <div className="form-section">
            <div className="form-section-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
              Property Photos & Videos
            </div>
            
            <div className="room-uploads">
              <div className="room-header">
                <h4>📸 Upload Room Photos</h4>
                <div className="room-stats">
                  {Object.keys(roomUploads).map((room) => (
                    roomUploads[room].length > 0 && (
                      <span key={room} className="room-stat">
                        {room.replace("_", " ").toUpperCase()}: {roomUploads[room].length}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Room Selection and Photo Upload */}
              <div className="upload-workflow">
                <div className="room-selector-section">
                  <div className="ap-field">
                    <label>Select Room Type</label>
                    <select 
                      value={selectedRoom} 
                      onChange={(e) => setSelectedRoom(e.target.value)}
                      className="room-select"
                    >
                      <option value="">Choose a room...</option>
                      {commonRoomsList.map((room) => (
                        <option key={room.value} value={room.value}>
                          {room.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedRoom && (
                  <div className="photo-upload-section">
                    <div className="upload-area">
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        id="photo-upload"
                        style={{ display: 'none' }}
                      />
                      <button 
                        type="button" 
                        className="btn-select-photos"
                        onClick={() => document.getElementById('photo-upload').click()}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="17 8 12 3 7 8"></polyline>
                          <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        Select Photos for {COMMON_ROOMS.find(r => r.value === selectedRoom)?.label}
                      </button>
                    </div>

                    {tempFiles.length > 0 && (
                      <div className="temp-files-section">
                        <div className="temp-files-header">
                          <span>Selected Photos ({tempFiles.length})</span>
                          <div className="temp-files-actions">
                            <button 
                              type="button" 
                              className="btn-add-photos"
                              onClick={handleAddPhotos}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                              Add to {COMMON_ROOMS.find(r => r.value === selectedRoom)?.label}
                            </button>
                            <button 
                              type="button" 
                              className="btn-clear-temp"
                              onClick={clearTempFiles}
                            >
                              Clear All
                            </button>
                          </div>
                        </div>
                        <div className="temp-files-preview">
                          {tempFiles.map((file, index) => (
                            <div key={index} className="temp-file-item">
                              <div className="temp-file-thumbnail">
                                <img 
                                  src={URL.createObjectURL(file)} 
                                  alt={`Selected ${index + 1}`}
                                  onLoad={() => URL.revokeObjectURL(file)}
                                />
                                <button 
                                  type="button"
                                  className="btn-remove-temp"
                                  onClick={() => removeTempFile(index)}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </div>
                              <span className="temp-file-name">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Uploaded Photos Display */}
              {Object.keys(roomUploads).length > 0 && (
                <div className="uploaded-photos-section">
                  <h5>📁 Uploaded Photos</h5>
                  {Object.entries(roomUploads).map(([room, files]) => (
                    files.length > 0 && (
                      <div key={room} className="room-photos">
                        <div className="room-photos-header">
                          <span className="room-title">
                            {COMMON_ROOMS.find(r => r.value === room)?.label || room.replace("_", " ").toUpperCase()}
                          </span>
                          <span className="photo-count">{files.length} photos</span>
                        </div>
                        <div className="photo-preview">
                          {files.map((file, index) => (
                            <div key={index} className="photo-item">
                              <div className="photo-thumbnail">
                                <img 
                                  src={URL.createObjectURL(file)} 
                                  alt={`${room} ${index + 1}`}
                                  onLoad={() => URL.revokeObjectURL(file)}
                                />
                                <div className="photo-overlay">
                                  <button 
                                    type="button"
                                    className="btn-remove"
                                    onClick={() => removePhoto(room, index)}
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="18" y1="6" x2="6" y2="18"></line>
                                      <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                              <span className="photo-name">{file.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {Object.keys(roomUploads).length === 0 && (
                <div className="upload-placeholder">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                  <p>No photos uploaded yet</p>
                  <p className="upload-hint">Select a room type and choose photos from your device</p>
                </div>
              )}
            </div>

            <div className="ap-field">
              <label>Property Video (optional)</label>
              <div className="video-upload-section">
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files[0])}
                  id="video-upload"
                  style={{ display: 'none' }}
                />
                <button 
                  type="button" 
                  className="btn-upload-video"
                  onClick={() => document.getElementById('video-upload').click()}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Choose Video
                </button>
                {videoFile && (
                  <div className="video-preview">
                    <span className="video-name">📹 {videoFile.name}</span>
                    <button 
                      type="button"
                      className="btn-remove-video"
                      onClick={() => setVideoFile(null)}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {!videoFile && (
                  <p className="upload-hint">Upload a video tour of your property (optional)</p>
                )}
              </div>
            </div>
          </div>

          <div className="ap-actions">
            <button type="button" className="btn-outline" onClick={() => window.history.back()}>
              Cancel
            </button>
            <button type="submit" className={`btn-primary ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? (
                <>
                  <div className="btn-spinner"></div>
                  Creating Property...
                </>
              ) : (
                "Submit Property"
              )}
            </button>
          </div>

          {msg && (
            <div className={`form-msg ${msg.includes('success') || msg.includes('Property added') ? 'success' : 'error'}`}>
              {msg}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
