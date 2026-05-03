// backend/src/middleware/validation.js - Comprehensive Input Validation Middleware

/**
 * Validation schemas and utilities for input validation
 */

/**
 * Common validation patterns
 */
const patterns = {
  email: /^[^\s]*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\s*$/,
  phone: /^[6-9]\d{9}$/,
  pincode: /^\d{6}$/,
  name: /^[a-zA-Z\s.]{2,100}$/,
  alphanumeric: /^[a-zA-Z0-9\s\-_]{2,100}$/,
  url: /^https?:\/\/.+/,
  objectId: /^[a-zA-Z0-9\-_]{20,}$/,
  firebaseUid: /^[a-zA-Z0-9\-_]{20,}$/,
  price: /^\d+(\.\d{1,2})?$/,
  nonEmptyString: /.+/,
  positiveNumber: /^[1-9]\d*$/,
  positiveFloat: /^([1-9]\d*\.?\d*|0\.\d*[1-9]\d*)$/,
  indianMobile: /^[6-9]\d{9}$/,
  indianPincode: /^\d{6}$/,
  safeString: /^[a-zA-Z0-9\s\-_.,@#$%&*()!?]{1,500}$/,
  propertyTitle: /^[a-zA-Z0-9\s\-_.,]{5,200}$/,
  description: /^[a-zA-Z0-9\s\-_.,@#$%&*()!?]{10,2000}$/,
  pgGender: /^(male|female|co-ed)$/i,
  propertyType: /^(apartment|house|villa|pg|studio|penthouse)$/i,
  furnishing: /^(unfurnished|semi-furnished|fully-furnished)$/i
};

/**
 * Validation error messages
 */
const messages = {
  required: (field) => `${field} is required`,
  invalid: (field) => `Invalid ${field} format`,
  tooShort: (field, min) => `${field} must be at least ${min} characters`,
  tooLong: (field, max) => `${field} must not exceed ${max} characters`,
  invalidEmail: 'Please enter a valid email address',
  invalidPhone: 'Please enter a valid 10-digit mobile number starting with 6-9',
  invalidPincode: 'Please enter a valid 6-digit PIN code',
  invalidPrice: 'Please enter a valid price',
  negativePrice: 'Price cannot be negative',
  priceTooLow: 'Price must be at least ₹1',
  priceTooHigh: 'Price cannot exceed ₹10,00,00,000',
  invalidDate: 'Please enter a valid date',
  pastDate: 'Date cannot be in the past',
  invalidUrl: 'Please enter a valid URL',
  invalidGender: 'Gender must be male, female, or co-ed',
  invalidPropertyType: 'Property type must be apartment, house, villa, pg, studio, or penthouse',
  invalidFurnishing: 'Furnishing must be unfurnished, semi-furnished, or fully-furnished',
  invalidObjectId: 'Invalid ID format',
  invalidUid: 'Invalid user ID format',
  emptyString: 'Field cannot be empty',
  invalidNumber: 'Please enter a valid number',
  invalidFloat: 'Please enter a valid decimal number',
  invalidRange: (field, min, max) => `${field} must be between ${min} and ${max}`,
  invalidSelection: (field) => `Please select a valid ${field}`,
  arrayTooShort: (field, min) => `At least ${min} ${field} required`,
  arrayTooLong: (field, max) => `Maximum ${max} ${field} allowed`,
  invalidArrayItem: (field) => `Invalid ${field} item`,
  invalidFile: (field, types) => `${field} must be one of: ${types.join(', ')}`,
  fileSizeTooLarge: (field, maxSize) => `${field} size cannot exceed ${maxSize}MB`,
  invalidImageFormat: 'Image must be JPEG, PNG, or WebP format',
  invalidDocFormat: 'Document must be PDF format',
  invalidAddress: 'Please enter a complete address',
  invalidName: 'Name can only contain letters, spaces, and dots (2-100 characters)',
  invalidDescription: 'Description contains invalid characters or is too short/long'
};

/**
 * Core validation functions
 */
const validators = {
  // String validators
  isString: (value) => typeof value === 'string',
  isNonEmptyString: (value) => validators.isString(value) && value.trim().length > 0,
  isValidEmail: (value) => patterns.email.test(value),
  isValidPhone: (value) => patterns.phone.test(value),
  isValidPincode: (value) => patterns.pincode.test(value),
  isValidName: (value) => patterns.name.test(value),
  isValidObjectId: (value) => patterns.objectId.test(value),
  isValidFirebaseUid: (value) => patterns.firebaseUid.test(value),
  isValidUrl: (value) => patterns.url.test(value),
  isValidPrice: (value) => patterns.price.test(value),
  isPositiveNumber: (value) => patterns.positiveNumber.test(value),
  isPositiveFloat: (value) => patterns.positiveFloat.test(value),
  isValidPropertyTitle: (value) => patterns.propertyTitle.test(value),
  isValidDescription: (value) => patterns.description.test(value),
  isValidPgGender: (value) => patterns.pgGender.test(value),
  isValidPropertyType: (value) => patterns.propertyType.test(value),
  isValidFurnishing: (value) => patterns.furnishing.test(value),
  
  // Number validators
  isNumber: (value) => typeof value === 'number' && !isNaN(value),
  isInteger: (value) => validators.isNumber(value) && Number.isInteger(value),
  isFloat: (value) => validators.isNumber(value) && !Number.isInteger(value),
  
  // Array validators
  isArray: (value) => Array.isArray(value),
  isNonEmptyArray: (value) => validators.isArray(value) && value.length > 0,
  
  // Date validators
  isDate: (value) => value instanceof Date || !isNaN(Date.parse(value)),
  isValidDate: (value) => {
    const date = new Date(value);
    return validators.isDate(date) && date.toString() !== 'Invalid Date';
  },
  isFutureDate: (value) => {
    const date = new Date(value);
    return validators.isValidDate(value) && date > new Date();
  },
  
  // Range validators
  isInRange: (value, min, max) => {
    const num = Number(value);
    return !isNaN(num) && num >= min && num <= max;
  },
  isStringInRange: (value, min, max) => {
    return validators.isString(value) && value.length >= min && value.length <= max;
  },
  
  // Special validators
  isValidIndianMobile: (value) => patterns.indianMobile.test(value),
  isValidIndianPincode: (value) => patterns.indianPincode.test(value),
  isValidPriceRange: (value) => {
    const price = Number(value);
    return validators.isPositiveNumber(value) && price >= 1 && price <= 1000000000;
  },
  
  // File validators
  isValidFileSize: (fileSize, maxSizeMB) => {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    return fileSize <= maxSizeBytes;
  },
  isValidImageFormat: (filename) => {
    const validFormats = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return validFormats.includes(ext);
  },
  isValidDocFormat: (filename) => {
    const validFormats = ['.pdf'];
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return validFormats.includes(ext);
  }
};

/**
 * Validation schema builder
 */
class ValidationSchema {
  constructor() {
    this.rules = {};
  }

  /**
   * Add a required field validation
   */
  required(field, customMessage = null) {
    this.rules[field] = {
      ...this.rules[field],
      required: true,
      message: customMessage || messages.required(field)
    };
    return this;
  }

  /**
   * Add string validation
   */
  string(field, options = {}) {
    const {
      min,
      max,
      pattern,
      customMessage,
      trim = true
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'string',
      min,
      max,
      pattern,
      trim,
      message: customMessage
    };
    return this;
  }

  /**
   * Add number validation
   */
  number(field, options = {}) {
    const {
      min,
      max,
      integer = false,
      positive = false,
      customMessage
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'number',
      min,
      max,
      integer,
      positive,
      message: customMessage
    };
    return this;
  }

  /**
   * Add email validation
   */
  email(field, customMessage = null) {
    this.rules[field] = {
      ...this.rules[field],
      type: 'email',
      message: customMessage || messages.invalidEmail
    };
    return this;
  }

  /**
   * Add phone validation
   */
  phone(field, customMessage = null) {
    this.rules[field] = {
      ...this.rules[field],
      type: 'phone',
      message: customMessage || messages.invalidPhone
    };
    return this;
  }

  /**
   * Add price validation
   */
  price(field, options = {}) {
    const {
      min = 1,
      max = 1000000000,
      customMessage
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'price',
      min,
      max,
      message: customMessage || messages.invalidPrice
    };
    return this;
  }

  /**
   * Add array validation
   */
  array(field, options = {}) {
    const {
      min,
      max,
      itemType,
      customMessage
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'array',
      min,
      max,
      itemType,
      message: customMessage
    };
    return this;
  }

  /**
   * Add date validation
   */
  date(field, options = {}) {
    const {
      future = false,
      past = false,
      customMessage
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'date',
      future,
      past,
      message: customMessage
    };
    return this;
  }

  /**
   * Add enum validation
   */
  enum(field, values, customMessage = null) {
    this.rules[field] = {
      ...this.rules[field],
      type: 'enum',
      values,
      message: customMessage || messages.invalidSelection(field)
    };
    return this;
  }

  /**
   * Add custom validation
   */
  custom(field, validator, customMessage = null) {
    this.rules[field] = {
      ...this.rules[field],
      type: 'custom',
      validator,
      message: customMessage
    };
    return this;
  }

  /**
   * Add file validation
   */
  file(field, options = {}) {
    const {
      maxSizeMB = 5,
      formats,
      customMessage
    } = options;

    this.rules[field] = {
      ...this.rules[field],
      type: 'file',
      maxSizeMB,
      formats,
      message: customMessage
    };
    return this;
  }
}

/**
 * Validation middleware factory
 */
const validate = (schema) => {
  return (req, res, next) => {
    const errors = {};
    const validatedData = {};

    // Validate each field according to schema
    for (const [field, rule] of Object.entries(schema.rules)) {
      const value = req.body[field];
      
      try {
        // Check if field is required
        if (rule.required && (value === undefined || value === null || value === '')) {
          errors[field] = rule.message || messages.required(field);
          continue;
        }

        // Skip validation if field is not required and not provided
        if (!rule.required && (value === undefined || value === null || value === '')) {
          continue;
        }

        // Validate based on type
        const validationResult = validateField(field, value, rule);
        
        if (validationResult.isValid) {
          validatedData[field] = validationResult.value;
        } else {
          errors[field] = validationResult.error;
        }
      } catch (error) {
        errors[field] = `Validation error for ${field}: ${error.message}`;
      }
    }

    // If there are validation errors, return 400
    if (Object.keys(errors).length > 0) {
      console.error('❌ Validation errors:', errors);
      return res.status(400).json({
        message: 'Validation failed',
        errors,
        code: 'VALIDATION_ERROR'
      });
    }

    // Attach validated data to request
    req.validatedBody = validatedData;
    next();
  };
};

/**
 * Validate a single field
 */
function validateField(field, value, rule) {
  switch (rule.type) {
    case 'string':
      return validateString(field, value, rule);
    
    case 'number':
      return validateNumber(field, value, rule);
    
    case 'email':
      return validateEmail(field, value, rule);
    
    case 'phone':
      return validatePhone(field, value, rule);
    
    case 'price':
      return validatePrice(field, value, rule);
    
    case 'array':
      return validateArray(field, value, rule);
    
    case 'date':
      return validateDate(field, value, rule);
    
    case 'enum':
      return validateEnum(field, value, rule);
    
    case 'file':
      return validateFile(field, value, rule);
    
    case 'custom':
      return validateCustom(field, value, rule);
    
    default:
      return { isValid: true, value };
  }
}

/**
 * String validation
 */
function validateString(field, value, rule) {
  let processedValue = value;

  // Trim string if specified
  if (rule.trim && typeof processedValue === 'string') {
    processedValue = processedValue.trim();
  }

  // Check if string is valid
  if (!validators.isString(processedValue)) {
    return { isValid: false, error: rule.message || messages.invalid(field) };
  }

  // Length validation
  if (rule.min && processedValue.length < rule.min) {
    return { isValid: false, error: rule.message || messages.tooShort(field, rule.min) };
  }

  if (rule.max && processedValue.length > rule.max) {
    return { isValid: false, error: rule.message || messages.tooLong(field, rule.max) };
  }

  // Pattern validation
  if (rule.pattern && !rule.pattern.test(processedValue)) {
    return { isValid: false, error: rule.message || messages.invalid(field) };
  }

  return { isValid: true, value: processedValue };
}

/**
 * Number validation
 */
function validateNumber(field, value, rule) {
  // Convert to number if string
  let numValue = value;
  if (typeof value === 'string') {
    numValue = parseFloat(value);
  }

  // Check if valid number
  if (!validators.isNumber(numValue) || isNaN(numValue)) {
    return { isValid: false, error: rule.message || messages.invalidNumber };
  }

  // Integer validation
  if (rule.integer && !validators.isInteger(numValue)) {
    return { isValid: false, error: rule.message || messages.invalidNumber };
  }

  // Positive validation
  if (rule.positive && numValue <= 0) {
    return { isValid: false, error: rule.message || messages.negativePrice };
  }

  // Range validation
  if (rule.min !== undefined && numValue < rule.min) {
    return { isValid: false, error: rule.message || messages.invalidRange(field, rule.min, rule.max) };
  }

  if (rule.max !== undefined && numValue > rule.max) {
    return { isValid: false, error: rule.message || messages.invalidRange(field, rule.min, rule.max) };
  }

  return { isValid: true, value: numValue };
}

/**
 * Email validation
 */
function validateEmail(field, value, rule) {
  if (!validators.isValidEmail(value)) {
    return { isValid: false, error: rule.message };
  }
  return { isValid: true, value: value.trim().toLowerCase() };
}

/**
 * Phone validation
 */
function validatePhone(field, value, rule) {
  if (!validators.isValidPhone(value)) {
    return { isValid: false, error: rule.message };
  }
  return { isValid: true, value: value.trim() };
}

/**
 * Price validation
 */
function validatePrice(field, value, rule) {
  let priceValue = value;
  if (typeof value === 'string') {
    priceValue = parseFloat(value);
  }

  if (!validators.isNumber(priceValue) || isNaN(priceValue)) {
    return { isValid: false, error: rule.message };
  }

  if (!validators.isPositiveNumber(priceValue)) {
    return { isValid: false, error: messages.negativePrice };
  }

  if (priceValue < (rule.min || 1)) {
    return { isValid: false, error: messages.priceTooLow };
  }

  if (priceValue > (rule.max || 1000000000)) {
    return { isValid: false, error: messages.priceTooHigh };
  }

  return { isValid: true, value: priceValue };
}

/**
 * Array validation
 */
function validateArray(field, value, rule) {
  if (!validators.isArray(value)) {
    return { isValid: false, error: `Field ${field} must be an array` };
  }

  // Length validation
  if (rule.min && value.length < rule.min) {
    return { isValid: false, error: messages.arrayTooShort(field, rule.min) };
  }

  if (rule.max && value.length > rule.max) {
    return { isValid: false, error: messages.arrayTooLong(field, rule.max) };
  }

  // Item type validation
  if (rule.itemType) {
    for (let i = 0; i < value.length; i++) {
      const itemValidation = validateField(`${field}[${i}]`, value[i], { type: rule.itemType });
      if (!itemValidation.isValid) {
        return { isValid: false, error: messages.invalidArrayItem(field) };
      }
    }
  }

  return { isValid: true, value };
}

/**
 * Date validation
 */
function validateDate(field, value, rule) {
  let dateValue = value;
  
  // Convert string to Date if needed
  if (typeof value === 'string') {
    dateValue = new Date(value);
  }

  if (!validators.isValidDate(dateValue)) {
    return { isValid: false, error: rule.message || messages.invalidDate };
  }

  // Future date validation
  if (rule.future && !validators.isFutureDate(dateValue)) {
    return { isValid: false, error: rule.message || messages.pastDate };
  }

  // Past date validation
  if (rule.past && validators.isFutureDate(dateValue)) {
    return { isValid: false, error: rule.message || messages.pastDate };
  }

  return { isValid: true, value: dateValue };
}

/**
 * Enum validation
 */
function validateEnum(field, value, rule) {
  if (!rule.values.includes(value)) {
    return { isValid: false, error: rule.message || messages.invalidSelection(field) };
  }
  return { isValid: true, value };
}

/**
 * Custom validation
 */
function validateCustom(field, value, rule) {
  try {
    const result = rule.validator(value);
    if (result === true || (result && result.isValid)) {
      return { isValid: true, value: result.value || value };
    } else {
      return { isValid: false, error: result.error || rule.message };
    }
  } catch (error) {
    return { isValid: false, error: rule.message || `Validation error: ${error.message}` };
  }
}

/**
 * File validation
 */
function validateFile(field, value, rule) {
  // Handle multer file object
  const file = value;
  
  if (!file || !file.originalname) {
    return { isValid: false, error: 'No file provided' };
  }

  // File size validation
  if (rule.maxSizeMB && !validators.isValidFileSize(file.size, rule.maxSizeMB)) {
    return { isValid: false, error: messages.fileSizeTooLarge(field, rule.maxSizeMB) };
  }

  // File format validation
  if (rule.formats) {
    let isValidFormat = false;
    for (const format of rule.formats) {
      if (format === 'image' && validators.isValidImageFormat(file.originalname)) {
        isValidFormat = true;
        break;
      }
      if (format === 'document' && validators.isValidDocFormat(file.originalname)) {
        isValidFormat = true;
        break;
      }
      if (file.originalname.toLowerCase().endsWith(format)) {
        isValidFormat = true;
        break;
      }
    }

    if (!isValidFormat) {
      const formatNames = rule.formats.map(f => f.startsWith('.') ? f : `.${f}`);
      return { isValid: false, error: messages.invalidFile(field, formatNames) };
    }
  }

  return { isValid: true, value: file };
}

/**
 * Pre-built validation schemas
 */
const schemas = {
  // Property validation schema
  property: () => new ValidationSchema()
    .required('title')
    .string('title', { min: 5, max: 200, pattern: patterns.propertyTitle })
    .required('address')
    .custom('address', (address) => {
      if (!address || typeof address !== 'object') {
        return { isValid: false, error: 'Address is required and must be an object' };
      }
      
      const { line, city, state, pincode } = address;
      
      if (!line || !line.trim()) {
        return { isValid: false, error: 'Address line is required' };
      }
      
      if (!city || !city.trim()) {
        return { isValid: false, error: 'City is required' };
      }
      
      if (!state || !state.trim()) {
        return { isValid: false, error: 'State is required' };
      }
      
      if (!pincode || !patterns.indianPincode.test(pincode)) {
        return { isValid: false, error: messages.invalidPincode };
      }
      
      return { isValid: true, value: address };
    })
    .required('type')
    .enum('type', ['apartment', 'house', 'villa', 'pg', 'studio', 'penthouse'])
    .string('description', { min: 10, max: 2000, pattern: patterns.description })
    .number('bedrooms', { min: 0, max: 20, integer: true })
    .number('bathrooms', { min: 0, max: 10, integer: true })
    .number('squareFootage', { min: 100, max: 10000 })
    .enum('furnishing', ['unfurnished', 'semi-furnished', 'fully-furnished'])
    .number('rent', { min: 500, max: 1000000, positive: true })
    .number('securityDeposit', { min: 0, max: 500000, positive: true })
    .array('amenities', { max: 50 }),

  // User profile validation schema
  userProfile: () => new ValidationSchema()
    .required('name')
    .string('name', { min: 2, max: 100, pattern: patterns.name })
    .phone('phone')
    .email('email')
    .string('address', { min: 10, max: 500 })
    .string('city', { min: 2, max: 50 })
    .string('state', { min: 2, max: 50 })
    .string('pincode', { pattern: patterns.indianPincode }),

  // Payment validation schema
  payment: () => new ValidationSchema()
    .required('amount')
    .price('amount', { min: 1, max: 1000000 })
    .required('paymentMethod')
    .enum('paymentMethod', ['cash', 'online', 'bank_transfer', 'upi'])
    .string('transactionId'),

  // Chat message validation schema
  chatMessage: () => new ValidationSchema()
    .required('message')
    .string('message', { min: 1, max: 1000, pattern: patterns.safeString })
    .enum('messageType', ['text', 'image', 'document']),

  // Document validation schema
  document: () => new ValidationSchema()
    .file('idProof', { maxSizeMB: 2, formats: ['document'] })
    .file('photo', { maxSizeMB: 1, formats: ['image'] })
};

module.exports = {
  ValidationSchema,
  validate,
  schemas,
  validators,
  patterns,
  messages
};
