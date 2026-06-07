/* ==========================================================================
   OFFLINEBOXD FRONTEND CONTROLLER
   ========================================================================== */

// Application State
let allMovies = [];
let currentDatabaseFilename = '';
let filteredMovies = [];
let currentPage = 1;
const itemsPerPage = 30;
let currentListDescription = '';

// Filter States
let selectedGenres = new Set();
const DEFAULT_EXCLUDED_GENRES = ['Documentary', 'Animation', 'Music', 'Stand-Up', 'Stand-up', 'Stand-up Comedy'];
let excludedGenres = new Set(DEFAULT_EXCLUDED_GENRES);
let selectedThemes = new Set();
let selectedStudios = new Set();
let selectedLanguages = new Set();
let selectedCountries = new Set();
let allStudiosSorted = [];
let filterYearMin = null;
let filterYearMax = null;
let filterRatingMin = 0.0;
let filterImdbRatingMin = 0.0;
let filterRtRatingMin = 0.0;
let filterMetaRatingMin = 0.0;
let filterRuntimeMin = null;
let filterRuntimeMax = null;

// People Filter States
let peopleSelectedGenres = new Set();
let peopleExcludedGenres = new Set();
let peopleSelectedThemes = new Set();
let peopleSelectedStudios = new Set();
let peopleSelectedLanguages = new Set();
let peopleSelectedCountries = new Set();
let peopleFilterYearMin = null;
let peopleFilterYearMax = null;
let peopleFilterRatingMin = 0.0;
let peopleFilterImdbRatingMin = 0.0;
let peopleFilterRtRatingMin = 0.0;
let peopleFilterMetaRatingMin = 0.0;
let peopleFilterRuntimeMin = null;
let peopleFilterRuntimeMax = null;
let peopleSortValue = 'popularity-desc';
let currentlySyncingPeople = {};
let currentPersonCredits = [];
let isDashboardSyncing = false;
let settingsIgnoreExistingRatings = localStorage.getItem('settings-ignore-existing-ratings') === 'true';
let settingsFadeWatched = localStorage.getItem('settings-fade-watched') === 'true';
let settingsHideWatched = localStorage.getItem('settings-hide-watched') === 'true';
let userWatchedMovies = new Set(JSON.parse(localStorage.getItem('offlineboxd-user-watched') || '[]'));

// DOM Elements
const navTabFilms = document.getElementById('nav-tab-films');
const navTabLists = document.getElementById('nav-tab-lists');
const navTabNews = document.getElementById('nav-tab-news');
const navTabSettings = document.getElementById('nav-tab-settings');
const appContent = document.getElementById('app-content');
const listsView = document.getElementById('lists-view');
const newsView = document.getElementById('news-view');
const settingsView = document.getElementById('settings-view');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const activeFilterBadge = document.getElementById('active-filter-badge');
const moviesGrid = document.getElementById('movies-grid');
const emptyResults = document.getElementById('empty-results');
const paginationContainer = document.getElementById('pagination');
const listTitle = document.getElementById('list-title');
const listSubtitle = document.getElementById('list-subtitle');
const btnClearFilters = document.getElementById('btn-clear-filters');

// Modal Elements
const movieModal = document.getElementById('movie-modal');
const btnModalClose = document.getElementById('btn-modal-close');
const modalPoster = document.getElementById('modal-poster');
const modalPosterFallback = document.getElementById('modal-poster-fallback');
const modalFallbackTitle = document.getElementById('modal-fallback-title');
const modalFallbackYear = document.getElementById('modal-fallback-year');
const modalTitle = document.getElementById('modal-title');
const modalYear = document.getElementById('modal-year');
const modalRuntime = document.getElementById('modal-runtime');
const modalAvgRating = document.getElementById('modal-avg-rating');
const modalImdbRating = document.getElementById('modal-imdb-rating');
const modalTmdbRating = document.getElementById('modal-tmdb-rating');
const modalRtRating = document.getElementById('modal-rt-rating');
const modalMetaRating = document.getElementById('modal-meta-rating');
const modalPhotosBtn = document.getElementById('modal-photos-btn');
const modalWatchedBtn = document.getElementById('modal-watched-btn');
const modalWatchedBtnText = document.getElementById('modal-watched-btn-text');
const modalImdbVotesWrapper = document.getElementById('modal-imdb-votes-wrapper');
const modalImdbVotes = document.getElementById('modal-imdb-votes');
const modalDirector = document.getElementById('modal-director');
const modalDescription = document.getElementById('modal-description');
const modalGenres = document.getElementById('modal-genres');
const modalThemes = document.getElementById('modal-themes');
const modalThemesGroup = document.getElementById('modal-themes-group');
const modalCast = document.getElementById('modal-cast');
const modalStudios = document.getElementById('modal-studios');
const modalCountries = document.getElementById('modal-countries');
const modalLanguages = document.getElementById('modal-languages');
const modalWatches = document.getElementById('modal-watches');
const modalLikes = document.getElementById('modal-likes');
const modalFans = document.getElementById('modal-fans');
const histogramBars = document.getElementById('histogram-bars');
const modalExternalRatingsSection = document.getElementById('modal-external-ratings-section');
const modalExternalRatingsGrid = document.getElementById('modal-external-ratings-grid');

/* --------------------------------------------------------------------------
   1. DRAG & DROP & FILE LOADING LOGIC
   -------------------------------------------------------------------------- */

// Load and parse local JSON
function loadJsonFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data) && data.length > 0) {
        initializeDatabase(data, file.name);
      } else {
        alert("The JSON database is empty or not formatted correctly.");
      }
    } catch (err) {
      alert("Error parsing JSON file. Make sure it's a valid JSON export.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function showLoadingOverlay(message) {
  let overlay = document.getElementById('db-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'db-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(10, 15, 25, 0.7)';
    overlay.style.backdropFilter = 'blur(12px)';
    overlay.style.webkitBackdropFilter = 'blur(12px)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.transition = 'opacity 0.3s ease';
    
    overlay.innerHTML = `
      <div style="text-align: center; color: #fff; font-family: system-ui, -apple-system, sans-serif;">
        <div class="db-spinner" style="
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255,255,255,0.1);
          border-top-color: #ff8000;
          border-radius: 50%;
          animation: db-spin 1s linear infinite;
          margin: 0 auto 20px auto;
        "></div>
        <h3 id="db-loading-title" style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600; letter-spacing: 0.5px;">Loading Database...</h3>
        <p id="db-loading-msg" style="margin: 0; color: #9aa0a6; font-size: 14px;">Fetching offline vault data...</p>
      </div>
      <style>
        @keyframes db-spin {
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(overlay);
  }
  document.getElementById('db-loading-title').textContent = message || 'Loading Database...';
  overlay.style.opacity = '1';
  overlay.style.pointerEvents = 'all';
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('db-loading-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }, 300);
  }
}

// Populate database & layout
function initializeDatabase(data, filename) {
  try {
    currentDatabaseFilename = filename || '';
    console.log("[OfflineBoxd] initializeDatabase called with data length:", data ? data.length : "null/undefined", "for file:", filename);
    // Normalize fields and filter out completely empty entries
    allMovies = data.filter(m => m && m.Film_title && m.Film_title !== "__metadata__");
    allMovies.forEach(m => {
      if (Array.isArray(m.Countries)) {
        m.Countries = m.Countries.filter(c => c && c.toLowerCase() !== 'country' && c.toLowerCase() !== 'countries');
      }
      if (Array.isArray(m.Spoken_languages)) {
        m.Spoken_languages = m.Spoken_languages.filter(l => l && l.toLowerCase() !== 'language' && l.toLowerCase() !== 'languages');
      }
      if (Array.isArray(m.Studios)) {
        m.Studios = m.Studios.filter(s => s && s.toLowerCase() !== 'studio' && s.toLowerCase() !== 'studios');
      }
    });
    console.log("[OfflineBoxd] allMovies populated count:", allMovies.length);
    
    // Update Header details
    const cleanName = filename.replace('.json', '').replace(/_/g, ' ');
    const metadata = data.find(m => m && m.Film_title === "__metadata__");
    if (metadata) {
      listTitle.textContent = metadata.Name || cleanName;
      currentListDescription = metadata.Description || 'Custom Offline List';
    } else {
      listTitle.textContent = cleanName;
      currentListDescription = filename.toLowerCase().includes('combined') || cleanName.toLowerCase().includes('combined')
        ? 'Automatically combined list of all libraries'
        : 'loaded from local offline vault';
    }

    updateSmartSubtitle();

    // Dynamically populate filters based on content
    buildFilterOptions();

    // Reset UI states
    selectedGenres.clear();
    excludedGenres.clear();
    DEFAULT_EXCLUDED_GENRES.forEach(g => excludedGenres.add(g));
    selectedThemes.clear();
    selectedStudios.clear();
    selectedLanguages.clear();
    selectedCountries.clear();
    filterYearMin = null;
    filterYearMax = null;
    filterRatingMin = 0.0;
    filterImdbRatingMin = 0.0;
    filterRtRatingMin = 0.0;
    filterMetaRatingMin = 0.0;
    filterRuntimeMin = null;
    filterRuntimeMax = null;

    currentlySyncingPeople = {};
    clearPeopleFiltersQuietly();
    const peopleFilterControlsEl = document.getElementById('people-filter-controls');
    if (peopleFilterControlsEl) {
      peopleFilterControlsEl.classList.add('hidden');
    }

    const minYearInput = document.getElementById('filter-year-min');
    const maxYearInput = document.getElementById('filter-year-max');
    if (minYearInput) minYearInput.value = '';
    if (maxYearInput) maxYearInput.value = '';

    const ratingInput = document.getElementById('filter-rating-min');
    if (ratingInput) ratingInput.value = 0;
    const ratingDisplay = document.getElementById('filter-rating-val');
    if (ratingDisplay) ratingDisplay.textContent = '0.0';

    const imdbRatingInput = document.getElementById('filter-imdb-rating-min');
    if (imdbRatingInput) imdbRatingInput.value = 0;
    const imdbRatingDisplay = document.getElementById('filter-imdb-rating-val');
    if (imdbRatingDisplay) imdbRatingDisplay.textContent = '0.0';

    const rtRatingInput = document.getElementById('filter-rt-rating-min');
    if (rtRatingInput) rtRatingInput.value = 0;
    const rtRatingDisplay = document.getElementById('filter-rt-rating-val');
    if (rtRatingDisplay) rtRatingDisplay.textContent = '0';

    const metaRatingInput = document.getElementById('filter-meta-rating-min');
    if (metaRatingInput) metaRatingInput.value = 0;
    const metaRatingDisplay = document.getElementById('filter-meta-rating-val');
    if (metaRatingDisplay) metaRatingDisplay.textContent = '0';

    const minRuntimeInput = document.getElementById('filter-runtime-min');
    const maxRuntimeInput = document.getElementById('filter-runtime-max');
    if (minRuntimeInput) minRuntimeInput.value = '';
    if (maxRuntimeInput) maxRuntimeInput.value = '';

    const themeSearchInput = document.getElementById('theme-search-input');
    if (themeSearchInput) themeSearchInput.value = '';

    const studioSearchInput = document.getElementById('studio-search-input');
    if (studioSearchInput) studioSearchInput.value = '';

    updateDecadePresetHighlight();
    updateRuntimePresetHighlight();

    currentPage = 1;
    searchInput.value = '';
    sortSelect.value = 'popularity-desc';

    // Transition views: switch to Films tab
    showFilmsTab();

    updateFiltersBadge();
    applyFiltersAndRender();
    hideLoadingOverlay();
  } catch (err) {
    hideLoadingOverlay();
    console.error("[OfflineBoxd Error] Error in initializeDatabase:", err);
    alert("Error initializing database: " + err.message);
  }
}

/* --------------------------------------------------------------------------
   2. DYNAMIC SIDEBAR FILTER GENERATION
   -------------------------------------------------------------------------- */

function buildFilterOptions() {
  const genres = new Set();
  const themes = new Set();
  const decades = new Set();
  const languages = new Set();
  const countries = new Set();
  const studios = new Set();

  const languageCountsMap = {};
  const countryCountsMap = {};
  const studioCountsMap = {};

  allMovies.forEach(m => {
    // Genres
    if (Array.isArray(m.Genres)) {
      m.Genres.forEach(g => { if (g) genres.add(g); });
    }
    // Themes
    if (Array.isArray(m.Themes)) {
      m.Themes.forEach(t => { if (t) themes.add(t); });
    }
    // Decade calculation
    if (m.Release_year) {
      const year = parseInt(m.Release_year);
      if (year > 0) {
        const decade = Math.floor(year / 10) * 10;
        decades.add(`${decade}s`);
      }
    }
    // Language frequency
    if (m.Original_language) {
      languages.add(m.Original_language);
      languageCountsMap[m.Original_language] = (languageCountsMap[m.Original_language] || 0) + 1;
    }
    // Countries frequency
    if (Array.isArray(m.Countries)) {
      m.Countries.forEach(c => {
        if (c) {
          countries.add(c);
          countryCountsMap[c] = (countryCountsMap[c] || 0) + 1;
        }
      });
    }
    // Studios frequency
    if (Array.isArray(m.Studios)) {
      m.Studios.forEach(s => {
        if (s) {
          studios.add(s);
          studioCountsMap[s] = (studioCountsMap[s] || 0) + 1;
        }
      });
    }
  });

  // Render Genres Filter Grid
  const genresContainer = document.getElementById('genres-filter-list');
  if (genresContainer) {
    renderFilterGroup('genres-filter-list', Array.from(genres).sort(), selectedGenres, excludedGenres);
  }
  const peopleGenresContainer = document.getElementById('people-genres-filter-list');
  if (peopleGenresContainer) {
    renderFilterGroup('people-genres-filter-list', Array.from(genres).sort(), peopleSelectedGenres, peopleExcludedGenres, applyPeopleFiltersAndRender);
  }

  // Render Themes Filter Grid
  const themesContainer = document.getElementById('themes-filter-list');
  if (themesContainer) {
    renderFilterGroup('themes-filter-list', Array.from(themes).sort(), selectedThemes);
  }
  const peopleThemesContainer = document.getElementById('people-themes-filter-list');
  if (peopleThemesContainer) {
    renderFilterGroup('people-themes-filter-list', Array.from(themes).sort(), peopleSelectedThemes, null, applyPeopleFiltersAndRender);
  }

  // Sort Languages by frequency (descending)
  const sortedLanguages = Array.from(languages).sort((a, b) => {
    const countA = languageCountsMap[a] || 0;
    const countB = languageCountsMap[b] || 0;
    if (countB !== countA) return countB - countA;
    return a.localeCompare(b);
  });

  // Render Languages Filter Grid
  const languagesContainer = document.getElementById('languages-filter-list');
  if (languagesContainer) {
    renderFilterGroup('languages-filter-list', sortedLanguages, selectedLanguages);
  }
  const peopleLanguagesContainer = document.getElementById('people-languages-filter-list');
  if (peopleLanguagesContainer) {
    renderFilterGroup('people-languages-filter-list', sortedLanguages, peopleSelectedLanguages, null, applyPeopleFiltersAndRender);
  }

  // Sort Countries by frequency (descending)
  const sortedCountries = Array.from(countries).sort((a, b) => {
    const countA = countryCountsMap[a] || 0;
    const countB = countryCountsMap[b] || 0;
    if (countB !== countA) return countB - countA;
    return a.localeCompare(b);
  });

  // Render Countries Filter Grid
  const countriesContainer = document.getElementById('countries-filter-list');
  if (countriesContainer) {
    renderFilterGroup('countries-filter-list', sortedCountries, selectedCountries);
  }
  const peopleCountriesContainer = document.getElementById('people-countries-filter-list');
  if (peopleCountriesContainer) {
    renderFilterGroup('people-countries-filter-list', sortedCountries, peopleSelectedCountries, null, applyPeopleFiltersAndRender);
  }

  // Sort Studios by frequency (descending)
  const sortedStudios = Array.from(studios).sort((a, b) => {
    const countA = studioCountsMap[a] || 0;
    const countB = studioCountsMap[b] || 0;
    if (countB !== countA) return countB - countA;
    return a.localeCompare(b);
  });
  allStudiosSorted = sortedStudios;

  // Render Studios Filter Grid
  const studiosContainer = document.getElementById('studios-filter-list');
  if (studiosContainer) {
    const studiosToRender = Array.from(new Set([
      ...Array.from(selectedStudios),
      ...sortedStudios.slice(0, 100)
    ]));
    renderFilterGroup('studios-filter-list', studiosToRender, selectedStudios);
  }
  const peopleStudiosContainer = document.getElementById('people-studios-filter-list');
  if (peopleStudiosContainer) {
    const studiosToRender = Array.from(new Set([
      ...Array.from(peopleSelectedStudios),
      ...sortedStudios.slice(0, 100)
    ]));
    renderFilterGroup('people-studios-filter-list', studiosToRender, peopleSelectedStudios, null, applyPeopleFiltersAndRender);
  }

  // Build Decade Presets
  const decadeContainer = document.getElementById('decade-presets-container');
  if (decadeContainer) {
    decadeContainer.innerHTML = '';
    const sortedDecades = Array.from(decades).sort((a, b) => b.localeCompare(a));
    sortedDecades.forEach(dec => {
      const decVal = parseInt(dec); // e.g. 1990
      const btn = document.createElement('button');
      btn.className = 'decade-preset-btn';
      btn.textContent = dec;
      btn.addEventListener('click', () => {
        const minInput = document.getElementById('filter-year-min');
        const maxInput = document.getElementById('filter-year-max');
        if (minInput && maxInput) {
          if (minInput.value == decVal && maxInput.value == (decVal + 9)) {
            minInput.value = '';
            maxInput.value = '';
          } else {
            minInput.value = decVal;
            maxInput.value = decVal + 9;
          }
          minInput.dispatchEvent(new Event('input'));
        }
      });
      decadeContainer.appendChild(btn);
    });
    updateDecadePresetHighlight();
  }

  const peopleDecadeContainer = document.getElementById('people-decade-presets-container');
  if (peopleDecadeContainer) {
    peopleDecadeContainer.innerHTML = '';
    const sortedDecades = Array.from(decades).sort((a, b) => b.localeCompare(a));
    sortedDecades.forEach(dec => {
      const decVal = parseInt(dec); // e.g. 1990
      const btn = document.createElement('button');
      btn.className = 'decade-preset-btn people-decade-preset-btn';
      btn.textContent = dec;
      btn.addEventListener('click', () => {
        const minInput = document.getElementById('people-filter-year-min');
        const maxInput = document.getElementById('people-filter-year-max');
        if (minInput && maxInput) {
          if (minInput.value == decVal && maxInput.value == (decVal + 9)) {
            minInput.value = '';
            maxInput.value = '';
          } else {
            minInput.value = decVal;
            maxInput.value = decVal + 9;
          }
          minInput.dispatchEvent(new Event('input'));
        }
      });
      peopleDecadeContainer.appendChild(btn);
    });
    updatePeopleDecadePresetHighlight();
  }
}

function renderFilterGroup(elementId, items, selectionSet, excludedSet = null, onUpdate = null) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = '';
  
  Array.from(items).forEach(item => {
    if (!item) return;
    const btn = document.createElement('button');
    btn.className = 'filter-tag';
    btn.setAttribute('data-value', item);
    
    if (selectionSet.has(item)) {
      btn.classList.add('selected');
    } else if (excludedSet && excludedSet.has(item)) {
      btn.classList.add('excluded');
    }
    
    // Add local flag SVG icon if language or country
    let flagHtml = '';
    const isLang = (elementId === 'languages-filter-list' || elementId === 'people-languages-filter-list');
    const isCountry = (elementId === 'countries-filter-list' || elementId === 'people-countries-filter-list');
    if (isLang || isCountry) {
      const isoCode = getIsoCode(item, isLang);
      if (isoCode) {
        flagHtml = `<img src="assets/flags/${isoCode}.svg" class="filter-flag-icon" alt="${item} flag" style="width: 16px; height: 12px; object-fit: cover; border-radius: 2px; margin-right: 6px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.25);">`;
      }
    }
    
    btn.innerHTML = `<span style="display: inline-flex; align-items: center;">${flagHtml}${item}</span> <span class="tag-count">0</span>`;
    
    btn.addEventListener('click', () => {
      if (excludedSet) {
        if (selectionSet.has(item)) {
          selectionSet.delete(item);
          btn.classList.remove('selected');
          excludedSet.add(item);
          btn.classList.add('excluded');
        } else if (excludedSet.has(item)) {
          excludedSet.delete(item);
          btn.classList.remove('excluded');
        } else {
          selectionSet.add(item);
          btn.classList.add('selected');
        }
      } else {
        if (selectionSet.has(item)) {
          selectionSet.delete(item);
          btn.classList.remove('selected');
        } else {
          selectionSet.add(item);
          btn.classList.add('selected');
        }
      }
      if (onUpdate) {
        onUpdate();
      } else {
        currentPage = 1;
        updateFiltersBadge();
        applyFiltersAndRender();
      }
    });
    container.appendChild(btn);
  });
}

function updateFiltersBadge() {
  const hasActiveFilters = 
    selectedGenres.size > 0 || 
    excludedGenres.size > 0 ||
    selectedThemes.size > 0 || 
    selectedStudios.size > 0 || 
    selectedLanguages.size > 0 || 
    selectedCountries.size > 0 || 
    filterYearMin !== null || 
    filterYearMax !== null || 
    filterRatingMin > 0 || 
    filterImdbRatingMin > 0 || 
    filterRtRatingMin > 0 || 
    filterMetaRatingMin > 0 || 
    filterRuntimeMin !== null || 
    filterRuntimeMax !== null;
  
  if (btnClearFilters) {
    if (hasActiveFilters) {
      btnClearFilters.classList.remove('hidden');
    } else {
      btnClearFilters.classList.add('hidden');
    }
  }
  
  if (activeFilterBadge) {
    const totalFilters = selectedGenres.size + excludedGenres.size + selectedThemes.size + selectedStudios.size + selectedLanguages.size + selectedCountries.size +
      (filterYearMin !== null || filterYearMax !== null ? 1 : 0) +
      (filterRatingMin > 0 ? 1 : 0) +
      (filterImdbRatingMin > 0 ? 1 : 0) +
      (filterRtRatingMin > 0 ? 1 : 0) +
      (filterMetaRatingMin > 0 ? 1 : 0) +
      (filterRuntimeMin !== null || filterRuntimeMax !== null ? 1 : 0);
      
    if (totalFilters > 0) {
      activeFilterBadge.textContent = totalFilters;
      activeFilterBadge.classList.remove('hidden');
    } else {
      activeFilterBadge.classList.add('hidden');
    }
  }
}

// Clear all active filters
if (btnClearFilters) {
  btnClearFilters.addEventListener('click', () => {
    selectedGenres.clear();
    excludedGenres.clear();
    DEFAULT_EXCLUDED_GENRES.forEach(g => excludedGenres.add(g));
    selectedThemes.clear();
    selectedStudios.clear();
    selectedLanguages.clear();
    selectedCountries.clear();
    
    // Reset Year Filters
    filterYearMin = null;
    filterYearMax = null;
    const filterYearMinInput = document.getElementById('filter-year-min');
    const filterYearMaxInput = document.getElementById('filter-year-max');
    if (filterYearMinInput) filterYearMinInput.value = '';
    if (filterYearMaxInput) filterYearMaxInput.value = '';
    updateDecadePresetHighlight();
    
    // Reset Rating Filter
    filterRatingMin = 0.0;
    const filterRatingMinInput = document.getElementById('filter-rating-min');
    const filterRatingValDisplay = document.getElementById('filter-rating-val');
    if (filterRatingMinInput) filterRatingMinInput.value = 0;
    if (filterRatingValDisplay) filterRatingValDisplay.textContent = '0.0';

    // Reset OMDb Ratings Filters
    filterImdbRatingMin = 0.0;
    const filterImdbRatingMinInput = document.getElementById('filter-imdb-rating-min');
    const filterImdbRatingValDisplay = document.getElementById('filter-imdb-rating-val');
    if (filterImdbRatingMinInput) filterImdbRatingMinInput.value = 0;
    if (filterImdbRatingValDisplay) filterImdbRatingValDisplay.textContent = '0.0';

    filterRtRatingMin = 0;
    const filterRtRatingMinInput = document.getElementById('filter-rt-rating-min');
    const filterRtRatingValDisplay = document.getElementById('filter-rt-rating-val');
    if (filterRtRatingMinInput) filterRtRatingMinInput.value = 0;
    if (filterRtRatingValDisplay) filterRtRatingValDisplay.textContent = '0';

    filterMetaRatingMin = 0;
    const filterMetaRatingMinInput = document.getElementById('filter-meta-rating-min');
    const filterMetaRatingValDisplay = document.getElementById('filter-meta-rating-val');
    if (filterMetaRatingMinInput) filterMetaRatingMinInput.value = 0;
    if (filterMetaRatingValDisplay) filterMetaRatingValDisplay.textContent = '0';
    
    // Reset Runtime Filters
    filterRuntimeMin = null;
    filterRuntimeMax = null;
    const filterRuntimeMinInput = document.getElementById('filter-runtime-min');
    const filterRuntimeMaxInput = document.getElementById('filter-runtime-max');
    if (filterRuntimeMinInput) filterRuntimeMinInput.value = '';
    if (filterRuntimeMaxInput) filterRuntimeMaxInput.value = '';
    updateRuntimePresetHighlight();
    
    // Clear Themes Search Input
    const themeSearchInput = document.getElementById('theme-search-input');
    if (themeSearchInput) themeSearchInput.value = '';
    
    // Clear Studios Search Input
    const studioSearchInput = document.getElementById('studio-search-input');
    if (studioSearchInput) {
      studioSearchInput.value = '';
      studioSearchInput.dispatchEvent(new Event('input'));
    }
    
    // Clear Main Search Input
    if (searchInput) searchInput.value = '';
    
    document.querySelectorAll('.filter-tag').forEach(tag => {
      tag.classList.remove('selected');
      tag.classList.remove('excluded');
      tag.classList.remove('hidden');
    });
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  });
}

function getMovieUid(m) {
  return `${m.Film_title}_${m.Release_year}`;
}

function isMovieWatched(m) {
  if (!m) return false;
  const uid1 = (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') ? m.IMDb_ID : null;
  const uid2 = `${m.Film_title}_${m.Release_year}`;
  return (uid1 && userWatchedMovies.has(uid1)) || userWatchedMovies.has(uid2);
}

function toggleMovieWatchedState(m) {
  const isWatched = isMovieWatched(m);
  const uid1 = (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') ? m.IMDb_ID : null;
  const uid2 = `${m.Film_title}_${m.Release_year}`;
  
  if (isWatched) {
    if (uid1) userWatchedMovies.delete(uid1);
    userWatchedMovies.delete(uid2);
    saveUserWatched();
    return false;
  } else {
    userWatchedMovies.add(uid2);
    saveUserWatched();
    return true;
  }
}

function getPosterImageHtml(m, cssClass = 'card-poster', hideOnError = false) {
  if (!m.Poster_URL || m.Poster_URL === 'nan' || m.Poster_URL === '-' || m.Poster_URL === '') {
    return '';
  }
  
  let localFilename = '';
  if (m.TMDb_ID) {
    localFilename = `${m.TMDb_ID}.jpg`;
  } else if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') {
    localFilename = `${m.IMDb_ID}.jpg`;
  } else if (m.Film_title) {
    const safeTitle = m.Film_title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    localFilename = `${safeTitle}_${m.Release_year || ''}.jpg`;
  }
  
  const localUrl = `assets/covers/${localFilename}`;
  
  // Escape quotes for safely embedding in HTML attributes
  const safePosterUrl = m.Poster_URL.replace(/'/g, "\\'");
  const safeLocalFilename = localFilename.replace(/'/g, "\\'");
  const safeFilmTitle = (m.Film_title || '').replace(/"/g, '&quot;');
  
  let finalFallback = '';
  if (hideOnError) {
    finalFallback = "this.style.display='none';";
  } else {
    finalFallback = "this.classList.add('hidden'); const sib=this.parentElement?this.parentElement.querySelector('.poster-fallback'):null; if(sib){sib.classList.remove('hidden');}else{this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22150%22 viewBox=%220 0 100 150%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231c252d%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%237a8c9e%22 font-size=%2210%22>No Cover</text></svg>';}";
  }
  
  const imgClassAttr = cssClass ? `class="${cssClass}"` : '';
  
  return `<img src="${localUrl}" onerror="this.onerror=function(){${finalFallback}}; this.src='${safePosterUrl}'; fetch('/api/cover/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '${safePosterUrl}', filename: '${safeLocalFilename}' }) }).catch(err => console.error(err));" alt="${safeFilmTitle} poster" loading="lazy" ${imgClassAttr}>`;
}

function saveUserWatched() {
  localStorage.setItem('offlineboxd-user-watched', JSON.stringify(Array.from(userWatchedMovies)));
  updateWatchedStatsInSettings();
}

function updateWatchedStatsInSettings() {
  const statsEl = document.getElementById('settings-watched-stats');
  if (statsEl) {
    const count = userWatchedMovies.size;
    statsEl.textContent = `You have marked ${count.toLocaleString()} film${count === 1 ? '' : 's'} as watched.`;
  }
}

/* --------------------------------------------------------------------------
   3. SEARCH, SORT, FILTER & PAGINATION CORE ALGORITHMS
   -------------------------------------------------------------------------- */

function applyFiltersAndRender() {
  try {
    const searchVal = searchInput.value.toLowerCase().trim();
    console.log("[OfflineBoxd] applyFiltersAndRender called. searchVal:", searchVal, "allMovies count:", allMovies.length);

    filteredMovies = allMovies.filter(m => {
      // Hide Watched Filter
      if (settingsHideWatched && isMovieWatched(m)) {
        return false;
      }

      // 1. Text Search matching title, director, cast, crew (default), or specific fields via prefixes (e.g. desc:, theme:)
      if (searchVal) {
        let query = searchVal;
        let field = null;
        
        const colonIndex = searchVal.indexOf(':');
        if (colonIndex > 0) {
          const prefix = searchVal.substring(0, colonIndex).toLowerCase();
          const rest = searchVal.substring(colonIndex + 1).trim();
          if (rest) {
            if (prefix === 'desc' || prefix === 'plot' || prefix === 'description') {
              field = 'description';
              query = rest;
            } else if (prefix === 'theme') {
              field = 'theme';
              query = rest;
            } else if (prefix === 'genre') {
              field = 'genre';
              query = rest;
            } else if (prefix === 'studio') {
              field = 'studio';
              query = rest;
            } else if (prefix === 'country') {
              field = 'country';
              query = rest;
            } else if (prefix === 'director') {
              field = 'director';
              query = rest;
            } else if (prefix === 'cast' || prefix === 'actor') {
              field = 'cast';
              query = rest;
            } else if (prefix === 'title') {
              field = 'title';
              query = rest;
            }
          }
        }

        let isMatch = false;

        if (field === 'description') {
          isMatch = m.Description && typeof m.Description === 'string' && m.Description.toLowerCase().includes(query);
        } else if (field === 'theme') {
          isMatch = Array.isArray(m.Themes) ? m.Themes.some(t => t && typeof t === 'string' && t.toLowerCase().includes(query)) : (m.Themes && typeof m.Themes === 'string' && m.Themes.toLowerCase().includes(query));
        } else if (field === 'genre') {
          isMatch = Array.isArray(m.Genres) ? m.Genres.some(g => g && typeof g === 'string' && g.toLowerCase().includes(query)) : (m.Genres && typeof m.Genres === 'string' && m.Genres.toLowerCase().includes(query));
        } else if (field === 'studio') {
          isMatch = Array.isArray(m.Studios) ? m.Studios.some(s => s && typeof s === 'string' && s.toLowerCase().includes(query)) : (m.Studios && typeof m.Studios === 'string' && m.Studios.toLowerCase().includes(query));
        } else if (field === 'country') {
          isMatch = Array.isArray(m.Countries) ? m.Countries.some(c => c && typeof c === 'string' && c.toLowerCase().includes(query)) : (m.Countries && typeof m.Countries === 'string' && m.Countries.toLowerCase().includes(query));
        } else if (field === 'director') {
          isMatch = m.Director && typeof m.Director === 'string' && m.Director.toLowerCase().includes(query);
        } else if (field === 'cast') {
          isMatch = Array.isArray(m.Cast) && m.Cast.some(c => c && typeof c === 'string' && c.toLowerCase().includes(query));
        } else if (field === 'title') {
          isMatch = m.Film_title && typeof m.Film_title === 'string' && m.Film_title.toLowerCase().includes(query);
        } else {
          // Default: Match Title, Director, Cast, and Crew names
          const matchTitle = m.Film_title && typeof m.Film_title === 'string' && m.Film_title.toLowerCase().includes(query);
          const matchDirector = m.Director && typeof m.Director === 'string' && m.Director.toLowerCase().includes(query);
          const matchCast = Array.isArray(m.Cast) && m.Cast.some(c => c && typeof c === 'string' && c.toLowerCase().includes(query));
          const matchCrew = m.Crew && typeof m.Crew === 'object' && Object.entries(m.Crew).some(([role, names]) => {
            if (Array.isArray(names)) {
              return names.some(n => n && typeof n === 'string' && n.toLowerCase().includes(query)) || (role && role.toLowerCase().includes(query));
            }
            return (typeof names === 'string' && names.toLowerCase().includes(query)) || (role && role.toLowerCase().includes(query));
          });
          isMatch = matchTitle || matchDirector || matchCast || matchCrew;
        }

        if (!isMatch) {
          return false;
        }
      }

      // 2. Genres filter
      if (selectedGenres.size > 0) {
        const hasGenre = Array.isArray(m.Genres) && m.Genres.some(g => selectedGenres.has(g));
        if (!hasGenre) {
          return false;
        }
      }
      if (excludedGenres.size > 0) {
        const hasExcludedGenre = Array.isArray(m.Genres) && m.Genres.some(g => excludedGenres.has(g));
        if (hasExcludedGenre) {
          return false;
        }
      }

      // Themes filter
      if (selectedThemes.size > 0) {
        const hasTheme = Array.isArray(m.Themes) && m.Themes.some(t => selectedThemes.has(t));
        if (!hasTheme) {
          return false;
        }
      }

      // 3. Year Range Filter
      const year = parseInt(m.Release_year);
      if (filterYearMin !== null || filterYearMax !== null) {
        if (year > 0) {
          if (filterYearMin !== null && year < filterYearMin) {
            return false;
          }
          if (filterYearMax !== null && year > filterYearMax) {
            return false;
          }
        } else {
          return false;
        }
      }

      // Rating Filter
      const rating = parseFloat(m.Average_rating);
      if (filterRatingMin > 0) {
        if (!rating || rating < filterRatingMin) {
          return false;
        }
      }

      // IMDb Rating Filter
      if (filterImdbRatingMin > 0) {
        let imdbRating = null;
        if (m.IMDb_Rating && m.IMDb_Rating !== 'None') {
          imdbRating = parseFloat(m.IMDb_Rating.split('/')[0]);
        } else if (m.TMDb_Rating && m.TMDb_Rating !== 'None') {
          imdbRating = parseFloat(m.TMDb_Rating.split('/')[0]);
        }
        if (!imdbRating || imdbRating < filterImdbRatingMin) {
          return false;
        }
      }

      // Rotten Tomatoes Rating Filter
      if (filterRtRatingMin > 0) {
        let rtRating = null;
        if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None') {
          rtRating = parseInt(m.Rotten_Tomatoes.replace('%', ''));
        }
        if (!rtRating || rtRating < filterRtRatingMin) {
          return false;
        }
      }

      // Metascore Rating Filter
      if (filterMetaRatingMin > 0) {
        let metascore = null;
        if (m.Metascore && m.Metascore !== 'None') {
          metascore = parseInt(m.Metascore.split('/')[0]);
        }
        if (!metascore || metascore < filterMetaRatingMin) {
          return false;
        }
      }

      // Runtime Filter
      const runtime = parseInt(m.Runtime);
      if (filterRuntimeMin !== null || filterRuntimeMax !== null) {
        if (runtime > 0) {
          if (filterRuntimeMin !== null && runtime < filterRuntimeMin) {
            return false;
          }
          if (filterRuntimeMax !== null && runtime > filterRuntimeMax) {
            return false;
          }
        } else {
          return false;
        }
      }

      // 4. Original Language filter
      if (selectedLanguages.size > 0) {
        if (!m.Original_language || !selectedLanguages.has(m.Original_language)) {
          return false;
        }
      }

      // 5. Country filter
      if (selectedCountries.size > 0) {
        if (!Array.isArray(m.Countries) || !m.Countries.some(c => selectedCountries.has(c))) {
          return false;
        }
      }

      // Studios filter
      if (selectedStudios.size > 0) {
        if (!Array.isArray(m.Studios) || !m.Studios.some(s => selectedStudios.has(s))) {
          return false;
        }
      }

      return true;
    });

    // Apply sorting
    sortMovies();

    // Update Dynamic Statistics HUD Panel
    updateStatsHUD();

    // Update smart subtitle
    updateSmartSubtitle();

    // Update dynamic filter sidebar tag count badges
    updateFilterTagsCounts();

    // Render current slice
    console.log("[OfflineBoxd] filteredMovies size before render:", filteredMovies.length);
    renderGrid();
    renderPagination();
  } catch (err) {
    console.error("[OfflineBoxd Error] Error in applyFiltersAndRender:", err);
    const subtitle = document.getElementById('list-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `<span style="color: #ff4a4a; font-weight: bold;">[JS ERROR] ${err.name}: ${err.message}<br>${err.stack.split('\n')[0]}</span>`;
    }
  }
}

function sortMovies() {
  const sortBy = sortSelect.value;
  
  if (sortBy === 'best-match') {
    // Rely on original scraped order (Best Match)
    return;
  }

  filteredMovies.sort((a, b) => {
    const valA = getSortValue(a, sortBy);
    const valB = getSortValue(b, sortBy);

    // If sorting by rating or year, put 0 values (unrated/unreleased) at the bottom
    if (sortBy.startsWith('rating-') || sortBy.startsWith('year-')) {
      if (valA === 0 && valB > 0) return 1;
      if (valB === 0 && valA > 0) return -1;
    }

    if (sortBy.endsWith('-desc')) {
      return valB - valA;
    } else {
      return valA - valB;
    }
  });
}

function getSortValue(movie, type) {
  switch (type) {
    case 'rating-desc':
    case 'rating-asc':
      return parseFloat(movie.Average_rating) || 0;
    case 'year-desc':
    case 'year-asc':
      return parseInt(movie.Release_year) || 0;
    case 'popularity-desc':
      const parseCount = (val) => {
        if (!val || val === 'nan') return 0;
        const clean = typeof val === 'string' ? val.replace(/,/g, '') : val;
        return parseInt(clean) || 0;
      };
      const watches = parseCount(movie.Watches);
      const likes = parseCount(movie.Likes);
      return watches + likes;
    default:
      return 0;
  }
}

// Listeners for inputs
searchInput.addEventListener('input', () => {
  currentPage = 1;
  applyFiltersAndRender();
});
sortSelect.addEventListener('change', () => {
  currentPage = 1;
  applyFiltersAndRender();
});

// Theme search listener
const themeSearchInput = document.getElementById('theme-search-input');
if (themeSearchInput) {
  themeSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#themes-filter-list .filter-tag').forEach(btn => {
      const themeVal = btn.getAttribute('data-value').toLowerCase();
      if (themeVal.includes(query)) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    });
  });
}

// Studio search listener
const studioSearchInput = document.getElementById('studio-search-input');
if (studioSearchInput) {
  studioSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const studiosContainer = document.getElementById('studios-filter-list');
    if (!studiosContainer) return;
    
    if (query === '') {
      const studiosToRender = Array.from(new Set([
        ...Array.from(selectedStudios),
        ...allStudiosSorted.slice(0, 100)
      ]));
      renderFilterGroup('studios-filter-list', studiosToRender, selectedStudios);
    } else {
      const matches = allStudiosSorted.filter(s => s.toLowerCase().includes(query));
      const studiosToRender = Array.from(new Set([
        ...Array.from(selectedStudios).filter(s => s.toLowerCase().includes(query)),
        ...matches.slice(0, 100)
      ]));
      renderFilterGroup('studios-filter-list', studiosToRender, selectedStudios);
    }
  });
}

// Dropdown Toggles and Close-on-Click-Outside logic
document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
  const btn = dropdown.querySelector('.filter-dropdown-btn');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.filter-dropdown').forEach(other => {
        if (other !== dropdown) {
          other.classList.remove('active');
        }
      });
      dropdown.classList.toggle('active');
    });
  }
  
  const content = dropdown.querySelector('.filter-dropdown-content');
  if (content) {
    content.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
});

document.addEventListener('click', () => {
  document.querySelectorAll('.filter-dropdown').forEach(dropdown => {
    dropdown.classList.remove('active');
  });
});

// Year inputs listeners
const filterYearMinInput = document.getElementById('filter-year-min');
const filterYearMaxInput = document.getElementById('filter-year-max');

const handleYearInput = () => {
  if (filterYearMinInput && filterYearMaxInput) {
    const minVal = filterYearMinInput.value;
    const maxVal = filterYearMaxInput.value;
    filterYearMin = minVal !== '' ? parseInt(minVal) : null;
    filterYearMax = maxVal !== '' ? parseInt(maxVal) : null;
    updateDecadePresetHighlight();
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  }
};

if (filterYearMinInput) filterYearMinInput.addEventListener('input', handleYearInput);
if (filterYearMaxInput) filterYearMaxInput.addEventListener('input', handleYearInput);

function updateDecadePresetHighlight() {
  const minInput = document.getElementById('filter-year-min');
  const maxInput = document.getElementById('filter-year-max');
  if (!minInput || !maxInput) return;
  const minVal = minInput.value !== '' ? parseInt(minInput.value) : null;
  const maxVal = maxInput.value !== '' ? parseInt(maxInput.value) : null;
  
  document.querySelectorAll('.decade-preset-btn').forEach(btn => {
    const decVal = parseInt(btn.textContent);
    if (minVal === decVal && maxVal === (decVal + 9)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Rating slider listener
const filterRatingMinInput = document.getElementById('filter-rating-min');
const filterRatingValDisplay = document.getElementById('filter-rating-val');

if (filterRatingMinInput) {
  filterRatingMinInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    filterRatingMin = val;
    if (filterRatingValDisplay) {
      filterRatingValDisplay.textContent = val.toFixed(1);
    }
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  });
}

// IMDb Rating slider listener
const filterImdbRatingMinInput = document.getElementById('filter-imdb-rating-min');
const filterImdbRatingValDisplay = document.getElementById('filter-imdb-rating-val');

if (filterImdbRatingMinInput) {
  filterImdbRatingMinInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    filterImdbRatingMin = val;
    if (filterImdbRatingValDisplay) {
      filterImdbRatingValDisplay.textContent = val.toFixed(1);
    }
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  });
}

// RT Rating slider listener
const filterRtRatingMinInput = document.getElementById('filter-rt-rating-min');
const filterRtRatingValDisplay = document.getElementById('filter-rt-rating-val');

if (filterRtRatingMinInput) {
  filterRtRatingMinInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    filterRtRatingMin = val;
    if (filterRtRatingValDisplay) {
      filterRtRatingValDisplay.textContent = val;
    }
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  });
}

// Metascore Rating slider listener
const filterMetaRatingMinInput = document.getElementById('filter-meta-rating-min');
const filterMetaRatingValDisplay = document.getElementById('filter-meta-rating-val');

if (filterMetaRatingMinInput) {
  filterMetaRatingMinInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    filterMetaRatingMin = val;
    if (filterMetaRatingValDisplay) {
      filterMetaRatingValDisplay.textContent = val;
    }
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  });
}

// Runtime inputs and presets listeners
const filterRuntimeMinInput = document.getElementById('filter-runtime-min');
const filterRuntimeMaxInput = document.getElementById('filter-runtime-max');

const handleRuntimeInput = () => {
  if (filterRuntimeMinInput && filterRuntimeMaxInput) {
    const minVal = filterRuntimeMinInput.value;
    const maxVal = filterRuntimeMaxInput.value;
    filterRuntimeMin = minVal !== '' ? parseInt(minVal) : null;
    filterRuntimeMax = maxVal !== '' ? parseInt(maxVal) : null;
    updateRuntimePresetHighlight();
    currentPage = 1;
    updateFiltersBadge();
    applyFiltersAndRender();
  }
};

if (filterRuntimeMinInput) filterRuntimeMinInput.addEventListener('input', handleRuntimeInput);
if (filterRuntimeMaxInput) filterRuntimeMaxInput.addEventListener('input', handleRuntimeInput);

document.querySelectorAll('.runtime-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (filterRuntimeMinInput && filterRuntimeMaxInput) {
      const minVal = btn.getAttribute('data-min');
      const maxVal = btn.getAttribute('data-max');
      if (filterRuntimeMinInput.value === minVal && filterRuntimeMaxInput.value === maxVal) {
        filterRuntimeMinInput.value = '';
        filterRuntimeMaxInput.value = '';
      } else {
        filterRuntimeMinInput.value = minVal;
        filterRuntimeMaxInput.value = maxVal;
      }
      filterRuntimeMinInput.dispatchEvent(new Event('input'));
    }
  });
});

function updateRuntimePresetHighlight() {
  const minInput = document.getElementById('filter-runtime-min');
  const maxInput = document.getElementById('filter-runtime-max');
  if (!minInput || !maxInput) return;
  const minVal = minInput.value !== '' ? parseInt(minInput.value) : null;
  const maxVal = maxInput.value !== '' ? parseInt(maxInput.value) : null;
  
  document.querySelectorAll('.runtime-preset-btn').forEach(btn => {
    const pMin = parseInt(btn.getAttribute('data-min'));
    const pMax = parseInt(btn.getAttribute('data-max'));
    if (minVal === pMin && maxVal === pMax) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function buildCardRatingHtml(m) {
  const avgRating = parseFloat(m.Average_rating);
  let ratingHtml = '';
  if (avgRating) {
    ratingHtml += `<span class="card-rating-badge card-rating-lb" title="Letterboxd Average Rating"><img src="assets/Letterboxd_2018_logo_(vertical).svg" alt="Letterboxd"> ${avgRating.toFixed(1)}</span>`;
  } else {
    ratingHtml += `<span class="card-rating-badge card-rating-lb no-rating" title="No Letterboxd Rating"><img src="assets/Letterboxd_2018_logo_(vertical).svg" alt="Letterboxd"> -</span>`;
  }
  
  if (m.IMDb_Rating && m.IMDb_Rating !== 'None' && m.IMDb_Rating !== 'nan') {
    const imdbVal = m.IMDb_Rating.split('/')[0];
    ratingHtml += `<span class="card-rating-badge card-rating-imdb" title="IMDb Rating"><img src="assets/imdb.svg" alt="IMDb"> ${imdbVal}</span>`;
  }
  
  if (m.TMDb_Rating && m.TMDb_Rating !== 'None' && m.TMDb_Rating !== 'nan') {
    const tmdbVal = m.TMDb_Rating.split('/')[0];
    ratingHtml += `<span class="card-rating-badge card-rating-tmdb" title="TMDb Rating"><img src="assets/tmdb.svg" alt="TMDb"> ${tmdbVal}</span>`;
  }
  
  if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None' && m.Rotten_Tomatoes !== 'nan') {
    ratingHtml += `<span class="card-rating-badge card-rating-rt" title="Rotten Tomatoes Score"><img src="assets/Rotten-tomatoes-logo tomato.svg" alt="Rotten Tomatoes"> ${m.Rotten_Tomatoes}</span>`;
  }
  
  return ratingHtml;
}

function renderGrid() {
  moviesGrid.innerHTML = '';
  
  if (filteredMovies.length === 0) {
    emptyResults.classList.remove('hidden');
    moviesGrid.classList.add('hidden');
    return;
  }

  emptyResults.classList.add('hidden');
  moviesGrid.classList.remove('hidden');

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredMovies.length);
  const currentBatch = filteredMovies.slice(startIndex, endIndex);
  currentBatch.forEach(m => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.setAttribute('tabindex', '0');
    
    const isWatched = isMovieWatched(m);
    if (isWatched && settingsFadeWatched) {
      card.classList.add('watched-fade');
    }
    
    // Poster image / fallback overlay
    const posterHtml = getPosterImageHtml(m, 'card-poster');
    
    // Calculate display ratings from all platforms
    const ratingHtml = buildCardRatingHtml(m);

    // Genres badges for overlay
    let genreBadges = '';
    if (Array.isArray(m.Genres)) {
      genreBadges = m.Genres.slice(0, 2).map(g => `<span class="overlay-genre-badge">${g}</span>`).join('');
    }

    let watchedBtnHtml = `
      <button class="card-watched-btn ${isWatched ? 'is-watched' : ''}" title="${isWatched ? 'Remove from Watched' : 'Mark Watched'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    `;

    card.innerHTML = `
      <div class="poster-wrapper">
        ${posterHtml}
        <div class="poster-fallback hidden">
          <span class="fallback-title">${m.Film_title}</span>
          <span class="fallback-year">${m.Release_year || ''}</span>
        </div>
        <!-- Card Hover Details Overlay -->
        <div class="poster-details-overlay">
          <div class="overlay-meta">
            <div class="overlay-director">
              Director
              <span>${m.Director || 'Unknown'}</span>
            </div>
            <div class="overlay-genres">
              ${genreBadges}
            </div>
          </div>
          <div class="overlay-action-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Quick View
          </div>
        </div>
        ${watchedBtnHtml}
      </div>
      <div class="card-rating">${ratingHtml}</div>
      <div class="card-title">${m.Film_title}</div>
      <div class="card-year">${m.Release_year || ''}</div>
    `;

    // Offline Resilience image fallbacks
    const imgEl = card.querySelector('.card-poster');
    const fallbackEl = card.querySelector('.poster-fallback');
    
    if (!imgEl) {
      fallbackEl.classList.remove('hidden');
    }

    const watchedBtn = card.querySelector('.card-watched-btn');
    if (watchedBtn) {
      watchedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowWatched = toggleMovieWatchedState(m);
        if (nowWatched) {
          showToast(`Added "${m.Film_title}" to Watched History`);
        } else {
          showToast(`Removed "${m.Film_title}" from Watched History`);
        }
        
        applyFiltersAndRender();
        if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
          applyPeopleFiltersAndRender();
        }
      });
    }

    // Modal click trigger
    card.addEventListener('click', () => openMovieDetails(m));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openMovieDetails(m);
    });

    moviesGrid.appendChild(card);
  });
}

/* --------------------------------------------------------------------------
   5. PAGINATION RENDERING
   -------------------------------------------------------------------------- */

function renderPagination() {
  paginationContainer.innerHTML = '';
  const totalPages = Math.ceil(filteredMovies.length / itemsPerPage);
  
  if (totalPages <= 1) return;

  const maxButtons = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  // Previous Button
  const prevLi = document.createElement('li');
  prevLi.className = 'pagination-prev';
  const prevBtn = document.createElement('button');
  prevBtn.textContent = 'Previous';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => {
    currentPage--;
    applyFiltersAndRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  prevLi.appendChild(prevBtn);
  paginationContainer.appendChild(prevLi);

  // Individual Page Numbers
  for (let i = startPage; i <= endPage; i++) {
    const li = document.createElement('li');
    if (i === currentPage) li.className = 'active';
    
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.addEventListener('click', () => {
      currentPage = i;
      applyFiltersAndRender();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    li.appendChild(btn);
    paginationContainer.appendChild(li);
  }

  // Next Button
  const nextLi = document.createElement('li');
  nextLi.className = 'pagination-next';
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => {
    currentPage++;
    applyFiltersAndRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  nextLi.appendChild(nextBtn);
  paginationContainer.appendChild(nextLi);
}

/* --------------------------------------------------------------------------
   6. MOVIE DETAIL MODAL & STAR RATING HISTOGRAM RENDER
   -------------------------------------------------------------------------- */

function openMovieDetails(m) {
  // 1. Reset tabs to Cast tab active
  document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.modal-tab-pane').forEach(pane => pane.classList.remove('active'));
  
  const defaultTabBtn = document.querySelector('.modal-tab-btn[data-tab="tab-cast"]');
  const defaultTabPane = document.getElementById('tab-cast');
  if (defaultTabBtn) defaultTabBtn.classList.add('active');
  if (defaultTabPane) defaultTabPane.classList.add('active');

  // 2. Set backdrop banner background
  const backdropBanner = document.getElementById('modal-backdrop-banner');
  if (backdropBanner) {
    if (m.Poster_URL && m.Poster_URL !== 'nan') {
      let localFilename = '';
      if (m.TMDb_ID) {
        localFilename = `${m.TMDb_ID}.jpg`;
      } else if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') {
        localFilename = `${m.IMDb_ID}.jpg`;
      } else if (m.Film_title) {
        const safeTitle = m.Film_title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        localFilename = `${safeTitle}_${m.Release_year || ''}.jpg`;
      }
      const localUrl = `assets/covers/${localFilename}`;
      
      const tempImg = new Image();
      tempImg.onload = () => {
        backdropBanner.style.backgroundImage = `url('${localUrl}')`;
      };
      tempImg.onerror = () => {
        backdropBanner.style.backgroundImage = `url('${m.Poster_URL.replace(/'/g, "\\'")}')`;
      };
      tempImg.src = localUrl;
      
      backdropBanner.classList.remove('hidden');
    } else {
      backdropBanner.style.backgroundImage = 'none';
      backdropBanner.classList.add('hidden');
    }
  }

  // Title & Header details
  modalTitle.textContent = m.Film_title;
  modalYear.textContent = m.Release_year || 'Unknown';
  modalRuntime.innerHTML = `<img src="assets/runtime.svg" alt="Runtime" style="height: 14px; width: auto; vertical-align: middle; flex-shrink: 0;"> ${m.Runtime ? `${m.Runtime} mins` : 'Unknown runtime'}`;
  
  const avgRating = parseFloat(m.Average_rating);
  if (modalAvgRating) {
    if (avgRating) {
      modalAvgRating.innerHTML = `<img src="assets/Letterboxd_2018_logo_(vertical).svg" style="height: 18px; vertical-align: middle; margin-right: 6px; display: inline-block;" alt="Letterboxd"> ${avgRating.toFixed(1)}`;
    } else {
      modalAvgRating.innerHTML = `<img src="assets/Letterboxd_2018_logo_(vertical).svg" style="height: 18px; vertical-align: middle; margin-right: 6px; display: inline-block;" alt="Letterboxd"> Unrated`;
    }
  }

  // Render OMDb/IMDb external ratings
  if (modalImdbRating) {
    if (m.IMDb_Rating && m.IMDb_Rating !== 'None' && m.IMDb_Rating !== 'nan') {
      modalImdbRating.innerHTML = `<svg width="28" height="15.4" viewBox="0 0 269 148" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M0 0 C88.77 0 177.54 0 269 0 C269 48.84 269 97.68 269 148 C180.23 148 91.46 148 0 148 C0 99.16 0 50.32 0 0 Z" fill="#F3C400"/><path d="M0 0 C10.23 0 20.46 0 31 0 C32.375 11.3125 32.375 11.3125 32.79443359 14.8059082 C33.6310191 21.5880204 34.69827179 28.2916715 36 35 C37.81275602 30.9993205 38.51525942 27.29713454 39.0703125 22.94921875 C39.30645264 21.14070435 39.30645264 21.14070435 39.54736328 19.2956543 C39.7379834 17.77496338 39.92860352 16.25427246 40.125 14.6875 C40.74375 9.840625 41.3625 4.99375 42 0 C51.9 0 61.8 0 72 0 C72 29.7 72 59.4 72 90 C65.4 90 58.8 90 52 90 C51.67 73.17 51.34 56.34 51 39 C48.73754755 54.70624348 48.73754755 54.70624348 46.48266602 70.41357422 C46.19835473 72.37731852 45.91378593 74.34102557 45.62890625 76.3046875 C45.48287964 77.33086182 45.33685303 78.35703613 45.18640137 79.41430664 C45.04440308 80.38859619 44.90240479 81.36288574 44.75610352 82.36669922 C44.63396988 83.21497284 44.51183624 84.06324646 44.38600159 84.93722534 C44 87 44 87 43 89 C38.71 89 34.42 89 30 89 C27.73207403 78.22809087 25.91702147 67.45233908 24.3125 56.5625 C23.549375 51.426875 22.78625 46.29125 22 41 C21.67 57.17 21.34 73.34 21 90 C14.07 90 7.14 90 0 90 C0 60.3 0 30.6 0 0 Z" fill="#050400" transform="translate(54,29)"/><path d="M0 0 C38.67741935 0 38.67741935 0 47.4375 4.9375 C53.43228246 12.10199611 52.29861272 23.79733616 52.265625 32.73828125 C52.26849518 34.48578926 52.26849518 34.48578926 52.27142334 36.26860046 C52.27277427 38.70974954 52.26915487 41.15090606 52.26074219 43.59204102 C52.24997838 47.3199878 52.26069997 51.0474581 52.2734375 54.77539062 C52.27211666 57.15885522 52.26955583 59.54231953 52.265625 61.92578125 C52.26967346 63.03319168 52.27372192 64.14060211 52.27789307 65.28157043 C52.19896337 78.32558509 52.19896337 78.32558509 47.6875 83.8125 C34.71108194 94.37470075 14.8843338 88 0 88 C0 58.96 0 29.92 0 0 Z" fill="#020200" transform="translate(135,30)"/><path d="M0 0 C6.93 0 13.86 0 21 0 C21.33 9.24 21.66 18.48 22 28 C24.97 25.525 24.97 25.525 28 23 C33.38407334 21.20530889 38.34399488 21.50319846 43.75 23.125 C47.40243086 25.23217165 50.00495751 27.28602697 52 31 C52.6901811 34.57305892 52.63082041 38.0623285 52.55859375 41.69140625 C52.55509666 43.22570534 52.55509666 43.22570534 52.55152893 44.79100037 C52.54181173 46.94693375 52.5200716 49.10284238 52.48706055 51.25854492 C52.43761385 54.55491009 52.42557491 57.84978158 52.41992188 61.14648438 C52.40583621 63.24480751 52.38963193 65.34311772 52.37109375 67.44140625 C52.36573105 68.42484512 52.36036835 69.408284 52.35484314 70.42152405 C52.24675867 76.64960639 51.87573986 80.82008611 47.6875 85.6875 C43.37728266 89.39629166 39.8691447 90.45867374 34.125 90.328125 C29.18559984 89.56542351 25.08719981 86.72479987 21 84 C20.67 85.65 20.34 87.3 20 89 C13.4 89 6.8 89 0 89 C0 59.63 0 30.26 0 0 Z" fill="#030200" transform="translate(196,29)"/><path d="M0 0 C7.59 0 15.18 0 23 0 C23 29.37 23 58.74 23 89 C15.41 89 7.82 89 0 89 C0 59.63 0 30.26 0 0 Z" fill="#030300" transform="translate(23,30)"/><path d="M0 0 C1.65 0 3.3 0 5 0 C7.55640883 2.55640883 7.25270697 3.49733847 7.25878906 7.04467773 C7.26509338 8.09594345 7.27139771 9.14720917 7.27789307 10.23033142 C7.2738446 11.36990799 7.26979614 12.50948456 7.265625 13.68359375 C7.26753845 14.85003922 7.2694519 16.01648468 7.27142334 17.21827698 C7.27278637 19.68889583 7.26908178 22.1595218 7.26074219 24.63012695 C7.25005419 28.41829492 7.26062887 35.99414062 C7.2734375 35.99414062 C7.27211574 38.39062605 7.269553 40.78711118 7.265625 43.18359375 C7.26967346 44.32114609 7.27372192 45.45869843 7.27789307 46.63072205 C7.27158875 47.68513992 7.26528442 48.7395578 7.25878906 49.82592773 C7.25719788 50.7547728 7.25560669 51.68361786 7.25396729 52.64060974 C7 55 7 55 5 58 C3.35 58 1.7 58 0 58 C0 38.86 0 19.72 0 0 Z" fill="#F7C800" transform="translate(158,45)"/><path d="M0 0 C2.5625 0.1875 2.5625 0.1875 4.5625 2.1875 C4.76240227 5.03290142 4.84226976 7.77887784 4.828125 10.625 C4.83003845 11.46087646 4.8319519 12.29675293 4.83392334 13.15795898 C4.83528536 14.92659811 4.83158776 16.69524723 4.82324219 18.46386719 C4.81254275 21.17665994 4.82313676 23.88879044 4.8359375 26.6015625 C4.83461591 28.3177098 4.83205352 30.03385669 4.828125 31.75 C4.83217346 32.56460693 4.83622192 33.37921387 4.84039307 34.21850586 C4.79241928 39.95758072 4.79241928 39.95758072 2.5625 42.1875 C0 42.375 0 42.375 -2.4375 42.1875 C-4.33373202 40.29126798 -3.56647626 37.52379641 -3.57644653 35.0012207 C-3.5744223 34.13456787 -3.57239807 33.26791504 -3.5703125 32.375 C-3.57126923 31.49094482 -3.57222595 30.60688965 -3.57321167 29.69604492 C-3.57389351 27.82307871 -3.57203893 25.95011014 -3.56787109 24.07714844 C-3.56252289 21.19981612 -3.56781593 18.32263992 -3.57421875 15.4453125 C-3.57355797 13.63020799 -3.57227681 11.81510357 -3.5703125 10 C-3.57233673 9.13334717 -3.57436096 8.26669434 -3.57644653 7.3737793 C-3.54838109 0.27295239 -3.54838109 0.27295239 0 0 Z" fill="#EABE00" transform="translate(221.4375,63.8125)"/><path d="M0 0 C0.33 0 0.66 0 1 0 C1 19.14 1 38.28 1 58 C0.67 58 0.34 58 0 58 C-0.33 46.12 -0.66 34.24 -1 22 C-1.66 22.66 -2.32 23.32 -3 24 C-2.68860949 21.31236733 -2.37591843 18.62489631 -2.0625 15.9375 C-1.97548828 15.18533203 -1.88847656 14.43316406 -1.79882812 13.65820312 C-1.26536361 9.09411781 -0.67013702 4.54606466 0 0 Z" fill="#DAB100" transform="translate(105,61)"/></svg> ${m.IMDb_Rating}`;
      if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan') {
        modalImdbRating.setAttribute('data-imdb-id', m.IMDb_ID);
        modalImdbRating.title = `IMDb Rating (Click to copy IMDb ID: ${m.IMDb_ID})`;
      } else {
        modalImdbRating.removeAttribute('data-imdb-id');
        modalImdbRating.title = 'IMDb Rating';
      }
      modalImdbRating.classList.remove('hidden');
    } else {
      modalImdbRating.removeAttribute('data-imdb-id');
      modalImdbRating.title = 'IMDb Rating';
      modalImdbRating.classList.add('hidden');
    }
  }

  if (modalTmdbRating) {
    if (m.TMDb_Rating && m.TMDb_Rating !== 'None' && m.TMDb_Rating !== 'nan') {
      modalTmdbRating.innerHTML = `<img src="assets/tmdb.svg" style="height: 12px; vertical-align: middle; margin-right: 4px; display: inline-block;" alt="TMDb"> ${m.TMDb_Rating}`;
      modalTmdbRating.classList.remove('hidden');
      if (m.TMDb_Votes) {
        modalTmdbRating.title = `TMDb Rating (${m.TMDb_Votes} votes)`;
      } else {
        modalTmdbRating.title = "TMDb Rating";
      }
    } else {
      modalTmdbRating.classList.add('hidden');
    }
  }

  if (modalRtRating) {
    if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None' && m.Rotten_Tomatoes !== 'nan') {
      modalRtRating.innerHTML = `<svg width="15" height="15" viewBox="0 0 138.75 141.25" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><g fill="#f93208"><path d="m20.154 40.829c-28.149 27.622-13.657 61.011-5.734 71.931 35.254 41.954 92.792 25.339 111.89-5.9071 4.7608-8.2027 22.554-53.467-23.976-78.009z"/><path d="m39.613 39.265 4.7778-8.8607 28.406-5.0384 11.119 9.2082z"/></g><path d="m39.436 8.5696 8.9682-5.2826 6.7569 15.479c3.7925-6.3226 13.79-16.316 24.939-4.6684-4.7281 1.2636-7.5161 3.8553-7.7397 8.4768 15.145-4.1697 31.343 3.2127 33.539 9.0911-10.951-4.314-27.695 10.377-41.771 2.334 0.009 15.045-12.617 16.636-19.902 17.076 2.077-4.996 5.591-9.994 1.474-14.987-7.618 8.171-13.874 10.668-33.17 4.668 4.876-1.679 14.843-11.39 24.448-11.425-6.775-2.467-12.29-2.087-17.814-1.475 2.917-3.961 12.149-15.197 28.625-8.476z" fill="#02902e"/></svg> ${m.Rotten_Tomatoes}`;
      modalRtRating.classList.remove('hidden');
    } else {
      modalRtRating.classList.add('hidden');
    }
  }

  if (modalMetaRating) {
    if (m.Metascore && m.Metascore !== 'None' && m.Metascore !== 'nan') {
      modalMetaRating.innerHTML = `<svg width="15" height="15" viewBox="0 0 40 40" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M19.982 0A20 20 0 1 0 40 20v-.024A20 20 0 0 0 19.982 0Zm-.091 4.274A15.665 15.665 0 0 1 35.57 19.921v.018A15.665 15.665 0 1 1 19.89 4.274Z" fill="#FFBD3F"/><path d="M36.978 19.49a17.49 17.49 0 1 1 0-.021" fill="#000"/><path d="m17.209 32.937 3.41-3.41-6.567-6.567c-.276-.276-.576-.622-.737-1.014-.369-.783-.53-2.004.369-2.903 1.106-1.106 2.58-.645 4.009.784l6.313 6.313 3.41-3.41-6.59-6.59c-.276-.276-.599-.691-.76-1.037-.438-.898-.415-2.027.392-2.834 1.129-1.129 2.603-.714 4.24.922l6.128 6.129 3.41-3.41L27.6 9.274c-3.364-3.364-6.52-3.249-8.686-1.083-.83.83-1.337 1.705-1.59 2.696a6.71 6.71 0 0 0-.092 2.81l-.046.047c-1.66-.691-3.549-.277-5 1.175-1.936 1.935-1.866 3.986-1.636 5.184l-.07.07-1.681-1.36-2.95 2.949c1.037.945 2.282 2.097 3.687 3.502l7.673 7.673Z" fill="#F2F2F2"/></svg> ${m.Metascore}`;
      modalMetaRating.classList.remove('hidden');
    } else {
      modalMetaRating.classList.add('hidden');
    }
  }
  
  // YouTube Trailer Button Binding
  const trailerBtn = document.getElementById('modal-trailer-btn');
  if (trailerBtn) {
    if (m.Trailer_URL && m.Trailer_URL !== 'nan') {
      let embedUrl = m.Trailer_URL;
      if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
      trailerBtn.href = embedUrl;
      trailerBtn.classList.remove('hidden');
    } else {
      trailerBtn.href = '#';
      trailerBtn.classList.add('hidden');
    }
  }

  // IMDb Photos Button Binding
  if (modalPhotosBtn) {
    if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan') {
      modalPhotosBtn.href = `https://www.imdb.com/title/${m.IMDb_ID}/mediaviewer`;
      modalPhotosBtn.classList.remove('hidden');
    } else {
      modalPhotosBtn.href = '#';
      modalPhotosBtn.classList.add('hidden');
    }
  }

  // Personal Watched Status Button Binding
  if (modalWatchedBtn) {
    const updateWatchedBtnUI = () => {
      const isWatched = isMovieWatched(m);
      if (isWatched) {
        modalWatchedBtn.style.background = 'rgba(0, 224, 84, 0.15)';
        modalWatchedBtn.style.color = 'var(--accent-green)';
        modalWatchedBtn.style.borderColor = 'rgba(0, 224, 84, 0.3)';
        if (modalWatchedBtnText) modalWatchedBtnText.textContent = 'Watched';
        modalWatchedBtn.querySelector('svg').style.fill = 'var(--accent-green)';
        modalWatchedBtn.querySelector('svg').style.stroke = 'var(--accent-green)';
      } else {
        modalWatchedBtn.style.background = 'rgba(255, 255, 255, 0.05)';
        modalWatchedBtn.style.color = 'var(--text-secondary)';
        modalWatchedBtn.style.borderColor = 'rgba(255, 255, 255, 0.04)';
        if (modalWatchedBtnText) modalWatchedBtnText.textContent = 'Mark Watched';
        modalWatchedBtn.querySelector('svg').style.fill = 'none';
        modalWatchedBtn.querySelector('svg').style.stroke = 'currentColor';
      }
    };

    updateWatchedBtnUI();

    modalWatchedBtn.onclick = (e) => {
      e.preventDefault();
      const nowWatched = toggleMovieWatchedState(m);
      if (nowWatched) {
        showToast(`Added "${m.Film_title}" to Watched History`);
      } else {
        showToast(`Removed "${m.Film_title}" from Watched History`);
      }
      updateWatchedBtnUI();
      
      // Update lists
      applyFiltersAndRender();
      if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
        applyPeopleFiltersAndRender();
      }
    };
  }

  // OMDb Sync Button Binding
  const omdbSyncBtn = document.getElementById('modal-omdb-sync-btn');
  if (omdbSyncBtn) {
    const targetFilename = m._sourceFile || currentDatabaseFilename;
    if (targetFilename && !targetFilename.startsWith("Blob") && !targetFilename.startsWith("File")) {
      omdbSyncBtn.classList.remove('hidden');
      omdbSyncBtn.onclick = async (e) => {
        e.preventDefault();
        
        if (settingsIgnoreExistingRatings && hasFetchedRatings(m)) {
          alert(`"${m.Film_title}" already has fetched ratings. Disable "Ignore Already Synced Ratings" in Settings to force update.`);
          return;
        }
        
        // Show loading state
        const originalText = omdbSyncBtn.innerHTML;
        omdbSyncBtn.disabled = true;
        omdbSyncBtn.innerHTML = `<img src="assets/sync.svg" style="height: 14px; width: 14px; vertical-align: middle; animation: spin 1s linear infinite; filter: invert(44%) sepia(11%) saturate(738%) hue-rotate(169deg) brightness(97%) contrast(86%);" alt="Loading"> Syncing...`;
        
        try {
          const response = await fetch(getApiUrl('/api/movie/sync'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              filename: targetFilename,
              film_title: m.Film_title,
              release_year: m.Release_year,
              tmdb_id: m.TMDb_ID || m.tmdb_id || undefined,
              imdb_id: m.IMDb_ID || m.imdb_id || undefined
            })
          });
          
          if (!response.ok) {
            const errText = await response.text();
            alert(`OMDb Sync server error (${response.status}): ${errText}`);
            return;
          }
          
          const result = await response.json();
          if (result.success) {
            // Update the local in-memory movie object
            Object.assign(m, result.movie);
            
            // Re-render the details in the modal
            openMovieDetails(m);
            
            // Re-render the movie grid card to reflect new ratings on main screen
            renderGrid();
            
            alert(`Successfully updated "${m.Film_title}" metadata from OMDb!`);
          } else {
            alert(`OMDb Sync failed: ${result.error || 'Unknown error'}`);
          }
        } catch (err) {
          console.error('[OMDb Sync Error]', err);
          alert(`Error connecting to local server for OMDb Sync:\n${err.name}: ${err.message}\nTarget URL: ${getApiUrl('/api/movie/sync')}`);
        } finally {
          omdbSyncBtn.disabled = false;
          omdbSyncBtn.innerHTML = originalText;
        }
      };
    } else {
      omdbSyncBtn.classList.add('hidden');
    }
  }
  
  modalDirector.onclick = null;
  modalDirector.innerHTML = '';
  if (m.Director && m.Director !== 'Unknown' && m.Director !== 'Unknown Director') {
    let directors = [];
    if (typeof m.Director === 'string') {
      directors = m.Director.split(',').map(d => d.trim());
    } else if (Array.isArray(m.Director)) {
      directors = m.Director;
    }
    
    directors.forEach((director, index) => {
      if (!director) return;
      
      const link = document.createElement('a');
      link.className = 'director-link';
      link.href = '#';
      link.innerHTML = getPersonAvatarHtml(director) + `<span class="director-name-text">${escapeHtml(director)}</span>`;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToPerson(director, 'director');
      });
      
      modalDirector.appendChild(link);
      
      if (index < directors.length - 1) {
        const separator = document.createTextNode(', ');
        modalDirector.appendChild(separator);
      }
    });
  } else {
    modalDirector.innerHTML = `<span class="director-name-text">Unknown Director</span>`;
  }

  // Synopsis Description
  modalDescription.textContent = m.Description || "No synopsis description is available for this film.";

  // Quick stats underneath poster
  modalWatches.textContent = formatStatNumber(m.Watches);
  modalLikes.textContent = formatStatNumber(m.Likes);
  modalFans.textContent = formatStatNumber(m.Fans);

  // IMDb Votes Quick Stat
  if (modalImdbVotesWrapper && modalImdbVotes) {
    if (m.IMDb_Votes && m.IMDb_Votes !== 'None' && m.IMDb_Votes !== 'nan') {
      modalImdbVotes.textContent = formatStatNumber(m.IMDb_Votes);
      modalImdbVotesWrapper.classList.remove('hidden');
    } else {
      modalImdbVotesWrapper.classList.add('hidden');
    }
  }

  // Modal Poster / fallback large
  if (m.Poster_URL && m.Poster_URL !== 'nan') {
    let localFilename = '';
    if (m.TMDb_ID) {
      localFilename = `${m.TMDb_ID}.jpg`;
    } else if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') {
      localFilename = `${m.IMDb_ID}.jpg`;
    } else if (m.Film_title) {
      const safeTitle = m.Film_title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      localFilename = `${safeTitle}_${m.Release_year || ''}.jpg`;
    }
    
    const localUrl = `assets/covers/${localFilename}`;
    modalPoster.src = localUrl;
    modalPoster.classList.remove('hidden');
    modalPosterFallback.classList.add('hidden');
    
    modalPoster.onerror = function() {
      if (modalPoster.src.includes('assets/covers/')) {
        // Fallback to online TMDb/OMDb URL
        modalPoster.src = m.Poster_URL;
        // Background cache call
        fetch('/api/cover/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: m.Poster_URL, filename: localFilename })
        }).catch(err => console.error('Error caching cover:', err));
      } else {
        // Fallback to CSS placeholder
        modalPoster.classList.add('hidden');
        modalFallbackTitle.textContent = m.Film_title;
        modalFallbackYear.textContent = m.Release_year || '';
        modalPosterFallback.classList.remove('hidden');
      }
    };
  } else {
    modalPoster.classList.add('hidden');
    modalFallbackTitle.textContent = m.Film_title;
    modalFallbackYear.textContent = m.Release_year || '';
    modalPosterFallback.classList.remove('hidden');
  }

  // Genres Tab Content (Interactive Badges)
  modalGenres.innerHTML = '';
  if (Array.isArray(m.Genres) && m.Genres.length > 0) {
    m.Genres.forEach(g => {
      const span = document.createElement('span');
      span.className = 'genre-badge';
      span.textContent = g;
      span.addEventListener('click', () => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
          searchInput.value = g;
          searchInput.dispatchEvent(new Event('input'));
          closeModal();
        }
      });
      modalGenres.appendChild(span);
    });
  } else {
    modalGenres.innerHTML = '<span class="no-details-text">No genres listed.</span>';
  }

  // Themes list inside Details Tab (Interactive Badges)
  if (modalThemes) {
    modalThemes.innerHTML = '';
    if (Array.isArray(m.Themes) && m.Themes.length > 0) {
      if (modalThemesGroup) modalThemesGroup.classList.remove('hidden');
      m.Themes.forEach(t => {
        const span = document.createElement('span');
        span.className = 'theme-badge';
        span.textContent = t;
        span.addEventListener('click', () => {
          const searchInput = document.getElementById('search-input');
          if (searchInput) {
            searchInput.value = t;
            searchInput.dispatchEvent(new Event('input'));
            closeModal();
          }
        });
        modalThemes.appendChild(span);
      });
    } else {
      if (modalThemesGroup) modalThemesGroup.classList.add('hidden');
    }
  }

  // Cast Tab Content (Clickable Pills)
  modalCast.innerHTML = '';
  if (Array.isArray(m.Cast) && m.Cast.length > 0) {
    m.Cast.forEach(actor => {
      const a = document.createElement('a');
      a.className = 'cast-pill';
      a.href = '#';
      a.innerHTML = getPersonAvatarHtml(actor) + `<span>${escapeHtml(actor)}</span>`;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToPerson(actor, 'actor');
      });
      modalCast.appendChild(a);
    });
  } else {
    modalCast.innerHTML = '<span class="no-details-text">Cast details unavailable.</span>';
  }

  // Crew Tab Content (Structured click-to-filter categories)
  const modalCrew = document.getElementById('modal-crew');
  if (modalCrew) {
    modalCrew.innerHTML = '';
    let hasCrew = false;
    
    if (m.Crew && typeof m.Crew === 'object' && !Array.isArray(m.Crew) && Object.keys(m.Crew).length > 0) {
      for (const [role, names] of Object.entries(m.Crew)) {
        let nameList = [];
        if (Array.isArray(names)) {
          nameList = names;
        } else if (typeof names === 'string' && names.trim()) {
          nameList = [names];
        }
        
        if (nameList.length > 0) {
          hasCrew = true;
          const crewGroup = document.createElement('div');
          crewGroup.className = 'crew-group';
          
          const roleLabel = document.createElement('span');
          roleLabel.className = 'detail-label-block';
          roleLabel.textContent = role.toUpperCase();
          crewGroup.appendChild(roleLabel);
          
          const namesContainer = document.createElement('div');
          namesContainer.className = 'crew-names-list';
          
          nameList.forEach(name => {
            const a = document.createElement('a');
            a.className = 'cast-pill';
            a.href = '#';
            a.innerHTML = getPersonAvatarHtml(name) + `<span>${escapeHtml(name)}</span>`;
            a.addEventListener('click', (e) => {
              e.preventDefault();
              const preferredRole = (role.toLowerCase() === 'directors' || role.toLowerCase() === 'director') ? 'director' : null;
              navigateToPerson(name, preferredRole);
            });
            namesContainer.appendChild(a);
          });
          
          crewGroup.appendChild(namesContainer);
          modalCrew.appendChild(crewGroup);
        }
      }
    }
    
    if (!hasCrew) {
      modalCrew.innerHTML = '<span class="no-details-text">Crew details unavailable.</span>';
    }
  }

  // Details Tab metadata elements
  if (modalStudios) {
    modalStudios.innerHTML = '';
    const studiosList = Array.isArray(m.Studios) ? m.Studios : (m.Studios ? [m.Studios] : []);
    if (studiosList.length > 0) {
      studiosList.forEach(studio => {
        if (!studio) return;
        const pill = document.createElement('a');
        pill.className = 'studio-pill';
        pill.href = '#';
        pill.innerHTML = getStudioAvatarHtml(studio) + `<span>${escapeHtml(studio)}</span>`;
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          selectedStudios.clear();
          selectedStudios.add(studio);
          
          const sInput = document.getElementById('studio-search-input');
          if (sInput) sInput.value = '';
          
          currentPage = 1;
          updateFiltersBadge();
          applyFiltersAndRender();
          
          if (movieModal) {
            movieModal.classList.add('hidden');
            document.body.style.overflow = '';
          }
        });
        modalStudios.appendChild(pill);

        // Prefetch & Cache the logo
        fetch(getApiUrl('/api/studio/cache'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: studio })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.local_url) {
            const img = pill.querySelector('.studio-avatar');
            if (img) {
              img.src = data.local_url;
              img.style.display = 'inline-block';
              const placeholder = pill.querySelector('.studio-avatar-placeholder');
              if (placeholder) placeholder.style.display = 'none';
            }
          }
        })
        .catch(err => {
          console.log("[Studio Logo Fetch Error]:", err);
        });
      });
    } else {
      modalStudios.textContent = '-';
    }
  }
  modalCountries.innerHTML = formatCountriesWithFlags(m.Countries);
  modalLanguages.innerHTML = formatLanguagesWithFlags(m.Spoken_languages, m.Original_language);

  // Interactive Ratings Histogram Rendering
  renderRatingHistogram(m);
  renderExternalRatingsBreakdown(m);

  // Fetch lists that contain this movie
  const appearsInListsContainer = document.getElementById('modal-appears-in-lists');
  if (appearsInListsContainer) {
    appearsInListsContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Loading lists...</span>';
    
    const titleParam = encodeURIComponent(m.Film_title);
    const yearParam = m.Release_year ? encodeURIComponent(m.Release_year) : '';
    const imdbParam = m.IMDb_ID ? encodeURIComponent(m.IMDb_ID) : '';
    
    fetch(getApiUrl(`/api/movie/lists?title=${titleParam}&year=${yearParam}&imdb_id=${imdbParam}`))
      .then(res => res.json())
      .then(data => {
        appearsInListsContainer.innerHTML = '';
        if (data && Array.isArray(data.lists) && data.lists.length > 0) {
          data.lists.forEach(lst => {
            const span = document.createElement('span');
            span.className = 'genre-badge'; // Reuse badge styles
            span.style.background = 'rgba(0, 224, 84, 0.08)';
            span.style.color = 'var(--accent-green)';
            span.style.borderColor = 'rgba(0, 224, 84, 0.15)';
            span.style.cursor = 'pointer';
            span.textContent = lst.name;
            span.title = `Click to load the "${lst.name}" list`;
            span.addEventListener('click', () => {
              closeModal();
              showLoadingOverlay(`Loading ${lst.name}...`);
              fetch(getApiUrl(lst.filename))
                .then(res => res.json())
                .then(listData => {
                  initialDatabaseLoaded = true;
                  initializeDatabase(listData, lst.filename);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                })
                .catch(() => {
                  fetch(`./${lst.filename}`)
                    .then(res => res.json())
                    .then(listData => {
                      initialDatabaseLoaded = true;
                      initializeDatabase(listData, lst.filename);
                    })
                    .catch(() => hideLoadingOverlay());
                });
            });
            appearsInListsContainer.appendChild(span);
          });
        } else {
          appearsInListsContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">This movie does not appear in any custom lists.</span>';
        }
      })
      .catch(err => {
        console.error("Failed to load lists for movie:", err);
        appearsInListsContainer.innerHTML = '<span style="color: #fa3232; font-size: 12px;">Failed to load lists.</span>';
      });
  }

  // Fade-in views
  movieModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Lock background scrolling
}

function renderRatingHistogram(m) {
  histogramBars.innerHTML = '';
  
  const ratingKeys = ["½", "★", "★½", "★★", "★★½", "★★★", "★★★½", "★★★★", "★★★★½", "★★★★★"];
  
  // Compute counts
  let counts = ratingKeys.map(k => parseInt(m[k]) || 0);
  let maxCount = Math.max(...counts, 1); // Avoid division by zero

  ratingKeys.forEach((key, index) => {
    const count = counts[index];
    // Height as relative percentage
    const heightPercent = (count / maxCount) * 100;

    const col = document.createElement('div');
    col.className = 'histogram-col';
    
    col.innerHTML = `
      <div class="histogram-bar" style="height: ${heightPercent}%;"></div>
      <div class="histogram-tooltip">${key}: ${count.toLocaleString()} votes</div>
    `;

    histogramBars.appendChild(col);
  });
}

function renderExternalRatingsBreakdown(m) {
  if (!modalExternalRatingsGrid || !modalExternalRatingsSection) return;

  modalExternalRatingsGrid.innerHTML = '';
  let activeRatingsCount = 0;

  // 1. IMDb Rating Card
  if (m.IMDb_Rating && m.IMDb_Rating !== 'None' && m.IMDb_Rating !== 'nan') {
    const rawVal = parseFloat(m.IMDb_Rating.split('/')[0]);
    if (!isNaN(rawVal)) {
      const percentage = (rawVal / 10) * 100;
      const circumference = 2 * Math.PI * 18; // ~113.1
      const offset = circumference - (circumference * percentage) / 100;

      const votesHtml = (m.IMDb_Votes && m.IMDb_Votes !== 'None' && m.IMDb_Votes !== 'nan') 
        ? `<div style="font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: -4px;">${m.IMDb_Votes} votes</div>` 
        : '';

      const card = document.createElement('div');
      card.className = 'external-rating-card';
      card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.2s, background 0.2s;';
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; color: var(--text-muted);">
          <svg width="28" height="15.4" viewBox="0 0 269 148" style="vertical-align: middle;"><path d="M0 0 C88.77 0 177.54 0 269 0 C269 48.84 269 97.68 269 148 C180.23 148 91.46 148 0 148 C0 99.16 0 50.32 0 0 Z" fill="#F3C400"/><path d="M0 0 C10.23 0 20.46 0 31 0 C32.375 11.3125 32.375 11.3125 32.79443359 14.8059082 C33.6310191 21.5880204 34.69827179 28.2916715 36 35 C37.81275602 30.9993205 38.51525942 27.29713454 39.0703125 22.94921875 C39.30645264 21.14070435 39.30645264 21.14070435 39.54736328 19.2956543 C39.7379834 17.77496338 39.92860352 16.25427246 40.125 14.6875 C40.74375 9.840625 41.3625 4.99375 42 0 C51.9 0 61.8 0 72 0 C72 29.7 72 59.4 72 90 C65.4 90 58.8 90 52 90 C51.67 73.17 51.34 56.34 51 39 C48.73754755 54.70624348 48.73754755 54.70624348 46.48266602 70.41357422 C46.19835473 72.37731852 45.91378593 74.34102557 45.62890625 76.3046875 C45.48287964 77.33086182 45.33685303 78.35703613 45.18640137 79.41430664 C45.04440308 80.38859619 44.90240479 81.36288574 44.75610352 82.36669922 C44.63396988 83.21497284 44.51183624 84.06324646 44.38600159 84.93722534 C44 87 44 87 43 89 C38.71 89 34.42 89 30 89 C27.73207403 78.22809087 25.91702147 67.45233908 24.3125 56.5625 C23.549375 51.426875 22.78625 46.29125 22 41 C21.67 57.17 21.34 73.34 21 90 C14.07 90 7.14 90 0 90 C0 60.3 0 30.6 0 0 Z" fill="#050400" transform="translate(54,29)"/><path d="M0 0 C38.67741935 0 38.67741935 0 47.4375 4.9375 C53.43228246 12.10199611 52.29861272 23.79733616 52.265625 32.73828125 C52.26849518 34.48578926 52.26849518 34.48578926 52.27142334 36.26860046 C52.27277427 38.70974954 52.26915487 41.15090606 52.26074219 43.59204102 C52.24997838 47.3199878 52.26069997 51.0474581 52.2734375 54.77539062 C52.27211666 57.15885522 52.26955583 59.54231953 52.265625 61.92578125 C52.26967346 63.03319168 52.27372192 64.14060211 52.27789307 65.28157043 C52.19896337 78.32558509 52.19896337 78.32558509 47.6875 83.8125 C34.71108194 94.37470075 14.8843338 88 0 88 C0 58.96 0 29.92 0 0 Z" fill="#020200" transform="translate(135,30)"/><path d="M0 0 C6.93 0 13.86 0 21 0 C21.33 9.24 21.66 18.48 22 28 C24.97 25.525 24.97 25.525 28 23 C33.38407334 21.20530889 38.34399488 21.50319846 43.75 23.125 C47.40243086 25.23217165 50.00495751 27.28602697 52 31 C52.6901811 34.57305892 52.63082041 38.0623285 52.55859375 41.69140625 C52.55509666 43.22570534 52.55509666 43.22570534 52.55152893 44.79100037 C52.54181173 46.94693375 52.5200716 49.10284238 52.48706055 51.25854492 C52.43761385 54.55491009 52.42557491 57.84978158 52.41992188 61.14648438 C52.40583621 63.24480751 52.38963193 65.34311772 52.37109375 67.44140625 C52.36573105 68.42484512 52.36036835 69.408284 52.35484314 70.42152405 C52.24675867 76.64960639 51.87573986 80.82008611 47.6875 85.6875 C43.37728266 89.39629166 39.8691447 90.45867374 34.125 90.328125 C29.18559984 89.56542351 25.08719981 86.72479987 21 84 C20.67 85.65 20.34 87.3 20 89 C13.4 89 6.8 89 0 89 C0 59.63 0 30.26 0 0 Z" fill="#030200" transform="translate(196,29)"/><path d="M0 0 C7.59 0 15.18 0 23 0 C23 29.37 23 58.74 23 89 C15.41 89 7.82 89 0 89 C0 59.63 0 30.26 0 0 Z" fill="#030300" transform="translate(23,30)"/><path d="M0 0 C1.65 0 3.3 0 5 0 C7.55640883 2.55640883 7.25270697 3.49733847 7.25878906 7.04467773 C7.26509338 8.09594345 7.27139771 9.14720917 7.27789307 10.23033142 C7.2738446 11.36990799 7.26979614 12.50948456 7.265625 13.68359375 C7.26753845 14.85003922 7.2694519 16.01648468 7.27142334 17.21827698 C7.27278637 19.68889583 7.26908178 22.1595218 7.26074219 24.63012695 C7.25005419 28.41829492 7.26062887 35.99414062 C7.2734375 35.99414062 C7.27211574 38.39062605 7.269553 40.78711118 7.265625 43.18359375 C7.26967346 44.32114609 7.27372192 45.45869843 7.27789307 46.63072205 C7.27158875 47.68513992 7.26528442 48.7395578 7.25878906 49.82592773 C7.25719788 50.7547728 7.25560669 51.68361786 7.25396729 52.64060974 C7 55 7 55 5 58 C3.35 58 1.7 58 0 58 C0 38.86 0 19.72 0 0 Z" fill="#F7C800" transform="translate(158,45)"/><path d="M0 0 C2.5625 0.1875 2.5625 0.1875 4.5625 2.1875 C4.76240227 5.03290142 4.84226976 7.77887784 4.828125 10.625 C4.83003845 11.46087646 4.8319519 12.29675293 4.83392334 13.15795898 C4.83528536 14.92659811 4.83158776 16.69524723 4.82324219 18.46386719 C4.81254275 21.17665994 4.82313676 23.88879044 4.8359375 26.6015625 C4.83461591 28.3177098 4.83205352 30.03385669 4.828125 31.75 C4.83217346 32.56460693 4.83622192 33.37921387 4.84039307 34.21850586 C4.79241928 39.95758072 4.79241928 39.95758072 2.5625 42.1875 C0 42.375 0 42.375 -2.4375 42.1875 C-4.33373202 40.29126798 -3.56647626 37.52379641 -3.57644653 35.0012207 C-3.5744223 34.13456787 -3.57239807 33.26791504 -3.5703125 32.375 C-3.57126923 31.49094482 -3.57222595 30.60688965 -3.57321167 29.69604492 C-3.57389351 27.82307871 -3.57203893 25.95011014 -3.56787109 24.07714844 C-3.56252289 21.19981612 -3.56781593 18.32263992 -3.57421875 15.4453125 C-3.57355797 13.63020799 -3.57227681 11.81510357 -3.5703125 10 C-3.57233673 9.13334717 -3.57436096 8.26669434 -3.57644653 7.3737793 C-3.54838109 0.27295239 -3.54838109 0.27295239 0 0 Z" fill="#EABE00" transform="translate(221.4375,63.8125)"/><path d="M0 0 C0.33 0 0.66 0 1 0 C1 19.14 1 38.28 1 58 C0.67 58 0.34 58 0 58 C-0.33 46.12 -0.66 34.24 -1 22 C-1.66 22.66 -2.32 23.32 -3 24 C-2.68860949 21.31236733 -2.37591843 18.62489631 -2.0625 15.9375 C-1.97548828 15.18533203 -1.88847656 14.43316406 -1.79882812 13.65820312 C-1.26536361 9.09411781 -0.67013702 4.54606466 0 0 Z" fill="#DAB100" transform="translate(105,61)"/></svg>
          <span>IMDb</span>
        </div>
        <div style="position: relative; width: 60px; height: 60px;">
          <svg width="60" height="60" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3.5"/>
            <circle cx="20" cy="20" r="18" fill="none" stroke="#F3C400" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                    stroke-linecap="round" transform="rotate(-90 20 20)" style="transition: stroke-dashoffset 0.5s ease;"/>
          </svg>
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff;">
            ${rawVal.toFixed(1)}
          </div>
        </div>
        ${votesHtml}
      `;
      modalExternalRatingsGrid.appendChild(card);
      activeRatingsCount++;
    }
  }

  // 2. Rotten Tomatoes Card
  if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None' && m.Rotten_Tomatoes !== 'nan') {
    const rawVal = parseInt(m.Rotten_Tomatoes.replace('%', ''));
    if (!isNaN(rawVal)) {
      const circumference = 2 * Math.PI * 18; // ~113.1
      const offset = circumference - (circumference * rawVal) / 100;

      const card = document.createElement('div');
      card.className = 'external-rating-card';
      card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.2s, background 0.2s;';
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; color: var(--text-muted);">
          <svg width="15" height="15" viewBox="0 0 138.75 141.25" style="vertical-align: middle;"><g fill="#f93208"><path d="m20.154 40.829c-28.149 27.622-13.657 61.011-5.734 71.931 35.254 41.954 92.792 25.339 111.89-5.9071 4.7608-8.2027 22.554-53.467-23.976-78.009z"/><path d="m39.613 39.265 4.7778-8.8607 28.406-5.0384 11.119 9.2082z"/></g><path d="m39.436 8.5696 8.9682-5.2826 6.7569 15.479c3.7925-6.3226 13.79-16.316 24.939-4.6684-4.7281 1.2636-7.5161 3.8553-7.7397 8.4768 15.145-4.1697 31.343 3.2127 33.539 9.0911-10.951-4.314-27.695 10.377-41.771 2.334 0.009 15.045-12.617 16.636-19.902 17.076 2.077-4.996 5.591-9.994 1.474-14.987-7.618 8.171-13.874 10.668-33.17 4.668 4.876-1.679 14.843-11.39 24.448-11.425-6.775-2.467-12.29-2.087-17.814-1.475 2.917-3.961 12.149-15.197 28.625-8.476z" fill="#02902e"/></svg>
          <span>Rotten Tomatoes</span>
        </div>
        <div style="position: relative; width: 60px; height: 60px;">
          <svg width="60" height="60" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3.5"/>
            <circle cx="20" cy="20" r="18" fill="none" stroke="#f93208" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                    stroke-linecap="round" transform="rotate(-90 20 20)" style="transition: stroke-dashoffset 0.5s ease;"/>
          </svg>
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff;">
            ${rawVal}%
          </div>
        </div>
      `;
      modalExternalRatingsGrid.appendChild(card);
      activeRatingsCount++;
    }
  }

  // 3. Metascore Card
  if (m.Metascore && m.Metascore !== 'None' && m.Metascore !== 'nan') {
    const rawVal = parseInt(m.Metascore.split('/')[0]);
    if (!isNaN(rawVal)) {
      const circumference = 2 * Math.PI * 18; // ~113.1
      const offset = circumference - (circumference * rawVal) / 100;

      // Color coding like official Metacritic (Gold >= 61, Yellow 40-60, Red < 40)
      let scoreColor = '#FFBD3F';
      if (rawVal >= 61) scoreColor = '#d49b17';
      else if (rawVal < 40) scoreColor = '#ff3333';

      const card = document.createElement('div');
      card.className = 'external-rating-card';
      card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.2s, background 0.2s;';
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; color: var(--text-muted);">
          <svg width="15" height="15" viewBox="0 0 40 40" style="vertical-align: middle;"><path d="M19.982 0A20 20 0 1 0 40 20v-.024A20 20 0 0 0 19.982 0Zm-.091 4.274A15.665 15.665 0 0 1 35.57 19.921v.018A15.665 15.665 0 1 1 19.89 4.274Z" fill="#FFBD3F"/><path d="M36.978 19.49a17.49 17.49 0 1 1 0-.021" fill="#000"/><path d="m17.209 32.937 3.41-3.41-6.567-6.567c-.276-.276-.576-.622-.737-1.014-.369-.783-.53-2.004.369-2.903 1.106-1.106 2.58-.645 4.009.784l6.313 6.313 3.41-3.41-6.59-6.59c-.276-.276-.599-.691-.76-1.037-.438-.898-.415-2.027.392-2.834 1.129-1.129 2.603-.714 4.24.922l6.128 6.129 3.41-3.41L27.6 9.274c-3.364-3.364-6.52-3.249-8.686-1.083-.83.83-1.337 1.705-1.59 2.696a6.71 6.71 0 0 0-.092 2.81l-.046.047c-1.66-.691-3.549-.277-5 1.175-1.936 1.935-1.866 3.986-1.636 5.184l-.07.07-1.681-1.36-2.95 2.949c1.037.945 2.282 2.097 3.687 3.502l7.673 7.673Z" fill="#F2F2F2"/></svg>
          <span>Metascore</span>
        </div>
        <div style="position: relative; width: 60px; height: 60px;">
          <svg width="60" height="60" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3.5"/>
            <circle cx="20" cy="20" r="18" fill="none" stroke="${scoreColor}" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                    stroke-linecap="round" transform="rotate(-90 20 20)" style="transition: stroke-dashoffset 0.5s ease;"/>
          </svg>
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff;">
            ${rawVal}
          </div>
        </div>
      `;
      modalExternalRatingsGrid.appendChild(card);
      activeRatingsCount++;
    }
  }

  // 4. TMDb Rating Card
  if (m.TMDb_Rating && m.TMDb_Rating !== 'None' && m.TMDb_Rating !== 'nan') {
    const rawVal = parseFloat(m.TMDb_Rating.split('/')[0]);
    if (!isNaN(rawVal)) {
      const percentage = (rawVal / 10) * 100;
      const circumference = 2 * Math.PI * 18; // ~113.1
      const offset = circumference - (circumference * percentage) / 100;

      const votesHtml = (m.TMDb_Votes && m.TMDb_Votes !== 'None' && m.TMDb_Votes !== 'nan') 
        ? `<div style="font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: -4px;">${m.TMDb_Votes} votes</div>` 
        : '';

      const card = document.createElement('div');
      card.className = 'external-rating-card';
      card.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.2s, background 0.2s;';
      card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; color: var(--text-muted);">
          <img src="assets/tmdb.svg" style="height: 12px; vertical-align: middle;" alt="TMDb">
          <span>TMDb</span>
        </div>
        <div style="position: relative; width: 60px; height: 60px;">
          <svg width="60" height="60" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="3.5"/>
            <circle cx="20" cy="20" r="18" fill="none" stroke="#01b4e4" stroke-width="3.5" 
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" 
                    stroke-linecap="round" transform="rotate(-90 20 20)" style="transition: stroke-dashoffset 0.5s ease;"/>
          </svg>
          <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; color: #fff;">
            ${rawVal.toFixed(1)}
          </div>
        </div>
        ${votesHtml}
      `;
      modalExternalRatingsGrid.appendChild(card);
      activeRatingsCount++;
    }
  }

  // Show/hide parent section
  if (activeRatingsCount > 0) {
    modalExternalRatingsSection.classList.remove('hidden');
    modalExternalRatingsGrid.style.gridTemplateColumns = `repeat(${activeRatingsCount}, 1fr)`;
  } else {
    modalExternalRatingsSection.classList.add('hidden');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getPersonAvatarHtml(name) {
  if (!name || name === 'Unknown' || name === 'Unknown Director') {
    return '';
  }
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
  
  return `<img src="assets/avatars/${safeName}.jpg" class="mini-avatar" alt="" onerror="if(this.src.indexOf('.jpg')!==-1){this.src='assets/avatars/${safeName}.png'}else if(this.src.indexOf('.png')!==-1){this.src='assets/avatars/${safeName}.webp'}else{this.onerror=null;this.src='assets/default-avatar.svg'}">`;
}

function getStudioAvatarHtml(name) {
  if (!name || name === 'Unknown' || name === 'None') {
    return '';
  }
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
  const initial = name.charAt(0).toUpperCase();
  
  return `<img src="assets/studios/${safeName}.png" class="studio-avatar" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">` +
         `<div class="studio-avatar-placeholder" style="display: none;">${initial}</div>`;
}

function getApiUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const isWebProtocol = window.location.protocol === 'http:' || window.location.protocol === 'https:';
  const base = isWebProtocol ? '' : 'http://127.0.0.1:8080';
  
  if (base) {
    let path = url;
    if (path.startsWith('./')) {
      path = path.substring(2);
    }
    if (path.startsWith('/')) {
      path = path.substring(1);
    }
    return `${base}/${path}`;
  }
  return url;
}

function formatStatNumber(num) {
  if (!num || num === 'nan') return '-';
  const cleanNum = typeof num === 'string' ? num.replace(/,/g, '') : num;
  const n = parseInt(cleanNum);
  if (isNaN(n)) return num;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function hasFetchedRatings(m) {
  const imdb = m.IMDb_Rating;
  const tmdb = m.TMDb_Rating;
  const rt = m.Rotten_Tomatoes;
  const mc = m.Metascore;
  
  const hasImdb = imdb && imdb !== 'None' && imdb !== 'nan';
  const hasTmdb = tmdb && tmdb !== 'None' && tmdb !== 'nan';
  const hasRt = rt && rt !== 'None' && rt !== 'nan';
  const hasMc = mc && mc !== 'None' && mc !== 'nan';
  
  return hasImdb || hasTmdb || hasRt || hasMc;
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  
  let iconHtml = '';
  if (type === 'success') {
    iconHtml = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconHtml = `<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }
  
  toast.innerHTML = `${iconHtml}<span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => {
      toast.remove();
      if (container.childNodes.length === 0) {
        container.remove();
      }
    });
  }, 3000);
}

function copyToClipboard(text, successMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage || `Copied: ${text}`);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      fallbackCopyToClipboard(text, successMessage);
    });
  } else {
    fallbackCopyToClipboard(text, successMessage);
  }
}

function fallbackCopyToClipboard(text, successMessage) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showToast(successMessage || `Copied: ${text}`);
    } else {
      showToast("Unable to copy", "error");
    }
  } catch (err) {
    console.error('Fallback copy failed', err);
    showToast("Unable to copy", "error");
  }
  document.body.removeChild(textArea);
}

function getIsoCode(name, isLanguage) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  
  if (isLanguage) {
    const langMap = {
      // Full language names mapped to the country with the most speakers of that language
      'english': 'us',
      'spanish': 'mx',
      'portuguese': 'br',
      'arabic': 'eg',
      'chinese': 'cn',
      'japanese': 'jp',
      'french': 'fr',
      'german': 'de',
      'georgian': 'ge',
      'russian': 'ru',
      'italian': 'it',
      'korean': 'kr',
      'persian': 'ir',
      'farsi': 'ir',
      'persian (farsi)': 'ir',
      'turkish': 'tr',
      'greek': 'gr',
      'greek (modern)': 'gr',
      'modern greek': 'gr',
      'hindi': 'in',
      'vietnamese': 'vn',
      'thai': 'th',
      'czech': 'cz',
      'swedish': 'se',
      'danish': 'dk',
      'norwegian': 'no',
      'norwegian bokmål': 'no',
      'finnish': 'fi',
      'dutch': 'nl',
      'polish': 'pl',
      'hungarian': 'hu',
      'romanian': 'ro',
      'ukrainian': 'ua',
      'hebrew': 'il',
      'hebrew (modern)': 'il',
      'indonesian': 'id',
      'bulgarian': 'bg',
      'slovak': 'sk',
      'croatian': 'hr',
      'serbian': 'rs',
      'serbo-croatian': 'rs',
      'slovenian': 'si',
      'slovene': 'si',
      'icelandic': 'is',
      'malay': 'my',
      'estonian': 'ee',
      'latvian': 'lv',
      'lithuanian': 'lt',
      'afrikaans': 'za',
      'akan': 'gh',
      'albanian': 'al',
      'amharic': 'et',
      'armenian': 'am',
      'assamese': 'in',
      'azerbaijani': 'az',
      'basque': 'es',
      'belarusian': 'by',
      'bengali, bangla': 'bd',
      'bengali': 'bd',
      'bangla': 'bd',
      'bosnian': 'ba',
      'burmese': 'mm',
      'cantonese': 'hk',
      'catalan': 'es',
      'chechen': 'ru',
      'cornish': 'gb',
      'corsican': 'fr',
      'cree': 'ca',
      'divehi, dhivehi, maldivian': 'mv',
      'divehi': 'mv',
      'dhivehi': 'mv',
      'maldivian': 'mv',
      'dzongkha': 'bt',
      'eastern punjabi, eastern panjabi': 'pk',
      'eastern punjabi': 'pk',
      'eastern panjabi': 'pk',
      'punjabi': 'pk',
      'ewe': 'gh',
      'galician': 'es',
      'ganda': 'ug',
      'guaraní': 'py',
      'gujarati': 'in',
      'haitian, haitian creole': 'ht',
      'haitian': 'ht',
      'haitian creole': 'ht',
      'hausa': 'ng',
      'ido': 'fr',
      'igbo': 'ng',
      'inuktitut': 'ca',
      'irish': 'ie',
      'irish gaelic': 'ie',
      'javanese': 'id',
      'kannada': 'in',
      'kashmiri': 'in',
      'kazakh': 'kz',
      'khmer': 'kh',
      'kikuyu, gikuyu': 'ke',
      'kinyarwanda': 'rw',
      'kurdish': 'tr',
      'kyrgyz': 'kg',
      'lao': 'la',
      'latin': 'va',
      'lingala': 'cd',
      'luxembourgish, letzeburgesch': 'lu',
      'luxembourgish': 'lu',
      'letzeburgesch': 'lu',
      'luxamburgish': 'lu',
      'luxemburgish': 'lu',
      'macedonian': 'mk',
      'malagasy': 'mg',
      'malayalam': 'in',
      'maltese': 'mt',
      'marathi': 'in',
      'mongolian': 'mn',
      'māori': 'nz',
      'navajo, navaho': 'us',
      'navajo': 'us',
      'no spoken language': 'xx',
      'nepali': 'np',
      'northern ndelebe': 'zw',
      'northern ndelebe, ndelebe': 'zw',
      'northern ndebele': 'zw',
      'occitan': 'fr',
      'ojibwe, ojibwa': 'ca',
      'oriya': 'in',
      'pashto, pushto': 'pk',
      'pashto': 'pk',
      'pāli': 'in',
      'quechua': 'pe',
      'romansh': 'ch',
      'samoan': 'ws',
      'sango': 'cf',
      'sanskrit (saṁskṛta)': 'in',
      'sanskrit': 'in',
      'scottish gaelic, gaelic': 'gb',
      'scottish gaelic': 'gb',
      'gaelic': 'gb',
      'shona': 'zw',
      'sinhalese, sinhala': 'lk',
      'sinhalese': 'lk',
      'sinhala': 'lk',
      'somali': 'so',
      'southern sotho': 'za',
      'sundanese': 'id',
      'swahili': 'tz',
      'tagalog': 'ph',
      'tahitian': 'pf',
      'tamil': 'in',
      'tatar': 'ru',
      'telugu': 'in',
      'tibetan': 'cn',
      'tsonga': 'za',
      'tswana': 'bw',
      'twi': 'gh',
      'urdu': 'pk',
      'uyghur': 'cn',
      'uzbek': 'uz',
      'welsh': 'gb',
      'western frisian': 'nl',
      'wolof': 'sn',
      'xhosa': 'za',
      'yiddish': 'il',
      'yoruba': 'ng',
      'zulu': 'za',

      // 2-letter ISO 639-1 language codes mapped to the country with the most speakers
      'en': 'us', 'ja': 'jp', 'fr': 'fr', 'fa': 'ir', 'es': 'mx', 'de': 'de', 'ko': 'kr',
      'it': 'it', 'zh': 'cn', 'ru': 'ru', 'pt': 'br', 'sv': 'se', 'da': 'dk', 'no': 'no',
      'fi': 'fi', 'nl': 'nl', 'pl': 'pl', 'tr': 'tr', 'el': 'gr', 'ar': 'eg', 'hi': 'in',
      'vi': 'vn', 'th': 'th', 'cs': 'cz', 'hu': 'hu', 'ro': 'ro', 'uk': 'ua', 'he': 'il',
      'id': 'id', 'bg': 'bg', 'sk': 'sk', 'sr': 'rs', 'hr': 'hr', 'sl': 'si', 'is': 'is',
      'ms': 'my', 'et': 'ee', 'lv': 'lv', 'lt': 'lt', 'af': 'za', 'am': 'et', 'az': 'az',
      'be': 'by', 'bn': 'bd', 'bs': 'ba', 'ca': 'es', 'eu': 'es', 'ka': 'ge', 'kk': 'kz',
      'km': 'kh', 'ky': 'kg', 'lo': 'la', 'mk': 'mk', 'mn': 'mn', 'ne': 'np', 'ps': 'pk',
      'si': 'lk', 'so': 'so', 'sq': 'al', 'sw': 'tz', 'ta': 'in', 'te': 'in', 'ur': 'pk',
      'uz': 'uz', 'xh': 'za', 'yi': 'il', 'yo': 'ng', 'zu': 'za', 'lb': 'lu'
    };
    return langMap[key] || null;
  } else {
    const countryMap = {
      // Full country names mapped to their lowercase 2-letter ISO-3166 codes
      'usa': 'us', 'united states': 'us', 'united states of america': 'us',
      'uk': 'gb', 'united kingdom': 'gb', 'england': 'gb', 'scotland': 'gb',
      'germany': 'de', 'france': 'fr', 'japan': 'jp', 'canada': 'ca',
      'australia': 'au', 'italy': 'it', 'spain': 'es', 'south korea': 'kr',
      'korea': 'kr', 'iran': 'ir', 'china': 'cn', 'hong kong': 'hk',
      'taiwan': 'tw', 'india': 'in', 'russia': 'ru', 'russian federation': 'ru',
      'brazil': 'br', 'mexico': 'mx', 'swedish': 'se', 'sweden': 'se', 'norway': 'no', 'denmark': 'dk',
      'finland': 'fi', 'netherlands': 'nl', 'belgium': 'be', 'new zealand': 'nz',
      'ireland': 'ie', 'poland': 'pl', 'turkey': 'tr', 'greece': 'gr',
      'portugal': 'pt', 'austria': 'at', 'switzerland': 'ch', 'argentina': 'ar',
      'chile': 'cl', 'colombia': 'co', 'south africa': 'za', 'egypt': 'eg',
      'thailand': 'th', 'vietnam': 'vn', 'indonesia': 'id', 'philippines': 'ph',
      'malaysia': 'my', 'singapore': 'sg', 'ukraine': 'ua', 'czech republic': 'cz',
      'czechoslovakia': 'cz', 'czechia': 'cz', 'hungary': 'hu', 'romanian': 'ro', 'romania': 'ro', 'bulgaria': 'bg',
      'slovakia': 'sk', 'croatia': 'hr', 'serbia': 'rs', 'yugoslavia': 'rs',
      'slovenia': 'si', 'iceland': 'is', 'peru': 'pe', 'uruguay': 'uy',
      'venezuela': 've', 'cuba': 'cu', 'israel': 'il', 'soviet union': 'ru', 'ussr': 'ru',
      'algeria': 'dz', 'angola': 'ao', 'armenia': 'am', 'azerbaijan': 'az', 'bahamas': 'bs',
      'bangladesh': 'bd', 'belarus': 'by', 'bolivia': 'bo', 'bosnia and herzegovina': 'ba',
      'cameroon': 'cm', 'costa rica': 'cr', 'cyprus': 'cy', 'ecuador': 'ec', 'estonia': 'ee',
      'georgia': 'ge', 'ghana': 'gh', 'guatemala': 'gt', 'honduras': 'hn', 'iraq': 'iq',
      'jamaica': 'jm', 'jordan': 'jo', 'kazakhstan': 'kz', 'kenya': 'ke', 'kuwait': 'kw',
      'latvia': 'lv', 'lebanon': 'lb', 'libya': 'ly', 'lithuania': 'lt', 'luxembourg': 'lu',
      'macedonia': 'mk', 'madagascar': 'mg', 'malta': 'mt', 'mongolia': 'mn', 'montenegro': 'me',
      'morocco': 'ma', 'nepal': 'np', 'nigeria': 'ng', 'oman': 'om', 'pakistan': 'pk',
      'panama': 'pa', 'paraguay': 'py', 'puerto rico': 'pr', 'qatar': 'qa', 'saudi arabia': 'sa',
      'senegal': 'sn', 'sri lanka': 'lk', 'syria': 'sy', 'tunisia': 'tn', 'united arab emirates': 'ae',
      'uzbekistan': 'uz', 'zimbabwe': 'zw',
      'barbados': 'bb', 'belize': 'bz', 'benin': 'bj', 'bermuda': 'bm', 'british virgin islands': 'vg',
      'burkina faso': 'bf', 'chad': 'td', 'cook islands': 'ck', 'cote d’ivoire': 'ci', 'côte d’ivoire': 'ci',
      'democratic republic of congo': 'cd', 'dominican republic': 'do', 'el salvador': 'sv', 'fiji': 'fj',
      'gabon': 'ga', 'gibraltar': 'gi', 'guinea-bissau': 'gw', 'kosovo': 'xk', 'macao': 'mo',
      'maldives': 'mv', 'mauritania': 'mr', 'moldova': 'md', 'monaco': 'mc', 'mozambique': 'mz',
      'namibia': 'na', 'nauru': 'nr', 'north korea': 'kp', 'north macedonia': 'mk', 'papua new guinea': 'pg',
      'reunion': 're', 'réunion': 're', 'saint kitts and nevis': 'kn', 'serbia and montenegro': 'rs',
      'sierra leone': 'sl', 'state of palestine': 'ps', 'sudan': 'sd', 'trinidad and tobago': 'tt',
      'uganda': 'ug', 'yemen': 'ye', 'zambia': 'zm', 'tanzania': 'tz', 'haiti': 'ht',
      'cambodia': 'kh', 'combodia': 'kh',
      'kyrgyzstan': 'kg', 'kyrgizstan': 'kg',
      'albania': 'al',
      'myanmar': 'mm', 'burma': 'mm',
      'botswana': 'bw',
      'central african republic': 'cf',
      'eswatini': 'sz', 'swaziland': 'sz',
      'rwanda': 'rw',
      'sao tome and principe': 'st', 'são tomé and príncipe': 'st', 'são tomé and principe': 'st', 'sao tome & principe': 'st'
    };
    return countryMap[key] || null;
  }
}

function formatCountriesWithFlags(countries) {
  if (!countries || countries === 'nan') return '-';
  
  const getFlagImg = (c) => {
    const name = c.trim();
    const isoCode = getIsoCode(name, false);
    if (isoCode) {
      return `<span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 12px;"><img src="assets/flags/${isoCode}.svg" alt="${name} flag" style="width: 16px; height: 12px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.25);">${name}</span>`;
    }
    return `<span>${name}</span>`;
  };

  if (Array.isArray(countries)) {
    return countries.map(getFlagImg).join(' ');
  }
  return getFlagImg(countries);
}

function formatLanguagesWithFlags(langs, originalLang) {
  let list = [];
  if (Array.isArray(langs)) {
    list = langs;
  } else if (langs && typeof langs === 'string') {
    list = [langs];
  } else if (originalLang) {
    list = [originalLang];
  }
  
  if (list.length === 0) return '-';
  
  const getFlagImg = (l) => {
    const name = l.trim();
    const isoCode = getIsoCode(name, true);
    if (isoCode) {
      return `<span style="display: inline-flex; align-items: center; gap: 4px; margin-right: 12px;"><img src="assets/flags/${isoCode}.svg" alt="${name} flag" style="width: 16px; height: 12px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.25);">${name}</span>`;
    }
    return `<span>${name}</span>`;
  };
  
  return list.map(getFlagImg).join(' ');
}

// Modal closing event listeners
function closeModal() {
  movieModal.classList.add('hidden');
  document.body.style.overflow = ''; // Unlock scrolling
}

btnModalClose.addEventListener('click', closeModal);
movieModal.addEventListener('click', (e) => {
  if (e.target === movieModal) closeModal();
});

// Copy IMDb ID on click
if (modalImdbRating) {
  modalImdbRating.addEventListener('click', () => {
    const imdbId = modalImdbRating.getAttribute('data-imdb-id');
    if (imdbId && imdbId !== 'None' && imdbId !== 'nan') {
      copyToClipboard(imdbId, `Copied IMDb ID: ${imdbId}`);
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !movieModal.classList.contains('hidden')) {
    closeModal();
  }
});

// Tab Switching logic inside details modal
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-tab-btn')) {
    const tabId = e.target.getAttribute('data-tab');
    
    // Deactivate all tabs & panes
    document.querySelectorAll('.modal-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.modal-tab-pane').forEach(pane => pane.classList.remove('active'));
    
    // Activate targeted tab & pane
    e.target.classList.add('active');
    const targetPane = document.getElementById(tabId);
    if (targetPane) targetPane.classList.add('active');
  }
});

/* --------------------------------------------------------------------------
   7. LOCAL DATABASE MANAGEMENT & SERVER VAULT INTEGRATION
   -------------------------------------------------------------------------- */

const localFilesSection = document.getElementById('local-files-section');
const localFilesGrid = document.getElementById('local-files-grid');

let initialDatabaseLoaded = false;

// Auto-Detect Local Server & Auto-Load First Database List
function detectLocalServer() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isFileProtocol = window.location.protocol === 'file:';
  
  if (isLocalhost || isFileProtocol) {
    fetch(getApiUrl('/api/lists'))
      .then(response => response.json())
      .then(files => {
        if (Array.isArray(files) && files.length > 0) {
          renderLocalFilesList(files);
          
          const fileNames = files.map(f => typeof f === 'string' ? f : f.filename);
          
          // Auto-load all_lists_combined.json if present, otherwise first list
          if (!initialDatabaseLoaded) {
            const combinedFile = fileNames.find(f => f === 'all_lists_combined.json');
            const fileToLoad = combinedFile || fileNames[0];
            showLoadingOverlay(`Loading ${fileToLoad.replace('.json', '').replace(/_/g, ' ')}...`);
            fetch(getApiUrl(fileToLoad))
              .then(res => res.json())
              .then(data => {
                initialDatabaseLoaded = true;
                initializeDatabase(data, fileToLoad);
              })
              .catch(() => {
                fetch(`./${fileToLoad}`)
                  .then(res => res.json())
                  .then(data => {
                    initialDatabaseLoaded = true;
                    initializeDatabase(data, fileToLoad);
                  })
                  .catch(() => hideLoadingOverlay());
              });
          }
        } else {
          // If no lists are found on the server, switch to the ADD DATABASE tab automatically so the user can import a file
          if (!initialDatabaseLoaded) {
            showAddDbTab();
          }
        }
      })
      .catch(err => {
        console.log("[Local Server Detection] Server is not running or offline:", err);
      });
  }
}

// Helper to render poster images in the local database lists stack preview
function getStackPosterImageHtml(cover) {
  if (!cover) return '';
  if (typeof cover === 'object' && cover !== null) {
    const localUrl = cover.local_url;
    const remoteUrl = cover.url;
    const filename = cover.filename;
    
    // Escape quotes
    const safeRemoteUrl = remoteUrl.replace(/'/g, "\\'");
    const safeFilename = filename.replace(/'/g, "\\'");
    
    return `<img src="${localUrl}" onerror="this.onerror=function(){this.style.display='none';}; this.src='${safeRemoteUrl}'; fetch('/api/cover/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '${safeRemoteUrl}', filename: '${safeFilename}' }) }).catch(err => console.error(err));" alt="" loading="lazy">`;
  } else {
    return `<img src="${cover}" alt="" onerror="this.style.display='none';" loading="lazy">`;
  }
}

// Render available offline databases list
function renderLocalFilesList(files) {
  populateMigrationDbSelect(files);
  populateImportWatchedSelect(files);
  localFilesGrid.innerHTML = '';
  localFilesSection.classList.remove('hidden');
  updateCombineButtonState();

  // Render the "All Lists Combined" option card first with a custom stack
  const combinedCard = document.createElement('div');
  combinedCard.className = 'local-db-card combined-db-card';
  combinedCard.innerHTML = `
    <div class="list-poster-stack shimmer-placeholder">
      <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
    </div>
    <div class="local-db-details">
      <div class="local-db-name" style="color: var(--accent-green); font-weight: 800;">All Lists Combined</div>
      <div class="local-db-meta">Merge & browse all offline vaults</div>
    </div>
  `;
  combinedCard.addEventListener('click', () => {
    showLoadingOverlay("Combining & Loading All Lists...");
    loadAllListsCombined(files);
  });
  localFilesGrid.appendChild(combinedCard);

  // Lazy-load a preview of combined covers from the first database
  if (files.length > 0) {
    const firstFileObj = files[0];
    const firstFileName = typeof firstFileObj === 'string' ? firstFileObj : firstFileObj.filename;
    
    // Check if we already have covers precomputed
    if (firstFileObj && typeof firstFileObj === 'object' && Array.isArray(firstFileObj.covers) && firstFileObj.covers.length > 0) {
      const stackContainer = combinedCard.querySelector('.list-poster-stack');
      if (stackContainer) {
        stackContainer.innerHTML = '';
        stackContainer.classList.remove('shimmer-placeholder');
        firstFileObj.covers.forEach(cover => {
          const item = document.createElement('div');
          item.className = 'poster-stack-item';
          item.innerHTML = getStackPosterImageHtml(cover);
          stackContainer.appendChild(item);
        });
      }
    } else {
      // Fetch covers from first database JSON
      fetch(getApiUrl(firstFileName))
        .then(res => res.json())
        .then(data => {
          const validMovies = Array.isArray(data) ? data.filter(m => m.Poster_URL).slice(0, 5) : [];
          if (validMovies.length > 0) {
            const stackContainer = combinedCard.querySelector('.list-poster-stack');
            if (stackContainer) {
              stackContainer.innerHTML = '';
              stackContainer.classList.remove('shimmer-placeholder');
              validMovies.forEach(m => {
                const item = document.createElement('div');
                item.className = 'poster-stack-item';
                item.innerHTML = getPosterImageHtml(m, '', true);
                stackContainer.appendChild(item);
              });
            }
          }
        })
        .catch(() => {
          fetch(`./${firstFileName}`)
            .then(res => res.json())
            .then(data => {
              const validMovies = Array.isArray(data) ? data.filter(m => m.Poster_URL).slice(0, 5) : [];
              if (validMovies.length > 0) {
                const stackContainer = combinedCard.querySelector('.list-poster-stack');
                if (stackContainer) {
                  stackContainer.innerHTML = '';
                  stackContainer.classList.remove('shimmer-placeholder');
                  validMovies.forEach(m => {
                    const item = document.createElement('div');
                    item.className = 'poster-stack-item';
                    item.innerHTML = getPosterImageHtml(m, '', true);
                    stackContainer.appendChild(item);
                  });
                }
              }
            }).catch(()=>{});
        });
    }
  }

  files.forEach(fileObj => {
    const filename = typeof fileObj === 'string' ? fileObj : fileObj.filename;
    const cleanLabel = typeof fileObj === 'string' ? filename.replace('.json', '').replace(/_/g, ' ') : fileObj.name;
    
    const card = document.createElement('div');
    card.className = 'local-db-card';
    
    const hasPrecomputed = fileObj && typeof fileObj === 'object' && 'count' in fileObj;
    const countText = hasPrecomputed ? `Offline Vault • ${fileObj.count} films` : 'Loading library contents...';
    
    const isCombined = filename === 'all_lists_combined.json';
    
    card.innerHTML = `
      <div class="local-db-select" title="Select list to combine" ${isCombined ? 'style="display:none;"' : ''}>
        <input type="checkbox" class="db-select-checkbox" data-filename="${filename}">
      </div>
      <div class="list-poster-stack shimmer-placeholder">
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      </div>
      <div class="local-db-details">
        <div class="local-db-name" title="${filename}">${cleanLabel}</div>
        <div class="local-db-meta">${countText}</div>
      </div>
      <div class="local-db-edit" title="Edit Database List" ${isCombined ? 'style="display:none;"' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg>
      </div>
      <div class="local-db-delete" title="Delete Database List" ${isCombined ? 'style="display:none;"' : ''}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
    `;

    // Render covers
    if (hasPrecomputed) {
      if (Array.isArray(fileObj.covers) && fileObj.covers.length > 0) {
        const stackContainer = card.querySelector('.list-poster-stack');
        if (stackContainer) {
          stackContainer.innerHTML = '';
          stackContainer.classList.remove('shimmer-placeholder');
          fileObj.covers.forEach(cover => {
            const item = document.createElement('div');
            item.className = 'poster-stack-item';
            item.innerHTML = getStackPosterImageHtml(cover);
            stackContainer.appendChild(item);
          });
        }
      }
    } else {
      const loadCovers = (url) => {
        fetch(url)
          .then(res => res.json())
          .then(data => {
            const count = Array.isArray(data) ? data.filter(m => m && m.Film_title !== "__metadata__").length : 0;
            const metaEl = card.querySelector('.local-db-meta');
            if (metaEl) {
              metaEl.textContent = `Offline Vault • ${count} films`;
            }
            
            const validMovies = Array.isArray(data) ? data.filter(m => m.Poster_URL).slice(0, 5) : [];
            if (validMovies.length > 0) {
              const stackContainer = card.querySelector('.list-poster-stack');
              if (stackContainer) {
                stackContainer.innerHTML = '';
                stackContainer.classList.remove('shimmer-placeholder');
                validMovies.forEach(m => {
                  const item = document.createElement('div');
                  item.className = 'poster-stack-item';
                  item.innerHTML = getPosterImageHtml(m, '', true);
                  stackContainer.appendChild(item);
                });
              }
            }
          })
          .catch(() => {
            if (url.startsWith('/')) {
              loadCovers('.' + url);
            }
          });
      };
      loadCovers(`/${filename}`);
    }

    const btnEdit = card.querySelector('.local-db-edit');
    if (btnEdit) {
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        
        showLoadingOverlay(`Loading ${cleanLabel} for editing...`);
        fetch(getApiUrl(filename))
          .then(res => res.json())
          .then(data => {
            hideLoadingOverlay();
            
            if (localFilesSectionObj) localFilesSectionObj.classList.add('hidden');
            if (newListSectionObj) newListSectionObj.classList.remove('hidden');
            
            editingListFilename = filename;
            
            let listName = cleanLabel;
            let listDesc = "";
            let listTags = "";
            let isRanked = false;
            
            const metadata = Array.isArray(data) ? data.find(m => m.Film_title === '__metadata__') : null;
            if (metadata) {
              listName = metadata.Name || listName;
              listDesc = metadata.Description || "";
              listTags = metadata.Tags || "";
              isRanked = !!metadata.Ranked;
            }
            
            document.getElementById('new-list-name').value = listName;
            document.getElementById('new-list-description').value = listDesc;
            document.getElementById('new-list-tags').value = listTags;
            if (newListRankedInput) newListRankedInput.checked = isRanked;
            if (addFilmSearchInput) addFilmSearchInput.value = '';
            
            const formTitle = document.querySelector('.new-list-header h2');
            if (formTitle) formTitle.textContent = `Edit List: ${listName}`;
            
            draftListFilms = Array.isArray(data) ? data.filter(m => m.Film_title !== '__metadata__') : [];
            
            renderDraftFilms();
            buildUniqueSearchFilms();
          })
          .catch(err => {
            hideLoadingOverlay();
            alert("Failed to load list details for editing.");
          });
      });
    }

    const btnDelete = card.querySelector('.local-db-delete');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent loading the file when deleting
      if (confirm(`Are you sure you want to permanently delete the database "${cleanLabel}"?`)) {
        fetch(getApiUrl('/api/delete_list'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: filename })
        })
        .then(res => res.json())
        .then(res => {
          if (res.success) {
            card.remove();
            fetch(getApiUrl('/api/lists'))
              .then(res => res.json())
              .then(updatedFiles => {
                if (updatedFiles.length > 0) {
                  renderLocalFilesList(updatedFiles);
                } else {
                  localFilesSection.classList.add('hidden');
                  showAddDbTab();
                }
              });
          } else {
            alert(`Error deleting database: ${res.error}`);
          }
        })
        .catch(err => alert("Failed to delete database file."));
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.local-db-select') || e.target.classList.contains('db-select-checkbox')) {
        return;
      }
      showLoadingOverlay(`Loading ${filename.replace('.json', '').replace(/_/g, ' ')}...`);
      fetch(getApiUrl(filename))
        .then(res => res.json())
        .then(data => {
          initialDatabaseLoaded = true;
          initializeDatabase(data, filename);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        })
        .catch(err => {
          fetch(`./${filename}`)
            .then(res => res.json())
            .then(data => {
              initialDatabaseLoaded = true;
              initializeDatabase(data, filename);
            })
            .catch(e => {
              hideLoadingOverlay();
              alert(`Error loading file: ${filename}`);
            });
        });
    });

    const checkbox = card.querySelector('.db-select-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        updateCombineButtonState();
      });
    }

    localFilesGrid.appendChild(card);
  });
}

function updateCombineButtonState() {
  const btnCombine = document.getElementById('btn-combine-selected');
  if (!btnCombine) return;
  
  const checkboxes = document.querySelectorAll('.db-select-checkbox:checked');
  if (checkboxes.length >= 2) {
    btnCombine.classList.remove('hidden');
  } else {
    btnCombine.classList.add('hidden');
  }
}

// Load and combine all lists data
function loadAllListsCombined(files, title = "All Lists Combined") {
  const fileNames = files.map(f => typeof f === 'string' ? f : f.filename);
  const loadPromises = fileNames.map(filename => {
    return fetch(getApiUrl(filename))
      .then(res => res.json())
      .catch(() => {
        return fetch(`./${filename}`)
          .then(res => res.json());
      })
      .catch(err => {
        console.error(`Failed to load ${filename}:`, err);
        return [];
      });
  });

  Promise.all(loadPromises)
    .then(results => {
      let combined = [];
      let seen = new Set();
      results.forEach((list, index) => {
        const filename = fileNames[index];
        if (Array.isArray(list)) {
          list.forEach(m => {
            if (m && m.Film_title && m.Film_title !== "__metadata__") {
              const key = `${m.Film_title.toLowerCase()}_${m.Release_year}`;
              if (!seen.has(key)) {
                seen.add(key);
                m._sourceFile = filename;
                combined.push(m);
              }
            }
          });
        }
      });
      initialDatabaseLoaded = true;
      initializeDatabase(combined, title);
    })
    .catch(err => {
      hideLoadingOverlay();
      alert("Error loading combined lists.");
      console.error(err);
    });
}

// Combine and save selected lists to local server
function combineAndSaveSelectedLists(files) {
  const listName = prompt("Enter a name for the combined list:", "Combined Selected Lists");
  if (listName === null) {
    // User cancelled
    return;
  }
  const trimmedName = listName.trim();
  if (!trimmedName) {
    alert("Please enter a valid list name.");
    return;
  }

  showLoadingOverlay("Combining Selected Lists...");

  const loadPromises = files.map(filename => {
    return fetch(getApiUrl(filename))
      .then(res => res.json())
      .catch(() => {
        return fetch(`./${filename}`)
          .then(res => res.json());
      })
      .catch(err => {
        console.error(`Failed to load ${filename}:`, err);
        return [];
      });
  });

  Promise.all(loadPromises)
    .then(results => {
      let combined = [];
      let seen = new Set();
      results.forEach((list, index) => {
        const filename = files[index];
        if (Array.isArray(list)) {
          list.forEach(m => {
            if (m && m.Film_title && m.Film_title !== "__metadata__") {
              const key = `${m.Film_title.toLowerCase()}_${m.Release_year}`;
              if (!seen.has(key)) {
                seen.add(key);
                m._sourceFile = filename;
                combined.push(m);
              }
            }
          });
        }
      });

      const metadata = {
        "Film_title": "__metadata__",
        "Name": trimmedName,
        "Description": `Combined from: ${files.map(f => f.replace('.json', '').replace(/_/g, ' ')).join(', ')}`,
        "Tags": "combined",
        "Ranked": false
      };

      const finalFilms = [metadata, ...combined];

      let slug = trimmedName.toLowerCase()
                            .trim()
                            .replace(/[^a-z0-9]+/g, '_')
                            .replace(/^_+|_+$/g, '');
      if (!slug) slug = 'combined_list';
      const filename = `${slug}.json`;

      showLoadingOverlay("Saving Combined List...");

      fetch(getApiUrl('/api/save_harvest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          output_name: filename,
          films: finalFilms
        })
      })
      .then(res => res.json())
      .then(data => {
        hideLoadingOverlay();
        if (data.success) {
          alert(`Combined list "${trimmedName}" saved successfully as ${filename}!`);
          initialDatabaseLoaded = true;
          initializeDatabase(finalFilms, filename);
          detectLocalServer(); // Refresh lists tab cards
        } else {
          alert("Error saving combined list: " + (data.error || "Unknown error"));
        }
      })
      .catch(err => {
        hideLoadingOverlay();
        alert("Error saving combined list.");
        console.error(err);
      });
    })
    .catch(err => {
      hideLoadingOverlay();
      alert("Error loading source lists for combination.");
      console.error(err);
    });
}

// Tab Switching Controls
function showFilmsTab() {
  if (appContent) appContent.classList.remove('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.add('hidden');
  if (newsView) newsView.classList.add('hidden');
  if (settingsView) settingsView.classList.add('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabFilms) navTabFilms.classList.add('active');
}

function showListsTab() {
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.remove('hidden');
  if (peopleView) peopleView.classList.add('hidden');
  if (newsView) newsView.classList.add('hidden');
  if (settingsView) settingsView.classList.add('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabLists) navTabLists.classList.add('active');
}

function showNewsTab() {
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.add('hidden');
  if (newsView) newsView.classList.remove('hidden');
  if (settingsView) settingsView.classList.add('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabNews) navTabNews.classList.add('active');
}

function showSettingsTab() {
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.add('hidden');
  if (newsView) newsView.classList.add('hidden');
  if (settingsView) settingsView.classList.remove('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabSettings) navTabSettings.classList.add('active');
}

function showAddDbTab() {
  showListsTab();
  const btnShowNewListForm = document.getElementById('btn-show-new-list-form');
  if (btnShowNewListForm) btnShowNewListForm.click();
}

if (navTabFilms) {
  navTabFilms.addEventListener('click', showFilmsTab);
}

if (navTabLists) {
  navTabLists.addEventListener('click', showListsTab);
}

if (navTabNews) {
  navTabNews.addEventListener('click', showNewsTab);
}

if (navTabSettings) {
  navTabSettings.addEventListener('click', showSettingsTab);
}

// Initialize server autodetect and settings options on page load
document.addEventListener('DOMContentLoaded', () => {
  detectLocalServer();
  initMigrationWidget();
  pollMigrationStatus();
  initNewsEvents();
  initThemeToggle();
  // Initialize settings options
  const ignoreRatingsToggle = document.getElementById('settings-ignore-existing-ratings');
  if (ignoreRatingsToggle) {
    ignoreRatingsToggle.checked = settingsIgnoreExistingRatings;
    ignoreRatingsToggle.addEventListener('change', (e) => {
      settingsIgnoreExistingRatings = e.target.checked;
      localStorage.setItem('settings-ignore-existing-ratings', settingsIgnoreExistingRatings);
      showToast(settingsIgnoreExistingRatings ? "Ignore existing ratings enabled" : "Ignore existing ratings disabled");
    });
  }

  // Initialize watched personalization settings
  const fadeWatchedToggle = document.getElementById('settings-fade-watched');
  if (fadeWatchedToggle) {
    fadeWatchedToggle.checked = settingsFadeWatched;
    fadeWatchedToggle.addEventListener('change', (e) => {
      settingsFadeWatched = e.target.checked;
      localStorage.setItem('settings-fade-watched', settingsFadeWatched);
      renderGrid();
      if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
        applyPeopleFiltersAndRender();
      }
      showToast(settingsFadeWatched ? "Fade watched movies enabled" : "Fade watched movies disabled");
    });
  }

  const hideWatchedToggle = document.getElementById('settings-hide-watched');
  if (hideWatchedToggle) {
    hideWatchedToggle.checked = settingsHideWatched;
    hideWatchedToggle.addEventListener('change', (e) => {
      settingsHideWatched = e.target.checked;
      localStorage.setItem('settings-hide-watched', settingsHideWatched);
      applyFiltersAndRender();
      if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
        applyPeopleFiltersAndRender();
      }
      showToast(settingsHideWatched ? "Hide watched movies enabled" : "Hide watched movies disabled");
    });
  }

  const btnClearWatched = document.getElementById('btn-clear-watched');
  if (btnClearWatched) {
    btnClearWatched.addEventListener('click', () => {
      if (userWatchedMovies.size === 0) {
        alert("Your watched history is already empty.");
        return;
      }
      if (confirm("Are you sure you want to clear your watched history? This cannot be undone.")) {
        userWatchedMovies.clear();
        saveUserWatched();
        applyFiltersAndRender();
        if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
          applyPeopleFiltersAndRender();
        }
        showToast("Watched history cleared successfully!");
      }
    });
  }

  // Import Watched from List Binding
  const btnImportWatchedList = document.getElementById('btn-import-watched-list');
  const settingsImportWatchedSelect = document.getElementById('settings-import-watched-select');
  if (btnImportWatchedList && settingsImportWatchedSelect) {
    btnImportWatchedList.addEventListener('click', async () => {
      const filename = settingsImportWatchedSelect.value;
      if (!filename) {
        alert("Please select a list file first.");
        return;
      }
      
      const confirmImport = confirm(`Are you sure you want to mark all movies from "${filename}" as watched?`);
      if (!confirmImport) return;
      
      try {
        showLoadingOverlay(`Importing watched movies from ${filename}...`);
        const response = await fetch(getApiUrl(filename));
        if (!response.ok) throw new Error("Failed to load list file");
        
        const films = await response.json();
        let importedCount = 0;
        
        // Build maps of our current library movies for high-accuracy cross-reference matching
        const titleToMovieMap = new Map();
        const imdbToMovieMap = new Map();
        
        if (Array.isArray(allMovies)) {
          allMovies.forEach(lm => {
            if (lm && lm.Film_title) {
              const key = `${lm.Film_title.toLowerCase().trim()}_${lm.Release_year || ''}`;
              titleToMovieMap.set(key, lm);
              
              if (lm.IMDb_ID && lm.IMDb_ID !== 'None' && lm.IMDb_ID !== 'nan') {
                imdbToMovieMap.set(lm.IMDb_ID, lm);
              }
            }
          });
        }
        
        films.forEach(m => {
          if (m && m.Film_title && m.Film_title !== "__metadata__") {
            // Match imported film to library film
            let matchedMovie = null;
            if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan') {
              matchedMovie = imdbToMovieMap.get(m.IMDb_ID);
            }
            if (!matchedMovie) {
              const key = `${m.Film_title.toLowerCase().trim()}_${m.Release_year || ''}`;
              matchedMovie = titleToMovieMap.get(key);
              if (!matchedMovie && m.Release_year) {
                for (let offset = -1; offset <= 1; offset++) {
                  if (offset === 0) continue;
                  const altKey = `${m.Film_title.toLowerCase().trim()}_${parseInt(m.Release_year) + offset}`;
                  matchedMovie = titleToMovieMap.get(altKey);
                  if (matchedMovie) break;
                }
              }
            }
            
            const targetMovie = matchedMovie || m;
            if (!isMovieWatched(targetMovie)) {
              const stableUid = `${targetMovie.Film_title}_${targetMovie.Release_year}`;
              userWatchedMovies.add(stableUid);
              importedCount++;
            }
          }
        });
        
        saveUserWatched();
        hideLoadingOverlay();
        
        // Update UI
        applyFiltersAndRender();
        if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
          applyPeopleFiltersAndRender();
        }
        
        alert(`Successfully imported watched history! Marked ${importedCount} new movies as watched (total watched: ${userWatchedMovies.size}).`);
      } catch (err) {
        hideLoadingOverlay();
        console.error(err);
        alert(`Failed to import watched history: ${err.message}`);
      }
    });
  }

  updateWatchedStatsInSettings();
});

function getSortLabel(value) {
  switch (value) {
    case 'popularity-desc': return 'Popularity';
    case 'best-match': return 'Best Match';
    case 'rating-desc': return 'Highest Rated';
    case 'rating-asc': return 'Lowest Rated';
    case 'year-desc': return 'Newest First';
    case 'year-asc': return 'Earliest First';
    default: return value;
  }
}

function updateSmartSubtitle() {
  const subtitle = document.getElementById('list-subtitle');
  if (!subtitle) return;

  const count = filteredMovies.length;
  const countText = `${count.toLocaleString()} film${count === 1 ? '' : 's'}`;
  
  // Build active filter description parts
  const parts = [];
  
  // 1. Text Search query
  const searchVal = searchInput.value.toLowerCase().trim();
  if (searchVal) {
    parts.push(`matching "${searchVal}"`);
  }
  
  // 2. Genres included
  if (selectedGenres.size > 0) {
    parts.push(`genre: ${Array.from(selectedGenres).join(', ')}`);
  }
  
  // 3. Genres custom excluded
  const customExcludes = Array.from(excludedGenres).filter(g => !DEFAULT_EXCLUDED_GENRES.includes(g));
  if (customExcludes.length > 0) {
    parts.push(`excluding: ${customExcludes.join(', ')}`);
  }
  
  // 4. Themes
  if (selectedThemes.size > 0) {
    parts.push(`themes: ${Array.from(selectedThemes).join(', ')}`);
  }
  
  // 5. Studios
  if (selectedStudios.size > 0) {
    parts.push(`studios: ${Array.from(selectedStudios).join(', ')}`);
  }
  
  // 6. Languages
  if (selectedLanguages.size > 0) {
    parts.push(`languages: ${Array.from(selectedLanguages).join(', ')}`);
  }
  
  // 7. Year Range
  if (filterYearMin !== null || filterYearMax !== null) {
    if (filterYearMin !== null && filterYearMax !== null) {
      if (filterYearMin === filterYearMax) {
        parts.push(`released in ${filterYearMin}`);
      } else {
        parts.push(`released ${filterYearMin}–${filterYearMax}`);
      }
    } else if (filterYearMin !== null) {
      parts.push(`released since ${filterYearMin}`);
    } else if (filterYearMax !== null) {
      parts.push(`released up to ${filterYearMax}`);
    }
  }
  
  // 8. Ratings (Letterboxd, IMDb, RT, Metacritic)
  if (filterRatingMin > 0) {
    parts.push(`rating ≥ ${filterRatingMin}★`);
  }
  if (filterImdbRatingMin > 0) {
    parts.push(`IMDb ≥ ${filterImdbRatingMin}★`);
  }
  if (filterRtRatingMin > 0) {
    parts.push(`RT ≥ ${filterRtRatingMin}%`);
  }
  if (filterMetaRatingMin > 0) {
    parts.push(`Metascore ≥ ${filterMetaRatingMin}`);
  }
  
  // 9. Runtime
  if (filterRuntimeMin !== null || filterRuntimeMax !== null) {
    if (filterRuntimeMin !== null && filterRuntimeMax !== null) {
      parts.push(`runtime ${filterRuntimeMin}–${filterRuntimeMax} min`);
    } else if (filterRuntimeMin !== null) {
      parts.push(`runtime ≥ ${filterRuntimeMin} min`);
    } else if (filterRuntimeMax !== null) {
      parts.push(`runtime ≤ ${filterRuntimeMax} min`);
    }
  }

  // 10. Sort By
  const sortBy = sortSelect.value;
  if (sortBy && sortBy !== 'best-match') {
    parts.push(`sorted by ${getSortLabel(sortBy)}`);
  }

  // Final subtitle string assembly
  let descriptionText = currentListDescription || 'Automatically combined list of all libraries';
  
  if (parts.length > 0) {
    subtitle.innerHTML = `${countText} &bull; ${descriptionText} <span style="color: var(--text-muted); font-weight: 400; font-size: 13px; margin-left: 6px; border-left: 1px solid rgba(255,255,255,0.15); padding-left: 8px;">Filtered by: ${parts.join(', ')}</span>`;
  } else {
    subtitle.innerHTML = `${countText} &bull; ${descriptionText}`;
  }
}

/* --------------------------------------------------------------------------
   8. STATISTICS HUD CARD CALCULATION & DYNAMIC TAG COUNT SYSTEM
   -------------------------------------------------------------------------- */

function updateStatsHUD() {
  const hudContainer = document.getElementById('stats-hud');
  if (!hudContainer) return;
  
  if (filteredMovies.length === 0) {
    hudContainer.classList.add('hidden');
    return;
  }
  hudContainer.classList.remove('hidden');

  // 1. Total Films
  const totalFilms = filteredMovies.length;
  document.getElementById('stat-total-films').textContent = totalFilms.toLocaleString();

  // 2. Average Rating
  const ratedMovies = filteredMovies.filter(m => parseFloat(m.Average_rating) > 0);
  const avgRatingVal = ratedMovies.length > 0 
    ? (ratedMovies.reduce((sum, m) => sum + parseFloat(m.Average_rating), 0) / ratedMovies.length).toFixed(2) 
    : '0.0';
  document.getElementById('stat-avg-rating').textContent = `${avgRatingVal}★`;

  // 3. Total Runtime
  const totalMins = filteredMovies.reduce((sum, m) => sum + (parseInt(m.Runtime) || 0), 0);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const displayRuntime = hours > 0 ? `${hours}h ${mins}m` : `${totalMins}m`;
  document.getElementById('stat-total-runtime').textContent = displayRuntime;

  // 4. Primary Genre
  const genreMap = {};
  filteredMovies.forEach(m => {
    if (Array.isArray(m.Genres)) {
      m.Genres.forEach(g => genreMap[g] = (genreMap[g] || 0) + 1);
    }
  });
  let topGenre = '-';
  let maxGenreCount = 0;
  for (const [genre, count] of Object.entries(genreMap)) {
    if (count > maxGenreCount) {
      maxGenreCount = count;
      topGenre = `${genre} (${count})`;
    }
  }
  document.getElementById('stat-top-genre').textContent = topGenre;
}

function updateFilterTagsCounts() {
  try {
    console.log("[OfflineBoxd Debug] Starting updateFilterTagsCounts. filteredMovies count:", filteredMovies.length);
    // Compute distributions in the currently filtered set
    const genreCounts = {};
    const themeCounts = {};
    const languageCounts = {};
    const countryCounts = {};
    const studioCounts = {};

    // Initialize counts for all known tags to 0 so we can display (0) for empty ones
    allMovies.forEach(m => {
      if (Array.isArray(m.Genres)) {
        m.Genres.forEach(g => { if (g) genreCounts[g] = 0; });
      }
      if (Array.isArray(m.Themes)) {
        m.Themes.forEach(t => { if (t) themeCounts[t] = 0; });
      }
      if (m.Original_language) {
        languageCounts[m.Original_language] = 0;
      }
      if (Array.isArray(m.Countries)) {
        m.Countries.forEach(c => { if (c) countryCounts[c] = 0; });
      }
      if (Array.isArray(m.Studios)) {
        m.Studios.forEach(s => { if (s) studioCounts[s] = 0; });
      }
    });

    // Count matches within currently filtered results
    filteredMovies.forEach(m => {
      if (Array.isArray(m.Genres)) {
        m.Genres.forEach(g => { if (g) genreCounts[g] = (genreCounts[g] || 0) + 1; });
      }
      if (Array.isArray(m.Themes)) {
        m.Themes.forEach(t => { if (t) themeCounts[t] = (themeCounts[t] || 0) + 1; });
      }
      if (m.Original_language) {
        languageCounts[m.Original_language] = (languageCounts[m.Original_language] || 0) + 1;
      }
      if (Array.isArray(m.Countries)) {
        m.Countries.forEach(c => { if (c) countryCounts[c] = (countryCounts[c] || 0) + 1; });
      }
      if (Array.isArray(m.Studios)) {
        m.Studios.forEach(s => { if (s) studioCounts[s] = (studioCounts[s] || 0) + 1; });
      }
    });

    // Now update each tag button text and classes
    updateTagsInContainer('genres-filter-list', genreCounts, selectedGenres, excludedGenres);
    updateTagsInContainer('themes-filter-list', themeCounts, selectedThemes);
    updateTagsInContainer('languages-filter-list', languageCounts, selectedLanguages);
    updateTagsInContainer('countries-filter-list', countryCounts, selectedCountries);
    updateTagsInContainer('studios-filter-list', studioCounts, selectedStudios);
  } catch (err) {
    console.error("[OfflineBoxd Error] Error in updateFilterTagsCounts:", err);
    const subtitle = document.getElementById('list-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `<span style="color: #ff4a4a; font-weight: bold;">[JS ERROR in tag counts] ${err.name}: ${err.message}</span>`;
    }
  }
}

function updateTagsInContainer(containerId, countsMap, selectionSet, excludedSet = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const buttons = container.querySelectorAll('.filter-tag');
  buttons.forEach(btn => {
    const label = btn.getAttribute('data-value');
    if (!label) return;
    const count = countsMap[label] || 0;
    
    // Update count badge
    const badge = btn.querySelector('.tag-count');
    if (badge) {
      badge.textContent = count;
    }
    
    // Toggle dimmed class
    const isSelected = selectionSet.has(label);
    const isExcluded = excludedSet && excludedSet.has(label);
    if (count === 0 && !isSelected && !isExcluded) {
      btn.classList.add('dimmed');
    } else {
      btn.classList.remove('dimmed');
    }
  });
}

/* --------------------------------------------------------------------------
   9. ACTORS & DIRECTORS (PEOPLE) TAB SYSTEM
   -------------------------------------------------------------------------- */

const navTabPeople = document.getElementById('nav-tab-people');
const peopleView = document.getElementById('people-view');
const peopleSearchInput = document.getElementById('people-search-input');
const peopleSuggestions = document.getElementById('people-suggestions');
const peopleTypeFilter = document.getElementById('people-type-filter');
const peopleMoviesGrid = document.getElementById('people-movies-grid');

let uniquePeopleList = []; 
let selectedPerson = null;

function showPeopleTab() {
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.remove('hidden');
  if (newsView) newsView.classList.add('hidden');
  if (settingsView) settingsView.classList.add('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabPeople) navTabPeople.classList.add('active');
  
  if (uniquePeopleList.length === 0 && allMovies.length > 0) {
    buildUniquePeopleList();
  }
}

if (navTabPeople) {
  navTabPeople.addEventListener('click', showPeopleTab);
}

function buildUniquePeopleList() {
  const actorMap = {};
  const directorMap = {};
  
  allMovies.forEach(m => {
    if (Array.isArray(m.Cast)) {
      m.Cast.forEach(actor => {
        const trimmed = actor.trim();
        if (trimmed && trimmed !== '-') {
          actorMap[trimmed] = (actorMap[trimmed] || 0) + 1;
        }
      });
    }
    
    if (m.Director) {
      let directors = [];
      if (typeof m.Director === 'string') {
        directors = m.Director.split(',').map(d => d.trim());
      } else if (Array.isArray(m.Director)) {
        directors = m.Director;
      }
      if (Array.isArray(directors)) {
        directors.forEach(director => {
          const trimmed = director.trim();
          if (trimmed && trimmed !== '-') {
            directorMap[trimmed] = (directorMap[trimmed] || 0) + 1;
          }
        });
      }
    }
  });
  
  uniquePeopleList = [];
  
  for (const [name, count] of Object.entries(actorMap)) {
    uniquePeopleList.push({ name, role: 'actor', count });
  }
  
  for (const [name, count] of Object.entries(directorMap)) {
    uniquePeopleList.push({ name, role: 'director', count });
  }
  
  uniquePeopleList.sort((a, b) => b.count - a.count);
}

if (peopleSearchInput) {
  peopleSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      peopleSuggestions.classList.add('hidden');
      
      // Reset people view to initial banner state
      peopleMoviesGrid.innerHTML = '';
      const banner = document.getElementById('people-banner-alert');
      if (banner) {
        banner.classList.remove('hidden');
        banner.textContent = 'Select an actor or director above to view their films.';
      }
      
      // Reset sidebar stats/portrait
      document.getElementById('people-portrait-img').style.display = 'none';
      document.getElementById('people-portrait-fallback').style.display = 'flex';
      document.getElementById('people-sidebar-name').textContent = 'Selected Person';
      document.getElementById('people-sidebar-bio').textContent = 'Select a person to view their biography and career details from your local library.';
      document.getElementById('people-stats-text').textContent = "You've watched 0 of 0 total";
      document.getElementById('people-progress-fill').style.width = '0%';
      document.getElementById('people-stats-percent').textContent = '0%';
      document.getElementById('people-results-count').textContent = '0 titles';
      
      // Hide sync buttons
      document.getElementById('person-sync-btn').classList.add('hidden');
      document.getElementById('person-sync-all-credits-btn').classList.add('hidden');
      return;
    }
    
    const filterType = peopleTypeFilter.value;
    
    const matches = uniquePeopleList.filter(p => {
      const matchesQuery = p.name.toLowerCase().includes(query);
      if (!matchesQuery) return false;
      
      if (filterType === 'actor') return p.role === 'actor';
      if (filterType === 'director') return p.role === 'director';
      return true;
    }).slice(0, 10);
    
    peopleSuggestions.innerHTML = '';
    
    if (matches.length > 0) {
      matches.forEach(p => {
        const div = document.createElement('div');
        div.className = 'people-suggestion-item';
        div.innerHTML = `
          <span style="font-weight: 600;">${escapeHtml(p.name)}</span>
          <span class="meta-tag" style="font-size: 10px; font-weight: 700; background: ${p.role === 'actor' ? 'var(--accent-blue)' : 'var(--accent-orange)'}; color: #000; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${p.role}</span>
        `;
        div.addEventListener('click', () => {
          selectPerson(p);
          peopleSuggestions.classList.add('hidden');
        });
        peopleSuggestions.appendChild(div);
      });
    } else {
      const divNo = document.createElement('div');
      divNo.style.padding = '12px';
      divNo.style.color = 'var(--text-muted)';
      divNo.style.fontSize = '12px';
      divNo.style.textAlign = 'center';
      divNo.textContent = 'No local matches found';
      peopleSuggestions.appendChild(divNo);
    }
    
    // Add TMDb Search suggestions
    const rawQuery = e.target.value.trim();
    if (rawQuery) {
      // Option 1: Search as Actor
      const actorDiv = document.createElement('div');
      actorDiv.className = 'people-suggestion-item people-suggestion-tmdb-actor';
      actorDiv.innerHTML = `
        <span>🔍 Search TMDb for "<strong>${escapeHtml(rawQuery)}</strong>"</span>
        <span class="meta-tag" style="font-size: 10px; font-weight: 700; background: var(--accent-blue); color: #000; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">as actor</span>
      `;
      actorDiv.addEventListener('click', () => {
        navigateToPerson(rawQuery, 'actor');
        peopleSuggestions.classList.add('hidden');
      });
      peopleSuggestions.appendChild(actorDiv);

      // Option 2: Search as Director
      const directorDiv = document.createElement('div');
      directorDiv.className = 'people-suggestion-item people-suggestion-tmdb-director';
      directorDiv.innerHTML = `
        <span>🔍 Search TMDb for "<strong>${escapeHtml(rawQuery)}</strong>"</span>
        <span class="meta-tag" style="font-size: 10px; font-weight: 700; background: var(--accent-orange); color: #000; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">as director</span>
      `;
      directorDiv.addEventListener('click', () => {
        navigateToPerson(rawQuery, 'director');
        peopleSuggestions.classList.add('hidden');
      });
      peopleSuggestions.appendChild(directorDiv);
    }
    
    peopleSuggestions.classList.remove('hidden');
  });

  peopleSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = e.target.value.trim();
      if (!query) return;
      
      // Look for exact local match
      let match = uniquePeopleList.find(p => p.name.toLowerCase() === query.toLowerCase());
      if (match) {
        selectPerson(match);
        peopleSuggestions.classList.add('hidden');
      } else {
        // Fall back to TMDb search via navigateToPerson
        const filterType = peopleTypeFilter.value;
        const preferredRole = (filterType === 'director') ? 'director' : 'actor';
        navigateToPerson(query, preferredRole);
        peopleSuggestions.classList.add('hidden');
      }
    }
  });

  peopleSearchInput.addEventListener('focus', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (query) {
      peopleSearchInput.dispatchEvent(new Event('input'));
    }
  });

  document.addEventListener('click', (e) => {
    if (!peopleSearchInput.contains(e.target) && !peopleSuggestions.contains(e.target)) {
      peopleSuggestions.classList.add('hidden');
    }
  });
}

function selectPerson(person) {
  selectedPerson = person;
  peopleSearchInput.value = person.name;
  peopleSuggestions.classList.add('hidden');
  
  const filterControls = document.getElementById('people-filter-controls');
  if (filterControls) {
    filterControls.classList.remove('hidden');
  }
  
  clearPeopleFiltersQuietly();
  
  const matchFilms = allMovies.filter(m => {
    if (person.role === 'actor') {
      return Array.isArray(m.Cast) && m.Cast.some(c => c.trim().toLowerCase() === person.name.toLowerCase());
    } else {
      let directors = [];
      if (typeof m.Director === 'string') {
        directors = m.Director.split(',').map(d => d.trim());
      } else if (Array.isArray(m.Director)) {
        directors = m.Director;
      }
      return Array.isArray(directors) && directors.some(d => d.trim().toLowerCase() === person.name.toLowerCase());
    }
  });
  
  const totalFilms = matchFilms.length;
  const watchedCount = matchFilms.filter(m => isMovieWatched(m)).length;
  const percent = totalFilms > 0 ? Math.round((watchedCount / totalFilms) * 100) : 0;
  
  document.getElementById('people-role-tag').textContent = person.role === 'actor' ? 'FILMS STARRING' : 'FILMS DIRECTED BY';
  document.getElementById('people-name-title').textContent = person.name;
  document.getElementById('people-sidebar-name').textContent = person.name;
  
  document.getElementById('people-banner-alert').innerHTML = `
    There are <strong>${totalFilms}</strong> films with this ${person.role} in your collection.
  `;
  
  document.getElementById('people-stats-text').textContent = `You've watched ${watchedCount} of ${totalFilms} total`;
  document.getElementById('people-progress-fill').style.width = `${percent}%`;
  document.getElementById('people-stats-percent').textContent = `${percent}%`;
  
  const personSyncBtn = document.getElementById('person-sync-btn');
  if (personSyncBtn) {
    if (totalFilms > 0) {
      personSyncBtn.classList.remove('hidden');
      personSyncBtn.onclick = () => syncAllMoviesForPerson(person, matchFilms);
    } else {
      personSyncBtn.classList.add('hidden');
    }
  }
  updateSyncBtnStatusForSelectedPerson();

  applyPeopleFiltersAndRender();
  loadPeopleDetailsFromTMDB(person.name, person.role, totalFilms);

  // Fetch full credits list from TMDb in background
  currentPersonCredits = [];
  const personSyncAllCreditsBtn = document.getElementById('person-sync-all-credits-btn');
  if (personSyncAllCreditsBtn) personSyncAllCreditsBtn.classList.add('hidden'); // Hide initially until loaded
  
  fetch(getApiUrl(`/api/person/credits?name=${encodeURIComponent(person.name)}&role=${encodeURIComponent(person.role)}`))
    .then(res => res.json())
    .then(data => {
      if (data && Array.isArray(data.credits)) {
        currentPersonCredits = data.credits;
        applyPeopleFiltersAndRender();
        if (personSyncAllCreditsBtn && currentPersonCredits.length > 0) {
          personSyncAllCreditsBtn.classList.remove('hidden');
          personSyncAllCreditsBtn.onclick = () => syncAllCreditsForPerson(person);
        }
      }
    })
    .catch(err => {
      console.error("[TMDb credits fetch error]", err);
    });
}

async function syncAllMoviesForPerson(person, films) {
  if (films.length === 0) return;
  
  const personKey = `${person.name.toLowerCase()}_${person.role}`;
  currentlySyncingPeople[personKey] = {
    completedCount: 0,
    total: films.length
  };
  updateSyncBtnStatusForSelectedPerson();

  // Force refetch/update the selected person's profile avatar and biography from TMDB
  const imgEl = document.getElementById('people-portrait-img');
  if (imgEl) {
    fetchOnlineTMDBDetails(person.name, imgEl);
  }
  
  let successCount = 0;
  let failCount = 0;
  const total = films.length;
  
  let activeIndex = 0;
  let completedCount = 0;
  
  const worker = async () => {
    while (activeIndex < total) {
      const i = activeIndex++;
      if (i >= total) break;
      
      const m = films[i];
      if (settingsIgnoreExistingRatings && hasFetchedRatings(m)) {
        successCount++;
        completedCount++;
        if (currentlySyncingPeople[personKey]) {
          currentlySyncingPeople[personKey].completedCount = completedCount;
        }
        updateSyncBtnStatusForSelectedPerson();
        continue;
      }
      
      const targetFilename = m._sourceFile || currentDatabaseFilename;
      
      if (!targetFilename || targetFilename.startsWith("Blob") || targetFilename.startsWith("File")) {
        failCount++;
        completedCount++;
        if (currentlySyncingPeople[personKey]) {
          currentlySyncingPeople[personKey].completedCount = completedCount;
        }
        updateSyncBtnStatusForSelectedPerson();
        continue;
      }
      
      try {
        const response = await fetch(getApiUrl('/api/movie/sync'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: targetFilename,
            film_title: m.Film_title,
            release_year: m.Release_year,
            tmdb_id: m.TMDb_ID || m.tmdb_id || undefined,
            imdb_id: m.IMDb_ID || m.imdb_id || undefined,
            skip_people: false
          })
        });
        
        if (!response.ok) {
          failCount++;
        } else {
          const result = await response.json();
          if (result.success) {
            Object.assign(m, result.movie);
            successCount++;
          } else {
            failCount++;
          }
        }
      } catch (err) {
        console.error('[Person Sync Error]', err);
        failCount++;
      }
      
      completedCount++;
      if (currentlySyncingPeople[personKey]) {
        currentlySyncingPeople[personKey].completedCount = completedCount;
      }
      updateSyncBtnStatusForSelectedPerson();
    }
  };

  // Run with a concurrency of 5 parallel requests
  const concurrency = Math.min(5, total);
  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  
  // Clean up syncing state
  delete currentlySyncingPeople[personKey];
  updateSyncBtnStatusForSelectedPerson();
  
  // Re-render movies grid for this person if they are still the active person
  if (selectedPerson && selectedPerson.name.toLowerCase() === person.name.toLowerCase() && selectedPerson.role === person.role) {
    applyPeopleFiltersAndRender();
  }
  renderGrid();
  
  alert(`Finished syncing ratings for ${person.name}!\n\nSuccessfully synced: ${successCount} movies\nFailed: ${failCount} movies`);
}

async function syncAllCreditsForPerson(person) {
  if (!currentPersonCredits || currentPersonCredits.length === 0) {
    alert("No TMDb credits found to sync. Make sure credits have loaded.");
    return;
  }

  let targetFilename = currentDatabaseFilename;
  if (!targetFilename || targetFilename === "All Lists Combined" || targetFilename.startsWith("Blob") || targetFilename.startsWith("File")) {
    targetFilename = "temp_movies.json";
  }

  const confirmSync = confirm(`Sync and add all ${currentPersonCredits.length} TMDb credits for "${person.name}" to your list "${targetFilename}"?\n\nThis will query TMDb/OMDb for each film and add it to your library.`);
  if (!confirmSync) return;

  const personKey = `${person.name.toLowerCase()}_${person.role}_credits`;
  currentlySyncingPeople[personKey] = {
    completedCount: 0,
    total: currentPersonCredits.length
  };
  updateSyncBtnStatusForSelectedPerson();

  let successCount = 0;
  let failCount = 0;
  const total = currentPersonCredits.length;

  let activeIndex = 0;
  let completedCount = 0;

  const worker = async () => {
    while (activeIndex < total) {
      const i = activeIndex++;
      if (i >= total) break;

      const m = currentPersonCredits[i];
      if (settingsIgnoreExistingRatings && hasFetchedRatings(m)) {
        successCount++;
        completedCount++;
        if (currentlySyncingPeople[personKey]) {
          currentlySyncingPeople[personKey].completedCount = completedCount;
        }
        updateSyncBtnStatusForSelectedPerson();
        continue;
      }
      
      try {
        const response = await fetch(getApiUrl('/api/movie/sync'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: targetFilename,
            film_title: m.Film_title,
            release_year: m.Release_year,
            tmdb_id: m.TMDb_ID || m.tmdb_id || undefined,
            imdb_id: m.IMDb_ID || m.imdb_id || undefined,
            create_if_missing: true,
            skip_people: false
          })
        });

        if (!response.ok) {
          failCount++;
        } else {
          const result = await response.json();
          if (result.success) {
            successCount++;
            Object.assign(m, result.movie);
            delete m._isTemp;
            
            const exists = allMovies.some(lm => {
              const titleMatch = lm.Film_title.toLowerCase().trim() === result.movie.Film_title.toLowerCase().trim();
              const yearDiff = Math.abs(parseInt(lm.Release_year) - parseInt(result.movie.Release_year));
              return titleMatch && (isNaN(yearDiff) || yearDiff <= 1);
            });
            if (!exists) {
              allMovies.push(result.movie);
            }
          } else {
            failCount++;
          }
        }
      } catch (err) {
        console.error('[Credits Sync Error]', err);
        failCount++;
      }

      completedCount++;
      if (currentlySyncingPeople[personKey]) {
        currentlySyncingPeople[personKey].completedCount = completedCount;
      }
      updateSyncBtnStatusForSelectedPerson();
    }
  };

  const concurrency = Math.min(5, total);
  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push(worker());
  }
  
  await Promise.all(workers);

  delete currentlySyncingPeople[personKey];
  updateSyncBtnStatusForSelectedPerson();

  applyPeopleFiltersAndRender();
  renderGrid();
  detectLocalServer();

  alert(`Finished syncing TMDb credits for ${person.name}!\n\nSuccessfully added/synced: ${successCount} movies\nFailed: ${failCount} movies`);
}

async function syncMainDashboardFilms(films) {
  if (films.length === 0) return;
  if (isDashboardSyncing) return;
  
  const syncBtn = document.getElementById('btn-sync-current-db');
  if (!syncBtn) return;
  
  const confirmSync = confirm(`Are you sure you want to sync ratings and details for all ${films.length} currently shown films?`);
  if (!confirmSync) return;
  
  isDashboardSyncing = true;
  syncBtn.disabled = true;
  
  let successCount = 0;
  let failCount = 0;
  const total = films.length;
  
  let activeIndex = 0;
  let completedCount = 0;
  
  const updateBtnStatus = () => {
    syncBtn.innerHTML = `
      <img src="assets/sync.svg" style="height: 11px; width: 11px; vertical-align: middle; animation: spin 1s linear infinite; filter: invert(44%) sepia(11%) saturate(738%) hue-rotate(169deg) brightness(97%) contrast(86%);" alt="Loading">
      Syncing (${completedCount}/${total})...
      <span id="sync-shown-status-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--accent-orange); box-shadow: 0 0 6px var(--accent-orange); transition: all 0.3s ease; margin-left: 2px;"></span>
    `;
  };
  updateBtnStatus();
  
  const worker = async () => {
    while (activeIndex < total) {
      const i = activeIndex++;
      if (i >= total) break;
      
      const m = films[i];
      if (settingsIgnoreExistingRatings && hasFetchedRatings(m)) {
        successCount++;
        completedCount++;
        updateBtnStatus();
        continue;
      }
      
      const targetFilename = m._sourceFile || currentDatabaseFilename;
      
      if (!targetFilename || targetFilename.startsWith("Blob") || targetFilename.startsWith("File")) {
        failCount++;
        completedCount++;
        updateBtnStatus();
        continue;
      }
      
      try {
        const response = await fetch(getApiUrl('/api/movie/sync'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: targetFilename,
            film_title: m.Film_title,
            release_year: m.Release_year,
            tmdb_id: m.TMDb_ID || m.tmdb_id || undefined,
            imdb_id: m.IMDb_ID || m.imdb_id || undefined,
            skip_people: true
          })
        });
        
        if (!response.ok) {
          failCount++;
        } else {
          const result = await response.json();
          if (result.success && result.movie) {
            Object.assign(m, result.movie);
            successCount++;
          } else {
            failCount++;
          }
        }
      } catch (err) {
        console.error('[Dashboard Sync Error]', err);
        failCount++;
      }
      
      completedCount++;
      updateBtnStatus();
    }
  };

  const concurrency = Math.min(5, total);
  const workers = [];
  for (let c = 0; c < concurrency; c++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  
  isDashboardSyncing = false;
  syncBtn.disabled = false;
  syncBtn.innerHTML = `
    <img src="assets/sync.svg" alt="Sync" style="width: 11px; height: 11px; vertical-align: middle; flex-shrink: 0; filter: invert(1);"> SYNC SHOWN
    <span id="sync-shown-status-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #fff; box-shadow: 0 0 6px #fff; transition: all 0.3s ease; margin-left: 2px;"></span>
  `;
  
  renderGrid();
  
  alert(`Finished syncing ratings for dashboard view!\n\nSuccessfully synced: ${successCount} movies\nFailed: ${failCount} movies`);
}

function navigateToPerson(name, preferredRole = null) {
  if (uniquePeopleList.length === 0 && allMovies.length > 0) {
    buildUniquePeopleList();
  }
  
  let matches = uniquePeopleList.filter(p => p.name.toLowerCase() === name.toLowerCase());
  
  if (matches.length === 0) {
    const tempPerson = {
      name: name,
      role: preferredRole || 'actor',
      count: 0
    };
    selectPerson(tempPerson);
  } else {
    let selected = matches[0];
    if (preferredRole) {
      const preferredMatch = matches.find(p => p.role === preferredRole);
      if (preferredMatch) selected = preferredMatch;
    }
    selectPerson(selected);
  }
  
  showPeopleTab();
  closeModal();
}

function renderPeopleMoviesGrid(moviesList) {
  peopleMoviesGrid.innerHTML = '';
  
  if (moviesList.length === 0) {
    peopleMoviesGrid.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; color: var(--text-muted); text-align: center;">No movies found for this selection.</div>';
    return;
  }
  
  moviesList.forEach(m => {
    const card = document.createElement('div');
    card.className = 'movie-card';
    if (m._isTemp) {
      card.className += ' temp-movie-card';
    }
    card.setAttribute('tabindex', '0');
    
    const isWatched = isMovieWatched(m);
    if (isWatched && settingsFadeWatched) {
      card.classList.add('watched-fade');
    }
    
    // Poster image / fallback overlay
    const posterHtml = getPosterImageHtml(m, 'card-poster');
    
    // Calculate display ratings from all platforms
    let ratingHtml = '';
    if (m._isTemp) {
      ratingHtml = `<span style="color: var(--accent-green); font-size: 9.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> CLICK TO SYNC</span>`;
    } else {
      ratingHtml = buildCardRatingHtml(m);
    }

    // Genres badges for overlay
    let genreBadges = '';
    if (Array.isArray(m.Genres)) {
      genreBadges = m.Genres.slice(0, 2).map(g => `<span class="overlay-genre-badge">${g}</span>`).join('');
    }

    let watchedBtnHtml = `
      <button class="card-watched-btn ${isWatched ? 'is-watched' : ''}" title="${isWatched ? 'Remove from Watched' : 'Mark Watched'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    `;

    card.innerHTML = `
      <div class="poster-wrapper">
        ${posterHtml}
        <div class="poster-fallback hidden">
          <span class="fallback-title">${m.Film_title}</span>
          <span class="fallback-year">${m.Release_year || ''}</span>
        </div>
        <!-- Card Hover Details Overlay -->
        <div class="poster-details-overlay">
          <div class="overlay-meta">
            <div class="overlay-director">
              Director
              <span>${m.Director || 'Unknown'}</span>
            </div>
            <div class="overlay-genres">
              ${genreBadges}
            </div>
          </div>
          <div class="overlay-action-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            ${m._isTemp ? 'Sync Movie' : 'Quick View'}
          </div>
        </div>
        ${watchedBtnHtml}
      </div>
      <div class="card-rating">${ratingHtml}</div>
      <div class="card-title">${m.Film_title}</div>
      <div class="card-year">
        ${m.Release_year || ''}
        ${m._isTemp ? '<span class="temp-badge" title="This movie is not in your local library. Click to sync.">TMDb</span>' : ''}
      </div>
    `;

    // Offline Resilience image fallbacks
    const imgEl = card.querySelector('.card-poster');
    const fallbackEl = card.querySelector('.poster-fallback');
    
    if (!imgEl) {
      fallbackEl.classList.remove('hidden');
    }

    const watchedBtn = card.querySelector('.card-watched-btn');
    if (watchedBtn) {
      watchedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowWatched = toggleMovieWatchedState(m);
        if (nowWatched) {
          showToast(`Added "${m.Film_title}" to Watched History`);
        } else {
          showToast(`Removed "${m.Film_title}" from Watched History`);
        }
        
        applyFiltersAndRender();
        if (typeof applyPeopleFiltersAndRender === 'function' && selectedPerson) {
          applyPeopleFiltersAndRender();
        }
      });
    }

    // Modal click trigger
    card.addEventListener('click', () => {
      if (m._isTemp) {
        syncTempMovie(m);
      } else {
        openMovieDetails(m);
      }
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (m._isTemp) {
          syncTempMovie(m);
        } else {
          openMovieDetails(m);
        }
      }
    });

    peopleMoviesGrid.appendChild(card);
  });
}

async function syncTempMovie(m) {
  if (settingsIgnoreExistingRatings && hasFetchedRatings(m)) {
    alert(`"${m.Film_title}" already has fetched ratings. Disable "Ignore Already Synced Ratings" in Settings to force update.`);
    return;
  }

  let targetFilename = currentDatabaseFilename;
  if (!targetFilename || targetFilename === "All Lists Combined" || targetFilename === "all_lists_combined.json" || targetFilename.startsWith("Blob") || targetFilename.startsWith("File")) {
    targetFilename = "temp_movies.json";
  }
  
  const confirmSync = confirm(`"${m.Film_title}" (${m.Release_year || 'Unknown Year'}) is not in your local library.\n\nDo you want to sync it from TMDb/OMDb and add it to your local list "${targetFilename}"?`);
  if (!confirmSync) return;
  
  showLoadingOverlay(`Syncing & Adding "${m.Film_title}" to ${targetFilename}...`);
  try {
    const response = await fetch(getApiUrl('/api/movie/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: targetFilename,
        film_title: m.Film_title,
        release_year: m.Release_year,
        tmdb_id: m.TMDb_ID || m.tmdb_id || undefined,
        imdb_id: m.IMDb_ID || m.imdb_id || undefined,
        create_if_missing: true,
        skip_people: false
      })
    });
    
    hideLoadingOverlay();
    if (!response.ok) {
      alert("Failed to sync movie: Server error");
      return;
    }
    
    const result = await response.json();
    if (result.success && result.movie) {
      alert(`Successfully synced and added "${m.Film_title}"!`);
      delete m._isTemp;
      Object.assign(m, result.movie);
      allMovies.push(result.movie);
      
      applyPeopleFiltersAndRender();
      renderGrid();
      
      detectLocalServer();
    } else {
      alert(`Failed to sync: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    hideLoadingOverlay();
    alert("Connection error occurred while syncing.");
    console.error(err);
  }
}

function loadPeopleDetailsFromTMDB(name, role, totalFilms) {
  document.getElementById('people-portrait-img').style.display = 'none';
  document.getElementById('people-portrait-fallback').style.display = 'flex';
  document.getElementById('people-sidebar-bio').textContent = `${name} is a featured ${role} in your offline library. You have ${totalFilms} of their films in this vault. Explore their filmography and stats here.`;
  document.getElementById('people-tmdb-link').href = `https://www.themoviedb.org/search/person?query=${encodeURIComponent(name)}`;
  document.getElementById('people-imdb-link').href = `https://www.imdb.com/find?q=${encodeURIComponent(name)}&s=nm`;

  const imgEl = document.getElementById('people-portrait-img');
  
  // Try checking the local cache first so it loads instantly offline/online
  fetch(getApiUrl('/api/avatar/cache'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (data.local_url) {
        imgEl.src = data.local_url;
        imgEl.style.display = 'block';
        document.getElementById('people-portrait-fallback').style.display = 'none';
      }
      if (data.bio) {
        let bioText = data.bio;
        if (bioText.length > 350) {
          bioText = bioText.substring(0, 350) + "...";
        }
        document.getElementById('people-sidebar-bio').textContent = bioText;
      }
      if (data.tmdb_url) {
        document.getElementById('people-tmdb-link').href = data.tmdb_url;
      }
      if (data.imdb_url) {
        document.getElementById('people-imdb-link').href = data.imdb_url;
      }
      
      // If we successfully loaded the biography from local cache, skip the online lookup!
      if (data.bio) {
        return;
      }
    }
    
    // Fall back to online TMDB lookup
    fetchOnlineTMDBDetails(name, imgEl);
  })
  .catch(err => {
    console.log("[Avatar Cache Check] Not found or server offline:", err);
    fetchOnlineTMDBDetails(name, imgEl);
  });
}

function fetchOnlineTMDBDetails(name, imgEl) {
  const searchUrl = `https://www.themoviedb.org/search/person?query=${encodeURIComponent(name)}`;
  fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(searchUrl)}`)
    .then(res => {
      if (!res.ok) throw new Error("CORS proxy error");
      return res.json();
    })
    .then(proxyData => {
      const html = proxyData.contents;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const personLink = doc.querySelector('.search_results .item .result a') || doc.querySelector('a[href*="/person/"]');
      if (personLink) {
        const personHref = personLink.getAttribute('href');
        if (personHref) {
          const personPageUrl = `https://www.themoviedb.org${personHref}`;
          document.getElementById('people-tmdb-link').href = personPageUrl;
          return fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(personPageUrl)}`);
        }
      }
      throw new Error("Person profile not found");
    })
    .then(res => res ? res.json() : null)
    .then(proxyData => {
      if (!proxyData) return;
      const html = proxyData.contents;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      const bioParagraphs = doc.querySelectorAll('.biography .content p') || doc.querySelectorAll('.biography p');
      let bioText = "";
      bioParagraphs.forEach(p => {
        if (p.textContent.trim()) bioText += p.textContent.trim() + " ";
      });
      
      if (!bioText) {
        const bioDiv = doc.querySelector('.biography .content') || doc.querySelector('.biography');
        if (bioDiv) bioText = bioDiv.textContent.trim();
      }
      
      if (bioText) {
        if (bioText.length > 350) {
          bioText = bioText.substring(0, 350) + "...";
        }
        document.getElementById('people-sidebar-bio').textContent = bioText;
      }
      
      // Look for IMDb Link if present
      let imdbUrl = "";
      const imdbLinkEl = doc.querySelector('a[href*="imdb.com/name/"]');
      if (imdbLinkEl) {
        imdbUrl = imdbLinkEl.getAttribute('href');
        document.getElementById('people-imdb-link').href = imdbUrl;
      } else {
        imdbUrl = `https://www.imdb.com/find?q=${encodeURIComponent(name)}&s=nm`;
      }
      
      const tmdbUrl = document.getElementById('people-tmdb-link').href;
      
      const profileImg = doc.querySelector('img.profile') || doc.querySelector('.profile_wrapper img') || doc.querySelector('.image_content img') || doc.querySelector('.poster img');
      if (profileImg) {
        let imgSrc = profileImg.getAttribute('src') || profileImg.getAttribute('data-src');
        if (imgSrc) {
          if (imgSrc.startsWith('/')) {
            imgSrc = `https://image.tmdb.org/t/p/w500${imgSrc}`;
          }
          
          // Request cache from the backend (saving image AND details)
          fetch(getApiUrl('/api/avatar/cache'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url: imgSrc, bio: bioText, tmdb_url: tmdbUrl, imdb_url: imdbUrl })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success && data.local_url) {
              imgEl.src = data.local_url;
              imgEl.style.display = 'block';
              document.getElementById('people-portrait-fallback').style.display = 'none';
            } else {
              imgEl.src = imgSrc;
              imgEl.style.display = 'block';
              document.getElementById('people-portrait-fallback').style.display = 'none';
            }
          })
          .catch(err => {
            imgEl.src = imgSrc;
            imgEl.style.display = 'block';
            document.getElementById('people-portrait-fallback').style.display = 'none';
          });
        }
      } else if (bioText) {
        // Bio only (no profile image found), save to cache
        fetch(getApiUrl('/api/avatar/cache'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, bio: bioText, tmdb_url: tmdbUrl, imdb_url: imdbUrl })
        }).catch(err => console.log("Failed to cache bio-only:", err));
      }
    })
    .catch(err => {
      console.log("[TMDB Fetch Warning] Person scraper skipped (using fallback bio/photo):", err.message);
    });
}


/* --------------------------------------------------------------------------
   9a. PEOPLE TAB FILTERING & SORTING EXTENSION
   -------------------------------------------------------------------------- */

function updateSyncBtnStatusForSelectedPerson() {
  const syncBtn = document.getElementById('person-sync-btn');
  const syncCreditsBtn = document.getElementById('person-sync-all-credits-btn');
  if (!selectedPerson) return;
  
  const personKey = `${selectedPerson.name.toLowerCase()}_${selectedPerson.role}`;
  const syncInfo = currentlySyncingPeople[personKey];
  
  if (syncBtn) {
    if (syncInfo) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = `<img src="assets/sync.svg" style="height: 14px; width: 14px; vertical-align: middle; animation: spin 1s linear infinite; filter: invert(44%) sepia(11%) saturate(738%) hue-rotate(169deg) brightness(97%) contrast(86%);" alt="Loading"> Syncing (${syncInfo.completedCount}/${syncInfo.total})...`;
    } else {
      syncBtn.disabled = false;
      syncBtn.innerHTML = `<img src="assets/sync.svg" alt="Sync Person" style="width: 13px; height: 13px; vertical-align: middle; flex-shrink: 0; filter: invert(1);"> SYNC ALL RATINGS`;
    }
  }

  const creditsKey = `${selectedPerson.name.toLowerCase()}_${selectedPerson.role}_credits`;
  const creditsSyncInfo = currentlySyncingPeople[creditsKey];

  if (syncCreditsBtn) {
    if (creditsSyncInfo) {
      syncCreditsBtn.disabled = true;
      syncCreditsBtn.innerHTML = `<img src="assets/sync.svg" style="height: 14px; width: 14px; vertical-align: middle; animation: spin 1s linear infinite; filter: invert(44%) sepia(11%) saturate(738%) hue-rotate(169deg) brightness(97%) contrast(86%);" alt="Loading"> Syncing (${creditsSyncInfo.completedCount}/${creditsSyncInfo.total})...`;
    } else {
      syncCreditsBtn.disabled = false;
      syncCreditsBtn.innerHTML = `<img src="assets/sync.svg" alt="Sync All Credits" style="width: 13px; height: 13px; vertical-align: middle; flex-shrink: 0; filter: invert(1);"> SYNC ALL TMDb CREDITS`;
    }
  }
}

function applyPeopleFiltersAndRender() {
  if (!selectedPerson) return;
  
  // 1. Get all films matching the person's role (actor or director)
  let matchFilms = allMovies.filter(m => {
    if (selectedPerson.role === 'actor') {
      return Array.isArray(m.Cast) && m.Cast.some(c => c.trim().toLowerCase() === selectedPerson.name.toLowerCase());
    } else {
      let directors = [];
      if (typeof m.Director === 'string') {
        directors = m.Director.split(',').map(d => d.trim());
      } else if (Array.isArray(m.Director)) {
        directors = m.Director;
      }
      return Array.isArray(directors) && directors.some(d => d.trim().toLowerCase() === selectedPerson.name.toLowerCase());
    }
  });

  // Merge in TMDb credits as temporary movies if not already in matchFilms
  if (Array.isArray(currentPersonCredits) && currentPersonCredits.length > 0) {
    currentPersonCredits.forEach(credit => {
      // 1. Check if it's already in matchFilms
      const alreadyInMatch = matchFilms.some(localFilm => {
        const titleMatch = localFilm.Film_title.toLowerCase().trim() === credit.Film_title.toLowerCase().trim();
        const yearDiff = Math.abs(parseInt(localFilm.Release_year) - parseInt(credit.Release_year));
        return titleMatch && (isNaN(yearDiff) || yearDiff <= 1);
      });
      if (alreadyInMatch) return;

      // 2. Check if we have it in the local database (allMovies)
      const localFilmInDb = allMovies.find(localFilm => {
        const titleMatch = localFilm.Film_title && localFilm.Film_title.toLowerCase().trim() === credit.Film_title.toLowerCase().trim();
        const yearDiff = Math.abs(parseInt(localFilm.Release_year) - parseInt(credit.Release_year));
        return titleMatch && (isNaN(yearDiff) || yearDiff <= 1);
      });

      if (localFilmInDb) {
        // It exists in the local database, so add it to the matches list (not temp!)
        matchFilms.push(localFilmInDb);
      } else {
        // Doesn't exist locally, so push as temporary TMDb credit item
        matchFilms.push({
          Film_title: credit.Film_title,
          Release_year: credit.Release_year,
          Poster_URL: credit.Poster_URL,
          TMDb_ID: credit.TMDb_ID,
          _isTemp: true,
          Average_rating: 0,
          Watches: 0,
          Genres: [],
          Countries: [],
          Studios: []
        });
      }
    });
  }

  // 2. Filter this list of films based on the people filter states
  const filteredFilms = matchFilms.filter(m => {
    // Hide Watched Filter
    if (settingsHideWatched && isMovieWatched(m)) {
      return false;
    }

    // Genres filter
    if (peopleSelectedGenres.size > 0) {
      const hasGenre = Array.isArray(m.Genres) && m.Genres.some(g => peopleSelectedGenres.has(g));
      if (!hasGenre) return false;
    }
    if (peopleExcludedGenres.size > 0) {
      const hasExcludedGenre = Array.isArray(m.Genres) && m.Genres.some(g => peopleExcludedGenres.has(g));
      if (hasExcludedGenre) return false;
    }

    // Themes filter
    if (peopleSelectedThemes.size > 0) {
      const hasTheme = Array.isArray(m.Themes) && m.Themes.some(t => peopleSelectedThemes.has(t));
      if (!hasTheme) return false;
    }

    // Year Range Filter
    const year = parseInt(m.Release_year);
    if (peopleFilterYearMin !== null || peopleFilterYearMax !== null) {
      if (year > 0) {
        if (peopleFilterYearMin !== null && year < peopleFilterYearMin) return false;
        if (peopleFilterYearMax !== null && year > peopleFilterYearMax) return false;
      } else {
        return false;
      }
    }

    // Rating Filter
    const rating = parseFloat(m.Average_rating);
    if (peopleFilterRatingMin > 0) {
      if (!rating || rating < peopleFilterRatingMin) return false;
    }

    // IMDb Rating Filter
    if (peopleFilterImdbRatingMin > 0) {
      let imdbRating = null;
      if (m.IMDb_Rating && m.IMDb_Rating !== 'None') {
        imdbRating = parseFloat(m.IMDb_Rating.split('/')[0]);
      } else if (m.TMDb_Rating && m.TMDb_Rating !== 'None') {
        imdbRating = parseFloat(m.TMDb_Rating.split('/')[0]);
      }
      if (!imdbRating || imdbRating < peopleFilterImdbRatingMin) return false;
    }

    // Rotten Tomatoes Rating Filter
    if (peopleFilterRtRatingMin > 0) {
      let rtRating = null;
      if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None') {
        rtRating = parseInt(m.Rotten_Tomatoes.replace('%', ''));
      }
      if (!rtRating || rtRating < peopleFilterRtRatingMin) return false;
    }

    // Metascore Rating Filter
    if (peopleFilterMetaRatingMin > 0) {
      let metascore = null;
      if (m.Metascore && m.Metascore !== 'None') {
        metascore = parseInt(m.Metascore.split('/')[0]);
      }
      if (!metascore || metascore < peopleFilterMetaRatingMin) return false;
    }

    // Runtime Filter
    const runtime = parseInt(m.Runtime);
    if (peopleFilterRuntimeMin !== null || peopleFilterRuntimeMax !== null) {
      if (runtime > 0) {
        if (peopleFilterRuntimeMin !== null && runtime < peopleFilterRuntimeMin) return false;
        if (peopleFilterRuntimeMax !== null && runtime > peopleFilterRuntimeMax) return false;
      } else {
        return false;
      }
    }

    // Original Language filter
    if (peopleSelectedLanguages.size > 0) {
      if (!m.Original_language || !peopleSelectedLanguages.has(m.Original_language)) return false;
    }

    // Country filter
    if (peopleSelectedCountries.size > 0) {
      if (!Array.isArray(m.Countries) || !m.Countries.some(c => peopleSelectedCountries.has(c))) return false;
    }

    // Studios filter
    if (peopleSelectedStudios.size > 0) {
      if (!Array.isArray(m.Studios) || !m.Studios.some(s => peopleSelectedStudios.has(s))) return false;
    }

    return true;
  });

  // 3. Sort the filtered films list
  const sortBy = peopleSortValue;
  if (sortBy !== 'best-match') {
    filteredFilms.sort((a, b) => {
      const valA = getSortValue(a, sortBy);
      const valB = getSortValue(b, sortBy);

      // If sorting by rating or year, put 0 values (unrated/unreleased) at the bottom
      if (sortBy.startsWith('rating-') || sortBy.startsWith('year-')) {
        if (valA === 0 && valB > 0) return 1;
        if (valB === 0 && valA > 0) return -1;
      }

      if (sortBy.endsWith('-desc')) {
        return valB - valA;
      } else {
        return valA - valB;
      }
    });
  }

  // Update title counts and filters badge
  const resultsCountEl = document.getElementById('people-results-count');
  if (resultsCountEl) {
    resultsCountEl.textContent = `${filteredFilms.length} titles`;
  }
  
  // Update watched stats and progress bar dynamically based on the current selection (excluding temp movies)
  const localMatchFilms = matchFilms.filter(f => !f._isTemp);
  const localTotalFilms = localMatchFilms.length;
  const localWatchedCount = localMatchFilms.filter(f => isMovieWatched(f)).length;
  const localPercent = localTotalFilms > 0 ? Math.round((localWatchedCount / localTotalFilms) * 100) : 0;
  
  const statsTextEl = document.getElementById('people-stats-text');
  if (statsTextEl) {
    statsTextEl.textContent = `You've watched ${localWatchedCount} of ${localTotalFilms} total`;
  }
  const progressFillEl = document.getElementById('people-progress-fill');
  if (progressFillEl) {
    progressFillEl.style.width = `${localPercent}%`;
  }
  const statsPercentEl = document.getElementById('people-stats-percent');
  if (statsPercentEl) {
    statsPercentEl.textContent = `${localPercent}%`;
  }
  
  updatePeopleFiltersBadge();
  updatePeopleFilterTagsCounts(filteredFilms, matchFilms);
  renderPeopleMoviesGrid(filteredFilms);
}

function updatePeopleFiltersBadge() {
  const hasActiveFilters = 
    peopleSelectedGenres.size > 0 || 
    peopleExcludedGenres.size > 0 ||
    peopleSelectedThemes.size > 0 || 
    peopleSelectedStudios.size > 0 || 
    peopleSelectedLanguages.size > 0 || 
    peopleSelectedCountries.size > 0 || 
    peopleFilterYearMin !== null || 
    peopleFilterYearMax !== null || 
    peopleFilterRatingMin > 0 || 
    peopleFilterImdbRatingMin > 0 || 
    peopleFilterRtRatingMin > 0 || 
    peopleFilterMetaRatingMin > 0 || 
    peopleFilterRuntimeMin !== null || 
    peopleFilterRuntimeMax !== null;

  const peopleBtnClearFilters = document.getElementById('people-btn-clear-filters');
  if (peopleBtnClearFilters) {
    if (hasActiveFilters) {
      peopleBtnClearFilters.classList.remove('hidden');
    } else {
      peopleBtnClearFilters.classList.add('hidden');
    }
  }
  
  const peopleFilterBadge = document.getElementById('people-filter-badge');
  if (peopleFilterBadge) {
    const totalFilters = peopleSelectedGenres.size + peopleExcludedGenres.size + peopleSelectedThemes.size + peopleSelectedStudios.size + peopleSelectedLanguages.size + peopleSelectedCountries.size +
      (peopleFilterYearMin !== null || peopleFilterYearMax !== null ? 1 : 0) +
      (peopleFilterRatingMin > 0 ? 1 : 0) +
      (peopleFilterImdbRatingMin > 0 ? 1 : 0) +
      (peopleFilterRtRatingMin > 0 ? 1 : 0) +
      (peopleFilterMetaRatingMin > 0 ? 1 : 0) +
      (peopleFilterRuntimeMin !== null || peopleFilterRuntimeMax !== null ? 1 : 0);
      
    if (totalFilters > 0) {
      peopleFilterBadge.textContent = `${totalFilters} active`;
      peopleFilterBadge.classList.remove('hidden');
    } else {
      peopleFilterBadge.classList.add('hidden');
    }
  }
}

function clearPeopleFilters() {
  clearPeopleFiltersQuietly();
  applyPeopleFiltersAndRender();
}

function clearPeopleFiltersQuietly() {
  peopleSelectedGenres.clear();
  peopleExcludedGenres.clear();
  peopleSelectedThemes.clear();
  peopleSelectedStudios.clear();
  peopleSelectedLanguages.clear();
  peopleSelectedCountries.clear();
  
  peopleFilterYearMin = null;
  peopleFilterYearMax = null;
  const filterYearMinInput = document.getElementById('people-filter-year-min');
  const filterYearMaxInput = document.getElementById('people-filter-year-max');
  if (filterYearMinInput) filterYearMinInput.value = '';
  if (filterYearMaxInput) filterYearMaxInput.value = '';
  updatePeopleDecadePresetHighlight();
  
  peopleFilterRatingMin = 0.0;
  const filterRatingMinInput = document.getElementById('people-filter-rating-min');
  const filterRatingValDisplay = document.getElementById('people-filter-rating-val');
  if (filterRatingMinInput) filterRatingMinInput.value = 0;
  if (filterRatingValDisplay) filterRatingValDisplay.textContent = '0.0';

  peopleFilterImdbRatingMin = 0.0;
  const filterImdbRatingMinInput = document.getElementById('people-filter-imdb-rating-min');
  const filterImdbRatingValDisplay = document.getElementById('people-filter-imdb-rating-val');
  if (filterImdbRatingMinInput) filterImdbRatingMinInput.value = 0;
  if (filterImdbRatingValDisplay) filterImdbRatingValDisplay.textContent = '0.0';

  peopleFilterRtRatingMin = 0;
  const filterRtRatingMinInput = document.getElementById('people-filter-rt-rating-min');
  const filterRtRatingValDisplay = document.getElementById('people-filter-rt-rating-val');
  if (filterRtRatingMinInput) filterRtRatingMinInput.value = 0;
  if (filterRtRatingValDisplay) filterRtRatingValDisplay.textContent = '0';

  peopleFilterMetaRatingMin = 0;
  const filterMetaRatingMinInput = document.getElementById('people-filter-meta-rating-min');
  const filterMetaRatingValDisplay = document.getElementById('people-filter-meta-rating-val');
  if (filterMetaRatingMinInput) filterMetaRatingMinInput.value = 0;
  if (filterMetaRatingValDisplay) filterMetaRatingValDisplay.textContent = '0';
  
  peopleFilterRuntimeMin = null;
  peopleFilterRuntimeMax = null;
  const filterRuntimeMinInput = document.getElementById('people-filter-runtime-min');
  const filterRuntimeMaxInput = document.getElementById('people-filter-runtime-max');
  if (filterRuntimeMinInput) filterRuntimeMinInput.value = '';
  if (filterRuntimeMaxInput) filterRuntimeMaxInput.value = '';
  updatePeopleRuntimePresetHighlight();
  
  const themeSearchInput = document.getElementById('people-theme-search-input');
  if (themeSearchInput) themeSearchInput.value = '';
  
  const studioSearchInput = document.getElementById('people-studio-search-input');
  if (studioSearchInput) studioSearchInput.value = '';
  
  const containerIds = [
    'people-genres-filter-list',
    'people-themes-filter-list',
    'people-languages-filter-list',
    'people-countries-filter-list',
    'people-studios-filter-list'
  ];
  containerIds.forEach(id => {
    const container = document.getElementById(id);
    if (container) {
      container.querySelectorAll('.filter-tag').forEach(tag => {
        tag.classList.remove('selected');
        tag.classList.remove('excluded');
        tag.classList.remove('hidden');
      });
    }
  });

  peopleSortValue = 'popularity-desc';
  const peopleSortSelect = document.getElementById('people-sort-select');
  if (peopleSortSelect) peopleSortSelect.value = 'popularity-desc';
}

function updatePeopleFilterTagsCounts(filteredFilms, matchFilms) {
  try {
    const genreCounts = {};
    const themeCounts = {};
    const languageCounts = {};
    const countryCounts = {};
    const studioCounts = {};

    // Initialize counts for all known tags to 0
    allMovies.forEach(m => {
      if (Array.isArray(m.Genres)) {
        m.Genres.forEach(g => { if (g) genreCounts[g] = 0; });
      }
      if (Array.isArray(m.Themes)) {
        m.Themes.forEach(t => { if (t) themeCounts[t] = 0; });
      }
      if (m.Original_language) {
        languageCounts[m.Original_language] = 0;
      }
      if (Array.isArray(m.Countries)) {
        m.Countries.forEach(c => { if (c) countryCounts[c] = 0; });
      }
      if (Array.isArray(m.Studios)) {
        m.Studios.forEach(s => { if (s) studioCounts[s] = 0; });
      }
    });

    // Count matches within the currently filtered results for the person
    filteredFilms.forEach(m => {
      if (Array.isArray(m.Genres)) {
        m.Genres.forEach(g => { if (g) genreCounts[g] = (genreCounts[g] || 0) + 1; });
      }
      if (Array.isArray(m.Themes)) {
        m.Themes.forEach(t => { if (t) themeCounts[t] = (themeCounts[t] || 0) + 1; });
      }
      if (m.Original_language) {
        languageCounts[m.Original_language] = (languageCounts[m.Original_language] || 0) + 1;
      }
      if (Array.isArray(m.Countries)) {
        m.Countries.forEach(c => { if (c) countryCounts[c] = (countryCounts[c] || 0) + 1; });
      }
      if (Array.isArray(m.Studios)) {
        m.Studios.forEach(s => { if (s) studioCounts[s] = (studioCounts[s] || 0) + 1; });
      }
    });

    // Update each tag button text and classes in the people containers
    updateTagsInContainer('people-genres-filter-list', genreCounts, peopleSelectedGenres, peopleExcludedGenres);
    updateTagsInContainer('people-themes-filter-list', themeCounts, peopleSelectedThemes);
    updateTagsInContainer('people-languages-filter-list', languageCounts, peopleSelectedLanguages);
    updateTagsInContainer('people-countries-filter-list', countryCounts, peopleSelectedCountries);
    updateTagsInContainer('people-studios-filter-list', studioCounts, peopleSelectedStudios);
  } catch (err) {
    console.error("[OfflineBoxd Error] Error in updatePeopleFilterTagsCounts:", err);
  }
}

function updatePeopleDecadePresetHighlight() {
  const minInput = document.getElementById('people-filter-year-min');
  const maxInput = document.getElementById('people-filter-year-max');
  if (!minInput || !maxInput) return;
  const minVal = minInput.value !== '' ? parseInt(minInput.value) : null;
  const maxVal = maxInput.value !== '' ? parseInt(maxInput.value) : null;
  
  document.querySelectorAll('.people-decade-preset-btn').forEach(btn => {
    const decVal = parseInt(btn.textContent);
    if (minVal === decVal && maxVal === (decVal + 9)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updatePeopleRuntimePresetHighlight() {
  const minInput = document.getElementById('people-filter-runtime-min');
  const maxInput = document.getElementById('people-filter-runtime-max');
  if (!minInput || !maxInput) return;
  const minVal = minInput.value !== '' ? parseInt(minInput.value) : null;
  const maxVal = maxInput.value !== '' ? parseInt(maxInput.value) : null;
  
  document.querySelectorAll('.people-runtime-preset-btn').forEach(btn => {
    const pMin = parseInt(btn.getAttribute('data-min'));
    const pMax = parseInt(btn.getAttribute('data-max'));
    if (minVal === pMin && maxVal === pMax) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Register Listeners for People Filters
const peopleFilterYearMinInput = document.getElementById('people-filter-year-min');
const peopleFilterYearMaxInput = document.getElementById('people-filter-year-max');

const handlePeopleYearInput = () => {
  if (peopleFilterYearMinInput && peopleFilterYearMaxInput) {
    const minVal = peopleFilterYearMinInput.value;
    const maxVal = peopleFilterYearMaxInput.value;
    peopleFilterYearMin = minVal !== '' ? parseInt(minVal) : null;
    peopleFilterYearMax = maxVal !== '' ? parseInt(maxVal) : null;
    updatePeopleDecadePresetHighlight();
    applyPeopleFiltersAndRender();
  }
};

if (peopleFilterYearMinInput) peopleFilterYearMinInput.addEventListener('input', handlePeopleYearInput);
if (peopleFilterYearMaxInput) peopleFilterYearMaxInput.addEventListener('input', handlePeopleYearInput);

const peopleFilterRatingMinInput = document.getElementById('people-filter-rating-min');
const peopleFilterRatingValDisplay = document.getElementById('people-filter-rating-val');

if (peopleFilterRatingMinInput) {
  peopleFilterRatingMinInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    peopleFilterRatingMin = val;
    if (peopleFilterRatingValDisplay) {
      peopleFilterRatingValDisplay.textContent = val.toFixed(1);
    }
    applyPeopleFiltersAndRender();
  });
}

const peopleFilterImdbRatingMinInput = document.getElementById('people-filter-imdb-rating-min');
const peopleFilterImdbRatingValDisplay = document.getElementById('people-filter-imdb-rating-val');

if (peopleFilterImdbRatingMinInput) {
  peopleFilterImdbRatingMinInput.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    peopleFilterImdbRatingMin = val;
    if (peopleFilterImdbRatingValDisplay) {
      peopleFilterImdbRatingValDisplay.textContent = val.toFixed(1);
    }
    applyPeopleFiltersAndRender();
  });
}

const peopleFilterRtRatingMinInput = document.getElementById('people-filter-rt-rating-min');
const peopleFilterRtRatingValDisplay = document.getElementById('people-filter-rt-rating-val');

if (peopleFilterRtRatingMinInput) {
  peopleFilterRtRatingMinInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    peopleFilterRtRatingMin = val;
    if (peopleFilterRtRatingValDisplay) {
      peopleFilterRtRatingValDisplay.textContent = val;
    }
    applyPeopleFiltersAndRender();
  });
}

const peopleFilterMetaRatingMinInput = document.getElementById('people-filter-meta-rating-min');
const peopleFilterMetaRatingValDisplay = document.getElementById('people-filter-meta-rating-val');

if (peopleFilterMetaRatingMinInput) {
  peopleFilterMetaRatingMinInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    peopleFilterMetaRatingMin = val;
    if (peopleFilterMetaRatingValDisplay) {
      peopleFilterMetaRatingValDisplay.textContent = val;
    }
    applyPeopleFiltersAndRender();
  });
}

const peopleFilterRuntimeMinInput = document.getElementById('people-filter-runtime-min');
const peopleFilterRuntimeMaxInput = document.getElementById('people-filter-runtime-max');

const handlePeopleRuntimeInput = () => {
  if (peopleFilterRuntimeMinInput && peopleFilterRuntimeMaxInput) {
    const minVal = peopleFilterRuntimeMinInput.value;
    const maxVal = peopleFilterRuntimeMaxInput.value;
    peopleFilterRuntimeMin = minVal !== '' ? parseInt(minVal) : null;
    peopleFilterRuntimeMax = maxVal !== '' ? parseInt(maxVal) : null;
    updatePeopleRuntimePresetHighlight();
    applyPeopleFiltersAndRender();
  }
};

if (peopleFilterRuntimeMinInput) peopleFilterRuntimeMinInput.addEventListener('input', handlePeopleRuntimeInput);
if (peopleFilterRuntimeMaxInput) peopleFilterRuntimeMaxInput.addEventListener('input', handlePeopleRuntimeInput);

document.querySelectorAll('.people-runtime-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (peopleFilterRuntimeMinInput && peopleFilterRuntimeMaxInput) {
      const minVal = btn.getAttribute('data-min');
      const maxVal = btn.getAttribute('data-max');
      if (peopleFilterRuntimeMinInput.value === minVal && peopleFilterRuntimeMaxInput.value === maxVal) {
        peopleFilterRuntimeMinInput.value = '';
        peopleFilterRuntimeMaxInput.value = '';
      } else {
        peopleFilterRuntimeMinInput.value = minVal;
        peopleFilterRuntimeMaxInput.value = maxVal;
      }
      peopleFilterRuntimeMinInput.dispatchEvent(new Event('input'));
    }
  });
});

const peopleThemeSearchInput = document.getElementById('people-theme-search-input');
if (peopleThemeSearchInput) {
  peopleThemeSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#people-themes-filter-list .filter-tag').forEach(btn => {
      const themeVal = btn.getAttribute('data-value').toLowerCase();
      if (themeVal.includes(query)) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    });
  });
}

const peopleStudioSearchInput = document.getElementById('people-studio-search-input');
if (peopleStudioSearchInput) {
  peopleStudioSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const studiosContainer = document.getElementById('people-studios-filter-list');
    if (!studiosContainer) return;
    
    if (query === '') {
      const studiosToRender = Array.from(new Set([
        ...Array.from(peopleSelectedStudios),
        ...allStudiosSorted.slice(0, 100)
      ]));
      renderFilterGroup('people-studios-filter-list', studiosToRender, peopleSelectedStudios, null, applyPeopleFiltersAndRender);
    } else {
      const matches = allStudiosSorted.filter(s => s.toLowerCase().includes(query));
      const studiosToRender = Array.from(new Set([
        ...Array.from(peopleSelectedStudios).filter(s => s.toLowerCase().includes(query)),
        ...matches.slice(0, 100)
      ]));
      renderFilterGroup('people-studios-filter-list', studiosToRender, peopleSelectedStudios, null, applyPeopleFiltersAndRender);
    }
  });
}

const peopleSortSelect = document.getElementById('people-sort-select');
if (peopleSortSelect) {
  peopleSortSelect.addEventListener('change', (e) => {
    peopleSortValue = e.target.value;
    applyPeopleFiltersAndRender();
  });
}

const peopleBtnClearFilters = document.getElementById('people-btn-clear-filters');
if (peopleBtnClearFilters) {
  peopleBtnClearFilters.addEventListener('click', () => {
    clearPeopleFilters();
  });
}

/* --------------------------------------------------------------------------
   10. NEW LIST CREATION SYSTEM (Letterboxd Style)
   -------------------------------------------------------------------------- */

const btnShowNewListForm = document.getElementById('btn-show-new-list-form');
const btnCreateListCancel = document.getElementById('btn-create-list-cancel');
const btnCreateListSave = document.getElementById('btn-create-list-save');
const btnImportTitles = document.getElementById('btn-import-titles');
const newListSectionObj = document.getElementById('new-list-section');
const localFilesSectionObj = document.getElementById('local-files-section');
const addFilmSearchInput = document.getElementById('add-film-search');
const addFilmSuggestions = document.getElementById('add-film-suggestions');
const newListRankedInput = document.getElementById('new-list-ranked');

let draftListFilms = [];
let uniqueSearchFilms = [];
let editingListFilename = null;

const btnCombineSelected = document.getElementById('btn-combine-selected');
if (btnCombineSelected) {
  btnCombineSelected.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.db-select-checkbox:checked');
    const selectedFiles = Array.from(checkboxes).map(cb => cb.getAttribute('data-filename'));
    
    if (selectedFiles.length < 2) return;
    
    combineAndSaveSelectedLists(selectedFiles);
  });
}

function buildUniqueSearchFilms() {
  const seen = new Set();
  uniqueSearchFilms = [];
  
  if (allMovies && allMovies.length > 0) {
    allMovies.forEach(m => {
      if (m && m.Film_title && m.Film_title !== "__metadata__") {
        const key = `${m.Film_title.toLowerCase()}_${m.Release_year || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSearchFilms.push(m);
        }
      }
    });
  }
}

function renderDraftFilms() {
  const container = document.getElementById('new-list-films-grid');
  const emptyState = document.getElementById('new-list-empty-state');
  const isRanked = newListRankedInput ? newListRankedInput.checked : false;

  if (draftListFilms.length === 0) {
    if (container) container.classList.add('hidden');
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (container) {
    container.classList.remove('hidden');
    container.innerHTML = '';
  }

  draftListFilms.forEach((film, index) => {
    const row = document.createElement('div');
    row.className = 'new-list-film-row';
    
    const rankHtml = isRanked ? `<span class="film-rank-badge">${index + 1}</span>` : '';
    let localFilename = '';
    let localUrl = '';
    if (film.Poster_URL && film.Poster_URL !== 'nan') {
      if (film.TMDb_ID) {
        localFilename = `${film.TMDb_ID}.jpg`;
      } else if (film.IMDb_ID && film.IMDb_ID !== 'None' && film.IMDb_ID !== 'nan' && film.IMDb_ID !== '') {
        localFilename = `${film.IMDb_ID}.jpg`;
      } else if (film.Film_title) {
        const safeTitle = film.Film_title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        localFilename = `${safeTitle}_${film.Release_year || ''}.jpg`;
      }
      localUrl = `assets/covers/${localFilename}`;
    } else {
      localUrl = 'assets/watched.svg';
    }

    const safePosterUrl = (film.Poster_URL || '').replace(/'/g, "\\'");
    const safeLocalFilename = localFilename.replace(/'/g, "\\'");
    const onerrorAttr = film.Poster_URL && film.Poster_URL !== 'nan' ? `this.onerror=function(){this.src='assets/watched.svg';}; this.src='${safePosterUrl}'; fetch('/api/cover/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '${safePosterUrl}', filename: '${safeLocalFilename}' }) }).catch(err => console.error(err));` : `this.src='assets/watched.svg';`;

    row.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; min-width: 24px;">
        <button class="btn-reorder-up" title="Move Up">▲</button>
        <button class="btn-reorder-down" title="Move Down">▼</button>
      </div>
      ${rankHtml}
      <img src="${localUrl}" style="width: 32px; height: 48px; object-fit: cover; border-radius: 3px; background: #14181c; border: 1px solid rgba(255,255,255,0.1);" onerror="${onerrorAttr}">
      <div style="flex-grow: 1; display: flex; flex-direction: column;">
        <span style="font-size: 14px; font-weight: 700; color: #fff;">${film.Film_title}</span>
        <span style="font-size: 12px; color: var(--text-muted);">${year} • Directed by ${director}</span>
      </div>
      <button class="btn-remove-film" title="Remove Film">×</button>
    `;

    // Add event listeners
    row.querySelector('.btn-reorder-up').addEventListener('click', (e) => {
      e.preventDefault();
      moveDraftFilm(index, -1);
    });
    row.querySelector('.btn-reorder-down').addEventListener('click', (e) => {
      e.preventDefault();
      moveDraftFilm(index, 1);
    });
    row.querySelector('.btn-remove-film').addEventListener('click', (e) => {
      e.preventDefault();
      removeDraftFilm(index);
    });

    if (container) container.appendChild(row);
  });
}

function moveDraftFilm(index, direction) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= draftListFilms.length) return;
  
  const temp = draftListFilms[index];
  draftListFilms[index] = draftListFilms[targetIndex];
  draftListFilms[targetIndex] = temp;
  
  renderDraftFilms();
}

function removeDraftFilm(index) {
  draftListFilms.splice(index, 1);
  renderDraftFilms();
}

if (btnShowNewListForm) {
  btnShowNewListForm.addEventListener('click', (e) => {
    e.preventDefault();
    if (localFilesSectionObj) localFilesSectionObj.classList.add('hidden');
    if (newListSectionObj) newListSectionObj.classList.remove('hidden');
    
    editingListFilename = null;
    const formTitle = document.querySelector('.new-list-header h2');
    if (formTitle) formTitle.textContent = "New List";
    
    // Clear form inputs
    draftListFilms = [];
    document.getElementById('new-list-name').value = '';
    document.getElementById('new-list-description').value = '';
    document.getElementById('new-list-tags').value = '';
    if (newListRankedInput) newListRankedInput.checked = false;
    if (addFilmSearchInput) addFilmSearchInput.value = '';
    
    renderDraftFilms();
    buildUniqueSearchFilms();
  });
}

if (btnCreateListCancel) {
  btnCreateListCancel.addEventListener('click', (e) => {
    e.preventDefault();
    editingListFilename = null;
    if (newListSectionObj) newListSectionObj.classList.add('hidden');
    if (localFilesSectionObj) localFilesSectionObj.classList.remove('hidden');
  });
}

if (newListRankedInput) {
  newListRankedInput.addEventListener('change', () => {
    renderDraftFilms();
  });
}

if (addFilmSearchInput) {
  addFilmSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
      if (addFilmSuggestions) addFilmSuggestions.classList.add('hidden');
      return;
    }

    if (uniqueSearchFilms.length === 0) {
      buildUniqueSearchFilms();
    }

    // Filter matching films
    const matches = uniqueSearchFilms.filter(m => 
      m.Film_title && m.Film_title.toLowerCase().includes(query)
    ).slice(0, 10);

    if (addFilmSuggestions) {
      if (matches.length === 0) {
        addFilmSuggestions.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px; text-align: center;">No matches found. Press Enter to add placeholder.</div>`;
      } else {
        addFilmSuggestions.innerHTML = '';
        matches.forEach(m => {
          const div = document.createElement('div');
          div.className = 'add-film-suggestion-item';
          const year = m.Release_year || 'N/A';
          const director = m.Director || 'Unknown';
          
          let localFilename = '';
          let localUrl = '';
          if (m.Poster_URL && m.Poster_URL !== 'nan') {
            if (m.TMDb_ID) {
              localFilename = `${m.TMDb_ID}.jpg`;
            } else if (m.IMDb_ID && m.IMDb_ID !== 'None' && m.IMDb_ID !== 'nan' && m.IMDb_ID !== '') {
              localFilename = `${m.IMDb_ID}.jpg`;
            } else if (m.Film_title) {
              const safeTitle = m.Film_title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
              localFilename = `${safeTitle}_${m.Release_year || ''}.jpg`;
            }
            localUrl = `assets/covers/${localFilename}`;
          } else {
            localUrl = 'assets/watched.svg';
          }
          
          const safePosterUrl = (m.Poster_URL || '').replace(/'/g, "\\'");
          const safeLocalFilename = localFilename.replace(/'/g, "\\'");
          const onerrorAttr = m.Poster_URL && m.Poster_URL !== 'nan' ? `this.onerror=function(){this.src='assets/watched.svg';}; this.src='${safePosterUrl}'; fetch('/api/cover/cache', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: '${safePosterUrl}', filename: '${safeLocalFilename}' }) }).catch(err => console.error(err));` : `this.src='assets/watched.svg';`;
          
          div.innerHTML = `
            <img src="${localUrl}" onerror="${onerrorAttr}">
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600; color: #fff;">${m.Film_title}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${year} • Directed by ${director}</span>
            </div>
          `;
          div.addEventListener('click', () => {
            draftListFilms.push({ ...m });
            addFilmSearchInput.value = '';
            addFilmSuggestions.classList.add('hidden');
            renderDraftFilms();
          });
          addFilmSuggestions.appendChild(div);
        });
      }
      addFilmSuggestions.classList.remove('hidden');
    }
  });

  addFilmSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = addFilmSearchInput.value.trim();
      if (val) {
        draftListFilms.push({
          "Film_title": val,
          "Release_year": "",
          "Director": "Unknown",
          "Poster_URL": "",
          "Average_rating": null
        });
        addFilmSearchInput.value = '';
        if (addFilmSuggestions) addFilmSuggestions.classList.add('hidden');
        renderDraftFilms();
      }
    }
  });
}

// Close suggestions dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (addFilmSearchInput && !addFilmSearchInput.contains(e.target) && addFilmSuggestions && !addFilmSuggestions.contains(e.target)) {
    addFilmSuggestions.classList.add('hidden');
  }
});

const importModal = document.getElementById('import-modal');
const btnCloseImportModal = document.getElementById('btn-close-import-modal');
const tabImportText = document.getElementById('tab-import-text');
const tabImportJson = document.getElementById('tab-import-json');
const panelImportText = document.getElementById('panel-import-text');
const panelImportJson = document.getElementById('panel-import-json');
const importTextInput = document.getElementById('import-text-input');
const btnSubmitImportText = document.getElementById('btn-submit-import-text');
const importJsonDropzone = document.getElementById('import-json-dropzone');
const importJsonFileInput = document.getElementById('import-json-file-input');

function clickImportTab(tab) {
  const isParchment = document.body.classList.contains('parchment-theme');
  if (tab === 'text') {
    tabImportText.style.background = isParchment ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    tabImportText.style.color = isParchment ? 'var(--text-primary)' : '#fff';
    tabImportJson.style.background = 'transparent';
    tabImportJson.style.color = 'var(--text-muted)';
    panelImportText.classList.remove('hidden');
    panelImportJson.classList.add('hidden');
  } else {
    tabImportJson.style.background = isParchment ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    tabImportJson.style.color = isParchment ? 'var(--text-primary)' : '#fff';
    tabImportText.style.background = 'transparent';
    tabImportText.style.color = 'var(--text-muted)';
    panelImportJson.classList.remove('hidden');
    panelImportText.classList.add('hidden');
  }
}

if (tabImportText) {
  tabImportText.addEventListener('click', (e) => {
    e.preventDefault();
    clickImportTab('text');
  });
}
if (tabImportJson) {
  tabImportJson.addEventListener('click', (e) => {
    e.preventDefault();
    clickImportTab('json');
  });
}
if (btnCloseImportModal) {
  btnCloseImportModal.addEventListener('click', (e) => {
    e.preventDefault();
    importModal.classList.add('hidden');
  });
}

if (btnImportTitles) {
  btnImportTitles.addEventListener('click', (e) => {
    e.preventDefault();
    if (importModal) {
      importModal.classList.remove('hidden');
      if (importTextInput) importTextInput.value = '';
      clickImportTab('text');
    }
  });
}

if (btnSubmitImportText) {
  btnSubmitImportText.addEventListener('click', (e) => {
    e.preventDefault();
    const input = importTextInput.value.trim();
    if (input) {
      if (uniqueSearchFilms.length === 0) {
        buildUniqueSearchFilms();
      }

      const lines = input.split('\n');
      let addedCount = 0;
      lines.forEach(line => {
        const title = line.trim();
        if (!title) return;

        const match = uniqueSearchFilms.find(m => 
          m.Film_title && m.Film_title.toLowerCase() === title.toLowerCase()
        );

        if (match) {
          draftListFilms.push({ ...match });
        } else {
          draftListFilms.push({
            "Film_title": title,
            "Release_year": "",
            "Director": "Unknown",
            "Poster_URL": "",
            "Average_rating": null
          });
        }
        addedCount++;
      });
      
      if (addedCount > 0) {
        renderDraftFilms();
        importModal.classList.add('hidden');
        alert(`Successfully imported ${addedCount} films!`);
      }
    }
  });
}

function loadJsonFileForImport(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data) && data.length > 0) {
        const films = data.filter(m => m && m.Film_title && m.Film_title !== "__metadata__");
        draftListFilms = films;

        const metadata = data.find(m => m && m.Film_title === "__metadata__");
        const nameInput = document.getElementById('new-list-name');
        if (nameInput) {
          if (metadata && metadata.Name) {
            nameInput.value = metadata.Name;
          } else {
            nameInput.value = file.name.replace('.json', '').replace(/_/g, ' ');
          }
        }

        const descInput = document.getElementById('new-list-description');
        if (descInput && metadata && metadata.Description) {
          descInput.value = metadata.Description;
        }
        const tagsInput = document.getElementById('new-list-tags');
        if (tagsInput && metadata && metadata.Tags) {
          tagsInput.value = metadata.Tags;
        }
        const rankedInput = document.getElementById('new-list-ranked');
        if (rankedInput && metadata && metadata.Ranked !== undefined) {
          rankedInput.checked = metadata.Ranked;
        }

        renderDraftFilms();
        importModal.classList.add('hidden');
        alert(`Successfully imported ${films.length} films from ${file.name}!`);
      } else {
        alert("The JSON database is empty or not formatted correctly.");
      }
    } catch (err) {
      alert("Error parsing JSON file. Make sure it's a valid JSON export.");
      console.error(err);
    }
  };
  reader.readAsText(file);
}

if (importJsonDropzone) {
  importJsonDropzone.addEventListener('click', () => {
    if (importJsonFileInput) importJsonFileInput.click();
  });
  
  importJsonDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    importJsonDropzone.style.borderColor = 'var(--accent-green)';
  });
  importJsonDropzone.addEventListener('dragleave', () => {
    importJsonDropzone.style.borderColor = 'rgba(255,255,255,0.12)';
  });
  importJsonDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    importJsonDropzone.style.borderColor = 'rgba(255,255,255,0.12)';
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      loadJsonFileForImport(file);
    } else {
      alert("Please upload a valid Letterboxd JSON file.");
    }
  });
}

if (importJsonFileInput) {
  importJsonFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadJsonFileForImport(file);
  });
}

if (btnCreateListSave) {
  btnCreateListSave.addEventListener('click', (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('new-list-name');
    const name = nameInput.value.trim();
    if (!name) {
      alert("Name is a required field. Please enter a list name.");
      nameInput.focus();
      return;
    }

    const description = document.getElementById('new-list-description').value.trim();
    const tags = document.getElementById('new-list-tags').value.trim();
    const isRanked = newListRankedInput ? newListRankedInput.checked : false;
    
    const metadata = {
      "Film_title": "__metadata__",
      "Name": name,
      "Description": description,
      "Tags": tags,
      "Ranked": isRanked
    };

    const finalFilms = [metadata, ...draftListFilms];

    let slug = name.toLowerCase()
                   .trim()
                   .replace(/[^a-z0-9]+/g, '_')
                   .replace(/^_+|_+$/g, '');
    if (!slug) slug = 'custom_list';
    const filename = `${slug}.json`;

    // If we are editing and the filename changed, we'll want to delete the old one after saving the new one
    const oldFilenameToDelete = (editingListFilename && editingListFilename !== filename) ? editingListFilename : null;

    btnCreateListSave.disabled = true;
    btnCreateListSave.textContent = "SAVING...";

    fetch(getApiUrl('/api/save_harvest'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        output_name: filename,
        films: finalFilms
      })
    })
    .then(res => res.json())
    .then(data => {
      btnCreateListSave.disabled = false;
      btnCreateListSave.textContent = "SAVE";

      if (data.success) {
        if (oldFilenameToDelete) {
          fetch(getApiUrl('/api/delete_list'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: oldFilenameToDelete })
          }).catch(err => console.error("Failed to clean up old list file:", err));
        }

        alert(`List "${name}" saved successfully!`);
        
        nameInput.value = '';
        document.getElementById('new-list-description').value = '';
        document.getElementById('new-list-tags').value = '';
        if (newListRankedInput) newListRankedInput.checked = false;
        draftListFilms = [];
        editingListFilename = null;
        
        if (newListSectionObj) newListSectionObj.classList.add('hidden');
        if (localFilesSectionObj) localFilesSectionObj.classList.remove('hidden');
        
        detectLocalServer();
      } else {
        alert("Error saving list: " + (data.error || "Unknown error"));
      }
    })
    .catch(err => {
      btnCreateListSave.disabled = false;
      btnCreateListSave.textContent = "SAVE";
      console.error(err);
      alert("Failed to connect to the backend server to save the list.");
    });
  });
}

/* --------------------------------------------------------------------------
   9. OMDB RATINGS MIGRATION WIDGET
   -------------------------------------------------------------------------- */
let migrationPollingInterval = null;

function populateMigrationDbSelect(files) {
  const dbSelect = document.getElementById('migration-db-select');
  if (!dbSelect) return;
  
  const fileNames = files.map(f => typeof f === 'string' ? f : f.filename);
  
  // Save current selection
  const currentVal = dbSelect.value;
  
  // Clear but keep the placeholder first option
  dbSelect.innerHTML = '<option value="" disabled selected>Select a database to sync...</option>';
  
  // Filter for JSON databases and add them
  fileNames.forEach(file => {
    if (file && file.endsWith('.json')) {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file;
      dbSelect.appendChild(option);
    }
  });
  
  // Restore current selection if it still exists
  if (currentVal && files.includes(currentVal)) {
    dbSelect.value = currentVal;
  }
}

function populateImportWatchedSelect(files) {
  const select = document.getElementById('settings-import-watched-select');
  if (!select) return;
  
  const fileNames = files.map(f => typeof f === 'string' ? f : f.filename);
  const currentVal = select.value;
  
  select.innerHTML = '<option value="" disabled selected>Select a list to import...</option>';
  
  fileNames.forEach(file => {
    if (file && file.endsWith('.json') && file !== 'all_lists_combined.json') {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file;
      select.appendChild(option);
    }
  });
  
  if (currentVal && fileNames.includes(currentVal)) {
    select.value = currentVal;
  }
}

function initMigrationWidget() {
  const dbSelect = document.getElementById('migration-db-select');
  const toggleBtn = document.getElementById('btn-migration-toggle');
  const showBtns = document.querySelectorAll('#btn-show-sync-modal, #btn-show-sync-modal-settings');
  const closeBtn = document.getElementById('btn-sync-modal-close');
  const modal = document.getElementById('sync-modal');
  
  if (showBtns.length > 0 && modal) {
    showBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('hidden');
      });
    });
  }
  
  const syncCurrentDbBtn = document.getElementById('btn-sync-current-db');
  if (syncCurrentDbBtn) {
    syncCurrentDbBtn.addEventListener('click', () => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, filteredMovies.length);
      const currentBatch = filteredMovies.slice(startIndex, endIndex);
      syncMainDashboardFilms(currentBatch);
    });
  }
  
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  }
  
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  }
  
  if (!dbSelect || !toggleBtn) return;
  
  dbSelect.addEventListener('change', () => {
    toggleBtn.disabled = !dbSelect.value;
  });
  
  toggleBtn.addEventListener('click', () => {
    const filename = dbSelect.value;
    if (!filename) return;
    
    // Check current state in toggle button text/attribute
    const isRunning = toggleBtn.getAttribute('data-status') === 'running';
    
    if (isRunning) {
      // Pause
      fetch(getApiUrl('/api/migration/pause'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      .then(res => res.json())
      .then(data => {
        console.log('[Migration] Pause requested:', data);
        pollMigrationStatus();
      })
      .catch(err => {
        console.error('[Migration] Failed to pause:', err);
      });
    } else {
      // Start
      const syncRatings = document.getElementById('sync-opt-ratings').checked;
      const syncAvatars = document.getElementById('sync-opt-avatars').checked;
      const syncCovers = document.getElementById('sync-opt-covers').checked;
      
      if (!syncRatings && !syncAvatars && !syncCovers) {
        alert("Please select at least one sync option (Ratings, Avatars, or Covers)!");
        return;
      }
      
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'STARTING...';
      
      fetch(getApiUrl('/api/migration/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          sync_ratings: syncRatings,
          sync_avatars: syncAvatars,
          sync_covers: syncCovers
        })
      })
      .then(res => res.json())
      .then(data => {
        toggleBtn.disabled = false;
        console.log('[Migration] Start requested:', data);
        pollMigrationStatus();
      })
      .catch(err => {
        toggleBtn.disabled = false;
        toggleBtn.textContent = 'START SYNC';
        console.error('[Migration] Failed to start:', err);
      });
    }
  });
}

function pollMigrationStatus() {
  fetch(getApiUrl('/api/migration/status'))
  .then(res => res.json())
  .then(state => {
    updateMigrationUI(state);
    
    // If state is running, keep polling. Otherwise, clear interval if running
    if (state.status === 'running') {
      if (!migrationPollingInterval) {
        migrationPollingInterval = setInterval(pollMigrationStatus, 1500);
      }
    } else {
      if (migrationPollingInterval) {
        clearInterval(migrationPollingInterval);
        migrationPollingInterval = null;
      }
    }
  })
  .catch(err => {
    console.error('[Migration] Failed to poll status:', err);
  });
}

function updateMigrationUI(state) {
  const dot = document.getElementById('migration-status-dot');
  const toggleBtn = document.getElementById('btn-migration-toggle');
  const progressArea = document.getElementById('migration-progress-area');
  const progressTitle = document.getElementById('migration-progress-title');
  const progressText = document.getElementById('migration-progress-text');
  const progressBarFill = document.getElementById('migration-progress-bar-fill');
  const currentFilmText = document.getElementById('migration-current-film-text');
  const logsBox = document.getElementById('migration-logs-box');
  const dbSelect = document.getElementById('migration-db-select');
  const ratingsOpt = document.getElementById('sync-opt-ratings');
  const avatarsOpt = document.getElementById('sync-opt-avatars');
  const coversOpt = document.getElementById('sync-opt-covers');
  const showBtns = document.querySelectorAll('#btn-show-sync-modal, #btn-show-sync-modal-settings');
  
  if (!state) return;
  
  // Save status to toggle button attribute
  if (toggleBtn) {
    toggleBtn.setAttribute('data-status', state.status);
    
    if (state.status === 'running') {
      toggleBtn.textContent = 'PAUSE SYNC';
      toggleBtn.classList.remove('btn-primary');
      toggleBtn.classList.add('btn-secondary');
      toggleBtn.disabled = false;
      if (dbSelect) dbSelect.disabled = true;
      if (ratingsOpt) ratingsOpt.disabled = true;
      if (avatarsOpt) avatarsOpt.disabled = true;
      if (coversOpt) coversOpt.disabled = true;
      if (showBtns.length > 0) {
        showBtns.forEach(btn => {
          btn.textContent = 'SYNCING VAULT...';
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary'); // Highlight sync button when active
        });
      }
    } else {
      toggleBtn.textContent = state.status === 'paused' ? 'RESUME SYNC' : 'START SYNC';
      toggleBtn.classList.remove('btn-secondary');
      toggleBtn.classList.add('btn-primary');
      if (dbSelect) {
        dbSelect.disabled = false;
        toggleBtn.disabled = !dbSelect.value;
      } else {
        toggleBtn.disabled = false;
      }
      if (ratingsOpt) ratingsOpt.disabled = false;
      if (avatarsOpt) avatarsOpt.disabled = false;
      if (coversOpt) coversOpt.disabled = false;
      if (showBtns.length > 0) {
        showBtns.forEach(btn => {
          btn.textContent = 'SYNC VAULT';
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
        });
      }
    }
  }
  
  // Status Dot
  if (dot) {
    if (state.status === 'running') {
      dot.style.background = 'var(--accent-orange)';
      dot.style.boxShadow = '0 0 8px var(--accent-orange)';
    } else if (state.status === 'paused') {
      dot.style.background = '#eabe00';
      dot.style.boxShadow = '0 0 8px #eabe00';
    } else if (state.status === 'finished') {
      dot.style.background = 'var(--accent-green)';
      dot.style.boxShadow = '0 0 8px var(--accent-green)';
    } else {
      dot.style.background = '#fff';
      dot.style.boxShadow = '0 0 8px #fff';
    }
  }
  
  // Update Select value if state has a filename
  if (dbSelect && state.filename && dbSelect.value !== state.filename) {
    let optionExists = false;
    for (let i = 0; i < dbSelect.options.length; i++) {
      if (dbSelect.options[i].value === state.filename) {
        optionExists = true;
        break;
      }
    }
    if (optionExists) {
      dbSelect.value = state.filename;
      if (toggleBtn && state.status !== 'running') toggleBtn.disabled = false;
    }
  }
  
  // Progress calculations
  if (progressArea) {
    if (state.status !== 'idle') {
      progressArea.classList.remove('hidden');
      
      const current = state.current || 0;
      const total = state.total || 0;
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      
      if (progressTitle) {
        if (state.status === 'running') progressTitle.textContent = 'Syncing...';
        else if (state.status === 'paused') progressTitle.textContent = 'Sync paused';
        else if (state.status === 'finished') progressTitle.textContent = 'Sync complete!';
      }
      
      if (progressText) {
        progressText.textContent = `${current} / ${total} items (${percent}%)`;
      }
      
      if (progressBarFill) {
        progressBarFill.style.width = `${percent}%`;
      }
      
      if (currentFilmText) {
        currentFilmText.textContent = state.status === 'running' ? `Current: ${state.current_film || '-'}` : '';
      }
    } else {
      progressArea.classList.add('hidden');
    }
  }
  
  // Update logs
  if (logsBox && state.logs) {
    const logsText = state.logs.join('\n');
    if (logsBox.value !== logsText) {
      logsBox.value = logsText;
      logsBox.scrollTop = logsBox.scrollHeight;
    }
  }
}

/* ==========================================================================
   10. ENTERTAINMENT NEWS AGGREGATOR
   ========================================================================== */
let allNewsArticles = [];
let globalNewsChannels = [];
let selectedChannelId = null;
let newsReactionsMap = {};
let newsUnreadsMap = {};

function hashCode(str) {
  let hash = 0;
  if (!str) return hash;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function getAvatarClass(source) {
  const hash = Math.abs(hashCode(source));
  return `tg-bg-${hash % 9}`;
}

function getChannelAvatarHtml(source, size = 44, id = '') {
  const s = source.toLowerCase();
  const initial = source.charAt(0);
  const avatarClass = getAvatarClass(source);
  const idAttr = id ? `id="${id}"` : '';
  const style = `width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; user-select: none; box-shadow: 0 2px 5px rgba(0,0,0,0.25); overflow: hidden; background: #fff; border: 1.5px solid rgba(0,0,0,0.1); margin-right: 12px;`;
  
  if (s.includes('critic match scores')) {
    return `
      <div ${idAttr} style="${style} background: #1c252d; border-color: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; gap: 2px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/Rotten-tomatoes-logo tomato.svg" style="width: 42%; height: 42%; object-fit: contain; margin-right: 0;" alt="RT" />
        <img src="assets/Metacritic_logo.svg" style="width: 42%; height: 42%; object-fit: contain; margin-right: 0;" alt="MC" />
      </div>
    `;
  } else if (s.includes('local curation')) {
    return `
      <div ${idAttr} style="${style} background: #243447; border-color: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center;" class="telegram-avatar telegram-avatar-container">
        <span style="font-size: ${size * 0.45}px;">✨</span>
      </div>
    `;
  } else if (s.includes('app logs') || s.includes('system logs')) {
    return `
      <div ${idAttr} style="${style} background: #202b36; border-color: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/database.svg" style="width: 50%; height: 50%; object-fit: contain; filter: invert(1); margin-right: 0;" alt="Database" />
      </div>
    `;
  }

  // Check if there is a custom avatar mapped to this source
  const customAvatarPath = window.customNewsSourcesMap && window.customNewsSourcesMap[s];
  if (customAvatarPath) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.08}px;" class="telegram-avatar telegram-avatar-container">
        <img src="${customAvatarPath}" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="${source}" onerror="this.parentNode.innerHTML='<span style=&quot;font-weight: 800; font-size: ${size * 0.5}px;&quot;>${initial}</span>'; this.parentNode.className='telegram-avatar ${avatarClass}';" />
      </div>
    `;
  }
  
  if (s.includes('variety')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.15}px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/variety-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="Variety" />
      </div>
    `;
  } else if (s.includes('hollywood reporter') || s.includes('thr')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.15}px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/thr-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="THR" />
      </div>
    `;
  } else if (s.includes('vulture')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.12}px; background: #000; border-color: rgba(255,255,255,0.1);" class="telegram-avatar telegram-avatar-container">
        <img src="assets/vulture-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block; filter: invert(1);" alt="Vulture" />
      </div>
    `;
  } else if (s.includes('entertainment weekly') || s.includes('ew.com')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.12}px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/ew-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="EW" />
      </div>
    `;
  } else if (s.includes('screen daily')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.08}px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/screendaily-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="Screen Daily" />
      </div>
    `;
  } else if (s.includes('rotten tomatoes')) {
    return `
      <div ${idAttr} style="${style} padding: ${size * 0.12}px;" class="telegram-avatar telegram-avatar-container">
        <img src="assets/Rotten-tomatoes-logo.svg" style="width: 100%; height: 100%; object-fit: contain; display: block;" alt="Rotten Tomatoes" />
      </div>
    `;
  } else if (s.includes('saved messages')) {
    // Saved Messages: Telegram Blue background with bookmark ribbon
    return `
      <div ${idAttr} style="${style} background: #2481cc; border: none;" class="telegram-avatar telegram-avatar-container">
        <svg viewBox="0 0 24 24" width="${size * 0.45}" height="${size * 0.45}" fill="currentColor" stroke="none" style="color: #fff; display: block;">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
    `;
  }
  
  // Default dynamic colored avatar fallback
  return `<div class="telegram-avatar ${avatarClass}" ${idAttr} style="${style}">${initial}</div>`;
}

function getCleanChannelInfo(art) {
  let site = art.source || 'General';
  const src = (art.source || '').toLowerCase();
  
  if (src.includes('variety')) {
    site = 'Variety';
  } else if (src.includes('hollywood reporter') || src.includes('thr')) {
    site = 'The Hollywood Reporter';
  } else if (src.includes('vulture')) {
    site = 'Vulture';
  } else if (src.includes('entertainment weekly') || src.includes('ew.com')) {
    site = 'Entertainment Weekly';
  } else if (src.includes('screen daily')) {
    site = 'Screen Daily';
  } else if (src.includes('rotten tomatoes')) {
    site = 'Rotten Tomatoes';
  }
  
  let cat = art.topic || art.category || 'General';
  
  return {
    channelId: site,
    sourceName: site,
    categoryName: cat
  };
}

function formatTelegramDate(dateStr) {
  if (!dateStr) return '';
  let cleanStr = dateStr;
  if (cleanStr.includes(' +0000')) cleanStr = cleanStr.replace(' +0000', '');
  if (cleanStr.includes(' GMT')) cleanStr = cleanStr.replace(' GMT', '');
  
  try {
    const d = new Date(cleanStr);
    if (isNaN(d.getTime())) return dateStr;
    
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (isYesterday) {
      return 'Yesterday';
    } else {
      const diffTime = Math.abs(now - d);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        return d.toLocaleDateString([], { weekday: 'short' });
      } else {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    }
  } catch (e) {
    return dateStr;
  }
}

// Global window reactions click handler
window.toggleNewsReaction = function(url, idx, element) {
  const reactions = newsReactionsMap[url];
  if (!reactions) return;
  
  const reaction = reactions[idx];
  if (reaction.active) {
    reaction.count--;
    reaction.active = false;
    element.classList.remove('active');
  } else {
    reaction.count++;
    reaction.active = true;
    element.classList.add('active');
  }
  element.querySelector('.telegram-reaction-count').textContent = reaction.count;
};

// Global window forward to Saved Messages handler
window.forwardToSavedMessages = function(articleJsonStr) {
  try {
    const art = JSON.parse(decodeURIComponent(articleJsonStr));
    let savedArticles = JSON.parse(localStorage.getItem('offlineboxd-saved-news') || '[]');
    
    // Check if already saved
    if (savedArticles.some(saved => saved.url === art.url)) {
      showToast(`Article is already in Saved Messages!`, 'info');
      return;
    }
    
    // Add to top of list
    savedArticles.unshift(art);
    localStorage.setItem('offlineboxd-saved-news', JSON.stringify(savedArticles));
    
    showToast(`Forwarded to Saved Messages!`, 'success');
    
    // Re-filter news to update sidebar counts & latest message
    filterNews();
  } catch (e) {
    console.error('Error forwarding news:', e);
  }
};

// Global window remove from Saved Messages handler
window.removeFromSavedMessages = function(url) {
  let savedArticles = JSON.parse(localStorage.getItem('offlineboxd-saved-news') || '[]');
  savedArticles = savedArticles.filter(art => art.url !== url);
  localStorage.setItem('offlineboxd-saved-news', JSON.stringify(savedArticles));
  
  showToast(`Removed from Saved Messages!`, 'info');
  
  // Re-filter news to update sidebar counts & latest message
  filterNews();
};

// Global window copy link fallback
window.shareNewsLink = function(url) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => showToast(`Link copied to clipboard!`))
      .catch(() => fallbackCopy(url));
  } else {
    fallbackCopy(url);
  }
};

function fallbackCopy(url) {
  const el = document.createElement('textarea');
  el.value = url;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
  showToast(`Link copied to clipboard!`);
}

function showNewsTab() {
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.add('hidden');
  if (settingsView) settingsView.classList.add('hidden');
  if (newsView) newsView.classList.remove('hidden');
  
  document.querySelectorAll('.header-center-nav .nav-link').forEach(link => {
    link.classList.remove('active');
  });
  if (navTabNews) navTabNews.classList.add('active');
  
  if (allNewsArticles.length === 0) {
    loadNewsContent(false);
  }
}

function loadNewsContent(forceRefresh = false) {
  const loadingEl = document.getElementById('news-loading');
  const emptyEl = document.getElementById('news-empty');
  const errorEl = document.getElementById('news-error');
  const gridEl = document.getElementById('news-articles-grid');
  
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (gridEl) {
    // Keep loading, empty, and error elements, just clear other articles
    const articles = gridEl.querySelectorAll('.telegram-message-wrapper');
    articles.forEach(el => el.remove());
  }
  
  const url = forceRefresh ? '/api/news?refresh=true' : '/api/news';
  
  fetch(getApiUrl(url))
    .then(res => {
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      if (loadingEl) loadingEl.classList.add('hidden');
      
      if (data.error) {
        showNewsError(data.error);
        return;
      }
      
      // Populate custom sources mapping
      window.customNewsSourcesMap = {};
      window.customNewsSourcesList = data.custom_sources || [];
      if (data.custom_sources) {
        data.custom_sources.forEach(src => {
          if (src.name && src.avatar_path) {
            window.customNewsSourcesMap[src.name.toLowerCase()] = src.avatar_path;
          }
        });
      }
      
      allNewsArticles = data.articles || [];
      filterNews(); // Grouping, sorting, and initial rendering
    })
    .catch(err => {
      if (loadingEl) loadingEl.classList.add('hidden');
      showNewsError(err.message || err);
    });
}

function showNewsError(msg) {
  const errorEl = document.getElementById('news-error');
  const errorMsgEl = document.getElementById('news-error-message');
  if (errorEl) errorEl.classList.remove('hidden');
  if (errorMsgEl) errorMsgEl.textContent = `Error details: ${msg}`;
}

function renderChannelsList(channels) {
  const listEl = document.getElementById('telegram-channels-list');
  if (!listEl) return;
  
  listEl.innerHTML = '';
  
  channels.forEach(ch => {
    const isSelected = ch.id === selectedChannelId;
    const avatarHtml = getChannelAvatarHtml(ch.source, 44);
    
    let timeText = '';
    let previewText = 'No messages';
    
    if (ch.latestArticle) {
      timeText = formatTelegramDate(ch.latestArticle.published);
      previewText = ch.latestArticle.title;
    }
    
    const channelName = ch.id === 'SavedMessages' ? ch.source : `${ch.source} ${ch.category}`;
    
    const unreads = newsUnreadsMap[ch.id] || 0;
    const badgeHtml = unreads > 0 ? `<span class="telegram-unread-badge">${unreads}</span>` : '';
    
    const itemHtml = `
      <div class="telegram-channel-item ${isSelected ? 'active' : ''}" data-id="${ch.id}">
        ${avatarHtml}
        <div class="telegram-channel-info">
          <div class="telegram-channel-meta">
            <span class="telegram-channel-name" style="${ch.id === 'SavedMessages' ? 'color: var(--accent-blue);' : ''}">${channelName}</span>
            <span class="telegram-channel-time">${timeText}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span class="telegram-channel-preview" style="flex-grow: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 6px;">${previewText}</span>
            ${badgeHtml}
          </div>
        </div>
      </div>
    `;
    
    listEl.insertAdjacentHTML('beforeend', itemHtml);
  });
  
  // Add click listeners
  listEl.querySelectorAll('.telegram-channel-item').forEach(el => {
    el.addEventListener('click', () => {
      const channelId = el.getAttribute('data-id');
      selectNewsChannel(channelId);
    });
  });
}

function selectNewsChannel(channelId) {
  selectedChannelId = channelId;
  
  // Mark channel as read
  newsUnreadsMap[channelId] = 0;
  
  const ch = globalNewsChannels.find(c => c.id === channelId);
  if (!ch) return;
  
  // Re-render sidebar to clear unreads count badge
  renderChannelsList(globalNewsChannels);
  
  // Update Header info
  const headerAvatar = document.getElementById('telegram-header-avatar');
  const headerTitle = document.getElementById('telegram-header-title');
  const headerSubtitle = document.getElementById('telegram-header-subtitle');
  
  if (headerTitle) {
    if (ch.id === 'SavedMessages') {
      headerTitle.textContent = 'Saved Messages';
    } else if (ch.id === 'CriticMatch') {
      headerTitle.textContent = 'Critic Match Scores';
    } else if (ch.id === 'LocalCuration') {
      headerTitle.textContent = 'Local Curation';
    } else if (ch.id === 'SystemLogs') {
      headerTitle.textContent = 'App Logs';
    } else {
      headerTitle.textContent = ch.source;
    }
  }
  
  if (headerSubtitle) {
    if (ch.id === 'SavedMessages') {
      const postCount = ch.articles.length;
      headerSubtitle.textContent = `${postCount} saved message${postCount === 1 ? '' : 's'} • Personal Archive`;
    } else if (ch.id === 'CriticMatch') {
      headerSubtitle.textContent = `Critic Match Score Comparison Matrix`;
    } else if (ch.id === 'LocalCuration') {
      headerSubtitle.textContent = `Offline Spotlight & Local Discovery Curation`;
    } else if (ch.id === 'SystemLogs') {
      headerSubtitle.textContent = `Curation growth analytics and harvester timelines`;
    } else {
      const postCount = ch.articles.length;
      let domain = ch.source.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com';
      if (ch.source === 'The Hollywood Reporter') domain = 'hollywoodreporter.com';
      else if (ch.source === 'Screen Daily') domain = 'screendaily.com';
      else if (ch.source === 'Rotten Tomatoes') domain = 'rottentomatoes.com';
      
      headerSubtitle.textContent = `${postCount} article${postCount === 1 ? '' : 's'} • ${domain}`;
    }
  }
  
  if (headerAvatar) {
    headerAvatar.outerHTML = getChannelAvatarHtml(ch.source, 40, 'telegram-header-avatar');
  }
  
  // Update Pinned Message
  const pinnedBanner = document.getElementById('telegram-pinned-banner');
  const pinnedContent = document.getElementById('telegram-pinned-content');
  if (pinnedBanner && pinnedContent) {
    if (ch.id === 'SavedMessages') {
      pinnedContent.innerHTML = `<strong>Pinned Message:</strong> Click here to scroll to the top of your archived news.`;
    } else if (ch.id === 'CriticMatch') {
      pinnedContent.innerHTML = `<strong>Pinned Message:</strong> Side-by-side Metacritic vs Rotten Tomatoes scorecard analysis.`;
    } else if (ch.id === 'LocalCuration') {
      pinnedContent.innerHTML = `<strong>Pinned Message:</strong> Spotlight film of the day selected from your curation lists.`;
    } else if (ch.id === 'SystemLogs') {
      pinnedContent.innerHTML = `<strong>Pinned Message:</strong> Analytics distribution charts and harvester system timeline activity logs.`;
    } else if (ch.latestArticle) {
      pinnedContent.innerHTML = `<strong>Pinned Message:</strong> ${ch.latestArticle.title}`;
    }
    
    pinnedBanner.onclick = () => {
      const gridEl = document.getElementById('news-articles-grid');
      if (gridEl) {
        gridEl.scrollTop = 0;
      }
    };
  }
  
  // Render based on channel type
  if (ch.id === 'CriticMatch') {
    loadAndRenderCriticMatch();
  } else if (ch.id === 'LocalCuration') {
    loadAndRenderLocalCuration();
  } else if (ch.id === 'SystemLogs') {
    loadAndRenderSystemLogs();
  } else {
    renderNewsArticles(ch.articles);
  }
}

function renderNewsArticles(articles) {
  const gridEl = document.getElementById('news-articles-grid');
  const emptyEl = document.getElementById('news-empty');
  if (!gridEl) return;
  
  // Remove existing articles but keep loading/empty/error containers
  const existingArticles = gridEl.querySelectorAll('.telegram-message-wrapper');
  existingArticles.forEach(el => el.remove());
  
  if (articles.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }
  
  if (emptyEl) emptyEl.classList.add('hidden');
  
  const isSavedFeed = (selectedChannelId === 'SavedMessages');
  
  articles.forEach(art => {
    let timeText = '';
    if (art.published) {
      try {
        const d = new Date(art.published);
        if (!isNaN(d.getTime())) {
          timeText = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } catch(e) {}
    }
    
    // Deterministic views based on title
    const hash = Math.abs(hashCode(art.title));
    const viewsCount = (hash % 8500) + 1200;
    
    // Clean domain name for link button
    let domainLabel = art.source.toLowerCase().replace(/ /g, '') + '.com';
    if (art.source === 'The Hollywood Reporter') domainLabel = 'hollywoodreporter.com';
    else if (art.source === 'Screen Daily') domainLabel = 'screendaily.com';
    else if (art.source === 'Rotten Tomatoes') domainLabel = 'rottentomatoes.com';
    
    // Generate reactions map if not exists
    if (!newsReactionsMap[art.url]) {
      newsReactionsMap[art.url] = [
        { emoji: '👍', count: hash % 47 + 6, active: false },
        { emoji: '❤️', count: hash % 23 + 2, active: false },
        { emoji: '🔥', count: hash % 18 + 1, active: false },
        { emoji: '🤩', count: hash % 8, active: false }
      ];
    }
    
    const reactions = newsReactionsMap[art.url];
    let reactionsHtml = `<div class="telegram-reactions-container">`;
    reactions.forEach((reaction, idx) => {
      if (reaction.count > 0 || reaction.active) {
        reactionsHtml += `
          <span class="telegram-reaction-pill ${reaction.active ? 'active' : ''}" onclick="toggleNewsReaction('${art.url}', ${idx}, this)">
            <span class="telegram-reaction-emoji">${reaction.emoji}</span>
            <span class="telegram-reaction-count">${reaction.count}</span>
          </span>
        `;
      }
    });
    reactionsHtml += `</div>`;
    
    const avatarHtml = getChannelAvatarHtml(art.source, 32);
    
    const forwardedHeader = isSavedFeed ? `
      <div style="font-size: 11px; color: #5288c1; margin-bottom: 6px; font-style: italic; font-weight: 600;">
        Forwarded from ${art.source}
      </div>
    ` : '';
    
    const actionBtnHtml = isSavedFeed ? `
      <button class="telegram-share-btn" title="Remove from Saved Messages" onclick="removeFromSavedMessages('${art.url.replace(/'/g, "\\'")}')" style="color: #e0565b;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    ` : `
      <button class="telegram-share-btn" title="Forward to Saved Messages" onclick="forwardToSavedMessages('${encodeURIComponent(JSON.stringify(art))}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    `;
    
    const messageHtml = `
      <div class="telegram-message-wrapper">
        ${avatarHtml}
        <div class="telegram-message-container">
          <div class="telegram-message-bubble">
            ${art.thumbnail ? `
              <div class="telegram-bubble-image-wrapper">
                <img src="${art.thumbnail}" class="telegram-bubble-image" alt="" loading="lazy" onerror="this.parentNode.style.display='none';" />
              </div>
            ` : ''}
            <div class="telegram-bubble-body">
              ${forwardedHeader}
              <h4 class="telegram-bubble-title">${art.title}</h4>
              ${art.description ? `<p class="telegram-bubble-description">${art.description}</p>` : ''}
              <div class="topic-hashtag-container">
                <span class="topic-hashtag">#${art.topic || art.category || 'General'}</span>
              </div>
              <div style="display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap;">
                <a href="${art.url}" target="_blank" rel="noopener" class="telegram-bubble-link" style="margin-top: 0; padding: 4px 10px; background: rgba(36, 129, 204, 0.1); border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(36, 129, 204, 0.2); font-weight: 600; text-decoration: none;">
                  Open Site ↗
                </a>
                <span class="telegram-bubble-link offline-read-btn" style="margin-top: 0; padding: 4px 10px; background: rgba(60, 192, 92, 0.1); border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(60, 192, 92, 0.2); color: #3cc05c; cursor: pointer; font-weight: 700; text-decoration: none;" onclick="openOfflineReader('${art.url.replace(/'/g, "\\'")}', '${art.title.replace(/'/g, "\\'")}')">
                  Read Offline 📖
                </span>
              </div>
              <div class="telegram-bubble-meta">
                <span class="telegram-views">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="vertical-align: middle;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  ${viewsCount.toLocaleString()}
                </span>
                <span>${timeText}</span>
              </div>
            </div>
            ${reactionsHtml}
          </div>
          ${actionBtnHtml}
        </div>
      </div>
    `;
    
    gridEl.insertAdjacentHTML('beforeend', messageHtml);
  });
}

function filterNews() {
  const searchInput = document.getElementById('news-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  
  // Group all articles by clean site + category channels
  const channelMap = {};
  allNewsArticles.forEach(art => {
    const info = getCleanChannelInfo(art);
    const channelId = info.channelId;
    const source = info.sourceName;
    const category = info.categoryName;
    
    let matches = true;
    if (query) {
      const titleMatch = (art.title || '').toLowerCase().includes(query);
      const descMatch = (art.description || '').toLowerCase().includes(query);
      const categoryMatch = (category || '').toLowerCase().includes(query);
      const sourceMatch = (source || '').toLowerCase().includes(query);
      matches = titleMatch || descMatch || categoryMatch || sourceMatch;
    }
    
    if (matches) {
      if (!channelMap[channelId]) {
        channelMap[channelId] = {
          id: channelId,
          source: source,
          category: category,
          articles: []
        };
      }
      channelMap[channelId].articles.push(art);
    }
  });
  
  const filteredChannels = Object.values(channelMap);
  
  // Sort articles and assign latest article + unreads
  filteredChannels.forEach(ch => {
    ch.articles.sort((a, b) => {
      const dA = a.published ? new Date(a.published) : 0;
      const dB = b.published ? new Date(b.published) : 0;
      return dB - dA;
    });
    ch.latestArticle = ch.articles[0];
    
    // Assign a random unread notification count between 1 and 4 if first time
    if (newsUnreadsMap[ch.id] === undefined) {
      const hash = Math.abs(hashCode(ch.id));
      newsUnreadsMap[ch.id] = (hash % 10 < 7) ? (hash % 4 + 1) : 0;
    }
  });
  
  // Sort channels by latest article published date
  filteredChannels.sort((a, b) => {
    const dA = a.latestArticle && a.latestArticle.published ? new Date(a.latestArticle.published) : 0;
    const dB = b.latestArticle && b.latestArticle.published ? new Date(b.latestArticle.published) : 0;
    return dB - dA;
  });
  
  // Retrieve saved messages from localStorage
  const savedArticles = JSON.parse(localStorage.getItem('offlineboxd-saved-news') || '[]');
  
  // Inject Saved Messages channel at the top of the sidebar list
  const savedChannel = {
    id: 'SavedMessages',
    source: 'Saved Messages',
    category: 'Archive',
    articles: savedArticles,
    latestArticle: savedArticles[0] || null
  };
  
  const criticMatchChannel = {
    id: 'CriticMatch',
    source: 'Critic Match Scores',
    category: 'Feed',
    articles: [],
    latestArticle: { title: "Rotten Tomatoes vs Metacritic comparisons", published: new Date().toISOString() }
  };
  const localCurationChannel = {
    id: 'LocalCuration',
    source: 'Local Curation',
    category: 'Spotlight',
    articles: [],
    latestArticle: { title: "Spotlight of the Day & Cinema Anniversaries", published: new Date().toISOString() }
  };
  const systemLogsChannel = {
    id: 'SystemLogs',
    source: 'App Logs',
    category: 'Timeline',
    articles: [],
    latestArticle: { title: "Scraper logs, harvester timeline & stats", published: new Date().toISOString() }
  };
  
  newsUnreadsMap['SavedMessages'] = 0; // Always 0 unreads for Saved Messages
  newsUnreadsMap['CriticMatch'] = 0;
  newsUnreadsMap['LocalCuration'] = 0;
  newsUnreadsMap['SystemLogs'] = 0;
  
  filteredChannels.unshift(systemLogsChannel);
  filteredChannels.unshift(localCurationChannel);
  filteredChannels.unshift(criticMatchChannel);
  filteredChannels.unshift(savedChannel);
  
  globalNewsChannels = filteredChannels;
  
  renderChannelsList(filteredChannels);
  
  if (filteredChannels.length > 0) {
    const exists = filteredChannels.find(ch => ch.id === selectedChannelId);
    if (exists) {
      selectNewsChannel(selectedChannelId);
    } else {
      selectNewsChannel(filteredChannels[0].id);
    }
  } else {
    // Empty state
    const gridEl = document.getElementById('news-articles-grid');
    const emptyEl = document.getElementById('news-empty');
    if (gridEl) {
      const existingArticles = gridEl.querySelectorAll('.telegram-message-wrapper');
      existingArticles.forEach(el => el.remove());
    }
    if (emptyEl) emptyEl.classList.remove('hidden');
    
    // Reset header
    const headerTitle = document.getElementById('telegram-header-title');
    const headerSubtitle = document.getElementById('telegram-header-subtitle');
    if (headerTitle) headerTitle.textContent = 'No channels';
    if (headerSubtitle) headerSubtitle.textContent = '0 channels match current search';
  }
}

function initNewsEvents() {
  const searchInput = document.getElementById('news-search-input');
  const refreshBtn = document.getElementById('btn-refresh-news');
  const retryBtn = document.getElementById('btn-news-retry');
  
  if (searchInput) {
    searchInput.addEventListener('input', filterNews);
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadNewsContent(true));
  }
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadNewsContent(true));
  }
  
  initCustomNewsSources();
}

// Render custom sources list inside the modal
function renderCustomSourcesInModal() {
  const container = document.getElementById('custom-feeds-list-container');
  if (!container) return;
  
  const sources = window.customNewsSourcesList || [];
  if (sources.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 16px;">
        No custom news sources added yet.
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  sources.forEach(src => {
    const avatarHtml = getChannelAvatarHtml(src.name, 32);
    const item = document.createElement('div');
    item.style = 'display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        ${avatarHtml}
        <div style="display: flex; flex-direction: column; min-width: 0; text-align: left;">
          <span style="font-size: 13px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${src.name}</span>
          <span style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;">${src.url}</span>
        </div>
      </div>
      <button onclick="deleteCustomNewsSource('${src.name}')" style="background: transparent; border: none; color: #e0565b; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(224,86,91,0.1)';" onmouseout="this.style.background='transparent';">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;
    container.appendChild(item);
  });
}

// Delete a custom news source
window.deleteCustomNewsSource = function(name) {
  if (!confirm(`Are you sure you want to delete the custom news feed "${name}"?`)) return;
  
  fetch('/api/news/sources/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      showToast(data.error, 'error');
    } else {
      showToast('Custom news feed deleted!', 'success');
      loadNewsContent(true); // reload feed
      setTimeout(() => {
        renderCustomSourcesInModal();
      }, 500);
    }
  })
  .catch(err => {
    showToast(err.message || err, 'error');
  });
};

// Global variables for file reading
let selectedAvatarBase64 = '';

// Initialize custom news sources handlers
window.openNewsSourcesModal = function() {
  console.log('[News Sources Settings] openNewsSourcesModal called');
  const modal = document.getElementById('news-sources-modal');
  if (modal) {
    console.log('[News Sources Settings] Removing hidden class from news-sources-modal');
    modal.classList.remove('hidden');
    renderCustomSourcesInModal();
  } else {
    console.error('[News Sources Settings] news-sources-modal element not found!');
  }
};

window.closeNewsSourcesModal = function() {
  const modal = document.getElementById('news-sources-modal');
  if (modal) {
    modal.classList.add('hidden');
    // Reset inputs
    const feedName = document.getElementById('add-feed-name');
    const feedUrl = document.getElementById('add-feed-url');
    const feedCat = document.getElementById('add-feed-category');
    const btnSelectAvatar = document.getElementById('btn-select-avatar');
    if (feedName) feedName.value = '';
    if (feedUrl) feedUrl.value = '';
    if (feedCat) feedCat.value = 'General';
    if (btnSelectAvatar) btnSelectAvatar.textContent = 'Choose File...';
    selectedAvatarBase64 = '';
  }
};

function initCustomNewsSources() {
  const btnManage = document.getElementById('btn-manage-news-sources');
  const modal = document.getElementById('news-sources-modal');
  const btnClose = document.getElementById('btn-close-news-sources-modal');
  
  const avatarInput = document.getElementById('add-feed-avatar');
  const btnSelectAvatar = document.getElementById('btn-select-avatar');
  const btnSubmit = document.getElementById('btn-submit-new-feed');
  
  if (btnManage) {
    console.log('[News Sources Settings] Attaching click listener to btn-manage-news-sources');
    btnManage.addEventListener('click', (e) => {
      console.log('[News Sources Settings] Click event fired on btn-manage-news-sources');
      window.openNewsSourcesModal();
    });
  } else {
    console.error('[News Sources Settings] btn-manage-news-sources element not found in DOM!');
  }
  
  if (btnClose) {
    console.log('[News Sources Settings] Attaching click listener to btn-close-news-sources-modal');
    btnClose.addEventListener('click', () => {
      console.log('[News Sources Settings] Click event fired on btn-close-news-sources-modal');
      window.closeNewsSourcesModal();
    });
  }
  
  if (avatarInput && btnSelectAvatar) {
    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      btnSelectAvatar.textContent = file.name;
      
      const reader = new FileReader();
      reader.onload = function(evt) {
        selectedAvatarBase64 = evt.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('add-feed-name').value.trim();
      const url = document.getElementById('add-feed-url').value.trim();
      const category = document.getElementById('add-feed-category').value;
      
      if (!name || !url) {
        showToast('Please fill in both Feed Name and URL!', 'error');
        return;
      }
      
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'ADDING SOURCE...';
      
      fetch('/api/news/sources/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          url: url,
          category: category,
          avatar_base64: selectedAvatarBase64
        })
      })
      .then(res => res.json())
      .then(data => {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'ADD NEWS SOURCE';
        
        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast('Custom news feed added successfully!', 'success');
          // Reset form
          document.getElementById('add-feed-name').value = '';
          document.getElementById('add-feed-url').value = '';
          document.getElementById('add-feed-category').value = 'General';
          btnSelectAvatar.textContent = 'Choose File...';
          selectedAvatarBase64 = '';
          
          loadNewsContent(true); // reload feed
          setTimeout(() => {
            renderCustomSourcesInModal();
          }, 500);
        }
      })
      .catch(err => {
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'ADD NEWS SOURCE';
        showToast(err.message || err, 'error');
      });
    });
  }
}

window.openMovieDetailsFromNews = function(encoded) {
  try {
    const movieData = JSON.parse(decodeURIComponent(encoded));
    // Try to find it in allMovies to have the exact reference with watches/likes/etc.
    let matched = allMovies.find(m => m.Film_title.toLowerCase() === movieData.Film_title.toLowerCase() && m.Release_year == movieData.Release_year);
    if (!matched) matched = movieData;
    openMovieDetails(matched);
  } catch (e) {
    console.error("Failed to open movie details from news:", e);
  }
};

function loadAndRenderCriticMatch() {
  const gridEl = document.getElementById('news-articles-grid');
  if (!gridEl) return;
  
  // Show loading inside grid
  gridEl.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 20px; gap: 15px; margin: auto;">
      <div class="shimmer-placeholder" style="width: 50px; height: 50px; border-radius: 50%;"></div>
      <span style="font-size: 14px; color: var(--text-muted); font-weight: 500;">Parsing critic text reviews...</span>
    </div>
  `;
  
  fetch('/api/news/local_insights')
    .then(res => res.json())
    .then(data => {
      if (selectedChannelId !== 'CriticMatch') return; // User switched channel
      
      const films = data.critic_films || [];
      if (films.length === 0) {
        gridEl.innerHTML = `
          <div style="text-align: center; padding: 80px 20px; margin: auto;">
            <span style="font-size: 40px; display: block; margin-bottom: 15px;">🍅</span>
            <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 8px;">No critic comparisons available</h3>
            <p style="font-size: 13px; color: var(--text-muted); margin: 0;">Sync your database with OMDb first to pull ratings!</p>
          </div>
        `;
        return;
      }
      
      let html = `<div class="enriched-container">`;
      html += `<h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 4px 0;">Breaking Critic Reviews</h2>`;
      html += `<p style="font-size: 13px; color: var(--text-muted); margin: 0 0 20px 0;">Side-by-side Metacritic & Rotten Tomatoes review matrix of films in your box.</p>`;
      html += `<div class="critic-match-grid">`;
      
      films.forEach(f => {
        const rtVal = f.Rotten_Tomatoes || "N/A";
        const mcVal = f.Metascore || "N/A";
        
        // Calculate agreement
        let agreementText = "Consensus Match";
        let agreementClass = "consensus-match";
        
        if (rtVal !== "N/A" && mcVal !== "N/A") {
          const rtNum = parseInt(rtVal.replace('%', ''));
          const mcNum = parseInt(mcVal.split('/')[0]);
          const diff = Math.abs(rtNum - mcNum);
          
          if (diff <= 6) {
            agreementText = "🤝 Consensus Match";
            agreementClass = "consensus-match";
          } else if (rtNum > mcNum) {
            agreementText = "🍅 RT Favors";
            agreementClass = "rt-favors";
          } else {
            agreementText = "🟢 Metascore Favors";
            agreementClass = "mc-favors";
          }
        } else {
          agreementText = "❓ Incomplete Ratings";
          agreementClass = "rt-favors";
        }
        
        const genresList = (f.Genres || []).slice(0, 2).join(', ');
        
        html += `
          <div class="critic-match-card">
            <div class="critic-poster-row">
              <img class="critic-poster" src="${f.Poster_URL || 'assets/frame.svg'}" onerror="this.src='assets/frame.svg'" />
              <div class="critic-meta">
                <div>
                  <h4 class="critic-title" title="${f.Film_title}">${f.Film_title}</h4>
                  <span class="critic-director">${f.Release_year} • Dir: ${f.Director}</span>
                  <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">${genresList}</div>
                </div>
                <span class="agreement-pill ${agreementClass}">${agreementText}</span>
              </div>
            </div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.05); margin: 4px 0;"></div>
            
            <div class="critic-score-row">
              <div class="critic-badge" title="Rotten Tomatoes Score">
                <img src="assets/Rotten-tomatoes-logo tomato.svg" alt="RT" />
                <span>${rtVal}</span>
              </div>
              <div class="critic-badge" title="Metacritic Score">
                <img src="assets/Metacritic_logo.svg" alt="MC" />
                <span>${mcVal}</span>
              </div>
            </div>
            
            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${f.Description || 'No description available.'}">
              ${f.Description || 'No description available.'}
            </p>
            
            <button class="btn btn-secondary" style="font-size: 11px; padding: 6px; width: 100%; font-weight: 700; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #fff;" onclick="openMovieDetailsFromNews('${encodeURIComponent(JSON.stringify(f))}')">
              View details inside box ↗
            </button>
          </div>
        `;
      });
      
      html += `</div></div>`;
      gridEl.innerHTML = html;
    })
    .catch(err => {
      gridEl.innerHTML = `<div style="text-align: center; padding: 50px;">Failed to load critic reviews: ${err.message || err}</div>`;
    });
}

function loadAndRenderLocalCuration() {
  const gridEl = document.getElementById('news-articles-grid');
  if (!gridEl) return;
  
  // Show loading inside grid
  gridEl.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 20px; gap: 15px; margin: auto;">
      <div class="shimmer-placeholder" style="width: 50px; height: 50px; border-radius: 50%;"></div>
      <span style="font-size: 14px; color: var(--text-muted); font-weight: 500;">Digging up cinema treasures...</span>
    </div>
  `;
  
  fetch('/api/news/local_insights')
    .then(res => res.json())
    .then(data => {
      if (selectedChannelId !== 'LocalCuration') return; // User switched channel
      
      let html = `<div class="enriched-container">`;
      
      // 1. Spotlight Section
      const sf = data.spotlight_film;
      if (sf) {
        const themeLabel = data.spotlight_theme || "Mini-Theme Deep Dive";
        html += `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">Spotlight of the Day</h2>
            <div class="spotlight-card">
              <img class="spotlight-poster" src="${sf.Poster_URL || 'assets/frame.svg'}" onerror="this.src='assets/frame.svg'" />
              <div class="spotlight-info">
                <div>
                  <span class="spotlight-tag">${themeLabel}</span>
                  <h3 class="spotlight-title">${sf.Film_title} (${sf.Release_year})</h3>
                  <span class="critic-director" style="font-size: 13px;">Directed by ${sf.Director || 'Unknown'} • Average Rating: ${sf.Average_rating || 'N/A'}/5</span>
                  <p class="spotlight-description">${sf.Description || 'No description available for this film.'}</p>
                </div>
                <div class="spotlight-actions">
                  <button class="btn btn-primary" style="font-size: 12px; font-weight: 700; border-radius: 6px; cursor: pointer; padding: 8px 16px; background: #2481cc; border: none; color: #fff;" onclick="openMovieDetailsFromNews('${encodeURIComponent(JSON.stringify(sf))}')">
                    Inspect Title inside Box 🎬
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }
      
      // 2. On This Day Bulletin
      const bulletin = data.bulletin || [];
      html += `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">On This Day in Cinema</h2>
          <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 10px 0;">Anniversary milestones from your local offline box collection today.</p>
      `;
      
      if (bulletin.length === 0) {
        html += `
          <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.05); padding: 30px; text-align: center; border-radius: 10px; color: var(--text-muted); font-size: 13px;">
            No key anniversaries today. Check back tomorrow!
          </div>
        `;
      } else {
        html += `<div class="bulletins-timeline">`;
        bulletin.forEach(item => {
          html += `
            <div class="anniversary-card">
              <img class="anniversary-poster" src="${item.Poster_URL || 'assets/frame.svg'}" onerror="this.src='assets/frame.svg'" />
              <div class="anniversary-content">
                <div class="anniversary-title-row">
                  <span style="font-weight: 700; color: #fff; font-size: 14px;">${item.Film_title}</span>
                  <span style="font-size: 11px; font-weight: 800; color: var(--accent-blue); background: rgba(36,129,204,0.1); padding: 2px 6px; border-radius: 4px;">${item.age} YEARS AGO</span>
                </div>
                <div class="critic-director" style="font-size: 11px; margin-top: 2px;">Released in ${item.Release_year} • Dir: ${item.Director}</div>
                <p class="anniversary-text" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                  On this day ${item.age} years ago, this film in your collection was released. ${item.Description || ''}
                </p>
                <span style="font-size: 11px; color: #2481cc; cursor: pointer; font-weight: 700; margin-top: 6px; display: inline-block;" onclick="openMovieDetailsFromNews('${encodeURIComponent(JSON.stringify(item))}')">
                  View Film details →
                </span>
              </div>
            </div>
          `;
        });
        html += `</div>`;
      }
      
      html += `</div></div>`;
      gridEl.innerHTML = html;
    })
    .catch(err => {
      gridEl.innerHTML = `<div style="text-align: center; padding: 50px;">Failed to load local curation spotlight: ${err.message || err}</div>`;
    });
}

function loadAndRenderSystemLogs() {
  const gridEl = document.getElementById('news-articles-grid');
  if (!gridEl) return;
  
  gridEl.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 100px 20px; gap: 15px; margin: auto;">
      <div class="shimmer-placeholder" style="width: 50px; height: 50px; border-radius: 50%;"></div>
      <span style="font-size: 14px; color: var(--text-muted); font-weight: 500;">Aggregating offline stats and logs...</span>
    </div>
  `;
  
  Promise.all([
    fetch('/api/news/local_insights').then(res => res.json()),
    fetch('/api/activity_log').then(res => res.json())
  ]).then(([insights, logs]) => {
    if (selectedChannelId !== 'SystemLogs') return; // User switched channel
    
    let html = `<div class="enriched-container">`;
    
    // 1. Curation Analytics stats
    html += `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">Curation Growth Analytics</h2>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 10px 0;">Insights on how your local movie collection is expanding and evolving.</p>
        
        <div class="analytics-grid">
          <div class="analytics-stat-card">
            <div class="analytics-stat-value">${insights.total_films ? insights.total_films.toLocaleString() : 0}</div>
            <div class="analytics-stat-label">Total Titles</div>
          </div>
          <div class="analytics-stat-card">
            <div class="analytics-stat-value">${insights.total_runtime ? Math.round(insights.total_runtime / 60).toLocaleString() : 0} hrs</div>
            <div class="analytics-stat-label">Runtime Cached</div>
          </div>
          <div class="analytics-stat-card">
            <div class="analytics-stat-value">${insights.synced_count ? insights.synced_count.toLocaleString() : 0}</div>
            <div class="analytics-stat-label">Synced details</div>
          </div>
          <div class="analytics-stat-card">
            <div class="analytics-stat-value">${insights.sync_percentage || 0}%</div>
            <div class="analytics-stat-label">Completeness</div>
          </div>
        </div>
      </div>
    `;
    
    // Progress Bar
    html += `
      <div class="sync-progress-container" style="margin-top: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700;">
          <span style="color: #fff;">OMDb Sync Completeness</span>
          <span style="color: var(--accent-green);">${insights.synced_count || 0} / ${insights.total_films || 0} movies (${insights.sync_percentage || 0}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${insights.sync_percentage || 0}%"></div>
        </div>
      </div>
    `;
    
    // Genre & Country Distributions
    html += `
      <div class="dist-block-container" style="margin-top: 10px;">
        <div class="dist-card">
          <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Top Genres Distribution</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
    `;
    
    const genres = insights.genres || [];
    if (genres.length === 0) {
      html += `<div style="color: var(--text-muted); font-size: 12px;">No genre stats available</div>`;
    } else {
      const maxGenreCount = genres[0][1];
      genres.forEach(([gName, count]) => {
        const pct = maxGenreCount > 0 ? (count / maxGenreCount * 100) : 0;
        html += `
          <div class="dist-item">
            <div class="dist-label-row">
              <span style="color: var(--text-secondary);">${gName}</span>
              <span style="color: var(--text-muted);">${count} titles</span>
            </div>
            <div class="dist-bar-track">
              <div class="dist-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      });
    }
    
    html += `
          </div>
        </div>
        
        <div class="dist-card">
          <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">Top Countries cached</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
    `;
    
    const countries = insights.countries || [];
    if (countries.length === 0) {
      html += `<div style="color: var(--text-muted); font-size: 12px;">No country stats available</div>`;
    } else {
      const maxCountryCount = countries[0][1];
      countries.forEach(([cName, count]) => {
        const pct = maxCountryCount > 0 ? (count / maxCountryCount * 100) : 0;
        html += `
          <div class="dist-item">
            <div class="dist-label-row">
              <span style="color: var(--text-secondary);">${cName}</span>
              <span style="color: var(--text-muted);">${count} titles</span>
            </div>
            <div class="dist-bar-track">
              <div class="dist-bar-fill" style="width: ${pct}%; background: #3cc05c;"></div>
            </div>
          </div>
        `;
      });
    }
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    // 2. Harvester Extension Timeline
    html += `
      <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
        <h2 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0;">System Activity & Harvester Timeline</h2>
        <p style="font-size: 13px; color: var(--text-muted); margin: 0 0 15px 0;">Historical timeline of harvester activities, scrapes, and database synchronizations.</p>
        <div class="timeline-list">
    `;
    
    if (logs.length === 0) {
      html += `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No activities recorded yet.</div>`;
    } else {
      logs.forEach(log => {
        let markerClass = "";
        let typeClass = "";
        if (log.type.includes("Sync")) {
          markerClass = "sync-marker";
          typeClass = "sync-type";
        } else if (log.type.includes("Harvester") || log.type.includes("Scrape")) {
          markerClass = "extension-marker";
          typeClass = "extension-type";
        }
        
        let timeText = "";
        try {
          const d = new Date(log.timestamp * 1000);
          timeText = d.toLocaleString();
          const diffHrs = (Date.now() - d.getTime()) / (1000 * 3600);
          if (diffHrs < 24 && d.getDate() === new Date().getDate()) {
            timeText = `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          } else if (diffHrs < 48 && d.getDate() === new Date(Date.now() - 3600*24*1000).getDate()) {
            timeText = `Yesterday at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          }
        } catch(e) {}
        
        html += `
          <div class="timeline-item">
            <div class="timeline-marker ${markerClass}"></div>
            <div class="timeline-item-meta">
              <span class="timeline-item-type ${typeClass}">${log.type}</span>
              <span>${timeText}</span>
            </div>
            <div class="timeline-item-desc">${log.details}</div>
          </div>
        `;
      });
    }
    
    html += `</div></div></div>`;
    gridEl.innerHTML = html;
  }).catch(err => {
    gridEl.innerHTML = `<div style="text-align: center; padding: 50px;">Failed to load system logs and stats: ${err.message || err}</div>`;
  });
}

window.openOfflineReader = function(url, title) {
  const readerModal = document.getElementById('article-reader');
  const readerTitle = document.getElementById('reader-title-content');
  const readerBody = document.getElementById('reader-body-content');
  
  if (!readerModal || !readerTitle || !readerBody) return;
  
  readerTitle.textContent = title;
  readerBody.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 15px; margin: auto;">
      <div class="shimmer-placeholder" style="width: 50px; height: 50px; border-radius: 50%;"></div>
      <span style="font-size: 14px; color: var(--text-muted); font-weight: 500;">Downloading and formatting article for offline reading...</span>
    </div>
  `;
  
  readerModal.classList.add('active');
  
  fetch(`/api/news/article?url=${encodeURIComponent(url)}`)
    .then(res => {
      if (!res.ok) throw new Error("Could not download article. You might be offline.");
      return res.json();
    })
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      
      readerTitle.textContent = data.title || title;
      
      if (!data.blocks || data.blocks.length === 0) {
        readerBody.innerHTML = `<p style="text-align: center; color: var(--text-muted);">No article text could be parsed. Try opening the site directly.</p>`;
        return;
      }
      
      let bodyHtml = "";
      data.blocks.forEach(block => {
        if (block.type === 'p') {
          bodyHtml += `<p>${block.content}</p>`;
        } else if (block.type === 'h') {
          bodyHtml += `<h${block.level || 2}>${block.content}</h${block.level || 2}>`;
        } else if (block.type === 'img') {
          bodyHtml += `<img src="${block.content}" onerror="this.style.display='none';" />`;
        } else if (block.type === 'quote') {
          bodyHtml += `<blockquote>${block.content}</blockquote>`;
        }
      });
      
      readerBody.innerHTML = bodyHtml;
    })
    .catch(err => {
      readerBody.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <span style="font-size: 32px; display: block; margin-bottom: 15px;">⚠️</span>
          <h4 style="color: #fff; margin-bottom: 8px;">Offline Reader Error</h4>
          <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 20px;">${err.message || err}</p>
          <a href="${url}" target="_blank" rel="noopener" class="btn btn-primary" style="display: inline-block; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 13px;">
            Open Website ↗
          </a>
        </div>
      `;
    });
};

window.closeOfflineReader = function() {
  const readerModal = document.getElementById('article-reader');
  if (readerModal) {
    readerModal.classList.remove('active');
  }
};

function initThemeToggle() {
  const btnToggle = document.getElementById('btn-theme-toggle');
  if (!btnToggle) return;
  
  const toggleIcon = document.getElementById('theme-toggle-icon');
  const toggleText = document.getElementById('theme-toggle-text');
  
  // Check localStorage for saved theme preference
  const savedTheme = localStorage.getItem('offlineboxd-news-theme') || 'dark';
  if (savedTheme === 'parchment') {
    document.body.classList.add('parchment-theme');
    if (toggleText) toggleText.textContent = 'Dark Mode';
    if (toggleIcon) toggleIcon.style.filter = 'none';
    btnToggle.style.background = 'rgba(0,0,0,0.04)';
    btnToggle.style.borderColor = 'rgba(0,0,0,0.1)';
    btnToggle.style.color = '#1d1916';
    setTimeout(() => {
      const panelText = document.getElementById('panel-import-text');
      if (panelText) {
        const activeTab = panelText.classList.contains('hidden') ? 'json' : 'text';
        clickImportTab(activeTab);
      }
    }, 100);
  } else {
    document.body.classList.remove('parchment-theme');
    if (toggleText) toggleText.textContent = 'Parchment Mode';
    if (toggleIcon) toggleIcon.style.filter = 'invert(1)';
    btnToggle.style.background = 'rgba(255,255,255,0.03)';
    btnToggle.style.borderColor = 'rgba(255,255,255,0.08)';
    btnToggle.style.color = '#fff';
  }
  
  btnToggle.addEventListener('click', () => {
    const isParchment = document.body.classList.contains('parchment-theme');
    if (isParchment) {
      // Switch to dark mode
      document.body.classList.remove('parchment-theme');
      if (toggleText) toggleText.textContent = 'Parchment Mode';
      if (toggleIcon) toggleIcon.style.filter = 'invert(1)';
      btnToggle.style.background = 'rgba(255,255,255,0.03)';
      btnToggle.style.borderColor = 'rgba(255,255,255,0.08)';
      btnToggle.style.color = '#fff';
      localStorage.setItem('offlineboxd-news-theme', 'dark');
      showToast("Switched to dark mode");
      
      const panelText = document.getElementById('panel-import-text');
      if (panelText) {
        const activeTab = panelText.classList.contains('hidden') ? 'json' : 'text';
        clickImportTab(activeTab);
      }
    } else {
      // Switch to parchment mode
      document.body.classList.add('parchment-theme');
      if (toggleText) toggleText.textContent = 'Dark Mode';
      if (toggleIcon) toggleIcon.style.filter = 'none';
      btnToggle.style.background = 'rgba(0,0,0,0.04)';
      btnToggle.style.borderColor = 'rgba(0,0,0,0.1)';
      btnToggle.style.color = '#1d1916';
      localStorage.setItem('offlineboxd-news-theme', 'parchment');
      showToast("Switched to parchment mode");
      
      const panelText = document.getElementById('panel-import-text');
      if (panelText) {
        const activeTab = panelText.classList.contains('hidden') ? 'json' : 'text';
        clickImportTab(activeTab);
      }
    }
  });
}





