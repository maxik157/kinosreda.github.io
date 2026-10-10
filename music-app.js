/* Music owns its data and audio. The shared shell owns navigation. */
(() => {
  "use strict";
  const $ = (id) =>
    id.startsWith(".")
      ? document.querySelector(id)
      : document.getElementById(id);
  const audio = $("audio");
  const API = "https://realtime.xn--80ahcljthqi.xn--p1ai";
  const ROOT = "music/playlistsTracks";
  const META = "music/playlistsMeta";
  const DEFAULT = "shared-default";
  const STORAGE = "musicPlaybackStateV2";
  const FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23101724'/%3E%3Cpath fill='%23f59e0b' d='M50 18 58 40l22 2-17 14 5 22-18-12-18 12 5-22-17-14 22-2z'/%3E%3C/svg%3E";
  const config = {
    apiKey: "AIzaSyBwp4ZNbJuUM5sY0qMffvZTHr2PDvc2iLc",
    authDomain: "kinosreda-ce8ef.firebaseapp.com",
    databaseURL:
      "https://kinosreda-ce8ef-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "kinosreda-ce8ef",
    storageBucket: "kinosreda-ce8ef.firebasestorage.app",
    messagingSenderId: "889337905300",
    appId: "1:889337905300:web:325aea2f3fb3c6b44a7481",
  };
  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (_) {
      return fallback;
    }
  };
  const user = read("currentUser", {});
  const me = String(user.username || "guest").toLowerCase();
  const settings = read("musicPlayerSettings", {});
  const s = {
    db: null,
    tracks: [],
    playlists: [],
    activePlaylist: settings.activePlaylistId || DEFAULT,
    view: "library",
    provider: "truffled",
    current: null,
    queue: [],
    index: -1,
    results: [],
    cursor: "",
    loading: false,
    likedOnly: false,
    shuffle: !!settings.shuffle,
    repeat:
      settings.repeatMode === "loop"
        ? "all"
        : settings.repeatMode === "once"
          ? "one"
          : "off",
    searchSeq: 0,
    playSeq: 0,
    subscription: null,
    searchRequest: null,
    streamRequest: null,
    hls: null,
    playlistEditing: null,
    trackEditing: null,
    retry: 0,
    saveSecond: -1,
    debounce: 0,
  };
  const icons = {
    play: '<path d="m8 5 11 7-11 7Z"/>',
    pause: '<path d="M7 5h4v14H7zM14 5h4v14h-4z"/>',
    prev: '<path d="M5 5v14m14-14-10 7 10 7Z"/>',
    next: '<path d="M19 5v14M5 5l10 7-10 7Z"/>',
    shuffle:
      '<path d="M3 7h3c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c5 0 7-10 12-10h3m-4-4 4 4-4 4"/>',
    repeat:
      '<path d="M20 7H7a4 4 0 0 0-4 4m14-8 4 4-4 4M4 17h13a4 4 0 0 0 4-4m-14 8-4-4 4-4"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    heart:
      '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 8 15 8 15S25 10 20 5Z"/>',
    queue: '<path d="M3 5h14M3 10h14M3 15h8m7-2v8m-4-4h8"/>',
    edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-4-4L5 15Z"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    refresh: '<path d="M20 10a8 8 0 1 0-2 8M20 3v7h-7"/>',
  };
  const svg = (name) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.play}</svg>`;
  const fmt = (seconds) => {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  };
  const key = (t) => `${t.provider}:${t.trackId}`;
  const canAccess = (p) =>
    p.scope !== "private" ||
    String(p.ownerUsername || "").toLowerCase() === me ||
    me === "max";
  const canManagePlaylist = (p) =>
    p &&
    p.id !== DEFAULT &&
    (me === "max" || String(p.ownerUsername || "").toLowerCase() === me);
  const activeMeta = () =>
    s.playlists.find((p) => p.id === s.activePlaylist) || {
      title: "Общий плейлист",
      scope: "shared",
    };
  const canManageTrack = (t) =>
    me === "max" ||
    String(t.addedByUsername || "").toLowerCase() === me ||
    (activeMeta().scope === "private" && canManagePlaylist(activeMeta()));
  const liked = (t) => !!(t.likes && t.likes[me]);
  const safeCover = (raw) => {
    const text = String(raw || "").replace("%%", "400x400");
    if (!text) return FALLBACK;
    if (text.startsWith("/truffled-music/")) return API + text;
    if (text.startsWith("/api/music/"))
      return API + "/truffled-music/" + text.slice("/api/music/".length);
    if (text.startsWith("data:image/")) return text;
    try {
      const url = new URL(
        text.startsWith("//")
          ? "https:" + text
          : text.includes("://")
            ? text
            : "https://" + text,
      );
      if (url.protocol !== "https:") return FALLBACK;
      return url.href;
    } catch (_) {
      return FALLBACK;
    }
  };
  function normalize(raw, firebaseKey = "") {
    const provider = String(raw.provider || "yandex").toLowerCase();
    if (!["truffled", "yandex"].includes(provider)) return null;
    const id = String(raw.trackId || raw.id || "");
    if (!id || (provider === "yandex" && !/^\d+$/.test(id))) return null;
    const artists = (
      Array.isArray(raw.artists)
        ? raw.artists.map((x) => (typeof x === "string" ? x : x.name))
        : [raw.artist]
    ).filter(Boolean);
    const albumId = String(raw.albumId || raw.albums?.[0]?.id || "");
    return {
      key: firebaseKey,
      trackId: id,
      provider,
      albumId,
      title: String(raw.title || raw.name || "Без названия"),
      artists,
      durationMs: raw.durationMs
        ? Number(raw.durationMs)
        : Number(raw.duration || 0) * 1000,
      coverUrl: safeCover(raw.coverUrl || raw.cover || raw.art || raw.coverUri),
      sourceUrl:
        provider === "truffled"
          ? `https://truffled.lol/m?track=${encodeURIComponent(id)}`
          : String(raw.sourceUrl || `https://music.yandex.ru/track/${id}`),
      addedByName: String(raw.addedByName || ""),
      addedByUsername: String(raw.addedByUsername || ""),
      addedAt: Number(raw.addedAt || 0),
      likes: raw.likes || {},
    };
  }
  function notice(message, error = false) {
    $("notice").textContent = message || "";
    $("notice").style.color = error ? "#fca5a5" : "";
  }
  async function api(route, params = {}, options = {}) {
    const url = new URL(API + route);
    Object.entries(params).forEach(([name, value]) => {
      if (value !== "" && value != null) url.searchParams.set(name, value);
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    const timer = setTimeout(abort, options.timeout || 60_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Источник вернул неверный ответ");
      const result = await response.json();
      if (!response.ok || result.ok === false)
        throw new Error(
          result.message || result.error || `HTTP ${response.status}`,
        );
      return result;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
    }
  }
  function button(icon, label, handler, pressed) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "icon-btn";
    b.innerHTML = svg(icon);
    b.title = label;
    b.setAttribute("aria-label", label);
    if (pressed != null) b.setAttribute("aria-pressed", String(pressed));
    b.onclick = (event) => {
      event.stopPropagation();
      Promise.resolve(handler(b)).catch((e) =>
        notice(e.message || "Не удалось выполнить действие", true),
      );
    };
    return b;
  }
  function image(src, title) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = title;
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      img.onerror = null;
      img.src = FALLBACK;
    };
    return img;
  }
  function visibleTracks() {
    let list =
      s.view === "discover"
        ? s.results
        : s.view === "queue"
          ? s.queue
          : s.tracks;
    const q = $("filter").value.trim().toLowerCase();
    return list.filter(
      (t) =>
        (!q || `${t.title} ${t.artists.join(" ")}`.toLowerCase().includes(q)) &&
        (!s.likedOnly || liked(t)),
    );
  }
  function render() {
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === s.view);
      b.setAttribute("aria-pressed", String(b.dataset.view === s.view));
    });
    document.querySelectorAll("[data-provider]").forEach((b) => {
      b.classList.toggle("active", b.dataset.provider === s.provider);
      b.setAttribute("aria-pressed", String(b.dataset.provider === s.provider));
    });
    $("discoveryControls").hidden = s.view !== "discover";
    $("likedOnly").hidden = s.view !== "library";
    $("likedOnly").setAttribute("aria-pressed", String(s.likedOnly));
    $("playlistEdit").hidden = !canManagePlaylist(activeMeta());
    $("filter").placeholder =
      s.view === "discover"
        ? "Фильтр результатов"
        : s.view === "queue"
          ? "Поиск в очереди"
          : "Поиск по плейлисту";
    const list = visibleTracks();
    const fragment = document.createDocumentFragment();
    list.forEach((t, i) => {
      const row = document.createElement("li");
      row.className = "track";
      row.dataset.trackKey = key(t);
      row.classList.toggle("active", !!s.current && key(s.current) === key(t));
      const art = document.createElement("button");
      art.className = "track-cover";
      art.setAttribute("aria-label", `Воспроизвести ${t.title}`);
      art.append(image(t.coverUrl, ""));
      art.onclick = () => start(t, list);
      const info = document.createElement("div");
      info.className = "track-info";
      const title = document.createElement("button");
      title.type = "button";
      title.className = "track-title";
      title.textContent = t.title;
      title.onclick = () => start(t, list);
      const meta = document.createElement("div");
      meta.className = "track-meta";
      meta.textContent = [t.artists.join(", "), fmt(t.durationMs / 1000)]
        .filter(Boolean)
        .join(" · ");
      const actions = document.createElement("div");
      actions.className = "track-actions";
      if (s.view === "discover") {
        actions.append(
          button("add", `Добавить ${t.title} в «${activeMeta().title}»`, () =>
            addTrack(t),
          ),
          button("queue", "Добавить в очередь", () => {
            s.queue.push({ ...t });
            notice("Добавлено в очередь");
          }),
        );
      } else if (s.view === "queue") {
        actions.append(
          button("add", "Сохранить в плейлист", () => addTrack(t)),
          button("close", "Убрать из очереди", () => {
            const n = s.queue.indexOf(t);
            s.queue.splice(n, 1);
            if (n <= s.index) s.index--;
            render();
          }),
        );
      } else {
        actions.append(
          button("heart", "Любимый трек", () => toggleLike(t), liked(t)),
        );
        actions.append(
          button("queue", "В очередь", () => {
            s.queue.push({ ...t });
            notice("Добавлено в очередь");
          }),
        );
        if (canManageTrack(t))
          actions.append(
            button("edit", "Редактировать", () => editTrack(t)),
            button("close", "Удалить трек", () => deleteTrack(t)),
          );
        actions.append(
          button("download", "Скачать трек", (b) => download(t, b)),
        );
      }
      info.append(title, meta);
      row.append(art, info, actions);
      fragment.append(row);
    });
    if (!list.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = s.loading
        ? "Загружаю музыку…"
        : s.view === "queue"
          ? "Очередь пуста. Добавь треки кнопкой рядом с названием."
          : s.view === "discover"
            ? "Ничего не найдено"
            : "Здесь пока нет треков. Найди музыку и добавь её в плейлист.";
      fragment.append(empty);
    }
    $("tracks").replaceChildren(fragment);
    $("searchNotice").textContent = s.loading
      ? "Загружаю…"
      : s.view === "discover"
        ? `${s.results.length} треков · ${s.provider === "truffled" ? "Truffled" : "Яндекс Музыка"}`
        : `${list.length} треков`;
    $("loadMore").hidden = s.view !== "discover" || !s.cursor;
    $("loadMore").disabled = s.loading;
    $("searchBtn").disabled = s.loading;
    updatePlaybackRows();
  }
  function setView(view) {
    s.view = view;
    s.likedOnly = false;
    $("filter").value = "";
    render();
    if (view === "discover" && !s.results.length) search();
  }
  async function search(more = false) {
    s.searchRequest?.abort();
    s.searchRequest = new AbortController();
    const seq = ++s.searchSeq;
    const q = $("query").value.trim();
    const provider = s.provider;
    s.loading = true;
    if (!more) {
      s.results = [];
      s.cursor = "";
    }
    render();
    try {
      let list,
        cursor = "";
      const link = q.match(
        /^https:\/\/music\.yandex\.[^/]+\/(?:album\/(\d+)\/)?track\/(\d+)/i,
      );
      if (provider === "yandex" && link) {
        const data = await api(
          "/yandex-music/tracks/" + link[2] + (link[1] ? ":" + link[1] : ""),
          {},
          { signal: s.searchRequest.signal },
        );
        list = (Array.isArray(data.result) ? data.result : [])
          .map((t) => normalize({ ...t, provider }))
          .filter(Boolean);
      } else if (provider === "yandex") {
        if (!q) {
          list = [];
        } else {
          const data = await api(
            "/yandex-music/search",
            { text: q, type: "track", page: more ? Number(s.cursor) : 0 },
            { signal: s.searchRequest.signal },
          );
          const result = data.result?.tracks || {};
          list = (result.results || [])
            .map((t) => normalize({ ...t, provider }))
            .filter(Boolean);
          const page = more ? Number(s.cursor) : 0;
          if (
            list.length &&
            (page + 1) * list.length < Number(result.total || 0)
          )
            cursor = String(page + 1);
        }
      } else {
        const truffledLink = q.match(
          /^https:\/\/truffled\.lol\/m\?track=([A-Za-z0-9_-]+)/,
        );
        const data = await api(
          "/truffled-music/" +
            (truffledLink
              ? "tracks/" + truffledLink[1]
              : q
                ? "search"
                : "chart"),
          truffledLink ? {} : { q, cursor: more ? s.cursor : "" },
          { signal: s.searchRequest.signal },
        );
        list = (truffledLink ? [data] : data.tracks || [])
          .filter((t) => !t.unavailable)
          .map((t) => normalize({ ...t, provider }))
          .filter(Boolean);
        cursor = data.nextCursor || "";
      }
      if (seq !== s.searchSeq) return;
      const known = new Set(s.results.map(key));
      s.results.push(
        ...list.filter((t) => !known.has(key(t)) && known.add(key(t))),
      );
      s.cursor = cursor;
    } catch (e) {
      if (seq === s.searchSeq && e.name !== "AbortError")
        notice("Не удалось загрузить музыку. Попробуй ещё раз.", true);
    } finally {
      if (seq === s.searchSeq) {
        s.loading = false;
        render();
      }
    }
  }
  async function resolveStream(t, signal, fresh = false) {
    if (t.provider === "truffled") {
      const result = await api(
        "/truffled-music/source/" + encodeURIComponent(t.trackId),
        { fresh: fresh ? "1" : "", choice: fresh ? "1" : "" },
        { signal },
      );
      if (!result.url || !result.url.startsWith("/truffled-music/"))
        throw new Error("Аудиопоток недоступен");
      return {
        url: API + result.url,
        protocol: result.protocol || "progressive",
      };
    }
    const result = await api(
      "/ym-track-link",
      { track_id: t.trackId, album_id: t.albumId },
      { signal },
    );
    const url =
      result.result?.directLink || result.result?.resolvedRawDirectLink;
    if (!url || !url.startsWith("https://"))
      throw new Error("Аудиопоток недоступен");
    return { url, protocol: "progressive" };
  }
  function currentUi() {
    const t = s.current;
    $("currentTitle").textContent = t?.title || "Выбери трек";
    $("currentArtists").textContent =
      t?.artists.join(", ") || "Твои плейлисты и новая музыка";
    if (t) {
      $("cover").className = "cover-wrap";
      $("cover").replaceChildren(image(t.coverUrl, t.title));
    }
    if (
      t &&
      "mediaSession" in navigator &&
      typeof MediaMetadata !== "undefined"
    ) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artists.join(", "),
        artwork: [{ src: t.coverUrl, sizes: "400x400" }],
      });
    }
  }
  function start(t, queue) {
    s.queue = queue.slice();
    s.index = s.queue.findIndex((x) => key(x) === key(t));
    s.retry = 0;
    play(t);
  }
  async function play(t, { fresh = false, resume = 0, autoplay = true } = {}) {
    if (!t) return;
    const seq = ++s.playSeq;
    s.streamRequest?.abort();
    s.streamRequest = new AbortController();
    s.hls?.destroy();
    s.hls = null;
    s.current = t;
    currentUi();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    notice("Подготавливаю трек…");
    notify();
    updatePlaybackRows();
    try {
      const source = await resolveStream(t, s.streamRequest.signal, fresh);
      if (seq !== s.playSeq) return;
      if (source.protocol === "hls" && window.Hls?.isSupported()) {
        s.hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        s.hls.loadSource(source.url);
        s.hls.attachMedia(audio);
      } else audio.src = source.url;
      if (resume > 0)
        audio.addEventListener(
          "loadedmetadata",
          () => {
            if (seq === s.playSeq && Number.isFinite(audio.duration))
              audio.currentTime = Math.min(resume, audio.duration - 0.1);
          },
          { once: true },
        );
      if (autoplay) await audio.play();
      else audio.load();
      if (seq === s.playSeq) {
        notice("");
        save();
      }
    } catch (e) {
      if (seq === s.playSeq && e.name !== "AbortError") {
        notice("Не удалось воспроизвести. Нажми ▶, чтобы повторить.", true);
        syncPlayback();
      }
    }
  }
  async function togglePlay() {
    if (!s.current) return start(visibleTracks()[0], visibleTracks());
    if (!audio.src || audio.error) return play(s.current, { fresh: true });
    if (audio.paused) {
      try {
        await audio.play();
      } catch (_) {
        play(s.current, { fresh: true, resume: audio.currentTime });
      }
    } else audio.pause();
  }
  function next(direction = 1) {
    if (!s.queue.length) return;
    let n = s.index + direction;
    if (direction === -1 && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (s.shuffle && direction > 0 && s.queue.length > 1) {
      do {
        n = Math.floor(Math.random() * s.queue.length);
      } while (n === s.index);
    }
    if (n < 0 || n >= s.queue.length) {
      if (s.repeat !== "all") return;
      n = (n + s.queue.length) % s.queue.length;
    }
    s.index = n;
    s.retry = 0;
    play(s.queue[n]);
  }
  function seek(time) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(
      Math.max(0, Number(time) || 0),
      audio.duration,
    );
    updateProgress();
  }
  function updatePlaybackRows() {
    document
      .querySelectorAll(".track")
      .forEach((row) =>
        row.classList.toggle(
          "active",
          !!s.current && row.dataset.trackKey === key(s.current),
        ),
      );
  }
  function syncPlayback() {
    $("play").innerHTML = svg(audio.paused ? "play" : "pause");
    $("play").setAttribute(
      "aria-label",
      audio.paused ? "Воспроизвести" : "Пауза",
    );
    $("shuffle").setAttribute("aria-pressed", String(s.shuffle));
    $("repeat").setAttribute("aria-pressed", String(s.repeat !== "off"));
    $("repeat").title =
      "Повтор: " + { off: "выключен", one: "трек", all: "очередь" }[s.repeat];
    $("repeat").setAttribute("aria-label", $("repeat").title);
    if ("mediaSession" in navigator)
      navigator.mediaSession.playbackState = audio.paused
        ? "paused"
        : "playing";
    updatePlaybackRows();
    notify();
    save();
  }
  function updateProgress() {
    const duration = Number.isFinite(audio.duration)
      ? audio.duration
      : Number(s.current?.durationMs || 0) / 1000;
    $("seek").max = String(duration);
    $("seek").value = String(audio.currentTime);
    $("seek").disabled = !duration;
    $("timeCurrent").textContent = fmt(audio.currentTime);
    $("timeTotal").textContent = fmt(duration);
    if (
      "mediaSession" in navigator &&
      Number.isFinite(audio.duration) &&
      audio.duration > 0
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: Math.min(audio.currentTime, audio.duration),
          playbackRate: 1,
        });
      } catch (_) {}
    }
    notify();
    if (Math.floor(audio.currentTime / 2) !== s.saveSecond) {
      s.saveSecond = Math.floor(audio.currentTime / 2);
      save();
    }
  }
  function notify() {
    if (parent === window) return;
    parent.postMessage(
      {
        type: "music:state",
        payload: {
          hasTrack: !!s.current,
          trackId: s.current?.trackId || "",
          title: s.current?.title || "",
          artists: s.current?.artists || [],
          coverUrl: s.current?.coverUrl || FALLBACK,
          isPlaying: !audio.paused && !audio.ended,
          currentTime: audio.currentTime,
          duration: Number.isFinite(audio.duration)
            ? audio.duration
            : Number(s.current?.durationMs || 0) / 1000,
          fullscreenOpen:
            $(".player")?.classList.contains("is-expanded") || false,
        },
      },
      location.origin,
    );
  }
  function save() {
    try {
      localStorage.setItem(
        "musicPlayerSettings",
        JSON.stringify({
          ...settings,
          activePlaylistId: s.activePlaylist,
          shuffle: s.shuffle,
          repeatMode:
            s.repeat === "all" ? "loop" : s.repeat === "one" ? "once" : "off",
          volume: audio.volume,
        }),
      );
      if (s.current)
        localStorage.setItem(
          STORAGE,
          JSON.stringify({
            track: s.current,
            queue: s.queue.slice(0, 300),
            index: s.index,
            time: audio.currentTime,
          }),
        );
    } catch (_) {}
  }
  function renderPlaylists() {
    $("playlist").replaceChildren(
      ...s.playlists.map((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent =
          p.title + (p.scope === "private" ? " · Личный" : "");
        return option;
      }),
    );
    $("playlist").value = s.activePlaylist;
    render();
  }
  function bindTracks() {
    if (!s.db) return;
    if (s.subscription) s.db.ref(s.subscription).off();
    s.subscription = ROOT + "/" + s.activePlaylist;
    s.tracks = [];
    render();
    s.db.ref(s.subscription).on(
      "value",
      (snap) => {
        s.tracks = [];
        snap.forEach((child) => {
          const t = normalize(child.val() || {}, child.key);
          if (t) s.tracks.push(t);
        });
        s.tracks.sort((a, b) => b.addedAt - a.addedAt);
        render();
      },
      () => notice("Не удалось загрузить плейлист", true),
    );
  }
  async function addTrack(t) {
    if (!s.db) throw new Error("Плейлисты недоступны");
    const playlist = s.activePlaylist;
    const ref = s.db.ref(ROOT + "/" + playlist);
    const existing = await ref
      .orderByChild("trackId")
      .equalTo(t.trackId)
      .once("value");
    let duplicate = false;
    existing.forEach((child) => {
      if ((child.val()?.provider || "yandex") === t.provider) duplicate = true;
    });
    if (duplicate) {
      notice("Этот трек уже есть в плейлисте");
      return;
    }
    const payload = {
      ...t,
      key: null,
      addedByUsername: me,
      addedByName: String(user.name || me),
      addedAt: Date.now(),
      likes: {},
    };
    await ref.push(payload);
    notice("Трек добавлен в плейлист");
  }
  async function toggleLike(t) {
    const ref = s.db?.ref(
      `${ROOT}/${s.activePlaylist}/${t.key}/likes/${me.replace(/[.#$\[\]\/]/g, "_")}`,
    );
    if (!ref) return;
    if (liked(t)) await ref.remove();
    else await ref.set(true);
  }
  async function confirm(title, text) {
    $("confirmTitle").textContent = title;
    $("confirmText").textContent = text;
    return new Promise((resolve) => {
      $("confirmDialog").onclose = () =>
        resolve($("confirmDialog").returnValue === "confirm");
      $("confirmDialog").showModal();
    });
  }
  async function deleteTrack(t) {
    if (!canManageTrack(t)) return;
    const playlist = s.activePlaylist;
    if (await confirm("Удалить трек?", t.title)) {
      await s.db.ref(`${ROOT}/${playlist}/${t.key}`).remove();
      notice("Трек удалён");
    }
  }
  function editTrack(t) {
    s.trackEditing = { ...t, playlist: s.activePlaylist };
    $("editTitle").value = t.title;
    $("editArtists").value = t.artists.join(", ");
    $("trackDialog").showModal();
  }
  function editPlaylist(create = false) {
    const meta = create ? null : activeMeta();
    if (meta && !canManagePlaylist(meta)) return;
    s.playlistEditing = meta;
    $("playlistDialogTitle").textContent = create
      ? "Новый плейлист"
      : "Настройки плейлиста";
    $("playlistName").value = meta?.title || "";
    $("playlistScope").value = meta?.scope || "shared";
    $("deletePlaylist").hidden = !meta;
    $("playlistDialog").showModal();
  }
  async function download(t, b) {
    b.disabled = true;
    let blobUrl;
    try {
      const source = await resolveStream(t);
      if (source.protocol === "hls")
        throw new Error("Скачивание недоступно для HLS-потока");
      const url = source.url;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error("Не удалось скачать трек");
        const type = r.headers.get("content-type") || "";
        if (!type.includes("audio"))
          throw new Error("Скачивание недоступно для этого потока");
        const blob = await r.blob();
        if (!blob.size) throw new Error("Пустой файл");
        blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download =
          `${t.artists.join(", ")} - ${t.title}`.replace(/[\\/:*?"<>|]/g, " ") +
          (type.includes("mp4") ? ".m4a" : ".mp3");
        document.body.append(link);
        link.click();
        link.remove();
        notice("Трек скачан");
      } finally {
        clearTimeout(timer);
      }
    } finally {
      b.disabled = false;
      if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
  }
  function expanded(open) {
    $(".player").classList.toggle("is-expanded", open);
    $("closePlayer").hidden = !open;
    $("cover").setAttribute(
      "aria-label",
      open ? "Свернуть плеер" : "Развернуть плеер",
    );
    notify();
  }
  function bindEvents() {
    $("prev").innerHTML = svg("prev");
    $("next").innerHTML = svg("next");
    $("shuffle").innerHTML = svg("shuffle");
    $("repeat").innerHTML = svg("repeat");
    $("refresh").innerHTML = svg("refresh");
    $("play").onclick = togglePlay;
    $("prev").onclick = () => next(-1);
    $("next").onclick = () => next();
    $("shuffle").onclick = () => {
      s.shuffle = !s.shuffle;
      syncPlayback();
    };
    $("repeat").onclick = () => {
      s.repeat = { off: "all", all: "one", one: "off" }[s.repeat];
      syncPlayback();
    };
    $("volume").oninput = () => {
      audio.volume = Number($("volume").value);
      save();
    };
    $("seek").oninput = () => seek($("seek").value);
    $("cover").onclick = () =>
      expanded(!$(".player").classList.contains("is-expanded"));
    $("expandPlayer").onclick = () => expanded(true);
    $("closePlayer").onclick = () => expanded(false);
    document
      .querySelectorAll("[data-view]")
      .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
    document.querySelectorAll("[data-provider]").forEach(
      (b) =>
        (b.onclick = () => {
          s.provider = b.dataset.provider;
          $("query").placeholder =
            s.provider === "truffled"
              ? "Найти трек или исполнителя"
              : "Название или ссылка на трек Яндекса";
          search();
        }),
    );
    $("searchBtn").onclick = () => search();
    $("loadMore").onclick = () => search(true);
    $("query").onkeydown = (e) => {
      if (e.key === "Enter") {
        clearTimeout(s.debounce);
        search();
      }
    };
    $("query").oninput = () => {
      clearTimeout(s.debounce);
      s.searchRequest?.abort();
      s.searchSeq++;
      s.debounce = setTimeout(() => search(), 400);
    };
    $("filter").oninput = render;
    $("likedOnly").onclick = () => {
      s.likedOnly = !s.likedOnly;
      render();
    };
    $("refresh").onclick = () =>
      s.view === "discover" ? search() : bindTracks();
    $("playlist").onchange = () => {
      s.activePlaylist = $("playlist").value;
      save();
      bindTracks();
    };
    $("playlistCreate").onclick = () => editPlaylist(true);
    $("playlistEdit").onclick = () => editPlaylist();
    $("cancelPlaylist").onclick = () => $("playlistDialog").close();
    $("cancelTrackEdit").onclick = () => $("trackDialog").close();
    $("playlistForm").onsubmit = async (e) => {
      e.preventDefault();
      const title = $("playlistName").value.trim();
      if (!title || !s.db) return;
      const old = s.playlistEditing;
      const button = e.submitter;
      button.disabled = true;
      try {
        if (old)
          await s.db
            .ref(META + "/" + old.id)
            .update({
              title,
              scope: $("playlistScope").value,
              updatedAt: Date.now(),
            });
        else {
          const ref = s.db.ref(META).push();
          s.activePlaylist = ref.key;
          await ref.set({
            title,
            scope: $("playlistScope").value,
            ownerUsername: me,
            ownerName: user.name || me,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          bindTracks();
          save();
        }
        $("playlistDialog").close();
        notice("Плейлист сохранён");
      } catch (_) {
        notice("Не удалось сохранить плейлист", true);
      } finally {
        button.disabled = false;
      }
    };
    $("deletePlaylist").onclick = async () => {
      const meta = s.playlistEditing;
      if (!canManagePlaylist(meta)) return;
      $("playlistDialog").close();
      if (!(await confirm("Удалить плейлист?", "Все его треки будут удалены.")))
        return;
      await s.db
        .ref("music")
        .update({
          ["playlistsMeta/" + meta.id]: null,
          ["playlistsTracks/" + meta.id]: null,
          ["playlistsAlbums/" + meta.id]: null,
        });
      s.activePlaylist = DEFAULT;
      bindTracks();
      save();
    };
    $("trackForm").onsubmit = async (e) => {
      e.preventDefault();
      const t = s.trackEditing;
      const title = $("editTitle").value.trim();
      if (!t || !title) return;
      e.submitter.disabled = true;
      try {
        await s.db.ref(`${ROOT}/${t.playlist}/${t.key}`).update({
          title,
          artists: $("editArtists")
            .value.split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        });
        $("trackDialog").close();
      } catch (_) {
        notice("Не удалось сохранить трек", true);
      } finally {
        e.submitter.disabled = false;
      }
    };
    audio.addEventListener("play", syncPlayback);
    audio.addEventListener("pause", syncPlayback);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("ended", () => {
      if (s.repeat === "one") {
        seek(0);
        audio.play().catch(() => {});
      } else next();
    });
    audio.addEventListener("error", () => {
      if (!s.current || s.retry >= 1) {
        notice("Поток прервался. Нажми ▶, чтобы повторить.", true);
        return;
      }
      s.retry++;
      play(s.current, { fresh: true, resume: audio.currentTime });
    });
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.source !== parent) return;
      const data = e.data || {};
      if (data.type === "music:request-state") return notify();
      if (data.type !== "music:command") return;
      if (
        [
          "toggle",
          "toggle-play",
          "play-pause",
          "toggle-playback",
          "play-toggle",
        ].includes(data.command)
      )
        togglePlay();
      else if (data.command === "next") next();
      else if (data.command === "prev") next(-1);
      else if (data.command === "pause") audio.pause();
      else if (data.command === "play") {
        if (audio.paused) togglePlay();
      } else if (["fullscreen", "toggle-fullscreen"].includes(data.command))
        expanded(!$(".player").classList.contains("is-expanded"));
      else if (data.command === "seek") seek(data.time || data.currentTime);
      else if (
        data.command === "seek-to" &&
        Number.isFinite(Number(data.ratio))
      )
        seek(
          Number(data.ratio) *
            (Number.isFinite(audio.duration) ? audio.duration : 0),
        );
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") expanded(false);
      if (
        e.code === "Space" &&
        !e.target.closest("input,select,textarea,button,dialog")
      ) {
        e.preventDefault();
        togglePlay();
      }
    });
    window.addEventListener("pagehide", save);
    if ("mediaSession" in navigator) {
      const handlers = {
        play: () => audio.paused && togglePlay(),
        pause: () => audio.pause(),
        previoustrack: () => next(-1),
        nexttrack: () => next(),
        seekto: (d) => seek(d.seekTime),
        seekbackward: (d) => seek(audio.currentTime - (d.seekOffset || 10)),
        seekforward: (d) => seek(audio.currentTime + (d.seekOffset || 10)),
      };
      for (const [action, fn] of Object.entries(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(action, fn);
        } catch (_) {}
      }
    }
  }
  function initFirebase() {
    try {
      if (!firebase.apps.length) firebase.initializeApp(config);
      s.db = firebase.database();
      s.db.ref(META).on(
        "value",
        (snap) => {
          const previous = s.activePlaylist;
          s.playlists = [];
          snap.forEach((child) => {
            const p = { ...child.val(), id: child.key };
            if (canAccess(p)) s.playlists.push(p);
          });
          if (!s.playlists.some((p) => p.id === DEFAULT))
            s.playlists.unshift({
              id: DEFAULT,
              title: "Общий плейлист",
              scope: "shared",
            });
          s.playlists.sort((a, b) =>
            a.id === DEFAULT
              ? -1
              : b.id === DEFAULT
                ? 1
                : String(a.title).localeCompare(String(b.title), "ru"),
          );
          if (!s.playlists.some((p) => p.id === s.activePlaylist))
            s.activePlaylist = DEFAULT;
          if (previous !== s.activePlaylist || !s.subscription) bindTracks();
          renderPlaylists();
        },
        () => notice("Не удалось загрузить плейлисты", true),
      );
    } catch (_) {
      notice("Плейлисты недоступны. Поиск музыки продолжает работать.", true);
    }
  }
  // Discard snapshots from the removed provider rather than reviving it on refresh.
  try {
    localStorage.removeItem("musicPlaybackStateV1");
  } catch (_) {}
  s.playlists = [{ id: DEFAULT, title: "Общий плейлист", scope: "shared" }];
  const restored = read(STORAGE, null);
  if (restored?.track) {
    s.current = normalize(restored.track, restored.track.key);
    s.queue = (restored.queue || [])
      .map((t) => normalize(t, t.key))
      .filter(Boolean);
    s.index = Number(restored.index) || 0;
  }
  audio.volume = Math.min(1, Math.max(0, Number(settings.volume ?? 0.85)));
  $("volume").value = String(audio.volume);
  bindEvents();
  initFirebase();
  renderPlaylists();
  currentUi();
  syncPlayback();
  updateProgress();
  if (s.current)
    play(s.current, { resume: Number(restored?.time || 0), autoplay: false });
})();
