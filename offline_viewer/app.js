/* ==========================================================================
   OFFLINEBOXD FRONTEND CONTROLLER
   ========================================================================== */

// Application State
let allMovies = [];
let currentDatabaseFilename = '';
let filteredMovies = [];
let currentPage = 1;
const itemsPerPage = 30;

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

// DOM Elements
const navTabFilms = document.getElementById('nav-tab-films');
const navTabLists = document.getElementById('nav-tab-lists');
const appContent = document.getElementById('app-content');
const listsView = document.getElementById('lists-view');
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
const modalRtRating = document.getElementById('modal-rt-rating');
const modalMetaRating = document.getElementById('modal-meta-rating');
const modalPhotosBtn = document.getElementById('modal-photos-btn');
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
      listSubtitle.textContent = `${allMovies.length} films • ${metadata.Description || 'Custom Offline List'}`;
    } else {
      listTitle.textContent = cleanName;
      listSubtitle.textContent = `${allMovies.length} films loaded from local offline vault`;
    }

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

  // Render Themes Filter Grid
  const themesContainer = document.getElementById('themes-filter-list');
  if (themesContainer) {
    renderFilterGroup('themes-filter-list', Array.from(themes).sort(), selectedThemes);
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
}

function renderFilterGroup(elementId, items, selectionSet, excludedSet = null) {
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
    const isLang = (elementId === 'languages-filter-list');
    const isCountry = (elementId === 'countries-filter-list');
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
      currentPage = 1;
      updateFiltersBadge();
      applyFiltersAndRender();
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

/* --------------------------------------------------------------------------
   3. SEARCH, SORT, FILTER & PAGINATION CORE ALGORITHMS
   -------------------------------------------------------------------------- */

function applyFiltersAndRender() {
  try {
    const searchVal = searchInput.value.toLowerCase().trim();
    console.log("[OfflineBoxd] applyFiltersAndRender called. searchVal:", searchVal, "allMovies count:", allMovies.length);

    filteredMovies = allMovies.filter(m => {
      // 1. Text Search matching title, director, cast, crew, studios, countries, languages, genres
      if (searchVal) {
        const matchTitle = m.Film_title && typeof m.Film_title === 'string' && m.Film_title.toLowerCase().includes(searchVal);
        const matchDirector = m.Director && typeof m.Director === 'string' && m.Director.toLowerCase().includes(searchVal);
        const matchDescription = m.Description && typeof m.Description === 'string' && m.Description.toLowerCase().includes(searchVal);
        const matchCast = Array.isArray(m.Cast) && m.Cast.some(c => c && typeof c === 'string' && c.toLowerCase().includes(searchVal));
        
        const matchCrew = m.Crew && typeof m.Crew === 'object' && Object.entries(m.Crew).some(([role, names]) => {
          if (Array.isArray(names)) {
            return names.some(n => n && typeof n === 'string' && n.toLowerCase().includes(searchVal)) || (role && role.toLowerCase().includes(searchVal));
          }
          return (typeof names === 'string' && names.toLowerCase().includes(searchVal)) || (role && role.toLowerCase().includes(searchVal));
        });
        
        const matchStudios = Array.isArray(m.Studios) ? m.Studios.some(s => s && typeof s === 'string' && s.toLowerCase().includes(searchVal)) : (m.Studios && typeof m.Studios === 'string' && m.Studios.toLowerCase().includes(searchVal));
        const matchCountries = Array.isArray(m.Countries) ? m.Countries.some(c => c && typeof c === 'string' && c.toLowerCase().includes(searchVal)) : (m.Countries && typeof m.Countries === 'string' && m.Countries.toLowerCase().includes(searchVal));
        const matchLanguages = Array.isArray(m.Spoken_languages) ? m.Spoken_languages.some(l => l && typeof l === 'string' && l.toLowerCase().includes(searchVal)) : (m.Spoken_languages && typeof m.Spoken_languages === 'string' && m.Spoken_languages.toLowerCase().includes(searchVal));
        const matchGenres = Array.isArray(m.Genres) ? m.Genres.some(g => g && typeof g === 'string' && g.toLowerCase().includes(searchVal)) : (m.Genres && typeof m.Genres === 'string' && m.Genres.toLowerCase().includes(searchVal));
        const matchThemes = Array.isArray(m.Themes) ? m.Themes.some(t => t && typeof t === 'string' && t.toLowerCase().includes(searchVal)) : (m.Themes && typeof m.Themes === 'string' && m.Themes.toLowerCase().includes(searchVal));
        
        if (!matchTitle && !matchDirector && !matchDescription && !matchCast && !matchCrew && !matchStudios && !matchCountries && !matchLanguages && !matchGenres && !matchThemes) {
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
      const watches = parseInt(movie.Watches) || 0;
      const likes = parseInt(movie.Likes) || 0;
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
    ratingHtml += `<span class="card-rating-badge card-rating-lb" title="Letterboxd Average Rating" style="color: var(--accent-green); display: inline-flex; align-items: center; gap: 3px;"><img src="assets/Letterboxd_2018_logo_(vertical).svg" style="height: 12px; vertical-align: middle;" alt="Letterboxd"> ${avgRating.toFixed(1)}</span>`;
  } else {
    ratingHtml += `<span class="card-rating-badge card-rating-lb" style="color: var(--text-muted); display: inline-flex; align-items: center; gap: 3px;"><img src="assets/Letterboxd_2018_logo_(vertical).svg" style="height: 12px; opacity: 0.5; vertical-align: middle;" alt="Letterboxd"> -</span>`;
  }
  
  if (m.IMDb_Rating && m.IMDb_Rating !== 'None' && m.IMDb_Rating !== 'nan') {
    const imdbVal = m.IMDb_Rating.split('/')[0];
    ratingHtml += `<span class="card-rating-badge card-rating-imdb" title="IMDb Rating" style="color: #ffcc00; font-weight: 700; background: rgba(245, 197, 24, 0.08); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(245, 197, 24, 0.15); margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;"><img src="assets/imdb.svg" style="height: 10px; vertical-align: middle;" alt="IMDb"> ${imdbVal}</span>`;
  }
  
  if (m.Rotten_Tomatoes && m.Rotten_Tomatoes !== 'None' && m.Rotten_Tomatoes !== 'nan') {
    ratingHtml += `<span class="card-rating-badge card-rating-rt" title="Rotten Tomatoes Score" style="color: #ff4a4a; font-weight: 700; background: rgba(255, 74, 74, 0.08); padding: 1px 4px; border-radius: 3px; border: 1px solid rgba(255, 74, 74, 0.15); margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;"><img src="assets/Rotten-tomatoes-logo tomato.svg" style="height: 12px; vertical-align: middle;" alt="Rotten Tomatoes"> ${m.Rotten_Tomatoes}</span>`;
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
    
    // Poster image / fallback overlay
    let posterHtml = '';
    if (m.Poster_URL && m.Poster_URL !== 'nan') {
      posterHtml = `<img src="${m.Poster_URL}" alt="${m.Film_title} poster" loading="lazy" class="card-poster">`;
    }
    
    // Calculate display ratings from all platforms
    const ratingHtml = buildCardRatingHtml(m);

    // Genres badges for overlay
    let genreBadges = '';
    if (Array.isArray(m.Genres)) {
      genreBadges = m.Genres.slice(0, 2).map(g => `<span class="overlay-genre-badge">${g}</span>`).join('');
    }

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
      </div>
      <div class="card-rating">${ratingHtml}</div>
      <div class="card-title">${m.Film_title}</div>
      <div class="card-year">${m.Release_year || ''}</div>
    `;

    // Offline Resilience image fallbacks
    const imgEl = card.querySelector('.card-poster');
    const fallbackEl = card.querySelector('.poster-fallback');
    
    if (imgEl) {
      imgEl.onerror = function() {
        imgEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
      };
    } else {
      fallbackEl.classList.remove('hidden');
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
      backdropBanner.style.backgroundImage = `url(${m.Poster_URL})`;
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
      modalImdbRating.classList.remove('hidden');
    } else {
      modalImdbRating.classList.add('hidden');
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

  // OMDb Sync Button Binding
  const omdbSyncBtn = document.getElementById('modal-omdb-sync-btn');
  if (omdbSyncBtn) {
    const targetFilename = m._sourceFile || currentDatabaseFilename;
    if (targetFilename && targetFilename !== "All Lists Combined" && !targetFilename.startsWith("Blob") && !targetFilename.startsWith("File")) {
      omdbSyncBtn.classList.remove('hidden');
      omdbSyncBtn.onclick = async (e) => {
        e.preventDefault();
        
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
              release_year: m.Release_year
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
    modalPoster.src = m.Poster_URL;
    modalPoster.classList.remove('hidden');
    modalPosterFallback.classList.add('hidden');
    modalPoster.onerror = function() {
      modalPoster.classList.add('hidden');
      modalFallbackTitle.textContent = m.Film_title;
      modalFallbackYear.textContent = m.Release_year || '';
      modalPosterFallback.classList.remove('hidden');
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
          
          // Auto-load the first database list on load if there's only one, otherwise let the user select from the sidebar cards
          if (!initialDatabaseLoaded) {
            if (files.length === 1) {
              showLoadingOverlay(`Loading ${files[0].replace('.json', '').replace(/_/g, ' ')}...`);
              fetch(getApiUrl(files[0]))
                .then(res => res.json())
                .then(data => {
                  initialDatabaseLoaded = true;
                  initializeDatabase(data, files[0]);
                })
                .catch(() => {
                  fetch(`./${files[0]}`)
                    .then(res => res.json())
                    .then(data => {
                      initialDatabaseLoaded = true;
                      initializeDatabase(data, files[0]);
                    })
                    .catch(() => hideLoadingOverlay());
                });
            } else {
              // If there are multiple databases, show the lists view by default so the user can select which vault to load
              showListsTab();
            }
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

// Render available offline databases list
function renderLocalFilesList(files) {
  populateMigrationDbSelect(files);
  localFilesGrid.innerHTML = '';
  localFilesSection.classList.remove('hidden');

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
    fetch(getApiUrl(files[0]))
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
              item.innerHTML = `<img src="${m.Poster_URL}" alt="${m.Film_title}" onerror="this.style.display='none'">`;
              stackContainer.appendChild(item);
            });
          }
        }
      })
      .catch(() => {
        fetch(`./${files[0]}`)
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
                  item.innerHTML = `<img src="${m.Poster_URL}" alt="${m.Film_title}" onerror="this.style.display='none'">`;
                  stackContainer.appendChild(item);
                });
              }
            }
          }).catch(()=>{});
      });
  }

  files.forEach(filename => {
    const card = document.createElement('div');
    card.className = 'local-db-card';
    
    // Clean label
    const cleanLabel = filename.replace('.json', '').replace(/_/g, ' ');
    
    card.innerHTML = `
      <div class="list-poster-stack shimmer-placeholder">
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
        <div class="poster-stack-item"><div class="poster-empty-fallback">★</div></div>
      </div>
      <div class="local-db-details">
        <div class="local-db-name" title="${filename}">${cleanLabel}</div>
        <div class="local-db-meta">Loading library contents...</div>
      </div>
      <div class="local-db-delete" title="Delete Database List">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
    `;

    // Fetch covers and stats dynamically
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
                item.innerHTML = `<img src="${m.Poster_URL}" alt="${m.Film_title}" onerror="this.style.display='none'">`;
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

    card.addEventListener('click', () => {
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

    localFilesGrid.appendChild(card);
  });
}

// Load and combine all lists data
function loadAllListsCombined(files) {
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
      initialDatabaseLoaded = true;
      initializeDatabase(combined, "All Lists Combined");
    })
    .catch(err => {
      hideLoadingOverlay();
      alert("Error loading combined lists.");
      console.error(err);
    });
}

// Tab Switching Controls
function showFilmsTab() {
  if (navTabFilms) navTabFilms.classList.add('active');
  if (navTabLists) navTabLists.classList.remove('active');
  if (navTabPeople) navTabPeople.classList.remove('active');
  if (appContent) appContent.classList.remove('hidden');
  if (listsView) listsView.classList.add('hidden');
  if (peopleView) peopleView.classList.add('hidden');
}

function showListsTab() {
  if (navTabFilms) navTabFilms.classList.remove('active');
  if (navTabLists) navTabLists.classList.add('active');
  if (navTabPeople) navTabPeople.classList.remove('active');
  if (appContent) appContent.classList.add('hidden');
  if (listsView) listsView.classList.remove('hidden');
  if (peopleView) peopleView.classList.add('hidden');
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

// Initialize server autodetect on page load
document.addEventListener('DOMContentLoaded', () => {
  detectLocalServer();
  initMigrationWidget();
  pollMigrationStatus();
});

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
    
    if (matches.length === 0) {
      peopleSuggestions.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px; text-align: center;">No matches found</div>`;
    } else {
      peopleSuggestions.innerHTML = '';
      matches.forEach(p => {
        const div = document.createElement('div');
        div.style.padding = '10px 14px';
        div.style.cursor = 'pointer';
        div.style.fontSize = '13px';
        div.style.color = '#fff';
        div.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
        div.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span style="font-weight: 600;">${p.name}</span>
            <span class="meta-tag" style="font-size: 10px; font-weight: 700; background: ${p.role === 'actor' ? 'var(--accent-blue)' : 'var(--accent-orange)'}; color: #000; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${p.role}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          selectPerson(p);
        });
        peopleSuggestions.appendChild(div);
      });
    }
    peopleSuggestions.classList.remove('hidden');
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
  const watchedCount = matchFilms.filter(m => m.Watches && m.Watches > 0).length;
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
  
  renderPeopleMoviesGrid(matchFilms);
  loadPeopleDetailsFromTMDB(person.name, person.role, totalFilms);
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
    card.setAttribute('tabindex', '0');
    
    // Poster image / fallback overlay
    let posterHtml = '';
    if (m.Poster_URL && m.Poster_URL !== 'nan' && m.Poster_URL !== '-') {
      posterHtml = `<img src="${m.Poster_URL}" alt="${m.Film_title} poster" loading="lazy" class="card-poster" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22150%22 viewBox=%220 0 100 150%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%231c252d%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%237a8c9e%22 font-size=%2210%22>No Cover</text></svg>'">`;
    }
    
    // Calculate display ratings from all platforms
    const ratingHtml = buildCardRatingHtml(m);

    // Genres badges for overlay
    let genreBadges = '';
    if (Array.isArray(m.Genres)) {
      genreBadges = m.Genres.slice(0, 2).map(g => `<span class="overlay-genre-badge">${g}</span>`).join('');
    }

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
      </div>
      <div class="card-rating">${ratingHtml}</div>
      <div class="card-title">${m.Film_title}</div>
      <div class="card-year">${m.Release_year || ''}</div>
    `;

    // Offline Resilience image fallbacks
    const imgEl = card.querySelector('.card-poster');
    const fallbackEl = card.querySelector('.poster-fallback');
    
    if (imgEl) {
      imgEl.onerror = function() {
        imgEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
      };
    } else {
      fallbackEl.classList.remove('hidden');
    }

    // Modal click trigger
    card.addEventListener('click', () => openMovieDetails(m));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openMovieDetails(m);
    });

    peopleMoviesGrid.appendChild(card);
  });
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
    const posterUrl = film.Poster_URL || 'assets/watched.svg';
    const director = film.Director || 'Unknown Director';
    const year = film.Release_year || 'N/A';

    row.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; min-width: 24px;">
        <button class="btn-reorder-up" title="Move Up">▲</button>
        <button class="btn-reorder-down" title="Move Down">▼</button>
      </div>
      ${rankHtml}
      <img src="${posterUrl}" style="width: 32px; height: 48px; object-fit: cover; border-radius: 3px; background: #14181c; border: 1px solid rgba(255,255,255,0.1);" onerror="this.src='assets/watched.svg';">
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
          const posterUrl = m.Poster_URL || 'assets/watched.svg';
          const year = m.Release_year || 'N/A';
          const director = m.Director || 'Unknown';
          
          div.innerHTML = `
            <img src="${posterUrl}" onerror="this.src='assets/watched.svg';">
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
  if (tab === 'text') {
    tabImportText.style.background = 'rgba(255,255,255,0.05)';
    tabImportText.style.color = '#fff';
    tabImportJson.style.background = 'transparent';
    tabImportJson.style.color = 'var(--text-muted)';
    panelImportText.classList.remove('hidden');
    panelImportJson.classList.add('hidden');
  } else {
    tabImportJson.style.background = 'rgba(255,255,255,0.05)';
    tabImportJson.style.color = '#fff';
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
        alert(`List "${name}" saved successfully as ${filename}!`);
        
        nameInput.value = '';
        document.getElementById('new-list-description').value = '';
        document.getElementById('new-list-tags').value = '';
        if (newListRankedInput) newListRankedInput.checked = false;
        draftListFilms = [];
        
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
  
  // Save current selection
  const currentVal = dbSelect.value;
  
  // Clear but keep the placeholder first option
  dbSelect.innerHTML = '<option value="" disabled selected>Select a database to sync...</option>';
  
  // Filter for JSON databases and add them
  files.forEach(file => {
    if (file.endsWith('.json')) {
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

function initMigrationWidget() {
  const dbSelect = document.getElementById('migration-db-select');
  const toggleBtn = document.getElementById('btn-migration-toggle');
  const showBtn = document.getElementById('btn-show-sync-modal');
  const closeBtn = document.getElementById('btn-sync-modal-close');
  const modal = document.getElementById('sync-modal');
  
  if (showBtn && modal) {
    showBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
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
      
      if (!syncRatings && !syncAvatars) {
        alert("Please select at least one sync option (Ratings or Avatars)!");
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
          sync_avatars: syncAvatars
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
  const showBtn = document.getElementById('btn-show-sync-modal');
  
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
      if (showBtn) {
        showBtn.textContent = 'SYNCING VAULT...';
        showBtn.classList.remove('btn-secondary');
        showBtn.classList.add('btn-primary'); // Highlight sync button when active
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
      if (showBtn) {
        showBtn.textContent = 'SYNC VAULT';
        showBtn.classList.remove('btn-primary');
        showBtn.classList.add('btn-secondary');
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
      dot.style.background = '#678';
      dot.style.boxShadow = 'none';
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


