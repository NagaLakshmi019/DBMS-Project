/**
 * TripNest - Login Form Validation
 * File Name: login.js
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Select Form and Input Elements
  const loginForm = document.querySelector('.login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  if (!loginForm) return;

  // Regular expression for validating email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 2. Add Event Listener for Form Submission
  loginForm.addEventListener('submit', (e) => {
    // Prevent default form submission behavior
    e.preventDefault();

    // Reset previous error messages and input styles
    clearErrors();

    let isValid = true;

    // 3. Validate Email Field
    const emailValue = emailInput.value.trim();
    if (emailValue === '') {
      showError(emailInput, 'Email address cannot be empty.');
      isValid = false;
    } else if (!emailRegex.test(emailValue)) {
      showError(emailInput, 'Please enter a valid email address.');
      isValid = false;
    }

    // 4. Validate Password Field
    const passwordValue = passwordInput.value;
    if (passwordValue === '') {
      showError(passwordInput, 'Password cannot be empty.');
      isValid = false;
    } else if (passwordValue.length < 8) {
      showError(passwordInput, 'Password must contain at least 8 characters.');
      isValid = false;
    }

    // 5. Success Action
    if (isValid) {
      alert('Login Successful! Welcome to TripNest.');
      loginForm.reset();
      clearErrors();
    }
  });

  /**
   * Displays an error message below the input field and sets a red border.
   * @param {HTMLElement} inputElement - The invalid input field
   * @param {string} message - The error message to display
   */
  function showError(inputElement, message) {
    // Highlight invalid input field with red border
    inputElement.style.borderColor = '#ef4444';

    // Locate the container (.form-group)
    const formGroup = inputElement.closest('.form-group');

    // Create or locate the error message element
    let errorElement = formGroup.querySelector('.error-message');
    if (!errorElement) {
      errorElement = document.createElement('small');
      errorElement.className = 'error-message';
      errorElement.style.color = '#ef4444';
      errorElement.style.fontSize = '0.775rem';
      errorElement.style.marginTop = '4px';
      errorElement.style.display = 'block';
      errorElement.style.fontWeight = '500';
      formGroup.appendChild(errorElement);
    }

    errorElement.textContent = message;
  }

  /**
   * Clears all existing error messages and resets borders.
   */
  function clearErrors() {
    // Restore default borders for inputs
    const inputs = loginForm.querySelectorAll('.form-input');
    inputs.forEach((input) => {
      input.style.borderColor = '';
    });

    // Remove all error message elements
    const errorMessages = loginForm.querySelectorAll('.error-message');
    errorMessages.forEach((msg) => msg.remove());
  }

  // 6. Real-time error cleanup on user input
  [emailInput, passwordInput].forEach((input) => {
    if (input) {
      input.addEventListener('input', () => {
        input.style.borderColor = '';
        const formGroup = input.closest('.form-group');
        const errorText = formGroup.querySelector('.error-message');
        if (errorText) {
          errorText.remove();
        }
      });
    }
  });
});

 /*---------- CUSTOM CURSOR ---------- */
  const cursor = document.getElementById('cursor');
  const isTouch = window.matchMedia('(hover: none)').matches;

  if (!isTouch) {
    let mx = 0, my = 0, cx = 0, cy = 0;
    window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

    function animateCursor() {
      cx += (mx - cx) * 0.18;
      cy += (my - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    document.querySelectorAll('a, button, select, input, .cat-card, .pkg-card, .gallery-item, .pin').forEach(el => {
      el.addEventListener('mouseenter', () => {
        if (el.matches('.cat-card, .pkg-card, .gallery-item, .pin')) cursor.classList.add('hover-card');
        else cursor.classList.add('hover-btn');
      });
      el.addEventListener('mouseleave', () => cursor.classList.remove('hover-card', 'hover-btn'));
    });

    window.addEventListener('mousedown', () => cursor.classList.add('click'));
    window.addEventListener('mouseup', () => cursor.classList.remove('click'));
  }


