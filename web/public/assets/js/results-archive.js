(function () {
    'use strict';

    var filtersEl   = document.getElementById('archiveFilters');
    if (!filtersEl) return;

    var lang        = filtersEl.dataset.lang || 'en';

    /* View elements */
    var viewTable    = document.getElementById('viewTable');
    var viewTimeline = document.getElementById('viewTimeline');
    var btnTable     = document.getElementById('btnTable');
    var btnTimeline  = document.getElementById('btnTimeline');
    var currentView  = 'table';

    function showView(v) {
        currentView = v;
        viewTable.hidden    = v !== 'table';
        viewTimeline.hidden = v !== 'timeline';
        btnTable.classList.toggle('archive-view-toggle__btn--active', v === 'table');
        btnTimeline.classList.toggle('archive-view-toggle__btn--active', v === 'timeline');
        btnTable.setAttribute('aria-pressed', String(v === 'table'));
        btnTimeline.setAttribute('aria-pressed', String(v === 'timeline'));
        applyFilters();
    }

    btnTable.addEventListener('click', function () { showView('table'); });
    btnTimeline.addEventListener('click', function () { showView('timeline'); });

    /* Filter controls */
    var selYear   = document.getElementById('filterYear');
    var selEvent  = document.getElementById('filterEvent');
    var selMedal  = document.getElementById('filterMedal');
    var inpSearch = document.getElementById('filterSearch');
    var countEl   = document.getElementById('resultsCount');
    var tableEmpty    = document.getElementById('tableEmpty');
    var timelineEmpty = document.getElementById('timelineEmpty');

    function rowMatches(el, year, event, medal, search) {
        if (year  && el.dataset.year  !== year)  return false;
        if (event && el.dataset.event !== event) return false;
        if (medal && el.dataset.medal !== medal) return false;
        if (search) {
            var athlete = (el.dataset.athlete || '').toLowerCase();
            var ev      = (el.dataset.event   || '').toLowerCase();
            if (athlete.indexOf(search) === -1 && ev.indexOf(search) === -1) return false;
        }
        return true;
    }

    function applyFilters() {
        var year   = selYear.value;
        var event  = selEvent.value;
        var medal  = selMedal.value;
        var search = inpSearch.value.trim().toLowerCase();
        var visible = 0;

        if (currentView === 'table') {
            var rows = viewTable.querySelectorAll('tbody tr');
            rows.forEach(function (tr) {
                var show = rowMatches(tr, year, event, medal, search);
                tr.hidden = !show;
                if (show) visible++;
            });
            tableEmpty.hidden = visible > 0;

        } else {
            /* show/hide individual result rows */
            viewTimeline.querySelectorAll('.archive-result-row').forEach(function (rr) {
                rr.hidden = !rowMatches(rr, year, event, medal, search);
            });

            /* hide event groups where all rows are hidden */
            viewTimeline.querySelectorAll('.archive-event-group').forEach(function (group) {
                var groupRows = group.querySelectorAll('.archive-result-row');
                var anyVisible = false;
                groupRows.forEach(function (rr) {
                    if (!rr.hidden) { anyVisible = true; visible++; }
                });
                group.hidden = !anyVisible;
            });

            /* hide year blocks where all groups are hidden */
            viewTimeline.querySelectorAll('.archive-year-block').forEach(function (block) {
                var groups = block.querySelectorAll('.archive-event-group');
                var anyVisible = false;
                groups.forEach(function (g) { if (!g.hidden) anyVisible = true; });
                block.hidden = !anyVisible;
            });

            timelineEmpty.hidden = visible > 0;
        }

        /* update count label */
        if (lang === 'ar') {
            countEl.textContent = 'عرض ' + visible + ' سجل';
        } else {
            countEl.textContent = 'Showing ' + visible + (visible === 1 ? ' record' : ' records');
        }
    }

    selYear.addEventListener('change', applyFilters);
    selEvent.addEventListener('change', applyFilters);
    selMedal.addEventListener('change', applyFilters);
    inpSearch.addEventListener('input', applyFilters);

    applyFilters();
}());
