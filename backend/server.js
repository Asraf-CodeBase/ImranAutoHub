const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection with connection pooling for serverless
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    console.log('✅ Using cached database connection');
    return cachedDb;
  }

  try {
    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
    };

    await mongoose.connect(process.env.MONGODB_URI, opts);
    cachedDb = mongoose.connection;
    console.log('✅ New MongoDB connection established');
    return cachedDb;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    throw error;
  }
}

// Schemas
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const vehicleSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  brand: { type: String, required: true },
  model: { type: String, required: true },
  year: { type: Number, required: true },
  price: { type: Number, required: true },
  type: { type: String, required: true },
  condition: { type: String, required: true },
  mileage: { type: Number, required: true },
  description: { type: String },
  images: [{ type: String }],
  contactName: { type: String, required: true },
  contactPhone: { type: String, required: true },
  status: { type: String, default: 'available' },
  createdAt: { type: Date, default: Date.now }
});

const bidSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const bookingSchema = new mongoose.Schema({
  vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bidId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
  finalPrice: { type: Number, required: true },
  status: { type: String, default: 'confirmed' },
  createdAt: { type: Date, default: Date.now }
});

const resetTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 }
});

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);
const Bid = mongoose.models.Bid || mongoose.model('Bid', bidSchema);
const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
const ResetToken = mongoose.models.ResetToken || mongoose.model('ResetToken', resetTokenSchema);

// Cloudinary Configuration for Image Uploads
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer Configuration for Memory Storage (Vercel serverless)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    } else {
      return cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) are allowed!'), false);
    }
  }
});

// Helper function to upload to Cloudinary
async function uploadToCloudinary(fileBuffer, filename) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'autohub-vehicles',
        public_id: `${Date.now()}-${filename}`,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';

// Email Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    await connectToDatabase();
    res.json({ 
      status: 'OK', 
      database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'Error', 
      message: error.message 
    });
  }
});

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { name, email, password, phone } = req.body;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      name,
      email,
      password: hashedPassword,
      phone
    });
    
    await user.save();
    
    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Post Vehicle with Cloudinary Upload
app.post('/api/vehicles', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    await connectToDatabase();
    
    const { brand, model, year, price, type, condition, mileage, description, contactName, contactPhone } = req.body;
    
    if (!brand || !model || !year || !price || !type || !condition || !mileage || !contactName || !contactPhone) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required' });
    }
    
    // Upload images to Cloudinary
    const imageUploadPromises = req.files.map(file => 
      uploadToCloudinary(file.buffer, file.originalname)
    );
    
    const imageUrls = await Promise.all(imageUploadPromises);
    
    const vehicle = new Vehicle({
      sellerId: req.user.userId,
      brand,
      model,
      year: parseInt(year),
      price: parseFloat(price),
      type,
      condition,
      mileage: parseInt(mileage),
      description,
      images: imageUrls,
      contactName,
      contactPhone
    });
    
    await vehicle.save();
    
    res.status(201).json({ message: 'Vehicle posted successfully', vehicle });
  } catch (error) {
    console.error('Vehicle post error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get All Vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { brand, type, minPrice, maxPrice, minYear, maxYear, status } = req.query;
    
    let filter = {};
    
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (type) filter.type = type;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    if (minYear || maxYear) {
      filter.year = {};
      if (minYear) filter.year.$gte = parseInt(minYear);
      if (maxYear) filter.year.$lte = parseInt(maxYear);
    }
    if (status) filter.status = status;
    else filter.status = 'available';
    
    const vehicles = await Vehicle.find(filter)
      .populate('sellerId', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(vehicles);
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single Vehicle
app.get('/api/vehicles/:id', async (req, res) => {
  try {
    await connectToDatabase();
    
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('sellerId', 'name email phone');
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Place Bid
app.post('/api/bids', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    
    const { vehicleId, amount } = req.body;
    
    if (!vehicleId || !amount) {
      return res.status(400).json({ message: 'Vehicle ID and amount required' });
    }
    
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    if (vehicle.status !== 'available') {
      return res.status(400).json({ message: 'Vehicle is no longer available' });
    }
    
    if (vehicle.sellerId.toString() === req.user.userId) {
      return res.status(400).json({ message: 'You cannot bid on your own vehicle' });
    }
    
    if (parseFloat(amount) <= vehicle.price) {
      return res.status(400).json({ message: 'Bid must be higher than current price' });
    }
    
    const highestBid = await Bid.findOne({ vehicleId, status: 'pending' })
      .sort({ amount: -1 });
    
    if (highestBid && parseFloat(amount) <= highestBid.amount) {
      return res.status(400).json({ message: 'Bid must be higher than current highest bid' });
    }
    
    const bid = new Bid({
      vehicleId,
      userId: req.user.userId,
      amount: parseFloat(amount)
    });
    
    await bid.save();
    
    res.status(201).json({ message: 'Bid placed successfully', bid });
  } catch (error) {
    console.error('Bid error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Bids for Vehicle
app.get('/api/vehicles/:id/bids', async (req, res) => {
  try {
    await connectToDatabase();
    
    const bids = await Bid.find({ vehicleId: req.params.id, status: 'pending' })
      .populate('userId', 'name email')
      .sort({ amount: -1 });
    
    res.json(bids);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Confirm Booking
app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    
    const { vehicleId } = req.body;
    
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }
    
    if (vehicle.status !== 'available') {
      return res.status(400).json({ message: 'Vehicle already booked' });
    }
    
    if (vehicle.sellerId.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Only seller can confirm booking' });
    }
    
    const highestBid = await Bid.findOne({ vehicleId, status: 'pending' })
      .sort({ amount: -1 });
    
    if (!highestBid) {
      return res.status(400).json({ message: 'No bids available' });
    }
    
    const booking = new Booking({
      vehicleId,
      buyerId: highestBid.userId,
      sellerId: vehicle.sellerId,
      bidId: highestBid._id,
      finalPrice: highestBid.amount
    });
    
    await booking.save();
    
    vehicle.status = 'sold';
    await vehicle.save();
    
    highestBid.status = 'accepted';
    await highestBid.save();
    
    await Bid.updateMany(
      { vehicleId, _id: { $ne: highestBid._id }, status: 'pending' },
      { status: 'rejected' }
    );
    
    res.status(201).json({ message: 'Booking confirmed', booking });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User's Posted Vehicles
app.get('/api/user/vehicles', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    
    const vehicles = await Vehicle.find({ sellerId: req.user.userId })
      .sort({ createdAt: -1 });
    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User's Bids
app.get('/api/user/bids', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    
    const bids = await Bid.find({ userId: req.user.userId })
      .populate('vehicleId')
      .sort({ createdAt: -1 });
    res.json(bids);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User's Bookings
app.get('/api/user/bookings', authenticateToken, async (req, res) => {
  try {
    await connectToDatabase();
    
    const bookings = await Booking.find({
      $or: [
        { buyerId: req.user.userId },
        { sellerId: req.user.userId }
      ]
    })
    .populate('vehicleId')
    .populate('buyerId', 'name email phone')
    .populate('sellerId', 'name email phone')
    .sort({ createdAt: -1 });
    
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Password Reset Routes

// Request Password Reset
app.post('/api/forgot-password', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.json({ message: 'If an account exists with this email, a reset link has been sent.' });
    }
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    await ResetToken.deleteMany({ userId: user._id });
    
    await ResetToken.create({
      userId: user._id,
      token: hashedToken
    });
    
    const baseUrl = process.env.BASE_URL || 'https://your-frontend-domain.vercel.app';
    const resetUrl = `${baseUrl}/frontend/pages/reset-password.html?token=${resetToken}&email=${email}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'AutoHub - Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; 
              padding: 30px; 
              text-align: center; 
              border-radius: 10px 10px 0 0; 
            }
            .content { 
              background: #f9f9f9; 
              padding: 30px; 
              border-radius: 0 0 10px 10px; 
            }
            .button { 
              display: inline-block; 
              padding: 15px 30px; 
              background: #2563eb; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
            }
            .footer { 
              text-align: center; 
              margin-top: 20px; 
              color: #666; 
              font-size: 12px; 
            }
            .warning { 
              background: #fff3cd; 
              padding: 15px; 
              border-left: 4px solid #ffc107; 
              margin: 20px 0; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔒 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hello <strong>${user.name}</strong>,</p>
              
              <p>We received a request to reset your password for your AutoHub account.</p>
              
              <p>Click the button below to reset your password:</p>
              
              <center>
                <a href="${resetUrl}" class="button">Reset Password</a>
              </center>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="background: #fff; padding: 10px; border: 1px solid #ddd; word-break: break-all;">${resetUrl}</p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>This link will expire in <strong>1 hour</strong></li>
                  <li>If you didn't request this, please ignore this email</li>
                  <li>Your password won't change until you create a new one</li>
                </ul>
              </div>
              
              <p>Best regards,<br><strong>AutoHub Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply.</p>
              <p>&copy; 2025 AutoHub. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ 
      message: 'If an account exists with this email, a reset link has been sent.'
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error sending reset email. Please try again.' });
  }
});

// Verify Reset Token
app.get('/api/verify-reset-token', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { token, email } = req.query;
    
    if (!token || !email) {
      return res.status(400).json({ message: 'Token and email are required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid reset link' });
    }
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const resetToken = await ResetToken.findOne({
      userId: user._id,
      token: hashedToken
    });
    
    if (!resetToken) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }
    
    res.json({ message: 'Token is valid', valid: true });
    
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ message: 'Error verifying token' });
  }
});

// Reset Password
app.post('/api/reset-password', async (req, res) => {
  try {
    await connectToDatabase();
    
    const { token, email, newPassword } = req.body;
    
    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid reset link' });
    }
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const resetToken = await ResetToken.findOne({
      userId: user._id,
      token: hashedToken
    });
    
    if (!resetToken) {
      return res.status(400).json({ message: 'Invalid or expired reset link' });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    user.password = hashedPassword;
    await user.save();
    
    await ResetToken.deleteOne({ _id: resetToken._id });
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'AutoHub - Password Changed Successfully',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { 
              background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
              color: white; 
              padding: 30px; 
              text-align: center; 
              border-radius: 10px 10px 0 0; 
            }
            .content { 
              background: #f9f9f9; 
              padding: 30px; 
              border-radius: 0 0 10px 10px; 
            }
            .success { 
              background: #d1fae5; 
              padding: 15px; 
              border-left: 4px solid #10b981; 
              margin: 20px 0; 
            }
            .footer { 
              text-align: center; 
              margin-top: 20px; 
              color: #666; 
              font-size: 12px; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Password Changed Successfully</h1>
            </div>
            <div class="content">
              <p>Hello <strong>${user.name}</strong>,</p>
              
              <div class="success">
                <strong>✅ Success!</strong><br>
                Your AutoHub password has been changed successfully.
              </div>
              
              <p>You can now log in with your new password.</p>
              
              <p><strong>If you didn't make this change:</strong><br>
              Please contact our support team immediately at support@autohub.com</p>
              
              <p>Best regards,<br><strong>AutoHub Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; 2025 AutoHub. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({ message: 'Password reset successful! You can now login with your new password.' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password. Please try again.' });
  }
});

// Export for Vercel
module.exports = app;