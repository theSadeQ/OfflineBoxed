import os
import json
import concurrent.futures
import urllib.parse
import urllib.request
import urllib.error
import threading
import time
import webbrowser
import re
import html
from http.server import SimpleHTTPRequestHandler, HTTPServer
from listscraper.instance_class import ScrapeInstance
from listscraper.scrape_functions import scrape_progress


PORT = 8080
DIRECTORY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "offline_viewer")

# Configure directories to scan for listing and reading files (in priority order)
SCAN_DIRS = [
    "E:\\Projects\\OfflineBoxd\\scraper_outputs",
    "E:\\Projects\\OfflineBoxd\\offline_viewer",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "scraper_outputs"),
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "offline_viewer")
]

# Configure the single destination directory for saving new scrapes/harvests
PRIMARY_SAVE_DIR = "E:\\Projects\\OfflineBoxd\\scraper_outputs"
LOCAL_SAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scraper_outputs")

def get_save_directory():
    if os.path.exists(PRIMARY_SAVE_DIR):
        return PRIMARY_SAVE_DIR
    os.makedirs(LOCAL_SAVE_DIR, exist_ok=True)
    return LOCAL_SAVE_DIR

# OMDb Migration State
migration_state = {
    "status": "idle",
    "current": 0,
    "total": 0,
    "current_film": "",
    "filename": "",
    "logs": []
}
migration_cancel_event = threading.Event()
migration_thread = None

def safe_save_json(filepath, data):
    tmp_path = filepath + ".tmp"
    try:
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        os.replace(tmp_path, filepath)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except:
                pass
        raise e

def load_omdb_keys():
    keys = []
    search_paths = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api_keys.txt"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_keys.txt"),
        "api_keys.txt"
    ]
    for p in search_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        if "OMDB_API_KEY=" in line and not line.strip().startswith("#"):
                            val = line.split("=")[1].strip()
                            if val and val not in keys:
                                keys.append(val)
            except:
                pass
    if "trilogy" not in keys:
        keys.append("trilogy")
    return keys

def fetch_ratings_from_omdb(title, year, api_key, imdb_id=None):
    try:
        if imdb_id:
            url = f"https://www.omdbapi.com/?i={imdb_id}&apikey={api_key}"
        else:
            title_q = urllib.parse.quote(title)
            url = f"https://www.omdbapi.com/?t={title_q}&y={year}&apikey={api_key}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            res_bytes = r.read()
            data = json.loads(res_bytes.decode('utf-8'))
            return data
    except urllib.error.HTTPError as e:
        try:
            err_content = e.read().decode('utf-8')
            data = json.loads(err_content)
            if isinstance(data, dict):
                return data
        except:
            pass
        return {"Response": "False", "Error": f"HTTP Error {e.code}: {e.reason}"}
    except Exception as e:
        pass
    return None

def fetch_rt_rating_via_algolia(title, year):
    try:
        url = 'https://79FRDP12PN-dsn.algolia.net/1/indexes/content_rt/query'
        headers = {
            'X-Algolia-Application-Id': '79FRDP12PN',
            'X-Algolia-API-Key': '175588f6e5f8319b27702e4cc4013561',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
        }
        query = title.strip()
        payload = json.dumps({'params': f'query={urllib.parse.quote(query)}&hitsPerPage=5'}).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=5) as res:
            hits = json.loads(res.read().decode('utf-8')).get('hits', [])
            best_match = None
            for hit in hits:
                hit_title = hit.get('title', '')
                hit_year = hit.get('releaseYear')
                
                year_match = False
                if year:
                    try:
                        y_val = int(year)
                        if hit_year and abs(int(hit_year) - y_val) <= 1:
                            year_match = True
                    except:
                        pass
                else:
                    year_match = True
                
                title_match = False
                norm_title = title.lower().strip()
                norm_hit_title = hit_title.lower().strip()
                if norm_hit_title == norm_title:
                    title_match = True
                elif hit.get('vanity', '').replace('_', ' ').lower() == norm_title:
                    title_match = True
                
                if title_match and year_match:
                    best_match = hit
                    break
                if year_match and not best_match:
                    best_match = hit
            
            if best_match:
                rt_data = best_match.get('rottenTomatoes', {})
                critics_score = rt_data.get('criticsScore')
                if critics_score is not None:
                    return f"{critics_score}%"
    except Exception as e:
        pass
    return None

def load_tmdb_keys():
    keys = []
    search_paths = [
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api_keys.txt"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "api_keys.txt"),
        "api_keys.txt"
    ]
    for p in search_paths:
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    for line in f:
                        if "TMDB_API_KEY=" in line and not line.strip().startswith("#"):
                            val = line.split("=")[1].strip()
                            if val and val not in keys:
                                keys.append(val)
            except:
                pass
    return keys

def fetch_imdb_id_from_tmdb(title, year, api_key):
    try:
        title_q = urllib.parse.quote(title)
        search_url = f"https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={title_q}"
        if year:
            search_url += f"&primary_release_year={year}"
            
        req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            search_res = json.loads(r.read().decode('utf-8'))
            results = search_res.get("results", [])
            if not results and year:
                fallback_url = f"https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={title_q}"
                req = urllib.request.Request(fallback_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=5) as r2:
                    search_res = json.loads(r2.read().decode('utf-8'))
                    results = search_res.get("results", [])
            
            if results:
                best_match = results[0]
                tmdb_id = best_match.get("id")
                
                detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={api_key}&append_to_response=external_ids"
                req_detail = urllib.request.Request(detail_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_detail, timeout=5) as r_det:
                    detail_res = json.loads(r_det.read().decode('utf-8'))
                    ext_ids = detail_res.get("external_ids", {})
                    detail_res["imdb_id"] = ext_ids.get("imdb_id")
                    return detail_res
    except Exception as e:
        pass
    return None

def enrich_film_from_tmdb_data(film, data):
    plot = data.get("overview")
    if plot and (not film.get("Description") or film.get("Description") == "None" or len(film.get("Description", "")) < 20):
        film["Description"] = plot
        
    runtime = data.get("runtime")
    if runtime and (not film.get("Runtime") or film.get("Runtime") == 0 or film.get("Runtime") == "0"):
        film["Runtime"] = int(runtime)
        
    genres = [g.get("name") for g in data.get("genres", []) if g.get("name")]
    if genres and not film.get("Genres"):
        film["Genres"] = genres
        
    poster_path = data.get("poster_path")
    if poster_path and (not film.get("Poster_URL") or "empty-poster" in film.get("Poster_URL", "")):
        film["Poster_URL"] = f"https://image.tmdb.org/t/p/w500{poster_path}"

def clean_person_name(name):
    if not name:
        return ""
    # Remove any parentheses like (screenplay), (story), (uncredited), (co-director)
    name = re.sub(r'\s*\([^)]*\)', '', name)
    return name.strip()

def clean_html(raw_html):
    if not raw_html:
        return ""
    # Unescape HTML entities first
    unescaped = html.unescape(raw_html)
    # Remove HTML tags
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', unescaped)
    return ' '.join(cleantext.split())

def update_film_from_omdb_data(film, data):
    # 1. Update ratings
    imdb_val = data.get("imdbRating")
    film["IMDb_Rating"] = f"{imdb_val}/10" if imdb_val and imdb_val != "N/A" else None
    
    votes_val = data.get("imdbVotes")
    film["IMDb_Votes"] = votes_val if votes_val and votes_val != "N/A" else None
    
    meta_val = data.get("Metascore")
    film["Metascore"] = f"{meta_val}/100" if meta_val and meta_val != "N/A" else None
    
    rt_score = None
    for entry in data.get("Ratings", []):
        if entry.get("Source") == "Rotten Tomatoes":
            rt_score = entry.get("Value")
            break
    film["Rotten_Tomatoes"] = rt_score
    film["IMDb_ID"] = data.get("imdbID") if data.get("imdbID") != "N/A" else None

    # 2. Update Description (Plot)
    plot = data.get("Plot")
    if plot and plot != "N/A" and (not film.get("Description") or film.get("Description") == "None" or len(film.get("Description", "")) < 20):
        film["Description"] = plot

    # 3. Update Runtime
    runtime_str = data.get("Runtime")
    if runtime_str and runtime_str != "N/A" and (not film.get("Runtime") or film.get("Runtime") == "None" or film.get("Runtime") == 0 or film.get("Runtime") == "0"):
        match = re.search(r'\d+', runtime_str)
        if match:
            film["Runtime"] = int(match.group(0))

    # 4. Update Genres
    genre_str = data.get("Genre")
    if genre_str and genre_str != "N/A" and not film.get("Genres"):
        film["Genres"] = [g.strip() for g in genre_str.split(",") if g.strip()]

    # 5. Update Director, Cast, and Crew
    director_str = data.get("Director")
    if director_str and director_str != "N/A":
        directors = [clean_person_name(d) for d in director_str.split(",") if d.strip()]
        if directors:
            if not film.get("Director") or film.get("Director") == "Unknown" or film.get("Director") == "Unknown Director":
                film["Director"] = directors[0]
            
            if "Crew" not in film or not isinstance(film["Crew"], dict):
                film["Crew"] = {}
            if "Directors" not in film["Crew"] or not film["Crew"]["Directors"]:
                film["Crew"]["Directors"] = directors

    writer_str = data.get("Writer")
    if writer_str and writer_str != "N/A":
        writers = [clean_person_name(w) for w in writer_str.split(",") if w.strip()]
        if writers:
            if "Crew" not in film or not isinstance(film["Crew"], dict):
                film["Crew"] = {}
            if "Writers" not in film["Crew"] or not film["Crew"]["Writers"]:
                film["Crew"]["Writers"] = writers

    actors_str = data.get("Actors")
    if actors_str and actors_str != "N/A":
        actors = [clean_person_name(a) for a in actors_str.split(",") if a.strip()]
        if actors:
            if not film.get("Cast") or not isinstance(film["Cast"], list) or not film["Cast"]:
                film["Cast"] = actors

    # 6. Update Countries
    country_str = data.get("Country")
    if country_str and country_str != "N/A":
        omdb_countries = [c.strip() for c in country_str.split(",") if c.strip()]
        current_countries = film.get("Countries")
        if isinstance(current_countries, list):
            cleaned_countries = [c for c in current_countries if c.lower() not in ('country', 'countries')]
            film["Countries"] = cleaned_countries if cleaned_countries else omdb_countries
        else:
            film["Countries"] = omdb_countries

    # 7. Update Original Language
    lang_str = data.get("Language")
    if lang_str and lang_str != "N/A":
        languages = [l.strip() for l in lang_str.split(",") if l.strip()]
        current_langs = film.get("Spoken_languages")
        if isinstance(current_langs, list):
            cleaned_langs = [l for l in current_langs if l.lower() not in ('language', 'languages')]
            film["Spoken_languages"] = cleaned_langs if cleaned_langs else languages
        else:
            film["Spoken_languages"] = languages
            
        if languages:
            if not film.get("Original_language") or film.get("Original_language").lower() in ('language', 'languages', 'none'):
                film["Original_language"] = languages[0]

    # 8. Fallback Poster URL
    poster_str = data.get("Poster")
    if poster_str and poster_str.startswith("http") and (not film.get("Poster_URL") or "empty-poster" in film.get("Poster_URL", "")):
        film["Poster_URL"] = poster_str

def download_avatar_for_person(person, avatars_dir):
    if not person or person in ["Unknown", "Unknown Director", "None"]:
        return False, "invalid name"
        
    safe_name = "".join(c if c.isalnum() else "_" for c in person.lower())
    while "__" in safe_name:
        safe_name = safe_name.replace("__", "_")
    safe_name = safe_name.strip("_")
    
    info_file = os.path.join(avatars_dir, f"{safe_name}.json")
    
    # Check if avatar image is already cached
    cached_img = None
    for ext in [".jpg", ".png", ".webp"]:
        if os.path.exists(os.path.join(avatars_dir, f"{safe_name}{ext}")):
            cached_img = f"{safe_name}{ext}"
            break
            
    # Check if info JSON is already cached
    cached_info = os.path.exists(info_file)
    
    if cached_img and cached_info:
        return True, "already cached"
        
    try:
        search_q = urllib.parse.quote(person)
        search_url = f"https://www.themoviedb.org/search/person?query={search_q}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as r:
            html_content = r.read().decode('utf-8')
            
        person_links = re.findall(r'href="(/person/\d+-[^"]*)"', html_content)
        if not person_links:
            return False, "person page not found"
            
        person_href = person_links[0]
        person_page_url = f"https://www.themoviedb.org{person_href}"
        
        req2 = urllib.request.Request(person_page_url, headers=headers)
        with urllib.request.urlopen(req2, timeout=8) as r2:
            p_html = r2.read().decode('utf-8')
            
        # 1. Parse Biography
        bio_text = ""
        bio_sect = re.search(r'class=["\']biography.*?["\'](.*?)<\/div>\s*<\/div>', p_html, re.DOTALL)
        if not bio_sect:
            bio_sect = re.search(r'class=["\']biography.*?["\'](.*?)</section>', p_html, re.DOTALL)
        if not bio_sect:
            bio_sect = re.search(r'Biography</h3>(.*?)<\/div>', p_html, re.DOTALL)
            
        if bio_sect:
            content_html = bio_sect.group(1)
            paras = re.findall(r'<p>(.*?)</p>', content_html, re.DOTALL)
            if paras:
                bio_text = " ".join(clean_html(p) for p in paras if p.strip())
            else:
                bio_text = clean_html(content_html)
                
        bio_text = bio_text.replace("Biography", "").strip()
        
        # 2. Parse IMDb Link
        imdb_url = None
        imdb_link_match = re.search(r'href="(https://www.imdb.com/name/nm[^"]+)"', p_html)
        if imdb_link_match:
            imdb_url = imdb_link_match.group(1)
        else:
            imdb_url = f"https://www.imdb.com/find?q={urllib.parse.quote(person)}&s=nm"
            
        # 3. Save Info JSON
        info_data = {
            "bio": bio_text,
            "tmdb_url": person_page_url,
            "imdb_url": imdb_url
        }
        with open(info_file, 'w', encoding='utf-8') as f:
            json.dump(info_data, f, indent=4, ensure_ascii=False)
            
        # 4. Parse Avatar image URL
        if cached_img:
            return True, f"info cached, avatar already cached as {cached_img}"
            
        match = re.search(r'class="profile[^"]*"[^>]*src="([^"]+)"', p_html)
        if not match:
            match = re.search(r'src="([^"]+profile[^"]+)"', p_html)
            if not match:
                match = re.search(r'src="([^"]+w300_and_h450_face[^"]+)"', p_html)
                
        if not match:
            return True, "info cached, profile image URL not found"
            
        img_url = match.group(1)
        if img_url.startswith('/'):
            img_url = f"https://image.tmdb.org/t/p/w500{img_url}"
            
        parsed = urllib.parse.urlparse(img_url)
        ext = os.path.splitext(parsed.path)[1].lower()
        if ext not in [".jpg", ".png", ".webp", ".jpeg"]:
            ext = ".jpg"
        if ext == ".jpeg":
            ext = ".jpg"
            
        dest_path = os.path.join(avatars_dir, f"{safe_name}{ext}")
        
        req3 = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req3, timeout=8) as r3:
            with open(dest_path, 'wb') as f:
                f.write(r3.read())
                
        return True, f"cached as {safe_name}{ext} with biography info"
    except Exception as e:
        return False, str(e)

def download_logo_for_studio(studio, studios_dir):
    if not studio or studio in ["Unknown", "None"]:
        return False, "invalid name"
        
    safe_name = "".join(c if c.isalnum() else "_" for c in studio.lower())
    while "__" in safe_name:
        safe_name = safe_name.replace("__", "_")
    safe_name = safe_name.strip("_")
    
    # Check if cached (any extension)
    for ext in [".png", ".jpg", ".webp"]:
        if os.path.exists(os.path.join(studios_dir, f"{safe_name}{ext}")):
            return True, f"assets/studios/{safe_name}{ext}"
            
    try:
        search_q = urllib.parse.quote(studio)
        search_url = f"https://www.themoviedb.org/search/company?query={search_q}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        req = urllib.request.Request(search_url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as r:
            html = r.read().decode('utf-8')
            
        # Parse links containing company ID and logo image
        matches = re.findall(r'href="/company/[^"]*".*?<img src="([^"]+)"', html, re.DOTALL)
        if not matches:
            matches = re.findall(r'src="(https://media.themoviedb.org/t/p/[^"]+)"', html)
            
        if not matches:
            return False, "no logo image found on search page"
            
        img_url = matches[0]
        # Resolve to higher quality version
        if "/h30/" in img_url:
            img_url = img_url.replace("/h30/", "/h150/")
            
        parsed = urllib.parse.urlparse(img_url)
        ext = os.path.splitext(parsed.path)[1].lower()
        if ext not in [".jpg", ".png", ".webp", ".jpeg"]:
            ext = ".png"
        if ext == ".jpeg":
            ext = ".jpg"
            
        dest_path = os.path.join(studios_dir, f"{safe_name}{ext}")
        
        req2 = urllib.request.Request(img_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req2, timeout=8) as r2:
            with open(dest_path, 'wb') as f:
                f.write(r2.read())
                
        return True, f"assets/studios/{safe_name}{ext}"
    except Exception as e:
        return False, str(e)

def sync_people_for_film(film):
    avatars_dir = os.path.join(DIRECTORY, "assets", "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    
    unique_people = set()
    d = film.get("Director")
    if d and d != "Unknown" and d != "Unknown Director":
        unique_people.add(d)
        
    crew = film.get("Crew", {})
    if isinstance(crew, dict):
        for p in crew.get("Directors", []):
            if p: unique_people.add(p)
        for p in crew.get("Writers", []):
            if p: unique_people.add(p)
            
    cast = film.get("Cast")
    if isinstance(cast, list):
        for actor in cast[:8]: # Limit to first 8 actors
            if actor:
                unique_people.add(actor)
                
    # Filter for missing files
    people_to_download = []
    for person in unique_people:
        safe_name = "".join(c if c.isalnum() else "_" for c in person.lower())
        while "__" in safe_name:
            safe_name = safe_name.replace("__", "_")
        safe_name = safe_name.strip("_")
        
        cached_img = False
        for ext in [".jpg", ".png", ".webp"]:
            if os.path.exists(os.path.join(avatars_dir, f"{safe_name}{ext}")):
                cached_img = True
                break
        cached_info = os.path.exists(os.path.join(avatars_dir, f"{safe_name}.json"))
        
        if not cached_img or not cached_info:
            people_to_download.append(person)
            
    if people_to_download:
        print(f"[GUI Server] Syncing {len(people_to_download)} missing cast/crew avatars & info for '{film.get('Film_title')}'...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            executor.map(lambda p: download_avatar_for_person(p, avatars_dir), people_to_download)

def run_migration_worker(folder, filename, api_keys, sync_ratings, sync_avatars):
    global migration_state
    filepath = os.path.join(folder, filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        migration_state["status"] = "paused"
        migration_state["logs"].append(f"[ERROR] Failed to read database: {e}")
        return
        
    if not isinstance(data, list):
        migration_state["status"] = "paused"
        migration_state["logs"].append("[ERROR] Invalid list database format.")
        return
        
    # Phase 1 setup: Ratings
    films_to_update = []
    if sync_ratings:
        for idx, film in enumerate(data):
            if not isinstance(film, dict) or film.get("Film_title") == "__metadata__":
                continue
            if film.get("OMDb_Synced"):
                continue
            if "IMDb_Rating" in film and film["IMDb_Rating"] is not None and "IMDb_ID" in film and film["IMDb_ID"] is not None:
                continue
            title = film.get("Film_title")
            if not title:
                continue
            films_to_update.append((idx, film))
            
    # Phase 2 setup: Avatars
    people_to_download = []
    unique_people = set()
    avatars_dir = os.path.join(DIRECTORY, "assets", "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    
    if sync_avatars:
        for film in data:
            if not isinstance(film, dict) or film.get("Film_title") == "__metadata__":
                continue
            
            d = film.get("Director")
            if d and d != "Unknown":
                unique_people.add(d)
                
            crew = film.get("Crew", {})
            if isinstance(crew, dict):
                for p in crew.get("Directors", []):
                    if p: unique_people.add(p)
                for p in crew.get("Writers", []):
                    if p: unique_people.add(p)
                    
            cast = film.get("Cast")
            if isinstance(cast, list):
                for actor in cast:
                    if actor:
                        unique_people.add(actor)
                        
        # Filter for missing avatars & biographies
        existing_files = set(os.listdir(avatars_dir))
        for person in unique_people:
            safe_name = "".join(c if c.isalnum() else "_" for c in person.lower())
            while "__" in safe_name:
                safe_name = safe_name.replace("__", "_")
            safe_name = safe_name.strip("_")
            
            cached_img = (
                f"{safe_name}.jpg" in existing_files or
                f"{safe_name}.png" in existing_files or
                f"{safe_name}.webp" in existing_files
            )
            cached_info = f"{safe_name}.json" in existing_files
            if not cached_img or not cached_info:
                people_to_download.append(person)
                
    total_tasks = len(films_to_update) + len(people_to_download)
    
    # Calculate persistent progress metrics
    total_films = len([f for f in data if isinstance(f, dict) and f.get("Film_title") != "__metadata__"])
    already_synced_films = total_films - len(films_to_update) if sync_ratings else 0
    
    total_avatars = len(unique_people) if sync_avatars else 0
    already_synced_avatars = total_avatars - len(people_to_download) if sync_avatars else 0
    
    grand_total = (total_films if sync_ratings else 0) + (total_avatars if sync_avatars else 0)
    already_synced = already_synced_films + already_synced_avatars
    
    migration_state["total"] = grand_total
    migration_state["current"] = already_synced
    migration_state["status"] = "running"
    
    if total_tasks == 0:
        migration_state["total"] = grand_total
        migration_state["current"] = grand_total
        migration_state["logs"].append("[SYSTEM] Vault metadata and media are already fully synced!")
        migration_state["status"] = "finished"
        return
        
    migration_state["logs"].append(
        f"[SYSTEM] Starting sync: {len(films_to_update)} ratings to sync, {len(people_to_download)} avatars to download."
    )
    
    db_save_lock = threading.Lock()
    state_lock = threading.Lock()
    active_keys = list(api_keys)
    tmdb_keys = load_tmdb_keys()
    tmdb_key = tmdb_keys[0] if tmdb_keys else None
    
    processed_ratings = 0
    processed_avatars = 0
    ratings_updated_count = 0
    avatars_downloaded_count = 0
    
    # 1. Run Ratings Sync
    if films_to_update and not migration_cancel_event.is_set():
        migration_state["logs"].append(
            f"[SYSTEM] [Phase 1/2] Syncing ratings using {len(api_keys)} OMDb API keys..."
        )
        
        def process_single_rating(task_idx, list_idx, film):
            nonlocal processed_ratings, ratings_updated_count
            if migration_cancel_event.is_set():
                return
                
            title = film.get("Film_title")
            year = film.get("Release_year")
            if year == "nan" or not year:
                year = ""
                
            imdb_id = film.get("IMDb_ID")
            if not imdb_id and tmdb_key:
                tmdb_data = fetch_imdb_id_from_tmdb(title, year, tmdb_key)
                if tmdb_data:
                    imdb_id = tmdb_data.get("imdb_id")
                    if imdb_id:
                        film["IMDb_ID"] = imdb_id
                        with state_lock:
                            migration_state["logs"].append(f"[TMDb] Resolved IMDb ID for '{title}' -> {imdb_id}")
                            if len(migration_state["logs"]) > 200:
                                migration_state["logs"] = migration_state["logs"][-200:]
                    enrich_film_from_tmdb_data(film, tmdb_data)
                    
            watches = film.get("Watches") or 0
            if watches < 1000:
                film["OMDb_Synced"] = True
                with state_lock:
                    migration_state["current"] += 1
                    processed_ratings += 1
                return

            # Fetch Rotten Tomatoes via Algolia API if missing
            rt_synced = False
            rt_val = None
            if not film.get("Rotten_Tomatoes") or film.get("Rotten_Tomatoes") == "None":
                with state_lock:
                    migration_state["current_film"] = f"Rating: {title} ({year}) [Algolia RT Search]"
                rt_val = fetch_rt_rating_via_algolia(title, year)
                if rt_val:
                    film["Rotten_Tomatoes"] = rt_val
                    rt_synced = True
                    with state_lock:
                        migration_state["logs"].append(f"[Algolia RT] Synced score for '{title}' ({year}) -> {rt_val}")
                        if len(migration_state["logs"]) > 200:
                            migration_state["logs"] = migration_state["logs"][-200:]

            need_omdb = (not film.get("IMDb_Rating") or film.get("IMDb_Rating") == "None")
            if not need_omdb or not active_keys:
                film["OMDb_Synced"] = True
                with state_lock:
                    migration_state["current"] += 1
                    processed_ratings += 1
                    if rt_synced:
                        ratings_updated_count += 1
                        local_updated = ratings_updated_count
                    else:
                        local_updated = 0
                
                if local_updated > 0 and local_updated % 100 == 0:
                    with db_save_lock:
                        try:
                            safe_save_json(filepath, data)
                        except Exception as e:
                            with state_lock:
                                migration_state["logs"].append(f"[ERROR] Failed to save database: {e}")
                                if len(migration_state["logs"]) > 200:
                                    migration_state["logs"] = migration_state["logs"][-200:]
                return

            with state_lock:
                if not active_keys:
                    migration_cancel_event.set()
                    return
                api_key = active_keys[task_idx % len(active_keys)]
                migration_state["current_film"] = f"Rating: {title} ({year}) [key: {api_key}]"
                
            omdb_data = fetch_ratings_from_omdb(title, year, api_key, imdb_id=imdb_id)
            
            if migration_cancel_event.is_set():
                return
                
            with state_lock:
                migration_state["current"] += 1
                processed_ratings += 1
                
            if omdb_data:
                # Check for OMDb rate limit or key error
                error_msg = omdb_data.get("Error", "")
                if omdb_data.get("Response") == "False" and any(err in error_msg.lower() for err in [
                    "limit exceeded", "limit reached", "invalid api key", "key expired", 
                    "unauthorized", "forbidden", "too many requests", "401", "403", "429"
                ]):
                    with state_lock:
                        if api_key in active_keys:
                            active_keys.remove(api_key)
                            migration_state["logs"].append(f"[WARNING] OMDb key {api_key} disabled: {error_msg}. ({len(active_keys)} keys remaining)")
                            if len(migration_state["logs"]) > 200:
                                migration_state["logs"] = migration_state["logs"][-200:]
                        if not active_keys:
                            migration_state["logs"].append("[WARNING] All OMDb API keys have reached their limits. Continuing sync using only keyless Algolia RT search.")
                            if len(migration_state["logs"]) > 200:
                                migration_state["logs"] = migration_state["logs"][-200:]
                    return
                
                update_film_from_omdb_data(film, omdb_data)
                if rt_synced:
                    film["Rotten_Tomatoes"] = rt_val
                    
                film["OMDb_Synced"] = True
                imdb = film.get("IMDb_Rating")
                imdb_id = film.get("IMDb_ID")
                
                with state_lock:
                    ratings_updated_count += 1
                    local_updated = ratings_updated_count
                    if omdb_data.get("Response") != "False":
                        migration_state["logs"].append(
                            f"[OMDb] {title} ({year}) -> IMDb: {imdb or 'N/A'}, IMDb ID: {imdb_id or 'N/A'} (using {api_key})"
                        )
                    else:
                        migration_state["logs"].append(
                            f"[OMDb] No details found for: {title} ({year}) (using {api_key})"
                        )
                    if len(migration_state["logs"]) > 200:
                        migration_state["logs"] = migration_state["logs"][-200:]
                
                if local_updated % 100 == 0:
                    with db_save_lock:
                        try:
                            safe_save_json(filepath, data)
                        except Exception as e:
                            with state_lock:
                                migration_state["logs"].append(f"[ERROR] Failed to save database: {e}")
                                if len(migration_state["logs"]) > 200:
                                    migration_state["logs"] = migration_state["logs"][-200:]
            else:
                # Network or connection error, do not set OMDb_Synced to True, just log and continue
                with state_lock:
                    migration_state["logs"].append(f"[OMDb] Connection error for: {title} ({year}) (using {api_key})")
                    if len(migration_state["logs"]) > 200:
                        migration_state["logs"] = migration_state["logs"][-200:]
            
            time.sleep(0.02)

        num_threads = min(32, max(8, len(api_keys) * 2))
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = {}
            task_iterator = enumerate(films_to_update)
            
            # Submit initial batch
            for _ in range(num_threads * 4):
                try:
                    task_idx, (list_idx, film) = next(task_iterator)
                    f = executor.submit(process_single_rating, task_idx, list_idx, film)
                    futures[f] = (task_idx, list_idx, film)
                except StopIteration:
                    break
                    
            while futures and not migration_cancel_event.is_set():
                done, _ = concurrent.futures.wait(futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                for f in done:
                    del futures[f]
                    if not migration_cancel_event.is_set():
                        try:
                            task_idx, (list_idx, film) = next(task_iterator)
                            new_f = executor.submit(process_single_rating, task_idx, list_idx, film)
                            futures[new_f] = (task_idx, list_idx, film)
                        except StopIteration:
                            pass
                    
    # Save after Phase 1
    with db_save_lock:
        try:
            safe_save_json(filepath, data)
        except:
            pass

    # 2. Run Avatars Download
    if people_to_download and not migration_cancel_event.is_set():
        migration_state["logs"].append(
            f"[SYSTEM] [Phase 2/2] Downloading {len(people_to_download)} cast & director avatars/bios from TMDb..."
        )
        
        def process_single_avatar(task_idx, person):
            nonlocal processed_avatars, avatars_downloaded_count
            if migration_cancel_event.is_set():
                return
                
            with state_lock:
                migration_state["current_film"] = f"Avatar: {person}"
                
            success, msg = download_avatar_for_person(person, avatars_dir)
            
            if migration_cancel_event.is_set():
                return
                
            with state_lock:
                migration_state["current"] += 1
                processed_avatars += 1
                if success:
                    avatars_downloaded_count += 1
                    migration_state["logs"].append(f"[TMDb] Downloaded avatar for {person}: {msg}")
                else:
                    migration_state["logs"].append(f"[TMDb] Skip/Failed avatar for {person}: {msg}")
                    if any(err in msg.lower() for err in ["403", "429", "forbidden", "too many requests"]):
                        migration_cancel_event.set()
                        migration_state["logs"].append(f"[ERROR] TMDb API/Scraper error: {msg}. Pausing sync to prevent IP ban.")
                if len(migration_state["logs"]) > 200:
                    migration_state["logs"] = migration_state["logs"][-200:]
            
            time.sleep(0.1)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = {}
            task_iterator = enumerate(people_to_download)
            
            # Submit initial batch
            for _ in range(16):
                try:
                    task_idx, person = next(task_iterator)
                    f = executor.submit(process_single_avatar, task_idx, person)
                    futures[f] = person
                except StopIteration:
                    break
                    
            while futures and not migration_cancel_event.is_set():
                done, _ = concurrent.futures.wait(futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                for f in done:
                    del futures[f]
                    if not migration_cancel_event.is_set():
                        try:
                            task_idx, person = next(task_iterator)
                            new_f = executor.submit(process_single_avatar, task_idx, person)
                            futures[new_f] = person
                        except StopIteration:
                            pass

    # Save final database
    with db_save_lock:
        try:
            safe_save_json(filepath, data)
        except Exception as e:
            migration_state["logs"].append(f"[ERROR] Failed to save database final state: {e}")
            
    if migration_cancel_event.is_set():
        migration_state["logs"].append(f"[SYSTEM] Sync paused. Progress saved.")
        migration_state["status"] = "paused"
    else:
        migration_state["logs"].append(
            f"[SYSTEM] Finished Library Sync! Ratings synced: {ratings_updated_count}, Avatars downloaded: {avatars_downloaded_count}."
        )
        migration_state["status"] = "finished"

class GUIHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def do_GET(self):
        if self.path == "/api/lists":
            self.handle_lists()
        elif self.path == "/api/status":
            self.handle_status()
        elif self.path == "/api/migration/status":
            self.handle_migration_status()
        elif self.path.endswith(".json") or ".json?" in self.path:
            self.handle_get_json()
        else:
            # Serve static files from DIRECTORY
            super().do_GET()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        print(f"[GUI Server] Incoming POST request to {self.path}")
        if self.path == "/api/scrape":
            self.handle_scrape()
        elif self.path == "/api/save_harvest":
            self.handle_save_harvest()
        elif self.path == "/api/delete_list":
            self.handle_delete_list()
        elif self.path == "/api/save_assets":
            self.handle_save_assets()
        elif self.path == "/api/migration/start":
            self.handle_migration_start()
        elif self.path == "/api/migration/pause":
            self.handle_migration_pause()
        elif self.path == "/api/avatar/cache":
            self.handle_avatar_cache()
        elif self.path == "/api/studio/cache":
            self.handle_studio_cache()
        elif self.path == "/api/movie/sync":
            self.handle_movie_sync()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_migration_status(self):
        global migration_state
        self.send_json_response(200, migration_state)

    def handle_migration_pause(self):
        global migration_cancel_event
        migration_cancel_event.set()
        self.send_json_response(200, {"success": True, "message": "Migration pausing initiated."})

    def handle_avatar_cache(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            name = payload.get('name')
            url = payload.get('url')
            bio = payload.get('bio')
            tmdb_url = payload.get('tmdb_url')
            imdb_url = payload.get('imdb_url')
            
            if not name:
                self.send_json_response(400, {"error": "Missing name"})
                return
                
            safe_name = "".join(c if c.isalnum() else "_" for c in name.lower())
            while "__" in safe_name:
                safe_name = safe_name.replace("__", "_")
            safe_name = safe_name.strip("_")
            
            avatars_dir = os.path.join(DIRECTORY, "assets", "avatars")
            os.makedirs(avatars_dir, exist_ok=True)
            
            info_file = os.path.join(avatars_dir, f"{safe_name}.json")
            
            # If biography metadata is provided, save or merge it
            if bio is not None or tmdb_url is not None or imdb_url is not None:
                info_data = {}
                if os.path.exists(info_file):
                    try:
                        with open(info_file, 'r', encoding='utf-8') as f:
                            info_data = json.load(f)
                    except:
                        pass
                if bio is not None:
                    info_data["bio"] = bio
                if tmdb_url is not None:
                    info_data["tmdb_url"] = tmdb_url
                if imdb_url is not None:
                    info_data["imdb_url"] = imdb_url
                    
                with open(info_file, 'w', encoding='utf-8') as f_info:
                    json.dump(info_data, f_info, indent=4, ensure_ascii=False)
            
            # Read existing biography info if any
            bio_data = {}
            if os.path.exists(info_file):
                try:
                    with open(info_file, 'r', encoding='utf-8') as f:
                        bio_data = json.load(f)
                except:
                    pass
            
            # Determine extension from url or default to jpg
            ext = ".jpg"
            if url:
                parsed_url = urllib.parse.urlparse(url)
                path_ext = os.path.splitext(parsed_url.path)[1]
                if path_ext in [".jpg", ".jpeg", ".png", ".webp"]:
                    ext = path_ext.lower()
                    if ext == ".jpeg":
                        ext = ".jpg"
                        
            filename = f"{safe_name}{ext}"
            
            # Check if any extension of this name exists to prevent duplicates (e.g. .jpg vs .png)
            existing_file = None
            for e in [".jpg", ".png", ".webp"]:
                candidate = os.path.join(avatars_dir, f"{safe_name}{e}")
                if os.path.exists(candidate):
                    existing_file = f"assets/avatars/{safe_name}{e}"
                    break
                    
            if existing_file:
                resp = {
                    "success": True,
                    "cached": True,
                    "local_url": existing_file
                }
                if bio_data:
                    resp.update(bio_data)
                self.send_json_response(200, resp)
                return
                
            if not url:
                resp = {
                    "success": False,
                    "cached": False,
                    "error": "Not cached and no URL provided"
                }
                if bio_data:
                    resp.update(bio_data)
                    resp["success"] = True  # We have bio text cached, so return success
                self.send_json_response(200 if bio_data else 404, resp)
                return
                
            # Download and save
            filepath = os.path.join(avatars_dir, filename)
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as r:
                with open(filepath, 'wb') as f:
                    f.write(r.read())
                    
            print(f"[GUI Server] Cached avatar for {name} -> {filename}")
            resp = {
                "success": True,
                "cached": False,
                "local_url": f"assets/avatars/{filename}"
            }
            if bio_data:
                resp.update(bio_data)
            self.send_json_response(200, resp)
            
        except Exception as e:
            print(f"[GUI Server] Failed to cache avatar/bio: {e}")
            self.send_json_response(500, {"error": str(e)})

    def handle_studio_cache(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            name = payload.get('name')
            
            if not name:
                self.send_json_response(400, {"error": "Missing name"})
                return
                
            safe_name = "".join(c if c.isalnum() else "_" for c in name.lower())
            while "__" in safe_name:
                safe_name = safe_name.replace("__", "_")
            safe_name = safe_name.strip("_")
            
            studios_dir = os.path.join(DIRECTORY, "assets", "studios")
            os.makedirs(studios_dir, exist_ok=True)
            
            # Check if cached
            existing_file = None
            for e in [".png", ".jpg", ".webp"]:
                candidate = os.path.join(studios_dir, f"{safe_name}{e}")
                if os.path.exists(candidate):
                    existing_file = f"assets/studios/{safe_name}{e}"
                    break
                    
            if existing_file:
                self.send_json_response(200, {
                    "success": True,
                    "cached": True,
                    "local_url": existing_file
                })
                return
                
            success, result = download_logo_for_studio(name, studios_dir)
            if success:
                self.send_json_response(200, {
                    "success": True,
                    "cached": False,
                    "local_url": result
                })
            else:
                self.send_json_response(404, {"error": result})
                
        except Exception as e:
            print(f"[GUI Server] Failed to cache studio logo: {e}")
            self.send_json_response(500, {"error": str(e)})

    def handle_movie_sync(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            filename = payload.get('filename')
            film_title = payload.get('film_title')
            release_year = payload.get('release_year')
            
            if not filename or not film_title:
                self.send_json_response(400, {"error": "Missing filename or film_title"})
                return
                
            filename = os.path.basename(filename)
            
            # Find file folder
            file_path = None
            for folder in SCAN_DIRS:
                candidate = os.path.join(folder, filename)
                if os.path.exists(candidate):
                    file_path = candidate
                    break
                    
            if not file_path:
                self.send_json_response(404, {"error": f"Database file '{filename}' not found on server."})
                return
                
            # Load database file
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Find film
            target_film = None
            for film in data:
                title_match = film.get("Film_title", "").strip().lower() == film_title.strip().lower()
                
                # Compare year (as strings)
                year_match = True
                if release_year:
                    db_year = str(film.get("Release_year", "")).replace(".0", "").strip()
                    req_year = str(release_year).replace(".0", "").strip()
                    if db_year and req_year:
                        year_match = db_year == req_year
                        
                if title_match and year_match:
                    target_film = film
                    break
                    
            if not target_film:
                self.send_json_response(404, {"error": f"Movie '{film_title}' not found in database."})
                return
                
            year_val = str(release_year or target_film.get("Release_year", "")).replace(".0", "").strip()
            
            synced_any = False
            
            # 1. Fetch Rotten Tomatoes score from Algolia
            rt_val = fetch_rt_rating_via_algolia(film_title, year_val)
            if rt_val:
                target_film["Rotten_Tomatoes"] = rt_val
                synced_any = True
                print(f"[Algolia RT] Synced single movie: {film_title} ({year_val}) -> {rt_val}")
                
            # 2. Fetch TMDb details if key is available
            tmdb_keys = load_tmdb_keys()
            tmdb_key = tmdb_keys[0] if tmdb_keys else None
            imdb_id = target_film.get("IMDb_ID")
            
            if tmdb_key:
                tmdb_data = fetch_imdb_id_from_tmdb(film_title, year_val, tmdb_key)
                if tmdb_data:
                    imdb_id = tmdb_data.get("imdb_id")
                    if imdb_id:
                        target_film["IMDb_ID"] = imdb_id
                    enrich_film_from_tmdb_data(target_film, tmdb_data)
                    synced_any = True
                    print(f"[TMDb] Enriched single movie: {film_title} ({year_val})")
            
            # 3. Fetch OMDb details if keys are available
            api_keys = load_omdb_keys()
            omdb_data = None
            if api_keys:
                for key in api_keys:
                    omdb_data = fetch_ratings_from_omdb(film_title, year_val, key, imdb_id=imdb_id)
                    if omdb_data and omdb_data.get("Response") != "False":
                        break
                    if year_val:
                        omdb_data = fetch_ratings_from_omdb(film_title, "", key, imdb_id=imdb_id)
                        if omdb_data and omdb_data.get("Response") != "False":
                            break
                            
                if omdb_data and omdb_data.get("Response") != "False":
                    update_film_from_omdb_data(target_film, omdb_data)
                    # Override OMDb rating if we got a score from Algolia (prefer it)
                    if rt_val:
                        target_film["Rotten_Tomatoes"] = rt_val
                    synced_any = True
                    print(f"[OMDb] Synced single movie ratings: {film_title} ({year_val})")
            
            if synced_any:
                try:
                    sync_people_for_film(target_film)
                except Exception as e:
                    print(f"[GUI Server] People sync failed for '{film_title}': {e}")
                    
                safe_save_json(file_path, data)
                
                self.send_json_response(200, {
                    "success": True,
                    "movie": target_film
                })
            else:
                self.send_json_response(404, {"error": f"No details found for: {film_title} ({year_val}) on RT, TMDb, or OMDb."})
                
        except Exception as e:
            import traceback
            import sys
            print(f"[GUI Server] Movie Sync error: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            self.send_json_response(500, {"error": str(e)})

    def handle_migration_start(self):
        global migration_state, migration_cancel_event, migration_thread
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            filename = payload.get('filename')
            
            if not filename:
                self.send_json_response(400, {"error": "Missing filename"})
                return
                
            filename = os.path.basename(filename)
            
            # Find file folder
            file_folder = None
            for folder in SCAN_DIRS:
                candidate = os.path.join(folder, filename)
                if os.path.exists(candidate):
                    file_folder = folder
                    break
                    
            if not file_folder:
                self.send_json_response(404, {"error": f"File {filename} not found."})
                return
                
            # Check if already running
            if migration_state["status"] == "running" or (migration_thread and migration_thread.is_alive()):
                self.send_json_response(400, {"error": "Migration is already running."})
                return
                
            migration_cancel_event.clear()
            
            sync_ratings = payload.get('sync_ratings', True)
            sync_avatars = payload.get('sync_avatars', True)
            
            # If starting fresh or changing files, reset state
            if migration_state["filename"] != filename or migration_state["status"] in ["idle", "finished"]:
                migration_state["filename"] = filename
                migration_state["current"] = 0
                migration_state["total"] = 0
                migration_state["current_film"] = "Initializing..."
                migration_state["logs"] = [f"[SYSTEM] Starting library sync for {filename}..."]
                
            api_keys = load_omdb_keys()
            migration_state["status"] = "running"
            
            migration_thread = threading.Thread(
                target=run_migration_worker,
                args=(file_folder, filename, api_keys, sync_ratings, sync_avatars)
            )
            migration_thread.daemon = True
            migration_thread.start()
            
            self.send_json_response(200, {"success": True, "message": "Migration started."})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_save_assets(self):
        print("[GUI Server] handle_save_assets started")
        content_length = int(self.headers['Content-Length'])
        print(f"[GUI Server] content_length is {content_length}")
        post_data = self.rfile.read(content_length).decode('utf-8')
        print("[GUI Server] Finished reading post_data")
        
        try:
            payload = json.loads(post_data)
            assets = payload.get('assets', {})
            
            assets_dir = os.path.join(DIRECTORY, "assets")
            os.makedirs(assets_dir, exist_ok=True)
            
            for filename, content in assets.items():
                filename = os.path.basename(filename)
                filepath = os.path.join(assets_dir, filename)
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(content)
                    
            print(f"[GUI Server] Saved {len(assets)} assets successfully to {assets_dir}")
            self.send_json_response(200, {"success": True, "message": "Assets saved successfully"})
        except Exception as e:
            print(f"[GUI Server] Failed to save assets: {e}")
            self.send_json_response(500, {"error": str(e)})

    def handle_delete_list(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            filename = payload.get('filename')
            
            if not filename:
                self.send_json_response(400, {"error": "Missing filename"})
                return
            
            # Secure against directory traversal
            filename = os.path.basename(filename)
            if not filename.endswith('.json'):
                self.send_json_response(400, {"error": "Invalid file format"})
                return
                
            deleted_any = False
            for folder in SCAN_DIRS:
                filepath = os.path.join(folder, filename)
                if os.path.exists(filepath):
                    os.remove(filepath)
                    deleted_any = True
                    print(f"[GUI Server] Deleted file: {filepath}")
                
            if deleted_any:
                self.send_json_response(200, {"success": True, "message": f"List {filename} deleted successfully."})
            else:
                self.send_json_response(404, {"error": f"File {filename} not found in scan directories."})
        except Exception as e:
            print(f"[GUI Server] Failed to delete list: {e}")
            self.send_json_response(500, {"error": str(e)})

    def handle_lists(self):
        # Discover all JSON exports in configured directories
        files = set()
        for folder in SCAN_DIRS:
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.endswith('.json'):
                        files.add(f)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(list(files)).encode('utf-8'))

    def handle_get_json(self):
        # Extract base filename to prevent directory traversal
        clean_path = self.path.split('?')[0]
        filename = os.path.basename(urllib.parse.unquote(clean_path))
        
        # Search all configured scan directories
        file_found = None
        for folder in SCAN_DIRS:
            candidate = os.path.join(folder, filename)
            if os.path.exists(candidate):
                file_found = candidate
                break
                
        if file_found:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with open(file_found, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, f"File {filename} not found in scan directories.")

    def handle_status(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(scrape_progress).encode('utf-8'))

    def handle_scrape(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            params = json.loads(post_data)
            url = params.get('url')
            output_name = params.get('output_name', 'my_list')
            import re
            output_name = re.sub(r'[\\/:*?"<>|]', '_', output_name)
            threads = int(params.get('threads', 4))
            
            if not url:
                self.send_json_response(400, {"error": "Missing URL"})
                return

            # Start scrape in a background thread
            scrape_progress["status"] = "starting"
            scrape_progress["current"] = 0
            scrape_progress["total"] = 0
            scrape_progress["current_film"] = "Initializing scraper..."

            t = threading.Thread(target=run_scraper_task, args=(url, output_name, threads))
            t.daemon = True
            t.start()

            self.send_json_response(200, {"success": True, "message": "Scrape started"})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_save_harvest(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            output_name = payload.get('output_name')
            if not output_name or not isinstance(output_name, str):
                output_name = 'harvested_list'
            
            # Sanitize output_name by removing invalid Windows filename characters
            import re
            output_name = re.sub(r'[\\/:*?"<>|]', '_', output_name)
            
            films_data = payload.get('films', [])
            
            if not output_name.endswith('.json'):
                output_name += '.json'
            
            save_dir = get_save_directory()
            filepath = os.path.join(save_dir, output_name)
            
            safe_save_json(filepath, films_data)
            
            print(f"[GUI Server] Manual harvest saved successfully to: {filepath} ({len(films_data)} films)")
            import sys; sys.stdout.flush()
            self.send_json_response(200, {"success": True, "message": f"Harvest database saved: {output_name}"})
        except Exception as e:
            import traceback
            import sys
            print(f"[GUI Server] Failed to save harvest: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            sys.stdout.flush()
            self.send_json_response(500, {"error": str(e)})

    def send_json_response(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

def run_scraper_task(url, output_name, threads):
    try:
        print(f"\n[GUI Server] Starting scrape: {url} -> {output_name}.json")
        if output_name.endswith(".json"):
            output_name = output_name[:-5]

        save_dir = get_save_directory()

        # Call the existing scraper pipeline directly
        LBscraper = ScrapeInstance(
            inputURLs=[url],
            pages="*",
            output_name=output_name,
            output_path=save_dir,
            output_file_extension=".json",
            infile=None,
            concat=False,
            quiet=False,
            threads=threads
        )
        
        print(f"[GUI Server] Scraped data saved directly to: {os.path.join(save_dir, f'{output_name}.json')}")
        scrape_progress["status"] = "finished"
    except Exception as e:
        print(f"[GUI Server] Error during scraper execution: {e}")
        scrape_progress["status"] = "error"
        scrape_progress["current_film"] = f"Error: {str(e)}"

def start_server():
    server = HTTPServer(("127.0.0.1", PORT), GUIHandler)
    print(f"=====================================================")
    print(f"         OFFLINEBOXD CONTROL CENTER IS ONLINE        ")
    print(f"=====================================================")
    print(f"   -> GUI Control Center:  http://127.0.0.1:{PORT}")
    print(f"   -> Local Data Root:     {DIRECTORY}")
    print(f"=====================================================")
    print(f"Opening your browser to the Control Panel dashboard...")
    
    # Auto-launch default browser
    threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}")).start()
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[GUI Server] Shutting down Control Center...")
        server.server_close()

if __name__ == "__main__":
    start_server()
