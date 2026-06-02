/* ==========================================================================
   OFFLINEBOXD INTERACTIVE BROWSER HARVESTER
   ========================================================================== */

(function() {
  // 1. Establish state configurations
  const STORAGE_KEY_FILMS = "offlineboxd_harvested_films";
  const STORAGE_KEY_META = "offlineboxd_harvest_meta";
  const DELAY_BETWEEN_REQUESTS = 1200; // 1.2s delay to prevent request spikes

  // Get active session states safely using try-catch
  let harvestedFilms = [];
  try {
    harvestedFilms = JSON.parse(localStorage.getItem(STORAGE_KEY_FILMS)) || [];
  } catch (e) {
    harvestedFilms = [];
  }

  let harvestMeta = {
    url: window.location.href,
    cleanName: window.location.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_') || "my_harvest",
    currentPageNum: 1,
    isActive: false
  };
  try {
    const savedMeta = JSON.parse(localStorage.getItem(STORAGE_KEY_META));
    if (savedMeta) harvestMeta = savedMeta;
  } catch (e) {}

  // Safe global logging helper that resolves dynamic DOM lookups
  function logMessage(text, styleType = '') {
    const box = document.getElementById('ob-log');
    const line = document.createElement('div');
    line.className = 'ob-log-line';
    if (styleType === 'err') line.classList.add('ob-log-err');
    if (styleType === 'sys') line.classList.add('ob-log-sys');
    if (styleType === 'warn') line.classList.add('ob-log-warn');
    
    line.textContent = text;
    if (box) {
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }
    console.log(`[Harvester] ${text}`);
  }

  // Sound effects using Web Audio API (zero external assets needed!)
  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'warning') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220.00, ctx.currentTime); // A3
        osc.frequency.setValueAtTime(146.83, ctx.currentTime + 0.2); // D3
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === 'tick') {
        osc.frequency.setValueAtTime(880.00, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
      }
    } catch(e) {
      console.log("Audio not supported:", e);
    }
  }

  // Check if harvester panel already exists. If yes, re-show it cleanly
  const existingPanel = document.getElementById('offlineboxd-harvester-panel');
  if (existingPanel) {
    existingPanel.style.display = 'block';
    
    // Make sure stats are updated
    const txtTotal = document.getElementById('ob-val-total');
    const txtPage = document.getElementById('ob-val-page');
    if (txtTotal) txtTotal.textContent = `${harvestedFilms.length} films`;
    if (txtPage) txtPage.textContent = `Page ${harvestMeta.currentPageNum}`;
    
    logMessage("[SYSTEM] Harvester Assistant window re-opened!", 'sys');
    return;
  }

  // 2. Inject UI Panel Styling directly into page head
  const styleId = 'offlineboxd-harvester-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      #offlineboxd-harvester-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 380px;
        background: rgba(18, 25, 32, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        color: #def;
        font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        backdrop-filter: blur(12px);
        z-index: 1000000;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        animation: obSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes obSlideIn {
        from { transform: translateY(50px) scale(0.9); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      .ob-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        padding-bottom: 8px;
      }
      .ob-title {
        font-size: 16px;
        font-weight: 800;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #ff8000 0%, #00e054 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .ob-close-btn {
        background: none;
        border: none;
        color: #678;
        cursor: pointer;
        font-size: 16px;
        font-weight: bold;
      }
      .ob-close-btn:hover { color: #fff; }
      
      .ob-meta-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        font-size: 11px;
        color: #9ab;
      }
      .ob-meta-card {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.04);
        padding: 8px;
        border-radius: 6px;
      }
      .ob-meta-label {
        color: #678;
        font-weight: 700;
        text-transform: uppercase;
        font-size: 9px;
        letter-spacing: 0.5px;
        display: block;
        margin-bottom: 2px;
      }
      .ob-meta-value {
        font-size: 12px;
        font-weight: 700;
        color: #fff;
      }
      
      .ob-progress-track {
        background: rgba(255,255,255,0.04);
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        position: relative;
      }
      .ob-progress-fill {
        background: linear-gradient(90deg, #ff8000 0%, #00e054 100%);
        height: 100%;
        width: 0%;
        transition: width 0.3s ease;
        box-shadow: 0 0 8px rgba(0, 224, 84, 0.4);
      }
      
      .ob-console {
        background: #090d10;
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 8px;
        height: 100px;
        overflow-y: auto;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 8px 10px;
        color: #a8b2bd;
        line-height: 1.5;
      }
      .ob-log-line {
        margin-bottom: 2px;
        white-space: pre-wrap;
      }
      .ob-log-err { color: #ff4a4a; font-weight: bold; }
      .ob-log-sys { color: #00e054; }
      .ob-log-warn { color: #ff8000; }
      
      .ob-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px;
        border-radius: 8px;
        border: none;
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .ob-btn-primary {
        background: #00e054;
        color: #000;
      }
      .ob-btn-primary:hover { background: #00fa5e; }
      .ob-btn-secondary {
        background: rgba(255,255,255,0.05);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .ob-btn-secondary:hover { background: rgba(255,255,255,0.1); }
      .ob-btn-danger {
        background: #ff4a4a;
        color: #fff;
      }
      .ob-btn-danger:hover { background: #ff6666; }
      
      .ob-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      
      .ob-buttons-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      
      .ob-alert-card {
        background: rgba(255, 74, 74, 0.15);
        border: 1px solid rgba(255, 74, 74, 0.3);
        border-radius: 8px;
        padding: 10px;
        font-size: 11px;
        line-height: 1.4;
        color: #ffb3b3;
        display: none;
        animation: obPulseBorder 1.5s infinite ease-in-out;
      }
      @keyframes obPulseBorder {
        0% { border-color: rgba(255, 74, 74, 0.2); }
        50% { border-color: rgba(255, 74, 74, 0.6); }
        100% { border-color: rgba(255, 74, 74, 0.2); }
      }
    `;
    document.head.appendChild(style);
  }

  // 3. Inject Harvester HTML Overlay Panel
  const panel = document.createElement('div');
  panel.id = 'offlineboxd-harvester-panel';
  panel.innerHTML = `
    <div class="ob-header">
      <span class="ob-title">OFFLINEBOXD HARVESTER</span>
      <button class="ob-close-btn" id="ob-close">✕</button>
    </div>
    
    <div class="ob-meta-row">
      <div class="ob-meta-card">
        <span class="ob-meta-label">CURRENT PAGE</span>
        <span class="ob-meta-value" id="ob-val-page">1</span>
      </div>
      <div class="ob-meta-card">
        <span class="ob-meta-label">TOTAL GATHERED</span>
        <span class="ob-meta-value" id="ob-val-total">0 films</span>
      </div>
    </div>
    
    <div class="ob-progress-track">
      <div class="ob-progress-fill" id="ob-progress-bar"></div>
    </div>
    
    <div class="ob-alert-card" id="ob-alert">
      <strong>CAPTCHA DETECTED!</strong> Please solve the "Verify you are human" check in this tab, then click <strong>RESUME HARVEST</strong> inside this box.
    </div>
    
    <div class="ob-console" id="ob-log"></div>
    
    <div class="ob-buttons-grid">
      <button class="ob-btn ob-btn-primary" id="ob-btn-action">▶ START HARVEST</button>
      <button class="ob-btn ob-btn-secondary" id="ob-btn-save" disabled>💾 COMPILE & SAVE</button>
    </div>
    
    <button class="ob-btn ob-btn-danger" id="ob-btn-reset" style="width: 100%; margin-top: 5px;">✕ Reset Scraped Session</button>
  `;
  document.body.appendChild(panel);

  // Grab DOM references
  const btnAction = document.getElementById('ob-btn-action');
  const btnSave = document.getElementById('ob-btn-save');
  const btnReset = document.getElementById('ob-btn-reset');
  const btnClose = document.getElementById('ob-close');
  const txtPage = document.getElementById('ob-val-page');
  const txtTotal = document.getElementById('ob-val-total');
  const progressBar = document.getElementById('ob-progress-bar');
  const alertCard = document.getElementById('ob-alert');

  // Set initial status values
  txtPage.textContent = `Page ${harvestMeta.currentPageNum}`;
  txtTotal.textContent = `${harvestedFilms.length} films`;
  if (harvestedFilms.length > 0) btnSave.disabled = false;
  
  logMessage(`[SYSTEM] Harvester loaded. Active session has ${harvestedFilms.length} films saved.`, 'sys');

  // Handle active status loop reload auto-resumes
  if (harvestMeta.isActive) {
    logMessage("[SYSTEM] Active session detected! Auto-starting in 2 seconds...", 'sys');
    btnAction.textContent = "⏸ PAUSE HARVEST";
    btnAction.classList.remove('ob-btn-primary');
    btnAction.classList.add('ob-btn-secondary');
    setTimeout(() => {
      startHarvestLoop();
    }, 2000);
  }

  // 4. Click event mappings
  btnAction.addEventListener('click', () => {
    if (harvestMeta.isActive) {
      // Pause
      harvestMeta.isActive = false;
      saveMeta();
      btnAction.textContent = "▶ RESUME HARVEST";
      btnAction.classList.remove('ob-btn-secondary');
      btnAction.classList.add('ob-btn-primary');
      logMessage("[SYSTEM] Harvesting paused.", 'warn');
    } else {
      // Start
      harvestMeta.isActive = true;
      saveMeta();
      btnAction.textContent = "⏸ PAUSE HARVEST";
      btnAction.classList.remove('ob-btn-primary');
      btnAction.classList.add('ob-btn-secondary');
      alertCard.style.display = 'none';
      startHarvestLoop();
    }
  });

  btnSave.addEventListener('click', () => {
    btnSave.disabled = true;
    btnSave.textContent = "COMPILING...";
    logMessage("[SYSTEM] Compiling harvested databases and sending to localhost:8080...", 'sys');
    
    fetch('http://localhost:8080/api/save_harvest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_name: harvestMeta.cleanName,
        films: harvestedFilms
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        playSound('success');
        logMessage(`[SYSTEM] Success! Database saved as ${harvestMeta.cleanName}.json. You can close this tab and open your OfflineBoxd dashboard!`, 'sys');
        alert(`OfflineBoxd: Database created successfully! Saved ${harvestedFilms.length} movies.`);
        // Clean session keys
        localStorage.removeItem(STORAGE_KEY_FILMS);
        localStorage.removeItem(STORAGE_KEY_META);
        harvestedFilms = [];
        txtTotal.textContent = "0 films";
        btnSave.disabled = true;
      } else {
        playSound('warning');
        logMessage(`[ERROR] Save failed: ${data.error}`, 'err');
        btnSave.disabled = false;
        btnSave.textContent = "💾 COMPILE & SAVE";
      }
    })
    .catch(err => {
      playSound('warning');
      logMessage(`[ERROR] Connection failed. Is gui_server.py running? Error: ${err}`, 'err');
      btnSave.disabled = false;
      btnSave.textContent = "💾 COMPILE & SAVE";
    });
  });

  btnReset.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear this harvester's active session data? All currently harvested films will be wiped.")) {
      localStorage.removeItem(STORAGE_KEY_FILMS);
      localStorage.removeItem(STORAGE_KEY_META);
      harvestedFilms = [];
      harvestMeta = {
        url: window.location.href,
        cleanName: window.location.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '_') || "my_harvest",
        currentPageNum: 1,
        isActive: false
      };
      txtTotal.textContent = "0 films";
      txtPage.textContent = "Page 1";
      progressBar.style.width = "0%";
      btnSave.disabled = true;
      btnAction.disabled = false;
      btnAction.textContent = "▶ START HARVEST";
      btnAction.classList.remove('ob-btn-secondary');
      btnAction.classList.add('ob-btn-primary');
      alertCard.style.display = 'none';
      const box = document.getElementById('ob-log');
      if (box) box.innerHTML = "";
      logMessage("[SYSTEM] Session wiped. Ready for fresh harvest.", 'sys');
    }
  });

  btnClose.addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // 5. Harvester Data Core Crawling Loop
  async function startHarvestLoop() {
    logMessage("[SYSTEM] Extracting films list on current page...", 'sys');
    
    // Class-Name Independent Self-Healing Poster Discovery Flow
    let filmElements = Array.from(document.querySelectorAll('ul.poster-list li, div.poster-grid > div, .poster-container'));
    
    // Fallback: Check for data-target-link attribute dynamically across the page
    if (filmElements.length === 0) {
      const targets = document.querySelectorAll('[data-target-link]');
      const parents = new Set();
      targets.forEach(t => {
        const p = t.closest('li') || t.closest('.poster-container') || t.parentElement;
        if (p) parents.add(p);
      });
      filmElements = Array.from(parents);
    }
    
    if (filmElements.length === 0) {
      playSound('warning');
      logMessage("[ERROR] No movie posters discovered on this page! Make sure you are on a Letterboxd films browser page.", 'err');
      pauseScraping();
      return;
    }

    const items = [];
    filmElements.forEach(li => {
      // Find relative details link element robustly
      const div = li.hasAttribute('data-target-link') ? li : li.querySelector('[data-target-link]');
      if (!div) return;
      
      const slugPath = div.getAttribute('data-target-link'); // "/film/conan-the-barbarian/"
      const title = li.querySelector('img') ? li.querySelector('img').getAttribute('alt') : 'Unknown';
      const posterUrl = li.querySelector('img') ? li.querySelector('img').getAttribute('src') : '';
      
      // Extract ratings if listed
      let ownerRating = null;
      const rateAttr = li.getAttribute('data-owner-rating');
      if (rateAttr && rateAttr !== '0') {
        ownerRating = parseFloat(rateAttr) / 2;
      }
      
      items.push({ title, slugPath, posterUrl, ownerRating });
    });

    logMessage(`[SYSTEM] Discovered ${items.length} films on this page. Starting details fetch...`, 'sys');

    for (let i = 0; i < items.length; i++) {
      if (!harvestMeta.isActive) return; // loop cancelled via pause click

      const item = items[i];
      const targetFullUrl = 'https://letterboxd.com' + item.slugPath;
      
      // Skip if already harvested in previous session
      if (harvestedFilms.some(f => f.Film_URL === targetFullUrl)) {
        logMessage(`[SKIP] Already crawled: ${item.title}`);
        updateProgress(i + 1, items.length);
        continue;
      }

      logMessage(`[FETCHING] (${i+1}/${items.length}) Details for: ${item.title}`);
      playSound('tick');

      try {
        const details = await fetchFilmDetails(item);
        harvestedFilms.push(details);
        localStorage.setItem(STORAGE_KEY_FILMS, JSON.stringify(harvestedFilms));
        
        txtTotal.textContent = `${harvestedFilms.length} films`;
        btnSave.disabled = false;
        
        updateProgress(i + 1, items.length);
      } catch (err) {
        playSound('warning');
        logMessage(`[BLOCKED] Failed fetching details for ${item.title}: ${err}`, 'err');
        
        // Check if rate limited / CAPTCHA triggered
        if (err.message.includes('403') || err.message.includes('429') || err.message.includes('Captcha')) {
          triggerCaptchaAlert();
          return;
        }
        
        logMessage("[SYSTEM] Attempting to skip this film and proceed...", 'warn');
      }

      // controlled delay between film loops
      await delay(DELAY_BETWEEN_REQUESTS);
    }

    // Finished page details
    logMessage(`[PAGE COMPLETE] Done harvesting all ${items.length} films on this page!`, 'sys');
    playSound('success');

    // Attempt to locate standard "Next" page link
    const nextBtn = document.querySelector('a.next');
    if (nextBtn && nextBtn.href) {
      logMessage(`[SYSTEM] Navigating to next page: ${nextBtn.href} in 3 seconds...`, 'sys');
      
      harvestMeta.currentPageNum++;
      saveMeta();
      
      setTimeout(() => {
        window.location.href = nextBtn.href;
      }, 3000);
    } else {
      logMessage("[COMPLETE] You have harvested the very last page! No further pages found.", 'sys');
      logMessage("[SYSTEM] Click 'COMPILE & SAVE' to write the offline JSON database.", 'sys');
      harvestMeta.isActive = false;
      saveMeta();
      btnAction.disabled = true;
      btnAction.textContent = "▶ HARVEST FINISHED";
    }
  }

  // 6. Fetch Film Details sequentially inside browser
  async function fetchFilmDetails(item) {
    const filmUrl = 'https://letterboxd.com' + item.slugPath;
    
    // 1. Fetch main detail page
    const r1 = await fetch(item.slugPath);
    if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
    
    const htmlText = await r1.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');

    // Parse Title & release year
    let filmTitle = item.title;
    const titleHeader = doc.querySelector('.col-17 h1');
    if (titleHeader) filmTitle = titleHeader.textContent.trim();

    let releaseYear = 0;
    const yearTag = doc.querySelector('a[href^="/films/year/"]');
    if (yearTag) releaseYear = parseInt(yearTag.textContent.trim()) || 0;

    // Parse Director
    let director = null;
    const dirMeta = doc.querySelector('meta[name="twitter:data1"]');
    if (dirMeta) director = dirMeta.getAttribute('content');

    // Parse Runtime
    let runtime = null;
    const footerText = doc.querySelector('p.text-link.text-footer');
    if (footerText) {
      const match = footerText.textContent.match(/\d+/);
      if (match) runtime = parseInt(match[0]);
    }

    // Parse Description
    let description = null;
    const descMeta = doc.querySelector('meta[name="description"]');
    if (descMeta) description = descMeta.getAttribute('content');

    // Parse Cast
    let cast = null;
    const castDiv = doc.querySelector('#tab-panel-cast, #tab-cast');
    if (castDiv) {
      cast = Array.from(castDiv.querySelectorAll('a')).map(a => a.textContent.trim()).filter(t => t !== 'Show All…' && t !== 'Show All...');
    }

    // Parse Genres
    let genres = null;
    const genreDiv = doc.querySelector('.text-sluglist.capitalize, #tab-genres');
    if (genreDiv) {
      genres = Array.from(genreDiv.querySelectorAll('a.text-slug')).map(a => a.textContent.trim());
    }

    // Parse Details container elements
    let studios = null;
    let countries = null;
    let originalLanguage = null;
    let spokenLanguages = null;
    
    const detailsDiv = doc.querySelector('#tab-panel-details, #tab-details');
    if (detailsDiv) {
      studios = Array.from(detailsDiv.querySelectorAll('a[href^="/studio/"]')).map(a => a.textContent.trim()).filter(s => s && s.toLowerCase() !== 'studio' && s.toLowerCase() !== 'studios');
      countries = Array.from(detailsDiv.querySelectorAll('a[href^="/country/"]')).map(a => a.textContent.trim()).filter(c => c && c.toLowerCase() !== 'country' && c.toLowerCase() !== 'countries');
      
      const langTags = Array.from(detailsDiv.querySelectorAll('a[href^="/language/"]')).map(a => a.textContent.trim().replace(/\u00a0/g, ' ')).filter(l => l && l.toLowerCase() !== 'language' && l.toLowerCase() !== 'languages');
      if (langTags.length > 0) {
        originalLanguage = langTags[0];
        spokenLanguages = Array.from(new Set(langTags));
      }
    }

    // Average rating
    let avgRating = null;
    const rateMeta = doc.querySelector('meta[name="twitter:data2"]');
    if (rateMeta) {
      avgRating = parseFloat(rateMeta.getAttribute('content').slice(0, 4)) || null;
    }

    // Poster URL
    let posterUrl = item.posterUrl;
    try {
      const ldTag = doc.querySelector('script[type="application/ld+json"]');
      if (ldTag) {
        const cleanContent = ldTag.textContent.replace('/* <![CDATA[ */', '').replace('/* ]]> */', '').trim();
        const ldData = JSON.parse(cleanContent);
        if (ldData.image) posterUrl = ldData.image;
      }
    } catch(e){}

    // 2. Fetch stats
    let watches = null;
    let likes = null;
    let appearances = null;
    const slug = item.slugPath.replace(/^\/film\/|\/$/g, '');
    
    try {
      await delay(400); // subdelay
      const r2 = await fetch(`/csi/film/${slug}/stats/`);
      if (r2.ok) {
        const statsHtml = await r2.text();
        const statsDoc = parser.parseFromString(statsHtml, 'text/html');
        
        const wTag = statsDoc.querySelector('.-watches, a.icon-watched');
        if (wTag) {
          const a = wTag.tagName === 'A' ? wTag : wTag.querySelector('a');
          const digits = a.getAttribute('title').match(/\d+/g);
          if (digits) watches = parseInt(digits.join(''));
        }
        
        const lTag = statsDoc.querySelector('.-likes, a.icon-liked, a.icon-like');
        if (lTag) {
          const a = lTag.tagName === 'A' ? lTag : lTag.querySelector('a');
          const digits = a.getAttribute('title').match(/\d+/g);
          if (digits) likes = parseInt(digits.join(''));
        }
        
        const listTag = statsDoc.querySelector('.-lists, a.icon-list');
        if (listTag) {
          const a = listTag.tagName === 'A' ? listTag : listTag.querySelector('a');
          const digits = a.getAttribute('title').match(/\d+/g);
          if (digits) appearances = parseInt(digits.join(''));
        }
      }
    } catch(e){}

    // Fans count from main page link text
    let fans = 0;
    try {
      const fansTag = doc.querySelector('a[href$="/fans/"]');
      if (fansTag) {
        const text = fansTag.textContent.trim();
        const match = text.match(/\d+\.?\d*K?|\d+K?|\d+/);
        if (match) {
          let numStr = match[0];
          if (numStr.endsWith('K')) {
            fans = parseInt(parseFloat(numStr.slice(0, -1)) * 1000);
          } else {
            fans = parseInt(numStr);
          }
        }
      }
    } catch(e){}

    // 3. Fetch rating breakdown histogram
    const filmDict = {
      Film_title: filmTitle,
      Release_year: releaseYear || null,
      Director: director || null,
      Cast: cast || null,
      Average_rating: avgRating || null,
      Owner_rating: item.ownerRating || null,
      Genres: genres || null,
      Runtime: runtime || null,
      Countries: countries || null,
      Original_language: originalLanguage || null,
      Spoken_languages: spokenLanguages || null,
      Description: description || null,
      Studios: studios || null,
      Watches: watches || null,
      List_appearances: appearances || null,
      Likes: likes || null,
      Fans: fans,
      Poster_URL: posterUrl,
      Film_URL: filmUrl
    };

    // Initialize histogram star keys to 0
    const histStars = ["½", "★", "★½", "★★", "★★½", "★★★", "★★★½", "★★★★", "★★★★½", "★★★★★"];
    histStars.forEach(k => filmDict[k] = 0);
    filmDict["Total_ratings"] = 0;

    try {
      await delay(400); // subdelay
      const r3 = await fetch(`/csi/film/${slug}/rating-histogram/`);
      if (r3.ok) {
        const histHtml = await r3.text();
        const histDoc = parser.parseFromString(histHtml, 'text/html');
        const rows = histDoc.querySelectorAll('tr.column');
        let totVal = 0;
        
        rows.forEach((row, idx) => {
          const srSpan = row.querySelector('span._sr-only');
          if (srSpan) {
            const countText = srSpan.textContent.trim().split('(')[0];
            const digits = countText.match(/\d+/g);
            const count = digits ? parseInt(digits.join('')) : 0;
            const starKey = histStars[idx];
            filmDict[starKey] = count;
            totVal += count;
          }
        });
        filmDict["Total_ratings"] = totVal;
      }
    } catch(e){}

    return filmDict;
  }

  // Helper modules
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function saveMeta() {
    localStorage.setItem(STORAGE_KEY_META, JSON.stringify(harvestMeta));
  }

  function updateProgress(curr, tot) {
    const percent = Math.round((curr / tot) * 100);
    progressBar.style.width = `${percent}%`;
  }

  function pauseScraping() {
    harvestMeta.isActive = false;
    saveMeta();
    btnAction.textContent = "▶ RESUME HARVEST";
    btnAction.classList.remove('ob-btn-secondary');
    btnAction.classList.add('ob-btn-primary');
  }

  function triggerCaptchaAlert() {
    playSound('warning');
    pauseScraping();
    const alertEl = document.getElementById('ob-alert');
    if (alertEl) alertEl.style.display = 'block';
    logMessage("[BLOCKED] Cloudflare Interactive CAPTCHA challenge detected! The script has been safely paused to preserve integrity.", 'err');
    logMessage("[ACTION REQUIRED] Please click standard links on this tab to trigger and solve the verification challenge, then click RESUME HARVEST.", 'warn');
  }
})();
