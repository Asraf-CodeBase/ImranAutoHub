// config.js - Place this in your frontend folder
// Update these values after deployment

const config = {
    // Development
    development: {
        API_URL: 'http://localhost:5000/api',
        SOCKET_URL: 'http://localhost:5000'
    },
    
    // Production (Update with your actual Hostinger domain)
    production: {
        API_URL: 'https://imran-auto-hub-backend.vercel.app/api',
        SOCKET_URL: 'https://yourdomain.com'
    }
};

// Auto-detect environment
const isDevelopment = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const ENV = isDevelopment ? config.development : config.production;

// Export configuration
window.APP_CONFIG = ENV;

console.log('Environment:', isDevelopment ? 'Development' : 'Production');
console.log('API URL:', ENV.API_URL);

window.APP_CONFIG = {
    API_URL: 'https://your-backend-name.vercel.app/api'
};
