# TripNest - Tourism and Trip Planner

A full-stack DBMS mini project. Users can explore destinations, hotels and packages, plan trips, book and pay for packages (simulated), save destinations, write hotel reviews, and cancel bookings with refund records. Admins get a dashboard with users, trips, bookings, payments, emails, refunds and messages.

## Features
- Customer and Admin login tabs with role-based access (bcrypt password hashing, database sessions with expiry, logout, brute-force lockout)
- Plan a trip in 6 steps, saved in the database, viewable in **My Trips**
- **Seat availability:** every package has dated departures with limited seats. Booking runs as one transaction (row lock), so overbooking is impossible; cancelling releases the seats (trigger)
- **One connected flow (destination = hub):** Destinations show how many hotels/packages they have -> *Plan Trip* opens the planner on that destination -> hotels and packages are loaded for that destination only -> the saved trip keeps `hotel_id` and `package_id` -> *My Trips* has **Book this trip** (pick a departure, seats are held) -> pay -> the trip becomes *confirmed*. Packages and hotel pages link into the same planner.
- **The database enforces the flow:** composite foreign keys `(hotel_id, dest_id)` and `(package_id, dest_id)` on `trips` mean a trip can never have a hotel or package from another destination; a unique index on a generated column allows only one active booking per trip; a trigger keeps the trip status in step with its booking.
- **Booking hold expiry:** a booking holds its seats for 30 minutes. If it is not paid, a MySQL EVENT (`ev_expire_pending_bookings`, every minute) cancels it, releases the seats and writes an email log. Paying at the last second is safe (row lock)
- **Hotel ratings are always correct:** triggers recalculate `hotels.rating` with `AVG()` whenever a review is added, changed or deleted
- Package booking with an automatic total price (database trigger)
- Simulated payment: a successful payment confirms the booking (trigger) and logs a confirmation email
- Booking cancellation with a refund policy, run as a transaction in a stored procedure
- Wishlist (many-to-many), hotel reviews, search and filters using indexed queries
- Destinations, packages and hotels (photos, rooms, amenities, policies, FAQs) loaded from MySQL
- Admin dashboard: users, trips, bookings (status update), messages, payments, emails, refunds, seats (occupancy, add departures, change capacity)

## Tech stack
HTML, CSS, JavaScript | Node.js, Express | MySQL 8 | mysql2, bcryptjs, dotenv (cors only if you set CORS_ORIGIN)

## Database highlights
26 tables, 8 triggers, 4 stored procedures, 3 views, 1 scheduled event, composite foreign keys, check constraints, a generated column, and indexes.
ER diagrams: `docs/er-core-tables.png` and `docs/er-hotel-tables.png`.

## Project structure
```
index.html, login.html, ...   frontend pages
css/, js/                     frontend styles and scripts
backend/                      Express server, API routes, security helpers and tests
database/                     SQL scripts (run in order)
docs/                         ER diagrams
```

## Setup
1. Install [Node.js (LTS)](https://nodejs.org) and MySQL 8.
2. Run the SQL scripts in `database/` **in this order** (MySQL Workbench: open file, run all):
   `01_schema.sql`, `02_upgrade_roles_payments.sql`, `03_upgrade_destination_columns.sql`, `04_upgrade_hotel_details.sql`, `05_upgrade_refunds.sql`, `06_seat_availability.sql`, `07_security.sql`, `08_hold_expiry_and_ratings.sql`, `09_destination_hub.sql`
   (`01_schema.sql` drops and recreates the `tripnest` database.)
3. In the `backend` folder, copy `.env.example` to `.env` and set your MySQL password and an admin invite code.
4. Install and start:
   ```
   cd backend
   npm install
   node server.js
   ```
5. Open http://localhost:3000

## Overbooking test (viva demo)
After setup, run `cd backend && node test-overbooking.js`. It makes 10 people book the last 3 seats at the same moment: exactly 3 succeed, 7 are told "Sold out", and the seat counter never goes above the total.

## Demo scripts for the viva
| Command (inside `backend/`) | What it proves |
|---|---|
| `node test-overbooking.js` | 10 people, 3 seats at the same moment: exactly 3 succeed |
| `node test-security.js` | 41 attack checks (needs the server running) |
| `node test-flow.js` | 24 checks of the connected flow: hub data, the database refusing a mismatched hotel/package, plan trip, book from My Trips, pay, cancel, re-book (needs the server running) |
| `node test-hold-and-ratings.js` | rating triggers + the MySQL event cancelling an unpaid booking (waits up to ~90 s; add `--now` for instant) |

## Security (what is protected and how)
| Risk | Protection |
|---|---|
| Reading or deleting another user's trips/bookings | Every user route needs a valid session; the user id comes from the session token, never from the request. `/api/users/:id/...` is owner-only, trip delete checks the owner in SQL |
| Stolen / never-expiring login tokens | Tokens are random 256-bit values; only their SHA-256 hash is stored in the `sessions` table with an expiry (default 12 h). Logout deletes the session. Role is re-read from `users` on every request |
| Password guessing | bcrypt hashing, 5 wrong passwords lock that account+device for 15 minutes, sign-up and contact form are rate limited |
| Source code / SQL files downloadable from the website | The server only serves `/css`, `/js`, `/images` and top-level `.html` pages |
| Admin abuse | Admin sign-up needs `ADMIN_CODE` (disabled if not set). Admins can only cancel bookings (through the refund procedure); a booking becomes confirmed only when the customer pays |
| Double charging | `/api/pay` is one transaction with `SELECT ... FOR UPDATE` on the booking |
| Stored XSS (script in a review) | Review text and names are escaped before they are shown |
| SQL injection | All queries use placeholders; sort columns are whitelisted |
| Leaking internals | Real errors only go to the server log; the browser gets a clean message. Body size limit, security headers, CORS off by default |
| Catalog pollution | `plan-trip` can no longer create new destinations/hotels |
| Too much database power | Optional least-privilege MySQL user in `07_security.sql` instead of `root` |

Run the attack test (server must be running): `cd backend && node test-security.js` (41 checks, prints PASS/FAIL).

## First admin account
Open the Register page, choose the **Admin** tab, and register with your `ADMIN_CODE` from `.env`. Everyone else registers as a customer.

## Notes
- Logins are stored in the `sessions` table, so you stay logged in when the server restarts (until the session expires).
- Never email or upload your real `backend/.env` file (it holds your database password and admin code).
- Payments, refunds and confirmation emails are **simulated**: no real money moves and no real email is sent. They are stored in the `payments`, `refunds` and `email_log` tables.
- Open the site through `http://localhost:3000` (not by double-clicking the HTML files) so the API calls work.
- Photos are online image links, so an internet connection is needed to see pictures.
