/* TripNest - navbar auth state (login ayyaka name + My Trips + Logout) */
(function () {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('tripnest_user')); } catch (e) {}
  if (!user) return;

  const loginLink = document.querySelector('header a[href="login.html"]');
  const regLink = document.querySelector('header a[href="register.html"]');
  if (!loginLink) return;

  const box = document.createElement('span');
  box.style.cssText = 'display:inline-flex;align-items:center;gap:14px;font-size:14px;';
  box.innerHTML =
    '<a href="my-trips.html" style="font-weight:600;text-decoration:none;color:inherit;">Hi, ' +
    user.name.split(' ')[0].replace(/</g, '&lt;') + ' · My Trips</a>' +
    '<a href="#" id="logoutLink" style="text-decoration:none;color:#EF4444;font-weight:600;">Logout</a>';

  loginLink.replaceWith(box);
  if (regLink) regLink.remove();

  document.getElementById('logoutLink').addEventListener('click', (e) => {
    e.preventDefault();
    fetch('/api/auth/logout', { method: 'POST', headers: { 'x-auth-token': user.token || '' }, keepalive: true }).catch(() => {});
    localStorage.removeItem('tripnest_user');
    window.location.href = 'index.html';
  });
})();
