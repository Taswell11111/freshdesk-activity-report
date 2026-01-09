const SERVER_API_KEY = process.env.FRESHDESK_API_KEY;

// Configure GCS
// When running on Google Cloud, the Storage client will automatically
// use the service account associated with the Cloud Run service.
// For local development, ensure you've run `gcloud auth application-default login`.
const storage = new Storage();
const BUCKET_NAME = 'freshdesk_executive_report';

// 1. Basic Middleware

