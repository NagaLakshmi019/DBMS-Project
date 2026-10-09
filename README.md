# TripNest - Tourism and Trip Planner

A full-stack DBMS mini project. Users can explore destinations, hotels and packages, plan trips, book and pay for packages (simulated), save destinations, write hotel reviews, and cancel bookings with refund records. Admins get a dashboard with users, trips, bookings, payments, emails, refunds and messages.

## Features
- Customer and Admin login tabs with role-based access (session tokens, bcrypt password hashing)
- Plan a trip in 6 steps, saved in the database, viewable in **My Trips**
- **Seat availability:** every package has dated departures with limited seats. Booking runs as one transaction (row lock), so overbooking is impossible; cancelling releases the seats (trigger)
- Package booking with an automatic total price (database trigger)
- Simulated payment: a successful payment confirms the booking (trigger) and logs a confirmation email
- Booking cancellation with a refund policy, run as a transaction in a stored procedure
- Wishlist (many-to-many), hotel reviews, search and filters using indexed queries
- Destinations, packages and hotels (photos, rooms, amenities, policies, FAQs) loaded from MySQL
- Admin dashboard: users, trips, bookings (status update), messages, payments, emails, refunds, seats (occupancy, add departures, change capacity)

## Tech stack
HTML, CSS, JavaScript | Node.js, Express | MySQL 8 | mysql2, bcryptjs, cors, dotenv

## Database highlights
25 tables, 4 triggers, 2 stored procedures, 2 views, check constraints, a generated column, and indexes.
ER diagrams: `docs/er-core-tables.png` and `docs/er-hotel-tables.png`.

## Project structure
```
index.html, login.html, ...   frontend pages
css/, js/                     frontend styles and scripts
backend/                      Express server and API routes
database/                     SQL scripts (run in order)
docs/                         ER diagrams
```

## Setup
1. Install [Node.js (LTS)](https://nodejs.org) and MySQL 8.
2. Run the SQL scripts in `database/` **in this order** (MySQL Workbench: open file, run all):
   `01_schema.sql`, `02_upgrade_roles_payments.sql`, `03_upgrade_destination_columns.sql`, `04_upgrade_hotel_details.sql`, `05_upgrade_refunds.sql`, `06_seat_availability.sql`
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

## First admin account
Open the Register page, choose the **Admin** tab, and register with your `ADMIN_CODE` from `.env`. Everyone else registers as a customer.

## Notes
- Payments, refunds and confirmation emails are **simulated**: no real money moves and no real email is sent. They are stored in the `payments`, `refunds` and `email_log` tables.
- Open the site through `http://localhost:3000` (not by double-clicking the HTML files) so the API calls work.
- Photos are online image links, so an internet connection is needed to see pictures.
