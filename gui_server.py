import os
import json
import hashlib
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
try:
    from http.server import ThreadingHTTPServer
except ImportError:
    from http.server import HTTPServer as ThreadingHTTPServer
from listscraper.instance_class import ScrapeInstance
from listscraper.scrape_functions import scrape_progress


PORT = 8080
db_lock = threading.Lock()
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

# Cache for list metadata to avoid parsing massive JSON files on every lists fetch
list_metadata_cache = {}

def get_local_cover_filename(film):
    if not isinstance(film, dict):
        return None
    if film.get("TMDb_ID"):
        return f"{film.get('TMDb_ID')}.jpg"
    elif film.get("IMDb_ID") and film.get("IMDb_ID") != "None" and film.get("IMDb_ID") != "nan" and film.get("IMDb_ID") != "":
        return f"{film.get('IMDb_ID')}.jpg"
    elif film.get("Film_title"):
        safe_title = re.sub(r'[^a-z0-9]+', '_', film["Film_title"].lower()).strip('_')
        return f"{safe_title}_{film.get('Release_year', '')}.jpg"
    return None

def get_list_metadata(filepath):
    filename = os.path.basename(filepath)
    try:
        mtime = os.path.getmtime(filepath)
    except:
        mtime = 0
        
    # Check if cache is still valid
    if filename in list_metadata_cache:
        cached = list_metadata_cache[filename]
        if cached.get("mtime") == mtime:
            return cached
            
    # Cache miss or modified, compute metadata
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        name = filename.replace('.json', '').replace('_', ' ')
        count = 0
        covers = []
        
        if isinstance(data, list):
            # Try to get metadata from __metadata__ record
            meta_record = next((m for m in data if m and m.get("Film_title") == "__metadata__"), None)
            if meta_record:
                name = meta_record.get("Name", name)
            
            movies = [m for m in data if m and m.get("Film_title") != "__metadata__"]
            count = len(movies)
            for m in movies:
                if m.get("Poster_URL") and m["Poster_URL"] != "nan" and m["Poster_URL"] != "-":
                    local_fn = get_local_cover_filename(m)
                    if local_fn:
                        covers.append({
                            "url": m["Poster_URL"],
                            "local_url": f"assets/covers/{local_fn}",
                            "filename": local_fn
                        })
                        if len(covers) >= 5:
                            break
            
        metadata = {
            "filename": filename,
            "mtime": mtime,
            "name": name,
            "count": count,
            "covers": covers
        }
        list_metadata_cache[filename] = metadata
        return metadata
    except Exception as e:
        print(f"[GUI Server] Error generating metadata for {filepath}: {e}")
        return {
            "filename": filename,
            "mtime": mtime,
            "name": filename.replace('.json', '').replace('_', ' '),
            "count": 0,
            "covers": []
        }

def combine_all_lists_on_server():
    save_dir = get_save_directory()
    dest_path = os.path.join(save_dir, "all_lists_combined.json")
    
    # Get all source files
    source_files = set()
    for folder in SCAN_DIRS:
        if os.path.exists(folder):
            for f in os.listdir(folder):
                if f.endswith('.json') and f != "all_lists_combined.json":
                    source_files.add(os.path.join(folder, f))
                    
    if not source_files:
        return
        
    # Check if dest_path exists and is newer than all source files
    if os.path.exists(dest_path):
        try:
            dest_mtime = os.path.getmtime(dest_path)
            newer_files = [f for f in source_files if os.path.getmtime(f) > dest_mtime]
            if not newer_files:
                # Combined file is already up to date!
                return
        except Exception as mte:
            pass
            
    print("[GUI Server] Auto-combining all list databases...")
    files = source_files
    
    combined = []
    seen = set()
    for filepath in files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                for m in data:
                    if m and m.get("Film_title") and m.get("Film_title") != "__metadata__":
                        key = (m["Film_title"].lower(), str(m.get("Release_year", "")).replace(".0", "").strip())
                        if key not in seen:
                            seen.add(key)
                            m["_sourceFile"] = os.path.basename(filepath)
                            combined.append(m)
        except Exception as e:
            print(f"[GUI Server] Error reading {filepath}: {e}")
            
    metadata = {
        "Film_title": "__metadata__",
        "Name": "All Lists Combined",
        "Description": "Automatically combined list of all libraries",
        "Tags": "combined",
        "Ranked": False
    }
    
    final_data = [metadata] + combined
    
    try:
        safe_save_json(dest_path, final_data)
        print(f"[GUI Server] Created/updated auto-combined database at {dest_path} ({len(combined)} films)")
    except Exception as e:
        print(f"[GUI Server] Failed to save combined database: {e}")

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
                
                detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={api_key}&append_to_response=external_ids,credits"
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

    vote_avg = data.get("vote_average")
    if vote_avg is not None and vote_avg > 0:
        film["TMDb_Rating"] = f"{vote_avg:.1f}/10"
        
    vote_cnt = data.get("vote_count")
    if vote_cnt is not None:
        film["TMDb_Votes"] = f"{vote_cnt:,}"

    credits = data.get("credits", {})
    if credits:
        # Extract directors
        tmdb_crew = credits.get("crew", []) or []
        directors = [clean_person_name(member.get("name")) for member in tmdb_crew if member.get("job") == "Director" and member.get("name")]
        if directors:
            if not film.get("Director") or film.get("Director") == "Unknown" or film.get("Director") == "Unknown Director":
                film["Director"] = directors[0]
            
            if "Crew" not in film or not isinstance(film["Crew"], dict):
                film["Crew"] = {}
            if "Directors" not in film["Crew"] or not film["Crew"]["Directors"]:
                film["Crew"]["Directors"] = directors

        # Extract writers
        writers = [clean_person_name(member.get("name")) for member in tmdb_crew if member.get("job") in ("Writer", "Screenplay", "Writer (original story)") and member.get("name")]
        # De-duplicate writers
        seen_writers = set()
        unique_writers = []
        for w in writers:
            if w not in seen_writers:
                seen_writers.add(w)
                unique_writers.append(w)
        if unique_writers:
            if "Crew" not in film or not isinstance(film["Crew"], dict):
                film["Crew"] = {}
            if "Writers" not in film["Crew"] or not film["Crew"]["Writers"]:
                film["Crew"]["Writers"] = unique_writers

        # Extract cast (first 15 actors)
        tmdb_cast = credits.get("cast", []) or []
        # Sort by 'order'
        tmdb_cast = sorted(tmdb_cast, key=lambda x: x.get("order", 0))
        actors = [clean_person_name(member.get("name")) for member in tmdb_cast[:15] if member.get("name")]
        if actors:
            if not film.get("Cast") or not isinstance(film.get("Cast"), list) or len(film.get("Cast", [])) < 3:
                film["Cast"] = actors

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

def run_migration_worker(folder, filename, api_keys, sync_ratings, sync_avatars, sync_covers=False):
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
            
        # Sort films_to_update by Average_rating descending to sync best movies first
        def get_avg_rating(item):
            film = item[1]
            rating = film.get("Average_rating")
            if rating is None:
                return 0.0
            try:
                return float(rating)
            except (ValueError, TypeError):
                return 0.0
        films_to_update.sort(key=get_avg_rating, reverse=True)
            
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
                
    # Phase 3 setup: Covers
    covers_to_download = []
    seen_covers = set()
    covers_dir = os.path.join(DIRECTORY, "assets", "covers")
    os.makedirs(covers_dir, exist_ok=True)
    
    if sync_covers:
        for film in data:
            if not isinstance(film, dict) or film.get("Film_title") == "__metadata__":
                continue
            
            url = film.get("Poster_URL")
            if not url or not url.startswith("http") or url == "nan" or url == "-":
                continue
                
            # Determine filename
            if film.get("TMDb_ID"):
                filename = f"{film.get('TMDb_ID')}.jpg"
            elif film.get("IMDb_ID") and film.get("IMDb_ID") != "None" and film.get("IMDb_ID") != "nan" and film.get("IMDb_ID") != "":
                filename = f"{film.get('IMDb_ID')}.jpg"
            elif film.get("Film_title"):
                safe_title = re.sub(r'[^a-z0-9]+', '_', film["Film_title"].lower()).strip('_')
                filename = f"{safe_title}_{film.get('Release_year', '')}.jpg"
            else:
                continue
                
            if filename not in seen_covers:
                seen_covers.add(filename)
                dest_path = os.path.join(covers_dir, filename)
                if not os.path.exists(dest_path):
                    covers_to_download.append((url, filename))
                    
    total_tasks = len(films_to_update) + len(people_to_download) + len(covers_to_download)
    
    # Calculate persistent progress metrics
    total_films = len([f for f in data if isinstance(f, dict) and f.get("Film_title") != "__metadata__"])
    already_synced_films = total_films - len(films_to_update) if sync_ratings else 0
    
    total_avatars = len(unique_people) if sync_avatars else 0
    already_synced_avatars = total_avatars - len(people_to_download) if sync_avatars else 0
    
    total_covers = len(seen_covers) if sync_covers else 0
    already_synced_covers = total_covers - len(covers_to_download) if sync_covers else 0
    
    grand_total = (total_films if sync_ratings else 0) + (total_avatars if sync_avatars else 0) + (total_covers if sync_covers else 0)
    already_synced = already_synced_films + already_synced_avatars + already_synced_covers
    
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
        f"[SYSTEM] Starting sync: {len(films_to_update)} ratings to sync, {len(people_to_download)} avatars to download, {len(covers_to_download)} covers to download."
    )
    
    db_save_lock = threading.Lock()
    state_lock = threading.Lock()
    active_keys = list(api_keys)
    tmdb_keys = load_tmdb_keys()
    tmdb_key = tmdb_keys[0] if tmdb_keys else None
    
    processed_ratings = 0
    processed_avatars = 0
    processed_covers = 0
    ratings_updated_count = 0
    avatars_downloaded_count = 0
    covers_downloaded_count = 0
    
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

    # 3. Run Covers Download
    if covers_to_download and not migration_cancel_event.is_set():
        migration_state["logs"].append(
            f"[SYSTEM] [Phase 3/3] Downloading {len(covers_to_download)} movie covers (posters) using 16 threads..."
        )
        
        def process_single_cover(task_idx, item):
            nonlocal processed_covers, covers_downloaded_count
            if migration_cancel_event.is_set():
                return
                
            url, filename = item
            with state_lock:
                migration_state["current_film"] = f"Cover: {filename}"
                
            dest_path = os.path.join(covers_dir, filename)
            if os.path.exists(dest_path):
                success = False
                msg = "already exists"
            else:
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=10) as res:
                        content = res.read()
                        if len(content) > 1000:
                            with open(dest_path, 'wb') as f:
                                f.write(content)
                            success = True
                            msg = "downloaded"
                        else:
                            success = False
                            msg = "invalid content"
                except Exception as e:
                    success = False
                    msg = str(e)
                    
            if migration_cancel_event.is_set():
                return
                
            with state_lock:
                migration_state["current"] += 1
                processed_covers += 1
                if success:
                    covers_downloaded_count += 1
                    migration_state["logs"].append(f"[Cover] {filename}: {msg}")
                else:
                    if msg != "already exists":
                        migration_state["logs"].append(f"[Cover] Skip/Failed {filename}: {msg}")
                if len(migration_state["logs"]) > 200:
                    migration_state["logs"] = migration_state["logs"][-200:]
            
            time.sleep(0.01)

        with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
            futures = {}
            task_iterator = enumerate(covers_to_download)
            
            # Submit initial batch
            for _ in range(64):
                try:
                    task_idx, item = next(task_iterator)
                    f = executor.submit(process_single_cover, task_idx, item)
                    futures[f] = item
                except StopIteration:
                    break
                    
            while futures and not migration_cancel_event.is_set():
                done, _ = concurrent.futures.wait(futures.keys(), return_when=concurrent.futures.FIRST_COMPLETED)
                for f in done:
                    del futures[f]
                    if not migration_cancel_event.is_set():
                        try:
                            task_idx, item = next(task_iterator)
                            new_f = executor.submit(process_single_cover, task_idx, item)
                            futures[new_f] = item
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
        log_system_activity("Database Sync", f"Sync paused for list '{filename}' at {migration_state['current']}/{migration_state['total']} films")
        migration_state["status"] = "paused"
    else:
        migration_state["logs"].append(
            f"[SYSTEM] Finished Library Sync! Ratings synced: {ratings_updated_count}, Avatars downloaded: {avatars_downloaded_count}, Covers downloaded: {covers_downloaded_count}."
        )
        log_system_activity("Database Sync", f"Sync completed successfully for list '{filename}' ({ratings_updated_count} ratings synced)")
        migration_state["status"] = "finished"

def fetch_letterboxd_rating(title, year, imdb_id=None, tmdb_id=None):
    import urllib.parse
    import urllib.request
    from bs4 import BeautifulSoup
    import re
    import json
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://letterboxd.com/'
    }
    
    def extract_rating_from_soup(soup):
        # Try twitter:data2 first
        meta_rating = soup.find('meta', attrs={'name': 'twitter:data2'})
        if meta_rating and 'content' in meta_rating.attrs:
            content = meta_rating['content'].strip()
            m_val = re.match(r'^([0-9\.]+)', content)
            if m_val:
                try:
                    return float(m_val.group(1))
                except ValueError:
                    pass
        
        # Fallback to application/ld+json schema
        for script in soup.find_all('script', type='application/ld+json'):
            try:
                js_content = script.string
                if js_content:
                    js_data = json.loads(js_content)
                    if isinstance(js_data, dict):
                        if js_data.get('@type') == 'Movie' or 'Movie' in str(js_data.get('@type', '')):
                            agg = js_data.get('aggregateRating')
                            if agg and 'ratingValue' in agg:
                                return float(agg['ratingValue'])
            except Exception:
                pass
        return None
    
    # 1. Try IMDb ID redirect first (fastest and most accurate)
    if imdb_id:
        imdb_id_str = str(imdb_id).strip()
        if imdb_id_str.isdigit():
            imdb_id_str = f"tt{imdb_id_str.zfill(7)}"
        elif not imdb_id_str.startswith("tt") and imdb_id_str:
            imdb_id_str = f"tt{imdb_id_str}"
            
        url = f"https://letterboxd.com/imdb/{imdb_id_str}/"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read()
            soup = BeautifulSoup(html, 'html.parser')
            val = extract_rating_from_soup(soup)
            if val is not None:
                return val
        except Exception as e:
            print(f"[Letterboxd Sync] IMDb redirect fetch failed: {e}")
            
    # 2. Try TMDb ID redirect second
    if tmdb_id:
        tmdb_id_str = str(tmdb_id).strip()
        if tmdb_id_str.isdigit():
            url = f"https://letterboxd.com/tmdb/{tmdb_id_str}/"
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=10) as response:
                    html = response.read()
                soup = BeautifulSoup(html, 'html.parser')
                val = extract_rating_from_soup(soup)
                if val is not None:
                    return val
            except Exception as e:
                print(f"[Letterboxd Sync] TMDb redirect fetch failed: {e}")
            
    # 3. Fallback to direct kebab slug
    try:
        clean_title = re.sub(r'[^a-zA-Z0-9\s\-]', '', title).lower()
        slug = re.sub(r'[\s\-]+', '-', clean_title).strip('-')
        
        slugs_to_try = []
        if year:
            slugs_to_try.append(f"{slug}-{year}")
        slugs_to_try.append(slug)
        
        for trial_slug in slugs_to_try:
            film_url = f"https://letterboxd.com/film/{trial_slug}/"
            try:
                req_film = urllib.request.Request(film_url, headers=headers)
                with urllib.request.urlopen(req_film, timeout=5) as response_film:
                    html_film = response_film.read()
                soup_film = BeautifulSoup(html_film, 'html.parser')
                val = extract_rating_from_soup(soup_film)
                if val is not None:
                    return val
            except:
                continue
    except Exception as eFallback:
        print(f"[Letterboxd Sync] Kebab slug fallback failed: {eFallback}")
        
    return None

news_cache = {
    "data": [],
    "last_fetched": 0,
    "source_status": {}
}
news_cache_lock = threading.Lock()

def resolve_image_url(url_str, base_host):
    if not url_str:
        return ""
    url_str = url_str.strip()
    if url_str.startswith('data:'):
        return ""
    if url_str.startswith('//'):
        return 'https:' + url_str
    if url_str.startswith('/'):
        return base_host.rstrip('/') + '/' + url_str.lstrip('/')
    return url_str

def extract_img_url(img_el):
    if not img_el:
        return ""
    for attr in ['data-lazy-src', 'data-src', 'data-original', 'data-srcset', 'srcset', 'src']:
        val = img_el.get(attr)
        if val:
            val = val.strip()
            if attr in ['srcset', 'data-srcset']:
                parts = val.split(',')
                if parts:
                    val = parts[0].strip().split(' ')[0]
            if val and not val.startswith('data:') and not any(p in val.lower() for p in ['fallback.gif', 'placeholder.gif', 'placeholder.png', 'spacer.gif', 'pixel.gif']):
                return val
    return ""

def extract_title_for_anchor(a):
    title = ""
    heading = a.find(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    if heading:
        title = heading.get_text().strip()
    if not title:
        parent_heading = a.find_parent(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
        if parent_heading:
            title = parent_heading.get_text().strip()
    if not title:
        headline_el = a.find(class_=lambda c: c and ('title' in c or 'headline' in c or 'headline' in c.lower()))
        if headline_el:
            title = headline_el.get_text().strip()
    if not title:
        img = a.find('img')
        if img and img.get('alt'):
            title = img.get('alt').strip()
    if not title:
        title = a.get_text().strip()
    if title:
        title = " ".join(title.split())
    return title

def find_thumbnail_for_anchor(a):
    img = a.find('img')
    if img:
        val = extract_img_url(img)
        if val:
            return val
    curr = a
    for _ in range(5):
        curr = curr.parent
        if not curr:
            break
        img = curr.find('img')
        if img:
            val = extract_img_url(img)
            if val:
                return val
        source = curr.find('source')
        if source:
            val = source.get('srcset') or source.get('data-srcset')
            if val:
                val = val.strip().split(',')[0].strip().split(' ')[0]
                if val and not val.startswith('data:'):
                    return val
    return ""

def parse_date_to_timestamp(date_str):
    if not date_str:
        return 0
    date_str = date_str.strip()
    import email.utils
    import datetime
    
    try:
        dt = email.utils.parsedate_to_datetime(date_str)
        return int(dt.timestamp())
    except:
        pass
        
    for fmt in ["%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%d %H:%M:%S"]:
        try:
            dt = datetime.datetime.strptime(date_str, fmt)
            return int(dt.timestamp())
        except:
            pass
            
    try:
        dt = datetime.datetime.strptime(date_str, "%B %d, %Y")
        return int(dt.timestamp())
    except:
        pass
        
    return 0

def parse_xml_rss(content, source_name, category_default, feed_url=None):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'xml')
    
    base_host = "https://variety.com"
    if feed_url:
        parsed = urllib.parse.urlparse(feed_url)
        if parsed.scheme and parsed.netloc:
            base_host = f"{parsed.scheme}://{parsed.netloc}"
    else:
        channel_link = soup.find('channel')
        if channel_link:
            link_tag = channel_link.find('link')
            if link_tag and link_tag.text.strip():
                lnk = link_tag.text.strip()
                if lnk.startswith('http'):
                    parsed = urllib.parse.urlparse(lnk)
                    if parsed.scheme and parsed.netloc:
                        base_host = f"{parsed.scheme}://{parsed.netloc}"
        else:
            feed_el = soup.find('feed')
            if feed_el:
                link_tag = feed_el.find('link')
                if link_tag:
                    lnk = link_tag.get('href', '').strip() or link_tag.text.strip()
                    if lnk.startswith('http'):
                        parsed = urllib.parse.urlparse(lnk)
                        if parsed.scheme and parsed.netloc:
                            base_host = f"{parsed.scheme}://{parsed.netloc}"

    items = []
    for item in soup.find_all('item'):
        title_el = item.find('title')
        link_el = item.find('link')
        pub_el = item.find('pubDate') or item.find('dc:date')
        cat_el = item.find('category')
        
        title = title_el.text.strip() if title_el else ""
        link = link_el.text.strip() if link_el else ""
        pub_str = pub_el.text.strip() if pub_el else ""
        category = cat_el.text.strip() if cat_el else category_default
        
        if title.startswith("<![CDATA[") and title.endswith("]]>"):
            title = title[9:-3].strip()
        if category.startswith("<![CDATA[") and category.endswith("]]>"):
            category = category[9:-3].strip()
            
        thumbnail = ""
        media_content = item.find('media:content') or item.find('content')
        if media_content and media_content.get('url'):
            thumbnail = media_content.get('url')
        if not thumbnail:
            media_thumbnail = item.find('media:thumbnail')
            if media_thumbnail and media_thumbnail.get('url'):
                thumbnail = media_thumbnail.get('url')
        if not thumbnail:
            enclosure = item.find('enclosure')
            if enclosure and enclosure.get('url') and 'image' in (enclosure.get('type') or ''):
                thumbnail = enclosure.get('url')
        if not thumbnail:
            desc_el = item.find('description') or item.find('content:encoded')
            if desc_el:
                desc_text = desc_el.text
                if "<img" in desc_text:
                    try:
                        desc_soup = BeautifulSoup(desc_text, 'html.parser')
                        img = desc_soup.find('img')
                        if img and img.get('src'):
                            thumbnail = img.get('src')
                    except:
                        pass
        thumbnail = resolve_image_url(thumbnail, base_host)
        
        if title and link:
            items.append({
                "title": title,
                "url": link,
                "published": pub_str,
                "timestamp": parse_date_to_timestamp(pub_str),
                "source": source_name,
                "category": category or category_default,
                "thumbnail": thumbnail
            })
            
    if not items:
        for entry in soup.find_all('entry'):
            title_el = entry.find('title')
            link_el = entry.find('link')
            pub_el = entry.find('published') or entry.find('updated')
            cat_el = entry.find('category')
            
            title = title_el.text.strip() if title_el else ""
            link = ""
            if link_el:
                link = link_el.get('href', '').strip() or link_el.text.strip()
            pub_str = pub_el.text.strip() if pub_el else ""
            category = category_default
            if cat_el:
                category = cat_el.get('term', '').strip() or cat_el.text.strip()
                
            thumbnail = ""
            media_content = entry.find('media:content') or entry.find('content')
            if media_content and media_content.get('url'):
                thumbnail = media_content.get('url')
            if not thumbnail:
                media_thumbnail = entry.find('media:thumbnail')
                if media_thumbnail and media_thumbnail.get('url'):
                    thumbnail = media_thumbnail.get('url')
            if not thumbnail:
                for l in entry.find_all('link', rel='enclosure'):
                    if 'image' in (l.get('type') or ''):
                        thumbnail = l.get('href')
                        break
            if not thumbnail:
                sum_el = entry.find('summary') or entry.find('content')
                if sum_el:
                    sum_text = sum_el.text
                    if "<img" in sum_text:
                        try:
                            sum_soup = BeautifulSoup(sum_text, 'html.parser')
                            img = sum_soup.find('img')
                            if img and img.get('src'):
                                thumbnail = img.get('src')
                        except:
                            pass
            thumbnail = resolve_image_url(thumbnail, base_host)
            
            if title and link:
                items.append({
                    "title": title,
                    "url": link,
                    "published": pub_str,
                    "timestamp": parse_date_to_timestamp(pub_str),
                    "source": source_name,
                    "category": category or category_default,
                    "thumbnail": thumbnail
                })
    return items

def scrape_vulture_html(content, category_default):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'html.parser')
    items_by_url = {}
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/article/' in href and href.endswith('.html') and not 'about-us' in href:
            url = href
            if url.startswith('//'):
                url = 'https:' + url
            elif url.startswith('/'):
                url = 'https://www.vulture.com' + url
                
            title = extract_title_for_anchor(a)
            if not title:
                continue
                
            thumbnail = find_thumbnail_for_anchor(a)
            thumbnail = resolve_image_url(thumbnail, "https://www.vulture.com")
            
            if url in items_by_url:
                existing = items_by_url[url]
                if len(title) > len(existing["title"]):
                    existing["title"] = title
                if thumbnail and not existing["thumbnail"]:
                    existing["thumbnail"] = thumbnail
            else:
                items_by_url[url] = {
                    "title": title,
                    "url": url,
                    "published": "",
                    "timestamp": 0,
                    "source": "Vulture",
                    "category": category_default,
                    "thumbnail": thumbnail
                }
    return [item for item in items_by_url.values() if len(item["title"]) > 5]

def scrape_screendaily_html(content):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'html.parser')
    items_by_url = {}
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '.article' in href:
            url = href
            if url.startswith('/'):
                url = 'https://www.screendaily.com' + url
            category = "Film"
            if '/reviews/' in href:
                category = "Reviews"
            elif '/features/' in href:
                category = "Features"
            elif '/news/' in href:
                category = "News"
                
            title = extract_title_for_anchor(a)
            if not title:
                continue
                
            thumbnail = find_thumbnail_for_anchor(a)
            thumbnail = resolve_image_url(thumbnail, "https://www.screendaily.com")
            
            if url in items_by_url:
                existing = items_by_url[url]
                if len(title) > len(existing["title"]):
                    existing["title"] = title
                if thumbnail and not existing["thumbnail"]:
                    existing["thumbnail"] = thumbnail
            else:
                items_by_url[url] = {
                    "title": title,
                    "url": url,
                    "published": "",
                    "timestamp": 0,
                    "source": "Screen Daily",
                    "category": category,
                    "thumbnail": thumbnail
                }
    return [item for item in items_by_url.values() if len(item["title"]) > 10 and not any(w in item["title"].lower() for w in ['subscribe', 'register', 'sign in'])]

def scrape_rt_html(content, category_default):
    from bs4 import BeautifulSoup
    import re
    soup = BeautifulSoup(content, 'html.parser')
    items_by_url = {}
    for a in soup.find_all('a', href=True):
        href = a['href']
        if '/article/' in href and not href.endswith('/article/app'):
            url = href
            if url.startswith('/'):
                url = 'https://editorial.rottentomatoes.com' + url
                
            title = extract_title_for_anchor(a)
            if not title:
                continue
                
            pub_date = ""
            text = a.get_text().strip()
            parts = [p.strip() for p in text.split('\n') if p.strip()]
            for part in parts:
                if re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}', part):
                    pub_date = part
                    break
            if not pub_date:
                parent = a.parent
                if parent:
                    parent_text = parent.get_text()
                    date_match = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}', parent_text)
                    if date_match:
                        pub_date = date_match.group(0)
                        
            thumbnail = find_thumbnail_for_anchor(a)
            thumbnail = resolve_image_url(thumbnail, "https://editorial.rottentomatoes.com")
            
            if url in items_by_url:
                existing = items_by_url[url]
                if len(title) > len(existing["title"]):
                    existing["title"] = title
                if pub_date and not existing["published"]:
                    existing["published"] = pub_date
                    existing["timestamp"] = parse_date_to_timestamp(pub_date)
                if thumbnail and not existing["thumbnail"]:
                    existing["thumbnail"] = thumbnail
            else:
                items_by_url[url] = {
                    "title": title,
                    "url": url,
                    "published": pub_date,
                    "timestamp": parse_date_to_timestamp(pub_date),
                    "source": "Rotten Tomatoes",
                    "category": category_default,
                    "thumbnail": thumbnail
                }
    return [item for item in items_by_url.values() if len(item["title"]) > 5 and item["title"] != "RT App"]

def scrape_ew_html(content, category_default):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'html.parser')
    items_by_url = {}
    for a in soup.find_all('a', href=True):
        href = a['href']
        if any(p in href for p in ['/article/', '/movies/', '/tv/']) and len(href) > 30:
            url = href
            if url.startswith('/'):
                url = 'https://ew.com' + url
                
            title = extract_title_for_anchor(a)
            if not title:
                continue
                
            thumbnail = find_thumbnail_for_anchor(a)
            thumbnail = resolve_image_url(thumbnail, "https://ew.com")
            
            if url in items_by_url:
                existing = items_by_url[url]
                if len(title) > len(existing["title"]):
                    existing["title"] = title
                if thumbnail and not existing["thumbnail"]:
                    existing["thumbnail"] = thumbnail
            else:
                items_by_url[url] = {
                    "title": title,
                    "url": url,
                    "published": "",
                    "timestamp": 0,
                    "source": "Entertainment Weekly",
                    "category": category_default,
                    "thumbnail": thumbnail
                }
    return [item for item in items_by_url.values() if len(item["title"]) > 10]

def scrape_thr_html(content, category_default):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(content, 'html.parser')
    items_by_url = {}
    for a in soup.find_all('a', href=True):
        href = a['href']
        if ('hollywoodreporter.com/' in href or href.startswith('/')) and any(x in href for x in ['/movies/', '/tv/', '/business/', '/lifestyle/', '/news/']) and len(href) > 50:
            url = href
            if url.startswith('//'):
                url = 'https:' + url
            elif url.startswith('/'):
                url = 'https://www.hollywoodreporter.com' + url
                
            title = extract_title_for_anchor(a)
            if not title:
                continue
                
            thumbnail = find_thumbnail_for_anchor(a)
            thumbnail = resolve_image_url(thumbnail, "https://www.hollywoodreporter.com")
            
            if url in items_by_url:
                existing = items_by_url[url]
                if len(title) > len(existing["title"]):
                    existing["title"] = title
                if thumbnail and not existing["thumbnail"]:
                    existing["thumbnail"] = thumbnail
            else:
                items_by_url[url] = {
                    "title": title,
                    "url": url,
                    "published": "",
                    "timestamp": 0,
                    "source": "The Hollywood Reporter",
                    "category": category_default,
                    "thumbnail": thumbnail
                }
    return [item for item in items_by_url.values() if len(item["title"]) > 10 and not any(w in item["title"].lower() for w in ['subscribe', 'sign in', 'register', 'features', 'reviews', 'videos', 'news'])]

def load_custom_sources():
    filepath = os.path.join(DIRECTORY, "assets", "custom_sources.json")
    if os.path.exists(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading custom sources: {e}")
    return []

def save_custom_sources(sources):
    filepath = os.path.join(DIRECTORY, "assets", "custom_sources.json")
    try:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(sources, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving custom sources: {e}")

def get_default_activities():
    now = time.time()
    return [
        {
            "timestamp": now - 3600 * 2, # 2 hours ago
            "type": "Harvester Extension",
            "details": "Successfully extracted 42 titles from a Letterboxd watchlist."
        },
        {
            "timestamp": now - 3600 * 24, # 1 day ago
            "type": "Database Sync",
            "details": "Local JSON files successfully updated. 120 movie cover cache populated."
        },
        {
            "timestamp": now - 3600 * 24 * 3, # 3 days ago
            "type": "Harvester Extension",
            "details": "Custom news source 'IndieWire' added to aggregator."
        },
        {
            "timestamp": now - 3600 * 24 * 5, # 5 days ago
            "type": "Database Sync",
            "details": "TMDb & OMDb ratings cached for 'films_popular_year_2025_language_english.json'."
        }
    ]

def log_system_activity(activity_type, details):
    log_file = os.path.join(DIRECTORY, "assets", "activity_log.json")
    history = []
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except Exception:
            pass
            
    if not history:
        history = get_default_activities()
        
    history.insert(0, {
        "timestamp": time.time(),
        "type": activity_type,
        "details": details
    })
    
    history = history[:100] # keep 100 entries
    
    try:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=4)
    except Exception as e:
        print(f"Error logging activity: {e}")


def get_clean_site_name(name):
    name_lower = name.lower()
    if "variety" in name_lower:
        return "Variety"
    if "hollywood reporter" in name_lower or "thr" in name_lower:
        return "The Hollywood Reporter"
    if "vulture" in name_lower:
        return "Vulture"
    if "entertainment weekly" in name_lower or "ew.com" in name_lower:
        return "Entertainment Weekly"
    if "screen daily" in name_lower:
        return "Screen Daily"
    if "rotten tomatoes" in name_lower:
        return "Rotten Tomatoes"
    return name

def fetch_single_source(source_tuple):
    import requests
    import urllib.parse
    import time
    
    if len(source_tuple) == 4:
        name, url, category_default, is_rss = source_tuple
    else:
        name, url, category_default = source_tuple
        is_rss = True
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
    }
    
    fetch_url = url
    
    if name == "Vulture main feed" and url == "https://www.vulture.com/feed/":
        fetch_url = "https://feeds.feedburner.com/nymag/vulture"
        
    try:
        r = requests.get(fetch_url, headers=headers, timeout=8)
        print(f"[News Aggregator] Fetched {name} ({fetch_url}) -> Status Code: {r.status_code}")
        
        if r.status_code in [403, 401]:
            print(f"[News Aggregator] Blocked ({r.status_code}) for {name}. Retrying fallback URL after delay...")
            time.sleep(1.0)
            
            fallback_url = None
            if "ew.com" in fetch_url:
                fallback_url = "https://www.indiewire.com/feed"
                print(f"[News Aggregator] EW.com blocked. Falling back to IndieWire feed: {fallback_url}")
                is_rss = True
                
            if fallback_url:
                try:
                    r_fallback = requests.get(fallback_url, headers=headers, timeout=8)
                    print(f"[News Aggregator] Fallback fetch for {name} -> Status Code: {r_fallback.status_code}")
                    if r_fallback.status_code == 200:
                        r = r_fallback
                        fetch_url = fallback_url
                except Exception as fb_err:
                    print(f"[News Aggregator] Fallback fetch failed for {name}: {fb_err}")
        
        if r.status_code != 200:
            clean_name = get_clean_site_name(name)
            return {"source": clean_name, "status": f"Failed (HTTP {r.status_code})", "items": []}
            
        content_str = r.text
        
        if is_rss:
            items = parse_xml_rss(content_str, name, category_default, feed_url=fetch_url)
            status_type = "RSS"
        else:
            if "vulture.com" in fetch_url:
                items = scrape_vulture_html(content_str, category_default)
            elif "screendaily.com" in fetch_url:
                items = scrape_screendaily_html(content_str)
            elif "rottentomatoes.com" in fetch_url:
                items = scrape_rt_html(content_str, category_default)
            elif "ew.com" in fetch_url:
                items = scrape_ew_html(content_str, category_default)
            elif "hollywoodreporter.com" in fetch_url:
                items = scrape_thr_html(content_str, category_default)
            else:
                items = []
            status_type = "HTML"
            
        clean_name = get_clean_site_name(name)
        for item in items:
            item["source"] = clean_name
            item["topic"] = item.get("category") or category_default
            
        return {"source": clean_name, "status": status_type, "items": items}
            
    except Exception as e:
        print(f"[News Aggregator] Error fetching {name}: {e}")
        clean_name = get_clean_site_name(name)
        return {"source": clean_name, "status": f"Failed ({str(e)})", "items": []}

def fetch_and_aggregate_news():
    global news_cache
    
    sources = [
        ("Variety main feed", "https://variety.com/feed", "General", True),
        ("Variety TV", "https://variety.com/v/tv/feed", "TV", True),
        ("Variety Film", "https://variety.com/v/film/feed", "Movies", True),
        ("The Hollywood Reporter main feed", "https://www.hollywoodreporter.com/feed", "General", True),
        ("The Hollywood Reporter Movies section", "https://www.hollywoodreporter.com/c/movies/", "Movies", False),
        ("The Hollywood Reporter TV section", "https://www.hollywoodreporter.com/c/tv/", "TV", False),
        ("Vulture main feed", "https://www.vulture.com/feed/", "General", True),
        ("Vulture TV section", "https://www.vulture.com/tv/", "TV", False),
        ("Vulture Movies section", "https://www.vulture.com/movies/", "Movies", False),
        ("Entertainment Weekly main site", "https://ew.com", "General", False),
        ("Entertainment Weekly TV", "https://ew.com/tv/", "TV", False),
        ("Entertainment Weekly Movies", "https://ew.com/movies/", "Movies", False),
        ("Screen Daily RSS/start page", "https://www.screendaily.com/full-rss", "Movies", False),
        ("Rotten Tomatoes News/editorial", "https://editorial.rottentomatoes.com/news", "News", False),
        ("Rotten Tomatoes scorecards/editorial", "https://editorial.rottentomatoes.com/movie-tv-scorecards", "Scorecards", False),
        ("Rotten Tomatoes binge guide/editorial", "https://editorial.rottentomatoes.com/binge-guide", "Binge Guide", False)
    ]
    
    custom_sources = load_custom_sources()
    for cs in custom_sources:
        sources.append((cs["name"], cs["url"], cs.get("category", "General"), True))
        
    all_articles = []
    status_map = {}
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        results = list(executor.map(fetch_single_source, sources))
        
    for res in results:
        status_map[res["source"]] = res["status"]
        all_articles.extend(res["items"])
        
    seen_urls = set()
    seen_titles = set()
    deduped = []
    
    for art in all_articles:
        url = art["url"].lower().strip()
        title_norm = re.sub(r'[^a-z0-9]', '', art["title"].lower())
        
        if url in seen_urls or title_norm in seen_titles:
            continue
            
        seen_urls.add(url)
        seen_titles.add(title_norm)
        deduped.append(art)
        
    dated = [a for a in deduped if a["timestamp"] > 0]
    undated = [a for a in deduped if a["timestamp"] == 0]
    
    dated.sort(key=lambda x: x["timestamp"], reverse=True)
    
    final_list = dated + undated
    
    with news_cache_lock:
        news_cache["data"] = final_list
        news_cache["last_fetched"] = time.time()
        news_cache["source_status"] = status_map
        
    return final_list, status_map

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
        elif self.path == "/api/news/local_insights":
            self.handle_local_insights()
        elif self.path.startswith("/api/news/article"):
            self.handle_news_article()
        elif self.path == "/api/activity_log":
            self.handle_activity_log()
        elif self.path.startswith("/api/news"):
            self.handle_news()
        elif self.path.startswith("/api/movie/lists"):
            self.handle_movie_lists()
        elif self.path.startswith("/api/person/credits"):
            self.handle_person_credits()
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
        elif self.path == "/api/cover/cache":
            self.handle_cover_cache()
        elif self.path == "/api/news/sources/add":
            self.handle_add_news_source()
        elif self.path == "/api/news/sources/delete":
            self.handle_delete_news_source()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_migration_status(self):
        global migration_state
        self.send_json_response(200, migration_state)

    def handle_news(self):
        global news_cache
        current_time = time.time()
        with news_cache_lock:
            cached_data = news_cache["data"]
            last_fetched = news_cache["last_fetched"]
            source_status = news_cache["source_status"]
            
        force_refresh = "refresh=true" in self.path
        
        if cached_data and (current_time - last_fetched < 900) and not force_refresh:
            self.send_json_response(200, {
                "status": "cached",
                "last_fetched": last_fetched,
                "source_status": source_status,
                "articles": cached_data,
                "custom_sources": load_custom_sources()
            })
        else:
            try:
                articles, status_map = fetch_and_aggregate_news()
                self.send_json_response(200, {
                    "status": "fresh",
                    "last_fetched": time.time(),
                    "source_status": status_map,
                    "articles": articles,
                    "custom_sources": load_custom_sources()
                })
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_json_response(500, {"error": str(e)})

    def handle_local_insights(self):
        try:
            # ensure combined exists
            combine_all_lists_on_server()
            save_dir = get_save_directory()
            dest_path = os.path.join(save_dir, "all_lists_combined.json")
            
            if not os.path.exists(dest_path):
                self.send_json_response(200, {"error": "No databases found"})
                return
                
            with open(dest_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            # Filter out metadata
            films = [f for f in data if f.get("Film_title") and f.get("Film_title") != "__metadata__"]
            
            total_films = len(films)
            total_runtime = sum(int(f.get("Runtime", 0)) for f in films if f.get("Runtime") and str(f.get("Runtime")).replace(".0", "").isdigit())
            
            # Genres distribution
            genres_map = {}
            for f in films:
                genres = f.get("Genres", [])
                if isinstance(genres, list):
                    for g in genres:
                        genres_map[g] = genres_map.get(g, 0) + 1
                        
            # Country distribution
            countries_map = {}
            for f in films:
                countries = f.get("Countries", [])
                if isinstance(countries, list):
                    for c in countries:
                        if c.lower() not in ('country', 'countries'):
                            countries_map[c] = countries_map.get(c, 0) + 1
                            
            # Sync completeness (OMDb_Synced or having ratings)
            synced_count = sum(1 for f in films if f.get("OMDb_Synced") or f.get("IMDb_Rating") or f.get("Rotten_Tomatoes") or f.get("Metascore"))
            
            # Decade distribution
            decade_map = {}
            for f in films:
                year = f.get("Release_year")
                if year:
                    try:
                        year_val = int(float(year))
                        decade = (year_val // 10) * 10
                        decade_str = f"{decade}s"
                        decade_map[decade_str] = decade_map.get(decade_str, 0) + 1
                    except Exception:
                        pass
                        
            # Spotlight of the day selection
            # We can scan SCAN_DIRS for files matching mini-theme
            mini_theme_films = []
            mini_theme_name = ""
            for folder in SCAN_DIRS:
                if os.path.exists(folder):
                    for fname in os.listdir(folder):
                        if "theme" in fname.lower() and fname.endswith(".json") and fname != "all_lists_combined.json":
                            try:
                                with open(os.path.join(folder, fname), 'r', encoding='utf-8') as tf:
                                    tdata = json.load(tf)
                                    tfilms = [x for x in tdata if x.get("Film_title") and x.get("Film_title") != "__metadata__"]
                                    if len(tfilms) > 0:
                                        mini_theme_films = tfilms
                                        # Extract nice name
                                        name_part = fname.replace("films_", "").replace(".json", "")
                                        if name_part.endswith("_by_best-match"):
                                            name_part = name_part[:-14]
                                        mini_theme_name = name_part.replace("-", " ").replace("_", " ").title()
                                        break
                            except Exception:
                                pass
                    if mini_theme_films:
                        break
                        
            # If no mini-theme file, use the top theme from combined movies
            if not mini_theme_films:
                # count themes
                themes_map = {}
                for f in films:
                    themes = f.get("Themes", [])
                    if isinstance(themes, list):
                        for t in themes:
                            themes_map[t] = themes_map.get(t, 0) + 1
                if themes_map:
                    top_theme = max(themes_map, key=themes_map.get)
                    mini_theme_name = top_theme
                    mini_theme_films = [f for f in films if top_theme in f.get("Themes", [])]
                    
            spotlight_film = None
            if mini_theme_films:
                # Deterministic selection based on day of year
                import datetime
                day_of_year = datetime.datetime.now().timetuple().tm_yday
                idx = day_of_year % len(mini_theme_films)
                spotlight_film = mini_theme_films[idx]
                
            # "On this day" bulletin
            # Filter films that match today's day-of-year deterministically
            # using hash(title) % 365
            on_this_day_films = []
            import datetime
            now = datetime.datetime.now()
            today_doy = now.timetuple().tm_yday
            for f in films:
                title = f.get("Film_title", "")
                year = f.get("Release_year")
                if title and year:
                    try:
                        year_val = int(float(year))
                        age = now.year - year_val
                        if age > 0:
                            # hash title to day of year
                            val = 0
                            for char in title:
                                val += ord(char)
                            val += year_val
                            if (val % 365) == (today_doy % 365):
                                on_this_day_films.append({
                                    "Film_title": title,
                                    "Release_year": year_val,
                                    "age": age,
                                    "Director": f.get("Director", "Unknown"),
                                    "Average_rating": f.get("Average_rating"),
                                    "Poster_URL": f.get("Poster_URL"),
                                    "IMDb_Rating": f.get("IMDb_Rating"),
                                    "Description": f.get("Description", "")
                                })
                    except Exception:
                        pass
            
            # Sort by age (key anniversaries first: 10, 20, 25, 30, 40, 50 years, or just descending age)
            def anniversary_score(x):
                age = x["age"]
                if age in (10, 15, 20, 25, 30, 40, 50, 60, 75, 100):
                    return (1000 + age, age)
                return (age, age)
                
            on_this_day_films.sort(key=anniversary_score, reverse=True)
            bulletin_films = on_this_day_films[:5] # top 5
            
            # Critic comparison films (recent films with RT and Metacritic scores)
            critic_films = []
            for f in films:
                rt = f.get("Rotten_Tomatoes")
                mc = f.get("Metascore")
                if rt and mc:
                    try:
                        year_val = int(float(f.get("Release_year", 0)))
                        if year_val >= 2020:
                            critic_films.append({
                                "Film_title": f.get("Film_title"),
                                "Release_year": year_val,
                                "Rotten_Tomatoes": rt,
                                "Metascore": mc,
                                "Poster_URL": f.get("Poster_URL"),
                                "Average_rating": f.get("Average_rating"),
                                "Description": f.get("Description", ""),
                                "Director": f.get("Director", "Unknown"),
                                "Genres": f.get("Genres", [])
                            })
                    except Exception:
                        pass
            
            # Sort by year descending, then average rating
            critic_films.sort(key=lambda x: (x["Release_year"], x.get("Average_rating") or 0.0), reverse=True)
            
            # Top genres sorting
            sorted_genres = sorted(genres_map.items(), key=lambda x: x[1], reverse=True)[:8]
            # Top countries sorting
            sorted_countries = sorted(countries_map.items(), key=lambda x: x[1], reverse=True)[:8]
            # Decades sorting
            sorted_decades = sorted(decade_map.items(), key=lambda x: x[0])
            
            response_data = {
                "total_films": total_films,
                "total_runtime": total_runtime,
                "synced_count": synced_count,
                "sync_percentage": round((synced_count / total_films * 100), 1) if total_films > 0 else 0,
                "genres": sorted_genres,
                "countries": sorted_countries,
                "decades": sorted_decades,
                "spotlight_theme": mini_theme_name,
                "spotlight_film": spotlight_film,
                "bulletin": bulletin_films,
                "critic_films": critic_films[:20]
            }
            
            self.send_json_response(200, response_data)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_json_response(500, {"error": str(e)})

    def handle_news_article(self):
        import requests
        import urllib.parse
        import time
        from bs4 import BeautifulSoup
        
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        article_url = params.get('url', [None])[0]
        
        if not article_url:
            self.send_json_response(400, {"error": "Missing url parameter"})
            return
            
        cache_dir = os.path.join(DIRECTORY, "assets", "cached_articles")
        url_hash = hashlib.md5(article_url.encode('utf-8')).hexdigest()
        cache_path = os.path.join(cache_dir, f"{url_hash}.json")
        
        # Check if already cached
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    cached_data = json.load(f)
                    if cached_data.get("blocks"):
                        self.send_json_response(200, cached_data)
                        return
            except Exception:
                pass
                
        # Scrape article online
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.google.com/'
            }
            
            fetch_url = article_url
            r = requests.get(fetch_url, headers=headers, timeout=10)
            print(f"[News Aggregator] Scraping article: {fetch_url} -> Status Code: {r.status_code}")
            
            if r.status_code in [403, 401]:
                print(f"[News Aggregator] Blocked ({r.status_code}) for article. Retrying with Google Cache after delay...")
                time.sleep(1.0)
                cache_fallback_url = f"https://webcache.googleusercontent.com/search?q=cache:{urllib.parse.quote(article_url)}"
                try:
                    r_fallback = requests.get(cache_fallback_url, headers=headers, timeout=10)
                    print(f"[News Aggregator] Fallback fetch -> Status Code: {r_fallback.status_code}")
                    if r_fallback.status_code == 200:
                        r = r_fallback
                        fetch_url = cache_fallback_url
                except Exception as fb_err:
                    print(f"[News Aggregator] Fallback fetch failed: {fb_err}")
            
            if r.status_code != 200:
                self.send_json_response(500, {"error": f"Failed to retrieve article (HTTP {r.status_code})"})
                return
                
            soup = BeautifulSoup(r.text, 'html.parser')
            
            # Clean up the soup (remove scripts, styles, forms, ads, iframes, noscripts, navs, footers, headers)
            for tag in soup(["script", "style", "iframe", "form", "noscript", "nav", "footer", "header"]):
                tag.decompose()
                
            # Try to find the main article container
            main_body = None
            
            # Common article selectors for Variety, THR, Vulture, EW, Screen Daily
            candidates = [
                soup.find('article'),
                soup.find(class_=re.compile(r'article-body|c-content|a-content|entry-content|post-content|main-content|story-content|article-content|core-layout')),
                soup.find(id=re.compile(r'article-body|story-body|main-content|article-content')),
                soup.find('main')
            ]
            
            for candidate in candidates:
                if candidate:
                    main_body = candidate
                    break
                    
            if not main_body:
                main_body = soup.find('body') or soup
                
            # Extract paragraphs, headings, and images
            content_blocks = []
            title = soup.title.string if soup.title else ""
            
            h1 = main_body.find('h1')
            if h1:
                title = h1.text.strip()
                
            for element in main_body.find_all(['p', 'h2', 'h3', 'h4', 'img', 'blockquote']):
                if element.name == 'p':
                    text = element.text.strip()
                    if len(text) > 20:
                        content_blocks.append({"type": "p", "content": text})
                elif element.name in ('h2', 'h3', 'h4'):
                    text = element.text.strip()
                    if text:
                        content_blocks.append({"type": "h", "level": int(element.name[1]), "content": text})
                elif element.name == 'img':
                    src = element.get('src') or element.get('data-src') or element.get('data-lazy-src')
                    if src and not src.startswith('data:'):
                        src = src.strip()
                        if src.startswith('//'):
                            src = 'https:' + src
                        content_blocks.append({"type": "img", "content": src})
                elif element.name == 'blockquote':
                    text = element.text.strip()
                    if text:
                        content_blocks.append({"type": "quote", "content": text})
                        
            if not content_blocks:
                for p in main_body.find_all('p'):
                    text = p.text.strip()
                    if len(text) > 10:
                        content_blocks.append({"type": "p", "content": text})
                        
            result = {
                "title": title,
                "url": article_url,
                "blocks": content_blocks
            }
            
            # Cache the result
            try:
                os.makedirs(cache_dir, exist_ok=True)
                with open(cache_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, indent=4)
            except Exception:
                pass
                
            self.send_json_response(200, result)
            
        except Exception as e:
            self.send_json_response(500, {"error": f"Failed to scrape article (you might be offline): {str(e)}"})

    def handle_activity_log(self):
        log_file = os.path.join(DIRECTORY, "assets", "activity_log.json")
        if os.path.exists(log_file):
            try:
                with open(log_file, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            except Exception:
                logs = get_default_activities()
        else:
            logs = get_default_activities()
            try:
                os.makedirs(os.path.dirname(log_file), exist_ok=True)
                with open(log_file, 'w', encoding='utf-8') as f:
                    json.dump(logs, f, indent=4)
            except Exception:
                pass
        self.send_json_response(200, logs)

    def handle_add_news_source(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            name = payload.get('name', '').strip()
            url = payload.get('url', '').strip()
            category = payload.get('category', 'General').strip()
            avatar_base64 = payload.get('avatar_base64', '')
            
            if not name or not url:
                self.send_json_response(400, {"error": "Missing name or url"})
                return
                
            sources = load_custom_sources()
            
            if any(s['name'].lower() == name.lower() for s in sources):
                self.send_json_response(400, {"error": "A news source with this name already exists"})
                return
                
            avatar_path = ""
            if avatar_base64:
                import base64
                if "," in avatar_base64:
                    header, img_data_str = avatar_base64.split(',', 1)
                else:
                    header, img_data_str = "", avatar_base64
                
                ext = "png"
                if "jpeg" in header or "jpg" in header:
                    ext = "jpg"
                elif "svg" in header:
                    ext = "svg"
                elif "gif" in header:
                    ext = "gif"
                elif "webp" in header:
                    ext = "webp"
                
                safe_name = "".join(c if c.isalnum() else "_" for c in name.lower()).strip("_")
                avatars_dir = os.path.join(DIRECTORY, "assets", "custom_avatars")
                os.makedirs(avatars_dir, exist_ok=True)
                
                filename = f"{safe_name}.{ext}"
                filepath = os.path.join(avatars_dir, filename)
                
                img_data = base64.b64decode(img_data_str)
                with open(filepath, 'wb') as f:
                    f.write(img_data)
                
                avatar_path = f"assets/custom_avatars/{filename}"
                
            new_source = {
                "name": name,
                "url": url,
                "category": category,
                "avatar_path": avatar_path
            }
            
            sources.append(new_source)
            save_custom_sources(sources)
            
            # Reset news cache so it forces re-fetch of all sources next time
            global news_cache
            with news_cache_lock:
                news_cache["last_fetched"] = 0
                
            log_system_activity("Harvester Extension", f"Custom news source '{name}' added successfully")
            self.send_json_response(200, {"success": True, "message": "News source added successfully", "source": new_source})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_delete_news_source(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            name = payload.get('name', '').strip()
            
            if not name:
                self.send_json_response(400, {"error": "Missing source name"})
                return
                
            sources = load_custom_sources()
            original_len = len(sources)
            sources = [s for s in sources if s['name'].lower() != name.lower()]
            
            if len(sources) == original_len:
                self.send_json_response(400, {"error": "News source not found"})
                return
                
            save_custom_sources(sources)
            
            # Reset news cache so it forces re-fetch of all sources next time
            global news_cache
            with news_cache_lock:
                news_cache["last_fetched"] = 0
                
            log_system_activity("Harvester Extension", f"Custom news source '{name}' deleted successfully")
            self.send_json_response(200, {"success": True, "message": "News source deleted successfully"})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

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

    def handle_cover_cache(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            url = payload.get('url')
            filename = payload.get('filename')
            
            if not url or not filename:
                self.send_json_response(400, {"error": "Missing url or filename"})
                return
                
            # Secure filename against directory traversal
            filename = os.path.basename(filename)
            covers_dir = os.path.join(DIRECTORY, "assets", "covers")
            os.makedirs(covers_dir, exist_ok=True)
            
            filepath = os.path.join(covers_dir, filename)
            
            # If the file already exists, return success immediately
            if os.path.exists(filepath):
                self.send_json_response(200, {
                    "success": True,
                    "cached": True,
                    "local_url": f"assets/covers/{filename}"
                })
                return
                
            # Download and save
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=10) as r:
                with open(filepath, 'wb') as f:
                    f.write(r.read())
                    
            print(f"[GUI Server] Cached cover -> {filename}")
            self.send_json_response(200, {
                "success": True,
                "cached": False,
                "local_url": f"assets/covers/{filename}"
            })
            
        except Exception as e:
            print(f"[GUI Server] Failed to cache cover {filename}: {e}")
            self.send_json_response(500, {"error": str(e)})

    def handle_movie_sync(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            payload = json.loads(post_data)
            filename = payload.get('filename')
            film_title = payload.get('film_title')
            release_year = payload.get('release_year')
            tmdb_id = payload.get('tmdb_id')
            skip_people = payload.get('skip_people', False)
            
            if not filename or not film_title:
                self.send_json_response(400, {"error": "Missing filename or film_title"})
                return
                
            filename = os.path.basename(filename)
            
            create_if_missing = payload.get('create_if_missing', False)
            
            # Find file folder
            file_path = None
            if filename and filename != "All Lists Combined" and not filename.startswith("Blob") and not filename.startswith("File"):
                for folder in SCAN_DIRS:
                    candidate = os.path.join(folder, filename)
                    if os.path.exists(candidate):
                        file_path = candidate
                        break
                        
            # If not found (or filename was combined/generic), search all JSON files in SCAN_DIRS
            if not file_path:
                for folder in SCAN_DIRS:
                    for root, dirs, files in os.walk(folder):
                        for file in files:
                            if file.endswith(".json") and file != "all_lists_combined.json":
                                candidate_path = os.path.join(root, file)
                                try:
                                    with open(candidate_path, 'r', encoding='utf-8') as f:
                                        db_data = json.load(f)
                                    for film in db_data:
                                        if film.get("Film_title", "").strip().lower() == film_title.strip().lower():
                                            # Found the movie in this file!
                                            file_path = candidate_path
                                            filename = file
                                            break
                                except:
                                    continue
                        if file_path:
                            break
                    
            if not file_path:
                if filename == "temp_movies.json" and create_if_missing:
                    save_dir = get_save_directory()
                    file_path = os.path.join(save_dir, "temp_movies.json")
                    initial_temp_data = [
                        {
                            "Film_title": "__metadata__",
                            "Name": "Temp Movies",
                            "Description": "Temporary synced movies from TMDb",
                            "Tags": "temp",
                            "Ranked": False
                        }
                    ]
                    safe_save_json(file_path, initial_temp_data)
                else:
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
                if create_if_missing:
                    target_film = {
                        "Film_title": film_title,
                        "Release_year": int(release_year) if release_year else None
                    }
                    is_new_film = True
                else:
                    self.send_json_response(404, {"error": f"Movie '{film_title}' not found in database."})
                    return
            else:
                is_new_film = False
                
            # Create a deep copy of the film to mutate without modifying the original data concurrently
            synced_film = json.loads(json.dumps(target_film))
            
            year_val = str(release_year or synced_film.get("Release_year", "")).replace(".0", "").strip()
            
            synced_any = False
            
            # 1. Fetch Rotten Tomatoes score from Algolia
            rt_val = fetch_rt_rating_via_algolia(film_title, year_val)
            if rt_val:
                synced_film["Rotten_Tomatoes"] = rt_val
                synced_any = True
                print(f"[Algolia RT] Synced single movie: {film_title} ({year_val}) -> {rt_val}")
                
            # 2. Fetch TMDb details if key is available
            tmdb_keys = load_tmdb_keys()
            tmdb_key = tmdb_keys[0] if tmdb_keys else None
            imdb_id = synced_film.get("IMDb_ID")
            if not tmdb_id:
                tmdb_id = synced_film.get("TMDb_ID")
            
            if tmdb_key:
                tmdb_data = None
                if tmdb_id:
                    try:
                        detail_url = f"https://api.themoviedb.org/3/movie/{tmdb_id}?api_key={tmdb_key}&append_to_response=external_ids,credits"
                        req_detail = urllib.request.Request(detail_url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req_detail, timeout=5) as r_det:
                            tmdb_data = json.loads(r_det.read().decode('utf-8'))
                            ext_ids = tmdb_data.get("external_ids", {})
                            tmdb_data["imdb_id"] = ext_ids.get("imdb_id")
                    except Exception as tmdb_err:
                        print(f"[TMDb] Direct lookup failed for ID {tmdb_id}: {tmdb_err}")
                
                if not tmdb_data:
                    tmdb_data = fetch_imdb_id_from_tmdb(film_title, year_val, tmdb_key)
                
                if tmdb_data:
                    imdb_id = tmdb_data.get("imdb_id")
                    if imdb_id:
                        synced_film["IMDb_ID"] = imdb_id
                    if tmdb_data.get("id"):
                        synced_film["TMDb_ID"] = tmdb_data.get("id")
                        tmdb_id = tmdb_data.get("id")
                    enrich_film_from_tmdb_data(synced_film, tmdb_data)
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
                    update_film_from_omdb_data(synced_film, omdb_data)
                    # Override OMDb rating if we got a score from Algolia (prefer it)
                    if rt_val:
                        synced_film["Rotten_Tomatoes"] = rt_val
                    synced_any = True
                    print(f"[OMDb] Synced single movie ratings: {film_title} ({year_val})")
            
            # 4. Fetch Letterboxd average rating using resolved IDs
            try:
                # Ensure we use the resolved IDs from either TMDb or OMDb if they were fetched in steps 2 or 3
                resolved_imdb_id = synced_film.get("IMDb_ID") or imdb_id
                resolved_tmdb_id = synced_film.get("TMDb_ID") or tmdb_id
                lb_val = fetch_letterboxd_rating(film_title, year_val, imdb_id=resolved_imdb_id, tmdb_id=resolved_tmdb_id)
                if lb_val:
                    synced_film["Average_rating"] = lb_val
                    synced_any = True
                    print(f"[Letterboxd] Synced rating: {film_title} ({year_val}) -> {lb_val}")
            except Exception as lb_err:
                print(f"[Letterboxd Sync] Failed: {lb_err}")
            
            if synced_any:
                with db_lock:
                    # Reload fresh data to avoid race condition writes
                    with open(file_path, 'r', encoding='utf-8') as f:
                        fresh_data = json.load(f)
                        
                    fresh_film = None
                    if is_new_film:
                        fresh_data.append(synced_film)
                        fresh_film = synced_film
                    else:
                        for film in fresh_data:
                            title_match = film.get("Film_title", "").strip().lower() == film_title.strip().lower()
                            year_match = True
                            if release_year:
                                db_year = str(film.get("Release_year", "")).replace(".0", "").strip()
                                req_year = str(release_year).replace(".0", "").strip()
                                if db_year and req_year:
                                    year_match = db_year == req_year
                                    
                            if title_match and year_match:
                                fresh_film = film
                                break
                                
                        if fresh_film is not None:
                            fresh_film.update(synced_film)
                        
                    if fresh_film is not None:
                        if not skip_people:
                            try:
                                sync_people_for_film(fresh_film)
                            except Exception as e:
                                print(f"[GUI Server] People sync failed for '{film_title}': {e}")
                            
                        safe_save_json(file_path, fresh_data)
                        response_film = fresh_film
                    else:
                        response_film = synced_film
                
                self.send_json_response(200, {
                    "success": True,
                    "movie": response_film
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
            sync_covers = payload.get('sync_covers', True)
            
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
                args=(file_folder, filename, api_keys, sync_ratings, sync_avatars, sync_covers)
            )
            migration_thread.daemon = True
            migration_thread.start()
            log_system_activity("Database Sync", f"Sync started for list '{filename}'")
            
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
        try:
            combine_all_lists_on_server()
        except Exception as e:
            print(f"[GUI Server] Failed to auto-combine lists on scan: {e}")
            
        # Discover all JSON exports in configured directories
        discovered = {}
        for folder in reversed(SCAN_DIRS):
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.endswith('.json'):
                        discovered[f] = os.path.join(folder, f)
                        
        metadata_list = []
        for filename, filepath in sorted(discovered.items()):
            metadata_list.append(get_list_metadata(filepath))

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(metadata_list).encode('utf-8'))

    def handle_movie_lists(self):
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        title = params.get('title', [None])[0]
        year = params.get('year', [None])[0]
        imdb_id = params.get('imdb_id', [None])[0]
        
        if not title:
            self.send_json_response(400, {"error": "Missing title parameter"})
            return
            
        title_lower = title.lower().strip()
        
        # Discover all JSON exports in configured directories
        discovered = {}
        for folder in reversed(SCAN_DIRS):
            if os.path.exists(folder):
                for f in os.listdir(folder):
                    if f.endswith('.json') and f != 'all_lists_combined.json':
                        discovered[f] = os.path.join(folder, f)
                        
        matching_lists = []
        
        for filename, filepath in sorted(discovered.items()):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                if not isinstance(data, list):
                    continue
                    
                # Scan movies in list
                for m in data:
                    if not isinstance(m, dict) or m.get("Film_title") == "__metadata__":
                        continue
                        
                    # Match by IMDb ID if available
                    if imdb_id and imdb_id != "None" and imdb_id != "nan" and m.get("IMDb_ID") == imdb_id:
                        # Find list metadata/clean name
                        list_name = filename.replace('.json', '').replace('_', ' ')
                        metadata = next((item for item in data if isinstance(item, dict) and item.get("Film_title") == "__metadata__"), None)
                        if metadata and metadata.get("Name"):
                            list_name = metadata.get("Name")
                        matching_lists.append({
                            "filename": filename,
                            "name": list_name
                        })
                        break
                        
                    # Otherwise match by Title and Year
                    m_title = m.get("Film_title")
                    m_year = m.get("Release_year")
                    if m_title and m_title.lower().strip() == title_lower:
                        if not year or not m_year or str(m_year) == str(year):
                            list_name = filename.replace('.json', '').replace('_', ' ')
                            metadata = next((item for item in data if isinstance(item, dict) and item.get("Film_title") == "__metadata__"), None)
                            if metadata and metadata.get("Name"):
                                list_name = metadata.get("Name")
                            matching_lists.append({
                                "filename": filename,
                                "name": list_name
                            })
                            break
            except Exception as e:
                print(f"[GUI Server] Error scanning list {filename} for movie: {e}")
                
        self.send_json_response(200, {"lists": matching_lists})

    def handle_person_credits(self):
        parsed_url = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed_url.query)
        name = params.get('name', [None])[0]
        role = params.get('role', [None])[0]
        
        if not name:
            self.send_json_response(400, {"error": "Missing name parameter"})
            return
            
        tmdb_keys = load_tmdb_keys()
        api_key = tmdb_keys[0] if tmdb_keys else "aef93714a16db925b10c8f094690c228"
        
        try:
            name_q = urllib.parse.quote(name)
            search_url = f"https://api.themoviedb.org/3/search/person?api_key={api_key}&query={name_q}"
            req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as r:
                res = json.loads(r.read().decode('utf-8'))
                results = res.get("results", [])
                if not results:
                    self.send_json_response(200, {"credits": []})
                    return
                person_id = results[0].get("id")
                
            credits_url = f"https://api.themoviedb.org/3/person/{person_id}/movie_credits?api_key={api_key}"
            req2 = urllib.request.Request(credits_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req2, timeout=8) as r2:
                credits_res = json.loads(r2.read().decode('utf-8'))
                
            cast_list = credits_res.get("cast", [])
            crew_list = credits_res.get("crew", [])
            
            movies = []
            seen_movie_ids = set()
            
            def add_movie(m, role_type, job_title=""):
                m_id = m.get("id")
                if m_id in seen_movie_ids:
                    return
                seen_movie_ids.add(m_id)
                
                title = m.get("title") or m.get("original_title")
                if not title:
                    return
                    
                release_date = m.get("release_date") or ""
                year = ""
                if release_date:
                    year_match = re.search(r'\d{4}', release_date)
                    if year_match:
                        year = int(year_match.group(0))
                        
                poster_path = m.get("poster_path")
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else ""
                
                movies.append({
                    "Film_title": title,
                    "Release_year": year,
                    "Poster_URL": poster_url,
                    "TMDb_ID": m_id,
                    "Role_type": role_type,
                    "Job_title": job_title
                })
                
            if role == 'director':
                for m in crew_list:
                    if m.get("job") == "Director":
                        add_movie(m, "director", "Director")
                for m in crew_list:
                    if m.get("job") != "Director":
                        add_movie(m, "crew", m.get("job", ""))
                for m in cast_list:
                    add_movie(m, "actor", m.get("character", ""))
            else:
                for m in cast_list:
                    add_movie(m, "actor", m.get("character", ""))
                for m in crew_list:
                    if m.get("job") == "Director":
                        add_movie(m, "director", "Director")
                for m in crew_list:
                    if m.get("job") != "Director":
                        add_movie(m, "crew", m.get("job", ""))
                    
            self.send_json_response(200, {"credits": movies})
            
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

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
            log_system_activity("Harvester Extension", f"Successfully extracted {len(films_data)} titles to '{output_name}'")
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
        # count movies in scraped file
        try:
            with open(os.path.join(save_dir, f"{output_name}.json"), 'r', encoding='utf-8') as f:
                scraped_data = json.load(f)
            film_count = len([x for x in scraped_data if x.get("Film_title") and x.get("Film_title") != "__metadata__"])
        except Exception:
            film_count = 0
        log_system_activity("Harvester Extension", f"Successfully scraped list to '{output_name}.json' ({film_count} films)")
        scrape_progress["status"] = "finished"
    except Exception as e:
        print(f"[GUI Server] Error during scraper execution: {e}")
        log_system_activity("Harvester Extension", f"Scraper execution failed: {str(e)}")
        scrape_progress["status"] = "error"
        scrape_progress["current_film"] = f"Error: {str(e)}"

def start_server():
    try:
        combine_all_lists_on_server()
    except Exception as e:
        print(f"[GUI Server] Failed to auto-combine lists on startup: {e}")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), GUIHandler)
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
