const { logger } = require('../utils/logger');

const ERROR_MESSAGES = {
  PRIVATE_VIDEO: 'This video is private and cannot be accessed.',
  UNAVAILABLE_VIDEO: 'This video is unavailable or has been removed.',
  DELETED_VIDEO: 'This video has been deleted.',
  COPYRIGHT_RESTRICTED: 'This content is restricted due to copyright.',
  AGE_RESTRICTED: 'This content is age-restricted and cannot be downloaded.',
  EXTRACTION_FAILED: 'Failed to extract media information. Please check the URL and try again.',
  PARSE_FAILED: 'Failed to process media data. Please try again.',
  DOWNLOAD_URL_FAILED: 'Failed to generate download link. Please try again.',
  UNSUPPORTED_PLATFORM: 'This platform is not supported yet.',
  INVALID_URL: 'Please enter a valid media URL.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
};

function errorHandler(err, req, res, next) {
  const code = err.message;
  const friendly = ERROR_MESSAGES[code];

  if (friendly) {
    return res.status(422).json({
      success: false,
      error: friendly,
      code,
    });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: err.errors[0]?.message || 'Invalid input',
      code: 'VALIDATION_ERROR',
    });
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'CORS_ERROR',
    });
  }

  logger.error(`Unhandled error [${req.method} ${req.path}]:`, err);

  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again.',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = { errorHandler, ERROR_MESSAGES };
