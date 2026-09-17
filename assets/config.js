window.STORE_CONFIG = {
  STORE_NAME: 'Store Flowers',
  API_URL: 'https://script.google.com/macros/s/AKfycbydlj7_SiUiVNgcIHZIFSHdThgm2lxWKZJztTbuE4M3qq3cnXvVEj7namoNklUPRTWw/exec',
  PUBLIC_WHATSAPP: '51956892798',
  RESERVATION_MINUTES: 30,
  DEFAULT_CITY: 'Piura',
  DEFAULT_REGION: 'Piura',
  COUNTRY: 'Perú',
  CURRENCY: 'PEN',
  CURRENCY_SYMBOL: 'S/'
};

(() => {
  const isAdmin = /(?:^|\/)admin\.html(?:$|[?#])/.test(location.pathname + location.search + location.hash);
  const script = document.createElement('script');
  script.src = isAdmin ? 'assets/admin-enhancements.js' : 'assets/reservation-status.js';
  script.defer = true;
  document.head.appendChild(script);
})();
