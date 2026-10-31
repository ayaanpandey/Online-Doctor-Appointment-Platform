const Appointment = require('../models/Appointment');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS_AHEAD = 60;

const pad = (n) => String(n).padStart(2, '0');
const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Every slot a doctor offers on a given date, ignoring bookings.
function allSlots(doctor, date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (!doctor.workingDays.includes(weekday)) return [];
  const slots = [];
  const end = toMinutes(doctor.endTime);
  for (let m = toMinutes(doctor.startTime); m + doctor.slotMinutes <= end; m += doctor.slotMinutes) {
    slots.push(toTime(m));
  }
  return slots;
}

const isPast = (date, time) => new Date(`${date}T${time}:00`) <= new Date();

function isTooFar(date) {
  const limit = new Date();
  limit.setDate(limit.getDate() + MAX_DAYS_AHEAD);
  return new Date(`${date}T00:00:00`) > limit;
}

// Slots still open: not booked, not in the past.
async function availableSlots(doctor, date, { ignoreAppointmentId } = {}) {
  const all = allSlots(doctor, date);
  if (!all.length) return [];
  const query = { doctor: doctor._id, date, status: 'booked' };
  if (ignoreAppointmentId) query._id = { $ne: ignoreAppointmentId };
  const taken = new Set(await Appointment.find(query).distinct('time'));
  return all.filter((t) => !taken.has(t) && !isPast(date, t));
}

// Returns an error message, or null if the requested slot can be offered at all.
function checkSlot(doctor, date, time) {
  if (!isValidDate(date)) return 'Choose a valid date';
  if (!allSlots(doctor, date).includes(time)) return 'That time is not in the doctor’s schedule';
  if (isPast(date, time)) return 'That time has already passed';
  if (isTooFar(date)) return `Appointments open up to ${MAX_DAYS_AHEAD} days ahead`;
  return null;
}

module.exports = { isValidDate, availableSlots, checkSlot, MAX_DAYS_AHEAD };
