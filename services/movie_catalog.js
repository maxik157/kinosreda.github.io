'use strict';

function createMovieCatalog({ request, now = Date.now, random = Math.random }) {
  const cache = new Map(), pending = new Map();
  async function cached(key, work) {
    const old = cache.get(key);
    if (old && now() - old.at < 600000) return old.value;
    if (pending.has(key)) return pending.get(key);
    const promise = work().then(value => {
      cache.set(key, { at: now(), value });
      if (cache.size > 600) cache.delete(cache.keys().next().value);
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  const directory = () => cached('directory', () => request('/api/v2.2/films/filters'));
  const detail = id => cached(`film:${id}`, () => request(`/api/v2.2/films/${id}`));
  const seasons = id => cached(`seasons:${id}`, () => request(`/api/v2.2/films/${id}/seasons`));
  async function mapLimit(items, work) {
    let next = 0;
    const output = new Array(items.length);
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) { const i = next++; output[i] = await work(items[i]); }
    }));
    return output;
  }
  const list = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  const lower = value => String(value || '').toLocaleLowerCase('ru');
  const numeric = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  function between(value, from, to) {
    const a = numeric(from), b = numeric(to), n = numeric(value);
    return (a == null && b == null) || n != null && (a == null || n >= a) && (b == null || n <= b);
  }
  // The upstream caps a broad query at 100 titles. Continue with independent
  // release-year queries rather than reporting that cap as the whole catalogue.
  const feeds = new Map();
  async function browse(page) {
    let feed = feeds.get('all');
    if (!feed || now() - feed.at > 600000) {
      feed = { at: now(), items: [], ids: new Set(), year: null, next: 1, pages: 1, done: false, pending: null };
      feeds.set('all', feed);
    }
    const fill = async () => {
      while (feed.items.length < page * 20 && !feed.done) {
        const params = { type: 'ALL', order: 'NUM_VOTE', page: feed.next,
          ...(feed.year == null ? {} : { yearFrom: feed.year, yearTo: feed.year }) };
        const data = await cached(`browse:${JSON.stringify(params)}`, () => request('/api/v2.2/films', params));
        for (const item of data.items || []) {
          const id = String(item.kinopoiskId);
          if (!feed.ids.has(id)) { feed.ids.add(id); feed.items.push(item); }
        }
        feed.pages = Math.max(1, Number(data.totalPages) || 1);
        if (feed.next < feed.pages && data.items?.length) feed.next++;
        else {
          feed.year = feed.year == null ? new Date(now()).getUTCFullYear() : feed.year - 1;
          feed.next = 1;
          feed.done = feed.year < 1888;
        }
      }
    };
    // Serialize requests for a feed, including requests from different clients.
    while (feed.pending) await feed.pending;
    feed.pending = fill().finally(() => { feed.pending = null; });
    await feed.pending;
    const end = page * 20;
    return { items: feed.items.slice(end - 20, end), page,
      total: null, totalPages: null, hasMore: !feed.done || feed.items.length > end, totalExact: false };
  }
  async function query(input = {}) {
    const page = Math.max(1, Math.floor(Number(input.page) || 1));
    const f = { ...input, genres: list(input.genres), countries: list(input.countries), types: list(input.types) };
    const countryGroup = ['domestic', 'foreign'].includes(f.countryGroup) ? f.countryGroup : '';
    const noConditions = !f.keyword && !f.genres.length && !f.countries.length && !f.types.length && !countryGroup
      && !['yearFrom','yearTo','kpFrom','kpTo','imdbFrom','imdbTo','ageRating','runtimeMax','seasonsMin'].some(key => numeric(f[key]) != null)
      && (!f.watchStatus || f.watchStatus === 'all') && f.favoriteOnly !== true && f.favoriteOnly !== 'true';
    if (noConditions) return browse(page);
    const options = f.genres.length || f.countries.length || countryGroup ? await directory() : { genres: [], countries: [] };
    const genreIds = f.genres.map(name => options.genres.find(item => lower(item.genre) === lower(name))?.id).filter(Boolean);
    const countryIds = f.countries.map(name => options.countries.find(item => lower(item.country) === lower(name))?.id).filter(Boolean);
    if (genreIds.length !== f.genres.length || countryIds.length !== f.countries.length) throw new Error('unknown_filter');
    const ratingFirst = f.sort === 'rating' || numeric(f.yearFrom) != null || numeric(f.yearTo) != null;
    const params = {
      type: f.types.length === 1 ? f.types[0] === 'tv' ? 'TV_SERIES' : 'FILM' : 'ALL',
      order: ratingFirst ? 'RATING' : { year: 'YEAR', popularity: 'NUM_VOTE', relevance: 'NUM_VOTE' }[f.sort] || 'NUM_VOTE'
    };
    if (f.keyword) params.keyword = String(f.keyword).slice(0,120);
    for (const [target, source] of [['yearFrom','yearFrom'],['yearTo','yearTo'],['ratingFrom','kpFrom'],['ratingTo','kpTo']]) {
      if (numeric(f[source]) != null) params[target] = Number(f[source]);
    }
    if (genreIds.length === 1) params.genres = genreIds[0];
    if (countryIds.length === 1) params.countries = countryIds[0];
    const parseIds = value => new Set(String(value || '').split(',').filter(id => /^\d+$/.test(id)).slice(0,1000));
    const favorites = parseIds(f.favoriteIds), watched = parseIds(f.watchedIds), progress = parseIds(f.progressIds);
    const favoritesOnly = f.favoriteOnly === true || f.favoriteOnly === 'true';
    const personal = favoritesOnly || ['watched','in_progress'].includes(f.watchStatus);
    let personalIds = favoritesOnly ? favorites : f.watchStatus === 'watched' ? watched : progress;
    if (favoritesOnly && f.watchStatus === 'watched') personalIds = new Set([...favorites].filter(id => watched.has(id)));
    if (favoritesOnly && f.watchStatus === 'in_progress') personalIds = new Set([...favorites].filter(id => progress.has(id)));
    if (personal && !personalIds.size) return { items:[], total:0, totalPages:0, page };
    const hydrate = f.ageRating !== '' && f.ageRating != null || numeric(f.runtimeMax) != null || numeric(f.seasonsMin) != null;
    // A broad Kinopoisk request is capped at 100 rows.  Keep a small, lazy
    // feed per filter set and walk release years one by one.  This makes page
    // 6+ behave like the first pages without firing hundreds of requests on
    // initial render.
    const feedKey = `filtered:${JSON.stringify({ ...f, page: undefined, favoriteIds: f.favoriteIds, watchedIds: f.watchedIds, progressIds: f.progressIds })}`;
    let feed = feeds.get(feedKey);
    const requestedFrom = numeric(f.yearFrom);
    const requestedTo = numeric(f.yearTo);
    const fromYear = requestedTo ?? Math.max(new Date(now()).getUTCFullYear(), requestedFrom ?? 1888);
    const toYear = requestedFrom ?? 1888;
    if (!feed || now() - feed.at > 600000) {
      feed = { at: now(), items: [], ids: new Set(), year: fromYear, page: 1, pages: 1, mode: ratingFirst ? 'broad' : 'years', done: false, pending: null };
      feeds.set(feedKey, feed);
    }
    const matches = item => {
      const id = String(item.kinopoiskId);
      if (f.watchStatus === 'unwatched' && (watched.has(id) || progress.has(id))) return false;
      const type = /SERIES/.test(item.type || '') ? 'tv' : 'movie';
      if (f.types.length && !f.types.includes(type)) return false;
      if (f.keyword && !lower(`${item.nameRu} ${item.nameOriginal} ${item.nameEn}`).includes(lower(f.keyword))) return false;
      if (!between(item.year, f.yearFrom, f.yearTo) || !between(item.ratingKinopoisk, f.kpFrom, f.kpTo)) return false;
      if (!between(item.ratingImdb, f.imdbFrom, f.imdbTo)) return false;
      if (f.genres.length && !f.genres.some(name => (item.genres || []).some(g => lower(g.genre) === lower(name)))) return false;
      if (f.countries.length && !f.countries.some(name => (item.countries || []).some(c => lower(c.country) === lower(name)))) return false;
      const countries = (item.countries || []).map(c => lower(c.country));
      const domestic = countries.some(country => country === 'россия' || country === 'ссср');
      if (countryGroup === 'domestic' && !domestic) return false;
      if (countryGroup === 'foreign' && (!countries.length || domestic)) return false;
      if (f.ageRating !== '' && f.ageRating != null && (!item.ratingAgeLimits || Number(String(item.ratingAgeLimits).replace(/\D/g,'')) !== Number(f.ageRating))) return false;
      if (numeric(f.runtimeMax) != null && (!item.filmLength || item.filmLength > Number(f.runtimeMax))) return false;
      if (numeric(f.seasonsMin) != null && (!item.seasonCount || item.seasonCount < Number(f.seasonsMin))) return false;
      return true;
    };
    const hydrateItems = async all => hydrate ? mapLimit(all, async item => {
        if (!item || !item.kinopoiskId) return item;
        const needsDetails = (f.ageRating !== '' && !item.ratingAgeLimits)
          || (numeric(f.runtimeMax) != null && !item.filmLength)
          || (numeric(f.seasonsMin) != null && /SERIES/.test(item.type || ''));
        if (!needsDetails) return item;
        const full = await detail(item.kinopoiskId);
        return { ...item, ...full,
          ...(numeric(f.seasonsMin) != null && /SERIES/.test(item.type || '') ? { seasonCount:(await seasons(item.kinopoiskId)).items?.length || 0 } : {})
        };
      }) : all;
    const fillFeed = async target => {
      while (feed.items.length < target && !feed.done) {
        if (feed.mode !== 'broad' && feed.year < toYear) {
          if (ratingFirst && feed.rating != null) {
            feed.rating--;
            feed.year = fromYear;
            feed.page = 1;
            if (feed.rating < Math.ceil((numeric(f.kpFrom) ?? 0) * 10)) { feed.done = true; break; }
          } else { feed.done = true; break; }
        }
        const requestParams = feed.mode === 'broad' ? { ...params, page: feed.page } : {
          ...params, page: feed.page, yearFrom: feed.year, yearTo: feed.year,
          ...(ratingFirst && feed.rating != null ? { ratingFrom: feed.rating / 10, ratingTo: feed.rating / 10 } : {})
        };
        const data = await cached(`filtered-page:${JSON.stringify(requestParams)}`, () => request('/api/v2.2/films', requestParams));
        const raw = (data.items || []).filter(item => !feed.ids.has(String(item.kinopoiskId)));
        const hydrated = await hydrateItems(raw);
        raw.forEach(item => feed.ids.add(String(item.kinopoiskId)));
        for (const item of hydrated) if (matches(item)) feed.items.push(item);
        feed.pages = Math.max(1, Number(data.totalPages) || 1);
        const last = data.items?.at(-1);
        if (feed.mode === 'broad' && last) feed.lastRating = numeric(last.ratingKinopoisk);
        if (feed.page < feed.pages && data.items?.length) feed.page++;
        else if (feed.mode === 'broad') {
          // Results below the upstream cap continue in descending rating bands,
          // then by year within a tie. Already returned pages never get reordered.
          if (Number(data.total) < 100 || !data.items?.length) feed.done = true;
          else {
            feed.mode = 'years'; feed.page = 1; feed.year = fromYear;
            feed.rating = Math.round((feed.lastRating ?? 10) * 10);
          }
        } else { feed.page = 1; feed.year--; }
      }
    };
    while (feed.pending) await feed.pending;
    feed.pending = (async () => {
      if (personal) {
        const all = await mapLimit([...personalIds], detail);
        feed.items = all.filter(matches);
        feed.done = true;
      } else {
        await fillFeed(page * 20);
      }
    })().finally(() => { feed.pending = null; });
    await feed.pending;
    const results = personal ? feed.items.slice().sort((a,b) => {
      if (f.sort === 'title') return (a.nameRu || a.nameOriginal || '').localeCompare(b.nameRu || b.nameOriginal || '', 'ru');
      if (f.sort === 'year') return (b.year || 0) - (a.year || 0);
      return (b.ratingKinopoisk || 0) - (a.ratingKinopoisk || 0);
    }) : feed.items;
    const items = results.slice((page - 1) * 20, page * 20);
    return { items, total: feed.done ? feed.items.length : null, totalPages: feed.done ? Math.ceil(feed.items.length / 20) : null, page, hasMore: !feed.done || feed.items.length > page * 20, totalExact: feed.done };
  }
  // A random draw never walks the catalogue feed. Read a few independent
  // upstream partitions in parallel, spanning the requested release interval.
  // Requests share the same page cache as browsing; there is no per-film fetch.
  async function randomBatch(input = {}) {
    const genres = list(input.genres), countries = list(input.countries), types = list(input.types);
    const yearFrom = Math.max(1888, Math.floor(numeric(input.yearFrom) ?? 1888));
    const yearTo = Math.min(2100, Math.floor(numeric(input.yearTo) ?? new Date(now()).getUTCFullYear()));
    const ratingFrom = numeric(input.kpFrom), ratingTo = numeric(input.kpTo);
    if (yearFrom > yearTo || (ratingFrom != null && ratingTo != null && ratingFrom > ratingTo)) throw new Error('invalid_filter_range');
    const options = genres.length || countries.length || input.countryGroup ? await directory() : { genres: [], countries: [] };
    const ids = (names, entries, key) => names.map(name => {
      const option = entries.find(entry => lower(entry[key]) === lower(name));
      if (!option) throw new Error('unknown_filter');
      return option.id;
    });
    const genreIds = ids(genres, options.genres, 'genre');
    const countryIds = ids(countries, options.countries, 'country');
    const choose = values => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
    const params = { type: types.length === 1 ? types[0] === 'tv' ? 'TV_SERIES' : 'FILM' : 'ALL', yearFrom, yearTo, order: choose(['NUM_VOTE', 'RATING']) };
    if (ratingFrom != null) params.ratingFrom = ratingFrom;
    if (ratingTo != null) params.ratingTo = ratingTo;
    // Multi-value filters mean OR; pick a branch per partition, then verify all
    // predicates on the merged result (including country co-productions).
    const branch = () => ({ ...params, ...(genreIds.length ? { genres: choose(genreIds) } : {}), ...(countryIds.length ? { countries: choose(countryIds) } : {}) });
    const pageData = args => cached(`filtered-page:${JSON.stringify(args)}`, () => request('/api/v2.2/films', args));
    // Mix a random page from the full interval with independently sampled
    // years/ratings. A fresh batch can reach older and lower-rated entries,
    // rather than repeatedly using the first page of the newest year.
    const partitions = [branch()];
    const yearSpan = yearTo - yearFrom + 1;
    const probes = yearSpan > 1 ? 2 : 1;
    for (let i = 0; i < probes; i += 1) {
      const year = yearFrom + Math.floor(random() * yearSpan);
      const partition = { ...branch(), yearFrom: year, yearTo: year };
      if (i === probes - 1) {
        const min = ratingFrom ?? 0, max = ratingTo ?? 10;
        const band = min + Math.floor(random() * Math.max(1, Math.ceil((max - min) * 2))) / 2;
        partition.ratingFrom = band;
        partition.ratingTo = Math.min(max, band + .5);
      }
      partitions.push(partition);
    }
    const excluded = new Set(String(input.watchStatus === 'unwatched' ? input.watchedIds || '' : '').split(','));
    const matches = item => {
      const id = String(item.kinopoiskId);
      if (!id || excluded.has(id)) return false;
      if (!between(item.year, yearFrom, yearTo) || !between(item.ratingKinopoisk, ratingFrom, ratingTo)) return false;
      const type = /SERIES/.test(item.type || '') ? 'tv' : 'movie';
      if (types.length && !types.includes(type)) return false;
      if (genres.length && !genres.some(name => (item.genres || []).some(g => lower(g.genre) === lower(name)))) return false;
      if (countries.length && !countries.some(name => (item.countries || []).some(c => lower(c.country) === lower(name)))) return false;
      const names = (item.countries || []).map(c => lower(c.country));
      const domestic = names.some(name => name === 'россия' || name === 'ссср');
      if (input.countryGroup === 'domestic' && !domestic) return false;
      if (input.countryGroup === 'foreign' && (!names.length || domestic)) return false;
      return true;
    };
    const read = async partition => {
      const first = await pageData({ ...partition, page: 1 });
      const count = Math.max(1, Number(first.totalPages) || 1);
      const page = 1 + Math.floor(random() * count);
      return page === 1 ? first : pageData({ ...partition, page });
    };
    const batches = await mapLimit(partitions, read);
    let items = [...new Map(batches.flatMap(data => data.items || []).filter(matches).map(item => [String(item.kinopoiskId), item])).values()];
    if (!items.length) {
      const fallback = await read(branch());
      items = [...new Map((fallback.items || []).filter(matches).map(item => [String(item.kinopoiskId), item])).values()];
    }
    // The selected country group may be absent from the capped broad response.
    // Target an actual country branch rather than scanning years or relaxing it.
    if (!items.length && input.countryGroup) {
      const names = input.countryGroup === 'domestic' ? ['Россия', 'СССР'] : ['США', 'Великобритания', 'Франция', 'Япония', 'Индия'];
      const entries = options.countries.filter(entry => names.includes(entry.country));
      const extra = await mapLimit(entries.slice(0, 4), entry => read({ ...branch(), countries: entry.id }));
      items = [...new Map(extra.flatMap(data => data.items || []).filter(matches).map(item => [String(item.kinopoiskId), item])).values()];
    }
    // Fisher-Yates mixes years and pages before the browser makes its draw.
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    return { items, hasMore: items.length > 0 };
  }
  return { query, directory, randomBatch };

}
module.exports = { createMovieCatalog };
