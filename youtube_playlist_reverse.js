// ==UserScript==
// @name         YouTube Playlist Reverse+
// @namespace    https://github.com/Dragosarus/Userscripts/
// @version      8.1
// @description  Enhanced reverse playlist navigation with smart features
// @author       Dragosarus & AI Assistant
// @match        *://www.youtube.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @noframes
// @run-at       document-start
// @homepage     https://github.com/Dragosarus/Userscripts/
// @supportURL   https://github.com/Dragosarus/Userscripts/issues
// ==/UserScript==

(() => {
    'use strict';

    // Configuration settings
    const CONFIG = {
        redirectThreshold: 0.5,          // Seconds before video end to trigger redirect
        miniplayerThreshold: 0.8,        // Higher threshold for miniplayer due to latency
        skipUnplayable: true,            // Skip upcoming/unavailable videos
        persistentSettings: true,        // Remember settings between sessions
        smartRedirect: true,             // Enable/disable auto-redirect feature
        debugMode: false                 // Enable debug logging
    };

    // Constants
    const SELECTORS = {
        BUTTON_CONTAINER: 'div#top-level-buttons-computed',
        VIDEO_ELEMENT: 'video',
        CURRENT_PLAYLIST_ITEM: 'ytd-playlist-panel-video-renderer[selected]',
        TIMESTAMP: 'span.ytd-thumbnail-overlay-time-status-renderer',
        MINIPLAYER: 'ytd-miniplayer',
        SHUFFLE_BUTTON: 'tp-yt-paper-icon-button[aria-label="Shuffle"]',
        AD_CONTAINER: '.ad-showing, .ad-interrupting',
        PLAYLIST_PANEL: 'ytd-playlist-panel-renderer'
    };

    // State management
    let player = null;
    let playPrevious = false;
    let mutationObserver = null;

    // Initialize script
    function init() {
        setupStyles();
        loadSettings();
        setupObservers();
        setupPlaybackChecker();
        tryInsertButton();
    }

    // Add CSS styles to document
    function setupStyles() {
        GM_addStyle(`
            #pytplir_btn {
                cursor: pointer;
                margin-left: 8px;
                transition: transform 0.2s ease;
            }
            #pytplir_btn:hover {
                transform: scale(1.05);
            }
            #pytplir_btn[activated="true"] #pytplir_arrow_up {
                fill: #40a6ff;
            }
            #pytplir_btn[activated="false"] #pytplir_arrow_down {
                fill: #40a6ff;
            }
            .pytplir_tooltip {
                position: absolute;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
                bottom: 100%;
                left: 50%;
                transform: translateX(-50%);
                font-family: Roboto, Arial, sans-serif;
            }
            #pytplir_btn:hover + .pytplir_tooltip {
                opacity: 1;
            }
            .pytplir_notification {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                z-index: 9999;
                font-family: Roboto, Arial, sans-serif;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                animation: fadeInOut 3s forwards;
            }
            @keyframes fadeInOut {
                0%, 100% { opacity: 0; transform: translateY(10px); }
                10%, 90% { opacity: 1; transform: translateY(0); }
            }
        `);
    }

    // Load saved settings
    function loadSettings() {
        playPrevious = CONFIG.persistentSettings ? 
            GM_getValue('pytplir_playPrevious', false) : false;
    }

    // Set up observers
    function setupObservers() {
        // Create observer for DOM changes
        mutationObserver = new MutationObserver(mutations => {
            if (document.querySelector(SELECTORS.BUTTON_CONTAINER)) {
                tryInsertButton();
            }
            if (!player) {
                player = document.querySelector(SELECTORS.VIDEO_ELEMENT);
            }
        });
        
        mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Set up playback checker
    function setupPlaybackChecker() {
        setInterval(checkPlaybackTime, 500);
    }

    // Create button HTML
    function createButtonHTML() {
        return `
            <div id="pytplir_div" style="position:relative">
                <svg id="pytplir_btn" width="40" height="40" viewBox="0 0 40 40" activated="${playPrevious}">
                    <circle cx="20" cy="20" r="18" fill="transparent" stroke="#909090" stroke-width="1"/>
                    <polygon id="pytplir_arrow_up" points="17,19 17,17 13,17 20,11 27,17 23,17 23,19" fill="#909090"/>
                    <polygon id="pytplir_arrow_down" points="17,21 17,23 13,23 20,29 27,23 23,23 23,21" fill="#909090"/>
                </svg>
                <div class="pytplir_tooltip">Autoplay Direction</div>
            </div>
        `;
    }

    // Insert button into UI
    function tryInsertButton() {
        const targetContainer = document.querySelector(SELECTORS.BUTTON_CONTAINER);
        if (!targetContainer) return;
        
        // Skip if button already exists
        if (targetContainer.querySelector('#pytplir_div')) {
            updateButtonState();
            return;
        }
        
        // Create and insert button
        const buttonContainer = document.createElement('div');
        buttonContainer.innerHTML = createButtonHTML();
        const button = buttonContainer.firstElementChild;
        targetContainer.appendChild(button);
        
        // Add event listener
        button.querySelector('#pytplir_btn').addEventListener('click', togglePlayDirection);
        updateButtonState();
        log('Control button added to UI');
    }

    // Toggle playback direction
    function togglePlayDirection() {
        playPrevious = !playPrevious;
        
        if (CONFIG.persistentSettings) {
            GM_setValue('pytplir_playPrevious', playPrevious);
        }
        
        updateButtonState();
        showNotification(playPrevious ? 
            "🔁 Mode: Reverse Order" : "➡️ Mode: Normal Order");
    }

    // Update button state
    function updateButtonState() {
        const button = document.querySelector('#pytplir_btn');
        if (button) {
            button.setAttribute('activated', playPrevious);
        }
    }

    // Check playback time
    function checkPlaybackTime() {
        try {
            if (!player) {
                player = document.querySelector(SELECTORS.VIDEO_ELEMENT);
            }
            if (!player || player.paused || !CONFIG.smartRedirect || !playPrevious) {
                return;
            }

            const timeLeft = player.duration - player.currentTime;
            const threshold = isMiniPlayer() ? 
                CONFIG.miniplayerThreshold : CONFIG.redirectThreshold;

            if (timeLeft < threshold && shouldRedirect()) {
                redirectToPrevious();
            }
        } catch (error) {
            log(`Error during playback check: ${error.message}`);
        }
    }

    // Redirect to previous video
    function redirectToPrevious() {
        const currentItem = document.querySelector(SELECTORS.CURRENT_PLAYLIST_ITEM);
        if (!currentItem) return;
        
        // Find previous item in playlist
        let prevItem = currentItem.previousElementSibling;
        while (prevItem) {
            if (prevItem.matches('ytd-playlist-panel-video-renderer')) {
                break;
            }
            prevItem = prevItem.previousElementSibling;
        }
        
        if (!prevItem) return;
        
        // Skip unplayable videos
        if (CONFIG.skipUnplayable) {
            const timestamp = prevItem.querySelector(SELECTORS.TIMESTAMP);
            if (timestamp && !timestamp.textContent.includes(':')) {
                log('Skipping unplayable video');
                return;
            }
        }
        
        // Find and click video link
        const videoLink = prevItem.querySelector('a#wc-endpoint');
        if (videoLink) {
            videoLink.click();
            log('Redirecting to previous video');
        }
    }

    // Helper functions
    function isMiniPlayer() {
        return !!document.querySelector(SELECTORS.MINIPLAYER);
    }

    function shouldRedirect() {
        return (
            !document.querySelector(SELECTORS.AD_CONTAINER) &&
            (!player || !player.loop) &&
            !isShuffleEnabled() &&
            document.querySelector(SELECTORS.PLAYLIST_PANEL)
        );
    }

    function isShuffleEnabled() {
        const shuffleButton = document.querySelector(SELECTORS.SHUFFLE_BUTTON);
        return shuffleButton && shuffleButton.getAttribute('aria-pressed') === 'true';
    }

    function showNotification(message) {
        // Remove existing notifications
        document.querySelectorAll('.pytplir_notification').forEach(el => el.remove());
        
        const notification = document.createElement('div');
        notification.className = 'pytplir_notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => notification.remove(), 3000);
    }

    function log(message) {
        if (CONFIG.debugMode) {
            console.log(`[YT Reverse+] ${message}`);
        }
    }

    // Initialize script when document is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();ttribute(attVal[0], attVal[1]);
            }
        }

        function appendChildren(node, childList) {
            for (let child of childList) {
                node.appendChild(child);
            }
        }

        function init() {
            // the button needs to be re-added whenever the playlist is updated (e.g when a video is loaded or removed)
            function observerCallback(mutationList, observer) {
                debugLog("Observer triggered!")
                start();
            }
            const playlistObserver = new MutationObserver(observerCallback);
            const observerOptions = {subtree:true, childList:true, characterData:true};
            initObserver(playlistObserver, observerOptions);
            playPrevious = getCookie("pytplir_playPrevious");
            if (playPrevious === "") { // cookie has not been set yet
                playPrevious = false; // inital state
                setCookie("pytplir_playPrevious", playPrevious);
            }

            start();
        }

        function initObserver(observer, options) {
            try {
                observer.observe($(selectors.playlistVideos)[0], options);
                observer.observe($(selectors.playlistVideosMiniplayer)[0], options);
            } catch (e) {
                setTimeout(function(){initObserver(observer)}, 100);
            }
        }

        function onButtonClick() { // toggle
            playPrevious = !playPrevious;
            setCookie("pytplir_playPrevious", playPrevious);
            updateButtonState();
        }

        function addButton() { // Add button(s)
            debugLog("addButton start")
            withQuery(selectors.buttonLocation, "*", function(res) {
                res.each(function() {
                    if (!$(this).find("#pytplir_div").length) {
                        this.appendChild($(btn_div).clone(true)[0]);
                        updateButtonState();
                        debugLog("button added");
                    }
                });
            });
            debugLog("addButton finish")
        }

        function updateButtonState() {
            if (playPrevious) { // play previous video
                $("polygon[id=pytplir_arrow_up]").each(function() {
                    this.setAttribute("style", "fill:" + activeColor);
                });
                $("polygon[id=pytplir_arrow_down]").each(function() {
                    this.setAttribute("style", "fill:" + inactiveColor);
                });
            } else { // play next video
                $("polygon[id=pytplir_arrow_up]").each(function() {
                    this.setAttribute("style", "fill:" + inactiveColor);
                });
                $("polygon[id=pytplir_arrow_down]").each(function() {
                    this.setAttribute("style", "fill:" + activeColor);
                });
            }
            miniplayerActive = isMiniplayerActive();
            let ctx = miniplayerActive ? selectors.miniplayerDiv : selectors.content;
            $(ctx + " #pytplir_btn")[0].setAttribute("activated", playPrevious);
            debugLog($(ctx + " #pytplir_btn"));
        }

        function start() { // Add button(s) and event listeners
            addButton();
            debugLog("playerListenersAdded = " + playerListenersAdded);
            if (!playerListenersAdded) {
                withQuery(selectors.player, ":visible", function(res) {
                    player = res[0];
                    player.addEventListener("timeupdate", checkTime);
                    player.addEventListener("play", addButton); // ensure button is added
                    playerListenersAdded = true;
                });
            }
        }

        function withQuery(query, filter="*", onSuccess = function(r){}) {
            let res;
            if (filter == "*") {
                res = $(query);
            } else {
                res = $(query).filter(filter);
            }
            if (res.length) { // >= 1 result
                onSuccess(res);
                return res;
            } else { // not loaded yet => retry
                setTimeout(function(){withQuery(query, filter, onSuccess)});
            }
        }

        function isMiniplayerActive() {
            // Youtube seems to change this quite often, and due to A/B testing all of them need to be checked
            let miniplayer_attributes = ["miniplayer-is-active", "miniplayer-active_", "miniplayer-active"];
            miniplayerActive = false;
            for (let attr of miniplayer_attributes) {
                miniplayerActive ||= ytdApp.hasAttribute(attr);
            }
            return miniplayerActive;
        }

        function checkTime() {
            let miniplayerActive = isMiniplayerActive();
            let context = miniplayerActive ? selectors.miniplayerDiv : selectors.content;
            let buttonSelector = context + " " + selectors.buttonLocation + " #pytplir_div";
            let noButton = !$(buttonSelector).length;
            let playlistHeaderQuery = miniplayerActive ? $(selectors.playlistVideosMiniplayer).parent() : $(selectors.playlistVideos).parent();
            let playlistVisible = playlistHeaderQuery.length && playlistHeaderQuery.is(":visible");

            // exit early when not watching a playlist
            if (!playlistVisible) {return;} // button not loaded
            else if (noButton) { // button was removed
                debugLog("failsafe: adding button");
                addButton();
            }

            debugLog("checkTime: miniplayer: " + miniplayerActive +
                     ", button == " + !noButton);

            let timeLeft = player.duration - player.currentTime;
            let videoPlayer = $(selectors.videoPlayer)[0];

            let redirectTime;
            let shuffleContext;
            if (miniplayerActive) {
                redirectTime = redirectWhenTimeLeft_miniplayer;
                shuffleContext = selectors.playlistButtonsMiniplayer;
            } else {
                redirectTime = redirectWhenTimeLeft;
                shuffleContext = selectors.playlistButtons;
            }

            if (!shuffle || (miniplayerActive != miniplayerFlag)) { // wysiwyg
                shuffle = $(shuffleContext + " " + selectors.shuffleButtonActive).parents("button[aria-pressed]");
                if (!shuffle.length) { // shuffle not activated or new UI has not been pushed to the user yet
                    shuffle = $(shuffleContext + " " + selectors.shuffleButtonInactive).parents("button[aria-pressed]");
                    if (!shuffle.length) { // new UI not pushed to user
                        shuffle = $(selectors.shuffleButtonLegacy).filter(":visible").parents("button[aria-pressed]");
                    }
                }
                shuffle = shuffle[0];
                miniplayerFlag = miniplayerActive;
            }
            try {videoPlayer.classList.contains("ad-showing");} // ensure it will work below
            catch (TypeError) { // video player undefined
            	return;
            }

            let shuffleEnabled;
            try {
                shuffleEnabled = strToBool(shuffle.attributes["aria-pressed"].nodeValue);
            } catch (TypeError) { // e.g. when using Queues
                shuffleEnabled = false;
            }
            if (timeLeft < redirectTime && !redirectFlag && playPrevious && !shuffleEnabled && !player.hasAttribute("loop")
                    && !videoPlayer.classList.contains("ad-showing")) {
                // attempt to prevent the default redirect from triggering
                player.pause();
                player.currentTime -= 2;

                if (getVidNum()[0] !== "1") {
                    redirectFlag = true;
                    redirect();
                    setTimeout(function() {redirectFlag = false;}, 1000);
                }
            }
        }

        function getVidNum() { // returns string array [current, total], e.g "32 / 152" => ["32", "152"]
            let vidNum;
            if (ytdApp.hasAttribute("miniplayer-active") || ytdApp.hasAttribute("miniplayer-active_")) {
                vidNum = $(selectors.playlistVideosMiniplayer);
            } else {
                vidNum = $(selectors.playlistVideos);
            }
            // the desired element is hidden; to distinguish from
            // other hidden elements, check parent's visibility
            vidNum = vidNum.filter(function(){
                return $(this).parent().is(":visible");
            })[0].innerText;

            return vidNum.split(" / ");
        }

        function redirect() {
            let previousURL = getPreviousURL();
            if (previousURL) {
                previousURL.click();
            }
        }

        function getPreviousURL(){ // returns <a> element
            let elem;
            if (ytdApp.hasAttribute("miniplayer-active") || ytdApp.hasAttribute("miniplayer-active_")) { // avoid being forced out of miniplayer mode on video load
                elem = $(selectors.miniplayerDiv).find(selectors.playlistCurrentVideo).prev();
            } else {
                elem = $(selectors.content).find(selectors.playlistCurrentVideo).prev();
            }

            let ts;
            if (skipUnplayable) {
                ts = $(elem).find(selectors.timestamp);
                if (ts.length) {ts = ts[0].innerText; }
            }
            
            while (!elem.find("#unplayableText").prop("hidden") ||
                   (skipUnplayable && typeof(ts) == "string" && !ts.includes(":"))) { // while an unplayable (e.g. private) video is selected
                elem = elem.prev();
                if (!elem.length) return null; // first video in playlist
                if (skipUnplayable) {
                    ts = $(elem).find(selectors.timestamp);
                    if (ts.length) { ts = ts[0].innerText; }
                }
            }
            return elem.children()[0];
        }

        function strToBool(str) {
            return str.toLowerCase() == "true";
        }

        function debugLog(...args) {
            if (debug) {
                args.unshift("pytplir:");
                console.log.apply(this, args);
            }
        }

        // adapted from https://www.w3schools.com/js/js_cookies.asp
        function setCookie(cname, cvalue) {
            document.cookie = cname + "=" + cvalue + ";sameSite=lax;path=www.youtube.com/watch";
        }

        function getCookie(cname) {
            let name = cname + "=";
            let decodedCookie = decodeURIComponent(document.cookie);
            let ca = decodedCookie.split(';');
            for(let i = 0; i <ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) == ' ') {
                c = c.substring(1);
                }
                if (c.indexOf(name) == 0) {
                    let x = c.substring(name.length, c.length);
                    return strToBool(x);
                }
            }
            return "";
        }
    });
})();
/*eslint-env jquery*/ // stop eslint from showing "'$' is not defined" warnings
