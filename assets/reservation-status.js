(() => {
  const cfg = window.STORE_CONFIG || {};

  function readLastReservation() {
    try {
      const value = JSON.parse(localStorage.getItem('sf_last_reservation') || 'null');
      if (!value || !value.id) return null;
      return value;
    } catch {
      return null;
    }
  }

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function formatExpiry(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  }

  function mount() {
    if (document.body.classList.contains('admin-body')) return;
    if (document.querySelector('.last-reservation-banner')) return;
    const reservation = readLastReservation();
    if (!reservation) return;

    const created = reservation.created_at ? new Date(reservation.created_at) : null;
    if (created && !Number.isNaN(created.getTime()) && Date.now() - created.getTime() > 24 * 60 * 60 * 1000) {
      localStorage.removeItem('sf_last_reservation');
      return;
    }

    const whatsapp = digits(cfg.PUBLIC_WHATSAPP);
    const expiresAt = reservation.expires_at ? new Date(reservation.expires_at) : null;
    const stillReserved = expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > Date.now();
    const expiryText = formatExpiry(reservation.expires_at);

    const style = document.createElement('style');
    style.textContent = `
      .last-reservation-banner{max-width:1180px;margin:14px auto 0;padding:14px 18px;border:1px solid rgba(33,30,30,.12);border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 10px 28px rgba(44,32,30,.06)}
      .last-reservation-copy{display:flex;align-items:flex-start;gap:12px;min-width:0}.last-reservation-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff2e7;flex:0 0 auto}.last-reservation-copy strong{display:block;font-size:14px}.last-reservation-copy small{display:block;margin-top:3px;color:#756e6b;line-height:1.35}.last-reservation-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}.last-reservation-actions a,.last-reservation-actions button{border:0;border-radius:999px;padding:10px 14px;font:600 13px/1 'DM Sans',sans-serif;cursor:pointer;text-decoration:none}.last-reservation-actions a{background:#211e1e;color:#fff}.last-reservation-actions button{background:#f3efec;color:#3b3533}
      @media(max-width:700px){.last-reservation-banner{margin:10px 14px 0;padding:13px 14px;align-items:stretch;flex-direction:column;border-radius:16px}.last-reservation-actions{width:100%}.last-reservation-actions a{flex:1;text-align:center}.last-reservation-actions button{padding-inline:13px}}
    `;
    document.head.appendChild(style);

    const banner = document.createElement('section');
    banner.className = 'last-reservation-banner';
    banner.setAttribute('aria-label', 'Última reserva');
    const safeId = String(reservation.id).replace(/[<>&"']/g, '');
    let subtext = 'Tu separación fue registrada correctamente.';
    if (stillReserved && expiryText) subtext = `El stock quedó separado inicialmente hasta las ${expiryText}. Continúa por WhatsApp para coordinar la compra y el delivery.`;
    else if (expiryText) subtext = `La separación inicial fue hasta las ${expiryText}. Si aún deseas el pedido, consúltanos por WhatsApp para verificar stock.`;

    const waHref = whatsapp
      ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, quiero continuar con mi reserva ${safeId}.`)}`
      : '';

    banner.innerHTML = `
      <div class="last-reservation-copy">
        <span class="last-reservation-icon">✓</span>
        <div><strong>Reserva ${safeId}</strong><small>${subtext}</small></div>
      </div>
      <div class="last-reservation-actions">
        ${waHref ? `<a href="${waHref}">Continuar por WhatsApp</a>` : ''}
        <button type="button" aria-label="Ocultar aviso">Cerrar</button>
      </div>
    `;
    banner.querySelector('button').addEventListener('click', () => {
      banner.remove();
      localStorage.removeItem('sf_last_reservation');
    });

    const announcement = document.querySelector('.announcement');
    if (announcement) announcement.insertAdjacentElement('afterend', banner);
    else document.body.prepend(banner);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  window.addEventListener('pageshow', mount);
  window.addEventListener('sf:reservation-created', mount);
})();
