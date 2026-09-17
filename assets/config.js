window.STORE_CONFIG = {
  STORE_NAME: 'Store Flowers',
  API_URL: 'https://script.google.com/macros/s/AKfycbyIAkvM1KW15nWVB3hS86WYAcFAIuwUcFLDYKhIgEFZlbipzR8JJ-2uesPvPjXf2MIr/exec',
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
  const scripts = isAdmin
    ? ['assets/admin-enhancements.js','assets/admin-catalog-manager.js','assets/admin-backend-guard.js']
    : ['assets/reservation-status.js'];
  scripts.forEach(src => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  });
})();
