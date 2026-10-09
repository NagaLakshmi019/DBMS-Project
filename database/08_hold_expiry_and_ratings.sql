-- TripNest upgrade 8: (A) hotel rating always matches its reviews, (B) unpaid bookings expire after 30 minutes.
-- OKKA SARI matrame run cheyandi. Run after 01..07.
USE tripnest;
SET SQL_SAFE_UPDATES = 0;   -- Workbench "safe update mode" would block the backfill updates below

-- ============================================================
-- PART A: hotels.rating is a DERIVED value (average of reviews). Keep it correct automatically.
--  Before: rating was typed in by hand, so it did not match the reviews (e.g. stored 5.0, real average 4.3).
--  Now: any INSERT / UPDATE / DELETE on reviews recalculates the hotel's rating with AVG().
-- ============================================================
DELIMITER //

DROP PROCEDURE IF EXISTS sp_refresh_hotel_rating//
CREATE PROCEDURE sp_refresh_hotel_rating(IN p_hotel INT)
BEGIN
  -- AVG over zero reviews is NULL, so a hotel with no reviews has no rating (instead of a fake one)
  UPDATE hotels
  SET rating = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE hotel_id = p_hotel)
  WHERE hotel_id = p_hotel;
END//

DROP TRIGGER IF EXISTS trg_review_after_insert//
CREATE TRIGGER trg_review_after_insert AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
  CALL sp_refresh_hotel_rating(NEW.hotel_id);
END//

DROP TRIGGER IF EXISTS trg_review_after_update//
CREATE TRIGGER trg_review_after_update AFTER UPDATE ON reviews
FOR EACH ROW
BEGIN
  CALL sp_refresh_hotel_rating(NEW.hotel_id);
  IF OLD.hotel_id <> NEW.hotel_id THEN       -- review moved to another hotel: fix both
    CALL sp_refresh_hotel_rating(OLD.hotel_id);
  END IF;
END//

DROP TRIGGER IF EXISTS trg_review_after_delete//
CREATE TRIGGER trg_review_after_delete AFTER DELETE ON reviews
FOR EACH ROW
BEGIN
  CALL sp_refresh_hotel_rating(OLD.hotel_id);
END//

DELIMITER ;

-- One-time backfill: make today's stored ratings match the reviews that already exist.
-- (This will lower some displayed ratings, e.g. 4.9 -> 4.5. That is the honest value.)
UPDATE hotels
SET rating = (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.hotel_id = hotels.hotel_id)
WHERE hotel_id IN (SELECT DISTINCT hotel_id FROM reviews);

-- ============================================================
-- PART B: seat hold expiry.
--  Booking holds the seats immediately (06). If the customer never pays, the seats would be blocked forever.
--  Now every booking has a 30 minute payment window; a MySQL EVENT cancels expired unpaid bookings every minute.
--  Cancelling fires trg_booking_seats, so the seats go back on sale automatically.
-- ============================================================
ALTER TABLE bookings ADD COLUMN hold_expires_at DATETIME NULL;
CREATE INDEX idx_booking_hold ON bookings (status, hold_expires_at);

-- bookings that are already pending get a fresh 30 minute window
UPDATE bookings SET hold_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
WHERE status = 'pending' AND hold_expires_at IS NULL;

DELIMITER //

-- sp_book_package: same as 06, plus the payment deadline
DROP PROCEDURE IF EXISTS sp_book_package//
CREATE PROCEDURE sp_book_package(IN p_user INT, IN p_departure INT, IN p_travelers INT)
BEGIN
  DECLARE c_hold_minutes INT DEFAULT 30;
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

  INSERT INTO bookings (user_id, package_id, travel_date, travelers, departure_id, hold_expires_at)
  VALUES (p_user, v_package, v_date, p_travelers, p_departure, DATE_ADD(NOW(), INTERVAL c_hold_minutes MINUTE));
  SET v_id = LAST_INSERT_ID();

  COMMIT;

  SELECT b.booking_id, b.package_id, b.departure_id, b.travel_date, b.travelers,
         b.total_price, b.status, d.seats_left,
         TIMESTAMPDIFF(MINUTE, NOW(), b.hold_expires_at) AS hold_minutes
  FROM bookings b JOIN package_departures d ON d.departure_id = b.departure_id
  WHERE b.booking_id = v_id;
END//

-- sp_expire_pending_bookings: cancels every unpaid booking whose payment window is over.
--  * one small transaction per booking, with the row locked (FOR UPDATE), so a customer who pays at the
--    very last second and the expiry job can never both win: whoever locks the row first decides.
--  * safe to run many times, even at the same moment: a booking that is already cancelled is skipped.
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
    SET v_done = 0;                                   -- SELECT ... INTO also raises NOT FOUND when no row

    IF v_status = 'pending' THEN
      -- trg_booking_seats gives the seats back, trg_booking_cancelled_at stamps the time
      UPDATE bookings SET status = 'cancelled', cancel_reason = 'Payment window expired'
      WHERE booking_id = v_id;
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
END//

-- runs the procedure every minute inside MySQL (no Node.js needed)
DROP EVENT IF EXISTS ev_expire_pending_bookings//
CREATE EVENT ev_expire_pending_bookings
  ON SCHEDULE EVERY 1 MINUTE
  DO CALL sp_expire_pending_bookings()//

DELIMITER ;

SET SQL_SAFE_UPDATES = 1;
-- Events only run while the scheduler is ON (MySQL 8 default is ON). To keep it ON after a MySQL restart,
-- add the line  event_scheduler=ON  under [mysqld] in my.ini. If this line gives a privilege error, ignore it.
SET GLOBAL event_scheduler = ON;

-- ============================================================
-- VIVA QUERIES
-- 1. Rating must equal the average of reviews (must return 0 rows):
--      SELECT h.hotel_id, h.rating, ROUND(AVG(r.rating),1) AS real_avg FROM hotels h JOIN reviews r USING (hotel_id)
--      GROUP BY h.hotel_id, h.rating HAVING h.rating <> real_avg;
-- 2. Unpaid bookings and time left:
--      SELECT booking_id, status, TIMESTAMPDIFF(MINUTE, NOW(), hold_expires_at) AS minutes_left
--      FROM bookings WHERE status = 'pending';
-- 3. Is the event running?
--      SHOW EVENTS FROM tripnest;   SELECT @@event_scheduler;
-- ============================================================
