const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD (clinic-local date)
    time: { type: String, required: true }, // HH:MM (24h)
    reason: { type: String, trim: true, maxlength: 300, default: '' },
    status: { type: String, enum: ['booked', 'completed', 'cancelled'], default: 'booked' },
  },
  { timestamps: true }
);

// Database-level guard against double booking: only one *active* booking per doctor/date/time.
// Cancelled appointments don't hold the slot, so it becomes available again.
appointmentSchema.index(
  { doctor: 1, date: 1, time: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } }
);
appointmentSchema.index({ patient: 1, date: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);
