const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const socketIO = require('socket.io');
const http = require('http');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Uploads directory created');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IMPORTANT: Serve static files from uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Also serve static HTML files
app.use(express.static(__dirname));

console.log('📁 Static files directory:', __dirname);
console.log('🖼️  Uploads directory:', uploadsDir);

// MongoDB Connection
const MONGODB_URL = process.env.MONGODB_URI;

mongoose.connect('mongodb://localhost:27017/vehicleMarketplace', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ MongoDB Error:', err));

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

const User = mongoose.model('User', userSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const Bid = mongoose.model('Bid', bidSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const ResetToken = mongoose.model('ResetToken', resetTokenSchema);

// Multer Configuration - FIXED
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    console.log('💾 Saving file:', uniqueName);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    console.log('📄 Checking file:', file.originalname);
    console.log('📄 MIME type:', file.mimetype);
    console.log('📄 Extension:', path.extname(file.originalname));
    
    // Check MIME type
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedMimes.includes(file.mimetype)) {
      console.log('✅ File accepted:', file.originalname);
      return cb(null, true);
    } else {
      console.log('❌ File rejected - Invalid MIME type:', file.mimetype);
      return cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) are allowed!'), false);
    }
  }
});

// JWT Secret
const JWT_SECRET = 'your_jwt_secret_key_change_in_production';

// Email Configuration
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'pheonixbycrpt@gmail.com',
    pass: process.env.EMAIL_PASS || 'odqnggpjigacloye'
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

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
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
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Post Vehicle - FIXED for multiple images
app.post('/api/vehicles', authenticateToken, upload.array('images', 10), async (req, res) => {
  try {
    console.log('📝 Received vehicle post request');
    console.log('📎 Files received:', req.files?.length || 0);
    console.log('📋 Body data:', req.body);
    
    const { brand, model, year, price, type, condition, mileage, description, contactName, contactPhone } = req.body;
    
    // Validation
    if (!brand || !model || !year || !price || !type || !condition || !mileage || !contactName || !contactPhone) {
      return res.status(400).json({ message: 'All required fields must be filled' });
    }
    
    // Check if at least one image is uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'At least one image is required' });
    }
    
    // Store all image paths - FIXED PATH
    const imagePaths = req.files.map(file => `/uploads/${file.filename}`);
    console.log('🖼️  Image paths saved:', imagePaths);
    
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
      images: imagePaths,
      contactName,
      contactPhone
    });
    
    await vehicle.save();
    console.log('✅ Vehicle saved to database:', vehicle._id);
    
    // Emit new vehicle to all connected clients
    io.emit('newVehicle', vehicle);
    
    res.status(201).json({ message: 'Vehicle posted successfully', vehicle });
  } catch (error) {
    console.error('❌ Vehicle post error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// Get All Vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
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
    
    console.log(`📦 Sending ${vehicles.length} vehicles`);
    res.json(vehicles);
  } catch (error) {
    console.error('Get vehicles error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Single Vehicle
app.get('/api/vehicles/:id', async (req, res) => {
  try {
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
    
    io.emit('newBid', { vehicleId, amount: parseFloat(amount) });
    
    res.status(201).json({ message: 'Bid placed successfully', bid });
  } catch (error) {
    console.error('Bid error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Bids for Vehicle
app.get('/api/vehicles/:id/bids', async (req, res) => {
  try {
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
    
    io.emit('bookingConfirmed', { vehicleId, bookingId: booking._id });
    
    res.status(201).json({ message: 'Booking confirmed', booking });
  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User's Posted Vehicles
app.get('/api/user/vehicles', authenticateToken, async (req, res) => {
  try {
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
    
    const resetUrl = `http://localhost:5500/frontend/pages/reset-password.html?token=${resetToken}&email=${email}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER || 'pheonixbycrpt@gmail.com',
      to: user.email,
      subject: 'AutoHub - Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; padding: 15px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            .warning { background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
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
    
    console.log(`Password reset email sent to: ${email}`);
    
    res.json({ 
      message: 'If an account exists with this email, a reset link has been sent.',
      resetUrl: resetUrl,
      token: resetToken
    });
    
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Error sending reset email. Please try again.' });
  }
});

// Verify Reset Token
app.get('/api/verify-reset-token', async (req, res) => {
  try {
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
      from: process.env.EMAIL_USER || 'pheonixbycrpt@gmail.com',
      to: user.email,
      subject: 'AutoHub - Password Changed Successfully',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .success { background: #d1fae5; padding: 15px; border-left: 4px solid #10b981; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
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
    
    console.log(`Password reset successful for: ${email}`);
    
    res.json({ message: 'Password reset successful! You can now login with your new password.' });
    
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Error resetting password. Please try again.' });
  }
});

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📱 API: http://localhost:${PORT}/api`);
  console.log(`🖼️  Images: http://localhost:${PORT}/uploads`);
  console.log(`\n✅ Ready to accept connections!\n`);
});