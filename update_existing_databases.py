import os
import json
import urllib.parse
import urllib.request
import time

OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "trilogy")

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
    except Exception as e:
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
    
    # We will limit the first scan run to show progress quickly
    for idx, film in enumerate(data):
        # Check if film already has ratings populated
        if "IMDb_Rating" in film and film["IMDb_Rating"] is not None:
            continue
            
        title = film.get("Film_title")
        year = film.get("Release_year")
        if not title:
            continue
            
        # Standardize empty year representations
        if year == "nan" or not year:
            year = ""
            
        res = get_omdb_ratings(title, year)
        if res:
            film["IMDb_Rating"], film["Rotten_Tomatoes"], film["Metascore"], film["IMDb_Votes"] = res
            updated_count += 1
            # Small rate-limit delay
            time.sleep(0.05)
        else:
            film["IMDb_Rating"] = None
            film["Rotten_Tomatoes"] = None
            film["Metascore"] = None
            film["IMDb_Votes"] = None
            
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
    # Determine the directory where this script is located for portability
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
                    # We will update non-giant lists immediately. For huge popular lists, the user can run this!
                    fp = os.path.join(folder, f)
                    real_path = os.path.realpath(fp)
                    if real_path not in processed:
                        processed.add(real_path)
                        update_file(real_path)

if __name__ == "__main__":
    main()
