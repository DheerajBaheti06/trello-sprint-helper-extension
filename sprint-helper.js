/*
** Sprint Helper — developed and maintained by Dheeraj.
** Built on Scrum for Trello: https://github.com/Q42/TrelloScrum
** Adds Scrum to your Trello
**
** Original:
** Jasper Kaizer <https://github.com/jkaizer>
** Marcel Duin <https://github.com/marcelduin>
**
** Contribs:
** Paul Lofte <https://github.com/paullofte>
** Nic Pottier <https://github.com/nicpottier>
** Bastiaan Terhorst <https://github.com/bastiaanterhorst>
** Morgan Craft <https://github.com/mgan59>
** Frank Geerlings <https://github.com/frankgeerlings>
** Cedric Gatay <https://github.com/CedricGatay>
** Kit Glennon <https://github.com/kitglen>
** Samuel Gaus <https://github.com/gausie>
** Sean Colombo <https://github.com/seancolombo>
** Kevin Strong <https://github.com/KevinStrong>
**
*/

// Thanks @unscriptable - http://unscriptable.com/2009/03/20/debouncing-javascript-methods/
var debounce = function (func, threshold, execAsap) {
    var timeout;
    return function debounced() {
        var obj = this, args = arguments;
        function delayed() {
            if (!execAsap)
                func.apply(obj, args);
            timeout = null;
        };

        if (timeout)
            clearTimeout(timeout);
        else if (execAsap)
            func.apply(obj, args);

        timeout = setTimeout(delayed, threshold || 100);
    };
}

// For MutationObserver
var obsConfig = { childList: true, characterData: true, attributes: false, subtree: true };

//default story point picker sequence (can be overridden in the Scrum for Trello 'Settings' popup)
var _pointSeq = ['?', 0, .5, 1, 2, 3, 5, 8, 13, 21];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];

// All settings and their defaults.
var S4T_SETTINGS = [];
var SETTING_NAME_LINK_STYLE = "burndownLinkStyle";
var SETTING_NAME_ESTIMATES = "estimatesSequence";
var S4T_ALL_SETTINGS = [SETTING_NAME_LINK_STYLE, SETTING_NAME_ESTIMATES];
var S4T_SETTING_DEFAULTS = {};
S4T_SETTING_DEFAULTS[SETTING_NAME_LINK_STYLE] = 'full';
S4T_SETTING_DEFAULTS[SETTING_NAME_ESTIMATES] = _pointSeq.join();

//internals
var reg = /((?:^|\s?))\((\x3f|\d*\.?\d+)(\))\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
    regC = /((?:^|\s?))[\[\{](\x3f|\d*\.?\d+)[\]\}]\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by [] or {}
    iconUrl, pointsDoneUrl,
    flameUrl, flame18Url,
    scrumLogoUrl, scrumLogo18Url;
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    iconUrl = chrome.runtime.getURL('images/storypoints-icon.png');
    pointsDoneUrl = chrome.runtime.getURL('images/points-done.png');
    flameUrl = chrome.runtime.getURL('images/burndown-icon_12x12.png');
    flame18Url = chrome.runtime.getURL('images/burndown-icon_18x18.png');
    scrumLogoUrl = chrome.runtime.getURL('images/sprint-helper-icon_12x12.png');
    scrumLogo18Url = chrome.runtime.getURL('images/sprint-helper-icon_18x18.png');
}

refreshSettings(); // get the settings right away (may take a little bit if using Chrome cloud storage)

function round(_val) { return (Math.round(_val * 100) / 100) };

// Comment out before release - makes cross-browser debugging easier.
//function log(msg){
//	if(typeof chrome !== 'undefined'){
//		console.log(msg);
//	} else {
//		$($('.header-btn-text').get(0)).text(msg);
//	}
//}

// Some browsers have serious errors with MutationObserver (eg: Safari doesn't have it called MutationObserver).
var CrossBrowser = {
    init: function () {
        this.MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver || null;
    }
};
CrossBrowser.init();



//what to do when DOM loads
$(function () {
    //watch filtering
    function updateFilters() {
        setTimeout(calcListPoints);
    };
    $('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').off('mouseup');
    $('.js-toggle-label-filter, .js-select-member, .js-due-filter, .js-clear-all').on('mouseup', calcListPoints);
    $('.js-input').off('keyup');
    $('.js-input').on('keyup', calcListPoints);
    $('.js-share').off('mouseup');
    $('.js-share').on('mouseup', function () {
        setTimeout(checkExport, 500)
    });

    calcListPoints();
});

// Recalculates every card and its totals (used for significant DOM modifications).
var recalcListAndTotal = debounce(function ($el) {
    ($el || $("[data-testid='list']")).each(function () {
        if (!this.list) new List(this);
        else if (this.list.refreshList) {
            this.list.refreshList(); // make sure each card's points are still accurate (also calls list.calc()).
        }
    })
}, 500, false);

var recalcTotalsObserver = new CrossBrowser.MutationObserver(function (mutations) {
    try {
        // Determine if the mutation event included an ACTUAL change to the list rather than
        // a modification caused by this extension making an update to points, etc. (prevents
        // infinite recursion).
        var doFullRefresh = false;
        var refreshJustTotals = false;
        $.each(mutations, function (index, mutation) {
            var $target = $(mutation.target);
            // Strictly ignore card modals/dialogs, preview popovers, and Sprint Helper UI
            if ($target.closest('[id^="s4t-"], [class*="s4t-"], .s4tLink, .point-picker, .picker, .s4t-comment-navigator, #s4t-attention-panel, #s4t-board-tools, #s4t-cards-overlay, #s4t-modal-overlay, #s4t-icon-tooltip, #s4t-attention-notice, [role="dialog"], .window, .card-detail-window, [data-testid="card-back"], .card-detail-data').length) return;

            // Strictly ignore card badges, points, titles, and list totals/headers updated by Sprint Helper
            if ($target.closest('[data-testid="card-front-badges"], [data-testid="badges"], .badges, .badge-points, [data-s4t-badge], .badge, [data-testid="card-name"], .list-card-title, .js-card-name, .list-total, [data-testid="list-header"], [data-testid="list-title"], .list-header, .list-title').length) return;

            // Inspect added and removed nodes: if all belong to Sprint Helper or badges, ignore
            var hasExternalNodes = false;
            if (mutation.addedNodes && mutation.addedNodes.length) {
                for (var a = 0; a < mutation.addedNodes.length; a++) {
                    var an = mutation.addedNodes[a];
                    if (an.nodeType === 1 && !$(an).is('.badge-points, .list-total, [class*="s4t-"], [id^="s4t-"], .point-picker, .picker, [data-s4t-badge], .badge')) {
                        hasExternalNodes = true;
                        break;
                    }
                }
            }
            if (mutation.removedNodes && mutation.removedNodes.length) {
                for (var r = 0; r < mutation.removedNodes.length; r++) {
                    var rn = mutation.removedNodes[r];
                    if (rn.nodeType === 1 && !$(rn).is('.badge-points, .list-total, [class*="s4t-"], [id^="s4t-"], .point-picker, .picker, [data-s4t-badge], .badge')) {
                        hasExternalNodes = true;
                        break;
                    }
                }
            }

            // Ignore known high-frequency Trello elements that don't affect card estimation
            if (!($target.hasClass('date') // the 'time-ago' functionality changes date spans every minute
                || $target.hasClass('js-phrase') // this is constantly updated by Trello, but doesn't affect estimates.
                || $target.hasClass('member')
                || $target.hasClass('clearfix')
                || $target.hasClass('header-btn-text')
                || (typeof mutation.target.className == "undefined")
            )) {
                if (hasExternalNodes) {
                    doFullRefresh = true;
                }
            }
        });

        if (doFullRefresh) {
            recalcListAndTotal();
            updateBurndownLink();
        } else if (refreshJustTotals) {
            calcListPoints();
        } else if (!updateBurndownLink.toolbar || !updateBurndownLink.toolbar[0].isConnected) {
            updateBurndownLink();
        }

        var $editControls = $(".card-detail-title .edit-controls"); // old selector
        if ($editControls.length == 0) {
            $editControls = $(".js-card-detail-title-input.is-editing, textarea[data-testid='card-back-title']").closest('.window-header, [data-testid="card-back-title-container"]'); // new selector
        }
        if ($editControls.length > 0) {
            showPointPicker($editControls.get(0));
        }
    } catch (err) {
        // Suppress mutation observer exceptions
    }
});
recalcTotalsObserver.observe(document.body, obsConfig);

// Universal selectors supporting classic and modern Trello (React / Atlassian updates)
var S4T_CARD_SEL = "[data-testid='list-card']:not(.placeholder)";
var S4T_CARD_CLOSEST_SEL = "[data-testid='list-card'], .list-card";
var S4T_LIST_SEL = "[data-testid='list'], .list, .js-list";
var S4T_LIST_CONTAINER_SEL = "[data-testid='list'], [data-testid='list-wrapper'], .list, .js-list";
var S4T_TITLE_SEL = "[data-testid='card-name'], a[data-testid='card-name'], .list-card-title, .js-card-name";

// Refreshes the link to the Burndown dialog.
function s4tBoardToolbarAnchor() {
    return Array.from(document.querySelectorAll('[data-testid="filter-popover-button"], [data-testid="board-filter-button"]')).find(function (node) {
        return !node.closest('#s4t-attention-panel, #s4t-cards-overlay, #s4t-modal-overlay') &&
            node.getClientRects().length && window.getComputedStyle(node).visibility !== 'hidden';
    });
}

function updateBurndownLink() {
    $('#burndownLink, #scrumSettingsLink').remove();
    var anchor = s4tBoardToolbarAnchor();
    var toolbar = updateBurndownLink.toolbar;
    if (!anchor) {
        if (toolbar && toolbar[0].isConnected) toolbar.detach();
        return;
    }
    if (!toolbar) {
        toolbar = $('<div id="s4t-board-tools" role="group" aria-label="Scrum board tools">');
        updateBurndownLink.toolbar = toolbar;
    }
    if (!toolbar.find('#membersBurndownLink').length) {
        var icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/></svg>';
        $('<button type="button" id="membersBurndownLink" class="s4tLink s4t-navbar-icon-btn" data-tooltip="Members Burndown" aria-label="Members Burndown">').append(icon)
            .on('click.s4t', function (event) { event.preventDefault(); showMembersBurndown(); }).appendTo(toolbar);
    }
    if (!toolbar.find('#s4t-eow-launch').length) {
        $('<button type="button" id="s4t-eow-launch" class="s4t-navbar-icon-btn" data-tooltip="EOW Update" aria-label="EOW Update">')
            .append('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 16l2 2 5-5"/></svg>')
            .on('click.s4t', function () { s4tOpenEow(); }).appendTo(toolbar);
    }
    // All actions mount together at one stable native toolbar anchor.
    if (anchor.previousElementSibling !== toolbar[0]) $(anchor).before(toolbar);
}

var cachedBoardData = null;
var lastBoardFetchTime = 0;
var cachedBoardShortLink = '';
var latestBoardFetchRequest = 0;

function getBoardShortLink() {
    var path = window.location.pathname || '';
    var m = path.match(/\/b\/([A-Za-z0-9]+)/);
    if (m) return m[1];

    var href = window.location.href || '';
    var m2 = href.match(/\/b\/([A-Za-z0-9]+)/);
    if (m2) return m2[1];

    var $boardLink = $('a[href*="/b/"]').first();
    if ($boardLink.length > 0) {
        var m3 = ($boardLink.attr('href') || '').match(/\/b\/([A-Za-z0-9]+)/);
        if (m3) return m3[1];
    }
    return '';
}

function fetchBoardData(shortLink, forceRefresh, callback) {
    if (!callback) callback = function () { };
    var now = Date.now();
    if (!forceRefresh && cachedBoardData && cachedBoardShortLink === shortLink && (now - lastBoardFetchTime < 30000)) {
        callback(null, cachedBoardData);
        return;
    }

    if (!shortLink) {
        callback(new Error("No board shortLink found"));
        return;
    }

    var requestId = ++latestBoardFetchRequest;
    function valid(data) {
        return data && (data.shortLink === shortLink || data.id === shortLink) &&
            Array.isArray(data.cards) && Array.isArray(data.members) && Array.isArray(data.lists);
    }
    function accept(data) {
        // A late response must not overwrite a more recently requested board/refresh.
        if (requestId === latestBoardFetchRequest) {
            cachedBoardData = data;
            cachedBoardShortLink = shortLink;
            lastBoardFetchTime = Date.now();
        }
        callback(null, data);
    }
    // Try Trello REST API first for maximum efficiency
    var apiUrl = '/1/boards/' + shortLink + '?fields=name,shortLink&cards=open&card_fields=name,idList,idMembers,dueComplete,closed&lists=open&list_fields=name,closed&members=all&member_fields=fullName,username,avatarUrl,initials';

    $.ajax({
        url: apiUrl,
        type: 'GET',
        dataType: 'json',
        timeout: 20000,
        xhrFields: { withCredentials: true }
    }).done(function (data) {
        if (valid(data)) {
            accept(data);
        } else {
            fallbackJson();
        }
    }).fail(function () {
        fallbackJson();
    });

    function fallbackJson() {
        $.ajax({
            url: '/b/' + shortLink + '.json',
            type: 'GET',
            dataType: 'json',
            timeout: 20000,
            xhrFields: { withCredentials: true }
        }).done(function (data) {
            if (valid(data)) {
                accept(data);
            } else {
                callback(new Error("Invalid board data"));
            }
        }).fail(function (err) {
            callback(err);
        });
    }
}

// Helper: Parse points from any text string
function parsePoints(str) {
    var pAssigned = null;
    var pCompleted = null;
    if (!str || typeof str !== 'string') return { assigned: null, completed: null };

    // 1. Slash format: (1/3) or [1/3] or {1/3} -> completed/assigned
    var slashM = str.match(/[(\[{\[]\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*\/\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*[)\]}]/);
    if (slashM) {
        pCompleted = parseFloat(slashM[1]);
        pAssigned = parseFloat(slashM[2]);
        return { assigned: pAssigned, completed: pCompleted };
    }

    // 2. Parenthesis -> assigned points: (3), ( 3 ), (3.5), (3 pts), (3sp)
    var pM = str.match(/\(\s*(?:est|estimate|points?|pts?|sp)?\s*[:=]?\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*(?:pts?|points?|sp)?\s*\)/i);
    if (pM) {
        var v = parseFloat(pM[1]);
        if (!isNaN(v) && v >= 0) pAssigned = v;
    }

    // 3. Braces or brackets -> completed points: [1], {1}, [1.5], {1 pt}, {1pts}
    var cM = str.match(/[\[\{]\s*(?:done|completed|spent|consumed)?\s*[:=]?\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*(?:pts?|points?|sp)?\s*[\]\}]/i);
    if (cM) {
        var cv = parseFloat(cM[1]);
        if (!isNaN(cv) && cv >= 0) pCompleted = cv;
    }

    return { assigned: pAssigned, completed: pCompleted };
}

// Helper: Check if card title represents the "Release" template card
function isReleaseCard(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return false;
    var clean = rawTitle.replace(/\(\s*[-+]?\d+(?:\.\d+)?\s*\)/g, '')
        .replace(/[\[\{]\s*[-+]?\d+(?:\.\d+)?\s*[\]\}]/g, '')
        .replace(/^[#\s\-_:|[\]]+|[#\s\-_:|[\]]+$/g, '')
        .trim().toLowerCase();
    if (clean === 'release') return true;
    if (/^release\s*[-–—:]*\s*(?:card|template)?$/i.test(clean)) return true;
    if (/^\[?\s*release\s*\]?$/i.test(clean)) return true;
    if (/^release\s*\([^)]*\)$/i.test(clean)) return true;
    if (/^(?:template|create\s+cards?|new\s+cards?)\s*[-–—:]*\s*release$/i.test(clean)) return true;
    if (clean.indexOf('release') !== -1 && (clean.indexOf('creating new card') !== -1 || clean.indexOf('template') !== -1)) return true;
    return false;
}

function computeBurndownFromBoardData(boardData) {
    var membersMap = {};
    var teamStats = {
        assigned: 0,
        completed: 0,
        remaining: 0,
        cardsTotal: 0,
        cardsCompleted: 0,
        cardsPending: 0
    };

    var doneLists = {}, notSureLists = {};
    (boardData.lists || []).forEach(function (l) {
        if (!l.closed && /\bnot[\s_-]*sure\b/i.test(l.name || '')) notSureLists[l.id] = true;
        if (!l.closed && /done|closed|complete|completed|shipped|released|live|production|prod\b|deployed|verified|finished|resolved/i.test(l.name)) {
            doneLists[l.id] = true;
        }
    });

    (boardData.members || []).forEach(function (m) {
        var fullName = m.fullName || m.username || 'Member';
        var initials = m.initials || (fullName.split(/\s+/).map(function (s) { return s[0]; }).join('').toUpperCase().slice(0, 2)) || '👤';
        var avatar = m.avatarUrl ? (m.avatarUrl + '/50.png') : (m.avatarHash ? ('https://trello-members.s3.amazonaws.com/' + m.id + '/' + m.avatarHash + '/50.png') : '');
        membersMap[m.id] = {
            key: m.id,
            name: fullName,
            username: m.username || '',
            avatar: avatar,
            initials: initials,
            assigned: 0,
            completed: 0,
            remaining: 0,
            cardsTotal: 0,
            cardsCompleted: 0,
            cardsPending: 0
        };
    });

    (boardData.cards || []).forEach(function (card) {
        if (card.closed || s4tIsCommonCard(card)) return; // Skip archived and shared housekeeping cards

        var rawTitle = card.name || '';
        if (isReleaseCard(rawTitle)) return; // Exclude Release template card

        var pts = parsePoints(rawTitle);

        var cardAssigned = (pts.assigned !== null && !isNaN(pts.assigned)) ? pts.assigned : 0;
        var cardCompleted = (pts.completed !== null && !isNaN(pts.completed)) ? pts.completed : 0;
        if (pts.assigned === null && pts.completed !== null && pts.completed > 0) {
            cardAssigned = cardCompleted;
        }

        var isDone = !!doneLists[card.idList] || !!card.dueComplete;
        var cardRemaining = 0;
        if (isDone) {
            if (cardCompleted === 0 && cardAssigned > 0) {
                cardCompleted = cardAssigned;
            }
            cardRemaining = 0;
        } else {
            cardRemaining = Math.max(0, cardAssigned - cardCompleted);
            cardRemaining = Math.round(cardRemaining * 100) / 100;
        }

        var isCardComplete = isDone || (cardRemaining === 0 && cardAssigned > 0);

        teamStats.cardsTotal++;
        if (isCardComplete) teamStats.cardsCompleted++;
        else teamStats.cardsPending++;

        teamStats.assigned += cardAssigned;
        teamStats.completed += cardCompleted;

        var assignedMembers = card.idMembers || [];
        assignedMembers.forEach(function (memId) {
            var m = membersMap[memId];
            if (m) {
                m.cardsTotal++;
                if (isCardComplete) m.cardsCompleted++;
                else m.cardsPending++;
                m.assigned += cardAssigned;
                if (notSureLists[card.idList]) {
                    m.notSureAssigned = (m.notSureAssigned || 0) + cardAssigned;
                    m.notSureCompleted = (m.notSureCompleted || 0) + cardCompleted;
                    m.notSureCardsTotal = (m.notSureCardsTotal || 0) + 1;
                    m.notSureCardsCompleted = (m.notSureCardsCompleted || 0) + (isCardComplete ? 1 : 0);
                }
                m.completed += cardCompleted;
            }
        });
    });

    teamStats.assigned = Math.round(teamStats.assigned * 100) / 100;
    teamStats.completed = Math.round(teamStats.completed * 100) / 100;
    teamStats.remaining = Math.round(Math.max(0, teamStats.assigned - teamStats.completed) * 100) / 100;
    teamStats.completionPercentage = teamStats.assigned > 0
        ? Math.min(100, Math.round((teamStats.completed / teamStats.assigned) * 100))
        : (teamStats.cardsTotal > 0 && teamStats.cardsPending === 0 ? 100 : (teamStats.cardsTotal > 0 ? Math.round((teamStats.cardsCompleted / teamStats.cardsTotal) * 100) : 0));

    // Filter to only members who have cards assigned
    var membersList = [];
    Object.keys(membersMap).forEach(function (k) {
        var m = membersMap[k];
        if (m.cardsTotal > 0 || m.assigned > 0 || m.completed > 0) {
            m.assigned = Math.round(m.assigned * 100) / 100;
            m.completed = Math.round(m.completed * 100) / 100;
            m.remaining = Math.round(Math.max(0, m.assigned - m.completed) * 100) / 100;
            m.completionPercentage = m.assigned > 0
                ? Math.min(100, Math.round((m.completed / m.assigned) * 100))
                : (m.cardsTotal > 0 && m.cardsPending === 0 ? 100 : (m.cardsTotal > 0 ? Math.round((m.cardsCompleted / m.cardsTotal) * 100) : 0));
            membersList.push(m);
        }
    });

    membersList.sort(function (a, b) {
        var nameA = (a.name || a.username || '').trim();
        var nameB = (b.name || b.username || '').trim();
        var cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
        if (cmp !== 0) return cmp;
        var userA = (a.username || '').trim();
        var userB = (b.username || '').trim();
        return userA.localeCompare(userB, undefined, { sensitivity: 'base', numeric: true });
    });

    var boardName = boardData.name || $('.board-name span.text, [data-testid="board-name-display"]').text().trim() || 'Active Board';

    return {
        team: teamStats,
        members: membersList,
        boardName: boardName
    };
}

function readAllCardsSynchronously() {
    calcListPoints();
}

function updateModalContent(data) {
    if (!data) return;
    if (data.boardName) {
        $('.s4t-board-badge').text(data.boardName);
    }
    if (data.team) {
        var summary = s4tSprintSummary(data.team);
        $('#s4t-sum-assigned').text(summary.total + ' total sprint hours');
        $('#s4t-sum-completed').text(summary.completed + ' hrs');
        $('#s4t-sum-remaining').text(summary.remaining + ' hrs');
        $('#s4t-sum-cards').text(summary.cards);
        $('#s4t-sum-card-rate').text(summary.cardRate + '% completion rate');
        $('#s4t-sum-pct-text').text(summary.progress + '%');
        $('#s4t-sum-pct-fill').css('width', summary.progress + '%');
        $('#s4t-sum-updated').text('Updated ' + summary.date);
    }
    $('#s4t-members-modal').data('members', data.members);
    $('#s4t-members-container').html(renderMembersHtml(data.members, $('#s4t-exclude-not-sure').prop('checked')));
}

// Keep existing content in place while an opaque, non-interactive skeleton covers it.
function s4tSetSkeleton(element, loading) {
    if (!element) return;
    if (loading && !element._s4tSkeleton) {
        element._s4tSkeleton = {inert: element.hasAttribute('inert'), scroll: element.scrollTop};
        element.setAttribute('inert', '');
        element.classList.add('s4t-loading-surface');
        element.setAttribute('aria-busy', 'true');
        element.scrollTop = 0;
        if (element.matches('.s4t-eow-content, #s4t-members-modal .s4t-modal-body')) {
            var skeleton=document.createElement('div');skeleton.className='s4t-panel-skeleton';skeleton.setAttribute('aria-hidden','true');
            var members=element.matches('#s4t-members-modal .s4t-modal-body');
            skeleton.innerHTML=members
                ? '<div class="s4t-skeleton-summary">'+Array(4).fill('<div class="s4t-skeleton-tile"><i></i><b></b><i></i></div>').join('')+'</div><div class="s4t-skeleton-rows"></div>'
                : '<div class="s4t-skeleton-toolbar"><i></i><i></i></div><div class="s4t-skeleton-columns"><div class="s4t-skeleton-rows"></div><div class="s4t-skeleton-rows"></div></div>';
            element.appendChild(skeleton);
        }
    } else if (!loading && element._s4tSkeleton) {
        var previous = element._s4tSkeleton;
        delete element._s4tSkeleton;
        var skeleton=element.querySelector(':scope > .s4t-panel-skeleton');if(skeleton)skeleton.remove();
        element.classList.remove('s4t-loading-surface');
        element.setAttribute('aria-busy', 'false');
        if (!previous.inert) element.removeAttribute('inert');
        element.scrollTop = previous.scroll;
    }
}

function s4tLoadMembers(force) {
    var modal = document.getElementById('s4t-members-modal');
    if (!modal || modal.getAttribute('aria-busy') === 'true') return;
    modal.setAttribute('aria-busy', 'true');
    var surfaces = modal.querySelectorAll('.s4t-modal-body');
    surfaces.forEach(function(element) { s4tSetSkeleton(element, true); });
    var refresh = $(modal).find('#s4t-refresh-action').addClass('s4t-refreshing').attr('aria-busy', 'true').prop('disabled', true);
    function finish(err, boardData) {
        if (!modal.isConnected || document.getElementById('s4t-members-modal') !== modal) return;
        try {
            if (getBoardShortLink() !== shortLink) { hideMembersBurndown(); return; }
            var result = !err && boardData ? computeBurndownFromBoardData(boardData) : null;
            if (!result || !result.team) { readAllCardsSynchronously(); result = collectMembersBurndownData(); }
            updateModalContent(result);
        } catch (_) {
            // Keep the last rendered totals if fresh data cannot be processed.
        } finally {
            surfaces.forEach(function(element) { s4tSetSkeleton(element, false); });
            modal.setAttribute('aria-busy', 'false');
            refresh.removeClass('s4t-refreshing').attr('aria-busy', 'false').prop('disabled', false);
        }
    }
    var shortLink = getBoardShortLink();
    if (shortLink) {
        try { fetchBoardData(shortLink, force, finish); }
        catch (_) { finish(new Error('Could not load board')); }
    } else finish(null, null);
}

function showMembersBurndown() {
    readAllCardsSynchronously();
    renderMembersBurndownModal(collectMembersBurndownData());
    s4tLoadMembers(false);
}

function hideMembersBurndown() {
    $('#s4t-modal-overlay').fadeOut(150, function () {
        $(this).remove();
    });
    $(document).off('keydown.s4tEsc');
}

function collectMembersBurndownData() {
    var membersMap = {};
    var teamStats = {
        assigned: 0,
        completed: 0,
        remaining: 0,
        cardsTotal: 0,
        cardsCompleted: 0,
        cardsPending: 0
    };

    // Helper: Strict filtering out of UI buttons/controls
    function isExcludedMemberName(raw) {
        if (!raw || typeof raw !== 'string') return true;
        var lower = raw.trim().toLowerCase();
        if (!lower) return true;
        if (lower.indexOf('edit card') !== -1 ||
            lower.indexOf('edit') !== -1 ||
            lower.indexOf('quick edit') !== -1 ||
            lower.indexOf('watching') !== -1 ||
            lower.indexOf('subscribed') !== -1 ||
            lower.indexOf('description') !== -1 ||
            lower.indexOf('attachment') !== -1 ||
            lower.indexOf('checklist') !== -1 ||
            lower.indexOf('due date') !== -1 ||
            lower.indexOf('due ') !== -1 ||
            lower.indexOf('badge') !== -1 ||
            lower.indexOf('cover') !== -1 ||
            lower.indexOf('label') !== -1 ||
            lower.indexOf('filter') !== -1 ||
            lower.indexOf('archive') !== -1 ||
            lower.indexOf('move') !== -1 ||
            lower.indexOf('copy') !== -1 ||
            lower.indexOf('comment') !== -1 ||
            lower.indexOf('activity') !== -1 ||
            lower.indexOf('custom field') !== -1 ||
            lower.indexOf('power-up') !== -1 ||
            lower.indexOf('action') !== -1 ||
            lower === 'member' ||
            lower === 'avatar' ||
            lower === 'members' ||
            lower === 'add member' ||
            lower === 'remove member' ||
            lower === 'unassigned') {
            return true;
        }
        return false;
    }

    // Find all lists on board
    var $lists = $(S4T_LIST_SEL);
    if ($lists.length === 0) $lists = $("[data-testid='list-wrapper']");
    var seenCardKeys = {};

    $lists.each(function () {
        var $list = $(this);
        var $titleClone = $list.find("[data-testid='list-name'], [data-testid='list-title'], textarea[data-testid='list-name-textarea'], .list-header-name-assist, .js-list-name-assist, .list-header-target-name, textarea.list-header-name, .list-header").first().clone();
        $titleClone.find('.list-total').remove();
        var listTitle = $titleClone.text().trim() || $list.find("[data-testid='list-name'], [data-testid='list-title']").text().trim() || '';
        var isDoneList = /done|closed|complete|completed|shipped|released|live|production|prod\b|deployed|verified|finished|resolved/i.test(listTitle);

        var $cards = $list.find(S4T_CARD_SEL);

        $cards.each(function () {
            var $card = $(this);
            var cardEl = this;
            if (s4tIsCommonCardElement(cardEl)) return;

            var cardKey = $card.find("a[href*='/c/']").attr('href') ||
                $card.attr('data-card-id') ||
                $card.attr('id') ||
                $card.find(S4T_TITLE_SEL).text().trim();
            if (cardKey) {
                if (seenCardKeys[cardKey]) return;
                seenCardKeys[cardKey] = true;
            }

            // Check if card is the "Release" template card
            var checkTitles = [
                $card.attr('data-s4t-orig-title'),
                cardEl._origTitle,
                $card.find(S4T_TITLE_SEL).attr('data-s4t-orig-title'),
                $card.find("a[href*='/c/']").attr('title'),
                $card.find("[data-testid='card-name']").attr('title'),
                $card.find("a[href*='/c/']").attr('aria-label'),
                $card.find(S4T_TITLE_SEL).text().trim(),
                $card.find("a[href*='/c/']").text().trim(),
                cardEl._title
            ];
            var isRel = false;
            for (var ci = 0; ci < checkTitles.length; ci++) {
                if (checkTitles[ci] && (isReleaseCard(checkTitles[ci]) || s4tIsCommonCard({ name: checkTitles[ci] }))) {
                    isRel = true;
                    break;
                }
            }
            if (isRel) return;

            var assigned = null;
            var completed = null;

            // 1. Check cardEl.listCard if already created and populated
            if (cardEl.listCard) {
                if (cardEl.listCard['points'] && cardEl.listCard['points'].points !== '' && cardEl.listCard['points'].points !== -1 && cardEl.listCard['points'].points !== undefined) {
                    var pVal = parseFloat(cardEl.listCard['points'].points);
                    if (!isNaN(pVal) && pVal >= 0) assigned = pVal;
                }
                if (cardEl.listCard['cpoints'] && cardEl.listCard['cpoints'].points !== '' && cardEl.listCard['cpoints'].points !== -1 && cardEl.listCard['cpoints'].points !== undefined) {
                    var cVal = parseFloat(cardEl.listCard['cpoints'].points);
                    if (!isNaN(cVal) && cVal >= 0) completed = cVal;
                }
            }

            // 2. Check Scrum for Trello DOM badges (.badge-points)
            if (assigned === null || completed === null) {
                $card.find(".badge-points").each(function () {
                    var $b = $(this);
                    var isConsumed = $b.hasClass('consumed') || $b.attr('data-s4t-badge') === 'cpoints';
                    var textVal = $b.text().trim();
                    var titleVal = $b.attr('title') || '';
                    var m = textVal.match(/(\d+(?:\.\d+)?)/) || titleVal.match(/(\d+(?:\.\d+)?)\s*(?:consumed\s*)?storypoint/i);
                    if (m) {
                        var val = parseFloat(m[1]);
                        if (!isNaN(val) && val >= 0) {
                            if (isConsumed && completed === null) completed = val;
                            else if (!isConsumed && assigned === null) assigned = val;
                        }
                    }
                });
            }

            // 3. Check candidate DOM titles and unstripped attributes
            if (assigned === null || completed === null) {
                var titleCandidates = [];
                var origAttr = $card.attr('data-s4t-orig-title') || $card.find(S4T_TITLE_SEL).attr('data-s4t-orig-title');
                if (origAttr) titleCandidates.push(origAttr);
                if (cardEl._origTitle) titleCandidates.push(cardEl._origTitle);
                var origDataTitle = $card.find(S4T_TITLE_SEL).data('orig-title');
                if (origDataTitle) titleCandidates.push(origDataTitle);

                var cardLinkTitle = $card.find("a[href*='/c/']").attr('title');
                if (cardLinkTitle) titleCandidates.push(cardLinkTitle);

                var cardLinkAria = $card.find("a[href*='/c/']").attr('aria-label');
                if (cardLinkAria) titleCandidates.push(cardLinkAria);

                var nameElTitle = $card.find("[data-testid='card-name']").attr('title');
                if (nameElTitle) titleCandidates.push(nameElTitle);

                var cardAria = $card.attr('aria-label');
                if (cardAria) titleCandidates.push(cardAria);

                if (cardEl._title) titleCandidates.push(cardEl._title);

                var domTitle = $card.find(S4T_TITLE_SEL).text().trim();
                if (domTitle) titleCandidates.push(domTitle);

                var linkText = $card.find("a[href*='/c/']").text().trim();
                if (linkText) titleCandidates.push(linkText);

                if (cardEl.textContent) titleCandidates.push(cardEl.textContent);

                for (var tIdx = 0; tIdx < titleCandidates.length; tIdx++) {
                    var cand = titleCandidates[tIdx];
                    var pts = parsePoints(cand);
                    if (assigned === null && pts.assigned !== null) assigned = pts.assigned;
                    if (completed === null && pts.completed !== null) completed = pts.completed;
                    if (assigned !== null && completed !== null) break;
                }
            }

            // 4. Power-up / Custom field badges fallback
            if (assigned === null && completed === null) {
                $card.find("[data-testid*='badge'], .badge").not('.badge-points').each(function () {
                    if (assigned !== null) return;
                    var combined = ($(this).text() + ' ' + ($(this).attr('aria-label') || '') + ' ' + ($(this).attr('title') || '')).trim();
                    var spMatch = combined.match(/(?:story\s*points?|points?|pts|estimate)\s*[:=]?\s*(\d+(?:\.\d+)?)/i) ||
                        combined.match(/^(\d+(?:\.\d+)?)\s*(?:pts|pt|sp|points?)$/i);
                    if (spMatch) {
                        var val = parseFloat(spMatch[1]);
                        if (!isNaN(val) && val >= 0) assigned = val;
                    }
                });
            }

            // Resolve final card points
            var cardAssigned = (assigned !== null && !isNaN(assigned)) ? assigned : 0;
            var cardCompleted = (completed !== null && !isNaN(completed)) ? completed : 0;
            if (assigned === null && completed !== null && completed > 0) {
                cardAssigned = cardCompleted;
            }

            // Check if card is in a Done list or marked complete
            var isCardDueComplete = $card.find("[data-testid='due-date-badge-with-state-complete'], .is-due-complete").length > 0;
            var isDone = isDoneList || isCardDueComplete;

            var cardRemaining = 0;
            if (isDone) {
                if (cardCompleted === 0 && cardAssigned > 0) {
                    cardCompleted = cardAssigned;
                }
                cardRemaining = 0;
            } else {
                cardRemaining = Math.max(0, cardAssigned - cardCompleted);
                cardRemaining = Math.round(cardRemaining * 100) / 100;
            }

            var isCardComplete = isDone || (cardRemaining === 0 && cardAssigned > 0);

            teamStats.cardsTotal++;
            if (isCardComplete) teamStats.cardsCompleted++;
            else teamStats.cardsPending++;

            teamStats.assigned += cardAssigned;
            teamStats.completed += cardCompleted;

            // Extract members strictly scoped to avatar elements
            var cardMembers = [];
            var memberSeenKeys = {};

            var $memberEls = $card.find("[data-testid='card-front-members'] [data-testid*='avatar'], [data-testid='card-front-members'] [data-testid*='member'], [data-testid='card-front-avatar'], [data-testid*='member-avatar'], .list-card-members .member, .js-card-members .js-member");
            if ($memberEls.length === 0) {
                $memberEls = $card.find("img[src*='trello-members'], img[src*='avatar.trello'], img[src*='atlassian'], [data-testid='card-front-member']");
            }

            $memberEls.each(function () {
                var $m = $(this);
                var rawText = $m.attr('aria-label') || $m.attr('title') || $m.attr('alt') || $m.find('img').attr('alt') || $m.find('img').attr('title') || '';
                rawText = rawText.trim();

                if (!rawText) {
                    var innerInitials = $m.text().trim();
                    if (innerInitials && innerInitials.length <= 3 && /^[A-Z]+$/.test(innerInitials)) {
                        rawText = innerInitials;
                    } else {
                        return;
                    }
                }

                // Strictly block UI controls
                if (isExcludedMemberName(rawText)) return;

                var name = '';
                var username = '';
                var parenMatch = rawText.match(/^(.*?)\s*\(([^)]+)\)$/);
                if (parenMatch) {
                    name = parenMatch[1].replace(/^member:\s*/i, '').trim();
                    username = parenMatch[2].trim();
                } else {
                    name = rawText.replace(/^member:\s*/i, '').trim();
                }

                if (!name || name.length > 50 || isExcludedMemberName(name)) return;

                var dedupKey = (username || name).toLowerCase();
                if (memberSeenKeys[dedupKey]) return;
                memberSeenKeys[dedupKey] = true;

                var avatarUrl = $m.find('img').attr('src') || ($m.is('img') ? $m.attr('src') : '') || '';
                var initials = name.split(/\s+/).map(function (s) { return s[0]; }).join('').toUpperCase().slice(0, 2);
                if (!initials) initials = (username || name).slice(0, 2).toUpperCase();

                cardMembers.push(dedupKey);

                if (!membersMap[dedupKey]) {
                    membersMap[dedupKey] = {
                        key: dedupKey,
                        name: name,
                        username: username,
                        avatar: avatarUrl,
                        initials: initials || '👤',
                        assigned: 0,
                        completed: 0,
                        remaining: 0,
                        cardsTotal: 0,
                        cardsCompleted: 0,
                        cardsPending: 0
                    };
                }
                if (avatarUrl && !membersMap[dedupKey].avatar) {
                    membersMap[dedupKey].avatar = avatarUrl;
                }
            });

            // Distribute points to assigned member(s)
            if (cardMembers.length > 0) {
                cardMembers.forEach(function (mKey) {
                    var m = membersMap[mKey];
                    if (m) {
                        m.cardsTotal++;
                        if (isCardComplete) m.cardsCompleted++;
                        else m.cardsPending++;
                        m.assigned += cardAssigned;
                        if (/\bnot[\s_-]*sure\b/i.test(listTitle)) {
                            m.notSureAssigned = (m.notSureAssigned || 0) + cardAssigned;
                            m.notSureCompleted = (m.notSureCompleted || 0) + cardCompleted;
                            m.notSureCardsTotal = (m.notSureCardsTotal || 0) + 1;
                            m.notSureCardsCompleted = (m.notSureCardsCompleted || 0) + (isCardComplete ? 1 : 0);
                        }
                        m.completed += cardCompleted;
                    }
                });
            }
        });
    });

    teamStats.assigned = Math.round(teamStats.assigned * 100) / 100;
    teamStats.completed = Math.round(teamStats.completed * 100) / 100;
    teamStats.remaining = Math.round(Math.max(0, teamStats.assigned - teamStats.completed) * 100) / 100;
    teamStats.completionPercentage = teamStats.assigned > 0
        ? Math.min(100, Math.round((teamStats.completed / teamStats.assigned) * 100))
        : (teamStats.cardsTotal > 0 && teamStats.cardsPending === 0 ? 100 : (teamStats.cardsTotal > 0 ? Math.round((teamStats.cardsCompleted / teamStats.cardsTotal) * 100) : 0));

    // Only include real members who have cards assigned
    var membersList = [];
    Object.keys(membersMap).forEach(function (k) {
        var m = membersMap[k];
        if (m.cardsTotal > 0 || m.assigned > 0 || m.completed > 0) {
            m.assigned = Math.round(m.assigned * 100) / 100;
            m.completed = Math.round(m.completed * 100) / 100;
            m.remaining = Math.round(Math.max(0, m.assigned - m.completed) * 100) / 100;
            m.completionPercentage = m.assigned > 0
                ? Math.min(100, Math.round((m.completed / m.assigned) * 100))
                : (m.cardsTotal > 0 && m.cardsPending === 0 ? 100 : (m.cardsTotal > 0 ? Math.round((m.cardsCompleted / m.cardsTotal) * 100) : 0));
            membersList.push(m);
        }
    });

    membersList.sort(function (a, b) {
        var nameA = (a.name || a.username || '').trim();
        var nameB = (b.name || b.username || '').trim();
        var cmp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base', numeric: true });
        if (cmp !== 0) return cmp;
        var userA = (a.username || '').trim();
        var userB = (b.username || '').trim();
        return userA.localeCompare(userB, undefined, { sensitivity: 'base', numeric: true });
    });

    var boardName = $('.board-name span.text, [data-testid="board-name-display"]').text().trim() || 'Active Board';

    return {
        team: teamStats,
        members: membersList,
        boardName: boardName
    };
}

function renderMembersHtml(members, excludeNotSure) {
    if (!members || members.length === 0) {
        return '<div class="s4t-empty-state">No members with cards found on this board. Make sure cards have members assigned and points in parenthesis (assigned) and braces {completed}.</div>';
    }
    var html = '';
    members.forEach(function (m) {
        var assigned = m.assigned, completed = m.completed, remaining = m.remaining, progress = m.completionPercentage;
        var cardsTotal = m.cardsTotal, cardsCompleted = m.cardsCompleted, cardsPending = m.cardsPending;
        if (excludeNotSure && (m.notSureAssigned || m.notSureCompleted || m.notSureCardsTotal)) {
            cardsTotal = Math.max(0, cardsTotal - (m.notSureCardsTotal || 0));
            cardsCompleted = Math.max(0, cardsCompleted - (m.notSureCardsCompleted || 0));
            cardsPending = Math.max(0, cardsTotal - cardsCompleted);
            assigned = Math.round(Math.max(0, assigned - (m.notSureAssigned || 0)) * 100) / 100;
            completed = Math.round(Math.max(0, completed - (m.notSureCompleted || 0)) * 100) / 100;
            remaining = Math.round(Math.max(0, assigned - completed) * 100) / 100;
            progress = assigned > 0 ? Math.min(100, Math.round(completed / assigned * 100)) : (cardsTotal > 0 ? Math.round(cardsCompleted / cardsTotal * 100) : 0);
        }
        var avatarMarkup = m.avatar
            ? '<img class="s4t-avatar" src="' + m.avatar + '" alt="' + m.name + '"/>'
            : '<div class="s4t-avatar">' + (m.initials || '👤') + '</div>';

        html += [
            '<div class="s4t-member-card">',
            '<div class="s4t-member-info">',
            avatarMarkup,
            '<div class="s4t-member-meta">',
            '<div class="s4t-member-name" title="' + m.name + (m.username && m.username !== m.name ? ' (@' + m.username + ')' : '') + '">' + m.name + (m.username && m.username !== m.name ? ' <span class="s4t-member-username">(@' + m.username + ')</span>' : '') + '</div>',
            '<div class="s4t-member-cards-count">' + cardsTotal + ' cards (' + cardsCompleted + ' done, ' + cardsPending + ' pending)</div>',
            '</div>',
            '</div>',
            '<div class="s4t-member-bar-area">',
            '<div class="s4t-member-bar-label">',
            '<span>Progress</span>',
            '<span style="font-weight:700;">' + progress + '%</span>',
            '</div>',
            '<div class="s4t-progress-track">',
            '<div class="s4t-progress-fill" style="width:' + progress + '%;"></div>',
            '</div>',
            '</div>',
            '<div class="s4t-member-pills">',
            '<span class="s4t-pill s4t-pill-assigned" title="Assigned Points (from parentheses)">' + assigned + ' assigned</span>',
            '<span class="s4t-pill s4t-pill-done" title="Completed Points (from braces/brackets)">✓ ' + completed + ' done</span>',
            '<span class="s4t-pill s4t-pill-pending" title="Remaining Points (assigned - completed)">' + remaining + ' remaining</span>',
            '</div>',
            '</div>'
        ].join('');
    });
    return html;
}

function s4tSprintSummary(team) {
    var number = function (value) { return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0; };
    var format = function (value, digits) { return String(Number(value.toFixed(digits))); };
    var total = number(team.assigned), completed = number(team.completed);
    var cardsTotal = number(team.cardsTotal), cardsDone = number(team.cardsCompleted);
    var progress = total ? Math.min(100, completed / total * 100) : (cardsTotal ? cardsDone / cardsTotal * 100 : 0);
    return {
        total: format(total, 2), completed: format(completed, 2), remaining: format(number(team.remaining), 2),
        cards: cardsDone + ' / ' + cardsTotal,
        cardRate: format(cardsTotal ? cardsDone / cardsTotal * 100 : 0, 2),
        progress: format(progress, 1),
        date: new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})
    };
}

function s4tRefreshIcon() {
    return '<svg class="s4t-refresh-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/></svg>';
}

function s4tFeatureHelp(name, purpose, features, benefit, usage) {
    return $('<button type="button" class="s4t-feature-help">')
        .attr({'aria-label': 'About ' + name, 'aria-expanded': 'false', 'data-tooltip': name,
            'data-feature-purpose': purpose, 'data-feature-options': features,
            'data-feature-benefit': benefit, 'data-feature-usage': usage})
        .html('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r=".8" fill="currentColor" stroke="none"/></svg>');
}

function renderMembersBurndownModal(data) {
    // Add your deployed website URL here to enable View Full Dashboard.
    var fullDashboardUrl = '';
    $('#s4t-modal-overlay').remove();

    var membersHtml = renderMembersHtml(data.members, true);
    var summary = s4tSprintSummary(data.team);

    var modalHtml = [
        '<div id="s4t-modal-overlay">',
        '<div id="s4t-members-modal" role="dialog" aria-modal="true" aria-label="Members Burndown">',
        '<div class="s4t-modal-header">',
        '<div class="s4t-modal-title-area">',
        '<h2 class="s4t-modal-title">Members Burndown</h2>',
        '<span class="s4t-board-badge">' + data.boardName + '</span>',
        '</div>',
        '<div class="s4t-header-actions">',
        '<a id="s4t-dashboard-link" target="_blank" rel="noopener noreferrer" aria-disabled="true">View Full Dashboard</a>',
        '<button class="s4t-refresh-btn" id="s4t-refresh-action" aria-label="Refresh burndown" data-tooltip="Refresh burndown">' + s4tRefreshIcon() + '</button>',
        '<button class="s4t-close-btn" id="s4t-close-action" aria-label="Close" data-tooltip="Close">✕</button>',
        '</div>',
        '</div>',
        '<div class="s4t-modal-body">',
        '<div class="s4t-summary-card" id="s4t-team-summary">',
        '<div class="s4t-summary-heading">Overall sprint summary</div>',
        '<div class="s4t-stats-grid">',
        '<div class="s4t-stat-box">',
        '<div class="s4t-stat-label">Hours completed <span aria-hidden="true">✓</span></div>',
        '<div class="s4t-stat-value s4t-stat-val-green" id="s4t-sum-completed">' + summary.completed + ' hrs</div>',
        '<div class="s4t-progress-container"><div class="s4t-progress-track"><div class="s4t-progress-fill" id="s4t-sum-pct-fill" style="width:' + summary.progress + '%;"></div></div></div>',
        '</div>',
        '<div class="s4t-stat-box">',
        '<div class="s4t-stat-label">Hours remaining <span aria-hidden="true">◷</span></div>',
        '<div class="s4t-stat-value s4t-stat-val-amber" id="s4t-sum-remaining">' + summary.remaining + ' hrs</div>',
        '<div class="s4t-summary-detail" id="s4t-sum-assigned">' + summary.total + ' total sprint hours</div>',
        '</div>',
        '<div class="s4t-stat-box">',
        '<div class="s4t-stat-label">Cards progress <span aria-hidden="true">☑</span></div>',
        '<div class="s4t-stat-value" id="s4t-sum-cards">' + summary.cards + '</div>',
        '<div class="s4t-summary-detail" id="s4t-sum-card-rate">' + summary.cardRate + '% completion rate</div>',
        '</div>',
        '<div class="s4t-stat-box">',
        '<div class="s4t-stat-label">Overall progress <span aria-hidden="true">↗</span></div>',
        '<div class="s4t-stat-value s4t-stat-val-green" id="s4t-sum-pct-text">' + summary.progress + '%</div>',
        '<div class="s4t-summary-detail" id="s4t-sum-updated">Updated ' + summary.date + '</div>',
        '</div>',
        '</div>',
        '</div>',
        '<div class="s4t-members-options"><label data-tooltip="Exclude Not Sure list cards from member points, progress and card counts. Team summaries stay unchanged."><input type="checkbox" id="s4t-exclude-not-sure" checked> Exclude Not Sure list</label></div>',
        '<div class="s4t-members-list" id="s4t-members-container">',
        membersHtml,
        '</div>',
        '</div>',
        '</div>',
        '</div>'
    ].join('');

    $('body').append(modalHtml);
    $('#s4t-members-modal').data('members', data.members);
    $('#s4t-exclude-not-sure').on('change', function () {
        $('#s4t-members-container').html(renderMembersHtml($('#s4t-members-modal').data('members'), this.checked));
    });

    $('.s4t-modal-title').wrap('<div class="s4t-feature-title">').after(s4tFeatureHelp('Members Burndown', 'Spot uneven workloads and unfinished sprint work.', 'Team summaries and member assigned, done, remaining points, progress and card counts.', 'Not Sure lists are excluded from member rows by default; the four team summaries always include them.', 'Uncheck Exclude Not Sure list to include those cards in member rows. Refresh for the latest board data.'));

    // Use Trello's live design tokens, just like Attention and Cards List.
    // Event handlers
    if (fullDashboardUrl) $('#s4t-dashboard-link').attr('href', fullDashboardUrl).removeAttr('aria-disabled');
    $('#s4t-close-action').click(hideMembersBurndown);
    $('#s4t-refresh-action').click(function () { s4tLoadMembers(true); });

    $('#s4t-modal-overlay').click(function (e) {
        if (e.target.id === 's4t-modal-overlay') {
            hideMembersBurndown();
        }
    });

    $(document).off('keydown.s4tEsc').on('keydown.s4tEsc', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            hideMembersBurndown();
        }
    });
}

var ignoreClicks = function () { return false; };
function showBurndown() {
    showMembersBurndown();
}

var settingsFrameId = 'settingsFrame';
function showSettings() {
    $('body').addClass("window-up");
    $('.window').css("display", "block").css("top", "50px");

    // Build the dialog DOM elements. There are no unescaped user-provided strings being used here.
    var clearfix = $('<div/>', { class: 'clearfix' });
    var windowHeaderUtils = $('<div/>', { class: 'window-header-utils dialog-close-button' }).append($('<a/>', { class: 'icon-lg icon-close dark-hover js-close-window', href: '#', title: 'Close this dialog window.' }));
    var settingsIcon = $('<img/>', { style: 'position:absolute; margin-left: 20px; margin-top:15px;', src: scrumLogo18Url });

    // Create the Settings form.
    {
        // Load the current settings (with defaults in case Settings haven't been set).
        var setting_link = S4T_SETTINGS[SETTING_NAME_LINK_STYLE];
        var setting_estimateSeq = S4T_SETTINGS[SETTING_NAME_ESTIMATES];

        var settingsDiv = $('<div/>', { style: "padding:0px 10px;font-family:'Helvetica Neue', Arial, Helvetica, sans-serif;" });
        var iframeHeader = $('<h3/>', { style: 'text-align: center;' });
        iframeHeader.text('Sprint Helper');
        var settingsHeader = $('<h3/>', { style: 'text-align: center;margin-bottom:0px' });
        settingsHeader.text('Settings');
        var settingsInstructions = $('<div/>', { style: 'margin-bottom:10px' }).html('These settings affect how Sprint Helper appears to <em>you</em> on all boards.  When you&apos;re done, remember to click "Save Settings" below.');
        var settingsForm = $('<form/>', { id: 'scrumForTrelloForm' });

        // How the 'Burndown Chart' link should appear (if at all).
        var fieldset_burndownLink = $('<fieldset/>');
        var legend_burndownLink = $('<legend/>');
        legend_burndownLink.text("Burndown Chart link");
        var burndownLinkSetting_radioName = 'burndownLinkSetting';
        fieldset_burndownLink.append(legend_burndownLink);
        var burndownRadio_full = $('<input/>', { type: 'radio', name: burndownLinkSetting_radioName, id: 'link_full', value: 'full' });
        if (setting_link == 'full') {
            burndownRadio_full.prop('checked', true);
        }
        var label_full = $('<label/>', { for: 'link_full' });
        label_full.text('Enable "Burndown Chart" link (recommended)');
        fieldset_burndownLink.append(burndownRadio_full).append(label_full).append("<br/>");

        var burndownRadio_icon = $('<input/>', { type: 'radio', name: burndownLinkSetting_radioName, id: 'link_icon', value: 'icon' });
        if (setting_link == 'icon') {
            burndownRadio_icon.prop('checked', true);
        }
        var label_icon = $('<label/>', { for: 'link_icon' });
        label_icon.text('Icon only');
        fieldset_burndownLink.append(burndownRadio_icon).append(label_icon).append("<br/>");

        var burndownRadio_none = $('<input/>', { type: 'radio', name: burndownLinkSetting_radioName, id: 'link_none', value: 'none' });
        if (setting_link == 'none') {
            burndownRadio_none.prop('checked', true);
        }
        var label_none = $('<label/>', { for: 'link_none' });
        label_none.text('Disable completely');
        fieldset_burndownLink.append(burndownRadio_none).append(label_none).append("<br/>");

        // Which estimate buttons should show up.
        var fieldset_estimateButtons = $('<fieldset/>', { style: 'margin-top:5px' });
        var legend_estimateButtons = $('<legend/>');
        legend_estimateButtons.text("Estimate Buttons");
        fieldset_estimateButtons.append(legend_estimateButtons);
        var explanation = $('<div/>').text("List out the values you want to appear on the estimate buttons, separated by commas. They can be whole numbers, decimals, or a question mark.");
        fieldset_estimateButtons.append(explanation);

        var estimateFieldId = 'pointSequenceToUse';
        var estimateField = $('<input/>', { id: estimateFieldId, size: 40, val: setting_estimateSeq });
        fieldset_estimateButtons.append(estimateField);

        var titleTextStr = "Original sequence is: " + _pointSeq.join();
        var restoreDefaultsButton = $('<button/>')
            .text('restore to original values')
            .attr('title', titleTextStr)
            .click(function (e) {
                e.preventDefault();
                try {
                    var f = document.getElementById(settingsFrameId);
                    if (f && f.contentDocument) {
                        var el = f.contentDocument.getElementById(estimateFieldId);
                        if (el) el.value = _pointSeq.join();
                    }
                } catch (err) { }
            });
        fieldset_estimateButtons.append(restoreDefaultsButton);

        var saveButton = $('<button/>', { style: 'margin-top:5px' }).text('Save Settings').click(function (e) {
            e.preventDefault();

            // Save the settings (persists them using Chrome cloud, LocalStorage, or Cookies - in that order of preference if available).
            try {
                var f = document.getElementById(settingsFrameId);
                if (f && f.contentDocument) {
                    var radio = f.contentDocument.querySelector('input[name="' + burndownLinkSetting_radioName + '"]:checked');
                    if (radio) S4T_SETTINGS[SETTING_NAME_LINK_STYLE] = radio.value;
                    var est = f.contentDocument.getElementById(estimateFieldId);
                    if (est) S4T_SETTINGS[SETTING_NAME_ESTIMATES] = est.value;
                }
            } catch (err) { }

            // Persist all settings.
            $.each(S4T_ALL_SETTINGS, function (i, settingName) {
                saveSetting(settingName, S4T_SETTINGS[settingName]);
            });

            // Allow the UI to update itself as needed.
            onSettingsUpdated();
        });
        var savedIndicator = $('<span/>', { id: 's4tSaved', style: 'color:#080;background-color:#afa;font-weight:bold;display:none;margin-left:10px' })
            .text("Saved!");

        // Set up the form (all added down here to be easier to change the order).
        settingsForm.append(fieldset_burndownLink);
        settingsForm.append(fieldset_estimateButtons);
        settingsForm.append(saveButton);
        settingsForm.append(savedIndicator);
    }

    // Quick start instructions.
    var quickStartDiv = $('<div>\
		<h4 style="margin-top:0px;margin-bottom:0px">Getting started</h4>\
		<ol style="margin-top:0px">\
			<li>To add an estimate to a card, first <strong>click a card</strong> to open it</li>\
			<li><strong>Click the title of the card</strong> to "edit" the title.</li>\
			<li>Once the Card title is in edit-mode, blue number buttons will appear. <strong>Click one of the buttons</strong> to set that as the estimate.</li>\
		</ol>\
	</div>');

    var moreInfoLink = $('<small>For more information, see <a href="http://scrumfortrello.com">ScrumForTrello.com</a></small>');

    // Add each of the components to build the iframe (all done here to make it easier to re-order them).
    settingsDiv.append(iframeHeader);
    settingsDiv.append(quickStartDiv);
    settingsDiv.append(settingsHeader);
    settingsDiv.append(settingsInstructions);
    settingsDiv.append(settingsForm);
    settingsDiv.append(moreInfoLink);

    // Trello swallows normal input, so things like checkboxes and radio buttons don't work right... so we stuff everything in an iframe.
    var iframeObj = $('<iframe/>', {
        frameborder: '0',
        style: 'width: 670px; height: 528px;', /* 512 was fine on Chrome, but FF requires 528 to avoid scrollbars */
        id: settingsFrameId,
    });
    $windowWrapper = $('.window-wrapper');
    $windowWrapper.click(ignoreClicks);
    $windowWrapper.empty().append(clearfix).append(settingsIcon).append(windowHeaderUtils);

    iframeObj.appendTo($windowWrapper);

    // Firefox wil load the iframe (even if there is no 'src') and overwrite the existing HTML, so we've
    // reworked this to load about:blank then set our HTML upon load completion.
    iframeObj.load(function () {
        try {
            var doc = iframeObj[0].contentDocument || (iframeObj[0].contentWindow && iframeObj[0].contentWindow.document);
            if (doc && doc.body) {
                doc.body.appendChild(settingsDiv[0]);
            }
        } catch (err) { }
    });
    iframeObj.attr('src', "about:blank"); // need to set this AFTER the .load() has been registered.

    $('.window-header-utils a.js-close-window').click(hideBurndown);
    //$(window).bind('resize', repositionBurndown);
    $('.window-overlay').bind('click', hideBurndown);

    //repositionBurndown();
}

function hideBurndown() {
    $('body').removeClass("window-up");
    $('.window').css("display", "none");
    //$(window).unbind('resize', repositionBurndown);
    $('.window-header-utils a.js-close-window').unbind('click', hideBurndown);
    $('.window-wrapper').unbind('click', ignoreClicks);
    $('.window-overlay').unbind('click', hideBurndown);
}

// NOTE: With the most recent Trello update, I don't think we have to position the window manually anymore.
// If that changes, restore the function AND uncomment the calls to it.
//function repositionBurndown()
//{
//windowWidth = $(window).width();
//if(windowWidth < 0) // todo change this to a n actual number (probably 710 or so)
//{
//    // todo shrink our iframe to an appropriate size.  contents should wrap
//}
//else
//{
//    burndownWindowWidth = 690;
//    leftPadding = (windowWidth - burndownWindowWidth) / 2.0;
//    $('.window').css("left", leftPadding);
//}
//}

//calculate board totals
var ctto;
function computeTotal() {
    clearTimeout(ctto);
    ctto = setTimeout(function () {
        var $title = $('.board-header-btns.mod-right,#board-header a');
        var $total = $title.children('.list-total').empty();
        if ($total.length == 0)
            $total = $('<span/>', { class: "list-total" }).appendTo($title);

        for (var i in _pointsAttr) {
            var score = 0,
                attr = _pointsAttr[i];
            $('#board .list-total .' + attr).each(function () {
                score += parseFloat(this.textContent) || 0;
            });
            var scoreSpan = $('<span/>', { class: attr }).text(round(score) || '');
            $total.append(scoreSpan);
        }

        updateBurndownLink(); // the burndown link and the total are on the same bar... so now they'll be in sync as to whether they're both there or not.
    });
};

//calculate list totals
var lto;
function calcListPoints() {
    clearTimeout(lto);
    lto = setTimeout(function () {
        $(S4T_LIST_SEL).each(function () {
            if (!this.list) new List(this);
            else if (this.list.calc) this.list.calc();
        });
    });
};

//.list pseudo
function List(el) {
    if (el.list) return;
    el.list = this;

    var $list = $(el),
        $total = $('<div class="list-total">'),
        busy = false,
        to;

    function readCard($c) {
        if ($c.target) {
            if (!/list-card/.test($c.target.className || '') && !/list-card/.test($c.target.getAttribute('data-testid') || '')) return;
            $c = $($c.target).filter(S4T_CARD_SEL);
        }
        $c.each(function () {
            if (!this.listCard) for (var i in _pointsAttr) {
                new ListCard(this, _pointsAttr[i]);
            } else {
                for (var i in _pointsAttr) {
                    setTimeout(this.listCard[_pointsAttr[i]].refresh);
                }
            }
        });
    };

    // All calls to calc are throttled to happen no more than once every 500ms (makes page-load and recalculations much faster).
    var self = this;
    this.calc = debounce(function () {
        self._calcInner();
    }, 500, true); // executes right away unless over its 500ms threshold since the last execution
    this._calcInner = function (e) { // don't call this directly. Call calc() instead.
        //if(e&&e.target&&!$(e.target).hasClass('list-card')) return; // TODO: REMOVE - What was this? We never pass a param into this function.
        clearTimeout(to);
        to = setTimeout(function () {
            var $header = $list.find("[data-testid='list-header'], .list-header").first();
            if (!$header.length) {
                $header = $list.find("[data-testid='list-title'], .list-title, [data-testid='list-name']").first().closest('[data-testid="list-header"], div');
            }
            if ($header.length > 0) {
                $list.find('.list-total').not($total).remove();
                if ($header.next()[0] !== $total[0]) {
                    $total.insertAfter($header);
                }
            }
            $total.empty();
            var hasPoints = false;
            for (var i in _pointsAttr) {
                var score = 0,
                    attr = _pointsAttr[i];
                $list.find(S4T_CARD_SEL).each(function () {
                    if (!this.listCard || s4tIsCommonCardElement(this)) return;
                    if (!isNaN(Number(this.listCard[attr].points))) {
                        // Performance note: calling :visible in the selector above leads to noticible CPU usage.
                        if (jQuery.expr.filters.visible(this)) {
                            score += Number(this.listCard[attr].points);
                        }
                    }
                });
                var scoreTruncated = round(score);
                if (scoreTruncated > 0) {
                    hasPoints = true;
                    var scoreSpan = $('<span/>', { class: attr }).text(scoreTruncated);
                    $total.append(scoreSpan);
                }
            }
            if (!hasPoints) {
                $total.hide();
            } else {
                $total.show();
            }
            computeTotal();
        });
    };

    this.refreshList = debounce(function () {
        readCard($list.find(S4T_CARD_SEL));
        this.calc(); // readCard will call this.calc() if any of the cards get refreshed.
    }, 500, false);

    var cardAddedRemovedObserver = new CrossBrowser.MutationObserver(function (mutations) {
        // Determine if the mutation event included an ACTUAL change to the list rather than
        // a modification caused by this extension making an update to points, etc. (prevents
        // infinite recursion).
        $.each(mutations, function (index, mutation) {
            var $target = $(mutation.target);

            // Ignore Sprint Helper nodes, badges, points, titles, and list totals
            if ($target.closest('[data-testid="card-front-badges"], [data-testid="badges"], .badge-points, [data-s4t-badge], .list-total, [data-testid="card-name"], [class*="s4t-"], [id^="s4t-"]').length) return;

            // Ignore a bunch of known elements that send mutation events.
            if (!($target.hasClass('list-total')
                || $target.hasClass('list-title')
                || $target.hasClass('list-header')
                || $target.hasClass('badge-points')
                || $target.hasClass('badges')
                || (typeof mutation.target.className == "undefined")
            )) {
                var list;
                // It appears this was an actual mutation and not a recursive notification.
                $list = $target.closest(S4T_LIST_CONTAINER_SEL);
                if ($list.length > 0) {
                    list = $list.get(0).list;
                    if (!list) {
                        list = new List($list.get(0));
                    }
                    if (list) {
                        list.refreshList(); // debounced, so its safe to call this multiple times for the same list in this loop.
                    }
                }
            }
        });
    });

    cardAddedRemovedObserver.observe($list.get(0), obsConfig);

    setTimeout(function () {
        readCard($list.find(S4T_CARD_SEL));
        setTimeout(el.list.calc);
    });
};

//.list-card pseudo
function ListCard(el, identifier) {
    if (el.listCard && el.listCard[identifier]) return;

    //lazily create object
    if (!el.listCard) {
        el.listCard = {};
    }
    el.listCard[identifier] = this;

    var points = -1,
        consumed = identifier !== 'points',
        regexp = consumed ? regC : reg,
        parsed,
        that = this,
        busy = false,
        $card = $(el),
        $badge = $('<div class="badge badge-points point-count" style="background-image: url(' + iconUrl + ')"/>'),
        to,
        to2;

    // MutationObservers may send a bunch of similar events for the same card (also depends on browser) so
    // refreshes are debounced now.
    var self = this;
    this.refresh = debounce(function () {
        self._refreshInner();
    }, 250, true); // executes right away unless over its 250ms threshold
    this._refreshInner = function () {
        if (busy) return;
        busy = true;
        clearTimeout(to);

        to = setTimeout(function () {
            var $title = $card.find(S4T_TITLE_SEL).first();
            if (!$title[0]) return;

            // Get or preserve unstripped original title
            var titleTextContent = $card.attr('data-s4t-orig-title') ||
                $title.attr('data-s4t-orig-title') ||
                $title.data('orig-title') ||
                el._origTitle;
            if (!titleTextContent) {
                var $clone = $title.clone();
                $clone.find('.card-short-id, .badge, [data-testid*="badge"]').remove();
                titleTextContent = $clone.text().trim() || $title[0].textContent || $title.text();
            }
            if (titleTextContent) {
                el._title = titleTextContent;
                if (!el._origTitle) el._origTitle = titleTextContent;
                $card.attr('data-s4t-orig-title', titleTextContent);
                $title.attr('data-s4t-orig-title', titleTextContent);
            }

            // Get the stripped-down (parsed) version without the estimates, that was stored after the last change.
            var parsedTitle = $title.data('parsed-title');

            if (titleTextContent != parsedTitle) {
                // New card title, so we have to parse this new info to find the new amount of points.
                parsed = titleTextContent.match(regexp);
                points = parsed ? parsed[2] : -1;
            } else {
                // Title text has already been parsed... process the pre-parsed title to get the correct points.
                var origTitle = $title.data('orig-title') || titleTextContent;
                parsed = origTitle.match(regexp);
                points = parsed ? parsed[2] : -1;
            }

            clearTimeout(to2);
            to2 = setTimeout(function () {
                // Add the badge (for this point-type: regular or consumed) to the badges div.
                var hasPoints = that.points !== '' && that.points !== -1 && that.points !== undefined && that.points !== null;
                var pointText = hasPoints ? String(that.points) : '';
                if ($badge.text() !== pointText) {
                    $badge.text(pointText);
                }
                $badge
                [(consumed ? 'add' : 'remove') + 'Class']('consumed')
                    .attr({
                        title: hasPoints ? ('This card has ' + that.points + (consumed ? ' consumed' : '') + ' storypoint' + (that.points == 1 ? '.' : 's.')) : '',
                        'data-s4t-badge': consumed ? 'cpoints' : 'points',
                        'data-points': pointText
                    });

                var $badgesTarget = $card.find("[data-testid='card-front-badges'], .badges, [data-testid='badges'], .js-badges").first();
                if ($badgesTarget.length > 0) {
                    $badgesTarget.find('.badge-points' + (consumed ? '.consumed' : ':not(.consumed)')).not($badge).remove();
                    if (hasPoints) {
                        if ($badge.parent()[0] !== $badgesTarget[0]) {
                            $badge.prependTo($badgesTarget);
                        }
                    } else {
                        if ($badge.parent().length > 0) {
                            $badge.detach();
                        }
                    }
                }

                // Update the DOM element's textContent and data if there were changes.
                if (titleTextContent != parsedTitle) {
                    $title.data('orig-title', titleTextContent); // store the non-mutilated title (with all of the estimates/time-spent in it).
                }
                parsedTitle = $.trim(el._title.replace(reg, '$1').replace(regC, '$1'));
                el._title = parsedTitle;
                $title.data('parsed-title', parsedTitle); // save it to the DOM element so that both badge-types can refer back to it.
                var titleNode = ($title[0].childNodes.length > 1) ? $title[0].childNodes[$title[0].childNodes.length - 1] : $title[0];
                if (titleNode && titleNode.textContent !== parsedTitle) {
                    titleNode.textContent = parsedTitle;
                }
                var list = $card.closest(S4T_LIST_CONTAINER_SEL);
                if (list[0] && list[0].list) {
                    list[0].list.calc();
                }
                busy = false;
            });
        });
    };

    this.__defineGetter__('points', function () {
        return parsed ? points : ''
    });

    var cardShortIdObserver = new CrossBrowser.MutationObserver(function (mutations) {
        $.each(mutations, function (index, mutation) {
            var $target = $(mutation.target);
            if (mutation.addedNodes.length > 0) {
                $.each(mutation.addedNodes, function (index, node) {
                    if ($(node).hasClass('card-short-id')) {
                        // Found a card-short-id added to the DOM. Need to refresh this card.
                        var listElement = $target.closest(S4T_LIST_CONTAINER_SEL).get(0);
                        if (listElement && !listElement.list) new List(listElement); // makes sure the .list in the DOM has a List object

                        var $card = $target.closest(S4T_CARD_CLOSEST_SEL);
                        if ($card.length > 0) {
                            var listCardHash = $card.get(0).listCard;
                            if (listCardHash) {
                                // The hash contains a ListCard object for each type of points (cpoints, points, possibly more in the future).
                                $.each(_pointsAttr, function (index, pointsAttr) {
                                    listCardHash[pointsAttr].refresh();
                                });
                            }
                        }
                    }
                });
            }
        });
    });

    // The MutationObserver is only attached once per card (for the non-consumed-points ListCard) and that Observer will make the call
    // to update BOTH types of points-badges.
    if (!consumed) {
        var observerConfig = { childList: true, characterData: false, attributes: false, subtree: true };
        cardShortIdObserver.observe(el, observerConfig);
    }

    setTimeout(that.refresh);
};

//the story point picker
function showPointPicker(targetEl) {
    if (!targetEl || targetEl === window || targetEl === window.location || !targetEl.nodeType || targetEl.nodeType !== 1) return;
    var $loc = $(targetEl);
    if ($loc.find('.picker').length) return;

    // Try to allow this to work with old card style (with save button) or new style (where title is always a textarea).
    var $elementToAddPickerTo = $('.card-detail-title .edit-controls');
    if ($elementToAddPickerTo.length == 0) {
        $elementToAddPickerTo = $(".js-card-detail-title-input.is-editing, textarea[data-testid='card-back-title']").closest('.window-header, [data-testid="card-back-title-container"]');
    }
    if ($elementToAddPickerTo.length == 0) {
        $elementToAddPickerTo = $loc;
    }

    var $picker = $('<div/>', { class: "picker" }).appendTo($elementToAddPickerTo.get(0));
    $picker.append($('<span>', { class: "picker-title" }).text("Estimated Points"));

    var estimateSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES].replace(/ /g, '')).split(',');
    for (var i in estimateSequence) $picker.append($('<span>', { class: "point-value" }).text(estimateSequence[i]).click(function () {
        var value = $(this).text();
        var $text = $('.card-detail-title .edit textarea'); // old text-areas
        if ($text.length == 0) {
            $text = $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]'); // new text-area
        }
        var text = $text.val();

        // replace estimates in card title
        $text[0].value = text.match(reg) ? text.replace(reg, '(' + value + ') ') : '(' + value + ') ' + text;

        // in old-textarea method, click our button so it all gets saved away
        $(".card-detail-title .edit .js-save-edit").click();
        // in new-textarea method, have to do a few actions to get it to save after we click away from the card
        $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]').click();
        $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]').focus();

        return false;
    }));

    if ($loc.find('.picker-consumed').length) return;
    var $pickerConsumed = $('<div/>', { class: "picker-consumed" }).appendTo($elementToAddPickerTo.get(0));
    $pickerConsumed.append($('<span>', { class: "picker-title" }).text("Consumed Points"));

    var consumedSequence = (S4T_SETTINGS[SETTING_NAME_ESTIMATES]).split(',');
    for (var i in consumedSequence) $pickerConsumed.append($('<span>', { class: "point-value" }).text(consumedSequence[i]).click(function () {
        var value = $(this).text();
        var $text = $('.card-detail-title .edit textarea'); // old text-areas
        if ($text.length == 0) {
            $text = $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]'); // new text-area
        }
        var text = $text.val();

        // replace consumed value in card title
        $text[0].value = text.match(regC) ? text.replace(regC, ' [' + value + ']') : text + ' [' + value + ']';

        // in old-textarea method, click our button so it all gets saved away
        $(".card-detail-title .edit .js-save-edit").click();
        // in new-textarea method, have to do a few actions to get it to save after we click away from the card
        $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]').click();
        $('textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"]').focus();

        return false;
    }));
};


//for export
var $excel_btn, $excel_dl;
window.URL = window.URL || window.webkitURL;

function checkExport() {
    if ($excel_btn && $excel_btn.filter(':visible').length) return;
    if ($('.pop-over-list').find('.js-export-excel').length) return;
    var $js_btn = $('.pop-over-list').find('.js-export-json');
    var $ul = $js_btn.closest('ul:visible');
    if (!$js_btn.length) return;
    $js_btn.parent().after($('<li>').append(
        $excel_btn = $('<a href="#" target="_blank" title="Open downloaded file with Excel">Excel</a>')
            .click(showExcelExport)
    ))
};

function showExcelExport() {
    $excel_btn.text('Generating...');

    $.getJSON($('.pop-over-list').find('.js-export-json').attr('href'), function (data) {
        var s = '<table id="export" border=1>';
        s += '<tr><th>Points</th><th>Story</th><th>Description</th></tr>';
        $.each(data['lists'], function (key, list) {
            var list_id = list["id"];
            s += '<tr><th colspan="3">' + list['name'] + '</th></tr>';

            $.each(data["cards"], function (key, card) {
                if (card["idList"] == list_id) {
                    var title = card["name"];
                    var parsed = title.match(reg);
                    var points = parsed ? parsed[1] : '';
                    title = title.replace(reg, '');
                    s += '<tr><td>' + points + '</td><td>' + title + '</td><td>' + card["desc"] + '</td></tr>';
                }
            });
            s += '<tr><td colspan=3></td></tr>';
        });
        s += '</table>';

        var blob = new Blob([s], { type: 'application/ms-excel' });

        var board_title_reg = /.*\/(.*)$/;
        var board_title_parsed = document.location.href.match(board_title_reg);
        var board_title = board_title_parsed[1];

        $excel_btn
            .text('Excel')
            .after(
                $excel_dl = $('<a>')
                    .attr({
                        download: board_title + '.xls',
                        href: window.URL.createObjectURL(blob)
                    })
            );

        var evt = document.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        $excel_dl[0].dispatchEvent(evt);
        $excel_dl.remove()

    });

    return false
};

// for settings

function useChromeStorage() {
    return ((typeof chrome !== "undefined") && (typeof chrome.storage !== "undefined"));
}

/**
 * Saves the Setting (defined by 'settingName') to be whatever is in 'settingValue'.
 *
 * This will use Chrome cloud-storage if available, then will fall back to LocalStorage
 * if possible and fall back to cookies otherwise.
 *
 * NOTE: Remember to enver store confidential or user information in Chrome cloud
 * storage (it's not encrypted).
 */
function saveSetting(settingName, settingValue) {
    // Use Chrome cloud storage where available (will sync across multiple computers).
    if (useChromeStorage()) {
        var objectToPersist = {}; // can't use an object-literal to do it, or chrome will make an object whose key is literally 'settingName'
        objectToPersist[settingName] = settingValue;
        chrome.storage.sync.set(objectToPersist, function () {
            // console.log("Chrome saved " + settingName + ".");
        });
    } else if (typeof (Storage) !== "undefined") {
        localStorage[settingName] = settingValue;
    } else {
        // No LocalStorage support... use cookies instead.
        setCookie(settingName, settingValue);
    }
} // end saveSetting()

/**
 * Retrieves the Setting defined by 'settingName'. The 'defaultValue' is optional.
 *
 * This will use LocalStorage if possible and fall back to cookies otherwise. Typically
 * this function will only be used if Chrome cloud storage is not available.
 */
function getSetting(settingName, defaultValue) {
    var retVal = defaultValue;
    if (typeof (Storage) !== "undefined") {
        var lsValue = localStorage[settingName];
        if (typeof lsValue !== 'undefined') {
            retVal = lsValue;
        }
    } else {
        // No LocalStorage support... use cookies instead.
        retVal = getCookie(settingName, defaultValue);
    }
    return retVal;
}; // end getSetting()

/**
 * Refreshes all of the persisted settings and puts them in memory. This is
 * done at the beginning, and any time chrome cloud-storage sends an event
 * that the data has changed.
 */
function refreshSettings() {
    if (useChromeStorage()) {
        chrome.storage.sync.get(S4T_ALL_SETTINGS, function (result) {
            //if(chrome.runtime.lastError){}
            $.each(S4T_ALL_SETTINGS, function (i, settingName) {
                if (result[settingName]) {
                    S4T_SETTINGS[settingName] = result[settingName];
                } else {
                    S4T_SETTINGS[settingName] = S4T_SETTING_DEFAULTS[settingName];
                }
            });
            onSettingsUpdated();
        });
    } else {
        // Get the settings (with defaults for each). Add a new line here for every new setting.
        $.each(S4T_ALL_SETTINGS, function (i, settingName) {
            S4T_SETTINGS[settingName] = getSetting(settingName, S4T_SETTING_DEFAULTS[settingName]);
        });
        onSettingsUpdated();
    }
}; // end refreshSettings()

function onSettingsUpdated() {
    // Temporary indication to the user that the settings were saved (might not always be on screen, but that's not a problem).
    try {
        var frameEl = document.getElementById(settingsFrameId);
        if (frameEl && frameEl.contentDocument) {
            var savedEl = frameEl.contentDocument.getElementById('s4tSaved');
            if (savedEl) {
                savedEl.style.display = 'inline';
                setTimeout(function () { savedEl.style.display = 'none'; }, 2000);
            }
        }
    } catch (e) { }

    // Refresh the links because link-settings may have changed.
    $('.s4tLink').remove();
    updateBurndownLink();
} // end onSettingsUpdated()

/**
 * Sets a key/value cookie to live for about a year. Cookies are typically not used by
 * this extension if LocalSettings is available in the browser.
 * From: http://www.w3schools.com/js/js_cookies.asp
 */
function setCookie(c_name, value) {
    var exdays = 364;
    var exdate = new Date();
    exdate.setDate(exdate.getDate() + exdays);
    var c_value = escape(value) + ((exdays == null) ? "" : "; expires=" + exdate.toUTCString());
    document.cookie = c_name + "=" + c_value;
}; // end setCookie()

/**
 * Gets a cookie value if available (defaultValue if not found). Cookies are typically not\
 * used by this extension if LocalSettings is available in the browser.
 * Basically from: http://www.w3schools.com/js/js_cookies.asp
 */
function getCookie(c_name, defaultValue) {
    var c_value = document.cookie;
    var c_start = c_value.indexOf(" " + c_name + "=");
    if (c_start == -1) {
        c_start = c_value.indexOf(c_name + "=");
    }
    if (c_start == -1) {
        c_value = defaultValue;
    } else {
        c_start = c_value.indexOf("=", c_start) + 1;
        var c_end = c_value.indexOf(";", c_start);
        if (c_end == -1) {
            c_end = c_value.length;
        }
        c_value = unescape(c_value.substring(c_start, c_end));
    }
    return c_value;
}; // end getCookie()

/* Attention filters use their own class, leaving Trello's native filters intact. */
// Compact only lists affected by Attention; native inline layout remains untouched.
function s4tCompactAttentionLists(enabled) {
    var classes = ['s4t-attention-container', 's4t-attention-flow', 's4t-attention-item', 's4t-attention-row-hidden', 's4t-attention-spacer', 's4t-attention-empty'];
    var wanted = new Map(classes.map(function (name) { return [name, new Set()]; }));
    var cardSelector = '[data-testid="list-card"]:not(.placeholder), .list-card:not(.placeholder)';
    var controls = 'button, a, input, textarea, [contenteditable="true"], [role="button"]';
    document.querySelectorAll('[data-testid="list-cards"], [data-testid="list-card-items"], .list-cards').forEach(function (container) {
        // Restore styles written by the old compaction implementation.
        [['data-s4t-orig-height', 'height'], ['data-s4t-orig-pb', 'paddingBottom']].forEach(function (pair) {
            if (container.hasAttribute(pair[0])) { container.style[pair[1]] = container.getAttribute(pair[0]); container.removeAttribute(pair[0]); }
        });
        if (!enabled || !container.querySelector('.s4t-attention-hidden')) return;
        wanted.get('s4t-attention-container').add(container);
        var cards = Array.from(container.querySelectorAll(cardSelector));
        var paths = new Set([container]);
        cards.forEach(function (card) {
            wanted.get('s4t-attention-item').add(card);
            for (var parent = card.parentElement; parent && parent !== container; parent = parent.parentElement) paths.add(parent);
        });
        paths.forEach(function (wrapper) {
            if (wrapper !== container) {
                wanted.get('s4t-attention-flow').add(wrapper);
                var children = Array.from(wrapper.querySelectorAll(cardSelector));
                if (children.length && children.every(function (card) { return card.classList.contains('s4t-attention-hidden'); }) &&
                    !Array.from(wrapper.querySelectorAll(controls)).some(function (control) { return !control.closest(cardSelector); })) {
                    wanted.get('s4t-attention-row-hidden').add(wrapper);
                }
            }
            Array.from(wrapper.children).forEach(function (child) {
                if (paths.has(child) || child.matches(cardSelector) || child.querySelector(cardSelector) ||
                    !child.matches('div, li') || child.matches('[data-rfd-placeholder-context-id], [data-rbd-placeholder-context-id], .placeholder') ||
                    child.textContent.trim() || child.matches(controls) || child.querySelector(controls + ', img, svg, [role="status"]')) return;
                wanted.get('s4t-attention-spacer').add(child);
            });
        });
        if (cards.length && cards.every(function (card) { return card.classList.contains('s4t-attention-hidden'); }) &&
            !Array.from(container.querySelectorAll(controls)).some(function (control) { return !control.closest(cardSelector); })) wanted.get('s4t-attention-empty').add(container);
    });
    classes.forEach(function (name) {
        document.querySelectorAll('.' + name).forEach(function (element) { if (!wanted.get(name).has(element)) element.classList.remove(name); });
        wanted.get(name).forEach(function (element) { if (!element.classList.contains(name)) element.classList.add(name); });
    });
    document.querySelectorAll('.s4t-filtered-list, .s4t-attention-row, .s4t-attention-collection').forEach(function (element) {
        element.classList.remove('s4t-filtered-list', 's4t-attention-row', 's4t-attention-collection');
    });
}

function s4tIsCommonCard(card) {
    if (['asMy0RMf', '3DtkgH4w'].indexOf(card.shortLink) !== -1) return true;
    var name = String(card.name || '').replace(/[([{]\s*(?:\?|[-+]?\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:pts?|points?)?\s*[)\]}]/gi, ' ').replace(/\s+/g, ' ').trim();
    return /^(?:release|template\s+card)$/i.test(name);
}
function s4tIsCommonCardElement(node) {
    var link = node.matches('a[href*="/c/"]') ? node : node.querySelector('a[href*="/c/"]');
    var match = link && (link.getAttribute('href') || '').match(/\/c\/([A-Za-z0-9]+)/);
    var title = node.querySelector(S4T_TITLE_SEL);
    return s4tIsCommonCard({ shortLink: match && match[1], name: node.getAttribute('data-s4t-orig-title') || node._origTitle || (title && (title.getAttribute('data-s4t-orig-title') || title.textContent)) || (link && link.textContent) || '' });
}

function s4tAttentionNormalizeName(value) {
    return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}
function s4tAttentionNames(value) {
    return Array.from(new Set(String(value || '').split(/[\r\n,]+/).map(s4tAttentionNormalizeName).filter(Boolean)));
}
function s4tAttentionChecklistMap(cards, checklists) {
    var byId = {}, byCard = {}, result = {};
    checklists.forEach(function (list) {
        byId[list.id] = list;
        if (list.idCard) (byCard[list.idCard] || (byCard[list.idCard] = [])).push(list);
    });
    cards.forEach(function (card) {
        result[card.id] = Array.isArray(card.idChecklists) ? card.idChecklists.map(function (id) { return byId[id]; }).filter(Boolean) : (byCard[card.id] || []);
    });
    return result;
}

function s4tCommentHeadingName(value) {
    return s4tAttentionNormalizeName(value).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/[:：]$/, '').trim();
}
function s4tCommentHeadings(text) {
    var headings = [], fence = null, lines = String(text || '').split(/\r?\n/);
    lines.forEach(function (line, index) {
        var code = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (code) { if (!fence) fence = code[1]; else if (code[1][0] === fence[0] && code[1].length >= fence.length) fence = null; return; }
        if (fence) return;
        var heading = line.match(/^ {0,3}#{1,3}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
        if (heading) headings.push(s4tCommentHeadingName(heading[1]));
        else if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && index && /\S/.test(lines[index-1]) && !/^\s*(?:>|#|`|~)/.test(lines[index-1])) headings.push(s4tCommentHeadingName(lines[index-1]));
    });
    return Array.from(new Set(headings));
}
async function s4tLoadAttentionComments(cards, fetchPage, valid, cache) {
    var index = 0, stopped = false;
    async function worker() {
        while (index < cards.length && !stopped && valid()) {
            var card = cards[index++], headings = new Set(), before, cursors = new Set();
            if (card.closed || s4tIsCommonCard(card)) continue;
            var revision = card.dateLastActivity && String(card.dateLastActivity) + ':' + (card.badges && card.badges.comments);
            var cached = cache && cache.get(card.id);
            if (revision && cached && cached.revision === revision) { card.s4tCommentHeadings = cached.headings; continue; }
            if (card.badges && card.badges.comments === 0) { card.s4tCommentHeadings = []; continue; }
            for (var page = 0; ; page++) {
                if (stopped || !valid()) return;
                if (page >= 100) throw new Error('Comment history incomplete');
                var actions = await fetchPage(card.id, before);
                if (stopped || !valid()) return;
                if (!Array.isArray(actions)) throw new Error('Invalid comment history');
                actions.forEach(function (action) { s4tCommentHeadings(action.data && action.data.text).forEach(function (name) { headings.add(name); }); });
                if (actions.length < 1000) break;
                before = actions[actions.length-1].id;
                if (!before || cursors.has(before)) throw new Error('Comment history incomplete');
                cursors.add(before);
            }
            card.s4tCommentHeadings = Array.from(headings);
            if (cache && revision) cache.set(card.id, {revision:revision, headings:card.s4tCommentHeadings});
        }
    }
    try { await Promise.all(Array.from({length:Math.min(4,cards.length)}, worker)); }
    catch (error) { stopped = true; throw error; }
}

function s4tAttentionIssues(card, checklists, requiredNames, boardLabels, now, requiredComments) {
    var points = parsePoints(card.name);
    var hotfix = (boardLabels || card.labels || []).some(function (label) {
        return /\bhot[\s-]*fix\b/i.test(label.name || '') &&
            ((card.idLabels || []).indexOf(label.id) !== -1 || (card.labels || []).some(function (value) { return value.id === label.id; }));
    });
    var due = card.due ? new Date(card.due) : null;
    var hasDue = !!due && !isNaN(due.getTime());
    var today = now || new Date();
    var items = [];
    checklists.forEach(function (list) { items = items.concat(list.checkItems || []); });
    var names = checklists.map(function (list) { return s4tAttentionNormalizeName(list.name); });
    return {
        hotfix: hotfix,
        hotfixDue: hotfix && hasDue,
        hotfixToday: hotfix && hasDue && due.getFullYear() === today.getFullYear() &&
            due.getMonth() === today.getMonth() && due.getDate() === today.getDate(),
        scope: !(card.desc || '').trim(),
        estimate: (card.idMembers || []).length > 0 && parsePoints(card.name).assigned === null,
        unassigned: (card.idMembers || []).length === 0,
        missingCompleted: points.completed === null,
        pointsMismatch: points.assigned !== null && points.completed !== null && points.completed !== points.assigned,
        missingComments: Array.isArray(card.s4tCommentHeadings) && (requiredComments || []).some(function (name) {
            return card.s4tCommentHeadings.indexOf(s4tCommentHeadingName(name)) === -1;
        }),
        incomplete: items.some(function (item) { return item.state !== 'complete'; }),
        complete: items.length > 0 && items.every(function (item) { return item.state === 'complete'; }),
        missing: requiredNames.length ? requiredNames.some(function (name) {
            return names.indexOf(s4tAttentionNormalizeName(name)) === -1;
        }) : checklists.length === 0
    };
}

// An empty filter means everyone; __empty__ explicitly means no selected members.
function s4tToggleMembers(current, id, checked, memberIds, matchAll) {
    var universe = Array.from(new Set(memberIds.concat(['__none__'])));
    var values = current.length ? current.filter(function (value) { return value !== '__empty__'; }) : universe;
    values = values.filter(function (value) { return value !== id; });
    if (checked) values.push(id);
    if (!values.length) return ['__empty__'];
    if (!matchAll && universe.every(function (value) { return values.indexOf(value) !== -1; })) return [];
    return values;
}

function s4tToggleLabels(current, id, checked, labelIds, matchAll) {
    return s4tToggleMembers(current, id, checked, labelIds, matchAll);
}

function s4tAttentionMatches(card, issues, selected, excluded, members, labels, matchAll) {
    members = members || []; labels = labels || [];
    function includes(values, choices) {
        return !choices.length || choices[matchAll ? 'every' : 'some'](function (id) {
            if (id === '__empty__') return false;
            return id === '__none__' ? !values.length : values.indexOf(id) !== -1;
        });
    }
    return !card.closed && !s4tIsCommonCard(card) && excluded.indexOf(card.idList) === -1 &&
        (!selected.length || selected.some(function (key) { return issues[key]; })) &&
        includes(card.idMembers || [], members) && includes(card.idLabels || [], labels);
}

// Offer only lists containing eligible cards for the current member selection.
// Ignore issue/label/list filters here so an excluded list can still be restored.
function s4tAttentionMemberLists(data, members, matchAll) {
    if (members.includes('__empty__')) return [];
    var ids = new Set();
    (data.cards || []).forEach(function (card) {
        if (s4tAttentionMatches(card, {}, [], [], members, [], matchAll)) ids.add(card.idList);
    });
    return (data.lists || []).filter(function (list) { return !list.closed && ids.has(list.id); });
}

function s4tReadNativeFilters(query, boardData) {
    var result = { members: [], labels: [], unresolved: [], other: [], matchAll: false };
    var pattern = /([a-zA-Z]+):(?:"([^"]*)"|'([^']*)'|([^,]*?))(?=,\s*[a-zA-Z]+:|\s+[a-zA-Z]+:|$)/g;
    var remainder = String(query || '').replace(pattern, function (token, kind, quoted, single, plain) {
        var value = (quoted !== undefined ? quoted : single !== undefined ? single : plain).trim();
        kind = kind.toLowerCase();
        if (kind === 'mode' || kind === 'match') { result.matchAll = /^(all|and|exact)$/i.test(value); return ''; }
        if (kind !== 'member' && kind !== 'label') { result.other.push(token); return ''; }
        var key = kind === 'member' ? 'members' : 'labels';
        if (/^(none|no_members|no_labels)$/i.test(value)) { result[key].push('__none__'); return ''; }
        var items = boardData[key] || [], lower = value.replace(/^@/, '').toLowerCase();
        var matches = items.filter(function (item) { return item.id === value; });
        if (!matches.length) matches = items.filter(function (item) {
            return (kind === 'member' ? [item.username, item.fullName] : [item.name]).some(function (name) { return name && name.toLowerCase() === lower; });
        });
        if (!matches.length && kind === 'label') matches = items.filter(function (item) { return !item.name && item.color === lower; });
        if (!matches.length) result.unresolved.push(token);
        else matches.forEach(function (item) { result[key].push(item.id); });
        return '';
    }).replace(/[,\s]+/g, ' ').trim();
    if (remainder) result.other.push(remainder);
    result.members = Array.from(new Set(result.members)); result.labels = Array.from(new Set(result.labels));
    return result;
}

// Keep only the latest snapshot and result: bounded memory, invalidated on refresh/date/name changes.
function s4tCreateAttentionEvaluator() {
    var snapshot, issueKey, flags, resultKey, result;
    return function (boardData, options, now) {
        now = now || new Date();
        var nextIssueKey = JSON.stringify([options.required, options.requiredComments, now.getFullYear(), now.getMonth(), now.getDate()]);
        if (snapshot !== boardData || issueKey !== nextIssueKey) {
            snapshot = boardData; issueKey = nextIssueKey; resultKey = null;
            var lists = s4tAttentionChecklistMap(boardData.cards, boardData.checklists);
            var names = s4tAttentionNames(options.required);
            flags = boardData.cards.map(function (card) { return s4tAttentionIssues(card, lists[card.id] || [], names, boardData.labels, now, s4tAttentionNames(options.requiredComments)); });
        }
        var key = JSON.stringify([options.selected, options.excluded, options.members, options.labels, options.matchAll]);
        if (resultKey === key) return result;
        var index = {}, ids = [];
        boardData.cards.forEach(function (card, i) {
            var matches = s4tAttentionMatches(card, flags[i], options.selected, options.excluded, options.members, options.labels, options.matchAll);
            index[card.shortLink] = matches;
            if (matches) ids.push(card.id);
        });
        resultKey = key;
        result = { index: index, ids: ids, count: ids.length };
        return result;
    };
}

function s4tCardsNativeSelection(boardData, query, renderedShortLinks) {
    var filters = s4tReadNativeFilters(query, boardData);
    if (query && !filters.unresolved.length && !filters.other.length) {
        return {
            ids: boardData.cards.filter(function (card) {
                return s4tAttentionMatches(card, {}, [], [], filters.members, filters.labels, filters.matchAll);
            }).map(function (card) { return card.id; }), source: 'Trello filters', limited: false
        };
    }
    // For native criteria we cannot reproduce, trust Trello's rendered matches.
    var visible = new Set(renderedShortLinks);
    return {
        ids: boardData.cards.filter(function (card) {
            return !card.closed && !s4tIsCommonCard(card) && visible.has(card.shortLink);
        }).map(function (card) { return card.id; }), source: 'Trello filters · loaded cards', limited: true
    };
}

(function () {
    if (typeof document === 'undefined') return;
    var board = null, data = null, selected = [], excluded = [], required = '', requiredComments = 'Tech Design\nTest Cases\nBranch';
    var memberFilters = [], labelFilters = [], matchAll = false, switching = false, nativeBlocked = false, dataWaiters = [];
    var evaluateAttention = s4tCreateAttentionEvaluator(), wasCompacted = false;
    function attentionResult() {
        return data ? evaluateAttention(data, { required: required, requiredComments: requiredComments, selected: selected.filter(function (key) { return key !== 'missingComments' || data.s4tCommentsLoaded; }), excluded: excluded, members: memberFilters, labels: labelFilters, matchAll: matchAll }) : { index: {}, ids: [], count: 0 };
    }
    var request = 0, loading = false, error = '', refreshed = '';
    var commentLoading = false, commentRequest = 0, commentCache = new Map(), commentError = '';
    var panel, button, controls, cardsButton, clearButton, observerTimer, layoutKey = '', savedState = '';

    function active() { return selected.length > 0 || excluded.length > 0 || memberFilters.length > 0 || labelFilters.length > 0; }
    function attentionIcon() {
        return '<svg class="s4t-attention-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--ds-surface, #fff)"/><circle cx="16" cy="12" r="2" fill="var(--ds-surface, #fff)"/><circle cx="8" cy="18" r="2" fill="var(--ds-surface, #fff)"/></svg>';
    }
    function storageKey() { return 's4t-attention-names-' + board; }
    function currentBoard() {
        var direct = window.location.pathname.match(/\/b\/([A-Za-z0-9]+)/);
        if (direct) return direct[1];
        // Opening a card changes /b/... to /c/... without leaving its board.
        if (/^\/c\//.test(window.location.pathname)) {
            if (board) return board;
            var headerLink = typeof document !== 'undefined' && document.querySelector('a[data-testid="board-name-display"], a[data-testid="board-header-board-name"], [data-testid="board-header"] a[href*="/b/"], .board-header a[href*="/b/"]');
            var match = headerLink && (headerLink.getAttribute('href') || '').match(/\/b\/([A-Za-z0-9]+)/);
            if (match) return match[1];
        }
        return getBoardShortLink();
    }
    function saveFilters() {
        if (!board) return false;
        var value = JSON.stringify({ selected: selected, excluded: excluded, members: memberFilters, labels: labelFilters, matchAll: matchAll });
        if (value === savedState) return true;
        try { localStorage.setItem('s4t-attention-filters-' + board, value); savedState = value; return true; } catch (_) { return false; }
    }
    function resetBoard() {
        var current = currentBoard();
        if (!current || current === board) return;
        board = current;
        dataWaiters.splice(0).forEach(function (callback) { callback(new Error('Board changed')); });
        request++; commentRequest++; commentLoading = false; commentError = ''; commentCache.clear();
        data = null; selected = []; excluded = []; loading = false; error = ''; refreshed = '';
        memberFilters = []; labelFilters = [];
        matchAll = false;
        savedState = '';
        try {
            var stored = JSON.parse(localStorage.getItem('s4t-attention-filters-' + board) || '{}');
            selected = Array.isArray(stored.selected) ? stored.selected.filter(function (key) {
                return ['scope', 'estimate', 'unassigned', 'missingCompleted', 'pointsMismatch', 'missingComments', 'hotfixToday', 'hotfix', 'hotfixDue', 'incomplete', 'complete', 'missing'].indexOf(key) !== -1;
            }) : [];
            excluded = Array.isArray(stored.excluded) ? stored.excluded.filter(function (id) { return typeof id === 'string'; }) : [];
            memberFilters = Array.isArray(stored.members) ? stored.members.filter(function (id) { return typeof id === 'string'; }) : [];
            labelFilters = Array.isArray(stored.labels) ? stored.labels.filter(function (id) { return typeof id === 'string'; }) : [];
            matchAll = stored.matchAll === true;
        } catch (_) { /* Ignore malformed stored preferences. */ }
        try { required = localStorage.getItem(storageKey()) || ''; } catch (_) { required = ''; }
        try { requiredComments = localStorage.getItem('s4t-attention-comment-names-' + board) ?? 'Tech Design\nTest Cases\nBranch'; } catch (_) { requiredComments = 'Tech Design\nTest Cases\nBranch'; }
        close();
        document.querySelectorAll('.s4t-attention-hidden').forEach(function (el) {
            el.classList.remove('s4t-attention-hidden');
        });
        compactLists(false);
    }

    function close() {
        if (panel) panel.remove();
        panel = null;
        if (button) button.attr('aria-expanded', 'false');
    }

    function outsideAttention(node) {
        return !node.closest('#s4t-attention-controls, #s4t-cards-launch, #s4t-attention-panel, #s4t-modal-overlay, #s4t-cards-overlay, .window, .card-detail-window, [data-testid="card-back"], [data-testid="card-back-container"]');
    }
    function nativePopover() {
        var toggle = document.querySelector('[data-testid="filter-popover-button"], [data-testid="board-filter-button"]');
        var controlled = toggle && toggle.getAttribute('aria-controls');
        var linked = controlled && document.getElementById(controlled);
        if (linked && linked.getClientRects().length && outsideAttention(linked)) return linked;
        return Array.from(document.querySelectorAll('[data-testid*="filter-popover"]:not(button), [data-testid*="filter-menu"], .pop-over, [role="dialog"], [role="menu"]')).find(function(node) {
            if (!outsideAttention(node) || !node.getClientRects().length) return false;
            var title = node.querySelector && node.querySelector('h1, h2, h3, [role="heading"]');
            var named = node.getAttribute('aria-label') || (title && title.textContent) || '';
            if (node.matches && node.matches('[role="dialog"], [role="menu"]')) return /^(?:filter|filters|filter cards)$/i.test(named.trim());
            return /filters?/i.test(named || node.textContent);
        });
    }
    function nativeClearButton() {
        if (typeof window !== 'undefined' && /^\/c\//.test(window.location.pathname)) return null;
        var known = Array.from(document.querySelectorAll('[data-testid*="filter"][data-testid*="clear"], .js-clear-all'));
        var popover = nativePopover();
        document.querySelectorAll('button, [role="button"], a').forEach(function (node) {
            var names = [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent];
            if (names.some(function (value) {
                var name = (value || '').replace(/\s+/g, ' ').trim();
                return /^clear (all )?filters(?:\s*\(\d+\))?$/i.test(name) ||
                    (popover && popover.contains(node) && /^clear(?: all)?$/i.test(name));
            })) known.push(node);
        });
        return known.find(function (node) { return outsideAttention(node) && !node.closest('.window, .card-detail-window, [data-testid="card-back"], [data-testid="card-back-container"]') && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && node.getClientRects().length; });
    }
    function nativeFiltersActive(ignoreUrl) {
        var query = new URLSearchParams(window.location.search).get('filter') || '';
        if (!ignoreUrl && query.replace(/(?:^|[,\s])(?:mode|match):(?:and|or|all|any|exact)/gi, '').replace(/[,\s]/g, '')) return true;
        var popover = nativePopover();
        if (popover) {
            var choices = popover.querySelectorAll('input[type="checkbox"], [role="checkbox"], [role="option"][aria-selected]');
            var textFields = popover.querySelectorAll('input[type="search"], input[type="text"]');
            if (choices.length || textFields.length) {
                return Array.from(choices).some(function (node) { var label = node.getAttribute('aria-label') || ((node.closest && node.closest('label')) || node).textContent || '';
                    if (/^(?:exact match|match (?:all|any)(?: selected)?(?: options| filters| labels)?|any match)$/i.test(label.trim())) return false;
                    return node.checked || node.getAttribute('aria-checked') === 'true' || node.getAttribute('aria-selected') === 'true'; }) ||
                    Array.from(textFields).some(function (node) { return !!node.value.trim(); });
            }
        }
        return !!nativeClearButton();
    }
    async function clearNativeFilterControls(pause) {
        var visited = new Set();
        // Re-query after each click because React may replace the whole popover.
        for (var step = 0; step < 200; step++) {
            var popover = nativePopover();
            if (!popover) return;
            var checked = Array.from(popover.querySelectorAll('input[type="checkbox"]:checked, [role="checkbox"][aria-checked="true"], [role="option"][aria-selected="true"]')).find(function (node) {
                var label = node.getAttribute('aria-label') || ((node.closest && node.closest('label')) || node).textContent || '';
                return !visited.has(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' &&
                    !/^(?:exact match|match (?:all|any)(?: selected)?(?: options| filters| labels)?|any match)$/i.test(label.trim());
            });
            if (!checked) break;
            visited.add(checked);
            var target = checked;
            if (!checked.getClientRects().length) {
                var label = (checked.labels && checked.labels[0]) || (checked.closest && checked.closest('label'));
                if (label && label.getClientRects().length) target = label;
            }
            target.click();
            await pause(100);
        }
        var popover = nativePopover();
        if (!popover) return;
        var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        Array.from(popover.querySelectorAll('input[type="search"], input[type="text"]')).forEach(function (input) {
            if (!input.value || input.disabled) return;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await pause(150);
        var clear = nativeClearButton();
        if (clear) clear.click();
    }
    function notice(message) {
        var toast = document.getElementById('s4t-attention-notice');
        if (!toast) { toast = document.createElement('div'); toast.id = 's4t-attention-notice'; toast.setAttribute('role', 'status'); document.body.appendChild(toast); }
        toast.textContent = message;
        clearTimeout(notice.timer);
        notice.timer = setTimeout(function () { toast.remove(); }, 6000);
    }
    function readNativeSnapshot() {
        var result = s4tReadNativeFilters(new URLSearchParams(window.location.search).get('filter') || '', data);
        var popover = nativePopover(), domMembers = [], domLabels = [];
        if (popover) {
            popover.querySelectorAll('input:checked, [role="checkbox"][aria-checked="true"], [role="option"][aria-selected="true"]').forEach(function (node) {
                var row = node.closest('label') || (node.id && Array.from(popover.querySelectorAll('label')).find(function (label) { return label.htmlFor === node.id; })) || node;
                var text = (node.getAttribute('aria-label') || row.textContent || '').trim();
                var memberId = node.getAttribute('data-member-id') || row.getAttribute('data-member-id');
                var labelId = node.getAttribute('data-label-id') || row.getAttribute('data-label-id');
                var value = node.value && node.value !== 'on' ? node.value : '';
                var norm = function (value) { return (value || '').replace(/^@/, '').trim().toLowerCase(); };
                if (/^no members?$/i.test(text)) domMembers.push('__none__');
                else if (/^no labels?$/i.test(text)) domLabels.push('__none__');
                else {
                    data.members.forEach(function (m) {
                        if (m.id === memberId || m.id === value || [m.username, m.fullName].some(function (name) { return name && norm(name) === norm(text); })) domMembers.push(m.id);
                    });
                    data.labels.forEach(function (l) {
                        if (l.id === labelId || l.id === value || (l.name && norm(l.name) === norm(text))) domLabels.push(l.id);
                    });
                }
            });
            var exact = Array.from(popover.querySelectorAll('input:checked, [role="radio"][aria-checked="true"]')).some(function (node) {
                return /exact match|match all/i.test(node.getAttribute('aria-label') || (node.closest('label') || node).textContent);
            });
            if (exact) result.matchAll = true;
        }
        // Checked native controls are authoritative when available (e.g. color-only labels).
        if (domMembers.length) {
            var memberCount = result.members.length + result.unresolved.filter(function (token) { return /^member:/i.test(token); }).length;
            result.members = Array.from(new Set(domMembers));
            if (result.members.length >= memberCount) result.unresolved = result.unresolved.filter(function (token) { return !/^member:/i.test(token); });
        }
        if (domLabels.length) {
            var labelCount = result.labels.length + result.unresolved.filter(function (token) { return /^label:/i.test(token); }).length;
            result.labels = Array.from(new Set(domLabels));
            if (result.labels.length >= labelCount) result.unresolved = result.unresolved.filter(function (token) { return !/^label:/i.test(token); });
        }
        return result;
    }
    async function switchToAttention(callback) {
        if (!nativeFiltersActive()) { callback(); return; }
        if (switching) return;
        switching = true;
        if (panel) {
            panel.find('[data-use-attention]').prop('disabled', true).text('Switching…');
            apply();
        }
        var origin = board;
        var pause = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
        try {
            if (!data) await new Promise(function (resolve, reject) {
                dataWaiters.push(function (err) { if (err) reject(err); else resolve(); }); fetchData();
            });
            if (currentBoard() !== origin) return;
            var toggle = document.querySelector('[data-testid="filter-popover-button"], [data-testid="board-filter-button"]');
            if (!nativePopover() && toggle && toggle.getAttribute('aria-expanded') !== 'true') {
                toggle.click();
                for (var waiting = 0; waiting < 10 && !nativePopover(); waiting++) await pause(100);
            }
            if (currentBoard() !== origin) return;
            var imported = readNativeSnapshot();
            if (imported.unresolved.length) throw new Error('Could not match ' + imported.unresolved.join(', ') + '. Trello filters were left unchanged.');
            var oldMembers = memberFilters, oldLabels = labelFilters, oldMatchAll = matchAll;
            memberFilters = Array.from(new Set(memberFilters.filter(function (id) { return id !== '__empty__'; }).concat(imported.members)));
            labelFilters = Array.from(new Set(labelFilters.concat(imported.labels)));
            matchAll = imported.matchAll;
            if (!saveFilters()) {
                memberFilters = oldMembers; labelFilters = oldLabels; matchAll = oldMatchAll;
                throw new Error('Could not save imported filters. Trello filters were left unchanged.');
            }
            renderPeopleAndLabels(); apply();
            var clear = nativeClearButton();
            if (clear) clear.click();
            await pause(200);
            if (nativeFiltersActive()) {
                // Clear the native controls through their normal React event handlers.
                // A reload only changes the URL and can restore Trello's persisted filters.
                if (!nativePopover() && toggle && toggle.getAttribute('aria-expanded') !== 'true') {
                    toggle.click(); await pause(200);
                }
                await clearNativeFilterControls(pause);
            }
            // A cleared native panel can leave its old filter query behind. Only reconcile
            // that URL after native controls confirm no criteria remain; never reload.
            if (currentBoard() === origin && nativeFiltersActive() && nativePopover() && !nativeFiltersActive(true) &&
                new URLSearchParams(window.location.search).has('filter')) {
                var cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('filter');
                window.history.replaceState(window.history.state, '', cleanUrl.href);
                observedNativeQuery = window.location.search;
            }
            for (var attempt = 0; attempt < 15 && nativeFiltersActive(); attempt++) await pause(100);
            if (currentBoard() !== origin) return;
            if (nativeFiltersActive()) {
                throw new Error('Selections saved. Trello filters are still active; clear them in Trello to resume Attention.');
            }
            observedNativeQuery = window.location.search;
            if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
            await pause(0); callback(); apply();
        } catch (err) {
            if (currentBoard() === origin) notice(err.message || 'Could not import Trello filters.');
        } finally {
            switching = false;
            if (currentBoard() === origin) {
                if (panel) panel.find('[data-use-attention]').prop('disabled', false).text('Use Attention');
                apply();
            }
        }
    }

    // Capture the switch before React or jQuery applies a filter selection.
    document.addEventListener('click', function (event) {
        if (switching || !(event.target instanceof Element)) return;
        var target = event.target;
        var attentionInput = target.closest('#s4t-attention-panel input[type="checkbox"]');
        if (attentionInput && nativeFiltersActive()) {
            var desired = attentionInput.checked;
            var attribute = ['data-check', 'data-exclude-list', 'data-list-group', 'data-attention-member', 'data-attention-all-members', 'data-attention-all-labels', 'data-attention-label'].find(function (name) { return attentionInput.hasAttribute(name); });
            var value = attribute && attentionInput.getAttribute(attribute);
            event.preventDefault(); event.stopImmediatePropagation();
            switchToAttention(function () {
                var input = panel && panel.find('input[type="checkbox"]').filter(function () { return attribute && this.getAttribute(attribute) === value; })[0];
                if (input) { input.checked = desired; $(input).trigger('change'); }
            });
            return;
        }
        var nativeControl = target.closest('[data-testid="filter-popover-button"], [data-testid="board-filter-button"], [data-testid="filter-popover"] input, [data-testid="filter-popover"] [role="checkbox"], .js-select-member, .js-toggle-label-filter');
        if (nativeControl && outsideAttention(nativeControl) && active()) {
            if (!window.confirm('Use Trello filters and clear Attention?')) {
                event.preventDefault(); event.stopImmediatePropagation(); return;
            }
            clearFilters(); close(); notice('Attention filters cleared. Trello filters are in use.');
        }
    }, true);

    function clearFilters() {
        selected = []; excluded = []; memberFilters = []; labelFilters = []; matchAll = false;
        if (panel) panel.find('input[type="checkbox"]').prop('checked', false);
        apply();
        if (button) button.focus();
    }

    function compactLists(enabled) { s4tCompactAttentionLists(enabled); }

    function cardLayoutNodes(card) { return card ? [card] : []; }

    function hotfixLabelIds() {
        return data ? data.labels.filter(function (label) { return /\bhot[\s-]*fix\b/i.test(label.name || ''); }).map(function (label) { return label.id; }) : [];
    }
    function hasHotfixCheck() {
        return selected.some(function (key) { return ['hotfixToday', 'hotfix', 'hotfixDue'].indexOf(key) !== -1; });
    }
    function apply() {
        if (hasHotfixCheck() && labelFilters.length) {
            hotfixLabelIds().forEach(function (id) { if (labelFilters.indexOf(id) === -1) labelFilters.push(id); });
        }
        saveFilters();
        var nativeActive = (active() || panel) ? nativeFiltersActive() : false;
        nativeBlocked = active() && nativeActive;
        var filterActive = !!(active() && !nativeBlocked && data);
        var result = attentionResult(), index = result.index, count = result.count;
        var changed = false, hiddenNodes = new Set();
        (filterActive ? document.querySelectorAll(S4T_CARD_SEL) : []).forEach(function (el) {
            var link = el.matches('a[href*="/c/"]') ? el : el.querySelector('a[href*="/c/"]');
            var match = link && link.getAttribute('href').match(/\/c\/([A-Za-z0-9]+)/);
            // Unknown/new cards remain visible until refreshed; never guess from truncated DOM data.
            var hide = !!(match && index[match[1]] === false);
            if (hide) cardLayoutNodes(el).forEach(function (node) { hiddenNodes.add(node); });
        });
        // Reconcile previous wrappers too: Trello can move/reuse them after edits.
        document.querySelectorAll('.s4t-attention-hidden').forEach(function (node) {
            if (!hiddenNodes.has(node)) {
                node.classList.remove('s4t-attention-hidden');
                changed = true;
            }
        });
        hiddenNodes.forEach(function (node) {
            if (!node.classList.contains('s4t-attention-hidden')) {
                node.classList.add('s4t-attention-hidden');
                changed = true;
            }
        });
        compactLists(filterActive);
        document.body.classList.toggle('s4t-attention-active-filter', filterActive);
        if (changed) calcListPoints();
        if (button) {
            var label = active() ? 'Attention • ' + (selected.length + excluded.length + memberFilters.length + labelFilters.length) : 'Attention';
            if (nativeBlocked) label += ' (paused: Trello filters active)';
            button.attr('aria-label', label).attr('data-tooltip', label);
            button.toggleClass('s4t-attention-active', active());
            clearButton.prop('hidden', !active());
            controls.toggleClass('s4t-attention-active', active());
        }
        if (panel) {
            panel.find('.s4t-attention-comment-progress').prop('hidden', !commentLoading);
            panel.find('.s4t-attention-comment-names').prop('hidden', selected.indexOf('missingComments') === -1);
            panel.find('.s4t-attention-required-names').prop('hidden', selected.indexOf('missing') === -1);
            panel.find('[data-attention-label]').each(function () { this.checked = !labelFilters.length || labelFilters.indexOf(this.getAttribute('data-attention-label')) !== -1; });
            panel.find('[data-attention-member]').each(function () { this.checked = !memberFilters.length || memberFilters.indexOf(this.getAttribute('data-attention-member')) !== -1; });
            panel.find('[data-attention-all-labels]').prop('checked', labelFilters.length === 0).prop('indeterminate', labelFilters.length > 0 && labelFilters.indexOf('__empty__') === -1);
            panel.find('[data-attention-all-members]').prop('checked', memberFilters.length === 0).prop('indeterminate', memberFilters.length > 0 && memberFilters.indexOf('__empty__') === -1);
            panel.find('[data-check]').each(function () { this.checked = selected.indexOf(this.getAttribute('data-check')) !== -1; });
            renderLists();
            updateListGroups();
            var matchHint = matchAll ? 'Match every selected option (imported exact match).' : 'Match any selected option.';
            var memberHint = memberFilters.indexOf('__empty__') !== -1 ? 'NOTE: - No members selected.' : memberFilters.length ? matchHint : 'All members and unassigned cards are included.';
            var labelHint = labelFilters.indexOf('__empty__') !== -1 ? 'NOTE: - No labels selected.' : labelFilters.length ? matchHint : 'All labels and unlabeled cards are included.';
            panel.find('.s4t-label-match-hint').toggleClass('s4t-attention-note', labelFilters.indexOf('__empty__') !== -1).attr('role', 'status').each(function () { if (this.textContent !== labelHint) this.textContent = labelHint; });
            panel.find('.s4t-member-match-hint').toggleClass('s4t-attention-note', memberFilters.indexOf('__empty__') !== -1).attr('role', 'status').each(function () { if (this.textContent !== memberHint) this.textContent = memberHint; });
            var paused = nativeActive || switching;
            var showPrompt = nativeActive && !switching;
            var showSkeleton = switching || (loading && !showPrompt) || (!data && !error && !showPrompt);
            var columns = panel.find('.s4t-attention-columns');
            columns.toggleClass('s4t-loading-surface', showSkeleton).attr('aria-busy', String(showSkeleton)).attr('inert', showSkeleton ? '' : null);
            var focusWasInPrompt = panel.find('.s4t-attention-conflict')[0].contains(document.activeElement);
            panel.toggleClass('s4t-attention-paused', paused);
            panel.find('.s4t-attention-conflict').prop('hidden', !showPrompt);
            panel.find('.s4t-attention-pause-message').prop('hidden', !paused);
            columns.prop('hidden', showPrompt || (!data && !!error && !switching));
            panel.find('.s4t-attention-count').prop('hidden', paused || !data);
            if (!paused && focusWasInPrompt) panel.find('.s4t-attention-columns input:not(:disabled)').first().trigger('focus');
            var status = error || commentError || (commentLoading ? 'Checking comment headings… Other filters are ready to use.' : '');
            var statusEl = panel.find('.s4t-attention-status');
            if (statusEl.text() !== status) statusEl.text(status);
            statusEl.prop('hidden', !status);
            var countText = data && !nativeBlocked ? count + ' matching cards' : '';
            if (panel.find('.s4t-attention-count').text() !== countText) panel.find('.s4t-attention-count').text(countText);
            panel.find('[data-refresh]').prop('disabled', loading).toggleClass('s4t-refreshing', loading).attr('aria-busy', String(loading));
        }
    }

    function validate(result) {
        if (!result || !Array.isArray(result.cards) || !Array.isArray(result.lists) ||
            !Array.isArray(result.checklists) || !Array.isArray(result.members) || !Array.isArray(result.labels)) return false;
        var ids = {};
        result.checklists.forEach(function (list) { ids[list.id] = Array.isArray(list.checkItems); });
        return result.cards.every(function (card) {
            return typeof card.desc === 'string' && typeof card.shortLink === 'string' &&
                typeof card.idList === 'string' && Array.isArray(card.idMembers) &&
                Array.isArray(card.idLabels) &&
                Array.isArray(card.idChecklists) && card.idChecklists.every(function (id) { return ids[id]; });
        });
    }

    function loadComments() {
        if (!data || commentLoading || data.s4tCommentsLoaded) return;
        var snapshot = data, token = ++commentRequest, requestedBoard = board;
        commentLoading = true; commentError = ''; apply();
        s4tLoadAttentionComments(snapshot.cards, function (id, before) {
            var params = {filter:'commentCard',limit:1000,fields:'id,data',memberCreator:false};
            if (before) params.before = before;
            return $.ajax({url:'/1/cards/' + encodeURIComponent(id) + '/actions',data:params,dataType:'json',timeout:20000,cache:false,xhrFields:{withCredentials:true}});
        }, function () { return token === commentRequest && data === snapshot && currentBoard() === requestedBoard; }, commentCache)
        .then(function () {
            if (token !== commentRequest || data !== snapshot) return;
            data = Object.assign({}, snapshot, {s4tCommentsLoaded:true});
        }, function () {
            if (token === commentRequest) commentError = 'Could not load comments. Comment checking is paused; try Refresh.';
        }).finally(function () {
            if (token !== commentRequest) return;
            commentLoading = false; apply();
        });
    }

    function fetchData() {
        if (!board || loading) return;
        var token = ++request, requestedBoard = board;
        loading = true; error = ''; commentError = ''; commentRequest++; commentLoading = false; apply();
        function finish(result) {
            if (token !== request || currentBoard() !== requestedBoard) return;
            loading = false;
            if (validate(result)) {
                data = result;
                refreshed = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
                error = 'Could not load complete card/checklist data. ' +
                    (data ? 'Previous results remain active. ' : 'No cards have been hidden. ') + 'Try Refresh.';
            }
            renderLists(); renderPeopleAndLabels(); apply();
            if (data && selected.includes('missingComments')) loadComments();
            dataWaiters.splice(0).forEach(function (callback) { callback(error ? new Error(error) : null, error ? null : data); });
        }
        function fallback() {
            $.ajax({
                url: '/b/' + requestedBoard + '.json', dataType: 'json', timeout: 20000,
                xhrFields: { withCredentials: true }
            }).done(finish).fail(function () { finish(null); });
        }
        $.ajax({
            url: '/1/boards/' + requestedBoard,
            data: {
                cards: 'open', card_fields: 'name,desc,idList,idMembers,idLabels,idChecklists,shortLink,closed,due,dueComplete,badges,dateLastActivity',
                members: 'all', member_fields: 'fullName,username,initials', labels: 'all', label_fields: 'name,color',
                lists: 'open', list_fields: 'name,closed', checklists: 'all', fields: 'name'
            },
            dataType: 'json', timeout: 20000, xhrFields: { withCredentials: true }
        }).done(function (result) { if (validate(result)) finish(result); else fallback(); }).fail(fallback);
    }

    function groupLists(group) {
        var pattern = group === 'todo' ? /\bto[\s-]*do\b/i : /\bnot[\s-]+sure\b/i;
        return data ? s4tAttentionMemberLists(data, memberFilters, matchAll).filter(function (list) { return pattern.test(list.name); }) : [];
    }

    function updateListGroups() {
        if (!panel) return;
        panel.find('[data-list-group]').each(function () {
            var lists = groupLists(this.getAttribute('data-list-group'));
            var checked = lists.filter(function (list) { return excluded.indexOf(list.id) !== -1; }).length;
            this.checked = lists.length > 0 && checked === lists.length;
            this.indeterminate = checked > 0 && checked < lists.length;
            this.disabled = lists.length === 0;
        });
    }

    function renderLists() {
        if (!panel) return;
        var container = panel.find('.s4t-attention-lists');
        var availableLists = data ? s4tAttentionMemberLists(data, memberFilters, matchAll) : [];
        var noMembers = memberFilters.indexOf('__empty__') !== -1;
        var signature = data ? JSON.stringify([availableLists, noMembers]) : 'loading';
        if (container.data('choices') === signature) return;
        container.data('choices', signature);
        var scroll = container.parent()[0].scrollTop;
        container.empty();
        var groups = panel.find('.s4t-attention-list-groups').not('.s4t-attention-member-group, .s4t-attention-label-group').empty();
        if (!data) { container.html('<div class="s4t-attention-skeleton" aria-hidden="true"></div>'); return; }
        [{ key: 'todo', name: 'All Todo lists' }, { key: 'not-sure', name: 'All Not Sure lists' }].forEach(function (group) {
            var description = group.name + ' (' + groupLists(group.key).length + ')';
            var input = $('<input type="checkbox">').attr({ 'data-list-group': group.key, 'aria-label': description });
            input.on('change', function () {
                var ids = groupLists(group.key).map(function (list) { return list.id; });
                excluded = excluded.filter(function (id) { return ids.indexOf(id) === -1; });
                if (this.checked) excluded = excluded.concat(ids);
                panel.find('[data-exclude-list]').each(function () {
                    this.checked = excluded.indexOf(this.getAttribute('data-exclude-list')) !== -1;
                });
                apply();
            });
            $('<label class="s4t-attention-group-toggle">').attr('data-tooltip', description).append(input)
                .on('mousedown pointerdown', function () { $(this).addClass('s4t-tooltip-dismissed'); })
                .on('mouseleave focusout', function () { $(this).removeClass('s4t-tooltip-dismissed'); })
                .appendTo(groups);
        });
        if (noMembers) container.append($('<p class="s4t-attention-list-message s4t-attention-note" role="status">').text('NOTE: - No members selected. Select a member to see available lists.'));
        else if (!availableLists.length) container.append($('<p class="s4t-attention-list-message s4t-attention-note" role="status">').text('No lists found for the selected members.'));
        availableLists.forEach(function (list) {
            var input = $('<input type="checkbox">').attr('data-exclude-list', list.id).prop('checked', excluded.indexOf(list.id) !== -1);
            input.on('change', function () {
                excluded = excluded.filter(function (id) { return id !== list.id; });
                if (this.checked) excluded.push(list.id);
                apply();
            });
            $('<label class="s4t-attention-option">').append(input, $('<span>').text(list.name)).appendTo(container);
        });
        container.parent()[0].scrollTop = scroll;
        updateListGroups();
    }

    function renderPeopleAndLabels() {
        if (!panel) return;
        var people = panel.find('.s4t-attention-members'), labels = panel.find('.s4t-attention-labels');
        var signature = data ? JSON.stringify([data.members, data.labels]) : 'loading';
        if (people.data('choices') === signature) return;
        people.data('choices', signature);
        var peopleScroll = people.parent()[0].scrollTop, labelScroll = labels.parent()[0].scrollTop;
        people.empty(); labels.empty();
        if (!data) { people.add(labels).html('<div class="s4t-attention-skeleton" aria-hidden="true"></div>'); return; }
        function choice(container, entry, kind) {
            var values = kind === 'member' ? memberFilters : labelFilters;
            var input = $('<input type="checkbox">').attr('data-attention-' + kind, entry.id).prop('checked', !values.length || values.indexOf(entry.id) !== -1);
            input.on('change', function () {
                var next = (kind === 'member' ? memberFilters : labelFilters).filter(function (id) { return id !== entry.id; });
                if (this.checked) next.push(entry.id);
                if (kind === 'member') memberFilters = s4tToggleMembers(memberFilters, entry.id, this.checked, data.members.map(function (member) { return member.id; }), matchAll); else {
                    labelFilters = s4tToggleLabels(labelFilters, entry.id, this.checked, data.labels.map(function(label) { return label.id; }), matchAll);
                    if (!this.checked && hotfixLabelIds().indexOf(entry.id) !== -1) {
                        selected = selected.filter(function (key) { return ['hotfixToday', 'hotfix', 'hotfixDue'].indexOf(key) === -1; });
                    }
                }
                apply();
            });
            var row = $('<label class="s4t-attention-option">').append(input);
            if (kind === 'label') {
                var color = (entry.color || '').split('_')[0];
                var colors = { green: '#4bce97', yellow: '#f5cd47', orange: '#fea362', red: '#f87168', purple: '#9f8fef', blue: '#579dff', sky: '#6cc3e0', lime: '#94c748', pink: '#e774bb', black: '#8590a2' };
                row.append($('<span class="s4t-attention-label-dot" aria-hidden="true">').css('background-color', colors[color] || '#8590a2'));
            }
            row.append($('<span>').text(kind === 'member' ? (entry.fullName || entry.username || 'Member') : (entry.name || (entry.color ? entry.color.replace(/_/g, ' ') + ' (unnamed)' : 'Unnamed label'))));
            container.append(row);
        }
        var allMembers = $('<input type="checkbox" data-attention-all-members aria-label="All members">').prop('checked', memberFilters.length === 0).on('change', function () {
            memberFilters = this.checked ? [] : ['__empty__'];
            apply();
        });
        panel.find('.s4t-attention-member-group').empty().append(
            $('<label class="s4t-attention-group-toggle" data-tooltip="All members">').append(allMembers)
                .on('mousedown pointerdown', function () { $(this).addClass('s4t-tooltip-dismissed'); })
                .on('mouseleave focusout', function () { $(this).removeClass('s4t-tooltip-dismissed'); })
        );
        var allLabels = $('<input type="checkbox" data-attention-all-labels aria-label="All labels">').on('change', function() {
            labelFilters = this.checked ? [] : ['__empty__'];
            if (!this.checked) selected = selected.filter(function(key) { return ['hotfixToday', 'hotfix', 'hotfixDue'].indexOf(key) === -1; });
            apply();
        });
        panel.find('.s4t-attention-label-group').empty().append(
            $('<label class="s4t-attention-group-toggle" data-tooltip="All labels">').append(allLabels)
                .on('mousedown pointerdown', function() { $(this).addClass('s4t-tooltip-dismissed'); })
                .on('mouseleave focusout', function() { $(this).removeClass('s4t-tooltip-dismissed'); })
        );
        data.members.slice().sort(function (a, b) { return (a.fullName || a.username || '').localeCompare(b.fullName || b.username || ''); }).forEach(function (member) { choice(people, member, 'member'); });
        data.labels.slice().sort(function (a, b) { return (a.name || a.color || '').localeCompare(b.name || b.color || ''); }).forEach(function (label) { choice(labels, label, 'label'); });
        choice(people, { id: '__none__', fullName: 'Unassigned cards' }, 'member');
        choice(labels, { id: '__none__', name: 'No labels' }, 'label');
        if (!people.children().length) people.text('No board members.');
        if (!labels.children().length) labels.text('No board labels.');
        people.parent()[0].scrollTop = peopleScroll; labels.parent()[0].scrollTop = labelScroll;
    }

    function open() {
        resetBoard();
        if (panel) { close(); return; }
        panel = $('<section id="s4t-attention-panel" role="dialog" aria-label="Attention filters">');
        var heading = $('<div class="s4t-attention-heading">').append(
            $('<div class="s4t-feature-title">').append($('<strong class="s4t-attention-title">').text('Attention'), s4tFeatureHelp('Attention', 'Find missing card details and hotfixes needing review.', 'Scope, points, hotfix and checklist checks; member, label and list filters.', 'Narrow the board without opening every card.', 'Select checks, then narrow by member or label. Exclude lists as needed; Clear filters restores the view.')),
            $('<span class="s4t-attention-pause-message" role="status" hidden>').text('Attention is paused while Trello filters are active. Use Attention to switch.'),
            $('<span class="s4t-attention-count">')
        );
        var header = $('<div class="s4t-attention-header">').append(heading);
        var headerActions = $('<div class="s4t-attention-header-actions">');
        headerActions.append($('<button type="button" data-refresh aria-label="Refresh Attention" data-tooltip="Refresh">').html(s4tRefreshIcon()).on('click', fetchData));
        headerActions.append($('<button type="button">').text('Clear filters').on('click', clearFilters));
        headerActions.append($('<button type="button" aria-label="Close attention panel" data-tooltip="Close">').text('✕').on('click', close));
        header.append(headerActions);
        panel.append(header);
        panel.append($('<p class="s4t-attention-status" role="status" hidden>'));
        panel.append($('<div class="s4t-attention-conflict" hidden>').append($('<div class="s4t-attention-switch-prompt">').append(
            $('<span>').text('Trello filters are active. Import members and labels into Attention before clearing them. '),
            $('<button type="button" data-use-attention>').text('Use Attention').on('click', function () { switchToAttention(function () { }); }))));
        var columns = $('<div class="s4t-attention-columns">');
        var checks = $('<div>').append($('<h3>').text('Find cards needing attention'),
            $('<p>').text('Match any selected check, plus the chosen members and labels.'));
        function option(key, label, tooltip) {
            var input = $('<input type="checkbox">').attr('data-check', key).prop('checked', selected.indexOf(key) !== -1);
            input.on('change', function () {
                selected = selected.filter(function (value) { return value !== key; });
                if (this.checked) {
                    selected.push(key);
                    if (['hotfixToday', 'hotfix', 'hotfixDue'].indexOf(key) !== -1) {
                        labelFilters = labelFilters.filter(function(id) { return id !== '__empty__'; });
                        hotfixLabelIds().forEach(function(id) { if (labelFilters.indexOf(id) === -1) labelFilters.push(id); });
                    }
                }
                if (!this.checked && ['hotfixToday', 'hotfix', 'hotfixDue'].indexOf(key) !== -1 && !hasHotfixCheck()) {
                    var linkedIds = hotfixLabelIds();
                    labelFilters = labelFilters.filter(function (id) { return linkedIds.indexOf(id) === -1; });
                }
                apply();
                if (key === 'missingComments' && this.checked) { if (data) loadComments(); else fetchData(); }
            });
            var row = $('<label class="s4t-attention-option">').append(input, $('<span>').text(label));
            if (tooltip) row.append($('<span class="s4t-attention-info" tabindex="0" aria-label="Completion filter details">').attr('data-tooltip', tooltip).text('ⓘ'));
            checks.append(row);
        }
        option('scope', 'Missing Scope', 'description is missing');
        option('estimate', 'Missing Assigned Points', 'assigned points missing');
        option('missingCompleted', 'Missing Completed Points', 'completed points missing');
        option('pointsMismatch', 'Points mismatch', 'Assigned and completed points differ. Excludes cards missing either or both values. Zero(0) counts as a value.');
        // option('unassigned', 'Unassigned — no member'); // we already have this in members selection
        checks.append($('<h4>').text('Hotfix'));
        option('hotfixToday', "Today's Hotfix", 'due date/time is of today');
        option('hotfix', 'All Hotfix Cards', 'includes past, present, and future due dates');
        option('hotfixDue', 'Already Due Hotfix cards', 'due date/time is past');
        checks.append($('<h4>').text('Checklists'));
        option('incomplete', 'Unchecked Items Remain', 'Checklist Items and Amazing Fields');
        option('complete', 'All Items Complete', 'Checklist Items and Amazing Fields');
        option('missing', 'Missing checklists');
        var requiredFields = $('<div class="s4t-attention-required-names" hidden>');
        requiredFields.append($('<label for="s4t-attention-names">').text('Required checklist names (new lines or commas)'));
        requiredFields.append($('<textarea id="s4t-attention-names" rows="3" placeholder="Development\nTesting">').val(required).on('input', function () {
            required = this.value;
            try { localStorage.setItem(storageKey(), required); } catch (_) { /* Session still works. */ }
            apply();
        }));
        requiredFields.append($('<p>').text('Shows cards missing at least one name. Case and extra spaces are ignored. Leave blank for cards with no checklists.'));
        checks.append(requiredFields);
        checks.append($('<h4>').text('Comments'));
        option('missingComments', 'Missing required comments', 'Missing at least one required H1, H2 or H3 comment heading. Case-insensitive; comments only.');
        var commentFields = $('<div class="s4t-attention-comment-names" hidden>');
        commentFields.append($('<div class="s4t-attention-comment-progress" aria-hidden="true" hidden>'));
        commentFields.append($('<label for="s4t-attention-comment-names">').text('Required comment headings (new lines or commas)'));
        commentFields.append($('<textarea id="s4t-attention-comment-names" rows="3" placeholder="Tech Design, Test Cases, Branch">').val(requiredComments).on('input', function () {
            requiredComments = this.value;
            try { localStorage.setItem('s4t-attention-comment-names-' + board, requiredComments); } catch (_) {}
            apply();
        }));
        commentFields.append($('<p>').text('Shows cards missing any listed heading across their comments. H1–H3 only; case and extra spaces ignored. Enter at least one name.'));
        checks.append(commentFields);
        var lists = $('<div>').append(
            $('<div class="s4t-attention-column-heading">').append($('<h3>').text('Exclude lists'), $('<div class="s4t-attention-list-groups">')),
            $('<p>').text('Cards in checked lists are hidden, regardless of the selected checks.'),
            $('<div class="s4t-attention-lists">'));
        var membersColumn = $('<div>').append($('<div class="s4t-attention-column-heading">').append($('<h3>').text('Members'), $('<div class="s4t-attention-list-groups s4t-attention-member-group">')), $('<p class="s4t-member-match-hint">').text('Match any selected member.'), $('<div class="s4t-attention-members">'));
        var labelsColumn = $('<div>').append($('<div class="s4t-attention-column-heading">').append($('<h3>').text('Labels'), $('<div class="s4t-attention-list-groups s4t-attention-label-group">')), $('<p class="s4t-label-match-hint">').text('Match any selected label.'), $('<div class="s4t-attention-labels">'));
        columns.append(checks, membersColumn, lists, labelsColumn); panel.append(columns);
        $('body').append(panel);
        button.attr('aria-expanded', 'true');
        renderLists(); renderPeopleAndLabels(); apply(); fetchData();
        panel.find('button').first().focus();
    }

    function sync() {
        resetBoard();
        if (!board) { if (controls) controls.remove(); if (cardsButton) cardsButton.remove(); controls = null; cardsButton = null; button = null; clearButton = null; return; }
        updateBurndownLink();
        var anchor = document.getElementById('membersBurndownLink');
        if (!button) {
            button = $('<button type="button" id="s4t-attention-button" aria-haspopup="dialog" aria-expanded="false" data-tooltip="Filter cards needing attention">')
                .append(attentionIcon()).on('click', open);
            clearButton = $('<button type="button" id="s4t-attention-clear" data-tooltip="Clear all Attention filters" aria-label="Clear all Attention filters" hidden>')
                .text('✕').on('click', clearFilters);
            controls = $('<div id="s4t-attention-controls">').append(button, clearButton);
            cardsButton = $('<button type="button" id="s4t-cards-launch" data-tooltip="Cards List and Slack preview" aria-label="Cards List and Slack preview">')
                .append('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h7M7 8h.01M7 12h.01M7 16h.01"/></svg>')
                .on('click', function () {
                    close();
                    s4tOpenCardsList({
                        board: board, load: function (callback) {
                            dataWaiters.push(callback); fetchData();
                        }, selection: function () {
                            if (!data) return { ids: [], source: 'Board cards' };
                            if (nativeFiltersActive()) {
                                var visible = [];
                                document.querySelectorAll(S4T_CARD_SEL).forEach(function (node) {
                                    if (!node.getClientRects().length || node.closest('[hidden], [aria-hidden="true"]')) return;
                                    var style = window.getComputedStyle(node);
                                    if (style.visibility === 'hidden' || style.display === 'none') return;
                                    var link = node.matches('a[href*="/c/"]') ? node : node.querySelector('a[href*="/c/"]');
                                    var match = link && link.getAttribute('href').match(/\/c\/([A-Za-z0-9]+)/);
                                    if (match) visible.push(match[1]);
                                });
                                return s4tCardsNativeSelection(data, new URLSearchParams(window.location.search).get('filter') || '', visible);
                            }
                            return { source: active() ? 'Attention filters' : 'All board cards', ids: attentionResult().ids };
                        }
                    });
                });
        }
        if (anchor && anchor.getClientRects().length) {
            controls.removeClass('s4t-attention-floating');
            cardsButton.removeClass('s4t-cards-floating');
            if (anchor.previousElementSibling !== cardsButton[0]) $(anchor).before(cardsButton);
            if (cardsButton[0].previousElementSibling !== controls[0]) cardsButton.before(controls);
        } else {
            // Do not show temporary floating actions while Trello is loading its header.
            controls.detach();
            cardsButton.detach();
        }
        apply();
        if (active() && !data && !loading && !error) fetchData();
    }
    document.addEventListener('s4t-checklist-updated', function () { if (data) fetchData(); });
    window.addEventListener('popstate', sync);
    // Trello's keyboard shortcuts can change native filters without clicking its popover.
    var observedNativeQuery = window.location.search;
    setInterval(function () {
        var query = window.location.search;
        if (query === observedNativeQuery) return;
        observedNativeQuery = query;
        if (/^\/c\//.test(window.location.pathname)) return;
        if (!switching && board === currentBoard() && active() && nativeFiltersActive()) {
            clearFilters(); close(); notice('Attention filters cleared because Trello filters changed.');
        }
        sync();
    }, 500);
    new MutationObserver(function (mutations) {
        if (active() && !nativeBlocked && data && currentBoard() === board) {
            var index = attentionResult().index;
            mutations.forEach(function (mutation) {
                var roots = mutation.type === 'attributes' ? [mutation.target] : Array.from(mutation.addedNodes);
                roots.forEach(function (root) {
                    if (root.nodeType !== 1 || root.closest('#s4t-attention-panel, #s4t-cards-overlay, #s4t-modal-overlay')) return;
                    if (mutation.type === 'attributes' && !root.closest(S4T_CARD_SEL)) return;
                    var cards = Array.from(root.querySelectorAll(S4T_CARD_SEL));
                    if (root.matches(S4T_CARD_SEL)) cards.push(root);
                    var parentCard = root.closest(S4T_CARD_SEL); if (parentCard) cards.push(parentCard);
                    cards.forEach(function (card) {
                        var link = card.matches('a[href*="/c/"]') ? card : card.querySelector('a[href*="/c/"]');
                        var match = link && (link.getAttribute('href') || '').match(/\/c\/([A-Za-z0-9]+)/);
                        var hidden = !!(match && index[match[1]] === false);
                        if (card.classList.contains('s4t-attention-hidden') !== hidden) card.classList.toggle('s4t-attention-hidden', hidden);
                    });
                });
            });
        }
        if (mutations.every(function (mutation) { return mutation.type === 'attributes'; })) return;
        if (mutations.every(function (mutation) {
            return $(mutation.target).closest('.s4t-comment-navigator, #s4t-attention-panel, #s4t-board-tools, #s4t-cards-overlay, #s4t-modal-overlay, #s4t-icon-tooltip, #s4t-attention-notice, [role="dialog"], .window, .card-detail-window, [data-testid="card-back"], [data-testid="card-back-container"]').length > 0;
        })) return;
        if (!observerTimer) observerTimer = setTimeout(function () {
            observerTimer = null;
            sync();
        }, 250);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'href'] });
    document.addEventListener('keydown', function (event) {
        if (!active() || nativeBlocked || !data || !/^\/c\//.test(location.pathname) || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="menu"],[role="listbox"],[id^="s4t-"]')) return;
        var current = location.pathname.match(/^\/c\/([A-Za-z0-9]+)/), index = attentionResult().index;
        var links = Array.from(document.querySelectorAll(S4T_CARD_SEL)).map(function (card) { return card.matches('a[href*="/c/"]') ? card : card.querySelector('a[href*="/c/"]'); }).filter(Boolean);
        var seen = new Set();
        links = links.filter(function (link) { var match = (link.getAttribute('href') || '').match(/\/c\/([A-Za-z0-9]+)/); if (!match || seen.has(match[1])) return false; seen.add(match[1]); return true; });
        var position = links.findIndex(function (link) { return (link.getAttribute('href') || '').split('/c/')[1].split('/')[0] === current[1]; });
        // Block Trello's unfiltered navigation even at the end of the filtered set.
        event.preventDefault(); event.stopImmediatePropagation();
        if (position < 0) return;
        var step = event.key === 'ArrowRight' ? 1 : -1;
        for (var next = position + step; next >= 0 && next < links.length; next += step) {
            var id = links[next].getAttribute('href').match(/\/c\/([A-Za-z0-9]+)/)[1];
            if (index[id] === true) { links[next].click(); return; }
        }
    }, true);
    $(document).on('keydown.s4tAttention', function (event) {
        if (event.key === 'Escape' && panel) { close(); if (button) button.focus(); }
    }).on('mousedown.s4tAttention', function (event) {
        if (panel && !$(event.target).closest('#s4t-attention-panel, #s4t-attention-controls, #s4t-cards-launch, #s4t-icon-tooltip').length) close();
    });
    sync();
})();

// Group selected cards only; multi-member and multi-label cards appear in each matching group.
function s4tGroupCards(cards, board, mode) {
    var groups = [], index = new Map();
    function addGroup(id, name) { var group = {name: name, cards: []}; groups.push(group); index.set(id, group); }
    var definitions = mode === 'labels' ? board.labels : mode === 'lists' ? board.lists : board.members;
    (definitions || []).forEach(function (item) {
        addGroup(item.id, mode === 'dev' ? '@' + (item.fullName || item.username) : item.name || (mode === 'labels' ? (item.color || 'Unnamed') + ' label' : 'Unnamed list'));
    });
    var fallback = {name: mode === 'labels' ? 'No labels' : mode === 'lists' ? 'Unknown list' : 'Unassigned', cards: []};
    cards.forEach(function (card) {
        var ids = mode === 'labels' ? (card.idLabels || (card.labels || []).map(function (label) { return label.id; })) : mode === 'lists' ? [card.idList] : (card.idMembers || []);
        var matched = false;
        new Set(ids).forEach(function (id) {
            if (!index.has(id) && mode === 'labels') {
                var label = (card.labels || []).find(function (item) { return item.id === id; });
                if (label) addGroup(id, label.name || (label.color || 'Unnamed') + ' label');
            }
            var group = index.get(id); if (group) { group.cards.push(card); matched = true; }
        });
        if (!matched) fallback.cards.push(card);
    });
    groups.push(fallback);
    return groups.filter(function (group) { return group.cards.length; });
}

/* Cards List: adapted from Klimb-trello-burndown's Cards List workflow and editor. */
var s4tOpenCardsList = (function () {
    if (typeof document === 'undefined') return function () { };
    var state, overlay, context, editor, boardData, burndownData = {}, loadToken = 0;
    function escapeHtml(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function showSheetSuccessToast(message) {
        if (!overlay) return;
        var current = overlay;
        clearTimeout(state.statusTimer);
        current.find('.s4t-cards-status').text(message).prop('hidden', !message);
        if (message) {
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            state.statusTimer = setTimeout(function () { current.find('.s4t-cards-status').prop('hidden',true); },3500);
        }
    }
    function button(text, handler, attrs) { return $('<button type="button">').text(text).attr(attrs || {}).on('click', handler); }
    function selectedCards() { return candidates().filter(function (c) { return !state.excludedCardIds.has(c.id); }); }
    function cleanTitle(title) { return title.replace(/[([{]\s*(?:\?|\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:pts?|points?)?\s*[)\]}]/gi, ' ').replace(/\s+/g, ' ').trim() || title; }
    function candidates() {
        if (!boardData) return [];
        var selection = state.selection || { ids: [] };
        var cached = state.candidateCache;
        if (cached && cached.board === boardData && cached.selection === selection && cached.search === state.search && cached.excludeNotSure === state.excludeNotSure) return cached.cards;
        var search = (state.search || '').toLowerCase();
        var allowed = new Set(selection.ids);
        var excludedLists = new Set(state.excludeNotSure ? boardData.lists.filter(function (list) { return /\bnot[\s_-]*sure\b/i.test(list.name); }).map(function (list) { return list.id; }) : []);
        var memberIds = boardData.members.map(function (member) { return member.id; });
        var cards = boardData.cards.filter(function (card) {
            // These shared housekeeping cards stay excluded even as board membership changes.
            if (s4tIsCommonCard(card)) return false;
            var assignedToEveryone = memberIds.length > 0 && memberIds.every(function (id) {
                return (card.idMembers || []).indexOf(id) !== -1;
            });
            return !card.closed && !assignedToEveryone && allowed.has(card.id) && !excludedLists.has(card.idList) &&
                (!search || card.name.toLowerCase().includes(search));
        });
        state.candidateCache = { board: boardData, selection: selection, search: state.search, excludeNotSure: state.excludeNotSure, cards: cards };
        return cards;
    }
    function generateMissingEstimatesSlackText() {
        if (!boardData) return '';
        var groups = s4tGroupCards(selectedCards(), boardData, state.groupBy || 'dev');
        var suffix = ' cards:';
        return groups.filter(function (g) { return g.cards.length; }).map(function (g) {
            return g.name + suffix + '\n' + g.cards.map(function (c) {
                var title = cleanTitle(c.name), url = 'https://trello.com/c/' + c.shortLink;
                var names = state.groupBy === 'labels' && state.includeDevelopers ? Array.from(new Set(c.idMembers || [])).map(function (id) {
                    var member = boardData.members.find(function (m) { return m.id === id; });
                    return member && (state.mentionDevelopers ? '@' : '') + (member.fullName || member.username);
                }).filter(Boolean).join(', ') : '';
                return '• ' + (state.format === 'links' ? url : state.format === 'titles' ? title : title + ': ' + url) + (names ? ' — ' + names : '');
            }).join('\n');
        }).join('\n\n');
    }
    function changedSelection(keepRows) {
        if (!keepRows) renderCards();
        else {
            var cards = candidates();
            overlay.find('.s4t-cards-count').text(selectedCards().length + ' selected / ' + cards.length + ' cards');
        }
        if (!state.hasUserEditedPreview && state.tab === 'preview') renderMissingEstimatesPreview();
        else if (state.hasUserEditedPreview) showSheetSuccessToast('Draft preserved. Use the rebuild icon in Slack preview to update it from your selection.');
    }
    function renderCards() {
        var list = $('<div>'), cards = candidates();
        overlay.find('.s4t-cards-count').text(cards.filter(function (c) { return !state.excludedCardIds.has(c.id); }).length + ' selected / ' + cards.length + ' cards');
        var listsById = new Map(boardData.lists.map(function (list) { return [list.id, list]; }));
        var membersById = new Map(boardData.members.map(function (member, index) { return [member.id, { member: member, order: index }]; }));
        cards.forEach(function (c) {
            var input = $('<input type="checkbox">').attr({ 'data-card-id': c.id, 'aria-label': 'Select ' + c.name }).prop('checked', !state.excludedCardIds.has(c.id)).on('change', function () {
                if (this.checked) state.excludedCardIds.delete(c.id); else state.excludedCardIds.add(c.id);
                changedSelection(true);
            });
            var row = $('<div class="s4t-cards-item">').append(input);
            var details = $('<div class="s4t-cards-details">').append($('<span class="s4t-cards-card-title">').text(c.name));
            var link = $('<a class="s4t-cards-icon-button" target="_blank" rel="noopener noreferrer" data-tooltip="Open card in new tab">')
                .attr({ 'href': 'https://trello.com/c/' + c.shortLink, 'aria-label': 'Open ' + c.name + ' in new tab' })
                .html('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M14 3h7v7M21 3 10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/></svg>');
            var cardList = listsById.get(c.idList);
            var members = Array.from(new Set(c.idMembers || [])).map(function (id) { return membersById.get(id); }).filter(Boolean).sort(function (a, b) { return a.order - b.order; }).map(function (entry) { return entry.member.fullName || entry.member.username; });
            details.append($('<small>').text((cardList ? cardList.name : '') + ' · ' + (members.join(', ') || 'Unassigned')));
            row.append(details, link); list.append(row);
        });
        if (!cards.length) list.append($('<p>').text('No cards match these selections.'));
        overlay.find('.s4t-cards-items').empty().append(list.children());
    }
    function setLoading(value, previewOnly) {
        state.loading = value;
        overlay.find('.s4t-cards-items, [data-cards-pane="preview"]').each(function() {
            if (!value || !previewOnly || this.matches('[data-cards-pane="preview"]')) s4tSetSkeleton(this, value);
        });
        overlay.find('.s4t-cards-toolbar').attr('inert', value ? '' : null);
        overlay.find('[data-cards-resync]').prop('disabled', value).toggleClass('s4t-refreshing', value).attr('aria-busy', String(value));
        overlay.find('[data-cards-copy], select[data-preview-only], [data-cards-group], [data-add-developers] input, [data-mention-developers] input, [data-cards-exclude-not-sure] input').prop('disabled', value);
        if (value) hideSlackMentionAutocomplete();
    }
    function load() {
        var token = ++loadToken;
        setLoading(true);
        function finish(err, result) {
            if (token !== loadToken) return;
            try {
                if (err || !result) { showSheetSuccessToast('Could not refresh cards. Try again.'); return; }
                boardData = result;
                var nextSelection = context.selection();
                var selectionKey = JSON.stringify(nextSelection.ids.slice().sort());
                if (state.selectionKey && state.selectionKey !== selectionKey) {
                    state.search = ''; state.excludedCardIds.clear();
                    overlay.find('.s4t-cards-toolbar input[type="search"]').val('');
                }
                state.selectionKey = selectionKey;
                state.selection = nextSelection;

                if (state.selection.limited) showSheetSuccessToast('Using loaded cards. Scroll the board and refresh to include more.');
                state.developers = result.members.map(function (m) { return { name: m.fullName || m.username }; });
                changedSelection();
                if (!state.hasUserEditedPreview) showSheetSuccessToast('');
            } catch (_) { showSheetSuccessToast('Could not refresh cards. Try again.'); }
            finally { setLoading(false); }
        }
        try { context.load(finish); } catch (_) { finish(new Error('Could not load cards')); }
    }
    function rebuildPreview() {
        if (state.loading) return;
        var token = ++loadToken;
        setLoading(true, true);
        // Yield to paint the skeleton before rebuilding a potentially large message.
        requestAnimationFrame(function() { setTimeout(function() {
            if (token !== loadToken) return;
            try { regenerateSlackPreviewText(); }
            finally { setLoading(false); }
        }, 0); });
    }
    function close() { if (overlay) overlay.prop('hidden', true); hideSlackMentionAutocomplete(); document.getElementById('s4t-cards-launch')?.focus(); }
    function switchTab(tab) {
        state.tab = tab;
        overlay.find('[data-preview-only]').prop('hidden', tab !== 'preview');
        var refreshLabel = tab === 'preview' ? 'Rebuild preview from selected cards' : 'Refresh filtered cards';
        overlay.find('[data-cards-resync]').attr({ 'aria-label': refreshLabel, 'data-tooltip': refreshLabel });
        overlay.find('[data-cards-pane]').prop('hidden', true);
        overlay.find('[data-cards-pane="' + tab + '"]').prop('hidden', false);
        overlay.find('[data-cards-tab]').attr('aria-selected', 'false');
        overlay.find('[data-cards-tab="' + tab + '"]').attr('aria-selected', 'true');
        if (tab === 'preview' && !state.loading && !state.hasUserEditedPreview) renderMissingEstimatesPreview();
    }
    function copied() {
        var current = overlay, action = current.find('[data-cards-copy]');
        current.find('.s4t-cards-status').text('').prop('hidden',true);
        action.addClass('s4t-copy-success').attr('data-tooltip','Copied!');
        current.find('.s4t-cards-copy-toast').text('Copied for Slack').prop('hidden',false);
        document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
        clearTimeout(state.copyTimer);
        state.copyTimer = setTimeout(function () { action.removeClass('s4t-copy-success').attr('data-tooltip','Copy for Slack'); current.find('.s4t-cards-copy-toast').prop('hidden',true); },1800);
    }
    async function copyMessage() {
        var text = state.hasUserEditedPreview ? extractPlainTextFromRichEditor(editor) : generateMissingEstimatesSlackText();
        if (!text.trim()) { showSheetSuccessToast('The message is empty. Select cards or write a message first.'); return; }
        try { await navigator.clipboard.writeText(text); copied(); }
        catch (_) {
            var field = $('<textarea>').val(text).css({ position: 'fixed', left: '-9999px' }).appendTo(overlay);
            field[0].select(); var ok = false;
            try { ok = document.execCommand('copy'); } catch (_) { }
            field.remove(); if (ok) copied(); else showSheetSuccessToast('Copy was blocked. Select the preview text and copy it manually.');
        }
    }
    function open(options) {
        if (overlay && state.board === options.board) { context = options; overlay.prop('hidden', false); overlay.find('button').first().focus(); load(); return; }
        if (overlay) overlay.remove();
        context = options; boardData = null; loadToken++;
        state = { board: options.board, tab: 'cards', groupBy: 'dev', excludeNotSure: false, includeDevelopers: false, mentionDevelopers: false, excludedCardIds: new Set(), search: '', format: 'both', hasUserEditedPreview: false, developers: [], devCardsMap: {} };
        overlay = $('<div id="s4t-cards-overlay">');
        var dialog = $('<section id="s4t-cards-dialog" role="dialog" aria-modal="true" aria-label="Cards List and Slack preview">');
        var header = $('<header>').append($('<div class="s4t-feature-title">').append($('<h2>').text('Cards List'), s4tFeatureHelp('Cards List', 'Share selected Trello tasks in Slack.', 'Developer, label or list grouping; title/link formats and an editable Slack preview.', 'Build one message without copying card links individually.', 'Filter the board with Trello or Attention, select cards, edit the preview, then copy and paste into Slack.')), $('<span class="s4t-cards-count">').text('— selected / — cards'),
            button('↻', function () {
                if (state.tab === 'preview') {
                    if (!state.hasUserEditedPreview || window.confirm('Replace your edited draft with the selected cards?')) rebuildPreview();
                } else load();
            }, { 'data-cards-resync': '', 'data-tooltip': 'Refresh filtered cards', 'aria-label': 'Refresh filtered cards', 'class': 's4t-cards-icon-button' }), button('✕', close, { 'aria-label': 'Close Cards List', 'data-tooltip': 'Close', 'class': 's4t-cards-icon-button' }));
        dialog.append(header);
        var tabs = $('<div class="s4t-cards-tabs" role="tablist">').append(
            button('Cards', function () { switchTab('cards'); }, { role: 'tab', 'data-cards-tab': 'cards', 'aria-selected': 'true' }),
            button('Slack Preview & Edit', function () { switchTab('preview'); }, { role: 'tab', 'data-cards-tab': 'preview', 'aria-selected': 'false' }));

        dialog.append(tabs);
        var cardsPane = $('<div data-cards-pane="cards" class="s4t-cards-grid">');
        var cardsToolbar = $('<div class="s4t-cards-toolbar">').append(
            $('<input type="search" placeholder="Search filtered cards…" aria-label="Find a card">').on('input', function () { state.search = this.value; changedSelection(); }),
            button('Select / deselect all', function () {
                var cards = candidates(), all = cards.every(function (c) { return !state.excludedCardIds.has(c.id); });
                cards.forEach(function (c) { if (all) state.excludedCardIds.add(c.id); else state.excludedCardIds.delete(c.id); }); changedSelection();
            }));
        var cards = $('<div>').append(cardsToolbar, $('<div class="s4t-cards-items">'));
        cardsPane.append(cards); dialog.append(cardsPane);
        var preview = $('<div data-cards-pane="preview" hidden>');
        var format = $('<select aria-label="Message format" data-preview-only hidden>').append($('<option value="both">').text('Title + Link'), $('<option value="links">').text('Only Links'), $('<option value="titles">').text('Only Titles')).on('change', function () {
            if (state.hasUserEditedPreview && !window.confirm('Replace your edited draft with the selected cards in this format?')) { this.value = state.format; return; }
            state.format = this.value;
            rebuildPreview();
        });
        var grouping = $('<label class="s4t-cards-grouping" data-preview-only hidden>').text('Segregate By ');
        grouping.append($('<select data-cards-group aria-label="Segregate By">').append(
            $('<option value="dev">').text('By dev'), $('<option value="labels">').text('By labels'), $('<option value="lists">').text('By lists')
        ).on('change', function () {
            if (state.hasUserEditedPreview && !window.confirm('Replace your edited draft with cards grouped this way?')) { this.value = state.groupBy; return; }
            state.groupBy = this.value;
            renderCards();
            overlay.find('[data-add-developers]').prop('hidden', state.groupBy !== 'labels');
            overlay.find('[data-mention-developers]').prop('hidden', state.groupBy !== 'labels' || !state.includeDevelopers);
            rebuildPreview();
        }));
        header.find('[data-cards-resync]').html(s4tRefreshIcon()).before(grouping, format);
        editor = $('<div id="missing-slack-preview-rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Editable Slack message" spellcheck="true">')[0];
        var previewTools = $('<div class="s4t-cards-preview-tools">');
        var developerOption = $('<label data-add-developers data-tooltip="Append developer names after each card when grouped by labels" hidden>').append($('<input type="checkbox" aria-label="Add developer names to each card">').on('change', function () {
            if (state.hasUserEditedPreview && !window.confirm('Replace your edited draft with this developer-name setting?')) { this.checked = state.includeDevelopers; return; }
            state.includeDevelopers = this.checked;
            overlay.find('[data-mention-developers]').prop('hidden', !this.checked);
            var scrollTop = editor.scrollTop;
            state.hasUserEditedPreview = false;
            renderMissingEstimatesPreview();
            editor.scrollTop = scrollTop;
            var current = overlay, option = current.find('[data-add-developers]');
            option.addClass('s4t-option-success');
            current.find('.s4t-cards-copy-toast').text(this.checked ? 'Developer names added' : 'Developer names removed').prop('hidden',false);
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            clearTimeout(state.copyTimer); state.copyTimer = setTimeout(function () { option.removeClass('s4t-option-success'); current.find('.s4t-cards-copy-toast').prop('hidden',true); },1800);
        }));
        var mentionOption = $('<label data-mention-developers data-tooltip="Format developer names with @ for Slack (names only, not linked Slack mentions)" hidden>').append($('<input type="checkbox" aria-label="Format developer names with @">').on('change', function () {
            if (state.hasUserEditedPreview && !window.confirm('Replace your edited draft with this name format?')) { this.checked = state.mentionDevelopers; return; }
            state.mentionDevelopers = this.checked;
            var scrollTop = editor.scrollTop;
            state.hasUserEditedPreview = false; renderMissingEstimatesPreview(); editor.scrollTop = scrollTop;
            var current = overlay, option = current.find('[data-mention-developers]'); option.addClass('s4t-option-success');
            current.find('.s4t-cards-copy-toast').text(this.checked ? '@ formatting enabled' : '@ formatting removed').prop('hidden',false);
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            clearTimeout(state.copyTimer); state.copyTimer = setTimeout(function () { option.removeClass('s4t-option-success'); current.find('.s4t-cards-copy-toast').prop('hidden',true); },1800);
        }));
        previewTools.append(developerOption, mentionOption, button('', copyMessage, {'data-cards-copy':'', 'aria-label':'Copy for Slack', 'data-tooltip':'Copy for Slack', 'class':'s4t-cards-icon-button'}).html('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>'));
        var editorFrame = $('<div class="s4t-cards-editor-frame">').append(previewTools, $('<div class="s4t-cards-copy-toast" role="status" hidden>'), editor);
        var excludeNotSureOption = $('<label data-cards-exclude-not-sure data-tooltip="Exclude Not Sure list cards from the card list and preview in every grouping">').append(
            $('<input type="checkbox">').on('change', function () {
                if (state.hasUserEditedPreview && !window.confirm('Replace your edited draft with this list selection?')) { this.checked = state.excludeNotSure; return; }
                state.excludeNotSure = this.checked;
                state.hasUserEditedPreview = false;
                changedSelection();
            }), document.createTextNode('Exclude Not Sure list'));
        tabs.after(excludeNotSureOption);
        preview.append(editorFrame, $('<textarea id="missing-slack-preview" hidden>'), $('<div id="slack-mention-autocomplete" class="hidden" role="listbox">'));
        var footer = $('<footer class="s4t-cards-footer">').append(
            $('<p class="s4t-cards-help">').text('Edit your message · Type @ for suggestions.')
        );
        dialog.append(preview, footer, $('<div class="s4t-cards-status" role="status" hidden>'));
        overlay.append(dialog).appendTo('body');
        overlay.on('mousedown', function (event) { if (event.target === overlay[0]) close(); });
        overlay.on('keydown', function (event) {
            if (event.key === 'Escape' && $('#slack-mention-autocomplete').hasClass('hidden')) { event.stopPropagation(); close(); }
            if (event.key === 'Tab' && event.target !== editor && !editor.contains(event.target)) {
                var focusable = dialog.find('button,input,select,[contenteditable=true],a[href]').filter(':visible');
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && event.target === first) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && event.target === last) { event.preventDefault(); first.focus(); }
            }
        });
        initSlackMentionListeners();
        $(editor).on('paste', function (event) { event.preventDefault(); var text = (event.originalEvent.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, text); });
        $(editor).on('drop', function (event) { event.preventDefault(); });
        $('#slack-mention-autocomplete').on('mousedown', function (event) { event.preventDefault(); }).on('click', '.slack-mention-item', function () { insertSlackMention(state.mentionCandidates[Number(this.dataset.index)].name); });
        header.find('button').first().focus(); load();
    }
    function highlightMentionsAndMarkdown(text) {
        // Tokenize before escaping so user/card text can never introduce HTML attributes.
        var names = state.developers.map(function (d) { return d.name; }).concat(['channel', 'here', 'everyone']).sort(function (a, b) { return b.length - a.length; });
        var mentionPattern = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
        var pattern = new RegExp('(https?:\\/\\/[^\\s]+)|(@(?:' + mentionPattern + '|[a-zA-Z0-9._-]+))|(\\*[^*\\n]+\\*)', 'g');
        var result = '', last = 0;
        text.replace(pattern, function (token, url, mention, bold, offset) {
            result += escapeHtml(text.slice(last, offset));
            if (url) result += '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(url) + '</a>';
            else if (mention) result += '<span class="s4t-cards-mention" contenteditable="false">' + escapeHtml(mention) + '</span>';
            else result += '<strong>' + escapeHtml(bold.slice(1, -1)) + '</strong>';
            last = offset + token.length; return token;
        });
        return result + escapeHtml(text.slice(last));
    }

    function formatRichSlackText(text) {
        if (!text || !text.trim()) {
            return '<div class="slack-card-block"><div class="slack-line slack-text-line py-0.5 text-zinc-400 italic text-xs min-h-[1.25rem] leading-snug"><br></div></div>';
        }

        // Normalize line breaks
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

        // Split by double (or more) newlines to separate developer blocks
        const blocks = normalized.split(/\n{2,}/);

        const htmlBlocks = blocks.map(block => {
            if (!block.trim()) return '';

            const lines = block.split('\n');
            const formattedLines = lines.map((line, idx) => {
                if (!line.trim()) {
                    return '<div class="slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug"><br></div>';
                }

                // Check if line is a bullet item
                const isBullet = /^\s*•\s*/.test(line);
                if (isBullet) {
                    const content = line.replace(/^\s*•\s*/, '');
                    const formattedContent = highlightMentionsAndMarkdown(content);
                    return '<div class="slack-line slack-bullet-line flex items-start gap-1.5 py-0.5 pl-1 leading-snug group"><span class="text-emerald-400 font-bold shrink-0 select-none">•</span><div class="slack-bullet-content text-zinc-200 min-w-0 flex-1 text-xs">' + formattedContent + '</div></div>';
                }

                const formattedLine = highlightMentionsAndMarkdown(line);
                const isHeader = idx === 0 || /@/.test(line);
                if (isHeader) {
                    return '<div class="slack-line slack-header-line py-1 text-zinc-100 font-bold text-xs flex items-center gap-1 flex-wrap pb-1 mb-0.5 border-b border-zinc-800/60">' + formattedLine + '</div>';
                }
                return '<div class="slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug">' + formattedLine + '</div>';
            });

            // Each developer/card group rendered with compact card styling
            return '<div class="slack-card-block">' + formattedLines.filter(Boolean).join('') + '</div>';
        });

        return htmlBlocks.filter(Boolean).join('');
    }

    function extractPlainTextFromRichEditor(richEl) {
        return richEl ? getCleanTextFromEditorNode(richEl) : '';
    }

    function getCleanTextFromEditorNode(node) {
        function read(n) {
            if (n.nodeType === 3) return n.textContent;
            if (n.nodeType !== 1) return '';
            if (n.tagName === 'BR') return '\n';
            if (n.classList.contains('slack-bullet-line')) {
                var content = n.querySelector('.slack-bullet-content');
                return '• ' + (content ? read(content) : n.textContent.replace(/^•\s*/, '')).trim() + '\n';
            }
            if (n.classList.contains('slack-card-block')) return Array.from(n.childNodes).map(read).join('').trim() + '\n\n';
            if (n.tagName === 'A') return n.getAttribute('href') || n.textContent;
            var text = Array.from(n.childNodes).map(read).join('');
            if (n.tagName === 'STRONG' || n.tagName === 'B') return '*' + text + '*';
            if (n.tagName === 'EM' || n.tagName === 'I') return '_' + text + '_';
            if (n.tagName === 'DIV' || n.tagName === 'P') return text + '\n';
            return text;
        }
        return read(node).replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    function setSlackPreviewMode(mode) {
        // Kept for backward compatibility
        state.previewMode = 'rich';
        renderMissingEstimatesPreview();
    }

    function togglePreviewMode() {
        renderMissingEstimatesPreview();
    }

    function renderMissingEstimatesPreview() {

        const previewEl = document.getElementById('missing-slack-preview');
        const richEl = document.getElementById('missing-slack-preview-rich');
        if (!richEl && !previewEl) return;

        if (!state.hasUserEditedPreview) {
            const finalText = generateMissingEstimatesSlackText();
            if (previewEl) previewEl.value = finalText;
            if (richEl) {
                richEl.innerHTML = formatRichSlackText(finalText);
            }
        } else {
            if (previewEl && previewEl.value) {
                if (richEl && document.activeElement !== richEl) {
                    richEl.innerHTML = formatRichSlackText(previewEl.value);
                }
            }
        }
    }

    function regenerateSlackPreviewText() {
        state.hasUserEditedPreview = false;
        const finalText = generateMissingEstimatesSlackText();
        const previewEl = document.getElementById('missing-slack-preview');
        const richEl = document.getElementById('missing-slack-preview-rich');
        if (previewEl) previewEl.value = finalText;
        if (richEl) {
            richEl.innerHTML = formatRichSlackText(finalText);
        }
        showSheetSuccessToast('Slack message regenerated from cards checklist!');
    }

    // =========================================================================
    // Slack @ Member Autocomplete & Tag Highlighting
    // =========================================================================

    function initSlackMentionListeners() {
        const richEl = document.getElementById('missing-slack-preview-rich');
        const textarea = document.getElementById('missing-slack-preview');
        if (!richEl || richEl.dataset.mentionAttached) return;
        richEl.dataset.mentionAttached = 'true';

        richEl.addEventListener('input', () => {
            state.hasUserEditedPreview = true;
            const text = extractPlainTextFromRichEditor(richEl);
            if (textarea) textarea.value = text;
            handleSlackMentionInput(richEl);
        });

        richEl.addEventListener('keydown', (e) => {
            handleSlackEditorKeydown(e, richEl);
        });

        // Close suggestion dropdown when clicking anywhere outside
        overlay[0].addEventListener('click', (e) => {
            const menu = document.getElementById('slack-mention-autocomplete');
            if (menu && !menu.classList.contains('hidden')) {
                if (!menu.contains(e.target) && e.target !== richEl) {
                    hideSlackMentionAutocomplete();
                }
            }
        });
    }

    function handleSlackEditorKeydown(e, editorEl) {
        // 1. If autocomplete popup is open, let mention keydown handler process it
        const menu = document.getElementById('slack-mention-autocomplete');
        if (menu && !menu.classList.contains('hidden')) {
            const isHandled = handleSlackMentionKeydown(e, editorEl);
            if (isHandled) { e.stopPropagation(); return; }
        }

        // 2. Handle Enter key
        if (e.key === 'Enter') {
            e.preventDefault();
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;

            const range = sel.getRangeAt(0);

            // Shift + Enter: Insert soft break <br>
            if (e.shiftKey) {
                const br = document.createElement('br');
                range.deleteContents();
                range.insertNode(br);

                const newRange = document.createRange();
                newRange.setStartAfter(br);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);

                state.hasUserEditedPreview = true;
                const textarea = document.getElementById('missing-slack-preview');
                if (textarea) textarea.value = extractPlainTextFromRichEditor(editorEl);
                return;
            }

            // Regular Enter: proper structured line splitting
            let node = range.startContainer;
            if (node.nodeType === 3) {
                node = node.parentNode;
            }

            const bulletLine = node.closest ? node.closest('.slack-bullet-line') : null;
            const headerLine = node.closest ? node.closest('.slack-header-line') : null;
            const textLine = node.closest ? node.closest('.slack-text-line, .slack-line') : null;
            const cardBlock = node.closest ? node.closest('.slack-card-block') : null;

            if (bulletLine) {
                const bulletContent = bulletLine.querySelector('.slack-bullet-content') || bulletLine;
                const textVal = (bulletContent.innerText || bulletContent.textContent || '').trim();

                // If bullet line is empty, turn it into a normal text line
                if (!textVal || textVal === '•') {
                    const normalLine = document.createElement('div');
                    normalLine.className = 'slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug';
                    normalLine.innerHTML = '<br>';
                    bulletLine.parentNode.replaceChild(normalLine, bulletLine);

                    const newRange = document.createRange();
                    newRange.setStart(normalLine, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    // Split bullet content at cursor position
                    const trailingRange = document.createRange();
                    trailingRange.selectNodeContents(bulletContent);
                    trailingRange.setStart(range.endContainer, range.endOffset);
                    const trailingFragment = trailingRange.extractContents();

                    const newBulletLine = document.createElement('div');
                    newBulletLine.className = 'slack-line slack-bullet-line flex items-start gap-1.5 py-0.5 pl-1 leading-snug group';

                    const bulletSpan = document.createElement('span');
                    bulletSpan.className = 'text-emerald-400 font-bold shrink-0 select-none';
                    bulletSpan.textContent = '•';

                    const newContent = document.createElement('div');
                    newContent.className = 'slack-bullet-content text-zinc-200 min-w-0 flex-1 text-xs';

                    if (trailingFragment && trailingFragment.childNodes.length > 0 && trailingFragment.textContent.trim() !== '') {
                        newContent.appendChild(trailingFragment);
                    } else {
                        newContent.innerHTML = '<br>';
                    }

                    newBulletLine.appendChild(bulletSpan);
                    newBulletLine.appendChild(newContent);

                    bulletLine.parentNode.insertBefore(newBulletLine, bulletLine.nextSibling);

                    const newRange = document.createRange();
                    newRange.setStart(newContent, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
            } else if (headerLine) {
                // If in header, create a bullet line right after
                const newLine = document.createElement('div');
                newLine.className = 'slack-line slack-bullet-line flex items-start gap-1.5 py-0.5 pl-1 leading-snug group';
                newLine.innerHTML = '<span class="text-emerald-400 font-bold shrink-0 select-none">•</span><div class="slack-bullet-content text-zinc-200 min-w-0 flex-1 text-xs"><br></div>';
                headerLine.parentNode.insertBefore(newLine, headerLine.nextSibling);

                const contentDiv = newLine.querySelector('.slack-bullet-content');
                const newRange = document.createRange();
                newRange.setStart(contentDiv, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else if (textLine) {
                // Split text line
                const trailingRange = document.createRange();
                trailingRange.selectNodeContents(textLine);
                trailingRange.setStart(range.endContainer, range.endOffset);
                const trailingFragment = trailingRange.extractContents();

                const newLine = document.createElement('div');
                newLine.className = 'slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug';
                if (trailingFragment && trailingFragment.childNodes.length > 0 && trailingFragment.textContent.trim() !== '') {
                    newLine.appendChild(trailingFragment);
                } else {
                    newLine.innerHTML = '<br>';
                }
                textLine.parentNode.insertBefore(newLine, textLine.nextSibling);

                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else if (cardBlock) {
                const newLine = document.createElement('div');
                newLine.className = 'slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug';
                newLine.innerHTML = '<br>';
                cardBlock.appendChild(newLine);

                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else {
                // Fallback root
                const newLine = document.createElement('div');
                newLine.className = 'slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug';
                newLine.innerHTML = '<br>';
                editorEl.appendChild(newLine);

                const newRange = document.createRange();
                newRange.setStart(newLine, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }

            state.hasUserEditedPreview = true;
            const textarea = document.getElementById('missing-slack-preview');
            if (textarea) textarea.value = extractPlainTextFromRichEditor(editorEl);
            return;
        }

        // 3. Handle Backspace on empty bullet lines
        if (e.key === 'Backspace') {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                let node = range.startContainer;
                if (node.nodeType === 3) {
                    node = node.parentNode;
                }
                const bulletLine = node.closest ? node.closest('.slack-bullet-line') : null;
                if (bulletLine) {
                    const bulletContent = bulletLine.querySelector('.slack-bullet-content') || bulletLine;
                    const textVal = (bulletContent.innerText || bulletContent.textContent || '').trim();
                    if (range.startOffset === 0 && (!textVal || textVal === '•' || textVal.length === 0)) {
                        e.preventDefault();
                        const prev = bulletLine.previousElementSibling;
                        const normalLine = document.createElement('div');
                        normalLine.className = 'slack-line slack-text-line py-0.5 text-zinc-200 text-xs min-h-[1.25rem] leading-snug';
                        normalLine.innerHTML = '<br>';
                        bulletLine.parentNode.replaceChild(normalLine, bulletLine);

                        const target = prev || normalLine;
                        const newRange = document.createRange();
                        newRange.selectNodeContents(target);
                        newRange.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(newRange);

                        state.hasUserEditedPreview = true;
                        const textarea = document.getElementById('missing-slack-preview');
                        if (textarea) textarea.value = extractPlainTextFromRichEditor(editorEl);
                        return;
                    }
                }
            }
        }

        // 4. Handle Tab
        if (e.key === 'Tab') {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                const range = sel.getRangeAt(0);
                const tabNode = document.createTextNode('\u00A0\u00A0');
                range.insertNode(tabNode);
                const newRange = document.createRange();
                newRange.setStartAfter(tabNode);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);

                state.hasUserEditedPreview = true;
                const textarea = document.getElementById('missing-slack-preview');
                if (textarea) textarea.value = extractPlainTextFromRichEditor(editorEl);
            }
        }
    }

    function handleSlackMentionInput(editorEl) {
        const sel = window.getSelection();
        if (!sel || !sel.focusNode || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        const nodeText = sel.focusNode.textContent || '';
        const offset = sel.focusOffset;
        const textBefore = nodeText.slice(0, offset);
        const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9._\s-]{0,25})$/);

        if (match) {
            const query = match[1].toLowerCase().trim();
            const atIndex = textBefore.lastIndexOf('@');
            state.autocompleteQuery = query;
            state.autocompleteRange = {
                node: sel.focusNode,
                atIndex: atIndex,
                queryLength: offset - atIndex
            };
            showSlackMentionAutocomplete(query, editorEl);
        } else {
            hideSlackMentionAutocomplete();
        }
    }

    function showSlackMentionAutocomplete(query, editorEl) {
        var menu = document.getElementById('slack-mention-autocomplete');
        var candidates = [{ name: 'channel', role: 'Channel mention' }, { name: 'here', role: 'Active members' }].concat(state.developers.map(function (d) { return { name: d.name, role: 'Team member' }; }));
        state.mentionCandidates = candidates.filter(function (c) { return c.name.toLowerCase().includes(query); });
        if (!state.mentionCandidates.length) { hideSlackMentionAutocomplete(); return; }
        state.autocompleteActiveIndex = 0;
        menu.replaceChildren();
        state.mentionCandidates.forEach(function (item, index) {
            var row = document.createElement('div'); row.className = 'slack-mention-item'; row.dataset.index = index; row.setAttribute('role', 'option');
            row.textContent = '@' + item.name + ' · ' + item.role; menu.appendChild(row);
        });
        menu.classList.remove('hidden');
        var sel = window.getSelection(), rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : editorEl.getBoundingClientRect();
        menu.style.top = Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 240)) + 'px';
        menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 310)) + 'px';
        updateMentionMenuHighlight(menu.querySelectorAll('.slack-mention-item'), 0);
    }

    function hideSlackMentionAutocomplete() {
        const menu = document.getElementById('slack-mention-autocomplete');
        if (menu) menu.classList.add('hidden');
        state.autocompleteRange = null;
    }

    function handleSlackMentionKeydown(e, editorEl) {
        const menu = document.getElementById('slack-mention-autocomplete');
        if (!menu || menu.classList.contains('hidden')) return false;

        const items = menu.querySelectorAll('.slack-mention-item');
        if (items.length === 0) return false;

        let activeIdx = state.autocompleteActiveIndex || 0;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = (activeIdx + 1) % items.length;
            state.autocompleteActiveIndex = activeIdx;
            updateMentionMenuHighlight(items, activeIdx);
            return true;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = (activeIdx - 1 + items.length) % items.length;
            state.autocompleteActiveIndex = activeIdx;
            updateMentionMenuHighlight(items, activeIdx);
            return true;
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            const selectedEl = items[activeIdx];
            if (selectedEl) {
                selectedEl.click();
            }
            return true;
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideSlackMentionAutocomplete();
            return true;
        }
        return false;
    }

    function updateMentionMenuHighlight(items, activeIdx) {
        items.forEach((it, idx) => {
            if (idx === activeIdx) {
                it.className = 'slack-mention-item flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors bg-emerald-600/20 text-white';
                it.scrollIntoView({ block: 'nearest' });
            } else {
                it.className = 'slack-mention-item flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors hover:bg-zinc-800 text-zinc-300';
            }
        });
    }

    function insertSlackMention(name) {
        const richEl = document.getElementById('missing-slack-preview-rich');
        const textarea = document.getElementById('missing-slack-preview');
        const isBroadcast = ['channel', 'here', 'everyone'].includes(name.toLowerCase());
        const badgeClass = isBroadcast
            ? 'inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-amber-500/20 text-amber-300 font-bold font-mono border border-amber-500/30 text-[11px] select-none'
            : 'inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold font-mono border border-emerald-500/30 text-[11px] select-none';

        if (richEl) {
            richEl.focus();
            const sel = window.getSelection();
            const rangeInfo = state.autocompleteRange;
            let inserted = false;

            if (rangeInfo && rangeInfo.node && rangeInfo.node.parentNode) {
                try {
                    const textNode = rangeInfo.node;
                    const textVal = textNode.textContent || '';
                    const atIdx = rangeInfo.atIndex;
                    const qLen = rangeInfo.queryLength || 0;

                    if (atIdx >= 0 && atIdx <= textVal.length) {
                        const before = textVal.slice(0, atIdx);
                        const after = textVal.slice(atIdx + qLen);

                        const mentionSpan = document.createElement('span');
                        mentionSpan.className = badgeClass;
                        mentionSpan.contentEditable = 'false';
                        mentionSpan.textContent = '@' + name;

                        const spaceNode = document.createTextNode('\u00A0');

                        const parent = textNode.parentNode;
                        const beforeNode = document.createTextNode(before);
                        const afterNode = document.createTextNode(after);

                        parent.insertBefore(beforeNode, textNode);
                        parent.insertBefore(mentionSpan, textNode);
                        parent.insertBefore(spaceNode, textNode);
                        parent.insertBefore(afterNode, textNode);
                        parent.removeChild(textNode);

                        // Place cursor cleanly after space
                        const newRange = document.createRange();
                        newRange.setStartAfter(spaceNode);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                        inserted = true;
                    }
                } catch (err) {
                    console.warn('Error inserting mention node:', err);
                }
            }

            if (!inserted) {
                const mentionSpan = document.createElement('span');
                mentionSpan.className = badgeClass;
                mentionSpan.contentEditable = 'false';
                mentionSpan.textContent = '@' + name;
                const spaceNode = document.createTextNode('\u00A0');

                if (sel && sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(spaceNode);
                    range.insertNode(mentionSpan);
                    const newRange = document.createRange();
                    newRange.setStartAfter(spaceNode);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                } else {
                    richEl.appendChild(mentionSpan);
                    richEl.appendChild(spaceNode);
                }
            }

            state.hasUserEditedPreview = true;
            const text = extractPlainTextFromRichEditor(richEl);
            if (textarea) textarea.value = text;
        } else if (textarea) {
            const val = textarea.value;
            const start = textarea.selectionStart || val.length;
            const end = textarea.selectionEnd || val.length;
            const mentionText = '@' + name + ' ';
            textarea.value = val.slice(0, start) + mentionText + val.slice(end);
            textarea.selectionStart = textarea.selectionEnd = start + mentionText.length;
            state.hasUserEditedPreview = true;
        }

        hideSlackMentionAutocomplete();
    }

    return open;
})();


/* Shared tooltips stay outside scroll containers and dismiss on pointer down. */
(function () {
    if (typeof document === 'undefined') return;
    var selector = '#s4t-eow-launch, #s4t-eow-dialog [data-tooltip], #s4t-members-modal [data-tooltip], .s4t-comment-navigator [data-tooltip], .s4t-checklist-action, #membersBurndownLink, #s4t-attention-controls [data-tooltip], #s4t-cards-launch, #s4t-attention-panel [data-tooltip], #s4t-cards-dialog [data-tooltip]';
    var tip, owner, timer, leaveTimer, pinned = false;
    function hide() {
        clearTimeout(timer); clearTimeout(leaveTimer); pinned = false;
        if (owner) {
            if (owner.classList.contains('s4t-feature-help')) owner.setAttribute('aria-expanded', 'false');
            var ids = (owner.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (id) { return id && id !== 's4t-icon-tooltip'; });
            if (ids.length) owner.setAttribute('aria-describedby', ids.join(' ')); else owner.removeAttribute('aria-describedby');
        }
        owner = null;
        if (tip) tip.hidden = true;
    }
    function toastVisible(node) {
        var dialog = node && node.closest('#s4t-cards-dialog');
        return dialog && dialog.querySelector('.s4t-cards-copy-toast:not([hidden]), .s4t-cards-status:not([hidden])');
    }
    document.addEventListener('s4t-dismiss-tooltip', hide);
    function show(node, pin) {
        hide();
        pinned = !!pin;
        if (!node || node.disabled || toastVisible(node)) return;
        owner = node;
        timer = setTimeout(function () {
            if (!owner || !owner.isConnected || toastVisible(owner)) return;
            if (!tip) {
                tip = document.createElement('div'); tip.id = 's4t-icon-tooltip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip);
            }
            tip.classList.toggle('s4t-interactive-help', owner.classList.contains('s4t-feature-help'));
            if (owner.classList.contains('s4t-feature-help')) owner.setAttribute('aria-expanded', 'true');
            tip.textContent = '';
            if (owner.hasAttribute('data-feature-purpose')) {
                [['Feature', owner.getAttribute('data-tooltip')], ['Why use it', owner.getAttribute('data-feature-purpose')], ['What’s included', owner.getAttribute('data-feature-options')], ['Saves effort', owner.getAttribute('data-feature-benefit')], ['How to use', owner.getAttribute('data-feature-usage')]].forEach(function (section) {
                    var row = document.createElement('div'), label = document.createElement('strong'), text = document.createElement('span');
                    row.className = 's4t-help-section'; label.textContent = section[0]; text.textContent = section[1];
                    row.append(label, text); tip.appendChild(row);
                });
            } else tip.textContent = owner.getAttribute('data-tooltip') || owner.getAttribute('aria-label');
            tip.hidden = false;
            var rect = owner.getBoundingClientRect(), bounds = tip.getBoundingClientRect();
            tip.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - bounds.width / 2, window.innerWidth - bounds.width - 8)) + 'px';
            tip.style.top = Math.max(8, rect.bottom + bounds.height + 8 > window.innerHeight ? rect.top - bounds.height - 8 : rect.bottom + 8) + 'px';
            var described = owner.getAttribute('aria-describedby');
            owner.setAttribute('aria-describedby', (described ? described + ' ' : '') + tip.id);
        }, pin ? 0 : 250);
    }
    function leave() {
        if (pinned) return;
        clearTimeout(leaveTimer);
        if (owner && owner.classList.contains('s4t-feature-help')) leaveTimer = setTimeout(hide, 220);
        else hide();
    }
    document.addEventListener('mouseover', function (event) {
        var node = event.target.closest && event.target.closest(selector);
        if (tip && tip.contains(event.target)) { clearTimeout(leaveTimer); return; }
        if (node === owner) { clearTimeout(leaveTimer); return; }
        if (!pinned && node && !node.contains(event.relatedTarget)) show(node);
    });
    document.addEventListener('mouseout', function (event) {
        if (!owner || owner.contains(event.relatedTarget) || (tip && tip.contains(event.relatedTarget))) return;
        if (owner.contains(event.target) || (tip && tip.contains(event.target))) leave();
    });
    document.addEventListener('focusin', function (event) {
        var node = event.target.closest && event.target.closest(selector);
        if (node && event.target.matches(':focus-visible')) show(node);
    });
    document.addEventListener('focusout', function () { if (!pinned) leave(); });
    document.addEventListener('pointerdown', function (event) {
        if (event.target.closest('.s4t-feature-help') || (tip && tip.contains(event.target))) return;
        hide();
    }, true);
    document.addEventListener('click', function (event) {
        var node = event.target.closest('.s4t-feature-help');
        if (!node) return;
        if (node === owner && pinned) hide(); else show(node, true);
    });
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && owner && owner.classList.contains('s4t-feature-help')) { hide(); event.stopImmediatePropagation(); } else if (event.key === 'Escape') hide(); }, true);
    document.addEventListener('scroll', function (event) { if (!tip || !tip.contains(event.target)) hide(); }, true);
    window.addEventListener('resize', hide);
})();

// Sequential, idempotent checklist completion through Trello's own controls.
async function s4tCompleteChecklist(adapter) {
    var changed = 0;
    for (var index = 0; index < adapter.count; index++) {
        if (!adapter.valid()) throw new Error('Checklist changed or card closed. Stopped.');
        if (adapter.checked(index)) continue;
        await adapter.check(index);
        if (!adapter.valid() || !adapter.checked(index)) throw new Error('An item could not be checked. Stopped; retry remaining items.');
        changed++;
    }
    return changed;
}
(function () {
    if (typeof document === 'undefined') return;
    var roots = '.checklist, [data-testid="checklist"], [data-testid="checklist-container"], [data-testid="checklist-section"]';
    var itemSelector = 'input[type="checkbox"], [role="checkbox"], .checklist-item-checkbox, [data-testid="check-item-checkbox"], [data-testid="checklist-item-checkbox"]';
    var pending, running = new Set();
    function controls(root) {
        var candidates = Array.from(root.querySelectorAll(itemSelector)).filter(function (node) {
            return !node.closest('.s4t-checklist-actions') &&
                !node.matches('[data-testid*="hide"], [data-testid*="show"]');
        });
        // Modern Trello wraps real inputs in styled checkbox spans; use each input once.
        return candidates.filter(function (node) { return !candidates.some(function (other) { return other !== node && node.contains(other); }); });
    }
    function itemKey(node) {
        var row = node.closest('.checklist-item, [data-testid="checklist-item"], [data-testid="check-item"], [data-testid="checklist-item-container"], [data-testid="check-item-container"], [data-checkitem-id]');
        var text = row && row.querySelector('[data-testid="checklist-item-text"], [data-testid="check-item-text"], .checklist-item-details-text, .checklist-item-details-text-current, label');
        return (row && (row.getAttribute('data-checkitem-id') || row.getAttribute('data-id') || row.id)) || node.getAttribute('data-checkitem-id') ||
            (text && text.textContent.trim()) || node.getAttribute('aria-label') || (row && row.textContent.trim()) || node.id || '';
    }
    async function revealItems(root) {
        var clicked = new Set();
        for (var attempt = 0; attempt < 8; attempt++) {
            var reveal = Array.from(root.querySelectorAll('button, a, [role="button"]')).find(function (node) {
                if (clicked.has(node) || node.closest('.s4t-checklist-actions') || node.disabled) return false;
                var text = (node.getAttribute('aria-label') || node.textContent || '').trim();
                var controlled = node.getAttribute('aria-controls');
                var content = controlled && document.getElementById(controlled);
                return /^(?:show (?:all |checked |completed )?items|show checklist|expand checklist)(?:\s*\(\d+\))?$/i.test(text) ||
                    (node.getAttribute('aria-expanded') === 'false' && content && root.contains(content));
            });
            if (!reveal) break;
            clicked.add(reveal); reveal.click();
            await new Promise(function (resolve) { setTimeout(resolve, 100); });
            if (!root.isConnected) break;
        }
    }
    function checked(node) {
        return node.checked === true || node.getAttribute('aria-checked') === 'true' || node.getAttribute('data-state') === 'checked' ||
            !!node.closest('.checklist-item-state-complete');
    }
    function positionAction(actions) {
        var remove = actions._nativeDelete;
        if (!remove || !remove.isConnected) return;
        actions.style.left = remove.offsetLeft + 'px';
        actions.style.top = remove.offsetTop + 'px';
        actions.style.width = Math.max(remove.offsetWidth, 64) + 'px';
    }
    function mount() {
        document.querySelectorAll(roots).forEach(function (root) {
            if (!root.getClientRects().length) return;
            var existing = root.querySelector('.s4t-checklist-actions');
            if (existing) { positionAction(existing); return; }
            var deletes = Array.from(root.querySelectorAll('button, a')).filter(function (node) {
                return /^delete$/i.test(node.textContent.trim()) || node.matches('.js-delete-checklist, [data-testid="checklist-delete-button"]');
            });
            // Never mount on a wrapper containing more than one checklist's Delete action.
            if (deletes.length !== 1) return;
            var remove = deletes[0];
            var action = document.createElement('button');
            action.type = 'button'; action.className = 's4t-checklist-action'; action.textContent = 'Check all';
            action.setAttribute('aria-label', 'Check all items in this checklist');
            action.setAttribute('data-tooltip', 'Checks only this checklist on this card');
            action.addEventListener('click', async function (event) {
                event.preventDefault(); event.stopPropagation();
                var rootId = root.getAttribute('data-checklist-id') || root.getAttribute('data-id') || root.id;
                var runKey = window.location.pathname + ':' + (rootId || Array.from(document.querySelectorAll(roots)).indexOf(root));
                if (action.disabled || running.has(runKey)) return;
                running.add(runKey);
                function liveRoot() {
                    if (root.isConnected) return root;
                    if (!rootId) return null;
                    var matches = Array.from(document.querySelectorAll(roots)).filter(function (candidate) { return (candidate.getAttribute('data-checklist-id') || candidate.getAttribute('data-id') || candidate.id) === rootId; });
                    if (matches.length !== 1) return null;
                    root = matches[0]; return root;
                }
                var originalPath = window.location.pathname;
                var oldStatus = root.querySelector('.s4t-checklist-status'); if (oldStatus) oldStatus.remove();
                action.disabled = true;
                try {
                    await revealItems(root);
                    if (!liveRoot() || window.location.pathname !== originalPath) throw new Error('Card closed. Stopped.');
                    var original = controls(root), keys = original.map(itemKey);
                    if (!original.length) {
                        var progress = root.querySelector('[role="progressbar"], .checklist-progress-percentage');
                        var value = progress && (progress.getAttribute('aria-valuenow') || progress.textContent);
                        if (value && /100/.test(value)) return;
                        throw new Error('No checklist item controls found.');
                    }
                    await s4tCompleteChecklist({
                        count: original.length,
                        valid: function () { return window.location.pathname === originalPath && !!liveRoot() && controls(root).length === original.length && controls(root).every(function (node, i) { return itemKey(node) === keys[i]; }); },
                        checked: function (i) { return checked(controls(root)[i]); },
                        check: async function (i) {
                            var node = controls(root)[i];
                            if (node.disabled || node.getAttribute('aria-disabled') === 'true') throw new Error('No permission to check this item.');
                            node.click();
                            var stableSince = 0;
                            for (var wait = 0; wait < 50; wait++) {
                                await new Promise(function (resolve) { setTimeout(resolve, 100); });
                                if (window.location.pathname !== originalPath) return;
                                var currentRoot = liveRoot(), current = currentRoot && controls(currentRoot)[i];
                                if (current && itemKey(current) === keys[i] && checked(current) && !current.disabled && current.getAttribute('aria-disabled') !== 'true') {
                                    if (!stableSince) stableSince = Date.now();
                                    // Trello's first update can remount inputs and briefly show optimistic state.
                                    if (Date.now() - stableSince >= 350) return;
                                } else stableSince = 0;
                            }
                        }
                    });
                } catch (_) {
                    // Stop immediately and quietly; another click can resume unchecked items.
                    action.textContent = 'Check all';
                    action.setAttribute('data-tooltip', 'Checks only this checklist on this card');
                } finally {
                    running.delete(runKey);
                    action.disabled = false;
                    var mountedAction = liveRoot() && root.querySelector('.s4t-checklist-action');
                    if (mountedAction) { mountedAction.disabled = false; mountedAction.textContent = action.textContent; }
                    document.dispatchEvent(new Event('s4t-checklist-updated'));
                }
            });
            var actions = document.createElement('div');
            actions.className = 's4t-checklist-actions';
            remove.before(actions);
            actions.append(action);
            actions._nativeDelete = remove;
            remove.parentElement.classList.add('s4t-checklist-native-actions');
            positionAction(actions);
        });
    }
    new MutationObserver(function (mutations) {
        if (mutations.every(function (m) { var t = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (!t || !t.closest) return false; if (t.closest('.s4t-checklist-actions')) return true; if (t.closest(roots)) return false; return !!t.closest('[id^="s4t-"], [class*="s4t-"]'); })) return;
        if (!pending) pending = setTimeout(function () { pending = null; mount(); }, 120);
    }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', mount);
    mount();
})();

function s4tCommentSearchSpans(text, query) {
    var term = String(query || '').trim();
    if (!term) return [];
    // Preserve normal Find behavior, with the explicitly requested branch typo alias.
    if (/^brach(?:es)?$/i.test(term)) term = term.replace(/^brach/i, 'branch');
    var pattern = term.split(/\s+/).map(function (part) { return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('\\s+');
    var regex = new RegExp(pattern, 'giu'), result = [], match;
    while ((match = regex.exec(String(text || '')))) result.push({ start: match.index, end: match.index + match[0].length });
    return result;
}

(function () {
    if (typeof document === 'undefined') return;
    var bar, slot, header, cardHeader, scope, input, counter, previous, next, timer, positionFrame, matches = [], active = -1, route = '', textIndex = [], indexDirty = true;
    function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
    function removeBar() {
        if (bar) bar.remove();
        if (slot) slot.remove();
        if (cardHeader) cardHeader.classList.remove('s4t-comments-heading-row');
        cardHeader = null;
        bar = null; slot = null;
    }
    function positionBar() {
        positionFrame = null;
        if (!bar || !slot || !slot.isConnected || !scope || !scope.isConnected) return;
        var rect = slot.getBoundingClientRect(), top = 8, bottom = window.innerHeight - 8;
        for (var ancestor = slot.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
            var style = window.getComputedStyle(ancestor);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                var bounds = ancestor.getBoundingClientRect();
                top = Math.max(top, bounds.top + ancestor.clientTop + 8);
                bottom = Math.min(bottom, bounds.bottom - 8);
            }
        }
        var height = bar.getBoundingClientRect().height;
        var docked = rect.top < top && bottom - top > height;
        var focused = bar.contains(document.activeElement) ? document.activeElement : null;
        if (docked) {
            slot.style.height = height + 'px';
            // Stay inside the card dialog, but outside the short title row's scrolling bounds.
            if (bar.parentElement !== scope) { scope.appendChild(bar); if (focused) focused.focus({ preventScroll: true }); }
            bar.classList.add('s4t-comment-navigator-pinned');
            var width = Math.min(rect.width, window.innerWidth - 16);
            var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
            var originLeft = 0, originTop = 0, scaleX = 1, scaleY = 1;
            // Transformed Trello dialogs establish their own fixed-position coordinate system.
            for (var parent = bar.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
                var computed = window.getComputedStyle(parent);
                if (computed.transform !== 'none' || computed.perspective !== 'none' || computed.filter !== 'none' || /paint|layout|strict|content/.test(computed.contain) || /transform|perspective|filter/.test(computed.willChange)) {
                    var box = parent.getBoundingClientRect();
                    scaleX = parent.offsetWidth ? box.width / parent.offsetWidth : 1;
                    scaleY = parent.offsetHeight ? box.height / parent.offsetHeight : 1;
                    originLeft = box.left + (parent.clientLeft - parent.scrollLeft) * scaleX;
                    originTop = box.top + (parent.clientTop - parent.scrollTop) * scaleY;
                    break;
                }
            }
            bar.style.left = (left - originLeft) / scaleX + 'px';
            bar.style.top = (top - originTop) / scaleY + 'px';
            bar.style.width = width / scaleX + 'px';
        } else {
            if (bar.parentElement !== slot) { slot.appendChild(bar); if (focused) focused.focus({ preventScroll: true }); }
            bar.classList.remove('s4t-comment-navigator-pinned');
            bar.style.left = ''; bar.style.top = ''; bar.style.width = ''; slot.style.height = '';
        }
    }
    function schedulePosition() {
        if (bar && !positionFrame) positionFrame = setTimeout(positionBar, 16);
    }
    function clearHighlights() {
        if (window.CSS && CSS.highlights) {
            CSS.highlights.delete('s4t-comment-matches');
            CSS.highlights.delete('s4t-comment-current');
        }
        document.querySelectorAll('.s4t-comment-text-match, .s4t-comment-text-current').forEach(function (node) {
            node.classList.remove('s4t-comment-text-match', 's4t-comment-text-current');
        });
        textIndex = []; indexDirty = true;
    }
    function buildTextIndex() {
        var selector = '.comment-container, .phenom-comment, .current-comment, .action-comment, [data-testid="action-comment"], [data-testid="card-back-comment"], [data-testid="card-back-action-comment"], [data-testid="comment-content"], [data-testid="comment-text"], [data-testid*="comment"] .ak-renderer-document, [data-testid*="activity"] .ak-renderer-document, .list-actions .ak-renderer-document';
        var roots = Array.from(scope.querySelectorAll(selector)).filter(function (node) {
            return !node.closest('[contenteditable="true"], .s4t-comment-navigator, [hidden], [aria-hidden="true"]') &&
                node.getClientRects().length;
        });
        roots = roots.filter(function (node) { return !roots.some(function (other) { return other !== node && other.contains(node); }); });
        textIndex = roots.map(function (root) {
            var text = '', segments = [], lastBlock;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    var parent = node.parentElement;
                    return parent && !parent.closest('script, style, textarea, button, [contenteditable="true"], [hidden], [aria-hidden="true"], .s4t-comment-navigator') && parent.getClientRects().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            });
            var node;
            while ((node = walker.nextNode())) {
                var block = node.parentElement.closest('p, li, h1, h2, h3, h4, h5, h6, pre, blockquote');
                if (segments.length && block !== lastBlock) text += '\n';
                var start = text.length; text += node.nodeValue;
                segments.push({ node: node, start: start, end: text.length }); lastBlock = block;
            }
            return { text: text, segments: segments };
        });
        indexDirty = false;
    }
    function paintMatches() {
        if (window.CSS && CSS.highlights && typeof Highlight !== 'undefined') {
            var all = new Highlight(), current = new Highlight();
            matches.forEach(function (match) { all.add(match.range); });
            if (active >= 0) current.add(matches[active].range);
            CSS.highlights.set('s4t-comment-matches', all);
            CSS.highlights.set('s4t-comment-current', current);
        } else {
            document.querySelectorAll('.s4t-comment-text-match, .s4t-comment-text-current').forEach(function (node) { node.classList.remove('s4t-comment-text-match', 's4t-comment-text-current'); });
            matches.forEach(function (match, i) { match.element.classList.add('s4t-comment-text-match'); if (i === active) match.element.classList.add('s4t-comment-text-current'); });
        }
    }
    function update() {
        if (!bar || !bar.isConnected || !scope || !scope.isConnected) return;
        var current = matches[active];
        if (indexDirty) buildTextIndex();
        var found = [];
        textIndex.forEach(function (entry) {
            s4tCommentSearchSpans(entry.text, input.value).forEach(function (hit) {
                var first = entry.segments.find(function (segment) { return segment.end > hit.start; });
                var last = entry.segments.find(function (segment) { return segment.end >= hit.end; });
                if (!first || !last || !first.node.isConnected || !last.node.isConnected) return;
                var range = document.createRange();
                range.setStart(first.node, Math.max(0, hit.start - first.start));
                range.setEnd(last.node, hit.end - last.start);
                found.push({ range: range, element: first.node.parentElement });
            });
        });
        matches = found;
        active = current ? matches.findIndex(function (match) {
            return match.range.startContainer === current.range.startContainer && match.range.startOffset === current.range.startOffset &&
                match.range.endContainer === current.range.endContainer && match.range.endOffset === current.range.endOffset;
        }) : -1;
        paintMatches();
        setText(counter, matches.length ? (active < 0 ? '0' : active + 1) + '/' + matches.length : '0/0');
        counter.setAttribute('data-tooltip', 'Case-insensitive search in loaded comments. Use Trello’s Show more to load older comments.');
        previous.disabled = next.disabled = !matches.length;
        schedulePosition();
    }
    function go(direction) {
        update();
        if (!matches.length) return;
        active = active < 0 ? (direction > 0 ? 0 : matches.length - 1) : (active + direction + matches.length) % matches.length;
        var target = matches[active];
        paintMatches();
        var behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        var scroller = target.element;
        while (scroller && scroller !== document.body && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(window.getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
        var rect = target.range.getBoundingClientRect();
        if (scroller && scroller !== document.body) {
            var bounds = scroller.getBoundingClientRect();
            scroller.scrollBy({ top: rect.top - bounds.top - scroller.clientHeight / 2 + rect.height / 2, behavior: behavior });
        } else window.scrollBy({ top: rect.top - window.innerHeight / 2, behavior: behavior });
        setText(counter, (active + 1) + '/' + matches.length);
        schedulePosition();
    }
    function makeButton(text, label, action) {
        var node = document.createElement('button'); node.type = 'button'; node.textContent = text;
        node.setAttribute('aria-label', label); node.setAttribute('data-tooltip', label);
        node.addEventListener('click', function (event) { event.preventDefault(); event.stopPropagation(); action(); });
        return node;
    }
    function searchPlacement(card) {
        var toolbarSelector = '[role="toolbar"], header, [data-testid="card-back-header"], [data-testid="card-back-header-actions"]';
        var covers = Array.from(card.querySelectorAll('button, a, [role="button"]')).filter(function (node) {
            if (!node.getClientRects().length || node.closest('.s4t-comment-navigator')) return false;
            return /(?:^|-)cover(?:-image)?(?:-button)?$/.test(node.getAttribute('data-testid') || '') ||
                [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent].some(function (text) {
                    return /^(?:edit |change |add )?(?:card )?cover(?: image)?$/i.test((text || '').trim());
                });
        });
        // Prefer the navbar action when Trello also renders a sidebar Cover action.
        covers.sort(function (a, b) {
            return Number(!!b.closest(toolbarSelector)) - Number(!!a.closest(toolbarSelector)) ||
                a.getBoundingClientRect().top - b.getBoundingClientRect().top;
        });
        var cover = covers[0];
        if (!cover) return null; // Wait for the native navbar; never fall back onto the card title.
        var anchor = cover;
        while (anchor.parentElement && anchor.parentElement !== card &&
            anchor.parentElement.children.length === 1 &&
            !anchor.parentElement.matches(toolbarSelector)) anchor = anchor.parentElement;
        var host = anchor.parentElement;
        if (!host || host === card) return null;
        return { anchor: anchor, host: host };
    }
    function mount() {
        var path = window.location.pathname;
        if (route !== path) { removeBar(); clearHighlights(); matches = []; active = -1; route = path; }
        var title = Array.from(document.querySelectorAll('h2, h3, h4, [role="heading"], [data-testid="card-back-activity-section-title"]')).find(function (node) {
            return node.getClientRects().length && !node.closest('#s4t-cards-overlay, #s4t-attention-panel') &&
                /^(?:comments?\s*(?:&|and)\s*activity|activity)$/i.test(node.textContent.trim());
        });
        var nextScope = title && title.closest('[role="dialog"], .window, [data-testid="card-back"], [data-testid="card-back-container"], .card-detail-window');
        if (!nextScope) nextScope = Array.from(document.querySelectorAll('[data-testid="card-back"], [data-testid="card-back-container"], .card-detail-window, .window, [role="dialog"]')).find(function (node) {
            return node.getClientRects().length && !node.closest('#s4t-cards-overlay, #s4t-attention-panel, #s4t-modal-overlay') &&
                !!node.querySelector('[data-testid="card-back-title"], [data-testid="card-back-header"], .card-detail-title');
        });
        if (!nextScope) { removeBar(); clearHighlights(); matches = []; active = -1; return; }
        var placement = nextScope && searchPlacement(nextScope);
        if (!placement) { removeBar(); clearHighlights(); matches = []; active = -1; return; }
        if (bar && bar.isConnected && nextScope === scope && slot.parentElement === placement.host && slot.nextElementSibling === placement.anchor) { header = title; update(); return; }
        var savedQuery = input && nextScope === scope ? input.value : '';
        removeBar(); clearHighlights(); matches = []; active = -1;
        header = title; scope = nextScope;
        bar = document.createElement('div'); bar.className = 's4t-comment-navigator'; bar.setAttribute('role', 'search'); bar.setAttribute('aria-label', 'Find in comments');
        input = document.createElement('input'); input.type = 'search'; input.value = savedQuery; input.placeholder = 'Find in comments'; input.setAttribute('aria-label', 'Find in comments (case-insensitive)');
        input.addEventListener('input', function () { active = -1; update(); });
        input.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); go(event.shiftKey ? -1 : 1); } });
        counter = document.createElement('span'); counter.className = 's4t-comment-match-count'; counter.setAttribute('role', 'status');
        previous = makeButton('↑', 'Previous match (Shift+Enter)', function () { go(-1); });
        next = makeButton('↓', 'Next match (Enter)', function () { go(1); });
        bar.append(input, counter, previous, next);
        slot = document.createElement('div'); slot.className = 's4t-comment-search-slot s4t-card-header-search';
        slot.appendChild(bar);
        placement.anchor.before(slot);
        update();
    }
    new MutationObserver(function (mutations) {
        if (mutations.every(function (m) { var node = m.target.nodeType === 1 ? m.target : m.target.parentElement; return node && node.closest && node.closest('[id^="s4t-"], [class*="s4t-"]'); })) return;
        indexDirty = true;
        if (!timer) timer = setTimeout(function () { timer = null; mount(); }, 150);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('scroll', schedulePosition, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('popstate', mount);
    mount();
})();
