// Panic button: Å swaps the whole screen to a working word-processor look-alike (and back)
(function () {
  'use strict';
  const root = document.getElementById('docs');
  const P = {
    search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
    undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
    redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
    print: 'M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z',
    spell: 'M12.45 16h2.09L9.43 3H7.57L2.46 16h2.09l1.12-3h5.64l1.14 3zm-6.02-5L8.5 5.48 10.57 11H6.43zm15.16.59l-8.09 8.09L9.83 16l-1.41 1.41 5.09 5.09L23 13l-1.41-1.41z',
    paint: 'M18 4V3c0-.55-.45-1-1-1H5c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6h1v4H9v11c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-9h8V4h-3z',
    bold: 'M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z',
    italic: 'M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z',
    under: 'M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z',
    color: 'M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z',
    hilite: 'M17.75 7L14 3.25l-10 10V17h3.75l10-10zm2.96-2.96a.996.996 0 0 0 0-1.41L18.37.29a.996.996 0 0 0-1.41 0L15 2.25 18.75 6l1.96-1.96z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
    cadd: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM13 5h-2v4H7v2h4v4h2v-4h4V9h-4z',
    image: 'M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z',
    align: 'M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z',
    spacing: 'M6 7h2.5L5 3.5 1.5 7H4v10H1.5L5 20.5 8.5 17H6V7zm4-2v2h12V5H10zm0 14h12v-2H10v2zm0-6h12v-2H10v2z',
    check: 'M22 7h-9v2h9V7zm0 8h-9v2h9v-2zM5.54 11L2 7.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 11zm0 8L2 15.46l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41L5.54 19z',
    bullet: 'M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z',
    number: 'M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z',
    outdent: 'M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
    indent: 'M3 21h18v-2H3v2zM3 8v8l4-4-4-4zm8 9h10v-2H11v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z',
    clear: 'M3.27 5L2 6.27l6.97 6.97L6.5 19h3l1.57-3.66L16.73 21 18 19.73 3.55 5.27 3.27 5zM6 5v.18L8.82 8h2.4l-.72 1.68 2.1 2.1L14.21 8H20V5H6z',
    pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    caret: 'M7 10l5 5 5-5z',
    up: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    minus: 'M19 13H5v-2h14v2z',
    more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
    lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z',
    history: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM6 12h12v2H6zm0-3h12v2H6zm0-3h12v2H6z',
    video: 'M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z',
    star: 'M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z',
    folder: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V6h5.17l2 2H20v10zm-7.84-6H8v2h4.16l-1.59 1.59L11.99 17 16 13.01 11.99 9l-1.41 1.41L12.16 12z',
    cloud: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3zm-9-3.82l-2.09-2.09L6.5 13.5 10 17l6.01-6.01-1.41-1.41z',
    doc: 'M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z',
    tmpl: 'M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14zM6 7h5v5H6zm7 0h5v2h-5zm0 3h5v2h-5zm-7 4h12v2H6z',
    mail: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h9v-2H4V8l8 5 8-5v5h2V6c0-1.1-.9-2-2-2zm-8 7L4 6h16l-8 5zm7 4l4 4-4 4v-3h-4v-2h4v-3z',
    dots: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 12h3v3H8zm5 0h3v3h-3z',
  };
  const ic = (k, s) => `<svg viewBox="0 0 24 24" width="${s || 20}" height="${s || 20}"><path d="${P[k]}"/></svg>`;
  const LOGO = '<svg viewBox="0 0 48 66" width="28" height="39"><path d="M29.4 0H4.4C2 0 0 2 0 4.4v57.2C0 64 2 66 4.4 66h39.2c2.4 0 4.4-2 4.4-4.4V18.6L29.4 0z" fill="#4285F4"/><path d="M29.4 0v14.2c0 2.4 2 4.4 4.4 4.4H48L29.4 0z" fill="#A1C2FA"/><path d="M12 31h24v3.2H12zm0 7.3h24v3.2H12zm0 7.3h24v3.2H12zm0 7.3h16.5v3.2H12z" fill="#fff"/></svg>';
  const FAVICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 66">' + LOGO.replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</svg>');

  const MENUS = {
    File: ['New', 'Open', 'Make a copy', '|', 'Share', 'Email', 'Download', '|', 'Rename', 'Move', 'Add shortcut to Drive', 'Move to bin', '|', 'Version history', 'Make available offline', '|', 'Details', 'Language', 'Page setup', 'Print'],
    Edit: ['Undo|undo|Ctrl+Z', 'Redo|redo|Ctrl+Y', '|', 'Cut|cut|Ctrl+X', 'Copy|copy|Ctrl+C', 'Paste|paste|Ctrl+V', 'Paste without formatting||Ctrl+Shift+V', '|', 'Select all|selectAll|Ctrl+A', 'Delete', '|', 'Find and replace||Ctrl+H'],
    View: ['Mode', '|', 'Show print layout', 'Show ruler', 'Show outline', 'Show equation toolbar', 'Show non-printing characters', '|', 'Full screen'],
    Insert: ['Image', 'Table', 'Building blocks', 'Smart chips', 'Link||Ctrl+K', 'Drawing', 'Chart', 'Symbols', 'Tab', 'Horizontal line|insertHorizontalRule', 'Date', 'Emoji', '|', 'Footnote', 'Headers & footers', 'Page numbers', 'Break', '|', 'Bookmark', 'Table of contents', 'Comment||Ctrl+Alt+M'],
    Format: ['Text', 'Paragraph styles', 'Align & indent', 'Line & paragraph spacing', 'Columns', 'Bullets & numbering', '|', 'Headers & footers', 'Page numbers', 'Page orientation', 'Switch to Pageless format', '|', 'Table', 'Image', 'Borders & lines', '|', 'Clear formatting|removeFormat|Ctrl+\\'],
    Tools: ['Spelling and grammar', 'Word count||Ctrl+Shift+C', 'Review suggested edits', 'Compare documents', 'Citations', 'Line numbers', 'Linked objects', 'Dictionary||Ctrl+Shift+Y', '|', 'Translate document', 'Voice typing||Ctrl+Shift+S', '|', 'Notification settings', 'Preferences', 'Accessibility'],
    Extensions: ['Add-ons', 'Apps Script'],
    Help: ['Help', 'Training', 'Updates', 'Help Docs improve', '|', 'Privacy Policy', 'Terms of Service', '|', 'Function list', 'Keyboard shortcuts||Ctrl+/'],
  };
  const FONTS = ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Courier New', 'Georgia', 'Impact', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
  const STYLES = [['Normal text', 'P'], ['Title', 'H1'], ['Subtitle', 'H4'], ['Heading 1', 'H2'], ['Heading 2', 'H3'], ['Heading 3', 'H5']];
  const ZOOMS = ['50%', '75%', '90%', '100%', '125%', '150%', '200%'];
  const COLORS = ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
    '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
    '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'];

  const sep = '<span class="dsep"></span>';
  const btn = (k, cmd, title, extra) => `<button class="dbtn" ${cmd ? `data-cmd="${cmd}"` : ''} title="${title}" ${extra || ''}>${ic(k)}</button>`;
  const ddBtn = (k, title, dd) => `<button class="dbtn dd" title="${title}" data-dd="${dd}">${ic(k)}${ic('caret', 18)}</button>`;

  root.innerHTML = `
  <div class="d-top">
    <div class="d-logo" title="Docs home">${LOGO}</div>
    <div class="d-titlecol">
      <div class="d-titlerow">
        <input class="d-title" id="dTitle" value="Untitled document" spellcheck="false">
        <button class="dbtn sm" title="Star">${ic('star', 18)}</button>
        <button class="dbtn sm" title="Move">${ic('folder', 18)}</button>
        <button class="dbtn sm" title="Document status" id="dCloud">${ic('cloud', 18)}</button>
      </div>
      <div class="d-menus" id="dMenus">${Object.keys(MENUS).map((m) => `<span class="d-menu" data-menu="${m}">${m}</span>`).join('')}</div>
    </div>
    <div class="d-right">
      <button class="dbtn big" title="Open comment history">${ic('history', 24)}</button>
      <button class="dbtn meet" title="Join a call here or present this tab to the call">${ic('video', 24)}${ic('caret', 18)}</button>
      <div class="d-share"><button class="d-share-main">${ic('lock', 18)}<span>Share</span></button><button class="d-share-dd">${ic('caret', 20)}</button></div>
      <button class="d-upgrade">Upgrade</button>
      <div class="d-avatar"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
    </div>
  </div>
  <div class="d-toolbar" id="dBar">
    <button class="d-search">${ic('search', 18)}<span>Menus</span></button>
    ${btn('undo', 'undo', 'Undo (Ctrl+Z)')}${btn('redo', 'redo', 'Redo (Ctrl+Y)')}${btn('print', 'print', 'Print (Ctrl+P)')}${btn('spell', '', 'Spelling and grammar check')}${btn('paint', '', 'Paint format')}
    <button class="dsel zoom" data-dd="zoom"><span id="dZoom">100%</span>${ic('caret', 18)}</button>${sep}
    <button class="dsel style" data-dd="style"><span id="dStyle">Normal text</span>${ic('caret', 18)}</button>${sep}
    <button class="dsel font" data-dd="font"><span id="dFont">Arial</span>${ic('caret', 18)}</button>${sep}
    <button class="dbtn" data-size="-1" title="Decrease font size">${ic('minus')}</button><input class="d-size" id="dSize" value="11"><button class="dbtn" data-size="1" title="Increase font size">${ic('plus')}</button>${sep}
    ${btn('bold', 'bold', 'Bold (Ctrl+B)', 'data-state="bold"')}${btn('italic', 'italic', 'Italic (Ctrl+I)', 'data-state="italic"')}${btn('under', 'underline', 'Underline (Ctrl+U)', 'data-state="underline"')}
    <button class="dbtn colorbtn" data-dd="fore" title="Text colour">${ic('color')}<i id="dFore" style="background:#000"></i></button>
    <button class="dbtn colorbtn" data-dd="hilite" title="Highlight colour">${ic('hilite')}<i id="dHi" style="background:transparent"></i></button>${sep}
    ${btn('link', '', 'Insert link (Ctrl+K)')}${btn('cadd', '', 'Add comment (Ctrl+Alt+M)')}${btn('image', '', 'Insert image')}${sep}
    ${ddBtn('align', 'Align & indent', 'align')}${btn('spacing', '', 'Line & paragraph spacing')}${ddBtn('check', 'Checklist', 'none')}${ddBtn('bullet', 'Bulleted list (Ctrl+Shift+8)', 'bullet')}${ddBtn('number', 'Numbered list (Ctrl+Shift+7)', 'number')}
    ${btn('outdent', 'outdent', 'Decrease indent (Ctrl+[)')}${btn('indent', 'indent', 'Increase indent (Ctrl+])')}${btn('clear', 'removeFormat', 'Clear formatting (Ctrl+\\)')}
    <span class="d-flex"></span>
    <button class="dsel mode">${ic('pencil', 18)}<span>Editing</span>${ic('caret', 18)}</button>
    <span class="dsep"></span>
    <button class="dbtn" title="Hide the menus (Ctrl+Shift+F)">${ic('up')}</button>
  </div>
  <div class="d-rulerrow"><div class="d-ruler" id="dRuler"></div></div>
  <div class="d-vruler" id="dVRuler"></div>
  <div class="d-body" id="dBody">
    <aside class="d-tabs">
      <button class="dbtn" title="Hide tabs & outlines">${ic('back')}</button>
      <div class="d-tabs-head"><span>Document tabs</span><button class="dbtn" title="Add tab">${ic('plus')}</button></div>
      <div class="d-tab"><span class="d-tab-ic">${ic('doc', 18)}</span><span>Tab 1</span><button class="dbtn sm" title="Tab options">${ic('more', 18)}</button></div>
    </aside>
    <div class="d-pagewrap" id="dWrap">
      <div class="d-page">
        <div class="d-content" id="dPage" contenteditable="true" spellcheck="true"><p><br></p></div>
        <div class="d-chips" id="dChips">
          <button data-tpl="templates">${ic('tmpl', 18)}Templates</button>
          <button data-tpl="meeting">${ic('doc', 18)}Meeting notes</button>
          <button data-tpl="email">${ic('mail', 18)}Email draft</button>
          <button data-tpl="more">${ic('dots', 18)}More</button>
        </div>
      </div>
    </div>
  </div>
  <div class="d-pop" id="dPop" hidden></div>`;

  const $ = (id) => document.getElementById(id);
  const page = $('dPage'), pop = $('dPop'), titleIn = $('dTitle'), chips = $('dChips');

  // ---------- rulers ----------
  (function rulers() {
    let h = '';
    for (let i = 0; i <= 8.5 * 8; i++) {
      const x = i * 12, inch = i % 8 === 0, half = i % 4 === 0;
      h += `<i style="left:${x}px;height:${inch ? 0 : half ? 6 : 3}px"></i>`;
      if (inch && i > 0 && i < 68) h += `<b style="left:${x}px">${i / 8 - 1 === 0 ? '' : Math.abs(i / 8 - 1)}</b>`;
    }
    h += '<b style="left:12px">1</b>';
    $('dRuler').innerHTML = `<div class="d-rmargin l"></div><div class="d-rmargin r"></div>${h}<span class="d-ind first"></span><span class="d-ind left"></span><span class="d-ind right"></span>`;
    let v = '';
    for (let i = 1; i < 11; i++) v += `<b style="top:${i * 96}px">${i}</b>`;
    for (let i = 0; i < 88; i++) v += `<i style="top:${i * 12}px;width:${i % 8 === 0 ? 0 : i % 4 === 0 ? 6 : 3}px"></i>`;
    $('dVRuler').innerHTML = v;
  })();

  // ---------- persistence ----------
  const KEY = 'friminutt.docs';
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) { if (saved.html) page.innerHTML = saved.html; if (saved.title) titleIn.value = saved.title; }
  } catch (e) {}
  let saveT;
  function save() {
    clearTimeout(saveT);
    $('dCloud').classList.add('saving');
    saveT = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ title: titleIn.value, html: page.innerHTML })); } catch (e) {}
      $('dCloud').classList.remove('saving');
    }, 600);
  }
  function emptyCheck() { chips.hidden = page.textContent.trim().length > 0 || page.querySelector('img,hr,li'); }
  page.addEventListener('input', () => { emptyCheck(); save(); });
  emptyCheck();
  titleIn.addEventListener('input', () => { if (api.visible) document.title = (titleIn.value || 'Untitled document') + ' - Google Docs'; save(); });
  titleIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); page.focus(); } });
  titleIn.addEventListener('blur', () => { if (!titleIn.value.trim()) titleIn.value = 'Untitled document'; });

  // ---------- editing commands ----------
  const exec = (cmd, val) => { page.focus(); document.execCommand(cmd, false, val); emptyCheck(); save(); refresh(); };
  let fontSize = 11;
  function applySize(n) {
    fontSize = Math.max(1, Math.min(400, n));
    $('dSize').value = fontSize;
    page.focus();
    document.execCommand('fontSize', false, '7');
    page.querySelectorAll('font[size="7"]').forEach((f) => { const s = document.createElement('span'); s.style.fontSize = fontSize + 'pt'; s.innerHTML = f.innerHTML; f.replaceWith(s); });
    save();
  }
  function refresh() {
    document.querySelectorAll('[data-state]').forEach((b) => { let on = false; try { on = document.queryCommandState(b.dataset.state); } catch (e) {} b.classList.toggle('on', on); });
    const sel = window.getSelection();
    if (!sel.rangeCount || !page.contains(sel.anchorNode)) return;
    let el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
    const cs = getComputedStyle(el);
    $('dSize').value = Math.round(parseFloat(cs.fontSize) * 0.75);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '');
    $('dFont').textContent = FONTS.includes(fam) ? fam : 'Arial';
    const blk = el.closest('h1,h2,h3,h4,h5,p,li,div');
    const tag = blk ? blk.tagName : 'P';
    const st = STYLES.find((s) => s[1] === tag);
    $('dStyle').textContent = st ? st[0] : 'Normal text';
  }
  document.addEventListener('selectionchange', () => { if (api.visible) refresh(); });

  $('dBar').addEventListener('mousedown', (e) => { if (e.target.closest('button') && !e.target.closest('#dSize')) e.preventDefault(); });
  $('dBar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cmd === 'print') { window.print(); return; }
    if (b.dataset.cmd) { exec(b.dataset.cmd); return; }
    if (b.dataset.size) { applySize(parseInt($('dSize').value, 10) + parseInt(b.dataset.size, 10)); return; }
    if (b.dataset.dd) openDD(b.dataset.dd, b);
  });
  $('dSize').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySize(parseInt(e.target.value, 10) || 11); } });

  function place(anchor) {
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, innerWidth - pop.offsetWidth - 8) + 'px';
    pop.style.top = r.bottom + 4 + 'px';
  }
  function openDD(kind, anchor) {
    let html = '';
    if (kind === 'zoom') html = ZOOMS.map((z) => `<div class="pi" data-zoom="${z}">${z}</div>`).join('');
    else if (kind === 'style') html = STYLES.map(([n, t]) => `<div class="pi st-${t}" data-block="${t}">${n}</div>`).join('');
    else if (kind === 'font') html = FONTS.map((f) => `<div class="pi" data-font="${f}" style="font-family:'${f}'">${f}</div>`).join('');
    else if (kind === 'fore' || kind === 'hilite') html = `<div class="pal">${COLORS.map((c) => `<span data-color="${c}" data-kind="${kind}" style="background:${c}"></span>`).join('')}</div>`;
    else if (kind === 'align') html = [['Left', 'justifyLeft', 'Ctrl+Shift+L'], ['Centre', 'justifyCenter', 'Ctrl+Shift+E'], ['Right', 'justifyRight', 'Ctrl+Shift+R'], ['Justified', 'justifyFull', 'Ctrl+Shift+J']].map(([n, c, k]) => `<div class="pi" data-exec="${c}">${n}<em>${k}</em></div>`).join('');
    else if (kind === 'bullet') { exec('insertUnorderedList'); return; }
    else if (kind === 'number') { exec('insertOrderedList'); return; }
    else if (MENUS[kind]) html = MENUS[kind].map((it) => { if (it === '|') return '<hr>'; const [n, c, k] = it.split('|'); return `<div class="pi" ${c ? `data-exec="${c}"` : ''}>${n}${k ? `<em>${k}</em>` : ''}</div>`; }).join('');
    else return;
    pop.innerHTML = html;
    pop.hidden = false;
    pop.className = 'd-pop ' + (MENUS[kind] ? 'menu' : kind);
    place(anchor);
  }
  pop.addEventListener('mousedown', (e) => e.preventDefault());
  pop.addEventListener('click', (e) => {
    const t = e.target.closest('[data-zoom],[data-block],[data-font],[data-color],[data-exec],.pi');
    if (!t) return;
    if (t.dataset.zoom) { $('dZoom').textContent = t.dataset.zoom; document.querySelector('.d-page').style.zoom = parseInt(t.dataset.zoom, 10) / 100; }
    else if (t.dataset.block) exec('formatBlock', t.dataset.block);
    else if (t.dataset.font) { exec('fontName', t.dataset.font); $('dFont').textContent = t.dataset.font; }
    else if (t.dataset.color) { const k = t.dataset.kind; exec(k === 'fore' ? 'foreColor' : 'hiliteColor', t.dataset.color); $(k === 'fore' ? 'dFore' : 'dHi').style.background = t.dataset.color; }
    else if (t.dataset.exec === 'print') window.print();
    else if (t.dataset.exec) exec(t.dataset.exec);
    closePop();
  });
  function closePop() { pop.hidden = true; document.querySelectorAll('.d-menu.open').forEach((m) => m.classList.remove('open')); }
  document.addEventListener('mousedown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-dd],[data-menu]')) closePop(); });
  $('dMenus').addEventListener('mousedown', (e) => e.preventDefault());
  $('dMenus').addEventListener('click', (e) => {
    const m = e.target.closest('[data-menu]'); if (!m) return;
    const wasOpen = m.classList.contains('open');
    closePop();
    if (!wasOpen) { m.classList.add('open'); openDD(m.dataset.menu, m); }
  });

  // template chips
  chips.addEventListener('mousedown', (e) => e.preventDefault());
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]'); if (!b) return;
    const d = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    if (b.dataset.tpl === 'meeting') page.innerHTML = `<h2>${d} | Meeting notes</h2><p><b>Attendees:</b> </p><p><b>Notes</b></p><ul><li><br></li></ul><p><b>Action items</b></p><ul><li><br></li></ul>`;
    else if (b.dataset.tpl === 'email') page.innerHTML = `<p style="color:#5f6368">To</p><p style="color:#5f6368">Cc</p><p style="color:#5f6368">Bcc</p><p style="color:#5f6368">Subject</p><p><br></p>`;
    else return;
    emptyCheck(); save(); page.focus();
  });
  page.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
  });

  // ---------- show / hide ----------
  const fav = document.getElementById('favicon');
  const orig = { title: document.title, icon: fav.getAttribute('href') };
  const listeners = [];
  const api = {
    visible: false,
    show() {
      if (this.visible) return;
      this.visible = true;
      orig.title = document.title;
      root.hidden = false;
      document.title = (titleIn.value || 'Untitled document') + ' - Google Docs';
      fav.setAttribute('href', FAVICON);
      listeners.forEach((f) => f(true));
      page.focus();
      const r = document.createRange(); r.selectNodeContents(page); r.collapse(false);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    },
    hide() {
      if (!this.visible) return;
      this.visible = false;
      closePop();
      root.hidden = true;
      document.title = orig.title;
      fav.setAttribute('href', orig.icon);
      if (document.activeElement) document.activeElement.blur();
      listeners.forEach((f) => f(false));
    },
    toggle() { this.visible ? this.hide() : this.show(); },
    onChange(f) { listeners.push(f); },
  };
  window.DocsDisguise = api;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'å' || e.key === 'Å') { e.preventDefault(); e.stopPropagation(); api.toggle(); }
  }, true);
})();
