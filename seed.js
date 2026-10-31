// Fills the database with demo data: npm run seed
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Appointment = require('./models/Appointment');

const DEMO_PASSWORD = 'Password123';

const doctors = [
  { name: 'Dr. Ananya Sharma', email: 'ananya@clinic.test', specialization: 'Cardiology', experienceYears: 14, fee: 900, bio: 'Heart rhythm disorders and preventive cardiology.', workingDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '16:00', slotMinutes: 30 },
  { name: 'Dr. Rohan Mehta', email: 'rohan@clinic.test', specialization: 'Dermatology', experienceYears: 9, fee: 700, bio: 'Acne, eczema and skin allergies.', workingDays: [1, 3, 5, 6], startTime: '10:00', endTime: '18:00', slotMinutes: 20 },
  { name: 'Dr. Kavita Rao', email: 'kavita@clinic.test', specialization: 'Pediatrics', experienceYears: 11, fee: 600, bio: 'Newborn care, vaccinations and child growth.', workingDays: [1, 2, 3, 4, 5, 6], startTime: '08:30', endTime: '14:30', slotMinutes: 30 },
  { name: 'Dr. Imran Qureshi', email: 'imran@clinic.test', specialization: 'Orthopedics', experienceYears: 17, fee: 1000, bio: 'Joint pain, sports injuries and fracture care.', workingDays: [2, 4, 6], startTime: '11:00', endTime: '17:00', slotMinutes: 45 },
  { name: 'Dr. Meera Iyer', email: 'meera@clinic.test', specialization: 'General Medicine', experienceYears: 6, fee: 400, bio: 'Fever, infections, diabetes and blood pressure checks.', workingDays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '13:00', slotMinutes: 15 },
];

(async () => {
  try {
    if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
    await connectDB();
    await Promise.all([User.deleteMany({}), Doctor.deleteMany({}), Appointment.deleteMany({})]);
    await Appointment.syncIndexes();

    await User.create({ name: 'Site Admin', email: 'admin@clinic.test', password: DEMO_PASSWORD, role: 'admin' });
    await User.create({ name: 'Demo Patient', email: 'patient@clinic.test', password: DEMO_PASSWORD, role: 'patient' });

    for (const { email, ...profile } of doctors) {
      const user = await User.create({ name: profile.name, email, password: DEMO_PASSWORD, role: 'doctor' });
      await Doctor.create({ ...profile, user: user._id });
    }

    console.log('Seeded demo data. Sign in with password "%s":', DEMO_PASSWORD);
    console.log('  patient  patient@clinic.test');
    console.log('  doctor   ananya@clinic.test');
    console.log('  admin    admin@clinic.test');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
