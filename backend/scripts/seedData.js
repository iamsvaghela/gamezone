const mongoose = require('mongoose');
const User = require('../models/User');
const GameZone = require('../models/GameZone');
const Booking = require('../models/Booking');
require('dotenv').config();

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/gamezone', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await GameZone.deleteMany({});
    await Booking.deleteMany({});
    console.log('✅ Existing data cleared');

    // Create sample users
    console.log('👥 Creating sample users...');
    
    const vendor1 = new User({
      name: 'Gaming Hub Owner',
      email: 'vendor@gamezone.com',
      password: 'password123',
      role: 'vendor',
      phone: '+1234567890'
    });
    await vendor1.save();

    const vendor2 = new User({
      name: 'Arcade Master',
      email: 'arcade@gamezone.com', 
      password: 'password123',
      role: 'vendor',
      phone: '+1234567891'
    });
    await vendor2.save();

    const user1 = new User({
      name: 'John Doe',
      email: 'user@gamezone.com',
      password: 'password123',
      role: 'user',
      phone: '+1234567892'
    });
    await user1.save();

    const user2 = new User({
      name: 'Jane Smith',
      email: 'jane@gamezone.com',
      password: 'password123',
      role: 'user',
      phone: '+1234567893'
    });
    await user2.save();

    console.log('✅ Users created successfully');

    // Create sample gaming zones
    console.log('🎮 Creating sample gaming zones...');
    
    const gameZones = [
      {
        name: "GamersHub Central",
        description: "Premier gaming facility with latest consoles and VR equipment. Experience gaming like never before with our state-of-the-art setup and comfortable gaming lounges.",
        location: {
          address: "123 Downtown Plaza, Main Street, New York, NY 10001",
          coordinates: {
            type: "Point",
            coordinates: [-74.0060, 40.7128] // [longitude, latitude]
          }
        },
        amenities: ["PS5", "Xbox Series X", "VR Station", "Gaming PCs", "High-Speed Internet", "Comfortable Seating", "Air Conditioning", "Snack Bar"],
        pricePerHour: 25,
        images: [
          "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=800&auto=format&fit=crop&q=60",
          "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60"
        ],
        vendorId: vendor1._id,
        operatingHours: { start: "09:00", end: "22:00" },
        rating: 4.5,
        totalReviews: 128,
        capacity: 25
      },
      {
        name: "Pixel Paradise",
        description: "Retro and modern gaming experience in one place. From classic arcade games to the latest releases, we have something for every gamer.",
        location: {
          address: "456 Tech Valley, Innovation Drive, San Francisco, CA 94105",
          coordinates: {
            type: "Point",
            coordinates: [-122.4194, 37.7749] // [longitude, latitude]
          }
        },
        amenities: ["Arcade Machines", "Nintendo Switch", "Gaming PCs", "Retro Consoles", "Pinball Machines", "Snack Bar", "Free WiFi", "Group Gaming Areas"],
        pricePerHour: 20,
        images: [
          "https://images.unsplash.com/photo-1598550476439-6847785fcea6?w=800&auto=format&fit=crop&q=60",
          "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=800&auto=format&fit=crop&q=60"
        ],
        vendorId: vendor1._id,
        operatingHours: { start: "10:00", end: "23:00" },
        rating: 4.3,
        totalReviews: 89,
        capacity: 30
      },
      {
        name: "Retro Arcade Zone",
        description: "Step back in time with classic arcade games and vintage consoles. Perfect for nostalgia lovers and retro gaming enthusiasts.",
        location: {
          address: "789 Entertainment District, Gaming Street, Los Angeles, CA 90210",
          coordinates: {
            type: "Point",
            coordinates: [-118.2437, 34.0522] // [longitude, latitude]
          }
        },
        amenities: ["Classic Arcade", "Pinball Machines", "Retro Consoles", "Prize Counter", "80s Music", "Neon Lighting", "Photo Booth", "Vintage Sodas"],
        pricePerHour: 18,
        images: [
          "https://images.unsplash.com/photo-1607853202273-797f1c22a38e?w=800&auto=format&fit=crop&q=60",
          "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&auto=format&fit=crop&q=60"
        ],
        vendorId: vendor2._id,
        operatingHours: { start: "12:00", end: "23:59" },
        rating: 4.7,
        totalReviews: 156,
        capacity: 20
      },
      {
        name: "Elite Gaming Lounge",
        description: "High-end gaming experience with premium equipment and luxury amenities. Perfect for competitive gaming and esports events.",
        location: {
          address: "321 Business District, Corporate Avenue, Chicago, IL 60601",
          coordinates: {
            type: "Point",
            coordinates: [-87.6298, 41.8781] // [longitude, latitude]
          }
        },
        amenities: ["High-End Gaming PCs", "Mechanical Keyboards", "Gaming Monitors", "Streaming Setup", "Private Rooms", "Tournament Area", "Energy Drinks", "Premium Headsets"],
        pricePerHour: 35,
        images: [
          "https://images.unsplash.com/photo-1600298881974-6be191ceeda1?w=800&auto=format&fit=crop&q=60",
          "https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800&auto=format&fit=crop&q=60"
        ],
        vendorId: vendor2._id,
        operatingHours: { start: "14:00", end: "23:59" },
        rating: 4.8,
        totalReviews: 73,
        capacity: 15
      },
      {
        name: "Family Fun Gaming Center",
        description: "Family-friendly gaming environment suitable for all ages. Safe, clean, and entertaining space for family gaming sessions.",
        location: {
          address: "654 Suburban Mall, Family Lane, Austin, TX 78701",
          coordinates: {
            type: "Point",
            coordinates: [-97.7431, 30.2672] // [longitude, latitude]
          }
        },
        amenities: ["Family Games", "Kids Area", "Nintendo Switch", "Educational Games", "Birthday Party Rooms", "Healthy Snacks", "Parent Lounge", "Clean Restrooms"],
        pricePerHour: 15,
        images: [
          "https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&auto=format&fit=crop&q=60",
          "https://images.unsplash.com/photo-1556075798-4825dfaaf498?w=800&auto=format&fit=crop&q=60"
        ],
        vendorId: vendor1._id,
        operatingHours: { start: "08:00", end: "20:00" },
        rating: 4.2,
        totalReviews: 94,
        capacity: 40
      }
    ];

    const createdZones = await GameZone.insertMany(gameZones);
    console.log('✅ Gaming zones created successfully');

    // Create sample bookings
    console.log('📅 Creating sample bookings...');
    
    const bookings = [
      {
        userId: user1._id,
        zoneId: createdZones[0]._id,
        date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        timeSlot: "14:00",
        duration: 2,
        totalAmount: 50,
        status: 'confirmed',
        paymentStatus: 'paid',
        notes: 'Birthday party gaming session'
      },
      {
        userId: user2._id,
        zoneId: createdZones[1]._id,
        date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Day after tomorrow
        timeSlot: "16:00",
        duration: 3,
        totalAmount: 60,
        status: 'confirmed',
        paymentStatus: 'paid',
        notes: 'Team building gaming session'
      },
      {
        userId: user1._id,
        zoneId: createdZones[2]._id,
        date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        timeSlot: "18:00",
        duration: 1,
        totalAmount: 18,
        status: 'pending',
        paymentStatus: 'pending'
      },
      {
        userId: user2._id,
        zoneId: createdZones[3]._id,
        date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        timeSlot: "20:00",
        duration: 4,
        totalAmount: 140,
        status: 'confirmed',
        paymentStatus: 'paid',
        notes: 'Competitive gaming tournament practice'
      },
      {
        userId: user1._id,
        zoneId: createdZones[4]._id,
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        timeSlot: "10:00",
        duration: 2,
        totalAmount: 30,
        status: 'confirmed',
        paymentStatus: 'paid',
        notes: 'Family gaming time with kids'
      },
      // Some past bookings for analytics
      {
        userId: user2._id,
        zoneId: createdZones[0]._id,
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 1 week ago
        timeSlot: "15:00",
        duration: 3,
        totalAmount: 75,
        status: 'completed',
        paymentStatus: 'paid',
        notes: 'Had an amazing time!'
      },
      {
        userId: user1._id,
        zoneId: createdZones[1]._id,
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        timeSlot: "19:00",
        duration: 2,
        totalAmount: 40,
        status: 'completed',
        paymentStatus: 'paid'
      },
      {
        userId: user2._id,
        zoneId: createdZones[2]._id,
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        timeSlot: "21:00",
        duration: 1,
        totalAmount: 18,
        status: 'cancelled',
        paymentStatus: 'refunded',
        cancellationReason: 'Emergency came up',
        cancelledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000)
      }
    ];

    // Create bookings with QR codes
    for (let bookingData of bookings) {
      const booking = new Booking(bookingData);
      await booking.save();
      
      // Update QR code with booking ID
      booking.qrCode = JSON.stringify({
        bookingId: booking._id,
        reference: booking.reference,
        zoneId: booking.zoneId,
        date: booking.date.toISOString().split('T')[0],
        timeSlot: booking.timeSlot,
        duration: booking.duration
      });
      
      await booking.save();
    }

    console.log('✅ Sample bookings created successfully');

    // Display summary
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`👥 Users created: ${await User.countDocuments()}`);
    console.log(`🎮 Gaming zones created: ${await GameZone.countDocuments()}`);
    console.log(`📅 Bookings created: ${await Booking.countDocuments()}`);
    
    console.log('\n🔑 Test Accounts:');
    console.log('┌─────────────────────────────────────────┐');
    console.log('│ VENDOR ACCOUNTS                         │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ Email: vendor@gamezone.com              │');
    console.log('│ Password: password123                   │');
    console.log('│ Role: vendor                            │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ Email: arcade@gamezone.com              │');
    console.log('│ Password: password123                   │');
    console.log('│ Role: vendor                            │');
    console.log('└─────────────────────────────────────────┘');
    
    console.log('┌─────────────────────────────────────────┐');
    console.log('│ USER ACCOUNTS                           │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ Email: user@gamezone.com                │');
    console.log('│ Password: password123                   │');
    console.log('│ Role: user                              │');
    console.log('├─────────────────────────────────────────┤');
    console.log('│ Email: jane@gamezone.com                │');
    console.log('│ Password: password123                   │');
    console.log('│ Role: user                              │');
    console.log('└─────────────────────────────────────────┘');
    
    console.log('\n🚀 You can now start the server with: npm run dev');
    console.log('📍 API will be available at: http://localhost:3000');
    console.log('🏥 Health check: http://localhost:3000/health');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    
    if (error.code === 11000) {
      console.error('🔄 Duplicate data detected. Please clear the database first.');
    }
    
    process.exit(1);
  }
};

// Run the seed function
if (require.main === module) {
  seedData();
}

module.exports = seedData;