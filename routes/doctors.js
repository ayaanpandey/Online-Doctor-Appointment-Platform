const express = require('express');
const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const { isValidDate, availableSlots, MAX_DAYS_AHEAD } = require('../utils/slots');

const router = express.Router();
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Search and filter doctors: /api/doctors?q=sharma&specialization=Cardiology
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      filter.name = new RegExp(escapeRegex(req.query.q.trim()), 'i');
    }
    if (typeof req.query.specialization === 'string' && req.query.specialization) {
      filter.specialization = req.query.specialization;
    }
    const doctors = await Doctor.find(filter).sort({ name: 1 }).select('-user');
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

router.get('/specializations', async (_req, res, next) => {
  try {
    res.json({ specializations: (await Doctor.distinct('specialization')).sort() });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Doctor not found' });
    const doctor = await Doctor.findById(req.params.id).select('-user');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    res.json({ doctor });
  } catch (err) {
    next(err);
  }
});

// Open slots for one date: /api/doctors/:id/slots?date=2026-11-05
router.get('/:id/slots', async (req, res, next) => {
  try {
    const { date, exclude } = req.query;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Doctor not found' });
    if (!isValidDate(date)) return res.status(400).json({ message: 'Choose a valid date' });
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const limit = new Date();
    limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
    if (new Date(`${date}T00:00:00`) > limit) return res.json({ date, slots: [] });

    const ignoreAppointmentId = mongoose.isValidObjectId(exclude) ? exclude : undefined;
    res.json({ date, slots: await availableSlots(doctor, date, { ignoreAppointmentId }) });
  } catch (err) {
    next(err);
  }
});

// Admin: add a doctor profile (optionally with a login so the doctor can manage their own schedule)
router.post('/', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { email, password, ...profile } = req.body;
    if (email && password) {
      if (await User.findOne({ email: String(email).toLowerCase() })) {
        return res.status(409).json({ message: 'An account with this email already exists' });
      }
      const user = await User.create({ name: profile.name, email, password, role: 'doctor' });
      profile.user = user._id;
    }
    const doctor = await Doctor.create({
      user: profile.user,
      name: profile.name,
      specialization: profile.specialization,
      experienceYears: profile.experienceYears,
      fee: profile.fee,
      bio: profile.bio,
      workingDays: profile.workingDays,
      startTime: profile.startTime,
      endTime: profile.endTime,
      slotMinutes: profile.slotMinutes,
    });
    res.status(201).json({ doctor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
