'use client';

import React, { useEffect, useState } from 'react';
import {
  detectUserHardware,
  isNamedGraphicsCard,
} from '@/lib/hardwareDetector';
import { CPU_CATALOG, GPU_CATALOG, cpuGroup, gpuGroup } from '@/lib/hardwareCatalog';
import type { DeviceKind } from '@/lib/hardwareCatalog';
import HardwareGuideModal from '@/components/HardwareGuideModal';
import type { UserHardwareSpec } from '@/lib/hardwareDetector';
import type { SteamGameDetails, SteamSearchResultItem } from '@/lib/steamParser';
import { FEATURED_GAMES, SEARCH_SUGGESTIONS, steamCapsuleUrl } from '@/lib/featuredGames';
import { getNonSteamGame, searchNonSteamGames } from '@/lib/nonSteamGames';
import type { NonSteamGame, NonSteamSearchResultItem } from '@/lib/nonSteamGames';
import { analyzeGameCompatibility } from '@/lib/comparator';
import { GAMES_DATABASE } from '@/data/hardwareAndGames';
import { steamRequirementToHardware } from '@/lib/steamCompatibility';

type SearchGameResult =
  | { source: 'steam'; item: SteamSearchResultItem }
  | { source: 'local'; item: NonSteamSearchResultItem };

type SelectedGame =
  | (SteamGameDetails & { source: 'steam'; sourceLabel: 'Steam' })
  | (NonSteamGame & { source: 'local'; sourceLabel: string });

function getSteamCountryCode(): string {
  if (typeof navigator === 'undefined') return 'US';
  const region = navigator.language.match(/[-_]([A-Z]{2})$/i)?.[1];
  return region?.toUpperCase() || 'US';
}

function formatSteamSearchPrice(price: SteamSearchResultItem['price']): string {
  if (!price || price.final === 0) return 'Free';
  return price.final_formatted || `${price.currency} ${(price.final / 100).toFixed(2)}`;
}

/* ─── Icon SVGs (no emoji-as-icon per UI checklist) ──────── */
const IconCpu = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>
  </svg>
);
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
  </svg>
);
const IconWarn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);

function getCatalogProgress(model: string, catalog: string[]): number {
  const index = catalog.indexOf(model);
  if (index < 0 || catalog.length <= 1) return 0;
  return Math.round(100 - (index / (catalog.length - 1)) * 100);
}

function getRamProgress(ram: number): number {
  const minimumRam = 4;
  const maximumRam = 64;
  return Math.round(Math.min(100, Math.max(0, ((ram - minimumRam) / (maximumRam - minimumRam)) * 100)));
}

const HW_STORAGE_KEY = 'can-it-run-it:hardware';

type SavedHardware = {
  deviceKind: DeviceKind;
  cpu: string;
  gpu: string;
  ram: number;
  gpuGuideUnlocked: boolean;
};

function loadSavedHardware(): SavedHardware | null {
  try {
    const raw = localStorage.getItem(HW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedHardware;
    if (parsed.deviceKind !== 'pc' && parsed.deviceKind !== 'laptop') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveHardware(payload: SavedHardware) {
  try {
    localStorage.setItem(HW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export default function Home() {
  /* ── Hardware state ─────────────────────────────────────── */
  const [hardware, setHardware] = useState<UserHardwareSpec | null>(null);
  const [deviceKind, setDeviceKind] = useState<DeviceKind>('pc');
  const [activeGpu, setActiveGpu] = useState<string>('');
  const [activeCpu, setActiveCpu] = useState<string>('');
  const [activeRam, setActiveRam] = useState<number>(8);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [gpuGuideUnlocked, setGpuGuideUnlocked] = useState<boolean>(false);
  const [guideSeen, setGuideSeen] = useState<boolean>(false);
  const [hwReady, setHwReady] = useState<boolean>(false);

  /* ── Steam search state ─────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchGameResult[]>([]);
  const [selectedGame, setSelectedGame] = useState<SelectedGame | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const compatibilityTarget = selectedGame
    ? selectedGame.source === 'local'
      ? {
          id: selectedGame.id,
          name: selectedGame.name,
          genre: 'Publisher catalog',
          minimum: selectedGame.benchmark.minimum,
          recommended: selectedGame.benchmark.recommended ?? selectedGame.benchmark.minimum,
        }
      : GAMES_DATABASE.find((game) => game.name.toLowerCase() === selectedGame.name.toLowerCase()) ?? (() => {
          const minimum = steamRequirementToHardware(selectedGame.minimum);
          const recommended = steamRequirementToHardware(selectedGame.recommended ?? selectedGame.minimum);
          return minimum && recommended
            ? {
                id: `steam:${selectedGame.id}`,
                name: selectedGame.name,
                genre: selectedGame.genres?.join(' / ') || 'Steam game',
                minimum,
                recommended,
              }
            : undefined;
        })()
    : undefined;
  const compatibilityReport = hardware && activeGpu && activeCpu && compatibilityTarget
    ? analyzeGameCompatibility(
        { ...hardware, gpuCleaned: activeGpu, cpuName: activeCpu, ramGB: activeRam },
        compatibilityTarget,
      )
    : null;

  /* ── Init ──────────────────────────────────────────────── */
  useEffect(() => {
    const specs = detectUserHardware();
    setHardware(specs);
    setGuideSeen(window.localStorage.getItem('can-it-run-it:hardware-guide-seen') === 'true');
    const saved = loadSavedHardware();
    const kind = saved?.deviceKind ?? 'pc';
    setDeviceKind(kind);

    if (saved) {
      setActiveCpu(saved.cpu || '');
      setActiveRam(saved.ram > 0 ? saved.ram : specs.ramGB);
      setGpuGuideUnlocked(Boolean(saved.gpuGuideUnlocked));
      if (saved.gpu) {
        setActiveGpu(saved.gpu);
      } else if (isNamedGraphicsCard(specs.gpuCleaned)) {
        setActiveGpu(specs.gpuCleaned);
        setGpuGuideUnlocked(true);
      } else {
        setActiveGpu('');
      }
    } else {
      if (isNamedGraphicsCard(specs.gpuCleaned)) {
        setActiveGpu(specs.gpuCleaned);
        setGpuGuideUnlocked(true);
      } else {
        setActiveGpu('');
      }
      setActiveCpu('');
      setActiveRam(specs.ramGB);
    }
    setHwReady(true);
  }, []);

  useEffect(() => {
    if (!hwReady) return;
    saveHardware({
      deviceKind,
      cpu: activeCpu,
      gpu: activeGpu,
      ram: activeRam,
      gpuGuideUnlocked,
    });
  }, [hwReady, deviceKind, activeCpu, activeGpu, activeRam, gpuGuideUnlocked]);

  /* ── Steam API ─────────────────────────────────────────── */
  const searchSteamGames = async (term: string) => {
    if (!term.trim()) return;
    setHasSearched(true);
    setIsSearching(true);
    setSearchError(null);
    const localResults = searchNonSteamGames(term);
    setSearchResults(localResults.map((item) => ({ source: 'local' as const, item })));
    try {
      const countryCode = getSteamCountryCode();
      const res = await fetch(`/api/steam/search?term=${encodeURIComponent(term.trim())}&cc=${countryCode}`);
      const data = await res.json();
      if (res.ok) {
        const steamResults: SearchGameResult[] = (data.items || []).map((item: SteamSearchResultItem) => ({
          source: 'steam',
          item,
        }));
        setSearchResults([...localResults.map((item) => ({ source: 'local' as const, item })), ...steamResults]);
        if (localResults.length > 0) {
          selectLocalGame(localResults[0].id);
        } else if (steamResults.length > 0 && steamResults[0].source === 'steam') {
          loadGameDetails(steamResults[0].item.id);
        }
      } else {
        setSearchError(data.error || 'Steam search is unavailable. Local results are still shown.');
      }
    } catch {
      setSearchError('Unable to connect to Steam. Local results are still shown.');
    } finally {
      setIsSearching(false);
    }
  };

  const loadGameDetails = async (appId: number) => {
    setSelectedGame(null);
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/steam/details?appId=${appId}&cc=${getSteamCountryCode()}`);
      const data = await res.json();
      if (res.ok && data.game) setSelectedGame({ ...data.game, source: 'steam', sourceLabel: 'Steam' });
    } catch {
      setSearchError('Unable to load Steam game details.');
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const selectLocalGame = (id: string) => {
    const game = getNonSteamGame(id);
    if (!game) {
      setSearchError('The selected local game is no longer available.');
      return;
    }
    setIsLoadingDetails(false);
    setSelectedGame({ ...game, source: 'local', sourceLabel: game.sourceLabel });
  };

  const gpuGuessIsCard = hardware ? isNamedGraphicsCard(hardware.gpuCleaned) : false;
  const gpuNeedsGuide = Boolean(hardware) && !gpuGuessIsCard && !gpuGuideUnlocked;
  const handleGpuChange = (gpu: string) => {
    setActiveGpu(gpu);
    setGpuGuideUnlocked(true);
  };

  const openSpecGuide = () => {
    setIsGuideOpen(true);
  };

  const requestHardwareGuide = () => {
    if (guideSeen) return false;
    setIsGuideOpen(true);
    return true;
  };

  const cpuList = CPU_CATALOG;
  const gpuList = GPU_CATALOG;

  const cpuOptions = (() => {
    const list = [...cpuList];
    if (activeCpu && !list.includes(activeCpu)) list.unshift(activeCpu);
    return list;
  })();

  const gpuOptions = (() => {
    const list = [...gpuList];
    if (activeGpu && !list.includes(activeGpu)) list.unshift(activeGpu);
    return list;
  })();
  const gpuProgress = getCatalogProgress(activeGpu, GPU_CATALOG);
  const cpuProgress = getCatalogProgress(activeCpu, CPU_CATALOG);
  const ramProgress = getRamProgress(activeRam);

  /* ─────────────────────── RENDER ─────────────────────── */
  return (
    <main className="landing-shell min-h-screen">
      <div className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 xl:px-10 py-5 md:py-7 space-y-7">

        {/* ─── HEADER ──────────────────────────────────────── */}
        <header className="landing-nav flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            {/* Logo / wordmark */}
            <div className="flex items-center gap-3 mb-1.5">
              <img src="/logo.png" alt="Can my rig run it?" className="site-logo" />
              <div>
                <h1 className="brand-title font-display text-xl md:text-2xl font-bold leading-none tracking-wide">
                  Can my rig run it?
                </h1>
                <p className="text-[10px] tracking-[0.16em] uppercase mt-0.5"
                  style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display), monospace' }}>
                  Game spec requirement checker
                </p>
              </div>
            </div>
          </div>
          <a
            className="footer-icon footer-github self-end md:self-auto"
            href="https://github.com/tdk211108"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Knjr on GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.93c.46.08.62-.2.62-.44v-1.7c-2.52.55-3.05-1.07-3.05-1.07-.42-1.07-1.02-1.35-1.02-1.35-.84-.57.06-.56.06-.56.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.24-2.01-.23-4.13-1-4.13-4.48 0-.99.35-1.79.93-2.42-.1-.23-.4-1.16.08-2.4 0 0 .76-.24 2.5.92A8.7 8.7 0 0 1 12 7.4c.78 0 1.55.1 2.28.3 1.75-1.16 2.5-.92 2.5-.92.48 1.24.18 2.17.09 2.4.57.63.92 1.43.92 2.42 0 3.49-2.13 4.24-4.15 4.47.33.28.62.82.62 1.66v2.47c0 .24.17.52.63.43A9.2 9.2 0 0 0 12 2.8Z"/>
            </svg>
          </a>
        </header>

        <section className="stripe-hero grid items-center gap-10 lg:grid-cols-[0.88fr_1.12fr]" aria-labelledby="hero-title">
          <div className="hero-copy anim-in">
            <p className="hero-eyebrow">PC game compatibility, made clear</p>
            <h2 id="hero-title" className="hero-title">
              Find your next game.<br />
              <span>Know your setup.</span>
            </h2>
            <p className="hero-subtitle">
              Compare your CPU, GPU, RAM with official requirements from publishers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="hero-primary" onClick={() => document.getElementById('hardware')?.scrollIntoView({ behavior: 'smooth' })}>
                Check my hardware <span aria-hidden="true">→</span>
              </button>
              <button type="button" className="hero-secondary" onClick={openSpecGuide}>
                Which hardware model I have? <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="hero-visual anim-in anim-in-delay-1" aria-label="Game catalog and hardware compatibility preview">
            <div className="hero-device">
              <div className="hero-device-top"><span /><span /><span /></div>
              <div className="hero-device-body">
                <div className="hero-game-grid">
                  {[
                    ['/hero-games/the-last-of-us-2.jpg', 'The Last of Us Part II Remastered'],
                    ['/hero-games/blackmyth.jpg', 'Black Myth: Wukong'],
                    ['/hero-games/eldenring.jpg', 'Elden Ring'],
                    ['/hero-games/god-of-war-ragnarok.jpg', 'God of War Ragnarök'],
                  ].map(([image, name], index) => (
                    <img
                      key={name}
                      className={`hero-game-image hero-game-image-${index + 1}`}
                      src={image}
                      alt={name}
                    />
                  ))}
                </div>
                <div className="hero-analysis-card">
                  <p>COMPATIBILITY</p>
                  <strong>Ready to compare</strong>
                  <div>
                    <span>GPU</span>
                    <i style={{ background: `linear-gradient(90deg, var(--ice) ${gpuProgress}%, rgba(255,255,255,.22) ${gpuProgress}%)` }} />
                    <b title={activeGpu || hardware?.gpuCleaned}>{activeGpu || hardware?.gpuCleaned || 'Choose model'}</b>
                  </div>
                  <div>
                    <span>CPU</span>
                    <i style={{ background: `linear-gradient(90deg, var(--ice) ${cpuProgress}%, rgba(255,255,255,.22) ${cpuProgress}%)` }} />
                    <b title={activeCpu}>{activeCpu || 'Choose model'}</b>
                  </div>
                  <div>
                    <span>RAM</span>
                    <i style={{ background: `linear-gradient(90deg, var(--ice) ${ramProgress}%, rgba(255,255,255,.22) ${ramProgress}%)` }} />
                    <b>{activeRam} GB</b>
                  </div>
                </div>
              </div>
            </div>
            <div className="hero-phone">
              <img src="/hero-games/cyberpunk-2077.jpg" alt="Cyberpunk 2077" />
              <span>YOUR LIBRARY</span>
              <strong>Play smarter</strong>
            </div>
          </div>
        </section>

        {/* ─── SECTION 1: HARDWARE ─────────────────────────── */}
        <section id="hardware" className="card relative z-20 p-5 md:p-6 space-y-5 anim-in">
          {/* Section heading */}
          <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <span className="dot-live" />
              <h2 className="font-display text-sm font-semibold tracking-wide uppercase"
                style={{ color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                Your Hardware
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* ── GPU ── */}
            <div className="card-elevated p-4 space-y-3">
              <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <RequirementIcon name="graphics" />
                <span className="text-[10px] uppercase tracking-widest font-medium">Graphics Card</span>
              </div>

              <p className="text-sm font-semibold break-words leading-snug"
                style={{ color: 'var(--amber-bright)', fontFamily: 'var(--font-display), monospace' }}>
                {activeGpu || (hardware ? hardware.gpuCleaned : 'Scanning...')}
              </p>

              {!gpuGuessIsCard && hardware && !activeGpu && (
                <div className="flex gap-2 p-2.5 rounded-lg text-[11px]"
                  style={{ background: 'rgba(129,140,248,0.10)', border: '1px solid var(--amber-border)' }}>
                  <span style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }}><IconWarn /></span>
                  <div>
                    <p className="font-semibold mb-0.5" style={{ color: 'var(--amber-bright)' }}>
                      GPU model not detected
                    </p>
                    <p style={{ color: 'var(--text-muted)' }}>
                      The browser reported “{hardware.gpuCleaned}”. Check the guide and choose your actual GPU below.
                    </p>
                  </div>
                </div>
              )}

              {gpuNeedsGuide ? (
                <button
                  type="button"
                  onClick={openSpecGuide}
                  className="btn-amber w-full py-2.5 rounded-lg text-xs cursor-pointer"
                >
                  Open the GPU identification guide
                </button>
              ) : (
                <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Select GPU
                  </label>
                  <HardwareCombobox
                    ariaLabel="Select graphics card"
                    placeholder="— Select graphics card —"
                    value={activeGpu}
                    options={gpuOptions}
                    groups={['NVIDIA', 'AMD', 'Intel', 'Khác']}
                    groupBy={gpuGroup}
                    onChange={handleGpuChange}
                    onBeforeOpen={requestHardwareGuide}
                  />
                </div>
              )}
            </div>

            {/* ── CPU ── */}
            <div className="card-elevated p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <IconCpu />
                  <span className="text-[10px] uppercase tracking-widest font-medium">Processor</span>
                </div>
              </div>

              <p className="text-sm font-semibold leading-snug"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display), monospace' }}>
                {activeCpu || 'Select a processor'}
              </p>

              <div className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Select processor
                </label>
                <HardwareCombobox
                  ariaLabel="Select processor"
                  placeholder="— Select processor —"
                  value={activeCpu}
                  options={cpuOptions}
                  groups={['Intel', 'AMD', 'Apple', 'Khác']}
                  groupBy={cpuGroup}
                  onChange={setActiveCpu}
                  onBeforeOpen={requestHardwareGuide}
                />
              </div>
            </div>

            {/* ── RAM ── */}
            <div className="card-elevated p-4 space-y-3">
              <div className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <RequirementIcon name="memory" />
                <span className="text-[10px] uppercase tracking-widest font-medium">System Memory</span>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-bold" style={{ color: 'var(--amber-bright)' }}>
                  {activeRam}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>GB</span>
              </div>

              <p className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                {hardware?.isDefaultRam ? 'Privacy-rounded estimate' : 'Browser-reported estimate'}
              </p>

              {/* RAM buttons */}
              <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Adjust:</p>
                <div className="flex gap-1.5">
                  {[4, 8, 16, 32, 64].map((gb) => (
                    <button
                      key={gb}
                      onClick={() => setActiveRam(gb)}
                      className="flex-1 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-all"
                      style={
                        activeRam === gb
                          ? { background: 'var(--accent)', color: '#10143c', fontFamily: 'var(--font-display), monospace' }
                          : { background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }
                      }
                    >
                      {gb}G
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 2: STEAM SEARCH ─────────────────────── */}
        <section id="games" className="card relative z-10 p-5 md:p-6 space-y-5 anim-in anim-in-delay-1">
          <div className="pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="font-display text-sm font-semibold tracking-widest uppercase"
              style={{ color: 'var(--text-primary)' }}>
              Search Games
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Search Steam and curated publisher catalogs.
            </p>
          </div>

          {/* Search form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              searchSteamGames(searchQuery);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-subtle)' }}>
                <IconSearch />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cyberpunk 2077, Elden Ring, GTA V..."
                className="input-dark w-full rounded-xl pl-10 pr-4 py-3 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="btn-amber px-5 py-3 rounded-xl text-sm disabled:opacity-40 cursor-pointer"
            >
              {isSearching ? (
                <span className="font-display tracking-wide">Searching...</span>
              ) : (
                <span className="font-display tracking-wide">Search</span>
              )}
            </button>
          </form>

          {/* Quick tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
              Suggestions:
            </span>
            {SEARCH_SUGGESTIONS.map((name) => (
              <button
                key={name}
                onClick={() => { setSearchQuery(name); searchSteamGames(name); }}
                className="tag text-[11px] px-2.5 py-1 rounded-lg cursor-pointer"
              >
                {name}
              </button>
            ))}
          </div>

          {/* Error */}
          {searchError && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
              style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              <IconWarn />
              {searchError}
            </div>
          )}

          {/* Featured AAA when not searching */}
          {!hasSearched && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                Featured games
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {FEATURED_GAMES.map((game, i) => (
                  <button
                    key={game.id}
                    onClick={() => {
                      setSearchQuery(game.name);
                      loadGameDetails(game.id);
                    }}
                    className={`game-card flex flex-col text-left p-2.5 cursor-pointer${selectedGame?.id === game.id ? ' selected' : ''}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <img
                      src={steamCapsuleUrl(game.id)}
                      alt={game.name}
                      className="w-full h-[60px] object-cover rounded-md mb-2"
                      loading="lazy"
                    />
                    <span className="text-xs font-medium line-clamp-2 leading-snug"
                      style={{ color: selectedGame?.id === game.id ? 'var(--amber-bright)' : 'var(--text-primary)' }}>
                      {game.name}
                    </span>
                    <span className="text-[9px] mt-auto pt-1.5 font-mono"
                      style={{ color: 'var(--text-subtle)' }}>
                      #{game.id}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Results grid */}
          {searchResults.length > 0 && (
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {searchResults.length} results
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {searchResults.map((result, i) => {
                  const game = result.item;
                  const isLocal = result.source === 'local';
                  const gameId = game.id;
                  const selected = selectedGame?.id === gameId;
                  return (
                  <button
                    key={`${result.source}-${game.id}`}
                    onClick={() => result.source === 'local'
                      ? selectLocalGame(result.item.id)
                      : loadGameDetails(result.item.id)}
                    className={`game-card flex flex-col text-left p-2.5 cursor-pointer${selected ? ' selected' : ''}`}
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <img
                      src={result.source === 'local'
                        ? (result.item.imageUrl || '/game-placeholder.svg')
                        : result.item.tiny_image}
                      alt={game.name}
                      onError={(event) => {
                        event.currentTarget.onerror = null;
                        event.currentTarget.src = '/game-placeholder.svg';
                      }}
                      className="w-full h-[60px] object-cover rounded-md mb-2"
                      loading="lazy"
                    />
                    <span className="text-xs font-medium line-clamp-2 leading-snug"
                      style={{ color: selected ? 'var(--amber-bright)' : 'var(--text-primary)' }}>
                      {game.name}
                    </span>
                    <span className="text-[9px] mt-1 uppercase tracking-wider" style={{ color: 'var(--amber)' }}>
                      {result.source === 'local' ? result.item.sourceLabel : 'Steam'}
                    </span>
                    <span className="text-xs font-semibold mt-1" style={{ color: 'var(--amber-bright)' }}>
                      {result.source === 'local' ? 'Free' : formatSteamSearchPrice(result.item.price)}
                    </span>
                    <span className="text-[9px] mt-auto pt-1.5 font-mono"
                      style={{ color: 'var(--text-subtle)' }}>
                      {result.source === 'local' ? 'Local catalog' : `#${game.id}`}
                    </span>
                  </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* ─── LOADING SKELETON ────────────────────────────── */}
        {isLoadingDetails && (
          <div className="card p-8 flex items-center justify-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--amber)', animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--amber)', animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--amber)', animationDelay: '300ms' }} />
            <span className="text-sm ml-2" style={{ color: 'var(--text-muted)' }}>
              Loading game requirements...
            </span>
          </div>
        )}

        {/* ─── SECTION 3: GAME REQUIREMENTS ───────────────── */}
        {selectedGame && !isLoadingDetails && (
          <section className="card p-5 md:p-7 space-y-6 anim-in anim-in-delay-2">
            {/* Game header */}
            <div className="flex flex-col md:flex-row gap-5 pb-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <img
                src={selectedGame.source === 'steam'
                  ? selectedGame.headerImage
                  : selectedGame.imageUrl || '/game-placeholder.svg'}
                alt={selectedGame.name}
                onError={(event) => {
                  event.currentTarget.onerror = null;
                  event.currentTarget.src = '/game-placeholder.svg';
                }}
                className="w-full md:w-72 rounded-xl object-cover flex-shrink-0"
                style={{ border: '1px solid var(--border)', aspectRatio: '460/215' }}
              />
              <div className="space-y-3 flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-display text-xl md:text-2xl font-bold leading-tight"
                    style={{ color: 'var(--text-primary)' }}>
                    {selectedGame.name}
                  </h3>
                  {selectedGame.source === 'steam' && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg mt-0.5"
                      style={{ background: 'var(--amber-glow)', color: 'var(--amber-bright)', border: '1px solid var(--amber-border)' }}>
                      {Boolean(selectedGame.price?.discountPercent && selectedGame.price?.initialFormatted) && (
                        <span className="mr-1.5 line-through opacity-60">{selectedGame.price?.initialFormatted}</span>
                      )}
                      {selectedGame.price?.finalFormatted || selectedGame.priceFormatted || 'Price unavailable'}
                    </span>
                  )}
                </div>

                {selectedGame.source === 'steam' && selectedGame.shortDescription && (
                  <p className="text-sm line-clamp-3" style={{ color: 'var(--text-muted)' }}>
                    {selectedGame.shortDescription}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                  {selectedGame.source === 'steam' && selectedGame.developers?.length > 0 && (
                    <span><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Developer:</span> {selectedGame.developers.join(', ')}</span>
                  )}
                  {selectedGame.source === 'steam' && selectedGame.genres?.length > 0 && (
                    <span><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Genre:</span> {selectedGame.genres.join(', ')}</span>
                  )}
                  {selectedGame.source === 'steam' && selectedGame.releaseDate && (
                    <span><span className="font-semibold" style={{ color: 'var(--text-muted)' }}>Release:</span> {selectedGame.releaseDate}</span>
                  )}
                </div>

                <div className="pt-1">
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-subtle)' }}>
                    {selectedGame.source === 'steam' ? `Steam AppID #${selectedGame.id}` : `Source: ${selectedGame.sourceLabel}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Requirements columns */}
            <div>
              <h4 className="font-display text-xs uppercase tracking-widest mb-4"
                style={{ color: 'var(--text-muted)' }}>
                PC System Requirements
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Minimum */}
                <ReqColumn
                  label="Minimum"
                  req={selectedGame.minimum}
                  accentColor="var(--amber)"
                  accentBright="var(--amber-bright)"
                  accentBg="rgba(129,140,248,0.10)"
                  accentBorder="rgba(165,180,252,0.28)"
                  emptyText="Minimum requirements are not available."
                />
                {/* Recommended */}
                <ReqColumn
                  label="Recommended"
                  req={selectedGame.recommended}
                  accentColor="#22c55e"
                  accentBright="#4ade80"
                  accentBg="rgba(34,197,94,0.06)"
                  accentBorder="rgba(34,197,94,0.2)"
                  emptyText="Recommended requirements are not provided."
                />
              </div>

              <p className="text-[10px] mt-4 text-center" style={{ color: 'var(--text-subtle)' }}>
                  Official publisher data · Comparison uses the ranked CPU/GPU catalogs when both requirements can be matched.
              </p>
            </div>

            {compatibilityReport && (
              <CompatibilityPanel report={compatibilityReport} />
            )}
              {!compatibilityReport && (
                <div className="card-elevated p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  {!activeCpu || !activeGpu
                    ? 'Select your CPU and GPU above to compare your system and receive performance advice.'
                    : selectedGame.source === 'steam'
                      ? 'This game requirement could not be matched to the ranked CPU/GPU catalogs yet, so a reliable comparison is not available.'
                      : 'Compatibility data is not available for this game.'}
                </div>
              )}
          </section>
        )}

        <footer className="site-footer" aria-label="Site footer">
          <div className="footer-contact">
            <a className="footer-icon footer-github" href="https://github.com/tdk211108" target="_blank" rel="noreferrer" aria-label="Visit Knjr on GitHub">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8a9.2 9.2 0 0 0-2.9 17.93c.46.08.62-.2.62-.44v-1.7c-2.52.55-3.05-1.07-3.05-1.07-.42-1.07-1.02-1.35-1.02-1.35-.84-.57.06-.56.06-.56.93.07 1.42.96 1.42.96.83 1.42 2.17 1.01 2.7.77.08-.6.32-1.01.59-1.24-2.01-.23-4.13-1-4.13-4.48 0-.99.35-1.79.93-2.42-.1-.23-.4-1.16.08-2.4 0 0 .76-.24 2.5.92A8.7 8.7 0 0 1 12 7.4c.78 0 1.55.1 2.28.3 1.75-1.16 2.5-.92 2.5-.92.48 1.24.18 2.17.09 2.4.57.63.92 1.43.92 2.42 0 3.49-2.13 4.24-4.15 4.47.33.28.62.82.62 1.66v2.47c0 .24.17.52.63.43A9.2 9.2 0 0 0 12 2.8Z"/></svg>
            </a>
            <span>Mail: trinhduykhoa2008@gmail.com</span>
          </div>
          <p>© 2026 Knjr. All rights reserved.</p>
        </footer>

      </div>

      <HardwareGuideModal
        isOpen={isGuideOpen}
        onClose={() => {
          setIsGuideOpen(false);
          setGuideSeen(true);
          setGpuGuideUnlocked(true);
        }}
      />
    </main>
  );
}

function CompatibilityPanel({
  report,
}: {
  report: ReturnType<typeof analyzeGameCompatibility>;
}) {
  const statusLabel = report.overallStatus === 'CAN_RUN_RECOMMENDED'
    ? 'Recommended settings'
    : report.overallStatus === 'CAN_RUN_MINIMUM'
      ? 'Minimum settings'
      : 'Below minimum';
  const progressColor = report.overallStatus === 'CAN_RUN_RECOMMENDED'
    ? '#4ade80'
    : report.overallStatus === 'CAN_RUN_MINIMUM'
      ? 'var(--amber-bright)'
      : '#f87171';

  return (
    <div className="card-elevated p-5 space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>
            Compatibility estimate
          </p>
          <h4 className="font-display text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {statusLabel}
          </h4>
        </div>
        <span className="font-display text-2xl font-bold" style={{ color: 'var(--amber-bright)' }}>
          {report.overallMatchPercent}%
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label="Overall compatibility"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={report.overallMatchPercent}
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, Math.max(0, report.overallMatchPercent))}%`,
            background: progressColor,
          }}
        />
      </div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{report.advice.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[report.recommendedEvaluation.gpu, report.recommendedEvaluation.ram, report.recommendedEvaluation.cpu].map((item) => (
          <div key={item.name} className="rounded-lg px-3 py-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>{item.name.replace(' Performance', '')}</p>
            <p className="text-xs font-semibold" style={{ color: item.status === 'PASS' ? '#4ade80' : '#f87171' }}>
              {item.status} · {Math.min(100, item.percentMatch)}%
            </p>
          </div>
        ))}
      </div>
      <ul className="space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
        {report.advice.details.map((detail) => <li key={detail}>• {detail}</li>)}
      </ul>
    </div>
  );
}

/* ─── ReqColumn component (co-located, small & focused) ──── */
type ParsedReq = {
  graphics?: string;
  processor?: string;
  memory?: string;
  storage?: string;
  os?: string;
  directX?: string;
};

function ReqColumn({
  label,
  req,
  accentColor,
  accentBright,
  accentBg,
  accentBorder,
  emptyText,
}: {
  label: string;
  req: ParsedReq | null | undefined;
  accentColor: string;
  accentBright: string;
  accentBg: string;
  accentBorder: string;
  emptyText: string;
}) {
  const rows: { icon: RequirementIconName; key: keyof ParsedReq; label: string }[] = [
    { icon: 'graphics', key: 'graphics', label: 'Graphics' },
    { icon: 'processor', key: 'processor', label: 'Processor' },
    { icon: 'memory', key: 'memory', label: 'Memory' },
    { icon: 'storage', key: 'storage', label: 'Storage' },
    { icon: 'os', key: 'os', label: 'OS' },
    { icon: 'directX', key: 'directX', label: 'DirectX' },
  ];

  return (
    <div className="card-elevated p-5 space-y-4">
      {/* Column header */}
      <div className="flex items-center gap-2 pb-3" style={{ borderBottom: `1px solid ${accentBorder}` }}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accentColor }} />
        <h5 className="font-display text-xs uppercase tracking-widest font-semibold"
          style={{ color: accentBright }}>
          {label}
        </h5>
      </div>

      {req ? (
        <div className="space-y-2">
          {rows.map(({ icon, key, label: rowLabel }) => {
            const val = req[key];
            if (!val) return null;
            return (
              <div key={key} className="rounded-lg px-3 py-2.5"
                style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
                <div className="flex gap-2 items-baseline">
                  <span className="text-[10px] flex-shrink-0" style={{ color: accentColor }}>
                    <RequirementIcon name={icon} />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: 'var(--text-subtle)' }}>{rowLabel}</p>
                    <p className="text-xs font-medium leading-snug" style={{ color: 'var(--text-primary)' }}>{val}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs py-4 text-center" style={{ color: 'var(--text-subtle)' }}>
          {emptyText}
        </p>
      )}
    </div>
  );
}

type RequirementIconName = 'graphics' | 'processor' | 'memory' | 'storage' | 'os' | 'directX';

function RequirementIcon({ name }: { name: RequirementIconName }) {
  const commonProps = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'graphics':
    return <svg {...commonProps}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="9" cy="12" r="3" /><circle cx="9" cy="12" r="1" /><path d="M9 9v2M11.6 13.5l-1.7-1M6.4 13.5l1.7-1M6 2v4M12 2v4M18 2v4M6 18v4M12 18v4M18 18v4" /></svg>;
    case 'processor':
      return <svg {...commonProps}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4" /><rect x="10" y="10" width="4" height="4" /></svg>;
    case 'memory':
      return <svg {...commonProps}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 2v4M10 2v4M14 2v4M18 2v4M6 18v4M10 18v4M14 18v4M18 18v4" /></svg>;
    case 'storage':
      return <svg {...commonProps}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 16h.01M12 16h.01M16 16h.01" /></svg>;
    case 'os':
      return <svg {...commonProps}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4M7 8h10M7 12h6" /></svg>;
    case 'directX':
      return <svg {...commonProps}><path d="m12 3 2.3 5.1L20 10l-4.2 3.8L17 19l-5-2.8L7 19l1.2-5.2L4 10l5.7-1.9L12 3Z" /><path d="M12 8v4l3 2" /></svg>;
  }
}

function HardwareCombobox({
  ariaLabel,
  placeholder,
  value,
  options,
  groups,
  groupBy,
  onChange,
  onBeforeOpen,
}: {
  ariaLabel: string;
  placeholder: string;
  value: string;
  options: string[];
  groups: string[];
  groupBy: (name: string) => string;
  onChange: (value: string) => void;
  onBeforeOpen?: () => boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const inputValue = value || '';
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    !normalizedQuery || option.toLowerCase().includes(normalizedQuery)
  );

  React.useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => {
          if (!isOpen && onBeforeOpen?.()) return;
          setIsOpen((open) => !open);
          setQuery('');
          setActiveIndex(0);
        }}
        className="input-dark w-full text-left text-xs rounded-lg px-3 py-2 pr-8"
        style={{ fontFamily: 'var(--font-display), monospace' }}
      >
        <span className={inputValue ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
          {inputValue || placeholder}
        </span>
        <span className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
          {isOpen ? '▴' : '▾'}
        </span>
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg p-2 shadow-2xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-listbox`}
            aria-activedescendant={filteredOptions[activeIndex]
              ? `${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-${activeIndex}`
              : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => filteredOptions.length ? (index + 1) % filteredOptions.length : 0);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => filteredOptions.length ? (index - 1 + filteredOptions.length) % filteredOptions.length : 0);
              } else if (event.key === 'Enter' && filteredOptions[activeIndex]) {
                event.preventDefault();
                onChange(filteredOptions[activeIndex]);
                setIsOpen(false);
                setQuery('');
                triggerRef.current?.focus();
              } else if (event.key === 'Escape') {
                setIsOpen(false);
                setQuery('');
                triggerRef.current?.focus();
              }
            }}
            placeholder={`Search ${ariaLabel.toLowerCase()}...`}
            className="input-dark w-full text-xs rounded-md px-2.5 py-2 mb-2"
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
          />
          <div
            id={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-listbox`}
            className="max-h-64 overflow-y-auto"
            role="listbox"
            aria-label={ariaLabel}
          >
            {groups.map((group) => {
              const groupOptions = filteredOptions.filter((option) => groupBy(option) === group);
              if (groupOptions.length === 0) return null;
              return (
                <div key={group}>
                  <p className="px-2 py-1 text-[9px] uppercase tracking-widest"
                    style={{ color: 'var(--amber)' }}>
                    {group}
                  </p>
                  {groupOptions.map((option) => {
                    const optionIndex = filteredOptions.indexOf(option);
                    const isActive = optionIndex === activeIndex;
                    return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={option === value}
                      id={`${ariaLabel.replace(/\s+/g, '-').toLowerCase()}-${optionIndex}`}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                        setQuery('');
                        triggerRef.current?.focus();
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs cursor-pointer"
                      style={{
                        color: option === value ? 'var(--amber-bright)' : 'var(--text-primary)',
                        background: isActive ? 'rgba(217,119,6,0.2)' : option === value ? 'rgba(217,119,6,0.12)' : 'transparent',
                      }}
                    >
                      {option}
                    </button>
                    );
                  })}
                </div>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="px-2 py-3 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                No matching model found.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
