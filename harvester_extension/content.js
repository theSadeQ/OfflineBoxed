/* ==========================================================================
   OFFLINEBOXD CHROME EXTENSION CONTENT CONTROLLER (CONCURRENT EDITION)
   ========================================================================== */

(function() {
  // Prevent duplicate injections
  if (document.getElementById('offlineboxd-harvester-panel') || document.getElementById('offlineboxd-launcher-badge')) {
    return;
  }

  // 1. Storage session keys
  const STORAGE_KEY_FILMS = "offlineboxd_harvested_films";
  const STORAGE_KEY_META = "offlineboxd_harvest_meta";
  const DELAY_BETWEEN_REQUESTS = 1200; // 1.2s delay to prevent rate limits

  // Get active session states safely using try-catch
  let harvestedFilms = [];
  try {
    harvestedFilms = JSON.parse(localStorage.getItem(STORAGE_KEY_FILMS)) || [];
  } catch (e) {
    harvestedFilms = [];
  }
  let lastDiscoveredCount = 0;
  let noNewItemsRetryCount = 0;

  const isLetterboxd = window.location.hostname.includes("letterboxd.com");
  const isRottenTomatoes = window.location.hostname.includes("rottentomatoes.com");
  const defaultCleanName = isRottenTomatoes ? "rt_harvest" : "my_harvest";
  const pathClean = window.location.pathname.replace(/^\/|\/$/g, '').replace(/[\/\\:*?"<>|]/g, '_');

   let harvestMeta = {
     url: window.location.href,
     cleanName: pathClean || defaultCleanName,
     currentPageNum: 1,
     isActive: false,
     threads: "72"
   };
  try {
    const savedMeta = JSON.parse(localStorage.getItem(STORAGE_KEY_META));
    if (savedMeta) harvestMeta = savedMeta;
  } catch (e) {}

  // Audio system for chimes
  function playSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'warning') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220.00, ctx.currentTime);
        osc.frequency.setValueAtTime(146.83, ctx.currentTime + 0.2);
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
    } catch(e) {}
  }

  // 2. Inject Stylesheet in page head
  const style = document.createElement('style');
  style.id = 'offlineboxd-harvester-styles';
  style.innerHTML = `
    /* Floating Launch Badge */
    #offlineboxd-launcher-badge {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff8000 0%, #00e054 100%);
      border: 2px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 30px rgba(0, 224, 84, 0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-size: 22px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #offlineboxd-launcher-badge:hover {
      transform: scale(1.1) rotate(15deg);
      box-shadow: 0 12px 35px rgba(0, 224, 84, 0.5);
      border-color: #fff;
    }
    
    /* Main Control Panel */
    #offlineboxd-harvester-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 380px;
      background: rgba(18, 25, 32, 0.97);
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
      height: 120px;
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
    
    #offlineboxd-harvester-panel select:focus {
      border-color: #00e054;
    }
  `;
  document.head.appendChild(style);

  // 3. Inject Floating launcher badge
  const badge = document.createElement('div');
  badge.id = 'offlineboxd-launcher-badge';
  badge.textContent = '🎬';
  badge.title = "OfflineBoxd Harvester Panel";
  document.body.appendChild(badge);

  // 4. Inject main control panel
  const panel = document.createElement('div');
  panel.id = 'offlineboxd-harvester-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div class="ob-header">
      <span class="ob-title">OFFLINEBOXD HARVESTER</span>
      <button class="ob-close-btn" id="ob-close">✕</button>
    </div>
    
    <div class="ob-meta-row">
      <div class="ob-meta-card">
        <span class="ob-meta-label">CURRENT PAGE</span>
        <span class="ob-meta-value" id="ob-val-page">Page 1</span>
      </div>
      <div class="ob-meta-card">
        <span class="ob-meta-label">TOTAL GATHERED</span>
        <span class="ob-meta-value" id="ob-val-total">0 films</span>
      </div>
    </div>
    
    <div class="ob-meta-card" style="width: 100%;">
      <span class="ob-meta-label">HARVEST SPEED (THREADS)</span>
      <select id="ob-val-threads" style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff; font-family: inherit; font-size: 11px; font-weight: 700; width: 100%; padding: 4px; outline: none; cursor: pointer;">
        <option value="1">1 Thread (Safest - Sequential)</option>
        <option value="2">2 Threads (Double Speed)</option>
        <option value="3">3 Threads (Recommended)</option>
        <option value="4">4 Threads (High Performance)</option>
        <option value="6">6 Threads (Very Fast)</option>
        <option value="8">8 Threads (Extreme Speed)</option>
        <option value="10">10 Threads (Maximum Turbo)</option>
        <option value="12">12 Threads (Mega Turbo)</option>
        <option value="16">16 Threads (Hyper Speed)</option>
        <option value="24">24 Threads (Ultra Speed)</option>
        <option value="32">32 Threads (Extreme Speed)</option>
        <option value="48">48 Threads (Maximum Overdrive)</option>
        <option value="64">64 Threads (Supercharged)</option>
        <option value="72">72 Threads (Absolute Maximum)</option>
      </select>
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

  // DOM elements
  const btnAction = document.getElementById('ob-btn-action');
  const btnSave = document.getElementById('ob-btn-save');
  const btnReset = document.getElementById('ob-btn-reset');
  const btnClose = document.getElementById('ob-close');
  const txtPage = document.getElementById('ob-val-page');
  const txtTotal = document.getElementById('ob-val-total');
  const progressBar = document.getElementById('ob-progress-bar');
  const alertCard = document.getElementById('ob-alert');
  const selectThreads = document.getElementById('ob-val-threads');

  // Set initial status values
  txtPage.textContent = `Page ${harvestMeta.currentPageNum}`;
  txtTotal.textContent = `${harvestedFilms.length} films`;
  if (harvestedFilms.length > 0) btnSave.disabled = false;
  if (selectThreads && harvestMeta.threads) selectThreads.value = harvestMeta.threads;

  // Toggle drawer via badge click
  badge.addEventListener('click', () => {
    if (panel.style.display === 'none') {
      panel.style.display = 'flex';
      badge.style.display = 'none';
      logMessage(`[SYSTEM] Harvester window opened. Current local session has ${harvestedFilms.length} films.`, 'sys');
    }
  });

  // Toggle drawer via close button click
  btnClose.addEventListener('click', () => {
    panel.style.display = 'none';
    badge.style.display = 'flex';
  });

  // Track threads selection changes
  if (selectThreads) {
    selectThreads.addEventListener('change', () => {
      harvestMeta.threads = selectThreads.value;
      saveMeta();
      logMessage(`[SYSTEM] Harvester speed adjusted to ${selectThreads.value} Threads.`, 'sys');
    });
  }

  // Setup logging helper dynamically
  function logMessage(text, styleType = '') {
    const box = document.getElementById('ob-log');
    if (!box) return;
    const line = document.createElement('div');
    line.className = 'ob-log-line';
    if (styleType === 'err') line.classList.add('ob-log-err');
    if (styleType === 'sys') line.classList.add('ob-log-sys');
    if (styleType === 'warn') line.classList.add('ob-log-warn');
    
    line.textContent = text;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    console.log(`[Harvester] ${text}`);
  }

  // Auto-resume state on page load!
  if (harvestMeta.isActive) {
    panel.style.display = 'flex';
    badge.style.display = 'none';
    
    btnAction.textContent = "⏸ PAUSE HARVEST";
    btnAction.classList.remove('ob-btn-primary');
    btnAction.classList.add('ob-btn-secondary');
    
    logMessage("[SYSTEM] Active crawling session detected! Automatically resuming details harvest in 2 seconds...", 'sys');
    setTimeout(() => {
      startHarvestLoop();
    }, 2000);
  }

  // Event handlers
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
    
    chrome.runtime.sendMessage({
      action: "save_harvest",
      data: {
        output_name: harvestMeta.cleanName,
        films: harvestedFilms
      }
    }, (response) => {
      if (response && response.success) {
        playSound('success');
        logMessage(`[SYSTEM] Success! Database saved as ${harvestMeta.cleanName}.json. You can close this tab and open your OfflineBoxd dashboard!`, 'sys');
        alert(`OfflineBoxd: Database created successfully! Saved ${harvestedFilms.length} movies.`);
        // Clean session keys
        localStorage.removeItem(STORAGE_KEY_FILMS);
        localStorage.removeItem(STORAGE_KEY_META);
        harvestedFilms = [];
        txtTotal.textContent = "0 films";
        btnSave.disabled = true;
        btnAction.disabled = false;
        btnAction.textContent = "▶ START HARVEST";
        btnAction.classList.remove('ob-btn-secondary');
        btnAction.classList.add('ob-btn-primary');
      } else {
        playSound('warning');
        const errMsg = (response && response.error) ? response.error : "Unknown Extension Error";
        logMessage(`[ERROR] Save failed: ${errMsg}`, 'err');
        btnSave.disabled = false;
        btnSave.textContent = "💾 COMPILE & SAVE";
      }
    });
  });

  btnReset.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear this harvester's active session data? All currently harvested films will be wiped.")) {
      localStorage.removeItem(STORAGE_KEY_FILMS);
      localStorage.removeItem(STORAGE_KEY_META);
      harvestedFilms = [];
      lastDiscoveredCount = 0;
      noNewItemsRetryCount = 0;
        const pathCleanReset = window.location.pathname.replace(/^\/|\/$/g, '').replace(/[\/\\:*?"<>|]/g, '_');
        const defaultNameReset = isRottenTomatoes ? "rt_harvest" : "my_harvest";
        harvestMeta = {
          url: window.location.href,
          cleanName: pathCleanReset || defaultNameReset,
          currentPageNum: 1,
          isActive: false,
          threads: selectThreads ? selectThreads.value : "72"
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

  // Parallel Batching Chunker Engine
  async function processInBatches(items, batchSize, filmLoopBody) {
    for (let i = 0; i < items.length; i += batchSize) {
      if (!harvestMeta.isActive) return;
      
      const chunk = items.slice(i, i + batchSize);
      
      // Run the current batch in parallel
      const promises = chunk.map((item, index) => {
        const globalIndex = i + index;
        return filmLoopBody(item, globalIndex);
      });
      
      // Wait for all fetches in this batch to complete
      try {
        await Promise.all(promises);
      } catch (err) {
        logMessage(`[SYSTEM] Batch halted due to challenge block.`, 'warn');
        return; // Halt outer batch loop if a fatal block is thrown
      }
      
      // Controlled delay between batches to protect host servers
      await delay(DELAY_BETWEEN_REQUESTS);
    }
  }

  // Crawling Engine
  // Crawling Engine
  async function startHarvestLoop() {
    if (isLetterboxd) {
      await startLetterboxdHarvestLoop();
    } else if (isRottenTomatoes) {
      await startRTHarvestLoop();
    }
  }

  async function startLetterboxdHarvestLoop() {
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

    const threadCount = selectThreads ? parseInt(selectThreads.value) : 3;
    logMessage(`[SYSTEM] Discovered ${items.length} films on this page.`, 'sys');
    logMessage(`[SYSTEM] Starting details harvest using ${threadCount} parallel threads...`, 'sys');

    // Inside-batch loop logic
    const filmLoopBody = async (item, globalIndex) => {
      if (!harvestMeta.isActive) return;
      const targetFullUrl = 'https://letterboxd.com' + item.slugPath;
      
      // Skip if already harvested in previous session
      if (harvestedFilms.some(f => f.Film_URL === targetFullUrl)) {
        logMessage(`[SKIP] Already crawled: ${item.title}`);
        updateProgress(globalIndex + 1, items.length);
        return;
      }

      logMessage(`[FETCH] Starting: ${item.title}`);
      
      try {
        const details = await fetchFilmDetails(item);
        
        // Atomically push details
        harvestedFilms.push(details);
        localStorage.setItem(STORAGE_KEY_FILMS, JSON.stringify(harvestedFilms));
        
        txtTotal.textContent = `${harvestedFilms.length} films`;
        btnSave.disabled = false;
        
        logMessage(`[DONE] Scraped: ${item.title}`, 'sys');
        updateProgress(globalIndex + 1, items.length);
      } catch (err) {
        playSound('warning');
        logMessage(`[BLOCKED] Failed fetching details for ${item.title}: ${err}`, 'err');
        
        if (err.message.includes('403') || err.message.includes('429') || err.message.includes('Captcha')) {
          triggerCaptchaAlert();
          throw err; // throw to abort current batch loop
        }
      }
    };

    // Execute the parallel batch processing chunker!
    await processInBatches(items, threadCount, filmLoopBody);

    if (!harvestMeta.isActive) return;

    // Finished page details
    logMessage(`[PAGE COMPLETE] Done harvesting all ${items.length} films on this page!`, 'sys');
    playSound('success');

    // Automatically locate standard "Next" page link
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

  async function startRTHarvestLoop() {
    logMessage("[SYSTEM] Extracting films list on current Rotten Tomatoes page...", 'sys');
    
    let items = [];
    
    // 1. Check if we are on an editorial guide list
    if (window.location.hostname.includes("editorial.rottentomatoes.com")) {
      const titles = document.querySelectorAll('a.meta-title');
      titles.forEach(a => {
        const url = a.href;
        const title = a.textContent.trim();
        const yearSpan = a.nextElementSibling || a.parentElement.querySelector('.meta-year');
        const yearText = yearSpan ? yearSpan.textContent.trim().replace(/[()]/g, '') : '';
        const year = parseInt(yearText) || null;
        
        let director = null;
        const parent = a.closest('.row.countdown-item');
        if (parent) {
          const dirEl = parent.querySelector('.director a, [class*="director"] a');
          if (dirEl) director = dirEl.textContent.trim();
        }
        
        items.push({ title, url, year, director, source: 'guide' });
      });
    } 
    // 2. Check if we are on a browse page
    else if (window.location.pathname.startsWith("/browse")) {
      const tiles = document.querySelectorAll('media-info-tile');
      tiles.forEach(tile => {
        const posterTile = tile.querySelector('poster-tile');
        if (!posterTile) return;
        const mediaUrl = posterTile.getAttribute('media-url');
        if (!mediaUrl) return;
        
        const url = mediaUrl.startsWith('http') ? mediaUrl : 'https://www.rottentomatoes.com' + mediaUrl;
        const titleEl = tile.querySelector('[data-qa="discovery-media-list-item-title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        
        items.push({ title, url, source: 'browse' });
      });
    }
    // 3. Fallback: Check if we are on a single movie detail page
    else if (window.location.pathname.startsWith("/m/")) {
      items.push({
        title: document.querySelector('h1')?.textContent.trim() || 'Current Movie',
        url: window.location.href,
        source: 'detail'
      });
    }
    
    if (items.length === 0) {
      playSound('warning');
      logMessage("[ERROR] No movies discovered on this page! Make sure you are on a Rotten Tomatoes list, guide, browse, or movie page.", 'err');
      pauseScraping();
      return;
    }
    
    const isBrowsePage = window.location.pathname.startsWith("/browse");
    if (isBrowsePage) {
      if (lastDiscoveredCount > 0 && items.length <= lastDiscoveredCount) {
        if (noNewItemsRetryCount < 3) {
          noNewItemsRetryCount++;
          logMessage(`[SYSTEM] No new movies detected yet (possible slow network). Retrying check in 2 seconds (Attempt ${noNewItemsRetryCount}/3)...`, 'warn');
          setTimeout(() => {
            if (harvestMeta.isActive) {
              startRTHarvestLoop();
            }
          }, 2000);
          return;
        } else {
          logMessage("[SYSTEM] No new movies were loaded after clicking 'Load More'. You have harvested all available movies!", 'sys');
          logMessage("[SYSTEM] Click 'COMPILE & SAVE' to write the offline JSON database.", 'sys');
          harvestMeta.isActive = false;
          saveMeta();
          btnAction.disabled = true;
          btnAction.textContent = "▶ HARVEST FINISHED";
          lastDiscoveredCount = 0;
          noNewItemsRetryCount = 0;
          return;
        }
      }
      noNewItemsRetryCount = 0;
      lastDiscoveredCount = items.length;
    }
    
    const threadCount = selectThreads ? parseInt(selectThreads.value) : 3;
    logMessage(`[SYSTEM] Discovered ${items.length} films on this page.`, 'sys');
    logMessage(`[SYSTEM] Starting details harvest using ${threadCount} parallel threads...`, 'sys');
    
    const filmLoopBody = async (item, globalIndex) => {
      if (!harvestMeta.isActive) return;
      
      if (harvestedFilms.some(f => f.Film_URL === item.url)) {
        logMessage(`[SKIP] Already crawled: ${item.title}`);
        updateProgress(globalIndex + 1, items.length);
        return;
      }
      
      logMessage(`[FETCH] Starting: ${item.title}`);
      
      try {
        const details = await fetchRTFilmDetails(item);
        
        harvestedFilms.push(details);
        localStorage.setItem(STORAGE_KEY_FILMS, JSON.stringify(harvestedFilms));
        
        txtTotal.textContent = `${harvestedFilms.length} films`;
        btnSave.disabled = false;
        
        logMessage(`[DONE] Scraped: ${item.title}`, 'sys');
        updateProgress(globalIndex + 1, items.length);
      } catch (err) {
        playSound('warning');
        logMessage(`[BLOCKED] Failed fetching details for ${item.title}: ${err}`, 'err');
        
        if (err.message.includes('403') || err.message.includes('429') || err.message.includes('Captcha')) {
          triggerCaptchaAlert();
          throw err;
        }
      }
    };
    
    await processInBatches(items, threadCount, filmLoopBody);
    
    if (!harvestMeta.isActive) return;
    
    logMessage(`[PAGE COMPLETE] Done harvesting all ${items.length} films on this page!`, 'sys');
    playSound('success');
    
    // Check if we are on a browse page and there's a "Load More" button
    const loadMoreBtn = isBrowsePage ? (document.querySelector('button[data-qa="load-more-btn"], button.load-more-btn') || 
                        Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.toLowerCase().includes('load more'))) : null;
    
    if (isBrowsePage && loadMoreBtn) {
      logMessage("[SYSTEM] Infinite scroll / Load More button detected. Clicking to load next page...", 'sys');
      loadMoreBtn.scrollIntoView({ behavior: 'smooth' });
      
      // Delay click slightly after scrolling
      setTimeout(() => {
        if (!harvestMeta.isActive) return;
        loadMoreBtn.click();
        logMessage("[SYSTEM] Loading next page. Resuming harvest in 3 seconds...", 'sys');
        
        harvestMeta.currentPageNum++;
        saveMeta();
        
        txtPage.textContent = `Page ${harvestMeta.currentPageNum}`;
        
        setTimeout(() => {
          if (!harvestMeta.isActive) return;
          startRTHarvestLoop();
        }, 3000);
      }, 800);
      
    } else {
      // For guide lists or paginated lists
      const nextBtn = document.querySelector('a.next, .nav-next a, a.nav-next, a[class*="next"]');
      if (nextBtn && nextBtn.href && nextBtn.href !== '#' && nextBtn.href !== window.location.href) {
        logMessage(`[SYSTEM] Navigating to next page: ${nextBtn.href} in 3 seconds...`, 'sys');
        
        harvestMeta.currentPageNum++;
        saveMeta();
        
        setTimeout(() => {
          window.location.href = nextBtn.href;
        }, 3000);
      } else {
        logMessage("[COMPLETE] You have harvested all movies on this page!", 'sys');
        logMessage("[SYSTEM] Click 'COMPILE & SAVE' to write the offline JSON database.", 'sys');
        harvestMeta.isActive = false;
        saveMeta();
        btnAction.disabled = true;
        btnAction.textContent = "▶ HARVEST FINISHED";
      }
    }
  }

  async function fetchRTFilmDetails(item) {
    const cleanUrl = item.url.split('/reviews')[0];
    const isDetailOnReviews = item.source === 'detail' && window.location.pathname.includes('/reviews');
    
    let doc = document;
    if (item.source !== 'detail' || isDetailOnReviews) {
      const r = await fetch(cleanUrl);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const htmlText = await r.text();
      const parser = new DOMParser();
      doc = parser.parseFromString(htmlText, 'text/html');
    }

    let scorecardData = {};
    const scorecardScript = doc.querySelector('#media-scorecard-json');
    if (scorecardScript) {
      try {
        scorecardData = JSON.parse(scorecardScript.textContent.trim());
      } catch (e) {}
    }

    let heroData = {};
    const heroScript = doc.querySelector('#media-hero-json');
    if (heroScript) {
      try {
        heroData = JSON.parse(heroScript.textContent.trim());
      } catch (e) {}
    }

    const criticsObj = scorecardData.criticsScore || {};
    const audienceObj = scorecardData.audienceScore || {};

    const tomatometer = criticsObj.scorePercent || criticsObj.score || null;
    const popcornmeter = audienceObj.scorePercent || audienceObj.score || null;
    let filmTitle = item.title || heroData.content?.episodeTitle || doc.querySelector('h1')?.textContent.trim() || 'Unknown';

    const metadataProps = heroData.content?.metadataProps || [];
    let releaseYear = item.year || null;
    let runtime = null;
    
    metadataProps.forEach(prop => {
      if (/^\d{4}$/.test(prop)) {
        releaseYear = parseInt(prop) || releaseYear;
      } else if (prop.includes('h') || prop.includes('m')) {
        let mins = 0;
        const hMatch = prop.match(/(\d+)h/);
        const mMatch = prop.match(/(\d+)m/);
        if (hMatch) mins += parseInt(hMatch[1]) * 60;
        if (mMatch) mins += parseInt(mMatch[1]);
        if (mins > 0) runtime = mins;
      }
    });

    if (!releaseYear) {
      const yearMeta = doc.querySelector('meta[name="twitter:text:release_year"]');
      if (yearMeta) releaseYear = parseInt(yearMeta.getAttribute('content')) || null;
    }
    if (!releaseYear) {
      const yearText = doc.querySelector('.score-board .year, .meta-year, [data-qa="score-panel-release-date"]');
      if (yearText) {
        const m = yearText.textContent.match(/\d{4}/);
        if (m) releaseYear = parseInt(m[0]);
      }
    }

    const description = scorecardData.description || heroData.content?.description || null;
    const genres = heroData.content?.metadataGenres || [];
    const posterUrl = heroData.content?.posterSrc || null;

    let consensus = "";
    const consensusDiv = doc.querySelector('#critics-consensus');
    if (consensusDiv) {
      const p = consensusDiv.querySelector('p');
      if (p) consensus = p.textContent.trim();
    }

    let director = item.director || null;
    if (!director) {
      const dirMeta = doc.querySelector('meta[name="twitter:data1"]');
      if (dirMeta) director = dirMeta.getAttribute('content');
    }
    if (!director) {
      const dirLink = doc.querySelector('a[href*="/celebrity/"][data-qa="movie-info-director"]');
      if (dirLink) director = dirLink.textContent.trim();
    }

    let cast = [];
    const castLinks = doc.querySelectorAll('.cast-and-crew-item a[href*="/celebrity/"]');
    castLinks.forEach(link => {
      const name = link.textContent.trim();
      if (name && !cast.includes(name)) cast.push(name);
    });
    if (cast.length === 0 && item.cast) {
      cast = item.cast.split(',').map(s => s.trim());
    }

    const reviews = [];
    const criticCards = doc.querySelectorAll('review-card-critic');
    criticCards.forEach(card => {
      try {
        const nameEl = card.querySelector('[slot="name"]');
        const pubEl = card.querySelector('[slot="publication"]');
        const reviewEl = card.querySelector('[slot="review"]');
        const iconEl = card.querySelector('score-icon-critics');
        if (nameEl && reviewEl) {
          reviews.push({
            critic: nameEl.textContent.trim(),
            publication: pubEl ? pubEl.textContent.trim() : "",
            sentiment: iconEl ? iconEl.getAttribute('sentiment') : "POSITIVE",
            snippet: reviewEl.textContent.trim()
          });
        }
      } catch(e) {}
    });

    const filmDict = {
      Film_title: filmTitle,
      Release_year: releaseYear,
      Director: director,
      Cast: cast.length > 0 ? cast : null,
      Crew: {},
      Average_rating: tomatometer ? parseFloat(tomatometer.toString().replace('%','')) / 20.0 : null,
      Owner_rating: null,
      Genres: genres.length > 0 ? genres : null,
      Themes: [],
      Runtime: runtime,
      Countries: null,
      Original_language: null,
      Spoken_languages: null,
      Description: description,
      Studios: null,
      Watches: null,
      List_appearances: null,
      Likes: null,
      Fans: 0,
      Poster_URL: posterUrl,
      Trailer_URL: null,
      Film_URL: cleanUrl,
      Rotten_Tomatoes: tomatometer ? (tomatometer.toString().includes('%') ? tomatometer : tomatometer + '%') : null,
      RT_Popcornmeter: popcornmeter ? (popcornmeter.toString().includes('%') ? popcornmeter : popcornmeter + '%') : null,
      RT_Consensus: consensus,
      RT_Reviews: reviews.length > 0 ? reviews : null
    };

    const histStars = ["½", "★", "★½", "★★", "★★½", "★★★", "★★★½", "★★★★", "★★★★½", "★★★★★"];
    histStars.forEach(k => filmDict[k] = 0);
    filmDict["Total_ratings"] = 0;

    return filmDict;
  }

  // Fetch Film Details
  async function fetchFilmDetails(item) {
    const filmUrl = 'https://letterboxd.com' + item.slugPath;
    
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

    let director = null;
    const dirMeta = doc.querySelector('meta[name="twitter:data1"]');
    if (dirMeta) director = dirMeta.getAttribute('content');

    let runtime = null;
    const footerText = doc.querySelector('p.text-link.text-footer');
    if (footerText) {
      const match = footerText.textContent.match(/\d+/);
      if (match) runtime = parseInt(match[0]);
    }

    let description = null;
    const descMeta = doc.querySelector('meta[name="description"]');
    if (descMeta) description = descMeta.getAttribute('content');

    let cast = null;
    const castDiv = doc.querySelector('#tab-panel-cast, #tab-cast, .cast-list, .cast-list-container');
    let castList = [];
    if (castDiv) {
      castList = Array.from(castDiv.querySelectorAll('a[href*="/actor/"], a.text-slug'))
        .map(a => a.textContent.trim())
        .filter(t => t && t !== 'Show All…' && t !== 'Show All...');
    }
    if (castList.length === 0) {
      castList = Array.from(doc.querySelectorAll('a[href*="/actor/"]'))
        .map(a => a.textContent.trim())
        .filter(t => t && t !== 'Show All…' && t !== 'Show All...');
    }
    if (castList.length > 0) {
      cast = castList;
    }

    let genres = null;
    let themes = [];
    const genreDiv = doc.querySelector('.text-sluglist.capitalize, #tab-genres, [id*="genre"]');
    let genresList = [];
    if (genreDiv) {
      genresList = Array.from(genreDiv.querySelectorAll('a[href*="/genre/"]'))
        .map(a => a.textContent.trim())
        .filter((value, index, self) => value && self.indexOf(value) === index);
      themes = Array.from(genreDiv.querySelectorAll('a[href*="/theme/"], a[href*="/mini-theme/"]'))
        .map(a => a.textContent.trim())
        .filter((value, index, self) => self.indexOf(value) === index);
    }
    if (genresList.length === 0) {
      genresList = Array.from(doc.querySelectorAll('a[href*="/genre/"]'))
        .map(a => a.textContent.trim())
        .filter((value, index, self) => value && self.indexOf(value) === index);
    }
    if (genresList.length > 0) {
      genres = genresList;
    }
    if (themes.length === 0) {
      themes = Array.from(doc.querySelectorAll('a[href*="/theme/"], a[href*="/mini-theme/"]'))
        .map(a => a.textContent.trim())
        .filter((value, index, self) => self.indexOf(value) === index);
    }

    let crew = {};
    const crewDiv = doc.querySelector('#tab-panel-crew, #tab-crew');
    if (crewDiv) {
      const headers = crewDiv.querySelectorAll('h3');
      headers.forEach(header => {
        const role = header.textContent.trim();
        const sibling = header.nextElementSibling;
        if (sibling) {
          const names = Array.from(sibling.querySelectorAll('a'))
            .map(a => a.textContent.trim())
            .filter(t => t !== 'Show All…' && t !== 'Show All...');
          if (names.length > 0) {
            crew[role] = names;
          }
        }
      });
    }
    if (Object.keys(crew).length === 0) {
      const roles = ['Writer', 'Producer', 'Composer', 'Cinematographer', 'Editor'];
      roles.forEach(r => {
        const links = Array.from(doc.querySelectorAll(`a[href*="/${r.toLowerCase()}/"]`));
        links.forEach(link => {
          const formattedRole = r + 's';
          if (!crew[formattedRole]) crew[formattedRole] = [];
          const name = link.textContent.trim();
          if (name && !crew[formattedRole].includes(name) && name !== 'Show All…' && name !== 'Show All...') {
            crew[formattedRole].push(name);
          }
        });
      });
    }

    let studios = null;
    let countries = null;
    let originalLanguage = null;
    let spokenLanguages = null;
    
    const detailsDiv = doc.querySelector('#tab-panel-details, #tab-details');
    const getDetailsLinks = (pattern) => {
      let elements = [];
      if (detailsDiv) {
        elements = Array.from(detailsDiv.querySelectorAll(`a[href*="${pattern}"]`));
      }
      if (elements.length === 0) {
        elements = Array.from(doc.querySelectorAll(`a[href*="${pattern}"]`));
      }
      return elements.map(a => a.textContent.trim()).filter(t => t && t !== 'Show All…' && t !== 'Show All...');
    };

    const studiosList = getDetailsLinks('/studio/');
    if (studiosList.length > 0) {
      studios = studiosList.filter(s => s && s.toLowerCase() !== 'studio' && s.toLowerCase() !== 'studios');
    }

    const countriesList = getDetailsLinks('/country/');
    if (countriesList.length > 0) {
      countries = countriesList.filter(c => c && c.toLowerCase() !== 'country' && c.toLowerCase() !== 'countries');
    }

    const langList = getDetailsLinks('/language/');
    if (langList.length > 0) {
      const filteredLangs = langList.filter(l => l && l.toLowerCase() !== 'language' && l.toLowerCase() !== 'languages');
      if (filteredLangs.length > 0) {
        originalLanguage = filteredLangs[0].replace(/\u00a0/g, ' ');
        spokenLanguages = Array.from(new Set(filteredLangs.map(l => l.replace(/\u00a0/g, ' '))));
      }
    }

    let trailerUrl = null;
    // 1. Try to find links that explicitly point to youtube trailers
    let trailerEl = doc.querySelector('a[href*="youtube.com/watch"], a[href*="youtu.be/"], a[href*="youtube.com/embed"], a.play-button[href*="youtube"]');
    if (!trailerEl) {
      // 2. Try to find play-button with data attributes
      trailerEl = doc.querySelector('a.play-button[data-video-id], a.play-button[data-video], a[data-trailer]');
    }
    if (!trailerEl) {
      // 3. General play button check, check if it points to youtube or vimeo
      const playButtons = doc.querySelectorAll('a.play-button, a.trailer-link');
      for (const btn of playButtons) {
        const href = btn.getAttribute('href') || '';
        if (href.includes('youtube.com') || href.includes('youtu.be') || href.includes('vimeo.com')) {
          trailerEl = btn;
          break;
        }
      }
    }
    if (trailerEl) {
      const href = trailerEl.getAttribute('href') || '';
      if (href.includes('youtube.com') || href.includes('youtu.be') || href.includes('vimeo.com')) {
        trailerUrl = href;
      } else {
        const videoId = trailerEl.getAttribute('data-video-id') || trailerEl.getAttribute('data-video') || trailerEl.getAttribute('data-trailer');
        if (videoId) {
          trailerUrl = `https://www.youtube.com/watch?v=${videoId}`;
        }
      }
    }

    let avgRating = null;
    const rateMeta = doc.querySelector('meta[name="twitter:data2"]');
    if (rateMeta) {
      avgRating = parseFloat(rateMeta.getAttribute('content').slice(0, 4)) || null;
    }

    let posterUrl = item.posterUrl;
    try {
      const ldTag = doc.querySelector('script[type="application/ld+json"]');
      if (ldTag) {
        const cleanContent = ldTag.textContent.replace('/* <![CDATA[ */', '').replace('/* ]]> */', '').trim();
        const ldData = JSON.parse(cleanContent);
        if (ldData.image) posterUrl = ldData.image;
      }
    } catch(e){}

    let watches = null;
    let likes = null;
    let appearances = null;
    const slug = item.slugPath.replace(/^\/film\/|\/$/g, '');
    
    // Parse stats directly from main page to eliminate extra network request
    const parseStatValue = (selector, fallbackSelector) => {
      const el = doc.querySelector(selector) || doc.querySelector(fallbackSelector);
      if (el) {
        const titleAttr = el.getAttribute('title');
        if (titleAttr) {
          const digits = titleAttr.match(/\d+/g);
          if (digits) return parseInt(digits.join(''));
        }
        const text = el.textContent || "";
        const digits = text.match(/\d+/g);
        if (digits) return parseInt(digits.join(''));
      }
      return null;
    };

    watches = parseStatValue('a.icon-watched, .icon-watched, a[href$="/members/"], .film-watch-count a', '.-watches a');
    likes = parseStatValue('a.icon-liked, a.icon-like, .icon-liked, .icon-like, a[href$="/likes/"], .film-like-count a', '.-likes a');
    appearances = parseStatValue('a.icon-list, .icon-list, a[href$="/lists/"], .film-list-count a', '.-lists a');

    // Fallback: If any stat is missing, fall back to CSI stats request to guarantee 100% correctness
    if (watches === null || likes === null || appearances === null) {
      try {
        await delay(300);
        const r2 = await fetch(`/csi/film/${slug}/stats/`);
        if (r2.ok) {
          const statsHtml = await r2.text();
          const statsDoc = parser.parseFromString(statsHtml, 'text/html');
          
          if (watches === null) {
            const wTag = statsDoc.querySelector('.-watches, a.icon-watched');
            if (wTag) {
              const a = wTag.tagName === 'A' ? wTag : wTag.querySelector('a');
              const digits = a.getAttribute('title').match(/\d+/g);
              if (digits) watches = parseInt(digits.join(''));
            }
          }
          
          if (likes === null) {
            const lTag = statsDoc.querySelector('.-likes, a.icon-liked, a.icon-like');
            if (lTag) {
              const a = lTag.tagName === 'A' ? lTag : lTag.querySelector('a');
              const digits = a.getAttribute('title').match(/\d+/g);
              if (digits) likes = parseInt(digits.join(''));
            }
          }
          
          if (appearances === null) {
            const listTag = statsDoc.querySelector('.-lists, a.icon-list');
            if (listTag) {
              const a = listTag.tagName === 'A' ? listTag : listTag.querySelector('a');
              const digits = a.getAttribute('title').match(/\d+/g);
              if (digits) appearances = parseInt(digits.join(''));
            }
          }
        }
      } catch(e){}
    }

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

    const filmDict = {
      Film_title: filmTitle,
      Release_year: releaseYear || null,
      Director: director || null,
      Cast: cast || null,
      Crew: Object.keys(crew).length > 0 ? crew : null,
      Average_rating: avgRating || null,
      Owner_rating: item.ownerRating || null,
      Genres: genres || null,
      Themes: themes.length > 0 ? themes : null,
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
      Trailer_URL: trailerUrl,
      Film_URL: filmUrl
    };

    const histStars = ["½", "★", "★½", "★★", "★★½", "★★★", "★★★½", "★★★★", "★★★★½", "★★★★★"];
    histStars.forEach(k => filmDict[k] = 0);
    filmDict["Total_ratings"] = 0;

    try {
      await delay(400);
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

  // Helpers
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Save metadata
  function saveMeta() {
    localStorage.setItem(STORAGE_KEY_META, JSON.stringify(harvestMeta));
  }

  function updateProgress(curr, tot) {
    const percent = Math.min(100, Math.round((curr / tot) * 100));
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
