// ==UserScript==
// @name         BuffLink
// @namespace    local.buff-inspect-copy
// @version      2.1.2
// @description  BUFF 网站便捷扩展：在饰品列表和检视大图中一键复制 CS2 检视链接。
// @homepageURL  https://github.com/unicbm/BuffLink
// @supportURL   https://github.com/unicbm/BuffLink/issues
// @downloadURL  https://raw.githubusercontent.com/unicbm/BuffLink/main/BuffLink.user.js
// @updateURL    https://raw.githubusercontent.com/unicbm/BuffLink/main/BuffLink.user.js
// @match        https://buff.163.com/*
// @run-at       document-idle
// @sandbox      DOM
// @grant        GM.setClipboard
// @noframes
// ==/UserScript==

(() => {
    'use strict';

    const STYLE_ID = 'buff-inspect-copy-style-v2';
    const TOOLBAR = '.pswp .left_btns_box > .pswp__button_item_bottom';
    const ORIGINAL = '.pswp__button_inspect_cs2';
    const LIST_ORIGINAL = '.btn_action_link[data-assetid]:not(.pswp__button)';
    const BUTTON_CLASS = 'buff-inspect-copy-button';
    const TIMEOUT_MS = 15000;
    const states = new Map();
    let activeJob = null;
    let clipboardQueue = Promise.resolve();

    if (document.getElementById(STYLE_ID)) return;

    const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
    const icons = {
        idle: svg('<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
        loading: svg('<path d="M20 12a8 8 0 1 1-8-8"/>'),
        success: svg('<path d="m5 12 4 4L19 6"/>'),
        error: svg('<path d="m7 7 10 10M17 7 7 17"/>'),
    };
    const labels = {
        idle: '复制 CS2 检视链接',
        loading: '正在获取并复制检视链接…',
        success: '已复制 CS2 检视链接',
        error: '复制失败，点击重试',
    };
    const listLabels = { idle: '提链接', loading: '获取中', success: '已复制', error: '请重试' };

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .pswp .pswp__button.${BUTTON_CLASS} {
            display: inline-flex; position: relative; box-sizing: border-box;
            align-items: center; justify-content: center; flex-shrink: 0;
            width: 40px; height: 40px; padding: 0; border: 0;
            background-image: none !important; color: #aeb0b4;
            cursor: pointer; vertical-align: middle; touch-action: manipulation;
        }
        .${BUTTON_CLASS}[hidden] { display: none !important; }
        .pswp .${BUTTON_CLASS} > svg {
            display: block; width: 60%; height: 60%; max-width: 30px; max-height: 30px;
            pointer-events: none;
        }
        .pswp .${BUTTON_CLASS}:hover { color: #fff; }
        .pswp .${BUTTON_CLASS}:focus-visible { outline: 2px solid #8eb7ed; outline-offset: 3px; }
        .pswp .${BUTTON_CLASS}:focus-visible .pswp__button_item_hover { display: block; }
        .pswp .${BUTTON_CLASS}[data-state="loading"] { color: #c3d4ec; cursor: progress; }
        .pswp .${BUTTON_CLASS}[data-state="loading"] > svg { animation: buff-copy-spin .8s linear infinite; }
        .pswp .${BUTTON_CLASS}[data-state="success"] { color: #79d7a2; }
        .pswp .${BUTTON_CLASS}[data-state="error"] { color: #f19797; }
        .buff-link-list-button {
            display: inline-block; overflow: hidden;
            box-sizing: border-box; padding: 2px 6px; margin-left: 6px;
            border: 1px solid #dedede; border-radius: 12px; background: transparent;
            color: #707780; font: inherit; font-size: 12px; line-height: 18px;
            vertical-align: top; white-space: nowrap; cursor: pointer;
        }
        .buff-link-list-button > svg { width: 14px; height: 14px; margin-right: 3px; vertical-align: -2px; pointer-events: none; }
        .buff-link-list-button:hover { color: #4773c8; border-color: #4773c8; }
        .buff-link-list-button:focus-visible { outline: 2px solid #4773c8; outline-offset: 2px; }
        .buff-link-list-button[data-state="loading"] { color: #4773c8; cursor: progress; }
        .buff-link-list-button[data-state="loading"] > svg { animation: buff-copy-spin .8s linear infinite; }
        .buff-link-list-button[data-state="success"] { color: #177a3e; }
        .buff-link-list-button[data-state="error"] { color: #b42318; }
        .buff-inspect-copy-notice {
            position: fixed; z-index: 2147483647; left: 50%; bottom: 28px;
            transform: translateX(-50%); max-width: calc(100vw - 40px);
            padding: 9px 14px; border: 1px solid #555; border-radius: 6px;
            color: #f3f3f3; background: #202124; pointer-events: none;
            font: 13px/1.5 system-ui, sans-serif; overflow-wrap: anywhere;
        }
        .buff-inspect-copy-notice[hidden] { display: none !important; }
        @keyframes buff-copy-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
            .${BUTTON_CLASS}[data-state="loading"] > svg { animation: none; }
        }
    `;
    (document.head || document.documentElement).append(style);

    function isInspectURL(value) {
        return typeof value === 'string'
            && /^steam:\/\/run\/730\/en\/\+csgo_econ_action_preview(?:%20| )\S+$/i.test(value)
            && !/[\u0000-\u001f\u007f]/.test(value);
    }

    function readTarget(state) {
        if (!state.root.isConnected || !state.original.isConnected) {
            throw new Error(state.isList ? '饰品已从当前页面移除' : '检视窗口已关闭');
        }
        if (!state.original.classList.contains('btn_action_link')) {
            // 库存模式原按钮已带完整链接，直接复制，不发请求。
            const url = state.original.getAttribute('href');
            if (!isInspectURL(url)) throw new Error('当前饰品没有可用的检视链接');
            return { key: `url:${url}`, url };
        }

        // 列表直接使用本行原按钮的 data-assetid。
        // BUFF 大图切图时只更新原检视按钮的 jQuery .data() 缓存；
        // 同一弹窗的刷新按钮则每次都更新 DOM data-assetid，故以它为准。
        // 不从社区服按钮取 ID：网站隐藏该按钮的分支可能保留旧值。
        const refresh = state.isList ? state.original : state.root.querySelector('.pswp__button_refresh');
        const assetid = refresh?.getAttribute('data-assetid') || '';
        if (!/^\d{1,32}$/.test(assetid)) throw new Error('当前饰品 ID 尚未就绪，请稍后重试');
        return { key: `asset:${assetid}`, assetid };
    }

    function currentKey(state) {
        try { return readTarget(state).key; } catch { return ''; }
    }

    function render(state, mode = 'idle', message = labels[mode]) {
        clearTimeout(state.resetTimer);
        state.button.dataset.state = mode;
        state.button.innerHTML = icons[mode];
        state.tooltip.textContent = state.isList ? listLabels[mode] : message;
        if (state.isList) state.button.title = message;
        state.button.append(state.tooltip);
        state.button.setAttribute('aria-label', message);
        state.button.setAttribute('aria-busy', String(mode === 'loading'));
        state.button.disabled = mode === 'loading' || !state.key;
        if (mode === 'success' || mode === 'error') {
            state.resetTimer = setTimeout(() => {
                if (state.button.isConnected) render(state);
            }, mode === 'success' ? 1500 : 3000);
        }
    }

    function cancelActive() {
        if (!activeJob) return;
        const job = activeJob;
        activeJob = null;
        clearTimeout(job.timeout);
        job.controller.abort();
        render(job.state);
    }

    function sync(state) {
        const key = currentKey(state);
        const hidden = state.original.hidden || state.original.style.display === 'none';
        if (key !== state.key || hidden) {
            state.key = key;
            if (state.notice) state.notice.hidden = true;
            if (activeJob?.state === state) cancelActive();
            render(state);
        }
        state.button.hidden = hidden;
        state.button.disabled = !key || activeJob?.state === state;
    }

    function isCurrent(job) {
        return activeJob === job && job.state.button.isConnected
            && !job.state.button.hidden && currentKey(job.state) === job.key;
    }

    function showError(state, message) {
        render(state, 'error', message);
        if (!state.notice) {
            state.notice = document.createElement('div');
            state.notice.className = 'buff-inspect-copy-notice';
            state.notice.setAttribute('role', 'status');
            state.notice.setAttribute('aria-live', 'polite');
            (state.isList ? document.body : state.root).append(state.notice);
        }
        clearTimeout(state.noticeTimer);
        state.notice.textContent = message;
        state.notice.hidden = false;
        state.noticeTimer = setTimeout(() => { state.notice.hidden = true; }, 4500);
    }

    async function requestURL(target, job) {
        const url = new URL('/api/market/cs2_inspect', location.origin);
        url.searchParams.set('assetid', target.assetid);
        url.searchParams.set('_', String(Date.now()));
        job.timeout = setTimeout(() => {
            job.timedOut = true;
            job.controller.abort();
        }, TIMEOUT_MS);
        const response = await fetch(url.href, {
            method: 'GET', credentials: 'same-origin', mode: 'same-origin',
            cache: 'no-store', redirect: 'error', signal: job.controller.signal,
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Timezone-Offset-DST': String(-new Date().getTimezoneOffset() * 60000),
            },
        });
        if (!response.ok) {
            if (response.status === 429) throw new Error('请求过于频繁，请稍后重试');
            if (response.status === 401) throw new Error('请先登录 BUFF 后重试');
            throw new Error(`获取失败（HTTP ${response.status}）`);
        }
        let result;
        try { result = await response.json(); }
        catch { throw new Error('接口未返回有效 JSON，请刷新 BUFF 后重试'); }
        if (result?.code !== 'OK') {
            const detail = typeof result?.error === 'string' ? result.error.slice(0, 180) : '';
            throw new Error(detail || `接口未返回链接（${result?.code || '未知状态'}）`);
        }
        if (!isInspectURL(result.data)) throw new Error('接口返回的检视链接格式不正确');
        return result.data;
    }

    async function copy(state) {
        let target;
        try { target = readTarget(state); }
        catch (error) { showError(state, error.message); return; }
        if (activeJob?.state === state && activeJob.key === target.key) return;
        cancelActive();
        state.key = target.key;
        if (state.notice) state.notice.hidden = true;
        const job = { state, key: target.key, controller: new AbortController() };
        activeJob = job;
        render(state, 'loading');
        try {
            const url = target.url || await requestURL(target, job);
            clearTimeout(job.timeout);
            if (!isCurrent(job)) return;
            if (job.timedOut) throw new Error('获取检视链接超时，请重试');

            // 串行写入；旧请求不能在新请求之后反向覆盖剪贴板。
            const write = clipboardQueue.then(async () => {
                if (!isCurrent(job)) return false;
                if (typeof GM === 'undefined' || typeof GM.setClipboard !== 'function') {
                    throw new Error('油猴剪贴板权限不可用，请保存完整脚本并刷新页面');
                }
                await GM.setClipboard(url, 'text');
                return true;
            });
            clipboardQueue = write.catch(() => {});
            const copied = await write;
            if (copied && isCurrent(job)) {
                activeJob = null;
                render(state, 'success');
            }
        } catch (error) {
            if (isCurrent(job)) {
                activeJob = null;
                const message = job.timedOut ? '获取检视链接超时，请重试'
                    : error instanceof TypeError ? '请求或复制失败，请检查登录与网络后重试'
                    : error.message || '复制失败，请重试';
                showError(state, message);
            }
        } finally {
            clearTimeout(job.timeout);
            if (activeJob === job) {
                activeJob = null;
                render(state);
            }
        }
    }

    function matchSize(state) {
        if (state.isList) return;
        const originalStyle = getComputedStyle(state.original);
        for (const name of ['width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'border-radius', 'background-color']) {
            const value = originalStyle.getPropertyValue(name);
            if (value && value !== 'auto' && !(/^(width|height)$/.test(name) && parseFloat(value) <= 0)) {
                state.button.style.setProperty(name, value);
            }
        }
    }

    function mount(container) {
        if (states.has(container)) return;
        const isList = container.matches(LIST_ORIGINAL);
        if (isList && container.closest('.pswp')) return;
        const original = isList ? container : container.querySelector(ORIGINAL);
        const root = isList ? container.parentElement : container.closest('.pswp');
        if (!original || !root) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${isList ? 'buff-link-list-button' : 'pswp__button'} ${BUTTON_CLASS}`;
        const tooltip = document.createElement('span');
        tooltip.className = isList ? 'buff-link-list-label' : 'fixedtip pswp__button_item_hover';
        tooltip.setAttribute('aria-hidden', 'true');
        const state = { root, original, button, tooltip, isList, key: '', observer: null };
        states.set(container, state);
        if (isList) {
            (root.querySelector(':scope > .btn_game_cms') || original).after(button);
        } else {
            container.append(button); // 加到社区服按钮之后，成为第五个可见按钮。
        }
        sync(state);
        render(state);
        matchSize(state);

        // 仅拦截新增按钮，阻止 PhotoSwipe 和网站的委托点击处理。
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            void copy(state);
        }, true);
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'auxclick']) {
            button.addEventListener(type, event => event.stopPropagation(), true);
        }
        for (const type of ['keydown', 'keyup']) {
            button.addEventListener(type, event => {
                if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
            });
        }
        state.observer = new MutationObserver(() => sync(state));
        state.observer.observe(original, { attributes: true, attributeFilter: ['href', 'class', 'style', 'hidden', 'data-assetid'] });
        const refresh = isList ? null : root.querySelector('.pswp__button_refresh');
        if (refresh) state.observer.observe(refresh, { attributes: true, attributeFilter: ['data-assetid'] });
    }

    function scan(node) {
        if (!(node instanceof Element)) return;
        if (node.matches(`${TOOLBAR}, ${LIST_ORIGINAL}`)) mount(node);
        node.querySelectorAll(`${TOOLBAR}, ${LIST_ORIGINAL}`).forEach(mount);
        const toolbar = node.closest(TOOLBAR);
        if (toolbar) mount(toolbar);
    }

    const observer = new MutationObserver(records => {
        for (const [container, state] of states) {
            if (!container.isConnected || !state.button.isConnected || !state.original.isConnected) {
                if (activeJob?.state === state) cancelActive();
                state.observer.disconnect();
                clearTimeout(state.resetTimer);
                clearTimeout(state.noticeTimer);
                state.notice?.remove();
                state.button.remove();
                states.delete(container);
                if (container.isConnected) mount(container);
            }
        }
        for (const record of records) {
            for (const node of record.addedNodes) scan(node);
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.querySelectorAll(`${TOOLBAR}, ${LIST_ORIGINAL}`).forEach(mount);
    window.addEventListener('resize', () => states.forEach(matchSize), { passive: true });
})();
