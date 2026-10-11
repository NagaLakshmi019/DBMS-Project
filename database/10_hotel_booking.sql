-- TripNest upgrade 10: HOTEL STAYS (room inventory + date-overlap booking).
-- OKKA SARI matrame run cheyandi. Run after 01..09.
--
--  1. The 16 sample hotels added in 09 had no photos/rooms/amenities, so hotels.html showed broken images and their
--     detail page crashed. They now get full details (this script fixes that).
--  2. Every room type has an inventory (units). A stay is a booking of a room type for a date range.
--     Availability is calculated NIGHT BY NIGHT (recursive CTE), so two guests can never get the last room on the same night.
--  3. Stays can be paid, cancelled (refund follows the room's own cancellation policy), expire after 30 minutes unpaid,
--     and can belong to a trip (stay-only trips become bookable).
USE tripnest;
SET SQL_SAFE_UPDATES = 0;

-- ============================================================
-- 1) Room inventory
-- ============================================================
-- room_id was a plain number; to add rooms normally it must be AUTO_INCREMENT. MySQL does not allow that while other
-- tables point at it, so those two foreign keys are dropped and put back right after.
ALTER TABLE room_features DROP FOREIGN KEY room_features_ibfk_1;
ALTER TABLE room_images   DROP FOREIGN KEY room_images_ibfk_1;

ALTER TABLE rooms
  MODIFY room_id INT NOT NULL AUTO_INCREMENT,
  ADD COLUMN units             INT NOT NULL DEFAULT 3,        -- how many rooms of this type the hotel has
  ADD COLUMN max_guests        INT NOT NULL DEFAULT 2,        -- guests per room (number, capacity_label stays as the text)
  ADD COLUMN free_cancel_hours INT NULL,                      -- NULL = non-refundable
  ADD CONSTRAINT chk_room_units CHECK (units > 0),
  ADD UNIQUE KEY uq_room_hotel (room_id, hotel_id);           -- target of the composite key from hotel_bookings

ALTER TABLE room_features ADD CONSTRAINT room_features_ibfk_1 FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE;
ALTER TABLE room_images   ADD CONSTRAINT room_images_ibfk_1   FOREIGN KEY (room_id) REFERENCES rooms (room_id) ON DELETE CASCADE;

UPDATE rooms
SET max_guests        = CAST(SUBSTRING_INDEX(capacity_label, ' ', 1) AS UNSIGNED),
    units             = CASE sort_order WHEN 0 THEN 6 WHEN 1 THEN 4 ELSE 2 END,
    free_cancel_hours = CASE WHEN cancellation LIKE 'Free cancellation until %' THEN CAST(REGEXP_SUBSTR(cancellation, '[0-9]+') AS UNSIGNED) END;

-- ============================================================
-- 2) Full details for hotels that have none yet (the sample hotels from 09)
--    Photos reuse the destination photo; replace them with real hotel photos whenever you like.
-- ============================================================
CREATE TEMPORARY TABLE tmp_seed (
  hotel VARCHAR(120), lat DECIMAL(9,6), lng DECIMAL(9,6), badge1 VARCHAR(40), badge2 VARCHAR(40),
  pool TINYINT, spa TINYINT, gym TINYINT, parking TINYINT,
  a1 VARCHAR(60), d1 VARCHAR(20), a2 VARCHAR(60), d2 VARCHAR(20), a3 VARCHAR(60), d3 VARCHAR(20));
INSERT INTO tmp_seed VALUES
 ('Gion Garden Ryokan',          35.003700,  135.775600, 'Traditional Ryokan', 'Garden View',        0,1,0,0, 'Gion District','0.3 km',          'Fushimi Inari Shrine','5 km',       'Kansai Airport','75 km'),
 ('Savanna Ridge Safari Lodge',  -2.333300,   34.833300, 'Safari Lodge', 'Sunrise Game Drives',      1,1,0,1, 'Seronera Visitor Centre','6 km',  'Great Migration Viewpoint','12 km', 'Seronera Airstrip','8 km'),
 ('Shibuya Sky Hotel',           35.659500,  139.700500, 'City Views', 'Near the Station',           0,0,1,0, 'Shibuya Crossing','0.2 km',       'Meiji Shrine','1.8 km',             'Haneda Airport','17 km'),
 ('Canal House Venezia',         45.443700,   12.326700, 'Canal Front', 'Historic Palazzo',          0,0,0,0, 'Rialto Bridge','1.5 km',          'St Mark Square','2.2 km',           'Marco Polo Airport','12 km'),
 ('Arno River Boutique',         43.766000,   11.245000, 'Rooftop View', 'Boutique',                 0,0,0,0, 'Ponte Vecchio','0.6 km',          'Duomo di Firenze','1.4 km',         'Florence Airport','7 km'),
 ('Thames Row Hotel',            51.504500,   -0.086500, 'Riverside', 'Near Borough Market',         0,0,1,0, 'Borough Market','0.4 km',         'Tower Bridge','1.6 km',             'Heathrow Airport','28 km'),
 ('Gothic Quarter Residences',   41.383000,    2.177000, 'Old Town', 'Apartment Style',              0,0,0,0, 'Barcelona Cathedral','0.3 km',    'Barceloneta Beach','1.4 km',        'El Prat Airport','15 km'),
 ('Marina Crest Towers',         25.080500,   55.140300, 'Marina View', 'Private Beach',             1,1,1,1, 'Dubai Marina Walk','0.2 km',      'JBR Beach','1.2 km',                'Dubai International Airport','32 km'),
 ('Midtown Loft Hotel',          40.754900,  -73.984000, 'Midtown', 'Loft Style',                    0,0,1,0, 'Times Square','0.5 km',           'Central Park','1.6 km',             'JFK Airport','24 km'),
 ('Bow Valley Mountain Lodge',   51.178400, -115.570800, 'Mountain Lodge', 'Fireplace Lounge',       0,1,0,1, 'Banff Avenue','0.8 km',           'Lake Minnewanka','6 km',            'Calgary Airport','128 km'),
 ('Sacred Valley Inca Lodge',   -13.305000,  -72.116700, 'Sacred Valley', 'Garden Lodge',            1,0,0,1, 'Ollantaytambo Ruins','18 km',     'Maras Salt Mines','25 km',          'Cusco Airport','60 km'),
 ('Copacabana Palms Hotel',     -22.971100,  -43.182200, 'Beachfront', 'Rooftop Pool',               1,0,1,0, 'Copacabana Beach','0.1 km',       'Sugarloaf Mountain','4 km',         'Galeao Airport','22 km'),
 ('Harbour Bridge Suites',      -33.858700,  151.208700, 'Harbour View', 'Luxury Suites',            1,1,1,0, 'Sydney Opera House','0.8 km',     'Harbour Bridge','0.3 km',           'Sydney Airport','10 km'),
 ('Torres del Paine Eco Camp',  -51.250000,  -72.933300, 'Eco Camp', 'Dome Rooms',                   0,0,0,1, 'Torres Viewpoint','4 km',         'Grey Glacier','18 km',              'Puerto Natales Airport','112 km'),
 ('Positano Cliffside Inn',      40.628000,   14.485000, 'Cliffside', 'Sea View',                    1,0,0,0, 'Positano Beach','0.4 km',         'Path of the Gods','5 km',           'Naples Airport','60 km'),
 ('Reef Edge Resort',           -16.483900,  145.464000, 'Reef Access', 'Marina Resort',             1,1,1,1, 'Four Mile Beach','1 km',          'Low Isles Reef','15 km',            'Cairns Airport','65 km');

-- only hotels that have no photos yet are touched (the 6 original hotels keep their data)
DROP TABLE IF EXISTS tmp_new;
-- (a normal table, because MySQL cannot read one TEMPORARY table twice in a UNION; it is dropped again below)
CREATE TABLE tmp_new AS
  SELECT h.hotel_id, h.name, h.price_per_night, d.img_url, s.*
  FROM hotels h JOIN destinations d ON d.dest_id = h.dest_id JOIN tmp_seed s ON s.hotel = h.name
  WHERE h.hotel_id NOT IN (SELECT hotel_id FROM hotel_images);

UPDATE hotels h JOIN tmp_new n ON n.hotel_id = h.hotel_id
SET h.latitude = n.lat, h.longitude = n.lng, h.panorama_url = n.img_url;

INSERT INTO hotel_images (hotel_id, sort_order, url)
SELECT n.hotel_id, k.s, n.img_url FROM tmp_new n CROSS JOIN (SELECT 0 AS s UNION ALL SELECT 1 UNION ALL SELECT 2) k;

INSERT INTO hotel_badges (hotel_id, badge, sort_order)
SELECT hotel_id, badge1, 0 FROM tmp_new UNION ALL SELECT hotel_id, badge2, 1 FROM tmp_new;

-- amenities: everyone has Wi-Fi + restaurant; the rest follow the flags above
INSERT INTO hotel_amenities (hotel_id, amenity_id, sort_order)
SELECT n.hotel_id, a.amenity_id, a.amenity_id - 1
FROM tmp_new n JOIN amenities a
  ON a.code IN ('wifi', 'restaurant')
  OR (a.code = 'pool'    AND n.pool    = 1)
  OR (a.code = 'spa'     AND n.spa     = 1)
  OR (a.code = 'gym'     AND n.gym     = 1)
  OR (a.code = 'parking' AND n.parking = 1);

-- three room types per hotel, priced from the hotel's "from" price
INSERT INTO rooms (hotel_id, name, size_label, capacity_label, bed, price, cancellation, sort_order, units, max_guests, free_cancel_hours)
SELECT n.hotel_id, t.name, t.size, t.cap, t.bed, ROUND(n.price_per_night * t.mult), t.cancel, t.sort_no, t.units, t.guests, t.fch
FROM tmp_new n JOIN (
  SELECT 'Superior Room' AS name, '28 m²' AS size, '2 guests' AS cap, '1 King bed' AS bed, 1.00 AS mult, 'Free cancellation until 48h before' AS cancel, 0 AS sort_no, 6 AS units, 2 AS guests, 48 AS fch
  UNION ALL SELECT 'Deluxe Room', '38 m²', '3 guests', '1 King + Sofa bed', 1.35, 'Free cancellation until 72h before', 1, 4, 3, 72
  UNION ALL SELECT 'Family Suite', '55 m²', '4 guests', '2 Queen beds', 1.90, 'Non-refundable', 2, 2, 4, NULL
) t;

INSERT INTO room_features (room_id, feature, sort_order)
SELECT r.room_id, f.feature, f.o FROM rooms r JOIN tmp_new n ON n.hotel_id = r.hotel_id
CROSS JOIN (SELECT 'Air conditioning' AS feature, 0 AS o UNION ALL SELECT 'Free Wi-Fi', 1 UNION ALL SELECT 'Breakfast option', 2) f
WHERE r.room_id NOT IN (SELECT room_id FROM room_features);

INSERT INTO room_images (room_id, sort_order, url)
SELECT r.room_id, 0, n.img_url FROM rooms r JOIN tmp_new n ON n.hotel_id = r.hotel_id
WHERE r.room_id NOT IN (SELECT room_id FROM room_images);

INSERT INTO hotel_policies (hotel_id, label, policy_value, sort_order)
SELECT hotel_id, 'Check-in', '2:00 PM', 0 FROM tmp_new UNION ALL
SELECT hotel_id, 'Check-out', '11:00 AM', 1 FROM tmp_new UNION ALL
SELECT hotel_id, 'Pets', 'On request', 2 FROM tmp_new;

INSERT INTO hotel_rules (hotel_id, rule_text, sort_order)
SELECT hotel_id, 'No smoking inside rooms', 0 FROM tmp_new UNION ALL
SELECT hotel_id, 'Quiet hours 10 PM – 7 AM', 1 FROM tmp_new UNION ALL
SELECT hotel_id, 'Valid photo ID required at check-in', 2 FROM tmp_new;

INSERT INTO hotel_attractions (hotel_id, icon, name, distance, sort_order)
SELECT hotel_id, 'pin', a1, d1, 0 FROM tmp_new UNION ALL
SELECT hotel_id, 'beach', a2, d2, 1 FROM tmp_new UNION ALL
SELECT hotel_id, 'airport', a3, d3, 2 FROM tmp_new;

INSERT INTO hotel_faqs (hotel_id, question, answer, sort_order)
SELECT hotel_id, 'Is breakfast included?', 'Breakfast is available at the hotel restaurant and can be added to any room when you arrive.', 0 FROM tmp_new UNION ALL
SELECT hotel_id, 'Is airport pickup available?', 'Yes, the front desk can arrange a pickup. Please tell us your flight details at least 24 hours before arrival.', 1 FROM tmp_new UNION ALL
SELECT hotel_id, 'Can I cancel my booking?', 'Each room type shows its own policy. Free cancellation is possible until the hours shown on the room card; after that the stay is non-refundable.', 2 FROM tmp_new;

-- two sample guest reviews per new hotel; the rating triggers from script 08 calculate hotels.rating from them
INSERT INTO reviews (user_id, hotel_id, rating, comment, reviewer_name, helpful)
SELECT NULL, hotel_id, 5, 'Wonderful stay. The staff were helpful and the location was perfect.', 'Verified guest', 4 FROM tmp_new UNION ALL
SELECT NULL, hotel_id, 4, 'Comfortable room and great value. We would stay here again.', 'Verified guest', 2 FROM tmp_new;

DROP TABLE tmp_new;
DROP TEMPORARY TABLE tmp_seed;

-- ============================================================
-- 3) Hotel bookings
--    * (room_id, hotel_id) composite FK: the room must really belong to the hotel
--    * price is copied at booking time (price_per_night), later price changes do not touch old bookings
--    * subtotal, tax (12%) and total are GENERATED columns, so the total can never disagree with the dates
--    * at most ONE active stay per trip (unique index on a generated column that is NULL when cancelled)
-- ============================================================
CREATE TABLE hotel_bookings (
  hotel_booking_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT  NOT NULL,
  hotel_id         INT  NOT NULL,
  room_id          INT  NOT NULL,
  trip_id          INT  NULL,
  check_in         DATE NOT NULL,
  check_out        DATE NOT NULL,
  rooms_count      INT  NOT NULL DEFAULT 1,
  guests           INT  NOT NULL,
  price_per_night  DECIMAL(10,2) NOT NULL,
  nights           INT GENERATED ALWAYS AS (DATEDIFF(check_out, check_in)) VIRTUAL,
  subtotal         DECIMAL(10,2) GENERATED ALWAYS AS (DATEDIFF(check_out, check_in) * rooms_count * price_per_night) STORED,
  tax              DECIMAL(10,2) GENERATED ALWAYS AS (ROUND(DATEDIFF(check_out, check_in) * rooms_count * price_per_night * 0.12, 2)) STORED,
  total_price      DECIMAL(10,2) GENERATED ALWAYS AS (DATEDIFF(check_out, check_in) * rooms_count * price_per_night
                                                      + ROUND(DATEDIFF(check_out, check_in) * rooms_count * price_per_night * 0.12, 2)) STORED,
  status           ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  hold_expires_at  DATETIME NULL,
  booked_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at     DATETIME NULL,
  cancel_reason    VARCHAR(200) NULL,
  active_trip_key  INT GENERATED ALWAYS AS (IF(trip_id IS NOT NULL AND status <> 'cancelled', trip_id, NULL)) VIRTUAL,
  CONSTRAINT chk_stay_dates  CHECK (check_out > check_in),
  CONSTRAINT chk_stay_guests CHECK (guests >= 1),
  CONSTRAINT chk_stay_rooms  CHECK (rooms_count BETWEEN 1 AND 5),
  CONSTRAINT fk_hb_user       FOREIGN KEY (user_id) REFERENCES users (user_id),
  CONSTRAINT fk_hb_room_hotel FOREIGN KEY (room_id, hotel_id) REFERENCES rooms (room_id, hotel_id),
  CONSTRAINT fk_hb_trip       FOREIGN KEY (trip_id) REFERENCES trips (trip_id),
  UNIQUE KEY uq_one_active_stay_per_trip (active_trip_key),
  KEY idx_hb_room_dates (room_id, status, check_in, check_out),
  KEY idx_hb_user (user_id),
  KEY idx_hb_hold (status, hold_expires_at)
);

-- ============================================================
-- 4) Payments and refunds can now belong to a package booking OR a hotel stay (exactly one of the two)
-- ============================================================
ALTER TABLE payments
  MODIFY booking_id INT NULL,
  ADD COLUMN hotel_booking_id INT NULL,
  ADD CONSTRAINT fk_payment_stay FOREIGN KEY (hotel_booking_id) REFERENCES hotel_bookings (hotel_booking_id) ON DELETE CASCADE,
  ADD CONSTRAINT chk_payment_one_target CHECK ((booking_id IS NULL) <> (hotel_booking_id IS NULL));

ALTER TABLE refunds
  MODIFY booking_id INT NULL,
  ADD COLUMN hotel_booking_id INT NULL,
  ADD CONSTRAINT fk_refund_stay FOREIGN KEY (hotel_booking_id) REFERENCES hotel_bookings (hotel_booking_id) ON DELETE CASCADE,
  ADD CONSTRAINT chk_refund_one_target CHECK ((booking_id IS NULL) <> (hotel_booking_id IS NULL));

DELIMITER //

DROP TRIGGER IF EXISTS trg_payment_confirm//
CREATE TRIGGER trg_payment_confirm AFTER INSERT ON payments
FOR EACH ROW
BEGIN
  IF NEW.status = 'success' THEN
    IF NEW.booking_id IS NOT NULL THEN
      UPDATE bookings SET status = 'confirmed' WHERE booking_id = NEW.booking_id;
    ELSE
      UPDATE hotel_bookings SET status = 'confirmed' WHERE hotel_booking_id = NEW.hotel_booking_id;
    END IF;
  END IF;
END//

-- stamp the cancel time (same idea as trg_booking_cancelled_at for packages)
CREATE TRIGGER trg_hotel_booking_cancelled_at BEFORE UPDATE ON hotel_bookings
FOR EACH ROW
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    SET NEW.cancelled_at = NOW();
  END IF;
END//

-- the trip status follows its stay: paid -> confirmed, cancelled/expired -> back to planned
CREATE TRIGGER trg_hotel_booking_trip_sync AFTER UPDATE ON hotel_bookings
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

-- ============================================================
-- 5) Availability, night by night.
--    A recursive CTE makes one row per night of the stay; for each night we add up the rooms already booked.
--    The room type is available only for the quietest-to-busiest worst night: units - MAX(booked on any night).
-- ============================================================
DROP PROCEDURE IF EXISTS sp_room_availability//
CREATE PROCEDURE sp_room_availability(IN p_hotel INT, IN p_check_in DATE, IN p_check_out DATE)
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-out must be after check-in';
  END IF;
  IF DATEDIFF(p_check_out, p_check_in) > 30 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can book at most 30 nights at a time';
  END IF;

  WITH RECURSIVE nights (d) AS (
    SELECT p_check_in
    UNION ALL
    SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM nights WHERE d < DATE_SUB(p_check_out, INTERVAL 1 DAY)
  ),
  used AS (
    SELECT r.room_id, n.d, COALESCE(SUM(b.rooms_count), 0) AS booked
    FROM rooms r
    CROSS JOIN nights n
    LEFT JOIN hotel_bookings b
           ON b.room_id = r.room_id AND b.status <> 'cancelled' AND b.check_in <= n.d AND b.check_out > n.d
    WHERE r.hotel_id = p_hotel
    GROUP BY r.room_id, n.d
  )
  SELECT r.room_id, r.name, r.price, r.max_guests, r.units, r.free_cancel_hours,
         r.units - MAX(u.booked) AS available
  FROM rooms r JOIN used u ON u.room_id = r.room_id
  WHERE r.hotel_id = p_hotel
  GROUP BY r.room_id, r.name, r.price, r.max_guests, r.units, r.free_cancel_hours, r.sort_order
  ORDER BY r.sort_order;
END//

-- ============================================================
-- 6) Book a stay: one transaction.  The room-type row is locked (FOR UPDATE), so two people booking the same room
--    type at the same moment are handled one after the other and the second one sees the first booking.
-- ============================================================
DROP PROCEDURE IF EXISTS sp_book_room//
CREATE PROCEDURE sp_book_room(IN p_user INT, IN p_room INT, IN p_check_in DATE, IN p_check_out DATE,
                              IN p_guests INT, IN p_rooms INT, IN p_trip INT)
BEGIN
  DECLARE c_hold_minutes INT DEFAULT 30;
  DECLARE v_hotel     INT DEFAULT NULL;
  DECLARE v_price     DECIMAL(10,2);
  DECLARE v_units     INT;
  DECLARE v_max       INT;
  DECLARE v_used      INT DEFAULT 0;
  DECLARE v_id        INT;
  DECLARE v_msg       VARCHAR(100);
  DECLARE v_trip_user INT DEFAULT NULL;
  DECLARE v_trip_pkg  INT DEFAULT NULL;
  DECLARE v_trip_hotel INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_out <= p_check_in THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-out must be after check-in';
  END IF;
  IF p_check_in <= CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in must be tomorrow or later';
  END IF;
  IF DATEDIFF(p_check_out, p_check_in) > 30 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can book at most 30 nights at a time';
  END IF;
  IF p_rooms IS NULL OR p_rooms < 1 OR p_rooms > 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You can book 1 to 5 rooms at a time';
  END IF;
  IF p_guests IS NULL OR p_guests < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'At least 1 guest is required';
  END IF;

  START TRANSACTION;

  SELECT hotel_id, price, units, max_guests INTO v_hotel, v_price, v_units, v_max
  FROM rooms WHERE room_id = p_room FOR UPDATE;
  IF v_hotel IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Room type not found';
  END IF;
  IF p_guests > v_max * p_rooms THEN
    SET v_msg = CONCAT('This room type fits at most ', v_max * p_rooms, ' guest(s) for ', p_rooms, ' room(s)');
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  IF p_trip IS NOT NULL THEN
    SELECT user_id, package_id, hotel_id INTO v_trip_user, v_trip_pkg, v_trip_hotel FROM trips WHERE trip_id = p_trip FOR UPDATE;
    IF v_trip_user IS NULL OR v_trip_user <> p_user THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trip not found';
    END IF;
    IF v_trip_pkg IS NOT NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The package of this trip already includes the stay';
    END IF;
    IF v_trip_hotel IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This trip has no hotel to book';
    END IF;
    IF v_trip_hotel <> v_hotel THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This room belongs to a different hotel than your trip';
    END IF;
    IF EXISTS (SELECT 1 FROM hotel_bookings WHERE trip_id = p_trip AND status <> 'cancelled') THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This trip already has a stay booked';
    END IF;
  END IF;

  -- the busiest night of the requested stay decides how many rooms are still free
  WITH RECURSIVE nights (d) AS (
    SELECT p_check_in
    UNION ALL
    SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM nights WHERE d < DATE_SUB(p_check_out, INTERVAL 1 DAY)
  )
  SELECT COALESCE(MAX(x.booked), 0) INTO v_used FROM (
    SELECT n.d, COALESCE(SUM(b.rooms_count), 0) AS booked
    FROM nights n
    LEFT JOIN hotel_bookings b
           ON b.room_id = p_room AND b.status <> 'cancelled' AND b.check_in <= n.d AND b.check_out > n.d
    GROUP BY n.d
  ) x;

  IF v_units - v_used < p_rooms THEN
    SET v_msg = IF(v_units - v_used <= 0, 'Sold out: no rooms of this type left for these dates',
                   CONCAT('Only ', v_units - v_used, ' room(s) of this type left for these dates'));
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
  END IF;

  INSERT INTO hotel_bookings (user_id, hotel_id, room_id, trip_id, check_in, check_out, rooms_count, guests, price_per_night, hold_expires_at)
  VALUES (p_user, v_hotel, p_room, p_trip, p_check_in, p_check_out, p_rooms, p_guests, v_price, DATE_ADD(NOW(), INTERVAL c_hold_minutes MINUTE));
  SET v_id = LAST_INSERT_ID();

  IF p_trip IS NOT NULL THEN
    UPDATE trips SET start_date = p_check_in, end_date = p_check_out, travelers = p_guests WHERE trip_id = p_trip;
  END IF;

  COMMIT;

  SELECT hb.hotel_booking_id, hb.hotel_id, hb.room_id, hb.trip_id, hb.check_in, hb.check_out, hb.nights, hb.rooms_count,
         hb.guests, hb.price_per_night, hb.subtotal, hb.tax, hb.total_price, hb.status,
         TIMESTAMPDIFF(MINUTE, NOW(), hb.hold_expires_at) AS hold_minutes
  FROM hotel_bookings hb WHERE hb.hotel_booking_id = v_id;
END//

-- ============================================================
-- 7) Cancel a stay. The refund follows the ROOM's own policy (free_cancel_hours):
--    paid + cancelled at least that many hours before check-in = 100%, otherwise 0%. Unpaid stays are just released.
-- ============================================================
DROP PROCEDURE IF EXISTS sp_cancel_hotel_booking//
CREATE PROCEDURE sp_cancel_hotel_booking(IN p_booking INT, IN p_user INT, IN p_reason VARCHAR(200))
BEGIN
  DECLARE v_status  VARCHAR(20) DEFAULT NULL;
  DECLARE v_total   DECIMAL(10,2);
  DECLARE v_in      DATE;
  DECLARE v_fch     INT;
  DECLARE v_hours   INT;
  DECLARE v_payment INT DEFAULT NULL;
  DECLARE v_pct     INT DEFAULT 0;
  DECLARE v_refund  DECIMAL(10,2) DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  SELECT hb.status, hb.total_price, hb.check_in, r.free_cancel_hours
  INTO   v_status, v_total, v_in, v_fch
  FROM hotel_bookings hb JOIN rooms r ON r.room_id = hb.room_id
  WHERE hb.hotel_booking_id = p_booking AND hb.user_id = p_user
  FOR UPDATE OF hb;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stay not found';
  END IF;
  IF v_status = 'cancelled' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stay is already cancelled';
  END IF;

  SET v_hours = TIMESTAMPDIFF(HOUR, NOW(), CAST(v_in AS DATETIME));
  IF v_hours < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Check-in date has passed, so this stay cannot be cancelled';
  END IF;

  SELECT payment_id INTO v_payment FROM payments
  WHERE hotel_booking_id = p_booking AND status = 'success' ORDER BY payment_id DESC LIMIT 1;

  IF v_status = 'confirmed' AND v_payment IS NOT NULL THEN
    SET v_pct = IF(v_fch IS NOT NULL AND v_hours >= v_fch, 100, 0);
    SET v_refund = ROUND(v_total * v_pct / 100, 2);
  END IF;

  UPDATE hotel_bookings SET status = 'cancelled', cancel_reason = p_reason WHERE hotel_booking_id = p_booking;

  IF v_refund > 0 THEN
    INSERT INTO refunds (hotel_booking_id, payment_id, amount, percent_refunded, reason, refund_ref, status)
    VALUES (p_booking, v_payment, v_refund, v_pct, p_reason,
            CONCAT('RS', UNIX_TIMESTAMP(), LPAD(p_booking, 4, '0')), 'processed');
  END IF;

  INSERT INTO email_log (user_id, to_email, subject, body)
  SELECT u.user_id, u.email, 'TripNest stay cancelled',
         CONCAT('Your hotel stay #', p_booking, ' was cancelled. Refund: $', v_refund, ' (', v_pct, '%).')
  FROM users u WHERE u.user_id = p_user;

  COMMIT;

  SELECT p_booking AS hotel_booking_id, 'cancelled' AS status, v_pct AS refund_percent,
         v_refund AS refund_amount, v_hours AS hours_before_checkin;
END//

-- ============================================================
-- 8) Unpaid stays also expire after 30 minutes (same job as packages: sp_expire_pending_bookings calls this one)
-- ============================================================
DROP PROCEDURE IF EXISTS sp_expire_pending_hotel_bookings//
CREATE PROCEDURE sp_expire_pending_hotel_bookings()
BEGIN
  DECLARE v_id     INT;
  DECLARE v_status VARCHAR(20);
  DECLARE v_done   INT DEFAULT 0;
  DECLARE cur CURSOR FOR
    SELECT hotel_booking_id FROM hotel_bookings
    WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < NOW();
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  OPEN cur;
  expire_loop: LOOP
    FETCH cur INTO v_id;
    IF v_done = 1 THEN LEAVE expire_loop; END IF;

    START TRANSACTION;
    SET v_status = NULL;
    SELECT status INTO v_status FROM hotel_bookings WHERE hotel_booking_id = v_id FOR UPDATE;
    SET v_done = 0;

    IF v_status = 'pending' THEN
      UPDATE hotel_bookings SET status = 'cancelled', cancel_reason = 'Payment window expired' WHERE hotel_booking_id = v_id;
      INSERT INTO email_log (user_id, to_email, subject, body)
      SELECT u.user_id, u.email, 'TripNest stay expired',
             CONCAT('Hotel stay #', hb.hotel_booking_id, ' was cancelled because payment was not received within 30 minutes. ',
                    'The rooms were released. You can book again anytime.')
      FROM hotel_bookings hb JOIN users u ON u.user_id = hb.user_id
      WHERE hb.hotel_booking_id = v_id;
    END IF;
    COMMIT;
  END LOOP;
  CLOSE cur;
END//

-- the existing minute-by-minute job (event + Node fallback) now expires stays too
DROP PROCEDURE IF EXISTS sp_expire_pending_bookings//
CREATE PROCEDURE sp_expire_pending_bookings()
BEGIN
  DECLARE v_id     INT;
  DECLARE v_status VARCHAR(20);
  DECLARE v_done   INT DEFAULT 0;
  DECLARE cur CURSOR FOR
    SELECT booking_id FROM bookings
    WHERE status = 'pending' AND hold_expires_at IS NOT NULL AND hold_expires_at < NOW();
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  OPEN cur;
  expire_loop: LOOP
    FETCH cur INTO v_id;
    IF v_done = 1 THEN LEAVE expire_loop; END IF;

    START TRANSACTION;
    SET v_status = NULL;
    SELECT status INTO v_status FROM bookings WHERE booking_id = v_id FOR UPDATE;
    SET v_done = 0;

    IF v_status = 'pending' THEN
      UPDATE bookings SET status = 'cancelled', cancel_reason = 'Payment window expired' WHERE booking_id = v_id;
      INSERT INTO email_log (user_id, to_email, subject, body)
      SELECT u.user_id, u.email, 'TripNest booking expired',
             CONCAT('Booking #', b.booking_id, ' was cancelled because payment was not received within 30 minutes. ',
                    'The seats were released. You can book again anytime.')
      FROM bookings b JOIN users u ON u.user_id = b.user_id
      WHERE b.booking_id = v_id;
    END IF;
    COMMIT;
  END LOOP;
  CLOSE cur;

  CALL sp_expire_pending_hotel_bookings();
END//

DELIMITER ;

-- ============================================================
-- 9) The trip view now also shows its stay booking
-- ============================================================
CREATE OR REPLACE VIEW v_trip_details AS
SELECT t.trip_id, u.full_name, d.name AS destination, d.country, h.name AS hotel,
       COALESCE(p.name, t.package_tier) AS package_name,
       t.travelers, t.budget, t.start_date, t.end_date, t.duration_days, t.status,
       t.user_id, t.dest_id, t.hotel_id, t.package_id,
       b.booking_id, b.status AS booking_status,
       hb.hotel_booking_id AS stay_id, hb.status AS stay_status
FROM trips t
JOIN users u        ON u.user_id = t.user_id
JOIN destinations d ON d.dest_id = t.dest_id
LEFT JOIN hotels h    ON h.hotel_id = t.hotel_id
LEFT JOIN packages p  ON p.package_id = t.package_id
LEFT JOIN bookings b  ON b.trip_id = t.trip_id AND b.status <> 'cancelled'
LEFT JOIN hotel_bookings hb ON hb.trip_id = t.trip_id AND hb.status <> 'cancelled';

SET SQL_SAFE_UPDATES = 1;

-- ============================================================
-- VIVA QUERIES
-- 1. Free rooms per type for a date range (this is what the website calls):
--      CALL sp_room_availability(1, '2027-05-10', '2027-05-14');
-- 2. Overlap rule used everywhere: an existing stay blocks night N when  check_in <= N AND check_out > N.
--    (a guest leaving on the 14th and another arriving on the 14th do NOT clash)
-- 3. Occupancy of every room type tonight:
--      SELECT h.name, r.name, r.units, COALESCE(SUM(b.rooms_count),0) AS booked_tonight
--      FROM rooms r JOIN hotels h USING (hotel_id)
--      LEFT JOIN hotel_bookings b ON b.room_id = r.room_id AND b.status <> 'cancelled' AND b.check_in <= CURDATE() AND b.check_out > CURDATE()
--      GROUP BY h.name, r.room_id, r.name, r.units;
-- 4. Revenue per hotel (HAVING):
--      SELECT h.name, SUM(hb.total_price) AS revenue FROM hotel_bookings hb JOIN hotels h USING (hotel_id)
--      WHERE hb.status = 'confirmed' GROUP BY h.hotel_id, h.name HAVING revenue > 0 ORDER BY revenue DESC;
-- ============================================================
