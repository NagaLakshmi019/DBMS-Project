-- TripNest upgrade 9: DESTINATION HUB.
-- Makes Destinations -> Hotels -> Packages -> Plan Trip -> My Trips -> Booking one connected flow.
-- OKKA SARI matrame run cheyandi. Run after 01..08.
--
--  Before:  packages had no destination, trips stored the package as free text, trips and bookings were
--           not connected, and the planner let you pick "Kyoto + a hotel in Santorini".
--  After :  destination is the hub.  hotel.dest_id, package.dest_id and trip.dest_id all agree, enforced by
--           COMPOSITE FOREIGN KEYS (the database refuses a mismatched hotel/package, not just the screen).
--           A trip can be booked (bookings.trip_id) and its status follows the booking automatically.
USE tripnest;
SET SQL_SAFE_UPDATES = 0;

-- ============================================================
-- 1) Three packages had no destination row at all: add them (image reused from the package)
-- ============================================================
INSERT INTO destinations (name, country, continent, style, price, rating, reviews_count, best_season, description, flag, weather, duration, img_url)
SELECT 'Patagonia', 'Argentina & Chile', 'south-america', 'Adventure', 1450, 4.8, 640, 'Nov - Mar',
       'Granite towers, glaciers and wind-swept steppe: the end of the world for trekkers.', '🇦🇷', '12°C Windy', '12 Days',
       (SELECT img_url FROM packages WHERE name = 'Patagonia Trekking Expedition' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE name = 'Patagonia');

INSERT INTO destinations (name, country, continent, style, price, rating, reviews_count, best_season, description, flag, weather, duration, img_url)
SELECT 'Amalfi Coast', 'Italy', 'europe', 'Romantic', 1250, 4.7, 980, 'May - Sep',
       'Pastel cliff villages, lemon groves and a deep blue sea along Italy''s most scenic road.', '🇮🇹', '25°C Sunny', '6 Days',
       (SELECT img_url FROM packages WHERE name = 'Amalfi Coast Getaway' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE name = 'Amalfi Coast');

INSERT INTO destinations (name, country, continent, style, price, rating, reviews_count, best_season, description, flag, weather, duration, img_url)
SELECT 'Great Barrier Reef', 'Australia', 'oceania', 'Marine Adventure', 1380, 4.8, 870, 'Jun - Oct',
       'The world''s largest coral system: snorkelling, diving and island-hopping cruises.', '🇦🇺', '24°C Warm', '8 Days',
       (SELECT img_url FROM packages WHERE name = 'Great Barrier Reef Cruise' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE name = 'Great Barrier Reef');

-- ============================================================
-- 2) Every package belongs to one destination
-- ============================================================
ALTER TABLE packages ADD COLUMN dest_id INT NULL;

UPDATE packages p
JOIN destinations d ON d.name = CASE p.name
    WHEN 'Santorini Sunset Escape'       THEN 'Santorini'
    WHEN 'Swiss Alps Summit Trail'       THEN 'Swiss Alps'
    WHEN 'Serengeti Safari Trail'        THEN 'Serengeti'
    WHEN 'Bali Wellness Retreat'         THEN 'Bali'
    WHEN 'Maldives Overwater Bliss'      THEN 'Maldives'
    WHEN 'Kyoto Cultural Journey'        THEN 'Kyoto'
    WHEN 'Patagonia Trekking Expedition' THEN 'Patagonia'
    WHEN 'Amalfi Coast Getaway'          THEN 'Amalfi Coast'
    WHEN 'Great Barrier Reef Cruise'     THEN 'Great Barrier Reef' END
SET p.dest_id = d.dest_id;

-- if this fails, one of YOUR own packages is not in the list above: set its dest_id by hand, then run again from here
ALTER TABLE packages MODIFY dest_id INT NOT NULL;
ALTER TABLE packages
  ADD CONSTRAINT fk_package_destination FOREIGN KEY (dest_id) REFERENCES destinations (dest_id),
  ADD UNIQUE KEY uq_package_dest (package_id, dest_id);       -- target for the composite foreign key below
ALTER TABLE hotels ADD UNIQUE KEY uq_hotel_dest (hotel_id, dest_id);

-- ============================================================
-- 3) Every destination gets at least one hotel (sample hotels: replace or extend them with your own)
-- ============================================================
INSERT INTO hotels (dest_id, name, stars, price_per_night, location, address, description)
SELECT d.dest_id, v.hotel, v.stars, v.price, v.location, v.location, v.descr
FROM (
  SELECT 'Kyoto' AS dest, 'Gion Garden Ryokan' AS hotel, 4 AS stars, 230 AS price, 'Gion, Kyoto, Japan' AS location, 'Traditional ryokan with tatami rooms, a quiet garden and kaiseki dinners.' AS descr
  UNION ALL SELECT 'Serengeti', 'Savanna Ridge Safari Lodge', 5, 480, 'Central Serengeti, Tanzania', 'Luxury tented suites with sunrise game drives and a watering-hole terrace.'
  UNION ALL SELECT 'Tokyo', 'Shibuya Sky Hotel', 4, 210, 'Shibuya, Tokyo, Japan', 'Compact designer rooms steps from the famous crossing, with skyline views.'
  UNION ALL SELECT 'Venice', 'Canal House Venezia', 4, 240, 'Cannaregio, Venice, Italy', 'Restored palazzo on a quiet canal with a private water-taxi stop.'
  UNION ALL SELECT 'Florence', 'Arno River Boutique', 4, 200, 'Oltrarno, Florence, Italy', 'Artisan-quarter boutique hotel with a rooftop view of the Duomo.'
  UNION ALL SELECT 'London', 'Thames Row Hotel', 4, 260, 'Southwark, London, United Kingdom', 'Modern riverside rooms close to the South Bank and Borough Market.'
  UNION ALL SELECT 'Barcelona', 'Gothic Quarter Residences', 4, 175, 'Barri Gotic, Barcelona, Spain', 'Apartment-style rooms in a medieval lane, five minutes from the beach.'
  UNION ALL SELECT 'Dubai', 'Marina Crest Towers', 5, 340, 'Dubai Marina, UAE', 'High-rise suites with a marina view, infinity pool and private beach access.'
  UNION ALL SELECT 'New York', 'Midtown Loft Hotel', 4, 290, 'Midtown, New York, USA', 'Industrial-chic lofts walking distance from Broadway and Central Park.'
  UNION ALL SELECT 'Banff', 'Bow Valley Mountain Lodge', 4, 220, 'Banff, Alberta, Canada', 'Timber lodge with a stone fireplace lounge and shuttle to the lakes.'
  UNION ALL SELECT 'Machu Picchu', 'Sacred Valley Inca Lodge', 4, 185, 'Urubamba, Sacred Valley, Peru', 'Adobe-style lodge among orchards, with guided Inca-trail briefings.'
  UNION ALL SELECT 'Rio de Janeiro', 'Copacabana Palms Hotel', 4, 160, 'Copacabana, Rio de Janeiro, Brazil', 'Beachfront hotel with a rooftop pool facing Sugarloaf Mountain.'
  UNION ALL SELECT 'Sydney', 'Harbour Bridge Suites', 5, 330, 'The Rocks, Sydney, Australia', 'Harbour-view suites beside the Opera House ferry wharf.'
  UNION ALL SELECT 'Patagonia', 'Torres del Paine Eco Camp', 4, 270, 'Torres del Paine, Chile', 'Geodesic dome rooms with panoramic windows and guided trek departures.'
  UNION ALL SELECT 'Amalfi Coast', 'Positano Cliffside Inn', 5, 380, 'Positano, Amalfi Coast, Italy', 'Terraced rooms hanging above the sea, with a lemon-garden breakfast.'
  UNION ALL SELECT 'Great Barrier Reef', 'Reef Edge Resort', 4, 300, 'Port Douglas, Queensland, Australia', 'Tropical resort with a marina, dive centre and daily reef departures.'
) v
JOIN destinations d ON d.name = v.dest
WHERE NOT EXISTS (SELECT 1 FROM hotels h WHERE h.dest_id = d.dest_id);

-- ============================================================
-- 4) Trips: real package link + composite foreign keys
--    (hotel_id, dest_id) must exist in hotels and (package_id, dest_id) must exist in packages.
--    A NULL hotel/package is allowed (stay-only or package-only trips) and is not checked.
-- ============================================================
-- old trips that picked a hotel from a different destination keep the trip but lose the wrong hotel
UPDATE trips t JOIN hotels h ON h.hotel_id = t.hotel_id SET t.hotel_id = NULL WHERE h.dest_id <> t.dest_id;

ALTER TABLE trips DROP FOREIGN KEY trips_ibfk_3;               -- replaced by the stricter composite key
ALTER TABLE trips
  ADD COLUMN package_id INT NULL AFTER hotel_id,
  ADD CONSTRAINT fk_trip_hotel_in_dest   FOREIGN KEY (hotel_id,   dest_id) REFERENCES hotels   (hotel_id,   dest_id),
  ADD CONSTRAINT fk_trip_package_in_dest FOREIGN KEY (package_id, dest_id) REFERENCES packages (package_id, dest_id);
-- trips.package_tier (free text) is kept only so old rows still display; new trips use package_id

-- ============================================================
-- 5) Bookings can come from a trip; at most ONE active booking per trip (enforced by a unique index
--    on a generated column that is NULL for cancelled bookings, so cancelled history does not block a re-book)
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN trip_id INT NULL,
  ADD COLUMN active_trip_key INT GENERATED ALWAYS AS (IF(trip_id IS NOT NULL AND status <> 'cancelled', trip_id, NULL)) VIRTUAL,
  ADD CONSTRAINT fk_booking_trip FOREIGN KEY (trip_id) REFERENCES trips (trip_id),
  ADD UNIQUE KEY uq_one_active_booking_per_trip (active_trip_key);

DELIMITER //

-- the trip status follows its booking: paid -> confirmed, cancelled/expired -> back to planned
DROP TRIGGER IF EXISTS trg_booking_trip_sync//
CREATE TRIGGER trg_booking_trip_sync AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF NEW.trip_id IS NOT NULL AND NEW.status <> OLD.status THEN
    IF NEW.status = 'confirmed' THEN
      UPDATE trips SET status = 'confirmed' WHERE trip_id = NEW.trip_id;
    ELSEIF NEW.status = 'cancelled' THEN
      UPDATE trips SET status = 'planned' WHERE trip_id = NEW.trip_id;
    END IF;
  END IF;
END//

-- sp_book_package: same seat logic as 08, plus an optional trip (p_trip may be NULL).
-- With a trip it also checks: the trip is yours, it has a package, the departure belongs to that package,
-- and the trip has no active booking yet. The trip dates are then set from the departure.
DROP PROCEDURE IF EXISTS sp_book_package//
CREATE PROCEDURE sp_book_package(IN p_user INT, IN p_departure INT, IN p_travelers INT, IN p_trip INT)
BEGIN
  DECLARE c_hold_minutes INT DEFAULT 30;
  DECLARE v_package      INT DEFAULT NULL;
  DECLARE v_date         DATE;
  DECLARE v_left         INT;
  DECLARE v_days         INT;
  DECLARE v_id           INT;
  DECLARE v_msg          VARCHAR(100);
  DECLARE v_trip_user    INT DEFAULT NULL;
  DECLARE v_trip_package INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_travelers IS NULL OR p_travelers < 1 OR p_travelers > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Travelers must be between 1 and 10';
  END IF;

  START TRANSACTION;

  SELECT d.package_id, d.departure_date, d.seats_total - d.seats_booked, p.days
  INTO   v_package, v_date, v_left, v_days
  FROM   package_departures d JOIN packages p ON p.package_id = d.package_id
  WHERE  d.departure_id = p_departure
  FOR UPDATE OF d;

  IF v_package IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Departure not found';
  END IF;
  IF v_date <= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This departure is closed for booking';
  END IF;
  IF v_left < p_travelers THEN
    SET v_msg = IF(v_left = 0, 'Sold out: no seats left on this date',
                   CONCAT('Only ', v_left, ' seat(s) left on this date'));
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  IF p_trip IS NOT NULL THEN
    SELECT user_id, package_id INTO v_trip_user, v_trip_package FROM trips WHERE trip_id = p_trip FOR UPDATE;
    IF v_trip_user IS NULL OR v_trip_user <> p_user THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trip not found';
    END IF;
    IF v_trip_package IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This trip has no package to book';
    END IF;
    IF v_trip_package <> v_package THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This departure belongs to a different package than your trip';
    END IF;
    IF EXISTS (SELECT 1 FROM bookings WHERE trip_id = p_trip AND status <> 'cancelled') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This trip already has a booking';
    END IF;
  END IF;

  UPDATE package_departures SET seats_booked = seats_booked + p_travelers WHERE departure_id = p_departure;

  INSERT INTO bookings (user_id, package_id, travel_date, travelers, departure_id, hold_expires_at, trip_id)
  VALUES (p_user, v_package, v_date, p_travelers, p_departure, DATE_ADD(NOW(), INTERVAL c_hold_minutes MINUTE), p_trip);
  SET v_id = LAST_INSERT_ID();

  IF p_trip IS NOT NULL THEN
    UPDATE trips SET start_date = v_date, end_date = DATE_ADD(v_date, INTERVAL v_days DAY), travelers = p_travelers
    WHERE trip_id = p_trip;
  END IF;

  COMMIT;

  SELECT b.booking_id, b.package_id, b.departure_id, b.trip_id, b.travel_date, b.travelers,
         b.total_price, b.status, d.seats_left,
         TIMESTAMPDIFF(MINUTE, NOW(), b.hold_expires_at) AS hold_minutes
  FROM bookings b JOIN package_departures d ON d.departure_id = b.departure_id
  WHERE b.booking_id = v_id;
END//

DELIMITER ;

-- ============================================================
-- 6) Views used by the website
-- ============================================================
CREATE OR REPLACE VIEW v_trip_details AS
SELECT t.trip_id, u.full_name, d.name AS destination, d.country, h.name AS hotel,
       COALESCE(p.name, t.package_tier) AS package_name,
       t.travelers, t.budget, t.start_date, t.end_date, t.duration_days, t.status,
       t.user_id, t.dest_id, t.hotel_id, t.package_id,
       b.booking_id, b.status AS booking_status
FROM trips t
JOIN users u        ON u.user_id = t.user_id
JOIN destinations d ON d.dest_id = t.dest_id
LEFT JOIN hotels h    ON h.hotel_id = t.hotel_id
LEFT JOIN packages p  ON p.package_id = t.package_id
LEFT JOIN bookings b  ON b.trip_id = t.trip_id AND b.status <> 'cancelled';

CREATE OR REPLACE VIEW v_destination_hub AS
SELECT d.dest_id, d.name, d.country,
       (SELECT COUNT(*)             FROM hotels   h WHERE h.dest_id = d.dest_id) AS hotels_count,
       (SELECT COUNT(*)             FROM packages p WHERE p.dest_id = d.dest_id) AS packages_count,
       (SELECT MIN(price_per_night) FROM hotels   h WHERE h.dest_id = d.dest_id) AS min_hotel_price,
       (SELECT MIN(price)           FROM packages p WHERE p.dest_id = d.dest_id) AS min_package_price
FROM destinations d;

SET SQL_SAFE_UPDATES = 1;

-- ============================================================
-- VIVA QUERIES
-- 1. The hub: what can I do at each destination?
--      SELECT * FROM v_destination_hub ORDER BY packages_count DESC, hotels_count DESC;
-- 2. Prove the database blocks a mismatched trip (must give error 1452):
--      INSERT INTO trips (user_id, dest_id, hotel_id, start_date, end_date) VALUES (1, 10, 1, '2027-03-01', '2027-03-05');
--      -- dest 10 = Kyoto, hotel 1 = Azure Cliff Resort (Santorini)  -> foreign key fails
-- 3. Trips with their package and booking status:
--      SELECT trip_id, destination, hotel, package_name, status, booking_status FROM v_trip_details;
-- 4. Destinations that have both a package and a hotel:
--      SELECT name FROM v_destination_hub WHERE hotels_count > 0 AND packages_count > 0;
-- ============================================================
