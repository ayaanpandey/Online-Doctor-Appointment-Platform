const express = require('express');
const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const { protect, restrictTo } = require('../middleware/auth');
const { checkSlot } = require('../utils/slots');

const router = express.Router();
router.use(protect);

const populate = [
  { path: 'doctor', select: 'name specialization fee' },
  { path: 'patient', select: 'name email' },
];

// Loads an appointment and confirms the signed-in user may act on it.
async function loadAppointment(req, res, { allowed }) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'Appointment not found' });
    return null;
  }
  const appt = await Appointment.findById(req.params.id);
  if (!appt) {
    res.status(404).json({ message: 'Appointment not found' });
    return null;
  }
  const { role, _id } = req.user;
  let permitted = role === 'admin' && allowed.includes('admin');
  if (!permitted && role === 'patient' && allowed.includes('patient')) permitted = appt.patient.equals(_id);
  if (!permitted && role === 'doctor' && allowed.includes('doctor')) {
    const profile = await Doctor.findOne({ user: _id }).select('_id');
    permitted = !!profile && appt.doctor.equals(profile._id);
  }
  if (!permitted) {
    // Same message as "not found" so IDs can't be probed.
    res.status(404).json({ message: 'Appointment not found' });
    return null;
  }
  return appt;
}

const isDuplicateKey = (err) => err && err.code === 11000;
const SLOT_TAKEN = { message: 'Someone just booked that time. Pick another slot.' };

// Book
router.post('/', restrictTo('patient'), async (req, res, next) => {
  try {
    const { doctorId, date, time, reason } = req.body;
    if (!mongoose.isValidObjectId(doctorId)) return res.status(400).json({ message: 'Choose a doctor' });
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const problem = checkSlot(doctor, date, time);
    if (problem) return res.status(400).json({ message: problem });

    const appt = await Appointment.create({
      patient: req.user._id,
      doctor: doctor._id,
      date,
      time,
      reason: typeof reason === 'string' ? reason.slice(0, 300) : '',
    });
    res.status(201).json({ appointment: await appt.populate(populate) });
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json(SLOT_TAKEN);
    next(err);
  }
});

// List: patients see their own, doctors see theirs, admins see all
router.get('/mine', async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'patient') filter.patient = req.user._id;
    if (req.user.role === 'doctor') {
      const profile = await Doctor.findOne({ user: req.user._id }).select('_id');
      if (!profile) return res.json({ appointments: [] });
      filter.doctor = profile._id;
    }
    const appointments = await Appointment.find(filter).sort({ date: 1, time: 1 }).populate(populate);
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

// Reschedule (patient who owns it)
router.patch('/:id/reschedule', async (req, res, next) => {
  try {
    const appt = await loadAppointment(req, res, { allowed: ['patient', 'admin'] });
    if (!appt) return;
    if (appt.status !== 'booked') return res.status(400).json({ message: 'Only upcoming appointments can be rescheduled' });

    const { date, time } = req.body;
    if (date === appt.date && time === appt.time) return res.status(400).json({ message: 'Pick a different time' });

    const doctor = await Doctor.findById(appt.doctor);
    const problem = checkSlot(doctor, date, time);
    if (problem) return res.status(400).json({ message: problem });

    appt.date = date;
    appt.time = time;
    await appt.save();
    res.json({ appointment: await appt.populate(populate) });
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json(SLOT_TAKEN);
    next(err);
  }
});

// Cancel (patient, the doctor, or admin)
router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const appt = await loadAppointment(req, res, { allowed: ['patient', 'doctor', 'admin'] });
    if (!appt) return;
    if (appt.status !== 'booked') return res.status(400).json({ message: 'This appointment is already closed' });
    appt.status = 'cancelled';
    await appt.save();
    res.json({ appointment: await appt.populate(populate) });
  } catch (err) {
    next(err);
  }
});

// Mark as completed (the doctor or admin)
router.patch('/:id/complete', restrictTo('doctor', 'admin'), async (req, res, next) => {
  try {
    const appt = await loadAppointment(req, res, { allowed: ['doctor', 'admin'] });
    if (!appt) return;
    if (appt.status !== 'booked') return res.status(400).json({ message: 'This appointment is already closed' });
    appt.status = 'completed';
    await appt.save();
    res.json({ appointment: await appt.populate(populate) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
