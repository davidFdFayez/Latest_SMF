/* ═══════════════════════════════════════════════════════════════════════════
   SMF PUBLIC WEBSITE — Main JavaScript
   Saudi Muaythai Federation
   Vanilla JS only. No frameworks, no dependencies.
════════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    /* ── 1. Hamburger / Mobile Menu ────────────────────────────────────────── */

    const hamburger     = document.querySelector('.hamburger');
    const mainMenu      = document.getElementById('main-menu');
    const mobileOverlay = document.getElementById('mobile-overlay');

    function openMenu() {
        if (!hamburger || !mainMenu) return;
        hamburger.classList.add('open');
        hamburger.setAttribute('aria-expanded', 'true');
        mainMenu.classList.add('open');
        if (mobileOverlay) mobileOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
        if (!hamburger || !mainMenu) return;
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
        mainMenu.classList.remove('open');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (hamburger) {
        hamburger.addEventListener('click', function () {
            this.classList.contains('open') ? closeMenu() : openMenu();
        });
    }

    if (mobileOverlay) {
        mobileOverlay.addEventListener('click', closeMenu);
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
    });

    /* ── 2. Mobile Dropdown Accordions ────────────────────────────────────── */

    const dropdownItems = document.querySelectorAll('.main-nav__item--dropdown');

    dropdownItems.forEach(function (item) {
        const trigger  = item.querySelector('.main-nav__link');
        const dropdown = item.querySelector('.main-nav__dropdown');
        if (!trigger || !dropdown) return;

        function isMobile() { return window.innerWidth <= 1024; }

        trigger.addEventListener('click', function (e) {
            if (!isMobile()) return;
            e.preventDefault();
            const isOpen = item.classList.contains('open');
            // Close all other open dropdowns
            dropdownItems.forEach(function (other) {
                if (other !== item) other.classList.remove('open');
            });
            item.classList.toggle('open', !isOpen);
        });
    });

    // Close dropdowns when clicking outside on desktop
    document.addEventListener('click', function (e) {
        if (window.innerWidth > 1024) {
            dropdownItems.forEach(function (item) {
                if (!item.contains(e.target)) item.classList.remove('open');
            });
        }
    });

    /* ── 3. Sticky Header Shadow on Scroll ────────────────────────────────── */

    const siteHeader = document.querySelector('.site-header');
    if (siteHeader) {
        window.addEventListener('scroll', function () {
            siteHeader.classList.toggle('scrolled', window.scrollY > 8);
        }, { passive: true });
    }

    /* ── 4. Calendar Filter Tabs ──────────────────────────────────────────── */

    const filterBtns = document.querySelectorAll('.calendar-filter');
    const eventCards = document.querySelectorAll('.event-card');

    if (filterBtns.length && eventCards.length) {
        filterBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                filterBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');

                var filter = btn.dataset.filter;

                eventCards.forEach(function (card) {
                    if (filter === 'all' || card.dataset.type === filter) {
                        card.style.display = '';
                        card.hidden = false;
                    } else {
                        card.style.display = 'none';
                        card.hidden = true;
                    }
                });
            });
        });
    }

    /* ── 5. Registration Tab Switcher ─────────────────────────────────────── */

    const regTabs    = document.querySelectorAll('[data-reg-tab]');
    const regPanels  = document.querySelectorAll('[data-reg-panel]');

    if (regTabs.length && regPanels.length) {
        function showRegPanel(name) {
            regTabs.forEach(function (t) {
                t.classList.toggle('active', t.dataset.regTab === name);
                t.setAttribute('aria-selected', t.dataset.regTab === name ? 'true' : 'false');
            });
            regPanels.forEach(function (p) {
                var show = p.dataset.regPanel === name;
                p.hidden = !show;
                p.classList.toggle('active', show);
            });
        }

        regTabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                showRegPanel(this.dataset.regTab);
            });
        });

        // Show first tab by default
        if (regTabs[0]) showRegPanel(regTabs[0].dataset.regTab);
    }

    /* ── 6. Form Validation ─────────────────────────────────────────────────── */

    function validateField(input) {
        var group = input.closest('.form-group');
        if (!group) return true;

        var value   = input.value.trim();
        var isValid = true;

        if (input.hasAttribute('required') && !value) {
            isValid = false;
        } else if (input.type === 'email' && value) {
            isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        } else if (input.dataset.minlen && value.length < parseInt(input.dataset.minlen, 10)) {
            isValid = false;
        }

        group.classList.toggle('has-error', !isValid);
        return isValid;
    }

    // Live validation on blur
    document.querySelectorAll('.smf-form input, .smf-form select, .smf-form textarea').forEach(function (field) {
        field.addEventListener('blur', function () { validateField(this); });
        field.addEventListener('input', function () {
            if (this.closest('.form-group').classList.contains('has-error')) {
                validateField(this);
            }
        });
    });

    // Full form validation on submit
    document.querySelectorAll('.smf-form').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            var allValid = true;

            form.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (field) {
                if (!validateField(field)) allValid = false;
            });

            if (!allValid) {
                e.preventDefault();
                // Scroll to first error
                var firstError = form.querySelector('.has-error');
                if (firstError) {
                    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    firstError.querySelector('input, select, textarea').focus();
                }
            }
        });
    });

    /* ── 7. Registration Form — Dynamic Type Fields ────────────────────────── */

    var regTypeSelect = document.getElementById('inquiry_type');
    if (regTypeSelect) {
        var fieldGroups = {
            athlete:  document.getElementById('fields-athlete'),
            club:     document.getElementById('fields-club'),
            coach:    document.getElementById('fields-coach'),
            official: document.getElementById('fields-official'),
        };

        function showRegFields(type) {
            Object.keys(fieldGroups).forEach(function (key) {
                var group = fieldGroups[key];
                if (!group) return;
                var show = (key === type);
                group.hidden = !show;
                group.querySelectorAll('[data-cond-required]').forEach(function (input) {
                    input.required = show;
                });
            });
        }

        regTypeSelect.addEventListener('change', function () {
            showRegFields(this.value);
        });

        // Show correct fields on load (if form was submitted with errors)
        if (regTypeSelect.value) showRegFields(regTypeSelect.value);
    }

    /* ── 8. Smooth Scroll for Anchor Links ────────────────────────────────── */

    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function (e) {
            var target = document.getElementById(this.getAttribute('href').slice(1));
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    /* ── 9. Flash Message Auto-Dismiss ────────────────────────────────────── */

    document.querySelectorAll('.form-alert.success').forEach(function (alert) {
        setTimeout(function () {
            alert.style.transition = 'opacity 0.4s ease';
            alert.style.opacity   = '0';
            setTimeout(function () { alert.style.display = 'none'; }, 400);
        }, 6000);
    });

    /* ── 10. Admin: Confirm Destructive Actions ────────────────────────────── */

    document.querySelectorAll('[data-confirm]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            if (!window.confirm(this.dataset.confirm)) {
                e.preventDefault();
            }
        });
    });

    /* ── 11. Language Direction Helper (body class) ────────────────────────── */
    var htmlEl = document.documentElement;
    if (htmlEl) {
        var lang = htmlEl.getAttribute('lang') || 'ar';
        document.body.classList.add('lang-' + lang);
    }

})();

/* ═══════════════════════════════════════════════════════════════════════════
   12. KPI ANIMATED COUNTERS (Homepage)
   Selectors: .kpi-counter, #kpi-section-v3
══════════════════════════════════════════════════════════════════════════ */
(function () {
    var counters   = document.querySelectorAll('.kpi-counter');
    var kpiSection = document.getElementById('kpi-section-v3');
    if (!counters.length) return;

    function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

    var hasRun = false;
    function runCounters() {
        if (hasRun) return;
        hasRun = true;
        var duration = 1600;
        counters.forEach(function (el) {
            var target = parseInt(el.getAttribute('data-count-to'), 10);
            var start  = null;
            function step(ts) {
                if (!start) start = ts;
                var pct = Math.min((ts - start) / duration, 1);
                el.textContent = String(Math.round(easeOutQuart(pct) * target));
                if (pct < 1) { requestAnimationFrame(step); }
                else         { el.textContent = String(target); }
            }
            requestAnimationFrame(step);
        });
    }

    /* Non-JS / no-observer fallback: show final values immediately */
    counters.forEach(function (el) {
        el.textContent = el.getAttribute('data-count-to');
    });

    if (!kpiSection) return;

    if ('IntersectionObserver' in window) {
        counters.forEach(function (el) { el.textContent = '0'; });
        var kpiObs = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { runCounters(); kpiObs.disconnect(); }
            });
        }, { threshold: 0.15 });
        kpiObs.observe(kpiSection);
        /* Safety: show finals after 3s if section never intersects */
        setTimeout(function () {
            if (!hasRun) {
                counters.forEach(function (el) {
                    el.textContent = el.getAttribute('data-count-to');
                });
            }
        }, 3000);
    } else {
        runCounters();
    }
}());

/* ═══════════════════════════════════════════════════════════════════════════
   13. HOMEPAGE CALENDAR CATEGORY FILTER
   Selectors: .hp-cal-filter, .hp-event-card, #hp-no-results
══════════════════════════════════════════════════════════════════════════ */
(function () {
    var filterBtns = document.querySelectorAll('.hp-cal-filter');
    var eventCards = document.querySelectorAll('.hp-event-card');
    var noResults  = document.getElementById('hp-no-results');
    if (!filterBtns.length) return;

    filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var key = this.getAttribute('data-hp-filter');
            filterBtns.forEach(function (b) {
                b.classList.toggle('active', b === btn);
                b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
            var visible = 0;
            eventCards.forEach(function (card) {
                var show = key === 'all' || card.getAttribute('data-hp-cat') === key;
                card.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
        });
    });
}());

/* ═══════════════════════════════════════════════════════════════════════════
   14. ACTIVITIES CALENDAR — View Toggle + Category Filter
   Selectors: #btn-timeline, #btn-grid, #view-timeline, #view-grid,
              .cal-filter-btn, #cal-no-results
══════════════════════════════════════════════════════════════════════════ */
(function () {
    var btnTimeline  = document.getElementById('btn-timeline');
    var btnGrid      = document.getElementById('btn-grid');
    var viewTimeline = document.getElementById('view-timeline');
    var viewGrid     = document.getElementById('view-grid');
    var filterBtns   = document.querySelectorAll('.cal-filter-btn');
    var noResults    = document.getElementById('cal-no-results');
    if (!btnTimeline || !btnGrid) return;

    var isAr        = document.documentElement.lang === 'ar';
    var eventWord   = isAr ? 'فعالية' : 'event(s)';
    var currentFilter = 'all';

    // Set initial hidden state via JS (avoids inline style in PHP)
    viewGrid.style.display = 'none';

    function applyFilter(f) {
        var cards  = viewTimeline.querySelectorAll('.cal-event-card');
        var months = viewTimeline.querySelectorAll('.cal-month');
        var visible = 0;
        cards.forEach(function (c) {
            var show = f === 'all' || c.dataset.category === f;
            c.style.display = show ? '' : 'none';
            if (show) visible++;
        });
        months.forEach(function (m) {
            var hasVisible = Array.from(m.querySelectorAll('.cal-event-card')).some(function (c) {
                return c.style.display !== 'none';
            });
            m.style.display = hasVisible ? '' : 'none';
        });
        months.forEach(function (m) {
            var cnt = Array.from(m.querySelectorAll('.cal-event-card')).filter(function (c) {
                return c.style.display !== 'none';
            }).length;
            var badge = m.querySelector('.cal-month__count');
            if (badge) badge.textContent = cnt + ' ' + eventWord;
        });
        if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
    }

    function applyGridFilter(f) {
        var cells = viewGrid.querySelectorAll('.cal-grid-event');
        cells.forEach(function (c) {
            c.style.display = f === 'all' || c.dataset.category === f ? '' : 'none';
        });
    }

    function showTimeline() {
        viewTimeline.style.display = 'block';
        viewGrid.style.display = 'none';
        btnTimeline.classList.add('cal-view-btn--active');
        btnGrid.classList.remove('cal-view-btn--active');
        btnTimeline.setAttribute('aria-pressed', 'true');
        btnGrid.setAttribute('aria-pressed', 'false');
        applyFilter(currentFilter);
    }

    function showGrid() {
        viewTimeline.style.display = 'none';
        viewGrid.style.display = 'block';
        btnTimeline.classList.remove('cal-view-btn--active');
        btnGrid.classList.add('cal-view-btn--active');
        btnTimeline.setAttribute('aria-pressed', 'false');
        btnGrid.setAttribute('aria-pressed', 'true');
        applyGridFilter(currentFilter);
    }

    btnTimeline.addEventListener('click', showTimeline);
    btnGrid.addEventListener('click', showGrid);

    filterBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            filterBtns.forEach(function (b) { b.classList.remove('cal-filter-btn--active'); });
            btn.classList.add('cal-filter-btn--active');
            currentFilter = btn.dataset.filter;
            var isGrid = viewGrid.style.display === 'block';
            if (isGrid) { applyGridFilter(currentFilter); } else { applyFilter(currentFilter); }
        });
    });
}());

/* ═══════════════════════════════════════════════════════════════════════════
   15. 2025 REPORT — Sticky Section Nav
   Selectors: .report-nav__btn[data-section]
   Note: buttons use data-section="id" instead of onclick (CSP compliance)
══════════════════════════════════════════════════════════════════════════ */
(function () {
    var navBtns = document.querySelectorAll('.report-nav__btn[data-section]');
    if (!navBtns.length) return;

    navBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var el = document.getElementById(this.getAttribute('data-section'));
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    var sections = ['timeline','medals','championships','community','camps','partnerships','media'];

    function updateActive() {
        var scrollY = window.scrollY + 140;
        var active  = sections[0];
        sections.forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.offsetTop <= scrollY) active = id;
        });
        navBtns.forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-section') === active);
        });
    }

    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
}());

/* ═══════════════════════════════════════════════════════════════════════════
   17. TALENT SELECTION PAGE — Level tabs + Assessment bar animation
   Selectors: .ts-level-tab, .ts-level-panel, .ts-assess-card, .ts-assess-bar-fill
══════════════════════════════════════════════════════════════════════════ */
(function () {
    /* ── Level tab switching ── */
    var tabContainer = document.querySelector('.ts-level-tabs');
    if (tabContainer) {
        tabContainer.addEventListener('click', function (e) {
            var btn = e.target.closest('.ts-level-tab');
            if (!btn) return;
            e.preventDefault();

            var level = btn.getAttribute('data-level');
            if (!level) return;

            /* Deactivate all tabs */
            tabContainer.querySelectorAll('.ts-level-tab').forEach(function (t) {
                t.classList.remove('is-active');
                t.setAttribute('aria-selected', 'false');
            });
            /* Deactivate all panels */
            document.querySelectorAll('.ts-level-panel').forEach(function (p) {
                p.classList.remove('is-active');
            });
            /* Activate clicked tab */
            btn.classList.add('is-active');
            btn.setAttribute('aria-selected', 'true');
            /* Activate matching panel */
            var panel = document.getElementById('ts-panel-' + level);
            if (panel) panel.classList.add('is-active');
        });
    }

    /* ── Assessment bar animation via IntersectionObserver ── */
    var fills = document.querySelectorAll('.ts-assess-bar-fill');
    fills.forEach(function (el) {
        el.style.setProperty('--ts-pct', (el.getAttribute('data-pct') || '0') + '%');
    });

    var assessCards = document.querySelectorAll('.ts-assess-card');
    if (!assessCards.length) return;

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-in-view');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });
        assessCards.forEach(function (card) { observer.observe(card); });
    } else {
        assessCards.forEach(function (card) { card.classList.add('is-in-view'); });
    }
}());
