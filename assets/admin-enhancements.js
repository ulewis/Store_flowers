(() => {
  function mount() {
    if (!document.body.classList.contains('admin-body')) return;
    const topbar = document.querySelector('.admin-topbar');
    if (!topbar || document.getElementById('adminQuickSearch')) return;

    const style = document.createElement('style');
    style.textContent = `
      .admin-quick-search{position:relative;min-width:240px;max-width:360px;flex:1}.admin-quick-search input{width:100%;box-sizing:border-box;border:1px solid rgba(33,30,30,.14);border-radius:999px;background:#fff;padding:11px 38px 11px 15px;font:500 14px/1.2 'DM Sans',sans-serif;outline:none}.admin-quick-search input:focus{border-color:rgba(33,30,30,.4);box-shadow:0 0 0 3px rgba(33,30,30,.06)}.admin-quick-search button{position:absolute;right:7px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:#f2eeeb;cursor:pointer}.admin-filter-empty{padding:18px;color:#7d7470;text-align:center}
      @media(max-width:760px){.admin-topbar{flex-wrap:wrap}.admin-quick-search{order:3;min-width:100%;max-width:none}.admin-quick-search input{font-size:16px}}
    `;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.className = 'admin-quick-search';
    box.innerHTML = '<input id="adminQuickSearch" type="search" autocomplete="off" placeholder="Buscar en esta sección…" aria-label="Buscar en la sección actual"><button type="button" aria-label="Limpiar búsqueda">×</button>';
    const actions = topbar.querySelector('.admin-actions');
    if (actions) topbar.insertBefore(box, actions);
    else topbar.appendChild(box);

    const input = box.querySelector('input');
    const clear = box.querySelector('button');

    function visibleSection() {
      return [...document.querySelectorAll('[data-admin-section]')].find(section => !section.classList.contains('hidden')) || null;
    }

    function applyFilter() {
      const section = visibleSection();
      if (!section) return;
      const q = input.value.trim().toLocaleLowerCase('es');
      section.querySelectorAll('.admin-table tbody tr').forEach(row => {
        if (row.querySelector('[colspan]')) return;
        const text = row.textContent.toLocaleLowerCase('es');
        row.hidden = !!q && !text.includes(q);
      });
    }

    input.addEventListener('input', applyFilter);
    clear.addEventListener('click', () => {
      input.value = '';
      applyFilter();
      input.focus();
    });

    document.querySelectorAll('[data-section]').forEach(button => {
      button.addEventListener('click', () => {
        input.value = '';
        requestAnimationFrame(applyFilter);
      });
    });

    const app = document.getElementById('adminApp');
    if (app) new MutationObserver(() => requestAnimationFrame(applyFilter)).observe(app, {childList:true, subtree:true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
