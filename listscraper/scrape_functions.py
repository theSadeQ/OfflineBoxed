from listscraper.utility_functions import val2stars, stars2val
from bs4 import BeautifulSoup
from tqdm import tqdm
from curl_cffi import requests as requests_cffi
import threading
import numpy as np
import re

class ThreadLocalSession:
    def __init__(self):
        self._local = threading.local()

    def get_session(self):
        if not hasattr(self._local, "session"):
            self._local.session = requests_cffi.Session()
        return self._local.session

_session_manager = ThreadLocalSession()

class requests:
    @staticmethod
    def get(url, *args, **kwargs):
        session = _session_manager.get_session()
        kwargs.setdefault('impersonate', 'chrome120')
        if '/csi/film/' in url:
            parts = url.split('/')
            if len(parts) >= 6:
                movie_slug = parts[5]
                referer = f"https://letterboxd.com/film/{movie_slug}/"
                headers = kwargs.get('headers', {})
                headers['referer'] = referer
                kwargs['headers'] = headers
        return session.get(url, *args, **kwargs)

_domain = 'https://letterboxd.com/'

# Global progress dict for GUI / server tracking
scrape_progress = {
    "status": "idle",
    "current": 0,
    "total": 0,
    "current_film": ""
}



def scrape_list(list_url, page_options, output_file_extension, list_type, quiet=False, concat=False):
    """
    Scrapes a Letterboxd list. Takes into account any optional page selection.

    Parameters:
        list_url (str):                 The URL link of the first page of the LB list.
        page_options (str/list):        Either a "*" to scrape all pages, or a list with specific page integers.
        output_file_extension (str):    Type of file extension, for usage in 'scrape_page()'.
        list_type (str):                Type of list to be scraped, for usage in 'scrape_page()'.
        quiet (bool):                   Option to turn-off tqdm (not much increased speed noticed. Default is off.)
        concat (bool):                  If set true it will add an extra column with the original list name to the scraped data.

    Returns:
        list_films (list):       A list of dicts where each dict contains information on the films in the LB list.
    """

    list_films = []

    # If all pages should be scraped, go through all available pages
    if (page_options == []) or (page_options == "*"):
        while True:
            page_films, page_soup = scrape_page(list_url, list_url, output_file_extension, list_type, quiet, concat)
            list_films.extend(page_films)

            # Check if there is another page of ratings and if yes, continue to that page
            next_button = page_soup.find('a', class_='next')
            if next_button is None:
                break
            else:
                list_url = _domain + next_button['href']
    
    # If page selection was input, only go to those pages
    else:
        for p in page_options:
            new_link = list_url + f"page/{p}/"
            try:
                page_films, page_soup = scrape_page(new_link, list_url, output_file_extension, list_type, quiet, concat)
                list_films.extend(page_films)
            except Exception as e:
                if "Cloudflare" in str(e) or "IP Block" in str(e) or "Status Code" in str(e):
                    raise e
                print(f"        No films on page {p}...")
                continue    
    
    scrape_progress["status"] = "finished"
    return list_films

def scrape_page(list_url, og_list_url, output_file_extension, list_type, quiet=False, concat=False):
    """
    Scrapes the page of a LB list URL, finds all its films and iterates over each film URL
    to find the relevant information.

    Parameters:
        list_url (str):                 Link of the LB page that should be scraped.
        og_list_url (str):              The original input list URL (without any "/page/" strings added)
        output_file_extension (str):    Type of file extension, specifies 'not_found' entry.
        list_type (str):                Type of list, different specifications for different types.
        quiet (bool):                   Option to turn-off tqdm.
        concat (bool):                  Checks if concat is enabled.

    Returns:
        page_films (list):      List of dicts containing information on each film on the LB page.
        page_soup (str):        The HTML string of the entire LB page.
    """
    
    page_films = []
    
    if list_type == "LBfilms":
        # Convert standard URL to the modern CSI URL format
        # E.g. https://letterboxd.com/films/mini-theme/swords-battle-fantasy-epic-magic/by/best-match/
        # to: https://letterboxd.com/csi/films/films-browser-list/mini-theme/swords-battle-fantasy-epic-magic/by/best-match/?esiAllowFilters=true
        parts = list_url.split("/films/")
        if len(parts) >= 2:
            path = parts[1]
            if "page/1/" in path:
                path = path.replace("page/1/", "")
            csi_url = f"{parts[0]}/csi/films/films-browser-list/{path}"
            if "?" in csi_url:
                csi_url += "&esiAllowFilters=true"
            else:
                csi_url += "?esiAllowFilters=true"
        else:
            csi_url = list_url

        session = _session_manager.get_session()
        
        # Clean referer URL (without page number suffix) to bypass Cloudflare CSI checks
        referer_url = list_url
        if "/page/" in referer_url:
            referer_url = referer_url.split("/page/")[0] + "/"
        
        tqdm.write(f"        [Debug] Handshake URL: {list_url}")
        r_handshake = session.get(list_url, impersonate="chrome120")
        tqdm.write(f"        [Debug] Handshake Status: {r_handshake.status_code}")
        tqdm.write(f"        [Debug] Handshake Cookies: {session.cookies.get_dict()}")

        headers = {
            "referer": referer_url,
            "x-requested-with": "XMLHttpRequest"
        }
        tqdm.write(f"        [Debug] Fetching CSI URL: {csi_url}")
        page_response = requests.get(csi_url, headers=headers)
        tqdm.write(f"        [Debug] CSI Status: {page_response.status_code}")
    else:
        page_response = requests.get(list_url)
    
    # Check to see page was downloaded correctly
    if page_response is None or page_response.status_code != 200:
        status = page_response.status_code if page_response else 'None'
        if status == 403:
            raise Exception("Cloudflare Temporary IP Block (403 Forbidden). Please wait 5-10 minutes for the block to lift and try again.")
        elif status == 404:
            raise Exception("Page Not Found (404). Please double-check your Letterboxd URL.")
        else:
            raise Exception(f"Failed to fetch page (Status Code: {status}).")

    # If it is an LBfilms subgenre, we parse page layout (next buttons) from the handshake full page HTML,
    # and the film posters list from the CSI AJAX response fragment.
    if list_type == "LBfilms":
        page_soup = BeautifulSoup(r_handshake.content, 'lxml')
        csi_soup = BeautifulSoup(page_response.content, 'lxml')
    else:
        page_soup = BeautifulSoup(page_response.content, 'lxml')
        csi_soup = page_soup
    
    # Grab the main film grid
    if list_type == "Cast/Crew":
        table = csi_soup.find("div", class_="poster-grid")
    else:
        table = csi_soup.find('ul', class_='poster-list')
    if table is None:
        return
    
    films = table.find_all('li')
    if films == []:
        return 
    
    not_found = np.nan if output_file_extension == ".csv" else None
    
    # Iterate through films
    for index, film in enumerate(films if quiet else tqdm(films)):
        if list_type == "Cast/Crew" and "poster-container placeholder" in str(film):
            break  # less than four entries

        # Live logging of the currently scraped film slug
        slug = "Unknown"
        try:
            film_card = film.find('div').get('data-target-link')[1:]
            slug = film_card.split('/')[-2]
            if not quiet:
                tqdm.write(f"        -> Scraping film: {slug}")
        except Exception:
            pass

        # Update progress hooks for GUI / server tracking
        scrape_progress["status"] = "scraping"
        scrape_progress["current"] = index + 1
        scrape_progress["total"] = len(films)
        scrape_progress["current_film"] = slug

        film_dict = scrape_film(film, not_found)
        
        # Adds an extra column with OG list URL
        if concat:
            film_dict["List_URL"] = og_list_url
        
        page_films.append(film_dict)

    return page_films, page_soup
        
def scrape_film(film_html, not_found):
    """
    Scrapes all available information regarding a film. 
    The function makes multiple request calls to relevant Letterboxd film URLs and gets their raw HTML code.
    Using manual text extraction, the wanted information is found and stored in a dictionary.
    
    Parameters:
        film_html (str):    The raw <li> HTML string of the film object obtained from the list page HTML.
        not_found (object): Either 'np.nan' if output is CSV or 'None' if output is JSON
    Returns:
        film_dict (dict):   A dictionary containing all the film's information.
    """
    
    import time
    import random
    time.sleep(random.uniform(0.3, 0.7)) # Subtle random delay to prevent Cloudflare blocks

    film_dict = {}

    # Obtaining release year, director and average rating of the movie
    film_card = film_html.find('div').get('data-target-link')[1:]
    film_url = _domain + film_card
    filmget = requests.get(film_url)
    film_soup = BeautifulSoup(filmget.content, 'html.parser')

    # Finding the film name
    film_dict["Film_title"] = film_soup.find("div", {"class" : "col-17"}).find("h1").text
    
    # Try to find release year using regex search on year link href
    try:
        release_year_tag = film_soup.find('a', href=re.compile(r'/films/year/\d+/'))
        release_year = int(release_year_tag.text.strip()) if release_year_tag else 0
    except:
        release_year = 0
        
    film_dict["Release_year"] = not_found if release_year == 0 else release_year

    # Try to find director, if missing insert nan
    try:
        director = film_soup.find('meta', attrs={'name':'twitter:data1'}).attrs['content']
        if director == "":
            director = not_found
    except:
        director = not_found
    film_dict["Director"] = director

    # Finding the cast using the new panel ID or old fallback, if not found insert a nan
    try:
        cast_div = film_soup.find('div', attrs={'id': 'tab-panel-cast'}) or film_soup.find('div', attrs={'id': 'tab-cast'})
        cast_list = []
        if cast_div:
            cast_list = [a.text.strip() for a in cast_div.find_all('a') if a.text.strip() not in ('Show All…', 'Show All...')]
        if not cast_list:
            cast_list = [a.text.strip() for a in film_soup.find_all('a', href=re.compile(r'/actor/')) if a.text.strip() not in ('Show All…', 'Show All...')]
        
        # Deduplicate while preserving order
        seen = set()
        dedup_cast = [x for x in cast_list if not (x in seen or seen.add(x))]
        film_dict["Cast"] = dedup_cast if dedup_cast else not_found
    except:
        film_dict["Cast"] = not_found

    # Finding the crew (Writers, Producers, Composers, etc.)
    crew = {}
    try:
        crew_div = film_soup.find('div', attrs={'id': 'tab-panel-crew'}) or film_soup.find('div', attrs={'id': 'tab-crew'})
        if crew_div:
            headers = crew_div.find_all('h3')
            for h3 in headers:
                role_name = h3.text.strip()
                sibling = h3.find_next_sibling()
                if sibling:
                    names = [a.text.strip() for a in sibling.find_all('a') if a.text.strip() not in ('Show All…', 'Show All...')]
                    if names:
                        crew[role_name] = names
        
        # Fallback to general link query if headers not matching
        if not crew:
            for role in ['writer', 'producer', 'composer', 'cinematographer', 'editor']:
                role_links = film_soup.find_all('a', href=re.compile(f'/{role}/'))
                if role_links:
                    role_key = role.capitalize() + 's'
                    names = []
                    for a in role_links:
                        t = a.text.strip()
                        if t and t not in names and t not in ('Show All…', 'Show All...'):
                            names.append(t)
                    if names:
                        crew[role_key] = names
        
        film_dict["Crew"] = crew if crew else not_found
    except:
        film_dict["Crew"] = not_found

    # Finding average rating, if not found insert a nan
    try:
        film_dict["Average_rating"] = float(film_soup.find('meta', attrs={'name':'twitter:data2'}).attrs['content'][:4])
    except:
        film_dict["Average_rating"] = not_found

    # Try to find the list owner's rating of a film if possible and converting to float
    try:
        stringval = film_html.attrs['data-owner-rating']
        if stringval != '0':
            film_dict["Owner_rating"] = float(int(stringval)/2)
        else:
            film_dict["Owner_rating"] = not_found
    except:
        # Extra clause for type 'film' lists
        try:
            starval = film_html.find_all("span")[-1].text
            film_dict["Owner_rating"] = stars2val(starval, not_found)
        except:
            film_dict["Owner_rating"] = not_found
        
    # Finding film's genres, if not found insert nan
    try: 
        genres_container = film_soup.find('div', {'class': 'text-sluglist capitalize'}) or film_soup.find('div', id='tab-genres')
        genre_links = genres_container.find_all('a', href=re.compile(r'/genre/')) if genres_container else []
        if not genre_links:
            genre_links = film_soup.find_all('a', href=re.compile(r'/genre/'))
        
        genres_list = []
        for a in genre_links:
            text = a.text.strip()
            if text and text not in genres_list and text not in ('Show All…', 'Show All...'):
                genres_list.append(text)
        film_dict["Genres"] = genres_list if genres_list else not_found
    except:
        film_dict["Genres"] = not_found

    # Finding film's themes, if not found insert nan
    try:
        genres_container = film_soup.find('div', {'class': 'text-sluglist capitalize'}) or film_soup.find('div', id='tab-genres')
        theme_links = genres_container.find_all('a', href=re.compile(r'/theme/|/mini-theme/')) if genres_container else []
        if not theme_links:
            theme_links = film_soup.find_all('a', href=re.compile(r'/theme/|/mini-theme/'))
        
        themes = []
        for a in theme_links:
            text = a.text.strip()
            if text and text not in themes:
                themes.append(text)
        film_dict["Themes"] = themes if themes else not_found
    except:
        film_dict["Themes"] = not_found

    # Get movie runtime by searching for first sequence of digits in the p element with the runtime, if not found insert nan
    try: 
        film_dict["Runtime"] = int(re.search(r'\d+', film_soup.find('p', {'class': 'text-link text-footer'}).text).group())
    except:
        film_dict["Runtime"] = not_found

    # Details container panel (for countries, languages, studios)
    details_div = film_soup.find('div', attrs={'id': 'tab-panel-details'}) or film_soup.find('div', attrs={'id': 'tab-details'})

    def get_details_links(pattern):
        elements = []
        if details_div:
            elements = details_div.find_all('a', href=re.compile(pattern))
        if not elements:
            elements = film_soup.find_all('a', href=re.compile(pattern))
        
        result = []
        for el in elements:
            t = el.text.strip().replace('\xa0', ' ')
            if t and t not in result and t not in ('Show All…', 'Show All...'):
                # Exclude labels/headers that link to generic filter directories
                if t.lower() in ('country', 'countries', 'language', 'languages', 'studio', 'studios'):
                    continue
                result.append(t)
        return result

    # Finding countries
    try:
        countries = get_details_links(r'country')
        film_dict["Countries"] = countries if countries else not_found
    except:
        film_dict["Countries"] = not_found

    # Finding spoken and original languages
    try:
        languages = get_details_links(r'language')
        if languages:
            film_dict["Original_language"] = languages[0]
            film_dict["Spoken_languages"] = languages
        else:
            film_dict["Original_language"] = not_found
            film_dict["Spoken_languages"] = not_found
    except:
        film_dict["Original_language"] = not_found
        film_dict["Spoken_languages"] = not_found

    # Finding the description, if not found insert a nan
    try:
        film_dict['Description'] = film_soup.find('meta', attrs={'name' : 'description'}).attrs['content']
    except:
        film_dict['Description'] = not_found

    # Finding studios
    try:
        studios = get_details_links(r'studio')
        film_dict["Studios"] = studios if studios else not_found
    except:
        film_dict["Studios"] = not_found

    # Getting number of watches, appearances in lists and number of likes
    # Try to parse directly from the main page film_soup first to save requests
    def parse_stat_val(selector_pairs):
        for tag, attrs in selector_pairs:
            el = film_soup.find(tag, attrs)
            if el:
                title_attr = el.get('title')
                if title_attr:
                    digits = re.findall(r'\d+', title_attr)
                    if digits:
                        return int(''.join(digits))
                digits = re.findall(r'\d+', el.text)
                if digits:
                    return int(''.join(digits))
        return None

    watches = parse_stat_val([
        ('a', {'class': 'icon-watched'}),
        ('div', {'class': '-watches'}),
        ('a', {'href': re.compile(r'/members/$')}),
        ('li', {'class': 'film-watch-count'})
    ])
    
    list_appearances = parse_stat_val([
        ('a', {'class': 'icon-list'}),
        ('div', {'class': '-lists'}),
        ('a', {'href': re.compile(r'/lists/$')}),
        ('li', {'class': 'film-list-count'})
    ])

    likes = parse_stat_val([
        ('a', {'class': 'icon-liked'}),
        ('a', {'class': 'icon-like'}),
        ('div', {'class': '-likes'}),
        ('a', {'href': re.compile(r'/likes/$')}),
        ('li', {'class': 'film-like-count'})
    ])

    # If any is missing, fall back to CSI endpoint to ensure 100% correctness
    if watches is None or list_appearances is None or likes is None:
        try:
            movie = film_url.split('/')[-2]                                        # Movie title in URL
            r = requests.get(f'https://letterboxd.com/csi/film/{movie}/stats/')    # Stats page of said movie
            stats_soup = BeautifulSoup(r.content, 'lxml')

            if watches is None:
                watches_tag = stats_soup.find('div', class_='-watches') or stats_soup.find('a', class_='icon-watched')
                if watches_tag:
                    watches_a = watches_tag if watches_tag.name == 'a' else watches_tag.find('a')
                    w_digits = re.findall(r'\d+', watches_a["title"])
                    watches = int(''.join(w_digits))

            if list_appearances is None:
                lists_tag = stats_soup.find('div', class_='-lists') or stats_soup.find('a', class_='icon-list')
                if lists_tag:
                    lists_a = lists_tag if lists_tag.name == 'a' else lists_tag.find('a')
                    l_digits = re.findall(r'\d+', lists_a["title"])
                    list_appearances = int(''.join(l_digits))

            if likes is None:
                likes_tag = stats_soup.find('div', class_='-likes') or stats_soup.find('a', class_='icon-liked') or stats_soup.find('a', class_='icon-like')
                if likes_tag:
                    likes_a = likes_tag if likes_tag.name == 'a' else likes_tag.find('a')
                    lk_digits = re.findall(r'\d+', likes_a["title"])
                    likes = int(''.join(lk_digits))
        except:
            pass

    film_dict["Watches"] = watches if watches is not None else not_found
    film_dict["List_appearances"] = list_appearances if list_appearances is not None else not_found
    film_dict["Likes"] = likes if likes is not None else not_found

    # Get number of fans from main film page
    try:
        fans_tag = film_soup.find('a', href=re.compile(r'/fans/'))
        fans_text = fans_tag.text.strip() if fans_tag else ""
        fans = re.findall(r'\d+\.?\d*K?|\d+K?|\d+', fans_text)[0]
        if "." in fans and "K" in fans:
            fans = int(float(fans[:-1]) * 1000)
        elif "K" in fans:
            fans = int(float(fans[:-1]) * 1000)
        else:
            fans = int(fans)
    except:
        fans = 0
    film_dict["Fans"] = fans

    # Getting info on rating histogram (requires new link)
    r = requests.get(f'https://letterboxd.com/csi/film/{movie}/rating-histogram/')    # Rating histogram page of said movie
    hist_soup = BeautifulSoup(r.content, 'lxml')

    # Get rating histogram (i.e. how many star ratings were given) and total ratings (sum of rating histogram)
    ratings = hist_soup.find_all("tr", class_="column")
    tot_ratings = 0
    if len(ratings) != 0:
        for i, r in enumerate(ratings):
            stars = val2stars((i+1)/2, not_found)
            sr_span = r.find("span", class_="_sr-only")
            if sr_span:
                text = sr_span.text.strip()
                digits = re.findall(r'\d+', text.split('(')[0])
                count = int(''.join(digits)) if digits else 0
            else:
                count = 0
            film_dict[f"{stars}"] = count
            tot_ratings += count

    # If the film has not been released yet (i.e. no ratings)
    else:
        for i in range(10):
            stars = val2stars((i+1)/2, not_found)
            film_dict[f"{stars}"] = 0
            
    film_dict["Total_ratings"] = tot_ratings

    # Thumbnail URL?
    try:
        import json
        script_tag = film_soup.find('script', type='application/ld+json')
        if script_tag:
            content = script_tag.string
            if "/* <![CDATA[ */" in content:
                content = content.replace("/* <![CDATA[ */", "").replace("/* ]]> */", "")
            data = json.loads(content.strip())
            film_dict["Poster_URL"] = data.get('image', not_found)
        else:
            film_dict["Poster_URL"] = not_found
    except Exception:
        film_dict["Poster_URL"] = not_found

    # Trailer URL?
    trailer_url = not_found
    try:
        trailer_tag = (
            film_soup.find('a', href=re.compile(r'youtube\.com/watch|youtu\.be/|youtube\.com/embed')) or
            film_soup.find('a', class_='play-button', href=re.compile(r'youtube'))
        )
        if not trailer_tag:
            trailer_tag = film_soup.find('a', class_='play-button', attrs={'data-video-id': True}) or \
                          film_soup.find('a', class_='play-button', attrs={'data-video': True}) or \
                          film_soup.find('a', attrs={'data-trailer': True})
                          
        if not trailer_tag:
            play_buttons = film_soup.find_all('a', class_=re.compile(r'play-button|trailer-link'))
            for btn in play_buttons:
                href = btn.get('href', '')
                if 'youtube.com' in href or 'youtu.be' in href or 'vimeo.com' in href:
                    trailer_tag = btn
                    break
                    
        if trailer_tag:
            href = trailer_tag.get('href', '')
            if 'youtube.com' in href or 'youtu.be' in href or 'vimeo.com' in href:
                trailer_url = href
            else:
                video_id = trailer_tag.get('data-video-id') or trailer_tag.get('data-video') or trailer_tag.get('data-trailer')
                if video_id:
                    trailer_url = f"https://www.youtube.com/watch?v={video_id}"
    except:
        pass
    film_dict["Trailer_URL"] = trailer_url

    # Save the film URL as an extra column
    film_dict["Film_URL"] = film_url

    # Scraping OMDb Ratings (IMDb, Rotten Tomatoes, Metacritic)
    imdb_id = None
    try:
        imdb_link = film_soup.find('a', href=re.compile(r'imdb\.com/title/(tt\d+)'))
        if imdb_link:
            imdb_id = re.search(r'tt\d+', imdb_link.get('href')).group()
        else:
            imdb_match = re.search(r'imdb\.com/title/(tt\d+)', str(film_soup))
            if imdb_match:
                imdb_id = imdb_match.group(1)
    except:
        pass

    imdb_score = not_found
    imdb_votes = not_found
    rt_score = not_found
    metascore = not_found

    if imdb_id:
        try:
            import os
            api_key = os.environ.get("OMDB_API_KEY", "trilogy")
            omdb_url = f"https://www.omdbapi.com/?i={imdb_id}&apikey={api_key}"
            req = requests.get(omdb_url, timeout=5)
            if req.status_code == 200:
                omdb_data = req.json()
                if omdb_data.get("Response") != "False":
                    imdb_val = omdb_data.get("imdbRating")
                    if imdb_val and imdb_val != "N/A":
                        imdb_score = f"{imdb_val}/10"
                    
                    votes_val = omdb_data.get("imdbVotes")
                    if votes_val and votes_val != "N/A":
                        imdb_votes = votes_val
                    
                    meta_val = omdb_data.get("Metascore")
                    if meta_val and meta_val != "N/A":
                        metascore = f"{meta_val}/100"
                    
                    for rating_entry in omdb_data.get("Ratings", []):
                        if rating_entry.get("Source") == "Rotten Tomatoes":
                            rt_score = rating_entry.get("Value")
                            break
        except:
            pass

    film_dict["IMDb_Rating"] = imdb_score
    film_dict["IMDb_Votes"] = imdb_votes
    film_dict["Rotten_Tomatoes"] = rt_score
    film_dict["Metascore"] = metascore
    
    return film_dict
