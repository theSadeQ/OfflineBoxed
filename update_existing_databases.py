import os
import json
import urllib.parse
import urllib.request
import time

OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "trilogy")

def get_rt_rating_from_algolia(title, year):
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
    except Exception:
        pass
    return None

def get_omdb_ratings(title, year):
    try:
        title_q = urllib.parse.quote(title)
        url = f"https://www.omdbapi.com/?t={title_q}&y={year}&apikey={OMDB_API_KEY}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode('utf-8'))
            if data.get("Response") != "False":
                imdb_score = None
                imdb_val = data.get("imdbRating")
                if imdb_val and imdb_val != "N/A":
                    imdb_score = f"{imdb_val}/10"
                
                imdb_votes = None
                votes_val = data.get("imdbVotes")
                if votes_val and votes_val != "N/A":
                    imdb_votes = votes_val
                
                metascore = None
                meta_val = data.get("Metascore")
                if meta_val and meta_val != "N/A":
                    metascore = f"{meta_val}/100"
                
                rt_score = None
                for entry in data.get("Ratings", []):
                    if entry.get("Source") == "Rotten Tomatoes":
                        rt_score = entry.get("Value")
                        break
                return imdb_score, rt_score, metascore, imdb_votes
    except Exception:
        pass
    return None

def update_file(filepath):
    print(f"Checking list: {filepath}...")
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"  Error reading file: {e}")
        return

    if not isinstance(data, list):
        print("  Not a list database.")
        return

    updated_count = 0
    total = len(data)
    
    for idx, film in enumerate(data):
        if not isinstance(film, dict) or film.get("Film_title") == "__metadata__":
            continue
            
        title = film.get("Film_title")
        year = film.get("Release_year")
        if not title:
            continue
            
        # Standardize empty year representations
        if year == "nan" or not year:
            year = ""
            
        rt_updated = False
        if not film.get("Rotten_Tomatoes") or film.get("Rotten_Tomatoes") == "None":
            rt_val = get_rt_rating_from_algolia(title, year)
            if rt_val:
                film["Rotten_Tomatoes"] = rt_val
                rt_updated = True
                print(f"  [Algolia RT] {title} ({year}) -> Rotten Tomatoes: {rt_val}")
                
        omdb_updated = False
        if not film.get("IMDb_Rating") or film.get("IMDb_Rating") == "None":
            res = get_omdb_ratings(title, year)
            if res:
                film["IMDb_Rating"], rt_score_omdb, film["Metascore"], film["IMDb_Votes"] = res
                if not film.get("Rotten_Tomatoes") and rt_score_omdb:
                    film["Rotten_Tomatoes"] = rt_score_omdb
                omdb_updated = True
                print(f"  [OMDb] {title} ({year}) -> IMDb: {film.get('IMDb_Rating')}, RT: {film.get('Rotten_Tomatoes')}")
                time.sleep(0.05)
                
        if rt_updated or omdb_updated:
            updated_count += 1
            
    if updated_count > 0:
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
            print(f"  Success! Updated {updated_count} films in {filepath}.\n")
        except Exception as e:
            print(f"  Error saving file: {e}\n")
    else:
        print("  No updates needed.\n")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    paths = [
        os.path.join(base_dir, 'offline_viewer'),
        os.path.join(base_dir, 'scraper_outputs')
    ]
    
    processed = set()
    for folder in paths:
        if os.path.exists(folder):
            for f in os.listdir(folder):
                if f.endswith('.json') and not f.startswith('films_popular_year'):
                    fp = os.path.join(folder, f)
                    real_path = os.path.realpath(fp)
                    if real_path not in processed:
                        processed.add(real_path)
                        update_file(real_path)

if __name__ == "__main__":
    main()
