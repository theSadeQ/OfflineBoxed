# OfflineBoxd 🎬

OfflineBoxd is a high-fidelity standalone tool designed to scrape Letterboxd lists, genres, subgenres, and user watchlists, and serve them inside a stunning, responsive, completely offline browser dashboard.

---

## ✨ Features

- **🚀 Professional Web GUI:** Paste any Letterboxd URL inside the browser control center, hit Scrape, and watch progress bars and logs update in real-time.
- **📄 Offline Navigation:** Genuine page-by-page client-side pagination, searching, multi-select sidebar filtering, and rating sorting.
- **📊 Movie Details & Histograms:** Modal overlays displaying full cast lists, studios, countries, descriptions, watches, likes, fans, and a dynamic rating count bar chart.
- **📡 Offline Image Resilience:** Detects when poster image links fail to load offline and automatically renders modern, glassmorphic CSS fallback cards displaying title and release year.

---

## 📦 Directory Structure

```text
OfflineBoxd/
├── gui_server.py           # The Control Center Python web server (zero-dependencies)
├── requirements.txt         # Scraper dependencies (BS4, curl_cffi, tqdm, etc.)
├── listscraper/             # Background python scraper engine
├── scraper_outputs/         # Folder where JSON databases are saved
└── offline_viewer/          # Frontend browser dashboard (HTML, CSS, JS)
    ├── index.html
    ├── style.css
    ├── app.js
    └── swords_fantasy.json  # Scraped Swords & Fantasy database
```

---

## 🛠️ Quick Start

### 1. Install Dependencies
Open your terminal inside the `E:\Projects\OfflineBoxd` directory and install the scraping packages:
```bash
pip install -r requirements.txt
```

### 2. Start the Control Center
Run the unified server script:
```bash
python gui_server.py
```
This will start a local server on port `8080` and **automatically launch your web browser** to `http://localhost:8080`.

### 3. Load & Scrape
- **Load Existing Database:** Select any discovered JSON database (like `swords_fantasy`) directly from the loading grid.
- **Scrape New Subgenre:** Click **"Scraper Console"** in the top header, paste any Letterboxd list/theme URL, name it, and hit scrape to watch it compile and load automatically!
