// Desktop menus over the native selects.
//
// On a desktop (fine pointer, hover, wide screen) every <select> gets a button
// and a listbox styled like the rest of the page. The select stays in the DOM
// as the form field and the source of truth: the menu reads its options when
// it opens, writes its value and fires "change", so the rest of the code never
// knows the difference. On phones nothing is enhanced and the system picker
// opens as before. Keyboard follows the select-only combobox pattern: arrows
// move, Enter or Space choose, Escape closes, letters jump.

(function () {
    'use strict';

    const DESKTOP = '(hover: hover) and (pointer: fine) and (min-width: 561px)';
    const media = window.matchMedia(DESKTOP);
    const menus = [];
    let seq = 0;

    const CHEVRON = '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.5 4.5 6 2l2.5 2.5M3.5 7.5 6 10l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function labelFor(select) {
        if (select.getAttribute('aria-label')) return select.getAttribute('aria-label');
        const label = select.closest('label');
        return label ? label.textContent.trim() : '';
    }

    function enhance(select) {
        const wrap = document.createElement('span');
        wrap.className = 'menu';
        select.parentNode.insertBefore(wrap, select);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-button';
        button.setAttribute('role', 'combobox');
        button.setAttribute('aria-haspopup', 'listbox');
        button.setAttribute('aria-expanded', 'false');
        const label = labelFor(select);
        if (label) button.setAttribute('aria-label', label);
        const text = document.createElement('span');
        text.className = 'menu-text';
        button.appendChild(text);
        button.insertAdjacentHTML('beforeend', CHEVRON);

        const list = document.createElement('ul');
        list.className = 'menu-list';
        list.id = 'menu-' + (++seq);
        list.setAttribute('role', 'listbox');
        if (label) list.setAttribute('aria-label', label);
        list.hidden = true;
        button.setAttribute('aria-controls', list.id);

        wrap.appendChild(button);
        wrap.appendChild(select);
        wrap.appendChild(list);

        const menu = { select, wrap, button, text, list, items: [], active: -1, open: false };
        menus.push(menu);

        button.addEventListener('click', () => (menu.open ? close(menu) : open(menu)));
        button.addEventListener('keydown', e => onKey(menu, e));
        button.addEventListener('blur', () => close(menu));
        // Keep focus on the button while the pointer is in the list
        list.addEventListener('mousedown', e => e.preventDefault());
        list.addEventListener('mousemove', e => {
            const li = e.target.closest('li');
            if (li && li.parentNode === list) setActive(menu, menu.items.indexOf(li));
        });
        list.addEventListener('click', e => {
            const li = e.target.closest('li');
            if (li && li.parentNode === list) choose(menu, menu.items.indexOf(li));
        });
        select.addEventListener('change', () => refreshLabel(menu));

        apply(menu);
        refreshLabel(menu);
    }

    // Desktop: the button is the control and the select is hidden from everyone.
    // Otherwise the select is the control and the button does not exist for the user.
    function apply(menu) {
        const desktop = media.matches;
        menu.wrap.classList.toggle('enhanced', desktop);
        if (desktop) {
            menu.select.tabIndex = -1;
            menu.select.setAttribute('aria-hidden', 'true');
        } else {
            menu.select.removeAttribute('tabindex');
            menu.select.removeAttribute('aria-hidden');
            close(menu);
        }
    }

    function refreshLabel(menu) {
        const opt = menu.select.options[menu.select.selectedIndex];
        menu.text.textContent = opt ? opt.textContent : '';
        if (menu.open) build(menu);
    }

    function build(menu) {
        menu.list.innerHTML = '';
        menu.items = [];
        const options = [...menu.select.options];
        options.forEach((opt, i) => {
            const li = document.createElement('li');
            li.id = menu.list.id + '-' + i;
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', String(opt.selected));
            li.insertAdjacentHTML('beforeend', CHECK);
            li.appendChild(document.createTextNode(opt.textContent));
            menu.list.appendChild(li);
            menu.items.push(li);
        });
        setActive(menu, menu.select.selectedIndex);
    }

    function setActive(menu, i) {
        if (i < 0 || i >= menu.items.length) return;
        menu.items.forEach((li, j) => li.classList.toggle('active', j === i));
        menu.active = i;
        menu.button.setAttribute('aria-activedescendant', menu.items[i].id);
        menu.items[i].scrollIntoView({ block: 'nearest' });
    }

    function open(menu) {
        if (!media.matches || menu.open) return;
        menus.forEach(m => { if (m !== menu) close(m); });
        menu.open = true;
        build(menu);
        menu.list.hidden = false;
        menu.button.setAttribute('aria-expanded', 'true');
    }

    function close(menu) {
        if (!menu.open) return;
        menu.open = false;
        menu.list.hidden = true;
        menu.button.setAttribute('aria-expanded', 'false');
        menu.button.removeAttribute('aria-activedescendant');
    }

    function choose(menu, i) {
        const select = menu.select;
        if (i >= 0 && i < select.options.length && select.selectedIndex !== i) {
            select.selectedIndex = i;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        refreshLabel(menu);
        close(menu);
    }

    function onKey(menu, e) {
        const n = menu.select.options.length;
        if (!menu.open) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) || (e.altKey && e.key === 'ArrowDown')) {
                e.preventDefault();
                open(menu);
            } else if (e.key.length === 1 && /\S/.test(e.key)) {
                // Letters change the value directly, as a native select does
                const i = find(menu, e.key, menu.select.selectedIndex);
                if (i >= 0) choose(menu, i);
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setActive(menu, Math.min(menu.active + 1, n - 1)); break;
            case 'ArrowUp': e.preventDefault(); setActive(menu, Math.max(menu.active - 1, 0)); break;
            case 'Home': case 'PageUp': e.preventDefault(); setActive(menu, 0); break;
            case 'End': case 'PageDown': e.preventDefault(); setActive(menu, n - 1); break;
            case 'Enter': case ' ': e.preventDefault(); choose(menu, menu.active); break;
            case 'Escape': e.preventDefault(); close(menu); break;
            case 'Tab': choose(menu, menu.active); break;
            default:
                if (e.key.length === 1 && /\S/.test(e.key)) {
                    const i = find(menu, e.key, menu.active);
                    if (i >= 0) setActive(menu, i);
                }
        }
    }

    // The next option after `from` whose label starts with the key, wrapping round
    function find(menu, key, from) {
        const options = [...menu.select.options];
        const k = key.toLowerCase();
        for (let step = 1; step <= options.length; step++) {
            const i = (from + step) % options.length;
            if (options[i].textContent.trim().toLowerCase().startsWith(k)) return i;
        }
        return -1;
    }

    document.addEventListener('mousedown', e => {
        menus.forEach(menu => { if (menu.open && !menu.wrap.contains(e.target)) close(menu); });
    });

    media.addEventListener('change', () => menus.forEach(apply));

    document.querySelectorAll('select').forEach(enhance);

    // Pages that fill a select after load call this to update the button text
    window.Menus = { refresh: () => menus.forEach(refreshLabel) };
})();
