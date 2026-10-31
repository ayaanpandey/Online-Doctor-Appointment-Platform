const mongoose = require('mongoose');

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const doctorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    specialization: { type: String, required: true, trim: true, maxlength: 60 },
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },
    fee: { type: Number, min: 0, default: 0 },
    bio: { type: String, trim: true, maxlength: 400, default: '' },
    // 0 = Sunday ... 6 = Saturday
    workingDays: { type: [Number], default: [1, 2, 3, 4, 5], validate: (v) => v.every((d) => d >= 0 && d <= 6) },
    startTime: { type: String, default: '09:00', match: timeRe },
    endTime: { type: String, default: '17:00', match: timeRe },
    slotMinutes: { type: Number, enum: [15, 20, 30, 45, 60], default: 30 },
  },
  { timestamps: true }
);

doctorSchema.index({ specialization: 1 });

module.exports = mongoose.model('Doctor', doctorSchema);
