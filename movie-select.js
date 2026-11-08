/* Shared, portal-positioned catalogue selectors. Native selects remain data models. */
(() => {
  const instances = new Set();
  class MovieSelect {
    constructor(select) {
      this.select = select;
      this.wrapper = select.closest('.custom-select');
      this.trigger = document.createElement('button');
      this.trigger.type = 'button';
      this.trigger.className = 'toolbar-btn custom-select-trigger';
      this.label = document.createElement('span');
      this.label.className = 'custom-select-label';
      this.trigger.innerHTML = '<svg class="select-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
      this.trigger.prepend(this.label);
      this.trigger.setAttribute('aria-haspopup', 'listbox');
      this.trigger.setAttribute('aria-expanded', 'false');
      this.trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.dataset.placeholder || 'Выберите');
      this.menu = document.createElement('div');
      this.menu.className = 'custom-select-menu movie-select-portal';
      this.menu.id = `${select.id}-listbox`;
      this.menu.setAttribute('role', 'listbox');
      this.menu.setAttribute('aria-label', this.trigger.getAttribute('aria-label'));
      if (select.multiple) this.menu.setAttribute('aria-multiselectable', 'true');
      this.trigger.setAttribute('aria-controls', this.menu.id);
      this.search = document.createElement('input');
      this.search.type = 'search';
      this.search.placeholder = 'Найти…';
      this.search.className = 'custom-select-search';
      this.search.setAttribute('aria-label', 'Поиск вариантов');
      this.items = document.createElement('div');
      this.menu.append(this.search, this.items);
      document.body.append(this.menu);
      this.wrapper.append(this.trigger);
      this.menu.inert = true;
      select.tabIndex = -1;
      select.setAttribute('aria-hidden', 'true');
      this.trigger.addEventListener('click', () => this.opened ? this.close() : this.open());
      this.trigger.addEventListener('keydown', e => {
        if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); this.open(); this.focusItem(e.key === 'ArrowUp' ? -1 : 0); }
      });
      this.menu.addEventListener('keydown', e => {
        e.stopPropagation();
        const buttons = [...this.items.querySelectorAll('button:not(:disabled)')];
        const index = buttons.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
        else if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
          e.preventDefault();
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length-1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        } else if (e.key === 'Tab') this.close();
      });
      this.search.addEventListener('input', () => { this.render(); this.position(); });
      select.addEventListener('change', () => this.update());
      select.addEventListener('select:sync', () => this.update());
      this.observer = new MutationObserver(() => this.update());
      this.observer.observe(select, {childList:true, subtree:true, attributes:true});
      instances.add(this);
      this.update();
    }
    update() {
      const selected = [...this.select.selectedOptions].filter(option => !option.disabled);
      this.label.textContent = this.select.multiple
        ? selected.length ? `${selected[0].textContent}${selected.length > 1 ? ` +${selected.length-1}` : ''}` : this.select.dataset.placeholder || 'Выберите'
        : selected[0]?.textContent || this.select.options[0]?.textContent || 'Выберите';
      this.trigger.disabled = this.select.disabled;
      if (this.opened) this.render();
    }
    render() {
      this.search.hidden = this.select.options.length <= 8;
      const query = this.search.value.trim().toLocaleLowerCase('ru');
      this.items.replaceChildren();
      [...this.select.options].filter(option => !option.disabled && (!query || option.textContent.toLocaleLowerCase('ru').includes(query))).forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'custom-select-option';
        button.textContent = option.textContent;
        button.dataset.value = option.value;
        button.setAttribute('role','option');
        button.setAttribute('aria-selected', String(option.selected));
        button.classList.toggle('is-selected', option.selected);
        button.addEventListener('click', () => {
          if (this.select.multiple) option.selected = !option.selected;
          else this.select.value = option.value;
          const value = option.value;
          this.select.dispatchEvent(new Event('change', {bubbles:true}));
          if (!this.select.multiple) this.close(true);
          else this.items.querySelector(`[data-value="${CSS.escape(value)}"]`)?.focus({preventScroll:true});
        });
        this.items.append(button);
      });
      if (!this.items.children.length) { const empty = document.createElement('p'); empty.className='select-empty'; empty.textContent='Ничего не найдено'; this.items.append(empty); }
    }
    focusItem(index) { const buttons=this.items.querySelectorAll('button'); buttons[index < 0 ? buttons.length-1 : index]?.focus(); }
    position() {
      if (!this.opened) return;
      const rect = this.trigger.getBoundingClientRect();
      const vv = window.visualViewport;
      const width = Math.min(Math.max(rect.width, 230), innerWidth-24);
      const bottom = vv ? vv.offsetTop + vv.height : innerHeight;
      const available = bottom-rect.bottom-16;
      const up = available < 170 && rect.top > available;
      const height = Math.min(320, up ? rect.top-16 : available);
      this.menu.style.width = `${width}px`;
      this.menu.style.left = `${Math.max(12,Math.min(rect.left,innerWidth-width-12))}px`;
      this.menu.style.maxHeight = `${Math.max(100,height)}px`;
      this.menu.style.top = up ? 'auto' : `${rect.bottom+6}px`;
      this.menu.style.bottom = up ? `${innerHeight-rect.top+6}px` : 'auto';
    }
    open() {
      instances.forEach(item => item.close());
      this.opened=true;
      this.wrapper.classList.add('is-open');
      this.trigger.setAttribute('aria-expanded','true');
      this.search.value=''; this.render(); this.position();
      this.menu.classList.add('is-open');
      this.menu.inert=false;
      if (!this.search.hidden) this.search.focus({preventScroll:true}); else this.focusItem(0);
    }
    close(focus=false) {
      this.opened=false;
      this.wrapper.classList.remove('is-open');
      this.menu.classList.remove('is-open');
      this.menu.inert=true;
      this.trigger.setAttribute('aria-expanded','false');
      if(focus) this.trigger.focus({preventScroll:true});
    }
  }
  document.addEventListener('pointerdown', e => instances.forEach(item => {
    if (!item.wrapper.contains(e.target) && !item.menu.contains(e.target)) item.close();
  }));
  document.addEventListener('scroll', e => instances.forEach(item => { if (item.opened && !item.menu.contains(e.target)) item.close(); }), true);
  window.addEventListener('resize', () => instances.forEach(item => item.position()));
  window.visualViewport?.addEventListener('resize', () => instances.forEach(item => item.position()));
  window.MovieSelect = { init() {
    document.querySelectorAll('.custom-select > select').forEach(select => { if (!select.movieSelect) select.movieSelect = new MovieSelect(select); });
  }, closeAll() { instances.forEach(item => item.close()); } };
})();
