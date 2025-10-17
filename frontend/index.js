// Configuration
const API_URL = window.APP_CONFIG?.API_URL || 'http://localhost:5000/api';
const SOCKET_URL = window.APP_CONFIG?.SOCKET_URL || 'http://localhost:5000';
let socket;
let currentUser = null;
let currentVehicleId = null;
let selectedImages = []; // Store selected images

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadVehicles();
    initializeEventListeners();
    initializeSocket();
});

// Socket.IO initialization
function initializeSocket() {
    socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
        console.log('Socket connected');
    });

    socket.on('newVehicle', (vehicle) => {
        loadVehicles();
    });

    socket.on('newBid', (data) => {
        if (currentVehicleId === data.vehicleId) {
            loadVehicleBids(data.vehicleId);
        }
    });

    socket.on('bookingConfirmed', (data) => {
        loadVehicles();
        if (currentUser) {
            loadDashboard();
        }
    });
}

// Event Listeners
function initializeEventListeners() {
    // Register Form
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    
    // Login Form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Sell Vehicle Form - FIXED
    document.getElementById('sellVehicleForm').addEventListener('submit', handleSellVehicle);
    
    // Search Form
    document.getElementById('searchForm').addEventListener('submit', handleSearch);
    
    // Password Strength
    document.getElementById('regPassword').addEventListener('input', checkPasswordStrength);
    
    // Image Upload Handler
    document.getElementById('sellImages').addEventListener('change', handleImageSelection);
    
    // Navbar Scroll Effect
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// NEW: Handle Multiple Image Selection
function handleImageSelection(event) {
    const files = Array.from(event.target.files);
    
    // Limit to 10 images
    if (files.length > 10) {
        alert('You can only upload a maximum of 10 images');
        event.target.value = '';
        return;
    }
    
    // Validate file sizes
    const maxSize = 5 * 1024 * 1024; // 5MB
    for (let file of files) {
        if (file.size > maxSize) {
            alert(`File ${file.name} is too large. Maximum size is 5MB per image.`);
            event.target.value = '';
            return;
        }
    }
    
    selectedImages = files;
    displayImagePreviews(files);
}

// NEW: Display Image Previews
function displayImagePreviews(files) {
    const container = document.getElementById('imagePreviewContainer');
    const previewsDiv = document.getElementById('imagePreviews');
    const countDiv = document.getElementById('imageCount');
    
    if (files.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    previewsDiv.innerHTML = '';
    
    files.forEach((file, index) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item';
            previewItem.innerHTML = `
                <img src="${e.target.result}" alt="Preview ${index + 1}">
                <button type="button" class="image-preview-remove" onclick="removeImage(${index})">
                    <i class="fas fa-times"></i>
                </button>
                ${index === 0 ? '<span class="image-preview-primary">Primary</span>' : ''}
            `;
            previewsDiv.appendChild(previewItem);
        };
        
        reader.readAsDataURL(file);
    });
    
    countDiv.innerHTML = `<i class="fas fa-images"></i> ${files.length} image${files.length > 1 ? 's' : ''} selected`;
}

// NEW: Remove Image from Selection
function removeImage(index) {
    const dt = new DataTransfer();
    const input = document.getElementById('sellImages');
    const files = Array.from(input.files);
    
    files.splice(index, 1);
    
    files.forEach(file => {
        dt.items.add(file);
    });
    
    input.files = dt.files;
    selectedImages = files;
    displayImagePreviews(files);
}

// Authentication
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentUser = JSON.parse(user);
        updateAuthUI(true);
    } else {
        updateAuthUI(false);
    }
}

function updateAuthUI(isAuthenticated) {
    const authButtons = document.getElementById('authButtons');
    const userMenu = document.getElementById('userMenu');
    
    if (isAuthenticated) {
        authButtons.classList.add('hidden');
        userMenu.classList.remove('hidden');
    } else {
        authButtons.classList.remove('hidden');
        userMenu.classList.add('hidden');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    
    // Validation
    if (password !== confirmPassword) {
        showError('registerError', 'Passwords do not match');
        return;
    }
    
    if (password.length < 8) {
        showError('registerError', 'Password must be at least 8 characters');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, phone, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showSuccess('registerSuccess', 'Registration successful! Please login.');
            setTimeout(() => showLogin(), 2000);
        } else {
            showError('registerError', data.message);
        }
    } catch (error) {
        showError('registerError', 'Registration failed. Please try again.');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateAuthUI(true);
            showHome();
        } else {
            showError('loginError', data.message);
        }
    } catch (error) {
        showError('loginError', 'Login failed. Please try again.');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    updateAuthUI(false);
    showHome();
}

// Vehicle Operations
async function loadVehicles(filters = {}) {
    try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`${API_URL}/vehicles?${params}`);
        const vehicles = await response.json();
        
        displayVehicles(vehicles);
    } catch (error) {
        console.error('Error loading vehicles:', error);
    }
}

function displayVehicles(vehicles) {
    const grid = document.getElementById('vehicleGrid');
    
    if (vehicles.length === 0) {
        grid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1; color: var(--text-light);">No vehicles found</p>';
        return;
    }
    
    grid.innerHTML = vehicles.map(vehicle => {
        // Use first image from images array, or fallback
        const imageUrl = vehicle.images && vehicle.images.length > 0 
            ? `${API_URL.replace('/api', '')}${vehicle.images[0]}`
            : 'https://via.placeholder.com/400x300?text=No+Image';
        
        return `
            <div class="vehicle-card" onclick="showVehicleDetails('${vehicle._id}')">
                <div class="vehicle-image-container">
                    <img src="${imageUrl}" alt="${vehicle.brand} ${vehicle.model}" class="vehicle-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                    <div class="vehicle-badge">${vehicle.condition}</div>
                    ${vehicle.images && vehicle.images.length > 1 ? `<div class="vehicle-badge" style="left: 1rem; right: auto; background: rgba(0,0,0,0.7);"><i class="fas fa-images"></i> ${vehicle.images.length}</div>` : ''}
                </div>
                <div class="vehicle-info">
                    <h3 class="vehicle-title">${vehicle.brand} ${vehicle.model}</h3>
                    <div class="vehicle-price">$${vehicle.price.toLocaleString()}</div>
                    <div class="vehicle-details">
                        <div class="vehicle-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${vehicle.year}</span>
                        </div>
                        <div class="vehicle-detail">
                            <i class="fas fa-car"></i>
                            <span>${vehicle.type}</span>
                        </div>
                        <div class="vehicle-detail">
                            <i class="fas fa-road"></i>
                            <span>${vehicle.mileage.toLocaleString()} mi</span>
                        </div>
                    </div>
                    <div class="vehicle-actions">
                        <button class="btn btn-primary" onclick="event.stopPropagation(); showVehicleDetails('${vehicle._id}')">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function showVehicleDetails(vehicleId) {
    if (!currentUser) {
        showLogin();
        return;
    }
    
    currentVehicleId = vehicleId;
    
    try {
        const response = await fetch(`${API_URL}/vehicles/${vehicleId}`);
        const vehicle = await response.json();
        
        const isSeller = currentUser && vehicle.sellerId._id === currentUser.id;
        
        // Create image gallery
        let imageGalleryHTML = '';
        if (vehicle.images && vehicle.images.length > 0) {
            imageGalleryHTML = `
                <div style="position: relative;">
                    <img id="mainImage" src="${API_URL.replace('/api', '')}${vehicle.images[0]}" alt="${vehicle.brand} ${vehicle.model}" 
                         style="width: 100%; height: 400px; object-fit: cover; border-radius: 10px; margin-bottom: 1rem;" 
                         onerror="this.src='https://via.placeholder.com/800x400?text=No+Image'">
                    
                    ${vehicle.images.length > 1 ? `
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem; margin-bottom: 2rem;">
                            ${vehicle.images.map((img, index) => `
                                <img src="${API_URL.replace('/api', '')}${img}" 
                                     onclick="document.getElementById('mainImage').src=this.src" 
                                     style="width: 100%; height: 80px; object-fit: cover; border-radius: 5px; cursor: pointer; border: 2px solid ${index === 0 ? 'var(--primary)' : 'transparent'};" 
                                     onerror="this.src='https://via.placeholder.com/100x80?text=No+Image'">
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            imageGalleryHTML = `
                <img src="https://via.placeholder.com/800x400?text=No+Image" alt="No Image" 
                     style="width: 100%; height: 400px; object-fit: cover; border-radius: 10px; margin-bottom: 2rem;">
            `;
        }
        
        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            ${imageGalleryHTML}
            
            <div class="vehicle-detail-grid">
                <div class="detail-item">
                    <label>Brand</label>
                    <p>${vehicle.brand}</p>
                </div>
                <div class="detail-item">
                    <label>Model</label>
                    <p>${vehicle.model}</p>
                </div>
                <div class="detail-item">
                    <label>Year</label>
                    <p>${vehicle.year}</p>
                </div>
                <div class="detail-item">
                    <label>Type</label>
                    <p>${vehicle.type}</p>
                </div>
                <div class="detail-item">
                    <label>Condition</label>
                    <p>${vehicle.condition}</p>
                </div>
                <div class="detail-item">
                    <label>Mileage</label>
                    <p>${vehicle.mileage.toLocaleString()} miles</p>
                </div>
                <div class="detail-item">
                    <label>Starting Price</label>
                    <p style="color: var(--primary); font-size: 1.3rem;">$${vehicle.price.toLocaleString()}</p>
                </div>
                <div class="detail-item">
                    <label>Status</label>
                    <p style="color: ${vehicle.status === 'available' ? 'var(--secondary)' : 'var(--danger)'}; text-transform: capitalize;">${vehicle.status}</p>
                </div>
            </div>
            
            ${vehicle.description ? `
                <div style="margin: 2rem 0;">
                    <h3 style="margin-bottom: 0.5rem;">Description</h3>
                    <p style="color: var(--text-light); line-height: 1.8;">${vehicle.description}</p>
                </div>
            ` : ''}
            
            <div style="background: var(--light); padding: 1.5rem; border-radius: 10px; margin: 2rem 0;">
                <h3 style="margin-bottom: 1rem;">Contact Information</h3>
                <p><strong>Name:</strong> ${vehicle.contactName}</p>
                <p><strong>Phone:</strong> ${vehicle.contactPhone}</p>
            </div>
            
            ${vehicle.status === 'available' ? `
                <div class="bid-section">
                    <h3><i class="fas fa-gavel"></i> Place Your Bid</h3>
                    ${!isSeller ? `
                        <form class="bid-form" onsubmit="placeBid(event, '${vehicleId}')">
                            <input type="number" id="bidAmount" placeholder="Enter bid amount" min="${vehicle.price + 1}" required>
                            <button type="submit" class="btn btn-secondary">
                                <i class="fas fa-gavel"></i> Place Bid
                            </button>
                        </form>
                    ` : `
                        <p style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
                            <i class="fas fa-info-circle"></i> You cannot bid on your own vehicle
                        </p>
                    `}
                    
                    <h4 style="margin-top: 1.5rem; margin-bottom: 1rem;">Current Bids</h4>
                    <div class="bid-list" id="bidList">
                        <div class="spinner"></div>
                    </div>
                    
                    ${isSeller ? `
                        <button class="btn btn-success" onclick="confirmBooking('${vehicleId}')" style="width: 100%; margin-top: 1rem;">
                            <i class="fas fa-check-circle"></i> Confirm Sale to Highest Bidder
                        </button>
                    ` : ''}
                </div>
            ` : `
                <div style="background: var(--danger); color: white; padding: 1.5rem; border-radius: 10px; text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                    <h3>This vehicle has been sold</h3>
                </div>
            `}
        `;
        
        document.getElementById('modalTitle').textContent = `${vehicle.brand} ${vehicle.model}`;
        document.getElementById('vehicleModal').style.display = 'block';
        
        if (vehicle.status === 'available') {
            loadVehicleBids(vehicleId);
        }
    } catch (error) {
        console.error('Error loading vehicle details:', error);
    }
}

async function loadVehicleBids(vehicleId) {
    try {
        const response = await fetch(`${API_URL}/vehicles/${vehicleId}/bids`);
        const bids = await response.json();
        
        const bidList = document.getElementById('bidList');
        
        if (bids.length === 0) {
            bidList.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.7);">No bids yet. Be the first to bid!</p>';
            return;
        }
        
        bidList.innerHTML = bids.map((bid, index) => `
            <div class="bid-item ${index === 0 ? 'highest-bid' : ''}">
                <div>
                    <strong>${bid.userId.name}</strong>
                    ${index === 0 ? '<span style="background: var(--secondary); padding: 0.2rem 0.5rem; border-radius: 5px; font-size: 0.8rem; margin-left: 0.5rem;">Highest Bid</span>' : ''}
                </div>
                <div style="font-size: 1.2rem; font-weight: 700;">$${bid.amount.toLocaleString()}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading bids:', error);
    }
}

async function placeBid(e, vehicleId) {
    e.preventDefault();
    
    const amount = document.getElementById('bidAmount').value;
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/bids`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ vehicleId, amount })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('bidAmount').value = '';
            loadVehicleBids(vehicleId);
            alert('Bid placed successfully!');
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Failed to place bid. Please try again.');
    }
}

async function confirmBooking(vehicleId) {
    if (!confirm('Confirm sale to the highest bidder?')) {
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/bookings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ vehicleId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Booking confirmed! The buyer will be notified.');
            closeModal();
            loadVehicles();
        } else {
            alert(data.message);
        }
    } catch (error) {
        alert('Failed to confirm booking. Please try again.');
    }
}

// FIXED: Handle Sell Vehicle with Multiple Images
async function handleSellVehicle(e) {
    e.preventDefault();
    
    console.log('🚀 Form submitted!');
    
    if (!currentUser) {
        console.log('❌ User not logged in');
        showLogin();
        return;
    }
    
    const submitBtn = document.getElementById('sellVehicleForm').querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('sellError');
    const successDiv = document.getElementById('sellSuccess');
    
    // Get form data
    const brand = document.getElementById('sellBrand').value;
    const model = document.getElementById('sellModel').value;
    const year = document.getElementById('sellYear').value;
    const price = document.getElementById('sellPrice').value;
    const type = document.getElementById('sellType').value;
    const condition = document.getElementById('sellCondition').value;
    const mileage = document.getElementById('sellMileage').value;
    const description = document.getElementById('sellDescription').value;
    const contactName = document.getElementById('sellContactName').value;
    const contactPhone = document.getElementById('sellContactPhone').value;
    const imageFiles = document.getElementById('sellImages').files;
    
    console.log('📋 Form data:', { brand, model, year, price, type, condition, mileage, contactName, contactPhone });
    console.log('📸 Images:', imageFiles.length);
    
    // Validation
    if (!brand || !model || !year || !price || !type || !condition || !mileage || !contactName || !contactPhone) {
        showError('sellError', 'Please fill all required fields');
        console.log('❌ Missing required fields');
        return;
    }
    
    if (imageFiles.length === 0) {
        showError('sellError', 'Please select at least one image');
        console.log('❌ No images selected');
        return;
    }
    
    if (imageFiles.length > 10) {
        showError('sellError', 'Maximum 10 images allowed');
        console.log('❌ Too many images');
        return;
    }
    
    // Create FormData
    const formData = new FormData();
    formData.append('brand', brand);
    formData.append('model', model);
    formData.append('year', year);
    formData.append('price', price);
    formData.append('type', type);
    formData.append('condition', condition);
    formData.append('mileage', mileage);
    formData.append('description', description);
    formData.append('contactName', contactName);
    formData.append('contactPhone', contactPhone);
    
    // Append all images
    for (let i = 0; i < imageFiles.length; i++) {
        formData.append('images', imageFiles[i]);
        console.log(`📎 Added image ${i + 1}:`, imageFiles[i].name);
    }
    
    const token = localStorage.getItem('token');
    console.log('🔑 Token:', token ? 'Present' : 'Missing');
    
    // Disable button and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    
    try {
        console.log('📤 Sending request to:', `${API_URL}/vehicles`);
        
        const response = await fetch(`${API_URL}/vehicles`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        console.log('📥 Response status:', response.status);
        
        const data = await response.json();
        console.log('📦 Response data:', data);
        
        if (response.ok) {
            showSuccess('sellSuccess', 'Vehicle listed successfully!');
            console.log('✅ Vehicle listed successfully!');
            
            // Reset form
            document.getElementById('sellVehicleForm').reset();
            document.getElementById('imagePreviewContainer').style.display = 'none';
            selectedImages = [];
            
            // Redirect to home after 2 seconds
            setTimeout(() => {
                showHome();
            }, 2000);
        } else {
            showError('sellError', data.message || 'Failed to list vehicle');
            console.log('❌ Error:', data.message);
        }
    } catch (error) {
        showError('sellError', 'Network error. Please try again.');
        console.error('❌ Network error:', error);
    } finally {
        // Re-enable button
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-upload"></i> List Vehicle';
    }
}

function handleSearch(e) {
    e.preventDefault();
    
    const filters = {
        brand: document.getElementById('searchBrand').value,
        type: document.getElementById('searchType').value,
        minPrice: document.getElementById('searchMinPrice').value,
        maxPrice: document.getElementById('searchMaxPrice').value,
        minYear: document.getElementById('searchMinYear').value
    };
    
    // Remove empty filters
    Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
    });
    
    loadVehicles(filters);
}

// Dashboard
async function loadDashboard() {
    if (!currentUser) {
        showLogin();
        return;
    }
    
    const token = localStorage.getItem('token');
    
    try {
        // Load user vehicles
        const vehiclesRes = await fetch(`${API_URL}/user/vehicles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const vehicles = await vehiclesRes.json();
        
        // Load user bids
        const bidsRes = await fetch(`${API_URL}/user/bids`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const bids = await bidsRes.json();
        
        // Load user bookings
        const bookingsRes = await fetch(`${API_URL}/user/bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const bookings = await bookingsRes.json();
        
        // Update stats
        document.getElementById('statVehicles').textContent = vehicles.length;
        document.getElementById('statBids').textContent = bids.length;
        document.getElementById('statBookings').textContent = bookings.length;
        
        // Display vehicles
        const vehicleGrid = document.getElementById('dashVehicleGrid');
        if (vehicles.length === 0) {
            vehicleGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1; color: var(--text-light);">No vehicles posted yet</p>';
        } else {
            vehicleGrid.innerHTML = vehicles.map(vehicle => {
                const imageUrl = vehicle.images && vehicle.images.length > 0 
                    ? `${API_URL.replace('/api', '')}${vehicle.images[0]}`
                    : 'https://via.placeholder.com/400x300?text=No+Image';
                
                return `
                    <div class="vehicle-card">
                        <div class="vehicle-image-container">
                            <img src="${imageUrl}" alt="${vehicle.brand} ${vehicle.model}" class="vehicle-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                            <div class="vehicle-badge" style="background: ${vehicle.status === 'available' ? 'var(--secondary)' : 'var(--danger)'}">${vehicle.status}</div>
                            ${vehicle.images && vehicle.images.length > 1 ? `<div class="vehicle-badge" style="left: 1rem; right: auto; background: rgba(0,0,0,0.7);"><i class="fas fa-images"></i> ${vehicle.images.length}</div>` : ''}
                        </div>
                        <div class="vehicle-info">
                            <h3 class="vehicle-title">${vehicle.brand} ${vehicle.model}</h3>
                            <div class="vehicle-price">$${vehicle.price.toLocaleString()}</div>
                            <div class="vehicle-details">
                                <div class="vehicle-detail">
                                    <i class="fas fa-calendar"></i>
                                    <span>${vehicle.year}</span>
                                </div>
                                <div class="vehicle-detail">
                                    <i class="fas fa-car"></i>
                                    <span>${vehicle.type}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Display bids
        const bidsGrid = document.getElementById('dashBidsGrid');
        if (bids.length === 0) {
            bidsGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1; color: var(--text-light);">No bids placed yet</p>';
        } else {
            bidsGrid.innerHTML = bids.map(bid => {
                const imageUrl = bid.vehicleId.images && bid.vehicleId.images.length > 0 
                    ? `${API_URL.replace('/api', '')}${bid.vehicleId.images[0]}`
                    : 'https://via.placeholder.com/400x300?text=No+Image';
                
                return `
                    <div class="vehicle-card">
                        <div class="vehicle-image-container">
                            <img src="${imageUrl}" alt="${bid.vehicleId.brand} ${bid.vehicleId.model}" class="vehicle-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                            <div class="vehicle-badge" style="background: ${bid.status === 'pending' ? 'var(--warning)' : bid.status === 'accepted' ? 'var(--secondary)' : 'var(--danger)'}">${bid.status}</div>
                        </div>
                        <div class="vehicle-info">
                            <h3 class="vehicle-title">${bid.vehicleId.brand} ${bid.vehicleId.model}</h3>
                            <div class="vehicle-price">Your Bid: ${bid.amount.toLocaleString()}</div>
                            <div class="vehicle-details">
                                <div class="vehicle-detail">
                                    <i class="fas fa-calendar"></i>
                                    <span>${bid.vehicleId.year}</span>
                                </div>
                                <div class="vehicle-detail">
                                    <i class="fas fa-tag"></i>
                                    <span>Original: ${bid.vehicleId.price.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // Display bookings
        const bookingsGrid = document.getElementById('dashBookingsGrid');
        if (bookings.length === 0) {
            bookingsGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1; color: var(--text-light);">No bookings yet</p>';
        } else {
            bookingsGrid.innerHTML = bookings.map(booking => {
                const isBuyer = booking.buyerId._id === currentUser.id;
                const imageUrl = booking.vehicleId.images && booking.vehicleId.images.length > 0 
                    ? `${API_URL.replace('/api', '')}${booking.vehicleId.images[0]}`
                    : 'https://via.placeholder.com/400x300?text=No+Image';
                
                return `
                    <div class="vehicle-card">
                        <div class="vehicle-image-container">
                            <img src="${imageUrl}" alt="${booking.vehicleId.brand} ${booking.vehicleId.model}" class="vehicle-image" onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                            <div class="vehicle-badge" style="background: var(--secondary)">Confirmed</div>
                        </div>
                        <div class="vehicle-info">
                            <h3 class="vehicle-title">${booking.vehicleId.brand} ${booking.vehicleId.model}</h3>
                            <div class="vehicle-price">${booking.finalPrice.toLocaleString()}</div>
                            <div style="background: var(--light); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                                <p><strong>${isBuyer ? 'Seller' : 'Buyer'}:</strong> ${isBuyer ? booking.sellerId.name : booking.buyerId.name}</p>
                                <p><strong>Phone:</strong> ${isBuyer ? booking.sellerId.phone : booking.buyerId.phone}</p>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Utility Functions
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 5000);
}

function showSuccess(elementId, message) {
    const successEl = document.getElementById(elementId);
    successEl.textContent = message;
    successEl.style.display = 'block';
    setTimeout(() => {
        successEl.style.display = 'none';
    }, 5000);
}

function checkPasswordStrength() {
    const password = document.getElementById('regPassword').value;
    const strengthBar = document.getElementById('passwordStrengthBar');
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    strengthBar.className = 'password-strength-bar';
    if (strength <= 1) {
        strengthBar.classList.add('strength-weak');
    } else if (strength <= 3) {
        strengthBar.classList.add('strength-medium');
    } else {
        strengthBar.classList.add('strength-strong');
    }
}

function closeModal() {
    document.getElementById('vehicleModal').style.display = 'none';
    currentVehicleId = null;
}

function toggleMenu() {
    document.getElementById('navLinks').classList.toggle('active');
}

function scrollToVehicles() {
    document.getElementById('vehiclesSection').scrollIntoView({ behavior: 'smooth' });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`${tab}Tab`).classList.add('active');
}

// Navigation Functions
function hideAllPages() {
    document.querySelectorAll('#mainContent > div').forEach(page => {
        page.classList.add('hidden');
    });
}

function showHome() {
    hideAllPages();
    document.getElementById('homePage').classList.remove('hidden');
    loadVehicles();
}

function showRegister() {
    hideAllPages();
    document.getElementById('registerPage').classList.remove('hidden');
}

function showLogin() {
    hideAllPages();
    document.getElementById('loginPage').classList.remove('hidden');
}

function showSellVehicle() {
    if (!currentUser) {
        showLogin();
        return;
    }
    hideAllPages();
    document.getElementById('sellVehiclePage').classList.remove('hidden');
}

function showDashboard() {
    if (!currentUser) {
        showLogin();
        return;
    }
    hideAllPages();
    document.getElementById('dashboardPage').classList.remove('hidden');
    loadDashboard();
}

function showAbout() {
    hideAllPages();
    document.getElementById('aboutPage').classList.remove('hidden');
}

function showContact() {
    hideAllPages();
    document.getElementById('contactPage').classList.remove('hidden');
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('vehicleModal');
    if (event.target === modal) {
        closeModal();
    }
}