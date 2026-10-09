-- TripNest upgrade 6: SEAT AVAILABILITY (overbooking prevention). OKKA SARI matrame run cheyandi.
-- Run after 01..05. Needs MySQL 8.0.16+ (CHECK constraints are enforced from that version).
USE tripnest;

-- ============================================================
-- 1) Departures: every package has dated departures with limited seats
-- ============================================================
CREATE TABLE package_departures (
  departure_id   INT AUTO_INCREMENT PRIMARY KEY,
  package_id     INT  NOT NULL,
  departure_date DATE NOT NULL,
  seats_total    INT  NOT NULL,
  seats_booked   INT  NOT NULL DEFAULT 0,
  seats_left     INT GENERATED ALWAYS AS (seats_total - seats_booked) VIRTUAL,
  CONSTRAINT uq_pkg_date     UNIQUE (package_id, departure_date),
  CONSTRAINT chk_seats_total CHECK (seats_total > 0),
  -- Last line of defence: even if some code forgets to check, the DB itself refuses overbooking
  CONSTRAINT chk_seats_range CHECK (seats_booked >= 0 AND seats_booked <= seats_total),
  CONSTRAINT fk_dep_package  FOREIGN KEY (package_id) REFERENCES packages(package_id) ON DELETE CASCADE
);
CREATE INDEX idx_dep_date ON package_departures(departure_date);

-- Each booking points to the departure it holds seats on.
-- NULL is allowed only for old bookings made before this upgrade.
ALTER TABLE bookings
  ADD COLUMN departure_id INT NULL,
  ADD CONSTRAINT fk_booking_departure FOREIGN KEY (departure_id) REFERENCES package_departures(departure_id);

-- ============================================================
-- 2) Seed: 6 upcoming departures per package (dates are relative to today)
-- ============================================================
INSERT INTO package_departures (package_id, departure_date, seats_total)
SELECT p.package_id, DATE_ADD(CURDATE(), INTERVAL o.d DAY), 6 + MOD(p.package_id * 3 + o.d, 9)
FROM packages p
JOIN (SELECT 14 AS d UNION ALL SELECT 30 UNION ALL SELECT 45
      UNION ALL SELECT 60 UNION ALL SELECT 90 UNION ALL SELECT 120) o;

-- Demo helper: first departure of package 1 has only 2 seats (easy to show "sold out" in viva)
UPDATE package_departures SET seats_total = 2
WHERE package_id = 1 AND departure_date = DATE_ADD(CURDATE(), INTERVAL 14 DAY);

-- ============================================================
-- 3) Trigger: seats are released when a booking is cancelled (by user OR by admin),
--    and taken again if an admin re-activates a cancelled booking.
--    One place handles both paths, so the count can never drift.
-- ============================================================
DELIMITER //
CREATE TRIGGER trg_booking_seats AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF NEW.departure_id IS NOT NULL THEN
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      UPDATE package_departures SET seats_booked = seats_booked - OLD.travelers
      WHERE departure_id = OLD.departure_id;
    ELSEIF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      -- if seats are not available any more, chk_seats_range rejects this update
      UPDATE package_departures SET seats_booked = seats_booked + NEW.travelers
      WHERE departure_id = NEW.departure_id;
    END IF;
  END IF;
END//

-- ============================================================
-- 4) Stored procedure: book seats safely (transaction + row lock)
--    Old signature (user, package, date, travelers) is replaced by (user, departure, travelers).
--    SELECT ... FOR UPDATE makes simultaneous bookings for the same departure wait in a queue,
--    so two users can never grab the same last seat.
-- ============================================================
DROP PROCEDURE IF EXISTS sp_book_package//
CREATE PROCEDURE sp_book_package(IN p_user INT, IN p_departure INT, IN p_travelers INT)
BEGIN
  DECLARE v_package INT DEFAULT NULL;
  DECLARE v_date    DATE;
  DECLARE v_left    INT;
  DECLARE v_id      INT;
  DECLARE v_msg     VARCHAR(100);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_travelers IS NULL OR p_travelers < 1 OR p_travelers > 10 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Travelers must be between 1 and 10';
  END IF;

  START TRANSACTION;

  SELECT package_id, departure_date, seats_total - seats_booked
  INTO   v_package, v_date, v_left
  FROM   package_departures
  WHERE  departure_id = p_departure
  FOR UPDATE;

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

  UPDATE package_departures SET seats_booked = seats_booked + p_travelers
  WHERE departure_id = p_departure;

  -- trg_booking_total fills total_price automatically
  INSERT INTO bookings (user_id, package_id, travel_date, travelers, departure_id)
  VALUES (p_user, v_package, v_date, p_travelers, p_departure);
  SET v_id = LAST_INSERT_ID();

  COMMIT;

  SELECT b.booking_id, b.package_id, b.departure_id, b.travel_date, b.travelers,
         b.total_price, b.status, d.seats_left
  FROM bookings b JOIN package_departures d ON d.departure_id = b.departure_id
  WHERE b.booking_id = v_id;
END//
DELIMITER ;

-- ============================================================
-- 5) View: availability per departure (used by the booking modal and the admin "Seats" tab)
-- ============================================================
CREATE OR REPLACE VIEW v_departure_availability AS
SELECT d.departure_id, p.package_id, p.name AS package_name, p.price,
       d.departure_date, d.seats_total, d.seats_booked, d.seats_left,
       ROUND(d.seats_booked * 100 / d.seats_total) AS occupancy_pct,
       CASE WHEN d.seats_left = 0 THEN 'sold_out'
            WHEN d.seats_left <= 3 THEN 'filling_fast'
            ELSE 'available' END AS availability
FROM package_departures d
JOIN packages p ON p.package_id = d.package_id;

-- ============================================================
-- VIVA / REPORT QUERIES
-- 1. Open departures with seats left:
--      SELECT * FROM v_departure_availability WHERE departure_date > CURDATE() AND seats_left > 0;
-- 2. Consistency check (must return 0 rows): stored counter vs real active bookings
--      SELECT d.departure_id, d.seats_booked, COALESCE(SUM(b.travelers),0) AS real_booked
--      FROM package_departures d
--      LEFT JOIN bookings b ON b.departure_id = d.departure_id AND b.status <> 'cancelled'
--      GROUP BY d.departure_id, d.seats_booked
--      HAVING d.seats_booked <> real_booked;
-- 3. Packages most in demand (HAVING):
--      SELECT package_name, SUM(seats_booked) booked, SUM(seats_total) total
--      FROM v_departure_availability GROUP BY package_name HAVING booked > 0 ORDER BY booked DESC;
-- ============================================================
