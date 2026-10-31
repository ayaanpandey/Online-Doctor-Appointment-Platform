# Clinic Hours: Online Doctor Appointment Platform

A full-stack appointment booking system. Patients search for doctors, see real open time slots, and book, reschedule or cancel. Doctors manage their own schedule. Admins see everything.

**Stack:** Node.js, Express, MongoDB (Mongoose), JWT auth, vanilla JavaScript frontend (no build step)

## Features

- **Patients:** search by name or specialty, view open slots for any date in the next 60 days, book with a reason, reschedule, cancel
- **Doctors:** personal schedule view, mark visits completed, cancel
- **Admins:** view all appointments, add doctor profiles with logins
- **Double-booking prevention:** slots are validated on the server, and a unique partial index in MongoDB (`doctor + date + time` where `status = booked`) guarantees two people can never hold the same slot, even under simultaneous requests. Cancelling frees the slot.
- **Security:** bcrypt password hashing (12 rounds), JWT authentication, role-based access control, `helmet` security headers with a strict CSP, rate limiting on auth routes, input validation, request size limits, and XSS-safe rendering
- **Accessible UI:** keyboard navigable, visible focus, labelled form fields, live regions for results and messages, responsive down to mobile, reduced-motion support

## Getting started

Requires Node.js 18+ and a running MongoDB (local or [Atlas](https://www.mongodb.com/atlas)).

```bash
git clone https://github.com/<your-username>/doctor-appointment-platform.git
cd doctor-appointment-platform
npm install
cp .env.example .env      # then set JWT_SECRET and MONGO_URI
npm run seed              # loads demo doctors and accounts
npm start                 # http://localhost:3000
```

### Demo accounts (password: `Password123`)

| Role    | Email                |
|---------|----------------------|
| Patient | patient@clinic.test  |
| Doctor  | ananya@clinic.test   |
| Admin   | admin@clinic.test    |

## API

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/api/auth/register` | Public | Create a patient account |
| POST | `/api/auth/login` | Public | Sign in, returns JWT |
| GET | `/api/auth/me` | Signed in | Current user |
| GET | `/api/doctors?q=&specialization=` | Public | Search doctors |
| GET | `/api/doctors/specializations` | Public | List specialties |
| GET | `/api/doctors/:id/slots?date=YYYY-MM-DD` | Public | Open slots for a date |
| POST | `/api/doctors` | Admin | Add a doctor |
| POST | `/api/appointments` | Patient | Book `{doctorId, date, time, reason}` |
| GET | `/api/appointments/mine` | Signed in | Own appointments (all, for admin) |
| PATCH | `/api/appointments/:id/reschedule` | Patient, Admin | Move to `{date, time}` |
| PATCH | `/api/appointments/:id/cancel` | Patient, Doctor, Admin | Cancel |
| PATCH | `/api/appointments/:id/complete` | Doctor, Admin | Mark completed |

Send the token as `Authorization: Bearer <token>`.

## Project structure

```
server.js            Express app, security middleware, routes
seed.js              Demo data loader
config/db.js         MongoDB connection
models/              User, Doctor, Appointment schemas
middleware/auth.js   JWT check and role-based access control
routes/              auth, doctors, appointments
utils/slots.js       Slot generation and availability rules
public/              Frontend (HTML, CSS, JavaScript)
```

## Design notes

- Dates and times are stored as plain `YYYY-MM-DD` / `HH:MM` strings in the clinic's local time. This avoids timezone drift for a single-location clinic. Multi-timezone support would mean storing a timezone per doctor.
- Doctor schedules (working days, hours, slot length) live on the doctor document, and slots are generated on demand rather than stored.

## Ideas for next steps

- Email or SMS reminders (Nodemailer, Twilio)
- Doctor-managed leave and blocked times
- Automated tests (Jest and Supertest with `mongodb-memory-server`)
- Payments (Razorpay or Stripe) and deployment to Render or Railway with MongoDB Atlas

## License

MIT
